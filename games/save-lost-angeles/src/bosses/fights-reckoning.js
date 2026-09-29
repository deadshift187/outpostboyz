// src/bosses/fights-reckoning.js — OWNER: bosses agent.
// WORLD 5 · THE RECKONING: TWZ HOSTS (Playa Vista) · MAYOR BASURA (Long Beach ballot chase, + 'ballots' set-piece)
//                          · GOV. NEWSCUM (Alcatraz, FINAL)
(function () {
  'use strict';
  const LA = window.LA, B = LA.bosses, GY = LA.K.GY;
  const ART = () => LA.bossArt;
  const tx = (S, b) => { const p = B.target(S, b); return p ? B.pcx(p) : b.cx() - 200; };
  const inA = (b, x, m) => LA.clamp(x, b.A.x + (m || 40), b.A.x + b.A.w - (m || 40));
  const handY = (b) => b.y + 22;
  const airDone = (b, t) => t > 0.12 && !b.air;
  const alive = (b, pred) => b.things.filter((e) => !e.dead && pred(e)).length;
  const slamShocks = (S, b, o) => { B.shock(S, b, b.cx(), -1, o); B.shock(S, b, b.cx(), 1, o); };

  // ------------------------------------------------------------------ TWZ HOSTS — paparazzi swarm + flash whiteouts
  function pap(S, b, x) {
    return B.add(S, b, x, { art: b.rng() < 0.5 ? 'paparazzi' : 'paparazziF', dh: 60, w: 26, h: 32, speed: 1.7 + b.rng() * 0.5, hp: 1, label: 'PAP',
      ai(S, e, dt) {
        const tp = B.target(S, { cx: () => e.x + 13 }), dx = tp ? B.pcx(tp) - (e.x + 13) : 0, k = dt * 60;
        e.vx = Math.abs(dx) > 50 ? Math.sign(dx) * e.speed : 0; LA.phys.move(S, e, { grav: LA.K.GRAV, maxFall: 14 }); if (e.vx) e.face = e.vx < 0 ? -1 : 1;
        e.x = LA.clamp(e.x, b.A.x + 4, b.A.x + b.A.w - 30);
        e.ft = (e.ft || 2 + b.rng() * 2) - dt;
        if (e.ft <= 0 && Math.abs(dx) < 260) { e.ft = 3.2 + b.rng() * 1.5; LA.game.flash(S, '#ffffff', 0.32); LA.pop(S, e.x + 13, e.y - 30, 'FLASH!', '#ffe36a'); B.sfx('select'); }
        void k;
      } });
  }
  B.register('TWZ HOSTS', {
    art: 'leech', artKeys: ['paparazzi', 'paparazziF'], faces: -1, hit: [96, 86], h: 100, hp: 11, phases: [0.6, 0.3], speed: [1.2, 1.4, 1.65], cd: [1.55, 1.3, 1.05],
    style: 'keep', keep: 290, lastWords: "CUT THE FEED! CUT THE FEED!",
    headline: ['TWZ HOSTS: "NO COMMENT"', 'Gossip show runs 11 minutes on its own defeat, calls it "exclusive footage." Ratings: up.'],
    quips: { 2: "WE'RE GOING LIVE!", 3: 'THIS IS GOING VIRAL!' },
    seq: { 1: ['flash', 'mics', 'paps', 'mics'], 2: ['flash', 'paps', 'mics', 'flash'], 3: ['breaking', 'flash', 'paps', 'mics'] },
    attacks: {
      flash: { tell: 1.0, say: 'SAY CHEESE! 3...', rec: 0.5, max: 2,
        tellTick(S, b, t) { const n = 3 - Math.floor(t / (b.tellT / 3)); if (b.bubble) b.bubble.txt = n >= 3 ? 'SAY CHEESE! 3...' : n === 2 ? '2...' : '1...'; },
        start(S, b) { LA.game.flash(S, '#ffffff', b.phase === 1 ? 0.8 : 0.9); LA.camera.kick(5); B.sfx('select'); const p = B.target(S, b); b.vx = (p && B.pcx(p) < b.cx() ? -1 : 1) * 5.5; b.mem.fl2 = b.phase > 1 ? 0 : 1; },
        run(S, b, t, dt) {
          if (t < 0.5) b.x += b.vx * dt * 60; else b.vx = 0;
          if (!b.mem.fl2 && t > 1.0) { b.mem.fl2 = 1; LA.game.flash(S, '#ffffff', 0.7); slamShocks(S, b, { speed: 4.4, h: 20, icon: 'camera', size: 28 }); }
          return t > (b.phase > 1 ? 1.3 : 0.7);
        } },
      mics: { tell: 0.5, say: 'ANY COMMENT?!', rec: 0.35,
        start(S, b) { const t = tx(S, b); [-50, 80].forEach((o, i) => B.lobTo(S, b, b.cx() + b.face * 30, handY(b), inA(b, t + o * -b.face), { T: 48 + i * 14, icon: 'mic', size: 26, r: 10, spin: 0.3 })); } },
      paps: { tell: 0.6, say: 'GET THE SHOT!', rec: 0.3, can: (S, b) => alive(b, (e) => e.isAdd) < 3 && (S.flags.papz || 0) < 3,
        start(S, b) { const n = Math.min(b.phase === 1 ? 1 : 2, 3 - alive(b, (e) => e.isAdd)); for (let i = 0; i < n; i++) pap(S, b, i % 2 ? b.A.x + 20 : b.A.x + b.A.w - 50); } },
      breaking: { ph: 3, tell: 0.6, say: 'BREAKING NEWS!', rec: 0.35, max: 2,
        start(S, b) { b.mem.bn = 0; },
        run(S, b, t) { if (b.mem.bn < 3 && t > b.mem.bn * 0.45) { const hi = b.mem.bn === 1; B.straight(S, b, b.cx() + b.face * 40, hi ? GY - 60 : GY - 16, b.face, { speed: 5, icon: 'news', size: 26, r: 11, flipX: false }); b.mem.bn++; } return b.mem.bn >= 3; } },
    },
  });

  // ------------------------------------------------------------------ MAYOR BASURA — the ballot-box chase (Saint's setupBasura/updateBasura)
  const BALLOT_H = 42;
  const boxAsp = () => { const im = LA.img('ballotBox'); return im && im.naturalWidth ? im.naturalWidth / im.naturalHeight : 0.62; };
  function voteCard(S, owner, x, y, clampFn) {
    const e = B.thing(S, owner, { x: x - 11, y: y - 11, w: 22, h: 22, vx: (Math.random() - 0.5) * 5, vy: -4 - Math.random() * 2.5, t: 0, layer: 'mid' });
    e.update = function (S, dt) { const k = dt * 60; this.t += dt; this.vy += 0.4 * k; this.x += this.vx * k; this.y += this.vy * k; this.vx *= Math.pow(0.98, k); if (this.y + this.h > GY) { this.y = GY - this.h; this.vy *= -0.3; this.vx *= 0.8; } if (clampFn) this.x = clampFn(this.x); if (this.t > 6) this.dead = true; };
    e.touch = function (S, p) { if (this.t < 0.4) return; this.dead = true; LA.game.score(S, 100, this.x + 11, this.y - 6, '#57e08a'); B.sfx('crystal'); };
    e.draw = function (ctx) { if (this.t > 4.8 && Math.floor(this.t * 10) % 2) return; const ic = ART().icon('vote'); ctx.drawImage(ic, this.x - 4, this.y - 2 + Math.sin(this.t * 7) * 2, 30, 26); };
    return e;
  }
  function ballotBox(S, owner, x, s, onPop) {
    const e = B.thing(S, owner, { x, s, grow: 0, visited: false, popped: false, isBox: true, layer: 'mid', w: 10, h: 10, t: 0 });
    e.dims = function () { const h = BALLOT_H * this.s * (1 + Math.max(0, this.grow) * 0.5), w = h * boxAsp(); return { x: this.x - w / 2, y: GY - h, w, h }; };
    e.box = function () { const d = this.dims(); return { x: d.x + d.w * 0.15, y: d.y, w: d.w * 0.7, h: d.h }; };
    e.update = function (S, dt) { this.t += dt; if (this.grow > 0) this.grow -= dt * 1.5; const d = this.dims(); this.y = d.y; this.h = d.h; };
    e.touch = function (S, p) {
      if (this.popped) return; const r = this.box();
      if (p.vy > 0 && (p.y + p.h - r.y) < 30) { this.popped = true; this.dead = true; p.vy = -11.5; p.jumps = 1; LA.game.score(S, 300, this.x, r.y - 6, '#41ff6b'); LA.pop(S, this.x, r.y - 24, 'POP! DENIED', '#41ff6b', true); B.puff(S, this.x, r.y + r.h / 2, 1.2); for (let k = 0; k < 3; k++) voteCard(S, owner, this.x, GY - 46, owner ? (x) => inA(owner, x, 20) : null); B.sfx('stomp'); if (onPop) onPop(S, this); }
    };
    e.onShot = function (S) { if (this.popped) return false; this.popped = true; this.dead = true; LA.game.score(S, 300, this.x, this.y - 6, '#41ff6b'); B.puff(S, this.x, GY - 30, 1.2); for (let k = 0; k < 2; k++) voteCard(S, owner, this.x, GY - 46, owner ? (x) => inA(owner, x, 20) : null); if (onPop) onPop(S, this); return true; };
    e.draw = function (ctx) {
      const d = this.dims(), im = LA.img('ballotBox');
      ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(this.x, GY + 2, d.w * 0.5, 4, 0, 0, 7); ctx.fill();
      if (im) ctx.drawImage(im, d.x, d.y, d.w, d.h); else { ctx.fillStyle = '#2f4a72'; ctx.fillRect(d.x, d.y, d.w, d.h); }
      if (this.visited) { ctx.font = 'bold 10px ' + LA.FONT; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#1b1220'; ctx.strokeText('STUFFED', this.x, d.y - 6); ctx.fillStyle = '#ffd23a'; ctx.fillText('STUFFED', this.x, d.y - 6); }
    };
    return e;
  }
  function layTrail(S, b, n, s0) {
    b.mem.stuffed = 0;
    for (let i = 0; i < n; i++) ballotBox(S, b, b.A.x + 150 + (b.A.w - 300) * i / (n - 1), s0 + i * 0.22, () => { b.mem.popped = (b.mem.popped || 0) + 1; });
  }
  B.register('MAYOR BASURA', {
    art: 'basura', artKeys: ['ballotBox', 'basuraVote'], faces: -1, hit: [56, 92], hp: 13, phases: [0.66, 0.33], speed: [2.1, 2.5, 2.8], cd: [2.6, 1.6, 1.2],
    lastWords: 'I DEMAND A RECOUNT!',
    headline: ['BASURA RECALLED IN A LANDSLIDE', 'Long Beach counts every vote once. Mayor calls it "the most rigged election in history" and requests a third recount.'],
    quips: { 2: 'RECOUNT! RECOUNT!', 3: 'EVERY VOTE COUNTS... TWICE!' },
    init(S, b) { b.mem.trail = true; layTrail(S, b, 6, 0.5); },
    onPhase(S, b, ph) { if (ph === 2) { for (const e of b.things) if (e.isBox && !e.dead) e.dead = true; b.mem.trail = true; layTrail(S, b, 4, 0.7); } },
    move(S, b, dt, sp, dx) {
      const boxes = b.things.filter((e) => e.isBox && !e.dead && !e.visited);
      const k = dt * 60;
      if (boxes.length) {
        boxes.sort((a, c) => a.x - c.x); const tgt = boxes[0];
        const d = tgt.x - b.cx(); b.vx = Math.abs(d) < 2 ? 0 : Math.sign(d) * sp; b.x += b.vx * k;
        if (Math.abs(d) < 26) {                                               // STUFF it bigger, drop cards, move on
          tgt.visited = true; tgt.s *= 1.5; tgt.grow = 0.35; b.mem.stuffed++;
          for (let i = 0; i < 3; i++) voteCard(S, b, tgt.x, GY - 70, (x) => inA(b, x, 20));
          LA.pop(S, tgt.x, GY - 90, 'STUFFED', '#ffd23a', true); b.stun(0.5); b.say(b.rng() < 0.5 ? 'ONE FOR ME...' : 'AND ONE FOR ME!', 0.8);
        }
      } else {
        if (b.mem.trail) {                                                     // trail over: a landslide heals her, then she charges
          b.mem.trail = false;
          if (b.mem.stuffed >= 3) { const heal = Math.min(1, b.maxHp - b.hp); if (heal > 0) { b.hp += heal; b.say('LANDSLIDE! +' + heal + ' HP', 1.6, '#c0102a'); LA.pop(S, b.cx(), b.y - 30, 'EVERY VOTE COUNTS TWICE', '#ffd23a', true); } }
          else b.say('WHO POPPED MY BOXES?!', 1.5, '#c0102a');
        }
        b.vx = Math.abs(dx) > 30 ? Math.sign(dx) * sp * 1.05 : 0; b.x += b.vx * k;
      }
      if (b.st === 'move' && boxes.length && b.phase === 1) b.cd = Math.max(b.cd, 0.5);   // phase 1: no throws while she stuffs (his original)
    },
    attacks: {
      votes: { tell: 0.5, say: 'VOTE EARLY, VOTE OFTEN!', rec: 0.35,
        start(S, b) { const t = tx(S, b), n = b.phase === 1 ? 2 : 3; for (let i = 0; i < n; i++) B.lobTo(S, b, b.cx() + b.face * 26, handY(b), inA(b, t + (i - (n - 1) / 2) * 110), { T: 50 + i * 8, icon: 'vote', size: 28, r: 11, spin: 0.2 }); } },
      charge: { ph: 1, tell: 0.7, say: 'OUT OF MY WAY, VOTER!', rec: 0.2, max: 4, can: (S, b) => !b.things.some((e) => e.isBox && !e.dead && !e.visited),
        start(S, b) { b.vx = b.face * 7.5; },
        run(S, b, t, dt) { b.x += b.vx * dt * 60; b.anim.dy = -Math.abs(Math.sin(t * 20)) * 3; if ((b.vx < 0 && b.x <= b.L() + 1) || (b.vx > 0 && b.x + b.w >= b.R() - 1)) { b.vx = 0; LA.camera.kick(8); b.stun(1.1, '*recount pending*'); return true; } return false; } },
      storm: { ph: 3, tell: 0.6, say: 'BALLOT STORM!', rec: 0.35,
        start(S, b) { const t = tx(S, b); for (let i = 0; i < 5; i++) B.drop(S, b, inA(b, t + (i - 2) * 115, 40), { delay: 0.75 + (i % 2) * 0.25, icon: 'ballot', size: 28, r: 11, spin: 0.2 }); } },
    },
  });
  // level-side: fake drop-boxes along the Long Beach street — stomp them for points (deny Basura early)
  LA.setpieces.register('ballots', {
    init(S, lv) {
      const end = lv.arena ? lv.arena.x - 500 : lv.x1 - 600;
      [0.3, 0.52, 0.74].forEach((f) => { const x = lv.x0 + 500 + (end - lv.x0 - 500) * f; if (x < end) ballotBox(S, null, x, 0.9); });
      return { signX: lv.x0 + 700 };
    },
    draw(ctx, S, sp, layer) {
      if (layer !== 'back' || !LA.camera.visible(sp.signX - 60, 120, 40)) return;
      const x = sp.signX, y = GY - 64;
      ctx.fillStyle = '#6b6f78'; ctx.fillRect(x - 2, y + 20, 4, 44);
      ctx.fillStyle = '#fffdf2'; ctx.strokeStyle = '#1b1220'; ctx.lineWidth = 3; ctx.fillRect(x - 52, y - 12, 104, 34); ctx.strokeRect(x - 52, y - 12, 104, 34);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 12px ' + LA.FONT; ctx.fillStyle = '#d8283a'; ctx.fillText('VOTE BASURA', x, y - 1); ctx.font = 'bold 10px ' + LA.FONT; ctx.fillStyle = '#1b1220'; ctx.fillText('(TWICE)', x, y + 12);
    },
  });

  // ------------------------------------------------------------------ GOV. NEWSCUM — FINAL, three phases on Alcatraz
  function hydrant(S, b, x) {
    const w = B.wall(S, b, x, { w: 26, h: 36, life: 1e9, warn: 0, style: 'hydrant' });
    w.isHydrant = true; return w;
  }
  B.register('GOV. NEWSCUM', {
    art: 'newscum', artKeys: ['enDrone'], faces: -1, hit: [50, 96], h: 112, hp: 14, phases: [0.66, 0.36], speed: [1.35, 1.6, 1.9], cd: [1.45, 1.2, 0.95],
    style: 'keep', keep: 200,                                                  // was 300/16 hp: kept out of stomp range, LOCAL bot lost 5 lives deathT: 5.2, cardAt: 2.5, eyeY: 26, introT: 1.6,
    lastWords: 'I WAS ALWAYS AGAINST THIS!',
    headline: ['NEWSCUM SPUN OUT', 'Governor resigns via a 40-minute podcast. Reservoir found full. Water restored "effective immediately, as always planned."'],
    quips: { 2: "I'LL HAVE MY PEOPLE CALL YOUR PEOPLE", 3: 'LIGHTS OUT, CALIFORNIA!' },
    seq: { 1: ['orders', 'photoop', 'orders', 'orders'], 2: ['veto', 'drones', 'photoop', 'vetorain', 'orders'], 3: ['blackout', 'spin', 'photoop', 'vetorain', 'veto'] },
    init(S, b) { b.mem.hx = [0.2, 0.5, 0.8].map((f) => b.A.x + b.A.w * f); b.mem.hyd = b.mem.hx.map((x) => hydrant(S, b, x)); },
    onStart(S, b) { b.say('THE RESERVOIR IS... FINE. TOTALLY FINE.', 2.2); },
    attacks: {
      orders: { tell: 0.5, say: 'EXECUTIVE ORDER!', rec: 0.35,
        start(S, b) { const t = tx(S, b), n = b.phase === 3 ? 3 : 2; for (let i = 0; i < n; i++) B.lobTo(S, b, b.cx() + b.face * 18, handY(b), inA(b, t + (i - (n - 1) / 2) * 115), { T: 56 + i * 10, icon: 'order', size: 28, r: 11, spin: 0.15, glow: true }); } },
      photoop: { tell: 0.55, say: 'PHOTO OP!', rec: 0.2, max: 6,
        start(S, b) { const hs = b.mem.hyd.filter((h) => !h.dead); hs.sort((a, c) => Math.abs(a.x - b.cx()) - Math.abs(c.x - b.cx())); b.mem.h = hs[0]; b.mem.ph = 0; },
        run(S, b, t, dt) {
          const h = b.mem.h; if (!h) return true;
          const hx = h.x + h.w / 2, side = b.cx() < hx ? -1 : 1, want = hx + side * 44, d = want - b.cx();
          if (b.mem.ph === 0) { b.vx = Math.abs(d) < 4 ? 0 : Math.sign(d) * 3.4; b.x += b.vx * dt * 60; b.face = -side; if (Math.abs(d) < 5) { b.mem.ph = 1; b.mem.pt = t; LA.game.flash(S, '#ffffff', 0.25); LA.pop(S, hx, GY - 120, '📸 CLICK', '#fff'); b.say('WATCH THIS, FOLKS!', 1); } }
          else if (b.mem.ph === 1) { b.anim.rot = Math.sin(t * 30) * 0.08; if (t - b.mem.pt > 0.9) {
            b.mem.ph = 2; B.puff(S, hx, GY - 44, 0.8); moth(S, b, hx, GY - 44);
            LA.pop(S, hx, GY - 96, 'RESERVOIR: EMPTY', '#9fe8ff', true); b.stun(2.2, '...budget reallocated'); return true; } }
          return false;
        } },
      veto: { ph: 2, tell: 0.75, say: 'VETO!', rec: 0.55, max: 4,
        start(S, b) { b.mem.vn = 1; B.leap(S, b, -9, null, (S, b) => { slamShocks(S, b, { speed: 5.2, h: 26, icon: 'veto', size: 34 }); LA.pop(S, b.cx(), GY - 120, 'VETO!', '#ff4d5e', true); }); },
        run(S, b, t) {
          if (b.phase === 3 && b.mem.vn === 1 && !b.air && t > 0.8) { b.mem.vn = 2; B.leap(S, b, -9, null, (S, b) => slamShocks(S, b, { speed: 5.2, h: 26, icon: 'veto', size: 34 })); }
          return airDone(b, t) && (b.phase < 3 || b.mem.vn === 2) && t > 0.3;
        } },
      drones: { ph: 2, tell: 0.6, say: 'NEWS CHOPPERS — FILM ME!', rec: 0.3, can: (S, b) => alive(b, (e) => e.isAdd) < 2,
        start(S, b) { const n = 2 - alive(b, (e) => e.isAdd); for (let i = 0; i < n; i++) B.add(S, b, i ? b.A.x + 40 : b.A.x + b.A.w - 80, { art: 'enDrone', fly: true, y: GY - 180 - i * 18, dh: 36, w: 36, h: 22, hp: 1, diveEvery: 2.4 + i * 0.8, faces: 1, label: 'NEWS' }); } },
      vetorain: { ph: 2, tell: 0.6, say: 'VETO EVERYTHING!', rec: 0.35,
        start(S, b) { const t = tx(S, b); for (let i = 0; i < 5; i++) B.drop(S, b, inA(b, t + (i - 2) * 125, 40), { delay: 0.8 + Math.abs(i - 2) * 0.2, icon: 'veto', size: 38, r: 13, spin: 0, glow: true }); } },
      blackout: { ph: 3, tell: 0.65, say: 'ROLLING BLACKOUTS — STATEWIDE!', rec: 0.3,
        start(S, b) { B.blackout(b, 3.0, 0.9); const t = tx(S, b); [-80, 60, 190].forEach((o, i) => B.lobTo(S, b, b.cx() + b.face * 18, handY(b), inA(b, t + o * -b.face), { T: 50 + i * 12, icon: 'order', size: 28, r: 11, spin: 0.15, glow: true })); } },
      spin: { ph: 3, tell: 0.8, say: 'LET ME SPIN THIS...', rec: 0.2, max: 5,
        start(S, b) { b.vx = b.face * 7.8; b.mem.bn = 0; },
        run(S, b, t, dt) {
          b.x += b.vx * dt * 60; b.anim.sx = Math.cos(t * 28); b.anim.dy = -Math.abs(Math.sin(t * 18)) * 4;
          if ((b.vx < 0 && b.x <= b.L() + 1) || (b.vx > 0 && b.x + b.w >= b.R() - 1)) {
            LA.camera.kick(6); B.puff(S, b.cx(), b.y + 40, 1);
            if (b.mem.bn++ < 1) b.vx = -b.vx; else { b.vx = 0; b.anim.sx = 1; b.stun(1.3, '*spun out*'); return true; }
          }
          return false;
        },
        end(S, b) { b.anim.sx = 1; } },
    },
    dieAnim(S, b, dt, T) {                                                     // spins out and away — then the water finally comes
      const k = dt * 60;
      if (T < 0.9) { b.anim.sx = Math.cos(T * (20 + T * 30)); b.anim.ox = Math.sin(T * 70) * 2; if (Math.floor(T * 9) !== Math.floor((T - dt) * 9)) B.puff(S, b.cx() + b.rng.range(-30, 30), b.y + b.rng.range(0, 80)); }
      else { if (!b.mem.flung) { b.mem.flung = 1; b.vy = -12; b.anim.ox = 0; } b.vy += 0.25 * k; b.y += b.vy * k; b.anim.sx = Math.cos(T * 40); b.anim.rot += 0.2 * k; }
      if (T > 1.2 && !b.mem.water) {
        b.mem.water = 1;
        for (const x of b.mem.hx) water(S, x);
        LA.pop(S, b.A.x + b.A.w / 2, GY - 190, 'THE RESERVOIR WAS FULL THE WHOLE TIME', '#4dc8ff', true);
      }
    },
  });
  function moth(S, b, x, y) {
    const e = B.thing(S, b, { x, y, t: 0, w: 10, h: 10, layer: 'front' });
    e.update = function (S, dt) { this.t += dt; this.y -= 1.1 * dt * 60; this.x += Math.sin(this.t * 9) * 1.5; if (this.t > 2.2) this.dead = true; };
    e.draw = function (ctx) { const ic = ART().icon('moth'), s = 16 + Math.sin(this.t * 30) * 4; ctx.drawImage(ic, this.x - s / 2, this.y - 8, s, 16); };
  }
  function water(S, x) {                                                       // harmless celebration geyser (not owned: survives the boss)
    const e = LA.ents.add(S, 'bossThing', { x: x - 20, y: GY - 200, w: 40, h: 200, t: 0, layer: 'mid', drawW: 60 });
    e.update = function (S, dt) { this.t += dt; if (this.t > 8) this.dead = true; };
    e.draw = function (ctx) {
      const t = this.t, h = Math.min(1, t * 3) * (170 + Math.sin(t * 8) * 14), cx = x;
      ctx.fillStyle = 'rgba(77,200,255,.85)'; ctx.strokeStyle = '#1b1220'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cx - 10, GY - 30); ctx.quadraticCurveTo(cx - 16, GY - 30 - h * 0.6, cx - 4, GY - 30 - h); ctx.lineTo(cx + 4, GY - 30 - h); ctx.quadraticCurveTo(cx + 16, GY - 30 - h * 0.6, cx + 10, GY - 30); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.drawImage(ART().icon('hydrant'), cx - 20, GY - 38, 40, 40);
      const ic = ART().icon('drop');
      for (let i = 0; i < 8; i++) { const a = ((t * 1.4) + i / 8) % 1, dx = Math.sin(i * 2.4) * 70 * a, dy = -h * 0.9 * (1 - (2 * a - 1) * (2 * a - 1)); ctx.drawImage(ic, cx + dx - 6, GY - 40 + dy - 6, 12, 12); }
    };
  }
})();
