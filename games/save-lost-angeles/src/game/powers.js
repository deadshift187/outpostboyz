// POWERS — Saint's five power crystals, Mario rules (a power soaks exactly one hit; player.hurt calls end()).
//   gold  = GOLD RUSH   : STAR — timed invincibility, plough through enemies/fires (8 s)
//   grow  = BIG BOY     : bigger art + hitbox (p.big 1.6), stronger stomp (one-shots 2-hit foes), breaks
//                         stucco blocks, stomps out fires by walking into them; persists until hit
//   blast = CRYSTAL BLAST: hold FIRE to auto-fire free shards (LA.shootHeld); persists until hit
//   vibes = GOOD VIBES  : crystal magnet (150 px); persists until hit
//   chill = CHILL       : the world runs at 0.3 speed (S.fx.slow) — timed (7 s) so the game never crawls
// Also hosts LA.gp — tiny shared helpers for the gameplay files (offscreen art cache, target lookup).
(function () {
  'use strict';
  const LA = window.LA, K = LA.K;
  const GP = LA.gp = LA.gp || {};
  const P = LA.CONTENT.POWERS;
  const TIMED = { gold: 1, chill: 1 };
  const GROW = 1.6;
  const M_GROW = { speed: 1, jump: 1.12, grav: 1 }, M_GOLD = { speed: 1.12, jump: 1.04, grav: 1 };

  // ---------- shared helpers ----------
  // cached procedural art: draws once at 2x into an offscreen canvas; returns {cv,w,h} (logical size)
  const artCache = {};
  GP.cache = function (key, w, h, fn) {
    let c = artCache[key]; if (c) return c;
    const cv = document.createElement('canvas'); cv.width = Math.ceil(w * 2); cv.height = Math.ceil(h * 2);
    const g = cv.getContext('2d'); g.scale(2, 2); g.lineJoin = 'round'; g.lineCap = 'round';
    try { fn(g, w, h); } catch (e) { console.error('[gp art]', key, e); }
    c = artCache[key] = { cv, w, h }; return c;
  };
  GP.blit = function (ctx, c, x, y, w, h) { ctx.drawImage(c.cv, x, y, w == null ? c.w : w, h == null ? c.h : h); };
  // closest live player to a world x (no allocation)
  GP.target = function (S, x) {
    let best = null, bd = 1e9;
    for (const p of S.players) { if (!p.active || p.ghost) continue; const d = Math.abs(p.x + p.w / 2 - x); if (d < bd) { bd = d; best = p; } }
    return best;
  };
  GP.sfx = (n, o) => { try { LA.audio && LA.audio.sfx && LA.audio.sfx(n, o); } catch (e) { /* audio must never break play */ } };
  GP.art = (S, keys) => { if (!S.art || typeof S.art.add !== 'function') S.art = new Set(S.art || []); for (const k of [].concat(keys)) if (k) S.art.add(k); };
  GP.rr = function (g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  GP.text = function (g, txt, x, y, size, fill, stroke, lw) {
    g.font = 'bold ' + size + 'px ' + (LA.FONT || 'system-ui'); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = lw || 3; g.strokeStyle = stroke || '#191921'; g.strokeText(txt, x, y); g.fillStyle = fill; g.fillText(txt, x, y);
  };

  // ---------- illustrated ITEM art override (see ITEM-ART.md) ----------
  // Same contract as bossArt.castKey: a key 'item'+Name only counts when it exists in LA.SPRITES (so a
  // missing sprite never triggers a request / 404). Until the image has decoded, draw() returns false and
  // the caller falls through to its original code drawing. Images are pre-scaled ONCE per draw size into a
  // cached 2x canvas with smooth downscaling (the game runs imageSmoothingEnabled=false; big pixel-art
  // sources would alias badly if drawn straight down to 36 px) — no per-frame allocation.
  const IT = LA.items = LA.items || {};
  const itCache = {};
  let itKeys = null;
  IT.key = (name) => { const k = 'item' + name; return LA.SPRITES && LA.SPRITES[k] ? k : null; };
  IT.has = (name) => !!IT.key(name);
  IT.keys = () => itKeys || (itKeys = Object.keys(LA.SPRITES || {}).filter((k) => /^item[A-Z]/.test(k)));  // for level preload
  IT.scaled = function (name, w, h) {                                // -> canvas (w x h logical, 2x pixels) | null
    const k = IT.key(name); if (!k) return null;
    const ck = k + ':' + w + 'x' + h; if (itCache[ck]) return itCache[ck];
    const im = LA.img(k); if (!im || !im.naturalWidth) return null;
    const s = Math.min(w / im.naturalWidth, h / im.naturalHeight), dw = im.naturalWidth * s, dh = im.naturalHeight * s;
    const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(w * 2)); cv.height = Math.max(1, Math.round(h * 2));
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(im, (w - dw), (h - dh), dw * 2, dh * 2);              // contain-fit, centred ((w-dw)/2 * 2)
    return (itCache[ck] = cv);
  };
  // draw item art contained in the box (x,y,w,h); returns false (draw nothing) when there's no art yet
  IT.draw = function (ctx, name, x, y, w, h) {
    const c = IT.scaled(name, w, h); if (!c) return false;
    ctx.drawImage(c, x, y, w, h); return true;
  };

  function shrink(p) {
    const dh = p.h - K.HERO_H, dw = p.w - K.HERO_W;
    p.y += dh; p.x += dw / 2; p.w = K.HERO_W; p.h = K.HERO_H; p.big = 1;
  }
  function sanitize(p) { if (p.power !== 'grow' && (p.h !== K.HERO_H || p.w !== K.HERO_W || p.big !== 1)) shrink(p); }
  function updateSlow(S) {
    let chill = false;
    for (const p of S.players) if (p.active && !p.ghost && p.power === 'chill') chill = true;
    if (chill) { S.fx.slow = 0.3; S._gpSlow = true; }
    else if (S._gpSlow) { S.fx.slow = 1; S._gpSlow = false; }
  }

  const powers = LA.powers = {
    keys: Object.keys(P),
    def: (k) => P[k],
    give(S, p, k) {
      if (!P[k] || !p || p.ghost) return;
      if (p.power) powers.end(S, p, 'swap');
      p.power = k; p.powerT = P[k].dur; p.powerDur = P[k].dur; p.powerTimed = !!TIMED[k];
      if (k === 'grow') {
        const nw = Math.round(K.HERO_W * GROW), nh = Math.round(K.HERO_H * GROW);
        p.y -= nh - p.h; p.x -= (nw - p.w) / 2; p.w = nw; p.h = nh; p.big = GROW;
      }
      LA.pop(S, p.x + p.w / 2, p.y - 26, P[k].n + '!', P[k].col, true);
      GP.sfx('power', { k, p: p.idx });
      if (k === 'chill') updateSlow(S);
      LA.emit('power', { S, p, k });
    },
    end(S, p, reason) {
      const k = p.power; if (!k) { sanitize(p); return; }
      p.power = null; p.powerT = 0; p.powerTimed = false;
      if (k === 'grow') shrink(p);
      if (reason === 'time') { LA.pop(S, p.x + p.w / 2, p.y - 24, P[k].n + ' OVER', '#9aa4bd'); GP.sfx('powerdown', { p: p.idx }); }
      updateSlow(S);
    },
    mods(S, p) { sanitize(p); return p.power === 'grow' ? M_GROW : p.power === 'gold' ? M_GOLD : null; },
    invincible(S, p) { return p.power === 'gold'; },
    glow(S, p) {
      const k = p.power; if (!k || k === 'grow') return null;
      if (p.powerTimed && p.powerT < 2 && (S.tick >> 2) % 2) return null;          // expiry warning flicker
      if (k === 'gold') return (S.tick >> 2) % 2 ? '#fff3b0' : '#ffc23a';
      return P[k].col;
    },
    // called every tick by the gameplay system entity (real time, not slowed by CHILL)
    tick(S, dt) {
      for (const p of S.players) {
        if (!p.power) continue;
        if (p.ghost || !p.active) { powers.end(S, p, 'death'); continue; }
        if (TIMED[p.power]) { p.powerT -= dt; if (p.powerT <= 0) powers.end(S, p, 'time'); }
      }
      updateSlow(S);
    },
  };
})();
