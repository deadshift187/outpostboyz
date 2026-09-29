// SCREENS — overlays and full screens: 'pause' (START in a level), 'results' (level clear tally, grade,
// stars; Full City Run total), 'gameover' (arcade CONTINUE? 10…0), 'settings' (volumes, shake, controls,
// erase save) and 'credits'. Overlays are pushed on top of the level so the frozen world shows beneath.
(function () {
  'use strict';
  const LA = window.LA, ui = LA.ui, save = LA.save;
  const S = () => LA.game.S;

  // ============================ PAUSE ============================
  const P = { t: 0, menu: null };
  LA.scenes.register('pause', {
    enter() {
      P.t = 0; ui.sfx('pause');
      const full = S() && S().mode === 'fullrun';
      P.menu = new ui.Menu([
        { label: 'RESUME', act: () => LA.scenes.pop() },
        { label: 'RESTART LEVEL', sub: full ? 'the whole run, from the top' : 'from the start line', act: () => LA.flow.restartLevel(S()) },
        { label: full ? 'QUIT RUN' : 'EXIT TO MAP', act: () => LA.flow.exitToMap(S()) },
        { label: 'SETTINGS', act: () => LA.scenes.push('settings') },
        { label: 'QUIT TO TITLE', act: () => LA.flow.quitToTitle() },
      ], { rh: 42, gap: 7 });
    },
    update(dt) {
      P.t += dt;
      const inp = ui.read();
      if (P.t > 0.1 && (inp.start || inp.back)) { LA.scenes.pop(); ui.sfx('pause'); return; }
      P.menu.update(inp, dt);
    },
    draw(ctx) {
      const VW = LA.view.VW, VH = LA.view.VH, s = S();
      ui.scrim(ctx, 0.62);
      ui.text(ctx, 'PAUSED', VW / 2, 120, { size: 46, weight: '900', col: ui.C.yellow, shadow: '#7a3b00', sd: 4, stroke: '#2a1300', sw: 6 });
      if (s) ui.text(ctx, (s.mode === 'fullrun' ? 'FULL CITY RUN · ' + ui.time(s.run.time) : s.level.id + ' · ' + s.level.name) + ' · ' + s.tier.label, VW / 2, 162, { size: 13, weight: '800', mono: true, col: '#fff', stroke: 'rgba(0,0,0,.8)', maxW: VW - 30 });
      P.menu.draw(ctx, VW / 2, 196, { w: 300 });
      ui.text(ctx, 'START / ESC TO RESUME', VW / 2, VH - 24, { size: 11, weight: 'bold', mono: true, col: ui.C.dim, stroke: 'rgba(0,0,0,.8)' });
    },
  });

  // ============================ RESULTS ============================
  const R = { t: 0, data: null, skip: false, stamp: false };
  const ROW_T = 0.32;
  function rows(d) {
    if (d.kind === 'fullrun') return [
      ['TOTAL TIME', ui.time(d.time), '#ffcc3a'],
      ['SCORE', ui.num(d.score), '#fff'],
      ['CRYSTALS', String(d.crystals), '#57e08a'],
      ['CITIZENS SAVED', String(d.saved), '#8fd8ff'],
      ['DEATHS', String(d.deaths), '#ff8a8a'],
      ['CONTINUES', String(d.continues), '#c9cede'],
    ];
    return [
      ['TIME', ui.timeShort(d.time) + '  (par ' + ui.timeShort(d.par) + ')', '#fff'],
      ['CRYSTALS', d.crystals + (d.crysTotal ? ' / ' + d.crysTotal : ''), '#57e08a'],
      ['CITIZENS SAVED', d.saved + (d.citTotal ? ' / ' + d.citTotal : ''), '#8fd8ff'],
      ['TIME BONUS', '+' + ui.num(d.bonus), '#ffcc3a'],
      ['LEVEL SCORE', ui.num(d.score), '#fff'],
    ];
  }
  LA.scenes.register('results', {
    passThrough: true,                                                     // the level keeps celebrating beneath
    enter(p) { R.t = 0; R.data = p.R; R.skip = false; R.stamp = false; ui.music('results'); },
    update(dt) {
      R.t += dt;
      const d = R.data, n = rows(d).length, stampAt = n * ROW_T + 0.35, ready = stampAt + 0.8;
      if (!R.stamp && R.t >= stampAt) { R.stamp = true; ui.sfx(d.kind === 'fullrun' ? (d.record ? 'oneup' : 'goal') : (d.grade === 'S' ? 'oneup' : 'combo')); LA.camera.kick(3); }
      const inp = ui.read();
      if (!inp.ok && !inp.tap) return;
      if (R.t < ready) { R.t = ready; R.stamp = true; return; }             // first press: finish the tally
      ui.sfx('select');
      LA.flow.afterResults(d);
    },
    draw(ctx) {
      const VW = LA.view.VW, VH = LA.view.VH, d = R.data, rs = rows(d), full = d.kind === 'fullrun';
      ui.scrim(ctx, Math.min(0.6, R.t * 2));
      const w = Math.min(470, VW - 20), h = full ? 452 : (d.beat && d.beat.unlocked && d.beat.unlocked.length ? 468 : 440), x = VW / 2 - w / 2, y = Math.max(8, (VH - h) / 2 - 6);
      const slide = (1 - ui.ease(R.t / 0.35)) * 60;
      ctx.save(); ctx.translate(0, slide); ctx.globalAlpha = Math.min(1, R.t / 0.2);
      ui.panel(ctx, x, y, w, h, { border: full ? '#ffcc3a' : d.level.world.col, lw: 3 });
      if (full) {
        ui.text(ctx, 'FULL CITY RUN', VW / 2, y + 30, { size: 13, weight: '800', mono: true, col: '#ffcc3a', stroke: false });
        ui.text(ctx, 'THE WHOLE CITY', VW / 2, y + 62, { size: 32, weight: '900', col: '#fff', stroke: 'rgba(0,0,0,.8)', sw: 4, maxW: w - 30 });
        ui.text(ctx, LA.TIERS[d.tier].label + ' · ' + LA.TIERS[d.tier].blurb, VW / 2, y + 90, { size: 12, weight: 'bold', mono: true, col: ui.C.dim, stroke: false });
      } else {
        const lv = d.level;
        ui.text(ctx, (d.how === 'boss' ? 'BOSS DOWN · ' : 'CLEARED · ') + lv.id, VW / 2, y + 30, { size: 13, weight: '800', mono: true, col: lv.world.col, stroke: false });
        ui.text(ctx, lv.name, VW / 2, y + 62, { size: 32, weight: '900', col: '#fff', stroke: 'rgba(0,0,0,.8)', sw: 4, maxW: w - 30 });
        ui.text(ctx, lv.boss ? lv.boss + ' has been held accountable.' : (lv.sub || ''), VW / 2, y + 90, { size: 12, weight: '600', col: ui.C.dim, stroke: false, maxW: w - 30 });
      }
      // tally rows
      const rx0 = x + 22, rx1 = x + w - 22;
      rs.forEach((r, i) => {
        const el = R.t - i * ROW_T - 0.2; if (el < 0) return;
        const ry = y + 128 + i * 34, a = Math.min(1, el / 0.15);
        ctx.globalAlpha = a;
        ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(x + 12, ry - 14, w - 24, 28);
        ui.text(ctx, r[0], rx0, ry, { size: 13, weight: '800', mono: true, col: ui.C.dim, stroke: false, align: 'left' });
        ui.text(ctx, r[1], rx1, ry, { size: 17, weight: '900', mono: true, col: r[2], stroke: false, align: 'right', maxW: w * 0.55 });
      });
      ctx.globalAlpha = 1;
      const by = y + 128 + rs.length * 34 + 16;
      if (R.stamp) {
        const st = R.t - (rs.length * ROW_T + 0.35), sc = 1 + Math.max(0, 1 - st / 0.18) * 1.6;
        if (full) {
          if (d.record) { ctx.save(); ctx.translate(VW / 2, by + 30); ctx.scale(sc, sc); ctx.rotate(-0.06); ui.text(ctx, 'NEW RECORD!', 0, 0, { size: 34, weight: '900', col: '#ffcc3a', shadow: '#7a3b00', sd: 3, stroke: '#2a1300', sw: 5 }); ctx.restore(); }
          else if (d.best) ui.text(ctx, 'BEST ' + ui.time(d.best.time), VW / 2, by + 30, { size: 18, weight: '900', mono: true, col: '#c9cede', stroke: false });
        } else {
          // grade stamp on the left, stars on the right
          const gx = x + w * 0.27;
          ctx.save(); ctx.translate(gx, by + 34); ctx.scale(sc, sc); ctx.rotate(-0.12);
          ui.text(ctx, d.grade, 0, 0, { size: 64, weight: '900', col: ui.gradeCol(d.grade), shadow: 'rgba(0,0,0,.6)', sd: 4, stroke: '#111', sw: 6 });
          ctx.restore();
          ui.text(ctx, 'GRADE', gx, by + 76, { size: 10, weight: '800', mono: true, col: ui.C.dim, stroke: false });
          const labels = ['CLEARED', 'NO DEATHS', 'UNDER PAR'], got = [true, d.deaths === 0, d.time <= d.par];
          for (let k = 0; k < 3; k++) {
            const sx = x + w * 0.52 + k * (w * 0.15), pop = LA.clamp((st - 0.12 - k * 0.14) / 0.2, 0, 1);
            ui.star(ctx, sx, by + 30, 13 * (0.3 + ui.back(pop) * 0.7), got[k] && pop > 0 ? '#ffe36a' : 'rgba(255,255,255,.12)');
            ui.text(ctx, labels[k], sx, by + 56, { size: 8, weight: '800', mono: true, col: got[k] ? '#fff' : '#6d7388', stroke: false });
          }
          const tag = d.first ? 'FIRST CLEAR!' : (d.bestScore ? 'NEW BEST SCORE!' : d.bestTime ? 'NEW BEST TIME!' : '');
          if (tag && st > 0.4) ui.text(ctx, tag, x + w * 0.67, by + 78, { size: 12, weight: '900', mono: true, col: ui.C.green, stroke: false });
        }
      }
      const ready = rs.length * ROW_T + 1.15;
      if (R.t > ready && ui.blink(R.t, 1.6)) ui.text(ctx, LA.input.touch && LA.input.touch.active ? 'TAP TO CONTINUE' : 'PRESS JUMP TO CONTINUE', VW / 2, y + h - 20, { size: 13, weight: '900', mono: true, col: ui.C.green, stroke: false });
      if (d.beat && d.beat.unlocked && d.beat.unlocked.length && R.t > ready) ui.text(ctx, 'UNLOCKED: ' + d.beat.unlocked.join(' + '), VW / 2, y + h - 46, { size: 11, weight: '900', mono: true, col: '#ff6fae', stroke: false, maxW: w - 20 });
      ctx.restore();
    },
  });

  // ============================ GAME OVER / CONTINUE ============================
  const G = { t: 0, S: null, n: 10, over: false, overT: 0 };
  const QUIPS = ['"Thank you for your patience."', '"We\'ve formed a task force."', '"The budget was reallocated."', '"Mistakes were made. Not by me."', '"Have you tried moving to Texas?"'];
  LA.scenes.register('gameover', {
    enter(p) { G.t = 0; G.S = p.S; G.n = 10; G.over = false; G.overT = 0; G.q = QUIPS[Math.floor(Math.random() * QUIPS.length)]; ui.music('gameover'); LA.preload(['newscum']); },
    update(dt) {
      G.t += dt;
      const inp = ui.read();
      if (G.over) { G.overT += dt; if (G.overT > 2.4 || (G.overT > 0.6 && inp.ok)) LA.flow.giveUp(G.S); return; }
      const prevN = G.n; G.n = Math.max(0, 10 - Math.floor(Math.max(0, G.t - 0.6)));
      if (G.n !== prevN) ui.sfx('menu');
      if (G.t > 0.8) {
        if (inp.ok) { ui.sfx('select'); LA.flow.continueRun(G.S); return; }
        if (inp.back) { G.over = true; G.overT = 0; ui.sfx('denied'); return; }
      }
      if (G.t > 0.6 + 10.9) { G.over = true; G.overT = 0; }
    },
    draw(ctx) {
      const VW = LA.view.VW, VH = LA.view.VH;
      ui.scrim(ctx, Math.min(0.78, G.t * 1.5));
      const im = LA.img('newscum');
      if (im) { const h = Math.min(190, VH * 0.32), w = h * im.naturalWidth / im.naturalHeight, bob = Math.sin(G.t * 2.2) * 3; ctx.drawImage(im, VW / 2 - w / 2, VH - h - 40 + bob, w, h); }
      if (G.over) {
        const sc = 0.7 + ui.back(G.overT / 0.35) * 0.3;
        ctx.save(); ctx.translate(VW / 2, 170); ctx.scale(sc, sc); ui.text(ctx, 'GAME OVER', 0, 0, { size: 56, weight: '900', col: ui.C.bad, shadow: '#5a0000', sd: 4, stroke: '#1a0000', sw: 6, maxW: VW - 20 }); ctx.restore();
        ui.text(ctx, 'THE CITY THANKS YOU FOR YOUR SERVICE.', VW / 2, 222, { size: 12, weight: '800', mono: true, col: '#fff', stroke: 'rgba(0,0,0,.8)', maxW: VW - 20 });
        return;
      }
      ui.text(ctx, 'CONTINUE?', VW / 2, 92, { size: 44, weight: '900', col: ui.C.yellow, shadow: '#7a3b00', sd: 4, stroke: '#2a1300', sw: 6, maxW: VW - 20 });
      const frac = G.t > 0.6 ? (G.t - 0.6) % 1 : 0, sc = 1 + (1 - Math.min(1, frac / 0.2)) * 0.35;
      ctx.save(); ctx.translate(VW / 2, 190); ctx.scale(sc, sc);
      ui.text(ctx, String(G.n), 0, 0, { size: 110, weight: '900', col: G.n <= 3 ? ui.C.bad : '#fff', shadow: 'rgba(0,0,0,.6)', sd: 5, stroke: '#111', sw: 7 });
      ctx.restore();
      const s = G.S;
      if (s) ui.text(ctx, (s.mode === 'fullrun' ? 'FULL CITY RUN · from the last checkpoint' : s.level.id + ' ' + s.level.name + ' · fresh lives'), VW / 2, 258, { size: 12, weight: '800', mono: true, col: '#c9cede', stroke: 'rgba(0,0,0,.8)', maxW: VW - 20 });
      if (ui.blink(G.t, 2)) ui.text(ctx, LA.input.touch && LA.input.touch.active ? 'TAP TO CONTINUE' : 'PRESS START / JUMP', VW / 2, 286, { size: 18, weight: '900', col: ui.C.green, stroke: '#04240f', sw: 4 });
      ui.text(ctx, 'COIN / ESC: GIVE UP', VW / 2, 310, { size: 10, weight: 'bold', mono: true, col: ui.C.dim, stroke: 'rgba(0,0,0,.8)' });
      // Newscum's speech bubble
      if (im) {
        const bx = VW / 2, by = VH - Math.min(190, VH * 0.32) - 64;
        ctx.font = ui.f(12, '800'); const bw = Math.min(VW - 30, ctx.measureText(G.q).width + 24);
        ui.rr(ctx, bx - bw / 2, by - 16, bw, 30, 10); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#111'; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx - 6, by + 14); ctx.lineTo(bx + 4, by + 26); ctx.lineTo(bx + 8, by + 14); ctx.fillStyle = '#fff'; ctx.fill();
        ui.text(ctx, G.q, bx, by, { size: 12, weight: '800', col: '#111', stroke: false, maxW: bw - 16 });
        ui.text(ctx, 'GOV. NEWSCUM', bx, VH - 26, { size: 10, weight: '900', mono: true, col: '#ff8a8a', stroke: 'rgba(0,0,0,.8)' });
      }
    },
  });

  // ============================ SETTINGS ============================
  const ST = { t: 0, menu: null, view: 'menu', erase: 0 };
  function applyAudio() { LA.flow.applySettings && LA.flow.applySettings(); }
  LA.scenes.register('settings', {
    enter() {
      ST.t = 0; ST.view = 'menu'; ST.erase = 0;
      const s = save.settings;
      const vol = (k) => ({ value: () => String(s[k]).padStart(2, ' ') + '/10', adjust: (d) => { save.setSetting(k, LA.clamp(s[k] + d, 0, 10)); applyAudio(); if (k === 'sfx') ui.sfx('crystal'); } });
      ST.menu = new ui.Menu([
        Object.assign({ label: 'MUSIC' }, vol('music')),
        Object.assign({ label: 'SOUND FX' }, vol('sfx')),
        { label: 'SCREEN SHAKE', value: () => (s.shake !== false ? 'ON' : 'OFF'), adjust: () => save.setSetting('shake', s.shake === false), act: () => save.setSetting('shake', s.shake === false) },
        { label: 'CONTROLS', act: () => { ST.view = 'controls'; } },
        { label: 'ERASE SAVE DATA', col: '#ff5d5d', act: (m) => { ST.erase++; if (ST.erase >= 3) { save.erase(); ST.erase = 0; m.msg = 'SAVE ERASED'; m.msgT = 2; } else { m.msg = 'PRESS ' + (3 - ST.erase) + ' MORE TIME' + (3 - ST.erase > 1 ? 'S' : '') + ' TO ERASE EVERYTHING'; m.msgT = 2.5; } } },
        { label: 'BACK', act: () => LA.scenes.pop() },
      ], { rh: 40, gap: 7 });
    },
    update(dt) {
      ST.t += dt;
      const inp = ui.read();
      if (ST.view === 'controls') { if (ST.t > 0.1 && (inp.ok || inp.back || inp.tap)) { ST.view = 'menu'; ui.sfx('menu'); } return; }
      if (inp.back) { ui.sfx('menu'); LA.scenes.pop(); return; }
      const before = ST.menu.i;
      ST.menu.update(inp, dt);
      if (ST.menu.i !== before && ST.menu.cur().label !== 'ERASE SAVE DATA') ST.erase = 0;
    },
    draw(ctx) {
      const VW = LA.view.VW, VH = LA.view.VH;
      ui.scrim(ctx, 0.8);
      if (ST.view === 'controls') { drawControls(ctx); return; }
      ui.text(ctx, 'SETTINGS', VW / 2, 70, { size: 38, weight: '900', col: ui.C.yellow, shadow: '#7a3b00', sd: 3, stroke: '#2a1300', sw: 5 });
      ST.menu.draw(ctx, VW / 2, 118, { w: 340 });
      ui.text(ctx, '◀ ▶ TO ADJUST · COIN / ESC TO GO BACK', VW / 2, VH - 24, { size: 11, weight: 'bold', mono: true, col: ui.C.dim, stroke: false });
      if (!save.persistent) ui.text(ctx, 'storage unavailable — progress won\'t be saved', VW / 2, VH - 44, { size: 10, weight: 'bold', mono: true, col: '#ff8a8a', stroke: false });
    },
  });
  const CONTROLS = [
    ['KEYBOARD', '#ffcc3a', [['MOVE', '← →  or  A D'], ['JUMP', 'SPACE · Z · ↑  (again = double)'], ['FIRE', 'X · CTRL · J · F'], ['SPRINT', 'SHIFT'], ['PAUSE', 'ENTER · ESC · P']]],
    ['ARCADE · P1', '#57e08a', [['MOVE', 'stick'], ['JUMP', 'B3'], ['FIRE', 'B1'], ['SPRINT', 'B4'], ['START / BACK', '1P START · COIN']]],
    ['ARCADE · P2', '#4dd8ff', [['MOVE', 'stick'], ['JUMP', 'B3'], ['FIRE', 'B1'], ['SPRINT', 'B4'], ['JOIN', '2P START (any time)']]],
    ['GAMEPAD', '#ff6fae', [['MOVE', 'stick · d-pad'], ['JUMP', 'A'], ['FIRE', 'X · Y · RB · RT'], ['SPRINT', 'LB · LT'], ['PAUSE / BACK', 'START · B']]],
    ['TOUCH', '#b07cff', [['MOVE', 'left stick'], ['JUMP / FIRE', 'right buttons'], ['PAUSE', '❚❚ button']]],
  ];
  function drawControls(ctx) {
    const VW = LA.view.VW, VH = LA.view.VH;
    ui.text(ctx, 'CONTROLS', VW / 2, 38, { size: 30, weight: '900', col: ui.C.yellow, shadow: '#7a3b00', sd: 3, stroke: '#2a1300', sw: 5 });
    const cols = VW >= 820 ? 2 : 1, colW = Math.min(cols === 2 ? 380 : 400, (VW - 30) / cols);
    const blocks = cols === 2 ? [[0, 1, 2], [3, 4]] : [[0, 1, 2, 3, 4]];
    const compact = cols === 1;
    blocks.forEach((ids, ci) => {
      let y = 70; const x = VW / 2 - (colW * cols + (cols - 1) * 12) / 2 + ci * (colW + 12);
      for (const id of ids) {
        const [title, col, lines] = CONTROLS[id];
        const lh = compact ? 14 : 18, h = 24 + lines.length * lh;
        ui.panel(ctx, x, y, colW, h, { r: 10, border: col, lw: 1.5 });
        ui.text(ctx, title, x + 10, y + 12, { size: 11, weight: '900', mono: true, col, stroke: false, align: 'left' });
        lines.forEach((ln, i) => {
          ui.text(ctx, ln[0], x + 10, y + 28 + i * lh, { size: compact ? 10 : 11, weight: '800', mono: true, col: ui.C.dim, stroke: false, align: 'left' });
          ui.text(ctx, ln[1], x + colW - 10, y + 28 + i * lh, { size: compact ? 10 : 12, weight: '700', col: '#fff', stroke: false, align: 'right', maxW: colW * 0.62 });
        });
        y += h + (compact ? 5 : 8);
      }
    });
    ui.text(ctx, 'PRESS ANY BUTTON', VW / 2, VH - 14, { size: 11, weight: 'bold', mono: true, col: ui.C.green, stroke: false });
  }

  // ============================ CREDITS ============================
  const CR = { t: 0, then: null, cam: 0, speed: 38, lines: null };
  function creditLines() {
    const bosses = LA.LEVELS.filter((l) => l.boss).map((l) => l.boss);
    const L = [
      ['logo'], ['gap', 40],
      ['h', 'A GAME BY'], ['big', 'OUTPOST BOYZ'], ['gap', 24],
      ['h', 'STARRING'], ['t', 'GOLDEN BOY'], ['t', 'THE INTERN (PLAYER 2)'], ['gap', 24],
      ['h', 'THE CITY'], ['t', 'Every building, every district:'], ['t', 'Los Angeles, west to north.'], ['gap', 24],
      ['h', 'MUSIC'], ['t', '"CLARITY" — PG 308 x JUST TERRY'], ['gap', 24],
      ['h', 'HELD ACCOUNTABLE (ALL PARODY)'],
    ];
    for (let i = 0; i < bosses.length; i += 2) L.push(['s', bosses.slice(i, i + 2).join('  ·  ')]);
    L.push(['gap', 24], ['h', 'SPECIAL THANKS'], ['t', 'Every firefighter who showed up anyway.'], ['t', 'Every neighbor who handed out water.'], ['t', 'Everyone still here.'], ['gap', 24],
      ['s', 'All characters are parody. Any resemblance'], ['s', 'to real officials is their fault.'], ['gap', 40],
      ['big', 'THANKS FOR PLAYING'], ['t', 'outpostboyz.com'], ['gap', 60]);
    return L;
  }
  const LH = { logo: 150, h: 22, big: 38, t: 22, s: 18 };
  LA.scenes.register('credits', {
    enter(p) { CR.t = 0; CR.then = p.then || (() => LA.scenes.go('title', { menu: true })); CR.lines = creditLines(); CR.total = CR.lines.reduce((a, l) => a + (l[0] === 'gap' ? l[1] : LH[l[0]]), 0); CR.cam = LA.city.ready ? LA.city.seg[29][0] + 800 : 0; ui.music('credits'); ui.warmCity(CR.cam, 3); },
    update(dt) {
      CR.t += dt; CR.cam += 30 * dt;
      if (LA.loop.ticks % 40 === 0) ui.warmCity(CR.cam, 3);
      const inp = ui.read();
      const fast = LA.input.p[0].jump || LA.input.p[0].fire;
      if (fast) CR.t += dt * 3;
      const done = CR.t * CR.speed > CR.total + LA.view.VH * 0.6;
      if (done || (CR.t > 1.5 && (inp.back || inp.start || inp.tap))) { const f = CR.then; CR.then = null; f && f(); }
    },
    draw(ctx) {
      const VW = LA.view.VW, VH = LA.view.VH;
      ui.cityBG(ctx, CR.cam, { t: CR.t });
      ui.scrim(ctx, 0.74);
      let y = VH + 20 - CR.t * CR.speed;
      for (const l of CR.lines) {
        const h = l[0] === 'gap' ? l[1] : LH[l[0]];
        if (y > -160 && y < VH + 40) {
          if (l[0] === 'logo') ui.logo(ctx, VW / 2, y + 60, 64);
          else if (l[0] === 'h') ui.text(ctx, l[1], VW / 2, y + 10, { size: 12, weight: '800', mono: true, col: ui.C.dim, stroke: false, maxW: VW - 30 });
          else if (l[0] === 'big') ui.text(ctx, l[1], VW / 2, y + 18, { size: 30, weight: '900', col: ui.C.yellow, shadow: '#7a3b00', sd: 3, stroke: '#2a1300', sw: 4, maxW: VW - 30 });
          else if (l[0] === 't') ui.text(ctx, l[1], VW / 2, y + 10, { size: 16, weight: '700', col: '#fff', stroke: false, maxW: VW - 30 });
          else if (l[0] === 's') ui.text(ctx, l[1], VW / 2, y + 8, { size: 12, weight: '700', col: '#c9cede', stroke: false, maxW: VW - 30 });
        }
        y += h;
      }
      ui.text(ctx, 'HOLD JUMP TO SPEED UP · START TO SKIP', VW / 2, VH - 12, { size: 10, weight: 'bold', mono: true, col: 'rgba(201,183,154,.8)', stroke: false });
      ui.fadeIn(ctx, CR.t, 0.5);
    },
  });
})();
