// src/setpieces/flight.js — OWNER: setpieces agent.
// SAN FRANCISCO (5-5) opens with the flight north. Port of updateFlight / drawFlight (lost-angeles-ed.html
// 1456-1493, trigger @1110): the map is continuous, so crossing into SF plays as a flight — the screen
// becomes sky for a few seconds, his LOW SPIRITS AIR jet ('bBur6') crosses it, clouds stream past on three
// altitude bands, and a caption reads LONG BEACH ✈ SFO / 380 MILES · NO REFUNDS. Input is locked while
// flying (jump/fire skips after a beat). Works mid Full City Run too.
(function () {
  'use strict';
  const LA = window.LA, SP = LA.setpieces;
  const DUR = 4.6;
  let sky = null, skyH = 0;

  SP.register('flight', {
    init(S, lv) {
      SP.art(S, ['bBur6']);
      const skip = S.lastCP > lv.x0 + 1500;                                  // restarting from a checkpoint: no replay
      return { flown: skip, on: false, t: 0, px: -150 };
    },
    update(S, sp, dt) {
      if (sp.flown && !sp.on) return;
      const lv = sp.level, p = SP.lead(S);
      if (!sp.on) {
        if (p && p.x > lv.x0 + 30 && p.x < lv.x0 + 1500) { sp.on = true; sp.t = 0; sp.flown = true; sp.hadBanner = !!S.banner; S.banner = null; S.flags.flight = 'flying'; }
        else return;
      }
      sp.t += dt;
      const VW = LA.view.VW;
      sp.px = -150 + (VW + 320) * Math.min(1, sp.t / DUR);
      for (const q of S.players) { q.lock = Math.max(q.lock, 2); q.vx = 0; q.inv = Math.max(q.inv, 9); }   // 9 = untouchable without the post-flight blink
      const inp = LA.input && LA.input.p && LA.input.p[0];
      if (sp.t > 1.2 && sp.t < DUR * 0.88 && inp && (inp.jumpP || inp.fireP || inp.startP)) sp.t = DUR * 0.88;
      if (S.banner) S.banner = null;                                         // the sky IS the title card
      if (sp.t >= DUR) {
        sp.on = false; S.flags.flight = 'landed';
        for (const q of S.players) q.lock = 0;
        SP.banner(S, 'SAN FRANCISCO', 'GOV. NEWSCUM IS WAITING', 2.6);
      }
    },
    draw(ctx, S, sp, layer) {
      if (!sp.on || layer !== 'screen') return;
      const VW = LA.view.VW, VH = LA.view.VH, t = sp.t / DUR;
      if (!sky || skyH !== VH) { sky = ctx.createLinearGradient(0, 0, 0, VH); sky.addColorStop(0, '#2f6ea8'); sky.addColorStop(0.55, '#8ed3ee'); sky.addColorStop(1, '#cfe9f2'); skyH = VH; }
      ctx.fillStyle = sky; ctx.fillRect(0, 0, VW, VH);
      // clouds streaming past — three bands on different speeds so it reads as altitude
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      const span = VW + 220, n = Math.ceil(span / 150);
      for (let b = 0; b < 3; b++) {
        const sp2 = 90 + b * 130, yy = VH * 0.15 + b * VH * 0.2, r = 15 + b * 7;
        for (let i = 0; i < n; i++) {
          let cx = ((i * 150 + sp.t * sp2) % span) - 110; cx = VW - cx;
          ctx.beginPath(); ctx.arc(cx, yy, r, 0, 7); ctx.arc(cx + r, yy + 3, r * 0.8, 0, 7); ctx.arc(cx - r * 0.9, yy + 4, r * 0.7, 0, 7); ctx.fill();
        }
      }
      // the plane, crossing left to right (nose first)
      const py = VH * 0.46 + Math.sin(sp.t * 1.7) * 9, pw = LA.clamp(VW * 0.36, 170, 330), ph = pw * 0.446;
      if (!LA.di(ctx, 'bBur6', sp.px, py - ph / 2, pw, ph)) {
        ctx.fillStyle = '#dfe6f5'; ctx.fillRect(sp.px, py - 8, pw, 16);
        ctx.beginPath(); ctx.moveTo(sp.px + pw * 0.5, py); ctx.lineTo(sp.px + pw * 0.35, py + 26); ctx.lineTo(sp.px + pw * 0.62, py + 2); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 5; ctx.lineCap = 'round';   // contrail
      ctx.beginPath(); ctx.moveTo(sp.px + 4, py); ctx.lineTo(Math.max(-20, sp.px - 150), py + 3); ctx.stroke();
      // caption
      const bw = Math.min(VW - 40, 420), bx = (VW - bw) / 2, by = VH * 0.72;
      ctx.fillStyle = 'rgba(10,14,22,.62)'; ctx.fillRect(bx, by, bw, 58);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffb454'; ctx.font = 'bold 22px ' + LA.FONT; ctx.fillText('LONG BEACH  ✈  SFO', VW / 2, by + 22);
      ctx.fillStyle = '#dfe6f5'; ctx.font = 'bold 12px ' + LA.FONT; ctx.fillText('380 MILES · NO REFUNDS', VW / 2, by + 42);
      // fade in and out so it doesn't cut hard
      const fade = t < 0.12 ? 1 - t / 0.12 : (t > 0.88 ? (t - 0.88) / 0.12 : 0);
      if (fade > 0) { ctx.globalAlpha = Math.min(1, fade); ctx.fillStyle = '#0b0d14'; ctx.fillRect(0, 0, VW, VH); ctx.globalAlpha = 1; }
    },
  });
})();
