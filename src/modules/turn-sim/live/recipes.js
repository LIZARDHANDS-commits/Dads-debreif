// The tracker's recipes for each 2-ship move (clean-up step 3, from transitions.js): the legs (phases) a change of formation
// is flown as, each a tracker phase (tracker.js phase) with the move's own settings, and legsFor, the legs from one
// formation to another by the manuals' routes. The planners (transitions.js planGoTo, line-moves.js, the rejoins,
// replan.js) and the 4-ship's (four-close.js, four-rejoin.js, four-open.js, four-legs.js) build their legs from these.
//
// Sources (page references only): SMM 12.4 paras 11-12 (echelon), 12.5 para 13 (line astern),
// 12.6 para 15 (route), 12.20 paras 44-47 (station changes), 12.23 para 53 (200 KIAS),
// 12.24 paras 54-59 (turning rejoin), 12.26 paras 62-63 (straight-ahead rejoin), 12.27 para 65
// (overshoot, never at or above Lead's height), 12.29 para 69 (fighting wing), 16.15 para 38
// and AFM7 brief p.18 (close through route), 16.18 paras 49-51 (line abreast, entry),
// 16.20 paras 65-66 and Figs 16.24-16.25 (rejoins from line abreast), 16.32 para 92 and 16.38
// para 105 (drop back to fighting wing), EFIG p.371 and p.374 (overtake). Patrick 4 Oct 2026
// 11:08Z-11:09Z (200 KIAS outside line abreast, Lead turns into #2, speed only in
// transitions) and 11:45Z (wording agreed). Numbers with no manual or ruling behind them are
// labelled "estimate" beside them.
import { phase, runTracker } from './tracker.js';
import { FORMATIONS, fwShapeNow, pairSlot } from './slots.js';
import { REJOIN, STOP_KT, FW_FOLLOW, KIAS_OUTSIDE_LAB, KIAS_LAB, TRACKER, CLOSE_SHAPING } from './tuning.js';
import { KT_TO_FTPS } from '../../../core/units.js';
import { fwGoal } from './formation-turns.js';
import { fwSwitch } from './fw-switch.js';
import { classify, judge } from './judge.js';
import { onClosure } from './hand-over.js';
import { recordFlight, speedSeg } from './replay.js';
import { describe, CHANGE_LIMIT_SEC } from './transitions.js';
import { relativeTo, turnSeg, DEG } from './manoeuvres.js';
import { STEP_SEC, stepAircraft, copyAircraft } from './flight.js';
import { wrapPi } from '../../../core/angles.js';
import { bankDegFromTurnRate } from '../../../core/flight-math.js';

// ---- the legs (phases): the tracker's recipes for each move --------------------------------------

/** A station change in close formation (SMM 12.20 paras 44-47): nominal ~2.5° bank, 5 kt lateral drift, subtle power trim. */
export const slide = (slot, over = {}) => phase(slot, {
  latRate: CLOSE_SHAPING.targetLateralFtps,
  fwdRate: 8,
  targetBankDeg: CLOSE_SHAPING.targetBankDeg,
  bankCapDeg: CLOSE_SHAPING.envelopeBankCapDeg,
  targetOvertakeKt: CLOSE_SHAPING.targetOvertakeKt,
  targetUndertakeKt: CLOSE_SHAPING.targetUndertakeKt,
  overtakeKias: CLOSE_SHAPING.envelopeMaxOvertakeKt,
  undertakeKias: CLOSE_SHAPING.envelopeMaxUndertakeKt,
  advanceTol: 6,
  ...over,
});
/**
 * A station change's corner or end point (SMM 12.20 para 45: "stabilize in this position", "stabilize directly behind the
 * echelon position"). Stabilize means under control, not stopped (Patrick 6 Oct 05:29Z: "can be moving 5 knots thru
 * corners"): #2 flows through it once within CORNER_FLOW_FT and no faster against it than STOP_KT (Patrick 20:41Z: 5
 * knots).
 */
const CORNER_FLOW_FT = 5;
export const stopAt = (slot, over = {}) => slide(slot, {
  fwdRate: 6,
  latRate: CLOSE_SHAPING.targetLateralFtps,
  advanceTol: CORNER_FLOW_FT,
  stopFtps: STOP_KT * KT_TO_FTPS,
  dwellSec: 0,
  ...over,
});
/**
 * The corner behind a close slot (SMM 12.20 para 45; Figs 12.12-12.13): back until #2's nose is at least 10 ft behind Lead's
 * tail (line astern's own spacing, plus 12 ft so it does not fall short: an estimate), at the slot's own lateral, and low
 * enough for the tail to pass below the prop wash (line astern's height: an estimate).
 */
export const cornerBehind = (slot, spacingFt) => {
  const astern = pairSlot('astern', 0, spacingFt);
  return {
    fwd: astern.fwd - CLOSE_SHAPING.wakeClearanceAftFt,
    left: slot.left,
    alt: astern.alt - (CLOSE_SHAPING.wakeClearanceDownFt - 10),
  };
};
/** Drop back slowly (SMM 16.32 para 92): subtle power trim (2-3 kt slower than Lead), gentle bank. */
export const dropBack = (slot, over = {}) => phase(slot, {
  fwdRate: 8,
  latRate: CLOSE_SHAPING.targetLateralFtps,
  vrel0: 8,
  advanceTol: 15,
  finalTol: 6,
  targetBankDeg: CLOSE_SHAPING.targetBankDeg,
  bankCapDeg: CLOSE_SHAPING.envelopeBankCapDeg,
  targetUndertakeKt: CLOSE_SHAPING.targetUndertakeKt,
  undertakeKias: CLOSE_SHAPING.envelopeMaxUndertakeKt,
  overtakeKias: CLOSE_SHAPING.envelopeMaxOvertakeKt,
  ...over,
});
/**
 * Echelon, route or line astern to fighting wing, expeditious (Patrick 19:03Z: "take ~7-15 seconds", TS-55): the slot is chased at
 * once with up to 20 KIAS under or over Lead, 45° bank, and the height change over the first 6 s. All the rates are estimates.
 */
export const sweepOut = (slot, over = {}) => phase(slot, { fwdRate: Infinity, latRate: Infinity, vrel0: 30, kcap: 0.1, d0: 50, vrelMax: 200, decel: 3, bankCapDeg: 45, overtakeKias: 20, undertakeKias: 20, advanceTol: 25, finalTol: 6, altSec: 6, ...over });
/** Close from fighting wing through route (SMM 16.15 para 38; AFM7 p.18): gentle 2-3 kt overtake, 2.5° nominal bank target. */
export const closeThrough = (slot, over = {}) => phase(slot, {
  fwdRate: 10,
  latRate: CLOSE_SHAPING.targetLateralFtps,
  vrel0: 6,
  kcap: 0.02,
  d0: 100,
  vrelMax: 20,
  targetBankDeg: CLOSE_SHAPING.targetBankDeg,
  bankCapDeg: CLOSE_SHAPING.envelopeBankCapDeg,
  targetOvertakeKt: CLOSE_SHAPING.targetOvertakeKt,
  overtakeKias: CLOSE_SHAPING.envelopeMaxOvertakeKt,
  undertakeKias: CLOSE_SHAPING.envelopeMaxUndertakeKt,
  advanceTol: 6,
  ...over,
});
/** The rejoin to a formation (SMM 12.24, 16.20): the slot is chased at once, the closing speed falls with range, bank up to the cap. */
export const rejoinTo = (slot, over = {}) => phase(slot, { rejoin: true, fwdRate: Infinity, latRate: Infinity, vrel0: 25, kcap: 0.1, d0: 500, vrelMax: 260, decel: 3, bankCapDeg: REJOIN.bankCapDeg, overtakeKias: REJOIN.overtakeKias, undertakeKias: 25, advanceTol: 40, finalTol: 3, altSec: 10, ...over });
/** Entry to line abreast (SMM 16.18 para 51): #2 turns away 20-40° to open out while Lead holds 220 KIAS. */
export const openOut = (slot, over = {}) => phase(slot, { fwdRate: 40, latRate: 150, vrel0: 40, kcap: 0.1, d0: 300, vrelMax: 220, decel: 2, bankCapDeg: 45, overtakeKias: 25, undertakeKias: 15, advanceTol: 30, finalTol: 25, ...over });

/** The straight-ahead rejoin's places in feet, in the frame of the aircraft rejoined on (estimates, see straightAhead). */
export const STRAIGHT_AHEAD = {
  sixFt: -1000, // line up on the six about 1,000 ft back (SMM Fig 12.17, point 1; Patrick's card "1,000 ft", 4 Oct 19:54Z)
  belowWakeFt: -20, // "fly just below lead's wake" (EFIG p.371); 20 ft is an estimate
  closeTowardFt: -150, // the closing leg's aim, ahead on the six line, so the closure holds until the vector point (estimate)
  vectorAtFt: 500, // "at approximately 500 ft" the small vector toward the echelon side (Fig 12.17, point 2; SMM 12.26 para 63)
};

/**
 * A straight-ahead rejoin from fighting wing to route (SMM 12.26 paras 62-63, Fig 12.17; EFIG p.371): line up on the six of the
 * aircraft rejoined on, about 1,000 ft back and just below its wake (Fig 12.17, point 1); close with 20-30 KIAS overtake (EFIG
 * p.371); from about 500 ft behind (point 2) take a small vector to the side wanted, which aims slightly away from it, reduce
 * the overtake and stabilise in route (point 3). The caller then moves up the wing-tip line to echelon (point 4). at(fwd, left,
 * alt) turns a place in the frame of the aircraft rejoined on into a phase slot; route is the route slot itself; over (e.g.
 * { track }) goes on every phase. holdLineUpUntil: a formation time before which the wingman stays lined up at 1,000 ft
 * instead of closing (the 4-ship: safe separation until the aircraft ahead is stable, SMM 16.34 para 95; AFM7 brief p.21).
 * @param {(fwd: number, left: number, alt: number) => { fwd: number, left: number, alt: number }} at
 * @param {{ fwd: number, left: number, alt: number }} route
 * @param {{ endInRoute?: boolean, track?: number, holdLineUpUntil?: number }} [options]
 */
export function straightAhead(at, route, { endInRoute = false, holdLineUpUntil, ...over } = {}) {
  const A = STRAIGHT_AHEAD;
  const quick = { rejoin: true, fwdRate: Infinity, latRate: Infinity, decel: 2, undertakeKias: 15, ...over }; // a rejoin up to route (Patrick 06:09Z)
  return [
    phase(at(A.sixFt, 0, A.belowWakeFt), { ...quick, vrel0: 20, kcap: 0.05, d0: 50, vrelMax: 100, bankCapDeg: 30, overtakeKias: 15, advanceTol: 60, ...(holdLineUpUntil !== undefined ? { holdUntil: holdLineUpUntil } : {}) }),
    // close along the six line at about 21 KIAS overtake, inside EFIG p.371's 20-30, until the vector point
    phase(at(A.closeTowardFt, 0, A.belowWakeFt), { ...quick, vrel0: 36, kcap: 0, vrelMax: 50, decel: 3, bankCapDeg: 20, overtakeKias: 30, advanceTol: A.vectorAtFt + A.closeTowardFt }),
    // then route, closing level or slightly low (SMM 16.15 para 38) and slowing as it comes in
    closeThrough(endInRoute ? route : { ...route, alt: route.alt - 25 }, { rejoin: true, overtakeKias: 30, vrel0: 6, kcap: 0.04, decel: 1, advanceTol: 6, ...(endInRoute ? { finalTol: 1.5 } : {}), ...over }),
  ];
}

/**
 * The legs from one formation to another, as a list of phases, with #2 on side s now and sTo to end
 * (+1 left, -1 right). The route (design section 4): from line abreast (or a picture that fits nothing) it is a
 * rejoin to fighting wing first, the capture point (SMM 16.20 para 65), flown straight through it for the hot
 * rejoin to echelon (para 66); a change of side is made behind Lead in the formation the pair is then in (a close
 * formation never crosses in front of Lead, SMM 12.20 para 44b; "flow to the opposite side" in fighting wing,
 * SMM 12.29 para 69); then the close-formation legs, or the opening out into line abreast (SMM 16.18 para 51).
 */
export function legsFor(from, s, to, sTo, spacingFt) {
  const slot = (key, side) => pairSlot(key, side, spacingFt);
  const phases = [];
  let at = from;
  let side = s;

  if (at === 'lab' || at === 'other') {
    phases.push(rejoinTo(slot('fw', side), to === 'echelon' ? { advanceTol: 150 } : to === 'fw' ? {} : { advanceTol: 40 }));
    at = 'fw';
  }

  // Cross behind Lead to the other side, in the formation the pair is in. Fighting wing is crossed in place only when the target is
  // fighting wing or line abreast; for the close formations it closes first and crosses there, which is far quicker.
  // A close crossover (SMM 12.20 paras 44-45, Figs 12.12-12.13): back and down into the corner and stop; across at a steady
  // rate (a small heading change, slide's 8 ft/s: an estimate), passing slightly aft of line astern; stop directly behind
  // the new slot; then forward and up into it. The caller adds the last move.
  const corner = (key, side) => cornerBehind(slot(key, side), spacingFt);
  const crossClose = () => {
    phases.push(
      slide(corner(at, side), { fwdRate: 8, latRate: 6, advanceTol: 12 }),
      slide(corner(at, sTo), { fwdRate: 6, latRate: CLOSE_SHAPING.targetLateralFtps, advanceTol: 10 }),
      slide(slot(at, sTo), { fwdRate: 6, latRate: 6 }),
    );
    side = sTo;
  };
  let switched = false;
  const closeTarget = to === 'echelon' || to === 'route';
  if (at !== 'astern' && to !== 'astern' && side !== sTo && !(at === 'fw' && closeTarget)) {
    if (at === 'fw') {
      // The fast side switch (fw-switch.js, TS-102; Patrick 6 Oct 01:04Z): an S-turn behind Lead at the switch bank, power
      // back, into the far cone, where the band goal settles him (the whole cone, TS-75). Until V2.98: three slides at
      // 30 ft/s through the point astern.
      const fw = slot('fw', sTo);
      phases.push(phase({ fwd: -fwShapeNow().rangeFt, left: 0, alt: fw.alt }, {
        ...FW_FOLLOW,
        coneAlt: false,
        tactical: true,
        fwdRate: 80,
        latRate: 80,
        overtakeKias: 25,
        ...fwSwitch(sTo),
      }));
      if (to !== 'fw') phases.push(dropBack(fw, { advanceTol: 25 }));
      switched = true;
      side = sTo;
    } else {
      crossClose();
    }
  }

  if (to === 'lab') {
    phases.push(openOut(slot('lab', sTo)));
  } else if (to === 'fw') {
    const fw = slot('fw', sTo);
    if (at === 'fw') {
      if (!phases.length) return phases;
      if (!switched) phases.push(dropBack(fw, { advanceTol: 6, finalTol: 6, vrel0: 16 })); // after the switch he settles where he is in the cone
    } else {
      // drop back and sweep out in one expeditious move, about 7-15 s to the band (Patrick 19:03Z, TS-55); SMM 16.32 para 92 says
      // "slowly drop back", and Patrick's ruling wins (rule book, What wins). Speed changes stay near 2 kt/s.
      phases.push(sweepOut(fw));
    }
  } else {
    if (at === 'fw') {
      // The straight-ahead rejoin (Patrick 19:04Z, TS-55; SMM 12.26 paras 62-63 and Fig 12.17; EFIG p.371), on the side wanted.
      if (to !== 'astern') side = sTo;
      phases.push(...straightAhead((fwd, left, alt) => ({ fwd, left, alt }), slot('route', side), { endInRoute: to === 'route' }));
      at = 'route';
      if (to === 'route') return phases;
    }
    if (to === 'astern') {
      // Echelon to line astern (SMM 12.20 para 46): smooth transition under wake to directly astern, then settle
      const astern = slot('astern', 0);
      if (at !== 'astern') {
        phases.push(
          slide(corner(at, side), { fwdRate: 8, latRate: 6, advanceTol: 12 }),
          slide({ ...corner(at, side), left: 0 }, { fwdRate: 6, latRate: CLOSE_SHAPING.targetLateralFtps, advanceTol: 8 }),
        );
      }
      phases.push(slide(astern, { fwdRate: 5 }));
    } else if (at === 'astern') {
      // Line astern to echelon (SMM 12.20 para 47): slide across behind slot, then forward and up
      phases.push(
        slide(corner(to, sTo), { fwdRate: 6, latRate: CLOSE_SHAPING.targetLateralFtps, advanceTol: 10 }),
        slide(slot(to, sTo), { fwdRate: 6, latRate: 6 }),
      );
    } else if (at !== to || side !== sTo) {
      phases.push(slide(slot(to, sTo)));
    }
  }
  // Fighting wing's last leg ends anywhere in the cone, not on its one slot (Patrick 08:58Z: "the whole cone can be used";
  // V2.80's band, TS-80): the tracker aims for the nearest point of the cone, and inside it holds where he arrives (fwGoal).
  if (to === 'fw' && phases.length) {
    const last = phases[phases.length - 1];
    phases[phases.length - 1] = { ...last, coneAlt: true, goal: (L, W) => fwGoal(L, W, sTo, false) };
  }
  return phases;
}

/** How far out from Lead's straight track (ft, positive on side s) #2 is: Lead flies straight, so his track is a line. */
export function outFt(L, W, s) {
  return s * (-(W.xFt - L.xFt) * Math.sin(L.headingRad) + (W.yFt - L.yFt) * Math.cos(L.headingRad));
}

/** How far out #2 ends if he turns back parallel to Lead now at bankDeg (flight.js's own turn and roll-out, speed held). */
export function outAfterTurnBack(W, L, s, bankDeg, t) {
  const c = copyAircraft(W);
  const plan = { segments: [turnSeg(L.headingRad, -s, bankDeg)] };
  for (let i = 0; i < 400 && plan.segments.length; i++) stepAircraft(c, plan, t + i * STEP_SEC);
  return outFt(L, c, s);
}

/** The numbers of the held opening out move for four-open.js compatibility. */
export const OPEN_OUT_HELD = Object.freeze({
  banksDeg: Object.freeze([30, 45]),
  leadHolds: false,
  offHeadingsDeg: Object.freeze([15, 20, 25, 30, 35]),
  diveSec: 10,
  climbSec: 10,
  trimKtPerFt: 0.05,
  trimMaxKias: 25,
  parallelDeg: 0.5,
  startTol: Object.freeze({ kias: 5, headingDeg: 1, fwHeadingDeg: 5 }),
});

function openPursuit({ s, outAimFt, slotFwd, bankDeg, offDeg, startFt }) {
  const H = OPEN_OUT_HELD;
  const st = { leg: 'out', maxDone: false, turnBackT: null, doneT: null };
  const pursuit = (L, W, t) => {
    const rel = relativeTo(L, W);
    if (Math.hypot(rel.fwd, rel.left) < startFt - 5) return { abort: true };
    if (st.leg === 'out' && outAfterTurnBack(W, L, s, bankDeg, t) >= outAimFt) {
      st.leg = 'back';
      st.turnBackT = t;
    } else if (st.leg === 'back' && Math.abs(wrapPi(W.headingRad - L.headingRad)) < H.parallelDeg * DEG && Math.abs(W.bankDeg) < H.parallelDeg) st.leg = 'parallel';
    if (st.leg === 'parallel') {
      st.doneT = t;
      return { done: true };
    }
    const psiCmd = st.leg === 'out' ? wrapPi(L.headingRad + s * offDeg * DEG) : L.headingRad;
    const want = bankDegFromTurnRate(W.tasFtps, TRACKER.gain.heading * wrapPi(psiCmd - W.headingRad));
    const offNow = Math.abs(wrapPi(W.headingRad - L.headingRad));
    const trim = Math.max(-H.trimMaxKias, Math.min(H.trimMaxKias, -H.trimKtPerFt * (rel.fwd - slotFwd)));
    const aimKias = (st.leg === 'out' ? L.kias / Math.cos(offDeg * DEG) : L.kias / Math.cos(offNow)) + trim;
    if (W.kias >= aimKias) st.maxDone = true;
    return { psiCmd, kiasCmd: st.maxDone ? aimKias : Infinity, bankDeg: Math.max(-bankDeg, Math.min(bankDeg, want)), slowStage: 'power' };
  };
  return { pursuit, st };
}

function heldPhase(args, slot) {
  const held = openPursuit(args);
  return { held, phase: phase(slot, { pursuit: held.pursuit, pursuitEnds: true, bankCapDeg: args.bankDeg }) };
}

/** #2's held part alone against Lead's recorded straight flight, for four-open.js. */
export function flyOut({ wing, rec, s, outAimFt, slotFwd, bankDeg, offDeg, blockFt, t0, profile }) {
  const r0 = relativeTo(rec.at(0), wing);
  const { held, phase: ph } = heldPhase({ s, outAimFt, slotFwd, bankDeg, offDeg, startFt: Math.hypot(r0.fwd, r0.left) }, { fwd: slotFwd, left: s * outAimFt, alt: 0 });
  const run = runTracker({ refs: { ref: rec }, wing0: wing, t0, phases: [ph], profile, blockFt, maxSec: CHANGE_LIMIT_SEC });
  if (!run.ok || held.st.doneT === null || held.st.turnBackT === null) return null;
  return { points: run.points, steps: run.points.length, end: run.end.wing, accelKtps: run.accelKtps, maxBankDeg: run.maxBankDeg, laneFwdFt: run.laneFwdFt, turnBackStep: Math.round((held.st.turnBackT - t0) / STEP_SEC) };
}

/**
 * Echelon (or route) to fighting wing on the same side as a tracker recipe (Task 4: retired from echelon-to-fw.js).
 * Flown by sweepOut with fwGoal to settle in the cone expeditiously.
 */
export function planEchelonToFw(pair, to, options = {}, t0 = 0) {
  if (to !== 'fw' || pair.length !== 2) return null;
  const [lead, wing] = pair;
  const from = classify([lead, wing]);
  if (from.key !== 'echelon' && from.key !== 'route') return null;
  const s = from.side;
  const want = options.side ?? 'keep';
  const sTo = want === 'left' ? 1 : want === 'right' ? -1 : s;
  if (sTo !== s) return null;
  const straight = lead.bankDeg === 0 && lead.rollRateDps === 0 && Math.abs(lead.kias - KIAS_OUTSIDE_LAB) <= 0.5;
  const matched = Math.abs(wing.kias - lead.kias) <= 5 && Math.abs(wrapPi(wing.headingRad - lead.headingRad)) <= DEG;
  if (!straight || !matched) return null;
  const spacingFt = options.spacingFt ?? 6000;
  const blockFt = options.blockFt ?? 8000;
  const slot = pairSlot('fw', s, spacingFt);
  if (!slot) return null;
  const refs = { [lead.id]: recordFlight(lead, { segments: [] }, t0) };
  const phases = onClosure([sweepOut(slot, { coneAlt: true, goal: (L, W) => fwGoal(L, W, s, false) })]);
  const run = runTracker({ refs, wing0: wing, t0, phases, blockFt, maxSec: CHANGE_LIMIT_SEC });
  if (!run.ok) return null;
  const judged = judge([run.end.lead, run.end.wing], { key: 'fw' }, { spacingFt });
  if (!judged.inBand) return null;
  const durationSec = run.durationSec;
  const fromWord = FORMATIONS[from.key].label;
  const sideWord = s > 0 ? ' left' : ' right';
  const how = describe(from.key, 'fw', 'none');
  return {
    ok: true,
    plans: {
      [lead.id]: { segments: [] },
      [wing.id]: { segments: [{ kind: 'bankTrack', points: run.points }], profile: run.profile },
    },
    note: `${fromWord}${sideWord} to Fighting wing${sideWord}: ${how}. Expeditious tracker recipe with sweepOut to the cone, settled in about ${Math.round(durationSec)} s.`,
    label: `${FORMATIONS.fw.label}${sideWord}`,
    flying: `${fromWord}${sideWord} to ${FORMATIONS.fw.label}${sideWord} (${how})`,
    from: from.key,
    fromSide: s,
    to: 'fw',
    side: s,
    rejoinKind: 'none',
    leadTurnDeg: 0,
    laneFwdFt: run.laneFwdFt,
    maxBankDeg: run.maxBankDeg,
    judged,
    endSec: t0 + durationSec,
    rejoining: false,
    handOverSec: null,
    coneSec: run.times?.[0]?.arrive ?? t0 + durationSec,
  };
}

/**
 * Opening out at full power to line abreast on the same side as a tracker recipe (Task 4: retired from open-out.js).
 * Flown by openOut with energyIntent 'gain' to reach line abreast swiftly and smoothly.
 */
export function planOpenOut(pair, to, options = {}, t0 = 0) {
  if (to !== 'lab' || pair.length !== 2) return null;
  const [lead, wing] = pair;
  const from = classify([lead, wing]);
  if (from.key !== 'echelon' && from.key !== 'route' && from.key !== 'fw') return null;
  const s = from.side;
  const want = options.side ?? 'keep';
  const sTo = want === 'left' ? 1 : want === 'right' ? -1 : s;
  if (sTo !== s) return null;
  const straight = lead.bankDeg === 0 && lead.rollRateDps === 0;
  if (!straight) return null;
  const spacingFt = options.spacingFt ?? 6000;
  const blockFt = options.blockFt ?? 8000;
  const slot = pairSlot('lab', s, spacingFt);
  if (!slot) return null;
  const speedSegs = Math.abs(lead.kias - KIAS_LAB) > 0.5 ? [speedSeg(lead.kias, KIAS_LAB, blockFt)] : [];
  const leadRec = recordFlight(lead, { segments: speedSegs.map((x) => ({ ...x })) }, t0);
  const refs = { [lead.id]: leadRec };
  const phases = onClosure([openOut(slot, { energyIntent: 'gain' })]);
  const run = runTracker({ refs, wing0: wing, t0, phases, blockFt, maxSec: CHANGE_LIMIT_SEC });
  if (!run.ok) return null;
  const judged = judge([run.end.lead, run.end.wing], { key: 'lab' }, { spacingFt });
  if (!judged.inBand) return null;
  const durationSec = run.durationSec;
  const fromWord = FORMATIONS[from.key].label;
  const sideWord = s > 0 ? ' left' : ' right';
  const how = describe(from.key, 'lab', 'none');
  return {
    ok: true,
    plans: {
      [lead.id]: { segments: speedSegs.map((x) => ({ ...x })) },
      [wing.id]: { segments: [{ kind: 'bankTrack', points: run.points }], profile: run.profile },
    },
    note: `${fromWord}${sideWord} to Line abreast${sideWord}: ${how}. #2 sets MAX at the press (energy intent gain), then the tracker settles him in the band. Lead speeds up to ${KIAS_LAB} KIAS at the press. About ${Math.round(durationSec)} s.`,
    label: `${FORMATIONS.lab.label}${sideWord}`,
    flying: `${fromWord}${sideWord} to ${FORMATIONS.lab.label}${sideWord} (${how})`,
    from: from.key,
    fromSide: s,
    to: 'lab',
    side: s,
    rejoinKind: 'none',
    leadTurnDeg: 0,
    laneFwdFt: run.laneFwdFt,
    maxBankDeg: run.maxBankDeg,
    judged,
    endSec: t0 + durationSec,
    rejoining: false,
    handOverSec: null,
  };
}
