// TIGHTROPE streamer controls: keyboard + Gamepad API (standard mapping).
//   Lean      A/D or ←/→            left stick X (analog) · d-pad ←/→
//   Walk      W or ↑ (forward)      RT (analog) · stick up · d-pad ↑
//   Back up   S or ↓                LT · stick down · d-pad ↓
//   Crouch    Space or Shift (hold) A or LB (hold)       grips the rope (limited grip)
//   Pause P / Start   PANIC F9 / Select+Start   Settings F10   Key help F1   Music M
// createInput({ streamerKeys:false }) unbinds F1/F9/F10 and Select+Start PANIC.
// Headless (Node): drive it with set({lean, fwd, back, crouch, ...}).

const KEYS = {
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
  crouch: ['Space', 'ShiftLeft', 'ShiftRight'], pause: ['KeyP'], panic: ['F9'], settings: ['F10'],
  mute: ['KeyM'], esc: ['Escape'], enter: ['Enter'], help: ['F1'], reset: ['KeyR'],
};
const NAMES = Object.keys(KEYS);

export function createInput({ streamerKeys = true } = {}) {
  const keys = streamerKeys ? KEYS : { ...KEYS, panic: [], settings: [], help: [] };
  const grab = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].concat(streamerKeys ? ['F1', 'F9', 'F10'] : []);
  const prev = Object.fromEntries(NAMES.map((n) => [n, false]));
  let manual = null, activity = false, padActivity = false;
  const hasDom = typeof window !== 'undefined' && typeof window.addEventListener === 'function';
  const keyHeld = new Set();
  if (hasDom) {
    window.addEventListener('keydown', (e) => { keyHeld.add(e.code); activity = true; if (grab.includes(e.code)) e.preventDefault(); });
    window.addEventListener('keyup', (e) => keyHeld.delete(e.code));
    window.addEventListener('blur', () => keyHeld.clear());
    window.addEventListener('pointerdown', () => { activity = true; });
  }
  function readPad() {
    const o = { lean: 0, analog: false, fwd: 0, back: 0 };
    if (!hasDom || !navigator.getGamepads) return o;
    let pads; try { pads = navigator.getGamepads(); } catch (e) { return o; }
    for (const p of pads || []) {
      if (!p || !p.connected) continue;
      const bv = (i) => (p.buttons[i] ? (p.buttons[i].pressed ? Math.max(0.999, p.buttons[i].value || 0) : p.buttons[i].value || 0) : 0);
      const b = (i) => bv(i) > 0.4;
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      const dz = (v, z) => (Math.abs(v) < z ? 0 : (v - Math.sign(v) * z) / (1 - z));
      const lean = b(14) ? -1 : b(15) ? 1 : dz(ax, 0.12);
      if (lean) { o.lean = lean; o.analog = !(b(14) || b(15)); }
      o.fwd = Math.max(o.fwd, bv(7) > 0.08 ? bv(7) : 0, b(12) ? 1 : 0, ay < -0.35 ? Math.min(1, dz(-ay, 0.35) * 1.4) : 0);
      o.back = Math.max(o.back, b(6) ? 1 : 0, b(13) ? 1 : 0, ay > 0.5 ? 1 : 0);
      o.crouch = o.crouch || b(0) || b(4);
      o.start = o.start || b(9); o.select = o.select || b(8);
      o.left = o.left || ax < -0.5 || b(14); o.right = o.right || ax > 0.5 || b(15); o.up = o.up || ay < -0.5 || b(12); o.down = o.down || ay > 0.5 || b(13);
      if (lean || o.fwd || o.back || o.crouch || o.start || o.select) padActivity = true;
    }
    return o;
  }
  /** Once per frame: held flags + *Pressed edges + analog lean/fwd/back. */
  function poll() {
    const s = {};
    let lean = 0, analog = false, fwd = 0, back = 0;
    if (manual) {
      Object.assign(s, manual);
      lean = Number(manual.lean) || ((manual.right ? 1 : 0) - (manual.left ? 1 : 0)); analog = !!manual.leanAnalog;
      fwd = manual.fwd != null ? Number(manual.fwd) : manual.up ? 1 : 0; back = manual.back != null ? Number(manual.back) : manual.down ? 1 : 0;
    } else {
      const pad = readPad();
      for (const n of NAMES) s[n] = keys[n].some((k) => keyHeld.has(k)) || !!pad[n];
      if (pad.start && pad.select && streamerKeys) s.panic = true; else if (pad.start) s.pause = true;
      const kl = (keys.right.some((k) => keyHeld.has(k)) ? 1 : 0) - (keys.left.some((k) => keyHeld.has(k)) ? 1 : 0);
      lean = kl || pad.lean; analog = !kl && pad.analog;
      fwd = Math.max(keys.up.some((k) => keyHeld.has(k)) ? 1 : 0, pad.fwd);
      back = Math.max(keys.down.some((k) => keyHeld.has(k)) ? 1 : 0, pad.back);
    }
    const r = { any: activity || padActivity || NAMES.some((n) => s[n]) || !!lean || fwd > 0 || back > 0, pad: padActivity, lean, leanAnalog: analog, fwd, back };
    for (const n of NAMES) { r[n] = !!s[n]; r[n + 'Pressed'] = !!s[n] && !prev[n]; prev[n] = !!s[n]; }
    activity = false; padActivity = false;
    return r;
  }
  return { poll, set(state) { manual = state ? { ...state } : null; }, get manual() { return manual; } };
}
