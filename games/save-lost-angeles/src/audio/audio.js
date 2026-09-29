// src/audio/audio.js — OWNER: audio agent.
// LOST ANGELES audio engine: one AudioContext (created/resumed on the first user gesture), a
// master -> {music(+duck), sfx} bus graph, persisted volumes, and punchy procedural SFX.
// SFX are synthesised in plain JS once ("baked") into AudioBuffers, so playing one costs exactly one
// BufferSource node (+1 gain only when opts.volume is given) — cheap enough for the Pi 5 cabinet.
// Everything silently no-ops before unlock / without WebAudio. Unknown names never throw.
(function () {
  'use strict';
  const LA = window.LA = window.LA || {};
  const AC = window.AudioContext || window.webkitAudioContext || null;
  const STORE = 'laopus.audio';
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // ------------------------------------------------------------------ settings (persisted)
  const vol = { master: 1, music: 0.7, sfx: 0.85, muted: false };
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (s && typeof s === 'object') {
      for (const k of ['master', 'music', 'sfx']) if (typeof s[k] === 'number' && isFinite(s[k])) vol[k] = clamp(s[k], 0, 1);
      vol.muted = !!s.muted;
    }
  } catch (e) { /* storage blocked — defaults */ }
  function persist() { try { localStorage.setItem(STORE, JSON.stringify(vol)); } catch (e) {} }

  // ------------------------------------------------------------------ context + bus graph
  let ctx = null, master = null, comp = null, musicBus = null, duck = null, sfxBus = null;
  let resuming = false, primed = false, autoSuspended = false;
  const runHooks = [];
  const stats = { sfxPlayed: 0, sfxVoices: 0, sfxSkipped: 0, baked: 0 };

  function build() {
    if (ctx) return ctx;
    if (!AC) return null;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { try { ctx = new AC(); } catch (e2) { ctx = null; return null; } }
    try {
      master = ctx.createGain();
      // gentle safety limiter so stacked SFX + music never clip
      if (ctx.createDynamicsCompressor) {
        comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -8; comp.knee.value = 6; comp.ratio.value = 8;
        comp.attack.value = 0.003; comp.release.value = 0.2;
        master.connect(comp); comp.connect(ctx.destination);
      } else master.connect(ctx.destination);
      musicBus = ctx.createGain(); duck = ctx.createGain(); sfxBus = ctx.createGain();
      musicBus.connect(duck); duck.connect(master); sfxBus.connect(master);
      applyVolumes(true);
      ctx.onstatechange = () => { if (ctx && ctx.state === 'running') onRunning(); };
    } catch (e) { ctx = null; return null; }
    return ctx;
  }
  function running() { return !!(ctx && ctx.state === 'running'); }
  function onRunning() {
    if (!primed) {
      primed = true;
      try { // iOS/WebKit: a 1-sample silent buffer started inside the gesture fully unlocks output
        const b = ctx.createBuffer(1, 1, ctx.sampleRate), s = ctx.createBufferSource();
        s.buffer = b; s.connect(ctx.destination); s.start(0);
      } catch (e) {}
      prebake();
    }
    for (const fn of runHooks) { try { fn(); } catch (e) {} }
    retryFiles();
  }
  function setParam(p, v, now) {
    try { p.cancelScheduledValues(now); p.setTargetAtTime(v, now, 0.03); } catch (e) { try { p.value = v; } catch (e2) {} }
  }
  function applyVolumes(instant) {
    if (ctx && master) {
      const now = ctx.currentTime;
      const m = vol.muted ? 0 : vol.master;
      if (instant) { master.gain.value = m; musicBus.gain.value = vol.music; sfxBus.gain.value = vol.sfx; }
      else { setParam(master.gain, m, now); setParam(musicBus.gain, vol.music, now); setParam(sfxBus.gain, vol.sfx, now); }
    }
    for (const h of files) h._applyVol();
  }

  function unlock() {
    if (!AC) return;
    if (ctx && ctx.state === 'running' && primed) return;       // cheap on every keydown
    if (!build()) return;
    if (ctx.state === 'running') { onRunning(); return; }
    if (resuming) return;
    resuming = true;
    try {
      const p = ctx.resume();
      const done = () => { resuming = false; if (running()) onRunning(); };
      if (p && p.then) p.then(done, done); else done();
    } catch (e) { resuming = false; }
  }

  // pause the whole graph while the tab is hidden (saves CPU / battery; scheduler stalls cleanly)
  try {
    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      try {
        if (document.hidden) { if (ctx.state === 'running') { autoSuspended = true; ctx.suspend(); } }
        else if (autoSuspended) { autoSuspended = false; ctx.resume(); }
      } catch (e) {}
    });
  } catch (e) {}

  // ------------------------------------------------------------------ tiny JS synth (bake-time only)
  let SR = 44100;
  const TAU = Math.PI * 2;
  let seed = 0x1234567;
  function rnd() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2147483648 - 1; }
  function blep(t, dt) {
    if (t < dt) { t /= dt; return t + t - t * t - 1; }
    if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
    return 0;
  }
  const NOTE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  function midi(s) { // 'c#5' / 'bb4' / 'e6' -> midi number
    if (typeof s === 'number') return s;
    const m = /^([a-g])([#b]?)(-?\d)$/.exec(s);
    return m ? 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) : 60;
  }
  const hz = (n) => 440 * Math.pow(2, (midi(n) - 69) / 12);

  // osc(buf, {t, d, w:'sq'|'p25'|'p12'|'tri'|'saw'|'sin', f, f2, lin, v, a, k, hold, vib:[hz,cents], arp:[semis], arpT})
  function osc(b, o) {
    const i0 = Math.floor((o.t || 0) * SR), n = Math.max(2, Math.floor(o.d * SR));
    const w = o.w || 'sq', D = w === 'p25' ? 0.25 : w === 'p12' ? 0.125 : 0.5;
    const f1 = o.f, f2 = o.f2 || o.f, v = o.v == null ? 1 : o.v, k = o.k == null ? 1.2 : o.k;
    const aS = Math.max(1, Math.floor((o.a == null ? 0.004 : o.a) * SR));
    const h0 = Math.max(o.hold || 0, aS / n);
    const vr = o.vib ? o.vib[0] : 0, vc = o.vib ? o.vib[1] / 1200 : 0;
    const arp = o.arp, arpN = arp ? Math.max(1, Math.floor((o.arpT || 0.05) * SR)) : 0;
    let ph = 0;
    for (let j = 0; j < n; j++) {
      const i = i0 + j; if (i >= b.length) break;
      const x = j / n;
      let f = o.lin ? f1 + (f2 - f1) * x : f1 * Math.pow(f2 / f1, x);
      if (vr) f *= Math.pow(2, vc * Math.sin(TAU * vr * j / SR));
      if (arp) f *= Math.pow(2, arp[Math.floor(j / arpN) % arp.length] / 12);
      const dt = Math.min(0.49, f / SR);
      ph += dt; if (ph >= 1) ph -= 1;
      let s;
      if (w === 'sin') s = Math.sin(TAU * ph);
      else if (w === 'tri') s = 4 * Math.abs(ph - 0.5) - 1;
      else if (w === 'saw') s = 2 * ph - 1 - blep(ph, dt);
      else { let p2 = ph - D; if (p2 < 0) p2 += 1; s = (ph < D ? 1 : -1) + blep(ph, dt) - blep(p2, dt); }
      const e = j < aS ? j / aS : x < h0 ? 1 : Math.pow(Math.max(0, 1 - (x - h0) / (1 - h0)), k);
      b[i] += s * v * e;
    }
  }
  // noise(buf, {t, d, v, lp, lp2, hp, crush, a, k, hold, am:[hz, depth]})
  function noise(b, o) {
    const i0 = Math.floor((o.t || 0) * SR), n = Math.max(2, Math.floor(o.d * SR));
    const v = o.v == null ? 1 : o.v, k = o.k == null ? 1.2 : o.k, crush = o.crush || 1;
    const aS = Math.max(1, Math.floor((o.a == null ? 0.002 : o.a) * SR)), h0 = Math.max(o.hold || 0, aS / n);
    const lp = o.lp || 0, lp2 = o.lp2 || lp, hpA = o.hp ? 1 - Math.exp(-TAU * o.hp / SR) : 0;
    let y = 0, yh = 0, s = 0;
    for (let j = 0; j < n; j++) {
      const i = i0 + j; if (i >= b.length) break;
      const x = j / n;
      if (j % crush === 0) s = rnd();
      let z = s;
      if (lp) { const fc = lp * Math.pow(lp2 / lp, x); y += (1 - Math.exp(-TAU * fc / SR)) * (z - y); z = y; }
      if (hpA) { yh += hpA * (z - yh); z -= yh; }
      let e = j < aS ? j / aS : x < h0 ? 1 : Math.pow(Math.max(0, 1 - (x - h0) / (1 - h0)), k);
      if (o.am) e *= 1 - o.am[1] * (0.5 + 0.5 * Math.sin(TAU * o.am[0] * j / SR));
      b[i] += z * v * e;
    }
  }
  function notes(b, t0, step, list, o) {
    list.forEach((n, i) => { if (n != null) osc(b, Object.assign({}, o, { t: t0 + i * step, d: o.d || step * 0.95, f: hz(n), f2: o.slide ? hz(n) * o.slide : undefined })); });
  }
  function normalize(b, peak) {
    let m = 0;
    for (let i = 0; i < b.length; i++) { const a = b[i] < 0 ? -b[i] : b[i]; if (a > m) m = a; }
    const g = m > 1e-6 ? peak / m : 0;
    const fi = Math.min(b.length, Math.floor(SR * 0.001)), fo = Math.min(b.length, Math.floor(SR * 0.004));
    for (let i = 0; i < b.length; i++) b[i] *= g;
    for (let i = 0; i < fi; i++) b[i] *= i / fi;
    for (let i = 0; i < fo; i++) b[b.length - 1 - i] *= i / fo;
    return b;
  }
  // render(sr, seconds, build, peak) -> Float32Array (normalised to `peak`)
  function render(sr, dur, fn, peak) {
    const prev = SR; SR = sr; seed = 0x1234567;
    const b = new Float32Array(Math.max(1, Math.ceil(dur * sr)));
    try { fn(b); normalize(b, peak == null ? 0.5 : peak); } finally { SR = prev; }
    return b;
  }

  // ------------------------------------------------------------------ SFX library
  // d: length (s) · lvl: baked peak · gap: min seconds between plays · duck: music level while it plays
  // rate(opts): playback-rate variation · pri: allowed past the voice cap
  const SFX = {
    jump:  { d: 0.17, lvl: 0.5, gap: 0.03, p2: 1, b: (b) => osc(b, { d: 0.16, w: 'p25', f: 280, f2: 720, k: 1.5 }) },
    jump2: { d: 0.18, lvl: 0.5, gap: 0.03, p2: 1, b: (b) => { osc(b, { d: 0.15, w: 'p12', f: 420, f2: 1150, k: 1.4 }); osc(b, { t: 0.05, d: 0.11, w: 'tri', f: 1500, f2: 2500, v: 0.45 }); } },
    land:  { d: 0.08, lvl: 0.3, gap: 0.08, p2: 1, b: (b) => { noise(b, { d: 0.07, lp: 500, lp2: 150, k: 2 }); osc(b, { d: 0.07, w: 'sin', f: 130, f2: 55, v: 0.9, k: 2 }); } },
    stomp: { d: 0.16, lvl: 0.62, gap: 0.04, b: (b) => { osc(b, { d: 0.09, w: 'sq', f: 620, f2: 150, k: 1.3 }); noise(b, { d: 0.05, lp: 1800, lp2: 300, v: 0.7, k: 2 }); osc(b, { t: 0.07, d: 0.08, w: 'p25', f: 880, f2: 1320, v: 0.35 }); } },
    thud:  { d: 0.2, lvl: 0.6, gap: 0.08, b: (b) => { osc(b, { d: 0.18, w: 'sin', f: 95, f2: 38, k: 1.8 }); noise(b, { d: 0.1, lp: 600, lp2: 120, crush: 2, v: 0.7, k: 1.6 }); } },
    combo: { d: 0.17, lvl: 0.5, gap: 0.03, rate: (o) => Math.pow(2, clamp(((o && (o.n || o.combo)) || 1) - 1, 0, 7) * 2 / 12),
             b: (b) => { osc(b, { d: 0.05, w: 'p25', f: hz('g5'), hold: 0.6 }); osc(b, { t: 0.05, d: 0.11, w: 'p25', f: hz('d6'), k: 1.5 }); } },
    hurt:  { d: 0.34, lvl: 0.62, gap: 0.15, p2: 1, b: (b) => { osc(b, { d: 0.32, w: 'saw', f: 440, f2: 90, k: 1, vib: [22, 60] }); noise(b, { d: 0.12, lp: 3000, lp2: 500, v: 0.6 }); } },
    die:   { d: 1.9, lvl: 0.6, gap: 1, duck: 0.3, pri: 1, b: (b) => { // goofy sad-trombone slide
             osc(b, { d: 0.08, w: 'p25', f: hz('b5'), f2: hz('e5'), v: 0.5 });
             ['g4', 'f#4', 'f4'].forEach((n, i) => { osc(b, { t: 0.14 + i * 0.28, d: 0.26, w: 'saw', f: hz(n), hold: 0.5, v: 0.7 }); osc(b, { t: 0.14 + i * 0.28, d: 0.26, w: 'p25', f: hz(n) / 2, hold: 0.5, v: 0.35 }); });
             osc(b, { t: 0.98, d: 0.9, w: 'saw', f: hz('e4'), f2: hz('d#4'), hold: 0.35, vib: [5.5, 45], v: 0.7 });
             osc(b, { t: 0.98, d: 0.9, w: 'p25', f: hz('e3'), f2: hz('d#3'), hold: 0.35, vib: [5.5, 45], v: 0.35 }); } },
    crystal: { d: 0.36, lvl: 0.42, gap: 0.035, rate: () => 1 + (Math.random() - 0.5) * 0.07,
             b: (b) => { osc(b, { d: 0.06, w: 'sq', f: hz('b5'), hold: 0.8, k: 1 }); osc(b, { t: 0.06, d: 0.3, w: 'sq', f: hz('e6'), k: 1.6 }); } },
    oneup: { d: 0.52, lvl: 0.5, gap: 0.3, duck: 0.55, pri: 1, b: (b) => notes(b, 0, 0.075, ['e6', 'g6', 'e7', 'c7', 'd7', 'g7'], { w: 'p25', hold: 0.5, d: 0.07 }) },
    power: { d: 0.66, lvl: 0.55, gap: 0.25, duck: 0.5, pri: 1, b: (b) => {
             notes(b, 0, 0.042, ['c5', 'e5', 'g5', 'c6', 'e5', 'g5', 'c6', 'e6', 'g5', 'c6', 'e6', 'g6', 'c7'], { w: 'p25', hold: 0.4, slide: 1.03 });
             osc(b, { t: 0.1, d: 0.5, w: 'tri', f: hz('c6'), f2: hz('c7'), v: 0.35 }); } },
    powerdown: { d: 0.58, lvl: 0.5, gap: 0.25, b: (b) => notes(b, 0, 0.058, ['g6', 'e6', 'c6', 'g5', 'c6', 'g5', 'e5', 'c5', 'g4'], { w: 'p25', hold: 0.3, slide: 0.94 }) },
    shoot: { d: 0.11, lvl: 0.38, gap: 0.045, b: (b) => { osc(b, { d: 0.1, w: 'p25', f: 1500, f2: 520, k: 1.2 }); osc(b, { t: 0.02, d: 0.08, w: 'sin', f: 2600, v: 0.35, k: 2 }); } },
    bonk:  { d: 0.16, lvl: 0.6, gap: 0.06, b: (b) => { osc(b, { d: 0.15, w: 'sq', f: 190, f2: 70, k: 1.2 }); noise(b, { d: 0.08, lp: 1200, lp2: 200, v: 0.7, crush: 3 }); } },
    bosshit: { d: 0.24, lvl: 0.7, gap: 0.06, b: (b) => { osc(b, { d: 0.22, w: 'sq', f: 300, f2: 60 }); osc(b, { d: 0.22, w: 'saw', f: 150, f2: 40, v: 0.7 }); noise(b, { d: 0.14, lp: 4000, lp2: 400, crush: 4, v: 0.8 }); osc(b, { d: 0.06, w: 'p12', f: 1800, f2: 900, v: 0.3 }); } },
    bossdown: { d: 1.6, lvl: 0.8, gap: 1, duck: 0.3, pri: 1, b: (b) => {
             noise(b, { d: 1.45, lp: 4000, lp2: 120, crush: 6, k: 1.2 }); osc(b, { d: 1.2, w: 'saw', f: 420, f2: 35, v: 0.5, k: 1 });
             for (let i = 0; i < 5; i++) osc(b, { t: i * 0.22, d: 0.26, w: 'sin', f: 115, f2: 35, v: 0.9, k: 2 }); } },
    goal:  { d: 2.4, lvl: 0.7, gap: 1, duck: 0.2, pri: 1, b: (b) => { // level-clear fanfare
             notes(b, 0, 0.07, ['g4', 'c5', 'e5', 'g5', 'c6', 'e6'], { w: 'p25', hold: 0.6 });
             osc(b, { t: 0.45, d: 0.7, w: 'p25', f: hz('c6'), hold: 0.6, k: 1.3 }); osc(b, { t: 0.45, d: 0.7, w: 'tri', f: hz('g5'), hold: 0.6, v: 0.5 });
             osc(b, { t: 0.45, d: 0.7, w: 'tri', f: hz('e5'), hold: 0.6, v: 0.5 }); osc(b, { t: 0.45, d: 0.7, w: 'tri', f: hz('c3'), hold: 0.7, v: 0.8 });
             osc(b, { t: 1.2, d: 0.13, w: 'p25', f: hz('d6'), hold: 0.7 }); osc(b, { t: 1.35, d: 0.13, w: 'p25', f: hz('e6'), hold: 0.7 });
             osc(b, { t: 1.5, d: 0.85, w: 'p25', f: hz('g6'), hold: 0.55, k: 1.4, vib: [6, 18] }); osc(b, { t: 1.5, d: 0.85, w: 'tri', f: hz('b5'), hold: 0.55, v: 0.5 });
             osc(b, { t: 1.5, d: 0.85, w: 'tri', f: hz('d5'), hold: 0.55, v: 0.5 }); osc(b, { t: 1.2, d: 1.1, w: 'tri', f: hz('g2'), hold: 0.6, v: 0.8 });
             noise(b, { t: 1.5, d: 0.6, hp: 4000, v: 0.25, k: 1.5 }); } },
    checkpoint: { d: 0.56, lvl: 0.5, gap: 0.3, b: (b) => { osc(b, { d: 0.12, w: 'p25', f: hz('e6'), hold: 0.6 }); osc(b, { t: 0.1, d: 0.35, w: 'p25', f: hz('b6'), k: 1.8 }); osc(b, { t: 0.1, d: 0.35, w: 'tri', f: hz('e6'), k: 1.8, v: 0.5 }); osc(b, { t: 0.32, d: 0.22, w: 'p25', f: hz('b6'), v: 0.3 }); } },
    rescue: { d: 0.62, lvl: 0.5, gap: 0.2, b: (b) => { notes(b, 0, 0.08, ['g5', 'c6', 'e6'], { w: 'tri' }); notes(b, 0, 0.08, ['g5', 'c6', 'e6'], { w: 'p25', v: 0.35 }); osc(b, { t: 0.24, d: 0.36, w: 'p25', f: hz('g6'), vib: [9, 40], hold: 0.3 }); osc(b, { t: 0.24, d: 0.36, w: 'tri', f: hz('c6'), v: 0.6 }); } },
    revive: { d: 0.55, lvl: 0.5, gap: 0.3, b: (b) => { notes(b, 0, 0.05, ['c5', 'e5', 'g5', 'c6', 'e6', 'g6', 'c7'], { w: 'tri', d: 0.12 }); notes(b, 0.025, 0.05, ['g5', 'c6', 'e6', 'g6', 'c7', 'e7'], { w: 'sin', v: 0.35, d: 0.1 }); } },
    join:  { d: 0.52, lvl: 0.5, gap: 0.3, b: (b) => { osc(b, { d: 0.08, w: 'p25', f: hz('c5'), hold: 0.7 }); osc(b, { t: 0.09, d: 0.08, w: 'p25', f: hz('g5'), hold: 0.7 });
             osc(b, { t: 0.18, d: 0.32, w: 'p25', f: hz('c6'), hold: 0.4 }); osc(b, { t: 0.18, d: 0.32, w: 'tri', f: hz('e5'), hold: 0.4, v: 0.6 }); osc(b, { t: 0.18, d: 0.32, w: 'tri', f: hz('g4'), hold: 0.4, v: 0.6 }); } },
    menu:  { d: 0.04, lvl: 0.3, gap: 0.035, b: (b) => osc(b, { d: 0.035, w: 'p25', f: 1200, f2: 1100, k: 1 }) },
    select: { d: 0.21, lvl: 0.45, gap: 0.06, b: (b) => { osc(b, { d: 0.06, w: 'p25', f: hz('a5'), hold: 0.7 }); osc(b, { t: 0.06, d: 0.14, w: 'p25', f: hz('a6'), k: 1.5 }); } },
    pause: { d: 0.3, lvl: 0.4, gap: 0.15, b: (b) => notes(b, 0, 0.065, ['b5', 'g5', 'd6', null], { w: 'sq', hold: 0.5, d: 0.06 }) },
    splash: { d: 0.5, lvl: 0.55, gap: 0.08, b: (b) => { noise(b, { d: 0.45, lp: 3500, lp2: 250, k: 1.3 }); [0.1, 0.18, 0.27, 0.34].forEach((t, i) => osc(b, { t, d: 0.05, w: 'sin', f: 400 + i * 120, f2: 800 + i * 150, v: 0.4 })); } },
    fire:  { d: 0.52, lvl: 0.5, gap: 0.1, b: (b) => { noise(b, { d: 0.5, lp: 400, lp2: 2600, a: 0.1, k: 1.4 }); for (let i = 0; i < 9; i++) noise(b, { t: 0.04 + ((i * 0.37) % 1) * 0.42, d: 0.012, hp: 2000, v: 0.3, k: 2 }); } },
    slip:  { d: 0.4, lvl: 0.5, gap: 0.15, b: (b) => { osc(b, { d: 0.38, w: 'tri', f: 1000, f2: 180, vib: [14, 80], k: 1 }); osc(b, { d: 0.3, w: 'sin', f: 2000, f2: 500, v: 0.3 }); } },
    denied: { d: 0.42, lvl: 0.62, gap: 0.12, b: (b) => { // rubber stamp THUNK + bureaucratic BZZT
             osc(b, { d: 0.12, w: 'sin', f: 110, f2: 50, k: 2 }); noise(b, { d: 0.06, lp: 900, v: 0.8, k: 2 });
             osc(b, { t: 0.11, d: 0.28, w: 'sq', f: 110, hold: 0.7, v: 0.45 }); osc(b, { t: 0.11, d: 0.28, w: 'saw', f: 116, hold: 0.7, v: 0.35 }); } },
    flash: { d: 0.26, lvl: 0.35, gap: 0.08, b: (b) => { noise(b, { d: 0.03, hp: 3000, k: 2 }); osc(b, { d: 0.24, w: 'sin', f: 1800, f2: 7000, v: 0.4, a: 0.02 }); osc(b, { t: 0.01, d: 0.04, w: 'p12', f: 3000, f2: 1500, v: 0.3 }); } },
    whoosh: { d: 0.36, lvl: 0.45, gap: 0.06, b: (b) => noise(b, { d: 0.35, lp: 400, lp2: 2800, a: 0.12, k: 1.5 }) },
    splat: { d: 0.19, lvl: 0.55, gap: 0.06, b: (b) => { noise(b, { d: 0.14, lp: 900, lp2: 200, crush: 2, k: 1.5 }); osc(b, { d: 0.12, w: 'sin', f: 240, f2: 60, v: 0.8 }); osc(b, { t: 0.03, d: 0.05, w: 'p25', f: 300, f2: 150, v: 0.3 }); } },
    gavel: { d: 0.3, lvl: 0.65, gap: 0.2, b: (b) => { [0, 0.18].forEach((t) => { osc(b, { t, d: 0.09, w: 'tri', f: 900, f2: 600, k: 3 }); osc(b, { t, d: 0.07, w: 'sin', f: 220, f2: 150, k: 3, v: 0.8 }); noise(b, { t, d: 0.03, lp: 3000, v: 0.6, k: 3 }); }); } },
    cash:  { d: 0.62, lvl: 0.5, gap: 0.05, b: (b) => { noise(b, { d: 0.06, hp: 2500, v: 0.8, k: 2 }); osc(b, { t: 0.07, d: 0.5, w: 'sin', f: hz('c7'), k: 2 }); osc(b, { t: 0.07, d: 0.5, w: 'sin', f: hz('e7'), k: 2 }); osc(b, { t: 0.07, d: 0.4, w: 'sin', f: hz('g7'), k: 2, v: 0.5 }); } },
    crowd: { d: 1.4, lvl: 0.45, gap: 0.4, b: (b) => { noise(b, { d: 1.35, lp: 1800, hp: 250, a: 0.2, k: 1.2, am: [7, 0.35] }); [[0.1, 600, 900], [0.35, 700, 1000], [0.6, 550, 850], [0.8, 650, 950]].forEach((w) => osc(b, { t: w[0], d: 0.32, w: 'sin', f: w[1], f2: w[2], vib: [7, 50], v: 0.22, a: 0.05 })); } },
    boing: { d: 0.46, lvl: 0.5, gap: 0.05, b: (b) => { osc(b, { d: 0.45, w: 'sin', f: 180, f2: 520, vib: [16, 300], k: 1.2 }); osc(b, { d: 0.3, w: 'tri', f: 360, f2: 1040, vib: [16, 300], v: 0.3 }); } },
    boom:  { d: 0.82, lvl: 0.8, gap: 0.07, duck: 0.45, b: (b) => { noise(b, { d: 0.8, lp: 2500, lp2: 90, crush: 5, k: 1.3 }); osc(b, { d: 0.55, w: 'sin', f: 90, f2: 30, k: 1.5 }); } },
  };
  const ALIAS = { coin: 'crystal', gem: 'crystal', win: 'goal', clear: 'goal', hit: 'bonk', explode: 'boom', explosion: 'boom',
    pickup: 'power', powerup: 'power', click: 'menu', move: 'menu', confirm: 'select', ok: 'select', stamp: 'denied', camera: 'flash',
    money: 'cash', cheer: 'crowd', bounce: 'boing', ko: 'bossdown', water: 'splash', burn: 'fire', banana: 'slip', dash: 'whoosh',
    lob: 'shoot', throw: 'shoot', heal: 'revive', save: 'checkpoint', '1up': 'oneup', extra: 'oneup', kill: 'stomp' };

  const baked = {};            // name -> AudioBuffer (current context)
  function bake(name) {
    const def = SFX[name]; if (!def || !ctx) return null;
    if (baked[name]) return baked[name];
    const data = render(ctx.sampleRate, def.d, def.b, def.lvl);
    const ab = ctx.createBuffer(1, data.length, ctx.sampleRate);
    if (ab.copyToChannel) ab.copyToChannel(data, 0); else ab.getChannelData(0).set(data);
    stats.baked++;
    return (baked[name] = ab);
  }
  let prebaking = false;
  function prebake() { // bake the rest in idle slices so no single frame stalls
    if (prebaking) return; prebaking = true;
    const names = Object.keys(SFX);
    let i = 0;
    const next = () => { if (!ctx) return; let n = 0; while (i < names.length && n < 3) { bake(names[i++]); n++; } if (i < names.length) setTimeout(next, 30); };
    setTimeout(next, 50);
  }

  const lastAt = {};
  const MAXV = 24;
  function duckMusic(depth, dur) {
    if (!duck) return;
    try {
      const now = ctx.currentTime, p = duck.gain;
      p.cancelScheduledValues(now); p.setValueAtTime(p.value, now);
      p.setTargetAtTime(depth, now, 0.02); p.setTargetAtTime(1, now + dur * 0.85, 0.25);
    } catch (e) {}
  }
  function sfx(name, opts) {
    try {
      if (!ctx || ctx.state !== 'running' || vol.muted || vol.sfx <= 0 || vol.master <= 0) return;
      name = ALIAS[name] || name;
      const def = Object.prototype.hasOwnProperty.call(SFX, name) ? SFX[name] : null;
      if (!def) return;
      opts = opts || {};
      const now = ctx.currentTime;
      if (lastAt[name] != null && now - lastAt[name] < (def.gap || 0.025)) { stats.sfxSkipped++; return; }
      if (stats.sfxVoices >= MAXV && !def.pri) { stats.sfxSkipped++; return; }
      const buf = bake(name); if (!buf) return;
      lastAt[name] = now;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      let rate = def.rate ? def.rate(opts) : 1;
      if (def.p2 && opts.p === 1) rate *= 1.07;            // THE INTERN sounds a hair higher in co-op
      if (typeof opts.rate === 'number' && isFinite(opts.rate)) rate *= clamp(opts.rate, 0.25, 4);
      src.playbackRate.value = rate;
      let g = null;
      if (typeof opts.volume === 'number' && isFinite(opts.volume) && opts.volume !== 1) {
        g = ctx.createGain(); g.gain.value = clamp(opts.volume, 0, 2); src.connect(g); g.connect(sfxBus);
      } else src.connect(sfxBus);
      stats.sfxVoices++; stats.sfxPlayed++;
      src.onended = () => { stats.sfxVoices--; try { src.disconnect(); if (g) g.disconnect(); } catch (e) {} src.onended = null; };
      src.start(now);
      if (def.duck) duckMusic(def.duck, buf.duration / rate);
    } catch (e) { /* never throw into gameplay */ }
  }

  // ------------------------------------------------------------------ file playback (Saint's song)
  const files = new Set();
  const pendingPlays = new Set();
  function retryFiles() { for (const fn of Array.from(pendingPlays)) { pendingPlays.delete(fn); try { fn(); } catch (e) {} } }
  const NOOP_HANDLE = { stop() {}, setVolume() {}, el: null, _applyVol() {} };
  function playFile(url, o) {
    try {
      if (typeof Audio === 'undefined' || !url) return NOOP_HANDLE;
      o = o || {};
      const el = new Audio();
      el.preload = 'auto'; el.loop = !!o.loop;
      let v = clamp(typeof o.volume === 'number' && isFinite(o.volume) ? o.volume : 1, 0, 1);
      let src = null, gain = null, stopped = false;
      el.src = url;
      // route through the music bus (so music volume/mute/ducking apply) unless file:// (CORS -> silence)
      if (ctx && location.protocol !== 'file:') {
        try { src = ctx.createMediaElementSource(el); gain = ctx.createGain(); gain.gain.value = v; src.connect(gain); gain.connect(musicBus); }
        catch (e) { src = null; gain = null; }
      }
      const at = typeof o.at === 'number' && o.at > 0 ? o.at : 0;
      if (at) {
        const seek = () => { try { if (el.currentTime < at - 0.5 || el.currentTime > at + 1) el.currentTime = at; } catch (e) {} };
        if (el.readyState >= 1) seek(); else el.addEventListener('loadedmetadata', seek, { once: true });
      }
      const h = {
        el,
        stop() {
          if (stopped) return; stopped = true;
          pendingPlays.delete(tryPlay); files.delete(h);
          try { el.pause(); } catch (e) {}
          try { el.removeAttribute('src'); el.load(); } catch (e) {}
          try { if (src) src.disconnect(); if (gain) gain.disconnect(); } catch (e) {}
        },
        setVolume(nv) {
          if (typeof nv !== 'number' || !isFinite(nv)) return;
          nv = clamp(nv, 0, 1); if (Math.abs(nv - v) < 0.004) return; v = nv;
          if (gain && ctx) setParam(gain.gain, v, ctx.currentTime); else h._applyVol();
        },
        get playing() { return !stopped && !el.paused; },
        _applyVol() { if (!gain) { try { el.volume = clamp(v * vol.music * vol.master, 0, 1); el.muted = vol.muted; } catch (e) {} } },
      };
      function tryPlay() {
        if (stopped) return;
        try { const p = el.play(); if (p && p.catch) p.catch(() => { if (!stopped) pendingPlays.add(tryPlay); }); } catch (e) { pendingPlays.add(tryPlay); }
      }
      h._applyVol();
      files.add(h);
      el.addEventListener('ended', () => { if (!el.loop) h.stop(); });
      tryPlay();
      return h;
    } catch (e) { return NOOP_HANDLE; }
  }

  // ------------------------------------------------------------------ public API
  const BUSES = { master: 1, music: 1, sfx: 1 };
  function setVolume(bus, v) {
    if (!BUSES[bus] || typeof v !== 'number' || !isFinite(v)) return;
    vol[bus] = clamp(v, 0, 1); applyVolumes(false); persist();
  }
  function getVolume(bus) { return BUSES[bus] ? vol[bus] : 0; }
  function mute(b) { vol.muted = b === undefined ? !vol.muted : !!b; applyVolumes(false); persist(); return vol.muted; }

  LA.audio = {
    unlock, sfx, playFile, setVolume, getVolume, mute,
    isMuted: () => vol.muted,
    music() {}, stopMusic() {},            // replaced by music.js
    names: () => Object.keys(SFX),
    state: () => (ctx ? ctx.state : AC ? 'locked' : 'unavailable'),
    stats: () => Object.assign({ state: ctx ? ctx.state : 'none', files: files.size }, stats),
    // internals shared with music.js (and tests) — not part of the game-facing contract
    _core: {
      get ctx() { return ctx; }, get musicBus() { return musicBus; }, running,
      onRunning(fn) { runHooks.push(fn); if (running()) { try { fn(); } catch (e) {} } },
      muted: () => vol.muted || vol.master <= 0 || vol.music <= 0,
    },
    _dsp: { render, osc, noise, hz, midi, SFX },
  };
})();
