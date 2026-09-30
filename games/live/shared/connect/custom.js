// A generic WebSocket source: any ws:// or wss:// URL that sends our NORMALIZED events as JSON text frames.
// Accepted frames: an event object {type, user, gift?, text?, likeCount?, msgId?, platform?}, the streamer app's
// own wire format {t:'event', e:{...}}, or an array of either. Anything else is ignored. The page never sends.
const TYPES = new Set(['gift', 'like', 'follow', 'share', 'comment', 'join', 'sub']);

export function createCustom({ url, onEvent, onState, WebSocketImpl = WebSocket }) {
  let ws = null, stopped = false, retryMs = 2000, timer = null;
  const api = { state: 'off', url, events: 0, ignored: 0, start, stop };
  const set = (s, info = {}) => { api.state = s; try { onState(s, info); } catch (e) { /* ignore */ } };
  function take(x) {
    if (Array.isArray(x)) return x.forEach(take);
    if (x && x.t === 'event' && x.e) x = x.e;
    if (!x || typeof x !== 'object' || !TYPES.has(x.type)) { api.ignored++; return; }
    api.events++;
    onEvent(JSON.parse(JSON.stringify(x)));
  }
  function start() {
    stopped = false;
    if (!/^wss?:\/\/[^\s]+$/i.test(String(url || ''))) return set('error', { code: 'bad_url', message: 'Type a WebSocket address that starts with ws:// or wss://.' });
    connect();
  }
  function connect() {
    if (stopped) return;
    set('connecting', { message: `Connecting to ${url}…` });
    let sock;
    try { sock = ws = new WebSocketImpl(url); } catch (e) { return set('error', { code: 'bad_url', message: `"${url}" isn't a valid WebSocket address.` }); }
    sock.onopen = () => { retryMs = 2000; set('live', { message: 'Connected. Send normalized event JSON ({type, user, gift…}) and it plays in the game.' }); };
    sock.onmessage = (m) => { let j; try { j = JSON.parse(m.data); } catch (e) { api.ignored++; return; } take(j); };
    sock.onclose = () => {
      if (ws !== sock || stopped) return;
      ws = null;
      const wait = retryMs; retryMs = Math.min(retryMs * 2, 30000);
      set('error', { code: 'network', message: `Couldn't connect to ${url} (or it closed). Retrying in ${Math.round(wait / 1000)} s…`, retryInMs: wait });
      timer = setTimeout(connect, wait);
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
