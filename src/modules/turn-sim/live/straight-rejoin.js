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
//     the Rates choice's line speed, lineKiasNow: a target, geometry first, TS-133; 220 for all until V2.149, TS-75), and from the decision point, where a stop with the torque floor and the
//     boards just fits (TS-108), takes it out, idle only when the room left needs it, to arrive closing at no more than Instructor's
//     close-in rate.
//  3. From about 500 ft back he takes the small vector toward the side wanted (SMM 12.26 para 63, Fig 12.17 point 2): the line
//     runs from there to route.
//  4. From the decision point, just behind route, the tracker (tracker.js) flows him through route on into the slot, the close
//     moves Patrick says work well (08:28Z).
// Chosen, the quickest first: the cut and how sharply he comes onto the line (STRAIGHT_REJOIN.cutsDeg, aimsFt), and the overtake
// asked before a smaller one. #2 is flown through the same flight.js step as Lead. Numbers are tuning.js STRAIGHT_REJOIN's.
import { relativeTo } from './manoeuvres.js';
import { recordFlight, speedSeg } from './replay.js';
import { closeThrough, legsFor, STRAIGHT_AHEAD } from './recipes.js';
import { CHANGE_LIMIT_SEC } from './transitions.js';
import { classify, judge } from './judge.js';
import { FORMATIONS, pairSlot, sideFor } from './slots.js';
import { KIAS_OUTSIDE_LAB, REJOIN_CLOSURE_KT, STRAIGHT_REJOIN, TURNING_REJOIN, closureNow, closeInFtps, lineKiasNow } from './tuning.js';
import { onClosure, fromStep } from './hand-over.js';
import { STEP_SEC } from './flight.js';
import { trackTwice } from './tracker.js';
import { flyRejoinLine } from './rejoin-law.js';
import { KT_TO_FTPS as KT_FTPS } from '../../../core/units.js';

const dt = STEP_SEC;
const CLOSE_TARGETS = new Set(['echelon', 'route', 'astern']);

/**
 * #2's part, from the press to the decision point, against Lead's recorded flight `rec` (Lead straight): the one rejoin law
 * (rejoin-law.js flyRejoinLine, TS-139) with Lead flying straight on. s: the side he starts on; route: the route slot he
 * flows through; cutDeg, aimFt: the cut and how sharply he comes onto the line; overtakeKt: KIAS over Lead's 200. Returns
 * flyRejoinLine's result with sixFt (how far back he was when he got onto Lead's six), or null when he does not reach the
 * window in time.
 * @returns {Record<string, any> | null}
 */
function flyToDecision({ wing, rec, s, route, cutDeg, aimFt, overtakeKt, blockFt, t0, profile }) {
  const SR = STRAIGHT_REJOIN;
  const A = STRAIGHT_AHEAD;
  const TR = TURNING_REJOIN;
  // The window (Patrick 6 Oct 03:45Z, card wording: "A rejoin plans only to the window: #2 arrives 250-100 ft from Lead,
  // measured along the rejoin line, 10-20 KIAS faster than Lead"; TS-110): the overtake comes off to the window's middle
  // by its far edge, and the plan ends at the first point in it with no more than its top overtake.
  const decisionFt = TR.windowFarFt;
  const midKt = (TR.stableKt[0] + TR.stableKt[1]) / 2;
  const vectorLen = Math.max(1, A.vectorAtFt + route.fwd);
  // Where on Lead's six line he aims to be, sideways, at a distance back: on the six, then from about 500 ft the small vector
  // toward route (Fig 12.17 point 2). Lead flies straight, so his track is the line's own direction.
  const lineLeft = (back) => (back >= A.vectorAtFt ? 0 : route.left * Math.min(1, (A.vectorAtFt - back) / vectorLen));
  // Onto Lead's six first, however close he starts (SMM 12.26 para 62, Fig 12.17 point 1), then up it and the vector.
  const line = { u: { fwd: -1, left: 0 }, nrm: { fwd: 0, left: 1 }, closureShare: 1, at: (rel, onLine) => ({ along: -rel.fwd, cross: rel.left - (onLine ? lineLeft(-rel.fwd) : 0) }) };
  const done = (geo, W, L, onSix) => {
    if (!onSix) return null;
    if (geo.along <= decisionFt && Math.abs(geo.cross) <= SR.captureFt && W.kias - L.kias <= TR.stableKt[1]) return 'done';
    return geo.along < TR.windowNearFt ? 'fail' : null; // not in the window by its near edge: the overshoot, the last resort (formation.js's other planners)
  };
  const part = flyRejoinLine({
    leadTurning: false, line, done, wing, rec, s, aimFt, approachDeg: cutDeg, tauSec: SR.lineTauSec, captureFt: SR.captureFt,
    // Through Lead's six to the other side before getting onto it is not this rejoin; once on it, the vector may go there.
    acrossTolFt: SR.captureFt, acrossOnlyOffLine: true,
    bankCapDeg: TR.bankCapDeg, decisionFt,
    arriveFtps: (W) => midKt * (W.tasFtps / W.kias), // the window's middle overtake as a closure (Lead straight: all of it fore and aft)
    overtakeKt, floorKias: KIAS_OUTSIDE_LAB, // never below Lead's 200 KIAS (Patrick 17:29Z; TS-75)
    blockFt, t0, profile,
  });
  return part ? { ...part, sixFt: part.lineFt } : null;
}

/** The whole rejoin with one cut: #2's part to the decision point, then the tracker through route into the slot. */
function flyStraightRejoinWith({ lead, wing, rec, s, to, sTo, spacingFt, blockFt, t0, cutDeg, aimFt, overtakeKt }) {
  const TR = TURNING_REJOIN;
  const A = STRAIGHT_AHEAD;
  const sRoute = sTo || s;
  // Route is on the spinner-to-wingtip line (TS-103), so into echelon he joins the line at route and flows on up it into the
  // slot without stopping (Patrick 6 Oct 02:01Z: "SARJ shuold hit 'The line' ... and fluildly transition their motion up
  // that line in to position"; 02:11Z: "It should move through route and stop at eschalon").
  const route = pairSlot('route', sRoute, spacingFt);
  // Heights are against Lead's at the press: just below his wake is A.belowWakeFt below him, wherever he is (until V2.99
  // they were read as heights against the block's zero, so with Lead off it #2 flew to the wrong height).
  const leadAlt = rec.at(0).altAboveFt;
  const wakeFt = leadAlt + A.belowWakeFt;
  const descentSec = Math.max(TR.heightSec, Math.abs(wing.altAboveFt - wakeFt) / TR.descentFtps);
  const heightLeg = (sec) => (Math.abs(wing.altAboveFt - wakeFt) > 0.5 ? [{ t0, t1: t0 + sec, fromFt: wing.altAboveFt, toFt: wakeFt }] : []);
  const args = { wing, rec, s, route, cutDeg, aimFt, overtakeKt, blockFt, t0 };
  // The height the part was flown with is the one the plan flies (partSec): a different one changes the G he pulls and so,
  // near the G rule, his turn (the replay then left the planned path: 6 Oct 05:13Z, #2 ended 250 ft back on Lead's other side).
  let partSec = descentSec;
  let part = flyToDecision({ ...args, profile: heightLeg(partSec) });
  if (!part) return null;
  if (part.steps * dt < descentSec) {
    partSec = Math.max(part.steps * dt, dt);
    part = flyToDecision({ ...args, profile: heightLeg(partSec) });
  }
  if (!part || part.ahead) return null;
  const n1 = part.steps;
  const W1 = { ...part.end, altAboveFt: wakeFt, climbFtps: 0 };
  // Through route without stopping, at no more than the decision point's arrival rate, on into the slot.
  // Into echelon: one flow up the line into the slot, no stop on the way (Patrick 6 Oct 02:01Z: "a rejoin should never
  // stagnate (stop) until it's in position").
  const rest = legsFor('route', sRoute, to, sTo, spacingFt);
  const flowFtps = Math.min(closeInFtps(TR.decisionArriveRates), to === 'echelon' ? STRAIGHT_REJOIN.lineArriveKt * KT_FTPS : Infinity);
  const onLine = to === 'echelon';
  const legs = [closeThrough(route, rest.length ? { advanceTol: onLine ? STRAIGHT_REJOIN.lineFlowFt : TR.routeFlowFt } : {}), ...rest];
  const phases = onClosure(legs).map((p, i) => ({ ...p, slot: { ...p.slot, alt: p.slot.alt + leadAlt }, ...(i === 0 || onLine ? { closureFtps: Math.min(p.closureFtps, flowFtps) } : {}) }));
  const { run, profile } = trackTwice({ refs: { [lead.id]: fromStep(rec, n1) }, wing0: W1, t0: t0 + n1 * dt, phases, blockFt, init: { accelKtps: part.accelKtps }, stopWhenSettled: false });
  if (!run.ok) return null;
  // Passing more than TR.laneTolFt ahead of the slot is a warning on the card, not a refusal (Patrick 6 Oct 03:45Z; TS-110).
  const slotFwdFt = Math.max(0, pairSlot(to, sTo || s, spacingFt).fwd);
  return { part, run, slotFwdFt, profile: [...heightLeg(partSec), ...profile], durationSec: (n1 + run.points.length) * dt };
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
  const sTo = sideFor(to, want, s);
  const leadSegs = Math.abs(lead.kias - KIAS_OUTSIDE_LAB) > 0.5 ? [speedSeg(lead.kias, KIAS_OUTSIDE_LAB, blockFt)] : [];
  const rec = recordFlight(lead, { segments: leadSegs }, t0);

  let best = null;
  const asked = lineKiasNow() - KIAS_OUTSIDE_LAB; // the Rates choice's line speed up Lead's six, a target: smaller overtakes after it (TS-133)
  const overtakes = [asked, ...Object.values(REJOIN_CLOSURE_KT).filter((kt) => kt < asked).sort((a, b) => b - a)];
  for (const overtakeKt of overtakes) {
    for (const cutDeg of STRAIGHT_REJOIN.cutsDeg) {
      for (const aimFt of STRAIGHT_REJOIN.aimsFt) {
        const flown = flyStraightRejoinWith({ lead, wing, rec, s, to, sTo, spacingFt, blockFt, t0, cutDeg, aimFt, overtakeKt });
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
    note: `${fromWord}${fromSide} to ${label}${sideWord}: straight-ahead rejoin. Lead flies straight on at ${KIAS_OUTSIDE_LAB} KIAS. #2 goes to full power and cuts up to ${best.cutDeg}° toward Lead's six, falling back as he turns, onto it about ${Math.round(part.sixFt / 50) * 50} ft back, just below Lead's wake (EFIG p.371). There he holds at least ${KIAS_OUTSIDE_LAB + best.overtakeKt} KIAS${best.overtakeKt < asked ? ` (${KIAS_OUTSIDE_LAB + asked} would put him ahead of Lead's 3/9 line from here)` : ''}, takes it off to ${TURNING_REJOIN.stableKt[0]}-${TURNING_REJOIN.stableKt[1]} KIAS over Lead by ${TURNING_REJOIN.windowFarFt}-${TURNING_REJOIN.windowNearFt} ft behind him (the window, TS-110), and from about ${STRAIGHT_AHEAD.vectorAtFt} ft takes the small vector to the ${sideTo} and flows ${end} at ${closureNow().kt} kt (SMM 12.26 paras 62-63, Fig 12.17).`,
    label: `${label}${sideWord}`,
    flying: `${fromWord}${fromSide} to ${label}${sideWord} (straight-ahead rejoin)`,
    from: from.key,
    fromSide: s,
    to,
    side: sTo,
    rejoinKind: 'straight',
    leadTurnDeg: 0,
    laneFwdFt: run.laneFwdFt,
    laneWarnFt: run.laneFwdFt > best.slotFwdFt + TURNING_REJOIN.laneTolFt ? run.laneFwdFt - best.slotFwdFt : null,
    maxBankDeg: Math.max(part.maxBankDeg, run.maxBankDeg),
    judged,
    endSec: t0 + best.durationSec,
    rejoining: true,
    handOverSec: null,
  };
}
