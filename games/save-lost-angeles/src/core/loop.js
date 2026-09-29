// Fixed-step game loop. All physics constants are per-tick at 60 Hz (Saint's tuned values), so the game
// plays at the same speed on a 144 Hz monitor, a 60 Hz phone and a Pi that dips to 40 fps.
(function () {
  'use strict';
  const LA = window.LA, STEP = LA.K.TICK * 1000;
  const loop = LA.loop = { running: false, acc: 0, last: 0, ticks: 0, fps: 60, _fpsT: 0, _fpsN: 0, update: null, render: null, timeScale: 1 };
  function frame(t) {
    if (!loop.running) return;
    const dt = Math.min(250, t - (loop.last || t)); loop.last = t;
    loop.acc += dt * loop.timeScale;
    let n = 0;
    while (loop.acc >= STEP && n < 8) { loop.update(LA.K.TICK); loop.acc -= STEP; loop.ticks++; n++; }
    if (n === 8) loop.acc = 0;                                  // tab was asleep: don't fast-forward the world
    loop.render(loop.acc / STEP);
    loop._fpsN++; if (t - loop._fpsT > 1000) { loop.fps = loop._fpsN; loop._fpsN = 0; loop._fpsT = t; }
    requestAnimationFrame(frame);
  }
  loop.start = function (update, render) { loop.update = update; loop.render = render; if (loop.running) return; loop.running = true; loop.last = 0; requestAnimationFrame(frame); };
  loop.stop = () => { loop.running = false; };
  // headless stepping for tests/QA (no rendering)
  loop.step = function (n) { for (let i = 0; i < (n || 1); i++) { loop.update(LA.K.TICK); loop.ticks++; } };
  document.addEventListener('visibilitychange', () => { loop.last = 0; loop.acc = 0; });
})();
