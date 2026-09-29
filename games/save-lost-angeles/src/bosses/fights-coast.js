// src/bosses/fights-coast.js — OWNER: bosses agent.
// WORLD 1 · THE COAST: TOXIC BRUTE (Venice) · THE DEVELOPER (Palisades) · THE ADJUSTER (Malibu)
(function () {
  'use strict';
  const LA = window.LA, B = LA.bosses, GY = LA.K.GY;
  const tx = (S, b) => { const p = B.target(S, b); return p ? B.pcx(p) : b.cx() - 200; };
  const inA = (b, x, m) => LA.clamp(x, b.A.x + (m || 40), b.A.x + b.A.w - (m || 40));
  const handY = (b) => b.y + 22;
  // hop-and-slam helper: leaps (toward tgt if given), calls land() on touchdown
  function leap(S, b, vy, tgt, land) {
    b.vy = vy; b.air = true; const T = (2 * -vy) / b.grav;
    b.vx = tgt == null ? 0 : LA.clamp((tgt - b.cx()) / T, -6.5, 6.5);
    b.onLand = (S, b) => { b.vx = 0; LA.camera.kick(6); land && land(S, b); };
  }
  B.leap = leap;
  const airDone = (b, t) => t > 0.12 && !b.air;
  const airMove = (b, dt) => { if (b.air) b.x += b.vx * dt * 60; };

  // ------------------------------------------------------------------ TOXIC BRUTE — the Venice runoff
  B.register('TOXIC BRUTE', {
    art: 'enSewer', faces: -1, hit: [66, 86], hp: 7, phases: [0.6, 0.3], speed: [0.9, 1.2, 1.5], cd: [1.7, 1.35, 1.1],
    eyeY: 30, lastWords: 'BLUHHRGH...',
    headline: ['TOXIC BRUTE FLUSHED', 'Venice Beach reopens. City issues press release taking credit for the rain.'],
    quips: { 2: 'YOU STEPPED IN IT NOW', 3: 'THE PIPES ARE BACKING UP!' },
    seq: { 1: ['glob', 'glob', 'glob'], 2: ['glob', 'flop', 'glob'], 3: ['surge', 'glob', 'flop'] },
    attacks: {
      glob: { tell: 0.6, say: 'GLORP!', rec: 0.5,
        start(S, b) {
          const t = tx(S, b), n = b.phase === 1 ? 1 : 3, spread = b.phase === 3 ? 130 : 110;
          for (let i = 0; i < n; i++) {
            const aim = inA(b, t + (i - (n - 1) / 2) * spread);
            B.lobTo(S, b, b.cx() + b.face * 20, handY(b), aim, { T: 58 + i * 6, icon: 'glob', size: 26, r: 10,
              onLand(S, e) { B.puddle(S, b, e.x, { r: 36, life: 4.4, col: '#8bd450', label: 'GLORP' }); B.puff(S, e.x, GY - 10, 0.7); } });
          }
          B.sfx('shoot');
        } },
      flop: { ph: 2, tell: 0.75, say: 'BELLY FLOP!', rec: 0.8, max: 3,
        start(S, b) { leap(S, b, -13, tx(S, b), (S, b) => { B.shock(S, b, b.cx(), -1, { speed: 4.6, h: 20 }); B.shock(S, b, b.cx(), 1, { speed: 4.6, h: 20 }); B.puddle(S, b, b.cx(), { r: 44, life: 3, col: '#8bd450' }); }); },
        run(S, b, t, dt) { airMove(b, dt); return airDone(b, t); } },
      surge: { ph: 3, tell: 0.55, say: 'SEWER SURGE!', rec: 0.4, max: 2,
        start(S, b) {
          const t = tx(S, b);
          [t, t - 230, t + 230].forEach((x, i) => { x = inA(b, x, 50); B.marker(S, b, x, { warn: 0.95 + i * 0.12, w: 44, col: '#8bd450', icon: 'glob', fire: (S, x) => { B.column(S, b, x, { w: 38, h: 210, life: 0.8, col: '#8bd450' }); LA.camera.kick(3); } }); });
        } },
    },
  });

  // ------------------------------------------------------------------ THE DEVELOPER — permit walls + crane drops
  B.register('THE DEVELOPER', {
    art: 'developer', faces: -1, hit: [52, 92], hp: 8, phases: [0.6, 0.3], speed: [1.25, 1.5, 1.8], cd: [1.5, 1.2, 1.0],
    style: 'keep', keep: 290, lastWords: 'MY... EQUITY...',
    headline: ['DEVELOPER BUILDS NOTHING', 'Luxury tower "coming soon" since 2009. Units from $4.2M. Affordable units: zero. Permits: somehow approved.'],
    quips: { 2: 'ZONING? I AM THE ZONING.', 3: 'BURNED LOTS ARE CHEAP LOTS!' },
    seq: { 1: ['permits', 'prints', 'prints'], 2: ['permits', 'crane', 'prints'], 3: ['crane', 'permits', 'prints', 'crane'] },
    attacks: {
      permits: { tell: 0.7, say: 'PERMIT APPROVED!', rec: 0.5,
        start(S, b) {
          const p = B.target(S, b), px = p ? B.pcx(p) : b.cx() - 300;
          const hs = b.phase === 1 ? [72] : b.phase === 2 ? [92, 92] : [104, 70];
          const xs = hs.length === 1 ? [(px + b.cx()) / 2] : [px - 150, px + 150];
          hs.forEach((h, i) => { const x = B.clearOf(S, b, xs[i], 60, 60); B.wall(S, b, x, { h, w: 26, life: b.phase === 3 ? 3.6 : 4.2, warn: 0.8, style: 'scaffold', label: 'PERMIT' }); });
          B.sfx('bonk');
        } },
      prints: { tell: 0.45, say: 'SIGN HERE', rec: 0.35,
        start(S, b) { const t = tx(S, b); [-70, 40].forEach((o, i) => B.lobTo(S, b, b.cx() + b.face * 18, handY(b), inA(b, t + o * -b.face), { T: 52 + i * 14, icon: 'blueprint', size: 26, spin: 0.2 * b.face, bounce: 1 })); } },
      crane: { ph: 2, tell: 0.6, say: 'CRANE DROP!', rec: 0.4,
        start(S, b) {
          const n = b.phase === 2 ? 4 : 6, gap = (b.A.w - 120) / n, off = b.rng.range(0, gap * 0.5);
          for (let i = 0; i < n; i++) B.drop(S, b, b.A.x + 60 + off + i * gap, { delay: 0.85 + i * 0.16, icon: i % 2 ? 'beam' : 'brick', size: i % 2 ? 44 : 32, r: 13 });
          if (b.phase === 3) B.drop(S, b, tx(S, b), { delay: 1.1, icon: 'beam', size: 44, r: 13 });
        } },
    },
  });

  // ------------------------------------------------------------------ THE ADJUSTER — DENIED stamp-slam shockwaves
  function slam(S, b) {
    leap(S, b, -7.5, null, (S, b) => { B.shock(S, b, b.cx(), -1, { speed: 5.2 }); B.shock(S, b, b.cx(), 1, { speed: 5.2 }); LA.pop(S, b.cx(), GY - 110, 'DENIED', '#ff4d5e', true); B.sfx('bonk'); });
  }
  B.register('THE ADJUSTER', {
    art: 'adjuster', faces: -1, hit: [60, 90], hp: 8, phases: [0.6, 0.3], speed: [1.4, 1.6, 1.9], cd: [1.6, 1.3, 1.05],
    lastWords: 'I NEED TO SPEAK TO MY MANAGER',
    headline: ['ADJUSTER DENIED', 'Your claim has been reviewed. Coverage: none. Deductible: everything. Have a blessed day.'],
    quips: { 2: 'PRE-EXISTING CONDITION!', 3: 'ACT OF GOD. NOT COVERED.' },
    seq: { 1: ['slam', 'slam', 'slam'], 2: ['double', 'forms', 'slam'], 3: ['triple', 'forms', 'double'] },
    attacks: {
      slam: { tell: 0.7, say: 'DENIED!', rec: 0.55, max: 2, start(S, b) { slam(S, b); }, run(S, b, t) { return airDone(b, t); } },
      double: { ph: 2, tell: 0.65, say: 'DENIED! DENIED!', rec: 0.6, max: 3,
        start(S, b) { b.mem.n = 1; slam(S, b); },
        run(S, b, t) { if (b.mem.n === 1 && !b.air && t > 0.7) { b.mem.n = 2; slam(S, b); } return b.mem.n === 2 && airDone(b, t) && t > 0.9; } },
      triple: { ph: 3, tell: 0.8, say: 'CLAIM... APPEAL... DENIED!', rec: 0.3, max: 4,
        start(S, b) { b.mem.n = 1; slam(S, b); },
        run(S, b, t) {
          if (!b.air && b.mem.n < 3 && t > 0.62 * b.mem.n) { b.mem.n++; slam(S, b); }
          if (b.mem.n === 3 && airDone(b, t) && t > 1.5) { b.stun(1.6, '*wheeze*'); return true; }
          return false;
        } },
      forms: { ph: 2, tell: 0.5, say: 'READ THE FINE PRINT', rec: 0.3,
        start(S, b) {
          const t = tx(S, b);
          for (let i = 0; i < 3; i++) {
            const x0 = inA(b, t + (i - 1) * 130, 50);
            B.shot(S, b, { x: x0, y: 60, vx: 0, vy: 0.6, g: 0.012, r: 11, icon: 'stamp', size: 26, life: 9, shootable: true,
              pre(S, e, dt) { e.vx = Math.sin(e.age * 3 + i) * 1.4; e.rot = Math.sin(e.age * 3 + i) * 0.4; if (e.vy > 1.3) e.vy = 1.3; } });
          }
        } },
    },
  });
})();
