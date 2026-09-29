// OVERWORLD MAP — scene 'map'. A Mario-3-style stylized LA drawn in code: the coast, the valley,
// downtown, Hollywood & the Westside, the South Bay, then a flight north to the Bay Area inset.
// 27 nodes on one road (LA.LEVELS order); Golden Boy walks node to node; locked / open / cleared states;
// boss nodes wear a crown. The static art is baked once to an offscreen canvas at screen resolution.
(function () {
  'use strict';
  const LA = window.LA, ui = LA.ui, save = LA.save;
  const MW = 1280, MH = 430, TOP = 62;              // map space, and where it sits on screen

  // node positions in map space (geography is stylized, the order is the game's)
  const POS = {
    '1-1': [262, 252], '1-2': [205, 197], '1-3': [112, 150],
    '2-1': [120, 68], '2-2': [222, 50], '2-3': [330, 80], '2-4': [442, 50], '2-5': [560, 74], '2-6': [690, 50],
    '3-1': [642, 150], '3-2': [722, 190], '3-3': [800, 232], '3-4': [735, 282], '3-5': [640, 248],
    '4-1': [560, 150], '4-2': [485, 178], '4-3': [520, 236], '4-4': [440, 240], '4-5': [382, 192], '4-6': [305, 146], '4-7': [398, 290],
    '5-1': [348, 322], '5-2': [405, 350], '5-3': [462, 388], '5-4': [640, 392],
    '5-5': [1085, 196], '5-6': [1182, 104],
  };
  const FLIGHT = ['5-4', '5-5'];                    // the hop north is a flight, not a road
  const COAST = [[0, 146], [40, 150], [90, 160], [140, 178], [190, 205], [232, 236], [268, 268], [310, 292], [360, 312], [405, 337], [440, 366], [470, 390], [505, 410], [560, 420], [650, 406], [690, 430]];

  const M = { t: 0, i: 0, from: 0, to: -1, seg: 0, queue: [], face: 1, cam: 0, enterT: -1, cache: null, cacheK: 0, info: 0 };
  const tierId = () => LA.flow.tier || 'local';
  const L = () => LA.LEVELS;
  const nodeXY = (i) => POS[L()[i].id];

  // ---------------- static map art (baked) ----------------
  function bake() {
    const k = LA.view.scale * LA.view.dpr;
    const cv = document.createElement('canvas'); cv.width = Math.ceil(MW * k); cv.height = Math.ceil(MH * k);
    const c = cv.getContext('2d'); c.setTransform(k, 0, 0, k, 0, 0); c.imageSmoothingEnabled = false;
    // ocean
    let g = c.createLinearGradient(0, 0, 0, MH); g.addColorStop(0, '#1f6d9c'); g.addColorStop(1, '#154b72');
    c.fillStyle = g; c.fillRect(0, 0, MW, MH);
    c.strokeStyle = 'rgba(191,233,255,.28)'; c.lineWidth = 2;
    for (let y = 18; y < MH; y += 34) for (let x = (y / 34 % 2) * 40; x < MW; x += 80) { c.beginPath(); c.arc(x, y, 7, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); }
    // land
    c.beginPath(); c.moveTo(0, 0); c.lineTo(975, 0); c.lineTo(975, MH);
    for (let i = COAST.length - 1; i >= 0; i--) c.lineTo(COAST[i][0], COAST[i][1]);
    c.closePath();
    c.fillStyle = '#e3c486'; c.fill();
    c.lineWidth = 10; c.strokeStyle = '#f4e2b5'; c.stroke();                  // beach
    c.lineWidth = 3; c.strokeStyle = '#6b4a1e'; c.stroke();
    // world regions: soft colour blobs around each world's nodes
    for (const W of LA.WORLDS) {
      const tmp = document.createElement('canvas'); tmp.width = cv.width; tmp.height = cv.height;
      const t = tmp.getContext('2d'); t.setTransform(k, 0, 0, k, 0, 0); t.fillStyle = W.col;
      for (const lv of L()) if (lv.w === W.n && POS[lv.id][0] < 975) { const [x, y] = POS[lv.id]; t.beginPath(); t.arc(x, y, 58, 0, 7); t.fill(); }
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 0.22; c.drawImage(tmp, 0, 0); c.restore();
    }
    c.setTransform(k, 0, 0, k, 0, 0);
    // Santa Monica Mountains (between the valley row and the westside) + San Gabriels up top
    const mtn = (x, y, s, col) => { c.beginPath(); c.moveTo(x - s, y); c.lineTo(x, y - s * 0.9); c.lineTo(x + s, y); c.closePath(); c.fillStyle = col; c.fill(); c.lineWidth = 2; c.strokeStyle = '#3d4a24'; c.stroke();
      c.beginPath(); c.moveTo(x - s * 0.22, y - s * 0.7); c.lineTo(x, y - s * 0.9); c.lineTo(x + s * 0.22, y - s * 0.7); c.fillStyle = '#c7d49a'; c.fill(); };
    for (let x = 40, i = 0; x < 620; x += 34, i++) mtn(x, 120 + (i % 2) * 6 - (x > 440 ? 8 : 0), 20 + (i % 3) * 4, i % 2 ? '#7f9950' : '#6d8a44');
    for (let x = 600, i = 0; x < 960; x += 40, i++) mtn(x, 18 + (i % 2) * 4, 22 + (i % 3) * 3, '#7f9950');
    // freeways
    const fwy = (pts, lab, lx, ly) => {
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.lineWidth = 7; c.strokeStyle = '#8b8f99'; c.stroke();
      c.setLineDash([6, 8]); c.lineWidth = 1.2; c.strokeStyle = '#f2f2f2'; c.stroke(); c.setLineDash([]);
      c.fillStyle = '#fff'; c.strokeStyle = '#1b3f8f'; c.lineWidth = 2; c.beginPath(); c.moveTo(lx - 11, ly - 9); c.lineTo(lx + 11, ly - 9); c.lineTo(lx + 11, ly + 3); c.quadraticCurveTo(lx, ly + 12, lx - 11, ly + 3); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#1b3f8f'; c.font = 'bold 9px ' + ui.FONT(); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(lab, lx, ly - 2);
    };
    fwy([[300, 34], [335, 150], [360, 250], [420, 330], [470, 425]], '405', 350, 212);
    fwy([[140, 88], [330, 96], [470, 96], [590, 110], [690, 175], [760, 212]], '101', 250, 92);
    fwy([[268, 262], [420, 262], [600, 262], [800, 250], [960, 245]], '10', 600, 262);
    fwy([[600, 30], [680, 110], [760, 190], [860, 300], [940, 420]], '5', 872, 318);
    // landmarks
    const txt = (s, x, y, size, col, rot) => { c.save(); c.translate(x, y); if (rot) c.rotate(rot); c.font = '800 ' + size + 'px ' + ui.FONT(); c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.35)'; c.strokeText(s, 0, 0); c.fillStyle = col; c.fillText(s, 0, 0); c.restore(); };
    // HOLLYWOOD sign on the hills
    c.fillStyle = '#fff'; c.font = '900 10px ' + ui.FONT(); c.textAlign = 'center'; c.fillText('HOLLYWOOD', 578, 112);
    // Griffith Observatory
    c.fillStyle = '#e9e4d8'; c.fillRect(612, 118, 22, 7); c.beginPath(); c.arc(623, 118, 6, Math.PI, 0); c.fill(); c.strokeStyle = '#333'; c.lineWidth = 1; c.stroke();
    // DTLA towers
    [[748, 212, 10, 34], [760, 204, 12, 42], [774, 214, 9, 30], [786, 208, 11, 38]].forEach(([x, y, w, h]) => { c.fillStyle = '#4b5a78'; c.fillRect(x, y - h + 30, w, h); c.strokeStyle = '#1d2436'; c.lineWidth = 1.5; c.strokeRect(x, y - h + 30, w, h); c.fillStyle = '#ffe6a8'; for (let yy = y - h + 34; yy < y + 26; yy += 6) c.fillRect(x + 2, yy, w - 4, 2); });
    // Santa Monica pier + ferris wheel
    c.fillStyle = '#8a6a44'; c.fillRect(212, 238, 38, 5); c.strokeStyle = '#ff6fae'; c.lineWidth = 2; c.beginPath(); c.arc(222, 228, 9, 0, 7); c.stroke();
    // Palisades on fire
    const fire = LA.img('fire');
    [[172, 178], [190, 170], [150, 172]].forEach(([x, y], i) => { if (fire) c.drawImage(fire, x - 10, y - 14, 20, 14); else { c.fillStyle = i % 2 ? '#ff9f2e' : '#ff5a1f'; c.beginPath(); c.moveTo(x - 6, y); c.lineTo(x, y - 14); c.lineTo(x + 6, y); c.fill(); } });
    // planes at Burbank + LAX
    const plane = (x, y, r) => { c.save(); c.translate(x, y); c.rotate(r); c.fillStyle = '#f3f3f3'; c.strokeStyle = '#333'; c.lineWidth = 1;
      c.beginPath(); c.ellipse(0, 0, 11, 2.6, 0, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.moveTo(-2, 0); c.lineTo(-6, -9); c.lineTo(2, 0); c.lineTo(-6, 9); c.closePath(); c.fill(); c.stroke(); c.restore(); };
    plane(470, 34, -0.2); plane(378, 368, 0.3);
    // Rose Bowl
    c.fillStyle = '#9a7040'; c.beginPath(); c.ellipse(730, 60, 11, 7, 0, 0, 7); c.fill(); c.fillStyle = '#6fbf5a'; c.beginPath(); c.ellipse(730, 60, 6, 3.5, 0, 0, 7); c.fill();
    // Queen Mary
    c.fillStyle = '#1d1d1d'; c.fillRect(676, 410, 30, 6); c.fillStyle = '#d6352f'; [682, 690, 698].forEach((x) => c.fillRect(x, 403, 4, 7));
    // palms along the coast
    const palm = (x, y) => { c.strokeStyle = '#6b4a1e'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 2, y - 8, x + 1, y - 14); c.stroke(); c.strokeStyle = '#2f8a3a'; c.lineWidth = 2.2; for (let a = 0; a < 5; a++) { c.beginPath(); c.moveTo(x + 1, y - 14); c.lineTo(x + 1 + Math.cos(a * 1.25 + 3.4) * 7, y - 14 + Math.sin(a * 1.25 + 3.4) * 5 + 2); c.stroke(); } };
    [[285, 285], [330, 305], [300, 272], [425, 372], [520, 402], [600, 408]].forEach(([x, y]) => palm(x, y));
    // area labels
    txt('SAN FERNANDO VALLEY', 400, 22, 11, 'rgba(90,60,20,.7)');
    txt('SANTA MONICA MTNS', 250, 136, 9, 'rgba(40,60,20,.75)');
    txt('P A C I F I C   O C E A N', 150, 330, 14, 'rgba(191,233,255,.6)', -0.35);
    txt('NOT TO SCALE. NOTHING HERE IS.', 830, 420, 9, 'rgba(90,60,20,.6)');
    // ----- Bay Area inset -----
    const bx = 995, by = 24, bw = 270, bh = 250;
    c.fillStyle = '#e3c486'; ui.rr(c, bx, by, bw, bh, 12); c.fill();
    c.save(); ui.rr(c, bx, by, bw, bh, 12); c.clip();
    c.fillStyle = '#1f6d9c'; c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + 150, by); c.quadraticCurveTo(bx + 120, by + 90, bx + 175, by + 120); c.quadraticCurveTo(bx + 240, by + 150, bx + bw, by + 120); c.lineTo(bx + bw, by); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + 40, by); c.quadraticCurveTo(bx + 36, by + 140, bx + 30, by + bh); c.lineTo(bx, by + bh); c.fill();
    // Golden Gate
    c.strokeStyle = '#e0452b'; c.lineWidth = 3; c.beginPath(); c.moveTo(bx + 42, by + 70); c.lineTo(bx + 132, by + 58); c.stroke();
    c.lineWidth = 3; [[bx + 62, by + 67], [bx + 112, by + 60]].forEach(([x, y]) => { c.beginPath(); c.moveTo(x, y + 6); c.lineTo(x, y - 18); c.stroke(); });
    c.lineWidth = 1.2; c.beginPath(); c.moveTo(bx + 42, by + 62); c.quadraticCurveTo(bx + 62, by + 49, bx + 62, by + 49); c.quadraticCurveTo(bx + 87, by + 70, bx + 112, by + 42); c.quadraticCurveTo(bx + 125, by + 55, bx + 132, by + 52); c.stroke();
    // Alcatraz rock
    c.fillStyle = '#8e8a80'; c.beginPath(); c.ellipse(1182, 110, 20, 9, 0, 0, 7); c.fill(); c.strokeStyle = '#3b3a36'; c.lineWidth = 1.5; c.stroke();
    c.fillStyle = '#d8d4c8'; c.fillRect(1170, 99, 20, 7); c.fillRect(1192, 92, 3, 12);
    // SF skyline
    [[1060, 206, 8, 26], [1070, 200, 7, 34], [1079, 208, 9, 22], [1098, 204, 6, 30]].forEach(([x, y, w, h]) => { c.fillStyle = '#6a7390'; c.fillRect(x, y - h + 18, w, h); });
    c.fillStyle = '#6a7390'; c.beginPath(); c.moveTo(1089, 224); c.lineTo(1093, 168); c.lineTo(1097, 224); c.fill();       // pyramid
    c.restore();
    c.lineWidth = 3; c.strokeStyle = '#6b4a1e'; ui.rr(c, bx, by, bw, bh, 12); c.stroke();
    txt('BAY AREA', bx + bw / 2, by + bh - 14, 12, 'rgba(90,60,20,.85)');
    txt('(yes, it\'s north)', bx + bw / 2, by + bh + 12, 9, 'rgba(191,233,255,.75)');
    M.cache = cv; M.cacheK = k; M.cacheFire = !!fire;
  }
  LA.on('resize', () => { M.cache = null; });

  // ---------------- path + nodes (live) ----------------
  const stateOf = (i) => { const id = L()[i].id, t = tierId(); return save.isCleared(t, id) ? 'cleared' : save.isOpen(t, id) ? 'open' : 'locked'; };

  function drawPath(ctx) {
    const n = L().length;
    for (let i = 0; i < n - 1; i++) {
      const a = nodeXY(i), b = nodeXY(i + 1), st = stateOf(i + 1), clr = stateOf(i) === 'cleared';
      const flight = L()[i].id === FLIGHT[0];
      ctx.lineCap = 'round';
      if (flight) {
        ctx.setLineDash([2, 10]); ctx.lineWidth = 4; ctx.strokeStyle = st === 'locked' ? 'rgba(255,255,255,.35)' : '#fff8e7';
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(930, 400, b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
        continue;
      }
      ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(40,24,8,.75)'; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      ctx.lineWidth = 5; ctx.strokeStyle = st === 'locked' ? '#9c917c' : clr ? '#ffcc3a' : '#fff1cf';
      if (st === 'locked') ctx.setLineDash([4, 7]);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  function flightPoint(u) {                                               // point on the flight arc
    const a = POS[FLIGHT[0]], b = POS[FLIGHT[1]], cx = 930, cy = 400, v = 1 - u;
    return [v * v * a[0] + 2 * v * u * cx + u * u * b[0], v * v * a[1] + 2 * v * u * cy + u * u * b[1]];
  }
  function drawNode(ctx, i) {
    const lv = L()[i], [x, y] = POS[lv.id], st = stateOf(i), sel = i === M.i && M.to < 0;
    const boss = !!lv.boss, r = boss ? 15 : 11;
    if (sel) { const p = 0.5 + Math.sin(M.t * 6) * 0.5; ctx.beginPath(); ctx.arc(x, y, r + 7 + p * 3, 0, 7); ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 + p * 0.5) + ')'; ctx.lineWidth = 3; ctx.stroke(); }
    ctx.beginPath(); ctx.arc(x, y + 2, r, 0, 7); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7);
    ctx.fillStyle = st === 'locked' ? '#6d7388' : st === 'cleared' ? '#ffcc3a' : lv.world.col; ctx.fill();
    ctx.lineWidth = boss ? 4 : 3; ctx.strokeStyle = boss ? (st === 'locked' ? '#7a4a4a' : '#e0262c') : '#241a10'; ctx.stroke();
    if (boss) {                                                            // crown
      ctx.fillStyle = st === 'locked' ? '#9a8f7a' : '#ffd23a'; ctx.strokeStyle = '#241a10'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x - 9, y - r + 1); ctx.lineTo(x - 9, y - r - 8); ctx.lineTo(x - 4.5, y - r - 3); ctx.lineTo(x, y - r - 10); ctx.lineTo(x + 4.5, y - r - 3); ctx.lineTo(x + 9, y - r - 8); ctx.lineTo(x + 9, y - r + 1); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    if (st === 'locked') ui.lock(ctx, x, y, boss ? 13 : 10, '#c9cddb');
    else if (st === 'cleared') { ctx.strokeStyle = '#241a10'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x - 1, y + 4); ctx.lineTo(x + 6, y - 4); ctx.stroke(); }
    else { ctx.fillStyle = '#0b0d14'; ctx.font = '900 ' + (boss ? 10 : 9) + 'px ' + ui.FONT(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(lv.id, x, y + 0.5); }
    // stars earned under cleared nodes
    if (st === 'cleared') { const b = save.best(tierId(), lv.id), s = (b && b.stars) || 1; for (let k = 0; k < 3; k++) ui.star(ctx, x - 10 + k * 10, y + r + 7, 4.2, k < s ? '#ffe36a' : 'rgba(0,0,0,.35)', 'rgba(0,0,0,.6)'); }
  }

  function walkerPos() {
    if (M.to < 0) { const [x, y] = nodeXY(M.i); return { x, y, fly: false }; }
    const a = nodeXY(M.from), b = nodeXY(M.to), u = ui.ease(M.seg);
    const flight = (L()[M.from].id === FLIGHT[0] && L()[M.to].id === FLIGHT[1]) || (L()[M.from].id === FLIGHT[1] && L()[M.to].id === FLIGHT[0]);
    if (flight) { const q = flightPoint(L()[M.from].id === FLIGHT[0] ? u : 1 - u); return { x: q[0], y: q[1], fly: true }; }
    return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, fly: false };
  }

  // ---------------- movement ----------------
  function stepTo(j) {
    if (j < 0 || j >= L().length || stateOf(j) === 'locked') return false;
    M.from = M.i; M.to = j; M.seg = 0;
    const a = nodeXY(M.i), b = nodeXY(j); M.face = b[0] >= a[0] ? 1 : -1;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ids = [L()[M.i].id, L()[j].id].sort().join();
    M.segDur = ids === FLIGHT.slice().sort().join() ? 1.3 : LA.clamp(d / 260, 0.18, 0.5);
    ui.sfx('menu');
    return true;
  }
  function walkToward(target) {                                           // queue a multi-node walk
    M.queue = [];
    if (target === M.i) return;
    const dir = target > M.i ? 1 : -1;
    for (let j = M.i + dir; dir > 0 ? j <= target : j >= target; j += dir) { if (stateOf(j) === 'locked') break; M.queue.push(j); }
    if (M.queue.length && M.to < 0) stepTo(M.queue.shift());
  }
  // pick the neighbour whose on-screen direction matches the pressed direction (Mario 3 feel)
  function dirPick(dx, dy) {
    const here = nodeXY(M.i); let best = -1, bestDot = 0.3;
    for (const j of [M.i - 1, M.i + 1]) {
      if (j < 0 || j >= L().length) continue;
      const p = nodeXY(j); let vx = p[0] - here[0], vy = p[1] - here[1]; const m = Math.hypot(vx, vy) || 1; vx /= m; vy /= m;
      const dot = vx * dx + vy * dy; if (dot > bestDot) { bestDot = dot; best = j; }
    }
    if (best < 0) best = (dx > 0 || dy > 0) ? M.i + 1 : M.i - 1;           // fallback: right/down = forward
    return best;
  }

  function enterLevel() {
    const lv = L()[M.i];
    if (stateOf(M.i) === 'locked') { ui.sfx('denied'); return; }
    M.enterT = 0; ui.sfx('select');
  }

  LA.scenes.register('map', {
    enter(p) {
      p = p || {};
      M.t = 0; M.to = -1; M.queue = []; M.enterT = -1; M.info = 0; M.delay = 0;
      const t = tierId();
      let at = p.from || p.at || save.tier(t).at || save.frontier(t);
      if (!LA.levels.byId[at] || !save.isOpen(t, at)) at = save.frontier(t);
      M.i = LA.levels.byId[at].index;
      if (p.walk) { const j = M.i + 1; if (j < L().length && stateOf(j) !== 'locked') { M.queue = [j]; M.delay = 0.6; } }
      M.cam = null;
      ui.music('map');
      LA.preload(['golden', 'goldenRun1', 'goldenRun2', 'fire']).then(() => { if (!M.cacheFire) M.cache = null; });
    },
    update(dt) {
      M.t += dt; M.info += dt;
      const inp = ui.read();
      if (M.enterT >= 0) { M.enterT += dt; if (M.enterT > 0.45) { M.enterT = -1; LA.flow.playLevel(L()[M.i].id); } return; }
      if (M.delay > 0) { M.delay -= dt; if (M.delay <= 0 && M.queue.length && M.to < 0) stepTo(M.queue.shift()); }
      if (M.to >= 0) {
        M.seg += dt / (M.segDur || 0.3);
        if (M.seg >= 1) {
          M.i = M.to; M.to = -1; M.info = 0; save.setAt(tierId(), L()[M.i].id);
          if (M.queue.length) stepTo(M.queue.shift());
        }
        return;
      }
      if (M.t < 0.25) return;                                              // entry grace: no carried-over presses
      if (inp.back) { ui.sfx('menu'); LA.scenes.go('title', { menu: true }); return; }
      if (inp.tap) {                                                      // tap a node: walk there; tap it again: enter
        const mx = inp.tap.x + M.cam, my = inp.tap.y - TOP;
        let hit = -1; L().forEach((lv, i) => { const [x, y] = POS[lv.id]; if (Math.hypot(mx - x, my - y) < 24) hit = i; });
        if (hit === M.i || (hit < 0 && inp.tap.y > TOP + MH)) { enterLevel(); return; }
        if (hit >= 0) { if (stateOf(hit) === 'locked') ui.sfx('denied'); else walkToward(hit); return; }
      }
      if (inp.ok) { enterLevel(); return; }
      const dx = inp.right ? 1 : inp.left ? -1 : 0, dy = inp.down ? 1 : inp.up ? -1 : 0;
      if (dx || dy) { const j = dirPick(dx, dy); if (!stepTo(j) && j >= 0 && j < L().length) ui.sfx('denied'); }
    },
    draw(ctx) {
      const VW = LA.view.VW, VH = LA.view.VH;
      if (!M.cache || M.cacheK !== LA.view.scale * LA.view.dpr) bake();
      const w = walkerPos();
      // camera: follow the walker; centre the map when the screen is wider than it
      let target = VW >= MW ? (MW - VW) / 2 : LA.clamp(w.x - VW / 2, 0, MW - VW);
      if (M.cam == null) M.cam = target; else M.cam += (target - M.cam) * 0.12;
      const cam = Math.round(M.cam);
      ctx.fillStyle = '#154b72'; ctx.fillRect(0, 0, VW, VH);
      ctx.drawImage(M.cache, -cam, TOP, MW, MH);
      ctx.save(); ctx.translate(-cam, TOP);
      drawPath(ctx);
      for (let i = 0; i < L().length; i++) drawNode(ctx, i);
      // Golden Boy
      if (w.fly) {
        ctx.save(); ctx.translate(w.x, w.y - 10); ctx.scale(M.face, 1); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(0, 0, 18, 4.5, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(-9, -14); ctx.lineTo(4, 0); ctx.lineTo(-9, 14); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
        ui.hero(ctx, 'golden', w.x + 2, w.y - 12, 22, M.face);
      } else {
        const moving = M.to >= 0, bob = moving ? Math.abs(Math.sin(M.t * 14)) * 2 : Math.sin(M.t * 3) * 0.8;
        const key = moving ? (Math.floor(M.t * 10) % 2 ? 'goldenRun1' : 'goldenRun2') : 'golden';
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(w.x, w.y + 3, 10, 3.5, 0, 0, 7); ctx.fill();
        ui.hero(ctx, key, w.x, w.y + 2 - bob, moving ? 40 : 46, M.face);
      }
      ctx.restore();
      drawHeader(ctx);
      drawInfo(ctx);
      if (M.enterT >= 0) { const a = LA.clamp(M.enterT / 0.45, 0, 1); ctx.globalAlpha = a; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, VW, VH); ctx.globalAlpha = 1; }
      ui.fadeIn(ctx, M.t, 0.35);
    },
  });

  function drawHeader(ctx) {
    const VW = LA.view.VW, lv = L()[M.to >= 0 ? M.to : M.i], W = lv.world, t = tierId();
    ctx.fillStyle = 'rgba(13,16,24,.94)'; ctx.fillRect(0, 0, VW, TOP);
    ctx.fillStyle = W.col; ctx.fillRect(0, TOP - 3, VW, 3);
    ui.text(ctx, 'WORLD ' + W.n, 12, 18, { size: 11, weight: '800', mono: true, col: W.col, stroke: false, align: 'left' });
    ui.text(ctx, W.name, 12, 40, { size: 20, weight: '900', col: '#fff', stroke: false, align: 'left', maxW: VW * 0.56 });
    // right: tier + lives + cleared
    const run = LA.game.run, lives = run && run.mode === 'level' && run.tier.id === t && run.lives > 0 ? run.lives : LA.TIERS[t].lives;
    const cleared = save.clearedCount(t);
    const rx = VW - 10;
    const tl = LA.TIERS[t].label + (LA.flow.players > 1 ? ' · 2P' : '');
    ctx.font = ui.f(11, '800', true); const tw = ctx.measureText(tl).width + 14;
    ui.chip(ctx, rx - tw, 8, tw, 20, { r: 7, border: t === 'native' ? '#ff6fae' : t === 'tourist' ? '#57e08a' : '#ffcc3a' });
    ui.text(ctx, tl, rx - tw / 2, 18.5, { size: 11, weight: '800', mono: true, stroke: false, col: '#fff' });
    const s2 = '×' + lives + '   ' + cleared + '/' + L().length;
    ctx.font = ui.f(13, '800', true); const w2 = ctx.measureText(s2).width;
    ui.heart(ctx, rx - w2 - 12, 34, 13, '#ff5d5d');
    ui.text(ctx, s2, rx, 42, { size: 13, weight: '800', mono: true, stroke: false, col: '#fff', align: 'right' });
    ui.star(ctx, rx - ctx.measureText(cleared + '/' + L().length).width - 10, 42, 5, '#ffcc3a');
  }

  function drawInfo(ctx) {
    const VW = LA.view.VW, VH = LA.view.VH, y0 = TOP + MH, lv = L()[M.to >= 0 ? M.to : M.i], t = tierId();
    const st = stateOf(lv.index), b = save.best(t, lv.id);
    ctx.fillStyle = 'rgba(13,16,24,.96)'; ctx.fillRect(0, y0, VW, VH - y0);
    ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(0, y0, VW, 1);
    const pad = 12, a = Math.min(1, M.info / 0.15);
    ctx.save(); ctx.globalAlpha = a;
    ui.rr(ctx, pad, y0 + 12, 50, 24, 7); ctx.fillStyle = lv.world.col; ctx.fill();
    ui.text(ctx, lv.id, pad + 25, y0 + 25, { size: 14, weight: '900', mono: true, col: '#0b0d14', stroke: false });
    ui.text(ctx, lv.name, pad + 60, y0 + 24, { size: 22, weight: '900', col: '#fff', stroke: false, align: 'left', maxW: VW - pad * 2 - 70 });
    ui.text(ctx, lv.sub || '', pad, y0 + 52, { size: 13, weight: '600', col: '#c9cede', stroke: false, align: 'left', maxW: VW * 0.58 });
    if (lv.boss) ui.text(ctx, 'BOSS · ' + lv.boss, pad, y0 + 74, { size: 12, weight: '800', mono: true, col: '#ff8a8a', stroke: false, align: 'left', maxW: VW * 0.58 });
    else ui.text(ctx, lv.final ? 'FINAL' : 'REACH THE EXIT SIGN', pad, y0 + 74, { size: 12, weight: '800', mono: true, col: '#8fd8ff', stroke: false, align: 'left' });
    // right column: record or status
    const rx = VW - pad;
    if (st === 'cleared' && b) {
      ui.text(ctx, b.grade || 'C', rx - 10, y0 + 58, { size: 38, weight: '900', col: gradeCol(b.grade), stroke: 'rgba(0,0,0,.8)', sw: 4 });
      ui.text(ctx, 'BEST ' + ui.num(b.score), rx - 44, y0 + 50, { size: 12, weight: '800', mono: true, col: '#fff', stroke: false, align: 'right' });
      ui.text(ctx, ui.timeShort(b.time), rx - 44, y0 + 68, { size: 12, weight: '800', mono: true, col: '#c9cede', stroke: false, align: 'right' });
      for (let k = 0; k < 3; k++) ui.star(ctx, rx - 94 + k * 16, y0 + 30, 6.5, k < (b.stars || 1) ? '#ffe36a' : 'rgba(255,255,255,.12)');
    } else if (st === 'open') ui.text(ctx, 'NEW!', rx, y0 + 30, { size: 14, weight: '900', mono: true, col: ui.C.green, align: 'right', stroke: false });
    else ui.text(ctx, 'LOCKED', rx, y0 + 30, { size: 13, weight: '900', mono: true, col: '#9aa0b4', align: 'right', stroke: false });
    ctx.restore();
    const touch = LA.input.touch && LA.input.touch.active;
    if (M.to < 0 && st !== 'locked' && ui.blink(M.t, 1.5)) ui.text(ctx, touch ? 'TAP TO ENTER' : '▶ JUMP / START TO ENTER', VW / 2, VH - 11, { size: 11, weight: '800', mono: true, col: ui.C.green, stroke: false });
    else if (M.to < 0) ui.text(ctx, touch ? 'TAP A NODE TO WALK' : 'STICK TO WALK · COIN / ESC FOR MENU', VW / 2, VH - 11, { size: 10, weight: '700', mono: true, col: ui.C.dim, stroke: false });
  }
  const gradeCol = (g) => ({ S: '#ffcc3a', A: '#57e08a', B: '#4dc8ff', C: '#c9cede' }[g] || '#c9cede');
  LA.ui.gradeCol = gradeCol;
  LA.map = { POS, stateOf };
})();
