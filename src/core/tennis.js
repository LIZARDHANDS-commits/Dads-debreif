// The tennis ball: if the shooter threw a ball straight off the nose right now,
// would it pass within the hit radius of the target? The debrief map and the
// 3D view both show this one solution.
//
// V6 had two solvers that disagreed (#19): the debrief overlay
// (getKmlTennisSolution, line 3140) and the 3D arc (draw3DDogfightArc, line
// 3970). This is the debrief's, pinned to V6 by a golden test, then changed
// one answer at a time as Patrick decided on 2026-09-30 (Q33 to Q37; see
// tasks/flight-math/tennis-ball.md). The 3D arc's solver is not kept.
//
// Points are { x, y } in feet with optional altFt and spdKt; headings follow
// the angles.js convention. Reading the settings boxes, the track and the
// pitch estimate is the screen's job.
import { KT_TO_FTPS, G_FTPS2 } from './units.js';
import { degToRad, radToDeg, angleDiffRad } from './angles.js';

/**
 * The tennis-ball solution (from V6's getKmlTennisSolution, line 3140).
 *
 * The ball leaves along the shooter's heading and carries the shooter's whole
 * velocity: its speed along the track and its climb (Q33; V6 left the climb
 * out). Pitch tilts only the ball's own speed, off the nose. The target
 * flies its recorded path, climb included (Q34, Q37; V6 flew it straight on at
 * its current heading and speed, level). The path is checked every 0.15 s or
 * so (at least 8 steps).
 *
 * @param {object} o
 * @param {object} o.shooter    { x, y, altFt, spdKt } now
 * @param {object} o.target     { x, y, altFt } now
 * @param {(t: number) => object|null} o.targetAt where the target is t seconds from now, from its
 *   recorded track ({ x, y, altFt }); null means it stays where it is now
 * @param {number} o.shooterHdg heading of the shooter's track now, radians
 * @param {number} [o.shooterClimbFps] the shooter's climb from its track, feet per second (+ up; 0 if unknown)
 * @param {number} o.pitchDeg   shooter pitch plus the pitch bias setting
 * @param {number} o.ballKt     ball speed setting (V6 default 350)
 * @param {number} o.coneDeg    full cone width (V6 default 6, so ±3°; Q35, D77)
 * @param {number} o.tofSec     time of flight (V6 default 3, at least 0.25)
 * @param {number} o.hitRadiusFt hit radius (V6 default 250, at least 10)
 * @param {boolean} o.gravity   whether the ball drops
 * @returns {{status: 'INTERCEPT'|'IN CONE'|'OUT OF CONE', points: object[], targetPoints: object[],
 *   best: {dist: number, t: number, ball: object|null, target: object|null}, losAngle: number,
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

  // INTERCEPT needs the target in the cone now (Q36, D77; V6 ignored the cone).
  let status = 'OUT OF CONE';
  if (inConeNow) status = best.dist <= hitRadius ? 'INTERCEPT' : 'IN CONE';
  const rangeNow = Math.hypot(target.x - shooter.x, target.y - shooter.y, (target.altFt || 0) - (shooter.altFt || 0));
  return { status, points, targetPoints, best, losAngle, rangeNow, tofSec: tof, hitRadiusFt: hitRadius };
}
