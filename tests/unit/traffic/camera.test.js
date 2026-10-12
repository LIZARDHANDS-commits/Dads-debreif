// Checks: the cockpit eye (front and rear seat) sits inside the canopy glass, and the tower view with nothing picked
//   aims at the Runway 29L threshold, looking down at it from the cab.
// Serves: TR-R2 (the views a pilot can pick), ALL-31 (the CT-156 cockpit).
// Expected values: the canopy's own section at the eye's station (ct156-model.js, the side view, ALL-31);
//   the bearing and the look-down angle from the cab to the threshold worked out in the test with atan2.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RWY_29L_THRESHOLD, TOWER_FT, TOWER_EYE_AGL_FT, towerFree } from '../../../src/modules/traffic/camera-views.js';
import { EYES_FT, CT156_FT_PER_UNIT } from '../../../src/ui-kit/ct156-cockpit.js';
import { ct156CanopySection, ct156CanopyHalfWidth } from '../../../src/ui-kit/ct156-model.js';
import { wrapDeg180 } from '../../../src/core/angles.js';

test('the cockpit eye in each seat is inside the canopy: above the sill, below the glass and between its sides', () => {
  const F = CT156_FT_PER_UNIT;
  for (const [seat, eye] of Object.entries(EYES_FT)) {
    const c = ct156CanopySection(eye.x / F);
    assert.ok(eye.z > c.base * F, `${seat} seat: the eye is above the canopy sill (${eye.z.toFixed(2)} ft vs ${(c.base * F).toFixed(2)} ft)`);
    assert.ok(eye.z < c.top * F, `${seat} seat: the eye is below the canopy top (${eye.z.toFixed(2)} ft vs ${(c.top * F).toFixed(2)} ft)`);
    const halfWidthFt = ct156CanopyHalfWidth(eye.x / F, eye.z / F) * F;
    assert.ok(Math.abs(eye.y) < halfWidthFt, `${seat} seat: the eye is between the canopy sides (${eye.y} ft off the middle, glass ${halfWidthFt.toFixed(2)} ft)`);
  }
});

test('the tower view with nothing picked aims at the 29L threshold, looking down from the cab', () => {
  const floorFt = RWY_29L_THRESHOLD.alt;
  const view = towerFree(floorFt);
  const dx = RWY_29L_THRESHOLD.x - TOWER_FT.x, dy = RWY_29L_THRESHOLD.y - TOWER_FT.y;
  const bearingDeg = (Math.atan2(dx, dy) * 180) / Math.PI;
  const downDeg = (Math.atan2(TOWER_EYE_AGL_FT, Math.hypot(dx, dy)) * 180) / Math.PI;
  // ±5°: the shared angle margin (docs/TESTING.md).
  assert.ok(Math.abs(wrapDeg180(view.yawDeg - bearingDeg)) <= 5, `aims at the threshold: yaw ${view.yawDeg.toFixed(1)}° vs bearing ${bearingDeg.toFixed(1)}°`);
  assert.ok(view.elevDeg < 0, 'looks down at the runway from the cab');
  assert.ok(Math.abs(view.elevDeg + downDeg) <= 5, `look-down ${(-view.elevDeg).toFixed(1)}° vs ${downDeg.toFixed(1)}°`);
  assert.equal(view.track, false, 'with nothing picked it follows no aircraft');
});
