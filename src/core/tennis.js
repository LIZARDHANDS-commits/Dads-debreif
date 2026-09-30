// The tennis ball: if the shooter threw a ball straight off the nose right now,
// would it pass within the hit radius of the target?
//
// V6 has two solvers that give different answers for the same inputs (#19):
// the debrief overlay (getKmlTennisSolution, line 3140) and the 3D arc
// (draw3DDogfightArc, line 3970). Both are ported here unchanged and pinned by
// golden tests. Which one the rebuild keeps, or how to merge them, is for
// Patrick and Dad to decide; tasks/flight-math/tennis-ball.md lists the
// differences.
//
// Points are { x, y } in feet with optional altFt and spdKt; headings follow
// the angles.js convention. Reading the settings boxes, the track and the
// pitch estimate is the screen's job.
import { KT_TO_FTPS, G_FTPS2 } from './units.js';
import { degToRad, radToDeg, angleDiffRad } from './angles.js';

/**
 * The debrief overlay's solver (getKmlTennisSolution, line 3140).
 *
 * The ball leaves along the shooter's heading. Shooter speed adds to its
 * horizontal speed only, and pitch tilts only the ball's own speed. The target
 * keeps flying straight at its current heading and speed, and never climbs.
 * The path is checked every 0.15 s or so (at least 8 steps).
 *
 * @param {object} o
 * @param {object} o.shooter    { x, y, altFt, spdKt } now
 * @param {object} o.target     { x, y, altFt, spdKt } now
 * @param {number} o.shooterHdg heading of the shooter's track now, radians
 * @param {number} o.targetHdg  heading of the target's track now, radians
 * @param {number} o.pitchDeg   shooter pitch plus the pitch bias setting
 * @param {number} o.ballKt     ball speed setting (V6 default 350)
 * @param {number} o.coneDeg    full cone width (V6 default 6, so ±3°)
 * @param {number} o.tofSec     time of flight (V6 default 3, at least 0.25)
 * @param {number} o.hitRadiusFt hit radius (V6 default 250, at least 10)
 * @param {boolean} o.gravity   whether the ball drops
 * @returns {{status: 'INTERCEPT'|'IN CONE'|'OUT OF CONE', points: object[], targetPoints: object[],
 *   best: {dist: number, t: number, ball: object|null, target: object|null}, losAngle: number,
 *   rangeNow: number, tofSec: number, hitRadiusFt: number}}
 */
export function tennisDebrief({ shooter, target, shooterHdg, targetHdg, pitchDeg, ballKt, coneDeg, tofSec, hitRadiusFt, gravity }) {
  const hdg = shooterHdg;
  const pitch = degToRad(pitchDeg);
  const tof = Math.max(.25, tofSec);
  const hitRadius = Math.max(10, hitRadiusFt);
  const sv = (shooter.spdKt || 0) * KT_TO_FTPS;
  const tv = (target.spdKt || 0) * KT_TO_FTPS;
  const ballFps = ballKt * KT_TO_FTPS;
  const dir = { x: Math.cos(hdg), y: Math.sin(hdg) };
  const tdir = { x: Math.cos(targetHdg), y: Math.sin(targetHdg) };
  const vx = dir.x * (sv + ballFps * Math.cos(pitch));
  const vy = dir.y * (sv + ballFps * Math.cos(pitch));
  const vz = ballFps * Math.sin(pitch);
  const targetV = { x: tdir.x * tv, y: tdir.y * tv };
  const losAngle = Math.abs(radToDeg(angleDiffRad(Math.atan2(target.y - shooter.y, target.x - shooter.x), hdg)));
  const inConeNow = losAngle <= coneDeg / 2;

  const points = [], targetPoints = [];
  let best = { dist: Infinity, t: 0, ball: null, target: null };
  const steps = Math.max(8, Math.ceil(tof / .15));
  for (let i = 0; i <= steps; i++) {
    const tau = tof * i / steps;
    const bp = { x: shooter.x + vx * tau, y: shooter.y + vy * tau, altFt: (shooter.altFt || 0) + vz * tau - (gravity ? 0.5 * G_FTPS2 * tau * tau : 0), tau };
    const tp = { x: target.x + targetV.x * tau, y: target.y + targetV.y * tau, altFt: target.altFt || 0, tau };
    const d = Math.hypot(bp.x - tp.x, bp.y - tp.y, (bp.altFt || 0) - (tp.altFt || 0));
    points.push(bp);
    targetPoints.push(tp);
    if (d < best.dist) best = { dist: d, t: tau, ball: bp, target: tp };
  }

  let status = 'OUT OF CONE';
  if (best.dist <= hitRadius) status = 'INTERCEPT';
  else if (inConeNow) status = 'IN CONE';
  const rangeNow = Math.hypot(target.x - shooter.x, target.y - shooter.y, (target.altFt || 0) - (shooter.altFt || 0));
  return { status, points, targetPoints, best, losAngle, rangeNow, tofSec: tof, hitRadiusFt: hitRadius };
}

/**
 * The 3D view's solver (draw3DDogfightArc, line 3970).
 *
 * The ball leaves along shooter.hdg (0 if missing). Ball and shooter speed add
 * together and pitch tilts both. The target flies its recorded track:
 * targetAt(t) gives where it is t seconds from now, and when that is null the
 * target is taken to stay where it is now. The path is checked at 70 steps.
 * The cone is drawn at shooter.hdg ± coneDeg, twice as wide as the debrief's.
 *
 * @param {object} o
 * @param {object} o.shooter   { x, y, altFt, spdKt, hdg } now
 * @param {object} o.target    { x, y, altFt } now
 * @param {(t: number) => object|null} [o.targetAt] target position t seconds ahead
 * @param {number} o.pitchDeg  shooter pitch plus the pitch bias setting
 *   (in V6 the pitch estimate never reaches the 3D view, so this is the bias alone)
 * @param {number} o.ballKt    ball speed setting
 * @param {number} o.coneDeg   cone setting (at least 0.1)
 * @param {number} o.tofSec    time of flight (at least 0.25)
 * @param {number} o.radiusFt  hit radius (at least 1)
 * @param {boolean} o.gravity  whether the ball drops
 * @returns {{hit: boolean, minDist: number, closest: {ball: object, target: object, t: number}|null,
 *   points: object[], coneEdges: object[][]}}
 */
export function tennis3D({ shooter, target, targetAt = () => null, pitchDeg, ballKt, coneDeg, tofSec, radiusFt, gravity }) {
  const tof = Math.max(.25, tofSec);
  const cone = Math.max(.1, coneDeg) * Math.PI / 180;
  const radius = Math.max(1, radiusFt);
  const hdg = Number.isFinite(shooter.hdg) ? shooter.hdg : 0;
  const vfps = ballKt * KT_TO_FTPS + (shooter.spdKt || 0) * KT_TO_FTPS;
  const vz0 = Math.sin(pitchDeg * Math.PI / 180) * vfps;
  const vh = Math.cos(pitchDeg * Math.PI / 180) * vfps;
  const steps = 70;
  const ballAt = (h, tt) => ({
    x: shooter.x + Math.cos(h) * vh * tt,
    y: shooter.y + Math.sin(h) * vh * tt,
    altFt: (shooter.altFt || 0) + vz0 * tt - (gravity ? 0.5 * G_FTPS2 * tt * tt : 0),
  });

  let minDist = Infinity, closest = null, hit = false;
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const tt = tof * i / steps;
    const p = ballAt(hdg, tt);
    points.push(p);
    const targetNow = targetAt(tt) || target;
    if (targetNow) {
      const d = Math.hypot(p.x - targetNow.x, p.y - targetNow.y, (p.altFt || 0) - (targetNow.altFt || 0));
      if (d < minDist) { minDist = d; closest = { ball: p, target: targetNow, t: tt }; }
      if (d <= radius) hit = true;
    }
  }

  const coneEdges = [-1, 1].map(side => {
    const edge = [];
    for (let i = 0; i <= steps; i += 4) edge.push(ballAt(hdg + side * cone, tof * i / steps));
    return edge;
  });
  return { hit, minDist, closest, points, coneEdges };
}
