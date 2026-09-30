// PATCH: the streamer-controlled climber. Run, variable jump (coyote + buffer),
// dash (air-once, i-frames), brace, wall-slide + wall-jump, ladders, cable latch,
// grapple, scripted lifts. DOM-free. The streamer is the only thing that moves
// PATCH: there is no AI runner anywhere in the game.
import {
  GRAV, RUN_MAX, RUN_ACCEL, AIR_ACCEL, JUMP_V, JUMP_CUT, COYOTE, JUMP_BUFFER, DASH_DIST, DASH_TIME, DASH_CD,
  BRACE_MAX, BRACE_CD, BRACE_KNOCK, WALL_SLIDE_V, WALL_JUMP_VX, WALL_JUMP_VY, LADDER_V, MAX_FALL, PW, PH,
  TOWER_X0, TOWER_X1, clamp,
} from './consts.js';
import { cablePos } from './world.js';

const HW = PW / 2;
const PAD_V = Math.sqrt(2 * GRAV * 310); // heart pad: 1.4x jump height = 3.1 m apex

export function newPlayer(x = 540, y = 0) {
  return {
    x, y, vx: 0, vy: 0, kvx: 0, face: 1, ground: null, lastGroundY: y, fallPeakY: y, coyote: 0, buffer: 0, jumpCut: false,
    dashT: 0, dashCd: 0, airDash: true, braceT: 0, braceCd: 0, bracing: false, stun: 0, shield: 0, hurtT: 0,
    ladder: null, cable: null, cableCd: 0, lift: null, wall: 0, wallJumpLock: 0, anim: 'idle', animT: 0,
    lastHit: null, stunLog: [], landT: 0,
  };
}

const overlapX = (P, p) => Math.min(P.x + HW, p.x + p.w) - Math.max(P.x - HW, p.x);

/** Knockback/stun entry point for every hazard. Returns true if it landed. */
export function hit(S, h) {
  const P = S.player;
  if (P.lift || S.cine || S.over) return false;
  if (P.shield > 0) { S.emit('shieldBlock', h); return false; }
  if (h.dashable && P.dashT > 0) { S.emit('nearMiss', { kind: 'dash', h }); return false; }
  const k = S.knob.knockScale * (P.bracing ? BRACE_KNOCK : 1);
  P.kvx = (h.vx || 0) * k;
  if (h.vy) { P.vy = h.vy * k; if (h.vy > 0) P.ground = null; }
  if (Math.abs(P.kvx) > 0 && P.ground && Math.abs(h.vy || 0) < 1) P.vy = Math.max(P.vy, 120 * k); // hop off the ledge
  if (h.vy || Math.abs(P.kvx) > 200) { if (P.ground) { P.lastGroundY = P.ground.y; } P.ground = null; }
  P.ladder = null; P.cable = null;
  // stun budget: at most knob.stunBudgetS of stun in any rolling 5 s window
  if (h.stun > 0) {
    const used = P.stunLog.reduce((n, s) => n + s.d, 0);
    const want = Math.max(P.stun, h.stun);
    const add = Math.min(want - P.stun, Math.max(0, S.knob.stunBudgetS - used - P.stun));
    if (add > 0) P.stun += add;
  }
  P.lastHit = { user: h.user || null, effect: h.effect, gift: h.gift || null, count: h.count || 1, barrage: h.barrage, t: S.t, y: P.ground ? P.ground.y : Math.max(P.lastGroundY, P.y), sabId: h.sabId };
  P.hurtT = 0.45;
  S.emit('hit', h);
  return true;
}

export function startLift(S, toY, dur, kind, then) {
  const P = S.player;
  const plat = ledgeAtOrBelow(S, toY, P.x);
  if (!plat) return false;
  const tx = clamp(P.x, plat.x + 30, plat.x + plat.w - 30);
  P.lift = { fx: P.x, fy: P.y, tx, ty: plat.y, plat, t: 0, dur, kind, then: then || null };
  P.ground = null; P.ladder = null; P.cable = null; P.vx = 0; P.vy = 0; P.kvx = 0; P.stun = 0;
  return true;
}

/** Highest standable, non-crumbly tower ledge with top <= y (for lifts / beacon drops). */
export function ledgeAtOrBelow(S, y, nearX = 540) {
  let best = null, bd = Infinity;
  for (const p of S.platforms) {
    if (!p.alive || p.crumbly || p.ttl !== Infinity || p.y > y || y - p.y > 700) continue;
    const d = (y - p.y) + Math.abs(p.x + p.w / 2 - nearX) * 0.25;
    if (d < bd) { bd = d; best = p; }
  }
  if (!best) for (const p of S.platforms) if (p.alive && (p.kind === 'ground' || p.kind === 'beacon') && p.y <= y && (!best || p.y > best.y)) best = p;
  return best;
}

function landOn(S, P, p, fromY) {
  const fall = Math.max(0, P.lastGroundY - p.y);
  const ov = overlapX(P, p);
  P.y = p.y; P.vy = 0; P.ground = p; P.airDash = true; P.jumpCut = false;
  P.landT = 0.12;
  if (p.crumbly && p.crumbleT < 0) { p.crumbleT = 0; S.emit('sfx', 'crumble'); }
  if (S.fx.greaseNext > 0 && p.kind !== 'net') { p.grease = 6; S.fx.greaseNext--; S.emit('sfx', 'grease'); S.emit('greased', p); }
  // peakFall: from the true top of this airborne stretch (jump apex, lift end, ladder
  // release...), independent of lastGroundY, which some paths reset mid-air.
  const peakFall = Math.max(fall, (P.fallPeakY ?? p.y) - p.y);
  S.emit('land', { plat: p, fall, peakFall, overlap: ov, fromY });
  P.lastGroundY = p.y; P.fallPeakY = p.y;
  if (p.kind === 'pad') { P.vy = PAD_V; P.ground = null; P.jumpCut = false; S.emit('sfx', 'boing'); S.emit('padBounce', p); }
}

export function updatePlayer(S, inp, dt) {
  const P = S.player;
  P.animT += dt;
  P.hurtT = Math.max(0, P.hurtT - dt);
  P.landT = Math.max(0, P.landT - dt);
  P.shield = Math.max(0, P.shield - dt);
  P.dashCd = Math.max(0, P.dashCd - dt);
  P.braceCd = Math.max(0, P.braceCd - dt);
  P.cableCd = Math.max(0, P.cableCd - dt);
  P.wallJumpLock = Math.max(0, P.wallJumpLock - dt);
  if (P.stun > 0) { const d = Math.min(P.stun, dt); P.stun -= d; P.stunLog.push({ t: S.t, d }); }
  while (P.stunLog.length && P.stunLog[0].t < S.t - 5) P.stunLog.shift();
  if (inp.jumpPressed) P.buffer = JUMP_BUFFER; else P.buffer = Math.max(0, P.buffer - dt);

  // ---- scripted lift (zipline / updraft / rocket / storm lift / grapple) ----
  if (P.lift) {
    const L = P.lift; L.t += dt;
    const k = Math.min(1, L.t / L.dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const px = P.x, py = P.y;
    P.x = L.fx + (L.tx - L.fx) * e;
    P.y = L.fy + (L.ty - L.fy) * e + Math.sin(k * Math.PI) * (L.kind === 'grapple' ? 60 : 0);
    P.vx = (P.x - px) / dt; P.vy = (P.y - py) / dt;
    P.anim = 'jump';
    if (k >= 1) {
      P.lift = null; P.vx = 0; P.vy = 0; P.kvx = 0;
      if (L.plat.alive) { P.ground = L.plat; P.y = L.plat.y; } else P.ground = null;
      P.lastGroundY = P.y; P.airDash = true;
      if (L.then && L.then.shield) P.shield = Math.max(P.shield, L.then.shield);
      S.emit('liftEnd', L);
    }
    return;
  }

  const stunned = P.stun > 0;
  let dir = 0;
  if (!stunned) dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  if (dir) P.face = dir;

  // ---- cable latch (DRONE NEST): hold jump to hang on, release to fling ----
  if (P.cable) {
    const c = cablePos(P.cable, S.t, S.hz);
    P.x = c.x; P.y = c.y - PH * 0.5; P.vx = c.vx; P.vy = c.vy;
    P.anim = 'jump';
    if (!inp.jump || stunned) {
      P.cable = null; P.cableCd = 0.35;
      P.vx = clamp(c.vx * 1.1, -900, 900); P.kvx = 0; P.vy = Math.max(c.vy, 0) + 820; P.airDash = true;
      S.emit('sfx', 'jump');
    }
    return;
  }

  // ---- ladders (HELP ladder drop, stall-assist ladder, EXTRACTION rope ladder) ----
  if (!P.ladder && !stunned && (inp.up || (inp.jump && !P.ground && P.vy < 0))) {
    for (const L of S.ladders) {
      const lx = L.x + (L.sway ? L.sway * Math.sin(S.t * 1.6) : 0);
      if (Math.abs(P.x - lx) < 44 && P.y < L.top - 4 && P.y + PH > L.bot) {
        const fell = !P.ground && P.lastGroundY - P.y >= 400;
        P.ladder = L; P.ground = null; P.vy = 0; P.kvx = 0; P.dashT = 0;
        S.emit('sfx', 'ladder');
        if (fell) S.emit('clutch', { kind: 'ladder' });
        break;
      }
    }
  }
  if (P.ladder) {
    const L = P.ladder;
    const lx = L.x + (L.sway ? L.sway * Math.sin(S.t * 1.6) : 0);
    P.x += (lx - P.x) * Math.min(1, dt * 14);
    P.vy = inp.up ? LADDER_V : inp.down ? -LADDER_V : 0;
    P.y += P.vy * dt;
    P.anim = P.vy ? 'run' : 'idle';
    if (L.dead || stunned) P.ladder = null;
    else if (P.y >= L.top - 2) {
      P.ladder = null;
      const top = L.topPlat && L.topPlat.alive && !L.topPlat.dead ? L.topPlat : null;
      if (top) { P.y = top.y; P.x = clamp(P.x, top.x + 10, top.x + top.w - 10); P.ground = top; P.vy = 0; P.lastGroundY = top.y; }
      else P.vy = 600;
    } else if (P.y < L.bot - 30) P.ladder = null;
    else if (dir && !inp.up) { P.ladder = null; P.vx = dir * 300; }
    else if (inp.jumpPressed) { P.ladder = null; P.vy = JUMP_V * 0.9; P.vx = dir * RUN_MAX; P.jumpCut = true; S.emit('sfx', 'jump'); }
    if (P.ladder) return;
  }

  // ---- brace ----
  const wantBrace = inp.down && !stunned && P.braceCd <= 0 && P.dashT <= 0;
  if (wantBrace) {
    if (!P.bracing) S.emit('sfx', 'brace');
    P.bracing = true; P.braceT += dt;
    if (P.braceT >= BRACE_MAX) { P.bracing = false; P.braceT = 0; P.braceCd = BRACE_CD; }
  } else if (P.bracing) { P.bracing = false; P.braceT = 0; P.braceCd = BRACE_CD; }
  const rooted = P.bracing && P.ground;

  // ---- dash ----
  if (inp.dashPressed && !stunned && P.dashCd <= 0 && P.dashT <= 0 && !rooted && (P.ground || P.airDash)) {
    if (!P.ground) P.airDash = false;
    P.dashT = DASH_TIME; P.dashCd = DASH_CD; P.kvx = 0;
    S.emit('sfx', 'dash'); S.emit('dash');
  }

  // ---- horizontal ----
  const fr = P.ground && P.ground.grease > 0 ? 0.1 : 1;
  if (P.dashT > 0) {
    P.dashT -= dt; P.vx = P.face * (DASH_DIST / DASH_TIME); P.vy = 0;
    if (P.dashT <= 0) P.vx = P.face * RUN_MAX;
  } else if (rooted) {
    P.vx = 0;
  } else if (P.wallJumpLock <= 0) {
    const target = dir * RUN_MAX;
    const acc = (P.ground ? RUN_ACCEL : AIR_ACCEL) * fr;
    const d = target - P.vx;
    P.vx += clamp(d, -acc * dt, acc * dt);
  }
  // knockback decays (slower on grease), wind pushes unless braced on the ground
  P.kvx *= Math.exp(-(P.ground ? 6 * fr : 1.4) * dt);
  if (!rooted && P.dashT <= 0) P.kvx += (S.wind.baseline + S.wind.gift) * dt;
  if (Math.abs(P.kvx) < 2) P.kvx = 0;

  // ---- jump ----
  if (!P.ground) P.coyote = Math.max(0, P.coyote - dt); else P.coyote = COYOTE;
  if (P.buffer > 0 && !stunned && !rooted) {
    if (P.ground || P.coyote > 0) {
      P.vy = JUMP_V; P.ground = null; P.coyote = 0; P.buffer = 0; P.jumpCut = true; P.dashT = 0;
      S.emit('sfx', 'jump');
    } else if (P.wall && P.vy < 200) {
      P.vy = WALL_JUMP_VY; P.vx = -P.wall * WALL_JUMP_VX; P.face = -P.wall; P.wallJumpLock = 0.14; P.buffer = 0; P.jumpCut = true;
      S.emit('sfx', 'jump');
    }
  }
  if (P.jumpCut && !inp.jump && P.vy > 0) { P.vy *= JUMP_CUT; P.jumpCut = false; }
  if (P.vy <= 0) P.jumpCut = false;

  // ---- cable grab check (needs jump held, airborne) ----
  if (!P.ground && inp.jump && P.cableCd <= 0 && !stunned) {
    for (const c of S.cables) {
      if (Math.abs(c.ay - P.y) > 500) continue;
      const cp = cablePos(c, S.t, S.hz);
      if (Math.hypot(cp.x - P.x, cp.y - (P.y + PH * 0.5)) < 72) {
        const fell = P.lastGroundY - P.y >= 400;
        P.cable = c; P.vx = 0; P.kvx = 0; P.dashT = 0; P.airDash = true;
        S.emit('sfx', 'ladder');
        if (fell) S.emit('clutch', { kind: 'cable' });
        return;
      }
    }
  }

  // ---- gravity + wall slide ----
  if (P.dashT <= 0 && !P.ground) P.vy -= GRAV * dt;
  if (P.vy < -MAX_FALL) P.vy = -MAX_FALL;
  if (P.wall && !P.ground && dir === P.wall && P.vy < -WALL_SLIDE_V) { P.vy = -WALL_SLIDE_V; P.sliding = true; } else P.sliding = false;

  // ---- integrate X ----
  let vx = P.vx + P.kvx;
  if (P.ground && !rooted) { vx += P.ground.belt || 0; P.x += P.ground.dx || 0; }
  P.x += vx * dt;
  P.wall = 0;
  if (P.x < TOWER_X0 + HW) { P.x = TOWER_X0 + HW; P.wall = -1; if (P.kvx < 0) P.kvx = 0; if (P.vx < 0) P.vx = 0; }
  if (P.x > TOWER_X1 - HW) { P.x = TOWER_X1 - HW; P.wall = 1; if (P.kvx > 0) P.kvx = 0; if (P.vx > 0) P.vx = 0; }

  // ---- integrate Y + one-way landing ----
  const prevY = P.y;
  if (P.ground) {
    const g = P.ground;
    if (!g.alive || g.dead || overlapX(P, g) <= 2 || (g.kind === 'net' && !S.net)) {
      P.ground = null; P.lastGroundY = g.y;
    } else { P.y = g.y; }
  }
  if (!P.ground) {
    P.y += P.vy * dt;
    if (P.vy <= 0) {
      let best = null;
      for (const p of S.platforms) {
        if (!p.alive || p.y > prevY + 0.5 || p.y < P.y - 0.5) continue;
        if (overlapX(P, p) <= 4) continue;
        if (!best || p.y > best.y) best = p;
      }
      const net = S.net;
      if (net && prevY >= net.y - 0.5 && P.y <= net.y && (!best || net.y > best.y)) best = net;
      if (best) landOn(S, P, best, prevY);
    }
  }
  if (P.y < -40 && !P.ground) { const g = S.platforms.find((p) => p.kind === 'ground'); if (g) { P.y = 0; landOn(S, P, g, prevY); } }

  // ---- animation ----
  if (P.hurtT > 0.2 || stunned) P.anim = 'hurt';
  else if (P.bracing) P.anim = 'brace';
  else if (P.ground) P.anim = Math.abs(vx) > 40 ? 'run' : 'idle';
  else P.anim = P.vy > 0 ? 'jump' : 'fall';
}

/** Metres PATCH has dropped from the true peak of the current fall (0 when supported). Drives the HUD FALLING counter. */
export const fallDropM = (P) => (P.ground || P.ladder || P.cable || P.lift ? 0 : Math.max(0, ((P.fallPeakY ?? P.lastGroundY) - P.y) / 100));

/** Hitbox helpers for hazards. */
export const pBox = (P) => ({ x0: P.x - HW, x1: P.x + HW, y0: P.y, y1: P.y + PH });
export const boxDist = (b, x0, y0, x1, y1) => {
  const dx = Math.max(x0 - b.x1, b.x0 - x1, 0), dy = Math.max(y0 - b.y1, b.y0 - y1, 0);
  return Math.hypot(dx, dy);
};
