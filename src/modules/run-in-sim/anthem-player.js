// Plays an anthem as simple tones in the browser (RS-25; Dad's card, 17 Oct 2026: the browser plays the tune itself, no
// recording): Web Audio oscillators, one per note, through one gain, from anthems.js's note times. No audio file and no
// library. Browsers only let sound start after the user has pressed something on the page, so `unlock()` is called from
// the page's button presses (Fly the pass, Play, Anthem starts) and the context is made or woken there.
//
// When audio isn't there (an old browser, or a test with no Web Audio) every call does nothing.
import { anthemSchedule } from './anthems.js';

/** The tone: a triangle wave (soft, like a simple organ stop), this loud, rising and dying over these times, s (estimates for the sound). */
const TONE = Object.freeze({ wave: 'triangle', gain: 0.18, attackSec: 0.02, releaseSec: 0.06 });

/** Returns { unlock(), play(id, lengthSec, fromSec), stop(), playing(), positionSec(), dispose() }. */
export function createAnthemPlayer({ win = globalThis } = {}) {
  const Ctx = win.AudioContext || win.webkitAudioContext;
  let ctx = null;
  let out = null; // the gain the playing notes go through; dropped on stop
  let started = null; // { at (context time of the anthem's 0), lengthSec }

  const unlock = () => {
    if (!Ctx) return;
    try {
      ctx ??= new Ctx();
      if (ctx.state === 'suspended') ctx.resume();
    } catch {
      ctx = null;
    }
  };

  const stop = () => {
    if (out) {
      try {
        out.disconnect();
      } catch { /* already gone */ }
    }
    out = null;
    started = null;
  };

  /** Plays anthem `id` lasting lengthSec, from fromSec into it (for a resume part way through). */
  const play = (id, lengthSec, fromSec = 0) => {
    stop();
    unlock();
    if (!ctx) return;
    const now = ctx.currentTime + 0.03;
    const at = now - fromSec;
    out = ctx.createGain();
    out.gain.value = 1;
    out.connect(ctx.destination);
    for (const note of anthemSchedule(id, lengthSec)) {
      const end = note.t + note.dur;
      if (end <= fromSec) continue;
      const t0 = Math.max(at + note.t, now);
      const t1 = at + end;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = TONE.wave;
      osc.frequency.value = note.freq;
      const rel = Math.min(TONE.releaseSec, (t1 - t0) / 3);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(TONE.gain, t0 + Math.min(TONE.attackSec, (t1 - t0) / 3));
      g.gain.setValueAtTime(TONE.gain, Math.max(t0, t1 - rel));
      g.gain.linearRampToValueAtTime(0, t1);
      osc.connect(g).connect(out);
      osc.start(t0);
      osc.stop(t1 + 0.01);
    }
    started = { at, lengthSec };
  };

  return {
    unlock,
    play,
    stop,
    /** Whether an anthem is playing now. */
    playing: () => Boolean(started && ctx && ctx.currentTime - started.at < started.lengthSec),
    /** How far into the anthem it is, s (null when none). */
    positionSec: () => (started && ctx ? ctx.currentTime - started.at : null),
    dispose() {
      stop();
      try {
        ctx?.close();
      } catch { /* already closed */ }
      ctx = null;
    },
  };
}
