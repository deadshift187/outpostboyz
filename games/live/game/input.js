// Streamer controls: keyboard + Gamepad API (standard mapping).
//   Run A/D or arrows / left stick or d-pad     Jump Space / A (hold = full height)
//   Dash Shift / X        Brace S or Down / LT (hold)      Climb ladders W or Up / stick up
//   Grapple E / RB        Pause P / Start      PANIC F9 / Select+Start      Settings F10
//   Music mute M      Key help F1      (in settings: R resets the selected knob)
// createInput({ streamerKeys: false }) (web edition): F1/F9/F10 and Select+Start PANIC are unbound
// (Start alone pauses). Headless (Node) gets a manual input you drive with set() (tests / soak bot).

const KEYS = {
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
  jump: ['Space'], dash: ['ShiftLeft', 'ShiftRight'], grapple: ['KeyE'], pause: ['KeyP'], panic: ['F9'], settings: ['F10'],
  mute: ['KeyM'], esc: ['Escape'], enter: ['Enter'], help: ['F1'], reset: ['KeyR'],
};
const NAMES = Object.keys(KEYS);

export function createInput({ streamerKeys = true } = {}) {
  const keys = streamerKeys ? KEYS : { ...KEYS, panic: [], settings: [], help: [] };
  const grab = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].concat(streamerKeys ? ['F1', 'F9', 'F10'] : []);
  const held = Object.fromEntries(NAMES.map((n) => [n, false]));
  const prev = { ...held };
  let manual = null, activity = false, padActivity = false;
  const hasDom = typeof window !== 'undefined' && typeof window.addEventListener === 'function';
  const keyHeld = new Set();
  if (hasDom) {
    window.addEventListener('keydown', (e) => {
      keyHeld.add(e.code); activity = true;
      if (grab.includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => keyHeld.delete(e.code));
    window.addEventListener('blur', () => keyHeld.clear());
    window.addEventListener('pointerdown', () => { activity = true; });
  }

  function readPads() {
    const out = {};
    if (!hasDom || !navigator.getGamepads) return out;
    let pads; try { pads = navigator.getGamepads(); } catch (e) { return out; }
    for (const p of pads || []) {
      if (!p || !p.connected) continue;
      const b = (i) => !!(p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.4));
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      const o = {
        left: ax < -0.35 || b(14), right: ax > 0.35 || b(15), up: ay < -0.5 || b(12), down: b(6) || b(13),
        jump: b(0), dash: b(2) || b(7), grapple: b(5) || b(3), start: b(9), select: b(8),
      };
      for (const [k, v] of Object.entries(o)) out[k] = out[k] || v;
      if (Object.values(o).some(Boolean)) padActivity = true;
    }
    return out;
  }

  /** Call once per frame. Returns held flags + *Pressed edges. */
  function poll() {
    const s = {};
    if (manual) Object.assign(s, manual);
    else {
      const pad = readPads();
      for (const n of NAMES) s[n] = keys[n].some((k) => keyHeld.has(k)) || !!pad[n];
      // Select+Start = PANIC, Start alone = pause
      if (pad.start && pad.select && streamerKeys) s.panic = true; else if (pad.start) s.pause = true;
    }
    const r = { any: activity || padActivity || NAMES.some((n) => s[n]), pad: padActivity };
    for (const n of NAMES) { r[n] = !!s[n]; r[n + 'Pressed'] = !!s[n] && !prev[n]; prev[n] = !!s[n]; }
    activity = false; padActivity = false;
    return r;
  }

  return {
    poll,
    /** Tests/bot: drive input directly ({left,right,up,down,jump,dash,grapple,pause,panic,...}); set(null) = back to devices. */
    set(state) { manual = state ? { ...state } : null; },
    get manual() { return manual; },
  };
}
