// src/setpieces/concert.js — OWNER: setpieces agent.
// VENICE BEACH (1-1): PG 308 x JUST TERRY are playing the beach stage (building 'bStageConcert').
// Port of his ccSong/ccTick (lost-angeles-ed.html 501-536): the song (assets/bld/clarity.mp3, started
// 10 s in) swells as you approach the stage; get close and an HOA officer storms in — "PERMIT VIOLATION!" —
// the music cuts and the performers freeze (LA.city.concertStopped). Stomp the HOA -> "CONCERT BACK ON!"
// and the song plays out, fading with distance. Audio stops when the level ends.
(function () {
  'use strict';
  const LA = window.LA, SP = LA.setpieces, GY = LA.K.GY;
  const SONG = 'assets/bld/clarity.mp3', CC_START = 10, HEAR = 2800;
  const YELLS = ['PERMIT VIOLATION!', 'NOISE ORDINANCE 12.4(b)!', 'QUIET HOURS START AT 4PM!', 'WHERE IS YOUR FORM 88-C?', 'THIS IS A RESIDENTIAL BEACH!'];

  // the HOA officer — a Mario foe: stomp him, don't touch his clipboard side
  LA.ents.define('spHoa', (o) => ({
    x: o.x, y: GY - 58, w: 30, h: 58, vx: -0.9, face: -1, minX: o.minX, maxX: o.maxX, layer: 'mid', always: true,
    foe: true, noGate: true, setpiece: 'concert', hitCD: 0, yellT: 0.2, yell: 0, art: ['hoa1'], t: 0, down: 0,
    update(S, dt) {
      this.t += dt; if (this.hitCD > 0) this.hitCD--;
      if (this.down) { this.down -= dt; this.y += 3; this.x += this.face * -2; if (this.down <= 0) this.dead = true; return; }
      this.x += this.vx;
      if (this.x < this.minX) { this.x = this.minX; this.vx = Math.abs(this.vx); } else if (this.x > this.maxX) { this.x = this.maxX; this.vx = -Math.abs(this.vx); }
      const p = SP.lead(S); if (p && Math.abs(p.cx - this.x) < 260) this.vx = LA.sign(p.cx - (this.x + this.w / 2)) * 1.25 || this.vx;   // marches at you
      this.face = this.vx < 0 ? -1 : 1;
      this.yellT -= dt; if (this.yellT <= 0) { this.yellT = 2.6; this.yell = (this.yell + 1) % YELLS.length; }
    },
    touch(S, p) {
      if (this.down) return;
      const r = SP.contact(S, this, p);
      if (r === 'stomp' || r === 'plough') this.defeat(S);
    },
    onShot(S) { if (this.down) return false; this.defeat(S); return true; },
    kill(S) { if (!this.down) this.defeat(S); },
    defeat(S) {
      if (this.down) return; this.down = 0.7; this.defeated = true;
      LA.pop(S, this.x + 15, this.y - 30, 'CITATION VOIDED!', '#57e08a', true);
      S.stats.kills++; S.run.kills++;
    },
    draw(ctx, S) {
      const bob = this.down ? 0 : Math.abs(Math.sin(this.t * 7)) * 2;
      ctx.save(); if (this.down) ctx.globalAlpha = Math.max(0, this.down / 0.7);
      // Saint never flips the hoa* art (drawFoes@2025) — it's a front-on officer
      SP.sprite(ctx, 'hoa1', this.x + this.w / 2, this.y + this.h + 2 - bob, 74, false, this.down ? 0.9 : 0);
      ctx.restore();
      if (!this.down && this.t > 0.3) SP.bubble(ctx, YELLS[this.yell], this.x + this.w / 2, this.y - 22, '#c1121f', 11);
    },
  }));

  SP.register('concert', {
    init(S, lv) {
      LA.city.concertStopped = false;
      const span = LA.city.buildingSpan('bStageConcert');
      if (!span) return { off: true };
      const stageX = (span[0] + span[1]) / 2;
      if (!SP.inLevel(lv, stageX, 1500)) return { off: true };
      SP.art(S, ['hoa1']);
      const A = lv.arena, lim = A ? A.x - 90 : stageX + 500;                // the officer never wanders into the boss arena
      const trig = Math.min(stageX - 620, lim - 560);
      return { stageX, trig, lim, state: 0, armed: false, hoa: null, song: null };
    },
    update(S, sp, dt) {
      if (sp.off) return;
      SP.resumeHeld();
      const p = SP.lead(S); if (!p) return;
      if (!sp.song) sp.song = SP.track(SONG, { at: CC_START });
      const s = sp.song, d = Math.abs(p.cx - sp.stageX), vol = Math.max(0, Math.min(1, 1 - d / HEAR));
      const duck = S.arena && S.arena.sealed ? 0.45 : 1;                     // sit under the boss music in the arena
      if (sp.state === 0) {
        s.volume(Math.pow(vol, 1.2));
        if (vol > 0.02) s.play(); else s.pause();
        if (p.cx < sp.trig) sp.armed = true;                                // (a respawn past the stage never re-triggers it)
        if (sp.armed && p.cx > sp.trig) {                                    // the HOA storms the beach
          sp.state = 1; s.pause(); LA.city.concertStopped = true;
          const VW = LA.view.VW, sx = Math.min(sp.lim - 40, p.cx + Math.min(VW * 0.42, 360));
          sp.hoa = LA.ents.add(S, 'spHoa', { x: sx, minX: sp.trig - 700, maxX: sp.lim - 40 });
          LA.pop(S, sx, GY - 150, 'PERMIT VIOLATION!', '#ff5a5a', true);
          LA.camera.kick(3); SP.sfx('denied');
          S.flags.concert = 'stopped';
        }
      } else if (sp.state === 1) {
        s.pause();
        if (!sp.hoa || sp.hoa.defeated || sp.hoa.dead) {
          sp.state = 2; LA.city.concertStopped = false; S.flags.concert = 'on';
          LA.pop(S, p.cx + 40, GY - 170, 'CONCERT BACK ON!', '#ffc23a', true);
          LA.game.score(S, 1000, p.cx, GY - 130);
          SP.sfx('rescue');
          s.play();
        }
      } else {
        s.volume(Math.pow(vol, 1.2) * duck);                                 // plays out, fades with distance
        if (vol > 0.02) s.play(); else s.pause();
      }
    },
    draw(ctx, S, sp, layer) {
      if (sp.off || layer !== 'screen') return;
      SP.holdForOverlay();
      if (sp.state === 1) {                                                  // "music cut" badge while the HOA is up
        const VW = LA.view.VW;
        SP.text(ctx, '♪ MUSIC CUT BY HOA ♪', VW / 2, 92, 15, '#ff6fae');
      }
    },
  });
})();
