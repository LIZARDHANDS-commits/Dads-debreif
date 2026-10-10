// The turning rejoin, flown the way a pilot flies it (V2.63, TS-69; Patrick 5 Oct 08:12Z: "fast and effective like the SMM",
// "a more medium bank/power setting for a LONGER period"; card "Review, then build" 08:18Z; 08:20Z: "Keep with my overtake
// numbers"; 08:29Z: "realistic aircraft behaviour"; review turn-sim-review/rejoin-review-fable.md). One rule for every
// turning rejoin of the 2-ship, from line abreast (hot: #2 gets colder to reach the line) and from fighting wing (cold: he
// turns hotter to reach it). The straight-ahead rejoin (SARJ, straight-rejoin.js, TS-72) is the one that drops onto Lead's
// six and still flies the older line law (straight-rejoin.js); this one rides the line in Lead's frame (tracker.js rideAim).
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
import { recordFlight, speedSeg, dryRunT } from './replay.js';
import { closeThrough, rejoinTo, slide, stopAt, legsFor } from './recipes.js';
import { CHANGE_LIMIT_SEC } from './transitions.js';
import { classify, judge } from './judge.js';
import { FORMATIONS, FW_BAND, fwShapeNow, pairSlot, LENGTH_FT, sideFor, LANE } from './slots.js';
import { KIAS_OUTSIDE_LAB, REJOIN, REJOIN_CLOSURE_KT, TURNING_REJOIN, FW_FOLLOW, WING_BANKS, KINEMATIC, closureNow, closeInFtps, lineKiasNow } from './tuning.js';
import { onClosure, fromStep } from './hand-over.js';
import { leadTurnInto } from './lead-turn-in.js';
import { STEP_SEC, copyAircraft, SMOOTHER_CURVE_PEAK, smoother, smoothLegSec } from './flight.js';
import { RATE_SETS, CLOSE_SHAPING } from './rates.js';
import { laggedBank } from './kinematic.js';
import { trackTwice, runTracker, phase } from './tracker.js';
import { holdInPlane, heldPoses } from './formation-turns.js';
import { acrossSixLegs } from './replan.js';
import { stallBankDeg } from './slow-down.js';
import { turnRadiusFromBankFt } from '../../../core/flight-math.js';
import { G_FTPS2, KT_TO_FTPS } from '../../../core/units.js';
import { iasToTasKt } from '../../../core/t6-performance.js';

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
function tailLegs(s, to, sTo, spacingFt) {
  const rejoinOver = {
    rejoin: true,
    bankCapDeg: REJOIN.bankCapDeg,
    fwdRate: 40, // estimate: a little quicker than the close-formation 32 ft/s through route (Patrick's fix 8dafc84; no source yet)
    latRate: 40, // estimate, as above
    targetBankDeg: CLOSE_SHAPING.targetBankDeg,
    targetOvertakeKt: CLOSE_SHAPING.targetOvertakeKt,
  };
  if (to === 'fw') return [rejoinTo(pairSlot('fw', s, spacingFt)), ...(sTo !== s ? legsFor('fw', s, 'fw', sTo, spacingFt) : [])];
  const rSlot = pairSlot('route', sTo || s, spacingFt);
  const rest = legsFor('route', s, to, sTo, spacingFt);
  return [
    closeThrough(rSlot, { advanceTol: TURNING_REJOIN.routeFlowFt, ...rejoinOver }),
    ...(rest.length ? rest.map((l) => ({ ...l, ...rejoinOver, fwdRate: CLOSE_SHAPING.targetFwdFtps, latRate: CLOSE_SHAPING.targetLateralFtps })) : [slide(rSlot, rejoinOver)]),
  ];
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
  const rejoinOver = { rejoin: true, targetBankDeg: null, targetOvertakeKt: null, bankCapDeg: REJOIN.bankCapDeg };
  const legs = [stopAt(clear(out), rejoinOver)];
  if (to === 'astern') return [...legs, slide(slot('astern', 0), { fwdRate: 5, ...rejoinOver })];
  if (out === sTo) return [...legs, slide(slot(to, sTo), { fwdRate: 5, ...rejoinOver })];
  return [...legs, stopAt(clear(s), rejoinOver), slide(slot(to, s), { fwdRate: 5, ...rejoinOver })];
}

/**
 * The fighting wing cone's middle on side s, in Lead's frame (FW_BAND: 750 ft, 45°): where a turning rejoin to fighting wing
 * aims. The fastest arrival wins and a slight miss is accepted; the band is only the settle test, never the aim (Patrick
 * 10 Oct 2026 19:52Z; it had been moved to the 30° edge to suit the gauge, review 10 Oct 2.1b).
 */
function coneMiddle(s) {
  const r = (FW_BAND.rangeFt[0] + FW_BAND.rangeFt[1]) / 2;
  const sw = ((FW_BAND.sweepDeg[0] + FW_BAND.sweepDeg[1]) / 2) * DEG;
  return { fwd: -r * Math.sin(sw), left: s * r * Math.cos(sw) };
}

/** The first step from `from` at which a recorded flight has flown its whole plan (free), at most `cap`. */
function leadEndStep(rec, from, cap) {
  for (let n = from; n < cap; n++) if (rec.at(n).free) return n;
  return Math.max(from, cap);
}

/**
 * The whole rejoin as a single continuous tracker phase sequence: line intercept, canopy-X (or fighting wing
 * cone arrival with coneEase bank-matching), into close-in/cone phases with zero stitched handovers.
 */
export function flyTurningRejoinWith({ lead, wing, into, s, to, sTo, spacingFt, blockFt, t0, aimFt, bankCapDeg, overtakeKt, lowFloor, upFt = 0, minG = null, overshoot = false, xLaw = true, hardSec = 0, allowAcross = false, crossIn = false, maxWhenLow = true, limitSec = Infinity, holdSec = null }) {
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
  const startHigh = (wing.altAboveFt ?? 0) > (into.longRec.at(0).altAboveFt ?? 0) + 500;
  const initialPclMax = !startHigh && hardSec === 0 && upFt <= 500;

  // Single continuous tracker phase array
  const phases = [];
  let numApproachPhases = 0;
  if (to === 'fw') {
    if (hardSec > 0) {
      phases.push(phase({ fwd: 0, left: 0, alt: lineFt }, {
        pursuit: (L, W, t) => {
          const cap = Math.min(bankCapDeg, stallBankDeg(W.kias));
          return {
            bankDeg: -s * cap,
            slowStage: 'idleBoards',
            kiasCmd: floorKias,
            psiCmd: W.headingRad,
            done: t >= t0 + hardSec - 1e-9 || (relativeTo(L, W).fwd * Math.cos(45 * Math.PI/180) + relativeTo(L, W).left * s * Math.sin(45 * Math.PI/180)) < 1000,
          };
        },
        pursuitEnds: true,
        rejoin: true,
      }));
      numApproachPhases++;
    }
    // Followed by ride tracking into the fighting wing cone
    phases.push(phase({ fwd: 0, left: 0, alt: lineFt }, {
      kind: 'ride', slopedAlt: true,
      lineDeg: TR.lineDeg,
      side: s,
      captureAlongFt: initialRange < 2000 ? initialRange : undefined,
      windowFt: 1200,
      carrotWindowFt: 250,
      coneEase: true,
      decisionFt: 1000,
      coneEaseFarFt: 1500,
      captureFt: 250,
      bankCapDeg,
      floorKias: KIAS_OUTSIDE_LAB,
      initialPclMax: hardSec === 0,
      isFw: true,
      slowStage: 'power',
      rejoin: true,
    }));
    numApproachPhases++;
    // Followed by fighting wing cone tracking
    phases.push(phase({ fwd: 0, left: 0, alt: lineFt }, {
      ...FW_FOLLOW,
      isFw: true,
      side: sTo || s,
      goal: () => coneMiddle(sTo || s),
      coneAlt: true,
      coneEnergy: true,
      slowStage: 'power',
      bankCapDeg: WING_BANKS.fwFollowBankCapDeg ?? 45,
      rejoin: true,
      floorKias: leastKias,
    }));
  } else if (onX) {
    if (hardSec > 0) {
      phases.push(phase({ fwd: 0, left: 0, alt: lineFt }, {
        pursuit: (L, W, t) => {
          const cap = Math.min(bankCapDeg, stallBankDeg(W.kias));
          return {
            bankDeg: -s * cap,
            slowStage: 'idleBoards',
            kiasCmd: floorKias,
            psiCmd: W.headingRad,
            done: t >= t0 + hardSec - 1e-9 || (relativeTo(L, W).fwd * Math.cos(45 * Math.PI/180) + relativeTo(L, W).left * s * Math.sin(45 * Math.PI/180)) < 1000,
          };
        },
        pursuitEnds: true,
        rejoin: true,
      }));
      numApproachPhases++;
    }
    // The ride (Step 7): onto the 45° line along it and up it at 210 KIAS to the window, all in Lead's frame. It is the X
    // (Lead fixed on the canopy), so there is no separate X phase.
    phases.push(phase({ fwd: 0, left: 0, alt: lineFt }, {
      kind: 'ride', slopedAlt: true,
      lineDeg: TR.lineDeg,
      side: s,
      captureFt: TR.captureFt,
      bankCapDeg: REJOIN.bankCapDeg, // no bank cap, only the aircraft's own limits (Patrick 6 Oct 04:07Z "there is NO LIMIT on bank angle in formation"; 8 Oct 20:59 "Unrestricted bank")
      floorKias,
      initialPclMax: hardSec === 0,
      rejoin: true,
    }));
    numApproachPhases++;

    const flowFtps = closeInFtps(TR.decisionArriveRates);
    const onLead = (list) => list.map((p) => ({ ...p, slot: { ...p.slot, alt: p.slot.alt + leadAlt } }));
    if (overshoot) {
      phases.push(...onLead(onClosure(overshootLegs(s, to, sTo, spacingFt), { closeIn: true })).map((p, i) =>
        i === 0 ? { ...p, bankCapDeg: TR.overshootBankDeg } : p
      ));
    } else if (sTo !== s && sTo !== 0) {
      phases.push(...onLead(onClosure(acrossSixLegs(null, s, to, sTo, spacingFt), { closeIn: true })));
    } else {
      phases.push(...onLead(onClosure(tailLegs(s, to, sTo, spacingFt), { closeIn: true })).map((p, i) =>
        (i === 0 ? { ...p, closureFtps: Math.min(p.closureFtps, flowFtps) } : p)
      ));
    }
  } else {
    // 4-ship route fallback
    numApproachPhases = 1;
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
      initialPclMax: true,
      rejoin: true,
    }));
    const flowFtps = closeInFtps(TR.decisionArriveRates);
    const onLead = (list) => list.map((p) => ({ ...p, slot: { ...p.slot, alt: p.slot.alt + leadAlt } }));
    phases.push(...onLead(onClosure(tailLegs(s, to, sTo, spacingFt), { closeIn: true })).map((p, i) =>
      i === 0 ? { ...p, closureFtps: Math.min(p.closureFtps, flowFtps) } : p
    ));
  }

  // Away (TS-174): #2 starts on the outside of Lead's turn and crosses behind him to side s, so the wrong-side check only
  // starts once he has reached side s.
  if (crossIn) phases.forEach((p, i) => { if (p.side != null) phases[i] = { ...p, crossIn: true }; });
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
  const approachEndTime = first.run.times[numApproachPhases - 1]?.t1;
  const nPart = approachEndTime != null ? Math.max(1, Math.min(totalSteps, Math.round((approachEndTime - t0) / dt))) : totalSteps;

  const close = to !== 'fw';
  const firstPlan = { segments: [{ kind: 'bankTrack', points: first.run.points }], profile: first.profile };
  const firstRec = recordFlight(wing, firstPlan, t0);
  const wPart = firstRec.at(nPart);
  const relPart = relativeTo(into.longRec.at(nPart), wPart);
  const easeSec = close ? planeEaseSec(relPart, into.longRec.at(nPart)) : 0;

  let run = first.run;
  let profile = first.profile;
  let lp = into.planTo(totalSteps, null);
  let wingSegments = null;

  if (close) {
    lp = into.planTo(totalSteps + Math.ceil(easeSec / dt), RATE_SETS.close.echelonRoll);
    // The 4-ship (holdSec, four-rejoin.js twoTurning) flies off Lead's recorded turn with no segments: #2 holds in his
    // plane until Lead's flight ends (his rollout once the last wingman is in), at most holdSec. Until V2.219 he held for
    // none, flew straight on while Lead kept turning, and #3 could not settle (PR #703).
    const leadTotalSteps = holdSec != null ? leadEndStep(lp.rec, totalSteps, Math.round(holdSec / dt)) : Math.round(dryRunT(lead, { segments: lp.segments }, t0).durationSec / dt);
    const leadRemainingSteps = Math.max(0, leadTotalSteps - totalSteps);
    const W_settled = firstRec.at(totalSteps);
    const L_settled = lp.rec.at(totalSteps);
    const slot = pairSlot(to, sTo || s, spacingFt);
    const slotBody = { fwd: slot.fwd, left: slot.left, up: slot.alt };
    const leadRecFromSettle = fromStep(lp.rec, totalSteps);
    const { rel } = holdInPlane(leadRecFromSettle, L_settled, W_settled, slotBody, leadRemainingSteps);
    const holdSteps = Math.max(leadRemainingSteps, rel.length - 1);
    const poses = heldPoses(leadRecFromSettle, W_settled, rel, holdSteps);

    if ((totalSteps + poses.length) * dt > limitSec) return null;

    wingSegments = [
      { kind: 'bankTrack', points: first.run.points },
      { kind: 'poseTrack', poses },
    ];
    const fullWingRec = recordFlight(wing, { segments: wingSegments, profile: first.profile }, t0);
    const endStep = totalSteps + poses.length;
    const endWing = fullWingRec.at(endStep);
    const endLead = lp.rec.at(endStep);

    let laneFwdFt = first.run.laneFwdFt ?? -Infinity;
    poses.forEach((p, i) => {
      laneFwdFt = Math.max(laneFwdFt, relativeTo(lp.rec.at(totalSteps + i + 1), { xFt: p.x, yFt: p.y }).fwd);
    });
    let maxBank = first.run.maxBankDeg ?? 0;
    poses.forEach((p) => {
      maxBank = Math.max(maxBank, Math.abs(p.bank));
    });

    run = {
      ...first.run,
      points: first.run.points,
      end: { lead: endLead, wing: endWing },
      laneFwdFt,
      maxBankDeg: maxBank,
      laneOk: laneFwdFt <= (to === 'fw' ? Math.max(0, slot.fwd) + (LANE.marginFt ?? 100) : 0),
    };
    profile = first.profile;
  } else {
    lp = into.planTo(totalSteps, null);
    const second = runTracker({
      refs: { [lead.id]: lp.rec },
      wing0: wing,
      t0,
      phases,
      profile: profile0,
      blockFt,
      stopWhenSettled: false,
      maxSec: limitSec,
    });
    if (!second.ok) return null;
    run = second;
  }

  const nSplit = Math.min(nPart, run.points.length);
  const partPoints = run.points.slice(0, nSplit);
  const runPoints = run.points.slice(nSplit);

  let partMinKias = wing.kias;
  let partMaxBank = 0;
  let partMaxG = wing.g ?? 1;
  let partMinG = wing.g ?? 1;
  const lineDef = { nrm: { fwd: Math.cos(TR.lineDeg * DEG), left: s * Math.sin(TR.lineDeg * DEG) } };
  let minCross = Infinity;
  let onSide = !crossIn;
  for (let i = 0; i < partPoints.length; i++) {
    const pt = partPoints[i];
    if (pt[1] < partMinKias) partMinKias = pt[1];
    if (Math.abs(pt[0]) > partMaxBank) partMaxBank = Math.abs(pt[0]);
    
    const wPart = firstRec.at(i);
    const lPart = into.longRec.at(i);
    const rel = relativeTo(lPart, wPart);
    const cross = rel.fwd * lineDef.nrm.fwd + rel.left * lineDef.nrm.left;
    if (cross < minCross) minCross = cross;
    
    // Reject if it crosses Lead's six at all (Patrick's absolute rule)
    if (s * rel.left >= 0) onSide = true;
    if (!allowAcross && onSide && s * rel.left < -50) return null;
  }
  
  const lineKias = partPoints.length ? partPoints[partPoints.length - 1][1] : wing.kias;

  const part = {
    points: partPoints,
    steps: partPoints.length,
    end: copyAircraft(firstRec.at(nSplit)),
    maxBankDeg: partMaxBank,
    minKias: partMinKias,
    lineKias,
    maxG: partMaxG,
    minG: partMinG,
    ahead: !run.laneOk,
    stepDownOk: run.stepDownOk !== false,
    accelKtps: partPoints.length && partPoints[partPoints.length - 1][3] != null ? partPoints[partPoints.length - 1][3] : 0,
    rangeFt: Math.hypot(into.longRec.at(nSplit).xFt - firstRec.at(nSplit).xFt, into.longRec.at(nSplit).yFt - firstRec.at(nSplit).yFt),
    overKt: lineKias - KIAS_OUTSIDE_LAB, lineKias: lineKias,
    stable: true,
    establishedRange: first.run.establishedRange,
    rideEstablished: (to === 'fw' || first.run.rideEstablished) && lineKias <= (TURNING_REJOIN.rideKias ?? 210) + 5.5 && (to !== 'fw' || partMinKias >= 195),
  };

  const remainderRun = {
    ...run,
    points: runPoints,
  };

  const slotFwdFt = Math.max(0, pairSlot(to, sTo || s, spacingFt).fwd);
  const flownProfile = profile ?? profile0;
  const durationSec = close && wingSegments ? (totalSteps + wingSegments[1].poses.length) * dt : run.points.length * dt;
  return {
    part,
    run: remainderRun,
    slotFwdFt,
    profile: flownProfile,
    lp,
    durationSec,
    settleSec: totalSteps * dt, // when he is in his place, before the hold in Lead's plane through the rollout
    overshoot: onX && overshoot,
    wingSegments,
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
export function inLeadsPlane(wing, plan, leadRec, t0, from, steps, easeSec, targetAltFt = null) {
  const rec = recordFlight(wing, plan, t0);
  // His place follows Lead's bank with the close turns' lag (he lags the roll, SMM 12.19 para 43).
  const ref = laggedBank(leadRec, KINEMATIC.planeLagSec);
  const tilt = (n) => -relativeTo(ref.at(n), rec.at(n)).left * Math.sin(ref.at(n).bankDeg * DEG);
  const baseFromAlt = rec.at(from).altAboveFt;
  const alt = [];
  for (let n = 0; n <= steps; n++) {
    const ease = n < from ? 0 : smoother(Math.min(1, ((n - from) * dt) / easeSec));
    const baseAlt = targetAltFt != null && n >= from
      ? baseFromAlt + (targetAltFt - baseFromAlt) * ease
      : rec.at(n).altAboveFt;
    alt.push(baseAlt + tilt(n) * ease);
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
export function searchTurningRejoin({ lead, wing, into, s, to, sTo, spacingFt, blockFt, t0, hot, vertical = true, verticalMinG = null, xLaw = true, crossIn = false }) {
  // How far ahead down the line he aims: the one that brings him in soonest (Patrick 08:20Z: "find a way to make the most
  // efficient": smaller inputs for longer, or larger for shorter).
  // A medium bank first; more, up to the G rule, only when no medium-bank rejoin keeps him behind Lead's 3/9 line.
  // When even that can't keep him behind Lead's 3/9 line, the most overtake that can (the review's: fit the overtake to the
  // room; Student's 15 kt is the least): the note says which he flew.
  const slotFwdFt = Math.max(0, pairSlot(to, sTo || s, spacingFt)?.fwd ?? 0);
  const laneLimitFt = to === 'fw' ? slotFwdFt + (LANE.marginFt ?? 100) : 0;
  let best = null;
  let bestAny = null;
  // Down the line he aims for the Rates choice's line speed (lineKiasNow, TS-133: a target, geometry first; until V2.149 220 for all, Patrick 17:54Z, 17:55Z: "the minimum closure up the line
  // to be 220 knots"), or a smaller Rates overtake only when that one would put him ahead of Lead's 3/9 line (TS-75).
  const asked = lineKiasNow() - KIAS_OUTSIDE_LAB;
  // The ride (xLaw, the 2-ship) reads neither the overtake nor the aim, so it flies each only once (review 10 Oct 2.4;
  // Patrick 20:00Z (d)); the 4-ship's line law still searches them.
  const overtakes = xLaw ? [asked] : [asked, ...Object.values(REJOIN_CLOSURE_KT).filter((kt) => kt < asked).sort((a, b) => b - a)];
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
          for (const caps of [[REJOIN.bankCapDeg]]) {
            const aims = xLaw ? [TURNING_REJOIN.aimsFt[0]] : hot ? [...TURNING_REJOIN.aimsFt, TURNING_REJOIN.lagAimFt] : TURNING_REJOIN.aimsFt;
            for (const bankCapDeg of caps) {
              for (const aimFt of aims) {
                const bestEst = best?.part?.rideEstablished !== false;
                const limitSec = bestEst && best ? best.durationSec - BETTER_BY_SEC : Infinity;
                const flown = flyTurningRejoinWith({ lead, wing, into, s, to, sTo, spacingFt, blockFt, t0, aimFt, bankCapDeg, overtakeKt, lowFloor, overshoot, xLaw, hardSec: 0, allowAcross, crossIn, maxWhenLow, limitSec });
                if (flown) {
                  const laneOk = (flown.run?.laneFwdFt ?? -Infinity) <= laneLimitFt;
                  const est = flown.part?.rideEstablished !== false;
                  
                  if (laneOk) {
                    const bestEst = best?.part?.rideEstablished !== false;
                    if (!best || (est && !bestEst) || (est === bestEst && flown.durationSec < best.durationSec - BETTER_BY_SEC)) {
                      best = { ...flown, overtakeKt, lowFloor, aimFt, bankCapDeg, hardSec: 0, upFt: 0, allowAcross, maxWhenLow };
                    }
                  } else if (!best) {
                    const anyEst = bestAny?.part?.rideEstablished !== false;
                    if (!bestAny || (est && !anyEst) || (est === anyEst && flown.durationSec < bestAny.durationSec - BETTER_BY_SEC)) {
                      bestAny = { ...flown, overtakeKt, lowFloor, aimFt, bankCapDeg, hardSec: 0, upFt: 0, allowAcross, maxWhenLow };
                    }
                  }
                }
              }
              if (!best && hot && xLaw) {
                for (const hardSec of TURNING_REJOIN.hardPullsSec) {
                  const aimFt = aims[0];
                  const flown = flyTurningRejoinWith({ lead, wing, into, s, to, sTo, spacingFt, blockFt, t0, aimFt, bankCapDeg, overtakeKt, lowFloor, overshoot, xLaw, hardSec, allowAcross, crossIn, maxWhenLow, limitSec: Infinity });
                  if (flown) {
                    const laneOk = (flown.run?.laneFwdFt ?? -Infinity) <= laneLimitFt;
                    const est = flown.part?.rideEstablished !== false;
                    
                    if (laneOk) {
                      const bestEst = best?.part?.rideEstablished !== false;
                      if (!best || (est && !bestEst) || (est === bestEst && flown.durationSec < best.durationSec - BETTER_BY_SEC)) {
                        best = { ...flown, overtakeKt, lowFloor, aimFt, bankCapDeg, hardSec, upFt: 0, allowAcross, maxWhenLow };
                      }
                    } else if (!best) {
                      const anyEst = bestAny?.part?.rideEstablished !== false;
                      if (!bestAny || (est && !anyEst) || (est === anyEst && flown.durationSec < bestAny.durationSec - BETTER_BY_SEC)) {
                        bestAny = { ...flown, overtakeKt, lowFloor, aimFt, bankCapDeg, hardSec, upFt: 0, allowAcross, maxWhenLow };
                      }
                    }
                  }
                }
              }
              if (best && best.part?.rideEstablished !== false) break;
            }
            if (best && best.part?.rideEstablished !== false) break;
          }
          if (best && best.part?.rideEstablished !== false) break;
        }
        if (best && best.part?.rideEstablished !== false) break;
      }
      if (best && best.part?.rideEstablished !== false) break;
    }
    if (best && best.part?.rideEstablished !== false) break;
  }
  // The vertical as a candidate (TS-82): the same rejoin with #2 going high early and coming down onto the line, flown only
  // when it brings him in sooner, by more than the chooser's half-second tie, within the G rule with its pull charged.
  if (best && vertical) {
    for (const upFt of TURNING_REJOIN.verticalUpFt) {
      const limitSec = best.durationSec - (best.part?.rideEstablished === false ? 0 : BETTER_BY_SEC);
      const flown = flyTurningRejoinWith({ lead, wing, into, s, to, sTo, spacingFt, blockFt, t0, aimFt: best.aimFt, bankCapDeg: best.bankCapDeg, overtakeKt: best.overtakeKt, lowFloor: best.lowFloor, upFt, minG: verticalMinG, overshoot: best.overshoot, xLaw, hardSec: best.hardSec, allowAcross: best.allowAcross, crossIn, maxWhenLow: best.maxWhenLow, limitSec });
      const laneOk = flown ? (flown.run?.laneFwdFt ?? -Infinity) <= laneLimitFt : false;
      if (flown && laneOk && flown.part?.stepDownOk !== false && flown.run?.stepDownOk !== false) {
        const est = flown.part?.rideEstablished !== false;
        const bestEst = best.part?.rideEstablished !== false;
        if ((est && !bestEst) || (est === bestEst && flown.durationSec < best.durationSec - BETTER_BY_SEC)) {
          best = { ...flown, overtakeKt: best.overtakeKt, lowFloor: best.lowFloor, aimFt: best.aimFt, bankCapDeg: best.bankCapDeg, hardSec: best.hardSec, upFt, allowAcross: best.allowAcross, maxWhenLow: best.maxWhenLow };
        }
      }
    }
  }
  return best || bestAny;
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
  // From trail after a break and rejoin (TS-175) too: #2 sits behind Lead, his side the echelon side he broke from (TS-174).
  const trail = from.key === 'other' && options.trailSide ? options.trailSide : 0;
  if (!(from.key === 'lab' || trail || (from.key === 'fw' && to !== 'fw'))) return null;
  const spacingFt = options.spacingFt ?? 6000;
  const blockFt = options.blockFt ?? 8000;
  const s0 = trail || from.side || Math.sign(relativeTo(lead, wing).left) || (options.lastSide ?? -1);
  // Into or Away (TS-174, Patrick 10 Oct 2026 20:37Z): Into, Lead turns toward #2's side; Away, he turns away from it and #2
  // crosses behind him to join on the inside of the turn (SMM 16.20 para 65b(1), Fig 16.24). s is the side #2 joins on.
  const away = options.turn === 'away';
  const s = away ? -s0 : s0;
  const want = options.side ?? 'keep';
  const sTo = sideFor(to, want, s);
  const pre = Math.abs(lead.kias - KIAS_OUTSIDE_LAB) > 0.5 ? [{ ...speedSeg(lead.kias, KIAS_OUTSIDE_LAB, blockFt), withNext: true }] : [];
  const into = leadTurnInto({ lead, pre, s, bankDeg: REJOIN.leadBankDeg, t0, record: recordFlight });

  const hot = from.key === 'lab' || Boolean(trail);
  // No vertical candidate on the 2-ship ride: the ride flies its own height (the line 50 ft low), so it never flew (TS-82
  // retired for the ride, Patrick 10 Oct 20:00Z (d)).
  const best = searchTurningRejoin({ lead, wing, into, s, to, sTo, spacingFt, blockFt, t0, hot, vertical: false, crossIn: away || Boolean(trail) });
  const asked = lineKiasNow() - KIAS_OUTSIDE_LAB;
  if (!best || best.durationSec > CHANGE_LIMIT_SEC) return null;
  const { part, run, profile, lp } = best;
  const judged = judge([run.end.lead, run.end.wing], { key: to }, { spacingFt });
  if (!judged.inBand) return null;

  const label = FORMATIONS[to].label;
  const sideWord = to === 'astern' ? '' : sTo > 0 ? ' left' : ' right';
  const fromWord = trail ? 'Trail' : FORMATIONS[from.key].label;
  const fromSide = s0 > 0 ? ' left' : ' right';
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
    return `${fromWord}${fromSide} to ${label}${sideWord}: ${how}. Lead turns ${away ? 'away from' : 'into'} #2 at ${REJOIN.leadBankDeg}° of bank${slowing.replace(/,$/, '')} (SMM 16.20 para 65b). #2 ${hot ? `cuts across onto the rejoin line, and from ${TURNING_REJOIN.xFromFt} ft in he ` : ''}puts Lead on the X, fin and far wing crossed at his ${clock}, slightly low, and holds him fixed on the canopy (SMM 12.24 paras 56-57, Fig 12.15). ${speeds} ${tail}`;
  };
  return {
    ok: true,
    plans: {
      [lead.id]: { segments: lp.segments.map((x) => ({ ...x })) },
      [wing.id]: {
        segments: best.wingSegments
          ? best.wingSegments.map((s) => ({ ...s, points: s.points ? [...s.points] : undefined, poses: s.poses ? [...s.poses] : undefined }))
          : [{ kind: 'bankTrack', points: [...part.points, ...run.points] }],
        profile,
      },
    },
    note: to !== 'fw' ? xNote() : `${fromWord}${fromSide} to ${label}${sideWord}: ${how}. Lead turns ${away ? 'away from' : 'into'} #2 at ${REJOIN.leadBankDeg}° of bank${slowing} and holds it until #2 is in (${turnDeg}°; SMM 16.20 para 65b). #2 aims for ${KIAS_OUTSIDE_LAB + best.overtakeKt} KIAS down the line, ${best.overtakeKt} kt of overtake${best.overtakeKt < asked ? ` (${KIAS_OUTSIDE_LAB + asked} would put him ahead of Lead's 3/9 line from here)` : ''}, gets onto the rejoin line and holds it with Lead at his ${clock}, slightly low (SMM 12.24 paras 56-57); ${hot ? 'he starts hot and gets colder to reach it' : 'he starts cold and turns hotter to reach it'}. ${speeds}${best.upFt ? ` He goes ${best.upFt.toLocaleString('en-CA')} ft higher early and comes down onto the line (the vertical, TS-82).` : ''} From the decision point, where a stop with the torque floor and the boards just fits, he takes it out and flows ${end}.`,
    label: `${label}${sideWord}`,
    flying: `${fromWord}${fromSide} to ${label}${sideWord} (${how})`,
    from: from.key,
    fromSide: s,
    to,
    side: sTo,
    rejoinKind: 'into',
    turn: away ? 'away' : 'into',
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
