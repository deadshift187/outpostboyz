// CLIMB OR DIE: shared constants. Numbers come straight from design/CLIMB-OR-DIE.md.
// World is y-up in px, 100 px = 1 m, y = 0 is the ground. x is shared with the canvas.

export const W = 1080, H = 1920;
export const M = 100;                    // px per metre
export const TOWER_X0 = 70, TOWER_X1 = 1010; // 10 m wide tower (1080 minus 70 px margins)
export const TOWER_TOP = 25000;          // 250 m summit
export const CHUNK_H = 1000;             // 10 m per authored chunk
export const BEACON_EVERY = 2500;        // 25 m

// Screen layout (1080x1920)
export const CAM_TOP = 520;              // 0-520 = host camera window, kept clear
export const VIEW_TOP = 520, VIEW_BOT = 1640; // game viewport
export const LANE_TOP = 1640;            // 1640-1920 = event feed + clip card lane

// PATCH moveset (spec section 1)
export const GRAV = 2600;
export const RUN_MAX = 560;
export const RUN_ACCEL = RUN_MAX / 0.08;   // 0.08 s to top speed
export const AIR_ACCEL = RUN_ACCEL * 0.6;
export const JUMP_V = 1070;                // 2.2 m apex
export const JUMP_CUT = 0.45;              // early release -> 1.1 m apex
export const COYOTE = 0.10, JUMP_BUFFER = 0.12;
export const DASH_DIST = 300, DASH_TIME = 0.15, DASH_CD = 1.5;
export const BRACE_MAX = 2.0, BRACE_CD = 1.0, BRACE_KNOCK = 0.35;
export const WALL_SLIDE_V = 300;
export const WALL_JUMP_VX = 560, WALL_JUMP_VY = 1000;
export const LADDER_V = 320;
export const MAX_FALL = 2300;
export const PW = 56, PH = 110;            // PATCH hitbox (sprite is 24x32 art px drawn at 4x = 96x128)
export const PLAT_T = 26;                  // platform thickness (visual)

// Palette (spec section 6): 9 core + 7 zone accents = 16
export const PAL = {
  ink: '#1A1414', rustDark: '#3B2A25', rust: '#7A3F2A', rustLight: '#C0612B',
  sodium: '#FFB347', bone: '#E8DCC4', help: '#3CE0C8', sab: '#FF5A36', machine: '#6E7B8B',
  // zone accents
  serverTeal: '#1F5560', hivePurple: '#4B2E5E', stormBlue: '#2E3F66', signalYellow: '#D8C84A',
  crownRed: '#8C2331', moss: '#55663F', night: '#1E1B2E',
};

export const ZONES = [
  { id: 1, name: 'SCRAP YARD', from: 0, to: 5000, sky: ['#1E1B2E', '#3B2A25'], accent: PAL.sodium, deco: PAL.rust },
  { id: 2, name: 'SERVER STACKS', from: 5000, to: 10000, sky: ['#1E1B2E', '#1F5560'], accent: PAL.help, deco: PAL.serverTeal },
  { id: 3, name: 'DRONE NEST', from: 10000, to: 15000, sky: ['#1E1B2E', '#4B2E5E'], accent: PAL.sab, deco: PAL.hivePurple },
  { id: 4, name: 'SIGNAL SPIRE', from: 15000, to: 20000, sky: ['#1E1B2E', '#2E3F66'], accent: PAL.signalYellow, deco: PAL.stormBlue },
  { id: 5, name: 'THE CROWN', from: 20000, to: 25000, sky: ['#1A1414', '#8C2331'], accent: PAL.bone, deco: PAL.crownRed },
];
export const zoneAt = (y) => ZONES[Math.max(0, Math.min(4, Math.floor(Math.max(0, y) / 5000)))];

// Default knobs (spec section 7); gifts.json "climb-or-die".knobs overrides, F10 edits live.
export const KNOBS = {
  lightningLikes: { def: 300, min: 100, max: 2000, step: 50, label: 'LIGHTNING LIKES' },
  heatCap: { def: 100, min: 50, max: 300, step: 10, label: 'HEAT CAP' },
  heatDecay: { def: 5, min: 1, max: 20, step: 1, label: 'HEAT DECAY/S' },
  knockScale: { def: 1.0, min: 0.5, max: 1.5, step: 0.05, label: 'KNOCKBACK SCALE' },
  telegraphScale: { def: 1.0, min: 0.7, max: 2.0, step: 0.05, label: 'TELEGRAPH SCALE' },
  liftCapM: { def: 240, min: 200, max: 245, step: 1, label: 'HELP LIFT CAP M' },
  summitCap: { def: 5, min: 0, max: 10, step: 1, label: 'SUMMIT SCALING CAP' },
  sessionSoftH: { def: 3, min: 1, max: 6, step: 0.25, label: 'SESSION SOFT STOP H' },
  sessionHardH: { def: 4, min: 1, max: 6, step: 0.25, label: 'SESSION HARD STOP H' },
  legendIntervalS: { def: 120, min: 60, max: 600, step: 10, label: 'GIFT LEGEND EVERY S' },
  stunBudgetS: { def: 1.5, min: 0.5, max: 3, step: 0.1, label: 'STUN BUDGET S/5S' },
  safetyNet: { def: 1, min: 0, max: 1, step: 1, label: 'SAFETY NET 1=ON 0=OFF' },
  stallAssistS: { def: 90, min: 30, max: 300, step: 5, label: 'STALL ASSIST S' },
  idleBreakS: { def: 60, min: 30, max: 600, step: 10, label: 'IDLE BREAK S' },
  howToPlay: { def: 1, min: 0, max: 1, step: 1, label: 'HOW-TO-PLAY STRIP 1=ON' },
};

// Sab Heat per tier (section 7)
export const HEAT = { 1: 2, 5: 4, 10: 8, 100: 15, 199: 20, 499: 25, 699: 30, whale: 60 };

// Concurrency caps (section 7)
export const CAPS = { DRONE: 3, CART: 1, METEOR: 1, HUNTER_KILLER: 1, OVERSEER: 1, EMP: 1, PLANKS: 12 };

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
// Deterministic hash -> [0,1). Used for world variety and cosmetics only; no gameplay rolls.
export function hash01(...n) {
  let h = 2166136261 >>> 0;
  for (const v of n) { h ^= (v * 2654435761) >>> 0; h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0; }
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
