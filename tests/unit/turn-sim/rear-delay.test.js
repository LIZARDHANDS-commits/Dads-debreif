// The offset box's delayed turns, SMM 16.41 para 112a: the rear element (#3 and #4) turns rearDelaySec after the front element
// (#1 and #2) has started, 10 to 15 s (12.5 s by default), so it misses them and flows to trail. V6 chained all four a base
// delay apart (#3 at 32 s, #4 at 48 s) and, in a left turn, the solved delays sent #4 off first (6.3 s, before Lead at 16 s).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, V6_DEFAULTS } from '../../../src/modules/turn-sim/settings.js';
import { createRun } from '../../../src/modules/turn-sim/engine/run.js';

const BASE = { ...DEFAULTS, formation: 'offsetBox', startHeadingDeg: 0, durationSec: 150 };

function starts(settings) {
  const run = createRun(settings);
  const at = {};
  while (run.step()) for (const a of run.state.aircraft) if (a.turning && at[a.id] === undefined) at[a.id] = run.state.tSec;
  return at;
}

test('the rear element is the default: #3 and #4 start 12.5 s after the later front aircraft, in both directions, delayed 90 and 45', () => {
  for (const [maneuver, turnDeg, second] of [['delayed90away', 90, 16], ['delayed45away', 45, 38.6]]) {
    for (const direction of ['right', 'left']) {
      const at = starts({ ...BASE, maneuver, turnDeg, direction });
      const label = `${maneuver} ${direction}`;
      const frontFirst = Math.min(at[1], at[2]);
      const frontLast = Math.max(at[1], at[2]);
      assert.ok(frontFirst < 0.1 && Math.abs(frontLast - second) < 0.2, `${label}: front element ${JSON.stringify(at)}`);
      for (const id of [3, 4]) {
        assert.ok(at[id] >= frontLast, `${label}: #${id} does not start before its front element (${at[id]} vs ${frontLast})`);
        const gap = at[id] - frontLast;
        assert.ok(gap >= 10 && gap <= 15 && Math.abs(gap - 12.5) < 0.1, `${label}: #${id} starts ${gap.toFixed(2)} s after the front element`);
      }
    }
  }
});

test('the delay is the rearDelaySec setting, anywhere in the band, and the band check follows it', () => {
  for (const rearDelaySec of [10, 12.5, 15, 20, 5]) {
    const run = createRun({ ...BASE, maneuver: 'delayed90away', turnDeg: 90, direction: 'right', rearDelaySec });
    assert.deepEqual(run.state.offsetBox.rear.map((r) => r.delaySec), [rearDelaySec, rearDelaySec]);
    assert.deepEqual(run.state.offsetBox.rear.map((r) => r.outsideBand), [rearDelaySec < 10 || rearDelaySec > 15, rearDelaySec < 10 || rearDelaySec > 15]);
    const at = starts({ ...BASE, maneuver: 'delayed90away', turnDeg: 90, direction: 'right', rearDelaySec });
    assert.ok(Math.abs(at[3] - 16 - rearDelaySec) < 0.11 && Math.abs(at[4] - 16 - rearDelaySec) < 0.11, `${rearDelaySec}: ${JSON.stringify(at)}`);
  }
});

test('the solvers are still there as choices: V6\'s late and early, and the ground track', () => {
  for (const offsetBox4Timing of ['late', 'early', 'groundTrack']) {
    const at = starts({ ...BASE, maneuver: 'delayed90away', turnDeg: 90, direction: 'right', offsetBox4Timing });
    assert.notEqual(Math.round((at[3] - 16) * 10), 125, `${offsetBox4Timing} is not the rear delay`);
  }
  // V6's chain: with LATE the solver's #3 and #4 are a base delay (16 s) apart.
  const late = starts({ ...BASE, maneuver: 'delayed90away', turnDeg: 90, direction: 'right', offsetBox4Timing: 'late' });
  assert.ok(Math.abs(late[4] - late[3] - 16) < 0.11);
  assert.equal(V6_DEFAULTS.offsetBox4Timing, 'late');
});

test('the other presets and the clock cue are not touched by the rear delay', () => {
  const four = starts({ ...BASE, formation: 'weighted', maneuver: 'delayed90away', direction: 'right' });
  Object.values(four).sort((x, y) => x - y).forEach((t, i) => assert.ok(Math.abs(t - i * 16) < 0.3, `4312 still chains 16 s apart: ${t}`));
  assert.equal(createRun({ ...BASE, formation: 'weighted' }).state.offsetBox, null);
});
