// All drawing for TIGHTROPE. Layout (1080x1920): 0-520 host camera (kept clear), 520-1640 the
// canyon, 1640-1920 feed + fall-card lane. Procedural pixel look: 4x sprites, CLIMB OR DIE's
// self-drawn bitmap font, flat-shaded ruined skyscrapers in the Outpost palette.
import { PAL, PXM, VIEW_TOP, VIEW_BOT, LANE_TOP, VIEW_M, FACADE_L, FACADE_R, WORLD_W, BAL, KNOBS, clamp, hash01, hexA, mix } from './consts.js';
import { ropeAt, loadSag, STREET_AWNINGS, TRASH_Y, START_Y } from './world.js';
import { text, textW, drawSprite, patchSprites, sprite, wreckingBall, PATCH_W, PATCH_H, PATCH_SC, HANDS } from './art.js';
import { EFFECT_NAMES, TEAM_COLOR, platformBadge } from './effects.js';
import { TITLES } from './store.js';

const VIEW_H = VIEW_BOT - VIEW_TOP;
const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
const gr = (s) => (seg ? [...seg.segment(String(s))].map((g) => g.segment) : [...String(s)]);
const clipG = (s, n) => { const g = gr(s); return g.length > n ? g.slice(0, n - 1).join('') + '…' : String(s); };
const firstG = (s) => gr(s)[0] || '?';

export const LEGEND_T = 8;
export function legendPhase(t, iv) { const p = (t - 20) % iv; return t >= 20 && p < LEGEND_T ? { k: p } : null; }
export const HOWTO_T = 12;
export function howToPhase(t, iv) {
  if (t >= 4 && t < 4 + HOWTO_T) return { k: t - 4 };
  const p = (t - 20 - iv / 2) % iv;
  return t >= 20 + iv / 2 && p < HOWTO_T ? { k: p } : null;
}
const FLOOR = 3.2;
const band = (y) => (y < 18 ? 0 : y < 45 ? 1 : y < 75 ? 2 : 3); // brick, concrete, glass, steel skeleton
const BAND_COL = [['#5A3A30', '#3B2A25'], [PAL.concrete, PAL.concreteDark], [PAL.glass, '#10242B'], [PAL.steel, '#2E2522']];

export function createRenderer({ W, H, transparent, getState, fmtH, streamerKeys = true }) {
  let S, ctx, shx = 0, shy = 0;
  const sy = (y) => VIEW_BOT - (y - S.camY) * PXM + shy;
  const sx = (x) => x * PXM + shx;
  const visY = (y, pad = 3) => y > S.camY - pad && y < S.camY + VIEW_M + pad;

  function tagFor(owner) {
    if (!owner) return null;
    const t = S.titles && S.titles.get(owner.id), T = t && TITLES[t];
    const team = owner.team || (S.teams.get(owner.id) || {}).team || 'help';
    return { color: T ? T.color : TEAM_COLOR[team] || PAL.help, prefix: platformBadge(owner.id) + (T ? T.prefix + '·' : '') };
  }
  const srcUser = (src) => src && (src.user || (src.barrage && src.barrage.crew[0]) || (src.likers && src.likers[0] && src.likers[0].user)) || null;
  function tag(label, owner, x, y, { alpha = 1, color, scale = 4 } = {}) {
    if (!label) return;
    const t = tagFor(owner) || { color: color || PAL.help, prefix: '' };
    if (t.prefix && label.startsWith(t.prefix)) t.prefix = '';
    const s = clipG(t.prefix + label, 24), hw = textW(s, scale) / 2 + 6;
    text(ctx, s, clamp(x, hw, W - hw), y, { scale, color: color || t.color, outline: 3, align: 'center', alpha });
  }
  const srcTag = (src, x, y, o = {}) => { if (!src) return; const u = srcUser(src); tag(src.tag || (u ? '@' + u.nickname : 'CROWD'), u ? { ...u, team: 'sab' } : null, x, y, { color: u ? undefined : PAL.sab, ...o }); };

  // ---------- backdrop ----------
  function background() {
    const P = S.P, stormK = S.haz.storm ? (S.haz.storm.tele > 0 ? 1 - S.haz.storm.tele / S.haz.storm.tele0 : 1) : 0;
    const hk = clamp((S.camY + 8) / 110, 0, 1);
    const top = mix(mix(PAL.sky0, '#0B0A18', hk), PAL.storm, stormK * 0.8), bot = mix(mix(PAL.sky1, '#5A2E3A', hk), '#2A3040', stormK * 0.8);
    const g = ctx.createLinearGradient(0, VIEW_TOP, 0, VIEW_BOT); g.addColorStop(0, top); g.addColorStop(1, bot);
    ctx.fillStyle = g; ctx.fillRect(0, VIEW_TOP, W, VIEW_H);
    // moon + stars (fixed, deterministic)
    for (let i = 0; i < 40; i++) { const x = hash01(i, 71) * W, y = VIEW_TOP + ((hash01(i, 72) * VIEW_H * 1.4 + S.camY * 2) % VIEW_H); ctx.fillStyle = hexA(PAL.bone, 0.25 + 0.5 * hash01(i, 73) * (1 - stormK)); ctx.fillRect(x, y, 3, 3); }
    const my = VIEW_TOP + 140 + S.camY * 0.6 % 40;
    ctx.fillStyle = hexA(PAL.bone, 0.85 * (1 - stormK)); ctx.beginPath(); ctx.arc(760, my, 46, 0, 7); ctx.fill();
    ctx.fillStyle = hexA(top, 0.9); ctx.beginPath(); ctx.arc(780, my - 10, 40, 0, 7); ctx.fill();
    // far skyline (slow parallax) + the machines' spire
    const base = VIEW_BOT + 260 + S.camY * PXM * 0.18;
    for (let i = 0; i < 26; i++) {
      const x = -40 + i * 46 + hash01(i, 3) * 20, w = 40 + hash01(i, 4) * 40, h = 240 + hash01(i, 5) * 520;
      ctx.fillStyle = mix('#1A1826', top, 0.25); ctx.fillRect(x, base - h, w, h);
      if (hash01(i, 6) < 0.5) { ctx.fillStyle = hexA(PAL.sodium, 0.35); ctx.fillRect(x + 8, base - h + 30 + hash01(i, 7) * 100, 5, 5); }
      if (hash01(i, 8) < 0.3) { ctx.fillStyle = mix('#1A1826', top, 0.25); ctx.fillRect(x + w * 0.4, base - h - 40, 4, 40); }
    }
    const spx = 300, spTop = base - 1100;
    ctx.fillStyle = '#15131E'; ctx.beginPath(); ctx.moveTo(spx - 60, base); ctx.lineTo(spx - 14, spTop); ctx.lineTo(spx + 14, spTop); ctx.lineTo(spx + 60, base); ctx.fill();
    ctx.fillStyle = hexA(PAL.sab, 0.6 + 0.4 * Math.sin(S.realT * 2)); ctx.fillRect(spx - 8, spTop + 30, 16, 10);
    // searchlight sweeping from the spire (cosmetic)
    ctx.save(); ctx.globalAlpha = 0.07; ctx.fillStyle = PAL.bone; ctx.translate(spx, spTop + 35); ctx.rotate(Math.sin(S.realT * 0.3) * 0.9 - Math.PI / 2 + 0.3);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(1400, -120); ctx.lineTo(1400, 120); ctx.fill(); ctx.restore();
    // canyon depth: mid buildings deeper down the street
    const mbase = VIEW_BOT + S.camY * PXM * 0.45;
    for (let i = 0; i < 9; i++) {
      const x = 130 + i * 95, w = 80 + hash01(i, 11) * 30, h = 1400 + hash01(i, 12) * 2600;
      ctx.fillStyle = mix('#211C2A', top, 0.12); ctx.fillRect(x, mbase - h * 0.45, w, h * 0.45 + 600);
      for (let k = 0; k < 14; k++) if (hash01(i, k, 13) < 0.25) { ctx.fillStyle = hexA(PAL.sodium, 0.25); ctx.fillRect(x + 10 + (k % 3) * 22, mbase - h * 0.45 + 40 + k * 60, 8, 12); }
    }
  }

  // ---------- city ----------
  function facade(side) {
    const W0 = side === 'L' ? 0 : FACADE_R, W1 = side === 'L' ? FACADE_L : WORLD_W;
    const roof = side === 'L' ? S.world.roofL : S.world.roofR;
    const y0 = Math.max(0, S.camY - 1), y1 = Math.min(roof, S.camY + VIEW_M + 1);
    if (y1 <= y0) return;
    for (let f = Math.floor(y0 / FLOOR); f * FLOOR < y1; f++) {
      const fy = f * FLOOR, b = band(fy), [c0, c1] = BAND_COL[b];
      const top = Math.min(fy + FLOOR, roof), ya = sy(top), yb = sy(fy);
      const jag = (hash01(f, side === 'L' ? 1 : 2) - 0.5) * 0.35;
      const ix = side === 'L' ? W1 + jag : W0 - jag; // inner (canyon) edge, ruined
      const xa = sx(Math.min(W0, ix)), xb = sx(Math.max(W1, ix));
      ctx.fillStyle = c0; ctx.fillRect(xa, ya, xb - xa, yb - ya);
      ctx.fillStyle = c1; ctx.fillRect(xa, yb - 8, xb - xa, 8); // floor slab
      // inner side face (depth)
      ctx.fillStyle = hexA(PAL.ink, 0.35); if (side === 'L') ctx.fillRect(sx(ix) - 12, ya, 12, yb - ya); else ctx.fillRect(sx(ix), ya, 12, yb - ya);
      // windows / girders
      if (b === 3) { ctx.fillStyle = hexA(PAL.ink, 0.6); ctx.fillRect(xa + 14, ya + 12, xb - xa - 28, yb - ya - 30); ctx.strokeStyle = PAL.steel; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(xa + 14, ya + 12); ctx.lineTo(xb - 14, yb - 18); ctx.stroke(); }
      else for (let k = 0; k < 2; k++) {
        const wx = side === 'L' ? sx(0.12 + k * 0.52) : sx(FACADE_R + 0.18 + k * 0.52), wy = ya + 36, ww = 26, wh = Math.min(96, yb - ya - 60);
        if (wh <= 0) continue;
        const h = hash01(f, k, side === 'L' ? 5 : 6);
        ctx.fillStyle = h > 0.78 ? PAL.sodium : h < 0.18 ? PAL.ink : b === 2 ? PAL.glassLit : '#221C22';
        ctx.fillRect(wx, wy, ww, wh);
        if (h > 0.78) { ctx.fillStyle = hexA(PAL.sodium, 0.18); ctx.fillRect(wx - 8, wy - 8, ww + 16, wh + 16); }
        if (h < 0.18) { ctx.fillStyle = c0; ctx.fillRect(wx, wy, 10, 12); ctx.fillRect(wx + 16, wy + wh - 18, 10, 18); }
      }
      if (hash01(f, side === 'L' ? 8 : 9) < 0.3) { ctx.fillStyle = PAL.moss; for (let v = 0; v < 5; v++) ctx.fillRect(sx(ix) + (side === 'L' ? -6 : 0), ya + v * 18, 6, 12 + (v % 2) * 10); }
    }
    if (roof < S.camY + VIEW_M + 1) { // broken roofline + rebar
      const ry = sy(roof);
      ctx.fillStyle = PAL.ink; ctx.fillRect(sx(W0), ry - 6, sx(W1) - sx(W0) + (side === 'L' ? 12 : 0), 8);
      ctx.strokeStyle = PAL.rust; ctx.lineWidth = 3;
      for (let i = 0; i < 4; i++) { const x = sx(W0 + 0.2 + i * 0.3); ctx.beginPath(); ctx.moveTo(x, ry - 4); ctx.lineTo(x + (i % 2 ? 8 : -6), ry - 30 - i * 5); ctx.stroke(); }
    }
  }

  function street() {
    if (S.camY > 8) return;
    const gy = sy(0);
    ctx.fillStyle = '#1B1719'; ctx.fillRect(0, gy, W, VIEW_BOT - gy + 20);
    ctx.fillStyle = '#2A2426'; ctx.fillRect(0, gy, W, 14);
    for (let i = 0; i < 8; i++) { ctx.fillStyle = hexA(PAL.sodium, 0.5); ctx.fillRect(40 + i * 140, gy + 40, 60, 6); }
    // scrap car husk
    const cx = sx(9.6), cy = sy(0.1);
    ctx.fillStyle = PAL.rustDark; ctx.fillRect(cx, cy - 60, 200, 50); ctx.fillStyle = PAL.rust; ctx.fillRect(cx + 30, cy - 95, 120, 38); ctx.fillStyle = PAL.ink; ctx.fillRect(cx + 40, cy - 88, 44, 26); ctx.fillRect(cx + 20, cy - 16, 40, 16); ctx.fillRect(cx + 140, cy - 16, 40, 16);
    // market stall posts + crates
    for (const x of [2.8, 12.6]) { ctx.fillStyle = PAL.steel; ctx.fillRect(sx(x), sy(2.3), 10, sy(0) - sy(2.3)); }
    for (let i = 0; i < 4; i++) { ctx.fillStyle = PAL.rust; ctx.fillRect(sx(3.3 + i * 0.9), sy(0.7), 56, 48); ctx.fillStyle = PAL.rustDark; ctx.fillRect(sx(3.3 + i * 0.9), sy(0.7) + 20, 56, 6); }
    // awnings (striped canvas), wobble when hit
    for (const a of STREET_AWNINGS) {
      const x0 = sx(a.x0), x1 = sx(a.x1), y = sy(a.y), wob = (a.wob || 0) > 0 ? Math.sin(S.realT * 40) * 10 * a.wob : 0;
      if (a.wob > 0) a.wob = Math.max(0, a.wob - 1 / 60);
      const n = Math.max(3, Math.round((x1 - x0) / 60));
      for (let i = 0; i < n; i++) {
        const xa = x0 + (x1 - x0) * i / n, xb = x0 + (x1 - x0) * (i + 1) / n;
        ctx.fillStyle = i % 2 ? PAL.awningB : PAL.awningA;
        ctx.beginPath(); ctx.moveTo(xa, y + wob); ctx.lineTo(xb, y + wob); ctx.lineTo(xb, y + 34 + wob); ctx.lineTo(xa, y + 34 + wob); ctx.fill();
        ctx.beginPath(); ctx.arc((xa + xb) / 2, y + 34 + wob, (xb - xa) / 2, 0, Math.PI); ctx.fill();
      }
      ctx.fillStyle = PAL.ink; ctx.fillRect(x0, y - 4 + wob, x1 - x0, 5);
    }
    // trash pile (the landing)
    for (let i = 0; i < 9; i++) { const x = sx(4.6 + i * 0.7), y = sy(TRASH_Y) + (i % 2) * 8; ctx.fillStyle = i % 3 ? '#23232B' : '#2F3A2A'; ctx.beginPath(); ctx.ellipse(x, y + 16, 44, 30, 0, 0, 7); ctx.fill(); ctx.fillStyle = hexA(PAL.bone, 0.15); ctx.fillRect(x - 14, y + 2, 10, 5); }
  }

  function banners() {
    for (const b of S.world.banners) {
      if (!visY(b.y, 2)) continue;
      const y = sy(b.y), x0 = sx(FACADE_L), x1 = sx(FACADE_R);
      ctx.strokeStyle = PAL.ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x0, y - 30); ctx.quadraticCurveTo(W / 2, y + 10, x1, y - 30); ctx.stroke();
      const cw = 420, cx = W / 2 - cw / 2;
      if (b.torn) {
        ctx.fillStyle = b.color; // torn: tatters left hanging off the line
        for (let i = 0; i < 7; i++) { const lx = cx + i * 18, ln = 26 + ((i * 37) % 50) + (b.tearT > 0 ? b.tearT * 60 : 0); ctx.fillRect(lx, y - 12 + (i * 3) % 8, 14, ln); }
        for (let i = 0; i < 6; i++) { const lx = cx + cw - 16 - i * 18, ln = 22 + ((i * 29) % 44); ctx.fillRect(lx, y - 12 + (i * 5) % 8, 14, ln); }
      } else {
        ctx.fillStyle = b.color; ctx.fillRect(cx, y - 12, cw, 64);
        ctx.fillStyle = hexA(PAL.ink, 0.25); ctx.fillRect(cx, y + 44, cw, 8);
        text(ctx, b.text, W / 2, y + 2, { scale: 4, color: PAL.bone, align: 'center', alpha: 0.9 });
      }
    }
  }

  function ledges() {
    for (const a of S.world.anchors) {
      if (!visY(a.y, 3)) continue;
      const L = a.side === 'L', fx = L ? FACADE_L - 0.1 : FACADE_R + 0.1, tip = a.x + (L ? 0.35 : -0.35);
      const xa = sx(Math.min(fx, tip)), xb = sx(Math.max(fx, tip)), y = sy(a.y);
      ctx.fillStyle = PAL.ink; ctx.fillRect(xa - 3, y - 3, xb - xa + 6, 30);
      ctx.fillStyle = a.final ? PAL.machine : '#6A6070'; ctx.fillRect(xa, y, xb - xa, 22);
      ctx.fillStyle = hexA(PAL.ink, 0.35); ctx.fillRect(xa, y + 16, xb - xa, 6);
      // bracket
      ctx.strokeStyle = PAL.steel; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(sx(fx), y + 90); ctx.lineTo(sx(fx + (tip - fx) * 0.6), y + 22); ctx.stroke();
      // anchor post + beacon lamp
      const px = sx(a.x);
      ctx.fillStyle = PAL.ink; ctx.fillRect(px - 9, y - 66, 18, 66); ctx.fillStyle = PAL.machine; ctx.fillRect(px - 6, y - 63, 12, 63);
      const lit = a.banked;
      ctx.fillStyle = lit ? PAL.help : '#3A4048'; ctx.fillRect(px - 10, y - 84, 20, 18);
      if (lit) { ctx.fillStyle = hexA(PAL.help, 0.22 + 0.1 * Math.sin(S.realT * 3 + a.i)); ctx.beginPath(); ctx.arc(px, y - 75, 34, 0, 7); ctx.fill(); }
      if (a.i > 0 && !a.final) text(ctx, String(a.i), px, y + 30, { scale: 3, color: lit ? PAL.help : PAL.bone, outline: 2, align: 'center' });
      if (a.final) { // rooftop: helipad marks + antenna
        ctx.fillStyle = PAL.sodium; ctx.fillRect(xa + 20, y + 4, xb - xa - 40, 6);
        ctx.strokeStyle = PAL.machine; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(sx(fx + (L ? -0.6 : 0.6)), y); ctx.lineTo(sx(fx + (L ? -0.6 : 0.6)), y - 220); ctx.stroke();
        ctx.fillStyle = PAL.sab; ctx.fillRect(sx(fx + (L ? -0.6 : 0.6)) - 5, y - 226, 10, 10);
        text(ctx, 'ROOFTOP', px, y + 30, { scale: 3, color: PAL.sodium, outline: 2, align: 'center' });
      }
    }
  }

  function posters() {
    for (const p of S.posters) {
      if (!visY(p.y, 3)) continue;
      const L = p.side === 'L', w = 180, h = 206;
      const x = L ? sx(FACADE_L) - 70 : sx(FACADE_R) + 70 - w, y = sy(p.y); // hangs under the anchor ledge
      ctx.strokeStyle = PAL.ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 30, y - 16); ctx.lineTo(x + 40, y + 6); ctx.moveTo(x + w - 30, y - 16); ctx.lineTo(x + w - 40, y + 6); ctx.stroke();
      ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(L ? -0.04 : 0.05);
      ctx.fillStyle = PAL.ink; ctx.fillRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8);
      ctx.fillStyle = p.state === 'nemesis' ? '#D9C9A6' : '#E6D8B8'; ctx.fillRect(-w / 2, -h / 2, w, h);
      text(ctx, p.state === 'nemesis' ? 'NEMESIS' : 'WANTED', 0, -h / 2 + 10, { scale: 4, color: PAL.crownRed, align: 'center' });
      const hue = [...String(p.user && p.user.id || p.name)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 0);
      ctx.fillStyle = `hsl(${hue},45%,40%)`; ctx.beginPath(); ctx.arc(0, -10, 32, 0, 7); ctx.fill();
      text(ctx, firstG(String(p.name).replace(/^@/, '')).toUpperCase(), 0, -30, { scale: 6, color: PAL.bone, align: 'center' });
      text(ctx, fitPx(p.name, 3, w - 12), 0, 30, { scale: 3, color: PAL.ink, align: 'center' });
      text(ctx, p.state === 'nemesis' ? 'ALL-TIME #1' : `−${Math.round(p.loss)} M`, 0, 60, { scale: 3, color: PAL.crownRed, align: 'center' });
      if (p.state === 'wanted') { const left = Math.max(0, p.deadline - S.sessionT); text(ctx, `${Math.ceil(left)}S LEFT`, 0, 84, { scale: 3, color: PAL.ink, align: 'center' }); }
      if (p.state === 'busted') { ctx.rotate(-0.3); ctx.strokeStyle = PAL.help; ctx.lineWidth = 6; ctx.strokeRect(-72, -28, 144, 56); text(ctx, 'BUSTED', 0, -14, { scale: 5, color: PAL.help, align: 'center' }); }
      ctx.restore();
    }
  }

  // ---------- ropes ----------
  function ropePts(sp, withLoad) {
    const P = S.P, out = [];
    const cur = withLoad && P.span === sp.i && (P.phase === 'walk' || P.phase === 'tip');
    const sag = cur ? loadSag(sp, P.s) : 0;
    const Hz = S.haz, vib = cur ? [Hz.twang, Hz.shake].filter((w) => w && w.tele <= 0) : [];
    for (const p of sp.pts) {
      let y = p.y;
      if (cur) y -= sag * (p.s < P.s ? p.s / Math.max(0.01, P.s) : (sp.len - p.s) / Math.max(0.01, sp.len - P.s));
      for (const w of vib) { const env = clamp(Math.min(w.t / 0.2, (w.dur - w.t) / 0.3), 0, 1); y += 0.18 * Math.sin(p.s * 1.6 - S.t * w.freq * 6) * env * (w.amp / 2.2) * Math.sin(Math.PI * p.s / sp.len); }
      out.push([sx(p.x), sy(y)]);
    }
    return out;
  }
  function ropes() {
    for (const sp of S.world.spans) {
      if (!visY(Math.min(sp.a.y, sp.b.y) - 1, VIEW_M + 2) && !visY(sp.b.y, 3)) continue;
      if (sp.b.y < S.camY - 3 || sp.a.y - 2 > S.camY + VIEW_M + 3) continue;
      const pts = ropePts(sp, true), cable = sp.kind === 'cable';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = PAL.ink; ctx.lineWidth = cable ? 8 : 10; poly(pts);
      ctx.strokeStyle = cable ? PAL.cable : PAL.rope; ctx.lineWidth = cable ? 4 : 6; poly(pts);
      if (!cable) { ctx.strokeStyle = PAL.ropeDark; ctx.lineWidth = 2; ctx.setLineDash([6, 10]); poly(pts); ctx.setLineDash([]); }
      // twang telegraph: a bright pulse running down the rope
      const tw = S.haz.twang, sh = S.haz.shake;
      if (tw && tw.tele > 0 && sp.i === S.P.span) pulse(sp, 1 - tw.tele / tw.tele0, tw.from, PAL.sab);
      if (sh && sh.tele > 0 && sp.i === S.P.span) pulse(sp, (1 - sh.tele / sh.tele0) * 0.4, sh.from, PAL.sab);
      // breeze flags (layout wind, hidden by fog)
      if (!S.haz.fog || sp.i !== S.P.span) for (const z of sp.breeze) {
        const r = ropeAt(sp, (z.s0 + z.s1) / 2), x = sx(r.x), y = sy(r.y);
        const k = S.buff.calm && S.buff.calm.t > 0 ? 0.15 : 1;
        ctx.fillStyle = PAL.machine; ctx.fillRect(x - 2, y - 70, 4, 70);
        const fl = 40 + 6 * Math.sin(S.realT * 12 + z.s0);
        ctx.fillStyle = z.dir > 0 ? PAL.signalYellow : PAL.sodium;
        ctx.beginPath(); ctx.moveTo(x, y - 70); ctx.lineTo(x + z.dir * fl * k, y - 60 + 4 * Math.sin(S.realT * 9)); ctx.lineTo(x, y - 50); ctx.fill();
      }
    }
    // safety net under the current span
    if (S.buff.net && S.buff.net.t > 0) {
      const sp = S.world.spans[S.P.span];
      ctx.strokeStyle = hexA(PAL.help, 0.7); ctx.lineWidth = 2;
      const a = sy(sp.a.y - 2.3), b = sy(sp.b.y - 2.3);
      for (let i = 0; i <= 12; i++) { const f = i / 12; ctx.beginPath(); ctx.moveTo(sx(sp.a.x + (sp.b.x - sp.a.x) * f), a + (b - a) * f); ctx.lineTo(sx(sp.a.x + (sp.b.x - sp.a.x) * f), a + (b - a) * f + 30); ctx.stroke(); }
      ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(sx(sp.a.x), a); ctx.lineTo(sx(sp.b.x), b); ctx.moveTo(sx(sp.a.x), a + 30); ctx.lineTo(sx(sp.b.x), b + 30); ctx.stroke();
      const m = ropeAt(sp, sp.len / 2);
      tag(`SAFETY NET ${Math.ceil(S.buff.net.t)}s`, null, sx(m.x), sy(m.y - 2.3) + 40, { scale: 3, color: PAL.help });
    }
    // planted anchor mid-rope
    if (S.resume.planted) {
      const sp = S.world.spans[S.resume.span], r = ropeAt(sp, S.resume.s), x = sx(r.x), y = sy(r.y);
      ctx.fillStyle = PAL.help; ctx.fillRect(x - 6, y - 40, 12, 44); ctx.fillRect(x - 16, y - 50, 32, 14);
      tag(S.resume.tag, S.resume.owner, x, y - 90, { scale: 3 });
    }
  }
  function poly(pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); }
  function pulse(sp, f, from, col) {
    const s = (from ? 1 - f : f) * sp.len, r = ropeAt(sp, s);
    ctx.fillStyle = hexA(col, 0.8); ctx.beginPath(); ctx.arc(sx(r.x), sy(r.y), 16, 0, 7); ctx.fill();
  }

  // ---------- hazards on/around the rope ----------
  function hazards() {
    const Hz = S.haz, P = S.P;
    // peels
    for (const pl of Hz.peels) {
      const sp = S.world.spans[pl.span]; const r = ropeAt(sp, pl.s);
      const fallY = pl.drop > 0 ? (pl.drop / pl.drop0) * 5 : 0;
      const spr = sprite('peel'), x = sx(r.x) - spr.w / 2, y = sy(r.y + fallY) - spr.h + 8;
      if (pl.span === P.span && pl.drop <= 0) { ctx.strokeStyle = hexA(PAL.banana, 0.5 + 0.4 * Math.sin(S.realT * 8)); ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(sx(r.x), y + spr.h / 2, 46, 0, 7); ctx.stroke(); }
      drawSprite(ctx, spr, x, y);
      if (pl.span === P.span) { srcTag(pl.src, sx(r.x), y - 96, { scale: 3 }); text(ctx, 'CROUCH OVER IT', sx(r.x), y - 60, { scale: 3, color: PAL.banana, outline: 3, align: 'center' }); }
    }
    // shaker bot on the anchor
    if (Hz.shake) {
      const sp = S.world.spans[P.span], a = Hz.shake.from ? sp.b : sp.a, spr = sprite('shaker');
      const jit = Math.sin(S.realT * 60) * (Hz.shake.tele > 0 ? 3 : 6);
      drawSprite(ctx, spr, sx(a.x) - spr.w / 2 + jit, sy(a.y) - spr.h - 70);
      srcTag(Hz.shake.src, sx(a.x), sy(a.y) - spr.h - 120, { scale: 3 });
      if (Hz.shake.tele > 0) text(ctx, 'ROPE SHAKE!', sx(a.x), sy(a.y) - spr.h - 150, { scale: 3, color: PAL.sab, outline: 3, align: 'center' });
    }
    if (Hz.twang && Hz.twang.tele > 0) { const sp = S.world.spans[P.span], a = Hz.twang.from ? sp.b : sp.a; srcTag(Hz.twang.src, sx(a.x), sy(a.y) - 130, { scale: 3 }); text(ctx, 'TWANG!', sx(a.x), sy(a.y) - 160, { scale: 3, color: PAL.sab, outline: 3, align: 'center' }); }
    // drones buzzing PATCH
    for (const d of Hz.drones) {
      const px = sx(P.x), py = sy(P.y + 1.3);
      const side = d.push > 0 ? d.side * (1 - (0.35 - d.push) / 0.35 * 2) : d.side;
      const dx = px + side * 150 + Math.cos(d.ang) * 20, dy = py - 60 + Math.sin(d.ang * 1.7) * 30;
      if (d.tele > 0) { ctx.strokeStyle = hexA(PAL.sab, 0.8); ctx.lineWidth = 4; ctx.setLineDash([14, 10]); ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(px, py); ctx.stroke(); ctx.setLineDash([]); }
      const spr = sprite('drone'); if (spr) drawSprite(ctx, spr, dx - spr.w / 2, dy - spr.h / 2, side > 0);
      srcTag(d.src, dx, dy - 70, { scale: 3 });
    }
    // crane + wrecking ball
    const cr = Hz.crane;
    if (cr) {
      const w = cr.swing, sp = S.world.spans[w.span], r = ropeAt(sp, w.s);
      const pivX = r.x, pivY = r.y + 5.4, len = 4.2;
      const phi = w.sweep < 0 ? -w.dir * (1.05 + 0.04 * Math.sin(S.realT * 6)) : -w.dir * 1.05 + w.dir * 2.1 * clamp(w.sweep / 0.5, 0, 1);
      const bx = pivX + Math.sin(phi) * len, by = pivY - Math.cos(phi) * len;
      // jib from the far facade + mast
      const fx = cr.side > 0 ? FACADE_R : FACADE_L;
      ctx.strokeStyle = PAL.signalYellow; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(sx(fx), sy(pivY)); ctx.lineTo(sx(pivX), sy(pivY)); ctx.stroke();
      ctx.lineWidth = 3; for (let i = 0; i < 10; i++) { const x0 = fx + (pivX - fx) * i / 10, x1 = fx + (pivX - fx) * (i + 1) / 10; ctx.beginPath(); ctx.moveTo(sx(x0), sy(pivY) + 16); ctx.lineTo(sx(x1), sy(pivY) - 6); ctx.stroke(); }
      ctx.fillStyle = PAL.ink; ctx.fillRect(sx(fx) - 40, sy(pivY) - 40, 80, 60); ctx.fillStyle = PAL.sab; ctx.fillRect(sx(fx) - 22, sy(pivY) - 24, 44, 12);
      ctx.strokeStyle = PAL.ink; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(sx(pivX), sy(pivY)); ctx.lineTo(sx(bx), sy(by)); ctx.stroke();
      wreckingBall(ctx, sx(bx), sy(by), 30, S.realT);
      if (w.sweep < 0) { // target ring + countdown on the rope
        const k = w.tele / w.tele0, rr = 60 + 40 * k;
        ctx.strokeStyle = PAL.sab; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(sx(r.x), sy(r.y + 0.9), rr, 0, 7); ctx.stroke();
        ctx.fillStyle = hexA(PAL.sab, 0.18); ctx.fillRect(sx(r.x - 0.9), sy(r.y + 2.2), 0.9 * 2 * PXM, 2.2 * PXM);
        text(ctx, String(Math.ceil(w.tele)), sx(r.x), sy(r.y + 0.9) - 24, { scale: 7, color: PAL.sab, outline: 4, align: 'center' });
        text(ctx, 'MOVE OR DUCK', sx(r.x), sy(r.y) + 30, { scale: 3, color: PAL.bone, outline: 3, align: 'center' });
      }
      const lx = (sx(fx) + sx(pivX)) / 2;
      text(ctx, 'AI CRANE', lx, sy(pivY) + 34, { scale: 3, color: PAL.signalYellow, outline: 3, align: 'center' });
      srcTag(cr.src, lx, sy(pivY) + 70, { scale: 4 });
    }
  }

  // ---------- PATCH ----------
  function patch() {
    const P = S.P, spr = patchSprites();
    let frame, rot = P.theta, fx = sx(P.x), fy = sy(P.y);
    const phase = P.phase;
    if (phase === 'plunge' || phase === 'tip') { frame = spr.fall[Math.floor(S.realT * 8) % 2]; rot = P.fall ? P.fall.rot : P.theta; }
    else if (phase === 'landed' || (phase === 'recover' && !P.recovered)) { frame = spr.fall[0]; rot = Math.PI / 2 * (P.fall ? P.fall.dir : 1); fy -= 20; }
    else if (phase === 'harness') frame = spr.dangle[0];
    else if (phase === 'net') frame = spr.fall[Math.floor(S.realT * 8) % 2];
    else if (phase === 'lift') frame = spr.dangle[0];
    else if (P.crouch) frame = spr.crouch[0];
    else if (Math.abs(P.v) > 0.05) frame = spr.walk[Math.floor(P.walkAnim) % 4];
    else frame = Math.abs(P.theta) > BAL.DANGER ? spr.wobble[Math.floor(S.realT * 10) % 2] : spr.stand[Math.floor(S.realT * 1.5) % 2];
    if (phase === 'recover' && P.recovered) { const a = clamp((P.pt - 0.9) / 0.6, 0, 1); ctx.globalAlpha = a; }
    const hangLine = phase === 'harness' || phase === 'lift';
    if (hangLine) { // harness line to the anchor / trolley on the rope
      ctx.strokeStyle = PAL.help; ctx.lineWidth = 4; ctx.beginPath();
      if (phase === 'harness') { const a = S.world.anchors[S.resume.span]; ctx.moveTo(sx(a.x), sy(a.y) - 60); } else ctx.moveTo(fx, fy - PATCH_H * PATCH_SC - 30);
      ctx.lineTo(fx, fy - PATCH_H * PATCH_SC + 8); ctx.stroke();
      if (phase === 'lift') { ctx.fillStyle = PAL.machine; ctx.fillRect(fx - 26, fy - PATCH_H * PATCH_SC - 44, 52, 22); ctx.fillStyle = PAL.help; ctx.fillRect(fx - 20, fy - PATCH_H * PATCH_SC - 40, 40, 6); }
    }
    ctx.save(); ctx.translate(fx, fy); ctx.rotate(rot);
    const ox = -PATCH_W * PATCH_SC / 2, oy = -PATCH_H * PATCH_SC + (hangLine ? 0 : 6);
    // the balance pole (longer + teal tips under a LONGER POLE)
    if (phase === 'walk' || phase === 'summit') {
      const long = S.buff.pole && S.buff.pole.t > 0, half = (long ? 3.6 : 2.6) * PXM / 2, hy = oy + HANDS.y * PATCH_SC + 4 + (P.crouch ? 30 : 0);
      ctx.strokeStyle = PAL.ink; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(-half, hy + 14); ctx.quadraticCurveTo(0, hy - 8, half, hy + 14); ctx.stroke();
      ctx.strokeStyle = long ? PAL.help : '#B8A07A'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-half, hy + 14); ctx.quadraticCurveTo(0, hy - 8, half, hy + 14); ctx.stroke();
      ctx.fillStyle = PAL.ink; ctx.fillRect(-half - 10, hy + 4, 20, 20); ctx.fillRect(half - 10, hy + 4, 20, 20);
      ctx.fillStyle = long ? PAL.help : PAL.machine; ctx.fillRect(-half - 7, hy + 7, 14, 14); ctx.fillRect(half - 7, hy + 7, 14, 14);
      // pigeons perched on the pole ends
      const ends = { '-1': 0, 1: 0 };
      for (const q of S.haz.pigeons) {
        const n = ends[q.end]++, ps = sprite('pigeon'), ex = q.end * (half - 20 - n * 36);
        if (q.tele > 0) continue;
        drawSprite(ctx, ps, ex - ps.w / 2, hy - ps.h + 6 - n * 4, q.end < 0);
      }
    }
    drawSprite(ctx, frame, ox, oy);
    ctx.restore();
    ctx.globalAlpha = 1;
    // name tags for perched / incoming pigeons (upright)
    if (phase === 'walk') {
      const half = ((S.buff.pole && S.buff.pole.t > 0) ? 3.6 : 2.6) * PXM / 2;
      const cnt = { '-1': 0, 1: 0 };
      for (const q of S.haz.pigeons) {
        const n = cnt[q.end]++;
        const lx = q.end * (half - 20 - n * 36), ly = -PATCH_H * PATCH_SC + 6 + HANDS.y * PATCH_SC - 40;
        const wx = fx + Math.cos(rot) * lx - Math.sin(rot) * ly, wy = fy + Math.sin(rot) * lx + Math.cos(rot) * ly;
        if (q.tele > 0) { // flying in from above its end
          const k = q.tele / q.tele0, ps = sprite('pigeonFly');
          drawSprite(ctx, ps, wx + q.end * 200 * k - ps.w / 2, wy - 320 * k - ps.h / 2, q.end < 0);
          srcTag(q.src, wx + q.end * 200 * k, wy - 320 * k - 60, { scale: 3 });
        } else srcTag(q.src, wx, wy - 40 - n * 34, { scale: 3 });
      }
    }
    // helpers around PATCH
    if (S.buff.spotter && S.buff.spotter.t > 0 && phase === 'walk') {
      const ss = sprite('spotter'), dx = fx - 130 + Math.sin(S.realT * 2) * 10, dy = sy(P.y + 2.6) + Math.cos(S.realT * 3) * 8;
      ctx.strokeStyle = hexA(PAL.help, 0.6); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(dx, dy + 20); ctx.lineTo(fx, fy - 110); ctx.stroke();
      drawSprite(ctx, ss, dx - ss.w / 2, dy - ss.h / 2);
    }
    for (const f of S.flyoff) {
      if (f.peel) { const s = sprite('peel'); drawSprite(ctx, s, sx(f.x) + f.end * f.t * 200, sy(f.y) + f.t * f.t * 400, false, 1 - f.t / 2); continue; }
      const s = sprite('pigeonFly'); drawSprite(ctx, s, sx(f.x) + f.end * (120 + f.t * 300), sy(f.y) - 150 - f.t * 260, f.end < 0, 1 - f.t / 2);
    }
    for (const q of S.pops) { const a = Math.min(1, q.t * 2); if (q.tag) text(ctx, `${q.kind === 'steady' ? 'STEADY' : 'CHALK'} · ${q.tag}`, fx, fy - 240 - (1.2 - q.t) * 60, { scale: 3, color: PAL.help, outline: 3, align: 'center', alpha: a }); }
  }

  // gust streaks + telegraph arrows
  function gusts() {
    const P = S.P, py = sy(P.y + 1.2);
    for (const g of S.haz.gusts) {
      const from = -g.dir; // a gust pushing right comes from the left
      if (g.tele > 0) {
        const k = 1 - g.tele / g.tele0;
        arrow(from < 0 ? 150 : W - 150, py, g.dir, PAL.sab, 1);
        srcTag(g.src, from < 0 ? 200 : W - 200, py - 110, { scale: 3 });
        ctx.strokeStyle = hexA(PAL.bone, 0.5); ctx.lineWidth = 3;
        for (let i = 0; i < 6; i++) { const x = (from < 0 ? 0 : W) + g.dir * (k * W * 0.5 + i * 30 - 200), y = py - 120 + i * 40; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + g.dir * 90, y); ctx.stroke(); }
      } else {
        ctx.strokeStyle = hexA(PAL.bone, 0.7); ctx.lineWidth = 4;
        for (let i = 0; i < 8; i++) { const x = W / 2 + g.dir * ((g.t / g.dur) * W - W / 2) + (i % 3) * 40, y = py - 160 + i * 36; ctx.beginPath(); ctx.moveTo(x - g.dir * 120, y); ctx.lineTo(x, y); ctx.stroke(); }
      }
    }
  }
  function arrow(x, y, d, col, a) {
    ctx.globalAlpha = a; ctx.fillStyle = PAL.ink;
    const shape = (s, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x - d * 50 * s, y - 16 * s); ctx.lineTo(x + d * 10 * s, y - 16 * s); ctx.lineTo(x + d * 10 * s, y - 36 * s); ctx.lineTo(x + d * 56 * s, y); ctx.lineTo(x + d * 10 * s, y + 36 * s); ctx.lineTo(x + d * 10 * s, y + 16 * s); ctx.lineTo(x - d * 50 * s, y + 16 * s); ctx.closePath(); ctx.fill(); };
    shape(1.12, PAL.ink); shape(1, col);
    ctx.globalAlpha = 1;
  }

  function weather() {
    const Hz = S.haz, st = Hz.storm, P = S.P;
    if (st) {
      if (st.tele > 0) {
        const k = 1 - st.tele / st.tele0, from = -st.dir, edge = from < 0 ? -W + k * W * 0.55 : W - k * W * 0.55;
        ctx.fillStyle = hexA(PAL.storm, 0.85); ctx.fillRect(from < 0 ? edge : edge, VIEW_TOP, W, VIEW_H);
        const bx = from < 0 ? edge + W : edge;
        for (let i = 0; i < 12; i++) { ctx.fillStyle = hexA('#141826', 0.9); ctx.beginPath(); ctx.arc(bx, VIEW_TOP + 60 + i * 95, 80 + 20 * Math.sin(i * 2.3), 0, 7); ctx.fill(); }
        if (Math.floor(S.t * 3) % 5 === 0) { ctx.fillStyle = hexA(PAL.bone, 0.15); ctx.fillRect(0, VIEW_TOP, W, VIEW_H); }
        text(ctx, `STORM FRONT IN ${Math.ceil(st.tele)}`, W / 2, 790, { scale: 7, color: PAL.sab, outline: 5, align: 'center' });
        srcTag(st.src, W / 2, 858, { scale: 4 });
        text(ctx, 'CROUCH AND LEAN INTO IT', W / 2, 900, { scale: 3, color: PAL.bone, outline: 3, align: 'center' });
        arrow(W / 2, 960, st.dir, PAL.sab, 0.9);
      } else {
        ctx.fillStyle = hexA(PAL.storm, 0.35); ctx.fillRect(0, VIEW_TOP, W, VIEW_H);
        ctx.strokeStyle = hexA('#9FB3D0', 0.45); ctx.lineWidth = 2;
        for (let i = 0; i < 90; i++) { const x = (hash01(i, 21) * W + S.t * 500 * st.dir + i * 13) % W, y = VIEW_TOP + ((hash01(i, 22) * VIEW_H + S.t * 1400) % VIEW_H); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + st.dir * 22, y + 44); ctx.stroke(); }
        if ((S.t % 2.3) < 0.08) { ctx.fillStyle = hexA(PAL.bone, 0.4); ctx.fillRect(0, VIEW_TOP, W, VIEW_H); }
        const left = st.dur - st.t;
        text(ctx, `STORM ${Math.ceil(left)}s`, W / 2, 790, { scale: 4, color: PAL.sab, outline: 3, align: 'center' });
        srcTag(st.src, W / 2, 830, { scale: 3 });
        arrow(W / 2, 900, st.dir, hexA(PAL.sab, 0.8), 0.6);
      }
    }
    if (Hz.fog) { // fog bank: only a small circle round PATCH stays clear
      const a = Hz.fog.in * Math.min(1, Hz.fog.t);
      const px = sx(P.x), py = sy(P.y + 1);
      const g = ctx.createRadialGradient(px, py, 120, px, py, 300);
      g.addColorStop(0, hexA(PAL.fog, 0)); g.addColorStop(1, hexA(PAL.fog, 0.96 * a));
      ctx.fillStyle = g; ctx.fillRect(0, VIEW_TOP, W, VIEW_H);
      for (let i = 0; i < 6; i++) { ctx.fillStyle = hexA('#D8D2C6', 0.2 * a); ctx.fillRect(((S.t * 30 + i * 200) % (W + 400)) - 400, VIEW_TOP + 100 + i * 170, 400, 60); }
      text(ctx, `FOG ${Math.ceil(Hz.fog.t)}s`, W / 2, 1010, { scale: 3, color: PAL.ink, align: 'center', alpha: a });
      srcTag(Hz.fog.src, W / 2, 1044, { scale: 3, alpha: a });
    }
  }

  // ---------- HUD ----------
  function hud() {
    const P = S.P;
    ctx.fillStyle = 'rgba(26,20,20,0.74)'; ctx.fillRect(16, 576, 500, 168);
    text(ctx, `${Math.max(0, P.y).toFixed(1)} M UP`, 24, 584, { scale: 7, color: PAL.bone, outline: 4 });
    text(ctx, `SPAN ${Math.min(S.world.n, P.span + 1)}/${S.world.n} · CITY ${S.runNo + 1} · LV ${S.world.level}`, 26, 644, { scale: 3, color: PAL.sodium, outline: 3 });
    text(ctx, `SCORE ${Math.round(S.run.score).toLocaleString('en-US')} · FALLS ${S.run.falls}`, 26, 678, { scale: 3, color: PAL.bone, outline: 2 });
    text(ctx, `SHIFT ${fmtH(S.sessionT)}`, 26, 712, { scale: 3, color: S.softPrompt ? PAL.sodium : PAL.machine, outline: 2 });
    // FALLING counter
    if (P.phase === 'plunge' || P.phase === 'tip') {
      const drop = P.fall ? Math.max(0, P.fall.fromY - P.y) : 0;
      text(ctx, `FALLING −${drop.toFixed(0)} M`, W / 2, 1300, { scale: Math.min(11, 6 + drop / 18), color: PAL.sab, outline: 6, align: 'center' });
    }
    // team strip + heat
    const bx = W - 384, by = 530;
    ctx.fillStyle = 'rgba(26,20,20,0.78)'; ctx.fillRect(bx, by, 360, 108);
    ctx.fillStyle = PAL.help; ctx.fillRect(bx, by, 6, 108); ctx.fillStyle = PAL.sab; ctx.fillRect(bx + 354, by, 6, 108);
    let nh = 0, ns = 0; for (const t of S.teams.values()) t.team === 'help' ? nh++ : ns++;
    const tw = text(ctx, `HELP ${nh}`, bx + 18, by + 10, { scale: 3, color: PAL.help });
    text(ctx, ' · ', bx + 18 + tw, by + 10, { scale: 3, color: PAL.bone });
    text(ctx, `SAB ${ns}`, bx + 18 + tw + 54, by + 10, { scale: 3, color: PAL.sab });
    text(ctx, `+${Math.round(S.run.given)} M HELPED`, bx + 18, by + 44, { scale: 3, color: PAL.help });
    text(ctx, `${S.fallsTonight} FALLS TONIGHT`, bx + 18, by + 76, { scale: 3, color: PAL.sab });
    const hy = by + 114, frac = clamp(S.heat / S.knob.heatCap, 0, 1);
    ctx.fillStyle = 'rgba(26,20,20,0.78)'; ctx.fillRect(bx, hy, 360, 32);
    ctx.fillStyle = S.jammer > 0 ? PAL.help : mix(PAL.sodium, PAL.sab, frac); ctx.fillRect(bx + 4, hy + 4, 352 * (S.jammer > 0 ? S.jammer / 8 : frac), 24);
    text(ctx, S.jammer > 0 ? `JAMMER ${S.jammer.toFixed(1)}s` : `SAB HEAT ${Math.round(S.heat)}/${S.knob.heatCap}`, bx + 180, hy + 6, { scale: 3, color: PAL.bone, outline: 2, align: 'center' });
    // crowd meter (likes)
    const lx = W - 50, ly = 744, lh = 540, lf = clamp(S.crowd.charge / S.knob.crowdLikes, 0, 1);
    ctx.fillStyle = 'rgba(26,20,20,0.85)'; ctx.fillRect(lx, ly, 32, lh);
    ctx.fillStyle = lf >= 1 ? (Math.floor(S.realT * 8) % 2 ? PAL.bone : PAL.sodium) : PAL.sodium; ctx.fillRect(lx + 4, ly + 4 + (lh - 8) * (1 - lf), 24, (lh - 8) * lf);
    const tot = S.crowd.help + S.crowd.sab || 1;
    ctx.fillStyle = PAL.help; ctx.fillRect(lx - 8, ly + lh - lh * S.crowd.help / tot, 6, lh * S.crowd.help / tot);
    ctx.fillStyle = PAL.sab; ctx.fillRect(lx - 8, ly, 6, lh * S.crowd.sab / tot);
    text(ctx, 'LIKES', lx + 16, ly - 30, { scale: 2, color: PAL.bone, outline: 2, align: 'center' });
    if (S.crowd.boost.help || S.crowd.boost.sab) text(ctx, 'x2', lx + 16, ly + lh + 10, { scale: 3, color: S.crowd.boost.help ? PAL.help : PAL.sab, outline: 2, align: 'center' });
    // route progress (left margin): anchors + posters + PATCH
    const tx = 20, ty = 800, th = 560, total = S.cum[S.cum.length - 1];
    ctx.fillStyle = 'rgba(26,20,20,0.85)'; ctx.fillRect(tx, ty, 26, th);
    for (let i = 0; i <= S.world.n; i++) { const yy = ty + th - (S.cum[i] / total) * th; ctx.fillStyle = S.world.anchors[i].banked ? PAL.help : PAL.machine; ctx.fillRect(tx - 4, yy - 2, 34, 4); }
    for (const w of S.posters) if (w.state === 'wanted') { const yy = ty + th - (S.cum[w.span] / total) * th; ctx.fillStyle = PAL.sab; ctx.fillRect(tx + 26, yy - 12, 10, 8); }
    const pr = S.P.phase === 'walk' ? S.cum[S.P.span] + S.P.s : S.run.best;
    const py = ty + th - clamp(pr / total, 0, 1) * th;
    ctx.fillStyle = PAL.sodium; ctx.fillRect(tx - 6, py - 6, 38, 12);
    text(ctx, 'TOP', tx + 14, ty - 30, { scale: 3, color: PAL.bone, outline: 2, align: 'center' });
    wobbleMeter();
    // status icons
    const icons = [], B = S.buff;
    if (B.pole && B.pole.t > 0) icons.push([`POLE ${Math.ceil(B.pole.t)}`, PAL.help]);
    if (B.calm && B.calm.t > 0) icons.push([`CALM ${Math.ceil(B.calm.t)}`, PAL.help]);
    if (B.spotter && B.spotter.t > 0) icons.push([`SPOTTER ${Math.ceil(B.spotter.t)}`, PAL.help]);
    if (B.harness.length) icons.push([`HARNESS x${B.harness.length}`, PAL.help]);
    if (B.net && B.net.t > 0) icons.push([`NET ${Math.ceil(B.net.t)}`, PAL.help]);
    if (B.guide && B.guide.t > 0) icons.push([`GUIDE ${Math.ceil(B.guide.t)}`, PAL.help]);
    if (S.grace > 0) icons.push([`SECOND WIND ${Math.ceil(S.grace)}s`, PAL.help]);
    if (S.panic > 0) icons.push([`SAB HELD ${Math.ceil(S.panic)}s`, PAL.help]);
    if (S.sabQ.length + S.held.length > 0) icons.push([`QUEUED ${S.sabQ.length + S.held.length}`, PAL.bone]);
    let ix = 70;
    for (const [t, c] of icons) { const w = textW(t, 3) + 18; if (ix + w > W - 70) break; ctx.fillStyle = 'rgba(26,20,20,0.8)'; ctx.fillRect(ix, 1596, w, 36); text(ctx, t, ix + 9, 1603, { scale: 3, color: c }); ix += w + 8; }
    // anchor hint: SAB is aimed at the rope
    if (P.phase === 'walk' && P.s < BAL.SAFE_END && S.sabQ.length) text(ctx, `${S.sabQ.length} SAB WAITING ON THE ROPE`, W / 2, 1440, { scale: 3, color: PAL.sab, outline: 3, align: 'center' });
    S.chips.slice(-4).forEach((c, i, arr) => { const y = 1400 - (arr.length - 1 - i) * 42; const a = Math.min(1, c.t * 3); ctx.globalAlpha = a; const t = fitPx(c.text, 3, W - 180); const w = textW(t, 3) + 22; ctx.fillStyle = 'rgba(26,20,20,0.82)'; ctx.fillRect(70, y, w, 36); text(ctx, t, 81, y + 7, { scale: 3, color: c.color }); ctx.globalAlpha = 1; });
    const iv = S.knob.legendIntervalS, lg = legendPhase(S.sessionT, iv);
    if (lg) legend(Math.min(1, lg.k * 3, (LEGEND_T - lg.k) * 3));
    const hs = howToPhase(S.sessionT, iv);
    if (S.knob.howToPlay && hs && !S.cine && !S.cinema) howTo(hs);
    streamerHint();
    if (S.stamp) { const st = S.stamp; ctx.save(); ctx.translate(W / 2, 930); ctx.rotate(-0.1); const k = 1 + Math.max(0, st.t - 0.7) * 3; ctx.scale(k, k); text(ctx, st.text, 0, -40, { scale: 12, color: st.color, outline: 6, align: 'center', alpha: Math.min(1, st.t * 3) }); ctx.restore(); }
    if (S.banner && !S.paused && !S.onBreak && !S.over) { const b = S.banner, a = Math.min(1, b.t * 2), sc = Math.max(3, Math.min(8, Math.floor((W - 60) / (b.text.length * 6)))); ctx.fillStyle = `rgba(26,20,20,${0.8 * a})`; ctx.fillRect(0, 900, W, 150); text(ctx, b.text, W / 2, 960 - sc * 5, { scale: sc, color: b.color, outline: 4, align: 'center', alpha: a }); if (b.sub) text(ctx, b.sub, W / 2, 1000, { scale: 3, color: PAL.bone, outline: 2, align: 'center', alpha: a }); }
    if (S.cinema) cinemaBanner();
  }

  // wobble meter: the needle is PATCH's lean; red past the danger line; the arrow is what's pushing him
  function wobbleMeter() {
    const P = S.P;
    if (P.phase !== 'walk') return;
    const cx = W / 2, cy = 1560, r = 150;
    ctx.fillStyle = 'rgba(26,20,20,0.8)'; ctx.beginPath(); ctx.moveTo(cx - r - 20, cy); ctx.arc(cx, cy, r + 20, Math.PI, 0); ctx.fill();
    const ang = (th) => -Math.PI / 2 + clamp(th / BAL.FALL, -1.15, 1.15) * 1.2;
    const seg = (a0, a1, col) => { ctx.strokeStyle = col; ctx.lineWidth = 18; ctx.beginPath(); ctx.arc(cx, cy, r, ang(a0), ang(a1)); ctx.stroke(); };
    seg(-BAL.FALL, -BAL.DANGER, PAL.sab); seg(-BAL.DANGER, BAL.DANGER, PAL.help); seg(BAL.DANGER, BAL.FALL, PAL.sab);
    const a = ang(P.theta);
    ctx.strokeStyle = PAL.ink; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * (r + 12), cy + Math.sin(a) * (r + 12)); ctx.stroke();
    ctx.strokeStyle = Math.abs(P.theta) > BAL.DANGER ? PAL.sab : PAL.bone; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * (r + 10), cy + Math.sin(a) * (r + 10)); ctx.stroke();
    // lean input tick
    const ua = -Math.PI / 2 + P.u * 1.2 * 0.5;
    ctx.fillStyle = PAL.sodium; ctx.fillRect(cx + Math.cos(ua) * (r - 34) - 6, cy + Math.sin(ua) * (r - 34) - 6, 12, 12);
    const push = (P.ext || 0) + 0;
    if (Math.abs(push) > 0.3) arrow(cx + Math.sign(push) * 60, cy - 60, Math.sign(push), PAL.sab, clamp(Math.abs(push) / 3, 0.4, 1));
    if (P.crouch || P.grip < BAL.GRIP_MAX) { ctx.fillStyle = PAL.ink; ctx.fillRect(cx - 80, cy - 26, 160, 16); ctx.fillStyle = P.gripLock ? PAL.sab : PAL.sodium; ctx.fillRect(cx - 78, cy - 24, 156 * P.grip / BAL.GRIP_MAX, 12); text(ctx, 'GRIP', cx, cy - 58, { scale: 3, color: PAL.bone, outline: 2, align: 'center' }); }
  }

  function legend(a) {
    const x = W - 380, y = 690, w = 300, h = 420;
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(26,20,20,0.9)'; ctx.fillRect(x, y, w, h); ctx.fillStyle = PAL.machine; ctx.fillRect(x, y, w, 4);
    text(ctx, 'WHAT GIFTS DO', x + 150, y + 16, { scale: 3, color: PAL.bone, align: 'center' });
    const rows = [['ROSE', 'STEADY HANDS', PAL.help], ['FINGER HEART', 'GRIP CHALK', PAL.help], ['TIKTOK', 'GUST OF WIND', PAL.sab], ['PANDA', 'PIGEON', PAL.sab], ['10+ COINS', 'YOUR TEAM PICKS', PAL.bone], ['NO TEAM YET', 'COUNTS AS HELP', PAL.bone]];
    rows.forEach(([k, v, c], i) => { const ry = y + 54 + i * 60; text(ctx, k, x + 14, ry, { scale: 3, color: PAL.bone }); text(ctx, '→ ' + v, x + w - 14, ry + 27, { scale: 3, color: c, align: 'right' }); });
    ctx.globalAlpha = 1;
  }
  function howTo({ k }) {
    const tips = [
      ['COMMENT "HELP" OR "SAB" TO JOIN · FREE', PAL.bone],
      [`ROSE + FINGER HEART STEADY ${S.heroName}`, PAL.help],
      ['TIKTOK + PANDA GIFTS SABOTAGE', PAL.sab],
      ['LIKES FILL THE CROWD METER', PAL.sodium],
    ];
    const i = Math.min(tips.length - 1, Math.floor(k / (HOWTO_T / tips.length))), a = Math.min(1, k * 3, (HOWTO_T - k) * 3);
    const x = 64, y = 752, w = W - 128, h = 76;
    ctx.globalAlpha = a * 0.92; ctx.fillStyle = 'rgba(26,20,20,0.88)'; ctx.fillRect(x, y, w, h); ctx.fillStyle = PAL.sodium; ctx.fillRect(x, y, 6, h);
    ctx.globalAlpha = a;
    text(ctx, `HOW TO PLAY · ${i + 1}/${tips.length}`, x + 20, y + 8, { scale: 3, color: PAL.sodium });
    const [tip, col] = tips[i], sc = textW(tip, 4) <= w - 40 ? 4 : 3;
    text(ctx, tip, x + 20, y + 38, { scale: sc, color: col, outline: 2 });
    ctx.globalAlpha = 1;
  }
  function cinemaBanner() {
    const c = S.cinema, a = Math.min(1, c.t * 4, (c.dur - c.t) * 3), col = c.kind === 'extraction' ? PAL.help : PAL.sab;
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, VIEW_TOP, W, VIEW_H);
    ctx.fillStyle = col; ctx.fillRect(0, 860, W, 8); ctx.fillRect(0, 1180, W, 8);
    text(ctx, c.kind === 'extraction' ? 'EXTRACTION CALL' : 'THE OVERSEER', W / 2, 900, { scale: 10, color: col, outline: 5, align: 'center' });
    text(ctx, c.kind === 'extraction' ? 'BIRD-9 IS COMING FOR PATCH' : 'STORM + CRANE · HOLD ON', W / 2, 1000, { scale: 3, color: PAL.bone, outline: 3, align: 'center' });
    if (c.user) text(ctx, `COURTESY OF @${c.user.nickname}`, W / 2, 1060, { scale: 4, color: col, outline: 3, align: 'center' });
    if (c.kind === 'extraction') { const spr = sprite('bird'); const bxp = -300 + (W + 300) * clamp(c.t / c.dur, 0, 1); if (spr) drawSprite(ctx, spr, bxp, 700, true); }
    else { ctx.fillStyle = PAL.ink; ctx.beginPath(); ctx.ellipse(W / 2, 760, 200, 70, 0, 0, 7); ctx.fill(); ctx.fillStyle = PAL.sab; ctx.beginPath(); ctx.arc(W / 2 + Math.sin(c.t * 3) * 60, 760, 40, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
  }

  function summit() {
    const c = S.cine; if (!c) return;
    const t = c.t;
    const spr = sprite('bird');
    if (spr) { const bxp = W / 2 - spr.w / 2 + Math.sin(t) * 20, byp = sy(S.P.y + 4.5) - 60 - Math.max(0, 1.6 - t) * 300; ctx.strokeStyle = PAL.rust; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(W / 2, byp + 100); ctx.lineTo(sx(S.P.x), sy(S.P.y) - 128); ctx.stroke(); drawSprite(ctx, spr, bxp, byp); ctx.fillStyle = hexA(PAL.bone, 0.5); const rw = 170 * (0.6 + 0.4 * Math.abs(Math.sin(S.realT * 40))); ctx.fillRect(W / 2 - rw, byp - 4, rw * 2, 6); }
    for (let i = 0; i < 160; i++) { const x = hash01(i, 1) * W + Math.sin(t * 2 + i) * 40, y = VIEW_TOP + ((hash01(i, 2) * VIEW_H + t * (180 + hash01(i, 3) * 260)) % VIEW_H); ctx.fillStyle = [PAL.help, PAL.sab, PAL.sodium, PAL.bone][i % 4]; ctx.fillRect(x, y, 12, 8); }
    const a = Math.min(1, t * 2);
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(26,20,20,0.72)'; ctx.fillRect(0, 900, W, 200);
    const mm = Math.floor(c.runSec / 60), ss = String(Math.floor(c.runSec % 60)).padStart(2, '0');
    text(ctx, `SUMMIT #${c.n} · ${mm}:${ss}`, W / 2, 916, { scale: 9, color: PAL.sodium, outline: 5, align: 'center' });
    text(ctx, `SCORE ${c.score.toLocaleString('en-US')} · ${c.falls} FALLS · ${S.heroName} MADE THE ROOF`, W / 2, 1000, { scale: 3, color: PAL.bone, outline: 3, align: 'center' });
    ctx.save(); ctx.beginPath(); ctx.rect(0, 1110, W, 330); ctx.clip();
    let y = 1440 - Math.max(0, t - 1.5) * 90;
    text(ctx, 'THE RESISTANCE THANKS', W / 2, y, { scale: 4, color: PAL.help, outline: 3, align: 'center' }); y += 50;
    if (!c.helpersTop.length) { text(ctx, 'NOBODY. HE WALKED IT ALONE.', W / 2, y, { scale: 3, color: PAL.bone, outline: 2, align: 'center' }); y += 40; }
    for (const h of c.helpersTop) { text(ctx, `${h.name}  +${h.given.toFixed(1)} M`, W / 2, y, { scale: 3, color: PAL.bone, outline: 2, align: 'center' }); y += 40; }
    y += 30;
    text(ctx, 'THANKS FOR NOTHING', W / 2, y, { scale: 4, color: PAL.sab, outline: 3, align: 'center' }); y += 50;
    for (const h of c.sabsTop) { text(ctx, `${h.name}  ${h.falls} FALLS · −${Math.round(h.dropM)} M`, W / 2, y, { scale: 3, color: PAL.bone, outline: 2, align: 'center' }); y += 40; }
    ctx.restore();
    if (t > 5.5) { const b = Math.min(1, (t - 5.5) * 3); ctx.fillStyle = `rgba(140,35,49,${0.85 * b})`; ctx.fillRect(0, 1450, W, 110); text(ctx, `NEXT CITY: LEVEL ${c.nextLevel}`, W / 2, 1475, { scale: 7, color: PAL.bone, outline: 4, align: 'center', alpha: b }); }
    ctx.globalAlpha = 1;
  }

  // ---------- lane ----------
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
      const ry = y + 50 + i * 40, vw = textW(r.val, 3);
      text(ctx, String(i + 1), x + 14, ry, { scale: 3, color: PAL.bone });
      text(ctx, fitPx(r.name, 3, w - 72 - vw), x + 44, ry, { scale: 3, color: r.color || pg.color });
      text(ctx, r.val, x + w - 14, ry, { scale: 3, color: PAL.bone, align: 'right' });
    });
  }
  function card() {
    const c = S.card, age = c.t0 - c.t;
    const k = Math.min(1, age * 5, c.t * 5), e = 1 - Math.pow(1 - k, 3);
    const x = 90, y = LANE_TOP + 10 + (1 - e) * 280, w = 900, h = 260;
    const col = c.kind === 'revenge' || c.kind === 'save' ? PAL.help : c.kind === 'gravity' ? PAL.bone : PAL.sab;
    ctx.fillStyle = PAL.ink; ctx.fillRect(x - 6, y - 6, w + 12, h + 12);
    ctx.fillStyle = '#241A1A'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = col; ctx.fillRect(x, y, w, 8); ctx.fillRect(x, y + h - 8, w, 8);
    const name = c.user ? c.user.nickname : 'G';
    const hue = [...String(c.user ? c.user.id : 'gravity')].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 360, 0);
    ctx.fillStyle = c.user ? `hsl(${hue},55%,45%)` : PAL.machine; ctx.beginPath(); ctx.arc(x + 110, y + 130, 78, 0, 7); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 6; ctx.stroke();
    text(ctx, firstG(name).toUpperCase(), x + 110, y + 100, { scale: 9, color: PAL.bone, outline: 3, align: 'center' });
    const ic = c.kind === 'fall' ? { PIGEON: 'pigeon', PEEL: 'peel', DRONE: 'drone', SHAKE: 'shaker' }[c.effect] : null;
    const head = { fall: 'MADE HIM FALL', gravity: 'GRAVITY', save: 'CAUGHT!', revenge: 'REVENGE' }[c.kind];
    text(ctx, head, x + 220, y + 26, { scale: 3, color: col });
    text(ctx, fitPx(c.lines[0], 3, ic ? 520 : 660), x + 220, y + 70, { scale: 3, color: PAL.bone, outline: 2 });
    if (c.loss != null) text(ctx, `−${c.loss.toFixed(1)} M`, x + 220, y + 116, { scale: 8, color: col, outline: 4 });
    else text(ctx, c.kind === 'save' ? 'SAVED' : 'BUSTED', x + 220, y + 116, { scale: 8, color: col, outline: 4 });
    text(ctx, fitPx(c.lines[1], 3, 660), x + 220, y + 204, { scale: 3, color: PAL.machine });
    if (ic && sprite(ic)) { const s = sprite(ic), sc = Math.min(1.4, 140 / s.w, 120 / s.h); ctx.save(); ctx.translate(x + w - 100 - s.w * sc / 2, y + 40); ctx.scale(sc, sc); drawSprite(ctx, s, 0, 0); ctx.restore(); }
  }
  function fitPx(s, scale, maxW) {
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
    else if (S.onBreak) { title = 'ON BREAK'; sub = [`${S.heroName} IS SITTING ON THE LEDGE`, `GIFTS WAIT IN LINE (${S.held.length}) · ANY KEY RESUMES`]; col = PAL.help; }
    else if (S.paused) { title = 'PAUSED'; sub = [`GIFTS QUEUED: ${S.held.length} · THEY FIRE 0.5s APART`, streamerKeys ? 'P RESUME · F9 PANIC · F10 SETTINGS · F1 KEYS' : 'P RESUME']; }
    if (!title) return;
    ctx.fillStyle = 'rgba(12,9,9,0.78)'; ctx.fillRect(0, VIEW_TOP, W, VIEW_H);
    text(ctx, title, W / 2, 960, { scale: 14, color: col, outline: 6, align: 'center' });
    sub.forEach((l, i) => text(ctx, fitPx(l, 3, W - 60), W / 2, 1080 + i * 40, { scale: 3, color: i ? PAL.machine : PAL.bone, outline: 2, align: 'center' }));
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
  }
  function keyHelp() {
    ctx.fillStyle = 'rgba(12,9,9,0.94)'; ctx.fillRect(40, VIEW_TOP + 20, W - 80, VIEW_H - 40);
    text(ctx, 'STREAMER KEYS', W / 2, VIEW_TOP + 50, { scale: 6, color: PAL.sodium, align: 'center' });
    text(ctx, 'GAME HELD WHILE THIS IS OPEN · GIFTS WAIT IN LINE', W / 2, VIEW_TOP + 106, { scale: 2, color: PAL.bone, align: 'center' });
    const rows = [
      ['A D ← →', 'LEAN · COUNTER THE WOBBLE', 'L STICK'], ['W ↑', 'WALK FORWARD', 'RT · STICK UP'], ['S ↓', 'BACK UP', 'LT'],
      ['SPACE', 'CROUCH · GRIP THE ROPE', 'A · LB'], ['', 'GRIP RUNS OUT · DUCKS THE CRANE', ''], ['', 'CROUCH OVER A PEEL = SAFE', ''],
      null,
      ['P', 'PAUSE · GIFTS WAIT', 'START', PAL.help], ['F9', 'PANIC · CLEARS HAZARDS,', 'SELECT+START', PAL.sab], ['', '10s CALM, HOLDS SAB 60s', '', PAL.sab],
      ['F10', 'SETTINGS · AUTO-SAVED', '', PAL.help], ['M', 'MUSIC ON / OFF', ''], ['F1 · ESC', 'CLOSE THIS', ''],
    ];
    let y = VIEW_TOP + 160;
    for (const r of rows) {
      if (!r) { ctx.fillStyle = hexA(PAL.machine, 0.5); ctx.fillRect(80, y + 4, W - 160, 3); y += 26; continue; }
      const [k, a, pad, col] = r;
      text(ctx, k, 80, y, { scale: 4, color: col || PAL.sodium });
      text(ctx, a, 300, y + 4, { scale: 3, color: PAL.bone });
      text(ctx, pad, W - 80, y + 4, { scale: 3, color: PAL.machine, align: 'right' });
      y += 62;
    }
  }
  function streamerHint() {
    if (!streamerKeys || S.sessionT > 18 || S.help || S.settings.open) return;
    const a = Math.min(1, (18 - S.sessionT) * 2), t = 'STREAMER: F1 KEYS · P PAUSE · F9 PANIC · F10 SETTINGS';
    ctx.globalAlpha = a; ctx.fillStyle = 'rgba(26,20,20,0.85)'; ctx.fillRect(64, 846, textW(t, 3) + 28, 38); text(ctx, t, 78, 854, { scale: 3, color: PAL.bone }); ctx.globalAlpha = 1;
  }

  function render(c) {
    ctx = c; S = getState();
    shx = S.shake > 0 ? Math.sin(S.realT * 70) * 22 * Math.min(1, S.shake) : 0;
    shy = S.shake > 0 ? Math.cos(S.realT * 53) * 16 * Math.min(1, S.shake) : 0;
    if (!transparent) { ctx.fillStyle = '#0B0808'; ctx.fillRect(0, 0, W, VIEW_TOP); ctx.strokeStyle = hexA(PAL.machine, 0.35); ctx.lineWidth = 2; ctx.strokeRect(12, 12, W - 24, VIEW_TOP - 24); text(ctx, 'HOST CAM', W / 2, VIEW_TOP / 2 - 10, { scale: 3, color: hexA(PAL.machine, 0.5), align: 'center' }); }
    ctx.save();
    ctx.beginPath(); ctx.rect(0, VIEW_TOP, W, VIEW_H); ctx.clip();
    if (!transparent) background();
    banners();
    street();
    facade('L'); facade('R');
    posters();
    ledges();
    ropes();
    hazards();
    patch();
    gusts();
    weather();
    if (S.P.phase === 'recover') { const k = S.P.pt < 0.9 ? S.P.pt / 0.9 : 1 - (S.P.pt - 0.9) / 0.9; ctx.fillStyle = `rgba(10,8,12,${clamp(k, 0, 1) * 0.95})`; ctx.fillRect(0, VIEW_TOP, W, VIEW_H); if (k > 0.5) text(ctx, S.resume.planted ? `BACK TO ${S.resume.tag || 'THE ANCHOR'}` : `BACK TO ANCHOR ${S.resume.span}`, W / 2, 1060, { scale: 6, color: PAL.bone, outline: 4, align: 'center' }); }
    if (S.flash > 0) { ctx.fillStyle = `rgba(232,220,196,${Math.min(0.6, S.flash * 2)})`; ctx.fillRect(0, VIEW_TOP, W, VIEW_H); }
    if (S.slowmo > 0 && S.P.phase === 'tip') { ctx.strokeStyle = hexA(PAL.sab, 0.5); ctx.lineWidth = 40; ctx.strokeRect(0, VIEW_TOP, W, VIEW_H); }
    summit();
    hud();
    overlays();
    ctx.restore();
    lane();
  }
  return { render };
}
