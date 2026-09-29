// Lazy art streaming. LA.img(key) returns an HTMLImageElement (created on first use) or null
// until decoded. Sizes never depend on load state — LA.dims(key) reads the pre-measured table,
// so the city lays out exactly on frame one. The Level Builder's art swaps/adds are applied here.
(function () {
  'use strict';
  const LA = window.LA;
  const cache = {};

  // builder CUSTOM: 'replace' swaps art for an existing key, 'add' introduces a new key.
  // Both resolve to the baked WebP under assets/custom (dims keyed "@name").
  const alias = {};                      // key -> { src, dimKey }
  for (const c of (LA.BUILDER && LA.BUILDER.custom) || []) {
    const name = c.src.split('/').pop().replace(/\.(webp|png)$/, '');
    alias[c.key] = { src: c.src, dimKey: '@' + name };
  }
  // scenery + ground art from the builder
  const B = LA.BUILDER || {};
  const extra = {
    heli: B.scenery && B.scenery.heli, gondA: B.scenery && B.scenery.gondA,
    gondB: B.scenery && B.scenery.gondB, yacht: B.scenery && B.scenery.yacht,
  };
  for (const k in extra) if (extra[k]) alias[k] = { src: extra[k], dimKey: '@' + extra[k].split('/').pop().replace(/\.(webp|png)$/, '') };
  (B.ground || []).forEach((src, i) => { alias['groundTile' + (i || '')] = { src, dimKey: '@' + src.split('/').pop().replace(/\.(webp|png)$/, '') }; });
  (B.groundPins || []).forEach((p) => { const n = p.src.split('/').pop().replace(/\.(webp|png)$/, ''); alias['@' + n] = { src: p.src, dimKey: '@' + n }; });
  (B.decals || []).forEach((d) => { const n = d.src.split('/').pop().replace(/\.(webp|png)$/, ''); alias['@' + n] = { src: d.src, dimKey: '@' + n }; });

  // pages living in a subfolder (tests/) set LA.ASSET_BASE = '../' before loading this file
  const withBase = (s) => (s && !/^(data:|blob:|https?:|\/)/.test(s) ? (LA.ASSET_BASE || '') + s : s);
  function srcOf(key) {
    if (alias[key]) return withBase(alias[key].src);
    return withBase((LA.SPRITES && LA.SPRITES[key]) || null);
  }
  LA.dims = function (key) {
    const a = alias[key];
    const d = (a && LA.DIMS[a.dimKey]) || LA.DIMS[key];
    return d || null;
  };
  LA.hasArt = (key) => !!srcOf(key);

  let pending = 0, loadedCount = 0;
  LA.img = function (key) {
    let e = cache[key];
    if (!e) {
      const src = srcOf(key);
      if (!src) return null;
      const im = new Image();
      e = cache[key] = { im, ok: false };
      pending++;
      im.onload = () => { e.ok = true; pending--; loadedCount++; };
      im.onerror = () => { pending--; console.warn('[art] failed', key, src); };
      im.decoding = 'async';
      im.src = src;
    }
    return e.ok ? e.im : null;
  };
  // Warm a list of keys (e.g. everything in the level being entered). Resolves when all settle.
  LA.preload = function (keys, onProgress) {
    const uniq = Array.from(new Set(keys.filter(srcOf)));
    let done = 0;
    return new Promise((resolve) => {
      if (!uniq.length) return resolve();
      uniq.forEach((k) => {
        LA.img(k);
        const e = cache[k];
        const fin = () => { done++; onProgress && onProgress(done / uniq.length); if (done === uniq.length) resolve(); };
        if (e.ok) fin(); else { e.im.addEventListener('load', fin, { once: true }); e.im.addEventListener('error', fin, { once: true }); }
      });
    });
  };
  // Memory cap: drop decoded city art that isn't in `keep` (a Set). Every image stays cached forever otherwise,
  // which reached ~1 GB of decoded bitmaps by world 5 and crashed the cabinet's WebKit renderer.
  LA.releaseArt = function (keep, only) {
    let n = 0;
    for (const k in cache) {
      if (keep.has(k) || (only && !only.has(k)) || !cache[k].ok) continue;
      cache[k].im.src = ''; delete cache[k]; n++;
    }
    return n;
  };
  LA.artStats = () => {
    let px = 0; for (const k in cache) if (cache[k].ok) px += cache[k].im.naturalWidth * cache[k].im.naturalHeight;
    return { cached: Object.keys(cache).length, pending, loaded: loadedCount, decodedMB: Math.round(px * 4 / 1e6) };
  };

  // draw helper matching Saint's di(): skips silently until the art has decoded
  LA.di = function (ctx, key, x, y, w, h, flip) {
    const im = typeof key === 'string' ? LA.img(key) : key;
    if (!im) return false;
    if (flip) { ctx.save(); ctx.translate(x + w, y); ctx.scale(-1, 1); ctx.drawImage(im, 0, 0, w, h); ctx.restore(); }
    else ctx.drawImage(im, x, y, w, h);
    return true;
  };
})();
