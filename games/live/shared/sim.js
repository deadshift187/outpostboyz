// SIMULATION: a bot chat of ~30 fake viewers (names, gift catalog and gift mix ported from app/lib/simulator.js)
// plus the "YOU ARE THE CHAT" tray. It fabricates RAW connector-shaped TikTok messages and feeds them through the
// same normalizer + combo-streak + msgId logic as TikFinity traffic (hub.ingestRaw), like the server's sim does.

// Catalog: combo = streakable gift (giftType 1). Coin values from app/lib/simulator.js.
export const GIFTS = {
  rose: { id: '5655', name: 'Rose', diamondCount: 1, combo: true },
  tiktok: { id: '5269', name: 'TikTok', diamondCount: 1, combo: true },
  fingerheart: { id: '5487', name: 'Finger Heart', diamondCount: 5, combo: true },
  panda: { id: '37', name: 'Panda', diamondCount: 5, combo: true },
  perfume: { id: '5658', name: 'Perfume', diamondCount: 20, combo: true },
  doughnut: { id: '5879', name: 'Doughnut', diamondCount: 30, combo: true },
  confetti: { id: '5585', name: 'Confetti', diamondCount: 100, combo: false },
  handhearts: { id: '5660', name: 'Hand Hearts', diamondCount: 100, combo: false },
  sunglasses: { id: '8843', name: 'Sunglasses', diamondCount: 199, combo: false },
  corgi: { id: '6267', name: 'Corgi', diamondCount: 299, combo: false },
  coral: { id: '5731', name: 'Coral', diamondCount: 499, combo: false },
  moneygun: { id: '7168', name: 'Money Gun', diamondCount: 500, combo: false },
  swan: { id: '6109', name: 'Swan', diamondCount: 699, combo: false },
  train: { id: '5978', name: 'Train', diamondCount: 899, combo: false },
  galaxy: { id: '11046', name: 'Galaxy', diamondCount: 1000, combo: false },
  diamondring: { id: '6203', name: 'Diamond Ring', diamondCount: 1500, combo: false },
  dramaqueen: { id: '5976', name: 'Drama Queen', diamondCount: 5000, combo: false },
  rocket: { id: '6147', name: 'Rocket', diamondCount: 20000, combo: false },
  lion: { id: '6369', name: 'Lion', diamondCount: 29999, combo: false },
  universe: { id: '6155', name: 'Universe', diamondCount: 34999, combo: false },
  tiktokuniverse: { id: '6751', name: 'TikTok Universe', diamondCount: 44999, combo: false },
};
const FIRST = ['sk8r', 'luna', 'big', 'tiny', 'captain', 'lil', 'mister', 'queen', 'dj', 'pixel', 'turbo', 'nacho', 'moon', 'cosmic', 'salty', 'sir', 'glitter', 'froggy', 'mega', 'sleepy'];
const LAST = ['bean', 'wolf', 'taco', 'ninja', 'vibes', 'goblin', 'boi', 'queen', 'gamer', 'noodle', 'panda', 'waffles', 'rex', 'sprout', 'jelly', 'blaze', 'mango', 'duck', 'storm', 'pickle'];
const COMMENTS = ['lets gooo', 'jump!!', 'W streamer', 'first time here', 'how high can he go', 'send a rose', 'sabotage him lol', 'hi from Brazil', 'this is so fun', 'GG'];
const PAINTS = ['red', 'orange', 'yellow', 'lime', 'green', 'teal', 'blue', 'purple', 'pink', 'white', 'black', 'chrome'];
const rand = (a) => a[Math.floor(Math.random() * a.length)];
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

let idSeq = 0;
const nextMsgId = () => String(7400000000000000000n + BigInt(Date.now()) * 1000n + BigInt(idSeq++ % 1000));

export const INTENSITY = {
  chill: { rate: 0.8, whale: 0.01, label: 'chill' },
  normal: { rate: 2.5, whale: 0.025, label: 'normal' },
  chaos: { rate: 7, whale: 0.06, label: 'chaos' },
};

function rawUser(nickname) {
  return { id: 'sim-' + nickname.toLowerCase().replace(/\W/g, ''), displayId: nickname.toLowerCase(), nickname, avatarThumb: { urlList: [] } };
}

/** The gift the table's tier `t` stands for: a catalog gift in its coin range (the right side for side:'gift'). */
export function giftForTier(t, side, giftSides) {
  const sides = Object.fromEntries(Object.entries(giftSides || {}).map(([k, v]) => [norm(k), v]));
  let c = Object.values(GIFTS).filter((g) => g.diamondCount >= (t.min ?? 0) && (t.max == null || g.diamondCount <= t.max));
  if (t.side === 'gift') { const s = c.filter((g) => sides[norm(g.name)] === side); if (s.length) c = s; }
  if (c.length) return c.sort((a, b) => a.diamondCount - b.diamondCount)[0];
  const coins = Math.max(1, t.min || 1);
  return { id: 'web-' + coins, name: `${coins}-coin gift`, diamondCount: coins, combo: false };
}

/**
 * createSim({ hub, getTable: () => ({tiers, giftSides}), comments: ['help','sab',...], slug })
 * -> { start(intensity), stop(), setIntensity(k), running, stats, tray: {...} }
 */
export function createSim({ hub, getTable, comments = ['help', 'sab'], slug }) {
  const emit = (kind, raw) => { if (!raw.common) raw.common = { msgId: nextMsgId() }; hub.ingestRaw(kind, raw, raw.__src || 'sim'); };
  const hasJoin = comments.includes('join');
  const hasPaint = comments.includes('paint');
  let pool = [], timer = null, acc = 0, t0 = 0, level = INTENSITY.normal, groupSeq = 1;
  const stats = { events: 0, gifts: 0, whales: 0, coins: 0 };

  function makePool() {
    const names = new Set();
    while (names.size < 30) names.add(`${rand(FIRST)}_${rand(LAST)}${Math.random() < 0.4 ? Math.floor(Math.random() * 99) : ''}`);
    pool = [...names].map((n, i) => ({ user: rawUser(n), team: Math.random() < 0.55 ? 'help' : 'sab', joined: false, weight: 1 + (i % 7 === 0 ? 4 : 0) }));
  }
  const pick = () => { const tot = pool.reduce((s, v) => s + v.weight, 0); let r = Math.random() * tot; for (const v of pool) { r -= v.weight; if (r <= 0) return v; } return pool[0]; };

  function sendGift(user, g, count = 1, src) {
    stats.gifts++; stats.coins += g.diamondCount * count;
    const gift = { id: g.id, name: g.name, diamondCount: g.diamondCount, type: g.combo ? 1 : 0, combo: g.combo };
    if (!g.combo) {
      for (let i = 0; i < count; i++) setTimeout(() => emit('gift', { __src: src, user, giftId: g.id, repeatCount: 1, repeatEnd: 0, groupId: '', gift }), i * 150);
      return;
    }
    const groupId = String(Date.now()) + (groupSeq++), streakId = nextMsgId();
    for (let i = 1; i <= count; i++) setTimeout(() => emit('gift', { __src: src, common: { msgId: streakId }, user, giftId: g.id, repeatCount: i, repeatEnd: 0, groupId, gift }), (i - 1) * 120);
    setTimeout(() => emit('gift', { __src: src, common: { msgId: streakId }, user, giftId: g.id, repeatCount: count, repeatEnd: 1, groupId, gift }), count * 120 + 300);
  }
  const like = (user, n, src) => { let left = Math.max(1, n), i = 0; while (left > 0) { const k = Math.min(left, 15); left -= k; setTimeout(() => emit('like', { __src: src, user, likeCount: k }), i++ * 200); } };
  const comment = (user, text, src) => emit('chat', { __src: src, user, content: String(text).slice(0, 200) });

  function botGift(v) {
    const { tiers = [], giftSides = {} } = getTable() || {};
    if (!tiers.length) return;
    const whales = tiers.filter((t) => (t.min || 0) >= 1000);
    let t;
    if (whales.length && Math.random() < level.whale * Math.min(1, 0.3 + (performance.now() - t0) / 60000)) {
      t = whales[Math.min(whales.length - 1, Math.floor(Math.pow(Math.random(), 2.2) * whales.length))];
      stats.whales++;
    } else {
      const small = tiers.filter((x) => (x.min || 0) < 1000);
      const w = small.map((x, i) => Math.pow(0.62, i));
      let r = Math.random() * w.reduce((a, b) => a + b, 0);
      t = small[0]; for (let i = 0; i < small.length; i++) { r -= w[i]; if (r <= 0) { t = small[i]; break; } }
    }
    const g = giftForTier(t, v.team, giftSides);
    sendGift(v.user, g, g.combo ? 1 + Math.floor(Math.random() * (level === INTENSITY.chaos ? 8 : 4)) : 1);
  }

  function act() {
    stats.events++;
    const v = pick();
    if (!v.joined) { // a viewer's first line picks a team (derby: SAB viewers ask for a car)
      v.joined = true;
      comment(v.user, v.team === 'sab' ? (hasJoin ? 'join' : 'sab') : 'help');
      if (Math.random() < 0.7) setTimeout(() => { if (timer) botGift(v); }, 250 + Math.random() * 500); // new viewers usually tip right away
      return;
    }
    const r = Math.random();
    if (r < 0.28) like(v.user, 1 + Math.floor(Math.random() * 15));
    else if (r < 0.40) comment(v.user, rand(COMMENTS));
    else if (r < 0.43) emit('member', { user: v.user });
    else if (r < 0.46) emit('follow', { user: v.user });
    else if (r < 0.48) emit('share', { user: v.user });
    else if (hasPaint && r < 0.51) comment(v.user, 'paint ' + rand(PAINTS));
    else botGift(v);
  }

  function tick() {
    const el = (performance.now() - t0) / 1000;
    const ramp = Math.min(1, 0.35 + el / 70); // warms up over ~45 s
    acc += level.rate * ramp * 0.1 * (0.6 + Math.random() * 0.8);
    let guard = 0;
    while (acc >= 1 && guard++ < 20) { acc -= 1; act(); }
  }

  const api = {
    get running() { return !!timer; },
    stats,
    start(k) { api.setIntensity(k); if (timer) return; makePool(); t0 = performance.now(); acc = 1; timer = setInterval(tick, 100); },
    stop() { clearInterval(timer); timer = null; },
    setIntensity(k) { level = INTENSITY[k] || INTENSITY.normal; },
    get intensity() { return level.label; },
    tray: {
      /** gift of tier i from the tray viewer; HELP comes from `name`, SAB from `name_sab` (games lock a team for 10 min). */
      gift(i, side, name) {
        const { tiers = [], giftSides = {} } = getTable() || {};
        const t = tiers[i]; if (!t) return null;
        const u = trayUser(name, side);
        if (t.side !== 'gift') comment(u, side === 'sab' ? (hasJoin && slug === 'derby' ? 'join' : 'sab') : 'help', 'tray');
        const g = giftForTier(t, side, giftSides);
        sendGift(u, g, 1, 'tray');
        return g;
      },
      comment(text, name, side = 'help') { comment(trayUser(name, side), text, 'tray'); },
      like(name, n = 15) { like(trayUser(name, 'help'), n, 'tray'); },
      follow(name) { emit('follow', { __src: 'tray', user: trayUser(name, 'help') }); },
      share(name) { emit('share', { __src: 'tray', user: trayUser(name, 'help') }); },
    },
  };
  function trayUser(name, side) {
    const n = String(name || 'you').replace(/[^\w.]/g, '').slice(0, 20) || 'you';
    return rawUser(side === 'sab' ? n + '_sab' : n);
  }
  return api;
}
