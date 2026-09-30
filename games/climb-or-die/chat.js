// CLIMB OR DIE web edition: the simulated LIVE chat. DOM-free (runs headless in Node for tuning).
// Bot viewers join HELP/SAB by comment, chat, tap likes and send gifts from the real gift table
// (gifts.json tiers): a steady, escalating mix of help + sabotage, follows, shares and the
// occasional whale. Pace-aware: chat takes pity when PATCH falls behind the chopper's
// schedule and gets meaner when PATCH is ahead of it. Emits normalized platform events:
//   {type, platform:'tiktok', msgId, user:{id,nickname,avatarUrl}, gift:{name,id,coins,count}, likeCount, text}

// name -> coins (the same values the stream edition's simulator uses)
export const GIFTS = {
  Rose: 1, TikTok: 1, 'Finger Heart': 5, Panda: 5, Perfume: 20, Doughnut: 30, 'Hand Hearts': 100, Confetti: 100,
  Sunglasses: 199, Corgi: 299, Coral: 499, 'Money Gun': 500, Swan: 699, Train: 899, Galaxy: 1000, 'Diamond Ring': 1500,
  'Drama Queen': 5000, Rocket: 20000, Lion: 29999, Universe: 34999,
};

// The YOU ARE THE CHAT tray. cd = cooldown seconds (bigger effect, longer wait).
export const TRAY = {
  help: [
    { name: 'Rose', icon: '🌹', fx: 'PLANK', cd: 0.5 },
    { name: 'Finger Heart', icon: '💖', fx: 'PAD', cd: 1.5 },
    { name: 'Doughnut', icon: '🍩', fx: 'LADDER', cd: 5 },
    { name: 'Hand Hearts', icon: '🛡️', fx: 'SHIELD', cd: 12 },
    { name: 'Corgi', icon: '🐶', fx: 'CORGI', cd: 20 },
    { name: 'Swan', icon: '🦢', fx: 'ZIPLINE', cd: 40 },
  ],
  sab: [
    { name: 'TikTok', icon: '🔩', fx: 'BOLT', cd: 0.5 },
    { name: 'Panda', icon: '🐼', fx: 'GREASE', cd: 1.5 },
    { name: 'Perfume', icon: '🛸', fx: 'DRONE', cd: 5 },
    { name: 'Confetti', icon: '💥', fx: 'SHOVE', cd: 12 },
    { name: 'Sunglasses', icon: '😎', fx: 'EMP', cd: 20 },
    { name: 'Galaxy', icon: '☄️', fx: 'METEOR', cd: 40 },
  ],
};

const FIRST = ['sk8r', 'luna', 'big', 'tiny', 'captain', 'lil', 'mister', 'queen', 'dj', 'pixel', 'turbo', 'nacho', 'moon', 'cosmic', 'salty', 'sir', 'glitter', 'froggy', 'mega', 'sleepy'];
const LAST = ['bean', 'wolf', 'taco', 'ninja', 'vibes', 'goblin', 'boi', 'queen', 'gamer', 'noodle', 'panda', 'waffles', 'rex', 'sprout', 'jelly', 'blaze', 'mango', 'duck', 'storm', 'pickle'];
const CHATTER = ['lets gooo', 'JUMP', 'W streamer', 'first time here', 'how high can he go', 'go patch go', 'hi from Brazil', 'this is so fun', 'GG',
  'no way he made that', 'LMAO', 'chat is evil today', 'rose incoming', 'the chopper is waiting', 'dont look down', 'clutch', 'W', 'hold jump for the big ones'];
const HELP_TALK = ['help', 'helper', 'h!'];
const SAB_TALK = ['sab', 'sabotage', 's!'];
const HELP_CHEER = ['sending help', 'we got you patch', 'team help 💚', 'climb climb climb'];
const SAB_CHEER = ['sab gang 😈', 'drop him', 'drone incoming lol', 'he is not making it'];

// Weighted pools. side 'gift' gifts pick their own side (Rose/Finger Heart help, TikTok/Panda sab).
const HELP_POOL = [['Rose', 40, 5], ['Finger Heart', 22, 3], ['Doughnut', 16, 1], ['Hand Hearts', 9, 1], ['Corgi', 5, 1], ['Coral', 4, 1], ['Swan', 4, 1]];
const SAB_POOL = [['TikTok', 38, 4], ['Panda', 22, 3], ['Perfume', 16, 1], ['Confetti', 9, 1], ['Sunglasses', 6, 1], ['Money Gun', 4, 1], ['Train', 5, 1]];
// Whale ladder (index grows with run time): help lifts vs sabotage nukes.
const HELP_WHALES = ['Galaxy', 'Diamond Ring', 'Drama Queen', 'Rocket', 'Lion'];
const SAB_WHALES = ['Galaxy', 'Diamond Ring', 'Drama Queen', 'Rocket', 'Universe'];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function createChat({ emit, rnd = Math.random } = {}) {
  let seq = 0, bots = [], t = 0, T = {};
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const range = (a, b) => a + rnd() * (b - a);
  const weighted = (pool) => { let s = 0; for (const p of pool) s += p[1]; let r = rnd() * s; for (const p of pool) { r -= p[1]; if (r <= 0) return p; } return pool[0]; };
  const out = (e) => emit({ platform: 'tiktok', msgId: 'web-' + (++seq), ...e });

  function start() {
    t = 0; seq = 0; bots = [];
    const used = new Set();
    while (bots.length < 30) {
      const nick = `${pick(FIRST)}_${pick(LAST)}${rnd() < 0.35 ? Math.floor(rnd() * 99) : ''}`;
      if (used.has(nick)) continue;
      used.add(nick);
      bots.push({ user: { id: 'bot-' + nick, nickname: nick, avatarUrl: '' }, team: rnd() < 0.58 ? 'help' : 'sab', joined: false });
    }
    T = { join: 0.8, comment: 3, like: 1.2, gift: 2.5, whale: range(70, 95), follow: range(15, 30), share: range(35, 70) };
  }

  const joinedOf = (team) => bots.filter((b) => b.joined && b.team === team);
  function join(b) { b.joined = true; out({ type: 'comment', user: b.user, text: pick(b.team === 'help' ? HELP_TALK : SAB_TALK) }); }
  /** A sender for a team gift (>= 10 coins): the sender's team decides, so it must have joined. */
  function sender(team) {
    const j = joinedOf(team);
    if (j.length && rnd() < 0.85) return pick(j);
    const fresh = bots.find((b) => !b.joined && b.team === team);
    if (fresh) { join(fresh); return fresh; }
    return j.length ? pick(j) : pick(bots);
  }
  const anyBot = () => { const j = bots.filter((b) => b.joined); return j.length ? pick(j) : pick(bots); };
  function gift(b, name, count = 1) { out({ type: 'gift', user: b.user, gift: { name, id: name.toLowerCase().replace(/\W/g, ''), coins: GIFTS[name], count } }); }

  /**
   * ctx: { heightM, limitS }. Escalation runs on t (active play seconds). Pace = height vs the
   * chopper schedule (summit at ~85% of the clock): behind -> more help, ahead -> more sabotage.
   */
  function tick(dt, ctx = {}) {
    t += dt;
    const limit = ctx.limitS || 480, h = ctx.heightM || 0;
    const target = Math.min(250, (250 * t) / (limit * 0.85));
    const pace = h - target;
    const ramp = clamp(t / 300, 0, 1);
    const sabShare = clamp(0.3 + 0.25 * ramp + clamp(pace / 90, -0.28, 0.2), 0.1, 0.72);
    for (const k in T) T[k] -= dt;

    if (T.join <= 0) {
      const b = bots.find((x) => !x.joined);
      if (b) join(b);
      T.join = t < 40 ? range(0.8, 2.2) : range(6, 14);
    }
    if (T.comment <= 0) {
      const b = anyBot();
      const text = rnd() < 0.3 ? pick(b.team === 'help' ? HELP_CHEER : SAB_CHEER) : pick(CHATTER);
      out({ type: 'comment', user: b.user, text });
      T.comment = range(2.2, 5);
    }
    if (T.like <= 0) {
      // likes lean toward whichever side the pace favours (lightning: Storm Lift vs Strike)
      const team = rnd() < sabShare ? 'sab' : 'help';
      const j = joinedOf(team);
      out({ type: 'like', user: (j.length ? pick(j) : anyBot()).user, likeCount: 2 + Math.floor(rnd() * 14) });
      T.like = range(0.6, 1.5);
    }
    if (T.gift <= 0) {
      const sab = rnd() < sabShare;
      const late = t > 180 ? 1.6 : 1;
      const pool = (sab ? SAB_POOL : HELP_POOL).map(([n, w, c], i) => [n, i >= 2 ? w * late : w, c]);
      const [name, , maxCount] = weighted(pool);
      const coins = GIFTS[name];
      const count = 1 + Math.floor(rnd() * maxCount);
      gift(coins < 10 ? anyBot() : sender(sab ? 'sab' : 'help'), name, count);
      const rate = 0.24 + 0.36 * ramp; // gifts per second: 0.24 -> 0.6 over five minutes
      T.gift = -Math.log(1 - rnd() * 0.95) / rate;
    }
    if (T.whale <= 0) {
      // behind schedule: a lift is likelier; ahead: a nuke. Bigger whales as the clock runs.
      const sab = rnd() < clamp(sabShare + 0.05, 0.15, 0.8);
      const lvl = clamp(Math.floor(t / 100) + (rnd() < 0.3 ? 1 : 0) - (rnd() < 0.25 ? 1 : 0), 0, 4);
      let name = (sab ? SAB_WHALES : HELP_WHALES)[lvl];
      if (!sab && name === 'Lion' && h < 120) name = 'Rocket'; // the extraction ladder only means something up high
      gift(sender(sab ? 'sab' : 'help'), name, 1);
      T.whale = range(50, 80) - 20 * ramp;
    }
    if (T.follow <= 0) { out({ type: 'follow', user: pick(bots).user }); T.follow = range(18, 36); }
    if (T.share <= 0) { out({ type: 'share', user: anyBot().user }); T.share = range(40, 80); }
  }

  return { start, tick, get t() { return t; }, get bots() { return bots; } };
}
