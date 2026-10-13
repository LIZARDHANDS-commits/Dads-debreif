// The close-formation wingman's supervisor (B1, TS-226; spec 7b.2, 7b.6c, 7b.6d item 12): which job he is doing, from
// what he sees. The job list, each with a dead band so it never flickers:
//  - on station: within about a foot of his place; all controls together, coordinated, as pressures (Patrick 13 Oct
//    2026: "you stay in position by using coordination of all of the controls at once");
//  - a small move: a few feet off, up to about 10 ft (spec 7b.6: "he leaves that little bit in until he gets where he
//    wants, then walks the power back"); all controls together, the same pressures;
//  - a large move: further off; the corrections in Patrick's order, plane, then line, then hinge ("you get on plane first,
//    then you move forward to the line (or back), then power and bank moves you up and down the line"), with bigger
//    pressures and a set and catch on the power;
//  - out before up: under Lead (below his wing plane, inside his wingtip) he moves out before he comes up (Patrick: "if
//    you are underneath lead, you wouldn't correct plane first").
// B3 (spec 7c.3, TS-231) adds:
//  - off station: a change between the close formations, flown as a short list of places in Lead's frame (stationChange)
//    that he moves through straight at each in turn, all controls together (no plane-line-hinge order: that is for an error
//    back onto a place), at most the jogging pace, flowing through each place on the way within 5 ft and 5 kt (TS-117)
//    and tapering to stop on the last (navigate);
//  - deconfliction (deconflict): never within a wingspan of Lead, never ahead of his 3/9 line, no wings overlapping (while
//    his wings overlap Lead's sideways he goes no further in, and back to line astern's fore and aft first), and under Lead
//    out before up as in B1; each a guard on the place he aims at, with a dead band.
// Collision avoidance comes at B4.
//
// Plane, line, hinge is done by the share of each axis's deviation the loops are shown (masks, 0 to 1): the plane's at
// once, the line's once he is near the plane, the rest along the line once also near the line, each eased in so the target
// never jumps. On station and in small moves every share is 1. The masks start where the first job wants them, so a
// hand-over from the tracker already moving down the line is not stopped (bumpless, spec 7b.6d item 2).
//
// Signs and units as perception.js. The memory is never changed in place. Numbers: wing-moves.js CLOSE_WING.
import { STEP_SEC } from '../flight.js';
import { WINGSPAN_FT, LENGTH_FT, pairSlot } from '../slots.js';
import { CLOSE_WING } from '../wing-moves.js';
import { KT_TO_FTPS } from '../../../../core/units.js';

const C = CLOSE_WING;

/** The jobs (spec 7b.6d item 12). */
export const JOBS = Object.freeze(['onStation', 'smallMove', 'largeMove', 'outBeforeUp', 'offStation']);

const offFt = (seen) => Math.hypot(seen.dev.plane, seen.dev.line, seen.dev.along);
const movingFtps = (seen) => Math.hypot(seen.rate.plane, seen.rate.line, seen.rate.along);

/**
 * The job for what he sees, after `prev` (null at the start), with each job's dead band. Moving faster than a gentle drift
 * is a large move however near he is (a hand-over still closing), so he brakes with a large move's pressures.
 */
function pick(prev, seen, moving = false) {
  const d = offFt(seen);
  const v = movingFtps(seen);
  const clear = seen.rel.up >= 0 || Math.abs(seen.rel.left) > WINGSPAN_FT / 2 + C.underClearFt || seen.rel.fwd < -LENGTH_FT - C.underClearFt;
  if (seen.under || (prev === 'outBeforeUp' && !clear)) return 'outBeforeUp';
  if (moving) return 'offStation'; // B3: a change between close places
  if ((prev === 'largeMove' || prev === 'outBeforeUp') && (d > C.smallBackFt || v > C.driftBackFtps)) return 'largeMove';
  if (d > C.largeFromFt || v > C.driftFtps) return 'largeMove';
  if (prev === 'onStation') return d > C.smallFromFt ? 'smallMove' : 'onStation';
  if (prev === null) return d > C.smallFromFt ? 'smallMove' : 'onStation';
  return d < C.stationFromFt ? 'onStation' : 'smallMove';
}

/** The share of each axis's deviation the loops are shown in this job: plane, then line, then hinge in a large move. */
function masksFor(kind, seen) {
  if (kind !== 'largeMove') return { plane: 1, line: 1, along: 1 };
  const onPlane = Math.abs(seen.dev.plane) < C.plhBandFt;
  const onLine = onPlane && Math.abs(seen.dev.line) < C.plhBandFt;
  return { plane: 1, line: onPlane ? 1 : 0, along: onLine ? 1 : 0 };
}

/** The job at the start, from the first picture: { kind, sinceSec, masks, upOk }. */
export function startJob(seen) {
  const kind = pick(null, seen);
  return { kind, sinceSec: 0, masks: masksFor(kind, seen), upOk: kind !== 'outBeforeUp' };
}

/**
 * One step: the job for what he sees now. Returns the new job { kind, sinceSec, masks, upOk }; upOk false while he is
 * under Lead (no correction upward until he is out).
 */
export function supervise(job, seen, moving = false) {
  const kind = pick(job.kind, seen, moving);
  const want = masksFor(kind, seen);
  const step = C.plhPerSec * STEP_SEC;
  const ease = (x, to) => x + Math.max(-step, Math.min(step, to - x));
  return {
    kind,
    sinceSec: kind === job.kind ? job.sinceSec + STEP_SEC : 0,
    masks: { plane: ease(job.masks.plane, want.plane), line: ease(job.masks.line, want.line), along: ease(job.masks.along, want.along) },
    upOk: kind !== 'outBeforeUp',
  };
}

// ---- B3: off station and deconfliction (spec 7c.3, TS-231) ---------------------------------------------------------------

const D = C.deconflict;
const O = C.offStation;

/** Where each close place sits on its side's ladder, out from line astern: the corner, then echelon, then route. */
const RUNG = Object.freeze({ corner: 1, echelon: 2, route: 3 });
const LADDER = Object.freeze(['corner', 'echelon', 'route']);

/**
 * The places a change between the close formations flies through, in order, the last the new place: [{ key, side,
 * paceFtps }] (side +1 left of Lead, -1 right; line astern 0). from, s: where he is (key, side); to, sTo: where to.
 * Spec 7c.3 (Patrick 14 Oct 2026): echelon to route and back straight along the spinner-to-wingtip line; echelon to line
 * astern back and down into the corner, then across; line astern to echelon across to the corner behind it, then forward
 * and up at about 5 ft/s; echelon to echelon the other side both halves, through the corner and across behind Lead to the
 * other corner; route to route the other side in to echelon, the station change, then out to route; route to line astern
 * in to echelon, then the corner. The corner is a place of its own (TS-231).
 */
export function stationChange(from, s, to, sTo) {
  const out = [];
  const at = (key, side, intoEchelon = false) => out.push({ key, side: key === 'astern' ? 0 : side, paceFtps: intoEchelon ? O.intoEchelonFtps : O.paceFtps });
  const climb = (side, fromRung, toRung) => { for (let r = fromRung + 1; r <= toRung; r++) at(LADDER[r - 1], side, r === RUNG.echelon && fromRung <= RUNG.corner); };
  const descend = (side, fromRung, toRung) => { for (let r = fromRung - 1; r >= toRung; r--) at(LADDER[r - 1], side); };
  if (from === 'astern') {
    if (to === 'astern') return out;
    at('corner', sTo);
    climb(sTo, RUNG.corner, RUNG[to]);
    return out;
  }
  if (to === 'astern') {
    descend(s, RUNG[from], RUNG.corner);
    at('astern', 0);
    return out;
  }
  if (s === sTo) {
    if (RUNG[to] < RUNG[from]) descend(s, RUNG[from], RUNG[to]);
    else climb(s, RUNG[from], RUNG[to]);
    return out;
  }
  descend(s, RUNG[from], RUNG.corner);
  at('corner', sTo);
  climb(sTo, RUNG.corner, RUNG[to]);
  return out;
}

/**
 * The change's progress (route: { places, i } from stationChange, i the place he is flying to): on to the next place once
 * he passes one on the way (within flowFt and flowKt, TS-117), and done (null) once settled on the last (within doneFt,
 * moving under doneFtps). off: how far he is from the place he flies to (ft); v: how fast he moves against Lead (ft/s).
 * Returns the route, or null.
 */
export function progress(route, off, v) {
  if (!route) return null;
  const last = route.i === route.places.length - 1;
  if (!last && off <= O.flowFt && v <= O.flowKt * KT_TO_FTPS) return { ...route, i: route.i + 1 };
  if (last && off <= O.doneFt && v <= O.doneFtps) return null;
  return route;
}

/**
 * The deconfliction guards on a place he aims at (spec 7c.3; numbers wing-moves.js CLOSE_WING.deconflict). rel: where he
 * is in Lead's frame as he sees it { fwd, left, up }; vLeft: how fast he is moving sideways (ft/s, + left); place: his aim
 * { fwd, left, alt }; guard: last step's ({ wings }), for the dead band. Returns { place, guard: { wings, span, ahead } }
 * (which guards hold him).
 */
export function deconflict(place, rel, vLeft, guard, vFwd = 0) {
  const noseTail = -(LENGTH_FT + 10); // his nose 10 ft behind Lead's tail (SMM 12.20 para 45), line astern's fore and aft
  let aim = { ...place };
  const leftAhead = rel.left + vLeft * D.lookAheadSec;
  const overlap = Math.abs(rel.left) < WINGSPAN_FT || Math.abs(leftAhead) < WINGSPAN_FT;
  const ahead = rel.fwd + Math.max(0, vFwd) * D.lookAheadSec - noseTail; // where he will be, moving forward
  const wings = overlap && ahead > (guard?.wings ? D.noseTailDeadFt / 2 : D.noseTailDeadFt);
  if (wings) {
    // no further in than he is, and back to the nose-tail line first
    const inward = Math.sign(rel.left) !== Math.sign(place.left) || Math.abs(place.left) < Math.abs(rel.left);
    aim = { fwd: Math.min(aim.fwd, noseTail), left: inward ? rel.left : aim.left, alt: aim.alt };
  }
  const range = Math.hypot(rel.fwd, rel.left, rel.up);
  const span = range < WINGSPAN_FT + D.spanDeadFt;
  if (span) {
    // straight away from Lead sideways and aft (never up toward him, never further down than his place)
    const flat = Math.max(Math.hypot(rel.fwd, rel.left), 1e-6);
    const k = Math.sqrt(Math.max(0, (WINGSPAN_FT + 2 * D.spanDeadFt) ** 2 - rel.up * rel.up)) / flat;
    aim = { fwd: Math.min(rel.fwd * k, aim.fwd), left: rel.left * k, alt: aim.alt };
  }
  const ahead39 = rel.fwd > -D.aheadDeadFt;
  if (ahead39) aim = { ...aim, fwd: Math.min(aim.fwd, -2 * D.aheadDeadFt) };
  return { place: aim, guard: { wings, span, ahead: ahead39 } };
}
