// The tennis ball: if the shooter threw a ball straight off the nose right now,
// would it pass within the hit radius of the target? The debrief map and the
// 3D view both show this one solution.
//
// One solver for both views (#19), as Patrick decided it on 2026-09-30, one
// answer at a time (Q33 to Q37, D77).
//
// Points are { x, y } in feet with optional altFt and spdKt; headings follow
// the angles.js convention. Reading the settings boxes, the track and the
// pitch estimate is the screen's job.
import { KT_TO_FTPS, G_FTPS2 } from './units.js';
import { degToRad, radToDeg, angleDiffRad } from './angles.js';

/** @typedef {{ x: number, y: number, altFt?: number, spdKt?: number }} TennisPoint */
/**
 * A point on the ball's or the target's path, tau seconds from now.
 * @typedef {{ x: number, y: number, altFt: number, tau: number }} PathPoint
 */

/**
 * The tennis-ball solution.
 *
 * The ball leaves along the shooter's heading and carries the shooter's whole
 * velocity: its speed along the track and its climb (Q33). Pitch tilts only
 * the ball's own speed, off the nose. The target flies its recorded path,
 * climb included (Q34, Q37). The path is checked every 0.15 s or
 * so (at least 8 steps).
 *
 * @param {object} o
 * @param {TennisPoint} o.shooter    { x, y, altFt, spdKt } now
 * @param {TennisPoint} o.target     { x, y, altFt } now
 * @param {(t: number) => TennisPoint|null} o.targetAt where the target is t seconds from now, from its
 *   recorded track ({ x, y, altFt }); null means it stays where it is now
 * @param {number} o.shooterHdg heading of the shooter's track now, radians
 * @param {number} [o.shooterClimbFps] the shooter's climb from its track, feet per second (+ up; 0 if unknown)
 * @param {number} o.pitchDeg   shooter pitch plus the pitch bias setting
 * @param {number} o.ballKt     ball speed setting
 * @param {number} o.coneDeg    full cone width (Q35, D77)
 * @param {number} o.tofSec     time of flight (at least 0.25)
 * @param {number} o.hitRadiusFt hit radius (at least 10)
 * @param {boolean} o.gravity   whether the ball drops
 * @returns {{status: 'INTERCEPT'|'IN CONE'|'OUT OF CONE', points: PathPoint[], targetPoints: PathPoint[],
 *   best: {dist: number, t: number, ball: PathPoint|null, target: PathPoint|null}, losAngle: number,
 *   rangeNow: number, tofSec: number, hitRadiusFt: number}}
 */
export function tennisBall({ shooter, target, targetAt, shooterHdg, shooterClimbFps = 0, pitchDeg, ballKt, coneDeg, tofSec, hitRadiusFt, gravity }) {
  const hdg = shooterHdg;
  const pitch = degToRad(pitchDeg);
  const tof = Math.max(.25, tofSec);
  const hitRadius = Math.max(10, hitRadiusFt);
  const sv = (shooter.spdKt || 0) * KT_TO_FTPS;
  const ballFps = ballKt * KT_TO_FTPS;
  const dir = { x: Math.cos(hdg), y: Math.sin(hdg) };
  const vx = dir.x * (sv + ballFps * Math.cos(pitch));
  const vy = dir.y * (sv + ballFps * Math.cos(pitch));
  const vz = shooterClimbFps + ballFps * Math.sin(pitch);
  const losAngle = Math.abs(radToDeg(angleDiffRad(Math.atan2(target.y - shooter.y, target.x - shooter.x), hdg)));
  const inConeNow = losAngle <= coneDeg / 2;

  const points = [], targetPoints = [];
  let best = { dist: Infinity, t: 0, ball: null, target: null };
  const steps = Math.max(8, Math.ceil(tof / .15));
  for (let i = 0; i <= steps; i++) {
    const tau = tof * i / steps;
    const bp = { x: shooter.x + vx * tau, y: shooter.y + vy * tau, altFt: (shooter.altFt || 0) + vz * tau - (gravity ? 0.5 * G_FTPS2 * tau * tau : 0), tau };
    const there = targetAt(tau) || target;
    const tp = { x: there.x, y: there.y, altFt: there.altFt || 0, tau };
    const d = Math.hypot(bp.x - tp.x, bp.y - tp.y, (bp.altFt || 0) - (tp.altFt || 0));
    points.push(bp);
    targetPoints.push(tp);
    if (d < best.dist) best = { dist: d, t: tau, ball: bp, target: tp };
  }

  // INTERCEPT needs the target in the cone now (Q36, D77).
  /** @type {'INTERCEPT'|'IN CONE'|'OUT OF CONE'} */
  let status = 'OUT OF CONE';
  if (inConeNow) status = best.dist <= hitRadius ? 'INTERCEPT' : 'IN CONE';
  const rangeNow = Math.hypot(target.x - shooter.x, target.y - shooter.y, (target.altFt || 0) - (shooter.altFt || 0));
  return { status, points, targetPoints, best, losAngle, rangeNow, tofSec: tof, hitRadiusFt: hitRadius };
}
