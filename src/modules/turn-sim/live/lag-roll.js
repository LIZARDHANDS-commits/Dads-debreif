// #2's lag roll to fighting wing (spec section 10.8, TS-71; Patrick 5 Oct 08:54Z and 08:58Z): from fighting wing (or from
// echelon, TS-78), with Lead
// straight and level, #2 pulls up, rolls toward Lead, passes over Lead's six inverted, canopy to canopy, and comes down into
// the cone on Lead's other side, power, pitch and bank as required. The SMM and EFIG do not name the lag roll; the nearest
// pages are SMM 12.29 para 69 (the cone, using the vertical), SMM 12.30-12.31 para 74 (lag pursuit) and SMM 14.8 paras
// 18-19, Fig 14.1, Table 14.1 (the barrel roll). Every number is in tuning.js LAG_ROLL with its source or "estimate".
//
// How it is planned (the first version, Lead straight and level only). Like the barrel roll's nose path (fluid-lead.js),
// it is #2's own 3D manoeuvre worked out at the press and played as a poseTrack segment (replay.js flyStep). Here the
// path is drawn in Lead's frame (Lead flies straight at constant speed, so that frame does not accelerate): #2's place off
// Lead goes round half a turn from his fighting wing place to the fighting wing slot on the other side, through a point
// above and behind Lead's six, then he closes back up to the slot at a small overtake. The speed is what that path needs
// (no energy model): it falls over the top and comes back to Lead's. The lift and the G follow from the path's
// acceleration (attitude.js liftOf, standard aerodynamics), and the pose (bank through inverted, pitch) from attitude.js
// poseOf3d. A small search over the roll's length, height and fall-back picks the path whose pull, nose-up and speed over
// the top come nearest the design's (LAG_ROLL), with G inside core availableG at every step and never inside 500 ft of
// Lead; a plan that can't is refused. Lead leaving the top half of #2's canopy is flagged on the card, never refused.
//
// Conventions as the rest of the live code: x east, y north, z up, feet and seconds; heading in math radians (0 east,
// counter-clockwise); fwd and left in Lead's frame (left positive); bank left wing down positive.
import { availableG, tasToIasKt } from '../../../core/t6-performance.js';
import { G_FTPS2, FTPS_TO_KT } from '../../../core/units.js';
import { STEP_SEC, rollLimitAt } from './flight.js';
import { classify } from './judge.js';
import { relativeTo, DEG } from './manoeuvres.js';
import { pairSlot, FW_BAND } from './slots.js';
import { LAG_ROLL, FW_ENERGY } from './tuning.js';
import { add3, scale3, perp3, len3, unit3, dot3, cross3, liftOf, poseOf3d } from './attitude.js';
import { easeRoll } from '../../../core/flight-math.js';

const Z = Object.freeze({ x: 0, y: 0, z: 1 });

/** The key formation.js uses for the lag roll in its change machinery. */
export const LAG_ROLL_KEY = 'lagRoll';
/** Why a lag roll is refused when only the roll is too quick (TS-85). */
const ROLL_REFUSAL = 'No lag roll from here: every path over Lead\'s six needs a faster roll than the T-6A has at that speed (an estimate).';

/** A smooth 0-to-1 step with no speed or acceleration at either end: s(u), s'(u), s''(u) (u from 0 to 1). */
function smooth(u) {
  const w = 2 * Math.PI * u;
  return { s: u - Math.sin(w) / (2 * Math.PI), d: 1 - Math.cos(w), dd: 2 * Math.PI * Math.sin(w) };
}

/**
 * #2's place off Lead, its rate and its acceleration at time t into the plan, in Lead's frame { fwd, left, up }.
 * P: { T (the roll, s), T2 (the close-up, s), f0, L0, z0 (start), fE (fwd at the roll's end), fs, L1, zs (the slot on the
 * other side), H (how far above the straight line he goes) }.
 */
function relAt(t, P) {
  // The set-up (Patrick 6 Oct 22:33Z, TS-143): first forward and high in the cone on his own side, smoothly, so the roll
  // starts from there and ends in position (or as near as it can).
  if (P.T0 > 0) {
    if (t < P.T0) {
      const m = smooth(Math.max(0, t / P.T0));
      const k = (from, to) => ({ p: from + (to - from) * m.s, v: ((to - from) * m.d) / P.T0, a: ((to - from) * m.dd) / (P.T0 * P.T0) });
      const fwd = k(P.s0.fwd, P.f0);
      const left = k(P.s0.left, P.L0);
      const up = k(P.s0.up, P.z0);
      return { p: { fwd: fwd.p, left: left.p, up: up.p }, v: { fwd: fwd.v, left: left.v, up: up.v }, a: { fwd: fwd.a, left: left.a, up: up.a } };
    }
    t -= P.T0;
  }
  if (t <= P.T) {
    const m = smooth(Math.max(0, t / P.T));
    const th = Math.PI * m.s;
    const w = (Math.PI * m.d) / P.T; // dθ/dt
    const a = (Math.PI * m.dd) / (P.T * P.T); // d²θ/dt²
    const c = Math.cos(th);
    const sn = Math.sin(th);
    // F(θ) = mid + half·cos θ + bump·sin θ, its rate and acceleration through θ(t).
    const F = (mid, half, bump) => ({
      p: mid + half * c + bump * sn,
      v: (-half * sn + bump * c) * w,
      a: (-half * c - bump * sn) * w * w + (-half * sn + bump * c) * a,
    });
    const fwd = F((P.f0 + P.fE) / 2, (P.f0 - P.fE) / 2, 0);
    // The top passes over Lead's six (left 0 at θ = π/2): from fighting wing the ends are mirror images, so the bump is 0;
    // from echelon (TS-78) the start is close in, so the bump carries the path across his six.
    const left = F((P.L0 + P.L1) / 2, (P.L0 - P.L1) / 2, -(P.L0 + P.L1) / 2);
    const up = F((P.z0 + P.zs) / 2, (P.z0 - P.zs) / 2, P.H);
    return { p: { fwd: fwd.p, left: left.p, up: up.p }, v: { fwd: fwd.v, left: left.v, up: up.v }, a: { fwd: fwd.a, left: left.a, up: up.a } };
  }
  const m = smooth(P.T2 > 0 ? Math.min(1, (t - P.T) / P.T2) : 1);
  const d = P.fs - P.fE;
  return {
    p: { fwd: P.fE + d * m.s, left: P.L1, up: P.zs },
    v: { fwd: P.T2 > 0 ? (d * m.d) / P.T2 : 0, left: 0, up: 0 },
    a: { fwd: P.T2 > 0 ? (d * m.dd) / (P.T2 * P.T2) : 0, left: 0, up: 0 },
  };
}

/** The ground-frame state of #2 at t: { pos (x, y, up above Lead's height), vel, acc, rel } with Lead flying straight at vL. */
function groundAt(t, P, lead0, vL) {
  const r = relAt(t, P);
  const f = { x: Math.cos(lead0.h), y: Math.sin(lead0.h), z: 0 };
  const l = { x: -Math.sin(lead0.h), y: Math.cos(lead0.h), z: 0 };
  const along = vL * t + r.p.fwd;
  const pos = { x: lead0.x + along * f.x + r.p.left * l.x, y: lead0.y + along * f.y + r.p.left * l.y, z: r.p.up };
  const vel = add3(add3(scale3(f, vL + r.v.fwd), scale3(l, r.v.left)), scale3(Z, r.v.up));
  const acc = add3(add3(scale3(f, r.a.fwd), scale3(l, r.a.left)), scale3(Z, r.a.up));
  return { pos, vel, acc, rel: r.p, leadPos: { x: lead0.x + vL * t * f.x, y: lead0.y + vL * t * f.y, z: 0 } };
}

/** The G of a path's acceleration (the specific force square to the path, over g; standard aerodynamics). */
function gOf(acc, nose) {
  return len3(perp3(add3(acc, scale3(Z, G_FTPS2)), nose)) / G_FTPS2;
}

/**
 * #2's wings one step on (dt): rolled toward the path's lift at no more than the T-6A's roll at this speed (flight.js
 * rollLimitAt, TS-85), the way fluid-wing.js wingPose rolls them. wings: the last step's { up, rollDps }. Returns the new
 * wings and missG, the share of the path's lift (in G) the wings don't yet point: at low G over the top the lift swings
 * faster than any roll, and there so little is missing that the path flown is the same.
 */
function wingsToward(wings, lift, nose, tas, dt) {
  const base = unit3(perp3(wings.up, nose));
  const left = cross3(base, nose);
  const want = Math.atan2(dot3(lift.up, left), dot3(lift.up, base)) / DEG;
  const r = easeRoll(0, wings.rollDps, want, dt, rollLimitAt(tas));
  const a = r.bankDeg * DEG;
  const up = unit3(add3(scale3(base, Math.cos(a)), scale3(left, Math.sin(a))));
  const c = dot3(lift.up, up);
  return { up, rollDps: r.rollRateDps, missG: lift.g * (c > 0 ? Math.sqrt(Math.max(0, 1 - c * c)) : 1) };
}

/**
 * Measures one candidate roll on a coarse step: null when it breaks a check (G past gCap or availableG, under LAG_ROLL.minG,
 * not inverted over the top, inside the bubble, the top range or slowest speed outside the design's band), 'roll' when it
 * passes those but asks a faster roll than the T-6A has (more than LAG_ROLL.rollMissG of lift the wings can't point in
 * time, wingsToward; TS-85: a longer roll is a slower one), else its numbers.
 */
function measure(P, lead0, vL, heightFt, gCap, close = false) {
  const dt = LAG_ROLL.searchStepSec;
  let wings = { up: { x: 0, y: 0, z: 1 }, rollDps: 0, missG: 0 }; // wings level
  let maxMissG = 0;
  let maxG = 0;
  let minG = Infinity;
  let minKias = Infinity;
  let maxClimbDeg = -90;
  let minRange = Infinity;
  let out = !close; // from echelon the 500 ft bubble counts once #2 has left his close place (TS-78)
  const T0 = P.T0 ?? 0; // the roll itself is measured; the set-up before it stays in the cone
  for (let t = 0; t <= P.T + 1e-9; t += dt) {
    const s = groundAt(T0 + t, P, lead0, vL);
    const tas = len3(s.vel);
    const nose = scale3(s.vel, 1 / tas);
    const g = gOf(s.acc, nose);
    const kias = tasToIasKt(tas * FTPS_TO_KT, heightFt + s.pos.z);
    if (g > gCap + 0.05 || g > availableG(kias, true) || g < LAG_ROLL.minG) return null;
    wings = wingsToward(wings, liftOf(s.acc, nose, wings.up), nose, tas, dt);
    maxMissG = Math.max(maxMissG, wings.missG);
    maxG = Math.max(maxG, g);
    minG = Math.min(minG, g);
    minKias = Math.min(minKias, kias);
    maxClimbDeg = Math.max(maxClimbDeg, Math.atan2(s.vel.z, Math.hypot(s.vel.x, s.vel.y)) / DEG);
    const range = Math.hypot(s.rel.fwd, s.rel.left, s.rel.up);
    if (range >= LAG_ROLL.bubbleFt) out = true;
    if (out) minRange = Math.min(minRange, range);
  }
  const top = groundAt(T0 + P.T / 2, P, lead0, vL);
  const liftUpZ = top.acc.z + G_FTPS2; // canopy to canopy: the lift points down, toward Lead, over his six
  const topRange = Math.hypot(top.rel.fwd, top.rel.left, top.rel.up);
  if (liftUpZ >= 0 || minRange < LAG_ROLL.bubbleFt) return null;
  const topBand = close ? LAG_ROLL.closeTopRangeFt : LAG_ROLL.topRangeFt;
  if (topRange < topBand[0] || topRange > topBand[1]) return null;
  if (minKias < LAG_ROLL.topKiasBand[0] || minKias > LAG_ROLL.topKiasBand[1]) return null;
  if (maxMissG > LAG_ROLL.rollMissG) return 'roll';
  return { maxG, minG, minKias, maxClimbDeg, topRange, minRange };
}

/**
 * The roll ends in the cone on the other side (Patrick 08:54Z, "lands in the cone"; 08:58Z, the whole cone): the sim's
 * fighting wing region (LAG_ROLL.coneRangeFt, coneSweepDeg, judge.js's classifier), which reaches past SMM 12.29 para 69's
 * 500-1,000 ft band; he then closes to the slot.
 */
function landsInCone(P) {
  const range = Math.hypot(P.fE, P.L1);
  const sweep = Math.atan2(-P.fE, Math.abs(P.L1)) / DEG;
  return range >= LAG_ROLL.coneRangeFt[0] && range <= LAG_ROLL.coneRangeFt[1] && sweep >= LAG_ROLL.coneSweepDeg[0] && sweep <= LAG_ROLL.coneSweepDeg[1];
}

/** A measured roll scored against one of the design's pulls and nose-ups: null past the pull, else the cost (smaller is nearer). */
function score(m, P, pullG, noseUpDeg) {
  if (m.maxG > pullG + 0.05) return null;
  const noseMiss = Math.abs(m.maxClimbDeg - noseUpDeg);
  const cost = Math.abs(m.minKias - LAG_ROLL.topKias) + noseMiss * (noseMiss > LAG_ROLL.noseUpSlopDeg ? 3 : 1) + 10 * Math.abs(pullG - m.maxG) + (P.fs - P.fE) / LAG_ROLL.fallBackCostFt + P.T / 4;
  return { ...m, cost, pullG, noseUpDeg };
}

/**
 * Plans #2's lag roll for a pair [lead, wing] as they are now. options: { blockFt, spacingFt }.
 * Returns, shaped like transitions.js planGoTo: { ok, reason?, plans, note, label, flying, from, fromSide, to: 'fw', side,
 * rejoinKind, maxBankDeg, endSec, rejoining, lagRoll: { the plan's numbers and flags } }. When ok is false nothing should
 * be flown and `reason` says why in one line.
 */
export function planLagRoll(aircraft, options = {}, t0 = 0) {
  if (aircraft.length !== 2) return { ok: false, reason: 'The lag roll is 2-ship only for now.' };
  const [lead, wing] = aircraft;
  const where = classify(aircraft);
  // From fighting wing (TS-71) or from echelon (TS-78; Patrick 20:3xZ "lag roll flops you into the cone on the other side",
  // 21:10Z "can just be echelon").
  if (where.key !== 'fw' && where.key !== 'echelon') return { ok: false, reason: 'The lag roll starts from fighting wing or echelon.' };
  const close = where.key === 'echelon';
  if (Math.abs(lead.bankDeg) > 1 || Math.abs(lead.climbFtps ?? 0) > 2) {
    return { ok: false, reason: 'For now the lag roll flies only with Lead straight and level.' };
  }
  const blockFt = options.blockFt ?? 8000;
  const rel = relativeTo(lead, wing);
  const s = where.side || Math.sign(rel.left) || (options.lastSide ?? -1); // #2's side now (+1 left); he lands on -s
  const slot = pairSlot('fw', -s);
  const vL = lead.tasFtps;
  const lead0 = { x: lead.xFt, y: lead.yFt, h: lead.headingRad };
  const heightFt = blockFt + lead.altAboveFt;
  const closeFtps = (LAG_ROLL.closeOvertakeKias / FTPS_TO_KT) * (vL / Math.max(1, lead.kias / FTPS_TO_KT)); // the overtake as true airspeed
  // From fighting wing he first moves to the front and top of the cone on his own side (TS-143), the cone's most forward
  // corner; from echelon he rolls from where he is.
  const s0 = { fwd: rel.fwd, left: rel.left, up: wing.altAboveFt - lead.altAboveFt };
  let start = s0;
  let T0 = 0;
  if (!close) {
    const range = LAG_ROLL.setUpRangeFt; // the cone's front, near its inside edge: as far forward as the cone goes, outside the bubble
    const sweep = (FW_BAND.sweepDeg[0] + LAG_ROLL.setUpSweepInDeg) * DEG;
    start = { fwd: -range * Math.sin(sweep), left: s * range * Math.cos(sweep), up: FW_ENERGY.coneUpFt };
    const moveFt = Math.hypot(start.fwd - s0.fwd, start.left - s0.left, start.up - s0.up);
    if (moveFt > LAG_ROLL.setUpMinFt) T0 = Math.max(LAG_ROLL.setUpMinSec, (2 * moveFt) / (closeFtps * LAG_ROLL.setUpOvertakeKias / LAG_ROLL.closeOvertakeKias)); // the smooth move's peak rate is twice its mean
    else start = s0;
  }
  const base = { T0, s0, f0: start.fwd, L0: start.left, z0: start.up, fs: slot.fwd, L1: slot.left, zs: slot.alt };

  // The search: pull G x nose-up (the design's set), and for each the roll's length, height and fall-back (LAG_ROLL).
  let best = null;
  let rollTooFast = false; // a path passed every other check but asked a faster roll than the T-6A has
  const gCap = Math.max(...LAG_ROLL.pullG);
  for (let T = LAG_ROLL.rollSec[0]; T <= LAG_ROLL.rollSec[1]; T += 1) {
    for (let H = LAG_ROLL.climbFt[0]; H <= LAG_ROLL.climbFt[1]; H += 100) {
      for (let fb = LAG_ROLL.fallBackFt[0]; fb <= LAG_ROLL.fallBackFt[1]; fb += 100) {
        const P = { ...base, T, H, fE: base.fs - fb, T2: fb > 0 ? (2 * fb) / closeFtps : 0 };
        if (!landsInCone(P)) break; // he lands in the cone (Patrick 08:54Z): a longer fall-back only lands further out
        const m = measure(P, lead0, vL, heightFt, gCap, close);
        if (m === 'roll') rollTooFast = true;
        if (!m || m === 'roll') continue;
        for (const pullG of LAG_ROLL.pullG) {
          for (const noseUpDeg of LAG_ROLL.noseUpDeg) {
            const sc = score(m, P, pullG, noseUpDeg);
            if (sc && (!best || sc.cost < best.sc.cost)) best = { P, sc };
          }
        }
      }
    }
  }
  if (!best && rollTooFast) return { ok: false, reason: ROLL_REFUSAL };
  if (!best) {
    return { ok: false, reason: 'No lag roll from here: no path over Lead\'s six keeps the G inside the limits and stays outside 500 ft.' };
  }

  // The flown path, one pose a step (attitude.js), and the checks again on it at the sim's own step.
  const { P } = best;
  const total = P.T0 + P.T + P.T2;
  const n = Math.max(1, Math.round(total / STEP_SEC));
  const poses = [];
  let wings = { up: { x: 0, y: 0, z: 1 }, rollDps: 0, missG: 0 }; // wings level
  let maxMissG = 0;
  let maxBankDeg = 0;
  let maxG = 0;
  let maxRollDps = 0;
  let overAvailable = false;
  let leadOutOfTopHalfSec = 0;
  for (let i = 1; i <= n; i++) {
    const t = (i * total) / n;
    const st = groundAt(t, P, lead0, vL);
    const tas = len3(st.vel);
    const nose = scale3(st.vel, 1 / tas);
    const lift = liftOf(st.acc, nose, wings.up);
    const kias = tasToIasKt(tas * FTPS_TO_KT, heightFt + st.pos.z);
    wings = wingsToward(wings, lift, nose, tas, total / n);
    maxMissG = Math.max(maxMissG, wings.missG);
    const roll = wings.rollDps;
    const last = i === n;
    const pose = poseOf3d({ x: st.pos.x, y: st.pos.y, altAbove: lead.altAboveFt + st.pos.z, vel: st.vel, up: wings.up, kias, g: lift.g, rollDps: roll });
    if (last) Object.assign(pose, { bank: 0, roll: 0, g: 1, climb: 0, h: lead.headingRad, kias: lead.kias, tas: vL });
    poses.push(pose);
    if (lift.g > availableG(kias, Math.abs(roll) > LAG_ROLL.rollingAboveDps)) overAvailable = true;
    // Lead in the top half of #2's canopy (the design's flag): Lead's side of #2's wing plane.
    const toLead = unit3(add3(st.leadPos, scale3(st.pos, -1)));
    if (t >= P.T0 && t <= P.T0 + P.T && dot3(toLead, wings.up) < 0) leadOutOfTopHalfSec += total / n;
    maxBankDeg = Math.max(maxBankDeg, Math.abs(pose.bank));
    maxG = Math.max(maxG, lift.g);
    maxRollDps = Math.max(maxRollDps, Math.abs(roll));
  }
  if (overAvailable) {
    return { ok: false, reason: 'No lag roll from here: the path would need more G than the aircraft has at that speed.' };
  }
  if (maxMissG > LAG_ROLL.rollMissG * 1.25) return { ok: false, reason: ROLL_REFUSAL };

  const sideWord = -s > 0 ? 'left' : 'right';
  const sc = best.sc;
  const flag = leadOutOfTopHalfSec > 0 ? ` Lead leaves the top half of #2's canopy for about ${leadOutOfTopHalfSec.toFixed(1)} s.` : '';
  const fromWords = close ? `from echelon ${s > 0 ? 'left' : 'right'} ` : '';
  const setUpWords = P.T0 > 0 ? `moves forward and high in the cone (${Math.round(P.T0)} s), then ` : '';
  const note = `Lag roll ${fromWords}to fighting wing ${sideWord}: #2 ${setUpWords}pulls up to ${sc.maxG.toFixed(1)} G, nose about ${Math.round(sc.maxClimbDeg)}° up, `
    + `rolls toward Lead and passes over his six inverted at about ${Math.round(sc.topRange).toLocaleString('en-CA')} ft, `
    + `slowest ${Math.round(sc.minKias)} KIAS, then down into the cone on the ${sideWord} and closes at ${LAG_ROLL.closeOvertakeKias} kt to the slot. `
    + `The SMM does not name the lag roll (nearest: SMM 12.29 para 69, 12.30-12.31 para 74, 14.8 paras 18-19); the numbers are estimates.${flag}`;
  return {
    ok: true,
    plans: {
      [lead.id]: { segments: [] },
      [wing.id]: { segments: [{ kind: 'poseTrack', poses }] },
    },
    note,
    label: `Lag roll to fighting wing ${sideWord}`,
    flying: `${close ? 'Echelon' : 'Fighting wing'} ${s > 0 ? 'left' : 'right'} to fighting wing ${sideWord} (lag roll)`,
    from: where.key,
    fromSide: s,
    to: 'fw',
    side: -s,
    rejoinKind: 'none',
    maxBankDeg,
    endSec: t0 + total,
    rejoining: false,
    lagRoll: {
      setUpSec: P.T0,
      rollSec: P.T,
      closeSec: P.T2,
      climbFt: P.H,
      fallBackFt: P.fs - P.fE,
      pullG: sc.pullG,
      noseUpDeg: sc.noseUpDeg,
      maxG,
      minG: sc.minG,
      maxClimbDeg: sc.maxClimbDeg,
      minKias: sc.minKias,
      topRangeFt: sc.topRange,
      minRangeFt: sc.minRange,
      maxRollDps,
      leadOutOfTopHalfSec,
    },
  };
}
