// PICKUPS — crystals are coins (drawCrystal @2001: the five CRYS_ART gem sprites drawn small, +100 each,
// LA.game.addCrystals auto-1UPs every 100), power gems (drawGem @1921: GEMART sprite, glow, spin, label),
// the secret 1UP, and 'gpfx' — one-shot particles (coin pop, sparks, poofs, smoke, dust, debris, confetti).
(function () {
  'use strict';
  const LA = window.LA, K = LA.K, GY = K.GY, GP = LA.gp;
  const CRYS = LA.CONTENT.CRYS, CRYS_ART = LA.CONTENT.CRYS_ART, GEMART = LA.CONTENT.GEMART, POWERS = LA.CONTENT.POWERS;
  const O = '#191921';

  // illustrated item overrides (ITEM-ART.md) — LA.items.draw() returns false until the art exists + decodes
  const IT = LA.items, CRYS_NAME = ['CrystalGreen', 'CrystalPink', 'CrystalBlue', 'CrystalGold', 'CrystalPurple'];
  const POW_NAME = { gold: 'PowGold', grow: 'PowGrow', blast: 'PowBlast', vibes: 'PowVibes', chill: 'PowChill' };
  function drawCrystal(ctx, x, y, r, ci) {
    const cn = CRYS_NAME[(ci || 0) % 5], bh = r * 2.7;                 // same box as the atlas gem: h=2.7r, top at y-0.55h
    if (IT.draw(ctx, cn, x - bh * 0.4, y - bh * 0.55, bh * 0.8, bh) || IT.draw(ctx, 'Crystal', x - bh * 0.4, y - bh * 0.55, bh * 0.8, bh)) return;
    const im = LA.img(CRYS_ART[(ci || 0) % CRYS_ART.length]);
    if (im) { const h = r * 2.7, w = h * im.naturalWidth / im.naturalHeight; ctx.drawImage(im, x - w / 2, y - h * 0.55, w, h); return; }
    const p2 = CRYS[(ci || 0) % CRYS.length];
    ctx.beginPath(); ctx.moveTo(x, y - r * 1.3); ctx.lineTo(x + r * 0.78, y - r * 0.35); ctx.lineTo(x + r * 0.5, y + r * 1.1); ctx.lineTo(x - r * 0.5, y + r * 1.1); ctx.lineTo(x - r * 0.78, y - r * 0.35); ctx.closePath();
    ctx.fillStyle = p2[0]; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = O; ctx.stroke();
  }
  LA.gameplay = LA.gameplay || {};
  LA.gameplay.drawCrystal = drawCrystal;

  // ---------------- crystal (coin) ----------------
  LA.ents.define('crystal', (o) => ({
    x: o.x, y: o.y, w: 22, h: 22, c: o.c || 0, pickup: true, layer: 'mid', drawW: 24, tw: (o.x * 0.013) % 6, art: IT.keys(),
    update(S, dt) {
      this.tw += dt;
      for (const p of S.players) {                                   // GOOD VIBES magnet (rose quartz)
        if (p.power !== 'vibes' || p.ghost) continue;
        const dx = p.x + p.w / 2 - (this.x + 11), dy = p.y + p.h / 2 - (this.y + 11), d = Math.hypot(dx, dy);
        if (d < 150 && d > 1) { const k = 4.2 * dt * 60 / (S.fx.slow || 1); this.x += dx / d * k; this.y += dy / d * k; }
      }
    },
    touch(S, p) {
      this.dead = true;
      LA.game.addCrystals(S, 1, this.x + 11, this.y); LA.game.score(S, 100);
      LA.pop(S, this.x + 11, this.y, '+100', CRYS[this.c % 5][0]); GP.sfx('crystal', { p: p.idx });
    },
    draw(ctx) {
      drawCrystal(ctx, this.x + 11, this.y + 11, 9, this.c);
      const s = this.tw % 3;                                           // occasional twinkle
      if (s < 0.25) { const a = 1 - s * 4; ctx.globalAlpha = a; ctx.fillStyle = '#fff'; ctx.fillRect(this.x + 14, this.y + 1, 2, 7); ctx.fillRect(this.x + 11.5, this.y + 3.5, 7, 2); ctx.globalAlpha = 1; }
    },
  }));

  // ---------------- power gem ----------------
  LA.ents.define('gem', (o) => {
    const k = POWERS[o.k] ? o.k : 'grow';
    return {
      k, cx: o.x, cy: o.y, x: o.x - 16, y: o.y - 16, w: 32, h: 32, t: 0, rise: o.rise || 0, risen: 0, layer: 'front', art: [GEMART[k]], drawW: 60,
      update(S, dt) {
        this.t += dt * 3;
        if (this.risen < this.rise) { const d = Math.min(this.rise - this.risen, 2.2 * dt * 60); this.risen += d; this.cy -= d; this.y = this.cy - 16; }
      },
      touch(S, p) {
        if (this.risen < this.rise * 0.6) return;
        this.dead = true; LA.game.score(S, 300); LA.powers.give(S, p, this.k);
        LA.ents.add(S, 'gpfx', { mode: 'confetti', x: this.cx, y: this.cy, col: POWERS[this.k].col });
      },
      draw(ctx) {
        const r = 15, bob = this.risen >= this.rise ? Math.sin(this.t) * 3 : 0, col = POWERS[this.k].col;
        ctx.save(); ctx.translate(this.cx, this.cy + bob);
        ctx.globalAlpha = 0.28; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, r * 1.7 + Math.sin(this.t * 1.6) * 2, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
        ctx.scale(Math.cos(this.t * 0.7) * 0.35 + 0.85, 1);
        const im = LA.img(GEMART[this.k]) || LA.img('gemArt'), gh = r * 2.8;
        if (IT.draw(ctx, POW_NAME[this.k], -gh * 0.5, -r * 1.4, gh, gh)) { /* illustrated power-up (square box) */ }
        else if (im) { const gw = gh * im.naturalWidth / im.naturalHeight; ctx.drawImage(im, -gw / 2, -r * 1.4, gw, gh); }
        else gemShape(ctx, r, col);
        ctx.restore();
        ctx.font = 'bold 9px ' + LA.FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.6)';
        ctx.strokeText(POWERS[this.k].n, this.cx, this.cy - 30); ctx.fillStyle = '#fff'; ctx.fillText(POWERS[this.k].n, this.cx, this.cy - 30);
      },
    };
  });
  function gemShape(ctx, r, col) {
    ctx.beginPath(); ctx.moveTo(0, -r * 1.35); ctx.lineTo(r * 0.8, -r * 0.4); ctx.lineTo(r * 0.52, r * 1.15); ctx.lineTo(-r * 0.52, r * 1.15); ctx.lineTo(-r * 0.8, -r * 0.4); ctx.closePath();
    ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = O; ctx.stroke();
  }
  LA.gameplay.spawnGem = (S, x, y, k, rise) => LA.ents.add(S, 'gem', { x, y, k, rise });

  // ---------------- secret 1UP ----------------
  function oneUpArt() {
    return GP.cache('oneup', 40, 46, (g) => {
      g.translate(20, 18);
      g.fillStyle = 'rgba(87,224,138,.3)'; g.beginPath(); g.arc(0, 0, 18, 0, 7); g.fill();
      const r = 12;                                                    // green heart-cut crystal
      g.beginPath(); g.moveTo(0, r * 1.2); g.bezierCurveTo(-r * 1.6, 0, -r * 1.1, -r * 1.25, 0, -r * 0.45); g.bezierCurveTo(r * 1.1, -r * 1.25, r * 1.6, 0, 0, r * 1.2); g.closePath();
      g.fillStyle = '#57e08a'; g.fill(); g.lineWidth = 3; g.strokeStyle = O; g.stroke();
      g.fillStyle = '#a8ffd0'; g.beginPath(); g.moveTo(-6, -6); g.lineTo(-2, -3); g.lineTo(-7, 3); g.closePath(); g.fill();
      g.setTransform(2, 0, 0, 2, 0, 0);
      GP.text(g, '1UP', 20, 40, 11, '#fff', O, 3);
    });
  }
  LA.ents.define('oneup', (o) => ({
    cx: o.x, cy: o.y, x: o.x - 15, y: o.y - 15, w: 30, h: 30, t: 0, rise: o.rise || 0, risen: 0, layer: 'front', drawW: 40,
    update(S, dt) { this.t += dt * 3; if (this.risen < this.rise) { const d = Math.min(this.rise - this.risen, 2 * dt * 60); this.risen += d; this.cy -= d; this.y = this.cy - 15; } },
    touch(S, p) { if (this.risen < this.rise * 0.6) return; this.dead = true; LA.game.oneUp(S, this.cx, this.cy); LA.ents.add(S, 'gpfx', { mode: 'confetti', x: this.cx, y: this.cy, col: '#57e08a' }); },
    draw(ctx) { const b = Math.sin(this.t) * 3; if (IT.draw(ctx, 'OneUp', this.cx - 18, this.cy - 18 + b, 36, 36)) { GP.text(ctx, '1UP', this.cx, this.cy + 22 + b, 11, '#fff', O, 3); return; } const a = oneUpArt(); ctx.drawImage(a.cv, this.cx - 20, this.cy - 18 + b, 40, 46); },
  }));

  // ---------------- particles ----------------
  const FXCOL = ['#ffd23a', '#ff6fae', '#4dc8ff', '#57e08a', '#b07cff', '#ff9f2e'];
  LA.ents.define('gpfx', (o) => {
    const m = o.mode, parts = [];
    const n = { spark: 6, poof: 5, smoke: 5, dust: 6, debris: 4, confetti: 14, coin: 1 }[m] || 4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (o.x % 1.3);
      if (m === 'spark') parts.push({ x: 0, y: 0, vx: Math.cos(a) * 2.4, vy: Math.sin(a) * 2.4 - 1, s: 3 });
      else if (m === 'poof') parts.push({ x: Math.cos(a) * 6, y: Math.sin(a) * 4, vx: Math.cos(a) * 1.1, vy: Math.sin(a) * 0.7 - 0.3, s: 7 });
      else if (m === 'smoke') parts.push({ x: (i - 2) * 6, y: 0, vx: (i - 2) * 0.15, vy: -0.8 - (i % 3) * 0.35, s: 8 + (i % 3) * 3 });
      else if (m === 'dust') parts.push({ x: 0, y: 0, vx: (i < n / 2 ? -1 : 1) * (1 + (i % 3) * 0.7), vy: -0.4 - (i % 2) * 0.4, s: 5 + (i % 3) * 2 });
      else if (m === 'debris') parts.push({ x: (i % 2 ? 8 : -8), y: (i < 2 ? -8 : 8), vx: (i % 2 ? 1 : -1) * (2.2 + (i >> 1)), vy: i < 2 ? -8 : -5, s: 12 });
      else if (m === 'confetti') parts.push({ x: 0, y: 0, vx: Math.cos(a) * (2 + (i % 3)), vy: Math.sin(a) * (2 + (i % 3)) - 2, s: 4, c: FXCOL[i % FXCOL.length] });
      else if (m === 'coin') parts.push({ x: 0, y: 0, vx: 0, vy: -7.5, s: 9 });
    }
    const life = { spark: 0.3, poof: 0.35, smoke: 0.9, dust: 0.45, debris: 1.1, confetti: 0.9, coin: 0.45 }[m] || 0.5;
    return {
      x: o.x, y: o.y, w: 1, h: 1, parts, m, life, max: life, c: o.c || 0, col: o.col, layer: 'front', always: true, drawW: 80,
      update(S, dt) {
        const k = dt * 60, g = m === 'debris' || m === 'coin' ? 0.55 : m === 'confetti' ? 0.12 : m === 'smoke' ? -0.01 : 0.05;
        for (const q of this.parts) { q.vy += g * k; q.x += q.vx * k; q.y += q.vy * k; if (m === 'poof' || m === 'smoke') q.s += 0.25 * k; }
        this.life -= dt; if (this.life <= 0) this.dead = true;
      },
      draw(ctx) {
        const a = Math.max(0, this.life / this.max);
        for (const q of this.parts) {
          const px = this.x + q.x, py = this.y + q.y;
          if (m === 'coin') { drawCrystal(ctx, px, py, 9, this.c); continue; }
          if (m === 'debris' && IT.draw(ctx, 'BrickChunk', px - 6, py - 6, 12, 12)) continue;
          if (m === 'debris') { ctx.fillStyle = '#e7b98e'; ctx.strokeStyle = O; ctx.lineWidth = 2; ctx.fillRect(px - 6, py - 6, 12, 12); ctx.strokeRect(px - 6, py - 6, 12, 12); continue; }
          ctx.globalAlpha = m === 'confetti' || m === 'spark' ? a : a * 0.7;
          ctx.fillStyle = m === 'spark' ? CRYS[this.c % 5][1] : m === 'confetti' ? q.c : m === 'smoke' ? '#9097a3' : m === 'dust' ? '#c9b08a' : '#ffffff';
          if (m === 'confetti' || m === 'spark') ctx.fillRect(px - q.s / 2, py - q.s / 2, q.s, q.s);
          else { ctx.beginPath(); ctx.arc(px, py, q.s, 0, 6.3); ctx.fill(); }
        }
        ctx.globalAlpha = 1;
      },
    };
  });
})();
