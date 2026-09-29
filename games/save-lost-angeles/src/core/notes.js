// PLAYTEST NOTES (dev only — localhost). Press N anywhere: the game freezes, a yellow post-it pops up, type what
// you want fixed, Enter saves it (Esc cancels). Each note lands in tests/out/note-<time>.json with the level,
// district, player x/y, tier and a screenshot, so the fix can be found without describing where you were.
(function () {
  'use strict';
  const LA = window.LA;
  if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.port !== '8790') return;   // dev server only
  let open = false, count = 0;

  const css = document.createElement('style');
  css.textContent = `
  #laNote{position:fixed;inset:0;z-index:99;display:flex;align-items:center;justify-content:center;background:rgba(10,6,20,.45)}
  #laNote .pad{width:min(420px,86vw);background:#ffe45c;color:#2a2112;padding:16px 16px 12px;transform:rotate(-1.5deg);
    box-shadow:0 14px 30px rgba(0,0,0,.45);font:600 15px/1.35 system-ui,sans-serif;border-radius:2px}
  #laNote .where{font:700 12px/1.3 ui-monospace,monospace;opacity:.7;margin-bottom:8px}
  #laNote textarea{width:100%;height:120px;border:0;background:transparent;resize:none;outline:none;color:#2a2112;
    font:600 17px/1.35 system-ui,sans-serif}
  #laNote .hint{font-size:12px;opacity:.65;margin-top:6px}
  #laNoteTag{position:fixed;right:10px;bottom:10px;z-index:98;background:#ffe45c;color:#2a2112;
    font:700 12px system-ui,sans-serif;padding:5px 8px;border-radius:3px;transform:rotate(2deg);
    box-shadow:0 3px 8px rgba(0,0,0,.35);cursor:pointer;user-select:none;opacity:.85}
  #laNoteToast{position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:99;background:#ffe45c;color:#2a2112;
    font:700 14px system-ui,sans-serif;padding:8px 14px;border-radius:3px;box-shadow:0 6px 16px rgba(0,0,0,.4)}`;
  document.head.appendChild(css);

  const tag = document.createElement('div');
  tag.id = 'laNoteTag'; tag.textContent = 'N = NOTE';
  tag.addEventListener('click', () => openNote());
  document.body.appendChild(tag);

  function where() {
    const S = LA.game && LA.game.S, p = S && S.players && S.players[0];
    const w = { scene: LA.scenes.curName, tier: S && S.tier && S.tier.id, level: S && S.level && S.level.id, levelName: S && S.level && S.level.name };
    if (p) {
      w.x = Math.round(p.x); w.y = Math.round(p.y);
      const zi = LA.city.seg ? LA.city.seg.findIndex((s) => p.x >= s[0] && p.x < s[1]) : -1;
      if (zi >= 0) w.district = LA.city.zones[zi].n || zi;
      if (S.boss) w.boss = S.boss.name;
    }
    return w;
  }
  function shot() {
    try {
      const cv = LA.view.ctx.canvas, k = Math.min(1, 960 / cv.width), c = document.createElement('canvas');
      c.width = Math.round(cv.width * k); c.height = Math.round(cv.height * k);
      c.getContext('2d').drawImage(cv, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.72);
    } catch (e) { return null; }
  }
  function toast(t) {
    const d = document.createElement('div'); d.id = 'laNoteToast'; d.textContent = t; document.body.appendChild(d);
    setTimeout(() => d.remove(), 1600);
  }
  function close(el) {
    el.remove(); open = false;
    for (const k in LA.input.keys) LA.input.keys[k] = false;                     // no stuck keys from typing
    LA.loop.start(LA.loop.update, LA.loop.render);
  }
  function openNote() {
    if (open) return; open = true;
    const w = where(), img = shot();
    LA.loop.stop();
    const el = document.createElement('div'); el.id = 'laNote';
    const label = [w.level && (w.level + ' ' + (w.levelName || '')), w.district, w.boss, w.x != null && ('x ' + w.x)].filter(Boolean).join(' · ') || w.scene;
    el.innerHTML = '<div class="pad"><div class="where"></div><textarea placeholder="What should change here?"></textarea>' +
      '<div class="hint">Enter = save · Shift+Enter = new line · Esc = cancel</div></div>';
    el.querySelector('.where').textContent = label;
    const ta = el.querySelector('textarea');
    ta.addEventListener('keydown', (e) => {
      e.stopPropagation();                                                        // typing never reaches the game
      if (e.key === 'Escape') { e.preventDefault(); close(el); }
      else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const text = ta.value.trim(); if (!text) return close(el);
        const t = new Date(), name = 'note-' + t.toISOString().replace(/[:.]/g, '-');
        fetch('/__save?name=' + name, { method: 'POST', body: JSON.stringify(Object.assign({ text, at: t.toISOString(), img }, w)) })
          .then(() => toast('NOTE ' + (++count) + ' SAVED')).catch(() => toast('NOTE NOT SAVED — server down?'));
        close(el);
      }
    });
    ta.addEventListener('keyup', (e) => e.stopPropagation());
    el.addEventListener('mousedown', (e) => { if (e.target === el) close(el); });
    document.body.appendChild(el);
    setTimeout(() => ta.focus(), 0);
  }
  addEventListener('keydown', (e) => { if (e.code === 'KeyN' && !open && !e.repeat) { e.preventDefault(); openNote(); } }, true);
})();
