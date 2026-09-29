// src/setpieces/flood.js — OWNER: setpieces agent.
// HOLLYWOOD (4-1): the water main bursts. Port of startBoat / updateBoat / drawFlood (lost-angeles-ed.html
// 1377-1424, trigger @1144): 40% into Hollywood a main blows ('waterBurst' geyser + spray), the street
// floods (tiled, flowing 'floodWater'), a 'speedBoat' floats up and WAITS until you jump on, then carries
// you ~1150px across. Jump off / fall in = you bob back up toward the boat (no death). At the far end the
// water recedes and the boat grounds on the pavement. The bitter punchline of the water throughline:
// none came for the fire — now it floods the street.  S.flags.flood = 'burst' | 'riding' | 'done'.
(function () {
  'use strict';
  const LA = window.LA, SP = LA.setpieces, GY = LA.K.GY;
  const BOAT_SPEED = 2.3, BOAT_W = 140, BOAT_H = 55, SEG = 1150, RISE = 1.3;   // his 112x44 boat, scaled with the hero art

  function geo(lv) {
    const zi = LA.city.zones.findIndex((z) => z.n === 'HOLLYWOOD'); if (zi < 0) return null;
    const hs = LA.city.seg[zi][0], he = LA.city.seg[zi][1];
    const fx0 = hs + (he - hs) * 0.4, fx1 = Math.min(he - 40, fx0 + SEG, lv.arena ? lv.arena.x - 300 : 1e9);   // his trigger @1144
    return !SP.inLevel(lv, fx0, 0) || fx1 < fx0 + 400 ? null : { fx0, fx1 };
  }
  SP.register('flood', {
    reserve(lv) { const g = geo(lv); return g ? [[g.fx0 - 300, g.fx1 + 160]] : []; },
    init(S, lv) {
      const g = geo(lv); if (!g) return { off: true };
      const fx0 = g.fx0, fx1 = g.fx1;
      SP.art(S, ['speedBoat', 'waterBurst', 'floodWater']);
      SP.clearRange(S, fx0 - 80, fx1 + 160);                                  // the flood owns this stretch
      SP.fillGround(S, fx0 - 80, fx1 + 160);
      const deck = { x: fx0 + 70, y: GY + 20, w: BOAT_W, h: 12, deck: true, kind: 'boat', onStand: (S2, p) => { p._floodDeck = S2.tick; } };
      return { fx0, fx1, phase: 'dry', lvl: 0, t: 0, rise: 0, deck, boatX: fx0 + 70, riding: false, splashT: 0, beached: null };
    },
    update(S, sp, dt) {
      if (sp.off || sp.phase === 'done') return;
      sp.t += dt;
      const p = SP.lead(S); if (!p) return;
      const deckY = GY - BOAT_H - 22, D = sp.deck;
      if (sp.phase === 'dry') {
        if (p.cx > sp.fx0 - 260 && p.cx < sp.fx1) {                           // the main blows
          sp.phase = 'burst'; sp.rise = 0;
          S.solids.push(D);
          LA.camera.kick(8); SP.sfx('bonk');
          SP.banner(S, 'WATER MAIN BURST!', 'NONE FOR THE FIRE · ALL OF IT FOR THE STREET', 3);
          S.flags.flood = 'burst';
        }
        return;
      }
      const slow = S.fx.slow || 1;
      if (sp.phase === 'burst') {                                             // water rises, the boat floats up and waits
        sp.rise = Math.min(1, sp.rise + dt / RISE);
        sp.lvl = sp.rise;
        D.y = LA.lerp(GY + 20, deckY, sp.rise);
      }
      const aboard = S.players.filter((q) => q._floodDeck === S.tick && q.active && !q.ghost);
      if (aboard.length && !sp.riding && sp.rise >= 1) { sp.riding = true; sp.phase = 'riding'; S.flags.flood = 'riding'; LA.pop(S, D.x + BOAT_W / 2, deckY - 60, 'HOLD ON!', '#bfe9ff', true); SP.sfx('power'); }
      if (sp.riding) {
        const dx = BOAT_SPEED * slow;
        D.x += dx; sp.boatX = D.x;
        for (const q of aboard) q.x += dx;                                    // carry the rider forward
        const prog = (D.x - sp.fx0) / Math.max(200, sp.fx1 - sp.fx0);
        sp.lvl = prog > 0.88 ? Math.max(0, (1 - prog) / 0.12) : 1;           // recedes over the last stretch
        D.y = deckY + (1 - sp.lvl) * 22;                                      // settles as the water drains
        if (D.x > sp.fx1) {                                                   // grounds on pavement, city resumes
          sp.phase = 'done'; sp.lvl = 0; S.flags.flood = 'done';
          S.solids = S.solids.filter((s) => s !== D);
          sp.beached = { x: D.x };
          for (const q of S.players) if (q.active && !q.ghost && q.x > sp.fx0 - 100 && q.x < sp.fx1 + 300 && q.y + q.h < GY - 2) q.vy = Math.max(q.vy, 0);
          SP.banner(S, 'BACK ON PAVEMENT', 'HOLLYWOOD ROLLS ON', 2.2);
          return;
        }
      }
      // fell in the flood — bob back up toward the boat, no death (his updateBoat@1392)
      if (sp.lvl > 0.35) {
        for (const q of S.players) {
          if (!q.active || q.ghost || q.riding) continue;
          const cx = q.x + q.w / 2;
          if (cx < sp.fx0 - 20 || cx > sp.fx1 + 20 || q._floodDeck === S.tick) continue;
          if (q.y + q.h > GY - 40) {                                          // treading water: the current drags you back to the boat
            q.vx = LA.clamp(q.vx, -2.2, 2.2); q.x += D.x + BOAT_W / 2 > cx ? 1.2 : -1.6;
          }
          if (q.y + q.h <= GY - 4) continue;
          q.y = GY - q.h - 3; q.vy = -4.2; q.jumps = 1; q.onGround = false;   // one hop left to get back aboard
          q.x += (D.x + BOAT_W / 2 > cx ? 2.4 : -1.2);
          q.inv = Math.max(q.inv, 18);
          sp.splashT -= dt; if (sp.splashT <= 0) { sp.splashT = 0.5; LA.pop(S, q.x + 8, GY - 46, 'splash', '#8fd6ff'); }
        }
      }
    },
    draw(ctx, S, sp, layer) {
      if (sp.off) return;
      const cam = LA.camera, VW = LA.view.VW, t = S.t;
      if (layer === 'ground') {
        if (sp.lvl > 0 && cam.visible(sp.fx0 - 60, sp.fx1 - sp.fx0 + 120, 20)) drawWater(ctx, sp, cam.x, VW, t, 1);
        if (sp.phase === 'done' && sp.beached && cam.visible(sp.beached.x, BOAT_W, 40)) {   // the boat, grounded on Hollywood Blvd
          const im = LA.img('speedBoat');
          if (im) { ctx.save(); ctx.translate(sp.beached.x + BOAT_W / 2, GY + 8); ctx.rotate(-0.06); ctx.drawImage(im, -BOAT_W / 2, -BOAT_H * 1.12, BOAT_W, BOAT_H * 1.12); ctx.restore(); }
        }
        return;
      }
      if (layer === 'back') {
        if (sp.phase === 'dry') return;
        const bx = sp.fx0;                                                    // BIG water-main burst, pulsed + spray
        if (!cam.visible(bx - 200, 400, 0) || sp.lvl <= 0.02) return;
        const im = LA.img('waterBurst');
        const bh = (205 + Math.sin(t * 6) * 14) * Math.min(1, 0.5 + sp.lvl * 0.6);
        if (im) { const bw = bh * im.naturalWidth / im.naturalHeight; ctx.drawImage(im, Math.round(bx - bw / 2), Math.round(GY - bh + 12), Math.round(bw), Math.round(bh)); }
        ctx.fillStyle = '#d2f0ff';
        for (let i = 0; i < 14; i++) {
          const a = ((t * 3) + i * 0.26) % 1, dx = Math.sin(i * 2.1) * 85 * a, dy = -205 * a * (1 - a) * 3.9;
          ctx.globalAlpha = 0.6 * (1 - a); ctx.beginPath(); ctx.arc(bx + dx, GY - 85 + dy, 3, 0, 7); ctx.fill();
        }
        ctx.globalAlpha = 1;
        if (sp.phase === 'burst' && sp.rise >= 1) SP.bubble(ctx, 'JUMP ON THE BOAT ▸', sp.deck.x + BOAT_W / 2, sp.deck.y - 70, '#0a5c8a', 12);
        return;
      }
      if (layer === 'front') {
        if (sp.phase === 'burst' || sp.phase === 'riding') {
          const D = sp.deck, im = LA.img('speedBoat'), bob = Math.sin(t * 4) * 2;
          if (cam.visible(D.x, BOAT_W, 40)) {
            if (im) ctx.drawImage(im, Math.round(D.x), Math.round(D.y - BOAT_H * 0.12 + bob), BOAT_W, Math.round(BOAT_H * 1.12));
            else { ctx.fillStyle = '#7a8596'; ctx.fillRect(D.x, D.y + bob, BOAT_W, BOAT_H); }
            if (sp.riding) {                                                   // wake off the stern
              ctx.fillStyle = '#e8f7ff';
              for (let i = 0; i < 5; i++) { const a = ((t * 2 + i / 5) % 1); ctx.globalAlpha = 0.7 * (1 - a); ctx.beginPath(); ctx.arc(D.x - a * 50, GY - 6 - Math.sin(a * 3) * 6, 3 + a * 6, 0, 7); ctx.fill(); }
              ctx.globalAlpha = 1;
            }
          }
        }
        if (sp.lvl > 0 && cam.visible(sp.fx0 - 60, sp.fx1 - sp.fx0 + 120, 20)) drawWater(ctx, sp, cam.x, VW, t, 0);   // front lip: feet sit IN the water
      }
    },
  });

  // his flowing-water band: tiled floodWater, alternate tiles mirrored so there's no seam
  function drawWater(ctx, sp, cam, VW, t, back) {
    const x0 = Math.max(cam - 40, sp.fx0 - 70), x1 = Math.min(cam + VW + 40, sp.fx1 + 70);
    const bandY = back ? GY - 10 : GY - 3, bandH = back ? 66 : 16;
    ctx.save();
    ctx.beginPath(); ctx.rect(sp.fx0 - 30, bandY - 34, (sp.fx1 + 30) - (sp.fx0 - 30), bandH + 60); ctx.clip();
    ctx.globalAlpha = Math.min(1, sp.lvl * 1.25) * (back ? 1 : 0.55);
    const wi = LA.img('floodWater');
    if (wi) {
      const tw = 66 * wi.naturalWidth / wi.naturalHeight, base = sp.fx0 - 70 + (t * 26) % (tw * 2);   // world-anchored, flowing
      for (let k = Math.floor((x0 - base) / (tw * 2)) * 2 - 2, tx = base + k * tw; tx < x1 + tw; k++, tx += tw) {
        if (tx + tw < x0) continue;
        const wob = Math.sin(tx * 0.04 + t * 2) * 2, flip = k & 1 ? -1 : 1;
        ctx.save(); ctx.translate(Math.round(tx + (flip < 0 ? tw : 0)), Math.round(bandY + wob)); ctx.scale(flip, 1); ctx.drawImage(wi, 0, 0, tw, bandH); ctx.restore();
      }
    } else { ctx.fillStyle = 'rgba(64,138,190,0.6)'; ctx.fillRect(x0, bandY, x1 - x0, bandH); }
    if (back) { ctx.fillStyle = '#e8f7ff'; ctx.globalAlpha *= 0.6; for (let x = Math.floor(x0 / 38) * 38; x < x1; x += 38) ctx.fillRect(Math.round(x + ((t * 30) % 38)), bandY + 2 + Math.sin(x * 0.1 + t * 3) * 2, 14, 2); }
    ctx.restore();
  }
})();
