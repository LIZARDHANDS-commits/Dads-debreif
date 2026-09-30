// The one playback clock for every view of a flight (#24, R12): the 2D map,
// 3D view, readouts and EM chart all read the same time. V6 kept four.
//
// It holds no timers of its own. While the debrief is open, the ui-kit
// scheduler calls clock.tick(nowMs) each frame (R4), so closing the debrief
// stops it.

/** Playback speeds, as V6 offered them. */
export const SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 16];
/** The most real time one frame may count, in seconds, so a hidden tab or slow frame never jumps ahead. */
export const MAX_FRAME_S = 0.25;

/**
 * A clock over the playback window startT to endT (seconds since 1970). It
 * starts paused at startT, at 1×. Every change is reported to onChange
 * listeners, once.
 */
export function createClock({ startT, endT }) {
  if (!(endT > startT)) throw new RangeError('The playback window must end after it starts.');
  let t = startT;
  let playing = false;
  let speed = 1;
  let lastMs = null; // the previous frame's time while playing
  const listeners = new Set();

  const changed = () => { for (const cb of listeners) cb(clock); };
  const clamp = x => Math.min(endT, Math.max(startT, x));

  const clock = {
    get t() { return t; },
    get playing() { return playing; },
    get speed() { return speed; },
    get startT() { return startT; },
    get endT() { return endT; },

    /** Plays from here, or from the start if at the end (V6 did nothing there). */
    play() {
      if (playing) return;
      if (t >= endT) t = startT;
      playing = true;
      lastMs = null;
      changed();
    },
    pause() {
      if (!playing) return;
      playing = false;
      changed();
    },
    /** Pauses at the start. */
    reset() {
      playing = false;
      t = startT;
      changed();
    },
    /** Moves to the nearest whole second, kept inside the window. */
    seek(time) {
      if (!Number.isFinite(time)) throw new RangeError('Seek needs a time.');
      t = clamp(Math.round(time));
      changed();
    },
    /** Moves to the next (+1) or previous (−1) whole second. */
    step(direction) {
      clock.seek(direction > 0 ? Math.floor(t) + 1 : Math.ceil(t) - 1);
    },
    setSpeed(x) {
      if (!SPEEDS.includes(x)) throw new RangeError(`Speed must be one of ${SPEEDS.join(', ')}.`);
      speed = x;
      changed();
    },
    /** Called once a frame with the frame's time in milliseconds. Stops at the end. */
    tick(nowMs) {
      if (!playing || !Number.isFinite(nowMs)) return;
      const dtS = lastMs === null ? 0 : Math.min(MAX_FRAME_S, Math.max(0, (nowMs - lastMs) / 1000));
      lastMs = nowMs;
      if (dtS === 0) return;
      t = Math.min(endT, t + dtS * speed);
      if (t >= endT) playing = false;
      changed();
    },
    /** Listens for changes; returns a function that stops listening. */
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
  return clock;
}
