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
// Later rungs add off station, deconfliction and collision avoidance (B3, B4).
//
// Plane, line, hinge is done by the share of each axis's deviation the loops are shown (masks, 0 to 1): the plane's at
// once, the line's once he is near the plane, the rest along the line once also near the line, each eased in so the target
// never jumps. On station and in small moves every share is 1. The masks start where the first job wants them, so a
// hand-over from the tracker already moving down the line is not stopped (bumpless, spec 7b.6d item 2).
//
// Signs and units as perception.js. The memory is never changed in place. Numbers: wing-moves.js CLOSE_WING.
import { STEP_SEC } from '../flight.js';
import { WINGSPAN_FT, LENGTH_FT } from '../slots.js';
import { CLOSE_WING } from '../wing-moves.js';

const C = CLOSE_WING;

/** The jobs (spec 7b.6d item 12). */
export const JOBS = Object.freeze(['onStation', 'smallMove', 'largeMove', 'outBeforeUp']);

const offFt = (seen) => Math.hypot(seen.dev.plane, seen.dev.line, seen.dev.along);
const movingFtps = (seen) => Math.hypot(seen.rate.plane, seen.rate.line, seen.rate.along);

/**
 * The job for what he sees, after `prev` (null at the start), with each job's dead band. Moving faster than a gentle drift
 * is a large move however near he is (a hand-over still closing), so he brakes with a large move's pressures.
 */
function pick(prev, seen) {
  const d = offFt(seen);
  const v = movingFtps(seen);
  const clear = seen.rel.up >= 0 || Math.abs(seen.rel.left) > WINGSPAN_FT / 2 + C.underClearFt || seen.rel.fwd < -LENGTH_FT - C.underClearFt;
  if (seen.under || (prev === 'outBeforeUp' && !clear)) return 'outBeforeUp';
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
export function supervise(job, seen) {
  const kind = pick(job.kind, seen);
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
