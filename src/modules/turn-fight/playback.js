// Playing a fight: what one screen frame does to it. Pure, no page access,
// so the screen only has to call advanceRun from its frame loop. The fight
// (sim.js) and its trails (trails.js) move together here, in whole fight
// steps, so a trail point lands every 0.1 s of fight time at any frame rate
// (SPEC-turn-fight, "One fixed step" and "Trails").
import { FIGHT_STEP_SEC, createFight, stepFight } from './sim.js';
import { createEnergyFight, stepEnergyFight } from './energy-sim.js';
import { startGeometry } from './geometry.js';
import { iasToTasKt } from '../../core/t6-performance.js';
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

/**
 * An Energy fight step that takes longer than this (milliseconds) is a pick: the model pilot choosing his next move races
 * two moves through up to 60 s of fight (energy-sim.js pickMove), 30 to 60 ms on a slow machine, where an ordinary step is
 * a few microseconds. See advanceRun.
 */
export const SLOW_STEP_MS = 10;

/** A new run at T+0: the fight from a setup (see sim.js createFight) and its trails. */
export function createRun(setup) {
  const fight = createFight(setup);
  return { fight, trails: createTrails(fight), pendingSec: 0, stepsSinceTrail: 0 };
}

/**
 * A new Energy run at T+0 (SPEC-turn-fight, "Energy mode"): the engine's fight from a setup (energy-sim.js
 * createEnergyFight, which throws a RangeError naming a bad number) and its trails. `run.engine` is the engine's
 * state, which only stepEnergyFight moves. `run.fight` is what the pictures and readouts read: the engine's state seen
 * through `energyScreenFight`, which adds the few things the drawings ask of every fight (the MERGE mark, the pass, the
 * start heights) without touching the engine's state.
 */
export function createEnergyRun(setup) {
  const engine = createEnergyFight(setup);
  const fight = energyScreenFight(engine);
  return { fight, engine, trails: createTrails(fight), pendingSec: 0, stepsSinceTrail: 0, slowFrames: 0 };
}

/**
 * The engine's fight, plus what the top-down, side and 3D views and the phase word read from every fight (sim.js has
 * them and the Energy engine does not): `energy` (so a view flies the aircraft's own bank and pitch), `mergeMark`,
 * `headOn`, `start.passRangeFt` and `startZFt`. It is a new object whose prototype is the engine's state, so every
 * engine field reads through it live (the time, the aircraft, first nose-on) and nothing is copied or written into the
 * engine's state. The pass is worked out by geometry.js from the true airspeeds, level, as sim.js does for the simple fight.
 */
export function energyScreenFight(engine) {
  const s = engine.setup;
  const geometry = startGeometry({
    separationNm: s.separationNm,
    blueKt: iasToTasKt(s.blueKias, s.blueAltFt),
    redKt: iasToTasKt(s.redKias, s.redAltFt),
    startAtaDeg: s.ataDeg, startAtaSide: s.ataSide, startAaDeg: s.aaDeg, startAaSide: s.aaSide,
    turnsAt: s.turnsStart === 'now' ? 'once' : 'pass',
  });
  const fight = Object.create(engine);
  fight.energy = true;
  fight.mergeMark = s.turnsStart !== 'now' && geometry.closing;
  fight.headOn = s.ataDeg === 0 && s.aaDeg === 180;
  fight.start = { hcaDeg: geometry.hcaDeg, passSec: geometry.closing ? geometry.passSec : 0, closing: geometry.closing, passRangeFt: geometry.passRangeFt };
  fight.startZFt = { blue: s.blueAltFt, red: s.redAltFt };
  return fight;
}

/**
 * Moves the run forward by `dtSec` of fight time in whole fight steps. Time
 * that doesn't fill a step waits in `pendingSec` for the next frame, exactly as
 * stepFight carries it, so the fight is the same whatever the frame rate. At
 * the ten-minute stop nothing moves any more. Returns the run.
 */
export function advanceRun(run, dtSec, { now = () => performance.now() } = {}) {
  const { fight, engine } = run;
  if (fight.stopped || !(dtSec > 0) || !Number.isFinite(dtSec)) return run;
  run.pendingSec += dtSec;
  // The small margin lets fifty frames of 1/50 s make fifty steps, not forty-nine (as in stepFight).
  const steps = Math.floor(run.pendingSec / FIGHT_STEP_SEC + 1e-9);
  run.pendingSec = Math.max(0, run.pendingSec - steps * FIGHT_STEP_SEC);
  for (let i = 0; i < steps; i++) {
    // An Energy step that picks the next move is slow (SLOW_STEP_MS). It ends the frame: at most one pick a frame, and the
    // steps that were left for this frame are dropped, not carried to the next one, so a slow machine slows the fight
    // for that frame instead of piling steps up and stuttering again. (Two aircraft picking in one step cannot be told
    // apart from outside the engine.) The fight itself stays the same steps in the same order.
    const began = engine ? now() : 0;
    if (engine) stepEnergyFight(engine, FIGHT_STEP_SEC);
    else stepFight(fight, FIGHT_STEP_SEC);
    run.stepsSinceTrail += 1;
    if (run.stepsSinceTrail >= TRAIL_EVERY_STEPS) {
      run.stepsSinceTrail = 0;
      addTrailPoints(run.trails, fight);
    }
    if (fight.stopped) {
      run.pendingSec = 0;
      break;
    }
    if (engine && now() - began > SLOW_STEP_MS) {
      run.pendingSec = 0;
      run.slowFrames += 1;
      break;
    }
  }
  return run;
}
