// Checks: from the front seat's eye, head straight ahead, in level flight at 200 KIAS the horizon splits the windscreen
// half and half: half ground, half sky between the glareshield's rim and the forward canopy bow over the student. Also
// still true: the bow is above the eye's level line and the glareshield below it.
// Serves: the Formation Sim's CT-156 cockpit (docs/modules/turn-sim/plan.md, "Formation sight pictures true to the
// manuals"; TS-156).
// Expected values: AETCMAN 11-248 (13 Aug 2025), Fig 2.7 "Straight-and-level Flight", p.42: level flight at 200 KIAS
// shows half ground, half sky. The pitch is the sim's own attitude (core attitudeDegFromClimb), not the code under test.
// Margin: the horizon within the middle 20 % of the windscreen's height (40 % to 60 % up), not the shared ±5°: "half"
// is a pilot's eyeball call off a picture, and the whole windscreen is only about 15° tall. Pure geometry, no WebGL.

import test from 'node:test';
import assert from 'node:assert/strict';
import { windscreenFrom, EYE_FT } from '../../../src/ui-kit/ct156-cockpit.js';
import { attitudeDegFromClimb } from '../../../src/core/t6-performance.js';

const KT_TO_FTPS = 6076.12 / 3600;

test('level flight at 200 KIAS: the horizon splits the windscreen half and half (AETCMAN 11-248 Fig 2.7, p.42)', () => {
  const pitchDeg = attitudeDegFromClimb(0, 200 * KT_TO_FTPS, 200, 1);
  const { topDeg, bottomDeg, heightDeg } = windscreenFrom(EYE_FT, 'front');
  assert.ok(topDeg > 0, `the forward bow's lower edge is ${topDeg.toFixed(1)}° from the eye line, wanted above it`);
  assert.ok(bottomDeg < 0, `the glareshield's rim is ${bottomDeg.toFixed(1)}° from the eye line, wanted below it`);
  // The horizon sits at minus the pitch attitude from the eye's level line along the nose.
  const upTheWindscreen = (-pitchDeg - bottomDeg) / heightDeg;
  assert.ok(upTheWindscreen > 0.4 && upTheWindscreen < 0.6,
    `the horizon is ${(upTheWindscreen * 100).toFixed(0)} % up the windscreen (${bottomDeg.toFixed(1)}° to ${topDeg.toFixed(1)}°, pitch ${pitchDeg.toFixed(1)}°), wanted about half (40 % to 60 %)`);
});
