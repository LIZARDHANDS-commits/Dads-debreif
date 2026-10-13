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
import { seenOf, startFwSight, seeFw } from './perception.js';
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
  const leadNow = add3(seen.lead.p, scale3(seen.lead.v, FW_SEE.delaySec));
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
  if (W.followCircle && seen.turn.centre && job.turning) {
    const c = seen.turn.centre;
    const axis = unit3(seen.turn.omega);
    const rL = perp3(sub3(seen.lead.p, c), axis);
    const rMe = perp3(sub3(seen.own.p, c), axis);
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
    const want = Math.max(-W.offsetMaxFt, Math.min(W.offsetMaxFt, (cWant + W.aimClosureGain * (cWant - closing)) / omega));
    offFt = w.offFt + Math.max(-W.aimSlewFtps * STEP_SEC, Math.min(W.aimSlewFtps * STEP_SEC, want - w.offFt));
    residual = cWant - len3(omegaL) * offFt;
    cTarget = cWant;
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
  // A change of job blends his aim (against Lead's place) over about 1.5 s; the guard's at once (F17).
  const offNow = sub3(target, leadNow);
  const aimOff = guard.on || !w.aimOff ? offNow : ease3(w.aimOff, offNow, W.blendSec);
  const at = add3(leadNow, aimOff);
  const dIn = flat(sub3(at, st.pm));
  const d = len3(dIn) > 1e-6 ? unit3(dIn) : u;
  const aimTurn = ease3(w.aimTurn, scale3(cross3(w.aimDir, sub3(d, w.aimDir)), 1 / STEP_SEC), W.aimTurnSec);

  // ---- steering, in the turn plane: the aim line's turn fed forward, plus P on the angle off it ----
  const uIn = len3(flat(u)) > 1e-6 ? unit3(flat(u)) : u;
  const angleDeg = Math.acos(Math.max(-1, Math.min(1, dot3(uIn, d)))) / DEG;
  const toward = flat(perp3(d, u));
  const n = len3(toward) > 1e-9 ? unit3(toward) : { x: 0, y: 0, z: 0 };
  const aFf = scale3(cross3(aimTurn, u), V); // his speed x the aim line's turn
  const aP = scale3(n, G_FTPS2 * W.gPerDeg * angleDeg);
  // ---- the vertical, square to the turn plane: one pitch owner (F7), the guard's miss, else the jobs' height target (the
  // quick fix's or his stack 50 ft below), PD (spec 7e.7) ----
  const dz = (W.guard.filter ? guard.on && (w.filterHold ?? 0) > 0 : guard.on) ? guard.vert * guard.missFt : job.heightFt;
  const errFt = dot3(sub3(add3(leadNow, scale3(Z, dz)), st.pm), out); // + he has to go toward the normal (up)
  const errRate = -dot3(sub3(st.vel, seen.lead.v), out);
  const vertG = Math.max(-W.vertMaxG, Math.min(W.vertMaxG, W.vertGPerFt * errFt + W.vertGPerFtps * errRate));
  const aV = scale3(out, vertG * G_FTPS2);
  // His lift (G, a vector): what holds his path against his weight, the vertical, then the turn; within his G. One pitch
  // owner (F7): the vertical is given its share first, the steering the rest, so a hard turn never takes the height away.
  const hold = add3(perp3(Z, u), scale3(perp3(aV, u), 1 / G_FTPS2)); // 1 G's share square to his path, and the vertical
  let aTurn = perp3(add3(aFf, aP), u);
  // ---- the separation filter (thread, 14 Oct 2026; spec 7e.7's guard as a predictor with priority, Fable F1, F16, F17): his
  // aim's turn is flown unless the pass it predicts (him holding that turn, Lead holding his and one step tighter, over the
  // guard's look) comes inside engageFt; then the turn nearest to it that keeps the pass outside engageFt. Lead turning into
  // him from in position, that is a slight turn toward Lead's tail ("collapse to the 6 by turning slightly toward lead",
  // SMM 12.29 Fig 12.20), and the reversal onto Lead's circle comes by itself as soon as his aim's turn keeps the pass clear
  // (Fig 12.20 step 2): no aim point, no miss and reverse phases to cycle between. ----
  let filterPull = false;
  let filterOn = false;
  let filterHold = Math.max(0, (w.filterHold ?? 0) - STEP_SEC);
  let filterSide = w.filterSide ?? 0;
  if (W.guard.filter) {
    const side = unit3(cross3(out, u)); // his left in the turn plane
    const omegaNom = dot3(aTurn, side) / V; // rad/s, + turning left
    const horizon = W.guard.lookSec + FW_SEE.delaySec;
    const leadAsIs = { p: seen.lead.p, v: seen.lead.v, omega: seen.turn.omega };
    const leadTighter = { p: seen.lead.p, v: seen.lead.v, omega: scale3(seen.turn.omega, W.guard.tighter) };
    const passFor = (om) => {
      const me = { p: seen.own.p, v: seen.own.v, omega: scale3(out, om) };
      return Math.min(leastPass(leadAsIs, me, horizon).leastFt, leastPass(leadTighter, me, horizon).leastFt);
    };
    if (passFor(omegaNom) < W.guard.engageFt) {
      filterOn = true;
      const gMost = Math.max(seen.leadG + W.overLeadG, Math.min(availableG(st.kias), shakerG(st.kias)));
      const omMax = (G_FTPS2 * Math.sqrt(Math.max(0, gMost * gMost - 1))) / V;
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
        if (pass < W.guard.engageFt) continue;
        // nearest to his aim's turn; on the side he chose last step unless only the other side clears (no flip-flop)
        const sideK = Math.sign(om - omegaNom) || 1;
        const cost = Math.abs(om - omegaNom) + (filterSide && sideK !== filterSide ? omMax : 0);
        if (!best || cost < best.cost) best = { om, cost, sideK };
      }
      let om = bestOm; // nothing clears: the turn that passes widest
      if (best) {
        // refine between the clearing turn and its neighbour toward his aim's turn
        let lo = best.om;
        let hi = best.om - best.sideK * (omMax / N);
        for (let r = 0; r < W.guard.filterRefine; r++) {
          const mid = (lo + hi) / 2;
          if (passFor(mid) >= W.guard.engageFt) lo = mid;
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
  const missPower = W.guard.filter ? filterHold > 0 : guard.on && guard.phase === 'miss';
  const P = missPower ? 0 : residual;
  // I on the closure he wants against the closure he has, slow (15 s), so a steady shortfall (the outside of a turn, a
  // climb) is trimmed out, and none builds while it is met
  // In a turn power serves only what the aim can't give (one owner for closure, T29a): no integral there, it is held.
  const iRaw = w.powerI + (guard.on || job.turning ? 0 : ((cTarget - cActual) * STEP_SEC) / W.powerSec);
  const powerI = Math.max(-band, Math.min(band, iRaw)); // held at its limits
  const wantTas = vL + Math.max(-band, Math.min(band, P + powerI)); // ft/s
  const wantKias = tasToIasKt(wantTas / KT_TO_FTPS, seen.lead.p.z);
  // Low inside, at MAX (the ruling): short of energy in the turn, power is MAX, not the slow PI.
  const power = missPower ? { throttle: throttleAtTorque(W.guard.torquePct, st.kias, st.pm.z) } : !missPower && job.low ? { throttle: 1 } : { holdKias: wantKias };
  const next = stepLead(st, { lift, roll: { ...ROLL, maxRateDps: W.rollDps }, ...power });
  const gAsk = len3(lift);
  const jobName = filterOn ? 'guard-filter' : guard.on && !W.guard.filter ? `guard-${guard.phase}` : job.turning ? `turn-${job.entry ? `${job.entry.into ? 'into' : 'away'}-${job.entry.range}` : 'on'}` : job.sTurn ? 'sTurn' : 'swept';
  return {
    w: { ...w, st: next, sight: mem, guard, job, aimDir: d, aimTurn, t: w.t + STEP_SEC, offFt, aimOff, powerI, filterSide, filterHold, arcFt, arcClosure: arcFt == null ? null : closing },
    trace: {
      t: w.t + STEP_SEC, job: jobName, aim: aimKind, offFt: Math.round(offFt), predFt: Math.round(guard.predFt),
      slant: seen.slant, closure: seen.closure, losDps: seen.losDps, aspectDeg: seen.aspectDeg, hcaDeg: seen.hcaDeg,
      heightTargetFt: Math.round(dz), wantKias, gAsk, overEstimate: guard.on && gAsk > capNormal + 1e-6,
      cWantFtps: guard.on ? null : cTarget, cActualFtps: cActual, low: job.low,
    },
  };
}
