// THE CITY — an exact port of Saint's backdrop pipeline, assembled the way his Level Builder boots it
// (engine ZONES -> builder CUSTOM adds/swaps -> bldZone re-homes -> pinned positions + edits +
// zone extends). Building placement, sizes, parallax, sea bands, floor bands, ground tile, decals,
// the VVS heist plate, scenery and the animated building crews all follow his code line-for-line.
// Source refs: lost-angeles-ed.html buildBackdrop()@537, computeSeaBands()@573, buildLevel floors@705,
// render()@1735, drawScenery()@1676, crews@444-536; Level Builder boot@462-575.
(function () {
  'use strict';
  const LA = window.LA;
  const C = LA.CITY, GY = C.GY, BG_PAR = C.BG_PAR, BG_SCALE = C.BG_SCALE, BG_SINK = C.BG_SINK;
  const POS = (LA.LAYOUT && LA.LAYOUT.pos) || {};          // his window.__EDPOS
  const EDITS = (LA.LAYOUT && LA.LAYOUT.edits) || {};      // his window.__EDBLD
  const EXT = (LA.BUILDER && LA.BUILDER.zoneExt) || {};    // his window.__EDEXT

  const city = LA.city = {
    zones: null, BH: null, bgTiles: [], distSpan: [], bgWidth: 0, seaBands: [],
    seg: [],                // world-space district ranges  (== his zoneRanges())
    worldW: 0,
    floorZones: [],         // his __EDG.zones (heist plate, decals, district floor bands)
    groundKey: null,        // his __EDG.imgs[0] (builder GROUND tile)
    scen: null,             // scenery registry by district name (his SCEN)
    concertStopped: false,  // set by the concert set-piece (performers freeze)
    hideBoats: false,       // set-pieces hide yachts/gondolas (his rv check)
  };
  city.edit = (k) => EDITS[k] || null;

  const bReady = (k) => LA.hasArt(k) && !!LA.dims(k);

  // ---------- 1. assemble districts exactly like the Level Builder ----------
  function assemble() {
    const Z = JSON.parse(JSON.stringify(C.ZONES));
    const BH = Object.assign({}, C.BH);
    for (const c of (LA.BUILDER && LA.BUILDER.custom) || []) {          // builder CUSTOM (live entries)
      if (c.action === 'add') {                                          // == regBuilding(key,img,zone,{drawH,after})
        if (c.drawH) BH[c.key] = c.drawH / BG_SCALE;
        const z = Z.find((z) => z.n === c.zone);
        if (z && z.keys.indexOf(c.key) < 0) {
          let idx = z.keys.length;
          if (c.after != null) { const p = z.keys.indexOf(c.after); idx = p >= 0 ? p + 1 : z.keys.length; }
          z.keys.splice(idx, 0, c.key);
        }
        // builder also set z.boss from c.boss ('TIM FLOAT' on Hollywood) — bosses are gameplay; not applied here.
      } else if (c.action === 'replace') {                               // == regReplace(key,img,drawH)
        if (c.drawH) BH[c.key] = c.drawH / BG_SCALE;
      }
    }
    for (const k of Object.keys((LA.BUILDER && LA.BUILDER.bldZone) || {})) {   // == applyBldZones()
      const want = LA.BUILDER.bldZone[k];
      const cur = Z.findIndex((z) => z.keys.indexOf(k) >= 0);
      const wi = Z.findIndex((z) => z.n === want);
      if (wi < 0 || cur === wi) continue;
      if (cur >= 0) Z[cur].keys.splice(Z[cur].keys.indexOf(k), 1);        // removeBuildingKey
      if (Z[wi].keys.indexOf(k) < 0) Z[wi].keys.push(k);                  // regBuilding (append)
    }
    city.zones = Z; city.BH = BH;
  }

  // ---------- 2. buildBackdrop() — verbatim, sizes from the pre-measured table ----------
  function buildBackdrop() {
    const ZONES = city.zones, BH = city.BH;
    let bgTiles = [], distSpan = [], x = 0;
    ZONES.forEach((z, zi) => {
      const ks = z.keys.filter(bReady);
      const start = x;
      const extPx = (EXT[z.n] || 0) * BG_PAR;
      for (const k of ks) {
        const d = LA.dims(k);
        const hh = (BH[k] || d[1] * 1.25) * BG_SCALE;
        const ww = hh * (d[0] / d[1]);
        const fx = POS[k] != null ? POS[k] : null;
        bgTiles.push({ x: fx != null ? fx : x, w: ww, h: hh, k, zi });
        x = Math.max(x, (fx != null ? fx : x) + ww + (z.gap || 0));
      }
      if (x === start) x += 520;
      x += extPx;
      distSpan.push([start, x]);
    });
    let bgWidth = x;
    if (Object.keys(POS).length) {
      const starts = []; let pend = 0;
      ZONES.forEach((z, zi) => {
        let mn = null, mx = null;
        bgTiles.forEach((t) => { if (t.zi !== zi) return; const e3 = EDITS[t.k] || {}; if (e3.del) return; const a = t.x + (e3.dx || 0), b = a + t.w * (e3.sc || 1); if (mn == null || a < mn) mn = a; if (mx == null || b > mx) mx = b; });
        if (mn == null) { mn = pend + 40; mx = mn + 520; }
        if (zi > 0 && mn < starts[zi - 1] + 80) mn = starts[zi - 1] + 80;
        starts.push(mn); if (mx > pend) pend = mx;
      });
      distSpan = ZONES.map((z, zi) => [starts[zi], zi < ZONES.length - 1 ? starts[zi + 1] : Math.max(x, pend + 300)]);
      bgWidth = Math.max(x, pend + 300);
    }
    city.bgTiles = bgTiles; city.distSpan = distSpan; city.bgWidth = bgWidth;
    city.seg = distSpan.map((s) => [s[0] / BG_PAR, s[1] / BG_PAR]);
    city.worldW = bgWidth / BG_PAR;
    computeSeaBands();
  }

  // ---------- 3. computeSeaBands() — verbatim ----------
  function computeSeaBands() {
    const ZONES = city.zones, distSpan = city.distSpan, bgTiles = city.bgTiles;
    let seaBands = [];
    ZONES.forEach((z, zi) => {
      if (!z.sea || !distSpan[zi]) return;
      let a0 = distSpan[zi][0], a1 = distSpan[zi][1];
      if (z.seaFrom) { const t = bgTiles.find((t) => t.zi === zi && t.k === z.seaFrom); if (t) a0 = t.x; }
      if (z.seaTo) { const t = bgTiles.find((t) => t.zi === zi && t.k === z.seaTo); if (t) a1 = z.seaToEnd ? t.x + t.w : t.x; }
      seaBands.push([a0, a1]);
    });
    seaBands.sort((m, n) => m[0] - n[0]);
    const merged = [];
    for (const bnd of seaBands) { const last = merged[merged.length - 1]; if (last && bnd[0] - last[1] < 30) last[1] = Math.max(last[1], bnd[1]); else merged.push([bnd[0], bnd[1]]); }
    city.seaBands = merged;
  }

  // his street segmentation as the builder (sandbox) lays it: buildLevel()@607 — worldLen per district,
  // split into ~415px blocks (min 240 each), laid from world x=0. Floor bands run to the NEXT district's
  // street start, so we need these exact numbers to match his floors.
  function buildStreet() {
    let x = 0; const dw = [];
    city.zones.forEach((z, zi) => {
      const s = city.distSpan[zi], span = s ? s[1] - s[0] : 900;
      const worldLen = Math.max(300, span / BG_PAR);
      const blocks = Math.max(2, Math.round(worldLen / 415));
      const zoneW = Math.max(240, worldLen / blocks);
      dw.push([x, x + zoneW * blocks]); x += zoneW * blocks;
    });
    city.street = dw;
  }

  // ---------- 4. ground art: builder heist plate + decals, then district floor bands (play-mode order) ----------
  function buildFloors() {
    buildStreet();
    const B = LA.BUILDER || {}, zones = [];
    city.groundKey = (B.ground && B.ground.length) ? 'groundTile' : null;
    const nameOf = (src) => '@' + src.split('/').pop().replace(/\.(webp|png)$/, '');
    for (const p of B.groundPins || []) {                                   // pinGround(src, vx-before, vx-before+width, h)
      const vx = city.buildingWorldX(p.at); if (vx == null) continue;
      zones.push({ key: nameOf(p.src), x0: vx - p.before, x1: vx - p.before + p.width, h: p.h || 190 });
    }
    for (const d of B.decals || []) {                                        // decalGround(src, cx, h)
      let cx;
      if (d.at) { const bx = city.buildingWorldX(d.at); if (bx == null) continue; cx = Math.round(bx); }
      else { const r = city.seg[d.district]; cx = (r && r[1] > r[0]) ? Math.round((r[0] + r[1]) / 2) : Math.round(city.worldW * ((d.district + 0.5) / city.zones.length)); }
      zones.push({ key: nameOf(d.src), x0: cx, x1: cx + 900, once: true, h: d.h || 190 });
    }
    for (const fl of C.FLOORS) {                                             // buildLevel _fl bands (bw)
      const zi = fl[0], key = fl[1]; if (!LA.hasArt(key)) continue;
      const z = city.zones[zi]; if (!z) continue;
      const arr = [];
      z.keys.forEach((k) => { const t = city.bgTiles.find((tt) => tt.k === k); if (!t) return; const e = EDITS[k] || {}; if (e.del) return; const a = t.x + (e.dx || 0); arr.push([a, a + t.w * (e.sc || 1)]); });
      if (!arr.length) continue;
      let minL = arr[0][0], maxR = arr[0][1];
      for (const r of arr) { if (r[0] < minL) minL = r[0]; if (r[1] > maxR) maxR = r[1]; }
      let x0 = minL - 30, x1 = maxR + 30;
      if (city.street[zi]) { const dend = (city.street[zi + 1] ? city.street[zi + 1][0] : city.street[zi][1]) * BG_PAR; if (dend > x1 && dend - x1 < 4000) x1 = dend; }
      zones.push({ key, x0: x0 / BG_PAR, x1: x1 / BG_PAR, h: 190, bw: 1 });
    }
    const bws = zones.filter((z) => z.bw).sort((m, n) => m.x0 - n.x0);      // close seams between floor bands
    for (let s = 1; s < bws.length; s++) { const g = bws[s].x0 - bws[s - 1].x1; if (g > 0 && g < 2000) bws[s - 1].x1 = bws[s].x0; }
    city.floorZones = zones;
  }

  // ---------- 5. scenery registry — port of the builder's setScenery(reg) ----------
  function buildScenery() {
    const zr = city.seg, reg = {};
    const boat = { key: 'yacht', layer: 'back', y: 340, h: 112, speed: 26, gap: 2400, bob: 0.6, bobA: 3 };
    reg['VENICE BEACH'] = [{ key: 'heli', layer: 'front', y: 30, h: 118, speed: 58, par: 0.15, period: 1650, bob: 0.5, bobA: 5 }];
    let vb = city.buildingSpan('bCanalDoLater');
    if (vb) {
      const ce = EDITS.bCanalDoLater || {}, off = (ce.dx || 0) / 0.45, scw = ce.sc || 1;
      vb = [vb[0] + off, vb[0] + off + (vb[1] - vb[0]) * scw];
      reg['VENICE BEACH'].unshift(
        { key: '_pool', type: 'pool', x0: vb[0] + 40, x1: vb[1] - 40, yTop: 398, yBot: 506, top: '#5c8f7f', bot: '#2f5348' },
        { key: 'gondA', layer: 'back', range: [vb[0], vb[1]], y: 404, h: 72, speed: 66, gap: 1000, phase: 0, bob: 1.0, bobA: 3 },
        { key: 'gondB', layer: 'back', range: [vb[0], vb[1]], y: 414, h: 64, speed: 54, gap: 1500, phase: 900, bob: 0.9, bobA: 3 });
    }
    const SEAZ = { 'SANTA MONICA': 2, 'PALISADES': 3, 'MALIBU': 4, 'MANHATTAN BEACH': 26, 'REDONDO': 27, 'LONG BEACH': 28, 'SAN FRANCISCO': 29 };
    Object.keys(SEAZ).forEach((n) => { const r = zr[SEAZ[n]]; if (r && r[1] > r[0]) (reg[n] = reg[n] || []).push(Object.assign({}, boat, { range: [r[0], r[1]], phase: (SEAZ[n] * 700) % 2400 })); });
    { const cs = vb, vz = zr[1], mz = zr[0];
      const wStart = mz ? mz[0] : (vz ? vz[0] : null), wEnd = cs ? cs[1] : (vz ? vz[1] : null);
      if (wStart != null && wEnd != null && wEnd > wStart + 300) (reg['VENICE BEACH'] = reg['VENICE BEACH'] || []).push(Object.assign({}, boat, { range: [wStart, wEnd] })); }
    const mar = zr[0];
    if (mar) reg['MARINA DEL REY'] = [{ key: 'yacht', layer: 'back', anchor: Math.round(mar[0] + 200), y: 360, h: 121, bob: 0.7, bobA: 4 }];
    city.scen = reg;
  }

  // ---------- lookups (his bridge helpers) ----------
  city.tile = (k) => city.bgTiles.find((t) => t.k === k) || null;
  city.buildingWorldX = (k) => { const t = city.tile(k); return t ? t.x / BG_PAR : null; };
  city.buildingSpan = (k) => { const t = city.tile(k); return t ? [t.x / BG_PAR, (t.x + t.w) / BG_PAR] : null; };
  city.zoneIndexAt = (wx) => { for (let i = 0; i < city.seg.length; i++) if (wx < city.seg[i][1]) return i; return city.seg.length - 1; };
  city.zoneAt = (wx) => city.zones[city.zoneIndexAt(wx)];
  // every art key needed to draw world range [x0,x1] at any viewport width (for preloading a level)
  city.artKeysForRange = (x0, x1) => {
    const out = new Set(['wSea', 'wSurf']); if (city.groundKey) out.add(city.groundKey);
    const b0 = x0 * BG_PAR - 1300, b1 = x1 * BG_PAR + 1300;
    for (const t of city.bgTiles) { const e = EDITS[t.k] || {}; if (e.del) continue; const a = t.x + (e.dx || 0), b = a + t.w * (e.sc || 1); if (b >= b0 && a <= b1) { out.add(t.k); if (t.k === 'bKitsoff') KIT_CREW.forEach((c) => [0, 1, 2].forEach((i) => out.add(c.base + '_' + i))); if (t.k === 'bStageConcert') CC_CREW.forEach((c) => { for (let i = 0; i < 6; i++) out.add(c.base + '_' + i); out.add(c.base + 'Idle'); }); } }
    for (const z of city.floorZones) if (z.x1 >= x0 - 1400 && z.x0 <= x1 + 1400) out.add(z.key);
    for (let i = city.zoneIndexAt(x0); i <= city.zoneIndexAt(x1); i++) for (const L of (city.scen[city.zones[i].n] || [])) if (L.key && L.key[0] !== '_') out.add(L.key);
    return Array.from(out);
  };

  city.build = function () { assemble(); buildBackdrop(); buildFloors(); buildScenery(); city.ready = true; LA.emit('cityReady', city); return city; };

  // =================================== DRAW ===================================
  const skyStops = (g) => { g.addColorStop(0, '#8ed3ee'); g.addColorStop(0.6, '#f3c98b'); g.addColorStop(1, '#e8a86a'); return g; };

  city.drawSky = function (ctx) {
    const VW = LA.view.VW, VH = LA.view.VH;
    ctx.fillStyle = skyStops(ctx.createLinearGradient(0, 0, 0, VH));
    ctx.fillRect(0, 0, VW, VH);
  };

  // ocean: two tiling layers on a slower parallax, feathered into the sky at each end (render@1741)
  city.drawOcean = function (ctx, cam, t) {
    const VW = LA.view.VW, VH = LA.view.VH;
    const px = cam * BG_PAR, sea = LA.img('wSea'), surf = LA.img('wSurf');
    const band = city.seaBands.find(([a, b]) => px + VW > a && px < b);
    if (!(band && sea && surf)) return;
    const seaY = GY - sea.naturalHeight - surf.naturalHeight + 18;
    const totalH = sea.naturalHeight + surf.naturalHeight, FADE = 300;
    const L = band[0] - px, R = band[1] - px;
    ctx.save();
    ctx.beginPath(); ctx.rect(Math.max(0, L), seaY, Math.min(VW, R) - Math.max(0, L), GY - seaY); ctx.clip();
    const drawBand = (im, y, par, drift) => { const iw = im.naturalWidth, off = (cam * par + drift) % iw; for (let i = -1; i < Math.ceil(VW / iw) + 2; i++) ctx.drawImage(im, Math.round(i * iw - off), y, iw + 1, im.naturalHeight); };
    drawBand(sea, seaY, 0.16, t * 5);
    drawBand(surf, seaY + sea.naturalHeight, 0.26, t * 13);
    const skyGrad = skyStops(ctx.createLinearGradient(0, 0, 0, VH));
    const feather = (x0, dir) => { const STRIPS = 16, w = FADE / STRIPS; for (let i = 0; i < STRIPS; i++) { const a = dir > 0 ? 1 - i / STRIPS : i / STRIPS; ctx.globalAlpha = a * a; ctx.fillStyle = skyGrad; ctx.fillRect(x0 + i * w, seaY, w + 1, totalH); } ctx.globalAlpha = 1; };
    if (band[0] > 5 && L > -FADE && L < VW) feather(L, 1);
    if (R > 0 && R < VW + FADE) feather(R - FADE, -1);
    ctx.restore();
  };

  // moving scenery (drawScenery@1676)
  city.drawScenery = function (ctx, cam, which) {
    const scen = city.scen; if (!scen) return;
    const VW = LA.view.VW, t = LA.now() / 1000, midW = cam + VW / 2;
    let dz = null;
    for (let i = 0; i < city.distSpan.length; i++) { const a = city.distSpan[i][0] / BG_PAR, b = city.distSpan[i][1] / BG_PAR; if (midW >= a && midW < b) { dz = city.zones[i].n; break; } }
    if (dz == null) return;
    const layers = scen[dz]; if (!layers) return;
    for (const L of layers) {
      if ((L.layer || 'back') !== which && L.type !== 'pool') continue;
      if (L.type === 'pool' && which !== 'back') continue;
      if ((L.key === 'yacht' || L.key === 'gondA' || L.key === 'gondB') && city.hideBoats) continue;
      if (L.type === 'pool') {
        const px0 = (L.x0 - cam) * BG_PAR, px1 = (L.x1 - cam) * BG_PAR;
        if (px1 > 0 && px0 < VW) {
          ctx.save(); ctx.beginPath(); ctx.rect(Math.max(0, px0), L.yTop, Math.min(VW, px1) - Math.max(0, px0), L.yBot - L.yTop); ctx.clip();
          const gg = ctx.createLinearGradient(0, L.yTop, 0, L.yBot); gg.addColorStop(0, L.top || '#5c8f7f'); gg.addColorStop(1, L.bot || '#2f5348');
          ctx.fillStyle = gg; ctx.fillRect(0, L.yTop, VW, L.yBot - L.yTop);
          const wim = LA.img('wSurf');
          if (wim) { const iw = wim.naturalWidth, ih = wim.naturalHeight, off = (LA.now() / 1000 * 10) % iw; ctx.globalAlpha = 0.45; for (let xx = -off; xx < VW; xx += iw) { ctx.drawImage(wim, Math.round(xx), L.yTop - 4, iw, ih); ctx.drawImage(wim, Math.round(xx), L.yTop + 20, iw, ih); } ctx.globalAlpha = 1; }
          ctx.restore();
        }
        continue;
      }
      const im = LA.img(L.key); if (!im) continue;
      const h = L.h || 120, w = h * (im.naturalWidth / im.naturalHeight);
      const bobAt = (x) => (L.bob ? Math.sin(t * L.bob + (x || 0)) * (L.bobA || 4) : 0);
      if (L.anchor != null) {
        const ax = (L.anchor - cam) * BG_PAR;
        if (ax > -w && ax < VW + w) ctx.drawImage(im, Math.round(ax - w / 2), Math.round((L.y == null ? 120 : L.y) + (L.bob ? Math.sin(t * L.bob) * (L.bobA || 4) : 0)), Math.round(w), Math.round(h));
        continue;
      }
      if (L.range) {
        const rlen = L.range[1] - L.range[0], gap = L.gap == null ? 800 : L.gap, travel = rlen - w;
        if (travel <= 0) { const wx = (L.range[0] + L.range[1]) / 2, sx = (wx - cam) * BG_PAR; if (sx > -w && sx < VW + w) ctx.drawImage(im, Math.round(sx - w / 2), Math.round((L.y == null ? 120 : L.y) + (L.bob ? Math.sin(t * L.bob) * (L.bobA || 4) : 0)), Math.round(w), Math.round(h)); continue; }
        const span = travel + gap; let pos = (t * (L.speed == null ? 60 : L.speed) + (L.phase || 0)) % span; if (pos < 0) pos += span;
        if (pos < travel) { const wx = L.range[0] + w / 2 + pos, sx = (wx - cam) * BG_PAR; if (sx > -w && sx < VW + w) ctx.drawImage(im, Math.round(sx - w / 2), Math.round((L.y == null ? 120 : L.y) + (L.bob ? Math.sin(t * L.bob) * (L.bobA || 4) : 0)), Math.round(w), Math.round(h)); }
        continue;
      }
      const period = L.period || (VW + w + 240), speed = L.speed == null ? 24 : L.speed, par = L.par == null ? 0.5 : L.par;
      let phase = t * speed - cam * par + (L.phase || 0); phase = ((phase % period) + period) % period;
      for (let x = phase - period; x < VW + w; x += period) ctx.drawImage(im, Math.round(x - w / 2), Math.round((L.y == null ? 120 : L.y) + (L.bob ? Math.sin(t * L.bob + x * 0.01) * (L.bobA || 4) : 0)), Math.round(w), Math.round(h));
    }
  };

  // storefront facades at parallax 0.45 + the animated crews (render@1784)
  city.drawBuildings = function (ctx, cam) {
    const VW = LA.view.VW, px = cam * BG_PAR;
    for (const t of city.bgTiles) {
      const e = EDITS[t.k]; if (e && e.del) continue;
      const sc = (e && e.sc) || 1, th = t.h * sc, tw = t.w * sc, sx = t.x - px + ((e && e.dx) || 0), dy = (e && e.dy) || 0;
      if (sx + tw < -40 || sx > VW + 40) continue;
      const im = LA.img(t.k); if (!im) continue;
      ctx.drawImage(im, sx, GY - th + BG_SINK + dy, tw, th);
      if (t.k === 'bKitsoff') drawKitCrew(ctx, t, px);
      if (t.k === 'bStageConcert') drawConcertCrew(ctx, t, px);
    }
  };

  // --- Kitsoff garage press crew (444) ---
  const KIT_BAY = { x0: 0.077, x1: 0.434, y0: 0.637, y1: 0.997 }, KIT_PING = [0, 1, 2, 1];
  const KIT_CREW = [
    { base: 'npcPressDtla', at: 0.22, sc: 0.80, amp: 1.4, per: 2600, fps: 2.2, ph: 0.0 },
    { base: 'npcPressGutter', at: 0.50, sc: 0.92, amp: 1.9, per: 3100, fps: 1.8, ph: 1.7 },
    { base: 'npcPressSp', at: 0.78, sc: 0.86, amp: 1.6, per: 2300, fps: 2.6, ph: 3.4 }];
  function drawKitCrew(ctx, t, px) {
    const bx = t.x + t.w * KIT_BAY.x0, bw = t.w * (KIT_BAY.x1 - KIT_BAY.x0);
    const top = GY - t.h + BG_SINK, floor = top + t.h * KIT_BAY.y1, bh = t.h * (KIT_BAY.y1 - KIT_BAY.y0);
    const now = LA.now();
    for (const c of KIT_CREW) {
      const idx = KIT_PING[Math.floor(now / 1000 * c.fps + c.ph) % KIT_PING.length];
      const im = LA.img(c.base + '_' + idx) || LA.img(c.base); if (!im) continue;
      const hh = bh * 0.80 * c.sc, ww = hh * (im.naturalWidth / im.naturalHeight);
      const bob = Math.sin(now / c.per + c.ph) * c.amp, sway = Math.cos(now / (c.per * 1.6) + c.ph) * c.amp * 0.5;
      ctx.save(); ctx.globalAlpha = 0.94; ctx.drawImage(im, bx + bw * c.at - ww / 2 + sway - px, floor - hh + bob, ww, hh); ctx.restore();
    }
  }
  // --- PG 308 x JUST TERRY concert crew (476) ---
  const CC_CREW = [{ base: 'npcTerry', at: 0.33, sc: 1.00, fps: 1.9, ph: 0.0 }, { base: 'npcPg308', at: 0.67, sc: 1.02, fps: 1.6, ph: 2.1 }];
  const CC_DECK = { floor: 0.815, h: 0.30 };
  function drawConcertCrew(ctx, t, px) {
    const now = LA.now();
    for (const c of CC_CREW) {
      const im = city.concertStopped ? (LA.img(c.base + 'Idle') || LA.img(c.base + '_0')) : LA.img(c.base + '_' + (Math.floor(now / 1000 * c.fps + c.ph) % 6));
      if (!im) continue;
      const hh = t.h * CC_DECK.h * c.sc, ww = hh * (im.naturalWidth / im.naturalHeight), fy = GY - t.h + BG_SINK + t.h * CC_DECK.floor;
      ctx.drawImage(im, t.x + t.w * c.at - ww / 2 - px, fy - hh, ww, hh);
    }
  }

  // ground: builder tile (or his asphalt fallback) + heist plate/decals/floor bands, clipped to each
  // solid span; pits between spans read as dark voids (render@1802). Call inside a -cam translate.
  city.drawGround = function (ctx, cam, spans) {
    const VW = LA.view.VW, VH = LA.view.VH, gim = city.groundKey && LA.img(city.groundKey);
    for (const pl of spans) {
      const px = pl.x, pw = pl.w, py = GY, ph = 180;
      if (px + pw < cam - 40 || px > cam + VW + 40) continue;
      if (gim) {
        ctx.save(); ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.clip();
        const dh = 190, sc = dh / gim.naturalHeight, tw = gim.naturalWidth * sc, start = Math.floor(px / tw) * tw;
        for (let tx = start; tx < px + pw; tx += tw) ctx.drawImage(gim, tx, py, tw, dh);
        ctx.restore();
      } else {
        ctx.fillStyle = '#4a4a52'; ctx.fillRect(px, py, pw, ph);
        ctx.fillStyle = '#6b6b76'; ctx.fillRect(px, py, pw, 10);
        ctx.fillStyle = '#3a3a42'; for (let cx = px + 16; cx < px + pw - 10; cx += 48) ctx.fillRect(cx, py + 18, 3, 26);
      }
      for (const z of city.floorZones) {
        const zim = LA.img(z.key); if (!zim) continue;
        const zh = z.h || 190, zsc = zh / zim.naturalHeight, ztw = zim.naturalWidth * zsc, zx1 = z.once ? z.x0 + ztw : z.x1;
        const za = Math.max(px, z.x0), zb = Math.min(px + pw, zx1); if (zb <= za) continue;
        ctx.save(); ctx.beginPath(); ctx.rect(za, py, zb - za, ph); ctx.clip();
        if (z.once) ctx.drawImage(zim, Math.round(z.x0), py, ztw + 1, zh);
        else { const zst = Math.floor(z.x0 / ztw) * ztw; for (let ztx = zst; ztx < zb; ztx += ztw) ctx.drawImage(zim, Math.round(ztx), py, ztw + 1, zh); }
        ctx.restore();
      }
    }
    const solid = spans.slice().sort((a, b) => a.x - b.x);
    for (let i = 0; i < solid.length - 1; i++) {
      const gx = solid[i].x + solid[i].w, gw = solid[i + 1].x - gx;
      if (gw <= 0 || gx + gw < cam - 60 || gx > cam + VW + 60) continue;
      const vg = ctx.createLinearGradient(0, GY, 0, GY + 150); vg.addColorStop(0, '#2a211c'); vg.addColorStop(0.45, '#120d0e'); vg.addColorStop(1, '#050405');
      ctx.fillStyle = vg; ctx.fillRect(gx, GY, gw, VH - GY + 90);
      ctx.fillStyle = '#3a3a42'; ctx.fillRect(gx, GY, gw, 5);
      ctx.fillStyle = '#55555f'; ctx.fillRect(gx - 3, GY - 3, 6, 6); ctx.fillRect(gx + gw - 3, GY - 3, 6, 6);
    }
  };
})();
