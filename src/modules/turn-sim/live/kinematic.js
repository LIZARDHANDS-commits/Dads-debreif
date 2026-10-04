// Kinematic pre-planned paths for the wingmen (Turn Sim spec section 10, decision TS-55; Patrick, 4 Oct 2026 18:00Z:
// "use kinematic pre planned lines for all of this instead of physics (like traffic sim does) to show positions and
// movement"). A wingman's whole path is worked out at the press as positions, one per step, and replayed exactly: the
// path drawn ahead is the path flown (spec F1). Heading, speed, bank, roll rate, climb, pitch and G are read off the
// path itself (a coordinated turn: bank from the turn rate and true airspeed), so they always agree with the line.
//
// Three pieces, used by the hot turning rejoin, the formation turns and the station changes:
//  - A relative path: a smooth curve in the reference aircraft's frame (fwd, left, height) through the places a move
//    passes (a C2 B-spline), flown on one smooth time law, so a press flies one continuous line with no stop between
//    legs (Patrick 11:09Z: speed ramps only).
//  - The follow: the wingman on its slot in the reference's frame (in the wing plane for the close formations, SMM 12.19
//    paras 41-43 and 12.4 paras 11-12), blended in from "what it is doing now" whenever the reference starts a roll, so a
//    reference rolling at 90°/s never snaps the wingman: it follows a moment later, as a wingman does (SMM 12.19 para 43).
//  - Poses from positions: finite differences of the planned line give every flight value.
//
// Units: feet, seconds; x east, y north; headings math radians (0 east, counter-clockwise); bank signed, left wing down
// positive (flight.js). Every number with no manual or ruling beside it is an estimate and says so.
import { bankDegFromTurnRate } from '../../../core/flight-math.js';
import { pitchDegFromClimb } from '../../../core/t6-performance.js';
import { wrapPi } from '../../../core/angles.js';
import { G_FTPS2 } from '../../../core/units.js';
import { STEP_SEC, smoother } from './flight.js';

const DEG = Math.PI / 180;
const dt = STEP_SEC;

/** The septic step: 0 to 1 with no rate, acceleration or jerk at either end, so a blend joins without a step in roll rate. */
export const smoothest = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u ** 4 * (35 - 84 * u + 70 * u * u - 20 * u ** 3));
/** Its slope; the steepest point (the middle) is SMOOTHEST_PEAK times the average. */
export const smoothestSlope = (u) => (u <= 0 || u >= 1 ? 0 : 140 * u ** 3 * (1 - u) ** 3);
export const SMOOTHEST_PEAK = 2.1875;

/** Extra rows of positions kept before and after a track, so the differences at its ends are central. */
const PAD = 3;

// ---- replaying a planned path ------------------------------------------------------------------

/** Sets an aircraft to a planned pose (one step of a 'poseTrack' segment). */
export function applyPose(a, p) {
  a.xFt = p.x;
  a.yFt = p.y;
  a.altAboveFt = p.alt;
  a.headingRad = p.h;
  a.bankDeg = p.bank;
  a.rollRateDps = p.roll;
  a.kias = p.kias;
  a.tasFtps = p.tas;
  a.climbFtps = p.climb;
  a.pitchDeg = p.pitch;
  a.g = p.g;
  a.turning = true;
}

/** An aircraft's state as a pose (the inverse of applyPose), for the parts of a track flight.js flies itself. */
export function poseOf(a) {
  return { x: a.xFt, y: a.yFt, alt: a.altAboveFt, h: a.headingRad, bank: a.bankDeg, roll: a.rollRateDps ?? 0, kias: a.kias, tas: a.tasFtps, climb: a.climbFtps ?? 0, pitch: a.pitchDeg ?? 0, g: a.g ?? 1 };
}

/**
 * A track of positions, one row per step from step -PAD to n + PAD (row r is step r - PAD): { x, y, z, n }. Step 0 is the
 * press (where the aircraft is now); steps 1..n are flown.
 */
export function makeTrack(n) {
  const len = n + 2 * PAD + 1;
  return { x: new Float64Array(len), y: new Float64Array(len), z: new Float64Array(len), n };
}
const row = (k) => k + PAD;

/** Fills steps -PAD..0 of a track from an aircraft as it is now, extrapolated backward on its present turn and climb. */
export function seedTrack(track, a) {
  const omega = (G_FTPS2 * Math.tan(a.bankDeg * DEG)) / Math.max(a.tasFtps, 1);
  let x = a.xFt;
  let y = a.yFt;
  let h = a.headingRad;
  track.x[row(0)] = x;
  track.y[row(0)] = y;
  track.z[row(0)] = a.altAboveFt;
  for (let k = -1; k >= -PAD; k--) {
    const hPrev = h - omega * dt;
    const mid = (h + hPrev) / 2;
    const horiz = Math.sqrt(Math.max(0, a.tasFtps ** 2 - (a.climbFtps ?? 0) ** 2));
    x -= Math.cos(mid) * horiz * dt;
    y -= Math.sin(mid) * horiz * dt;
    h = hPrev;
    track.x[row(k)] = x;
    track.y[row(k)] = y;
    track.z[row(k)] = a.altAboveFt + (a.climbFtps ?? 0) * k * dt;
  }
}

/**
 * Poses for steps 1..n of a track: heading and speed from the central difference of the positions, bank from the turn
 * rate (coordinated, standard aerodynamics), roll rate from the bank, G from the turn and the vertical acceleration,
 * pitch from the shared formula (core pitchDegFromClimb, as flight.js). kiasPerTas turns true airspeed into indicated
 * (the ratio at the block height, F3/F4). Returns { poses, maxBankDeg, minKias, maxKias }.
 */
export function posesFrom(track, kiasPerTas) {
  const { x, y, z, n } = track;
  const len = x.length;
  const h = new Float64Array(len);
  const tas = new Float64Array(len);
  const climb = new Float64Array(len);
  for (let r = 1; r < len - 1; r++) {
    const vx = (x[r + 1] - x[r - 1]) / (2 * dt);
    const vy = (y[r + 1] - y[r - 1]) / (2 * dt);
    climb[r] = (z[r + 1] - z[r - 1]) / (2 * dt);
    h[r] = Math.atan2(vy, vx);
    tas[r] = Math.hypot(vx, vy, climb[r]);
  }
  const bank = new Float64Array(len);
  const omega = new Float64Array(len);
  for (let r = 2; r < len - 2; r++) {
    omega[r] = wrapPi(h[r + 1] - h[r - 1]) / (2 * dt);
    bank[r] = bankDegFromTurnRate(tas[r], omega[r]);
  }
  const poses = [];
  let maxBankDeg = 0;
  let minKias = Infinity;
  let maxKias = -Infinity;
  for (let k = 1; k <= n; k++) {
    const r = row(k);
    const roll = (bank[r + 1] - bank[r - 1]) / (2 * dt);
    const az = (z[r + 1] - 2 * z[r] + z[r - 1]) / (dt * dt);
    const g = Math.hypot((tas[r] * omega[r]) / G_FTPS2, 1 + az / G_FTPS2);
    const kias = tas[r] * kiasPerTas;
    const pitch = pitchDegFromClimb(climb[r], tas[r], kias, g * Math.cos(bank[r] * DEG));
    poses.push({ x: x[r], y: y[r], alt: z[r], h: h[r], bank: bank[r], roll, kias, tas: tas[r], climb: climb[r], pitch, g });
    maxBankDeg = Math.max(maxBankDeg, Math.abs(bank[r]));
    minKias = Math.min(minKias, kias);
    maxKias = Math.max(maxKias, kias);
  }
  return { poses, maxBankDeg, minKias, maxKias };
}

/**
 * Settles the last pose onto the aircraft it flies off once both are steady, so the straight and level flight that
 * follows the track (flight.js with no segments) is exactly parallel at the same speed: the differences left are
 * millionths of a degree and of a knot.
 */
export function settleLast(poses, ref) {
  const p = poses[poses.length - 1];
  if (!p) return;
  Object.assign(p, { h: ref.headingRad, bank: 0, roll: 0, kias: ref.kias, tas: ref.tasFtps, climb: 0, g: 1 });
  p.pitch = pitchDegFromClimb(0, p.tas, p.kias, 1);
}

// ---- the slot: where a wingman sits in the reference's frame --------------------------------------

/**
 * A point in an aircraft's frame, in the world: fwd along its heading, left square to it, up above it. With plane 1 the
 * left and up offsets turn with the aircraft's bank, so the point stays in its wing plane (a close formation wingman,
 * SMM 12.19 para 41: stepped up in a turn away, stepped down in a turn into him); with plane 0 they stay horizontal
 * (fighting wing, line abreast). Returns { x, y, z }.
 */
export function slotInWorld(R, fwd, left, up, plane = 0) {
  const phi = (R.bankDeg ?? 0) * DEG * plane;
  const l = left * Math.cos(phi) + up * Math.sin(phi);
  const u = -left * Math.sin(phi) + up * Math.cos(phi);
  const cx = Math.cos(R.headingRad);
  const cy = Math.sin(R.headingRad);
  return { x: R.xFt + cx * fwd - cy * l, y: R.yFt + cy * fwd + cx * l, z: R.altAboveFt + u };
}

// ---- the follow ------------------------------------------------------------------------------------

/** The reference's turn rate and rate of change of true airspeed at step k, from its recorded flight. */
function refRates(ref, k) {
  const a = ref.at(Math.max(0, k - 1));
  const b = ref.at(k + 1);
  const span = (k + 1 - Math.max(0, k - 1)) * dt;
  return { omega: wrapPi(b.headingRad - a.headingRad) / span, accel: (b.tasFtps - a.tasFtps) / span };
}

/** The wingman's motion at row r of a track, from the rows before it (second-order backward differences). */
function motionAt(track, k) {
  const { x, y, z } = track;
  const r = row(k);
  const vx = (3 * x[r] - 4 * x[r - 1] + x[r - 2]) / (2 * dt);
  const vy = (3 * y[r] - 4 * y[r - 1] + y[r - 2]) / (2 * dt);
  const ax = (2 * x[r] - 5 * x[r - 1] + 4 * x[r - 2] - x[r - 3]) / (dt * dt);
  const ay = (2 * y[r] - 5 * y[r - 1] + 4 * y[r - 2] - y[r - 3]) / (dt * dt);
  const vz = (3 * z[r] - 4 * z[r - 1] + z[r - 2]) / (2 * dt);
  const az = (2 * z[r] - 5 * z[r - 1] + 4 * z[r - 2] - z[r - 3]) / (dt * dt);
  const v = Math.hypot(vx, vy);
  return { x: x[r], y: y[r], z: z[r], h: Math.atan2(vy, vx), v, turn: (vx * ay - vy * ax) / (v * v), accel: (vx * ax + vy * ay) / v, vz, az };
}

/**
 * Fills a track from step `from` (whose earlier rows are already set) to n + PAD with the wingman following its slot.
 *  ref: the reference's recorded flight (transitions.js recordFlight), step 0 at the track's step 0.
 *  slotAt(k, R): { fwd, left, up, plane } the slot in R's frame at step k (R = ref.at(k)); up is height above R.
 *  events: step indices at which the wingman re-bases (`from` is always one): from there it blends from "carry on as I am,
 *    turning as the reference turns" to the slot over blendSec, so a roll of the reference reaches it smoothly.
 *  blendSec: how long the blend takes (an estimate per formation, given by the caller); decaySec: how long its own extra
 *    turn and speed change take to die away on the "carry on" line (estimate; default half the blend).
 */
export function followInto(track, { ref, from = 0, slotAt, events = [], blendSec = 4, decaySec = blendSec / 2 }) {
  const end = track.n + PAD;
  const starts = [...new Set([from, ...events.filter((e) => e > from && e < track.n)])].sort((a, b) => a - b);
  for (let e = 0; e < starts.length; e++) {
    const k0 = starts[e];
    const k1 = e + 1 < starts.length ? starts[e + 1] : end;
    const m = motionAt(track, k0);
    const r0 = refRates(ref, k0);
    const bankTurn = (k, v) => (G_FTPS2 * Math.tan((ref.at(k).bankDeg ?? 0) * DEG)) / Math.max(v, 1);
    const turn0 = bankTurn(k0, m.v); // the reference's bank, flown at the wingman's speed, at the start
    // The "carry on" line: own heading and speed, turning as the reference turns plus its own extra turn dying away.
    let fx = m.x;
    let fy = m.y;
    let fh = m.h;
    let fv = m.v;
    let fz = m.z;
    for (let k = k0; k < k1; k++) {
      const tau = (k + 0.5 - k0) * dt;
      const fade = 1 - smoother(Math.min(1, tau / decaySec));
      const rr = refRates(ref, k);
      // Turning as the reference turns means at the reference's bank as the wingman follows it (the bank `ref` gives, which
      // the caller may lag: SMM 12.19 para 43), at the wingman's own speed, so a roll of Lead never asks more roll of the
      // wingman than Lead's own.
      const turn = bankTurn(k, fv) + (m.turn - turn0) * fade;
      const acc = rr.accel + (m.accel - r0.accel) * fade;
      const h1 = fh + turn * dt;
      const v1 = fv + acc * dt;
      fx += Math.cos((fh + h1) / 2) * ((fv + v1) / 2) * dt;
      fy += Math.sin((fh + h1) / 2) * ((fv + v1) / 2) * dt;
      fh = h1;
      fv = v1;
      const climbNow = (m.vz + m.az * tau) * fade;
      fz += climbNow * dt;
      // The slot, and the blend from the carry-on line onto it.
      const R = ref.at(k + 1);
      const s = slotAt(k + 1, R);
      const p = slotInWorld(R, s.fwd, s.left, s.up, s.plane ?? 0);
      const b = smoothest(((k + 1 - k0) * dt) / blendSec);
      const r = row(k + 1);
      track.x[r] = fx + (p.x - fx) * b;
      track.y[r] = fy + (p.y - fy) * b;
      track.z[r] = fz + (p.z - fz) * b;
    }
  }
}

/**
 * A recorded flight whose bank, for placing a wing-plane slot, follows the real bank a moment later and smoothly (a
 * weighted average of the last lagSec of it, weights the septic step's slope): a close wingman stays in Lead's wing plane
 * but lags his roll (SMM 12.19 para 43), so a 90°/s roll of Lead never jerks the wingman up or down. Everything else is
 * the recorded flight's own. Returns { at(k) }.
 */
export function laggedBank(rec, lagSec) {
  const m = Math.max(1, Math.round(lagSec / dt));
  const w = [];
  let sum = 0;
  for (let j = 0; j <= m; j++) {
    const v = smoothestSlope((j + 0.5) / (m + 1));
    w.push(v);
    sum += v;
  }
  const cache = new Map();
  return {
    t0: rec.t0,
    at(k) {
      if (cache.has(k)) return cache.get(k);
      let bank = 0;
      for (let j = 0; j <= m; j++) bank += (w[j] / sum) * rec.at(Math.max(0, k - j)).bankDeg;
      const out = { ...rec.at(k), bankDeg: bank };
      cache.set(k, out);
      return out;
    },
  };
}

/** The steps at which an aircraft's recorded flight starts a roll (its roll rate goes from zero to not zero), 1..n. */
export function rollStarts(rec, n) {
  const out = [];
  let still = true;
  for (let k = 1; k <= n; k++) {
    const moving = Math.abs(rec.at(k).bankDeg - rec.at(k - 1).bankDeg) > 1e-9;
    if (moving && still) out.push(k - 1);
    still = !moving;
  }
  return out;
}

// ---- a relative path: one smooth line through the places a move passes ----------------------------

/**
 * A smooth curve through (near) control points { fwd, left, up, plane }: a uniform cubic B-spline, C2 everywhere, with
 * the first and last points tripled so it starts and ends exactly on them and leaves and arrives along the first and last
 * legs. It stays inside the hull of each four neighbouring points, so a crossing drawn behind and below Lead stays behind
 * and below him. Returns { length, at(s) } with s the distance along it (feet, in the frame).
 */
export function relPath(points) {
  const P = [points[0], points[0], ...points, points[points.length - 1], points[points.length - 1]];
  const keys = ['fwd', 'left', 'up', 'plane'];
  const evalSeg = (i, u) => {
    const b0 = (1 - u) ** 3 / 6;
    const b1 = (3 * u ** 3 - 6 * u * u + 4) / 6;
    const b2 = (-3 * u ** 3 + 3 * u * u + 3 * u + 1) / 6;
    const b3 = u ** 3 / 6;
    const o = {};
    for (const key of keys) o[key] = b0 * (P[i][key] ?? 0) + b1 * (P[i + 1][key] ?? 0) + b2 * (P[i + 2][key] ?? 0) + b3 * (P[i + 3][key] ?? 0);
    return o;
  };
  const segs = P.length - 3;
  const PER = 200;
  const params = [0];
  const lengths = [0];
  let prev = evalSeg(0, 0);
  for (let i = 0; i < segs; i++) {
    for (let j = 1; j <= PER; j++) {
      const q = evalSeg(i, j / PER);
      lengths.push(lengths[lengths.length - 1] + Math.hypot(q.fwd - prev.fwd, q.left - prev.left, q.up - prev.up));
      params.push(i + j / PER);
      prev = q;
    }
  }
  const length = lengths[lengths.length - 1];
  const paramAt = (s) => {
    if (s <= 0) return 0;
    if (s >= length) return segs;
    let lo = 0;
    let hi = lengths.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (lengths[mid] <= s) lo = mid;
      else hi = mid;
    }
    const f = (s - lengths[lo]) / Math.max(lengths[hi] - lengths[lo], 1e-12);
    return params[lo] + (params[hi] - params[lo]) * f;
  };
  return {
    length,
    at(s) {
      const t = paramAt(s);
      const i = Math.min(segs - 1, Math.floor(t));
      return evalSeg(i, t - i);
    },
  };
}

/**
 * The time law for a relative path: how far along it the wingman is at each moment, on one smooth curve with no stop
 * (the septic step), timed so the speed in the frame never passes limit(point, direction) anywhere along it.
 * Returns { durationSec, sAt(t) }.
 */
export function timeLaw(path, limit) {
  const N = Math.max(50, Math.ceil(path.length / 2));
  const ds = path.length / N;
  const lim = [];
  for (let i = 0; i <= N; i++) {
    const s = i * ds;
    const a = path.at(Math.max(0, s - ds / 2));
    const b = path.at(Math.min(path.length, s + ds / 2));
    const d = Math.max(Math.hypot(b.fwd - a.fwd, b.left - a.left, b.up - a.up), 1e-9);
    lim.push(Math.max(1, limit(path.at(s), { fwd: (b.fwd - a.fwd) / d, left: (b.left - a.left) / d, up: (b.up - a.up) / d })));
  }
  // Smooth the limit along the path so the speed it allows has no corners, without ever passing it: first the lowest
  // limit within three windows either side, then three passes of a running mean one window wide.
  const w = Math.max(1, Math.round(60 / Math.max(ds, 1e-9)));
  const span = (i, half) => [Math.max(0, i - half), Math.min(N, i + half)];
  let sm = lim.map((_, i) => {
    const [a, b] = span(i, 3 * w);
    let m = Infinity;
    for (let j = a; j <= b; j++) m = Math.min(m, lim[j]);
    return m;
  });
  for (let pass = 0; pass < 3; pass++) {
    sm = sm.map((_, i) => {
      const [a, b] = span(i, w);
      let sum = 0;
      for (let j = a; j <= b; j++) sum += sm[j];
      return sum / (b - a + 1);
    });
  }
  const sigma = [0];
  for (let i = 1; i <= N; i++) sigma.push(sigma[i - 1] + ds * (0.5 / sm[i - 1] + 0.5 / sm[i]));
  const total = sigma[N];
  const durationSec = Math.max(4, SMOOTHEST_PEAK * total);
  return {
    durationSec,
    sAt(t) {
      const target = total * smoothest(t / durationSec);
      let lo = 0;
      let hi = N;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (sigma[mid] <= target) lo = mid;
        else hi = mid;
      }
      const f = (target - sigma[lo]) / Math.max(sigma[hi] - sigma[lo], 1e-12);
      return Math.min(path.length, (lo + f) * ds);
    },
  };
}
