// SAVE — LA.save. Per-tier progress (cleared levels, best score/time/grade/stars per level), unlocks
// (NATIVE tier, FULL CITY RUN), settings, and where to resume. One JSON blob in localStorage under
// 'laopus.save'. Storage can fail (private mode, kiosk with no disk, quota) — everything keeps working
// from memory and simply doesn't persist.
(function () {
  'use strict';
  const LA = window.LA;
  const KEY = 'laopus.save', VER = 1;
  const TIERS = ['tourist', 'local', 'native'];

  const blankTier = () => ({ cleared: {}, best: {}, beaten: false, intro: {}, at: '1-1' });
  const blank = () => ({
    v: VER,
    seen: { coldOpen: false },
    tiers: { tourist: blankTier(), local: blankTier(), native: blankTier() },
    unlocks: { native: false, fullrun: false },
    fullrun: {},                                   // tier -> { time, score }
    settings: { music: 8, sfx: 9, shake: true },   // volumes 0..10
    resume: null,                                  // { tier, players }
  });

  let data = blank(), persistent = true;

  function merge(into, from) {                      // tolerant merge: keep defaults for anything missing/bad
    if (!from || typeof from !== 'object') return into;
    for (const k in into) {
      if (!(k in from)) continue;
      const a = into[k], b = from[k];
      if (a && typeof a === 'object' && !Array.isArray(a)) into[k] = merge(Object.assign({}, a), b);
      else if (b == null || typeof b === typeof a || a == null) into[k] = b;
    }
    for (const k in from) if (!(k in into)) into[k] = from[k];   // per-level maps (cleared/best) have dynamic keys
    return into;
  }

  const save = LA.save = {
    get data() { return data; },
    get settings() { return data.settings; },
    get persistent() { return persistent; },
    load() {
      try {
        const raw = window.localStorage && window.localStorage.getItem(KEY);
        data = raw ? merge(blank(), JSON.parse(raw)) : blank();
      } catch (e) { persistent = false; data = blank(); }
      for (const t of TIERS) data.tiers[t] = merge(blankTier(), data.tiers[t]);
      return data;
    },
    write() {
      try { window.localStorage && window.localStorage.setItem(KEY, JSON.stringify(data)); persistent = true; return true; }
      catch (e) { persistent = false; return false; }
    },
    erase() { data = blank(); try { window.localStorage && window.localStorage.removeItem(KEY); } catch (e) { /* ignore */ } save.write(); },

    tier(t) { return data.tiers[t] || (data.tiers[t] = blankTier()); },
    tierUnlocked(t) { return t !== 'native' || !!data.unlocks.native; },
    isCleared(t, id) { return !!save.tier(t).cleared[id]; },
    // a level is open if it's the first, or the level before it is cleared on this tier
    isOpen(t, id) {
      const lv = LA.levels.byId[id]; if (!lv) return false;
      if (lv.index === 0) return true;
      const prev = LA.LEVELS[lv.index - 1];
      return save.isCleared(t, id) || save.isCleared(t, prev.id);
    },
    clearedCount(t) { return Object.keys(save.tier(t).cleared).length; },
    hasProgress(t) { return save.clearedCount(t) > 0; },
    best(t, id) { return save.tier(t).best[id] || null; },
    // the furthest open level on a tier (where the map walker starts by default)
    frontier(t) {
      let last = LA.LEVELS[0];
      for (const lv of LA.LEVELS) { if (save.isOpen(t, lv.id)) last = lv; else break; }
      return last.id;
    },
    // record a clear. Returns { first, bestScore, bestTime, rec }
    markClear(t, id, r) {
      const T = save.tier(t), first = !T.cleared[id];
      T.cleared[id] = true;
      const b = T.best[id] || {};
      const bestScore = !(b.score >= r.score), bestTime = !(b.time <= r.time);
      const gradeRank = (g) => ['S', 'A', 'B', 'C', 'D'].indexOf(g);
      T.best[id] = {
        score: Math.max(b.score || 0, r.score || 0),
        time: b.time != null ? Math.min(b.time, r.time) : r.time,
        grade: b.grade && gradeRank(b.grade) <= gradeRank(r.grade) ? b.grade : r.grade,
        stars: Math.max(b.stars || 0, r.stars || 0),
      };
      save.write();
      return { first, bestScore, bestTime, rec: T.best[id] };
    },
    // the final boss went down on tier t
    beat(t) {
      const T = save.tier(t); const firstBeat = !T.beaten; T.beaten = true;
      const u = data.unlocks, got = [];
      if (!u.fullrun) { u.fullrun = true; got.push('FULL CITY RUN'); }
      if ((t === 'local' || t === 'native') && !u.native) { u.native = true; got.push('NATIVE DIFFICULTY'); }
      save.write();
      return { firstBeat, unlocked: got };
    },
    fullrunBest(t) { return data.fullrun[t] || null; },
    markFullrun(t, time, score) {
      const b = data.fullrun[t], rec = !b || time < b.time;
      if (rec) data.fullrun[t] = { time, score };
      save.write();
      return rec;
    },
    setAt(t, id) { save.tier(t).at = id; save.write(); },
    setResume(tier, players) { data.resume = { tier, players: players || 1 }; save.write(); },
    setSetting(k, v) { data.settings[k] = v; save.write(); },
    markSeen(k) { data.seen[k] = true; save.write(); },
    introSeen(t, w) { return !!save.tier(t).intro[w]; },
    markIntro(t, w) { save.tier(t).intro[w] = true; save.write(); },
    anyProgress() { return TIERS.some((t) => save.hasProgress(t)); },
  };
  save.load();
})();
