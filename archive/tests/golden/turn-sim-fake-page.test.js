// Golden test (R9): the fake page drives V6's own speedfps, baseG and turnRadius
// (Turn Sim lines 785 to 789) from a settings object to the numbers the page gives.
import test from 'node:test';
import assert from 'node:assert/strict';
import { V6_DEFAULTS } from '../../src/modules/turn-sim/settings.js';
import { ktToFtps } from '../../src/core/units.js';
import { limitG, turnRadiusFt, turnRateRadPerSec, bankDegFromG } from '../../src/core/flight-math.js';
import { createV6Page, fakeDollar } from './turn-sim-fake-page.js';
import { spread } from './inputs.js';

test("at V6's defaults: 220 kt is 371.31 ft/s, G 2, radius 2,474 ft (the numbers V6's page shows)", () => {
  const { v6 } = createV6Page(V6_DEFAULTS);
  assert.equal(v6.speedfps(), 220 * 1.68781);
  assert.equal(v6.baseG(), 2);
  assert.equal(Math.round(v6.turnRadius(v6.speedfps(), v6.baseG())), 2474);
  assert.equal(v6.bankFromG(v6.baseG()), bankDegFromG(2));
});

test("V6's speedfps, baseG, turnRadius and turnRate through the fake match core, for many settings", () => {
  const kts = [1, 100, 150, 220, 300, ...spread(20, 50, 400, 3)];
  const gs = [1, 1.01, 1.5, 2, 3, 4.5, 7, 9, 12, ...spread(20, 1.01, 9, 4), 0.2, -1];
  for (const speedKt of kts) {
    for (const baseG of gs) {
      const { v6 } = createV6Page({ ...V6_DEFAULTS, speedKt, baseG });
      const v = v6.speedfps();
      assert.equal(v, ktToFtps(speedKt), `kt=${speedKt}`);
      assert.equal(v6.baseG(), limitG(baseG), `g=${baseG}`);
      assert.equal(v6.turnRadius(v, v6.baseG()), turnRadiusFt(v, limitG(baseG)));
      assert.equal(v6.turnRate(v, v6.baseG()), turnRateRadPerSec(v, limitG(baseG)));
    }
  }
});

test('the fake answers like the page: text values, and null for a box V6 does not have', () => {
  const $ = fakeDollar({ ...V6_DEFAULTS, clockCuePos: 5.5, showNm: false });
  assert.equal($('speed').value, '220');
  assert.equal($('clockCuePos').value, '5.5');
  assert.equal($('clockCuePos').options[$('clockCuePos').selectedIndex].text, '5:30');
  assert.equal($('showNm').value, 'no');
  assert.equal($('noSuchBox'), null);
  // V6 line 1487 reads `+$('clockCueTol')` (the box, not its value): NaN, so V6 always used 4 degrees (issue #32).
  assert.ok(Number.isNaN(+$('clockCueTol')));
});
