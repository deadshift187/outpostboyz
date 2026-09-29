// src/bosses/fights-valley.js — OWNER: bosses agent.
// WORLD 2 · THE VALLEY: THE PRODUCER (Studio City) · THE GATE AGENT (Burbank) · OFFICER CHALKSTICK (Glendale)
//                       · CODE ENFORCEMENT (Pasadena)
(function () {
  'use strict';
  const LA = window.LA, B = LA.bosses, GY = LA.K.GY;
  const tx = (S, b) => { const p = B.target(S, b); return p ? B.pcx(p) : b.cx() - 200; };
  const inA = (b, x, m) => LA.clamp(x, b.A.x + (m || 40), b.A.x + b.A.w - (m || 40));
  const handY = (b) => b.y + 22;
  const airDone = (b, t) => t > 0.12 && !b.air;
  const alive = (b, pred) => b.things.filter((e) => !e.dead && pred(e)).length;

  // ------------------------------------------------------------------ THE PRODUCER — "ACTION!" spotlight + drone extras
  function spotlight(S, b, dur, speed, x0) {
    const e = B.thing(S, b, { x: x0, y: GY - 10, w: 10, h: 10, t: 0, heat: [0, 0], layer: 'back', isShot: true, glow: true, glowR: 60 });
    e.update = function (S, dt) {
      const k = dt * 60; this.t += dt;
      const tp = B.target(S, { cx: () => this.x }); if (tp) this.x += LA.clamp(B.pcx(tp) - this.x, -speed * k, speed * k);
      this.x = inA(b, this.x, 30); this.y = GY - 10;
      for (const p of S.players) {
        const i = p.idx; if (!p.active || p.ghost) { this.heat[i] = 0; continue; }
        const inside = Math.abs(B.pcx(p) - this.x) < 44 && this.t > 0.5;
        this.heat[i] = inside ? this.heat[i] + dt : Math.max(0, this.heat[i] - dt * 1.5);
        if (this.heat[i] >= 0.85) { this.heat[i] = 0; if (p.hurt(S, 'boss')) LA.pop(S, B.pcx(p), p.y - 20, 'OVEREXPOSED!', '#ffe36a'); }
      }
      if (this.t > dur) this.dead = true;
    };
    e.draw = function (ctx) {
      const hot = Math.max(this.heat[0], this.heat[1] || 0) / 0.85, a = Math.min(1, this.t * 3, (dur - this.t) * 3);
      ctx.save(); ctx.globalAlpha = 0.34 * a;
      ctx.fillStyle = hot > 0.1 ? 'rgb(255,' + Math.round(230 - hot * 160) + ',' + Math.round(120 - hot * 100) + ')' : '#fff2a8';
      ctx.beginPath(); ctx.moveTo(this.x - 14, 0); ctx.lineTo(this.x + 14, 0); ctx.lineTo(this.x + 46, GY); ctx.lineTo(this.x - 46, GY); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.65 * a; ctx.beginPath(); ctx.ellipse(this.x, GY + 1, 46, 8, 0, 0, 7); ctx.fill();
      ctx.globalAlpha = a; ctx.strokeStyle = hot > 0.5 ? '#ff3d3d' : '#ffe36a'; ctx.lineWidth = 3; ctx.setLineDash([8, 6]); ctx.stroke(); ctx.setLineDash([]);
      if (this.t < 0.6) { ctx.font = 'bold 12px ' + LA.FONT; ctx.textAlign = 'center'; ctx.fillStyle = '#ffe36a'; ctx.strokeStyle = '#1b1220'; ctx.lineWidth = 3; ctx.strokeText('SPOTLIGHT', this.x, GY - 50); ctx.fillText('SPOTLIGHT', this.x, GY - 50); }
      ctx.restore();
    };
    return e;
  }
  B.register('THE PRODUCER', {
    art: 'bossProducer', faces: -1, hit: [58, 92], hp: 9, phases: [0.6, 0.3], speed: [1.2, 1.4, 1.7], cd: [1.5, 1.25, 1.05],
    style: 'keep', keep: 300, lastWords: 'CALL MY LAWYER. AND MY OTHER LAWYER.', artKeys: ['enDrone'],
    headline: ['PRODUCER CANCELLED', 'Studio cites "creative differences." Sequel greenlit anyway. Extras still waiting on their checks.'],
    quips: { 2: 'I WANT MORE DRONES!', 3: "YOU'LL NEVER WORK IN THIS TOWN AGAIN!" },
    seq: { 1: ['action', 'clap', 'clap'], 2: ['action', 'drones', 'clap', 'clap'], 3: ['action', 'wrap', 'drones', 'clap'] },
    attacks: {
      action: { tell: 0.7, say: 'ACTION!', rec: 0.3, can: (S, b) => alive(b, (e) => e.glowR === 60) === 0,
        start(S, b) { const t = tx(S, b); spotlight(S, b, b.phase === 1 ? 4.5 : 5.5, b.phase === 1 ? 2.3 : 2.7, inA(b, t + 220 * b.face, 30)); if (b.phase === 3) spotlight(S, b, 5.5, 1.6, inA(b, t - 260 * b.face, 30)); B.sfx('select'); } },
      clap: { tell: 0.45, say: 'CUT!', rec: 0.35,
        start(S, b) { const t = tx(S, b); [0, 1].forEach((i) => B.lobTo(S, b, b.cx() + b.face * 20, handY(b), inA(b, t + (i ? 60 : -40)), { T: 50 + i * 16, icon: 'clap', size: 28, spin: 0.18 * b.face })); } },
      drones: { ph: 2, tell: 0.6, say: 'GET ME DRONE COVERAGE!', rec: 0.3, can: (S, b) => alive(b, (e) => e.isAdd) < 2,
        start(S, b) {
          const n = 2 - alive(b, (e) => e.isAdd);
          for (let i = 0; i < n; i++) B.add(S, b, i ? b.A.x + 40 : b.A.x + b.A.w - 80, { art: 'enDrone', fly: true, y: GY - 170 - i * 20, dh: 34, w: 34, h: 22, hp: 1, diveEvery: 2.6 + i, faces: 1, label: 'CAM' });
        } },
      wrap: { ph: 3, tell: 0.8, say: "THAT'S A WRAP!", rec: 0.6, max: 2,
        start(S, b) { B.leap(S, b, -8, null, (S, b) => { B.shock(S, b, b.cx(), -1, { speed: 5, h: 26 }); B.shock(S, b, b.cx(), 1, { speed: 5, h: 26 }); LA.pop(S, b.cx(), GY - 116, 'CUT!', '#ffe36a', true); }); },
        run(S, b, t) { return airDone(b, t); } },
    },
  });

  // ------------------------------------------------------------------ THE GATE AGENT — boarding-denied gates + luggage
  function bag(S, b, x0, y0, tgt, T) {
    return B.lobTo(S, b, x0, y0, tgt, { T: T || 52, icon: b.rng() < 0.5 ? 'luggage' : 'luggage2', size: 30, r: 13, roll: true, stompable: true, shootable: true, spin: 0,
      pre(S, e) { if (e.flat) { e.vx = Math.sign(e.vx || 1) * Math.max(Math.abs(e.vx), 2.6); e.rot += e.vx * 0.02; } }, life: 8 });
  }
  B.register('THE GATE AGENT', {
    art: 'bossGateAgent', faces: -1, hit: [48, 92], hp: 9, phases: [0.6, 0.3], speed: [1.3, 1.5, 1.8], cd: [1.5, 1.25, 1.05],
    lastWords: 'YOU MAY NOW... DEPLANE...',
    headline: ['GATE AGENT DEPLANED', 'Flight 404 to Burbank still delayed. Passengers offered a $7 voucher and a firm handshake.'],
    quips: { 2: 'PLEASE REMAIN SEATED', 3: 'THIS FLIGHT IS NOW... CANCELLED!' },
    seq: { 1: ['gate', 'bags', 'bags'], 2: ['gate', 'carousel', 'bags'], 3: ['gate', 'carousel', 'stamp', 'bags'] },
    attacks: {
      gate: { tell: 0.85, say: 'BOARDING DENIED!', rec: 0.4, can: (S, b) => alive(b, (e) => e.isWall) === 0,
        start(S, b) {
          const p = B.target(S, b), px = p ? B.pcx(p) : b.cx() - 300, n = b.phase === 3 ? 2 : 1;
          for (let i = 0; i < n; i++) { const x = B.clearOf(S, b, n === 1 ? (px + b.cx()) / 2 : px + (i ? 190 : -190), 70, 70); B.wall(S, b, x, { h: 150, w: 22, life: 4, warn: 0.85, style: 'gate', label: 'GATE CLOSING' }); }
        } },
      bags: { tell: 0.5, say: 'CHECKED BAG FEE!', rec: 0.35,
        start(S, b) { const t = tx(S, b), n = b.phase === 1 ? 1 : 2; for (let i = 0; i < n; i++) bag(S, b, b.cx() + b.face * 20, handY(b), inA(b, t + (i ? 90 : -30) * b.face), 50 + i * 14); } },
      carousel: { ph: 2, tell: 0.6, say: 'NOW ARRIVING: YOUR BAGS', rec: 0.3, max: 3.2,
        start(S, b) { b.mem.cn = 0; const p = B.target(S, b); b.mem.cside = p && B.pcx(p) < b.A.x + b.A.w / 2 ? 1 : -1; },
        run(S, b, t) {
          const n = b.phase === 3 ? 5 : 4;
          if (b.mem.cn < n && t > b.mem.cn * 0.62) {
            const side = b.mem.cside, x = side > 0 ? b.A.x + b.A.w - 30 : b.A.x + 30;
            B.shot(S, b, { x, y: GY - 13, vx: -side * 3.3, vy: 0, flat: true, roll: true, r: 13, icon: b.mem.cn % 2 ? 'luggage' : 'luggage2', size: 30, stompable: true, shootable: true, life: 8, pre(S, e) { e.rot += e.vx * 0.02; } });
            b.mem.cn++;
          }
          return b.mem.cn >= n;
        } },
      stamp: { ph: 3, tell: 0.7, say: 'DENIED!', rec: 0.5, max: 2,
        start(S, b) { B.leap(S, b, -7.5, null, (S, b) => { B.shock(S, b, b.cx(), -1); B.shock(S, b, b.cx(), 1); LA.pop(S, b.cx(), GY - 110, 'DENIED', '#ff4d5e', true); }); },
        run(S, b, t) { return airDone(b, t); } },
    },
  });

  // ------------------------------------------------------------------ OFFICER CHALKSTICK — boot toss -> clamp hurdles, fast patrol, tow-zone dash
  function bootHurdle(S, b, x) {
    const boots = b.things.filter((e) => !e.dead && e.style === 'boot');
    if (boots.length >= 3) boots[0].cleanup(S);
    B.wall(S, b, inA(b, x, 40), { w: 40, h: 34, life: 5.5, warn: 0, style: 'boot', breakable: false });
  }
  B.register('OFFICER CHALKSTICK', {
    art: 'chalkstick', artKeys: ['bWheelClampBootOnTire'], faces: -1, hit: [50, 88], hp: 9, phases: [0.6, 0.3], speed: [2.0, 2.3, 2.6], cd: [1.6, 1.35, 1.15],
    lastWords: 'MY... METER... EXPIRED...',
    headline: ['CHALKSTICK TICKETED', 'Officer found parked in a red zone for eleven years. City waives the fine "as a professional courtesy."'],
    quips: { 2: "METER'S EXPIRED, PAL", 3: "I'M CALLING THE TOW TRUCK!" },
    seq: { 1: ['boot', 'ticket', 'boot'], 2: ['boot', 'tickets', 'boot', 'ticket'], 3: ['tow', 'boot', 'tickets', 'tow', 'boot'] },
    attacks: {
      boot: { tell: 0.55, say: "YOU'RE BOOTED!", rec: 0.35,
        start(S, b) { const t = tx(S, b), n = b.phase === 1 ? 1 : 2; for (let i = 0; i < n; i++) B.lobTo(S, b, b.cx() + b.face * 18, handY(b), inA(b, t + i * 110 * -b.face), { T: 54 + i * 12, icon: 'boot', size: 30, r: 12, spin: 0.15, onLand(S, e) { bootHurdle(S, b, e.x); } }); } },
      ticket: { tell: 0.45, say: 'TICKET!', rec: 0.3,
        start(S, b) { B.straight(S, b, b.cx() + b.face * 26, GY - 14, b.face, { speed: 4.4, icon: 'ticket', size: 24, r: 10 }); } },
      tickets: { ph: 2, tell: 0.5, say: 'TICKET! TICKET!', rec: 0.35, max: 2,
        start(S, b) { b.mem.tk = 0; },
        run(S, b, t) { if (b.mem.tk < 3 && t > b.mem.tk * 0.5) { const hi = b.mem.tk % 2 === 1; B.straight(S, b, b.cx() + b.face * 26, hi ? GY - 60 : GY - 14, b.face, { speed: 4.4, icon: 'ticket', size: 24, r: 10 }); b.mem.tk++; } return b.mem.tk >= 3; } },
      tow: { ph: 3, tell: 0.85, say: 'TOW ZONE!', rec: 0.2, max: 4,
        start(S, b) { b.vx = b.face * 8.5; LA.camera.kick(3); },
        run(S, b, t, dt) {
          b.x += b.vx * dt * 60; b.anim.dy = -Math.abs(Math.sin(t * 20)) * 3;
          if ((b.vx < 0 && b.x <= b.L() + 1) || (b.vx > 0 && b.x + b.w >= b.R() - 1)) { b.vx = 0; LA.camera.kick(8); B.puff(S, b.cx() + b.face * 30, b.y + 40, 1.2); b.stun(1.3, '*dizzy*'); return true; }
          return false;
        } },
    },
  });

  // ------------------------------------------------------------------ CODE ENFORCEMENT — RED TAG barricades at your feet
  function barricade(S, b, x) {
    B.marker(S, b, x, { warn: 0.8, w: 50, icon: 'redtag', fire: (S, x) => B.wall(S, b, x, { w: 54, h: 40, life: 6.5, warn: 0, style: 'barricade', breakable: true, hp: 1 }) });
  }
  B.register('CODE ENFORCEMENT', {
    art: 'codeenf', faces: -1, hit: [54, 90], hp: 10, phases: [0.6, 0.3], speed: [1.3, 1.55, 1.85], cd: [1.55, 1.3, 1.1],
    style: 'keep', keep: 270, lastWords: 'THIS IS... A VIOLATION...', artKeys: ['obBarricade'],
    headline: ['CODE ENFORCEMENT CITED', "Inspector's own office found in violation of 400 codes. Fine waived. Your fence is still two inches too tall."],
    quips: { 2: 'YOUR JOY IS NOT UP TO CODE', 3: 'THIS WHOLE BLOCK IS CONDEMNED!' },
    seq: { 1: ['redtag', 'cite', 'cite'], 2: ['redtag', 'inspect', 'cite'], 3: ['redtag', 'condemn', 'inspect', 'cite'] },
    attacks: {
      redtag: { tell: 0.6, say: 'RED TAG!', rec: 0.4,
        start(S, b) { const t = tx(S, b); if (b.phase === 1) barricade(S, b, inA(b, t, 50)); else [-110, 0, 110].forEach((o) => barricade(S, b, inA(b, t + o, 50))); } },
      cite: { tell: 0.45, say: 'CITATION!', rec: 0.35,
        start(S, b) { const t = tx(S, b); [0, 1].forEach((i) => B.lobTo(S, b, b.cx() + b.face * 18, handY(b), inA(b, t + (i ? 70 : -50)), { T: 48 + i * 16, icon: 'clipboard', size: 26, spin: 0.2 })); } },
      inspect: { ph: 2, tell: 0.7, say: 'INSPECTION!', rec: 0.6, max: 3,
        start(S, b) { B.leap(S, b, -13.5, tx(S, b), (S, b) => { B.shock(S, b, b.cx(), -1, { speed: 4.8, h: 20 }); B.shock(S, b, b.cx(), 1, { speed: 4.8, h: 20 }); }); },
        run(S, b, t, dt) { if (b.air) b.x += b.vx * dt * 60; return airDone(b, t); } },
      condemn: { ph: 3, tell: 0.9, say: 'CONDEMNED!', rec: 0.4, can: (S, b) => alive(b, (e) => e.style === 'barricade') > 0,
        start(S, b) {
          for (const w of b.things) if (!w.dead && w.style === 'barricade' && w.solid) { const cx = w.x + w.w / 2; w.cleanup(S); B.puff(S, cx, GY - 20, 1.3); B.shock(S, b, cx, -1, { speed: 4.2, h: 18 }); B.shock(S, b, cx, 1, { speed: 4.2, h: 18 }); }
          LA.camera.kick(8);
        } },
    },
  });
})();
