// LOST ANGELES — OPUS BUILD
// Core namespace, shared constants, utilities, seeded RNG and a tiny event bus.
// Every module attaches to window.LA. Load order is set in index.html.
(function () {
  'use strict';
  const LA = window.LA = window.LA || {};

  // ---- world constants (identical to Saint's engine so the city matches exactly) ----
  LA.K = {
    VH: 600, GY: 470,                     // logical view height + ground top
    BG_PAR: 0.45,                         // building parallax
    TICK: 1 / 60,                         // fixed simulation step (physics constants are per-tick)
    // Golden Boy feel — his tuned values
    GRAV: 0.86, JUMPV: -17.0, CUTV: -4.0, ACC: 1.05, MAXV: 4.7, FRIC: 0.80,
    HERO_W: 22, HERO_H: 30, HERO_SCALE: 1.294,
    PIT_X: 10, PIT_W: 44,                 // playable opening inside the pothole art
  };

  // ---- math / helpers ----
  LA.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  LA.lerp = (a, b, t) => a + (b - a) * t;
  LA.aabb = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  LA.sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
  LA.now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // mulberry32 — the same seeded RNG family Saint's engine uses; levels are deterministic per seed
  LA.rng = function (seed) {
    let a = seed >>> 0;
    const r = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.range = (lo, hi) => lo + r() * (hi - lo);
    r.int = (lo, hi) => Math.floor(lo + r() * (hi - lo + 1));
    r.pick = (arr) => arr[Math.floor(r() * arr.length)];
    r.chance = (p) => r() < p;
    return r;
  };
  LA.hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

  // ---- event bus: LA.on('bossDefeated', fn) / LA.emit('bossDefeated', data) ----
  const subs = {};
  LA.on = (ev, fn) => { (subs[ev] = subs[ev] || []).push(fn); return () => { subs[ev] = subs[ev].filter((f) => f !== fn); }; };
  LA.emit = (ev, data) => { (subs[ev] || []).slice().forEach((fn) => { try { fn(data); } catch (e) { console.error('[LA.emit ' + ev + ']', e); } }); };

  // ---- module registry: systems register update/draw hooks with an order key ----
  // LA.systems.add({ name, order, update(dt, S), draw(ctx, S, layer) })
  const list = [];
  LA.systems = {
    add(sys) { list.push(sys); list.sort((a, b) => (a.order || 0) - (b.order || 0)); return sys; },
    all() { return list; },
    get(name) { return list.find((s) => s.name === name); },
  };
})();
