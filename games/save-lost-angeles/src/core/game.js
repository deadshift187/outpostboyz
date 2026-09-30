// LEVEL RUNTIME — builds the world state S for a level (or the whole city for the Full City Run), ticks
// every system in a fixed order, owns lives / death / revive / checkpoints / boss arenas / level clear,
// and draws the frame in the city's layer order. Agents plug in through the hooks documented in
// ARCHITECTURE.md: LA.populate, LA.bosses, LA.setpieces, LA.shoot, LA.powers, LA.hud, LA.audio.
(function () {
  'use strict';
  const LA = window.LA, K = LA.K, GY = K.GY;

  // ---------------- entity registry ----------------
  // LA.ents.define('thief', (props, S) => ({ ...entity })).  An entity is a plain object:
  //  { kind, x, y, w, h, vx, vy, alive:true, dead:false, layer:'back'|'mid'|'front', always:false,
  //    update(S), draw(ctx,S), touch(S, player)?, onShot(S, shard)?, solid? }
  LA.ents = {
    kinds: {},
    define(name, factory) { LA.ents.kinds[name] = factory; },
    make(S, name, props) {
      const f = LA.ents.kinds[name]; if (!f) { console.warn('[ents] unknown kind', name); return null; }
      const e = f(Object.assign({ kind: name }, props || {}), S); if (!e) return null;
      if (e.kind == null) e.kind = name; if (e.alive == null) e.alive = true; if (e.vx == null) e.vx = 0; if (e.vy == null) e.vy = 0;
      if (!e.layer) e.layer = 'mid';
      return e;
    },
    add(S, name, props) { const e = typeof name === 'string' ? LA.ents.make(S, name, props) : name; if (e) S.ents.push(e); return e; },
    query(S, r, pred) { return S.ents.filter((e) => e.alive && !e.dead && LA.aabb(r, e.box ? e.box() : e) && (!pred || pred(e))); },
  };

  // ---------------- difficulty tiers (Saint's density ramp -> 3 named modes) ----------------
  LA.TIERS = {
    tourist: { id: 'tourist', label: 'TOURIST', blurb: 'just visiting', lives: 7, respawn: 'spot', density: 0.45, bossHp: 0.75, speed: 0.85 },
    local:   { id: 'local',   label: 'LOCAL',   blurb: 'you know the traffic', lives: 5, respawn: 'checkpoint', density: 0.72, bossHp: 1.0, speed: 1.0 },
    native:  { id: 'native',  label: 'NATIVE',  blurb: 'born here, still here', lives: 4, respawn: 'checkpoint', density: 1.0, bossHp: 1.2, speed: 1.08 },   // tuned: bot sweep lost 13/18 to life count at 3 lives / 1.35 HP
  };

  const game = LA.game = { run: null, S: null };

  // A run carries lives/score/crystals across levels. mode: 'level' | 'fullrun'
  game.newRun = function (opts) {
    const tier = LA.TIERS[opts.tier || 'local'];
    game.run = { mode: opts.mode || 'level', tier, players: opts.players || 1, lives: tier.lives, score: 0, crystals: 0, crystalsTotal: 0,
      saved: 0, kills: 0, deaths: 0, time: 0, startLevel: opts.levelId || '1-1', cleared: [] };
    return game.run;
  };

  // ---------------- build the world state for a level ----------------
  game.startLevel = function (levelId, opts) {
    opts = opts || {};
    const run = game.run || game.newRun({});
    const full = run.mode === 'fullrun';
    const segs = full ? LA.levels.all.slice() : [LA.levels.byId[levelId]];
    const first = segs[0], last = segs[segs.length - 1];
    const S = game.S = {
      run, tier: run.tier, mode: run.mode, level: first, segments: segs,
      x0: first.x0, x1: last.x1, t: 0, tick: 0,
      ground: [{ x: first.x0 - 600, w: last.x1 - first.x0 + 1200 }],
      potholes: [], solids: [], water: null, ents: [], floaters: [], players: [],
      arenas: segs.filter((l) => l.arena).map((l) => ({ x: l.arena.x, w: l.arena.w, boss: l.boss, level: l, sealed: false, cleared: false })),
      arena: null, boss: null, walls: [],
      goalX: full ? null : first.goalX,
      checkpoints: [].concat(...segs.map((l) => l.checkpoints)), lastCP: first.x0 + 80,
      state: 'play', stateT: 0, flags: {}, sets: {},
      fx: { flash: 0, flashCol: '#fff', dark: 0, slow: 1 },
      rng: LA.rng(LA.hash('LA:' + first.id + ':' + run.tier.id)),
      stats: { crystals: 0, saved: 0, kills: 0, time: 0, deaths: 0, stomps: 0, rescued: [] },
      banner: null,
    };
    if (opts.checkpointX) S.lastCP = opts.checkpointX;
    // content (enemies, hazards, pickups, citizens, potholes) — gameplay agent
    for (const lv of segs) { if (LA.populate) try { LA.populate(S, lv, run.tier, LA.rng(LA.hash('pop:' + lv.id + ':' + run.tier.id))); } catch (e) { console.error('[populate]', lv.id, e); } }
    // set-pieces — set-piece agent
    for (const lv of segs) for (const id of (lv.sets || [])) {
      const def = LA.setpieces && LA.setpieces.defs[id];
      if (def) try { S.sets[id + '@' + lv.id] = Object.assign({ id, level: lv }, def.init ? def.init(S, lv) || {} : {}); } catch (e) { console.error('[setpiece init]', id, e); }
    }
    // level midway checkpoints land on safe street (not over a pothole, the bay, or inside an arena)
    if (LA.setpieces && LA.setpieces.safeX) S.checkpoints = S.checkpoints.map((c) => LA.setpieces.safeX(S, c))
      .filter((c) => LA.phys.floorAt(S, c) && !(S.water && S.water(c)));   // e.g. mid-bay on the ferry: drop it
    // players
    const spawnX = S.lastCP;
    for (let i = 0; i < run.players; i++) S.players.push(new LA.Player(S, i, spawnX + i * 34));
    LA.camera.reset(S, LA.clamp(spawnX - LA.view.VW * 0.36, S.x0, S.x1 - LA.view.VW));
    S.banner = { t: 2.4, a: first.name, b: full ? 'FULL CITY RUN' : (first.sub || first.world.name), c: full ? '' : first.id };
    // preload this level's art so nothing pops in (the Full City Run streams the rest as you go)
    S.state = 'loading'; S.loadP = 0;
    for (const lv of segs) if (LA.bosses && LA.bosses.prepare) try { LA.bosses.prepare(S, lv); } catch (e) { console.error('[bosses.prepare]', e); }
    const keys = new Set(LA.city.artKeysForRange(S.x0, full ? Math.min(S.x1, S.x0 + 22000) : S.x1));
    ['golden', 'goldenHurt', 'goldenJump', 'goldenRun1', 'goldenRun2'].forEach((k) => keys.add(k));
    (S.art || []).forEach((k) => keys.add(k));                        // agents push extra keys into S.art during populate/init
    for (const e of S.ents) if (e.art) [].concat(e.art).forEach((k) => keys.add(k));
    LA.releaseArt(keys, cityKeys());                                   // free the last level's buildings (city art only)
    const t0 = LA.now();
    LA.preload(Array.from(keys), (p) => { S.loadP = p; }).then(() => {
      if (game.S !== S) return;
      const wait = Math.max(0, 350 - (LA.now() - t0));                 // never flash the card for a single frame
      setTimeout(() => { if (game.S === S && S.state === 'loading') { S.state = 'play'; S.stateT = 0; LA.emit('levelStart', S);
        LA.audio && LA.audio.music && LA.audio.music(full ? 'fullrun' : 'world' + first.w, { level: first }); } }, wait);
    });
    return S;
  };
  // look-ahead streaming: start decoding the next few screens before they're on camera
  function prefetch(S) {
    const cx = LA.camera.x, VW = LA.view.VW;
    const ahead = LA.city.artKeysForRange(cx - VW, cx + VW * 4);
    for (const k of ahead) LA.img(k);
    // Full City Run streams the whole world: keep only a window around the camera decoded
    if (S.mode === 'fullrun' && S.tick % 300 === 0) LA.releaseArt(new Set(LA.city.artKeysForRange(cx - VW * 3, cx + VW * 6)), cityKeys());
  }
  let _cityKeys = null;
  function cityKeys() { return _cityKeys || (_cityKeys = new Set(LA.city.artKeysForRange(-1e9, 1e9))); }

  // ---------------- helpers for agents ----------------
  LA.pop = (S, x, y, txt, col, big) => { S.floaters.push({ x, y, txt, col: col || '#fff', life: 1.0, big: !!big }); };
  game.addGap = (S, x, w) => {                                        // carve a real pit into the street
    const out = [];
    for (const g of S.ground) { if (x + w <= g.x || x >= g.x + g.w) { out.push(g); continue; }
      if (x > g.x) out.push({ x: g.x, w: x - g.x }); if (x + w < g.x + g.w) out.push({ x: x + w, w: g.x + g.w - (x + w) }); }
    S.ground = out;
  };
  game.score = (S, n, x, y, col) => { S.run.score += n; if (x != null) LA.pop(S, x, y, '+' + n, col || '#ffe36a'); };
  game.addCrystals = (S, n, x, y) => {
    S.run.crystals += n; S.run.crystalsTotal += n; S.stats.crystals += n;
    const ups = Math.floor(S.run.crystalsTotal / 100) - Math.floor((S.run.crystalsTotal - n) / 100);
    for (let i = 0; i < ups; i++) game.oneUp(S, x, y);
  };
  game.oneUp = (S, x, y) => { S.run.lives++; LA.pop(S, x || S.players[0].x, (y || GY - 80) - 20, '1UP!', '#57e08a', true); LA.audio && LA.audio.sfx('oneup'); };
  game.flash = (S, col, amt) => { S.fx.flash = amt || 0.6; S.fx.flashCol = col || '#fff'; };
  game.leader = (S) => S.players.filter((p) => p.active && !p.ghost).sort((a, b) => b.x - a.x)[0] || S.players[0];

  // ---------------- death / revive / lives ----------------
  game.playerDown = function (S, p, cause) {
    if (p.ghost || !p.active || S.state !== 'play') return;
    S.stats.deaths++; S.run.deaths++;
    LA.audio && LA.audio.sfx('die');
    const partner = S.players.find((q) => q !== p && q.active && !q.ghost);
    if (partner) {                                                    // Cuphead-style: become a ghost, partner revives
      p.ghost = true; p.ghostT = 9; p.vx = 0; p.vy = -1.2; p.power = null;
      if (cause === 'pit') { p.x = partner.x; p.y = GY - 140; }
      LA.pop(S, p.x, p.y - 20, p.name + ' DOWN — TOUCH TO REVIVE', '#ffd0ff');
      return;
    }
    // solo, or the last one standing went down
    S.run.lives--;
    S.state = 'dead'; S.stateT = 0; S.deadCause = cause;
    LA.emit('playerDied', { S, p, cause });
  };
  game.revive = function (S, p, by) {
    p.ghost = false; p.inv = 120; p.x = by.x + (by.face || 1) * -8; p.y = by.y; p.vx = 0; p.vy = -6;
    LA.pop(S, p.x, p.y - 24, 'REVIVED!', '#57e08a'); LA.audio && LA.audio.sfx('revive');
  };
  function respawnAll(S) {
    const spot = S.tier.respawn === 'spot' ? S.players.reduce((m, p) => Math.max(m, p.lastSafe || 0), S.lastCP) : S.lastCP;
    // dying mid-boss-fight puts you back INSIDE the sealed arena (never behind its wall)
    const x = S.arena && S.arena.sealed ? S.arena.x + 60 : Math.max(S.lastCP, spot);
    S.players.forEach((p, i) => p.respawn(S, x + i * 30));
    LA.camera.reset(S, LA.clamp(x - LA.view.VW * 0.36, S.x0, S.x1 - LA.view.VW));
    S.state = 'play';
  }

  // ---------------- boss arenas ----------------
  function sealArena(S, A) {
    A.sealed = true; S.arena = A;
    S.walls = [{ x: A.x - 16, y: GY - 400, w: 16, h: 400, kind: 'wall' }, { x: A.x + A.w, y: GY - 400, w: 16, h: 400, kind: 'wall' }];
    S.solids.push(...S.walls);
    const hpMul = S.tier.bossHp;
    S.boss = LA.bosses && LA.bosses.spawn ? LA.bosses.spawn(S, A.boss, A, { hpMul }) : null;
    if (!S.boss) { bossDefeated(S); return; }
    S.banner = { t: 2.2, a: A.boss, b: A.level.name, boss: true };
    LA.audio && LA.audio.music && LA.audio.music('boss', { boss: A.boss });
    LA.emit('bossStart', { S, arena: A, boss: S.boss });
  }
  function bossDefeated(S) {
    const A = S.arena; if (!A) return;
    A.cleared = true; A.sealed = false;
    S.solids = S.solids.filter((s) => S.walls.indexOf(s) < 0); S.walls = [];
    const name = A.boss; S.boss = null; S.arena = null;
    game.score(S, 5000);
    LA.emit('bossDefeated', { S, arena: A, name });
    if (S.mode === 'fullrun' && S.arenas.some((a) => !a.cleared)) { S.banner = { t: 2.4, a: A.level.name + ' CLEARED', b: 'KEEP MOVING' }; LA.audio && LA.audio.music('fullrun'); return; }
    levelClear(S, 'boss');
  }
  game.bossDefeated = bossDefeated;
  function levelClear(S, how) {
    if (S.state === 'clear') return;
    S.state = 'clear'; S.stateT = 0; S.clearHow = how;
    S.stats.time = S.t;
    LA.audio && LA.audio.sfx(how === 'boss' ? 'bossdown' : 'goal');
    LA.emit('levelClear', { S, level: S.level, how });
  }
  game.levelClear = levelClear;

  // ---------------- per-tick update ----------------
  game.update = function (dt) {
    const S = game.S; if (!S) return;
    const inp = LA.input;
    S.stateT += dt;
    if (S.state === 'loading') return;                                 // the level banner waits for the level to be on screen
    if (S.banner) { S.banner.t -= dt; if (S.banner.t <= 0) S.banner = null; }
    S.fx.flash = Math.max(0, S.fx.flash - dt * 2.2);
    for (const f of S.floaters) f.life -= dt * 1.1; S.floaters = S.floaters.filter((f) => f.life > 0);
    if (S.state === 'loading') return;
    if (S.tick % 20 === 0) prefetch(S);
    if (S.state === 'dead') { if (S.stateT > 1.6) { if (S.run.lives <= 0) { S.state = 'gameover'; S.stateT = 0; LA.emit('gameOver', S); } else respawnAll(S); } return; }
    if (S.state === 'gameover') return;
    if (S.state === 'clear') { for (const p of S.players) p.celebrate && p.celebrate(S, dt); return; }
    const slow = S.fx.slow || 1;
    S.t += dt; S.tick++; S.run.time += dt;
    // P2 drop-in
    if (S.players.length < 2 && inp.p2Wants()) { const l = game.leader(S); const p2 = new LA.Player(S, 1, l.x - 30); p2.inv = 90; S.players.push(p2); S.run.players = 2; LA.pop(S, p2.x, p2.y - 30, p2.name + ' JOINED!', '#8fd8ff'); LA.audio && LA.audio.sfx('join'); }
    // players
    S.players.forEach((p, i) => p.update(S, inp.p[i] || inp.p[0], dt));
    // ghost revive (partner touches the ghost)
    for (const p of S.players) if (p.ghost) {
      p.ghostT -= dt;
      const by = S.players.find((q) => q !== p && q.active && !q.ghost && LA.aabb(q, { x: p.x - 10, y: p.y - 10, w: p.w + 20, h: p.h + 20 }));
      if (by) game.revive(S, p, by);
      else if (p.ghostT <= 0) { S.run.lives--; if (S.run.lives <= 0) { S.state = 'gameover'; S.stateT = 0; LA.emit('gameOver', S); return; } const l = game.leader(S); p.respawn(S, l.x - 20); p.inv = 120; LA.pop(S, p.x, p.y - 24, '-1 LIFE', '#ff8a8a'); }
    }
    if (!S.players.some((p) => p.active && !p.ghost) && S.state === 'play') { S.run.lives--; S.state = 'dead'; S.stateT = 0; }
    // entities near the camera
    const cx = LA.camera.x, VW = LA.view.VW;
    for (const e of S.ents) {
      if (!e.alive || e.dead) continue;
      if (e.always || (e.x + (e.w || 0) > cx - 700 && e.x < cx + VW + 700)) { e.awake = true; e.update && e.update(S, dt * slow); }
    }
    // touches
    for (const p of S.players) {
      if (!p.active || p.ghost) continue;
      for (const e of S.ents) if (e.alive && !e.dead && e.touch && e.awake && LA.aabb(p, e.box ? e.box() : e)) e.touch(S, p);
    }
    // boss arena
    if (!S.arena) { const A = S.arenas.find((a) => !a.cleared && !a.sealed); if (A && S.players.some((p) => p.active && !p.ghost && p.x > A.x + 40)) sealArena(S, A); }
    if (S.boss) {
      S.boss.update(S, dt * slow);
      for (const p of S.players) if (p.active && !p.ghost && S.boss && S.boss.touch && LA.aabb(p, S.boss.box ? S.boss.box() : S.boss)) S.boss.touch(S, p);
      if (S.boss && S.boss.defeated && (S.boss.doneT == null || (S.boss.doneT -= dt) <= 0)) bossDefeated(S);
    }
    // set-pieces
    for (const k in S.sets) { const sp = S.sets[k], def = LA.setpieces.defs[sp.id]; if (def && def.update) try { def.update(S, sp, dt); } catch (e) { console.error('[setpiece]', sp.id, e); } }
    S.ents = S.ents.filter((e) => !e.dead);
    // camera, checkpoints, goal
    LA.camera.update(S);
    const lead = game.leader(S);
    for (const c of S.checkpoints) if (c > S.lastCP && lead.x > c) { S.lastCP = c; LA.pop(S, c, GY - 110, 'CHECKPOINT', '#8fd8ff', true); LA.audio && LA.audio.sfx('checkpoint'); LA.emit('checkpoint', { S, x: c }); }
    if (S.goalX != null && lead.x + lead.w > S.goalX) levelClear(S, 'goal');
    if (S.mode === 'fullrun') {                                       // district banners as you roll through
      const lv = S.segments.find((l) => lead.x >= l.x0 && lead.x < l.x1);
      if (lv && lv !== S.level) { S.level = lv; S.banner = { t: 2.2, a: lv.name, b: lv.sub || lv.world.name, c: lv.id }; LA.emit('segment', { S, level: lv }); }
      if (lead.x > S.x1 - 200 && !S.arenas.some((a) => !a.cleared)) levelClear(S, 'goal');
    }
  };

  // ---------------- draw ----------------
  game.draw = function (ctx) {
    const S = game.S; if (!S) return;
    if (S.state === 'loading') { (LA.hud && LA.hud.drawLoading ? LA.hud.drawLoading : drawLoading)(ctx, S); return; }
    const C = LA.city, cam = LA.camera, cx = cam.x;
    const t = S.t;
    C.drawSky(ctx); C.drawOcean(ctx, cx, t); C.drawScenery(ctx, cx, 'back'); C.drawBuildings(ctx, cx);
    drawSets(ctx, S, 'backdrop');
    ctx.save(); ctx.translate(-Math.round(cx - cam.shakeX), Math.round(cam.shakeY));
    C.drawGround(ctx, cx, S.ground);
    LA.drawPotholes && LA.drawPotholes(ctx, S);
    drawSets(ctx, S, 'ground');
    drawEnts(ctx, S, 'back'); drawSets(ctx, S, 'back');
    if (S.goalX != null) drawGoal(ctx, S);
    drawEnts(ctx, S, 'mid');
    if (S.boss && S.boss.draw) S.boss.draw(ctx, S);
    for (const w of S.walls) drawWall(ctx, w);
    S.players.forEach((p) => p.draw(ctx, S));
    drawEnts(ctx, S, 'front'); drawSets(ctx, S, 'front');
    drawFloaters(ctx, S);
    ctx.restore();
    C.drawScenery(ctx, cx, 'front');
    drawSets(ctx, S, 'screen');
    if (S.fx.flash > 0) { ctx.globalAlpha = Math.min(1, S.fx.flash); ctx.fillStyle = S.fx.flashCol; ctx.fillRect(0, 0, LA.view.VW, LA.view.VH); ctx.globalAlpha = 1; }
    if (LA.hud && LA.hud.draw) LA.hud.draw(ctx, S); else drawMiniHud(ctx, S);
    if (LA.bosses && LA.bosses.drawScreen) LA.bosses.drawScreen(ctx, S);     // boss HP bar + headline card on top of the HUD
  };
  function drawEnts(ctx, S, layer) {
    const cx = LA.camera.x, VW = LA.view.VW;
    for (const e of S.ents) { if (e.layer !== layer || e.dead || !e.draw) continue; const w = e.drawW || e.w || 60; if (e.x + w < cx - 160 || e.x > cx + VW + 160) continue; e.draw(ctx, S); }
  }
  function drawSets(ctx, S, layer) {
    if (!LA.setpieces) return;
    for (const k in S.sets) { const sp = S.sets[k], def = LA.setpieces.defs[sp.id]; if (def && def.draw) try { def.draw(ctx, S, sp, layer); } catch (e) { console.error('[setpiece draw]', sp.id, e); } }
  }
  function drawFloaters(ctx, S) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const f of S.floaters) {
      ctx.globalAlpha = Math.min(1, f.life * 1.6);
      ctx.font = (f.big ? 'bold 17px ' : 'bold 13px ') + LA.FONT;
      const y = f.y - 26 * (1 - f.life);
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.strokeText(f.txt, f.x, y);
      ctx.fillStyle = f.col; ctx.fillText(f.txt, f.x, y);
    }
    ctx.globalAlpha = 1;
  }
  // Goal sign text. "NOW LEAVING <district>" only when the goal really sits at that district's end (≤300 px from
  // LA.city.seg[zi][1]); when the district carries on into the next level (DTLA 3-2/3-3, SF 5-5) the sign names
  // the next stop instead ("NEXT EXIT · 3-3 / THE HISTORIC CORE / DTLA CONTINUES ▸") — Saint: "it's not over yet".
  function goalSign(S) {
    const x = S.goalX;
    if (S._goalSign && S._goalSign.x === x) return S._goalSign;
    const zi = LA.city.zoneIndexAt(x), z = LA.city.zones[zi] || {}, seg = LA.city.seg[zi], dn = z.n || S.level.name;
    let g;
    if (!seg || seg[1] - x <= 300) g = { x, a: 'NOW LEAVING', b: dn, c: 'NEXT EXIT ▸' };
    else {
      const nx = LA.LEVELS[(S.level.index != null ? S.level.index : LA.LEVELS.indexOf(S.level)) + 1];
      g = nx ? { x, a: 'NEXT EXIT · ' + nx.id, b: String(nx.sub || nx.name).toUpperCase(), c: dn + ' CONTINUES ▸' }
             : { x, a: 'CHECKPOINT', b: dn, c: 'KEEP GOING ▸' };
    }
    return (S._goalSign = g);
  }
  function drawGoal(ctx, S) {                                          // LA-style goal: a green freeway sign on a pole
    const x = S.goalX, top = GY - 230, g = goalSign(S);
    ctx.fillStyle = '#6b6f78'; ctx.fillRect(x - 4, top, 8, 230);
    ctx.fillStyle = '#0a6b3a'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - 78, top - 6, 156, 64, 8) : ctx.rect(x - 78, top - 6, 156, 64); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 11px ' + LA.FONT; ctx.fillText(g.a, x, top + 12);
    if (!g.font) {                                                     // shrink-to-fit once, cached
      let fs = 15; ctx.font = 'bold ' + fs + 'px ' + LA.FONT;
      while (fs > 10 && ctx.measureText(g.b).width > 146) { fs--; ctx.font = 'bold ' + fs + 'px ' + LA.FONT; }
      g.font = ctx.font;
    }
    ctx.font = g.font; ctx.fillText(g.b, x, top + 32);
    ctx.font = 'bold 9px ' + LA.FONT; ctx.fillText(g.c, x, top + 48);
  }
  function drawWall(ctx, w) {
    ctx.fillStyle = 'rgba(255,90,31,.18)'; ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.fillStyle = '#ff5a1f'; for (let y = w.y; y < w.y + w.h; y += 28) ctx.fillRect(w.x, y, w.w, 14);
  }
  function drawLoading(ctx, S) {
    const VW = LA.view.VW, VH = LA.view.VH, lv = S.level;
    ctx.fillStyle = '#0b0d14'; ctx.fillRect(0, 0, VW, VH);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = lv.world.col;
    ctx.font = 'bold 14px ' + LA.FONT; ctx.fillText('WORLD ' + lv.w + ' · ' + lv.world.name, VW / 2, VH / 2 - 60);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 42px ' + LA.FONT; ctx.fillText(lv.name, VW / 2, VH / 2 - 18);
    ctx.font = '15px ' + LA.FONT; ctx.fillStyle = '#c9cede'; ctx.fillText(lv.sub || '', VW / 2, VH / 2 + 20);
    const w = Math.min(360, VW - 80); ctx.fillStyle = '#262a38'; ctx.fillRect(VW / 2 - w / 2, VH / 2 + 60, w, 8);
    ctx.fillStyle = lv.world.col; ctx.fillRect(VW / 2 - w / 2, VH / 2 + 60, w * (S.loadP || 0), 8);
  }
  function drawMiniHud(ctx, S) {
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(6, 6, 250, 22);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px ' + LA.FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(`${S.level.id} ${S.level.name}  ♥${S.run.lives}  ◆${S.run.crystals}  ${S.run.score}`, 12, 17);
  }
  LA.FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
})();
