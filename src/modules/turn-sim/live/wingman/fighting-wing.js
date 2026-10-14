// Fighting wing on the live wingman (B5, TS-233; spec 7e): the second technique beside close formation's, with its own
// sight (perception.js seeFw, 0.4 s late), its own guard (supervisor.js fwGuard) and its own numbers (wing-moves.js FW_SEE,
// FW_WING); only the aircraft (fluid-lead.js stepLead, Lead's point mass, TS-225) is shared with close formation. Built at
// T28 as far as flying the separation guard needs (spec 7e.11): the steering law, aiming at Lead or at where Lead was, his
// stack below Lead, the guard's miss and reversal, power at Lead's speed or off. T29 adds the aim loop (lead, lag, pure by
// range and closure), the swept place, turn entry and exit, the vertical and power loops.
//
// Steering (spec 7e.7's loop table): a pursuit guidance law, not a PID (F16). His lift is what holds him up plus a turn
// toward the line to his aim point: the aim line's own turn fed forward (his speed times its turn rate, so on Lead's circle
// the steady pull is Lead's and the rest is small), plus P on the angle between his flight path and that line. It works in
// 3D, in whatever plane the aim is, Lead's lift plane in a turn ("So can lead and 2 follows", Patrick 14 Oct 2026); his bank
// is not capped: the lift points where the turn needs it, past 90° only when the geometry asks (Patrick 14 Oct 2026: "2
// can also go inverted in fighting wing of course, only if required"). His G: no more than Lead's + 1.5 (estimate); the guard
// may pull to what the aircraft gives, flagged. His roll at no more than 60°/s (estimate; stepLead keeps the T-6A's own).
//
// Frames and units: feet, seconds, x east, y north, z up; G; torque %. The state is never changed in place.
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
    aimOff: null, // his aim against Lead's place (ft, world axes), blended across a change of job
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
 * One step. refSt: the aircraft he flies off, at the same moment as his own state (before either steps). Returns { w,
 * trace }.
 */
export function stepFwWingman(w, refSt) {
  const { mem, seen } = seeFw(w.sight, seenOf(refSt), seenOf(w.st));
  const st = w.st;
  const V = Math.max(len3(st.vel), 1);
  const u = scale3(st.vel, 1 / V);
  const ownOmega = scale3(cross3(st.vel, st.accPerp ?? { x: 0, y: 0, z: 0 }), 1 / (V * V)); // he feels his own turn
  const guard = fwGuard(w.guard, seen, ownOmega);

  // ---- the planes ----
  const omegaL = seen.turn.omega;
  const turning = len3(omegaL) > W.turnPlaneRadps;
  const out = turning ? scale3(unit3(omegaL), Math.sign(dot3(omegaL, Z)) || 1) : Z; // the turn plane's normal, upward
  const flat = (x) => perp3(x, out);

  const leadKias = tasToIasKt(len3(seen.lead.v) / KT_TO_FTPS, seen.lead.p.z);
  const job = fwJob(w.job, seen, { shortKt: leadKias - st.kias });
  // Lead carried across the 0.4 s he sees late, round the turn he is making (Fable F5); his own place and path he knows now.
  const leadDR = aheadOnTurn(seen.lead, seen.turn, FW_SEE.delaySec);
  const leadNow = leadDR.p;
  const leadV = leadDR.v;
  const ownP = st.pm;
  const ownV = st.vel;
  const cone = coneFrame(seen.lead.v);
  const vL = len3(seen.lead.v);

  // ---- the range in a turn: (s, d) in Lead's turn-centre frame (Fable F10), closure from the velocities ----
  let closing = seen.closure;
  let arcFt = null;
  let dFt = null; // his offset inside Lead's circle (ft; + toward the centre), Fable F10
  if (job.turning) {
    const nL = unit3(leadV);
    const inward = seen.turn.centre && Math.abs(seen.leadBankDeg) >= W.turnFrameDeg ? unit3(seen.turn.aPerp) : scale3(cone.left, job.dir || 1);
    const rel = sub3(ownP, leadNow);
    const x = dot3(rel, nL);
    const y = dot3(rel, inward);
    if (seen.turn.centre && Math.abs(seen.leadBankDeg) >= W.turnFrameDeg) {
      const R = seen.turn.radiusFt;
      const r = Math.hypot(R - y, x);
      arcFt = R * Math.atan2(-x, R - y);
      dFt = R - r;
      const radialIn = scale3(add3(scale3(inward, y - R), scale3(nL, x)), 1 / Math.max(r, 1)); // from the centre to him
      const axis = unit3(cross3(nL, inward)); // Lead's turn's axis (his way round, right-handed: at Lead, axis x radial = his path)
      const tangent = unit3(cross3(axis, radialIn));
      closing = (R * dot3(ownV, tangent)) / Math.max(r, 1) - len3(leadV);
    } else {
      arcFt = -x;
      dFt = y;
      closing = dot3(ownV, nL) - len3(leadV);
    }
  }

  // ---- where he aims, by job; and the closure the aim can't give, for power ----
  let aimKind;
  let target;
  let residual = 0;
  let cTarget = 0;
  let cActual = closing;
  let offFt = w.offFt;
  if (job.turning) {
    const omega = Math.max(len3(omegaL), W.minTurnRadps);
    const straight = !seen.turn.centre || Math.abs(seen.leadBankDeg) < W.turnFrameDeg;
    const dss = straight ? 0 : seen.turn.radiusFt * (1 - V / Math.max(len3(leadV), 1));
    const eArc = arcFt - W.arcTargetFt;
    const lim = Math.abs(eArc) < W.arcNearFt ? W.arcNearFtps : W.arcFarFtps;
    const cArc = Math.max(-lim, Math.min(lim, eArc / W.aimSec));
    const dRaw = dss + cArc / omega + (W.arcKc * (cArc - closing)) / omega;
    const want = Math.max(-W.arcOffsetMaxFt, Math.min(W.arcOffsetMaxFt, dRaw));
    offFt = w.offFt + Math.max(-W.arcSlewFtps * STEP_SEC, Math.min(W.arcSlewFtps * STEP_SEC, want - w.offFt));
    residual = Math.max(-W.powerBandKias * KT_TO_FTPS, Math.min(W.powerBandKias * KT_TO_FTPS, eArc / W.powerArcSec));
    cTarget = cArc;
    if (seen.turn.centre) {
      const c = seen.turn.centre;
      const axis = unit3(seen.turn.omega);
      const rIn = perp3(sub3(st.pm, c), axis);
      const radial = len3(rIn) > 1 ? unit3(rIn) : unit3(sub3(seen.lead.p, c));
      const tangent = unit3(cross3(axis, radial)); // Lead's way round
      const rT = Math.max(W.circleLeastFt, seen.turn.radiusFt - offFt);
      const ang = Math.min(Math.PI / 2, (V * W.circleLookSec) / rT);
      target = add3(c, add3(scale3(radial, rT * Math.cos(ang)), scale3(tangent, rT * Math.sin(ang))));
    } else {
      target = add3(leadNow, scale3(scale3(cone.left, job.dir || 1), offFt));
    }
    aimKind = offFt > W.routeFt / 4 ? 'lead' : offFt < -W.routeFt / 4 ? 'lag' : 'pure';
  } else {
    const s = job.side;
    const back = W.sweptFt * Math.sin(W.sweptDeg * DEG);
    const out2 = W.sweptFt * Math.cos(W.sweptDeg * DEG);
    const place = add3(add3(leadNow, scale3(cone.nose, -back)), scale3(cone.left, s * out2));
    target = add3(place, scale3(seen.lead.v, W.sweptLookSec));
    const behindFt = dot3(sub3(place, st.pm), cone.nose); // + he is behind his place
    residual = Math.max(-W.aimMaxFtps, Math.min(W.aimMaxFtps, behindFt / W.aimSec));
    cTarget = residual;
    cActual = dot3(sub3(st.vel, seen.lead.v), cone.nose); // how fast he is catching his place up along Lead's path
    offFt = w.offFt + Math.max(-W.aimSlewFtps * STEP_SEC, Math.min(W.aimSlewFtps * STEP_SEC, -w.offFt));
    aimKind = job.sTurn ? 'sTurn' : 'swept';
  }
  // ---- lag first on a turn into him ----
  const LF = W.lagFirst;
  const bNow = seen.leadBankDeg;
  const intoNow = Math.abs(bNow) > W.turnStartDeg && Math.sign(bNow) === seen.levelSide;
  const intoBefore = w.leadBankDeg != null && Math.abs(w.leadBankDeg) > W.turnStartDeg && Math.sign(w.leadBankDeg) === Math.sign(bNow);
  let lagSec = Math.max(0, (w.lagSec ?? 0) - STEP_SEC);
  if (intoNow && !intoBefore) lagSec = LF.sec + LF.easeSec;
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
  // ---- the nose behind Lead, in and down, while the wing line is out of reach ----
  const B = W.behind;
  const behindNowFt = -dot3(sub3(ownP, leadNow), unit3(leadV)); // + behind Lead's wing line
  let behindOn = false;
  if (job.turning) {
    behindOn = w.behindOn ? Boolean(w.lineShort) || behindNowFt < B.clearFt : Boolean(w.lineShort);
    if (behindOn) {
      target = sub3(leadNow, scale3(leadV, W.guard.lagSec));
      aimKind = 'behind';
    }
  }
  // A change of job blends his aim (against Lead's place) over about 1.5 s; the guard's and the nose-behind at once (F17).
  const offNow = sub3(target, leadNow);
  const aimOff = guard.on || behindOn || !w.aimOff ? offNow : ease3(w.aimOff, offNow, W.blendSec);
  const at = add3(leadNow, aimOff);
  const dIn = flat(sub3(at, st.pm));
  const d = len3(dIn) > 1e-6 ? unit3(dIn) : u;
  const aimTurnRaw = ease3(w.aimTurn, scale3(cross3(w.aimDir, sub3(d, w.aimDir)), 1 / STEP_SEC), W.aimTurnSec);
  const ffMax = W.aimTurnCap.k * len3(omegaL) + W.aimTurnCap.plusDps * DEG;
  const aimTurn = len3(aimTurnRaw) > ffMax ? scale3(unit3(aimTurnRaw), ffMax) : aimTurnRaw;

  // ---- steering, in the turn plane: the aim line's turn fed forward, plus P on the angle off it ----
  const uIn = len3(flat(u)) > 1e-6 ? unit3(flat(u)) : u;
  const angleDeg = Math.acos(Math.max(-1, Math.min(1, dot3(uIn, d)))) / DEG;
  const toward = flat(perp3(d, u));
  const n = len3(toward) > 1e-9 ? unit3(toward) : { x: 0, y: 0, z: 0 };
  const aFf = scale3(cross3(aimTurn, u), V); // his speed x the aim line's turn
  const aP = scale3(n, G_FTPS2 * W.gPerDeg * angleDeg);
  // ---- the vertical and its pitch owners ----
  const Y = W.yoyo;
  const eArc = arcFt == null ? null : arcFt - W.arcTargetFt;
  let yoyo = w.yoyo ?? { phase: null, hFt: 0 };
  let yoyoNeedFt = null;
  const yoyoMax = W.heightBandFt;
  let slowKt = 0;
  if (job.turning && seen.turn.centre && Number.isFinite(seen.turn.radiusFt)) {
    const vHold = len3(omegaL) * Math.max(0, seen.turn.radiusFt - dFt);
    yoyoNeedFt = (V * V - vHold * vHold) / (2 * G_FTPS2);
    slowKt = st.kias - tasToIasKt(vHold / KT_TO_FTPS, st.pm.z);
  }
  const done = !job.turning || eArc > Y.exitArcFt || (Math.abs(eArc) < Y.exitArcFt && Math.abs(dFt) < Y.onCircleFt) || (yoyo.phase === 'up' && closing < 0);
  const gaining = arcFt != null && closing - Math.max(-W.arcFarFtps, Math.min(W.arcFarFtps, eArc / W.aimSec)) > Y.excessFtps;
  const trigger = !done && slowKt > Y.slowKt && Boolean(w.powerBack) && gaining;
  if (yoyo.phase !== 'up' && trigger) yoyo = { phase: 'up', hFt: Math.min(yoyoMax, Math.max(Y.minFt, yoyoNeedFt ?? 0)) };
  else if (yoyo.phase === 'up') yoyo = done ? { phase: 'down', hFt: 0 } : { phase: 'up', hFt: Math.min(yoyoMax, Math.max(yoyo.hFt, yoyoNeedFt ?? 0)) };
  else if (yoyo.phase === 'down' && seen.heightFt - job.heightFt < Y.downEndFt) yoyo = { phase: null, hFt: 0 };
  const passClearWanted = guard.on && (w.filterHold ?? 0) > 0;
  let owner = w.owner ?? { name: 'stack', sec: 0, vert: -1 };
  let want = behindOn && !passClearWanted ? 'inDown' : yoyo.phase ? 'yoyo' : passClearWanted ? 'passClear' : 'stack';
  if (want !== owner.name && owner.sec < Y.ownerHoldSec && want !== 'passClear' && want !== 'inDown') want = owner.name;
  const takeOwner = (name) =>
    name === owner.name
      ? { ...owner, sec: owner.sec + STEP_SEC }
      : { name, sec: 0, vert: seen.heightFt > Y.highFt ? 1 : -1 };
  owner = takeOwner(want);
  const dzOf = (o) =>
    o.name === 'passClear'
      ? o.vert * (guard.on ? guard.missFt : W.guard.missFt[0])
      : o.name === 'inDown'
        ? -B.downFt
        : o.name === 'yoyo' && yoyo.phase === 'up'
        ? yoyo.hFt
        : job.heightFt;
  const vertFor = (dz) => {
    const errFt = dot3(sub3(add3(leadNow, scale3(Z, dz)), st.pm), out); // + he has to go toward the normal (up)
    const errRate = -dot3(sub3(st.vel, leadV), out);
    const vertG = Math.max(-W.vertMaxG, Math.min(W.vertMaxG, W.vertGPerFt * errFt + W.vertGPerFtps * errRate));
    const aV = scale3(out, vertG * G_FTPS2);
    const hold = add3(perp3(Z, u), scale3(perp3(aV, u), 1 / G_FTPS2)); // 1 G's share square to his path, and the vertical
    return { dz, errFt, aV, hold };
  };
  const aTurn0 = perp3(add3(aFf, aP), u);
  // ---- the separation filter (separation.js) ----
  const sit = { seen, st, job, turning, out, u, V, ownP, ownV, leadNow, leadV };
  const runFilter = (vert) => separationFilter(w, aTurn0, vert, sit);
  let vert = vertFor(dzOf(owner));
  let flt = runFilter(vert);
  if (owner.name === 'yoyo' && yoyo.phase === 'up' && flt.passShort && !flt.cleared) {
    // the climb can't keep the pass outside the line: pass-clear has pitch (Fable F9)
    owner = takeOwner('passClear');
    vert = vertFor(dzOf(owner));
    flt = runFilter(vert);
  }
  const { dz, hold } = vert;
  const { aTurn, filterPull, lineShort, filterHold, filterSide, passFt, omNom, omPick, engaged, engageClear } = flt;
  const pitchOwner =
    owner.name === 'passClear' ? 'passClear' : owner.name === 'inDown' ? 'inDown' : owner.name === 'yoyo' && yoyo.phase === 'up' ? 'highYoYo' : owner.name === 'yoyo' && yoyo.phase === 'down' ? 'yoyoDown' : job.low ? 'lowInside' : job.quick ? 'quickFix' : 'stack';
  const capNormal = Math.min(seen.leadG + W.overLeadG, shakerG(st.kias));
  const cap = (guard.on && guard.predFt < W.guard.minFt) || filterPull ? Math.max(capNormal, Math.min(availableG(st.kias), shakerG(st.kias))) : capNormal;
  let turn = scale3(aTurn, 1 / G_FTPS2);
  let lift = add3(hold, turn);
  if (len3(lift) > cap) {
    // the turn gives way, never what holds him up: the largest share s of it with |hold + s turn| = cap
    const a = dot3(turn, turn);
    const b = 2 * dot3(hold, turn);
    const c = dot3(hold, hold) - cap * cap;
    const s = a > 1e-12 ? Math.max(0, (-b + Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a)) : 0;
    turn = scale3(turn, Math.min(1, s));
    lift = add3(hold, turn);
  }
  const along = dot3(lift, st.bodyUp);
  if (len3(lift) > 1e-9 && along < len3(lift) * Math.cos(W.pullWithinDeg * DEG)) lift = scale3(unit3(lift), Math.max(W.minG, along));
  if (len3(lift) < W.minG) lift = len3(lift) > 1e-9 ? scale3(unit3(lift), W.minG) : scale3(unit3(hold), W.minG);

  // ---- power ----
  const band = W.powerBandKias * KT_TO_FTPS;
  const missPower = filterHold > 0 && closing > 0;
  const P = missPower ? 0 : residual;
  const iRaw = w.powerI + (guard.on || job.turning ? 0 : ((cTarget - cActual) * STEP_SEC) / W.powerSec);
  const powerI = Math.max(-band, Math.min(band, iRaw)); // held at its limits
  const wantTas = vL + Math.max(-band, Math.min(band, P + powerI)); // ft/s
  const wantKias = tasToIasKt(wantTas / KT_TO_FTPS, seen.lead.p.z);
  const downPower = pitchOwner === 'yoyoDown' && st.kias > leadKias;
  const lowMax = job.low && owner.name === 'stack';
  const power = missPower || downPower ? { throttle: throttleAtTorque(W.guard.torquePct, st.kias, st.pm.z) } : lowMax ? { throttle: 1 } : { holdKias: wantKias };
  const BI = W.brakes;
  const where = seen.slant < W.happyFt[1] || (flt.passShort && seen.closure > 0);
  const fastEnough = st.kias > leadKias - BI.slowKt;
  const idle = fastEnough && (w.idle ? closing > BI.idleOffFtps : closing > BI.idleFtps && where);
  const boards = fastEnough && (w.boards ? closing > BI.boardsOffFtps : closing > BI.boardsFtps && where);
  const powerBack = missPower || downPower || idle || wantKias < leadKias - Y.powerBackKt;
  const next = stepLead(st, { lift, roll: { ...ROLL, maxRateDps: W.rollDps }, ...(idle ? { throttle: 0 } : power), ...(boards ? { boards: true } : {}) });
  const gAsk = len3(lift);
  const jobName = engaged ? 'guard-filter' : job.turning ? `turn-${job.entry ? `${job.entry.into ? 'into' : 'away'}-${job.entry.range}` : 'on'}` : job.sTurn ? 'sTurn' : 'swept';
  return {
    w: { ...w, st: next, sight: mem, guard, job, aimDir: d, aimTurn, t: w.t + STEP_SEC, offFt, aimOff, powerI, filterSide, filterHold, yoyo, owner, lineShort, powerBack, behindOn, idle, boards, filterEngaged: engaged, filterClearSec: engageClear, lagSec, leadBankDeg: bNow },
    trace: {
      t: w.t + STEP_SEC, job: jobName, aim: aimKind, offFt: Math.round(offFt), predFt: Math.round(guard.predFt),
      slant: seen.slant, closure: seen.closure, losDps: seen.losDps, aspectDeg: seen.aspectDeg, hcaDeg: seen.hcaDeg,
      heightTargetFt: Math.round(dz), wantKias, gAsk, overEstimate: guard.on && gAsk > capNormal + 1e-6,
      cWantFtps: guard.on ? null : cTarget, cActualFtps: cActual, low: job.low, sFt: arcFt == null ? null : Math.round(arcFt), dFt: dFt == null ? null : Math.round(dFt), pitchOwner: pitchOwner ?? null, lineShort, passFt: passFt == null ? null : Math.round(passFt), yoyoFt: yoyo.phase === 'up' ? Math.round(yoyo.hFt) : null, omNomDps: omNom, omPickDps: omPick, brakes: boards ? (idle ? 'IDLE + BOARDS' : 'BOARDS') : idle ? 'IDLE' : null,
    },
  };
}
