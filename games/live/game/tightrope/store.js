// TIGHTROPE persistent leaderboard. Same model as CLIMB OR DIE's store (base loaded once +
// this session's deltas, so every save is idempotent), with TIGHTROPE's own fields and titles.
// Backends: { load(): Promise<doc|null>, save(doc, {beacon}), clip(kind, user, text) }.
// The default browser backend is the platform board GET/POST /api/store/tightrope (../board-store.js);
// without a server (web edition) localStorage 'tightrope-board'. Rewards are cosmetic only.
import { PAL } from './consts.js';
import { serverBoardBackend } from '../board-store.js';

export const TITLES = {
  legend: { name: 'Skyline Legend', prefix: 'LEGEND', color: '#FFE66D' },
  walker: { name: 'Rope Walker', prefix: 'ROPE', color: PAL.sodium },
  spotter: { name: 'Spotter', prefix: 'SPOT', color: '#9CF7EA' },
  wanted: { name: 'MOST WANTED', prefix: 'WANTED', color: '#FF2E2E' },
  wrecker: { name: 'Wrecker', prefix: 'WRECK', color: '#C58CFF' },
  gust: { name: 'Gust', prefix: 'GUST', color: '#FF9A7A' },
};
const today = () => new Date().toISOString().slice(0, 10);
const KEYS = ['metersGiven', 'saves', 'falls', 'dropM', 'revengesSuffered', 'coinsHelp', 'coinsSab'];
const emptyDoc = () => ({ version: 1, game: 'tightrope', summits: 0, bestRunSec: null, bestScore: 0, runs: [], viewers: {} });
const strip = (doc) => {
  const clean = { ...doc, viewers: Object.fromEntries(Object.entries(doc.viewers || {}).map(([id, v]) => { const { _t, ...rest } = v; return [id, rest]; })) };
  delete clean.mostWanted;
  return clean;
};
export function titleFor(v, mostWantedId, id) {
  const sab = mostWantedId === id && v.dropM > 0 ? 'wanted' : v.falls >= 15 ? 'wrecker' : v.falls >= 3 ? 'gust' : null;
  const help = v.metersGiven >= 1000 ? 'legend' : v.metersGiven >= 250 ? 'walker' : v.metersGiven >= 50 ? 'spotter' : null;
  return v.team === 'sab' ? sab || help : help || sab;
}

const LS_KEY = 'tightrope-board';
export function localStorageBackend(key = LS_KEY) {
  return {
    async load() { return JSON.parse(localStorage.getItem(key) || 'null'); },
    async save(doc) { localStorage.setItem(key, JSON.stringify(doc)); },
    clip() {},
  };
}
/** The platform board (GET/POST /api/store/tightrope, localStorage 'tightrope-board' in the web edition): see ../board-store.js. */
export function hybridBackend() {
  return serverBoardBackend('tightrope', { clipPrefix: 'tightrope:' });
}

export function createStore({ remote = typeof window !== 'undefined' && typeof fetch === 'function', storage } = {}) {
  const backend = storage || (remote ? hybridBackend() : null);
  let base = emptyDoc(), loaded = !backend;
  return {
    get base() { return base; }, get loaded() { return loaded; }, get backend() { return backend; },
    async load() {
      if (!backend) return base;
      try { const d = await backend.load(); if (d && d.viewers) base = { ...emptyDoc(), ...d }; } catch (e) { /* start empty */ }
      loaded = true;
      return base;
    },
    adopt(doc) { base = strip(doc); },
    /** base + session deltas -> full doc. runs = this session's finished runs. */
    merged(session, sessionSummits, bestRunSec, runs = []) {
      const doc = { version: 1, game: 'tightrope', summits: (base.summits || 0) + sessionSummits, bestRunSec: base.bestRunSec ?? null, bestScore: base.bestScore || 0, runs: [], viewers: {} };
      if (bestRunSec != null && (doc.bestRunSec == null || bestRunSec < doc.bestRunSec)) doc.bestRunSec = Math.round(bestRunSec);
      doc.runs = [...(base.runs || []), ...runs].sort((a, b) => b.score - a.score).slice(0, 10);
      for (const r of doc.runs) doc.bestScore = Math.max(doc.bestScore, r.score);
      for (const [id, v] of Object.entries(base.viewers || {})) doc.viewers[id] = { ...v };
      for (const [id, s] of session) {
        const v = doc.viewers[id] || { name: s.name, team: s.team || 'help', metersGiven: 0, saves: 0, falls: 0, dropM: 0, revengesSuffered: 0, coinsHelp: 0, coinsSab: 0, title: null, firstSeen: today(), lastSeen: today() };
        v.name = s.name; if (s.team) v.team = s.team;
        if (s.platform && s.platform !== 'tiktok') v.platform = s.platform;
        for (const k of KEYS) v[k] = Math.round(((v[k] || 0) + (s[k] || 0)) * 10) / 10;
        v.lastSeen = today();
        doc.viewers[id] = v;
      }
      let mw = null; for (const [id, v] of Object.entries(doc.viewers)) if (v.dropM > 0 && (!mw || v.dropM > doc.viewers[mw].dropM)) mw = id;
      for (const [id, v] of Object.entries(doc.viewers)) { const t = titleFor(v, mw, id); v.title = t ? TITLES[t].name : null; v._t = t; }
      doc.mostWanted = mw;
      return doc;
    },
    save(doc, { beacon = false } = {}) { if (!backend || !loaded) return; try { Promise.resolve(backend.save(strip(doc), { beacon })).catch(() => {}); } catch (e) { /* ignore */ } },
    clip(type, user, note) { if (!backend || !backend.clip) return; try { backend.clip(type, user, note); } catch (e) { /* ignore */ } },
  };
}
