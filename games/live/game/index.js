/**
 * GAME ENTRY POINT: CLIMB OR DIE (design/CLIMB-OR-DIE.md). The platform
 * (public/platform/main.js) loads this file and calls createGame():
 *
 *   createGame({ W, H, transparent, sound, store, storage, mute, activityPing, streamerKeys }) -> {
 *     (web-edition opts, defaults = streamer app: activityPing true -> gamepad pings /api/activity;
 *      storage = store.js backend {load,save,clip}, default remote /api/climb-or-die + /api/clip;
 *      streamerKeys true -> F1/F9/F10 + Select+Start PANIC bound and shown)
 *     onEvent(evt, map)  // every normalized event + its gifts.json mapping; we rewrite
 *                        //   map.label (team-resolved effect name) and map.sound (we synth our own)
 *     update(dt)         // seconds, capped at 1/30
 *     render(ctx)        // 1080x1920; top 520 px kept clear for the host camera
 *     reset()            // sim "reset" button: fresh run
 *     newSession()       // fresh session (board keeps the old one's deltas); stops loops, keeps the AudioContext
 *     onIdle(s) / onActive(s)   // server idle watchdog -> ON BREAK screen
 *     onConfig(giftMap)  // gifts.json (+ hot reload): reads the "climb-or-die" section
 *     overlayLayout      // where the platform feed / pill / whale banner go
 *   }
 *
 * Modules: consts, world (tower + zone hazards), climber (PATCH), effects (gifts,
 * caps, heat, lightning, teams), render + art (procedural pixel art), sfx (WebAudio),
 * input (keyboard + gamepad), store (persistent leaderboard). DOM-free core: runs
 * headless in Node for tests (input via game.dev.input.set()).
 */
import { W as CW, H as CH, VIEW_TOP, VIEW_BOT, PH, TOWER_TOP, KNOBS, PAL, clamp, zoneAt } from './consts.js';
import { buildTower, updateWorld, zoneHazards, gateOn, cablePos } from './world.js';
import { newPlayer, updatePlayer, hit, pBox, boxDist, fallDropM } from './climber.js';
import { intake, dispatchEvent, tickDispatch, tickHazards, panic, useGrapple, stallAssist, creditGiven, creditTaken, stat, chip, teamOf, cleanEvent, crewNames, barrageLabel, releaseFolds, EFFECT_NAMES, platformBadge } from './effects.js';
import { createInput } from './input.js';
import { createStore, TITLES } from './store.js';
export { localStorageBackend, remoteBackend } from './store.js';
import { createSfx } from './sfx.js';
import { createRenderer } from './render.js';

// every input the game acts on (Enter is not one: test bots hold it as a keep-awake)
const ACTION_KEYS = ['left', 'right', 'up', 'down', 'jump', 'dash', 'grapple', 'pause', 'panic', 'settings', 'mute', 'esc', 'help', 'reset'];

async function loadJSON(rel) {
  const url = new URL(rel, import.meta.url);
  if (url.protocol === 'file:') { const fs = await import('node:fs'); return JSON.parse(fs.readFileSync(url, 'utf8')); }
  const r = await fetch(url.href, { cache: 'no-store' });
  return r.json();
}
const CHUNKS = await loadJSON('./tower-chunks.json');
const SFX_PRESETS = await loadJSON('./sfx-presets.json').catch(() => ({}));
const GIFTS_CFG = await loadJSON('../gifts.json').then((g) => g['climb-or-die'] || {}).catch(() => ({}));

export function createGame({ W = CW, H = CH, transparent = false, store: storeOpt, storage, mute, activityPing = true, streamerKeys = true } = {}) {
  const hasDom = typeof window !== 'undefined';
  const params = hasDom && typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const input = createInput({ streamerKeys });
  const store = storeOpt || createStore(storage ? { storage } : undefined);
  const sfx = createSfx(SFX_PRESETS, { muted: mute ?? params.get('mute') === '1' });
  const handlers = [];
  let S;

  // ---------- knobs ----------
  // URL overrides (?nonet=1) apply for this page load only: they are never written back to
  // the saved settings unless the streamer changes that knob in F10 themselves.
  const urlOverride = {};
  function loadKnobs(cfg) {
    const k = {};
    for (const [name, d] of Object.entries(KNOBS)) k[name] = clamp(Number((cfg.knobs || {})[name] ?? d.def), d.min, d.max);
    if (hasDom) { try { const saved = JSON.parse(localStorage.getItem('climb-or-die-knobs') || '{}'); for (const [n, v] of Object.entries(saved)) if (KNOBS[n] && Number.isFinite(Number(v))) k[n] = clamp(Number(v), KNOBS[n].min, KNOBS[n].max); } catch (e) { /* storage blocked */ } }
    // ?nonet=1 → NO NET mode (falls go all the way down)
    if (params.get('nonet') === '1') { urlOverride.safetyNet = { saved: k.safetyNet, forced: 0 }; k.safetyNet = 0; }
    return k;
  }
  function saveKnobs() {
    if (!hasDom) return;
    const out = { ...S.knob };
    for (const [n, o] of Object.entries(urlOverride)) if (out[n] === o.forced) out[n] = o.saved;
    try { localStorage.setItem('climb-or-die-knobs', JSON.stringify(out)); } catch (e) { /* ignore */ }
  }

  // ---------- state ----------
  function freshSession() {
    const cfg = GIFTS_CFG;
    S = {
      cfg, knob: loadKnobs(cfg), heroName: String(cfg.heroName || 'PATCH').toUpperCase().slice(0, 12),
      t: 0, sessionT: 0, realT: 0, level: 0, hz: 1, summits: 0, bestRunSec: null,
      teams: new Map(), session: new Map(), tipped: new Set(),
      held: [], heldClock: 0, pending: [], sabQ: [], heat: 0, maxHeat: 0, jammer: 0, heatAtJam: 0, jams: 0, panic: 0, panics: 0, lastSab: -9,
      credited: { coins: 0, gifts: 0, effects: 0, likes: 0, overflow: 0 }, fired: { help: 0, sab: 0, merged: 0, barrage: 0 }, effSeq: 1,
      barrages: { low: 0, big: 0, help: 0 }, feedOut: [], swallow: null, heldFold: new Map(),
      lightning: { charge: 0, help: 0, sab: 0, boost: { help: false, sab: false }, contrib: new Map(), last: -99 },
      chips: [], cards: [], card: null, banner: null, cinema: null, flash: 0, shake: 0, slowmo: 0, slowCool: 0, stamp: 0, vignette: 0,
      paused: false, onBreak: false, over: false, softPrompt: false, settings: { open: false, idx: 0, savedT: 0 }, help: false, idleT: 0, padPing: 0,
      nemesis: null, posters: [], emit: (type, d) => { for (const h of handlers) h(type, d); },
      holding: () => S.paused || S.onBreak || S.over || S.settings.open || S.help || !!(S.cine),
      lastBeacon: () => { let b = S.beacons[0]; for (const x of S.beacons) if (x.banked && x.y >= b.y) b = x; return b; },
    };
    S.urlNoNet = !!urlOverride.safetyNet;
    newRun(0);
  }

  function newRun(level) {
    const tower = buildTower(CHUNKS, level);
    Object.assign(S, {
      level, hz: 1 + 0.12 * level, t: S.t, towerTop: TOWER_TOP,
      platforms: tower.platforms, cables: tower.cables, gates: tower.gates, patrols: tower.patrols,
      beacons: tower.beacons.map((b, i) => ({ ...b, banked: i === 0 })),
      player: newPlayer(540, 0), camY: -160,
      haz: { bolts: [], drones: [], shoves: [], meteors: [], strike: null }, sweeps: [], ladders: [],
      fx: { greaseNext: 0 }, wind: { baseline: 0, gift: 0, flag: 0 }, sentryClock: 0, sentryCount: 0, windCount: 0,
      run: { t0: S.t, realT0: S.sessionT, given: 0, taken: 0, users: new Map(), helpLog: [], sabLog: [] },
      stall: { bestY: 0, t: 0 }, cine: null, gateCd: 0, net: null, maxY: 0, padOwner: null,
    });
    S.player.ground = S.platforms.find((p) => p.kind === 'ground');
    S.posters = S.posters.filter((p) => p.state === 'nemesis');
    placeNemesis();
  }

  function placeNemesis() {
    if (!store.loaded || S.posters.some((p) => p.state === 'nemesis')) return;
    const doc = store.merged(new Map(), 0, null);
    const id = doc.mostWanted;
    if (id && doc.viewers[id]) { S.nemesis = { id, name: doc.viewers[id].name, taken: doc.viewers[id].metersTaken }; S.posters.push({ x: 540, y: 12500, name: doc.viewers[id].name, user: { id }, state: 'nemesis', t0: 0 }); }
  }

  freshSession();
  store.load().then(() => placeNemesis());

  // ---------- event reactions ----------
  handlers.push((type, d) => {
    const P = S.player;
    switch (type) {
      case 'sfx': sfx.play(d); break;
      case 'land': {
        const gain = d.plat.y - P.lastGroundY;
        if (d.plat.owner && gain > 0) creditGiven(S, d.plat.owner, gain / 100);
        if (S.padOwner && gain > 0) { creditGiven(S, S.padOwner, gain / 100); }
        S.padOwner = null;
        const lh = P.lastHit;
        // a hit owns the landing within 6 s, or for as long as PATCH has been airborne ever since
        // (NO NET: a knock at 200 m can take 8+ s to hit the ground; it is still that saboteur)
        if (lh && (S.t - lh.t < 6 || lh.chain)) {
          const loss = (lh.y - d.plat.y) / 100;
          P.lastHit = null;
          if (loss > 0.05) sabLoss(lh, loss, lh.y);
        } else if (d.fall >= 600) gravityCard(d.fall / 100);
        if (d.fromY - d.plat.y > 30 && d.overlap <= 16 && d.plat.kind !== 'net' && d.plat.kind !== 'ground') S.emit('clutch', { kind: 'edge' });
        if (d.fall > 120) sfx.play('land');
        // big fall impact (mostly NO NET mode): shake + flash scale with the true fall distance
        const big = Math.max(d.fall, d.peakFall || 0);
        if (big >= 1000) { S.shake = Math.max(S.shake, Math.min(1.5, big / 3000)); S.flash = Math.max(S.flash, 0.2); sfx.play('scratch'); }
        // stall assist measures progress from where PATCH landed after a real drop (not the old best)
        if (d.fall >= 500) { S.stall.bestY = d.plat.y; }
        break;
      }
      case 'padBounce': S.padOwner = d.owner; break;
      case 'drop': sabLoss(d, d.loss, d.fromY); break;
      case 'liftEnd': {
        const gained = (d.ty - d.fy) / 100;
        if (d.then && d.then.owner) creditGiven(S, d.then.owner, gained);
        if (d.then && d.then.likers) for (const c of d.then.likers) creditGiven(S, c.user, gained * (c.n / d.then.total));
        break;
      }
      case 'clutch':
        if (S.slowCool <= 0 && !S.cine) { S.slowmo = 0.6; S.slowCool = 8; S.stamp = 0.9; S.vignette = 2; sfx.play('slowmo'); }
        break;
      case 'hit': S.shake = Math.max(S.shake, 0.18); break;
      case 'shieldBlock': sfx.play('shield'); break;
      case 'banked': chip(S, `${d.label || 'BEACON'} BANKED`, PAL.help); break;
      case 'lift': if (d === 'rocket' || d === 'updraft') S.flash = Math.max(S.flash, 0.25); break;
      default: break;
    }
  });

  function sabLoss(src, lossM, atY) {
    const user = src.user || null;
    const B = src.barrage && src.barrage.crew && src.barrage.crew.length ? src.barrage : null;
    if (B) for (const u of B.crew) creditTaken(S, u, lossM / B.crew.length); // a barrage: every sender shares the meters
    else creditTaken(S, user, lossM);
    if (!user) { if (lossM >= 6) gravityCard(lossM); return; }
    if (lossM >= 3) {
      const st = stat(S, user); st.knockdowns++;
      if (B) for (const u of B.crew) if (u.id !== user.id) stat(S, u).knockdowns++;
      showCard({ kind: 'knock', user, loss: lossM, effect: src.effect, gift: src.gift, count: B ? B.n : src.count || 1, nth: st.knockdowns, barrage: B });
    }
    if (lossM >= 10) {
      const n = S.posters.length;
      S.posters.push({ x: n % 2 ? 190 : 890, y: Math.max(200, atY), user, name: '@' + user.nickname, state: 'wanted', t0: S.sessionT, deadline: S.sessionT + 90, loss: lossM });
      sfx.play('wanted');
    }
  }
  function gravityCard(m) { showCard({ kind: 'gravity', loss: m }); }
  const ORD = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  function showCard(c) {
    c.t = 3.5; c.t0 = 3.5;
    if (c.kind === 'knock' && c.barrage) c.lines = [crewNames(c.barrage, 28), `· BARRAGE ×${c.barrage.n}${c.effect && c.effect !== 'BARRAGE' ? ' · ' + (EFFECT_NAMES[c.effect] || c.effect) : ''}`];
    else if (c.kind === 'knock') c.lines = [`@${c.user.nickname} KNOCKED ${S.heroName} DOWN`, `${EFFECT_NAMES[c.effect] || c.effect}${c.count > 1 ? ' x' + c.count : ''} · their ${ORD(c.nth)} tonight`];
    else if (c.kind === 'gravity') c.lines = [`GRAVITY GOT ${S.heroName}`, 'streamer error · no attacker'];
    else if (c.kind === 'revenge') c.lines = [`REVENGE CLAIMED on @${c.user.nickname}`, `HELP crew +10 m each (${c.helpers} helpers)`];
    if (S.cards.length >= 4) S.cards.shift();
    S.cards.push(c);
    store.clip(c.kind, c.user ? '@' + c.user.nickname : null, (c.barrage ? barrageLabel(c.barrage) : c.lines[0]) + (c.loss != null ? ` ${c.loss.toFixed(1)} m` : ''));
  }

  // ---------- update ----------
  let saveClock = 0;
  function update(dt) {
    S.realT += dt;
    let inp = input.poll();
    if (inp.any) {
      S.idleT = 0;
      if (S.onBreak) { S.onBreak = false; S.swallow = new Set(ACTION_KEYS.filter((k) => inp[k])); chip(S, 'BACK FROM BREAK', PAL.help); }
      if (activityPing && inp.pad && hasDom && S.realT - S.padPing > 5) { S.padPing = S.realT; try { void 0 /* web build: no /api/activity */; } catch (e) { /* ignore */ } }
    } else S.idleT += dt;
    // the key that wakes ON BREAK is swallowed: every action stays masked until it is released
    // (otherwise Space would jump, P would pause, F9 would PANIC on the way back)
    if (S.swallow === true) S.swallow = new Set(ACTION_KEYS.filter((k) => inp[k])); // woken by the server / a click
    if (S.swallow) {
      for (const k of S.swallow) if (!inp[k]) S.swallow.delete(k);
      if (S.swallow.size) { inp = { ...inp }; for (const k of S.swallow) { inp[k] = false; inp[k + 'Pressed'] = false; } } else S.swallow = null;
    }
    if (inp.mutePressed) { S.musicOff = !S.musicOff; if (S.musicOff) sfx.stopMusic(); else sfx.startMusic(); }

    // settings overlay (F10)
    // F1 key help (holds the game like settings, so nothing hits PATCH while it covers the view)
    if (inp.helpPressed || (S.help && inp.escPressed && !S.settings.open)) { S.help = !S.help; if (S.help) S.settings.open = false; }
    if (inp.settingsPressed || (S.settings.open && inp.escPressed)) { S.settings.open = !S.settings.open; if (S.settings.open) S.help = false; saveKnobs(); }
    S.settings.savedT = Math.max(0, S.settings.savedT - dt);
    if (S.settings.open) settingsNav(inp);
    else if (!S.over) {
      if (inp.pausePressed && !S.onBreak) { S.paused = !S.paused; sfx.play(S.paused ? 'brace' : 'jump'); }
      if (inp.panicPressed) panic(S); // works while paused too (the streamer may pause first, then panic)
    }

    // session timer + soft/hard stop
    S.sessionT += dt;
    if (!S.softPrompt && S.sessionT >= S.knob.sessionSoftH * 3600) { S.softPrompt = true; S.banner = { text: 'END OF SHIFT', sub: 'wrap it up: hard stop at ' + fmtH(S.knob.sessionHardH * 3600), color: PAL.sodium, t: 12 }; }
    if (!S.over && S.sessionT >= Math.max(S.knob.sessionSoftH, S.knob.sessionHardH) * 3600) { S.over = true; save(); }
    // idle watchdog -> ON BREAK
    // (the server's idle signal is advisory: it only confirms a break once this page has also seen 10 s without input)
    if (!S.onBreak && !S.over && (S.idleT >= S.knob.idleBreakS || (S.serverIdle && S.idleT >= 10))) { S.onBreak = true; sfx.play('lounge'); }

    tickUi(dt);
    saveClock += dt;
    if (saveClock >= 60) { saveClock = 0; save(); }

    if (S.paused || S.onBreak || S.over || S.settings.open || S.help) { sfx.loop('drone', false); sfx.loop('wind', false); sfx.loop('servo', false); sfx.loop('rotor', false); return; }

    // release the pause/break queue: one event every 0.5 s; a long queue (spam during a break)
    // releases in bigger steps so it drains in ~10 s (the SAB backlog compaction folds the rest)
    if (!S.cine) releaseFolds(S);
    if (S.held.length && !S.cine) { S.heldClock -= dt; if (S.heldClock <= 0) { S.heldClock = 0.5; const k = S.held.length > 20 ? Math.ceil(S.held.length / 20) : 1; for (let i = 0; i < k; i++) dispatchEvent(S, S.held.shift()); } }

    // near-miss slow-mo (0.3x for 0.6 s real)
    const wdt = S.slowmo > 0 ? dt * 0.3 : dt;
    S.slowmo = Math.max(0, S.slowmo - dt); S.slowCool = Math.max(0, S.slowCool - dt);
    step(wdt, inp);
  }

  function step(dt, inp) {
    S.t += dt;
    const P = S.player;
    if (S.cine) { sfx.loop('rotor', true); tickSummit(dt); return; }
    updateWorld(S, dt);
    zoneHazards(S, dt);
    const inv = S.fx.emp ? { ...inp, left: inp.right, right: inp.left } : inp;
    const prevGround = P.ground;
    updatePlayer(S, inv, dt);
    if (inp.grapplePressed) useGrapple(S);
    // true peak of the current fall (FALLING counter + big-fall impact): reset only while supported
    const supported = P.ground || P.ladder || P.cable || P.lift;
    if (supported) P.fallPeakY = P.y; else P.fallPeakY = Math.max(P.fallPeakY ?? P.y, P.y);
    if (P.lastHit) { if (P.lastHit.chain === undefined) P.lastHit.chain = !supported; else if (supported) P.lastHit.chain = false; }
    // grease slip attribution
    if (prevGround && !P.ground && prevGround.grease > 0 && prevGround.greaseBy && P.vy <= 0 && !P.lastHit) P.lastHit = { ...prevGround.greaseBy, t: S.t, y: prevGround.y };
    if (P.ladder && P.ladder.owner) { const gain = P.y - (P.ladderMax ?? P.y); if (gain > 0) creditGiven(S, P.ladder.owner, gain / 100); P.ladderMax = Math.max(P.ladderMax ?? P.y, P.y); } else P.ladderMax = null;
    tickDispatch(S, dt);
    tickHazards(S, dt);
    worldHazardContacts(dt);
    // beacons + catch-net
    if (P.ground) for (const b of S.beacons) if (!b.banked && P.ground.y >= b.y - 1 && P.ground.kind !== 'net') { b.banked = true; sfx.play('beacon'); chip(S, `BEACON ${Math.round(b.y / 100)} m BANKED`, PAL.help); }
    const lb = S.lastBeacon();
    S.net = lb.y > 0 && S.knob.safetyNet ? (S.net && S.net.y === lb.y - 50 ? S.net : { id: -1, x: 70, w: 940, y: lb.y - 50, kind: 'net', alive: true, ttl: Infinity, belt: 0, grease: 0 }) : null;
    // summit: touch BIRD-9's rope at 250 m
    const rope = ropeX();
    if (Math.abs(P.x - rope) < 56 && P.y + PH >= TOWER_TOP - 10 && !P.lift) startSummit();
    // stall assist: 90 s without net height gain
    if (P.y > S.stall.bestY + 30) { S.stall.bestY = P.y; S.stall.t = 0; } else { S.stall.t += dt; if (S.stall.t >= S.knob.stallAssistS) { S.stall.t = 0; stallAssist(S); } }
    S.maxY = Math.max(S.maxY, P.y);
    // WANTED revenge clocks
    for (const w of S.posters) {
      if (w.state !== 'wanted') continue;
      if (S.sessionT > w.deadline) { w.state = 'trophy'; continue; }
      if (P.ground && P.y >= w.y + 10) {
        w.state = 'busted';
        stat(S, w.user).revengesSuffered++;
        const crew = new Map();
        for (const h of S.run.helpLog) if (h.user && h.t >= w.t0) crew.set(h.user.id, h.user);
        for (const u of crew.values()) creditGiven(S, u, 10);
        showCard({ kind: 'revenge', user: w.user, helpers: crew.size });
        sfx.play('revenge');
      }
    }
    // camera: looks ahead (down) during a fast fall, and never lets PATCH leave the viewport
    const look = P.vy < -900 && !P.ground ? Math.min(360, (-P.vy - 900) * 0.3) : 0;
    const target = P.y - 380 - look;
    S.camY += (target - S.camY) * Math.min(1, dt * (look ? 8 : 5));
    S.camY = clamp(S.camY, P.y - (VIEW_BOT - VIEW_TOP) + 220, P.y - 230); // feet >= 230 px above the lane, head below the top
    S.camY = clamp(S.camY, -160, TOWER_TOP + 420 - 1120);
    S.shake = Math.max(0, S.shake - dt);
    S.flash = Math.max(0, S.flash - dt);
    sfx.loop('drone', S.haz.drones.length > 0);
    sfx.loop('wind', !!(S.wind.baseline || S.wind.gift));
    sfx.loop('servo', !!S.fx.hk); // Hunter-Killer servo march
  }

  function worldHazardContacts(dt) {
    const P = S.player, box = pBox(P);
    S.gateCd = Math.max(0, S.gateCd - dt);
    for (const d of S.patrols) {
      if (d.stunned > 0 || Math.abs(d.y - P.y) > 300) continue;
      if (boxDist(box, d.x - 32, d.y - 24, d.x + 32, d.y + 24) <= 0) {
        if (S.fx.corgi && S.fx.corgi.bark) { S.fx.corgi.bark = false; d.stunned = 4; sfx.play('bark'); continue; }
        if (P.dashT > 0) { d.stunned = 1.5; continue; }
        if (hit(S, { effect: 'PATROL', vx: (P.x >= d.x ? 1 : -1) * 500, vy: 300, stun: 0, dashable: true })) d.stunned = 0.8;
      }
    }
    if (S.gateCd <= 0) for (const g of S.gates) {
      if (!gateOn(g, S.t, S.hz)) continue;
      if (P.x + 28 > g.x1 && P.x - 28 < g.x2 && P.y < g.y + 8 && P.y + PH > g.y - 8) {
        S.gateCd = 0.8;
        hit(S, { effect: 'GATE', vx: (P.x < (g.x1 + g.x2) / 2 ? -1 : 1) * 600, vy: -200, stun: 0.2 });
        sfx.play('laser');
      }
    }
  }

  const ropeX = () => 540 + Math.sin(S.t * 0.7) * 30;

  // ---------- summit ----------
  function startSummit() {
    const runSec = S.sessionT - S.run.realT0;
    S.summits++;
    const n = (store.base.summits || 0) + S.summits;
    if (S.bestRunSec == null || runSec < S.bestRunSec) S.bestRunSec = runSec;
    const us = [...S.run.users.values()];
    const helpersTop = us.filter((u) => u.given > 0).sort((a, b) => b.given - a.given).slice(0, 5);
    const sabsTop = us.filter((u) => u.taken > 0).sort((a, b) => b.taken - a.taken).slice(0, 3);
    for (const u of us) if (u.given > 0) { const s = S.session.get(u.id); if (s) s.summitsAssisted++; }
    const nextLevel = Math.min(S.summits, S.knob.summitCap);
    S.cine = { t: 0, dur: 8, n, runSec, helpersTop, sabsTop, nextLevel, py: S.player.y, px: S.player.x };
    S.player.lift = null; S.player.ladder = null; S.player.stun = 0;
    // the cinematic is clean: active hazards end (queued effects still wait and fire next run)
    S.haz = { bolts: [], drones: [], shoves: [], meteors: [], strike: null }; S.sweeps = [];
    S.fx = { greaseNext: S.fx.greaseNext || 0 };
    sfx.play('summit'); sfx.loop('rotor', true);
    store.clip('summit', null, `SUMMIT #${n}`);
    save();
  }
  function tickSummit(dt) {
    const c = S.cine, P = S.player;
    c.t += dt;
    const rise = Math.max(0, c.t - 0.8) * 260;
    P.x = ropeX(); P.y = TOWER_TOP - PH + 30 + rise; P.anim = 'jump'; P.vy = 0;
    S.camY += (P.y - 520 - S.camY) * Math.min(1, dt * 3);
    if (c.t >= c.dur) {
      sfx.loop('rotor', false);
      newRun(c.nextLevel);
      S.banner = { text: `ALERT LEVEL ${S.level}`, sub: S.level ? 'gaps +' + 8 * S.level + '% · hazards +' + 12 * S.level + '% · crumbly +' + 4 * S.level + 'pp' : 'scaling capped at 0', color: S.level ? PAL.sab : PAL.bone, t: 4 };
    }
  }

  // ---------- UI timers ----------
  function tickUi(dt) {
    for (const c of S.chips) c.t -= dt;
    S.chips = S.chips.filter((c) => c.t > 0);
    if (!S.card && S.cards.length) { S.card = S.cards.shift(); sfx.play(S.card.kind === 'revenge' ? 'revenge' : 'scratch'); sfx.duck(true); }
    if (S.card) { S.card.t -= dt; if (S.card.t <= 0) { S.card = null; if (!S.cards.length) sfx.duck(false); } }
    if (S.banner) { S.banner.t -= dt; if (S.banner.t <= 0) S.banner = null; }
    if (S.cinema) { S.cinema.t += dt; if (S.cinema.t >= S.cinema.dur) S.cinema = null; }
    S.stamp = Math.max(0, S.stamp - dt);
    if (S.vignette > 0) S.vignette--;
    S.boardClock = (S.boardClock || 0) - dt;
    if (S.boardClock <= 0) { S.boardClock = 3; refreshBoards(); }
  }

  // titles + rotating top-5 boards (session and all time), refreshed every 3 s
  function refreshBoards() {
    const doc = store.merged(S.session, S.summits, S.bestRunSec);
    S.titles = new Map(Object.entries(doc.viewers).filter(([, v]) => v._t).map(([id, v]) => [id, v._t]));
    const tc = (id, team) => { const t = S.titles.get(id); return t ? TITLES[t].color : team === 'sab' ? PAL.sab : PAL.help; };
    const top = (rows, key) => rows.filter((r) => r[1][key] > 0).sort((a, b) => b[1][key] - a[1][key]).slice(0, 5).map(([id, v]) => ({ name: platformBadge(id) + v.name, m: v[key], color: tc(id, v.team), platform: v.platform || null }));
    const sess = [...S.session.entries()], all = Object.entries(doc.viewers);
    S.boards = [
      { title: 'TOP HELP · TONIGHT', color: PAL.help, rows: top(sess, 'metersGiven') },
      { title: 'TOP SABS · TONIGHT', color: PAL.sab, rows: top(sess, 'metersTaken') },
      { title: 'TOP HELP · ALL TIME', color: PAL.help, rows: top(all, 'metersGiven') },
      { title: 'TOP SABS · ALL TIME', color: PAL.sab, rows: top(all, 'metersTaken') },
    ];
  }

  function settingsNav(inp) {
    const keys = Object.keys(KNOBS), st = S.settings;
    if (inp.upPressed) st.idx = (st.idx + keys.length - 1) % keys.length;
    if (inp.downPressed) st.idx = (st.idx + 1) % keys.length;
    const k = keys[st.idx], d = KNOBS[k];
    const dir = (inp.rightPressed ? 1 : 0) - (inp.leftPressed ? 1 : 0);
    const before = S.knob[k];
    if (dir) S.knob[k] = Math.round(clamp(S.knob[k] + dir * d.step, d.min, d.max) * 100) / 100;
    if (inp.resetPressed) S.knob[k] = d.def;
    if (S.knob[k] !== before) { if (urlOverride[k]) { delete urlOverride[k]; S.urlNoNet = !!urlOverride.safetyNet; } saveKnobs(); st.savedT = 1.5; } // saved on every change
  }

  const fmtH = (s) => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

  function save(beacon) { if (store.loaded) store.save(store.merged(S.session, S.summits, S.bestRunSec), { beacon }); }
  if (hasDom) window.addEventListener('beforeunload', () => save(true));

  // ---------- platform hooks ----------
  function onEvent(raw, map) {
    if (!raw || !raw.type) return;
    const evt = cleanEvent(raw); // sanitized copy: names, coins, counts (the feed keeps the raw event)
    const label = intake(S, evt);
    if (map) {
      if (label) map.label = evt.type === 'gift' && map.whale ? label.replace(/^(HELP|SAB): /, '') : label;
      else if (evt.type === 'like') map.label = 'LIGHTNING';
      else if (evt.type === 'comment' || evt.type === 'join') map.label = '';
      map.sound = null;
      if (evt.type === 'gift' && map.whale) sfx.play('whale');
    }
  }

  const renderer = createRenderer({ W, H, transparent, getState: () => S, fmtH, ropeX, streamerKeys });
  const game = {
    onEvent, update, render: (ctx) => renderer.render(ctx), reset() { const keep = { t: S.t }; sfx.loop('rotor', false); newRun(0); S.t = keep.t; S.summits = 0; }, // (rotor: a reset mid-summit left it looping forever)
    /** Web edition: fresh session (new timer, run, queues, tonight boards). The finished session is saved
     *  and folded into the all-time board first. Stops every looping sound; the AudioContext is reused. */
    newSession() {
      if (store.loaded) { const doc = store.merged(S.session, S.summits, S.bestRunSec); store.save(doc); store.adopt(doc); }
      sfx.stopLoops(); sfx.duck(false);
      const musicOff = S.musicOff;
      freshSession(); saveClock = 0;
      S.musicOff = musicOff;
    },
    onIdle() { S.serverIdle = true; if (!S.over && S.idleT >= 10 && !S.onBreak) { S.onBreak = true; sfx.play('lounge'); } },
    onActive() { S.serverIdle = false; if (S.onBreak) { S.onBreak = false; S.idleT = 0; S.swallow = true; } },
    /** Platform pulls game-made feed lines (BARRAGE credits) once a frame. */
    takeFeed() { if (!S.feedOut.length) return []; const out = S.feedOut; S.feedOut = []; return out; },
    onConfig(giftMap) {
      const c = giftMap && giftMap['climb-or-die'];
      if (!c) return;
      S.cfg = c; S.heroName = String(c.heroName || 'PATCH').toUpperCase().slice(0, 12);
    },
    overlayLayout: {
      feed: { x: 20, bottom: 1880, lines: 4, lineH: 66, fontPx: 30, maxWidth: 652 }, // 30 px: readable at phone 1/3 scale
      board: false, pill: { x: 24, y: 528 },
      whale: { top: 520, bottom: 1640, centerY: 1085 },
      hideFeed: () => !!S.card,
    },
    get afk() { return S.onBreak; },
    get debug() {
      const P = S.player;
      return {
        heightM: Math.floor(P.y / 100), fallingM: fallDropM(P), camY: S.camY, bestM: Math.floor(S.maxY / 100), zone: zoneAt(P.y).name, level: S.level, summits: S.summits,
        platforms: S.platforms.length,
        helpers: S.platforms.filter((p) => ['plank', 'pad', 'stair', 'rung'].includes(p.kind)).length + S.ladders.length,
        planks: S.platforms.filter((p) => p.kind === 'plank').length,
        obstacles: S.haz.bolts.length + S.haz.drones.length + S.haz.shoves.length + S.haz.meteors.length + S.sweeps.filter((w) => w.kind !== 'sentry').length + (S.fx.hk ? 1 : 0) + (S.fx.overseer ? 1 : 0) + (S.haz.strike ? 1 : 0),
        heat: S.heat, jammer: S.jammer, panic: S.panic, lightning: S.lightning.charge, paused: S.paused, onBreak: S.onBreak,
        held: S.held.length, pending: S.pending.length, sabQ: S.sabQ.length, credited: { ...S.credited }, fired: { ...S.fired }, barrages: { ...S.barrages },
        lastBeaconM: S.lastBeacon().y / 100, player: { x: P.x, y: P.y, vx: P.vx, vy: P.vy, stun: P.stun, shield: P.shield, ground: !!P.ground },
      };
    },
    dev: {
      input, get S() { return S; }, store,
      warp(m) { const P = S.player; const y = m * 100; const plat = S.platforms.filter((p) => p.alive && p.y <= y && p.kind !== 'net').sort((a, b) => b.y - a.y)[0]; P.y = plat.y; P.x = plat.x + plat.w / 2; P.ground = plat; P.lastGroundY = plat.y; P.vy = 0; P.vx = 0; P.kvx = 0; S.camY = P.y - 380; for (const b of S.beacons) b.banked = b.y <= P.y; S.stall.bestY = P.y; },
      setTeam(user, team) { S.teams.set(user.id, { team, at: -9999, name: user.nickname }); stat(S, user).team = team; },
      summit() { startSummit(); },
      card(c) { showCard(c); },
      fmtH,
    },
  };
  return game;
}
