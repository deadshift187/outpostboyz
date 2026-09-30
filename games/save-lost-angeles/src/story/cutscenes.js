// STORY — scene 'cutscene' { id, w?, then(), attract? }. Comic panels drawn in-engine with Saint's art
// (golden, fire, burned Palisades houses, the news chopper, Newscum) plus code-drawn figures in his
// bold-outline style. ids: 'cold' (the cold open), 'world' (world intro card, w=1..5), 'worldclear'
// (w), 'ending'. Any button skips. Satire punches up: the governor, the budget, the TV choppers.
(function () {
  'use strict';
  const LA = window.LA, ui = LA.ui;
  const SKINS = ['#5c3a1e', '#8d5524', '#c68642', '#e0ac69', '#f1c27d', '#ffdbac'];
  const BURNED = ['bBurnedCraftsmanHouseBroken', 'bBurnedModernTwoStoryHouse', 'bBurnedOutVillaCollapsedTil', 'bBurnedTudorHouseNoSign', 'bBurnedSpanishVillaNoSign', 'bBurnedConcreteHouseWithBal'];
  const ART = ['golden', 'goldenJump', 'fire', 'palmBurn', 'palm', 'heli', 'newscum', 'folkVenGirl', 'folkVenGirl2', 'pressCam', 'pressAnchor'].concat(BURNED);

  // ---------------- drawing helpers ----------------
  function sky(ctx, stops) {
    const g = ctx.createLinearGradient(0, 0, 0, LA.view.VH);
    stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
    ctx.fillStyle = g; ctx.fillRect(0, 0, LA.view.VW, LA.view.VH);
  }
  function hills(ctx, base, amp, freq, ph, col, stroke) {
    const VW = LA.view.VW, VH = LA.view.VH;
    ctx.beginPath(); ctx.moveTo(0, VH);
    for (let x = 0; x <= VW + 20; x += 20) ctx.lineTo(x, base - Math.sin(x * freq + ph) * amp - Math.sin(x * freq * 2.3 + ph * 1.7) * amp * 0.35);
    ctx.lineTo(VW, VH); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    if (stroke) { ctx.lineWidth = 3; ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  const hillY = (x, base, amp, freq, ph) => base - Math.sin(x * freq + ph) * amp - Math.sin(x * freq * 2.3 + ph * 1.7) * amp * 0.35;
  function glow(ctx, x, y, r, col, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = a == null ? 1 : a; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1;
  }
  function fire(ctx, x, footY, h, t, i) {
    const im = LA.img('fire'), f = 1 + Math.sin(t * 11 + i * 1.7) * 0.1 + Math.sin(t * 17 + i) * 0.05;
    if (im) { const w = h * im.naturalWidth / im.naturalHeight; ctx.drawImage(im, x - w / 2, footY - h * f, w, h * f); return; }
    ctx.fillStyle = '#ff5a1f'; ctx.beginPath(); ctx.moveTo(x - h * 0.4, footY); ctx.quadraticCurveTo(x, footY - h * 1.3 * f, x + h * 0.4, footY); ctx.fill();
    ctx.fillStyle = '#ffc23a'; ctx.beginPath(); ctx.moveTo(x - h * 0.2, footY); ctx.quadraticCurveTo(x, footY - h * 0.7 * f, x + h * 0.2, footY); ctx.fill();
  }
  function sprite(ctx, key, x, footY, h, flip, alpha) {
    const im = LA.img(key); if (!im) return false;
    const w = h * im.naturalWidth / im.naturalHeight;
    ctx.save(); if (alpha != null) ctx.globalAlpha = alpha;
    if (flip) { ctx.translate(x, footY); ctx.scale(-1, 1); ctx.drawImage(im, -w / 2, -h, w, h); } else ctx.drawImage(im, x - w / 2, footY - h, w, h);
    ctx.restore(); return true;
  }
  // chunky cartoon firefighter (s=1 ≈ 118px tall). o: {skin, pony, helmet, hand:[x,y] local, flip, cheer}
  function firefighter(ctx, x, footY, s, o) {
    ctx.save(); ctx.translate(x, footY); ctx.scale(s * (o.flip ? -1 : 1), s);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const ink = '#1d1408';
    ctx.fillStyle = '#3b3326'; ctx.strokeStyle = ink; ctx.lineWidth = 3;
    ctx.fillRect(-14, -42, 11, 36); ctx.strokeRect(-14, -42, 11, 36); ctx.fillRect(3, -42, 11, 36); ctx.strokeRect(3, -42, 11, 36);
    ctx.fillStyle = '#16120c'; ctx.fillRect(-17, -9, 16, 9); ctx.fillRect(1, -9, 17, 9);
    // arms behind/in front
    const hand = o.cheer ? [[-26, -118], [26, -118]] : [o.hand || [28, -70], o.hand2 || o.hand || [28, -70]];
    const arm = (sx, sy, hx, hy) => { ctx.strokeStyle = ink; ctx.lineWidth = 13; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hx, hy); ctx.stroke(); ctx.strokeStyle = '#c7a23a'; ctx.lineWidth = 8; ctx.stroke(); ctx.fillStyle = '#2b2b2b'; ctx.beginPath(); ctx.arc(hx, hy, 6, 0, 7); ctx.fill(); };
    arm(-12, -82, hand[0][0], hand[0][1]);
    // coat
    ui.rr(ctx, -21, -90, 42, 54, 9); ctx.fillStyle = '#c7a23a'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = ink; ctx.stroke();
    ctx.fillStyle = '#e6eef0'; ctx.fillRect(-21, -52, 42, 5); ctx.fillRect(-21, -74, 42, 4);
    ctx.fillStyle = '#ff9f2e'; ctx.fillRect(-21, -47, 42, 2);
    arm(12, -82, hand[1][0], hand[1][1]);
    // head
    if (o.pony) { ctx.fillStyle = o.hair || '#2a1a10'; ctx.beginPath(); ctx.ellipse(-14, -96, 6, 12, 0.5, 0, 7); ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.fillStyle = o.skin; ctx.beginPath(); ctx.arc(0, -102, 13, 0, 7); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = ink; ctx.stroke();
    ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(5, -103, 1.8, 0, 7); ctx.arc(10, -103, 1.8, 0, 7); ctx.fill();
    ctx.lineWidth = 2; ctx.beginPath(); if (o.cheer) ctx.arc(7, -97, 4, 0, Math.PI); else { ctx.moveTo(4, -95); ctx.lineTo(10, -96); } ctx.stroke();
    // helmet
    ctx.fillStyle = o.helmet || '#d42a1f'; ctx.beginPath(); ctx.arc(0, -107, 15, Math.PI, 0); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = ink; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(2, -107, 21, 4, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffe36a'; ctx.fillRect(-4, -120, 8, 9); ctx.strokeRect(-4, -120, 8, 9);
    ctx.restore();
  }
  // fire hydrant (s=1 ≈ 84px tall)
  function hydrant(ctx, x, footY, s, o) {
    o = o || {};
    ctx.save(); ctx.translate(x, footY); ctx.scale(s, s);
    const ink = '#2a0706'; ctx.lineWidth = 3; ctx.strokeStyle = ink; ctx.lineJoin = 'round';
    ctx.fillStyle = '#8c1d19'; ctx.fillRect(-24, -9, 48, 9); ctx.strokeRect(-24, -9, 48, 9);
    ui.rr(ctx, -17, -62, 34, 54, 6); ctx.fillStyle = '#d9312b'; ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(-11, -58, 5, 46);
    ctx.fillStyle = '#d9312b'; ctx.beginPath(); ctx.arc(0, -62, 17, Math.PI, 0); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#b8261f'; ctx.fillRect(-6, -86, 12, 9); ctx.strokeRect(-6, -86, 12, 9);
    ctx.fillStyle = '#b8261f'; ctx.fillRect(-28, -44, 11, 13); ctx.strokeRect(-28, -44, 11, 13); ctx.fillRect(17, -44, 11, 13); ctx.strokeRect(17, -44, 11, 13);
    ctx.fillStyle = '#b8261f'; ctx.beginPath(); ctx.arc(0, -34, 9, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1a0504'; ctx.beginPath(); ctx.arc(0, -34, 4.5, 0, 7); ctx.fill();
    if (o.wrench != null) {                                               // big wrench on the top nut, cranking
      ctx.save(); ctx.translate(0, -82); ctx.rotate(o.wrench);
      ctx.fillStyle = '#9aa3ad'; ctx.strokeStyle = '#2b2f36'; ctx.lineWidth = 3; ui.rr(ctx, -4, -5, 48, 10, 4); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  function heli(ctx, x, y, h, dir, tag, t) {
    const im = LA.img('heli');
    if (im) { const w = h * im.naturalWidth / im.naturalHeight; ctx.save(); ctx.translate(x, y); if (dir < 0) ctx.scale(-1, 1); ctx.drawImage(im, -w / 2, -h / 2, w, h); ctx.restore(); }
    else {
      ctx.save(); ctx.translate(x, y); ctx.scale(dir < 0 ? -1 : 1, 1);
      ctx.fillStyle = '#e8e8ea'; ctx.strokeStyle = '#1b1b1f'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(0, 0, h * 0.45, h * 0.26, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillRect(-h * 0.95, -4, h * 0.55, 7); ctx.strokeRect(-h * 0.95, -4, h * 0.55, 7);
      ctx.fillStyle = '#6ec6ff'; ctx.beginPath(); ctx.ellipse(h * 0.2, -3, h * 0.18, h * 0.13, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = '#1b1b1f'; ctx.lineWidth = 3; const r = Math.cos(t * 40) * h * 0.8; ctx.beginPath(); ctx.moveTo(-r, -h * 0.34); ctx.lineTo(r, -h * 0.34); ctx.stroke();
      ctx.restore();
    }
    if (tag) {
      ctx.font = ui.f(11, '900', true); const tw = ctx.measureText(tag).width + 10;
      ui.rr(ctx, x - tw / 2, y + h * 0.42, tw, 16, 4); ctx.fillStyle = tag === 'TWZ' ? '#ff4d9d' : '#1b3f8f'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#111'; ctx.stroke();
      ui.text(ctx, tag, x, y + h * 0.42 + 8.5, { size: 11, weight: '900', mono: true, col: '#fff', stroke: false });
    }
  }
  // code-drawn citizen, diverse by index. arms up when cheering
  function person(ctx, x, footY, s, i, t, cheer) {
    const skin = SKINS[(i * 5 + 2) % SKINS.length], shirt = ['#ff6fae', '#4dc8ff', '#57e08a', '#ffc23a', '#b07cff', '#ff5a1f'][i % 6];
    const hair = ['#1a1008', '#3b2412', '#6b3e1e', '#d9b24a', '#111', '#8a8a8a'][(i * 3) % 6];
    const bob = cheer ? Math.abs(Math.sin(t * 7 + i)) * 8 : 0;
    ctx.save(); ctx.translate(x, footY - bob); ctx.scale(s, s); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const ink = '#15100a';
    ctx.strokeStyle = ink; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(-5, -30); ctx.lineTo(-7, 0); ctx.moveTo(5, -30); ctx.lineTo(7, 0); ctx.stroke();
    ctx.strokeStyle = '#2d3a5a'; ctx.lineWidth = 4; ctx.stroke();
    const ay = cheer ? -78 + Math.sin(t * 9 + i) * 4 : -40;
    ctx.strokeStyle = ink; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(-9, -56); ctx.lineTo(-17, ay); ctx.moveTo(9, -56); ctx.lineTo(17, ay); ctx.stroke();
    ctx.strokeStyle = skin; ctx.lineWidth = 4; ctx.stroke();
    ui.rr(ctx, -12, -62, 24, 34, 6); ctx.fillStyle = shirt; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = ink; ctx.stroke();
    if (i % 2) { ctx.fillStyle = hair; ctx.beginPath(); ctx.ellipse(0, -72, 12, 13, 0, 0, 7); ctx.fill(); ctx.fillRect(-12, -74, 24, 16); }
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(0, -74, 10, 0, 7); ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = ink; ctx.stroke();
    ctx.fillStyle = hair; ctx.beginPath(); ctx.arc(0, -77, 10.5, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
    ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(-3.5, -74, 1.4, 0, 7); ctx.arc(3.5, -74, 1.4, 0, 7); ctx.fill();
    ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(0, -71, 3.5, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.restore();
  }
  // narration box, comic style
  function caption(ctx, text, o) {
    o = o || {};
    const VW = LA.view.VW, VH = LA.view.VH, size = o.size || (VW < 600 ? 16 : 19);
    const font = ui.f(size, '900'), maxW = Math.min(o.maxW || 560, VW - 48);
    const lines = ui.wrap(ctx, text, maxW - 24, font), lh = size * 1.22;
    ctx.font = font; let w = 0; for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
    w += 26; const h = lines.length * lh + 18;
    const x = o.center ? VW / 2 - w / 2 : 22, y = o.at === 'bottom' ? VH - h - 26 : 24;
    const a = o.a == null ? 1 : o.a;
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(x + 5, y + 5, w, h);
    ctx.fillStyle = o.bg || '#ffe36a'; ctx.fillRect(x, y, w, h); ctx.lineWidth = 3; ctx.strokeStyle = '#111'; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = o.col || '#111'; ctx.textAlign = o.center ? 'center' : 'left'; ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, o.center ? VW / 2 : x + 13, y + 9 + lh / 2 + i * lh));
    ctx.restore();
  }
  function pop(ctx, text, x, y, size, col, rot, t) {                      // comic SFX lettering
    const sc = 0.6 + ui.back(t / 0.2) * 0.4;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0); ctx.scale(sc, sc);
    ui.text(ctx, text, 0, 0, { size, weight: '900', col, stroke: '#111', sw: Math.max(4, size * 0.12), shadow: 'rgba(0,0,0,.5)', sd: 3 });
    ctx.restore();
  }
  function bubble(ctx, text, x, y, maxW, tx, ty) {
    const font = ui.f(13, '800'), lines = ui.wrap(ctx, text, maxW - 20, font), lh = 16;
    ctx.font = font; let w = 0; for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
    w += 22; const h = lines.length * lh + 14, bx = LA.clamp(x - w / 2, 8, LA.view.VW - w - 8);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#111'; ctx.lineWidth = 2.5;
    ui.rr(ctx, bx, y, w, h, 12); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(LA.clamp(tx, bx + 14, bx + w - 14) - 7, y + h - 1); ctx.lineTo(tx, ty); ctx.lineTo(LA.clamp(tx, bx + 14, bx + w - 14) + 7, y + h - 1); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillRect(LA.clamp(tx, bx + 14, bx + w - 14) - 5, y + h - 4, 10, 5);
    ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, bx + w / 2, y + 7 + lh / 2 + i * lh));
  }
  function frame(ctx) {                                                   // comic panel border
    const VW = LA.view.VW, VH = LA.view.VH;
    ctx.lineWidth = 16; ctx.strokeStyle = '#0b0b0e'; ctx.strokeRect(0, 0, VW, VH);
    ctx.lineWidth = 3; ctx.strokeStyle = '#fff8e7'; ctx.strokeRect(9.5, 9.5, VW - 19, VH - 19);
  }
  // deterministic embers
  function embers(ctx, t, n, col) {
    const VW = LA.view.VW, VH = LA.view.VH;
    ctx.fillStyle = col || '#ffb454';
    for (let i = 0; i < n; i++) {
      const sp = 20 + (i * 37) % 40, x = ((i * 97.3) % VW + Math.sin(t * 1.3 + i) * 20 + t * 8) % VW, y = VH - ((t * sp + i * 71) % (VH + 40));
      ctx.globalAlpha = 0.5 + ((i * 13) % 5) / 10; ctx.fillRect(x, y, 3, 3);
    }
    ctx.globalAlpha = 1;
  }

  // ---------------- the cold open ----------------
  const NIGHT = ['#150b1f', '#3a1426', '#8a2a1f', '#ff7a2a'];
  function burningHills(ctx, t, base, pan) {
    const VW = LA.view.VW;
    hills(ctx, base - 40, 26, 0.006, 1.2 + pan * 0.002, '#24101a', 'rgba(255,120,40,.45)');
    // burned houses dotting the far ridge, fires between
    BURNED.forEach((k, i) => {
      const x = ((i + 0.5) / BURNED.length) * VW + Math.sin(i * 2.1) * 30 - pan * 0.3;
      const fy = hillY(x, base - 40, 26, 0.006, 1.2 + pan * 0.002) + 8;
      glow(ctx, x, fy - 30, 110, 'rgba(255,110,30,.55)', 0.8 + Math.sin(t * 3 + i) * 0.2);
      sprite(ctx, k, x, fy, 70 + (i % 3) * 14, false, 0.95);
      fire(ctx, x + 34, fy + 2, 40 + (i % 2) * 16, t, i);
      fire(ctx, x - 30, fy + 4, 30, t, i + 7);
    });
    ctx.fillStyle = 'rgba(80,10,10,.28)'; ctx.fillRect(0, 0, VW, LA.view.VH);  // smoke haze
  }
  function smoke(ctx, t) {
    const VW = LA.view.VW;
    for (let i = 0; i < 7; i++) {
      const x = ((i * 173 + t * (10 + i * 3)) % (VW + 300)) - 150, y = 120 + (i % 3) * 50 - t * 4;
      ctx.globalAlpha = 0.18; ctx.fillStyle = '#2a2230'; ctx.beginPath(); ctx.arc(x, y, 70 + (i % 3) * 20, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  const COLD = [
    { dur: 4.4, cap: 'PACIFIC PALISADES. THE HILLS ARE ON FIRE.', draw(ctx, t) {
      const VW = LA.view.VW, VH = LA.view.VH, pan = t * 10;
      sky(ctx, NIGHT); smoke(ctx, t);
      burningHills(ctx, t, 330, pan);
      hills(ctx, 470, 40, 0.004, 3.4, '#120a10');                         // the near ridge
      const gx = Math.min(VW * 0.26, 170), gy = hillY(gx, 470, 40, 0.004, 3.4) + 4;
      glow(ctx, gx + 30, gy - 70, 120, 'rgba(255,140,40,.35)', 1);
      ui.hero(ctx, 'golden', gx, gy, 150, 1);
      embers(ctx, t, 30);
    } },
    { dur: 4.2, cap: 'THE FIREFIGHTERS SHOWED UP. THEY ALWAYS DO.', draw(ctx, t) {
      const VW = LA.view.VW, VH = LA.view.VH;
      sky(ctx, NIGHT); burningHills(ctx, t, 300, 0);
      ctx.fillStyle = '#2b2a30'; ctx.fillRect(0, 440, VW, VH - 440); ctx.fillStyle = '#44434b'; ctx.fillRect(0, 440, VW, 8);
      const s = Math.min(1.25, VW / 560), hx = VW * 0.56, fy = 520;
      // the wrench points back at the cranker; his hands ride its handle as it swings
      const ang = t * 5, wa = Math.PI + Math.sin(ang) * 0.35, hs = s * 1.1;
      hydrant(ctx, hx, fy, hs, { wrench: wa });
      const ffx = hx - 105 * s, ex = hx + Math.cos(wa) * 40 * hs, ey = fy - 82 * hs + Math.sin(wa) * 40 * hs;
      firefighter(ctx, ffx, fy, s, { skin: SKINS[1], hand: [(ex - ffx) / s, (ey - fy) / s], hand2: [(ex - ffx) / s + 8, (ey - fy) / s + 4] });
      firefighter(ctx, hx + 110 * s, fy, s * 0.95, { skin: SKINS[4], pony: true, hair: '#6b3e1e', helmet: '#ffc23a', flip: true, hand: [58, -80 + Math.sin(ang) * 6] });
      firefighter(ctx, hx - 190 * s, fy + 6, s * 0.92, { skin: SKINS[0], helmet: '#d42a1f', hand: [40, -64], hand2: [34, -58] });
      if (t > 0.8) pop(ctx, 'CRANK!', hx - 20, 300, 34, '#ffe36a', -0.12, t - 0.8);
      if (t > 1.9) pop(ctx, 'CRANK!', hx + 80, 250, 40, '#ffb454', 0.1, t - 1.9);
      if (t > 3.0) pop(ctx, 'CRANK!!', hx - 60, 220, 46, '#ff5a1f', -0.06, t - 3.0);
    } },
    { dur: 3.8, cap: 'NOTHING CAME OUT.', draw(ctx, t) {
      const VW = LA.view.VW, VH = LA.view.VH;
      sky(ctx, ['#2a0d12', '#5a1a1a', '#8a2a1f']); glow(ctx, VW / 2, VH / 2, VW * 0.7, 'rgba(255,120,40,.35)', 1);
      const s = Math.min(5.6, VW / 80, VH / 100), cx = VW / 2, fy = VH * 0.56 + 34 * s;
      hydrant(ctx, cx, fy, s);
      const noz = { x: cx, y: fy - 34 * s }, k = s / 5;
      // a single, pathetic drip
      const dt = (t % 1.6) / 1.6, dy = dt < 0.5 ? 0 : (dt - 0.5) * 2 * 140;
      ctx.fillStyle = '#6ec6ff'; ctx.strokeStyle = '#123'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(noz.x, noz.y + 4.5 * s + 6 * k + dy, 6 * k + 2, 0, 7); ctx.fill(); ctx.stroke();
      if (t > 1.2) ui.text(ctx, '…drip.', noz.x + 60 * k + 40, noz.y + 70 * k, { size: 24, weight: '800', col: '#bfe9ff', stroke: '#111', sw: 4 });
      // a moth flies out of the empty main
      if (t > 1.8) {
        const u = t - 1.8, mx = noz.x + u * 110 + Math.sin(u * 6) * 20, my = noz.y - u * 70 + Math.cos(u * 8) * 12, fl = Math.abs(Math.sin(u * 30));
        ctx.save(); ctx.translate(mx, my); ctx.scale(2.4 * k + 0.6, 2.4 * k + 0.6);
        ctx.fillStyle = '#b9ad98'; ctx.strokeStyle = '#3a3226'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(-7, 0, 8, 5 * fl + 1, -0.4, 0, 7); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(7, 0, 8, 5 * fl + 1, 0.4, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#5a4e3c'; ctx.fillRect(-1.5, -5, 3, 10);
        ctx.restore();
      }
    } },
    { dur: 4.6, cap: 'THE RESERVOIR WAS EMPTY. THE BUDGET HAD BEEN “REALLOCATED.”', draw(ctx, t) {
      const VW = LA.view.VW, VH = LA.view.VH;
      ctx.fillStyle = '#b8261f'; ctx.fillRect(0, 0, VW, VH);                // hydrant paint, close up
      ctx.fillStyle = 'rgba(0,0,0,.18)'; for (let x = 0; x < VW; x += 46) ctx.fillRect(x, 0, 6, VH);
      const w = Math.min(380, VW - 50), h = 300, x = VW / 2 - w / 2, y = 150;
      ctx.save(); ctx.translate(VW / 2, y + h / 2); ctx.rotate(-0.035); ctx.translate(-VW / 2, -(y + h / 2));
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x + 6, y + 8, w, h);
      ctx.fillStyle = '#f7f1df'; ctx.fillRect(x, y, w, h); ctx.lineWidth = 2; ctx.strokeStyle = '#6b5a3a'; ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = 'rgba(255,255,220,.75)'; ctx.fillRect(x + w / 2 - 34, y - 10, 68, 20);  // tape
      const fs = w < 340 ? 11 : 12, L = [
        ['OFFICE OF THE GOVERNOR', '900', '#1a1a1a'], ['RE: PALISADES RESERVOIR', '800', '#1a1a1a'], ['STATUS: EMPTY (maintenance*)', '800', '#b8261f'], ['', '', ''],
        ['Water funds have been reallocated to:', '600', '#222'], ['• a task force to study water', '600', '#222'], ['• a consultant to rename "drought"', '600', '#222'],
        ['• one very important wine-country dinner', '600', '#222'], ['', '', ''], ['*maintenance date: TBD', '600', '#555'], ['— Gov. Newscum', '800', '#222']];
      L.forEach((l, i) => { if (!l[0]) return; ui.text(ctx, l[0], x + 16, y + 24 + i * 24, { size: fs, weight: l[1], col: l[2], stroke: false, align: 'left', mono: true, maxW: w - 30 }); });
      if (t > 1.3) {                                                         // the stamp slams down
        const u = t - 1.3, sc = 1 + Math.max(0, 1 - u / 0.14) * 1.4;
        ctx.save(); ctx.translate(x + w * 0.62, y + h * 0.84); ctx.rotate(-0.2); ctx.scale(sc, sc); ctx.globalAlpha = Math.min(1, u / 0.1) * 0.9;
        ctx.lineWidth = 4; ctx.strokeStyle = '#d0201a'; ctx.strokeRect(-110, -24, 220, 48);
        ui.text(ctx, 'REALLOCATED', 0, 1, { size: 30, weight: '900', col: '#d0201a', stroke: false, maxW: 200 });
        ctx.restore();
      }
      ctx.restore();
    }, capAt: 'top' },
    { dur: 4.6, cap: 'THE NEWS CHOPPERS CIRCLED — TO FILM IT, NOT FIGHT IT.', draw(ctx, t) {
      const VW = LA.view.VW, VH = LA.view.VH;
      sky(ctx, NIGHT); burningHills(ctx, t, 460, t * 6);
      const tags = ['TWZ', 'NEWS 9', 'LIVE CAM'], cx = VW / 2, R = Math.min(VW * 0.36, 300);
      const pos = tags.map((tag, k) => { const a = t * 0.7 + k * 2.1; return { x: cx + Math.cos(a) * R, y: 190 + Math.sin(a) * 50, dir: -Math.sin(a) >= 0 ? 1 : -1, tag, k }; });
      pos.sort((a, b) => a.y - b.y).forEach((p) => {
        heli(ctx, p.x, p.y, 58 + (p.y - 140) * 0.2, p.dir, p.tag, t);
        if (Math.floor(t * 3 + p.k * 1.3) % 4 === 0) { ctx.fillStyle = 'rgba(255,255,255,.9)'; ui.star(ctx, p.x + p.dir * 30, p.y + 18, 9, '#fff', 'rgba(255,255,255,.3)'); }
      });
      if (t > 1.4) { const p = pos.find((q) => q.tag === 'TWZ'); bubble(ctx, 'CAN WE GET IT BIGGER? FOR THE SHOT.', p.x, Math.max(96, p.y - 96), 210, p.x, p.y - 26); }
    } },
    { dur: 4.0, cap: 'THAT’S WHEN HE STOPPED WAITING.', capAt: 'bottom', big: true, draw(ctx, t) {
      const VW = LA.view.VW, VH = LA.view.VH;
      sky(ctx, ['#0a0608', '#2a0f12', '#5a1c14']);
      const fl = 0.75 + Math.sin(t * 9) * 0.12 + Math.sin(t * 23) * 0.06;
      glow(ctx, VW * 0.78, VH * 0.45, VW * 0.8, 'rgba(255,120,30,.6)', fl);
      const zoom = 1 + t * 0.03, h = Math.min(VH * 0.78, 470) * zoom;
      ui.hero(ctx, 'golden', VW * 0.42, VH - 40 + h * 0.08, h, 1);
      glow(ctx, VW * 0.9, VH * 0.5, VW * 0.5, 'rgba(255,90,20,.35)', fl);
      embers(ctx, t, 40, '#ffcf6a');
    } },
    { dur: 3.0, noCap: true, draw(ctx, t) {
      const VW = LA.view.VW, VH = LA.view.VH;
      ctx.fillStyle = '#07080c'; ctx.fillRect(0, 0, VW, VH);
      glow(ctx, VW / 2, VH * 0.45, VW * 0.6, 'rgba(255,90,31,.35)', 1);
      const sc = 1 + Math.max(0, 1 - t / 0.25) * 1.4, sh = t < 0.5 ? (0.5 - t) * 12 : 0;
      ctx.save(); ctx.translate(VW / 2 + (Math.random() - 0.5) * sh, VH * 0.42 + (Math.random() - 0.5) * sh); ctx.scale(sc, sc); ctx.translate(-VW / 2, -VH * 0.42);
      ui.logo(ctx, VW / 2, VH * 0.36, 100);
      ctx.restore();
      if (t > 0.7) ui.text(ctx, 'ONE CITY. ZERO ACCOUNTABILITY. ONE GOLDEN BOY.', VW / 2, VH * 0.36 + 150, { size: 14, weight: '800', mono: true, col: '#fff8e7', stroke: false, maxW: VW - 40 });
    } },
  ];

  // ---------------- world intro / world clear cards ----------------
  const WORLD_LINES = {
    1: 'Ocean views. Fire views. Insurance sold separately.',
    2: 'Where every permit is pending and every lane is the fast lane.',
    3: 'The heart of the city. Currently in a closed-door meeting.',
    4: 'Fame, fortune and a $20 smoothie. Validated parking not available.',
    5: 'Every vote counts. Some of them twice. Then north, to the man himself.',
  };
  const CLEAR_LINES = {
    1: 'The Adjuster has been adjusted. Claim: APPROVED.',
    2: 'Every permit in the Valley, finally stamped. With your foot.',
    3: 'Downtown has a pulse again. City council is still in recess.',
    4: 'That\'s a wrap on Hollywood. Smoothies are back down to $19.',
    5: 'The city is quiet. Suspiciously quiet.',
  };
  function worldCard(w, clear) {
    const W = LA.WORLDS[w - 1], lvls = LA.levels.inWorld(w);
    const camX = clear ? lvls[lvls.length - 1].x0 : lvls[0].x0;
    return [{ dur: clear ? 4.6 : 5.4, noCap: true, noFrame: true, camX, draw(ctx, t) {
      const VW = LA.view.VW, VH = LA.view.VH;
      ui.cityBG(ctx, camX + t * 40, { t });
      const g = ctx.createLinearGradient(0, 0, 0, VH); g.addColorStop(0, 'rgba(8,10,16,.88)'); g.addColorStop(0.55, 'rgba(8,10,16,.55)'); g.addColorStop(1, 'rgba(8,10,16,.25)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
      ctx.fillStyle = W.col; ctx.fillRect(0, 0, VW, 6);
      const a = Math.min(1, t / 0.3), slide = (1 - ui.ease(t / 0.4)) * 40;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(0, slide);
      if (clear) {
        ui.text(ctx, 'WORLD ' + w + ' CLEAR!', VW / 2, 120, { size: 48, weight: '900', col: ui.C.yellow, shadow: '#7a3b00', sd: 4, stroke: '#2a1300', sw: 6, maxW: VW - 30 });
        ui.text(ctx, W.name, VW / 2, 170, { size: 22, weight: '900', col: W.col, stroke: 'rgba(0,0,0,.8)', sw: 4, maxW: VW - 30 });
        const tier = LA.flow.tier, save = LA.save;
        const stars = lvls.reduce((s, l) => s + ((save.best(tier, l.id) || {}).stars || 0), 0);
        ui.text(ctx, lvls.length + '/' + lvls.length + ' LEVELS   ·   ' + stars + '/' + lvls.length * 3 + ' STARS', VW / 2, 206, { size: 13, weight: '800', mono: true, col: '#fff', stroke: 'rgba(0,0,0,.8)', maxW: VW - 30 });
        if (t > 0.6) caption(ctx, CLEAR_LINES[w], { center: true, at: 'bottom', a: Math.min(1, (t - 0.6) / 0.3) });
      } else {
        ui.text(ctx, 'WORLD ' + w, VW / 2, 104, { size: 20, weight: '900', mono: true, col: W.col, stroke: 'rgba(0,0,0,.8)', sw: 4 });
        ui.text(ctx, W.name, VW / 2, 150, { size: 46, weight: '900', col: '#fff', shadow: 'rgba(0,0,0,.6)', sd: 4, stroke: 'rgba(0,0,0,.85)', sw: 6, maxW: VW - 30 });
        ui.text(ctx, W.tag, VW / 2, 190, { size: 14, weight: '700', col: ui.C.dim, stroke: 'rgba(0,0,0,.8)', maxW: VW - 30 });
        const bosses = lvls.filter((l) => l.boss).map((l) => l.boss);
        if (bosses.length) {
          ui.text(ctx, 'WANTED FOR QUESTIONING', VW / 2, 230, { size: 11, weight: '900', mono: true, col: '#ff8a8a', stroke: 'rgba(0,0,0,.8)' });
          const lines = ui.wrap(ctx, bosses.join('  ·  '), VW - 50, ui.f(13, '800'));
          lines.forEach((ln, i) => ui.text(ctx, ln, VW / 2, 250 + i * 18, { size: 13, weight: '800', col: '#fff', stroke: 'rgba(0,0,0,.8)' }));
        }
        if (t > 0.7) caption(ctx, WORLD_LINES[w], { center: true, at: 'bottom', a: Math.min(1, (t - 0.7) / 0.3) });
      }
      ctx.restore();
    } }];
  }

  // ---------------- ending ----------------
  const ENDING = [
    { dur: 5.0, cap: 'ALCATRAZ. FOR ONCE, THE GOVERNOR IS NOT AVAILABLE FOR COMMENT.', draw(ctx, t) {
      const VW = LA.view.VW, VH = LA.view.VH;
      sky(ctx, ['#1b2440', '#3b4a6a', '#8fa3b8']);
      ctx.fillStyle = '#2d5474'; ctx.fillRect(0, 380, VW, VH - 380);
      ctx.fillStyle = 'rgba(191,233,255,.25)'; for (let i = 0; i < 12; i++) ctx.fillRect(((i * 91 + t * 12) % VW), 400 + (i % 4) * 40, 40, 2);
      ctx.fillStyle = '#6f6a60'; ctx.beginPath(); ctx.ellipse(VW / 2, 392, VW * 0.42, 40, 0, Math.PI, 0); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#2a2824'; ctx.stroke();
      ui.rr(ctx, VW / 2 - 150, 170, 300, 210, 6); ctx.fillStyle = '#c9c3b2'; ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1b1b20'; ctx.fillRect(VW / 2 - 90, 200, 180, 170);
      sprite(ctx, 'newscum', VW / 2, 372, 160, false);
      ctx.fillStyle = '#4a4a52'; for (let x = VW / 2 - 86; x <= VW / 2 + 86; x += 21) ctx.fillRect(x, 198, 6, 174);   // bars
      ctx.fillRect(VW / 2 - 92, 196, 184, 8); ctx.fillRect(VW / 2 - 92, 286, 184, 6);
      if (t > 1.0) bubble(ctx, 'I\'d like to announce a task force to investigate what I did.', VW / 2 + 60, 118, 250, VW / 2 + 20, 214);
    } },
    { dur: 5.2, cap: 'BACK IN THE PALISADES, THE HYDRANTS WORK. TURNS OUT THE BUDGET WAS THERE THE WHOLE TIME.', draw(ctx, t) {
      const VW = LA.view.VW, VH = LA.view.VH;
      sky(ctx, ['#8ed3ee', '#f3c98b', '#e8a86a']);
      hills(ctx, 360, 30, 0.005, 0.8, '#7f9950', '#3d4a24');
      ctx.fillStyle = '#5b5a62'; ctx.fillRect(0, 450, VW, VH - 450); ctx.fillStyle = '#7a7982'; ctx.fillRect(0, 450, VW, 8);
      const s = Math.min(1.1, VW / 620), hx = VW / 2, fy = 520;
      // the water finally comes
      ctx.lineCap = 'round';
      for (let k = 0; k < 3; k++) {
        const ph = t * 6 + k; ctx.strokeStyle = ['#4dc8ff', '#8fdcff', '#bfe9ff'][k]; ctx.lineWidth = 16 - k * 5;
        ctx.beginPath(); ctx.moveTo(hx, fy - 34 * s * 1.1); ctx.quadraticCurveTo(hx + 150 + Math.sin(ph) * 10, fy - 240, hx + 280 + k * 8, fy - 10); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(hx, fy - 34 * s * 1.1); ctx.quadraticCurveTo(hx - 150 - Math.sin(ph) * 10, fy - 240, hx - 280 - k * 8, fy - 10); ctx.stroke();
      }
      ctx.fillStyle = '#bfe9ff'; for (let i = 0; i < 24; i++) { const a = (i * 0.7 + t * 3) % 1; ctx.globalAlpha = 1 - a; ctx.beginPath(); ctx.arc(hx + Math.sin(i * 2.3) * 200 * a, fy - 200 * a + 300 * a * a, 3, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
      hydrant(ctx, hx, fy, s * 1.1);
      firefighter(ctx, hx - 130 * s, fy, s, { skin: SKINS[1], cheer: true });
      firefighter(ctx, hx + 130 * s, fy, s * 0.95, { skin: SKINS[4], pony: true, hair: '#6b3e1e', helmet: '#ffc23a', flip: true, cheer: true });
      for (let i = 0; i < 6; i++) { const x = i < 3 ? hx - 210 * s - i * 55 * s : hx + 210 * s + (i - 3) * 55 * s; person(ctx, x, fy + 10, s * 1.05, i, t, true); }
      if (t > 0.6) pop(ctx, 'WHOOSH!', hx, 240, 42, '#bfe9ff', -0.08, t - 0.6);
    } },
    { dur: 6.0, cap: 'THE CITY IS YOURS, GOLDEN BOY.', capAt: 'bottom', big: true, draw(ctx, t) {
      const VW = LA.view.VW, VH = LA.view.VH;
      sky(ctx, ['#3a2a5a', '#ff9a6a', '#ffd89a', '#fff0c4']);
      glow(ctx, VW * 0.7, 360, 240, 'rgba(255,240,180,.9)', 1);
      ctx.fillStyle = '#fff6d0'; ctx.beginPath(); ctx.arc(VW * 0.7, 360 - t * 6, 46, 0, 7); ctx.fill();
      hills(ctx, 380, 22, 0.006, 1.2, '#7f9950');
      // new green on the burn scar
      ctx.fillStyle = '#57e08a'; for (let i = 0; i < 40; i++) { const x = (i * 53.7) % VW, y = hillY(x, 380, 22, 0.006, 1.2) + 6 + (i % 4) * 6; const g = Math.min(1, t / 3) * (4 + (i % 3) * 2); ctx.fillRect(x, y - g, 3, g); }
      hills(ctx, 470, 40, 0.004, 3.4, '#3d4a24');
      const gx = Math.min(VW * 0.3, 190), gy = hillY(gx, 470, 40, 0.004, 3.4) + 4;
      ui.hero(ctx, 'golden', gx, gy, 150, 1);
      if (CS.p && CS.p.unlocked && CS.p.unlocked.length && t > 1.2) { const s2 = 'UNLOCKED: ' + CS.p.unlocked.join(' + '); ctx.font = ui.f(14, '900', true); const tw = Math.min(VW - 40, ctx.measureText(s2).width + 28); ui.panel(ctx, VW / 2 - tw / 2, 112, tw, 34, { r: 10, border: '#ff4d9d', fill: 'rgba(13,16,24,.85)' }); ui.text(ctx, s2, VW / 2, 129, { size: 14, weight: '900', mono: true, col: '#ffcc3a', stroke: false, maxW: tw - 20 }); }
    } },
  ];

  // ---------------- the scene ----------------
  const CS = { t: 0, pt: 0, idx: 0, panels: null, p: null, done: false, loading: false, prog: 0 };
  const LOAD_MAX = 8;   // seconds: never hold the story longer than this on a slow connection
  function finish() {
    if (CS.done) return; CS.done = true;
    const then = CS.p && CS.p.then;
    if (typeof then === 'function') then(); else LA.scenes.go(then || 'title');
  }
  LA.scenes.register('cutscene', {
    enter(p) {
      CS.p = p || {}; CS.t = 0; CS.pt = 0; CS.idx = 0; CS.done = false;
      const id = CS.p.id || 'cold';
      CS.panels = id === 'cold' ? COLD : id === 'ending' ? ENDING : id === 'world' ? worldCard(CS.p.w || 1, false) : id === 'worldclear' ? worldCard(CS.p.w || 1, true) : COLD;
      // Hold the clock until the panels' art has arrived: art draws nothing until decoded, so on a fresh
      // web visit the fire/firefighter panels used to play out empty before their images downloaded.
      const cam = CS.panels[0].camX, C = LA.city;
      const keys = ART.concat(cam != null && C && C.ready ? C.artKeysForRange(cam - 300, cam + LA.view.VW * 3) : []);
      CS.loading = true; CS.prog = 0;
      const token = CS.p;
      LA.preload(keys, (f) => { CS.prog = f; }).then(() => { if (CS.p === token) CS.loading = false; });
      ui.music(id === 'ending' ? 'credits' : id === 'cold' ? 'story' : 'map');
    },
    update(dt) {
      CS.t += dt;
      const inp = ui.read();
      if (CS.t > 0.5 && inp.any) { ui.sfx('select'); finish(); return; }
      if (CS.loading && CS.t < LOAD_MAX) return;   // panels start once their art is in
      if (CS.loading) CS.loading = false;
      CS.pt += dt;
      const P = CS.panels[CS.idx];
      if (CS.pt >= P.dur) { CS.idx++; CS.pt = 0; if (CS.idx >= CS.panels.length) { finish(); return; } ui.sfx('menu'); }
    },
    draw(ctx) {
      const VW = LA.view.VW, VH = LA.view.VH;
      if (CS.loading) {   // simple loading card while the art downloads
        ctx.fillStyle = '#0b0d14'; ctx.fillRect(0, 0, VW, VH);
        const w = Math.min(320, VW * 0.6), x = (VW - w) / 2, y = VH / 2;
        ui.text(ctx, 'LOADING LOS ANGELES…', VW / 2, y - 18, { size: 12, weight: '800', mono: true, col: '#ffcc3a', align: 'center' });
        ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x, y, w, 6);
        ctx.fillStyle = '#ffcc3a'; ctx.fillRect(x, y, w * CS.prog, 6);
        if (CS.t > 0.5) ui.text(ctx, 'ANY BUTTON TO SKIP', VW - 24, VH - 20, { size: 10, weight: '800', mono: true, col: 'rgba(255,255,255,.75)', align: 'right' });
        return;
      }
      const P = CS.panels[Math.min(CS.idx, CS.panels.length - 1)], t = CS.pt;
      ctx.save(); P.draw(ctx, t); ctx.restore();
      if (!P.noCap && P.cap) {
        const a = Math.min(1, Math.max(0, (t - 0.25) / 0.3));
        if (P.big) caption(ctx, P.cap, { at: 'bottom', center: true, size: VW < 600 ? 22 : 30, bg: '#111', col: '#ffcc3a', a, maxW: 640 });
        else caption(ctx, P.cap, { at: P.capAt || 'top', a });
      }
      if (!P.noFrame) frame(ctx);
      // panel wipe: a quick white flash on every cut
      if (t < 0.12 && CS.idx > 0) { ctx.globalAlpha = 1 - t / 0.12; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, VW, VH); ctx.globalAlpha = 1; }
      // progress pips + skip hint
      const n = CS.panels.length;
      if (n > 1) for (let i = 0; i < n; i++) { ctx.fillStyle = i === CS.idx ? '#ffcc3a' : 'rgba(255,255,255,.35)'; ctx.fillRect(VW / 2 - n * 9 + i * 18, VH - 20, 12, 4); }
      if (CS.t > 0.5) ui.text(ctx, CS.p.attract ? 'PRESS START' : 'ANY BUTTON TO SKIP', VW - 24, VH - 20, { size: 10, weight: '800', mono: true, col: 'rgba(255,255,255,.75)', stroke: 'rgba(0,0,0,.8)', align: 'right' });
      if (CS.t < 0.35) ui.fadeIn(ctx, CS.t, 0.35);
    },
  });
  LA.story = { COLD, ENDING, worldCard, WORLD_LINES, CLEAR_LINES, CS };
})();
