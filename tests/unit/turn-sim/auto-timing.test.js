// Auto timing, stated in plain facts (the golden run test pins the flying to V6).
import test from 'node:test';
import assert from 'node:assert/strict';
import { V6_DEFAULTS, DEFAULTS } from '../../../src/modules/turn-sim/settings.js';
import { createRun } from '../../../src/modules/turn-sim/engine/run.js';

const V6 = { ...V6_DEFAULTS, timing: 'auto', delayed45Check: 'none' };

/** The time each aircraft first turns, by id. */
function startTimes(settings) {
  const run = createRun(settings);
  const first = {};
  while (run.step()) for (const a of run.state.aircraft) if (a.turning && first[a.id] === undefined) first[a.id] = run.state.tSec;
  return { first, run };
}

test('D43: with auto timing the outside aircraft turns first and each follows at its own time, without waiting for Lead', () => {
  const { first, run } = startTimes({ ...V6, durationSec: 200 });
  const step = run.state.autoStepSec;
  // 4312 turning right: #2 is outside, then Lead, #3, #4, one step apart.
  assert.ok(first[2] < 0.1, `#2 starts at once, not when Lead starts: ${first[2]}`);
  for (const [id, n] of [[1, 1], [3, 2], [4, 3]]) assert.ok(Math.abs(first[id] - n * step) < 0.1, `#${id} ${first[id]} vs ${n * step}`);
});

test('the auto step is shown in state and never written into Base delay', () => {
  const settings = { ...V6, baseDelaySec: 7 };
  const run = createRun(settings);
  assert.ok(run.state.autoStepSec > 0); // known before Play, for the screen to show
  const before = run.state.autoStepSec;
  run.step();
  assert.equal(run.state.autoStepSec, before);
  assert.equal(settings.baseDelaySec, 7);
  // Base delay itself has no effect on auto timing.
  const other = createRun({ ...settings, baseDelaySec: 30 });
  assert.equal(other.state.autoStepSec, run.state.autoStepSec);
});

test('the step is only there for a delayed turn with Timing = auto', () => {
  for (const [timing, maneuver] of [['time', 'delayed90away'], ['auto', 'hook90'], ['auto', 'inplace90']]) {
    const run = createRun({ ...V6, timing, maneuver });
    assert.equal(run.state.autoStepSec, null, `${timing} ${maneuver}`);
    run.step();
    assert.equal(run.state.autoStepSec, null, `${timing} ${maneuver}`);
  }
  assert.ok(DEFAULTS.timing === 'time');
});

test('D44: at V6\'s defaults the step is 16.16 s (V6 gave 25.4 s), and it is spacing / speed x cot(half the turn)', () => {
  const run = createRun(V6);
  run.step();
  const v = 220 * 1.68781;
  assert.ok(Math.abs(run.state.autoStepSec - 16.16) < 0.005, `${run.state.autoStepSec}`);
  assert.equal(run.state.autoStepSec, (6000 / v) / Math.tan(Math.PI / 4));
  // A 45° turn needs a longer step: cot(22.5°) is about 2.414 times bigger.
  const forty = createRun({ ...V6, maneuver: 'delayed45away', turnDeg: 45 });
  forty.step();
  assert.ok(Math.abs(forty.state.autoStepSec / run.state.autoStepSec - 2.41421) < 1e-4);
});

test('D44: auto timing rolls the formation out line abreast at 6,000 ft, within 30 ft (the Euler step\'s own error)', () => {
  // The tolerance is small but not zero: V6 flies in 0.05 s straight steps, and each aircraft's turn ends within
  // 0.0001 rad of its goal, which is a few feet at a 2,474 ft radius; the worst case measured is about 16 ft.
  for (const formation of ['weighted', 'weightedReverse', 'twoShip']) {
    for (const [maneuver, turnDeg] of [['delayed90away', 90], ['delayed45away', 45]]) {
      for (const direction of ['right', 'left']) {
        const label = `${formation} ${maneuver} ${direction}`;
        const run = createRun({ ...V6, formation, maneuver, turnDeg, direction, durationSec: 250 });
        while (run.step());
        assert.equal(run.state.turnComplete, true, label);
        const ac = run.state.aircraft;
        const h = ac[0].headingRad;
        const side = (a) => a.xFt * Math.cos(h + Math.PI / 2) + a.yFt * Math.sin(h + Math.PI / 2);
        const ahead = (a) => a.xFt * Math.cos(h) + a.yFt * Math.sin(h);
        const across = [...ac].sort((a, b) => side(a) - side(b));
        for (let i = 1; i < across.length; i++) {
          assert.ok(Math.abs(side(across[i]) - side(across[i - 1]) - 6000) < 30, `${label}: spacing ${side(across[i]) - side(across[i - 1])}`);
        }
        for (const a of ac) assert.ok(Math.abs(ahead(a) - ahead(ac[0])) < 30, `${label}: #${a.id} fore/aft ${ahead(a) - ahead(ac[0])}`);
      }
    }
  }
});

test('the step follows the settings: more speed shortens it, more spacing lengthens it, and Base delay leaves it alone', () => {
  const step = (over) => { const r = createRun({ ...V6, ...over }); r.step(); return r.state.autoStepSec; };
  assert.ok(step({ speedKt: 300 }) < step({}));
  assert.ok(step({ spacingFt: 9000 }) > step({}));
  assert.equal(step({ baseDelaySec: 3 }), step({}));
  assert.ok(Number.isFinite(step({ turnDeg: 180 })) && step({ turnDeg: 180 }) >= 0);
});
