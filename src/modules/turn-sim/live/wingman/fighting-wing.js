// Fighting wing on the live wingman (B5; spec 7e, TS-233): the second technique beside close formation's. Each step he
// sees Lead 0.4 s late (perception.js seeFw), the guard predicts the pass (separation.js fwGuard), the jobs say what Lead is
// doing (supervisor.js fwJob: turning or level, the entry case, the swept side, the S-turns, the stack's height target),
// and this file works out his lift and power for his own point mass (fluid-lead.js stepLead, Lead's, TS-225). The parts,
// in the order a step runs them:
//  1. Lead now (leadNowOf): Lead carried across the 0.4 s he sees late, round his turn (Fable F5); his own state he knows.
//  2. The range in a turn (arcRange): the arc s behind Lead round Lead's circle and his offset d inside it, with the closure
//     from the velocities (Fable F10). Slant range can't tell behind from ahead, so it is not used in a turn.
//  3. The aim (aimInTurn, aimSwept). In Lead's turn: the arc loop (Fable F1) sets d, the offset where his own speed holds
//     station plus what the wanted closure needs, and he follows the circle d inside Lead's, aiming 3 s ahead on it (SMM
//     12.30 para 74, "on, or around, the preceding aircraft's turn circle"). With Lead level: his swept place, 625 ft at
//     45° (Patrick 14 Oct 2026), fore and aft by power. Each also gives the closure the aim can't make, for power.
//  4. Two overrides of the aim (lagFirst, noseBehind): lag first on a turn into him (CNATRA P-357 section 701; SMM 12.29
//     Fig 12.20); and while Lead's wing line is out of reach, the nose behind Lead, in and down (Patrick 14 Oct 2026).
//  5. Steering (steerToAim): the aim line's turn fed forward plus P on the angle to it, a pursuit law, not a PID (Fable
//     F16); a change of aim blended over 1.5 s.
//  6. The vertical (highYoYo, nextOwner, heightTargetFt, verticalFor): one pitch owner at a time (Fable F7, F9), pass-clear
//     first, then the nose behind's in and down, the high yo-yo, then the stack's family (the stack, the quick fix, low
//     inside), each PD on his height against Lead's, square to Lead's turn plane.
//  7. The separation filter (separation.js separationFilter): the least change to his turn that keeps the predicted pass
//     outside the pass line and him behind Lead's wing line.
//  8. His lift (gCap, liftWithin): within his G, the turn giving way first, and unload, roll, pull.
//  9. Power (powerAsk; not power.js powerFor): Lead's speed plus the closure the aim can't give; off while the filter holds and he is closing; MAX
//     low inside; back on the yo-yo's way down; idle and the boards.
// 10. The step (stepLead) and the trace.
// Steering works in Lead's turn plane, his lift plane in a turn ("So can lead and 2 follows", Patrick 14 Oct 2026); his
// bank is not capped (Patrick 14 Oct 2026: "2 can also go inverted in fighting wing of course, only if required"). His G:
// no more than Lead's + 1.5 (estimate); the guard and the filter may pull to what the aircraft gives, flagged. His roll at
// no more than 60°/s (estimate; stepLead keeps the T-6A's own).
//
// How it came to be (rounds 1-4, 13-14 Oct 2026): `Pat's claude work/formation-review-12oct/fighting-wing-code-history.md`.
// Frames and units: feet, seconds, x east, y north, z up; G; torque %. Memory is never changed in place. Numbers:
// wing-moves.js FW_SEE and FW_WING.
import { DEG } from '../../../../core/angles.js';
import { G_FTPS2, KT_TO_FTPS } from '../../../../core/units.js';
import { availableG, shakerG, tasToIasKt } from '../../../../core/t6-performance.js';
import { STEP_SEC } from '../flight.js';
import { leadStateOf, stepLead } from '../fluid-lead.js';
import { throttleAtTorque } from '../power.js';
import { ROLL } from '../rates.js';
import { FW_SEE, FW_WING } from '../wing-moves.js';
import { add3, sub3, scale3, cross3, unit3, perp3, dot3, len3 } from '../attitude.js';
import { seenOf, startFwSight, seeFw, aheadOnTurn } from './perception.js';
import { startFwJob, fwJob } from './supervisor.js';
import { startFwGuard, fwGuard, separationFilter } from './separation.js';

const W = FW_WING;
const Z = Object.freeze({ x: 0, y: 0, z: 1 });
const vec = (a) => (a ? { x: a[0], y: a[1], z: a[2] } : null);
const ease3 = (y, x, sec) => {
  const k = Math.min(1, STEP_SEC / sec);
  return { x: y.x + (x.x - y.x) * k, y: y.y + (x.y - y.y) * k, z: y.z + (x.z - y.z) * k };
};

/**
 * The fighting wing wingman's state from his aircraft (flight.js fields; velFtps and accFtps2 when a manoeuvre handed them
 * over) and the aircraft he flies off (refSt: stepLead's or leadStateOf's). opts: { blockFt }.
 */
export function startFwWing(aircraft, refSt, { blockFt }) {
  const st = leadStateOf(aircraft, blockFt);
  const sight = startFwSight(seenOf(refSt), seenOf(st), { ownAcc: vec(aircraft.accFtps2), g: refSt.g ?? 1 });
  const aimDir = unit3(sub3(refSt.pm, st.pm));
  const first = seeFw(sight, seenOf(refSt), seenOf(st)).seen;
  return {
    st, sight, guard: startFwGuard(), job: startFwJob(first), aimDir, aimTurn: { x: 0, y: 0, z: 0 }, blockFt, t: 0,
    offFt: 0, // the aim loop's offset from Lead's circle (ft, + inside), slewed
    aimOff: null, // his aim against Lead's place (ft, world axes), blended across a change of aim
    powerI: 0, // the power loop's integral (ft/s of speed), held at its limits
  };
}

/** Lead's wing line and path, level: { nose (his path, unit), left (level, unit) }; the cone's frame. */
function coneFrame(v) {
  const nose = unit3(v);
  const left = unit3(cross3(Z, nose));
  return { nose, left };
}

/**
 * The plane he steers in: Lead's turn plane once Lead turns faster than turnPlaneRadps (his lift plane: spec 7e.7), else
 * level. Returns { omegaL (Lead's seen turn, rad/s vector), turning, out (the plane's normal, upward) }; the vertical works
 * along out.
 */
function turnPlaneOf(seen) {
  const omegaL = seen.turn.omega;
  const turning = len3(omegaL) > W.turnPlaneRadps;
  const out = turning ? scale3(unit3(omegaL), Math.sign(dot3(omegaL, Z)) || 1) : Z;
  return { omegaL, turning, out };
}

/** Lead now: { leadNow, leadV } carried FW_SEE.delaySec round his seen turn (Fable F5); { ownP, ownV } his own, now. */
function leadNowOf(seen, st) {
  const leadDR = aheadOnTurn(seen.lead, seen.turn, FW_SEE.delaySec);
  return { leadNow: leadDR.p, leadV: leadDR.v, ownP: st.pm, ownV: st.vel };
}

/**
 * The range in Lead's turn (Fable F10): x along Lead's path, y toward his turn's centre, R his radius; s = R atan2(-x, R - y)
 * the arc behind him round his circle, d = R - sqrt((R - y)^2 + x^2) the offset inside it. Below turnFrameDeg of Lead's bank
 * their straight-line limits (-x, y), so the pair is continuous through wings level. The closure comes from the velocities,
 * not from differencing s (s jumps when Lead's bank changes): R v2t / r - V_L, v2t his speed along Lead's way round at his
 * radius r. Returns { arcFt, dFt (+ toward the centre), closing (+ closing) }; with Lead not turning (the jobs), arcFt and
 * dFt are null and closing is the slant's closure he sees.
 */
function arcRange(seen, job, now, cone) {
  if (!job.turning) return { arcFt: null, dFt: null, closing: seen.closure };
  const { leadNow, leadV, ownP, ownV } = now;
  const nL = unit3(leadV);
  const onCircle = seen.turn.centre && Math.abs(seen.leadBankDeg) >= W.turnFrameDeg;
  const inward = onCircle ? unit3(seen.turn.aPerp) : scale3(cone.left, job.dir || 1);
  const rel = sub3(ownP, leadNow);
  const x = dot3(rel, nL);
  const y = dot3(rel, inward);
  if (!onCircle) return { arcFt: -x, dFt: y, closing: dot3(ownV, nL) - len3(leadV) };
  const R = seen.turn.radiusFt;
  const r = Math.hypot(R - y, x);
  const radialIn = scale3(add3(scale3(inward, y - R), scale3(nL, x)), 1 / Math.max(r, 1)); // from the centre to him
  const axis = unit3(cross3(nL, inward)); // Lead's turn's axis (right-handed: at Lead, axis x radial = his path)
  const tangent = unit3(cross3(axis, radialIn));
  return { arcFt: R * Math.atan2(-x, R - y), dFt: R - r, closing: (R * dot3(ownV, tangent)) / Math.max(r, 1) - len3(leadV) };
}

/** The point circleLookSec of his flight ahead on the circle offFt inside Lead's (outside when negative), Lead's way round. */
function aheadOnCircle(turn, ownP, leadP, V, offFt) {
  const c = turn.centre;
  const axis = unit3(turn.omega);
  const rIn = perp3(sub3(ownP, c), axis);
  const radial = len3(rIn) > 1 ? unit3(rIn) : unit3(sub3(leadP, c));
  const tangent = unit3(cross3(axis, radial)); // Lead's way round
  const rT = Math.max(W.circleLeastFt, turn.radiusFt - offFt);
  const ang = Math.min(Math.PI / 2, (V * W.circleLookSec) / rT);
  return add3(c, add3(scale3(radial, rT * Math.cos(ang)), scale3(tangent, rT * Math.sin(ang))));
}

/**
 * The aim in Lead's turn: the arc loop (Fable F1). The offset from Lead's circle is d_ss = R (1 - V2 / V_L), where his own
 * speed holds station (slow is answered by flying inside: Patrick's low inside), plus the wanted closure over Lead's turn
 * rate, plus kc of its shortfall: on the circle the closing is about omega (d - d_ss), so the feed-forward makes it settle
 * at the wanted closure, not half of it (the research's "half-gain trap", formation-control-research-14oct.md sections 2,
 * 5). Wanted closure = (s - 650 ft) / 10 s, at most 25 ft/s within 300 ft, 60 ft/s beyond; d within ±400 ft, slewed 60
 * ft/s. Power works on the same arc error, slower (powerArcSec). He aims at the point 3 s ahead on the circle d inside
 * Lead's (from inside, the manual's slight turn out toward Lead's track, then matching his turn, SMM 12.29 Fig 12.20), or,
 * with no circle seen, at Lead's place d out along the cone's side. Returns { target, aimKind ('lead' inside by more than a
 * quarter of a route position, 'lag' outside, else 'pure'), offFt, residual (ft/s the aim can't give: power's P), cTarget,
 * cActual (the closure wanted and had) }.
 */
function aimInTurn(w, seen, job, st, V, omegaL, now, cone, arc) {
  const { arcFt, closing } = arc;
  const omega = Math.max(len3(omegaL), W.minTurnRadps);
  const straight = !seen.turn.centre || Math.abs(seen.leadBankDeg) < W.turnFrameDeg;
  const dss = straight ? 0 : seen.turn.radiusFt * (1 - V / Math.max(len3(now.leadV), 1));
  const eArc = arcFt - W.arcTargetFt;
  const lim = Math.abs(eArc) < W.arcNearFt ? W.arcNearFtps : W.arcFarFtps;
  const cArc = Math.max(-lim, Math.min(lim, eArc / W.aimSec));
  const dRaw = dss + cArc / omega + (W.arcKc * (cArc - closing)) / omega;
  const want = Math.max(-W.arcOffsetMaxFt, Math.min(W.arcOffsetMaxFt, dRaw));
  const offFt = w.offFt + Math.max(-W.arcSlewFtps * STEP_SEC, Math.min(W.arcSlewFtps * STEP_SEC, want - w.offFt));
  const residual = Math.max(-W.powerBandKias * KT_TO_FTPS, Math.min(W.powerBandKias * KT_TO_FTPS, eArc / W.powerArcSec));
  const target = seen.turn.centre
    ? aheadOnCircle(seen.turn, st.pm, seen.lead.p, V, offFt)
    : add3(now.leadNow, scale3(scale3(cone.left, job.dir || 1), offFt));
  const aimKind = offFt > W.routeFt / 4 ? 'lead' : offFt < -W.routeFt / 4 ? 'lag' : 'pure';
  return { target, aimKind, offFt, residual, cTarget: cArc, cActual: closing };
}

/**
 * The aim with Lead level (straight, climbing or descending): his swept place, sweptFt at sweptDeg on the side the jobs
 * chose, carried sweptLookSec ahead along Lead's path so he flies to it in an arc, not a cut; fore and aft by power, the
 * closure wanted from how far he is behind his place, over aimSec, within aimMaxFtps; the turn's offset slewed back to 0.
 * Returns as aimInTurn ('swept', or 'sTurn' while the jobs fly the S-turns).
 */
function aimSwept(w, seen, job, st, now, cone) {
  const s = job.side;
  const back = W.sweptFt * Math.sin(W.sweptDeg * DEG);
  const out2 = W.sweptFt * Math.cos(W.sweptDeg * DEG);
  const place = add3(add3(now.leadNow, scale3(cone.nose, -back)), scale3(cone.left, s * out2));
  const target = add3(place, scale3(seen.lead.v, W.sweptLookSec));
  const behindFt = dot3(sub3(place, st.pm), cone.nose); // + he is behind his place
  const residual = Math.max(-W.aimMaxFtps, Math.min(W.aimMaxFtps, behindFt / W.aimSec));
  const cActual = dot3(sub3(st.vel, seen.lead.v), cone.nose); // how fast he is catching his place up along Lead's path
  const offFt = w.offFt + Math.max(-W.aimSlewFtps * STEP_SEC, Math.min(W.aimSlewFtps * STEP_SEC, -w.offFt));
  return { target, aimKind: job.sTurn ? 'sTurn' : 'swept', offFt, residual, cTarget: residual, cActual };
}

/**
 * Lag first on a turn into him (research: US Navy CNATRA P-357 section 701, Lead's tail first, then inside; Patrick's
 * "turn slightly toward Lead's tail", SMM 12.29 Fig 12.20): once Lead's seen bank passes turnStartDeg toward #2's side, his
 * path is steered lagFirst.deg outward of Lead's circle's local tangent for lagFirst.sec, then eased back to the aim over
 * easeSec. Lead's bank leads his turn rate by the roll time, so it beats part of the 0.4 s delay; it starts before the jobs
 * call the turn (1 s). Returns { target, aimKind, lagSec (left of it), bNow (Lead's seen bank, kept for the next step) }.
 */
function lagFirst(w, seen, st, V, aim) {
  const LF = W.lagFirst;
  const bNow = seen.leadBankDeg;
  const intoNow = Math.abs(bNow) > W.turnStartDeg && Math.sign(bNow) === seen.levelSide;
  const intoBefore = w.leadBankDeg != null && Math.abs(w.leadBankDeg) > W.turnStartDeg && Math.sign(w.leadBankDeg) === Math.sign(bNow);
  let lagSec = Math.max(0, (w.lagSec ?? 0) - STEP_SEC);
  if (intoNow && !intoBefore) lagSec = LF.sec + LF.easeSec;
  let { target, aimKind } = aim;
  if (lagSec > 0 && seen.turn.centre && Number.isFinite(seen.turn.radiusFt)) {
    const axis = unit3(seen.turn.omega);
    const rIn = perp3(sub3(st.pm, seen.turn.centre), axis);
    if (len3(rIn) > 1) {
      const radial = unit3(rIn); // outward, from Lead's centre to him
      const tangent = unit3(cross3(axis, radial)); // Lead's way round
      const e = LF.deg * DEG;
      const lagT = add3(st.pm, scale3(add3(scale3(tangent, Math.cos(e)), scale3(radial, Math.sin(e))), V * W.circleLookSec));
      const k = Math.min(1, lagSec / LF.easeSec); // 1 while lagging, easing to 0
      target = add3(scale3(lagT, k), scale3(target, 1 - k));
      aimKind = 'lagFirst';
    }
  }
  return { target, aimKind, lagSec, bNow };
}

/**
 * The nose behind Lead (Patrick 14 Oct 2026, TS-233: never ahead of Lead's 3/9 line; flown hot-turning-rejoin style, "nose
 * pointed behind Lead, banking steeply in and down"): in Lead's turn, from the step after the filter finds the wing line out
 * of reach (its lineShort) until he is behind.clearFt behind the wing line with it in reach again, he aims where Lead was
 * guard.lagSec ago and goes down (pitch owner inDown). Rolling over Lead, the ruling's other remedy, is not built. Returns {
 * target, aimKind, behindOn }.
 */
function noseBehind(w, job, now, aimed) {
  const { leadNow, leadV, ownP } = now;
  const behindNowFt = -dot3(sub3(ownP, leadNow), unit3(leadV)); // + behind Lead's wing line
  const behindOn = job.turning && (w.behindOn ? Boolean(w.lineShort) || behindNowFt < W.behind.clearFt : Boolean(w.lineShort));
  if (!behindOn) return { ...aimed, behindOn: false };
  return { target: sub3(leadNow, scale3(leadV, W.guard.lagSec)), aimKind: 'behind', behindOn: true };
}

/**
 * Steering (spec 7e.7; Fable F10, F16): his aim against Lead's place blended over blendSec when it changes (at once while
 * the guard is on or the nose is behind, F17); the aim line's turn read over aimTurnSec and fed forward (his speed times it,
 * so on Lead's circle the steady pull is Lead's), held within aimTurnCap (a change of aim jumps the line); plus P, gPerDeg
 * per degree between his path and the line, in the turn plane. Returns { aimOff, d (the aim line, unit), aimTurn, aTurn0
 * (the turning acceleration asked for, ft/s², square to his path) }.
 */
function steerToAim(w, guardOn, aimed, now, st, V, u, plane) {
  const flat = (x) => perp3(x, plane.out);
  const offNow = sub3(aimed.target, now.leadNow);
  const aimOff = guardOn || aimed.behindOn || !w.aimOff ? offNow : ease3(w.aimOff, offNow, W.blendSec);
  const dIn = flat(sub3(add3(now.leadNow, aimOff), st.pm));
  const d = len3(dIn) > 1e-6 ? unit3(dIn) : u;
  const aimTurnRaw = ease3(w.aimTurn, scale3(cross3(w.aimDir, sub3(d, w.aimDir)), 1 / STEP_SEC), W.aimTurnSec);
  const ffMax = W.aimTurnCap.k * len3(plane.omegaL) + W.aimTurnCap.plusDps * DEG;
  const aimTurn = len3(aimTurnRaw) > ffMax ? scale3(unit3(aimTurnRaw), ffMax) : aimTurnRaw;
  const uIn = len3(flat(u)) > 1e-6 ? unit3(flat(u)) : u;
  const angleDeg = Math.acos(Math.max(-1, Math.min(1, dot3(uIn, d)))) / DEG;
  const toward = flat(perp3(d, u));
  const n = len3(toward) > 1e-9 ? unit3(toward) : { x: 0, y: 0, z: 0 };
  const aFf = scale3(cross3(aimTurn, u), V); // his speed x the aim line's turn
  const aP = scale3(n, G_FTPS2 * W.gPerDeg * angleDeg);
  return { aimOff, d, aimTurn, aTurn0: perp3(add3(aFf, aP), u) };
}

/**
 * The high yo-yo inside Lead's turn (Patrick 14 Oct 2026, card "High yo-yo, then back down"; TS-233; Fable F8): when the
 * speed that holds his radius round Lead's centre at Lead's turn rate is more than yoyo.slowKt under his own, with power
 * already back, and he closes round the circle faster than the arc loop wants by yoyo.excessFtps, he climbs out of Lead's
 * plane to kill the horizontal closure and bleed speed: h = (V^2 - (omega r)^2) / 2g (standard energy), at least minFt, at
 * most the cone's height band. The climb is over on Lead's circle with the arc error small, or well behind his place, or
 * opening, or with Lead's turn over; then down to the stack, over within downEndFt of it. Returns the yo-yo { phase ('up',
 * 'down' or null), hFt }.
 */
function highYoYo(w, seen, job, st, V, omegaL, arc) {
  const Y = W.yoyo;
  const { arcFt, dFt, closing } = arc;
  const eArc = arcFt == null ? null : arcFt - W.arcTargetFt;
  const yoyo = w.yoyo ?? { phase: null, hFt: 0 };
  let needFt = null;
  let slowKt = 0;
  if (job.turning && seen.turn.centre && Number.isFinite(seen.turn.radiusFt)) {
    const vHold = len3(omegaL) * Math.max(0, seen.turn.radiusFt - dFt);
    needFt = (V * V - vHold * vHold) / (2 * G_FTPS2);
    slowKt = st.kias - tasToIasKt(vHold / KT_TO_FTPS, st.pm.z);
  }
  const done = !job.turning || eArc > Y.exitArcFt || (Math.abs(eArc) < Y.exitArcFt && Math.abs(dFt) < Y.onCircleFt) || (yoyo.phase === 'up' && closing < 0);
  const gaining = arcFt != null && closing - Math.max(-W.arcFarFtps, Math.min(W.arcFarFtps, eArc / W.aimSec)) > Y.excessFtps;
  const trigger = !done && slowKt > Y.slowKt && Boolean(w.powerBack) && gaining;
  if (yoyo.phase !== 'up' && trigger) return { phase: 'up', hFt: Math.min(W.heightBandFt, Math.max(Y.minFt, needFt ?? 0)) };
  if (yoyo.phase === 'up') return done ? { phase: 'down', hFt: 0 } : { phase: 'up', hFt: Math.min(W.heightBandFt, Math.max(yoyo.hFt, needFt ?? 0)) };
  if (yoyo.phase === 'down' && seen.heightFt - job.heightFt < Y.downEndFt) return { phase: null, hFt: 0 };
  return yoyo;
}

/**
 * The pitch owner (Fable F7, F9): prev, last step's { name, sec (how long it has had pitch), vert (+1 above Lead, -1 below:
 * set when it takes pitch, above only if already more than yoyo.highFt high, TS-233) }; name, the owner wanted. A new owner
 * waits until the old one has had pitch ownerHoldSec, except pass-clear and the nose behind, which take it at once.
 */
function nextOwner(prev, name, seen) {
  const held = name !== prev.name && prev.sec < W.yoyo.ownerHoldSec && name !== 'passClear' && name !== 'inDown';
  const want = held ? prev.name : name;
  return want === prev.name ? { ...prev, sec: prev.sec + STEP_SEC } : { name: want, sec: 0, vert: seen.heightFt > W.yoyo.highFt ? 1 : -1 };
}

/** The owner wanted this step: pass-clear while the guard is on and the filter holds, the nose behind's in and down, the
 * yo-yo, else the stack's family (the jobs' height target: the stack, the quick fix, low inside). */
function ownerWanted(w, guard, behindOn, yoyo) {
  const passClear = guard.on && (w.filterHold ?? 0) > 0;
  return behindOn && !passClear ? 'inDown' : yoyo.phase ? 'yoyo' : passClear ? 'passClear' : 'stack';
}

/** The owner taking pitch from the start of the step: the wanted one, through the hold. */
function takePitch(w, seen, guard, behindOn, yoyo) {
  return nextOwner(w.owner ?? { name: 'stack', sec: 0, vert: -1 }, ownerWanted(w, guard, behindOn, yoyo), seen);
}

/** His height target against Lead's (ft, + above) for a pitch owner: pass-clear's depth (the guard's, or its least when the
 * guard is off), the nose behind's behind.downFt below, the yo-yo's climb, else the jobs' height target. */
function heightTargetFt(owner, guard, yoyo, job) {
  if (owner.name === 'passClear') return owner.vert * (guard.on ? guard.missFt : W.guard.missFt[0]);
  if (owner.name === 'inDown') return -W.behind.downFt;
  if (owner.name === 'yoyo' && yoyo.phase === 'up') return yoyo.hFt;
  return job.heightFt;
}

/**
 * The vertical (spec 7e.7): PD on his height against Lead's at dz, square to Lead's turn plane (vertGPerFt, vertGPerFtps,
 * within vertMaxG). His lift is given its share first: hold is 1 G's share square to his path plus the vertical, so a hard
 * turn never takes the height away (one pitch owner, Fable F7). Returns { dz, errFt, aV (ft/s²), hold (G, a vector) }.
 */
function verticalFor(dz, now, st, u, out) {
  const errFt = dot3(sub3(add3(now.leadNow, scale3(Z, dz)), st.pm), out); // + he has to go toward the normal (up)
  const errRate = -dot3(sub3(st.vel, now.leadV), out);
  const vertG = Math.max(-W.vertMaxG, Math.min(W.vertMaxG, W.vertGPerFt * errFt + W.vertGPerFtps * errRate));
  const aV = scale3(out, vertG * G_FTPS2);
  const hold = add3(perp3(Z, u), scale3(perp3(aV, u), 1 / G_FTPS2));
  return { dz, errFt, aV, hold };
}

/** Who has pitch, for the trace (Fable Q7): the owner's name, or within the stack's family the jobs' choice. */
function pitchLabel(owner, yoyo, job) {
  if (owner.name === 'passClear') return 'passClear';
  if (owner.name === 'inDown') return 'inDown';
  if (owner.name === 'yoyo' && yoyo.phase === 'up') return 'highYoYo';
  if (owner.name === 'yoyo' && yoyo.phase === 'down') return 'yoyoDown';
  return job.low ? 'lowInside' : job.quick ? 'quickFix' : 'stack';
}

/**
 * His G cap: Lead's G + overLeadG, never past the stick shaker at his speed; while the guard's predicted pass is inside
 * 500 ft or the filter needs more, what the aircraft gives (Patrick 14 Oct 2026: references, not walls; flagged in the
 * trace). Returns { capNormal, cap }.
 */
function gCap(seen, st, guard, filterPull) {
  const capNormal = Math.min(seen.leadG + W.overLeadG, shakerG(st.kias));
  const cap = (guard.on && guard.predFt < W.guard.minFt) || filterPull ? Math.max(capNormal, Math.min(availableG(st.kias), shakerG(st.kias))) : capNormal;
  return { capNormal, cap };
}

/**
 * His lift (G, a vector): what holds him up and the vertical (hold), then the turn (aTurn, ft/s²), within the cap with the
 * turn giving way, never what holds him up. Unload, roll, pull: while his wings are more than pullWithinDeg off where the
 * lift is wanted he pulls only its share along them (a pilot never pulls hard with his wings the wrong way; fw-live.js does
 * the same); never under minG.
 */
function liftWithin(aTurn, hold, cap, bodyUp) {
  let turn = scale3(aTurn, 1 / G_FTPS2);
  let lift = add3(hold, turn);
  if (len3(lift) > cap) {
    // the largest share s of the turn with |hold + s turn| = cap
    const a = dot3(turn, turn);
    const b = 2 * dot3(hold, turn);
    const c = dot3(hold, hold) - cap * cap;
    const s = a > 1e-12 ? Math.max(0, (-b + Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a)) : 0;
    turn = scale3(turn, Math.min(1, s));
    lift = add3(hold, turn);
  }
  const along = dot3(lift, bodyUp);
  if (len3(lift) > 1e-9 && along < len3(lift) * Math.cos(W.pullWithinDeg * DEG)) lift = scale3(unit3(lift), Math.max(W.minG, along));
  if (len3(lift) < W.minG) lift = len3(lift) > 1e-9 ? scale3(unit3(lift), W.minG) : scale3(unit3(hold), W.minG);
  return lift;
}

/**
 * Power (slowest, under 0.07 rad/s; spec 7e.7): Lead's speed plus the closure the aim can't give (aim.residual), within
 * powerBandKias of Lead (Patrick 4 Oct 19:12Z). With Lead level a slow I (powerSec) trims the closure he wants against the
 * closure he has; in a turn and while the guard is on it is held (one owner for closure in a turn, the aim). Off (guard
 * torquePct) while the filter holds and he is closing; MAX low inside (the ruling "Drop low inside, MAX") while the stack's
 * family has pitch; off on the yo-yo's way down while faster than Lead (Fable F8). Idle and the boards (Patrick 14 Oct
 * 2026: his to use, smartly) while he closes faster than power back answers and is inside the happy band or closing on the
 * pass line, and not slower than Lead; released early for the engine's 3.5 s spool-up (live/handling.js ENGINE). Returns {
 * ask (stepLead's power fields), idle, boards, powerI, wantKias, powerBack (power back this step: the yo-yo's trigger) }.
 */
function powerAsk(w, seen, job, st, guard, aim, closing, flt, owner, pitch, leadKias) {
  const band = W.powerBandKias * KT_TO_FTPS;
  const missPower = flt.filterHold > 0 && closing > 0;
  const P = missPower ? 0 : aim.residual;
  const iRaw = w.powerI + (guard.on || job.turning ? 0 : ((aim.cTarget - aim.cActual) * STEP_SEC) / W.powerSec);
  const powerI = Math.max(-band, Math.min(band, iRaw)); // held at its limits
  const wantTas = len3(seen.lead.v) + Math.max(-band, Math.min(band, P + powerI)); // ft/s
  const wantKias = tasToIasKt(wantTas / KT_TO_FTPS, seen.lead.p.z);
  const downPower = pitch === 'yoyoDown' && st.kias > leadKias;
  const lowMax = job.low && owner.name === 'stack';
  const power = missPower || downPower ? { throttle: throttleAtTorque(W.guard.torquePct, st.kias, st.pm.z) } : lowMax ? { throttle: 1 } : { holdKias: wantKias };
  const BI = W.brakes;
  const where = seen.slant < W.happyFt[1] || (flt.passShort && seen.closure > 0);
  const fastEnough = st.kias > leadKias - BI.slowKt;
  const idle = fastEnough && (w.idle ? closing > BI.idleOffFtps : closing > BI.idleFtps && where);
  const boards = fastEnough && (w.boards ? closing > BI.boardsOffFtps : closing > BI.boardsFtps && where);
  const powerBack = missPower || downPower || idle || wantKias < leadKias - W.yoyo.powerBackKt;
  return { ask: { ...(idle ? { throttle: 0 } : power), ...(boards ? { boards: true } : {}) }, idle, boards, powerI, wantKias, powerBack };
}

/** The job for the trace: the filter while engaged, else Lead's turn with its entry case, the S-turns or swept. */
function jobLabel(engaged, job) {
  if (engaged) return 'guard-filter';
  if (job.turning) return `turn-${job.entry ? `${job.entry.into ? 'into' : 'away'}-${job.entry.range}` : 'on'}`;
  return job.sTurn ? 'sTurn' : 'swept';
}

/**
 * One step. refSt: the aircraft he flies off, at the same moment as his own state (before either steps). Returns { w,
 * trace }: w his next state; trace what he saw and did, for the gauge and the plot page (job, aim, the guard's and the
 * filter's predicted pass, (s, d), the height target and who has pitch, the closure wanted and had, the filter's turn
 * against his aim's, the brakes, overEstimate: the guard pulling past Lead + 1.5 G).
 */
export function stepFwWingman(w, refSt) {
  const { mem, seen } = seeFw(w.sight, seenOf(refSt), seenOf(w.st));
  const st = w.st;
  const V = Math.max(len3(st.vel), 1);
  const u = scale3(st.vel, 1 / V);
  const ownOmega = scale3(cross3(st.vel, st.accPerp ?? { x: 0, y: 0, z: 0 }), 1 / (V * V)); // he feels his own turn
  const guard = fwGuard(w.guard, seen, ownOmega);
  const plane = turnPlaneOf(seen);
  // short of energy (the ruling "Drop low inside, MAX"): Lead's indicated speed from what he sees of his true speed
  const leadKias = tasToIasKt(len3(seen.lead.v) / KT_TO_FTPS, seen.lead.p.z);
  const job = fwJob(w.job, seen, { shortKt: leadKias - st.kias });
  const now = leadNowOf(seen, st);
  const cone = coneFrame(seen.lead.v);
  const arc = arcRange(seen, job, now, cone);

  // the aim, its overrides and steering
  const aim = job.turning ? aimInTurn(w, seen, job, st, V, plane.omegaL, now, cone, arc) : aimSwept(w, seen, job, st, now, cone);
  const lag = lagFirst(w, seen, st, V, aim);
  const aimed = noseBehind(w, job, now, lag);
  const steer = steerToAim(w, guard.on, aimed, now, st, V, u, plane);

  // the vertical's owner, then the filter; a climb that can't keep the pass outside the line gives pitch to pass-clear (F9)
  const yoyo = highYoYo(w, seen, job, st, V, plane.omegaL, arc);
  const sit = { seen, st, job, turning: plane.turning, out: plane.out, u, V, ownP: now.ownP, ownV: now.ownV, leadNow: now.leadNow, leadV: now.leadV };
  let owner = takePitch(w, seen, guard, aimed.behindOn, yoyo);
  let vert = verticalFor(heightTargetFt(owner, guard, yoyo, job), now, st, u, plane.out);
  let flt = separationFilter(w, steer.aTurn0, vert, sit);
  if (owner.name === 'yoyo' && yoyo.phase === 'up' && flt.passShort && !flt.cleared) {
    owner = nextOwner(owner, 'passClear', seen);
    vert = verticalFor(heightTargetFt(owner, guard, yoyo, job), now, st, u, plane.out);
    flt = separationFilter(w, steer.aTurn0, vert, sit);
  }
  const pitch = pitchLabel(owner, yoyo, job);

  // his lift, his power, the step
  const { capNormal, cap } = gCap(seen, st, guard, flt.filterPull);
  const lift = liftWithin(flt.aTurn, vert.hold, cap, st.bodyUp);
  const pw = powerAsk(w, seen, job, st, guard, aim, arc.closing, flt, owner, pitch, leadKias);
  const next = stepLead(st, { lift, roll: { ...ROLL, maxRateDps: W.rollDps }, ...pw.ask });
  const gAsk = len3(lift);
  const { arcFt, dFt } = arc;
  return {
    w: {
      ...w, st: next, sight: mem, guard, job, aimDir: steer.d, aimTurn: steer.aimTurn, t: w.t + STEP_SEC, offFt: aim.offFt, aimOff: steer.aimOff,
      powerI: pw.powerI, filterSide: flt.filterSide, filterHold: flt.filterHold, yoyo, owner, lineShort: flt.lineShort, powerBack: pw.powerBack,
      behindOn: aimed.behindOn, idle: pw.idle, boards: pw.boards, filterEngaged: flt.engaged, filterClearSec: flt.engageClear, lagSec: lag.lagSec, leadBankDeg: lag.bNow,
    },
    trace: {
      t: w.t + STEP_SEC, job: jobLabel(flt.engaged, job), aim: aimed.aimKind, offFt: Math.round(aim.offFt), predFt: Math.round(guard.predFt),
      slant: seen.slant, closure: seen.closure, losDps: seen.losDps, aspectDeg: seen.aspectDeg, hcaDeg: seen.hcaDeg,
      heightTargetFt: Math.round(vert.dz), wantKias: pw.wantKias, gAsk, overEstimate: guard.on && gAsk > capNormal + 1e-6,
      cWantFtps: guard.on ? null : aim.cTarget, cActualFtps: aim.cActual, low: job.low, sFt: arcFt == null ? null : Math.round(arcFt), dFt: dFt == null ? null : Math.round(dFt),
      pitchOwner: pitch, lineShort: flt.lineShort, passFt: flt.passFt == null ? null : Math.round(flt.passFt), yoyoFt: yoyo.phase === 'up' ? Math.round(yoyo.hFt) : null,
      omNomDps: flt.omNom, omPickDps: flt.omPick, brakes: pw.boards ? (pw.idle ? 'IDLE + BOARDS' : 'BOARDS') : pw.idle ? 'IDLE' : null,
    },
  };
}
