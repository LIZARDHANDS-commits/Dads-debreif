// Kinematic pre-planned paths for the wingmen (Turn Sim spec section 10, decision TS-55; Patrick, 4 Oct 2026 18:00Z:
// "use kinematic pre planned lines for all of this instead of physics (like traffic sim does) to show positions and
// movement"). A wingman's whole path is worked out at the press as positions, one per step, and replayed exactly: the
// path drawn ahead is the path flown (spec F1). Heading, speed, bank, roll rate, climb, pitch and G are read off the
// path itself (a coordinated turn: bank from the turn rate and true airspeed), so they always agree with the line.
//
// Three pieces (and the power time law, step 2), used by the hot turning rejoin, the formation turns and the station changes:
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
import { STEP_SEC, smoother, flyAttitude } from './flight.js';
import { powerFrom, powerFor } from './power.js';
import { STAGES, stageFor, slowKtps, fullPowerKtps } from './slow-down.js';
import { closeRates } from './tuning.js';

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
  a.nz = p.nz ?? 1;
  flyAttitude(a, { attitudeDeg: a.attitudeDeg }, STEP_SEC); // the wings follow the lift as a roll (flight.js)
  a.turning = true;
  a.slowStage = p.stage ?? null; // how the line's slow-down is flown (slow-down.js, TS-61): BOARDS or IDLE on the card and tags
  a.overshooting = Boolean(p.over); // on an overshoot (TS-62): OVERSHOOTING on the card and tags
  a.stretched = Boolean(p.stretched); // held to full power and behind his planned place (TS-63): STRETCHED on the card and tags
  // The power the line was planned with (power.js, TS-62): its stage or throttle when the planner set one, else none shown.
  a.power = p.power ?? powerFrom(null, p.pwr ?? null, p.kias);
}

/** An aircraft's state as a pose (the inverse of applyPose), for the parts of a track flight.js flies itself. */
export function poseOf(a) {
  return { x: a.xFt, y: a.yFt, alt: a.altAboveFt, h: a.headingRad, bank: a.bankDeg, roll: a.rollRateDps ?? 0, kias: a.kias, tas: a.tasFtps, climb: a.climbFtps ?? 0, pitch: a.pitchDeg ?? 0, g: a.g ?? 1, nz: a.nz ?? 1, stage: a.slowStage ?? null, power: a.power ?? null };
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
/** The steps a track carries past each end, for the differences that read speed and turn off it. */
export const TRACK_PAD = PAD;
/** Sets step k of a track (any step from -PAD to n + PAD). */
export function setTrackStep(track, k, x, y, z) {
  track.x[row(k)] = x;
  track.y[row(k)] = y;
  track.z[row(k)] = z;
}

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
    poses.push({ x: x[r], y: y[r], alt: z[r], h: h[r], bank: bank[r], roll, kias, tas: tas[r], climb: climb[r], pitch, g, nz: 1 + az / G_FTPS2 });
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
  Object.assign(p, { h: ref.headingRad, bank: 0, roll: 0, kias: ref.kias, tas: ref.tasFtps, climb: 0, g: 1, nz: 1 });
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
 *  level: the "carry on" line rolls wings level instead of turning as the reference turns (an overshoot, SMM 12.27 para 65:
 *    "rolling the wings level"); its own turn dies away over decaySec.
 *  accelFn(vFtps): the "carry on" line's own acceleration (ft/s², true airspeed) at speed v instead of the reference's, such
 *    as slowing with idle and the speed brake (TS-61, an overshoot); its own change of acceleration dies away over decaySec.
 */
export function followInto(track, { ref, from = 0, slotAt, events = [], blendSec = 4, decaySec = blendSec / 2, level = false, accelFn = null }) {
  const end = track.n + PAD;
  const starts = [...new Set([from, ...events.filter((e) => e > from && e < track.n)])].sort((a, b) => a - b);
  for (let e = 0; e < starts.length; e++) {
    const k0 = starts[e];
    const k1 = e + 1 < starts.length ? starts[e + 1] : end;
    const m = motionAt(track, k0);
    const r0 = refRates(ref, k0);
    const bankTurn = (k, v) => (G_FTPS2 * Math.tan((ref.at(k).bankDeg ?? 0) * DEG)) / Math.max(v, 1);
    const turn0 = level ? 0 : bankTurn(k0, m.v); // the reference's bank, flown at the wingman's speed, at the start
    const acc0 = accelFn ? accelFn(m.v) : r0.accel;
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
      const turn = (level ? 0 : bankTurn(k, fv)) + (m.turn - turn0) * fade;
      const acc = (accelFn ? accelFn(fv) : rr.accel) + (m.accel - acc0) * fade;
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

/**
 * The most speed along a relative path at arc length s that keeps the turn of the path (its curvature, in the frame) inside
 * turnFtps2 of acceleration (v² x curvature): a line that swings from moving aft to moving forward in the frame asks #2 for
 * that change of speed, so it is taken no faster than the aircraft can change its speed.
 */
function curveLimit(path, s, ds, turnFtps2) {
  if (!Number.isFinite(turnFtps2)) return Infinity;
  const h = Math.max(ds, 2);
  const a = path.at(Math.max(0, s - h));
  const b = path.at(s);
  const c = path.at(Math.min(path.length, s + h));
  const t1 = [b.fwd - a.fwd, b.left - a.left, b.up - a.up];
  const t2 = [c.fwd - b.fwd, c.left - b.left, c.up - b.up];
  const n1 = Math.hypot(...t1);
  const n2 = Math.hypot(...t2);
  if (n1 < 1e-9 || n2 < 1e-9) return Infinity;
  const cos = Math.max(-1, Math.min(1, (t1[0] * t2[0] + t1[1] * t2[1] + t1[2] * t2[2]) / (n1 * n2)));
  const curvature = Math.acos(cos) / ((n1 + n2) / 2);
  return curvature > 1e-9 ? Math.sqrt(turnFtps2 / curvature) : Infinity;
}

/**
 * The power time law for a relative path (Patrick 5 Oct 04:58Z and 05:47Z, tuning.js CLOSURE; from the parked V2.22 work,
 * clean-up step 2): how far along the path the wingman is at each moment when he speeds up in the frame at up to
 * accel(point, dir) (ft/s²: full power, or bank sideways) until the rate allowed there is set, holds it, and slows at up to
 * decel(point, dir) so that at arc length `endAt` he moves at no more than `endFtps` (0 at the path's end, a stop; the
 * closure rate at a hand-over to the tracker, hand-over.js). The rate is held under min(cruiseFtps, limit(point, dir))
 * everywhere (relSpeedLimit: across, along, up or down). Beyond endAt (a hand-over) he carries on at the end rate, so a
 * line read a few steps past it has no stop. Worked out by the usual forward and backward passes (standard kinematics,
 * v² = u² + 2as), so no part asks more than its acceleration. With rateSetSec (Patrick 06:13Z) each change of rate is the
 * smallest step that makes it in about that long. Returns { durationSec (to endAt), sAt(t) }, as timeLaw.
 */
export function powerLaw(path, { cruiseFtps = Infinity, accel, decel, limit = null, endAt = path.length, endFtps = 0, turnFtps2 = Infinity, rateSetSec = Infinity }) {
  const N = Math.max(50, Math.ceil(path.length / 0.5));
  const ds = path.length / N;
  const vmax = new Float64Array(N + 1);
  const up = new Float64Array(N + 1);
  const down = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) {
    const s = i * ds;
    const a = path.at(Math.max(0, s - ds / 2));
    const b = path.at(Math.min(path.length, s + ds / 2));
    const len = Math.max(Math.hypot(b.fwd - a.fwd, b.left - a.left, b.up - a.up), 1e-9);
    const d = { fwd: (b.fwd - a.fwd) / len, left: (b.left - a.left) / len, up: (b.up - a.up) / len };
    const q = path.at(s);
    vmax[i] = Math.max(0.5, Math.min(cruiseFtps, limit ? limit(q, d) : Infinity, curveLimit(path, s, ds, turnFtps2)));
    up[i] = Math.max(0.05, accel(q, d));
    down[i] = Math.max(0.05, decel(q, d));
  }
  // The local limit is eased along the path (the lowest within 30 ft either side), so the rate it allows has no notches.
  const w = Math.max(1, Math.round(30 / Math.max(ds, 1e-9)));
  const eased = vmax.map((_, i) => {
    let m = Infinity;
    for (let j = Math.max(0, i - w); j <= Math.min(N, i + w); j++) m = Math.min(m, vmax[j]);
    return m;
  });
  const iEnd = Math.max(1, Math.min(N, Math.round(endAt / ds)));
  // Patrick's technique (5 Oct 06:13Z, tuning.js RATE_SET_SEC): a rate is set, or taken off, by the smallest power step
  // that does it in about rateSetSec, never more than full power or idle (accel, decel).
  if (Number.isFinite(rateSetSec)) {
    for (let i = 0; i <= N; i++) {
      up[i] = Math.max(0.05, Math.min(up[i], eased[i] / rateSetSec));
      down[i] = Math.max(0.05, Math.min(down[i], Math.max(eased[i] - (i < iEnd ? endFtps : 0), 1) / rateSetSec));
    }
  }
  const v = new Float64Array(N + 1);
  for (let i = 1; i <= N; i++) v[i] = Math.min(eased[i], Math.sqrt(v[i - 1] ** 2 + 2 * up[i] * ds));
  v[iEnd] = Math.min(v[iEnd], Math.max(endFtps, 0.5));
  for (let i = iEnd - 1; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[i + 1] ** 2 + 2 * down[i] * ds));
  for (let i = iEnd + 1; i <= N; i++) v[i] = Math.min(v[i], v[iEnd]);
  if (iEnd === N && endFtps <= 0) v[N] = 0;
  const times = new Float64Array(N + 1);
  for (let i = 1; i <= N; i++) times[i] = times[i - 1] + (2 * ds) / Math.max(v[i - 1] + v[i], 1e-6);
  const vEnd = v[N];
  return {
    durationSec: Math.max(dt, times[iEnd]),
    sAt(t) {
      if (t <= 0) return 0;
      if (t >= times[N]) return vEnd > 0 ? path.length + vEnd * (t - times[N]) : path.length;
      let lo = 0;
      let hi = N;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (times[mid] <= t) lo = mid;
        else hi = mid;
      }
      // Inside a step the speed changes linearly with time (constant acceleration).
      const h = times[hi] - times[lo];
      const tau = t - times[lo];
      const a = (v[hi] - v[lo]) / Math.max(h, 1e-9);
      return Math.min(path.length, lo * ds + v[lo] * tau + 0.5 * a * tau * tau);
    },
  };
}

// ---- the rates a line may move at, and the power it asks for (moved here from kinematic-moves.js and hot-rejoin.js in clean-up step 2, so every planned line can use them) ----

/**
 * The speed limit in Lead's frame at a point of a relative path moving in direction d (unit, in fwd, left, up). The
 * fore-aft rate is a rejoin's closure for the Rates choice (step 2, Patrick 06:09Z); relSpeedLimitFor gives it with another.
 */
export function relSpeedLimit(q, d, foreAftFtps = undefined, over = null) {
  const range = Math.hypot(q.fwd, q.left);
  const rates = over ? { ...closeRates(foreAftFtps), ...over } : closeRates(foreAftFtps);
  const lim = [
    (typeof rates.lateralFtps === 'function' ? rates.lateralFtps(range) : rates.lateralFtps) / Math.max(Math.abs(d.left), 1e-6),
    rates.foreAftFtps / Math.max(Math.abs(d.fwd), 1e-6),
    rates.verticalFtps / Math.max(Math.abs(d.up), 1e-6),
    Math.max(rates.nearMinFtps, rates.nearPerSec * range),
  ];
  return Math.min(...lim);
}

/** relSpeedLimit with the fore-aft rate `foreAftFtps` (a closure, ft/s), and any of its other rates replaced by `over` ({ lateralFtps, foreAftFtps, verticalFtps, nearPerSec, nearMinFtps }: the opening out to line abreast, line-moves.js; lateralFtps may be a function of the range from Lead, the speed #2 has gained by there). */
export const relSpeedLimitFor = (foreAftFtps, over = null) => (q, d) => relSpeedLimit(q, d, foreAftFtps, over);

/** The ways of slowing, ranked in Patrick's order of use (slow-down.js STAGES). */
export const RANK = Object.freeze({ power: 0, boards: 1, idle: 2, idleBoards: 3 });

/**
 * The slowing and speeding up a planned line asks for, from pose index `from` on: each step's stage (slow-down.js, the
 * first in the order of use that gives it), the first step that asks more than idle and the boards can give (-1 if none),
 * and the most a speed-up asks past full power (KIAS per second; 0 if never). Read from the line's own speeds, lightly
 * smoothed (a half-second running mean) so the differences' noise is not read as a need. A climb or descent counts too
 * (energy height, standard aerodynamics: holding the speed in a descent at climb rate c takes g c / V of extra drag), so a
 * high start that dives down to Lead has its height to lose as well as its speed (Patrick 19:15Z lists "high" as a worse start).
 */
export function speedNeeds(poses, from, blockFt, to = poses.length) {
  const n = poses.length;
  const raw = new Float64Array(n);
  for (let k = 1; k < n - 1; k++) raw[k] = (poses[k + 1].kias - poses[k - 1].kias) / (2 * dt);
  const half = 5;
  const ranks = new Int8Array(n).fill(-1);
  const rates = new Float64Array(n); // the energy rate each step asks, in KIAS per second (the climb's share included)
  let firstBad = -1;
  let accelShort = 0;
  let top = 0;
  for (let k = Math.max(1, from); k < Math.min(n - 1, to); k++) {
    let sum = 0;
    let cnt = 0;
    for (let j = Math.max(1, k - half); j <= Math.min(n - 2, k + half); j++) {
      sum += raw[j];
      cnt++;
    }
    const p = poses[k];
    const r = sum / cnt + ((G_FTPS2 * (p.climb ?? 0)) / Math.max(p.tas, 1)) * (p.kias / Math.max(p.tas, 1));
    rates[k] = r;
    if (r < 0) {
      const st = stageFor(-r, p.kias, blockFt, p.g);
      if (!st.ok && -r > slowKtps('idleBoards', p.kias, blockFt, p.g) * 1.02 + 0.05 && firstBad < 0) firstBad = k;
      ranks[k] = RANK[st.stage];
      top = Math.max(top, ranks[k]);
    } else {
      accelShort = Math.max(accelShort, r - (fullPowerKtps(p.kias, blockFt, p.g) * 1.05 + 0.05));
    }
  }
  return { ranks, rates, blockFt, firstBad, accelShort: Math.max(0, accelShort), top };
}

/**
 * Writes each pose's slowing stage from its rank, held for a second either side so the boards don't flick in and out, and
 * on power the model's throttle for the tag (power.js; speedNeeds' rates already hold the climb's share).
 */
export function labelStages(poses, from, needs) {
  const { ranks, rates, blockFt } = needs;
  const hold = Math.round(1 / dt);
  for (let k = Math.max(0, from); k < poses.length; k++) {
    let r = -1;
    for (let j = Math.max(0, k - hold); j <= Math.min(poses.length - 1, k + hold); j++) r = Math.max(r, ranks[j]);
    poses[k].stage = r >= 1 ? STAGES[r] : r === 0 ? 'power' : null;
    poses[k].power = powerFor(rates[k] ?? 0, poses[k].kias, blockFt, poses[k].g, 0, poses[k].stage);
  }
}
