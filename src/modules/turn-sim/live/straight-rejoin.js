// The straight-ahead rejoin, flown the way a pilot flies it (TS-72; Patrick 5 Oct 08:40Z: "SARJ should start at full power
// until it gets back on leads six, then set an overtake. The geometry of moving makes it fall back"; the review's SARJ,
// turn-sim-review/fable-compiled.md section 3: the turning rejoin's planner with Lead flying straight). The 2-ship, from
// line abreast (the More option, SMM 16.20 para 65a) or fighting wing (the Rejoin kind's other option), to echelon, route or
// line astern. Lead flies straight on, slowing to 200 KIAS.
//
//  1. #2 goes to full power and cuts toward Lead's six line, heading across Lead's track at up to STRAIGHT_REJOIN.cutsDeg, less
//     as he nears the line. Turning in costs ground along Lead's track, so he falls back as he cuts (Patrick 08:40Z); full power
//     keeps that small.
//  2. On Lead's six, just below his wake (EFIG p.371; SMM 12.26 para 62), he holds at least 220 KIAS (tuning.js
//     REJOIN.lineKias, whatever the Rates choice; Patrick 17:55Z, TS-75), and from the decision point, where a stop at idle just
//     fits, takes it out, the boards only when the room left needs them, to arrive closing at no more than Instructor's
//     close-in rate.
//  3. From about 500 ft back he takes the small vector toward the side wanted (SMM 12.26 para 63, Fig 12.17 point 2): the line
//     runs from there to route.
//  4. From the decision point, just behind route, the tracker (tracker.js) flows him through route on into the slot, the close
//     moves Patrick says work well (08:28Z).
// Chosen, the quickest first: the cut and how sharply he comes onto the line (STRAIGHT_REJOIN.cutsDeg, aimsFt), and the overtake
// asked before a smaller one. #2 is flown through the same flight.js step as Lead. Numbers are tuning.js STRAIGHT_REJOIN's.
import { relativeTo, DEG } from './manoeuvres.js';
import { recordFlight, speedSeg, closeThrough, legsFor, STRAIGHT_AHEAD, CHANGE_LIMIT_SEC } from './transitions.js';
import { classify, judge } from './judge.js';
import { FORMATIONS, pairSlot } from './slots.js';
import { KIAS_OUTSIDE_LAB, REJOIN, REJOIN_CLOSURE_KT, STRAIGHT_REJOIN, TURNING_REJOIN, TRACKER, CLOSURE, closureNow, closeInFtps } from './tuning.js';
import { onClosure, fromStep } from './hand-over.js';
import { STEP_SEC, copyAircraft } from './flight.js';
import { stepCommanded, setKias, trackTwice } from './tracker.js';
import { fullPowerKtps, slowKtps } from './slow-down.js';
import { powerFor, powerFrom } from './power.js';
import { bankDegFromTurnRate } from '../../../core/flight-math.js';
import { wrapPi } from '../../../core/angles.js';
import { G_FTPS2 } from '../../../core/units.js';
import { availableG } from '../../../core/t6-performance.js';

const dt = STEP_SEC;
const CLOSE_TARGETS = new Set(['echelon', 'route', 'astern']);

/**
 * #2's part, from the press to the decision point, against Lead's recorded flight `rec` (Lead straight). s: the side he starts
 * on; route: the route slot he flows through; cutDeg, aimFt: the cut and how sharply he comes onto the line; overtakeKt: KIAS
 * over Lead's 200. Returns { points, steps, end, accelKtps, maxBankDeg, ahead, sixFt } or null when he does not reach it in
 * time: points are [bank, kias, power] a step (transitions.js flyStep's bankTrack); ahead is true when he passed ahead of
 * Lead's 3/9 line inside 1,000 ft; sixFt how far back he was when he got onto Lead's six.
 */
function flyToDecision({ wing, rec, s, route, cutDeg, aimFt, overtakeKt, arriveFtps, blockFt, t0, profile }) {
  const SR = STRAIGHT_REJOIN;
  const A = STRAIGHT_AHEAD;
  const TR = TURNING_REJOIN;
  const G = TRACKER.gain;
  const W = copyAircraft(wing);
  const targetKias = KIAS_OUTSIDE_LAB + overtakeKt;
  const decisionFt = -route.fwd + SR.decisionBehindFt; // how far back the decision point is
  const vectorLen = Math.max(1, A.vectorAtFt + route.fwd);
  // Where on Lead's six line he aims to be, sideways, at a distance back: on the six, then from about 500 ft the small vector
  // toward route (Fig 12.17 point 2).
  const lineLeft = (back) => (back >= A.vectorAtFt ? 0 : route.left * Math.min(1, (A.vectorAtFt - back) / vectorLen));
  const points = [];
  let onSix = false;
  let runIn = false;
  let backPrev = null;
  let accel = 0;
  let maxBank = 0;
  let ahead = false;
  let wasBehind = false;
  let sixFt = null;
  const startFt = Math.hypot(rec.at(0).xFt - W.xFt, rec.at(0).yFt - W.yFt);
  for (let n = 0; n < Math.round(CHANGE_LIMIT_SEC / dt); n++) {
    const L = rec.at(n);
    const Lnext = rec.at(n + 1);
    const t = t0 + n * dt;
    const rel = relativeTo(L, W);
    const back = -rel.fwd;
    if (!onSix && rel.left * s < -SR.captureFt) return null; // through Lead's six to the other side before getting onto it
    if (!onSix && back > 0 && Math.abs(rel.left) <= SR.captureFt) {
      onSix = true;
      sixFt = back;
    }
    // Onto Lead's six first, however close he starts (SMM 12.26 para 62, Fig 12.17 point 1), then up it and the vector.
    const cross = rel.left - (onSix ? lineLeft(back) : 0);
    if (onSix && back <= decisionFt && Math.abs(cross) <= SR.captureFt) return { points, steps: n, end: W, accelKtps: accel, maxBankDeg: maxBank, ahead, sixFt };

    // Where he steers: across Lead's track toward the line at up to the cut, less the nearer he is to it. Lead flies straight,
    // so his track is the line's own direction.
    const psi = L.headingRad - Math.sign(cross) * cutDeg * DEG * (2 / Math.PI) * Math.atan(Math.abs(cross) / aimFt);
    const rate = wrapPi(psi - W.headingRad) / SR.lineTauSec;
    const cap = Math.min(TR.bankCapDeg, Math.acos(1 / Math.max(1, availableG(W.kias))) / DEG); // never past the stall line at the speed he has
    const bank = Math.max(-cap, Math.min(cap, bankDegFromTurnRate(W.tasFtps, rate)));

    // The power: full power until he is on Lead's six (Patrick 08:40Z); then the overtake, set with power back if he has more,
    // and taken out where power back alone just brings the closure down to the arrival rate by the decision point, idle and
    // the boards only when the room left needs them (turning-rejoin.js's order; SMM 12.24 para 58).
    const closure = backPrev === null ? 0 : (backPrev - back) / dt;
    backPrev = back;
    const ratio = W.tasFtps / W.kias;
    const climbKtps = (G_FTPS2 * W.climbFtps) / Math.max(W.tasFtps, 1) / ratio;
    const aStop = slowKtps(REJOIN.stopStage, W.kias, blockFt, W.g) + climbKtps;
    // The room left, less what he covers while the slowing builds up at the rate the acceleration can change (TS-75).
    const rampFt = (closure * CLOSURE.stopShare * aStop) / G.jerkKtps2 / 2;
    const room = back - decisionFt;
    const needKtps = room - rampFt > 1 && closure > arriveFtps ? (closure * closure - arriveFtps * arriveFtps) / (2 * (room - rampFt)) / ratio : 0;
    const aMax = fullPowerKtps(W.kias, blockFt, W.g) - climbKtps;
    const aPower = slowKtps('power', W.kias, blockFt, W.g) + climbKtps;
    const aAll = slowKtps('idleBoards', W.kias, blockFt, W.g) + climbKtps;
    // The decision point: where the stop at idle just fits the room left (Patrick 17:55Z: "then slow down at the decision
    // point for eithe SARJ or TRJ"; TS-75).
    if (onSix && !runIn && closure > arriveFtps && needKtps >= CLOSURE.stopShare * aStop) runIn = true;
    const floorKias = KIAS_OUTSIDE_LAB; // never below Lead's 200 KIAS (Patrick 17:29Z; TS-75)
    let aCmd;
    if (!onSix) {
      aCmd = aMax;
    } else if (runIn) {
      aCmd = closure > arriveFtps
        ? -Math.min(needKtps, aAll)
        : Math.max(-aAll, Math.min(aMax, G.speedLoop * Math.min(targetKias - W.kias, (arriveFtps - closure) / ratio)));
      // Easing off in time to stop the slowing at the arrival rate, and never below Lead's speed (TS-75).
      aCmd = Math.max(aCmd, -Math.sqrt(2 * G.jerkKtps2 * Math.max(0, (closure - arriveFtps) / ratio)), -Math.sqrt(2 * G.jerkKtps2 * Math.max(0, W.kias - floorKias)));
    } else {
      // Up Lead's six at least REJOIN.lineKias: MAX to it, and no power back if he has more (Patrick 17:55Z: "the minimum
      // closure up the line to be 220 knots for expeidiousness"; TS-75).
      aCmd = Math.min(aMax, Math.max(0, G.speedLoop * (targetKias - W.kias)));
    }
    accel += Math.max(-G.jerkKtps2 * dt, Math.min(G.jerkKtps2 * dt, aCmd - accel));
    const kias = W.kias + accel * dt;
    setKias(W, kias);
    stepCommanded(W, bank, t, profile);
    const power = accel >= aMax * 0.985 ? powerFrom(null, 1, W.kias, blockFt) : powerFor(accel, W.kias, blockFt, W.g, W.climbFtps, runIn ? 'idleBoards' : null);
    points.push([bank, kias, power]);
    maxBank = Math.max(maxBank, Math.abs(W.bankDeg));
    const after = relativeTo(Lnext, W);
    // Never ahead of Lead's 3/9 line inside laneRangeFt (Patrick 08:04Z), except a start that begins there, until he has been
    // behind it once.
    if (after.fwd <= 0) wasBehind = true;
    else if ((wasBehind || startFt >= TRACKER.laneRangeFt) && Math.hypot(after.fwd, after.left) < TRACKER.laneRangeFt) ahead = true;
  }
  return null;
}

/** The whole rejoin with one cut: #2's part to the decision point, then the tracker through route into the slot. */
function flyWith({ lead, wing, rec, s, to, sTo, spacingFt, blockFt, t0, cutDeg, aimFt, overtakeKt }) {
  const TR = TURNING_REJOIN;
  const A = STRAIGHT_AHEAD;
  const sRoute = sTo || s;
  const route = pairSlot('route', sRoute, spacingFt);
  const descentSec = Math.max(TR.heightSec, Math.abs(wing.altAboveFt - A.belowWakeFt) / TR.descentFtps);
  const heightLeg = (sec) => (Math.abs(wing.altAboveFt - A.belowWakeFt) > 0.5 ? [{ t0, t1: t0 + sec, fromFt: wing.altAboveFt, toFt: A.belowWakeFt }] : []);
  const args = { wing, rec, s, route, cutDeg, aimFt, overtakeKt, arriveFtps: Math.min(closureNow().ftps, closeInFtps(TR.decisionArriveRates)), blockFt, t0 };
  let part = flyToDecision({ ...args, profile: heightLeg(descentSec) });
  if (!part) return null;
  if (part.steps * dt < descentSec) part = flyToDecision({ ...args, profile: heightLeg(Math.max(part.steps * dt, dt)) });
  if (!part || part.ahead) return null;
  const n1 = part.steps;
  const W1 = { ...part.end, altAboveFt: A.belowWakeFt, climbFtps: 0 };
  // Through route without stopping, at no more than the decision point's arrival rate, on into the slot.
  const rest = legsFor('route', sRoute, to, sTo, spacingFt);
  const flowFtps = closeInFtps(TR.decisionArriveRates);
  const phases = onClosure([closeThrough(route, rest.length ? { advanceTol: TR.routeFlowFt } : {}), ...rest]).map((p, i) => (i === 0 ? { ...p, closureFtps: Math.min(p.closureFtps, flowFtps) } : p));
  const { run, profile } = trackTwice({ refs: { [lead.id]: fromStep(rec, n1) }, wing0: W1, t0: t0 + n1 * dt, phases, blockFt, init: { accelKtps: part.accelKtps }, stopWhenSettled: false });
  if (!run.ok || run.laneFwdFt > Math.max(0, pairSlot(to, sTo || s, spacingFt).fwd) + TR.laneTolFt) return null; // never ahead of Lead's 3/9 line on the way in
  return { part, run, profile: [...heightLeg(Math.min(descentSec, Math.max(n1 * dt, dt))), ...profile], durationSec: (n1 + run.points.length) * dt };
}

/**
 * The straight-ahead rejoin as a "Change formation" plan (planGoTo's shape, transitions.js), or null when it does not apply or
 * does not settle (formation.js then tries the line and tracker planners). It applies to the 2-ship with the straight-ahead
 * rejoin chosen, from line abreast or fighting wing to echelon, route or line astern.
 * options: { side, spacingFt, blockFt, rejoin, lastSide }, as planGoTo's.
 */
export function planStraightRejoin(pair, to, options = {}, t0 = 0) {
  const [lead, wing] = pair;
  if (pair.length !== 2 || !CLOSE_TARGETS.has(to) || options.rejoin !== 'straight') return null;
  const from = classify([lead, wing]);
  if (from.key !== 'lab' && from.key !== 'fw') return null;
  const spacingFt = options.spacingFt ?? 6000;
  const blockFt = options.blockFt ?? 8000;
  const s = from.side || Math.sign(relativeTo(lead, wing).left) || (options.lastSide ?? -1);
  const want = options.side ?? 'keep';
  const sTo = to === 'astern' ? 0 : want === 'left' ? 1 : want === 'right' ? -1 : s;
  const leadSegs = Math.abs(lead.kias - KIAS_OUTSIDE_LAB) > 0.5 ? [speedSeg(lead.kias, KIAS_OUTSIDE_LAB, blockFt)] : [];
  const rec = recordFlight(lead, { segments: leadSegs }, t0);

  let best = null;
  const asked = REJOIN.lineKias - KIAS_OUTSIDE_LAB; // REJOIN.lineKias up Lead's six, whatever the Rates choice (Patrick 17:54Z, 17:55Z; TS-75)
  const overtakes = [asked, ...Object.values(REJOIN_CLOSURE_KT).filter((kt) => kt < asked).sort((a, b) => b - a)];
  for (const overtakeKt of overtakes) {
    for (const cutDeg of STRAIGHT_REJOIN.cutsDeg) {
      for (const aimFt of STRAIGHT_REJOIN.aimsFt) {
        const flown = flyWith({ lead, wing, rec, s, to, sTo, spacingFt, blockFt, t0, cutDeg, aimFt, overtakeKt });
        if (flown && (!best || flown.durationSec < best.durationSec - 0.5)) best = { ...flown, overtakeKt, cutDeg };
      }
    }
    if (best) break;
  }
  if (!best || best.durationSec > CHANGE_LIMIT_SEC) return null;
  const { part, run, profile } = best;
  const judged = judge([run.end.lead, run.end.wing], { key: to }, { spacingFt });
  if (!judged.inBand) return null;

  const label = FORMATIONS[to].label;
  const sideWord = to === 'astern' ? '' : sTo > 0 ? ' left' : ' right';
  const fromWord = FORMATIONS[from.key].label;
  const fromSide = s > 0 ? ' left' : ' right';
  const sideTo = (sTo || s) > 0 ? 'left' : 'right';
  const end = to === 'route' ? 'into route and settles' : to === 'astern' ? 'through route and crosses behind into line astern' : `through route into ${label.toLowerCase()}`;
  return {
    ok: true,
    plans: { [lead.id]: { segments: leadSegs.map((x) => ({ ...x })) }, [wing.id]: { segments: [{ kind: 'bankTrack', points: [...part.points, ...run.points] }], profile } },
    note: `${fromWord}${fromSide} to ${label}${sideWord}: straight-ahead rejoin. Lead flies straight on at ${KIAS_OUTSIDE_LAB} KIAS. #2 goes to full power and cuts up to ${best.cutDeg}° toward Lead's six, falling back as he turns, onto it about ${Math.round(part.sixFt / 50) * 50} ft back, just below Lead's wake (EFIG p.371). There he holds at least ${KIAS_OUTSIDE_LAB + best.overtakeKt} KIAS${best.overtakeKt < asked ? ` (${KIAS_OUTSIDE_LAB + asked} would put him ahead of Lead's 3/9 line from here)` : ''}, takes it out at idle from the decision point (TS-75), and from about ${STRAIGHT_AHEAD.vectorAtFt} ft takes the small vector to the ${sideTo} and flows ${end} at ${closureNow().kt} kt (SMM 12.26 paras 62-63, Fig 12.17).`,
    label: `${label}${sideWord}`,
    flying: `${fromWord}${fromSide} to ${label}${sideWord} (straight-ahead rejoin)`,
    from: from.key,
    fromSide: s,
    to,
    side: sTo,
    rejoinKind: 'straight',
    leadTurnDeg: 0,
    laneFwdFt: run.laneFwdFt,
    maxBankDeg: Math.max(part.maxBankDeg, run.maxBankDeg),
    judged,
    endSec: t0 + best.durationSec,
    rejoining: true,
    handOverSec: null,
  };
}
