// Canvas overlay drawn ON TOP of the game: event feed, top-gifters leaderboard,
// full-screen whale banner, and a small mode pill. Game-agnostic.
//
// Layout is overridable per game (game.overlayLayout -> options), all optional:
//   feed:  { x, bottom, lines, lineH, fontPx, maxWidth }   event feed placement
//   board: false | { x, y }                                top-gifters card (false = hidden)
//   pill:  { x, y }                                        SIMULATOR/LIVE mode pill
//   whale: { top, bottom, centerY }                        whale banner backdrop band + center
//   hideFeed: () => boolean                                e.g. hide while the game shows a card

const FONT = '"Arial Black", "Segoe UI", Arial, sans-serif';

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function fitText(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  while (text.length > 1 && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
  return text + '…';
}

// LRU-capped: a long stream sees thousands of viewers; unbounded Image objects = memory growth.
const avatarCache = new Map();
const AVATAR_MAX = 150;
function avatar(url) {
  if (!url || typeof url !== 'string') return null;
  let img = avatarCache.get(url);
  if (img) { avatarCache.delete(url); avatarCache.set(url, img); }
  else {
    img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.onerror = () => { img.failed = true; };
    img.src = url;
    avatarCache.set(url, img);
    while (avatarCache.size > AVATAR_MAX) { const k = avatarCache.keys().next().value; const old = avatarCache.get(k); old.src = ''; avatarCache.delete(k); }
  }
  return !img.failed && img.complete && img.naturalWidth ? img : null;
}
const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
const firstGrapheme = (s) => { s = String(s || '?'); if (seg) { for (const g of seg.segment(s)) return g.segment; } return [...s][0] || '?'; };
// Events from TikTok can arrive with missing fields; never let one bad event throw in the render loop.
function safeEvent(e) {
  const u = e.user || {};
  const user = { ...u, id: String(u.id ?? 'anon'), nickname: String(u.nickname || u.handle || 'viewer').replace(/[\u0000-\u001F\u202A-\u202E\u2066-\u2069]/g, '') || 'viewer' };
  const out = { ...e, user };
  if (e.type === 'gift') { const g = e.gift || {}; out.gift = { ...g, name: String(g.name || 'Gift'), coins: Number(g.coins) || 0, count: Math.max(1, Number(g.count) || 1) }; }
  if (e.type === 'like') out.likeCount = Math.max(1, Number(e.likeCount) || 1);
  return out;
}

// Platform badge (feed avatars, top-gifters rows). TikTok is only badged once another platform shows up.
const BADGE = { twitch: { bg: '#9146FF', fg: '#fff', t: 'T' }, youtube: { bg: '#FF0033', fg: '#fff', t: '▶' }, tiktok: { bg: '#111', fg: '#25F4EE', t: '♪' } };
function drawBadge(ctx, platform, x, y, r) {
  const b = BADGE[platform];
  if (!b) return;
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = b.bg; ctx.fill();
  ctx.lineWidth = Math.max(2, r * 0.22); ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.stroke();
  ctx.fillStyle = b.fg; ctx.font = `${Math.round(r * 1.25)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(b.t, x + (b.t === '▶' ? r * 0.08 : 0), y + 1);
  ctx.restore();
}
const platformOfEvt = (e) => (e && ['twitch', 'youtube', 'tiktok'].includes(e.platform) ? e.platform : /^tw:/.test(e && e.user && e.user.id) ? 'twitch' : /^yt:/.test(e && e.user && e.user.id) ? 'youtube' : 'tiktok');

function hue(str) { let h = 0; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }

function drawAvatar(ctx, user, x, y, r) {
  const img = avatar(user.avatarUrl);
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.closePath();
  if (img) { ctx.clip(); ctx.drawImage(img, x - r, y - r, r * 2, r * 2); }
  else {
    ctx.fillStyle = `hsl(${hue(user.id)},70%,55%)`; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `${Math.round(r)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(firstGrapheme(user.nickname).toUpperCase(), x, y + 1);
  }
  ctx.restore();
}

export function createOverlay({ W, H, options = {} }) {
  const FEED = { x: 40, bottom: H - 60, lines: 7, lineH: 68, fontPx: 36, maxWidth: W - 80, ...(options.feed || {}) };
  const BOARD = options.board === false ? null : { x: W - 400, y: 40, ...(options.board || {}) };
  const PILL = { x: 40, y: 40, ...(options.pill || {}) };
  const WHALE = { top: 0, bottom: H, centerY: H * 0.42, ...(options.whale || {}) };
  const feed = []; // {text, color, t, user}
  const likeAgg = new Map(); // userId -> feed item (merge like spam)
  const board = new Map(); // userId -> {user, coins}
  const whales = []; // queue of {evt, map}
  let whale = null; // {evt, map, t}
  let status = { mode: 'sim' };
  let time = 0;
  const seenPlatforms = new Set();
  const showBadge = (p) => p && (p !== 'tiktok' || seenPlatforms.size > 1);

  const colorFor = (type, map) => map && map.whale ? '#ffd23f'
    : { gift: '#7df9ff', like: '#ff7eb6', follow: '#9dff7d', share: '#b58cff', sub: '#ffb347', comment: '#ffffff', join: '#cccccc' }[type] || '#fff';

  function describe(e, m) {
    const n = e.user.nickname;
    const tail = m && m.label ? ` → ${m.label}` : '';
    const other = e.platform === 'twitch' || e.platform === 'youtube';
    if (other && e.type === 'gift') return `${n}: ${e.gift.name}${tail}`; // "Cheer 100", "Super Chat $5.00", "Gift Sub T1 x5"
    if (e.type === 'share' && e.raid) return `${n} raided with ${Number(e.raid.viewers) || 0} viewers${tail}`;
    switch (e.type) {
      case 'gift': return `${n} sent ${e.gift.name}${e.gift.count > 1 ? ' x' + e.gift.count : ''}${tail}`;
      case 'like': return `${n} tapped x${e.likeCount}${tail}`;
      case 'follow': return `${n} followed${tail}`;
      case 'share': return `${n} shared${tail}`;
      case 'sub': return `${n} subscribed${tail}`;
      case 'join': return `${n} joined`;
      case 'comment': return `${n}: ${e.text}`;
      default: return `${n} ${e.type}`;
    }
  }

  function push(e, m) {
    if (!e || !e.type) return;
    e = safeEvent(e);
    e.platform = platformOfEvt(e);
    seenPlatforms.add(e.platform);
    if (e.type === 'gift') {
      const cur = board.get(e.user.id) || { user: e.user, coins: 0 };
      cur.user = e.user; cur.coins += (e.gift.coins || 0) * (e.gift.count || 1);
      board.set(e.user.id, cur);
      if (m && m.whale) whales.push({ evt: e, map: m });
    }
    if (m && m.feed === false) return;
    // Merge like spam / combo streaks from the same user into one live line.
    const aggKey = e.type === 'like' ? 'L' + e.user.id : e.type === 'gift' && e.gift.streaking !== undefined ? 'G' + e.user.id + e.gift.id : null;
    const prev = aggKey && likeAgg.get(aggKey);
    if (prev && time - prev.t < 3 && feed.includes(prev)) {
      if (e.type === 'like') prev.likes += e.likeCount; else prev.gifts += e.gift.count;
      const merged = e.type === 'like' ? { ...e, likeCount: prev.likes } : { ...e, gift: { ...e.gift, count: prev.gifts } };
      prev.text = describe(merged, m); prev.t = time;
      feed.splice(feed.indexOf(prev), 1); feed.push(prev);
      return;
    }
    const item = { text: describe(e, m), color: colorFor(e.type, m), t: time, user: e.user, platform: e.platform, likes: e.likeCount || 0, gifts: e.gift ? e.gift.count : 0 };
    feed.push(item);
    if (aggKey) likeAgg.set(aggKey, item);
    while (feed.length > FEED.lines) feed.shift();
  }

  /** A game-made feed line ({text, color, user}): e.g. "@a, @b +3 others · BARRAGE ×12". */
  function note(n) {
    if (!n || !n.text) return;
    const u = n.user || {};
    feed.push({ text: String(n.text), color: n.color || '#fff', fit: n.fit, t: time, user: { id: String(u.id ?? 'game'), nickname: String(u.nickname || 'B'), avatarUrl: u.avatarUrl || '' }, likes: 0, gifts: 0 });
    while (feed.length > FEED.lines) feed.shift();
  }

  function update(dt) {
    time += dt;
    // drop stale like/streak aggregation keys (one per viewer otherwise: slow memory growth)
    if (likeAgg.size > 50) for (const [k, it] of likeAgg) if (time - it.t > 3 || !feed.includes(it)) likeAgg.delete(k);
    for (let i = feed.length - 1; i >= 0; i--) if (time - feed[i].t > 10) feed.splice(i, 1);
    if (whale && time - whale.t > 4.2) whale = null;
    if (!whale && whales.length) whale = { ...whales.shift(), t: time };
  }

  function renderFeed(ctx) {
    if (options.hideFeed && options.hideFeed()) return;
    const { x, lineH, bottom, fontPx, maxWidth } = FEED;
    const pillH = Math.round(lineH * 0.85), r = Math.round(pillH * 0.38);
    ctx.font = `${fontPx}px ${FONT}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    feed.forEach((f, i) => {
      const y = bottom - (feed.length - 1 - i) * lineH;
      const age = time - f.t;
      const a = Math.min(1, age * 6) * Math.min(1, (10 - age) / 1.5);
      ctx.globalAlpha = Math.max(0, a);
      // game notes with fit:'shrink' (BARRAGE credits) scale down to fit instead of losing their tail
      let fpx = fontPx;
      if (f.fit === 'shrink') { const w0 = ctx.measureText(f.text).width, avail = maxWidth - r * 2 - 70; if (w0 > avail) { fpx = Math.max(24, Math.floor(fontPx * avail / w0)); ctx.font = `${fpx}px ${FONT}`; } }
      const text = fitText(ctx, f.text, maxWidth - r * 2 - 70);
      const w = ctx.measureText(text).width + r * 2 + 70;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; rr(ctx, x, y - pillH / 2, w, pillH, pillH / 2); ctx.fill();
      drawAvatar(ctx, f.user, x + pillH / 2 + 1, y, r);
      if (showBadge(f.platform)) { drawBadge(ctx, f.platform, x + pillH / 2 + 1 + r * 0.78, y + r * 0.72, Math.max(9, r * 0.46)); ctx.font = `${fpx}px ${FONT}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; }
      ctx.fillStyle = f.color; ctx.fillText(text, x + pillH + 8, y + 1);
      if (fpx !== fontPx) ctx.font = `${fontPx}px ${FONT}`;
    });
    ctx.globalAlpha = 1;
  }

  function renderBoard(ctx) {
    if (!BOARD || !board.size) return; // (hidden board: skip the per-frame sort)
    const top = [...board.values()].sort((a, b) => b.coins - a.coins).slice(0, 5);
    const x = BOARD.x, y = BOARD.y, w = 370, rowH = 64;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; rr(ctx, x, y, w, 70 + top.length * rowH, 24); ctx.fill();
    ctx.fillStyle = '#ffd23f'; ctx.font = `30px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('TOP GIFTERS', x + 24, y + 38);
    top.forEach((r, i) => {
      const ry = y + 70 + i * rowH + rowH / 2 - 4;
      ctx.fillStyle = ['#ffd23f', '#e0e0e0', '#e39b5b', '#fff', '#fff'][i];
      ctx.font = `28px ${FONT}`; ctx.textAlign = 'left';
      ctx.fillText(String(i + 1), x + 22, ry);
      drawAvatar(ctx, r.user, x + 76, ry, 22);
      const rp = platformOfEvt({ user: r.user, platform: r.user.platform });
      if (showBadge(rp)) { drawBadge(ctx, rp, x + 93, ry + 15, 10); ctx.textBaseline = 'middle'; }
      ctx.fillStyle = '#fff'; ctx.font = `26px ${FONT}`;
      ctx.fillText(fitText(ctx, r.user.nickname, 140), x + 108, ry);
      ctx.textAlign = 'right'; ctx.fillStyle = '#7df9ff';
      ctx.fillText(r.coins.toLocaleString(), x + w - 22, ry);
    });
  }

  function renderWhale(ctx) {
    if (!whale) return;
    const age = time - whale.t;
    const inA = Math.min(1, age * 4), outA = Math.min(1, (4.2 - age) * 3);
    const a = Math.max(0, Math.min(inA, outA));
    const e = whale.evt, m = whale.map;
    ctx.save();
    ctx.globalAlpha = a * 0.75; ctx.fillStyle = '#000'; ctx.fillRect(0, WHALE.top, W, WHALE.bottom - WHALE.top);
    ctx.beginPath(); ctx.rect(0, WHALE.top, W, WHALE.bottom - WHALE.top); ctx.clip();
    ctx.globalAlpha = a;
    // spinning rays
    ctx.translate(W / 2, WHALE.centerY);
    ctx.rotate(age * 0.4);
    for (let i = 0; i < 16; i++) {
      ctx.rotate(Math.PI / 8);
      ctx.fillStyle = i % 2 ? 'rgba(255,210,63,0.18)' : 'rgba(255,90,160,0.14)';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(1400, -120); ctx.lineTo(1400, 120); ctx.fill();
    }
    ctx.restore(); ctx.save(); ctx.globalAlpha = a;
    const s = 1 + Math.max(0, 0.3 - age) * 1.5;
    ctx.beginPath(); ctx.rect(0, WHALE.top, W, WHALE.bottom - WHALE.top); ctx.clip();
    ctx.translate(W / 2, WHALE.centerY); ctx.scale(s, s);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    drawAvatar(ctx, e.user, 0, -330, 110);
    ctx.font = `64px ${FONT}`; ctx.fillStyle = '#fff';
    ctx.fillText(fitText(ctx, e.user.nickname, W - 120), 0, -160);
    const g = `${e.gift.name.toUpperCase()}${e.gift.count > 1 && !/ X\d+$/.test(e.gift.name.toUpperCase()) ? ' x' + e.gift.count : ''}`;
    // long names ("SUPER CHAT $20.00", "GIFT SUB T1 X5") shrink to fit before they get an ellipsis
    ctx.font = `110px ${FONT}`;
    const gw = ctx.measureText(g).width;
    if (gw > W - 80) ctx.font = `${Math.max(60, Math.floor(110 * (W - 80) / gw))}px ${FONT}`;
    ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#000'; ctx.lineWidth = 10;
    ctx.strokeText(fitText(ctx, g, W - 80), 0, 0); ctx.fillText(fitText(ctx, g, W - 80), 0, 0);
    ctx.font = `56px ${FONT}`; ctx.fillStyle = '#7df9ff';
    ctx.fillText(`${(e.gift.coins * e.gift.count).toLocaleString()} COINS`, 0, 120);
    if (m.label) { ctx.font = `90px ${FONT}`; ctx.fillStyle = '#ff5aa0'; const lb = fitText(ctx, m.label, W - 80); ctx.strokeText(lb, 0, 250); ctx.fillText(lb, 0, 250); }
    ctx.restore();
  }

  function renderStatus(ctx) {
    if (options.hud === false) return;
    const who = status.source === 'tikfinity' ? 'TikFinity' : '@' + status.username;
    let txt = status.mode === 'live' ? `LIVE ${who}` : status.mode === 'connecting' ? `CONNECTING ${who}` : 'SIMULATOR';
    const P = status.platforms;
    if (P) { // multi-source: name every platform that is live
      const on = [];
      if (P.tiktok && P.tiktok.mode === 'live') on.push(who);
      if (P.twitch && P.twitch.mode === 'live') on.push('TW #' + P.twitch.channel);
      if (P.youtube && P.youtube.mode === 'live') on.push('YT');
      if (on.length) txt = 'LIVE ' + on.join(' · ');
      else if (status.mode === 'connecting') txt = 'CONNECTING' + (P.tiktok && P.tiktok.mode === 'connecting' ? ' ' + who : '');
    }
    ctx.font = `24px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(txt).width + 40;
    ctx.fillStyle = status.mode === 'live' ? 'rgba(255,40,80,0.85)' : 'rgba(0,0,0,0.5)';
    rr(ctx, PILL.x, PILL.y, w, 44, 22); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(txt, PILL.x + 20, PILL.y + 23);
  }

  return {
    push,
    note,
    update,
    render(ctx) { renderBoard(ctx); renderFeed(ctx); renderStatus(ctx); renderWhale(ctx); },
    setStatus: (s) => (status = { ...status, ...s }),
    seedLeaderboard(rows) { board.clear(); for (const r of rows || []) board.set(r.user.id, { ...r }); },
    reset() { board.clear(); feed.length = 0; whales.length = 0; whale = null; },
    get whaleActive() { return !!whale; },
  };
}
