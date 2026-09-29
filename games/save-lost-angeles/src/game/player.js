// GOLDEN BOY (P1) and THE INTERN (P2). Movement is Saint's tuned physics, per 60Hz tick:
// GRAV .86, JUMPV -17, CUTV -4 (variable jump: let go early = short hop), ACC 1.05, MAXV 4.7, FRIC .80,
// double jump at 0.88x, sprint 1.7x, stomp bounce -10.5 (combo points x1..6), hitbox 22x30 with the art
// drawn larger (HERO_SCALE). Added feel: 5-tick coyote time + 6-tick jump buffer.
// Health is pure Mario (Saint's call): a power-up soaks one hit; with no power you go down.
(function () {
  'use strict';
  const LA = window.LA, K = LA.K, GY = K.GY;
  const ART_FACES = -1;                                                // his hero art faces left
  const POSES = { golden: 56, goldenHurt: 47, goldenJump: 50, goldenRun1: 46, goldenRun2: 46 };

  // P2 art = Golden Boy recolored (gold -> electric blue), baked once so it works on every browser
  const tinted = {};
  function p2Art(key) {
    if (tinted[key]) return tinted[key].ok ? tinted[key].cv : null;
    const src = LA.img(key); if (!src) return null;
    const cv = document.createElement('canvas'); cv.width = src.naturalWidth; cv.height = src.naturalHeight;
    const c = cv.getContext('2d'); c.drawImage(src, 0, 0);
    const d = c.getImageData(0, 0, cv.width, cv.height), a = d.data;
    for (let i = 0; i < a.length; i += 4) { const r = a[i], g = a[i + 1], b = a[i + 2]; a[i] = b * 0.9; a[i + 1] = g * 0.95 + 10; a[i + 2] = Math.min(255, r * 1.05 + 20); }
    c.putImageData(d, 0, 0);
    cv.naturalWidth = cv.width; cv.naturalHeight = cv.height;
    tinted[key] = { ok: true, cv }; return cv;
  }

  class Player {
    constructor(S, idx, x) {
      this.idx = idx; this.name = idx === 0 ? 'GOLDEN BOY' : 'THE INTERN';
      this.w = K.HERO_W; this.h = K.HERO_H; this.x = x; this.y = GY - this.h;
      this.vx = 0; this.vy = 0; this.face = 1; this.onGround = true; this.jumps = 0;
      this.inv = 0; this.active = true; this.ghost = false; this.ghostT = 0;
      this.runT = 0; this.squash = 0; this.wasAir = false; this.coyote = 0; this.buffer = 0;
      this.lastSafe = x; this.combo = 0; this.shotCD = 0; this.lock = 0; this.riding = null;
      this.power = null; this.powerT = 0;                              // set by LA.powers (gameplay agent)
      this.big = 1;                                                    // BIG BOY power scales art + hitbox
    }
    get cx() { return this.x + this.w / 2; }

    update(S, inp, dt) {
      if (this.ghost) {                                                // floating ghost, waiting for a revive
        this.vy = Math.max(-1.6, this.vy - 0.02); this.y += this.vy * 0.5; this.x += Math.sin(S.t * 3 + this.idx) * 0.6;
        this.y = Math.max(40, this.y); return;
      }
      if (this.inv > 0) this.inv--;
      if (this.shotCD > 0) this.shotCD -= dt;
      if (this.buffer > 0) this.buffer--;
      if (this.coyote > 0) this.coyote--;
      const pw = LA.powers, mods = pw && pw.mods ? pw.mods(S, this) : null;   // {speed, jump, grav}
      if (this.riding) { this.riding.carry && this.riding.carry(S, this, inp); return; }
      const locked = this.lock > 0; if (locked) this.lock--;
      // horizontal (his update@1121)
      const tilt = locked ? 0 : inp.axis;
      const sp = !locked && inp.sprint ? 1.7 : 1;
      if (tilt !== 0) { this.vx += K.ACC * sp * tilt; this.face = tilt < 0 ? -1 : 1; } else this.vx *= K.FRIC;
      let goo = 1; if (this.onGround && S.puddles) for (const pd of S.puddles) if (this.x + this.w > pd.x - pd.r && this.x < pd.x + pd.r) { goo = 0.55; break; }
      const lim = K.MAXV * sp * (tilt !== 0 ? Math.max(0.34, Math.abs(tilt)) : 1) * goo * (mods && mods.speed || 1) * (S.tier.speed ? 1 : 1);
      this.vx = LA.clamp(this.vx, -lim, lim);
      // jump: edge press, buffered; coyote lets you jump just after leaving a ledge
      if (!locked && inp.jumpP) this.buffer = 6;
      if (this.buffer > 0) {
        const jm = (mods && mods.jump) || 1;
        if (this.onGround || this.coyote > 0) { this.vy = K.JUMPV * jm; this.onGround = false; this.coyote = 0; this.jumps = 1; this.buffer = 0; this.squash = 0; LA.audio && LA.audio.sfx('jump', { p: this.idx }); }
        else if (this.jumps < 2 && inp.jumpP) { this.vy = K.JUMPV * 0.88 * jm; this.jumps = 2; this.buffer = 0; LA.audio && LA.audio.sfx('jump2', { p: this.idx }); }
      }
      // fire (crystal lob — gameplay agent implements LA.shoot)
      if (!locked && inp.fireP && LA.shoot) LA.shoot(S, this);
      if (!locked && inp.fire && LA.shootHeld) LA.shootHeld(S, this);
      // physics
      const wasGround = this.onGround;
      const r = LA.phys.move(S, this, { cut: !(inp.jumpHeld), cutv: K.CUTV, gravScale: (mods && mods.grav) || 1 });
      this.onGround = r.onGround;
      if (r.landed && this.wasAir) { this.squash = 1; this.jumps = 0; this.combo = 0; LA.audio && LA.audio.sfx('land', { p: this.idx, soft: true }); }
      if (this.onGround) { this.jumps = 0; this.combo = 0; this.coyote = 5; this.wasAir = false;
        if (r.ground === 'street' && this.safeSpot(S)) this.lastSafe = Math.max(this.lastSafe, this.x);
        if (r.ground && r.ground.onStand) r.ground.onStand(S, this);
      } else { if (wasGround && this.vy >= 0) {/* walked off */} this.wasAir = true; }
      if (this.x < S.x0) { this.x = S.x0; this.vx = 0; }
      if (this.x + this.w > S.x1 + 400) { this.x = S.x1 + 400 - this.w; this.vx = 0; }
      if (this.onGround && Math.abs(this.vx) > 0.5) this.runT += dt * 14;
      if (this.squash > 0) this.squash = Math.max(0, this.squash - dt * 6);
      if (this.y > LA.view.VH + 60) LA.game.playerDown(S, this, 'pit');
    }
    // safe respawn spot: firmly on the street, away from pothole/pit lips (his lastSafe rule keeps runway)
    safeSpot(S) {
      const c = this.cx;
      for (const ph of S.potholes) if (c > ph - 70 && c < ph + K.PIT_X + K.PIT_W + 70) return false;
      for (const g of S.ground) if (c > g.x && c < g.x + g.w) return c > g.x + 90 && c < g.x + g.w - 90;
      return false;
    }
    // Mario rules: power soaks the hit (you shrink / lose it), otherwise you're down
    hurt(S, src) {
      if (this.inv > 0 || this.ghost || !this.active || S.state !== 'play') return false;
      if (LA.powers && LA.powers.invincible && LA.powers.invincible(S, this)) return false;
      if (window.__LA_GOD) return false;
      if (this.power) {
        const was = this.power; LA.powers && LA.powers.end ? LA.powers.end(S, this, 'hit') : (this.power = null);
        this.inv = 100; this.vy = -4; this.jumps = 0;
        LA.pop(S, this.x, this.y - 20, was === 'grow' ? 'SHRUNK!' : 'POWER LOST!', '#ff9f2e');
        LA.audio && LA.audio.sfx('hurt', { p: this.idx }); LA.camera.kick(4);
        return true;
      }
      LA.camera.kick(7);
      LA.game.playerDown(S, this, src || 'hit');
      return true;
    }
    // stomp bounce (his: stompCombo++, vy=-10.5, score 150*min(combo,6)); returns the combo count
    bounce(S, strong) {
      this.combo++; this.vy = strong ? -11.5 : -10.5; this.jumps = 1; this.onGround = false; this.wasAir = true;
      return this.combo;
    }
    respawn(S, x) {
      this.active = true; this.ghost = false; this.x = x; this.y = GY - this.h - 30; this.vx = 0; this.vy = 0;
      this.inv = 110; this.power = null; this.big = 1; this.riding = null; this.lock = 0; this.lastSafe = x;
    }
    celebrate(S, dt) { if (this.onGround && Math.random() < 0.02) this.vy = -8; LA.phys.move(S, this, {}); this.vx *= 0.9; }

    draw(ctx, S) {
      if (!this.active) return;
      if (!this.ghost && this.inv > 0 && Math.floor(this.inv / 5) % 2 === 0) return;
      const cx = this.cx, base = this.y + this.h + 3;
      const bob = this.onGround && Math.abs(this.vx) > 0.5 ? Math.abs(Math.sin(this.runT)) * 2.2 : 0;
      let sx = 1, sy = 1;
      if (this.squash > 0) { sy = 1 - this.squash * 0.2; sx = 1 + this.squash * 0.16; } else if (!this.onGround) { sy = 1 + (this.vy < 0 ? 0.08 : 0.05); sx = 0.95; }
      const art = (k) => (this.idx === 1 ? p2Art(k) : LA.img(k));
      let key = 'golden';
      if (this.inv > 0 && art('goldenHurt')) key = 'goldenHurt';
      else if (!this.onGround && art('goldenJump')) key = 'goldenJump';
      else if (this.onGround && Math.abs(this.vx) > 0.6 && art('goldenRun1') && art('goldenRun2')) key = Math.floor(this.runT / 2.2) % 2 ? 'goldenRun2' : 'goldenRun1';
      const im = art(key);
      const posed = key !== 'golden'; if (posed) { sx = 1; sy = 1; }
      const B = this.big || 1;
      const asp = im ? im.naturalWidth / im.naturalHeight : 0.5, h = POSES[key] * K.HERO_SCALE * sy * B, w = h * asp * sx;
      ctx.save();
      if (this.ghost) { ctx.globalAlpha = 0.55 + Math.sin(S.t * 6) * 0.15; }
      ctx.translate(cx, base - (key.indexOf('goldenRun') === 0 ? 0 : bob));
      ctx.rotate(key === 'goldenHurt' ? -0.25 * this.face : LA.clamp(this.vx * 0.022, -0.14, 0.14));
      ctx.scale(this.face * ART_FACES, 1);
      if (LA.powers && LA.powers.glow) { const g = LA.powers.glow(S, this); if (g) { ctx.shadowColor = g; ctx.shadowBlur = 22; } }
      if (im) ctx.drawImage(im, -w / 2, -h, w, h);
      else { ctx.fillStyle = this.idx ? '#2e9cf0' : '#e8b020'; ctx.fillRect(-8, -24, 16, 17); ctx.fillStyle = '#ffcfa3'; ctx.beginPath(); ctx.arc(0, -30, 9, 0, 7); ctx.fill(); }
      ctx.restore();
      if (this.ghost) {                                                // halo + revive hint
        ctx.save(); ctx.strokeStyle = '#fff6b0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(cx, this.y - 30 * B, 11, 4, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 10px ' + LA.FONT; ctx.textAlign = 'center'; ctx.fillText(Math.ceil(this.ghostT) + 's', cx, this.y - 42); ctx.restore();
      }
      if (S.players.length > 1 && !this.ghost) {                       // tiny P1/P2 tag in co-op
        ctx.fillStyle = this.idx ? '#5ec8ff' : '#ffd23a'; ctx.font = 'bold 9px ' + LA.FONT; ctx.textAlign = 'center';
        ctx.fillText(this.idx ? 'P2' : 'P1', cx, this.y - 50 * B);
      }
    }
  }
  LA.Player = Player;
})();
