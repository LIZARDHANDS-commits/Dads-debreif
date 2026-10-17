// Checks: a second aircraft's performance set (the CT-102B Astra II) is held to its own stall line, not the T-6A's:
//   a 30° level turn at 90 KIAS is inside the Astra's stall line and past the T-6A's.
// Serves: TR-R36 (the Astra flies its own pattern at its own numbers; spec 4.19), plan Step 5c Phase 1.
// Expected values: standard aerodynamics worked here (G in a level turn = 1 ÷ cos bank; the most G the wing gives =
//   (KIAS ÷ 1 G stall speed)²); the Astra's 68 KIAS stall is spec 4.19's working value (an estimate), the T-6A's
//   86 KIAS is Patrick's (30 Sep 2026, SH-25); 30° and 90 KIAS are Patrick's bank and Dad's perch speed (TR-155, TR-156).
//   Nothing is read back from the code as an expected value.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CT102B_PERFORMANCE } from '../../../src/core/ct102b-performance.js';
import { T6A_PERFORMANCE } from '../../../src/core/t6-performance.js';

test("A 30° level turn at 90 knots is inside the Astra's stall line but not the T-6's", () => {
  const kias = 90;                                // Dad's Astra perch speed (TR-156), indicated
  const turnG = 1 / Math.cos(30 * Math.PI / 180); // a 30° level turn needs 1.155 G (Patrick's 30°, TR-155)
  const astraG = (kias / 68) ** 2;                // the Astra's wing at 90 KIAS: 1.75 G (68 KIAS stall, an estimate)
  const t6G = (kias / 86) ** 2;                   // the T-6A's wing at 90 KIAS: 1.10 G (86 KIAS stall, Patrick)

  // The worked answers themselves say the turn fits the Astra and not the T-6A, so the check below can fail.
  assert.ok(astraG > turnG && t6G < turnG, 'worked by hand: 1.75 G > 1.155 G > 1.10 G');

  // Each set gives its own aircraft's stall line at 90 KIAS (±0.01 G: these are one formula, so only rounding apart).
  assert.ok(Math.abs(CT102B_PERFORMANCE.availableG(kias) - astraG) < 0.01, `Astra: ${CT102B_PERFORMANCE.availableG(kias)} G, expected ${astraG.toFixed(3)}`);
  assert.ok(Math.abs(T6A_PERFORMANCE.availableG(kias) - t6G) < 0.01, `T-6A: ${T6A_PERFORMANCE.availableG(kias)} G, expected ${t6G.toFixed(3)}`);

  // So the Astra can fly the 30° turn at 90 KIAS and the T-6A cannot.
  assert.ok(CT102B_PERFORMANCE.availableG(kias) > turnG, 'the Astra has the G for a 30° turn at 90 KIAS');
  assert.ok(T6A_PERFORMANCE.availableG(kias) < turnG, 'the T-6A is past its stall line in a 30° turn at 90 KIAS');
});
