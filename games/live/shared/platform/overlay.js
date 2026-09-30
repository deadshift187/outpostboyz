// Canvas overlay drawn ON TOP of the game: event feed, top-gifters leaderboard,
// full-screen whale banner, and a small mode pill. Game-agnostic.
//
// Layout is overridable per game (game.overlayLayout -> options), all optional:
//   feed:  { x, bottom, lines, lineH, fontPx, maxWidth }   event feed placement
//   board: false | { x, y }                                top-gifters card (false = hidden)
//   pill:  { x, y }                                        SIMULATOR/LIVE mode pill
//   whale: false | { mode, top, bottom, centerY, duration }  the whale banner (gifts >= whaleThreshold):
//          false (or mode 'off') = no banner at all; mode 'full' (default) = the big celebration, clipped to
//          top..bottom around centerY; mode 'compact' = one ~250 px strip (avatar, name, gift x count, coins,
//          effect) inside the top..bottom band (default: the bottom lane 1640-1920). duration = seconds
//          per whale (default 4.2; whales queue).
//   onWhale(info)                                          set by platform/main.js: {phase:'start'|'end', evt,
//                                                          map, duration, mode, band:{top,bottom}, queued}
//   hideFeed: () => boolean                                e.g. hide while the game shows a card
//
// Feed lines that are too long shrink (down to 24 px) before anything is cut; if a line still doesn't fit at
// 24 px, the viewer/gift part is shortened and the effect (the text after the arrow) is kept whole.

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
  const wOpt = options.whale === false ? { mode: 'off' } : options.whale && typeof options.whale === 'object' ? options.whale : {};
  const WHALE_MODE = ['off', 'compact', 'full'].includes(wOpt.mode) ? wOpt.mode : 'full';
  const WHALE = WHALE_MODE === 'compact' ? { top: H - 280, bottom: H, ...wOpt } : { top: 0, bottom: H, centerY: H * 0.42, ...wOpt };
  if (WHALE.centerY == null) WHALE.centerY = (WHALE.top + WHALE.bottom) / 2;
  const WHALE_S = Math.max(1, Math.min(10, Number(wOpt.duration) || 4.2));
  const onWhale = typeof options.onWhale === 'function' ? options.onWhale : null;
  const FEED_MIN_PX = 24;
  const feed = []; // {text, color, t, user}
  const likeAgg = new Map(); // userId -> feed item (merge like spam)
  const board = new Map(); // userId -> {user, coins}
  const whales = []; // queue of {evt, map}
  let whale = null; // {evt, map, t}
  let status = { mode: 'sim' };
  let time = 0;
  const seenPlatforms = new Set();
  const showBadge = (p) => p && (p !== 'tiktok' || seenPlatforms.size > 1);
  const whaleInfo = (w, phase) => ({ phase, evt: w.evt, map: w.map, duration: WHALE_S, mode: WHALE_MODE, band: { top: WHALE.top, bottom: WHALE.bottom }, queued: whales.length });

  const colorFor = (type, map) => map && map.whale ? '#ffd23f'
    : { gift: '#7df9ff', like: '#ff7eb6', follow: '#9dff7d', share: '#b58cff', sub: '#ffb347', comment: '#ffffff', join: '#cccccc' }[type] || '#fff';

  // the effect part of a feed line (" → HELP: LONGER POLE"): kept whole when a line has to be cut
  const tailOf = (e, m) => (m && m.label && e.type !== 'join' && e.type !== 'comment' ? ` → ${m.label}` : '');
  function describe(e, m) {
    const n = e.user.nickname;
    const tail = tailOf(e, m);
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
      if (m && m.whale && WHALE_MODE !== 'off') { whales.push({ evt: e, map: m }); while (whales.length > 40) whales.shift(); }
    }
    if (m && m.feed === false) return;
    // Merge like spam / combo streaks from the same user into one live line.
    const aggKey = e.type === 'like' ? 'L' + e.user.id : e.type === 'gift' && e.gift.streaking !== undefined ? 'G' + e.user.id + e.gift.id : null;
    const prev = aggKey && likeAgg.get(aggKey);
    if (prev && time - prev.t < 3 && feed.includes(prev)) {
      if (e.type === 'like') prev.likes += e.likeCount; else prev.gifts += e.gift.count;
      const merged = e.type === 'like' ? { ...e, likeCount: prev.likes } : { ...e, gift: { ...e.gift, count: prev.gifts } };
      prev.text = describe(merged, m); prev.tail = tailOf(e, m); prev.t = time;
      feed.splice(feed.indexOf(prev), 1); feed.push(prev);
      return;
    }
    const item = { text: describe(e, m), tail: tailOf(e, m), color: colorFor(e.type, m), t: time, user: e.user, platform: e.platform, likes: e.likeCount || 0, gifts: e.gift ? e.gift.count : 0 };
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
    if (whale && time - whale.t > WHALE_S) { const w = whale; whale = null; if (onWhale) onWhale(whaleInfo(w, 'end')); }
    if (!whale && whales.length) { whale = { ...whales.shift(), t: time }; if (onWhale) onWhale(whaleInfo(whale, 'start')); }
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
      // every line scales down to fit (min 24 px) instead of losing its tail (the effect name)
      let fpx = fontPx;
      const avail = maxWidth - r * 2 - 70, w0 = ctx.measureText(f.text).width;
      if (w0 > avail) { fpx = Math.max(Math.min(FEED_MIN_PX, fontPx), Math.floor(fontPx * avail / w0)); ctx.font = `${fpx}px ${FONT}`; }
      let text = f.text;
      if (ctx.measureText(text).width > avail) {
        // still too long at the minimum size: shorten the viewer/gift part, keep the effect whole
        const tail = f.tail && text.endsWith(f.tail) && ctx.measureText(f.tail).width < avail * 0.7 ? f.tail : '';
        text = tail ? fitText(ctx, text.slice(0, -tail.length), avail - ctx.measureText(tail).width) + tail : fitText(ctx, text, avail);
      }
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

  function renderWhaleCompact(ctx, a, age) {
    const e = whale.evt, m = whale.map;
    const top = WHALE.top, h = WHALE.bottom - WHALE.top;
    const sh = Math.min(h, 250), y0 = top + (h - sh) / 2, cy = y0 + sh / 2;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.beginPath(); ctx.rect(0, top, W, h); ctx.clip();
    ctx.fillStyle = 'rgba(8,6,2,0.92)'; ctx.fillRect(0, y0, W, sh);
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(0, y0, W, 6); ctx.fillRect(0, y0 + sh - 6, W, 6);
    const sx = ((age * 900) % (W + 400)) - 200; // a sweeping shine
    const gr = ctx.createLinearGradient(sx - 160, 0, sx + 160, 0);
    gr.addColorStop(0, 'rgba(255,210,63,0)'); gr.addColorStop(0.5, 'rgba(255,210,63,0.16)'); gr.addColorStop(1, 'rgba(255,210,63,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, y0 + 6, W, sh - 12);
    const s = 1 + Math.max(0, 0.25 - age) * 1.2;
    ctx.translate(40, cy); ctx.scale(s, s); ctx.translate(-40, -cy); // pop from the left edge (nothing is pushed off-screen)
    const ar = Math.min(78, sh * 0.32);
    drawAvatar(ctx, e.user, 40 + ar, cy, ar);
    const tx = 40 + ar * 2 + 28, tw = W - tx - 36;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = `44px ${FONT}`; ctx.fillStyle = '#fff';
    ctx.fillText(fitText(ctx, e.user.nickname, tw), tx, cy - sh * 0.29);
    const g = `${e.gift.name.toUpperCase()}${e.gift.count > 1 && !/ X\d+$/.test(e.gift.name.toUpperCase()) ? ' x' + e.gift.count : ''}`;
    ctx.font = `72px ${FONT}`;
    const gw = ctx.measureText(g).width;
    if (gw > tw) ctx.font = `${Math.max(40, Math.floor(72 * tw / gw))}px ${FONT}`;
    ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#000'; ctx.lineWidth = 8;
    const gt = fitText(ctx, g, tw); ctx.strokeText(gt, tx, cy + 4); ctx.fillText(gt, tx, cy + 4);
    ctx.font = `36px ${FONT}`; ctx.fillStyle = '#7df9ff';
    const coins = `${(e.gift.coins * e.gift.count).toLocaleString()} COINS`;
    ctx.fillText(coins, tx, cy + sh * 0.31);
    if (m.label) {
      const cw = ctx.measureText(coins + '   ').width, room = tw - cw;
      const lw = ctx.measureText(m.label).width;
      if (lw > room) ctx.font = `${Math.max(24, Math.floor(36 * room / lw))}px ${FONT}`;
      ctx.fillStyle = '#ff5aa0';
      ctx.fillText(fitText(ctx, m.label, room), tx + cw, cy + sh * 0.31);
    }
    ctx.restore();
  }

  function renderWhale(ctx) {
    if (!whale) return;
    const age = time - whale.t;
    const inA = Math.min(1, age * 4), outA = Math.min(1, (WHALE_S - age) * 3);
    if (WHALE_MODE === 'compact') return renderWhaleCompact(ctx, Math.max(0, Math.min(inA, outA)), age);
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
    reset() { const w = whale; board.clear(); feed.length = 0; whales.length = 0; whale = null; if (w && onWhale) onWhale(whaleInfo(w, 'end')); },
    get whaleActive() { return !!whale; },
    /** The banner on screen now (null if none): {mode, band:{top,bottom}, until (s left), queued, user}. */
    get whaleBanner() { return whale ? { mode: WHALE_MODE, band: { top: WHALE.top, bottom: WHALE.bottom }, until: Math.max(0, WHALE_S - (time - whale.t)), queued: whales.length, user: whale.evt.user.nickname } : null; },
    whaleMode: WHALE_MODE,
  };
}
