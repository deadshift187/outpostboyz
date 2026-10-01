// Run end for the web editions: window 'outpost:runend' CustomEvent, detail {slug, score, reason}.
// The games don't emit it themselves (they're the same files as the streamer app), so the shell watches each game's
// public debug snapshot (game.debug, plus game.dev.S where the snapshot lacks the field) a few times a second and
// fires once per ended run / round / jump / heat. The site reads this event, never the games' internal state.
//
// Each rule: (d, p, S, m) -> null | { score, reason }.  d = debug now, p = debug at the previous poll, S = raw state,
// m = this game's scratch memo. All end markers below hold for 3+ s, so a 200 ms poll never misses one.
const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const rose = (d, p, f) => n(f(d)) > n(f(p));
const edge = (d, p, key, val) => d[key] === val && p[key] !== val;

// STACKED (web only): a run is a climb to the 250 m summit, timed against 7:00.
// summit -> score = 250 + seconds left under 7:00; no summit by 7:00 -> score = best height that run (0-249 m).
const STACKED_LIMIT_S = 420;
function stacked(d, p, S, m) {
  const runKey = S.run && S.run.realT0;
  if (m.runKey !== runKey) { m.runKey = runKey; m.maxM = 0; m.timedOut = false; }
  m.maxM = Math.max(m.maxM, n(d.heightM));
  if (rose(d, p, (x) => x.summits)) {
    if (m.timedOut) return null; // the 7:00 timeout already ended (and scored) this run: one run, one score
    const sec = S.cine && Number.isFinite(S.cine.runSec) ? S.cine.runSec : n(S.sessionT) - n(runKey);
    return { score: 250 + Math.max(0, Math.round(STACKED_LIMIT_S - sec)), reason: 'summit', seconds: Math.round(sec) };
  }
  if (!m.timedOut && !S.cine && n(S.sessionT) - n(runKey) >= STACKED_LIMIT_S) {
    m.timedOut = true;
    return { score: Math.min(249, Math.round(m.maxM)), reason: 'timeout', seconds: STACKED_LIMIT_S };
  }
  return null;
}

// per-night / per-bomb score for games whose d.score is a session total
const delta = (m, total) => { const s = total - n(m.base); m.base = total; return Math.max(0, Math.round(s)); };

export const RULES = {
  stacked,
  tightrope: (d, p) => (rose(d, p, (x) => x.summits) ? { score: n(d.score), reason: 'summit' } : null),
  goalie: (d, p, S) => (rose(d, p, (x) => n(x.matchesWon) + n(x.matchesLost))
    ? { score: n(S.match && S.match.points != null ? S.match.points : d.saves), reason: d.matchesWon > p.matchesWon ? 'won' : 'lost' } : null),
  derby: (d, p) => (rose(d, p, (x) => x.roundsPlayed) ? { score: n(d.score), reason: d.roundsWon > p.roundsWon ? 'win' : 'loss' } : null),
  munch: (d, p) => (edge(d, p, 'cine', 'scrapped') ? { score: n(d.score), reason: 'scrapped' } : null),

  horsederby: (d, p, S) => {
    if (!edge(d, p, 'phase', 'results')) return null;
    const r = (S.R && S.R.results) || {}, place = n(r.place || d.place) || 9;
    return { score: Math.round(1000 / place), reason: place === 1 ? 'win' : r.adv ? 'advance' : 'loss', place, seconds: r.sec };
  },
  bullride: (d, p, S) => {
    if (p.phase !== 'ride' || (d.phase !== 'thrown' && d.phase !== 'done')) return null;
    const B = S.B || {};
    return d.phase === 'done' ? { score: Math.round(n(B.result && B.result.score)), reason: 'ride complete' } : { score: Math.round(n(B.score)), reason: 'thrown' };
  },
  knockout: (d, p, S) => (rose(d, p, (x) => n(x.record && x.record.w) + n(x.record && x.record.l))
    ? { score: Math.round(n(S.P && S.P.dmgDealt)), reason: S.F && S.F.win ? 'win' : 'loss' } : null),
  fishing: (d, p, S, m) => {
    const c = S.dayCine, was = m.cine; m.cine = !!c;
    return c && !was ? { score: Math.round(n(c.kg) * 10) / 10, reason: c.kind === 'done' ? 'quota met' : 'quota missed' } : null;
  },
  holdthedoor: (d, p, S, m) => {
    if (m.base == null) m.base = n(p.score);
    return rose(d, p, (x) => n(x.nightsSurvived) + n(x.overruns)) ? { score: delta(m, n(d.score)), reason: d.cine === 'dawn' ? 'survived' : 'overrun' } : null;
  },
  defuse: (d, p, S, m) => {
    if (m.base == null) m.base = n(p.score);
    return rose(d, p, (x) => n(x.bombsDefused) + n(x.booms)) ? { score: delta(m, n(d.score)), reason: d.cine === 'defused' ? 'defused' : 'boom' } : null;
  },
  heist: (d, p, S) => (rose(d, p, (x) => x.heists) ? { score: Math.round(n(S.cine && S.cine.loot != null ? S.cine.loot : d.bag)), reason: 'escaped' } : null),
  skydive: (d, p) => (rose(d, p, (x) => x.jumps)
    ? { score: Math.round(n(d.result && d.result.score)), reason: d.result && d.result.on ? (d.result.bull ? 'bullseye' : 'on target') : 'miss' } : null),
  lava: (d, p) => (rose(d, p, (x) => x.runs) ? { score: n(d.score), reason: d.cine === 'escape' ? 'escaped' : 'melted' } : null),
  pileup: (d, p) => (rose(d, p, (x) => x.jobs) ? { score: Math.round(n(d.jobScore)), reason: d.cine === 'done' ? 'job done' : 'job failed' } : null),
  crossy: (d, p) => (edge(d, p, 'cine', 'runover') ? { score: n(d.score), reason: 'out of hearts' } : null),
  whack: (d, p) => (edge(d, p, 'cine', 'runover') ? { score: n(d.runScore), reason: 'quota missed' } : null),
  drift: (d, p, S) => (rose(d, p, (x) => x.heatsDone) ? { score: Math.round(n(d.heatScore)), reason: S.cine && S.cine.gold ? 'gold' : 'finish' } : null),
  sumo: (d, p) => (edge(d, p, 'cine', 'over') ? { score: n(d.score), reason: 'ring out' } : null),
  jetpack: (d, p) => (rose(d, p, (x) => x.crashes) ? { score: n(d.score), reason: 'crash' } : null),
  pizza: (d, p, S) => (edge(d, p, 'cine', 'shift') ? { score: n(d.tips), reason: S.cine && S.cine.newBest ? 'best shift' : 'shift over' } : null),
  surf: (d, p) => (rose(d, p, (x) => x.waves) ? { score: n(d.score), reason: 'wave complete' } : null),
  // S.result is a new object at every touchdown (and null between jumps): fire on each new one
  megaramp: (d, p, S, m) => {
    const r = S.result, was = m.r; m.r = r;
    return r && r !== was && m.seen ? { score: Math.round(n(r.pts)), reason: String(r.grade || 'landed').toLowerCase() } : ((m.seen = true), null);
  },
  hoops: (d, p) => (edge(d, p, 'phase', 'over') ? { score: n(d.runScore), reason: 'quota missed' } : null),
  snowboard: (d, p, S) => (rose(d, p, (x) => x.runsDone) ? { score: n(d.score), reason: S.cine && S.cine.extracted ? 'extracted' : 'finish' } : null),
};

/** Watches one game; call poll() every frame (it samples every `everyMs`). onEnd(detail) gets each run end. */
export function createRunEnd({ slug, game, everyMs = 200, onEnd }) {
  const rule = RULES[slug];
  let prev = null, last = -1e9, failed = false;
  const m = {};
  return {
    rule: !!rule,
    poll(now) {
      if (!rule || failed || now - last < everyMs) return;
      last = now;
      let d, S;
      try { d = game.debug; S = (game.dev && game.dev.S) || {}; } catch (e) { return; }
      if (!d) return;
      if (prev) {
        let r = null;
        try { r = rule(d, prev, S, m); } catch (e) { failed = true; console.warn('[runend] rule failed for ' + slug, e); }
        if (r) {
          const detail = { ...r, slug, score: Number.isFinite(r.score) ? r.score : 0, reason: String(r.reason) };
          try { onEnd && onEnd(detail); } catch (e) { /* ignore */ }
          try { window.dispatchEvent(new CustomEvent('outpost:runend', { detail })); } catch (e) { /* old browser */ }
        }
      }
      prev = d;
    },
  };
}
