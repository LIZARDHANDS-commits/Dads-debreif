// The turning rejoin, flown the way a pilot flies it (V2.63, TS-69; Patrick 5 Oct 08:12Z: "fast and effective like the SMM",
// "a more medium bank/power setting for a LONGER period"; card "Review, then build" 08:18Z; 08:20Z: "Keep with my overtake
// numbers"; 08:29Z: "realistic aircraft behaviour"; review turn-sim-review/rejoin-review-fable.md). One rule for every
// turning rejoin of the 2-ship, from line abreast (hot: #2 gets colder to reach the line) and from fighting wing (cold: he
// turns hotter to reach it). The straight-ahead rejoin (SARJ, straight-rejoin.js, TS-72) is the one that drops onto Lead's
// six; both fly one law down the line, rejoin-law.js flyRejoinLine (clean-up step 4, TS-139).
//
//  1. Lead turns into #2 at the press, at 30° of bank, slowing to 200 KIAS, and holds it until #2 is in (SMM 16.20 para
//     65b; Patrick 05:29Z, 06:16Z item 3; lead-turn-in.js leadTurnInto).
//  2. #2 aims for the Rates choice's line speed down the line, 210, 220 or 235 KIAS (tuning.js lineKiasNow; TS-133; 220 for all until V2.149, TS-75):
//     MAX until he has it. Hot (ahead of the line) he gets colder with geometry, not speed: never below Lead's 200 KIAS
//     (to fighting wing, its place's own speed inside Lead's turn), reaching the line at 200-210 (Patrick 17:29Z). Only when
//     no rejoin at that keeps him behind Lead's 3/9 line (close in and hot) does he dip below, then MAX again as he meets
//     the line (Patrick 17:53Z).
//  3. He gets onto the rejoin line (Lead at his 10:30 or 1:30, the tail and wing making an X; SMM 12.24 paras 56-57) and
//     comes down it: in Lead's turning frame he heads across toward the line, more directly the further off it he is, and
//     down it once on it. Most of the closure is Lead's turn's, so on the line his bank stays close to Lead's own.
//  4. He holds the line's speed to the point where a stop with the torque floor and the boards just fits (idle only when the room left needs it),
//     then takes it out, arriving at the decision point (where the line reaches route's spacing) closing at no more than
//     Instructor's close-in rate (SMM 12.24 para 58; Patrick 06:24Z: the rate change at about 500 ft; 17:55Z: "then slow
//     down at the decision point").
//  5. From there the tracker (tracker.js) flows him through route on into the slot in one motion, the close moves Patrick
//     says work well (08:28Z). He goes behind Lead only with too much closure (SMM 12.27 para 65): the tracker's own law. To
//     fighting wing, the whole cone is his place: he settles where he arrives in it (Patrick 08:58Z; TS-75).
// To a close formation (TS-106, V2.113; Patrick 6 Oct 02:30Z-03:58Z) steps 3-5 are now the X: Lead held fixed on #2's canopy
// 45° off Lead's tail (flyOnTheX; a hot start first flies onto the line as above, the X from 750 ft in), at 10-20 KIAS over
// Lead; anywhere 250-100 ft from Lead, stable, he moves over and the decision point re-plans him up into the slot. The
// overshoot (overshootLegs) only when no rejoin plans that way.
// Chosen, the most efficient first (Patrick 08:20Z: "find a way to make the most efficient"): how sharply he captures the line
// (TURNING_REJOIN.aimsFt, the quickest that keeps him behind Lead's 3/9 line); a medium bank (60°) before the G rule; the
// line's 220 KIAS before a smaller overtake; and his least speed before the dip. #2 is flown through the same flight.js step as Lead, so the bank, roll rate and speed
// changes are the aircraft's own. Numbers are tuning.js TURNING_REJOIN's.
import { relativeTo, DEG } from './manoeuvres.js';
import { recordFlight, speedSeg } from './replay.js';
import { closeThrough, rejoinTo, slide, stopAt, legsFor } from './recipes.js';
import { CHANGE_LIMIT_SEC } from './transitions.js';
import { classify, judge } from './judge.js';
import { FORMATIONS, fwShapeNow, pairSlot, downTheLine, LINE_BACK_PER_OUT, LENGTH_FT, sideFor } from './slots.js';
import { KIAS_OUTSIDE_LAB, REJOIN, REJOIN_CLOSURE_KT, TURNING_REJOIN, TRACKER, CLOSURE, FW_FOLLOW, FW_BUBBLE, FW_ENERGY, G_RULE, KINEMATIC, closureNow, closeInFtps, lineKiasNow } from './tuning.js';
import { onClosure, fromStep } from './hand-over.js';
import { leadTurnInto } from './lead-turn-in.js';
import { STEP_SEC, copyAircraft, SMOOTHER_CURVE_PEAK, smoother, smoothLegSec } from './flight.js';
import { RATE_SETS } from './rates.js';
import { laggedBank } from './kinematic.js';
import { trackTwice, runTracker, phase, climbCostKtps } from './tracker.js';
import { createPilot, pilotSpeed, pilotFly, pilotPower, pilotStep, pilotJerkKtps2 } from './pilot.js';
import { fwGoal } from './formation-turns.js';
import { acrossSixLegs } from './replan.js';
import { fullPowerKtps, slowKtps, stallBankDeg } from './slow-down.js';
import { flyRejoinLine, fixedLine, aheadWatch, sustainedBankDeg, sustainsBank } from './rejoin-law.js';
import { throttleAtTorque } from './power.js';
import { bankDegFromTurnRate, turnRadiusFromBankFt } from '../../../core/flight-math.js';
import { wrapPi } from '../../../core/angles.js';
import { G_FTPS2, KT_TO_FTPS } from '../../../core/units.js';
import { availableG, iasToTasKt } from '../../../core/t6-performance.js';

const dt = STEP_SEC;
/** A search try replaces the best so far only when quicker by more than this (the chooser's half-second tie, chooser.js TIE_SEC). */
const BETTER_BY_SEC = 0.5;

/**
 * #2's part of the turning rejoin, from the press to the decision point, flown against Lead's recorded flight `rec` (Lead
 * turning on): the one rejoin law (rejoin-law.js flyRejoinLine) on the fixed line lineDeg off Lead's tail, ending where he
 * is on it within decisionFt of Lead. s: #2's side (+1 left, -1 right); aimFt: how sharply he captures the line; bankCapDeg:
 * his most bank; arriveFtps: his closure at the decision point; overtakeKt: KIAS over Lead's 200; floorKias: the least KIAS
 * he flies, lineAtKias: his speed as he reaches the line from ahead of it (TS-75); profile: #2's height; stopAtSec,
 * cutAheadFromSec: search speed only (flyRejoinLine). Returns flyRejoinLine's result or null; ahead is true when he passed
 * ahead of Lead's 3/9 line inside 1,000 ft (Patrick 08:04Z: he must not).
 * @param {Record<string, any>} options
 */
function flyTurningLine({ lineDeg = TURNING_REJOIN.lineDeg, decisionFt, ...args }) {
  const TR = TURNING_REJOIN;
  return flyRejoinLine({
    ...args,
    leadTurning: true,
    line: fixedLine(lineDeg, args.s),
    done: (geo) => (geo.along <= decisionFt && Math.abs(geo.cross) <= TR.captureFt ? 'done' : null),
    decisionFt,
    approachDeg: TR.approachDeg,
    tauSec: TR.lineTauSec,
    captureFt: TR.captureFt,
  });
}

/** The closure the window's middle overtake gives on the X: along a 45° line about 1.4 times the overtake (estimate). */
const xArriveFtps = () => ((TURNING_REJOIN.stableKt[0] + TURNING_REJOIN.stableKt[1]) / 2) * KT_TO_FTPS * Math.SQRT2;

/**
 * #2's part of a turning rejoin to a close formation, from the press to where he moves over (TS-106; design
 * turn-sim-review/sarj-line/turning-rejoin-design.md; Patrick 6 Oct 02:30Z-03:35Z). He puts Lead on the X (Lead's fin and far
 * wing crossed, 45° off Lead's tail; SMM 12.24 paras 56-57, Fig 12.15 views 1-3) and holds him fixed on the canopy there
 * (card 03:14Z "Fixed on canopy"), nose on Lead, until his closure is stable: he moves over at the first point between farFt
 * and nearFt from Lead where he is closing at no more than the top of TURNING_REJOIN.stableKt with Lead on the X (xWindowDeg)
 * (card 03:32Z; 03:34Z: "10-20 knots at 100 feet, and can move over betwen 250 and 100 feet").
 * In Lead's turning frame the relative motion he wants is straight at Lead plus a sideways part that turns his bearing off
 * Lead's tail onto the X over tauSec (an angle, not feet, so the bearing error is gone well before the window). Geometry
 * first: his heading takes that sideways part and as much closure as his speed now gives (the frame's motion where he is,
 * plus the sideways part, plus closure along the line to Lead, at his own speed). Power as needed: his speed command is the
 * one that would give the closure of a power-back slowing curve down to the middle of stableKt at farFt, inside the line's
 * speed and his least speed (TS-75). No steep turn inside Lead's circle takes the closure out (SMM 12.24, the caution after
 * para 58; card 03:33Z rule 4): the power does. Returns flyTurningLine's shape plus { bearingDeg, closureFtps, stable } where
 * he moves over, or at nearFt with stable false when he is not stable by then, or null.
 */
export function flyOnTheX({ allowAcross = false, wing, rec, s, tauSec, bankCapDeg, farFt, nearFt, overtakeKt, floorKias, blockFt, t0, profile, lineDeg = TURNING_REJOIN.lineDeg, stopAtSec = Infinity, cutAheadFromSec = Infinity, accel0 = 0 }) {
  const TR = TURNING_REJOIN;
  const W = copyAircraft(wing);
  const bX = lineDeg * DEG;
  const G = TRACKER.gain;
  const midKt = (TR.stableKt[0] + TR.stableKt[1]) / 2;
  const arriveFtps = xArriveFtps();
  // Lead's turn into #2 (REJOIN.leadBankDeg at his planned speed), for the speed of the place inside it near the end.
  const leadR = turnRadiusFromBankFt(iasToTasKt(KIAS_OUTSIDE_LAB, blockFt) * KT_TO_FTPS, REJOIN.leadBankDeg);
  const points = [];
  const pilot = createPilot(W, { accelKtps: accel0 }); // the one pilot model (pilot.js, TS-141), from the acceleration he has
  let accel = accel0;
  let maxBank = 0;
  let ahead = false;
  const watch = aheadWatch(Math.hypot(rec.at(0).xFt - W.xFt, rec.at(0).yFt - W.yFt));
  let psiPrev = null;
  let ff = 0;
  let rPrev = null;
  let lineKias = null;
  let minKias = W.kias;
  let maxG = W.g ?? 1;
  let minG = W.g ?? 1;
  let stepDownOk = true;
  for (let n = 0; n < Math.round(CHANGE_LIMIT_SEC / dt); n++) {
    if (n * dt >= stopAtSec) return null; // search speed only (flyRejoinLine's stopAtSec)
    const L = rec.at(n);
    const Lnext = rec.at(n + 1);
    const t = t0 + n * dt;
    const dx = L.xFt - W.xFt; // from #2 to Lead
    const dy = L.yFt - W.yFt;
    const r = Math.hypot(dx, dy);
    if (relativeTo(L, W).left * s < 0 && !(allowAcross && r >= TRACKER.laneRangeFt)) return null; // across to Lead's other side (flyRejoinLine's allowAcross)
    const dz = (W.altAboveFt ?? 0) - (L.altAboveFt ?? 0);
    if (r < TRACKER.belowRangeFt && dz > 5.0) stepDownOk = false;
    const f = { x: Math.cos(L.headingRad), y: Math.sin(L.headingRad) };
    const l = { x: -f.y, y: f.x };
    const p = { x: -dx / r, y: -dy / r }; // from Lead to #2
    const b = Math.atan2(s * (p.x * l.x + p.y * l.y), -(p.x * f.x + p.y * f.y)); // #2's bearing off Lead's tail, toward his side
    const closure = rPrev === null ? 0 : (rPrev - r) / dt;
    rPrev = r;
    if (lineKias === null && Math.abs(b - bX) <= TR.onXDeg * DEG) lineKias = W.kias;
    const done = (stable) => ({ points, steps: n, end: W, accelKtps: accel, maxBankDeg: maxBank, ahead, minKias, maxG, minG, lineKias: lineKias ?? W.kias, bearingDeg: b / DEG, closureFtps: closure, rangeFt: r, overKt: W.kias - L.kias, stable, stepDownOk });
    const over = W.kias - L.kias; // KIAS against KIAS (Patrick 03:44Z)
    if (r <= farFt && closure > 0 && closure <= TR.stableShare * arriveFtps && over <= TR.stableKt[1] && Math.abs(b - bX) <= TR.xWindowDeg * DEG) return done(true);
    if (r <= nearFt) return done(false);

    // The frame's motion where #2 is (Lead's velocity plus his turn, ω × r) and the sideways part that brings the bearing
    // onto the X; tv is the way the bearing grows (away from Lead's tail, round toward his wing on #2's side).
    const omegaL = wrapPi(Lnext.headingRad - L.headingRad) / dt;
    const vfx = L.tasFtps * f.x + omegaL * dy;
    const vfy = L.tasFtps * f.y - omegaL * dx;
    const tv = { x: f.x * Math.sin(b) + s * l.x * Math.cos(b), y: f.y * Math.sin(b) + s * l.y * Math.cos(b) };
    const across = (r * (bX - b)) / tauSec;
    const ax = vfx + across * tv.x;
    const ay = vfy + across * tv.y;
    // Geometry first: the closure toward Lead that his own speed gives with the sideways part (|a - lam·p| = his true speed).
    const ad = -(ax * p.x + ay * p.y);
    const disc = ad * ad - (ax * ax + ay * ay) + W.tasFtps * W.tasFtps;
    const lam = disc >= 0 ? Math.max(0, Math.sqrt(disc) - ad) : 0;
    const psi = disc >= 0 ? Math.atan2(ay - lam * p.y, ax - lam * p.x) : Math.atan2(ay, ax);
    if (psiPrev === null) psiPrev = psi;
    ff += G.ffFilter * (wrapPi(psi - psiPrev) / dt - ff);
    psiPrev = psi;
    const rate = ff + wrapPi(psi - W.headingRad) / TR.lineTauSec;
    const ratio = W.tasFtps / W.kias;
    const climbKtps = climbCostKtps(W, W.climbFtps);
    // Never past the stall line at the speed he has; near his least speed, no more bank than MAX holds the speed at (TS-75).
    let cap = Math.min(bankCapDeg, stallBankDeg(W.kias));
    // His least speed (TS-75): inside TR.insideFloorFt, the speed of his place inside Lead's turn (nearer the turn's centre,
    // the same turn rate is a lower speed), no more than floorKias.
    const cx = L.xFt + s * l.x * leadR;
    const cy = L.yFt + s * l.y * leadR;
    const floorNow = r < TR.insideFloorFt ? Math.min(floorKias, (KIAS_OUTSIDE_LAB * Math.hypot(W.xFt - cx, W.yFt - cy)) / leadR) : floorKias;
    const wantBank = bankDegFromTurnRate(W.tasFtps, rate);
    if (W.kias < floorNow + TR.floorMarginKias && !sustainsBank(Math.abs(wantBank), W.kias, blockFt, climbKtps)) cap = Math.min(cap, sustainedBankDeg(W.kias, blockFt, climbKtps));
    const bank = Math.max(-cap, Math.min(cap, wantBank));

    // Power as needed: the window's middle over Lead's own KIAS (Patrick 03:44Z: "10-20 knots KIAS more than lead"), never
    // more than the line's overtake, nor below his least speed; the turn's geometry adds the rest of the closure.
    // Outside the window, also no faster than a power-back slowing curve allows down to the closure that overtake gives on
    // the X (along a 45° line the closure is about 1.4 times the overtake), so a hot start isn't still closing fast at it.
    const wantFtps = Math.sqrt(arriveFtps * arriveFtps + 2 * TR.slowFtps2 * Math.max(0, r - farFt));
    const kiasCurve = Math.hypot(ax - wantFtps * p.x, ay - wantFtps * p.y) / ratio;
    const kiasCmd = Math.max(floorNow, Math.min(kiasCurve, L.kias + Math.min(overtakeKt, midKt)));
    const aMax = fullPowerKtps(W.kias, blockFt, W.g) - climbKtps;
    const aAll = slowKtps('idleBoards', W.kias, blockFt, W.g) + climbKtps;
    let aCmd = Math.max(-aAll, Math.min(aMax, G.speedLoop * (kiasCmd - W.kias)));
    // The slowing eases off in time to stop at his least speed, at the rate the acceleration can change (TS-75).
    aCmd = Math.min(aMax, Math.max(aCmd, -Math.sqrt(2 * pilotJerkKtps2() * Math.max(0, W.kias - floorNow))));
    // The one pilot model (pilot.js, TS-141): speed from the power at the G he pulls, the roll shaped, the power held.
    const kias = pilotSpeed(pilot, W, aCmd, { blockFt, top: 'idleBoards', floorThr: throttleAtTorque(REJOIN.floorTorquePct, W.kias, blockFt), climbKtps });
    accel = pilot.accel;
    const flown = pilotFly(pilot, W, bank, t, profile);
    points.push([flown, kias, pilotPower(pilot, W, blockFt, t)]);
    minKias = Math.min(minKias, W.kias);
    maxG = Math.max(maxG, W.g);
    minG = Math.min(minG, W.g);
    maxBank = Math.max(maxBank, Math.abs(W.bankDeg));
    // Ahead of Lead's 3/9 line inside laneRangeFt is refused (rejoin-law.js aheadWatch); search speed only, a part that has
    // gone ahead is ended at once from cutAheadFromSec (flyRejoinLine's).
    ahead = watch.step(relativeTo(Lnext, W));
    if (ahead && n * dt >= cutAheadFromSec) return { ...done(false), steps: n + 1, cut: true };
  }
  return null;
}

/**
 * The tracker's legs from the decision point (#2 on side s) to `to` on side sTo. To fighting wing, into its slot. To a close
 * formation from where he moves over on the X (TS-106; Patrick 02:50Z: "Through the decision point, out slightly to route,
 * then up the line to eschelon. One smooth movement"; card 03:32Z): out to the nearest point of the spinner-to-wingtip line
 * (route itself when he moves over near 250 ft, about 50 ft down from echelon at 100 ft), flowing through it, then up the
 * line into echelon (or on into line astern, legsFor's crossover); to route, into route. at: #2's place in Lead's frame then.
 */
function tailLegs(s, to, sTo, spacingFt, at = null) {
  if (to === 'fw') return [rejoinTo(pairSlot('fw', s, spacingFt)), ...(sTo !== s ? legsFor('fw', s, 'fw', sTo, spacingFt) : [])];
  if (to === 'route' || !at) {
    const rest = legsFor('route', s, to, sTo, spacingFt);
    return [closeThrough(pairSlot('route', s, spacingFt), rest.length ? { advanceTol: TURNING_REJOIN.routeFlowFt } : {}), ...rest];
  }
  const ech = pairSlot('echelon', s, spacingFt);
  const rest = legsFor('echelon', s, to, sTo, spacingFt);
  // Where he is against the line: how far down it from echelon (its direction: LINE_BACK_PER_OUT back per foot out) and how
  // far off it. He joins it as far up again as he is off it, so the move over keeps him closing up the line in one movement
  // (Patrick 6 Oct 04:43Z: "2 goes behind lead and stagnates there instead of following the line"); to the nearest point of
  // the line, as until V2.123, the move over held his closure up the line at nothing.
  const n = Math.hypot(1, LINE_BACK_PER_OUT);
  const dF = at.fwd - ech.fwd;
  const dO = Math.abs(at.left) - Math.abs(ech.left);
  const alongFt = (-dF * LINE_BACK_PER_OUT + dO) / n;
  const offFt = Math.abs(dF + dO * LINE_BACK_PER_OUT) / n;
  return [closeThrough(downTheLine(ech, s, Math.max(0, alongFt - offFt)), { advanceTol: TURNING_REJOIN.routeFlowFt }), ...(rest.length ? rest : [slide(ech)])];
}

/**
 * The overshoot, the last resort (Patrick 6 Oct 03:35Z: "only overshoot if there is no other option (instead of giving an
 * error that a rejoin isnt possible)"; SMM 12.27 para 65, Fig 12.18; card 03:33Z rule 5): power back, wings near level, he
 * passes behind and below Lead to the outside of Lead's turn and stabilizes there, his nose a length clear of Lead's tail;
 * then he crosses back with no overtake, a length clear, to the corner behind the place he wants and moves up into it. On a
 * rejoin to the outside (sTo the other side) he stays on the outside. The wings-level bank cap goes on after onClosure.
 */
function overshootLegs(s, to, sTo, spacingFt) {
  const slot = (key, side) => pairSlot(key, side, spacingFt);
  const key = to === 'astern' ? 'echelon' : to;
  const out = sTo !== 0 && sTo !== s ? sTo : -s;
  const clear = (side) => ({ fwd: -2 * LENGTH_FT, left: slot(key, side).left, alt: slot('astern', 0).alt });
  const legs = [stopAt(clear(out))];
  if (to === 'astern') return [...legs, slide(slot('astern', 0), { fwdRate: 5 })];
  if (out === sTo) return [...legs, slide(slot(to, sTo), { fwdRate: 5 })];
  return [...legs, stopAt(clear(s)), slide(slot(to, s), { fwdRate: 5 })];
}

/** The search-speed limits (flyRejoinLine's stopAtSec, cutAheadFromSec) for a part that starts n0 steps after the whole. */
const laterBy = (args, n0) => ({ stopAtSec: (args.stopAtSec ?? Infinity) - n0 * dt, cutAheadFromSec: (args.cutAheadFromSec ?? Infinity) - n0 * dt });

/**
 * The X law's part, with a far start first flown onto the rejoin line as before (flyTurningLine with aimFt, no slowing) until
 * he is TURNING_REJOIN.xFromFt down it: Lead need only be on the X from there in (estimate; Patrick's card 03:47Z), so a hot
 * start from line abreast cuts across freely instead of turning hard to hold the X from the press.
 */
/**
 * A hot start's hard pull (Patrick 6 Oct 04:02Z: "pull like 5 g and 90 deg bank to the line with the power less than max";
 * 04:04Z: "geometry first, power if required"): for hardSec #2 turns the way Lead turns at his most bank (the G rule, within
 * the stall line), idle and the boards down to his least speed, then the X law flies on from there.
 */
function hardThenX(args, hardSec) {
  const { wing, rec, s, bankCapDeg, floorKias, blockFt, t0, profile } = args;
  const W = copyAircraft(wing);
  const points = [];
  const G = TRACKER.gain;
  const pilot = createPilot(W); // the one pilot model (pilot.js, TS-141)
  let maxBank = 0;
  let minKias = W.kias;
  let maxG = W.g ?? 1;
  const n0 = Math.round(hardSec / dt);
  for (let n = 0; n < n0; n++) {
    const t = t0 + n * dt;
    const cap = Math.min(bankCapDeg, stallBankDeg(W.kias));
    const bank = -s * cap; // the way Lead turns into him
    const p = pilotStep(pilot, W, t, { bankDeg: bank, aWant: Math.min(0, G.speedLoop * (floorKias - W.kias)), profile, blockFt, top: 'idleBoards' });
    points.push([p.bank, p.kias, p.power]);
    maxBank = Math.max(maxBank, Math.abs(W.bankDeg));
    minKias = Math.min(minKias, W.kias);
    maxG = Math.max(maxG, W.g);
  }
  // The X law goes on from the pull's acceleration (no step in the power at the join; TS-141).
  const near = flyOnTheX({ ...args, ...laterBy(args, n0), wing: W, rec: fromStep(rec, n0), t0: t0 + n0 * dt, profile, accel0: pilot.accel });
  if (!near) return null;
  return { ...near, points: [...points, ...near.points], steps: n0 + near.steps, maxBankDeg: Math.max(maxBank, near.maxBankDeg), minKias: Math.min(minKias, near.minKias), maxG: Math.max(maxG, near.maxG), stepDownOk: near.stepDownOk };
}

function farThenX(args, aimFt) {
  const TR = TURNING_REJOIN;
  const { wing, rec, t0, profile } = args;
  if (Math.hypot(rec.at(0).xFt - wing.xFt, rec.at(0).yFt - wing.yFt) <= TR.xFromFt) return flyOnTheX(args);
  // Down the line he takes the closure out as before, to the X law's slowing curve where he hands over to it.
  const arriveFtps = Math.sqrt((xArriveFtps()) ** 2 + 2 * TR.slowFtps2 * (TR.xFromFt - TR.windowFarFt));
  const far = flyTurningLine({ ...args, aimFt, decisionFt: TR.xFromFt, arriveFtps, lineAtKias: KIAS_OUTSIDE_LAB + args.overtakeKt });
  if (!far || far.ahead) return far;
  const n0 = far.steps;
  const near = flyOnTheX({ ...args, ...laterBy(args, n0), wing: far.end, rec: fromStep(rec, n0), t0: t0 + n0 * dt, profile, accel0: far.accelKtps });
  if (!near) return null;
  return {
    ...near,
    points: [...far.points, ...near.points],
    steps: n0 + near.steps,
    maxBankDeg: Math.max(far.maxBankDeg, near.maxBankDeg),
    ahead: far.ahead || near.ahead,
    minKias: Math.min(far.minKias, near.minKias),
    maxG: Math.max(far.maxG, near.maxG),
    minG: Math.min(far.minG, near.minG),
    lineKias: far.lineKias,
    stepDownOk: far.stepDownOk !== false && near.stepDownOk !== false,
  };
}

/**
 * The whole rejoin with one point bank: #2's part to the decision point, then the tracker against Lead turning until #2 is in.
 * aimFt: to fighting wing, how sharply he captures the line (flyTurningLine); to a close formation, the X law's time to bring
 * the bearing onto the X, seconds (flyOnTheX, TS-106). overshoot: to a close formation, he overshoots from where his part ends
 * (searchTurningRejoin's last resort); otherwise he must be stable in the window.
 */
export function flyTurningRejoinWith({ lead, wing, into, s, to, sTo, spacingFt, blockFt, t0, aimFt, bankCapDeg, overtakeKt, lowFloor, upFt = 0, minG = null, overshoot = false, xLaw = true, hardSec = 0, allowAcross = false, maxWhenLow = true, limitSec = Infinity }) {
  const TR = TURNING_REJOIN;
  // To a close formation (TS-106): the X law to the window, TR.windowFarFt to windowNearFt from Lead (Patrick 03:32Z card,
  // 03:34Z). To fighting wing, as before: where the line reaches its range.
  const onX = to !== 'fw' && xLaw;
  // The 4-ship's #2 (xLaw false) keeps the line law to route's spacing as before (V2.109).
  const decisionFt = onX || to === 'fw' ? fwShapeNow().rangeFt : Math.abs(pairSlot('route', s, spacingFt).left) / Math.cos(TR.lineDeg * DEG);
  // His least speed (TS-75): Lead's 200 KIAS; to fighting wing, the speed that holds its place inside Lead's turn (nearer
  // the turn's centre, the same turn rate is a lower speed: about 187 KIAS; standard turn geometry). Only when no rejoin at
  // that keeps him behind Lead's 3/9 line (close in and hot, lowFloor) does he slow further, to undertakeKias below Lead's.
  const leadR = turnRadiusFromBankFt(iasToTasKt(KIAS_OUTSIDE_LAB, blockFt) * KT_TO_FTPS, REJOIN.leadBankDeg);
  const placeR = Math.hypot(decisionFt * Math.sin(TR.lineDeg * DEG), leadR - decisionFt * Math.cos(TR.lineDeg * DEG));
  const leastKias = to === 'fw' ? Math.floor((KIAS_OUTSIDE_LAB * placeR) / leadR) : KIAS_OUTSIDE_LAB;
  // To fighting wing he never slows below Lead's 200 KIAS: where its place needs less, the extra goes into height in the
  // cone as he settles (Patrick 5 Oct 22:45Z; the tracker's cone energy, TS-96).
  const floorKias = lowFloor ? KIAS_OUTSIDE_LAB - TR.undertakeKias : Math.max(leastKias, KIAS_OUTSIDE_LAB);
  // Heights are against Lead's at the press: slightly low on the line is TR.lineUpFt below him, wherever he is (until V2.99
  // they were read as heights against the block's zero, as in the straight-ahead rejoin).
  const leadAlt = into.longRec.at(0).altAboveFt;
  const lineFt = leadAlt + TR.lineUpFt;
  // #2's height: from where he is to slightly low on the line over heightSec, or over his part if that is shorter.
  // With the vertical (upFt, TS-82): up upFt first, then down onto the line, each one smooth leg within heightG.
  const upSec = upFt > 0 ? Math.max(TR.heightSec / 2, smoothLegSec(upFt, TR.heightG)) : 0;
  const downSec = upFt > 0 ? Math.max(TR.heightSec / 2, smoothLegSec(wing.altAboveFt + upFt - lineFt, TR.heightG)) : 0;
  const dropFt = wing.altAboveFt - lineFt;
  const steadySec = upFt > 0 ? upSec + downSec : Math.max(TR.heightSec, smoothLegSec(dropFt, TR.heightG)); // no quicker than one smooth leg within heightG (TS-140)
  const heightLeg = (sec) => {
    if (upFt > 0) {
      const tUp = t0 + (sec * upSec) / steadySec;
      return [{ t0, t1: tUp, fromFt: wing.altAboveFt, toFt: wing.altAboveFt + upFt }, { t0: tUp, t1: t0 + sec, fromFt: wing.altAboveFt + upFt, toFt: lineFt }];
    }
    return Math.abs(wing.altAboveFt - lineFt) > 0.5 ? [{ t0, t1: t0 + sec, fromFt: wing.altAboveFt, toFt: lineFt }] : [];
  };
  const args = onX
    ? { allowAcross, maxWhenLow, wing, rec: into.longRec, s, tauSec: TR.bearingTauSec, bankCapDeg, farFt: TR.windowFarFt, nearFt: TR.windowNearFt, overtakeKt, floorKias, blockFt, t0 }
    : { allowAcross, maxWhenLow, wing, rec: into.longRec, s, aimFt, bankCapDeg, decisionFt, lagCut: to === 'fw', placeKias: to === 'fw' ? leastKias : null, arriveFtps: to === 'fw' ? TR.fwArriveFtps : Math.min(closureNow().ftps, closeInFtps(TR.decisionArriveRates)), overtakeKt, floorKias, lineAtKias: leastKias + TR.lineOverKias, blockFt, t0 };
  const fly1 = onX ? (a) => (hardSec > 0 ? hardThenX(a, hardSec) : farThenX(a, aimFt)) : flyTurningLine;
  // The height the part was flown with is the one the plan flies (partSec): a different one changes the G he pulls and so,
  // near the G rule, his turn (the replay then left the planned path: 6 Oct 05:13Z, #2 ended 250 ft back on Lead's other side).
  // Search speed only, the verdict the same (quick): a part still flying at limitSec can't beat the search's best so far,
  // and a part ahead of Lead's 3/9 line is refused, so each is ended there; but only once it is past descentSec, so the
  // second flight over its own length below is still flown as before. A part ended ahead early has { cut: true } and its
  // steps so far.
  const partOver = (descentSec, quick = true) => {
    const limits = (fromSec) => (quick ? { stopAtSec: Math.max(limitSec, fromSec), cutAheadFromSec: fromSec } : {});
    let sec = descentSec;
    /** @type {any} */
    let p = fly1({ ...args, ...limits(descentSec), profile: heightLeg(sec) });
    if (p && p.steps * dt < descentSec) {
      sec = Math.max(p.steps * dt, dt);
      p = fly1({ ...args, ...limits(0), profile: heightLeg(sec) });
    }
    return p ? { part: p, partSec: sec } : null;
  };
  // Line first (TS-124; Patrick 6 Oct 06:14Z): from above, his height comes off first, over the shortest smooth leg whose
  // push and pull stay within each of TR.diveGs of level flight (a deeper roll, harder pull, steeper dive), the hardest that
  // costs no more than TR.diveSlackSec on the steady descent; the dive's G shares the G rule with the turn.
  let steady = partOver(steadySec);
  let best = steady;
  if (upFt === 0 && dropFt > 0 && wing.altAboveFt > leadAlt) {
    for (const g of TR.diveGs) {
      const dive = partOver(Math.max(dt, Math.sqrt((SMOOTHER_CURVE_PEAK * dropFt) / (g * G_FTPS2))));
      if (!dive || dive.part.ahead) continue;
      // A steady part ended early (ahead) has only a lower bound on its time: flown out in full when the bound can't settle it.
      if (steady?.part.cut && dive.part.steps * dt > steady.part.steps * dt + TR.diveSlackSec) steady = partOver(steadySec, false);
      best = steady;
      if (!steady || dive.part.steps * dt <= steady.part.steps * dt + TR.diveSlackSec) {
        best = dive;
        break;
      }
    }
  }
  if (!best) return null;
  const { part, partSec } = best;
  // minG: the least G a vertical may push to (the 4-ship's #2 from his stack); none for the 2-ship.
  if (!part || part.ahead || part.stepDownOk === false || (upFt > 0 && (part.maxG > G_RULE.normalG || (minG !== null && part.minG < minG)))) return null;
  // Not stable by the window's near edge, only the overshoot is left (Patrick 03:35Z: the last resort).
  if (onX && !part.stable && !overshoot) return null;
  const n1 = part.steps;
  const W1 = { ...part.end, altAboveFt: lineFt, climbFtps: 0 };
  // The flow through route at no more than the decision point's arrival rate (AI's close-in rate overran the slot from there).
  const flowFtps = closeInFtps(TR.decisionArriveRates);
  const rel1 = relativeTo(into.longRec.at(n1), W1);
  const onLead = (list) => list.map((p) => ({ ...p, slot: { ...p.slot, alt: p.slot.alt + leadAlt } })); // the table's heights, against Lead
  const t1 = t0 + n1 * dt;
  let phases;
  if (onX && overshoot) {
    // The overshoot: wings near level for TR.overshootLevelSec (its cap after onClosure's), then the legs' own bank.
    phases = onLead(onClosure(overshootLegs(s, to, sTo, spacingFt))).map((p, i) => (i === 0 ? { ...p, bankCapDeg: TR.overshootBankDeg, exitAt: t1 + TR.overshootLevelSec, exit: { bankCapDeg: p.bankCapDeg } } : p));
  } else if (sTo !== s && sTo !== 0) {
    // To the other side, on across Lead's six in one motion, Lead turning until #2 is in there (replan.js acrossSixLegs; TS-87).
    phases = onLead(onClosure(acrossSixLegs(rel1, s, to, sTo, spacingFt)));
  } else if (to === 'fw') {
    // To fighting wing on his own side, the whole cone is his place: inside it he stays where he is (fwGoal, as echelon to
    // fighting wing; Patrick 08:58Z: "the whole cone can be used"; TS-75), so a hot arrival short of the slot is not dragged
    // back to it.
    phases = onClosure([phase({ fwd: rel1.fwd, left: rel1.left, alt: lineFt }, { ...FW_FOLLOW, goal: (L, W) => fwGoal(L, W, s, false) })], { closeIn: true });
  } else if (!onX) {
    phases = onLead(onClosure(tailLegs(s, to, sTo, spacingFt))).map((p, i) => (i === 0 ? { ...p, closureFtps: Math.min(p.closureFtps, flowFtps) } : p));
  } else {
    // From the window he takes the overtake out with power back and the speed brake (card 03:33Z rule 4: "torque and speed
    // brake first"; Patrick 03:20Z: rejoins keep some power, with the boards as required), not power alone.
    phases = onLead(onClosure(tailLegs(s, to, sTo, spacingFt, rel1))).map((p, i) => ({ ...p, slowStage: 'boards', ...(i === 0 ? { closureFtps: Math.min(p.closureFtps, flowFtps) } : {}) }));
  }
  const fly = (rec, stopWhenSettled) => {
    return trackTwice({ refs: { [lead.id]: fromStep(rec, n1) }, wing0: W1, t0: t1, phases, blockFt, init: { accelKtps: part.points.length ? part.points[part.points.length - 1][3] : part.accelKtps }, stopWhenSettled });
  };
  const first = fly(into.longRec, true);
  if (!first.run.ok) return null;
  // To a close formation #2 eases into Lead's wing plane from the move over, and Lead keeps turning until he is in it, then
  // rolls out as gently as in an echelon turn, so #2 can stay in the plane (TS-126).
  const close = to !== 'fw';
  const easeSec = close ? planeEaseSec(rel1, into.longRec.at(n1)) : 0;
  const lp = into.planTo(n1 + Math.max(first.run.points.length, Math.ceil(easeSec / dt)), close ? RATE_SETS.close.echelonRoll : null);
  let { run, profile } = fly(lp.rec, false);
  if (!run.ok) return null;
  // In the wing plane his heights change near Lead, and a climb costs speed: the tracker flies once more with them, so its
  // power pays for them and he still ends on his place (TS-126).
  const inPlane = (r) => inLeadsPlane(wing, { segments: [{ kind: 'bankTrack', points: [...part.points, ...r.points] }], profile: [...heightLeg(partSec), ...profile] }, lp.rec, t0, n1, n1 + r.points.length, easeSec);
  if (close) {
    const again = runTracker({ refs: { [lead.id]: fromStep(lp.rec, n1) }, wing0: W1, t0: t1, phases, profile: inPlane(run), blockFt, init: { accelKtps: part.points.length ? part.points[part.points.length - 1][3] : part.accelKtps } });
    if (again.ok) run = again;
  }
  // Passing more than TR.laneTolFt ahead of the slot is a warning on the card, not a refusal (Patrick 6 Oct 03:45Z; TS-110;
  // a refusal from 5 Oct 08:04Z until V2.122).
  const slotFwdFt = Math.max(0, pairSlot(to, sTo || s, spacingFt).fwd);
  const steps = n1 + run.points.length;
  const flown = close ? inPlane(run) : [...(part.zoomLeg ? [part.zoomLeg] : []), ...heightLeg(partSec), ...profile];
  return { part, run, slotFwdFt, profile: flown, lp, durationSec: steps * dt, overshoot: onX && overshoot };
}

/**
 * How long #2 takes to ease into Lead's wing plane from the move over (TS-126): at least TURNING_REJOIN.planeEaseSec, and
 * longer for a big step so the pull stays within TURNING_REJOIN.planeEaseG (smootherstep's peak pull is SMOOTHER_CURVE_PEAK
 * times the step over the time squared). rel: #2 in Lead's frame there; L: Lead there.
 */
export function planeEaseSec(rel, L) {
  const step = Math.abs(rel.left * Math.sin(L.bankDeg * DEG));
  return Math.max(TURNING_REJOIN.planeEaseSec, Math.sqrt((SMOOTHER_CURVE_PEAK * step) / (TURNING_REJOIN.planeEaseG * G_FTPS2)));
}

/**
 * #2's heights from where he moves over on, in Lead's wing plane (TS-126; Patrick 6 Oct 07:10Z: "2 is above the line,
 * almost co-altitude with lead"; SMM 12.19 and Fig 12.11: in a close formation turn the wingman holds Lead's wing plane,
 * stepped down on the inside of the turn and up on the outside). Lead's bank tilts #2's place by his distance out times
 * the sine of his bank, lagged as in the close turns; it eases in over easeSec from the move over (planeEaseSec), and
 * comes off as Lead rolls out.
 * Until V2.142 the heights were held against Lead's height, so on the inside of Lead's 30° turn #2 sat about half his
 * distance out above the wing plane. The 4-ship's close turning rejoins use it too (four-legs.js). wing: #2 at t0; plan: his bank track and heights; leadRec: Lead's real flight; from:
 * the move-over step; easeSec: planeEaseSec. Returns the heights as one table leg (flight.js tableAt).
 */
export function inLeadsPlane(wing, plan, leadRec, t0, from, steps, easeSec) {
  const rec = recordFlight(wing, plan, t0);
  // His place follows Lead's bank with the close turns' lag (he lags the roll, SMM 12.19 para 43).
  const ref = laggedBank(leadRec, KINEMATIC.planeLagSec);
  const tilt = (n) => -relativeTo(ref.at(n), rec.at(n)).left * Math.sin(ref.at(n).bankDeg * DEG);
  const alt = [];
  for (let n = 0; n <= steps; n++) {
    const ease = n < from ? 0 : smoother(Math.min(1, ((n - from) * dt) / easeSec));
    alt.push(rec.at(n).altAboveFt + tilt(n) * ease);
  }
  const at = (n) => alt[Math.max(0, Math.min(steps, n))];
  const climb = alt.map((_, n) => (at(n + 1) - at(n - 1)) / (2 * dt));
  const nz = alt.map((_, n) => 1 + (at(n + 1) - 2 * at(n) + at(n - 1)) / (dt * dt * G_FTPS2));
  return [{ t0, t1: t0 + steps * dt, table: { dt, alt, climb, nz } }];
}

/**
 * The search for the most efficient turning rejoin (planTurningRejoin's, also the 4-ship's #2 against Lead's held turn,
 * four-rejoin.js): every overtake, bank and aim in the order below, then the vertical. into: leadTurnInto's { longRec,
 * planTo }. hot: from line abreast. vertical: false leaves out the vertical; verticalMinG: the least G a vertical may push to
 * (the 4-ship's #2, who starts on his stack; none for the 2-ship). Returns flyTurningRejoinWith's result with { overtakeKt, lowFloor, aimFt, bankCapDeg, upFt }, or null.
 */
export function searchTurningRejoin({ lead, wing, into, s, to, sTo, spacingFt, blockFt, t0, hot, vertical = true, verticalMinG = null, xLaw = true }) {
  // How far ahead down the line he aims: the one that brings him in soonest (Patrick 08:20Z: "find a way to make the most
  // efficient": smaller inputs for longer, or larger for shorter).
  // A medium bank first; more, up to the G rule, only when no medium-bank rejoin keeps him behind Lead's 3/9 line.
  // When even that can't keep him behind Lead's 3/9 line, the most overtake that can (the review's: fit the overtake to the
  // room; Student's 15 kt is the least): the note says which he flew.
  let best = null;
  // Down the line he aims for the Rates choice's line speed (lineKiasNow, TS-133: a target, geometry first; until V2.149 220 for all, Patrick 17:54Z, 17:55Z: "the minimum closure up the line
  // to be 220 knots"), or a smaller Rates overtake only when that one would put him ahead of Lead's 3/9 line (TS-75).
  const asked = lineKiasNow() - KIAS_OUTSIDE_LAB;
  const overtakes = [asked, ...Object.values(REJOIN_CLOSURE_KT).filter((kt) => kt < asked).sort((a, b) => b - a)];
  // Every overtake and bank at his least speed first; slower only when none of them keeps him behind Lead's 3/9 line
  // (Patrick 17:29Z: "unless massively high on energy and tight"; TS-75).
  // To a close formation, the overshoot is the last resort (Patrick 03:35Z: "only overshoot if there is no other option
  // (instead of giving an error that a rejoin isnt possible)"): the same search with it, only when nothing else plans.
  // Later passes only when the earlier find nothing: Lead's turn may carry #2 across his six well behind him (allowAcross),
  // then without MAX while short of Lead's energy (maxWhenLow), so a rejoin is planned from anywhere it can be.
  for (const { allowAcross, maxWhenLow } of [{ allowAcross: false, maxWhenLow: true }, { allowAcross: true, maxWhenLow: true }, { allowAcross: false, maxWhenLow: false }, { allowAcross: true, maxWhenLow: false }]) {
    for (const overshoot of to !== 'fw' && xLaw ? [false, true] : [false]) {
      for (const lowFloor of [false, true]) {
        for (const overtakeKt of overtakes) {
          // Medium banks first (hot, also Lead's own 30° and the gentlest capture: lagging while Lead's turn brings the aspect
          // round, the review's worst-case answer), then the G rule only when none of those keeps him behind Lead's 3/9 line.
          for (const caps of [hot ? TURNING_REJOIN.hotBanksDeg : [TURNING_REJOIN.bankCapDeg], [REJOIN.bankCapDeg]]) {
            const aims = hot ? [...TURNING_REJOIN.aimsFt, TURNING_REJOIN.lagAimFt] : TURNING_REJOIN.aimsFt;
            // Hot to a close formation, also the hard pull with the power back first (hardThenX; Patrick 04:02Z).
            const tries = [...aims.map((aimFt) => ({ aimFt, hardSec: 0 })), ...(hot && to !== 'fw' && xLaw ? TURNING_REJOIN.hardPullsSec.map((hardSec) => ({ aimFt: aims[0], hardSec })) : [])];
            for (const bankCapDeg of caps) for (const { aimFt, hardSec } of tries) {
              const flown = flyTurningRejoinWith({ lead, wing, into, s, to, sTo, spacingFt, blockFt, t0, aimFt, bankCapDeg, overtakeKt, lowFloor, overshoot, xLaw, hardSec, allowAcross, maxWhenLow, limitSec: best ? best.durationSec - BETTER_BY_SEC : Infinity });
              if (flown && (!best || flown.durationSec < best.durationSec - BETTER_BY_SEC)) best = { ...flown, overtakeKt, lowFloor, aimFt, bankCapDeg, hardSec, upFt: 0, allowAcross, maxWhenLow };
            }
            if (best) break;
          }
          if (best) break;
        }
        if (best) break;
      }
      if (best) break;
    }
    if (best) break;
  }
  // The vertical as a candidate (TS-82): the same rejoin with #2 going high early and coming down onto the line, flown only
  // when it brings him in sooner, by more than the chooser's half-second tie, within the G rule with its pull charged.
  if (best && vertical) {
    for (const upFt of TURNING_REJOIN.verticalUpFt) {
      const flown = flyTurningRejoinWith({ lead, wing, into, s, to, sTo, spacingFt, blockFt, t0, aimFt: best.aimFt, bankCapDeg: best.bankCapDeg, overtakeKt: best.overtakeKt, lowFloor: best.lowFloor, upFt, minG: verticalMinG, overshoot: best.overshoot, xLaw, hardSec: best.hardSec, allowAcross: best.allowAcross, maxWhenLow: best.maxWhenLow, limitSec: best.durationSec - BETTER_BY_SEC });
      if (flown && flown.part?.stepDownOk !== false && flown.run?.stepDownOk !== false && flown.durationSec < best.durationSec - BETTER_BY_SEC) best = { ...flown, overtakeKt: best.overtakeKt, lowFloor: best.lowFloor, aimFt: best.aimFt, bankCapDeg: best.bankCapDeg, hardSec: best.hardSec, upFt, allowAcross: best.allowAcross, maxWhenLow: best.maxWhenLow };
    }
  }
  return best;
}

/**
 * The turning rejoin as a "Change formation" plan (planGoTo's shape, transitions.js), or null when it does not apply or does
 * not settle (formation.js then tries the line and tracker planners). It applies to the 2-ship with the turning rejoin chosen,
 * from line abreast to fighting wing or a close formation, and from fighting wing to a close formation.
 * options: { side, spacingFt, blockFt, rejoin, lastSide }, as planGoTo's.
 */
export function planTurningRejoin(pair, to, options = {}, t0 = 0) {
  const [lead, wing] = pair;
  if (!FORMATIONS[to] || to === 'lab' || (options.rejoin ?? 'into') !== 'into') return null;
  const from = classify([lead, wing]);
  if (!(from.key === 'lab' || (from.key === 'fw' && to !== 'fw'))) return null;
  const spacingFt = options.spacingFt ?? 6000;
  const blockFt = options.blockFt ?? 8000;
  const s = from.side || Math.sign(relativeTo(lead, wing).left) || (options.lastSide ?? -1);
  const want = options.side ?? 'keep';
  const sTo = sideFor(to, want, s);
  const pre = Math.abs(lead.kias - KIAS_OUTSIDE_LAB) > 0.5 ? [{ ...speedSeg(lead.kias, KIAS_OUTSIDE_LAB, blockFt), withNext: true }] : [];
  const into = leadTurnInto({ lead, pre, s, bankDeg: REJOIN.leadBankDeg, t0, record: recordFlight });

  const hot = from.key === 'lab';
  const best = searchTurningRejoin({ lead, wing, into, s, to, sTo, spacingFt, blockFt, t0, hot });
  const asked = lineKiasNow() - KIAS_OUTSIDE_LAB;
  if (!best || best.durationSec > CHANGE_LIMIT_SEC) return null;
  const { part, run, profile, lp } = best;
  const judged = judge([run.end.lead, run.end.wing], { key: to }, { spacingFt });
  if (!judged.inBand) return null;

  const label = FORMATIONS[to].label;
  const sideWord = to === 'astern' ? '' : sTo > 0 ? ' left' : ' right';
  const fromWord = FORMATIONS[from.key].label;
  const fromSide = s > 0 ? ' left' : ' right';
  const how = hot ? 'hot turning rejoin' : 'turning rejoin';
  const turnDeg = Math.round(lp.turned / DEG);
  const slowing = pre.length ? `, slowing to ${KIAS_OUTSIDE_LAB} KIAS,` : ` at ${KIAS_OUTSIDE_LAB} KIAS`;
  const clock = s > 0 ? '1:30' : '10:30';
  const speeds = best.lowFloor
    ? `Too close in and hot to keep ${KIAS_OUTSIDE_LAB} KIAS, he dips to ${Math.round(part.minKias)} KIAS, then MAX again, and is at ${Math.round(part.lineKias)} KIAS on the line (Patrick 17:53Z; TS-75).`
    : `${hot ? 'He gets colder with geometry, not power: his' : 'His'} slowest is ${Math.round(part.minKias)} KIAS, and he is at ${Math.round(part.lineKias)} KIAS on the line (TS-75).`;
  const across = sTo !== s && to !== 'astern' ? ', crossing behind Lead to the other side' : '';
  const end =
    to === 'fw'
      ? sTo === s ? 'into the fighting wing cone, settling where he arrives in it (Patrick 08:58Z: the whole cone)' : `into the fighting wing slot${across}`
      : `through route ${to === 'route' ? 'and settles' : to === 'astern' ? 'and crosses behind into line astern' : `into ${label.toLowerCase()}`}${across} at ${closureNow().kt} kt (SMM 12.24 para 58)`;
  // To a close formation, the X to the window (TS-106).
  const xNote = () => {
    const over = Math.round(part.overKt ?? 0);
    const tail = best.overshoot
      ? `Not stable by ${TURNING_REJOIN.windowNearFt} ft, he overshoots, the last resort (Patrick 03:35Z): wings near level, power back, behind and below Lead to the outside of the turn, stabilizes, crosses back a length clear with no overtake and moves up into ${label.toLowerCase()}${sideWord} (SMM 12.27 para 65, Fig 12.18).`
      : `At ${Math.round(part.rangeFt)} ft, ${over > 0 ? `${over} KIAS over Lead` : 'at Lead\'s speed'} with Lead on the X, he moves over and slides ${to === 'astern' ? 'in behind Lead into line astern' : `up the line into ${label.toLowerCase()}${across}`} (Patrick 03:32Z-03:44Z: anywhere 250-100 ft from Lead, 10-20 KIAS over him).`;
    return `${fromWord}${fromSide} to ${label}${sideWord}: ${how}. Lead turns into #2 at ${REJOIN.leadBankDeg}° of bank${slowing.replace(/,$/, '')} (SMM 16.20 para 65b). #2 ${hot ? `cuts across onto the rejoin line, and from ${TURNING_REJOIN.xFromFt} ft in he ` : ''}puts Lead on the X, fin and far wing crossed at his ${clock}, slightly low, and holds him fixed on the canopy (SMM 12.24 paras 56-57, Fig 12.15). ${speeds} ${tail}`;
  };
  return {
    ok: true,
    plans: { [lead.id]: { segments: lp.segments.map((x) => ({ ...x })) }, [wing.id]: { segments: [{ kind: 'bankTrack', points: [...part.points, ...run.points] }], profile } },
    note: to !== 'fw' ? xNote() : `${fromWord}${fromSide} to ${label}${sideWord}: ${how}. Lead turns into #2 at ${REJOIN.leadBankDeg}° of bank${slowing} and holds it until #2 is in (${turnDeg}°; SMM 16.20 para 65b). #2 aims for ${KIAS_OUTSIDE_LAB + best.overtakeKt} KIAS down the line, ${best.overtakeKt} kt of overtake${best.overtakeKt < asked ? ` (${KIAS_OUTSIDE_LAB + asked} would put him ahead of Lead's 3/9 line from here)` : ''}, gets onto the rejoin line and holds it with Lead at his ${clock}, slightly low (SMM 12.24 paras 56-57); ${hot ? 'he starts hot and gets colder to reach it' : 'he starts cold and turns hotter to reach it'}. ${speeds}${best.upFt ? ` He goes ${best.upFt.toLocaleString('en-CA')} ft higher early and comes down onto the line (the vertical, TS-82).` : ''} From the decision point, where a stop with the torque floor and the boards just fits, he takes it out and flows ${end}.`,
    label: `${label}${sideWord}`,
    flying: `${fromWord}${fromSide} to ${label}${sideWord} (${how})`,
    from: from.key,
    fromSide: s,
    to,
    side: sTo,
    rejoinKind: 'into',
    verticalUpFt: best.upFt,
    // No re-plan at the decision point: the rejoin is flown through as planned, Lead holding his turn until #2 is in
    // position (Patrick 6 Oct 04:43Z: "Lead needs to maintain the turn for a TRJ until 2 is in position (Eschelon or
    // fighting wing) right now they roll out early"; TS-112). The re-plan there (spec F1, TS-81) planned Lead on straight
    // and level, so he rolled out early and #2 slid in from where he was.
    leadTurnDeg: turnDeg,
    laneFwdFt: run.laneFwdFt,
    laneWarnFt: run.laneFwdFt > best.slotFwdFt + TURNING_REJOIN.laneTolFt ? run.laneFwdFt - best.slotFwdFt : null,
    maxBankDeg: Math.max(part.maxBankDeg, run.maxBankDeg),
    judged,
    endSec: t0 + best.durationSec,
    rejoining: true,
    handOverSec: null,
  };
}
