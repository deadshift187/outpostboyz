// CITIZENS — Saint's POW rescue (drawFolk @1946). A crook ("HANDS UP!") holds a citizen up; defeat the crook
// and they're free: "SAVED! +250", +3 crystals, and they hand you a POWER GEM (Metal Slug POW), then cheer
// and walk off. Beach districts mix in his bikini citizens ('folkVenGirl' / 'folkVenGirl2'); everyone else is
// drawn in code (his art slot 'folkGen' is empty) with real variety: skin tones, hair, gender, clothes, hijab,
// beards, shades — never a default crowd. Citizens are only ever rescued, never hurt.
(function () {
  'use strict';
  const LA = window.LA, K = LA.K, GY = K.GY, GP = LA.gp;
  const O = '#191921';
  const SKIN = ['#f6d8b0', '#eac19a', '#d6a274', '#b07344', '#8a5530', '#5e3a22'];
  const HAIR = ['#1d1a1a', '#3b2416', '#6b3f1f', '#caa15a', '#8e8e96', '#b8452a', '#2a2a5a'];
  const CLOTH = ['#4a7fd4', '#d45a7f', '#3fa06a', '#f0a030', '#8a5ad4', '#e04848', '#2ab0b0', '#f2f2f2', '#2c2f3a', '#ffd23a'];
  const STYLES_F = ['long', 'bun', 'braids', 'hijab', 'afro', 'ponytail'];
  const STYLES_M = ['short', 'bald', 'cap', 'afro', 'short', 'locs'];
  const W = 32, H = 56;

  // deterministic, varied look from an rng (populate) — skin index is supplied so neighbours always differ
  LA.gameplay = LA.gameplay || {};
  LA.gameplay.folkLook = function (rng, skinIdx) {
    const fem = rng() < 0.5;
    const style = (fem ? STYLES_F : STYLES_M)[Math.floor(rng() * 6)];
    return { skin: (skinIdx != null ? skinIdx : Math.floor(rng() * 6)) % 6, hair: Math.floor(rng() * HAIR.length), style, fem,
      top: Math.floor(rng() * CLOTH.length), bottom: Math.floor(rng() * CLOTH.length), skirt: fem && rng() < 0.45,
      beard: !fem && rng() < 0.3, shades: rng() < 0.22, scarf: Math.floor(rng() * CLOTH.length), cap: Math.floor(rng() * CLOTH.length) };
  };
  function lookKey(L) { return [L.skin, L.hair, L.style, L.top, L.bottom, L.skirt ? 1 : 0, L.beard ? 1 : 0, L.shades ? 1 : 0, L.scarf, L.cap].join('.'); }

  // Citizen TYPES + sprite hook. Every code-drawn citizen has a type = gender + hair style (the same variety
  // folkLook rolls): WomanLong WomanBun WomanBraids WomanHijab WomanAfro WomanPonytail · ManShort ManBald
  // ManCap ManAfro ManLocs. If LA.SPRITES has 'cit' + type (e.g. 'citWomanAfro') it is drawn instead of the
  // code art once decoded (preloaded through the entity's art field); otherwise the code art is the fallback.
  const pascal = (s) => String(s).replace(/(^|[^a-z0-9])([a-z0-9])/gi, (m, a, c) => c.toUpperCase());
  LA.gameplay.folkType = (L) => (L.fem ? 'Woman' : 'Man') + pascal(L.style);
  LA.gameplay.citKey = (type) => 'cit' + pascal(type);
  // Adult human scale: the hero draws 56 × 1.294 ≈ 72 px ≈ 1.8 m. Citizens are adults (≈1.7 m) → 68 px of body
  // from the top of the head to the soles, feet planted on the same line as the hero's (GY + 3).
  const CIT_H = 68, FOOT_Y = GY + 3;
  // Foot snap: measure (once per image/canvas, never per frame) the fraction of the source height that is
  // transparent padding below the bottom-most opaque row, so the soles — not the image edge — touch the street.
  const footPad = new WeakMap();
  function padOf(src, sw, sh) {
    let f = footPad.get(src);
    if (f != null) return f;
    f = 0;
    try {
      const c = document.createElement('canvas'); c.width = sw; c.height = sh;
      const g = c.getContext('2d'); g.drawImage(src, 0, 0);
      const d = g.getImageData(0, 0, sw, sh).data;
      let bottom = -1;
      for (let y = sh - 1; y >= 0 && bottom < 0; y--) for (let x = 0; x < sw; x++) if (d[(y * sw + x) * 4 + 3] > 96) { bottom = y; break; }
      if (bottom >= 0) f = (sh - 1 - bottom) / sh;
    } catch (err) { f = 0; }
    footPad.set(src, f);
    return f;
  }
  // draw an upright citizen image/canvas: CIT_H from the top of the art to the soles, soles on FOOT_Y
  // (image bottom padding measured + pushed below the line); returns the art's top y
  function drawBody(ctx, src, sw, sh, cx, lift, flip) {
    const pad = padOf(src, sw, sh), h = CIT_H / (1 - Math.min(0.5, pad)), w = h * sw / sh;
    const y = FOOT_Y - h * (1 - pad) - lift;
    if (flip) { ctx.save(); ctx.translate(cx, 0); ctx.scale(-1, 1); ctx.drawImage(src, -w / 2, y, w, h); ctx.restore(); }
    else ctx.drawImage(src, cx - w / 2, y, w, h);
    return y;
  }

  function folkArt(L, pose) {
    return GP.cache('folk' + lookKey(L) + pose, W, H, (g) => {
      const sk = SKIN[L.skin], hc = HAIR[L.hair], top = CLOTH[L.top], bot = CLOTH[L.bottom === L.top ? (L.bottom + 3) % CLOTH.length : L.bottom];
      const cx = 16, hy = 13, cheer = pose === 'cheer';
      g.lineWidth = 2.5; g.strokeStyle = O;
      // back hair
      if (L.style === 'long' || L.style === 'locs') { g.fillStyle = hc; GP.rr(g, cx - 9, hy - 6, 18, 18, 5); g.fill(); g.stroke(); }
      if (L.style === 'afro') { g.fillStyle = hc; g.beginPath(); g.arc(cx, hy - 2, 11, 0, 6.3); g.fill(); g.stroke(); }
      if (L.style === 'hijab') { g.fillStyle = CLOTH[L.scarf]; g.beginPath(); g.arc(cx, hy, 10, 0, 6.3); g.fill(); g.stroke(); g.fillRect(cx - 8, hy + 4, 16, 10); }
      if (L.style === 'ponytail') { g.fillStyle = hc; g.beginPath(); g.ellipse(cx + 8, hy + 2, 3.5, 7, 0.4, 0, 6.3); g.fill(); g.stroke(); }
      // arms (behind torso)
      g.lineWidth = 5; g.strokeStyle = O;
      const armL = cheer ? [4, 4] : [5, 2], armR = cheer ? [28, 4] : [27, 2];
      g.beginPath(); g.moveTo(cx - 6, 24); g.lineTo(armL[0], armL[1] + 6); g.moveTo(cx + 6, 24); g.lineTo(armR[0], armR[1] + 6); g.stroke();
      g.lineWidth = 3; g.strokeStyle = sk;
      g.beginPath(); g.moveTo(cx - 6, 24); g.lineTo(armL[0], armL[1] + 6); g.moveTo(cx + 6, 24); g.lineTo(armR[0], armR[1] + 6); g.stroke();
      g.lineWidth = 3.4; g.strokeStyle = top;                          // sleeves
      const mid = (a, b) => a + (b - a) * 0.45;
      g.beginPath(); g.moveTo(cx - 6, 24); g.lineTo(mid(cx - 6, armL[0]), mid(24, armL[1] + 6)); g.moveTo(cx + 6, 24); g.lineTo(mid(cx + 6, armR[0]), mid(24, armR[1] + 6)); g.stroke();
      g.fillStyle = sk; g.strokeStyle = O; g.lineWidth = 2;
      g.beginPath(); g.arc(armL[0], armL[1] + 4, 3, 0, 6.3); g.fill(); g.stroke(); g.beginPath(); g.arc(armR[0], armR[1] + 4, 3, 0, 6.3); g.fill(); g.stroke();
      // legs
      g.lineWidth = 2.5;
      if (L.skirt) {
        g.fillStyle = sk; g.fillRect(cx - 5, 44, 3.5, 8); g.fillRect(cx + 1.5, 44, 3.5, 8); g.strokeRect(cx - 5, 44, 3.5, 8); g.strokeRect(cx + 1.5, 44, 3.5, 8);
        g.fillStyle = bot; g.beginPath(); g.moveTo(cx - 6, 34); g.lineTo(cx + 6, 34); g.lineTo(cx + 9, 46); g.lineTo(cx - 9, 46); g.closePath(); g.fill(); g.stroke();
      } else {
        g.fillStyle = bot; g.fillRect(cx - 6, 34, 5.5, 18); g.fillRect(cx + 0.5, 34, 5.5, 18); g.strokeRect(cx - 6, 34, 5.5, 18); g.strokeRect(cx + 0.5, 34, 5.5, 18);
      }
      g.fillStyle = '#2a2020'; g.fillRect(cx - 7, 51, 7, 4); g.fillRect(cx, 51, 7, 4);            // shoes
      // torso
      g.fillStyle = top; GP.rr(g, cx - 7, 20, 14, 16, 4); g.fill();
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(cx + 2, 21, 4, 14);                            // shading
      g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(cx - 5, 22, 3, 8);
      g.fillStyle = sk; g.beginPath(); g.moveTo(cx - 3, 20); g.lineTo(cx, 24); g.lineTo(cx + 3, 20); g.closePath(); g.fill();   // neckline
      GP.rr(g, cx - 7, 20, 14, 16, 4); g.strokeStyle = O; g.lineWidth = 2.5; g.stroke();
      // head
      g.fillStyle = sk; g.beginPath(); g.arc(cx, hy, 7, 0, 6.3); g.fill(); g.lineWidth = 2.5; g.stroke();
      if (L.style === 'hijab') { g.strokeStyle = CLOTH[L.scarf]; g.lineWidth = 3; g.beginPath(); g.arc(cx, hy, 7.5, Math.PI * 1.05, Math.PI * 1.95); g.stroke(); g.strokeStyle = O; }
      // front hair
      g.fillStyle = hc; g.lineWidth = 2;
      if (L.style === 'short' || L.style === 'long' || L.style === 'bun' || L.style === 'braids' || L.style === 'ponytail' || L.style === 'locs') { g.beginPath(); g.arc(cx, hy - 1, 7.2, Math.PI, 0); g.closePath(); g.fill(); g.stroke(); }
      if (L.style === 'bun') { g.beginPath(); g.arc(cx, hy - 9, 3.5, 0, 6.3); g.fill(); g.stroke(); }
      if (L.style === 'braids') { g.fillRect(cx - 9, hy - 1, 3, 14); g.fillRect(cx + 6, hy - 1, 3, 14); g.strokeRect(cx - 9, hy - 1, 3, 14); g.strokeRect(cx + 6, hy - 1, 3, 14); }
      if (L.style === 'locs') { for (let i = -2; i <= 2; i++) { g.fillRect(cx + i * 3.4 - 1, hy, 2.4, 12); } }
      if (L.style === 'cap') { g.fillStyle = CLOTH[L.cap]; g.beginPath(); g.arc(cx, hy - 1, 7.4, Math.PI, 0); g.closePath(); g.fill(); g.stroke(); g.fillRect(cx - 1, hy - 3, 11, 3); g.strokeRect(cx - 1, hy - 3, 11, 3); }
      if (L.style === 'bald') { g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(cx - 3, hy - 4, 2, 0, 6.3); g.fill(); }
      // face
      if (L.beard) { g.fillStyle = hc; g.beginPath(); g.arc(cx, hy + 2, 6.4, 0.15, Math.PI - 0.15); g.closePath(); g.fill(); }
      if (L.shades) { g.fillStyle = O; g.fillRect(cx - 6, hy - 2, 12, 3.5); }
      else { g.fillStyle = O; if (cheer) { g.lineWidth = 1.5; g.beginPath(); g.arc(cx - 3, hy, 1.6, Math.PI, 0); g.arc(cx + 3, hy, 1.6, Math.PI, 0); g.stroke(); } else { g.fillRect(cx - 4, hy - 1.5, 2, 2.5); g.fillRect(cx + 2, hy - 1.5, 2, 2.5); } }
      g.fillStyle = cheer ? '#7a1f2a' : O;
      if (cheer) { g.beginPath(); g.arc(cx, hy + 3, 3, 0, Math.PI); g.closePath(); g.fill(); }
      else { g.beginPath(); g.ellipse(cx, hy + 4, 1.4, 1.8, 0, 0, 6.3); g.fill(); }
      if (!cheer) { g.fillStyle = '#8fd8ff'; g.beginPath(); g.moveTo(cx + 9, hy - 6); g.quadraticCurveTo(cx + 12, hy - 1, cx + 9, hy); g.quadraticCurveTo(cx + 6, hy - 1, cx + 9, hy - 6); g.fill(); }   // sweat drop
    });
  }

  function bubble(ctx, bx, by) {                                       // his "!" bubble
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.beginPath(); ctx.arc(bx, by, 9, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(bx - 4, by + 6); ctx.lineTo(bx + 3, by + 13); ctx.lineTo(bx + 4, by + 5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e2563f'; ctx.font = 'bold 13px ' + LA.FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', bx, by);
  }

  LA.ents.define('folk', (o) => {
    const look = o.look || LA.gameplay.folkLook(LA.rng(o.x | 0)), type = o.type || LA.gameplay.folkType(look), citKey = LA.gameplay.citKey(type);
    return {
    x: o.x, y: GY - 30, w: 20, h: 30, look, type, citKey, artKey: o.artKey || null,
    art: [o.artKey || citKey],                                          // preloaded with the level (missing keys are skipped)
    guard: o.guard || null, gem: o.gem || 'grow', saved: false, walk: 0, citizen: true, layer: 'mid', drawW: 40, level: o.level || null,
    update(S, dt) {
      if (this.saved) { this.walk += dt; if (this.walk > 0.7) this.x += 1.7 * dt * 60; if (this.walk > 3.4) this.dead = true; return; }
      if (this.guard && (this.guard.defeated || this.guard.dead)) this.save(S);
    },
    touch(S) { if (!this.saved && !this.guard) this.save(S); },
    save(S) {
      this.saved = true; this.walk = 0;
      S.stats.saved++; S.run.saved++; if (S.stats.rescued) S.stats.rescued.push({ x: Math.round(this.x), level: this.level });
      const cx = this.x + 10;
      LA.game.score(S, 250); LA.pop(S, cx, this.y - 44, 'SAVED! +250', '#57e08a', true);
      LA.game.addCrystals(S, 3, cx, this.y - 20); LA.pop(S, cx, this.y - 24, '+3 ◆', '#a8ffd0');
      for (let i = 0; i < 3; i++) LA.ents.add(S, 'gpfx', { mode: 'coin', x: cx - 14 + i * 14, y: this.y - 10, c: i + 1 });
      LA.ents.add(S, 'gem', { x: cx, y: GY - 64, k: this.gem, rise: 22 });                 // the POW hands you a power gem
      LA.ents.add(S, 'gpfx', { mode: 'confetti', x: cx, y: this.y - 10 });
      GP.sfx('rescue'); LA.emit('rescue', { S, folk: this });
    },
    draw(ctx, S) {
      const free = this.saved, wob = free ? Math.abs(Math.sin(this.walk * 9)) * 2.5 : 0;
      if (free && this.walk > 2.6) ctx.globalAlpha = Math.max(0, (3.4 - this.walk) / 0.8);
      let headY;
      // illustrated art first: Saint's beach sprite (artKey) or an illustrated 'cit<Type>' (only once decoded)
      const im = (this.artKey && LA.img(this.artKey)) || (LA.SPRITES && LA.SPRITES[this.citKey] ? LA.img(this.citKey) : null);
      if (im) headY = drawBody(ctx, im, im.naturalWidth, im.naturalHeight, this.x + 10, wob, false) - 10;
      else {
        const a = folkArt(this.look, free ? 'cheer' : 'help');
        const flip = free;                                             // walk off to the right
        headY = drawBody(ctx, a.cv, a.cv.width, a.cv.height, this.x + 10, wob - (!free && Math.sin(S.t * 8 + this.x) > 0.6 ? 1 : 0), flip) - 10;
      }
      ctx.globalAlpha = 1;
      if (!free) bubble(ctx, this.x + 10, headY);
      else if (this.walk < 1.4) { ctx.font = 'bold 11px ' + LA.FONT; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = O; ctx.strokeText('THANK YOU!', this.x + 10, headY - 4); ctx.fillStyle = '#fff'; ctx.fillText('THANK YOU!', this.x + 10, headY - 4); }
    },
    };
  });
})();
