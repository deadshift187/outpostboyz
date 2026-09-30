// TikTok PLAN A: TikFinity's local WebSocket (browser port of app/lib/tikfinity.js). TikFinity Desktop (Windows) holds
// the TikTok LIVE connection and re-broadcasts { event, data } with tiktok-live-connector 1.x field names; the raw data
// goes through the same normalizer + combo-streak logic (hub.ingestRaw). {"event":"config"} handshakes are ignored.
// Browser rules (web-research/browser-connect.md 3a): Chrome/Edge 147+ and Firefox 154+ ask once to allow "apps on this
// device" (Local Network Access); Safari blocks ws://localhost from an https page. Primary ws://127.0.0.1:21213/, retry
// ws://localhost:21213/.
export const TIKFINITY_URL = 'ws://127.0.0.1:21213/';
export const TIKFINITY_URLS = ['ws://127.0.0.1:21213/', 'ws://localhost:21213/'];

export const isSafari = () => typeof navigator !== 'undefined' && /^((?!chrome|chromium|android|crios|fxios|edg|opr).)*safari/i.test(navigator.userAgent || '');
const DOWN = "Can't reach TikFinity. Is the TikFinity desktop app open, signed in and connected to your LIVE? If your browser asked to connect to apps on this device, click Allow.";
const DENIED = 'Your browser is blocking this page from TikFinity. Click the icon at the left of the address bar, then Site settings, set Local network access (or "Apps on device") to Allow, and reload.';
const SAFARI = "Safari can't connect to TikFinity (it blocks local connections from websites). Use Chrome or Edge, or Plan B (Euler key).";

/** Local Network Access permission state: 'granted' | 'denied' | 'prompt' | null (unknown / not supported). */
export async function lnaState() {
  if (typeof navigator === 'undefined' || !navigator.permissions || !navigator.permissions.query) return null;
  for (const name of ['loopback-network', 'local-network']) {
    try { const r = await navigator.permissions.query({ name }); return r.state; } catch (e) { /* unknown permission name */ }
  }
  return null;
}

/** createTikFinity({ url, onRaw(kind, data), onState }) -> { start, stop, state } */
export function createTikFinity({ url = TIKFINITY_URL, onRaw, onState, WebSocketImpl = WebSocket }) {
  const custom = !TIKFINITY_URLS.includes(url) && url !== 'ws://localhost:21213' && url !== 'ws://127.0.0.1:21213';
  const urls = custom ? [url] : TIKFINITY_URLS;
  let ws = null, stopped = false, retryMs = 2000, timer = null, sawDirect = false, opened = false, tries = 0;
  const api = { state: 'off', url: urls[0], events: 0, start, stop };
  const set = (s, info = {}) => { api.state = s; try { onState(s, info); } catch (e) { /* ignore */ } };
  async function start() {
    stopped = false;
    if (!urls.every((u) => /^wss?:\/\/[^\s]+$/i.test(String(u || '')))) return set('error', { code: 'bad_url', message: `"${url}" isn't a WebSocket address. It normally is ws://127.0.0.1:21213/.` });
    if (isSafari() && !/^wss:/i.test(urls[0]) && location.protocol === 'https:') return set('error', { code: 'safari', message: SAFARI });
    if ((await lnaState()) === 'denied') return set('error', { code: 'lna_denied', message: DENIED });
    connect();
  }
  function connect() {
    if (stopped) return;
    const u = urls[tries % urls.length];
    api.url = u;
    set('connecting', { message: `Looking for TikFinity at ${u}… (if your browser asks to connect to apps on this device, click Allow)` });
    let sock;
    try { sock = ws = new WebSocketImpl(u); } catch (e) { return set('error', { code: 'bad_url', message: `"${u}" isn't a valid WebSocket address.` }); }
    opened = false;
    sock.onopen = () => { opened = true; retryMs = 2000; set('live', { message: 'Connected to TikFinity. Gifts, likes, follows, shares and chat from your TikTok LIVE will arrive (TikFinity itself must show your LIVE as connected).' }); };
    sock.onmessage = (m) => {
      let msg; try { msg = JSON.parse(m.data); } catch (e) { return; }
      if (!msg || !msg.event || msg.event === 'config') return;
      const kind = msg.event;
      if (kind === 'follow' || kind === 'share') sawDirect = true;
      if (kind === 'social' && sawDirect) return;
      const data = msg.data && typeof msg.data === 'object' ? msg.data : {};
      const envId = msg.msgId ?? msg.eventId ?? msg.id;
      if (envId != null && data.msgId == null && !(data.common && data.common.msgId)) data.msgId = envId;
      api.events++;
      onRaw(kind, data);
    };
    sock.onclose = async () => {
      if (ws !== sock || stopped) return;
      ws = null;
      tries++;
      if (!opened && tries % urls.length !== 0) return connect(); // 127.0.0.1 failed: try localhost right away
      const wait = retryMs;
      retryMs = Math.min(retryMs * 2, 30000);
      const denied = (await lnaState()) === 'denied';
      set('error', { code: denied ? 'lna_denied' : 'tikfinity_down', message: (denied ? DENIED : (opened ? 'TikFinity closed the connection. ' : '') + DOWN) + ` Retrying in ${Math.round(wait / 1000)} s…`, retryInMs: wait });
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
