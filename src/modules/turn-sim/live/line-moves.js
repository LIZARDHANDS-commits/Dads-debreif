// The 2-ship's formation changes as lines, then tracker (clean-up step 2, TS-65; Patrick, card "Lines, then tracker"
// 5 Oct 05:41Z; 06:24Z on the hand-over): the moves that start further than about 500 ft from the new slot fly a kinematic
// line into the ball park at a rejoin's closure, then the tracker closes on the slot at the close-in rate and holds it,
// planned again from the real state when the line ends (hand-over.js). The turning rejoin, from line abreast or fighting
// wing, is turning-rejoin.js (TS-68); odd starts no line rule covers stay with the tracker alone (transitions.js planGoTo,
// the fallback).
//
// The lines follow the same manual routes as the tracker's legs (transitions.js legsFor), so the end picture is the same:
//  - fighting wing to echelon, route or line astern: the straight-ahead rejoin (SMM 12.26 paras 62-63, Fig 12.17; EFIG
//    p.371; Patrick 4 Oct 19:04Z, TS-55): the line drops back onto Lead's six about 1,000 ft behind, just below his wake,
//    and runs up it; the tracker takes over about 500 ft from the slot (near Fig 12.17's point 2, where the small vector to
//    the side is taken), closes to route and moves on as the legs say;
//  - a close formation out to fighting wing on the same side (drop back, then sweep out: SMM 16.32 para 92, 16.38 para
//    105; Patrick 19:03Z), fighting wing across to the other side behind Lead (SMM 12.29 para 69), and any formation out
//    to line abreast (SMM 16.18 para 51): the kinematic-moves.js routePoints lines, the tracker for the last of each;
//  - the straight-ahead rejoin from line abreast (the More option; SMM 16.20 para 65a), to fighting wing on #2's side or
//    on to a close formation through the straight-ahead rejoin above;
//  - the straight-ahead rejoin from fighting wing is the Rejoin kind choice's other option (the turning rejoin, the default,
//    is turning-rejoin.js: V2.24, TS-68; Patrick 07:32Z: "From every tactical formation you should be able to pick either
//    straight ahead rejoin or turning rejoin").
import { relativeTo } from './manoeuvres.js';
import { recordFlight, speedSeg, describe, legsFor, STRAIGHT_AHEAD, CHANGE_LIMIT_SEC } from './transitions.js';
import { CLOSE, routePoints } from './kinematic-moves.js';
import { classify, judge } from './judge.js';
import { FORMATIONS, pairSlot } from './slots.js';
import { KIAS_LAB, KIAS_OUTSIDE_LAB, closureNow, rejoinClosureNow, ratesNow, RATE_WORDS } from './tuning.js';
import { onClosure, lineRunIn, trackTail, wingPlan, replanFor } from './hand-over.js';
import { STEP_SEC } from './flight.js';

/**
 * The line's places for a change, and the tracker's legs that follow the hand-over: { points, tail } (tail an index into
 * legsFor's phases: the legs from there on), or null when no line rule covers the move (the tracker flies it all).
 */
function lineFor(from, s, to, sTo, cur, spacingFt, straightFromLab) {
  const A = STRAIGHT_AHEAD;
  const six = (fwd) => ({ fwd, left: 0, up: A.belowWakeFt, plane: 0 });
  if (from === 'fw' && CLOSE.has(to)) return { points: [cur, six(A.sixFt), six(A.closeTowardFt)], tail: 1 };
  if (CLOSE.has(from) && to === 'fw' && (from === 'astern' || s === sTo)) return { points: routePoints(from, s, 'fw', sTo, cur, spacingFt), tail: -1 };
  if (to === 'lab' && (from === 'fw' || CLOSE.has(from))) return { points: routePoints(from, s, 'lab', sTo, cur, spacingFt), tail: -1 };
  if (from === 'fw' && to === 'fw' && s !== sTo) return { points: routePoints('fw', s, 'fw', sTo, cur, spacingFt), tail: -1 };
  if (straightFromLab && to === 'fw' && s === sTo) return { points: routePoints('lab', s, 'fw', s, cur, spacingFt), tail: -1 };
  if (straightFromLab && CLOSE.has(to)) return { points: [...routePoints('lab', s, 'fw', s, cur, spacingFt), six(A.sixFt), six(A.closeTowardFt)], tail: 2 };
  return null;
}

/**
 * Plans a change of formation for a pair [lead, wing] as a line, then the tracker, in planGoTo's shape (transitions.js), or
 * null when no line rule covers it or the line's tracker part does not settle (planGoTo then flies it: the tracker alone).
 * options: { side, spacingFt, blockFt, rejoin, lastSide }, as planGoTo's.
 */
export function planLineChange(pair, to, options = {}, t0 = 0) {
  const [lead, wing] = pair;
  const spacingFt = options.spacingFt ?? 6000;
  const blockFt = options.blockFt ?? 8000;
  if (!FORMATIONS[to]) return null;
  const from = classify([lead, wing]);
  const sCur = from.side || (options.lastSide ?? -1);
  const want = options.side ?? 'keep';
  const sTo = to === 'astern' ? 0 : want === 'left' ? 1 : want === 'right' ? -1 : sCur;
  if (from.key === to && (to === 'astern' || sTo === sCur)) return null;
  if (from.key === 'other' || (from.key === 'lab' && to === 'lab')) return null;
  const straightFromLab = from.key === 'lab' && (options.rejoin ?? 'into') === 'straight';
  if (from.key === 'lab' && !straightFromLab) return null; // the hot turning rejoin (hot-rejoin.js) or the tracker's
  const rel = relativeTo(lead, wing);
  const cur = { fwd: rel.fwd, left: rel.left, up: wing.altAboveFt - lead.altAboveFt, plane: CLOSE.has(from.key) ? 1 : 0 };
  const rule = lineFor(from.key, sCur, to, sTo, cur, spacingFt, straightFromLab);
  if (!rule) return null;
  const phases = legsFor(from.key, sCur, to, sTo, spacingFt);
  if (!phases.length) return null;
  const finalSlot = pairSlot(to, sTo, spacingFt);
  const targetKias = to === 'lab' ? KIAS_LAB : KIAS_OUTSIDE_LAB;
  const leadSegs = Math.abs(lead.kias - targetKias) > 0.5 ? [speedSeg(lead.kias, targetKias, blockFt)] : [];
  const leadRec = recordFlight(lead, { segments: leadSegs }, t0);
  // The line at a rejoin's closure to about 500 ft from the slot, then the tracker at the close-in rate (Patrick 06:24Z);
  // a move that starts inside 500 ft is the tracker's alone, at the close-in rate.
  const legs = onClosure(phases.slice(rule.tail < 0 ? phases.length + rule.tail : rule.tail), { closeIn: true });
  const line = lineRunIn({ wing, leadRec, points: rule.points, finalSlot, blockFt });
  const tail = trackTail({ wing, lead, leadRec, line, phases: line ? legs : onClosure(phases, { closeIn: true }), t0, blockFt });
  const replan = line ? replanFor({ leadId: lead.id, phases: legs, blockFt, accelKtps: line.accelKtps, record: recordFlight }) : null;
  const { run } = tail;
  const durationSec = (tail.steps0 + run.points.length) * STEP_SEC;
  if (!run.ok || durationSec > CHANGE_LIMIT_SEC) return null;
  const judged = judge([run.end.lead, run.end.wing], { key: to }, { spacingFt });
  if (!judged.inBand) return null;
  const rejoinKind = straightFromLab ? 'straight' : 'none';
  const how = describe(from.key, to, rejoinKind);
  const sideWord = to === 'astern' ? '' : sTo > 0 ? ' left' : ' right';
  const fromWord = FORMATIONS[from.key].label;
  const fromSide = from.key === 'astern' ? '' : sCur > 0 ? ' left' : ' right';
  const closure = closureNow();
  const handOver = line
    ? ` #2 flies a line at ${rejoinClosureNow().kt} kt of closure to about ${Math.round(line.handOverFt / 10) * 10} ft from the slot, then the tracker closes at ${closure.kt} kt (${RATE_WORDS[ratesNow()]}).`
    : ` #2 closes at ${closure.kt} kt (${RATE_WORDS[ratesNow()]}).`;
  return {
    ok: true,
    plans: { [lead.id]: { segments: leadSegs.map((x) => ({ ...x })) }, [wing.id]: wingPlan(line, tail, replan) },
    note: `${fromWord}${fromSide} to ${FORMATIONS[to].label}${sideWord}: ${how}.${handOver}`,
    label: `${FORMATIONS[to].label}${sideWord}`,
    flying: `${fromWord}${fromSide} to ${FORMATIONS[to].label}${sideWord} (${how})`,
    from: from.key,
    fromSide: sCur,
    to,
    side: sTo,
    rejoinKind,
    leadTurnDeg: 0,
    laneFwdFt: run.laneFwdFt,
    maxBankDeg: Math.max(run.maxBankDeg, line?.maxBankDeg ?? 0),
    judged,
    endSec: t0 + durationSec,
    rejoining: from.key === 'lab',
    handOverSec: line ? t0 + line.steps * STEP_SEC : null,
  };
}
