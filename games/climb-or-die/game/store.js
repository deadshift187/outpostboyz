// Persistent leaderboard (spec section 4). WEB EDITION: the doc lives in this browser's
// localStorage (no server); the game keeps base (loaded once) + this session's
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
const emptyDoc = () => ({ version: 1, summits: 0, bestRunSec: null, viewers: {} });

export function titleFor(v, mostWantedId, id) {
  const sabTitle = mostWantedId === id && v.metersTaken > 0 ? 'wanted' : v.knockdowns >= 25 ? 'bot' : v.knockdowns >= 5 ? 'gremlin' : null;
  const helpTitle = v.metersGiven >= 1000 ? 'legend' : v.metersGiven >= 250 ? 'rope' : v.metersGiven >= 50 ? 'scrapper' : null;
  return v.team === 'sab' ? sabTitle || helpTitle : helpTitle || sabTitle;
}

const KEY = 'climb-or-die-board';
const ls = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } };

export function createStore({ remote = !!ls() } = {}) {
  let base = emptyDoc();
  let loaded = !remote;
  const st = {
    get base() { return base; },
    get loaded() { return loaded; },
    async load() {
      if (!remote) return base;
      try { const d = JSON.parse(ls().getItem(KEY) || 'null'); if (d && d.viewers) base = d; } catch (e) { /* blocked or corrupt: start empty */ }
      loaded = true;
      return base;
    },
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
    save(doc) {
      if (!remote || !loaded) return;
      const clean = { ...doc, viewers: Object.fromEntries(Object.entries(doc.viewers).map(([id, v]) => { const { _t, ...rest } = v; return [id, rest]; })) };
      delete clean.mostWanted;
      try { ls().setItem(KEY, JSON.stringify(clean)); } catch (e) { /* quota / private mode: ignore */ }
    },
    clip() { /* web edition: no replay-buffer markers */ },
  };
  return st;
}
