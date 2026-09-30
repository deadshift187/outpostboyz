// Sound hook. Stubbed with WebAudio beeps; replace play() bodies with real
// samples later (e.g. new Audio('/assets/whale.mp3')) without touching callers.
const PATTERNS = {
  like: [[1320, 0.04]],
  gift: [[660, 0.07], [990, 0.09]],
  helper: [[523, 0.07], [784, 0.1]],
  sabotage: [[180, 0.12, 'sawtooth'], [120, 0.18, 'sawtooth']],
  whale: [[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.25]],
  follow: [[880, 0.08], [1175, 0.12]],
  comment: [[1500, 0.02]],
  land: [[300, 0.03, 'triangle']],
};

export function createSound({ muted = false, volume = 0.15 } = {}) {
  let ctx = null;
  let lastLike = 0;
  const ensure = () => {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  };
  // Browsers need a gesture before audio; OBS browser sources usually allow autoplay.
  // The context is created lazily on the first real sound (games that synth their own audio
  // never pay for it); a gesture only resumes an existing one, keeping key handlers cheap.
  if (typeof window !== 'undefined') ['pointerdown', 'keydown'].forEach((e) => window.addEventListener(e, () => { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); }, { once: true }));

  function play(name) {
    if (muted || !name || !PATTERNS[name]) return;
    const now = performance.now();
    if (name === 'like') { if (now - lastLike < 90) return; lastLike = now; }
    const ac = ensure();
    if (!ac) return;
    let t = ac.currentTime;
    for (const [freq, dur, type = 'square'] of PATTERNS[name]) {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(volume, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ac.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
      t += dur;
    }
  }
  return { play, setMuted: (m) => (muted = m) };
}
