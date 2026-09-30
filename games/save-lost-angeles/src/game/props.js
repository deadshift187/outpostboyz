// PROPS + VERTICALITY
//   prop   Saint's street clutter (PROP_H × PROP_SCALE 1.5, sunk 7 px into the lip; a few keys re-scaled below). HURDLE keys are solid and
//          harmless (his syncHurdles box: 84% width, height capped at 96 so nothing becomes a wall); the rest
//          are scenery. grill3 = seized BBQ hurdle (44x46, box 34x46).
//   plat   one-way platforms in LA flavor, drawn in code (bold outlines, saturated fills), cached offscreen:
//          'awning' street-market canopy · 'scaffold' construction scaffolding · 'shelter' bus-shelter roof ·
//          'billboard' catwalk under a satire billboard. Every structure stands on posts down to the street.
//   block  bump-from-below blocks: 'q' = PACKAGE crate (crystal / multi-crystal / power gem / 1UP),
//          'brick' = stucco (BIG BOY smashes it), 'hidden' = invisible until you jump into it (secret 1UP).
(function () {
  'use strict';
  const LA = window.LA, K = LA.K, GY = K.GY, GP = LA.gp;
  const PROP_SCALE = 1.5, PROP_SINK = 7, HURDLE = new Set(LA.CONTENT.HURDLE);
  // Real-world scale pass (hero draws 56×1.294 ≈ 72 px ≈ 1.75 m → ~41 px/m). Saint's PROP_H put a volleyball
  // net at 87 px (net tape at 0.7× the hero — should be ~1.3×) and made meters / news boxes / barricades as tall
  // as the hero. Only these keys are re-sized; everything else keeps his numbers.
  //   net 104 → 156 px (net tape ≈ 93 px ≈ 2.3 m) · meter/boxA 38 → 57 px (≈1.4 m) · dsNewsBox 41 → 62 px (Saint
  //   playtest: 54 read "too small" — the 3-box cluster now stands ≈0.8× the hero, aspect kept)
  //   dsBallMachine 30 → 45 → 41 → 62 px (Saint playtest: "too small" — ≈0.85× the hero; it's now a HAZARD, hazards.js
  //   'ballMachine', populate places that instead of the old harmless hurdle prop) · obBarricade 34 → 51 px · obBelt 34 → 51 px
  const PROP_H = Object.assign({}, LA.CONTENT.PROP_H, { net: 104, meter: 38, boxA: 38, dsNewsBox: 41, dsBallMachine: 41, obBarricade: 34, obBelt: 34 });
  const O = '#191921';
  LA.gameplay = LA.gameplay || {};
  LA.gameplay.PROP_H = PROP_H;

  // Context: beach-only props never spawn inland, city-only props never on the sand (populate.js applies it).
  LA.gameplay.BEACH_ONLY = new Set(['net']);
  LA.gameplay.CITY_ONLY = new Set(['obBelt', 'obBoom', 'obContainer', 'dsTopiary', 'dsBallMachine', 'obFountain', 'boxA']);
  const BEACH_Z = /VENICE|SANTA MONICA|MALIBU|MANHATTAN BEACH|REDONDO|MARINA DEL REY/;
  LA.gameplay.isBeachZone = (zi) => { const z = LA.city.zones && LA.city.zones[zi]; return !!(z && z.sea && BEACH_Z.test(z.n || '')); };

  // ---------------- props ----------------
  function propDims(k) {
    if (k === 'grill3') return [44, 46];
    const ph = Math.round((PROP_H[k] || 58) * PROP_SCALE), d = LA.dims(k);
    return [d ? Math.round(ph * d[0] / d[1]) : 26, ph];
  }
  LA.gameplay.propDims = propDims;
  LA.gameplay.isHurdle = (k) => k === 'grill3' || (HURDLE.has(k) && propDims(k)[1] <= 140);
  LA.ents.define('prop', (o, S) => {
    const k = o.k, [pw, ph] = propDims(k);
    const e = { k, x: o.x, y: k === 'grill3' ? GY - ph : GY - ph + PROP_SINK, w: pw, h: ph, layer: 'back', art: [k], drawW: pw, flip: !!o.flip };
    if (LA.gameplay.isHurdle(k)) {
      let s;
      if (k === 'grill3') s = { x: e.x + 5, y: GY - 46, w: 34, h: 46, kind: 'hurdle' };
      else { const bw = Math.max(14, pw * 0.84), bh = Math.min(ph, 96); s = { x: e.x + pw / 2 - bw / 2, y: e.y + ph - bh, w: bw, h: bh, kind: 'hurdle' }; }
      S.solids.push(s); e.solid = s;
    }
    e.draw = function (ctx) { LA.di(ctx, (SHARPEN[k] && sharpArt(k)) || k, this.x, this.y, this.w, this.h, this.flip); };
    return e;
  });
  // Low-res sources blown up by the scale pass read "out of focus" (net: Saint's source is only 161×96, drawn
  // 262×156 = 1.63× before screen scale; his original PNG is the same size — needs regenerated art). Until then
  // they get a one-time unsharp mask (σ≈1, amount below) on an offscreen copy at native size, then draw
  // nearest-neighbour like everything else. Built once when the image decodes — never per frame.
  const SHARPEN = {}, sharpCache = {};                                 // net: regenerated at 540px (opus-art.js), no longer needed
  function sharpArt(k) {
    if (k in sharpCache) return sharpCache[k];
    const im = LA.img(k); if (!im) return null;
    let out = null;
    try {
      const w = im.naturalWidth, h = im.naturalHeight, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const g = cv.getContext('2d'); g.drawImage(im, 0, 0);
      const id = g.getImageData(0, 0, w, h), d = id.data, src = new Float32Array(d), tmp = new Float32Array(w * h * 4), K5 = [1, 4, 6, 4, 1];
      const blur = (from, to, dx, dy) => {                            // alpha-weighted separable [1 4 6 4 1] blur
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          let r = 0, gg = 0, b = 0, ws = 0, as = 0;
          for (let t = -2; t <= 2; t++) {
            const xx = Math.min(w - 1, Math.max(0, x + t * dx)), yy = Math.min(h - 1, Math.max(0, y + t * dy)), i = (yy * w + xx) * 4;
            const a = from[i + 3] * K5[t + 2]; r += from[i] * a; gg += from[i + 1] * a; b += from[i + 2] * a; ws += a; as += from[i + 3] * K5[t + 2];
          }
          const o = (y * w + x) * 4;
          if (ws > 0) { to[o] = r / ws; to[o + 1] = gg / ws; to[o + 2] = b / ws; } else { to[o] = from[o]; to[o + 1] = from[o + 1]; to[o + 2] = from[o + 2]; }
          to[o + 3] = as / 16;
        }
      };
      const bl = new Float32Array(w * h * 4); blur(src, tmp, 1, 0); blur(tmp, bl, 0, 1);
      const amt = SHARPEN[k];
      for (let i = 0; i < d.length; i += 4) {
        if (!src[i + 3]) continue;
        for (let c = 0; c < 3; c++) { const diff = src[i + c] - bl[i + c]; if (Math.abs(diff) > 2) d[i + c] = Math.max(0, Math.min(255, src[i + c] + diff * amt)); }
      }
      g.putImageData(id, 0, 0); out = cv;
    } catch (err) { out = null; }
    return (sharpCache[k] = out);
  }

  // ---------------- one-way platforms ----------------
  const AWN = [['#e2363f', '#fff4e0'], ['#2e8fd8', '#fff4e0'], ['#2f9e5e', '#fff4e0'], ['#ff9f2e', '#fff4e0'], ['#8a5ad4', '#fff4e0'], ['#ff6fae', '#fff4e0']];
  const BILLS = [
    ['LUXURY STUDIO', '$4,200/mo · no windows', '#ffe36a', '#1b2a44'],
    ['EVERYWHERE', '$20 SMOOTHIE · now $24', '#1b1b1b', '#bfe36a'],
    ['FREE STRESS TEST', 'no strings attached*', '#fff', '#2b5fa8'],
    ['TWZ', 'we saw that.', '#fff', '#c01f2e'],
    ['GOV. NEWSCUM', 'trust the process', '#ffe36a', '#223a7a'],
    ['PERMIT PENDING', 'since 1998', '#1b1b1b', '#ff9f2e'],
    ['BRANDAN 69', 'LIVE TONITE · clout only', '#ff6fae', '#191921'],
    ['CLAIM DENIED', 'THE ADJUSTER · we care', '#fff', '#5a5f6e'],
    ['MAYOR BASURA', 'a clean city*  *terms apply', '#57e08a', '#2a1b3a'],
    ['METRO', 'arriving: eventually', '#fff', '#e0782a'],
    ['LOST ANGELES', 'you\'ll never leave', '#ffc23a', '#10141f'],
  ];
  LA.gameplay.BILLS = BILLS;
  function platArt(style, w, gh, v) {
    const key = style + '|' + w + '|' + gh + '|' + v;
    if (style === 'awning') return GP.cache(key, w, gh + 4, (g) => {
      const pal = AWN[v % AWN.length];
      post(g, 8, 14, gh + 4); post(g, w - 14, 14, gh + 4);
      g.fillStyle = pal[0]; g.fillRect(0, 0, w, 18);
      g.fillStyle = pal[1]; for (let x = 16; x < w; x += 32) g.fillRect(x, 0, 16, 18);
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(0, 0, w, 4);
      g.lineWidth = 3; g.strokeStyle = O; g.strokeRect(1, 1, w - 2, 17);
      for (let x = 0, i = 0; x < w; x += 16, i++) {                  // scalloped valance
        g.fillStyle = i % 2 ? pal[1] : pal[0];
        g.beginPath(); g.moveTo(x, 18); g.arc(x + 8, 18, 8, 0, Math.PI); g.closePath(); g.fill();
        g.lineWidth = 2; g.stroke();
      }
    });
    if (style === 'scaffold') return GP.cache(key, w, gh + 4, (g) => {
      const bays = Math.max(1, Math.round(w / 70)), bw = w / bays;
      g.strokeStyle = '#8c94a3'; g.lineWidth = 2;
      for (let i = 0; i < bays; i++) {                               // X-bracing
        const x0 = i * bw + 4, x1 = (i + 1) * bw - 4;
        for (let y = 12; y < gh - 10; y += 60) { const y1 = Math.min(gh, y + 60); g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y1); g.moveTo(x1, y); g.lineTo(x0, y1); g.stroke(); }
      }
      for (let y = 72; y < gh; y += 60) { g.fillStyle = '#9aa2b0'; g.fillRect(2, y, w - 4, 4); g.lineWidth = 1.5; g.strokeStyle = O; g.strokeRect(2, y, w - 4, 4); }
      for (let i = 0; i <= bays; i++) post(g, Math.min(w - 8, Math.max(1, i * bw - 3)), 8, gh + 4, '#b8bfcb');
      g.fillStyle = '#b3764f'; g.fillRect(0, 0, w, 10);             // plank deck
      g.fillStyle = '#d19a6a'; g.fillRect(0, 0, w, 3);
      g.strokeStyle = O; g.lineWidth = 2.5; g.strokeRect(1, 1, w - 2, 9);
      g.lineWidth = 1.5; for (let x = 28; x < w; x += 28) { g.beginPath(); g.moveTo(x, 1); g.lineTo(x, 10); g.stroke(); }
      for (let x = 0, i = 0; x < w; x += 12, i++) { g.fillStyle = i % 2 ? '#191921' : '#ffd23a'; g.fillRect(x, 12, 12, 5); }   // caution tape
    });
    if (style === 'shelter') return GP.cache(key, w, gh + 4, (g) => {
      g.fillStyle = 'rgba(170,220,255,.28)'; g.fillRect(10, 14, w * 0.45, gh - 20);   // glass wall
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2; g.strokeRect(10, 14, w * 0.45, gh - 20);
      g.beginPath(); g.moveTo(18, 24); g.lineTo(36, 44); g.stroke();
      const ax = w * 0.55, aw = w * 0.4, ay = 20, ah = Math.min(58, gh - 40);            // ad panel
      g.fillStyle = '#ffe36a'; g.fillRect(ax, ay, aw, ah); g.lineWidth = 2.5; g.strokeStyle = O; g.strokeRect(ax, ay, aw, ah);
      GP.text(g, 'METRO', ax + aw / 2, ay + 14, 11, '#e0782a', O, 2.5);
      g.font = 'bold 7px ' + LA.FONT; g.fillStyle = O; g.textAlign = 'center'; g.fillText('arriving:', ax + aw / 2, ay + 30); g.fillText('eventually', ax + aw / 2, ay + 40);
      g.fillStyle = '#6b4a2e'; g.fillRect(16, gh - 26, w * 0.4, 6); g.strokeRect(16, gh - 26, w * 0.4, 6);   // bench
      g.fillRect(20, gh - 20, 4, 18); g.fillRect(12 + w * 0.4, gh - 20, 4, 18);
      post(g, 4, 8, gh + 4, '#5e6675'); post(g, w - 12, 8, gh + 4, '#5e6675');
      g.fillStyle = '#2b5d6b'; g.fillRect(0, 0, w, 12); g.fillStyle = '#4b8d9c'; g.fillRect(0, 0, w, 4);   // roof slab
      g.lineWidth = 3; g.strokeStyle = O; g.strokeRect(1, 1, w - 2, 11);
    });
    // billboard catwalk: the board sits ABOVE the deck (drawn from y=-BB_H)
    return GP.cache(key, w, gh + 4 + BB_H, (g) => {
      const b = BILLS[v % BILLS.length], top = BB_H;
      post(g, w * 0.22, 10, gh + 4 + top, '#6b6f78'); post(g, w * 0.78 - 10, 10, gh + 4 + top, '#6b6f78');
      g.fillStyle = b[3]; g.fillRect(6, 4, w - 12, top - 24); g.lineWidth = 4; g.strokeStyle = O; g.strokeRect(6, 4, w - 12, top - 24);
      g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 2; g.strokeRect(12, 10, w - 24, top - 36);
      const big = Math.min(28, Math.floor((w - 30) / (b[0].length * 0.68)));
      GP.text(g, b[0], w / 2, 4 + (top - 24) * 0.42, big, b[2], O, 4);
      g.font = 'bold 14px ' + LA.FONT; g.fillStyle = b[2]; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(b[1], w / 2, 4 + (top - 24) * 0.76);
      for (let x = 20; x < w - 10; x += 46) { g.fillStyle = '#ffe9a0'; g.fillRect(x, top - 20, 8, 5); }    // lamps
      g.fillStyle = '#5b6170'; g.fillRect(0, top, w, 9);                                // grated deck
      g.strokeStyle = O; g.lineWidth = 2.5; g.strokeRect(1, top + 1, w - 2, 8);
      g.strokeStyle = '#8c94a3'; g.lineWidth = 1; for (let x = 6; x < w; x += 6) { g.beginPath(); g.moveTo(x, top + 2); g.lineTo(x, top + 8); g.stroke(); }
    });
  }
  const BB_H = 118;
  function post(g, x, w, bottom, col) {
    g.fillStyle = col || '#7d8390'; g.fillRect(x, 6, w, bottom - 6);
    g.lineWidth = 2; g.strokeStyle = O; g.strokeRect(x, 6, w, bottom - 6);
  }
  LA.ents.define('plat', (o, S) => {
    const w = Math.round(o.w), y = Math.round(o.y), gh = GY - y, style = o.style || 'awning';
    const solid = { x: o.x, y, w, h: 10, oneway: true, kind: 'plat', style };
    S.solids.push(solid);
    return {
      x: o.x, y, w, h: 10, style, v: o.v || 0, solid, layer: 'back', drawW: w,
      posts: style === 'billboard' ? [o.x + w * 0.22, o.x + w * 0.78 - 10] : style === 'scaffold' ? null : [o.x + 8, o.x + w - 14],
      draw(ctx) {
        const a = platArt(this.style, w, gh, this.v);
        if (this.style === 'billboard') ctx.drawImage(a.cv, this.x, y - BB_H, a.w, a.h);
        else ctx.drawImage(a.cv, this.x, y, a.w, a.h);
      },
    };
  });

  // ---------------- blocks ----------------
  const BS = 36;
  const BRICK_BY_WORLD = { 1: 'Glass', 2: 'Adobe', 3: 'Graffiti', 4: 'Terracotta', 5: 'Glass' };   // Coast · Valley · Downtown · Hollywood/Westside · Reckoning
  function blockArt(kind, f) {
    return GP.cache('blk' + kind + f, BS, BS, (g) => {
      if (kind === 'q') {                                            // PACKAGE crate with a ? sticker
        g.fillStyle = f ? '#dca462' : '#cf9552'; g.fillRect(1, 1, BS - 2, BS - 2);
        g.fillStyle = '#a8703a'; g.fillRect(1, BS - 7, BS - 2, 6); g.fillRect(BS - 7, 1, 6, BS - 2);
        g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(3, 3, BS - 12, 3);
        g.fillStyle = '#e8d7b0'; g.fillRect(BS / 2 - 4, 1, 8, BS - 2);                     // packing tape
        g.lineWidth = 3; g.strokeStyle = O; g.strokeRect(1.5, 1.5, BS - 3, BS - 3);
        GP.text(g, '?', BS / 2, BS / 2 + 1, 24, f ? '#fff6b0' : '#ffe36a', O, 4);
      } else if (kind === 'used') {
        g.fillStyle = '#8a6a4c'; g.fillRect(1, 1, BS - 2, BS - 2);
        g.fillStyle = '#6e5238'; g.fillRect(1, BS - 7, BS - 2, 6);
        g.lineWidth = 3; g.strokeStyle = O; g.strokeRect(1.5, 1.5, BS - 3, BS - 3);
        g.lineWidth = 2; g.strokeStyle = '#4a3624'; g.beginPath(); g.moveTo(9, 9); g.lineTo(BS - 9, BS - 9); g.moveTo(BS - 9, 9); g.lineTo(9, BS - 9); g.stroke();
      } else {                                                       // stucco brick
        g.fillStyle = '#e7b98e'; g.fillRect(1, 1, BS - 2, BS - 2);
        g.fillStyle = '#c98f63';
        g.fillRect(1, 11, BS - 2, 3); g.fillRect(1, 23, BS - 2, 3);
        g.fillRect(16, 1, 3, 10); g.fillRect(7, 14, 3, 9); g.fillRect(26, 14, 3, 9); g.fillRect(16, 26, 3, 9);
        g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(3, 3, 10, 3);
        g.lineWidth = 3; g.strokeStyle = O; g.strokeRect(1.5, 1.5, BS - 3, BS - 3);
      }
    });
  }
  LA.ents.define('block', (o, S) => {
    const kind = o.kind || 'q';
    const e = {
      x: o.x, y: o.y, w: BS, h: BS, kind: 'block', bk: kind, item: o.item || (kind === 'q' ? 'crystal' : null),
      used: false, bumpT: 0, multi: 0, multiT: 0, layer: 'mid', drawW: BS, hidden: kind === 'hidden', solid: null,
      art: LA.items ? LA.items.keys() : null,                          // preload any illustrated item art with the level
    };
    if (!e.hidden) { e.solid = { x: e.x, y: e.y, w: BS, h: BS, kind: 'block' }; S.solids.push(e.solid); }
    e.update = function (S, dt) {
      if (this.bumpT > 0) this.bumpT = Math.max(0, this.bumpT - dt * 7);
      if (this.multiT > 0) this.multiT -= dt;
      for (const p of S.players) {
        if (!p.active || p.ghost) continue;
        const pcx = p.x + p.w / 2;
        if (pcx < this.x - 4 || pcx > this.x + BS + 4) continue;
        if (this.hidden) {                                           // secret: only reacts to a head from below
          if (p.vy < 0 && p.y < this.y + BS && p.y - p.vy >= this.y + BS - 0.5 && pcx > this.x + 2 && pcx < this.x + BS - 2) {
            this.hidden = false; this.solid = { x: this.x, y: this.y, w: BS, h: BS, kind: 'block' }; S.solids.push(this.solid);
            p.y = this.y + BS; p.vy = 0; bump(S, this, p);
          }
          continue;
        }
        if (!p.onGround && p.vy === 0 && Math.abs(p.y - (this.y + BS)) < 0.6 && p.x + p.w > this.x + 1 && p.x < this.x + BS - 1) bump(S, this, p);
      }
    };
    e.draw = function (ctx, S) {
      if (this.hidden) return;
      const k = this.bk === 'brick' ? 'brick' : this.used ? 'used' : 'q';
      const f = k === 'q' ? (Math.floor(S.t * 3) % 3 === 0 ? 1 : 0) : 0;
      const dy = -Math.sin(Math.min(1, this.bumpT) * Math.PI) * 7;
      // illustrated override (ITEM-ART.md): itemQBlock / itemQBlockUsed / itemBrick; the 'q' glint = additive re-draw
      if (k === 'brick' && this.brickArt == null) {                   // each world has its own breakable block (same frame)
        const lv = LA.LEVELS.find((l) => this.x >= l.x0 && this.x < l.x1);
        this.brickArt = 'Brick' + (BRICK_BY_WORLD[lv ? lv.w : 1] || '');
      }
      const art = LA.items && (k === 'brick' ? LA.items.scaled(this.brickArt, BS, BS) || LA.items.scaled('Brick', BS, BS)
        : LA.items.scaled(k === 'q' ? 'QBlock' : 'QBlockUsed', BS, BS));
      if (art) {
        ctx.drawImage(art, this.x, this.y + dy, BS, BS);
        if (f) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.22; ctx.drawImage(art, this.x, this.y + dy, BS, BS); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
        return;
      }
      const a = blockArt(k, f);
      ctx.drawImage(a.cv, this.x, this.y + dy, BS, BS);
    };
    return e;
  });
  function bump(S, b, p) {
    if (b.bumpT > 0.2) return;
    b.bumpT = 1;
    for (const e of S.ents) {                                         // Mario: bumping a block knocks out whoever stands on it
      if (e.kind !== 'foe' || e.dying || e.dead || e.fly) continue;
      if (Math.abs(e.floorY - b.y) < 3 && e.x + e.w > b.x && e.x < b.x + BS) { LA.game.score(S, 100); LA.pop(S, e.x + e.w / 2, e.y - 8, '+100', '#ffe36a'); GP.killFoe(S, e, 'flip'); }
    }
    if (b.bk === 'brick') {
      if (p.big > 1) {                                                 // BIG BOY smashes stucco
        const i = S.solids.indexOf(b.solid); if (i >= 0) S.solids.splice(i, 1);
        b.dead = true; LA.game.score(S, 50);
        LA.ents.add(S, 'gpfx', { mode: 'debris', x: b.x + BS / 2, y: b.y + BS / 2 }); GP.sfx('break');
      } else GP.sfx('bonk');
      return;
    }
    if (b.used) { GP.sfx('bonk'); return; }
    const it = b.item || 'crystal', cx = b.x + BS / 2;
    if (it === 'crystal' || it === 'multi') {
      LA.game.addCrystals(S, 1, cx, b.y - 10); LA.game.score(S, 100); LA.pop(S, cx, b.y - 30, '+100', '#57e08a');
      LA.ents.add(S, 'gpfx', { mode: 'coin', x: cx, y: b.y - 6, c: (S.tick >> 1) % 5 }); GP.sfx('crystal');
      if (it === 'multi') { if (!b.multi) { b.multi = 8; b.multiT = 4; } b.multi--; if (b.multi <= 0 || b.multiT <= 0) b.used = true; }
      else b.used = true;
    } else if (it.indexOf('gem:') === 0) {
      LA.ents.add(S, 'gem', { k: it.slice(4), x: cx, y: b.y - 4, rise: 34 }); GP.sfx('powerup'); b.used = true;
    } else if (it === 'oneup') {
      LA.ents.add(S, 'oneup', { x: cx, y: b.y - 4, rise: 36 }); GP.sfx('powerup'); b.used = true;
    } else b.used = true;
    GP.sfx('bonk');
  }
  LA.gameplay.BLOCK = BS;
})();
