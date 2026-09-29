// src/setpieces/setpieces.js — OWNER: setpieces agent (registry seeded by lead; keep this API).
// def = { init(S, level) -> state, update(S, sp, dt), draw(ctx, S, sp, layer) }
// layers: 'backdrop' (screen, behind world) | 'ground' | 'back' | 'front' (world coords) | 'screen' (after world)
//
// Shared helpers every set-piece uses: art preloading, foe/pickup detection that works with the gameplay
// agent's entities, a common stomp/hurt contact rule, composable no-floor water, range clearing, cached
// offscreen art, bold text pops, and a set-piece audio track wrapper around LA.audio.playFile.
(function () {
  'use strict';
  const LA = window.LA, K = LA.K, GY = K.GY;
  const SP = LA.setpieces = LA.setpieces || { defs: {} };
  SP.register = function (id, def) { SP.defs[id] = def; return def; };

  // ---------- art ----------
  SP.art = function (S, keys) {
    if (!S.art) S.art = new Set();
    for (const k of [].concat(keys)) { if (!k) continue; if (S.art.add) S.art.add(k); else if (S.art.push && S.art.indexOf(k) < 0) S.art.push(k); }
  };
  const canv = {};
  // procedural art is drawn ONCE into an offscreen canvas (never per frame)
  SP.cached = function (key, w, h, paint) {
    let c = canv[key];
    if (!c) {
      c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
      const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.lineJoin = 'round'; x.lineCap = 'round';
      if (paint(x, c.width, c.height) === false) return null;              // painter can bail (art not decoded yet)
      canv[key] = c;
    }
    return c;
  };

  // ---------- players ----------
  SP.live = (S) => S.players.filter((p) => p.active && !p.ghost);
  SP.lead = (S) => LA.game.leader(S);
  SP.banner = (S, a, b, t) => { S.banner = { t: t || 2.4, a, b }; };
  SP.sfx = (name, o) => { try { LA.audio && LA.audio.sfx && LA.audio.sfx(name, o); } catch (e) { /* audio is optional */ } };

  // ---------- entities from other agents ----------
  // gameplay entities: enemies are flagged foe/enemy/hostile (or expose kill()/onShot with a foe-ish kind);
  // pickups flagged pickup (or crystal/gem/power kinds); citizens flagged citizen/folk. Bosses are never touched.
  const FOE_KIND = /foe|enemy|thief|cat|press|cam|hoa|drone|bird|pump|cone|leech|goon|crook|minion/i;
  SP.isFoe = function (e) {
    if (!e || e.dead || e.alive === false || e.defeated || e.ally || e.pickup || e.citizen || e.boss || e.isBoss || e.prop) return false;
    if (e.foe || e.enemy || e.hostile || e.isFoe) return true;
    return !!(e.kind && FOE_KIND.test(e.kind) && (e.onShot || e.kill) && !/crystal|gem|power|pickup|citizen|folk|shot|shard/i.test(e.kind));
  };
  SP.isPickup = (e) => !!e && !e.dead && e.alive !== false && !!(e.pickup || (e.kind && /crystal|gem|power|pickup|coin/i.test(e.kind) && !/shot|shard/i.test(e.kind)));
  SP.isCitizen = (e) => !!e && !e.dead && !!(e.citizen || (e.kind && /citizen|folk|hostage/i.test(e.kind)));
  // knock out an entity: its own kill() > onShot() with a super shard > (force) removal
  SP.kill = function (S, e, how, force) {
    if (!e || e.dead || e.alive === false || e.defeated) return false;
    try {
      if (typeof e.kill === 'function') e.kill(S, how);
      else if (typeof e.onShot === 'function') e.onShot(S, { x: e.x + (e.w || 20) / 2, y: e.y + 4, w: 6, h: 6, vx: 0, vy: 0, dmg: 99, power: how, by: how, setpiece: true, dead: false });
    } catch (err) { /* fall through to forced removal */ }
    if (force && !e.dead && e.alive !== false && !e.defeated) { e.dead = true; e.alive = false; S.stats.kills++; S.run.kills++; }   // (their own kill() counts itself)
    return !!e.dead || e.alive === false || !!e.defeated;
  };

  // shared Mario contact rule for set-piece foes: stomp from above, side contact hurts, star power ploughs.
  // returns 'stomp' | 'plough' | 'hurt' | null.  e.hitCD (ticks) stops a bounce re-triggering next tick.
  SP.contact = function (S, e, p) {
    if (e.hitCD > 0 || e.dead || e.alive === false || e.defeated) return null;
    if (LA.phys.stompedFrom(p, e)) {
      const n = p.bounce(S); e.hitCD = 12;
      S.stats.stomps = (S.stats.stomps || 0) + 1;
      LA.game.score(S, 150 * Math.min(n, 6), e.x + e.w / 2, e.y - 8, '#41ff6b');
      SP.sfx(n > 1 ? 'combo' : 'stomp', { combo: n });
      return 'stomp';
    }
    if (LA.powers && LA.powers.invincible && LA.powers.invincible(S, p)) { e.hitCD = 12; LA.game.score(S, 200, e.x + e.w / 2, e.y - 8, '#ffc23a'); return 'plough'; }
    if (p.hurt(S, e.kind)) return 'hurt';
    return null;
  };

  // ---------- world edits ----------
  // several set-pieces can own water in the Full City Run: compose them into one S.water(cx)
  SP.addWater = function (S, fn) {
    if (!S._spWater) { S._spWater = []; if (typeof S.water === 'function') S._spWater.push(S.water); }
    S._spWater.push(fn);
    const fns = S._spWater;
    S.water = function (cx) { for (let i = 0; i < fns.length; i++) if (fns[i](cx)) return true; return false; };
  };
  // wipe placed content from a stretch a set-piece owns (enemies, hazards, potholes, hurdles); walls stay
  SP.clearRange = function (S, x0, x1, pred) {
    for (const e of S.ents) { const ex = e.x || 0, ew = e.w || 0; if (ex + ew > x0 && ex < x1 && (!pred || pred(e))) { e.dead = true; e.alive = false; } }
    S.potholes = S.potholes.filter((x) => x + K.PIT_X + K.PIT_W < x0 || x + K.PIT_X > x1);
    S.solids = S.solids.filter((s) => s.kind === 'wall' || s.x + s.w < x0 || s.x > x1);
  };
  // guarantee solid street over [x0,x1] (merges spans so pits there are filled)
  SP.fillGround = function (S, x0, x1) {
    const all = S.ground.map((g) => ({ x: g.x, w: g.w })).concat([{ x: x0, w: x1 - x0 }]).sort((a, b) => a.x - b.x), out = [];
    for (const g of all) { const l = out[out.length - 1]; if (l && g.x <= l.x + l.w) l.w = Math.max(l.w, g.x + g.w - l.x); else out.push(g); }
    S.ground = out;
  };
  // world x where a storefront (parallax 0.45) sits "behind" a street object when both are mid-screen
  SP.visualX = function (key, vw) {
    const t = LA.city.tile(key); if (!t) return null;
    const e = LA.city.edit(key) || {}, V = vw || 700, c = t.x + (e.dx || 0) + t.w * (e.sc || 1) / 2;
    return (c - V / 2) / K.BG_PAR + V / 2;
  };
  SP.inLevel = (lv, x, pad) => x != null && x >= lv.x0 - (pad || 0) && x <= lv.x1 + (pad || 0);

  // ---------- drawing ----------
  SP.text = function (ctx, txt, x, y, size, fill, align, stroke) {
    ctx.font = 'bold ' + size + 'px ' + LA.FONT; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, size / 5); ctx.strokeStyle = stroke || '#1a1020';
    ctx.strokeText(txt, x, y); ctx.fillStyle = fill || '#fff'; ctx.fillText(txt, x, y);
  };
  // comic speech bubble (world coords), tail pointing down at (x, y)
  SP.bubble = function (ctx, txt, x, y, col, size) {
    size = size || 11; ctx.font = 'bold ' + size + 'px ' + LA.FONT;
    const w = ctx.measureText(txt).width + 14, h = size + 10, bx = Math.round(x - w / 2), by = Math.round(y - h - 8);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1a1020'; ctx.lineWidth = 2.5;
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx, by, w, h, 6); else ctx.rect(bx, by, w, h);
    ctx.moveTo(x - 5, by + h); ctx.lineTo(x, y - 1); ctx.lineTo(x + 5, by + h); ctx.fill(); ctx.stroke();
    ctx.fillRect(x - 4, by + h - 3, 8, 4);
    ctx.fillStyle = col || '#1a1020'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x, by + h / 2 + 0.5);
  };
  // draw a sprite anchored bottom-centre at (x, base), height h, facing dir (+1 = art's own facing)
  SP.sprite = function (ctx, key, x, base, h, flip, rot) {
    const im = LA.img(key); if (!im) return false;
    const w = h * im.naturalWidth / im.naturalHeight;
    if (!flip && !rot) { ctx.drawImage(im, Math.round(x - w / 2), Math.round(base - h), Math.round(w), Math.round(h)); return true; }
    ctx.save(); ctx.translate(Math.round(x), Math.round(base)); if (rot) ctx.rotate(rot); if (flip) ctx.scale(-1, 1);
    ctx.drawImage(im, -w / 2, -h, w, h); ctx.restore(); return true;
  };

  // ---------- set-piece audio (a song that pauses/resumes, e.g. the Venice concert) ----------
  // Wraps LA.audio.playFile(url,{loop,volume,at}) without assuming the handle's shape: it may be an
  // HTMLAudioElement-like object (play/pause/volume/currentTime) or a custom handle (setVolume/stop/...).
  const tracks = [];
  SP.track = function (url, opts) {
    opts = opts || {};
    const T = { url, pos: opts.at || 0, vol: 0, want: false, h: null, dead: false, t0: 0, owner: LA.game.S };
    const apply = () => { const h = T.h; if (!h) return; try { if (typeof h.setVolume === 'function') h.setVolume(T.vol); else if ('volume' in h) h.volume = T.vol; } catch (e) { /* ignore */ } };
    T.volume = (v) => { v = LA.clamp(v, 0, 1); if (Math.abs(v - T.vol) < 0.004) return; T.vol = v; apply(); };
    T.play = () => {
      if (T.dead || T.want) return; T.want = true; T.t0 = LA.now();
      const h = T.h;
      if (h) {
        try {
          const el = typeof h.resume === 'function' || typeof h.play === 'function' ? null : h.el;   // LA.audio handles expose the element
          if (typeof h.resume === 'function') h.resume();
          else { const r = typeof h.play === 'function' ? h.play() : el && el.play ? el.play() : null; if (r && r.catch) r.catch(() => {}); }
        } catch (e) { /* ignore */ }
        apply(); return;
      }
      const A = LA.audio; if (!A || typeof A.playFile !== 'function') return;
      try { T.h = A.playFile(url, { loop: !!opts.loop, volume: T.vol, at: T.pos }) || null; } catch (e) { T.h = null; }
      apply();
    };
    T.pause = () => {
      if (!T.want) return; T.want = false;
      const h = T.h; if (!h) return;
      try {
        if (typeof h.pause === 'function') h.pause();
        else if (h.el && typeof h.el.pause === 'function') h.el.pause();
        else { T.pos = (typeof h.currentTime === 'number') ? h.currentTime : T.pos + (LA.now() - T.t0) / 1000; if (typeof h.stop === 'function') h.stop(); T.h = null; }
      } catch (e) { /* ignore */ }
    };
    T.stop = () => {
      T.dead = true; T.want = false; const h = T.h; T.h = null;
      if (h) try { if (typeof h.stop === 'function') h.stop(); else if (typeof h.pause === 'function') h.pause(); } catch (e) { /* ignore */ }
    };
    tracks.push(T);
    return T;
  };
  const stopTracks = (keep) => { for (let i = tracks.length - 1; i >= 0; i--) { const T = tracks[i]; if (keep && T.owner === keep) continue; T.stop(); tracks.splice(i, 1); } };
  SP.stopTracks = stopTracks;
  LA.on('levelClear', () => stopTracks(null));
  LA.on('gameOver', () => stopTracks(null));
  LA.on('scene', (name) => stopTracks(name === 'level' ? LA.game.S : null));
  LA.on('levelStart', (S) => stopTracks(S));
  // overlays (pause) freeze the level: hold every song while one is up, resume when it closes
  SP.holdForOverlay = () => { const up = LA.scenes && LA.scenes.stack && LA.scenes.stack.length > 0; if (up) for (const T of tracks) if (T.want) { T.pause(); T._held = true; } return up; };
  SP.resumeHeld = () => { for (const T of tracks) if (T._held) { T._held = false; T.play(); } };
})();
