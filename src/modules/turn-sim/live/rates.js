// The Formation Sim's rates (refactor PR 4, numbers register, TS-95): the G rule, Patrick's two rate sets (close and
// tactical), the Rates setting (closure), the roll limits and the wingmen's banks. One of three number files with
// bands.js and moves.js (tuning.js only re-exports them); docs/modules/turn-sim/numbers.md lists every number with its
// source. Numbers with no manual page or ruling beside them are estimates and say so. Moved unchanged from tuning.js.
//
// This file imports only slots.js and core, so any file can read it without an import loop.
import { KT_TO_FTPS } from '../../../core/units.js';
import { G_FTPS2 } from '../../../core/units.js';
import { bankDegFromG } from '../../../core/flight-math.js';
import { T6A_LIMITS } from '../../../core/t6-performance.js';
import { pairSlot } from './slots.js';

/**
 * A close move's bank cap, every Rates choice (Patrick 5 Oct 06:43Z: "lets do up to 60 for all as requird for now"; it was
 * 30°, 06:16Z item 12, which left the AI's 2.5 s route to echelon out of reach); WING_BANKS below. A slower rate banks less.
 */
export const CLOSE_BANK_DEG = 60;

// ---- the G rule (clean-up step 2, TS-65; Patrick 5 Oct 06:16Z) -----------------------------------------------------

/**
 * The G rule: 5 G is the normal aim (SMM 16.17 para 44a; Gen Book p.11), more only as a last resort and never 7 (TS-60
 * amendment). Flagged on screen, never a wall; 7 G is the physical limit the planners keep under.
 */
export const G_RULE = Object.freeze({ normalG: 5, lastResortG: 7 });
/** "No bank cap" (Patrick 06:16Z): the bank of a level turn at the G rule's normal 5 G, about 78°. */
export const G_RULE_BANK_DEG = bankDegFromG(G_RULE.normalG);
/** No bank cap (Patrick 6 Oct 04:07Z: "there is NO LIMIT on bank angle in formation"; 04:07:49Z: "no bank cap on rejoins or movements around a station"): only the aircraft's own limits hold: the bank of a level 7 G turn, about 82° (t6-performance.js T6A_LIMITS.maxG; the stall line too, availableG); the G rule is flagged, never a wall. */
export const NO_BANK_CAP_DEG = bankDegFromG(T6A_LIMITS.maxG);

// ---- Patrick's two rate sets: holding close formation, and tactical (the tidy-up, TS-84) -------------------------------

/**
 * Every move flies one of two sets of rates, and this is their one home (Patrick 5 Oct 21:06Z, 21:11Z: the near-Lead throttle
 * is only for holding close formation, "as soon as a tactical formation is selected, unrestricted attitude changes and
 * power"; 20:50Z: "Escelon is smooth to allow 2 to stay in position in tight formation", while "Fithging wing, rejoins,
 * tactical formations, line abreast etc is unrestricted (realistic) roll rates & aircraft handling"). The moves' own tables
 * read them from here: ROLL below, moves.js KINEMATIC and OPEN_OUT, formation-turns.js CLOSE_TURN and hand-over.js RUN_IN. All
 * estimates unless a source is given; the comments at those tables say where each number came from.
 *  - close: holding close formation and moving near Lead.
 *    leadRoll: Lead's roll in a close formation turn, up to 30°/s building at 20°/s² (about 3 s to 45°);
 *    echelonRoll: the 2-ship echelon turn's, up to 30°/s building at 12°/s² (about 4.5 s to 60°; Patrick 20:50Z "about 4-5 s");
 *    frame: how fast #2 may move in Lead's frame on a kinematic line (across, along, up or down, and the slowing near the slot);
 *    law: how hard such a line may accelerate and turn in Lead's frame (shares of full power and of the turn, sideways and
 *    vertical acceleration).
 *  - tactical: unrestricted, the aircraft's own handling.
 *    roll: 180°/s building at 720°/s² (Patrick 5 Oct 06:07Z "Roll rate can be 180 degrees per second");
 *    frame and law: the opening out to line abreast's (TS-78): full power along, 1 g across, 0.3 g up or down.
 */
export const RATE_SETS = Object.freeze({
  close: Object.freeze({
    leadRoll: Object.freeze({ maxRateDps: 30, maxAccelDps2: 20 }),
    echelonRoll: Object.freeze({ maxRateDps: 30, maxAccelDps2: 12 }),
    frame: Object.freeze({ lateralFtps: 15, foreAftFtps: 10, verticalFtps: 8, nearPerSec: 0.1, nearMinFtps: 4 }),
    law: Object.freeze({ powerShare: 0.65, turnShare: 0.35, latG: 0.3, vertFtps2: 3 }),
  }),
  tactical: Object.freeze({
    roll: Object.freeze({ maxRateDps: 180, maxAccelDps2: 720 }),
    frame: Object.freeze({ foreAftFtps: 80, verticalFtps: 40, nearPerSec: 10, nearMinFtps: 20 }),
    law: Object.freeze({ powerShare: 1, turnShare: 1, latG: 1, vertFtps2: 10 }),
  }),
});

/**
 * Nominal shaping targets and soft envelope caps for close-in formation work (SMM 12.4, 12.6, 12.20).
 * Targets, not walls: guidance steers toward the nominal targets, with progressive soft cushion
 * expanding toward the envelope cap if displaced.
 */
export const CLOSE_SHAPING = Object.freeze({
  targetBankDeg: 2.5,
  envelopeBankCapDeg: 6.0,
  targetLateralFtps: 8.4,       // 5.0 kt lateral drift
  targetOvertakeKt: 3.0,        // subtle power nudge
  targetUndertakeKt: 3.0,
  envelopeMaxOvertakeKt: 5.0,
  envelopeMaxUndertakeKt: 5.0,
  wakeClearanceDownFt: 15.0,    // below prop wash
  wakeClearanceAftFt: 12.0,     // behind tail
});

/** Bank angle choices for close formation turns (echelon, route, line astern). */
export const CLOSE_BANK_CHOICES = Object.freeze([30, 45, 60]);
export const DEFAULT_CLOSE_BANK_DEG = 60;
let closeBankChoice = DEFAULT_CLOSE_BANK_DEG;

/** Sets the bank angle for close formation turns (30, 45, or 60 degrees). */
export function setCloseBank(deg) {
  const n = Number(deg);
  closeBankChoice = CLOSE_BANK_CHOICES.includes(n) ? n : DEFAULT_CLOSE_BANK_DEG;
}

/** The close formation turn bank angle now (degrees). */
export function closeBankNow() {
  return closeBankChoice;
}

// ---- the Rates setting: how fast a 2-ship wingman closes on his slot (clean-up step 2, TS-65) ----------------------

/**
 * How long each Rates choice takes from route to echelon, from the press to IN POSITION, seconds (Patrick 5 Oct 06:11Z:
 * "student should take 10 seconds to get from route to eschelon ..., IP takes 5, AI takes 2-3? use that as a close in rate
 * gauge"; AI's 2.5 is the middle of his 2-3). From it comes the close-in closure (closeInFtps below): the closure rate that
 * flies route to echelon in that time with the aircraft's real set and stop. It is the closure of every close move (station
 * changes, echelon and route both ways, line astern) and of the run-in from a rejoin's route, corner or decision point
 * into the slot. Closure is range rate (Patrick 06:07Z: "how fast lead is getting closer/how quickly they are getting
 * bigger in the windscreen"): the tracker holds it as the rate the range to the slot closes along the line of sight. The
 * choice changes the closure only: "No on bank and g" (06:07Z). It replaces the 15 KIAS rejoin overtake on the 2-ship
 * (REJOIN.overtakeKias, which the 4-ship keeps until step 3); Instructor is the default (the coordinator's pick, told to
 * Patrick 5 Oct 05:46Z). Every rate is still capped by full power, the G rule and the roll rate: the aircraft flies what it
 * can and says so. (Patrick's 05:46Z first numbers, 10, 20 and 40 kt for every move, were retired at 06:11Z.)
 */
export const CLOSE_IN_SEC = Object.freeze({ student: 10, instructor: 5, ai: 2.5 });
/** IN POSITION comes inside the echelon band, 15 ft short of the slot sideways (judge.js: 45 ±15 ft out), so the gauge is timed to there. */
const CLOSE_IN_BAND_FT = 15;
/**
 * A rejoin's closure for each Rates choice, knots (Patrick 5 Oct 06:09Z: "Student keeps 15 knots, instructor 25 knots, all
 * the way up into "route" or "corner" or "decision point" (whichever happens as a part of that rejoin) then they run in";
 * AI's 50 is an estimate, the thread's pick: double Instructor's). Held until #2 reaches the point the rejoin passes through
 * (route, the corner, or the decision point), then he takes it down to the close-in rate (CLOSE_IN_SEC) for the run-in,
 * whether the line or the tracker is flying (Patrick 06:09Z / 05:46Z; 06:11Z). The long part of other long moves (line
 * abreast or fighting wing to a close formation, a close formation out to fighting wing or line abreast) closes at it too.
 */
export const REJOIN_CLOSURE_KT = Object.freeze({ student: 15, instructor: 25, ai: 50 });
/**
 * The speed a rejoin aims for down the line (or up Lead's six) to the decision point, KIAS, by Rates choice (Patrick 6 Oct
 * 15:54Z: "Let's do 210 220 235 . These are targets not requirements. Gemoetry first and speed if possible for
 * rffecicney"; TS-133): turning rejoins and the straight-ahead rejoin both. A target, not a requirement: where the geometry
 * has no room for it, the rejoin searches flies a smaller overtake (searchTurningRejoin, straight-rejoin.js). Lead's 200
 * KIAS stays the least, a hot start keeps 200 and gets colder with geometry (15:54Z: "Hot starts can keep 200"), and #2
 * comes back to Lead's 200 to join. Until V2.149 every choice aimed for 220 (TS-75).
 */
export const REJOIN_LINE_KIAS = Object.freeze({ student: 210, instructor: 220, ai: 235 });
/** The rejoin's line speed for the Rates choice now, KIAS (REJOIN_LINE_KIAS). */
export function lineKiasNow(choice = ratesChoice) {
  return REJOIN_LINE_KIAS[choice] ?? REJOIN_LINE_KIAS[DEFAULT_RATES];
}
/**
 * The Rates setting as an experience profile (clean-up step 5, TS-141; the review's report 6.4 A, Patrick 6 Oct 21:58Z):
 * one row per level that every move reads, setting how boldly he uses the aircraft, never what the aircraft can do. The
 * envelope gate (flight.js, TS-93), the windows and the bands (the manuals', TS-110) are the same for every level. Bank and G
 * are not set by Rates (Patrick 5 Oct 06:07Z: "No on bank and g"; the review's per-level G aims and "uses power before
 * geometry" were dropped, Patrick 6 Oct 21:25Z): geometry first, power as needed, for every level.
 *  - closeInSec, rejoinClosureKt, lineKias: CLOSE_IN_SEC, REJOIN_CLOSURE_KT and REJOIN_LINE_KIAS above (Patrick's, built);
 *  - rollShare: the share of the roll rate he asks for, of the pilot's 180°/s within the T-6A's own (flight.js
 *    rollLimitAt; the roll onset stays the aircraft's). 1 for every level for now: the review's 0.5 and 0.75 left the
 *    tracker's close settle hunting (the 4-ship's trail and finger could not settle #4 in the crash check, 6 Oct), so a
 *    slower student roll waits for the cause to be found and for Patrick's word; estimate;
 *  - gOnsetGps: how fast he builds G rolling into a turn, G per second (the T-6A's normal pull is 4 G/s, core T6A_G_ONSET,
 *    an estimate; the gate's 8 G/s ceiling stays for all); estimates;
 *  - coneShare: how much of the fighting wing cone's height (moves.js FW_ENERGY.coneUpFt, TS-96, TS-136) he uses to trade
 *    speed for height; estimates;
 *  - leverShare: his throttle style, how quickly he moves the power: the share of the torque's full travel rate (moves.js
 *    POWER.jerkKtps2) his acceleration builds at. The student eases it, the AI slams it (Patrick 5 Oct 04:58Z, 05:47Z:
 *    power "assertively" sets the rate); estimates.
 * pilot.js reads the roll, G onset and lever shares; tracker.js and rejoin-law.js the cone share.
 */
export const EXPERIENCE = Object.freeze({
  student: Object.freeze({ closeInSec: CLOSE_IN_SEC.student, rejoinClosureKt: REJOIN_CLOSURE_KT.student, lineKias: REJOIN_LINE_KIAS.student, rollShare: 1, gOnsetGps: 2, coneShare: 0.5, leverShare: 0.5 }),
  instructor: Object.freeze({ closeInSec: CLOSE_IN_SEC.instructor, rejoinClosureKt: REJOIN_CLOSURE_KT.instructor, lineKias: REJOIN_LINE_KIAS.instructor, rollShare: 1, gOnsetGps: 3, coneShare: 0.8, leverShare: 0.75 }),
  ai: Object.freeze({ closeInSec: CLOSE_IN_SEC.ai, rejoinClosureKt: REJOIN_CLOSURE_KT.ai, lineKias: REJOIN_LINE_KIAS.ai, rollShare: 1, gOnsetGps: 4, coneShare: 1, leverShare: 1 }),
});
/** The experience profile for the Rates choice now (EXPERIENCE). */
export function experienceNow(choice = ratesChoice) {
  return EXPERIENCE[choice] ?? EXPERIENCE[DEFAULT_RATES];
}
/** The Rates choices in screen order, and their words. */
export const RATE_CHOICES = Object.freeze(Object.keys(CLOSE_IN_SEC));
export const RATE_WORDS = Object.freeze({ student: 'Student', instructor: 'Instructor', ai: 'AI' });
export const DEFAULT_RATES = 'instructor';
let ratesChoice = DEFAULT_RATES;

/** Sets the Rates choice (one of RATE_CHOICES; anything else keeps the default, Instructor). */
export function setRates(choice) {
  ratesChoice = RATE_CHOICES.includes(choice) ? choice : DEFAULT_RATES;
}

/** The Rates choice now. */
export function ratesNow() {
  return ratesChoice;
}

/**
 * The close-in closure for a Rates choice, feet per second of relative motion: the closure rate that flies route to
 * echelon (pairSlot's places, side by side, so the move is sideways) in CLOSE_IN_SEC, timed to the edge of the echelon
 * band (CLOSE_IN_BAND_FT), where IN POSITION shows. Sideways #2 sets the closure with the slide's bank and stops it at
 * CLOSURE.stopShare of it (the closure law, CLOSURE below), so with v the rate, a the slide's sideways acceleration (g tan of
 * CLOSURE.slideBankDeg) and d the distance, the time is
 *   ENGINE_RESPONSE_SEC + v / 2a (set) + d / v (cruise) + v / (2 stopShare a) (stop);
 * the rate is the slower root that gives CLOSE_IN_SEC. When no rate is that quick (the slide's bank limits it), it is the
 * rate that gives the quickest time. Derived, so an estimate as good as the slide's bank (Patrick 06:11Z: the gauge).
 */
export function closeInFtps(choice = ratesChoice) {
  const T = CLOSE_IN_SEC[choice] ?? CLOSE_IN_SEC[DEFAULT_RATES];
  const r = pairSlot('route', 1);
  const e = pairSlot('echelon', 1);
  const d = Math.hypot(r.fwd - e.fwd, r.left - e.left) - CLOSE_IN_BAND_FT;
  const a = G_FTPS2 * Math.tan((CLOSURE.slideBankDeg * Math.PI) / 180);
  const k = 1 / (2 * a) + 1 / (2 * CLOSURE.stopShare * a); // seconds per (ft/s) of set and stop
  const t = T - ENGINE_RESPONSE_SEC;
  const disc = t * t - 4 * k * d;
  return disc >= 0 ? (t - Math.sqrt(disc)) / (2 * k) : Math.sqrt(d / k);
}

/** The quickest route to echelon the slide's bank allows, seconds (closeInFtps's formula at its best rate). */
export function quickestCloseInSec() {
  const r = pairSlot('route', 1);
  const e = pairSlot('echelon', 1);
  const d = Math.hypot(r.fwd - e.fwd, r.left - e.left) - CLOSE_IN_BAND_FT;
  const a = G_FTPS2 * Math.tan((CLOSURE.slideBankDeg * Math.PI) / 180);
  const k = 1 / (2 * a) + 1 / (2 * CLOSURE.stopShare * a);
  return ENGINE_RESPONSE_SEC + 2 * Math.sqrt(k * d);
}

/** The close-in closure for the Rates choice now: { kt, ftps } (ftps: feet per second of relative motion). */
export function closureNow() {
  const ftps = closeInFtps();
  return { kt: Math.round(ftps / KT_TO_FTPS), ftps };
}

/** A rejoin's closure for the Rates choice now (REJOIN_CLOSURE_KT): { kt, ftps }. */
export function rejoinClosureNow() {
  const kt = REJOIN_CLOSURE_KT[ratesChoice];
  return { kt, ftps: kt * KT_TO_FTPS };
}

/**
 * The power profile (Patrick 5 Oct 04:58Z: "setting a higher power setting until a rate is "Set" then reducing the powr to
 * "maintain that rate", then as the aaircraft approaches the position it wants to be in, it does the opposite... low power
 * until its stopped in position, then increase to maintain"; 05:47Z: "We can use power to "assertively set the rate""; 05:54Z:
 * "speed brake can be used to help arrest the rate to the desired as well"; 06:13Z: "they dont HAVE to go full power to set
 * a rate. they can massage it at a lower power. it's just a techinque. so if the rate you wanted was at 67 torque, you could
 * set 90 or 100 to set it, then reset to 67 to maintain it... I dont want them to only use full power or idle"). A line
 * (hand-over.js, kinematic.js powerLaw) flies it on every 2-ship move: each change of rate (setting it, slowing it) overshoots
 * the new rate's holding power by the smallest step that reaches the new rate in about RATE_SET_SEC, never past full power
 * or idle, then resets to the power that holds it. Slowing, that is power below the holding power first, idle only if
 * needed, and the speed brake only when idle can't do it in time (slow-down.js, TS-61). Big changes end up at MAX or IDLE,
 * small ones show a part power (PWR 88%, then PWR 67%). The tracker's close-in work keeps its own speed loop and gains
 * (Patrick 06:24Z: "I think it needs a different power module.... i use the power different? Maybe we should test it as is
 * first?"); only its closure target is set here: the close-in rate, stopped from the stopping distance its power-back
 * slowing (sideways the slide's bank) gives. All estimates unless a source is given.
 */
export const CLOSURE = Object.freeze({
  stopShare: 0.6, // the tracker's stop is planned at 60% of what power back (sideways: the slide's bank) gives, so the roll and the speed loop's lag still stop him on the slot (estimate)
  slideBankDeg: CLOSE_BANK_DEG, // sideways the closure is set and stopped with up to the close move's 60° of bank (Patrick 06:43Z; 30° from 06:16Z until then), the same for every Rates choice (Patrick 06:07Z: "No on bank and g")
  nearGain: 1, // 1/s: inside the last few feet the closure dies away in proportion to the distance, so he settles without hunting; sideways only, fore and aft it is the tracker's own TRACKER.gain.position (V2.23.1) (estimate)
  farGain: 0.1, // ft/s per ft: beyond the hand-over band (odd starts only, the tracker's fallback) the closing speed may grow with range (the old rejoin's kcap)
});

/**
 * How fast the engine answers the power lever: torque from 2% to 100% in about 0.25 s (Patrick 5 Oct 06:02Z: "The TQ can
 * change very fast. 2 percent to 100 in .25 seconds."). A power change in the power profile (MAX, the power that holds the
 * rate, IDLE, the power that holds the slot) reaches its new thrust in this long, so the acceleration it gives is there
 * within it, then follows thrust minus drag.
 */
export const ENGINE_RESPONSE_SEC = 0.25;

/**
 * How long a change of rate takes: the power step is the smallest that reaches the new rate in about this long (an
 * estimate, the thread's default for Patrick's 06:13Z technique: "set 90 or 100 to set it, then reset to 67 to maintain it").
 */
export const RATE_SET_SEC = 2;

/**
 * The hand-over from a kinematic line to the tracker, and the change from a rejoin's closure to the close-in rate, together
 * at about 500 ft from the slot (Patrick 5 Oct 06:24Z; before it, card "Lines, then tracker" 05:41Z and 05:44Z: "within
 * 500-1000 feet, dpending on whats going on. becuase we start to see the aspect change and the clusre visually and adjust to
 * that"). The line flies the big move at the rejoin closure (REJOIN_CLOSURE_KT) to about 500 ft from the slot, arriving at
 * the close-in rate; the tracker takes the run-in from there, planned again from where #2 and Lead really are at that
 * moment (Patrick 06:24Z, "Should the tracker re-calculate after the line hands over?": yes). A move that starts inside
 * 500 ft is the tracker's alone. The same for every Rates choice. hand-over.js handOverPoint is the one place it is used.
 */
export const HAND_OVER_FT = 500;

// ---- the G rule and the 2-ship's banks (clean-up step 2, TS-65; Patrick 5 Oct 06:16Z) --------------------------------

/**
 * The wingmen's banks, 2-ship (step 2) and 4-ship (step 3) (Patrick 5 Oct 06:16Z). Item 12: "30 is probably more accurate"
 * for a close move's bank cap (the tracker's 25° until step 2); "When the aircraft is kicked off to fighting wing or line
 * abreast they can use unlimited bank to dive away and get in position quickly": no cap there but the G rule. Item 11: "No,
 * unlimitedf": a wingman following in a fighting wing turn has no bank cap but the G rule. Item 1: "Unlimitd bank" in a
 * rejoin: the 4-ship's tracker rejoin legs have no cap but the G rule (the 2-ship's hot rejoin keeps REJOIN.bankCapDeg until
 * the V2.22 rejoin work). Item 9: "60/2 as a standard always": Lead flies every fighting wing turn, the check turn included,
 * at 60° of bank, 2 G level (it was 30° for the check turn and 45° for the others, AFM7 brief p.14 item 5). The tracker's
 * turns are level, so "roll and dive" past 90° is not flown.
 */
export const WING_BANKS = Object.freeze({
  closeBankCapDeg: CLOSE_BANK_DEG, // Patrick 06:43Z: up to 60° as required (30° from 06:16Z item 12 until then)
  kickOutBankCapDeg: NO_BANK_CAP_DEG, // moves around a station: no cap (Patrick 6 Oct 04:07Z; the G rule only, 5 Oct 06:16Z item 12, until V2.116)
  fwFollowBankCapDeg: G_RULE_BANK_DEG, // Patrick 06:16Z item 11: the G rule only
  rejoinBankCapDeg: NO_BANK_CAP_DEG, // rejoins: no cap (Patrick 6 Oct 04:07Z; the G rule only, 5 Oct 06:16Z item 1, until V2.116) (the 4-ship's rejoin legs since step 3)
  fwTurnBankDeg: 60, // Patrick 06:16Z item 9: 60° of bank, 2 G level, every fighting wing turn
});

// ---- roll (from flight.js) -----------------------------------------------------------------------------------------

/**
 * Roll limits: up to 180°/s (Patrick 5 Oct 06:07Z: "Roll rate can be 180 degrees per second"; 90°/s until step 2, Patrick
 * 4 Oct 08:54Z), building and dying away at 720°/s² (an estimate, step 2: 180°/s is reached in 0.25 s and within a 45° roll;
 * it was 360°/s², Patrick card 4 Oct 09:54Z, which reaches 180°/s only in a roll of 90° or more).
 */
export const ROLL = RATE_SETS.tactical.roll;
