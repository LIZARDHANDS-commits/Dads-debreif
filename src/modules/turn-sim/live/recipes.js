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
import { phase } from './tracker.js';
import { fwShapeNow, pairSlot } from './slots.js';
import { REJOIN, STOP_KT, FW_FOLLOW } from './tuning.js';
import { KT_TO_FTPS } from '../../../core/units.js';
import { fwGoal } from './formation-turns.js';
import { fwSwitch } from './fw-switch.js';

// ---- the legs (phases): the tracker's recipes for each move --------------------------------------

/** A station change in close formation (SMM 12.20 paras 44-47): about 5 kt, wings level but for a degree or two of heading. */
export const slide = (slot, over = {}) => phase(slot, { advanceTol: 6, ...over });
/**
 * A station change's corner or end point (SMM 12.20 para 45: "stabilize in this position", "stabilize directly behind the
 * echelon position"). Stabilize means under control, not stopped (Patrick 6 Oct 05:29Z: "can be moving 5 knots thru
 * corners"): #2 flows through it once within CORNER_FLOW_FT and no faster against it than STOP_KT (Patrick 20:41Z: 5
 * knots). Until V2.128 he stopped on it and held 2 s. The 5 ft is an estimate.
 */
const CORNER_FLOW_FT = 5;
export const stopAt = (slot, over = {}) => slide(slot, { fwdRate: 5, advanceTol: CORNER_FLOW_FT, stopFtps: STOP_KT * KT_TO_FTPS, dwellSec: 0, ...over });
/**
 * The corner behind a close slot (SMM 12.20 para 45; Figs 12.12-12.13): back until #2's nose is at least 10 ft behind Lead's
 * tail (line astern's own spacing, plus 12 ft so it does not fall short: an estimate), at the slot's own lateral, and low
 * enough for the tail to pass below the prop wash (line astern's height: an estimate).
 */
export const cornerBehind = (slot, spacingFt) => {
  const astern = pairSlot('astern', 0, spacingFt);
  return { fwd: astern.fwd - 12, left: slot.left, alt: astern.alt };
};
/** Drop back slowly (SMM 16.32 para 92): a few knots slower than Lead. */
export const dropBack = (slot, over = {}) => phase(slot, { fwdRate: 12, latRate: 12, vrel0: 14, advanceTol: 25, finalTol: 6, bankCapDeg: 20, ...over });
/**
 * Echelon, route or line astern to fighting wing, expeditious (Patrick 19:03Z: "take ~7-15 seconds", TS-55): the slot is chased at
 * once with up to 20 KIAS under or over Lead, 45° bank, and the height change over the first 6 s. All the rates are estimates.
 */
export const sweepOut = (slot, over = {}) => phase(slot, { fwdRate: Infinity, latRate: Infinity, vrel0: 30, kcap: 0.1, d0: 50, vrelMax: 200, decel: 3, bankCapDeg: 45, overtakeKias: 20, undertakeKias: 20, advanceTol: 25, finalTol: 6, altSec: 6, ...over });
/** Close from fighting wing through route (SMM 16.15 para 38; AFM7 p.18): 10-20 KIAS overtake, slowing to about 5 kt at route. */
export const closeThrough = (slot, over = {}) => phase(slot, { fwdRate: 40, latRate: 40, vrel0: 8, kcap: 0.05, d0: 100, vrelMax: 50, overtakeKias: 20, advanceTol: 6, bankCapDeg: 25, ...over });
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
    phases.push(stopAt(corner(at, side)), stopAt(corner(at, sTo)), slide(slot(at, sTo), { fwdRate: 5 }));
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
      phases.push(phase({ fwd: -fwShapeNow().rangeFt, left: 0, alt: fw.alt }, { ...FW_FOLLOW, ...fwSwitch(sTo) }));
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
      // Echelon to line astern (SMM 12.20 para 46): the first half of the crossover, stopping directly astern (slightly aft,
      // the corner's spacing), then adjusting power to move up into position.
      const astern = slot('astern', 0);
      if (at !== 'astern') phases.push(stopAt(corner(at, side)), stopAt({ ...corner(at, side), left: 0 }));
      phases.push(slide(astern));
    } else if (at === 'astern') {
      // Line astern to echelon (SMM 12.20 para 47): the latter part of the crossover: across to directly behind the slot and
      // stop, then forward and up into it.
      phases.push(stopAt(corner(to, sTo)), slide(slot(to, sTo), { fwdRate: 5 }));
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
