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
import { fixedLine, aheadWatch, sustainedBankDeg, sustainsBank } from './rejoin-law.js';
import { throttleAtTorque } from './power.js';
import { bankDegFromTurnRate, turnRadiusFromBankFt } from '../../../core/flight-math.js';
import { wrapPi } from '../../../core/angles.js';
import { G_FTPS2, KT_TO_FTPS } from '../../../core/units.js';
import { availableG, iasToTasKt } from '../../../core/t6-performance.js';

const dt = STEP_SEC;
/** A search try replaces the best so far only when quicker by more than this (the chooser's half-second tie, chooser.js TIE_SEC). */
const BETTER_BY_SEC = 0.5;


/** The closure the window's middle overtake gives on the X: along a 45° line about 1.4 times the overtake (estimate). */
const xArriveFtps = () => ((TURNING_REJOIN.stableKt[0] + TURNING_REJOIN.stableKt[1]) / 2) * KT_TO_FTPS * Math.SQRT2;



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
    const rSlot = pairSlot('route', sTo || s, spacingFt);
    const rest = legsFor('route', s, to, sTo, spacingFt);
    return [closeThrough(rSlot, rest.length ? { advanceTol: TURNING_REJOIN.routeFlowFt } : { advanceTol: TURNING_REJOIN.routeFlowFt }), ...(rest.length ? rest : [slide(rSlot)])];
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

/**
 * The whole rejoin as a single continuous tracker phase sequence: line intercept, canopy-X (or fighting wing
 * cone arrival with coneEase bank-matching), into close-in/cone phases with zero stitched handovers.
 */
export function flyTurningRejoinWith({ lead, wing, into, s, to, sTo, spacingFt, blockFt, t0, aimFt, bankCapDeg, overtakeKt, lowFloor, upFt = 0, minG = null, overshoot = false, xLaw = true, hardSec = 0, allowAcross = false, maxWhenLow = true, limitSec = Infinity }) {
  const TR = TURNING_REJOIN;
  const onX = to !== 'fw' && xLaw;
  const decisionFt = onX || to === 'fw' ? fwShapeNow().rangeFt : Math.abs(pairSlot('route', s, spacingFt).left) / Math.cos(TR.lineDeg * DEG);

  const leadR = turnRadiusFromBankFt(iasToTasKt(KIAS_OUTSIDE_LAB, blockFt) * KT_TO_FTPS, REJOIN.leadBankDeg);
  const placeR = Math.hypot(decisionFt * Math.sin(TR.lineDeg * DEG), leadR - decisionFt * Math.cos(TR.lineDeg * DEG));
  const leastKias = to === 'fw' ? Math.floor((KIAS_OUTSIDE_LAB * placeR) / leadR) : KIAS_OUTSIDE_LAB;
  const floorKias = lowFloor ? KIAS_OUTSIDE_LAB - TR.undertakeKias : Math.max(leastKias, KIAS_OUTSIDE_LAB);

  const leadAlt = into.longRec.at(0).altAboveFt;
  const lineFt = leadAlt + TR.lineUpFt;

  const upSec = upFt > 0 ? Math.max(TR.heightSec / 2, smoothLegSec(upFt, TR.heightG)) : 0;
  const downSec = upFt > 0 ? Math.max(TR.heightSec / 2, smoothLegSec(wing.altAboveFt + upFt - lineFt, TR.heightG)) : 0;
  const dropFt = wing.altAboveFt - lineFt;
  const steadySec = upFt > 0 ? upSec + downSec : Math.max(TR.heightSec, smoothLegSec(dropFt, TR.heightG));
  const heightLeg = (sec) => {
    if (upFt > 0) {
      const tUp = t0 + (sec * upSec) / steadySec;
      return [{ t0, t1: tUp, fromFt: wing.altAboveFt, toFt: wing.altAboveFt + upFt }, { t0: tUp, t1: t0 + sec, fromFt: wing.altAboveFt + upFt, toFt: lineFt }];
    }
    return Math.abs(wing.altAboveFt - lineFt) > 0.5 ? [{ t0, t1: t0 + sec, fromFt: wing.altAboveFt, toFt: lineFt }] : [];
  };

  const initialRange = Math.hypot(into.longRec.at(0).xFt - wing.xFt, into.longRec.at(0).yFt - wing.yFt);

  // Single continuous tracker phase array
  const phases = [];
  if (to === 'fw') {
    // Line intercept phase with coneEase bank-matching to prevent cone blow-through
    phases.push(phase({ fwd: 0, left: 0, alt: lineFt }, {
      kind: 'line',
      lineDeg: TR.lineDeg,
      side: s,
      aimFt,
      approachDeg: TR.approachDeg,
      tauSec: TR.lineTauSec,
      captureFt: TR.captureFt,
      decisionFt,
      coneEase: true,
      bankCapDeg,
      overtakeKt,
      floorKias,
      arriveFtps: TR.fwArriveFtps,
      slowFtps2: TR.slowFtps2,
      rejoin: true,
    }));
    // Followed by fighting wing cone tracking
    phases.push(...onClosure([
      phase({ fwd: 0, left: 0, alt: lineFt }, {
        ...FW_FOLLOW,
        goal: (L, W) => fwGoal(L, W, s, false),
        coneAlt: false,
        rejoin: true,
      }),
    ], { closeIn: true }));
  } else if (onX) {
    if (initialRange > TR.xFromFt) {
      phases.push(phase({ fwd: 0, left: 0, alt: lineFt }, {
        kind: 'line',
        lineDeg: TR.lineDeg,
        side: s,
        aimFt,
        approachDeg: TR.approachDeg,
        tauSec: TR.lineTauSec,
        captureFt: TR.captureFt,
        decisionFt: TR.xFromFt,
        bankCapDeg,
        overtakeKt,
        floorKias,
        arriveFtps: xArriveFtps(),
        slowFtps2: TR.slowFtps2,
        rejoin: true,
      }));
    }
    phases.push(phase({ fwd: 0, left: 0, alt: lineFt }, {
      kind: 'x',
      lineDeg: TR.lineDeg,
      side: s,
      tauSec: TR.bearingTauSec,
      bankCapDeg,
      farFt: TR.windowFarFt,
      nearFt: TR.windowNearFt,
      overtakeKt,
      floorKias,
      rejoin: true,
    }));

    const flowFtps = closeInFtps(TR.decisionArriveRates);
    const onLead = (list) => list.map((p) => ({ ...p, slot: { ...p.slot, alt: p.slot.alt + leadAlt } }));
    if (overshoot) {
      phases.push(...onLead(onClosure(overshootLegs(s, to, sTo, spacingFt))).map((p, i) =>
        i === 0 ? { ...p, bankCapDeg: TR.overshootBankDeg } : p
      ));
    } else if (sTo !== s && sTo !== 0) {
      phases.push(...onLead(onClosure(acrossSixLegs(null, s, to, sTo, spacingFt))));
    } else {
      phases.push(...onLead(onClosure(tailLegs(s, to, sTo, spacingFt))).map((p, i) =>
        ({ ...p, slowStage: 'boards', ...(i === 0 ? { closureFtps: Math.min(p.closureFtps, flowFtps) } : {}) })
      ));
    }
  } else {
    // 4-ship route fallback
    phases.push(phase({ fwd: 0, left: 0, alt: lineFt }, {
      kind: 'line',
      lineDeg: TR.lineDeg,
      side: s,
      aimFt,
      approachDeg: TR.approachDeg,
      tauSec: TR.lineTauSec,
      captureFt: TR.captureFt,
      decisionFt,
      bankCapDeg,
      overtakeKt,
      floorKias,
      arriveFtps: Math.min(closureNow().ftps, closeInFtps(TR.decisionArriveRates)),
      rejoin: true,
    }));
    const flowFtps = closeInFtps(TR.decisionArriveRates);
    const onLead = (list) => list.map((p) => ({ ...p, slot: { ...p.slot, alt: p.slot.alt + leadAlt } }));
    phases.push(...onLead(onClosure(tailLegs(s, to, sTo, spacingFt))).map((p, i) =>
      i === 0 ? { ...p, closureFtps: Math.min(p.closureFtps, flowFtps) } : p
    ));
  }

  const profile0 = heightLeg(steadySec);

  const first = trackTwice({
    refs: { [lead.id]: into.longRec },
    wing0: wing,
    t0,
    phases,
    blockFt,
    profile: profile0,
    stopWhenSettled: true,
    maxSec: limitSec,
  });

  if (!first.run.ok) return null;

  const totalSteps = first.run.points.length;
  const nPart = first.run.times[0]?.t1 != null ? Math.max(1, Math.min(totalSteps, Math.round((first.run.times[0].t1 - t0) / dt))) : totalSteps;

  const close = to !== 'fw';
  const firstPlan = { segments: [{ kind: 'bankTrack', points: first.run.points }], profile: first.profile };
  const firstRec = recordFlight(wing, firstPlan, t0);
  const wPart = firstRec.at(nPart);
  const relPart = relativeTo(into.longRec.at(nPart), wPart);
  const easeSec = close ? planeEaseSec(relPart, into.longRec.at(nPart)) : 0;
  const lp = into.planTo(totalSteps + Math.ceil(easeSec / dt), close ? RATE_SETS.close.echelonRoll : null);

  let { run, profile } = trackTwice({
    refs: { [lead.id]: lp.rec },
    wing0: wing,
    t0,
    phases,
    blockFt,
    profile: profile0,
    stopWhenSettled: false,
    maxSec: limitSec,
  });

  if (!run.ok) return null;

  if (close) {
    const inPlane = (r, prof) => inLeadsPlane(wing, { segments: [{ kind: 'bankTrack', points: r.points }], profile: prof }, lp.rec, t0, nPart, r.points.length, easeSec);
    const planeProfile = inPlane(run, profile);
    const again = runTracker({
      refs: { [lead.id]: lp.rec },
      wing0: wing,
      t0,
      phases,
      profile: planeProfile,
      blockFt,
    });
    if (again.ok) {
      run = again;
      profile = planeProfile;
    }
  }

  const nSplit = Math.min(nPart, run.points.length);
  const partPoints = run.points.slice(0, nSplit);
  const runPoints = run.points.slice(nSplit);

  let partMinKias = wing.kias;
  let partMaxBank = 0;
  let partMaxG = wing.g ?? 1;
  let partMinG = wing.g ?? 1;
  for (const pt of partPoints) {
    if (pt[1] < partMinKias) partMinKias = pt[1];
    if (Math.abs(pt[0]) > partMaxBank) partMaxBank = Math.abs(pt[0]);
  }
  const lineKias = partPoints.length ? partPoints[partPoints.length - 1][1] : wing.kias;

  const part = {
    points: partPoints,
    steps: partPoints.length,
    end: copyAircraft(run.end.wing),
    maxBankDeg: partMaxBank,
    minKias: partMinKias,
    lineKias,
    maxG: partMaxG,
    minG: partMinG,
    ahead: !run.laneOk,
    stepDownOk: run.stepDownOk !== false,
    accelKtps: partPoints.length && partPoints[partPoints.length - 1][3] != null ? partPoints[partPoints.length - 1][3] : 0,
    rangeFt: Math.hypot(into.longRec.at(nSplit).xFt - (run.end.wing.xFt ?? 0), into.longRec.at(nSplit).yFt - (run.end.wing.yFt ?? 0)),
    overKt: lineKias - KIAS_OUTSIDE_LAB,
    stable: true,
  };

  const remainderRun = {
    ...run,
    points: runPoints,
  };

  const slotFwdFt = Math.max(0, pairSlot(to, sTo || s, spacingFt).fwd);
  const flownProfile = profile ?? profile0;
  return {
    part,
    run: remainderRun,
    slotFwdFt,
    profile: flownProfile,
    lp,
    durationSec: run.points.length * dt,
    overshoot: onX && overshoot,
  };
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
            const tries = aims.map((aimFt) => ({ aimFt, hardSec: 0 }));
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
