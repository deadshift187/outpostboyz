// Test/QA bridge: window.__LA. Lets automated tests drive the real game headlessly.
(function () {
  'use strict';
  const LA = window.LA;
  window.__LA = {
    LA,
    S: () => LA.game.S,
    run: () => LA.game.run,
    // start a level directly (skips menus). tier: tourist|local|native, players: 1|2, mode: level|fullrun
    play(levelId, opts) { opts = opts || {}; LA.scenes.go('level', { newRun: { tier: opts.tier || 'local', players: opts.players || 1, mode: opts.mode || 'level' }, levelId: levelId || '1-1' }); return LA.game.S; },
    step(n) { LA.loop.step(n || 1); return LA.game.S && LA.game.S.state; },
    teleport(x, i) { const p = LA.game.S.players[i || 0]; p.x = x; p.y = LA.K.GY - p.h - 2; p.vx = p.vy = 0; LA.camera.update(LA.game.S); },
    god(on) { window.__LA_GOD = on !== false; },
    // hold a virtual input for P1 (overrides the real devices while set)
    hold(state) { window.__LA_HOLD = state || null; },
    counts() { const S = LA.game.S; const c = {}; S.ents.forEach((e) => { c[e.kind] = (c[e.kind] || 0) + 1; }); return { ents: S.ents.length, potholes: S.potholes.length, byKind: c, boss: S.boss && S.boss.name, state: S.state }; },
    levels: () => LA.LEVELS.map((l) => ({ id: l.id, name: l.name, x0: Math.round(l.x0), x1: Math.round(l.x1), len: Math.round(l.len), boss: l.boss || null, goal: !!l.goal, cps: l.checkpoints.length })),
    save: (name, obj) => fetch('/__save?name=' + encodeURIComponent(name), { method: 'POST', body: JSON.stringify(obj) }).then((r) => r.text()),
  };
  // virtual input override for tests
  const poll = LA.input.poll;
  LA.input.poll = function () {
    poll();
    const h = window.__LA_HOLD; if (!h) return;
    const s = LA.input.p[0], prev = window.__LA_PREVH || {};
    Object.assign(s, { axis: h.axis || 0, left: h.axis < 0 ? 1 : 0, right: h.axis > 0 ? 1 : 0, jump: h.jump ? 1 : 0, jumpHeld: h.jump ? 1 : 0, fire: h.fire ? 1 : 0, sprint: h.sprint ? 1 : 0, up: h.up ? 1 : 0 });
    s.jumpP = h.jump && !prev.jump ? 1 : 0; s.fireP = h.fire && !prev.fire ? 1 : 0;
    window.__LA_PREVH = Object.assign({}, h);
  };
})();
