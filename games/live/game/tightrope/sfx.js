// TIGHTROPE WebAudio synth: presets (sfx-presets.json) + one original ~45 s high-wire waltz
// (3/4, 132 bpm, D minor oom-pah-pah with a wobbly lead), ducked -9 dB under fall cards.
// No samples. Headless-safe: without AudioContext every call is a no-op.

export function createSfx(presets, { muted = false } = {}) {
  let ac = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null, music = null;
  const loops = new Map(), last = new Map();
  const has = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  function ensure() {
    if (!has || muted) return null;
    if (!ac) {
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
      master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
      sfxBus = ac.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(master);
      musicBus = ac.createGain(); musicBus.gain.value = 0.2; musicBus.connect(master);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0); let s = 98765;
      for (let i = 0; i < d.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = (s / 0x3fffffff) - 1; }
    }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  }
  if (has && !muted) setTimeout(() => ensure(), 0);
  if (typeof window !== 'undefined') ['pointerdown', 'keydown'].forEach((e) => window.addEventListener(e, () => { ensure(); setTimeout(startMusic, 0); }, { once: true }));

  function layer(L, t0, bus, vol = 1) {
    const reps = L.rep || 1;
    for (let r = 0; r < reps; r++) {
      const t = t0 + (L.dl || 0) + r * ((L.d || 0.1) + (L.gap || 0));
      const g = ac.createGain();
      const a = L.a || 0.005, d = L.d || 0.1, v = (L.v || 0.3) * vol;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a + 0.01, d));
      let src, out = g;
      if (L.w === 'noise') {
        src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
        const f = ac.createBiquadFilter(); f.type = L.hp ? 'highpass' : 'bandpass'; f.frequency.setValueAtTime(L.hp || L.f[0], t);
        f.frequency.exponentialRampToValueAtTime(Math.max(40, L.hp || L.f[1]), t + d); f.Q.value = L.hp ? 0.7 : 1.2;
        src.connect(f); f.connect(g);
      } else {
        src = ac.createOscillator(); src.type = L.w || 'square';
        src.frequency.setValueAtTime(L.f[0], t); src.frequency.exponentialRampToValueAtTime(Math.max(20, L.f[1]), t + d);
        if (L.vib) { const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = L.vib[0]; lg.gain.value = L.vib[1]; lfo.connect(lg); lg.connect(src.frequency); lfo.start(t); lfo.stop(t + d + 0.05); }
        src.connect(g);
      }
      if (L.lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = L.lp; g.connect(f); out = f; }
      out.connect(bus);
      src.start(t); src.stop(t + d + 0.05);
    }
  }
  function play(name, vol = 1) {
    const p = presets[name];
    if (!p || !Array.isArray(p) || !ensure()) return;
    const now = ac.currentTime;
    if (now - (last.get(name) || 0) < 0.045) return; // spam guard
    last.set(name, now);
    for (const L of p) layer(L, now, sfxBus, vol);
  }
  function loop(name, on) {
    if (!ensure()) return;
    const cur = loops.get(name);
    if (on && !cur) { const id = setInterval(() => play(name, 0.8), ((presets[name] || [{ d: 0.5 }])[0].d || 0.5) * 900); loops.set(name, id); play(name, 0.8); }
    else if (!on && cur) { clearInterval(cur); loops.delete(name); }
  }

  // ---------- original high-wire waltz: 3/4, 132 bpm, 32 bars (A + B) ----------
  const BPM = 132, BEAT = 60 / BPM, BAR = BEAT * 3;
  const N = (n) => 440 * Math.pow(2, (n - 69) / 12);
  const CH = { Dm: [50, 53, 57], A7: [45, 49, 52, 55], Gm: [43, 46, 50], C: [48, 52, 55], F: [41, 45, 48], Bb: [46, 50, 53], A: [45, 49, 52] };
  const PROG = ['Dm', 'Dm', 'A7', 'A7', 'Dm', 'Dm', 'Gm', 'Gm', 'C', 'C', 'F', 'F', 'Gm', 'A7', 'Dm', 'Dm',
    'Bb', 'Bb', 'F', 'F', 'Gm', 'Gm', 'A', 'A', 'Dm', 'Bb', 'Gm', 'A7', 'Dm', 'A7', 'Dm', 'Dm'];
  // lead: per bar [beat, semitone above the chord root + 12, length in beats]
  const LEAD = [
    [[0, 12, 1], [1, 14, 0.5], [1.5, 15, 0.5], [2, 17, 1]], [[0, 19, 2], [2, 17, 1]],
    [[0, 16, 1], [1, 19, 1], [2, 22, 1]], [[0, 21, 2.5]],
    [[0, 17, 1], [1, 15, 0.5], [1.5, 14, 0.5], [2, 12, 1]], [[0, 14, 1], [1, 15, 1], [2, 17, 1]],
    [[0, 19, 1.5], [1.5, 17, 0.5], [2, 15, 1]], [[0, 14, 2.5]],
  ];
  function scheduleBar(bar, t) {
    const name = PROG[bar % PROG.length], chord = CH[name], B = bar >= 16;
    layer({ w: 'triangle', f: [N(chord[0] - 12), N(chord[0] - 12)], d: BEAT * 0.9, v: 0.55 }, t, musicBus);            // oom
    for (const b of [1, 2]) for (const n of chord.slice(0, 3)) layer({ w: 'square', f: [N(n + 12), N(n + 12)], d: BEAT * 0.35, v: 0.05 }, t + b * BEAT, musicBus); // pah pah
    layer({ w: 'noise', f: [7000, 7000], d: 0.03, v: 0.05, hp: 6000 }, t + BEAT, musicBus);
    layer({ w: 'noise', f: [7000, 7000], d: 0.03, v: 0.05, hp: 6000 }, t + 2 * BEAT, musicBus);
    if (bar % 4 === 0) layer({ w: 'sine', f: [120, 45], d: 0.18, v: 0.45 }, t, musicBus);
    const phrase = LEAD[(bar + (B ? 4 : 0)) % LEAD.length];
    for (const [beat, semi, len] of phrase) {
      const n = chord[0] + semi - (B ? 12 : 0) + 12;
      layer({ w: B ? 'triangle' : 'square', f: [N(n), N(n)], d: BEAT * len * 0.92, v: B ? 0.16 : 0.09, vib: [5.5, 4] }, t + beat * BEAT, musicBus);
    }
  }
  function startMusic() {
    if (!ensure() || music) return;
    music = { bar: 0, next: ac.currentTime + 0.1 };
    music.timer = setInterval(() => { while (music && music.next < ac.currentTime + 0.35) { scheduleBar(music.bar, music.next); music.next += BAR; music.bar = (music.bar + 1) % PROG.length; } }, 80);
  }
  function stopMusic() { if (music) { clearInterval(music.timer); music = null; } }
  function duck(on) { if (musicBus) musicBus.gain.setTargetAtTime(on ? 0.2 * 0.355 : 0.2, ac.currentTime, 0.08); }
  function stopLoops() { for (const id of loops.values()) clearInterval(id); loops.clear(); }
  return { play, loop, stopLoops, startMusic, stopMusic, duck, get ready() { return !!ac; }, setMuted(m) { muted = m; if (m) { stopMusic(); for (const k of [...loops.keys()]) loop(k, false); } } };
}
