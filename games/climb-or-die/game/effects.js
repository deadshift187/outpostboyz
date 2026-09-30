// Gift/like/follow/share/comment -> deterministic effects, plus every safety
// valve from spec section 7: Sab Heat + JAMMER, stun budget (in climber.hit),
// concurrency caps, beacon floor, PANIC suspension, pause queue, stall assist.
// No gift is ever eaten: every event is credited on arrival and every effect
// instance either fires or waits in a queue. DOM-free.
import { TOWER_X0, TOWER_X1, PH, PW, HEAT, CAPS, PAL, clamp } from './consts.js';
import { mkPlat } from './world.js';
import { hit, startLift, ledgeAtOrBelow, pBox, boxDist } from './climber.js';

export const EFFECT_NAMES = {
  PLANK: 'SCRAP PLANK', HEART_PAD: 'HEART PAD', LADDER: 'LADDER DROP', SHIELD: 'SHIELD BUBBLE', CORGI: 'CORGI-BOT',
  STAIRS: 'SCRAP STAIRS', ZIPLINE: 'ZIPLINE', UPDRAFT: 'UPDRAFT BEACON', GRAPPLE: 'GRAPPLE GUN', PLANT_BEACON: 'PLANT BEACON',
  ROCKET_RIDE: 'ROCKET RIDE', EXTRACTION: 'EXTRACTION CALL', STORM_LIFT: 'STORM LIFT',
  BOLT: 'BOLT DROP', GREASE: 'GREASE PATCH', DRONE: 'SCRAP DRONE', SHOVE: 'SHOVE', EMP: 'EMP BURP', CROSSWIND: 'CROSSWIND',
  CART: 'CARGO CART', METEOR: 'METEOR', LIGHTS_OUT: 'LIGHTS OUT', HUNTER_KILLER: 'HUNTER-KILLER', QUAKE: 'TOWER QUAKE',
  BARRAGE: 'SAB BARRAGE', OVERSEER: 'THE OVERSEER', STRIKE: 'LIGHTNING STRIKE', SENTRY: 'SENTRY EYE', GATE: 'LASER GATE', PATROL: 'PATROL DRONE',
};
const SERIAL = new Set(['ZIPLINE', 'UPDRAFT', 'ROCKET_RIDE', 'STORM_LIFT', 'EXTRACTION']);
export const TEAM_COLOR = { help: PAL.help, sab: PAL.sab };

const DEFAULT_TIERS = [
  { min: 1, max: 4, side: 'gift', help: 'PLANK', sab: 'BOLT' }, { min: 5, max: 9, side: 'gift', help: 'HEART_PAD', sab: 'GREASE' },
  { min: 10, max: 99, help: 'LADDER', sab: 'DRONE' }, { min: 100, max: 198, help: 'SHIELD', sab: 'SHOVE' },
  { min: 199, max: 498, help: 'CORGI', sab: 'EMP' }, { min: 499, max: 698, help: 'STAIRS', sab: 'CROSSWIND' },
  { min: 699, max: 999, help: 'ZIPLINE', sab: 'CART' }, { min: 1000, max: 1499, help: 'UPDRAFT', sab: 'METEOR' },
  { min: 1500, max: 4999, help: 'GRAPPLE', sab: 'LIGHTS_OUT' }, { min: 5000, max: 19999, help: 'PLANT_BEACON', sab: 'HUNTER_KILLER' },
  { min: 20000, max: 29998, help: 'ROCKET_RIDE', sab: 'QUAKE' }, { min: 29999, max: null, help: 'EXTRACTION', sab: 'OVERSEER' },
];
const DEFAULT_SIDES = { rose: 'help', fingerheart: 'help', tiktok: 'sab', panda: 'sab' };
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function heatFor(coins) {
  if (coins >= 1000) return HEAT.whale;
  if (coins >= 699) return HEAT[699]; if (coins >= 499) return HEAT[499]; if (coins >= 199) return HEAT[199];
  if (coins >= 100) return HEAT[100]; if (coins >= 10) return HEAT[10]; if (coins >= 5) return HEAT[5];
  return HEAT[1];
}

// ---------------- input hygiene ----------------
// Viewer names are arbitrary Unicode: emoji, RTL scripts, zalgo, 100-char names, control
// chars. The game draws them on tags, posters, cards and credits, so every event gets a
// cleaned copy: bidi overrides / zero-width / control chars removed, whitespace collapsed,
// clamped to NICK_MAX graphemes (never splitting an emoji). The platform feed keeps the raw
// event (it has its own fitting).
export const NICK_MAX = 16;
const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
const graphemes = (s) => (segmenter ? [...segmenter.segment(s)].map((g) => g.segment) : [...s]);
export function cleanNick(n) {
  let s = String(n ?? '').normalize('NFC')
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
    .replace(/(\p{M}{3})\p{M}+/gu, '$1') // zalgo: at most 3 stacked marks
    .replace(/\s+/g, ' ').trim().replace(/^@+/, '');
  const g = graphemes(s);
  if (g.length > NICK_MAX) s = g.slice(0, NICK_MAX - 1).join('').trimEnd() + '…';
  return s || 'viewer';
}
export function cleanEvent(evt) {
  const u = evt.user || {};
  const e = { ...evt, user: { ...u, id: String(u.id ?? u.handle ?? 'anon') || 'anon', nickname: cleanNick(u.nickname || u.handle) } };
  if (evt.type === 'gift') {
    const g = evt.gift || {};
    const coins = Number(g.coins);
    e.gift = { ...g, name: String(g.name || 'Gift'), coins: Number.isFinite(coins) && coins > 0 ? coins : 0, count: Math.max(1, Math.min(10000, Math.floor(Number(g.count)) || 1)) };
  }
  if (evt.type === 'like') e.likeCount = Math.max(1, Math.min(100000, Math.floor(Number(evt.likeCount)) || 1));
  return e;
}

// ---------------- teams ----------------
const HELP_WORDS = new Set(['help', 'helper', 'h!']);
const SAB_WORDS = new Set(['sab', 'sabotage', 's!']);
/** Twitch / YouTube viewers get a short badge on name tags and boards (ids are tw:/yt: prefixed by the server). */
export const platformOf = (id) => (/^tw:/.test(String(id)) ? 'twitch' : /^yt:/.test(String(id)) ? 'youtube' : 'tiktok');
export const platformBadge = (id) => ({ twitch: 'TW·', youtube: 'YT·' })[platformOf(id)] || '';
export function teamOf(S, user) { const t = user && S.teams.get(user.id); return t ? t.team : null; }

export function onComment(S, evt) {
  const w = String(evt.text || '').trim().toLowerCase().replace(/[.,;:]+$/, '');
  const team = HELP_WORDS.has(w) ? 'help' : SAB_WORDS.has(w) ? 'sab' : null;
  if (!team) return null;
  const u = evt.user, cur = S.teams.get(u.id);
  if (cur && cur.team === team) return null;
  if (cur && S.sessionT - cur.at < 600) { chip(S, `@${u.nickname}: team switch in ${Math.ceil((600 - (S.sessionT - cur.at)) / 60)} min`, PAL.bone); return null; }
  S.teams.set(u.id, { team, at: S.sessionT, name: u.nickname });
  const st = stat(S, u); st.team = team;
  chip(S, `@${u.nickname} joined ${team.toUpperCase()}`, TEAM_COLOR[team]);
  S.emit('sfx', 'comment');
  return team;
}

export function chip(S, text, color) {
  S.chips.push({ text, color, t: 2 });
  if (S.chips.length > 5) S.chips.shift();
}

// ---------------- stats ----------------
export function stat(S, user) {
  let s = S.session.get(user.id);
  if (!s) {
    s = { id: user.id, name: '@' + (user.nickname || 'viewer'), team: teamOf(S, user), metersGiven: 0, metersTaken: 0, knockdowns: 0, summitsAssisted: 0, revengesSuffered: 0, coinsHelp: 0, coinsSab: 0, platform: platformOf(user.id) };
    S.session.set(user.id, s);
  }
  s.name = '@' + (user.nickname || s.name.slice(1));
  return s;
}
function runStat(S, user) {
  let r = S.run.users.get(user.id);
  if (!r) { r = { id: user.id, name: '@' + user.nickname, given: 0, taken: 0 }; S.run.users.set(user.id, r); }
  return r;
}
export function creditGiven(S, owner, m) {
  if (!owner || !(m > 0)) return;
  stat(S, owner).metersGiven += m; runStat(S, owner).given += m; S.run.given += m;
}
export function creditTaken(S, owner, m) {
  if (!(m > 0)) return;
  S.run.taken += m;
  if (!owner) return;
  stat(S, owner).metersTaken += m; runStat(S, owner).taken += m;
}

// ---------------- resolve ----------------
export function resolveGift(S, evt) {
  const g = evt.gift || {}, coins = Math.max(1, Number(g.coins) || 1); // a 0-coin gift acts at tier 1 (but credits 0 coins)
  const tiers = (S.cfg && S.cfg.tiers) || DEFAULT_TIERS;
  const tier = tiers.find((t) => coins >= t.min && (t.max == null || coins <= t.max)) || tiers[0];
  const sides = S.cfg && S.cfg.giftSides ? Object.fromEntries(Object.entries(S.cfg.giftSides).map(([k, v]) => [norm(k), v])) : DEFAULT_SIDES;
  const team = teamOf(S, evt.user);
  let side = tier.side === 'gift' ? sides[norm(g.name)] || team || 'help' : team || 'help';
  const noTeamDefault = tier.side !== 'gift' && !team;
  return { tier, side, effect: tier[side], coins, heat: heatFor(coins), whale: coins >= 1000, noTeamDefault };
}

// ---------------- event intake ----------------
/** Called for every platform event. Returns a feed label (or null). */
export function intake(S, evt) {
  const u = evt.user || { id: 'anon', nickname: 'viewer' };
  if (evt.type === 'comment') {
    onComment(S, evt);
    // Twitch / YouTube have no likes: the server marks a (rate-limited) chat message with chatLikes
    const cl = Math.max(0, Math.min(1000, Math.floor(Number(evt.chatLikes)) || 0));
    if (cl) addLikes(S, u, cl);
    return null;
  }
  if (evt.type === 'like') { addLikes(S, u, Number(evt.likeCount) || 1); return null; }
  if (evt.type === 'share') {
    const team = teamOf(S, u) || 'help';
    S.lightning.boost[team] = true; chip(S, `@${u.nickname} ${evt.raid ? 'raided' : 'shared'}: next bolt x2 for ${team.toUpperCase()}`, TEAM_COLOR[team]);
    return 'NEXT BOLT x2';
  }
  if (evt.type === 'gift' || evt.type === 'follow' || evt.type === 'sub') {
    if (evt.type === 'gift') {
      const r = resolveGift(S, evt), n = Math.max(1, Math.min(10000, Number(evt.gift.count) || 1));
      const st = stat(S, u), real = Math.max(0, Number(evt.gift.coins) || 0);
      if (r.side === 'help') st.coinsHelp += real * n; else st.coinsSab += real * n;
      S.credited.coins += real * n; S.credited.gifts += n;
      if (r.noTeamDefault && !S.tipped.has(u.id)) { S.tipped.add(u.id); chip(S, `tip: comment sab to switch (@${u.nickname})`, PAL.bone); }
    }
    if (S.holding()) {
      S.held.push(evt);
      // a long pause / break under spam: the oldest held events fold into BARRAGE instances
      // (credited, released first on resume) instead of growing the queue or being dropped
      while (S.held.length > BACKLOG.heldCap) foldHeld(S, S.held.shift());
      return labelFor(S, evt);
    }
    dispatchEvent(S, evt);
    return labelFor(S, evt);
  }
  return null;
}

function labelFor(S, evt) {
  if (evt.type !== 'gift') return evt.type === 'follow' ? 'SCRAP PLANK ★NEW' : evt.type === 'sub' ? 'SCRAP PLANK ★SUB' : null;
  const r = resolveGift(S, evt);
  return `${r.side === 'help' ? 'HELP' : 'SAB'}: ${EFFECT_NAMES[r.effect] || r.effect}`;
}

function instOf(S, evt) {
  const u = evt.user || { id: 'anon', nickname: 'viewer' };
  if (evt.type === 'follow' || evt.type === 'sub') return { inst: { effect: 'PLANK', side: 'help', user: u, tag: evt.type === 'follow' ? '★NEW' : '★SUB', coins: 0, heat: 0 }, n: 1 };
  const r = resolveGift(S, evt), n = Math.max(1, Math.min(10000, Number(evt.gift.count) || 1));
  return { inst: { effect: r.effect, side: r.side, user: u, gift: evt.gift.name, coins: r.coins, heat: r.heat, whale: r.whale, count: n }, n };
}
function foldHeld(S, evt) {
  const { inst, n } = instOf(S, evt);
  const group = groupOf(inst), key = group === 'help' ? 'help:' + inst.effect : group;
  let b = S.heldFold.get(key);
  if (!b) { b = newBarrage(S, group, inst); S.heldFold.set(key, b); }
  absorb(S, b, inst, n);
  S.credited.effects += n;
}
/** On resume: folded barrages go first (they hold the oldest gifts). */
export function releaseFolds(S) {
  if (!S.heldFold.size) return;
  for (const b of S.heldFold.values()) { b.at = S.t; b.qAt = S.t; S.pending.push(b); }
  S.heldFold.clear();
}

/** Expand one (released) event into effect instances, 0.25 s apart. */
export function dispatchEvent(S, evt) {
  const u = evt.user || { id: 'anon', nickname: 'viewer' };
  if (evt.type === 'follow' || evt.type === 'sub') {
    schedule(S, { effect: 'PLANK', side: 'help', user: u, tag: evt.type === 'follow' ? '★NEW' : '★SUB', coins: 0, heat: 0 }, 1);
    return;
  }
  const r = resolveGift(S, evt), n = Math.max(1, Math.min(10000, Number(evt.gift.count) || 1));
  schedule(S, { effect: r.effect, side: r.side, user: u, gift: evt.gift.name, coins: r.coins, heat: r.heat, whale: r.whale, count: n }, n);
}

function schedule(S, inst, n) {
  // One event expands to at most BACKLOG.perEvent timed instances; a bigger combo (x500 Roses)
  // folds the rest into one BARRAGE instance right away, so a single event can't flood the queue.
  const solo = Math.min(n, BACKLOG.perEvent);
  for (let i = 0; i < solo; i++) {
    S.pending.push({ ...inst, at: S.t + i * 0.25, idx: i, uid: S.effSeq++ });
    S.credited.effects++;
  }
  if (n > solo) {
    const p = { ...inst, at: S.t + solo * 0.25, idx: solo, uid: 0 };
    const b = newBarrage(S, groupOf(p), p);
    absorb(S, b, p, n - solo);
    S.credited.effects += n - solo;
    S.pending.push(b);
  }
}

// ---------------- backlog compaction (spam safety) ----------------
// At 30 events/s the SAB queue used to grow without bound and keep firing long after the spam
// stopped. "Never eat a gift" still holds: every gift is credited on arrival (intake) and every
// instance is acknowledged, but a backlog is folded into BARRAGE effects:
//   low tiers (<=99 coins): any queued item older than maxAgeS, or beyond the keepNewest newest
//     queue entries, merges into ONE low barrage (a short burst of small hazards, capped by the
//     stun budget and the concurrency caps).
//   mid + whale (>=100 coins): never merged by age; each keeps its own entry up to bigCap queued,
//     and only the overflow collapses into ONE bigger, longer-telegraphed effect.
//   HELP: the serial lifts (zipline / updraft / rocket / extraction) wait for each other, so the
//     same bigCap ceiling applies to waiting lifts; the overflow becomes one lift that credits all.
// The feed and knock-down card credit a barrage as "@a, @b +N others · BARRAGE xN".
export const BACKLOG = { maxAgeS: 20, keepNewest: 30, bigCap: 6, helpCap: 6, perEvent: 30, heldCap: 40, crewKeep: 40, idsKeep: 2000 };
const KIND_CAP = { CROSSWIND: 1, LIGHTS_OUT: 1, QUAKE: 1, HUNTER_KILLER: 1, OVERSEER: 1, EMP: 2 };
const groupOf = (p) => (p.side === 'help' ? 'help' : (p.coins || 0) >= 100 ? 'big' : 'low');

function newBarrage(S, group, p) {
  S.barrages[group]++;
  return {
    effect: group === 'low' ? 'BARRAGE' : p.effect, side: p.side, user: p.user || null, gift: p.gift, coins: p.coins || 0,
    heat: group === 'low' ? 0 : p.heat || 0, whale: !!p.whale, count: 0, tag: p.tag, at: p.at ?? S.t, qAt: p.qAt ?? S.t, uid: S.effSeq++,
    barrage: { group, n: 0, crew: [], ids: new Set(), others: 0, kinds: {}, kindCoins: {}, kindGift: {}, topCoins: p.coins || 0 },
  };
}
/** Fold k instances like p into barrage b (credit bookkeeping only; p itself never fires). */
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
  else if ((p.coins || 0) > B.topCoins) { // the bigger effect: the strongest one in the pile
    B.topCoins = p.coins; b.effect = p.effect; b.coins = p.coins; b.heat = p.heat; b.gift = p.gift; b.whale = !!p.whale;
  }
  S.fired.merged += k;
}

/** "@a, @b +N others" with names shortened so the whole credit fits maxChars. */
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
  const held = S.jammer > 0 || S.panic > 0;
  for (const p of Q) if (p.barrage) { if (p.barrage.group === 'low') low = p; else big = p; }
  const out = [];
  for (let i = 0; i < Q.length; i++) {
    const p = Q[i];
    if (p.barrage || p.effect === 'STRIKE') { out.push(p); continue; } // lightning: rare, has its own likers
    if ((p.coins || 0) >= 100) {
      // long one-at-a-time effects (a crosswind blows 9 s) also get a per-kind ceiling, or three
      // queued crosswinds alone would keep firing for 27 s after the spam stops
      const kc = (perKind[p.effect] = (perKind[p.effect] || 0) + 1);
      if (++bigN <= BACKLOG.bigCap && kc <= (KIND_CAP[p.effect] || BACKLOG.bigCap)) { out.push(p); continue; }
      if (!big) { big = newBarrage(S, 'big', p); out.push(big); }
      absorb(S, big, p); changed = true;
      continue;
    }
    // (also while a JAMMER / PANIC holds sabotage: what piles up behind it arrives as ONE burst,
    //  not a 0.25 s stream that re-maxes the heat and triggers the next jammer)
    if (i < cut || held || S.t - (p.qAt ?? S.t) > BACKLOG.maxAgeS) {
      if (!low) { low = newBarrage(S, 'low', p); out.push(low); }
      absorb(S, low, p); changed = true;
    } else out.push(p);
  }
  if (changed) S.sabQ = out;
}

function compactHelp(S) {
  // only the serial lifts ever wait in S.pending; everything else fires the frame it is due
  let n = 0, b = null, changed = false;
  for (const p of S.pending) if (p.barrage && p.side === 'help' && SERIAL.has(p.effect) && p.at <= S.t) b = p;
  const out = [];
  for (const p of S.pending) {
    if (p.side !== 'help' || p.barrage || p.at > S.t || !SERIAL.has(p.effect) || p.effect === 'STORM_LIFT') { out.push(p); continue; }
    if (++n <= BACKLOG.helpCap) { out.push(p); continue; }
    if (!b) { b = newBarrage(S, 'help', p); out.push(b); }
    absorb(S, b, p); changed = true;
  }
  if (changed) S.pending = out;
}

/** A mid/whale barrage fires as the strongest effect in its pile that the live caps allow right
 *  now (so one busy cap, e.g. a crosswind already blowing, can't hold the whole pile back). */
function pickBig(S, p) {
  const B = p.barrage;
  const kinds = Object.keys(B.kinds).sort((a, c) => (B.kindCoins[c] || 0) - (B.kindCoins[a] || 0));
  for (const e of kinds) if (canFire(S, e)) { p.effect = e; p.coins = B.kindCoins[e] || p.coins; p.heat = heatFor(p.coins); p.whale = p.coins >= 1000; p.gift = B.kindGift[e] || p.gift; return true; }
  return false;
}

/** Feed + chip acknowledgement when a barrage fires. */
function announceBarrage(S, p) {
  const B = p.barrage, color = TEAM_COLOR[p.side === 'help' ? 'help' : 'sab'];
  const what = p.effect === 'BARRAGE' ? 'SAB BURST' : `${p.side === 'help' ? 'HELP' : 'SAB'}: ${EFFECT_NAMES[p.effect] || p.effect}`;
  // the credit comes first and is never cut: the platform feed shrinks this line to fit (fit:'shrink')
  const text = barrageLabel(B, 40);
  S.feedOut.push({ text, color, fit: 'shrink', user: B.crew[0] || p.user || { id: 'barrage', nickname: 'B' } });
  if (S.feedOut.length > 20) S.feedOut.shift();
  chip(S, `BARRAGE ×${B.n}: ${what}`, color);
  S.fired.barrage++;
}

// ---------------- likes / lightning ----------------
export function addLikes(S, user, n) {
  const L = S.lightning, team = teamOf(S, user);
  L.charge += n; S.credited.likes += n;
  if (team) L[team] += n * (L.boost[team] ? 2 : 1);
  L.contrib.set(user.id, { user, team, n: ((L.contrib.get(user.id) || {}).n || 0) + n });
}

function tickLightning(S) {
  const L = S.lightning, need = S.knob.lightningLikes;
  if (L.charge < need || S.t - L.last < 20) return;
  const h = L.help, s = L.sab;
  const contrib = [...L.contrib.values()];
  L.charge = Math.min(need * 0.5, L.charge - need); L.help = 0; L.sab = 0; L.boost = { help: false, sab: false }; L.contrib = new Map(); L.last = S.t;
  if (h > s) {
    S.pending.push({ effect: 'STORM_LIFT', side: 'help', user: null, likers: contrib.filter((c) => c.team === 'help'), at: S.t, uid: S.effSeq++, heat: 0 });
    S.credited.effects++;
  } else if (s > h) {
    S.pending.push({ effect: 'STRIKE', side: 'sab', user: null, likers: contrib.filter((c) => c.team === 'sab'), at: S.t, uid: S.effSeq++, heat: 15 });
    S.credited.effects++;
  } else {
    S.flash = 0.35; S.emit('sfx', 'thunder'); chip(S, 'THUNDER CLAP', PAL.bone);
  }
}

// ---------------- per-frame dispatch ----------------
function canFire(S, e) {
  const H = S.haz;
  switch (e) {
    case 'DRONE': return H.drones.length < CAPS.DRONE;
    case 'CART': return !S.sweeps.some((w) => w.kind === 'cart');
    case 'METEOR': return H.meteors.length < CAPS.METEOR;
    case 'HUNTER_KILLER': return !S.fx.hk;
    case 'OVERSEER': return !S.fx.overseer;
    case 'EMP': return !S.fx.emp;
    case 'CROSSWIND': return !S.fx.crosswind;   // one at a time (extra cap)
    case 'LIGHTS_OUT': return !S.fx.lights;
    case 'QUAKE': return !S.fx.quake;
    case 'SHOVE': return !H.shoves.length;
    case 'STRIKE': return !H.strike;
    default: return true;
  }
}

export function tickDispatch(S, dt) {
  // heat
  if (S.jammer > 0) {
    S.jammer = Math.max(0, S.jammer - dt);
    S.heat = Math.max(0, S.heat - (S.heatAtJam / 8) * dt);
    if (S.jammer === 0) { S.heat = 0; chip(S, 'JAMMER OFFLINE', PAL.sab); }
  } else S.heat = Math.max(0, S.heat - S.knob.heatDecay * dt);
  if (S.panic > 0) S.panic = Math.max(0, S.panic - dt);
  tickLightning(S);

  // due instances
  for (let i = 0; i < S.pending.length; i++) {
    const p = S.pending[i];
    if (p.at > S.t) continue;
    if (p.side === 'sab') { p.qAt = S.t; S.sabQ.push(p); S.pending.splice(i--, 1); continue; }
    if (SERIAL.has(p.effect) && (S.player.lift || (S.player.ladder && S.player.ladder.rope) || (p.effect === 'EXTRACTION' && S.fx.extraction))) continue; // wait for the current lift / rope climb
    S.pending.splice(i--, 1);
    fireHelp(S, p);
    if (p.barrage) announceBarrage(S, p); else S.fired.help++;
  }
  // backlog compaction (4x a second is plenty; queues stay small)
  S.compactClock = (S.compactClock || 0) - dt;
  if (S.compactClock <= 0) { S.compactClock = 0.25; compactSab(S); compactHelp(S); }
  // sabotage: gated by PANIC, JAMMER, caps, 0.25 s spacing
  if (S.panic > 0 || S.jammer > 0 || !S.sabQ.length || S.t - S.lastSab < 0.25) return;
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
    if (S.heat >= S.knob.heatCap) {
      S.jammer = 8; S.heatAtJam = S.heat; S.jams++;
      chip(S, 'HEAT MAXED: JAMMER 8s', PAL.help); S.emit('sfx', 'jammer');
    }
    break;
  }
}

// ---------------- HELP effects ----------------
const ownerOf = (p) => (p.user ? { id: p.user.id, nickname: p.user.nickname, team: 'help' } : null);
const helpers = (S) => S.platforms.filter((p) => p.kind === 'plank');

function groundY(S) { const P = S.player; return P.ground ? P.ground.y : P.lastGroundY; }

function fireHelp(S, p) {
  const P = S.player, cap = S.knob.liftCapM * 100, owner = ownerOf(p);
  S.run.helpLog.push({ t: S.sessionT, user: owner });
  if (S.run.helpLog.length > 400) S.run.helpLog.shift();
  let tag = p.tag ? `@${p.user.nickname} ${p.tag}` : p.user ? `@${p.user.nickname}` : null;
  // merged HELP barrage: tagged BARRAGE xN, lift meters split over every sender in the crew
  const crew = p.barrage ? { likers: p.barrage.crew.map((u) => ({ user: { id: u.id, nickname: u.nickname, team: 'help' }, n: 1 })), total: p.barrage.crew.length || 1 } : null;
  if (p.barrage) tag = `BARRAGE ×${p.barrage.n}`;
  const by = (extra) => ({ ...(crew || { owner }), ...extra });
  switch (p.effect) {
    case 'PLANK': {
      const planks = helpers(S);
      if (planks.length >= CAPS.PLANKS) { const old = planks.reduce((a, b) => (a.ttl < b.ttl ? a : b)); old.ttl += 2; S.emit('sfx', 'plank'); break; }
      let x = P.x + P.face * 240 - 90, y = groundY(S) + 160, d = P.face;
      for (let k = 0; k < 14; k++) {
        if (x < TOWER_X0) { x = TOWER_X0; d = 1; } if (x > TOWER_X1 - 180) { x = TOWER_X1 - 180; d = -1; }
        const clash = planks.some((q) => Math.abs(q.x - x) < 120 && Math.abs(q.y - y) < 60);
        if (!clash) break;
        y += 160; x += d * 200;
      }
      S.platforms.push(mkPlat(Math.round(x), y, 180, 'plank', { ttl: 8, owner, tag, born: S.t }));
      S.emit('sfx', 'plank');
      break;
    }
    case 'HEART_PAD': {
      const spot = predictLanding(S);
      const pads = S.platforms.filter((q) => q.kind === 'pad');
      if (pads.length >= 6) { pads[0].ttl += 3; break; }
      const x = clamp(spot.x - 100, TOWER_X0, TOWER_X1 - 200);
      S.platforms.push(mkPlat(Math.round(x), spot.y + 8, 200, 'pad', { ttl: 10, owner, tag, born: S.t }));
      S.emit('sfx', 'plank');
      break;
    }
    case 'LADDER': spawnLadder(S, owner, tag, 15); break;
    case 'SHIELD': P.shield = Math.min(24, P.shield + 8); S.emit('sfx', 'shield'); break;
    case 'CORGI': S.fx.corgi = { t: 20, bark: true, catch: true, owner, tag, x: P.x - 80, y: P.y }; S.emit('sfx', 'bark'); break;
    case 'STAIRS': {
      const n = S.platforms.filter((q) => q.kind === 'stair').length;
      if (n >= 20) { for (const q of S.platforms) if (q.kind === 'stair') q.ttl += 4; break; }
      let d = P.face, x = P.x + d * 60 - 110, y = groundY(S);
      for (let i = 0; i < 5; i++) {
        y += 120;
        if (x < TOWER_X0) { x = TOWER_X0 + 110; d = 1; } if (x > TOWER_X1 - 220) { x = TOWER_X1 - 330; d = -1; }
        S.platforms.push(mkPlat(Math.round(x), y, 220, 'stair', { ttl: 20, owner, tag: i === 4 ? tag : null, born: S.t }));
        x += d * 150;
      }
      S.emit('sfx', 'ladder');
      break;
    }
    case 'ZIPLINE': lift(S, Math.min(P.y + 800, cap), 2.0, 'zip', by({})); S.emit('sfx', 'zip'); break;
    case 'UPDRAFT': lift(S, Math.min(P.y + 1500, cap), 3.0, 'updraft', by({ shield: 3 })); S.emit('sfx', 'whale'); break;
    case 'ROCKET_RIDE': lift(S, Math.min(P.y + 4000, cap), 4.0, 'rocket', by({ shield: 5 })); S.emit('sfx', 'whale'); break;
    case 'STORM_LIFT': {
      const likers = p.likers || [];
      const total = likers.reduce((a, c) => a + c.n, 0) || 1;
      lift(S, Math.min(P.y + 500, cap), 1.0, 'storm', { likers, total });
      S.flash = 0.35; S.emit('sfx', 'thunder'); chip(S, 'STORM LIFT +5 m (HELP likes)', PAL.help);
      break;
    }
    case 'GRAPPLE': S.fx.grapple = { charges: Math.min(9, ((S.fx.grapple && S.fx.grapple.charges) || 0) + 3), t: 30, owner, tag }; S.emit('sfx', 'zip'); break;
    case 'PLANT_BEACON': {
      const y = groundY(S);
      const banked = S.lastBeacon();
      if (y > banked.y + 50 && y < S.towerTop - 300) {
        const b = { y, x: P.x, label: `${tag}'s beacon`, planted: true, banked: true, owner };
        S.beacons.push(b); S.beacons.sort((a, c) => a.y - c.y);
        S.platforms.push(mkPlat(clamp(Math.round(P.x - 120), TOWER_X0, TOWER_X1 - 240), y, 240, 'beacon', { owner, tag: b.label }));
        S.emit('sfx', 'beacon'); S.emit('banked', b);
      } else { P.shield = Math.min(24, P.shield + 10); chip(S, `${tag}: beacon already banked here, +10s shield`, PAL.help); }
      break;
    }
    case 'EXTRACTION': {
      const top = Math.min(P.y + 2000, cap);
      S.cinema = { kind: 'extraction', t: 0, dur: 3.2, user: p.user };
      if (top - P.y < 250) { P.shield = Math.min(24, P.shield + 10); break; }
      const x = clamp(P.x, TOWER_X0 + 120, TOWER_X1 - 120);
      const rung = mkPlat(Math.round(x - 110), Math.round(top), 220, 'rung', { ttl: 45, owner, tag });
      S.platforms.push(rung);
      S.ladders.push({ id: S.effSeq++, x, top: rung.y, bot: P.y - 20, sway: 60, ttl: 40, owner, tag, rope: true, topPlat: rung });
      S.fx.extraction = { t: 40, x, y: rung.y + 120, owner };
      S.emit('sfx', 'summit');
      break;
    }
    default: break;
  }
}

function lift(S, toY, dur, kind, then) {
  const P = S.player;
  if (toY - P.y < 60) { chip(S, 'HELP LIFT CAP: THE LAST 10 M ARE YOURS', PAL.bone); return false; }
  const ok = startLift(S, toY, dur, kind, then);
  if (!ok) return false;
  S.emit('lift', kind);
  return true;
}

function spawnLadder(S, owner, tag, ttl) {
  const P = S.player, y0 = groundY(S);
  let best = null, bd = Infinity;
  for (const p of S.platforms) {
    if (!p.alive || p.y <= y0 + 120 || p.y > y0 + 520) continue;
    const cx = clamp(P.x, p.x + 20, p.x + p.w - 20);
    const d = Math.abs(cx - P.x) + (p.y - y0) * 0.5;
    if (d < bd) { bd = d; best = p; }
  }
  let x, top, topPlat;
  if (best && bd < 700) { x = clamp(P.x, best.x + 24, best.x + best.w - 24); top = best.y; topPlat = best; }
  else { x = clamp(P.x + P.face * 80, TOWER_X0 + 80, TOWER_X1 - 80); top = y0 + 300; topPlat = mkPlat(Math.round(x - 70), top, 140, 'rung', { ttl, owner }); S.platforms.push(topPlat); }
  S.ladders.push({ id: S.effSeq++, x, top, bot: top - 300, ttl, owner, tag, topPlat });
  S.emit('sfx', 'ladder');
}

export function stallAssist(S) {
  spawnLadder(S, null, null, 30);
  chip(S, 'RESISTANCE LADDER DEPLOYED', PAL.help);
}

function predictLanding(S) {
  const P = S.player;
  if (P.ground) return { x: P.x + P.face * 60, y: P.ground.y };
  let x = P.x, y = P.y, vx = P.vx + P.kvx, vy = P.vy;
  for (let i = 0; i < 90; i++) {
    const py = y; vy -= 2600 / 60; x += vx / 60; y += vy / 60;
    x = clamp(x, TOWER_X0 + PW / 2, TOWER_X1 - PW / 2);
    for (const p of S.platforms) if (p.alive && p.y <= py && p.y >= y && x > p.x - 20 && x < p.x + p.w + 20) return { x, y: p.y };
  }
  return { x: P.x, y: P.lastGroundY };
}

// ---------------- SAB effects ----------------
function fireSab(S, p) {
  const P = S.player, hz = S.hz, H = S.haz;
  // a merged mid/whale barrage is the "bigger" effect: the strongest in the pile, telegraphed 1.5x longer
  const ts = S.knob.telegraphScale * (p.barrage && p.barrage.group === 'big' ? 1.5 : 1);
  const src = { user: p.user, effect: p.effect, gift: p.gift, count: p.count, sabId: p.uid };
  if (p.barrage) src.barrage = { n: p.barrage.n, crew: p.barrage.crew, others: p.barrage.others };
  S.run.sabLog.push({ t: S.sessionT, user: p.user });
  if (S.run.sabLog.length > 400) S.run.sabLog.shift();
  switch (p.effect) {
    case 'BOLT': H.bolts.push({ ...src, x: P.x, tele: 0.6 * ts, tele0: 0.6 * ts, y: null }); S.emit('sfx', 'bolt'); break;
    case 'GREASE': S.fx.greaseNext = Math.min(20, S.fx.greaseNext + 1); S.fx.greaseBy = src; if (P.ground) { P.ground.grease = 6; P.ground.greaseBy = src; S.fx.greaseNext--; } S.emit('sfx', 'grease'); break;
    case 'DRONE': {
      const fromLeft = P.x > 540;
      H.drones.push({ ...src, x: fromLeft ? TOWER_X0 + 20 : TOWER_X1 - 20, y: P.y + 380, t: 6, spd: 250 * hz });
      S.emit('sfx', 'drone');
      break;
    }
    case 'SHOVE': H.shoves.push({ ...src, tele: 0.8 * ts, tele0: 0.8 * ts, dir: P.x < 540 ? 1 : -1 }); S.emit('sfx', 'siren'); break;
    case 'EMP': S.fx.emp = { t: 5, ...src }; S.emit('sfx', 'emp'); break;
    case 'CROSSWIND': S.fx.crosswind = { tele: 1.0 * ts, t: 8, dir: S.windCount++ % 2 ? -1 : 1, ...src }; S.emit('sfx', 'wind'); break;
    case 'CART': {
      const dir = P.x > 540 ? 1 : -1;
      S.sweeps.push({ ...src, kind: 'cart', y: groundY(S), h: 80, x: dir > 0 ? TOWER_X0 - 120 : TOWER_X1 + 120, dir, speed: 1400 * hz, tele: 1.2 * ts, tele0: 1.2 * ts, knock: { vx: 1600, vy: 420, stun: 0.6 } });
      S.emit('sfx', 'siren');
      break;
    }
    case 'METEOR': H.meteors.push({ ...src, x: P.x, y: P.y + PH / 2, tele: 2.0 * ts, tele0: 2.0 * ts }); S.emit('sfx', 'lock'); break;
    case 'LIGHTS_OUT': S.fx.lights = { t: 12, ...src }; S.emit('sfx', 'powerdown'); break;
    case 'HUNTER_KILLER': S.fx.hk = { ...src, x: P.x, y: P.y - 1200, t: 25 }; S.emit('sfx', 'servo'); break;
    case 'QUAKE': S.fx.quake = { ...src, t: 0, dur: 10, pulses: 0 }; S.shake = Math.max(S.shake, 10); S.emit('sfx', 'quake'); break;
    case 'OVERSEER': S.fx.overseer = { ...src, t: 0, dur: 15, fired: 0, firstHit: false }; S.cinema = { kind: 'overseer', t: 0, dur: 2.5, user: p.user }; S.emit('sfx', 'overseer'); break;
    case 'STRIKE': H.strike = { ...src, tele: 1.0 * ts, likers: p.likers }; S.emit('sfx', 'crackle'); break;
    case 'BARRAGE': lowBarrage(S, p, src, ts); break;
    default: break;
  }
  if (p.barrage && S.fx.overseer && p.effect === 'OVERSEER') S.fx.overseer.teleMul = 1.5;
}

/** Low-tier barrage: ONE short burst of small hazards (at most 6), whatever N is. Bolts are spread
 *  across PATCH's row with staggered telegraphs; drones only up to the live cap; grease once.
 *  Every hazard carries the barrage credit (and one crew member as its owner). */
function lowBarrage(S, p, src, ts) {
  const P = S.player, H = S.haz, K = p.barrage.kinds, crew = p.barrage.crew;
  const owner = (i) => ({ ...src, user: crew.length ? crew[i % crew.length] : src.user, effect: 'BARRAGE' });
  let slots = Math.min(6, p.barrage.n), i = 0;
  if (K.GREASE) { S.fx.greaseNext = Math.min(20, S.fx.greaseNext + 1); S.fx.greaseBy = owner(i++); slots--; S.emit('sfx', 'grease'); }
  const drones = Math.min(K.DRONE || 0, 2, Math.max(0, CAPS.DRONE - H.drones.length), slots);
  for (let d = 0; d < drones; d++, i++, slots--) {
    const fromLeft = d % 2 === 0;
    H.drones.push({ ...owner(i), x: fromLeft ? TOWER_X0 + 20 : TOWER_X1 - 20, y: P.y + 380 + d * 80, t: 6, spd: 250 * S.hz });
  }
  if (drones) S.emit('sfx', 'drone');
  const offs = [0, -220, 220, -440, 440, -110];
  for (let b = 0; b < slots; b++, i++) {
    const x = clamp(P.x + offs[b % offs.length], TOWER_X0 + 20, TOWER_X1 - 20);
    const tele = (0.6 + b * 0.18) * ts;
    H.bolts.push({ ...owner(i), x, tele, tele0: tele, y: null });
  }
  if (slots > 0) S.emit('sfx', 'bolt');
}

function sweepHit(S, w) {
  const b = pBox(S.player);
  const x0 = w.x - 70, x1 = w.x + 70, y0 = w.y, y1 = w.y + w.h;
  return boxDist(b, x0, y0, x1, y1);
}

/** Per-frame hazard simulation (gift hazards + sweeps). */
export function tickHazards(S, dt) {
  const P = S.player, H = S.haz, hz = S.hz, box = pBox(P);
  const corgi = S.fx.corgi;
  const bark = (h) => { if (corgi && corgi.bark) { corgi.bark = false; S.emit('sfx', 'bark'); chip(S, `CORGI-BOT barked away ${EFFECT_NAMES[h.effect] || 'a drone'}`, PAL.help); return true; } return false; };
  // bolts
  for (const b of H.bolts) {
    if (b.tele > 0) { b.tele -= dt; if (b.tele <= 0) b.y = S.camY + 1200; continue; }
    b.y -= 2600 * hz * dt;
    const d = boxDist(box, b.x - 14, b.y, b.x + 14, b.y + 40);
    if (!b.done && d <= 0) {
      if (bark(b)) { b.done = true; continue; }
      b.done = true; hit(S, { ...b, vx: (P.x >= b.x ? 1 : -1) * 350, vy: 0, stun: 0, dashable: true }); S.emit('sfx', 'clonk');
    } else if (!b.done && !b.close && d <= 24 && b.y < P.y) { b.close = true; S.emit('clutch', { kind: 'miss' }); }
    if (b.y < P.y - 400 || b.y < S.camY - 200) b.done = true;
  }
  H.bolts = H.bolts.filter((b) => !b.done);
  // scrap drones chase
  for (const d of H.drones) {
    d.t -= dt;
    const tx = P.x, ty = P.y + PH / 2, dx = tx - d.x, dy = ty - d.y, L = Math.hypot(dx, dy) || 1;
    d.x += (dx / L) * d.spd * dt; d.y += (dy / L) * d.spd * dt;
    if (corgi && corgi.bark && L < 300 && bark(d)) { d.t = 0; continue; }
    if (boxDist(box, d.x - 32, d.y - 24, d.x + 32, d.y + 24) <= 0) {
      if (P.dashT > 0) { d.t = 0; S.emit('sfx', 'clonk'); chip(S, 'DASHED THROUGH THE DRONE', PAL.help); continue; }
      if (hit(S, { ...d, vx: (P.x >= d.x ? 1 : -1) * 700, vy: 350, stun: 0.3, dashable: true })) { d.t = 0; S.emit('sfx', 'thud'); }
    }
  }
  H.drones = H.drones.filter((d) => d.t > 0);
  // shoves
  for (const s of H.shoves) {
    s.tele -= dt;
    if (s.tele <= 0) { s.done = true; hit(S, { ...s, vx: s.dir * 1100, vy: 500, stun: 0.5 }); S.emit('sfx', 'thud'); S.shake = Math.max(S.shake, 0.3); }
  }
  H.shoves = H.shoves.filter((s) => !s.done);
  // meteor
  for (const m of H.meteors) {
    m.tele -= dt;
    if (m.tele > 0) continue;
    m.done = true;
    S.shake = Math.max(S.shake, 0.8); S.emit('sfx', 'boom'); S.flash = Math.max(S.flash, 0.2);
    const cx = P.x, cy = P.y + PH / 2, dist = Math.hypot(cx - m.x, cy - m.y);
    // destroy up to 3 tower platforms within 3 m of impact (rebuilt after 10 s)
    const near = S.platforms.filter((p) => p.alive && (p.kind === 'plat' || p.kind === 'plank' || p.kind === 'stair' || p.kind === 'pad'))
      .map((p) => ({ p, d: Math.hypot(clamp(m.x, p.x, p.x + p.w) - m.x, p.y - m.y) })).filter((o) => o.d <= 300).sort((a, b) => a.d - b.d).slice(0, 3);
    for (const { p } of near) { p.alive = false; p.respawnT = 10; p.crumbleT = -1; if (P.ground === p) { P.lastHit = { user: m.user, effect: 'METEOR', gift: m.gift, count: m.count, t: S.t, y: p.y }; } }
    if (dist < 170) hit(S, { ...m, vx: (cx >= m.x ? 1 : -1) * 2400, vy: 700, stun: 0 });
    else if (dist < 170 + 24) S.emit('clutch', { kind: 'miss' });
  }
  H.meteors = H.meteors.filter((m) => !m.done);
  // lightning strike (SAB majority)
  if (H.strike) {
    const s = H.strike; s.tele -= dt;
    if (s.tele <= 0) {
      H.strike = null; S.flash = 0.4; S.emit('sfx', 'strike');
      const owner = s.likers && s.likers[0] ? s.likers.reduce((a, b) => (a.n >= b.n ? a : b)).user : null;
      hit(S, { user: owner, effect: 'STRIKE', vx: (P.x < 540 ? 1 : -1) * 800, vy: 300, stun: 1.2 });
    }
  }
  // sweeps: carts, overseer lasers, sentry eye
  for (const w of S.sweeps) {
    if (w.tele > 0) { w.tele -= dt; continue; }
    w.x += w.dir * w.speed * dt;
    const d = sweepHit(S, w);
    if (!w.hitDone && d <= 0) {
      w.hitDone = true;
      if (w.kind === 'overseer' && !S.fx.overseerFirstHit && S.fx.overseer && !P.shield && !P.lift) {
        S.fx.overseerFirstHit = true; if (S.fx.overseer) S.fx.overseer.firstHit = true;
        overseerDrop(S, w);
      } else hit(S, { ...w, vx: w.dir * w.knock.vx, vy: w.knock.vy, stun: w.knock.stun });
      S.emit('sfx', w.kind === 'cart' ? 'thud' : 'laser');
    } else if (!w.hitDone && !w.missed && d <= 24 && Math.abs(w.x - P.x) < 80) { w.missed = true; S.emit('clutch', { kind: 'miss' }); }
    if ((w.dir > 0 && w.x > TOWER_X1 + 200) || (w.dir < 0 && w.x < TOWER_X0 - 200)) w.done = true;
  }
  S.sweeps = S.sweeps.filter((w) => !w.done);

  // timed status effects
  const F = S.fx;
  if (F.emp) { F.emp.t -= dt; if (F.emp.t <= 0) F.emp = null; }
  S.wind.gift = 0;
  if (F.crosswind) {
    const c = F.crosswind;
    if (c.tele > 0) c.tele -= dt; else { S.wind.gift = 400 * hz * c.dir; c.t -= dt; if (c.t <= 0) F.crosswind = null; }
  }
  if (F.lights) { F.lights.t -= dt; if (F.lights.t <= 0) F.lights = null; }
  if (F.quake) {
    const q = F.quake; q.t += dt;
    if (q.pulses < 5 && q.t >= 1 + q.pulses * 2) { const dir = q.pulses % 2 ? 1 : -1; q.pulses++; hit(S, { ...q, vx: dir * 900, vy: 200, stun: 0 }); S.emit('sfx', 'quake'); }
    if (q.t >= q.dur) F.quake = null;
  }
  if (F.hk) {
    const k = F.hk; k.t -= dt;
    k.y += 120 * hz * dt; k.x += clamp(P.x - k.x, -200 * dt, 200 * dt);
    if (!P.lift && !P.shield && boxDist(box, k.x - 90, k.y, k.x + 90, k.y + 250) <= 0) { F.hk = null; dropToBeacon(S, k, false); }
    else if (k.t <= 0) { F.hk = null; chip(S, 'HUNTER-KILLER OUTCLIMBED', PAL.help); }
  }
  if (F.overseer) {
    const o = F.overseer; o.t += dt;
    const at = [0.5, 5, 9.5];
    if (o.fired < 3 && o.t >= at[o.fired]) {
      const dir = o.fired % 2 ? -1 : 1; o.fired++;
      const tl = 1.5 * S.knob.telegraphScale * (o.teleMul || 1);
      S.sweeps.push({ user: o.user, effect: 'OVERSEER', gift: o.gift, count: o.count, sabId: o.sabId, barrage: o.barrage, kind: 'overseer', y: groundY(S), h: 110, x: dir > 0 ? TOWER_X0 - 80 : TOWER_X1 + 80, dir, speed: 1000 * hz, tele: tl, tele0: tl, knock: { vx: 1800, vy: 450, stun: 0 } });
    }
    if (o.t >= o.dur) { F.overseer = null; S.fx.overseerFirstHit = false; }
  }
  if (F.corgi) {
    const c = F.corgi; c.t -= dt;
    c.x += (P.x - P.face * 90 - c.x) * Math.min(1, dt * 5); c.y += (P.y - c.y) * Math.min(1, dt * 6);
    // catches one fall longer than 3 m: bounce back to the ledge
    if (c.catch && !P.ground && !P.lift && P.vy < 0 && P.lastGroundY - P.y > 300) {
      const back = S.platforms.find((q) => q.alive && q.y === P.lastGroundY) || ledgeAtOrBelow(S, P.lastGroundY, P.x);
      if (back) {
        c.catch = false; S.emit('sfx', 'bark'); chip(S, `CORGI-BOT caught PATCH (${c.tag || 'HELP'})`, PAL.help);
        const saved = (P.lastGroundY - P.y) / 100;
        startLift(S, back.y, 0.5, 'corgi', null); creditGiven(S, c.owner, saved); P.lastHit = null;
      }
    }
    if (c.t <= 0) F.corgi = null;
  }
  if (F.grapple) { F.grapple.t -= dt; if (F.grapple.t <= 0 || F.grapple.charges <= 0) F.grapple = null; }
  if (F.extraction) { F.extraction.t -= dt; if (F.extraction.t <= 0) F.extraction = null; }
  // ladders
  for (const L of S.ladders) { L.ttl -= dt; if (L.ttl <= 0) L.dead = true; }
  if (S.player.ladder && S.player.ladder.dead) S.player.ladder = null;
  S.ladders = S.ladders.filter((L) => !L.dead);
}

/** Streamer grapple (E / RB): hook the nearest ledge within 6 m. */
export function useGrapple(S) {
  const G = S.fx.grapple, P = S.player;
  if (!G || G.charges <= 0 || P.lift) return false;
  const cx = P.x, cy = P.y + PH / 2;
  let best = null, bd = Infinity;
  for (const p of S.platforms) {
    if (!p.alive || p.y < P.y + 40) continue;
    const px = clamp(cx, p.x + 20, p.x + p.w - 20), d = Math.hypot(px - cx, p.y - cy);
    if (d <= 600 && d < bd && p.y <= S.knob.liftCapM * 100) { bd = d; best = p; }
  }
  if (!best) return false;
  G.charges--;
  const fell = !P.ground && P.lastGroundY - P.y >= 400;
  const from = P.y;
  P.lift = { fx: P.x, fy: P.y, tx: clamp(P.x, best.x + 24, best.x + best.w - 24), ty: best.y, plat: best, t: 0, dur: 0.35, kind: 'grapple', then: { owner: G.owner } };
  P.ground = null; P.ladder = null; P.cable = null; P.vx = P.vy = P.kvx = 0;
  S.emit('sfx', 'zip');
  if (fell) S.emit('clutch', { kind: 'grapple' });
  S.grappleFrom = from;
  return true;
}

// ---------------- beacon floor drops ----------------
function dropToBeacon(S, src, removeOne) {
  const P = S.player;
  if (removeOne) {
    const top = S.lastBeacon();
    if (top.y > 0) { top.banked = false; if (top.planted) S.beacons.splice(S.beacons.indexOf(top), 1); chip(S, 'THE OVERSEER TOOK A BEACON', PAL.sab); }
  }
  const from = P.ground ? P.ground.y : Math.max(P.y, P.lastGroundY);
  let b = S.beacons[0]; // highest banked beacon at or below PATCH (a drop never lifts)
  for (const x of S.beacons) if (x.banked && x.y <= from && x.y >= b.y) b = x;
  const plat = S.platforms.find((p) => p.alive && (p.kind === 'beacon' || p.kind === 'ground') && Math.abs(p.y - b.y) < 1) || ledgeAtOrBelow(S, b.y + 1, b.x);
  P.lift = null; P.ladder = null; P.cable = null; P.vx = P.vy = P.kvx = 0; P.stun = 0;
  P.x = plat ? clamp(b.x, plat.x + 30, plat.x + plat.w - 30) : b.x; P.y = plat ? plat.y : b.y; P.ground = plat || null; P.lastGroundY = P.y;
  P.hurtT = 0.6; S.shake = Math.max(S.shake, 0.6);
  const loss = Math.max(0, from - P.y) / 100;
  P.lastHit = null;
  S.emit('drop', { user: src.user, effect: src.effect, gift: src.gift, count: src.count, barrage: src.barrage, loss, fromY: from });
  S.emit('sfx', 'scratch');
}
function overseerDrop(S, w) { dropToBeacon(S, w, true); }

/** PANIC: clear every active hazard, 10 s shield, suspend SAB for 60 s. */
export function panic(S) {
  const H = S.haz;
  H.bolts = []; H.drones = []; H.shoves = []; H.meteors = []; H.strike = null;
  S.sweeps = [];
  const F = S.fx;
  F.emp = null; F.crosswind = null; F.lights = null; F.quake = null; F.hk = null; F.overseer = null; F.greaseNext = 0; S.fx.overseerFirstHit = false;
  for (const p of S.platforms) p.grease = 0;
  S.player.shield = Math.max(S.player.shield, 10); S.player.stun = 0;
  S.panic = 60; S.panics++;
  S.banner = { text: 'RESISTANCE JAMMER ONLINE', sub: 'SABOTAGE HELD 60s · STILL CREDITED', color: PAL.help, t: 3 };
  S.emit('sfx', 'jammer');
}
