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
import { CLOSE_WING, FW_WING, FW_SEE } from '../wing-moves.js';
import { KT_TO_FTPS } from '../../../../core/units.js';
import { DEG } from '../../../../core/angles.js';
import { add3, sub3, scale3, cross3, len3 } from '../attitude.js';

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

// ---- B5: fighting wing's separation guard (spec 7e.7, TS-233) -------------------------------------------------------------
//
// Always first; a geometric predictor with priority and hysteresis, not a PID (Fable F1, F16). Each step he predicts the
// pass from what he sees: Lead on his present turn (in his lift plane, perception.js turnOf) and one step tighter, himself on
// his own present turn, each turn held; the least slant range over the next lookSec (plus the 0.4 s he sees late). Under
// engageFt predicted (or under minFt now) the guard engages; it flies the manual's sequence for a turn into him (SMM 12.29
// Figs 12.20, 12.22): the miss (aim at where Lead was, power off, the vertical: below Lead unless already above him,
// Patrick 14 Oct 2026), then the reversal onto Lead's circle once the line of sight definitely rises (SMM 16.20 para
// 65b(2)) with Lead behind his 3/9 line (never across Lead's nose). It owns pitch while engaged, and may pull past the
// Lead + 1.5 G estimate up to what the aircraft gives, flagged (Patrick 14 Oct 2026). It releases once the pass predicted
// and the range now are both over releaseFt for releaseSec. No Terminate: Lead never waits (Patrick 14 Oct 2026).
// Numbers: wing-moves.js FW_WING.guard.

const FG = FW_WING.guard;

// ---- B5 T29: fighting wing's jobs (spec 7e.7) ------------------------------------------------------------------------------
//
// Below the guard, by what Lead is doing as he sees it (each switch with hysteresis, F4, F17):
//  - turn: Lead's turn started (his bank past 10° for 1 s) and not yet ended (under 5° for 1 s); at its start, and again
//    whenever Lead reverses (his bank's sign changes past 10°), the entry case is set from range and closure and whether
//    the turn is into #2 (SMM 12.29 Figs 12.20-12.22): in position, stretched or tight, into or away;
//  - swept: Lead wings level, straight, climbing or descending; on the side the turn exit chose (Fig 12.23: tight or closing
//    fast, the outside of the turn; stretched or opening, the inside; good, the side he is on), else the side he is on;
//    S-turns across the cone when too tight (Patrick 14 Oct 2026);
//  - the height target, one pitch owner below the guard (F7): the quick fix (±150 ft, down to close, up to open) while the
//    range error or the closure is large, else the stack, 50 ft below, coming back over about 15 s.
// Numbers: wing-moves.js FW_WING.

const FJ = FW_WING;
const happyMid = (FJ.happyFt[0] + FJ.happyFt[1]) / 2;

/** The jobs at the start: Lead taken as he is (turning if banked past 10°), his side and the stack as they are. */
export function startFwJob(seen) {
  const turning = Math.abs(seen.leadBankDeg) > FJ.turnStartDeg;
  return {
    turning, dir: turning ? Math.sign(seen.leadBankDeg) : 0, hold: 0, entry: turning ? entryOf(seen, Math.sign(seen.leadBankDeg)) : null,
    side: seen.levelSide, sTurn: false, quick: 0, heightFt: Math.max(-FJ.heightBandFt, Math.min(FJ.heightBandFt, seen.heightFt)),
  };
}

/** The entry case (SMM 12.29 Figs 12.20-12.22): { into (Lead turning toward #2's side), range: 'tight' | 'in' | 'stretched' }. */
function entryOf(seen, dir) {
  const range = seen.slant < FJ.tightFt || seen.closure > FJ.quickFixFtps ? 'tight' : seen.slant > FJ.stretchedFt ? 'stretched' : 'in';
  return { into: dir === seen.levelSide, range };
}

/**
 * One step of the jobs. j: last step's; seen: perception.js seeFw's, with levelSide (#2's side of Lead's path, level: +1
 * left). Returns { turning, dir (+1 Lead turning left), hold, entry, side (the swept side), sTurn, quick (the quick fix:
 * +1 up, -1 down, 0 off), heightFt (the height target against Lead's, eased) }.
 */
export function fwJob(j, seen) {
  const b = seen.leadBankDeg;
  let { turning, dir, hold, entry, side, sTurn, quick } = j;
  if (!turning) {
    hold = Math.abs(b) > FJ.turnStartDeg ? hold + STEP_SEC : 0;
    if (hold >= FJ.turnHoldSec) {
      turning = true;
      dir = Math.sign(b);
      hold = 0;
      entry = entryOf(seen, dir);
      sTurn = false;
    }
  } else {
    if (Math.abs(b) > FJ.turnStartDeg && Math.sign(b) !== dir) {
      // Lead reverses: the case is set again (F4: a reversal mid-entry is the dangerous one)
      dir = Math.sign(b);
      entry = entryOf(seen, dir);
    }
    hold = Math.abs(b) < FJ.turnEndDeg ? hold + STEP_SEC : 0;
    if (hold >= FJ.turnHoldSec) {
      // The turn exit (Fig 12.23): tight or closing fast, flow to the outside of the turn; stretched or opening, the inside.
      const tight = seen.slant < FJ.happyFt[0] || seen.closure > FJ.sTurnClosureFtps;
      const stretched = seen.slant > FJ.stretchedFt || seen.closure < -FJ.quickReleaseFtps;
      side = tight ? -dir || seen.levelSide : stretched ? dir || seen.levelSide : seen.levelSide;
      turning = false;
      hold = 0;
      entry = null;
    }
  }
  if (!turning) {
    // S-turns across the cone when too tight with Lead level (Patrick 14 Oct 2026): aim at the other side, swap each time
    // he gets there, until he is happy again.
    const tooTight = seen.slant < FJ.sTurnFt || (seen.closure > FJ.sTurnClosureFtps && seen.slant < FJ.happyFt[1]);
    if (!sTurn && tooTight) {
      sTurn = true;
      side = -seen.levelSide;
    } else if (sTurn && seen.slant >= FJ.sTurnDoneFt && seen.closure < FJ.quickReleaseFtps) {
      sTurn = false;
      side = seen.levelSide;
    } else if (sTurn && seen.levelSide === side && Math.abs(seen.levelLeftFt) > FJ.sweptFt * Math.cos(FJ.sweptDeg * DEG) / 2) {
      side = -side; // across: back the other way
    }
  }
  // The quick fix (F7): engaged past its thresholds, released inside its smaller ones; the height target follows it, or
  // comes back to the stack over about 15 s.
  const e = seen.slant - happyMid;
  // Only when the spacing is going the wrong way: stretched and not closing (down, to gain speed), or closing fast and not
  // stretched (up, to bleed it); a closure the aim is already making is left to it.
  if (!quick && e > FJ.quickFixFt && seen.closure < FJ.quickReleaseFtps) quick = -1;
  else if (!quick && seen.closure > FJ.quickFixFtps && e < FJ.quickReleaseFt) quick = 1;
  else if (quick && Math.abs(e) < FJ.quickReleaseFt && Math.abs(seen.closure) < FJ.quickReleaseFtps) quick = 0;
  const target = quick ? quick * FJ.quickFixHeightFt : FJ.stackFt;
  const heightFt = j.heightFt + (target - j.heightFt) * Math.min(1, STEP_SEC / (quick ? FJ.quickSec : FJ.stackReturnSec));
  return { turning, dir, hold, entry, side: side || seen.levelSide, sTurn, quick, heightFt };
}


/** The guard at the start: off. */
export function startFwGuard() {
  return { on: false, phase: null, vert: -1, missFt: 0, clearSec: 0, losLeast: Infinity, predFt: Infinity };
}

/**
 * The least slant range over the next horizonSec between two aircraft each holding its turn: p, v (ft, ft/s) and omega
 * (rad/s, the turn's axis times its rate) for each. Integrated in lookStepSec steps (a turn held: the velocity turned by
 * omega x v, standard kinematics). Returns { leastFt, horizFt (the horizontal range at that moment) }.
 */
export function leastPass(a, b, horizonSec) {
  let [pa, va, pb, vb] = [a.p, a.v, b.p, b.v];
  let least = len3(sub3(pa, pb));
  let horiz = Math.hypot(pa.x - pb.x, pa.y - pb.y);
  const dt = FG.lookStepSec;
  for (let t = dt; t <= horizonSec + 1e-9; t += dt) {
    // half-step turns keep the speed while turning (midpoint)
    const va2 = add3(va, scale3(cross3(a.omega, va), dt));
    const vb2 = add3(vb, scale3(cross3(b.omega, vb), dt));
    const ka = len3(va) / Math.max(len3(va2), 1e-9);
    const kb = len3(vb) / Math.max(len3(vb2), 1e-9);
    pa = add3(pa, scale3(add3(va, scale3(va2, ka)), dt / 2));
    pb = add3(pb, scale3(add3(vb, scale3(vb2, kb)), dt / 2));
    va = scale3(va2, ka);
    vb = scale3(vb2, kb);
    const d = len3(sub3(pa, pb));
    if (d < least) {
      least = d;
      horiz = Math.hypot(pa.x - pb.x, pa.y - pb.y);
    }
  }
  return { leastFt: least, horizFt: horiz };
}

/**
 * One step of the guard. g: last step's; seen: perception.js seeFw's; ownOmega: his own turn now (rad/s vector, he feels
 * it). Returns the guard { on, phase ('miss' | 'reverse' | null), vert (+1 above, -1 below), missFt (the height off Lead
 * he makes the miss at), clearSec, losLeast, predFt (the least pass predicted) }.
 */
export function fwGuard(g, seen, ownOmega) {
  const horizon = FG.lookSec + FW_SEE.delaySec; // the picture is that old
  const me = { p: seen.own.p, v: seen.own.v, omega: ownOmega };
  const asIs = leastPass({ p: seen.lead.p, v: seen.lead.v, omega: seen.turn.omega }, me, horizon);
  const tighter = leastPass({ p: seen.lead.p, v: seen.lead.v, omega: scale3(seen.turn.omega, FG.tighter) }, me, horizon);
  const pass = asIs.leastFt <= tighter.leastFt ? asIs : tighter;
  const predFt = Math.min(pass.leastFt, seen.slant);
  if (!g.on) {
    if (predFt >= FG.engageFt && seen.slant >= FG.minFt) return { ...g, predFt };
    // Engaged: the miss below Lead unless already above him; deep enough to make the slant missSlantFt over the pass.
    const vert = seen.heightFt > FG.aboveFt ? 1 : -1;
    const need = Math.sqrt(Math.max(0, FG.missSlantFt ** 2 - pass.horizFt ** 2));
    return { on: true, phase: 'miss', vert, missFt: Math.min(FG.missFt[1], Math.max(FG.missFt[0], need)), clearSec: 0, losLeast: seen.losDps, predFt };
  }
  const clear = predFt > FG.releaseFt;
  const clearSec = clear ? g.clearSec + STEP_SEC : 0;
  if (clearSec >= FG.releaseSec) return { ...startFwGuard(), predFt };
  const losLeast = Math.min(g.losLeast, seen.losDps);
  // The reversal onto Lead's circle: a definite rise in the line of sight, with Lead behind his 3/9 line and the pass
  // predicted outside engageFt (the miss made). Reversing, a pass predicted inside minFt again takes him back to the miss
  // (the dead band between the two: no flicker), so the guard never sits inside 500 ft aiming at Lead.
  const cue = seen.losDps > losLeast + FG.losRiseDps && seen.aspectDeg < 90 && predFt >= FG.engageFt && seen.closure < FG.reverseClosureFtps;
  const reverse = g.phase === 'reverse' ? predFt >= FG.minFt : cue;
  const need = Math.sqrt(Math.max(0, FG.missSlantFt ** 2 - pass.horizFt ** 2));
  const missFt = Math.max(g.missFt, Math.min(FG.missFt[1], need)); // deepened if the pass gets closer, never given back while engaged
  return { ...g, phase: reverse ? 'reverse' : 'miss', missFt, clearSec, losLeast, predFt };
}
