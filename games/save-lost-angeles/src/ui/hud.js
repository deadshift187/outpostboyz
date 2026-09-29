// HUD — LA.hud.draw(ctx,S) in screen coords after the world, and LA.hud.drawLoading(ctx,S) (the level
// card while art streams in). Compact dark rounded chips like Saint's page HUD: lives, crystals, score
// top-left; level badge + clock top-right; active power + timer; P2 panel in co-op; district banners;
// clear / down callouts. The top-centre band stays clear during boss fights (bosses agent's HP bar).
(function () {
  'use strict';
  const LA = window.LA, ui = LA.ui;
  const hud = LA.hud = {};
  const H = 26, PAD = 8, GAP = 6;
  const POWERS = () => (LA.CONTENT && LA.CONTENT.POWERS) || {};
  const powerMax = [0, 0], powerKey = [null, null];

  // illustrated HUD icons (ITEM-ART.md: itemHudHeart / itemHudCrystal) — false = keep the code-drawn icon
  const icon = (ctx, n, x, y, w, h) => !!(LA.items && LA.items.draw(ctx, n, x, y, w, h));
  function chipW(ctx, parts) { let w = 14; for (const p of parts) { ctx.font = p.font; w += ctx.measureText(p.s).width + (p.gap || 0); } return w; }

  function livesChip(ctx, x, y, S) {
    const s = '×' + Math.max(0, S.run.lives);
    ctx.font = ui.f(15, '800', true); const w = 34 + ctx.measureText(s).width;
    ui.chip(ctx, x, y, w, H); if (!icon(ctx, 'HudHeart', x + 8, y + 6, 14, 14)) ui.heart(ctx, x + 15, y + 6, 14, '#ff5d5d');
    ui.text(ctx, s, x + 26, y + H / 2 + 1, { size: 15, weight: '800', mono: true, align: 'left', stroke: false, col: '#fff' });
    return w;
  }
  function crysChip(ctx, x, y, S) {
    const s = String(S.run.crystals);
    ctx.font = ui.f(15, '800', true); const w = 32 + ctx.measureText(s).width;
    ui.chip(ctx, x, y, w, H); if (!icon(ctx, 'HudCrystal', x + 6, y + H / 2 - 8, 16, 16)) ui.gem(ctx, x + 14, y + H / 2, 8);
    ui.text(ctx, s, x + 25, y + H / 2 + 1, { size: 15, weight: '800', mono: true, align: 'left', stroke: false, col: '#57e08a' });
    return w;
  }
  function scoreChip(ctx, x, y, S) {
    const s = ui.num(S.run.score);
    ctx.font = ui.f(15, '800', true); const vw = ctx.measureText(s).width;
    const w = 16 + 38 + vw;
    ui.chip(ctx, x, y, w, H);
    ui.text(ctx, 'SCORE', x + 8, y + H / 2 + 1, { size: 9, weight: 'bold', mono: true, align: 'left', stroke: false, col: ui.C.dim });
    ui.text(ctx, s, x + w - 8, y + H / 2 + 1, { size: 15, weight: '800', mono: true, align: 'right', stroke: false, col: '#fff' });
    return w;
  }
  // level badge (world colour) + name, and the clock under it
  function levelChip(ctx, rightX, y, S, maxW) {
    const lv = S.level, full = S.mode === 'fullrun';
    const id = full ? 'RUN' : lv.id;
    ctx.font = ui.f(12, '800', true); const iw = ctx.measureText(id).width + 12;
    ctx.font = ui.f(12, '800'); let name = lv.name; let nw = ctx.measureText(name).width;
    const avail = maxW - iw - 18;
    if (nw > avail) {
      while (name.length > 3 && ctx.measureText(name + '…').width > avail) name = name.slice(0, -1);
      name = name.trimEnd() + '…'; nw = ctx.measureText(name).width;
    }
    const w = iw + nw + 18, x = rightX - w;
    ui.chip(ctx, x, y, w, H);
    ui.rr(ctx, x + 4, y + 4, iw, H - 8, 6); ctx.fillStyle = lv.world.col; ctx.fill();
    ui.text(ctx, id, x + 4 + iw / 2, y + H / 2 + 1, { size: 12, weight: '800', mono: true, stroke: false, col: '#0b0d14' });
    ui.text(ctx, name, x + iw + 11, y + H / 2 + 1, { size: 12, weight: '800', align: 'left', stroke: false, col: '#fff' });
    return w;
  }
  function clockChip(ctx, rightX, y, S) {
    const full = S.mode === 'fullrun';
    const s = full ? ui.time(S.run.time) : ui.timeShort(S.t);
    ctx.font = ui.f(12, 'bold', true); const w = ctx.measureText(s).width + 16 + (full ? 0 : 0);
    ui.chip(ctx, rightX - w, y, w, 20, { r: 7 });
    ui.text(ctx, s, rightX - w / 2, y + 11, { size: 12, weight: 'bold', mono: true, stroke: false, col: full ? '#ffcc3a' : '#dfe3ee' });
    return w;
  }
  function powerW(ctx, p, tag) {
    const P = POWERS()[p.power] || {}; ctx.font = ui.f(11, '800');
    return 12 + (tag ? 22 : 0) + ctx.measureText(P.n || String(p.power).toUpperCase()).width + 8 + 54 + 8;
  }
  // power chip: name in the power's colour + draining bar
  function powerChip(ctx, x, y, S, p, tag) {
    const k = p.power, P = POWERS()[k] || {};
    if (powerKey[p.idx] !== k) { powerKey[p.idx] = k; powerMax[p.idx] = Math.max(p.powerT || 0, P.dur || 0, 0.001); }
    if (p.powerT > powerMax[p.idx]) powerMax[p.idx] = p.powerT;
    const name = (P.n || String(k).toUpperCase());
    ctx.font = ui.f(11, '800'); const nw = ctx.measureText(name).width;
    const tw = tag ? 22 : 0, bw = 54, w = 12 + tw + nw + 8 + bw + 8;
    const col = P.col || '#ffcc3a';
    ui.chip(ctx, x, y, w, 22, { r: 8, border: col });
    if (tag) ui.text(ctx, tag, x + 8, y + 12, { size: 10, weight: '800', mono: true, align: 'left', stroke: false, col: p.idx ? '#5ec8ff' : '#ffd23a' });
    ui.text(ctx, name, x + 8 + tw, y + 12, { size: 11, weight: '800', align: 'left', stroke: false, col });
    const f = LA.clamp((p.powerT || 0) / powerMax[p.idx], 0, 1), bx = x + 12 + tw + nw + 4;
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(bx, y + 8, bw, 6);
    const low = f < 0.25 && Math.floor(S.t * 8) % 2 === 0;
    ctx.fillStyle = low ? '#fff' : col; ctx.fillRect(bx, y + 8, bw * f, 6);
    return w;
  }
  // co-op partner panel
  function p2Panel(ctx, rightX, y, S, p) {
    const lab = p.ghost ? 'DOWN ' + Math.max(0, Math.ceil(p.ghostT)) + 's' : (p.power ? null : 'READY');
    if (p.power && !p.ghost) return powerChip(ctx, rightX - powerW(ctx, p, 'P2'), y, S, p, 'P2');
    const s = 'P2 ' + p.name + ' · ' + lab;
    ctx.font = ui.f(11, '800'); const w = ctx.measureText(s).width + 16;
    ui.chip(ctx, rightX - w, y, w, 22, { r: 8, border: p.ghost ? '#ff8a8a' : 'rgba(94,200,255,.6)' });
    ui.text(ctx, s, rightX - w / 2, y + 12, { size: 11, weight: '800', stroke: false, col: p.ghost ? '#ffb3b3' : '#8fd8ff' });
    return w;
  }

  function banner(ctx, S) {
    const b = S.banner; if (!b) return;
    const VW = LA.view.VW, total = b.boss ? 2.2 : 2.4, el = total - b.t;
    const a = Math.min(1, el / 0.25, b.t / 0.35);
    const slide = (1 - ui.ease(el / 0.3)) * -VW * 0.6;
    const y = b.boss ? 196 : 150;
    const w = Math.min(VW - 24, 460), h = b.boss ? 78 : 74, x = VW / 2 - w / 2 + slide;
    ctx.save(); ctx.globalAlpha = Math.max(0, a);
    ui.rr(ctx, x, y - h / 2, w, h, 14);
    ctx.fillStyle = b.boss ? 'rgba(40,6,12,.86)' : 'rgba(10,12,20,.8)'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = b.boss ? '#ff5d5d' : (S.level.world.col || '#fff'); ctx.stroke();
    if (b.boss) {
      ui.text(ctx, 'BOSS', x + w / 2, y - h / 2 + 14, { size: 11, weight: '800', mono: true, col: '#ff8a8a', stroke: false });
      ui.text(ctx, b.a, x + w / 2, y + 2, { size: 28, weight: '900', col: '#fff', stroke: '#3a0008', sw: 4, maxW: w - 30 });
      ui.text(ctx, b.b || '', x + w / 2, y + 26, { size: 12, weight: 'bold', mono: true, col: ui.C.dim, stroke: false, maxW: w - 30 });
    } else {
      if (b.c) ui.text(ctx, (S.mode === 'fullrun' ? '' : 'LEVEL ') + b.c, x + w / 2, y - h / 2 + 14, { size: 11, weight: '800', mono: true, col: S.level.world.col, stroke: false });
      ui.text(ctx, b.a, x + w / 2, y + 2, { size: 28, weight: '900', col: '#fff', stroke: 'rgba(0,0,0,.8)', sw: 4, maxW: w - 30 });
      ui.text(ctx, b.b || '', x + w / 2, y + 25, { size: 12, weight: 'bold', mono: true, col: ui.C.dim, stroke: false, maxW: w - 30 });
    }
    ctx.restore();
  }

  function callouts(ctx, S) {
    const VW = LA.view.VW;
    if (S.state === 'clear') {
      const t = S.stateT, sc = 0.6 + ui.back(t / 0.45) * 0.4;
      const txt = S.mode === 'fullrun' ? 'THE CITY IS CLEAR!' : (S.clearHow === 'boss' ? 'BOSS DOWN!' : 'DISTRICT CLEARED!');
      ctx.save(); ctx.translate(VW / 2, 230); ctx.scale(sc, sc); ctx.rotate(-0.04);
      ui.text(ctx, txt, 0, 0, { size: 44, weight: '900', col: ui.C.yellow, shadow: '#7a3b00', sd: 4, stroke: '#2a1300', sw: 6, maxW: VW - 30 });
      ctx.restore();
      if (t > 0.6) ui.text(ctx, S.level.name + ' · ' + ui.timeShort(S.stats.time || S.t), VW / 2, 282, { size: 15, weight: 'bold', mono: true, col: '#fff', maxW: VW - 30 });
    } else if (S.state === 'dead') {
      const t = S.stateT;
      ui.scrim(ctx, Math.min(0.35, t * 0.5));
      ctx.save(); ctx.translate(VW / 2, 250); const sc = 0.7 + ui.back(t / 0.35) * 0.3; ctx.scale(sc, sc);
      ui.text(ctx, S.run.lives > 0 ? 'OUCH!' : 'OH NO…', 0, 0, { size: 46, weight: '900', col: ui.C.mag, shadow: '#6a1440', sd: 4, stroke: '#2a0616', sw: 6 });
      ctx.restore();
      if (S.run.lives > 0 && t > 0.3) {
        if (!icon(ctx, 'HudHeart', VW / 2 - 45, 282, 22, 22)) ui.heart(ctx, VW / 2 - 34, 282, 22, '#ff5d5d');
        ui.text(ctx, '× ' + S.run.lives, VW / 2 + 10, 294, { size: 24, weight: '900', mono: true, col: '#fff' });
      }
    }
  }

  hud.draw = function (ctx, S) {
    if (!S || !S.run) return;
    const VW = LA.view.VW;
    const boss = !!(S.boss || (S.arena && S.arena.sealed));
    // boss fights: the HP bar box owns y 42..88 across the centre (bosses agent). Row 1 sits above it;
    // on narrow screens row 2 (powers, P2) drops below it and the clock moves up into row 1.
    const y0 = PAD, narrowBoss = boss && VW < 900;
    let x = PAD;
    x += livesChip(ctx, x, y0, S) + GAP;
    x += crysChip(ctx, x, y0, S) + GAP;
    x += scoreChip(ctx, x, y0, S) + GAP;
    const leftEnd = x;
    const rightX = VW - PAD;
    // level chip: hidden in boss fights (the banner/HP bar names the boss); needs room on narrow screens
    let ry = y0;
    if (!boss) {
      const room = rightX - leftEnd;
      if (room >= 120) levelChip(ctx, rightX, y0, S, Math.min(room, 260));
      else levelChip(ctx, rightX, y0 + H + 4, S, Math.min(VW - 16, 260));
      ry = y0 + (room >= 120 ? H + 4 : (H + 4) * 2);
    }
    clockChip(ctx, rightX, ry, S);
    // row 2: P1 power, P2 panel
    const players = S.players || [];
    const co = players.length > 1;
    let py = narrowBoss ? 94 : y0 + H + 5;
    const p1 = players[0];
    if (p1 && p1.power && !p1.ghost) powerChip(ctx, PAD, py, S, p1, co ? 'P1' : null);
    else if (p1 && p1.ghost && co) { ui.chip(ctx, PAD, py, 128, 22, { r: 8, border: '#ff8a8a' }); ui.text(ctx, 'P1 DOWN ' + Math.max(0, Math.ceil(p1.ghostT)) + 's', PAD + 64, py + 12, { size: 11, weight: '800', stroke: false, col: '#ffb3b3' }); }
    if (co && players[1]) p2Panel(ctx, rightX, narrowBoss ? 94 : ry + 24, S, players[1]);
    // drop-in hint (cabinet/keyboard only) for the first seconds of a level
    if (!co && S.state === 'play' && S.t < 7 && !LA.scenes.stack.length && !(LA.input.touch && LA.input.touch.active) && Math.floor(S.t * 2) % 2 === 0) {
      ui.text(ctx, '2P: PRESS START TO JOIN', VW - PAD, LA.view.VH - 14, { size: 11, weight: 'bold', mono: true, align: 'right', col: '#8fd8ff', stroke: 'rgba(0,0,0,.7)' });
    }
    if (!LA.scenes.stack.length) { banner(ctx, S); callouts(ctx, S); }     // overlays (results/pause) own the centre
  };

  // ---------------- level card while the level's art streams in ----------------
  const TIPS = [
    'Stomp from above. Side contact hurts. Just like city hall.',
    'Crystals are coins. 100 of them buy you another life. Rent not included.',
    'Power crystals soak one hit. Unlike your insurance.',
    'Save the citizens. Nobody else is coming.',
    'Double jump: tap JUMP again in the air.',
    'Hold SPRINT to run. The permit office will not be informed.',
    'Potholes are real pits. Report them. Watch nothing happen.',
    'Player 2 can drop in any time: press START.',
    'A partner who goes down becomes a ghost. Touch them to revive.',
    'Traffic cones make you slip. Caltrans sends its regards.',
  ];
  hud.drawLoading = function (ctx, S) {
    const VW = LA.view.VW, VH = LA.view.VH, lv = S.level, full = S.mode === 'fullrun';
    const col = lv.world.col, t = LA.now() / 1000;
    ctx.fillStyle = '#0b0d14'; ctx.fillRect(0, 0, VW, VH);
    // world-colour diagonal stripes (cheap: a few quads)
    ctx.save(); ctx.globalAlpha = 0.08; ctx.fillStyle = col;
    const off = (t * 40) % 80;
    for (let x = -VH - 80 + off; x < VW + 80; x += 80) { ctx.beginPath(); ctx.moveTo(x, VH); ctx.lineTo(x + 40, VH); ctx.lineTo(x + 40 + VH, 0); ctx.lineTo(x + VH, 0); ctx.fill(); }
    ctx.restore();
    const cy = VH / 2 - 40;
    ui.text(ctx, full ? 'FULL CITY RUN · ' + S.tier.label : 'WORLD ' + lv.w + ' · ' + lv.world.name, VW / 2, cy - 84, { size: 14, weight: '800', mono: true, col, stroke: false, maxW: VW - 30 });
    if (!full) {
      ui.rr(ctx, VW / 2 - 34, cy - 64, 68, 24, 8); ctx.fillStyle = col; ctx.fill();
      ui.text(ctx, lv.id, VW / 2, cy - 51, { size: 15, weight: '900', mono: true, col: '#0b0d14', stroke: false });
    }
    ui.text(ctx, full ? 'THE WHOLE CITY' : lv.name, VW / 2, cy - 8, { size: 44, weight: '900', col: '#fff', shadow: 'rgba(0,0,0,.6)', sd: 4, stroke: 'rgba(0,0,0,.85)', sw: 5, maxW: VW - 30 });
    ui.text(ctx, full ? 'Marina del Rey → Alcatraz · no stops' : (lv.sub || ''), VW / 2, cy + 30, { size: 15, weight: '600', col: '#c9cede', stroke: false, maxW: VW - 30 });
    if (lv.boss && !full) ui.text(ctx, 'BOSS: ' + lv.boss, VW / 2, cy + 56, { size: 12, weight: '800', mono: true, col: '#ff8a8a', stroke: false, maxW: VW - 30 });
    // Golden Boy jogging on the progress bar
    const w = Math.min(360, VW - 80), bx = VW / 2 - w / 2, by = cy + 124, p = LA.clamp(S.loadP || 0, 0, 1);
    ui.rr(ctx, bx, by, w, 10, 5); ctx.fillStyle = '#262a38'; ctx.fill();
    if (p > 0) { ui.rr(ctx, bx, by, Math.max(10, w * p), 10, 5); ctx.fillStyle = col; ctx.fill(); }
    const run = Math.floor(t * 8) % 2 ? 'goldenRun1' : 'goldenRun2';
    ui.hero(ctx, run, bx + w * p, by - 2, 44, 1);
    ui.text(ctx, S.tier.label + ' · ' + S.tier.blurb.toUpperCase() + (S.run.players > 1 ? ' · 2 PLAYERS' : ''), VW / 2, by + 34, { size: 11, weight: 'bold', mono: true, col: ui.C.dim, stroke: false, maxW: VW - 30 });
    const tip = TIPS[LA.hash(lv.id + S.tier.id) % TIPS.length];
    const lines = ui.wrap(ctx, tip, Math.min(420, VW - 40), ui.f(13, '600'));
    lines.forEach((ln, i) => ui.text(ctx, ln, VW / 2, VH - 70 + i * 18, { size: 13, weight: '600', col: '#8f96ad', stroke: false }));
  };
})();
