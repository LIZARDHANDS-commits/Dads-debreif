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
import { startFwGuard, fwGuard } from './supervisor.js';

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
  return { st, sight, guard: startFwGuard(), aimDir, aimTurn: { x: 0, y: 0, z: 0 }, blockFt, t: 0 };
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

  // ---- the aim: Lead as he sees him, carried across the 0.4 s (pure), or where Lead was (the guard's miss) ----
  const missing = guard.on && guard.phase === 'miss';
  const leadNow = add3(seen.lead.p, scale3(seen.lead.v, FW_SEE.delaySec));
  const at = missing ? seen.wasAt(W.guard.lagSec) : leadNow;
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
  // ---- the vertical, square to the turn plane: one pitch owner, the guard's miss, else his stack 50 ft below (spec 7e.7's
  // vertical loop, PD) ----
  const dz = guard.on ? guard.vert * guard.missFt : W.stackFt;
  const errFt = dot3(sub3(add3(leadNow, scale3(Z, dz)), st.pm), out); // + he has to go toward the normal (up)
  const errRate = -dot3(sub3(st.vel, seen.lead.v), out);
  const vertG = Math.max(-W.vertMaxG, Math.min(W.vertMaxG, W.vertGPerFt * errFt + W.vertGPerFtps * errRate));
  const aV = scale3(out, vertG * G_FTPS2);
  const aTurn = perp3(add3(add3(aFf, aP), aV), u);
  // His lift (G, a vector): what holds his path against his weight, plus the turn; within his G.
  const hold = perp3(Z, u); // 1 G's share square to his path
  const capNormal = Math.min(seen.leadG + W.overLeadG, shakerG(st.kias));
  // The guard pulls past Lead + 1.5 G only while the pass it predicts is still inside 500 ft (flagged), up to what the
  // aircraft gives (Patrick 14 Oct 2026: references, not walls); otherwise it keeps the estimate as the rest of his flying.
  const cap = guard.on && guard.predFt < W.guard.minFt ? Math.max(capNormal, Math.min(availableG(st.kias), shakerG(st.kias))) : capNormal;
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
  if (len3(lift) < W.minG) lift = len3(lift) > 1e-9 ? scale3(unit3(lift), W.minG) : scale3(unit3(hold), W.minG);

  // ---- power: off in the guard's miss, else Lead's speed (indicated, from what he sees of Lead's true speed) ----
  const leadKias = tasToIasKt(len3(seen.lead.v) / KT_TO_FTPS, seen.lead.p.z);
  const power = guard.on && guard.phase === 'miss' ? { throttle: throttleAtTorque(W.guard.torquePct, st.kias, st.pm.z) } : { holdKias: leadKias };
  const next = stepLead(st, { lift, roll: { ...ROLL, maxRateDps: W.rollDps }, ...power });
  const gAsk = len3(lift);
  return {
    w: { ...w, st: next, sight: mem, guard, aimDir: d, aimTurn, t: w.t + STEP_SEC },
    trace: {
      t: w.t + STEP_SEC, job: guard.on ? `guard-${guard.phase}` : 'pure', aim: missing ? 'wasLead' : 'lead', predFt: Math.round(guard.predFt),
      slant: seen.slant, closure: seen.closure, losDps: seen.losDps, aspectDeg: seen.aspectDeg, hcaDeg: seen.hcaDeg,
      gAsk, overEstimate: guard.on && gAsk > capNormal + 1e-6,
    },
  };
}
