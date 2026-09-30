// TIGHTROPE city layout: two ruined skyscrapers face each other across a canyon street, and
// the route zigzags UP between them on ropes strung from ledge to ledge (anchor to anchor).
// Frames a 9:16 screen: every span crosses the full width and climbs 3-6 m.
// Randomness is used ONLY for layout (seeded hash, same run number = same city); it never
// decides a viewer's effect.
import { FACADE_L, FACADE_R, hash01, clamp } from './consts.js';

export const START_Y = 12;          // first anchor (a 4th-floor ledge)
export const STREET_AWNINGS = [      // what a falling PATCH lands on (y = canopy height)
  { x0: FACADE_L, x1: 8.1, y: 5.2, side: 'L' },
  { x0: 7.3, x1: FACADE_R, y: 4.4, side: 'R' },
  { x0: 2.6, x1: 12.8, y: 2.3, side: 'M' }, // the market stall canopy
];
export const TRASH_Y = 0.55;

/** Build one run. level = difficulty step (0..summitCap), runNo = how many runs this session. */
export function buildRun(level, runNo = 0) {
  const seed = 101 + runNo * 7919 + level * 131;
  const h = (...k) => hash01(seed, ...k);
  const n = Math.min(22, 14 + 2 * level);
  const anchors = [];
  let y = START_Y;
  for (let i = 0; i <= n; i++) {
    const side = i % 2 ? 'R' : 'L';
    const reach = 1.0 + h(i, 1) * 1.3;                // how far the ledge sticks out
    const x = side === 'L' ? FACADE_L + reach : FACADE_R - reach;
    if (i > 0) y += (3.0 + h(i, 2) * 2.6) * (1 + 0.06 * level);
    anchors.push({ i, x, y, side, banked: i === 0, final: i === n });
  }
  const spans = [];
  for (let i = 0; i < n; i++) {
    const a = anchors[i], b = anchors[i + 1];
    const kind = h(i, 3) < 0.35 ? 'cable' : 'hemp';
    const sag = kind === 'cable' ? 0.35 + h(i, 4) * 0.2 : 0.6 + h(i, 4) * 0.5;
    const sp = { i, a, b, kind, sag, breeze: [] };
    buildArc(sp);
    // baseline breeze zones (layout, telegraphed by flags on the rope): none on the first two spans
    if (i >= 2) {
      const zones = h(i, 5) < 0.5 ? 1 : 2;
      for (let z = 0; z < zones; z++) {
        const s0 = sp.len * (0.18 + z * 0.4 + h(i, 6, z) * 0.12), s1 = s0 + sp.len * (0.16 + h(i, 7, z) * 0.1);
        const str = (0.7 + h(i, 8, z) * 0.7) * (1 + 0.15 * level);
        sp.breeze.push({ s0, s1: Math.min(s1, sp.len - 0.8), dir: h(i, 9, z) < 0.5 ? -1 : 1, str });
      }
    }
    spans.push(sp);
  }
  // cloth banners strung across the canyon (a falling PATCH tears through them)
  const banners = [];
  const SLOGANS = ['WE WERE HERE', 'NO MACHINES', 'KEEP WALKING', 'RESIST', 'LOOK UP', 'OUTPOST LIVES', 'HOLD THE LINE'];
  for (let by = 9 + h(99) * 4, k = 0; by < anchors[n].y - 4; by += 11 + h(k, 10) * 6, k++) {
    banners.push({ y: by, text: SLOGANS[(runNo + k) % SLOGANS.length], color: ['#8C2331', '#1F5560', '#55663F', '#7A3F2A'][k % 4], torn: false, tearT: 0 });
  }
  const top = anchors[n].y;
  return { level, runNo, n, anchors, spans, banners, top, seed, roofL: top + (anchors[n].side === 'L' ? 0 : 2.5 + h(50) * 3), roofR: top + (anchors[n].side === 'R' ? 0 : 2.5 + h(51) * 3) };
}

// Rope = straight chord with a parabolic sag, sampled into an arc-length table.
function buildArc(sp) {
  const N = 48, pts = [];
  let len = 0, px = sp.a.x, py = sp.a.y;
  for (let k = 0; k <= N; k++) {
    const u = k / N;
    const x = sp.a.x + (sp.b.x - sp.a.x) * u, y = sp.a.y + (sp.b.y - sp.a.y) * u - sp.sag * 4 * u * (1 - u);
    if (k) len += Math.hypot(x - px, y - py);
    pts.push({ u, x, y, s: len });
    px = x; py = y;
  }
  sp.pts = pts; sp.len = len;
  sp.dirX = Math.sign(sp.b.x - sp.a.x);
}

/** Point on span at arc length s: {x, y, slope (dy/ds), ang (screen-space rope angle)}. */
export function ropeAt(sp, s) {
  s = clamp(s, 0, sp.len);
  const P = sp.pts;
  let lo = 0, hi = P.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m].s <= s) lo = m; else hi = m; }
  const a = P[lo], b = P[hi], f = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
  return { x: a.x + dx * f, y: a.y + dy * f, slope: dy / d, ang: Math.atan2(dy, dx) };
}

/** Rope sag under PATCH's weight (visual + y offset), metres. */
export const loadSag = (sp, s) => (sp.kind === 'cable' ? 0.12 : 0.28) * Math.sin(Math.PI * clamp(s / sp.len, 0, 1));

/** Baseline breeze torque on span sp at s (signed rad/s^2, smooth edges). */
export function breezeAt(sp, s) {
  let t = 0;
  for (const z of sp.breeze) {
    if (s < z.s0 - 0.5 || s > z.s1 + 0.5) continue;
    const e = Math.min(1, (s - (z.s0 - 0.5)) / 0.5, ((z.s1 + 0.5) - s) / 0.5);
    t += z.dir * z.str * clamp(e, 0, 1);
  }
  return t;
}
