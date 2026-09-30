// WebAudio synth for all 31 spec SFX (presets in sfx-presets.json) plus one original
// 90 s chiptune loop, with -9 dB music ducking under clip cards. No samples.
// Headless-safe: without AudioContext every call is a no-op.

export function createSfx(presets, { muted = false } = {}) {
  let ac = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
  let music = null;
  const loops = new Map();
  const has = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  const last = new Map();

  function ensure() {
    if (!has || muted) return null;
    if (!ac) {
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
      master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
      sfxBus = ac.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(master);
      musicBus = ac.createGain(); musicBus.gain.value = 0.22; musicBus.connect(master);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 1, ac.sampleRate);
      const d = noiseBuf.getChannelData(0); let s = 12345;
      for (let i = 0; i < d.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = (s / 0x3fffffff) - 1; }
    }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  }
  // Build the AudioContext right after load (it starts suspended without a gesture). Creating it
  // inside the first keydown cost ~70 ms, so the streamer's first run/jump press hitched.
  // The first gesture then only resumes it, and music scheduling runs outside the key handler.
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
    const now = ac.currentTime, prev = last.get(name) || 0;
    if (now - prev < 0.045) return; // spam guard (20+ events/s)
    last.set(name, now);
    for (const L of p) layer(L, now, sfxBus, vol);
  }

  /** Sustained sound while `on` (drone buzz, wind howl, summit rotor). */
  function loop(name, on) {
    if (!ensure()) return;
    const cur = loops.get(name);
    if (on && !cur) {
      const id = setInterval(() => play(name, 0.8), ((presets[name] || [{ d: 0.5 }])[0].d || 0.5) * 900);
      loops.set(name, id); play(name, 0.8);
    } else if (!on && cur) { clearInterval(cur); loops.delete(name); }
  }

  // ---------- original 90 s chiptune loop: 128 bpm, 48 bars (A/B/C sections) ----------
  const BPM = 128, BEAT = 60 / BPM, BAR = BEAT * 4;
  const N = (n) => 440 * Math.pow(2, (n - 69) / 12);
  const CH = { Am: [57, 60, 64], F: [53, 57, 60], C: [48, 52, 55], G: [55, 59, 62], Dm: [50, 53, 57], E: [52, 56, 59], Em: [52, 55, 59] };
  const PROG = [].concat(
    Array(4).fill(['Am', 'F', 'C', 'G']).flat(),      // A: yard grind
    Array(4).fill(['Dm', 'Am', 'E', 'Am']).flat(),    // B: tension
    Array(2).fill(['F', 'G', 'Em', 'Am', 'F', 'G', 'E', 'E']).flat(), // C: climb
  );
  const MOTIF = [[0, 2], [2, 1], [3, 1], [4, 2], [3, 1], [2, 1], [0, 2], [-1, 1], [0, 1], [2, 2], [4, 1], [5, 1], [4, 2], [2, 2]];
  function scheduleBar(bar, t) {
    const chord = CH[PROG[bar % PROG.length]], sec = Math.floor(bar / 16);
    for (let i = 0; i < 8; i++) { // bass eighths
      const n = chord[0] - 12 + (i % 4 === 3 ? 7 : 0);
      layer({ w: 'triangle', f: [N(n), N(n)], d: BEAT * 0.45, v: 0.5 }, t + i * BEAT / 2, musicBus);
    }
    for (let i = 0; i < 16; i++) { // arp sixteenths
      const n = chord[i % 3] + (i % 6 < 3 ? 12 : 0);
      layer({ w: 'square', f: [N(n), N(n)], d: BEAT * 0.2, v: sec === 1 ? 0.07 : 0.1 }, t + i * BEAT / 4, musicBus);
    }
    // drums: kick on 1/3, hats on eighths, snare-noise on 2/4
    for (let b = 0; b < 4; b++) {
      if (b % 2 === 0) layer({ w: 'sine', f: [150, 40], d: 0.14, v: 0.6 }, t + b * BEAT, musicBus);
      else layer({ w: 'noise', f: [1800, 900], d: 0.12, v: 0.25 }, t + b * BEAT, musicBus);
      layer({ w: 'noise', f: [9000, 9000], d: 0.03, v: 0.08, hp: 7000 }, t + b * BEAT + BEAT / 2, musicBus);
    }
    if (sec !== 0 || bar % 8 >= 4) { // lead motif
      let pos = 0;
      const scale = [0, 2, 3, 5, 7, 8, 10];
      for (const [deg, len] of MOTIF) {
        if (pos >= 8) break;
        const n = chord[0] + 12 + 12 * Math.floor(deg / 7) + scale[((deg % 7) + 7) % 7];
        layer({ w: 'square', f: [N(n), N(n)], d: BEAT / 2 * len * 0.9, v: 0.12, vib: [5, 3] }, t + pos * BEAT / 2, musicBus);
        pos += len;
      }
    }
  }
  function startMusic() {
    if (!ensure() || music) return;
    music = { bar: 0, next: ac.currentTime + 0.1 };
    music.timer = setInterval(() => {
      while (music && music.next < ac.currentTime + 0.35) { scheduleBar(music.bar, music.next); music.next += BAR; music.bar = (music.bar + 1) % 48; }
    }, 80);
  }
  function stopMusic() { if (music) { clearInterval(music.timer); music = null; } }
  function duck(on) { if (musicBus) musicBus.gain.setTargetAtTime(on ? 0.22 * 0.355 : 0.22, ac.currentTime, 0.08); } // -9 dB

  return { play, loop, startMusic, stopMusic, duck, get ready() { return !!ac; }, setMuted(m) { muted = m; if (m) { stopMusic(); for (const k of [...loops.keys()]) loop(k, false); } } };
}
