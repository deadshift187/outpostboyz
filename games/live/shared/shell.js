// WEB SHELL: the static-hostable version of app/public/platform/main.js. No server, no /api, no /ws.
// One game per page (web/<slug>/index.html calls boot('<slug>')). Same 1080x1920 stage, same overlay (feed,
// top-gifters board, whale banner, mode pill, the game's overlayLayout), same gift mapping; events come from
// SOLO (none), SIMULATION (bot chat + tray) or LIVE (browser connectors: Twitch IRC, TikFinity, YouTube, custom WS).
//
// URL options (all optional; the in-game menu is the normal way): ?mode=solo|sim|live  ?menu=0 (start playing,
// menu closed: an OBS source)  ?transparent=1  ?mute=1  ?nonet=1 (climb)  ?whale=off|compact|full  ?hud=0
// ?popout=1 (set by "Pop out stream window")  ?twitchIrc= / ?eulerWs=ws://localhost:PORT (test only: fake servers; localhost only)
// Capture rule (web-research/browser-connect.md 5a): capture the window you PLAY in (Window Capture); a Browser Source /
// Link source would be a second copy of the game with its own connections.
import { mapEvent } from './platform/gifts.js';
import { createOverlay } from './platform/overlay.js';
import { createSound } from './platform/sound.js';
import { installMasterVolume } from './audio.js';
import { createHub } from './connect/hub.js';
import { platformConfig } from './connect/normalize.js';
import { createTwitch, IRC_URL, cleanChannel, parseIrc, TwitchTranslator } from './connect/twitch.js';
import { createTikFinity, TIKFINITY_URL, isSafari } from './connect/tikfinity.js';
import { createEuler, cleanTikTokUser } from './connect/euler.js';
import { createYouTube, ytItemToEvents } from './connect/youtube.js';
import { createCustom } from './connect/custom.js';
import { createSim, giftForTier } from './sim.js';
import { createTouch } from './touch.js';
import { GAMES, STREAMER_KEYS } from './games.js';

const W = 1080, H = 1920;
const SKEY = 'outpost-web:settings';
const DEFAULTS = {
  mode: 'solo', intensity: 'normal', volume: 0.8, muted: false, nonet: false, streamerKeys: false, transparent: false,
  touch: 'auto', keepAwake: true, trayName: 'you', trayOpen: null,
  live: { tiktok: { on: false, plan: 'tikfinity', url: TIKFINITY_URL, username: '', eulerKey: '' }, twitch: { on: false, channel: '' }, youtube: { on: false, target: '', key: '' }, custom: { on: false, url: '' } },
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pretty = (s) => String(s || '').replace(/_/g, ' ');
const isLocalWs = (u) => /^wss?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(String(u || ''));

function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(SKEY) || '{}') || {}; } catch (e) { s = {}; }
  const live = s.live || {};
  return { ...DEFAULTS, ...s, live: Object.fromEntries(Object.entries(DEFAULTS.live).map(([k, d]) => [k, { ...d, ...(live[k] || {}) }])) };
}
function saveSettings(s) { try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch (e) { /* private window */ } }

export async function boot(slug) {
  const meta = GAMES[slug];
  if (!meta) throw new Error('unknown game ' + slug);
  const params = new URLSearchParams(location.search);
  const S = loadSettings();
  // URL overrides that are also settings: remembered, so the menu shows the truth
  if (params.get('transparent') === '1') S.transparent = true;
  if (params.get('mute') === '1') S.muted = true;
  if (meta.nonet && params.get('nonet') === '1') S.nonet = true;
  if (['solo', 'sim', 'live'].includes(params.get('mode'))) S.mode = params.get('mode');
  saveSettings(S);
  // CLIMB OR DIE reads ?nonet=1 itself at createGame(): keep the address bar in step with the toggle
  if (meta.nonet) {
    const p = new URLSearchParams(location.search);
    if (S.nonet) p.set('nonet', '1'); else p.delete('nonet');
    const q = p.toString();
    history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
  }

  document.title = `${meta.title} · web`;
  const master = installMasterVolume(S.muted ? 0 : S.volume); // before the game makes its AudioContext
  if (S.transparent) document.documentElement.classList.add('transparent');

  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');
  canvas.width = W; canvas.height = H;
  function fit() {
    const s = Math.min(innerWidth / W, innerHeight / H);
    canvas.style.width = `${W * s}px`; canvas.style.height = `${H * s}px`;
  }
  addEventListener('resize', fit); fit();

  // ---------- gift tables (static copies, see tools/sync.mjs) ----------
  const getJSON = (u) => fetch(u, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(u + ' HTTP ' + r.status); return r.json(); });
  const table = await getJSON('./gifts.json');
  let giftMap, tierDoc;
  if (slug === 'climb') { giftMap = table; tierDoc = table['climb-or-die'] || {}; }
  else {
    const baseDoc = await getJSON('../gifts.json').catch(() => ({}));
    const { 'climb-or-die': _c, ...rest } = baseDoc;
    giftMap = rest; // feed events / platform coin table / whale threshold like the streamer app (its gifts.json is shared)
    tierDoc = table; // this game's own tier table (config.json)
  }
  const platformCfg = () => platformConfig(giftMap);

  // ---------- the game ----------
  const sound = createSound({ muted: S.muted });
  const mod = await import(`../game/${meta.entry}.js`);
  const lsb = mod.localStorageBackend ? mod.localStorageBackend(meta.board) : null;
  const storage = lsb ? { load: () => lsb.load(), save: (d, o) => lsb.save(d, o), clip() { /* no /api/clip in the web edition */ } } : null;
  const game = mod.createGame({ W, H, transparent: S.transparent, sound, storage, activityPing: false, streamerKeys: !!S.streamerKeys, mute: false });

  const layout = { ...(game.overlayLayout || {}) };
  const whaleParam = params.get('whale');
  if (whaleParam === 'off') layout.whale = false;
  else if (whaleParam === 'compact' || whaleParam === 'full') layout.whale = { ...(layout.whale && typeof layout.whale === 'object' ? layout.whale : {}), mode: whaleParam };
  const onWhale = (info) => {
    try { game.onWhaleBanner && game.onWhaleBanner(info); } catch (err) { console.error('[game] onWhaleBanner', err); }
    try { dispatchEvent(new CustomEvent('platform:whale', { detail: info })); } catch (err) { /* old browser */ }
  };
  const makeOverlay = (hud) => createOverlay({ W, H, options: { hud: hud && params.get('hud') !== '0', ...layout, onWhale } });
  let overlay = makeOverlay(S.mode !== 'solo');
  try { game.onConfig && game.onConfig(giftMap); } catch (err) { console.error('[game] onConfig', err); }

  const platform = (window.__platform = { received: [], game, get overlay() { return overlay; }, gameSlug: slug, gameEntry: meta.entry, web: true, get giftMap() { return giftMap; } });

  // ---------- event pipeline ----------
  function deliver(e) {
    const m = mapEvent(e, giftMap);
    platform.received.push({ e, m });
    if (platform.received.length > 500) platform.received.shift();
    try { game.onEvent(e, m); } catch (err) { console.error('[game] onEvent', err); }
    overlay.push(e, m);
    if (m.sound) sound.play(m.sound);
  }
  const hub = createHub({ deliver, getPlatformCfg: platformCfg });
  const sim = createSim({ hub, getTable: () => ({ tiers: tierDoc.tiers || [], giftSides: tierDoc.giftSides || {} }), comments: meta.comments, slug });

  // ---------- LIVE connectors ----------
  const live = { tiktok: null, twitch: null, youtube: null, custom: null };
  const liveState = { tiktok: { state: 'off', message: '' }, twitch: { state: 'off', message: '' }, youtube: { state: 'off', message: '' }, custom: { state: 'off', message: '' } };
  function onLiveState(p, state, info) {
    liveState[p] = { state, message: (info && info.message) || '', code: info && info.code };
    pushStatus(); ui.renderLights(); ui.renderLive();
  }
  function startPlatform(p) {
    stopPlatform(p);
    const c = S.live[p];
    if (p === 'twitch') {
      const irc = params.get('twitchIrc');
      live.twitch = createTwitch({ channel: c.channel, url: irc && isLocalWs(irc) ? irc : IRC_URL, getCfg: platformCfg, onEvent: (e) => hub.ingestEvent(e, 'twitch'), onState: (s, i) => onLiveState('twitch', s, i), isDup: hub.isDup });
    } else if (p === 'tiktok') {
      live.tiktok = c.plan === 'euler'
        ? createEuler({ username: c.username, apiKey: c.eulerKey, ...(isLocalWs(params.get('eulerWs')) ? { base: params.get('eulerWs') } : {}), onRaw: (k, d) => hub.ingestRaw(k, d, 'euler'), onState: (s, i) => onLiveState('tiktok', s, i) })
        : createTikFinity({ url: c.url || TIKFINITY_URL, onRaw: (k, d) => hub.ingestRaw(k, d, 'tikfinity'), onState: (s, i) => onLiveState('tiktok', s, i) });
    } else if (p === 'youtube') {
      live.youtube = createYouTube({ apiKey: c.key, target: c.target, getCfg: platformCfg, onEvent: (e) => hub.ingestEvent(e, 'youtube'), onState: (s, i) => onLiveState('youtube', s, i) });
    } else if (p === 'custom') {
      live.custom = createCustom({ url: c.url, onEvent: (e) => hub.ingestEvent(e, 'custom'), onState: (s, i) => onLiveState('custom', s, i) });
    }
    live[p].start();
  }
  let testSeq = 0;
  const testTw = new TwitchTranslator();
  function testEvent(p) {
    const n = ++testSeq, id = 'test-' + Date.now().toString(36) + '-' + n;
    if (p === 'twitch') {
      const ch = (S.live.twitch.channel || 'test').replace(/\W/g, '');
      const line = `@badge-info=;badges=;bits=100;color=#9146FF;display-name=TestCheerer;emotes=;id=${id};mod=0;room-id=1;subscriber=0;tmi-sent-ts=${Date.now()};user-id=9990${n};user-type= :testcheerer!testcheerer@testcheerer.tmi.twitch.tv PRIVMSG #${ch} :Cheer100 test cheer`;
      for (const e of testTw.toEvents(parseIrc(line), platformCfg())) hub.ingestEvent(e, 'test');
    } else if (p === 'tiktok') {
      hub.ingestRaw('gift', { userId: 'test' + n, uniqueId: 'test_viewer', nickname: 'test_viewer', giftId: 5655, giftName: 'Rose', diamondCount: 1, giftType: 1, repeatCount: 1, repeatEnd: true, msgId: id }, 'test');
    } else if (p === 'youtube') {
      const item = { id: id, snippet: { type: 'superChatEvent', publishedAt: new Date().toISOString(), authorChannelId: 'UCtesttesttesttesttest00', superChatDetails: { amountMicros: '5000000', currency: 'USD', amountDisplayString: '$5.00', userComment: 'test', tier: 3 } }, authorDetails: { channelId: 'UCtesttesttesttesttest00', displayName: '@TestFan', profileImageUrl: '' } };
      for (const e of ytItemToEvents(item, platformCfg())) hub.ingestEvent(e, 'test');
    } else if (p === 'custom') {
      hub.ingestEvent({ type: 'gift', user: { id: 'test-custom', nickname: 'test_custom' }, gift: { name: 'Hand Hearts', id: 'test', coins: 100, count: 1 }, msgId: id }, 'test');
    }
  }
  function stopPlatform(p) { if (live[p]) { live[p].stop(); live[p] = null; } liveState[p] = { state: 'off', message: '' }; }
  function pushStatus() {
    const P = {
      tiktok: { mode: liveMode(liveState.tiktok.state) },
      twitch: { mode: liveMode(liveState.twitch.state), channel: live.twitch ? live.twitch.channel : '' },
      youtube: { mode: liveMode(liveState.youtube.state) },
    };
    const states = Object.values(liveState).map((x) => x.state);
    const mode = S.mode !== 'live' ? 'sim' : states.includes('live') ? 'live' : states.includes('connecting') ? 'connecting' : 'sim';
    overlay.setStatus({ mode, source: 'tikfinity', username: liveState.custom.state === 'live' ? 'custom feed' : '', platforms: S.mode === 'live' ? P : undefined });
  }
  const liveMode = (s) => (s === 'live' ? 'live' : s === 'connecting' ? 'connecting' : 'off');

  // ---------- modes ----------
  function applyMode() {
    if (S.mode !== 'sim') sim.stop();
    if (S.mode !== 'live') for (const p of Object.keys(live)) stopPlatform(p);
    if (S.mode === 'sim') sim.start(S.intensity);
    if (S.mode === 'live') for (const p of Object.keys(live)) { if (S.live[p].on && !live[p]) startPlatform(p); if (!S.live[p].on) stopPlatform(p); }
    overlay = makeOverlay(S.mode !== 'solo');
    pushStatus();
    ui.renderMode(); ui.renderTray(); ui.renderLights();
  }
  const setMode = (m) => { if (!['solo', 'sim', 'live'].includes(m) || m === S.mode) return; S.mode = m; saveSettings(S); applyMode(); };

  // ---------- menu / tray / touch UI ----------
  const root = document.createElement('div'); root.id = 'shell'; document.body.appendChild(root);
  let menuOpen = params.get('menu') !== '0';
  const touch = createTouch({ root, meta, onMenu: () => openMenu(true) });
  const coarse = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  const touchWanted = () => S.touch === 'on' || (S.touch === 'auto' && coarse);

  const ui = buildUi();
  function openMenu(open) {
    menuOpen = !!open;
    try { window.dispatchEvent(new Event('blur')); } catch (e) { /* games clear held keys on blur */ }
    touch.releaseAll();
    ui.menu.classList.toggle('open', menuOpen);
    ui.gear.classList.toggle('hidden', menuOpen);
    touch.show(!menuOpen && touchWanted());
    ui.renderTray();
    if (menuOpen) ui.renderAll(); else canvas.focus && canvas.focus();
  }

  function buildUi() {
    const gear = document.createElement('button');
    gear.type = 'button'; gear.className = 'gear'; gear.title = 'Settings / mode (Esc)'; gear.setAttribute('aria-label', 'Settings and mode');
    gear.innerHTML = '<span>⚙</span><i class="gear-lights"></i>';
    gear.addEventListener('click', () => openMenu(true));
    root.appendChild(gear);

    const menu = document.createElement('div');
    menu.className = 'menu';
    menu.setAttribute('role', 'dialog'); menu.setAttribute('aria-label', meta.title + ' settings');
    const tierRows = (tierDoc.tiers || []);
    menu.innerHTML = `
      <div class="panel">
        <header><div><h1>${esc(meta.title)}</h1><p>${esc(meta.pitch)}</p></div><a class="all" href="../">ALL GAMES</a></header>
        <nav class="tabs" role="tablist">
          <button type="button" data-tab="mode" class="on">MODE</button><button type="button" data-tab="live">LIVE SETUP</button><button type="button" data-tab="settings">SETTINGS</button><button type="button" data-tab="controls">CONTROLS</button>
        </nav>
        <section data-pane="mode" class="pane on">
          <div class="modes">
            <label class="mode" data-mode="solo"><input type="radio" name="mode" value="solo"><b>SOLO</b><span>Just play. No gifts, no chat.</span></label>
            <label class="mode" data-mode="sim"><input type="radio" name="mode" value="sim"><b>SIMULATION</b><span>A bot chat of ~30 fake viewers sends real gift tiers. You can be the chat too.</span></label>
            <label class="mode" data-mode="live"><input type="radio" name="mode" value="live"><b>LIVE MODE</b><span>Your own stream: TikTok, Twitch, YouTube (any mix), or a custom feed.</span></label>
          </div>
          <div class="sub sim-sub">
            <label class="row">Bot chat intensity <input type="range" min="0" max="2" step="1" class="intensity" aria-label="intensity"><em class="int-label"></em></label>
            <p class="hint">The chat warms up over a minute, then keeps a steady mix with an occasional whale. Open the <b>YOU ARE THE CHAT</b> tray on the side to send any tier yourself.</p>
            <label class="row check"><input type="checkbox" class="keepawake"> Keep the game awake while you watch (no ON BREAK screen)</label>
          </div>
          <div class="sub live-sub"><div class="lights"></div><button type="button" class="link" data-goto="live">Set up platforms →</button></div>
        </section>
        <section data-pane="live" class="pane">
          <p class="hint">Turn on one or more, then click <b>Connect</b>. Everything connects straight from this browser; names and keys stay in this browser only. <b>Don't show this screen on stream.</b></p>
          <div class="plat" data-p="tiktok">
            <div class="ph"><label class="check"><input type="checkbox" class="on"> <b>TikTok</b></label><i class="dot"></i><a class="how" href="../tutorials/tiktok.html" target="_blank" rel="noopener">How to connect</a></div>
            <div class="plans" role="radiogroup" aria-label="TikTok plan">
              <label class="check"><input type="radio" name="tt-plan" value="tikfinity"> Plan A: TikFinity</label>
              <label class="check"><input type="radio" name="tt-plan" value="euler"> Plan B: Euler key</label>
            </div>
            <div class="plan-a">
              <p class="hint">Is TikFinity open? Start the TikFinity desktop app (Windows), sign in, connect it to your LIVE and keep it open. When you click Connect, your browser asks once to connect to <b>apps on this device</b>: click <b>Allow</b>.</p>
              <p class="hint warn safari-note">Safari can't reach TikFinity (it blocks local connections from websites). Use Chrome or Edge, or Plan B.</p>
              <label class="row">TikFinity address <input type="text" class="f-url" spellcheck="false" autocomplete="off" placeholder="${TIKFINITY_URL}"></label>
            </div>
            <div class="plan-b">
              <label class="row">TikTok username (no @) <input type="text" class="f-ttuser" spellcheck="false" autocomplete="off" placeholder="yourname"></label>
              <label class="row">Euler Stream API key <input type="password" class="f-eulerkey" spellcheck="false" autocomplete="off" placeholder="paste your key"></label>
              <p class="hint eulerhint"></p>
              <p class="hint">Free Community plan at eulerstream.com. The key goes only from this browser to Euler; we never see it.</p>
            </div>
            <div class="acts"><button type="button" class="mini connect">Connect</button><button type="button" class="mini test">Test a gift</button></div>
            <p class="msg"></p>
          </div>
          <div class="plat" data-p="twitch">
            <div class="ph"><label class="check"><input type="checkbox" class="on"> <b>Twitch</b></label><i class="dot"></i><a class="how" href="../tutorials/twitch.html" target="_blank" rel="noopener">How to connect</a></div>
            <label class="row">Channel name <input type="text" class="f-channel" spellcheck="false" autocomplete="off" placeholder="yourchannel"></label>
            <p class="hint">No login: the game only reads your chat and never posts. Cheers (Bits), subs, gift subs and raids become gifts; chat charges the meter.</p>
            <div class="acts"><button type="button" class="mini connect">Connect</button><button type="button" class="mini test">Test a cheer</button></div>
            <p class="msg"></p>
          </div>
          <div class="plat" data-p="youtube">
            <div class="ph"><label class="check"><input type="checkbox" class="on"> <b>YouTube</b></label><i class="dot"></i><a class="how" href="../tutorials/youtube.html" target="_blank" rel="noopener">How to connect</a></div>
            <label class="row">Stream link, video ID, channel ID or @handle <input type="text" class="f-target" spellcheck="false" autocomplete="off" placeholder="https://youtube.com/live/…"></label>
            <label class="row">Your YouTube API key <input type="password" class="f-key" spellcheck="false" autocomplete="off" placeholder="AIza…"></label>
            <p class="hint keyhint"></p>
            <p class="hint">Reads chat every few seconds (never faster than 3 s). Super Chats, Super Stickers and memberships become gifts. YouTube has no keyless option for websites.</p>
            <div class="acts"><button type="button" class="mini connect">Connect</button><button type="button" class="mini test">Test a Super Chat</button></div>
            <p class="msg"></p>
          </div>
          <div class="plat" data-p="custom">
            <div class="ph"><label class="check"><input type="checkbox" class="on"> <b>Custom</b> WebSocket</label><i class="dot"></i><a class="how" href="../tutorials/custom.html" target="_blank" rel="noopener">How to connect</a></div>
            <label class="row">WebSocket URL <input type="text" class="f-url" spellcheck="false" autocomplete="off" placeholder="ws://localhost:8080"></label>
            <p class="hint">Any feed that sends our normalized events as JSON: {"type":"gift","user":{"id":"1","nickname":"kai"},"gift":{"name":"Rose","coins":1,"count":1}}.</p>
            <div class="acts"><button type="button" class="mini connect">Connect</button><button type="button" class="mini test">Test an event</button></div>
            <p class="msg"></p>
          </div>
          <div class="liveact"><button type="button" class="mini forget">Forget keys</button><button type="button" class="btn go-live">CONNECT ALL &amp; GO LIVE</button></div>
          <div class="popout">
            <b>Put it on stream</b>
            <p class="hint">Capture the window you play in (OBS / Streamlabs / LIVE Studio: <b>Window Capture</b>). Don't add the game as a Browser Source or Link source: that's a second copy with its own gifts.</p>
            <div class="acts"><button type="button" class="mini pop" data-shape="tall">Pop out stream window · Tall 9:16</button><button type="button" class="mini pop" data-shape="wide">Wide 16:9</button></div>
            <p class="hint warn">Keep the stream window visible: browsers pause a minimized or fully covered window. Use a second screen, or put it side by side with your streaming app.</p>
            <a class="how stream-how" href="../tutorials/put-game-on-stream.html" target="_blank" rel="noopener">Put the game on your stream</a>
          </div>
        </section>
        <section data-pane="settings" class="pane">
          <label class="row">Volume <input type="range" min="0" max="1" step="0.05" class="vol" aria-label="volume"><em class="vol-label"></em></label>
          <label class="row check"><input type="checkbox" class="mute"> Mute</label>
          ${meta.nonet ? '<label class="row check"><input type="checkbox" class="nonet"> NO NET (falls go all the way down) <em>reloads</em></label>' : ''}
          <label class="row check"><input type="checkbox" class="skeys"> Streamer keys: F10 knobs, F9 PANIC, F1 key help, Select+Start PANIC <em>reloads</em></label>
          <label class="row check"><input type="checkbox" class="transp"> Transparent background (OBS / TikTok LIVE Studio) <em>reloads</em></label>
          <label class="row">Touch controls <select class="touchsel"><option value="auto">auto (phones)</option><option value="on">always</option><option value="off">off</option></select></label>
          <p class="hint">Streaming: use <b>Pop out stream window</b> in LIVE SETUP and Window Capture it. Transparent background is only for playing inside a streaming app's own browser (OBS Browser Source + Interact). Esc or the ⚙ button always brings this menu back.</p>
        </section>
        <section data-pane="controls" class="pane">
          <table class="keys">${meta.keys.map(([a, k]) => `<tr><td>${esc(a)}</td><td><kbd>${esc(k)}</kbd></td></tr>`).join('')}<tr><td>This menu</td><td><kbd>Esc</kbd> / ⚙ / pad Select</td></tr></table>
          <p class="hint">Gamepad: ${esc(meta.pad)}.</p>
          <p class="hint skeys-hint">Streamer keys (turn on in SETTINGS): ${STREAMER_KEYS.map(([a, k]) => `${esc(a)} <kbd>${esc(k)}</kbd>`).join(' · ')}</p>
          <p class="hint">Phones: a d-pad and action buttons appear on screen.</p>
        </section>
        <footer><button type="button" class="btn play">▶ PLAY</button></footer>
      </div>`;
    root.appendChild(menu);

    // tray
    const tray = document.createElement('aside');
    tray.className = 'tray';
    const words = meta.comments;
    tray.innerHTML = `<button type="button" class="tray-toggle" aria-expanded="false">YOU ARE THE CHAT</button>
      <div class="tray-body">
        <label class="row">Your name <input type="text" class="t-name" maxlength="20" spellcheck="false" autocomplete="off"></label>
        <div class="t-words">${words.map((w) => w === 'paint' ? `<button type="button" data-word="paint">paint <select class="t-paint">${['red', 'orange', 'yellow', 'lime', 'green', 'teal', 'blue', 'purple', 'pink', 'white', 'black', 'chrome'].map((c) => `<option>${c}</option>`).join('')}</select></button>` : `<button type="button" data-word="${w}">${w}</button>`).join('')}
          <button type="button" data-act="like">like ×15</button><button type="button" data-act="follow">follow</button><button type="button" data-act="share">share</button></div>
        <div class="t-tiers">${tierRows.map((t, i) => {
          const hg = giftForTier(t, 'help', tierDoc.giftSides), sg = giftForTier(t, 'sab', tierDoc.giftSides);
          return `<div class="tier"><span class="coins">${t.min}${t.max == null ? '+' : ''}</span><button type="button" class="help" data-tier="${i}" data-side="help" title="${esc(hg.name)} (${hg.diamondCount} coins)">${esc(pretty(t.help))}</button><button type="button" class="sab" data-tier="${i}" data-side="sab" title="${esc(sg.name)} (${sg.diamondCount} coins)">${esc(pretty(t.sab))}</button></div>`;
        }).join('')}</div>
        <p class="hint">HELP gifts come from @<span class="n1">you</span>, SAB from @<span class="n2">you</span>_sab (games lock a viewer's team for 10 minutes).</p>
      </div>`;
    root.appendChild(tray);

    const $ = (sel, r = menu) => r.querySelector(sel);
    const $$ = (sel, r = menu) => [...r.querySelectorAll(sel)];
    const INT = ['chill', 'normal', 'chaos'];

    // tabs
    const showTab = (t) => { for (const b of $$('.tabs button')) b.classList.toggle('on', b.dataset.tab === t); for (const p of $$('.pane')) p.classList.toggle('on', p.dataset.pane === t); };
    for (const b of $$('.tabs button')) b.addEventListener('click', () => showTab(b.dataset.tab));
    $('[data-goto="live"]').addEventListener('click', () => showTab('live'));
    for (const r of $$('input[name=mode]')) r.addEventListener('change', () => { setMode(r.value); if (r.value === 'live' && !Object.values(S.live).some((x) => x.on)) showTab('live'); });
    $('.intensity').addEventListener('input', (e) => { S.intensity = INT[Number(e.target.value)] || 'normal'; saveSettings(S); sim.setIntensity(S.intensity); ui.renderMode(); });
    $('.keepawake').addEventListener('change', (e) => { S.keepAwake = e.target.checked; saveSettings(S); });
    $('.play').addEventListener('click', () => openMenu(false));
    $('.go-live').addEventListener('click', () => {
      for (const p of Object.keys(S.live)) if (S.live[p].on) startPlatform(p);
      if (S.mode !== 'live') setMode('live'); else { pushStatus(); ui.renderLights(); }
      ui.renderLive();
    });
    $('.forget').addEventListener('click', () => {
      S.live.youtube.key = ''; S.live.tiktok.eulerKey = ''; saveSettings(S);
      if (live.youtube) stopPlatform('youtube');
      if (live.tiktok && S.live.tiktok.plan === 'euler') stopPlatform('tiktok');
      ui.renderLive(); ui.renderLights(); pushStatus();
      $('.forget').textContent = 'Keys forgotten'; setTimeout(() => { $('.forget').textContent = 'Forget keys'; }, 2000);
    });
    for (const b of $$('.pop')) b.addEventListener('click', () => popOut(b.dataset.shape));
    for (const r of $$('input[name=tt-plan]')) r.addEventListener('change', () => { S.live.tiktok.plan = r.value; saveSettings(S); ui.renderLive(); if (live.tiktok) startPlatform('tiktok'); });
    if (isSafari()) menu.classList.add('is-safari');

    // platform rows
    for (const row of $$('.plat')) {
      const p = row.dataset.p, c = S.live[p];
      const on = $('.on', row);
      $('.connect', row).addEventListener('click', () => {
        if (live[p]) { stopPlatform(p); c.on = false; }
        else { c.on = true; if (S.mode !== 'live') setMode('live'); if (!live[p]) startPlatform(p); }
        saveSettings(S); pushStatus(); ui.renderLive(); ui.renderLights();
      });
      $('.test', row).addEventListener('click', (e) => { testEvent(p); const b = e.currentTarget; b.classList.remove('sent'); void b.offsetWidth; b.classList.add('sent'); });
      on.addEventListener('change', () => {
        c.on = on.checked; saveSettings(S);
        if (S.mode === 'live') { if (c.on) startPlatform(p); else stopPlatform(p); pushStatus(); }
        ui.renderLights();
      });
      const bind = (sel, field, clean = (v) => v.trim()) => {
        const inp = $(sel, row); if (!inp) return;
        inp.addEventListener('change', () => {
          if (field === 'key' || field === 'eulerKey') { const v = inp.value.trim(); if (v) c[field] = v; inp.value = ''; }
          else c[field] = clean(inp.value);
          saveSettings(S); ui.renderLive();
          if (S.mode === 'live' && c.on) startPlatform(p);
        });
      };
      bind('.f-url', 'url'); bind('.f-channel', 'channel', (v) => cleanChannel(v)); bind('.f-target', 'target'); bind('.f-key', 'key');
      bind('.f-ttuser', 'username', (v) => cleanTikTokUser(v)); bind('.f-eulerkey', 'eulerKey');
    }

    // settings
    $('.vol').addEventListener('input', (e) => { S.volume = Number(e.target.value); saveSettings(S); master.set(S.muted ? 0 : S.volume); ui.renderSettings(); });
    $('.mute').addEventListener('change', (e) => { S.muted = e.target.checked; saveSettings(S); if (!S.muted && params.get('mute') === '1') { const q = new URLSearchParams(location.search); q.delete('mute'); history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash); } master.set(S.muted ? 0 : S.volume); sound.setMuted(S.muted); });
    // the toggle wins over a URL option of the same name: drop that option from the address before reloading
    const reloadToggle = (sel, field, param) => { const el = $(sel); if (el) el.addEventListener('change', () => {
      S[field] = el.checked; saveSettings(S);
      const q = new URLSearchParams(location.search); if (param) q.delete(param);
      setTimeout(() => location.replace(location.pathname + (q.toString() ? '?' + q : '') + location.hash), 150);
    }); };
    reloadToggle('.nonet', 'nonet', 'nonet'); reloadToggle('.skeys', 'streamerKeys'); reloadToggle('.transp', 'transparent', 'transparent');
    $('.touchsel').addEventListener('change', (e) => { S.touch = e.target.value; saveSettings(S); touch.show(!menuOpen && touchWanted()); });

    // tray
    const tname = () => S.trayName || 'you';
    const tn = tray.querySelector('.t-name');
    tn.addEventListener('change', () => { S.trayName = tn.value.replace(/[^\w.]/g, '').slice(0, 20) || 'you'; tn.value = S.trayName; saveSettings(S); ui.renderTray(); });
    tray.querySelector('.tray-toggle').addEventListener('click', () => { S.trayOpen = !tray.classList.contains('open'); saveSettings(S); ui.renderTray(); });
    for (const b of tray.querySelectorAll('[data-tier]')) b.addEventListener('click', () => { sim.tray.gift(Number(b.dataset.tier), b.dataset.side, tname()); flash(b); });
    for (const b of tray.querySelectorAll('[data-word]')) b.addEventListener('click', (e) => {
      if (e.target.tagName === 'SELECT') return;
      const w = b.dataset.word;
      if (w === 'paint') sim.tray.comment('paint ' + tray.querySelector('.t-paint').value, tname(), 'sab');
      else sim.tray.comment(w, tname(), w === 'sab' || w === 'join' ? 'sab' : 'help');
      flash(b);
    });
    for (const b of tray.querySelectorAll('[data-act]')) b.addEventListener('click', () => { sim.tray[b.dataset.act](tname()); flash(b); });
    const flash = (b) => { b.classList.remove('sent'); void b.offsetWidth; b.classList.add('sent'); };

    // tutorials: hide "How to connect" links whose page isn't there (the research agent writes them)
    for (const a of $$('a.how')) a.classList.add('missing');
    fetch('../tutorials/list.json', { cache: 'no-store' }).then((r) => r.json()).then((j) => { const have = new Set((j && j.pages) || []); for (const a of $$('a.how')) if (have.has(a.getAttribute('href').split('/').pop())) a.classList.remove('missing'); }).catch(() => {});

    const LIGHT = { off: 'off', connecting: 'wait', live: 'ok', error: 'err' };
    const NAMES = { tiktok: 'TikTok', twitch: 'Twitch', youtube: 'YouTube', custom: 'Custom' };
    const api = {
      menu, gear, tray,
      renderMode() {
        for (const r of $$('input[name=mode]')) r.checked = r.value === S.mode;
        for (const m of $$('.mode')) m.classList.toggle('on', m.dataset.mode === S.mode);
        $('.sim-sub').classList.toggle('show', S.mode === 'sim');
        $('.live-sub').classList.toggle('show', S.mode === 'live');
        $('.intensity').value = String(Math.max(0, INT.indexOf(S.intensity)));
        $('.int-label').textContent = S.intensity;
        $('.keepawake').checked = !!S.keepAwake;
      },
      renderLive() {
        for (const row of $$('.plat')) {
          const p = row.dataset.p, c = S.live[p];
          $('.on', row).checked = !!c.on;
          const set = (sel, v) => { const i = $(sel, row); if (i && document.activeElement !== i) i.value = v || ''; };
          if (p === 'tiktok' || p === 'custom') set('.f-url', c.url);
          if (p === 'tiktok') {
            for (const r of $$('input[name=tt-plan]', row)) r.checked = r.value === (c.plan || 'tikfinity');
            row.classList.toggle('euler', c.plan === 'euler');
            set('.f-ttuser', c.username);
            const k = String(c.eulerKey || '');
            $('.f-eulerkey', row).placeholder = k ? 'key saved (hidden) · type to replace' : 'paste your key';
            $('.eulerhint', row).textContent = k ? 'A key is saved in this browser (never shown).' : '';
          }
          $('.connect', row).textContent = live[p] ? 'Disconnect' : 'Connect';
          if (p === 'twitch') set('.f-channel', c.channel);
          if (p === 'youtube') {
            set('.f-target', c.target);
            const k = String(c.key || '');
            $('.f-key', row).placeholder = k ? 'saved key: ' + k.slice(0, 4) + '…' + k.slice(-4) + ' (type to replace)' : 'AIza…';
            $('.keyhint', row).textContent = k ? 'A key is saved in this browser (never shown in full).' : 'Your own key from Google Cloud (YouTube Data API v3). It stays in this browser.';
          }
        }
      },
      renderLights() {
        const on = Object.keys(S.live).filter((p) => S.live[p].on);
        $('.lights').innerHTML = on.length ? on.map((p) => `<span class="light ${LIGHT[liveState[p].state] || 'off'}"><i class="dot"></i>${NAMES[p]}: ${esc(liveState[p].state === 'off' ? (S.mode === 'live' ? 'off' : 'ready') : liveState[p].state)}</span>`).join('') : '<span class="light off">No platform turned on yet.</span>';
        for (const row of $$('.plat')) {
          const p = row.dataset.p, st = liveState[p];
          const dot = $('.dot', row);
          dot.className = 'dot ' + (LIGHT[st.state] || 'off');
          dot.title = st.state;
          $('.msg', row).textContent = st.message || (S.live[p].on && S.mode !== 'live' ? 'Ready: connects when LIVE mode is on.' : '');
          $('.msg', row).className = 'msg ' + (LIGHT[st.state] || 'off');
        }
        const g = gear.querySelector('.gear-lights');
        g.innerHTML = S.mode === 'live' ? Object.keys(S.live).filter((p) => S.live[p].on).map((p) => `<b class="${LIGHT[liveState[p].state] || 'off'}"></b>`).join('') : '';
      },
      renderSettings() {
        $('.vol').value = String(S.volume); $('.vol-label').textContent = Math.round(S.volume * 100) + '%';
        $('.mute').checked = !!S.muted;
        if ($('.nonet')) $('.nonet').checked = !!S.nonet;
        $('.skeys').checked = !!S.streamerKeys; $('.transp').checked = !!S.transparent; $('.touchsel').value = S.touch;
        $('.skeys-hint').classList.toggle('dim', !S.streamerKeys);
      },
      renderTray() {
        const show = S.mode === 'sim' && !menuOpen;
        tray.classList.toggle('show', show);
        const open = S.trayOpen == null ? innerWidth >= 900 : !!S.trayOpen;
        tray.classList.toggle('open', open);
        tray.querySelector('.tray-toggle').setAttribute('aria-expanded', String(open));
        if (document.activeElement !== tn) tn.value = S.trayName || 'you';
        tray.querySelector('.n1').textContent = S.trayName || 'you'; tray.querySelector('.n2').textContent = S.trayName || 'you';
      },
      renderAll() { api.renderMode(); api.renderLive(); api.renderLights(); api.renderSettings(); api.renderTray(); },
      showTab,
    };
    return api;
  }

  // ---------- keyboard: Esc = menu; typing in the menu never reaches the game ----------
  const formField = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  const gameUiOpen = () => { try { const gs = game.dev && game.dev.S; return !!(gs && ((gs.settings && gs.settings.open) || gs.help)); } catch (e) { return false; } };
  const guard = (e) => {
    if (e.type === 'keydown' && e.code === 'Escape' && !e.repeat) {
      if (handedOff) return;
      if (!menuOpen && gameUiOpen()) return; // the game's own F10/F1 overlay closes on Esc
      e.preventDefault(); e.stopImmediatePropagation();
      openMenu(!menuOpen);
      return;
    }
    if (menuOpen || handedOff || formField(e.target)) e.stopImmediatePropagation(); // menu open: the game hears nothing
  };
  addEventListener('keydown', guard, true); addEventListener('keyup', guard, true);

  // gear auto-hide (clean OBS capture): visible for 3 s after pointer movement
  let hideT = 0;
  const wake = () => { root.classList.remove('idle'); clearTimeout(hideT); hideT = setTimeout(() => root.classList.add('idle'), 3000); };
  addEventListener('pointermove', wake); addEventListener('pointerdown', wake); wake();

  // ---------- gamepad: A / Start in the menu = PLAY; Select (alone) during play = menu ----------
  const padPrev = {};
  let selectArmed = false;
  function pollPadMenu() {
    let pads; try { pads = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { return; }
    for (const p of pads || []) {
      if (!p || !p.connected) continue;
      const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
      const k = p.index, prev = padPrev[k] || {};
      const now = { a: b(0), start: b(9), select: b(8) };
      if (menuOpen && ((now.a && !prev.a) || (now.start && !prev.start))) openMenu(false);
      else if (!menuOpen) {
        if (now.select && !prev.select) selectArmed = true;
        if (now.start) selectArmed = false; // Select+Start = PANIC (streamer keys), not the menu
        if (!now.select && prev.select && selectArmed) { selectArmed = false; openMenu(true); }
      }
      padPrev[k] = now;
    }
  }

  // keep-awake in SIMULATION: an unbound key every 4 s counts as streamer activity (no ON BREAK while watching)
  setInterval(() => {
    if (menuOpen || S.mode !== 'sim' || !S.keepAwake || document.visibilityState === 'hidden') return;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F24', key: 'F24' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'F24', key: 'F24' }));
  }, 4000);

  // ---------- frame loop (platform/main.js), frozen while the menu is open ----------
  let last = null;
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') last = null; });
  function frame(now) {
    const dt = last == null ? 0 : Math.max(0, Math.min(1 / 30, (now - last) / 1000));
    last = now;
    pollPadMenu();
    if (!menuOpen && !handedOff) game.update(dt);
    if (game.takeFeed) for (const f of game.takeFeed()) overlay.note(f);
    overlay.update(dt);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    game.render(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    overlay.render(ctx);
    requestAnimationFrame(frame);
  }

  // ---------- "Pop out stream window": the game moves to a clean popup (Window Capture it); this tab hands off ----------
  // Only ONE copy may hold the connections, or gifts would land twice: this page stops its sim/connectors and freezes
  // until the popup closes (or "Bring it back here").
  let popWin = null, handedOff = false, popTimer = 0;
  const handoff = document.createElement('div');
  handoff.className = 'handoff';
  handoff.innerHTML = `<div><b>The game is in the stream window now.</b><p>Play there and Window Capture it. Keep that window visible (not minimized or covered).</p><button type="button" class="btn back">Bring it back here</button></div>`;
  root.appendChild(handoff);
  handoff.querySelector('.back').addEventListener('click', () => { try { popWin && popWin.close(); } catch (e) { /* ignore */ } handOff(false); });
  function popOut(shape) {
    const q = new URLSearchParams(location.search);
    q.set('menu', '0'); q.set('popout', '1'); q.delete('mode');
    const [w, h] = shape === 'wide' ? [960, 540] : [540, 960];
    let win = null;
    try { win = window.open(location.pathname + '?' + q.toString(), 'outpost-stream-' + slug, `popup,width=${w},height=${h}`); } catch (e) { win = null; }
    const note = ui.menu.querySelector('.popout .warn');
    if (!win) { note.textContent = 'The pop-up was blocked. Allow pop-ups for this site (icon at the right end of the address bar), then click again.'; note.classList.add('err'); return; }
    popWin = win;
    handOff(true);
  }
  function handOff(on) {
    handedOff = !!on;
    clearInterval(popTimer);
    handoff.classList.toggle('show', handedOff);
    if (handedOff) {
      sim.stop(); for (const p of Object.keys(live)) stopPlatform(p);
      menuOpen = false; ui.menu.classList.remove('open'); touch.show(false); ui.renderTray();
      pushStatus(); ui.renderLights();
      popTimer = setInterval(() => { if (!popWin || popWin.closed) handOff(false); }, 1000);
    } else { popWin = null; applyMode(); openMenu(true); }
  }
  if (params.get('popout') === '1') {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = 'Stream window: capture THIS window. Keep it visible (not minimized or covered). Esc = menu.';
    root.appendChild(t);
    setTimeout(() => t.classList.add('gone'), 6000);
  }

  // debug / test handle
  window.__shell = {
    slug, meta, settings: S, hub, sim, live, liveState, touch, master,
    get menuOpen() { return menuOpen; }, get handedOff() { return handedOff; }, openMenu, setMode, startPlatform, stopPlatform, testEvent, popOut, handOff, ui, tierDoc,
    saveSettings: () => saveSettings(S),
  };

  ui.renderAll();
  applyMode();
  openMenu(menuOpen);
  requestAnimationFrame(frame);
  document.documentElement.classList.add('ready');
  return window.__shell;
}
