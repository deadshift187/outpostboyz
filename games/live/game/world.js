// THE STACK: builds the 250 m tower from the 25 authored JSON chunks and runs the
// world's own (non-gift) machinery: crumbly platforms, conveyor belts, patrol
// drones, swinging cables, laser gates, wind gusts, the Crown's sentry eye.
// DOM-free. Everything is deterministic (fixed timings, index hashes), no rolls.
import { TOWER_X0, TOWER_X1, CHUNK_H, TOWER_TOP, BEACON_EVERY, clamp, hash01 } from './consts.js';

let nextId = 1;
export const newId = () => nextId++;

export function mkPlat(x, y, w, kind, extra) {
  return Object.assign({ id: newId(), x, y, w, kind, baseX: x, belt: 0, crumbly: false, alive: true, crumbleT: -1, respawnT: 0, grease: 0, wob: 0, owner: null, ttl: Infinity, born: 0 }, extra || {});
}

/** Pure: chunks JSON + summit level -> tower geometry. */
export function buildTower(chunks, level = 0) {
  const L = Math.max(0, level);
  const spread = 1 + 0.08 * L;           // gap width +8% per summit
  const crumbleShare = 0.12 + 0.04 * L;  // +4 pp per summit
  const platforms = [], cables = [], gates = [], patrols = [], beacons = [];
  const scaleX = (cx, w) => { const nx = 540 + (cx - 540) * spread; return clamp(nx - w / 2, TOWER_X0, TOWER_X1 - w); };
  chunks.forEach((ch, ci) => {
    const base = (ch.id ?? ci) * CHUNK_H;
    ch.p.forEach(([x, y, w, k = 'n'], pi) => {
      const kind = k === 'ground' ? 'ground' : k === 'beacon' ? 'beacon' : k === 'helipad' ? 'helipad' : 'plat';
      const px = kind === 'ground' ? x : scaleX(x + w / 2, w);
      const p = mkPlat(Math.round(px), base + y, w, kind, { chunk: ci, zone: ch.zone });
      if (k === 'b+') p.belt = 180; else if (k === 'b-') p.belt = -180;
      if (kind === 'plat' && hash01(ci, pi, 77) < crumbleShare) p.crumbly = true;
      platforms.push(p);
      if (kind === 'beacon') beacons.push({ y: p.y, x: p.x + p.w / 2, label: null, planted: false });
    });
    for (const [ax, ay, len, amp, ph] of ch.cables || []) cables.push({ id: newId(), ax: clamp(540 + (ax - 540) * spread, TOWER_X0 + 60, TOWER_X1 - 60), ay: base + ay, len, amp, phase: ph, zone: ch.zone });
    for (const [x1, x2, y, ph] of ch.gates || []) {
      const c = 540 + ((x1 + x2) / 2 - 540) * spread, hw = (x2 - x1) / 2;
      gates.push({ id: newId(), x1: clamp(c - hw, TOWER_X0, TOWER_X1), x2: clamp(c + hw, TOWER_X0, TOWER_X1), y: base + y, phase: ph || 0 });
    }
    for (const [x1, x2, y] of ch.drones || []) patrols.push({ id: newId(), x1, x2, y: base + y, x: x1, dir: 1, glow: 0, stunned: 0 });
  });
  beacons.unshift({ y: 0, x: 540, label: null, planted: false });
  beacons.sort((a, b) => a.y - b.y);
  return { platforms, cables, gates, patrols, beacons, top: TOWER_TOP, level: L };
}

export const beaconHeights = () => { const a = []; for (let y = BEACON_EVERY; y < TOWER_TOP; y += BEACON_EVERY) a.push(y); return a; };

// ---------- runtime ----------
export function cablePos(c, t, hz) {
  const w = (2 * Math.PI / 2.8) * hz;
  const th = c.amp * Math.sin(w * t + c.phase * 2 * Math.PI);
  const dth = c.amp * w * Math.cos(w * t + c.phase * 2 * Math.PI);
  return { x: c.ax + c.len * Math.sin(th), y: c.ay - c.len * Math.cos(th), vx: c.len * dth * Math.cos(th), vy: c.len * dth * Math.sin(th), th };
}

export const gateOn = (g, t, hz) => ((t * hz + g.phase) % 4 + 4) % 4 < 2;

/** World tick: platforms (crumble/respawn/ttl/grease/wobble) + patrol drones. */
export function updateWorld(S, dt) {
  const t = S.t;
  const quake = S.fx.quake; // wobble platforms within 15 m of PATCH
  for (const p of S.platforms) {
    if (p.crumbleT >= 0) {
      p.crumbleT += dt;
      if (p.crumbleT >= 0.6 && p.alive) { p.alive = false; p.respawnT = 4; S.emit('crumble', p); }
    }
    if (!p.alive && p.respawnT > 0) {
      p.respawnT -= dt;
      if (p.respawnT <= 0) { p.alive = true; p.crumbleT = -1; S.emit('respawn', p); }
    }
    if (p.grease > 0) p.grease = Math.max(0, p.grease - dt);
    if (p.ttl !== Infinity) { p.ttl -= dt; if (p.ttl <= 0) p.dead = true; }
    const prevWob = p.wob;
    if (quake && p.kind !== 'ground' && Math.abs(p.y - S.player.y) < 1500) p.wob = 40 * Math.sin(quake.t * 9 + p.id * 0.7);
    else p.wob = 0;
    p.x = p.baseX + p.wob;
    p.dx = p.wob - prevWob; // carried to PATCH when standing on it
  }
  if (S.platforms.some((p) => p.dead)) S.platforms = S.platforms.filter((p) => !p.dead);
  // patrol drones
  const hz = S.hz;
  for (const d of S.patrols) {
    if (d.stunned > 0) { d.stunned -= dt; continue; }
    d.x += d.dir * 150 * hz * dt;
    if (d.x > d.x2) { d.x = d.x2; d.dir = -1; }
    if (d.x < d.x1) { d.x = d.x1; d.dir = 1; }
  }
}

/** Zone-baseline hazards that run on the clock (only near PATCH's zone). */
export function zoneHazards(S, dt) {
  const zone = Math.floor(Math.max(0, S.player.y) / 5000) + 1;
  const hz = S.hz, t = S.t;
  // SIGNAL SPIRE wind gusts: 250 px/s^2, telegraphed 1.5 s by flags
  S.wind.baseline = 0; S.wind.flag = 0;
  if (zone === 4 && !S.cine) {
    const period = 10 / hz, ph = t % period, cyc = Math.floor(t / period);
    const d = cyc % 2 ? -1 : 1;
    if (ph < 1.5 * S.knob.telegraphScale) S.wind.flag = d;
    else if (ph < 1.5 * S.knob.telegraphScale + 3) { S.wind.baseline = 250 * hz * d; S.wind.flag = d; }
  }
  // THE CROWN sentry eye sweep every 8 s (dodge or brace)
  if (zone === 5 && !S.cine) {
    S.sentryClock += dt;
    if (S.sentryClock >= 8 / hz) {
      S.sentryClock = 0;
      const row = S.player.ground ? S.player.ground.y : S.player.lastGroundY;
      const dir = S.sentryCount++ % 2 ? -1 : 1;
      S.sweeps.push({ kind: 'sentry', y: row, h: 120, x: dir > 0 ? TOWER_X0 - 60 : TOWER_X1 + 60, dir, speed: 900 * hz, tele: 1.0 * S.knob.telegraphScale, knock: { vx: 700, vy: 300, stun: 0 }, user: null, effect: 'SENTRY' });
      S.emit('sfx', 'overseer');
    }
  } else S.sentryClock = 0;
}
