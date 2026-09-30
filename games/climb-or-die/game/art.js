// ORIGINAL procedural pixel art for CLIMB OR DIE (Outpost Boyz). Everything here is
// drawn in code from the spec palette: a self-drawn 5x7 bitmap font, PATCH (24x32,
// 14 frames, drawn at 4x), hazards, BIRD-9, and the zone backdrops. No stock assets.
// Works headless: when no canvas can be created, callers draw straight to ctx.
import { PAL, hash01 } from './consts.js';

export function makeCanvas(w, h) {
  try {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(Math.max(1, w | 0), Math.max(1, h | 0));
    if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }
  } catch (e) { /* headless */ }
  return null;
}

// ---------------- 5x7 bitmap font ----------------
const F = {
  A: '01110 10001 10001 11111 10001 10001 10001', B: '11110 10001 10001 11110 10001 10001 11110', C: '01110 10001 10000 10000 10000 10001 01110',
  D: '11110 10001 10001 10001 10001 10001 11110', E: '11111 10000 10000 11110 10000 10000 11111', F: '11111 10000 10000 11110 10000 10000 10000',
  G: '01110 10001 10000 10111 10001 10001 01111', H: '10001 10001 10001 11111 10001 10001 10001', I: '01110 00100 00100 00100 00100 00100 01110',
  J: '00111 00010 00010 00010 00010 10010 01100', K: '10001 10010 10100 11000 10100 10010 10001', L: '10000 10000 10000 10000 10000 10000 11111',
  M: '10001 11011 10101 10101 10001 10001 10001', N: '10001 10001 11001 10101 10011 10001 10001', O: '01110 10001 10001 10001 10001 10001 01110',
  P: '11110 10001 10001 11110 10000 10000 10000', Q: '01110 10001 10001 10001 10101 10010 01101', R: '11110 10001 10001 11110 10100 10010 10001',
  S: '01111 10000 10000 01110 00001 00001 11110', T: '11111 00100 00100 00100 00100 00100 00100', U: '10001 10001 10001 10001 10001 10001 01110',
  V: '10001 10001 10001 10001 10001 01010 00100', W: '10001 10001 10001 10101 10101 10101 01010', X: '10001 10001 01010 00100 01010 10001 10001',
  Y: '10001 10001 01010 00100 00100 00100 00100', Z: '11111 00001 00010 00100 01000 10000 11111',
  0: '01110 10001 10011 10101 11001 10001 01110', 1: '00100 01100 00100 00100 00100 00100 01110', 2: '01110 10001 00001 00010 00100 01000 11111',
  3: '11111 00010 00100 00010 00001 10001 01110', 4: '00010 00110 01010 10010 11111 00010 00010', 5: '11111 10000 11110 00001 00001 10001 01110',
  6: '00110 01000 10000 11110 10001 10001 01110', 7: '11111 00001 00010 00100 01000 01000 01000', 8: '01110 10001 10001 01110 10001 10001 01110',
  9: '01110 10001 10001 01111 00001 00010 01100',
  ' ': '00000 00000 00000 00000 00000 00000 00000', '.': '00000 00000 00000 00000 00000 01100 01100', ',': '00000 00000 00000 00000 01100 00100 01000',
  ':': '00000 01100 01100 00000 01100 01100 00000', ';': '00000 01100 01100 00000 01100 00100 01000', '!': '00100 00100 00100 00100 00100 00000 00100',
  '?': '01110 10001 00001 00010 00100 00000 00100', "'": '00100 00100 01000 00000 00000 00000 00000', '"': '01010 01010 00000 00000 00000 00000 00000',
  '-': '00000 00000 00000 01110 00000 00000 00000', '−': '00000 00000 00000 01110 00000 00000 00000', '_': '00000 00000 00000 00000 00000 00000 11111',
  '+': '00000 00100 00100 11111 00100 00100 00000', '=': '00000 00000 11111 00000 11111 00000 00000', '/': '00001 00010 00010 00100 01000 01000 10000',
  '(': '00010 00100 01000 01000 01000 00100 00010', ')': '01000 00100 00010 00010 00010 00100 01000', '[': '01110 01000 01000 01000 01000 01000 01110',
  ']': '01110 00010 00010 00010 00010 00010 01110', '#': '01010 01010 11111 01010 11111 01010 01010', '@': '01110 10001 10111 10101 10111 10000 01111',
  '&': '01100 10010 10100 01000 10101 10010 01101', '%': '11000 11001 00010 00100 01000 10011 00011', '*': '00000 00100 10101 01110 10101 00100 00000',
  '<': '00010 00100 01000 10000 01000 00100 00010', '>': '01000 00100 00010 00001 00010 00100 01000', '★': '00100 00100 11111 01110 01110 11011 10001',
  '⇄': '00010 11111 00010 00000 01000 11111 01000', '·': '00000 00000 01100 01100 00000 00000 00000', '×': '00000 10001 01010 00100 01010 10001 00000',
  '↑': '00100 01110 10101 00100 00100 00100 00100', '↓': '00100 00100 00100 00100 10101 01110 00100', '←': '00000 00100 01000 11111 01000 00100 00000', '→': '00000 00100 00010 11111 00010 00100 00000',
  '|': '00100 00100 00100 00100 00100 00100 00100', '$': '00100 01111 10100 01110 00101 11110 00100', '~': '00000 00000 01000 10101 00010 00000 00000', '…': '00000 00000 00000 00000 00000 00000 10101',
};
const GLYPH = {};
for (const [k, v] of Object.entries(F)) GLYPH[k] = v.split(' ').map((r) => [...r].map((c) => c === '1'));
const upper = (s) => String(s).toUpperCase();
export const fontSupports = (s) => [...upper(s)].every((c) => GLYPH[c]);
// Viewer names can hold emoji, Arabic, CJK... Those graphemes are drawn in a system font
// run inline with the pixel font (so "@🔥kai KNOCKED PATCH DOWN" keeps its pixel look),
// sized so the fallback's cap height matches the 7-row pixel cell. Spaces between two
// fallback words stay inside the run, so RTL names keep their bidi word order.
const FALLBACK_FONT = (scale) => `bold ${Math.round(8.6 * scale)}px "Segoe UI", "Noto Sans", Arial, sans-serif`;
const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
const graphemes = (s) => (segmenter ? [...segmenter.segment(s)].map((g) => g.segment) : [...s]);
const pixOK = (g) => { const u = upper(g); return u.length > 0 && [...u].every((c) => GLYPH[c]); };
const runCache = new Map();
function textRuns(s) {
  let r = runCache.get(s);
  if (r) return r;
  r = [];
  for (const g of graphemes(s)) {
    const pix = pixOK(g), last = r[r.length - 1];
    if (last && last.pix === pix) last.t += g; else r.push({ pix, t: g });
  }
  // [fallback][spaces][fallback] -> one fallback run (keeps RTL word order)
  for (let i = 1; i < r.length - 1; i++) if (r[i].pix && /^\s+$/.test(r[i].t) && !r[i - 1].pix && !r[i + 1].pix) { r[i - 1].t += r[i].t + r[i + 1].t; r.splice(i, 2); i--; }
  runCache.set(s, r); if (runCache.size > 600) runCache.delete(runCache.keys().next().value);
  return r;
}
let measureCtx;
function fbWidth(t, scale) {
  if (measureCtx === undefined) { const c = makeCanvas(4, 4); measureCtx = c ? c.getContext('2d') : null; }
  if (!measureCtx) return [...t].length * 6 * scale;
  measureCtx.font = FALLBACK_FONT(scale);
  return measureCtx.measureText(t).width || [...t].length * 6 * scale;
}
const runW = (run, scale) => (run.pix ? [...upper(run.t)].length * 6 * scale : fbWidth(run.t, scale) + scale);
/** Width of pixel text (fallback-font runs measured in that font). */
export const textW = (s, scale) => {
  s = String(s);
  if (fontSupports(s)) return [...s].length * 6 * scale - scale;
  return textRuns(s).reduce((w, run) => w + runW(run, scale), 0) - scale;
};

function pixRun(ctx, chars, x, y, scale, color, outline) {
  if (outline) {
    ctx.fillStyle = PAL.ink;
    chars.forEach((c, i) => { const g = GLYPH[c]; for (let r = 0; r < 7; r++) for (let q = 0; q < 5; q++) if (g[r][q]) ctx.fillRect(x + (i * 6 + q) * scale - outline, y + r * scale - outline, scale + outline * 2, scale + outline * 2); });
  }
  ctx.fillStyle = color;
  chars.forEach((c, i) => { const g = GLYPH[c]; for (let r = 0; r < 7; r++) for (let q = 0; q < 5; q++) if (g[r][q]) ctx.fillRect(x + (i * 6 + q) * scale, y + r * scale, scale, scale); });
}
function rawText(ctx, s, x, y, scale, color, outline) {
  if (fontSupports(s)) return pixRun(ctx, [...upper(s)], x, y, scale, color, outline);
  let cx = x;
  for (const run of textRuns(s)) {
    if (run.pix) { const ch = [...upper(run.t)]; pixRun(ctx, ch, cx, y, scale, color, outline); cx += ch.length * 6 * scale; continue; }
    ctx.font = FALLBACK_FONT(scale); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const by = y + 7 * scale; // baseline on the bottom row of the pixel cell
    if (outline) { ctx.lineWidth = outline * 2; ctx.strokeStyle = PAL.ink; ctx.lineJoin = 'round'; ctx.strokeText(run.t, cx, by); }
    ctx.fillStyle = color; ctx.fillText(run.t, cx, by);
    cx += runW(run, scale);
  }
}

const textCache = new Map();
/** Pixel text. align: left|center|right; y is the top of the glyphs. */
export function text(ctx, s, x, y, { scale = 3, color = PAL.bone, outline = 0, align = 'left', alpha = 1 } = {}) {
  s = String(s);
  if (!s) return 0;
  const key = s + '|' + scale + '|' + color + '|' + outline;
  let c = textCache.get(key), w;
  if (c === undefined) {
    w = textW(s, scale);
    // fallback-font glyphs (emoji, accents) can reach above/below the 7-row cell: give them headroom
    const pad = fontSupports(s) ? 2 : Math.ceil(scale * 2);
    c = makeCanvas(w + outline * 2 + 4, 7 * scale + outline * 2 + 2 + pad * 2);
    if (c) { const cx = c.getContext('2d'); rawText(cx, s, outline + 2, outline + pad, scale, color, outline); c.w = w; c.pad = pad; }
    else w = undefined;
    textCache.set(key, c);
    if (textCache.size > 800) textCache.delete(textCache.keys().next().value);
  } else if (c) { textCache.delete(key); textCache.set(key, c); } // LRU: keep hot strings cached
  if (w === undefined) w = c && c.w !== undefined ? c.w : textW(s, scale);
  const ox = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  const pa = ctx.globalAlpha;
  if (alpha !== 1) ctx.globalAlpha = pa * alpha;
  if (c) ctx.drawImage(c, Math.round(ox - outline - 2), Math.round(y - outline - (c.pad ?? 2)));
  else rawText(ctx, s, ox, y, scale, color, outline);
  ctx.globalAlpha = pa;
  return w;
}

// ---------------- pixel sprite helpers ----------------
function gridToCanvas(grid, scale, pal) {
  const h = grid.length, w = grid[0].length;
  const c = makeCanvas(w * scale, h * scale);
  if (!c) return { w: w * scale, h: h * scale, grid, scale, pal };
  const x = c.getContext('2d');
  for (let r = 0; r < h; r++) for (let q = 0; q < w; q++) { const v = grid[r][q]; if (v && pal[v]) { x.fillStyle = pal[v]; x.fillRect(q * scale, r * scale, scale, scale); } }
  return { c, w: w * scale, h: h * scale };
}
export function drawSprite(ctx, spr, x, y, flip = false, alpha = 1) {
  const pa = ctx.globalAlpha; if (alpha !== 1) ctx.globalAlpha = pa * alpha;
  if (spr.c) {
    if (flip) { ctx.save(); ctx.translate(Math.round(x + spr.w), Math.round(y)); ctx.scale(-1, 1); ctx.drawImage(spr.c, 0, 0); ctx.restore(); }
    else ctx.drawImage(spr.c, Math.round(x), Math.round(y));
  } else if (spr.grid) { // headless fallback
    for (let r = 0; r < spr.grid.length; r++) for (let q = 0; q < spr.grid[0].length; q++) { const v = spr.grid[r][q]; if (v) { ctx.fillStyle = spr.pal[v]; ctx.fillRect(x + (flip ? spr.grid[0].length - 1 - q : q) * spr.scale, y + r * spr.scale, spr.scale, spr.scale); } }
  }
  ctx.globalAlpha = pa;
}
function fromStrings(rows, w) { return rows.map((r) => [...r.padEnd(w, '.').slice(0, w)].map((c) => (c === '.' ? null : c))); }
function outlineGrid(g, col = 'O') {
  const h = g.length, w = g[0].length, out = g.map((r) => r.slice());
  for (let r = 0; r < h; r++) for (let q = 0; q < w; q++) {
    if (g[r][q]) continue;
    if ((g[r - 1] && g[r - 1][q]) || (g[r + 1] && g[r + 1][q]) || g[r][q - 1] || g[r][q + 1]) out[r][q] = col;
  }
  return out;
}

// ---------------- PATCH (24x32 art px, 14 frames, 4x) ----------------
const PP = { O: PAL.ink, H: PAL.sodium, h: PAL.rustLight, s: PAL.rust, F: PAL.bone, G: PAL.help, g: PAL.machine, P: PAL.rustDark, B: PAL.machine, b: PAL.ink, R: PAL.sab, W: '#FFFFFF' };
function patchFrame(pose) {
  const W = 24, Hh = 32, g = Array.from({ length: Hh }, () => Array(W).fill(null));
  const rect = (x, y, w, h, c) => { for (let r = y; r < y + h; r++) for (let q = x; q < x + w; q++) if (r >= 0 && r < Hh && q >= 0 && q < W) g[r][q] = c; };
  const by = (pose.bob || 0) + (pose.crouch || 0), tx = pose.tilt || 0;
  // legs first (behind torso)
  const legs = pose.legs || [[0, 0], [0, 0]];
  const legY = 22 + (pose.crouch || 0);
  legs.forEach(([dx, lift], i) => {
    const lx = (i ? 13 : 9) + dx, len = 6 - lift - Math.floor((pose.crouch || 0) / 2);
    rect(lx, legY, 3, len, 'P');
    rect(lx - (i ? 0 : 1), legY + len, 4, 2, 'B'); rect(lx - (i ? 0 : 1), legY + len + 1, 4, 1, 'b');
  });
  // back arm
  const ab = pose.armB || [0, 0];
  rect(7 + tx + ab[0], 14 + by + ab[1], 2, 6, 'h'); rect(7 + tx + ab[0], 20 + by + ab[1], 2, 1, 's');
  // torso: hazmat hoodie with stitches
  rect(8 + tx, 13 + by, 9, 9, 'H'); rect(8 + tx, 13 + by, 2, 9, 'h');
  for (let r = 0; r < 7; r++) g[14 + by + r] && (g[14 + by + r][12 + tx + (r % 2)] = 's');
  rect(8 + tx, 20 + by, 9, 1, 's');
  // hood + face + welding goggle + respirator
  rect(8 + tx, 3 + by, 8, 1, 'H'); rect(7 + tx, 4 + by, 10, 8, 'H'); rect(8 + tx, 12 + by, 8, 1, 'h'); rect(7 + tx, 5 + by, 2, 6, 'h');
  rect(12 + tx, 6 + by, 5, 5, 'F');
  rect(9 + tx, 7 + by, 4, 1, 'g'); rect(13 + tx, 6 + by, 4, 1, 'g'); rect(13 + tx, 7 + by, 4, 2, pose.hurt ? 'R' : 'G'); rect(16 + tx, 7 + by, 1, 1, 'W');
  rect(13 + tx, 9 + by, 3, 2, 'g'); rect(14 + tx, 10 + by, 1, 1, 'P');
  rect(10 + tx, 2 + by, 2, 1, 's'); // stitch on hood
  // front arm
  const af = pose.armF || [0, 0];
  if (pose.brace) { rect(14 + tx, 15 + by, 5, 2, 'H'); rect(17 + tx, 14 + by, 3, 4, 'g'); rect(16 + tx, 13 + by, 2, 6, 'g'); }
  else { rect(14 + tx + af[0], 14 + by + af[1], 2, 6, 'H'); rect(14 + tx + af[0], 20 + by + af[1], 2, 2, 's'); }
  return outlineGrid(g);
}
function patchPoses() {
  const f = {};
  f.idle = [{ bob: 0 }, { bob: 1, armF: [0, 1], armB: [0, 1] }];
  f.run = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2, s = Math.round(Math.sin(a) * 2.4), up = Math.round(Math.max(0, Math.cos(a)) * 2);
    f.run.push({ bob: i % 3 === 0 ? 1 : 0, legs: [[s, up], [-s, Math.round(Math.max(0, -Math.cos(a)) * 2)]], armF: [-s, 0], armB: [s, 0] });
  }
  f.jump = [{ legs: [[-1, 2], [2, 3]], armF: [1, -5], armB: [-1, -4] }, { legs: [[-1, 1], [2, 2]], armF: [1, -4], armB: [-1, -3] }];
  f.fall = [{ legs: [[-2, 0], [3, 1]], armF: [2, -6], armB: [-2, -6] }, { legs: [[-3, 1], [3, 0]], armF: [2, -5], armB: [-2, -7] }];
  f.brace = [{ crouch: 3, brace: true, legs: [[-2, 0], [2, 0]] }];
  f.hurt = [{ tilt: -1, hurt: true, legs: [[-2, 2], [2, 0]], armF: [2, -6], armB: [-2, -5] }];
  return f;
}
let PATCH = null;
export function patchSprites() {
  if (PATCH) return PATCH;
  PATCH = {};
  for (const [k, poses] of Object.entries(patchPoses())) PATCH[k] = poses.map((p) => gridToCanvas(patchFrame(p), 4, PP));
  PATCH.frameCount = Object.values(PATCH).reduce((n, a) => n + (Array.isArray(a) ? a.length : 0), 0); // 14
  return PATCH;
}

// ---------------- hazards / helpers (pixel strings) ----------------
const HP = { O: PAL.ink, K: PAL.ink, M: PAL.machine, L: PAL.bone, R: PAL.sab, W: '#FFFFFF', S: PAL.sodium, G: PAL.help, r: PAL.rust, h: PAL.rustLight, d: PAL.rustDark, Y: PAL.signalYellow, C: PAL.crownRed };
const DRONE = ['.KKKK......KKKK.', '...MM......MM...', '...MMMMMMMMMM...', '..MMMMMMMMMMMM..', '.MMMLLLLLLLLMMM.', '.MMLLRRRRRRLLMM.', '.MMLLRWRRRRLLMM.', '.MMMLLLLLLLLMMM.', '..MMMMMMMMMMMM..', '...MM.MMMM.MM...', '...M..M..M..M...', '..KK........KK..'];
const PATROL = DRONE.map((r) => r.replace(/R/g, 'Y'));
const CORGI = ['...........KK...', '..........KSSK..', 'KK.......KSSSSK.', 'KSK.....KSSGGSK.', '.KSSSSSSSSSSSSK.', '.KSSSSSSSSSSSK..', '..KSSSSSSSSSK...', '..KMMKKKKKMMK...', '..KMK.....KMK...', '..KK......KK....'];
const CART = ['..........RR............', '.........RWWR...........', 'KKKKKKKKKKKKKKKKKKKKKKKK', 'KrrrrhrrrrrhrrrrrhrrrrrK', 'KrdddhdddddhdddddhddddrK', 'KrdddhdddddhdddddhddddrK', 'KrrrrhrrrrrhrrrrrhrrrrrK', 'KKKKKKKKKKKKKKKKKKKKKKKK', '..KMMK..........KMMK....', '..KMMK..........KMMK....', '...KK............KK.....'];
const BOLT = ['.MMMM.', 'MLLLLM', 'MLMMLM', 'MLLLLM', '.MMMM.', '..MM..', '..ML..', '..MM..', '..ML..', '..MM..'];
const SPR = {};
export function sprite(name) {
  if (SPR[name]) return SPR[name];
  const defs = { drone: [DRONE, 16, 4], patrol: [PATROL, 16, 4], corgi: [CORGI, 16, 4], cart: [CART, 24, 5], bolt: [BOLT, 6, 4] };
  if (defs[name]) { const [rows, w, sc] = defs[name]; SPR[name] = gridToCanvas(outlineGrid(fromStrings(rows, w)), sc, HP); }
  else if (name === 'hk') SPR[name] = gridToCanvas(hkGrid(), 3, HP);
  else if (name === 'bird' || name === 'bird2') SPR[name] = gridToCanvas(birdGrid(name === 'bird2'), 4, HP);
  return SPR[name];
}
function hkGrid() { // Hunter-Killer 48x64
  const W = 48, H = 64, g = Array.from({ length: H }, () => Array(W).fill(null));
  const rect = (x, y, w, h, c) => { for (let r = y; r < y + h; r++) for (let q = x; q < x + w; q++) if (r >= 0 && r < H && q >= 0 && q < W) g[r][q] = c; };
  rect(14, 2, 20, 14, 'M'); rect(16, 4, 16, 10, 'd'); rect(18, 7, 12, 4, 'R'); rect(22, 8, 4, 2, 'W');
  rect(8, 17, 32, 22, 'M'); rect(10, 19, 28, 3, 'L'); for (let i = 0; i < 6; i++) rect(11 + i * 5, 25, 3, 10, 'd');
  rect(2, 18, 6, 22, 'M'); rect(40, 18, 6, 22, 'M'); rect(0, 40, 10, 6, 'd'); rect(38, 40, 10, 6, 'd');
  rect(12, 40, 9, 16, 'M'); rect(27, 40, 9, 16, 'M'); rect(10, 56, 13, 6, 'd'); rect(25, 56, 13, 6, 'd');
  rect(20, 30, 8, 6, 'R');
  return outlineGrid(g);
}
function birdGrid(alt) { // BIRD-9 rescue chopper 64x32
  const W = 64, H = 32, g = Array.from({ length: H }, () => Array(W).fill(null));
  const rect = (x, y, w, h, c) => { for (let r = y; r < y + h; r++) for (let q = x; q < x + w; q++) if (r >= 0 && r < H && q >= 0 && q < W) g[r][q] = c; };
  rect(30, 2, 4, 3, 'M');                  // mast
  rect(16, 6, 30, 14, 'L'); rect(14, 9, 4, 9, 'L'); rect(44, 8, 6, 10, 'L');
  rect(16, 12, 30, 2, 'G');                // teal resistance stripe
  rect(38, 8, 10, 6, 'K'); rect(40, 9, 5, 2, 'G'); // cockpit
  rect(0, 9, 16, 3, 'M'); rect(0, 5, 3, 9, 'M'); rect(0, 5, 2, 2, alt ? 'S' : 'R'); // tail boom + tail rotor + beacon
  rect(20, 15, 5, 4, 'd'); rect(20, 16, 2, 2, 'S');  // side door
  rect(18, 20, 2, 5, 'M'); rect(40, 20, 2, 5, 'M'); rect(14, 25, 34, 2, 'M'); // skids
  rect(26, 20, 1, 12, 'r');                // winch rope stub
  return outlineGrid(g);
}

// ---------------- procedural backdrops (per zone, cached) ----------------
const BG = new Map();
function cached(key, w, h, draw) {
  if (BG.has(key)) return BG.get(key);
  const c = makeCanvas(w, h);
  if (c) draw(c.getContext('2d'), w, h);
  BG.set(key, c);
  return c;
}
function noise1(x, seed) { const i = Math.floor(x), f = x - i, a = hash01(i, seed), b = hash01(i + 1, seed), u = f * f * (3 - 2 * f); return a + (b - a) * u; }
export function perlinBand(x, seed) { let v = 0, amp = 0.5, fr = 1; for (let o = 0; o < 4; o++) { v += noise1(x * fr, seed + o * 13) * amp; amp *= 0.5; fr *= 2; } return v; }

/** Dead-city skyline strip (far parallax, near the ground). */
export function skyline() {
  return cached('skyline', 1080, 420, (x, w, h) => {
    for (let layer = 0; layer < 2; layer++) {
      x.fillStyle = layer ? PAL.ink : PAL.rustDark;
      let q = -20 + layer * 37;
      while (q < w) {
        const bw = 50 + Math.floor(hash01(q, layer, 3) * 90), bh = 120 + Math.floor(hash01(q, layer, 5) * (layer ? 220 : 300));
        x.fillRect(q, h - bh, bw, bh);
        if (hash01(q, 9) < 0.4) x.fillRect(q + bw / 2 - 3, h - bh - 40, 6, 40); // antenna
        x.fillStyle = layer ? PAL.sodium : PAL.rust;
        for (let wy = h - bh + 14; wy < h - 10; wy += 22) for (let wx = q + 8; wx < q + bw - 8; wx += 16) if (hash01(wx, wy, layer) < 0.13) x.fillRect(wx, wy, 6, 8);
        x.fillStyle = layer ? PAL.ink : PAL.rustDark;
        q += bw + 6;
      }
    }
  });
}
/** Giant robot hulk silhouette (mid parallax). */
export function hulk(i) {
  return cached('hulk' + (i % 3), 520, 700, (x) => {
    x.fillStyle = 'rgba(26,20,20,0.85)';
    const v = i % 3;
    x.fillRect(150, 60, 220, 180); x.fillRect(110, 250, 300, 260); x.fillRect(40, 270, 70, 300); x.fillRect(410, 270, 70, 300);
    x.fillRect(150, 510, 90, 190); x.fillRect(280, 510, 90, 190);
    if (v === 1) { x.fillRect(200, 0, 20, 60); x.fillRect(300, 10, 20, 50); }
    if (v === 2) { x.clearRect(400, 250, 90, 120); x.fillRect(430, 300, 20, 260); }
    x.fillStyle = 'rgba(255,90,54,0.55)'; x.fillRect(190 + v * 30, 120, 40, 18); x.fillRect(290 - v * 10, 120, 40, 18);
    x.fillStyle = 'rgba(110,123,139,0.35)'; for (let r = 270; r < 500; r += 36) x.fillRect(130, r, 260, 6);
  });
}
/** Storm clouds: Perlin bands (far parallax), one tile per zone. */
export function clouds(zone) {
  return cached('clouds' + zone, 1080, 360, (x, w, h) => {
    const cols = ['rgba(232,220,196,0.07)', 'rgba(110,123,139,0.10)', 'rgba(26,20,20,0.35)'];
    for (let b = 0; b < 3; b++) {
      x.fillStyle = cols[b];
      for (let q = 0; q < w; q += 4) {
        const n = perlinBand(q / 140 + b * 3.1, zone * 7 + b);
        const top = 40 + b * 90 + n * 110, hh = 30 + perlinBand(q / 90 + 5, zone + b * 3) * 70;
        x.fillRect(q, Math.round(top / 4) * 4, 4, Math.round(hh / 4) * 4);
      }
    }
  });
}
/** Tower wall backdrop per zone: 940x1000 tile, rust panels + zone dressing. */
export function wallTile(zone) {
  return cached('wall' + zone, 940, 1000, (x, w, h) => {
    const base = [PAL.rustDark, '#23303A', '#2B2233', '#232B40', '#2A1A1C'][zone - 1];
    x.fillStyle = base; x.fillRect(0, 0, w, h);
    // panels + rivets
    for (let py = 0; py < h; py += 125) for (let px = 0; px < w; px += 188) {
      const k = hash01(px, py, zone);
      x.fillStyle = k < 0.5 ? 'rgba(26,20,20,0.35)' : 'rgba(122,63,42,0.18)';
      x.fillRect(px + 3, py + 3, 182, 119);
      x.fillStyle = 'rgba(232,220,196,0.10)'; x.fillRect(px + 8, py + 8, 4, 4); x.fillRect(px + 174, py + 8, 4, 4); x.fillRect(px + 8, py + 110, 4, 4); x.fillRect(px + 174, py + 110, 4, 4);
    }
    // rust drips (noise strips)
    x.fillStyle = 'rgba(192,97,43,0.22)';
    for (let q = 0; q < w; q += 8) { const n = perlinBand(q / 60, zone * 11); if (n > 0.55) x.fillRect(q, 0, 8, Math.round(n * 140)); }
    // zone dressing
    if (zone === 1) { // car husks + sodium lamps
      for (let i = 0; i < 3; i++) {
        const cx = 60 + i * 300, cy = 200 + i * 280;
        x.fillStyle = 'rgba(26,20,20,0.6)'; x.fillRect(cx, cy, 180, 60); x.fillRect(cx + 30, cy - 36, 110, 40);
        x.fillStyle = 'rgba(110,123,139,0.4)'; x.fillRect(cx + 40, cy - 28, 40, 24); x.fillRect(cx + 90, cy - 28, 40, 24);
        x.fillStyle = PAL.ink; x.beginPath(); x.arc(cx + 36, cy + 62, 20, 0, 7); x.arc(cx + 144, cy + 62, 20, 0, 7); x.fill();
      }
      for (let i = 0; i < 4; i++) { const lx = 120 + i * 230; x.fillStyle = PAL.ink; x.fillRect(lx, 40 + i * 240, 6, 180); x.fillStyle = PAL.sodium; x.fillRect(lx - 10, 36 + i * 240, 26, 8); }
    } else if (zone === 2) { // server racks
      for (let i = 0; i < 5; i++) { const rx = 20 + i * 188; x.fillStyle = 'rgba(26,20,20,0.55)'; x.fillRect(rx, 0, 140, h); x.fillStyle = 'rgba(110,123,139,0.25)'; for (let u = 10; u < h; u += 28) x.fillRect(rx + 8, u, 124, 18); }
    } else if (zone === 3) { // hanging hive pods + cables
      for (let i = 0; i < 6; i++) {
        const px = 70 + i * 150, py = 120 + ((i * 331) % 700);
        x.strokeStyle = 'rgba(26,20,20,0.7)'; x.lineWidth = 6; x.beginPath(); x.moveTo(px, 0); x.lineTo(px + 10, py); x.stroke();
        x.fillStyle = 'rgba(75,46,94,0.8)'; x.beginPath(); x.ellipse(px + 10, py + 50, 40, 60, 0, 0, 7); x.fill();
        x.fillStyle = 'rgba(255,90,54,0.35)'; for (let k = 0; k < 4; k++) x.fillRect(px - 6 + k * 9, py + 40 + (k % 2) * 16, 6, 6);
      }
    } else if (zone === 4) { // antenna lattice
      x.strokeStyle = 'rgba(110,123,139,0.32)'; x.lineWidth = 6;
      for (let i = -2; i < 10; i++) { x.beginPath(); x.moveTo(i * 130, 0); x.lineTo(i * 130 + 500, h); x.stroke(); x.beginPath(); x.moveTo(i * 130 + 500, 0); x.lineTo(i * 130, h); x.stroke(); }
      x.fillStyle = 'rgba(216,200,74,0.3)'; for (let i = 0; i < 6; i++) x.fillRect(80 + i * 150, 100 + i * 140, 12, 12);
    } else { // THE CROWN: giant dead robot head plates
      x.fillStyle = 'rgba(26,20,20,0.5)';
      for (let i = 0; i < 4; i++) x.fillRect(40 + i * 230, 0, 180, h);
      x.fillStyle = 'rgba(140,35,49,0.35)'; for (let r = 60; r < h; r += 200) x.fillRect(0, r, w, 24);
    }
  });
}
