// src/setpieces/kult.js — OWNER: setpieces agent.
// TEMPER TANTRUM KULT (DTLA, design doc §10): the viral-squatter-kids bit, played for laughs at the
// livestream-clout, not at anyone's housing. At building 'bTemperTantrumKult' a pink KULT tag is sprayed
// on the street ('kultTag'), a phone-on-a-ring-light is streaming, and two kult kids ('kultKid') hop
// around it chanting. Get close and they throw a tantrum at you; stomp one and he's GROUNDED — runs off
// yelling for his mom. Both grounded = KULT DISBANDED.
// If the level listing 'kult' doesn't contain the building (it's in 3-4, one block past VVS), the bit is
// staged near the end of that level instead so it's never lost.
(function () {
  'use strict';
  const LA = window.LA, SP = LA.setpieces, GY = LA.K.GY;
  const CHANTS = ['THIS IS OUR HOUSE NOW', 'LIKE & SUBSCRIBE', 'MANIFESTING RENT-FREE', 'NO ADULTS ALLOWED', 'WE ARE THE KULT', 'CHAT, WATCH THIS'];
  const TANTRUM = ['YOU\'RE NOT MY DAD!', 'I\'M TELLING MY FOLLOWERS', 'THIS IS HARASSMENT!!', 'UGHHHH!!'];

  LA.ents.define('spKultKid', (o) => ({
    x: o.x, y: GY - 50, w: 20, h: 50, vx: 0, vy: 0, jy: 0, home: o.x, ph: o.ph, mode: 'ritual', face: 1, t: o.ph, say: o.idx, idx: o.idx,
    layer: 'mid', always: true, foe: true, noGate: true, setpiece: 'kult', hitCD: 0, gone: 0, art: ['kultKid'],
    update(S, dt) {
      this.t += dt; if (this.hitCD > 0) this.hitCD--;
      if (this.gone) { this.gone -= dt; this.x += this.face * 5.5; this.jy = -Math.abs(Math.sin(this.t * 14)) * 8; if (this.gone <= 0) this.dead = true; return; }
      const p = SP.lead(S);
      if (this.mode === 'ritual') {                                          // hopping in circles round the tag
        this.x = this.home + Math.sin(this.t * 1.6) * 46; this.face = Math.cos(this.t * 1.6) >= 0 ? 1 : -1;
        this.jy = -Math.abs(Math.sin(this.t * 6)) * 14;
        if (p && Math.abs(p.cx - this.x) < 330) { this.mode = 'tantrum'; this.say = Math.floor(S.rng() * TANTRUM.length); }
      } else {                                                               // stomping, flailing charge
        const d = p ? LA.sign(p.cx - (this.x + this.w / 2)) : this.face;
        if (d) this.face = d;
        this.vx += (this.face * 2.3 * (S.tier.speed || 1) - this.vx) * 0.08;
        this.x += this.vx;
        this.x = LA.clamp(this.x, this.home - 520, this.home + 520);
        this.vy += 0.7; this.jy += this.vy; if (this.jy >= 0) { this.jy = 0; this.vy = S.rng() < 0.04 ? -8 : 0; }
        if (Math.floor(this.t / 2.4) !== Math.floor((this.t - dt) / 2.4)) this.say = (this.say + 1) % TANTRUM.length;
      }
      this.y = GY - this.h + this.jy;
    },
    touch(S, p) {
      if (this.gone) return;
      const r = SP.contact(S, this, p);
      if (r === 'stomp' || r === 'plough') this.ground(S);
    },
    onShot(S) { if (this.gone) return false; this.ground(S); return true; },
    kill(S) { if (!this.gone) this.ground(S); },
    ground(S) {
      this.gone = 1.8; this.defeated = true; S.stats.kills++; S.run.kills++;
      const p = SP.lead(S); this.face = p && p.cx > this.x ? -1 : 1;
      LA.pop(S, this.x + 10, this.y - 30, 'GROUNDED!', '#ff6fae', true);
    },
    draw(ctx, S) {
      ctx.save(); if (this.gone) ctx.globalAlpha = Math.min(1, this.gone);
      SP.sprite(ctx, 'kultKid', this.x + this.w / 2, GY + 3 + this.jy, 64, this.face < 0, this.mode === 'tantrum' && !this.gone ? Math.sin(this.t * 20) * 0.08 : 0);
      ctx.restore();
      const cx = this.x + this.w / 2, top = GY - 64 + this.jy - this.idx * 22;   // stagger the two kids' bubbles
      if (this.gone) SP.bubble(ctx, 'MOOOOM!!', cx, top - 4, '#c1121f', 11);
      else if (this.mode === 'ritual') { if ((this.t + this.ph) % 5 < 2.6) SP.bubble(ctx, CHANTS[(this.say + Math.floor(this.t / 5)) % CHANTS.length], cx, top - 4, '#b0126a', 10); }
      else SP.bubble(ctx, TANTRUM[this.say], cx, top - 4, '#c1121f', 10);
    },
  }));

  // livestream rig: phone on a ring light + a cardboard sign — drawn once, offscreen
  function rigArt() {
    return SP.cached('kultRig', 64, 96, (c) => {
      c.strokeStyle = '#1a1020'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(32, 40); c.lineTo(18, 94); c.moveTo(32, 40); c.lineTo(46, 94); c.moveTo(32, 40); c.lineTo(32, 94); c.stroke();
      c.lineWidth = 7; c.strokeStyle = '#1a1020'; c.beginPath(); c.arc(32, 24, 18, 0, 7); c.stroke();
      c.lineWidth = 4; c.strokeStyle = '#fff6e8'; c.beginPath(); c.arc(32, 24, 18, 0, 7); c.stroke();
      c.fillStyle = '#1a1020'; c.fillRect(25, 12, 14, 24); c.fillStyle = '#4dc8ff'; c.fillRect(27, 14, 10, 18);
      c.fillStyle = '#e8203a'; c.fillRect(2, 2, 22, 11); c.fillStyle = '#fff'; c.font = 'bold 8px ' + LA.FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('LIVE', 13, 8);
    });
  }
  function signArt() {
    return SP.cached('kultSign', 84, 70, (c) => {
      c.fillStyle = '#6b4a2a'; c.fillRect(39, 30, 6, 40);
      c.fillStyle = '#c99a5b'; c.strokeStyle = '#1a1020'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(4, 6); c.lineTo(80, 2); c.lineTo(78, 38); c.lineTo(6, 40); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#e8207a'; c.font = 'bold 12px ' + LA.FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('KULT HQ', 42, 14); c.font = 'bold 9px ' + LA.FONT; c.fillStyle = '#1a1020'; c.fillText('NO ADULTS!!', 42, 29);
    });
  }

  function geo(lv) {
    const bwx = LA.city.buildingWorldX('bTemperTantrumKult');
    const ax = SP.inLevel(lv, bwx, 0) ? SP.visualX('bTemperTantrumKult') : null;
    if (ax != null && SP.inLevel(lv, ax, -300)) return { ax, staged: false };
    return { ax: lv.goalX != null ? lv.goalX - 1300 : (lv.arena ? lv.arena.x - 1100 : lv.x1 - 1500), staged: true };   // building isn't in this level: stage it near the end
  }
  SP.register('kult', {
    reserve(lv) { const g = geo(lv); return [[g.ax - 300, g.ax + 300]]; },
    init(S, lv) {
      const { ax, staged } = geo(lv);
      SP.art(S, ['kultKid', 'kultTag', 'obBarricade']);
      SP.clearRange(S, ax - 300, ax + 300, (e) => SP.isFoe(e));
      SP.fillGround(S, ax - 140, ax + 140);
      S.potholes = S.potholes.filter((x) => x + 60 < ax - 160 || x > ax + 160);
      return { ax, staged, kids: [], on: false, done: false };
    },
    update(S, sp, dt) {
      const p = SP.lead(S); if (!p || sp.done) return;
      if (!sp.on && p.cx > sp.ax - LA.view.VW * 0.9) {
        sp.on = true;
        sp.kids = [-40, 44].map((dx, i) => LA.ents.add(S, 'spKultKid', { x: sp.ax + dx, ph: i * 1.9, idx: i }));
      }
      if (sp.on && !sp.banner && p.cx > sp.ax - 380) { sp.banner = true; SP.banner(S, 'TEMPER TANTRUM KULT', 'THEY WENT VIRAL. THEY WON\'T LEAVE.', 2.6); S.flags.kult = 'active'; }
      if (sp.on && sp.kids.every((k) => k.gone || k.dead)) {
        sp.done = true; S.flags.kult = 'disbanded';
        LA.game.score(S, 1000, p.cx, p.y - 50);
        LA.pop(S, sp.ax, GY - 150, 'KULT DISBANDED', '#ff6fae', true);
        LA.pop(S, sp.ax, GY - 126, 'go home, your parents miss you', '#ffc4de');
      }
    },
    draw(ctx, S, sp, layer) {
      if (!LA.camera.visible(sp.ax - 200, 400, 40)) return;
      if (layer === 'ground') {                                              // the tag, sprayed flat on the street
        const im = LA.img('kultTag'); if (!im) return;
        ctx.save(); ctx.globalAlpha = 0.9; ctx.drawImage(im, Math.round(sp.ax - 95), GY + 8, 190, 74); ctx.restore();
      } else if (layer === 'back') {
        const rig = rigArt(), sign = signArt();
        if (sign) ctx.drawImage(sign, Math.round(sp.ax - 170), GY - 70);
        if (rig) ctx.drawImage(rig, Math.round(sp.ax + 110), GY - 96);
      }
    },
  });
})();
