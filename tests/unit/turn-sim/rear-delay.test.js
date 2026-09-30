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

test('the rear element flies the front element\'s turn shifted by 12.5 s: #3 after #1, #4 after #2, in both directions, delayed 90 and 45', () => {
  for (const [maneuver, turnDeg, second] of [['delayed90away', 90, 16], ['delayed45away', 45, 38.6]]) {
    for (const direction of ['right', 'left']) {
      const at = starts({ ...BASE, maneuver, turnDeg, direction });
      const label = `${maneuver} ${direction}`;
      assert.ok(Math.min(at[1], at[2]) < 0.1 && Math.abs(Math.max(at[1], at[2]) - second) < 0.2, `${label}: front element ${JSON.stringify(at)}`);
      for (const [rear, front] of [[3, 1], [4, 2]]) {
        assert.ok(at[rear] >= at[front], `${label}: #${rear} does not start before #${front}`);
        const gap = at[rear] - at[front];
        assert.ok(gap >= 10 && gap <= 15 && Math.abs(gap - 12.5) < 0.1, `${label}: #${rear} starts ${gap.toFixed(2)} s after #${front}`);
      }
      // #4 turns on the standard LAB cue from #3: as far after #3 as #2 is after #1 (before it in a left turn).
      assert.ok(Math.abs((at[4] - at[3]) - (at[2] - at[1])) < 0.11, `${label}: #4 - #3 = #2 - #1`);
    }
  }
});

test('the end state: #3 and #4 line abreast of each other at the front element\'s spacing, behind the front element', () => {
  const report = [];
  for (const [maneuver, turnDeg, tolerance] of [['delayed90away', 90, 300], ['delayed45away', 45, 600]]) {
    for (const direction of ['right', 'left']) {
      const run = createRun({ ...BASE, maneuver, turnDeg, direction });
      while (run.step());
      const p = Object.fromEntries(run.state.aircraft.map((a) => [a.id, a]));
      const h = p[1].headingRad;
      const frame = (a, b) => ({ ahead: (a.xFt - b.xFt) * Math.cos(h) + (a.yFt - b.yFt) * Math.sin(h), left: -(a.xFt - b.xFt) * Math.sin(h) + (a.yFt - b.yFt) * Math.cos(h) });
      const frontSpacing = Math.abs(frame(p[2], p[1]).left);
      const rearSpacing = Math.abs(frame(p[4], p[3]).left);
      const abreast = Math.abs(frame(p[4], p[3]).ahead);
      const aft = -(frame(p[3], p[1]).ahead + frame(p[4], p[1]).ahead) / 2;
      const label = `${maneuver} ${direction}`;
      assert.ok(Math.abs(rearSpacing - frontSpacing) < tolerance, `${label}: rear spacing ${rearSpacing.toFixed(0)} vs front ${frontSpacing.toFixed(0)}`);
      assert.ok(abreast < 700, `${label}: #3 and #4 ${abreast.toFixed(0)} ft apart fore and aft`);
      assert.ok(frame(p[3], p[1]).ahead < 0 && frame(p[4], p[1]).ahead < 0, `${label}: behind Lead`);
      report.push(`${label}: aft ${aft.toFixed(0)} ft, rear spacing ${rearSpacing.toFixed(0)}, front ${frontSpacing.toFixed(0)}`);
    }
  }
  // The aft distance is short of the box's 7,000 ft: 12.5 s is under 7,000 ft / 371 fps = 18.9 s. Kept here for the record.
  assert.equal(report.length, 4);
});

test('the delay is the rearDelaySec setting, and the band check follows it', () => {
  for (const rearDelaySec of [10, 12.5, 15, 20, 5]) {
    const run = createRun({ ...BASE, maneuver: 'delayed90away', turnDeg: 90, direction: 'right', rearDelaySec });
    assert.deepEqual(run.state.offsetBox.rear.map((r) => r.delaySec), [rearDelaySec, rearDelaySec]);
    const out = rearDelaySec < 10 || rearDelaySec > 15;
    assert.deepEqual(run.state.offsetBox.rear.map((r) => r.outsideBand), [out, out]);
    const at = starts({ ...BASE, maneuver: 'delayed90away', turnDeg: 90, direction: 'right', rearDelaySec });
    assert.ok(Math.abs(at[3] - at[1] - rearDelaySec) < 0.11 && Math.abs(at[4] - at[2] - rearDelaySec) < 0.11, `${rearDelaySec}: ${JSON.stringify(at)}`);
  }
});

test('the clock cue in the offset box: #3 and #4 cannot see the cue, so they fall back to the rear delay and still turn', () => {
  for (const direction of ['right', 'left']) {
    for (const clockCuePos of ['auto', 5.5]) {
      const run = createRun({ ...BASE, timing: 'clock', clockCuePos, maneuver: 'delayed90away', turnDeg: 90, direction });
      assert.deepEqual(run.state.aircraft.map((a) => a.cue.cantSee), [false, false, true, true], 'the warning says why');
      const at = {};
      while (run.step()) for (const a of run.state.aircraft) if (a.turning && at[a.id] === undefined) at[a.id] = run.state.tSec;
      assert.equal(run.state.turnComplete, true, `${direction} ${clockCuePos}: all four turned`);
      assert.ok(Math.abs(at[3] - at[1] - 12.5) < 0.11 && Math.abs(at[4] - at[2] - 12.5) < 0.11, `${direction} ${clockCuePos}: ${JSON.stringify(at)}`);
    }
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
