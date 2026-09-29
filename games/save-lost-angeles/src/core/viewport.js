// Adaptive viewport: logical height is ALWAYS 600 (so every vertical position — ground line,
// building heights, sprites — matches Saint's game exactly). Logical width follows the screen:
// 420 on an upright phone (his original frame) up to 1200 on wide displays. 16:9 = ~1067.
(function () {
  'use strict';
  const LA = window.LA;
  const VH = LA.K.VH, MIN_W = 420, MAX_W = 1200;
  const view = LA.view = { VW: MIN_W, VH, scale: 1, dpr: 1, portrait: false, cv: null, ctx: null, ox: 0, oy: 0, cssW: 0, cssH: 0 };

  view.init = function (canvas) {
    view.cv = canvas;
    view.ctx = canvas.getContext('2d', { alpha: false });
    window.addEventListener('resize', view.fit);
    window.addEventListener('orientationchange', () => setTimeout(view.fit, 120));
    view.fit();
  };

  view.fit = function () {
    const cv = view.cv; if (!cv) return;
    const W = window.innerWidth, H = window.innerHeight;
    const aspect = W / H;
    view.portrait = aspect < 0.72;
    // phones held upright reserve the bottom of the screen for the touch pad
    const usableH = view.portrait ? H * 0.72 : H;
    view.VW = Math.round(LA.clamp(VH * (W / usableH), MIN_W, MAX_W));
    const scale = Math.min(W / view.VW, usableH / VH);
    view.scale = scale;
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.cssW = Math.round(view.VW * scale);
    view.cssH = Math.round(VH * scale);
    cv.style.width = view.cssW + 'px';
    cv.style.height = view.cssH + 'px';
    view.ox = Math.round((W - view.cssW) / 2);
    view.oy = view.portrait ? 0 : Math.round((H - view.cssH) / 2);
    cv.style.left = view.ox + 'px';
    cv.style.top = view.oy + 'px';
    cv.width = Math.round(view.cssW * view.dpr);
    cv.height = Math.round(view.cssH * view.dpr);
    view.resetTransform();
    LA.emit && LA.emit('resize', view);
  };

  // map logical units -> backing store; pixel-art crisp like his engine
  view.resetTransform = function () {
    const k = view.scale * view.dpr, c = view.ctx;
    c.setTransform(k, 0, 0, k, 0, 0);
    c.imageSmoothingEnabled = false;
  };

  // screen (CSS px) -> logical coords, for touch UI
  view.toLogical = (cx, cy) => ({ x: (cx - view.ox) / view.scale, y: (cy - view.oy) / view.scale });
})();
