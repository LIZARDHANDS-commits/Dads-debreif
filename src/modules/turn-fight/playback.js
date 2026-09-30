// Playing a fight: what one screen frame does to it. Pure, no page access,
// so the screen only has to call advanceRun from its frame loop. The fight
// (sim.js) and its trails (trails.js) move together here, in whole fight
// steps, so a trail point lands every 0.1 s of fight time at any frame rate
// (SPEC-turn-fight, "One fixed step" and "Trails").
import { FIGHT_STEP_SEC, createFight, stepFight } from './sim.js';
import { createTrails, addTrailPoints, TRAIL_EVERY_STEPS } from './trails.js';

export { TRAIL_INTERVAL_SEC } from './trails.js';

/** V6's frame limit (`Math.min(.08, …)`, line 4295): a frame never moves the fight by more than this, before the playback speed. */
export const MAX_FRAME_SEC = 0.08;

/**
 * Fight seconds for one screen frame, from the time since the last frame in
 * milliseconds and the playback speed (V6 `loop`, line 4295). A slow or hidden
 * frame doesn't jump the fight. Anything that isn't a positive time gives 0.
 */
export function frameDtSec(frameMs, playbackRate) {
  if (!(frameMs > 0) || !Number.isFinite(frameMs)) return 0;
  return Math.min(MAX_FRAME_SEC, frameMs / 1000) * playbackRate;
}

/** A new run at T+0: the fight from a setup (see sim.js createFight) and its trails. */
export function createRun(setup) {
  const fight = createFight(setup);
  return { fight, trails: createTrails(fight), pendingSec: 0, stepsSinceTrail: 0 };
}

/**
 * Moves the run forward by `dtSec` of fight time in whole fight steps. Time
 * that doesn't fill a step waits in `pendingSec` for the next frame, exactly as
 * stepFight carries it, so the fight is the same whatever the frame rate. At
 * the ten-minute stop nothing moves any more. Returns the run.
 */
export function advanceRun(run, dtSec) {
  const { fight } = run;
  if (fight.stopped || !(dtSec > 0) || !Number.isFinite(dtSec)) return run;
  run.pendingSec += dtSec;
  // The small margin lets fifty frames of 1/50 s make fifty steps, not forty-nine (as in stepFight).
  const steps = Math.floor(run.pendingSec / FIGHT_STEP_SEC + 1e-9);
  run.pendingSec = Math.max(0, run.pendingSec - steps * FIGHT_STEP_SEC);
  for (let i = 0; i < steps; i++) {
    stepFight(fight, FIGHT_STEP_SEC);
    run.stepsSinceTrail += 1;
    if (run.stepsSinceTrail >= TRAIL_EVERY_STEPS) {
      run.stepsSinceTrail = 0;
      addTrailPoints(run.trails, fight);
    }
    if (fight.stopped) {
      run.pendingSec = 0;
      break;
    }
  }
  return run;
}
