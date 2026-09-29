// src/setpieces/fbi.js — OWNER: setpieces agent.
// CRANK PARK (3-5): "the FBI is here to help". Two agents (code-drawn in his cartoon style: bold outline,
// flat fills — AGENT REYES and AGENT OKAFOR) advance with you, one out front and one covering the rear,
// and take down enemies on the way to the CRANK QUEEN. They hold the line at the arena gate (the boss is
// yours). When the arena seals they step inside: the bosses agent's CRANK QUEEN fight spawns S.flags.fbiAlive
// agents in the ring, so ours hand off and stop drawing. They never target citizens, props or the camp.
// Sets S.flags.fbi = 'escort' | 'holding' | 'inside' | 'closed', and S.flags.fbiAlive = 2.
(function () {
  'use strict';
  const LA = window.LA, SP = LA.setpieces, GY = LA.K.GY;
  const FW = 46, FH = 80, RANGE = 340, SHOOT_CD = 0.75;
  const AGENTS = [
    { name: 'AGENT REYES', skin: '#b5794f', skinD: '#8a5634', hair: '#241612', bun: true, lead: 96 },
    { name: 'AGENT OKAFOR', skin: '#5b3a26', skinD: '#3f271a', hair: '#0f0b0a', bun: false, lead: -74 },
  ];
  const LINES = ['FBI! STAY BEHIND US, CIVILIAN', 'FEDERAL HELP HAS ARRIVED', 'CLEAR!', 'PAPERWORK LATER', 'WE\'RE HERE TO HELP. MOSTLY.', 'COVER ME!'];
  const INK = '#120d10', NAVY = '#1d2b53', NAVYL = '#2c3f78', GOLD = '#ffd23a', SLACK = '#2a2d36';

  // pose: 0 stand, 1 walk A, 2 walk B, 3 shoot — faces right; flipped at draw time
  function agentArt(ai, pose) {
    const a = AGENTS[ai];
    return SP.cached('fbi' + ai + ':' + pose, FW, FH, (c) => {
      c.lineWidth = 2; c.strokeStyle = INK;
      const hip = 50, foot = 76, lx = pose === 1 ? -5 : pose === 2 ? 5 : 0;
      const leg = (x0, x1) => { c.lineWidth = 8; c.strokeStyle = INK; c.beginPath(); c.moveTo(x0, hip); c.lineTo(x1, foot - 4); c.stroke(); c.lineWidth = 5; c.strokeStyle = SLACK; c.beginPath(); c.moveTo(x0, hip); c.lineTo(x1, foot - 4); c.stroke();
        c.fillStyle = INK; c.beginPath(); c.ellipse(x1 + 2, foot - 2, 5, 2.6, 0, 0, 7); c.fill(); };
      leg(18, 18 + lx); leg(25, 25 - lx);
      // back arm
      c.lineCap = 'round'; c.lineWidth = 7; c.strokeStyle = INK; c.beginPath(); c.moveTo(15, 31); c.lineTo(13 - lx * 0.5, 47); c.stroke();
      c.lineWidth = 4; c.strokeStyle = NAVY; c.beginPath(); c.moveTo(15, 31); c.lineTo(13 - lx * 0.5, 47); c.stroke();
      // windbreaker
      c.fillStyle = NAVY; c.strokeStyle = INK; c.lineWidth = 2;
      c.beginPath(); c.moveTo(13, 28); c.lineTo(31, 28); c.lineTo(32, 52); c.lineTo(12, 52); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = NAVYL; c.fillRect(14, 29, 3, 22);
      c.fillStyle = '#fff'; c.beginPath(); c.moveTo(19, 28); c.lineTo(22, 33); c.lineTo(25, 28); c.fill();   // shirt collar
      c.fillStyle = GOLD; c.font = 'bold 8px ' + LA.FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('FBI', 23, 42);
      // head
      c.fillStyle = a.skin; c.beginPath(); c.arc(23, 17, 9, 0, 7); c.fill(); c.stroke();
      c.fillStyle = a.skinD; c.fillRect(20, 25, 6, 3);                     // neck shadow
      c.fillStyle = a.hair;
      if (a.bun) { c.beginPath(); c.arc(22, 14, 9, Math.PI * 0.95, Math.PI * 2.05); c.fill(); c.beginPath(); c.arc(14, 11, 4.5, 0, 7); c.fill(); c.stroke(); }
      else { c.beginPath(); c.arc(23, 15, 9, Math.PI * 1.02, Math.PI * 1.98); c.fill(); c.fillRect(14, 13, 3, 5); }
      c.fillStyle = INK; c.fillRect(22, 15, 10, 3.5); c.fillRect(20, 15.5, 3, 1.5);   // shades
      c.fillStyle = '#9fd8ff'; c.fillRect(27, 15.5, 3, 1);
      c.fillStyle = a.skinD; c.fillRect(26, 21, 4, 1.5);                   // mouth
      c.strokeStyle = '#e8e8e8'; c.lineWidth = 1; c.beginPath(); c.moveTo(16, 18); c.quadraticCurveTo(14, 24, 17, 28); c.stroke();   // earpiece coil
      // front arm (+ sidearm when shooting)
      c.lineWidth = 7; c.strokeStyle = INK; c.lineCap = 'round';
      const hand = pose === 3 ? [40, 33] : [30 + lx * 0.5, 48];
      c.beginPath(); c.moveTo(28, 31); c.lineTo(hand[0], hand[1]); c.stroke();
      c.lineWidth = 4; c.strokeStyle = NAVY; c.beginPath(); c.moveTo(28, 31); c.lineTo(hand[0], hand[1]); c.stroke();
      c.fillStyle = a.skin; c.beginPath(); c.arc(hand[0], hand[1], 2.6, 0, 7); c.fill();
      if (pose === 3) { c.fillStyle = INK; c.fillRect(40, 29, 6, 4); c.fillRect(40, 31, 2, 4); }
      else { c.fillStyle = INK; c.fillRect(28, 46, 4, 6); }                // holster
    });
  }

  SP.register('fbi', {
    init(S, lv) {
      const stopX = lv.arena ? lv.arena.x - 60 : (lv.goalX != null ? lv.goalX - 120 : lv.x1 - 200);
      const sx = Math.max(lv.x0 + 80, Math.min(S.lastCP, stopX - 300));
      S.flags.fbiAlive = AGENTS.length;                                      // read by the CRANK QUEEN fight (they can't go down out here)
      return {
        stopX, closed: false, inside: false,
        agents: AGENTS.map((a, i) => ({ i, x: sx + (i ? -70 : 110), jy: 0, vy: 0, vx: 0, face: 1, cd: 0.4 + i * 0.3, shootT: 0, walk: 0, sayT: 1.2 + i * 2.2, say: i, line: 0, tr: null })),
      };
    },
    update(S, sp, dt) {
      const p = SP.lead(S); if (!p) return;
      const VW = LA.view.VW;
      // (Full City Run) only escort inside this level's stretch
      if (p.cx < sp.level.x0 - 200 || p.cx > sp.level.x1 + 200) return;
      const A = S.arenas.find((X) => X.level === sp.level);
      if (A && A.sealed) sp.inside = true;                                   // handoff: the boss fight's own agents take over in the ring
      if (A && A.cleared) sp.closed = true;
      S.flags.fbi = sp.closed ? 'closed' : sp.inside ? 'inside' : (p.cx > sp.stopX ? 'holding' : 'escort');
      if (sp.inside) return;
      sp.agents.forEach((a, n) => {
        const stop = sp.stopX - (n ? 60 : 0);
        if (Math.abs(a.x - p.cx) > VW * 1.2) { a.x = Math.min(stop, p.cx + (n ? -160 : 160)); a.jy = -30; a.vy = 0; }   // catch up after a respawn
        const want = Math.min(stop, Math.max(sp.level.x0 + 20, p.cx + AGENTS[n].lead));
        const dx = want - a.x;
        if (Math.abs(dx) > 10) a.vx += (LA.sign(dx) * Math.min(4.9, 1.1 + Math.abs(dx) * 0.05) - a.vx) * 0.25; else a.vx *= 0.7;
        a.x += a.vx;
        if (Math.abs(a.vx) > 0.4) { a.walk += dt * 9; a.face = LA.sign(a.vx); }
        // hop over potholes / gaps instead of falling in
        if (a.jy < 0 || a.vy < 0) { a.vy += 0.8; a.jy += a.vy; if (a.jy >= 0) { a.jy = 0; a.vy = 0; } }
        else if (Math.abs(a.vx) > 0.4 && !LA.phys.floorAt(S, a.x + a.vx * 8)) a.vy = -9;
        // shoot the nearest foe in range
        a.cd -= dt; if (a.shootT > 0) a.shootT -= dt; if (a.tr) { a.tr.t -= dt; if (a.tr.t <= 0) a.tr = null; }
        if (a.cd <= 0) {
          let best = null, bd = RANGE;
          for (const e of S.ents) {
            if (!SP.isFoe(e) || /camp|tent|sitter/i.test(e.kind || '')) continue;
            const ex = e.x + (e.w || 0) / 2, d = Math.abs(ex - a.x);
            if (d < bd && LA.camera.visible(e.x, e.w || 0, -10) && ex < sp.stopX + 20) { bd = d; best = e; }
          }
          if (best) {
            a.cd = SHOOT_CD; a.shootT = 0.28; a.face = LA.sign(best.x + (best.w || 0) / 2 - a.x) || a.face;
            const gy = GY - FH + 33 + a.jy, ex = best.x + (best.w || 0) / 2, ey = best.y + (best.h || 30) * 0.4;
            a.tr = { x0: a.x + a.face * 22, y0: gy, x1: ex, y1: ey, t: 0.1 };
            SP.sfx('shoot', { vol: 0.5 });
            best._fbiHits = (best._fbiHits || 0) + 1;
            if (SP.kill(S, best, 'fbi', best._fbiHits >= 3)) { LA.game.score(S, 100); LA.pop(S, ex, ey - 24, 'NEUTRALIZED', '#8fd8ff'); }
          } else a.cd = 0.2;
        }
        a.sayT -= dt;
        if (a.sayT <= 0) { a.sayT = 4.5 + S.rng() * 3; a.line = 2.4; a.say = p.cx > sp.stopX - 260 ? -1 : Math.floor(S.rng() * LINES.length); }
        if (a.line > 0) a.line -= dt;
      });
    },
    draw(ctx, S, sp, layer) {
      if (layer !== 'front' || sp.inside) return;
      for (const a of sp.agents) {
        if (!LA.camera.visible(a.x - 30, 60, 30)) continue;
        const pose = a.shootT > 0 ? 3 : (Math.abs(a.vx) > 0.4 ? 1 + (Math.floor(a.walk) % 2) : 0), art = agentArt(a.i, pose);
        const x = Math.round(a.x), y = Math.round(GY - FH + 2 + a.jy);
        ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(x, GY + 2, 14, 3, 0, 0, 7); ctx.fill();
        if (art) { if (a.face < 0) { ctx.save(); ctx.translate(x, y); ctx.scale(-1, 1); ctx.drawImage(art, -FW / 2, 0); ctx.restore(); } else ctx.drawImage(art, x - FW / 2, y); }
        if (a.tr) {                                                          // tracer + muzzle flash
          ctx.strokeStyle = '#fff6b0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a.tr.x0, a.tr.y0); ctx.lineTo(a.tr.x1, a.tr.y1); ctx.stroke();
          ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.arc(a.tr.x0, a.tr.y0, 5, 0, 7); ctx.fill();
        }
        if (a.line > 0) SP.bubble(ctx, a.say === -1 ? 'SHE\'S ALL YOURS, KID' : LINES[a.say], x, y - 4, '#1d2b53', 10);
      }
    },
  });
})();
