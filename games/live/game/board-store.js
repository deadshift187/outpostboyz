// Shared persistent-board backend for every game except CLIMB OR DIE (which keeps /api/climb-or-die).
//
//   serverBoardBackend(slug) -> { load(), save(doc, {beacon}), clip(kind, user, text), mode, remote }
//
// - The server (the streamer app) owns the board: GET/POST /api/store/<slug> -> <data>/<slug>.json.
// - The web edition (no server, or a server without the route) keeps the board in localStorage '<slug>-board'.
//   Every save is also mirrored there, so a later server-less load still has it.
// - Migration: when the server has never stored this game's board (header X-Store-State: new) but this browser
//   holds one, the browser board is pushed to the server once and used from then on.
// - Leaderboard reset (Setup page): the server wipes its files and broadcasts {t:'reload', resetBoards:true};
//   platform/main.js calls clearLocalBoards() before reloading, and saves are dropped from then on in this page
//   (the goodbye-save of a page that still holds the old board must not write it back).
// Clip markers go to the shared POST /api/clip as '<prefix><kind>'.

export const STORE_URL = (slug) => '/api/store/' + slug;
export const LOCAL_KEY = (slug) => slug + '-board';
const g = typeof globalThis !== 'undefined' ? globalThis : {};

const validDoc = (d) => !!(d && typeof d === 'object' && !Array.isArray(d) && d.version === 1 && d.viewers && typeof d.viewers === 'object' && !Array.isArray(d.viewers));
const hasViewers = (d) => validDoc(d) && Object.keys(d.viewers).length > 0;
function lsGet(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; } }
function lsSet(key, body) { try { localStorage.setItem(key, body); } catch (e) { /* quota / blocked */ } }

/** True once this page was told the boards were reset: it must not save its old board again. */
export const boardsReset = () => !!g.__boardsReset;

/** Called by platform/main.js on {t:'reload', resetBoards:true}: forget every game's browser-held board. */
export function clearLocalBoards() {
  g.__boardsReset = true;
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/-board$/.test(k)) keys.push(k); }
    for (const k of keys) localStorage.removeItem(k);
    return keys;
  } catch (e) { return []; }
}

function postDoc(url, body, beacon) {
  if (beacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
    try { if (navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))) return Promise.resolve(); } catch (e) { /* fall through to fetch */ }
  }
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: body.length < 60000 }).then(() => {}, () => {});
}

export function serverBoardBackend(slug, { clipPrefix = slug + ':' } = {}) {
  const url = STORE_URL(slug), key = LOCAL_KEY(slug);
  let remote = null; // null = not loaded yet, true = the server owns the board, false = localStorage only (web edition)
  return {
    get mode() { return remote ? 'server' : 'local'; },
    get remote() { return remote; },
    async load() {
      let r = null;
      try { r = await fetch(url, { cache: 'no-store' }); } catch (e) { r = null; }
      const d = r && r.ok ? await r.json().catch(() => null) : null;
      if (!validDoc(d)) { remote = false; return lsGet(key); } // no server / no route: web edition
      remote = true;
      const local = lsGet(key);
      if (r.headers.get('X-Store-State') === 'new' && !hasViewers(d) && hasViewers(local) && !boardsReset()) {
        await postDoc(url, JSON.stringify(local), false); // first load against this server: migrate the browser board
        return local;
      }
      return d;
    },
    async save(doc, { beacon = false } = {}) {
      if (boardsReset()) return;
      const body = JSON.stringify(doc);
      lsSet(key, body); // mirror: the web edition / an offline server keeps it
      if (remote) await postDoc(url, body, beacon);
    },
    clip(kind, user, text) {
      try { fetch('/api/clip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ts: Date.now(), type: clipPrefix + kind, user, note: text }) }).catch(() => {}); } catch (e) { /* ignore */ }
    },
  };
}
