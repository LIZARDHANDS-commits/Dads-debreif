// #2's lag roll to fighting wing (spec section 10.8, TS-71; Patrick 5 Oct 08:54Z and 08:58Z): from fighting wing, with Lead
// straight and level, #2 pulls up, rolls toward Lead, passes over Lead's six inverted, canopy to canopy, and comes down into
// the cone on Lead's other side, power, pitch and bank as required. The SMM and EFIG do not name the lag roll; the nearest
// pages are SMM 12.29 para 69 (the cone, using the vertical), SMM 12.30-12.31 para 74 (lag pursuit) and SMM 14.8 paras
// 18-19, Fig 14.1, Table 14.1 (the barrel roll). Every number is in tuning.js LAG_ROLL with its source or "estimate".
//
// How it is planned (the first version, Lead straight and level only). Like the barrel roll's nose path (fluid-lead.js),
// it is #2's own 3D manoeuvre worked out at the press and played as a poseTrack segment (transitions.js flyStep). Here the
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
import { STEP_SEC } from './flight.js';
import { classify } from './judge.js';
import { relativeTo } from './manoeuvres.js';
import { pairSlot } from './slots.js';
import { LAG_ROLL } from './tuning.js';
import { add3, scale3, perp3, len3, unit3, dot3, liftOf, poseOf3d, rollRateDps } from './attitude.js';

const DEG = Math.PI / 180;
const Z = Object.freeze({ x: 0, y: 0, z: 1 });

/** The key formation.js uses for the lag roll in its change machinery. */
export const LAG_ROLL_KEY = 'lagRoll';

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
    const left = F((P.L0 + P.L1) / 2, (P.L0 - P.L1) / 2, 0);
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
 * Measures one candidate roll on a coarse step: null when it breaks a check (G past gCap or availableG, under LAG_ROLL.minG,
 * not inverted over the top, inside the bubble, the top range or slowest speed outside the design's band), else its numbers.
 */
function measure(P, lead0, vL, heightFt, gCap) {
  const dt = LAG_ROLL.searchStepSec;
  let maxG = 0;
  let minG = Infinity;
  let minKias = Infinity;
  let maxClimbDeg = -90;
  let minRange = Infinity;
  for (let t = 0; t <= P.T + 1e-9; t += dt) {
    const s = groundAt(t, P, lead0, vL);
    const tas = len3(s.vel);
    const nose = scale3(s.vel, 1 / tas);
    const g = gOf(s.acc, nose);
    const kias = tasToIasKt(tas * FTPS_TO_KT, heightFt + s.pos.z);
    if (g > gCap + 0.05 || g > availableG(kias, true) || g < LAG_ROLL.minG) return null;
    maxG = Math.max(maxG, g);
    minG = Math.min(minG, g);
    minKias = Math.min(minKias, kias);
    maxClimbDeg = Math.max(maxClimbDeg, Math.atan2(s.vel.z, Math.hypot(s.vel.x, s.vel.y)) / DEG);
    minRange = Math.min(minRange, Math.hypot(s.rel.fwd, s.rel.left, s.rel.up));
  }
  const top = groundAt(P.T / 2, P, lead0, vL);
  const liftUpZ = top.acc.z + G_FTPS2; // canopy to canopy: the lift points down, toward Lead, over his six
  const topRange = Math.hypot(top.rel.fwd, top.rel.left, top.rel.up);
  if (liftUpZ >= 0 || minRange < LAG_ROLL.bubbleFt) return null;
  if (topRange < LAG_ROLL.topRangeFt[0] || topRange > LAG_ROLL.topRangeFt[1]) return null;
  if (minKias < LAG_ROLL.topKiasBand[0] || minKias > LAG_ROLL.topKiasBand[1]) return null;
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
  const cost = Math.abs(m.minKias - LAG_ROLL.topKias) + noseMiss * (noseMiss > LAG_ROLL.noseUpSlopDeg ? 3 : 1) + 10 * Math.abs(pullG - m.maxG) + (P.fs - P.fE) / 100 + P.T / 4;
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
  if (where.key !== 'fw') return { ok: false, reason: 'The lag roll starts from fighting wing; change to fighting wing first.' };
  if (Math.abs(lead.bankDeg) > 1 || Math.abs(lead.climbFtps ?? 0) > 2) {
    return { ok: false, reason: 'For now the lag roll flies only with Lead straight and level.' };
  }
  const blockFt = options.blockFt ?? 8000;
  const s = where.side; // #2's side now (+1 left); he lands on -s
  const rel = relativeTo(lead, wing);
  const slot = pairSlot('fw', -s);
  const vL = lead.tasFtps;
  const lead0 = { x: lead.xFt, y: lead.yFt, h: lead.headingRad };
  const heightFt = blockFt + lead.altAboveFt;
  const base = { f0: rel.fwd, L0: rel.left, z0: wing.altAboveFt - lead.altAboveFt, fs: slot.fwd, L1: slot.left, zs: slot.alt };
  const closeFtps = (LAG_ROLL.closeOvertakeKias / FTPS_TO_KT) * (vL / Math.max(1, lead.kias / FTPS_TO_KT)); // the overtake as true airspeed

  // The search: pull G x nose-up (the design's set), and for each the roll's length, height and fall-back (LAG_ROLL).
  let best = null;
  const gCap = Math.max(...LAG_ROLL.pullG);
  for (let T = LAG_ROLL.rollSec[0]; T <= LAG_ROLL.rollSec[1]; T += 1) {
    for (let H = LAG_ROLL.climbFt[0]; H <= LAG_ROLL.climbFt[1]; H += 100) {
      for (let fb = LAG_ROLL.fallBackFt[0]; fb <= LAG_ROLL.fallBackFt[1]; fb += 100) {
        const P = { ...base, T, H, fE: base.fs - fb, T2: fb > 0 ? (2 * fb) / closeFtps : 0 };
        if (!landsInCone(P)) break; // he lands in the cone (Patrick 08:54Z): a longer fall-back only lands further out
        const m = measure(P, lead0, vL, heightFt, gCap);
        if (!m) continue;
        for (const pullG of LAG_ROLL.pullG) {
          for (const noseUpDeg of LAG_ROLL.noseUpDeg) {
            const sc = score(m, P, pullG, noseUpDeg);
            if (sc && (!best || sc.cost < best.sc.cost)) best = { P, sc };
          }
        }
      }
    }
  }
  if (!best) {
    return { ok: false, reason: 'No lag roll from here: no path over Lead\'s six keeps the G inside the limits and stays outside 500 ft.' };
  }

  // The flown path, one pose a step (attitude.js), and the checks again on it at the sim's own step.
  const { P } = best;
  const total = P.T + P.T2;
  const n = Math.max(1, Math.round(total / STEP_SEC));
  const poses = [];
  let prevUp = { x: 0, y: 0, z: 1 };
  let prevNose = null;
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
    const lift = liftOf(st.acc, nose, prevUp);
    const kias = tasToIasKt(tas * FTPS_TO_KT, heightFt + st.pos.z);
    const roll = prevNose ? rollRateDps(prevNose, prevUp, nose, lift.up, total / n) : 0;
    const last = i === n;
    const pose = poseOf3d({ x: st.pos.x, y: st.pos.y, altAbove: lead.altAboveFt + st.pos.z, vel: st.vel, up: lift.up, kias, g: lift.g, rollDps: roll });
    if (last) Object.assign(pose, { bank: 0, roll: 0, g: 1, climb: 0, h: lead.headingRad, kias: lead.kias, tas: vL });
    poses.push(pose);
    if (lift.g > availableG(kias, Math.abs(roll) > LAG_ROLL.rollingAboveDps)) overAvailable = true;
    // Lead in the top half of #2's canopy (the design's flag): Lead's side of #2's wing plane.
    const toLead = unit3(add3(st.leadPos, scale3(st.pos, -1)));
    if (t <= P.T && dot3(toLead, lift.up) < 0) leadOutOfTopHalfSec += total / n;
    maxBankDeg = Math.max(maxBankDeg, Math.abs(pose.bank));
    maxG = Math.max(maxG, lift.g);
    maxRollDps = Math.max(maxRollDps, Math.abs(roll));
    prevUp = lift.up;
    prevNose = nose;
  }
  if (overAvailable) {
    return { ok: false, reason: 'No lag roll from here: the path would need more G than the aircraft has at that speed.' };
  }

  const sideWord = -s > 0 ? 'left' : 'right';
  const sc = best.sc;
  const flag = leadOutOfTopHalfSec > 0 ? ` Lead leaves the top half of #2's canopy for about ${leadOutOfTopHalfSec.toFixed(1)} s.` : '';
  const note = `Lag roll to fighting wing ${sideWord}: #2 pulls up to ${sc.maxG.toFixed(1)} G, nose about ${Math.round(sc.maxClimbDeg)}° up, `
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
    flying: `Fighting wing ${s > 0 ? 'left' : 'right'} to fighting wing ${sideWord} (lag roll)`,
    from: 'fw',
    fromSide: s,
    to: 'fw',
    side: -s,
    rejoinKind: 'none',
    maxBankDeg,
    endSec: t0 + total,
    rejoining: false,
    lagRoll: {
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
