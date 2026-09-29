// Camera. Solo: hard-follows Golden Boy with him ~36% from the left (his cam=p.x-150 on a 420 view).
// Co-op (Cuphead-style shared screen): tracks the midpoint of the living players; nobody can leave the
// screen — the edges push/pull. Boss arenas lock the camera inside the arena.
(function () {
  'use strict';
  const LA = window.LA;
  const cam = LA.camera = { x: 0, shake: 0, shakeX: 0, shakeY: 0, lockX: null };

  cam.reset = function (S, x) { cam.x = x; cam.shake = 0; cam.lockX = null; };
  cam.kick = function (mag) { cam.shake = Math.max(cam.shake, mag); };

  cam.update = function (S) {
    const VW = LA.view.VW, live = S.players.filter((p) => p.active && !p.ghost);
    const pool = live.length ? live : S.players.filter((p) => p.active);
    if (!pool.length) return;
    let target;
    if (pool.length === 1) target = pool[0].x + pool[0].w / 2 - VW * 0.36;
    else { const mid = pool.reduce((a, p) => a + p.x + p.w / 2, 0) / pool.length; target = mid - VW * 0.5; }
    let lo = S.x0, hi = S.x1 - VW;
    if (S.arena && S.arena.sealed) {                                  // arena lock: keep the fight framed
      const aMid = S.arena.x + S.arena.w / 2;
      if (VW >= S.arena.w) { lo = hi = aMid - VW / 2; }
      else { lo = S.arena.x; hi = S.arena.x + S.arena.w - VW; }
    }
    if (hi < lo) hi = lo;
    cam.x = LA.clamp(target, lo, hi);
    // screen shake
    if (cam.shake > 0.1) { cam.shakeX = (Math.random() * 2 - 1) * cam.shake; cam.shakeY = (Math.random() * 2 - 1) * cam.shake * 0.6; cam.shake *= 0.86; }
    else { cam.shake = 0; cam.shakeX = cam.shakeY = 0; }
    // co-op: keep everyone on screen
    if (S.players.length > 1) for (const p of S.players) {
      if (!p.active || p.ghost) continue;
      if (p.x < cam.x + 6) { p.x = cam.x + 6; if (p.vx < 0) p.vx = 0; }
      if (p.x + p.w > cam.x + VW - 6) { p.x = cam.x + VW - 6 - p.w; if (p.vx > 0) p.vx = 0; }
    }
  };
  cam.visible = (x, w, pad) => x + (w || 0) > cam.x - (pad || 0) && x < cam.x + LA.view.VW + (pad || 0);
})();
