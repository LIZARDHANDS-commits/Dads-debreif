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
import { speedUpLimitKtps, climbKtps } from './full-power.js';
import { slowKtps } from './slow-down.js';
import { leadStateOf, stepLead, nosePath, followNose, noseAt } from './fluid-lead.js';

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
  const d = (P.fc ?? P.fs) - P.fE; // closing to fc, the cone's band, not all the way to the slot (TS-144)
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
  let lastKias = null;
  for (let t = 0; t <= P.T + 1e-9; t += dt) {
    const s = groundAt(T0 + t, P, lead0, vL);
    const tas = len3(s.vel);
    const nose = scale3(s.vel, 1 / tas);
    const g = gOf(s.acc, nose);
    const kias = tasToIasKt(tas * FTPS_TO_KT, heightFt + s.pos.z);
    if (g > gCap + 0.05 || g > availableG(kias, true) || g < LAG_ROLL.minG) return null;
    // Energy (TS-144): he is at full power throughout, so the path may never ask him to speed up faster than full power
    // gives at that speed, height, G and climb (full-power.js, standard aerodynamics). This replaces the old speed band's top.
    // ... nor slow down faster than idle and the boards with the climb's cost give (TS-146: both ways, what the T-6 can do).
    if (lastKias != null) {
      const dK = (kias - lastKias) / dt;
      if (dK > speedUpLimitKtps(kias, heightFt + s.pos.z, g, s.vel.z, tas) + LAG_ROLL.powerSlackKtps) return null;
      if (dK < -(slowKtps('idleBoards', kias, heightFt + s.pos.z, g) + climbKtps(s.vel.z, tas, kias)) - LAG_ROLL.powerSlackKtps) return null;
    }
    lastKias = kias;
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
  if (minKias < LAG_ROLL.topKiasBand[0]) return null; // the top of the band is now the energy check above (TS-144)
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
  const cost = noseMiss * (noseMiss > LAG_ROLL.noseUpSlopDeg ? 3 : 1) + 10 * Math.abs(pullG - m.maxG) + (P.fs - P.fE) / LAG_ROLL.fallBackCostFt + P.T / 4;
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
  // The roll flown on the T-6A point mass (TS-147): physical by construction. The drawn search below stays as the fallback.
  const pm = planOnPointMass({ lead, wing, s, base, lead0, vL, blockFt, close, where, t0 });
  if (pm) return pm;

  // He may land anywhere down to the cone's bottom (Patrick 6 Oct 22:40Z, TS-144): the slot's height or the bottom.
  const endUps = [slot.alt, -FW_ENERGY.coneUpFt];
  // The furthest back he may end and still be in the band on the slot's side: inside its far range and sweep, less a margin.
  const inBandFwd = Math.max(-Math.sqrt(Math.max(0, (FW_BAND.rangeFt[1] - LAG_ROLL.inBandMarginFt) ** 2 - slot.left ** 2)),
    -Math.abs(slot.left) * Math.tan((FW_BAND.sweepDeg[1] - LAG_ROLL.inBandMarginDeg) * DEG));
  // The search: pull G x nose-up (the design's set), and for each the roll's length, height and fall-back (LAG_ROLL).
  let best = null;
  let rollTooFast = false; // a path passed every other check but asked a faster roll than the T-6A has
  const gCap = Math.max(...LAG_ROLL.pullG);
  for (let T = LAG_ROLL.rollSec[0]; T <= LAG_ROLL.rollSec[1]; T += 1) {
    for (let H = LAG_ROLL.climbFt[0]; H <= LAG_ROLL.climbFt[1]; H += 100) {
      for (const zs of endUps) for (let fb = LAG_ROLL.fallBackFt[0]; fb <= LAG_ROLL.fallBackFt[1]; fb += 100) {
        const fE = base.fs - fb;
        const fc = Math.max(fE, Math.min(base.fs, inBandFwd)); // landing in the band he is in position (the whole cone; Patrick 5 Oct 08:58Z), else he closes into it
        const P = { ...base, zs, T, H, fE, fc, T2: fc > fE ? (2 * (fc - fE)) / closeFtps : 0 };
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
    + `slowest ${Math.round(sc.minKias)} KIAS, then down into the cone on the ${sideWord}${P.T2 > 0 ? ` and closes at ${LAG_ROLL.closeOvertakeKias} kt into its band` : ''}, at full power throughout. `
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

// ---- the roll on the point mass (TS-147; Patrick 6 Oct 22:53Z "Do it on the point mass model", 22:56Z "fix it") ----------
//
// The drawn path above sets #2's place and reads his speed off it, so it could lose more speed than full power would (flown
// on the point mass, the same nose path kept 10 kt more and ended 300 ft further forward). Here, as the rejoin rolls
// (rolling-rejoin.js flyRoll) and Lead's barrel roll (fluid-lead.js), the roll is a nose path followed at a set G on the
// T-6A point mass at full power: the speed, height and energy are the aircraft's own, the G held under the stick shaker
// and the roll at the T-6A's rate (stepLead). The nose circles a point off his heading toward Lead (SMM 14.8 para 19's
// barrel roll circle), up first, over Lead's six inverted, and back to Lead's heading and the horizon. Then he flies
// wings level back to Lead's speed (power back). The set-up before it (TS-143) is the drawn smooth move above.

/** #2's place off Lead (straight and level from lead0 at vL) at time t: { fwd, left, up }. */
function relToLead(lead0, vL, t, x, y, z) {
  const f = { x: Math.cos(lead0.h), y: Math.sin(lead0.h) };
  const dx = x - (lead0.x + vL * t * f.x);
  const dy = y - (lead0.y + vL * t * f.y);
  return { fwd: dx * f.x + dy * f.y, left: -dx * f.y + dy * f.x, up: z };
}

/** True when a place off Lead is inside fighting wing's band on side `side` (TS-144's margins), any height in the cone. */
function inBandOn(r, side) {
  const range = Math.hypot(r.fwd, r.left);
  const sweep = Math.atan2(-r.fwd, Math.abs(r.left)) / DEG;
  return Math.sign(r.left) === side && Math.abs(r.up) <= FW_ENERGY.coneUpFt + 25
    && range >= FW_BAND.rangeFt[0] && range <= FW_BAND.rangeFt[1] - LAG_ROLL.inBandMarginFt
    && sweep >= FW_BAND.sweepDeg[0] && sweep <= FW_BAND.sweepDeg[1] - LAG_ROLL.inBandMarginDeg;
}

/** How far a place is from the band (0 inside), ft, for choosing the nearest when none lands in it. */
function bandMissFt(r, side) {
  if (inBandOn(r, side)) return 0;
  const range = Math.hypot(r.fwd, r.left);
  const sweep = Math.atan2(-r.fwd, Math.abs(r.left)) / DEG;
  const rc = Math.max(FW_BAND.rangeFt[0], Math.min(FW_BAND.rangeFt[1] - LAG_ROLL.inBandMarginFt, range));
  const sc = Math.max(FW_BAND.sweepDeg[0], Math.min(FW_BAND.sweepDeg[1] - LAG_ROLL.inBandMarginDeg, sweep)) * DEG;
  const near = { fwd: -rc * Math.sin(sc), left: side * rc * Math.cos(sc) }; // the nearest place in the band, on his side
  return Math.hypot(r.fwd - near.fwd, r.left - near.left) + Math.max(0, Math.abs(r.up) - FW_ENERGY.coneUpFt - 25);
}

/** Flies one candidate roll from the state at the roll's start. Returns its poses and numbers, or null when a check fails. */
function flyPmRoll(c, w0, ctx) {
  const { lead0, vL, blockFt, s, tStart, leadKias, close } = ctx;
  const h0 = lead0.h;
  const off = -s * c.offDeg * DEG; // the circle's centre toward Lead (he is on side s, Lead on -s)
  const path = nosePath((u) => noseAt(h0 + off * (1 - Math.cos(2 * Math.PI * u)), c.pitchDeg * DEG * Math.sin(2 * Math.PI * u)), 1, 1200);
  const mem = { s: 0, rate: 0 };
  let st = leadStateOf(w0, blockFt);
  const tasPerKias = w0.tasFtps / w0.kias;
  const poses = [];
  let t = tStart;
  let minKias = Infinity;
  let minG = Infinity;
  let maxG = 0;
  let maxClimbDeg = -90;
  let minRange = Infinity;
  let topRange = null;
  let inverted = false;
  let out = !close;
  let side0 = Math.sign(relToLead(lead0, vL, t, st.pm.x, st.pm.y, 0).left);
  let rollSec = 0;
  const push = () => {
    const pose = poseOf3d({ x: st.pm.x, y: st.pm.y, altAbove: st.pm.z - blockFt, vel: st.vel, up: st.bodyUp, kias: st.V / tasPerKias, g: st.g, rollDps: -st.rollRate });
    pose.pwr = 1;
    poses.push(pose);
  };
  for (let n = 0; n < Math.round(LAG_ROLL.rollSec[1] / STEP_SEC); n++) {
    const r = followNose(st, path, mem, c.pullG);
    st = stepLead(st, { g: r.g, bank: r.bank });
    t += STEP_SEC;
    rollSec += STEP_SEC;
    push();
    const rel = relToLead(lead0, vL, t, st.pm.x, st.pm.y, st.pm.z - blockFt - ctx.leadAlt);
    const range = Math.hypot(rel.fwd, rel.left, rel.up);
    if (range >= LAG_ROLL.bubbleFt) out = true;
    if (out && !close && range < LAG_ROLL.bubbleFt) return null; // never inside 500 ft once outside; from echelon he may pass inside it (Patrick 6 Oct 23:12Z, TS-149)
    if (out) minRange = Math.min(minRange, range);
    if (st.g < LAG_ROLL.minG) return null; // canopy to canopy: positive G throughout
    minKias = Math.min(minKias, st.kias);
    minG = Math.min(minG, st.g);
    maxG = Math.max(maxG, st.g);
    maxClimbDeg = Math.max(maxClimbDeg, st.gammaRad / DEG);
    const side = Math.sign(rel.left);
    if (close && !inverted && st.bodyUp.z < 0 && rel.fwd < 0) { // from echelon: inverted behind Lead at the top (TS-149)
      topRange = range;
      inverted = true;
    }
    if (!close && !inverted && side !== 0 && side !== side0) { // crossing Lead's track: over his six, inverted, lift toward him
      topRange = range;
      inverted = st.bodyUp.z < 0 && rel.fwd < 0;
      if (!inverted) break;
    }
    if (r.end) break;
  }
  if (minKias < LAG_ROLL.topKiasBand[0] || topRange === null || !inverted) return null;
  // Back to Lead's speed, wings level on Lead's heading (power back at the slowing slow-down.js allows; stepLead holdKias).
  for (let n = 0; n < Math.round(LAG_ROLL.settleMaxSec / STEP_SEC); n++) {
    if (Math.abs(st.kias - leadKias) < 1 && Math.abs(st.gammaRad) < 0.5 * DEG && Math.abs(st.bank) < 1) break;
    const g = Math.max(0.3, Math.cos(st.gammaRad) - 0.6 * st.gammaRad * st.V / G_FTPS2);
    st = stepLead(st, { g, bank: 0, holdKias: leadKias });
    t += STEP_SEC;
    push();
    poses[poses.length - 1].pwr = null;
  }
  const end = relToLead(lead0, vL, t, st.pm.x, st.pm.y, st.pm.z - blockFt - ctx.leadAlt);
  return { poses, end, t, rollSec, minKias, minG, maxG, maxClimbDeg, minRange, topRange };
}

function planOnPointMass({ lead, wing, s, base, lead0, vL, blockFt, close, where, t0 }) {
  const P = { ...base, T: 0, T2: 0, H: 0, fE: base.f0 };
  const T0 = base.T0;
  const poses = [];
  for (let i = 1; i <= Math.round(T0 / STEP_SEC); i++) { // the set-up, drawn smooth (TS-143)
    const st = groundAt(Math.min(i * STEP_SEC, T0 - 1e-6), P, lead0, vL);
    const tas = len3(st.vel);
    poses.push(poseOf3d({ x: st.pos.x, y: st.pos.y, altAbove: lead.altAboveFt + st.pos.z, vel: st.vel, up: Z, kias: lead.kias * tas / vL, g: 1, rollDps: 0 }));
  }
  const tStart = Math.round(T0 / STEP_SEC) * STEP_SEC;
  const fx = Math.cos(lead0.h);
  const fy = Math.sin(lead0.h);
  const along = vL * tStart + base.f0; // the set-up's end: at rest in Lead's frame at its place (or where he is, from echelon)
  const w0 = { ...wing, xFt: lead0.x + along * fx - base.L0 * fy, yFt: lead0.y + along * fy + base.L0 * fx, altAboveFt: lead.altAboveFt + base.z0, headingRad: lead.headingRad, tasFtps: vL, kias: lead.kias, climbFtps: 0, bankDeg: 0, rollRateDps: 0, g: 1 };
  const ctx = { lead0, vL, blockFt, s, tStart, leadKias: lead.kias, close, leadAlt: lead.altAboveFt };
  let best = null;
  for (const offDeg of LAG_ROLL.pmOffDeg) for (const pitchDeg of LAG_ROLL.pmNoseUpDeg) for (const pullG of LAG_ROLL.pullG) {
    const m = flyPmRoll({ offDeg, pitchDeg, pullG }, w0, ctx);
    if (!m) continue;
    const miss = bandMissFt(m.end, -s);
    const key = miss > 0 ? 1e6 + miss : m.t; // in the band soonest, else nearest the band
    if (!best || key < best.key) best = { key, m, c: { offDeg, pitchDeg, pullG } };
  }
  if (!best || best.key >= 1e6) return null; // none lands in the band: the drawn search flies it (and closes into the band)
  const { m, c } = best;
  poses.push(...m.poses);
  const last = poses[poses.length - 1];
  Object.assign(last, { bank: 0, roll: 0 });
  const total = m.t;
  const sideWord = -s > 0 ? 'left' : 'right';
  const fromWords = close ? `from echelon ${s > 0 ? 'left' : 'right'} ` : '';
  const setUpWords = T0 > 0 ? `moves forward and high in the cone (${Math.round(T0)} s), then ` : '';
  const note = `Lag roll ${fromWords}to fighting wing ${sideWord}: #2 ${setUpWords}flies a barrel roll toward Lead at full power, `
    + `${m.maxG.toFixed(1)} G, nose about ${Math.round(m.maxClimbDeg)}° up, over his six inverted at about ${Math.round(m.topRange).toLocaleString('en-CA')} ft, `
    + `slowest ${Math.round(m.minKias)} KIAS, down into the cone on the ${sideWord}, then power back to Lead's speed. Flown on the T-6A model (speed, height and G are the aircraft's own). `
    + 'The SMM does not name the lag roll (nearest: SMM 12.29 para 69, 12.30-12.31 para 74, 14.8 paras 18-19); the shape numbers are estimates.';
  return {
    ok: true,
    plans: { [lead.id]: { segments: [] }, [wing.id]: { segments: [{ kind: 'poseTrack', poses }] } },
    note,
    label: `Lag roll to fighting wing ${sideWord}`,
    flying: `${close ? 'Echelon' : 'Fighting wing'} ${s > 0 ? 'left' : 'right'} to fighting wing ${sideWord} (lag roll)`,
    from: where.key,
    fromSide: s,
    to: 'fw',
    side: -s,
    rejoinKind: 'none',
    maxBankDeg: poses.reduce((a, p) => Math.max(a, Math.abs(p.bank)), 0),
    endSec: t0 + total,
    rejoining: false,
    lagRoll: {
      pointMass: true, setUpSec: T0, rollSec: m.rollSec, closeSec: total - T0 - m.rollSec, climbFt: null, fallBackFt: null,
      pullG: c.pullG, noseUpDeg: c.pitchDeg, offDeg: c.offDeg, maxG: m.maxG, minG: m.minG, maxClimbDeg: m.maxClimbDeg, minKias: m.minKias,
      topRangeFt: m.topRange, minRangeFt: m.minRange, maxRollDps: null, leadOutOfTopHalfSec: 0, end: m.end,
    },
  };
}
