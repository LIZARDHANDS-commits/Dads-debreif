// Position tracks and poses, shared by formation turns, fluid flight and the rejoins (TS-55, TS-125): a track of places
// step by step (makeTrack, seedTrack, setTrackStep), the coordinated pose that flies it (posesFrom, applyPose, settleLast),
// a slot's place in the world (slotInWorld), the septic blend (smoothest) and centred or lagged banks (centredBank, laggedBank). The kinematic
// lines that once flew whole moves from here are gone; the tracker (tracker.js) flies every move now.
//
// Units: feet, seconds; x east, y north; headings math radians (0 east, counter-clockwise); bank signed, left wing down
// positive (flight.js). Every number with no manual or ruling beside it is an estimate and says so.
import { bankDegFromTurnRate, turnRateFromBankRadPerSec } from '../../../core/flight-math.js';
import { attitudeDegFromClimb } from '../../../core/t6-performance.js';
import { wrapPi, DEG } from '../../../core/angles.js';
import { G_FTPS2 } from '../../../core/units.js';
import { STEP_SEC, flyAttitude } from './flight.js';
import { powerFrom } from './power.js';

const dt = STEP_SEC;

/** The septic step: 0 to 1 with no rate, acceleration or jerk at either end, so a blend joins without a step in roll rate. */
export const smoothest = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u ** 4 * (35 - 84 * u + 70 * u * u - 20 * u ** 3));
/** Its slope; the steepest point (the middle) is 2.1875 times the average. */
const smoothestSlope = (u) => (u <= 0 || u >= 1 ? 0 : 140 * u ** 3 * (1 - u) ** 3);

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
  // A 3D path's pose (attitude.js poseOf3d) carries the wings' true attitude: drawn as it is, so a barrel or lag roll is one
  // smooth roll through inverted (Patrick 6 Oct 21:30Z: "the rolls snap 180 degrees ... the lag roll should be a smooth 360").
  // Otherwise the wings follow the lift as a roll (flight.js flyAttitude).
  if (Number.isFinite(p.att)) a.attitudeDeg = p.att;
  else flyAttitude(a, { attitudeDeg: a.attitudeDeg }, STEP_SEC);
  a.turning = true;
  a.slowStage = p.stage ?? null; // how the line's slow-down is flown (slow-down.js, TS-61): BOARDS or IDLE on the card and tags
  a.overshooting = Boolean(p.over); // on an overshoot (TS-62): OVERSHOOTING on the card and tags
  a.stretched = Boolean(p.stretched); // held to full power and behind his planned place (TS-63): STRETCHED on the card and tags
  // The power the line was planned with (power.js, TS-62): its stage or throttle when the planner set one, else none shown.
  a.power = p.power ?? powerFrom(null, p.pwr ?? null, p.kias);
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

/**
 * An aircraft at step k of a recorded flight (replay.js recordFlight), with what the record leaves out read off its last
 * steps (second-order backward differences): its climb, roll rate, velocity and acceleration, and the places it came from.
 * A pose track planned from it (seedTrack, formation-turns.js holdInPlane) carries on his own speed rate, vertical
 * acceleration and roll rate, so a hand-over from the tracker has no step in them. Until V2.341 the pose track started at
 * none of them: at the turning rejoin's hand-over the speed rate stepped by 1.9-2.5 kt/s, the climb by 2 ft/s and the G by
 * 0.08 in one step (the Formation unit tests). Before step PAD the record is too short and the step is returned as it is.
 */
export function handOverAt(rec, k) {
  const s = rec.at(k);
  if (k < PAD) return s;
  const past = [1, 2, 3].map((j) => rec.at(k - j));
  const [p0, p1, p2, p3] = [s, ...past].map((p) => [p.xFt, p.yFt, p.altAboveFt]);
  const vel = p0.map((x, j) => (3 * x - 4 * p1[j] + p2[j]) / (2 * dt));
  const acc = p0.map((x, j) => (2 * x - 5 * p1[j] + 4 * p2[j] - p3[j]) / (dt * dt));
  const rollRateDps = (3 * s.bankDeg - 4 * past[0].bankDeg + past[1].bankDeg) / (2 * dt);
  return { ...s, climbFtps: vel[2], rollRateDps, velFtps: vel, accFtps2: acc, past: past.map((p) => ({ x: p.xFt, y: p.yFt, z: p.altAboveFt })) };
}

/**
 * Fills steps -PAD..0 of a track from an aircraft as it is now: from the places it came from when it carries them
 * (handOverAt), else extrapolated backward on its present turn and climb.
 */
export function seedTrack(track, a) {
  track.x[row(0)] = a.xFt;
  track.y[row(0)] = a.yFt;
  track.z[row(0)] = a.altAboveFt;
  if (a.past?.length >= PAD) {
    for (let k = -1; k >= -PAD; k--) setTrackStep(track, k, a.past[-k - 1].x, a.past[-k - 1].y, a.past[-k - 1].z);
    return;
  }
  const omega = turnRateFromBankRadPerSec(Math.max(a.tasFtps, 1), a.bankDeg);
  let x = a.xFt;
  let y = a.yFt;
  let h = a.headingRad;
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
 * pitch from the shared formula (core attitudeDegFromClimb, the pilot's picture, as flight.js). kiasPerTas turns true airspeed into indicated
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
    const pitch = attitudeDegFromClimb(climb[r], tas[r], kias, g * Math.cos(bank[r] * DEG));
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
  p.pitch = attitudeDegFromClimb(0, p.tas, p.kias, 1);
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

/**
 * A recorded flight whose bank, for placing a wing-plane slot, is the real bank averaged over halfSec either side (weights
 * the septic step's slope): the plane a wingman who knows Lead's roll is coming flies, starting to move as Lead starts to
 * roll and easing off as he stops, so the swing of the plane never jerks him up or down. Everything else is the recorded
 * flight's own. Returns { at(k) }.
 */
export function centredBank(rec, halfSec) {
  const m = Math.max(1, Math.round(halfSec / dt));
  const w = [];
  let sum = 0;
  for (let j = -m; j <= m; j++) {
    const v = smoothestSlope((j + m + 0.5) / (2 * m + 1));
    w.push(v);
    sum += v;
  }
  const cache = new Map();
  return {
    t0: rec.t0,
    at(k) {
      if (cache.has(k)) return cache.get(k);
      let bank = 0;
      for (let j = -m; j <= m; j++) bank += (w[j + m] / sum) * rec.at(Math.max(0, k + j)).bankDeg;
      const out = { ...rec.at(k), bankDeg: bank };
      cache.set(k, out);
      return out;
    },
  };
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
