// ============================================================================
// WARNING / TEST INTEGRITY GUARD (D411):
// If this test or any test in this suite fails repeatedly (2x test fail):
// DO NOT tweak flight physics, 5.0 G SMM pull laws, stick shaker limits, or
// aerodynamic formulas to force tests to pass!
// STOP IMMEDIATELY, ALERT THE OPERATOR, AND ASK FOR INSTRUCTIONS / CLARIFICATION.
// Tests may be poorly designed, overfitted to obsolete baseline assumptions,
// or time-locked to legacy trajectory floats. Under D411, tests must be updated
// or pruned, never accommodated by degrading aerodynamic fidelity.
// ============================================================================

// The Turn Sim's 3D view, the parts that are plain values (SPEC-turn-sim: 2D/3D switch). three runs in
// Node without WebGL, so the camera and the attitude are pinned here with the real three.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadThree, matchProjection, worldToScreen } from '../../../src/ui-kit/three-aircraft.js';
import {
  yawBehind, orbit, zoomBy, turnSign, aircraftPose, planeLengthFt, fitCamera, CAMERA_LIMITS, T6_LENGTH_FT, MIN_PLANE_PX, FLIGHT_ALT_FT,
} from '../../../src/modules/turn-sim/view3d.js';

const THREE = await loadThree();
const SIZE = { width: 800, height: 600 };
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} is not ${b}`);
const DEG = Math.PI / 180;

/** Where a world point lands on the screen for a camera looking at `center`. */
function screenOf(camera, center, point, size = SIZE) {
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2);
  matchProjection(THREE, cam, { x: center.x, y: center.y, z: FLIGHT_ALT_FT }, camera, size, 1);
  return worldToScreen(THREE, cam, { x: point.x, y: point.y, z: FLIGHT_ALT_FT }, size.width, size.height);
}

test('the camera starts behind Lead: what is ahead of Lead is up the screen, whatever Lead\'s heading', () => {
  for (const headingDeg of [0, 30, 90, 135, 180, -90, 270, 359]) {
    const h = headingDeg * DEG;
    const camera = { yawDeg: yawBehind(h), pitchDeg: 35, zoom: 20, altScale: 1 };
    const lead = { x: 1000, y: -2000 };
    const ahead = { x: lead.x + 1000 * Math.cos(h), y: lead.y + 1000 * Math.sin(h) };
    const left = { x: lead.x + 1000 * Math.cos(h + Math.PI / 2), y: lead.y + 1000 * Math.sin(h + Math.PI / 2) };
    const a = screenOf(camera, lead, ahead);
    const l = screenOf(camera, lead, left);
    const c = screenOf(camera, lead, lead);
    near(c.x, SIZE.width / 2, 1e-3);
    near(a.x, c.x, 1e-3); // straight ahead is straight up
    assert.ok(a.y < c.y, `${headingDeg}: ahead is up the screen`);
    assert.ok(l.x < c.x, `${headingDeg}: Lead's left is the screen's left`);
  }
});

test('yawBehind stays within one turn', () => {
  for (const d of [-720, -181, -90, 0, 90, 180, 361, 1000]) {
    const yaw = yawBehind(d * DEG);
    assert.ok(yaw >= -180 && yaw < 180, `${d} gives ${yaw}`);
  }
});

test('orbit turns and tilts within limits; zoom stays within its limits', () => {
  const start = { yawDeg: 170, pitchDeg: 35, zoom: 20, altScale: 1 };
  const turned = orbit(start, 100, 0);
  near(turned.yawDeg, -150); // 170 + 40 wraps round
  assert.equal(orbit(start, 0, 10_000).pitchDeg, CAMERA_LIMITS.pitch[0]);
  assert.equal(orbit(start, 0, -10_000).pitchDeg, CAMERA_LIMITS.pitch[1]);
  let z = start;
  for (let i = 0; i < 200; i++) z = zoomBy(z, -1);
  assert.equal(z.zoom, CAMERA_LIMITS.zoom[1]);
  for (let i = 0; i < 400; i++) z = zoomBy(z, 1);
  assert.equal(z.zoom, CAMERA_LIMITS.zoom[0]);
  assert.ok(zoomBy(start, -1).zoom > start.zoom && zoomBy(start, 1).zoom < start.zoom);
});

test('the turn sign follows the heading: left (counter-clockwise) is +1', () => {
  assert.equal(turnSign(0, 0.01), 1);
  assert.equal(turnSign(0.01, 0), -1);
  assert.equal(turnSign(3.13, -3.13), 1); // across the +-180 seam, still turning left
  assert.equal(turnSign(1, 1), 0);
});

/** Applies the model's attitude as the view does and returns where the model's own +Y (left wing) and +X (nose) point. */
function attitude(pose) {
  const o = new THREE.Object3D();
  o.rotation.order = 'ZYX';
  o.rotation.set(-pose.bankRad, 0, pose.headingRad);
  o.updateMatrixWorld(true);
  return {
    nose: new THREE.Vector3(1, 0, 0).applyMatrix4(o.matrixWorld),
    leftWing: new THREE.Vector3(0, 1, 0).applyMatrix4(o.matrixWorld),
  };
}

test('an aircraft is drawn where the engine has it, on its heading, and banked the way it turns', () => {
  const a = { id: 2, xFt: 1234.5, yFt: -678.9, headingRad: 0.7, bankDeg: 60, turning: true };
  const left = aircraftPose(a, 1);
  assert.equal(left.x, 1234.5);
  assert.equal(left.y, -678.9);
  assert.equal(left.z, FLIGHT_ALT_FT); // the sim is flat
  assert.equal(left.headingRad, 0.7);
  near(left.bankRad, 60 * DEG);
  const l = attitude(left);
  near(l.nose.x, Math.cos(0.7));
  near(l.nose.y, Math.sin(0.7));
  assert.ok(l.leftWing.z < -0.8, 'a left turn has the left wing down');
  const right = aircraftPose(a, -1);
  assert.ok(attitude(right).leftWing.z > 0.8, 'a right turn has the right wing down');
  const level = aircraftPose({ ...a, bankDeg: 0 }, 1);
  near(attitude(level).leftWing.z, 0);
});

test('an aircraft is at least its real length, and at least MIN_PLANE_PX long on screen', () => {
  assert.equal(planeLengthFt(2000), T6_LENGTH_FT); // 2 px per foot: real size is already big enough
  assert.equal(planeLengthFt(10), MIN_PLANE_PX / 0.01); // zoomed out: drawn bigger so it can be seen
  for (const zoom of [1, 5, 20, 100, 400]) {
    const onScreenPx = (planeLengthFt(zoom) * zoom) / 1000;
    assert.ok(onScreenPx >= MIN_PLANE_PX - 1e-9 || planeLengthFt(zoom) === T6_LENGTH_FT, `zoom ${zoom}`);
  }
});

test('fitCamera shows the whole box, behind Lead, whichever way Lead flies', () => {
  const bounds = { minX: -3000, minY: -9000, maxX: 21000, maxY: 4000 };
  for (const headingDeg of [0, 45, 90, 200]) {
    const { center, camera } = fitCamera(bounds, SIZE, headingDeg * DEG);
    near(camera.yawDeg, yawBehind(headingDeg * DEG));
    for (const x of [bounds.minX, bounds.maxX]) {
      for (const y of [bounds.minY, bounds.maxY]) {
        const p = screenOf(camera, center, { x, y });
        assert.ok(p.x >= 0 && p.x <= SIZE.width && p.y >= 0 && p.y <= SIZE.height, `${headingDeg}: (${x}, ${y}) is at ${p.x}, ${p.y}`);
      }
    }
  }
});
