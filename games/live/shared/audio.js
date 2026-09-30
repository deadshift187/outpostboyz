// Master volume for games that synth their own WebAudio: every AudioContext created after install() routes its
// `destination` through one GainNode we control. Games keep calling node.connect(ctx.destination) unchanged.
export function installMasterVolume(initial = 1) {
  const Base = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  let vol = initial;
  const ctxs = new Set();
  if (!Base) return { set() {}, get volume() { return vol; }, contexts: ctxs };
  class MasterAudioContext extends Base {
    constructor(...a) { super(...a); ctxs.add(this); }
    get destination() {
      if (!this.__master) {
        const real = super.destination;
        const g = this.createGain();
        g.gain.value = vol;
        g.connect(real);
        this.__master = g;
      }
      return this.__master;
    }
  }
  window.AudioContext = MasterAudioContext;
  if (window.webkitAudioContext) window.webkitAudioContext = MasterAudioContext;
  return {
    set(v) {
      vol = Math.max(0, Math.min(1, Number(v) || 0));
      for (const c of ctxs) if (c.__master) { try { c.__master.gain.setTargetAtTime(vol, c.currentTime, 0.02); } catch (e) { c.__master.gain.value = vol; } }
    },
    get volume() { return vol; },
    contexts: ctxs,
  };
}
