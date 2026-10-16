// The Formation Sim's handling numbers: how its two steppers fly the aircraft on top of the T-6A's own limits (the
// programme stepper, flight.js, and the wingman's pilot, pilot.js). One of the tuning sheet's number files (TS-214):
// tuning.js re-exports it, and docs/modules/turn-sim/numbers.md lists every number with its source. The aircraft's limits
// themselves stay in core (t6-performance.js: roll rate and acceleration, G onset, the G limits, the stall line). Moved
// unchanged from flight.js, pilot.js and power.js (12.2b); numbers with no manual page or ruling are estimates and say so.
//
// This file imports only core, so any file can read it without an import loop.
import { T6A_G_ONSET_CEILING_GPS } from '../../../core/t6-performance.js';

/**
 * The fastest the gate lets G build (G per second): core T6A_G_ONSET_CEILING_GPS, 6 G/s (ALL-40; it was 8, twice the
 * normal 4 G/s). Patrick 5 Oct 23:27Z: "higher than 4 occasionally is fine thats life as a pilot": 4 G/s is the normal
 * pull, not a wall; the gate only stops a pull no pilot could make. Traffic reads the same core number.
 */
export const G_ONSET_CEILING = T6A_G_ONSET_CEILING_GPS;
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
 * How the engine answers the PCL, every aircraft (TS-218; power.js engineStep is the one model). From 5% torque up the power
 * follows the PCL quickly: the torque's full travel in quickSec, 0.25 s (Patrick 5 Oct 06:02Z: "2 percent to 100 in .25
 * seconds"; TS-218's words). Once it has sat below idleTorquePct, 5% (Patrick 12 Oct 2026: "if the power is at 5% or more
 * its very responsive, but once you go idle and the prop feathers there is lag"), for at least idleSettleSec, the first
 * idleLagSec after the PCL is advanced give no rise in power, then it follows at the quick rate again ("it's 3-4 seconds";
 * the SMM: spool-up from idle is slow; 3.5 s is the working value). idleSettleSec, 1 s, is an ESTIMATE: a dip below 5%
 * shorter than that is not "gone idle", so it brings no lag. The delay-then-rise shape is an ESTIMATE from his "lag".
 */
export const ENGINE = Object.freeze({ quickSec: 0.25, idleTorquePct: 5, idleLagSec: 3.5, idleSettleSec: 1 });

/**
 * The fastest the wingman's pilot slows, KIAS per second, whatever the power, the boards and the climb give (pilot.js
 * pilotSpeed). No source was written beside it (it came in with the HTRJ change, 2a37a7c3); an estimate.
 */
export const PILOT_SLOW_CAP_KTPS = 7.95;

/**
 * Nobody pushes below this: Lead keeps positive G (2 CFFTS Orders B2 ch 8 para 1a) and the live wingmen never ask for less
 * on the lift they have. 0.5 G is an estimate. One number for Lead's push (lead-moves.js LEAD.minPushG) and the live
 * wingmen's floor (wing-moves.js FW_LIVE.minG, LIVE.minG); they were three copies.
 */
export const MIN_POSITIVE_G = 0.5;
