// src/setpieces/heist.js — OWNER: setpieces agent.
// DTLA (3-4): THEY HIT VVS. Port of startHeist / updateHeist / drawHeist (lost-angeles-ed.html 1609-1672):
// reach the Vintage Vault Supply shopfront ('bVintageVaultSupply') and two looters bolt out with armfuls
// of merch ('vvsLoot' -> 'vvsThief' once empty). Stomp one and he drops a piece — grab it, it's yours.
// A hit makes him bolt, then he runs out of breath (THIEF_BOLT / THIEF_TIRED rhythm). Empty both = VVS
// RECOVERED. Leave them holding and they get away to the crew's hideout.
// Coordination for the VVS CREW boss (bosses agent), all on S.flags:
//   heist: 'active'|'recovered'|'escaped'   heistLoot: pieces you picked up   heistDropped: knocked loose
//   heistEscaped: pieces still in the crew's hands   heistTotal: 6
(function () {
  'use strict';
  const LA = window.LA, SP = LA.setpieces, GY = LA.K.GY;
  const THIEF_RUN = 3.2, THIEF_BOLT = 6.4, THIEF_TIRED = 1.9, MERCH = 3, DRAW_H = 62;
  const ITEMS = [{ n: 'VVS CREWNECK', body: '#15161c', trim: '#2a2c36', mark: '#d9b24a' }, { n: 'VVS TEE', body: '#efe6d2', trim: '#d8ccb0', mark: '#15161c' }];

  function merchArt(i) {
    const it = ITEMS[i];
    return SP.cached('vvsMerch' + i, 30, 26, (c) => {
      c.lineWidth = 2; c.strokeStyle = '#120d10'; c.fillStyle = it.body;
      c.beginPath(); c.moveTo(9, 3); c.lineTo(3, 7); c.lineTo(1, 13); c.lineTo(6, 14); c.lineTo(7, 24); c.lineTo(23, 24); c.lineTo(24, 14); c.lineTo(29, 13); c.lineTo(27, 7); c.lineTo(21, 3);
      c.quadraticCurveTo(15, 8, 9, 3); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = it.trim; c.fillRect(8, 21, 14, 2); if (i === 0) { c.fillRect(2, 11, 4, 2); c.fillRect(24, 11, 4, 2); }
      c.fillStyle = it.mark; c.font = 'bold 8px ' + LA.FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(i === 0 ? '♛' : 'VV', 15, 14);
    });
  }

  // loot on the ground — yours once it lands
  LA.ents.define('spMerch', (o) => ({
    x: o.x, y: o.y, w: 22, h: 20, vx: o.vx, vy: o.vy, item: o.item, life: 11, t: 0, layer: 'mid', always: true, pickup: true, setpiece: 'heist',
    update(S, dt) {
      this.t += dt; this.life -= dt;
      if (this.life <= 0) { this.dead = true; return; }
      const r = LA.phys.move(S, this, { grav: 0.5, maxFall: 10 });
      if (r.onGround) this.vx *= 0.8;
      if (this.y > LA.view.VH + 40) this.dead = true;
    },
    touch(S, p) {
      if (this.t < 0.35) return;
      this.dead = true;
      S.flags.heistLoot = (S.flags.heistLoot || 0) + 1;
      LA.game.score(S, 300); LA.game.addCrystals(S, 2, this.x, this.y);
      LA.pop(S, this.x + 10, this.y - 14, ITEMS[this.item].n + ' +300', '#ffb454');
      SP.sfx('crystal');
    },
    draw(ctx, S) {
      if (this.life < 2.5 && Math.floor(this.life * 8) % 2) return;       // blinks before it's gone
      const art = merchArt(this.item), bob = Math.sin(this.t * 5) * 1.5;
      ctx.fillStyle = 'rgba(255,194,58,.35)'; ctx.beginPath(); ctx.arc(this.x + 11, this.y + 10 + bob, 15, 0, 7); ctx.fill();
      if (art) ctx.drawImage(art, Math.round(this.x - 4), Math.round(this.y - 4 + bob));
    },
  }));

  // a looter: runs, bolts when hit, gets tired; sealed inside the heist stretch until you empty him
  LA.ents.define('spThief', (o) => ({
    x: o.x, y: GY - 48, w: 28, h: 48, vx: 0, dir: 1, merch: MERCH, bolt: 0, tired: 0, gone: 0,
    x0: o.x0, x1: o.x1, layer: 'mid', always: true, foe: true, noGate: true, setpiece: 'heist', hitCD: 0, t: 0, art: ['vvsThief', 'vvsLoot'],
    update(S, dt) {
      this.t += dt; if (this.hitCD > 0) this.hitCD--;
      if (this.gone) { this.gone -= dt; this.x += this.dir * 6.5; if (this.gone <= 0) this.dead = true; return; }
      const spd = this.bolt > 0 ? THIEF_BOLT : (this.tired > 0 ? THIEF_TIRED : THIEF_RUN * (S.tier.speed || 1));
      if (this.bolt > 0) this.bolt -= dt; if (this.tired > 0) this.tired -= dt;
      this.x += spd * this.dir;
      if (this.x < this.x0) { this.x = this.x0; this.dir = 1; }                  // cornered: turn and panic
      if (this.x + this.w > this.x1) { this.x = this.x1 - this.w; this.dir = -1; }
    },
    touch(S, p) {
      if (this.gone) return;
      const r = SP.contact(S, this, p);
      if (r === 'stomp' || r === 'plough') this.hit(S, r === 'plough');
    },
    onShot(S) { if (this.gone || this.hitCD > 0) return false; this.hitCD = 10; this.hit(S); return true; },
    kill(S) { while (this.merch > 0 && !this.gone) this.hit(S); },
    hit(S, all) {
      do {
        if (this.merch <= 0) break;
        this.merch--; this.bolt = 0.35; this.tired = 1.4;
        LA.ents.add(S, 'spMerch', { x: this.x + 4, y: this.y + 4, vx: (S.rng() - 0.5) * 5, vy: -5 - S.rng() * 3, item: this.merch % 2 });
        S.flags.heistDropped = (S.flags.heistDropped || 0) + 1;
        LA.game.score(S, 350);
        LA.pop(S, this.x + 14, this.y - 12, this.merch ? '+350' : 'ARMS EMPTY!', this.merch ? '#ffb454' : '#41ff6b', !this.merch);
      } while (all);
      if (this.merch <= 0) { this.gone = 1.4; this.defeated = true; S.stats.kills++; S.run.kills++; const p = SP.lead(S); this.dir = p && p.cx > this.x ? -1 : 1; }
    },
    draw(ctx, S) {
      const key = this.merch > 0 ? 'vvsLoot' : 'vvsThief', bob = Math.abs(Math.sin(this.t * (this.bolt > 0 ? 18 : 11))) * 2;
      ctx.save(); if (this.gone) ctx.globalAlpha = Math.min(1, this.gone);
      SP.sprite(ctx, key, this.x + this.w / 2, this.y + this.h + 3 - bob, DRAW_H, this.dir > 0);   // his art faces left
      ctx.restore();
      if (this.gone) return;
      ctx.fillStyle = '#1a1020'; ctx.fillRect(Math.round(this.x - 1), Math.round(this.y - 26), MERCH * 10 + 2, 10);
      for (let i = 0; i < MERCH; i++) { ctx.fillStyle = i < this.merch ? '#ffb454' : '#4a3b2a'; ctx.fillRect(Math.round(this.x + 1 + i * 10), Math.round(this.y - 24), 8, 6); }
      if (this.tired > 0 && this.bolt <= 0) SP.text(ctx, '💦', this.x + this.w + 4, this.y - 4, 12, '#bfe9ff');
    },
  }));

  function geo(lv) { const bx = LA.city.buildingWorldX('bVintageVaultSupply'); return SP.inLevel(lv, bx, 0) ? bx - 260 : null; }   // his heistX (buildLevel@718)
  SP.register('heist', {
    reserve(lv) { const h = geo(lv); return h == null ? [] : [[h - 60, h + 1000]]; },
    init(S, lv) {
      const heistX = geo(lv); if (heistX == null) return { off: true };
      SP.art(S, ['vvsThief', 'vvsLoot']);
      SP.clearRange(S, heistX - 60, heistX + 1000, (e) => SP.isFoe(e));      // the looters own this block
      S.flags.heistTotal = MERCH * 2; S.flags.heistLoot = 0; S.flags.heistDropped = 0; S.flags.heistEscaped = 0;
      return { heistX, on: false, done: false, thieves: [], x0: 0, x1: 0, t: 0 };
    },
    update(S, sp, dt) {
      if (sp.off || sp.done) return;
      const p = SP.lead(S); if (!p) return;
      if (!sp.on) {
        if (p.x > sp.heistX && p.x < sp.heistX + 520) {                      // startHeist(p.x-40)
          const x0 = p.x - 40; sp.on = true; sp.t = 0; sp.x0 = x0 - 40; sp.x1 = x0 + 900;
          sp.thieves = [150, 245].map((dx) => LA.ents.add(S, 'spThief', { x: x0 + dx, x0: sp.x0, x1: sp.x1 }));
          SP.banner(S, 'THEY HIT VVS', 'CHASE THEM DOWN', 2.4);
          S.flags.heist = 'active'; SP.sfx('denied');
        }
        return;
      }
      sp.t += dt;
      const holding = sp.thieves.filter((t) => !t.gone && !t.dead && t.merch > 0);
      if (!holding.length) {
        sp.done = true; S.flags.heist = 'recovered'; S.flags.heistEscaped = 0;
        LA.game.score(S, 2500, p.cx, p.y - 40);
        SP.banner(S, 'VVS RECOVERED', 'THE CREW WANTS IT BACK', 2.6);
        return;
      }
      if (p.x > sp.x1 + 380) {                                                // you ran past them — they get away
        sp.done = true; S.flags.heist = 'escaped';
        S.flags.heistEscaped = holding.reduce((n, t) => n + t.merch, 0);
        holding.forEach((t) => { t.gone = 2; t.defeated = true; t.dir = 1; t.touch = null; });
        LA.pop(S, p.cx, p.y - 60, 'THEY GOT AWAY WITH ' + S.flags.heistEscaped + '!', '#ff8a8a', true);
      }
    },
    draw(ctx, S, sp, layer) {
      if (sp.off || layer !== 'back' || !sp.on || sp.done) return;
      if (!LA.camera.visible(sp.x0, sp.x1 - sp.x0, 0)) return;
      // hazard tape on the ground at the heist block's edges (where they turn back)
      for (const x of [sp.x0 - 4, sp.x1 + 4]) {
        ctx.fillStyle = '#ffd23a'; ctx.fillRect(Math.round(x) - 3, GY - 70, 6, 70);
        ctx.fillStyle = '#1a1020'; for (let y = GY - 70; y < GY; y += 14) ctx.fillRect(Math.round(x) - 3, y, 6, 6);
      }
    },
  });
})();
