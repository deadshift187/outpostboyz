// Outpost Boyz service worker — installable, offline-capable arcade.
//
//  * HTML / navigations / JSON  -> NETWORK-FIRST (updates ship the moment you're online),
//                                   cached copy when offline.
//  * same-origin static assets   -> CACHE-FIRST (instant), refreshed in the background so the
//                                   next load picks up new builds.
//  * never touched: cross-origin requests (Supabase, CDNs, fonts), Range requests, and
//    audio/video (run-the-board's ~7MB of .mp3 clips stay network-only; offline it falls back to TTS).
//
// Bump VERSION on a deploy that changes cached assets to drop every old cache on activate.
const VERSION = '2026-09-29f';
const CACHE = 'ob-arcade-' + VERSION;

// Precached on install so every free game plays offline after the first visit.
const PRECACHE = [
  '/',
  '/games/games.json',
  '/assets/style.css',
  '/assets/ob-sdk.js',
  '/assets/fonts/archivo-black-latin.woff2',
  '/assets/fonts/inter-latin-var.woff2',
  '/manifest.webmanifest',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/icon-512-maskable.png',
  '/assets/icons/apple-touch-icon.png',
  '/download/',
  '/games/tap-flip/',
  '/games/block-nine/',
  '/games/paper-route/',
  '/games/run-the-board/',
  '/games/run-the-board/questions.json',
  '/games/run-the-board/audio/manifest.json',
  '/games/snowline/',
  '/games/scrap-run/',
  '/games/scrap-run/js/core.js',
  '/games/scrap-run/js/levels.js',
  '/games/scrap-run/js/bosses.js',
  '/games/scrap-run/js/sim.js',
  '/games/scrap-run/js/bot.js',
  '/games/scrap-run/js/audio.js',
  '/games/scrap-run/js/render.js',
  '/games/scrap-run/js/bossgfx.js',
  '/games/scrap-run/js/net.js',
  '/games/scrap-run/js/main.js',
  '/games/climb-or-die/',
  '/games/climb-or-die/main.js',
  '/games/climb-or-die/chat.js',
  '/games/climb-or-die/gifts.json',
  '/games/climb-or-die/platform/gifts.js',
  '/games/climb-or-die/platform/overlay.js',
  '/games/climb-or-die/game/index.js',
  '/games/climb-or-die/game/consts.js',
  '/games/climb-or-die/game/world.js',
  '/games/climb-or-die/game/climber.js',
  '/games/climb-or-die/game/effects.js',
  '/games/climb-or-die/game/input.js',
  '/games/climb-or-die/game/store.js',
  '/games/climb-or-die/game/sfx.js',
  '/games/climb-or-die/game/render.js',
  '/games/climb-or-die/game/art.js',
  '/games/climb-or-die/game/tower-chunks.json',
  '/games/climb-or-die/game/sfx-presets.json'
];

const MEDIA_EXT = /\.(wav|mp3|m4a|aac|ogg|oga|opus|flac|mp4|m4v|webm|mov)$/i;
const DATA_EXT = /\.(json|webmanifest|html?)$/i;

self.addEventListener('install', (e) => {
  self.skipWaiting();
  // Best effort per file: one missing file must not break the install.
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(PRECACHE.map((u) =>
    fetch(new Request(u, { cache: 'reload' }))
      .then((res) => (cacheable(res) ? c.put(u, res) : null))
      .catch(() => null)
  ))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

function cacheable(res) {
  return res && res.ok && res.status === 200 && res.type === 'basic' && !res.redirected;
}

function put(req, res) {
  if (!cacheable(res)) return;
  const copy = res.clone();
  caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => { });
}

// Look up a cached copy, tolerating ?query strings (e.g. ?arcade=1) and /index.html vs /.
async function lookup(req, url) {
  const c = await caches.open(CACHE);
  let hit = await c.match(req) || await c.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const p = url.pathname;
  const alts = [];
  if (p.endsWith('/index.html')) alts.push(p.slice(0, -'index.html'.length));
  else if (p.endsWith('/')) alts.push(p + 'index.html');
  else if (!/\.[a-z0-9]+$/i.test(p)) alts.push(p + '/');
  for (const a of alts) {
    hit = await c.match(a, { ignoreSearch: true });
    if (hit) return hit;
  }
  return null;
}

function offlinePage() {
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline — Outpost Boyz</title>' +
    '<style>html,body{margin:0;height:100%;background:#000;color:#fff;font-family:system-ui,sans-serif}' +
    'main{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;box-sizing:border-box}' +
    'h1{font-size:28px;letter-spacing:-1px;margin:0 0 10px;text-transform:uppercase}p{color:#aaa;max-width:340px;line-height:1.5;margin:0 0 20px}' +
    'a{color:#000;background:#39ff14;font-weight:900;text-decoration:none;padding:12px 20px;border-radius:4px 4px 14px 14px;letter-spacing:1px}</style></head>' +
    '<body><main><h1>You\'re offline</h1><p>This page hasn\'t been saved to your device yet. Any game you\'ve opened before still plays offline.</p>' +
    '<a href="/">BACK TO THE ARCADE</a></main></body></html>';
  return new Response(html, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;           // never cache cross-origin
  if (req.headers.has('range')) return;                       // never cache partial content
  const dest = req.destination;
  if (dest === 'audio' || dest === 'video' || dest === 'track' || MEDIA_EXT.test(url.pathname)) return;
  if (url.pathname === '/sw.js') return;
  // ~130MB of art + ~45MB phone art: leave it to the HTTP cache. (The paid game's CODE never touches this
  // worker: it comes from Supabase, cross-origin, and runs from a blob: URL - neither is ever cached.)
  if (/^\/games\/save-lost-angeles\/assets(-m)?\//.test(url.pathname)) return;

  const accept = req.headers.get('accept') || '';
  const isDoc = req.mode === 'navigate' || dest === 'document' || dest === 'iframe' ||
    accept.includes('text/html') || DATA_EXT.test(url.pathname) || url.pathname.endsWith('/') ||
    /\.(js|css)$/i.test(url.pathname);   // code too: a new page must never run against last deploy's scripts

  if (isDoc) {
    // Network-first.
    e.respondWith(
      // 'no-cache' = always ask the server (a cheap 304 when unchanged), so the 10-minute
      // GitHub Pages max-age can't serve the previous deploy right after a push.
      fetch(new Request(req, { cache: 'no-cache' }))
        .then((res) => { put(req, res); return res; })
        .catch(async () => {
          const hit = await lookup(req, url);
          if (hit) return hit;
          if (req.mode === 'navigate' || dest === 'document') return offlinePage();
          return Response.error();
        })
    );
    return;
  }

  // Cache-first for static assets, with a quiet background refresh.
  e.respondWith((async () => {
    const hit = await lookup(req, url);
    const refresh = fetch(req).then((res) => { put(req, res); return res; });
    if (hit) {
      e.waitUntil(refresh.catch(() => { }));
      return hit;
    }
    try { return await refresh; } catch (_) { return Response.error(); }
  })());
});
