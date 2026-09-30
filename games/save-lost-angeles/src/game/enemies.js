// ENEMIES — Saint's foe roster (drawFoe @2020, update foes loop @1179) with Mario-grade variety.
// Every type maps to its atlas sprite exactly like his drawFoe: drawn 60 px tall × FOE_SCALE, art faces LEFT
// (flipped when walking right) except the HOA crew, which never flip. 'lobby' has no sprite in his atlas —
// he drew it in code (green $ blob) — so it's drawn in code here too, in the same spirit (cached).
//   thief    PORCH PIRATE   walker (Goomba)                     1 hit
//   cat      CAT BURGLAR    spots you, crouches "!", dashes       1 hit
//   lobby    LOBBYIST       stomp -> BAILOUT money bag (Koopa shell): kick it, it wipes out other foes
//   hoaA     HOA ENFORCER   paces, lobs citation tickets          1 hit
//   hoaC     HOA JUNIOR     2 hits — first stomp = VIOLATION!, she comes back twice as fast
//   press    NEWS ANCHOR    stops to go live, fires a BREAKING banner at head height (jump it)
//   cam      BOOM-MIC OP    timing foe: while the REC light blinks the boom is up — stomping him hurts
//   papa     PAPARAZZI      flash camera: whiteout blind (no damage), hops
//   cam2     PAPARAZZI      (swarm variant) same as papa
//   papaF    PAPARAZZA      hops at you + flash
//   drone    TWZ DRONE      hovers, dives when above you
//   dockbird DOCK PELICAN   sine-wave glide at head height
//   pumpjack PUMPJACK       2-hit heavy hopper, ground-shake landings
// Stomp = LA.phys.stompedFrom + p.bounce -> 150×min(combo,6). Side contact = p.hurt. Shards kill.
(function () {
  'use strict';
  const LA = window.LA, K = LA.K, GY = K.GY, GP = LA.gp;
  const FOE_SCALE = LA.CONTENT.FOE_SCALE || {};
  const ART = { thief: 'thief', cat: 'catThief', press: 'pressAnchor', cam: 'pressCam', cam2: 'pressCam2', papa: 'paparazzi', papaF: 'paparazziF',
    hoaA: 'hoa1', hoaB: 'hoa2', hoaC: 'hoa3', dockbird: 'enDockBird', drone: 'enDrone', pumpjack: 'enPumpjack' };
  const REMOVED = new Set(['hoaB']);                                 // his REMOVED_ENEMIES
  const SPEC = {
    thief:    { w: 26, h: 44, speed: 0.9,  hp: 1, beh: 'walk',  name: 'PORCH PIRATE', diff: 1 },
    lobby:    { w: 32, h: 38, speed: 0.7,  hp: 1, beh: 'shell', name: 'LOBBYIST', diff: 2 },
    cat:      { w: 26, h: 40, speed: 0.55, hp: 1, beh: 'dash',  name: 'CAT BURGLAR', diff: 3 },
    hoaC:     { w: 26, h: 40, speed: 0.75, hp: 2, beh: 'armor', name: 'HOA JUNIOR', diff: 3 },
    press:    { w: 26, h: 58, speed: 0.6,  hp: 1, beh: 'report', name: 'NEWS ANCHOR', diff: 3 },
    dockbird: { w: 32, h: 28, speed: 1.1,  hp: 1, beh: 'glide', name: 'DOCK PELICAN', diff: 3, fly: 1 },
    hoaA:     { w: 28, h: 46, speed: 0.4,  hp: 1, beh: 'toss',  name: 'HOA ENFORCER', diff: 4 },
    cam:      { w: 28, h: 55, speed: 0.65, hp: 1, beh: 'boom',  name: 'BOOM-MIC OP', diff: 4 },
    papa:     { w: 30, h: 53, speed: 0.7,  hp: 1, beh: 'flash', name: 'PAPARAZZI', diff: 4 },
    cam2:     { w: 30, h: 53, speed: 0.7,  hp: 1, beh: 'flash', name: 'PAPARAZZI', diff: 4 },
    pumpjack: { w: 40, h: 46, speed: 0.45, hp: 2, beh: 'heavy', name: 'PUMPJACK', diff: 4 },
    papaF:    { w: 30, h: 50, speed: 0.8,  hp: 1, beh: 'flashhop', name: 'PAPARAZZA', diff: 5 },
    drone:    { w: 52, h: 24, speed: 1.1,  hp: 1, beh: 'drone', name: 'TWZ DRONE', diff: 5, fly: 1 },
  };
  const DRAW_H = 60;
  // Media crew are grown adults, not 60 px goblins (Saint playtest: "news anchors are a little short"). The hero
  // draws ~72 px (≈1.8 m), so the anchor / boom-mic op / TWZ paparazzi draw at 72; their hitbox heights above were
  // raised by the same ×1.2 so the box still covers the body (feet stay on floorY).
  const HUMAN_H = { press: 72, cam: 72, papa: 72, cam2: 72, papaF: 72 };

  // ---------------- LOBBYIST art (code-drawn, cached) ----------------
  function lobbyArt(f) {
    return GP.cache('lobby' + f, 50, 54, (g) => {
      const O = '#191921';
      if (f === 2) {                                                 // BAILOUT bag (the shell)
        g.fillStyle = '#3f8f45'; g.strokeStyle = O; g.lineWidth = 3;
        g.beginPath(); g.ellipse(25, 38, 21, 15, 0, 0, Math.PI * 2); g.fill(); g.stroke();
        g.fillStyle = '#2f6f35'; g.beginPath(); g.moveTo(18, 24); g.lineTo(25, 17); g.lineTo(32, 24); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = '#c9a23a'; g.fillRect(19, 23, 12, 4); g.strokeRect(19, 23, 12, 4);
        GP.text(g, '$', 25, 40, 17, '#ffe36a', O, 3);
        g.fillStyle = '#fff'; g.fillRect(13, 31, 6, 4); g.fillRect(31, 31, 6, 4);           // peeking eyes
        g.fillStyle = O; g.fillRect(15, 32, 3, 3); g.fillRect(33, 32, 3, 3);
        return;
      }
      const step = f === 1 ? 3 : -3;
      g.strokeStyle = O; g.lineWidth = 3;
      g.fillStyle = '#23232b'; g.fillRect(17 + step, 44, 6, 9); g.fillRect(28 - step, 44, 6, 9);   // legs
      g.strokeRect(17 + step, 44, 6, 9); g.strokeRect(28 - step, 44, 6, 9);
      g.fillStyle = '#4a9f4f'; g.beginPath(); g.ellipse(25, 30, 19, 17, 0, 0, Math.PI * 2); g.fill(); g.stroke();   // money-bag body
      g.fillStyle = '#3a7f3f'; g.beginPath(); g.moveTo(17, 15); g.lineTo(25, 6); g.lineTo(33, 15); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#c9a23a'; g.fillRect(18, 13, 14, 4); g.strokeRect(18, 13, 14, 4);                              // gold tie-off
      g.fillStyle = '#fff'; g.beginPath(); g.moveTo(19, 30); g.lineTo(25, 37); g.lineTo(31, 30); g.closePath(); g.fill(); g.stroke();   // collar
      g.fillStyle = '#e2363f'; g.beginPath(); g.moveTo(23.5, 31); g.lineTo(26.5, 31); g.lineTo(27.5, 42); g.lineTo(25, 45); g.lineTo(22.5, 42); g.closePath(); g.fill(); g.lineWidth = 2; g.stroke();
      g.lineWidth = 3;
      g.fillStyle = '#fff'; g.fillRect(15, 20, 8, 6); g.fillRect(27, 20, 8, 6);                                     // eyes
      g.fillStyle = O; g.fillRect(15, 22, 4, 4); g.fillRect(27, 22, 4, 4);
      g.beginPath(); g.moveTo(14, 18); g.lineTo(23, 20); g.moveTo(36, 18); g.lineTo(27, 20); g.stroke();             // smug brows
      g.lineWidth = 2; g.beginPath(); g.moveTo(21, 28); g.quadraticCurveTo(25, 30, 29, 27); g.stroke();
      GP.text(g, '$', 39, 36, 11, '#ffe36a', O, 2.5);
      g.fillStyle = '#7a4a22'; g.strokeStyle = O; g.lineWidth = 2.5; GP.rr(g, 1, 32, 12, 10, 2); g.fill(); g.stroke();  // briefcase
      g.fillRect(5, 29, 4, 3);
    });
  }

  // ---------------- entity ----------------
  LA.ents.define('foe', (o, S) => {
    const type = SPEC[o.type] ? o.type : 'thief';
    const sp = SPEC[type];
    const floorY = o.floorY != null ? o.floorY : GY;
    const tierSp = (S && S.tier && S.tier.speed) || 1;
    const e = {
      type, spec: sp, beh: sp.beh, w: sp.w, h: sp.h, x: o.x, y: floorY - sp.h, floorY,
      speed: sp.speed * tierSp * (o.speedMul || 1), vx: (o.dir || -1) * sp.speed * tierSp, face: o.dir || -1,
      hp: sp.hp, maxHp: sp.hp, minX: o.minX != null ? o.minX : o.x - 140, maxX: o.maxX != null ? o.maxX : o.x + 140,
      patrolR: o.patrolR, fly: !!sp.fly, baseY: o.baseY != null ? o.baseY : (sp.fly ? GY - 100 : 0),
      st: 'walk', t: (o.seed || 0) * 3.7 % 6, cd: 1 + ((o.seed || 0) * 1.3) % 2, hy: 0, hvy: 0, hvx: 0, safeT: 0, safeP: null,
      crook: !!o.crook, chase: !!o.chase, foe: true, layer: 'mid', art: ART[type] ? [ART[type]] : null, defeated: false, dying: null,
      drawW: 110, fcd: 1.5 + ((o.seed || 0) * 0.77) % 2, fpre: 0, fpop: 0, mic: false, bagT: 0, chain: 0, grace: 0, ghostX: o.x,
    };
    if (e.fly) { e.y = e.baseY - e.h / 2; }
    e.update = function (S, dt) { update(e, S, dt); };
    e.draw = function (ctx, S) { draw(e, ctx, S); };
    e.touch = function (S, p) { touch(e, S, p); };
    e.kill = function (S, how) { if (e.dying) return; e._spCounted = true; LA.game.score(S, 200); LA.pop(S, e.x + e.w / 2, e.y - 6, '+200', '#ffc23a'); kill(S, e, how === 'squash' ? 'squash' : 'flip'); };
    e.onShot = function (S, sh) {
      if (e.dying) return false;
      LA.game.score(S, 200); LA.pop(S, e.x + e.w / 2, e.y - 6, '+200', '#b07cff');
      kill(S, e, 'flip'); return true;
    };
    return e;
  });

  function kill(S, e, how) {
    if (e.dying) return;
    e.dying = { t: 0, how }; e.defeated = true; e._spCounted = true; e.dvy = how === 'flip' ? -6 : 0; e.vx = how === 'flip' ? (e.vx >= 0 ? 1.2 : -1.2) : 0;
    e.always = true;
    S.stats.kills++; S.run.kills++;
    if (how === 'squash') LA.ents.add(S, 'gpfx', { mode: 'poof', x: e.x + e.w / 2, y: e.floorY - 8 });
  }
  GP.killFoe = kill;

  function walk(e, k, mul) {
    e.x += e.vx * (mul || 1) * k;
    if (e.maxX - e.minX < 6) e.x = e.minX;
    else if (e.x < e.minX) { e.x = e.minX; e.vx = Math.abs(e.vx) || e.speed; }
    else if (e.x > e.maxX) { e.x = e.maxX; e.vx = -(Math.abs(e.vx) || e.speed); }
    if (Math.abs(e.vx) > 0.01) e.face = e.vx > 0 ? 1 : -1;
  }
  function clampX(e) { if (e.x < e.minX) e.x = e.minX; if (e.x > e.maxX) e.x = e.maxX; }
  function hopStep(e, k, g) {                                        // vertical hop offset above floor; returns true on landing
    if (e.hy <= 0 && e.hvy === 0) return false;
    e.hvy += (g || 0.5) * k; e.hy -= e.hvy * k;
    if (e.hvy > 0 && e.hy <= 0) { e.hy = 0; e.hvy = 0; return true; }
    return false;
  }
  function faceP(e, p) { if (p) e.face = (p.x + p.w / 2) > (e.x + e.w / 2) ? 1 : -1; }
  function onScreen(e, pad) { return LA.camera.visible(e.x, e.w, pad || 0); }

  function update(e, S, dt) {
    const k = dt * 60;
    e.t += dt;
    if (e.dying) {
      e.dying.t += dt;
      if (e.dying.how === 'flip') { e.dvy += 0.5 * k; e.y += e.dvy * k; e.x += e.vx * k; if (e.y > K.VH + 80) e.dead = true; }
      else if (e.dying.t > 0.4) e.dead = true;
      return;
    }
    if (e.safeT > 0) e.safeT -= k;
    const p = GP.target(S, e.x + e.w / 2);
    const dx = p ? (p.x + p.w / 2) - (e.x + e.w / 2) : 9999, adx = Math.abs(dx);
    if (e.chase && p) { e.vx = (dx > 0 ? 1 : -1) * 1.7; e.x += e.vx * k; e.face = e.vx > 0 ? 1 : -1; }
    switch (e.beh) {
      case 'walk': case 'armor':
        if (!e.chase) walk(e, k, e.beh === 'armor' && e.hp < e.maxHp ? 2.3 : 1); break;
      case 'dash':
        e.cd -= dt;
        if (e.st === 'walk') { if (!e.chase) walk(e, k, 1); if (e.cd <= 0 && adx < 240 && p && Math.abs(p.y + p.h - e.floorY) < 70 && onScreen(e)) { e.st = 'wind'; e.stT = 0.4; faceP(e, p); } }
        else if (e.st === 'wind') { e.stT -= dt; if (e.stT <= 0) { e.st = 'dash'; e.stT = 0.85; e.vx = e.face * 4.2; } }
        else if (e.st === 'dash') { e.stT -= dt; e.x += e.vx * k; if (e.x <= e.minX || e.x >= e.maxX || e.stT <= 0) { clampX(e); e.st = 'rest'; e.stT = 0.6; } }
        else if (e.st === 'rest') { e.stT -= dt; if (e.stT <= 0) { e.st = 'walk'; e.cd = 1.6; e.vx = e.face * e.speed; } }
        break;
      case 'shell': updShell(e, S, k, dt); break;
      case 'toss':
        e.cd -= dt;
        if (e.st === 'walk') { walk(e, k, 1); if (e.cd <= 0 && adx < 400 && onScreen(e, -20)) { e.st = 'wind'; e.stT = 0.45; faceP(e, p); } }
        else { e.stT -= dt; faceP(e, p); if (e.stT <= 0) {
          e.st = 'walk'; e.cd = 2.6;
          const vx = LA.clamp(dx / 55, -3.4, 3.4) || e.face * 2;
          LA.ents.add(S, 'eshot', { style: 'ticket', x: e.x + e.w / 2 - 8, y: e.y - 6, vx, vy: -6.2, grav: 0.24 });
          GP.sfx('throw');
        } }
        break;
      case 'report':
        e.cd -= dt;
        if (e.st === 'walk') { walk(e, k, 1); if (e.cd <= 0 && adx < 430 && adx > 60 && onScreen(e, -20)) { e.st = 'wind'; e.stT = 0.55; faceP(e, p); LA.pop(S, e.x + e.w / 2, e.y - 22, 'WE\'RE LIVE!', '#ff5a5a'); } }
        else { e.stT -= dt; if (e.stT <= 0) {
          e.st = 'walk'; e.cd = 3.2;
          LA.ents.add(S, 'eshot', { style: 'news', x: e.x + e.w / 2 + (e.face > 0 ? 6 : -50), y: e.floorY - 40, vx: e.face * 3.3, vy: 0, grav: 0, life: 3.5 });
        } }
        break;
      case 'boom': {
        walk(e, k, 1);
        const cyc = (e.t % 2.9); e.mic = cyc < 1.15;
        break; }
      case 'flash': {
        walk(e, k, 1);
        if (e.hy <= 0 && e.hvy === 0 && Math.sin(e.t * 1.7 + e.x) > 0.995) e.hvy = -4;
        hopStep(e, k, 0.45);
        flashLogic(e, S, dt, p, adx);
        break; }
      case 'flashhop': {
        e.cd -= dt;
        if (e.hy <= 0 && e.hvy === 0) { if (e.cd <= 0) { faceP(e, p); e.hvy = -7.2; e.hvx = e.face * 1.7; e.cd = 1.3; } }
        else { e.x += e.hvx * k; clampX(e); }
        hopStep(e, k, 0.45);
        flashLogic(e, S, dt, p, adx);
        break; }
      case 'glide': {
        walk(e, k, 1);
        e.y = e.baseY - e.h / 2 + Math.sin(e.t * 2.2) * 16;
        break; }
      case 'drone': {
        const top = e.baseY - e.h / 2;
        if (e.st === 'walk') {
          if (p && adx < 320 && onScreen(e)) { e.x += LA.clamp(dx, -1, 1) * e.speed * 1.1 * k; e.face = dx > 0 ? 1 : -1; clampX(e); }
          else walk(e, k, 1);
          e.y = top + Math.sin(e.t * 3) * 5; e.cd -= dt;
          if (p && adx < 26 && e.cd <= 0) { e.st = 'dive'; e.dvy = 1.5; }
        } else if (e.st === 'dive') {
          e.dvy = Math.min(7, e.dvy + 0.45 * k); e.y += e.dvy * k;
          if (e.y + e.h >= GY - 4) { e.y = GY - 4 - e.h; e.st = 'rise'; }
        } else { e.y -= 2.4 * k; if (e.y <= top) { e.y = top; e.st = 'walk'; e.cd = 1.4; } }
        break; }
      case 'heavy': {
        e.cd -= dt;
        if (e.hy <= 0 && e.hvy === 0) { walk(e, k, 1); if (e.cd <= 0 && adx < 420) { faceP(e, p); e.hvy = -8; e.hvx = e.face * 1.3; e.cd = e.hp < e.maxHp ? 1.3 : 2.3; } }
        else { e.x += e.hvx * k; clampX(e); if (hopStep(e, k, 0.5)) { if (onScreen(e, 40)) { LA.camera.kick(adx < 300 ? 4 : 2); GP.sfx('thud'); } LA.ents.add(S, 'gpfx', { mode: 'dust', x: e.x + e.w / 2, y: e.floorY - 4 }); } }
        break; }
    }
    if (!e.fly && e.beh !== 'shell') e.y = e.floorY - e.h - e.hy;
    else if (e.beh === 'shell' && e.st !== 'fall') e.y = e.floorY - e.h;
  }

  function flashLogic(e, S, dt, p, adx) {
    if (e.fpop > 0) e.fpop -= dt;
    if (e.fpre > 0) {
      e.fpre -= dt;
      if (e.fpre <= 0) {
        e.fpop = 0.18;
        if (!(S._gpFlashT > 0)) { LA.game.flash(S, '#ffffff', 0.9); S._gpFlashT = 1.6; LA.pop(S, e.x + e.w / 2, e.y - 16, 'FLASH!', '#ffffff'); GP.sfx('flash'); }
      }
      return;
    }
    e.fcd -= dt;
    if (e.fcd <= 0) {
      e.fcd = 1.8 + Math.random() * 2.4;                              // behavior timing only (layout stays deterministic)
      if (onScreen(e, -10) && adx < 230) { e.fpre = 0.35; faceP(e, p); }
    }
  }

  // ---- LOBBYIST shell / BAILOUT bag ----
  function updShell(e, S, k, dt) {
    if (e.st === 'walk') { walk(e, k, 1); return; }
    if (e.st === 'bag') {
      e.bagT += dt;
      if (e.bagT > 5) { e.st = 'walk'; e.h = e.spec.h; e.vx = e.face * e.speed; LA.pop(S, e.x + e.w / 2, e.floorY - 50, 'I\'M BACK', '#8bd450'); }
      return;
    }
    if (e.st === 'fall') { e.dvy = (e.dvy || 0) + 0.86 * k; e.y += e.dvy * k; e.x += e.vx * k * 0.5; if (e.y > K.VH + 60) { e.dead = true; e.defeated = true; } return; }
    // sliding
    if (e.grace > 0) e.grace -= dt;
    e.x += e.vx * k;
    const cx = e.x + e.w / 2;
    if (e.floorY >= GY - 1 && !LA.phys.floorAt(S, cx)) { e.st = 'fall'; e.dvy = 0; return; }
    if (e.floorY < GY - 1 && (e.x + e.w < e.platX0 || e.x > e.platX1)) { e.floorY = GY; e.y = GY - e.h; }  // slid off a platform
    for (const s of S.solids) {
      if (s.oneway || s.deck) continue;
      if (LA.aabb(e, s) && s.y < e.y + e.h - 3) { e.x = e.vx > 0 ? s.x - e.w : s.x + s.w; e.vx = -e.vx; GP.sfx('bonk'); break; }
    }
    for (const o of S.ents) {
      if (o === e || o.kind !== 'foe' || o.dying || o.dead) continue;
      if (LA.aabb(e, o)) {
        e.chain++; const pts = 200 * Math.min(e.chain, 8);
        LA.game.score(S, pts); LA.pop(S, o.x + o.w / 2, o.y - 8, (e.chain > 1 ? 'x' + e.chain + ' ' : '') + '+' + pts, '#8bd450');
        kill(S, o, 'flip'); GP.sfx('stomp');
      }
    }
    const cam = LA.camera.x, VW = LA.view.VW;
    if (e.x < cam - 500 || e.x > cam + VW + 500) { e.dead = true; e.defeated = true; }
  }
  function shellTouch(e, S, p) {
    const stomp = LA.phys.stompedFrom(p, e);
    if (e.st === 'bag') {
      if (stomp) p.bounce(S);
      const dir = (e.x + e.w / 2) < (p.x + p.w / 2) ? -1 : 1;
      e.st = 'slide'; e.vx = dir * 6.5; e.grace = 0.3; e.chain = 0; e.safeT = 10; e.safeP = p;
      LA.game.score(S, 100); LA.pop(S, e.x + e.w / 2, e.y - 10, 'KICK!', '#ffe36a'); GP.sfx('stomp');
      return;
    }
    if (e.st === 'slide') {
      if (stomp) { const c = p.bounce(S); e.st = 'bag'; e.bagT = 0; e.vx = 0; e.safeT = 10; e.safeP = p; LA.game.score(S, 100 * c); GP.sfx('stomp'); }
      else if (e.grace <= 0) p.hurt(S, 'foe');
    }
  }

  function touch(e, S, p) {
    if (e.dying || e.dead) return;
    if (e.safeT > 0 && e.safeP === p) return;
    if (LA.powers.invincible(S, p)) {
      LA.game.score(S, 200); LA.pop(S, e.x + e.w / 2, e.y - 6, 'PLOWED +200', '#ffc23a'); kill(S, e, 'flip'); GP.sfx('stomp'); return;
    }
    if (e.beh === 'shell' && e.st !== 'walk') { if (e.st !== 'fall') shellTouch(e, S, p); return; }
    const stomp = LA.phys.stompedFrom(p, e);
    if (!stomp) { p.hurt(S, 'foe'); return; }
    if (e.beh === 'boom' && e.mic) { LA.pop(S, e.x + e.w / 2, e.y - 16, 'BOOMED!', '#ff5a5a'); p.hurt(S, 'foe'); return; }
    const combo = p.bounce(S), pts = 150 * Math.min(combo, 6);
    LA.game.score(S, pts); LA.pop(S, e.x + e.w / 2, e.y - 8, (combo > 1 ? 'x' + combo + ' ' : '') + '+' + pts, '#41ff6b');
    S.stats.stomps++; GP.sfx(combo > 1 ? 'combo' : 'stomp', { n: combo });
    e.safeT = 12; e.safeP = p;
    e.hp -= p.power === 'grow' ? 9 : 1;                               // BIG BOY stomps one-shot the 2-hit crew
    if (e.hp > 0) {
      if (e.beh === 'armor') { LA.pop(S, e.x + e.w / 2, e.y - 24, 'VIOLATION!', '#ff5a5a'); e.vx = (e.vx >= 0 ? 1 : -1) * e.speed; }
      else if (e.beh === 'heavy') { LA.pop(S, e.x + e.w / 2, e.y - 24, 'SPUTTER!', '#c0c0c0'); LA.ents.add(S, 'gpfx', { mode: 'smoke', x: e.x + e.w / 2, y: e.y }); }
      return;
    }
    if (e.beh === 'shell' && p.power !== 'grow') {
      e.st = 'bag'; e.bagT = 0; e.vx = 0; e.h = 26; e.y = e.floorY - e.h;
      LA.pop(S, e.x + e.w / 2, e.y - 20, 'BAILOUT!', '#8bd450');
      return;
    }
    kill(S, e, 'squash');
  }

  // ---------------- drawing ----------------
  function draw(e, ctx, S) {
    const cx = e.x + e.w / 2, dh = HUMAN_H[e.type] || DRAW_H * (FOE_SCALE[e.type] || 1);
    const flipArt = e.face > 0 && !/^hoa/.test(e.type);
    ctx.save();
    if (e.fly) ctx.translate(cx, e.y + e.h / 2 + dh / 2 - (e.type === 'drone' ? 14 : 8));
    else ctx.translate(cx, e.y + e.h);
    if (e.dying) {
      if (e.dying.how === 'squash') ctx.scale(1.25, 0.32);
      else { ctx.translate(0, -dh / 2); ctx.rotate(Math.PI); ctx.translate(0, dh / 2); }
    } else if (e.st === 'wind' && e.beh === 'dash') ctx.scale(1.08, 0.86);
    if (e.beh === 'armor' && e.hp < e.maxHp && !e.dying) ctx.translate(Math.sin(S.t * 40) * 1.2, 0);
    if (flipArt) ctx.scale(-1, 1);
    if (e.type === 'lobby') {
      const f = e.st === 'bag' || e.st === 'slide' || e.st === 'fall' ? 2 : (Math.floor(e.t * 6) % 2);
      const a = lobbyArt(f), w = 50 * 0.95, h = 54 * 0.95;
      if (f === 2 && e.st === 'slide') ctx.rotate(Math.sin(S.t * 30) * 0.08);
      if (f === 2 && e.st === 'bag' && e.bagT > 3.8) ctx.translate(Math.sin(S.t * 50) * 1.5, 0);
      ctx.drawImage(a.cv, -w / 2, -h + 2, w, h);
    } else {
      const im = LA.img(ART[e.type]);
      if (im) { const w = dh * im.naturalWidth / im.naturalHeight; ctx.drawImage(im, -w / 2, -dh, w, dh); }
      else { ctx.fillStyle = '#3a3a44'; ctx.fillRect(-e.w / 2, -e.h, e.w, e.h); }
    }
    ctx.restore();
    if (e.dying) return;
    // tells
    if (e.st === 'wind') bang(ctx, cx, e.y - (e.beh === 'dash' ? 26 : 30), '!', '#ffd23a');
    if (e.beh === 'boom' && e.mic && (Math.floor(S.t * 6) % 2)) {
      ctx.fillStyle = '#ff2a2a'; ctx.beginPath(); ctx.arc(cx - 10, e.y - 26, 4, 0, 6.3); ctx.fill();
      ctx.font = 'bold 9px ' + LA.FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = '#191921';
      ctx.strokeText('REC', cx - 4, e.y - 26); ctx.fillStyle = '#fff'; ctx.fillText('REC', cx - 4, e.y - 26);
    }
    if (e.fpre > 0 && (Math.floor(S.t * 20) % 2)) { ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(cx + e.face * 10, e.y + 6, 6, 0, 6.3); ctx.fill(); }
    if (e.fpop > 0) { ctx.globalAlpha = Math.min(1, e.fpop * 6); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, e.y + 8, 22, 0, 6.3); ctx.fill(); ctx.globalAlpha = 1; }
    if (e.beh === 'armor' && e.hp < e.maxHp) bang(ctx, cx + 12, e.y - 30, '!!', '#ff4d4d');
    if (e.crook && S.tick % 120 < 70) {
      ctx.font = 'bold 10px ' + LA.FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = '#191921';
      ctx.strokeText('HANDS UP!', cx, e.y - 34); ctx.fillStyle = '#ff9f2e'; ctx.fillText('HANDS UP!', cx, e.y - 34);
    }
  }
  function bang(ctx, x, y, t, col) {
    ctx.font = 'bold 16px ' + LA.FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = '#191921'; ctx.strokeText(t, x, y); ctx.fillStyle = col; ctx.fillText(t, x, y);
  }

  // ---------------- API for populate / set-pieces / bosses ----------------
  LA.gameplay = LA.gameplay || {};
  LA.gameplay.FOES = SPEC;
  LA.gameplay.FOE_ART = ART;
  LA.gameplay.foeOK = (t) => !!SPEC[t] && !REMOVED.has(t);
  // spawnFoe(S, 'papa', x, {floorY, minX, maxX, dir, chase, baseY}) -> entity
  LA.gameplay.spawnFoe = function (S, type, x, opts) {
    const o = Object.assign({ type, x }, opts || {});
    if (ART[type]) GP.art(S, ART[type]);
    return LA.ents.add(S, 'foe', o);
  };
})();
