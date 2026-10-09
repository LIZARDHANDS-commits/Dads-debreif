import test from 'node:test';
import assert from 'node:assert/strict';
import { POV, HEAD } from '../../../src/modules/turn-fight/view3d.js';
import { EYES_FT } from '../../../src/ui-kit/ct156-cockpit.js';

test('turn-fight view3d: cockpit perspective camera nearInsideFt accommodates CT-156 cockpit interior', () => {
  assert.equal(POV.nearInsideFt, 0.5);
  assert.equal(HEAD.pitchDeg[0], -85);
  assert.equal(HEAD.pitchDeg[1], 80);
  assert.ok(EYES_FT.front.z > 0);
});
