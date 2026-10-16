// A dropped load: an inert practice bomb or a cargo bundle on a parachute, falling from a release point under gravity and
// drag through the wind, to the ground (Debrief plan Step 3b, `docs/modules/debrief/drop-plan.md`, DB-36; Dad, 15 Oct 2026:
// "so we can see the inertia and whether or not it'd land on target"; Patrick approved, relayed by Dad).
//
// Standard mechanics, nothing fitted: a point mass with gravity (32.174 ft/s²) and drag along the air-relative velocity,
// drag ÷ mass = ½ ρ v² (Cd·A) g ÷ W, with ρ the air's density at the load's height (core atmosphere). Axes as core's wind
// vector: x east, y north, z up, all in feet and ft/s; heights are MSL. The wind is the velocity the air moves with
// (windVectorFtps), so a load with no airspeed drifts with it. Every load number is an estimate until drop-plan.md's
// table gives its page; they are DROP_LOADS' working values and can be changed per drop.
import { G_FTPS2 } from './units.js';
import { densityRatio } from './atmosphere.js';

/** Sea-level standard air density, slug/ft³. */
export const RHO0_SLUG_FT3 = 0.0023769;

/** The step, s: the shared point mass's (core point-mass.js users step at 0.05 s). */
export const DROP_STEP_SEC = 0.05;

/** Longest fall followed, s: past this it is reported as not landed (a 20,000 ft drop on a G-12 takes about 12 minutes). */
export const DROP_MAX_SEC = 1800;

/**
 * The loads (drop-plan.md's table; all ESTIMATES until a page backs them):
 *  - weightLb: the load's weight.
 *  - cdaFt2: drag coefficient × reference area, ft², in free fall.
 *  - chute (cargo only): openDelaySec after release before the canopy starts to open, fillSec for it to open (Cd·A
 *    building linearly from the bundle's to the canopy's), canopyCdaFt2 the open canopy's Cd·A.
 * BDU-33: 25 lb nominal (public records); Cd·A from its 4 in body (0.087 ft²) and a finned body's Cd of about 0.35.
 * A-22 on a G-12: a 2,200 lb bag (the G-12's rated top load, 501 to 2,200 lb, Mills Manufacturing); the bag's Cd·A from a 4 ft
 * square face and Cd about 1.0; the canopy's Cd·A set so it comes down at 28 ft/s at its rated 2,200 lb at sea level
 * (2W ÷ ρ0v², 2,361 ft², which is a Cd of 0.73 on the 64 ft canopy's 3,217 ft², a flat circular canopy's usual
 * value); so the preset settles at 28 ft/s, and a lighter bag slower (1,000 lb near 19 ft/s). The 28 ft/s and the 2 s and
 * 2 s are estimates (drop-plan.md).
 */
export const DROP_LOADS = Object.freeze({
  bdu33: Object.freeze({ id: 'bdu33', name: 'BDU-33 practice bomb', weightLb: 25, cdaFt2: 0.03, chute: null }),
  a22g12: Object.freeze({
    id: 'a22g12',
    name: 'A-22 bag on a G-12',
    weightLb: 2200,
    cdaFt2: 16,
    chute: Object.freeze({ openDelaySec: 2, fillSec: 2, canopyCdaFt2: 2361 }),
  }),
});

/** The load's Cd·A, ft², t seconds after release: its own, then the canopy building over fillSec once openDelaySec has run. */
export function dropCdaFt2(load, t) {
  const c = load.chute;
  if (!c || t <= c.openDelaySec) return load.cdaFt2;
  const k = c.fillSec > 0 ? Math.min(1, (t - c.openDelaySec) / c.fillSec) : 1;
  return load.cdaFt2 + k * (c.canopyCdaFt2 - load.cdaFt2);
}

/** The steady descent rate in still air, ft/s, for a weight and Cd·A at a height: √(2W ÷ ρ Cd·A). */
export function steadyDescentFtps(weightLb, cdaFt2, altFt = 0, deviationC = 0) {
  const rho = RHO0_SLUG_FT3 * densityRatio(altFt, deviationC);
  return Math.sqrt((2 * weightLb) / (rho * cdaFt2));
}

/**
 * One step of the fall: the new velocity, then the position moved by the step's average velocity (exact for gravity alone).
 * s: { t, x, y, z, vx, vy, vz }; wind: { x, y } ft/s at the load's height; returns the next state.
 */
export function stepDrop(s, load, wind, dt, deviationC = 0) {
  const ax0 = s.vx - (wind?.x ?? 0);
  const ay0 = s.vy - (wind?.y ?? 0);
  const az0 = s.vz;
  const air = Math.hypot(ax0, ay0, az0);
  const rho = RHO0_SLUG_FT3 * densityRatio(s.z, deviationC);
  const k = air > 0 ? (0.5 * rho * air * dropCdaFt2(load, s.t) * G_FTPS2) / load.weightLb : 0; // drag ÷ mass ÷ airspeed
  // Implicit in the drag, so the parachute's sudden Cd·A can't overshoot in one step: v' = (v − w)/(1 + k dt) + w.
  const d = 1 / (1 + k * dt);
  const vx = ax0 * d + (wind?.x ?? 0);
  const vy = ay0 * d + (wind?.y ?? 0);
  const vz = az0 * d - G_FTPS2 * dt;
  return { t: s.t + dt, x: s.x + ((s.vx + vx) / 2) * dt, y: s.y + ((s.vy + vy) / 2) * dt, z: s.z + ((s.vz + vz) / 2) * dt, vx, vy, vz };
}

/**
 * The whole fall from a release to the ground.
 * release: { x, y, z, vx, vy, vz } (ft, ft/s over the ground; z MSL); load: a DROP_LOADS entry or one like it;
 * windAt(z) → { x, y } ft/s, or null/undefined for still air; groundAt(x, y) → ground height MSL, ft (default 0);
 * every: keep one path point in this many steps (default 4, 0.2 s).
 * Returns { landed, path: [{ t, x, y, z }], impact: { t, x, y, z, vx, vy, vz } | null, chuteOpenSec | null }.
 * The impact is where the path crosses the ground, found between the last two steps.
 */
export function flyDrop({ release, load, windAt = null, groundAt = () => 0, dt = DROP_STEP_SEC, deviationC = 0, every = 4 }) {
  let s = { t: 0, ...release };
  const path = [{ t: 0, x: s.x, y: s.y, z: s.z }];
  let n = 0;
  while (s.t < DROP_MAX_SEC) {
    const next = stepDrop(s, load, windAt ? windAt(s.z) : null, dt, deviationC);
    const g1 = groundAt(next.x, next.y);
    if (next.z <= g1) {
      const g0 = groundAt(s.x, s.y);
      const f = s.z - g0 > 0 ? (s.z - g0) / (s.z - g0 - (next.z - g1)) : 0;
      const lerp = (a, b) => a + (b - a) * f;
      const impact = {
        t: lerp(s.t, next.t), x: lerp(s.x, next.x), y: lerp(s.y, next.y), z: lerp(g0, g1),
        vx: next.vx, vy: next.vy, vz: next.vz,
      };
      path.push({ t: impact.t, x: impact.x, y: impact.y, z: impact.z });
      return { landed: true, path, impact, chuteOpenSec: load.chute ? load.chute.openDelaySec + load.chute.fillSec : null };
    }
    s = next;
    if (++n % every === 0) path.push({ t: s.t, x: s.x, y: s.y, z: s.z });
  }
  return { landed: false, path, impact: null, chuteOpenSec: load.chute ? load.chute.openDelaySec + load.chute.fillSec : null };
}

/**
 * The computed air release point (CARP): where to release, on a pass at this height and ground velocity, so the load
 * lands on the point of impact. The same fall run from a trial release, the trial moved by the miss, until within
 * toleranceFt (10 ft, an estimate) or maxPasses.
 * target: { x, y } the point of impact; heightFt: release height MSL; ground: { vx, vy } the ship's velocity over the
 * ground (ft/s; the load leaves with it, level). Returns { x, y, missFt, passes, fall } or null if it never lands.
 */
export function carp({ target, heightFt, ground, load, windAt = null, groundAt = () => 0, deviationC = 0, toleranceFt = 10, maxPasses = 8 }) {
  let rx = target.x;
  let ry = target.y;
  for (let pass = 1; pass <= maxPasses; pass++) {
    const fall = flyDrop({ release: { x: rx, y: ry, z: heightFt, vx: ground.vx, vy: ground.vy, vz: 0 }, load, windAt, groundAt, deviationC, every: 20 });
    if (!fall.landed) return null;
    const ex = target.x - fall.impact.x;
    const ey = target.y - fall.impact.y;
    const missFt = Math.hypot(ex, ey);
    if (missFt <= toleranceFt || pass === maxPasses) return { x: rx, y: ry, missFt, passes: pass, fall }; // the miss is this point's own
    rx += ex;
    ry += ey;
  }
  return null;
}

/**
 * The miss in words: distance and clock direction of the impact from the point of impact, with 12 o'clock along the
 * run-in heading (compass degrees). Returns { missFt, clock } (clock 1 to 12).
 */
export function missClock(impact, target, runInDeg) {
  const dx = impact.x - target.x;
  const dy = impact.y - target.y;
  const missFt = Math.hypot(dx, dy);
  const bearing = (Math.atan2(dx, dy) * 180) / Math.PI; // compass, from north
  const rel = (((bearing - runInDeg) % 360) + 360) % 360;
  const clock = Math.round(rel / 30) % 12 || 12;
  return { missFt, clock };
}
