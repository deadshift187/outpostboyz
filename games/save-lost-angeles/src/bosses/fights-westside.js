// src/bosses/fights-westside.js — OWNER: bosses agent.
// WORLD 4 · HOLLYWOOD & THE WESTSIDE: THE GRILL MARSHAL · BRANDAN 69 (+ 'walkoff' set-piece) · GURU KALE ·
//                                     THE AGENT · THE BROWNOUT BARON
(function () {
  'use strict';
  const LA = window.LA, B = LA.bosses, GY = LA.K.GY;
  const ART = () => LA.bossArt;
  const tx = (S, b) => { const p = B.target(S, b); return p ? B.pcx(p) : b.cx() - 200; };
  const inA = (b, x, m) => LA.clamp(x, b.A.x + (m || 40), b.A.x + b.A.w - (m || 40));
  const handY = (b) => b.y + 22;
  const airDone = (b, t) => t > 0.12 && !b.air;
  const alive = (b, pred) => b.things.filter((e) => !e.dead && pred(e)).length;
  function slamShocks(S, b, o) { B.shock(S, b, b.cx(), -1, o); B.shock(S, b, b.cx(), 1, o); }
  function dash(S, b, t, dt, stunTxt) {
    b.x += b.vx * dt * 60; b.anim.dy = -Math.abs(Math.sin(t * 20)) * 3;
    if ((b.vx < 0 && b.x <= b.L() + 1) || (b.vx > 0 && b.x + b.w >= b.R() - 1)) { b.vx = 0; LA.camera.kick(8); B.puff(S, b.cx() + b.face * 30, b.y + 40, 1.2); b.stun(1.1, stunTxt || '*dizzy*'); return true; }
    return false;
  }

  // ------------------------------------------------------------------ THE GRILL MARSHAL — flaming grill spread + padlocked grills
  function lockedGrill(S, b, x) {
    const w = B.wall(S, b, B.clearOf(S, b, x, 60, 60), { w: 44, h: 46, life: 7, warn: 0.6, style: 'grill', label: 'PADLOCKED' });
    // the grill itself is the tell: it smokes + glows + says HOT! on top for 0.7 s, then a flame jet
    const jet = B.thing(S, b, { x: w.x, y: GY - 60, w: 44, h: 10, t: 0, next: 1.4, warnT: -1, layer: 'front' });
    jet.update = function (S, dt) {
      this.t += dt; if (w.dead) { this.dead = true; return; }
      if (w.solid && this.warnT < 0 && this.t > this.next) this.warnT = 0;
      if (this.warnT >= 0) { this.warnT += dt; if (this.warnT > 0.7) { this.warnT = -1; this.next = this.t + 2.4; B.column(S, b, w.x + 22, { w: 36, h: 150, life: 0.7, col: '#ff7a1f', icon: 'flame' }); } }
    };
    jet.draw = function (ctx) {
      if (this.warnT < 0) return;
      const cx = w.x + 22, top = GY - 46, f = this.warnT / 0.7, bl = Math.floor(this.warnT * 14) % 2 === 0;
      ctx.fillStyle = bl ? 'rgba(255,90,31,.55)' : 'rgba(255,200,60,.35)'; ctx.beginPath(); ctx.ellipse(cx, top + 4, 24, 6, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(90,90,100,.55)'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(cx - 12 + i * 12, top - 6 - f * 26 - i * 4, 5 + f * 6, 0, 7); ctx.fill(); }
      ctx.font = 'bold 12px ' + LA.FONT; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#1b1220'; ctx.strokeText('HOT!', cx, top - 40); ctx.fillStyle = '#ff5a1f'; ctx.fillText('HOT!', cx, top - 40);
    };
  }
  B.register('THE GRILL MARSHAL', {
    art: 'grillmarshal', artKeys: ['grill3'], faces: -1, hit: [54, 92], hp: 10, phases: [0.6, 0.3], speed: [1.35, 1.6, 1.9], cd: [1.5, 1.25, 1.05],
    lastWords: 'MY... CLIPBOARD...',
    headline: ['GRILL MARSHAL GRILLED', 'Block party back on. Marshal cited for grilling without a permit at his own retirement party.'],
    quips: { 2: 'NO PERMIT, NO PARTY!', 3: "I'LL FINE THE WHOLE BLOCK!" },
    seq: { 1: ['toss', 'toss', 'toss'], 2: ['grills', 'toss', 'toss'], 3: ['ban', 'toss', 'grills', 'toss'] },
    attacks: {
      toss: { tell: 0.55, say: 'PERMIT REVOKED!', rec: 0.4,
        start(S, b) {
          const t = tx(S, b), offs = b.phase === 3 ? [-110, 10, 140] : b.phase === 2 ? [-70, 110] : [0];
          offs.forEach((o, i) => B.lobTo(S, b, b.cx() + b.face * 22, handY(b), inA(b, t + o * -b.face), { T: 58 + i * 12, icon: 'fireball', size: 26, r: 10, spin: 0.2, glow: true,
            onLand(S, e) { B.fire(S, b, e.x, { w: 44, life: b.phase === 1 ? 2.0 : 2.4, warn: 0.3 }); } }));
          B.sfx('fire');
        } },
      grills: { ph: 2, tell: 0.7, say: 'THESE GRILLS ARE ILLEGAL', rec: 0.4, can: (S, b) => alive(b, (e) => e.style === 'grill') === 0,
        start(S, b) { const p = B.target(S, b), px = p ? B.pcx(p) : b.cx(); [px - 170, px + 170].forEach((x) => lockedGrill(S, b, x)); } },
      ban: { ph: 3, tell: 0.65, say: 'BLOCK PARTY CANCELLED!', rec: 0.4,
        start(S, b) { const t = tx(S, b); for (let i = 0; i < 5; i++) B.drop(S, b, inA(b, t + (i - 2) * 120, 40), { delay: 0.8 + Math.abs(i - 2) * 0.2, icon: 'fireball', size: 30, r: 11, spin: 0.1, onLand(S, e) { B.fire(S, b, e.x, { w: 40, life: 1.3, warn: 0.15 }); } }); } },
    },
  });

  // ------------------------------------------------------------------ BRANDAN 69 — the Melrose walk-off
  // Tina the Outlet strolls by with Mr. Mason McLuvin in the background; Brandan freezes to gawk (your opening),
  // then rages faster every time. Parody archetypes only, drawn in code.
  function drawCouple(ctx, x, dir, t, sc) {
    sc = sc || 0.92;
    const tina = ART().drawn('tina', 1), mason = ART().drawn('mason', 0), dh = 104 * sc, base = GY - 6;
    const bob = (o) => -Math.abs(Math.sin(t * 7 + o)) * 3;
    const draw = (im, cx, o, h) => { const dw = h * im.width / im.height; ctx.save(); ctx.translate(cx, base + bob(o)); if (dir > 0) ctx.scale(-1, 1); ctx.drawImage(im, -dw / 2, -h, dw, h); ctx.restore(); };
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(x, base + 2, 60 * sc, 5, 0, 0, 7); ctx.fill();
    draw(mason, x - dir * 26 * sc, 1.6, dh * 1.06); draw(tina, x + dir * 22 * sc, 0, dh * 0.94);
    const ic = ART().icon('heart'); ctx.drawImage(ic, x - 7, base - dh - 8 + Math.sin(t * 4) * 4, 14, 14);
  }
  B.drawCouple = drawCouple;
  function stroll(S, b) {
    const p = B.target(S, b), fromLeft = !p || B.pcx(p) > b.A.x + b.A.w / 2;
    b.mem.stroll = { t: 0, dir: fromLeft ? 1 : -1, x: fromLeft ? b.A.x - 80 : b.A.x + b.A.w + 80, dur: 4.2 };
    b.mem.nextStroll = 18;
  }
  B.register('BRANDAN 69', {
    art: 'adamDeuce', warmDrawn: ['tina', 'mason'], faces: -1, hit: [44, 92], hp: 12, phases: [0.6, 0.3], speed: [1.5, 1.75, 2.0], cd: [1.5, 1.25, 1.0],
    lastWords: 'CLIP THAT... NOBODY CLIP THAT',
    headline: ['BRANDAN 69 LEFT ON READ', 'Melrose podcaster announces "healthiest breakup ever" in a 4-hour episode. Views: 12. Ads: 40.'],
    quips: { 2: "THAT'S NOT WHO I THINK IT IS...", 3: 'EVERYBODY STOP LOOKING AT ME!' },
    seq: { 1: ['mic', 'nojump', 'mic'], 2: ['pod', 'mic', 'nojump'], 3: ['clout', 'pod', 'mic', 'nojump'] },
    init(S, b) { b.mem.nextStroll = 99; },
    onStart(S, b) { stroll(S, b); },
    onPhase(S, b) { b.mem.pendingStroll = true; },
    think(S, b, dt) {
      const s = b.mem.stroll;
      if (s) {
        s.t += dt; s.x += s.dir * ((b.A.w + 160) / s.dur) * dt;
        if (s.t > 0.5 && !s.gawked && (b.st === 'move' || b.st === 'rec')) {
          s.gawked = true; b.face = s.dir > 0 ? -1 : 1; b.stun(2.3, '...BRO?!'); b.tint = null;
          LA.pop(S, s.x + s.dir * 60, GY - 130, 'TINA THE OUTLET', '#ff6fae'); LA.pop(S, s.x + s.dir * 40, GY - 112, '& MR. MASON McLUVIN', '#ffe36a');
          b.onUnstun = (S, b) => { b.rage++; b.tint = '#ff2b2b'; b.tintA = Math.min(0.4, 0.13 * b.rage); b.say(b.rage > 1 ? 'AGAIN?! AAARGH!' : "THAT'S MY—! AAARGH!", 1.5, '#c0102a'); LA.camera.kick(6); b.cd = 0.4; };
        }
        if (b.st === 'stun' && s.gawked) b.face = s.x < b.cx() ? -1 : 1;
        if (s.t > s.dur) b.mem.stroll = null;
      } else if (b.st === 'move' && (b.mem.pendingStroll || (b.mem.nextStroll -= dt) <= 0)) { b.mem.pendingStroll = false; stroll(S, b); }
    },
    drawUnder(ctx, S, b) { const s = b.mem.stroll; if (s) drawCouple(ctx, s.x, s.dir, s.t); },
    drawOver(ctx, S, b) { if (b.st === 'stun' && b.mem.stroll) { const ic = ART().icon('sweat'); ctx.drawImage(ic, b.cx() + 16, b.y - 4 + (b.t * 20) % 10, 12, 16); } },
    attacks: {
      mic: { tell: 0.5, say: 'HOT TAKE!', rec: 0.35,
        start(S, b) { const t = tx(S, b), n = b.phase === 1 ? 1 : 2; for (let i = 0; i < n; i++) B.lobTo(S, b, b.cx() + b.face * 18, handY(b), inA(b, t + i * 100 * -b.face), { T: 48 + i * 14, icon: 'mic', size: 26, r: 10, spin: 0.3 }); } },
      nojump: { tell: 0.65, say: 'NO JUMPING!', rec: 0.5, max: 2,
        start(S, b) { B.leap(S, b, -7.5, null, (S, b) => slamShocks(S, b, { speed: 5.2 })); }, run(S, b, t) { return airDone(b, t); } },
      pod: { ph: 2, tell: 0.6, say: 'SMASH THAT LIKE!', rec: 0.35, max: 2,
        start(S, b) { b.mem.pw = 0; },
        run(S, b, t) { if (b.mem.pw < 3 && t > b.mem.pw * 0.45) { const hi = b.mem.pw === 1; B.straight(S, b, b.cx() + b.face * 24, hi ? GY - 60 : GY - 16, b.face, { speed: 4.6, icon: 'wave', size: 30, r: 11, flipX: b.face > 0 }); b.mem.pw++; } return b.mem.pw >= 3; } },
      clout: { ph: 3, tell: 0.75, say: 'CLOUT CHASE!', rec: 0.2, max: 4,
        start(S, b) { b.vx = b.face * 8; }, run(S, b, t, dt) { return dash(S, b, t, dt, 'ow. my brand.'); } },
    },
  });
  // level-side tease: the couple strolls past early in Melrose (foreshadowing the gag)
  LA.setpieces.register('walkoff', {
    init(S, lv) { return { x0: lv.x0 + Math.min(1600, lv.len * 0.25), state: 'wait', t: 0, x: 0, dir: -1 }; },
    update(S, sp, dt) {
      if (sp.state === 'done') return;
      const lead = LA.game.leader(S); if (!lead) return;
      if (sp.state === 'wait' && lead.x > sp.x0 - 420) { sp.state = 'walk'; sp.x = LA.camera.x + LA.view.VW + 60; sp.t = 0; S.flags.walkoffSeen = true; }
      if (sp.state === 'walk') { sp.t += dt; sp.x += sp.dir * 1.9 * dt * 60; if (sp.x < LA.camera.x - 200 || sp.t > 14) sp.state = 'done'; }
    },
    draw(ctx, S, sp, layer) {
      if (layer !== 'back' || sp.state !== 'walk') return;
      drawCouple(ctx, sp.x, sp.dir, sp.t, 0.8);
      if (sp.t < 3.5) B.bubble(ctx, sp.x, GY - 104, 'is that... TINA?', '#ff3d8b', Math.min(1, (3.5 - sp.t) * 2));
    },
  });

  // ------------------------------------------------------------------ GURU KALE — $20 smoothie lobs + levitating cleanse
  // tuned after LOCAL bot runs: she kept 280px away (nearly unstompable) and long puddles chained into the next cup
  const cupLand = (S, b) => (S2, e) => B.puddle(S, b, e.x, { r: 24, life: 2.2, col: '#ff6fae', label: 'SPLAT' });
  B.register('GURU KALE', {
    art: 'bossGuruKale', faces: -1, hit: [46, 92], hp: 9, phases: [0.6, 0.3], speed: [1.3, 1.5, 1.8], cd: [1.85, 1.45, 1.15],
    style: 'keep', keep: 175, lastWords: 'MY CHAKRAS... ARE MISALIGNED...',
    headline: ['GURU KALE CLEANSED', 'EVERYWHERE market names a smoothie after her. It costs $24 and contains one (1) grape.'],
    quips: { 2: 'YOUR AURA IS BEIGE', 3: 'SMOOTHIES ARE NOW $40!' },
    seq: { 1: ['cup', 'cup', 'cup'], 2: ['cleanse', 'cup', 'cup'], 3: ['cleanse', 'vibes', 'cup', 'surge'] },
    attacks: {
      cup: { tell: 0.65, say: 'ONLY $20!', rec: 0.5,
        start(S, b) { const t = tx(S, b), n = b.phase; for (let i = 0; i < n; i++) B.lobTo(S, b, b.cx() + b.face * 18, handY(b), inA(b, t + (i - (n - 1) / 2) * 100), { T: 50 + i * 10, icon: 'cup', size: 26, r: 10, spin: 0.12, onLand: cupLand(S, b) }); } },
      cleanse: { ph: 2, tell: 0.7, say: 'CLEANSE!', rec: 0.5, max: 5,
        start(S, b) { b.float = true; b.mem.y0 = GY - b.h; b.mem.cd = 0; },
        run(S, b, t, dt) {
          const k = dt * 60, top = GY - b.h - 74;                          // reachable with a double jump (stomp her mid-cleanse)
          if (t < 0.5) b.y = LA.lerp(b.mem.y0, top, t / 0.5);
          else if (t < 3.2) { b.y = top + Math.sin(t * 3) * 6; const p = B.target(S, b); if (p) b.x += LA.clamp(B.pcx(p) - b.cx(), -1.2, 1.2) * k; if (t > 0.9 + b.mem.cd * 0.7 && b.mem.cd < 3) { b.mem.cd++; B.drop(S, b, inA(b, p ? B.pcx(p) : b.cx()), { delay: 0.6, icon: 'cup', size: 26, r: 10, spin: 0, onLand: cupLand(S, b) }); } }
          else { b.float = false; b.air = true; }
          return t > 3.3 && !b.air;
        },
        end(S, b) { b.float = false; } },
      vibes: { ph: 3, tell: 0.6, say: 'GOOD VIBES ONLY', rec: 0.4,
        start(S, b) { slamShocks(S, b, { speed: 3.4, h: 30, icon: 'heart', size: 30 }); } },
      surge: { ph: 3, tell: 0.55, say: 'SURGE PRICING!', rec: 0.3, max: 2,
        start(S, b) { b.mem.sn = 0; },
        run(S, b, t) { if (b.mem.sn < 3 && t > b.mem.sn * 0.32) { B.lobTo(S, b, b.cx() + b.face * 18, handY(b), inA(b, tx(S, b)), { T: 44, icon: 'cup', size: 24, r: 10, onLand: cupLand(S, b) }); b.mem.sn++; } return b.mem.sn >= 3; } },
    },
  });

  // ------------------------------------------------------------------ THE AGENT — contract toss + bodyguard + commission vacuum
  B.register('THE AGENT', {
    art: 'bossAgent', warmDrawn: ['bodyguard'], faces: -1, hit: [48, 92], hp: 10.5, phases: [0.6, 0.3], speed: [1.4, 1.6, 1.9], cd: [1.45, 1.2, 1.0],
    style: 'keep', keep: 300, lastWords: "LET'S DO LUNCH... NEVER",
    headline: ['AGENT DROPPED BY EVERY CLIENT', 'Beverly Hills agent negotiates his own severance, takes 90% of it, calls it "a great deal for everyone."'],
    quips: { 2: 'YOU NEED PROTECTION, KID', 3: 'NOBODY LEAVES THE AGENCY!' },
    seq: { 1: ['contract', 'commission', 'contract'], 2: ['guard', 'contract', 'commission', 'contract'], 3: ['guard', 'calls', 'commission', 'contract'] },
    attacks: {
      contract: { tell: 0.5, say: 'SIGN HERE, KID!', rec: 0.35,
        start(S, b) {
          B.straight(S, b, b.cx() + b.face * 24, GY - 16, b.face, { speed: 3.8, icon: 'contract', size: 24, r: 10, shootable: true, pre(S, e) { e.rot = Math.sin(e.age * 10) * 0.3; } });
          if (b.phase > 1) { const t = tx(S, b); [-60, 70].forEach((o, i) => B.lobTo(S, b, b.cx() + b.face * 18, handY(b), inA(b, t + o), { T: 50 + i * 12, icon: 'contract', size: 24, r: 10, spin: 0.2, shootable: true })); }
        } },
      commission: { tell: 0.65, say: 'COMMISSION TIME!', rec: 0.4, max: 2,
        start(S, b) { const p = B.target(S, b); B.gust(b, p && B.pcx(p) < b.cx() ? 1 : -1, b.phase === 1 ? 1.7 : 2.1, 1.5); for (let i = 0; i < 2; i++) B.drop(S, b, inA(b, b.cx() + (i ? 110 : -110), 50), { delay: 0.7 + i * 0.3, icon: 'bag', size: 28, r: 11 }); },
        run(S, b, t) { b.anim.rot = Math.sin(t * 20) * 0.06; return t > 1.5; } },
      guard: { ph: 2, tell: 0.7, say: 'SECURITY!', rec: 0.3, can: (S, b) => alive(b, (e) => e.isAdd) === 0,
        start(S, b) { B.add(S, b, b.cx() - b.face * 10, { art: () => ART().drawn('bodyguard', 0), dh: 80, w: 34, h: 62, hp: 2, speed: 1.15, label: 'SECURITY' }); } },
      calls: { ph: 3, tell: 0.6, say: "I'LL CALL YOUR MOM!", rec: 0.35, max: 2,
        start(S, b) { b.mem.cn = 0; },
        run(S, b, t) { if (b.mem.cn < 3 && t > b.mem.cn * 0.35) { const tt = inA(b, tx(S, b) + (b.mem.cn - 1) * 110); B.lobTo(S, b, b.cx() + b.face * 18, handY(b), tt, { T: 46, icon: 'phone', size: 22, r: 9, spin: 0.3, onLand(S, e) { B.shock(S, b, e.x, -1, { speed: 3.6, h: 16, life: 0.8 }); B.shock(S, b, e.x, 1, { speed: 3.6, h: 16, life: 0.8 }); } }); b.mem.cn++; } return b.mem.cn >= 3; } },
    },
  });

  // ------------------------------------------------------------------ THE BROWNOUT BARON — rolling blackouts
  B.register('THE BROWNOUT BARON', {
    art: 'brownout', faces: -1, hit: [54, 90], hp: 10.5, phases: [0.6, 0.3], speed: [1.3, 1.5, 1.7], cd: [1.55, 1.3, 1.05],
    eyeY: 26, lastWords: 'WHO... TURNED OFF... ME?',
    headline: ['BROWNOUT BARON LOSES POWER', 'Utility apologizes for the outage, raises rates 30% to cover the cost of the apology.'],
    quips: { 2: 'YOUR BILL HAS DOUBLED', 3: 'LIGHTS OUT, HERO!' },
    seq: { 1: ['brownout', 'surge', 'surge'], 2: ['brownout', 'rolling', 'surge'], 3: ['grid', 'surge', 'rolling', 'brownout'] },
    attacks: {
      brownout: { tell: 0.6, say: 'BROWNOUT!', rec: 0.3,
        start(S, b) { B.blackout(b, b.phase === 1 ? 1.8 : b.phase === 2 ? 2.6 : 3.2, 0.9); const t = tx(S, b); B.lobTo(S, b, b.cx() + b.face * 18, handY(b), inA(b, t), { T: 60, icon: 'orb', size: 24, r: 10, glow: true }); B.sfx('powerdown'); } },
      surge: { tell: 0.5, say: 'POWER SURGE!', rec: 0.35,
        start(S, b) { const t = tx(S, b); (b.phase === 1 ? [0] : [-40, 90]).forEach((o, i) => B.lobTo(S, b, b.cx() + b.face * 18, handY(b), inA(b, t + o * -b.face), { T: 52 + i * 12, icon: 'orb', size: 24, r: 10, glow: true, bounce: b.phase === 3 ? 1 : 0, rest: 0.45 })); } },
      rolling: { ph: 2, tell: 0.6, say: 'ROLLING BLACKOUTS!', rec: 0.35,
        start(S, b) { const dir = tx(S, b) < b.cx() ? -1 : 1, n = 6; for (let i = 0; i < n; i++) { const x = dir > 0 ? b.A.x + 80 + i * 150 : b.A.x + b.A.w - 80 - i * 150; B.drop(S, b, inA(b, x), { delay: 0.7 + i * 0.28, icon: 'spark', size: 30, r: 11, spin: 0, glow: true }); } B.blackout(b, 1.2, 0.8); } },
      grid: { ph: 3, tell: 0.8, say: 'GRID DOWN!', rec: 0.4, max: 3,
        start(S, b) { B.blackout(b, 3.0, 0.92); const t = tx(S, b); [t - 200, t, t + 200, t - 100, t + 100].forEach((x, i) => { x = inA(b, x, 40); B.marker(S, b, x, { warn: 0.9 + (i > 2 ? 0.9 : 0), w: 40, col: '#ffe36a', icon: 'spark', glow: true, fire: (S, x) => B.column(S, b, x, { w: 30, h: 220, life: 0.6, col: '#ffe36a', icon: 'spark', glow: true }) }); }); },
        run(S, b, t) { return t > 1.9; } },
    },
  });
})();
