// The playback clock for the Traffic Sim: it turns the time between frames into fixed
// 0.05 s steps of the engine (specs/SPEC-traffic.md: Flying the aircraft; Assumption 4).
// Playback speed changes how much sim time each frame asks for, never the size of a
// step, and the part of a frame that isn't yet a whole step is kept for the next one,
// so a run comes out the same at any frame rate and speed.
//
// Going back (task 9, bug #46): Rewind runs the clock backward at the same speeds, and
// stepBy(-10) and stepBy(10) jump 10 s of sim time whatever the speed. Both go through the
// engine's snapshots (sim.seek), so they land exactly where the forward run was.
//
// It knows the engine and nothing about the page: the screen calls tick() from the
// scheduler's frame and reads the clock and the mode back.
import { SPEEDS } from './defaults.js';
import { STEP_SEC } from './sim.js';

/** The ±10 s buttons and the [ and ] keys move this many whole steps (10 s of sim time). */
export const TEN_SECONDS_STEPS = Math.round(10 / STEP_SEC);

/** The most sim time one frame may ask for, so a tab that was hidden can't freeze the page catching up. */
const MAX_ADVANCE_SEC = 2;

/**
 * sim: the engine's sim (sim.js). speed: playback speed (1 is real time).
 * Returns { mode, speed, simTime, play(), pause(), rewind(), reset(), setSpeed(x), seek(tSec), seekSteps(step), stepBy(seconds), tick(dtMs) }.
 * mode is 'paused', 'running' or 'rewinding'. tick returns true when it moved the run, so the screen
 * knows to redraw. A rewind that reaches 0 pauses itself.
 */
export function createClock({ sim, speed = 1, maxAdvanceSec = MAX_ADVANCE_SEC }) {
  let mode = 'paused';
  let rate = speed;
  let target = sim.t; // the sim time the run has been asked for; the engine catches up in whole steps

  function seekToStep(step) {
    sim.seekSteps(step);
    target = sim.t;
    if (mode === 'rewinding') mode = 'paused';
  }

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
      target = sim.t; // from wherever the run is now
    },
    pause() {
      mode = 'paused';
    },
    /** Plays backward at the current speed, until 0 or Pause. */
    rewind() {
      mode = 'rewinding';
      target = sim.t;
    },
    /** Goes to a sim time, forward or back (not before 0); the mode stays, except that a rewind stops. */
    seek(tSec) {
      sim.seek(tSec);
      target = sim.t;
      if (mode === 'rewinding') mode = 'paused';
    },
    /** Goes to a step (a whole number of steps from 0), exact at any length of run; the mode stays, except that a rewind stops. Does nothing to the sim if it is there already (the screen may have replayed to it in slices). */
    seekSteps: seekToStep,
    /** Moves the run by 10 s of sim time, back (-10) or ahead (10), exactly, at any speed; playing carries on, a rewind stops. */
    stepBy(seconds) {
      seekToStep(sim.steps + Math.sign(seconds) * TEN_SECONDS_STEPS);
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
      if (!(dtMs > 0)) return false;
      if (mode === 'rewinding') {
        const before = sim.steps;
        target = Math.max(0, target - (dtMs / 1000) * rate); // the time asked for, kept whole so a slow rewind is as slow as a slow play
        sim.seek(target);
        if (sim.steps === 0) mode = 'paused'; // the start: nothing further back
        return sim.steps !== before;
      }
      if (mode !== 'running') return false;
      target = Math.min(target + (dtMs / 1000) * rate, sim.t + maxAdvanceSec);
      return sim.stepTo(target) > 0;
    },
  };
}
