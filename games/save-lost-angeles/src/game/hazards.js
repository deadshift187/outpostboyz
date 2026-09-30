// HAZARDS — Saint's street dangers, with his exact art + sizes:
//   potholes  S.potholes (art left x). The opening x+PIT_X .. +PIT_W has no floor (phys.overPit). LA.drawPotholes.
//   fire      trash-fire pile ('fire' 80x72). Stomp it out (+120) — side contact burns. BIG BOY / GOLD RUSH
//             walk right through and put it out (his rule @1156).
//   palm      burning palms (drawBurningPalm @1971, PALM consts @324): 'full' = engulfed, a SOLID block you can
//             land on (48x92); 'top' = only the crown burns (64x44 box up at GY-152) — run underneath.
//   cone      obCone: a slip hazard — harmless, no wall, skids you sideways (can shove you into real danger).
// Grills (grill3) and hurdle props are solid + harmless; they live in props.js.
(function () {
  'use strict';
  const LA = window.LA, K = LA.K, GY = K.GY, GP = LA.gp;
  const PALM_FULL_W = 48, PALM_FULL_H = 92, PALM_DRAW_H = 112, PALM_TOP_H = 152, PALM_CROWN = 44;
  LA.gameplay = LA.gameplay || {};
  LA.gameplay.PALM = { PALM_FULL_W, PALM_FULL_H, PALM_DRAW_H, PALM_TOP_H, PALM_CROWN };

  // ---------------- potholes ----------------
  let grad = null, gradCtx = null;
  LA.drawPotholes = function (ctx, S) {
    const P = S.potholes; if (!P || !P.length) return;
    const cx = LA.camera.x, VW = LA.view.VW, im = LA.img('pothole');
    if (!grad || gradCtx !== ctx) {
      grad = ctx.createLinearGradient(0, GY, 0, GY + 120);
      grad.addColorStop(0, '#2a211c'); grad.addColorStop(0.45, '#120d0e'); grad.addColorStop(1, '#050405'); gradCtx = ctx;
    }
    ctx.fillStyle = grad;
    for (let i = 0; i < P.length; i++) {
      const x = P[i]; if (x < cx - 90 || x > cx + VW + 90) continue;
      ctx.fillRect(x + K.PIT_X, GY, K.PIT_W, K.VH - GY + 90);
    }
    if (im) for (let i = 0; i < P.length; i++) { const x = P[i]; if (x < cx - 90 || x > cx + VW + 90) continue; ctx.drawImage(im, x, GY - 9, 64, 25); }
  };

  // ---------------- trash fire ----------------
  LA.ents.define('fire', (o) => ({
    x: o.x - 2, y: GY - 22, w: 44, h: 22, fx: o.x, t: o.t || 0, layer: 'mid', art: ['fire'], drawW: 90,
    update(S, dt) { this.t += dt * 8; },
    touch(S, p) {
      if (LA.powers.invincible(S, p) || p.power === 'grow') { out(S, this, 120, 'STOMPED +120'); return; }
      if (LA.phys.stompedFrom(p, this) && p.vy > 0) { p.bounce(S); out(S, this, 120, 'PUT OUT +120'); return; }
      p.hurt(S, 'fire');
    },
    draw(ctx) { const s = 1 + Math.sin(this.t) * 0.06; LA.di(ctx, 'fire', this.fx - 19, GY - 72 * s + 4, 80, 72 * s); },
  }));
  function out(S, f, pts, txt) {
    f.dead = true; LA.game.score(S, pts); LA.pop(S, f.fx + 20, GY - 44, txt, '#57e08a');
    LA.ents.add(S, 'gpfx', { mode: 'smoke', x: f.fx + 20, y: GY - 20 }); GP.sfx('fire', { out: true });
  }

  // ---------------- burning palm ----------------
  LA.ents.define('palm', (o, S) => {
    const full = o.kind === 'full', px = o.x;
    const e = { kind2: full ? 'full' : 'top', px, t: o.t || 0, layer: 'back', art: full ? ['palmBurn'] : ['palmTopArt', 'palm'], drawW: 140 };
    if (full) {
      Object.assign(e, { x: px, y: GY - PALM_FULL_H, w: PALM_FULL_W, h: PALM_FULL_H });
      e.solid = { x: px, y: GY - PALM_FULL_H, w: PALM_FULL_W, h: PALM_FULL_H, kind: 'palm' };
      S.solids.push(e.solid);
    } else {
      Object.assign(e, { x: px - 8, y: GY - PALM_TOP_H, w: PALM_FULL_W + 16, h: PALM_CROWN });
      e.touch = function (S, p) { if (!LA.powers.invincible(S, p)) p.hurt(S, 'fire'); };
    }
    e.update = function (S, dt) { this.t += dt * 7; };
    e.draw = function (ctx) {
      const cx = this.px + PALM_FULL_W / 2, H = full ? PALM_DRAW_H : PALM_TOP_H;
      const im = full ? LA.img('palmBurn') : (LA.img('palmTopArt') || LA.img('palm'));
      if (im) { const w = H * im.naturalWidth / im.naturalHeight; ctx.drawImage(im, cx - w / 2, GY - H, w, H); }
      if (!full && !LA.img('palmTopArt')) {
        const cy = GY - H + 22;
        for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, fx = cx + Math.cos(a) * 30, wob = Math.sin(this.t + i) * 5;
          ctx.fillStyle = i % 2 ? '#ff7a2e' : '#ffd23a'; ctx.beginPath(); ctx.moveTo(fx, cy - 26 - wob); ctx.lineTo(fx + 9, cy + 8); ctx.lineTo(fx - 9, cy + 8); ctx.closePath(); ctx.fill(); }
      }
      ctx.globalAlpha = 0.25 + Math.sin(this.t * 1.3) * 0.08;               // heat shimmer at the base
      ctx.fillStyle = '#ff7a2e'; ctx.beginPath(); ctx.ellipse(cx, GY - 4, 34, 9, 0, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    };
    return e;
  });

  // ---------------- tennis ball machine (rich-estate turret) ----------------
  // Saint playtest: "too small, not shooting balls anymore, and I can't kill it." It used to be a harmless
  // hurdle prop (45 px). Now a real hazard, Bill-Blaster style: it turns to face the nearest player, RUMBLES for
  // 0.6 s (shakes + blinking chute ring + "!"), then fires a bouncing tennis ball out of the chute. Balls hurt;
  // shoot one to swat it. The machine is a foe: stomp it or hit it with a crystal to wreck it (+200); side
  // contact hurts like any foe. Drawn 62 px (≈0.85× the 72 px hero ≈ 1.5 m) from props.js PROP_H.
  const BM_FIRE = 2.4, BM_TELL = 0.6, BM_RANGE = 520;
  function tennisArt() {
    return GP.cache('tennisBall', 16, 16, (g) => {
      g.fillStyle = '#d8f04a'; g.strokeStyle = '#191921'; g.lineWidth = 2;
      g.beginPath(); g.arc(8, 8, 6.6, 0, 7); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.45)'; g.beginPath(); g.arc(6, 5.6, 2.2, 0, 7); g.fill();
      g.strokeStyle = '#fbfff0'; g.lineWidth = 1.4;                   // the seam
      g.beginPath(); g.arc(1.5, 8, 5, -1.1, 1.1); g.stroke(); g.beginPath(); g.arc(14.5, 8, 5, Math.PI - 1.1, Math.PI + 1.1); g.stroke();
    });
  }
  LA.ents.define('tennisBall', (o) => ({
    x: o.x - 7, y: o.y - 7, w: 14, h: 14, vx: o.vx, vy: o.vy, bounces: 0, life: 4, rot: 0, layer: 'front', always: true, hostile: true,
    update(S, dt) {
      const k = dt * 60;
      this.vy += 0.2 * k; this.x += this.vx * k; this.y += this.vy * k; this.rot += this.vx * 0.06 * k; this.life -= dt;
      if (this.life <= 0 || this.y > K.VH + 40) { this.dead = true; return; }
      if (this.y + this.h >= GY && this.vy > 0 && LA.phys.floorAt(S, this.x + this.w / 2)) {
        this.y = GY - this.h;
        if (++this.bounces > 3) { this.dead = true; LA.ents.add(S, 'gpfx', { mode: 'poof', x: this.x + 7, y: GY - 6 }); return; }
        this.vy *= -0.62; this.vx *= 0.9;
      }
      const cx = LA.camera.x, VW = LA.view.VW;
      if (this.x < cx - 200 || this.x > cx + VW + 200) this.dead = true;
    },
    touch(S, p) {
      if (LA.powers.invincible(S, p)) { this.dead = true; return; }
      if (p.hurt(S, 'shot')) this.dead = true;
    },
    onShot(S) { this.dead = true; LA.ents.add(S, 'gpfx', { mode: 'poof', x: this.x + 7, y: this.y + 7 }); return true; },
    draw(ctx) {
      const a = tennisArt();
      ctx.save(); ctx.translate(this.x + 7, this.y + 7); ctx.rotate(this.rot); ctx.drawImage(a.cv, -8, -8, 16, 16); ctx.restore();
    },
  }));
  LA.ents.define('ballMachine', (o, S) => {
    const [pw, ph] = LA.gameplay.propDims('dsBallMachine'), gx = o.x, gy = GY - ph + 7;   // bedded 7 px into the lip like every prop
    const tierSp = (S && S.tier && S.tier.speed) || 1;
    return {
      gx, gy, pw, ph, x: gx + pw * 0.1, y: gy + ph * 0.18, w: pw * 0.8, h: ph * 0.82 - 7,   // hitbox: hopper rim to the street
      face: o.flip ? 1 : -1, cd: 1.2 + (o.seed || 0) % 1.4, tell: 0, recoil: 0, dying: null, foe: true, layer: 'mid', art: ['dsBallMachine'], drawW: pw,
      fireEvery: BM_FIRE / tierSp, shots: 0,
      update(S, dt) {
        if (this.dying) { this.dying.t += dt; if (this.dying.t > 0.5) this.dead = true; return; }
        if (this.recoil > 0) this.recoil -= dt;
        const cx = this.gx + pw / 2, p = GP.target(S, cx);
        if (!p) return;
        const dx = p.x + p.w / 2 - cx;
        if (this.tell > 0) {
          this.tell -= dt;
          if (this.tell <= 0) this.fire(S);
          return;
        }
        if (Math.abs(dx) > 30) this.face = dx > 0 ? 1 : -1;            // swivel to track you
        this.cd -= dt;
        if (this.cd <= 0) {
          if (Math.abs(dx) < BM_RANGE && Math.abs(dx) > 40 && LA.camera.visible(this.gx, pw, -10)) { this.tell = BM_TELL; GP.sfx('whoosh', { vol: 0.5 }); }
          else this.cd = 0.4;
        }
      },
      fire(S) {
        this.cd = this.fireEvery; this.recoil = 0.18; this.shots++;
        const mx = this.gx + pw / 2 + this.face * pw * 0.36, my = this.gy + ph * 0.66;   // the round chute on the front of the base
        LA.ents.add(S, 'tennisBall', { x: mx, y: my, vx: this.face * 4.4, vy: -3.6 });
        LA.pop(S, mx, this.gy - 4, 'THWOOP!', '#d8f04a'); GP.sfx('boing');
      },
      touch(S, p) {
        if (this.dying) return;
        if (LA.powers.invincible(S, p) || p.power === 'grow' && !LA.phys.stompedFrom(p, this)) { this.kill(S, 'flip', 'PLOWED +200'); GP.sfx('stomp'); return; }
        if (LA.phys.stompedFrom(p, this)) {
          const combo = p.bounce(S); S.stats.stomps++;
          this.kill(S, 'squash', (combo > 1 ? 'x' + combo + ' ' : '') + 'OUT! +200'); GP.sfx(combo > 1 ? 'combo' : 'stomp', { n: combo });
          return;
        }
        p.hurt(S, 'foe');
      },
      onShot(S) { if (this.dying) return false; this.kill(S, 'flip', 'FAULT! +200'); return true; },
      kill(S, how, txt) {
        if (this.dying) return;
        this.dying = { t: 0, how: how || 'squash' }; this.defeated = true; this.always = true;
        S.stats.kills++; S.run.kills++; LA.game.score(S, 200);
        LA.pop(S, this.gx + pw / 2, this.gy - 10, txt || '+200', '#d8f04a');
        LA.ents.add(S, 'gpfx', { mode: 'debris', x: this.gx + pw / 2, y: this.gy + ph * 0.4 }); GP.sfx('boom', { vol: 0.5 });
      },
      draw(ctx, S) {
        const cx = this.gx + pw / 2, base = this.gy + ph;
        ctx.save(); ctx.translate(cx, base);
        if (this.dying) { const f = Math.min(1, this.dying.t / 0.25); ctx.globalAlpha = 1 - Math.max(0, this.dying.t - 0.25) / 0.25; if (this.dying.how === 'squash') ctx.scale(1 + f * 0.3, 1 - f * 0.65); else ctx.rotate(-this.face * f * 1.3); }
        else if (this.tell > 0) ctx.translate(Math.sin(S.t * 60) * 1.4, 0);                                 // rumble
        else if (this.recoil > 0) ctx.scale(1 + this.recoil * 0.5, 1 - this.recoil * 0.6);                  // THWOOP squash
        if (this.face > 0) ctx.scale(-1, 1);                           // Saint's art faces LEFT (chute on the left)
        LA.di(ctx, 'dsBallMachine', -pw / 2, -ph, pw, ph);
        ctx.restore();
        if (this.dying || this.tell <= 0) return;
        const mx = cx + this.face * pw * 0.36, my = this.gy + ph * 0.66, bl = Math.floor(this.tell * 16) % 2 === 0;
        ctx.lineWidth = 3; ctx.strokeStyle = bl ? '#ffd23a' : '#ff5a1f'; ctx.beginPath(); ctx.arc(mx, my, 7 + (BM_TELL - this.tell) * 8, 0, 7); ctx.stroke();
        ctx.font = 'bold 16px ' + LA.FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 4; ctx.strokeStyle = '#191921'; ctx.strokeText('!', cx, this.gy - 14); ctx.fillStyle = '#ffd23a'; ctx.fillText('!', cx, this.gy - 14);
      },
    };
  });

  // ---------------- traffic cone (slip) ----------------
  // knocked-over cone: was 45 px tall (0.62× the hero ≈ a 1.1 m cone lying down); 34 px still reads at a glance
  const CONE_H = 34;
  LA.gameplay.CONE_H = CONE_H;
  LA.ents.define('cone', (o) => {
    const ph = CONE_H, d = LA.dims('obCone') || [199, 145], pw = Math.round(ph * d[0] / d[1]);
    const gx = o.x, gy = GY - ph + 7;
    return {
      gx, gy, pw, ph, x: gx + pw * 0.15, y: gy + 6, w: pw * 0.7, h: ph - 6, cd: 0, layer: 'back', art: ['obCone'], drawW: pw, flip: !!o.flip,
      update(S, dt) { if (this.cd > 0) this.cd -= dt * 60; },
      touch(S, p) {
        if (p.vy > 0 && (p.y + p.h - this.y) < 16) { p.vy = -8; p.jumps = 1; p.onGround = false; return; }       // hop off the top
        if (this.cd > 0 || !p.onGround) return;
        const dir = (p.x + p.w / 2) < (this.gx + this.pw / 2) ? -1 : 1;
        p.vx = dir * 8; p.vy = -3.5; p.lock = 12; p.onGround = false; this.cd = 45;
        LA.pop(S, this.gx + this.pw / 2, this.gy - 6, 'SLIP!', '#ffd23a'); GP.sfx('slip', { p: p.idx });
      },
      draw(ctx) { LA.di(ctx, 'obCone', this.gx, this.gy, this.pw, this.ph, this.flip); },
    };
  });
})();
