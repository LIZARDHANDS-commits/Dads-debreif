// What every move shares: the pull G, the level-off, the bank toward the other, a bank from the real horizon,
// and the one definition of rolling.
import { KT_TO_FTPS } from '../../../../core/units.js';
import { degToRad, radToDeg } from '../../../../core/angles.js';
import { rollToward, dampedClimbG } from '../../../../core/flight-math.js';
import { TUNING, ROLLING_DEG_PER_SEC } from '../setup.js';
import { dot, len, scale, add, sub, cross, unit, clamp, posOf, horizonFrame, carriedBankFor } from '../frame.js';

/** The pull G the model asks for while it sets a move up: the set G (4 by default), never past the shaker. The one place every 4 G hold goes through. */
export function pullCmdG(ctx) {
  return Math.min(ctx.p.pullG, ctx.shaker);
}

/** A level-off's G: the vertical-plane pull that closes on a flight path angle with a first-order lag. */
export function levelOffG(ctx, climbTargetRad) {
  const vFtps = ctx.f.ktas * KT_TO_FTPS;
  const n = dampedClimbG(ctx.f.climbRad, climbTargetRad, vFtps, TUNING.levelOmegaPerSec);
  return clamp(n, 0, ctx.shaker);
}

/**
 * Bank angle in degrees that points the aircraft's lift vector toward the target.
 */
export function bankTowardTargetDeg(ac, other, defaultBankDeg = 60) {
  if (!other || !other.pm) return defaultBankDeg;
  const fr = horizonFrame(ac.pm);
  const toTarget = sub(posOf(other.pm), posOf(ac.pm));
  const dist = len(toTarget);
  if (dist < 1e-3) return defaultBankDeg;
  const los = scale(toTarget, 1 / dist);
  const losPerp = sub(los, scale(fr.vHat, dot(los, fr.vHat)));
  const m = len(losPerp);
  if (m < 1e-4) return defaultBankDeg;
  const losDir = scale(losPerp, 1 / m);
  const dir = ac.turnDir || 1;
  const cosBeta = dot(losDir, fr.upH);
  const sinBeta = dot(losDir, scale(fr.leftH, dir));
  const bankDeg = Math.abs(radToDeg(Math.atan2(sinBeta, cosBeta)));
  return Number.isFinite(bankDeg) ? bankDeg : defaultBankDeg;
}

/**
 * A bank from the real horizon. Near the vertical the horizon gives no reference
 * (a pilot over the top of a pitch back holds the bank he has), so the command
 * holds the current bank until the nose is 15° off the vertical.
 * One exception, the nose low: a held bank past 90° there (the lift pointing below the true horizon) pulls the nose
 * further down, and holding it is a stable dive that never pulls out (a forced slice from a very low speed, high up,
 * verification F1). So with the nose low (and not exactly vertical) the bank is taken from the true horizon, as the
 * move asks for it but at most 90°, and the pull brings the nose up.
 */
export function physicalBankCommand(ctx, bankDeg, g, throttle) {
  const { ac } = ctx;
  const fr = horizonFrame(ac.pm);
  if (fr.nearVertical) {
    if (fr.vHat.z < 0 && Math.abs(fr.vHat.z) < 1 - 1e-12) {
      // The true horizon's up and left, square to the path (the frame gives the carried up here, which turns with the roll).
      const upTrue = unit({ x: -fr.vHat.z * fr.vHat.x, y: -fr.vHat.z * fr.vHat.y, z: 1 - fr.vHat.z * fr.vHat.z });
      const leftTrue = cross(upTrue, fr.vHat);
      const beta = degToRad(Math.min(Math.max(bankDeg, 0), 90));
      const lift = add(scale(upTrue, Math.cos(beta)), scale(leftTrue, Math.sin(beta) * ac.turnDir));
      return { g, bankRad: Math.atan2(dot(lift, fr.rightC), dot(lift, ac.pm.up)), prefer: ac.ctl.prefer, throttle };
    }
    return { g, bankRad: ac.bankRad, prefer: ac.ctl.prefer, throttle };
  }
  const target = carriedBankFor(ac.pm, degToRad(bankDeg), ac.turnDir);
  const inv = ac.pm.up.z < 0;
  return { g, bankRad: target, prefer: inv ? ac.turnDir : -ac.turnDir, throttle };
}

/** The one definition of rolling: the bank changed this step faster than ROLLING_DEG_PER_SEC. */
export const isRolling = (movedRad, d) => radToDeg(movedRad) / d > ROLLING_DEG_PER_SEC;

/** Whether the aircraft will be rolling this step if it is commanded to this bank (the same roll step the aircraft then flies). */
export function willRoll(ctx, bankRad, prefer) {
  const { ac, p, d } = ctx;
  return isRolling(rollToward(ac.bankRad, bankRad, degToRad(p.rollRateDegPerSec) * d, prefer).movedRad, d);
}
