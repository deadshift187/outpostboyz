// Browser port of app/lib/youtube.js (official API path, polling only): the streamer's own YouTube Data API v3 key
// + a live video (URL / ID), channel ID (UC...) or @handle -> activeLiveChatId -> liveChatMessages.list polling at
// max(pollingIntervalMillis, minPollSeconds (3 s)). The first page (chat history) is skipped. The key is sent in the
// X-Goog-Api-Key header (CORS-allowed by Google), so it never appears in a URL, the history or a log. No keyless mode:
// YouTube's web endpoints are not CORS-readable from a page.
// Super Chats, Super Stickers, new members, milestones, gifted memberships and text chat.
import { platformConfig, ytCoins } from './normalize.js';

export const API_BASE = 'https://youtube.googleapis.com/youtube/v3/';
const VIDEO_RE = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_RE = /^UC[A-Za-z0-9_-]{22}$/;
const HANDLE_RE = /^@[A-Za-z0-9._-]{3,30}$/;

export function parseTarget(input) {
  let s = String(input || '').trim();
  if (!s) return null;
  if (VIDEO_RE.test(s) && !s.startsWith('@')) return { kind: 'video', id: s };
  if (CHANNEL_RE.test(s)) return { kind: 'channel', id: s };
  if (HANDLE_RE.test(s)) return { kind: 'handle', handle: s };
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  let u; try { u = new URL(s); } catch (e) { return null; }
  if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$/i.test(u.hostname)) return null;
  if (/youtu\.be$/i.test(u.hostname)) { const id = u.pathname.slice(1).split('/')[0]; return VIDEO_RE.test(id) ? { kind: 'video', id } : null; }
  const v = u.searchParams.get('v');
  if (v && VIDEO_RE.test(v)) return { kind: 'video', id: v };
  const p = u.pathname.split('/').filter(Boolean);
  if ((p[0] === 'live' || p[0] === 'shorts' || p[0] === 'embed') && VIDEO_RE.test(p[1] || '')) return { kind: 'video', id: p[1] };
  if (p[0] === 'channel' && CHANNEL_RE.test(p[1] || '')) return { kind: 'channel', id: p[1] };
  if (p[0] && HANDLE_RE.test(decodeURIComponent(p[0]))) return { kind: 'handle', handle: decodeURIComponent(p[0]) };
  return null;
}

function ytUser(a, fallbackId) {
  a = a || {};
  const id = a.channelId || fallbackId || 'anon';
  return { id: 'yt:' + id, nickname: String(a.displayName || 'viewer').replace(/^@/, ''), handle: '', avatarUrl: a.profileImageUrl || '', platform: 'youtube' };
}

export function ytItemToEvents(item, cfgAll) {
  const cfg = (cfgAll && cfgAll.youtube) || platformConfig(null).youtube;
  if (!item || !item.snippet) return [];
  const sn = item.snippet;
  const user = ytUser(item.authorDetails, sn.authorChannelId);
  const msgId = item.id ? 'yt:' + item.id : '';
  const base = (type, extra) => Object.assign({ type, platform: 'youtube', user }, msgId ? { msgId } : null, extra);
  const gift = (name, coins, count, original) => base('gift', { gift: { name: String(name).slice(0, 60), id: 'yt-' + sn.type, coins: Math.max(0, Math.round(coins)), count: Math.max(1, count), original } });
  const comment = (text) => (text ? [base('comment', { text: String(text).slice(0, 200) })] : []);
  switch (sn.type) {
    case 'textMessageEvent': {
      const text = (sn.textMessageDetails && sn.textMessageDetails.messageText) ?? sn.displayMessage ?? '';
      return [base('comment', { text: String(text).slice(0, 200), chatCharge: true })];
    }
    case 'superChatEvent': {
      const d = sn.superChatDetails || {};
      const v = ytCoins(d, cfg);
      const label = d.amountDisplayString || `${(Number(d.amountMicros) / 1e6).toFixed(2)} ${d.currency}`;
      return [...comment(d.userComment), gift(`Super Chat ${label}`, v.coins, 1, { amount: Number(d.amountMicros) / 1e6, currency: d.currency, usd: v.usd, approx: v.approx })];
    }
    case 'superStickerEvent': {
      const d = sn.superStickerDetails || {};
      const v = ytCoins(d, cfg);
      const label = d.amountDisplayString || `${(Number(d.amountMicros) / 1e6).toFixed(2)} ${d.currency}`;
      return [gift(`Super Sticker ${label}`, v.coins, 1, { amount: Number(d.amountMicros) / 1e6, currency: d.currency, usd: v.usd, approx: v.approx })];
    }
    case 'newSponsorEvent': {
      const d = sn.newSponsorDetails || {};
      return [gift(d.isUpgrade ? 'Member upgrade' : 'New member', Number(cfg.newMember) || 0, 1, { level: d.memberLevelName || '' })];
    }
    case 'memberMilestoneChatEvent': {
      const d = sn.memberMilestoneChatDetails || {};
      const mo = Number(d.memberMonth) || 0;
      return [...comment(d.userComment), gift(`Member ${mo} mo`, Number(cfg.memberMilestone) || 0, 1, { months: mo, level: d.memberLevelName || '' })];
    }
    case 'membershipGiftingEvent': {
      const d = sn.membershipGiftingDetails || {};
      const n = Math.max(1, Math.min(1000, Number(d.giftMembershipsCount) || 1));
      return [gift(`Gift Member${n > 1 ? ' x' + n : ''}`, Number(cfg.giftMembership) || 0, n, { gifted: n, level: d.giftMembershipsLevelName || '' })];
    }
    default: return [];
  }
}

function apiErr(j, status) {
  const er = (j && j.error) || {};
  const reasons = [...(er.errors || []).map((x) => x.reason), ...(er.details || []).map((x) => x.reason)].filter(Boolean);
  const e = new Error(`YouTube API ${er.code || status}: ${er.message || 'error'}`);
  e.api = true; e.status = er.code || status; e.reason = reasons.join(',') || er.status || '';
  return e;
}

export function classify(e) {
  const r = String((e && e.reason) || '') + ' ' + String((e && e.message) || '');
  if (/quotaExceeded|dailyLimitExceeded|rateLimitExceeded/i.test(r)) return 'quota';
  if (/keyInvalid|API_KEY_INVALID|API key not valid|badRequest.*key/i.test(r)) return 'bad_key';
  if (/accessNotConfigured|SERVICE_DISABLED|has not been used|disabled/i.test(r)) return 'api_disabled';
  if (/liveChatEnded/i.test(r)) return 'ended';
  if (/liveChatDisabled/i.test(r)) return 'chat_disabled';
  if (/liveChatNotFound|videoNotFound/i.test(r)) return 'not_found';
  if (/API_KEY_HTTP_REFERRER_BLOCKED|API_KEY_IP_ADDRESS_BLOCKED|forbidden|ipRefererBlocked/i.test(r)) return 'key_restricted';
  if (/Failed to fetch|NetworkError|network|timeout|Load failed/i.test(r)) return 'network';
  return 'unknown';
}

// app/lib/friendly.js explainYouTube, worded for the browser edition
export function explainYouTube(err) {
  const code = (err && err.code) || classify(err);
  const M = {
    bad_target: err && err.empty ? 'Paste your YouTube live video link, video ID, channel ID (UC...) or @handle.'
      : "That doesn't look like a YouTube link, video ID, channel ID (UC...) or @handle. Easiest: open your live stream and copy its link.",
    no_key: 'Paste your YouTube Data API key (it starts with AIza). It stays in this browser only.',
    bad_key: "YouTube rejected the API key. Check you copied all of it (it starts with AIza), and that it's an API key, not an OAuth client ID.",
    api_disabled: 'The API key works, but "YouTube Data API v3" is not enabled for its Google Cloud project. Enable it (APIs & Services > Library), wait a minute, then connect again.',
    key_restricted: "The API key is restricted so this page can't use it. In Google Cloud, allow this site under the key's website restrictions (or set None), and allow YouTube Data API v3.",
    quota: "Today's YouTube API quota for this key is used up. It resets at midnight Pacific time; this page retries every 30 minutes.",
    not_live: "You're not live on YouTube right now (or the stream is private). Go live; this page checks again by itself.",
    ended: 'That YouTube stream has ended. Paste the link of your new stream, or use your channel ID / @handle so each new stream is found by itself.',
    not_found: "Couldn't find that YouTube video or channel. Check the link, ID or @handle.",
    not_a_stream: "That YouTube video isn't a live stream. Paste the link of your live stream instead (or your channel ID / @handle).",
    chat_disabled: 'Live chat is turned off for that stream. Turn chat on in YouTube Studio (Stream settings > Chat).',
    network: "Couldn't reach YouTube. Check your internet connection (or a VPN / ad-blocker blocking googleapis.com).",
  };
  return { code: M[code] ? code : 'unknown', message: M[code] || 'YouTube connection failed: ' + String((err && err.message) || err || 'unknown error').slice(0, 200) };
}

/**
 * createYouTube({ apiKey, target, getCfg, onEvent, onState, fetchImpl, apiBase }) -> { start, stop, state, units }
 * fetchImpl is looked up at call time (window.fetch), so a test can mock it.
 */
export function createYouTube({ apiKey, target, getCfg, onEvent, onState, fetchImpl = (...a) => window.fetch(...a), apiBase = API_BASE }) {
  let stopped = false, timer = null, pageToken = null, liveChatId = null;
  const key = String(apiKey || '').trim();
  const api = { state: 'off', units: 0, searchCalls: 0, events: 0, polls: 0, lastWaitMs: 0, start, stop };
  const set = (s, info = {}) => { api.state = s; try { onState(s, info); } catch (e) { /* ignore */ } };

  async function get(pathQs) {
    // the key travels in the X-Goog-Api-Key header, never in the URL (web-research/browser-connect.md 2a)
    const r = await fetchImpl(apiBase + pathQs, { cache: 'no-store', headers: { 'X-Goog-Api-Key': key } });
    if (/^search/.test(pathQs)) api.searchCalls++; else api.units++;
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw apiErr(j, r.status);
    return j;
  }
  async function resolve() {
    const t = parseTarget(target);
    if (!t) throw Object.assign(new Error('bad target'), { code: 'bad_target', empty: !String(target || '').trim() });
    let videoId = t.kind === 'video' ? t.id : null;
    let channelId = t.kind === 'channel' ? t.id : null;
    if (t.kind === 'handle') {
      const c = await get('channels?part=id&forHandle=' + encodeURIComponent(t.handle));
      channelId = c.items && c.items[0] && c.items[0].id;
      if (!channelId) throw Object.assign(new Error('handle not found'), { code: 'not_found' });
    }
    if (!videoId) {
      const s = await get(`search?part=id&channelId=${channelId}&eventType=live&type=video&maxResults=1`);
      videoId = s.items && s.items[0] && s.items[0].id && s.items[0].id.videoId;
      if (!videoId) throw Object.assign(new Error('channel not live'), { code: 'not_live' });
    }
    const v = await get('videos?part=liveStreamingDetails,snippet&id=' + videoId);
    const item = v.items && v.items[0];
    if (!item) throw Object.assign(new Error('video not found'), { code: 'not_found' });
    const d = item.liveStreamingDetails;
    if (!d) throw Object.assign(new Error('not a live stream'), { code: 'not_a_stream' });
    if (!d.activeLiveChatId) throw Object.assign(new Error(d.actualEndTime ? 'stream ended' : 'no active live chat'), { code: d.actualEndTime ? 'ended' : 'not_live' });
    return { videoId, liveChatId: d.activeLiveChatId, title: (item.snippet && item.snippet.title) || '' };
  }
  function fail(e) {
    if (stopped) return;
    const x = explainYouTube(e);
    const t = parseTarget(target);
    const offline = t && t.kind !== 'video' ? 300000 : 60000;
    const wait = x.code === 'quota' ? 1800000 : x.code === 'bad_key' || x.code === 'api_disabled' || x.code === 'key_restricted' ? 600000
      : x.code === 'bad_target' || x.code === 'not_found' || x.code === 'not_a_stream' ? 300000 : x.code === 'not_live' || x.code === 'ended' || x.code === 'chat_disabled' ? offline : 15000;
    set('error', { code: x.code, message: x.message, retryInMs: wait });
    if (x.code !== 'bad_target' && x.code !== 'no_key') timer = setTimeout(run, wait);
  }
  async function run() {
    if (stopped) return;
    if (!key) return set('error', explainYouTube({ code: 'no_key' }));
    set('connecting', { message: 'Finding your live chat…' });
    let chat;
    try { chat = await resolve(); } catch (e) { return fail(e); }
    if (stopped) return;
    liveChatId = chat.liveChatId; pageToken = null;
    set('live', { message: `Found "${chat.title || chat.videoId}", LIVE now. Super Chats, Super Stickers and memberships count as gifts.`, videoId: chat.videoId });
    poll();
  }
  async function poll() {
    if (stopped) return;
    const cfg = (getCfg() || {}).youtube || {};
    let resp;
    try {
      resp = await get(`liveChat/messages?liveChatId=${encodeURIComponent(liveChatId)}&part=id,snippet,authorDetails&maxResults=2000${pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''}`);
    } catch (e) { return fail(e); }
    if (stopped) return;
    api.polls++;
    const first = !pageToken;
    pageToken = resp.nextPageToken || pageToken;
    if (!first) for (const it of resp.items || []) {
      let evs = []; try { evs = ytItemToEvents(it, getCfg()); } catch (e) { continue; }
      for (const e of evs) { api.events++; onEvent(e); }
    }
    if (resp.offlineAt) return fail(Object.assign(new Error('live chat ended'), { code: 'ended' }));
    const wait = Math.max(Number(resp.pollingIntervalMillis) || 0, Math.max(3, Number(cfg.minPollSeconds) || 3) * 1000);
    api.lastWaitMs = wait;
    timer = setTimeout(poll, wait);
  }
  function start() { stopped = false; run(); }
  function stop() { stopped = true; clearTimeout(timer); set('off', { message: '' }); }
  return api;
}
