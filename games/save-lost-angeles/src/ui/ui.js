// UI KIT — LA.ui. Shared drawing + input helpers for every menu/screen: Saint's dark rounded chips,
// bold stroked text pops, his LOST/ANGELES logo, a keyboard/I-PAC/pad/touch menu widget, the city
// backdrop for menus, safe audio calls, and tap routing for phones. Everything draws in logical
// coordinates (VH=600, width LA.view.VW) — never assume 420.
(function () {
  'use strict';
  const LA = window.LA;
  const ui = LA.ui = {};

  ui.FONT = () => LA.FONT || 'system-ui, -apple-system, "Segoe UI", sans-serif';
  ui.MONO = 'ui-monospace, "Cascadia Code", Consolas, "DejaVu Sans Mono", monospace';
  ui.f = (px, w, mono) => (w || 'bold') + ' ' + px + 'px ' + (mono ? ui.MONO : ui.FONT());
  // Saint's page palette (lost-angeles-ed.html :root) + the CRYS palette
  ui.C = { ink: '#fff8e7', dim: '#c9b79a', green: '#41ff6b', amber: '#ffb454', yellow: '#ffcc3a', mag: '#ff4d9d', cyan: '#4dd8ff',
    bad: '#ff5d5d', bg: '#0d1018', orange: '#FF5A1F', gold: '#ffc23a', crysG: '#57e08a', pink: '#ff6fae', blue: '#4dc8ff', purple: '#b07cff' };

  // ---------------- audio (never throws; audio agent may not be loaded) ----------------
  ui.sfx = (n, o) => { try { LA.audio && LA.audio.sfx && LA.audio.sfx(n, o); } catch (e) { /* no-op */ } };
  ui.music = (id, o) => { try { LA.audio && LA.audio.music && LA.audio.music(id, o); } catch (e) { /* no-op */ } };

  // ---------------- shapes ----------------
  ui.rr = function (ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    r = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  };
  // Saint's .pill: dark translucent, 1px light border, radius 9
  ui.chip = function (ctx, x, y, w, h, o) {
    o = o || {};
    ui.rr(ctx, x, y, w, h, o.r == null ? 9 : o.r);
    ctx.fillStyle = o.fill || 'rgba(10,12,20,.66)'; ctx.fill();
    ctx.lineWidth = o.lw || 1; ctx.strokeStyle = o.border || 'rgba(255,255,255,.16)'; ctx.stroke();
  };
  // a comic/arcade panel: dark fill + bright border
  ui.panel = function (ctx, x, y, w, h, o) {
    o = o || {};
    ui.rr(ctx, x, y, w, h, o.r == null ? 14 : o.r);
    ctx.fillStyle = o.fill || 'rgba(13,16,24,.9)'; ctx.fill();
    ctx.lineWidth = o.lw || 2; ctx.strokeStyle = o.border || 'rgba(255,255,255,.14)'; ctx.stroke();
  };

  // ---------------- text ----------------
  // bold text pop: dark stroke + bright fill (+ optional hard drop shadow like his h1 text-shadow)
  ui.text = function (ctx, s, x, y, o) {
    o = o || {};
    ctx.font = o.font || ui.f(o.size || 16, o.weight, o.mono);
    ctx.textAlign = o.align || 'center'; ctx.textBaseline = o.base || 'middle';
    let sx = 1;
    if (o.maxW) { const w = ctx.measureText(s).width; if (w > o.maxW) sx = o.maxW / w; }
    if (sx !== 1) { ctx.save(); ctx.translate(x, y); ctx.scale(sx, 1); x = 0; y = 0; }
    if (o.shadow) { ctx.fillStyle = o.shadow; const d = o.sd || 3; ctx.fillText(s, x + d, y + d); }
    if (o.stroke !== false) { ctx.lineJoin = 'round'; ctx.lineWidth = o.sw || 3; ctx.strokeStyle = o.stroke || 'rgba(0,0,0,.72)'; ctx.strokeText(s, x, y); }
    ctx.fillStyle = o.col || '#fff'; ctx.fillText(s, x, y);
    if (sx !== 1) ctx.restore();
  };
  ui.measure = (ctx, s, font) => { ctx.font = font; return ctx.measureText(s).width; };
  ui.wrap = function (ctx, s, maxW, font) {
    ctx.font = font; const out = []; let line = '';
    for (const word of String(s).split(' ')) {
      const t = line ? line + ' ' + word : word;
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = word; } else line = t;
    }
    if (line) out.push(line);
    return out;
  };
  ui.time = (sec) => { sec = Math.max(0, sec || 0); const m = Math.floor(sec / 60), s = Math.floor(sec % 60), cs = Math.floor((sec * 100) % 100); return m + ':' + String(s).padStart(2, '0') + '.' + String(cs).padStart(2, '0'); };
  ui.timeShort = (sec) => { sec = Math.max(0, sec || 0); const m = Math.floor(sec / 60), s = Math.floor(sec % 60); return m + ':' + String(s).padStart(2, '0'); };
  ui.num = (n) => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  ui.blink = (t, rate) => Math.floor(t * (rate || 2)) % 2 === 0;
  ui.ease = (t) => 1 - Math.pow(1 - LA.clamp(t, 0, 1), 3);
  ui.back = (t) => { t = LA.clamp(t, 0, 1); const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

  // Saint's logo: brand line, then LOST (yellow, brown shadow) / ANGELES (pink, plum shadow)
  ui.logo = function (ctx, cx, y, size, o) {
    o = o || {};
    const VW = LA.view.VW;
    size = Math.min(size, (VW - 36) / 4.9);                         // ANGELES must fit the narrowest screen
    const f = '900 ' + Math.round(size) + 'px ' + ui.FONT();
    if (o.brand !== false) {
      ctx.font = ui.f(Math.max(10, Math.round(size * 0.2)), 'bold', true);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = ui.C.dim;
      const brand = 'O U T P O S T   B O Y Z';
      ctx.fillText(brand, cx, y - size * 0.74);
    }
    const drop = Math.max(3, size * 0.07);
    ui.text(ctx, 'LOST', cx, y, { font: f, col: ui.C.yellow, shadow: '#7a3b00', sd: drop, sw: Math.max(3, size * 0.06), stroke: '#2a1300' });
    ui.text(ctx, 'ANGELES', cx, y + size * 0.86, { font: f, col: ui.C.mag, shadow: '#6a1440', sd: drop, sw: Math.max(3, size * 0.06), stroke: '#2a0616' });
    return y + size * 0.86 + size * 0.55;                             // bottom of the logo block
  };

  // soft full-screen scrim and a black fade-in for scene entries
  ui.scrim = (ctx, a, col) => { ctx.fillStyle = col || 'rgba(8,10,16,' + a + ')'; ctx.fillRect(0, 0, LA.view.VW, LA.view.VH); };
  ui.fadeIn = function (ctx, t, dur) { const a = 1 - t / (dur || 0.3); if (a > 0) { ctx.globalAlpha = Math.min(1, a); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, LA.view.VW, LA.view.VH); ctx.globalAlpha = 1; } };

  // a small hand-drawn star (fonts on the cabinet may lack glyphs)
  ui.star = function (ctx, x, y, r, fill, stroke) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = stroke || 'rgba(0,0,0,.7)'; ctx.stroke();
  };
  ui.heart = function (ctx, x, y, s, col) {
    ctx.beginPath(); ctx.moveTo(x, y + s * 0.35);
    ctx.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3);
    ctx.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.75, x, y + s * 0.95);
    ctx.bezierCurveTo(x, y + s * 0.75, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3);
    ctx.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.35);
    ctx.fillStyle = col || '#ff5d5d'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.stroke();
  };
  ui.gem = function (ctx, x, y, s, col, hi) {
    ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.7, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.7, y); ctx.closePath();
    ctx.fillStyle = col || ui.C.crysG; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y - s * 0.7); ctx.lineTo(x + s * 0.3, y - s * 0.1); ctx.lineTo(x, y); ctx.closePath(); ctx.fillStyle = hi || '#a8ffd0'; ctx.fill();
  };
  ui.lock = function (ctx, x, y, s, col) {
    ctx.lineWidth = Math.max(2, s * 0.18); ctx.strokeStyle = col || '#9aa0b4';
    ctx.beginPath(); ctx.arc(x, y - s * 0.15, s * 0.32, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = col || '#9aa0b4'; ctx.fillRect(x - s * 0.45, y - s * 0.15, s * 0.9, s * 0.62);
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x - s * 0.06, y + s * 0.02, s * 0.12, s * 0.24);
  };
  // Golden Boy sprite (art faces LEFT; face=1 draws him facing right)
  ui.hero = function (ctx, key, cx, footY, h, face, alpha) {
    const im = LA.img(key) || LA.img('golden'); if (!im) return false;
    const w = h * im.naturalWidth / im.naturalHeight;
    ctx.save(); if (alpha != null) ctx.globalAlpha = alpha;
    ctx.translate(cx, footY); ctx.scale(face >= 0 ? -1 : 1, 1); ctx.drawImage(im, -w / 2, -h, w, h); ctx.restore();
    return true;
  };

  // ---------------- menu input (keyboard / I-PAC / gamepad / tap) ----------------
  // Read once per tick. OK = JUMP (not stick-up) / FIRE / START. BACK = COIN / Esc / Backspace / pad B.
  let cache = null, cacheTick = -1;
  const prev = { esc: 0, bs: 0, padB: 0 };
  const hold = { up: 0, down: 0, left: 0, right: 0 };
  ui._tap = null;
  const NONE = { ok: false, start: false, back: false, up: false, down: false, left: false, right: false, tap: null, p2start: false, p1start: false, any: false };
  let swallowTick = -1;
  LA.on('scene', () => { swallowTick = LA.loop.ticks; });            // a press that changed scene must not also hit the new one
  ui.read = function () {
    const tick = LA.loop.ticks;
    if (tick === swallowTick && cache && cacheTick === tick) return NONE;
    if (cache && tick === cacheTick) return cache;
    const I = LA.input, a = I.p[0], b = I.p[1], k = I.keys;
    const esc = k.Escape ? 1 : 0, bs = k.Backspace ? 1 : 0;
    let padB = 0;
    try { const pads = navigator.getGamepads ? navigator.getGamepads() : []; for (const g of pads) if (g && g.buttons[1] && g.buttons[1].pressed) padB = 1; } catch (e) { /* no pads */ }
    const escP = esc && !prev.esc, bsP = bs && !prev.bs, padBP = padB && !prev.padB;
    prev.esc = esc; prev.bs = bs; prev.padB = padB;
    const jumpOk = (a.jumpP && !a.jumpUp) || (b.jumpP && !b.jumpUp);
    const startP = (a.startP || b.startP) && !escP;
    const dir = { up: a.up || b.up, down: a.down || b.down, left: a.left || b.left, right: a.right || b.right };
    const edge = { up: a.upP || b.upP, down: a.downP || b.downP, left: a.leftP || b.leftP, right: a.rightP || b.rightP };
    const dt = LA.K.TICK;
    for (const d in hold) {                                              // hold-to-repeat for long lists
      if (dir[d]) { hold[d] += dt; if (hold[d] > 0.38) { edge[d] = 1; hold[d] = 0.38 - 0.09; } } else hold[d] = 0;
    }
    let tap = ui._tap; ui._tap = null;
    if (tap && tick - tap.tick > 4) tap = null;                          // stale tap from gameplay: ignore
    cache = { ok: !!(jumpOk || a.fireP || b.fireP || startP), start: !!startP, back: !!(a.coinP || b.coinP || escP || bsP || padBP),
      up: !!edge.up, down: !!edge.down, left: !!edge.left, right: !!edge.right, tap, p2start: !!b.startP, p1start: !!a.startP };
    cache.any = cache.ok || cache.back || cache.up || cache.down || cache.left || cache.right || !!tap;
    cacheTick = tick;
    return cache;
  };
  ui.tapAt = function (x, y) { ui._tap = { x, y, tick: LA.loop.ticks }; };
  ui.hit = (r, t) => t && r && t.x >= r.x && t.x <= r.x + r.w && t.y >= r.y && t.y <= r.y + r.h;

  // ---------------- menu widget ----------------
  // items: [{ label, sub?, locked?: bool|string, hidden?, value?(): string, adjust?(dir), act() }]
  class Menu {
    constructor(items, o) { this.items = items; this.o = o || {}; this.i = 0; this.rects = []; this.shake = 0; this.msg = null; this.msgT = 0; this.pulse = 0; this.fix(); }
    vis() { return this.items.filter((it) => !it.hidden); }
    fix() { const v = this.vis(); if (!v.length) return; if (this.i >= v.length) this.i = v.length - 1; if (this.i < 0) this.i = 0; }
    cur() { return this.vis()[this.i]; }
    select(i) { if (i !== this.i) { this.i = i; ui.sfx('menu'); } }
    update(inp, dt) {
      this.shake = Math.max(0, this.shake - dt * 3); this.msgT = Math.max(0, this.msgT - dt); this.pulse += dt;
      const v = this.vis(); if (!v.length) return null;
      if (inp.up) this.select((this.i - 1 + v.length) % v.length);
      if (inp.down) this.select((this.i + 1) % v.length);
      const it = v[this.i];
      if ((inp.left || inp.right) && it.adjust) { it.adjust(inp.left ? -1 : 1); ui.sfx('menu'); }
      let fire = inp.ok;
      if (inp.tap) {
        const hit = this.rects.findIndex((r) => ui.hit(r, inp.tap));
        if (hit >= 0) {
          const r = this.rects[hit];
          // tapping the left/right third of an adjustable row nudges it
          if (v[hit].adjust && (inp.tap.x < r.x + r.w * 0.3 || inp.tap.x > r.x + r.w * 0.7)) { this.i = hit; v[hit].adjust(inp.tap.x < r.x + r.w / 2 ? -1 : 1); ui.sfx('menu'); fire = false; }
          else { this.i = hit; fire = true; }
        }
      }
      if (fire) return this.activate();
      return null;
    }
    activate() {
      const it = this.cur(); if (!it) return null;
      if (it.locked) { this.shake = 1; this.msg = typeof it.locked === 'string' ? it.locked : 'LOCKED'; this.msgT = 1.6; ui.sfx('denied'); return null; }
      ui.sfx('select');
      if (it.act) it.act(this);
      return it;
    }
    // draw centered rows; returns the bottom y
    draw(ctx, cx, y, o) {
      o = Object.assign({ w: 300, rh: 40, gap: 8, size: 18, col: ui.C.green }, this.o, o || {});
      const v = this.vis(); this.rects = [];
      const w = Math.min(o.w, LA.view.VW - 32);
      for (let i = 0; i < v.length; i++) {
        const it = v[i], sel = i === this.i, ry = y + i * (o.rh + o.gap);
        const dx = sel && this.shake ? Math.sin(this.shake * 40) * 6 * this.shake : 0;
        const x = cx - w / 2 + dx;
        this.rects.push({ x: cx - w / 2, y: ry, w, h: o.rh });
        if (sel) {
          ui.rr(ctx, x, ry, w, o.rh, 12);
          ctx.fillStyle = it.locked ? '#3a3f52' : (it.col || o.col); ctx.fill();
          ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.stroke();
          const a = 0.5 + Math.sin(this.pulse * 6) * 0.5;               // blinking arrow
          ctx.fillStyle = 'rgba(255,255,255,' + (0.55 + a * 0.45) + ')';
          ctx.beginPath(); ctx.moveTo(x + 12, ry + o.rh / 2 - 7); ctx.lineTo(x + 22, ry + o.rh / 2); ctx.lineTo(x + 12, ry + o.rh / 2 + 7); ctx.fill();
        } else ui.chip(ctx, x, ry, w, o.rh, { r: 12, fill: 'rgba(13,16,24,.78)' });
        const tc = sel ? (it.locked ? '#c8ccd8' : '#07140b') : (it.locked ? '#7d8398' : ui.C.ink);
        const label = it.label + (it.value ? '' : '');
        const hasSub = it.sub && o.rh >= 44;
        ctx.save();
        if (it.value) {
          ui.text(ctx, label, x + 32, ry + o.rh / 2, { size: o.size - 2, col: tc, stroke: false, align: 'left', maxW: w * 0.5 });
          const val = it.value();
          ui.text(ctx, (it.adjust ? '◀ ' : '') + val + (it.adjust ? ' ▶' : ''), x + w - 16, ry + o.rh / 2, { size: o.size - 2, col: tc, stroke: false, align: 'right', mono: true });
        } else {
          ui.text(ctx, label, cx + dx, ry + (hasSub ? o.rh * 0.36 : o.rh / 2), { size: o.size, col: tc, stroke: false, maxW: w - 60 });
          if (hasSub) ui.text(ctx, it.locked && typeof it.locked === 'string' ? it.locked : it.sub, cx + dx, ry + o.rh * 0.72, { size: 11, weight: '600', col: sel ? (it.locked ? '#aab' : 'rgba(7,20,11,.8)') : ui.C.dim, stroke: false, mono: true, maxW: w - 50 });
        }
        if (it.locked) ui.lock(ctx, x + w - 22, ry + o.rh / 2, 14, sel ? '#c8ccd8' : '#6d7388');
        ctx.restore();
      }
      const bottom = y + v.length * (o.rh + o.gap);
      if (this.msgT > 0 && this.msg) ui.text(ctx, this.msg, cx, bottom + 10, { size: 13, col: ui.C.bad, mono: true, maxW: LA.view.VW - 24 });
      return bottom;
    }
  }
  ui.Menu = Menu;

  // ---------------- the real city as a menu backdrop ----------------
  ui.cityBG = function (ctx, camX, o) {
    o = o || {};
    const C = LA.city; if (!C || !C.ready) { ctx.fillStyle = ui.C.bg; ctx.fillRect(0, 0, LA.view.VW, LA.view.VH); return; }
    const t = o.t || 0, VW = LA.view.VW;
    C.drawSky(ctx); C.drawOcean(ctx, camX, t); C.drawScenery(ctx, camX, 'back'); C.drawBuildings(ctx, camX);
    if (o.ground !== false) { ctx.save(); ctx.translate(-Math.round(camX), 0); C.drawGround(ctx, camX, [{ x: camX - 200, w: VW + 400 }]); ctx.restore(); }
    if (o.front !== false) C.drawScenery(ctx, camX, 'front');
  };
  // start decoding the art for the next few screens (call ~2x a second, not every frame)
  ui.warmCity = function (camX, ahead) {
    const C = LA.city; if (!C || !C.ready) return;
    for (const k of C.artKeysForRange(camX - 300, camX + LA.view.VW * (ahead || 3))) LA.img(k);
  };

  // ---------------- screen-shake setting (wraps the camera kick) ----------------
  function wrapShake() {
    if (!LA.camera || LA.camera._uiWrapped) return;
    const kick = LA.camera.kick;
    LA.camera.kick = function (m) { if (LA.save && LA.save.settings.shake === false) return; return kick.call(LA.camera, m); };
    LA.camera._uiWrapped = true;
  }
  wrapShake();

  // taps on the canvas -> menus (phones / kiosk touchscreens)
  function onPointer(e) {
    if (!LA.view || !LA.view.cv) return;
    const p = LA.view.toLogical(e.clientX, e.clientY);
    if (p.x < 0 || p.y < 0 || p.x > LA.view.VW || p.y > LA.view.VH) return;
    ui.tapAt(p.x, p.y);
  }
  LA.on('boot', () => { const cv = LA.view.cv; if (cv) cv.addEventListener('pointerdown', onPointer); });
})();
