// The turning rejoin, flown the way a pilot flies it (V2.63, TS-69; Patrick 5 Oct 08:12Z: "fast and effective like the SMM",
// "a more medium bank/power setting for a LONGER period"; card "Review, then build" 08:18Z; 08:20Z: "Keep with my overtake
// numbers"; 08:29Z: "realistic aircraft behaviour"; review turn-sim-review/rejoin-review-fable.md). One rule for every
// turning rejoin of the 2-ship, from line abreast (hot: #2 gets colder to reach the line) and from fighting wing (cold: he
// turns hotter to reach it). The straight-ahead rejoin (SARJ) is separate (straight-rejoin.js, TS-72): it is the one that
// drops onto Lead's six.
//
//  1. Lead turns into #2 at the press, at 30° of bank, slowing to 200 KIAS, and holds it until #2 is in (SMM 16.20 para
//     65b; Patrick 05:29Z, 06:16Z item 3; hand-over.js leadTurnInto).
//  2. #2 aims for 220 KIAS down the line, whatever the Rates choice (tuning.js REJOIN.lineKias; Patrick 17:54Z-17:55Z, TS-75):
//     MAX until he has it. Hot (ahead of the line) he gets colder with geometry, not speed: never below Lead's 200 KIAS
//     (to fighting wing, its place's own speed inside Lead's turn), reaching the line at 200-210 (Patrick 17:29Z). Only when
//     no rejoin at that keeps him behind Lead's 3/9 line (close in and hot) does he dip below, then MAX again as he meets
//     the line (Patrick 17:53Z).
//  3. He gets onto the rejoin line (Lead at his 10:30 or 1:30, the tail and wing making an X; SMM 12.24 paras 56-57) and
//     comes down it: in Lead's turning frame he heads across toward the line, more directly the further off it he is, and
//     down it once on it. Most of the closure is Lead's turn's, so on the line his bank stays close to Lead's own.
//  4. He holds the line's speed to the point where a stop at idle just fits (the boards only when the room left needs them),
//     then takes it out, arriving at the decision point (where the line reaches route's spacing) closing at no more than
//     Instructor's close-in rate (SMM 12.24 para 58; Patrick 06:24Z: the rate change at about 500 ft; 17:55Z: "then slow
//     down at the decision point").
//  5. From there the tracker (tracker.js) flows him through route on into the slot in one motion, the close moves Patrick
//     says work well (08:28Z). He goes behind Lead only with too much closure (SMM 12.27 para 65): the tracker's own law. To
//     fighting wing, the whole cone is his place: he settles where he arrives in it (Patrick 08:58Z; TS-75).
// Chosen, the most efficient first (Patrick 08:20Z: "find a way to make the most efficient"): how sharply he captures the line
// (TURNING_REJOIN.aimsFt, the quickest that keeps him behind Lead's 3/9 line); a medium bank (60°) before the G rule; the
// line's 220 KIAS before a smaller overtake; and his least speed before the dip. #2 is flown through the same flight.js step as Lead, so the bank, roll rate and speed
// changes are the aircraft's own. Numbers are tuning.js TURNING_REJOIN's.
import { relativeTo, DEG } from './manoeuvres.js';
import { recordFlight, speedSeg, closeThrough, rejoinTo, legsFor, CHANGE_LIMIT_SEC } from './transitions.js';
import { classify, judge } from './judge.js';
import { FORMATIONS, fwShapeNow, pairSlot } from './slots.js';
import { KIAS_OUTSIDE_LAB, REJOIN, REJOIN_CLOSURE_KT, TURNING_REJOIN, TRACKER, CLOSURE, FW_FOLLOW, G_RULE, closureNow, closeInFtps } from './tuning.js';
import { onClosure, leadTurnInto, fromStep } from './hand-over.js';
import { STEP_SEC, copyAircraft } from './flight.js';
import { stepCommanded, setKias, trackTwice, phase } from './tracker.js';
import { fwGoal } from './formation-turns.js';
import { acrossSixLegs } from './replan.js';
import { fullPowerKtps, slowKtps } from './slow-down.js';
import { powerFor, powerFrom } from './power.js';
import { bankDegFromTurnRate, turnRadiusFromBankFt } from '../../../core/flight-math.js';
import { wrapPi } from '../../../core/angles.js';
import { G_FTPS2, KT_TO_FTPS } from '../../../core/units.js';
import { availableG, iasToTasKt } from '../../../core/t6-performance.js';

const dt = STEP_SEC;

/** The most bank at which MAX still holds the speed (KIAS, block height, a climb's cost in KIAS per second): standard aerodynamics, slow-down.js's full-power rate at that G. */
function sustainedBankDeg(kias, blockFt, climbKtps) {
  const gain = (g) => fullPowerKtps(kias, blockFt, g) - climbKtps;
  let lo = 1;
  let hi = Math.max(1, availableG(kias));
  if (gain(hi) >= 0) return Math.acos(1 / hi) / DEG;
  if (gain(lo) <= 0) return 0;
  for (let i = 0; i < 20; i++) {
    const m = (lo + hi) / 2;
    if (gain(m) >= 0) lo = m;
    else hi = m;
  }
  return Math.acos(1 / lo) / DEG;
}

/**
 * #2's part of the rejoin, from the press to the decision point, flown against Lead's recorded flight `rec` (Lead turning on).
 * s: #2's side (+1 left, -1 right); aimFt: how sharply he captures the line; bankCapDeg: his most bank; decisionFt: how far
 * down the line the decision point is; arriveFtps: his closure there; overtakeKt: KIAS over Lead's 200; floorKias: the least
 * KIAS he flies, lineAtKias: his speed as he reaches the line from ahead of it (TS-75); profile: #2's height. Returns { points, steps, end, accelKtps, maxBankDeg, ahead, minKias, lineKias } or null when he does not reach it in time:
 * points are [bank, kias, power] a step (transitions.js flyStep's bankTrack); ahead is true when he passed ahead of Lead's 3/9
 * line inside 1,000 ft (Patrick 08:04Z: he must not); lineKias is his speed when he got onto the line.
 */
export function flyToDecision({ wing, rec, s, aimFt, bankCapDeg, decisionFt, arriveFtps, overtakeKt, floorKias, lineAtKias, blockFt, t0, profile, lineDeg = TURNING_REJOIN.lineDeg }) {
  const TR = TURNING_REJOIN;
  const W = copyAircraft(wing);
  const sinL = Math.sin(lineDeg * DEG);
  const cosL = Math.cos(lineDeg * DEG);
  const u = { fwd: -sinL, left: s * cosL }; // down the line outward from Lead, in his frame
  const nrm = { fwd: cosL, left: s * sinL }; // across it, toward Lead's nose (positive: ahead of the line, hot)
  const targetKias = KIAS_OUTSIDE_LAB + overtakeKt; // Lead's planned speed plus the overtake: KIAS against KIAS
  const closeFtps = arriveFtps;
  const G = TRACKER.gain;
  const points = [];
  let runIn = false;
  let onLine = false;
  let alongPrev = null;
  let accel = 0;
  let maxBank = 0;
  let ahead = false;
  let wasBehind = false;
  const startFt = Math.hypot(rec.at(0).xFt - W.xFt, rec.at(0).yFt - W.yFt);
  let psiPrev = null;
  let ff = 0;
  let lineKias = null;
  let minKias = W.kias;
  let maxG = W.g ?? 1;
  for (let n = 0; n < Math.round(CHANGE_LIMIT_SEC / dt); n++) {
    const L = rec.at(n);
    const Lnext = rec.at(n + 1);
    const t = t0 + n * dt;
    const dx = L.xFt - W.xFt;
    const dy = L.yFt - W.yFt;
    const r = Math.hypot(dx, dy);
    const rel = relativeTo(L, W);
    const along = rel.fwd * u.fwd + rel.left * u.left;
    if (rel.left * s < 0) return null; // across to Lead's other side: not a rejoin on this side
    if (along <= decisionFt && Math.abs(rel.fwd * nrm.fwd + rel.left * nrm.left) <= TR.captureFt) return { points, steps: n, end: W, accelKtps: accel, maxBankDeg: maxBank, ahead, minKias, maxG, lineKias: lineKias ?? W.kias };

    // Where he steers, in Lead's turning frame: down the line toward Lead once on it; off it, across toward it at up to
    // TURNING_REJOIN.approachDeg, the angle growing with the distance off (the further off, the more directly he heads for
    // it; aimFt sets how quickly: a smaller one is a sharper capture, a larger one a gentler, longer one).
    const cross = rel.fwd * nrm.fwd + rel.left * nrm.left;
    const chi = TR.approachDeg * DEG * (2 / Math.PI) * Math.atan(Math.abs(cross) / aimFt);
    const way = { fwd: -u.fwd * Math.cos(chi) - Math.sign(cross) * nrm.fwd * Math.sin(chi), left: -u.left * Math.cos(chi) - Math.sign(cross) * nrm.left * Math.sin(chi) };
    const f = { x: Math.cos(L.headingRad), y: Math.sin(L.headingRad) };
    const l = { x: -f.y, y: f.x };
    const d = { x: way.fwd * f.x + way.left * l.x, y: way.fwd * f.y + way.left * l.y };
    const omegaL = wrapPi(Lnext.headingRad - L.headingRad) / dt;
    const vfx = L.tasFtps * f.x + omegaL * dy; // the frame's motion where #2 is: Lead's velocity plus his turn (ω × r, r from Lead to #2)
    const vfy = L.tasFtps * f.y - omegaL * dx;
    const ad = vfx * d.x + vfy * d.y;
    const disc = ad * ad - (vfx * vfx + vfy * vfy) + W.tasFtps * W.tasFtps;
    const lam = disc >= 0 ? Math.max(0, Math.sqrt(disc) - ad) : 0;
    const psi = disc >= 0 ? Math.atan2(vfy + lam * d.y, vfx + lam * d.x) : Math.atan2(d.y, d.x);
    if (psiPrev === null) psiPrev = psi;
    ff += G.ffFilter * (wrapPi(psi - psiPrev) / dt - ff);
    psiPrev = psi;
    const rate = ff + wrapPi(psi - W.headingRad) / TR.lineTauSec;
    const ratio = W.tasFtps / W.kias;
    // Speed changes at the G he is pulling, less what a climb costs or plus what a descent gives (standard aerodynamics,
    // dV/dt = g (T - D) / W - g sin(climb angle)); KIAS per second times ratio is true ft/s².
    const climbKtps = (G_FTPS2 * W.climbFtps) / Math.max(W.tasFtps, 1) / ratio;
    // Never past the stall line at the speed he has; near his least speed, no more bank than MAX holds the speed at (TS-75).
    let cap = Math.min(bankCapDeg, Math.acos(1 / Math.max(1, availableG(W.kias))) / DEG);
    if (W.kias < floorKias + TR.floorMarginKias) cap = Math.min(cap, sustainedBankDeg(W.kias, blockFt, climbKtps));
    const bank = Math.max(-cap, Math.min(cap, bankDegFromTurnRate(W.tasFtps, rate)));

    // The power, as a pilot sets it (Patrick 08:48Z: a lot for a short time, or a medium amount for a while; the review's
    // answer): MAX to set the overtake, then held; on the line, the slowing starts where power back alone just takes the
    // closure down to the close-in rate by the decision point, and that rate is held, with idle and then the boards only when
    // the room left needs more (SMM 12.24 para 58; TS-61's order). About 0.7 of a speed change shows in the closure with Lead
    // 45° off the nose. The closure is the one down the line (not the range rate: hot, the range comes down fast across it
    // while he is still getting on).
    const closure = alongPrev === null ? 0 : (alongPrev - along) / dt;
    alongPrev = along;
    if (!onLine && Math.abs(cross) <= TR.captureFt) lineKias = W.kias;
    onLine ||= Math.abs(cross) <= TR.captureFt;
    const aStop = slowKtps(REJOIN.stopStage, W.kias, blockFt, W.g) + climbKtps;
    // The room left, less what he covers while the slowing builds up at the rate the acceleration can change (TS-75).
    const rampFt = (closure * CLOSURE.stopShare * aStop) / G.jerkKtps2 / 2;
    const room = along - decisionFt;
    const needKtps = room - rampFt > 1 && closure > closeFtps ? (closure * closure - closeFtps * closeFtps) / (2 * (room - rampFt)) / (cosL * ratio) : 0;
    const aMax = fullPowerKtps(W.kias, blockFt, W.g) - climbKtps;
    const aPower = slowKtps('power', W.kias, blockFt, W.g) + climbKtps;
    const aAll = slowKtps('idleBoards', W.kias, blockFt, W.g) + climbKtps;
    // The decision point: where the stop at idle just fits the room left (Patrick 17:55Z: "then slow down at the decision
    // point"; TS-75). Until then he holds the line's speed.
    if (!runIn && onLine && closure > closeFtps && needKtps >= CLOSURE.stopShare * aStop) runIn = true;
    // Lead's turn's closure dies away as the range comes down, so the slowing may leave him short of the stopping curve: then
    // the line's speed again until it needs taking out, rather than crawling the rest of the line at the close-in rate.
    else if (runIn && room > closeFtps * TR.runInHoldSec && needKtps < TR.runInReleaseShare * CLOSURE.stopShare * aStop) runIn = false;
    let aCmd;
    if (runIn) {
      // Hold the slowing the room needs; once the closure is down to the close-in rate, the speed that keeps it there.
      aCmd = closure > closeFtps
        ? -Math.min(needKtps, aAll)
        : Math.max(-aAll, Math.min(aMax, G.speedLoop * Math.min(targetKias - W.kias, (closeFtps - closure) / (cosL * ratio))));
      // ... easing off in time to stop the slowing at the close-in rate, not below it (TS-75).
      aCmd = Math.max(aCmd, -Math.sqrt(2 * G.jerkKtps2 * Math.max(0, (closure - closeFtps) / (cosL * ratio))));
    } else {
      // Hot (ahead of the line), he gets colder with geometry, his heading across to the line in Lead's turning frame, not
      // with speed: he slows no further than his least speed, and comes up to lineAtKias as he reaches the line (Patrick
      // 17:29Z: "never below 200 knots unless massively high on energy and tight, and when they hit the line it needs to be
      // at 210-200 knots"; TS-75). On the line, or behind it, the line's speed.
      const lineCmd = Math.min(targetKias, lineAtKias);
      const kiasCmd = cross > TR.captureFt ? lineCmd - (lineCmd - floorKias) * Math.min(1, (cross - TR.captureFt) / TR.hotFt) : targetKias;
      const aMin = cross > TR.captureFt ? aAll : aPower;
      aCmd = Math.max(-aMin, Math.min(aMax, G.speedLoop * (kiasCmd - W.kias)));
    }
    // The slowing eases off in time to stop at his least speed, at the rate the acceleration can change (TS-75).
    aCmd = Math.min(aMax, Math.max(aCmd, -Math.sqrt(2 * G.jerkKtps2 * Math.max(0, W.kias - floorKias))));
    accel += Math.max(-G.jerkKtps2 * dt, Math.min(G.jerkKtps2 * dt, aCmd - accel));
    const kias = W.kias + accel * dt;
    setKias(W, kias);
    stepCommanded(W, bank, t, profile);
    const power = accel >= aMax * 0.985 ? powerFrom(null, 1, W.kias, blockFt) : powerFor(accel, W.kias, blockFt, W.g, W.climbFtps, runIn || cross > TR.captureFt ? 'idleBoards' : null);
    points.push([bank, kias, power]);
    minKias = Math.min(minKias, W.kias);
    maxG = Math.max(maxG, W.g);
    maxBank = Math.max(maxBank, Math.abs(W.bankDeg));
    const after = relativeTo(Lnext, W);
    // Ahead of Lead's 3/9 line inside laneRangeFt is refused, except for a tight start that begins inside it ahead of the
    // line as Lead turns in, until he has been behind it once.
    if (after.fwd <= 0) wasBehind = true;
    else if ((wasBehind || startFt >= TRACKER.laneRangeFt) && Math.hypot(after.fwd, after.left) < TRACKER.laneRangeFt) ahead = true;
  }
  return null;
}

/**
 * The tracker's legs from the decision point (#2 on side s) to `to` on side sTo: through route and on into the slot (transitions.js
 * legsFor's close legs); to fighting wing, into its slot.
 */
function tailLegs(s, to, sTo, spacingFt) {
  if (to === 'fw') return [rejoinTo(pairSlot('fw', s, spacingFt)), ...(sTo !== s ? legsFor('fw', s, 'fw', sTo, spacingFt) : [])];
  const rest = legsFor('route', s, to, sTo, spacingFt);
  return [closeThrough(pairSlot('route', s, spacingFt), rest.length ? { advanceTol: TURNING_REJOIN.routeFlowFt } : {}), ...rest];
}

/** The whole rejoin with one point bank: #2's part to the decision point, then the tracker against Lead turning until #2 is in. */
export function flyWith({ lead, wing, into, s, to, sTo, spacingFt, blockFt, t0, aimFt, bankCapDeg, overtakeKt, lowFloor, upFt = 0 }) {
  const TR = TURNING_REJOIN;
  const route = pairSlot('route', s, spacingFt);
  const decisionFt = to === 'fw' ? fwShapeNow().rangeFt : Math.abs(route.left) / Math.cos(TR.lineDeg * DEG); // where the line reaches route's spacing
  // His least speed (TS-75): Lead's 200 KIAS; to fighting wing, the speed that holds its place inside Lead's turn (nearer
  // the turn's centre, the same turn rate is a lower speed: about 187 KIAS; standard turn geometry). Only when no rejoin at
  // that keeps him behind Lead's 3/9 line (close in and hot, lowFloor) does he slow further, to undertakeKias below Lead's.
  const leadR = turnRadiusFromBankFt(iasToTasKt(KIAS_OUTSIDE_LAB, blockFt) * KT_TO_FTPS, REJOIN.leadBankDeg);
  const placeR = Math.hypot(decisionFt * Math.sin(TR.lineDeg * DEG), leadR - decisionFt * Math.cos(TR.lineDeg * DEG));
  const leastKias = to === 'fw' ? Math.floor((KIAS_OUTSIDE_LAB * placeR) / leadR) : KIAS_OUTSIDE_LAB;
  // To fighting wing he never slows below Lead's 200 KIAS: where its place needs less, the extra goes into height in the
  // cone as he settles (Patrick 5 Oct 22:45Z; the tracker's cone energy, TS-96).
  const floorKias = lowFloor ? KIAS_OUTSIDE_LAB - TR.undertakeKias : Math.max(leastKias, KIAS_OUTSIDE_LAB);
  // #2's height: from where he is to slightly low on the line over heightSec, or over his part if that is shorter.
  // With the vertical (upFt, TS-82): up upFt first, then down onto the line, each at no more than the descent rate.
  const upSec = upFt > 0 ? Math.max(TR.heightSec / 2, upFt / TR.descentFtps) : 0;
  const downSec = upFt > 0 ? Math.max(TR.heightSec / 2, Math.abs(wing.altAboveFt + upFt - TR.lineUpFt) / TR.descentFtps) : 0;
  const descentSec = upFt > 0 ? upSec + downSec : Math.max(TR.heightSec, Math.abs(wing.altAboveFt - TR.lineUpFt) / TR.descentFtps); // no quicker than the rejoin's descent rate
  const heightLeg = (sec) => {
    if (upFt > 0) {
      const tUp = t0 + (sec * upSec) / descentSec;
      return [{ t0, t1: tUp, fromFt: wing.altAboveFt, toFt: wing.altAboveFt + upFt }, { t0: tUp, t1: t0 + sec, fromFt: wing.altAboveFt + upFt, toFt: TR.lineUpFt }];
    }
    return Math.abs(wing.altAboveFt - TR.lineUpFt) > 0.5 ? [{ t0, t1: t0 + sec, fromFt: wing.altAboveFt, toFt: TR.lineUpFt }] : [];
  };
  const args = { wing, rec: into.longRec, s, aimFt, bankCapDeg, decisionFt, arriveFtps: to === 'fw' ? TR.fwArriveFtps : Math.min(closureNow().ftps, closeInFtps(TR.decisionArriveRates)), overtakeKt, floorKias, lineAtKias: leastKias + TR.lineOverKias, blockFt, t0 };
  let part = flyToDecision({ ...args, profile: heightLeg(descentSec) });
  if (!part) return null;
  if (part.steps * dt < descentSec) part = flyToDecision({ ...args, profile: heightLeg(Math.max(part.steps * dt, dt)) });
  if (!part || part.ahead || (upFt > 0 && part.maxG > G_RULE.normalG)) return null;
  const n1 = part.steps;
  const W1 = { ...part.end, altAboveFt: TR.lineUpFt, climbFtps: 0 };
  // The flow through route at no more than the decision point's arrival rate (AI's close-in rate overran the slot from there).
  const flowFtps = closeInFtps(TR.decisionArriveRates);
  // To fighting wing on his own side, the whole cone is his place: inside it he stays where he is (fwGoal, as echelon to
  // fighting wing; Patrick 08:58Z: "the whole cone can be used"; TS-75), so a hot arrival short of the slot is not dragged
  // back to it.
  const rel1 = relativeTo(into.longRec.at(n1), W1);
  // To the other side, on across Lead's six in one motion, Lead turning until #2 is in there (replan.js acrossSixLegs; TS-87).
  const phases =
    sTo !== s && sTo !== 0
      ? onClosure(acrossSixLegs(rel1, s, to, sTo, spacingFt))
      : to === 'fw'
      ? onClosure([phase({ fwd: rel1.fwd, left: rel1.left, alt: TR.lineUpFt }, { ...FW_FOLLOW, goal: (L, W) => fwGoal(L, W, s, false) })], { closeIn: true })
      : onClosure(tailLegs(s, to, sTo, spacingFt)).map((p, i) => (i === 0 && to !== 'fw' ? { ...p, closureFtps: Math.min(p.closureFtps, flowFtps) } : p));
  const fly = (rec, stopWhenSettled) => trackTwice({ refs: { [lead.id]: fromStep(rec, n1) }, wing0: W1, t0: t0 + n1 * dt, phases, blockFt, init: { accelKtps: part.accelKtps }, stopWhenSettled });
  const first = fly(into.longRec, true);
  if (!first.run.ok) return null;
  const lp = into.planTo(n1 + first.run.points.length);
  const { run, profile } = fly(lp.rec, false);
  if (!run.ok || run.laneFwdFt > Math.max(0, pairSlot(to, sTo || s, spacingFt).fwd) + TR.laneTolFt) return null; // never ahead of Lead's 3/9 line on the way in (Patrick 08:04Z)
  return { part, run, profile: [...heightLeg(Math.min(descentSec, Math.max(n1 * dt, dt))), ...profile], lp, durationSec: (n1 + run.points.length) * dt };
}

/**
 * The search for the most efficient turning rejoin (planTurningRejoin's, also the 4-ship's #2 against Lead's held turn,
 * four-rejoin.js): every overtake, bank and aim in the order below, then the vertical. into: leadTurnInto's { longRec,
 * planTo }. hot: from line abreast. vertical: false leaves out the vertical (the 4-ship: #2 starts on his stack). Returns flyWith's result with { overtakeKt, lowFloor, aimFt, bankCapDeg, upFt }, or null.
 */
export function searchTurningRejoin({ lead, wing, into, s, to, sTo, spacingFt, blockFt, t0, hot, vertical = true }) {
  // How far ahead down the line he aims: the one that brings him in soonest (Patrick 08:20Z: "find a way to make the most
  // efficient": smaller inputs for longer, or larger for shorter).
  // A medium bank first; more, up to the G rule, only when no medium-bank rejoin keeps him behind Lead's 3/9 line.
  // When even that can't keep him behind Lead's 3/9 line, the most overtake that can (the review's: fit the overtake to the
  // room; Student's 15 kt is the least): the note says which he flew.
  let best = null;
  // Down the line he holds REJOIN.lineKias, whatever the Rates choice (Patrick 17:54Z, 17:55Z: "the minimum closure up the line
  // to be 220 knots"), or a smaller Rates overtake only when that one would put him ahead of Lead's 3/9 line (TS-75).
  const asked = REJOIN.lineKias - KIAS_OUTSIDE_LAB;
  const overtakes = [asked, ...Object.values(REJOIN_CLOSURE_KT).filter((kt) => kt < asked).sort((a, b) => b - a)];
  // Every overtake and bank at his least speed first; slower only when none of them keeps him behind Lead's 3/9 line
  // (Patrick 17:29Z: "unless massively high on energy and tight"; TS-75).
  for (const lowFloor of [false, true]) {
    for (const overtakeKt of overtakes) {
      // Medium banks first (hot, also Lead's own 30° and the gentlest capture: lagging while Lead's turn brings the aspect
      // round, the review's worst-case answer), then the G rule only when none of those keeps him behind Lead's 3/9 line.
      for (const caps of [hot ? TURNING_REJOIN.hotBanksDeg : [TURNING_REJOIN.bankCapDeg], [REJOIN.bankCapDeg]]) {
        for (const bankCapDeg of caps) for (const aimFt of hot ? [...TURNING_REJOIN.aimsFt, TURNING_REJOIN.lagAimFt] : TURNING_REJOIN.aimsFt) {
          const flown = flyWith({ lead, wing, into, s, to, sTo, spacingFt, blockFt, t0, aimFt, bankCapDeg, overtakeKt, lowFloor });
          if (flown && (!best || flown.durationSec < best.durationSec - 0.5)) best = { ...flown, overtakeKt, lowFloor, aimFt, bankCapDeg, upFt: 0 };
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
      const flown = flyWith({ lead, wing, into, s, to, sTo, spacingFt, blockFt, t0, aimFt: best.aimFt, bankCapDeg: best.bankCapDeg, overtakeKt: best.overtakeKt, lowFloor: best.lowFloor, upFt });
      if (flown && flown.durationSec < best.durationSec - 0.5) best = { ...flown, overtakeKt: best.overtakeKt, lowFloor: best.lowFloor, aimFt: best.aimFt, bankCapDeg: best.bankCapDeg, upFt };
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
  const sTo = to === 'astern' ? 0 : want === 'left' ? 1 : want === 'right' ? -1 : s;
  const pre = Math.abs(lead.kias - KIAS_OUTSIDE_LAB) > 0.5 ? [{ ...speedSeg(lead.kias, KIAS_OUTSIDE_LAB, blockFt), withNext: true }] : [];
  const into = leadTurnInto({ lead, pre, s, bankDeg: REJOIN.leadBankDeg, t0, record: recordFlight });

  const hot = from.key === 'lab';
  const best = searchTurningRejoin({ lead, wing, into, s, to, sTo, spacingFt, blockFt, t0, hot });
  const asked = REJOIN.lineKias - KIAS_OUTSIDE_LAB;
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
  return {
    ok: true,
    plans: { [lead.id]: { segments: lp.segments.map((x) => ({ ...x })) }, [wing.id]: { segments: [{ kind: 'bankTrack', points: [...part.points, ...run.points] }], profile } },
    note: `${fromWord}${fromSide} to ${label}${sideWord}: ${how}. Lead turns into #2 at ${REJOIN.leadBankDeg}° of bank${slowing} and holds it until #2 is in (${turnDeg}°; SMM 16.20 para 65b). #2 aims for ${KIAS_OUTSIDE_LAB + best.overtakeKt} KIAS down the line, ${best.overtakeKt} kt of overtake${best.overtakeKt < asked ? ` (${KIAS_OUTSIDE_LAB + asked} would put him ahead of Lead's 3/9 line from here)` : ''}, gets onto the rejoin line and holds it with Lead at his ${clock}, slightly low (SMM 12.24 paras 56-57); ${hot ? 'he starts hot and gets colder to reach it' : 'he starts cold and turns hotter to reach it'}. ${speeds}${best.upFt ? ` He goes ${best.upFt.toLocaleString('en-CA')} ft higher early and comes down onto the line (the vertical, TS-82).` : ''} From the decision point, where a stop at idle just fits, he takes it out and flows ${end}.`,
    label: `${label}${sideWord}`,
    flying: `${fromWord}${fromSide} to ${label}${sideWord} (${how})`,
    from: from.key,
    fromSide: s,
    to,
    side: sTo,
    rejoinKind: 'into',
    verticalUpFt: best.upFt,
    // The decision point (where a stop at idle just fits): formation.js plans the change again there (spec F1).
    decisionSec: t0 + part.steps * dt,
    leadTurnDeg: turnDeg,
    laneFwdFt: run.laneFwdFt,
    maxBankDeg: Math.max(part.maxBankDeg, run.maxBankDeg),
    judged,
    endSec: t0 + best.durationSec,
    rejoining: true,
    handOverSec: null,
  };
}
