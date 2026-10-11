import test from 'node:test';
import assert from 'node:assert/strict';
import {
  POV,
  HEAD,
  CAMERA_LIMITS,
  CAMERA_MOUNTS,
  CAMERA_AIMS,
  COCKPIT_SEATS,
  povOf,
  cameraForState,
  DEFAULT_CAMERA_STATE,
} from '../../../src/modules/turn-fight/view3d.js';
import { EYES_FT } from '../../../src/ui-kit/ct156-cockpit.js';

test('turn-fight camera: exports decoupled mounts, aims, and seat constants', () => {
  assert.deepEqual(CAMERA_MOUNTS, ['overview', 'chase', 'cockpit']);
  assert.deepEqual(CAMERA_AIMS, ['boresight', 'freelook', 'padlock']);
  assert.deepEqual(COCKPIT_SEATS, ['front', 'rear']);
});

test('turn-fight camera: the cockpit clips closer than outside, and the orbit stays between the horizon and overhead', () => {
  assert.ok(POV.nearInsideFt > 0 && POV.nearInsideFt < POV.nearFt, 'cockpit near clip is shorter, so the canopy frame shows');
  assert.ok(POV.fovAcrossDeg > 0 && POV.fovAcrossDeg < 180, 'a usable field of view');
  assert.ok(CAMERA_LIMITS.pitch[0] >= 0, 'orbit never goes below the horizon');
  assert.ok(CAMERA_LIMITS.pitch[1] < 90, 'orbit stops short of straight down');
});

test('turn-fight camera: default camera state is overview', () => {
  assert.deepEqual(DEFAULT_CAMERA_STATE, {
    mount: 'overview',
    who: 'blue',
    aim: 'boresight',
    seat: 'front',
  });
});

test('turn-fight camera: povOf maps decoupled states correctly', () => {
  // Overview
  assert.equal(povOf({ mount: 'overview' }), null);

  // Chase
  assert.deepEqual(povOf({ mount: 'chase', who: 'blue', aim: 'boresight' }), {
    kind: 'chase',
    who: 'blue',
    other: 'red',
    aim: 'boresight',
    seat: 'front',
  });

  // Cockpit with Padlock and Rear seat
  assert.deepEqual(povOf({ mount: 'cockpit', who: 'red', aim: 'padlock', seat: 'rear' }), {
    kind: 'cockpit',
    who: 'red',
    other: 'blue',
    aim: 'padlock',
    seat: 'rear',
  });
});

test('turn-fight camera: povOf preserves backward-compatibility with legacy string names', () => {
  assert.equal(povOf('overhead'), null);
  assert.deepEqual(povOf('blue'), { kind: 'chase', who: 'blue', other: 'red', aim: 'boresight', seat: 'front' });
  assert.deepEqual(povOf('cockpitBlue'), { kind: 'cockpit', who: 'blue', other: 'red', aim: 'boresight', seat: 'front' });
  assert.deepEqual(povOf('padlockRed'), { kind: 'padlock', who: 'red', other: 'blue', aim: 'padlock', seat: 'front' });
});

test('turn-fight camera: rear seat eye position is defined in CT-156 cockpit kit', () => {
  assert.ok(EYES_FT.rear, 'EYES_FT.rear must exist');
  assert.ok(EYES_FT.rear.z > 0, 'Rear seat eye z is positive');
  assert.ok(EYES_FT.rear.z > EYES_FT.front.z, 'Rear seat eye sits higher (+Z) than front seat');
  assert.ok(EYES_FT.rear.x < EYES_FT.front.x, 'Rear seat sits aft (-X) of front seat');
});

test('turn-fight camera: cameraForState generates appropriate camera specs', () => {
  const overviewCam = cameraForState({ mount: 'overview' });
  assert.equal(overviewCam.mode, 'fit');
  assert.equal(overviewCam.zoomAuto, true);

  const chaseCam = cameraForState({ mount: 'chase', who: 'blue' });
  assert.equal(chaseCam.mode, 'chase');
  assert.ok(chaseCam.pitchDeg >= CAMERA_LIMITS.pitch[0] && chaseCam.pitchDeg <= CAMERA_LIMITS.pitch[1], 'chase view inside the orbit limits');
  assert.equal(chaseCam.zoomAuto, false);

  const cockpitCam = cameraForState({ mount: 'cockpit', who: 'red', aim: 'padlock', seat: 'rear' });
  assert.equal(cockpitCam.mode, 'cockpit');
  assert.equal(cockpitCam.state.seat, 'rear');
  assert.equal(cockpitCam.state.aim, 'padlock');
});

