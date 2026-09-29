// BOOT. Builds the city + levels, registers the core 'level' scene, and runs the loop.
// UI agent registers 'title' / 'map' / 'results' / etc. and may override LA.flow for transitions.
(function () {
  'use strict';
  const LA = window.LA;

  // default flow (UI agent replaces these with real screens)
  LA.flow = Object.assign({
    boot() { LA.scenes.defs.title ? LA.scenes.go('title') : LA.scenes.go('level', { newRun: { tier: 'local' }, levelId: '1-1' }); },
    levelClear(S) { const nx = S.mode === 'level' && LA.levels.next(S.level); if (nx) LA.scenes.go('level', { levelId: nx.id }); else LA.flow.boot(); },
    gameOver(S) { LA.scenes.go('level', { newRun: { tier: S.tier.id }, levelId: S.level.id }); },
    pause() {},
  }, LA.flow || {});

  LA.scenes.register('level', {
    enter(p) { if (p.newRun) LA.game.newRun(p.newRun); LA.game.startLevel(p.levelId || '1-1', p); this.t = 0; },
    update(dt) {
      const S = LA.game.S, inp = LA.input;
      if (S && S.state === 'play' && (inp.p[0].startP || inp.p[1].startP) && LA.scenes.defs.pause) { LA.scenes.push('pause'); return; }
      LA.game.update(dt);
      if (!S) return;
      if (S.state === 'clear' && S.stateT > 3.0 && !S._flowed) { S._flowed = true; LA.flow.levelClear(S); }
      if (S.state === 'gameover' && S.stateT > 0.3 && !S._flowed) { S._flowed = true; LA.flow.gameOver(S); }
    },
    draw(ctx) { LA.game.draw(ctx); },
  });

  function start() {
    LA.view.init(document.getElementById('cv'));
    LA.city.build();
    LA.levels.resolve();
    LA.emit('boot');
    // unlock audio on the first real input (browser autoplay rules)
    const unlock = () => { LA.audio && LA.audio.unlock && LA.audio.unlock(); };
    // iOS WebKit only grants audio on touchend/click, not touchstart — listen to all of them
    ['keydown', 'pointerdown', 'pointerup', 'mousedown', 'click', 'touchstart', 'touchend', 'gamepadconnected'].forEach((ev) => addEventListener(ev, unlock, { once: false, passive: true }));
    LA.loop.start(
      (dt) => { LA.input.poll(); LA.scenes.update(dt); },
      () => { LA.view.resetTransform(); const c = LA.view.ctx; c.fillStyle = '#000'; c.fillRect(0, 0, LA.view.VW, LA.view.VH); LA.scenes.draw(c); }
    );
    LA.flow.boot();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
