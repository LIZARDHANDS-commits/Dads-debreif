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
import { seenOf, startFwSight, seeFw, aheadOnTurn, rotate3 } from './perception.js';
import { startFwGuard, fwGuard, startFwJob, fwJob, leastPass } from './supervisor.js';

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
 * trace }: trace = { t, job ('pure', 'guard-miss', 'guard-reverse'), aim ('lead', 'wasLead'), predFt (the guard's least
 * pass predicted), slant, closure, losDps, aspectDeg, hcaDeg, gAsk, overEstimate (the guard pulling past Lead + 1.5 G,
 * flagged) }.
 */
export function stepFwWingman(w, refSt) {
  const { mem, seen } = seeFw(w.sight, seenOf(refSt), seenOf(w.st));
  const st = w.st;
  const V = Math.max(len3(st.vel), 1);
  const u = scale3(st.vel, 1 / V);
  const ownOmega = scale3(cross3(st.vel, st.accPerp ?? { x: 0, y: 0, z: 0 }), 1 / (V * V)); // he feels his own turn
  const guard = fwGuard(w.guard, seen, ownOmega);

  // ---- the planes: steering in Lead's turn plane (his lift plane: spec 7e.7, "So can lead and 2 follows"), the vertical
  // loop square to it (in a level turn, up and down); with Lead not turning, the turn plane is level ----
  const omegaL = seen.turn.omega;
  const turning = len3(omegaL) > W.turnPlaneRadps;
  const out = turning ? scale3(unit3(omegaL), Math.sign(dot3(omegaL, Z)) || 1) : Z; // the turn plane's normal, upward
  const flat = (x) => perp3(x, out);

  // Short of energy (T29a, the ruling "Drop low inside, MAX"): how much slower than Lead he is, indicated, Lead's from
  // what he sees of his true speed (his own he feels).
  const leadKias = tasToIasKt(len3(seen.lead.v) / KT_TO_FTPS, seen.lead.p.z);
  const job = fwJob(w.job, seen, { shortKt: leadKias - st.kias });
  // Lead carried across the 0.4 s he sees late, round the turn he is making (Fable F5, second review), so the steering, the
  // range and the filter all work on Lead now; his own place and path he knows now.
  const leadDR = aheadOnTurn(seen.lead, seen.turn, W.deadReckon ? FW_SEE.delaySec : 0);
  const leadNow = W.deadReckon ? leadDR.p : add3(seen.lead.p, scale3(seen.lead.v, FW_SEE.delaySec));
  const leadV = W.deadReckon ? leadDR.v : seen.lead.v;
  const ownP = W.deadReckon ? st.pm : seen.own.p;
  const ownV = W.deadReckon ? st.vel : seen.own.v;
  const cone = coneFrame(seen.lead.v);
  const vL = len3(seen.lead.v);

  // ---- the aim loop (T29; spec 7e.7, Fable F3): a wanted closure from the range error, soft inside the happy band ----
  const happyMid = (W.happyFt[0] + W.happyFt[1]) / 2;
  // In Lead's turn the range he keeps is his arc behind Lead round Lead's circle, signed (thread, 14 Oct 2026): slant range
  // can't tell behind from ahead, so on a circle inside Lead's (closing at omega x d) the slant loop kept him inside, past
  // Lead's 3/9 line (aspect 127°), the slant growing again as he drew ahead. Its closure is the arc's rate, eased as the
  // slant's is (FW_SEE.closureSec). Otherwise, slant range.
  let range = seen.slant;
  let closing = seen.closure;
  let arcFt = null;
  let dFt = null; // his offset inside Lead's circle (ft; + toward the centre), Fable F10
  if (W.arcFrame && job.turning) {
    // (s, d) in Lead's turn-centre frame (Fable F10, second review): x along Lead's path, y toward his turn's centre, R his
    // radius; s = R atan2(-x, R - y) the arc behind him round his circle, d = R - sqrt((R - y)^2 + x^2) the offset inside it.
    // As R grows they tend to -x and y, so through wings level the same pair is used (below turnFrameDeg of Lead's bank, the
    // limits). The closure comes from the velocities, not from differencing s (s jumps when Lead's bank changes): +
    // closing, R v2t / r - V_L, with v2t his speed along Lead's way round at his radius r.
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
      // his speed round Lead's centre at his place: the tangent there, Lead's way round
      const radialIn = scale3(add3(scale3(inward, y - R), scale3(nL, x)), 1 / Math.max(r, 1)); // from the centre to him
      const axis = unit3(cross3(nL, inward)); // Lead's turn's axis (his way round, right-handed: at Lead, axis x radial = his path)
      const tangent = unit3(cross3(axis, radialIn));
      closing = (R * dot3(ownV, tangent)) / Math.max(r, 1) - len3(leadV);
    } else {
      arcFt = -x;
      dFt = y;
      closing = dot3(ownV, nL) - len3(leadV);
    }
    range = arcFt;
  } else if (W.followCircle && seen.turn.centre && job.turning) {
    const c = seen.turn.centre;
    const axis = unit3(seen.turn.omega);
    const rL = perp3(sub3(W.deadReckon ? leadNow : seen.lead.p, c), axis);
    const rMe = perp3(sub3(ownP, c), axis);
    const ang = Math.atan2(dot3(cross3(rMe, rL), axis), dot3(rMe, rL)); // + Lead ahead of him round the circle
    arcFt = ang * seen.turn.radiusFt;
    range = arcFt;
    const raw = w.arcFt == null ? 0 : (w.arcFt - arcFt) / STEP_SEC;
    closing = w.arcClosure == null ? raw : w.arcClosure + (raw - w.arcClosure) * Math.min(1, STEP_SEC / FW_SEE.closureSec);
  }
  const e = range - happyMid; // + too far behind
  const soft = range > W.happyFt[0] && range < W.happyFt[1] ? W.happyGain : 1;
  const cWant = Math.max(-W.aimMaxFtps, Math.min(W.aimMaxFtps, (soft * e) / W.aimSec)); // + closing wanted

  // ---- where he aims, by job; and the closure the aim can't give, for power ----
  let aimKind;
  let target;
  let residual = 0; // ft/s of closure (or of catching up along Lead's path) the aim can't give: the power loop's P
  let cTarget = 0; // the closure he wants and cActual the closure he has: the power loop's I closes the difference
  let cActual = closing;
  let offFt = w.offFt;
  // The guard moves his aim only without the separation filter (W.guard.filter, below): with it the guard's miss is the least
  // change to his turn, not an aim point (thread, 14 Oct 2026: the aim at where Lead was turned him 80° across at the turn's start).
  const missing = !W.guard.filter && guard.on && guard.phase === 'miss';
  if (missing) {
    aimKind = 'wasLead'; // the guard's miss: where Lead was (SMM Fig 12.20; EFIG p.391)
    target = seen.wasAt(W.guard.lagSec);
  } else if (!W.guard.filter && guard.on) {
    aimKind = 'lead'; // the guard's reversal onto Lead's circle: pure
    target = leadNow;
  } else if (job.turning) {
    // In the turn: on or around Lead's circle, nearly astern (F11), aiming at the point offFt inside his circle from him
    // (the route positions at about ±120 ft: wing down inside, a lead; wing up outside, a lag; Patrick 14 Oct 2026: "I
    // personally fly at the 'route position' instead of directly at lead in turns"). The offset that gives the wanted
    // closure at Lead's turn rate (flying d ft inside his circle closes at about omega x d); what it can't give goes to power.
    const omega = Math.max(len3(omegaL), W.minTurnRadps);
    // PD: the wanted closure (P on the range error), and the closure he has against it (D), so closing faster than he
    // wants already eases the lead toward pure or lag
    if (W.arcLoop && arcFt != null) {
      // The arc loop (Fable F1, second review): the offset where his own speed holds station, d_ss = R (1 - V2 / V_L) (slow
      // is answered by flying inside: Patrick's low inside), plus what the wanted closure lacks of the closure he has, over
      // Lead's turn rate. Wanted closure = (s - 650 ft) / 10 s, at most 25 ft/s within 300 ft of the target arc, 60 ft/s
      // beyond; d within ±400 ft, slewed 60 ft/s. Power works on the same arc error, slower (powerArcSec).
      const straight = !seen.turn.centre || Math.abs(seen.leadBankDeg) < W.turnFrameDeg;
      const dss = straight ? 0 : seen.turn.radiusFt * (1 - V / Math.max(len3(leadV), 1));
      const eArc = arcFt - W.arcTargetFt;
      const lim = Math.abs(eArc) < W.arcNearFt ? W.arcNearFtps : W.arcFarFtps;
      const cArc = Math.max(-lim, Math.min(lim, eArc / W.aimSec));
      // Round 4 (the web research, its "half-gain trap"; checked here): on the circle closing is about omega (d - d_ss), so
      // d = d_ss + (wanted - closing) / omega settles at half the wanted closure. With arcFeedForward the wanted closure is
      // fed forward and the shortfall corrected at arcKc: d = d_ss + wanted / omega + kc (wanted - closing) / omega, which
      // settles at the wanted closure.
      const dRaw = W.arcFeedForward ? dss + cArc / omega + (W.arcKc * (cArc - closing)) / omega : dss + (cArc - closing) / omega;
      const want = Math.max(-W.arcOffsetMaxFt, Math.min(W.arcOffsetMaxFt, dRaw));
      offFt = w.offFt + Math.max(-W.arcSlewFtps * STEP_SEC, Math.min(W.arcSlewFtps * STEP_SEC, want - w.offFt));
      residual = Math.max(-W.powerBandKias * KT_TO_FTPS, Math.min(W.powerBandKias * KT_TO_FTPS, eArc / W.powerArcSec));
      if (W.speedFf && !straight && dFt != null) {
        // Round 4 (the web research: US Navy CNATRA P-357 section 310, power back a little first in a turn into him, on again
        // at the roll-out): the speed that holds station at his offset, V_L (1 - d / R), fed forward, its change from Lead's
        // smoothly held within speedFfKt (arctan saturation, as Wang et al. 2023)
        const Lff = W.speedFfKt * KT_TO_FTPS;
        const x = (-len3(leadV) * dFt) / seen.turn.radiusFt;
        residual += ((2 * Lff) / Math.PI) * Math.atan((Math.PI * x) / (2 * Lff));
      }
      cTarget = cArc;
    } else {
      const want = Math.max(-W.offsetMaxFt, Math.min(W.offsetMaxFt, (cWant + W.aimClosureGain * (cWant - closing)) / omega));
      offFt = w.offFt + Math.max(-W.aimSlewFtps * STEP_SEC, Math.min(W.aimSlewFtps * STEP_SEC, want - w.offFt));
      residual = cWant - len3(omegaL) * offFt;
      cTarget = cWant;
    }
    const inward = seen.turn.centre ? unit3(seen.turn.aPerp) : scale3(cone.left, job.dir || 1);
    target = add3(leadNow, scale3(inward, offFt));
    if (W.followCircle && seen.turn.centre) {
      // On or around Lead's circle (thread, 14 Oct 2026; SMM 12.30 para 74 "on, or around, the preceding aircraft's turn
      // circle"; Fable F3, F11): he follows the circle offFt inside Lead's (outside when negative), aiming at the point on it
      // circleLookSec of his flight ahead of where he is on it. From inside Lead's circle (a turn into him) that is the
      // manual's slight turn out toward Lead's track and then matching his turn (SMM 12.29 Fig 12.20); aiming at Lead himself
      // from there cut across at 60-70° of HCA and opened to 1,500-2,200 ft (T29a).
      const c = seen.turn.centre;
      const axis = unit3(seen.turn.omega);
      const rIn = perp3(sub3(st.pm, c), axis);
      const radial = len3(rIn) > 1 ? unit3(rIn) : unit3(sub3(seen.lead.p, c));
      const tangent = unit3(cross3(axis, radial)); // Lead's way round
      const rT = Math.max(W.circleLeastFt, seen.turn.radiusFt - offFt);
      const ang = Math.min(Math.PI / 2, (V * W.circleLookSec) / rT);
      target = add3(c, add3(scale3(radial, rT * Math.cos(ang)), scale3(tangent, rT * Math.sin(ang))));
      if (W.pathCaps) {
        // The path law's caps (Fable F7, second review; Q1's working answer): the angle of his line to that point off the
        // local tangent, at most +20° outward (lag: "slightly toward Lead's tail") and -12° inward (lead).
        const toT = perp3(sub3(target, st.pm), axis);
        const dist = Math.max(len3(toT), 1);
        const a = Math.atan2(dot3(toT, radial), dot3(toT, tangent));
        // Round 4 (Patrick 14 Oct 2026, his rulings on Fable's questions: very stretched he may cut across Lead's turn, then
        // reset onto a lead, lag or pure circle): beyond pathOpenFt of arc behind the inward cap is open, eased back to
        // pathInDeg by pathCloseFt
        const sBehind = arcFt ?? 0;
        const open = W.pathOpenFt == null ? 0 : Math.max(0, Math.min(1, (sBehind - W.pathCloseFt) / (W.pathOpenFt - W.pathCloseFt)));
        const inCap = W.pathInDeg * DEG + open * (Math.PI / 2 - W.pathInDeg * DEG);
        const ac = Math.max(-inCap, Math.min(W.pathOutDeg * DEG, a));
        target = add3(st.pm, scale3(add3(scale3(tangent, Math.cos(ac)), scale3(radial, Math.sin(ac))), dist));
      }
    }
    aimKind = offFt > W.routeFt / 4 ? 'lead' : offFt < -W.routeFt / 4 ? 'lag' : 'pure';
  } else {
    // Swept (Lead wings level, straight, climbing or descending): 625 ft at 45°, on the side the jobs chose, his place carried
    // sweptLookSec ahead along Lead's path so he flies to it in an arc, not a cut; fore and aft by power.
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
  // Lag first on a turn into him (the web research: US Navy CNATRA P-357 section 701, Lead's tail first, then inside; Patrick's
  // "turn slightly toward Lead's tail", SMM 12.29 Fig 12.20): once Lead's bank passes 10° toward #2's side, his path is
  // steered lagFirst.deg outward of Lead's circle's local tangent (Fable's steer-behind) for lagFirst.sec, then eased back to
  // the arc loop's aim over easeSec. Lead's bank leads his turn rate by the roll time, so it beats part of the 0.4 s delay.
  const LF = W.lagFirst;
  const bNow = seen.leadBankDeg;
  const intoNow = Math.abs(bNow) > W.turnStartDeg && Math.sign(bNow) === seen.levelSide;
  const intoBefore = w.leadBankDeg != null && Math.abs(w.leadBankDeg) > W.turnStartDeg && Math.sign(w.leadBankDeg) === Math.sign(bNow);
  let lagSec = Math.max(0, (w.lagSec ?? 0) - STEP_SEC);
  if (LF.on && intoNow && !intoBefore) lagSec = LF.sec + LF.easeSec;
  if (LF.on && lagSec > 0 && seen.turn.centre && Number.isFinite(seen.turn.radiusFt)) {
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
  // F6's action when it binds (Patrick 14 Oct 2026, his rulings on Fable's questions: never ahead of Lead's 3/9 line; flown
  // hot-turning-rejoin style, "nose pointed behind Lead, banking steeply in and down"): while the wing line is out of reach
  // in Lead's turn he aims at a point behind Lead, where Lead was guard.lagSec ago (about 380 ft back), and goes down, until
  // he is clearFt behind the wing line again. Rolling over Lead, the ruling's other remedy, is not built.
  const B = W.behind;
  const behindNowFt = -dot3(sub3(ownP, leadNow), unit3(leadV)); // + behind Lead's wing line
  let behindOn = false;
  if (B.on && job.turning) {
    behindOn = w.behindOn ? Boolean(w.lineShort) || behindNowFt < B.clearFt : Boolean(w.lineShort);
    if (behindOn) {
      // the point on Lead's circle his arc target behind him (650 ft), else where Lead was guard.lagSec ago
      target =
        B.onCircle && seen.turn.centre && Number.isFinite(seen.turn.radiusFt)
          ? add3(seen.turn.centre, rotate3(sub3(leadNow, seen.turn.centre), unit3(seen.turn.omega), -W.arcTargetFt / seen.turn.radiusFt))
          : sub3(leadNow, scale3(leadV, W.guard.lagSec));
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
  // Round 4: the aim line's turn fed forward is held within 1.5 times Lead's turn rate plus 3°/s (estimates): when his aim
  // changes (lag first, the nose-behind, a job's blend) the line jumps, and fed forward that jump read as a turn of up to
  // 115°/s, which the filter then judged held for 3 s.
  const ffMax = W.aimTurnCap ? W.aimTurnCap.k * len3(omegaL) + W.aimTurnCap.plusDps * DEG : Infinity;
  const aimTurn = len3(aimTurnRaw) > ffMax ? scale3(unit3(aimTurnRaw), ffMax) : aimTurnRaw;

  // ---- steering, in the turn plane: the aim line's turn fed forward, plus P on the angle off it ----
  const uIn = len3(flat(u)) > 1e-6 ? unit3(flat(u)) : u;
  const angleDeg = Math.acos(Math.max(-1, Math.min(1, dot3(uIn, d)))) / DEG;
  const toward = flat(perp3(d, u));
  const n = len3(toward) > 1e-9 ? unit3(toward) : { x: 0, y: 0, z: 0 };
  const aFf = scale3(cross3(aimTurn, u), V); // his speed x the aim line's turn
  const aP = scale3(n, G_FTPS2 * W.gPerDeg * angleDeg);
  // ---- the vertical, square to the turn plane, PD (spec 7e.7): one pitch owner (F7). Fable F9 (second review): pass-clear
  // (below, above if already more than 100 ft high), then the high yo-yo (F8), then the stack's family (low inside, the
  // quick fix, the stack 50 ft below); an owner keeps pitch at least 2 s unless pass-clear takes it. ----
  const Y = W.yoyo;
  const eArc = arcFt == null ? null : arcFt - W.arcTargetFt;
  // The high yo-yo (Fable F8; Patrick 14 Oct 2026, card "High yo-yo, then back down"): inside Lead's turn and gaining on him,
  // he climbs out of Lead's plane to kill the horizontal closure and bleed speed, then comes back down behind him.
  let yoyo = w.yoyo ?? { phase: null, hFt: 0 };
  let yoyoNeedFt = null;
  // its height: Fable's formula, limited only by the cone's height band (Patrick 14 Oct 2026: "as long as wg stays in the cone
  // anything is permissable"), FW_WING.heightBandFt (TS-80), unless maxFt is set
  const yoyoMax = Y.maxFt ?? W.heightBandFt;
  if (Y.on) {
    let slowKt = 0;
    if (job.turning && dFt != null && seen.turn.centre && Number.isFinite(seen.turn.radiusFt)) {
      // the speed that holds his radius round Lead's centre at Lead's turn rate, and the height whose speed loss cancels
      // the rest: h = (V^2 - (omega r)^2) / 2g (Fable F8; standard energy)
      const vHold = len3(omegaL) * Math.max(0, seen.turn.radiusFt - dFt);
      yoyoNeedFt = (V * V - vHold * vHold) / (2 * G_FTPS2);
      slowKt = st.kias - tasToIasKt(vHold / KT_TO_FTPS, st.pm.z);
    }
    // the climb's over: on Lead's circle with the arc error under 150 ft, or well behind his place, or Lead's turn over
    // Round 4: also over once he is no longer closing round the circle (its purpose, killing the closure, met)
    const done = !job.turning || eArc == null || eArc > Y.exitArcFt || (Math.abs(eArc) < Y.exitArcFt && Math.abs(dFt ?? 0) < Y.onCircleFt) || (Y.excessFtps != null && yoyo.phase === 'up' && closing < 0);
    // Round 4: the speed trigger only while he is closing round the circle faster than the arc loop wants by excessFtps (it
    // fired at 554 ft, 13 ft/s, in the turn away and climbed 470 ft, 42 kt lost)
    const gaining = Y.excessFtps == null || (arcFt != null && closing - Math.max(-W.arcFarFtps, Math.min(W.arcFarFtps, (eArc ?? 0) / W.aimSec)) > Y.excessFtps);
    // the trigger: the wing line out of reach (F6), or the speed that holds his radius more than 10 kt under his own with
    // power already back
    const trigger = !done && ((Boolean(w.lineShort) && !B.on) || (slowKt > Y.slowKt && Boolean(w.powerBack) && gaining));
    if (yoyo.phase !== 'up' && trigger) yoyo = { phase: 'up', hFt: Math.min(yoyoMax, Math.max(Y.minFt, yoyoNeedFt ?? 0)) };
    else if (yoyo.phase === 'up') yoyo = done ? { phase: 'down', hFt: 0 } : { phase: 'up', hFt: Math.min(yoyoMax, Math.max(yoyo.hFt, yoyoNeedFt ?? 0)) };
    else if (yoyo.phase === 'down' && seen.heightFt - job.heightFt < Y.downEndFt) yoyo = { phase: null, hFt: 0 };
  }
  const passClearWanted = W.guard.filter ? guard.on && (w.filterHold ?? 0) > 0 : guard.on;
  let owner = w.owner ?? { name: 'stack', sec: 0, vert: -1 };
  // the nose-behind's descent (F6's action, above) ahead of the climb: pass-clear, then in and down, then the yo-yo
  let want = behindOn && !passClearWanted ? 'inDown' : Y.on && yoyo.phase ? 'yoyo' : passClearWanted ? 'passClear' : 'stack';
  // 2 s between owners (Fable F9, estimate); pass-clear and the nose-behind take pitch at once
  if (Y.on && want !== owner.name && owner.sec < Y.ownerHoldSec && want !== 'passClear' && want !== 'inDown') want = owner.name;
  const takeOwner = (name) =>
    name === owner.name
      ? { ...owner, sec: owner.sec + STEP_SEC }
      : { name, sec: 0, vert: Y.on ? (seen.heightFt > Y.highFt ? 1 : -1) : guard.vert };
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
    // His lift (G, a vector): what holds his path against his weight, the vertical, then the turn; within his G. One pitch
    // owner (F7): the vertical is given its share first, the steering the rest, so a hard turn never takes the height away.
    const hold = add3(perp3(Z, u), scale3(perp3(aV, u), 1 / G_FTPS2)); // 1 G's share square to his path, and the vertical
    return { dz, errFt, aV, hold };
  };
  const aTurn0 = perp3(add3(aFf, aP), u);
  // ---- the separation filter (thread, 14 Oct 2026; spec 7e.7's guard as a predictor with priority, Fable F1, F16, F17): his
  // aim's turn is flown unless the pass it predicts (him holding that turn, Lead holding his and one step tighter, over the
  // guard's look) comes inside engageFt; then the turn nearest to it that keeps the pass outside engageFt. Lead turning into
  // him from in position, that is a slight turn toward Lead's tail ("collapse to the 6 by turning slightly toward lead",
  // SMM 12.29 Fig 12.20), and the reversal onto Lead's circle comes by itself as soon as his aim's turn keeps the pass clear
  // (Fig 12.20 step 2): no aim point, no miss and reverse phases to cycle between. ----
  const runFilter = ({ errFt, aV, hold }) => {
    let aTurn = aTurn0;
    let filterPull = false;
    let filterOn = false;
    let lineShort = false; // the wing line out of reach this step (Fable F6): the high yo-yo's trigger (F8)
    let filterHold = Math.max(0, (w.filterHold ?? 0) - STEP_SEC);
    let filterSide = w.filterSide ?? 0;
    let passShort = false; // his aim's own turn passes inside the pass line
    let cleared = true; // a turn was found that keeps the pass outside it
    let passFt = null;
  let engaged = Boolean(w.filterEngaged); // the filter engaged (round 4, with hysteresis)
  let engageClear = w.filterClearSec ?? 0;
  let omNom = null; // his aim's turn and the filter's, deg/s in the turn plane (+ left), for the trace
  let omPick = null;
    if (W.guard.filter) {
      const side = unit3(cross3(out, u)); // his left in the turn plane
      const omegaNom = dot3(aTurn, side) / V; // rad/s, + turning left
      omNom = omegaNom / DEG;
      const horizon = W.guard.lookSec + (W.deadReckon ? 0 : FW_SEE.delaySec);
      const lp0 = W.deadReckon ? leadNow : seen.lead.p;
      const leadAsIs = { p: lp0, v: leadV, omega: seen.turn.omega };
      const leadTighter = { p: lp0, v: leadV, omega: scale3(seen.turn.omega, W.guard.tighter) };
      // For a candidate turn: the least pass (slant) and the least distance behind Lead's wing line over the look, the worse of
      // Lead as he is and one step tighter.
      const predFor = (om) => {
        // Round 4: each turn held over the path law's look (circleLookSec), then Lead's turn (the capture of his circle, SMM 12.29
        // Fig 12.20), when guard.capture; else held all the look.
        const me = { p: ownP, v: ownV, omega: scale3(out, om), thenSec: W.guard.capture && job.turning ? W.circleLookSec : null };
        // One lift (Fable F3): the vertical he is asking for is a known term in the pass, its height counted in the slant.
        const extra = W.guard.sharedLift ? { acc: aV, maxFt: Math.abs(errFt) } : null;
        const a = leastPass(leadAsIs, me, horizon, extra);
        const b = leastPass(leadTighter, me, horizon, extra);
        if (!W.guard.tighterAtMin) return { pass: Math.min(a.leastFt, b.leastFt), behind: Math.min(a.behindLeastFt, b.behindLeastFt) };
        // Round 4: Lead one step tighter is held to the 500 ft rule itself, Lead as he is to the pass line; the one number
        // compared with the pass line meets both, so the widest pass is still one measure. The wing line: Lead as he is.
        return { pass: Math.min(a.leastFt, b.leastFt + (passLine - W.guard.minFt)), behind: a.behindLeastFt };
      };
      const passFor = (om) => predFor(om).pass;
      // The pass line (Fable F4, second review; Q2's working answer, read with Patrick's bubble ruling): 500 ft plus the range
      // the closure he sees covers in the 1.4 s his picture is old (0.4 s late, 1 s smoothing), never under 600 ft.
      const passLine = W.guard.passLine
        ? Math.max(W.guard.engageFt, W.guard.minFt + W.guard.passLineSec * Math.max(0, seen.closure))
        : W.guard.engageFt;
      // The wing line (Fable F6): at least wingLineFt behind it over the look; off, no second constraint.
      const lineOk = (p) => !W.guard.wingLine || p.behind >= W.guard.wingLineFt;
      const nom = predFor(omegaNom);
      passFt = nom.pass;
      passShort = nom.pass < passLine;
      // Round 4 (Fable F12; the web research's side-switching item): the filter, once engaged, stays engaged until his aim's
      // own turn clears both lines by marginFt for releaseSec, so it does not switch on and off at the pass line.
      const H = W.guard.engage;
      if (H) {
        const failing = nom.pass < passLine || !lineOk(nom);
        const clearBy = nom.pass >= passLine + H.marginFt && (!W.guard.wingLine || nom.behind >= W.guard.wingLineFt + H.marginFt);
        if (failing) {
          engaged = true;
          engageClear = 0;
        } else if (engaged) {
          engageClear = clearBy ? engageClear + STEP_SEC : 0;
          if (engageClear >= H.releaseSec) engaged = false;
        }
        if (engaged) filterHold = Math.max(filterHold, W.guard.filterHoldSec * (H.holdsPower ? 1 : 0));
      }
      if (W.guard.wingLine) {
        if (nom.pass < passLine || !lineOk(nom)) {
          filterOn = true;
          const gMost = W.guard.shakerBound
            ? Math.min(shakerG(st.kias), Math.max(seen.leadG + W.overLeadG, availableG(st.kias)))
            : Math.max(seen.leadG + W.overLeadG, Math.min(availableG(st.kias), shakerG(st.kias)));
          const gHold = W.guard.sharedLift ? len3(hold) : 1;
          const omMax = (G_FTPS2 * Math.sqrt(Math.max(0, gMost * gMost - gHold * gHold))) / V;
          const N = W.guard.filterSteps;
          const cands = [];
          for (let k = -N; k <= N; k++) {
            const om = (omMax * k) / N;
            cands.push({ om, ...predFor(om) });
          }
          // The turn nearest his aim's that meets ok, on the side he chose last step unless only the other side does, refined
          // between it and its neighbour toward his aim's turn; null when none does.
          const choose = (ok) => {
            let best = null;
            for (const c of cands) {
              if (!ok(c)) continue;
              const sideK = Math.sign(c.om - omegaNom) || 1;
              // Round 4 (guard.lagSide): in Lead's turn the lag side, turning less than his aim does in Lead's direction (toward
              // Lead's tail, outside his circle), is taken before the inside, whose escape (turning harder inside Lead's circle)
              // carried him round inside it, abeam and 5,000 ft away (the turn into him from tight, gauge r4bi2)
              const insideK = Math.sign(dot3(seen.turn.omega, out)) || 0;
              const lagPenalty = W.guard.lagSide && turning && insideK && sideK === insideK ? 2 * omMax : 0;
              const cost = Math.abs(c.om - omegaNom) + (filterSide && sideK !== filterSide ? omMax : 0) + lagPenalty;
              if (!best || cost < best.cost) best = { ...c, cost, sideK };
            }
            if (!best) return null;
            let lo = best.om;
            let hi = best.om - best.sideK * (omMax / N);
            for (let r = 0; r < W.guard.filterRefine; r++) {
              const mid = (lo + hi) / 2;
              if (ok(predFor(mid))) lo = mid;
              else hi = mid;
            }
            return { om: lo, sideK: best.sideK };
          };
          const passOk = (c) => c.pass >= passLine;
          let pick = choose((c) => passOk(c) && lineOk(c));
          if (!pick) {
            // Range wins (Fable F6): the wing line is dropped and the pass line kept; the wing line's being out of reach is the
            // high yo-yo's trigger (F8). His aim's own turn clearing the pass line is then left alone.
            // Round 4: out of reach means no turn at all keeps him behind the wing line (lineShortAll); a turn that keeps him
            // behind it but inside the pass line is the pass line's trouble, not the wing line's.
            lineShort = W.guard.lineShortAll ? !cands.some(lineOk) : true;
            pick = passOk(nom) ? { om: omegaNom, sideK: 0, free: true } : choose(passOk);
          }
          // none clears: the turn that passes widest
          cleared = Boolean(pick);
          // none clears the pass line: with lagSide, the lag-side turn nearest his aim's that keeps the pass outside the 500 ft
          // rule (passLine less the closure allowance: minFt), else the turn that passes widest
          const insideK0 = Math.sign(dot3(seen.turn.omega, out)) || 0;
          const lagRescue =
            !pick && W.guard.lagSide && turning && insideK0
              ? choose((c) => c.pass >= W.guard.minFt && (Math.sign(c.om - omegaNom) || 1) !== insideK0)
              : null;
          if (lagRescue) pick = lagRescue;
          const om = pick ? pick.om : cands.reduce((x, c) => (c.pass > x.pass ? c : x)).om;
          omPick = om / DEG;
          if (pick?.free) filterOn = false;
          else filterSide = pick ? pick.sideK : filterSide;
          if (filterOn) {
            aTurn = add3(perp3(aTurn, side), scale3(side, om * V)); // only the turn in the plane changes
            filterHold = W.guard.filterHoldSec;
            filterPull = Math.hypot(1, (om * V) / G_FTPS2) > seen.leadG + W.overLeadG;
          } else filterSide = 0;
        } else filterSide = 0;
      } else if (nom.pass < passLine) {
        filterOn = true;
        // The candidates stop at the stick-shaker's G at his speed now, a physical limit (Fable F2, second review; Q5's working
        // answer: stop at the shaker and use height and power). Before, Lead + 1.5 G could pass it when he was slow.
        const gMost = W.guard.shakerBound
          ? Math.min(shakerG(st.kias), Math.max(seen.leadG + W.overLeadG, availableG(st.kias)))
          : Math.max(seen.leadG + W.overLeadG, Math.min(availableG(st.kias), shakerG(st.kias)));
        // The turn the G leaves after what holds him up and the vertical he asks for (Fable F3: one lift for both); before,
        // 1 G only, so a climb or a pass-clear below took turn away that the filter had counted on.
        const gHold = W.guard.sharedLift ? len3(hold) : 1;
        const omMax = (G_FTPS2 * Math.sqrt(Math.max(0, gMost * gMost - gHold * gHold))) / V;
        const N = W.guard.filterSteps;
        let best = null;
        let bestPass = -Infinity;
        let bestOm = omegaNom;
        for (let k = -N; k <= N; k++) {
          const om = (omMax * k) / N;
          const pass = passFor(om);
          if (pass > bestPass) {
            bestPass = pass;
            bestOm = om;
          }
          if (pass < passLine) continue;
          // nearest to his aim's turn; on the side he chose last step unless only the other side clears (no flip-flop)
          const sideK = Math.sign(om - omegaNom) || 1;
          const cost = Math.abs(om - omegaNom) + (filterSide && sideK !== filterSide ? omMax : 0);
          if (!best || cost < best.cost) best = { om, cost, sideK };
        }
        let om = bestOm; // nothing clears: the turn that passes widest
        cleared = Boolean(best);
        if (best) {
          // refine between the clearing turn and its neighbour toward his aim's turn
          let lo = best.om;
          let hi = best.om - best.sideK * (omMax / N);
          for (let r = 0; r < W.guard.filterRefine; r++) {
            const mid = (lo + hi) / 2;
            if (passFor(mid) >= passLine) lo = mid;
            else hi = mid;
          }
          om = lo;
          filterSide = best.sideK;
        }
        aTurn = add3(perp3(aTurn, side), scale3(side, om * V)); // only the turn in the plane changes
        filterHold = W.guard.filterHoldSec;
        filterPull = (Math.hypot(1, (om * V) / G_FTPS2) > seen.leadG + W.overLeadG);
      } else filterSide = 0;
    }
    if (!W.guard.engage) engaged = filterOn;
    return { aTurn, filterPull, filterOn, lineShort, filterHold, filterSide, passShort, cleared, passFt, omNom, omPick: filterOn ? omPick : null, engaged, engageClear };
  };
  let vert = vertFor(dzOf(owner));
  let flt = runFilter(vert);
  if (Y.on && owner.name === 'yoyo' && yoyo.phase === 'up' && flt.passShort && !flt.cleared) {
    // the climb can't keep the pass outside the line: pass-clear has pitch (Fable F9)
    owner = takeOwner('passClear');
    vert = vertFor(dzOf(owner));
    flt = runFilter(vert);
  }
  const { dz, errFt, aV, hold } = vert;
  const { aTurn, filterPull, filterOn, lineShort, filterHold, filterSide, passFt, omNom, omPick, engaged, engageClear } = flt;
  // who has pitch this step, for the trace (Fable Q7's working answer: log it)
  const pitchOwner =
    owner.name === 'passClear' ? 'passClear' : owner.name === 'inDown' ? 'inDown' : owner.name === 'yoyo' && yoyo.phase === 'up' ? 'highYoYo' : owner.name === 'yoyo' && yoyo.phase === 'down' ? 'yoyoDown' : job.low ? 'lowInside' : job.quick ? 'quickFix' : 'stack';
  const capNormal = Math.min(seen.leadG + W.overLeadG, shakerG(st.kias));
  // The guard pulls past Lead + 1.5 G only while the pass it predicts is still inside 500 ft (flagged), up to what the
  // aircraft gives (Patrick 14 Oct 2026: references, not walls); otherwise it keeps the estimate as the rest of his flying.
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
  // Unload, roll, pull (T29a): while his wings are still rolling to where the lift is wanted he pulls only the lift's share
  // along where they are now; a pilot never pulls hard with his wings the wrong way (fw-live.js does the same). In T29's
  // first attempt he rolled 160° at 60°/s pulling 3.5 G all the way, so the pull went up: 650 ft above Lead, 33 KIAS lost.
  const along = dot3(lift, st.bodyUp);
  if (len3(lift) > 1e-9 && along < len3(lift) * Math.cos(W.pullWithinDeg * DEG)) lift = scale3(unit3(lift), Math.max(W.minG, along));
  if (len3(lift) < W.minG) lift = len3(lift) > 1e-9 ? scale3(unit3(lift), W.minG) : scale3(unit3(hold), W.minG);

  // ---- power (slowest; spec 7e.7): off in the guard's miss, else Lead's speed plus the closure the aim can't give, PI,
  // within 15 KIAS of Lead (power last, but as required) ----
  const band = W.powerBandKias * KT_TO_FTPS;
  // With the filter, power is off (and the miss's height flown) while it is changing his turn and filterHoldSec after.
  // Round 4: only while he is closing (round Lead's circle in a turn, else on the slant); opening, power is the power loop's,
  // so a filter held on all the turn no longer takes the speed with it (r4f8: -59 kt in the turn into him).
  const missPower = W.guard.filter ? filterHold > 0 && (!W.guard.offClosingOnly || closing > 0) : guard.on && guard.phase === 'miss';
  const P = missPower ? 0 : residual;
  // I on the closure he wants against the closure he has, slow (15 s), so a steady shortfall (the outside of a turn, a
  // climb) is trimmed out, and none builds while it is met
  // In a turn power serves only what the aim can't give (one owner for closure, T29a): no integral there, it is held.
  const iRaw = w.powerI + (guard.on || job.turning ? 0 : ((cTarget - cActual) * STEP_SEC) / W.powerSec);
  const powerI = Math.max(-band, Math.min(band, iRaw)); // held at its limits
  const wantTas = vL + Math.max(-band, Math.min(band, P + powerI)); // ft/s
  const wantKias = tasToIasKt(wantTas / KT_TO_FTPS, seen.lead.p.z);
  // Low inside, at MAX (the ruling): short of energy in the turn, power is MAX, not the slow PI.
  // The yo-yo's way down (Fable F8): power back while he is faster than Lead, so drag bleeds off what the descent gives back.
  const downPower = Y.on && pitchOwner === 'yoyoDown' && st.kias > leadKias;
  const lowMax = job.low && (!Y.on || owner.name === 'stack');
  const power = missPower || downPower ? { throttle: throttleAtTorque(W.guard.torquePct, st.kias, st.pm.z) } : lowMax ? { throttle: 1 } : { holdKias: wantKias };
  // Idle and the boards (Patrick 14 Oct 2026, his rulings on Fable's questions: his to use, smartly, since it is easy to get
  // stretched after): only while he closes faster than power back answers (idleFtps, boardsFtps) and is inside the happy band
  // or closing on the pass line, and not already slow; released early (idleOffFtps, boardsOffFtps), the engine taking 3.5 s
  // to spool up from idle (live/handling.js ENGINE). Flagged in the trace (BOARDS, IDLE).
  const BI = W.brakes;
  let idle = false;
  let boards = false;
  if (BI) {
    const cNow = job.turning && arcFt != null ? closing : seen.closure;
    const where = seen.slant < W.happyFt[1] || (flt.passShort && seen.closure > 0);
    const fastEnough = st.kias > leadKias - BI.slowKt;
    idle = fastEnough && (w.idle ? cNow > BI.idleOffFtps : cNow > BI.idleFtps && where);
    boards = fastEnough && (w.boards ? cNow > BI.boardsOffFtps : cNow > BI.boardsFtps && where);
  }
  const powerBack = missPower || downPower || idle || wantKias < leadKias - Y.powerBackKt;
  const next = stepLead(st, { lift, roll: { ...ROLL, maxRateDps: W.rollDps }, ...(idle ? { throttle: 0 } : power), ...(boards ? { boards: true } : {}) });
  const gAsk = len3(lift);
  const jobName = (W.guard.engage ? engaged : filterOn) ? 'guard-filter' : guard.on && !W.guard.filter ? `guard-${guard.phase}` : job.turning ? `turn-${job.entry ? `${job.entry.into ? 'into' : 'away'}-${job.entry.range}` : 'on'}` : job.sTurn ? 'sTurn' : 'swept';
  return {
    w: { ...w, st: next, sight: mem, guard, job, aimDir: d, aimTurn, t: w.t + STEP_SEC, offFt, aimOff, powerI, filterSide, filterHold, arcFt, arcClosure: arcFt == null ? null : closing, yoyo, owner, lineShort, powerBack, behindOn, idle, boards, filterEngaged: engaged, filterClearSec: engageClear, lagSec, leadBankDeg: bNow },
    trace: {
      t: w.t + STEP_SEC, job: jobName, aim: aimKind, offFt: Math.round(offFt), predFt: Math.round(guard.predFt),
      slant: seen.slant, closure: seen.closure, losDps: seen.losDps, aspectDeg: seen.aspectDeg, hcaDeg: seen.hcaDeg,
      heightTargetFt: Math.round(dz), wantKias, gAsk, overEstimate: guard.on && gAsk > capNormal + 1e-6,
      cWantFtps: guard.on ? null : cTarget, cActualFtps: cActual, low: job.low, sFt: arcFt == null ? null : Math.round(arcFt), dFt: dFt == null ? null : Math.round(dFt), pitchOwner: pitchOwner ?? null, lineShort, passFt: passFt == null ? null : Math.round(passFt), yoyoFt: yoyo.phase === 'up' ? Math.round(yoyo.hFt) : null, omNomDps: omNom, omPickDps: omPick, brakes: boards ? (idle ? 'IDLE + BOARDS' : 'BOARDS') : idle ? 'IDLE' : null,
    },
  };
}
