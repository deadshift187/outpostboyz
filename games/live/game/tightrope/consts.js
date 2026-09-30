// TIGHTROPE: shared constants. World is y-up in METRES, x in metres from the left edge of the
// 1080 px canvas (70 px = 1 m, so the canvas is 15.43 m wide). y = 0 is the street.
import { PAL as BASE_PAL, clamp, lerp, hash01 } from '../consts.js';
export { clamp, lerp, hash01 };

export const W = 1080, H = 1920;
export const PXM = 70;                         // px per metre
export const WORLD_W = W / PXM;                // 15.43 m
export const VIEW_TOP = 520, VIEW_BOT = 1640;  // 0-520 host cam (kept clear), 1640-1920 feed + card lane
export const LANE_TOP = 1640;
export const VIEW_M = (VIEW_BOT - VIEW_TOP) / PXM; // 16 m of city visible
export const FACADE_L = 1.25, FACADE_R = WORLD_W - 1.25; // canyon walls (ruined skyscrapers)

// ---- balance (the skill layer). theta = lean in rad (+ = right), omega = rad/s ----
// theta'' = K*sin(theta) + ext + A*u - C*omega   (an inverted pendulum; u = streamer lean -1..1)
export const BAL = {
  K: 2.2,            // instability (gravity tipping) at level 0
  A: 6.0,            // full lean correction (rad/s^2)
  C: 1.1,            // damping
  FALL: 0.9,         // |theta| past this = off the rope (standing)
  FALL_CROUCH: 1.15, // gripping the rope buys more lean
  DANGER: 0.6,       // wobble meter turns red
  CROUCH_K: 0.35, CROUCH_EXT: 0.4,  // crouch: lower centre of mass + grip
  GRIP_MAX: 3.0, GRIP_DRAIN: 1.0, GRIP_REFILL: 0.6,
  LEAN_RAMP: 10,      // keyboard lean ramps to full in ~0.14 s (analog sticks are direct)
  WALK: 1.1, BACK: 0.6, CRAWL: 0.3, WALK_ACC: 3.5,   // m/s along the rope
  STEP_EVERY: 0.6, STEP_KICK: 0.05,  // alternating foot-fall kick (rad/s)
  SLOPE_K: 0.6,      // steeper rope = twitchier
  SAFE_END: 0.3,     // first/last 0.3 m of a span = standing on the anchor ledge
};
export const FALL_G = 24, FALL_VMAX = 34;      // plunge physics (m/s^2, m/s)

export const PAL = {
  ...BASE_PAL,
  concrete: '#4A4550', concreteDark: '#2C2833', glass: '#1D3A44', glassLit: '#3F7C86', steel: '#5B4A44',
  sky0: '#141225', sky1: '#3A2438', fog: '#B9B3A8', rope: '#C9A46A', ropeDark: '#5A4020', cable: '#9AA3AE',
  banana: '#F2D34B', pigeon: '#7D7F92', awningA: '#A8412B', awningB: '#E8DCC4', storm: '#20263A',
};

// Default knobs (config.json "knobs" overrides, F10 edits live, saved per browser).
export const KNOBS = {
  crowdLikes: { def: 300, min: 100, max: 2000, step: 50, label: 'CROWD METER LIKES' },
  heatCap: { def: 100, min: 50, max: 300, step: 10, label: 'HEAT CAP' },
  heatDecay: { def: 5, min: 1, max: 20, step: 1, label: 'HEAT DECAY/S' },
  torqueCap: { def: 0.65, min: 0.4, max: 0.9, step: 0.05, label: 'SAB PUSH CAP (x LEAN)' },
  impulseBudget: { def: 1.6, min: 0.6, max: 3, step: 0.1, label: 'KICK BUDGET /5S' },
  telegraphScale: { def: 1.0, min: 0.7, max: 2.0, step: 0.05, label: 'TELEGRAPH SCALE' },
  wobble: { def: 1.0, min: 0.6, max: 1.4, step: 0.05, label: 'ROPE WOBBLE' },
  summitCap: { def: 5, min: 0, max: 10, step: 1, label: 'RUN SCALING CAP' },
  sessionSoftH: { def: 3, min: 1, max: 6, step: 0.25, label: 'SESSION SOFT STOP H' },
  sessionHardH: { def: 4, min: 1, max: 6, step: 0.25, label: 'SESSION HARD STOP H' },
  legendIntervalS: { def: 120, min: 60, max: 600, step: 10, label: 'GIFT LEGEND EVERY S' },
  stallAssistS: { def: 90, min: 30, max: 300, step: 5, label: 'STALL ASSIST S' },
  idleBreakS: { def: 60, min: 30, max: 600, step: 10, label: 'IDLE BREAK S' },
  howToPlay: { def: 1, min: 0, max: 1, step: 1, label: 'HOW-TO-PLAY STRIP 1=ON' },
};

// Sab Heat per tier (same scale as CLIMB OR DIE)
export const HEAT = { 1: 2, 5: 4, 10: 8, 100: 15, 199: 20, 499: 25, 699: 30, whale: 60 };
// Concurrency caps (live objects)
export const CAPS = { GUST: 3, PIGEON: 4, PEEL: 2, DRONE: 2, TWANG: 1, SHAKE: 1, FOG: 1, STORM: 1, CRANE: 1, HARNESS: 3 };

export const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
export const mix = (a, b, t) => { const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16); const c = (s) => Math.round(((A >> s) & 255) * (1 - t) + ((B >> s) & 255) * t); return '#' + ((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1); };
