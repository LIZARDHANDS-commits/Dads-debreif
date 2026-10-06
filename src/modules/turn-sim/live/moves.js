// The Formation Sim's per-move numbers (refactor PR 4, numbers register, TS-95): speeds, the rejoins, the kinematic
// lines, the fighting wing turns, the tracker, fluid's #2, the hold to full power, the opening out and the lag roll. One
// of three number files with rates.js and bands.js (tuning.js only re-exports them); docs/modules/turn-sim/numbers.md lists
// every number with its source. Numbers with no manual page or ruling beside them are estimates and say so. Moved
// unchanged from tuning.js, except the retired hot rejoin's (TS-94), which went with it.
import { FW_BAND } from './slots.js';
import { RATE_SETS, G_RULE_BANK_DEG, NO_BANK_CAP_DEG, CLOSE_BANK_DEG, rejoinClosureNow } from './rates.js';
import { IN_POSITION } from './bands.js';
import { KT_TO_FTPS } from '../../../core/units.js';

/**
 * How fast the power answers (Patrick 6 Oct 03:17Z: torque 0 to 100% in about 0.2 s; 03:18Z: the speed brakes are instant;
 * TS-108). torqueSec: the torque's full travel. jerkKtps2: the most the acceleration changes per second, so the full
 * torque's span (about 4.5 kt/s from throttle 0 to MAX at 150 KIAS, 3.7 at 200; slow-down.js) is covered in about 0.2 s;
 * the boards' 1-2.5 kt/s then comes in under 0.1 s, as near instant as a 0.05 s step shows (an estimate from those).
 */
export const POWER = Object.freeze({ torqueSec: 0.2, jerkKtps2: 25 });
const POWER_JERK_KTPS2 = POWER.jerkKtps2;

// ---- speeds (from transitions.js) ---------------------------------------------------------------------------------

/** The pair flies 200 KIAS outside line abreast (SMM 12.23 para 53; Patrick 11:08Z) and 220 in it (SMM 16.18 para 49). */
export const KIAS_OUTSIDE_LAB = 200;
export const KIAS_LAB = 220;

// ---- rejoins (from transitions.js) --------------------------------------------------------------------------------

/** Defaults for rejoins. */
export const REJOIN = Object.freeze({
  overtakeKias: 15, // the middle of EFIG p.374's 10 to 20 KIAS for a turning rejoin
  bankCapDeg: NO_BANK_CAP_DEG, // #2 in a rejoin: no bank cap, only the aircraft's own limits (Patrick 6 Oct 04:07Z: "there is NO LIMIT on bank angle in formation"; the G rule, about 78° level, from V2.59 until V2.116, TS-67; 60°, an estimate, until then)
  leadBankDeg: 30, // Lead's turn in a turning rejoin (SMM 12.24 para 54; AFM7 p.21)
  lineKias: 220, // every rejoin, turning or straight ahead: at least this down the line (or Lead's six) to the decision point, whatever the Rates choice; Rates sets only the close-in rate after it (Patrick 5 Oct 17:54Z: "aim for 220 up the line for both"; 17:55Z: "in all rejoins id like the minimum closure up the line to be 220 knots for expeidiousness, then slow down at the decision point"; TS-75)
  stopStage: /** @type {'boards'} */ ('boards'), // from the decision point the overtake comes off with the torque floor and the boards, planned at CLOSURE.stopShare of what they give, idle only when the room left needs more (the last resort); the decision point is where that stop just fits (Patrick 6 Oct 03:17-03:20Z, TS-108; idle from 5 Oct 17:55Z, TS-75, until V2.119; slow-down.js's stages)
  floorTorquePct: 5, // a rejoin keeps at least 5% torque, the boards as needed; idle is a last resort (Patrick 6 Oct 03:17-03:20Z, TS-108)
  idealBearingDeg: 45, // Lead at 10:30 or 1:30 (SMM 12.24 para 56)
  hotBearingDeg: 60, // hot and cold are drawn but not numbered in SMM Fig 12.16: 60 and 30 are estimates
  coldBearingDeg: 30,
  turnAnglesDeg: [30, 45, 20, 60], // how far Lead turns into #2; estimates (a gentle turn, AFM8 brief p.19). Since V2.59 the 2-ship's Lead holds his turn until #2 is in (Patrick 06:16Z item 3, RULED_REJOIN; hand-over.js leadTurnInto): these are only the 2-ship tracker's fallback, and the 4-ship's (step 3, not yet changed)
});

/**
 * The turning rejoin (V2.59, TS-68; flown as held bank and power since V2.63, TS-69; Patrick 5 Oct 07:14Z, card "Yes, as
 * written" 07:31Z, 07:32Z, 08:12Z-08:20Z): one rule for every turning rejoin, from line abreast (hot: #2 starts ahead of the
 * line and gets colder to reach it) or fighting wing (cold: he turns hotter to reach it). #2 gets onto the rejoin line, Lead
 * at his 10:30 or 1:30 with about half Lead's upper wing showing aft of the fin (Patrick: "where the tail and the wing make an
 * X"), on his own side, inside Lead's turn and slightly low; comes down it at Lead's speed plus the Rates overtake, taking it
 * out with power for the decision point (where the line reaches route's spacing); then he flows into route and on into the
 * slot in one motion (SMM 12.24 paras 56-58, Figs 12.14-12.15; 16.20 paras 65b-66). He goes behind Lead only in an overshoot.
 * The flying is turning-rejoin.js's; review turn-sim-review/rejoin-review-fable.md.
 */
export const TURNING_REJOIN = Object.freeze({
  lineDeg: 45, // the rejoin line, degrees behind Lead's 3/9 line: Lead at 10:30 or 1:30 (SMM 12.24 para 56; Patrick's card 07:31Z). It passes through the fighting wing place (16.20 para 66) and the corner behind echelon (para 58's latest point)
  lineUpFt: -30, // #2's height on the line, below Lead: "just slightly below lead" (SMM 12.24 para 58); 30 ft is an estimate
  aimsFt: [300, 600, 1200], // how sharply #2 captures the line: off it by this much he heads for it at half approachDeg; the one that brings him in soonest is flown (estimates: smaller is a sharper capture, larger a gentler, longer one)
  approachDeg: 80, // far off the line he heads for it at up to this angle across it, in Lead's frame (estimate)
  bankCapDeg: 60, // the bank he uses at most to get onto the line and hold it: past about 60° the drag costs speed and buys nothing (the review's estimate, rejoin-review-fable.md). Only when no rejoin at 60° keeps him behind Lead's 3/9 line does he use more, up to the G rule (REJOIN.bankCapDeg)
  hotFt: 1000, // ahead of the line by this much (hot) he flies his least speed, Lead's 200 KIAS, coming up to lineOverKias above it as he reaches the line (estimate; TS-75)
  laneTolFt: 20, // flowing into the slot he may pass this far ahead of it, never more, toward Lead's 3/9 line (estimate; Patrick 08:04Z)
  decisionArriveRates: 'instructor', // he reaches the decision point closing no faster than this Rates choice's close-in rate (about 15 kt), so AI's quicker close-in starts from a closure under control (estimate; SMM 12.24 para 58)
  fwArriveFtps: 5, // to fighting wing he arrives at its place on the line at about this closure, and the tracker settles him there (estimate)
  hotBanksDeg: [30, 60], // hot (from line abreast) he tries Lead's own 30° and the medium 60° first (the review's estimates, rejoin-review-fable.md follow-up 1)
  lagAimFt: 2400, // and, hot, the gentlest capture too: lagging while Lead's turn brings the aspect round (estimate)
  descentFtps: 30, // a height difference comes off no quicker than this, 1,800 ft/min (estimate)
  captureFt: 150, // he is on the line within this many feet of it; only then does he start taking out the overtake for the decision point (estimate)
  lineTauSec: 4, // his heading comes onto the one the line asks over about this long, so the bank changes smoothly (estimate)
  diveGs: Object.freeze([2, 1]), // line first (Patrick 6 Oct 06:14Z: "a deeper roll, harder pull, steper dive ... get to leads altitude faster"; TS-124): from above, his height comes off over the shortest smooth leg whose push and pull stay within this many g of level flight, the first that costs no more than diveSlackSec (estimates)
  diveSlackSec: 8, // a dive that brings him in no more than this much later than the steady descent is flown (estimate)
  heightSec: 10, // #2 settles slightly low on the line over this long, or over his part to the decision point if shorter (estimate)
  // The vertical as a candidate (Patrick 5 Oct 17:44Z "we can use the vertical too", 19:51Z "if it scores high enough"; TS-82):
  // #2 goes this much higher than he starts early in the rejoin, then comes down onto the line, the climb and descent at no more
  // than descentFtps, its pull charged as G (flight.js) and within the G rule. Flown only when it brings him in sooner (estimates).
  verticalUpFt: Object.freeze([500, 1000]),
  undertakeKias: 25, // only when no rejoin at his least speed keeps him behind Lead's 3/9 line (close in and hot) does he slow, at most this far below Lead's 200 KIAS (rejoinTo's, an estimate; TS-75)
  lineOverKias: 10, // hot, he reaches the line at no more than this over his least speed, Lead's 200 KIAS (to fighting wing, its place's own speed) (Patrick 17:29Z: "when they hit the line it needs to be at 210-200 knots"; TS-75)
  runInReleaseShare: 0.5, // taking out the overtake, he sets it again once the room left needs less than this share of the slowing that started it (estimate; TS-75)
  runInHoldSec: 2, // within this many seconds of the decision point at the close-in rate, he keeps taking it out (estimate; TS-75)
  floorMarginKias: 5, // within this of his least speed, he banks no more than MAX holds the speed at, so he doesn't bleed below it (estimate; TS-75)
  crossFlowFt: 150, // crossing Lead's six to the other side, he flows through the crossing point within this many feet (estimate)
  routeFlowFt: 20, // he flows through route without stopping, within this many feet of it, on into the slot (estimate; Patrick 07:14Z: "in one motion")
  // The X law to a close formation (TS-106; design turn-sim-review/sarj-line/turning-rejoin-design.md; Patrick 6 Oct 03:14Z
  // card "Fixed on canopy"): Lead held at one spot on #2's canopy on the X until his closure is stable, then he moves over.
  // Each is a window, so it is easy to fly to (Patrick 6 Oct 03:34Z: "lets make everything a 'window'").
  windowFarFt: 250, // he moves out to the line and up it to echelon anywhere from this far from Lead... (Patrick 6 Oct 03:32Z card, 03:34Z)
  windowNearFt: 100, // ...down to this far, the decision point (Patrick 02:30Z); not stable by here, he overshoots, only when nothing else works (03:35Z)
  stableKt: Object.freeze([10, 20]), // his closure, range rate in knots, is stable in this window (Patrick 03:34Z: "10-20 knots at 100 feet"); the slowing aims at its middle, and slower is cold, not unstable
  stableShare: 1.5, // ...and closing at no more than this times the closure that middle overtake gives on the X, about 32 kt, so he is holding the X, not sweeping through it (card 03:15Z "Closure or bearing"; the figure is an estimate)
  xWindowDeg: 10, // Lead is on the X picture within this many degrees of it, 35-55° off his tail (card 03:15Z "Closure or bearing"; the figure is an estimate)
  bearingTauSec: 6, // his bearing off Lead's tail comes onto the X over about this long (estimate, the design)
  hardPullsSec: Object.freeze([2, 4, 6]), // hot, he may first pull this long at his most bank with idle and the boards, then hold the X (Patrick 6 Oct 04:02Z: "pull like 5 g and 90 deg bank to the line with the power less than max"; the times are estimates)
  xFromFt: 1200, // a hot start further out flies onto the rejoin line as before, and holds Lead on the X only from this far down it (Patrick 6 Oct 03:58Z: "you can make x inside 750 feet if it helps thats the whole idea")
  lowEnergyFt: 100, // more than this below Lead, and beyond 1,000 ft, the rejoin is at MAX (Patrick 6 Oct 05:29Z: "full power for a while"; the 100 ft is an estimate)
  slowFtps2: 3.5, // the slowing curve down to the window's closure: about power back at 200 KIAS, 8,000 ft (slow-down.js; an estimate)
  insideFloorFt: 500, // inside this range his least speed is his place's own speed inside Lead's turn, about 196-198 KIAS (estimate)
  onXDeg: 5, // he is on the X within this many degrees of it (for the card's speed on the line; estimate)
  overshootBankDeg: 15, // the overshoot: wings near level, no more than this bank... (SMM 12.27 para 65; card 03:33Z rule 5; estimate)
  overshootLevelSec: 3, // ...for this long, then he stabilizes on the outside of Lead's turn (estimate)
});

/**
 * The straight-ahead rejoin, flown the way a pilot flies it (straight-rejoin.js, TS-72; Patrick 5 Oct 08:40Z: "SARJ should
 * start at full power until it gets back on leads six, then set an overtake. The geometry of moving makes it fall back";
 * the review's SARJ, fable-compiled.md section 3). All estimates unless a source is given.
 */
export const STRAIGHT_REJOIN = Object.freeze({
  lineArriveKt: 8, // he joins the line and flows up it closing at about this, slow enough to stop on the slot with power back, never stopping short of it (estimate)
  lineFlowFt: 40, // he flows on up the line once within this many feet of route (on the line, TS-103), never stopping there (estimate)
  cutsDeg: [30, 45, 60], // far off Lead's six line he heads across it at up to this angle to Lead's track; the one that brings him in soonest is flown (estimates: a bigger cut gets across sooner and falls back further)
  aimsFt: [600, 1200, 2400], // how sharply he comes onto the six line: off it by this much he cuts at half the angle (estimates, as TURNING_REJOIN.aimsFt; gentler than the turning rejoin's so he doesn't swing through the six)
  lineTauSec: 2, // his heading comes onto the one the cut asks over about this long (estimate; the turning rejoin's 4 s swings him through the six)
  captureFt: 100, // he is on Lead's six within this many feet of it; until then full power, from then the overtake (estimate)
});

// ---- the kinematic moves: close moves and following Lead (from kinematic-moves.js) ---------------------------------

/** The numbers of the kinematic moves. All estimates unless a source is given. */
export const KINEMATIC = Object.freeze({
  // In the frame of Lead, how fast #2 may move:
  lateralFtps: RATE_SETS.close.frame.lateralFtps, // 140 ft/s across Lead's heading: about a 25° heading difference at 200 KIAS (estimate; SMM 16.18 para 51 gives no angle)
  foreAftFtps: RATE_SETS.close.frame.foreAftFtps, // 25 ft/s along it: about 15 KIAS of overtake or undertake, the middle of EFIG p.374's 10-20 KIAS
  verticalFtps: RATE_SETS.close.frame.verticalFtps, // 15 ft/s up or down: 900 ft/min (the 4-ship's stack-change estimate)
  nearPerSec: RATE_SETS.close.frame.nearPerSec, // closing slows with range: 10% of the range per second ...
  nearMinFtps: RATE_SETS.close.frame.nearMinFtps, // 8 ft/s ... but never below about 5 kt, the station-change rate (SMM 12.20 para 44 says "controlled")
  // Patrick 05:12Z: echelon to route about 5 s; since step 2 the fore-aft rate is the Rates choice's closure (closeRates below).
  closeBlendSec: 3, // a close formation wingman follows a roll of Lead this long after it (SMM 12.19 para 43: he lags Lead's roll)
  planeLagSec: 3, // a close wingman's place in Lead's wing plane follows Lead's bank over this long (SMM 12.19 para 43: he lags the roll; estimate)
  wideBlendSec: 8, // a fighting wing wingman takes this long
  followLateralG: 0.2, // ... and swings its track at no more than this much sideways G (estimate)
  followAccelKtps: 2.5, // ... or longer, so a wingman following a roll of Lead speeds up or slows at no more than this (estimate; inside the 3 kt/s the smoothness tests allow)
  startBlendSec: 3, // a station change starts moving over this long
});

/**
 * The rates a kinematic line may move at in the frame of the aircraft flown off (kinematic.js relSpeedLimit): KINEMATIC's,
 * with the fore-aft rate (overtake or undertake) a closure: a rejoin's by default (the hot turning rejoin's lines), or the
 * one given (Patrick 05:46Z, 06:09Z).
 */
export function closeRates(foreAftFtps = rejoinClosureNow().ftps) {
  return {
    lateralFtps: KINEMATIC.lateralFtps,
    foreAftFtps,
    verticalFtps: KINEMATIC.verticalFtps,
    nearPerSec: KINEMATIC.nearPerSec,
    nearMinFtps: KINEMATIC.nearMinFtps,
  };
}

/**
 * Patrick's 06:16Z rulings on the rejoin's estimates (5 Oct 06:16Z), flown since V2.59 (TS-67) in the numbers above
 * (REJOIN.bankCapDeg) and hand-over.js leadTurnInto; the hot rejoin's numbers for items 2, 4 and 5 went with it (TS-94):
 *  1. "Unlimitd bank. they can roll and dive if they want/need to and it ameks sense": no bank cap on #2 in a rejoin
 *     (REJOIN.bankCapDeg); bank follows the G the move needs, inside the G rule, past 90° where the
 *     path needs it.
 *  2. "Unlimited": the reversal may take any bank the G rule allows (the hot rejoin's reversal, retired with it, TS-94).
 *  3. "until 2 is on": Lead holds his 30° turn until #2 is IN POSITION, then rolls out (replaces REJOIN.turnAnglesDeg).
 *  4. "unlimited as it can be controlled?": no fixed descent rate; any smooth descent
 *     inside the G rule, still off Lead's height before 2,000 ft (SMM 12.27 para 65).
 *  5. "Decision point would be when the AI would usually tansition to a rate so clser to 200 feet": RULED_REJOIN.overshootRangeFt,
 *     about 200 ft.
 */
export const RULED_REJOIN = Object.freeze({ bankCapDeg: null, reverseBanksDeg: null, leadTurnsUntilIn: true, descentFtps: null, overshootRangeFt: 200 });

// ---- fighting wing turns (from formation-turns.js) -----------------------------------------------------------------

/** The numbers of the fighting wing turns. Estimates unless a source is given. */
export const FW_TURN = Object.freeze({
  gentleBankDeg: 30, // AFM7 brief p.14 item 5a's gentle check turn: no longer flown since step 3 (every turn at WING_BANKS.fwTurnBankDeg, Patrick 06:16Z)
  turnBankDeg: 45, // item 5b's moderate turn: no longer flown since step 3 (WING_BANKS.fwTurnBankDeg)
  collapseFromDeg: 32, // #2 starts collapsing once Lead's bank passes this ...
  collapseFullDeg: 42, // ... and goes all the way to Lead's six by this
  // ... but only in turns of this size or more: the check turn (20°) keeps #2's side and sweep (AFM7 brief p.14 item 5a).
  // Patrick 5 Oct 06:44Z agreed "the fighting wing collapse tied to turn size, not bank" once every turn flew at 60°;
  // 45° is the thread's pick (an estimate).
  collapseMinTurnDeg: 45,
  band: { minFt: FW_BAND.rangeFt[0], maxFt: FW_BAND.rangeFt[1], minSweepDeg: FW_BAND.sweepDeg[0], maxSweepDeg: FW_BAND.sweepDeg[1] }, // SMM 12.29 para 69, Fig 12.19 (500-1,000 ft, 30-60°: slots.js FW_BAND, the one copy)
  aimInsideFt: 50, // when #2 has to move back into the band, it aims this far inside its edge in range ...
  aimInsideDeg: 5, // ... and in sweep, so it ends clearly in it (the shared ±100 ft and ±5° margins would also pass the edge)
  turnDeg: { check: 20, delayed45: 45, delayed90: 90, inPlace90: 90, hook: 180 }, // each turn button's turn, in fighting wing
});

/**
 * The tracker's settings for a wingman following its goal in a fighting wing turn (estimates; the bank cap is flagged on
 * screen, never a wall). What each does to the flying (tracker.js; Patrick 05:27Z asked for the gains in plain words):
 */
export const FW_FOLLOW = Object.freeze({
  coneAlt: true, // his height is his own anywhere in the cone, and on the power profile he manages energy with it (FW_ENERGY, tracker.js)
  goalTolFt: 3, // the moving goal counts as reached once the target slot is within 3 ft of it (estimate)
  fwdRate: 40, // how fast the target slot slides fore and aft toward the goal, ft/s (estimate)
  latRate: 60, // how fast the target slot slides sideways toward the goal, ft/s (estimate)
  vrel0: 30, // the closing speed on the target slot when near it, ft/s (estimate)
  kcap: 0.05, // how much more closing speed per foot of range beyond d0, ft/s per ft (estimate)
  d0: 100, // the range beyond which the closing speed may grow, ft (estimate)
  vrelMax: 120, // the most closing speed on the target slot, ft/s (estimate)
  decel: 2, // the closure is never more than #2 could stop at this deceleration, ft/s² (estimate)
  bankCapDeg: G_RULE_BANK_DEG, // no cap but the G rule (Patrick 06:16Z item 11; 60°, an estimate, until step 2), flagged, never a wall
  overtakeKias: 15, // power only a little: geometry does the rest (Patrick 19:12Z); the most speed above Lead, KIAS
  undertakeKias: 15, // the most speed below Lead, KIAS (estimate)
  advanceTol: 25, // within this many feet of the goal a leg counts as flown (estimate)
  finalTol: 6, // within this many feet of the last goal, and slow against it, #2 is settled (estimate)
});

/**
 * The pursuit curves #2 flies in a fighting wing turn (fw-pursuit.js, TS-100; SMM 12.29 para 69, 12.30 paras 71-73,
 * Figs 12.20-12.23). Every number is an estimate unless a page is named beside it.
 */
export const FW_PURSUIT = Object.freeze({
  minBankDeg: 5, // Lead banked less than this is not turning: the tracker's band goal flies #2 instead (estimate)
  aimRangeFt: 750, // the range aimed for on the circle: the middle of the cone's 500-1,000 ft (SMM 12.29 para 69, Fig 12.19)
  arcScaleFt: 250, // the arc ahead of or behind the aim point that asks for the full angle off the tangent: the cone's edges, 250 ft either side of the aim (estimate)
  leadMaxDeg: 30, // the most #2's nose points inside the circle when behind the aim point (lead) or outside it when ahead (lag), degrees (estimate)
  lagMaxDeg: 20, // the most his nose points outside the circle when ahead of the aim point and inside it (turned into, tight: the miss, Fig 12.22), degrees (estimate)
  circleScaleFt: 500, // how far outside or inside Lead's circle asks for the full extra lead or lag, ft (estimate)
  circleDeg: 20, // that extra lead (outside the circle) or lag (inside it), degrees (estimate)
  closeKias: 10, // the most speed above or below Lead the arc error asks for; power last, geometry first (Patrick 5 Oct 23:02Z; estimate)
});

/**
 * The fighting wing turn exit (formation-turns.js fwExitSide; SMM 12.30, Fig 12.23): when Lead rolls out, #2 picks the side
 * of the cone he flows to from the range he will have a few seconds on. Past the cone (stretched or opening): the inside
 * of the turn, the shortest path. Inside it (tight or closing hard): the outside, the longer path. In between: the side his
 * nose is already carrying him to, so he rolls out with Lead with no reversal ("pick the side you want and regain position").
 */
export const FW_EXIT = Object.freeze({
  lookAheadSec: 5, // the range is judged this far ahead at the present opening or closing (estimate)
  alignBankDeg: 10, // once in the cone, he eases his heading onto the one flown off's with no more than this bank, not the tracker's 30°, so a few degrees left over come off over a few seconds instead of a 30° flick that the wingmen behind copy (estimate)
});

/**
 * The fighting wing side switch (fw-switch.js, TS-102; Patrick 6 Oct 2026 01:04Z: "the station change from side to side in
 * fighting wing should be at least 60 deg bank. it's a fast switch over that can be used to bleed energy. right now its
 * very slow"). An S-turn behind Lead: into the tail line at the switch bank, then the other way until he is parallel to
 * Lead again on the other side of the cone, holding his spacing with geometry first, then power (Patrick 01:24Z: "this is
 * fundamental for any formation movement"). Estimates unless a source is named.
 */
export const FW_SWITCH = Object.freeze({
  bankDeg: 60, // the bank he switches at, both ways: at least 60° (Patrick 6 Oct 01:04Z)
  holdKias: 25, // the most speed above or below Lead he uses to hold his spacing through the switch: geometry first, then power (Patrick 6 Oct 01:24Z; the figure is an estimate)
  holdScaleFt: 150, // the range opened or closed from the press that asks for all of holdKias, ft (estimate)
  aimSweepDeg: 35, // the S-turn aims 35° off Lead's tail line in the far cone: inside the band's 30° edge (SMM 12.29 para 69, Fig 12.19) with the least turn in, since every degree of turn in drops him back (estimate)
  rollOutDeg: 3, // the switch is over once his heading is back within this many degrees of Lead's: the band goal settles him in the far cone from there (estimate)
  reverseSec: 1.2, // about how long the roll from the switch bank one way to the other takes, allowed for when picking the reversal point (estimate from the T-6A roll ceiling, t6-performance.js)
  turnInMaxDeg: 40, // the most he turns in, off Lead's heading: the across he gains per foot dropped back falls off past this (drop-back is across × tan(half the angle)), and the band goal closes the rest (estimate)
  minBehindFt: 300, // the S-turn is flown only while he is at least this far behind Lead: nearer, he drops straight back first, never crossing close behind Lead (estimate; SMM 12.29 para 69 keeps fighting wing 500-1,000 ft back)
});

/**
 * Fighting wing energy with the cone (TS-96; Patrick 5 Oct 22:45Z: "energy can be managed with the cone", 23:02Z: "Use the
 * cone as required, power as a last resort"): on the power profile in fighting wing (tracker.js), #2 takes a slowing first
 * as a climb and a speeding up as a descent, inside the cone's height, so the throttle moves only for what the height can't
 * give. The horizontal path and the speeds are the tracker's own; only the height and the power change (standard energy:
 * a climb at v ft/s costs g·v / TAS of speed). Estimates, inside IN_POSITION's ±200 ft (Patrick 21:26Z).
 */
export const FW_ENERGY = Object.freeze({
  coneUpFt: IN_POSITION.fwStackFt - 50, // he uses the cone's height up to this far above or below Lead, 50 ft inside the in-position band (estimate)
  climbFtps: TURNING_REJOIN.descentFtps, // no quicker than the rejoin's height changes, 1,800 ft/min (estimate)
  pullFtps2: 8, // the climb rate changes no quicker than this, about a quarter G, charged as G (estimate)
});

// ---- the tracker, the fallback for odd starts (from transitions.js; Patrick 05:27Z) --------------------------------

/**
 * The tracker's own numbers (tracker.js): a small control loop that chases a moving target slot in the frame of the
 * aircraft flown off, flown once at the press and replayed. It stays as the fallback for starts no kinematic-line rule
 * covers (Patrick 5 Oct 05:27Z: "Tracker for fallback, and refractor the tracker"). All estimates: they shape how
 * smoothly the wingman flies, not where the formations are. `phase` is what every leg starts from; the leg recipes in
 * transitions.js change some of them.
 */
export const TRACKER = Object.freeze({
  /** Control gains. All estimates: they shape how smoothly #2 flies, not where the formations are. */
  gain: Object.freeze({
    position: 0.3, // 1/s: position error to relative velocity
    heading: 1.5, // 1/s: heading error to turn rate
    refRate: 0.5, // 1/s: how fast the moving reference closes on its target
    speedLoop: 0.8, // 1/s: speed error to acceleration
    jerkKtps2: POWER_JERK_KTPS2, // kt/s²: the acceleration follows the torque, 0 to 100% in about 0.2 s (Patrick 6 Oct 03:17Z, TS-108; 1.0 until V2.119)
    ffFilter: 0.2, // how much of the commanded heading's own turn rate is fed forward each step (a smoothing share; estimate)
  }),
  refAccelShare: 0.25, // the target slot builds up to its slide rate over 4 s (a quarter of the rate per second; estimate)
  snapFt: 0.05, // the target slot snaps onto its place within this many feet (estimate)
  goalTolFt: 2, // a moving goal counts as reached within this many feet, unless the leg says otherwise (estimate)
  settleMinFtps: 1.2, // settled: no faster against the last slot than this, ft/s ...
  settleShare: 0.3, // ... or this share of the leg's final tolerance per second, whichever is more (estimates)
  alignBankDeg: 30, // once settled, #2 turns to Lead's heading with no more than this bank (estimate)
  minSpeedFtps: 1, // a commanded velocity under this gives no heading: #2 takes Lead's (estimate)
  kiasSnap: 0.003, // the last few thousandths of a knot are taken out at once, so the speed has no step
  alignHeadingRad: 1.5e-4, // aligned: within this of Lead's heading (about 0.01°)
  alignDeadbandDeg: 0.05, // a closure phase lining up commands no bank under this (step 2): at 1.5/s of heading gain it is a heading error of about 0.003°, inside alignHeadingRad
  laneRangeFt: 1000, // the overshoot lane is measured inside this range (SMM 12.27 para 65; design section 10)
  belowRangeFt: 2000, // the height under Lead is measured inside this range (SMM 12.27 para 65)
  /** Every leg's settings before its recipe changes them, and what each does to the flying. */
  phase: Object.freeze({
    latRate: 8, // how fast the target slot slides sideways, ft/s: station changes close or open at about 5 kt, an estimate (the SMM says only "controlled", 12.20 para 44)
    fwdRate: 8, // how fast the target slot slides fore and aft, ft/s (the same estimate)
    vrel0: 10, // ft/s the closing speed is held to near the slot
    kcap: 0, // ft/s more per foot of range beyond d0
    d0: 100, // the range beyond which the closing speed may grow, ft (estimate)
    vrelMax: 60, // the most closing speed on the slot, ft/s (estimate)
    decel: 1.2, // ft/s²: about half what slowing with the power back gives (about 1.5-2 kt/s, slow-down.js), so the speed loop can stop the closure in time (estimate)
    bankCapDeg: CLOSE_BANK_DEG, // the most bank the wingman uses in a close move: 60° (Patrick 06:43Z; 30° from 06:16Z item 12, 25°, an estimate, until step 3); flagged, never a wall
    overtakeKias: 8, // the most speed above the aircraft flown off, KIAS (estimate)
    undertakeKias: 12, // the most speed below it, KIAS (estimate)
    advanceTol: 3, // within this many feet of a leg's slot the next leg starts (estimate)
    finalTol: 1.5, // within this many feet of the last slot, and slow against it, the wingman is settled (estimate)
  }),
  /** The wingman's height changes (tracker.js heightProfile). */
  height: Object.freeze({
    minChangeFt: 0.5, // a smaller change is left out
    minSec: 4, // no height change takes less than 4 s (estimate)
    maxRateFtps: TURNING_REJOIN.descentFtps, // nor at more than the rejoin's height-change rate on average, 1,800 ft/min (estimate)
    unknownLegSec: 6, // a leg whose end was never learned is given 6 s (estimate)
  }),
});

// ---- fluid manoeuvring: #2's timings and numbers (from fluid-wing.js) ----------------------------------------------

/** #2's numbers. Sources beside each; "estimate" where none. */
export const WING = Object.freeze({
  pursuitShare: 0.1, // the lag or lead offset as a share of the range (estimate)
  latDeg: 15, // off Lead's tail, inside the 30° half cone (estimate; cone: Patrick 19:20Z row 2)
  collapseSec: 6, // how long the collapse toward the six takes (estimate)
  rangeSec: 6, // how long a new distance setting takes to fly (estimate)
  // Entry and terminate: from the fighting wing slot into the cone and back. Since V2.59 the time is what the close-in
  // rate gives over that distance (fluid.js blendSecs; Patrick 5 Oct 04:59Z: "move quickly into fluid maneouvering or into
  // and out of fighting wing"); these two are the fallback when no time is given.
  blendInSec: 10, // entry (estimate)
  blendOutSec: 12, // terminate (estimate)
  blendMinSec: 3, // no blend quicker than 3 s, however quick the rate (estimate)
  smoothSteps: 10, // the position line is smoothed over 10 steps (0.5 s) either side (estimate)
  maxBehindSec: 10, // the furthest back along Lead's path #2 can be
  turnSec: 8, // the lag or lead offset is what the cue wanted over the last 8 s, averaged (estimate)
  tailSec: 6, // the turn onto the place off Lead's current tail is averaged over the last 6 s (estimate; 3 s in V2.18)
  headingSec: 3, // the fighting wing slot, while blending, turns with Lead's heading averaged over the last 3 s (estimate)
  swapMinSec: 5, // the side swap takes no less than 5 s ... (estimate)
  swapMaxSec: 12, // ... and no more than 12 s (estimate)
  swapAccelDps2: 2, // how quickly a wingman can stop a drift across the cone, 2°/s² (estimate)
  swapMarginDeg: 2, // the stop must be at least 2° past the tail line before he swaps, so he doesn't flick on a line (estimate)
  swapGuardSec: 4, // no new swap for 4 s after one ends (estimate)
  // Opening the range in the wingovers' and barrel roll's pulls (Patrick card 5 Oct 01:01Z, "Open his path"; SMM 16.17
  // para 44's 5 G as an aim, not a wall; TS-60 amendment): on Lead's path at a long distance #2 has to speed up at the
  // bottom of each pull to keep the distance, which takes him past 5 G. Instead he flies no faster along Lead's path than
  // keeps him near openGAim, letting the distance open, then closes back to the setting.
  openGAim: 4.5, // the G he aims to stay under while the range opens: 0.5 G inside the 5 G aim for the turn's own share (estimate)
  openFadeSec: 2, // the opening is allowed only in those manoeuvres, faded in and out over 2 s (estimate)
  closeShare: 0.08, // closing back he flies at most 8% faster along Lead's path than Lead did there (about 15-20 KIAS; estimate) ...
  closeSec: 4, // ... and the last of it dies away over about 4 s (estimate)
  openSoft: 0.005, // how softly the opening hands over to the closing (the smooth maximum's width; estimate)
});

// ---- held to full power (from full-power.js) -----------------------------------------------------------------------

/**
 * The numbers of the hold. Estimates unless said.
 *  stretchMinFt, stretchShare: #2 is STRETCHED while he is more than this far behind where the planned line wanted him
 *    (10 ft, or 5% of his range from the aircraft he flies off if more), so a close wingman shows it at a few feet and a
 *    fighting wing one at a few tens.
 *  overtakeKias: closing back up he keeps at most this overtake, the middle of EFIG p.374's 10-20 KIAS.
 *  closeDecelFtps2: and plans to take it off at about this (about 0.6 kt/s, power back: well inside slow-down.js's
 *    power stage), so he arrives without overshooting.
 *  gain, jerkFtps3: how quickly he follows the speed he wants (1/s) and changes his acceleration (POWER.jerkKtps2, the
 *    torque's 0.2 s; about 1 kt/s² until V2.119).
 *  margin: a planned line within full power x (1 + share) + ktps (the read-back of a planned line's speeds) is within it.
 *  extraSec: the longest he may take to close up after the planned line ends (a guard only).
 */
export const HOLD = Object.freeze({
  stretchMinFt: 10,
  stretchShare: 0.05,
  overtakeKias: 15,
  closeDecelFtps2: 1,
  gain: 0.6,
  jerkFtps3: POWER_JERK_KTPS2 * KT_TO_FTPS,
  margin: Object.freeze({ share: 0.05, ktps: 0.05 }),
  extraSec: 120,
  // Cutting inside when behind in fluid manoeuvring (V2.59, Patrick card 5 Oct 04:53Z "Geometry: cut inside"):
  cutShare: 0.25, // the most offset inside Lead's turn, as a share of the range: about sin 15°, the lag line's angle, so he goes toward pure pursuit and stays inside the 30° cone (estimate)
  cutSec: 4, // how long moving into or out of the offset takes (estimate)
  cutMinCurvPerFt: 1 / 20000, // a line straighter than a 20,000 ft radius has no inside to cut (estimate)
  // #2 in fluid manoeuvring by energy and geometry (TS-74, V2.69; full-power.js flyFluidStep). cutShare, cutSec and
  // cutMinCurvPerFt above are his lag and lead offset too, either side of the line.
  lookSec: 2, // he sets his lag or lead for the gap he will have in about 2 s at the closure he has (estimate)
  bubbleMarginFt: 50, // with Lead at MAX, #2 takes power off only within about 50 ft of the 500 ft bubble (estimate)
  offsetAccFtps2: 10, // and moves with at most about 0.3 G of its own, so the lag or lead adds little to the G he pulls (estimate)
  aimSec: 1, // and the offset's aim is eased over about 1 s, so a new turn or a reversal never jerks his G (estimate)
  powerSec: POWER.torqueSec, // the torque's full travel, 0 to 100%, takes about 0.2 s; the boards are instant (Patrick 6 Oct 03:17Z, 03:18Z, TS-108; 2 s, an estimate, until V2.119)
  floorKias: 70, // his speed is never shown below 70 KIAS, a guard only: the planned line keeps him well above it (estimate)
});

/**
 * The opening out to line abreast (line-moves.js; Patrick 5 Oct 20:39Z: "rejoins and transitions between tactical
 * formations should be assertive and smooth and quick"; card 20:41Z "Me, this PR"; TS-78). SMM 16.18 para 51 says only that
 * #2 "manoeuvres into position while lead flies straight and level", so the numbers are estimates. Until V2.78 the line
 * opened out at KINEMATIC.lateralFtps (140 ft/s), slowed in proportion to the range left from 1,400 ft out, and handed over
 * 500 ft from the slot to the tracker at the close-in rate: 81 s from fighting wing, 109 s from echelon.
 *  - reserveKtps: #2 opens out at the speed where full power still gives this much acceleration (slow-down.js
 *    fullPowerKtps, standard aerodynamics): about 242 KIAS at 8,000 ft. His heading off Lead's follows from that speed and
 *    Lead's 220 KIAS, about 25°: the turn away is what the speed allows, not a fixed angle;
 *  - nearPerSec, nearMinFtps: the line slows only over the last few hundred feet (the band is ±100 ft);
 *  - handOverFt: the tracker takes the last part at a rejoin's closure, not the close-in rate.
 */
/**
 * The 4-ship's opening out (four-open.js: fighting wing or finger to Spread 4, the Fluid 4 split, the offset box spread):
 * each wingman turns away and back at this bank at most. Patrick 6 Oct 01:44Z: "nah keep it sporty at 60 deg" (it was the
 * G rule alone, about 78° and 5 G at the press: 5 Oct 06:16Z item 12, TS-66 (4)).
 */
export const FOUR_OPEN = Object.freeze({
  bankDeg: 60, // the opening-out bank, held (Patrick 6 Oct 01:44Z)
  offHeadingsDeg: Object.freeze([20, 25, 30, 35, 40, 45]), // how far off Lead's heading each holds on the way out to Spread 4; the one that settles soonest is flown (estimates; open-out.js's search)
});

export const OPEN_OUT = Object.freeze({
  reserveKtps: 0.4, // #2 opens out up to the speed where full power still has this much in hand (estimate)
  gainKtPerSqrtFt: 0.45, // KIAS gained per square root of the range from Lead on the way out: full power plus the dive, about 1 KIAS per second from 200 (estimate fitted to the core T-6 curve, kept under it so the line stays inside full power)
  leadHolds: true, // Lead holds his speed until #2 is out, then speeds up to line abreast speed (estimate needing Patrick's yes; false: he speeds up at once)
  // No slowing with range from Lead: leaving his side is not an arrival (the near term of kinematic.js relSpeedLimit throttled
  // the first 1,000 ft from echelon to about 25 ft/s); the arrival at the slot is the time law's own slowing to endFtps.
  nearPerSec: RATE_SETS.tactical.frame.nearPerSec, // 10
  nearMinFtps: RATE_SETS.tactical.frame.nearMinFtps, // 20 ft/s
  foreAftFtps: RATE_SETS.tactical.frame.foreAftFtps, // 80 ft/s: falling back in Lead's frame on the way out is geometry (the angle off), not a closure: up to about 47 kt (estimate)
  // How hard the line may accelerate and turn in Lead's frame (hand-over.js RUN_IN's overrides). Patrick 21:11Z: the
  // near-Lead throttle is only for holding close formation; "as soon as a tactical formation is selected, unrestricted
  // attitude changes and power". Full power along, a 45° banked turn's lateral acceleration (1 g across; estimate), a
  // 0.3 g push or pull for the dive and the climb back (estimate).
  law: RATE_SETS.tactical.law,
  handOverFt: 150, // the tracker takes over this close to the slot (estimate)
  // A full power dive to start (Patrick 21:06Z: "LAB from echelon would be expedited by a full power dive to start"): #2
  // drops this far below Lead on the way out, trading height for speed, and climbs back to Lead's height by the slot, which
  // bleeds the extra speed off again (energy height, standard aerodynamics; full-power.js). Both numbers are estimates.
  diveFt: 400,
  verticalFtps: RATE_SETS.tactical.frame.verticalFtps, // 40 ft/s down or up on the way out: about 2,400 ft/min (estimate)
});

// ---- the lag roll to fighting wing (lag-roll.js; spec section 10.8, TS-71) ------------------------------------------

/**
 * #2's lag roll from fighting wing to the cone on Lead's other side (Patrick 5 Oct 08:54Z: "the airplane flips up and rolls
 * canopy to canopy to lead then lands in the cone on the other side, power pitch and bank as required"). The SMM and EFIG
 * do not name the lag roll; the nearest pages are SMM 12.29 para 69 (the cone, using the vertical), SMM 12.30-12.31
 * para 74 (lag pursuit) and SMM 14.8 paras 18-19, Fig 14.1, Table 14.1 (the barrel roll). Every number here is an
 * estimate unless a page or ruling is named beside it.
 */
export const LAG_ROLL = Object.freeze({
  pullG: Object.freeze([3, 2.5]), // the searched pull: the barrel roll's 3 G entry (SMM Table 14.1; Fig 14.1) and a softer 2.5 (estimate)
  noseUpDeg: Object.freeze([45, 30]), // the searched nose-up: 30-45° (estimate; 45 is the barrel roll's, SMM 14.8 para 19)
  noseUpSlopDeg: 6, // how near the planned path's steepest climb must come to the searched nose-up (estimate)
  topKias: 165, // the speed aimed for over the top, about 160-170 KIAS (estimate)
  topKiasBand: Object.freeze([150, 185]), // a plan whose slowest speed is outside this is not used (estimate)
  topRangeFt: Object.freeze([900, 1400]), // range from Lead passing over his six, about 1,000-1,300 ft (estimate, widened 100 ft each way)
  closeTopRangeFt: Object.freeze([500, 1400]), // from echelon (TS-78): over Lead's six at 500-1,400 ft, the bubble's edge to the same far end (estimate)
  bubbleFt: 500, // a plan that comes inside 500 ft of Lead is refused (SMM 16.23, the fluid bubble; FW_BAND's inner edge, SMM 12.29 para 69)
  minG: 0.3, // canopy to canopy means positive G throughout: no plan pushes (estimate)
  rollSec: Object.freeze([8, 30]), // the roll's length searched, in whole seconds (estimate)
  climbFt: Object.freeze([200, 2000]), // how far above the straight line from start to end he goes, searched in 100 ft steps (estimate)
  fallBackFt: Object.freeze([0, 1000]), // how far behind the slot the roll ends, searched in 100 ft steps (estimate)
  searchStepSec: 0.25, // the search's coarse time step (the flown path is planned at the sim's own step)
  coneRangeFt: Object.freeze([400, 1250]), // where the roll may end: the sim's fighting wing region (judge.js classifier, 400-1,300 ft), kept 50 ft inside its far edge (estimate)
  coneSweepDeg: Object.freeze([20, 70]), // the same region's sweep (judge.js classifier; estimate)
  closeOvertakeKias: 20, // closing back up to the slot after the roll: the top of EFIG p.374's 10-20 KIAS overtake (estimate choice)
  rollingAboveDps: 10, // above this roll rate the rolling G limit (core availableG, rolling) is the one checked (estimate)
  rollMissG: 0.3, // #2's wings roll no faster than the T-6A (TS-85): a path asking more is used only while the lift they don't yet point stays under this (estimate)
});
