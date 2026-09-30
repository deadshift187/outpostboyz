// CLIMB OR DIE: web edition bootstrap (outpostboyz.com, free, no server).
// The stream edition's platform wires a WebSocket gift feed into the game; here the feed is
// local: a simulated LIVE chat (chat.js) plus the player's own YOU ARE THE CHAT tray. The
// player is the streamer: keyboard, gamepad, or the touch pad below the stage (touch buttons
// send the same key codes the game already reads). A run is one shift: reach BIRD-9's rope
// at 250 m before the chopper leaves.
import { mapEvent } from './platform/gifts.js';
import { createOverlay } from './platform/overlay.js';
import { createChat, TRAY, GIFTS } from './chat.js';

const W = 1080, H = 1920, CAM = 520, VH = H - CAM; // the stream's HOST CAM strip (0-520) is cropped off
const LIMIT = 420; // seconds until BIRD-9 leaves
const SLUG = 'climb-or-die';
const $ = (id) => document.getElementById(id);
const mem = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
};

// ---------- audio: a master gain on every AudioContext the game creates ----------
// (mute button, paused and hidden tabs go silent without touching the game's synth code)
let muted = mem.get('cod-muted') === '1', paused = false, hidden = false;
const acs = [];
const level = () => (muted || paused || hidden ? 0 : 1);
(function tapAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    class TappedAC extends AC {
      constructor(...a) {
        super(...a);
        const g = super.createGain();
        g.gain.value = level();
        g.connect(super.destination);
        this._ob = g;
        acs.push(this);
      }
      get destination() { return this._ob || super.destination; }
    }
    window.AudioContext = TappedAC;
    if (window.webkitAudioContext) window.webkitAudioContext = TappedAC;
  } catch (e) { /* no subclassing: mute falls back to the game's own music toggle */ }
})();
function applyAudio() { for (const ac of acs) { try { ac._ob.gain.setValueAtTime(level(), ac.currentTime); } catch (e) { /* closed */ } } }
function wakeAudio() { for (const ac of acs) if (ac.state === 'suspended') ac.resume().catch(() => {}); }

// ---------- game + platform pieces ----------
const giftMap = await fetch('gifts.json').then((r) => r.json()).catch(() => ({}));
const { createGame } = await import('./game/index.js');
const game = createGame({ W, H });
try { game.onConfig(giftMap); } catch (e) { /* defaults */ }
const overlay = createOverlay({ W, H, options: { ...game.overlayLayout, hud: false } });
const S = () => game.dev.S;

function send(e) {
  const m = mapEvent(e, giftMap);
  try { game.onEvent(e, m); } catch (err) { console.error('[game] onEvent', err); }
  overlay.push(e, m);
}
const chat = createChat({ emit: send });

// the tray's senders: one per side, so a 10+ coin tray gift always resolves to the side you picked
const YOU = { help: { id: 'you-help', nickname: 'YOU', avatarUrl: '' }, sab: { id: 'you-sab', nickname: 'YOU', avatarUrl: '' } };
let msg = 0;

// ---------- stage fit ----------
const canvas = $('stage');
canvas.width = W; canvas.height = VH;
const ctx = canvas.getContext('2d');
const wrap = $('stageWrap');
function fit() {
  const r = wrap.getBoundingClientRect();
  const s = Math.max(0.05, Math.min(r.width / W, r.height / VH));
  canvas.style.width = Math.floor(W * s) + 'px';
  canvas.style.height = Math.floor(VH * s) + 'px';
  $('tray').style.maxWidth = Math.max(340, Math.floor(W * s)) + 'px';
}
addEventListener('resize', fit);
addEventListener('orientationchange', () => setTimeout(fit, 250));
if (window.ResizeObserver) new ResizeObserver(fit).observe(wrap);

// ---------- touch detection ----------
const body = document.body;
const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
if (coarse || 'ontouchstart' in window) body.classList.add('touch');
addEventListener('touchstart', () => { if (!body.classList.contains('touch')) { body.classList.add('touch'); fit(); } }, { passive: true, capture: true });
fit();

// ---------- run state ----------
let state = 'menu', runT = 0, winT = null, submitted = false, last = performance.now();
const readyAt = { help: TRAY.help.map(() => 0), sab: TRAY.sab.map(() => 0) };
let likeReady = 0;

async function startRun() {
  const st = game.dev.store, s = S();
  // bank this browser's all-time boards (bots + YOU), then a brand-new session
  try { st.save(st.merged(s.session, s.summits, s.bestRunSec)); await st.load(); } catch (e) { /* storage blocked */ }
  game.dev.fresh();
  game.dev.setTeam(YOU.help, 'help');
  game.dev.setTeam(YOU.sab, 'sab');
  overlay.reset();
  chat.start();
  runT = 0; winT = null; submitted = false; likeReady = 0;
  for (const k of ['help', 'sab']) readyAt[k].fill(0);
  releaseAll();
  state = 'play';
  setPaused(false);
  show(null);
  body.classList.add('playing');
  wakeAudio();
  last = performance.now();
}

function finish(kind) {
  if (state !== 'play') return;
  state = 'over';
  const s = S();
  s.over = true; // the game holds itself (hazard loops stop, gifts queue)
  releaseAll();
  body.classList.remove('playing');
  const best = Math.floor(s.maxY / 100);
  const won = kind === 'win';
  const left = won ? Math.max(0, Math.round(LIMIT - winT)) : 0;
  const score = won ? 250 + left : best;
  const us = [...s.run.users.values()].filter((u) => !/^you-/.test(u.id));
  const mvp = us.filter((u) => u.given > 0).sort((a, b) => b.given - a.given)[0];
  const gremlin = us.filter((u) => u.taken > 0).sort((a, b) => b.taken - a.taken)[0];
  $('overTitle').textContent = won ? 'EXTRACTED!' : 'LEFT BEHIND';
  $('overTitle').className = won ? 'win' : 'lose';
  $('overSub').textContent = won ? `PATCH made BIRD-9 with ${fmt(left)} to spare.` : `BIRD-9 took off. PATCH topped out at ${best} m.`;
  $('overScore').textContent = String(score);
  $('overLines').innerHTML = [
    won ? `250 m + ${left} s left` : `best height ${best} m`,
    `chat gave <b class="h">+${Math.round(s.run.given)} m</b> · took <b class="s">−${Math.round(s.run.taken)} m</b>`,
    mvp ? `MVP helper <b class="h">${esc(mvp.name)}</b>` : '',
    gremlin ? `worst gremlin <b class="s">${esc(gremlin.name)}</b>` : '',
  ].filter(Boolean).map((l) => `<div>${l}</div>`).join('');
  show('over');
  if (!submitted) {
    submitted = true;
    try {
      if (window.OB) {
        const p = OB.submitScore(SLUG, score); if (p && p.catch) p.catch(() => {});
        const q = OB.gameOver(SLUG); if (q && q.catch) q.catch(() => {});
      }
    } catch (e) { /* offline / blocked: the game never depends on it */ }
  }
}

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = (sec) => { sec = Math.max(0, Math.ceil(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };

function show(id) {
  for (const p of ['menu', 'paused', 'over']) $(p).classList.toggle('on', p === id);
}
function setPaused(v) {
  paused = !!v;
  if (paused) releaseAll();
  applyAudio();
  if (paused && state === 'play') show('paused');
  else if (!paused && state === 'play') show(null);
}

// ---------- key synthesis (touch pad / tray / canvas tap -> the game's own key codes) ----------
// A synthesized key is held for at least 60 ms, so a quick tap still spans a game frame (the
// game reads held keys once per frame; a same-frame down+up would be lost).
const down = new Map(), upT = new Map();
const fire = (code, on) => dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code, key: code === 'Space' ? ' ' : code, bubbles: true }));
function key(code, on, now = false) {
  clearTimeout(upT.get(code)); upT.delete(code);
  if (on) { if (!down.has(code)) { down.set(code, performance.now()); fire(code, true); } return; }
  if (!down.has(code)) return;
  const wait = 60 - (performance.now() - down.get(code));
  if (wait > 0 && !now) { upT.set(code, setTimeout(() => key(code, false, true), wait)); return; }
  down.delete(code); fire(code, false);
}
function releaseAll() { for (const c of [...down.keys()]) key(c, false, true); }

// canvas: tap / click = jump (hold for full height)
canvas.addEventListener('pointerdown', (e) => {
  if (state !== 'play' || paused) return;
  e.preventDefault();
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  key('Space', true);
});
for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(t, () => key('Space', false));

// d-pad: one pointer, slide between directions without lifting the thumb
const pad = $('dpad');
let padId = null;
function padAt(e) {
  const r = pad.getBoundingClientRect();
  const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
  const L = dx < -0.25, R = dx > 0.25, U = dy < -0.45, D = dy > 0.45 && Math.abs(dx) < 0.6;
  key('ArrowLeft', L); key('ArrowRight', R); key('ArrowUp', U); key('ArrowDown', D);
  pad.dataset.dir = (U ? 'u' : '') + (D ? 'd' : '') + (L ? 'l' : '') + (R ? 'r' : '');
}
function padOff() { padId = null; for (const c of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) key(c, false); pad.dataset.dir = ''; }
pad.addEventListener('pointerdown', (e) => { if (state !== 'play' || paused) return; e.preventDefault(); padId = e.pointerId; try { pad.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } padAt(e); });
pad.addEventListener('pointermove', (e) => { if (e.pointerId === padId) padAt(e); });
for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) pad.addEventListener(t, (e) => { if (e.pointerId === padId) padOff(); });

// action buttons: hold-able
for (const [id, code] of [['bJump', 'Space'], ['bDash', 'ShiftLeft'], ['bGrapple', 'KeyE']]) {
  const b = $(id);
  b.addEventListener('pointerdown', (e) => { if (state !== 'play' || paused) return; e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } b.classList.add('on'); key(code, true); });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(t, () => { b.classList.remove('on'); key(code, false); });
}

// ---------- YOU ARE THE CHAT tray ----------
let side = 'help';
const giftBtns = $('gifts');
function buildTray() {
  giftBtns.innerHTML = TRAY[side].map((g, i) => `<div class="gift ${side}" role="button" data-i="${i}" aria-label="${esc(g.name)}: ${g.fx}"><span class="ic">${g.icon}</span><span class="fx">${g.fx}</span><i></i></div>`).join('');
  $('side').dataset.side = side;
  $('side').setAttribute('aria-label', side === 'help' ? 'Tray: HELP gifts (tap for SAB)' : 'Tray: SAB gifts (tap for HELP)');
}
buildTray();
$('side').addEventListener('click', () => { side = side === 'help' ? 'sab' : 'help'; buildTray(); lastCd = ''; });
giftBtns.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('.gift');
  if (!b || state !== 'play' || paused) return;
  e.preventDefault();
  const i = Number(b.dataset.i), g = TRAY[side][i];
  if (runT < readyAt[side][i]) return;
  readyAt[side][i] = runT + g.cd;
  send({ type: 'gift', platform: 'tiktok', msgId: 'you-' + (++msg), user: YOU[side], gift: { name: g.name, id: g.name.toLowerCase().replace(/\W/g, ''), coins: GIFTS[g.name], count: 1 } });
  b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
});
$('like').addEventListener('pointerdown', (e) => {
  if (state !== 'play' || paused) return;
  e.preventDefault();
  if (runT < likeReady) return;
  likeReady = runT + 0.25;
  send({ type: 'like', platform: 'tiktok', msgId: 'you-' + (++msg), user: YOU[side], likeCount: 15 });
});
let lastCd = '';
function trayCooldowns() {
  const parts = [];
  const btns = giftBtns.children;
  TRAY[side].forEach((g, i) => { const left = Math.max(0, readyAt[side][i] - runT); parts.push(left > 0 ? Math.ceil((left / g.cd) * 20) : 0); });
  const sig = parts.join(',');
  if (sig === lastCd) return;
  lastCd = sig;
  parts.forEach((p, i) => { if (btns[i]) { btns[i].style.setProperty('--cd', String(p / 20)); btns[i].classList.toggle('cool', p > 0); } });
}

// ---------- chrome buttons ----------
function paintMute() { $('mute').textContent = muted ? '🔇' : '🔊'; $('mute').setAttribute('aria-label', muted ? 'Unmute' : 'Mute'); }
paintMute();
$('mute').addEventListener('click', () => { muted = !muted; mem.set('cod-muted', muted ? '1' : '0'); paintMute(); applyAudio(); wakeAudio(); });
$('pause').addEventListener('click', () => { if (state === 'play') setPaused(!paused); });
$('resume').addEventListener('click', () => { wakeAudio(); setPaused(false); last = performance.now(); });
$('start').addEventListener('click', () => { mem.set('cod-seen', '1'); startRun(); });
$('again').addEventListener('click', () => startRun());
$('howBtn').addEventListener('click', () => $('menu').classList.remove('brief'));
if (mem.get('cod-seen') === '1') $('menu').classList.add('brief');
addEventListener('keydown', (e) => {
  if (e.code === 'Enter' || (e.code === 'Space' && state !== 'play')) {
    if (state === 'menu') { e.preventDefault(); mem.set('cod-seen', '1'); startRun(); }
    else if (state === 'over') { e.preventDefault(); startRun(); }
    else if (paused) { e.preventDefault(); wakeAudio(); setPaused(false); }
  }
  if (e.code === 'Escape' && state === 'play') setPaused(!paused);
});

// pause whenever the page is hidden (app switch, tab change, phone lock)
function onHide() { hidden = true; if (state === 'play' && !paused) setPaused(true); releaseAll(); applyAudio(); for (const ac of acs) if (ac.state === 'running') ac.suspend().catch(() => {}); }
function onShow() { hidden = false; applyAudio(); last = performance.now(); }
document.addEventListener('visibilitychange', () => (document.hidden ? onHide() : onShow()));
addEventListener('pagehide', onHide);
addEventListener('blur', releaseAll);

// ---------- loop ----------
let hudSig = '';
function hud() {
  const s = S();
  const left = LIMIT - runT;
  const txt = `${fmt(left)}|${Math.floor(s.player.y / 100)}`;
  if (txt === hudSig) return;
  hudSig = txt;
  $('clock').textContent = fmt(left);
  $('clockBox').classList.toggle('low', state === 'play' && left <= 30);
  $('best').textContent = `${Math.floor(Math.max(0, s.player.y) / 100)} / 250 M`;
}

function frame(now) {
  const dt = Math.min(1 / 30, Math.max(0, (now - last) / 1000));
  last = now;
  if (!paused) {
    if (state === 'play') {
      game.update(dt);
      const s = S();
      if (!s.holding()) {
        runT += dt;
        chat.tick(dt, { heightM: s.player.y / 100, limitS: LIMIT });
      }
      if (s.cine) {
        if (winT == null) winT = runT;
        if (s.cine.t >= 6) finish('win');
      } else if (runT >= LIMIT) finish('lose');
      const g = !!(s.fx && s.fx.grapple);
      if (g !== body.classList.contains('grapple')) body.classList.toggle('grapple', g);
      trayCooldowns();
    } else if (state === 'over') game.update(dt);
    for (const f of game.takeFeed()) overlay.note(f);
    overlay.update(dt);
  }
  ctx.setTransform(1, 0, 0, 1, 0, -CAM);
  ctx.clearRect(0, CAM, W, VH);
  game.render(ctx);
  ctx.setTransform(1, 0, 0, 1, 0, -CAM);
  overlay.render(ctx);
  hud();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
body.classList.add('ready');

// debug / headless-test handle
window.__cod = {
  game, chat, send, LIMIT,
  get state() { return state; }, get paused() { return paused; },
  get runT() { return runT; }, set runT(v) { runT = v; },
  get muted() { return muted; }, get audioLevel() { return level(); },
};
