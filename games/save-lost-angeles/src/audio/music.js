// src/audio/music.js — OWNER: audio agent.
// Tiny procedural chiptune sequencer: pulse lead (optionally detuned/gliding), triangle or soft-saw
// bass, chord arps/stabs/pads, and pre-baked noise drums. Tracks are compiled once into per-16th event
// lists and scheduled ~0.3 s ahead on AudioContext time from a 50 ms timer — no per-frame work.
// All melodies are ORIGINAL. LA.audio.music(id, opts) crossfades; same id again = no restart.
(function () {
  'use strict';
  const LA = window.LA = window.LA || {};
  const A = LA.audio;
  if (!A || !A._core) return;
  const core = A._core, dsp = A._dsp;
  const AHEAD = 0.3, TICK_MS = 50, XFADE = 0.6;

  // ------------------------------------------------------------------ music theory helpers
  const PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  const QUAL = { '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], dim: [0, 3, 6], sus4: [0, 5, 7], '5': [0, 7] };
  function chord(s) {
    const m = /^([A-G])([#b]?)(.*)$/.exec(s) || ['', 'C', '', ''];
    return { pc: (PC[m[1].toLowerCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12, iv: QUAL[m[3]] || QUAL[''] };
  }
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // ------------------------------------------------------------------ patterns
  // bass: one char per 16th. R root · 5 fifth · O octave · 3 chord 3rd · 7 chord 7th · L fifth below · '-' hold · '.' rest
  const BASS = {
    oct:   'R.O.R.O.R.O.R.O.',
    drive: 'R-R-R-R-R-R-O-R-',
    surf:  'R-.RR-.R5-.5O-.5',
    bounce:'R-..5-..O-..5-.3',
    funk:  'R--.RO.7..R.5-7.',
    hip:   'R-----..R.R-7-..',
    epic:  'R.RRR.RRR.RRO.5.',
    half:  'R-------5-------',
    gallop:'R.RRR.RRR.RR5.O.',
    walk:  'R---3---5---O---',
  };
  // drums: k kick · s snare · h hat · o open hat · c clap · t tom · x crash. 'x' hit, 'X' accent, 'g' ghost
  const KITS = {
    drive:  { k: 'x.....x.x.....x.', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
    rock:   { k: 'x.......x.x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
    bounce: { k: 'x.......x.......', s: '....x.......x...', h: '..x...x...x...x.' },
    surf:   { k: 'x.x.x.x.x.x.x.x.', s: '....x.......x..g', h: 'x.x.x.x.x.x.x.x.', t: '..............x.' },
    funk:   { k: 'x.....x...x..x..', s: '....x..g....x...', h: 'xgxgxgxgxgxgxgxg' },
    boombap:{ k: 'x.......x.x.....', s: '....X.......X...', h: 'x.xgx.x.x.xgx.x.' },
    disco:  { k: 'x...x...x...x...', c: '....x.......x...', h: 'x...x...x...x...', o: '..x...x...x...x.' },
    march:  { k: 'x.x.x.x.x.x.x.x.', s: '....x.......x.gg', h: 'x.x.x.x.x.x.x.x.' },
    boss:   { k: 'x.x.x.x.x.x.x.x.', s: '....x..x....x...', h: 'xgxgxgxgxgxgxgxg' },
    ballad: { k: 'x.......x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
    jingle: { k: 'x.......x.......', s: '............x.x.' },
    none:   {},
  };
  const FILLS = {
    std:  { k: 'x.......x.......', s: '........x.xgxxXX', h: 'x.x.x.x.........' },
    tom:  { k: 'x.......x.......', s: '....x.......x...', t: '........x.x.xxxx' },
    funk: { k: 'x.....x...x.....', s: '....x..g..x.xgXg', h: 'xgxgxgxgxg......' },
  };
  const DRUMVOL = { k: 0.6, s: 0.42, h: 0.16, o: 0.14, c: 0.36, t: 0.42, x: 0.26 };
  const HITV = { x: 1, X: 1.3, g: 0.4 };

  // ------------------------------------------------------------------ TRACKS (original compositions)
  // Section: ch = one chord per bar ('F_G' = half bar each) · mel = tokens 'e5:2' (note:16ths, default 2), '.' rest
  const T = {};
  T.title = { // hype, catchy C-major anthem
    bpm: 152, gain: 0.55, lead: { w: 'p25', v: 0.17 }, bass: { w: 'soft', v: 0.2, p: 'oct' }, arp: { w: 'sq', v: 0.045, p: 'up16' },
    kit: 'drive', fill: 'std', crash: true,
    S: {
      A: { ch: 'C G Am F C G F_G C', mel: `g4 c5 e5 g5:4 e5 g5 a5 | g5:4 f5 e5 d5:4 b4 d5 | e5 c5 e5 a5:4 g5 e5 c5 | f5:6 e5 d5 c5 a4:4 |
            g4 c5 e5 g5:4 c6 b5 a5 | g5:4 d5 g5 b5:4 a5 g5 | a5 g5 f5 a5 g5 f5 d5 b4 | c5:4 e5 g5 c6:6 .` },
      B: { ch: 'F G Em Am Dm G C G', mel: `a5:3 a5:3 g5 f5 a5:4 c6 | b5:3 b5:3 a5 g5 d6:4 b5 | g5:3 g5:3 e5 b4 e5:4 g5 | a5:8 e5 a5 c6:4 |
            d6:3 c6:3 a5 f5 a5 d6:4 | d6:3 b5:3 g5 d5 g5 b5:4 | c6 g5 e5 g5 c6 e6 d6 c6 | d6:4 b5 g5 d5 f5 g5 b5` },
    },
    order: [{ s: 'A', arp: false }, 'B', 'A', 'B'],
  };
  T.map = { // bouncy shuffled overworld stroll in F
    bpm: 132, swing: 0.16, gain: 0.55, lead: { w: 'p12', v: 0.17 }, bass: { w: 'tri', v: 0.34, p: 'bounce' }, arp: { w: 'p25', v: 0.05, p: 'stab' },
    kit: 'bounce', fill: 'tom',
    S: {
      A: { ch: 'F Dm Bb C F Dm Gm_C F', mel: `c5 f5 a5 . g5 f5 a5:4 | d5 f5 a5 . g5 f5 e5:4 | d5 f5 bb5 . a5 g5 f5:4 | e5 g5 c6:4 bb5 a5 g5:4 |
            c5 f5 a5 c6 d6 c6 a5:4 | f5 a5 d6 c6 a5 f5 d5:4 | g5 bb5 a5 g5 e5 g5 c6 bb5 | a5:4 f5 c5 f5:6 .` },
      B: { ch: 'Bb C Am Dm Bb C Gm C', mel: `f5:4 d5 f5 bb5:4 a5 g5 | g5:4 e5 g5 c6:6 . | e5 a5 c6 a5 e5 a5 c6:4 | d6:4 c6 a5 f5:6 . |
            d5 f5 bb5 d6 c6 bb5 a5 g5 | e5 g5 c6 e6 d6 c6 bb5 a5 | g5:3 a5:3 bb5 a5:3 g5:3 f5 | e5:4 g5:4 c6:4 .:4` },
    },
    order: ['A', 'B', 'A', 'B'],
  };
  T.world1 = { // THE COAST — sunny surf-rock in A, tremolo-picked hooks
    bpm: 168, gain: 0.52, lead: { w: 'p25', v: 0.16, dbl: 8 }, bass: { w: 'soft', v: 0.2, p: 'surf' }, arp: { w: 'sq', v: 0.04, p: 'up8' },
    kit: 'surf', fill: 'tom', crash: true,
    S: {
      A: { ch: 'A A D D E D A E', mel: `e5:1 e5:1 e5:1 e5:1 c#5 e5 a5:4 g#5 f#5 | e5:4 c#5 a4 c#5 e5 a4:4 | f#5:1 f#5:1 f#5:1 f#5:1 d5 f#5 a5:4 b5 a5 | f#5:4 d5 a4 d5 f#5 a5:4 |
            g#5:1 g#5:1 g#5:1 g#5:1 b5 g#5 e5:4 f#5 g#5 | a5:4 f#5 d5 f#5 a5 b5:4 | c#6:4 b5 a5 e5:4 c#5 e5 | b4 e5 g#5 b5 e5:1 e5:1 e5:1 e5:1 d5 b4` },
      B: { ch: 'F#m D A E F#m D B E', mel: `a5:6 f#5 c#6:4 a5:4 | a5 f#5 d5:4 . d5 e5 f#5 | e5:6 c#5 a5:4 e5:4 | g#5 e5 b4:4 . b4 c#5 d5 |
            c#6:1 c#6:1 c#6:1 c#6:1 a5 f#5 c#6:4 e6:4 | d6:4 c#6 a5 f#5:4 a5:4 | d#6:4 b5 f#5 d#5:4 f#5 b5 | e6 d6 b5 g#5 e5 d5 b4:4` },
    },
    order: ['A', 'B', 'A', 'B'],
  };
  T.world2 = { // THE VALLEY — laid-back west-coast funk, whiny gliding lead, swung 16ths
    bpm: 96, swing: 0.2, gain: 0.55, lead: { w: 'sin', v: 0.2, glide: 1, vib: 1 }, bass: { w: 'soft', v: 0.24, p: 'funk' }, arp: { w: 'tri', v: 0.035, p: 'pad' },
    kit: 'funk', fill: 'funk',
    S: {
      A: { ch: 'Em7 Em7 A7 A7 Em7 Em7 Cmaj7 B7', mel: `b5:6 a5 g5 e5 .:4 | d5 e5 g5:4 e5:4 .:4 | c#6:6 b5 a5 g5 .:4 | e5 g5 a5:4 b5:6 . |
            e6:4 d6 b5:4 a5 g5:4 | a5 g5 e5:4 d5 e5:6 | g5:4 e5 b5:6 a5 g5 | f#5:6 d#5 f#5 a5 b5:4` },
      B: { ch: 'Am7 D7 Gmaj7 Cmaj7 Am7 D7 Em7 B7', mel: `c6:6 b5 a5:4 e5:4 | f#5:4 a5 c6:6 b5 a5 | b5:8 d6:4 b5:4 | e6:6 d6 b5 g5 e5:4 |
            a5 c6 e6:4 d6 c6 a5:4 | f#5 a5 d6:4 c6 a5 f#5:4 | g5:4 b5:4 e6:8 | d#6:4 b5:4 a5:4 f#5:4` },
    },
    order: ['A', 'B'],
  };
  T.world3 = { // DOWNTOWN — tense boom-bap groove in C minor, stabby riff + menacing hook
    bpm: 92, swing: 0.12, gain: 0.58, lead: { w: 'p12', v: 0.16 }, bass: { w: 'soft', v: 0.26, p: 'hip' }, arp: { w: 'p25', v: 0.04, p: 'stab' },
    kit: 'boombap', fill: 'std',
    S: {
      A: { ch: 'Cm Cm Ab G Cm Cm Fm G', mel: `c5 . eb5 . g5 f#5 g5 . | c5 . eb5 . g5:1 ab5:1 g5 f5 eb5 | c5 . eb5 . ab5 g5 ab5 . | b4 . d5 . g5 f5 d5 b4 |
            c6 . bb5 . g5 . eb5:4 | f5 eb5 d5 c5 .:4 g4:4 | ab5 . g5 . f5 . eb5 d5 | d5:4 b4:4 g4:4 .:4` },
      B: { ch: 'Ab Ab Fm Fm Cm Cm G G', mel: `eb6:4 c6 ab5 . c6 eb6:4 | d6:4 c6 bb5 ab5:4 .:4 | c6:4 ab5 f5 . ab5 c6:4 | bb5:4 ab5 g5 f5:4 .:4 |
            g5 g5 . g5 ab5 g5 eb5:4 | c5:4 d5 eb5 f5:4 .:4 | g5 . f5 . d5 . b4:4 | d5 f5 g5 b5 d6:4 .:4` },
    },
    order: ['A', 'B'],
  };
  T.world4 = { // HOLLYWOOD & THE WESTSIDE — glam disco, octave bass + string stabs
    bpm: 120, gain: 0.55, lead: { w: 'p25', v: 0.16, dbl: 7 }, bass: { w: 'soft', v: 0.22, p: 'oct' }, arp: { w: 'sq', v: 0.04, p: 'stab' },
    kit: 'disco', fill: 'std', crash: true,
    S: {
      A: { ch: 'Am7 D7 Am7 D7 Fmaj7 E7 Am7 E7', mel: `e5 a5 c6 e6:4 d6 c6 a5 | . f#5 a5 c6:4 a5 f#5:4 | e5 a5 c6 e6:4 g6 e6 d6 | c6:4 a5 f#5 d5:4 .:4 |
            a5 c6 e6:4 a5 c6 e6:4 | g#5 b5 d6:4 g#5 b5 e6:4 | c6:3 b5:3 a5 g5:3 a5:3 e5 | e5 g#5 b5 d6 e6:4 .:4` },
      B: { ch: 'Fmaj7 G Em7 Am7 Dm7 G Cmaj7 E7', mel: `c6:6 a5 f5 a5 c6:4 | d6:6 b5 g5 b5 d6:4 | e6:4 d6 b5 g5:4 b5:4 | c6:8 .:4 e5 g5 |
            a5:4 f5 d6:4 c6 a5:4 | b5:4 g5 d6:4 b5 g5:4 | e6 d6 c6 b5 g5 e5 g5 b5 | g#5:4 b5:4 e6:4 .:4` },
    },
    order: ['A', 'B', 'A'],
  };
  T.world5 = { // THE RECKONING — epic, driving D-minor march with a detuned lead
    bpm: 160, gain: 0.52, lead: { w: 'p25', v: 0.15, dbl: 10 }, bass: { w: 'soft', v: 0.2, p: 'epic' }, arp: { w: 'sq', v: 0.04, p: 'up16' },
    kit: 'march', fill: 'tom', crash: true,
    S: {
      A: { ch: 'Dm Dm Bb Bb C C Dm A', mel: `d5:4 a5:4 f5 e5 d5:4 | a5:4 d6:4 c6 a5 f5:4 | bb5:4 f5:4 d5 f5 bb5:4 | c6:4 d6:4 bb5 a5 f5:4 |
            g5:4 c6:4 e6 d6 c6:4 | g5:4 e5:4 c5 e5 g5:4 | a5:6 f5 d6:6 c6 | c#6:4 e6:4 a5:8` },
      B: { ch: 'Gm Dm Bb F Gm Dm Eb A', mel: `g5:6 bb5 d6:8 | f6:6 e6 d6:4 a5:4 | bb5:6 c6 d6:4 f6:4 | e6:4 c6:4 a5:4 c6:4 |
            d6:4 bb5 g5 d6:4 g6:4 | f6:4 d6 a5 f5:4 a5:4 | g5:4 bb5:4 eb6:4 g6:4 | e6:4 c#6:4 a5:4 e5:4` },
    },
    order: [{ s: 'A', arp: false }, 'B', 'A', 'B'],
  };
  T.boss = { // urgent E-minor 16th ostinato
    bpm: 176, gain: 0.52, lead: { w: 'p25', v: 0.15, dbl: 9 }, bass: { w: 'soft', v: 0.2, p: 'gallop' }, arp: { w: 'sq', v: 0.035, p: 'up16' },
    kit: 'boss', fill: 'std', crash: true,
    S: {
      A: { ch: 'Em Em C D Em Em C B', mel: `e5:1 e5:1 b5 e5:1 e5:1 bb5 e5:1 e5:1 a5 g5 f#5 | e5:1 e5:1 b5 e5:1 e5:1 c6 b5 a5 g5 a5 |
            e5:1 e5:1 c6 e5:1 e5:1 b5 e5:1 e5:1 a5 g5 e5 | d5:1 d5:1 a5 d5:1 d5:1 f#5 a5 d6 c6 a5 |
            g5 f#5 g5 b5 e6:4 d6 b5 | c6 b5 a5 g5 f#5 g5 a5 b5 | c6 e6 g6:4 f#6 e6 d6 c6 | b5 d#6 f#6:4 d#6 b5 a5 f#5` },
      B: { ch: 'Am Am Em Em C D B B', mel: `a5:4 c6:4 e6:4 c6:4 | d6 c6 b5 a5 g#5:4 a5:4 | b5:4 g5:4 e5:4 g5:4 | a5 g5 f#5 e5 d#5:4 e5:4 |
            e6:4 c6:4 g5:4 c6:4 | f#6:4 d6:4 a5:4 d6:4 | d#6 f#6 b6:4 a6 f#6 d#6:4 | b5:1 b5:1 b5:1 b5:1 d#6:1 d#6:1 d#6:1 d#6:1 f#6:1 f#6:1 f#6:1 f#6:1 a6:4` },
    },
    order: ['A', 'B', 'A', 'B'],
  };
  T.fullrun = { // driving medley: coast -> downtown -> hollywood -> reckoning, one relentless beat
    bpm: 156, gain: 0.52, lead: { w: 'p25', v: 0.15, dbl: 8 }, bass: { w: 'soft', v: 0.2, p: 'drive' }, arp: { w: 'sq', v: 0.035, p: 'up8' },
    kit: 'drive', fill: 'tom', crash: true,
    S: {},
    order: [{ from: 'world1.A' }, { from: 'world3.B' }, { from: 'world4.A' }, { from: 'world5.B' }],
  };
  T.results = { // short victory jingle (no loop)
    bpm: 140, loop: false, gain: 0.55, lead: { w: 'p25', v: 0.18 }, bass: { w: 'tri', v: 0.34, p: 'half' }, arp: { w: 'sq', v: 0.04, p: 'none' },
    kit: 'jingle', crash: true,
    S: { A: { ch: 'C F_G C', mel: `c5:1 e5:1 g5:1 c6:1 e5:1 g5:1 c6:1 e6:1 g5:1 c6:1 e6:1 g6:1 .:1 e6:1 g6 | a6:4 f6 a6 b6:4 g6 b6 | c7:12 .:4` } },
    order: ['A'],
  };
  T.gameover = { // sad-funny wobbly descent ending in a low honk (no loop)
    bpm: 100, loop: false, gain: 1.0, lead: { w: 'saw', v: 0.15, vib: 1 }, bass: { w: 'tri', v: 0.34, p: 'half' }, arp: { w: 'tri', v: 0.035, p: 'pad' },
    kit: 'none',
    S: { A: { ch: 'C Fm_G Cm', mel: `g5:4 f#5:4 f5:4 e5:4 | eb5:4 d5:4 . c5 g4 c5 | c4 . c4:8 .:4` } },
    order: ['A'],
  };
  T.credits = { // warm, triumphant G-major anthem with pads
    bpm: 112, gain: 0.55, lead: { w: 'p25', v: 0.15, dbl: 7 }, bass: { w: 'tri', v: 0.34, p: 'walk' }, arp: { w: 'tri', v: 0.04, p: 'up8' },
    kit: 'ballad', fill: 'tom', crash: true, pad: { w: 'tri', v: 0.025 },
    S: {
      A: { ch: 'G D Em C G D C_D G', mel: `d5:4 g5:4 b5:6 a5 | a5:8 f#5:4 d5:4 | e5:4 g5:4 b5:4 e6:4 | d6:6 c6 b5:4 g5:4 |
            b5:4 d6:4 g6:6 f#6 | e6:4 d6:4 a5:8 | c6:4 e6:4 d6:4 f#6:4 | g6:12 .:4` },
      B: { ch: 'C D Bm Em Am D G G', mel: `e6:6 d6 c6:4 g5:4 | f#6:6 e6 d6:4 a5:4 | d6:4 b5:4 f#5:4 b5:4 | g5:8 e5:4 g5:4 |
            c6:4 e6:4 a6:4 g6:4 | f#6:4 e6:4 d6:4 a5:4 | b5:4 d6:4 g6:8 | g6:4 d6:4 b5:4 d6:4` },
    },
    order: ['A', 'B', 'A'],
  };

  // ------------------------------------------------------------------ compiler
  function parseMel(str) {
    const out = [];
    for (const tok of str.replace(/\|/g, ' ').split(/\s+/)) {
      if (!tok) continue;
      const [n, d] = tok.split(':');
      out.push({ m: n === '.' ? null : dsp.midi(n), d: d ? +d : 2 });
    }
    return out;
  }
  function bassNote(c, ch, prevRoot) {
    let r = 36 + c.pc; while (r < 40) r += 12; while (r > 51) r -= 12;
    switch (ch) {
      case 'R': return r; case 'O': return r + 12; case '5': return r + 7; case 'L': return r - 5;
      case '3': return r + (c.iv[1] || 4); case '7': return r + (c.iv[3] || 10);
    }
    return null;
  }
  function chordTones(c) { let r = 60 + c.pc; if (r > 67) r -= 12; return c.iv.map((i) => r + i); }
  const compiled = {};
  function compile(id) {
    if (compiled[id]) return compiled[id];
    const tr = T[id];
    const secs = tr.order.map((o) => {
      if (typeof o === 'string') o = { s: o };
      if (o.from) { const [tid, sid] = o.from.split('.'); return Object.assign({}, T[tid].S[sid], o); }
      return Object.assign({}, tr.S[o.s], o);
    });
    let bars = 0; for (const s of secs) bars += s.ch.trim().split(/\s+/).length;
    const len = bars * 16, ev = new Array(len);
    const put = (i, e) => { if (i < 0 || i >= len) return; (ev[i] || (ev[i] = [])).push(e); };
    let bar0 = 0, warn = [];
    for (const sec of secs) {
      const chords = sec.ch.trim().split(/\s+/).map((tk) => tk.split('_').map(chord));
      const nb = chords.length, base = bar0 * 16;
      // lead
      let pos = 0;
      for (const n of parseMel(sec.mel)) { if (n.m != null && pos < nb * 16) put(base + pos, { k: 'L', m: n.m, d: Math.min(n.d, nb * 16 - pos) }); pos += n.d; }
      if (pos !== nb * 16) warn.push(id + ' section ' + (sec.s || sec.from) + ' melody ' + pos + '/' + nb * 16);
      const kit = KITS[sec.kit || tr.kit] || KITS.none, fill = FILLS[tr.fill];
      const bp = BASS[(tr.bass && tr.bass.p) || 'half'];
      const arpP = sec.arp === false ? 'none' : (tr.arp && tr.arp.p) || 'none';
      for (let b = 0; b < nb; b++) {
        const cb = chords[b], at = base + b * 16;
        const cAt = (s) => (cb.length > 1 && s >= 8 ? cb[1] : cb[0]);
        // bass
        for (let s = 0; s < 16; s++) {
          const chx = bp[s]; if (chx === '.' || chx === '-') continue;
          let d = 1; while (s + d < 16 && bp[s + d] === '-') d++;
          const m = bassNote(cAt(s), chx); if (m != null) put(at + s, { k: 'B', m, d });
        }
        // harmony
        for (let s = 0; s < 16; s++) {
          const tones = chordTones(cAt(s));
          if (arpP === 'up16') { const list = tones.concat(tones.map((t) => t + 12)); put(at + s, { k: 'A', m: list[s % list.length], d: 1 }); }
          else if (arpP === 'up8' && s % 2 === 0) { const list = tones.concat(tones.map((t) => t + 12)); put(at + s, { k: 'A', m: list[(s / 2) % list.length], d: 2 }); }
          else if (arpP === 'stab' && s % 4 === 2) for (const t of tones.slice(0, 3)) put(at + s, { k: 'A', m: t, d: 1 });
          else if (arpP === 'pad' && (s === 0 || (s === 8 && cb.length > 1))) for (const t of tones) put(at + s, { k: 'P', m: t, d: cb.length > 1 ? 8 : 16 });
          if (tr.pad && (s === 0 || (s === 8 && cb.length > 1))) for (const t of tones.slice(0, 3)) put(at + s, { k: 'P', m: t, d: cb.length > 1 ? 8 : 16 });
        }
        // drums (fill on the last bar of every 8-bar phrase)
        const k = fill && b % 8 === 7 && tr.loop !== false ? fill : kit;
        for (const inst in k) for (let s = 0; s < 16; s++) { const c = k[inst][s]; if (HITV[c]) put(at + s, { k: 'D', m: inst, v: DRUMVOL[inst] * HITV[c] }); }
        if (b === 0 && tr.crash) put(at, { k: 'D', m: 'x', v: DRUMVOL.x });
      }
      bar0 += nb;
    }
    // a final crash on non-looping jingles' last chord
    if (tr.loop === false && tr.crash) put(len - 16, { k: 'D', m: 'x', v: DRUMVOL.x });
    return (compiled[id] = { id, len, ev, bars, warn, loop: tr.loop !== false, tr });
  }

  // ------------------------------------------------------------------ per-context resources
  const res = new WeakMap(); // ctx -> { waves, drums }
  function resources(ac) {
    let r = res.get(ac); if (r) return r;
    r = { waves: {}, drums: {} };
    const mk = (fn) => { const re = new Float32Array(33), im = new Float32Array(33); for (let n = 1; n < 33; n++) fn(n, re, im); return ac.createPeriodicWave(re, im); };
    const pulse = (D) => (n, re, im) => { re[n] = 2 / (n * Math.PI) * Math.sin(2 * Math.PI * n * D); im[n] = 2 / (n * Math.PI) * (1 - Math.cos(2 * Math.PI * n * D)); };
    try {
      r.waves.p25 = mk(pulse(0.25)); r.waves.p12 = mk(pulse(0.125));
      r.waves.soft = mk((n, re, im) => { if (n <= 10) im[n] = (n % 2 ? 1 : -1) / Math.pow(n, 1.4); });
    } catch (e) {}
    const sr = ac.sampleRate, R = dsp.render, o = dsp.osc, nz = dsp.noise;
    const DR = {
      k: [0.3, (b) => { o(b, { d: 0.28, w: 'sin', f: 165, f2: 42, k: 1.6 }); nz(b, { d: 0.006, lp: 4000, v: 0.5 }); }, 0.9],
      s: [0.2, (b) => { nz(b, { d: 0.18, lp: 7000, hp: 400, k: 1.4 }); o(b, { d: 0.08, w: 'tri', f: 210, f2: 160, v: 0.6 }); }, 0.8],
      h: [0.05, (b) => nz(b, { d: 0.045, hp: 6500, k: 2 }), 0.6],
      o: [0.24, (b) => nz(b, { d: 0.22, hp: 5000, k: 1.3 }), 0.5],
      c: [0.2, (b) => { for (let i = 0; i < 3; i++) nz(b, { t: i * 0.012, d: 0.012, hp: 900, lp: 5000, k: 1 }); nz(b, { t: 0.036, d: 0.15, hp: 900, lp: 5000, k: 1.6, v: 0.7 }); }, 0.75],
      t: [0.24, (b) => { o(b, { d: 0.22, w: 'sin', f: 200, f2: 90, k: 1.4 }); nz(b, { d: 0.04, lp: 1500, v: 0.3 }); }, 0.8],
      x: [1.2, (b) => nz(b, { d: 1.15, hp: 3500, k: 1.1 }), 0.5],
    };
    for (const id in DR) {
      try {
        const d = R(sr, DR[id][0], DR[id][1], DR[id][2]);
        const ab = ac.createBuffer(1, d.length, sr);
        if (ab.copyToChannel) ab.copyToChannel(d, 0); else ab.getChannelData(0).set(d);
        r.drums[id] = ab;
      } catch (e) {}
    }
    res.set(ac, r);
    return r;
  }

  // ------------------------------------------------------------------ voices
  const counters = { live: 0, made: 0 };
  function done(nodes) { return function () { counters.live--; for (const n of nodes) { try { n.disconnect(); } catch (e) {} } this.onended = null; }; }
  const ENV = { L: [0.006, 0.08, 0.7, 0.03], B: [0.004, 0.06, 0.8, 0.02], A: [0.003, 0.04, 0.5, 0.02], P: [0.12, 0.2, 0.8, 0.15] };
  function tone(ac, dest, r, t, dur, f, wname, v, env, glideFrom, vib, dbl) {
    const o = ac.createOscillator(), g = ac.createGain(), nodes = [o, g];
    if (r.waves[wname]) o.setPeriodicWave(r.waves[wname]); else o.type = { sq: 'square', tri: 'triangle', saw: 'sawtooth', sin: 'sine' }[wname] || 'square';
    if (glideFrom && glideFrom !== f) { o.frequency.setValueAtTime(glideFrom, t); o.frequency.exponentialRampToValueAtTime(f, t + Math.min(0.07, dur * 0.5)); }
    else o.frequency.setValueAtTime(f, t);
    const a = Math.min(env[0], dur * 0.3), d = Math.min(env[1], dur * 0.4), rel = Math.min(env[3], dur * 0.3), sus = v * env[2];
    const gp = g.gain;
    gp.setValueAtTime(0, t); gp.linearRampToValueAtTime(v, t + a); gp.linearRampToValueAtTime(sus, t + a + d);
    gp.setValueAtTime(sus, Math.max(t + a + d, t + dur - rel)); gp.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(dest);
    const end = t + dur + 0.02;
    o.start(t); o.stop(end);
    if (vib && dur > 0.2) { // slow-onset vibrato
      const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = 5.5;
      lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(22, t + Math.min(0.25, dur));
      l.connect(lg); lg.connect(o.detune); l.start(t); l.stop(end); nodes.push(l, lg);
    }
    if (dbl) { // detuned double for a fat lead
      const o2 = ac.createOscillator();
      if (r.waves[wname]) o2.setPeriodicWave(r.waves[wname]); else o2.type = o.type;
      o2.frequency.setValueAtTime(f, t); o2.detune.value = dbl; o2.connect(g); o2.start(t); o2.stop(end); nodes.push(o2);
    }
    counters.live++; counters.made++;
    o.onended = done(nodes);
  }
  function drum(ac, dest, r, t, id, v) {
    const b = r.drums[id]; if (!b) return;
    const s = ac.createBufferSource(), g = ac.createGain();
    s.buffer = b; g.gain.value = v; s.connect(g); g.connect(dest); s.start(t);
    counters.live++; counters.made++;
    s.onended = done([s, g]);
  }

  // ------------------------------------------------------------------ sequencer
  function Seq(ac, dest, id, opts) {
    this.ac = ac; this.c = compile(id); this.id = id; this.res = resources(ac);
    const tr = this.c.tr; opts = opts || {};
    let rate = typeof opts.rate === 'number' && opts.rate > 0.3 && opts.rate < 3 ? opts.rate : 1;
    this.trans = typeof opts.transpose === 'number' ? opts.transpose | 0 : 0;
    const bossName = opts.boss && String(opts.boss.name || opts.boss.id || opts.boss);
    if (id === 'boss' && bossName && /newscum|reckon|final|gov/i.test(bossName)) { rate *= 1.06; this.trans += 1; } // final boss: hotter
    this.spb = 60 / (tr.bpm * rate) / 4; this.swing = (tr.swing || 0) * this.spb;
    this.gain = ac.createGain(); this.gain.gain.value = 0; this.gain.connect(dest);
    this.level = tr.gain || 0.55;
    this.step = 0; this.t = 0; this.done = false; this.stopAt = Infinity; this.endT = Infinity;
    this.lastLead = 0; this.offline = !!opts.offline;
  }
  Seq.prototype.play = function (i, t) {
    const evs = this.c.ev[i]; if (!evs) return;
    if (!this.offline && core.muted()) return;             // muted: keep time, make no nodes
    const tr = this.c.tr, ac = this.ac, g = this.gain, r = this.res, spb = this.spb;
    if (i & 1) t += this.swing;
    for (let j = 0; j < evs.length; j++) {
      const e = evs[j];
      if (e.k === 'D') { drum(ac, g, r, t, e.m, e.v); continue; }
      const f = hz(e.m + this.trans);
      if (e.k === 'L') {
        const L = tr.lead; tone(ac, g, r, t, e.d * spb * 0.92, f, L.w, L.v, ENV.L, L.glide ? this.lastLead : 0, L.vib, L.dbl); this.lastLead = f;
      } else if (e.k === 'B') tone(ac, g, r, t, e.d * spb * 0.9, f, tr.bass.w, tr.bass.v, ENV.B);
      else if (e.k === 'A') tone(ac, g, r, t, e.d * spb * 0.8, f, tr.arp.w, tr.arp.v, ENV.A);
      else if (e.k === 'P') { const P = tr.pad || tr.arp; tone(ac, g, r, t, e.d * spb, f, P.w, P.v, ENV.P); }
    }
  };
  Seq.prototype.advance = function () {
    this.t += this.spb; this.step++;
    if (this.step >= this.c.len) { if (this.c.loop) this.step = 0; else { this.done = true; this.endT = this.t + 2.5; } }
  };
  Seq.prototype.pump = function (until) {
    until = Math.min(until, this.stopAt);
    let guard = 4096;
    while (!this.done && this.t < until && guard--) { this.play(this.step, this.t); this.advance(); }
  };
  Seq.prototype.catchUp = function (now) { let guard = 4096; while (!this.done && this.t < now && guard--) this.advance(); };
  Seq.prototype.fadeIn = function (now, dur) {
    const p = this.gain.gain; p.cancelScheduledValues(now); p.setValueAtTime(0, now); p.linearRampToValueAtTime(this.level, now + Math.max(0.02, dur));
  };
  Seq.prototype.fadeOut = function (now, dur) {
    dur = Math.max(0.02, dur);
    const p = this.gain.gain; p.cancelScheduledValues(now); p.setValueAtTime(p.value, now); p.linearRampToValueAtTime(0, now + dur);
    this.stopAt = Math.min(this.stopAt, now + dur); this.endT = Math.min(this.endT, now + dur + 0.1);
  };

  const live = [];
  let timer = 0, cur = null, curId = null, want = null;
  function pumpAll() {
    const ac = core.ctx;
    if (!ac) return;
    const now = ac.currentTime;
    for (let i = live.length - 1; i >= 0; i--) {
      const s = live[i];
      if (s.t < now - 0.02 && s.stopAt === Infinity) s.catchUp(now + 0.02);   // main thread stalled: skip, stay in time
      s.pump(now + AHEAD);
      if (now > s.endT) { try { s.gain.disconnect(); } catch (e) {} live.splice(i, 1); if (s === cur) cur = null; }
    }
    if (!live.length && timer) { clearInterval(timer); timer = 0; }
  }
  function start(id, opts) {
    const ac = core.ctx; if (!ac) return;
    const now = ac.currentTime;
    const fade = typeof opts.fade === 'number' ? opts.fade : XFADE;
    if (cur) cur.fadeOut(now, fade);
    const s = new Seq(ac, core.musicBus, id, opts);
    s.t = now + 0.06; s.fadeIn(now, cur ? fade : 0.05);
    live.push(s); cur = s;
    if (!timer) timer = setInterval(pumpAll, TICK_MS);
    pumpAll();
  }
  function music(id, opts) {
    try {
      if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(T, id)) return;   // unknown: no-op
      opts = opts || {};
      if (id === curId && !opts.restart) return;                                               // already playing (or queued)
      curId = id;
      if (!core.running()) { want = { id, opts }; return; }
      want = null; start(id, opts);
    } catch (e) {}
  }
  function stopMusic(fade) {
    try {
      want = null; curId = null;
      const ac = core.ctx;
      if (cur && ac) cur.fadeOut(ac.currentTime, typeof fade === 'number' ? fade : 0.5);
      cur = null;
    } catch (e) {}
  }
  core.onRunning(() => { if (want) { const w = want; want = null; try { start(w.id, w.opts); } catch (e) {} } });

  // offline render for tests: returns Promise<AudioBuffer> of `secs` seconds of track `id`
  function renderOffline(id, secs, sr) {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC || !T[id]) return Promise.resolve(null);
    sr = sr || 44100; secs = secs || 8;
    const off = new OAC(1, Math.ceil(sr * secs), sr);
    const s = new Seq(off, off.destination, id, { offline: true });
    s.gain.gain.value = s.level; s.t = 0; s.pump(secs);
    return off.startRendering();
  }

  A.music = music;
  A.stopMusic = stopMusic;
  A.tracks = () => Object.keys(T);
  A.currentMusic = () => curId;
  A._music = { T, compile, renderOffline, counters, live: () => live.length, KITS, BASS };
})();
