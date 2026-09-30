// gift -> action mapping, driven by /gifts.json. Pure functions (no DOM) so they
// can be unit-tested in Node.

export async function loadGiftMap(url = '/gifts.json') {
  const r = await fetch(url + '?v=' + Date.now(), { cache: 'no-store' });
  return r.json();
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function findOverride(overrides, name) {
  if (!overrides) return null;
  const k = norm(name);
  for (const [key, val] of Object.entries(overrides)) if (norm(key) === k) return val;
  return null;
}

/**
 * Returns { action, label, sound, power, count, whale, feed } for a normalized event.
 * power: gifts = total coins in this event; likes = likeCount; others = cfg.power or 1.
 */
export function mapEvent(evt, cfg) {
  cfg = cfg || {};
  if (evt.type === 'gift') {
    const g = evt.gift || {};
    const coins = Number(g.coins) || 0;
    const count = Number(g.count) || 1;
    const tier = (cfg.tiers || []).find((t) => coins >= (t.min ?? 0) && (t.max == null || coins <= t.max)) || {};
    const m = { ...tier, ...(findOverride(cfg.overrides, g.name) || {}) };
    return {
      action: m.action || 'NONE',
      label: m.label || m.action || '',
      sound: m.sound === undefined ? 'gift' : m.sound,
      power: coins * count,
      count,
      whale: m.whale ?? coins >= (cfg.whaleThreshold ?? 1000),
      feed: m.feed !== false,
    };
  }
  const m = (cfg.events || {})[evt.type] || {};
  return {
    action: m.action || 'NONE',
    label: m.label || '',
    sound: m.sound === undefined ? null : m.sound,
    power: evt.type === 'like' ? Number(evt.likeCount) || 1 : m.power ?? 1,
    count: 1,
    whale: !!m.whale,
    feed: m.feed !== false,
  };
}
