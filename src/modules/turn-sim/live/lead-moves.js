// Lead's numbers: the moves Lead flies, in the programme (flight.js; the line abreast turns and the break of manoeuvres.js)
// and in fluid manoeuvring (fluid-lead.js). One of the tuning sheet's number files (TS-214): tuning.js re-exports it, and
// docs/modules/turn-sim/numbers.md lists every number with its source. Moved unchanged from fluid-lead.js and
// manoeuvres.js, with the numbers that sat bare in fluid-lead.js's functions named here (12.2b). Numbers with no manual
// page or ruling are estimates and say so.
//
// This file imports only core and the other number files, so any file can read it without an import loop.
import { bankDegFromG } from '../../../core/flight-math.js';
import { T6A_G_ONSET } from '../../../core/t6-performance.js';
import { WING } from './moves.js';
import { MIN_POSITIVE_G } from './handling.js';

// ---- Lead's programme: the line abreast turns and the break (from manoeuvres.js) ------------------------------------

/** Line abreast turns: about 70° of bank at 3 G (SMM 16.18 para 50; Figs 16.15-16.21 "70/3"). */
export const TURN_G = 3;
export const TURN_BANK_DEG = bankDegFromG(TURN_G);
/** Crossing turns pass at least this far apart vertically (SMM 16.13 para 31; 16.19 paras 61, 64). */
export const VERTICAL_MISS_FT = 300;
/** The check turn's angle: the R/T example "check 20" (2 CFFTS Orders B2 ch 8 p.103). Working answer, Patrick to confirm. */
export const CHECK_DEG = 20;
/** The cross turn's first stage may be flown between these banks to roll out at the spacing ("60/2, or as required", Fig 16.21). */
export const CROSS_FIRST_BANK_DEG = Object.freeze([20, 75]);
/** #2's wait before he follows Lead's break (TS-175: Patrick's 5 s; a setting under More). */
export const BREAK = { delaySec: 5, bankDeg: 60 }; // 60° level is 2 G (1 / cos 60°)
export const BREAK_DELAY_CHOICES = Object.freeze([3, 4, 5, 6, 8]); // the setting's choices around Patrick's 5 s (estimates)

// ---- Lead in fluid manoeuvring (from fluid-lead.js) ------------------------------------------------------------------

/** The numbers Lead flies in fluid manoeuvring (moved from fluid-lead.js, 12.2b). Every one has its source; "estimate" where no manual or ruling gives it. */
export const LEAD = Object.freeze({
  gOnset: T6A_G_ONSET, // G per second and per second²: the T-6A's in core (estimate, design 5.3; TS-85)
  levelBanks: Object.freeze({ gentle: 30, medium: 60, steep: 70.5 }), // AFM7 p.17 (30, 60/2); SMM 16.18 para 50 (70/3, estimate as "steep")
  entryHoldSec: 5, // the entry's 30° bank stage while "all call ready" (AFM7 p.17): 5 s is an estimate
  // The entry turn (AFM7 brief p.17: 30° away, then the chosen bank at MAX) is off: Lead flies straight and level while #2
  // moves into the fluid picture, and the 360 waits for the Standard sequence (Patrick 5 Oct 22:30Z: "fluid manoeuvring
  // should just move into position to begin, not start a turn yet. the 360 happens when we hit sequence"; TS-86). true
  // flies AFM7's entry turn as before.
  entryTurn: false,
  fwKias: 200, // fighting wing speed (TS-53; SMM 12.23 para 53)
  terminateBankDeg: 30, // "gentle" (AFM7 p.17), "predictable" (SMM 16.17 para 46): 30° is an estimate
  terminateTurnDeg: 90, // the most the terminate turn goes before rolling out, if #2 is not back in fighting wing sooner: an estimate
  earlyCueSec: 4, // how long a new turn's lag (into #2) or lead (away from #2) lasts before pure: an estimate
  climbDeg: 15, // the climb or descent angle (design 5.1, an estimate)
  climbChangeFt: 2000, // how far a climb or descent goes before levelling off (an estimate)
  levelOffFt: 800, // the climb eases onto the new height over its last 800 ft (an estimate)
  pitchCueDps: 0.5, // #2 reads Lead's nose as rising or falling past 0.5°/s of pitch rate (an estimate)
  climbPitchDps: 3, // how fast Lead raises or lowers the nose into and out of the climb or descent (an estimate)
  minPushG: MIN_POSITIVE_G, // Lead keeps positive G (2 CFFTS Orders B2 ch 8 para 1a); 0.5 G at the push over is an estimate (handling.js)
  loopEntryKias: 230, // SMM Table 7.1, 7.5 para 11, Fig 7.2 (entry and exit)
  loopEntryBandKias: 15, // the aerobatics start within 15 KIAS of the entry speed (Patrick 5 Oct 04:59Z: "Fluid maneouvering aerobatics can happen as long as the aircraft are within 15 knots of the starting parameters"; 5 kt, an estimate, until V2.59; SMM 7.12 para 28b allows 200-250 for the loop)
  loopG: 3.5, // EFIG p.171 "3 1/2 G", inside SMM 7.5 para 11 and Table 7.1's 3-4 G
  loopDownMaxG: 4, // coming down Lead may pull up to 4 G, the top of the SMM's 3-4 G (Table 7.1), to "adjust back pressure to achieve 230 KIAS" (SMM 7.5 para 12); at the Orders' 4 G, not over it
  loopTopMinG: 0.5, // "slight positive G" over the top (SMM 7.5 para 11): 0.5 is an estimate
  loopVerticalDeg: 80, // "until the aircraft approaches the vertical" (SMM 7.5 para 11): 80° is an estimate
  loopPullOutDeg: 330, // where Lead stops holding the pitch rate and pulls out to level (an estimate)
  setupMaxPitchDeg: 10, // the speed set-up's nose down or up before the loop (an estimate)
  loopWaitSec: 5, // in the standard sequence Lead holds wings level for 5 s after the 360 before the loop's pull, so #2 has rolled out and is set for the pull (Patrick 12 Oct 2026 01:50Z, "1 just waits for 2 to roll out of the turn before he begins his loop"; 04:14Z after flying V2.371, "lead can just wait another 2 seconds to pull in to the loop": 3 s became 5 s, his option A). An estimate from his words; #2 levels about 1.5 s after Lead
  setupLimitSec: 60, // a guard only: after a minute of set-up the loop starts at whatever speed (an estimate)
  wingoverKias: 230, // "approximately 230 KIAS" (SMM 16.17 para 47)
  wingoverG: 3, // "approximately 3 G" (SMM 16.17 para 47); the cloverleaf's pull, 2.5-3.5 G (SMM Table 7.1; EFIG p.137 about 3 G)
  wingoverPitchDeg: 45, // "approximately 45 degrees of pitch (above and below the horizon)" (SMM 16.17 para 47)
  noseAccelDps2: 8, // how fast Lead changes the nose's rate along a planned nose path, 8°/s² (an estimate)
  noseEndDps2: 3, // and how gently he slows it onto the end of the path, 3°/s² (an estimate): the pull-out to level
  noseSteerPerSec: 1.2, // how fast he steers back onto the planned nose path, per second (an estimate)
  shakerShare: 0.9, // he pulls no more than 90% of the stick shaker's G on a planned nose path (an estimate)
  barrelKias: 230, // SMM Table 14.1, 14.8 para 19 (entry and exit)
  barrelG: 3, // entry load (SMM Table 14.1; Fig 14.1 "3G, wings level pull and begin roll")
  barrelTopG: 2.25, // the back pressure reduced over the top (SMM 14.8 para 19): 2.25 G is an estimate (230 KIAS out)
  barrelPitchDeg: 45, // SMM 14.8 para 19 (45° pitch up and down at the quarter points); Patrick's pick row 6
  barrelOffDeg: 45, // the nose circles a point 45° off the reference line (SMM 14.8 para 19: 45° off, then 90° off)
  // Moved out of fluid-lead.js's functions into the sheet (12.2b, TS-214), values unchanged:
  cueOffTailDeg: WING.latDeg, // the cue Lead's moves give #2: hold 15° off Lead's current tail (Patrick 5 Oct 22:28Z; moves.js WING)
  overTopCue: Object.freeze({ pureFromU: 0.4, leadFromU: 0.6, pureAgainFromU: 0.9 }), // #2's cue through a wingover or barrel roll by how far through it Lead is: LAG up, PURE over the top, LEAD down, PURE for the pull-out (Patrick 17:12Z, card 19:21Z); the breaks are estimates
  loopCueDeg: Object.freeze({ pureFrom: 155, leadFrom: 205 }), // the loop's cue by Lead's loop angle: LAG, PURE over the top from 155°, LEAD from 205°, PURE again from loopPullOutDeg (estimates)
  climbDamp: Object.freeze({ holdPerSec: 0.5, pitchPerSec: 0.4, loopDownPerSec: 1.2, exitPerSec: 0.6 }), // how firmly Lead's pull brings the flight path onto the one wanted (core dampedClimbG's omega, per second; estimates): holding a level path or a climb's angle; raising or lowering the nose into a climb and before the loop; the loop's pull-out; the wingover's and barrel roll's exit
  climbNearFt: 20, // a climb or descent counts as arrived within 20 ft of the new height (an estimate)
  speedHold: Object.freeze({ perSec: 0.2, maxKtps: 3 }), // holding a speed (the entry, Terminate): 0.2 kt/s per knot off it, never more than 3 kt/s (estimates)
});
