// #2 in fluid manoeuvring, the planned wingman (spec section 10.3, TS-57; Patrick 4 Oct 18:03Z: "Can we have it be a
// setting? defaults to planned?"). #2 is a scripted position, worked out from Lead's planned path, never live physics.
//
// The rule a pilot flies (EFIG p.391: "go where Lead was and do what Lead did"): #2 flies along Lead's own path a few
// seconds behind him, at the straight-line distance the setting asks (500-1,000 ft, default 600; Patrick's picks of
// 19:20Z rows 3 and 4), with two offsets:
//  - across, inside the cone and never straight behind (Patrick 19:21Z: "a lateral offset in case of overshoot, so they
//    kind of hang out in the cone instead of directly behind"): 15° off Lead's tail, 10° in a steep turn (the collapse
//    toward the six, AFM7 brief p.14), out of the 30° half cone of Patrick's pick row 2. Both are estimates. Across is
//    measured in a frame that follows Lead's path but not his roll (design 5.2).
//  - in the plane Lead is turning in, the pursuit: outside Lead's path is lag, on it pure, inside lead (SMM 12.30 paras
//    72-74; EFIG p.391: lead puts the path inside Lead's turn circle, lag outside). The offset is 10% of the range, an
//    estimate, and scales with how hard Lead is turning (none when he flies straight).
// Which one, when, is Lead's button's own cue (fluid-lead.js): in the baseline a new turn into #2 starts with lag (the
// miss first), one away from him with lead (the collapse to his six), then pure (Fig 12.20). #2 uses the cue of the part
// of Lead's path he is flying through, so he answers a turn a few seconds after Lead made it.
//
// Smoothness: the across offset changes on the septic step (no jump in rate, acceleration or jerk), the pursuit offset is
// averaged over Lead's last seconds on a smooth bump; the position line is then smoothed over half a second either side,
// shorter than the time behind Lead, so a new press of Lead never moves #2's next half second. Attitude, G and roll rate
// come from the line itself (attitude.js), so they always agree with it.
import { tasToIasKt } from '../../../core/t6-performance.js';
import { G_FTPS2, KT_TO_FTPS } from '../../../core/units.js';
import { STEP_SEC, ROLL } from './flight.js';
import { easeRoll } from '../../../core/flight-math.js';
import { smoothest } from './kinematic.js';
import { dot3, add3, sub3, scale3, len3, cross3, unit3, perp3, liftOf, poseOf3d } from './attitude.js';

const DEG = Math.PI / 180;
const dt = STEP_SEC;

/** #2's numbers. Sources beside each; "estimate" where none. */
export const WING = Object.freeze({
  pursuitShare: 0.1, // the lag or lead offset as a share of the range (estimate)
  latDeg: 15, // off Lead's tail, inside the 30° half cone (estimate; cone: Patrick 19:20Z row 2)
  collapseSec: 6, // how long the collapse toward the six takes (estimate)
  rangeSec: 6, // how long a new distance setting takes to fly (estimate)
  blendInSec: 10, // entry: from the fighting wing slot into the cone (estimate)
  blendOutSec: 12, // terminate: from the cone back to the fighting wing slot (estimate)
  smoothSteps: 10, // the position line is smoothed over 10 steps (0.5 s) either side (estimate)
  maxBehindSec: 10, // the furthest back along Lead's path #2 can be
  turnSec: 8, // the lag or lead offset is what the cue wanted over the last 8 s, averaged (estimate)
  headingSec: 3, // the fighting wing slot, while blending, turns with Lead's heading averaged over the last 3 s (estimate)
});

/**
 * A value that moves from `from` to `to` over `sec` from t0, arriving with no rate or acceleration left. From rest it is
 * the septic step (kinematic.js smoothest); a new target mid-move starts from the value, rate and acceleration it has
 * then (a quintic that matches all three), so a change of mind never jerks #2.
 */
const septic = (from, to, t0, sec, v0 = 0, a0 = 0) => ({ from, to, t0, sec, v0, a0 });
function evalMove(s, t) {
  const u = Math.max(0, Math.min(1, (t - s.t0) / s.sec));
  const T = s.sec;
  if (s.v0 === 0 && s.a0 === 0) {
    const d = s.to - s.from;
    const e = 1e-4;
    const f = (x) => smoothest(Math.max(0, Math.min(1, x)));
    const v = u > 0 && u < 1 ? (d * (f(u + e) - f(u - e))) / (2 * e * T) : 0;
    const a = u > 0 && u < 1 ? (d * (f(u + e) - 2 * f(u) + f(u - e))) / (e * e * T * T) : 0;
    return { x: s.from + d * f(u), v, a };
  }
  // Quintic Hermite: start value, rate and acceleration; end value, no rate, no acceleration.
  const u2 = u * u;
  const u3 = u2 * u;
  const u4 = u3 * u;
  const u5 = u4 * u;
  const h0 = 1 - 10 * u3 + 15 * u4 - 6 * u5;
  const h1 = u - 6 * u3 + 8 * u4 - 3 * u5;
  const h2 = 0.5 * u2 - 1.5 * u3 + 1.5 * u4 - 0.5 * u5;
  const h5 = 10 * u3 - 15 * u4 + 6 * u5;
  const d0 = -30 * u2 + 60 * u3 - 30 * u4;
  const d1 = 1 - 18 * u2 + 32 * u3 - 15 * u4;
  const d2 = u - 4.5 * u2 + 6 * u3 - 2.5 * u4;
  const dd0 = -60 * u + 180 * u2 - 120 * u3;
  const dd1 = -36 * u + 96 * u2 - 60 * u3;
  const dd2 = 1 - 9 * u + 18 * u2 - 10 * u3;
  const live = u < 1 ? 1 : 0;
  return {
    x: h0 * s.from + h1 * s.v0 * T + h2 * s.a0 * T * T + h5 * s.to,
    v: live * ((d0 * s.from + d1 * s.v0 * T + d2 * s.a0 * T * T - d0 * s.to) / T),
    a: live * ((dd0 * s.from + dd1 * s.v0 * T + dd2 * s.a0 * T * T - dd0 * s.to) / (T * T)),
  };
}
const valueOf = (s, t) => evalMove(s, t).x;
function retarget(s, to, t, sec) {
  if (Math.abs(to - s.to) < 1e-9) return s;
  const m = evalMove(s, t);
  return septic(m.x, to, t, sec, m.v, m.a);
}

/**
 * The first wing state at the press (entry from fighting wing): #2 on the fighting wing slot he is in (`slot`, Lead's
 * level frame), side s (+1 left), at range rangeFt.
 */
export function startWing({ t, side, rangeFt, slot }) {
  const lat = side * rangeFt * Math.sin(WING.latDeg * DEG);
  return {
    mode: 'pure',
    side,
    share: 0,
    lat: septic(lat, lat, t, WING.collapseSec),
    range: septic(rangeFt, rangeFt, t, WING.rangeSec),
    blend: septic(0, 0, t, WING.blendInSec),
    slot: { ...slot },
  };
}

/**
 * The wing state one step on, from Lead's cue for that step (fluid-lead.js): { mode, latDeg, blend } and the range
 * setting. Returns a new state.
 */
export function nextWing(w, cue, t, rangeFt) {
  const out = { ...w };
  out.mode = cue.mode;
  out.share = cue.mode === 'lag' ? -WING.pursuitShare : cue.mode === 'lead' ? WING.pursuitShare : 0;
  out.range = retarget(w.range, rangeFt, t, WING.rangeSec);
  const r = out.range.to;
  const latTo = out.side * r * Math.sin((cue.latDeg ?? WING.latDeg) * DEG);
  out.lat = retarget(w.lat, latTo, t, WING.collapseSec);
  if (cue.blend !== undefined) out.blend = retarget(w.blend, cue.blend, t, cue.blend > valueOf(w.blend, t) ? WING.blendInSec : WING.blendOutSec);
  return out;
}

/** The wing state's values at a time: { latFt, rangeFt, blend }. */
export const wingValues = (w, t) => ({ latFt: valueOf(w.lat, t), rangeFt: valueOf(w.range, t), blend: valueOf(w.blend, t) });

// ---- where #2 is: one raw point per step ----------------------------------------------------------

/**
 * Lead's path read between steps. E(k) returns Lead's entry at step k: { t, pos, vel, accPerp, levelUp, wing }, pos with
 * z the height above the block. Position is a cubic Hermite through the step positions and velocities (no corners);
 * the frame and offsets are read in a straight line between steps.
 */
export function leadAt(E, s) {
  const k = Math.floor(s);
  const f = s - k;
  const a = E(k);
  const b = E(k + 1);
  const h00 = 2 * f ** 3 - 3 * f * f + 1;
  const h10 = f ** 3 - 2 * f * f + f;
  const h01 = -2 * f ** 3 + 3 * f * f;
  const h11 = f ** 3 - f * f;
  const pos = add3(add3(scale3(a.pos, h00), scale3(a.vel, h10 * dt)), add3(scale3(b.pos, h01), scale3(b.vel, h11 * dt)));
  const mix = (u, v) => add3(scale3(u, 1 - f), scale3(v, f));
  return { pos, accPerp: mix(a.accPerp, b.accPerp), levelUp: mix(a.levelUp, b.levelUp), nose: unit3(mix(a.vel, b.vel)), entry: a, t: a.t + f * dt };
}

/**
 * The weights for looking back over Lead's path: a smooth bump (sin²) that is zero now and at the far end, so a sudden
 * change of Lead's (a roll, a new cue) comes into #2's line gently, with no jump in rate or acceleration.
 */
const hann = (j, n) => Math.sin((Math.PI * j) / n) ** 2;

/**
 * The lag or lead offset at step k: what the cue wanted at each step (outside Lead's turn for lag, inside for lead, a
 * share of the range, growing smoothly with how hard he turns), averaged over the last WING.turnSec on a smooth bump.
 * Averaging the wanted offset itself, not its size and its direction apart, keeps #2 steady when Lead reverses: lag in
 * one turn and lead in the turn the other way are the same side of his path, so #2 stays put. Only what Lead has
 * already flown counts, so a new press never moves it. Cached on the entry.
 */
function pursuitAt(E, k) {
  const e = E(k);
  if (e.pursuitS) return e.pursuitS;
  const n = Math.round(WING.turnSec / dt);
  let sum = { x: 0, y: 0, z: 0 };
  let wsum = 0;
  for (let j = 0; j <= n; j += 1) {
    const x = E(k - j);
    const w = hann(j, n);
    const m = len3(x.accPerp);
    const size = (x.wing.share ?? 0) * x.wing.range.to;
    // Full size from about 1.5 G of turning, none flying straight (estimate).
    if (m > 1e-9 && size !== 0) sum = add3(sum, scale3(x.accPerp, (w * size * Math.tanh(m / G_FTPS2)) / m));
    wsum += w;
  }
  e.pursuitS = scale3(sum, 1 / wsum);
  return e.pursuitS;
}

/** The fluid point behind Lead's path at a (fractional) step s of it: Lead's position there plus the pursuit and across offsets. */
export function fluidPointAt(E, s) {
  const L = leadAt(E, s);
  const v = wingValues(L.entry.wing, L.t);
  const k = Math.floor(s);
  const f = s - k;
  const pursuit = add3(scale3(pursuitAt(E, k), 1 - f), scale3(pursuitAt(E, k + 1), f));
  const left = unit3(cross3(L.levelUp, L.nose));
  return { p: add3(add3(L.pos, pursuit), scale3(left, v.latFt)), lead: L };
}

/**
 * Lead's heading at step k averaged over the last WING.headingSec (on a smooth bump of weights): the fighting wing slot turns
 * with it while #2 blends in or out, so a roll of Lead's doesn't swing the slot (and #2) the instant he rolls. Cached.
 */
function headingAt(E, k) {
  const e = E(k);
  if (e.headingS !== undefined) return e.headingS;
  const n = Math.round(WING.headingSec / dt);
  let x = 0;
  let y = 0;
  for (let j = 0; j <= n; j += 1) {
    const v = E(k - j).vel;
    const m = Math.hypot(v.x, v.y) || 1;
    x += (v.x / m) * hann(j, n);
    y += (v.y / m) * hann(j, n);
  }
  e.headingS = Math.atan2(y, x);
  return e.headingS;
}

/**
 * #2's raw point at step k: the fluid point at the time behind Lead that puts him at the set straight-line range (the
 * nearest such time), blended with his fighting wing slot during the entry and the terminate. Returns { p, behindSec, cue }.
 * kMin: the earliest step of Lead's path that exists.
 */
export function rawWingPoint(E, k, kMin) {
  const now = E(k);
  const v = wingValues(now.wing, now.t);
  const maxBack = Math.min(WING.maxBehindSec / dt, k - kMin - 1);
  const gap = (back) => len3(sub3(now.pos, fluidPointAt(E, k - back).p)) - v.rangeFt;
  // The nearest time back that reaches the range: walk back in 0.1 s steps, then halve the bracket.
  let lo = 0;
  let hi = null;
  for (let back = 2; back <= maxBack; back += 2) {
    if (gap(back) >= 0) {
      hi = back;
      lo = back - 2;
      break;
    }
  }
  if (hi === null) hi = lo = maxBack;
  for (let i = 0; i < 40 && hi - lo > 1e-9; i++) {
    const mid = (lo + hi) / 2;
    if (gap(mid) >= 0) hi = mid;
    else lo = mid;
  }
  const back = (lo + hi) / 2;
  const fp = fluidPointAt(E, k - back);
  let p = fp.p;
  if (v.blend < 1) {
    // The fighting wing slot, in Lead's level frame now (fwd along his heading, left square to it, alt above or below).
    const h = headingAt(E, k);
    const s = now.wing.slot;
    const slotP = { x: now.pos.x + Math.cos(h) * s.fwd - Math.sin(h) * s.left, y: now.pos.y + Math.sin(h) * s.fwd + Math.cos(h) * s.left, z: now.pos.z + s.alt };
    p = add3(scale3(slotP, 1 - v.blend), scale3(p, v.blend));
  }
  return { p, behindSec: back * dt, cue: fp.lead.entry.wing.mode, blend: v.blend };
}

/** The smoothing weights: a Gaussian over ±smoothSteps (sigma a third of that), summing to 1. */
const WEIGHTS = (() => {
  const n = WING.smoothSteps;
  const sigma = n / 3;
  const w = [];
  let sum = 0;
  for (let j = -n; j <= n; j++) {
    const x = Math.exp(-0.5 * (j / sigma) ** 2);
    w.push(x);
    sum += x;
  }
  return w.map((x) => x / sum);
})();

/** The smoothed point at step k from the raw points (R(k) returns { p }); needs R from k - smoothSteps to k + smoothSteps. */
export function smoothPoint(R, k) {
  const n = WING.smoothSteps;
  let p = { x: 0, y: 0, z: 0 };
  for (let j = -n; j <= n; j++) p = add3(p, scale3(R(k + j).p, WEIGHTS[j + n]));
  return p;
}

/**
 * #2's pose at step k from the smoothed line S(k) (needs k-1..k+1): velocity and acceleration by central differences,
 * then the lift and G of a coordinated aircraft (attitude.js). The wings roll toward that lift at the T-6's roll rate
 * and roll acceleration at most (90°/s, 360°/s², flight.js ROLL), so a moment of near-zero G
 * never spins him: there the lift is too small to need the wings anywhere in particular. prev: the last step's
 * { up, rollDps } (null at the start). Returns { pose, state } with state for the next step.
 */
export function wingPose(S, k, prev, blockFt) {
  const p0 = S(k - 1);
  const p1 = S(k);
  const p2 = S(k + 1);
  const vel = scale3(sub3(p2, p0), 1 / (2 * dt));
  const acc = scale3(add3(sub3(p2, scale3(p1, 2)), p0), 1 / (dt * dt));
  const nose = unit3(vel);
  const base = unit3(perp3(prev?.up ?? { x: 0, y: 0, z: 1 }, nose));
  const lift = liftOf(acc, nose, base);
  let up = lift.up;
  let roll = 0;
  if (prev) {
    const left = cross3(base, nose);
    const want = Math.atan2(dot3(lift.up, left), dot3(lift.up, base)) / DEG;
    const r = easeRoll(0, prev.rollDps, want, dt, ROLL);
    const a = r.bankDeg * DEG;
    up = unit3(add3(scale3(base, Math.cos(a)), scale3(left, Math.sin(a))));
    roll = r.rollRateDps;
  }
  const g = dot3(add3(acc, { x: 0, y: 0, z: G_FTPS2 }), up) / G_FTPS2;
  const kias = tasToIasKt(len3(vel) / KT_TO_FTPS, blockFt + p1.z);
  const pose = poseOf3d({ x: p1.x, y: p1.y, altAbove: p1.z, vel, up, kias, g, rollDps: roll });
  return { pose, state: { up, rollDps: roll } };
}

/** The level up for a path direction (core point-mass's convention, upright): for seeding Lead's past before the press. */
export const levelUpOf = (nose) => unit3(perp3({ x: 0, y: 0, z: 1 }, nose));
export { dot3 };
