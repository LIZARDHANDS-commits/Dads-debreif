// The straight-ahead rejoin, flown the way a pilot flies it (TS-72; Patrick 5 Oct 08:40Z: "SARJ should start at full power
// until it gets back on leads six, then set an overtake. The geometry of moving makes it fall back"; the review's SARJ,
// turn-sim-review/fable-compiled.md section 3: the turning rejoin's planner with Lead flying straight). The 2-ship, from
// line abreast (the More option, SMM 16.20 para 65a) or fighting wing (the Rejoin kind's other option), to echelon, route or
// line astern. Lead flies straight on, slowing to 200 KIAS.
//
//  1. #2 goes to full power and cuts toward Lead's six line, flown as the ride (ride.js) with Lead not turning (refactor step
//     5): across it no faster than he could stop on it (STRAIGHT_REJOIN.stopShare), less as he nears it. Turning in costs
//     ground along Lead's track, so he falls back as he cuts (Patrick 08:40Z); full power keeps that small.
//  2. On Lead's six, just below his wake (EFIG p.371; SMM 12.26 para 62), he holds at least 220 KIAS (tuning.js
//     the Rates choice's line speed, lineKiasNow: a target, geometry first, TS-133; 220 for all until V2.149, TS-75), and over
//     the last 500 ft before the vector point eases to 15 kt over Lead, the middle of the window's 10-20 (TS-110; the ride's
//     ease, TURNING_REJOIN.rideEaseFromFt).
//  3. From about 500 ft back he takes the small vector toward the side wanted (SMM 12.26 para 63, Fig 12.17 point 2): the line
//     runs from there to route.
//  4. From the decision point, just behind route, the tracker (tracker.js) flows him through route on into the slot, the close
//     moves Patrick says work well (08:28Z).
// Chosen: the overtake asked, a smaller one only when it would put him ahead of Lead's 3/9 line. #2 is flown through the same
// flight.js step as Lead. Numbers are tuning.js STRAIGHT_REJOIN's and STRAIGHT_AHEAD's.
import { relativeTo } from './manoeuvres.js';
import { recordFlight, speedSeg } from './replay.js';
import { closeThrough, legsFor, STRAIGHT_AHEAD } from './recipes.js';
import { CHANGE_LIMIT_SEC } from './transitions.js';
import { classify, judge } from './judge.js';
import { FORMATIONS, pairSlot, sideFor, LANE, FW_LIMITS } from './slots.js';
import { IN_POSITION, KIAS_OUTSIDE_LAB, REJOIN_CLOSURE_KT, STRAIGHT_REJOIN, TURNING_REJOIN, closureNow, closeInFtps, lineKiasNow } from './tuning.js';
import { onClosure } from './closures.js';
import { STEP_SEC } from './flight.js';
import { trackPhases, phase } from './tracker.js';
import { KT_TO_FTPS as KT_FTPS, G_FTPS2 } from '../../../core/units.js';
import { wrapPi, DEG } from '../../../core/angles.js';

const dt = STEP_SEC;
const CLOSE_TARGETS = new Set(['echelon', 'route', 'astern']);

/**
 * The whole straight-ahead rejoin flown as a single continuous phase sequence by the tracker.
 * #2 cuts to Lead's six line, runs up it below Lead's wake to the vector point (500 ft back),
 * vectors to route, and flows into the final slot.
 */
function flyStraightRejoinWith({ lead, wing, rec, s, to, sTo, spacingFt, blockFt, t0, overtakeKt }) {
  const TR = TURNING_REJOIN;
  const A = STRAIGHT_AHEAD;
  const sRoute = sTo || s;
  const route = pairSlot('route', sRoute, spacingFt);
  const leadAlt = rec.at(0).altAboveFt;
  const wakeFt = leadAlt + A.belowWakeFt;

  const line = {
    u: { fwd: -1, left: 0 },
    nrm: { fwd: 0, left: 1 },
    at: (rel) => ({ along: -rel.fwd, cross: rel.left }),
  };

  // The ride (ride.js) with Lead not turning (refactor step 5): Lead's six line stands still in his frame. #2 closes on it
  // no faster than he could stop on it, the rest of his speed along it, falling back as he cuts (Patrick 08:40Z), at full
  // power until he is on it; he aims to join it about 1,000 ft back (Fig 12.17 point 1), or where he is if already 500-1,000
  // ft back, and rides up it at the overtake to the vector point, easing to the window's closure over the last 500 ft.
  // From a close start (behind Lead's 3/9 line and inside the fighting wing cone's far edge) he flies it as a close move:
  // bank in proportion to the cut and a gentle stop (STRAIGHT_REJOIN.closeHeadingTauSec, closeStopBankDeg; Fable's
  // recommendation 11 Oct, for Patrick's yes). With the line abreast numbers he rolled to 60° and hunted across the six.
  const rel0 = relativeTo(rec.at(0), wing);
  const along0 = -rel0.fwd;
  const close = along0 > 0 && Math.hypot(rel0.fwd, rel0.left) <= FW_LIMITS.rangeFt[1];
  const captureAt = close ? Math.min(-A.sixFt, Math.max(A.vectorAtFt, along0)) : -A.sixFt;
  const midKt = (TR.stableKt[0] + TR.stableKt[1]) / 2;
  const ridePhase = phase({ fwd: -A.vectorAtFt, left: 0, alt: wakeFt }, {
    kind: 'ride',
    straight: true,
    line,
    ...(close
      ? { stopFtps2: G_FTPS2 * Math.tan(STRAIGHT_REJOIN.closeStopBankDeg * DEG), tauSec: STRAIGHT_REJOIN.closeHeadingTauSec }
      : { stopFtps2: STRAIGHT_REJOIN.stopShare * G_FTPS2 * Math.tan(TR.bankCapDeg * DEG), roll: TR.pointRoll }), // from line abreast the turning rejoin's start roll, quick but smooth (Patrick 04:05Z)
    captureAt,
    captureFt: STRAIGHT_REJOIN.captureFt,
    windowFt: A.vectorAtFt,
    carrotWindowFt: A.vectorAtFt,
    bankCapDeg: TR.bankCapDeg,
    floorKias: KIAS_OUTSIDE_LAB,
    rideKias: KIAS_OUTSIDE_LAB + overtakeKt,
    easeFromFt: A.vectorAtFt + TR.rideEaseFromFt,
    easeKias: KIAS_OUTSIDE_LAB + midKt,
    initialPclMax: true,
    rejoin: true,
    stepDown: true,
  });

  const rest = legsFor('route', sRoute, to, sTo, spacingFt);
  const flowFtps = Math.min(closeInFtps(TR.decisionArriveRates), to === 'echelon' ? STRAIGHT_REJOIN.lineArriveKt * KT_FTPS : Infinity);
  const onLine = to === 'echelon';
  const legs = [closeThrough(route, rest.length ? { advanceTol: onLine ? STRAIGHT_REJOIN.lineFlowFt : TR.routeFlowFt } : {}), ...rest];
  const closePhases = onClosure(legs).map((p, i) => ({
    ...p,
    slot: { ...p.slot, alt: p.slot.alt + leadAlt },
    ...(i === 0 || onLine ? { closureFtps: Math.min(p.closureFtps, flowFtps) } : {}),
    // The planned run settles inside the judge's band, not on its edge: half of it (an estimate; Fable's fix, PR #939). At
    // the 5 ft it settled at, the run ended still banked and rolling, 4.9 ft off line on main and 5 ft once #2's roll built
    // its acceleration (TS-196), so the plan fell to the tracker's 117 s rejoin.
    ...(i === legs.length - 1 ? { finalTol: Math.min(p.finalTol, IN_POSITION.closeFt / 2) } : {}),
  }));

  const phases = [ridePhase, ...closePhases];
  const { run, profile } = trackPhases({
    refs: { [lead.id]: rec },
    wing0: wing,
    t0,
    phases,
    blockFt,
    init: { accelKtps: 0 },
    stopWhenSettled: false,
  });
  if (!run.ok) return null;

  // Settle time is the arrival at the final slot
  const settleT1 = run.times?.at(-1)?.t1 ?? (run.points.length * dt);
  const settleSteps = Math.min(run.points.length, Math.ceil(settleT1 / dt));
  const points = run.points.slice(0, settleSteps);

  // Replay check: verify 3/9 line and find sixFt
  const wingRec = recordFlight(wing, { segments: [{ kind: 'bankTrack', points }] }, t0);
  let sixFt = 1000;
  let foundSix = false;
  let cutDeg = 0; // the most he heads across Lead's track before he is on the six, for the card
  for (let i = 0; i < points.length; i++) {
    const L = rec.at(i);
    const W = wingRec.at(i);
    const rel = relativeTo(L, W);
    if (!foundSix) cutDeg = Math.max(cutDeg, Math.abs(wrapPi(W.headingRad - L.headingRad)) / DEG);
    if (!foundSix && Math.abs(rel.left) <= STRAIGHT_REJOIN.captureFt) {
      sixFt = -rel.fwd;
      foundSix = true;
    }
    // Safety bubble & 3/9 watch
    if (rel.fwd > 0 && Math.hypot(rel.fwd, rel.left) < LANE.rangeFt) return null;
  }

  // Must line up on Lead's six well back (Fig 12.17)
  if (!foundSix || sixFt < 400) return null;

  const slotFwdFt = Math.max(0, pairSlot(to, sTo || s, spacingFt).fwd);
  return {
    run: { ...run, points },
    profile,
    sixFt,
    cutDeg,
    slotFwdFt,
    maxBankDeg: run.maxBankDeg,
    laneFwdFt: run.laneFwdFt,
    durationSec: points.length * dt,
  };
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
    const flown = flyStraightRejoinWith({ lead, wing, rec, s, to, sTo, spacingFt, blockFt, t0, overtakeKt });
    if (flown) best = { ...flown, overtakeKt };
    if (best) break;
  }
  if (!best || best.durationSec > CHANGE_LIMIT_SEC) return null;
  const { run } = best;
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
    plans: {
      [lead.id]: { segments: leadSegs.map((x) => ({ ...x })) },
      [wing.id]: { segments: [{ kind: 'bankTrack', points: run.points }], profile: best.profile },
    },
    note: `${fromWord}${fromSide} to ${label}${sideWord}: straight-ahead rejoin. Lead flies straight on at ${KIAS_OUTSIDE_LAB} KIAS. #2 goes to full power and cuts up to ${Math.round(best.cutDeg / 5) * 5}° toward Lead's six, falling back as he turns, onto it about ${Math.round(best.sixFt / 50) * 50} ft back, just below Lead's wake (EFIG p.371). There he holds at least ${KIAS_OUTSIDE_LAB + best.overtakeKt} KIAS${best.overtakeKt < asked ? ` (${KIAS_OUTSIDE_LAB + asked} would put him ahead of Lead's 3/9 line from here)` : ''}, takes it off to ${TURNING_REJOIN.stableKt[0]}-${TURNING_REJOIN.stableKt[1]} KIAS over Lead by ${TURNING_REJOIN.windowFarFt}-${TURNING_REJOIN.windowNearFt} ft behind him (the window, TS-110), and from about ${STRAIGHT_AHEAD.vectorAtFt} ft takes the small vector to the ${sideTo} and flows ${end} at ${closureNow().kt} kt (SMM 12.26 paras 62-63, Fig 12.17).`,
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
    maxBankDeg: best.maxBankDeg,
    judged,
    endSec: t0 + best.durationSec,
    rejoining: true,
    handOverSec: null,
  };
}
