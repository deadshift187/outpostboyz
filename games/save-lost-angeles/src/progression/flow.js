// FLOW — overrides LA.flow: boot → (cold open on first launch) → title → map → level → results → map …
// world-clear cards, world intros, the ending + credits, game over → arcade CONTINUE?, the Full City Run,
// and pause-menu actions. main.js merges this object over its defaults (Object.assign(defaults, LA.flow)).
(function () {
  'use strict';
  const LA = window.LA, save = LA.save;
  const go = (n, p) => LA.scenes.go(n, p);

  const flow = LA.flow = LA.flow || {};
  flow.tier = (save.data.resume && save.data.resume.tier) || 'local';
  flow.players = (save.data.resume && save.data.resume.players) || 1;

  flow.applySettings = function () {
    const s = save.settings, A = LA.audio;
    try { if (A && A.setVolume) { A.setVolume('music', s.music / 10); A.setVolume('sfx', s.sfx / 10); } } catch (e) { /* audio optional */ }
  };

  flow.boot = function () {
    flow.applySettings();
    if (!save.data.seen.coldOpen) go('cutscene', { id: 'cold', then: () => { save.markSeen('coldOpen'); go('title'); } });
    else go('title');
  };

  // ---------------- menus -> game ----------------
  flow.startGame = function (tier, players) {
    flow.tier = tier; flow.players = players || 1;
    save.setResume(tier, flow.players);
    LA.game.run = null;
    if (!save.introSeen(tier, 1) && !save.hasProgress(tier)) go('cutscene', { id: 'world', w: 1, then: () => { save.markIntro(tier, 1); go('map', {}); } });
    else go('map', {});
  };
  flow.continueGame = function () {
    const r = save.data.resume || { tier: 'local', players: 1 };
    flow.tier = r.tier; flow.players = r.players || 1;
    go('map', {});
  };
  flow.playLevel = function (id) {
    const run = LA.game.run;
    const fresh = !run || run.mode !== 'level' || run.tier.id !== flow.tier || run.lives <= 0;
    save.setAt(flow.tier, id);
    go('level', fresh ? { levelId: id, newRun: { tier: flow.tier, players: flow.players, mode: 'level' } } : { levelId: id });
  };
  flow.startFullRun = function (tier, players) {
    flow.tier = tier; flow.players = players || 1;
    go('level', { newRun: { mode: 'fullrun', tier, players: flow.players }, levelId: '1-1' });
  };

  // ---------------- per-level bookkeeping ----------------
  const isCitizen = (e) => /citizen|folk|hostage|rescue/i.test(e.kind || '');
  const isCrystal = (e) => /^(crystal|crys|coin)/i.test(e.kind || '') && !/power|gem/i.test(e.kind || '');
  LA.on('levelStart', (S) => {
    if (!S || !S.run) return;
    S._score0 = S.run.score;
    if (S.banner && !S.banner.boss) S.banner.t = 2.4;                        // the card may have eaten the banner time
    let cit = 0, crys = 0;
    for (const e of S.ents) { if (isCitizen(e)) cit++; else if (isCrystal(e)) crys += e.value || e.n || 1; }
    S._totals = { citizens: cit, crystals: crys };
    LA.preload(['newscum']);                                                 // the continue screen's guest star
  });

  // par time: a brisk run through the level + a boss fight allowance
  flow.par = (lv) => Math.round(lv.len / 240 + (lv.boss ? 55 : 0) + 12);

  function levelResults(S) {
    const lv = S.level, st = S.stats, tier = S.tier.id;
    const time = st.time || S.t, par = flow.par(lv);
    const tot = S._totals || {};
    const bonus = Math.max(0, Math.round(par - time)) * 20;
    // grade out of 100: clear 40 · no deaths 20 · crystals 20 · citizens 15 · pace 5
    let pts = 40;
    pts += st.deaths === 0 ? 20 : Math.max(-20, 12 - 8 * st.deaths);
    const cr = tot.crystals ? Math.min(1, st.crystals / tot.crystals) : (st.crystals > 0 ? 0.7 : 0.3);
    const sv = tot.citizens ? Math.min(1, st.saved / tot.citizens) : (st.saved > 0 ? 1 : 0.5);
    pts += cr * 20 + sv * 15 + (time <= par ? 5 : time <= par * 1.5 ? 2 : 0);
    const grade = pts >= 92 ? 'S' : pts >= 78 ? 'A' : pts >= 60 ? 'B' : 'C';
    const stars = 1 + (st.deaths === 0 ? 1 : 0) + (time <= par ? 1 : 0);
    const levelScore = S.run.score - (S._score0 || 0);
    return { kind: 'level', level: lv, tier, time, par, crystals: st.crystals, crysTotal: tot.crystals || 0, saved: st.saved, citTotal: tot.citizens || 0,
      deaths: st.deaths, bonus, levelScore, score: levelScore + bonus, grade, stars, how: S.clearHow };
  }

  flow.levelClear = function (S) {
    if (S.mode === 'fullrun') {
      const R = { kind: 'fullrun', tier: S.tier.id, time: S.run.time, score: S.run.score, crystals: S.run.crystalsTotal,
        saved: Math.max(S.run.saved || 0, S.stats.saved || 0), deaths: S.run.deaths || 0, continues: S.run.continues || 0 };
      R.best = save.fullrunBest(R.tier);
      R.record = save.markFullrun(R.tier, R.time, R.score);
      save.beat(R.tier);                                                       // finishing the whole city counts
      LA.scenes.push('results', { R });
      return;
    }
    const R = levelResults(S);
    S.run.score += R.bonus;
    const m = save.markClear(R.tier, R.level.id, { score: R.score, time: R.time, grade: R.grade, stars: R.stars });
    Object.assign(R, { first: m.first, bestScore: m.bestScore && !m.first, bestTime: m.bestTime && !m.first, rec: m.rec });
    const nx = LA.levels.next(R.level);
    if (nx && m.first) save.setAt(R.tier, nx.id);
    if (R.level.final) R.beat = save.beat(R.tier);
    LA.scenes.push('results', { R });
  };

  flow.afterResults = function (R) {
    if (R.kind === 'fullrun') { LA.game.run = null; go('credits', { then: () => go('title', { menu: true }) , short: true }); return; }
    const lv = R.level, tier = R.tier;
    if (lv.final) {
      LA.game.run = null;
      go('cutscene', { id: 'ending', unlocked: R.beat && R.beat.unlocked, then: () => go('credits', { then: () => go('title', { menu: true }) }) });
      return;
    }
    const nx = LA.levels.next(lv);
    if (nx && nx.w !== lv.w && R.first) {
      go('cutscene', { id: 'worldclear', w: lv.w, then: () => {
        if (!save.introSeen(tier, nx.w)) go('cutscene', { id: 'world', w: nx.w, then: () => { save.markIntro(tier, nx.w); go('map', { from: lv.id, walk: true }); } });
        else go('map', { from: lv.id, walk: true });
      } });
      return;
    }
    go('map', { from: lv.id, walk: !!R.first });
  };

  // ---------------- game over / continue ----------------
  flow.gameOver = function (S) { LA.scenes.push('gameover', { S }); };
  flow.continueRun = function (S) {
    const old = S.run;
    const run = LA.game.newRun({ tier: old.tier.id, players: old.players, mode: old.mode });
    run.score = old.score; run.continues = (old.continues || 0) + 1;
    if (old.mode === 'fullrun') {
      Object.assign(run, { time: old.time, crystals: old.crystals, crystalsTotal: old.crystalsTotal, saved: old.saved || 0, deaths: old.deaths || 0 });
      go('level', { levelId: '1-1', checkpointX: S.lastCP });
    } else {
      run.score = S._score0 != null ? S._score0 : old.score;                // retry the level from its starting score
      run.crystals = old.crystals; run.crystalsTotal = old.crystalsTotal;
      go('level', { levelId: S.level.id });
    }
  };
  flow.giveUp = function (S) {
    LA.game.run = null;
    if (S && S.mode === 'fullrun') go('title', { menu: true });
    else go('map', { at: S ? S.level.id : null });
  };

  // ---------------- pause-menu actions ----------------
  flow.restartLevel = function (S) {
    if (S.mode === 'fullrun') { flow.startFullRun(S.tier.id, S.run.players); return; }
    if (S._score0 != null) S.run.score = S._score0;
    go('level', { levelId: S.level.id });
  };
  flow.exitToMap = function (S) { if (S.mode === 'fullrun') { flow.quitToTitle(); return; } go('map', { at: S.level.id }); };
  flow.quitToTitle = function () { LA.game.run = null; go('title', { menu: true }); };
  flow.pause = function () { if (LA.scenes.defs.pause && LA.scenes.curName === 'level') LA.scenes.push('pause'); };
})();
