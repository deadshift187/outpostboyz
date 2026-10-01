/**
 * GAME ENTRY POINT: TIGHTROPE (?game=tightrope). PATCH walks ropes strung between two ruined
 * skyscrapers, zigzagging up the canyon to BIRD-9 on the rooftop. The streamer walks, leans and
 * crouches; viewers help or sabotage with gifts. Same contract as CLIMB OR DIE:
 *
 *   createGame({ W, H, transparent, sound, storage, mute, activityPing, streamerKeys }) -> {
 *     onEvent(evt, map), update(dt), render(ctx), reset(), newSession(), onIdle(s), onActive(s),
 *     onConfig(giftMap), takeFeed(), overlayLayout, debug, dev
 *   }
 *
 * Code + data live in app/game/tightrope/ (config.json = gift table + knobs). DOM-free core:
 * runs headless in Node for tests (input via game.dev.input.set()).
 */
import { W as CW, H as CH, BAL, PAL, KNOBS, VIEW_M, clamp } from './tightrope/consts.js';
import { buildRun, START_Y, TRASH_Y, ropeAt } from './tightrope/world.js';
import { newWalker, placeOnRope, externalTorque, updateWalk, startFall, stepPlunge, liftPos } from './tightrope/walker.js';
import { intake, dispatchEvent, tickDispatch, tickHazards, panic, emptyHaz, chip, stat, teamOf, creditGiven, creditFall, cleanEvent, crewNames, barrageLabel, releaseFolds, EFFECT_NAMES, platformBadge, onRope } from './tightrope/effects.js';
import { createInput } from './tightrope/input.js';
import { createStore, TITLES } from './tightrope/store.js';
import { createSfx } from './tightrope/sfx.js';
import { createRenderer } from './tightrope/render.js';
export { localStorageBackend, hybridBackend } from './tightrope/store.js';

const ACTION_KEYS = ['left', 'right', 'up', 'down', 'crouch', 'pause', 'panic', 'settings', 'mute', 'esc', 'help', 'reset'];

async function loadJSON(rel) {
  const url = new URL(rel, import.meta.url);
  if (url.protocol === 'file:') { const fs = await import('node:fs'); return JSON.parse(fs.readFileSync(url, 'utf8')); }
  const r = await fetch(url.href, { cache: 'no-store' });
  return r.json();
}
let CFG = await loadJSON('./tightrope/config.json').catch(() => ({}));
const SFX_PRESETS = await loadJSON('./tightrope/sfx-presets.json').catch(() => ({}));

export function createGame({ W = CW, H = CH, transparent = false, store: storeOpt, storage, mute, activityPing = true, streamerKeys = true } = {}) {
  const hasDom = typeof window !== 'undefined';
  const params = hasDom && typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const input = createInput({ streamerKeys });
  const store = storeOpt || createStore(storage ? { storage } : undefined);
  const sfx = createSfx(SFX_PRESETS, { muted: mute ?? params.get('mute') === '1' });
  const handlers = [];
  let S;

  // ---------- knobs ----------
  function loadKnobs(cfg) {
    const k = {};
    for (const [name, d] of Object.entries(KNOBS)) k[name] = clamp(Number((cfg.knobs || {})[name] ?? d.def), d.min, d.max);
    if (hasDom) { try { const saved = JSON.parse(localStorage.getItem('tightrope-knobs') || '{}'); for (const [n, v] of Object.entries(saved)) if (KNOBS[n] && Number.isFinite(Number(v))) k[n] = clamp(Number(v), KNOBS[n].min, KNOBS[n].max); } catch (e) { /* blocked */ } }
    return k;
  }
  function saveKnobs() { if (!hasDom) return; try { localStorage.setItem('tightrope-knobs', JSON.stringify(S.knob)); } catch (e) { /* ignore */ } }

  // ---------- state ----------
  function freshSession() {
    S = {
      cfg: CFG, knob: loadKnobs(CFG), heroName: String(CFG.heroName || 'PATCH').toUpperCase().slice(0, 12),
      t: 0, sessionT: 0, realT: 0, summits: 0, runNo: 0, bestRunSec: null, runs: [], fallsTonight: 0,
      teams: new Map(), session: new Map(), tipped: new Set(),
      held: [], heldClock: 0, heldFold: new Map(), pending: [], sabQ: [], heat: 0, maxHeat: 0, jammer: 0, heatAtJam: 0, jams: 0, panic: 0, panics: 0, lastSab: -9,
      credited: { coins: 0, gifts: 0, effects: 0, likes: 0 }, fired: { help: 0, sab: 0, merged: 0, barrage: 0 }, effSeq: 1,
      barrages: { low: 0, big: 0, help: 0 }, feedOut: [], swallow: null, dirSeq: 1,
      crowd: { charge: 0, help: 0, sab: 0, boost: { help: false, sab: false }, contrib: new Map(), last: -99 },
      chips: [], cards: [], card: null, banner: null, cinema: null, stamp: null, flash: 0, shake: 0, slowmo: 0, slowCool: 0,
      paused: false, onBreak: false, over: false, softPrompt: false, settings: { open: false, idx: 0, savedT: 0 }, help: false, idleT: 0, padPing: 0,
      posters: [], nemesis: null, flyoff: [], pops: [],
      emit: (type, d) => { for (const h of handlers) h(type, d); },
      holding: () => S.paused || S.onBreak || S.over || S.settings.open || S.help || !!S.cine,
    };
    newRun(0);
  }

  function newRun(level) {
    const world = buildRun(level, S.runNo);
    const cum = [0]; for (const sp of world.spans) cum.push(cum[cum.length - 1] + sp.len);
    Object.assign(S, {
      world, cum, P: newWalker(), haz: emptyHaz(), buff: { harness: [] }, resume: { span: 0, s: 0 },
      run: { t0: S.t, realT0: S.sessionT, score: 0, distM: 0, best: 0, maxH: 0, falls: 0, given: 0, users: new Map(), helpLog: [], sabLog: [] },
      blame: new Map(), kicks: [], grace: 0, spanFalls: { span: -1, n: 0 }, cine: null, stall: { t: 0 }, knockQ: null, camY: START_Y - 6.2, liftTag: null,
    });
    placeOnRope(S);
    S.posters = S.posters.filter((p) => p.state === 'nemesis');
    placeNemesis();
  }
  function placeNemesis() {
    if (!store.loaded || S.posters.some((p) => p.state === 'nemesis')) return;
    const doc = store.merged(new Map(), 0, null);
    const id = doc.mostWanted;
    if (id && doc.viewers[id]) { S.nemesis = { id, name: doc.viewers[id].name }; S.posters.push({ span: 1, side: S.world.anchors[1].side, y: S.world.anchors[1].y - 0.45, user: { id }, name: doc.viewers[id].name, state: 'nemesis', t0: 0 }); }
  }
  freshSession();
  store.load().then(() => placeNemesis());

  // ---------- kicks (budgeted) + blame ----------
  S.kick = null;
  function kick(src, dw) {
    const now = S.t, B = S.knob.impulseBudget;
    S.kicks = S.kicks.filter((k) => now - k.t < 5);
    const used = S.kicks.reduce((a, k) => a + k.m, 0);
    const m = Math.max(0, Math.min(Math.abs(dw), B - used));
    if (m <= 0) return 0;
    S.kicks.push({ t: now, m });
    S.P.omega += Math.sign(dw) * m;
    if (src) addBlame(src, m);
    return m;
  }
  function addBlame(src, w) {
    const key = src.uid || (src.likers ? 'crowd' : 'x');
    const b = S.blame.get(key) || { src, w: 0 };
    b.w += w; S.blame.set(key, b);
  }
  function topBlame() {
    let best = null;
    for (const b of S.blame.values()) if (!best || b.w > best.w) best = b;
    return best && best.w >= 0.35 ? best.src : null;
  }

  // ---------- event reactions ----------
  handlers.push((type, d) => {
    switch (type) {
      case 'sfx': sfx.play(d); break;
      case 'step': sfx.play('step', 0.6); break;
      case 'clutch':
        if (d.kind === 'duck') { if (S.slowCool <= 0) { S.slowmo = 0.45; S.slowCool = 3; sfx.play('slowmo'); } }
        else { S.stamp = { text: 'CLUTCH', color: PAL.sodium, t: 0.9 }; sfx.play('clutch'); }
        break;
      case 'ducked': S.stamp = { text: 'DUCKED!', color: PAL.help, t: 1.0 }; sfx.play('clutch'); sfx.play('clang'); break;
      case 'knock': S.knockQ = d; break;
      case 'gripGone': chip(S, 'GRIP GONE · STAND AND BREATHE', PAL.sab); sfx.play('grip'); break;
      case 'pop': S.pops.push({ ...d, t: 1.2 }); if (S.pops.length > 6) S.pops.shift(); break;
      case 'lift': startLift(d); break;
      default: break;
    }
  });

  // ---------- falls ----------
  function fall(dir, forced) {
    const P = S.P, attacker = forced || topBlame();
    const B = S.buff;
    let how = 'plunge', saver = null;
    if (B.net && B.net.t > 0) { how = 'net'; saver = { owners: B.net.owners, tag: B.net.tag, what: 'SAFETY NET' }; }
    else if (B.harness.length) { const h = B.harness.shift(); how = 'harness'; saver = { owners: h.crew || [], tag: h.tag, what: 'SAFETY HARNESS' }; }
    startFall(S, how, dir, { attacker, saver });
    // anything sitting on PATCH's pole flies off
    for (const q of S.haz.pigeons) S.flyoff.push({ x: P.x, y: P.y, end: q.end, t: 0, tag: q.src.tag });
    S.haz.pigeons = []; S.haz.crane = null; S.haz.drones = [];
    S.blame.clear();
    S.slowmo = 0.8; S.slowCool = 2;
    S.stamp = { text: how === 'plunge' ? 'WHOA!' : 'CAUGHT!', color: how === 'plunge' ? PAL.sab : PAL.help, t: 1.0 };
    sfx.play('whoa'); sfx.play('slowmo');
  }
  function afterTip() {
    const P = S.P, F = P.fall;
    if (F.how === 'plunge') { P.phase = 'plunge'; sfx.play('scream'); }
    else { P.phase = F.how; sfx.play('catch'); S.shake = Math.max(S.shake, 0.25); }
    P.pt = 0;
  }
  function onLanded() {
    const P = S.P, F = P.fall, dropM = Math.max(0, F.fromY - TRASH_Y);
    P.phase = 'landed'; P.pt = 0;
    S.run.falls++; S.fallsTonight++;
    if (S.spanFalls.span === P.span) S.spanFalls.n++; else S.spanFalls = { span: P.span, n: 1 };
    S.grace = Math.min(14, 5 + 3 * (S.spanFalls.n - 1)); // SECOND WIND: SAB waits this long once he is back on the rope
    S.shake = Math.max(S.shake, 0.6); S.flash = Math.max(S.flash, 0.25); sfx.play('thud');
    const src = F.cause.attacker;
    const ra = S.world.anchors[S.resume.span];
    const back = S.resume.planted ? `BACK TO ${S.resume.tag || 'THE ANCHOR'}` : `BACK TO ANCHOR ${S.resume.span}`;
    const user = src && (src.user || (src.barrage && src.barrage.crew[0]) || (src.likers && src.likers[0] && src.likers[0].user)) || null;
    if (user) {
      const crew = src.barrage && src.barrage.crew.length ? src.barrage.crew : src.likers ? src.likers.map((c) => c.user) : [user];
      for (const u of crew) creditFall(S, u, dropM / crew.length);
      const st = stat(S, user);
      const fx = EFFECT_NAMES[src.effect] || src.effect;
      showCard({ kind: 'fall', user, loss: dropM, lines: src.barrage ? [crewNames(src.barrage, 28), `· BARRAGE ×${src.barrage.n} · ${fx}`] : [`@${user.nickname} MADE ${S.heroName} FALL`, `${fx}${src.count > 1 ? ' x' + src.count : ''} · their ${ORD(st.falls)} tonight`], effect: src.effect, barrage: src.barrage });
      const n = S.posters.filter((p) => p.state !== 'nemesis').length;
      S.posters.push({ span: P.span, side: S.world.spans[P.span].a.side, y: S.world.spans[P.span].a.y - 0.45 - (n % 2) * 0.5, user, name: '@' + user.nickname, state: 'wanted', t0: S.sessionT, deadline: S.sessionT + 90, loss: dropM, effect: src.effect });
      while (S.posters.length > 10) { const i = S.posters.findIndex((p) => p.state !== 'nemesis'); if (i < 0) break; S.posters.splice(i, 1); }
      sfx.play('wanted');
    } else showCard({ kind: 'gravity', loss: dropM, lines: [`GRAVITY GOT ${S.heroName}`, `streamer error · no attacker · ${back}`] });
    void ra;
  }
  function onSaved() {
    const P = S.P, F = P.fall, sv = F.cause.saver, src = F.cause.attacker;
    const owner = sv.owners[0] || null;
    S.grace = Math.max(S.grace, 3);
    for (const o of sv.owners) { const st = stat(S, o); st.saves++; creditGiven(S, o, 5 / Math.max(1, sv.owners.length)); }
    const by = owner ? `@${owner.nickname}'s ${sv.what}` : sv.what;
    const culprit = src && (src.user || (src.barrage && src.barrage.crew[0])) ? `@${(src.user || src.barrage.crew[0]).nickname} tried it · ` : '';
    showCard({ kind: 'save', user: owner, lines: [`${by} CAUGHT ${S.heroName}`, `${culprit}${F.how === 'net' ? 'bounced back onto the rope' : 'reeled back to the anchor'}`] });
  }
  function resumeAt(span, s) {
    const P = S.P;
    P.span = span; P.s = s; P.v = 0; P.theta = 0; P.omega = 0; P.u = 0; P.crouch = false; P.fall = null; P.phase = 'walk'; P.pt = 0;
    placeOnRope(S);
    S.stall.t = 0; S.blame.clear();
  }

  // ---------- lifts (rope ladder / zipline / sky bridge / extraction) ----------
  function startLift(d) {
    const P = S.P, spans = S.world.spans;
    let total = spans[P.span].len - P.s;
    for (let i = P.span + 1; i < d.target; i++) total += spans[i].len;
    P.lift = { kind: d.kind, from: P.span, s0: P.s, target: d.target, total, t: 0, dur: clamp(1.4 + total / 7, 2, 7), crew: d.crew, tag: d.tag, done: 0 };
    P.phase = 'lift'; P.v = 0; P.theta *= 0.3; P.omega = 0;
    sfx.play('zip');
    chip(S, `${d.tag || 'HELP'}: ${EFFECT_NAMES[d.kind]} → ANCHOR ${d.target}`, PAL.help);
  }
  function tickLift(dt) {
    const P = S.P, L = P.lift;
    L.t += dt;
    const f = clamp(L.t / L.dur, 0, 1), e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
    const p = liftPos(S, L, e);
    P.x = p.x; P.y = p.y + 0.35; P.theta *= Math.exp(-4 * dt);
    const gained = e * L.total - L.done;
    if (gained > 0) { L.done += gained; for (const o of L.crew) creditGiven(S, o, gained / Math.max(1, L.crew.length)); }
    for (let i = L.from + 1; i <= Math.min(L.target, p.span); i++) bankAnchor(i, true);
    progress(p.span, p.s, true);
    if (f >= 1) { bankAnchor(L.target, true); P.lift = null; resumeAt(L.target, 0); S.resume = { span: L.target, s: 0 }; progress(L.target, 0, true); }
  }

  // ---------- progress, anchors, score ----------
  function progress(span, s, byLift) {
    const prog = S.cum[span] + s;
    if (prog > S.run.best + 1e-6) {
      const ds = prog - S.run.best;
      S.run.best = prog; S.run.distM += ds; S.run.score += 10 * ds; S.stall.t = 0;
      if (!byLift) { // meters walked under a HELP buff credit its senders
        const owners = new Map();
        for (const k of ['pole', 'calm', 'spotter', 'steady', 'chalk']) { const b = S.buff[k]; if (b && b.t > 0) for (const o of b.owners) owners.set(o.id, o); }
        for (const o of owners.values()) creditGiven(S, o, ds / owners.size);
      }
    }
    const h = S.P.y - START_Y;
    if (h > S.run.maxH) { S.run.score += 25 * (h - S.run.maxH); S.run.maxH = h; }
  }
  function bankAnchor(i, quiet) {
    const a = S.world.anchors[i];
    if (!a || a.banked) return;
    a.banked = true;
    if (!quiet) { sfx.play('bank'); chip(S, a.final ? 'ROOFTOP!' : `ANCHOR ${i} BANKED · ${Math.round(a.y)} M UP`, PAL.help); }
    // revenge: crossed the span where a saboteur dropped PATCH, within 90 s
    for (const w of S.posters) {
      if (w.state !== 'wanted' || w.span !== i - 1) continue;
      if (S.sessionT > w.deadline) continue;
      w.state = 'busted';
      stat(S, w.user).revengesSuffered++;
      const crew = new Map();
      for (const h of S.run.helpLog) if (h.t >= w.t0) for (const u of h.crew) crew.set(u.id, u);
      for (const u of crew.values()) creditGiven(S, u, 5);
      showCard({ kind: 'revenge', user: w.user, lines: [`REVENGE CLAIMED on @${w.user.nickname}`, `${S.heroName} crossed their span · HELP crew +5 m each (${crew.size})`] });
      sfx.play('revenge');
    }
  }

  const ORD = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  function showCard(c) {
    c.t = 3.8; c.t0 = 3.8;
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
    if (S.swallow === true) S.swallow = new Set(ACTION_KEYS.filter((k) => inp[k]));
    if (S.swallow) {
      for (const k of S.swallow) if (!inp[k]) S.swallow.delete(k);
      if (S.swallow.size) {
        inp = { ...inp };
        for (const k of S.swallow) { inp[k] = false; inp[k + 'Pressed'] = false; }
        if (S.swallow.has('left') || S.swallow.has('right')) inp.lean = 0;
        if (S.swallow.has('up')) inp.fwd = 0;
        if (S.swallow.has('down')) inp.back = 0;
      } else S.swallow = null;
    }
    if (inp.mutePressed) { S.musicOff = !S.musicOff; if (S.musicOff) sfx.stopMusic(); else sfx.startMusic(); }
    if (inp.helpPressed || (S.help && inp.escPressed && !S.settings.open)) { S.help = !S.help; if (S.help) S.settings.open = false; }
    if (inp.settingsPressed || (S.settings.open && inp.escPressed)) { S.settings.open = !S.settings.open; if (S.settings.open) S.help = false; saveKnobs(); }
    S.settings.savedT = Math.max(0, S.settings.savedT - dt);
    if (S.settings.open) settingsNav(inp);
    else if (!S.over) {
      if (inp.pausePressed && !S.onBreak) { S.paused = !S.paused; sfx.play(S.paused ? 'grip' : 'bank'); }
      if (inp.panicPressed) panic(S);
    }
    S.sessionT += dt;
    if (!S.softPrompt && S.sessionT >= S.knob.sessionSoftH * 3600) { S.softPrompt = true; S.banner = { text: 'END OF SHIFT', sub: 'wrap it up: hard stop at ' + fmtH(Math.max(S.knob.sessionSoftH, S.knob.sessionHardH) * 3600), color: PAL.sodium, t: 12 }; }
    if (!S.over && S.sessionT >= Math.max(S.knob.sessionSoftH, S.knob.sessionHardH) * 3600) { S.over = true; save(); }
    if (!S.onBreak && !S.over && (S.idleT >= S.knob.idleBreakS || (S.serverIdle && S.idleT >= 10))) { S.onBreak = true; sfx.play('lounge'); }
    tickUi(dt);
    saveClock += dt;
    if (saveClock >= 60) { saveClock = 0; save(); }
    if (S.paused || S.onBreak || S.over || S.settings.open || S.help) { stopLoops(); return; }
    if (!S.cine) releaseFolds(S);
    if (S.held.length && !S.cine) { S.heldClock -= dt; if (S.heldClock <= 0) { S.heldClock = 0.5; const k = S.held.length > 20 ? Math.ceil(S.held.length / 20) : 1; for (let i = 0; i < k; i++) dispatchEvent(S, S.held.shift()); } }
    const wdt = S.slowmo > 0 ? dt * 0.25 : dt;
    S.slowmo = Math.max(0, S.slowmo - dt); S.slowCool = Math.max(0, S.slowCool - dt);
    step(wdt, inp, dt);
  }
  function stopLoops() { for (const l of ['wind', 'rain', 'buzz', 'rotor']) sfx.loop(l, false); }

  function step(dt, inp, realDt) {
    S.t += dt;
    const P = S.P;
    for (const k of ['steady', 'chalk', 'pole', 'calm', 'spotter', 'net', 'guide']) { const b = S.buff[k]; if (b && b.t > 0) { b.t = Math.max(0, b.t - dt); if (b.t === 0) b.owners = []; } }
    for (const w of S.world.banners) if (w.tearT > 0) w.tearT -= dt;
    for (const f of S.flyoff) f.t += dt;
    S.flyoff = S.flyoff.filter((f) => f.t < 2);
    for (const q of S.pops) q.t -= dt;
    S.pops = S.pops.filter((q) => q.t > 0);
    if (S.cine) { sfx.loop('rotor', true); tickSummit(dt); camera(dt); return; }
    if (S.grace > 0 && onRope(S)) S.grace = Math.max(0, S.grace - dt);
    tickDispatch(S, dt);
    const list = tickHazards(S, dt);
    for (const b of S.blame.values()) b.w *= Math.exp(-dt / 2.0);
    for (const [k, b] of S.blame) if (b.w < 0.01) S.blame.delete(k);
    switch (P.phase) {
      case 'walk': {
        const ext = externalTorque(S, list);
        for (const part of ext.parts) if (part.src) addBlame(part.src, Math.abs(part.tau) * ext.k * dt);
        S.extNow = ext;
        const r = updateWalk(S, inp, dt, ext);
        if (r && r.fell) { fall(r.dir); break; }
        if (S.knockQ) { const kq = S.knockQ; S.knockQ = null; S.shake = Math.max(S.shake, 0.5); sfx.play('clang'); fall(kq.dir, kq.src); break; }
        const sp = S.world.spans[P.span];
        // banana peels: pass one standing = slip; crouched = flick it off the rope
        if (r) for (const pl of S.haz.peels) {
          if (pl.span !== P.span || pl.drop > 0 || pl.gone) continue;
          const crossed = (r.prevS < pl.s && P.s >= pl.s) || (r.prevS > pl.s && P.s <= pl.s);
          if (!crossed) continue;
          pl.gone = true;
          if (P.crouch) { sfx.play('flick'); chip(S, `${pl.src.tag || 'PEEL'}'s PEEL FLICKED OFF`, PAL.help); S.flyoff.push({ x: P.x, y: P.y, end: sp.dirX, t: 0, peel: true }); }
          else { const dir = Math.sign(P.theta) || -P.stepSign || 1; kick(pl.src, dir * 1.5); addBlame(pl.src, 0.6); P.v *= 0.3; sfx.play('slip'); S.stamp = { text: 'SLIP!', color: PAL.banana, t: 0.9 }; }
        }
        S.haz.peels = S.haz.peels.filter((pl) => !pl.gone);
        if (P.s >= sp.len) {
          const next = P.span + 1;
          bankAnchor(next);
          if (next >= S.world.n) { startSummit(); break; }
          P.span = next; P.s = 0; P.stepAcc = 0; placeOnRope(S); S.spanFalls = { span: -1, n: 0 };
          S.resume = { span: next, s: 0 };
        }
        progress(P.span, P.s);
        if (onRope(S) || P.s < BAL.SAFE_END) { S.stall.t += dt; if (S.stall.t >= S.knob.stallAssistS) { S.stall.t = 0; S.buff.guide = { t: 25, owners: [] }; chip(S, 'RESISTANCE GUIDE LINE: STEADIER ROPE 25s', PAL.help); sfx.play('pole'); } }
        break;
      }
      case 'tip': {
        P.pt += dt;
        P.theta += P.fall.dir * dt * 2.5; P.fall.rot = P.theta;
        if (S.slowmo <= 0 && P.pt > 0.12) afterTip();
        break;
      }
      case 'plunge': if (stepPlunge(S, dt) === 'landed') onLanded(); break;
      case 'landed': P.pt += dt; if (P.pt > 1.6) { P.phase = 'recover'; P.pt = 0; } break;
      case 'recover': {
        P.pt += dt;
        if (P.pt >= 0.9 && !P.recovered) { P.recovered = true; resumeAt(S.resume.span, S.resume.s); P.phase = 'recover'; P.pt = 0.9; S.camY = P.y - 6.2; }
        if (P.pt >= 1.8) { P.recovered = false; P.phase = 'walk'; chip(S, S.resume.planted ? `RESUMED AT ${S.resume.tag}` : `RESUMED AT ANCHOR ${S.resume.span}`, PAL.bone); }
        break;
      }
      case 'harness': {
        P.pt += dt;
        const F = P.fall, ra = ropeAt(S.world.spans[S.resume.span], S.resume.s);
        if (P.pt < 0.45) { P.y = F.fromY - 2.4 * (P.pt / 0.45) ** 2; }
        else if (P.pt < 1.3) { P.y = F.fromY - 2.4 + Math.sin((P.pt - 0.45) * 9) * 0.25 * (1.3 - P.pt); P.x = F.x + Math.sin((P.pt - 0.45) * 5) * 0.4; if (!F.savedCard) { F.savedCard = true; onSaved(); } }
        else { const f = clamp((P.pt - 1.3) / 1.5, 0, 1), e = f * f * (3 - 2 * f); P.x = F.x + (ra.x - F.x) * e; P.y = (F.fromY - 2.4) + (ra.y - (F.fromY - 2.4)) * e + Math.sin(f * Math.PI) * 1.2; }
        P.theta *= Math.exp(-3 * dt);
        if (P.pt >= 2.8) resumeAt(S.resume.span, S.resume.s);
        break;
      }
      case 'net': {
        P.pt += dt;
        const F = P.fall;
        if (P.pt < 0.35) P.y = F.fromY - 2.3 * (P.pt / 0.35) ** 2;
        else { const f = clamp((P.pt - 0.35) / 0.75, 0, 1); P.y = F.fromY - 2.3 + 2.3 * Math.sin(f * Math.PI / 2) + Math.sin(f * Math.PI) * 0.8; if (!F.savedCard) { F.savedCard = true; onSaved(); sfx.play('net'); } }
        P.theta *= Math.exp(-4 * dt);
        if (P.pt >= 1.1) resumeAt(P.span, P.s);
        break;
      }
      case 'lift': tickLift(dt); break;
      default: break;
    }
    camera(realDt);
    const H = S.haz;
    sfx.loop('wind', !!(H.storm && H.storm.tele <= 0) || !!(P.breeze && Math.abs(P.breeze) > 0.05));
    sfx.loop('rain', !!(H.storm && H.storm.tele <= 0));
    sfx.loop('buzz', H.drones.length > 0);
  }

  function camera(dt) {
    const P = S.P;
    const plunging = P.phase === 'plunge' || P.phase === 'landed';
    const target = S.cine ? P.y - 8.5 : plunging ? P.y - 10.5 : P.y - 6.2;
    S.camY += (target - S.camY) * Math.min(1, dt * (plunging ? 10 : 4));
    S.camY = Math.max(-0.4, Math.min(S.camY, S.world.top + 6 - VIEW_M + 4));
    S.shake = Math.max(0, S.shake - dt);
    S.flash = Math.max(0, S.flash - dt);
  }

  // ---------- summit ----------
  function startSummit() {
    const P = S.P, runSec = S.sessionT - S.run.realT0;
    S.summits++;
    const lv = S.world.level;
    S.run.score += 1000 * (1 + lv);
    const n = (store.base.summits || 0) + S.summits;
    if (S.bestRunSec == null || runSec < S.bestRunSec) S.bestRunSec = runSec;
    const us = [...S.run.users.values()];
    const helpersTop = us.filter((u) => u.given > 0).sort((a, b) => b.given - a.given).slice(0, 5);
    const sabsTop = us.filter((u) => u.falls > 0).sort((a, b) => b.dropM - a.dropM).slice(0, 3);
    S.runs.push({ score: Math.round(S.run.score), spans: S.world.n, heightM: Math.round(S.world.top), sec: Math.round(runSec), level: lv, falls: S.run.falls, date: new Date().toISOString().slice(0, 10), hero: S.heroName });
    const nextLevel = Math.min(S.summits, S.knob.summitCap);
    S.cine = { t: 0, dur: 8, n, runSec, helpersTop, sabsTop, nextLevel, score: Math.round(S.run.score), falls: S.run.falls, px: P.x, py: P.y };
    S.haz = emptyHaz(); P.phase = 'summit'; P.v = 0; P.theta = 0; P.omega = 0;
    sfx.play('summit'); store.clip('summit', null, `SUMMIT #${n} · ${Math.round(S.run.score)} pts`);
    save();
  }
  function tickSummit(dt) {
    const c = S.cine, P = S.P;
    c.t += dt;
    const rise = Math.max(0, c.t - 1.6) * 2.2;
    P.x = c.px + (7.7 - c.px) * clamp((c.t - 1.6) / 2, 0, 1); P.y = c.py + rise;
    if (c.t >= c.dur) {
      sfx.loop('rotor', false);
      S.runNo++;
      newRun(c.nextLevel);
      S.banner = { text: `CITY ${S.runNo + 1} · LEVEL ${S.world.level}`, sub: S.world.level ? `${S.world.n} spans · wobble +${6 * S.world.level}% · breeze +${15 * S.world.level}%` : 'scaling capped at 0', color: S.world.level ? PAL.sab : PAL.bone, t: 4 };
    }
  }

  // ---------- UI timers + boards ----------
  function tickUi(dt) {
    for (const c of S.chips) c.t -= dt;
    S.chips = S.chips.filter((c) => c.t > 0);
    if (!S.card && S.cards.length) { S.card = S.cards.shift(); sfx.play(S.card.kind === 'revenge' ? 'revenge' : S.card.kind === 'save' ? 'harness' : 'scratch'); sfx.duck(true); }
    if (S.card) { S.card.t -= dt; if (S.card.t <= 0) { S.card = null; if (!S.cards.length) sfx.duck(false); } }
    if (S.banner) { S.banner.t -= dt; if (S.banner.t <= 0) S.banner = null; }
    if (S.cinema) { S.cinema.t += dt; if (S.cinema.t >= S.cinema.dur) S.cinema = null; }
    if (S.stamp) { S.stamp.t -= dt; if (S.stamp.t <= 0) S.stamp = null; }
    for (const a of S.awningWob || []) a.t -= dt;
    S.boardClock = (S.boardClock || 0) - dt;
    if (S.boardClock <= 0) { S.boardClock = 3; refreshBoards(); }
  }
  function refreshBoards() {
    const doc = store.merged(S.session, S.summits, S.bestRunSec, S.runs);
    S.titles = new Map(Object.entries(doc.viewers).filter(([, v]) => v._t).map(([id, v]) => [id, v._t]));
    const tc = (id, team) => { const t = S.titles.get(id); return t ? TITLES[t].color : team === 'sab' ? PAL.sab : PAL.help; };
    const topH = (rows) => rows.filter((r) => r[1].metersGiven > 0).sort((a, b) => b[1].metersGiven - a[1].metersGiven).slice(0, 5).map(([id, v]) => ({ name: platformBadge(id) + v.name, val: `${Math.round(v.metersGiven)} M`, color: tc(id, v.team) }));
    const topS = (rows) => rows.filter((r) => r[1].falls > 0).sort((a, b) => b[1].dropM - a[1].dropM).slice(0, 5).map(([id, v]) => ({ name: platformBadge(id) + v.name, val: `${v.falls}× −${Math.round(v.dropM)}M`, color: tc(id, v.team) }));
    const sess = [...S.session.entries()], all = Object.entries(doc.viewers);
    S.boards = [
      { title: 'TOP HELP · TONIGHT', color: PAL.help, rows: topH(sess) },
      { title: 'WHO MADE HIM FALL · TONIGHT', color: PAL.sab, rows: topS(sess) },
      { title: 'TOP HELP · ALL TIME', color: PAL.help, rows: topH(all) },
      { title: 'MOST WANTED · ALL TIME', color: PAL.sab, rows: topS(all) },
      { title: 'BEST RUNS', color: PAL.sodium, rows: doc.runs.slice(0, 5).map((r) => ({ name: `L${r.level} · ${Math.floor(r.sec / 60)}:${String(r.sec % 60).padStart(2, '0')} · ${r.falls}F`, val: `${r.score}`, color: PAL.bone })) },
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
    if (S.knob[k] !== before) { saveKnobs(); st.savedT = 1.5; }
  }
  const fmtH = (s) => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
  function save(beacon) { if (store.loaded) store.save(store.merged(S.session, S.summits, S.bestRunSec, S.runs), { beacon }); }
  if (hasDom) window.addEventListener('beforeunload', () => save(true));

  // ---------- platform hooks ----------
  function onEvent(raw, map) {
    if (!raw || !raw.type) return;
    const evt = cleanEvent(raw);
    const label = intake(S, evt);
    if (map) {
      if (label) map.label = evt.type === 'gift' && map.whale ? label.replace(/^(HELP|SAB): /, '') : label;
      else if (evt.type === 'like') map.label = 'CROWD METER';
      else if (evt.type === 'comment' || evt.type === 'join') map.label = '';
      map.sound = null;
      if (evt.type === 'gift' && map.whale) sfx.play('whale');
    }
  }

  const renderer = createRenderer({ W, H, transparent, getState: () => S, fmtH, streamerKeys });
  const game = {
    onEvent, update, render: (ctx) => renderer.render(ctx),
    reset() { sfx.loop('rotor', false); newRun(0); S.summits = 0; },
    newSession() {
      if (store.loaded) { const doc = store.merged(S.session, S.summits, S.bestRunSec, S.runs); store.save(doc); store.adopt(doc); }
      sfx.stopLoops(); sfx.duck(false);
      const musicOff = S.musicOff;
      freshSession(); saveClock = 0; S.musicOff = musicOff;
    },
    onIdle() { S.serverIdle = true; if (!S.over && S.idleT >= 10 && !S.onBreak) { S.onBreak = true; sfx.play('lounge'); } },
    onActive() { S.serverIdle = false; if (S.onBreak) { S.onBreak = false; S.idleT = 0; S.swallow = true; } },
    takeFeed() { if (!S.feedOut.length) return []; const out = S.feedOut; S.feedOut = []; return out; },
    onConfig() { // gifts.json hot reload: re-read our own config.json too (cheap)
      loadJSON('./tightrope/config.json').then((c) => { if (c && c.tiers) { CFG = c; S.cfg = c; S.heroName = String(c.heroName || 'PATCH').toUpperCase().slice(0, 12); } }).catch(() => {});
    },
    overlayLayout: {
      feed: { x: 20, bottom: 1880, lines: 4, lineH: 66, fontPx: 30, maxWidth: 652 },
      board: false, pill: { x: 24, y: 528 },
      // compact whale banner in the bottom lane (feed + board): it never covers the rope, so a whale SAB telegraphs at once
      whale: { mode: 'compact', top: 1640, bottom: 1920 },
      hideFeed: () => !!S.card,
    },
    get afk() { return S.onBreak; },
    get debug() {
      const P = S.P, H = S.haz;
      return {
        phase: P.phase, span: P.span, s: P.s, spans: S.world.n, level: S.world.level, heightM: P.y, theta: P.theta, omega: P.omega, crouch: P.crouch, grip: P.grip,
        score: Math.round(S.run.score), falls: S.run.falls, fallsTonight: S.fallsTonight, summits: S.summits, runNo: S.runNo,
        haz: { gusts: H.gusts.length, pigeons: H.pigeons.length, peels: H.peels.length, drones: H.drones.length, twang: !!H.twang, shake: !!H.shake, fog: !!H.fog, storm: !!H.storm, crane: !!H.crane },
        buff: Object.fromEntries(Object.entries(S.buff).map(([k, v]) => [k, Array.isArray(v) ? v.length : +(v.t || 0).toFixed(2)])),
        ext: S.extNow ? S.extNow.ext : 0, extRaw: S.extNow ? S.extNow.raw : 0,
        heat: S.heat, jammer: S.jammer, panic: S.panic, crowd: S.crowd.charge, paused: S.paused, onBreak: S.onBreak,
        held: S.held.length, pending: S.pending.length, sabQ: S.sabQ.length, credited: { ...S.credited }, fired: { ...S.fired }, barrages: { ...S.barrages },
        resume: { ...S.resume }, posters: S.posters.map((p) => ({ name: p.name, state: p.state })), card: S.card ? { kind: S.card.kind, lines: S.card.lines, loss: S.card.loss } : null,
      };
    },
    dev: {
      input, get S() { return S; }, store, kick,
      warp(span, s = 0) { S.P.lift = null; resumeAt(span, s); for (const a of S.world.anchors) a.banked = a.i <= span; S.resume = { span, s: 0 }; S.run.best = S.cum[span] + s; S.camY = S.P.y - 6.2; },
      setTeam(user, team) { S.teams.set(user.id, { team, at: -9999, name: user.nickname }); stat(S, user).team = team; },
      summit() { startSummit(); },
      card(c) { showCard(c); },
      fall(dir = 1, src = null) { fall(dir, src); },
      teamOf: (u) => teamOf(S, u), fmtH,
    },
  };
  return game;
}
