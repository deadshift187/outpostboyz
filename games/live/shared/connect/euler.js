// TikTok PLAN B: Euler Stream cloud WebSocket with the streamer's OWN key (free Community tier), for Mac users or when
// TikFinity won't connect. wss://ws.eulerstream.com?uniqueId=<user>&apiKey=<key> (web-research/browser-connect.md 3b/7c).
// The key lives only in this browser's localStorage; it is only ever put in this WebSocket URL (inside TLS), never in
// the address bar, a link or on screen.
// Frames: {messages:[{type:'WebcastGiftMessage', data:{...}}]} (shape UNVERIFIED by the research: log a real session).
// We also accept a bare message, an array, or TikFinity-style {event, data}. Payloads are tiktok-live-connector
// shaped (v2 proto names with 1.x fallbacks), which normalize.js already reads.
export const EULER_WS = 'wss://ws.eulerstream.com';

const TYPE = {
  WebcastGiftMessage: 'gift', WebcastChatMessage: 'chat', WebcastLikeMessage: 'like', WebcastMemberMessage: 'member',
  WebcastSocialMessage: 'social', WebcastSubNotifyMessage: 'subNotify', WebcastFollowMessage: 'follow', WebcastShareMessage: 'share',
  gift: 'gift', chat: 'chat', comment: 'chat', like: 'like', member: 'member', join: 'member', social: 'social', follow: 'follow', share: 'share', subscribe: 'subscribe', subNotify: 'subNotify',
};
const CLOSE = {
  4400: "Euler says the key is missing. Paste your Euler API key again.",
  4401: 'Euler rejected the key. Copy it again from your Euler dashboard (no spaces).',
  4403: 'Euler rejected the key. Copy it again from your Euler dashboard (no spaces).',
  4404: "Euler says that TikTok account isn't LIVE right now. Start your TikTok LIVE first, then click Connect. Check the username: no @, no link.",
  4429: "Euler's free plan limit was reached (too many requests). Try again later, or use Plan A (TikFinity).",
  4500: 'Euler had a problem on its side. Retrying…',
};
const USER_RE = /^[A-Za-z0-9._]{2,24}$/;
export const cleanTikTokUser = (u) => String(u || '').trim().replace(/^https?:\/\/(www\.)?tiktok\.com\//i, '').replace(/^@/, '').split(/[/?#]/)[0];

export function createEuler({ username, apiKey, onRaw, onState, WebSocketImpl = WebSocket, base = EULER_WS }) {
  const user = cleanTikTokUser(username);
  const key = String(apiKey || '').trim();
  let ws = null, stopped = false, retryMs = 5000, timer = null, sawDirect = false;
  const api = { state: 'off', events: 0, lastClose: null, start, stop };
  const set = (s, info = {}) => { api.state = s; try { onState(s, info); } catch (e) { /* ignore */ } };
  function start() {
    stopped = false;
    if (!user || !USER_RE.test(user)) return set('error', { code: 'bad_username', message: 'Type your TikTok username without the @ (letters, numbers, dots and underscores).' });
    if (!key) return set('error', { code: 'no_key', message: 'Paste your Euler Stream API key (free Community plan at eulerstream.com). It stays in this browser.' });
    connect();
  }
  function take(kind, data) {
    kind = TYPE[kind] || TYPE[String(kind || '').replace(/^Webcast/, '').replace(/Message$/, '').replace(/^./, (c) => c.toLowerCase())];
    if (!kind || !data || typeof data !== 'object') return;
    if (kind === 'follow' || kind === 'share') sawDirect = true;
    if (kind === 'social' && sawDirect) return;
    api.events++;
    onRaw(kind, data);
  }
  function frame(j) {
    if (Array.isArray(j)) return j.forEach(frame);
    if (!j || typeof j !== 'object') return;
    if (Array.isArray(j.messages)) return j.messages.forEach(frame);
    if (j.event && j.data) return take(j.event, j.data);
    if (j.type) return take(j.type, j.data && typeof j.data === 'object' ? j.data : j);
  }
  function connect() {
    if (stopped) return;
    set('connecting', { message: `Connecting to Euler Stream for @${user}…` });
    let sock;
    try { sock = ws = new WebSocketImpl(`${base}?uniqueId=${encodeURIComponent(user)}&apiKey=${encodeURIComponent(key)}`); } catch (e) { return set('error', { code: 'network', message: "Couldn't open the Euler Stream connection." }); }
    sock.onopen = () => { retryMs = 5000; set('live', { message: `Connected to Euler Stream for @${user}. Gifts, likes, follows and chat from your TikTok LIVE will arrive.` }); };
    sock.onmessage = (m) => { let j; try { j = JSON.parse(m.data); } catch (e) { return; } frame(j); };
    sock.onclose = (ev) => {
      if (ws !== sock || stopped) return;
      ws = null;
      api.lastClose = ev && ev.code;
      const fatal = ev && (ev.code === 4400 || ev.code === 4401 || ev.code === 4403);
      const wait = ev && ev.code === 4404 ? 60000 : ev && ev.code === 4429 ? 300000 : retryMs;
      retryMs = Math.min(retryMs * 2, 60000);
      const why = (ev && CLOSE[ev.code]) || "Lost the Euler Stream connection. Check your internet.";
      set('error', { code: 'euler_' + ((ev && ev.code) || 'closed'), message: why + (fatal ? '' : ` Retrying in ${Math.round(wait / 1000)} s…`), retryInMs: fatal ? null : wait });
      if (!fatal) timer = setTimeout(connect, wait);
    };
    sock.onerror = () => { /* close follows */ };
  }
  function stop() {
    stopped = true; clearTimeout(timer);
    if (ws) { const w = ws; ws = null; try { w.onclose = null; w.onmessage = null; w.close(); } catch (e) { /* ignore */ } }
    set('off', { message: '' });
  }
  return api;
}
