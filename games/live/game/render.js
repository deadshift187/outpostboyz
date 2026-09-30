// All drawing for CLIMB OR DIE. Layout (1080x1920): 0-520 host camera (kept clear),
// 520-1640 game viewport, 1640-1920 feed + clip-card lane. Pixel look: 4x sprites,
// self-drawn bitmap font, flat-shaded procedural world in the spec palette.
import { PAL, VIEW_TOP, VIEW_BOT, LANE_TOP, TOWER_X0, TOWER_X1, TOWER_TOP, PH, KNOBS, ZONES, zoneAt, clamp, hash01 } from './consts.js';
import { text, textW, patchSprites, sprite, drawSprite, skyline, hulk, clouds, wallTile } from './art.js';
import { cablePos, gateOn } from './world.js';
import { fallDropM } from './climber.js';
import { EFFECT_NAMES, TEAM_COLOR, platformBadge } from './effects.js';
import { TITLES } from './store.js';

const VIEW_H = VIEW_BOT - VIEW_TOP;
// Grapheme-safe helpers: never split an emoji / surrogate pair when clipping names.
const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
const gr = (s) => (seg ? [...seg.segment(String(s))].map((g) => g.segment) : [...String(s)]);
const clipG = (s, n) => { const g = gr(s); return g.length > n ? g.slice(0, n - 1).join('') + '…' : String(s); };
const firstG = (s) => gr(s)[0] || '?';
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
const mix = (a, b, t) => { const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16); const c = (s) => Math.round(((A >> s) & 255) * (1 - t) + ((B >> s) & 255) * t); return `rgb(${c(16)},${c(8)},${c(0)})`; };

// Gift legend: 8 s once every legendIntervalS (spec §0), first at 20 s.
export const LEGEND_T = 8;
export function legendPhase(t, iv) { const p = (t - 20) % iv; return t >= 20 && p < LEGEND_T ? { k: p } : null; }
// HOW TO PLAY strip: 4 plain-language tips, 3 s each, shown for 12 s once per legend
// interval (offset half a cycle from the legend) plus once right after start. Subtle by
// design (spec §0): no flashing, and it never tells anyone to gift for a team.
export const HOWTO_T = 12;
export function howToPhase(t, iv) {
  if (t >= 4 && t < 4 + HOWTO_T) return { k: t - 4 };
  const p = (t - 20 - iv / 2) % iv;
  return t >= 20 + iv / 2 && p < HOWTO_T ? { k: p } : null;
}

export function createRenderer({ W, H, transparent, getState, fmtH, ropeX, streamerKeys = true }) {
  let S, ctx, shx = 0, shy = 0;
  const sy = (y) => VIEW_BOT - (y - S.camY) + shy;
  const sx = (x) => x + shx;
  const onScreen = (y, pad = 200) => { const s = sy(y); return s > VIEW_TOP - pad && s < VIEW_BOT + pad; };

  function tagFor(owner) {
    if (!owner) return null;
    const t = S.titles && S.titles.get(owner.id);
    const T = t && TITLES[t];
    const team = owner.team || (S.teams.get(owner.id) || {}).team || 'help';
    return { color: T ? T.color : TEAM_COLOR[team] || PAL.help, prefix: platformBadge(owner.id) + (T ? T.prefix + '·' : '') };
  }
  function nameTag(label, owner, x, y, alpha = 1, colorOverride) {
    if (!label) return;
    const t = tagFor(owner) || { color: colorOverride || PAL.help, prefix: '' };
    if (owner && t.prefix && label.startsWith(t.prefix)) t.prefix = ''; // label already carries it
    const s = clipG(t.prefix + label, 24), hw = textW(s, 4) / 2 + 6;
    text(ctx, s, clamp(sx(x), hw, W - hw), y, { scale: 4, color: colorOverride || t.color, outline: 3, align: 'center', alpha }); // scale 4 = legible at phone 1/3 size
  }

  // ---------- background ----------
  function background() {
    const P = S.player, z = zoneAt(P.y), zi = z.id - 1;
    const f = clamp((P.y - z.from) / 5000, 0, 1);
    const next = ZONES[Math.min(4, zi + 1)];
    const blend = f > 0.85 ? (f - 0.85) / 0.15 : 0;
    const top = mix(z.sky[0], next.sky[0], blend), bot = mix(z.sky[1], next.sky[1], blend);
    const g = ctx.createLinearGradient(0, VIEW_TOP, 0, VIEW_BOT);
    g.addColorStop(0, top); g.addColorStop(1, bot);
    ctx.fillStyle = g; ctx.fillRect(0, VIEW_TOP, W, VIEW_H);
    if (S.level > 0) { ctx.fillStyle = hexA(PAL.sab, 0.05 * S.level); ctx.fillRect(0, VIEW_TOP, W, VIEW_H); } // ALERT LEVEL tint
    // storm clouds (far)
    const cl = clouds(z.id);
    if (cl) for (let k = -1; k < 4; k++) { const y = VIEW_TOP + ((S.camY * 0.08 + k * 360) % 1440 + 1440) % 1440 - 300; const dx = (S.realT * 12) % W; ctx.drawImage(cl, -dx, y); ctx.drawImage(cl, W - dx, y); }
    // robot hulks (mid)
    for (let k = 0; k < 12; k++) {
      const wy = k * 2600 + 600, s = VIEW_BOT - (wy - S.camY * 0.35) * 1;
      if (s < VIEW_TOP - 700 || s > VIEW_BOT + 50) continue;
      const hc = hulk(k); if (hc) { ctx.globalAlpha = 0.55; ctx.drawImage(hc, (k % 2 ? 620 : -60), s - 700); ctx.globalAlpha = 1; }
    }
    // dead-city skyline near the ground
    const sk = skyline(); const skY = VIEW_BOT - 420 + S.camY * 0.25 + 160;
    if (sk && skY < VIEW_BOT) ctx.drawImage(sk, 0, skY);
  }

  function towerWall() {
    const first = Math.floor(Math.max(0, S.camY - 200) / 1000), last = Math.floor((S.camY + VIEW_H + 200) / 1000);
    for (let c = first; c <= last && c < 25; c++) {
      const tile = wallTile(Math.floor(c / 5) + 1);
      const y = sy((c + 1) * 1000);
      ctx.globalAlpha = transparent ? 0.55 : 0.8;
      if (tile) ctx.drawImage(tile, sx(TOWER_X0), y);
      ctx.globalAlpha = 1;
      // zone LEDs / lamps animated on top of the cached tile
      const z = Math.floor(c / 5) + 1;
      if (z === 2) for (let i = 0; i < 30; i++) { const on = hash01(c, i, Math.floor(S.realT * 2 + i)) < 0.6; if (on) { ctx.fillStyle = i % 5 ? PAL.help : PAL.sab; ctx.fillRect(sx(TOWER_X0 + 30 + (i % 5) * 188 + 100), y + 20 + Math.floor(i / 5) * 160, 8, 6); } }
      if (z === 1) for (let i = 0; i < 4; i++) { ctx.fillStyle = hexA(PAL.sodium, 0.12 + 0.05 * Math.sin(S.realT * 3 + i)); ctx.beginPath(); ctx.arc(sx(TOWER_X0 + 123 + i * 230), y + 40 + i * 240, 70, 0, 7); ctx.fill(); }
    }
    // side girders in the 70 px margins
    for (const x0 of [0, TOWER_X1]) {
      ctx.fillStyle = PAL.ink; ctx.fillRect(sx(x0), VIEW_TOP, 70, VIEW_H);
      ctx.fillStyle = PAL.rust;
      const off = ((S.camY % 160) + 160) % 160;
      for (let y = VIEW_TOP - 160 + off; y < VIEW_BOT; y += 160) { ctx.fillRect(sx(x0 + 8), y, 54, 10); ctx.fillRect(sx(x0 + 8), y, 10, 160); ctx.fillStyle = PAL.rustDark; ctx.fillRect(sx(x0 + 18), y + 10, 44, 150); ctx.fillStyle = PAL.rust; }
    }
  }

  // ---------- world objects ----------
  function platform(p) {
    const y = sy(p.y);
    if (y < VIEW_TOP - 60 || y > VIEW_BOT + 60) return;
    if (!p.alive) { if (p.respawnT > 0) { ctx.strokeStyle = hexA(PAL.bone, 0.18); ctx.lineWidth = 3; ctx.setLineDash([8, 8]); ctx.strokeRect(sx(p.x), y, p.w, 26); ctx.setLineDash([]); } return; }
    let x = sx(p.x);
    if (p.crumbleT >= 0) x += Math.sin(S.realT * 90) * 3;
    const z = zoneAt(p.y);
    const fade = p.ttl !== Infinity && p.ttl < 1.5 ? (Math.floor(p.ttl * 8) % 2 ? 0.45 : 1) : 1;
    ctx.globalAlpha = fade;
    switch (p.kind) {
      case 'ground':
        ctx.fillStyle = PAL.rustDark; ctx.fillRect(x, y, p.w, VIEW_BOT - y + 40);
        ctx.fillStyle = PAL.rust; ctx.fillRect(x, y, p.w, 8);
        for (let i = 0; i < p.w; i += 64) { ctx.fillStyle = PAL.ink; ctx.fillRect(x + i + 20, y + 24, 22, 10); }
        break;
      case 'plank':
        ctx.fillStyle = PAL.rustLight; ctx.fillRect(x, y, p.w, 22); ctx.fillStyle = PAL.sodium; ctx.fillRect(x, y, p.w, 6);
        ctx.fillStyle = PAL.ink; for (let i = 14; i < p.w; i += 38) ctx.fillRect(x + i, y + 10, 4, 4);
        nameTag(p.tag, p.owner, p.x + p.w / 2, y - 34, fade);
        break;
      case 'pad': {
        ctx.fillStyle = PAL.help; ctx.fillRect(x, y - 4, p.w, 20); ctx.fillStyle = PAL.bone; ctx.fillRect(x + 6, y - 4, p.w - 12, 5);
        const hx = x + p.w / 2 - 12, hy = y - 30 + Math.sin(S.realT * 8) * 3; ctx.fillStyle = PAL.sab;
        ctx.fillRect(hx, hy, 8, 8); ctx.fillRect(hx + 16, hy, 8, 8); ctx.fillRect(hx - 4, hy + 4, 32, 8); ctx.fillRect(hx, hy + 12, 24, 6); ctx.fillRect(hx + 6, hy + 18, 12, 4);
        nameTag(p.tag, p.owner, p.x + p.w / 2, y - 64, fade);
        break;
      }
      case 'stair':
        ctx.fillStyle = PAL.machine; ctx.fillRect(x, y, p.w, 20); ctx.fillStyle = PAL.bone; ctx.fillRect(x, y, p.w, 4);
        ctx.fillStyle = PAL.ink; ctx.fillRect(x + 10, y + 20, 8, 60); ctx.fillRect(x + p.w - 18, y + 20, 8, 60);
        if (p.tag) nameTag(p.tag, p.owner, p.x + p.w / 2, y - 34, fade);
        break;
      case 'rung':
        ctx.fillStyle = PAL.rust; ctx.fillRect(x, y, p.w, 14); ctx.fillStyle = PAL.bone; ctx.fillRect(x, y, p.w, 3);
        break;
      case 'beacon': case 'helipad': default: {
        const col = z.deco;
        ctx.fillStyle = PAL.ink; ctx.fillRect(x - 3, y - 3, p.w + 6, 32);
        ctx.fillStyle = col; ctx.fillRect(x, y, p.w, 26);
        ctx.fillStyle = hexA(PAL.bone, 0.35); ctx.fillRect(x, y, p.w, 5);
        ctx.fillStyle = hexA(PAL.rustLight, 0.55); for (let i = 0; i < p.w; i += 6) if (hash01(p.id, i) < 0.45) ctx.fillRect(x + i, y + 18, 6, 4 + Math.floor(hash01(i, p.id) * 6));
        ctx.fillStyle = PAL.ink; for (let i = 10; i < p.w - 6; i += 34) ctx.fillRect(x + i, y + 9, 5, 5);
        if (p.crumbly) { ctx.fillStyle = PAL.ink; ctx.fillRect(x + p.w * 0.3, y + 5, 4, 14); ctx.fillRect(x + p.w * 0.3 + 4, y + 12, 10, 3); ctx.fillRect(x + p.w * 0.7, y + 3, 3, 12); if (p.crumbleT >= 0) { ctx.fillStyle = hexA(PAL.sab, 0.5); ctx.fillRect(x, y, p.w, 26); } }
        if (p.belt) { ctx.fillStyle = PAL.help; const o = ((S.t * p.belt) % 30 + 30) % 30; for (let i = -30; i < p.w; i += 30) { const bx = x + i + o; if (bx > x && bx < x + p.w - 12) { ctx.fillRect(bx, y + 8, 12, 4); ctx.fillRect(bx + (p.belt > 0 ? 8 : 0), y + 5, 4, 10); } } }
        if (p.kind === 'helipad') { ctx.fillStyle = PAL.bone; ctx.fillRect(x + p.w / 2 - 30, y + 5, 8, 16); ctx.fillRect(x + p.w / 2 + 22, y + 5, 8, 16); ctx.fillRect(x + p.w / 2 - 22, y + 11, 44, 5); }
        if (p.kind === 'beacon' && p.tag) nameTag(p.tag, p.owner, p.x + p.w / 2, y - 200, 1);
      }
    }
    if (p.grease > 0) { ctx.fillStyle = 'rgba(20,16,30,0.75)'; ctx.fillRect(x, y - 3, p.w, 10); ctx.fillStyle = hexA(PAL.bone, 0.5); for (let i = 8; i < p.w; i += 26) ctx.fillRect(x + i, y + 7, 4, 6 + (i % 3) * 4); }
    ctx.globalAlpha = 1;
  }

  function beacons() {
    for (const b of S.beacons) {
      if (b.y <= 0 || !onScreen(b.y, 300)) continue;
      const x = sx(b.x), y = sy(b.y);
      ctx.fillStyle = PAL.ink; ctx.fillRect(x - 6, y - 150, 12, 150);
      ctx.fillStyle = PAL.machine; ctx.fillRect(x - 3, y - 148, 6, 146);
      const on = b.banked, pulse = 0.6 + 0.4 * Math.sin(S.realT * 4);
      if (on) { ctx.fillStyle = hexA(PAL.help, 0.25 * pulse); ctx.beginPath(); ctx.arc(x, y - 160, 50, 0, 7); ctx.fill(); }
      ctx.fillStyle = on ? PAL.help : PAL.machine; ctx.fillRect(x - 14, y - 172, 28, 24);
      ctx.fillStyle = PAL.ink; ctx.fillRect(x - 8, y - 166, 16, 12);
      ctx.fillStyle = on ? PAL.bone : PAL.rustDark; ctx.fillRect(x - 4, y - 162, 8, 4);
      text(ctx, `${Math.round(b.y / 100)} M`, x, y - 204, { scale: 3, color: on ? PAL.help : PAL.bone, outline: 2, align: 'center' });
    }
    // active catch-net under the last banked beacon
    if (S.net && onScreen(S.net.y)) {
      const y = sy(S.net.y);
      ctx.strokeStyle = hexA(PAL.help, 0.55); ctx.lineWidth = 3;
      ctx.beginPath(); for (let x = TOWER_X0; x <= TOWER_X1; x += 40) { ctx.moveTo(sx(x), y); ctx.lineTo(sx(x + 20), y + 16); ctx.lineTo(sx(x + 40), y); } ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx(TOWER_X0), y); ctx.lineTo(sx(TOWER_X1), y); ctx.stroke();
    }
  }

  function posters() {
    for (const w of S.posters) {
      if (!onScreen(w.y, 300)) continue;
      const x = sx(w.x), y = sy(w.y) - 120;
      ctx.fillStyle = PAL.ink; ctx.fillRect(x - 104, y - 4, 208, 188);
      ctx.fillStyle = PAL.bone; ctx.fillRect(x - 100, y, 200, 180);
      text(ctx, w.state === 'nemesis' ? 'NEMESIS' : 'WANTED', x, y + 10, { scale: 3, color: PAL.rustDark, align: 'center' });
      ctx.fillStyle = PAL.rustDark; ctx.fillRect(x - 36, y + 40, 72, 64);
      ctx.fillStyle = PAL.sab; ctx.fillRect(x - 20, y + 58, 12, 8); ctx.fillRect(x + 8, y + 58, 12, 8);
      text(ctx, fitPx(w.name || '?', 3, 190), x, y + 112, { scale: 3, color: PAL.ink, align: 'center' });
      if (w.state === 'wanted') text(ctx, `${Math.max(0, Math.ceil(w.deadline - S.sessionT))}s`, x, y + 146, { scale: 3, color: PAL.sab, align: 'center' });
      else if (w.state === 'trophy') text(ctx, 'ESCAPED', x, y + 146, { scale: 3, color: PAL.rust, align: 'center' });
      else if (w.state === 'nemesis') text(ctx, fitPx(`${Math.round(S.nemesis ? S.nemesis.taken : 0)} M TAKEN`, 3, 190), x, y + 146, { scale: 3, color: PAL.rust, align: 'center' });
      if (w.state === 'busted') { ctx.save(); ctx.translate(x, y + 90); ctx.rotate(-0.3); text(ctx, 'BUSTED', 0, -12, { scale: 5, color: PAL.help, outline: 3, align: 'center' }); ctx.restore(); }
    }
  }

  function ladders() {
    for (const L of S.ladders) {
      const lx = sx(L.x + (L.sway ? L.sway * Math.sin(S.t * 1.6) : 0));
      const top = sy(L.top), bot = sy(L.bot);
      if (bot < VIEW_TOP || top > VIEW_BOT) continue;
      const a = L.ttl < 1.5 ? (Math.floor(L.ttl * 8) % 2 ? 0.4 : 1) : 1;
      ctx.globalAlpha = a;
      ctx.fillStyle = L.rope ? PAL.bone : PAL.machine;
      ctx.fillRect(lx - 30, top, 6, bot - top); ctx.fillRect(lx + 24, top, 6, bot - top);
      ctx.fillStyle = L.rope ? PAL.rust : PAL.bone;
      for (let y = top + 20; y < bot; y += 34) ctx.fillRect(lx - 26, y, 52, 6);
      ctx.globalAlpha = 1;
      if (L.tag) nameTag(L.tag, L.owner, L.x, Math.min(bot, VIEW_BOT - 40) - 30, a);
      else if (!L.owner) text(ctx, 'RESISTANCE', lx, Math.min(bot, VIEW_BOT - 40) - 30, { scale: 3, color: PAL.help, outline: 3, align: 'center' });
    }
  }

  function bird() {
    const rise = S.cine ? Math.max(0, S.cine.t - 0.8) * 260 : 0;
    const y = sy(TOWER_TOP + 300 + rise);
    if (y < VIEW_TOP - 200 || y > VIEW_BOT) return;
    const rx = sx(ropeX()), spr = sprite(Math.floor(S.realT * 4) % 2 ? 'bird' : 'bird2');
    ctx.strokeStyle = PAL.bone; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(rx, y + 90); ctx.lineTo(rx, sy(TOWER_TOP + rise)); ctx.stroke();
    ctx.fillStyle = PAL.help; ctx.fillRect(rx - 12, sy(TOWER_TOP + rise) - 6, 24, 12);
    if (spr) drawSprite(ctx, spr, rx - 110, y - 20, true);
    rotor(rx, y - 16, 170);
    text(ctx, 'BIRD-9', rx, y - 60, { scale: 3, color: PAL.help, outline: 3, align: 'center' });
  }
  function rotor(x, y, r) { ctx.fillStyle = hexA(PAL.bone, 0.55); const w = r * (0.6 + 0.4 * Math.abs(Math.sin(S.realT * 40))); ctx.fillRect(x - w, y, w * 2, 5); ctx.fillStyle = hexA(PAL.bone, 0.2); ctx.fillRect(x - r, y - 2, r * 2, 9); }

  function cables() {
    for (const c of S.cables) {
      if (!onScreen(c.ay, 400)) continue;
      const e = cablePos(c, S.t, S.hz);
      ctx.strokeStyle = PAL.ink; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(sx(c.ax), sy(c.ay)); ctx.lineTo(sx(e.x), sy(e.y)); ctx.stroke();
      ctx.strokeStyle = PAL.machine; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = PAL.ink; ctx.fillRect(sx(c.ax) - 16, sy(c.ay) - 10, 32, 14);
      ctx.fillStyle = PAL.sodium; ctx.fillRect(sx(e.x) - 12, sy(e.y) - 8, 24, 16); ctx.fillStyle = PAL.ink; ctx.fillRect(sx(e.x) - 6, sy(e.y) - 3, 12, 6);
    }
  }
  function gates() {
    for (const g of S.gates) {
      if (!onScreen(g.y)) continue;
      const y = sy(g.y), on = gateOn(g, S.t, S.hz);
      ctx.fillStyle = PAL.machine; ctx.fillRect(sx(g.x1) - 8, y - 30, 16, 60); ctx.fillRect(sx(g.x2) - 8, y - 30, 16, 60);
      if (on) { ctx.fillStyle = hexA(PAL.sab, 0.35); ctx.fillRect(sx(g.x1), y - 12, g.x2 - g.x1, 24); ctx.fillStyle = PAL.sab; ctx.fillRect(sx(g.x1), y - 4, g.x2 - g.x1, 8); ctx.fillStyle = PAL.bone; ctx.fillRect(sx(g.x1), y - 1, g.x2 - g.x1, 2); }
      else { ctx.fillStyle = hexA(PAL.sab, 0.3); for (let x = g.x1; x < g.x2; x += 24) ctx.fillRect(sx(x), y - 2, 10, 4); }
    }
  }
  function patrols(glow) {
    const spr = sprite('patrol');
    for (const d of S.patrols) {
      if (!onScreen(d.y)) continue;
      const y = sy(d.y) - 24 + Math.sin(S.realT * 6 + d.id) * 4;
      if (glow) { ctx.fillStyle = hexA(PAL.signalYellow, 0.4); ctx.beginPath(); ctx.arc(sx(d.x), y + 24, 50, 0, 7); ctx.fill(); }
      if (spr) drawSprite(ctx, spr, sx(d.x) - 32, y, d.dir < 0, d.stunned > 0 ? 0.5 : 1);
    }
  }

  // ---------- gift hazards ----------
  function hazards(glow) {
    const P = S.player, H = S.haz;
    for (const b of H.bolts) {
      if (b.tele > 0) { const k = 1 - b.tele / b.tele0; ctx.fillStyle = hexA(PAL.ink, 0.35 + 0.4 * k); ctx.beginPath(); ctx.ellipse(sx(b.x), sy(P.ground ? P.ground.y : P.y) + 4, 24 + 10 * k, 8, 0, 0, 7); ctx.fill(); nameTag('@' + b.user.nickname, { ...b.user, team: 'sab' }, b.x, VIEW_TOP + 30, 0.8, PAL.sab); continue; }
      if (glow) { ctx.fillStyle = hexA(PAL.sab, 0.5); ctx.beginPath(); ctx.arc(sx(b.x), sy(b.y) - 20, 36, 0, 7); ctx.fill(); }
      const spr = sprite('bolt'); if (spr) drawSprite(ctx, spr, sx(b.x) - 12, sy(b.y) - 40);
    }
    for (const d of H.drones) {
      const y = sy(d.y) - 24;
      if (glow) { ctx.fillStyle = hexA(PAL.sab, 0.45); ctx.beginPath(); ctx.arc(sx(d.x), y + 24, 56, 0, 7); ctx.fill(); }
      const spr = sprite('drone'); if (spr) drawSprite(ctx, spr, sx(d.x) - 32, y + Math.sin(S.realT * 20) * 2, d.x > P.x);
      nameTag('@' + d.user.nickname, { ...d.user, team: 'sab' }, d.x, y - 34, 1, PAL.sab);
    }
    for (const s of H.shoves) {
      const k = 1 - s.tele / s.tele0, x = sx(P.x - s.dir * 150), y = sy(P.y) - 60;
      ctx.fillStyle = hexA(PAL.sab, 0.5 + 0.5 * Math.sin(S.realT * 30));
      ctx.fillRect(x - 60, y - 14, 90, 28);
      ctx.beginPath(); ctx.moveTo(x + s.dir * 30 + (s.dir > 0 ? 0 : -0), y - 36); ctx.lineTo(x + s.dir * 80, y); ctx.lineTo(x + s.dir * 30, y + 36); ctx.fill();
      text(ctx, 'SHOVE', x - 15, y - 70 - 20 * k, { scale: 3, color: PAL.sab, outline: 3, align: 'center' });
      nameTag('@' + s.user.nickname, { ...s.user, team: 'sab' }, P.x - s.dir * 150, y + 44, 1, PAL.sab);
    }
    for (const m of H.meteors) {
      const k = 1 - m.tele / m.tele0, x = sx(m.x), y = sy(m.y), r = 190 - 110 * k;
      ctx.strokeStyle = PAL.sab; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - r - 30, y); ctx.lineTo(x - r + 30, y); ctx.moveTo(x + r - 30, y); ctx.lineTo(x + r + 30, y); ctx.moveTo(x, y - r - 30); ctx.lineTo(x, y - r + 30); ctx.moveTo(x, y + r - 30); ctx.lineTo(x, y + r + 30); ctx.stroke();
      // the meteor itself falls in over the lock time
      const my = VIEW_TOP - 80 + (y - VIEW_TOP + 80) * k * k;
      ctx.fillStyle = PAL.sodium; ctx.beginPath(); ctx.arc(x + 80 * (1 - k), my, 54, 0, 7); ctx.fill(); ctx.fillStyle = PAL.rustLight; ctx.beginPath(); ctx.arc(x + 80 * (1 - k) + 10, my + 8, 40, 0, 7); ctx.fill();
      ctx.fillStyle = PAL.rust; ctx.fillRect(x + 80 * (1 - k) - 10, my - 20, 16, 16);
      ctx.fillStyle = hexA(PAL.sodium, 0.4); for (let i = 1; i < 6; i++) ctx.fillRect(x + 80 * (1 - k) + i * 18 - 12, my - i * 40, 24 - i * 3, 24 - i * 3);
      text(ctx, 'METEOR LOCK', x, y - r - 60, { scale: 3, color: PAL.sab, outline: 3, align: 'center' });
      nameTag('@' + m.user.nickname, { ...m.user, team: 'sab' }, m.x, y + r + 16, 1, PAL.sab);
    }
    if (H.strike) { ctx.strokeStyle = hexA(PAL.bone, 0.5 + 0.5 * Math.sin(S.realT * 50)); ctx.lineWidth = 4; ctx.beginPath(); let x = sx(P.x), y = VIEW_TOP; ctx.moveTo(x, y); while (y < sy(P.y) - PH) { y += 50; x += (hash01(y, Math.floor(S.realT * 12)) - 0.5) * 60; ctx.lineTo(x, y); } ctx.stroke(); }
    for (const w of S.sweeps) {
      const y0 = sy(w.y + w.h), y1 = sy(w.y);
      if (y1 < VIEW_TOP - 100 || y0 > VIEW_BOT + 100) continue;
      if (w.tele > 0) {
        const blink = Math.floor(S.realT * 10) % 2;
        ctx.fillStyle = hexA(w.kind === 'cart' ? PAL.sodium : PAL.sab, blink ? 0.28 : 0.12); ctx.fillRect(sx(TOWER_X0), y0, TOWER_X1 - TOWER_X0, y1 - y0);
        const lbl = w.kind === 'cart' ? 'CART INCOMING' : w.kind === 'overseer' ? 'OVERSEER LASER' : 'SENTRY SWEEP';
        text(ctx, `${w.dir > 0 ? '→' : '←'} ${lbl} ${w.dir > 0 ? '→' : '←'}`, W / 2, y0 - 34, { scale: 3, color: w.kind === 'cart' ? PAL.sodium : PAL.sab, outline: 3, align: 'center' });
        continue;
      }
      if (w.kind === 'cart') { const spr = sprite('cart'); if (glow) { ctx.fillStyle = hexA(PAL.sodium, 0.45); ctx.fillRect(sx(w.x) - 90, y1 - 90, 180, 90); } if (spr) drawSprite(ctx, spr, sx(w.x) - 60, y1 - 55, w.dir < 0); if (w.user) nameTag('@' + w.user.nickname, { ...w.user, team: 'sab' }, w.x, y1 - 100, 1, PAL.sab); }
      else { ctx.fillStyle = hexA(PAL.sab, 0.35); ctx.fillRect(sx(w.x) - 70, y0, 140, y1 - y0); ctx.fillStyle = PAL.sab; ctx.fillRect(sx(w.x) - 8, y0 - 20, 16, y1 - y0 + 20); ctx.fillStyle = PAL.bone; ctx.fillRect(sx(w.x) - 3, y0 - 20, 6, y1 - y0 + 20); }
    }
    const F = S.fx;
    if (F.hk) {
      const spr = sprite('hk'), x = sx(F.hk.x), y = sy(F.hk.y + 250);
      if (glow) { ctx.fillStyle = hexA(PAL.sab, 0.4); ctx.beginPath(); ctx.arc(x, y + 110, 150, 0, 7); ctx.fill(); }
      if (spr) drawSprite(ctx, spr, x - 72, y + Math.sin(S.realT * 10) * 4);
      text(ctx, `HUNTER-KILLER ${Math.ceil(F.hk.t)}s`, x, Math.min(VIEW_BOT - 60, Math.max(VIEW_TOP + 90, y - 40)), { scale: 3, color: PAL.sab, outline: 3, align: 'center' });
      if (y > VIEW_BOT) text(ctx, `↑ ${((P.y - F.hk.y - 250) / 100).toFixed(1)} M BELOW ↑`, W / 2, VIEW_BOT - 60, { scale: 3, color: PAL.sab, outline: 3, align: 'center' });
    }
  }

  function overseerEye() {
    const o = S.fx.overseer; if (!o) return;
    const x = W / 2, y = VIEW_TOP + 230, a = Math.min(1, o.t * 2, (o.dur - o.t) * 2);
    ctx.globalAlpha = a;
    for (let i = 6; i > 0; i--) { ctx.fillStyle = i % 2 ? hexA(PAL.crownRed, 0.5) : hexA(PAL.ink, 0.7); ctx.beginPath(); ctx.ellipse(x, y, 60 + i * 38, 30 + i * 20, 0, 0, 7); ctx.fill(); }
    ctx.fillStyle = PAL.bone; ctx.beginPath(); ctx.ellipse(x, y, 110, 60, 0, 0, 7); ctx.fill();
    const px = clamp((S.player.x - x) * 0.08, -50, 50);
    ctx.fillStyle = PAL.sab; ctx.beginPath(); ctx.arc(x + px, y, 44, 0, 7); ctx.fill(); ctx.fillStyle = PAL.ink; ctx.beginPath(); ctx.arc(x + px, y, 20, 0, 7); ctx.fill();
    text(ctx, 'THE OVERSEER', x, y + 110, { scale: 4, color: PAL.sab, outline: 3, align: 'center' });
    if (o.user) nameTag('@' + o.user.nickname, { ...o.user, team: 'sab' }, x, y + 150, 1, PAL.sab);
    ctx.globalAlpha = 1;
  }

  function patch() {
    const P = S.player, spr = patchSprites();
    const set = spr[P.anim] || spr.idle;
    const f = P.anim === 'run' ? Math.floor(P.animT * 12) % 6 : P.anim === 'idle' ? Math.floor(P.animT * 2) % 2 : P.anim === 'fall' ? Math.floor(P.animT * 8) % 2 : P.anim === 'jump' ? (P.vy > 400 ? 0 : 1) : 0;
    const x = sx(P.x), y = sy(P.y);
    const sq = P.landT > 0 ? 1 - P.landT * 0.8 : 1;
    const frame = set[Math.min(f, set.length - 1)];
    if (P.dashT > 0) for (let i = 1; i <= 3; i++) drawSprite(ctx, frame, x - 48 - P.face * i * 40, y - 124, P.face < 0, 0.25 / i);
    if (P.stun > 0 && Math.floor(S.realT * 10) % 2) ctx.globalAlpha = 0.6;
    ctx.save(); ctx.translate(x, y); ctx.scale(1, sq); drawSprite(ctx, frame, -48, -124, P.face < 0); ctx.restore();
    ctx.globalAlpha = 1;
    if (P.stun > 0) for (let i = 0; i < 3; i++) { const a = S.realT * 6 + i * 2.1; ctx.fillStyle = PAL.sodium; ctx.fillRect(x + Math.cos(a) * 40 - 5, y - 140 + Math.sin(a) * 10, 10, 10); }
    if (P.shield > 0) { ctx.strokeStyle = hexA(PAL.help, P.shield < 1.5 && Math.floor(S.realT * 8) % 2 ? 0.3 : 0.85); ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(x, y - 58, 88, 0, 7); ctx.stroke(); ctx.fillStyle = hexA(PAL.help, 0.12); ctx.fill(); }
    if (P.bracing) { ctx.fillStyle = PAL.machine; ctx.fillRect(x - 40, y + 2, 80, 8); text(ctx, 'BRACE', x, y - 184, { scale: 3, color: PAL.bone, outline: 2, align: 'center' }); }
    if (P.sliding) { ctx.fillStyle = hexA(PAL.bone, 0.6); for (let i = 0; i < 3; i++) ctx.fillRect(x + P.wall * 30, y - 20 - i * 30 + (S.realT * 200 % 30), 6, 12); }
    text(ctx, S.heroName, x, y - 152 - (P.bracing ? 32 : 0), { scale: 3, color: PAL.sodium, outline: 2, align: 'center', alpha: 0.9 });
    const c = S.fx.corgi;
    if (c) { const cs = sprite('corgi'); if (cs) drawSprite(ctx, cs, sx(c.x) - 32, sy(c.y) - 40 + Math.abs(Math.sin(S.realT * 10)) * -8, S.player.x < c.x); nameTag(c.tag, c.owner, c.x, sy(c.y) - 80, 1); }
  }

  function windFlags() {
    const d = S.wind.flag || (S.fx.crosswind ? S.fx.crosswind.dir : 0);
    if (!d) return;
    const cw = S.fx.crosswind, tele = cw && cw.tele > 0;
    for (let i = 0; i < 4; i++) {
      const x = d > 0 ? 18 : W - 52, y = VIEW_TOP + 180 + i * 260;
      ctx.fillStyle = PAL.ink; ctx.fillRect(x + (d > 0 ? 0 : 30), y, 4, 90);
      const flap = Math.sin(S.realT * 18 + i) * 6;
      ctx.fillStyle = cw ? PAL.sab : PAL.signalYellow;
      ctx.beginPath(); const bx = x + (d > 0 ? 4 : 30); ctx.moveTo(bx, y); ctx.lineTo(bx + d * 46, y + 14 + flap); ctx.lineTo(bx, y + 30); ctx.fill();
    }
    if (cw) text(ctx, `${tele ? 'CROSSWIND INCOMING' : 'CROSSWIND'} ${d > 0 ? '→' : '←'}`, W / 2, VIEW_TOP + 140, { scale: 3, color: PAL.sab, outline: 3, align: 'center' });
    else if (S.wind.baseline === 0) text(ctx, `GUST ${d > 0 ? '→' : '←'}`, W / 2, VIEW_TOP + 140, { scale: 3, color: PAL.signalYellow, outline: 3, align: 'center' });
  }

  function lightsOut() {
    if (!S.fx.lights) return false;
    const P = S.player, x = sx(P.x), y = sy(P.y) - 55;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, VIEW_TOP, W, VIEW_H); ctx.arc(x, y, 250, 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(4,3,6,0.97)'; ctx.fill('evenodd');
    const g = ctx.createRadialGradient(x, y, 170, x, y, 250); g.addColorStop(0, 'rgba(4,3,6,0)'); g.addColorStop(1, 'rgba(4,3,6,0.97)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 251, 0, 7); ctx.fill();
    ctx.restore();
    text(ctx, `LIGHTS OUT ${Math.ceil(S.fx.lights.t)}s`, W / 2, VIEW_TOP + 100, { scale: 3, color: PAL.sab, outline: 3, align: 'center' });
    if (S.fx.lights.user) nameTag('@' + S.fx.lights.user.nickname, { ...S.fx.lights.user, team: 'sab' }, W / 2, VIEW_TOP + 136, 1, PAL.sab);
    return true;
  }

  // ---------- HUD ----------
  function hud() {
    const P = S.player, z = zoneAt(P.y);
    // top-left: height, zone, alert, session timer (on a backing plate for readability)
    ctx.fillStyle = 'rgba(26,20,20,0.72)'; ctx.fillRect(16, 576, 480, 164);
    text(ctx, `${Math.max(0, P.y / 100).toFixed(1)} M`, 24, 584, { scale: 7, color: PAL.bone, outline: 4 });
    text(ctx, `${z.name} · ZONE ${z.id}/5`, 26, 644, { scale: 3, color: z.accent, outline: 3 });
    text(ctx, `ALERT LEVEL ${S.level} · SUMMITS ${S.summits}`, 26, 678, { scale: 3, color: S.level ? PAL.sab : PAL.machine, outline: 2 });
    text(ctx, `SHIFT ${fmtH(S.sessionT)}${S.knob.safetyNet ? '' : ' · NO NET'}`, 26, 710, { scale: 3, color: S.softPrompt ? PAL.sodium : S.knob.safetyNet ? PAL.bone : PAL.sab, outline: 2 });
    // live freefall counter once PATCH has dropped 10+ m
    const drop = fallDropM(P); // from the true peak of this fall (survives mid-air lastGroundY resets)
    if (drop >= 10) text(ctx, `FALLING −${drop.toFixed(0)} M`, W / 2, VIEW_BOT - 260, { scale: Math.min(10, 5 + drop / 25), color: PAL.sab, outline: 5, align: 'center' });
    // team scoreboard strip 360x108 (top right; scale-3 rows for phone viewers) - a tally, never a vote
    const bx = W - 384, by = 530;
    ctx.fillStyle = 'rgba(26,20,20,0.78)'; ctx.fillRect(bx, by, 360, 108);
    ctx.fillStyle = PAL.help; ctx.fillRect(bx, by, 6, 108); ctx.fillStyle = PAL.sab; ctx.fillRect(bx + 354, by, 6, 108);
    let nh = 0, ns = 0; for (const t of S.teams.values()) t.team === 'help' ? nh++ : ns++;
    const tw = text(ctx, `HELP ${nh}`, bx + 18, by + 10, { scale: 3, color: PAL.help });
    text(ctx, ' · ', bx + 18 + tw, by + 10, { scale: 3, color: PAL.bone });
    text(ctx, `SAB ${ns}`, bx + 18 + tw + 54, by + 10, { scale: 3, color: PAL.sab });
    text(ctx, `+${Math.round(S.run.given)} M GIVEN`, bx + 18, by + 44, { scale: 3, color: PAL.help });
    text(ctx, `−${Math.round(S.run.taken)} M TAKEN`, bx + 18, by + 76, { scale: 3, color: PAL.sab });
    // sab heat meter
    const hx = bx, hy = by + 114, frac = clamp(S.heat / S.knob.heatCap, 0, 1);
    ctx.fillStyle = 'rgba(26,20,20,0.78)'; ctx.fillRect(hx, hy, 360, 32);
    ctx.fillStyle = S.jammer > 0 ? PAL.help : mix(PAL.sodium, PAL.sab, frac); ctx.fillRect(hx + 4, hy + 4, 352 * (S.jammer > 0 ? S.jammer / 8 : frac), 24);
    text(ctx, S.jammer > 0 ? `JAMMER ${S.jammer.toFixed(1)}s` : `SAB HEAT ${Math.round(S.heat)}/${S.knob.heatCap}`, hx + 180, hy + 6, { scale: 3, color: PAL.bone, outline: 2, align: 'center' });
    // lightning meter (right margin)
    const lx = W - 50, ly = 744, lh = 540, lf = clamp(S.lightning.charge / S.knob.lightningLikes, 0, 1);
    ctx.fillStyle = 'rgba(26,20,20,0.85)'; ctx.fillRect(lx, ly, 32, lh);
    ctx.fillStyle = lf >= 1 ? (Math.floor(S.realT * 8) % 2 ? PAL.bone : PAL.sodium) : PAL.sodium; ctx.fillRect(lx + 4, ly + 4 + (lh - 8) * (1 - lf), 24, (lh - 8) * lf);
    const tot = S.lightning.help + S.lightning.sab || 1;
    ctx.fillStyle = PAL.help; ctx.fillRect(lx - 8, ly + lh - (lh * S.lightning.help / tot), 6, lh * S.lightning.help / tot);
    ctx.fillStyle = PAL.sab; ctx.fillRect(lx - 8, ly, 6, lh * S.lightning.sab / tot);
    ctx.fillStyle = PAL.ink; ctx.beginPath(); ctx.moveTo(lx + 22, ly - 46); ctx.lineTo(lx + 2, ly - 18); ctx.lineTo(lx + 16, ly - 18); ctx.lineTo(lx + 8, ly + 2); ctx.lineTo(lx + 32, ly - 26); ctx.lineTo(lx + 18, ly - 26); ctx.lineTo(lx + 26, ly - 46); ctx.closePath(); ctx.fill();
    ctx.fillStyle = PAL.sodium; ctx.beginPath(); ctx.moveTo(lx + 21, ly - 42); ctx.lineTo(lx + 7, ly - 21); ctx.lineTo(lx + 19, ly - 21); ctx.lineTo(lx + 12, ly - 5); ctx.lineTo(lx + 28, ly - 23); ctx.lineTo(lx + 16, ly - 23); ctx.lineTo(lx + 23, ly - 42); ctx.closePath(); ctx.fill();
    text(ctx, 'LIKES', lx + 16, ly + lh + 10, { scale: 2, color: PAL.bone, outline: 2, align: 'center' });
    if (S.lightning.boost.help || S.lightning.boost.sab) text(ctx, 'x2', lx + 16, ly + lh + 32, { scale: 3, color: S.lightning.boost.help ? PAL.help : PAL.sab, outline: 2, align: 'center' });
    // tower progress (left margin) with beacon ticks
    const tx = 20, ty = 800, th = 780;
    ctx.fillStyle = 'rgba(26,20,20,0.85)'; ctx.fillRect(tx, ty, 26, th);
    for (const b of S.beacons) { const yy = ty + th - (b.y / TOWER_TOP) * th; ctx.fillStyle = b.banked ? PAL.help : PAL.machine; ctx.fillRect(tx - 4, yy - 2, 34, 4); }
    for (const w of S.posters) if (w.state === 'wanted' || w.state === 'nemesis') { const yy = ty + th - (w.y / TOWER_TOP) * th; ctx.fillStyle = PAL.sab; ctx.fillRect(tx + 26, yy - 4, 10, 8); }
    const py = ty + th - clamp(P.y / TOWER_TOP, 0, 1) * th;
    ctx.fillStyle = PAL.sodium; ctx.fillRect(tx - 6, py - 6, 38, 12);
    if (S.fx.hk) { const hy2 = ty + th - clamp((S.fx.hk.y + 250) / TOWER_TOP, 0, 1) * th; ctx.fillStyle = PAL.sab; ctx.fillRect(tx - 6, hy2 - 3, 38, 6); }
    text(ctx, '250', tx + 16, ty - 30, { scale: 3, color: PAL.bone, outline: 2, align: 'center' });
    // status icons row
    const icons = [];
    if (P.shield > 0) icons.push([`SHIELD ${P.shield.toFixed(0)}`, PAL.help]);
    if (S.fx.corgi) icons.push([`CORGI ${Math.ceil(S.fx.corgi.t)}`, PAL.help]);
    if (S.fx.grapple) icons.push([`GRAPPLE x${S.fx.grapple.charges} [E/RB]`, PAL.help]);
    if (S.panic > 0) icons.push([`SAB HELD ${Math.ceil(S.panic)}s`, PAL.help]);
    if (S.fx.greaseNext > 0) icons.push([`GREASE x${S.fx.greaseNext}`, PAL.sab]);
    if (P.dashCd > 0) icons.push([`DASH ${P.dashCd.toFixed(1)}`, PAL.machine]);
    if (P.braceCd > 0) icons.push([`BRACE ${P.braceCd.toFixed(1)}`, PAL.machine]);
    if (S.sabQ.length + S.held.length > 0) icons.push([`QUEUED ${S.sabQ.length + S.held.length}`, PAL.bone]);
    let ix = 70;
    for (const [t, c] of icons) { const w = textW(t, 3) + 18; if (ix + w > W - 70) break; ctx.fillStyle = 'rgba(26,20,20,0.8)'; ctx.fillRect(ix, 1596, w, 36); text(ctx, t, ix + 9, 1603, { scale: 3, color: c }); ix += w + 8; }
    if (S.fx.emp) { const a = 0.7 + 0.3 * Math.sin(S.realT * 20); empIcon(W / 2, 800, a); text(ctx, `EMP: CONTROLS INVERTED ${S.fx.emp.t.toFixed(1)}`, W / 2, 880, { scale: 3, color: PAL.sab, outline: 3, align: 'center' }); }
    // chips (joins, tips) stacked above the status row
    S.chips.slice(-4).forEach((c, i, arr) => { const y = 1550 - (arr.length - 1 - i) * 42; const a = Math.min(1, c.t * 3); ctx.globalAlpha = a; const t = fitPx(c.text, 3, W - 180); const w = textW(t, 3) + 22; ctx.fillStyle = 'rgba(26,20,20,0.82)'; ctx.fillRect(70, y, w, 36); text(ctx, t, 81, y + 7, { scale: 3, color: c.color }); ctx.globalAlpha = 1; });
    // gift legend: small corner card, 8 s once every legendIntervalS, never flashing
    const iv = S.knob.legendIntervalS, lg = legendPhase(S.sessionT, iv);
    if (lg) legend(Math.min(1, lg.k * 3, (LEGEND_T - lg.k) * 3));
    // first-time viewer onboarding: a quiet HOW TO PLAY strip, half a cycle away from the legend
    const hs = howToPhase(S.sessionT, iv);
    if (S.knob.howToPlay && hs && !S.cine && !S.cinema) howTo(hs);
    streamerHint();
    // stamps
    if (S.stamp > 0) { ctx.save(); ctx.translate(W / 2, 960); ctx.rotate(-0.12); const k = 1 + Math.max(0, S.stamp - 0.7) * 3; ctx.scale(k, k); text(ctx, 'CLUTCH', 0, -40, { scale: 12, color: PAL.sodium, outline: 6, align: 'center', alpha: Math.min(1, S.stamp * 3) }); ctx.restore(); }
    if (S.banner && !S.paused && !S.onBreak && !S.over) { const b = S.banner, a = Math.min(1, b.t * 2), sc = Math.max(3, Math.min(8, Math.floor((W - 60) / (b.text.length * 6)))); ctx.fillStyle = `rgba(26,20,20,${0.8 * a})`; ctx.fillRect(0, 900, W, 150); text(ctx, b.text, W / 2, 960 - sc * 5, { scale: sc, color: b.color, outline: 4, align: 'center', alpha: a }); if (b.sub) text(ctx, b.sub, W / 2, 1000, { scale: 3, color: PAL.bone, outline: 2, align: 'center', alpha: a }); }
    if (S.cinema) cinemaBanner();
  }

  function empIcon(x, y, a) { // big inverted-controls arrows
    ctx.globalAlpha = a;
    const arrow = (cx, cy, d, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(cx - d * 90, cy - 12); ctx.lineTo(cx + d * 30, cy - 12); ctx.lineTo(cx + d * 30, cy - 40); ctx.lineTo(cx + d * 90, cy); ctx.lineTo(cx + d * 30, cy + 40); ctx.lineTo(cx + d * 30, cy + 12); ctx.lineTo(cx - d * 90, cy + 12); ctx.closePath(); ctx.fill(); };
    arrow(x, y - 34, 1, PAL.ink); arrow(x, y + 34, -1, PAL.ink);
    ctx.save(); ctx.translate(x, y - 34); ctx.scale(0.86, 0.72); arrow(0, 0, 1, PAL.sab); ctx.restore();
    ctx.save(); ctx.translate(x, y + 34); ctx.scale(0.86, 0.72); arrow(0, 0, -1, PAL.sab); ctx.restore();
    ctx.globalAlpha = 1;
  }

  // Small corner card (spec §0: max 300x420, 8 s per interval, never flashing). Two-line
  // entries at scale 3 so it stays legible at phone size (1/3 scale).
  function legend(a) {
    const x = W - 380, y = 690, w = 300, h = 420;
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(26,20,20,0.9)'; ctx.fillRect(x, y, w, h); ctx.fillStyle = PAL.machine; ctx.fillRect(x, y, w, 4);
    text(ctx, 'WHAT GIFTS DO', x + 150, y + 16, { scale: 3, color: PAL.bone, align: 'center' });
    const rows = [['ROSE', 'SCRAP PLANK', PAL.help], ['FINGER HEART', 'HEART PAD', PAL.help], ['TIKTOK', 'BOLT DROP', PAL.sab], ['PANDA', 'GREASE', PAL.sab], ['10+ COINS', 'YOUR TEAM PICKS', PAL.bone], ['NO TEAM YET', 'COUNTS AS HELP', PAL.bone]];
    rows.forEach(([k, v, c], i) => { const ry = y + 54 + i * 60; text(ctx, k, x + 14, ry, { scale: 3, color: PAL.bone }); text(ctx, '→ ' + v, x + w - 14, ry + 27, { scale: 3, color: c, align: 'right' }); });
    ctx.globalAlpha = 1;
  }

  function howTo({ k }) {
    const tips = [
      ['COMMENT "HELP" OR "SAB" TO JOIN · FREE', PAL.bone],
      [`ROSE + FINGER HEART HELP ${S.heroName}`, PAL.help],
      ['TIKTOK + PANDA GIFTS SABOTAGE', PAL.sab],
      ['LIKES CHARGE THE LIGHTNING', PAL.sodium],
    ];
    const i = Math.min(tips.length - 1, Math.floor(k / (HOWTO_T / tips.length)));
    const a = Math.min(1, k * 3, (HOWTO_T - k) * 3);
    const x = 64, y = 752, w = W - 128, h = 76;
    ctx.globalAlpha = a * 0.92;
    ctx.fillStyle = 'rgba(26,20,20,0.88)'; ctx.fillRect(x, y, w, h); ctx.fillStyle = PAL.sodium; ctx.fillRect(x, y, 6, h);
    ctx.globalAlpha = a;
    text(ctx, `HOW TO PLAY · ${i + 1}/${tips.length}`, x + 20, y + 8, { scale: 3, color: PAL.sodium });
    const [tip, col] = tips[i], sc = textW(tip, 4) <= w - 40 ? 4 : 3;
    text(ctx, tip, x + 20, y + 38, { scale: sc, color: col, outline: 2 });
    ctx.globalAlpha = 1;
  }

  function cinemaBanner() {
    const c = S.cinema, a = Math.min(1, c.t * 4, (c.dur - c.t) * 3);
    const col = c.kind === 'extraction' ? PAL.help : PAL.sab;
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, VIEW_TOP, W, VIEW_H);
    ctx.fillStyle = col; ctx.fillRect(0, 860, W, 8); ctx.fillRect(0, 1180, W, 8);
    text(ctx, c.kind === 'extraction' ? 'EXTRACTION CALL' : 'THE OVERSEER', W / 2, 900, { scale: 10, color: col, outline: 5, align: 'center' });
    text(ctx, c.kind === 'extraction' ? 'BIRD-9 IS DROPPING A ROPE LADDER' : 'THE MACHINES ARE WATCHING', W / 2, 1000, { scale: 3, color: PAL.bone, outline: 3, align: 'center' });
    if (c.user) text(ctx, `COURTESY OF @${c.user.nickname}`, W / 2, 1060, { scale: 4, color: col, outline: 3, align: 'center' });
    if (c.kind === 'extraction') { const spr = sprite('bird'); const bx = -300 + (W + 300) * clamp(c.t / c.dur, 0, 1); if (spr) drawSprite(ctx, spr, bx, 700, true); rotor(bx + 128, 704, 170); }
    ctx.globalAlpha = 1;
  }

  // ---------- summit cinematic ----------
  function summit() {
    const c = S.cine; if (!c) return;
    const t = c.t;
    // confetti in team colours (deterministic paths)
    for (let i = 0; i < 160; i++) {
      const x = (hash01(i, 1) * W + Math.sin(t * 2 + i) * 40), y = VIEW_TOP + ((hash01(i, 2) * VIEW_H + t * (180 + hash01(i, 3) * 260)) % VIEW_H);
      ctx.fillStyle = [PAL.help, PAL.sab, PAL.sodium, PAL.bone][i % 4]; ctx.fillRect(x, y, 12, 8);
    }
    const a = Math.min(1, t * 2);
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(26,20,20,0.7)'; ctx.fillRect(0, 700, W, 170);
    const mm = Math.floor(c.runSec / 60), ss = String(Math.floor(c.runSec % 60)).padStart(2, '0');
    text(ctx, `SUMMIT #${c.n} · ${mm}:${ss}`, W / 2, 720, { scale: 9, color: PAL.sodium, outline: 5, align: 'center' });
    text(ctx, `${S.heroName} REACHED BIRD-9`, W / 2, 810, { scale: 3, color: PAL.bone, outline: 3, align: 'center' });
    // credits roll
    const roll = Math.max(0, t - 1.5) * 90;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 900, W, 520); ctx.clip();
    let y = 1400 - roll;
    text(ctx, 'THE RESISTANCE THANKS', W / 2, y, { scale: 4, color: PAL.help, outline: 3, align: 'center' }); y += 50;
    if (!c.helpersTop.length) { text(ctx, 'NOBODY. HE DID IT ALONE.', W / 2, y, { scale: 3, color: PAL.bone, outline: 2, align: 'center' }); y += 40; }
    for (const h of c.helpersTop) { text(ctx, `${h.name}  +${h.given.toFixed(1)} M`, W / 2, y, { scale: 3, color: PAL.bone, outline: 2, align: 'center' }); y += 40; }
    y += 30;
    text(ctx, 'THANKS FOR NOTHING', W / 2, y, { scale: 4, color: PAL.sab, outline: 3, align: 'center' }); y += 50;
    for (const h of c.sabsTop) { text(ctx, `${h.name}  −${h.taken.toFixed(1)} M`, W / 2, y, { scale: 3, color: PAL.bone, outline: 2, align: 'center' }); y += 40; }
    ctx.restore();
    if (t > 5.5) { const b = Math.min(1, (t - 5.5) * 3); ctx.fillStyle = `rgba(140,35,49,${0.85 * b})`; ctx.fillRect(0, 1440, W, 110); text(ctx, `NEXT: ALERT LEVEL ${c.nextLevel}`, W / 2, 1465, { scale: 7, color: PAL.bone, outline: 4, align: 'center', alpha: b }); }
    ctx.globalAlpha = 1;
  }

  // ---------- lane: rotating board + knock-down cards ----------
  function lane() {
    if (!transparent) { ctx.fillStyle = PAL.ink; ctx.fillRect(0, LANE_TOP, W, H - LANE_TOP); ctx.fillStyle = PAL.rustDark; ctx.fillRect(0, LANE_TOP, W, 6); }
    if (S.card) return card();
    const pages = S.boards || [];
    if (!pages.length) return;
    const pg = pages[Math.floor(S.sessionT / 6) % pages.length];
    const x = 680, y = LANE_TOP + 14, w = 380;
    ctx.fillStyle = 'rgba(26,20,20,0.85)'; ctx.fillRect(x, y, w, 252);
    ctx.fillStyle = pg.color; ctx.fillRect(x, y, w, 4);
    text(ctx, fitPx(pg.title, 3, w - 28), x + 14, y + 14, { scale: 3, color: pg.color });
    if (!pg.rows.length) text(ctx, 'NOBODY YET', x + 14, y + 62, { scale: 3, color: PAL.machine });
    pg.rows.forEach((r, i) => {
      const ry = y + 50 + i * 40;
      const m = `${Math.round(r.m)} M`, mw = textW(m, 3);
      text(ctx, String(i + 1), x + 14, ry, { scale: 3, color: PAL.bone });
      text(ctx, fitPx(r.name, 3, w - 72 - mw), x + 44, ry, { scale: 3, color: r.color || pg.color });
      text(ctx, m, x + w - 14, ry, { scale: 3, color: PAL.bone, align: 'right' });
    });
  }
  function card() {
    const c = S.card, age = c.t0 - c.t;
    const k = Math.min(1, age * 5, c.t * 5), e = 1 - Math.pow(1 - k, 3);
    const x = 90, y = LANE_TOP + 10 + (1 - e) * 280, w = 900, h = 260;
    const col = c.kind === 'revenge' ? PAL.help : c.kind === 'gravity' ? PAL.bone : PAL.sab;
    ctx.fillStyle = PAL.ink; ctx.fillRect(x - 6, y - 6, w + 12, h + 12);
    ctx.fillStyle = '#241A1A'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = col; ctx.fillRect(x, y, w, 8); ctx.fillRect(x, y + h - 8, w, 8);
    // avatar initial disc
    const name = c.user ? c.user.nickname : 'G';
    const hue = [...String(c.user ? c.user.id : 'gravity')].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 360, 0);
    ctx.fillStyle = c.user ? `hsl(${hue},55%,45%)` : PAL.machine; ctx.beginPath(); ctx.arc(x + 110, y + 130, 78, 0, 7); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 6; ctx.stroke();
    text(ctx, firstG(name).toUpperCase(), x + 110, y + 100, { scale: 9, color: PAL.bone, outline: 3, align: 'center' });
    const head = c.kind === 'knock' ? 'KNOCK-DOWN' : c.kind === 'gravity' ? 'GRAVITY' : 'REVENGE';
    text(ctx, head, x + 220, y + 26, { scale: 3, color: col });
    text(ctx, fitPx(c.lines[0], 3, 520), x + 220, y + 70, { scale: 3, color: PAL.bone, outline: 2 });
    if (c.loss != null) text(ctx, `−${c.loss.toFixed(1)} M`, x + 220, y + 116, { scale: 8, color: col, outline: 4 });
    else text(ctx, 'BUSTED', x + 220, y + 116, { scale: 8, color: col, outline: 4 });
    text(ctx, fitPx(c.lines[1], 3, 540), x + 220, y + 204, { scale: 3, color: PAL.machine });
    // effect icon (our own art, never the platform's gift art)
    const ic = { DRONE: 'drone', CART: 'cart', BOLT: 'bolt', HUNTER_KILLER: 'hk' }[c.effect];
    if (ic && sprite(ic)) { const s = sprite(ic), sc = Math.min(1, 140 / s.w, 150 / s.h); ctx.save(); ctx.translate(x + w - 100 - s.w * sc / 2, y + 60); ctx.scale(sc, sc); drawSprite(ctx, s, 0, 0); ctx.restore(); }
    else if (c.kind === 'knock') text(ctx, c.effect === 'EMP' ? '⇄' : c.effect === 'METEOR' ? '*' : '!', x + w - 100, y + 70, { scale: 12, color: col, outline: 4, align: 'center' });
    if (c.count > 1) text(ctx, `x${c.count}`, x + w - 100, y + 200, { scale: 3, color: PAL.bone, align: 'center' });
  }
  function fitPx(s, scale, maxW) { // grapheme-safe: never cuts an emoji in half
    s = String(s); if (textW(s, scale) <= maxW) return s;
    const g = gr(s); let n = g.length;
    while (n > 2 && textW(g.slice(0, n).join('') + '…', scale) > maxW) n--;
    return g.slice(0, n).join('') + '…';
  }

  // ---------- full-screen states ----------
  function overlays() {
    if (S.settings.open) return settings();
    if (S.help) return keyHelp();
    let title = null, sub = [], col = PAL.bone;
    if (S.over) { title = 'SHIFT OVER'; sub = [`SESSION ${fmtH(S.sessionT)} · SUMMITS ${S.summits}`, 'SEE YOU NEXT SHIFT']; col = PAL.sodium; }
    else if (S.onBreak) { title = 'ON BREAK'; sub = [`${S.heroName} IS ON A SMOKE BREAK`, `GIFTS WAIT IN LINE (${S.held.length}) · ANY KEY RESUMES`]; col = PAL.help; }
    else if (S.paused) { title = 'PAUSED'; sub = [`GIFTS QUEUED: ${S.held.length} · THEY FIRE 0.5s APART`, streamerKeys ? 'P RESUME · F9 PANIC · F10 SETTINGS · F1 KEYS' : 'P RESUME']; }
    if (!title) return;
    ctx.fillStyle = 'rgba(12,9,9,0.78)'; ctx.fillRect(0, VIEW_TOP, W, VIEW_H);
    text(ctx, title, W / 2, 960, { scale: 14, color: col, outline: 6, align: 'center' });
    sub.forEach((l, i) => text(ctx, fitPx(l, 3, W - 60), W / 2, 1080 + i * 40, { scale: 3, color: i ? PAL.machine : PAL.bone, outline: 2, align: 'center' }));
    if (S.onBreak) { for (let i = 0; i < 3; i++) { const a = (S.realT * 0.8 + i * 0.33) % 1; ctx.fillStyle = hexA(PAL.bone, 0.5 * (1 - a)); ctx.fillRect(W / 2 - 10 + Math.sin(a * 6 + i) * 20, 900 - a * 160, 14, 14); } }
  }
  function settings() {
    ctx.fillStyle = 'rgba(12,9,9,0.92)'; ctx.fillRect(40, VIEW_TOP + 20, W - 80, VIEW_H - 40);
    text(ctx, 'SETTINGS (F10)', W / 2, VIEW_TOP + 50, { scale: 5, color: PAL.sodium, align: 'center' });
    text(ctx, 'UP/DOWN SELECT · LEFT/RIGHT ADJUST · R DEFAULT · ESC CLOSES', W / 2, VIEW_TOP + 96, { scale: 2, color: PAL.bone, align: 'center' });
    text(ctx, S.settings.savedT > 0 ? 'SAVED' : 'SAVED AUTOMATICALLY · HIDE THIS FROM STREAM', W / 2, VIEW_TOP + 120, { scale: 2, color: S.settings.savedT > 0 ? PAL.help : PAL.machine, align: 'center' });
    const n = Object.keys(KNOBS).length, rowH = Math.min(62, Math.floor((VIEW_H - 200) / n));
    Object.entries(KNOBS).forEach(([k, d], i) => {
      const y = VIEW_TOP + 156 + i * rowH, sel = i === S.settings.idx;
      if (sel) { ctx.fillStyle = hexA(PAL.help, 0.18); ctx.fillRect(60, y - 10, W - 120, rowH - 8); }
      text(ctx, d.label, 80, y, { scale: 3, color: sel ? PAL.help : PAL.bone });
      const v = S.knob[k], f = (v - d.min) / (d.max - d.min);
      ctx.fillStyle = PAL.rustDark; ctx.fillRect(620, y + 6, 260, 12); ctx.fillStyle = sel ? PAL.help : PAL.sodium; ctx.fillRect(620, y + 6, 260 * f, 12);
      text(ctx, String(v), W - 80, y, { scale: 3, color: v === d.def ? PAL.bone : PAL.sodium, align: 'right' });
    });
    if (S.urlNoNet) text(ctx, '?nonet=1 IN THE URL FORCES NO NET FOR THIS PAGE', W / 2, VIEW_BOT - 46, { scale: 2, color: PAL.sab, align: 'center' });
  }

  // F1: streamer key help. Big and plain; the game is held while it is open.
  function keyHelp() {
    ctx.fillStyle = 'rgba(12,9,9,0.94)'; ctx.fillRect(40, VIEW_TOP + 20, W - 80, VIEW_H - 40);
    text(ctx, 'STREAMER KEYS', W / 2, VIEW_TOP + 50, { scale: 6, color: PAL.sodium, align: 'center' });
    text(ctx, 'GAME HELD WHILE THIS IS OPEN · GIFTS WAIT IN LINE', W / 2, VIEW_TOP + 106, { scale: 2, color: PAL.bone, align: 'center' });
    const rows = [
      ['A D ← →', 'RUN', 'STICK · D-PAD'], ['SPACE', 'JUMP · HOLD = HIGHER', 'A'], ['SHIFT', 'DASH · DODGES HITS', 'X · RT'],
      ['S ↓', 'BRACE · HOLD, MAX 2s', 'LT'], ['W ↑', 'CLIMB LADDER', 'STICK UP'], ['E', 'GRAPPLE (AFTER RING)', 'RB'],
      null,
      ['P', 'PAUSE · GIFTS WAIT', 'START', PAL.help], ['F9', 'PANIC · CLEARS HAZARDS,', 'SELECT+START', PAL.sab], ['', '10s SHIELD, HOLDS SAB 60s', '', PAL.sab],
      ['F10', 'SETTINGS · AUTO-SAVED', '', PAL.help], ['M', 'MUSIC ON / OFF', ''], ['F1 · ESC', 'CLOSE THIS', ''],
    ];
    let y = VIEW_TOP + 160;
    for (const r of rows) {
      if (!r) { ctx.fillStyle = hexA(PAL.machine, 0.5); ctx.fillRect(80, y + 4, W - 160, 3); y += 26; continue; }
      const [k, a, pad, col] = r;
      text(ctx, k, 80, y, { scale: 4, color: col || PAL.sodium });
      text(ctx, a, 290, y + 4, { scale: 3, color: PAL.bone });
      text(ctx, pad, W - 80, y + 4, { scale: 3, color: PAL.machine, align: 'right' });
      y += 62;
    }
  }

  // first 18 s of a session: where the streamer's safety keys are (small, bottom-left of view)
  function streamerHint() {
    if (!streamerKeys || S.sessionT > 18 || S.help || S.settings.open) return; // gone before the first gift legend (20 s)
    const a = Math.min(1, (18 - S.sessionT) * 2);
    const t = 'STREAMER: F1 KEYS · P PAUSE · F9 PANIC · F10 SETTINGS';
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(26,20,20,0.85)'; ctx.fillRect(64, 846, textW(t, 3) + 28, 38);
    text(ctx, t, 78, 854, { scale: 3, color: PAL.bone });
    ctx.globalAlpha = 1;
  }

  function render(c) {
    ctx = c; S = getState();
    shx = S.shake > 0 ? Math.sin(S.realT * 70) * 22 * Math.min(1, S.shake) : 0;
    shy = S.shake > 0 ? Math.cos(S.realT * 53) * 16 * Math.min(1, S.shake) : 0;
    // host camera window: kept clear (transparent in OBS mode)
    if (!transparent) { ctx.fillStyle = '#0B0808'; ctx.fillRect(0, 0, W, VIEW_TOP); ctx.strokeStyle = hexA(PAL.machine, 0.35); ctx.lineWidth = 2; ctx.strokeRect(12, 12, W - 24, VIEW_TOP - 24); text(ctx, 'HOST CAM', W / 2, VIEW_TOP / 2 - 10, { scale: 3, color: hexA(PAL.machine, 0.5), align: 'center' }); }
    ctx.save();
    ctx.beginPath(); ctx.rect(0, VIEW_TOP, W, VIEW_H); ctx.clip();
    if (!transparent) background();
    towerWall();
    posters();
    for (const p of S.platforms) platform(p);
    beacons();
    cables(); gates(); ladders(); bird();
    patrols(false);
    overseerEye();
    hazards(false);
    patch();
    windFlags();
    if (lightsOut()) { patrols(true); hazards(true); }
    if (S.flash > 0) { ctx.fillStyle = `rgba(232,220,196,${Math.min(0.6, S.flash * 2)})`; ctx.fillRect(0, VIEW_TOP, W, VIEW_H); }
    if (S.vignette > 0) { ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 60; ctx.strokeRect(0, VIEW_TOP, W, VIEW_H); }
    summit();
    hud();
    overlays();
    ctx.restore();
    lane();
  }
  return { render };
}
