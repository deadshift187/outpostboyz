// TOUCH — phones and touchscreen kiosks. A virtual stick + JUMP + FIRE (+ a pause button) as DOM
// elements in #ui, writing LA.input.touch = {active, axis, jump, fire, up}. Portrait: they live in the
// band reserved below the canvas (LA.view.portrait / cssH). Landscape: a translucent overlay, shown only
// while a level is being played. The pad appears on the first touch and hides again as soon as a
// keyboard or gamepad is used. Menus are tapped directly on the canvas (LA.ui.tapAt).
(function () {
  'use strict';
  const LA = window.LA;
  const T = LA.input.touch;                        // mutate in place — input.poll reads this object
  Object.assign(T, { active: false, axis: 0, jump: 0, fire: 0, up: 0 });
  let root = null, stick = null, knob = null, bJ = null, bF = null, bP = null, shown = false, stickId = null, stickC = { x: 0, y: 0 }, R = 56;

  const CSS = `
  #tpad{position:absolute;inset:0;pointer-events:none;display:none;font-family:ui-monospace,Consolas,monospace}
  #tpad .tz{position:absolute;pointer-events:auto;touch-action:none;-webkit-user-select:none;user-select:none}
  #tpad .stick{border-radius:50%;background:radial-gradient(circle at 50% 40%,#2a2f3d,#171b25);border:2px solid #ffffff1f}
  #tpad .knob{position:absolute;left:50%;top:50%;width:44%;height:44%;margin:-22% 0 0 -22%;border-radius:50%;
    background:linear-gradient(180deg,#f2c14e,#c9922c);border:2px solid #00000055;box-shadow:0 4px 12px rgba(0,0,0,.45);pointer-events:none}
  #tpad .btn{display:flex;align-items:center;justify-content:center;font-weight:800;border:2px solid #00000055;border-radius:16px;color:#042410;font-size:17px}
  #tpad .jump{background:#41ff6b}
  #tpad .fire{background:#ff7a5c;color:#330d03}
  #tpad .btn.on{transform:translateY(2px);filter:brightness(.85)}
  #tpad .pause{border-radius:12px;background:rgba(13,16,24,.8);border:1px solid #ffffff33;color:#fff8e7;font-size:14px}
  #tpad.land .stick,#tpad.land .btn{opacity:.5}`;

  function el(cls, txt) { const d = document.createElement('div'); d.className = 'tz ' + cls; if (txt) d.textContent = txt; root.appendChild(d); return d; }

  function build() {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    root = document.createElement('div'); root.id = 'tpad';
    (document.getElementById('ui') || document.body).appendChild(root);
    stick = el('stick'); knob = document.createElement('div'); knob.className = 'knob'; stick.appendChild(knob);
    bF = el('btn fire', 'FIRE'); bJ = el('btn jump', 'JUMP'); bP = el('btn pause', '❚❚');
    // stick: captures its pointer, horizontal axis + strong push up = jump
    stick.addEventListener('pointerdown', (e) => { stickId = e.pointerId; stick.setPointerCapture(e.pointerId); const r = stick.getBoundingClientRect(); stickC = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; R = r.width / 2; moveStick(e); used(); e.preventDefault(); });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) moveStick(e); });
    const endStick = (e) => { if (e.pointerId !== stickId) return; stickId = null; T.axis = 0; T.up = 0; knob.style.transform = ''; };
    stick.addEventListener('pointerup', endStick); stick.addEventListener('pointercancel', endStick);
    const hold = (b, k) => {
      const on = (e) => { b.setPointerCapture && b.setPointerCapture(e.pointerId); T[k] = 1; b.classList.add('on'); used(); e.preventDefault(); };
      const off = () => { T[k] = 0; b.classList.remove('on'); };
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
    };
    hold(bJ, 'jump'); hold(bF, 'fire');
    bP.addEventListener('pointerdown', (e) => { used(); e.preventDefault(); if (LA.scenes.curName === 'level' && !LA.scenes.stack.length && LA.game.S && LA.game.S.state === 'play') LA.scenes.push('pause'); else if (LA.scenes.stack.length && LA.scenes.top() === LA.scenes.defs.pause) LA.scenes.pop(); });
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  function moveStick(e) {
    let dx = e.clientX - stickC.x, dy = e.clientY - stickC.y; const m = Math.hypot(dx, dy), lim = R * 0.62;
    if (m > lim) { dx *= lim / m; dy *= lim / m; }
    knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    const ax = dx / lim; T.axis = Math.abs(ax) < 0.22 ? 0 : (Math.abs(ax) > 0.7 ? Math.sign(ax) : ax);
    T.up = dy / lim < -0.72 ? 1 : 0;
  }
  function used() { LA.input.lastDevice = 'touch'; if (!shown) show(true); }

  function layout() {
    if (!root) return;
    const v = LA.view, W = innerWidth, H = innerHeight;
    const portrait = v.portrait, inLevel = LA.scenes.curName === 'level' && !LA.scenes.stack.length;
    root.classList.toggle('land', !portrait);
    // landscape: the pad only makes sense while playing; menus are tapped directly
    const vis = shown && (portrait || inLevel);
    root.style.display = vis ? 'block' : 'none';
    T.active = shown;
    if (!vis) { T.axis = 0; T.jump = 0; T.fire = 0; T.up = 0; return; }
    const S = (e, x, y, w, h) => { e.style.left = Math.round(x) + 'px'; e.style.top = Math.round(y) + 'px'; e.style.width = Math.round(w) + 'px'; e.style.height = Math.round(h) + 'px'; };
    if (portrait) {
      const top = v.oy + v.cssH, bandH = Math.max(120, H - top), pad = 14;
      const sz = Math.min(bandH - pad * 2, W * 0.4, 170);
      S(stick, pad, top + (bandH - sz) / 2, sz, sz);
      const bw = Math.min(W * 0.4, 190), bh = Math.min((sz - 10) / 2, 80), bx = W - pad - bw, by = top + (bandH - (bh * 2 + 10)) / 2;
      S(bF, bx, by, bw, bh); S(bJ, bx, by + bh + 10, bw, bh);
      const gapL = pad + sz, pw = Math.max(34, Math.min(44, bx - gapL - 8));      // pause sits in the gap between stick and buttons
      S(bP, gapL + (bx - gapL) / 2 - pw / 2, top + bandH / 2 - 16, pw, 32);
      bP.style.display = inLevel ? 'flex' : 'none';
    } else {
      const sz = Math.min(H * 0.34, 170), pad = Math.max(14, H * 0.03);
      S(stick, pad, H - sz - pad, sz, sz);
      const b = Math.min(H * 0.17, 84);
      S(bJ, W - pad - b * 1.25, H - pad - b, b * 1.25, b);
      S(bF, W - pad - b * 2.5 - 12, H - pad - b * 0.85, b * 1.2, b * 0.85);
      S(bP, W / 2 - 22, H - 44, 44, 34);
      bP.style.display = 'flex';
    }
  }
  function show(on) {
    shown = on;
    if (!on) { T.axis = 0; T.jump = 0; T.fire = 0; T.up = 0; stickId = null; if (knob) knob.style.transform = ''; [bJ, bF].forEach((b) => b && b.classList.remove('on')); }
    layout();
  }

  LA.on('boot', () => {
    build();
    // first touch anywhere turns the pad on; keyboard / pad input turns it off
    addEventListener('touchstart', () => { if (!shown) { LA.input.lastDevice = 'touch'; show(true); } }, { passive: true });
    addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' && !shown) { LA.input.lastDevice = 'touch'; show(true); } }, { passive: true });
    addEventListener('keydown', () => { if (shown) show(false); });
    setInterval(() => { if (shown && LA.input.lastDevice === 'pad') show(false); else layout(); }, 250);
  });
  LA.on('resize', layout);
  LA.on('scene', () => setTimeout(layout, 0));
  LA.touchUI = { show, layout, get shown() { return shown; } };
})();
