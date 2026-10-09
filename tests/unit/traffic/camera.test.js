import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMERA_MOUNTS, OVERVIEW_PRESETS, AIM_MODES, COCKPIT_SEATS,
  DEFAULT_CAMERA_STATE, stateFromLegacy,
  RWY_29L_THRESHOLD, FREE_LOOK_DEG, freeAim,
} from '../../../src/modules/traffic/camera-views.js';
import { legacyViewFromState } from '../../../src/modules/traffic/camera-bar.js';
import { EYES_FT } from '../../../src/ui-kit/ct156-cockpit.js';

test('traffic camera: 2-tier definitions and defaults', () => {
  assert.equal(CAMERA_MOUNTS.length, 5);
  assert.deepEqual(CAMERA_MOUNTS.map((m) => m.id), ['overview', 'tower', 'free', 'chase', 'cockpit']);
  assert.deepEqual(OVERVIEW_PRESETS.map((p) => p.id), ['field', 'fit', 'high', 'top']);
  assert.ok(AIM_MODES.tower.some((a) => a.id === 'freelook'));
  assert.ok(AIM_MODES.tower.some((a) => a.id === 'track'));
  assert.ok(AIM_MODES.tower.some((a) => a.id === 'padlock'));
  assert.ok(AIM_MODES.free.some((a) => a.id === 'freelook'));
  assert.ok(AIM_MODES.free.some((a) => a.id === 'track'));
  assert.ok(AIM_MODES.free.some((a) => a.id === 'padlock'));
  assert.ok(AIM_MODES.chase.some((a) => a.id === 'boresight'));
  assert.ok(AIM_MODES.cockpit.some((a) => a.id === 'boresight'));
  assert.deepEqual(COCKPIT_SEATS.map((s) => s.id), ['front', 'rear']);
  assert.deepEqual(DEFAULT_CAMERA_STATE, {
    mount: 'overview',
    preset: 'field',
    aim: 'boresight',
    seat: 'front',
  });
});

test('traffic camera: stateFromLegacy maps all legacy views to 2-tier state', () => {
  assert.deepEqual(stateFromLegacy('field'), { mount: 'overview', preset: 'field', aim: 'boresight', seat: 'front' });
  assert.deepEqual(stateFromLegacy('fit'), { mount: 'overview', preset: 'fit', aim: 'boresight', seat: 'front' });
  assert.deepEqual(stateFromLegacy('high'), { mount: 'overview', preset: 'high', aim: 'boresight', seat: 'front' });
  assert.deepEqual(stateFromLegacy('top'), { mount: 'overview', preset: 'top', aim: 'boresight', seat: 'front' });
  assert.deepEqual(stateFromLegacy('tower', null), { mount: 'tower', preset: 'field', aim: 'freelook', seat: 'front' });
  assert.deepEqual(stateFromLegacy('tower', 'PAT1'), { mount: 'tower', preset: 'field', aim: 'track', seat: 'front' });
  assert.deepEqual(stateFromLegacy('free'), { mount: 'free', preset: 'field', aim: 'freelook', seat: 'front' });
  assert.deepEqual(stateFromLegacy('low'), { mount: 'chase', preset: 'field', aim: 'boresight', seat: 'front' });
  assert.deepEqual(stateFromLegacy('cockpit'), { mount: 'cockpit', preset: 'field', aim: 'boresight', seat: 'front' });
  assert.deepEqual(stateFromLegacy('padlock'), { mount: 'cockpit', preset: 'field', aim: 'padlock', seat: 'front' });
});

test('traffic camera: legacyViewFromState converts 2-tier state back to legacy id', () => {
  assert.equal(legacyViewFromState({ mount: 'overview', preset: 'field' }), 'field');
  assert.equal(legacyViewFromState({ mount: 'overview', preset: 'fit' }), 'fit');
  assert.equal(legacyViewFromState({ mount: 'overview', preset: 'top' }), 'top');
  assert.equal(legacyViewFromState({ mount: 'tower', aim: 'freelook' }), 'tower');
  assert.equal(legacyViewFromState({ mount: 'tower', aim: 'track' }), 'tower');
  assert.equal(legacyViewFromState({ mount: 'free', aim: 'freelook' }), 'free');
  assert.equal(legacyViewFromState({ mount: 'free', aim: 'padlock' }), 'free');
  assert.equal(legacyViewFromState({ mount: 'chase', aim: 'boresight' }), 'low');
  assert.equal(legacyViewFromState({ mount: 'chase', aim: 'padlock' }), 'padlock');
  assert.equal(legacyViewFromState({ mount: 'cockpit', aim: 'boresight' }), 'cockpit');
  assert.equal(legacyViewFromState({ mount: 'cockpit', aim: 'padlock' }), 'padlock');
});

test('traffic camera: CT-156 cockpit front and rear ejection seats geometry', () => {
  assert.ok(EYES_FT.front);
  assert.ok(EYES_FT.rear);
  assert.ok(EYES_FT.rear.z > EYES_FT.front.z, 'rear seat pilot eye is elevated above front seat');
  assert.ok(EYES_FT.rear.x < EYES_FT.front.x, 'rear seat pilot eye is aft of front seat');
  assert.equal(EYES_FT.front.y, 0, 'front seat centered on fuselage');
  assert.equal(EYES_FT.rear.y, 0, 'rear seat centered on fuselage');
});

test('traffic camera: free drone and tower padlock targeting Runway 29L', () => {
  const eye = { x: 5000, y: -6000, z: 2500 };
  const target = { x: RWY_29L_THRESHOLD.x, y: RWY_29L_THRESHOLD.y, z: RWY_29L_THRESHOLD.alt };
  const aim = freeAim(eye, target);
  assert.ok(Number.isFinite(aim.yawDeg));
  assert.ok(Number.isFinite(aim.elevDeg));
  assert.ok(aim.elevDeg >= FREE_LOOK_DEG[0] && aim.elevDeg <= FREE_LOOK_DEG[1]);
});
