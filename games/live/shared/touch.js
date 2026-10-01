// Phone touch controls: a d-pad (4- or 8-way) plus the game's action buttons. Every control dispatches the game's
// own KeyboardEvent.code on window (keydown while held, keyup on release), so the games need no changes.
// meta.dpadKeys overrides a direction's code (pileup: up = Space = hard drop); a button marked 'hold' shows HOLD.
const ARROWS = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

export function createTouch({ root, meta, onMenu }) {
  const DIR_CODES = { ...ARROWS, ...(meta.dpadKeys || {}) };
  const held = new Map(); // code -> count of pointers holding it
  const key = (type, code) => { try { window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true })); } catch (e) { /* old browser */ } };
  const press = (code) => { const n = held.get(code) || 0; held.set(code, n + 1); if (!n) key('keydown', code); };
  const release = (code) => { const n = held.get(code) || 0; if (n <= 1) { held.delete(code); if (n) key('keyup', code); } else held.set(code, n - 1); };
  const el = document.createElement('div');
  el.className = 'touch';
  el.innerHTML = `<div class="dpad" data-ways="${meta.dpad || 8}"><span class="dp-up">▲</span><span class="dp-down">▼</span><span class="dp-left">◀</span><span class="dp-right">▶</span><i class="dp-knob"></i></div>
    <div class="tbtns${(meta.buttons || []).length > 3 ? ' many' : ''}">${(meta.buttons || []).map(([label, code, kind]) => `<button type="button" class="tbtn${kind === 'hold' ? ' hold' : ''}" data-code="${code}"${kind === 'hold' ? ' data-hold="1"' : ''}>${label}${kind === 'hold' ? '<small>HOLD</small>' : ''}</button>`).join('')}</div>
    <div class="tsys"><button type="button" class="tbtn small" data-code="KeyP">II</button><button type="button" class="tbtn small menu-btn" data-menu="1">⚙</button></div>`;
  root.appendChild(el);

  // d-pad: one pointer, direction from the angle to the centre (dead zone 18 % of the radius)
  const pad = el.querySelector('.dpad'), knob = el.querySelector('.dp-knob');
  const ways = Number(meta.dpad) || 8;
  let padPointer = null, padDirs = new Set();
  function setDirs(next) {
    for (const d of padDirs) if (!next.has(d)) release(DIR_CODES[d]);
    for (const d of next) if (!padDirs.has(d)) press(DIR_CODES[d]);
    padDirs = next;
    for (const d of ['up', 'down', 'left', 'right']) pad.classList.toggle('on-' + d, next.has(d));
  }
  function padMove(e) {
    const r = pad.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const dx = e.clientX - cx, dy = e.clientY - cy, R = r.width / 2, dist = Math.hypot(dx, dy);
    const k = Math.min(1, dist / R) * R * 0.45;
    knob.style.transform = dist ? `translate(${(dx / dist) * k}px, ${(dy / dist) * k}px)` : '';
    const next = new Set();
    if (dist > R * 0.18) {
      const a = Math.atan2(dy, dx); // 0 = right, +pi/2 = down
      if (ways === 4) {
        if (Math.abs(dx) > Math.abs(dy)) next.add(dx > 0 ? 'right' : 'left'); else next.add(dy > 0 ? 'down' : 'up');
      } else {
        const oct = Math.round(a / (Math.PI / 4)); // -4..4
        const map = { 0: ['right'], 1: ['right', 'down'], 2: ['down'], 3: ['down', 'left'], 4: ['left'], '-4': ['left'], '-3': ['left', 'up'], '-2': ['up'], '-1': ['up', 'right'] };
        for (const d of map[oct] || []) next.add(d);
      }
    }
    setDirs(next);
  }
  pad.addEventListener('pointerdown', (e) => { e.preventDefault(); padPointer = e.pointerId; try { pad.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } padMove(e); });
  pad.addEventListener('pointermove', (e) => { if (e.pointerId === padPointer) padMove(e); });
  const padEnd = (e) => { if (e.pointerId !== padPointer) return; padPointer = null; knob.style.transform = ''; setDirs(new Set()); };
  pad.addEventListener('pointerup', padEnd); pad.addEventListener('pointercancel', padEnd); pad.addEventListener('lostpointercapture', padEnd);

  for (const b of el.querySelectorAll('.tbtn')) {
    if (b.dataset.menu) { b.addEventListener('click', (e) => { e.preventDefault(); onMenu && onMenu(); }); continue; }
    const code = b.dataset.code;
    let active = new Set();
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); active.add(e.pointerId); try { b.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } b.classList.add('on'); press(code); });
    const end = (e) => { if (!active.has(e.pointerId)) return; active.delete(e.pointerId); if (!active.size) b.classList.remove('on'); release(code); };
    b.addEventListener('pointerup', end); b.addEventListener('pointercancel', end); b.addEventListener('lostpointercapture', end);
  }
  el.addEventListener('contextmenu', (e) => e.preventDefault());

  const api = {
    el,
    show(on) { el.classList.toggle('show', !!on); if (!on) api.releaseAll(); },
    get visible() { return el.classList.contains('show'); },
    releaseAll() { setDirs(new Set()); for (const code of [...held.keys()]) { held.set(code, 1); release(code); } },
    get held() { return [...held.keys()]; },
  };
  return api;
}
