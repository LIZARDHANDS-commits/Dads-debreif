// Checks: a dropped load lands where standard mechanics puts it: with no drag, a load released level at 200 ft/s from
// 1,000 ft above the ground lands 200 × √(2 × 1,000 ÷ 32.174) = 1,577 ft ahead after 7.88 s; a cargo load on its open
// parachute comes down at the steady rate its weight and canopy give, and drifts downwind; and the computed air release
// point puts the load on the point of impact.
// Serves: DB-R29 (Debrief plan Step 3b, drop-plan.md).
// Expected values: standard mechanics worked out in the test (free fall, and the steady descent rate √(2W ÷ ρ Cd·A));
// margins from the shared table (±100 ft), the steady rate to 1 ft/s because it is the same formula's own check.
import test from 'node:test';
import assert from 'node:assert/strict';
import { flyDrop, carp, DROP_LOADS, steadyDescentFtps } from '../../../src/core/drop.js';
import { windVectorFtps } from '../../../src/core/wind.js';

const near = (actual, expected, tol, what) => assert.ok(Math.abs(actual - expected) <= tol, `${what}: ${actual} is not ${expected} ± ${tol}`);

test('a dropped load falls as standard mechanics says, and the release point puts it on target', () => {
  // No drag: the vacuum throw.
  const vac = flyDrop({ release: { x: 0, y: 0, z: 1000, vx: 200, vy: 0, vz: 0 }, load: { weightLb: 25, cdaFt2: 0, chute: null } });
  const t = Math.sqrt((2 * 1000) / 32.174);
  near(vac.impact.x, 200 * t, 100, 'vacuum throw, ft');
  near(vac.impact.t, t, 0.5, 'vacuum time of fall, s');

  // Cargo on its parachute: steady descent at the canopy's rate, and it drifts with a 15 kt wind.
  const load = DROP_LOADS.a22g12;
  const wind = windVectorFtps(270, 15); // from the west, so it drifts east
  const fall = flyDrop({ release: { x: 0, y: 0, z: 2000, vx: 0, vy: 220, vz: 0 }, load, windAt: () => wind });
  assert.ok(fall.landed, 'it lands');
  near(-fall.impact.vz, steadyDescentFtps(load.weightLb, load.chute.canopyCdaFt2, 0), 1, 'descent rate at the ground, ft/s');
  assert.ok(fall.impact.x > 0.8 * wind.x * fall.impact.t, 'it drifts downwind most of the way it falls');

  // The release point: dropped there, it lands on the point of impact.
  const target = { x: 3000, y: 6000 };
  const c = carp({ target, heightFt: 2000, ground: { vx: 0, vy: 220 }, load, windAt: () => wind });
  const check = flyDrop({ release: { x: c.x, y: c.y, z: 2000, vx: 0, vy: 220, vz: 0 }, load, windAt: () => wind });
  near(Math.hypot(check.impact.x - target.x, check.impact.y - target.y), 0, 100, 'miss from the computed release point, ft');
});
