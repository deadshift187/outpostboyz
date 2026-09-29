// src/bosses/bosses.js — OWNER: bosses agent.
// BOSS FRAMEWORK. LA.bosses.spawn(S, name, arena, {hpMul}) -> boss (called by core sealArena).
// Every fight = a def registered with LA.bosses.register(name, def) in fights-*.js. The shared base gives:
// patrol inside the arena, telegraphed attacks (wind-up tells: shake + red flash + "!" + speech bubble),
// Mario stomps (LA.phys.stompedFrom + p.bounce), shard chip damage (boss.onShot / LA.bosses.hitByShard),
// i-frames + white hit flash, 2–3 phases by HP, boss projectiles/hazards/adds as entities (the KIT below),
// a screen-top HP bar with the boss name, blackout overlay, then a death tumble + spinning HEADLINE card.
// A def:
//   { art:'spriteKey' | drawn:'producer', h:104, hit:[w,h], faces:-1 (art faces left), hp, phases:[.66,.33],
//     speed:[p1,p2,p3], cd:[p1,p2,p3], style:'patrol'|'chase'|'keep', headline:[big, small], quips:{2:'',3:''},
//     attacks:{ name:{ ph, maxPh, w, tell, say, rec, cd, max, can(S,b), tellStart(S,b), tellTick(S,b,t,dt),
//                      tellDraw(ctx,S,b), start(S,b), run(S,b,t,dt)->done, end(S,b) } },
//     seq:{1:[names...]}  (optional fixed, learnable order per phase), onStart, onPhase, onHit, onDeath, think,
//     tick (fully custom state machine), move, draw/drawOver, touch, shot, box, harmless }
(function () {
  'use strict';
  const LA = window.LA, K = LA.K, GY = K.GY;
  const B = LA.bosses = { defs: {}, SHARD_DMG: 0.2, STOMP_DMG: 1 };
  const ART = () => LA.bossArt;
  B.register = (name, def) => (B.defs[name] = def);
  B.sfx = (n, o) => { try { if (LA.audio && LA.audio.sfx) LA.audio.sfx(n, o); } catch (e) { /* audio never breaks a fight */ } };
  const hit = new WeakSet();                                          // shards already spent on the boss this life

  // ---------------- players ----------------
  B.live = (S) => S.players.filter((p) => p.active && !p.ghost);
  B.target = function (S, b) {                                        // co-op: nearest live player
    let best = null, bd = 1e9; const cx = b.cx();
    for (const p of S.players) { if (!p.active || p.ghost) continue; const d = Math.abs(p.x + p.w / 2 - cx); if (d < bd) { bd = d; best = p; } }
    return best;
  };
  B.pcx = (p) => p.x + p.w / 2;

  // =====================================================================================================
  // BOSS
  // =====================================================================================================
  class Boss {
    constructor(S, name, A, def, hpMul) {
      this.kind = 'boss'; this.name = name; this.def = def; this.A = A; this.S = S;
      const hb = def.hit || [54, 92];
      this.w = hb[0]; this.h = hb[1];
      this.x = A.x + A.w * (def.startAt || 0.74) - this.w / 2; this.y = GY - this.h;
      this.vx = 0; this.vy = 0; this.air = false; this.face = -1; this.float = false; this.grav = 0.7;
      this.maxHp = Math.max(2, Math.round(def.hp * (hpMul || 1) * 2) / 2); this.hp = this.maxHp; this.shownHp = this.hp;
      this.phase = 1; this.nPh = (def.phases || []).length + 1; this.seqI = 0;
      this.inv = 0; this.flashT = 0; this.shardCD = 0;
      this.st = 'intro'; this.stT = 0; this.t = 0; this.atk = null; this.atkName = null; this.last = null; this.tellT = 0.6; this.stunT = 0;
      this.cd = def.firstCd != null ? def.firstCd : 0.9;
      this.defeated = false; this.doneT = null;
      this.things = []; this.dark = 0; this.darkT = 0; this.darkAmt = 0.88; this.gust = null; this.rage = 0;
      this.anim = { sx: 1, sy: 1, rot: 0, dy: 0, ox: 0 }; this.pose = 0; this.bubble = null; this.hits = 0; this.tint = null;
      this.aggr = (S.tier && S.tier.speed) || 1;
      this.rng = LA.rng(LA.hash('boss:' + name + ':' + (S.tier ? S.tier.id : 'local')));
      this.mem = {};
    }
    cx() { return this.x + this.w / 2; }
    L() { return this.A.x + 18; }
    R() { return this.A.x + this.A.w - 18; }
    box() { return this.def.box ? this.def.box(this) : this; }
    speed() { const d = this.def, s = d.speed ? d.speed[Math.min(d.speed.length, this.phase) - 1] : 1.4; return s * this.aggr * (1 + this.rage * 0.16); }
    say(txt, dur, col) { this.bubble = { txt, t: dur || 1.3, T: dur || 1.3, col: col || '#1b1220' }; }
    go(st) { this.st = st; this.stT = 0; if (st === 'move') this.pose = 0; }
    harmless() { return this.st === 'intro' || this.st === 'phase' || this.st === 'stun' || this.st === 'dying' || (this.def.harmless ? this.def.harmless(this) : false); }
    stun(sec, txt) { this.go('stun'); this.stunT = sec; this.vx = 0; this.pose = 0; if (txt) this.say(txt, Math.min(sec, 2)); }

    update(S, dt) {
      const d = this.def, k = dt * 60;
      this.t += dt; this.stT += dt;
      if (this.inv > 0) this.inv -= k; if (this.flashT > 0) this.flashT -= dt; if (this.shardCD > 0) this.shardCD -= k;
      if (this.bubble && (this.bubble.t -= dt) <= 0) this.bubble = null;
      this.shownHp += (this.hp - this.shownHp) * Math.min(1, dt * 2.5);
      if (this.things.length > 24 || S.tick % 30 === 0) this.things = this.things.filter((e) => !e.dead);
      if (this.darkT > 0) { this.darkT -= dt; this.dark = Math.min(1, this.dark + dt * 4); } else this.dark = Math.max(0, this.dark - dt * 2.2);
      if (this.st === 'dying') { this.updDying(S, dt); return; }
      if (this.mem._deaths !== S.stats.deaths && S.state === 'play') {   // someone just respawned into the arena: fair restart beat
        const first = this.mem._deaths == null; this.mem._deaths = S.stats.deaths;
        if (!first) {
          // respawn guard: core's respawnAll can drop you at the last checkpoint, OUTSIDE the sealed walls (soft-lock).
          // Bring anyone outside the arena back in (see CORE-REQUESTS).
          S.players.forEach((p, i) => { if (p.active && !p.ghost && (p.x < this.A.x || p.x + p.w > this.A.x + this.A.w)) { p.x = this.A.x + 60 + i * 30; p.y = GY - p.h - 30; p.vx = p.vy = 0; p.lastSafe = p.x; } });
          LA.camera.update(S);
          B.clear(S, this, false); for (const e of this.things) if (e.isWall && e.cleanup) e.cleanup(S); this.darkT = 0; this.gust = null;
          if (this.st === 'tell' || this.st === 'act') { if (this.atk && this.atk.end) this.atk.end(S, this); this.float = false; this.go('move'); } this.cd = 1.6; }
      }
      this.updGust(S, dt);
      if (d.tick && d.tick(S, this, dt) === true) { this.body(S, dt); return; }
      switch (this.st) {
        case 'intro': if (this.stT > (d.introT || 1.2)) { this.go('move'); if (d.onStart) d.onStart(S, this); } break;
        case 'phase': this.anim.dy = -Math.abs(Math.sin(this.stT * 12)) * 7; this.anim.ox = Math.sin(this.stT * 50) * 2; if (this.stT > 1.3) { this.anim.ox = 0; this.go('move'); } break;
        case 'reel': this.vx *= Math.pow(0.9, k); this.x += this.vx * k;
          if (this.stT > 0.55) {                                         // shrugs it off with a hop-shock (don't camp on his head):
            this.go('move'); this.mem._reels = (this.mem._reels || 0) + 1;  // every other stomp in phase 2, every stomp in phase 3
            if (d.counter !== false && (this.phase >= 3 || (this.phase === 2 && this.mem._reels % 2 === 0))) B.shrug(S, this);
          }
          break;
        case 'stun': this.anim.rot = Math.sin(this.t * 5) * 0.05; if (this.stT > this.stunT) { this.go('move'); this.anim.rot = 0; if (this.onUnstun) { const f = this.onUnstun; this.onUnstun = null; f(S, this); } } break;
        case 'move': this.move(S, dt); this.cd -= dt; if (this.cd <= 0 && !this.air) this.choose(S); break;
        case 'tell': { const a = this.atk; this.anim.ox = Math.sin(this.t * 55) * 1.6; if (a.tellTick) a.tellTick(S, this, this.stT, dt);
          if (this.stT >= this.tellT) { this.anim.ox = 0; this.go('act'); this.pose = 1; if (a.start) a.start(S, this); } break; }
        case 'act': { const a = this.atk; const done = a.run ? a.run(S, this, this.stT, dt) : true;
          if (this.st === 'act' && (done || this.stT > (a.max || 6))) { this.go('rec'); this.pose = 0; if (a.end) a.end(S, this); } break; }
        case 'rec': this.vx = 0; if (this.stT > (this.atk && this.atk.rec != null ? this.atk.rec : 0.45) / Math.sqrt(this.aggr)) { this.cd = this.cdAfter(this.atk); this.go('move'); } break;
      }
      if (d.think) d.think(S, this, dt);
      this.body(S, dt);
    }
    body(S, dt) {
      const k = dt * 60, a = this.anim;
      if (!this.float && (this.air || this.y + this.h < GY - 0.5)) {
        this.air = true; this.vy += this.grav * k; this.y += this.vy * k;
        if (this.vy > 0 && this.y + this.h >= GY) { this.y = GY - this.h; this.vy = 0; this.air = false; a.sy = 0.78; a.sx = 1.18; if (this.onLand) { const f = this.onLand; this.onLand = null; f(S, this); } }
      }
      if (this.x < this.L()) { this.x = this.L(); if (this.vx < 0 && this.st === 'reel') this.vx = 0; }
      if (this.x + this.w > this.R()) { this.x = this.R() - this.w; if (this.vx > 0 && this.st === 'reel') this.vx = 0; }
      a.sx += (1 - a.sx) * Math.min(1, dt * 10); a.sy += (1 - a.sy) * Math.min(1, dt * 10);
      if (this.st !== 'phase') a.dy *= Math.pow(0.8, k);
      if (this.st !== 'stun' && this.st !== 'dying') a.rot += ((this.st === 'tell' ? -0.08 * this.face : this.st === 'act' ? 0.05 * this.face : 0) - a.rot) * Math.min(1, dt * 10);
    }
    move(S, dt) {
      const d = this.def, k = dt * 60, sp = this.speed(), tp = B.target(S, this);
      const dx = tp ? B.pcx(tp) - this.cx() : 0;
      if (d.move) d.move(S, this, dt, sp, dx, tp);
      else {
        const style = d.style || 'patrol';
        if (style === 'patrol') { if (!this.vx) this.vx = -sp; this.vx = Math.sign(this.vx) * sp; if (this.x <= this.L() + 1) this.vx = sp; else if (this.x + this.w >= this.R() - 1) this.vx = -sp; }
        else if (style === 'chase') this.vx = Math.abs(dx) > 36 ? Math.sign(dx) * sp : 0;
        else if (style === 'keep') {
          const a = Math.abs(dx), want = d.keep || 260;
          this.vx = a < want - 70 ? -Math.sign(dx) * sp : a > want + 90 ? Math.sign(dx) * sp : 0;
          if ((this.x <= this.L() + 2 && this.vx < 0) || (this.x + this.w >= this.R() - 2 && this.vx > 0)) this.vx = 0;   // cornered: stand and fight (stomp chance)
        }
        this.x += this.vx * k;
      }
      if (Math.abs(this.vx) > 0.15) this.face = this.vx < 0 ? -1 : 1; else if (tp) this.face = dx < 0 ? -1 : 1;
      if (Math.abs(this.vx) > 0.2 && !this.air) this.anim.dy = -Math.abs(Math.sin(this.t * 9)) * 3;
    }
    cdAfter(a) {
      const d = this.def; let c = a && a.cd != null ? a.cd : (d.cd ? d.cd[Math.min(d.cd.length, this.phase) - 1] : 1.2);
      return Math.max(0.25, c / this.aggr / (1 + this.rage * 0.14) + this.rng.range(-0.12, 0.22));
    }
    choose(S) {
      const d = this.def, ph = this.phase; let pick = null;
      const ok = (n) => { const a = d.attacks[n]; return a && (a.ph || 1) <= ph && !(a.maxPh && ph > a.maxPh) && (!a.can || a.can(S, this)); };
      const seq = d.seq && d.seq[ph];
      if (seq && seq.length) { for (let i = 0; i < seq.length && !pick; i++) { const n = seq[this.seqI++ % seq.length]; if (ok(n)) pick = n; } }
      if (!pick) {
        let tot = 0; const opts = [];
        for (const n in d.attacks) { if (!ok(n)) continue; const a = d.attacks[n]; let w = a.w == null ? 1 : (typeof a.w === 'function' ? a.w(this, S) : a.w); if (n === this.last) w *= 0.3; if (w > 0) { opts.push([n, w]); tot += w; } }
        if (!opts.length) { this.cd = 0.4; return; }
        let r = this.rng() * tot; pick = opts[0][0]; for (const o of opts) { if ((r -= o[1]) <= 0) { pick = o[0]; break; } }
      }
      const a = d.attacks[pick];
      this.atkName = pick; this.atk = a; this.last = pick;
      this.tellT = (a.tell != null ? a.tell : 0.6) / Math.sqrt(this.aggr);
      const tp = B.target(S, this); if (tp) this.face = B.pcx(tp) < this.cx() ? -1 : 1;
      this.vx = 0; this.go('tell'); this.pose = 1;
      if (a.say) this.say(typeof a.say === 'function' ? a.say(this) : a.say, Math.max(0.9, this.tellT + 0.4));
      if (a.tellStart) a.tellStart(S, this);
    }
    // ---- damage ----
    hurtBy(S, dmg, src) {
      if (this.defeated || this.st === 'dying' || this.st === 'phase') return false;
      const d = this.def;
      this.hp = Math.max(0, this.hp - dmg); this.flashT = src === 'stomp' ? 0.16 : 0.07; this.hits++;
      if (this.hp <= 0.001) { this.die(S); return true; }
      let ph = 1; for (const th of (d.phases || [])) if (this.hp / this.maxHp <= th + 1e-6) ph++;
      if (ph > this.phase) { this.phase = ph; this.seqI = 0; this.enterPhase(S); }
      else if (src === 'stomp' && (this.st === 'move' || this.st === 'tell' || this.st === 'rec') && !d.noReel) {
        const tp = B.target(S, this), wasTell = this.st === 'tell';
        if (wasTell && this.atk && this.atk.end) this.atk.end(S, this);           // a stomp cancels the wind-up
        this.go('reel'); this.vx = (tp && B.pcx(tp) > this.cx() ? -1 : 1) * 4.5; this.anim.sy = 0.7; this.anim.sx = 1.25;
      }
      if (d.onHit) d.onHit(S, this, src);
      return true;
    }
    enterPhase(S) {
      const d = this.def;
      if (this.atk && this.atk.end && (this.st === 'act' || this.st === 'tell')) this.atk.end(S, this);
      B.clear(S, this, false);                                      // wipe live projectiles: every phase starts fair
      this.go('phase'); this.inv = 80; this.vx = 0; this.vy = 0; this.cd = 0.6;
      const q = d.quips && d.quips[this.phase]; if (q) this.say(q, 1.8, '#c0102a');
      LA.camera.kick(8); LA.game.flash(S, '#ffffff', 0.35); B.sfx('bosshit', { big: true });
      if (d.onPhase) d.onPhase(S, this, this.phase);
      if (d.powerDrop !== false) B.powerDrop(S, this);
    }
    die(S) {
      const d = this.def;
      if (this.atk && this.atk.end && (this.st === 'act' || this.st === 'tell')) try { this.atk.end(S, this); } catch (e) { /* ignore */ }
      this.hp = 0; this.defeated = true; this.doneT = d.deathT || 3.4; this.go('dying');
      B.clear(S, this, true); this.darkT = 0; this.gust = null; this.vx = 0; this.float = false;
      LA.game.flash(S, '#ffffff', 0.75); LA.camera.kick(12); B.sfx('bossdown'); B.sfx('stomp');
      LA.pop(S, this.cx(), this.y - 30, 'K.O.!', '#ffe36a', true);
      this.say(d.lastWords || 'NOOOO!', 1.6, '#c0102a');
      if (d.onDeath) d.onDeath(S, this);
    }
    updDying(S, dt) {
      const k = dt * 60, T = this.stT;
      if (this.def.dieAnim) this.def.dieAnim(S, this, dt, T);
      else if (T < 0.75) { this.anim.ox = Math.sin(T * 70) * 3; this.flashT = Math.floor(T * 12) % 2 ? 0.05 : 0; if (Math.floor(T * 9) !== Math.floor((T - dt) * 9)) B.puff(S, this.cx() + this.rng.range(-30, 30), this.y + this.rng.range(0, this.h * 0.8)); }
      else { if (!this.mem._flung) { this.mem._flung = 1; this.vy = -10; this.vx = -this.face * 2.2; this.anim.ox = 0; } this.vy += 0.55 * k; this.y += this.vy * k; this.x += this.vx * k; this.anim.rot += 0.11 * k * -this.face; }
      if (T > (this.def.cardAt || 0.95) && !this.mem._card) { this.mem._card = 1; B.headline(S, this); }
    }
    updGust(S, dt) {
      const g = this.gust; if (!g) return;
      g.t -= dt; if (g.t <= 0) { this.gust = null; return; }
      const k = dt * 60;
      for (const p of B.live(S)) {
        if (g.band && (p.y + p.h < g.band[0] || p.y > g.band[1])) continue;
        p.x = LA.clamp(p.x + g.dir * g.f * k * (p.onGround ? 1 : 0.8), this.A.x + 2, this.A.x + this.A.w - p.w - 2);
      }
    }
    // ---- contact ----
    touch(S, p) {
      if (this.defeated || this.st === 'dying') return;
      if (this.def.touch) { this.def.touch(S, this, p); return; }
      B.contact(S, this, p, this);
    }
    onShot(S, shard) {
      if (this.defeated || this.st === 'dying') return false;
      if (this.def.shot) return this.def.shot(S, this, shard);
      return B.shardHit(S, this, this, shard);
    }
    // ---- draw ----
    draw(ctx, S) {
      const d = this.def;
      if (d.drawUnder) d.drawUnder(ctx, S, this);
      if (!(d.draw && d.draw(ctx, S, this) === true)) B.drawBody(ctx, S, this, this);
      if (d.drawOver) d.drawOver(ctx, S, this);
      if (this.st === 'tell' && this.atk && this.atk.tellDraw) this.atk.tellDraw(ctx, S, this);
      B.drawMarks(ctx, S, this, this);
    }
  }
  B.Boss = Boss;

  // shared stomp / side-contact rule (works for sub-bodies too: body = {x,y,w,h,inv?,guard?})
  B.contact = function (S, b, p, body, onStomp) {
    if (LA.phys.stompedFrom(p, body)) {
      if (b.inv > 0 || (body !== b && body.inv > 0) || body.guard || b.st === 'phase') {
        p.vy = -9; p.jumps = 1; p.y = Math.min(p.y, body.y - p.h);
        if (body.guard && !(b.inv > 0)) { LA.pop(S, body.x + body.w / 2, body.y - 10, body.guardTxt || 'BLOCKED', '#9ad0ff'); B.sfx('bonk'); }
        return 'bump';
      }
      p.bounce(S, true); p.y = Math.min(p.y, body.y - p.h - 1);
      LA.game.score(S, 600, body.x + body.w / 2, body.y - 8, '#ff4d9d'); LA.pop(S, body.x + body.w / 2, body.y - 28, 'BONK!', '#ffffff', true);
      B.sfx('bosshit'); B.sfx('stomp'); LA.camera.kick(5); if (S.stats) S.stats.stomps++;
      if (onStomp) onStomp(); else { b.inv = 75; b.hurtBy(S, B.STOMP_DMG, 'stomp'); }
      return 'stomp';
    }
    if (b.inv > 0 || b.harmless() || body.harmless) return null;          // Saint: a flashing boss never hurts you
    if (p.hurt(S, 'boss')) { const dir = B.pcx(p) < body.x + body.w / 2 ? -1 : 1; p.vy = Math.min(p.vy, -6); p.x += dir * 14; }
    return 'hurt';
  };
  B.shardHit = function (S, b, body, shard) {
    if (hit.has(shard)) return true; hit.add(shard);
    if (b.st === 'phase' || body.guard) { LA.pop(S, body.x + body.w / 2, body.y, 'TINK', '#9ad0ff'); return true; }
    if (b.shardCD <= 0) { b.shardCD = 10; b.hurtBy(S, B.SHARD_DMG * (body.shardMul || 1), 'shard'); B.sfx('bonk', { soft: true }); }
    return true;
  };
  // shards (gameplay agent) may call this directly: returns true if the shard hit something boss-side
  B.hitByShard = function (S, shard) {
    S = S || LA.game.S; const b = S && S.boss; if (!b) return false;
    const r = shard.box ? shard.box() : shard;
    for (const e of b.things) if (!e.dead && e.onShot && LA.aabb(r, e.box ? e.box() : e) && e.onShot(S, shard)) return true;
    if (!b.defeated && LA.aabb(r, b.box())) return b.onShot(S, shard);
    return false;
  };

  // ---------------- spawn ----------------
  B.spawn = function (S, name, arena, opts) {
    const def = B.defs[name] || B.defs.__generic;
    const b = new Boss(S, name, arena, def, (opts && opts.hpMul) || 1);
    const keys = B.artKeys(name); if (keys.length) LA.preload(keys);
    if (def.init) def.init(S, b);
    // proxy in S.ents so any shard code that walks S.ents + onShot also hits the boss
    LA.ents.add(S, 'bossProxy', { boss: b });
    LA.ents.add(S, 'bossUI', { boss: b });
    B.warm(name);
    setTimeout(() => idle(() => { if (!b.mem._cardC && !b.defeated) { const hl = def.headline || [name + ' DEFEATED', '']; try { b.mem._cardC = ART().headline(b, hl[0], hl[1]); } catch (e) { /* retried at death */ } } }), 2500);
    B.sfx('menu');
    return b;
  };
  B.artKeys = function (name) {
    const d = B.defs[name]; if (!d) return [];
    return [].concat(d.art ? [d.art] : [], d.artKeys || [], (d.warmDrawn || []).map((n) => ART().castKey(n)).filter(Boolean), ['gemGrow']);
  };
  // preload boss art with the level (core may call LA.bosses.prepare(S, lv) before its preload; see CORE-REQUESTS)
  B.prepare = function (S, lv) {
    if (!lv || !lv.boss) return;
    const keys = B.artKeys(lv.boss); if (!keys.length) return;
    if (!S.art) S.art = new Set();
    keys.forEach((k) => { if (S.art.add) S.art.add(k); else if (S.art.push) S.art.push(k); });
  };
  // warm every one-time cache (pre-scaled sprites, flash silhouettes, drawn cast, icons) in idle slices so the
  // Pi never hitches when the fight starts
  const idle = (fn) => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 500 }) : setTimeout(fn, 16));
  B.warm = function (name) {
    const d = B.defs[name]; if (!d) return;
    const jobs = [];
    const H = (d.h || 104) * 2;
    const sil = (im) => { if (im) { ART().silhouette(im, '#ffffff'); ART().silhouette(im, '#ff2b2b'); } };
    if (d.art) jobs.push(() => sil(ART().sprite(d.art, H)));
    if (d.drawn) jobs.push(() => sil(ART().drawn(d.drawn, 0)), () => sil(ART().drawn(d.drawn, 1)));
    (d.artKeys || []).forEach((k) => jobs.push(() => { ART().sprite(k, 168); ART().sprite(k, 120); }));
    (d.warmDrawn || []).forEach((n) => jobs.push(() => { ART().drawn(n, 0); ART().drawn(n, 1); }));
    ['bang', 'star', 'puff', 'shock', 'flame', 'heart', 'sweat'].concat(d.icons || []).forEach((n) => jobs.push(() => ART().icon(n)));
    jobs.push(() => ART().lightHole());
    const run = () => { const j = jobs.shift(); if (!j) return; try { j(); } catch (e) { /* art may still be decoding */ } idle(run); };
    idle(run);
  };
  LA.on('levelStart', (S) => { if (!S || !S.segments) return; for (const lv of S.segments) if (lv.boss) LA.preload(B.artKeys(lv.boss)).then(() => B.warm(lv.boss)); });
  B.findSet = (S, id) => { for (const k in S.sets) if (S.sets[k].id === id) return S.sets[k]; return null; };

  LA.ents.define('bossProxy', (p) => Object.assign(p, {
    layer: 'mid', always: true, x: 0, y: 0, w: 1, h: 1,
    update(S) { const b = this.boss; if (!b || b.defeated || S.boss !== b) { this.dead = true; return; } const r = b.box(); this.x = r.x; this.y = r.y; this.w = r.w; this.h = r.h; },
    box() { return this.boss.box(); },
    onShot(S, shard) { const b = this.boss; return !!b && !b.defeated && b.onShot(S, shard); },
  }));

  // =====================================================================================================
  // KIT — projectiles, hazards, adds. Everything is an entity owned by the boss (cleared on phase/death).
  // =====================================================================================================
  LA.ents.define('bossThing', (p) => Object.assign({ always: true, layer: 'front', w: 12, h: 12, vx: 0, vy: 0 }, p));
  B.thing = function (S, b, props) { const e = LA.ents.add(S, 'bossThing', props); e.owner = b; if (b) b.things.push(e); return e; };
  B.clear = function (S, b, all) {
    for (const e of b.things) { if (e.dead) continue; if (all || e.isShot) { if (e.cleanup) e.cleanup(S); e.dead = true; } }
    if (all) { b.things = []; if (S.puddles) S.puddles = S.puddles.filter((pd) => !pd.boss); }
  };
  const arenaOut = (b, x, pad) => x < b.A.x - (pad || 60) || x > b.A.x + b.A.w + (pad || 60);
  function hurtP(S, p, e) { return p.hurt(S, 'boss'); }

  // projectile: {x,y (center), vx, vy, g, r, icon, size, spin, life, flat, bounce, onLand, stompable, shootable, glow, pierce}
  B.shot = function (S, b, o) {
    const e = B.thing(S, b, Object.assign({ g: 0.28, r: 9, size: 26, spin: 0, rot: 0, life: 7, bounce: 0, isShot: true, hurts: true, age: 0 }, o));
    e.update = function (S, dt) {
      const k = dt * 60;
      if (this.pre) this.pre(S, this, dt);
      this.x += this.vx * k; if (!this.flat) this.vy += this.g * k; this.y += this.vy * k; this.rot += this.spin * k; this.life -= dt; this.age += dt;
      if (!this.flat && this.vy > 0 && this.y + this.r >= (this.floor || GY)) {
        this.y = (this.floor || GY) - this.r;
        if (this.onLand) { this.onLand(S, this); if (!this.keep) this.dead = true; }
        else if (this.bounce > 0) { this.bounce--; this.vy = -Math.abs(this.vy) * (this.rest || 0.55); }
        else if (this.roll) { this.vy = 0; this.flat = true; this.y = GY - this.r; }
        else { this.dead = true; B.puff(S, this.x, GY - 6, 0.6); }
      }
      if (arenaOut(b, this.x, 40) || this.life <= 0 || this.y > 720) this.dead = true;
    };
    e.box = function () { return this.hb ? this.hb(this) : { x: this.x - this.r, y: this.y - this.r, w: this.r * 2, h: this.r * 2 }; };
    e.touch = function (S, p) {
      if (this.stompable && LA.phys.stompedFrom(p, this.box())) { this.dead = true; p.bounce(S, false); LA.game.score(S, 100, this.x, this.y - 10); B.puff(S, this.x, this.y); B.sfx('stomp'); return; }
      if (!this.hurts) return;
      if (hurtP(S, p, this) && !this.pierce) this.dead = true;
    };
    if (e.shootable !== false) e.onShot = function (S) { if (!this.shootable) return false; this.dead = true; B.puff(S, this.x, this.y, 0.7); LA.game.score(S, 50, this.x, this.y - 10); return true; };
    e.draw = function (ctx) {
      const ic = typeof this.icon === 'string' ? ART().icon(this.icon) : this.icon;
      if (this.drawFn) { this.drawFn(ctx, this); return; }
      if (!ic) { ctx.fillStyle = '#ff4d9d'; ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, 7); ctx.fill(); return; }
      const s = this.size, asp = ic.width / ic.height;
      ctx.save(); ctx.translate(this.x, this.y); if (this.rot) ctx.rotate(this.rot); if (this.flipX) ctx.scale(-1, 1);
      ctx.drawImage(ic, -s * asp / 2, -s / 2, s * asp, s); ctx.restore();
    };
    return e;
  };
  // aimed lob that lands near x (t = flight time in ticks)
  B.lobTo = function (S, b, x0, y0, tx, o) {
    o = o || {}; const g = o.g || 0.28, T = o.T || 60;
    const vx = (tx - x0) / T, vy = ((GY - (o.r || 9)) - y0 - 0.5 * g * T * T) / T;
    return B.shot(S, b, Object.assign({ x: x0, y: y0, vx, vy, g }, o));
  };
  // ground shockwave (jump it). h = wave height (default 22 — a tap-jump clears it)
  B.shock = function (S, b, x, dir, o) {
    o = o || {}; const h = o.h || 22;
    return B.shot(S, b, Object.assign({ x, y: GY - h / 2, vx: dir * (o.speed || 5.2), vy: 0, flat: true, r: 12, icon: 'shock', size: h + 12, flipX: dir < 0, life: 4,
      hb(e) { return { x: e.x - 12, y: GY - h, w: 24, h }; }, pierce: true, shootable: false }, o));
  };
  // falling debris with a growing ground shadow as the tell
  B.drop = function (S, b, x, o) {
    o = o || {}; const delay = o.delay != null ? o.delay : 0.85, size = o.size || 34, r = o.r || size * 0.4;
    const e = B.thing(S, b, { x, y: -60, r, isShot: true, t: 0, size, icon: o.icon || 'brick', spin: o.spin != null ? o.spin : 0.08, rot: 0, falling: false, w: size, h: size, glow: o.glow });
    if (o.glow) { e.gx = x; e.gy = GY - 6; }                                   // in a blackout the landing spot glows
    e.update = function (S, dt) {
      const k = dt * 60; this.t += dt;
      if (this.t >= delay) { if (!this.falling) { this.falling = true; this.y = LA.camera ? -40 : -40; this.vy = 7; }
        this.vy += 0.5 * k; this.y += this.vy * k; this.rot += this.spin * k; if (this.glow) this.gy = this.y;
        if (this.y + this.r >= GY) { this.dead = true; B.puff(S, this.x, GY - 8, 1); LA.camera.kick(2); if (o.onLand) o.onLand(S, this); } }
    };
    e.box = function () { return this.falling ? { x: this.x - this.r, y: this.y - this.r, w: this.r * 2, h: this.r * 2 } : { x: -9e5, y: -9e5, w: 0, h: 0 }; };
    e.touch = function (S, p) { if (this.falling) hurtP(S, p, this); };
    e.draw = function (ctx) {
      const f = Math.min(1, this.t / delay);
      ctx.fillStyle = 'rgba(20,10,30,' + (0.18 + f * 0.35) + ')'; ctx.beginPath(); ctx.ellipse(this.x, GY + 2, 6 + f * size * 0.55, 3 + f * 4, 0, 0, 7); ctx.fill();
      if (!this.falling && Math.floor(this.t * 10) % 2 === 0) { ctx.strokeStyle = '#ff3d3d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(this.x - 7, GY - 22); ctx.lineTo(this.x + 7, GY - 8); ctx.moveTo(this.x + 7, GY - 22); ctx.lineTo(this.x - 7, GY - 8); ctx.stroke(); }
      if (this.falling) { const ic = ART().icon(this.icon), asp = ic.width / ic.height; ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.rot); ctx.drawImage(ic, -size * asp / 2, -size / 2, size * asp, size); ctx.restore(); }
    };
    return e;
  };
  // slow goo (player code reads S.puddles {x,r}); shrinks over its life
  B.puddle = function (S, b, x, o) {
    o = o || {}; if (!S.puddles) S.puddles = [];
    const pd = { x, r: o.r || 34, boss: true }; S.puddles.push(pd);
    const life = o.life || 4.2, R = pd.r, col = o.col || '#8bd450';
    const e = B.thing(S, b, { x: x - R, y: GY - 8, w: R * 2, h: 10, layer: 'back', t: 0 });
    e.update = function (S, dt) { this.t += dt; pd.r = R * Math.max(0.25, 1 - Math.max(0, this.t - life * 0.5) / life); if (this.t >= life) this.cleanup(S); };
    e.cleanup = function (S) { this.dead = true; if (S.puddles) { const i = S.puddles.indexOf(pd); if (i >= 0) S.puddles.splice(i, 1); } };
    e.draw = function (ctx, S) {
      const r = pd.r; ctx.fillStyle = col; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.ellipse(x, GY + 1, r, 6, 0, 0, 7); ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = '#1b1220'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.55)'; for (let i = 0; i < 3; i++) { const bx = x + Math.sin(i * 2.3 + this.t * 2) * r * 0.6, by = GY - 1 - ((this.t * 14 + i * 5) % 9); ctx.beginPath(); ctx.arc(bx, by, 2, 0, 7); ctx.fill(); }
      if (o.label && this.t < 0.8) { ctx.font = 'bold 12px ' + LA.FONT; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#1b1220'; ctx.strokeText(o.label, x, GY - 20 - this.t * 20); ctx.fillStyle = col; ctx.fillText(o.label, x, GY - 20 - this.t * 20); }
    };
    return e;
  };
  // fire patch: smokes for `warn`, then burns (hurts) for `life`
  B.fire = function (S, b, x, o) {
    o = o || {}; const w = o.w || 46, warn = o.warn != null ? o.warn : 0.35, life = o.life || 2.4, hgt = o.h || 30;
    const e = B.thing(S, b, { x: x - w / 2, y: GY - hgt, w, h: hgt, t: 0 });
    e.update = function (S, dt) { this.t += dt; if (this.t > warn + life) this.dead = true; };
    e.box = function () { return this.t > warn ? { x: this.x + 6, y: GY - hgt + 6, w: w - 12, h: hgt - 6 } : { x: -9e5, y: -9e5, w: 0, h: 0 }; };
    e.touch = function (S, p) { hurtP(S, p, this); };
    e.draw = function (ctx) {
      const ic = ART().icon('flame'), lit = this.t > warn, fade = Math.min(1, (warn + life - this.t) * 2);
      if (!lit) { ctx.fillStyle = 'rgba(80,80,90,.5)'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(this.x + w * (0.2 + i * 0.3), GY - 6 - this.t * 30 - i * 3, 5 + this.t * 10, 0, 7); ctx.fill(); } return; }
      ctx.globalAlpha = fade;
      for (let i = 0; i < 3; i++) { const fh = hgt * (0.75 + 0.25 * Math.sin(this.t * 18 + i * 2)), fx = this.x + w * (0.18 + i * 0.32); ctx.drawImage(ic, fx - fh * 0.35, GY - fh + 2, fh * 0.7, fh); }
      ctx.globalAlpha = 1;
    };
    return e;
  };
  // temporary wall / hurdle / barricade. o: {w,h,life,warn,style,breakable,hp,label}
  B.wall = function (S, b, x, o) {
    o = o || {}; const w = o.w || 24, h = o.h || 80, warn = o.warn != null ? o.warn : 0.75, life = o.life || 4;
    const e = B.thing(S, b, { x: x - w / 2, y: GY - h, w, h, t: 0, solid: null, hp: o.hp || 1, style: o.style || 'scaffold', stand: {}, isWall: true, layer: 'mid', rise: 0 });
    e.box = function () { return this.solid ? { x: this.x, y: this.y - 4, w: this.w, h: this.h + 4 } : { x: -9e5, y: -9e5, w: 0, h: 0 }; };
    e.activate = function (S) {
      this.solid = { x: this.x, y: this.y, w: this.w, h: this.h, kind: 'bosswall' }; S.solids.push(this.solid);
      for (const p of B.live(S)) if (p.x + p.w > this.x && p.x < this.x + this.w && p.y + p.h > this.y) { p.y = this.y - p.h - 0.5; p.vy = Math.min(p.vy, -3); }   // never trap: lift onto it
      LA.camera.kick(3); B.puff(S, this.x + w / 2, GY - 6, 0.8); if (o.onRise) o.onRise(S, this);
    };
    e.cleanup = function (S) { if (this.solid) { const i = S.solids.indexOf(this.solid); if (i >= 0) S.solids.splice(i, 1); this.solid = null; } this.dead = true; };
    e.breakIt = function (S) { B.puff(S, this.x + w / 2, this.y + h / 2, 1.2); LA.game.score(S, 200, this.x + w / 2, this.y - 8); B.sfx('bonk'); if (o.onBreak) o.onBreak(S, this); this.cleanup(S); };
    e.update = function (S, dt) {
      this.t += dt;
      if (!this.solid && this.t >= warn && this.t < warn + life) this.activate(S);
      if (this.solid) this.rise = Math.min(1, this.rise + dt * 8);
      if (this.t >= warn + life) this.cleanup(S);
      if (this.solid && o.breakable) for (const p of B.live(S)) {             // landing on top of a breakable = smash it
        const on = p.onGround && Math.abs(p.y + p.h - this.y) < 1.5 && p.x + p.w > this.x && p.x < this.x + this.w;
        if (on && !this.stand[p.idx]) { if (--this.hp <= 0) { p.bounce(S, false); this.breakIt(S); return; } p.bounce(S, false); }
        this.stand[p.idx] = on;
      }
    };
    if (o.breakable) e.onShot = function (S) { if (!this.solid) return false; if (--this.hp <= 0) this.breakIt(S); else B.puff(S, this.x + w / 2, this.y + 10, 0.5); return true; };
    e.draw = function (ctx, S) {
      if (!this.solid) {                                                       // tell: flashing stakes + label where it will rise
        if (this.t >= warn) return;
        const bl = Math.floor(this.t * 12) % 2 === 0;
        ctx.fillStyle = bl ? 'rgba(255,90,31,.55)' : 'rgba(255,90,31,.25)'; ctx.fillRect(this.x, GY - 6, w, 6);
        ctx.strokeStyle = 'rgba(255,90,31,.55)'; ctx.setLineDash([6, 5]); ctx.lineWidth = 2; ctx.strokeRect(this.x, GY - h, w, h); ctx.setLineDash([]);
        if (o.label) { ctx.font = 'bold 11px ' + LA.FONT; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#1b1220'; ctx.strokeText(o.label, this.x + w / 2, GY - h - 8); ctx.fillStyle = '#ffb14a'; ctx.fillText(o.label, this.x + w / 2, GY - h - 8); }
        return;
      }
      const hh = h * this.rise, top = GY - hh, left = warn + life - this.t;
      if (left < 0.6 && Math.floor(this.t * 14) % 2 === 0) ctx.globalAlpha = 0.5;
      ART().drawWall(ctx, this.style, this.x, top, w, hh, this);
      ctx.globalAlpha = 1;
    };
    return e;
  };
  // minion. o: {art (sprite key) | canvas, dh (draw height), w,h, speed, hp, fly, y, chase, life, face}
  B.add = function (S, b, x, o) {
    o = o || {};
    const e = B.thing(S, b, Object.assign({ x, y: GY - (o.h || 30), w: o.w || 26, h: o.h || 30, vx: 0, vy: 0, hp: o.hp || 1, t: 0, inv: 0, speed: o.speed || 1.4, dh: o.dh || 60, face: -1, isAdd: true, layer: 'mid', faces: o.faces || -1 }, o));
    if (o.fly) e.y = o.y != null ? o.y : GY - 150;
    e.update = function (S, dt) {
      const k = dt * 60; this.t += dt; if (this.inv > 0) this.inv -= k;
      if (this.life != null && (this.life -= dt) <= 0) { this.dead = true; B.puff(S, this.x + this.w / 2, this.y + this.h / 2); return; }
      if (this.ai) { this.ai(S, this, dt); return; }
      const tp = B.live(S)[0] ? B.target(S, { cx: () => this.x + this.w / 2 }) : null;
      const dx = tp ? B.pcx(tp) - (this.x + this.w / 2) : 0;
      if (this.fly) {                                                        // hover, then telegraphed dive
        this.st = this.st || 'hover'; this.stT = (this.stT || 0) + dt;
        if (this.st === 'hover') { this.vx += LA.clamp(dx * 0.002, -0.08, 0.08) * k; this.vx *= Math.pow(0.97, k); this.y += Math.sin(this.t * 3) * 0.4 * k; if (this.stT > (this.diveEvery || 3) && Math.abs(dx) < 140) { this.st = 'tell'; this.stT = 0; } }
        else if (this.st === 'tell') { this.vx *= 0.8; if (this.stT > 0.55) { this.st = 'dive'; this.stT = 0; this.vy = 6; this.vx = LA.clamp(dx / 30, -4, 4); } }
        else if (this.st === 'dive') { this.vy += 0.1 * k; if (this.y + this.h >= GY - 2) { this.y = GY - this.h - 2; this.st = 'rise'; this.stT = 0; this.vy = -3.5; } }
        else if (this.st === 'rise') { this.vy *= Math.pow(0.97, k); if (this.y < (o.y != null ? o.y : GY - 150)) { this.vy = 0; this.st = 'hover'; this.stT = 0; } }
        this.x += this.vx * k; this.y += (this.st === 'hover' ? 0 : this.vy * k);
      } else {
        if (this.chase !== false) this.vx = Math.abs(dx) > 8 ? Math.sign(dx) * this.speed : 0;
        const r = LA.phys.move(S, this, { grav: K.GRAV, maxFall: 14 });
        if (r.hitWall && this.chase === false) this.vx = -r.hitWall * this.speed;
      }
      if (this.vx) this.face = this.vx < 0 ? -1 : 1;
      this.x = LA.clamp(this.x, b.A.x + 4, b.A.x + b.A.w - this.w - 4);
    };
    e.kill = function (S, how) { this.dead = true; B.puff(S, this.x + this.w / 2, this.y + this.h / 2); LA.game.score(S, 200, this.x + this.w / 2, this.y - 10); if (S.stats) S.stats.kills++; if (o.onDie) o.onDie(S, this, how); };
    e.touch = function (S, p) {
      if (LA.phys.stompedFrom(p, this)) { p.bounce(S, false); if (this.inv > 0) return; if (--this.hp <= 0) this.kill(S, 'stomp'); else { this.inv = 40; LA.pop(S, this.x + this.w / 2, this.y - 8, 'OOF', '#fff'); } B.sfx('stomp'); return; }
      if (this.harmless) return;
      if (hurtP(S, p, this)) { const dir = B.pcx(p) < this.x + this.w / 2 ? -1 : 1; p.x += dir * 10; p.vy = -5; }
    };
    e.onShot = function (S) { if (this.inv > 0) return true; if (--this.hp <= 0) this.kill(S, 'shot'); else this.inv = 20; return true; };
    e.draw = function (ctx, S) {
      if (this.inv > 0 && Math.floor(this.inv / 4) % 2 === 0) return;
      const im = typeof this.art === 'string' ? ART().sprite(this.art, this.dh * 2) : (typeof this.art === 'function' ? this.art(this) : this.art);
      const cx = this.x + this.w / 2, base = this.y + this.h + 2;
      ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(cx, GY + 2, this.w * 0.6, 4, 0, 0, 7); ctx.fill();
      if (!im) { ctx.fillStyle = '#6a4bd0'; ctx.fillRect(this.x, this.y, this.w, this.h); return; }
      const dh = this.dh, dw = dh * im.width / im.height, flip = this.face !== this.faces;
      ctx.save(); ctx.translate(cx, base + (this.fly ? 0 : -Math.abs(Math.sin(this.t * 10)) * 2)); if (flip) ctx.scale(-1, 1);
      ctx.drawImage(im, -dw / 2, -dh, dw, dh);
      if (this.st === 'tell' && Math.floor(this.t * 12) % 2 === 0) { const sil = ART().silhouette(im, '#ff2b2b'); ctx.globalAlpha = 0.5; ctx.drawImage(sil, -dw / 2, -dh, dw, dh); ctx.globalAlpha = 1; }
      ctx.restore();
      if (this.label) { ctx.font = 'bold 9px ' + LA.FONT; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#1b1220'; ctx.strokeText(this.label, cx, this.y - dh + this.h - 4); ctx.fillStyle = '#ffe36a'; ctx.fillText(this.label, cx, this.y - dh + this.h - 4); }
    };
    return e;
  };
  // smoke puff (visual only)
  B.puff = function (S, x, y, sc) {
    sc = sc || 1;
    const e = LA.ents.add(S, 'bossThing', { x, y, t: 0, layer: 'front', w: 10, h: 10, sc });
    e.update = function (S, dt) { this.t += dt; if (this.t > 0.45) this.dead = true; };
    e.draw = function (ctx) {
      const f = this.t / 0.45, ic = ART().icon('puff'), s = (18 + f * 26) * this.sc;
      ctx.globalAlpha = 1 - f; ctx.drawImage(ic, this.x - s / 2, this.y - s / 2 - f * 10, s, s); ctx.globalAlpha = 1;
    };
    return e;
  };
  // phase break reward: a GROW gem parachutes in (soaks one hit, pure Mario health). Not owned -> survives clears.
  B.powerDrop = function (S, b) {
    const p = B.target(S, b); if (!p || !LA.powers || !LA.powers.give) return;
    const x = LA.clamp(B.pcx(p) + (B.pcx(p) < b.cx() ? -90 : 90), b.A.x + 60, b.A.x + b.A.w - 60);
    const e = LA.ents.add(S, 'bossThing', { x: x - 14, y: 40, w: 28, h: 28, t: 0, layer: 'front', art: 'gemGrow' });
    e.update = function (S, dt) { this.t += dt; if (this.y < GY - 110) this.y += 1.3 * dt * 60; this.x += Math.sin(this.t * 2) * 0.4; if (this.t > 14) this.dead = true; };
    e.touch = function (S, pl) {
      this.dead = true;
      if (!pl.power) { try { LA.powers.give(S, pl, 'grow'); } catch (err) { /* gameplay owns powers */ } }
      else LA.game.score(S, 500, this.x + 14, this.y - 6);
      B.sfx('power');
    };
    e.draw = function (ctx) {
      if (this.t > 11 && Math.floor(this.t * 8) % 2) return;
      const cx = this.x + 14, falling = this.y < GY - 110;
      if (falling) { ctx.strokeStyle = '#1b1220'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx - 14, this.y - 18); ctx.lineTo(cx, this.y + 4); ctx.lineTo(cx + 14, this.y - 18); ctx.stroke(); ctx.fillStyle = '#ff6fae'; ctx.beginPath(); ctx.arc(cx, this.y - 18, 16, Math.PI, 0); ctx.fill(); ctx.stroke(); }
      const im = LA.img('gemGrow'), bob = Math.sin(this.t * 4) * 3;
      if (im) ctx.drawImage(im, this.x, this.y + bob, 28, 28 * im.naturalHeight / im.naturalWidth); else { ctx.fillStyle = '#57e08a'; ctx.fillRect(this.x, this.y, 28, 28); }
    };
  };
  // nudge a hazard spawn x so it never lands on a live player (tries both sides, stays in the arena)
  B.clearOf = function (S, b, x, gap, m) {
    gap = gap || 64; m = m || 50;
    const lo = b.A.x + m, hi = b.A.x + b.A.w - m, bad = (v) => B.live(S).some((p) => Math.abs(B.pcx(p) - v) < gap);
    x = LA.clamp(x, lo, hi); if (!bad(x)) return x;
    for (let d = 20; d < b.A.w; d += 20) for (const s of [1, -1]) { const v = x + s * d; if (v >= lo && v <= hi && !bad(v)) return v; }
    return x;
  };
  // counter after a stomp in phase 2+: small telegraphed hop, low shockwaves both ways
  B.shrug = function (S, b) {
    b.say(b.def.shrugTxt || 'HMPH!', 0.7, '#c0102a'); b.vy = -6; b.air = true; b.anim.sy = 1.2;
    b.onLand = (S, b) => { B.shock(S, b, b.cx(), -1, { speed: 4, h: 16, life: 1.2 }); B.shock(S, b, b.cx(), 1, { speed: 4, h: 16, life: 1.2 }); LA.camera.kick(3); };
  };
  B.gust = function (b, dir, f, dur, band) { b.gust = { dir, f, t: dur, T: dur, band }; };
  B.blackout = function (b, dur, amt) { b.darkT = Math.max(b.darkT, dur); if (amt) b.darkAmt = amt; };
  // generic telegraph marker on the floor (drawn by a thing) — e.g. geysers, strikes. Calls fire(S) at the end.
  B.marker = function (S, b, x, o) {
    o = o || {}; const warn = o.warn || 0.9, w = o.w || 40;
    const e = B.thing(S, b, { x: x - w / 2, y: GY - 10, w, h: 10, t: 0, layer: 'back', glow: o.glow, gx: x, gy: GY - 14, glowR: 30 });
    e.update = function (S, dt) { this.t += dt; if (this.t >= warn) { this.dead = true; if (o.fire) o.fire(S, x); } };
    e.draw = function (ctx) {
      const f = this.t / warn, bl = Math.floor(this.t * (8 + f * 10)) % 2 === 0;
      ctx.fillStyle = bl ? (o.col || '#ff3d3d') : 'rgba(255,61,61,.35)'; ctx.globalAlpha = 0.5 + f * 0.4;
      ctx.beginPath(); ctx.ellipse(x, GY + 1, w / 2 * (0.6 + f * 0.4), 5, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      if (o.icon) { const ic = ART().icon(o.icon); ctx.drawImage(ic, x - 9, GY - 30 - f * 6, 18, 18); }
    };
    return e;
  };
  // vertical eruption column (geyser / flame jet). hurts while up.
  B.column = function (S, b, x, o) {
    o = o || {}; const w = o.w || 34, hgt = o.h || 190, life = o.life || 0.9, col = o.col || '#8bd450';
    const e = B.thing(S, b, { x: x - w / 2, y: GY - hgt, w, h: hgt, t: 0, isShot: true, glow: o.glow, gx: x, gy: GY - hgt / 2, glowR: hgt * 0.6 });
    e.update = function (S, dt) { this.t += dt; if (this.t > life) this.dead = true; };
    e.box = function () { const f = Math.min(1, this.t / 0.12); return { x: this.x + 5, y: GY - hgt * f, w: w - 10, h: hgt * f }; };
    e.touch = function (S, p) { hurtP(S, p, this); };
    e.draw = function (ctx) {
      const f = Math.min(1, this.t / 0.12) * (this.t > life - 0.2 ? (life - this.t) / 0.2 : 1), hh = hgt * f;
      ctx.fillStyle = col; ctx.strokeStyle = '#1b1220'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x - w / 2, GY); ctx.quadraticCurveTo(x - w / 2 - 4, GY - hh * 0.5, x - w * 0.3 + Math.sin(this.t * 30) * 3, GY - hh);
      ctx.quadraticCurveTo(x, GY - hh - 16, x + w * 0.3, GY - hh); ctx.quadraticCurveTo(x + w / 2 + 4, GY - hh * 0.5, x + w / 2, GY); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fillRect(x - w * 0.18, GY - hh + 10, 5, Math.max(0, hh - 16));
      if (o.icon) { const ic = ART().icon(o.icon); ctx.drawImage(ic, x - 12, GY - hh - 22, 24, 24); }
    };
    return e;
  };
  // horizontal straight projectile at a fixed height (paper, soundwave, ticket...)
  B.straight = function (S, b, x, y, dir, o) { return B.shot(S, b, Object.assign({ x, y, vx: dir * ((o && o.speed) || 4.2), vy: 0, flat: true, flipX: dir < 0 }, o)); };

  // =====================================================================================================
  // DRAW — boss body, marks, screen UI (HP bar, blackout, off-screen tells), headline card
  // =====================================================================================================
  B.artOf = function (b, pose) { const d = b.def; if (d.drawn) return ART().drawn(d.drawn, pose != null ? pose : b.pose); return ART().sprite(d.art, (d.h || 104) * 2); };
  // draw a body (the boss or one of its sub-bodies) with shadow, squash, flip, hit flash and tell flash
  B.drawBody = function (ctx, S, b, body, opt) {
    opt = opt || {};
    const d = b.def, im = opt.im || B.artOf(b, body.pose);
    const a = body.anim || b.anim, H = (opt.h || d.h || 104);
    const cx = body.x + body.w / 2 + (a.ox || 0), base = body.y + body.h + (d.lift || 0) + (a.dy || 0);
    if (!opt.noShadow && b.st !== 'dying') { const up = Math.max(0, GY - (body.y + body.h)); ctx.fillStyle = 'rgba(0,0,0,' + Math.max(0.08, 0.28 - up / 600) + ')'; ctx.beginPath(); ctx.ellipse(body.x + body.w / 2, GY + 3, body.w * 0.75 * Math.max(0.4, 1 - up / 300), 6, 0, 0, 7); ctx.fill(); }
    const inv = body === b ? b.inv : (body.inv || 0);
    ctx.save();
    ctx.translate(cx, base); if (a.rot) ctx.rotate(a.rot);
    const flip = (body.face || b.face) !== (d.faces || -1);
    ctx.scale((flip ? -1 : 1) * a.sx, a.sy);
    if (inv > 0 && Math.floor(inv / 4) % 2 === 0) ctx.globalAlpha = 0.45;
    if (im) {
      const h = H, w = h * im.width / im.height;
      ctx.drawImage(im, -w / 2, -h, w, h);
      const fl = body === b ? b.flashT : (body.flashT || 0);
      if (fl > 0) { ctx.drawImage(ART().silhouette(im, '#ffffff'), -w / 2, -h, w, h); }
      else if ((b.st === 'tell' || body.st === 'tell') && Math.floor(b.t * 12) % 2 === 0) { ctx.globalAlpha *= 0.55; ctx.drawImage(ART().silhouette(im, '#ff2b2b'), -w / 2, -h, w, h); }
      else if (body.tint || b.tint) { ctx.globalAlpha *= (body.tintA || b.tintA || 0.35); ctx.drawImage(ART().silhouette(im, body.tint || b.tint), -w / 2, -h, w, h); }
    } else { ctx.fillStyle = '#d92b2b'; ctx.fillRect(-30, -74, 60, 74); ctx.fillStyle = '#111'; ctx.fillRect(-16, -58, 9, 7); ctx.fillRect(7, -58, 9, 7); }
    ctx.restore();
  };
  // "!" tell icon, stun stars, speech bubble
  B.drawMarks = function (ctx, S, b, body) {
    const d = b.def, H = d.h || 104, top = body.y + body.h - H + (b.anim.dy || 0) - 6, cx = body.x + body.w / 2;
    if (b.st === 'tell') { const ic = ART().icon('bang'), s = 26 + Math.sin(b.t * 20) * 3; ctx.drawImage(ic, cx - s / 2, top - s - 2, s, s); }
    if (b.st === 'stun') { const ic = ART().icon('star'); for (let i = 0; i < 3; i++) { const a = b.t * 4 + i * 2.1; ctx.drawImage(ic, cx + Math.cos(a) * 26 - 7, top + 6 + Math.sin(a) * 6 - 7, 14, 14); } }
    if (b.bubble) B.bubble(ctx, cx, top - (b.st === 'tell' ? 30 : 4), b.bubble.txt, b.bubble.col, Math.min(1, b.bubble.t * 4));
  };
  B.bubble = function (ctx, x, y, txt, col, alpha) {
    ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.font = 'bold 13px ' + LA.FONT; const tw = ctx.measureText(txt).width + 16, th = 22, bx = x - tw / 2, by = y - th - 8;
    ctx.fillStyle = '#fffdf2'; ctx.strokeStyle = '#1b1220'; ctx.lineWidth = 2.5;
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx, by, tw, th, 8); else ctx.rect(bx, by, tw, th);
    ctx.moveTo(x - 5, by + th); ctx.lineTo(x, by + th + 8); ctx.lineTo(x + 5, by + th); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fffdf2'; ctx.fillRect(x - 4, by + th - 2, 8, 3);
    ctx.fillStyle = col || '#1b1220'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x, by + th / 2 + 1);
    ctx.restore();
  };

  // ---------- screen-space UI (lives in S.ents so it keeps drawing through the clear state) ----------
  LA.ents.define('bossUI', (p) => Object.assign(p, {
    layer: 'front', always: true, x: -1e7, y: 0, w: 1, h: 1, drawW: 4e9, t0: LA.now(),
    update(S) { if (this.boss && S.boss !== this.boss && !this.boss.defeated) this.dead = true; },
    draw(ctx, S) {
      const b = this.boss; if (!b) return;
      ctx.save(); LA.view.resetTransform();
      if (b.dark > 0.01 && !b.defeated) drawDark(ctx, S, b);              // darkness sits above the players, below the HUD
      if (b.gust && !b.defeated) drawGust(ctx, S, b);
      if (!B.hooked) this.screen(ctx, S);
      ctx.restore();
    },
    screen(ctx, S) { const b = this.boss; if (S.boss === b) { drawHpBar(ctx, S, b); drawOffscreen(ctx, S, b); } },
  }));
  // Optional core hook (CORE-REQUESTS): game.draw calls LA.bosses.drawScreen(ctx,S) after the 'screen' set-piece
  // layer so the HP bar + headline sit above front scenery. Until then the entities above draw them themselves.
  B.hooked = false;
  B.drawScreen = function (ctx, S) {
    B.hooked = true; if (!S) return;
    for (const e of S.ents) if (!e.dead && (e.kind === 'bossUI' || e.kind === 'bossHeadline')) { ctx.save(); e.screen(ctx, S); ctx.restore(); }
  };
  function drawHpBar(ctx, S, b) {
    const VW = LA.view.VW, bw = Math.min(460, VW - 110), x0 = Math.round((VW - bw) / 2), slide = Math.min(1, (b.st === 'intro' ? b.stT : 9) * 2.2);
    const y0 = Math.round(66 - (1 - slide) * 90), hh = 14;
    ctx.globalAlpha = slide;
    ctx.fillStyle = 'rgba(15,10,24,.72)'; ctx.fillRect(x0 - 6, y0 - 24, bw + 12, hh + 32);
    ctx.font = 'bold 15px ' + LA.FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = '#1b1220'; ctx.strokeText(b.name, x0, y0 - 11); ctx.fillStyle = '#ffe36a'; ctx.fillText(b.name, x0, y0 - 11);
    if (b.nPh > 1) { ctx.textAlign = 'right'; ctx.font = 'bold 11px ' + LA.FONT; ctx.fillStyle = '#ffc4de'; ctx.fillText('PHASE ' + b.phase + '/' + b.nPh, x0 + bw, y0 - 11); }
    ctx.fillStyle = '#2a2233'; ctx.fillRect(x0, y0, bw, hh);
    const f = Math.max(0, b.hp / b.maxHp), g = Math.max(f, Math.min(1, b.shownHp / b.maxHp));
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x0, y0, bw * g, hh);
    ctx.fillStyle = b.phase >= 3 ? '#ff3d5e' : b.phase === 2 ? '#ff5a1f' : '#ff6fae'; ctx.fillRect(x0, y0, bw * f, hh);
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(x0, y0 + 2, bw * f, 3);
    ctx.fillStyle = '#1b1220'; for (const th of (b.def.phases || [])) ctx.fillRect(x0 + bw * th - 1, y0 - 2, 3, hh + 4);
    ctx.strokeStyle = '#fffdf2'; ctx.lineWidth = 2; ctx.strokeRect(x0 - 0.5, y0 - 0.5, bw + 1, hh + 1);
    ctx.globalAlpha = 1;
  }
  function drawOffscreen(ctx, S, b) {                                  // portrait fairness: point at an off-screen boss, loudly while it winds up
    const VW = LA.view.VW, sx = b.cx() - LA.camera.x;
    if (sx > -10 && sx < VW + 10) return;
    const left = sx < 0, x = left ? 20 : VW - 20, y = Math.max(140, b.y + b.h / 2 - 20), tell = b.st === 'tell';
    ctx.fillStyle = tell ? (Math.floor(b.t * 10) % 2 ? '#ff2b2b' : '#ffe36a') : 'rgba(255,255,255,.75)';
    ctx.strokeStyle = '#1b1220'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x + (left ? -12 : 12), y); ctx.lineTo(x + (left ? 8 : -8), y - 13); ctx.lineTo(x + (left ? 8 : -8), y + 13); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (tell) { const ic = ART().icon('bang'); ctx.drawImage(ic, x + (left ? 10 : -34), y - 12, 24, 24); }
  }
  let dkC = null, dkX = null;
  function drawDark(ctx, S, b) {
    const VW = LA.view.VW, VH = LA.view.VH, amt = b.darkAmt * b.dark;
    if (!dkC || dkC.width !== VW) { dkC = document.createElement('canvas'); dkC.width = VW; dkC.height = VH; dkX = dkC.getContext('2d'); }
    const x = dkX, hole = ART().lightHole(), cam = LA.camera.x;
    x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, VW, VH);
    x.fillStyle = 'rgba(3,4,12,' + amt.toFixed(3) + ')'; x.fillRect(0, 0, VW, VH);
    x.globalCompositeOperation = 'destination-out';
    for (const p of B.live(S)) { const R = 105; x.drawImage(hole, p.x + p.w / 2 - cam - R, p.y + p.h / 2 - R, R * 2, R * 2); }
    for (const e of b.things) if (!e.dead && e.glow) { const R = e.glowR || 34, gx = e.gx != null ? e.gx : e.x, gy = e.gy != null ? e.gy : e.y; x.drawImage(hole, gx - cam - R, gy - R, R * 2, R * 2); }
    x.globalCompositeOperation = 'source-over';
    ctx.drawImage(dkC, 0, 0, VW, VH);
    // his eyes glow in the dark so you can always track him
    const top = b.y + b.h - (b.def.h || 104) + (b.def.eyeY || 22), ex = b.cx() - cam + b.face * 4;
    ctx.fillStyle = '#fff36a'; ctx.globalAlpha = b.dark; ctx.beginPath(); ctx.arc(ex - 7, top, 3.2, 0, 7); ctx.arc(ex + 7, top, 3.2, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
  }
  function drawGust(ctx, S, b) {
    const g = b.gust, VW = LA.view.VW, cam = LA.camera.x, a = Math.min(1, g.t * 3, (g.T - g.t) * 6);
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.55 * a) + ')'; ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const y = (g.band ? g.band[0] : 250) + ((i * 37) % ((g.band ? g.band[1] - g.band[0] : 220) || 1));
      const x = ((i * 173 + b.t * 900 * g.dir) % (VW + 200) + VW + 200) % (VW + 200) - 100;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - g.dir * (30 + (i % 3) * 16), y); ctx.stroke();
    }
    void cam;
  }

  // ---------- HEADLINE card: the classic spinning newspaper ----------
  B.headline = function (S, b) {
    const d = b.def, hl = d.headline || [b.name + ' DEFEATED', 'City council calls emergency meeting to discuss it'];
    LA.ents.add(S, 'bossHeadline', { card: b.mem._cardC || ART().headline(b, hl[0], hl[1]), t0: S.t });
    B.sfx('select');
  };
  LA.ents.define('bossHeadline', (p) => Object.assign(p, {
    layer: 'front', always: true, x: -1e7, y: 0, w: 1, h: 1, drawW: 4e9,
    update() {},
    draw(ctx, S) { if (!B.hooked) { ctx.save(); LA.view.resetTransform(); this.screen(ctx, S); ctx.restore(); } },
    screen(ctx, S) {
      const T = (S.t - this.t0) + (S.state === 'clear' ? S.stateT : 0);          // game time (freezes with the sim)
      if (T > 6.5) { this.dead = true; return; }
      const VW = LA.view.VW, VH = LA.view.VH, c = this.card;
      const f = Math.min(1, T / 0.75), e = 1 - Math.pow(1 - f, 3), fade = T > 6 ? 1 - (T - 6) * 2 : 1;
      const cw = Math.min(560, VW - 36), ch = cw * c.height / c.width;
      ctx.save();
      ctx.globalAlpha = 0.35 * e * fade; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, VW, VH); ctx.globalAlpha = fade;
      ctx.translate(VW / 2, VH * 0.43); ctx.rotate((1 - e) * Math.PI * 4 - 0.035); ctx.scale(0.05 + e * 0.95, 0.05 + e * 0.95);
      ctx.drawImage(c, -cw / 2, -ch / 2, cw, ch);
      ctx.restore();
    },
  }));

  // ---------------- generic fallback (any boss name without a def) ----------------
  B.register('__generic', {
    art: null, hp: 5, phases: [0.5], speed: [1.4, 1.9], cd: [1.5, 1.1],
    headline: ['BOSS DEFEATED', 'Officials promise a task force'],
    attacks: { lob: { tell: 0.5, start(S, b) { const tp = B.target(S, b); B.lobTo(S, b, b.cx(), b.y + 20, tp ? B.pcx(tp) : b.cx() - 200, { icon: 'bow', size: 24 }); } } },
  });
})();
