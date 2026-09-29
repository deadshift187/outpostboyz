// src/setpieces/paparazzi.js — OWNER: setpieces agent.
// PLAYA VISTA (5-1): the TWZ paparazzi swarm. Port of the papz logic in his update() (lost-angeles-ed.html
// 1167-1194): a few trickle in, then they flood from BOTH sides as you near the TWZ HOSTS, all chasing you
// and popping blinding flash whiteouts (LA.game.flash) when you're in frame and close. Stomp them or let
// them hound you; at the boss they pile in (capped so the fight stays readable); beating TWZ disperses
// them. Art: 'paparazzi', 'paparazziF', 'pressCam2'.  S.flags.papz = live count, S.flags.papzSwarm.
(function () {
  'use strict';
  const LA = window.LA, SP = LA.setpieces, GY = LA.K.GY;
  const TYPES = ['paparazzi', 'pressCam2', 'paparazziF'];
  const QUIPS = ['NO PHOTOS!', 'EXCLUSIVE!', 'OVER HERE!', 'WHO ARE YOU WEARING?', 'ONE MORE!'];

  function burstArt() {                                                      // lens flash starburst, drawn once
    return SP.cached('papzBurst', 64, 64, (c) => {
      c.fillStyle = '#fffbe0'; c.strokeStyle = '#ffd23a'; c.lineWidth = 2; c.beginPath();
      for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, r = i % 2 ? 12 : 30; c.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
      c.closePath(); c.fill(); c.stroke(); c.fillStyle = '#fff'; c.beginPath(); c.arc(32, 32, 9, 0, 7); c.fill();
    });
  }

  LA.ents.define('spPapz', (o) => ({
    x: o.x, y: GY - 40, w: 26, h: 40, vx: 0, type: o.type, face: 1, t: o.t || 0, layer: 'mid', always: true, foe: true, noGate: true, setpiece: 'paparazzi',
    papz: true, hitCD: 0, flashCD: o.flashCD, flashPop: 0, flee: 0, gone: 0, spd: o.spd, art: TYPES,
    update(S, dt) {
      this.t += dt; if (this.hitCD > 0) this.hitCD--; if (this.shoveCD > 0) this.shoveCD--;
      if (this.gone) { this.gone -= dt; this.x += this.face * 6; if (this.gone <= 0) this.dead = true; return; }
      if (this.flee) { this.flee -= dt; this.x += this.face * 5.5; if (this.flee <= 0) this.dead = true; return; }
      const p = SP.lead(S); if (!p) return;
      const cd = LA.sign(p.cx - (this.x + this.w / 2)) || 1;                 // hound the player
      this.vx = cd * this.spd; this.face = cd; this.x += this.vx * (S.fx.slow || 1);
      if (this.lo != null) this.x = LA.clamp(this.x, this.lo, this.hi);
      if (this.flashPop > 0) this.flashPop -= dt;
      this.flashCD -= dt;
      if (this.flashCD <= 0) {
        this.flashCD = 1.8 + S.rng() * 2.4;
        if (LA.camera.visible(this.x, this.w, -20) && Math.abs(this.x - p.x) < 210) { LA.game.flash(S, '#ffffff', Math.min(0.92, S.fx.flash + 0.95)); this.flashPop = 0.18; SP.sfx('splash', { vol: 0.4 }); }
      }
    },
    touch(S, p) {
      if (this.gone || this.flee) return;
      // inside the TWZ arena the hosts are the threat: a photographer can be stomped, but bumping one only shoves you
      if (this.lo != null && !LA.phys.stompedFrom(p, this)) { if (!this.shoveCD) { p.vx = (p.cx < this.x + this.w / 2 ? -1 : 1) * 5; p.vy = Math.min(p.vy, -3); this.shoveCD = 30; } return; }
      const r = SP.contact(S, this, p);
      if (r === 'stomp' || r === 'plough') this.down(S, QUIPS[Math.floor(S.rng() * QUIPS.length)]);
    },
    onShot(S) { if (this.gone || this.flee) return false; this.down(S, 'NO PHOTOS!'); return true; },
    kill(S) { if (!this.gone && !this.flee) this.down(S, 'NO COMMENT!'); },
    down(S, txt) {
      this.gone = 0.8; this.defeated = true; S.stats.kills++; S.run.kills++;
      const p = SP.lead(S); this.face = p && p.cx > this.x ? -1 : 1;
      LA.pop(S, this.x + 13, this.y - 28, txt, '#ffc4de');
    },
    draw(ctx, S) {
      const key = this.type, bob = Math.abs(Math.sin(this.t * 10)) * 2;
      ctx.save(); if (this.gone) ctx.globalAlpha = Math.max(0, this.gone / 0.8);
      SP.sprite(ctx, key, this.x + this.w / 2, this.y + this.h + 3 - bob, 60, this.face > 0, this.gone ? 0.6 * this.face : 0);   // his papz art faces left
      ctx.restore();
      if (this.flashPop > 0) { const b = burstArt(); if (b) { const s = 40 + this.flashPop * 120; ctx.drawImage(b, this.x + this.w / 2 + this.face * 14 - s / 2, this.y + 8 - s / 2, s, s); } }
    },
  }));

  SP.register('paparazzi', {
    init(S, lv) {
      const zi = LA.city.zones.findIndex((z) => z.papz); if (zi < 0) return { off: true };
      const s = LA.city.seg[zi];
      const a = Math.max(lv.x0, s[0]), b = lv.arena ? lv.arena.x + lv.arena.w : Math.min(lv.x1, s[1] + 820);
      if (b <= a + 300) return { off: true };
      SP.art(S, TYPES);
      return { a, b, s0: a, s1: lv.arena ? lv.arena.x : s[1], T: 0.8, done: false, list: [] };
    },
    update(S, sp, dt) {
      if (sp.off) return;
      const p = SP.lead(S); if (!p) return;
      sp.list = sp.list.filter((e) => !e.dead);
      const live = sp.list.filter((e) => !e.gone && !e.flee);
      S.flags.papz = live.length;
      const A = S.arenas.find((X) => X.level === sp.level);
      if (!sp.done && A && A.cleared) {                                      // TWZ beaten -> the swarm disperses
        sp.done = true; S.flags.papzSwarm = false;
        live.forEach((e) => { e.flee = 1.6; e.defeated = true; e.face = e.x > p.cx ? 1 : -1; });
        if (live.length) LA.pop(S, p.cx, p.y - 70, 'SWARM DISPERSED', '#ffc4de', true);
        return;
      }
      if (sp.done || p.cx < sp.a || p.cx > sp.b) return;
      S.flags.papzSwarm = true;
      const inArena = A && A.sealed;
      const prog = LA.clamp((p.cx - sp.s0) / Math.max(1, sp.s1 - sp.s0), 0, 1);
      const dens = S.tier.density || 0.72;
      // in the TWZ arena the HOSTS are the fight — the swarm only adds one photographer (TOURIST none)
      const cap = inArena ? (dens > 0.5 ? 1 : 0) :Math.round((2 + prog * 11) * (0.5 + dens * 0.5));
      const rate = inArena ? 2.6 : Math.max(0.45, 1.7 - prog * 1.3);           // his 2.2->0.5 ramp, compressed: Playa Vista is a short street
      if (inArena && live.length > cap) for (const e of live.slice(cap)) { if (!e.fleeing) { e.fleeing = true; e.dead = true; } }   // extras scatter when the doors seal
      sp.T -= dt;
      if (sp.T <= 0 && live.length < cap) {
        sp.T = rate;
        const VW = LA.view.VW, side = S.rng() < 0.5 ? -1 : 1;
        const x = p.cx + side * (VW * 0.5 + S.rng() * 120);
        const e = LA.ents.add(S, 'spPapz', { x, type: TYPES[Math.floor(S.rng() * 3)], flashCD: 1 + S.rng() * 2, spd: 1.7 * (S.tier.speed || 1) });
        if (inArena) { e.lo = A.x + 20; e.hi = A.x + A.w - 46; e.x = p.cx - A.x < A.w / 2 ? e.hi : e.lo; }   // pile in from the far wall
        sp.list.push(e);
      }
      if (inArena) for (const e of live) if (e.lo == null) { e.lo = A.x + 20; e.hi = A.x + A.w - 46; if (e.x < e.lo - 40 || e.x > e.hi + 40) { e.dead = true; } }
    },
    draw() {},
  });
})();
