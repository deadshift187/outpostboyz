// SHOTS — Golden Boy's crystal lob (Saint's shoot() @940): costs 3 crystals, vx face*6.2, vy -5.4,
// 0.28 s cooldown, gravity 0.52/tick, no bounce — it's spent when it hits the street. CRYSTAL BLAST
// makes shots free and auto-fires (7.5, -3.2) every 0.2 s while FIRE is held.
// Also the enemy projectiles ('eshot'): HOA citation tickets (arc) and BREAKING NEWS banners (flat).
(function () {
  'use strict';
  const LA = window.LA, K = LA.K, GY = K.GY, GP = LA.gp;
  const THROW_COST = 3, SHARD_GRAV = 0.52;
  const CRYS = LA.CONTENT.CRYS;

  function shardArt(c) {
    const cc = CRYS[c % CRYS.length];
    return GP.cache('shard' + c, 24, 24, (g) => {
      g.translate(12, 12);
      g.shadowColor = cc[0]; g.shadowBlur = 6;
      g.fillStyle = cc[0]; g.beginPath(); g.moveTo(0, -8); g.lineTo(5, -1); g.lineTo(0, 8); g.lineTo(-5, -1); g.closePath(); g.fill();
      g.shadowBlur = 0; g.lineWidth = 1.4; g.strokeStyle = cc[1]; g.stroke();
      g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(-2, -4, 2, 4);
    });
  }

  function fire(S, p, vx, vy) {
    LA.ents.add(S, 'shard', { x: p.x + p.w / 2, y: p.y + p.h * 0.32, vx: p.face * vx, vy, c: (S.tick + p.idx * 3) % 5, owner: p });
    GP.sfx('shoot', { p: p.idx });
  }
  LA.shoot = function (S, p) {
    if (S.state !== 'play' || p.ghost || !p.active || p.shotCD > 0) return;
    if (p.power !== 'blast') {
      if (S.run.crystals < THROW_COST) { LA.pop(S, p.x + p.w / 2, p.y - 24, 'need ' + THROW_COST + ' crystals', '#8fbfff'); p.shotCD = 0.15; GP.sfx('denied'); return; }
      S.run.crystals -= THROW_COST;
    }
    p.shotCD = 0.28; fire(S, p, 6.2, -5.4);
  };
  LA.shootHeld = function (S, p) {
    if (p.power !== 'blast' || p.shotCD > 0 || S.state !== 'play' || p.ghost) return;
    p.shotCD = 0.2; fire(S, p, 7.5, -3.2);
  };

  // ---- player shard ----
  LA.ents.define('shard', (o) => ({
    x: o.x, y: o.y, w: 8, h: 8, vx: o.vx, vy: o.vy, c: o.c || 0, owner: o.owner, layer: 'front', always: true, rot: 0, life: 3,
    update(S, dt) {
      const k = dt * 60 / (S.fx.slow || 1);                          // your own shots ignore CHILL
      this.vy += SHARD_GRAV * k; this.x += this.vx * k; this.y += this.vy * k; this.rot += 0.35 * k; this.life -= dt;
      const cx = LA.camera.x, VW = LA.view.VW;
      if (this.life <= 0 || this.y > K.VH + 60 || this.x < cx - 80 || this.x > cx + VW + 120) { this.dead = true; return; }
      if (this.y >= GY - 2 && this.y < GY + 30 && LA.phys.floorAt(S, this.x)) { this.dead = true; spark(S, this.x, GY - 4, this.c); return; }
      for (const s of S.solids) {                                      // blocks / hurdles stop it
        if (s.oneway || s.deck) continue;
        if (this.x > s.x && this.x < s.x + s.w && this.y > s.y && this.y < s.y + s.h) { this.dead = true; spark(S, this.x, this.y, this.c); return; }
      }
      for (const e of S.ents) {
        if (!e.onShot || e === this || e.dead || !e.alive || e.dying || e.x > this.x + 160 || e.x + (e.w || 0) < this.x - 160) continue;
        const b = e.box ? e.box() : e;
        if (this.x > b.x - 5 && this.x < b.x + b.w + 5 && this.y > b.y - 5 && this.y < b.y + b.h + 5) { if (e.onShot(S, this)) { this.dead = true; return; } }
      }
      const B = S.boss;
      if (B && B.onShot && !B.defeated) {
        const b = B.box ? B.box() : B;
        if (this.x > b.x && this.x < b.x + b.w && this.y > b.y && this.y < b.y + b.h && B.onShot(S, this)) { this.dead = true; }
      }
    },
    draw(ctx) {
      ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.rot);
      if (!LA.items.draw(ctx, 'Shard', -12, -12, 24, 24)) { const a = shardArt(this.c); ctx.drawImage(a.cv, -16, -16, 32, 32); }   // itemShard (ITEM-ART.md)
      ctx.restore();
    },
  }));
  function spark(S, x, y, c) { LA.ents.add(S, 'gpfx', { mode: 'spark', x, y, c }); }

  // ---- enemy projectiles ----
  function ticketArt() {
    return GP.cache('ticket', 22, 16, (g) => {
      g.fillStyle = '#fffbe8'; g.strokeStyle = '#191921'; g.lineWidth = 2; GP.rr(g, 1, 1, 20, 14, 2); g.fill(); g.stroke();
      g.fillStyle = '#e2363f'; g.fillRect(3, 3, 16, 4);
      g.fillStyle = '#191921'; g.fillRect(4, 9, 12, 1.5); g.fillRect(4, 12, 8, 1.5);
      g.font = 'bold 4px ' + LA.FONT; g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('FINE', 11, 5.2);
    });
  }
  function newsArt() {
    return GP.cache('breaking', 58, 18, (g) => {
      g.fillStyle = '#e2363f'; g.strokeStyle = '#191921'; g.lineWidth = 2.5;
      GP.rr(g, 2, 2, 54, 14, 4); g.fill(); g.stroke();
      GP.text(g, 'BREAKING', 29, 9.5, 9, '#fff', '#7a0d14', 2);
    });
  }
  LA.ents.define('eshot', (o) => ({
    x: o.x, y: o.y, w: o.style === 'news' ? 44 : 16, h: o.style === 'news' ? 14 : 12, vx: o.vx, vy: o.vy || 0, grav: o.grav || 0,
    style: o.style || 'ticket', life: o.life || 4, layer: 'front', always: true, rot: 0,
    update(S, dt) {
      const k = dt * 60;
      this.vy += this.grav * k; this.x += this.vx * k; this.y += this.vy * k; this.rot += 0.2 * k; this.life -= dt;
      if (this.life <= 0 || this.y > K.VH + 40) { this.dead = true; return; }
      if (this.grav && this.y + this.h >= GY && LA.phys.floorAt(S, this.x + this.w / 2)) { this.dead = true; LA.ents.add(S, 'gpfx', { mode: 'poof', x: this.x + this.w / 2, y: GY - 6 }); }
    },
    touch(S, p) {
      if (LA.powers.invincible(S, p)) { this.dead = true; return; }
      if (p.hurt(S, 'shot')) this.dead = true;
    },
    onShot(S) { this.dead = true; LA.ents.add(S, 'gpfx', { mode: 'poof', x: this.x + this.w / 2, y: this.y + this.h / 2 }); return true; },
    draw(ctx) {
      if (this.style === 'news') { if (LA.items.draw(ctx, 'ShotBreaking', this.x + this.w / 2 - 29, this.y + this.h / 2 - 9, 58, 18)) return; const a = newsArt(); ctx.save(); ctx.translate(this.x + this.w / 2, this.y + this.h / 2); ctx.drawImage(a.cv, -29, -9, 58, 18); ctx.restore(); return; }
      ctx.save(); ctx.translate(this.x + 8, this.y + 6); ctx.rotate(this.rot);
      if (!LA.items.draw(ctx, 'ShotTicket', -11, -8, 22, 16)) { const a = ticketArt(); ctx.drawImage(a.cv, -11, -8, 22, 16); }
      ctx.restore();
    },
  }));
})();
