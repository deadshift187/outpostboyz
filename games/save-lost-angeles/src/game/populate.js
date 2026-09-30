// POPULATE — real level design, not random scatter. LA.populate(S, level, tier, rng) lays each level out as a
// sequence of SECTIONS (≈500–900 px beats) with a Mario rhythm:
//   intro (a safe first beat: ? crates + one lone walker)  →  teach (each new foe type appears ALONE first)
//   → test (mixes) → twist (late combos: foes on platforms over pits, hazards back-to-back with landing room)
//   with REST beats every 4th section, 3–8 RESCUES spread evenly, 1–2 POWER-GEM crates, one HIDDEN 1UP.
// Density = tier.density × each district's ZONE_MIX recipe (Saint's per-district foe/hole/fire/palm/post/
// grill/crystal rates). Enemy types come from ZONE_MIX[d].types (minus BOSS_ONLY 'tape' / NO_FOE 'cone' /
// REMOVED 'hoaB'), topped up with district-flavored extras so every level has 3+ foe types.
// Saint's placement rules (buildLevel @599): nothing over a pothole, props never on a fire or pit, landing
// room around every hazard. Clear zones: first ~520 px, checkpoints, the boss arena (arena.x-300..x1), the
// 400 px before a goal flag, and any range a set-piece reserves via setpieces.defs[id].reserve(level,S).
// Deterministic from rng — no Math.random in layout.
(function () {
  'use strict';
  const LA = window.LA, K = LA.K, GY = K.GY, GP = LA.gp;
  const C = LA.CONTENT, G = () => LA.gameplay;
  const BOSS_ONLY = new Set(C.BOSS_ONLY), NO_FOE = new Set(C.NO_FOE);
  const NO_PROP = new Set(['crankCamp', 'canSitter']);                // people / encampments are backdrop, never obstacles
  const BEACH = /BEACH|VENICE|SANTA MONICA/;
  const BS = 36;
  const PIT_OPEN = K.PIT_X, PIT_END = K.PIT_X + K.PIT_W;

  // gameplay system entity: power timers (real time), flash limiter
  LA.ents.define('gpsys', () => ({
    x: -1e9, y: -1e9, w: 0, h: 0, always: true, layer: 'back',
    update(S, dt) { const real = dt / (S.fx.slow || 1); LA.powers.tick(S, real); if (S._gpFlashT > 0) S._gpFlashT -= real; },
  }));

  // district flavor top-ups (Saint's types first; these only fill in to reach 3 types)
  function extrasFor(zi) {
    if (zi <= 4 || (zi >= 26 && zi <= 28)) return ['thief', 'dockbird', 'lobby'];
    if (zi <= 13) return ['thief', 'lobby', 'hoaC', 'cat'];
    if (zi <= 15) return ['thief', 'press', 'drone'];
    if (zi <= 19) return ['papa', 'press', 'cam', 'lobby'];
    if (zi <= 23) return ['lobby', 'thief', 'hoaA'];
    return ['press', 'papa', 'drone', 'dockbird'];
  }
  function platStyles(zi) {
    if (zi <= 2 || (zi >= 26 && zi <= 28)) return ['awning', 'shelter', 'awning'];
    if (zi <= 4) return ['scaffold', 'awning', 'scaffold'];
    if (zi <= 13) return ['awning', 'shelter', 'billboard'];
    if (zi <= 15) return ['scaffold', 'billboard', 'awning'];
    if (zi <= 23) return ['awning', 'billboard', 'shelter'];
    return ['shelter', 'billboard', 'scaffold'];
  }
  // Props must match their district: Saint's recipe put the volleyball net in the inland hills (Calabasas,
  // Hidden Hills, Encino, Bel Air) — there it becomes a rich-estate tennis ball machine / topiary instead, and
  // the sand districts get the net. City-only props (airport belts, studio booms, port containers…) never go
  // on the beach.
  const BEACH_ADD = { 'VENICE BEACH': ['net'], 'SANTA MONICA': ['net'], 'MALIBU': ['net'] };
  function propArt(zi, list) {
    const beach = G().isBeachZone(zi), name = (LA.city.zones[zi] || {}).n || '';
    let out = list.filter((k) => !NO_PROP.has(k));
    if (beach) out = out.filter((k) => !G().CITY_ONLY.has(k)).concat((BEACH_ADD[name] || []).filter((k) => out.indexOf(k) < 0));
    else out = out.map((k) => (G().BEACH_ONLY.has(k) ? (zi % 2 ? 'dsTopiary' : 'dsBallMachine') : k));
    return out.length ? out : ['meter'];
  }
  const mixCache = {};
  function zoneMix(zi) {
    if (mixCache[zi]) return mixCache[zi];
    const z = C.ZONE_MIX[zi] || C.ZONE_MIX[0];
    const primary = (z.types || []).filter((t) => !BOSS_ONLY.has(t) && !NO_FOE.has(t) && G().foeOK(t));
    const types = primary.slice();
    for (const t of extrasFor(zi)) if (types.length < 3 && types.indexOf(t) < 0) types.push(t);
    return (mixCache[zi] = {
      zi, types, primary, name: (LA.city.zones[zi] || {}).n || '',
      foe: Math.max(z.foe || 0, 0.45), hole: Math.max((z.hole || 0) + (z.hole2 || 0), 0.55), fire: Math.max(z.fire || 0, 0.12),
      palm: z.palm || 0, post: z.post != null ? z.post : 0.35, postArt: propArt(zi, z.postArt || ['meter']),
      cones: (z.types || []).indexOf('cone') >= 0, grill: z.grill || 0, crys: z.crystals || 1, folk: z.folk || 0.5,
    });
  }
  const DIFF = (t) => (G().FOES[t] || {}).diff || 3;
  const PIT_RATE = { tourist: 0.55, local: 0.85, native: 1.1 };

  LA.populate = function (S, lv, tier, rng) {
    GP.art(S, []);
    if (!S._gpSys) { S._gpSys = LA.ents.add(S, 'gpsys', {}); }
    GP.art(S, ['pothole', 'fire', 'palm', 'palmBurn', 'palmTopArt', 'obCone', 'grill3', 'gemArt'].concat(C.CRYS_ART, Object.values(C.GEMART)));

    const x0 = lv.x0 + 520;
    const xEnd = lv.arena ? lv.arena.x - 300 : (lv.goalX != null ? lv.goalX - 400 : lv.x1 - 400);
    if (xEnd - x0 < 250) return;
    const span = xEnd - x0;

    // ---------- reservations ----------
    const reserved = [];
    for (const cp of lv.checkpoints || []) reserved.push([cp - 200, cp + 240]);
    for (const id of lv.sets || []) {
      const def = LA.setpieces && LA.setpieces.defs && LA.setpieces.defs[id];
      if (def && typeof def.reserve === 'function') { try { for (const r of def.reserve(lv, S) || []) reserved.push([r[0], r[1]]); } catch (e) { console.error('[populate reserve]', id, e); } }
    }
    reserved.sort((a, b) => a[0] - b[0]);
    const inReserve = (a, b) => reserved.some((r) => r[1] > a && r[0] < b);

    // ---------- occupancy (ground footprint) ----------
    const occ = [];
    // scenery props ('prop') now keep clear of every other ground thing too (they used to only dodge pits and
    // fires, so a net could sit on a bus bench, a meter on a cone…); 'struct' = a bus-shelter body (glass wall,
    // bench, ad panel drawn to the street); 'palm' = the burning palm's tall crown (never under a deck/blocks).
    const CONF = {
      pit: { pit: 1, fire: 1, solid: 1, post: 1, cone: 1, foe: 1, folk: 1, prop: 1 },
      fire: { pit: 1, fire: 1, solid: 1, post: 1, cone: 1, folk: 1, foe: 1, prop: 1, struct: 1 },
      solid: { pit: 1, fire: 1, solid: 1, post: 1, over: 1, folk: 1, cone: 1, foe: 1, prop: 1, struct: 1 },
      post: { pit: 1, fire: 1, solid: 1, post: 1, prop: 1, cone: 1 },
      cone: { pit: 1, fire: 1, solid: 1, cone: 1, folk: 1, prop: 1, foe: 1, post: 1, struct: 1 },
      prop: { pit: 1, fire: 1, solid: 1, post: 1, cone: 1, folk: 1, prop: 1, struct: 1 },
      foe: { pit: 1, fire: 1, solid: 1, cone: 1 },
      folk: { pit: 1, fire: 1, solid: 1, cone: 1, prop: 1 },
      over: { solid: 1 },
      struct: { solid: 1, prop: 1, fire: 1, cone: 1 },
      tall: { over: 1 },                                               // extra test for props/palms that reach a deck
    };
    const SAFE_TYPES = { prop: 1, over: 1, post: 1, struct: 1, tall: 1 };
    function free(a, b, t) {
      if (a < x0 - 60 || b > xEnd + 60) return false;
      if (!SAFE_TYPES[t] && inReserve(a, b)) return false;
      const bad = CONF[t];
      for (const o of occ) if (o.b > a && o.a < b && bad[o.t]) return false;
      return true;
    }
    const take = (a, b, t) => { occ.push({ a, b, t }); };

    // ---------- primitive placers ----------
    const foes = [], stats = { threats: 0, pits: 0, crystals: 0, folks: 0, gems: 0, blocks: 0, plats: 0, oneups: 0 };
    let crysC = 0;
    function crystal(cx, cy) { LA.ents.add(S, 'crystal', { x: cx - 11, y: cy - 11, c: (crysC++) % 5 }); stats.crystals++; }
    function crystalLine(x, y, n, dx) { for (let i = 0; i < n; i++) crystal(x + i * (dx || 30), y); }
    function crystalArc(xa, xb, baseY, peak, n, skip) {
      for (let i = 0; i < n; i++) { const t = n === 1 ? 0.5 : i / (n - 1), x = xa + (xb - xa) * t, y = baseY - peak * 4 * t * (1 - t);
        if (skip && x > skip.x - 14 && x < skip.x + skip.w + 14 && y > skip.y - 14 && y < skip.y + skip.h + 14) continue; crystal(x, y); }
    }
    function pothole(x) {
      if (!free(x - 70, x + 64 + 70, 'pit')) return false;
      S.potholes.push(x); take(x - 70, x + 64 + 70, 'pit'); stats.pits++; return true;
    }
    function tryPothole(xa, xb) {                                      // first free pothole spot in [xa,xb]
      for (let x = xa; x <= xb - 64; x += 24) if (pothole(Math.round(x))) return Math.round(x);
      return null;
    }
    function foe(type, x, opts) {
      opts = opts || {};
      const sp = G().FOES[type]; if (!sp) return null;
      if (!opts.floorY && !sp.fly && !free(x - 6, x + sp.w + 6, 'foe')) return null;
      const e = G().spawnFoe(S, type, x, Object.assign({ dir: rng() < 0.5 ? -1 : 1, seed: foes.length + lv.index * 7 }, opts));
      if (!e) return null;
      if (!opts.floorY && !sp.fly) take(x - 4, x + sp.w + 4, 'foe');
      e._plat = opts.plat || null; foes.push(e); stats.threats++;
      return e;
    }
    function fire(x) { if (!free(x - 12, x + 56, 'fire')) return false; LA.ents.add(S, 'fire', { x, t: rng() * 6 }); take(x - 12, x + 56, 'fire'); stats.threats++; return true; }
    function palm(x, kind) {
      if (!free(x - 60, x + 48 + 60, kind === 'full' ? 'solid' : 'fire') || !free(x - 20, x + 68, 'tall')) return false;   // crown never through a deck
      LA.ents.add(S, 'palm', { x, kind, t: rng() * 6 }); take(x - 60, x + 48 + 60, kind === 'full' ? 'solid' : 'fire'); stats.threats++; return true;
    }
    function propFits(k, x, pw) {                                     // district context at the prop's REAL x (sections straddle borders)
      const zi = LA.city.zoneIndexAt(x + pw / 2), beach = G().isBeachZone(zi);
      if (G().BEACH_ONLY.has(k) && !beach) return false;
      if (G().CITY_ONLY.has(k) && beach) return false;
      return true;
    }
    // tennis ball machine = a turret HAZARD now (hazards.js 'ballMachine'), not scenery. Kept ≥ 900 px apart so the
    // estate districts don't turn into a ball-machine gauntlet; a spot too close to the last one gets a topiary.
    let lastBM = -1e9;
    function ballMachine(x) {
      const [bw] = G().propDims('dsBallMachine');
      if (!propFits('dsBallMachine', x, bw)) return false;
      if (Math.abs(x - lastBM) < 900) return prop('dsTopiary', x);
      if (!free(x - 50, x + bw + 50, 'fire')) return false;
      LA.ents.add(S, 'ballMachine', { x, flip: rng() < 0.5, seed: rng() * 10 }); take(x - 30, x + bw + 30, 'fire');
      GP.art(S, 'dsBallMachine'); stats.threats++; lastBM = x; return true;
    }
    function prop(k, x) {
      if (k === 'dsBallMachine') return ballMachine(x);
      const [pw, ph] = G().propDims(k), hurdle = G().isHurdle(k);
      const t = hurdle ? 'solid' : 'prop';
      const pad = hurdle ? 50 : 18;                                   // scenery keeps a little air around it too
      if (!propFits(k, x, pw)) return false;
      if (!free(x - pad, x + pw + pad, t)) return false;
      if (ph - 7 > 84 && !free(x - 6, x + pw + 6, 'tall')) return false;   // anything reaching a low deck (GY-96) / block row (GY-86) stays out from under it
      LA.ents.add(S, 'prop', { k, x, flip: rng() < 0.3 }); take(x - (hurdle ? 30 : 6), x + pw + (hurdle ? 30 : 6), t); GP.art(S, k); return true;
    }
    function cone(x) { const cw = 48; if (!free(x - 20, x + cw + 20, 'cone')) return false; LA.ents.add(S, 'cone', { x, flip: rng() < 0.5 }); take(x - 10, x + cw + 10, 'cone'); return true; }
    function plat(style, x, y, w, v) {
      w = Math.max(80, Math.round(w / 10) * 10);
      const postXs = style === 'scaffold' ? [] : style === 'billboard' ? [x + w * 0.22, x + w * 0.78 - 10] : [x + 8, x + w - 14];
      if (style === 'scaffold') { const bays = Math.max(1, Math.round(w / 70)); for (let i = 0; i <= bays; i++) postXs.push(x + Math.min(w - 8, Math.max(1, i * w / bays - 3))); }
      for (const px of postXs) if (!free(px - 4, px + 14, 'post')) return null;
      if (style === 'shelter' && !free(x, x + w, 'struct')) return null;
      for (const px of postXs) take(px - 2, px + 12, 'post');
      if (style === 'shelter') take(x, x + w, 'struct');
      take(x, x + w, 'over');
      stats.plats++;
      return LA.ents.add(S, 'plat', { style, x, y, w, v: v != null ? v : Math.floor(rng() * 11) });
    }
    function block(x, y, kind, item) { stats.blocks++; if (item && item.indexOf('gem:') === 0) stats.gems++; if (item === 'oneup') stats.oneups++; return LA.ents.add(S, 'block', { x, y, kind, item }); }
    function blockRow(x, pattern, item) {                              // pattern e.g. 'BQBQB'; item goes in the middle-most Q
      const y = GY - 122; take(x, x + pattern.length * BS, 'over');
      const qs = []; for (let i = 0; i < pattern.length; i++) if (pattern[i] === 'Q') qs.push(i);
      const special = qs.length ? qs[Math.floor(qs.length / 2)] : -1;
      for (let i = 0; i < pattern.length; i++) {
        const c = pattern[i];
        if (c === 'Q') block(x + i * BS, y, 'q', i === special && item ? item : (rng() < 0.2 ? 'multi' : 'crystal'));
        else block(x + i * BS, y, 'brick');
      }
      return { x, y, w: pattern.length * BS };
    }

    // ---------- type choice: teach -> test ----------
    const introduced = new Set();
    let taughtThisSection = false;
    function chooseType(Z, opts) {
      opts = opts || {};
      let pool = Z.types.filter((t) => (opts.ground ? !G().FOES[t].fly : true) && (opts.walker ? ['walk', 'armor', 'shell', 'dash', 'flash', 'boom', 'report', 'toss'].indexOf(G().FOES[t].beh) >= 0 : true));
      if (!pool.length) pool = ['thief'];
      const fresh = pool.filter((t) => !introduced.has(t)).sort((a, b) => DIFF(a) - DIFF(b));
      if (fresh.length && !taughtThisSection && !opts.noTeach) { taughtThisSection = true; introduced.add(fresh[0]); return { t: fresh[0], teach: true }; }
      const known = pool.filter((t) => introduced.has(t));
      const src = known.length ? known : pool;
      let tot = 0; for (const t of src) tot += Z.primary.indexOf(t) >= 0 ? 2 : 1;
      let r = rng() * tot;
      for (const t of src) { r -= Z.primary.indexOf(t) >= 0 ? 2 : 1; if (r <= 0) { introduced.add(t); return { t }; } }
      introduced.add(src[0]); return { t: src[0] };
    }
    function placeFoe(Z, x, opts) {
      opts = opts || {};
      if (!opts.foeOnly) {                                             // the district's own hazards share the threat budget
        const r = rng(), pf = Z.fire * 0.45, pp = Z.palm * 0.35;
        if (r < pf) { for (let dx = 0; dx < 120; dx += 30) if (fire(x + dx)) { crystalArc(x + dx - 30, x + dx + 74, GY - 30, 70, 4); return true; } }
        else if (r < pf + pp) { for (let dx = 0; dx < 120; dx += 30) if (palm(x + dx, rng() < 0.5 ? 'full' : 'top')) return true; }
      }
      const c = chooseType(Z, opts), sp = G().FOES[c.t];
      if (sp.fly) return foe(c.t, x, { baseY: c.t === 'drone' ? GY - 150 - rng() * 30 : GY - 92 - rng() * 40 });
      for (let dx = 0; dx < 160; dx += 20) { const e = foe(c.t, x + dx); if (e) return e; }
      return null;
    }

    // ---------- scattered crystals + props (Saint's per-block rolls) ----------
    function scatter(sx, len, Z, dense) {
      const n = Math.round((len / 415) * (1 + rng() * 1.6) * Z.crys * (dense ? 1.3 : 0.7));
      for (let i = 0; i < n; i++) { const lo = rng() < 0.6; crystal(sx + 40 + rng() * (len - 80), lo ? GY - 16 - rng() * 16 : GY - 16 - (34 + rng() * 95)); }
    }
    function clutter(sx, len, Z) {
      const n = Math.floor((len / 415) * Z.post + rng());
      for (let i = 0; i < n; i++) {
        const k = Z.postArt[Math.floor(rng() * Z.postArt.length)];
        if (k === 'obCone') { cone(sx + 40 + rng() * (len - 120)); continue; }
        const [pw] = G().propDims(k);
        let placed = false;
        for (let tries = 0; tries < 4 && !placed; tries++) placed = prop(k, Math.round(sx + 30 + rng() * Math.max(1, len - pw - 60)));
      }
      if (Z.cones && rng() < 0.3) cone(sx + 60 + rng() * (len - 140));
      if (Z.grill && rng() < Z.grill * len / 415 * 0.4) { for (let tries = 0; tries < 3; tries++) if (prop('grill3', Math.round(sx + 60 + rng() * (len - 150)))) break; }
    }

    // ---------- section builders ----------
    const pick = (arr) => arr[Math.floor(rng() * arr.length)];
    const B = {};
    B.intro = function (sx, len, Z) {
      const bx = Math.round(sx + len * 0.38);
      blockRow(bx, pick(['QBQB', 'BQBQB', 'QQ']), null);
      crystalLine(sx + 40, GY - 18, 4, 30);
      taughtThisSection = false;
      placeFoe(Z, Math.round(sx + len * 0.78), { ground: true, walker: true, foeOnly: true });
      clutter(sx, len * 0.35, Z);
    };
    B.street = function (sx, len, Z, n, np) {
      const slots = n + np; if (!slots) { scatter(sx, len, Z, true); clutter(sx, len, Z); return; }
      const step = len / (slots + 1);
      const kinds = []; for (let i = 0; i < n; i++) kinds.push('f'); for (let i = 0; i < np; i++) kinds.push('p');
      for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = kinds[i]; kinds[i] = kinds[j]; kinds[j] = t; }
      kinds.forEach((kd, i) => {
        const x = Math.round(sx + step * (i + 1) + (rng() - 0.5) * step * 0.3);
        if (kd === 'p') { const px = tryPothole(x - 40, x + 100); if (px != null && rng() < 0.7) crystalArc(px - 34, px + 98, GY - 24, 78, 5); }
        else if (rng() < Z.fire * 0.35 && fire(x)) { /* a trash fire in the lineup */ }
        else placeFoe(Z, x);
      });
      scatter(sx, len, Z); clutter(sx, len, Z);
    };
    B.pits = function (sx, len, Z, n, np, opt) {
      np = opt && opt.oneup ? 1 : Math.max(1, np);
      let x = sx + 60; const placed = [];
      for (let i = 0; i < np && x < sx + len - 120; i++) { const px = tryPothole(x, Math.min(sx + len - 64, x + 140)); if (px == null) break; placed.push(px); x = px + 64 + 150 + rng() * 60; }
      let secret = null;
      if (opt && opt.oneup && placed.length) {                          // hidden 1UP on the landing side of the first pit (never in a jump arc)
        const px = placed[0]; secret = { x: px + 64 + 96, y: GY - 106 - BS, w: BS, h: BS };
        block(secret.x, secret.y, 'hidden', 'oneup'); take(secret.x, secret.x + BS, 'over'); take(secret.x - 130, secret.x + BS + 70, 'post');   // keep its runway pit-free
      }
      for (const px of placed) crystalArc(px - 34, px + 98, GY - 24, 80, 5, secret);
      let left = n;
      if (left > 0 && placed.length) {
        const fly = Z.types.filter((t) => G().FOES[t].fly);
        if (fly.length && rng() < 0.7) { const t = pick(fly); const px = placed[Math.floor(placed.length / 2)]; if (foe(t, px + 8, { baseY: t === 'drone' ? GY - 160 : GY - 100 })) left--; }
      }
      for (let i = 0; i < left; i++) { const gx = placed.length > i ? placed[i] + 64 + 80 : sx + len * (0.3 + 0.4 * i); placeFoe(Z, Math.round(gx), { ground: true }); }
      scatter(sx, len, Z); clutter(sx, len, Z);
    };
    B.platforms = function (sx, len, Z, n, np, opt) {
      const style = pick(platStyles(Z.zi).filter((s) => s !== 'billboard').concat(['awning']));
      const w1 = 150 + Math.floor(rng() * 5) * 20, px1 = Math.round(sx + 70 + rng() * 60);
      const p1 = plat(style, px1, GY - 96, w1);
      let p2 = null;
      if (p1 && len > 520) { const w2 = 130 + Math.floor(rng() * 3) * 20; p2 = plat(style === 'shelter' ? 'awning' : style, px1 + w1 + 50, GY - 178, w2); }
      if (p1) crystalLine(p1.x + 20, p1.y - 22, Math.floor((p1.w - 20) / 30), 30);
      if (p2) crystalLine(p2.x + 16, p2.y - 22, Math.floor((p2.w - 16) / 30), 30);
      const top = p2 || p1;
      if (top && (rng() < 0.55 || (opt && opt.gem))) block(Math.round(top.x + top.w / 2 - BS / 2), top.y - 70 - BS, 'q', opt && opt.gem ? 'gem:' + opt.gem : (rng() < 0.4 ? 'multi' : 'crystal'));
      let left = n;
      if (left > 0 && p1 && rng() < 0.65) {                           // a patroller up on the canopy
        const c = chooseType(Z, { ground: true, walker: true, noTeach: true });
        if (foe(c.t, p1.x + p1.w / 2, { floorY: p1.y, plat: p1 })) left--;
      }
      if (np && p1) tryPothole(p1.x + 30, p1.x + p1.w - 30);          // pit under the canopy: take the high road
      for (let i = 0; i < left; i++) placeFoe(Z, Math.round(sx + len * (0.55 + 0.3 * i)), { ground: true });
      scatter(sx, len, Z, false); clutter(sx, len, Z);
    };
    B.blocks = function (sx, len, Z, n, np, opt) {
      const pat = pick(['BQBQB', 'QQQ', 'BBQBB', 'QBQ', 'BQQB']);
      const bx = Math.round(sx + len * 0.3 + rng() * 60);
      const row = blockRow(bx, pat, opt && opt.gem && pat.length <= 3 ? 'gem:' + opt.gem : null);
      if (pat.length >= 4 && (rng() < 0.6 || (opt && opt.gem))) {
        const ux = row.x + Math.floor(pat.length / 2) * BS;
        block(ux, row.y - 100 - BS, 'q', opt && opt.gem ? 'gem:' + opt.gem : 'multi');
      }
      crystalLine(row.x + 10, row.y - 20, Math.max(2, Math.floor(row.w / 30)), 30);
      if (np) tryPothole(row.x - 150, row.x - 60);
      for (let i = 0; i < n; i++) placeFoe(Z, Math.round(row.x + row.w * (i ? 1.2 : 0.4)), { ground: true });
      scatter(sx, len * 0.5, Z); clutter(sx + len * 0.6, len * 0.4, Z);
    };
    B.catwalk = function (sx, len, Z, n, np) {
      const step = plat(pick(['awning', 'shelter']), Math.round(sx + 40), GY - 92, 110);
      const cw = Math.min(420, Math.max(260, len - 260));
      const cat = plat('billboard', Math.round(sx + 200), GY - 172, cw);
      if (!cat) { B.street(sx, len, Z, n, np); return; }
      crystalLine(cat.x + 24, cat.y - 22, Math.floor((cat.w - 30) / 32), 32);
      const pits = Math.max(1, np);
      for (let i = 0; i < pits; i++) tryPothole(Math.round(cat.x + 40 + i * 160), Math.round(cat.x + cat.w - 40));
      let left = n;
      const fly = Z.types.filter((t) => G().FOES[t].fly);
      if (left > 0 && fly.length) { const t = pick(fly); if (foe(t, cat.x + cat.w / 2, { baseY: t === 'drone' ? GY - 250 : GY - 110 })) left--; }
      if (left > 0) { const c = chooseType(Z, { ground: true, walker: true, noTeach: true }); if (foe(c.t, cat.x + cat.w * 0.6, { floorY: cat.y, plat: cat })) left--; }
      for (let i = 0; i < left; i++) placeFoe(Z, Math.round(cat.x + cat.w * (0.3 + 0.4 * i)), { ground: true });
      if (!step) crystalLine(sx + 40, GY - 18, 3);
    };
    B.hazard = function (sx, len, Z, n, np) {
      const opts = [];
      let x = sx + 60;
      const tot = Math.max(1, n);
      for (let i = 0; i < tot && x < sx + len - 100; i++) {
        const r = rng(); let ok = false;
        const want = r < 0.45 ? 'fire' : r < 0.45 + Z.palm * 0.6 ? 'palm' : r < 0.85 ? 'fire' : 'foe';
        for (let tries = 0; tries < 6 && !ok; tries++) {
          const xx = Math.round(x + tries * 30);
          if (want === 'fire') ok = fire(xx);
          else if (want === 'palm') ok = palm(xx, rng() < 0.5 ? 'full' : 'top');
          else ok = !!placeFoe(Z, xx, { ground: true, foeOnly: true });
          if (ok) { if (want === 'fire') crystalArc(xx - 30, xx + 74, GY - 30, 70, 4); else if (want === 'palm') crystalLine(xx + 4, GY - 190, 2, 40); x = xx + 180 + rng() * 80; }
        }
        if (!ok) x += 120;
      }
      if (np) tryPothole(Math.round(sx + len * 0.5), Math.round(sx + len - 70));
      if (rng() < 0.6) { if (Z.grill) prop('grill3', Math.round(sx + len * 0.7)); else cone(Math.round(sx + len * 0.75)); }
      scatter(sx, len, Z); clutter(sx, len, Z);
    };
    B.stairs = function (sx, len, Z, n) {
      const steps = [];
      for (let i = 0; i < 3; i++) { const s = plat('scaffold', Math.round(sx + 60 + i * 120), GY - 84 - i * 80, 110); if (!s) break; steps.push(s); }
      if (!steps.length) { B.street(sx, len, Z, n, 0); return; }
      const top = steps[steps.length - 1];
      crystalLine(top.x + 12, top.y - 22, 4, 28);
      if (steps.length === 3) { crystalArc(top.x + top.w, top.x + top.w + 180, top.y - 20, 40, 5); block(Math.round(top.x + top.w / 2 - BS / 2), top.y - 74 - BS, 'q', rng() < 0.5 ? 'multi' : 'crystal'); }
      for (let i = 0; i < n; i++) placeFoe(Z, Math.round(sx + 80 + i * 200), { ground: true, walker: true });
      clutter(sx + len * 0.6, len * 0.4, Z);
    };
    let folkN = 0;
    const skinBase = Math.floor(rng() * 6);
    B.rescue = function (sx, len, Z, n, np) {
      const cx = Math.round(sx + Math.min(len * 0.4, len - 170));
      if (!free(cx - 4, cx + 24, 'folk')) { for (let d = 30; d < 200; d += 30) { if (free(cx + d - 4, cx + d + 24, 'folk')) { return B.rescueAt(sx, len, Z, n, np, cx + d); } } return; }
      return B.rescueAt(sx, len, Z, n, np, cx);
    };
    B.rescueAt = function (sx, len, Z, n, np, cx) {
      const variant = len > 420 ? pick(['open', 'shelter', 'hazard', 'open']) : 'open';
      if (variant === 'shelter') plat('shelter', cx - 50, GY - 96, 150);
      take(cx - 4, cx + 24, 'folk');
      const crookPool = Z.types.filter((t) => ['walk', 'armor', 'dash', 'boom', 'flash'].indexOf(G().FOES[t].beh) >= 0);
      const crookType = crookPool.length && rng() < 0.4 ? pick(crookPool) : (Z.types.indexOf('cat') >= 0 && rng() < 0.35 ? 'cat' : 'thief');
      introduced.add(crookType);
      const g = foe(crookType, cx + 50, { crook: true, minX: cx + 30, maxX: cx + 108 });
      if (!g) return;
      g.crook = true;
      const beach = BEACH.test(Z.name) && rng() < 0.45;
      const gem = pick(['grow', 'grow', 'grow', 'blast', 'blast', 'vibes', 'vibes', 'chill', 'gold', 'gold']);
      LA.ents.add(S, 'folk', { x: cx, guard: g, gem, level: lv.id, artKey: beach ? (rng() < 0.5 ? 'folkVenGirl' : 'folkVenGirl2') : null,
        look: G().folkLook(rng, skinBase + folkN * 2 + (folkN % 2)) });
      if (beach) GP.art(S, ['folkVenGirl', 'folkVenGirl2']);
      folkN++; stats.folks++;
      if (variant === 'hazard' && n > 1) { if (!fire(cx - 170)) tryPothole(cx - 200, cx - 110); }
      crystalLine(cx - 110, GY - 18, 3, 28);
      if (len > 480) clutter(sx + len * 0.75, len * 0.25, Z);
    };
    B.rest = function (sx, len, Z) {
      const r = rng();
      if (r < 0.5) { const p = plat(pick(['shelter', 'awning']), Math.round(sx + len * 0.35), GY - 96, 150 + Math.floor(rng() * 3) * 20); if (p) crystalLine(p.x + 20, p.y - 22, Math.floor((p.w - 20) / 30)); }
      else crystalArc(sx + len * 0.25, sx + len * 0.75, GY - 20, 100 + rng() * 40, 7);
      crystalLine(sx + 40, GY - 18, 4, 30);
      clutter(sx, len, Z);
    };

    // ---------- the plan ----------
    const nFolk = span >= 860 ? LA.clamp(Math.round(span / 1800) + 2, 3, 8) : Math.max(1, Math.floor(span / 300));
    const folkAt = []; for (let i = 0; i < nFolk; i++) folkAt.push(x0 + span * ((i + 0.6) / (nFolk + 0.2)));
    const nGem = tier.id === 'tourist' ? 2 : tier.id === 'native' ? 1 : (rng() < 0.5 ? 1 : 2);
    const gemAt = nGem === 2 ? [x0 + span * 0.22, x0 + span * 0.62] : [x0 + span * 0.4];
    const gemKinds = ['grow', 'blast', 'gold', 'vibes', 'chill'];
    const oneupAt = x0 + span * (0.45 + rng() * 0.25);
    const oneupReach = span < 1600;                                     // tiny boss levels: the secret sits in the last beat
    const base = 2.35 * tier.density;
    let acc = 0.35, pitAcc = 0.3, x = x0, idx = 0, last = '';
    let fi = 0, gi = 0, oneupDone = false;
    while (x < xEnd - 150) {
      const r = reserved.find((q) => x >= q[0] && x < q[1]); if (r) { x = r[1]; continue; }
      const nextR = reserved.find((q) => q[0] > x);
      const Z = zoneMix(LA.city.zoneIndexAt(x + 200));
      let type, opt = {};
      const t = (x - x0) / span;
      if (idx === 0) type = 'intro';
      else if (fi < folkAt.length && x + 300 >= folkAt[fi]) { type = 'rescue'; fi++; }
      else if (gi < gemAt.length && x >= gemAt[gi]) { type = rng() < 0.6 ? 'blocks' : 'platforms'; opt.gem = gemKinds[Math.floor(rng() * gemKinds.length)]; gi++; }
      else if (!oneupDone && (x >= oneupAt || (oneupReach && x > xEnd - 700))) { type = 'pits'; opt.oneup = true; oneupDone = true; }
      else if (idx % 4 === 3) type = 'rest';
      else {
        const hz = (Z.fire + Z.palm) * 1.5;
        const menu = t < 0.3 ? { street: 3, pits: 2, platforms: 2, blocks: 2, hazard: 0.5 + hz }
          : t < 0.66 ? { street: 2, pits: 2, platforms: 2, blocks: 1.5, catwalk: 1.5, hazard: 1 + hz, stairs: 1 }
            : { street: 2, pits: 2, platforms: 1.5, catwalk: 2, hazard: 1 + hz, stairs: 1, blocks: 1 };
        let tot = 0; for (const k in menu) if (k !== last) tot += menu[k];
        let q = rng() * tot; type = 'street';
        for (const k in menu) { if (k === last) continue; q -= menu[k]; if (q <= 0) { type = k; break; } }
      }
      let len = type === 'intro' ? 700 : type === 'rescue' ? 380 + Math.floor(rng() * 4) * 40 : type === 'rest' ? 480 + Math.floor(rng() * 3) * 40
        : type === 'catwalk' ? 720 + Math.floor(rng() * 3) * 60 : 560 + Math.floor(rng() * 6) * 60;
      if (span < 1600) len = Math.min(len, Math.max(300, Math.round(span / (nFolk + 1))));
      len = Math.min(len, xEnd - x);
      if (nextR) len = Math.min(len, nextR[0] - x);
      if (len < 260) { x += Math.max(len, 60); continue; }
      const f = 0.55 + 0.6 * Z.foe;
      let n = 0, np = 0;
      if (type !== 'rest') {
        acc += (len / 1067) * base * f; n = Math.floor(acc); acc -= n;
        pitAcc += len * (Z.hole / 415) * 0.42 * (PIT_RATE[tier.id] || 0.85); np = Math.floor(pitAcc); pitAcc -= np;
      }
      if (type === 'rescue') n = Math.max(1, n);
      if (type === 'intro') { n = 1; np = 0; }
      taughtThisSection = false;
      if (t > 0.66 && n >= 2 && type === 'street' && rng() < 0.5) type = 'platforms';       // twist: take the fight vertical
      try { B[type](Math.round(x), Math.round(len), Z, n, np, opt); } catch (e) { console.error('[populate section]', type, lv.id, e); }
      last = type; x += len; idx++;
    }

    // ---------- no crystal buried inside a solid (blocks, hurdles, engulfed palms) ----------
    const hard = S.solids.filter((s) => !s.oneway && !s.deck && s.x < xEnd + 300 && s.x + s.w > lv.x0);
    for (const e of S.ents) {
      if (e.kind !== 'crystal' || e.x < lv.x0 || e.x > xEnd + 300) continue;
      for (const s of hard) if (LA.aabb(e, s)) { e.dead = true; stats.crystals--; break; }
    }
    S.ents = S.ents.filter((e) => !e.dead);

    // ---------- patrol ranges (after everything that blocks the street exists) ----------
    const lo = lv.x0 + 420, hi = xEnd + 220;
    const blocked = (a, b) => {
      if (!LA.phys.floorAt(S, a + 2) || !LA.phys.floorAt(S, b - 2)) return true;
      for (const s of S.solids) { if (s.oneway || s.deck || s.kind === 'block') continue; if (s.x < b && s.x + s.w > a && s.y < GY - 2) return true; }
      return a < lo || b > hi;
    };
    function scan(e, dir, R) {
      let last = e.x;
      for (let d = 4; d <= R; d += 4) { const nx = e.x + dir * d; if (blocked(nx, nx + e.w)) break; last = nx; }
      return last;
    }
    for (const e of foes) {
      if (e.fly) { const R = 150 + (e.x % 60); e.minX = Math.max(lo, e.x - R); e.maxX = Math.min(hi, e.x + R); continue; }
      if (e._plat) { e.minX = e._plat.x + 4; e.maxX = e._plat.x + e._plat.w - e.w - 4; if (e.beh === 'shell') { e.platX0 = e._plat.x; e.platX1 = e._plat.x + e._plat.w; } continue; }
      const R = e.crook ? 110 : ({ dash: 230, shell: 170, toss: 70, heavy: 130, flashhop: 150, report: 130 }[e.beh] || 150);
      let mn = scan(e, -1, R), mx = scan(e, 1, R);
      if (e.crook) { mn = Math.max(mn, e.minX); mx = Math.min(mx, e.maxX); if (mx < mn) mx = mn; }
      e.minX = mn; e.maxX = mx;
    }

    S._gpStats = S._gpStats || {};
    S._gpStats[lv.id] = Object.assign(stats, { span: Math.round(span), foes: foes.length, types: Array.from(introduced) });
  };
})();
