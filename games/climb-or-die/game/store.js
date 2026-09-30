// Persistent leaderboard (spec section 4). The platform owns app/data/climb-or-die.json
// (GET/POST /api/climb-or-die); the game keeps base (loaded once) + this session's
// deltas, so every save is idempotent: doc = base + session. Titles are cosmetic only.
import { PAL } from './consts.js';

export const TITLES = {
  legend: { name: 'Resistance Legend', prefix: 'LEGEND', color: '#FFE66D' },
  rope: { name: 'Rope Man', prefix: 'ROPE', color: PAL.sodium },
  scrapper: { name: 'Scrapper', prefix: 'SCRAP', color: '#9CF7EA' },
  wanted: { name: 'MOST WANTED', prefix: 'WANTED', color: '#FF2E2E' },
  bot: { name: 'Bot Collaborator', prefix: 'BOT', color: '#C58CFF' },
  gremlin: { name: 'Gremlin', prefix: 'GREM', color: '#FF9A7A' },
};
const today = () => new Date().toISOString().slice(0, 10);
const strip = (doc) => {
  const clean = { ...doc, viewers: Object.fromEntries(Object.entries(doc.viewers || {}).map(([id, v]) => { const { _t, ...rest } = v; return [id, rest]; })) };
  delete clean.mostWanted;
  return clean;
};
const emptyDoc = () => ({ version: 1, summits: 0, bestRunSec: null, viewers: {} });

export function titleFor(v, mostWantedId, id) {
  const sabTitle = mostWantedId === id && v.metersTaken > 0 ? 'wanted' : v.knockdowns >= 25 ? 'bot' : v.knockdowns >= 5 ? 'gremlin' : null;
  const helpTitle = v.metersGiven >= 1000 ? 'legend' : v.metersGiven >= 250 ? 'rope' : v.metersGiven >= 50 ? 'scrapper' : null;
  return v.team === 'sab' ? sabTitle || helpTitle : helpTitle || sabTitle;
}

/**
 * Storage backends: { load(): Promise<doc|null>, save(doc, {beacon}): Promise, clip(kind, user, text) }.
 * remoteBackend() = the streamer app's server (/api/climb-or-die + /api/clip), the default in a browser.
 */
export function remoteBackend() {
  return {
    async load() { const r = await fetch('/api/climb-or-die', { cache: 'no-store' }); return r.json(); },
    async save(doc, { beacon = false } = {}) {
      const body = JSON.stringify(doc);
      if (beacon && navigator.sendBeacon) navigator.sendBeacon('/api/climb-or-die', new Blob([body], { type: 'application/json' }));
      else await fetch('/api/climb-or-die', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: body.length < 60000 });
    },
    clip(kind, user, text) { fetch('/api/clip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ts: Date.now(), type: kind, user, note: text }) }).catch(() => {}); },
  };
}

/** Ready backend for a serverless (web) build: the board lives in localStorage under `key`; clips are a no-op. */
export function localStorageBackend(key = 'climb-or-die-board') {
  return {
    async load() { return JSON.parse(localStorage.getItem(key) || 'null'); },
    async save(doc) { localStorage.setItem(key, JSON.stringify(doc)); }, // sync inside: survives beforeunload
    clip() {},
  };
}

/** opts.storage = injectable backend (see above). Without one: remoteBackend() in a browser, nothing headless. */
export function createStore({ remote = typeof window !== 'undefined' && typeof fetch === 'function', storage } = {}) {
  const backend = storage || (remote ? remoteBackend() : null);
  let base = emptyDoc();
  let loaded = !backend;
  const st = {
    get base() { return base; },
    get loaded() { return loaded; },
    get backend() { return backend; },
    async load() {
      if (!backend) return base;
      try { const d = await backend.load(); if (d && d.viewers) base = d; } catch (e) { /* offline / empty: start empty */ }
      loaded = true;
      return base;
    },
    /** Fold a merged doc into base (new session: the finished session's deltas stay on the board). */
    adopt(doc) { base = strip(doc); },
    /** base + session deltas -> full doc. */
    merged(session, sessionSummits, bestRunSec) {
      const doc = { version: 1, summits: (base.summits || 0) + sessionSummits, bestRunSec: base.bestRunSec, viewers: {} };
      if (bestRunSec != null && (doc.bestRunSec == null || bestRunSec < doc.bestRunSec)) doc.bestRunSec = Math.round(bestRunSec);
      for (const [id, v] of Object.entries(base.viewers || {})) doc.viewers[id] = { ...v };
      for (const [id, s] of session) {
        const v = doc.viewers[id] || { name: s.name, team: s.team || 'help', metersGiven: 0, metersTaken: 0, knockdowns: 0, summitsAssisted: 0, revengesSuffered: 0, coinsHelp: 0, coinsSab: 0, title: null, firstSeen: today(), lastSeen: today() };
        v.name = s.name; if (s.team) v.team = s.team;
        if (s.platform && s.platform !== 'tiktok') v.platform = s.platform; // one board for every platform; the badge tells them apart
        for (const k of ['metersGiven', 'metersTaken', 'knockdowns', 'summitsAssisted', 'revengesSuffered', 'coinsHelp', 'coinsSab']) v[k] = Math.round(((v[k] || 0) + (s[k] || 0)) * 10) / 10;
        v.lastSeen = today();
        doc.viewers[id] = v;
      }
      let mw = null; for (const [id, v] of Object.entries(doc.viewers)) if (v.metersTaken > 0 && (!mw || v.metersTaken > doc.viewers[mw].metersTaken)) mw = id;
      for (const [id, v] of Object.entries(doc.viewers)) { const t = titleFor(v, mw, id); v.title = t ? TITLES[t].name : null; v._t = t; }
      doc.mostWanted = mw;
      return doc;
    },
    save(doc, { beacon = false } = {}) {
      if (!backend || !loaded) return;
      try { Promise.resolve(backend.save(strip(doc), { beacon })).catch(() => {}); } catch (e) { /* ignore */ }
    },
    clip(type, user, note) {
      if (!backend || !backend.clip) return;
      try { backend.clip(type, user, note); } catch (e) { /* ignore */ }
    },
  };
  return st;
}
