// src/bosses/art.js — OWNER: bosses agent.
// Boss art. Everything procedural is drawn ONCE into an offscreen canvas and cached (no per-frame pixel ops):
//  - sprite(key,h): Saint's atlas sprite pre-scaled to 2x draw height (smooth downscale, crisp at runtime);
//    'flago' also gets its baked grey backdrop keyed out once.
//  - drawn(name,pose): the 4 bosses with no atlas art (THE PRODUCER, THE GATE AGENT, GURU KALE, THE AGENT)
//    + walk-off cast (Tina the Outlet, Mr. Mason McLuvin), FBI allies, bodyguard — cartoon figurines in his
//    style: bold dark outlines, saturated fills, big heads. Cast varies ethnicity and gender.
//  - silhouette(img,col): white hit-flash / red tell-flash overlays.  icon(name): projectile + FX glyphs
//    drawn in code (no emoji fonts needed on the cabinet).  headline(): the newspaper card.
(function () {
  'use strict';
  const LA = window.LA;
  const OL = '#1b1220';
  const A = LA.bossArt = {};
  const cache = {};
  function mk(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); const x = c.getContext('2d'); return [c, x]; }
  const rr = (x, a, b, w, h, r) => { r = Math.min(r, w / 2, h / 2); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); };
  // fill + outline + optional right-side shade (clip) — the figurine look
  function P(x, fill, path, o) {
    o = o || {};
    x.beginPath(); path(x);
    if (fill) { x.fillStyle = fill; x.fill(); }
    if (o.shade != null) { x.save(); x.clip(); x.fillStyle = o.shadeCol || 'rgba(20,0,30,.18)'; x.fillRect(o.shade, 0, 400, 400); if (o.hi != null) { x.fillStyle = 'rgba(255,255,255,.22)'; x.fillRect(o.hi, 0, o.hiW || 6, 400); } x.restore(); x.beginPath(); path(x); }
    if (o.lw !== 0) { x.lineWidth = o.lw || 4; x.strokeStyle = o.stroke || OL; x.lineJoin = 'round'; x.stroke(); }
  }
  function limb(x, pts, col, w) {
    x.lineCap = 'round'; x.lineJoin = 'round';
    x.beginPath(); x.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]);
    x.strokeStyle = OL; x.lineWidth = w + 8; x.stroke(); x.strokeStyle = col; x.lineWidth = w; x.stroke();
  }
  function txt(x, s, px, cx, cy, fill, stroke, font) {
    x.font = (font || 'bold ') + px + 'px ' + (LA.FONT || 'sans-serif'); x.textAlign = 'center'; x.textBaseline = 'middle';
    if (stroke) { x.lineWidth = Math.max(2, px / 5); x.strokeStyle = stroke; x.strokeText(s, cx, cy); }
    x.fillStyle = fill; x.fillText(s, cx, cy);
  }

  // ---------------- atlas sprites, pre-scaled ----------------
  A.sprite = function (key, h) {
    if (!key) return null;
    h = Math.round(h || 208);
    const ck = 's:' + key + ':' + h; if (cache[ck]) return cache[ck];
    const im = LA.img(key); if (!im || !im.naturalWidth) return null;
    let src = im;
    if (key === 'flago') src = keyOut(im, [48, 52], 16);
    const sh = Math.min(h, im.naturalHeight), sw = sh * im.naturalWidth / im.naturalHeight;
    const [c, x] = mk(sw, sh); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, c.width, c.height);
    return (cache[ck] = c);
  };
  // one-time flood-fill key-out of a flat baked backdrop connected to the border (flago's grey card)
  function keyOut(im, lumRange, tol) {
    const w = im.naturalWidth, h = im.naturalHeight, [c, x] = mk(w, h); x.drawImage(im, 0, 0);
    let d; try { d = x.getImageData(0, 0, w, h); } catch (e) { return im; }
    const a = d.data, seen = new Uint8Array(w * h), st = [];
    const ok = (i) => { const r = a[i * 4], g = a[i * 4 + 1], b = a[i * 4 + 2]; const m = (r + g + b) / 3; return a[i * 4 + 3] > 0 && Math.abs(r - g) < 14 && Math.abs(g - b) < 14 && m >= lumRange[0] - tol && m <= lumRange[1] + tol; };
    for (let X = 0; X < w; X++) { st.push(X, (h - 1) * w + X); } for (let Y = 0; Y < h; Y++) { st.push(Y * w, Y * w + w - 1); }
    while (st.length) { const i = st.pop(); if (seen[i]) continue; seen[i] = 1; if (!ok(i)) continue; a[i * 4 + 3] = 0; const X = i % w, Y = (i / w) | 0;
      if (X > 0) st.push(i - 1); if (X < w - 1) st.push(i + 1); if (Y > 0) st.push(i - w); if (Y < h - 1) st.push(i + w); }
    x.putImageData(d, 0, 0); return c;
  }

  // ---------------- silhouettes (hit flash / tell flash) ----------------
  const sil = new WeakMap();
  A.silhouette = function (src, col) {
    let m = sil.get(src); if (!m) { m = {}; sil.set(src, m); }
    if (m[col]) return m[col];
    const w = src.width || src.naturalWidth, h = src.height || src.naturalHeight, [c, x] = mk(w, h);
    x.drawImage(src, 0, 0, w, h); x.globalCompositeOperation = 'source-atop'; x.fillStyle = col; x.fillRect(0, 0, w, h);
    return (m[col] = c);
  };
  A.lightHole = function () {
    if (cache.hole) return cache.hole;
    const [c, x] = mk(128, 128), g = x.createRadialGradient(64, 64, 8, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.55, 'rgba(0,0,0,.85)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128); return (cache.hole = c);
  };

  // =====================================================================================================
  // DRAWN CAST — figurine on a 128x224 canvas (ground y=220), facing LEFT (matches his atlas default)
  // =====================================================================================================
  const W = 128, H = 224;
  function person(x, s, pose) {
    const big = s.build === 'big' ? 1 : 0, slim = s.build === 'slim' ? 1 : 0;
    const tL = 34 - big * 7 + slim * 4, tR = 94 + big * 7 - slim * 4;           // torso span
    if (s.back) s.back(x, pose);
    // legs + shoes
    if (s.skirt) {
      limb(x, [52, 176, 50, 206], s.legs || s.skin, 9); limb(x, [76, 176, 78, 206], s.legs || s.skin, 9);
    } else {
      P(x, s.pants, (x) => rr(x, 44 - big * 4, 146, 20 + big * 3, 64, 5), { shade: 58 }); P(x, s.pants, (x) => rr(x, 64 + big, 146, 20 + big * 3, 64, 5), { shade: 80 });
    }
    P(x, s.shoes, (x) => { x.ellipse(48, 212, 15, 7, 0, 0, 7); }, { shade: 52 }); P(x, s.shoes, (x) => { x.ellipse(80, 212, 15, 7, 0, 0, 7); }, { shade: 84 });
    if (s.skirt) P(x, s.skirt, (x) => { x.moveTo(tL + 4, 146); x.lineTo(tR - 4, 146); x.lineTo(tR + 4, 184); x.lineTo(tL - 4, 184); x.closePath(); }, { shade: 72 });
    // back arm (screen right)
    limb(x, [tR - 4, 102, tR + 8, 128, tR + 4, 150], s.sleeve || s.top, 14 + big * 4);
    P(x, s.skin, (x) => x.arc(tR + 4, 152, 7 + big, 0, 7));
    if (s.rightHand) s.rightHand(x, tR + 4, 152, pose);
    // torso
    P(x, s.top, (x) => { rr(x, tL, 92, tR - tL, 62, 16); }, { shade: 76, hi: tL + 6 });
    if (s.belly) P(x, s.top, (x) => x.ellipse(64, 134, 26 + s.belly * 8, 18 + s.belly * 6, 0, 0, 7), { shade: 78 });
    if (s.torso) s.torso(x, tL, tR, pose);
    // neck + head
    P(x, s.skin, (x) => rr(x, 55, 80, 18, 16, 4), { lw: 3 });
    if (s.hairBack) s.hairBack(x);
    P(x, s.skin, (x) => x.arc(35, 60, 6, 0, 7), { lw: 3 }); P(x, s.skin, (x) => x.arc(93, 60, 6, 0, 7), { lw: 3 });
    P(x, s.skin, (x) => x.ellipse(64, 56, 29, 31, 0, 0, 7), { shade: 74, shadeCol: 'rgba(60,10,20,.14)' });
    face(x, s.face || {});
    if (s.hair) s.hair(x);
    if (s.hat) s.hat(x, pose);
    // front arm (screen left) — raised in the action pose
    const arm = pose ? [tL + 4, 102, tL - 12, 80, tL - 16, 54] : [tL + 4, 102, tL - 8, 128, tL - 4, 150];
    limb(x, arm, s.sleeve || s.top, 14 + big * 4);
    const hx = arm[4], hy = arm[5];
    P(x, s.skin, (x) => x.arc(hx, hy, 7 + big, 0, 7));
    if (s.leftHand) s.leftHand(x, hx, hy, pose);
  }
  function face(x, f) {
    // brows
    x.strokeStyle = OL; x.lineWidth = 3.5; x.lineCap = 'round';
    const bt = f.angry ? 3 : 0;
    x.beginPath(); x.moveTo(46, 43 - bt); x.lineTo(58, 45 + bt); x.moveTo(70, 45 + bt); x.lineTo(82, 43 - bt); x.stroke();
    if (f.shades) {
      P(x, f.shades, (x) => { rr(x, 42, 47, 19, 13, 5); rr(x, 67, 47, 19, 13, 5); }, { lw: 3 });
      x.beginPath(); x.moveTo(61, 52); x.lineTo(67, 52); x.stroke();
      x.fillStyle = 'rgba(255,255,255,.55)'; x.fillRect(46, 50, 5, 3); x.fillRect(71, 50, 5, 3);
    } else {
      P(x, '#fff', (x) => { x.ellipse(52, 54, 5.5, 6.5, 0, 0, 7); }, { lw: 2.5 }); P(x, '#fff', (x) => { x.ellipse(75, 54, 5.5, 6.5, 0, 0, 7); }, { lw: 2.5 });
      x.fillStyle = OL; x.beginPath(); x.arc(50.5, 55, 2.8, 0, 7); x.arc(73.5, 55, 2.8, 0, 7); x.fill();
      if (f.lashes) { x.lineWidth = 2; x.beginPath(); x.moveTo(46, 49); x.lineTo(43, 46); x.moveTo(81, 49); x.lineTo(84, 46); x.stroke(); }
      if (f.glasses) { x.strokeStyle = f.glasses; x.lineWidth = 3; x.beginPath(); x.arc(52, 54, 9, 0, 7); x.moveTo(84, 54); x.arc(75, 54, 9, 0, 7); x.moveTo(61, 53); x.lineTo(66, 53); x.stroke(); x.strokeStyle = OL; }
    }
    // nose
    x.lineWidth = 3; x.beginPath(); x.moveTo(62, 58); x.quadraticCurveTo(58, 66, 63, 67); x.stroke();
    if (f.stubble) { x.fillStyle = 'rgba(40,30,30,.22)'; x.beginPath(); x.ellipse(64, 76, 21, 10, 0, 0, 7); x.fill(); }
    if (f.beard) P(x, f.beard, (x) => { x.moveTo(38, 62); x.quadraticCurveTo(40, 96, 64, 98); x.quadraticCurveTo(88, 96, 90, 62); x.quadraticCurveTo(80, 80, 64, 80); x.quadraticCurveTo(48, 80, 38, 62); }, { lw: 3 });
    if (f.stache) P(x, f.stache, (x) => { x.moveTo(52, 71); x.quadraticCurveTo(64, 64, 76, 71); x.quadraticCurveTo(64, 70, 52, 71); }, { lw: 2.5 });
    // mouth
    if (f.grin) { P(x, '#fff', (x) => { x.moveTo(52, 73); x.quadraticCurveTo(64, 88, 77, 72); x.closePath(); }, { lw: 3 }); if (f.gold) { x.fillStyle = '#ffc23a'; x.fillRect(66, 74, 5, 5); } }
    else if (f.smirk) { x.lineWidth = 3.5; x.beginPath(); x.moveTo(54, 76); x.quadraticCurveTo(66, 80, 76, 71); x.stroke(); }
    else if (f.frown) { x.lineWidth = 3.5; x.beginPath(); x.moveTo(54, 79); x.quadraticCurveTo(64, 72, 74, 79); x.stroke(); }
    else { x.lineWidth = 3.5; x.beginPath(); x.moveTo(55, 75); x.quadraticCurveTo(64, 81, 73, 75); x.stroke(); }
    if (f.lips) { x.strokeStyle = f.lips; x.lineWidth = 4; x.beginPath(); x.moveTo(55, 75); x.quadraticCurveTo(64, 82, 73, 75); x.stroke(); x.strokeStyle = OL; }
    if (f.blush) { x.fillStyle = 'rgba(255,90,120,.3)'; x.beginPath(); x.ellipse(44, 66, 6, 3.5, 0, 0, 7); x.ellipse(84, 66, 6, 3.5, 0, 0, 7); x.fill(); }
  }
  // hair helpers
  const H_ = {
    slick: (col) => (x) => P(x, col, (x) => { x.moveTo(34, 52); x.quadraticCurveTo(34, 20, 64, 22); x.quadraticCurveTo(96, 22, 94, 52); x.quadraticCurveTo(84, 34, 64, 34); x.quadraticCurveTo(44, 34, 34, 52); }, { lw: 3.5 }),
    ponytail: (col) => (x) => P(x, col, (x) => { x.moveTo(92, 44); x.quadraticCurveTo(112, 50, 108, 80); x.quadraticCurveTo(100, 66, 90, 58); }, { lw: 3.5 }),
    bun: (col) => (x) => { P(x, col, (x) => x.arc(64, 22, 13, 0, 7), { lw: 3.5 }); P(x, col, (x) => { x.moveTo(34, 56); x.quadraticCurveTo(30, 24, 64, 24); x.quadraticCurveTo(98, 24, 94, 56); x.quadraticCurveTo(88, 36, 70, 34); x.quadraticCurveTo(52, 40, 34, 56); }, { lw: 3.5 }); },
    pomp: (col) => (x) => { P(x, col, (x) => { x.moveTo(34, 54); x.quadraticCurveTo(26, 14, 60, 12); x.quadraticCurveTo(100, 8, 94, 54); x.quadraticCurveTo(86, 30, 64, 32); x.quadraticCurveTo(44, 32, 34, 54); }, { lw: 3.5 }); x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 3; x.beginPath(); x.moveTo(44, 22); x.quadraticCurveTo(60, 14, 80, 18); x.stroke(); },
    long: (col) => (x) => P(x, col, (x) => { x.moveTo(34, 60); x.quadraticCurveTo(26, 16, 64, 20); x.quadraticCurveTo(104, 16, 94, 60); x.quadraticCurveTo(106, 100, 98, 124); x.quadraticCurveTo(86, 110, 90, 70); x.quadraticCurveTo(80, 36, 60, 36); x.quadraticCurveTo(42, 40, 38, 70); x.quadraticCurveTo(42, 110, 30, 124); x.quadraticCurveTo(22, 100, 34, 60); }, { lw: 3.5 }),
    topknot: (col) => (x) => { P(x, col, (x) => { x.ellipse(64, 14, 12, 10, 0, 0, 7); }, { lw: 3.5 }); P(x, col, (x) => { x.moveTo(34, 52); x.quadraticCurveTo(32, 22, 64, 24); x.quadraticCurveTo(96, 22, 94, 52); x.quadraticCurveTo(80, 32, 64, 32); x.quadraticCurveTo(48, 32, 34, 52); }, { lw: 3.5 }); },
    fade: (col) => (x) => P(x, col, (x) => { x.moveTo(36, 46); x.quadraticCurveTo(38, 22, 64, 24); x.quadraticCurveTo(90, 22, 92, 46); x.quadraticCurveTo(80, 32, 64, 32); x.quadraticCurveTo(48, 32, 36, 46); }, { lw: 3 }),
    bald: () => (x) => { x.fillStyle = 'rgba(255,255,255,.35)'; x.beginPath(); x.ellipse(54, 36, 8, 5, -0.4, 0, 7); x.fill(); },
  };
  // hand props
  const megaphone = (x, hx, hy, pose) => { x.save(); x.translate(hx, hy); x.rotate(pose ? -0.9 : 0.25); P(x, '#f2f2f2', (x) => { x.moveTo(-2, -6); x.lineTo(-30, -16); x.lineTo(-30, 16); x.lineTo(-2, 6); x.closePath(); }, { shade: -16 }); P(x, '#ff5a1f', (x) => rr(x, -4, -7, 10, 14, 3)); x.restore(); };
  const stamp = (x, hx, hy, pose) => { x.save(); x.translate(hx, hy); P(x, '#8a5a2b', (x) => rr(x, -5, -26, 10, 22, 4)); P(x, '#d8283a', (x) => rr(x, -18, -6, 36, 14, 3)); txt(x, 'DENIED', 8, 0, 1, '#fff'); x.restore(); };
  const cup = (x, hx, hy) => { x.save(); x.translate(hx, hy - 4); P(x, '#fff', (x) => { x.moveTo(-10, -18); x.lineTo(10, -18); x.lineTo(7, 12); x.lineTo(-7, 12); x.closePath(); }); x.fillStyle = '#7fd36b'; x.fillRect(-8, -12, 16, 20); x.strokeStyle = OL; x.lineWidth = 3; x.beginPath(); x.moveTo(3, -18); x.lineTo(8, -32); x.stroke(); txt(x, '$20', 8, 0, -1, '#1b1220'); x.restore(); };
  const papers = (x, hx, hy, pose) => { x.save(); x.translate(hx - 6, hy - 6); x.rotate(pose ? -0.5 : -0.15); P(x, '#fffdf2', (x) => rr(x, -16, -20, 26, 32, 2)); x.strokeStyle = '#8890a8'; x.lineWidth = 2; for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(-12, -13 + i * 6); x.lineTo(6, -13 + i * 6); x.stroke(); } txt(x, 'SIGN', 7, -3, 8, '#d8283a'); x.restore(); };
  const phoneUp = (x, hx, hy) => { P(x, '#222', (x) => rr(x, hx - 6, hy - 22, 12, 20, 3), { lw: 3 }); x.fillStyle = '#7fd3ff'; x.fillRect(hx - 3.5, hy - 19, 7, 13); };
  const badge = (x, hx, hy) => { P(x, '#ffc23a', (x) => { x.arc(hx - 2, hy - 4, 8, 0, 7); }, { lw: 3 }); txt(x, '★', 9, hx - 2, hy - 4, '#8a5a00'); };
  const script = (x, hx, hy) => { P(x, '#fffdf2', (x) => rr(x, hx - 4, hy - 4, 10, 26, 4), { lw: 3 }); };

  const CAST = {
    producer: { skin: '#f1c7a5', top: '#d9c29a', pants: '#3a3350', shoes: '#6b3e1e', belly: 1, build: 'big',
      face: { shades: '#8a5a2b', stubble: true, smirk: true }, hair: H_.slick('#b9b9c4'), hairBack: H_.ponytail('#b9b9c4'),
      torso: (x, l, r) => { P(x, '#7b3fa0', (x) => { x.moveTo(52, 92); x.lineTo(76, 92); x.lineTo(64, 130); x.closePath(); }, { lw: 3 }); x.strokeStyle = '#ffc23a'; x.lineWidth = 3; x.beginPath(); x.arc(64, 100, 12, 0.3, Math.PI - 0.3); x.stroke(); P(x, '#c4ab80', (x) => { x.moveTo(52, 92); x.lineTo(60, 128); x.lineTo(46, 112); x.closePath(); x.moveTo(76, 92); x.lineTo(68, 128); x.lineTo(82, 112); x.closePath(); }, { lw: 3 }); },
      leftHand: megaphone, rightHand: script },
    gateAgent: { skin: '#6b3f2a', top: '#1f3a6e', skirt: '#1f3a6e', legs: '#4e2e1f', shoes: '#141414', build: 'slim',
      face: { lips: '#a3324a', lashes: true, frown: true, angry: true }, hair: H_.bun('#141018'),
      hat: (x) => { P(x, '#1f3a6e', (x) => rr(x, 44, 14, 40, 14, 5), { lw: 3.5 }); P(x, '#ffc23a', (x) => { x.moveTo(52, 21); x.lineTo(64, 17); x.lineTo(76, 21); x.lineTo(64, 24); x.closePath(); }, { lw: 2 }); },
      torso: (x) => { P(x, '#d8283a', (x) => { x.moveTo(50, 90); x.quadraticCurveTo(64, 104, 78, 90); x.lineTo(70, 112); x.lineTo(58, 112); x.closePath(); }, { lw: 3 }); x.fillStyle = '#ffc23a'; for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(64, 120 + i * 11, 2.6, 0, 7); x.fill(); } P(x, '#fff', (x) => rr(x, 72, 110, 16, 8, 2), { lw: 2 }); txt(x, 'DEB', 6, 80, 114, '#1b1220'); },
      leftHand: stamp, rightHand: (x, hx, hy) => { P(x, '#fff', (x) => rr(x, hx - 4, hy - 2, 18, 10, 2), { lw: 2.5 }); x.fillStyle = '#4dc8ff'; x.fillRect(hx - 2, hy, 5, 6); } },
    guruKale: { skin: '#f0d0b0', top: '#8fbf8a', pants: '#2b2b3a', shoes: '#f4f4f4', build: 'slim',
      face: { glasses: '#ff6fae', grin: true, blush: true, lashes: true }, hair: H_.topknot('#16121c'),
      back: (x) => { P(x, '#b07cff', (x) => rr(x, 90, 70, 18, 96, 8), { shade: 100 }); },
      torso: (x) => { x.strokeStyle = OL; x.lineWidth = 2; x.beginPath(); x.moveTo(64, 94); x.lineTo(64, 152); x.stroke(); x.fillStyle = '#8a5a2b'; for (let i = 0; i < 9; i++) { const a = 0.5 + i * 0.27; x.beginPath(); x.arc(64 + Math.cos(a) * 18, 94 + Math.sin(a) * 18, 3.2, 0, 7); x.fill(); } txt(x, 'NAMASTAY', 7, 64, 146, '#fffdf2', OL); },
      leftHand: cup },
    agent: { skin: '#c68a5e', top: '#232a45', pants: '#232a45', shoes: '#111', build: 'avg',
      face: { stache: '#1a1210', grin: true, gold: true }, hair: H_.pomp('#15100c'),
      torso: (x) => { P(x, '#fff', (x) => { x.moveTo(52, 92); x.lineTo(76, 92); x.lineTo(64, 132); x.closePath(); }, { lw: 3 }); P(x, '#d8283a', (x) => { x.moveTo(61, 96); x.lineTo(67, 96); x.lineTo(69, 124); x.lineTo(64, 130); x.lineTo(59, 124); x.closePath(); }, { lw: 2.5 }); x.strokeStyle = 'rgba(255,255,255,.2)'; x.lineWidth = 1.5; for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(40 + i * 12, 98); x.lineTo(40 + i * 12, 152); x.stroke(); } P(x, '#ff6fae', (x) => { x.moveTo(78, 108); x.lineTo(88, 104); x.lineTo(86, 112); x.closePath(); }, { lw: 2 }); P(x, '#2a2a2a', (x) => rr(x, 90, 56, 6, 12, 3), { lw: 2 }); },
      leftHand: papers, rightHand: (x, hx, hy) => { P(x, '#ffc23a', (x) => rr(x, hx - 7, hy - 12, 14, 7, 2), { lw: 2.5 }); } },
    tina: { skin: '#f5d3b8', top: '#ff6fae', skirt: '#ff6fae', shoes: '#fff', build: 'slim',
      face: { lips: '#d8283a', lashes: true, smirk: true, blush: true }, hair: H_.long('#5a3218'),
      hat: (x) => { P(x, '#1b1220', (x) => { rr(x, 42, 30, 18, 9, 4); rr(x, 68, 30, 18, 9, 4); }, { lw: 2 }); },
      leftHand: phoneUp },
    mason: { skin: '#5a3522', top: '#1b1b22', sleeve: '#5a3522', pants: '#3a5a8a', shoes: '#f4f4f4', build: 'big',
      face: { shades: '#111', smirk: true }, hair: H_.fade('#120c08'),
      torso: (x) => { x.strokeStyle = '#ffc23a'; x.lineWidth = 3.5; x.beginPath(); x.arc(64, 96, 16, 0.3, Math.PI - 0.3); x.stroke(); } },
    fbiA: { skin: '#d9a37c', top: '#1b2440', pants: '#b8a27a', shoes: '#2a1a10', build: 'slim',
      face: { shades: '#111', frown: true, lips: '#8a3a3a' }, hair: H_.slick('#2a1810'), hairBack: H_.ponytail('#2a1810'),
      torso: (x) => txt(x, 'FBI', 15, 64, 122, '#ffe36a', OL), leftHand: badge },
    fbiB: { skin: '#4a2c1c', top: '#1b2440', pants: '#b8a27a', shoes: '#2a1a10', build: 'avg',
      face: { shades: '#111', frown: true, stubble: true }, hair: H_.fade('#0e0a08'),
      torso: (x) => txt(x, 'FBI', 15, 64, 122, '#ffe36a', OL), leftHand: badge },
    bodyguard: { skin: '#9a6a45', top: '#15151c', pants: '#15151c', shoes: '#0a0a0a', build: 'big', belly: 0.4,
      face: { shades: '#0a0a0a', frown: true, angry: true }, hair: H_.bald(),
      torso: (x) => { P(x, '#fff', (x) => { x.moveTo(56, 92); x.lineTo(72, 92); x.lineTo(64, 118); x.closePath(); }, { lw: 3 }); P(x, '#111', (x) => rr(x, 61, 96, 6, 22, 2), { lw: 2 }); P(x, '#222', (x) => rr(x, 90, 56, 6, 12, 3), { lw: 2 }); } },
  };
  // illustrated portrait (data/opus-art.js) wins once it has loaded; the code figurine is the fallback
  A.castKey = (name) => { const k = 'cast' + name[0].toUpperCase() + name.slice(1); return LA.SPRITES && LA.SPRITES[k] ? k : null; };
  A.drawn = function (name, pose) {
    const pk = A.castKey(name), pic = pk && A.sprite(pk, 208); if (pic) return pic;
    pose = pose ? 1 : 0; const ck = 'd:' + name + ':' + pose; if (cache[ck]) return cache[ck];
    const s = CAST[name]; if (!s) return null;
    const [c, x] = mk(W + 40, H); x.translate(20, 0); person(x, s, pose);        // 20px margin each side for hand props
    return (cache[ck] = c);
  };
  A.hasDrawn = (n) => !!CAST[n];

  // =====================================================================================================
  // ICONS (64-unit canvases; projectiles + FX)
  // =====================================================================================================
  const IC = {
    bang(x) { P(x, '#ff2b2b', (x) => x.arc(32, 32, 26, 0, 7), { lw: 5 }); txt(x, '!', 40, 32, 34, '#fff'); },
    star(x) { P(x, '#ffe36a', (x) => { for (let i = 0; i < 10; i++) { const r = i % 2 ? 12 : 28, a = -Math.PI / 2 + i * Math.PI / 5; x.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); } x.closePath(); }, { lw: 4 }); },
    puff(x) { x.fillStyle = 'rgba(235,235,240,.95)'; x.strokeStyle = 'rgba(40,30,50,.5)'; x.lineWidth = 3; x.beginPath(); x.arc(22, 36, 14, 0, 7); x.arc(40, 30, 16, 0, 7); x.arc(34, 44, 12, 0, 7); x.fill(); x.stroke(); x.fill(); },
    glob(x) { P(x, '#8bd450', (x) => { x.moveTo(32, 8); x.bezierCurveTo(56, 10, 60, 40, 48, 52); x.bezierCurveTo(40, 60, 22, 60, 14, 50); x.bezierCurveTo(4, 36, 12, 8, 32, 8); }, { lw: 5, shade: 38, shadeCol: 'rgba(20,60,0,.28)' }); x.fillStyle = 'rgba(255,255,255,.6)'; x.beginPath(); x.ellipse(24, 22, 6, 4, -0.5, 0, 7); x.fill(); x.fillStyle = '#4a8a1a'; x.beginPath(); x.arc(38, 36, 4, 0, 7); x.arc(24, 42, 3, 0, 7); x.fill(); },
    shock(x) { P(x, '#ffb14a', (x) => { x.moveTo(4, 60); x.lineTo(14, 22); x.lineTo(24, 40); x.lineTo(32, 6); x.lineTo(42, 38); x.lineTo(52, 18); x.lineTo(60, 60); x.closePath(); }, { lw: 4 }); P(x, '#fff6c0', (x) => { x.moveTo(18, 60); x.lineTo(26, 40); x.lineTo(32, 48); x.lineTo(38, 30); x.lineTo(46, 60); x.closePath(); }, { lw: 0 }); },
    stamp(x) { P(x, '#d8283a', (x) => rr(x, 4, 18, 56, 28, 5), { lw: 4 }); txt(x, 'DENIED', 12, 32, 33, '#fff'); },
    veto(x) { P(x, '#8a5a2b', (x) => rr(x, 24, 2, 16, 26, 5), { lw: 4 }); P(x, '#b0122a', (x) => rr(x, 4, 26, 56, 32, 6), { lw: 4 }); txt(x, 'VETO', 15, 32, 43, '#fff'); },
    blueprint(x) { P(x, '#3f7fd8', (x) => rr(x, 6, 20, 52, 22, 10), { lw: 4, shade: 40 }); x.strokeStyle = '#cfe6ff'; x.lineWidth = 2; x.beginPath(); x.moveTo(16, 26); x.lineTo(16, 36); x.moveTo(26, 26); x.lineTo(40, 36); x.stroke(); P(x, '#2a5ea8', (x) => x.ellipse(52, 31, 6, 11, 0, 0, 7), { lw: 3 }); },
    brick(x) { P(x, '#c4502e', (x) => rr(x, 6, 18, 52, 28, 3), { lw: 4, shade: 40 }); x.strokeStyle = 'rgba(0,0,0,.3)'; x.lineWidth = 2; x.beginPath(); x.moveTo(6, 32); x.lineTo(58, 32); x.moveTo(24, 18); x.lineTo(24, 32); x.moveTo(40, 32); x.lineTo(40, 46); x.stroke(); },
    beam(x) { P(x, '#ff7a1f', (x) => { x.rect(2, 20, 60, 8); x.rect(28, 28, 8, 10); x.rect(2, 38, 60, 8); }, { lw: 3.5 }); x.fillStyle = '#1b1220'; x.beginPath(); x.arc(8, 24, 1.8, 0, 7); x.arc(56, 24, 1.8, 0, 7); x.fill(); },
    clap(x) { P(x, '#222', (x) => rr(x, 6, 26, 52, 30, 3), { lw: 4 }); x.save(); x.translate(6, 26); x.rotate(-0.35); P(x, '#fff', (x) => rr(x, 0, -10, 52, 10, 2), { lw: 3 }); x.fillStyle = '#222'; for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(6 + i * 12, -10); x.lineTo(12 + i * 12, -10); x.lineTo(8 + i * 12, 0); x.lineTo(2 + i * 12, 0); x.fill(); } x.restore(); txt(x, 'TAKE 99', 9, 32, 44, '#fff'); },
    luggage(x) { P(x, '#8a4b2a', (x) => rr(x, 6, 16, 52, 40, 6), { lw: 4, shade: 40 }); P(x, null, (x) => rr(x, 22, 6, 20, 12, 4), { lw: 4 }); x.fillStyle = '#ffe36a'; x.fillRect(14, 24, 12, 8); x.strokeStyle = '#c9a36b'; x.lineWidth = 3; x.beginPath(); x.moveTo(6, 36); x.lineTo(58, 36); x.stroke(); },
    luggage2(x) { P(x, '#2fb3a6', (x) => rr(x, 8, 12, 48, 44, 8), { lw: 4, shade: 40 }); P(x, null, (x) => rr(x, 24, 4, 16, 10, 4), { lw: 4 }); x.strokeStyle = 'rgba(0,0,0,.3)'; x.lineWidth = 3; for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(18 + i * 14, 14); x.lineTo(18 + i * 14, 54); x.stroke(); } P(x, '#ff6fae', (x) => rr(x, 36, 22, 14, 9, 2), { lw: 2 }); },
    boot(x) { P(x, '#ffd21f', (x) => { x.moveTo(8, 48); x.lineTo(8, 20); x.lineTo(28, 10); x.lineTo(40, 18); x.lineTo(40, 30); x.lineTo(56, 30); x.lineTo(56, 48); x.closePath(); }, { lw: 4, shade: 36 }); P(x, '#333', (x) => x.arc(24, 38, 7, 0, 7), { lw: 3 }); txt(x, '$', 10, 46, 40, '#1b1220'); },
    ticket(x) { P(x, '#fffdf2', (x) => rr(x, 8, 14, 48, 36, 3), { lw: 4 }); P(x, '#ff5a1f', (x) => rr(x, 8, 14, 48, 11, 3), { lw: 3 }); txt(x, 'FINE', 9, 32, 20, '#fff'); txt(x, '$$$', 12, 32, 38, '#d8283a'); },
    clipboard(x) { P(x, '#b07a42', (x) => rr(x, 12, 8, 40, 50, 4), { lw: 4 }); P(x, '#fffdf2', (x) => rr(x, 17, 16, 30, 36, 2), { lw: 2 }); P(x, '#bbb', (x) => rr(x, 24, 4, 16, 8, 2), { lw: 3 }); txt(x, 'X', 16, 32, 34, '#d8283a'); },
    redtag(x) { P(x, '#d8283a', (x) => { x.moveTo(10, 14); x.lineTo(50, 14); x.lineTo(58, 32); x.lineTo(50, 50); x.lineTo(10, 50); x.closePath(); }, { lw: 4 }); P(x, '#fff', (x) => x.arc(50, 32, 4, 0, 7), { lw: 2 }); txt(x, 'RED', 11, 28, 26, '#fff'); txt(x, 'TAG', 11, 28, 40, '#fff'); },
    ballot(x) { P(x, '#fffdf2', (x) => rr(x, 12, 8, 40, 48, 3), { lw: 4 }); x.strokeStyle = OL; x.lineWidth = 2; for (let i = 0; i < 3; i++) { x.strokeRect(18, 16 + i * 12, 8, 8); x.beginPath(); x.moveTo(30, 20 + i * 12); x.lineTo(46, 20 + i * 12); x.stroke(); } x.strokeStyle = '#d8283a'; x.lineWidth = 3; x.beginPath(); x.moveTo(17, 15); x.lineTo(27, 25); x.moveTo(27, 15); x.lineTo(17, 25); x.moveTo(17, 27); x.lineTo(27, 37); x.moveTo(27, 27); x.lineTo(17, 37); x.stroke(); },
    fireball(x) { P(x, '#ff5a1f', (x) => { x.moveTo(32, 4); x.bezierCurveTo(46, 18, 60, 30, 50, 48); x.bezierCurveTo(42, 62, 20, 62, 14, 48); x.bezierCurveTo(6, 32, 22, 26, 32, 4); }, { lw: 4 }); P(x, '#ffe36a', (x) => { x.moveTo(32, 24); x.bezierCurveTo(42, 34, 46, 44, 38, 52); x.bezierCurveTo(32, 56, 24, 54, 22, 46); x.bezierCurveTo(20, 38, 28, 34, 32, 24); }, { lw: 0 }); },
    flame(x) { P(x, '#ff5a1f', (x) => { x.moveTo(32, 2); x.bezierCurveTo(44, 20, 58, 34, 50, 52); x.bezierCurveTo(44, 62, 20, 62, 14, 52); x.bezierCurveTo(6, 36, 22, 30, 24, 14); x.bezierCurveTo(28, 22, 30, 16, 32, 2); }, { lw: 3.5 }); P(x, '#ffd23a', (x) => { x.moveTo(32, 26); x.bezierCurveTo(42, 36, 44, 50, 36, 56); x.bezierCurveTo(30, 60, 24, 56, 24, 48); x.bezierCurveTo(24, 40, 30, 38, 32, 26); }, { lw: 0 }); },
    cup(x) { P(x, '#fff', (x) => { x.moveTo(16, 14); x.lineTo(48, 14); x.lineTo(43, 58); x.lineTo(21, 58); x.closePath(); }, { lw: 4 }); x.fillStyle = '#ff6fae'; x.beginPath(); x.moveTo(18, 24); x.lineTo(46, 24); x.lineTo(43, 56); x.lineTo(21, 56); x.closePath(); x.fill(); P(x, '#b07cff', (x) => rr(x, 13, 8, 38, 8, 3), { lw: 3 }); x.strokeStyle = OL; x.lineWidth = 4; x.beginPath(); x.moveTo(36, 8); x.lineTo(44, 0); x.stroke(); txt(x, '$20', 12, 32, 40, '#fff', OL); },
    contract(x) { P(x, '#fffdf2', (x) => rr(x, 12, 6, 40, 52, 2), { lw: 4 }); x.strokeStyle = '#8890a8'; x.lineWidth = 2; for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(18, 14 + i * 6); x.lineTo(46, 14 + i * 6); x.stroke(); } x.strokeStyle = OL; x.beginPath(); x.moveTo(18, 48); x.lineTo(46, 48); x.stroke(); txt(x, '90%', 10, 32, 42, '#d8283a'); },
    phone(x) { P(x, '#2a2a33', (x) => rr(x, 18, 6, 28, 52, 6), { lw: 4 }); P(x, '#7fd3ff', (x) => rr(x, 22, 12, 20, 32, 2), { lw: 2 }); x.fillStyle = '#fff'; x.beginPath(); x.arc(32, 50, 3, 0, 7); x.fill(); },
    mic(x) { P(x, '#2a2a33', (x) => rr(x, 27, 30, 10, 30, 4), { lw: 4 }); P(x, '#bfc4d0', (x) => x.arc(32, 20, 15, 0, 7), { lw: 4, shade: 36 }); x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 2; for (let i = -1; i <= 1; i++) { x.beginPath(); x.moveTo(20, 20 + i * 6); x.lineTo(44, 20 + i * 6); x.stroke(); } txt(x, '69', 8, 32, 44, '#ff6fae'); },
    orb(x) { const g = x.createRadialGradient(28, 26, 4, 32, 32, 26); g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, '#9fe8ff'); g.addColorStop(1, '#2a7fd8'); P(x, g, (x) => x.arc(32, 32, 22, 0, 7), { lw: 4 }); x.strokeStyle = '#fff'; x.lineWidth = 2.5; x.beginPath(); x.moveTo(20, 30); x.lineTo(28, 24); x.lineTo(32, 34); x.lineTo(42, 26); x.stroke(); },
    spark(x) { P(x, '#ffe36a', (x) => { x.moveTo(36, 2); x.lineTo(14, 36); x.lineTo(30, 36); x.lineTo(22, 62); x.lineTo(50, 24); x.lineTo(34, 24); x.closePath(); }, { lw: 4 }); },
    camera(x) { P(x, '#2a2a33', (x) => rr(x, 6, 18, 52, 36, 6), { lw: 4 }); P(x, '#2a2a33', (x) => rr(x, 18, 10, 18, 10, 3), { lw: 3 }); P(x, '#7fd3ff', (x) => x.arc(32, 36, 11, 0, 7), { lw: 4 }); P(x, '#fff', (x) => rr(x, 44, 22, 10, 7, 2), { lw: 2 }); },
    news(x) { P(x, '#d8283a', (x) => rr(x, 2, 18, 60, 28, 4), { lw: 4 }); txt(x, 'BREAKING', 11, 32, 32, '#fff'); },
    order(x) { P(x, '#f3e6c0', (x) => rr(x, 8, 10, 48, 44, 4), { lw: 4 }); P(x, '#c9b27a', (x) => { x.ellipse(8, 32, 5, 22, 0, 0, 7); x.ellipse(56, 32, 5, 22, 0, 0, 7); }, { lw: 3 }); txt(x, 'E.O.', 12, 32, 26, '#1b1220'); P(x, '#d8283a', (x) => x.arc(32, 42, 7, 0, 7), { lw: 2.5 }); },
    bow(x) { P(x, '#ff6fae', (x) => { x.moveTo(32, 32); x.bezierCurveTo(14, 8, 2, 20, 8, 40); x.bezierCurveTo(14, 52, 24, 40, 32, 32); x.bezierCurveTo(40, 40, 50, 52, 56, 40); x.bezierCurveTo(62, 20, 50, 8, 32, 32); }, { lw: 4 }); P(x, '#ff3d8b', (x) => x.arc(32, 32, 7, 0, 7), { lw: 3 }); },
    wave(x) { x.lineCap = 'round'; for (let i = 0; i < 3; i++) { x.strokeStyle = OL; x.lineWidth = 9; x.beginPath(); x.arc(8, 32, 14 + i * 12, -0.9, 0.9); x.stroke(); x.strokeStyle = i % 2 ? '#ff6fae' : '#ffe36a'; x.lineWidth = 5; x.stroke(); } },
    bag(x) { P(x, '#caa25a', (x) => { x.moveTo(24, 14); x.lineTo(40, 14); x.bezierCurveTo(60, 30, 60, 58, 32, 58); x.bezierCurveTo(4, 58, 4, 30, 24, 14); }, { lw: 4, shade: 36 }); txt(x, '$', 22, 32, 40, '#2d7a2d'); },
    drop(x) { P(x, '#4dc8ff', (x) => { x.moveTo(32, 4); x.bezierCurveTo(44, 24, 54, 34, 50, 46); x.bezierCurveTo(46, 60, 18, 60, 14, 46); x.bezierCurveTo(10, 34, 20, 24, 32, 4); }, { lw: 4 }); x.fillStyle = 'rgba(255,255,255,.7)'; x.beginPath(); x.ellipse(24, 38, 4, 7, 0.3, 0, 7); x.fill(); },
    moth(x) { P(x, '#b8a88a', (x) => { x.ellipse(20, 30, 14, 10, -0.4, 0, 7); x.moveTo(58, 30); x.ellipse(44, 30, 14, 10, 0.4, 0, 7); }, { lw: 3 }); P(x, '#6b5a40', (x) => x.ellipse(32, 32, 4, 12, 0, 0, 7), { lw: 3 }); },
    heart(x) { P(x, '#ff3d6e', (x) => { x.moveTo(32, 56); x.bezierCurveTo(-4, 30, 14, 2, 32, 20); x.bezierCurveTo(50, 2, 68, 30, 32, 56); }, { lw: 4 }); },
    sweat(x) { P(x, '#9fe8ff', (x) => { x.moveTo(32, 6); x.bezierCurveTo(44, 28, 48, 40, 40, 50); x.bezierCurveTo(34, 56, 24, 54, 22, 46); x.bezierCurveTo(20, 36, 28, 26, 32, 6); }, { lw: 3.5 }); },
    loot(x) { P(x, '#3a3a44', (x) => { x.moveTo(22, 12); x.lineTo(42, 12); x.bezierCurveTo(62, 28, 62, 58, 32, 58); x.bezierCurveTo(2, 58, 2, 28, 22, 12); }, { lw: 4, shade: 36 }); P(x, '#ffc23a', (x) => rr(x, 20, 30, 24, 14, 3), { lw: 3 }); txt(x, 'VVS', 9, 32, 37, '#1b1220'); x.strokeStyle = OL; x.lineWidth = 4; x.beginPath(); x.moveTo(22, 12); x.lineTo(42, 12); x.stroke(); },
    vote(x) { const im = A.sprite('basuraVote', 64); if (im) x.drawImage(im, 0, 8, 64, 64 * im.height / im.width); else IC.ballot(x); },
    hydrant(x) { P(x, '#d8283a', (x) => { rr(x, 18, 18, 28, 42, 5); }, { lw: 4, shade: 36 }); P(x, '#d8283a', (x) => { x.moveTo(16, 20); x.quadraticCurveTo(32, 2, 48, 20); x.closePath(); }, { lw: 4 }); P(x, '#b0122a', (x) => { rr(x, 8, 30, 12, 12, 3); rr(x, 44, 30, 12, 12, 3); }, { lw: 3 }); P(x, '#ffc23a', (x) => rr(x, 28, 4, 8, 6, 2), { lw: 2.5 }); },
  };
  A.icon = function (name) {
    const ck = 'i:' + name; if (cache[ck]) return cache[ck];
    const f = IC[name] || IC.bow;
    if (name === 'vote' && !A.sprite('basuraVote', 64)) { const [c0, x0] = mk(64, 64); IC.ballot(x0); return c0; }
    const [c, x] = mk(64, 64); f(x); return (cache[ck] = c);
  };

  // ---------------- walls / hurdles / barricades ----------------
  A.drawWall = function (ctx, style, x, y, w, h, e) {
    const img = (k) => LA.img(k);
    if (style === 'scaffold') {
      ctx.fillStyle = '#6b6f78'; ctx.fillRect(x, y, 4, h); ctx.fillRect(x + w - 4, y, 4, h);
      ctx.strokeStyle = '#9aa0ab'; ctx.lineWidth = 3; ctx.beginPath(); for (let yy = y + 6; yy < y + h; yy += 22) { ctx.moveTo(x, yy); ctx.lineTo(x + w, yy + 18 > y + h ? y + h : yy + 18); } ctx.stroke();
      ctx.strokeStyle = OL; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = '#ff5a1f'; ctx.fillRect(x - 6, y - 2, w + 12, 10); ctx.strokeRect(x - 6, y - 2, w + 12, 10);
      if (h > 50) { ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(-Math.PI / 2); ctx.font = 'bold 10px ' + LA.FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffe36a'; ctx.fillText('PERMIT PENDING', 0, 0); ctx.restore(); }
    } else if (style === 'gate') {
      ctx.fillStyle = '#8d96a6'; ctx.fillRect(x, y, w, h); ctx.fillStyle = 'rgba(0,0,0,.18)'; for (let yy = y + 4; yy < y + h; yy += 9) ctx.fillRect(x, yy, w, 3);
      ctx.strokeStyle = OL; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = '#3a3f4a'; ctx.fillRect(x - 5, y - 14, w + 10, 14); ctx.strokeRect(x - 5, y - 14, w + 10, 14);
      const bl = Math.floor(LA.now() / 160) % 2; ctx.fillStyle = bl ? '#ff2b2b' : '#7a1010'; ctx.beginPath(); ctx.arc(x + w / 2, y - 7, 4, 0, 7); ctx.fill();
      ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(-Math.PI / 2); ctx.font = 'bold 11px ' + LA.FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#d8283a'; ctx.fillText('GATE CLOSED', 0, 0); ctx.restore();
    } else if (style === 'barricade' || style === 'boot' || style === 'grill' || style === 'ballotbox') {
      const key = style === 'barricade' ? 'obBarricade' : style === 'boot' ? 'bWheelClampBootOnTire' : style === 'grill' ? 'grill3' : 'ballotBox';
      const im = img(key);
      if (im) { const dw = style === 'ballotbox' ? h * im.naturalWidth / im.naturalHeight : w + 10; ctx.drawImage(im, x + w / 2 - dw / 2, y, dw, h); }
      else { ctx.fillStyle = '#ff5a1f'; ctx.fillRect(x, y, w, h); }
      if (style === 'barricade') { const t = A.icon('redtag'); ctx.drawImage(t, x + w / 2 - 12, y + 2, 24, 24); }
    } else if (style === 'hydrant') { const ic = A.icon('hydrant'); ctx.drawImage(ic, x + w / 2 - h * 0.55, y - 2, h * 1.1, h + 4); }
    else { ctx.fillStyle = '#ff5a1f'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = OL; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h); }
  };

  // ---------------- the HEADLINE newspaper card ----------------
  A.headline = function (b, big, small) {
    const Wc = 1120, Hc = 600, [c, x] = mk(Wc, Hc);
    x.fillStyle = '#f3ecd9'; x.fillRect(0, 0, Wc, Hc);
    x.fillStyle = 'rgba(120,100,60,.08)'; for (let i = 0; i < 60; i++) x.fillRect((i * 97) % Wc, (i * 53) % Hc, 60, 2);
    x.strokeStyle = '#1b1220'; x.lineWidth = 10; x.strokeRect(5, 5, Wc - 10, Hc - 10);
    x.textAlign = 'center'; x.textBaseline = 'alphabetic'; x.fillStyle = '#1b1220';
    x.font = 'italic bold 64px Georgia, "Times New Roman", serif'; x.fillText('The Lost Angeles Times', Wc / 2, 86);
    x.font = 'bold 20px ' + LA.FONT; x.fillText('LATE EDITION  ·  ' + (b.A && b.A.level ? b.A.level.name : 'LOS ANGELES') + '  ·  FREE (FOR NOW)', Wc / 2, 120);
    x.fillRect(30, 132, Wc - 60, 5); x.fillRect(30, 142, Wc - 60, 2);
    // photo
    const px = 40, py = 164, pw = 300, ph = 396;
    x.fillStyle = '#cfc8b6'; x.fillRect(px, py, pw, ph);
    const im = LA.bosses.artOf(b, 0);
    if (im) { const [pc, pX] = mk(pw, ph); pX.fillStyle = '#b9b2a0'; pX.fillRect(0, 0, pw, ph); const hh = ph * 0.86, ww = Math.min(pw * 0.96, hh * im.width / im.height), hh2 = ww * im.height / im.width; pX.drawImage(im, (pw - ww) / 2, ph - hh2 - 6, ww, hh2);
      pX.globalCompositeOperation = 'saturation'; pX.fillStyle = '#808080'; pX.fillRect(0, 0, pw, ph);
      pX.globalCompositeOperation = 'source-over'; pX.fillStyle = 'rgba(0,0,0,.08)'; for (let yy = 0; yy < ph; yy += 4) pX.fillRect(0, yy, pw, 1);
      x.drawImage(pc, px, py); }
    x.lineWidth = 4; x.strokeRect(px, py, pw, ph);
    // headline text, auto-fit to 2 lines
    const tx = px + pw + 30, tw = Wc - tx - 36;
    const lines = fit(x, big.toUpperCase(), tw, 2, 110, 'Impact, "Arial Black", "Helvetica Neue", sans-serif');
    let y = 164; x.textAlign = 'left'; x.fillStyle = '#1b1220';
    for (const L of lines.lines) { y += lines.px * 0.98; x.font = 'bold ' + lines.px + 'px Impact, "Arial Black", "Helvetica Neue", sans-serif'; x.fillText(L, tx, y); }
    y += 18; x.fillRect(tx, y, tw, 3); y += 12;
    x.font = 'italic 30px Georgia, "Times New Roman", serif';
    for (const L of wrap(x, small, tw).slice(0, 4)) { y += 38; x.fillText(L, tx, y); }
    x.font = '18px Georgia, serif'; x.fillStyle = '#5a5040';
    y = Math.max(y + 26, Hc - 64); for (const L of wrap(x, 'Golden Boy could not be reached for comment. He was already running to the next district. Continued on A2, which is also delayed.', tw).slice(0, 2)) { x.fillText(L, tx, y); y += 24; }
    // EXTRA! burst
    x.save(); x.translate(Wc - 96, 70); x.rotate(0.2);
    x.beginPath(); for (let i = 0; i < 24; i++) { const r = i % 2 ? 44 : 66, a = i * Math.PI / 12; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.closePath();
    x.fillStyle = '#d8283a'; x.fill(); x.lineWidth = 5; x.strokeStyle = '#1b1220'; x.stroke();
    x.font = 'bold 28px Impact, "Arial Black", sans-serif'; x.textAlign = 'center'; x.fillStyle = '#fff'; x.fillText('EXTRA!', 0, 10); x.restore();
    return c;
  };
  function wrap(x, s, w) { const out = []; let cur = ''; for (const wd of s.split(' ')) { const t = cur ? cur + ' ' + wd : wd; if (x.measureText(t).width > w && cur) { out.push(cur); cur = wd; } else cur = t; } if (cur) out.push(cur); return out; }
  function fit(x, s, w, maxLines, px, fam) {
    for (; px > 30; px -= 4) { x.font = 'bold ' + px + 'px ' + fam; const L = wrap(x, s, w); if (L.length <= maxLines && L.every((l) => x.measureText(l).width <= w)) return { lines: L, px }; }
    x.font = 'bold 30px ' + fam; return { lines: wrap(x, s, w).slice(0, 3), px: 30 };
  }
})();
