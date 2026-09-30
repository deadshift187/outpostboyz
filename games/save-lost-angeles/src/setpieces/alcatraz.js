// src/setpieces/alcatraz.js — OWNER: setpieces agent.
// ALCATRAZ (5-6): the SF bay ferry. Port of azInit / azTick / azDraw (lost-angeles-ed.html 1527-1584):
// the bay between the last SF pier and Alcatraz ('bAlcatrazed') has no floor (S.water + a real gap).
// A deck (S.solids, deck:true) sits at street height butted against the pier so you walk straight on;
// stand aboard ~0.5 s and it casts off, carrying you across ('bSilverSpeedboatNoSign'), then docks at the
// island. Fixes over his version: riders are carried through the deck's onStand hook (never slide off),
// an empty ferry sails back to whichever shore you're on (no stranding), and falling in the bay puts you
// back on the dock with no life lost. The NEWSCUM fight is the bosses agent's arena at the level end.
// S.flags.ferry = 'docked' | 'sailing' | 'crossed'.
(function () {
  'use strict';
  const LA = window.LA, SP = LA.setpieces, K = LA.K, GY = K.GY;
  const DECK_W = 170, SAIL = 3.4, RETURN = 8, BOARD = 30, BOAT_H = 80;   // his 3.4 px/tick crossing; an empty ferry hurries back
  let waterGrad = null;

  function geo(lv) {                                                        // his azInit(): water from the last pier to the island
    const t = LA.city.tile('bAlcatrazed'); if (!t) return null;
    const e = LA.city.edit('bAlcatrazed') || {}; if (e.del) return null;
    const island = (t.x + (e.dx || 0)) / K.BG_PAR;
    const wx0 = LA.levels.ferryX ? LA.levels.ferryX() : null, wx1 = island - 70;
    return wx0 == null || wx1 - wx0 < 500 || !SP.inLevel(lv, wx0, 0) ? null : { wx0, wx1 };
  }
  SP.register('alcatraz', {
    reserve(lv) { const g = geo(lv); return g ? [[g.wx0 - 200, g.wx1 + 400]] : []; },
    init(S, lv) {
      const g = geo(lv); if (!g) return { off: true };
      const wx0 = g.wx0, wx1 = g.wx1;
      SP.art(S, ['bSilverSpeedboatNoSign', 'wSurf']);
      SP.clearRange(S, wx0 - 160, wx1 + 360);                                 // nothing waiting on the docks or in the bay
      SP.fillGround(S, wx0 - 400, wx0);
      SP.fillGround(S, wx1, wx1 + 400);
      LA.game.addGap(S, wx0, wx1 - wx0);
      SP.addWater(S, (cx) => cx > wx0 && cx < wx1);
      const deck = { x: wx0, y: GY, w: DECK_W, h: 16, deck: true, kind: 'ferry', onStand: (S2, p) => { p._ferry = S2.tick; } };
      S.solids.push(deck);
      return { wx0, wx1, deck, vx: 0, side: 0, board: 0, cool: false, idle: 0, splashT: 0, crossed: false };
    },
    update(S, sp, dt) {
      if (sp.off) return;
      const P = sp.deck, startX = sp.wx0, endX = sp.wx1 - P.w;
      const riders = S.players.filter((q) => q._ferry === S.tick && q.active && !q.ghost);
      if (riders.length) sp.board++; else { sp.board = 0; sp.cool = false; }   // step off -> re-arm for the next trip
      const destX = sp.side === 0 ? endX : startX;
      if (riders.length && !sp.cool && sp.board > BOARD && sp.vx === 0 && Math.abs(P.x - destX) > 2) {
        sp.vx = sp.side === 0 ? SAIL : -SAIL; S.flags.ferry = 'sailing'; SP.sfx('power');
        if (sp.side === 0 && !sp.crossed) LA.pop(S, P.x + P.w / 2, GY - 90, 'ALL ABOARD!', '#bfe9ff', true);
        // co-op: a partner dawdling on the same dock hops on too (the shared screen can't split across the bay)
        SP.live(S).forEach((q, i) => {
          if (q._ferry === S.tick || Math.abs(q.x + q.w / 2 - (P.x + P.w / 2)) > 420 || q.riding) return;
          q.x = P.x + 24 + i * 60; q.y = P.y - q.h - 1; q.vx = 0; q.vy = 0; q._ferry = S.tick; riders.push(q);
          LA.pop(S, q.x + q.w / 2, q.y - 20, 'HOP ON!', '#bfe9ff');
        });
      }
      // an empty ferry sails back to whichever shore the players are standing on
      const live = SP.live(S);
      if (!riders.length && sp.vx === 0 && live.length) {
        const onPier = live.every((q) => q.x + q.w < sp.wx0 + 4), onIsland = live.every((q) => q.x > sp.wx1 - 4);
        if ((sp.side === 1 && onPier) || (sp.side === 0 && onIsland)) { if ((sp.idle += dt) > 0.8) { sp.vx = sp.side === 1 ? -RETURN : RETURN; sp.idle = 0; S.flags.ferry = 'sailing'; } }
        else sp.idle = 0;
      } else if (!riders.length && sp.vx !== 0 && live.length) {              // fell off mid-crossing: the empty ferry turns around
        const back = sp.vx > 0 ? live.every((q) => q.x + q.w < sp.wx0 + 4) : live.every((q) => q.x > sp.wx1 - 4);
        if (back && (sp.idle += dt) > 0.5) { sp.vx = sp.vx > 0 ? -RETURN : RETURN; sp.side = sp.vx < 0 ? 1 : 0; sp.idle = 0; }
      }
      if (sp.vx !== 0) {
        if (riders.length && Math.abs(sp.vx) > SAIL) sp.vx = LA.sign(sp.vx) * SAIL;
        P.x += sp.vx;
        for (const q of riders) q.x += sp.vx;                                 // the ride carries the players
        if (sp.vx > 0 && P.x >= endX) { const o = P.x - endX; P.x = endX; for (const q of riders) q.x -= o; sp.vx = 0; sp.side = 1; sp.cool = riders.length > 0; S.flags.ferry = 'docked'; }
        else if (sp.vx < 0 && P.x <= startX) { const o = startX - P.x; P.x = startX; for (const q of riders) q.x += o; sp.vx = 0; sp.side = 0; sp.cool = riders.length > 0; S.flags.ferry = 'docked'; }
      }
      // fell in the bay: back on the dock, no life lost (never a softlock)
      for (const q of S.players) {
        if (!q.active || q.ghost) continue;
        const cx = q.x + q.w / 2;
        if (cx > sp.wx0 && cx < sp.wx1 && q.y + q.h > GY + 34) {
          // co-op: climb aboard beside a partner who's riding, or join one who already crossed (the shared camera
          // would otherwise keep shoving the one left on the pier back into the bay)
          const mate = live.find((m) => m !== q && m._ferry === S.tick), across = live.find((m) => m !== q && m.x > sp.wx1);
          const home = mate ? P.x + (mate.x - P.x > P.w / 2 ? 20 : P.w - 20 - q.w) : (across || (sp.side === 1 && sp.vx === 0)) ? sp.wx1 + 50 : sp.wx0 - 70;
          LA.pop(S, cx, GY - 20, 'SPLASH!', '#7fd8ff', true); SP.sfx('splash');
          q.x = home; q.y = (mate ? P.y : GY) - q.h - 2; q.vx = 0; q.vy = 0; q.inv = Math.max(q.inv, 60); q.jumps = 0;
          if (!mate) q.lastSafe = Math.min(q.lastSafe || home, home);
        }
      }
      if (!sp.crossed && live.some((q) => q.onGround && q.x > sp.wx1 + 20)) {
        sp.crossed = true; S.flags.ferry = 'crossed';
        SP.banner(S, 'ALCATRAZED', 'NO ESCAPE PLAN · NEWSCUM IS INSIDE', 2.8);
        SP.checkpoint(S, sp.wx1 + 120);                                       // island dock: a death here never re-sails the bay
      }
    },
    draw(ctx, S, sp, layer) {
      if (sp.off) return;
      const cam = LA.camera, VW = LA.view.VW, VH = LA.view.VH;
      if (!cam.visible(sp.wx0 - 40, sp.wx1 - sp.wx0 + 80, 20)) return;
      if (layer === 'ground') {
        const x0 = sp.wx0, x1 = sp.wx1;
        ctx.save(); ctx.beginPath(); ctx.rect(x0, GY - 12, x1 - x0, VH); ctx.clip();   // all water stays inside the channel
        if (!waterGrad) { waterGrad = ctx.createLinearGradient(0, GY - 8, 0, GY + 170); waterGrad.addColorStop(0, '#2e6a8f'); waterGrad.addColorStop(1, '#0d2635'); }
        ctx.fillStyle = waterGrad; ctx.fillRect(Math.max(x0, cam.x - 10), GY - 8, Math.min(x1, cam.x + VW + 10) - Math.max(x0, cam.x - 10), VH - GY + 8);
        const wim = LA.img('wSurf');
        if (wim) {
          const iw = wim.naturalWidth, off = (S.t * 14) % iw; ctx.globalAlpha = 0.5;
          for (let xx = x0 - off; xx < x1; xx += iw) if (xx + iw > cam.x - 10 && xx < cam.x + VW + 10) ctx.drawImage(wim, Math.round(xx), GY - 10, iw, wim.naturalHeight);
          ctx.globalAlpha = 1;
        }
        ctx.restore();
        ctx.fillStyle = '#20262e'; ctx.fillRect(x0 - 7, GY - 8, 7, VH - GY + 8); ctx.fillRect(x1, GY - 8, 7, VH - GY + 8);   // pilings
        ctx.fillStyle = '#5b4632'; ctx.fillRect(x0 - 26, GY - 4, 26, 6); ctx.fillRect(x1, GY - 4, 26, 6);
        return;
      }
      if (layer === 'back') {
        const P = sp.deck, im = LA.img('bSilverSpeedboatNoSign'), now = S.t;
        if (im) {
          const bw = BOAT_H * im.naturalWidth / im.naturalHeight;
          const bob = sp.vx !== 0 ? Math.sin(now * 7) * 1.6 : Math.sin(now * 1.4) * 3;
          ctx.drawImage(im, Math.round(P.x - (bw - P.w) / 2), Math.round(P.y + P.h - BOAT_H + 22 + bob), Math.round(bw), BOAT_H);
        } else { ctx.fillStyle = '#9aa4b4'; ctx.fillRect(P.x, P.y, P.w, P.h); }
        if (sp.vx === 0 && !S.players.some((q) => q._ferry === S.tick)) SP.bubble(ctx, sp.side === 0 ? 'FERRY ▸ ALCATRAZ' : '◂ FERRY', P.x + P.w / 2, GY - 64, '#0a5c8a', 11);
        else if (sp.vx === 0 && sp.board <= BOARD) SP.bubble(ctx, 'CASTING OFF…', P.x + P.w / 2, GY - 84, '#0a5c8a', 11);
      }
    },
  });
})();
