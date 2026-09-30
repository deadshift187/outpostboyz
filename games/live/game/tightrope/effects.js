// TIGHTROPE gifts -> deterministic effects, plus every safety valve: Sab Heat + JAMMER,
// the SAB PUSH CAP (summed viewer torque can never exceed a fixed share of PATCH's full lean,
// so a reacting streamer can always hold the rope), a kick budget per 5 s, concurrency caps,
// PANIC, the pause/break queue and the BARRAGE backlog folding from CLIMB OR DIE.
// No gift is ever eaten: every event is credited on arrival and every instance fires or waits.
// Every effect has a fixed strength, fixed duration and a fixed direction rule
// (alternating left/right, telegraphed). There are no random rolls anywhere. DOM-free.
import { BAL, HEAT, CAPS, PAL, clamp } from './consts.js';
import { cleanEvent, cleanNick, NICK_MAX, platformOf, platformBadge } from '../effects.js';
export { cleanEvent, cleanNick, platformOf, platformBadge };

export const EFFECT_NAMES = {
  STEADY: 'STEADY HANDS', CHALK: 'GRIP CHALK', POLE: 'LONGER POLE', CALM: 'CALM AIR', HARNESS: 'SAFETY HARNESS',
  SPOTTER: 'SPOTTER DRONE', LADDER: 'ROPE LADDER', ZIPLINE: 'ZIPLINE', ANCHOR: 'ANCHOR PLANT', NET: 'SAFETY NET',
  SKYBRIDGE: 'SKY BRIDGE', EXTRACTION: 'EXTRACTION CALL', CROWD_CALM: 'CROWD CALM',
  GUST: 'GUST OF WIND', PIGEON: 'PIGEON', TWANG: 'ROPE TWANG', PEEL: 'BANANA PEEL', SHAKE: 'ROPE SHAKE', DRONE: 'DRONE BUZZ',
  FOG: 'FOG BANK', STORM: 'STORM FRONT', CRANE: 'AI CRANE', WRECKING: 'WRECKING CREW', SUPERCELL: 'SUPERCELL', OVERSEER: 'THE OVERSEER',
  CROWD_GUST: 'CROWD GUST', BARRAGE: 'SAB BARRAGE', BREEZE: 'CROSS BREEZE',
};
export const TEAM_COLOR = { help: PAL.help, sab: PAL.sab };
const LIFTS = new Set(['LADDER', 'ZIPLINE', 'SKYBRIDGE', 'EXTRACTION']);
const LIFT_SPANS = { LADDER: 1, ZIPLINE: 2, SKYBRIDGE: 4, EXTRACTION: 99 };

export const DEFAULT_TIERS = [
  { min: 1, max: 4, side: 'gift', help: 'STEADY', sab: 'GUST' }, { min: 5, max: 9, side: 'gift', help: 'CHALK', sab: 'PIGEON' },
  { min: 10, max: 99, help: 'POLE', sab: 'TWANG' }, { min: 100, max: 198, help: 'CALM', sab: 'PEEL' },
  { min: 199, max: 498, help: 'HARNESS', sab: 'SHAKE' }, { min: 499, max: 698, help: 'SPOTTER', sab: 'DRONE' },
  { min: 699, max: 999, help: 'LADDER', sab: 'FOG' }, { min: 1000, max: 1499, help: 'ZIPLINE', sab: 'STORM' },
  { min: 1500, max: 4999, help: 'ANCHOR', sab: 'CRANE' }, { min: 5000, max: 19999, help: 'NET', sab: 'WRECKING' },
  { min: 20000, max: 29998, help: 'SKYBRIDGE', sab: 'SUPERCELL' }, { min: 29999, max: null, help: 'EXTRACTION', sab: 'OVERSEER' },
];
const DEFAULT_SIDES = { rose: 'help', fingerheart: 'help', tiktok: 'sab', panda: 'sab' };
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function heatFor(coins) {
  if (coins >= 1000) return HEAT.whale;
  if (coins >= 699) return HEAT[699]; if (coins >= 499) return HEAT[499]; if (coins >= 199) return HEAT[199];
  if (coins >= 100) return HEAT[100]; if (coins >= 10) return HEAT[10]; if (coins >= 5) return HEAT[5];
  return HEAT[1];
}

// ---------------- teams / stats ----------------
const HELP_WORDS = new Set(['help', 'helper', 'h!']);
const SAB_WORDS = new Set(['sab', 'sabotage', 's!']);
export function teamOf(S, user) { const t = user && S.teams.get(user.id); return t ? t.team : null; }
export function chip(S, text, color) { S.chips.push({ text, color, t: 2.2 }); if (S.chips.length > 5) S.chips.shift(); }

export function onComment(S, evt) {
  const w = String(evt.text || '').trim().toLowerCase().replace(/[.,;:]+$/, '');
  const team = HELP_WORDS.has(w) ? 'help' : SAB_WORDS.has(w) ? 'sab' : null;
  if (!team) return null;
  const u = evt.user, cur = S.teams.get(u.id);
  if (cur && cur.team === team) return null;
  if (cur && S.sessionT - cur.at < 600) { chip(S, `@${u.nickname}: team switch in ${Math.ceil((600 - (S.sessionT - cur.at)) / 60)} min`, PAL.bone); return null; }
  S.teams.set(u.id, { team, at: S.sessionT, name: u.nickname });
  stat(S, u).team = team;
  chip(S, `@${u.nickname} joined ${team.toUpperCase()}`, TEAM_COLOR[team]);
  S.emit('sfx', 'comment');
  return team;
}

export function stat(S, user) {
  let s = S.session.get(user.id);
  if (!s) {
    s = { id: user.id, name: '@' + (user.nickname || 'viewer'), team: teamOf(S, user), metersGiven: 0, saves: 0, falls: 0, dropM: 0, revengesSuffered: 0, coinsHelp: 0, coinsSab: 0, platform: platformOf(user.id) };
    S.session.set(user.id, s);
  }
  s.name = '@' + (user.nickname || s.name.slice(1));
  return s;
}
function runStat(S, user) {
  let r = S.run.users.get(user.id);
  if (!r) { r = { id: user.id, name: '@' + user.nickname, given: 0, falls: 0, dropM: 0 }; S.run.users.set(user.id, r); }
  return r;
}
export function creditGiven(S, owner, m) {
  if (!owner || !(m > 0)) return;
  stat(S, owner).metersGiven += m; runStat(S, owner).given += m; S.run.given += m;
}
export function creditFall(S, owner, dropM) {
  if (!owner) return;
  const st = stat(S, owner); st.falls++; st.dropM += dropM;
  const r = runStat(S, owner); r.falls++; r.dropM += dropM;
}

// ---------------- resolve ----------------
export function resolveGift(S, evt) {
  const g = evt.gift || {}, coins = Math.max(1, Number(g.coins) || 1); // a 0-coin gift acts at tier 1 (credits 0 coins)
  const tiers = (S.cfg && Array.isArray(S.cfg.tiers) && S.cfg.tiers.length) ? S.cfg.tiers : DEFAULT_TIERS;
  const tier = tiers.find((t) => coins >= t.min && (t.max == null || coins <= t.max)) || tiers[0];
  const sides = S.cfg && S.cfg.giftSides ? Object.fromEntries(Object.entries(S.cfg.giftSides).map(([k, v]) => [norm(k), v])) : DEFAULT_SIDES;
  const team = teamOf(S, evt.user);
  const side = tier.side === 'gift' ? sides[norm(g.name)] || team || 'help' : team || 'help';
  return { tier, side, effect: tier[side], coins, heat: heatFor(coins), whale: coins >= 1000, noTeamDefault: tier.side !== 'gift' && !team };
}

// ---------------- intake ----------------
/** Every platform event. Returns a feed label (or null). */
export function intake(S, evt) {
  const u = evt.user || { id: 'anon', nickname: 'viewer' };
  if (evt.type === 'comment') {
    onComment(S, evt);
    const cl = Math.max(0, Math.min(1000, Math.floor(Number(evt.chatLikes)) || 0)); // Twitch/YouTube chat charge
    if (cl) addLikes(S, u, cl);
    return null;
  }
  if (evt.type === 'like') { addLikes(S, u, Number(evt.likeCount) || 1); return null; }
  if (evt.type === 'share') {
    const team = teamOf(S, u) || 'help';
    S.crowd.boost[team] = true; chip(S, `@${u.nickname} ${evt.raid ? 'raided' : 'shared'}: crowd meter x2 for ${team.toUpperCase()}`, TEAM_COLOR[team]);
    return 'CROWD METER x2';
  }
  if (evt.type === 'gift' || evt.type === 'follow' || evt.type === 'sub') {
    if (evt.type === 'gift') {
      const r = resolveGift(S, evt), n = evt.gift.count;
      const st = stat(S, u), real = Math.max(0, Number(evt.gift.coins) || 0);
      if (r.side === 'help') st.coinsHelp += real * n; else st.coinsSab += real * n;
      S.credited.coins += real * n; S.credited.gifts += n;
      if (r.noTeamDefault && !S.tipped.has(u.id)) { S.tipped.add(u.id); chip(S, `tip: comment sab to switch (@${u.nickname})`, PAL.bone); }
    }
    if (S.holding()) {
      S.held.push(evt);
      while (S.held.length > BACKLOG.heldCap) foldHeld(S, S.held.shift());
      return labelFor(S, evt);
    }
    dispatchEvent(S, evt);
    return labelFor(S, evt);
  }
  return null;
}
function labelFor(S, evt) {
  if (evt.type !== 'gift') return evt.type === 'follow' ? 'STEADY HANDS ★NEW' : evt.type === 'sub' ? 'SAFETY HARNESS ★SUB' : null;
  const r = resolveGift(S, evt);
  return `${r.side === 'help' ? 'HELP' : 'SAB'}: ${EFFECT_NAMES[r.effect] || r.effect}`;
}
function instOf(S, evt) {
  const u = evt.user || { id: 'anon', nickname: 'viewer' };
  if (evt.type === 'follow') return { inst: { effect: 'STEADY', side: 'help', user: u, tag: '★NEW', coins: 0, heat: 0 }, n: 1 };
  if (evt.type === 'sub') return { inst: { effect: 'HARNESS', side: 'help', user: u, tag: '★SUB', coins: 0, heat: 0 }, n: 1 };
  const r = resolveGift(S, evt), n = evt.gift.count;
  return { inst: { effect: r.effect, side: r.side, user: u, gift: evt.gift.name, coins: r.coins, heat: r.heat, whale: r.whale, count: n }, n };
}
export function dispatchEvent(S, evt) { const { inst, n } = instOf(S, evt); schedule(S, inst, n); }

// ---------------- backlog (same rules as CLIMB OR DIE) ----------------
export const BACKLOG = { maxAgeS: 20, keepNewest: 30, bigCap: 6, helpCap: 6, perEvent: 30, heldCap: 40, crewKeep: 40, idsKeep: 2000 };
const KIND_CAP = { STORM: 1, SUPERCELL: 1, OVERSEER: 1, CRANE: 1, WRECKING: 1, FOG: 1, SHAKE: 2, DRONE: 2 };
const groupOf = (p) => (p.side === 'help' ? 'help' : (p.coins || 0) >= 100 ? 'big' : 'low');

// (The platform whale banner is a compact strip in the bottom lane - tightrope.js overlayLayout - so a whale SAB's
// telegraph starts right away: the storm countdown / crane ring is never behind the banner.)
function schedule(S, inst, n) {
  const solo = Math.min(n, BACKLOG.perEvent);
  for (let i = 0; i < solo; i++) { S.pending.push({ ...inst, at: S.t + i * 0.25, idx: i, uid: S.effSeq++ }); S.credited.effects++; }
  if (n > solo) {
    const p = { ...inst, at: S.t + solo * 0.25, idx: solo, uid: 0 };
    const b = newBarrage(S, groupOf(p), p);
    absorb(S, b, p, n - solo);
    S.credited.effects += n - solo;
    S.pending.push(b);
  }
}
function foldHeld(S, evt) {
  const { inst, n } = instOf(S, evt);
  const group = groupOf(inst), key = group === 'help' ? 'help:' + inst.effect : group;
  let b = S.heldFold.get(key);
  if (!b) { b = newBarrage(S, group, inst); S.heldFold.set(key, b); }
  absorb(S, b, inst, n);
  S.credited.effects += n;
}
export function releaseFolds(S) {
  if (!S.heldFold.size) return;
  for (const b of S.heldFold.values()) { b.at = S.t; b.qAt = S.t; S.pending.push(b); }
  S.heldFold.clear();
}
function newBarrage(S, group, p) {
  S.barrages[group]++;
  return {
    effect: group === 'low' ? 'BARRAGE' : p.effect, side: p.side, user: p.user || null, gift: p.gift, coins: p.coins || 0,
    heat: group === 'low' ? 0 : p.heat || 0, whale: !!p.whale, count: 0, tag: p.tag, at: p.at ?? S.t, qAt: p.qAt ?? S.t, uid: S.effSeq++,
    barrage: { group, n: 0, crew: [], ids: new Set(), others: 0, kinds: {}, kindCoins: {}, kindGift: {}, topCoins: p.coins || 0 },
  };
}
function absorb(S, b, p, k = 1) {
  const B = b.barrage;
  B.n += k; b.count = B.n;
  B.kinds[p.effect] = (B.kinds[p.effect] || 0) + k;
  B.kindCoins[p.effect] = Math.max(B.kindCoins[p.effect] || 0, p.coins || 0);
  if (p.effect === b.effect || !B.kindGift[p.effect]) B.kindGift[p.effect] = p.gift;
  if (p.user) {
    const id = p.user.id;
    if (!B.ids.has(id)) {
      if (B.ids.size < BACKLOG.idsKeep) B.ids.add(id);
      if (B.crew.length < BACKLOG.crewKeep) B.crew.push(p.user); else B.others++;
    }
  }
  if (!b.user && p.user) b.user = p.user;
  if (B.group === 'low') b.heat = Math.min(30, (b.heat || 0) + (p.heat || 0) * k);
  else if ((p.coins || 0) > B.topCoins) { B.topCoins = p.coins; b.effect = p.effect; b.coins = p.coins; b.heat = p.heat; b.gift = p.gift; b.whale = !!p.whale; }
  S.fired.merged += k;
}
const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
const graphemes = (s) => (seg ? [...seg.segment(String(s))].map((g) => g.segment) : [...String(s)]);
export function crewNames(B, maxChars = 28) {
  const crew = B.crew.length ? B.crew : [{ nickname: 'viewer' }];
  const shown = crew.slice(0, 2), others = crew.length - shown.length + B.others;
  const tail = others > 0 ? ` +${others} other${others === 1 ? '' : 's'}` : '';
  for (let k = NICK_MAX; k >= 3; k--) {
    const s = shown.map((u) => { const g = graphemes(String(u.nickname)); return '@' + (g.length > k ? g.slice(0, k - 1).join('') + '…' : g.join('')); }).join(', ') + tail;
    if (graphemes(s).length <= maxChars || k === 3) return s;
  }
  return tail.trim();
}
export const barrageLabel = (B, maxChars = 54) => `${crewNames(B, maxChars - 14)} · BARRAGE ×${B.n}`;

function compactSab(S) {
  const Q = S.sabQ, cut = Q.length - BACKLOG.keepNewest;
  let low = null, big = null, bigN = 0, changed = false; const perKind = {};
  const held = S.jammer > 0 || S.panic > 0 || S.grace > 0;
  for (const p of Q) if (p.barrage) { if (p.barrage.group === 'low') low = p; else big = p; }
  const out = [];
  for (let i = 0; i < Q.length; i++) {
    const p = Q[i];
    if (p.barrage || p.effect === 'CROWD_GUST') { out.push(p); continue; }
    if ((p.coins || 0) >= 100) {
      const kc = (perKind[p.effect] = (perKind[p.effect] || 0) + 1);
      if (++bigN <= BACKLOG.bigCap && kc <= (KIND_CAP[p.effect] || BACKLOG.bigCap)) { out.push(p); continue; }
      if (!big) { big = newBarrage(S, 'big', p); out.push(big); }
      absorb(S, big, p); changed = true;
      continue;
    }
    if (i < cut || held || S.t - (p.qAt ?? S.t) > BACKLOG.maxAgeS) {
      if (!low) { low = newBarrage(S, 'low', p); out.push(low); }
      absorb(S, low, p); changed = true;
    } else out.push(p);
  }
  if (changed) S.sabQ = out;
}
function compactHelp(S) {
  let n = 0, b = null, changed = false;
  for (const p of S.pending) if (p.barrage && p.side === 'help' && LIFTS.has(p.effect) && p.at <= S.t) b = p;
  const out = [];
  for (const p of S.pending) {
    if (p.side !== 'help' || p.barrage || p.at > S.t || !LIFTS.has(p.effect)) { out.push(p); continue; }
    if (++n <= BACKLOG.helpCap) { out.push(p); continue; }
    if (!b) { b = newBarrage(S, 'help', p); out.push(b); }
    absorb(S, b, p); changed = true;
  }
  if (changed) S.pending = out;
}
function pickBig(S, p) {
  const B = p.barrage;
  const kinds = Object.keys(B.kinds).sort((a, c) => (B.kindCoins[c] || 0) - (B.kindCoins[a] || 0));
  for (const e of kinds) if (canFire(S, e)) { p.effect = e; p.coins = B.kindCoins[e] || p.coins; p.heat = heatFor(p.coins); p.whale = p.coins >= 1000; p.gift = B.kindGift[e] || p.gift; return true; }
  return false;
}
function announceBarrage(S, p) {
  const B = p.barrage, color = TEAM_COLOR[p.side === 'help' ? 'help' : 'sab'];
  const what = p.effect === 'BARRAGE' ? 'SAB BURST' : `${p.side === 'help' ? 'HELP' : 'SAB'}: ${EFFECT_NAMES[p.effect] || p.effect}`;
  S.feedOut.push({ text: barrageLabel(B, 40), color, fit: 'shrink', user: B.crew[0] || p.user || { id: 'barrage', nickname: 'B' } });
  if (S.feedOut.length > 20) S.feedOut.shift();
  chip(S, `BARRAGE ×${B.n}: ${what}`, color);
  S.fired.barrage++; if (p.side === 'sab') S.fired.sabBarrage = (S.fired.sabBarrage || 0) + 1;
}

// ---------------- likes / crowd meter ----------------
export function addLikes(S, user, n) {
  const L = S.crowd, team = teamOf(S, user);
  L.charge += n; S.credited.likes += n;
  if (team) L[team] += n * (L.boost[team] ? 2 : 1);
  if (L.contrib.size < 500 || L.contrib.has(user.id)) L.contrib.set(user.id, { user, team, n: ((L.contrib.get(user.id) || {}).n || 0) + n });
}
function tickCrowd(S) {
  const L = S.crowd, need = S.knob.crowdLikes;
  if (L.charge < need || S.t - L.last < 20) return;
  const h = L.help, s = L.sab, contrib = [...L.contrib.values()];
  L.charge = Math.min(need * 0.5, L.charge - need); L.help = 0; L.sab = 0; L.boost = { help: false, sab: false }; L.contrib = new Map(); L.last = S.t;
  if (h > s) { S.pending.push({ effect: 'CROWD_CALM', side: 'help', user: null, likers: contrib.filter((c) => c.team === 'help'), at: S.t, uid: S.effSeq++, heat: 0 }); S.credited.effects++; }
  else if (s > h) { S.pending.push({ effect: 'CROWD_GUST', side: 'sab', user: null, likers: contrib.filter((c) => c.team === 'sab'), at: S.t, uid: S.effSeq++, heat: 15, coins: 0 }); S.credited.effects++; }
  else { S.flash = 0.3; S.emit('sfx', 'cheer'); chip(S, 'THE CROWD CHEERS', PAL.bone); }
}

// ---------------- gating ----------------
/** SAB is aimed at the rope: it waits while PATCH stands on an anchor ledge, falls, rides a lift or summits. */
export function onRope(S) { const P = S.P; return P.phase === 'walk' && P.s >= BAL.SAFE_END && !S.cine; }
const remaining = (S) => S.world.spans[S.P.span].len - S.P.s;
export function canFire(S, e) {
  const Hz = S.haz;
  switch (e) {
    case 'GUST': case 'CROWD_GUST': return Hz.gusts.length < CAPS.GUST;
    case 'PIGEON': return Hz.pigeons.length < CAPS.PIGEON;
    case 'TWANG': return !Hz.twang;
    case 'PEEL': return Hz.peels.filter((p) => p.span === S.P.span).length < CAPS.PEEL && remaining(S) >= 1.6;
    case 'SHAKE': return !Hz.shake;
    case 'DRONE': return Hz.drones.length < CAPS.DRONE;
    case 'FOG': return !Hz.fog || Hz.fog.t < 25;
    case 'STORM': case 'SUPERCELL': return !Hz.storm;
    case 'CRANE': case 'WRECKING': return !Hz.crane && remaining(S) >= 1.2;
    case 'OVERSEER': return !Hz.storm && !Hz.crane && remaining(S) >= 1.2;
    default: return true;
  }
}

// ---------------- per-frame dispatch ----------------
export function tickDispatch(S, dt) {
  if (S.jammer > 0) {
    S.jammer = Math.max(0, S.jammer - dt);
    S.heat = Math.max(0, S.heat - (S.heatAtJam / 8) * dt);
    if (S.jammer === 0) { S.heat = 0; chip(S, 'JAMMER OFFLINE', PAL.sab); }
  } else S.heat = Math.max(0, S.heat - S.knob.heatDecay * dt);
  if (S.panic > 0) S.panic = Math.max(0, S.panic - dt);
  tickCrowd(S);
  const P = S.P;
  for (let i = 0; i < S.pending.length; i++) {
    const p = S.pending[i];
    if (p.at > S.t) continue;
    if (p.side === 'sab') { p.qAt = S.t; S.sabQ.push(p); S.pending.splice(i--, 1); continue; }
    if (LIFTS.has(p.effect) && P.phase !== 'walk') continue; // lifts wait for each other / for the fall to finish
    if (p.effect === 'ANCHOR' && P.phase !== 'walk') continue;
    S.pending.splice(i--, 1);
    fireHelp(S, p);
    if (p.barrage) announceBarrage(S, p); else S.fired.help++;
  }
  S.compactClock = (S.compactClock || 0) - dt;
  if (S.compactClock <= 0) { S.compactClock = 0.25; compactSab(S); compactHelp(S); }
  if (S.panic > 0 || S.jammer > 0 || S.grace > 0 || !S.sabQ.length || S.t - S.lastSab < 0.25 || !onRope(S)) return;
  const scan = Math.min(S.sabQ.length, 40);
  for (let i = 0; i < scan; i++) {
    const p = S.sabQ[i];
    if (p.barrage && p.barrage.group === 'big') { if (!pickBig(S, p)) continue; }
    else if (!canFire(S, p.effect)) continue;
    S.sabQ.splice(i, 1);
    fireSab(S, p);
    if (p.barrage) announceBarrage(S, p); else S.fired.sab++;
    S.lastSab = S.t;
    S.heat += p.heat || 0;
    S.maxHeat = Math.max(S.maxHeat, S.heat);
    if (S.heat >= S.knob.heatCap) { S.jammer = 8; S.heatAtJam = S.heat; S.jams++; chip(S, 'HEAT MAXED: JAMMER 8s', PAL.help); S.emit('sfx', 'jammer'); }
    break;
  }
}

// ---------------- HELP ----------------
const ownerOf = (p) => (p.user ? { id: p.user.id, nickname: p.user.nickname, team: 'help' } : null);
const tagOf = (p) => (p.barrage ? `BARRAGE ×${p.barrage.n}` : p.user ? `@${p.user.nickname}${p.tag ? ' ' + p.tag : ''}` : null);
function crewOf(p) { if (p.barrage) return p.barrage.crew.map((u) => ({ id: u.id, nickname: u.nickname, team: 'help' })); if (p.likers) return p.likers.map((c) => ({ ...c.user, team: 'help' })); const o = ownerOf(p); return o ? [o] : []; }

function buff(S, key, add, max, p) {
  const b = S.buff[key] || (S.buff[key] = { t: 0, owners: [] });
  b.t = Math.min(max, b.t + add);
  for (const o of crewOf(p)) if (!b.owners.some((x) => x.id === o.id)) { b.owners.push(o); if (b.owners.length > 8) b.owners.shift(); }
  b.tag = tagOf(p);
  return b;
}

export function fireHelp(S, p) {
  const P = S.P;
  S.run.helpLog.push({ t: S.sessionT, crew: crewOf(p) });
  if (S.run.helpLog.length > 400) S.run.helpLog.shift();
  const tag = tagOf(p);
  switch (p.effect) {
    case 'STEADY':
      P.omega *= 0.35; P.theta *= 0.8;
      buff(S, 'steady', 1.0, 3, p);
      S.emit('sfx', 'steady'); S.emit('pop', { kind: 'steady', tag });
      break;
    case 'CHALK':
      P.grip = Math.min(BAL.GRIP_MAX, P.grip + 1.5);
      buff(S, 'chalk', 6, 20, p);
      S.emit('sfx', 'chalk'); S.emit('pop', { kind: 'chalk', tag });
      break;
    case 'POLE': buff(S, 'pole', 15, 45, p); S.emit('sfx', 'pole'); break;
    case 'CALM': buff(S, 'calm', 10, 30, p); S.emit('sfx', 'calm'); break;
    case 'CROWD_CALM': {
      buff(S, 'calm', 6, 30, p); P.omega *= 0.4;
      S.flash = 0.25; S.emit('sfx', 'calm'); chip(S, 'CROWD CALM: 6s CALM AIR (HELP likes)', PAL.help);
      break;
    }
    case 'HARNESS': {
      const owners = crewOf(p);
      if (S.buff.harness.length < CAPS.HARNESS) S.buff.harness.push({ owner: owners[0] || null, crew: owners, tag });
      else { buff(S, 'calm', 5, 30, p); chip(S, `${tag || 'HARNESS'}: 3 HARNESSES ALREADY ON · +5s CALM AIR`, PAL.help); }
      S.emit('sfx', 'harness');
      break;
    }
    case 'SPOTTER': buff(S, 'spotter', 15, 45, p); S.emit('sfx', 'spotter'); break;
    case 'NET': buff(S, 'net', 60, 120, p); S.emit('sfx', 'net'); break;
    case 'ANCHOR': {
      const sp = S.world.spans[P.span];
      if (P.phase === 'walk' && P.s > BAL.SAFE_END && P.s < sp.len - 0.6 && !(S.resume.span === P.span && S.resume.s >= P.s)) {
        S.resume = { span: P.span, s: P.s, owner: crewOf(p)[0] || null, tag: tag ? `${tag}'s anchor` : 'ANCHOR', planted: true };
        S.emit('sfx', 'anchor'); chip(S, `${tag || 'ANCHOR'} PLANTED AN ANCHOR MID-ROPE`, PAL.help);
      } else { buff(S, 'calm', 10, 30, p); buff(S, 'pole', 10, 45, p); chip(S, `${tag || 'ANCHOR'}: ALREADY ANCHORED · +10s CALM + POLE`, PAL.help); }
      break;
    }
    case 'LADDER': case 'ZIPLINE': case 'SKYBRIDGE': case 'EXTRACTION': {
      const n = S.world.n;
      const target = Math.min(n - 1, P.span + LIFT_SPANS[p.effect]); // THE LAST SPAN IS YOURS
      if (p.effect === 'EXTRACTION') S.cinema = { kind: 'extraction', t: 0, dur: 3.2, user: p.user };
      if (target <= P.span) {
        buff(S, 'calm', 10, 30, p); buff(S, 'pole', 10, 45, p);
        if (p.effect === 'EXTRACTION' && S.buff.harness.length < CAPS.HARNESS) S.buff.harness.push({ owner: crewOf(p)[0] || null, crew: crewOf(p), tag });
        chip(S, 'THE LAST SPAN IS YOURS · +10s CALM + POLE', PAL.bone);
        break;
      }
      S.emit('lift', { kind: p.effect, target, crew: crewOf(p), tag, user: p.user });
      if (p.effect === 'EXTRACTION') { buff(S, 'calm', 10, 30, p); if (S.buff.harness.length < CAPS.HARNESS) S.buff.harness.push({ owner: crewOf(p)[0] || null, crew: crewOf(p), tag }); }
      break;
    }
    default: break;
  }
}

// ---------------- SAB ----------------
function srcOf(p) { return { user: p.user || null, effect: p.effect, gift: p.gift, count: p.count || 1, barrage: p.barrage || null, uid: p.uid, likers: p.likers || null, tag: tagOf(p) || (p.likers ? 'CROWD' : null) }; }
const nextDir = (S) => (S.dirSeq = -(S.dirSeq || 1)); // deterministic: left, right, left, right...

export function fireSab(S, p, teleMul = p.barrage && p.barrage.group === 'big' ? 1.5 : 1) {
  const Hz = S.haz, P = S.P, T = S.knob.telegraphScale * teleMul, src = srcOf(p);
  const sp = S.world.spans[P.span];
  switch (p.effect) {
    case 'GUST': Hz.gusts.push({ src, dir: nextDir(S), tele: 0.8 * T, tele0: 0.8 * T, t: 0, dur: 0.5, str: 2.4 }); S.emit('sfx', 'whoosh'); break;
    case 'CROWD_GUST': Hz.gusts.push({ src, dir: nextDir(S), tele: 1.0 * T, tele0: 1.0 * T, t: 0, dur: 0.6, str: 2.8 }); S.emit('sfx', 'whoosh'); chip(S, 'CROWD GUST (SAB likes)', PAL.sab); break;
    case 'PIGEON': {
      const L = Hz.pigeons.filter((q) => q.end < 0).length, R = Hz.pigeons.length - L;
      const end = L === R ? nextDir(S) : L < R ? -1 : 1; // an uneven pair lands on the lighter end (two pigeons cancel out)
      Hz.pigeons.push({ src, end, tele: 0.8 * T, tele0: 0.8 * T, t: 6, str: 1.0 }); S.emit('sfx', 'coo');
      break;
    }
    case 'TWANG': Hz.twang = { src, tele: 0.6 * T, tele0: 0.6 * T, t: 0, dur: 1.2, amp: 2.2, freq: 2.4, from: P.s < sp.len / 2 ? 0 : 1 }; S.emit('sfx', 'twang'); break;
    case 'SHAKE': Hz.shake = { src, tele: 1.0 * T, tele0: 1.0 * T, t: 0, dur: 3.5, amp: 2.8, freq: 1.5, from: P.s < sp.len / 2 ? 0 : 1 }; S.emit('sfx', 'rev'); break;
    case 'PEEL': {
      const s = Math.min(P.s + 2.2, sp.len - 0.6);
      Hz.peels.push({ src, span: P.span, s: Math.max(P.s + 1.0, s), drop: 0.8 * T, drop0: 0.8 * T, ttl: 25 }); S.emit('sfx', 'peel');
      break;
    }
    case 'DRONE': Hz.drones.push({ src, passes: 5, next: 0.6 * T, tele: 0, push: 0, side: nextDir(S), T, ang: 0 }); S.emit('sfx', 'buzz'); break;
    case 'FOG': if (Hz.fog) { Hz.fog.t = Math.min(30, Hz.fog.t + 5); Hz.fog.src = src; } else Hz.fog = { src, t: 15, in: 0 }; S.emit('sfx', 'fog'); break;
    case 'STORM': storm(S, src, 4 * T, 12, 1.7, 1.3); break;
    case 'SUPERCELL': storm(S, src, 6 * T, 18, 2.0, 1.4); Hz.fog = { src, t: 6 * T + 18, in: 0 }; break;
    case 'CRANE': crane(S, src, 2, 3 * T); break;
    case 'WRECKING': crane(S, src, 3, 3.5 * T); break;
    case 'OVERSEER': storm(S, src, 6 * T, 15, 1.6, 1.2); crane(S, src, 2, 6 * T); S.cinema = { kind: 'overseer', t: 0, dur: 3.2, user: p.user }; break;
    case 'BARRAGE': { // a short burst of small stuff, still under every cap
      const K = p.barrage.kinds;
      const g = Math.min(3, (K.GUST || 0) + (K.CROWD_GUST || 0) || 1);
      for (let i = 0; i < g && Hz.gusts.length < CAPS.GUST; i++) Hz.gusts.push({ src, dir: nextDir(S), tele: (0.8 + i * 0.8) * T, tele0: (0.8 + i * 0.8) * T, t: 0, dur: 0.5, str: 2.4 });
      if (K.PIGEON && Hz.pigeons.length < CAPS.PIGEON) Hz.pigeons.push({ src, end: nextDir(S), tele: 0.8 * T, tele0: 0.8 * T, t: 6, str: 1.0 });
      if (K.TWANG && !Hz.twang) Hz.twang = { src, tele: 1.2 * T, tele0: 1.2 * T, t: 0, dur: 1.2, amp: 2.2, freq: 2.4, from: 0 };
      S.emit('sfx', 'whoosh');
      break;
    }
    default: break;
  }
  S.run.sabLog.push({ t: S.sessionT, src });
  if (S.run.sabLog.length > 400) S.run.sabLog.shift();
}
function storm(S, src, tele, dur, base, amp) {
  S.haz.storm = { src, tele, tele0: tele, t: 0, dur, base, amp, freq: 0.3, dir: nextDir(S) };
  S.emit('sfx', 'thunder');
}
function crane(S, src, swings, tele) {
  const P = S.P, sp = S.world.spans[P.span];
  const side = sp.dirX > 0 ? 1 : -1; // the crane rides on the far tower
  S.haz.crane = { src, left: swings, side, swing: { span: P.span, s: Math.min(sp.len - 0.7, P.s + 2.0), tele, tele0: tele, sweep: -1, dir: -side }, n: 0 };
  S.emit('sfx', 'crane');
}

// ---------------- hazards: torque sources each frame ----------------
/** Advance hazard objects; returns this frame's torque list [{tau, wind, src}] (before crouch/buff scaling). */
export function tickHazards(S, dt) {
  const Hz = S.haz, P = S.P, out = [];
  const onR = onRope(S);
  for (const g of Hz.gusts) {
    if (g.tele > 0) { g.tele -= dt; continue; }
    g.t += dt;
    if (onR) out.push({ tau: g.dir * g.str * Math.sin(Math.PI * clamp(g.t / g.dur, 0, 1)), wind: true, src: g.src });
  }
  Hz.gusts = Hz.gusts.filter((g) => g.t < g.dur);
  for (const q of Hz.pigeons) {
    if (q.tele > 0) { q.tele -= dt; if (q.tele <= 0) S.emit('sfx', 'flap'); continue; }
    q.t -= dt;
    if (onR) out.push({ tau: q.end * q.str, wind: false, src: q.src });
  }
  const gone = Hz.pigeons.filter((q) => q.t <= 0);
  if (gone.length) { Hz.pigeons = Hz.pigeons.filter((q) => q.t > 0); for (const q of gone) S.flyoff.push({ x: P.x, y: P.y, end: q.end, t: 0, tag: q.src.tag }); if (S.flyoff.length > 8) S.flyoff.shift(); S.emit('sfx', 'flap'); }
  for (const k of ['twang', 'shake']) {
    const w = Hz[k]; if (!w) continue;
    if (w.tele > 0) { w.tele -= dt; continue; }
    w.t += dt;
    const env = Math.min(1, w.t / 0.2, (w.dur - w.t) / 0.3);
    if (onR) out.push({ tau: w.amp * Math.sin(2 * Math.PI * w.freq * w.t) * clamp(env, 0, 1), wind: false, src: w.src });
    if (w.t >= w.dur) Hz[k] = null;
  }
  for (const d of Hz.drones) {
    d.ang += dt * 3;
    if (d.push > 0) { d.push -= dt; if (onR) out.push({ tau: -d.side * 2.4, wind: false, src: d.src }); if (d.push <= 0) { d.side = -d.side; d.passes--; d.next = 1.0; } continue; }
    if (d.tele > 0) { d.tele -= dt; if (d.tele <= 0) { d.push = 0.35; S.emit('sfx', 'zap'); } continue; }
    d.next -= dt;
    if (d.next <= 0 && d.passes > 0) { d.tele = 0.5 * d.T; }
  }
  Hz.drones = Hz.drones.filter((d) => d.passes > 0 || d.push > 0 || d.tele > 0);
  if (Hz.fog) { Hz.fog.in = Math.min(1, Hz.fog.in + dt * 1.5); Hz.fog.t -= dt; if (Hz.fog.t <= 0) Hz.fog = null; }
  const st = Hz.storm;
  if (st) {
    if (st.tele > 0) st.tele -= dt;
    else {
      st.t += dt;
      const env = clamp(Math.min(st.t / 1.0, (st.dur - st.t) / 1.0), 0, 1);
      if (onR) out.push({ tau: st.dir * (st.base + st.amp * Math.sin(2 * Math.PI * st.freq * st.t)) * env, wind: true, src: st.src });
      if (st.t >= st.dur) Hz.storm = null;
    }
  }
  for (const pl of Hz.peels) { if (pl.drop > 0) pl.drop -= dt; pl.ttl -= dt; }
  Hz.peels = Hz.peels.filter((pl) => pl.ttl > 0);
  const cr = Hz.crane;
  if (cr) {
    const w = cr.swing;
    if (w.sweep < 0) { w.tele -= dt; if (w.tele <= 0) { w.sweep = 0; S.emit('sfx', 'swing'); } }
    else {
      const was = w.sweep; w.sweep += dt;
      // slow-mo when the ball is about to pass a crouching PATCH inside the zone
      if (was < 0.1 && w.sweep >= 0.1 && P.span === w.span && Math.abs(P.s - w.s) <= 0.9 && P.crouch && onR) S.emit('clutch', { kind: 'duck' });
      if (was < 0.25 && w.sweep >= 0.25) {
        if (P.span === w.span && Math.abs(P.s - w.s) <= 0.9 && onR) {
          if (P.crouch) { S.emit('ducked', cr.src); }
          else S.emit('knock', { src: cr.src, dir: w.dir });
        }
      }
      if (w.sweep >= 0.5) {
        cr.left--; cr.n++;
        if (cr.left <= 0 || P.phase !== 'walk') Hz.crane = null;
        else {
          const sp = S.world.spans[P.span];
          cr.swing = { span: P.span, s: clamp(P.s, BAL.SAFE_END + 0.2, sp.len - 0.7), tele: 2.5 * S.knob.telegraphScale, tele0: 2.5 * S.knob.telegraphScale, sweep: -1, dir: -w.dir };
        }
      }
    }
  }
  return out;
}

/** PANIC: clear every active hazard, 10 s calm air, hold SAB 60 s. */
export function panic(S) {
  S.haz = emptyHaz();
  S.P.omega *= 0.2; S.P.theta *= 0.5;
  S.buff.calm = { t: Math.max(10, (S.buff.calm && S.buff.calm.t) || 0), owners: (S.buff.calm && S.buff.calm.owners) || [], tag: 'JAMMER' };
  S.panic = 60; S.panics++;
  S.banner = { text: 'RESISTANCE JAMMER ONLINE', sub: 'SABOTAGE HELD 60s · STILL CREDITED', color: PAL.help, t: 3 };
  S.emit('sfx', 'jammer');
}
export const emptyHaz = () => ({ gusts: [], pigeons: [], twang: null, shake: null, peels: [], drones: [], fog: null, storm: null, crane: null });
