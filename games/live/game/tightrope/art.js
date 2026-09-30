// ORIGINAL procedural pixel art for TIGHTROPE (Outpost Boyz). PATCH on the wire (front view,
// arms out for the pole, 24x32 art px drawn at 4x), a scrap pigeon, a banana peel, the rope
// shaker bot, the spotter drone and the wrecking ball. The pixel font, the platform-agnostic
// sprite helpers, BIRD-9 and the scrap drone come read-only from CLIMB OR DIE's art.js.
import { PAL } from './consts.js';
import { makeCanvas, drawSprite, sprite as codSprite, text, textW } from '../art.js';
export { drawSprite, text, textW, codSprite };

function gridToCanvas(grid, scale, pal) {
  const h = grid.length, w = grid[0].length;
  const c = makeCanvas(w * scale, h * scale);
  if (!c) return { w: w * scale, h: h * scale, grid, scale, pal };
  const x = c.getContext('2d');
  for (let r = 0; r < h; r++) for (let q = 0; q < w; q++) { const v = grid[r][q]; if (v && pal[v]) { x.fillStyle = pal[v]; x.fillRect(q * scale, r * scale, scale, scale); } }
  return { c, w: w * scale, h: h * scale };
}
function outlineGrid(g, col = 'O') {
  const h = g.length, w = g[0].length, out = g.map((r) => r.slice());
  for (let r = 0; r < h; r++) for (let q = 0; q < w; q++) {
    if (g[r][q]) continue;
    if ((g[r - 1] && g[r - 1][q]) || (g[r + 1] && g[r + 1][q]) || g[r][q - 1] || g[r][q + 1]) out[r][q] = col;
  }
  return out;
}
const fromStrings = (rows, w) => rows.map((r) => [...r.padEnd(w, '.').slice(0, w)].map((c) => (c === '.' ? null : c)));

// ---------------- PATCH, front view on the wire ----------------
const PP = { O: PAL.ink, H: PAL.sodium, h: PAL.rustLight, s: PAL.rust, F: PAL.bone, G: PAL.help, g: PAL.machine, P: PAL.rustDark, B: PAL.machine, b: PAL.ink, R: PAL.sab, W: '#FFFFFF' };
export const PATCH_W = 24, PATCH_H = 32, PATCH_SC = 4;
export const HANDS = { y: 14 };            // art row of the hands (the pole goes through here)
function patchFrame(pose) {
  const W = PATCH_W, Hh = PATCH_H, g = Array.from({ length: Hh }, () => Array(W).fill(null));
  const rect = (x, y, w, h, c) => { for (let r = y; r < y + h; r++) for (let q = x; q < x + w; q++) if (r >= 0 && r < Hh && q >= 0 && q < W) g[r][q] = c; };
  const cr = pose.crouch || 0, by = cr + (pose.bob || 0);
  // legs (feet together on the rope; crouch = knees out)
  const [l1, l2] = pose.legs || [0, 0];
  if (cr) {
    rect(6, 20 + cr - 2, 5, 3, 'P'); rect(13, 20 + cr - 2, 5, 3, 'P');
    rect(8, 23 + cr - 2, 3, 29 - (23 + cr - 2), 'P'); rect(13, 23 + cr - 2, 3, 29 - (23 + cr - 2), 'P');
  } else {
    rect(9, 22 + by, 3, 7 - by - l1, 'P'); rect(12, 22 + by, 3, 7 - by - l2, 'P');
  }
  rect(8, 29 - l1, 4, 2, 'B'); rect(8, 31 - l1, 4, 1, 'b'); rect(12, 29 - l2, 4, 2, 'B'); rect(12, 31 - l2, 4, 1, 'b');
  // torso: stitched hazmat hoodie
  rect(7, 13 + by, 10, 9, 'H'); rect(7, 13 + by, 2, 9, 'h');
  for (let r = 0; r < 8; r++) if (g[14 + by + r]) g[14 + by + r][12 + (r % 2)] = 's';
  rect(7, 21 + by, 10, 1, 's');
  // arms
  if (pose.arms === 'up') { rect(3, 3 + by, 3, 11, 'H'); rect(18, 3 + by, 3, 11, 'H'); rect(3, 2 + by, 3, 2, 'F'); rect(18, 2 + by, 3, 2, 'F'); }
  else if (pose.arms === 'grip') { rect(4, 15 + by, 3, 7, 'H'); rect(17, 15 + by, 3, 7, 'H'); rect(4, 22 + by, 3, 2, 'F'); rect(17, 22 + by, 3, 2, 'F'); }
  else { const ay = HANDS.y + (pose.armDy || 0); rect(2, ay, 5, 2, 'H'); rect(17, ay, 5, 2, 'H'); rect(0, ay - 1 + (pose.flap || 0), 2, 3, 'F'); rect(22, ay - 1 - (pose.flap || 0), 2, 3, 'F'); }
  // hood + face + welding goggle + respirator
  rect(8, 3 + by, 8, 1, 'H'); rect(7, 4 + by, 10, 9, 'H'); rect(7, 12 + by, 10, 1, 'h');
  rect(9, 6 + by, 6, 6, 'F');
  rect(8, 7 + by, 8, 1, 'g'); rect(12, 7 + by, 3, 2, pose.hurt ? 'R' : 'G'); rect(14, 7 + by, 1, 1, 'W');
  rect(9, 8 + by, 2, 1, pose.hurt ? 'P' : 'b');
  rect(10, 10 + by, 4, 2, 'g'); rect(11, 11 + by, 2, 1, 'P');
  rect(9, 2 + by, 2, 1, 's'); rect(13, 3 + by, 3, 1, 's');
  return outlineGrid(g);
}
const POSES = {
  stand: [{}, { bob: 1, armDy: 1 }],
  walk: [{ legs: [1, 0], bob: 0 }, { legs: [0, 0], bob: 1 }, { legs: [0, 1], bob: 0 }, { legs: [0, 0], bob: 1 }],
  wobble: [{ flap: 1, hurt: false }, { flap: -1 }],
  crouch: [{ crouch: 4, arms: 'grip' }],
  fall: [{ arms: 'up', legs: [2, 0], hurt: true }, { arms: 'up', legs: [0, 2], hurt: true }],
  dangle: [{ arms: 'up', legs: [1, 1] }],
};
let PATCH = null;
export function patchSprites() {
  if (PATCH) return PATCH;
  PATCH = {};
  for (const [k, poses] of Object.entries(POSES)) PATCH[k] = poses.map((p) => gridToCanvas(patchFrame(p), PATCH_SC, PP));
  return PATCH;
}

// ---------------- small sprites ----------------
const HP = { O: PAL.ink, K: PAL.ink, M: PAL.machine, L: PAL.bone, R: PAL.sab, W: '#FFFFFF', S: PAL.sodium, G: PAL.help, Y: PAL.banana, y: '#A8872A', p: PAL.pigeon, t: '#3E8C7E', d: PAL.rustDark, r: PAL.rust, o: '#E07A2E', c: PAL.cable };
const PIGEON = ['....KKK.....', '...KppRK....', '..KpptpK....', '..KpptpKo...', '.KppppppK...', 'KppppppppKK.', 'KpLppppppppK', '.KpLLpppppK.', '..KKKKKKKK..', '...o...o....'];
const PIGEON_FLY = ['...KKK......', '..KppRK.....', 'KKpptpKKKK..', 'KpppppppppK.', '.KppppppppK.', '..KKKKKKKK..', '...o...o....'];
const PEEL = ['...KK.....', '..KYYK....', '.KYyYYK...', 'KYY.KYYK..', 'KY..K.YYK.', 'Ky......yK'];
const SHAKER = ['..KKKKKKKK..', '.KMMMMMMMMK.', 'KMMLLLLLLMMK', 'KMLRRWRRRLMK', 'KMMLLLLLLMMK', 'KMMMMMMMMMMK', '.KdKKddKKdK.', '.Kd.Kdd.KdK.', '..K..KK..K..'];
const SPOTTER = ['.KKK......KKK.', '...MM....MM...', '...MMMMMMMM...', '..MMGGGGGGMM..', '.MMGGWGGGGGMM.', '..MMGGGGGGMM..', '...MM.MM.MM...', '...K..K..K....'];
const SPR = {};
export function sprite(name) {
  if (SPR[name]) return SPR[name];
  const defs = { pigeon: [PIGEON, 12, 4], pigeonFly: [PIGEON_FLY, 12, 4], peel: [PEEL, 10, 5], shaker: [SHAKER, 12, 4], spotter: [SPOTTER, 14, 4] };
  if (defs[name]) { const [rows, w, sc] = defs[name]; SPR[name] = gridToCanvas(outlineGrid(fromStrings(rows, w)), sc, HP); }
  else if (name === 'drone' || name === 'bird') SPR[name] = codSprite(name);
  return SPR[name];
}

/** Wrecking ball with an AI eye, radius r px (drawn live; cheap). */
export function wreckingBall(ctx, x, y, r, t) {
  ctx.fillStyle = PAL.ink; ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3A3A44'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#55555F'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.45, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3; ctx.fillStyle = PAL.machine; ctx.fillRect(Math.round(x + Math.cos(a) * r * 0.75) - 3, Math.round(y + Math.sin(a) * r * 0.75) - 3, 6, 6); }
  ctx.fillStyle = PAL.ink; ctx.fillRect(x - r * 0.5, y - 7, r, 14);
  ctx.fillStyle = PAL.sab; ctx.fillRect(x - r * 0.4 + Math.sin(t * 4) * r * 0.2, y - 4, r * 0.35, 8);
}
