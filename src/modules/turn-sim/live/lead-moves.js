// Lead's numbers: the moves Lead flies, in the programme (flight.js; the line abreast turns and the break of manoeuvres.js)
// and in fluid manoeuvring (fluid-lead.js). One of the tuning sheet's number files (TS-214): tuning.js re-exports it, and
// docs/modules/turn-sim/numbers.md lists every number with its source. Moved unchanged from fluid-lead.js and
// manoeuvres.js, with the numbers that sat bare in fluid-lead.js's functions named here (12.2b). Numbers with no manual
// page or ruling are estimates and say so.
//
// This file imports only core and the other number files, so any file can read it without an import loop.
import { bankDegFromG } from '../../../core/flight-math.js';
import { T6A_G_ONSET, T6A_ROLL } from '../../../core/t6-performance.js';
import { WING } from './moves.js';
import { MIN_POSITIVE_G } from './handling.js';

// ---- Lead's roll (TS-222) -------------------------------------------------------------------------------------------

/**
 * Lead's roll into and out of a turn: up to 90°/s, its rate built at the T-6A's (full rate in T6A_ROLL.fullRateSec) and
 * the build itself over the T-6A's onset (T6A_ROLL.onsetSec, 0.2 s), never past the aircraft at this speed (Patrick 12 Oct
 * 2026, TS-222: "90/S is good. it's smoothd, of course"). A technique share of the aircraft's full-stick roll (ALL-39),
 * not a limit of the aircraft: fluid Lead's level turns, reversals, wings level, climbs and Terminate, and Lead's tactical
 * turns outside fluid (line abreast's 70/3 turns, the fighting wing turns and moves). Not the nose-path manoeuvres (the
 * wingover and the barrel roll roll as their path asks, up to the aircraft's limit), the telegraphed close formation turns
 * (TELEGRAPH, rates.js) or the break (BREAK).
 */
export const LEAD_ROLL = Object.freeze({ maxRateDps: 90, maxAccelDps2: 90 / T6A_ROLL.fullRateSec });

/**
 * Lead's roll is planned, not chased: built over the T-6A's 0.2 s onset, the roll-out started where the wings will stop on
 * the bank wanted, so he never rolls past it (core easeRoll plannedStop; Patrick 12 Oct 2026: "can we just make this
 * simple?", against a PID). The chase had him ring about 15° past wings level from 30° of bank. The programme Lead carries
 * these (formation.js, four-ship.js); fluid Lead's step (stepLead) flies the same when asked LEAD_ROLL.
 */
export const LEAD_ROLL_STATE = Object.freeze({ plannedRoll: true, rollAccelDps2: 0, rollAccelForRateDps: 0 });

// ---- Lead's power in formation (TS-216) -----------------------------------------------------------------------------

/**
 * Lead's torque stays between 20% and 80% in formation, every case except fluid manoeuvring (MAX) and line abreast (Patrick
 * 12 Oct 2026, TS-216: "make the min tq for lead 20%, max 80% in call cases (except FM and LAB)"; the 20% from SMM 12.31
 * and EFIG p.395; the 80% his 12 Oct 08:39Z and 09:17Z rulings, TS-203 and TS-204). So Lead never goes idle in formation
 * and never meets the engine's lag from idle (TS-218, handling.js ENGINE): his slow-downs, descents and held speeds use
 * 20% at least, his speed-ups and climbs 80% at most.
 */
export const LEAD_POWER = Object.freeze({ minTorquePct: 20, maxTorquePct: 80 });

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
/** #2's wait before he follows Lead's break: 3 s (TS-217, Patrick 12 Oct 2026, the SMM's overhead break figure; was TS-175's 5 s); a setting under More. */
export const BREAK = { delaySec: 3, bankDeg: 60 }; // 60° level is 2 G (1 / cos 60°)
export const BREAK_DELAY_CHOICES = Object.freeze([3, 4, 5, 6, 8]); // the setting's choices (estimates); 3 s the default (TS-217)

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
  // The loop, wingovers and barrel roll at full power: each starts at whatever speed Lead has and ends at that speed
  // (TS-215, TS-221: no speed set-up; Patrick 12 Oct 2026: "FM is at full power, so he just enters the loop after he waits
  // for wingman to roll out, from level, not at 230 kias").
  loopMinKias: 200, // below it Lead refuses the loop (TS-221, Patrick 12 Oct 2026: "Min speed for loop is 200, refuse")
  loopExitTolKt: 15, // the exit within 15 kt of the entry (TS-221); the law aims at the entry speed itself, 15 kt is the check
  loopG: 3.5, // the pull to the vertical, EFIG p.171 "3 1/2 G", inside SMM 7.5 para 11 and Table 7.1's 3-4 G (TS-213)
  loopAoaUnits: 17, // ... but no more than 17 units AOA: past the shaker (15 units) and just under the 18-unit stall (Patrick 12 Oct 2026: "shaker starts at 15 AOA. he can ease up to 17 AOA"; SMM 14.14 para 33). From 230-240 KIAS 3.5 G holds to about 80° nose up, then he rides 17 units to the vertical
  loopDownMaxG: 4, // Lead pulls no more than 4 G anywhere in the loop (Gen Book p.11: Lead +4 G in fluid manoeuvring; TS-213), flagged on the card if the exit needs more
  loopTopMinG: 0.5, // "slight positive G" over the top (SMM 7.5 para 11): 0.5 is an estimate, never reached in the design runs (0.85-1.04 G)
  loopVerticalDeg: 90, // the pull hands over to the nose rate held at the vertical, smoothly (TS-221, Patrick 12 Oct 2026: "The pull hands over to the rate hold at 90 deg (straight vertical), but make it smooth"; 80°, an estimate, until V2.424)
  loopPullOutDeg: 330, // #2's cue only (loopMode): PURE in trail for the pull-out from here (an estimate)
  loopWaitSec: 5, // in the standard sequence Lead holds wings level for 5 s after the 360 before the loop's pull, so #2 has rolled out and is set for the pull (Patrick 12 Oct 2026 01:50Z, "1 just waits for 2 to roll out of the turn before he begins his loop"; 04:14Z after flying V2.371, "lead can just wait another 2 seconds to pull in to the loop": 3 s became 5 s, his option A). An estimate from his words; #2 levels about 1.5 s after Lead
  loopWaitLimitSec: 60, // a guard only: in the sequence, wings level at MAX for at most a minute to reach loopMinKias, else the loop is skipped (an estimate)
  // How Lead flies the rate over the top and down, and the nose paths' descending halves (the loop design, 12 Oct 2026,
  // research/loop-design.md; all estimates): every 0.25 s he predicts his exit speed for a nose rate and eases toward the
  // rate that gives the entry speed.
  noseRateAccelDps2: 4, // the most he changes a held nose rate, 4°/s²
  noseRateJerkDps3: 6, // and how fast that change builds, 6°/s³, so the G rate never steps
  exitReplanSec: 0.25, // how often the exit speed is predicted again
  exitFreezeDeg: 30, // the last 30° before the exit the rate is held (nothing left to steer with)
  endJerkDps3: 2, // a stand-alone exit eases the nose rate to zero on the horizon at 2°/s³ (4 G onto 1 G over about 2.7 s)
  endKneeDps: 1.5, // where the held rate meets that easing (°/s), so the G rate does not step
  limitKneeG: 0.15, // a G limit (4 G, 17 units, the shaker share) is met through a 0.15 G knee, never a corner (core softMin)
  joinBlendSec: 2, // a flowing join (loop to wingovers, wingovers to barrel roll): the next pull eases from the G handed in onto its own over 2 s
  gOnsetSec: 0.2, // Lead's G onset is built over 0.2 s, as the roll's (T6A_ROLL.onsetSec, TS-196), with the stop planned (TS-223); Lead only until Patrick moves it to core
  wingoverG: 3, // "approximately 3 G" (SMM 16.17 para 47); the cloverleaf's pull, 2.5-3.5 G (SMM Table 7.1; EFIG p.137 about 3 G)
  wingoverPitchDeg: 45, // "approximately 45 degrees of pitch (above and below the horizon)" (SMM 16.17 para 47)
  noseAccelDps2: 8, // how fast the nose's rate changes along a planned nose path, 8°/s² (an estimate): #2's lag roll and rolling rejoin (followNose); Lead's own paths use noseRateAccelDps2
  noseEndDps2: 3, // and how gently he slows it onto the end of the path, 3°/s² (an estimate): the pull-out to level
  noseSteerPerSec: 1.2, // how fast he steers back onto the planned nose path, per second (an estimate)
  shakerShare: 0.9, // he pulls no more than 90% of the stick shaker's G on a planned nose path, the wingovers and barrel roll (an estimate)
  barrelG: 3, // entry load (SMM Table 14.1; Fig 14.1 "3G, wings level pull and begin roll")
  barrelTopG: 2.25, // the back pressure reduced over the top (SMM 14.8 para 19): 2.25 G is an estimate (230 KIAS out)
  barrelPitchDeg: 45, // SMM 14.8 para 19 (45° pitch up and down at the quarter points); Patrick's pick row 6
  barrelOffDeg: 45, // the nose circles a point 45° off the reference line (SMM 14.8 para 19: 45° off, then 90° off)
  // Moved out of fluid-lead.js's functions into the sheet (12.2b, TS-214), values unchanged:
  cueOffTailDeg: WING.latDeg, // the cue Lead's moves give #2: hold 15° off Lead's current tail (Patrick 5 Oct 22:28Z; moves.js WING)
  overTopCue: Object.freeze({ pureFromU: 0.4, leadFromU: 0.6, pureAgainFromU: 0.9 }), // #2's cue through a wingover or barrel roll by how far through it Lead is: LAG up, PURE over the top, LEAD down, PURE for the pull-out (Patrick 17:12Z, card 19:21Z); the breaks are estimates
  loopCueDeg: Object.freeze({ pureFrom: 155, leadFrom: 205 }), // the loop's cue by Lead's loop angle: LAG, PURE over the top from 155°, LEAD from 205°, PURE again from loopPullOutDeg (estimates)
  climbDamp: Object.freeze({ holdPerSec: 0.5, pitchPerSec: 0.4, exitPerSec: 0.6 }), // how firmly Lead's pull brings the flight path onto the one wanted (core dampedClimbG's omega, per second; estimates): holding a level path or a climb's angle; raising or lowering the nose into a climb; levelling after a stand-alone loop, wingovers or barrel roll
  climbNearFt: 20, // a climb or descent counts as arrived within 20 ft of the new height (an estimate)
  speedHold: Object.freeze({ perSec: 0.2, maxKtps: 3 }), // holding a speed (the entry, Terminate): 0.2 kt/s per knot off it, never more than 3 kt/s (estimates)
});

// ---- Lead's fighting wing moves (from formation-turns.js) ------------------------------------------------------------

/** Lead's moves in fighting wing: a held turn is planned two full turns ahead, the next press planning again from where the
 * pair is; climbs and descents of 2,000 ft, at what the T-6 holds at Lead's speed (TS-203). */
export const FW_MOVE = Object.freeze({ heldTurnDeg: 720, climbFt: 2000, climbDeg: 15, climbTorquePct: LEAD_POWER.maxTorquePct, descentTorquePct: LEAD_POWER.minTorquePct }); // climbTorquePct: Lead's climb power, 80% torque at most (Patrick 12 Oct 2026 08:39Z, a formation hard rule; TS-203); descentTorquePct: his descent power, 20% torque (TS-216; until V2.424 the descent was 80% of the model's idle descent, an estimate)

// ---- One Lead aircraft: the programme flown on the point mass (TS-225) ----------------------------------------------

/**
 * Lead's programme flown on the same point mass as in fluid (TS-225, Patrick 12 Oct 2026: "let's have him fly the same
 * point mass"; "our first job is to make lead fly realistically"): lead-pilot.js flies each plan's turns, holds, speed
 * changes and height legs with thrust, drag, G, his roll and his G onset, and his speed and height come out of the
 * physics. onePointMass false flies the old programme Lead (flight.js stepAircraft), kept until this is proven. The
 * pilot's own numbers below have no manual page: they are estimates and say so.
 */
export const LEAD_PILOT = Object.freeze({
  onePointMass: true, // the switch (TS-225: "A setting keeps the old programme Lead until this is proven"); false flies the old programme Lead
  heightPerSec: 0.125, // how firmly he flies onto a planned or held height: climb rate added per foot of height error, per second (an estimate: a quarter of LEAD.climbDamp.holdPerSec, so the height and flight-path loops are critically damped together)
  levelFtps: 0.5, // a plan that starts while he still climbs or sinks faster than 0.5 ft/s levels him off first, then holds that height (an estimate; the programme's own level-off, flight.js LEVEL_OFF_SEC, did the same)
  heightCatchFtps: 25, // the most climb or sink he adds to close a height error, ft/s (about 1,500 ft/min; an estimate)
  speedDoneKt: 0.5, // a speed change counts as made within 0.5 kt (an estimate; the planners' own "same speed" test)
  speedStuckKtps: 0.05, // ... or once the power is at the band's edge and the speed has stopped coming toward it, KIAS per second (an estimate), so a change the power cannot make does not hold a plan open
  labPower: Object.freeze({ minTorquePct: 0, maxTorquePct: LEAD_POWER.maxTorquePct }), // line abreast's own speed changes (replay.js speedSeg lab): power back to the floor (slow-down.js, TS-61) and 80% to speed up (TS-216's LAB exception)
  climbTorquePct: FW_MOVE.climbTorquePct, // a planned climb at 80% torque (TS-203, TS-216)
  descentTorquePct: FW_MOVE.descentTorquePct, // a planned descent at 20% torque (TS-216)
});
