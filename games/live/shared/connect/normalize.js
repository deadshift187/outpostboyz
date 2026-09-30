// Browser (ESM) port of app/lib/normalize.js + app/lib/platforms.js: raw TikTok (TikFinity / 1.x-shaped) messages
// -> the ONE normalized event shape, the combo-streak logic, the msgId LRU, and the Twitch/YouTube coin table.
//   { type: 'gift'|'like'|'follow'|'share'|'comment'|'join'|'sub', user: { id, nickname, avatarUrl, handle },
//     gift?: { name, id, coins, count, streakTotal, streaking }, text?, likeCount?, msgId?, ts, source, platform }
// Keep in step with app/lib (the originals are the reference; this file only drops require/module.exports).

export function msgIdOf(d) {
  if (!d || typeof d !== 'object') return '';
  const c = d.common || {};
  const v = d.msgId ?? c.msgId ?? d.eventId ?? d.messageId;
  const s = v == null ? '' : String(v).trim();
  return s === '0' ? '' : s.slice(0, 64);
}

function firstUrl(img) {
  if (!img) return '';
  const list = img.urlList || img.url || img.urls;
  if (Array.isArray(list)) return list[0] || '';
  return typeof list === 'string' ? list : '';
}

export function normUser(raw) {
  const u = (raw && raw.user) || raw || {};
  const handle = u.displayId || u.uniqueId || raw.uniqueId || '';
  return {
    id: String(u.id || u.userId || raw.userId || handle || 'anon'),
    nickname: u.nickname || raw.nickname || handle || 'viewer',
    handle,
    avatarUrl: firstUrl(u.avatarThumb) || firstUrl(u.avatarMedium) || firstUrl(u.profilePicture) || u.profilePictureUrl || raw.profilePictureUrl || '',
  };
}

export function giftInfo(d) {
  const g = d.gift || d.giftDetails || d.extendedGiftInfo || {};
  const type = g.type ?? g.giftType ?? d.giftType;
  return {
    id: String(d.giftId || g.id || ''),
    name: g.name || g.giftName || d.giftName || 'Gift',
    coins: Number(g.diamondCount ?? d.diamondCount ?? 0) || 0,
    combo: g.combo === true || Number(type) === 1,
  };
}

/** Combo streaks: 'live' mode emits the DELTA since the last update of that streak (see app/lib/normalize.js). */
export class GiftStreaks {
  constructor(mode = 'live') { this.mode = mode; this.open = new Map(); }
  process(d) {
    const info = giftInfo(d);
    const user = normUser(d);
    const repeat = Math.max(1, Number(d.repeatCount) || 1);
    const ended = d.repeatEnd === true || Number(d.repeatEnd) === 1;
    const msgId = msgIdOf(d);
    const make = (count, streaking) => ({ type: 'gift', user, ...(msgId ? { msgId } : {}), gift: { name: info.name, id: info.id, coins: info.coins, count, streakTotal: repeat, streaking } });
    if (!info.combo) return make(repeat, false);
    const key = `${user.id}|${info.id}|${d.groupId || ''}`;
    this.prune();
    if (this.mode === 'end') {
      const prev = this.open.get(key);
      if (!ended) { this.open.set(key, { count: repeat, t: Date.now() }); return null; }
      if (prev && prev.ended && prev.count === repeat) return null;
      this.open.set(key, { count: repeat, t: Date.now(), ended: true });
      return make(repeat, false);
    }
    const prev = this.open.get(key);
    let seen = prev ? prev.count : 0;
    if (repeat < seen) seen = 0;
    const delta = repeat - seen;
    this.open.set(key, { count: Math.max(repeat, seen), t: Date.now(), ended });
    return delta > 0 ? make(delta, !ended) : null;
  }
  prune() { const now = Date.now(); for (const [k, v] of this.open) if (v.t < now - (v.ended ? 30000 : 120000)) this.open.delete(k); }
}

function base(type, d, extra) {
  const msgId = msgIdOf(d);
  return Object.assign({ type, user: normUser(d) }, msgId ? { msgId } : null, extra);
}

/** Bounded LRU of recently seen keys (5,000 like the server). check(key) -> true = duplicate. */
export class SeenIds {
  constructor(max = 5000) { this.max = max; this.map = new Map(); this.dropped = 0; }
  check(key) {
    if (!key) return false;
    if (this.map.has(key)) { this.map.delete(key); this.map.set(key, 1); this.dropped++; return true; }
    this.map.set(key, 1);
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
    return false;
  }
  get size() { return this.map.size; }
}

export function rawGiftKey(d) {
  const id = msgIdOf(d);
  if (!id) return '';
  const ended = d.repeatEnd === true || Number(d.repeatEnd) === 1;
  return `gift:${id}:${Math.max(1, Number(d.repeatCount) || 1)}:${ended ? 1 : 0}`;
}
export function eventKey(e) {
  if (!e || !e.msgId) return '';
  const id = String(e.msgId).slice(0, 64);
  if (e.type === 'gift') { const g = e.gift || {}; return `gift:${id}:${g.streakTotal ?? g.count ?? 1}:${g.streaking ? 0 : 1}`; }
  return `${e.type}:${id}`;
}

export const normalizers = {
  chat: (d) => base('comment', d, { text: String(d.content ?? d.comment ?? '') }),
  like: (d) => base('like', d, { likeCount: Number(d.likeCount ?? d.count ?? 1) || 1 }),
  follow: (d) => base('follow', d),
  share: (d) => base('share', d),
  member: (d) => base('join', d),
  subNotify: (d) => base('sub', d),
  subscribe: (d) => base('sub', d),
  social: (d) => {
    const kind = String(d.displayType || d.label || d.common?.displayText?.key || '').toLowerCase();
    if (kind.includes('follow')) return base('follow', d);
    if (kind.includes('share')) return base('share', d);
    return null;
  },
};

// ---------- app/lib/platforms.js ----------
export const DEFAULTS = {
  twitch: { coinsPerBit: 1, subTiers: { 1: 500, 2: 1000, 3: 2500 }, chatLikes: 5, chatCooldownS: 10, raid: 'share', channelPointsCoins: 0 },
  youtube: { coinsPerUsd: 100, newMember: 500, memberMilestone: 500, giftMembership: 500, chatLikes: 5, chatCooldownS: 10, minPollSeconds: 3 },
};
export const FX_TO_USD = {
  USD: 1, EUR: 1.1, GBP: 1.3, CAD: 0.73, AUD: 0.66, NZD: 0.6, JPY: 0.0068, INR: 0.0115, KRW: 0.00072,
  BRL: 0.18, MXN: 0.053, PHP: 0.017, TWD: 0.031, HKD: 0.128, SGD: 0.76, CHF: 1.17, SEK: 0.095, NOK: 0.093,
  DKK: 0.147, PLN: 0.26, CZK: 0.044, HUF: 0.0028, RON: 0.22, BGN: 0.56, TRY: 0.024, ZAR: 0.056, IDR: 0.000062,
  THB: 0.029, MYR: 0.22, VND: 0.00004, ARS: 0.00085, CLP: 0.00105, COP: 0.00025, PEN: 0.27, UYU: 0.025,
  ILS: 0.27, AED: 0.272, SAR: 0.267, QAR: 0.275, KWD: 3.26, EGP: 0.02, NGN: 0.00065, KES: 0.0077,
  RUB: 0.012, UAH: 0.024, KZT: 0.002, PKR: 0.0036, BDT: 0.0084, LKR: 0.0033, ISK: 0.0073, CRC: 0.002,
  DOP: 0.016, GTQ: 0.13, HNL: 0.039, NIO: 0.027, PYG: 0.00013, BOB: 0.145, RSD: 0.0094, MKD: 0.018, BAM: 0.56,
};
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
export function platformConfig(giftsDoc) {
  const p = (giftsDoc && typeof giftsDoc === 'object' && giftsDoc.platforms) || {};
  const tw = { ...DEFAULTS.twitch, ...(p.twitch || {}) };
  tw.subTiers = { ...DEFAULTS.twitch.subTiers, ...((p.twitch && p.twitch.subTiers) || {}) };
  const yt = { ...DEFAULTS.youtube, ...(p.youtube || {}) };
  yt.fxToUsd = { ...FX_TO_USD, ...((p.youtube && p.youtube.fxToUsd) || {}) };
  delete yt.fxToUsd._note;
  return { twitch: tw, youtube: yt };
}
export function toUsd(amount, currency, fx = FX_TO_USD) {
  const r = fx[String(currency || '').toUpperCase()];
  if (!(r > 0) || !Number.isFinite(Number(amount))) return null;
  return Number(amount) * r;
}
export function ytCoins({ amountMicros, amount, currency }, cfg) {
  const a = amountMicros != null ? Number(amountMicros) / 1e6 : Number(amount);
  const usd = toUsd(a, currency, cfg.fxToUsd);
  if (usd == null) return { coins: 0, usd: null, approx: true };
  return { coins: Math.max(0, Math.round(usd * num(cfg.coinsPerUsd, 100))), usd, approx: String(currency).toUpperCase() !== 'USD' };
}
export class ChatCharge {
  constructor() { this.last = new Map(); }
  take(userId, cfg, now = Date.now()) {
    const likes = Math.max(0, Math.min(1000, Math.round(num(cfg && cfg.chatLikes, 0))));
    if (!likes || !userId) return 0;
    const cd = Math.max(0, num(cfg.chatCooldownS, 10)) * 1000;
    const prev = this.last.get(userId);
    if (prev != null && now - prev < cd) return 0;
    this.last.set(userId, now);
    if (this.last.size > 20000) this.last.clear();
    return likes;
  }
}
export const PREFIX = { twitch: 'tw:', youtube: 'yt:' };
