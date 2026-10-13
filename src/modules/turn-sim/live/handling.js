// The Formation Sim's handling numbers: how its two steppers fly the aircraft on top of the T-6A's own limits (the
// programme stepper, flight.js, and the wingman's pilot, pilot.js). One of the tuning sheet's number files (TS-214):
// tuning.js re-exports it, and docs/modules/turn-sim/numbers.md lists every number with its source. The aircraft's limits
// themselves stay in core (t6-performance.js: roll rate and acceleration, G onset, the G limits, the stall line). Moved
// unchanged from flight.js, pilot.js and power.js (12.2b); numbers with no manual page or ruling are estimates and say so.
//
// This file imports only core, so any file can read it without an import loop.
import { T6A_G_ONSET } from '../../../core/t6-performance.js';

/**
 * The fastest the gate lets G build (G per second): twice the T-6A's normal onset (core T6A_G_ONSET, 4 G/s), an estimate.
 * Patrick 5 Oct 23:27Z: "higher than 4 occasionally is fine thats life as a pilot": 4 G/s is the normal pull, not a wall;
 * the gate only stops a pull no pilot could make. (Traffic keeps its own copy in traffic/envelope.js.)
 */
export const G_ONSET_CEILING = 2 * T6A_G_ONSET.maxRateDps;
/**
 * Steeper than this the level-turn G (1 / cos bank) is not this model's (a lag roll through the inverted): the gate holds the
 * roll only (flight.js), and the pilot's G shaping leaves it to the roll alone (pilot.js). An estimate.
 */
export const GATE_G_MAX_BANK_DEG = 85;

/**
 * The time the last of a climb-rate change is closed over (seconds; an estimate), so the pull settles without flickering. Since
 * V2.348 it is 0.3 s, not 0.1, so the G onset's own build (16 G/s²) keeps up and the climb rate comes onto the one wanted
 * without passing it.
 */
export const CLIMB_CATCH_SEC = 0.3;
/** A level-off closes its climb rate over this long (seconds; an estimate), and uses at most this pull or push (G either side of 1; an estimate). */
export const LEVEL_OFF_SEC = 1;
export const LEVEL_OFF_PULL_G = 1;

/** The push is taken only when its wings are this much nearer than the pull's: positive G is the pilot's way (estimate). */
export const PUSH_MARGIN_DEG = 45;

/**
 * From this share of full power the power is MAX: the tag says MAX from this share of full-power thrust (power.js, so it does
 * not flick between MAX and 99% at full power), and the pilot flies MAX from this share of full power's acceleration
 * (pilot.js). One number for both (they were two copies of 0.985); an estimate.
 */
export const POWER_MAX_FROM = 0.985;

/**
 * The fastest the wingman's pilot slows, KIAS per second, whatever the power, the boards and the climb give (pilot.js
 * pilotSpeed). No source was written beside it (it came in with the HTRJ change, 2a37a7c3); an estimate.
 */
export const PILOT_SLOW_CAP_KTPS = 7.95;
