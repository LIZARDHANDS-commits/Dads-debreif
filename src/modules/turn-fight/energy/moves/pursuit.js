// Pursuit: where a chaser aims (pure, lead, lag, or the tactical blend), the closest-approach check and the
// out-of-plane offset that keeps it clear of the other, and the controller that points the nose at the aim.
import { KT_TO_FTPS, G_FTPS2 } from '../../../../core/units.js';
import { degToRad } from '../../../../core/angles.js';
import { availableG } from '../../../../core/t6-performance.js';
import { turnRadiusFt, dampedClimbG } from '../../../../core/flight-math.js';
import { DECONFLICTION_OFFSET_FT, energyTopKias, TUNING } from '../setup.js';
import { dot, len, scale, add, sub, cross, unit, clamp, velOf, posOf } from '../frame.js';
import { willRoll } from './common.js';
import { closestApproach, dangerGate, clearanceSide } from '../../../../core/closest-approach.js';

/**
 * Curved Control Zone aim point 1,500 ft along the turn circle circumference behind the target.
 * (Falcon BMS / CNATRA P-825 doctrine; BFM Phase 2B)
 */
export function curvedControlZonePoint(target, arcLenFt = 1500) {
  if (!target || !target.pm) return { x: 0, y: 0, z: 0 };
  const pm = target.pm;
  const vFtps = Math.hypot(pm.vx, pm.vy);
  if (vFtps < 1) return posOf(pm);

  const dir = target.turnDir || 0;
  const g = target.g ?? 1.0;
  const isTurning = Math.abs(dir) > 0.1 && g >= 1.15;
  const r = isTurning ? turnRadiusFt(vFtps, g) : Infinity;

  if (!isTurning || !Number.isFinite(r) || r > 20000) {
    const u = { x: pm.vx / vFtps, y: pm.vy / vFtps };
    return { x: pm.x - u.x * arcLenFt, y: pm.y - u.y * arcLenFt, z: pm.z };
  }

  const psi = Math.atan2(pm.vy, pm.vx);
  // Turn center in horizontal plane: normal rotated 90° toward turnDir
  const cx = pm.x - dir * r * Math.sin(psi);
  const cy = pm.y + dir * r * Math.cos(psi);

  // Angular position of target from turn center
  const theta0 = Math.atan2(pm.y - cy, pm.x - cx);

  // 1,500 ft behind along the curved circumference
  const dTheta = (arcLenFt / r) * dir;
  const thetaCZ = theta0 - dTheta;

  return {
    x: cx + r * Math.cos(thetaCZ),
    y: cy + r * Math.sin(thetaCZ),
    z: pm.z,
  };
}

/**
 * Continuous blended aim point for Tactical Pursuit (Lag -> Pure -> Lead):
 * Modulates smoothly as a convex combination of Lag (Control Zone), Pure (target pos), and Lead (muzzle lead).
 * Returns { aim: {x, y, z}, wLag, wLead, wPure, label }.
 */
export function tacticalAimCalculation(p, target, ac) {
  if (!target || !target.pm) return { aim: { x: 0, y: 0, z: 0 }, wLag: 0, wLead: 0, wPure: 1, label: 'Pursuit: Pure (Tracking)' };
  const targetPos = posOf(target.pm);
  if (!ac || !ac.pm) return { aim: targetPos, wLag: 0, wLead: 0, wPure: 1, label: 'Pursuit: Pure (Tracking)' };

  const acPos = posOf(ac.pm);
  const toTarget = sub(targetPos, acPos);
  const rangeFt = len(toTarget);
  if (rangeFt < 1e-3) return { aim: targetPos, wLag: 0, wLead: 0, wPure: 1, label: 'Pursuit: Pure (Tracking)' };

  // Range rate / closure: Vc = -d(range)/dt = -dot(toTarget / range, Vtarget - Vac)
  const relVel = sub(velOf(target.pm), velOf(ac.pm));
  const closureFtps = -dot(scale(toTarget, 1 / rangeFt), relVel);
  const closureKt = closureFtps / KT_TO_FTPS;

  // 1. Lag weight: dominates at long range (>3000 ft) or high closure (>60 kt) to stay in Control Zone
  const rangeLag = clamp((rangeFt - 1800) / 2200, 0, 1);
  const closureLag = clamp((closureKt - 40) / 60, 0, 1);
  const wLag = clamp(Math.max(rangeLag, closureLag), 0, 1);

  // 2. Lead weight: pulls ahead inside gun envelope (R < 2500 ft) when closure is under control
  const rangeLead = clamp((2200 - rangeFt) / 1000, 0, 1);
  const closureLeadPenalty = clamp((closureKt - 30) / 40, 0, 1);
  const wLead = clamp((1 - wLag) * rangeLead * (1 - closureLeadPenalty), 0, 1);

  // 3. Pure weight: convex complement
  const wPure = Math.max(0, 1 - wLag - wLead);

  // Discrete anchor points
  const lagPoint = curvedControlZonePoint(target, 1500 * (p.lagSec ?? 1));
  const leadTof = clamp(rangeFt / 3000, 0.2, (p.leadSec ?? 1.0));
  const leadPoint = add(targetPos, scale(velOf(target.pm), leadTof));
  const purePoint = targetPos;

  // Continuous convex combination
  const aim = add(
    add(scale(lagPoint, wLag), scale(leadPoint, wLead)),
    scale(purePoint, wPure)
  );

  let label = 'Pursuit: Pure (Tracking)';
  if (wLag > 0.5) label = 'Pursuit: Lag (Control Zone Entry)';
  else if (wLead > 0.5) label = 'Pursuit: Lead (Snapshot)';

  return { aim, wLag, wLead, wPure, label };
}

/**
 * Time to the closest point of approach and the miss distance there, flying straight on (core's closestApproach, ALL-27).
 * Not closing gives tcpaSec 0; with no aircraft it gives Infinity and no closing.
 */
export function computeTcpa(ac, target) {
  if (!ac || !target || !ac.pm || !target.pm) {
    return { tcpaSec: Infinity, missFt: Infinity, closing: false };
  }
  return closestApproach(stateOf(ac), stateOf(target));
}

/** Position (readouts first, as the fight reads them) and velocity of an aircraft, for core's closest approach. */
function stateOf(ac) {
  return { x: ac.xFt ?? ac.pm.x ?? 0, y: ac.yFt ?? ac.pm.y ?? 0, z: ac.zFt ?? ac.pm.z ?? 0, vx: ac.pm.vx ?? 0, vy: ac.pm.vy ?? 0, vz: ac.pm.vz ?? 0 };
}

// Fight Sim's danger test (model settings, estimates): closest point within 3.5 s and under 120 ft, or closing inside 600 ft;
// once dodging it holds until the range opens past 800 ft.
const DANGER = Object.freeze({ soonSec: 3.5, missFt: 120, nearFt: 600, releaseFt: 800 });

/**
 * Defender turn-plane normal vector n_hat (Task 28):
 * In a turn, n_hat is orthogonal to velocity and lift/normal axis (V x up).
 * In straight/wings-level flight, falls back to local vertical {0, 0, 1}.
 */
export function turnPlaneNormal(target) {
  if (!target || !target.pm) return { x: 0, y: 0, z: 1 };
  if (Math.abs(target.turnDir || 0) > 0.1 && (target.g ?? 1.0) > 1.2) {
    const up = target.pm.up || { x: 0, y: 0, z: 1 };
    const n = cross(velOf(target.pm), up);
    const nl = len(n);
    return nl > 1e-6 ? scale(n, 1 / nl) : { x: 0, y: 0, z: 1 };
  }
  return { x: 0, y: 0, z: 1 };
}

/** Where a chaser aims: the other (pure), a point `leadSec` ahead of it along its path (lead), the curved Control Zone 1,500 ft behind (lag), or continuous dynamic blend (tactical). */
export function aimPoint(p, target, ac = null) {
  if (!target || !target.pm) return { x: 0, y: 0, z: 0 };
  let danger = false;
  if (ac && ac.pm && target && target.pm && p?.collisionAvoidance !== false) {
    danger = dangerGate(ac.deconflicting, computeTcpa(ac, target), DANGER);
  }

  let aim;
  if (p.pursuit === 'lead') {
    const leadSec = danger ? 0 : p.leadSec;
    aim = add(posOf(target.pm), scale(velOf(target.pm), leadSec));
  } else if (p.pursuit === 'lag') {
    const lagSec = danger ? 0 : p.lagSec;
    if (lagSec === 0) aim = posOf(target.pm);
    else aim = curvedControlZonePoint(target, 1500 * (lagSec ?? 1));
  } else if (p.pursuit === 'tactical') {
    aim = tacticalAimCalculation(p, target, ac).aim;
  } else {
    aim = posOf(target.pm);
  }

  aim = { x: aim.x, y: aim.y, z: aim.z };

  if (danger) {
    ac.deconflicting = true;
    const n = turnPlaneNormal(target);
    const acPos = { x: ac.xFt ?? ac.pm.x ?? 0, y: ac.yFt ?? ac.pm.y ?? 0, z: ac.zFt ?? ac.pm.z ?? 0 };
    const targetPos = { x: target.xFt ?? target.pm.x ?? 0, y: target.yFt ?? target.pm.y ?? 0, z: target.zFt ?? target.pm.z ?? 0 };
    const dPos = dot(sub(acPos, targetPos), n);
    const offsetSign = clearanceSide(dPos, ac.who === 'red' ? -1 : 1);
    const offsetFt = offsetSign * DECONFLICTION_OFFSET_FT;
    aim.x += n.x * offsetFt;
    aim.y += n.y * offsetFt;
    aim.z += n.z * offsetFt;

    if (Math.abs(n.z) < 0.5) {
      const dZ = acPos.z - targetPos.z;
      const zSign = clearanceSide(dZ, ac.who === 'red' ? -1 : 1);
      aim.z += zSign * DECONFLICTION_OFFSET_FT;
    }

    const floorFt = p?.hardDeckFt ?? 6000;
    if (aim.z < floorFt + 50) aim.z = floorFt + DECONFLICTION_OFFSET_FT;
  } else if (ac) {
    ac.deconflicting = false;
  }

  return aim;
}

/**
 * Pursuit: point the nose at the aim point with a lift vector that also carries
 * the weight. Three limits, in this order of importance: the hard deck and the top speed (VMO, or true Mach 0.67 above about 17,570 ft, energyTopKias)
 * (the lift a level-off needs comes first, and the chase gets what is left);
 * core's availableG (the stall line, +7 G, and +4.7 G while rolling); and the
 * shaker. A chaser does not sink through the deck or fly past the top speed to catch
 * the other. The deck guard looks ahead: the height the path would bottom out at
 * is the pull-out circle plus the height lost rolling the lift up to the horizon
 * first (a chaser in a steep or inverted bank, after a close overshoot, loses
 * most of its drop there), and when that is under the deck the lift goes to the
 * vertical until it is not. At the deck the chase is a level turn, which is what
 * the level MPT flies. The tests hold it within 20 ft of the deck, not exactly on it.
 */
export function controlPursuit(ctx) {
  const { ac, other, p, f, kias } = ctx;
  const c = ac.ctl;
  const vHat = unit(velOf(ac.pm));
  const vFtps = f.ktas * KT_TO_FTPS;
  const calc = p.pursuit === 'tactical' ? tacticalAimCalculation(p, other, ac) : null;
  const aim = aimPoint(p, other, ac);
  if (calc) {
    ac.why = `${calc.label} after first nose-on`;
  }
  const toAim = sub(aim, posOf(ac.pm));
  const distance = len(toAim);
  const weightPerp = sub({ x: 0, y: 0, z: 1 }, scale(vHat, vHat.z)); // the weight's part square to the path
  // The lift (in G) that carries the weight and turns at the rate the pointing error asks for.
  let wanted = weightPerp;
  if (distance > 1e-6) {
    const u = scale(toAim, 1 / distance);
    const error = Math.acos(clamp(dot(u, vHat), -1, 1));
    const toward = sub(u, scale(vHat, dot(u, vHat)));
    const m = len(toward);
    if (m > 1e-9) wanted = add(weightPerp, scale(toward, (vFtps * TUNING.chaseGainPerSec * error / G_FTPS2) / m));
  }
  // Axes for the limits: e is up in the vertical plane of the path, s is sideways, both square to the path.
  const cosGamma = Math.sqrt(Math.max(0, 1 - vHat.z * vHat.z));
  const e = cosGamma > 0.02 ? unit(weightPerp) : ac.pm.up;
  const s = cross(vHat, e);
  let alphaWanted = dot(wanted, e), betaWanted = dot(wanted, s);

  // Energy retention governor (Phase 1C): prevent zoom-climb stalls down to 68 KIAS while permitting D405 zoom climbs
  if (kias < 140 && f.climbRad > 0) {
    const bleedRatio = clamp((kias - p.stallKias) / (140 - p.stallKias), 0, 1);
    alphaWanted = Math.min(alphaWanted, Math.cos(f.climbRad) * bleedRatio - Math.sin(f.climbRad) * (1 - bleedRatio));
  }

  const capFor = (rolling) => {
    let cap = Math.min(ctx.shaker, availableG(kias, rolling, p.stallKias));
    if (kias < 140 && f.climbRad > 0) {
      const bleedRatio = clamp((kias - p.stallKias) / (140 - p.stallKias), 0, 1);
      cap = Math.min(cap, 1.0 + 1.0 * bleedRatio);
    }
    return cap;
  };

  // Near the deck, never allow downward lift demand (pushing over or rolling inverted into the deck)
  if (f.altFt < p.hardDeckFt + 400) {
    alphaWanted = Math.max(Math.cos(f.climbRad), alphaWanted);
  }

  // The flight path angle the deck and the speed limit ask for: the deck from the height the pull-out would bottom at, the limit (VMO, or true Mach 0.67 above about 17,570 ft, energyTopKias) from the speed a few seconds on.
  const gamma = f.climbRad;
  const pullOutG = Math.max(capFor(true) - 1, 0.5);
  // The drop is the height lost while rolling the lift up to the horizon first (a chaser in a steep or inverted bank
  // must roll before it can pull out, and its nose keeps falling at the rate its lift gives now), then the pull-out circle.
  const rollOutSec = Math.abs(ac.bankDeg) / p.rollRateDegPerSec;
  const gammaRate = (ac.g * Math.cos(degToRad(ac.bankDeg)) - Math.cos(gamma)) * G_FTPS2 / vFtps; // the path's rate in the vertical plane now (rad/s)
  const gammaAfterRoll = gamma + Math.min(gammaRate, 0) * rollOutSec;
  const rollLossFt = vFtps * rollOutSec * Math.max(0, -Math.sin((gamma + gammaAfterRoll) / 2));
  const circleFt = gammaAfterRoll < 0 ? TUNING.deckPullOutFactor * (vFtps * vFtps / (G_FTPS2 * pullOutG)) * (1 - Math.cos(gammaAfterRoll)) : 0;
  const dropFt = rollLossFt + circleFt + 30;
  const deckSin = clamp((p.hardDeckFt - (f.altFt - dropFt)) * TUNING.levelAltGainPerSec / vFtps, -0.95, 0.5);
  const guardKias = energyTopKias(f.altFt) - TUNING.vmoMarginKias; // the limit at this height, so it tightens as the chase climbs into the Mach limit and eases as it dives out of it
  const overKt = kias + c.kiasRateEff * TUNING.vmoLeadSec - guardKias;
  const vmoSin = overKt > 0 ? Math.min(overKt * TUNING.vmoClimbPerKt, 0.6) : -1; // -1: no demand while the speed is well under the limit
  const gammaFloor = Math.asin(Math.max(deckSin, vmoSin));
  const alphaFloor = dampedClimbG(gamma, gammaFloor, vFtps, TUNING.levelOmegaPerSec);

  const build = (cap) => {
    let alpha = alphaWanted, beta = betaWanted;
    const mag = Math.hypot(alpha, beta);
    if (mag > cap) { alpha *= cap / mag; beta *= cap / mag; }
    const guarded = alphaFloor > alpha;
    if (guarded) {
      alpha = Math.min(alphaFloor, cap);
      beta = Math.sign(betaWanted) * Math.min(Math.abs(betaWanted), Math.sqrt(Math.max(0, cap * cap - alpha * alpha)));
    }
    const lift = add(scale(e, alpha), scale(s, beta));
    const g = len(lift);
    const rightC = cross(vHat, ac.pm.up);
    const bankRad = g > 1e-9 ? Math.atan2(dot(lift, rightC) / g, dot(lift, ac.pm.up) / g) : ac.bankRad;
    return { g, bankRad, prefer: bankRad >= 0 ? 1 : -1, throttle: 1, cap, guarded };
  };
  let cmd = build(capFor(false));
  if (willRoll(ctx, cmd.bankRad, cmd.prefer)) cmd = build(capFor(true));
  c.chaseLimited = cmd.guarded || len(wanted) > cmd.cap + 1e-9;
  return cmd;
}
