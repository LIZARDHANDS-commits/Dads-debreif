// The playback clock for the Traffic Sim: it turns the time between frames into fixed
// 0.05 s steps of the engine (specs/SPEC-traffic.md: Flying the aircraft; Assumption 4).
// Playback speed changes how much sim time each frame asks for, never the size of a
// step, and the part of a frame that isn't yet a whole step is kept for the next one,
// so a run comes out the same at any frame rate and speed.
//
// It knows the engine and nothing about the page: the screen calls tick() from the
// scheduler's frame and reads the clock and the mode back.
import { SPEEDS } from './defaults.js';

/** The most sim time one frame may ask for, so a tab that was hidden can't freeze the page catching up. */
const MAX_ADVANCE_SEC = 2;

/**
 * sim: the engine's sim (sim.js). speed: playback speed (1 is real time).
 * Returns { mode, speed, simTime, play(), pause(), reset(), setSpeed(x), tick(dtMs) }.
 * tick returns true when it moved the run, so the screen knows to redraw.
 */
export function createClock({ sim, speed = 1, maxAdvanceSec = MAX_ADVANCE_SEC }) {
  let mode = 'paused';
  let rate = speed;
  let target = sim.t; // the sim time the run has been asked for; the engine catches up in whole steps

  return {
    get mode() {
      return mode;
    },
    get speed() {
      return rate;
    },
    /** Sim time in seconds, always a whole number of steps. */
    get simTime() {
      return sim.t;
    },
    play() {
      mode = 'running';
    },
    pause() {
      mode = 'paused';
    },
    /** Stops, and puts every aircraft back at its start at 0 with the dice from the seed again. */
    reset() {
      mode = 'paused';
      sim.reset();
      target = 0;
    },
    setSpeed(x) {
      if (Number.isFinite(x) && x >= SPEEDS[0] && x <= SPEEDS[SPEEDS.length - 1]) rate = x; // only speeds on the bar's list
    },
    tick(dtMs) {
      if (mode !== 'running' || !(dtMs > 0)) return false;
      target = Math.min(target + (dtMs / 1000) * rate, sim.t + maxAdvanceSec);
      return sim.stepTo(target) > 0;
    },
  };
}
