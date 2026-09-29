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
