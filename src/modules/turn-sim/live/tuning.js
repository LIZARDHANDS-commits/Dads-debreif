// The Formation Sim's tuning table (clean-up step 1, TS-64; Patrick's yes pending, architecture.md item 5): every closure
// rate, bank, timing and speed the planners use, in one file, each with its source beside it, so "quicker" or "slower" is
// a change in one place. Moved here unchanged from the files that use them (named beside each table); those files import
// them from here. Numbers with no manual page or ruling beside them are estimates and say so.
//
// This file imports only slots.js (which imports nothing) and core units and flight math, so any file can read it without
// an import loop.
import { KT_TO_FTPS } from '../../../core/units.js';
import { G_FTPS2 } from '../../../core/units.js';
import { bankDegFromG } from '../../../core/flight-math.js';
import { LENGTH_FT, FW_BAND, pairSlot } from './slots.js';

/**
 * A close move's bank cap, every Rates choice (Patrick 5 Oct 06:43Z: "lets do up to 60 for all as requird for now"; it was
 * 30°, 06:16Z item 12, which left the AI's 2.5 s route to echelon out of reach); WING_BANKS below. A slower rate banks less.
 */
const CLOSE_BANK_DEG = 60;

// ---- the G rule (clean-up step 2, TS-65; Patrick 5 Oct 06:16Z) -----------------------------------------------------

/**
 * The G rule: 5 G is the normal aim (SMM 16.17 para 44a; Gen Book p.11), more only as a last resort and never 7 (TS-60
 * amendment). Flagged on screen, never a wall; 7 G is the physical limit the planners keep under.
 */
export const G_RULE = Object.freeze({ normalG: 5, lastResortG: 7 });
/** "No bank cap" (Patrick 06:16Z): the bank of a level turn at the G rule's normal 5 G, about 78°. */
export const G_RULE_BANK_DEG = bankDegFromG(G_RULE.normalG);

// ---- speeds (from transitions.js) ---------------------------------------------------------------------------------

/** The pair flies 200 KIAS outside line abreast (SMM 12.23 para 53; Patrick 11:08Z) and 220 in it (SMM 16.18 para 49). */
export const KIAS_OUTSIDE_LAB = 200;
export const KIAS_LAB = 220;

// ---- rejoins (from transitions.js) --------------------------------------------------------------------------------

/** Defaults for rejoins. */
export const REJOIN = Object.freeze({
  overtakeKias: 15, // the middle of EFIG p.374's 10 to 20 KIAS for a turning rejoin
  bankCapDeg: G_RULE_BANK_DEG, // #2 in a rejoin: no bank cap but the G rule, about 78° level (Patrick 5 Oct 06:16Z item 1: "Unlimitd bank", RULED_REJOIN; flown since V2.59, TS-67; 60°, an estimate, until then)
  leadBankDeg: 30, // Lead's turn in a turning rejoin (SMM 12.24 para 54; AFM7 p.21)
  lineKias: 220, // every rejoin, turning or straight ahead: at least this down the line (or Lead's six) to the decision point, whatever the Rates choice; Rates sets only the close-in rate after it (Patrick 5 Oct 17:54Z: "aim for 220 up the line for both"; 17:55Z: "in all rejoins id like the minimum closure up the line to be 220 knots for expeidiousness, then slow down at the decision point"; TS-75)
  stopStage: /** @type {'idle'} */ ('idle'), // from the decision point the overtake comes off at idle, planned at CLOSURE.stopShare of what idle gives, the boards only when the room left needs more; the decision point is where that stop just fits (Patrick 17:55Z; TS-75; slow-down.js's stages)
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
  descentFtps: 30, // a height difference comes off no quicker than this, 1,800 ft/min (HOT.descentFtps's estimate)
  captureFt: 150, // he is on the line within this many feet of it; only then does he start taking out the overtake for the decision point (estimate)
  lineTauSec: 4, // his heading comes onto the one the line asks over about this long, so the bank changes smoothly (estimate)
  heightSec: 10, // #2 settles slightly low on the line over this long, or over his part to the decision point if shorter (estimate)
  undertakeKias: 25, // only when no rejoin at his least speed keeps him behind Lead's 3/9 line (close in and hot) does he slow, at most this far below Lead's 200 KIAS (rejoinTo's, an estimate; TS-75)
  lineOverKias: 10, // hot, he reaches the line at no more than this over his least speed, Lead's 200 KIAS (to fighting wing, its place's own speed) (Patrick 17:29Z: "when they hit the line it needs to be at 210-200 knots"; TS-75)
  runInReleaseShare: 0.5, // taking out the overtake, he sets it again once the room left needs less than this share of the slowing that started it (estimate; TS-75)
  runInHoldSec: 2, // within this many seconds of the decision point at the close-in rate, he keeps taking it out (estimate; TS-75)
  floorMarginKias: 5, // within this of his least speed, he banks no more than MAX holds the speed at, so he doesn't bleed below it (estimate; TS-75)
  routeFlowFt: 20, // he flows through route without stopping, within this many feet of it, on into the slot (estimate; Patrick 07:14Z: "in one motion")
});

/**
 * The straight-ahead rejoin, flown the way a pilot flies it (straight-rejoin.js, TS-72; Patrick 5 Oct 08:40Z: "SARJ should
 * start at full power until it gets back on leads six, then set an overtake. The geometry of moving makes it fall back";
 * the review's SARJ, fable-compiled.md section 3). All estimates unless a source is given.
 */
export const STRAIGHT_REJOIN = Object.freeze({
  cutsDeg: [30, 45, 60], // far off Lead's six line he heads across it at up to this angle to Lead's track; the one that brings him in soonest is flown (estimates: a bigger cut gets across sooner and falls back further)
  aimsFt: [600, 1200, 2400], // how sharply he comes onto the six line: off it by this much he cuts at half the angle (estimates, as TURNING_REJOIN.aimsFt; gentler than the turning rejoin's so he doesn't swing through the six)
  lineTauSec: 2, // his heading comes onto the one the cut asks over about this long (estimate; the turning rejoin's 4 s swings him through the six)
  captureFt: 100, // he is on Lead's six within this many feet of it; until then full power, from then the overtake (estimate)
  decisionBehindFt: 100, // the decision point, this far behind route on the line up to it: the tracker flows him through route from there. Coming straight up from behind, all of his closure is fore and aft, so he needs more room to stop than the turning rejoin's 45° line (about 22 ft behind route) gives (estimate)
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
  // Patrick 05:12Z: echelon to route about 5 s; since step 2 the fore-aft rate is the Rates choice's closure (closeRates below).
  // The hot turning rejoin:
  pointBankDeg: 60, // #2's "aggressive" turn to point at Lead (SMM 16.20 para 65b(2)): 60° (an estimate). Not a cap: the line may bank up to REJOIN.bankCapDeg, the G rule (Patrick 06:16Z item 1, V2.59)
  reverseBanksDeg: [35, 40, 45, 50, 55, 60, 70, Math.floor(G_RULE_BANK_DEG)], // the reversal's banks the planner may choose from: any the G rule allows (Patrick 06:16Z item 2: "Unlimited"; 70° and 78° added in V2.59)
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
 * CLOSURE.stopShare of it (the closure law below), so with v the rate, a the slide's sideways acceleration (g tan of
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
  // ... and faster where he must be off the stack before he is inside 2,000 ft of Lead (SMM 12.27 para 65: never at or above
  // Lead's height while closing), with no fixed rate (Patrick 06:16Z item 4: "unlimited as it can be controlled?"; 45 ft/s
  // average until V2.59): only as quick as a smooth descent whose push and pull stay within pushG of 1 G
  pushG: 0.5, // the smooth descent's steepest push or pull off 1 G (estimate; the height profile's smootherstep peaks at 5.77 x change / time squared)
  // A planned speed-up is held to full power (TS-63, Patrick 02:48Z): the planner prefers a line inside it (geometry first);
  // a line that still asks more is flown held to full power (full-power.js) and #2 shows STRETCHED. (Until V2.21 the lines
  // could ask up to 3 kt/s.)
  lagShares: [0.75, 0.7], // Fix it may also cut off less (a lag line, geometry first: Patrick 23:37Z, SMM 12.24 para 57)
  search: Object.freeze({ shares: [1.2, 1.1, 1, 0.9, 0.8], banksDeg: [35, 45, 55, 60, 70, Math.floor(G_RULE_BANK_DEG)], reversalStepSec: 1 }), // the coarser search off the standard start (70° and 78° added in V2.59: the G rule, Patrick 06:16Z item 2)
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
  overshootRangeFt: 200, // Patrick 06:16Z item 5: "closer to 200 feet" (RULED_REJOIN; flown since V2.59; 1,000 ft, an estimate, until then)
  outsideWithinFt: 3000, // a line that would slide behind Lead to the outside of his turn within this range is never flown (V2.59, Patrick 04:53Z: only the decision overshoot crosses to the outside; estimate)
  nearlyKtps: 1, // a line whose capture asks up to 1 kt/s more speed-up than full power still flies (held to it, STRETCHED); beyond it the decision overshoot is preferred
});

/**
 * Patrick's 06:16Z rulings on the rejoin's estimates (5 Oct 06:16Z), flown since V2.59 (TS-67) in the numbers above
 * (REJOIN.bankCapDeg, KINEMATIC.reverseBanksDeg, HOT.pushG, HOT.overshootRangeFt) and hand-over.js leadTurnInto:
 *  1. "Unlimitd bank. they can roll and dive if they want/need to and it ameks sense": no bank cap on #2 in a rejoin
 *     (REJOIN.bankCapDeg, KINEMATIC.pointBankDeg); bank follows the G the move needs, inside the G rule, past 90° where the
 *     path needs it.
 *  2. "Unlimited": the reversal may take any bank the G rule allows (KINEMATIC.reverseBanksDeg).
 *  3. "until 2 is on": Lead holds his 30° turn until #2 is IN POSITION, then rolls out (replaces REJOIN.turnAnglesDeg).
 *  4. "unlimited as it can be controlled?": no fixed descent rate (HOT.descentFtps, maxDescentFtps); any smooth descent
 *     inside the G rule, still off Lead's height before 2,000 ft (SMM 12.27 para 65).
 *  5. "Decision point would be when the AI would usually tansition to a rate so clser to 200 feet": HOT.overshootRangeFt
 *     about 200 ft.
 */
export const RULED_REJOIN = Object.freeze({ bankCapDeg: null, reverseBanksDeg: null, leadTurnsUntilIn: true, descentFtps: null, overshootRangeFt: 200 });

// ---- the G rule and the 2-ship's banks (clean-up step 2, TS-65; Patrick 5 Oct 06:16Z) --------------------------------

// (G_RULE and G_RULE_BANK_DEG are near the top of the file since V2.59: the rejoin numbers use them.)

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
  kickOutBankCapDeg: G_RULE_BANK_DEG, // Patrick 06:16Z item 12: the G rule only
  fwFollowBankCapDeg: G_RULE_BANK_DEG, // Patrick 06:16Z item 11: the G rule only
  rejoinBankCapDeg: G_RULE_BANK_DEG, // Patrick 06:16Z item 1: the G rule only (the 4-ship's rejoin legs since step 3)
  fwTurnBankDeg: 60, // Patrick 06:16Z item 9: 60° of bank, 2 G level, every fighting wing turn
});

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
 * The 4-ship's wingmen moving to fighting wing (four-ship-moves.js): FW_FOLLOW's tracker settings with a slower sideways
 * and fore-aft slide (40 ft/s, against FW_FOLLOW's 60 and 40) and more power (25 KIAS each way), as it has flown since
 * V2.1x. All estimates; one named entry (clean-up step 2); since step 3 the closure law sets its closing speed (four-ship-moves.js).
 */
export const FW_FOLLOW_FOUR = Object.freeze({
  fwdRate: 40,
  latRate: 40,
  vrel0: FW_FOLLOW.vrel0,
  kcap: FW_FOLLOW.kcap,
  d0: FW_FOLLOW.d0,
  vrelMax: FW_FOLLOW.vrelMax,
  decel: FW_FOLLOW.decel,
  bankCapDeg: FW_FOLLOW.bankCapDeg,
  overtakeKias: 25,
  undertakeKias: 25,
  advanceTol: FW_FOLLOW.advanceTol,
  finalTol: FW_FOLLOW.finalTol,
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
  powerSec: 2, // the PCL's full travel, MAX to idle and the boards, takes at least 2 s (estimate)
  floorKias: 70, // his speed is never shown below 70 KIAS, a guard only: the planned line keeps him well above it (estimate)
});

// ---- roll (from flight.js) -----------------------------------------------------------------------------------------

/**
 * Roll limits: up to 180°/s (Patrick 5 Oct 06:07Z: "Roll rate can be 180 degrees per second"; 90°/s until step 2, Patrick
 * 4 Oct 08:54Z), building and dying away at 720°/s² (an estimate, step 2: 180°/s is reached in 0.25 s and within a 45° roll;
 * it was 360°/s², Patrick card 4 Oct 09:54Z, which reaches 180°/s only in a roll of 90° or more).
 */
export const ROLL = Object.freeze({ maxRateDps: 180, maxAccelDps2: 720 });

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
});
