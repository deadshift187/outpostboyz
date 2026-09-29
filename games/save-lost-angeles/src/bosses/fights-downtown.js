// src/bosses/fights-downtown.js — OWNER: bosses agent.
// WORLD 3 · DOWNTOWN: FLAGO (Echo Park) · THE VVS CREW (DTLA heist arena) · CRANK QUEEN (Crank Park + FBI escort)
(function () {
  'use strict';
  const LA = window.LA, B = LA.bosses, K = LA.K, GY = K.GY;
  const ART = () => LA.bossArt;
  const tx = (S, b) => { const p = B.target(S, b); return p ? B.pcx(p) : b.cx() - 200; };
  const inA = (b, x, m) => LA.clamp(x, b.A.x + (m || 40), b.A.x + b.A.w - (m || 40));
  const handY = (b) => b.y + 22;
  const airDone = (b, t) => t > 0.12 && !b.air;
  const alive = (b, pred) => b.things.filter((e) => !e.dead && pred(e)).length;

  // ------------------------------------------------------------------ FLAGO — flag sweep gusts + drifting ballots
  function ballot(S, b, x, y, dir, sp, ph) {
    return B.shot(S, b, { x, y, vx: dir * sp, vy: 0, flat: true, r: 11, icon: 'ballot', size: 24, shootable: true, life: 9, y0: y,
      pre(S, e) { e.y = e.y0 + Math.sin(e.age * 3 + ph) * 8; e.rot = Math.sin(e.age * 5 + ph) * 0.4; } });
  }
  // two readable lanes: LOW (hop it) and HIGH (stay under it). A trailing 3rd ballot comes 150px behind.
  const LOW = GY - 20, HIGH = GY - 118;
  function ballotWave(S, b, dir, n, sp) {
    ballot(S, b, b.cx() + dir * 30, LOW, dir, sp, 0);
    if (n > 1) ballot(S, b, b.cx() + dir * 30, HIGH, dir, sp, 1.5);
    if (n > 2) ballot(S, b, b.cx() - dir * 120, b.rng() < 0.5 ? LOW : HIGH, dir, sp, 3);
  }
  B.register('FLAGO', {
    art: 'flago', faces: -1, hit: [50, 92], hp: 9, phases: [0.6, 0.3], speed: [1.3, 1.55, 1.85], cd: [1.55, 1.3, 1.05],
    lastWords: 'THIS... IS... PERFORMATIVE...',
    headline: ['FLAGO WAVES GOODBYE', 'Echo Park flag-waver announces 14th farewell tour. The pothole on his block: still there, still waving back.'],
    quips: { 2: 'I CARE MORE THAN YOU!', 3: 'EVERYBODY LOOK AT ME CARING!' },
    seq: { 1: ['sweep', 'ballots', 'ballots'], 2: ['sweep', 'ballots', 'rally'], 3: ['rally', 'confetti', 'sweep', 'ballots'] },
    attacks: {
      sweep: { tell: 0.7, say: 'WAVE THE FLAG!', rec: 0.4, max: 2,
        start(S, b) { const t = tx(S, b), dir = t < b.cx() ? -1 : 1; B.gust(b, dir, b.phase === 1 ? 2.0 : 2.5, 1.5); ballotWave(S, b, dir, 1, 2.6); B.sfx('fire'); },
        run(S, b, t) { b.anim.rot = Math.sin(t * 14) * 0.1; return t > 1.5; } },
      ballots: { tell: 0.5, say: 'VOTE FOR ME!', rec: 0.35,
        start(S, b) { const dir = tx(S, b) < b.cx() ? -1 : 1; ballotWave(S, b, dir, b.phase === 1 ? 2 : 3, 2.5 + b.phase * 0.2); } },
      rally: { ph: 2, tell: 0.8, say: 'RALLY!', rec: 0.5, max: 3,
        start(S, b) { b.mem.rs = 0; },
        run(S, b, t) {
          if (b.mem.rs === 0) { B.gust(b, -1, 2.3, 0.9); b.mem.rs = 1; }
          if (b.mem.rs === 1 && t > 1.05) { B.gust(b, 1, 2.3, 0.9); b.mem.rs = 2; ballot(S, b, b.A.x + 30, LOW, 1, 2.6, 0); ballot(S, b, b.A.x + b.A.w - 30, HIGH, -1, 2.6, 1); }
          b.anim.rot = Math.sin(t * 14) * 0.1;
          return t > 2.1;
        } },
      confetti: { ph: 3, tell: 0.6, say: 'THROW THE BALLOTS!', rec: 0.4,
        start(S, b) { const t = tx(S, b); for (let i = 0; i < 6; i++) { const x = inA(b, t + (i - 2.5) * 95, 40); B.drop(S, b, x, { delay: 0.75 + (i % 3) * 0.22, icon: 'ballot', size: 26, r: 10, spin: 0.2 }); } } },
    },
  });

  // ------------------------------------------------------------------ THE VVS CREW — three looters in one arena
  const ROLES = [
    { role: 'runner', art: 'vvsThief', cd0: 1.2 },
    { role: 'thrower', art: 'vvsLoot', cd0: 2.2 },
    { role: 'lookout', art: 'vvsThief', cd0: 3.2, tint: '#ffd23a', tintA: 0.18 },
  ];
  function merch(S, b, x, y) {                                          // recovered VVS merch: grab it for points
    const e = B.thing(S, b, { x: x - 12, y: y - 12, w: 24, h: 24, vx: (b.rng() - 0.5) * 4, vy: -5, t: 0, layer: 'mid' });
    e.update = function (S, dt) { const k = dt * 60; this.t += dt; this.vy += 0.4 * k; this.x += this.vx * k; this.y += this.vy * k; this.vx *= Math.pow(0.97, k); if (this.y + this.h > GY) { this.y = GY - this.h; this.vy = 0; } this.x = inA(b, this.x, 20); if (this.t > 7) this.dead = true; };
    e.touch = function (S, p) { if (this.t < 0.35) return; this.dead = true; LA.game.score(S, 250, this.x + 12, this.y - 8, '#57e08a'); LA.pop(S, this.x + 12, this.y - 26, 'MERCH RECOVERED', '#a8ffd0'); B.sfx('crystal'); };
    e.draw = function (ctx) { if (this.t > 5.5 && Math.floor(this.t * 10) % 2) return; ctx.drawImage(ART().icon('loot'), this.x - 2, this.y - 4 + Math.sin(this.t * 6) * 2, 28, 28); };
    return e;
  }
  B.register('THE VVS CREW', {
    art: 'vvsThief', artKeys: ['vvsLoot'], faces: -1, hp: 12, phases: [], noReel: true, h: 84,
    lastWords: 'SCATTER!', eyeY: 20,
    headline: ['VVS CREW BAGGED', 'Merch returned to shelves. Store reopens with a 40% "we got robbed" markup. Crime stats "under review."'],
    init(S, b) {
      b.nPh = 3; b.w = 40; b.h = 66;
      const per = b.maxHp / 3;
      b.crew = ROLES.map((r, i) => ({ role: r.role, art: r.art, tint: r.tint, tintA: r.tintA, x: b.A.x + b.A.w * (0.55 + i * 0.14) - 20, y: GY - 66, w: 40, h: 66, vx: 0, vy: 0,
        hp: per, face: -1, st: 'intro', stT: 0, cd: r.cd0, inv: 0, flashT: 0, air: false, anim: { sx: 1, sy: 1, rot: 0, dy: 0, ox: 0 }, alive: true, ko: false, t: i }));
      b.stompTargets = () => b.crew.filter((c) => c.alive && !c.ko);
    },
    box(b) {
      let x0 = 1e9, x1 = -1e9, y0 = 1e9; for (const c of b.crew) if (c.alive && !c.ko) { x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x + c.w); y0 = Math.min(y0, c.y); }
      return x0 > x1 ? { x: -9e5, y: -9e5, w: 0, h: 0 } : { x: x0, y: y0, w: x1 - x0, h: GY - y0 };
    },
    tick(S, b, dt) {
      const k = dt * 60, kos = b.crew.filter((c) => c.ko).length, spd = (1 + kos * 0.28) * b.aggr;
      if (b.st === 'intro') { if (b.stT > 1.2) { b.go('move'); b.say('IT\'S A HEIST, BRO!', 1.4); } }
      if (b.st === 'phase' && b.stT > 1.0) b.go('move');
      const live = b.crew.filter((c) => c.alive && !c.ko);
      if (live.length) { const c0 = live[0]; b.x = c0.x; b.y = c0.y; }
      for (const c of b.crew) {
        if (!c.alive) continue;
        c.t += dt; c.stT += dt; if (c.inv > 0) c.inv -= k; if (c.flashT > 0) c.flashT -= dt;
        const a = c.anim; a.sx += (1 - a.sx) * Math.min(1, dt * 10); a.sy += (1 - a.sy) * Math.min(1, dt * 10); a.dy *= 0.8;
        if (c.ko) { c.vy += 0.5 * k; c.y += c.vy * k; c.x += c.vx * k; a.rot += 0.15 * k; if (c.y > 760) c.alive = false; continue; }
        // gravity
        if (c.air || c.y + c.h < GY - 0.5) { c.air = true; c.vy += 0.7 * k; c.y += c.vy * k; if (c.air && c.x) c.x += (c.lvx || 0) * k; if (c.vy > 0 && c.y + c.h >= GY) { c.y = GY - c.h; c.vy = 0; c.air = false; a.sy = 0.8; if (c.onLand) { const f = c.onLand; c.onLand = null; f(); } } }
        const tp = B.target(S, { cx: () => c.x + c.w / 2 }), dx = tp ? B.pcx(tp) - (c.x + c.w / 2) : 0;
        if (b.st !== 'move') { c.x = LA.clamp(c.x, b.L(), b.R() - c.w); continue; }
        if (c.st === 'intro') { c.st = 'move'; c.stT = 0; }
        if (c.st === 'move') {
          const want = c.role === 'runner' ? 200 : c.role === 'thrower' ? 330 : 150, adx = Math.abs(dx);
          c.vx = adx < want - 50 ? -Math.sign(dx) * 1.5 * spd : adx > want + 60 ? Math.sign(dx) * 1.5 * spd : Math.sin(c.t * 1.3 + c.hp) * 0.8;
          c.x += c.vx * k; c.face = dx < 0 ? -1 : 1; if (Math.abs(c.vx) > 0.3) a.dy = -Math.abs(Math.sin(c.t * 11)) * 3;
          c.cd -= dt * spd;
          if (c.cd <= 0 && !c.air) { c.st = 'tell'; c.stT = 0; c.face = dx < 0 ? -1 : 1; }
        } else if (c.st === 'tell') {
          a.ox = Math.sin(c.t * 55) * 1.5;
          if (c.stT > (c.role === 'runner' ? 0.65 : 0.5) / Math.sqrt(spd)) {
            a.ox = 0; c.st = 'act'; c.stT = 0;
            if (c.role === 'runner') { c.vx = c.face * 7.2 * Math.min(1.25, spd); LA.pop(S, c.x + 20, c.y - 20, 'SMASH & GRAB!', '#ffe36a'); }
            else if (c.role === 'thrower') { const n = kos >= 1 ? 2 : 1; for (let i = 0; i < n; i++) B.lobTo(S, b, c.x + 20 + c.face * 16, c.y + 16, inA(b, B.pcx(tp || c) + i * 90 * -c.face), { T: 50 + i * 14, icon: 'loot', size: 28, r: 11, spin: 0.15, onLand(S, e) { B.puff(S, e.x, GY - 10, 0.6); } }); }
            else { c.vy = -12; c.air = true; c.lvx = LA.clamp(dx / 34, -5, 5); c.onLand = () => { c.lvx = 0; B.shock(S, b, c.x + c.w / 2, -1, { speed: 4.4, h: 18 }); B.shock(S, b, c.x + c.w / 2, 1, { speed: 4.4, h: 18 }); LA.camera.kick(4); }; }
          }
        } else if (c.st === 'act') {
          if (c.role === 'runner') { c.x += c.vx * k; a.dy = -Math.abs(Math.sin(c.t * 22)) * 3; if ((c.vx < 0 && c.x <= b.L() + 1) || (c.vx > 0 && c.x + c.w >= b.R() - 1)) { c.vx = 0; c.st = 'rec'; c.stT = 0; LA.camera.kick(4); B.puff(S, c.x + 20, c.y + 30); } }
          else if (c.role === 'thrower' ? c.stT > 0.3 : (!c.air && c.stT > 0.2)) { c.st = 'rec'; c.stT = 0; }
        } else if (c.st === 'rec') { if (c.stT > 0.7) { c.st = 'move'; c.stT = 0; c.cd = (c.role === 'runner' ? 2.6 : c.role === 'thrower' ? 2.1 : 2.8) + b.rng.range(0, 0.8); } }
        c.x = LA.clamp(c.x, b.L(), b.R() - c.w);
      }
      return true;
    },
    touch(S, b, p) {
      for (const c of b.crew) {
        if (!c.alive || c.ko || !LA.aabb(p, c)) continue;
        B.contact(S, b, p, c, () => {
          const d = Math.min(1, c.hp); c.inv = 55; c.flashT = 0.16; c.hp -= 1; c.anim.sy = 0.7; c.anim.sx = 1.3; merch(S, b, c.x + 20, c.y + 10);
          b.hurtBy(S, d, 'stomp');
          if (c.hp <= 0.001) knock(S, b, c);
        });
        return;
      }
    },
    shot(S, b, shard) {
      const r = shard.box ? shard.box() : shard;
      for (const c of b.crew) if (c.alive && !c.ko && LA.aabb(r, c)) {
        if (b.shardCD <= 0 && b.st !== 'phase') { b.shardCD = 10; const d = Math.min(B.SHARD_DMG, c.hp); c.hp -= d; c.flashT = 0.07; b.hurtBy(S, d, 'shard'); if (c.hp <= 0.001) knock(S, b, c); }
        return true;
      }
      return false;
    },
    draw(ctx, S, b) {
      for (const c of b.crew) {
        if (!c.alive) continue;
        B.drawBody(ctx, S, b, c, { im: ART().sprite(c.art, 168), h: 84, noShadow: c.ko });
        if (c.st === 'tell' && !c.ko) { const ic = ART().icon('bang'); ctx.drawImage(ic, c.x + 8, c.y - 44, 24, 24); }
      }
      return true;
    },
    dieAnim() {},
  });
  function knock(S, b, c) {
    c.ko = true; c.hp = 0; c.vy = -10; c.vx = (c.x + 20 < b.A.x + b.A.w / 2 ? -1 : 1) * 2.5; c.st = 'ko';
    LA.pop(S, c.x + 20, c.y - 30, 'BAGGED!', '#57e08a', true); merch(S, b, c.x + 20, c.y + 10); merch(S, b, c.x + 20, c.y + 10);
    LA.camera.kick(6);
    const left = b.crew.filter((q) => !q.ko).length;
    if (left > 0) { b.phase = 4 - left; B.clear(S, b, false); b.go('phase'); B.powerDrop(S, b); b.say(left === 2 ? 'CREW DOWN! MOVE FASTER!' : 'IT\'S JUST ME NOW?!', 1.6, '#c0102a'); LA.game.flash(S, '#fff', 0.3); }
  }

  // ------------------------------------------------------------------ CRANK QUEEN — FBI escort + burner phones + lookouts
  function agent(S, b, x, i) {
    const e = B.thing(S, b, { x, y: GY - 60, w: 30, h: 60, t: i * 1.4, face: 1, cd: 2.4 + i * 1.3, daze: 0, layer: 'mid', ally: true, who: i ? 'fbiB' : 'fbiA', slot: i });
    e.update = function (S, dt) {
      this.t += dt; if (this.daze > 0) { this.daze -= dt; return; }
      const p = B.live(S)[0], home = p ? B.pcx(p) - 70 - this.slot * 44 : b.A.x + 100;
      const tgt = LA.clamp(home, b.A.x + 24, b.cx() - 90);
      this.x += LA.clamp(tgt - this.x, -2, 2) * dt * 60; this.face = b.cx() > this.x ? 1 : -1;
      this.cd -= dt;
      if (this.cd <= 0 && b.st !== 'phase' && b.st !== 'intro' && !b.defeated) { this.cd = 3.3 + b.rng.range(0, 1.2); this.shots = 3; this.shotT = 0; LA.pop(S, this.x + 15, this.y - 12, i ? 'FBI! FREEZE!' : 'HANDS UP!', '#ffe36a'); }
      if (this.shots > 0) { this.shotT -= dt; if (this.shotT <= 0) { this.shotT = 0.16; this.shots--; bullet(S, b, this.x + 15 + this.face * 16, this.y + 26, this.face); } }
    };
    e.draw = function (ctx) {
      const im = ART().drawn(this.who, this.shots > 0 ? 1 : 0), dh = 64, dw = dh * im.width / im.height, cx = this.x + 15;
      ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(cx, GY + 2, 16, 4, 0, 0, 7); ctx.fill();
      ctx.save(); ctx.translate(cx, GY + 1); if (this.daze > 0) ctx.rotate(0.35 * this.face); if (this.face > 0) ctx.scale(-1, 1); ctx.drawImage(im, -dw / 2, -dh, dw, dh); ctx.restore();
      if (this.daze > 0) { const ic = ART().icon('star'); for (let j = 0; j < 3; j++) { const a = this.t * 5 + j * 2.1; ctx.drawImage(ic, cx + Math.cos(a) * 14 - 5, GY - 66 + Math.sin(a) * 4, 10, 10); } }
    };
    return e;
  }
  function bullet(S, b, x, y, dir) {
    const e = B.thing(S, b, { x, y, vx: dir * 9, w: 8, h: 4, t: 0, layer: 'front', friendly: true });
    e.update = function (S, dt) {
      this.x += this.vx * dt * 60; this.t += dt; if (this.t > 1.5 || this.x < b.A.x || this.x > b.A.x + b.A.w) { this.dead = true; return; }
      if (!b.defeated && b.st !== 'phase' && LA.aabb({ x: this.x - 4, y: this.y - 3, w: 8, h: 6 }, b)) {
        this.dead = true; b.hurtBy(S, 0.07, 'shard'); B.puff(S, this.x, this.y, 0.5);
        if (!b.defeated && b.st === 'move' && !b.mem.frozeT) { b.mem.frozeT = 1; b.stun(0.9, 'UGH! FEDS!'); b.onUnstun = () => { b.mem.frozeT = 0; }; }
      }
    };
    e.draw = function (ctx) { ctx.fillStyle = '#ffe36a'; ctx.fillRect(this.x - 5, this.y - 2, 10, 4); ctx.fillStyle = 'rgba(255,227,106,.35)'; ctx.fillRect(this.x - 5 - this.vx * 1.5, this.y - 1, this.vx * 1.5, 2); };
    return e;
  }
  function dazeAllies(S, b, x, r) { for (const e of b.things) if (!e.dead && e.ally && Math.abs(e.x + 15 - x) < r && e.daze <= 0) { e.daze = 2.8; LA.pop(S, e.x + 15, e.y - 10, 'AGENT DOWN!', '#ff8a8a'); } }
  B.register('CRANK QUEEN', {
    art: 'crankQueen', artKeys: ['thief'], warmDrawn: ['fbiA', 'fbiB'], faces: -1, hit: [46, 92], hp: 11, phases: [0.6, 0.3], speed: [1.3, 1.5, 1.8], cd: [1.6, 1.3, 1.1],
    style: 'keep', keep: 280, lastWords: 'THE PARK... WAS MINE...',
    headline: ['CRANK QUEEN DETHRONED', 'Crank Park reopens. Lake still suspiciously absent. Feds file a 900-page report nobody will read.'],
    quips: { 2: 'THIS IS MY PARK!', 3: 'NOBODY FREEZES THE QUEEN!' },
    seq: { 1: ['phone', 'phone', 'phone'], 2: ['phone', 'lookouts', 'phone'], 3: ['throne', 'phone', 'lookouts', 'throne'] },
    onStart(S, b) {
      const n = S.flags && S.flags.fbiAlive != null ? LA.clamp(S.flags.fbiAlive | 0, 0, 2) : 2;
      for (let i = 0; i < n; i++) agent(S, b, b.A.x + 30 + i * 36, i);
      if (n) b.say('THE FEDS?! IN MY PARK?!', 1.6);
    },
    onDeath(S, b) { LA.pop(S, b.A.x + 120, GY - 120, 'FBI: CASE CLOSED!', '#ffe36a', true); },
    attacks: {
      phone: { tell: 0.5, say: 'BURNER PHONE!', rec: 0.4,
        start(S, b) {
          const t = tx(S, b), n = b.phase === 1 ? 1 : 2;
          for (let i = 0; i < n; i++) B.lobTo(S, b, b.cx() + b.face * 16, handY(b), inA(b, t + i * 120 * -b.face), { T: 52 + i * 12, icon: 'phone', size: 22, r: 9, spin: 0.25,
            onLand(S, e) {
              const x = e.x; dazeAllies(S, b, x, 50);
              const ring = B.thing(S, b, { x, y: GY - 12, t: 0, w: 10, h: 10, isShot: true, glow: true });
              ring.update = function (S, dt) { this.t += dt; if (this.t > 0.7) { this.dead = true; B.shock(S, b, x, -1, { speed: 3.8, h: 16, life: 0.9 }); B.shock(S, b, x, 1, { speed: 3.8, h: 16, life: 0.9 }); B.puff(S, x, GY - 10, 0.8); } };
              ring.draw = function (ctx) { const ic = ART().icon('phone'); const j = Math.sin(this.t * 60) * 2; ctx.drawImage(ic, x - 11 + j, GY - 24, 22, 22); if (Math.floor(this.t * 10) % 2) { ctx.font = 'bold 11px ' + LA.FONT; ctx.textAlign = 'center'; ctx.fillStyle = '#ffe36a'; ctx.strokeStyle = '#1b1220'; ctx.lineWidth = 3; ctx.strokeText('RING!', x, GY - 32); ctx.fillText('RING!', x, GY - 32); } };
            } });
        } },
      lookouts: { ph: 2, tell: 0.7, say: 'LOOKOUTS!', rec: 0.35, can: (S, b) => alive(b, (e) => e.isAdd) < 2,
        start(S, b) { const n = 2 - alive(b, (e) => e.isAdd); for (let i = 0; i < n; i++) B.add(S, b, b.A.x + b.A.w - 60 - i * 40, { art: 'thief', dh: 58, w: 26, h: 32, speed: 1.5 + i * 0.3, hp: 1, label: 'LOOKOUT' }); } },
      throne: { ph: 3, tell: 0.8, say: 'BOW TO THE QUEEN!', rec: 0.7, max: 3,
        start(S, b) { B.leap(S, b, -15, tx(S, b), (S, b) => { B.shock(S, b, b.cx(), -1, { speed: 5, h: 24 }); B.shock(S, b, b.cx(), 1, { speed: 5, h: 24 }); dazeAllies(S, b, b.cx(), 120); }); },
        run(S, b, t, dt) { if (b.air) b.x += b.vx * dt * 60; return airDone(b, t); } },
    },
  });
})();
