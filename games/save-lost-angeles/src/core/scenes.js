// Scene manager. A scene = { enter(params), exit(), update(dt), draw(ctx) }. Only one is active; overlays
// (pause, dialogs) can be pushed on top and receive update/draw first. UI agent registers the menus.
(function () {
  'use strict';
  const LA = window.LA;
  const scenes = LA.scenes = { defs: {}, cur: null, curName: null, stack: [], fade: 0, fadeTo: null };
  scenes.register = (name, def) => { scenes.defs[name] = def; return def; };
  scenes.go = function (name, params) {
    const d = scenes.defs[name]; if (!d) { console.error('[scenes] unknown', name); return; }
    if (scenes.cur && scenes.cur.exit) scenes.cur.exit();
    scenes.stack = []; scenes.cur = d; scenes.curName = name;
    if (d.enter) d.enter(params || {});
    LA.emit('scene', name);
  };
  scenes.push = (name, params) => { const d = scenes.defs[name]; if (!d) return; scenes.stack.push(d); if (d.enter) d.enter(params || {}); };
  scenes.pop = () => { const d = scenes.stack.pop(); if (d && d.exit) d.exit(); };
  scenes.top = () => scenes.stack[scenes.stack.length - 1] || scenes.cur;
  scenes.update = function (dt) {
    const top = scenes.stack[scenes.stack.length - 1], cur0 = scenes.cur;
    if (top) { top.update && top.update(dt); if (scenes.cur !== cur0) return; if (top.passThrough && scenes.cur.update) scenes.cur.update(dt); }
    else if (scenes.cur && scenes.cur.update) scenes.cur.update(dt);
  };
  scenes.draw = function (ctx) {
    if (scenes.cur && scenes.cur.draw) scenes.cur.draw(ctx);
    for (const s of scenes.stack) if (s.draw) s.draw(ctx);
  };
})();
