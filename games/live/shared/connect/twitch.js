// Browser port of app/lib/twitch.js (anonymous IRC part): read-only chat over wss://irc-ws.chat.twitch.tv:443 as
// justinfanNNNNN. Chat, Bits (cheers), subs/resubs, gift subs (community gifts counted once) and raids.
// It never sends a chat message (only CAP/PASS/NICK/JOIN/PONG). EventSub (token mode) is not in the web edition.
import { platformConfig } from './normalize.js';

export const IRC_URL = 'wss://irc-ws.chat.twitch.tv:443';
export const CHANNEL_RE = /^[A-Za-z0-9_]{2,25}$/;

const TAG_ESC = { ':': ';', s: ' ', '\\': '\\', r: '\r', n: '\n' };
export function unescapeTag(v) { return String(v).replace(/\\(.?)/g, (m, c) => (c in TAG_ESC ? TAG_ESC[c] : c)); }

export function parseIrc(line) {
  let s = String(line || '').replace(/\r?\n$/, '');
  if (!s) return null;
  const msg = { raw: s, tags: {}, prefix: '', nick: '', command: '', params: [], trailing: '' };
  if (s[0] === '@') {
    const sp = s.indexOf(' ');
    for (const kv of s.slice(1, sp).split(';')) {
      const eq = kv.indexOf('=');
      if (eq < 0) msg.tags[kv] = ''; else msg.tags[kv.slice(0, eq)] = unescapeTag(kv.slice(eq + 1));
    }
    s = s.slice(sp + 1);
  }
  if (s[0] === ':') {
    const sp = s.indexOf(' ');
    msg.prefix = s.slice(1, sp);
    msg.nick = msg.prefix.split('!')[0];
    s = s.slice(sp + 1);
  }
  const ti = s.indexOf(' :');
  if (ti >= 0) { msg.trailing = s.slice(ti + 2); s = s.slice(0, ti); }
  const parts = s.split(' ').filter(Boolean);
  msg.command = parts.shift() || '';
  msg.params = parts;
  return msg;
}

const CHEERMOTE = /^[a-z][a-z0-9]*?\d+$/i;
export function stripCheermotes(text) { return String(text || '').split(/\s+/).filter((w) => w && !CHEERMOTE.test(w)).join(' ').trim(); }
function tierOf(plan) {
  const p = String(plan || '');
  if (/prime/i.test(p)) return { tier: 1, prime: true };
  const n = Number(p);
  return { tier: n >= 3000 ? 3 : n >= 2000 ? 2 : 1, prime: false };
}
function twUser(tags, fallbackLogin) {
  const login = String(tags.login || fallbackLogin || '').toLowerCase();
  const id = tags['user-id'] || login || 'anon';
  return { id: 'tw:' + id, nickname: tags['display-name'] || login || 'viewer', handle: login, avatarUrl: '', platform: 'twitch' };
}

export class TwitchTranslator {
  constructor() { this.mystery = new Map(); }
  toEvents(m, cfgAll, now = Date.now()) {
    if (!m) return [];
    const cfg = (cfgAll && cfgAll.twitch) || platformConfig(null).twitch;
    const t = m.tags || {};
    if (t['source-room-id'] && t['room-id'] && t['source-room-id'] !== t['room-id']) return [];
    const msgId = t.id ? 'tw:' + t.id : '';
    const base = (type, extra) => Object.assign({ type, platform: 'twitch', user: twUser(t, m.nick) }, msgId ? { msgId } : null, extra);
    const out = [];
    if (m.command === 'PRIVMSG') {
      const text = m.trailing;
      const bits = Math.floor(Number(t.bits) || 0);
      if (bits > 0) {
        const rest = stripCheermotes(text);
        if (rest) out.push(base('comment', { text: rest.slice(0, 200) }));
        out.push(base('gift', { gift: { name: `Cheer ${bits}`, id: 'tw-cheer', coins: Math.round(bits * cfg.coinsPerBit), count: 1, original: { bits } } }));
        return out;
      }
      return [base('comment', { text: String(text).slice(0, 200), chatCharge: true })];
    }
    if (m.command !== 'USERNOTICE') return [];
    const kind = t['msg-id'];
    const { tier, prime } = tierOf(t['msg-param-sub-plan']);
    const tierCoins = Math.round(Number(cfg.subTiers[tier]) || 0);
    const months = Number(t['msg-param-cumulative-months'] || t['msg-param-months']) || 0;
    const tierName = prime ? 'Prime' : 'T' + tier;
    switch (kind) {
      case 'sub':
      case 'resub': {
        const name = kind === 'sub' ? `Sub ${tierName}` : `Resub ${tierName}${months > 1 ? ` · ${months} mo` : ''}`;
        return [base('gift', { gift: { name, id: 'tw-sub', coins: tierCoins, count: 1, original: { tier, prime, months } } })];
      }
      case 'submysterygift': {
        const n = Math.max(1, Math.min(1000, Number(t['msg-param-mass-gift-count']) || 1));
        const cg = t['msg-param-community-gift-id'];
        this.prune(now);
        if (cg) this.mystery.set('gift:' + cg, { left: n, until: now + 120000 });
        this.mystery.set('user:' + String(t.login || '').toLowerCase(), { left: n, until: now + 120000 });
        return [base('gift', { gift: { name: `Gift Sub ${tierName}${n > 1 ? ' x' + n : ''}`, id: 'tw-giftsub', coins: tierCoins, count: n, original: { tier, gifted: n } } })];
      }
      case 'subgift':
      case 'anonsubgift': {
        const cg = t['msg-param-community-gift-id'];
        const byGift = cg && this.mystery.get('gift:' + cg);
        const byUser = this.mystery.get('user:' + String(t.login || '').toLowerCase());
        const hit = byGift || byUser;
        if (hit && hit.left > 0 && hit.until > now) { hit.left--; if (byGift && byUser) byUser.left--; return []; }
        const to = t['msg-param-recipient-display-name'] || t['msg-param-recipient-user-name'] || '';
        return [base('gift', { gift: { name: `Gift Sub ${tierName}`, id: 'tw-giftsub', coins: tierCoins, count: 1, original: { tier, gifted: 1, to } } })];
      }
      case 'giftpaidupgrade':
      case 'anongiftpaidupgrade':
      case 'primepaidupgrade': {
        const tr = kind === 'primepaidupgrade' ? tier : 1;
        return [base('gift', { gift: { name: `Sub ${'T' + tr} (upgrade)`, id: 'tw-sub', coins: Math.round(Number(cfg.subTiers[tr]) || 0), count: 1, original: { tier: tr, upgrade: kind } } })];
      }
      case 'raid': {
        if (cfg.raid === 'none') return [base('comment', { text: `raided with ${Number(t['msg-param-viewerCount']) || 0} viewers`, raid: { viewers: Number(t['msg-param-viewerCount']) || 0 } })];
        const u = twUser({ ...t, 'display-name': t['msg-param-displayName'] || t['display-name'], login: t['msg-param-login'] || t.login }, m.nick);
        return [Object.assign(base('share', { raid: { viewers: Number(t['msg-param-viewerCount']) || 0 } }), { user: u })];
      }
      default: return [];
    }
  }
  prune(now) { for (const [k, v] of this.mystery) if (v.until < now || v.left <= 0) this.mystery.delete(k); if (this.mystery.size > 500) this.mystery.clear(); }
}

export const cleanChannel = (c) => String(c || '').trim().replace(/^https?:\/\/(www\.)?twitch\.tv\//i, '').replace(/^[#@]/, '').split(/[/?#]/)[0].toLowerCase();

/**
 * createTwitch({ channel, url, getCfg, onEvent, onState, isDup }) -> { start(), stop(), state }
 * onState(state, info): 'connecting' | 'live' | 'error' ; info = { message, code, retryInMs }
 */
export function createTwitch({ channel, url = IRC_URL, getCfg, onEvent, onState, isDup, WebSocketImpl = WebSocket }) {
  const ch = cleanChannel(channel);
  const tr = new TwitchTranslator();
  let ws = null, stopped = false, retryMs = 2000, timer = null, joinTimer = null;
  const api = { state: 'off', channel: ch, events: 0, start, stop };
  const set = (s, info = {}) => { api.state = s; try { onState(s, info); } catch (e) { /* ignore */ } };

  function start() {
    stopped = false;
    if (!ch) return set('error', { code: 'bad_channel', message: 'Type a Twitch channel name first (the name in twitch.tv/name).' });
    if (!CHANNEL_RE.test(ch)) return set('error', { code: 'bad_channel', message: `"${ch}" doesn't look like a Twitch channel name. Use only letters, numbers and underscores.` });
    connect();
  }
  function connect() {
    if (stopped) return;
    set('connecting', { message: `Joining #${ch} chat…` });
    let sock;
    try { sock = ws = new WebSocketImpl(url); } catch (e) { return down('bad url'); }
    let joined = false, buf = '';
    const nick = 'justinfan' + (10000 + Math.floor(Math.random() * 80000));
    sock.onopen = () => {
      sock.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      sock.send('PASS SCHMOOPIIE'); // any password: anonymous logins are read-only
      sock.send('NICK ' + nick);
      sock.send('JOIN #' + ch);
      joinTimer = setTimeout(() => { if (!joined && ws === sock) set('error', { code: 'not_found', message: `Connected to Twitch, but no chat room answered for #${ch}. Check the spelling of the channel name.` }); }, 10000);
    };
    sock.onmessage = (m) => {
      buf += typeof m.data === 'string' ? m.data : '';
      const lines = buf.split('\r\n'); buf = lines.pop();
      for (const line of lines) {
        if (!line) continue;
        if (line.startsWith('PING')) { try { sock.send('PONG' + line.slice(4)); } catch (e) { /* ignore */ } continue; }
        const msg = parseIrc(line);
        if (!msg) continue;
        if (msg.command === 'ROOMSTATE' && !joined) { joined = true; clearTimeout(joinTimer); retryMs = 2000; set('live', { message: `Connected to #${ch}. The game only reads chat (no login, never posts): cheers, subs, gift subs and raids count as gifts.`, roomId: msg.tags['room-id'] }); continue; }
        if (msg.command === 'RECONNECT') { try { sock.close(); } catch (e) { /* ignore */ } continue; }
        if (msg.command === 'NOTICE' && /suspended|banned|does not exist|msg_channel/i.test(msg.trailing + (msg.tags['msg-id'] || ''))) { set('error', { code: 'not_found', message: `Twitch says #${ch} is unavailable: ${msg.trailing || msg.tags['msg-id']}` }); continue; }
        if (msg.command !== 'PRIVMSG' && msg.command !== 'USERNOTICE') continue;
        if (msg.tags.id && isDup && isDup('twraw:' + msg.tags.id)) continue;
        let evs = [];
        try { evs = tr.toEvents(msg, getCfg()); } catch (e) { continue; }
        for (const e of evs) { api.events++; onEvent(e); }
      }
    };
    const down = (why) => {
      if (ws !== sock || stopped) return;
      clearTimeout(joinTimer);
      ws = null;
      const wait = retryMs;
      retryMs = Math.min(retryMs * 2, 60000);
      set('error', { code: 'network', message: `Lost the Twitch chat connection (${why}). Retrying in ${Math.round(wait / 1000)} s…`, retryInMs: wait });
      timer = setTimeout(connect, wait);
    };
    sock.onclose = () => down('disconnected');
    sock.onerror = () => { /* close follows */ };
  }
  function stop() {
    stopped = true;
    clearTimeout(timer); clearTimeout(joinTimer);
    if (ws) { const w = ws; ws = null; try { w.onclose = null; w.onmessage = null; w.close(); } catch (e) { /* ignore */ } }
    set('off', { message: '' });
  }
  return api;
}
