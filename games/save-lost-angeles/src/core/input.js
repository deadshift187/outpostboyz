// Input for up to 2 players: keyboard, the arcade cabinet's Ultimarc I-PAC 2 (a keyboard encoder),
// any USB/Bluetooth gamepads, and a touch pad on phones.
//
// I-PAC 2 factory mapping (what the cabinet sends):
//   P1: stick = arrows | B1 LCtrl  B2 LAlt  B3 Space  B4 LShift  B5 Z  B6 X | START 1  COIN 5
//   P2: stick = R/F/D/G (up/down/left/right) | B1 A  B2 S  B3 Q  B4 W  B5 I  B6 K | START 2  COIN 6
// Actions: JUMP = B3/B5 (Space,Z / Q,I) + stick-up. FIRE = B1/B6 (Ctrl,X / A,K). SPRINT = B4 (Shift / W).
// Desktop players also get WASD for P1 — until a P2-only key is pressed, then those keys belong to P2.
// Exit combo on the cabinet: START + COIN held together (handled by the kiosk + pause menu).
(function () {
  'use strict';
  const LA = window.LA;
  const blank = () => ({ left: 0, right: 0, up: 0, down: 0, jump: 0, fire: 0, sprint: 0, start: 0, coin: 0, axis: 0,
    jumpP: 0, fireP: 0, startP: 0, coinP: 0, upP: 0, downP: 0, leftP: 0, rightP: 0, any: 0, source: null });
  const input = LA.input = { p: [blank(), blank()], keys: {}, p2keyboard: false, touch: { active: false, axis: 0, jump: 0, fire: 0 }, padOf: [-1, -1], lastDevice: 'keyboard' };

  const P1 = { left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'],
    jump: ['Space', 'KeyZ'], fire: ['ControlLeft', 'ControlRight', 'KeyX', 'KeyJ', 'KeyF'], sprint: ['ShiftLeft', 'ShiftRight'],
    start: ['Enter', 'Digit1', 'NumpadEnter', 'Escape', 'KeyP'], coin: ['Digit5'] };
  const P1_WASD = { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'] };
  const P2 = { left: ['KeyD'], right: ['KeyG'], up: ['KeyR'], down: ['KeyF'],
    jump: ['KeyQ', 'KeyI'], fire: ['KeyA', 'KeyK'], sprint: ['KeyW'], start: ['Digit2'], coin: ['Digit6'] };
  // Only P2's START/COIN hand the shared keys (A/D/W/S) to player 2. It used to flip on any P2 key, so one stray
  // K mid-level stole P1's WASD movement (Saint, 9/29).
  const P2_ONLY = new Set(['Digit2', 'Digit6']);

  addEventListener('keydown', (e) => {
    if (!input.keys[e.code] && P2_ONLY.has(e.code)) input.p2keyboard = true;
    input.keys[e.code] = true; input.lastDevice = 'keyboard';
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', (e) => { input.keys[e.code] = false; });
  addEventListener('blur', () => { input.keys = {}; });

  const down = (codes) => codes.some((c) => input.keys[c]);

  function readKeyboard(i) {
    const m = i === 0 ? P1 : P2, s = blank();
    if (i === 1 && !input.p2keyboard) return s;
    for (const a of ['left', 'right', 'up', 'down', 'jump', 'fire', 'sprint', 'start', 'coin']) s[a] = down(m[a]) ? 1 : 0;
    if (i === 0 && !input.p2keyboard) for (const a in P1_WASD) if (down(P1_WASD[a])) s[a] = 1;
    s.axis = s.right - s.left;
    return s;
  }

  // Standard-mapping gamepad (Xbox/PlayStation/generic). A=jump, X/RT/RB/Y=fire, LB/LT=sprint, Start/Select.
  function readPad(gp) {
    const s = blank(), b = (n) => !!(gp.buttons[n] && gp.buttons[n].pressed);
    const sx = gp.axes[0] || 0, sy = gp.axes[1] || 0;
    s.axis = Math.abs(sx) > 0.5 ? Math.sign(sx) : (Math.abs(sx) > 0.18 ? sx : 0);      // firm push = full run (his fix)
    s.left = (b(14) || sx < -0.5) ? 1 : 0; s.right = (b(15) || sx > 0.5) ? 1 : 0;
    s.up = (b(12) || sy < -0.6) ? 1 : 0; s.down = (b(13) || sy > 0.6) ? 1 : 0;
    if (b(14)) s.axis = -1; if (b(15)) s.axis = 1;
    s.jump = b(0) ? 1 : 0; s.fire = (b(2) || b(3) || b(5) || b(7)) ? 1 : 0; s.sprint = (b(4) || b(6)) ? 1 : 0;
    s.start = b(9) ? 1 : 0; s.coin = b(8) ? 1 : 0;
    return s;
  }

  const prev = [blank(), blank()];
  // Called once per simulation tick. Merges every source into input.p[0..1] and computes edge presses.
  input.poll = function () {
    const pads = (navigator.getGamepads ? Array.from(navigator.getGamepads()) : []).filter(Boolean);
    // assign pads to slots: first pad -> P1 unless P1 is clearly on the keyboard, then P2
    const live = pads.map((g) => g.index);
    input.padOf = input.padOf.map((ix) => (live.includes(ix) ? ix : -1));
    for (const g of pads) {
      if (input.padOf.includes(g.index)) continue;
      const pressed = g.buttons.some((bt) => bt.pressed) || Math.abs(g.axes[0] || 0) > 0.5;
      if (!pressed) continue;
      const slot = input.padOf[0] === -1 && !(input.lastDevice === 'keyboard' && input.p[0].any) ? 0 : (input.padOf[1] === -1 ? 1 : -1);
      if (slot >= 0) input.padOf[slot] = g.index;
    }
    for (let i = 0; i < 2; i++) {
      const s = readKeyboard(i);
      const gp = pads.find((g) => g.index === input.padOf[i]);
      if (gp) { const q = readPad(gp); for (const a in q) if (a !== 'axis' && q[a]) s[a] = 1; if (q.axis) s.axis = q.axis; if (q.jump || q.fire || q.axis) input.lastDevice = 'pad'; }
      if (i === 0 && input.touch.active) { if (input.touch.axis) { s.axis = input.touch.axis; s.left = s.axis < -0.3 ? 1 : 0; s.right = s.axis > 0.3 ? 1 : 0; } if (input.touch.jump) s.jump = 1; if (input.touch.fire) s.fire = 1; if (input.touch.up) s.up = 1; }
      if (!s.axis) s.axis = s.right - s.left;
      if (s.up && !s.jump) s.jumpUp = 1;                                  // stick-up also jumps (his engine: ArrowUp/W jump)
      const p = prev[i];
      s.jumpP = (s.jump || s.jumpUp) && !(p.jump || p.jumpUp) ? 1 : 0; s.fireP = s.fire && !p.fire ? 1 : 0;
      s.btnJumpP = s.jump && !p.jump ? 1 : 0;                           // button only (menus must not confirm on stick-up)
      s.startP = s.start && !p.start ? 1 : 0; s.coinP = s.coin && !p.coin ? 1 : 0;
      s.upP = s.up && !p.up ? 1 : 0; s.downP = s.down && !p.down ? 1 : 0; s.leftP = s.left && !p.left ? 1 : 0; s.rightP = s.right && !p.right ? 1 : 0;
      s.any = s.left || s.right || s.up || s.down || s.jump || s.fire || s.start ? 1 : 0;
      s.jumpHeld = s.jump || s.jumpUp;
      input.p[i] = s; prev[i] = Object.assign({}, s);
    }
  };
  // menus: "any player pressed confirm/back/direction this tick"
  input.menu = () => {
    const a = input.p[0], b = input.p[1];
    const bs = !!input.keys.Backspace, bsP = bs && !input._bsPrev; input._bsPrev = bs;
    return { ok: a.btnJumpP || a.startP || a.fireP || b.btnJumpP || b.startP || b.fireP, back: (a.coinP || b.coinP) || (bsP ? 1 : 0),
      up: a.upP || b.upP, down: a.downP || b.downP, left: a.leftP || b.leftP, right: a.rightP || b.rightP, start: a.startP || b.startP };
  };
  input.p2Wants = () => input.p[1].startP || input.p[1].jumpP;              // drop-in: P2 presses START (or jump)
  input.exitCombo = () => (input.keys.Digit1 && input.keys.Digit5) || (input.keys.Digit2 && input.keys.Digit6);
})();
