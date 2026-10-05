// A wingman is held to what the aircraft can do (decision TS-63; Patrick 5 Oct 2026 02:48Z: "If they get stretched they
// just have to show it in their tag and fix it as best as they can once the maneuver ever finishes"). One place for the
// rule, used where a planned line broke it: the off-standard hot rejoin's capture lines (Patrick 03:46Z: "I thought the
// thing that we added that for was one case"; holdToPower) and, since V2.59, #2 in fluid manoeuvring (Patrick 04:07Z: "I
// thought we established fluid speed ups between md full just end stretched and fix la after"; holdLiveStep, step by
// step; the parked V2.22 work, b905095 and ce650bb, ported):
//  - a speed-up is never faster than full power gives at that speed, height and G (core excessThrustPerWeight, the same
//    curve as slow-down.js fullPowerKtps), with a climb paid for out of the same excess (standard aerodynamics:
//    dV/dt = g ((T - D) / W - sin(climb angle)));
//  - a slow-down is never faster than idle and the speed brake give (slow-down.js, TS-61);
//  - where a planned line asks more, #2 flies the same line through the air at the speed he can reach, so the range opens
//    instead; while he is behind where the line wanted him he is STRETCHED (tag and card), and once Lead's manoeuvre ends
//    he closes up as best he can: full power to a modest overtake, then power back as he arrives (the order of use of
//    TS-61), and shows the formation's normal state again.
// G (Patrick 5 Oct 03:04Z: "4 g is just leads limit for fluid maneuvering. 5 g The wirc wrt can pull what they need to to
// make it work up to stall , up to seven in extreme cases"; 03:05Z: "Yeah over 5 g is a last resort and must stay below 7
// in all cases"): #2's normal ceiling is 5 G; more is a last resort, shown on screen; the stall line and 7 G are a wall.
// A line already inside every limit is flown exactly as planned. Formation Sim only: the core curves are used, not changed.
//
// Units: feet, seconds, true airspeed in ft/s inside the governor, KIAS on the poses (the planned lines' own ratio).
import { excessThrustPerWeight, stallLimitG, tasToIasKt } from '../../../core/t6-performance.js';
import { G_FTPS2, KT_TO_FTPS } from '../../../core/units.js';
import { wrapPi } from '../../../core/angles.js';
import { STEP_SEC } from './flight.js';
import { fullPowerKtps, excessPerWeight } from './slow-down.js';
import { powerFor, powerFrom } from './power.js';
import { makeTrack, posesFrom, settleLast, slotInWorld, smoothest } from './kinematic.js';
import { relativeTo } from './manoeuvres.js';
import { HOLD, G_RULE } from './tuning.js';

const dt = STEP_SEC;

/**
 * #2's G (Patrick 5 Oct 03:04Z and 03:05Z, TS-63): 5 G is the normal ceiling (SMM 16.17 para 44a as well); above it is the
 * last resort, shown on screen; never 7 G or the stall line. `wallG` is just under 7 (an estimate of "below 7").
 */
export const WING_G = Object.freeze({ normal: 5, wall: 6.95 });

/** The most G #2 may ever pull at kias: the stall line (core stallLimitG) or just under 7 G, whichever is less (Patrick 03:05Z). */
export function wallG(kias) {
  return Math.min(stallLimitG(kias), WING_G.wall);
}

/** KIAS per second the climb costs at climb rate climbFtps (energy height, standard aerodynamics: g x climb / V, in KIAS terms). */
export function climbKtps(climbFtps, tasFtps, kias) {
  return ((G_FTPS2 * (climbFtps ?? 0)) / Math.max(tasFtps, 1)) * (kias / Math.max(tasFtps, 1));
}

/** The most a pose may speed up (KIAS per second): full power at its speed, height and G, less what its climb costs. */
export function speedUpLimitKtps(kias, altFt, g, climbFtps, tasFtps) {
  return fullPowerKtps(kias, altFt, g) - climbKtps(climbFtps, tasFtps, kias);
}

/** Each pose's speed rate (KIAS per second), read back off the line over half a second (a running mean either side). */
function rates(poses) {
  const n = poses.length;
  const raw = new Float64Array(n);
  for (let k = 1; k < n - 1; k++) raw[k] = (poses[k + 1].kias - poses[k - 1].kias) / (2 * dt);
  const out = new Float64Array(n);
  const half = 5;
  for (let k = 1; k < n - 1; k++) {
    let sum = 0;
    let cnt = 0;
    for (let j = Math.max(1, k - half); j <= Math.min(n - 2, k + half); j++) {
      sum += raw[j];
      cnt++;
    }
    out[k] = sum / cnt;
  }
  return out;
}

/**
 * The first pose index from `from` whose speed-up beats full power (or, with the G wall, whose G passes it), or -1: the
 * line is inside the aircraft's limits from there on.
 */
export function firstOverPower(poses, blockFt, from = 1) {
  const r = rates(poses);
  for (let k = Math.max(1, from); k < poses.length - 1; k++) {
    const p = poses[k];
    const alt = blockFt + (p.alt ?? 0);
    const up = speedUpLimitKtps(p.kias, alt, p.g ?? 1, p.climb, p.tas);
    if (r[k] > up + Math.abs(up) * HOLD.margin.share + HOLD.margin.ktps || (p.g ?? 1) > wallG(p.kias)) return k;
  }
  return -1;
}

/** Catmull-Rom between samples i and i+1 of a list of points at fraction u. */
function cr(P, i, u) {
  const n = P.length;
  const a = P[Math.max(0, i - 1)];
  const b = P[i];
  const c = P[Math.min(n - 1, i + 1)];
  const d = P[Math.min(n - 1, i + 2)];
  const u2 = u * u;
  const u3 = u2 * u;
  const f = (k) => 0.5 * (2 * b[k] + (-a[k] + c[k]) * u + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * u2 + (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * u3);
  return { x: f('x'), y: f('y'), z: f('z') };
}

/**
 * Holds a planned wingman line (poses, one per step from step 1) to what the aircraft can do (the rules at the top). The
 * line in the air is kept; only how fast #2 moves along it changes, from the first pose that asks more than full power.
 * After the planned line ends the line carries on as his last place in the frame of the aircraft he flies off, and he
 * closes up on it.
 *  refAt(i): the aircraft he flies off at pose index i (its recorded flight: rec.at(i + 1)), extended straight on beyond
 *    its plan, as recordFlight does.
 *  blockFt: the block height; kiasPerTas: the line's indicated / true airspeed ratio (the planned lines' own).
 *  from: the first pose index that may be changed (an earlier part flown exactly, such as the hot rejoin's turns).
 * Returns { poses, changed, stretched, endIndex }: poses unchanged (the same array) when the line is inside the limits.
 * Each changed pose carries `stretched` while he is behind, and the power that flies it (MAX while held to full power).
 */
export function holdToPower(poses, { refAt, blockFt = 8000, kiasPerTas, from = 1 }) {
  const N = poses.length;
  const kv = N > 4 ? firstOverPower(poses, blockFt, from) : -1;
  if (kv < 0) return { poses, changed: false, stretched: false, endIndex: N - 1 };
  const k0 = Math.max(from, kv - 1);
  const extra = Math.round(HOLD.extraSec / dt);
  // The line in the air: the planned places, then his last place carried on in the frame of the aircraft he flies off.
  const last = poses[N - 1];
  const R0 = refAt(N - 1);
  const rel = relativeTo(R0, { xFt: last.x, yFt: last.y });
  const up = last.alt - R0.altAboveFt;
  const D = poses.map((p) => ({ x: p.x, y: p.y, z: p.alt }));
  for (let i = N; i < N + extra; i++) {
    const p = slotInWorld(refAt(i), rel.fwd, rel.left, up, 0);
    D.push({ x: p.x, y: p.y, z: p.z });
  }
  const M = D.length;
  const S = new Float64Array(M);
  for (let i = 1; i < M; i++) S[i] = S[i - 1] + Math.hypot(D[i].x - D[i - 1].x, D[i].y - D[i - 1].y, D[i].z - D[i - 1].z);
  // The line's shape along it: heading and climb angle, and how fast they turn per foot (for the G at another speed).
  const head = new Float64Array(M);
  const gam = new Float64Array(M);
  for (let i = 0; i < M; i++) {
    const a = D[Math.max(0, i - 1)];
    const b = D[Math.min(M - 1, i + 1)];
    const ds = Math.max(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), 1e-6);
    head[i] = Math.atan2(b.y - a.y, b.x - a.x);
    gam[i] = Math.asin(Math.max(-1, Math.min(1, (b.z - a.z) / ds)));
  }
  const kH = new Float64Array(M);
  const kV = new Float64Array(M);
  for (let i = 1; i < M - 1; i++) {
    const ds = Math.max(S[i + 1] - S[i - 1], 1e-6);
    kH[i] = wrapPi(head[i + 1] - head[i - 1]) / ds;
    kV[i] = (gam[i + 1] - gam[i - 1]) / ds;
  }
  let seg = 0;
  /** The sample index and fraction at arc length s. */
  const locate = (s) => {
    while (seg < M - 2 && S[seg + 1] <= s) seg++;
    while (seg > 0 && S[seg] > s) seg--;
    return { i: seg, u: Math.max(0, Math.min(1, (s - S[seg]) / Math.max(S[seg + 1] - S[seg], 1e-9))) };
  };
  const vAt = (k) => (S[Math.min(M - 1, k + 1)] - S[Math.max(0, k - 1)]) / ((Math.min(M - 1, k + 1) - Math.max(0, k - 1)) * dt);
  const out = D.slice(0, k0 + 1).map((p) => ({ ...p }));
  const flags = []; // per pose index from k0: { full, stretched, accel }
  let s = S[k0];
  let v = vAt(k0);
  let a = (vAt(k0 + 1) - vAt(Math.max(0, k0 - 1))) / (2 * dt);
  let k = k0;
  let stretchedAny = false;
  const overtake = HOLD.overtakeKias / kiasPerTas;
  while (k < M - 2) {
    // From the state at step k - 1 (s, v, a) to step k.
    const vd = vAt(k);
    const ad = (vAt(k + 1) - vAt(Math.max(0, k - 1))) / ((k + 1 - Math.max(0, k - 1)) * dt);
    const gap = S[k] - s;
    k++;
    // The overtake that still stops on the place at the planned rate (softened near it, so arriving has no kink).
    const close = Math.sign(gap) * Math.min(overtake, Math.sqrt(2 * HOLD.closeDecelFtps2 * Math.abs(gap) + 1) - 1);
    const want = ad + HOLD.gain * (vd + close - v);
    a += Math.max(-HOLD.jerkFtps3 * dt, Math.min(HOLD.jerkFtps3 * dt, want - a));
    // What the aircraft can do here, at this speed: G from the line's turn and pull-up at this speed, height from the line.
    const { i, u } = locate(s);
    const kias = v * kiasPerTas;
    const kh = kH[i] + (kH[i + 1] - kH[i]) * u;
    const kv2 = kV[i] + (kV[i + 1] - kV[i]) * u;
    const g0 = gam[i] + (gam[i + 1] - gam[i]) * u;
    const n = Math.hypot((v * v * kh) / G_FTPS2, Math.cos(g0) + (v * v * kv2) / G_FTPS2);
    const alt = blockFt + D[i].z + (D[i + 1].z - D[i].z) * u;
    const aMax = G_FTPS2 * (excessThrustPerWeight(kias, alt, n) - Math.sin(g0));
    const aMin = G_FTPS2 * (excessPerWeight('idleBoards', kias, alt, n) - Math.sin(g0));
    let full = false;
    if (a > aMax) {
      a = aMax;
      full = true;
    } else if (a < aMin) a = aMin;
    // The G wall (Patrick 03:05Z): past the stall line or just under 7 G on this line, he slows (idle and the boards) so the
    // G comes back down; the line in the air is kept.
    if (n > wallG(kias)) a = aMin;
    const v1 = v + a * dt;
    s += ((v + v1) / 2) * dt;
    v = v1;
    const at = locate(s);
    out.push(cr(D, at.i, at.u));
    const R = refAt(k);
    const range = Math.hypot(R.xFt - out[k].x, R.yFt - out[k].y);
    const behind = S[k] - s;
    const stretched = behind > Math.max(HOLD.stretchMinFt, HOLD.stretchShare * range);
    stretchedAny ||= stretched;
    flags[k] = { full, stretched };
    if (k >= N - 1 && Math.abs(S[k] - s) < 0.5 && Math.abs(v - vAt(k)) < 0.1 && Math.abs(a) < 0.05) break;
  }
  const end = k;
  // Poses read off the held line (the planned lines' own way: kinematic.js posesFrom), the part before kept as planned.
  const track = makeTrack(end + 1);
  const PAD = 3;
  for (let r = 0; r < track.x.length; r++) {
    const step = r - PAD; // pose index = step - 1
    const idx = step - 1;
    let p;
    if (idx < 0) {
      const a0 = out[0];
      const a1 = out[1];
      p = { x: a0.x + (a0.x - a1.x) * -idx, y: a0.y + (a0.y - a1.y) * -idx, z: a0.z + (a0.z - a1.z) * -idx };
    } else if (idx > end) {
      const b0 = out[end];
      const b1 = out[end - 1];
      const m = idx - end;
      p = { x: b0.x + (b0.x - b1.x) * m, y: b0.y + (b0.y - b1.y) * m, z: b0.z + (b0.z - b1.z) * m };
    } else p = out[idx];
    track.x[r] = p.x;
    track.y[r] = p.y;
    track.z[r] = p.z;
  }
  const line = posesFrom(track, kiasPerTas).poses.slice(0, end + 1);
  for (let j = 0; j < Math.min(k0 - 1, N); j++) line[j] = poses[j];
  for (let j = Math.max(0, k0 - 1); j <= end; j++) {
    const p = line[j];
    const f = flags[j];
    const old = j < N ? poses[j] : null;
    p.over = old?.over ?? false;
    p.stretched = Boolean(f?.stretched);
    const ktps = j > 0 && j < end ? (line[j + 1].kias - line[j - 1].kias) / (2 * dt) : 0;
    if (f?.full) {
      p.power = powerFrom(null, 1, p.kias, blockFt);
      p.stage = null;
    } else {
      p.power = powerFor(ktps, p.kias, blockFt, p.g, p.climb, 'idleBoards');
      p.stage = p.power?.stage ?? null;
    }
  }
  settleLast(line, refAt(end));
  return { poses: line, changed: true, stretched: stretchedAny, endIndex: end };
}

// ---- one step of the hold, and the live hold (fluid manoeuvring, V2.59) ---------------------------------------------

/** The most #2 may speed up along his line (true airspeed, ft/s²): full power's excess at kias, altFt and G n, less the climb at angle gamma. */
export function fullPowerFtps2(kias, altFt, n, gamma) {
  return G_FTPS2 * (excessThrustPerWeight(kias, altFt, n) - Math.sin(gamma));
}

/** The G on a line that turns kh (rad/ft across) and pulls up kv (rad/ft) at climb angle gamma, flown at v ft/s (standard kinematics). */
export function lineG(v, kh, kv, gamma) {
  return Math.hypot((v * v * kh) / G_FTPS2, Math.cos(gamma) + (v * v * kv) / G_FTPS2);
}

/**
 * One step of the hold (the rules at the top), from #2's speed v and acceleration a along his line (ft/s, ft/s²):
 *  vd, ad: the planned speed and acceleration he follows (the caller says which: holdToPower the place he should be at,
 *    holdLiveStep the place he is at); gap: how far along the line the
 *    planned place is ahead of him (ft); overtakeFtps: the most overtake he closes with;
 *  kias, altFt: his indicated speed and height now; kh, kv, gamma: the line's turn, pull-up and climb angle where he is;
 *  gAt(v): the G on the line where he is at speed v (lineG from kh, kv and gamma unless given).
 * He follows the plan's speed plus the closing overtake (softened near the place, so arriving has no kink), his
 * acceleration changing no faster than HOLD.jerkFtps3, inside full power and idle with the boards; past the G wall
 * (Patrick 03:05Z) he slows (idle and the boards) so the G comes back down, where slowing does that; the line in the air
 * is kept.
 * Returns { v, a, ds (feet moved along the line this step), full (held to full power) }.
 */
export function governStep(state, { vd, ad, gap, overtakeFtps, kias, altFt, kh, kv, gamma, gAt = (u) => lineG(u, kh, kv, gamma) }) {
  const { v } = state;
  let { a } = state;
  const close = Math.sign(gap) * Math.min(overtakeFtps, Math.sqrt(2 * HOLD.closeDecelFtps2 * Math.abs(gap) + 1) - 1);
  const want = ad + HOLD.gain * (vd + close - v);
  a += Math.max(-HOLD.jerkFtps3 * dt, Math.min(HOLD.jerkFtps3 * dt, want - a));
  const n = gAt(v);
  const aMax = fullPowerFtps2(kias, altFt, n, gamma);
  const aMin = G_FTPS2 * (excessPerWeight('idleBoards', kias, altFt, n) - Math.sin(gamma));
  let full = false;
  if (a > aMax) {
    a = aMax;
    full = true;
  } else if (a < aMin) a = aMin;
  // Past the wall he slows only where slowing brings the G down (the line's turn, not gravity, is most of it): slower over
  // the top of a loop the stall line falls faster than the G does.
  if (n > wallG(kias) && gAt(v * 0.99) < n) a = aMin;
  const v1 = v + a * dt;
  return { v: v1, a, ds: ((v + v1) / 2) * dt, full };
}

// ---- the live hold: a line planned a few seconds ahead and re-planned on a press (fluid manoeuvring) ----------------

const KT_PER_FTPS = 1 / KT_TO_FTPS;

/**
 * One step of the hold on a line that is only planned a few seconds ahead (fluid manoeuvring, Patrick 04:07Z: "I thought
 * we established fluid speed ups between md full just end stretched and fix la after"): the same rules and governStep as
 * holdToPower, worked out step by step, so a press of Lead's that re-plans the line ahead is followed from where #2 is.
 *  state: null while #2 flies the planned line exactly, else { sig (his place: a fractional step of the line), v, a, landK,
 *    o and ov (his offset inside the turn, ft, and how fast it changes; V2.59 cut inside) };
 *  P(k): the planned line's point at step k ({ x, y, z }, z above the block; needs k - 2 .. k + 5);
 *  k: the step to fly to; ref: the aircraft he flies off at step k ({ x, y }); blockFt: the block height.
 * Returns { state, p (his point at step k), stretched, full }. With state null and the line inside full power, p is P(k).
 */
export function holdLiveStep(state, P, k, ref, blockFt) {
  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  const seg = (i) => dist(P(i), P(i + 1));
  const vAt = (j) => (seg(j - 1) + seg(j)) / (2 * dt);
  // The line's shape at sample i: its direction t, curvature vector (per foot) and height. In 3D, so straight up or down
  // (the loop) is no different from level.
  const shape = (i) => {
    const a = P(i - 1);
    const b = P(i);
    const c = P(i + 1);
    const l1 = Math.max(dist(a, b), 1e-6);
    const l2 = Math.max(dist(b, c), 1e-6);
    const t1 = { x: (b.x - a.x) / l1, y: (b.y - a.y) / l1, z: (b.z - a.z) / l1 };
    const t2 = { x: (c.x - b.x) / l2, y: (c.y - b.y) / l2, z: (c.z - b.z) / l2 };
    const m = 2 / (l1 + l2);
    const tx = t1.x + t2.x;
    const ty = t1.y + t2.y;
    const tz = t1.z + t2.z;
    const tl = Math.max(Math.hypot(tx, ty, tz), 1e-9);
    return { t: { x: tx / tl, y: ty / tl, z: tz / tl }, k: { x: (t2.x - t1.x) * m, y: (t2.y - t1.y) * m, z: (t2.z - t1.z) * m }, z: b.z };
  };
  const mixShape = (s0, s1, u) => {
    const l = (p, q) => ({ x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u, z: p.z + (q.z - p.z) * u });
    return { t: l(s0.t, s1.t), k: l(s0.k, s1.k), z: s0.z + (s1.z - s0.z) * u };
  };
  // The G at speed v on a line of that shape: the lift that turns it (v squared x curvature) and holds him up against
  // gravity's share square to the line (standard kinematics).
  const gOn = (sh) => (v) => {
    const tz = sh.t.z;
    const x = v * v * sh.k.x - G_FTPS2 * tz * sh.t.x;
    const y = v * v * sh.k.y - G_FTPS2 * tz * sh.t.y;
    const z = v * v * sh.k.z + G_FTPS2 * (1 - tz * sh.t.z);
    return Math.hypot(x, y, z) / G_FTPS2;
  };
  const climbOf = (sh) => Math.asin(Math.max(-1, Math.min(1, sh.t.z)));
  // Signed distance along the line from place sig to step j (positive: j ahead of him).
  const arcTo = (sig, j) => {
    const i = Math.floor(sig);
    const u = sig - i;
    if (j <= i) {
      let d = u * seg(i);
      for (let m = j; m < i; m++) d += seg(m);
      return -d;
    }
    let d = (1 - u) * seg(i);
    for (let m = i + 1; m < j; m++) d += seg(m);
    return d;
  };
  const along = (sig, ds) => {
    let i = Math.floor(sig);
    let left = (1 - (sig - i)) * seg(i);
    while (ds > left) {
      ds -= left;
      i += 1;
      left = seg(i);
    }
    return i + 1 - (left - ds) / Math.max(seg(i), 1e-9);
  };
  const pointAt = (sig) => {
    const i = Math.floor(sig);
    return cr([P(i - 1), P(i), P(i + 1), P(i + 2)], 1, sig - i);
  };
  let st = state;
  if (!st) {
    // Is the planned line asking more than full power here? (its speed-up read over half a second, as firstOverPower)
    const vd = vAt(k);
    const ad = (vAt(k + 5) - vAt(k - 5)) / (10 * dt);
    const sh = shape(k);
    const alt = blockFt + sh.z;
    const kias = tasToIasKt(vd * KT_PER_FTPS, alt);
    const up = fullPowerFtps2(kias, alt, gOn(sh)(vd), climbOf(sh));
    const margin = Math.abs(up) * HOLD.margin.share + HOLD.margin.ktps * (vd / Math.max(kias, 1));
    if (!(ad > up + margin)) return { state: null, p: P(k), stretched: false, full: false };
    st = { sig: k - 1, v: vAt(k - 1), a: (vAt(k) - vAt(k - 2)) / (2 * dt), landK: null };
  }
  const i = Math.floor(st.sig);
  const u = st.sig - i;
  const sh = mixShape(shape(i), shape(i + 1), u);
  const alt = blockFt + sh.z;
  const kias = tasToIasKt(st.v * KT_PER_FTPS, alt);
  // The line's own speed and speed-up at his place (not at the place it wanted him now): behind on a loop he flies its
  // bottom at the bottom's speed, not at the speed of the top the plan has reached.
  const vd = vAt(i) + (vAt(i + 1) - vAt(i)) * u;
  const adAt = (j) => (vAt(j + 1) - vAt(j - 1)) / (2 * dt);
  const ad = (adAt(i) + (adAt(i + 1) - adAt(i)) * u) * (st.v / Math.max(vd, 1));
  // Cutting inside (V2.59, Patrick card 5 Oct 04:53Z "Geometry: cut inside"): while he is behind, #2 flies a little inside
  // the line's turn (less lag, toward pure pursuit), offset `o` from the line toward its centre. Inside the turn his own
  // path is shorter by (1 - c x curvature), so the same speed takes him further along Lead's line and the gap closes; the
  // tighter turn costs G, so the offset never asks more than the G rule's normal 5 G (TS-63, G_RULE).
  const o0 = st.o ?? { x: 0, y: 0, z: 0 };
  const ov0 = st.ov ?? { x: 0, y: 0, z: 0 };
  const kap = Math.hypot(sh.k.x, sh.k.y, sh.k.z);
  const cIn = kap > 1e-9 ? (o0.x * sh.k.x + o0.y * sh.k.y + o0.z * sh.k.z) / kap : 0;
  const shorten = Math.max(0.7, 1 - cIn * kap);
  const g = governStep(st, {
    vd, ad, gap: arcTo(st.sig, k), overtakeFtps: HOLD.overtakeKias / (kias / Math.max(st.v, 1)),
    kias, altFt: alt, gamma: climbOf(sh), gAt: (u) => gOn(sh)(u) / shorten, kh: 0, kv: 0, // the G from the 3D shape (gAt), not kh and kv
  });
  const sig = along(st.sig, Math.max(0, g.ds / shorten));
  const line = pointAt(sig);
  const behind = arcTo(sig, k);
  const range = Math.hypot(ref.x - line.x, ref.y - line.y);
  const thr = Math.max(HOLD.stretchMinFt, HOLD.stretchShare * range);
  const stretched = behind > thr;
  // The offset he wants: none on the line, growing smoothly once he is stretched, at most cutShare of the range (about
  // 15° of the 15° lag line, so he stays inside the 30° cone), never more than he is behind, and inside 5 G.
  const shN = mixShape(shape(Math.floor(sig)), shape(Math.floor(sig) + 1), sig - Math.floor(sig));
  const kapN = Math.hypot(shN.k.x, shN.k.y, shN.k.z);
  let cWant = 0;
  if (kapN > HOLD.cutMinCurvPerFt) {
    const gNow = gOn(shN)(g.v);
    const cG = Math.max(0, 1 - gNow / G_RULE.normalG) / kapN;
    const w = smoothest((behind - thr) / (2 * thr));
    cWant = w * Math.min(HOLD.cutShare * range, Math.max(0, behind), cG, 0.3 / kapN);
  }
  const want = kapN > HOLD.cutMinCurvPerFt ? { x: (shN.k.x / kapN) * cWant, y: (shN.k.y / kapN) * cWant, z: (shN.k.z / kapN) * cWant } : { x: 0, y: 0, z: 0 };
  // Into and out of the offset smoothly (a critically damped follow over about cutSec), square to the line.
  const om = 4 / HOLD.cutSec;
  const ov = { x: 0, y: 0, z: 0 };
  const o = { x: 0, y: 0, z: 0 };
  for (const ax of /** @type {const} */ (['x', 'y', 'z'])) {
    ov[ax] = ov0[ax] + (om * om * (want[ax] - o0[ax]) - 2 * om * ov0[ax]) * dt;
    o[ax] = o0[ax] + ov[ax] * dt;
  }
  const along0 = o.x * shN.t.x + o.y * shN.t.y + o.z * shN.t.z;
  o.x -= along0 * shN.t.x;
  o.y -= along0 * shN.t.y;
  o.z -= along0 * shN.t.z;
  const oLen = Math.hypot(o.x, o.y, o.z);
  let p = { x: line.x + o.x, y: line.y + o.y, z: line.z + o.z };
  let landK = st.landK;
  // Caught up (on his place, at its speed and acceleration, back on the line): the last fraction of a foot is blended
  // onto the line, then he flies it exactly again.
  if (landK === null && oLen < 0.1 && Math.abs(behind) < 0.1 && Math.abs(g.v - vd) < 0.1 && Math.abs(g.a - ad) < 0.1) landK = k;
  if (landK !== null) {
    const w = smoothest((k - landK) / (HOLD.landSec / dt));
    if (w >= 1) return { state: null, p: P(k), stretched: false, full: false };
    const q = P(k);
    p = { x: p.x + (q.x - p.x) * w, y: p.y + (q.y - p.y) * w, z: p.z + (q.z - p.z) * w };
  }
  return { state: { sig, v: g.v, a: g.a, landK, o, ov }, p, stretched, full: g.full };
}
