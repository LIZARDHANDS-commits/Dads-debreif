// The Formation Sim's tuning table (clean-up step 1, TS-64; Patrick's yes pending, architecture.md item 5): every closure
// rate, bank, timing and speed the planners use, in one file, each with its source beside it, so "quicker" or "slower" is
// a change in one place. Moved here unchanged from the files that use them (named beside each table); those files import
// them from here. Numbers with no manual page or ruling beside them are estimates and say so.
//
// This file imports only slots.js (which imports nothing), so any file can read it without an import loop.
import { LENGTH_FT, FW_BAND } from './slots.js';

// ---- speeds (from transitions.js) ---------------------------------------------------------------------------------

/** The pair flies 200 KIAS outside line abreast (SMM 12.23 para 53; Patrick 11:08Z) and 220 in it (SMM 16.18 para 49). */
export const KIAS_OUTSIDE_LAB = 200;
export const KIAS_LAB = 220;

// ---- rejoins (from transitions.js) --------------------------------------------------------------------------------

/** Defaults for rejoins. */
export const REJOIN = Object.freeze({
  overtakeKias: 15, // the middle of EFIG p.374's 10 to 20 KIAS for a turning rejoin
  bankCapDeg: 60, // #2's bank cap in a rejoin: an estimate (the break's own bank), flagged and never a wall
  leadBankDeg: 30, // Lead's turn in a turning rejoin (SMM 12.24 para 54; AFM7 p.21)
  idealBearingDeg: 45, // Lead at 10:30 or 1:30 (SMM 12.24 para 56)
  hotBearingDeg: 60, // hot and cold are drawn but not numbered in SMM Fig 12.16: 60 and 30 are estimates
  coldBearingDeg: 30,
  turnAnglesDeg: [30, 45, 20, 60], // how far Lead turns into #2 once it has closed; estimates (a gentle turn, AFM8 brief p.19); the planner takes the first that keeps the overshoot lane
  turnAtRangeFt: [2000, 1500, 2500], // Lead turns when #2 has closed to this range; estimates
});

// ---- the kinematic moves: close moves, the hot turning rejoin, following Lead (from kinematic-moves.js) ---------------

/** The numbers of the kinematic moves. All estimates unless a source is given. */
export const KINEMATIC = Object.freeze({
  // In the frame of Lead, how fast #2 may move:
  lateralFtps: 140, // across Lead's heading: about a 25° heading difference at 200 KIAS (inside the 20-40° turn away of SMM 16.18 para 51)
  foreAftFtps: 25, // along it: about 15 KIAS of overtake or undertake, the middle of EFIG p.374's 10-20 KIAS
  verticalFtps: 15, // up or down: 900 ft/min (the 4-ship's stack-change estimate)
  nearPerSec: 0.1, // closing slows with range: 10% of the range per second ...
  nearMinFtps: 8, // ... but never below about 5 kt, the station-change rate (SMM 12.20 para 44 says "controlled")
  // Patrick 05:12Z: echelon to route about 5 s; built in step 2 (the 'brisk' rates, closeRates below).
  // The hot turning rejoin:
  pointBankDeg: REJOIN.bankCapDeg, // #2's "aggressive" turn to point at Lead: the 60° bank cap (an estimate, flagged, never a wall)
  reverseBanksDeg: [35, 40, 45, 50, 55, 60], // the reversal's banks the planner may choose from
  hotWingKias: KIAS_OUTSIDE_LAB, // #2 slows with Lead to 200 KIAS in the hot rejoin: Lead turning into him gives the closure (estimate; the overtake comes in the capture, up to foreAftFtps)
  captureSec: 20, // the capture onto fighting wing, once the reversal has lined #2 up (how long the blend takes)
  captureEaseSec: 3, // how long #2 takes to ease the reversal's bank to Lead's turn as it lines up
  closeBlendSec: 3, // a close formation wingman follows a roll of Lead this long after it (SMM 12.19 para 43: he lags Lead's roll)
  planeLagSec: 3, // a close wingman's place in Lead's wing plane follows Lead's bank over this long (SMM 12.19 para 43: he lags the roll; estimate)
  wideBlendSec: 8, // a fighting wing wingman takes this long
  followLateralG: 0.2, // ... and swings its track at no more than this much sideways G (estimate)
  followAccelKtps: 2.5, // ... or longer, so a wingman following a roll of Lead speeds up or slows at no more than this (estimate; inside the 3 kt/s the smoothness tests allow)
  startBlendSec: 3, // a station change starts moving over this long
});

/**
 * The close-move rates' choice (Patrick 05:13Z, for step 2: a "rates" toggle in the advanced options; 'brisk' is echelon to
 * route in about 5 s with every other close-move rate scaled by the same factor, capped by power, G and roll). Until step 2
 * 'training' (today's values, KINEMATIC's) is the only choice, so nothing changes.
 */
const RATES = Object.freeze({
  training: Object.freeze({
    lateralFtps: KINEMATIC.lateralFtps,
    foreAftFtps: KINEMATIC.foreAftFtps,
    verticalFtps: KINEMATIC.verticalFtps,
    nearPerSec: KINEMATIC.nearPerSec,
    nearMinFtps: KINEMATIC.nearMinFtps,
  }),
});
export const RATE_CHOICES = Object.freeze(Object.keys(RATES));
let ratesChoice = 'training';

/** Sets the close-move rates' choice (one of RATE_CHOICES; anything else keeps 'training'). */
export function setRates(choice) {
  ratesChoice = RATES[choice] ? choice : 'training';
}

/** The close-move rates' choice now. */
export function ratesNow() {
  return ratesChoice;
}

/** The close-move rates the planners read: { lateralFtps, foreAftFtps, verticalFtps, nearPerSec, nearMinFtps } for the choice now. */
export function closeRates() {
  return RATES[ratesChoice];
}

// ---- the off-standard hot rejoins and the overshoot (from hot-rejoin.js) -------------------------------------------

/** Where #2 may line up after the reversal: at least 300 ft behind Lead's 3/9 line, 400 to 2,000 ft from him (estimates). */
export const LINE_UP = Object.freeze({ behindFt: 300, minRangeFt: 400, maxRangeFt: 2000 });
/**
 * At the normal reference #2 lines up wherever the standard rejoin's choices put him, even a little ahead or close in (the
 * error carries, TS-62); an overshoot then takes over if he can't stop. Estimates.
 */
export const LINE_UP_REFERENCE = Object.freeze({ behindFt: -1000, minRangeFt: 150, maxRangeFt: 3000 });
/** How close to the standard start the pair must be for the standard hot turning rejoin (estimates: the shared margins). */
export const STANDARD = Object.freeze({ spacingFt: 100, foreAftFt: 500, heightFt: 100, kias: 10, headingDeg: 5 });

/**
 * The numbers of the off-standard starts and the overshoot (TS-62). All estimates unless a source is given.
 */
export const HOT = Object.freeze({
  minDescentSec: 12, // #2 comes down (or up) to the fighting wing height over at least 12 s, the standard start's (TS-55) ...
  descentFtps: 30, // ... at about 30 ft/s average (1,800 ft/min) when there is time ...
  maxDescentFtps: 45, // ... and faster, up to about 45 ft/s average (2,700 ft/min; its steepest about 13° nose down at 200 KIAS), to be off the
  // stack before he is inside 2,000 ft of Lead (SMM 12.27 para 65: never at or above Lead's height while closing)
  // A planned speed-up is held to full power (TS-63, Patrick 02:48Z): the planner prefers a line inside it (geometry first);
  // a line that still asks more is flown held to full power (full-power.js) and #2 shows STRETCHED. (Until V2.21 the lines
  // could ask up to 3 kt/s.)
  lagShares: [0.75, 0.7], // Fix it may also cut off less (a lag line, geometry first: Patrick 23:37Z, SMM 12.24 para 57)
  search: Object.freeze({ shares: [1.2, 1.1, 1, 0.9, 0.8], banksDeg: [35, 45, 55, 60], reversalStepSec: 1 }), // the coarser search off the standard start
  // Fix it's power: the speed #2 slows to before the capture, 200 KIAS as the standard (Lead's speed) or a little more, so he
  // keeps a set overtake with power (SMM 12.24 para 56: 10 to 20 KIAS more than Lead's; Patrick 23:37Z)
  powerTargetsKias: [200, 210, 220],
  captureSecs: [20, 30, 45], // the capture onto fighting wing: the shortest whose speed changes the aircraft can fly (20 s is the standard's)
  // Where off-standard starts are accepted at all (a generous "roughly line abreast"; anything else flies the tracker's rejoin):
  start: Object.freeze({ minAcrossFt: 1000, maxForeAftFt: 4000, maxHeightFt: 2500, maxKiasOff: 45, maxHeadingDeg: 10 }),
  // The overshoot (SMM 12.27 para 65, Fig 12.18):
  passBehindFt: LENGTH_FT, // passes at least one aircraft length behind Lead (the figure: "one to two aircraft lengths behind and below")
  belowFt: 30, // ... and stays at least this far below Lead until stable outside ("do not go higher than the flat turn position")
  outsideLeftFt: 100, // stabilises on the outside about 3 wingspans out, about one length of clearance tip to tip ("at least one aircraft length")
  outsideBackFt: 40, // ... a little behind Lead's 3/9 line
  blendSecs: [8, 11, 14, 18, 24], // how long the overshoot takes to settle on the outside: the shortest the aircraft can fly
  rollLevelSec: 2, // #2's turn dies away over this long as he rolls the wings level
  idleShare: 0.9, // the overshoot slows at 90% of what idle and the boards give, so the settling has room ("use power and speed brake as required")
  decisionStepSec: 0.5, // the decision point is searched back from the latest possible in half-second steps
  // The decision point (TS-63; Patrick 23:29Z: "Overshoot is only required if they get to the decision point with too much
  // energy to safely transition to route and move up the line in to eschelon"; SMM 12.27 para 64: "a decision made at the
  // latter stages of a rejoin"): no manual gives its distance; Fig 12.18 draws it a few aircraft lengths from Lead, so the
  // decision is taken only within about 1,000 ft (an ESTIMATE, the overshoot lane's own range). It was 1,500 ft in V2.20.
  overshootRangeFt: 1000,
  outsideWithinFt: 3000, // a line that would slide behind Lead to the outside of his turn within this range is too much energy, not a rejoin (estimate)
  nearlyKtps: 1, // a line whose capture asks up to 1 kt/s more speed-up than full power still flies (held to it, STRETCHED); beyond it the decision overshoot is preferred
});

// ---- fighting wing turns (from formation-turns.js) -----------------------------------------------------------------

/** The numbers of the fighting wing turns. Estimates unless a source is given. */
export const FW_TURN = Object.freeze({
  gentleBankDeg: 30, // Lead's bank for a turn of 30° or less (the check turn): gentle (AFM7 brief p.14 item 5a)
  turnBankDeg: 45, // Lead's bank for the bigger turns: moderate, so #2 collapses (item 5b); 1.4 G level
  collapseFromDeg: 32, // #2 starts collapsing once Lead's bank passes this ...
  collapseFullDeg: 42, // ... and goes all the way to Lead's six by this
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
  goalTolFt: 3, // the moving goal counts as reached once the target slot is within 3 ft of it (estimate)
  fwdRate: 40, // how fast the target slot slides fore and aft toward the goal, ft/s (estimate)
  latRate: 60, // how fast the target slot slides sideways toward the goal, ft/s (estimate)
  vrel0: 30, // the closing speed on the target slot when near it, ft/s (estimate)
  kcap: 0.05, // how much more closing speed per foot of range beyond d0, ft/s per ft (estimate)
  d0: 100, // the range beyond which the closing speed may grow, ft (estimate)
  vrelMax: 120, // the most closing speed on the target slot, ft/s (estimate)
  decel: 2, // the closure is never more than #2 could stop at this deceleration, ft/s² (estimate)
  bankCapDeg: 60, // the most bank #2 uses to follow, degrees (estimate; flagged, never a wall)
  overtakeKias: 15, // power only a little: geometry does the rest (Patrick 19:12Z); the most speed above Lead, KIAS
  undertakeKias: 15, // the most speed below Lead, KIAS (estimate)
  advanceTol: 25, // within this many feet of the goal a leg counts as flown (estimate)
  finalTol: 6, // within this many feet of the last goal, and slow against it, #2 is settled (estimate)
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
    jerkKtps2: 1.0, // kt/s²: acceleration builds over about a second and a half, so the speed has no corners
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
    bankCapDeg: 25, // the most bank the wingman uses, degrees (estimate; flagged, never a wall)
    overtakeKias: 8, // the most speed above the aircraft flown off, KIAS (estimate)
    undertakeKias: 12, // the most speed below it, KIAS (estimate)
    advanceTol: 3, // within this many feet of a leg's slot the next leg starts (estimate)
    finalTol: 1.5, // within this many feet of the last slot, and slow against it, the wingman is settled (estimate)
  }),
  /** The wingman's height changes (tracker.js heightProfile). */
  height: Object.freeze({
    minChangeFt: 0.5, // a smaller change is left out
    minSec: 4, // no height change takes less than 4 s (estimate)
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
  blendInSec: 10, // entry: from the fighting wing slot into the cone (estimate)
  blendOutSec: 12, // terminate: from the cone back to the fighting wing slot (estimate)
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
 *  gain, jerkFtps3: how quickly he follows the speed he wants (1/s) and changes his acceleration (about 1 kt/s², the
 *    tracker's own figure), so the speed has no corners.
 *  margin: a planned line within full power x (1 + share) + ktps (the read-back of a planned line's speeds) is within it.
 *  extraSec: the longest he may take to close up after the planned line ends (a guard only).
 */
export const HOLD = Object.freeze({
  stretchMinFt: 10,
  stretchShare: 0.05,
  overtakeKias: 15,
  closeDecelFtps2: 1,
  gain: 0.6,
  jerkFtps3: 1.7,
  margin: Object.freeze({ share: 0.05, ktps: 0.05 }),
  extraSec: 120,
});

// ---- roll (from flight.js) -----------------------------------------------------------------------------------------

/** Roll limits: up to 90°/s (Patrick, 4 Oct 08:54Z), building and dying away at 360°/s² (Patrick, card 09:54Z). */
export const ROLL = Object.freeze({ maxRateDps: 90, maxAccelDps2: 360 });
