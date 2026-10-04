// The Turn Fight's Energy mode engine (SPEC-turn-fight, "Energy mode (FF23, D112)"):
// two T-6As, each flown by a model pilot through the SMM's energy moves to the
// 160 KIAS max-performance turn (MPT), then held there or chased from.
//
// Like sim.js it is a pure calculation with no page access: a plain setup goes in,
// a plain state comes out, and `stepEnergyFight` moves it in whole 0.02 s steps.
// It draws nothing. The simple fight (sim.js) is untouched.
//
// All the aircraft maths is core's: the T-6A limits, stall line, thrust and drag
// and energy height (core/t6-performance.js), and the point-mass step (core/point-mass.js).
// The engine only flies it: it decides G, bank and throttle, and keeps the readouts.
//
// This file is the one door the screen and the tests use. The engine itself lives in
// energy/ (TF-57, plan Step 1b), one job per file:
//   energy/setup.js       defaults, the spec's fixed numbers, tuning numbers, move names, the setup check
//   energy/fight.js       the start, a new fight, one fight step
//   energy/aircraft.js    one aircraft: its readouts and one step through the limits and core's point-mass step
//   energy/pilot.js       who decides: the Smart pilot's table, the first moves, hand-overs, the MPT re-pick, starting and ending a chase
//   energy/moves/         one file per move, each flying its move and saying when it is done
//   energy/smoothing.js   the layer between the pilot's inputs and the aircraft (off until PR 2)
//   energy/lookahead.js   flying copies of the fight to judge a move: the table's race, the Smart pilot's MPT dry runs
//   energy/judge.js       nose-on, the chase, the advantage score, gun kill, mid-air collision
//   energy/frame.js       vectors, the real horizon's frame, bank and angles between two jets
//
// Units: feet, seconds, radians inside, degrees and knots in the readouts.
// x is east, y north, z (altFt) up; heading 0 is east and grows counter-clockwise
// (core's rule). "Left" means counter-clockwise from above; turnDir +1 is left.
export {
  ENERGY_MOVES, PURSUITS, COLLISION_HITBOX_FT, TCPA_GATE_MIN_SEC, TCPA_GATE_MAX_SEC, TCPA_MISS_GATE_FT, DECONFLICTION_OFFSET_FT,
  ENERGY_MAX_START_FT, ENERGY_ACCURATE_MAX_FT, MPT_KIAS_RANGE, ENERGY_DEFAULT_SETUP, MOVE_LABELS, energyTopKias, shakerG,
} from './energy/setup.js';
export { createEnergyFight, stepEnergyFight } from './energy/fight.js';
export { pickMove, lookAheadPick } from './energy/pilot.js';
export { getFeasibleMoves, pickTacticalMove } from './energy/lookahead.js';
export { tacticalAdvantage, shouldPursueTactical, checkWezGun, checkMidAirCollision } from './energy/judge.js';
export { curvedControlZonePoint, tacticalAimCalculation, computeTcpa, turnPlaneNormal, aimPoint } from './energy/moves/pursuit.js';
