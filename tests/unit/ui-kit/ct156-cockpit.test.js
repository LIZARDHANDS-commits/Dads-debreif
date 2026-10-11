// Checks: from the front seat's eye, head straight ahead, in level flight at 220 KIAS the horizon sits about a quarter of
// the way up the windscreen (between the glareshield's rail and the forward canopy bow), and the spinner's top is
// below the rail, hidden under the cowl. Also still true: the bow is above the eye's level line and the rail below it.
// Serves: the CT-156 cockpit view in Traffic, Formation and Turn Fight (ALL-31; TS-156).
// Expected values: SMM ch.3, the "Approximate 220 KIAS Pitch Attitude" figure (the horizon about a quarter up the
// windscreen), with the eye, bow and nose from the T-6A-1 side drawing (NFTC 133-590008-3, side view with crew; cited
// only). The pitch is the sim's own attitude (core attitudeDegFromClimb), not the code under test.
// Margin: the horizon 15 % to 40 % up the windscreen (Patrick's ruling, ALL-31), not the shared ±5°: "a quarter" is a
// pilot's eyeball call off a sketch, and the windscreen is about 25° tall. Pure geometry, no WebGL.

import test from 'node:test';
import assert from 'node:assert/strict';
import { windscreenFrom, EYE_FT, CT156_FT_PER_UNIT } from '../../../src/ui-kit/ct156-cockpit.js';
import { ct156SpinnerProfile } from '../../../src/ui-kit/ct156-model.js';
import { attitudeDegFromClimb } from '../../../src/core/t6-performance.js';

const KT_TO_FTPS = 6076.12 / 3600;
const deg = (r) => (r * 180) / Math.PI;

test('level at 220 KIAS: the horizon a quarter up the windscreen and the spinner under the rail (SMM ch.3, T-6A-1 side drawing)', () => {
  const pitchDeg = attitudeDegFromClimb(0, 220 * KT_TO_FTPS, 220, 1);
  const { topDeg, bottomDeg, heightDeg } = windscreenFrom(EYE_FT, 'front');
  assert.ok(topDeg > 0, `the forward bow's lower edge is ${topDeg.toFixed(1)}° from the eye line, wanted above it`);
  assert.ok(bottomDeg < 0, `the glareshield's rail is ${bottomDeg.toFixed(1)}° from the eye line, wanted below it`);
  // The horizon sits at minus the pitch attitude from the eye's level line along the nose.
  const upTheWindscreen = (-pitchDeg - bottomDeg) / heightDeg;
  assert.ok(upTheWindscreen >= 0.15 && upTheWindscreen <= 0.4,
    `the horizon is ${(upTheWindscreen * 100).toFixed(0)} % up the windscreen (${bottomDeg.toFixed(1)}° to ${topDeg.toFixed(1)}°, pitch ${pitchDeg.toFixed(1)}°), wanted about a quarter (15 % to 40 %)`);
  // The spinner's top as seen from the eye: the highest sight line to its outline.
  const F = CT156_FT_PER_UNIT;
  const spinnerTopDeg = Math.max(...ct156SpinnerProfile(48).map(([x, r]) => deg(Math.atan2(r * F - EYE_FT.z, x * F - EYE_FT.x))));
  assert.ok(spinnerTopDeg < bottomDeg, `the spinner's top is ${spinnerTopDeg.toFixed(2)}° from the eye line, the rail ${bottomDeg.toFixed(2)}°: wanted the spinner below the rail`);
});
