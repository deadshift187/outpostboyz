// TITLE — scene 'title'. Saint's logo (yellow LOST / pink ANGELES, OUTPOST BOYZ) over the real city
// slowly scrolling by with Golden Boy jogging the street. PRESS START → main menu: START GAME (1P/2P →
// tier), CONTINUE, FULL CITY RUN (locked until the game is beaten), SETTINGS, CREDITS. Idle on the
// PRESS START screen long enough and the cold open plays as an attract loop.
(function () {
  'use strict';
  const LA = window.LA, ui = LA.ui, save = LA.save;
  const ATTRACT_AFTER = 32;
  let camX = 380;                                   // persists between visits so the city keeps rolling

  const T = { t: 0, state: 'press', idle: 0, mode: 'story', menus: {}, hop: 0, hopV: 0, hopY: 0 };

  function tierItems(forRun) {
    return ['tourist', 'local', 'native'].map((id) => {
      const tr = LA.TIERS[id];
      let sub = tr.blurb + ' · ' + tr.lives + ' lives';
      if (forRun) { const b = save.fullrunBest(id); if (b) sub = 'best ' + ui.time(b.time) + ' · ' + tr.blurb; }
      else if (save.hasProgress(id)) sub = save.clearedCount(id) + '/' + LA.LEVELS.length + ' cleared · ' + tr.blurb;
      return { label: tr.label, sub, col: id === 'tourist' ? '#57e08a' : id === 'local' ? '#ffcc3a' : '#ff6fae',
        locked: save.tierUnlocked(id) ? false : 'BEAT THE GAME ON LOCAL TO UNLOCK',
        act: () => { if (forRun) LA.flow.startFullRun(id, LA.flow.players); else LA.flow.startGame(id, LA.flow.players); } };
    }).concat([{ label: 'BACK', act: () => setState('players') }]);
  }

  function build() {
    const r = save.data.resume, hasCont = !!(r && save.anyProgress());
    T.menus.main = new ui.Menu([
      { label: 'START GAME', sub: '1 or 2 players · pick your difficulty', act: () => { T.mode = 'story'; setState('players'); } },
      { label: 'CONTINUE', sub: hasCont ? LA.TIERS[r.tier].label + ' · ' + save.clearedCount(r.tier) + '/' + LA.LEVELS.length + ' cleared' + (r.players > 1 ? ' · 2P' : '') : 'no saved run yet',
        locked: hasCont ? false : 'NO SAVED RUN YET', act: () => LA.flow.continueGame() },
      { label: 'FULL CITY RUN', sub: 'the whole city, one go, one clock', locked: save.data.unlocks.fullrun ? false : 'BEAT THE GAME ON ANY TIER TO UNLOCK',
        act: () => { T.mode = 'fullrun'; setState('players'); } },
      { label: 'SETTINGS', sub: 'volume · screen shake · controls', act: () => LA.scenes.push('settings') },
      { label: 'CREDITS', sub: 'who did this', act: () => LA.scenes.go('credits', { then: () => LA.scenes.go('title', { menu: true }) }) },
    ], { rh: 46, gap: 7 });
    if (!hasCont) T.menus.main.i = 0; else T.menus.main.i = 1;
    T.menus.players = new ui.Menu([
      { label: '1 PLAYER', sub: 'Golden Boy, solo', act: () => { LA.flow.players = 1; setState('tier'); } },
      { label: '2 PLAYERS', sub: 'Golden Boy + The Intern · shared screen', col: '#4dd8ff', act: () => { LA.flow.players = 2; setState('tier'); } },
      { label: 'BACK', act: () => setState('main') },
    ], { rh: 46, gap: 7 });
    T.menus.players.i = LA.flow.players > 1 ? 1 : 0;
  }

  function setState(s) {
    T.state = s; T.st = 0;
    if (s === 'tier') { T.menus.tier = new ui.Menu(tierItems(T.mode === 'fullrun'), { rh: 48, gap: 7 }); const want = ['tourist', 'local', 'native'].indexOf(LA.flow.tier); T.menus.tier.i = want >= 0 && save.tierUnlocked(LA.flow.tier) ? want : 1; }
    if (s === 'main') build();
  }

  LA.scenes.register('title', {
    enter(p) {
      T.t = 0; T.st = 0; T.idle = 0; T.hopY = 0; T.hopV = 0; T.hop = 2;
      build();
      T.state = p && p.menu ? 'main' : 'press';
      ui.music('title');
      LA.preload(['golden', 'goldenRun1', 'goldenRun2', 'goldenJump']);
      ui.warmCity(camX, 4);
    },
    update(dt) {
      T.t += dt; T.st += dt;
      camX += 64 * dt;
      if (LA.city.ready && camX > LA.city.worldW - LA.view.VW - 50) camX = 380;
      if (LA.loop.ticks % 30 === 0) ui.warmCity(camX, 3);
      // Golden Boy hops the odd pothole
      T.hop -= dt; if (T.hop <= 0 && T.hopY === 0) { T.hopV = -9.5; T.hop = 2.2 + ((T.t * 7) % 2.5); }
      if (T.hopV !== 0 || T.hopY < 0) { T.hopY += T.hopV; T.hopV += 0.62; if (T.hopY >= 0) { T.hopY = 0; T.hopV = 0; } }
      const inp = ui.read();
      if (inp.any) T.idle = 0; else T.idle += dt;
      if (T.state === 'press') {
        if (T.t > 0.25 && inp.any) { if (inp.p2start) LA.flow.players = 2; ui.sfx('select'); setState('main'); }
        if (T.idle > ATTRACT_AFTER) LA.scenes.go('cutscene', { id: 'cold', attract: true, then: () => LA.scenes.go('title') });
        return;
      }
      const m = T.menus[T.state]; if (!m) return;
      if (inp.back) { ui.sfx('menu'); if (T.state === 'main') setState('press'); else if (T.state === 'players') setState('main'); else if (T.state === 'tier') setState('players'); return; }
      m.update(inp, dt);
      if (T.state !== 'press' && T.idle > 60) setState('press');              // walk-away on the cabinet
    },
    draw(ctx) {
      const VW = LA.view.VW, VH = LA.view.VH, GY = LA.K.GY;
      ui.cityBG(ctx, camX, { t: T.t });
      // hero jogging the street
      const run = T.hopY < 0 ? 'goldenJump' : (Math.floor(T.t * 9) % 2 ? 'goldenRun1' : 'goldenRun2');
      ui.hero(ctx, run, Math.round(VW * (VW < 600 ? 0.16 : 0.2)), GY + 3 + T.hopY, (run === 'goldenJump' ? 50 : 46) * LA.K.HERO_SCALE, 1);
      // legibility scrims
      let g = ctx.createLinearGradient(0, 0, 0, VH);
      g.addColorStop(0, 'rgba(8,10,16,.72)'); g.addColorStop(0.42, 'rgba(8,10,16,.28)'); g.addColorStop(0.75, 'rgba(8,10,16,.18)'); g.addColorStop(1, 'rgba(8,10,16,.55)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
      const press = T.state === 'press';
      const logoSize = Math.min(press ? 96 : 78, (VW - 36) / 4.9);
      const ly = press ? 150 : (VW < 600 ? 84 : 92);
      const bottom = ui.logo(ctx, VW / 2, ly, logoSize);
      if (press) {
        ui.text(ctx, 'ONE CITY. ZERO ACCOUNTABILITY.', VW / 2, bottom + 4, { size: 14, weight: '800', mono: true, col: '#fff8e7', stroke: 'rgba(0,0,0,.8)', maxW: VW - 30 });
        if (ui.blink(T.t, 1.6)) {
          ui.text(ctx, LA.input.touch && LA.input.touch.active ? 'TAP TO START' : 'PRESS START', VW / 2, 360, { size: 30, weight: '900', col: ui.C.green, stroke: '#04240f', sw: 5, shadow: 'rgba(0,0,0,.5)', sd: 3 });
        }
        ui.text(ctx, '1P START · 2P START · IT\'S FREE, NO COINS', VW / 2, 398, { size: 11, weight: 'bold', mono: true, col: ui.C.dim, stroke: 'rgba(0,0,0,.8)', maxW: VW - 30 });
      } else {
        const m = T.menus[T.state];
        const head = T.state === 'players' ? (T.mode === 'fullrun' ? 'FULL CITY RUN · HOW MANY?' : 'HOW MANY PLAYERS?') : T.state === 'tier' ? 'PICK YOUR DIFFICULTY' : null;
        let y = bottom + 6;
        if (head) { ui.text(ctx, head, VW / 2, y + 4, { size: 13, weight: '800', mono: true, col: '#ffcc3a', stroke: 'rgba(0,0,0,.85)', maxW: VW - 30 }); y += 20; }
        const rows = m.vis().length, rh = m.o.rh, gap = m.o.gap;
        const avail = VH - 34 - y, need = rows * (rh + gap);
        const scale = need > avail ? avail / need : 1;
        if (scale < 1) { ctx.save(); ctx.translate(VW / 2, y); ctx.scale(scale, scale); m.draw(ctx, 0, 0, { w: 320 }); ctx.restore(); m.rects = m.rects.map((r) => ({ x: VW / 2 + r.x * scale, y: y + r.y * scale, w: r.w * scale, h: r.h * scale })); }
        else m.draw(ctx, VW / 2, y, { w: 320 });
      }
      // footer
      ui.text(ctx, '© 2026 OUTPOST BOYZ · A FREE GAME', VW / 2, VH - 14, { size: 10, weight: 'bold', mono: true, col: 'rgba(255,248,231,.7)', stroke: 'rgba(0,0,0,.8)' });
      const tr = save.data.resume && save.data.resume.tier;
      if (!press && tr) ui.text(ctx, LA.TIERS[tr].label + ' SAVE', VW - 10, 14, { size: 10, weight: 'bold', mono: true, align: 'right', col: ui.C.dim, stroke: 'rgba(0,0,0,.8)' });
      ui.fadeIn(ctx, T.t, 0.4);
    },
  });
})();
