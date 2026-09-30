// PATCH on the rope: walking, the balance model and the fall / catch / lift sequences.
// Balance is an inverted pendulum, fully deterministic (fixed-step integration, no noise):
//   omega' = K*sin(theta) + ext + A*u - C*omega,   theta' = omega
// With no disturbance and no input, a centred PATCH stays exactly centred. Everything that
// pushes him is visible: foot-fall kicks while walking, breeze zones (flags), and viewer effects.
import { BAL, FALL_G, FALL_VMAX, clamp } from './consts.js';
import { ropeAt, loadSag, breezeAt, STREET_AWNINGS, TRASH_Y } from './world.js';

export function newWalker() {
  return {
    span: 0, s: 0, v: 0, theta: 0, omega: 0, u: 0, crouch: false, grip: BAL.GRIP_MAX, gripLock: false,
    stepAcc: 0, stepSign: 1, walkAnim: 0, phase: 'walk', pt: 0, x: 0, y: 0, face: 1,
    fall: null, lift: null, clutchArm: -99, lastTheta: 0,
  };
}

/** Place PATCH on the rope (or on its current anchor ledge). */
export function placeOnRope(S) {
  const P = S.P, sp = S.world.spans[P.span], r = ropeAt(sp, P.s);
  P.x = r.x; P.y = r.y - loadSag(sp, P.s); P.face = sp.dirX; P.slope = r.slope; P.ang = r.ang;
}

/** Scaled external torque this frame (crouch, buffs, the SAB PUSH CAP). Also returns blame shares. */
export function externalTorque(S, list) {
  const P = S.P, B = S.buff;
  const crouchF = P.crouch ? BAL.CROUCH_EXT * (B.chalk && B.chalk.t > 0 ? 0.75 : 1) : 1;
  const calm = B.calm && B.calm.t > 0, spot = B.spotter && B.spotter.t > 0 ? 0.5 : 1, pole = (B.pole && B.pole.t > 0 ? 0.8 : 1) * (B.guide && B.guide.t > 0 ? 0.6 : 1);
  let raw = 0;
  const parts = [];
  for (const e of list) {
    if (calm && e.wind) continue;
    const tau = e.tau * crouchF * spot * pole;
    raw += tau; parts.push({ tau, src: e.src });
  }
  const cap = S.knob.torqueCap * BAL.A;
  const k = Math.abs(raw) > cap ? cap / Math.abs(raw) : 1;
  return { ext: raw * k, parts, k, raw };
}

export function kFactor(S) {
  const P = S.P, B = S.buff, sp = S.world.spans[P.span];
  let K = BAL.K * S.knob.wobble * (1 + 0.06 * S.world.level) * (1 + BAL.SLOPE_K * Math.abs(P.slope || 0)) * (sp.kind === 'cable' ? 0.92 : 1.05);
  if (B.pole && B.pole.t > 0) K *= 0.65;
  if (B.guide && B.guide.t > 0) K *= 0.6;
  if (P.crouch) K *= BAL.CROUCH_K;
  return K;
}

/**
 * Walk + balance for one frame. inp = {lean -1..1, leanAnalog, fwd 0..1, back 0..1, crouch}.
 * Returns null, or {fell:true} when PATCH tips past the fall angle.
 */
export function updateWalk(S, inp, dt, extInfo) {
  const P = S.P, sp = S.world.spans[P.span], B = S.buff;
  // crouch = grip the rope (limited by grip stamina)
  const want = !!inp.crouch;
  if (!want) P.gripLock = false;
  const drain = BAL.GRIP_DRAIN * (B.chalk && B.chalk.t > 0 ? 0.5 : 1);
  if (want && !P.gripLock && P.grip > 0) { P.crouch = true; P.grip = Math.max(0, P.grip - drain * dt); if (P.grip <= 0) { P.gripLock = true; S.emit('gripGone'); } }
  else { P.crouch = false; P.grip = Math.min(BAL.GRIP_MAX, P.grip + BAL.GRIP_REFILL * dt); }
  // lean input: analog = direct, keyboard = ramped
  const target = clamp(Number(inp.lean) || 0, -1, 1);
  if (inp.leanAnalog) P.u = target;
  else { const d = target - P.u, m = BAL.LEAN_RAMP * dt; P.u += clamp(d, -m, m); }
  // walking along the rope
  const speed = P.crouch ? BAL.CRAWL : 1;
  const tv = (inp.fwd || 0) * (P.crouch ? BAL.CRAWL : BAL.WALK) - (inp.back || 0) * (P.crouch ? BAL.CRAWL : BAL.BACK);
  const dv = tv - P.v, am = BAL.WALK_ACC * dt;
  P.v += clamp(dv, -am, am);
  if (P.s <= 0 && P.v < 0) P.v = 0;
  const prevS = P.s;
  P.s = Math.max(0, P.s + P.v * dt);
  P.walkAnim += Math.abs(P.v) * dt * (speed < 1 ? 1.5 : 2.4);
  placeOnRope(S);
  const safe = P.s < BAL.SAFE_END || P.s > sp.len - BAL.SAFE_END;
  if (safe) { // standing on (or stepping off) an anchor ledge: solid footing
    P.theta *= Math.exp(-5 * dt); P.omega *= Math.exp(-6 * dt);
    if (prevS < BAL.SAFE_END && P.s >= BAL.SAFE_END) { P.omega += 0.04 * (P.stepSign = -P.stepSign); S.emit('sfx', 'creak'); }
  } else {
    // foot-falls: alternating fixed kick every STEP_EVERY metres
    P.stepAcc += Math.abs(P.s - prevS);
    if (P.stepAcc >= BAL.STEP_EVERY) { P.stepAcc -= BAL.STEP_EVERY; P.stepSign = -P.stepSign; P.omega += P.stepSign * BAL.STEP_KICK * (P.crouch ? 0.3 : 1) * Math.min(1, Math.abs(P.v) / BAL.WALK + 0.3); S.emit('step'); }
    const breeze = breezeAt(sp, P.s) * (B.calm && B.calm.t > 0 ? 0 : 1) * (P.crouch ? BAL.CROUCH_EXT : 1);
    const K = kFactor(S);
    const C = BAL.C + (B.pole && B.pole.t > 0 ? 0.8 : 0) + (B.steady && B.steady.t > 0 ? 2.0 : 0) + (B.spotter && B.spotter.t > 0 ? 0.6 : 0);
    const ext = extInfo.ext + breeze;
    const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
    for (let i = 0; i < n; i++) {
      const acc = K * Math.sin(P.theta) + ext + BAL.A * P.u - C * P.omega;
      P.omega += acc * h;
      P.theta += P.omega * h;
    }
    P.breeze = breeze; P.ext = ext;
    const lim = P.crouch ? BAL.FALL_CROUCH : BAL.FALL;
    // near-miss: tipped past 0.72 and pulled it back
    if (Math.abs(P.theta) > 0.72) P.clutchArm = S.t;
    else if (Math.abs(P.theta) < 0.2 && S.t - P.clutchArm < 2.5) { P.clutchArm = -99; S.emit('clutch', { kind: 'lean' }); }
    if (Math.abs(P.theta) > lim) return { fell: true, dir: Math.sign(P.theta) };
  }
  return { prevS };
}

// ---------------- the fall ----------------
/** Start a fall. how: 'plunge' | 'harness' | 'net'. */
export function startFall(S, how, dir, cause) {
  const P = S.P;
  P.fall = { how, dir: dir || 1, fromY: P.y, x: P.x, y: P.y, vy: 0, vx: (dir || 1) * 1.2, t: 0, rot: P.theta, bounced: new Set(), torn: 0, cause, peak: 0, hits: [] };
  P.phase = 'tip'; P.pt = 0; P.v = 0; P.crouch = false;
}

/** Advance the plunge. Returns 'landed' when PATCH hits the trash pile. */
export function stepPlunge(S, dt) {
  const P = S.P, F = P.fall;
  F.t += dt;
  const py = F.y;
  F.vy = Math.max(-FALL_VMAX, F.vy - FALL_G * dt);
  F.vx *= Math.exp(-0.8 * dt);
  F.x = clamp(F.x + F.vx * dt, 2.7, 12.7);
  F.y += F.vy * dt;
  F.rot += dt * 7 * F.dir;
  // banners strung across the canyon: rip through, lose speed
  for (const b of S.world.banners) {
    if (F.vy < 0 && py > b.y && F.y <= b.y) { b.torn = true; b.tearT = 0.6; F.vy *= 0.55; F.torn++; F.hits.push('banner'); S.emit('sfx', 'tear'); S.shake = Math.max(S.shake, 0.15); }
  }
  // awnings: first touch bounces, second touch tears through
  for (let i = 0; i < STREET_AWNINGS.length; i++) {
    const a = STREET_AWNINGS[i];
    if (F.vy < 0 && py > a.y && F.y <= a.y && F.x >= a.x0 && F.x <= a.x1) {
      a.wob = 0.8;
      if (!F.bounced.has(i)) { F.bounced.add(i); F.y = a.y; F.vy = Math.min(7, Math.max(3, -F.vy * 0.25)); F.vx = -F.vx * 0.6 || 0.8; F.hits.push('awning'); S.emit('sfx', 'awning'); S.shake = Math.max(S.shake, 0.35); }
      else { F.vy *= 0.5; F.hits.push('rip'); S.emit('sfx', 'tear'); }
    }
  }
  F.peak = Math.max(F.peak, F.fromY - F.y);
  P.x = F.x; P.y = F.y;
  if (F.y <= TRASH_Y) { F.y = TRASH_Y; P.y = TRASH_Y; return 'landed'; }
  return null;
}

/** Lift path: slide along ropes from the current point to the start of span `target`. */
export function liftPos(S, L, f) {
  const spans = S.world.spans;
  let d = f * L.total;
  for (let i = L.from; i < L.target; i++) {
    const s0 = i === L.from ? L.s0 : 0, len = spans[i].len - s0;
    if (d <= len || i === L.target - 1) { const r = ropeAt(spans[i], s0 + Math.min(d, len)); return { x: r.x, y: r.y, span: i, s: s0 + Math.min(d, len) }; }
    d -= len;
  }
  const a = S.world.anchors[L.target];
  return { x: a.x, y: a.y, span: L.target, s: 0 };
}
