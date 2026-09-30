// The browser-side event pipeline (port of server.js ingestRaw / ingestPlatform / publish): every source (the
// simulation bots, the tray, TikFinity, Twitch, YouTube, a custom WebSocket) hands its events here; they get the
// same namespacing, chat-charges-lightning, social de-dupe and msgId LRU as the streamer app, then go to deliver().
import { GiftStreaks, normalizers, SeenIds, rawGiftKey, eventKey, ChatCharge, PREFIX } from './normalize.js';

const PLATFORMS = ['tiktok', 'twitch', 'youtube'];

export function createHub({ deliver, getPlatformCfg }) {
  const streaks = new GiftStreaks('live');
  const seen = new SeenIds(5000);
  const chatCharge = new ChatCharge();
  const recentSocial = new Map();
  const stats = { published: 0, duplicates: 0, bySource: {} };

  function publish(evt, source) {
    try {
      if (!evt || typeof evt !== 'object' || typeof evt.type !== 'string') return;
      if (!evt.user || typeof evt.user !== 'object') evt.user = {};
      if (evt.user.id == null || evt.user.id === '') evt.user.id = String(evt.user.handle || evt.user.nickname || 'anon');
      evt.platform = PLATFORMS.includes(evt.platform) ? evt.platform : 'tiktok';
      evt.user.id = String(evt.user.id);
      const pre = PREFIX[evt.platform];
      if (pre && !evt.user.id.startsWith(pre)) evt.user.id = pre + evt.user.id;
      evt.user.platform = evt.platform;
      if (evt.chatCharge === true && evt.type === 'comment') {
        const likes = evt.platform === 'tiktok' ? 0 : chatCharge.take(evt.user.id, (getPlatformCfg() || {})[evt.platform]);
        if (likes) evt.chatLikes = likes;
      }
      delete evt.chatCharge;
      if (evt.chatLikes != null) { const n = Math.max(0, Math.min(1000, Math.round(Number(evt.chatLikes) || 0))); if (n && evt.type === 'comment') evt.chatLikes = n; else delete evt.chatLikes; }
      if (evt.user.nickname == null) evt.user.nickname = String(evt.user.handle || evt.user.id);
      if (!('avatarUrl' in evt.user)) evt.user.avatarUrl = null;
      if (source !== 'sim' && source !== 'tray' && (evt.type === 'follow' || evt.type === 'share')) {
        const k = evt.user.id + '|' + evt.type, now = Date.now();
        if (now - (recentSocial.get(k) || 0) < 3000) return;
        recentSocial.set(k, now);
        if (recentSocial.size > 2000) recentSocial.clear();
      }
      evt.ts = Date.now();
      evt.source = source;
      if (evt.type === 'gift') {
        if (!evt.gift || typeof evt.gift !== 'object') return;
        evt.gift.coins = Math.max(0, Number(evt.gift.coins) || 0);
        evt.gift.count = Math.max(1, Math.min(10000, Math.round(Number(evt.gift.count) || 1)));
      }
      stats.published++;
      stats.bySource[source] = (stats.bySource[source] || 0) + 1;
      deliver(evt);
    } catch (e) { console.warn('[hub] publish failed', e); }
  }

  /** Already-normalized events (Twitch, YouTube, custom WS, sim): msgId LRU, then publish. */
  function ingestEvent(evt, source) {
    if (!evt || typeof evt !== 'object') return;
    if (seen.check(eventKey(evt))) { stats.duplicates++; return; }
    publish(evt, source);
  }

  /** Raw TikTok-connector-shaped messages (TikFinity): streak logic + normalizers + LRU. */
  function ingestRaw(kind, raw, source) {
    let evt = null;
    try {
      if (kind === 'gift') {
        if (seen.check(rawGiftKey(raw))) { stats.duplicates++; return; }
        evt = streaks.process(raw);
      } else if (normalizers[kind]) {
        evt = normalizers[kind](raw);
        if (evt && seen.check(eventKey(evt))) { stats.duplicates++; return; }
      }
    } catch (e) { console.warn('[hub] normalize failed', kind, e && e.message); }
    if (evt) publish(evt, source);
  }

  /** A duplicate check for sources that key on their own raw ids (Twitch IRC tag ids). */
  const isDup = (key) => { const d = seen.check(key); if (d) stats.duplicates++; return d; };

  return { publish, ingestEvent, ingestRaw, isDup, stats, seen };
}
