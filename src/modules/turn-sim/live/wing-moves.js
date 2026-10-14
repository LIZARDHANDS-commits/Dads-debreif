// The wingmen's numbers: the live fighting wing law (fw-live.js), the live fluid law (fluid-wing-live.js), the close
// formation turns' held poses (formation-turns.js) and the fluid exercise (fluid.js). One of
// the tuning sheet's number files (TS-214): tuning.js re-exports it, and docs/modules/turn-sim/numbers.md lists every
// number with its source. Moved unchanged from those files (12.2b); the numbers both laws use are written once
// (WING_LIVE, and handling.js MIN_POSITIVE_G). Numbers with no manual page or ruling are estimates and say so.
//
// This file imports only core and the other number files, so any file can read it without an import loop.
import { G_RULE } from './rates.js';
import { IN_POSITION } from './bands.js';
import { HOLD, WING } from './moves.js';
import { FW_BAND, FW4 } from './slots.js';
import { RATE_SETS } from './rates.js';
import { MIN_POSITIVE_G } from './handling.js';
import { LEAD } from './lead-moves.js';

/**
 * What both live laws do the same way (they were copies): power flies his place, 1 kt per 12.5 ft behind it less 0.6 kt
 * per knot he is already closing, and he pulls no more than about 1.5 G over what Lead is pulling (a pilot matches Lead's
 * pull and adds what the picture needs). Estimates.
 */
export const WING_LIVE = Object.freeze({ placeKtPerFt: 0.08, closeKtPerKt: 0.6, overLeadG: 1.5 });

/** The live fighting wing wingmen's numbers (TS-208; moved from fw-live.js, 12.2b). Estimates unless a source is given. */
export const FW_LIVE = Object.freeze({
  settleSec: 30, // his run goes on this long past Lead's plan, long enough to reset in position after a roll-out (estimate)
  maxSec: 300,
  arcFt: FW4.rangeFt, // in a turn he aims 650 ft of arc behind the one ahead (TS-208; Patrick 4 Oct 11:44Z, slots.js FW4)
  floorFt: FW_BAND.bubbleFt, // never closer than 500 ft to the one ahead (Patrick 12 Oct 2026 16:49Z; SMM 16.17 para 44c)
  floorMarginFt: 100, // he starts to give room 100 ft before the floor, at the range he will have in lookSec (estimate)
  lookSec: HOLD.lookSec, // ... in about 2 s at the closure he has (estimate, TS-74)
  floorGain: 2, // each foot short of the floor plus its margin counts as 2 ft too close (estimate)
  // The floor in a turn into him: he looks floorLookSec ahead with the one ahead holding his turn (fw-pursuit.js predict),
  // and if the heading he wants would bring him inside the floor plus its margin he takes the nearest heading on the lag
  // side that keeps him out (searched in floorStepDeg steps up to floorMaxDeg off it); with none, the best one and height
  // (estimates).
  floorLookSec: 6,
  floorStepDeg: 5,
  floorMaxDeg: 20, // ... and never more than 20° off Lead's circle (estimates; measured 12 Oct 2026: 90° stretched #3 to 2,500 ft, 45° to 1,900)
  stackFt: Object.freeze([-100, -50]), // 50 to 100 ft below the one ahead (Patrick 12 Oct 2026 17:16Z, 17:32Z "500 and stack is a technique that works")
  stackKeepFt: IN_POSITION.fwStackFt, // a deeper stack he has at the press is kept, up to the cone's 200 ft (TS-80), until Lead is level and he is clear (estimate)
  coneFt: 150, // height in the cone: no more than 150 ft from his stack to keep the floor (TS-96's cone height; estimate)
  // The pilot's hands (estimates): about 1 G of turn per 10° of heading error (a 4-6 s period, Fable's audit), his nose
  // put back onto the path over about 4 s of flight, at most 30° across it.
  gPer10Deg: 1,
  pathLookSec: 4,
  maxCutDeg: 30,
  rollDps: 60, // he rolls no faster than about 60°/s in fighting wing (estimate; the T-6A's own limit stays in stepLead) ...
  rollLeadDeg: 6, // ... his ask leading his wings by no more than 6° (estimate)
  lagTurnShare: 0.75, // lagging off the floor he turns at three quarters of Lead's turn ... (estimate; measured 12 Oct 2026: none overshot and stretched #3 and #4 to 1,400 ft, all of it passed closer) ...
  ffSec: 1, // ... eased over about a second (estimate)
  anticipateSec: 0.75, // he rolls with Lead's turn about 0.75 s of flight before he reaches where Lead rolled (estimate)
  // Lead, lag and pure: how far across Lead's circle he goes to close or open the arc (estimates). He wants the arc
  // error gone in about 6 s, at no more than 30 ft/s; the offset that gives is at most 500 ft, full in a turn of 1 G of
  // turning (about 45° of bank) and none straight.
  arcSec: 6,
  arcRateFtps: 30,
  acrossMaxFt: 500,
  turnFullG: 1,
  turnSec: 2, // his picture of the turn (lead, lag and pure against the cone) builds and fades over about 2 s (estimate)
  takeTurn: 0.25, // with Lead level and his own turn under a quarter of full, the cone place is taken (estimate)
  coneFtps: 40, // his place across the cone moves at no more than 40 ft/s (estimate)
  // Height: a gentle loop on his stack and the energy height, never from the pointing error (estimates).
  altFtps: 8, // moved up or down at no more than 8 ft/s (the live wingman's fighting wing rate, estimate)
  altSec: 4,
  climbSec: 1,
  maxClimbG: 0.25,
  floorFtps: 40, // the floor's height is flown at up to 40 ft/s (2,400 ft/min) ...
  floorClimbG: 0.5, // ... the climb or descent started at up to half a G ...
  floorSec: 1, // ... and closed on in about 1 s (estimates)
  energyFt: 100, // speed as height first, up to 100 ft (TS-96, TS-202; estimate)
  placeKtPerFt: WING_LIVE.placeKtPerFt, // power: 1 kt per 12.5 ft of arc behind his place (WING_LIVE) ...
  closeKtPerKt: WING_LIVE.closeKtPerKt, // ... less 0.6 kt per knot he is already closing (WING_LIVE) ...
  overtakeKias: HOLD.overtakeKias, // ... within 15 KIAS of Lead (EFIG p.374's 10-20 KIAS)
  overLeadG: WING_LIVE.overLeadG, // he pulls no more than about 1.5 G over Lead (WING_LIVE), the floor excepted ...
  normalG: G_RULE.normalG, // ... and 5 G, the normal ceiling (SMM 16.17 para 44a; Gen Book p.11), flagged, not a wall
  minG: MIN_POSITIVE_G, // no push below 0.5 G (as Lead, 2 CFFTS Orders B2 ch 8 para 1a; 0.5 an estimate; handling.js)
  // Lead's track, kept for the wingmen to fly: seeded this far behind Lead at the first press, at this spacing (estimates).
  seedFt: 8000,
  seedStepFt: 50,
});

/** The live fluid wingman's numbers (moved from fluid-wing-live.js, 12.2b). Estimates unless a source is given. */
export const LIVE = Object.freeze({
  sideDeg: WING.latDeg, // the side offset: 15° off Lead's tail (Patrick 4 Oct 22:28Z, "hold 15"; 12 Oct 02:45Z "that part is good")
  turnInFt: 50, // in a manoeuvre he holds about 50 ft inside the set distance (600 by default, so about 550: Patrick 12 Oct 2026 01:53Z, "maintain 500 in the turn and roll out slightly over 500"; 50 an estimate)
  capShare: 0.5, // lead or lag moves the aim off Lead, toward the inside of his turn or the outside, by up to half the range (about 27° of nose; estimate)
  biasLag: -0.3, // Lead's cue word sets the default: lag puts the aim 30% of the cap outside his turn ... (estimate)
  biasLead: 0.3, // ... and lead 30% inside (estimate); pure is on him
  loopWords: Object.freeze({ pureDeg: 110, leadDeg: 160, pullOutDeg: 330 }), // the loop, by Lead's angle round it: lag, pure from 110° (near the vertical), lead from 160° (over the top: Patrick 12 Oct 2026 03:40Z "around this position we should be transitioning to lead pursuit"), pure from the pull-out (330°, fluid-lead.js). Estimates; the planned wingman keeps his own breaks (155°, 205°)
  overWords: Object.freeze({ pure: 0.3, lead: 0.45, pullOut: 0.9 }), // a wingover or a barrel roll, by how far through it Lead is: the same shape (planned: 0.4, 0.6, 0.9); estimates
  sideSwapDeg: 5, // with Lead level again, #2 takes the side of Lead's tail he is on once more than 5° past it (estimate), and keeps it
  sideFreeTurn: 0.25, // ... only with Lead's turn eased off (below a quarter of the full slide), upright and his nose near the horizon (estimates)
  biasPerSec: 0.15, // a change of cue word slides the default over about 2 s, lead to pure (4 s lag to lead), never in a step (estimate)
  kR: 1, // the range error, as a share of the range wanted, moves the aim ahead (stretched) or behind (tight) one for one (estimate)
  kC: 1, // the closure over lookSec, as a share of the range wanted, moves it behind (closing) or ahead (opening) one for one (estimate)
  lookSec: HOLD.lookSec, // he sets his lag or lead for the gap he will have in about 2 s at the closure he has (estimate, TS-74)
  severityG: 2, // the slide is full with Lead turning at 2 G of acceleration (a 3.5 G loop, a 70° turn), none straight (estimate) ...
  severitySec: 2, // ... and follows his turn over about 2 s, none to full, so a quick roll-in of Lead's moves #2's picture smoothly, never in a step (estimate; smooth hands)
  turnSenseSec: 0.5, // #2's sense of Lead's turn (its direction and size) follows Lead's turning acceleration with about half a second of lag (estimate) ...
  turnHeldG: 0.1, // ... and below 0.1 G of it the last turn's direction and plane are held, so a straight Lead never leaves him a direction from noise (estimate)
  circleSec: 4, // in a turn the side offset in Lead's plane eases away over about 4 s, so #2 settles onto Lead's circle (estimate; Patrick 12 Oct 2026 01:39Z: "maintain 500 feet in the turn then accept getting a bit further away as we seep out to our 'offset' position"); turning into him it is circleInsideSec
  swapLookSec: 0.25, // his drift across Lead's tail is read over about a quarter second (estimate; the planned cue read it over 0.25 s too)
  circleBackSec: 12, // in Terminate the offset comes back as Lead rolls out over about 12 s, the slot slide's own pace (estimate), so the roll-out never jumps the aim across
  circleInsideSec: 8, // ... but with the offset on the inside of Lead's turn (Lead turning into him) over about 8 s, so Lead's turn brings the circle to him and he rolls in later and shallower instead of rolling away first (estimate; Patrick 12 Oct 2026 03:10Z: he turns away only when the turn would bring him inside 500 ft)
  bubbleShare: -1, // inside the 500 ft bubble the aim goes to full lag (spec section 9; SMM 16.17 para 44c)
  handsFadeSec: 3, // ... and fades out over the first 3 s after the Terminate press (estimate), so it is for the press only
  handsSec: 1, // in Terminate the lift wanted is eased over about a second (estimate; spec section 10.11, "eased over about a second")
  heightShare: 0.8, // how much of the offset eased off Lead's plane comes back as height above him in a turn (estimate; measured about 100 ft at 15° and 650 ft)
  l1Sec: 2.5, // the pursuit gain is 2V over the distance to the aim, or over about 2.5 s of flight if the aim is nearer (estimate): standard L1 guidance, soft enough that a roll-in of Lead's is followed, not snatched at
  overLeadG: WING_LIVE.overLeadG, // he pulls no more than about 1.5 G over what Lead is pulling (estimate: a pilot matches Lead's pull and adds what the picture needs), the bubble excepted
  relevelPerSec: 0.5, // the side frame along Lead's path eases back to level at about 0.5 per second with Lead upright and his nose near the horizon, none inverted or near the vertical (estimate), so his side holds through a loop
  minG: MIN_POSITIVE_G, // never below 0.5 G on the lift he has (as Lead's push, 2 CFFTS Orders B2 ch 8 para 1a; 0.5 an estimate; handling.js)
  normalG: G_RULE.normalG, // SMM 16.17 para 44a; Gen Book p.11 (flagged, the normal ceiling)
  acrossDps: 3, // how fast his place moves across the tail (the entry): 3°/s, 30° in about 10 s (estimate)
  openDeg: 25, // tight with Lead straight his place opens across toward the edge of the fluid cone, 30° off the tail (SMM 16.17 para 42) less the shared 5° margin, so he is judged in position all the way; measured on V2.380 from 500 ft at 55° off the tail: opening to 45° (the middle of the fighting wing cone) keeps him 485 ft at the closest but parks him at 32°, out of the fluid cone; 25° goes through 429 ft (flagged TIGHT) and settles 519 ft at 24°, in position, with the fewest bank reversals (estimate) ...
  topSwapUpZ: 0.7, // the inverted top of a roll: Lead's canopy more than about 135° from upright (estimate) ...
  topSwapRollDps: 20, // ... and still rolling through it, faster than 20°/s (estimate), so a held inverted pass is not a roll ...
  topSwapTurn: 0.5, // ... with Lead pulling at least half the severity, about 1 G of turn (estimate)
  openUpFt: 100, // ... and up to about 100 ft above Lead (estimate: "use the cone as required", Patrick 5 Oct 2026 23:02Z), a longer path with power at MAX
  slotSideDeg: 2, // near Lead's tail Terminate takes the side he is heading for once more than 2° past it (estimate) ...
  slotAcrossDps: 1.5, // in Terminate his place flows across to the fighting wing slot at 1.5°/s (estimate), a gentle slide out while Lead flies straight
  rangeFtps: 60, // how fast his place moves in or out (a new distance, the entry, Terminate): estimate
  altFtps: 20, // how fast his place moves up or down (Terminate's slot height): estimate
  placeKtPerFt: WING_LIVE.placeKtPerFt, // with Lead holding a speed, power flies his place: 1 kt faster per 12.5 ft behind it (WING_LIVE) ...
  closeKtPerKt: WING_LIVE.closeKtPerKt, // ... less 0.6 kt per knot he is already closing on it (WING_LIVE) ...
  overtakeKias: HOLD.overtakeKias, // ... within 15 KIAS of Lead (EFIG p.374's 10-20 KIAS)
  wordShare: Object.freeze({ on: 0.35, off: 0.15 }), // LAG or LEAD shows past 35% of the cap and goes under 15%, so the word doesn't flicker (estimate)
  settleKt: 2, // Terminate ends with him in the fighting wing band and within 2 kt of Lead (spec section 9)
  fwAltFtps: 8, // ... and moved up or down at no more than 8 ft/s, so a change of height is a gentle climb or descent, not a bob (estimate)
  // In fighting wing his aim moves round Lead (in Lead's own frame) no faster than this and builds to it at fwAimAccel, so a
  // press of Lead's never asks him for a snap: from the 4-ship's place (543 ft, 45° off the tail) the aim swept about 400 ft
  // across in 3.6 s at a level turn's press and rolled him to 85° in 2 s (Patrick 12 Oct 2026 10:02Z: "There should be roll
  // rates and roll acceleration build ups built in"; his card 10:08Z "Ease the aim"). Estimates.
  fwAimFtps: 100,
  fwAimAccelFtps2: 60,
  fwHeightFt: 100, // in fighting wing (TS-202) his spacing is flown with height first: up to the cone's 150 ft above or below Lead less the 50 ft margin (TS-96, FW_ENERGY; estimates)
});

// ---- the fluid exercise (from fluid.js) ------------------------------------------------------------------------------

/** The fluid manoeuvring numbers (Patrick's picks of 19:20Z, fluid-conflicts.md, unless said). */
export const FLUID = Object.freeze({
  rangeFt: Object.freeze({ min: FW_BAND.rangeFt[0], max: FW_BAND.rangeFt[1], def: 600, goodMax: 750 }), // SMM 16.17 para 42; AFM7 p.17, AFM8 p.19; Patrick row 3 (min and max: slots.js FW_BAND)
  coneHalfDeg: 30, // 60° in all, 30° either side of Lead's tail (Patrick row 2)
  bubbleFt: FW_BAND.bubbleFt, // SMM 16.17 para 44c; Gen Book p.11 (slots.js FW_BAND)
  wingGLimit: 5, // SMM 16.17 para 44a; Gen Book p.11 (flagged, never a wall)
  leadGLimit: 4, // 2 CFFTS Orders B2 ch 8 para 1a; Gen Book p.11 (flagged)
  hardDeckMslFt: 6000, // 3,000 ft AGL, about 6,000 ft MSL in the Moose Jaw areas (SMM 14.6 para 16); FM minimum (Orders B2 ch 8 para 1f; Gen Book p.11)
  aspectHcaFlagDeg: 90, // SMM 16.17 para 44b
  lowLosDps: 5, // "low line of sight": an estimate (design 5.5)
});

// ---- the close formation turns: held poses (from formation-turns.js) --------------------------------------------------

/**
 * The numbers of the close formation turns. Lead's bank: the 2-ship and the 4-ship's finger, box, route and line astern turn
 * at 45° (1.4 G), an estimate inside the close formation limit of 3 G (2 CFFTS Orders B2 ch 8 p.97, para 1a and 1b); the
 * check turn at 30° (gentle, as in fighting wing). The 4-ship's echelon turns at 30°: the Orders normally restrict it to
 * stepped turns away at 30° of bank (para 1b(2)); SMM 16.36 para 101 also has echelon turns normally away from the formation.
 * A turn into a 4-ship echelon is flown and flagged, never refused (the rule book: references, not walls).
 */
export const CLOSE_TURN = Object.freeze({
  bankDeg: 45,
  /** The 2-ship echelon turn: 60° of bank, 2 G (Patrick 5 Oct 20:50Z: "about 4-5 seconds to get to 60/2"; TS-78). */
  echelonBankDeg: 60,
  gentleBankDeg: 30,
  fourEchelonBankDeg: 30,
  /**
   * Lead's roll in a close formation turn: up to 30°/s, building at 20°/s², so 45° of bank takes about 3 s (estimates; no
   * manual gives a roll rate). At the 180°/s every other move may use (Patrick 5 Oct 06:07Z) his wing plane would swing a
   * wingman's place 30 ft (echelon) to 120 ft (route) up or down in half a second, which no wingman can follow.
   */
  leadRoll: RATE_SETS.close.leadRoll,
  /**
   * The 2-ship echelon turn's roll: "very slow and smooth, about 4-5 seconds to get to 60/2 ... Echelon is smooth to allow 2
   * to stay in position in tight formation" (Patrick 20:50Z): up to 30°/s, building at 12°/s², about 4.5 s to 60° (the
   * Formation thread's dry runs, 5 Oct: past about 15°/s² Lead's roll pushes #2 along his lift line faster than #2 can
   * follow at 0.3 G or more). Every other formation and move keeps the aircraft's own roll (tuning.js ROLL).
   */
  echelonRoll: RATE_SETS.close.echelonRoll,
  /**
   * How a close wingman holds his place in Lead's real wing plane through the roll-in, the turn and the roll-out (SMM 12.19
   * paras 41-43, Fig 12.11; Patrick 5 Oct 19:51Z: "The aircraft should use bank and pitch and roll to stay in position as
   * lead flies in echelon, from any close formation position"; holdInPlane below). He rolls with Lead, and:
   *  - pulls or unloads up to followG more or less than Lead's G along Lead's lift line (pitch), so on the outside of a
   *    roll-in he climbs into the plane and on the inside he descends;
   *  - banks off Lead's bank to slide in or out along Lead's wing line, as far as it takes (no limit but physics: Patrick's
   *    "no bank limit in formation"), settling across at sidePerSec so a small gap takes a degree or two;
   *  - changes speed up to powerG along Lead's heading (about 2 kt/s);
   *  - builds a change of G at no more than onsetGps, and settles back onto his place at about holdPerSec (critically damped).
   * All estimates. Where Lead's roll moves his place faster than that (route, the 4-ship's outer wingmen) he is briefly out
   * of place and back in a few seconds ("initially climbs or descends slightly as bank is changed", para 41).
   */
  followG: 0.5,
  /**
   * How fast he settles across Lead's wing line, per second (critically damped; estimate). Patrick 10 Oct 23:06Z: "we want
   * the aircraft to stay in position during turns, 2 uses power, bank, pitch". Until V2.229 his bank was held within 2.5° of
   * Lead's (10° wings level), too little to follow Lead's roll: in finger #4 slid 170 ft wide in a 90° turn. At 1/s a 1 ft
   * gap takes about 1° of bank, so in a steady turn he sits within a degree or two of Lead's bank.
   */
  sidePerSec: 1,
  /** How long after Lead's turn he may take to settle back on his place (estimate; it was 30 s, too short after a 60° roll-out). */
  settleSec: 60,
  powerG: 0.1,
  onsetGps: 4,
  holdPerSec: 2.5,
  /**
   * His roll, rate and onset, is Lead's close-turn roll (closeTurnRoll) times this (estimate; Fable's V2.234 flight report,
   * Patrick 11 Oct 03:40Z: "the target bank angle and roll rate should be proportional to the desired change ... it should
   * be very smooth in close form"). Until V2.245 only the 4 G/s onset limited his path, a lift-vector swing of about
   * 230°/s, so his roll snapped 13 to 31 to 13°/s each time Lead's roll started or stopped.
   */
  rollMargin: 1.5,
  /** The most bank off Lead's he uses to slide across Lead's wing line (estimate), the slide in proportion to the gap below it. */
  sideBankDeg: 15,
  /** The turn ends with every wingman's bank within this of Lead's (estimate; Fable's V2.331 flight). */
  endBankDeg: 0.2,
  /** Handed over from the tracker, how long he takes to ease into the hold's G onset and power (estimate). */
  handOverEaseSec: 0.5,
});

/**
 * A close wingman's catch-up roll (estimates): his roll limit (rate and onset) grows smoothly with how far he is behind Lead's
 * bank, to mult times the smooth roll at fullDeg behind (rollFrom).
 */
export const CATCH_UP = Object.freeze({ fullDeg: 15, mult: 3 });

/** How far behind the path's bank his wings may be and still count as having caught it up (degrees; an estimate). */
export const ROLLED_CAUGHT_DEG = 0.1;
/**
 * The longest roll-in that is re-flown at his rolled bank (an estimate). A rejoin's hand-over lags for well under a second
 * (about 0.7 s, probes 12 Oct 2026); a close turn's roll-in can lag for 5 s or more (#4 in a 4-ship echelon hook), and
 * re-flying that drew him out of position, so a longer lag flies the planned path as before.
 */
export const ROLLED_MAX_SEC = 1;
/**
 * How long the path flown at his rolled bank takes to blend back onto the planned path (an estimate). Long enough that the
 * blend adds no more than about a degree of bank past the planned path's: at 2 s it added up to 4° (probes, 12 Oct 2026).
 */
export const ROLLED_BLEND_SEC = 6;

/** How far a wingman may be from his slot at the press and still hold the slot (the classifier's close tolerance, judge.js). */
export const SLOT_TOL_FT = 15;

/** The bank off Lead's that Lead's roll rate leaves his farthest wingman needing to hold his place across Lead's wing line (estimate). */
export const ROLL_WITH_DEG = 5;

// ---- the close-formation wingman (B1, TS-226; spec 7b) ----------------------------------------------------------------

/**
 * What the close-formation wingman sees and how (live/wingman/perception.js; spec 7b.3, 7b.6b, 7b.6d). Estimates unless a
 * source is given.
 */
export const CLOSE_SEE = Object.freeze({
  delaySec: 0.3, // everything he sees reaches his hands about 0.3 s late (TS-211, estimate; Tohidi and Yildiz (2020) measured 0.3 s as a pilot's total delay, decision plus neuromuscular)
  filterSec: 0.1, // the rates he reads (the picture moving, Lead's roll and its build-up, Lead's G) are smoothed over about 0.1 s, as an eye judges motion over a moment: at most 0.1 s, the plane axis has little phase to spare (spec 7b.6d item 7, the Fable audit)
  aheadSec: 0.3, // he dead-reckons Lead's bank across his own delay: seen bank + rate x 0.3 + half the build-up x 0.3² (spec 7b.6d item 5)
});

/**
 * How the close-formation wingman holds his place (live/wingman/close-formation.js, supervisor.js, shaper.js; spec 7b.4,
 * 7b.6, 7b.6c, 7b.6d). Three loops, one per control, each P and D on what he sees and a weak trim (core pilotAxis): pitch
 * (G) on up and down, roll (bank off Lead's) on in and out, power (torque) on forward and back. Estimates unless a source
 * is given; to be tuned by eye on the plot page and then flown by Patrick (spec 7b.6c).
 */
export const CLOSE_WING = Object.freeze({
  // Pitch, on the plane axis: G per foot and per ft/s (spec 7b.6c's starting gains; with the 0.3 s reaction about 2 rad/s
  // and 37° of phase margin, the Fable audit; fallback 0.03 and 0.06). The trim starts at zero (spec 7b.6c, "added only if
  // an offset remains"): the T2 probe showed a trim of 0.004 G per ft·s overshooting by 1 ft.
  plane: Object.freeze({ kp: 0.04, kd: 0.06, ki: 0, iMax: 0 }),
  // In Lead's wing plane both loops are a cascade (spec 7b.6c "Power is a cascade"): the distance to his place picks one pace
  // straight at it, and roll and power each close the pace he wants on the closure he sees, so on a move along the line bank
  // and power go together and he stays on it ("power and bank together", 7b.3). Near the spot the pace is 0.4 ft/s per foot
  // to go (estimate, for spec 7b.6b's settle of about 4 s: at 0.26-0.3, the audit's gains, a 3 ft correction took 6 s to come
  // within 1 ft with P reading 0.5 ft less, T4 probe).
  kPosPerSec: 0.4,
  // Roll, in and out: degrees of bank off Lead's per ft/s of pace error (spec 7b.6d item 7: 1.7 to 2.1° per ft/s, crossover
  // 1.0 to 1.2 rad/s; estimate), so 0.76° per foot near the spot (the audit's "about 0.5°/ft"). Trim from zero as above.
  side: Object.freeze({ kdDegPerFtps: 1.9, ki: 0, iMax: 0 }),
  // Power, forward and back: about 12% torque per ft/s of pace error (spec 7b.6d item 7: 10 to 13%, estimate), so 4.8% per
  // foot near the spot. Trim from zero as above.
  fore: Object.freeze({ kdPctPerFtps: 12, ki: 0, iMax: 0 }),
  // No threshold (Patrick 13 Oct 2026: "we notice ANY drift from the ideal references. if we're not exactly on plane or
  // exactly on the line we will correct, until we stabilize at the 'golden power setting' and control pressures to freeze
  // us in place (which is rare)"). Replaces the audit's soft threshold (spec 7b.6d item 11: P less 0.5 ft, D ignoring drift
  // under 0.5 ft/s), which left him coasting 0.85 ft past his place. T4 probe, 3 ft off: within 0.5 ft in 1.55 s (plane)
  // and 3.65-3.95 s (in the plane), overshoot 0.05 and 0.26-0.33 ft. Kept as numbers so a threshold can come back.
  deadFt: 0,
  deadFtps: 0,
  // The pace: at most jogging, 8 ft/s, in B1 (Patrick 13 Oct 2026: "yes 8 ft/s and 13 ft/s works"; "start with slower rates
  // until we figure out how to tune the PID"), tapering as sqrt(2 x braking x distance) so he can always stop on the spot,
  // the braking what the power floor gives (spec 7b.6d item 13: at 20% torque about 1.3 kt/s at 200 KIAS and 8,000 ft), for
  // the part of the move the power must stop (the rest the bank stops), after his reaction and the torque's walk down to
  // the floor at the job's rate (all from the numbers here: standard kinematics, d = v t + v² / 2b).
  paceFtps: 8,
  brakeTorquePct: 20,
  // Below 10% torque he would use the boards before idle (Patrick 13 Oct 2026, "sure 10% tq for boards"; TS-61's order).
  // The live step has no boards' drag, so B1 flags it and holds 10%: never needed in a straight-and-level hold.
  boardsBelowPct: 10,
  rollCatchUp: 0.6, // while his bank is behind the bank his lift asks for he rolls this share of the gap past it, so he rolls faster than Lead until caught up (Patrick 13 Oct 2026; estimate, tuned on the probe)
  telegraphTorquePctps: 20, // while he sees Lead rolling his hand moves the throttle at up to 20%/s (spec 7b.6d item 6: about 10%/s on station, 15-20%/s in a telegraph; estimate)
  // The hand-over from a change into echelon (events.js liveHandOver; spec 7b.6d items 2 and 3): he is handed over only
  // closing slowly enough to stop on his place after his reaction, braking at the power floor's rate (spec 7b.6d item 13: at
  // 20% torque about 1.3 kt/s at 200 KIAS and 8,000 ft; the reaction TS-211's 0.3 s, as CLOSE_SEE.delaySec).
  handOverBrakeKtps: 1.3,
  handOverReactSec: 0.3,
  // The pilot's hand (spec 7b.4 and 7b.6d item 6; estimates), by job: the most G off what Lead's motion needs, the most bank
  // off Lead's, the most torque off the holding setting (100: the floor to MAX), and how fast his torque may move (about
  // 10%/s on station; a move's set and catch quicker, 20%/s, the top of 7b.6d's 15-20%/s). On station and small moves the
  // pressures of 7b.4 (about 0.3 G, 5°, 5-10% torque); large moves and out-before-up the old hold's sizes (wing-moves.js
  // CLOSE_TURN followG 0.5 G and sideBankDeg 15°). His bank is never smoothed (Patrick 13 Oct 2026: a wingman's bank may be
  // "very un-smooth ... very quick/small as required"): it moves as fast as the aircraft rolls.
  jobs: Object.freeze({
    onStation: Object.freeze({ gCap: 0.3, bankCapDeg: 5, torqueCapPct: 10, torquePctps: 10 }),
    smallMove: Object.freeze({ gCap: 0.3, bankCapDeg: 5, torqueCapPct: 10, torquePctps: 10 }),
    largeMove: Object.freeze({ gCap: 0.5, bankCapDeg: 15, torqueCapPct: 100, torquePctps: 20 }),
    outBeforeUp: Object.freeze({ gCap: 0.5, bankCapDeg: 15, torqueCapPct: 100, torquePctps: 20 }),
    offStation: Object.freeze({ gCap: 0.5, bankCapDeg: 15, torqueCapPct: 100, torquePctps: 20 }), // B3: a change between close places, a large move's sizes (estimate)
  }),
  // B3 (spec 7c.3-7c.5, TS-231): a change between the close formations, flown by him as a short list of places in Lead's
  // frame (supervisor.js stationChange), straight at each in turn at a pace, tapering to stop on the last.
  offStation: Object.freeze({
    paceFtps: 8, // at most jogging, 8 ft/s, on every close move for now (Patrick 14 Oct 2026, "Jogging only for now"; spec 7c.4)
    intoEchelonFtps: 5, // from the corner forward and up into echelon at about 5 ft/s (spec 7c.3, approved 14 Oct 2026; an estimate beside SMM 12.20 paras 45, 47)
    flowFt: 5, // a place on the way is passed once within 5 ft of it ... (TS-117: corners passed within 5 ft, an estimate)
    flowKt: 5, // ... and no faster against it than 5 kt (TS-117, Patrick 6 Oct 05:29Z: "can be moving 5 knots thru corners")
    doneFt: 1.5, // on the last place the change's own list ends within the small move's 1.5 ft (smallFromFt) ...
    doneFtps: 1.5, // ... moving under a gentle drift (driftBackFtps); he holds it from there as always
  }),
  // B3 deconfliction (spec 7c.3: "never within a wingspan of Lead, never ahead of Lead's 3/9 line, no wings overlapping, under
  // Lead out before up"), each a guard on the place he aims at, with a dead band so it never flickers (estimates):
  deconflict: Object.freeze({
    // no wings overlapping (SMM 12.20 para 44 CAUTION: "never overlap the wing of another aircraft"; para 45: nose at least
    // 10 ft behind Lead's tail, below the prop wash): while his wings overlap Lead's sideways (centres closer than a span, or
    // will be within lookAheadSec at the rate he is moving across), he goes no further in and goes back to line astern's fore
    // and aft once more than noseTailDeadFt ahead of it, until back within half that
    noseTailDeadFt: 2,
    lookAheadSec: 1, // about what stopping from 8 ft/s across takes with 15° of bank and his 0.3 s reaction (standard kinematics)
    spanDeadFt: 2, // never within a wingspan (centre to centre): inside span + 2 ft he aims straight away from Lead to span + 4 ft
    aheadDeadFt: 5, // never ahead of Lead's 3/9 line: further forward than 5 ft behind it he aims 10 ft behind it
  }),
  capsPerSec: Object.freeze({ g: 0.5, bankDeg: 10, torquePct: 30 }), // a new job's pressure sizes are eased in, never stepped (bumpless; estimates)
  // The supervisor's jobs, each with a dead band so it never flickers (spec 7b.6d item 12; estimates): a small move from
  // 1.5 ft off (the 0.5 ft he can see and a margin) back to on station under 1 ft; a large move past 10 ft (Patrick's small
  // move is "up to about 10 ft", spec 7b.6) back to small under 8 ft; under Lead (below his wing plane, inside his wingtip)
  // out before up, until 2 ft outside the wingtip or above the plane.
  smallFromFt: 1.5,
  stationFromFt: 1,
  largeFromFt: 10,
  smallBackFt: 8,
  // ... and a large move too while he is moving faster than a gentle drift (spec 7b.6: "a gentle drift for a few feet, up to
  // a jogging pace"), 2 ft/s, back under 1.5 ft/s (estimates): a hand-over still closing brakes with a large move's pressures.
  driftFtps: 2,
  driftBackFtps: 1.5,
  underClearFt: 2,
  // Plane, line, hinge (Patrick 13 Oct 2026): in a large move the line's error is shown to the loops once he is within 2 ft
  // of the plane, and the error along the line once also within 2 ft of the line, each eased in at half its share a second
  // (estimates), so the loops see one or two dimensions at a time and the target never jumps. On station all at once.
  plhBandFt: 2,
  plhPerSec: 0.5,
});

// ---- fighting wing on the live wingman (B5, TS-233; spec 7e) -----------------------------------------------------------

/**
 * What #2 sees in fighting wing (live/wingman/perception.js seeFw; spec 7e.7). Close formation's CLOSE_SEE is its own and
 * untouched (its 0.3 s, TS-211; the delay is per technique, F5). Estimates unless a source is given.
 */
export const FW_SEE = Object.freeze({
  delaySec: 0.4, // he acts 0.4 s after he sees Lead's bank and nose start (Patrick 14 Oct 2026; TS-211's 0.3-0.5 s)
  extraDelaySec: 0, // a further delay he does not know he has (his dead reckoning still carries Lead 0.4 s): the delay sweep's (Fable's loop margins), 0 in flying
  losSec: 0.5, // the line of sight's rate, Lead's drift across the windscreen, smoothed over about 0.5 s (spec 7e.7)
  gSec: 0.15, // Lead's seen G (his lift, so his turn circle and G cap, S05b) smoothed over about 0.15 s (spec 7e.4, Fable D22; estimate)
  rollSec: 0.2, // Lead's seen roll rate (S04) smoothed over about 0.2 s before carrying his bank across the 0.4 s delay (spec 7e.4, Fable D3; estimate)
  bankCarryMaxDeg: 70, // plausible end-bank cap when extrapolating Lead's seen bank across the 0.4 s delay (S03, TS-233 "Lead's roll carried on", Fable D3; estimate)
});

/**
 * How #2 flies fighting wing (live/wingman/fighting-wing.js, separation.js, supervisor.js fwJob; spec 7e.7's loop table),
 * grouped by the part that reads it: steering, Lead's turn as he sees it, the turn, swept, the vertical, power, and the
 * separation guard and filter. Estimates unless a source is given (every gain a guess to start from, spec 7e.8). The
 * round-by-round history of each number is in `Pat's claude work/formation-review-12oct/fighting-wing-code-history.md`.
 */
export const FW_WING = Object.freeze({
  // ---- steering & normal follower (B05, B09; spec 7e §7.6-7.8, TS-233, Fable D2, D21) ----
  chiMaxOutDeg: 20, // max outward approach angle toward lag side of Lead's circle or swept line: 20° (Patrick 14 Oct 2026, TS-233 "steer-behind 20°")
  chiMaxInDeg: 12, // max inward approach angle toward lead side of Lead's circle or swept line: 12° (Patrick 14 Oct 2026, TS-233 "steer-ahead 12°")
  keDegPerFt: 0.026, // cross-track approach slope Ke: 0.026°/ft (k ≈ 1/420 ft out, 1/250 ft in; TS-233, Fable D2; estimate)
  kChiPerSec: 0.5, // steering loop proportional course gain Kχ: 0.5 /s, crossover ~0.52 rad/s, 48-65° PM (TS-233, Fable D2; estimate)
  maxCircleRadiusFt: 20000, // Lead's seen turn radius clipped near 20,000 ft so the circle becomes the swept line smoothly as ω -> 0 (spec 7e §7.6, Fable D21; estimate)
  overLeadG: 1.5, // his G no more than Lead's + 1.5 (spec 7e.7, estimate); the guard may open the cap smoothly inside 550 ft, flagged (Patrick 14 Oct 2026)
  capKneeG: 0.2, // soft knee below the G cap where positive climb demand begins to give way smoothly before level hold and turn (spec 7e.8, Fable D20; estimate)
  minG: 0.5, // never under 0.5 G, so his lift always has a direction and he rolls and pulls instead of pushing to 0/neg G (Patrick 14 Oct 2026, TS-233; estimate)
  onsetMinGps: 1, // ordinary G onset at urgency 0: 1 G/s (Patrick 14 Oct 2026, TS-233 "G onset by urgency")
  onsetMaxGps: 4, // urgent G onset at urgency 1: 4 G/s, the T-6A's onset (Patrick 14 Oct 2026, TS-233 "G onset by urgency")
  rollDps: 60, // roll up to 60°/s (spec 7e.7, estimate); his bank is not capped: past 90° only when the lift he needs points there (Patrick 14 Oct 2026, "only if required")
  pullWithinDeg: 20, // unload, roll, pull: with his wings more than 20° off where the lift is wanted he pulls only its share along them (estimate; fw-live.js does the same)
  turnPlaneRadps: 0.0175, // steering in Lead's turn plane once Lead turns faster than about 1°/s, else the level plane (estimate)
  blendSec: 1.5, // phase weight blend time 1.5 s (spec 7e §7.5, R11; estimate)
  // ---- phase & case recognizer (B03; supervisor.js, spec 7e §7.5-7.6, Fable D5, D17) ----
  turnStartDeg: 10, // Entry phase starts immediately once Lead's seen extrapolated bank passes 10° with no 1 s hold (spec 7e §7.5, R7; estimate)
  turnEndDeg: 5, // Exit phase starts once Lead's seen bank drops under 5° (spec 7e §7.5; estimate)
  phaseBlendSec: 1.5, // continuous phase weights (level, entry, turning, exit) blended over 1.5 s (spec 7e §7.5, Fable D17; estimate)
  sideBlendSec: 6, // case/side choice blended over >= 6 s (3 / ω_c for steering crossover 0.52 rad/s; spec 7e §7.5, Fable D5, D17; estimate)
  caseDeadBandFt: 50, // ±50 ft hysteresis dead band around case range boundaries so case label never flickers (Fable D17; estimate)
  happyFt: Object.freeze([600, 650]), // the range he is happy at, slant (Patrick 14 Oct 2026)
  stretchedFt: 700, // stretched case past 700 ft (Patrick 14 Oct 2026: "lead if more than 700, lag if near 500 (? numbers are a guess)")
  veryStretchedFt: 1000, // very-stretched case past 1,000 ft, outside the cone's far edge (Patrick 14 Oct 2026, TS-233)
  tightFt: 560, // tight case under 560 ft (spec 7e §7.5; estimate)
  entryCaptureFt: 100, // Entry phase transitions to Turning once within 100 ft of the target circle offset ... (spec 7e §7.5; estimate)
  entryCaptureDeg: 5, // ... and within 5° of the target course ... (spec 7e §7.5; estimate)
  entryMaxSec: 8, // ... or after at most 8 s in Entry (spec 7e §7.5; estimate)
  exitSettleFtps: 10, // Exit phase transitions to Level once in the cone with closure under 10 ft/s ... (spec 7e §7.5; estimate)
  exitSettleSec: 5, // ... held for 5 s (spec 7e §7.5; estimate)
  // ---- arc & range loop (B07; spec 7e §7.7, TS-233, Fable D9, D10, D21) ----
  turnFrameDeg: 5, // (s, d) in Lead's turn-centre frame; below 5° of his bank their straight-line limits (Fable F10, estimate)
  arcTargetFt: 650, // s_target, the arc behind Lead he holds in a turn (Fable F1; Patrick's happy 600-650 ft)
  aimSec: 10, // one 10 s range time constant τ_s = τ_r = 10 s for both turns and level flight (Patrick 14 Oct 2026, TS-233, Fable D10, D21)
  arcNearFt: 300, // mid-point of the 200-400 ft soft closure transition band (spec 7e §7.7; estimate)
  arcNearBandFt: Object.freeze([200, 400]), // wanted closure soft-limited from 25 ft/s inside 200 ft to 60 ft/s beyond 400 ft (spec 7e §7.7, Fable D10; estimate)
  arcNearFtps: 25, // wanted closure cap near target arc: 25 ft/s (Fable F1, D10; estimate)
  arcFarFtps: 60, // wanted closure cap far from target arc: 60 ft/s (Fable F1, D10; estimate)
  arcKc: 0.5, // closure-shortfall gain kc = 0.5 in d = d_ss + w/ω + kc(w - c)/ω (Fable D10; estimate)
  arcOffsetMaxFt: 250, // offset d_cmd bounded within ±250 ft of Lead's circle; unmet closure beyond ±250 ft hands off to speed S29b (Patrick 14 Oct 2026, TS-233, Fable D9, D21)
  arcSlewFtps: 60, // d_cmd slewed at 60 ft/s (Fable F1, F11; estimate)
  minTurnRadps: 0.03, // d divides by Lead's turn rate, never by less than about 1.7°/s (Fable F3; estimate)
  // ---- swept line (Lead wings level; Patrick 14 Oct 2026, spec 7e §7.6) ----
  sweptFt: 625, // 625 ft at 45° (Patrick 14 Oct 2026)
  sweptDeg: 45, // 45° of sweep back from Lead's wing line (Patrick 14 Oct 2026)
  aimMaxFtps: 25, // level range closure cap ±25 ft/s (spec 7e §7.7)
  aimSlewFtps: 20, // turn offset slewed back to 0 at 20 ft/s when wings level (spec 7e §7.7)
  sTurnFt: 550, // S-turns trigger slant range in level flight (kept until S5 moves it to FW_STURN; estimate)
  sTurnClosureFtps: 15, // S-turns trigger closure in level flight (kept until S5; estimate)
  sTurnDoneFt: 600, // S-turns release range in level flight (kept until S5; estimate)
  // ---- vertical loop (B10; spec 7e §7.8, Fable D1) ----
  stackFt: -50, // his stack: 50 ft below Lead (Patrick 14 Oct 2026, spec 7e.7 swept)
  heightBandFt: 200, // within 200 ft of Lead's height settle band (TS-80; a reference, not a wall)
  vertGPerFt: 0.005, // 0.005 G per foot of height error (spec 7e §7.8, crossover 0.68 rad/s; estimate)
  vertGPerFtps: 0.02, // 0.02 G per ft/s of (ḣ_T - ḣ) height-rate error including planned profile rate (spec 7e §7.8, Fable D1; estimate)
  vertMaxG: 1, // vertical loop demand bounded within ±1 G (estimate)
  stackReturnSec: 15, // height blend time returning to stack: 15 s (spec 7e §7.8, Fable D5; estimate)
  // Continuous drop low inside (D24, TS-233; spec 7e §7.8):
  lowFt: 300, // continuous drop-low-inside cap 300 ft below stack (Patrick 14 Oct 2026, TS-233, Fable D24; estimate)
  lowStartKt: 5, // continuous drop-low-inside starts past 5 kt slow inside a turn (Patrick 14 Oct 2026, Fable D24; estimate)
  lowFtPerKt: 20, // continuous drop-low-inside slope: 20 ft/kt past 5 kt slow (100 ft low at 10 kt slow, capped at -300 ft at 20 kt slow, blended over 4.3 s; Fable D24; estimate)
  // High yo-yo (kept until S7 replaces with techniques/yo-yo.js):
  yoyo: Object.freeze({
    slowKt: 10, // speed deficit trigger (kept until S7; estimate)
    powerBackKt: 5, // power-back trigger (kept until S7; estimate)
    excessFtps: 20, // excess arc closure trigger (kept until S7; estimate)
    minFt: 100, // minimum yo-yo climb height (estimate)
    exitArcFt: 150, // exit arc error threshold (estimate)
    onCircleFt: 150, // on-circle offset threshold (estimate)
    downEndFt: 50, // return-to-stack threshold (estimate)
    highFt: 100, // "already high": more than 100 ft above Lead, guard/miss escapes above instead of below (Patrick 14 Oct 2026, TS-233)
    ownerHoldSec: 2, // pitch owner hold time (kept until S7; estimate)
  }),
  // ---- speed & power loop (B11; spec 7e §7.8, TS-233, Fable D8, D21, D23, D25, R4, R10) ----
  powerBandKias: 15, // speed offset Δv_ref bounded within ±15 KIAS of Lead (Patrick 4 Oct 19:12Z, Fable D21)
  speedKvPerSec: 0.3, // proportional speed loop gain Kv = 0.3 /s with no integrator, crossover 0.3 rad/s, PM 89°/82° (Patrick 14 Oct 2026, Fable D21, D23; estimate)
  rollInLeadMinDps: 10, // Lead's seen roll rate threshold to ramp in roll-in power lead ahead of his expected end-bank G drag (spec 7e §7.8, Fable 3b §1; estimate)
  rollInLeadFullDps: 30, // Lead's seen roll rate for full roll-in power lead (spec 7e §7.8; estimate)
  intentBiasKtps: 2, // full-authority speed-rate bias for energy intent (±1) or guard bleed request (spec 7e §7.8, Fable 3b §4; estimate)
  brakes: Object.freeze({
    idleFtps: 40, // closure threshold where bleed intent phases throttle to idle (estimate)
    idleOffFtps: 25, // idle release closure threshold (estimate)
    boardsFtps: 60, // speed brake out threshold: slant closure > 60 ft/s (Patrick 14 Oct 2026, Fable D8; estimate)
    boardsOffFtps: 10, // speed brake retract threshold: slant closure < 10 ft/s (lowered from 20 to 10 ft/s per Fable D25 since S0 measured 21.66 ft/s > 20 ft/s p2p ripple; estimate)
    boardsOnSec: 1, // speed brake out dwell: closing > 60 ft/s must hold for 1 s under effective bleed intent <= -0.5 (Fable D8; estimate)
    boardsHoldSec: 3, // speed brake minimum hold time once deployed: >= 3 s (Fable D8; estimate)
    bleedOnIntent: -0.5, // effective bleed intent threshold <= -0.5 required to deploy speed brake (Fable D8, 3b §5; estimate)
    bleedOffIntent: -0.2, // effective bleed intent threshold > -0.2 that retracts speed brake after its 3 s hold (Fable 3b §5; estimate)
  }),
  // ---- separation guard barrier (B12; separation.js, spec 7e §7.8b, TS-233, Fable D3, D16, R8, R9) ----
  guard: Object.freeze({
    hardFloorFt: 350, // emergency separation floor where guard uses full available authority (spec 7e §7.8b; estimate)
    minFt: 500, // 500 ft bubble boundary where cubic barrier reaches full authority x = 1 (Patrick, TS-208, TS-233)
    taperStartFt: 600, // guard is completely silent at >= 600 ft and tapers cubically x = ((600 - p)/100)^3 down to 500 ft (Patrick 14 Oct 2026, TS-233)
    capOpenStartFt: 550, // G cap opens smoothly from Lead G + 1.5 at 550 ft to stall-warning/available G at 500 ft (spec 7e §7.8b; estimate)
    lookSec: 10, // single forward predictor horizon up to 10 s over the closing part of the pass (spec 7e §7.8b, Fable D4; estimate)
    lookStepSec: 0.25, // predictor integration step 0.25 s (search effort)
    tighter: 1.3, // also checks Lead tightening his turn by 1.3x when inside 550 ft (Fable F1, F13; estimate)
    passLineSec: 1.4, // closure allowance time scale in the tapered barrier (spec 7e §7.8b; estimate)
    wingLineFt: 100, // minimum distance behind Lead's 3/9 line along Lead's path (TS-233, Fable F6; estimate)
    filterSteps: 20, // candidate turn steps searched each way (search effort)
    filterRefine: 6, // binary refinements on the least-change clearing turn (search effort)
    urgencyDecaySec: 2, // guard urgency S36 rises at once and decays over ~2 s (spec 7e §7.8b; estimate)
    sideHoldSec: 3, // guard side choice S41 held for at least 3 s so it never flickers left/right (spec 7e §7.8b, Fable §2; estimate)
  }),
  // ---- technique picker (B04; supervisor.js, spec 7e §7.10, Fable D5, D6) ----
  picker: Object.freeze({
    noRestartSec: 3, // 3 s cooldown after a technique finishes before the same technique can re-fire (spec 7e §7.10, Fable D6; estimate)
    pathBlendSec: 6, // scalar path blend time >= 6 s (3 / ω_c for steering crossover 0.52 rad/s; Fable D5; estimate)
    heightBlendSec: 4.3, // scalar height blend time >= 4.3 s on entry (3 / ω_c for vertical crossover 0.68 rad/s; Fable D5; estimate)
  }),
  // ---- T1: the miss / pass-clear technique (B06; techniques/miss.js, spec 7e §7.9.1, TS-233, Fable D1, D4, D6, 3b §7) ----
  miss: Object.freeze({
    clearSlantFt: 625, // target 3D pass clearance D = 625 ft so horizontal + vertical clears the 500 ft bubble with margin (spec 7e §7.9.1; estimate)
    cuePassFt: 600, // cue triggers when predicted pass p < 600 ft closing (Patrick 14 Oct 2026, TS-233; estimate)
    cueClosureFtps: 5, // minimum closing rate to trigger the miss cue (Fable D6; estimate)
    tPassMinSec: 3, // minimum time-to-pass for the planned vertical profile cue window (Fable D4: 3 s <= t_pass <= 10 s; estimate)
    tPassMaxSec: 10, // maximum time-to-pass for the planned vertical profile cue window (Fable D4; estimate)
    dwellSteps: 2, // cue must hold for 2 consecutive steps (0.1 s) before firing (Fable D6; estimate)
    urgencyStartSec: 8, // urgency u = clip((8 - t_pass) / 5, 0, 1) starts rising below 8 s to pass (Fable 3b §7; estimate)
    urgencySpanSec: 5, // urgency reaches 1.0 at t_pass <= 3 s (Fable 3b §7; estimate)
    minDepthFt: 75, // least vertical miss depth below Lead (spec 7e §7.9.1; estimate)
    maxDepthFt: 300, // deepest planned vertical miss below Lead (spec 7e §7.9.1; estimate)
    maxRateFtps: 60, // maximum planned vertical profile descent/climb rate |ḣ_T| (Fable D1; estimate)
    maxTurnMixRadps: 0.12, // cap on least horizontal turn mix Δω when vertical reach alone is short of 625 ft (Fable D4; estimate)
    replanTighterFt: 50, // re-plans depth once if predicted pass tightens by more than 50 ft (spec 7e §7.9.1; estimate)
    donePassFt: 650, // miss hands back once predicted pass > 650 ft and opening ... (Fable D6; estimate)
    doneDwellSec: 2, // ... held for 2 s after passing bottom (Fable D6; estimate)
    maxRunSec: 15, // longest-run timeout for the miss technique (spec 7e §7.9.1; estimate)
  }),
});

// ---- the rolling rejoin (from rolling-rejoin.js) -------------------------------------------------------------------

/** The rolling rejoin's search and pursuit (moved from rolling-rejoin.js, 12.2b). Estimates unless a page or ruling is named. */
export const ROLLING_REJOIN = Object.freeze({
  turnDeg: Object.freeze([30, 60, 90, 120]), // how far his heading swings the way Lead turns over the roll (estimates)
  pitchDeg: Object.freeze([20, 40, 60]), // the nose's highest and lowest (estimates; 45° is the barrel roll's, SMM 14.8 para 19)
  barrelOffDeg: 45, // the barrel roll's nose circles a point this far off his heading (SMM 14.8 para 19: 45° off)
  pullG: Object.freeze([3, 4]), // the pull: the barrel roll's 3 G entry (SMM Table 14.1, Fig 14.1) and 4 G (the top of SMM Table 7.1's 3-4 G; estimate choice)
  maxRollSec: 60, // a guard: a roll still going after this long is dropped (estimate)
  pathSteps: 800, // the nose path's table (fluid-lead.js nosePath; search effort only)
  fullSearches: 6, // how many of the most promising roll-outs get the turning rejoin's full search after them (search effort only)
  patience: 2, // ...stopping once this many in a row after the best so far bring nothing quicker (search effort only)
  aheadU: 0.08, // he steers toward the point 8% further along the nose path (estimate; named from rolling-rejoin.js flyRoll, 12.2b)
  aimGain: 1.0, // ... at the pursuit gain of core liftTowardAim (estimate)
  noseAccelDps2: LEAD.noseAccelDps2, // his nose rate changes along the path as Lead's does (8°/s², lead-moves.js; was a copy)
  noseEndDps2: LEAD.noseEndDps2, // ... and eases onto the end of it as Lead's (3°/s²; was a copy)
});
