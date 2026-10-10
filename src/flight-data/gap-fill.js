// GPS gap fill (DB-19, DB-20; Dad's ask, 10 Oct 2026, Patrick approved, relayed by Dad): a best guess at where an
// aircraft flew while its track has a gap, as a path a T-6 could fly between the fixes either side, with a zone round it
// of where it could have been. A general solver for any track anyone loads: single ship or formation, turns, climbs,
// descents and straight legs, not tuned to one file.
//
// It never changes a track. sampleAt, inGap, the readouts, the standards, the tennis ball and the CSV never see it:
// only the Debrief's drawing reads its results (fillSampleAt), and every sample says estimated: true.
//
// How (the spec's "GPS gap fill" section, docs/modules/debrief/spec.md):
//  - each end of a gap: a least-squares quadratic in time through up to 5 good fixes, passing exactly through the end
//    fix, gives position, velocity, track, turn rate, height and climb rate;
//  - formation first: another ship with real fixes over the gap, close enough and steady enough at both ends, pins it;
//    the ship flies that ship's real path plus its offset carried across by a smooth curve;
//  - alone: one steady turn (two for an S-turn), the bank eased in and out with core easeRoll at a pilot's roll rate
//    held under the T-6's, the turn rate from core turnRateFromBankRadPerSec, speed straight between the ends plus a
//    smooth change of at most MAX_SPEED_CHANGE_KT, height a smooth curve matching both ends' climb; solved in the moving
//    air when the caller gives a wind, over the ground otherwise;
//  - a gap that can't be flown, is too long, or takes in a landing or take-off is left as a gap, with the reason.
// Every threshold here is an ESTIMATE (no manual gives one), named where it is set.
//
// Units are in the names; positions are flight-data's map feet (x east, y north), headings radians, 0 = east,
// counter-clockwise (so a left turn is a positive turn rate), and bank is LEFT wing down positive, as the Debrief's
// 3D view takes it.
import { easeRoll, turnRateFromBankRadPerSec, bankDegFromTurnRate, gFromBankDeg, bankDegFromG } from '../core/flight-math.js';
import { rollWithinT6A, stallLimitG, tasToIasKt, T6A_LIMITS } from '../core/t6-performance.js';
import { wrapPi, radToDeg } from '../core/angles.js';
import { KT_TO_FTPS, FTPS_TO_KT } from '../core/units.js';
import { GAP_S, MIN_SPEED_TIME_S } from './clean.js';

/** The fill's numbers, all ESTIMATES (design pass, 10 Oct 2026) unless a line names a source. */
export const GAP_FILL = Object.freeze({
  /** Seconds between the fill's samples. */
  stepS: 0.25,
  /** The longest gap filled alone, and with another ship pinning it (DB-Q20's working answer (b)). */
  maxSingleS: 60,
  maxFormationS: 120,
  /** Fixes read at each end (at most), and the fewest that still give a speed and a turn. */
  endFixes: 5,
  minEndFixes: 3,
  /** A fix that would need more than this ground speed is left out of an end's curve (the readouts' MAX_BELIEVED_GS_KT idea). */
  maxBelievedGsKt: 350,
  /** Both ends slower than this: on the ground, a straight line. One end slower than airborneKt, the other not: a landing or take-off. */
  groundKt: 40,
  airborneKt: 60,
  /** A pilot's roll: rate and its build-up (Traffic's estimates, 45°/s and 90°/s²), held under the T-6's (core rollWithinT6A). */
  pilotRoll: Object.freeze({ maxRateDps: 45, maxAccelDps2: 90 }),
  /** The most the speed may differ from a straight line between the two ends' speeds, in the middle of the gap. */
  maxSpeedChangeKt: 40,
  /** How close a solve must land: on the far fix, on its track, and on its bank. */
  hitFt: 100,
  hitTrackDeg: 5,
  hitBankDeg: 15,
  /**
   * Formation pin: offset within maxOffsetFt at both ends, changing by no more than max(minChangeFt, changeFrac of it),
   * closing or opening slower than maxClosureKt, the other ship's fixes padS either side. The design pass proposed
   * 200 ft, a quarter and 30 kt; on the example flight that refused its own worked case (#1 at 19:21:40Z: #3 opening at
   * 34 kt as the gap starts, #4's offset moving 263 ft), which is ordinary close-formation movement, so they were opened up.
   */
  formation: Object.freeze({ maxOffsetFt: 1500, minChangeFt: 300, changeFrac: 0.5, maxClosureKt: 60, padS: 5 }),
  /** The zone: at least minFt, plus growth of the distance flown from the nearer fix; height band from end climb rates ±climbFpm, at least minVertFt. */
  zone: Object.freeze({ minFt: 50, growth: 0.02, climbFpm: 500, minVertFt: 50 }),
});

/** Why a gap was left as a gap, in the status details' words. */
export const NOT_FILLED_WORDS = Object.freeze({
  'too-long': `too long to guess alone (over ${GAP_FILL.maxSingleS} s, no other ship close enough to follow)`,
  'no-join': "the fixes either side can't be joined at the speeds flown, likely a GPS or logging fault",
  stall: 'joining them needs more G than the wing gives at that speed',
  'ground-change': 'it takes in a landing or take-off',
  slow: 'too slow to tell (taxiing or the take-off roll)',
  'few-fixes': 'too few good fixes either side',
  error: "couldn't be worked out",
});

const DEG = Math.PI / 180;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ── Smooth curves ───────────────────────────────────────────────────────────

/**
 * A cubic Hermite curve: the value at time t (0 to T) of the curve leaving p0 with slope m0 and arriving at p1 with
 * slope m1 (slopes per second). Returns { value, slope }. Joins two known ends smoothly, with no corner at either.
 */
export function hermite(p0, m0, p1, m1, T, t) {
  const u = T > 0 ? clamp(t / T, 0, 1) : 0;
  const u2 = u * u;
  const u3 = u2 * u;
  const value = (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * T * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * T * m1;
  const slope = T > 0
    ? ((6 * u2 - 6 * u) * p0) / T + (3 * u2 - 4 * u + 1) * m0 + ((-6 * u2 + 6 * u) * p1) / T + (3 * u2 - 2 * u) * m1
    : m0;
  return { value, slope };
}

/** Index of the fix at or before t, for a t inside the track. */
function bracket(fixes, t) {
  let lo = 0;
  let hi = fixes.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (fixes[mid].t <= t) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** A fix's velocity (ft/s) from its neighbours, not across a gap: central where it can, one-sided at an end or a gap. */
function fixVelocity(f, i) {
  const n = f.length;
  const near = (j) => j >= 0 && j < n && Math.abs(f[j].t - f[i].t) <= GAP_S;
  const a = near(i - 1) ? f[i - 1] : f[i];
  const b = near(i + 1) ? f[i + 1] : f[i];
  const dt = b.t - a.t;
  if (!(dt > 0)) return { vx: 0, vy: 0, vz: 0 };
  return { vx: (b.xFt - a.xFt) / dt, vy: (b.yFt - a.yFt) / dt, vz: (b.altFt - a.altFt) / dt };
}

/**
 * A track's position at time t on a smooth curve through its fixes (cubic Hermite, each fix's velocity from its
 * neighbours), so a path read from it has no corner at each second as the straight lines between fixes have.
 * Across a GPS gap it is the straight chord, as sampleAt. Returns { xFt, yFt, altFt, vx, vy, vz } (velocities ft/s).
 */
export function smoothAt(track, t) {
  const f = track.fixes;
  const n = f.length;
  if (!n) return null;
  if (n === 1 || t <= f[0].t || t >= f[n - 1].t) {
    const i = t <= f[0].t ? 0 : n - 1;
    const v = n > 1 ? fixVelocity(f, i) : { vx: 0, vy: 0, vz: 0 };
    return { xFt: f[i].xFt, yFt: f[i].yFt, altFt: f[i].altFt, ...v };
  }
  const i = bracket(f, t);
  const a = f[i];
  const b = f[i + 1];
  const T = b.t - a.t;
  if (T > GAP_S) {
    const k = (t - a.t) / T;
    return {
      xFt: a.xFt + (b.xFt - a.xFt) * k, yFt: a.yFt + (b.yFt - a.yFt) * k, altFt: a.altFt + (b.altFt - a.altFt) * k,
      vx: (b.xFt - a.xFt) / T, vy: (b.yFt - a.yFt) / T, vz: (b.altFt - a.altFt) / T,
    };
  }
  const va = fixVelocity(f, i);
  const vb = fixVelocity(f, i + 1);
  const x = hermite(a.xFt, va.vx, b.xFt, vb.vx, T, t - a.t);
  const y = hermite(a.yFt, va.vy, b.yFt, vb.vy, T, t - a.t);
  const z = hermite(a.altFt, va.vz, b.altFt, vb.vz, T, t - a.t);
  return { xFt: x.value, yFt: y.value, altFt: z.value, vx: x.slope, vy: y.slope, vz: z.slope };
}

// ── The two ends of a gap ───────────────────────────────────────────────────

/**
 * What the aircraft was doing at fix i, read from up to GAP_FILL.endFixes fixes on one side (dir −1 before, +1 after):
 * a least-squares quadratic in time through them that passes exactly through fix i. Fixes past another gap, or that
 * would need more than maxBelievedGsKt from their neighbour, are left out. Null with fewer than minEndFixes.
 * Returns { t, xFt, yFt, altFt, vx, vy, ax, ay, climbFtps, gsKt, turnRadPerSec }.
 */
export function endState(fixes, i, dir) {
  const end = fixes[i];
  const pts = [end];
  for (let j = i + dir; j >= 0 && j < fixes.length && pts.length < GAP_FILL.endFixes; j += dir) {
    const prev = pts[pts.length - 1];
    const dt = Math.abs(fixes[j].t - prev.t);
    if (dt > GAP_S) break;
    const kt = (Math.hypot(fixes[j].xFt - prev.xFt, fixes[j].yFt - prev.yFt) / Math.max(dt, MIN_SPEED_TIME_S)) * FTPS_TO_KT;
    if (kt > GAP_FILL.maxBelievedGsKt) break;
    pts.push(fixes[j]);
  }
  if (pts.length < GAP_FILL.minEndFixes) return null;
  // Normal equations of x(τ) = v τ + a τ²/2 through the end fix (τ = 0 there).
  let s2 = 0, s3 = 0, s4 = 0;
  const sx = { x: 0, y: 0, z: 0 };
  const sxx = { x: 0, y: 0, z: 0 };
  for (const p of pts.slice(1)) {
    const tau = p.t - end.t;
    const t2 = tau * tau;
    s2 += t2;
    s3 += t2 * tau;
    s4 += t2 * t2;
    const d = { x: p.xFt - end.xFt, y: p.yFt - end.yFt, z: p.altFt - end.altFt };
    for (const k of ['x', 'y', 'z']) {
      sx[k] += tau * d[k];
      sxx[k] += t2 * d[k];
    }
  }
  const a11 = s2, a12 = s3 / 2, a22 = s4 / 4;
  const det = a11 * a22 - a12 * a12;
  if (!(Math.abs(det) > 1e-9)) return null;
  const fit = (k) => {
    const b1 = sx[k];
    const b2 = sxx[k] / 2;
    return { v: (b1 * a22 - a12 * b2) / det, a: (a11 * b2 - a12 * b1) / det };
  };
  const fx = fit('x'), fy = fit('y'), fz = fit('z');
  const v2 = fx.v * fx.v + fy.v * fy.v;
  return {
    t: end.t, xFt: end.xFt, yFt: end.yFt, altFt: end.altFt,
    vx: fx.v, vy: fy.v, ax: fx.a, ay: fy.a, climbFtps: fz.v,
    gsKt: Math.sqrt(v2) * FTPS_TO_KT,
    turnRadPerSec: v2 > 1 ? (fx.v * fy.a - fy.v * fx.a) / v2 : 0,
  };
}

/** A track's gaps as groups: two gaps with fewer than minEndFixes fixes between them are one, the fixes between kept as checks. */
function gapGroups(fixes) {
  const groups = [];
  for (let i = 1; i < fixes.length; i++) {
    if (fixes[i].t - fixes[i - 1].t <= GAP_S) continue;
    const last = groups[groups.length - 1];
    if (last && i - 1 - last.iB + 1 < GAP_FILL.minEndFixes) {
      last.checks.push(...fixes.slice(last.iB, i));
      last.iB = i;
    } else groups.push({ iA: i - 1, iB: i, checks: [] });
  }
  return groups;
}

// ── A small damped Gauss-Newton (Levenberg-Marquardt) ───────────────────────

function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const k = M[r][c] / M[c][c];
      for (let k2 = c; k2 <= n; k2++) M[r][k2] -= k * M[c][k2];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let c = r + 1; c < n; c++) s -= M[r][c] * x[c];
    x[r] = s / M[r][r];
  }
  return x;
}

const sumSq = (r) => r.reduce((s, v) => s + v * v, 0);

/** Minimises |residual(p)|² from p0, each parameter kept in [lo, hi], with finite-difference steps `steps`. */
function leastSquares(residual, p0, lo, hi, steps, maxIter = 20) {
  const n = p0.length;
  const keep = (p) => p.map((v, j) => clamp(v, lo[j], hi[j]));
  let p = keep(p0);
  let r = residual(p);
  let cost = sumSq(r);
  let lambda = 1e-2;
  for (let it = 0; it < maxIter && cost > 1e-6; it++) {
    const J = [];
    for (let j = 0; j < n; j++) {
      const q = p.slice();
      const h = q[j] + steps[j] > hi[j] ? -steps[j] : steps[j];
      q[j] += h;
      const rq = residual(q);
      J.push(rq.map((v, k) => (v - r[k]) / h));
    }
    const A = Array.from({ length: n }, (_, a) => Array.from({ length: n }, (__, b) => J[a].reduce((s, v, k) => s + v * J[b][k], 0)));
    const g = J.map((col) => col.reduce((s, v, k) => s + v * r[k], 0));
    let better = false;
    for (let tries = 0; tries < 8; tries++) {
      const D = A.map((row, a) => row.map((v, b) => (a === b ? v + lambda * (v + 1e-9) : v)));
      const d = solveLinear(D, g.map((v) => -v));
      if (!d) { lambda *= 4; continue; }
      const q = keep(p.map((v, j) => v + d[j]));
      const rq = residual(q);
      const cq = sumSq(rq);
      if (cq < cost) {
        const gain = cost - cq;
        p = q; r = rq; cost = cq;
        lambda = Math.max(lambda / 3, 1e-7);
        better = gain > 1e-6 * Math.max(cost, 1e-3);
        break;
      }
      lambda *= 4;
    }
    if (!better) break;
  }
  return { p, r, cost };
}

// ── Flying one gap alone ────────────────────────────────────────────────────

/**
 * Flies the gap in the moving air from A's state with a bank profile { bank0, breaks, cvKt }: the wings start at bank0
 * (not rolling) and ease (core easeRoll) toward each break's bank from its time on; the speed runs straight between the
 * ends plus cvKt × sin(π u); the height follows the climb curve. Returns the end { x, y, psi, bank }, overStallDeg (how
 * far the bank went past what the wing gives at that speed, core stallLimitG at est. IAS, 0 if never), the peak turn G
 * and, with `record`, the samples. Positions in feet from A, through the air.
 */
function fly(job, profile, record = false) {
  const { T, n, psiA, roll } = job;
  const { bank0, cvKt } = profile;
  const dt = T / n;
  const sorted = profile.breaks.map((b) => ({ t: clamp(b.t, 0, T), bank: b.bank })).sort((a, b) => a.t - b.t);
  let x = 0, y = 0, psi = psiA, bank = bank0, rate = 0, overStall = 0, peakG = 1;
  // The roll limits at the slowest true airspeed of this flight (the T-6's roll rate grows with speed, so that is the
  // lowest it gets): one call per flight instead of one per step.
  const lim = rollWithinT6A(roll, Math.max(0, Math.min(job.vA, job.vB) - Math.abs(cvKt) * KT_TO_FTPS) * FTPS_TO_KT);
  const out = record ? [] : null;
  const targetAt = (t) => {
    let target = bank0;
    for (const b of sorted) if (t >= b.t) target = b.bank;
    return target;
  };
  const step = (t, h) => {
    const v = job.speedAt(t + h / 2, cvKt);
    const ktas = v * FTPS_TO_KT;
    const was = bank;
    ({ bankDeg: bank, rollRateDps: rate } = easeRoll(bank, rate, targetAt(t + 1e-9), h, lim));
    const omega = turnRateFromBankRadPerSec(v, (was + bank) / 2);
    const climb = job.fastClimbAt(t + h / 2);
    const vh = Math.sqrt(Math.max(v * v - climb * climb, 0.25 * v * v));
    const mid = psi + (omega * h) / 2;
    x += vh * Math.cos(mid) * h;
    y += vh * Math.sin(mid) * h;
    psi += omega * h;
    const wing = stallLimitG(ktas * job.iasPerTasAt(t + h));
    overStall = Math.max(overStall, Math.abs(bank) - (wing > 1 ? bankDegFromG(wing) : 0));
    peakG = Math.max(peakG, gFromBankDeg(Math.min(Math.abs(bank), 89)));
  };
  for (let k = 0; k <= n; k++) {
    const t = k * dt;
    if (record) out.push({ t, x, y, psi, bank, rate, v: job.speedAt(t, cvKt) });
    if (k === n) break;
    // A break inside this step splits it, so the path moves smoothly as a break's time moves.
    let from = t;
    for (const b of sorted) {
      if (b.t > from && b.t < t + dt) {
        step(from, b.t - from);
        from = b.t;
      }
    }
    step(from, t + dt - from);
  }
  return { x, y, psi, bank, overStallDeg: overStall, peakG, samples: out };
}

/**
 * The weights the solver balances: feet on the far fix and degrees on its track first; the banks the ends' turns
 * suggest, loosely (a turn rate read off five GPS fixes is the least sure thing at an end); never past the stall line;
 * then the gentler turn (less peak G, as a pilot flies it), less speed change and less bank. All estimates.
 */
const SIGMA = Object.freeze({ posFt: 30, trackRad: 2 * DEG, endBankDeg: 15, stallDeg: 1, peakG: 3, cvKt: 40, levelDeg: 120 });
/** An end's bank may differ from the one its turn suggests by up to this much in a hit (an estimate). */
const END_BANK_SLACK_DEG = 30;

/** The residuals a profile leaves: on the far fix, its track, the ends' banks, the stall line, then the light preferences. */
function misfit(job, profile, target) {
  const e = fly(job, profile);
  const r = [
    (e.x - job.bx) / SIGMA.posFt, (e.y - job.by) / SIGMA.posFt, (e.psi - target) / SIGMA.trackRad,
    (e.bank - job.bankB) / SIGMA.endBankDeg, (profile.bank0 - job.bankA) / SIGMA.endBankDeg,
    Math.max(0, e.overStallDeg) / SIGMA.stallDeg, (e.peakG - 1) / SIGMA.peakG, profile.cvKt / SIGMA.cvKt,
  ];
  for (const b of profile.breaks) r.push(b.bank / SIGMA.levelDeg);
  return { r, e };
}

/** Did a profile land: on the far fix and its track, ends' banks near their turns, under the stall line, speed change within the cap. */
function judge(job, profile, target) {
  const { r, e } = misfit(job, profile, target);
  const miss = {
    ft: Math.hypot(e.x - job.bx, e.y - job.by),
    trackDeg: Math.abs(e.psi - target) / DEG,
    endBankDeg: Math.max(Math.abs(e.bank - job.bankB), Math.abs(profile.bank0 - job.bankA)),
    overStallDeg: e.overStallDeg,
  };
  const hit = miss.ft <= GAP_FILL.hitFt && miss.trackDeg <= GAP_FILL.hitTrackDeg && miss.endBankDeg <= END_BANK_SLACK_DEG
    && miss.overStallDeg <= 0.5 && Math.abs(profile.cvKt) <= GAP_FILL.maxSpeedChangeKt;
  return { miss, hit, cost: sumSq(r), peakDeg: Math.max(Math.abs(profile.bank0), ...profile.breaks.map((b) => Math.abs(b.bank))) };
}

/** The best profile of a `shape` from a few starts (parameter vectors), by damped Gauss-Newton; null if none. */
function solveShape(job, shape, target, starts) {
  const residual = (p) => misfit(job, shape.unpack(p), target).r;
  let best = null;
  for (const p0 of starts) {
    const sol = leastSquares(residual, p0, shape.lo(job.T), shape.hi(job.T), shape.steps);
    const profile = shape.unpack(sol.p);
    const cand = { profile, ...judge(job, profile, target) };
    if (!best || (cand.hit && !best.hit) || (cand.hit === best.hit && cand.cost < best.cost)) best = cand;
    if (best.hit && best.cost < 0.5) break;
  }
  return best;
}

const MAX_BANK_DEG = 85;
const MAX_CV_KT = 60; // searched a little past the cap, so a "can't join" is told apart from a near miss

/** One turn: from bank0 roll toward bank1 at t_in, back toward the end's turn at t_out; tIn or tOut may be pinned. */
function oneTurn({ tIn = null, tOut = null, bankB }) {
  const free = [tIn === null, tOut === null];
  const times = (lo, hi) => [...(free[0] ? [lo] : []), ...(free[1] ? [hi] : [])];
  return {
    unpack(p) {
      let k = 0;
      const a = free[0] ? p[k++] : tIn;
      const b = free[1] ? p[k++] : tOut;
      const [bank, cvKt, bank0] = p.slice(k);
      return { bank0, breaks: [{ t: a, bank }, { t: Math.max(a, b), bank: bankB }], cvKt };
    },
    lo: () => [...times(0, 0), -MAX_BANK_DEG, -MAX_CV_KT, -MAX_BANK_DEG],
    hi: (T) => [...times(T, T), MAX_BANK_DEG, MAX_CV_KT, MAX_BANK_DEG],
    steps: [...times(0.05, 0.05), 0.5, 0.5, 0.5],
    pack: ({ tIn: a, tOut: b, bank, cvKt, bank0 }) => [...(free[0] ? [a] : []), ...(free[1] ? [b] : []), bank, cvKt, bank0],
  };
}

/** Two turns (an S-turn, a reversal, or a turn tightened then eased): toward b1 at t1, b2 at t2, back to the end's turn at t3. */
function twoTurns({ bankB }) {
  return {
    unpack(p) {
      const [t1, t2, t3, b1, b2, cvKt, bank0] = p;
      const ts = [t1, t2, t3].sort((a, b) => a - b);
      return { bank0, breaks: [{ t: ts[0], bank: b1 }, { t: ts[1], bank: b2 }, { t: ts[2], bank: bankB }], cvKt };
    },
    lo: () => [0, 0, 0, -MAX_BANK_DEG, -MAX_BANK_DEG, -MAX_CV_KT, -MAX_BANK_DEG],
    hi: (T) => [T, T, T, MAX_BANK_DEG, MAX_BANK_DEG, MAX_CV_KT, MAX_BANK_DEG],
    steps: [0.05, 0.05, 0.05, 0.5, 0.5, 0.5, 0.5],
  };
}

/** The bank in [−MAX_BANK_DEG, MAX_BANK_DEG] at which `profileOf(bank)` ends on track `target` (bisection; heading grows with left bank). */
function bankForTrack(job, profileOf, target) {
  let lo = -MAX_BANK_DEG, hi = MAX_BANK_DEG;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (fly(job, profileOf(mid)).psi < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** The best starts among `seeds` (each { p, profile }) by the solver's own weights, at most `keep` of them. */
function bestStarts(job, seeds, target, keep) {
  return seeds.map((s) => ({ p: s.p, cost: sumSq(misfit(job, s.profile, target).r) }))
    .sort((a, b) => a.cost - b.cost).slice(0, keep).map((s) => s.p);
}

/** The time easeRoll takes to roll from one bank to another at a true airspeed (ft/s). */
function rollTimeS(fromDeg, toDeg, vFtps, roll) {
  const lim = rollWithinT6A(roll, vFtps * FTPS_TO_KT);
  let bank = fromDeg, rate = 0, t = 0;
  while (Math.abs(bank - toDeg) > 0.5 && t < 10) {
    ({ bankDeg: bank, rollRateDps: rate } = easeRoll(bank, rate, toDeg, 0.05, lim));
    t += 0.05;
  }
  return t;
}

/**
 * Sets up one gap for flying alone, in the moving air: B as seen through the air (B − wind × T), each end's true
 * airspeed, track through the air and turn (and the bank that turn suggests, core bankDegFromTurnRate), and the speed
 * and climb curves.
 */
function aloneJob(A, B, wind) {
  const T = B.t - A.t;
  const W = wind ?? { x: 0, y: 0 };
  const va = { x: A.vx - W.x, y: A.vy - W.y };
  const vb = { x: B.vx - W.x, y: B.vy - W.y };
  const vA = Math.hypot(va.x, va.y);
  const vB = Math.hypot(vb.x, vb.y);
  const turnA = vA > 1 ? (va.x * A.ay - va.y * A.ax) / (vA * vA) : 0;
  const turnB = vB > 1 ? (vb.x * B.ay - vb.y * B.ax) / (vB * vB) : 0;
  const bankLimit = (d) => clamp(d, -80, 80);
  // The climb curve and the IAS-to-TAS ratio at its heights (core tasToIasKt), tabled every eighth of a second, so the
  // many trial flights of a solve don't work them out at every step.
  const m = Math.max(2, Math.ceil(T / 0.125));
  const climbTab = new Float64Array(m + 1);
  const ratioTab = new Float64Array(m + 1);
  for (let i = 0; i <= m; i++) {
    const h = hermite(A.altFt, A.climbFtps, B.altFt, B.climbFtps, T, (i / m) * T);
    climbTab[i] = h.slope;
    ratioTab[i] = tasToIasKt(1, h.value);
  }
  const table = (tab) => (t) => {
    const k = clamp((t / T) * m, 0, m);
    const i = Math.min(m - 1, Math.floor(k));
    return tab[i] + (tab[i + 1] - tab[i]) * (k - i);
  };
  return {
    T, n: Math.max(1, Math.ceil(T / GAP_FILL.stepS)), W,
    bx: B.xFt - A.xFt - W.x * T, by: B.yFt - A.yFt - W.y * T,
    vA, vB, psiA: Math.atan2(va.y, va.x), psiB: Math.atan2(vb.y, vb.x),
    turnA, turnB,
    bankA: bankLimit(bankDegFromTurnRate(vA, turnA)),
    bankB: bankLimit(bankDegFromTurnRate(vB, turnB)),
    roll: GAP_FILL.pilotRoll,
    speedAt: (t, cvKt) => Math.max(60, vA + ((vB - vA) * t) / T + cvKt * KT_TO_FTPS * Math.sin((Math.PI * clamp(t, 0, T)) / T)),
    heightAt: (t) => hermite(A.altFt, A.climbFtps, B.altFt, B.climbFtps, T, t),
    climbAt: (t) => hermite(A.altFt, A.climbFtps, B.altFt, B.climbFtps, T, t).slope,
    fastClimbAt: table(climbTab),
    iasPerTasAt: table(ratioTab),
  };
}

/**
 * The best path alone: one turn, tried both ways round when the turn is over 120° or both ends turn against the short
 * way, the gentler kept; two turns only if one can't. Each solve starts from a coarse search: roll-in and roll-out
 * times on a grid, each with the bank that ends on the far track. Returns { kind, sol, target } or { reason }.
 */
function solveAlone(job) {
  const { T } = job;
  const short = wrapPi(job.psiB - job.psiA);
  const targets = [short];
  const endsAgainst = Math.sign(job.turnA) === Math.sign(job.turnB) && Math.sign(job.turnA) === -Math.sign(short)
    && Math.min(Math.abs(job.turnA), Math.abs(job.turnB)) > 1 * DEG;
  if (Math.abs(short) > 120 * DEG || endsAgainst) targets.push(short - 2 * Math.PI * Math.sign(short || 1));
  const grid = [0, 0.25, 0.5, 0.75, 1];
  let best = null;
  for (const turn of targets) {
    const target = job.psiA + turn;
    const shape = oneTurn({ bankB: job.bankB });
    const seeds = [];
    for (const fa of grid) {
      for (const fb of grid) {
        if (fb < fa + 0.25) continue;
        for (const cvKt of [0, 30, -30]) {
          const [a, b] = [fa * T, fb * T];
          const packed = (bank) => shape.pack({ tIn: a, tOut: b, bank, cvKt, bank0: job.bankA });
          const bank = bankForTrack(job, (b1) => shape.unpack(packed(b1)), target);
          seeds.push({ p: packed(bank), profile: shape.unpack(packed(bank)) });
        }
      }
    }
    const sol = solveShape(job, shape, target, bestStarts(job, seeds, target, 3));
    if (sol && (!best || (sol.hit && !best.sol.hit) || (sol.hit === best.sol.hit && sol.peakDeg < best.sol.peakDeg))) {
      best = { kind: 'turn', sol, target };
    }
  }
  if (best?.sol.hit) return best;
  // Two turns, the short way round: banks b1 on a small grid, b2 the one that ends on the far track.
  const target = job.psiA + short;
  const shape = twoTurns({ bankB: job.bankB });
  const seeds = [];
  for (const [f1, f2, f3] of [[0, 0.4, 0.9], [0, 0.5, 1], [0.1, 0.6, 1], [0, 0.3, 0.7], [0.2, 0.6, 0.9]]) {
    for (const b1 of [-60, -30, 30, 60]) {
      for (const cvKt of [0, 30]) {
        const p = (b2) => [f1 * T, f2 * T, f3 * T, b1, b2, cvKt, job.bankA];
        const b2 = bankForTrack(job, (bank) => shape.unpack(p(bank)), target);
        seeds.push({ p: p(b2), profile: shape.unpack(p(b2)) });
      }
    }
  }
  const sol = solveShape(job, shape, target, bestStarts(job, seeds, target, 3));
  if (sol?.hit) return { kind: 'turns', sol, target };
  return { reason: sol?.miss.overStallDeg > 0.5 && sol.miss.ft <= GAP_FILL.hitFt ? 'stall' : 'no-join' };
}

// ── Building a fill ─────────────────────────────────────────────────────────

/** A sample's sideways offset from a path point (left of its track positive), feet. */
function sideways(p, q) {
  const len = Math.hypot(p.vx, p.vy) || 1;
  return ((q.xFt - p.xFt) * -p.vy + (q.yFt - p.yFt) * p.vx) / len;
}

/** The furthest sideways (side +1 left, −1 right) a point can be from p at time t and still be reachable from A and make B. */
function reachFt(p, side, t, job, A, B, vMaxFtps) {
  const len = Math.hypot(p.vx, p.vy) || 1;
  const nx = (-p.vy / len) * side, ny = (p.vx / len) * side;
  const W = job.W;
  const ok = (s) => {
    const x = p.xFt + nx * s - W.x * t, y = p.yFt + ny * s - W.y * t; // through the air, from A
    const ax = A.xFt, ay = A.yFt;
    const bx = B.xFt - W.x * job.T, by = B.yFt - W.y * job.T;
    return Math.hypot(x - ax, y - ay) <= vMaxFtps * t + 1 && Math.hypot(bx - x, by - y) <= vMaxFtps * (job.T - t) + 1;
  };
  if (!ok(0)) return 0;
  let lo = 0, hi = 50;
  while (ok(hi) && hi < 200_000) { lo = hi; hi *= 2; }
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) lo = mid; else hi = mid;
  }
  return lo;
}

/** Fills in each sample's ground speed, track, true airspeed, est. IAS, G and climb angle, and checks the stall line. */
function finishSamples(samples, wind) {
  const W = wind ?? { x: 0, y: 0 };
  let maxG = 1;
  let stall = false;
  for (const s of samples) {
    s.gsKt = Math.hypot(s.vx, s.vy) * FTPS_TO_KT;
    s.hdg = Math.atan2(s.vy, s.vx);
    const air = Math.hypot(s.vx - W.x, s.vy - W.y);
    s.noseHdg = Number.isFinite(s.noseHdg) ? s.noseHdg : Math.atan2(s.vy - W.y, s.vx - W.x);
    s.tasKt = Math.hypot(air, s.climbFtps) * FTPS_TO_KT;
    s.kias = tasToIasKt(s.tasKt, s.altFt);
    s.g = gFromBankDeg(s.bankDeg);
    s.climbDeg = radToDeg(Math.atan2(s.climbFtps, Math.max(air, 1)));
    s.estimated = true;
    if (s.g > maxG) maxG = s.g;
    const wing = stallLimitG(s.kias);
    if (Math.abs(s.bankDeg) - (wing > 1 ? bankDegFromG(wing) : 0) > 0.5) stall = true;
  }
  return { maxG, stall };
}

/** A fill flown alone (one or two turns) from its solved profile, put back over the ground, with its zone. */
function aloneFill(job, A, B, solved, checks) {
  const { sol } = solved;
  const { profile } = sol;
  const flown = fly(job, profile, true).samples;
  const W = job.W;
  // The solve lands within GAP_FILL.hitFt of B: the last few feet are spread along the path so it ends on the fix.
  const last = flown[flown.length - 1];
  const ex = job.bx - last.x, ey = job.by - last.y;
  const samples = flown.map((f) => {
    const u = f.t / job.T;
    const h = job.heightAt(f.t);
    const vh = Math.sqrt(Math.max(f.v * f.v - h.slope * h.slope, 0.25 * f.v * f.v));
    return {
      t: A.t + f.t,
      xFt: A.xFt + f.x + ex * u + W.x * f.t,
      yFt: A.yFt + f.y + ey * u + W.y * f.t,
      altFt: h.value, climbFtps: h.slope,
      vx: vh * Math.cos(f.psi) + W.x + ex / job.T, vy: vh * Math.sin(f.psi) + W.y + ey / job.T,
      noseHdg: wrapPi(f.psi), bankDeg: f.bank, rollRateDps: f.rate,
    };
  });
  const checksOut = finishSamples(samples, W);
  if (checksOut.stall) return { reason: 'stall' };
  // The zone: the turn as early and as late as it could be, then the floor, the reach and any stray fixes.
  const alts = [];
  if (solved.kind === 'turn') {
    const [roll1, roll2] = profile.breaks;
    const late = job.T - rollTimeS(roll1.bank, job.bankB, job.vB, job.roll);
    for (const pin of [{ tIn: 0 }, { tOut: Math.max(0, late) }]) {
      const shape = oneTurn({ ...pin, bankB: job.bankB });
      const p0 = shape.pack({ tIn: roll1.t, tOut: roll2.t, bank: roll1.bank, cvKt: profile.cvKt, bank0: profile.bank0 });
      const alt = solveShape(job, shape, solved.target, [p0]);
      if (alt?.hit) alts.push(fly(job, alt.profile, true).samples);
    }
  }
  const vMax = Math.max(job.vA, job.vB) + GAP_FILL.maxSpeedChangeKt * KT_TO_FTPS;
  let flownFt = 0;
  const along = samples.map((s, k) => (k ? (flownFt += Math.hypot(s.xFt - samples[k - 1].xFt, s.yFt - samples[k - 1].yFt)) : 0));
  const totalFt = flownFt;
  samples.forEach((s, k) => {
    const t = s.t - A.t;
    let left = 0, right = 0;
    for (const alt of alts) {
      const f = alt[k];
      const off = sideways(s, { xFt: A.xFt + f.x + W.x * f.t, yFt: A.yFt + f.y + W.y * f.t });
      if (off > left) left = off;
      if (-off > right) right = -off;
    }
    const floor = GAP_FILL.zone.minFt + GAP_FILL.zone.growth * Math.min(along[k], totalFt - along[k]);
    const capL = reachFt(s, 1, t, job, A, B, vMax);
    const capR = reachFt(s, -1, t, job, A, B, vMax);
    s.leftFt = Math.max(GAP_FILL.zone.minFt, Math.min(Math.max(left, floor), capL));
    s.rightFt = Math.max(GAP_FILL.zone.minFt, Math.min(Math.max(right, floor), capR));
    s.upFt = verticalBand(job.T, t);
  });
  widenForChecks(samples, checks);
  return {
    method: solved.kind, samples, maxG: checksOut.maxG, speedChangeKt: profile.cvKt,
    windUsed: Boolean(W.x || W.y),
  };
}

/** The height band either side of the curve: each end's climb rate ±climbFpm, at least minVertFt. */
function verticalBand(T, t) {
  const u = T > 0 ? clamp(t / T, 0, 1) : 0;
  const d = GAP_FILL.zone.climbFpm / 60;
  const h10 = u * u * u - 2 * u * u + u;
  const h11 = u * u * u - u * u;
  return Math.max(GAP_FILL.zone.minVertFt, T * d * (Math.abs(h10) + Math.abs(h11)));
}

/** Widens the zone so it takes in the stray fixes of a merged gap (each with a taper 3 s either side). */
function widenForChecks(samples, checks) {
  for (const c of checks) {
    let k = 0;
    while (k < samples.length - 1 && samples[k + 1].t <= c.t) k++;
    const off = sideways(samples[k], c);
    const need = Math.abs(off) + GAP_FILL.zone.minFt;
    for (const s of samples) {
      const taper = 1 - Math.min(1, Math.abs(s.t - c.t) / 3);
      if (taper <= 0) continue;
      const key = off >= 0 ? 'leftFt' : 'rightFt';
      s[key] = Math.max(s[key], need * taper);
    }
  }
}

/** A straight line on the ground (both ends under groundKt): no attitude. */
function groundFill(A, B) {
  const T = B.t - A.t;
  const n = Math.max(1, Math.ceil(T / GAP_FILL.stepS));
  const vx = (B.xFt - A.xFt) / T, vy = (B.yFt - A.yFt) / T;
  const samples = [];
  for (let k = 0; k <= n; k++) {
    const u = k / n;
    samples.push({
      t: A.t + u * T, xFt: A.xFt + (B.xFt - A.xFt) * u, yFt: A.yFt + (B.yFt - A.yFt) * u, altFt: A.altFt + (B.altFt - A.altFt) * u,
      vx, vy, climbFtps: (B.altFt - A.altFt) / T, bankDeg: 0, rollRateDps: 0, leftFt: GAP_FILL.zone.minFt, rightFt: GAP_FILL.zone.minFt, upFt: GAP_FILL.zone.minVertFt,
    });
  }
  finishSamples(samples, null);
  return { method: 'ground', samples, maxG: 1, speedChangeKt: 0, windUsed: false };
}

/** Has `track` real fixes, a fix at least every GAP_S seconds, from t0 to t1? */
function covers(track, t0, t1) {
  const f = track.fixes;
  if (!f.length || f[0].t > t0 || f[f.length - 1].t < t1) return false;
  for (let i = bracket(f, t0); i < f.length - 1 && f[i].t < t1; i++) if (f[i + 1].t - f[i].t > GAP_S) return false;
  return true;
}

/** Ship p's offset from ship r at time t, in r's heading frame (x along r's nose, y to its left), and r's heading. */
function offsetIn(r, p) {
  const h = Math.atan2(r.vy, r.vx);
  const dx = p.xFt - r.xFt, dy = p.yFt - r.yFt;
  return { along: dx * Math.cos(h) + dy * Math.sin(h), left: -dx * Math.sin(h) + dy * Math.cos(h), up: p.altFt - r.altFt, h };
}

/**
 * The formation fill (tried first): another ship with real fixes over the gap (and padS either side) whose offset is
 * small and steady at both ends pins it. Returns a fill, or null when no ship pins it.
 */
function formationFill(flight, slot, track, iA, iB, wind, checks) {
  const { formation: F } = GAP_FILL;
  const A = track.fixes[iA], B = track.fixes[iB];
  const T = B.t - A.t;
  if (T > GAP_FILL.maxFormationS) return null;
  const others = Object.values(flight.tracks).filter((tr) => tr.slot !== slot && covers(tr, A.t - F.padS, B.t + F.padS));
  const lead = others.filter((tr) => tr.slot === 1);
  const rest = others.filter((tr) => tr.slot !== 1)
    .map((tr) => ({ tr, d: Math.hypot(smoothAt(tr, A.t).xFt - A.xFt, smoothAt(tr, A.t).yFt - A.yFt) }))
    .sort((a, b) => a.d - b.d).map((o) => o.tr);
  // The ship's own motion at each end, from its end curves (endState), which leave out a jumpy fix just after a gap.
  const endA = endState(track.fixes, iA, -1), endB = endState(track.fixes, iB, 1);
  const motion = (end, fix, dt) => (end ? { xFt: fix.xFt + end.vx * dt, yFt: fix.yFt + end.vy * dt, altFt: fix.altFt + end.climbFtps * dt } : null);
  const selfA = motion(endA, A, -1), selfB = motion(endB, B, 1);
  for (const ref of [...lead, ...rest]) {
    const rA = smoothAt(ref, A.t), rB = smoothAt(ref, B.t);
    const dA = offsetIn(rA, A), dB = offsetIn(rB, B);
    const sizeA = Math.hypot(dA.along, dA.left), sizeB = Math.hypot(dB.along, dB.left);
    if (sizeA > F.maxOffsetFt || sizeB > F.maxOffsetFt) continue;
    if (Math.hypot(dB.along - dA.along, dB.left - dA.left) > Math.max(F.minChangeFt, F.changeFrac * sizeA)) continue;
    // Closure at each end, from the offsets a second outside the gap (closing positive, knots). An end with too few good
    // fixes to read its motion is judged by its offset alone, and the offset is taken as steady there.
    const dA0 = selfA && offsetIn(smoothAt(ref, A.t - 1), selfA), dB1 = selfB && offsetIn(smoothAt(ref, B.t + 1), selfB);
    const closureA = dA0 ? (Math.hypot(dA0.along, dA0.left) - sizeA) * FTPS_TO_KT : 0;
    const closureB = dB1 ? (sizeB - Math.hypot(dB1.along, dB1.left)) * FTPS_TO_KT : 0;
    if (Math.abs(closureA) >= F.maxClosureKt || Math.abs(closureB) >= F.maxClosureKt) continue;
    const still = { along: 0, left: 0, up: 0 };
    const rate = (a, b) => ({ along: b.along - a.along, left: b.left - a.left, up: b.up - a.up });
    const mA = dA0 ? rate(dA0, dA) : still, mB = dB1 ? rate(dB, dB1) : still;
    const n = Math.max(1, Math.ceil(T / GAP_FILL.stepS));
    const samples = [];
    for (let k = 0; k <= n; k++) {
      const t = (k / n) * T;
      const r = smoothAt(ref, A.t + t);
      const h = Math.atan2(r.vy, r.vx);
      const along = hermite(dA.along, mA.along, dB.along, mB.along, T, t);
      const left = hermite(dA.left, mA.left, dB.left, mB.left, T, t);
      const up = hermite(dA.up, mA.up, dB.up, mB.up, T, t);
      samples.push({
        t: A.t + t,
        xFt: r.xFt + along.value * Math.cos(h) - left.value * Math.sin(h),
        yFt: r.yFt + along.value * Math.sin(h) + left.value * Math.cos(h),
        altFt: r.altFt + up.value, climbFtps: r.vz + up.slope,
      });
    }
    // Velocities, turn and bank read off the path itself: velocity over ±1 sample, the turn over ±1 s (a shorter span
    // reads the quarter-second wobble of the curve as bank), the bank from the turn at the true airspeed (core
    // bankDegFromTurnRate).
    const W = wind ?? { x: 0, y: 0 };
    const dt = T / n;
    const span = Math.max(1, Math.round(1 / dt));
    const around = (k, w) => [samples[Math.max(0, k - w)], samples[Math.min(n, k + w)]];
    samples.forEach((s, k) => {
      const [a, b] = around(k, 1);
      s.vx = (b.xFt - a.xFt) / (b.t - a.t || dt);
      s.vy = (b.yFt - a.yFt) / (b.t - a.t || dt);
    });
    samples.forEach((s, k) => {
      const [a, b] = around(k, span);
      const ha = Math.atan2(a.vy - W.y, a.vx - W.x), hb = Math.atan2(b.vy - W.y, b.vx - W.x);
      const air = Math.hypot(s.vx - W.x, s.vy - W.y);
      s.bankDeg = clamp(bankDegFromTurnRate(air, wrapPi(hb - ha) / (b.t - a.t || dt)), -MAX_BANK_DEG, MAX_BANK_DEG);
    });
    samples.forEach((s, k) => {
      const a = samples[Math.max(0, k - 1)], b = samples[Math.min(n, k + 1)];
      s.rollRateDps = (b.bankDeg - a.bankDeg) / (b.t - a.t || dt);
      const u = (s.t - A.t) / T;
      const half = GAP_FILL.zone.minFt + (Math.hypot(dB.along - dA.along, dB.left - dA.left) / 2) * 4 * u * (1 - u);
      s.leftFt = half;
      s.rightFt = half;
      s.upFt = Math.max(GAP_FILL.zone.minVertFt, GAP_FILL.zone.minVertFt + (Math.abs(dB.up - dA.up) / 2) * 4 * u * (1 - u));
    });
    const done = finishSamples(samples, W);
    if (done.stall) continue;
    widenForChecks(samples, checks);
    return { method: 'formation', refSlot: ref.slot, samples, maxG: done.maxG, speedChangeKt: 0, windUsed: Boolean(W.x || W.y) };
  }
  return null;
}

/**
 * Fills one gap group of a track. Returns { fill } or { reason }.
 * wind: { x, y } ft/s (the way the air moves) at the gap, or null.
 */
function fillOne(flight, slot, track, group, windFor) {
  const f = track.fixes;
  const A = f[group.iA], B = f[group.iB];
  const endA = endState(f, group.iA, -1);
  const endB = endState(f, group.iB, 1);
  const T = B.t - A.t;
  // On the ground, or a landing or take-off inside the gap: from the ends' speeds (or the fixes' own when an end has too few).
  const speedOf = (end, i, dir) => end?.gsKt ?? (f[i + dir] ? (Math.hypot(f[i + dir].xFt - f[i].xFt, f[i + dir].yFt - f[i].yFt) / Math.max(Math.abs(f[i + dir].t - f[i].t), MIN_SPEED_TIME_S)) * FTPS_TO_KT : 0);
  const kA = speedOf(endA, group.iA, -1), kB = speedOf(endB, group.iB, 1);
  if (kA < GAP_FILL.groundKt && kB < GAP_FILL.groundKt) return { fill: groundFill(A, B) };
  const airA = kA >= GAP_FILL.airborneKt, airB = kB >= GAP_FILL.airborneKt;
  if (airA !== airB) return { reason: 'ground-change' };
  if (!airA) return { reason: 'slow' };
  const wind = windFor(A.t + T / 2, (A.altFt + B.altFt) / 2);
  const pinned = formationFill(flight, slot, track, group.iA, group.iB, wind, group.checks);
  if (pinned) return { fill: pinned };
  if (T > GAP_FILL.maxSingleS) return { reason: 'too-long' };
  if (!endA || !endB) return { reason: 'few-fixes' };
  if (endA.gsKt > GAP_FILL.maxBelievedGsKt || endB.gsKt > GAP_FILL.maxBelievedGsKt) return { reason: 'no-join' };
  const job = aloneJob(endA, endB, wind);
  // No path at the fastest speed allowed reaches B: no join, without searching.
  const vMax = Math.max(job.vA, job.vB) + GAP_FILL.maxSpeedChangeKt * KT_TO_FTPS;
  if (Math.hypot(job.bx, job.by) > vMax * T) return { reason: 'no-join' };
  const solved = solveAlone(job);
  if (solved.reason) return { reason: solved.reason };
  const fill = aloneFill(job, endA, endB, solved, group.checks);
  if (fill.reason) return { reason: fill.reason };
  return { fill };
}

/**
 * Fills every gap of every track in a flight (buildFlight's). windFtps(t, altFt): the model wind at a time and height
 * as { x, y } ft/s, the way the air moves (core windVectorFtps), or null for none; without it every gap is solved over
 * the ground. Returns:
 *   fills: { slot: [fill] }, each { slot, fromT, toT, method ('turn' | 'turns' | 'formation' | 'ground'), refSlot?,
 *     samples: [{ t, xFt, yFt, altFt, hdg (track), noseHdg (through the air), bankDeg (left +), rollRateDps, gsKt,
 *     tasKt, kias, g, climbFtps, climbDeg, leftFt, rightFt, upFt, estimated: true }], maxG, over7, speedChangeKt,
 *     windUsed };
 *   notFilled: [{ slot, fromT, toT, reason, words }];
 *   counts: { gaps, filled, formation, ground, notFilled }.
 */
export function fillGaps(flight, options = {}) {
  const run = fillGapsInSteps(flight, options);
  let step = run.next();
  while (!step.done) step = run.next();
  return step.value;
}

/**
 * fillGaps one gap at a time: a generator that yields after each gap (a long gap can take a few tenths of a second),
 * so a page can spread the work over several frames. Its return value is fillGaps's.
 */
export function* fillGapsInSteps(flight, { windFtps = null } = {}) {
  const fills = {};
  const notFilled = [];
  const counts = { gaps: 0, filled: 0, formation: 0, ground: 0, notFilled: 0 };
  if (!flight) return { fills, notFilled, counts };
  const windFor = (t, altFt) => {
    if (!windFtps) return null;
    try {
      const w = windFtps(t, altFt);
      return w && Number.isFinite(w.x) && Number.isFinite(w.y) ? w : null;
    } catch {
      return null;
    }
  };
  for (const track of Object.values(flight.tracks).sort((a, b) => a.slot - b.slot)) {
    fills[track.slot] = [];
    for (const group of gapGroups(track.fixes)) {
      counts.gaps++;
      const fromT = track.fixes[group.iA].t, toT = track.fixes[group.iB].t;
      let out;
      try {
        out = fillOne(flight, track.slot, track, group, windFor);
      } catch {
        out = { reason: 'error' };
      }
      if (out.fill) {
        const fill = { slot: track.slot, fromT, toT, ...out.fill, over7: out.fill.maxG > T6A_LIMITS.maxG };
        fills[track.slot].push(fill);
        if (fill.method === 'ground') counts.ground++;
        else if (fill.method === 'formation') counts.formation++;
        else counts.filled++;
      } else {
        notFilled.push({ slot: track.slot, fromT, toT, reason: out.reason, words: NOT_FILLED_WORDS[out.reason] ?? NOT_FILLED_WORDS.error });
        counts.notFilled++;
      }
      yield counts.gaps;
    }
  }
  return { fills, notFilled, counts };
}

/** The fill of one ship's list that covers time t (strictly inside its gap), or null. */
export function fillAt(shipFills, t) {
  if (!shipFills) return null;
  for (const f of shipFills) if (t > f.fromT && t < f.toT) return f;
  return null;
}

/** A fill at time t (inside it), its samples joined in a straight line between the quarter seconds; angles the short way. */
export function fillSampleAt(fill, t) {
  const s = fill.samples;
  const n = s.length - 1;
  const k = clamp(((t - fill.fromT) / (fill.toT - fill.fromT)) * n, 0, n);
  const i = Math.min(n - 1, Math.floor(k));
  if (n < 1) return { ...s[0], method: fill.method };
  const u = k - i;
  const a = s[i], b = s[i + 1];
  const out = { method: fill.method, refSlot: fill.refSlot, estimated: true, t };
  for (const key of ['xFt', 'yFt', 'altFt', 'bankDeg', 'rollRateDps', 'gsKt', 'tasKt', 'kias', 'g', 'climbFtps', 'climbDeg', 'leftFt', 'rightFt', 'upFt', 'vx', 'vy']) {
    out[key] = a[key] + (b[key] - a[key]) * u;
  }
  out.hdg = a.hdg + wrapPi(b.hdg - a.hdg) * u;
  out.noseHdg = a.noseHdg + wrapPi(b.noseHdg - a.noseHdg) * u;
  return out;
}
