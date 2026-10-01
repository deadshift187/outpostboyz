// WEB BUILD of app/game/board-store.js (written by web/tools/sync.mjs): no server, no /api.
// Same exports; every game's board lives in localStorage '<slug>-board'; clip markers are a no-op.
export const STORE_URL = () => null;
export const LOCAL_KEY = (slug) => slug + '-board';
const g = typeof globalThis !== 'undefined' ? globalThis : {};
function lsGet(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; } }
function lsSet(key, body) { try { localStorage.setItem(key, body); } catch (e) { /* quota / blocked */ } }
export const boardsReset = () => !!g.__boardsReset;
export function clearLocalBoards() {
  g.__boardsReset = true;
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/-board$/.test(k)) keys.push(k); }
    for (const k of keys) localStorage.removeItem(k);
    return keys;
  } catch (e) { return []; }
}
export function serverBoardBackend(slug) {
  const key = LOCAL_KEY(slug);
  return {
    get mode() { return 'local'; },
    get remote() { return false; },
    async load() { return lsGet(key); },
    async save(doc) { if (!boardsReset()) lsSet(key, JSON.stringify(doc)); },
    clip() { /* no /api/clip in the web edition */ },
  };
}
