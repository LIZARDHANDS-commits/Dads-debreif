import test from 'node:test';
import assert from 'node:assert/strict';
import { PERSPECTIVE, HEAD_LOOK_DEG } from '../../../src/modules/traffic/view3d.js';
import { EYES_FT } from '../../../src/ui-kit/ct156-cockpit.js';

test('traffic view3d: cockpit perspective camera nearInsideFt accommodates CT-156 cockpit interior', () => {
  assert.equal(PERSPECTIVE.nearInsideFt, 0.5);
  assert.equal(HEAD_LOOK_DEG.pitch[0], -85);
  assert.equal(HEAD_LOOK_DEG.pitch[1], 80);
  assert.ok(EYES_FT.front.z > 0);
});
