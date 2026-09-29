// src/setpieces/rv.js — OWNER: setpieces agent.
// THE GOLDEN CRUISER (2-1 Calabasas, 4-6 Bel Air — the calm rich districts). Port of startRide /
// updateRide / drawRide / drawBarricades (lost-angeles-ed.html 1449-1607): run into the CLOSED barricade at
// the top of the gated stretch and Golden Boy comes back behind the wheel of the Cruiser (his 'rv' art —
// that's him in the cab). It ploughs the stretch hoovering crystals, flattening foes and gate barricades,
// then wipes out ('rvDmg') and throws him clear: "BACK ON FOOT". Movement goes through p.riding.carry.
(function () {
  'use strict';
  const LA = window.LA, SP = LA.setpieces, K = LA.K, GY = K.GY;
  const RV_SPEED = 8.6, RV_MAGNET = 190, RV_H = 118, SINK = 34;       // his 96px cruiser, scaled with the hero art
  const GATES = ['PRIVATE ROAD', 'RESIDENTS ONLY', 'GATED', 'NO THRU TRAFFIC', 'HOA APPROVED'];

  // barricade = his obBarricade art with the CLOSED plate lettered in (cached once the art has decoded)
  function barricadeArt(txt) {
    return SP.cached('rvBar:' + txt, 120, 94, (c, w, h) => {
      const im = LA.img('obBarricade'); if (!im) return false;
      c.drawImage(im, 0, 0, w, h);
      c.fillStyle = '#1a1020'; c.font = 'bold ' + (txt.length > 8 ? 9 : 12) + 'px ' + LA.FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(txt, w * 0.5, h * 0.25);
    });
  }
  const rvSize = (key) => { const d = LA.dims(key) || [1183, 627]; return [RV_H * d[0] / d[1], RV_H]; };

  function geo(lv) {
    const bx = lv.x0 + 720, rideLen = LA.clamp(lv.len * 0.6, 3200, 5600);
    const endX = Math.min(lv.goalX != null ? lv.goalX - 1400 : (lv.arena ? lv.arena.x - 1200 : lv.x1 - 1400), bx + rideLen);
    return endX < bx + 1200 ? null : { bx, endX };
  }
  SP.register('rv', {
    // populate keeps the barricade and the wreck's landing strip clear
    reserve(lv) { const g = geo(lv); return g ? [[g.bx - 120, g.bx + 120], [g.endX - 60, g.endX + 760]] : []; },
    init(S, lv) {
      const g = geo(lv); if (!g) return { off: true };
      const bx = g.bx, endX = g.endX;
      SP.art(S, ['rv', 'rvDmg', 'obBarricade']);
      // the landing strip past the wreck is always safe street: no pits, hurdles or foes waiting for you
      SP.clearRange(S, endX - 60, endX + 760, (e) => !SP.isCitizen(e));
      SP.fillGround(S, endX - 60, endX + 760);
      SP.clearRange(S, bx - 90, bx + 90, (e) => SP.isFoe(e));
      const gates = [];
      for (let x = bx + 1100, i = 0; x < endX - 400; x += 1150, i++) gates.push({ x, txt: GATES[i % GATES.length], hit: false, fly: 0, vx: 0, vy: 0, fx: 0, fy: 0, rot: 0 });
      return { phase: 'wait', bx, endX, x: 0, t: 0, gates, bar: { hit: false, fly: 0 }, crashX: 0, smoke: 0 };
    },
    update(S, sp, dt) {
      if (sp.off) return;
      sp.t += dt;
      const [RW] = rvSize('rv');
      for (const g of sp.gates.concat([sp.bar])) if (g.fly > 0) { g.fly -= dt; g.fx += g.vx; g.fy += g.vy; g.vy += 0.6; g.rot += 0.18; }
      if (sp.phase === 'done') for (const p of S.players) if (p.riding && p.riding.rv === sp) p.riding = null;   // never leave anyone stuck in a carrier
      if (sp.phase === 'wait') {
        const hit = SP.live(S).find((p) => Math.abs(p.cx - sp.bx) < 40 && p.y + p.h > GY - 90);
        if (!hit) return;
        sp.phase = 'in'; sp.t = 0; sp.x = LA.camera.x - RW - 60;
        Object.assign(sp.bar, { hit: true, fly: 1.2, vx: 5, vy: -9, fx: 0, fy: 0, rot: 0, x: sp.bx, txt: 'CLOSED' });
        LA.camera.kick(5); SP.sfx('bonk');
        SP.banner(S, 'THE GOLDEN CRUISER', 'PLOUGH IT', 2.2);
        LA.city.hideBoats = true;
        S.flags.rv = 'ride';
      }
      const riders = SP.live(S);
      if (sp.phase === 'in') {                                               // the Cruiser roars up behind you
        const front = riders.reduce((m, p) => Math.max(m, p.cx), -1e9);
        sp.x = Math.max(sp.x + RV_SPEED * 1.5, front - RW * 0.55 - 700);     // never more than a beat behind
        for (const p of riders) if (!p.riding) p.riding = sp.hold || (sp.hold = { rv: sp, carry: holdCarry });
        if (sp.x + RW * 0.55 >= front || sp.t > 3) { sp.phase = 'ride'; sp.t = 0; SP.sfx('power'); }
        return;
      }
      if (sp.phase === 'ride') {
        sp.x += RV_SPEED;
        const front = sp.x + RW;
        riders.forEach((p, i) => {                                           // everyone piles into the cab
          p.riding = sp.drive || (sp.drive = { rv: sp, carry: driveCarry });
          p.x = sp.x + RW * (i ? 0.46 : 0.66) - p.w / 2; p.y = GY - p.h; p.vx = RV_SPEED; p.vy = 0;
          p.inv = 14;                                                        // in the cab (hidden) and untouchable
          p.lastSafe = Math.max(p.lastSafe || 0, sp.x);
        });
        const p0 = riders[0] || SP.lead(S), cy = GY - 60;
        for (const e of S.ents) {
          if (e.dead || e.alive === false) continue;
          const ex = e.x + (e.w || 0) / 2;
          if (ex < sp.x - 60 || ex > front + RV_MAGNET) continue;
          if (SP.isPickup(e) || SP.isCitizen(e)) {                          // hoover crystals / scoop up citizens
            const dx = (sp.x + RW * 0.6) - ex, dy = cy - (e.y + (e.h || 0) / 2);
            if (dx * dx + dy * dy < RV_MAGNET * RV_MAGNET) { e.x += dx * 0.16; e.y += dy * 0.16; }
            if (Math.abs(dx) < 50 && e.touch && p0) { try { e.touch(S, p0); } catch (err) { /* their pickup */ } }
          } else if (SP.isFoe(e) && ex < front + 30) {
            if (SP.kill(S, e, 'plough', true)) { LA.game.score(S, 200); LA.pop(S, ex, (e.y || GY - 40) - 10, 'PLOUGHED', '#ffb454'); LA.camera.kick(3); }
          }
        }
        for (const g of sp.gates) if (!g.hit && Math.abs(g.x - front + 20) < 60) {
          Object.assign(g, { hit: true, fly: 1.2, vx: RV_SPEED + 2, vy: -10, fx: 0, fy: 0, rot: 0 });
          LA.game.score(S, 400); LA.pop(S, g.x, GY - 80, 'SMASHED +400', '#ff7a2e'); LA.camera.kick(4); SP.sfx('bonk');
        }
        if (sp.x > sp.endX) {                                                // wipe out — thrown clear
          sp.phase = 'crash'; sp.t = 0; sp.crashX = sp.x; sp.smoke = 0;
          LA.camera.kick(9); SP.sfx('hurt');
          riders.forEach((p, i) => { p.riding = sp.throw || (sp.throw = { rv: sp, carry: throwCarry }); p.x = sp.x + RW * 0.7 - i * 20; p.y = GY - p.h - 30; p.vx = 4.6 - i * 0.6; p.vy = -12; p.inv = 9; });
        }
        return;
      }
      if (sp.phase === 'crash') {
        sp.smoke += dt;
        const flying = S.players.filter((p) => p.riding === sp.throw);
        if (!flying.length || sp.t > 3) {
          flying.forEach((p) => { p.riding = null; });
          sp.phase = 'done'; LA.city.hideBoats = false; S.flags.rv = 'done';
          SP.banner(S, 'WIPED OUT THE CRUISER', 'BACK ON FOOT', 2.0);
        }
        // anyone who wasn't aboard (a late P2) is freed too
        for (const p of S.players) if (p.riding === sp.hold || p.riding === sp.drive) p.riding = null;
        return;
      }
      if (sp.phase === 'done') sp.smoke += dt;
    },
    draw(ctx, S, sp, layer) {
      if (sp.off) return;
      const cam = LA.camera, VW = LA.view.VW;
      if (layer === 'back') {
        if (!sp.bar.hit && cam.visible(sp.bx - 60, 120, 60)) drawBar(ctx, sp.bx, 'CLOSED', 0, 0, 0);
        for (const g of sp.gates) if (!g.hit && cam.visible(g.x - 60, 120, 60)) drawBar(ctx, g.x, g.txt, 0, 0, 0);
        if (sp.phase === 'wait' && cam.visible(sp.bx - 60, 120, 60)) SP.bubble(ctx, 'HIT IT ▸', sp.bx, GY - 104, '#FF5A1F', 12);
        return;
      }
      if (layer !== 'front') return;
      for (const g of sp.gates.concat([sp.bar])) if (g.fly > 0) { ctx.save(); ctx.globalAlpha = Math.min(1, g.fly * 1.5); drawBar(ctx, (g.x != null ? g.x : sp.bx) + g.fx, g.txt || 'CLOSED', g.fy, g.rot, 1); ctx.restore(); }
      if (sp.phase === 'in' || sp.phase === 'ride') {
        const [w, h] = rvSize('rv');
        if (!cam.visible(sp.x, w, 40)) return;
        const bounce = sp.phase === 'ride' ? Math.abs(Math.sin(sp.t * 22)) * 2 : 0;
        LA.di(ctx, 'rv', Math.round(sp.x), Math.round(GY - h + SINK - bounce), Math.round(w), Math.round(h));
        if (sp.phase === 'ride') {                                           // speed lines + dust off the back wheels
          ctx.fillStyle = 'rgba(255,255,255,.55)';
          for (let i = 0; i < 5; i++) { const ly = GY - h * 0.2 - i * h * 0.16 + SINK, lx = sp.x - 30 - ((sp.t * 900 + i * 57) % 140); ctx.fillRect(Math.round(lx), Math.round(ly), 26 + i * 4, 3); }
          ctx.fillStyle = 'rgba(214,190,150,.6)';
          for (let i = 0; i < 4; i++) { const a = ((sp.t * 3 + i * 0.25) % 1); ctx.beginPath(); ctx.arc(sp.x + 12 - a * 60, GY + SINK - 6 - a * 18, 5 + a * 10, 0, 7); ctx.fill(); }
        }
      } else if (sp.phase === 'crash' || sp.phase === 'done') {              // his wreck: tips over at the crash point
        const [w, h] = rvSize('rvDmg');
        if (!cam.visible(sp.crashX - 40, w + 80, 40)) return;
        const im = LA.img('rvDmg');
        const tip = Math.min(0.34, sp.smoke * 1.4);                          // nose-plants: pivots on the front wheel, rear kicks up
        if (im) { ctx.save(); ctx.translate(sp.crashX + w * 0.92, GY + SINK - 6); ctx.rotate(tip); ctx.drawImage(im, -w * 0.92, -h, w, h); ctx.restore(); }
        ctx.fillStyle = '#3b3f48';                                           // smoke plume off the engine
        for (let i = 0; i < 7; i++) { const a = ((sp.smoke * 0.55 + i / 7) % 1); ctx.globalAlpha = 0.62 * (1 - a); ctx.beginPath(); ctx.arc(sp.crashX + w * 0.78 + Math.sin(i * 1.7 + a * 3) * 12 + a * 20, GY - h * 0.5 - a * 140, 10 + a * 22, 0, 7); ctx.fill(); }
        ctx.globalAlpha = 1;
      }
    },
  });

  function drawBar(ctx, x, txt, dy, rot, flying) {
    const art = barricadeArt(txt), w = 120, h = 94;
    ctx.save(); ctx.translate(Math.round(x), Math.round(GY + 4 + dy)); if (rot) ctx.rotate(rot);
    if (art) ctx.drawImage(art, -w / 2, -h, w, h);
    else {                                                                   // his code barricade (drawBarricades@1597) until the art decodes
      ctx.fillStyle = '#e0431f'; ctx.fillRect(-5, -58, 10, 58); ctx.fillStyle = '#ffd166'; ctx.fillRect(-31, -52, 62, 12);
      ctx.fillStyle = '#101014'; ctx.font = 'bold 8px ' + LA.FONT; ctx.textAlign = 'center'; ctx.fillText(txt, 0, -44); ctx.fillStyle = '#e0431f'; ctx.fillRect(-31, -30, 62, 10);
    }
    ctx.restore();
  }
  // p.riding carriers (the player hands movement over while these are set)
  function holdCarry(S, p) { p.vx *= 0.7; p.inv = Math.max(p.inv, 20); const r = LA.phys.move(S, p, {}); p.onGround = r.onGround; if (p.y > LA.view.VH) { p.y = GY - p.h; p.vy = 0; } }
  function driveCarry(S, p) { p.onGround = true; p.jumps = 0; }
  function throwCarry(S, p) {                                                 // thrown clear in an arc, lands running
    p.vx *= 0.985; p.inv = 9;                                                 // untouchable but visible mid-air (inv 5..9 draws)
    const r = LA.phys.move(S, p, { grav: 0.7 });
    if (r.onGround && p.vy >= 0) { p.onGround = true; p.riding = null; p.squash = 1; p.inv = 60; p.lastSafe = Math.max(p.lastSafe || 0, p.x); SP.sfx('land'); }
    else if (p.y > GY + 40) { p.y = GY - p.h; p.vy = 0; p.onGround = true; p.riding = null; p.inv = 60; }   // never fall through the wreck zone
  }
})();
