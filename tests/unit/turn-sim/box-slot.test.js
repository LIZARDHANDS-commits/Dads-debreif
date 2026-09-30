// The offset box's default rear timing (audit R1): each rear aircraft's delay is solved so it ends boxAftFt behind the front
// element in its box slot (#3 between Lead and #2, #4 outside #2), in both turn directions. The fixed 12.5 s rear delay
// ('rearDelay') left the box collapsed in a turn toward #2's side (right Delayed 90: #3 1,141 ft aft, #4 583 ft aft between
// Lead and #2).
//
// Why 500 ft: the start positions are boxAftFt aft in a box that is 3,000 ft between the front pair's midpoint and #3 and 3,000 ft
// outside #2 for #4, and the delay is the only control (it slides an aircraft along its old heading), so the solve is the least
// squares fit of one delay to two coordinates; at the default box the fit is exact and what is left is the Euler step (about 20 ft)
// and the turn using the step's end heading, so 500 ft is generous but still fails a collapsed box.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS } from '../../../src/modules/turn-sim/settings.js';
import { createRun } from '../../../src/modules/turn-sim/engine/run.js';

const BASE = { ...DEFAULTS, formation: 'offsetBox', startHeadingDeg: 0, durationSec: 250, timing: 'time' };
const AFT_TOLERANCE_FT = 500;

function fly(settings) {
  const run = createRun(settings);
  const pairMinFt = {};
  while (run.step()) {
    const a = run.state.aircraft;
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) pairMinFt[`${i + 1}-${j + 1}`] = Math.min(pairMinFt[`${i + 1}-${j + 1}`] ?? Infinity, Math.hypot(a[i].xFt - a[j].xFt, a[i].yFt - a[j].yFt));
  }
  const p = Object.fromEntries(run.state.aircraft.map((a) => [a.id, a]));
  const h = p[1].headingRad;
  // Lead's final heading: ahead along it, left of it.
  const at = (a, b) => ({ ahead: (a.xFt - b.xFt) * Math.cos(h) + (a.yFt - b.yFt) * Math.sin(h), left: -(a.xFt - b.xFt) * Math.sin(h) + (a.yFt - b.yFt) * Math.cos(h) });
  const mid = { xFt: (p[1].xFt + p[2].xFt) / 2, yFt: (p[1].yFt + p[2].yFt) / 2 };
  return { run, p, pairMinFt, one: at(p[1], p[1]), two: at(p[2], p[1]), three: at(p[3], mid), four: at(p[4], p[2]), threeLead: at(p[3], p[1]) };
}

test('#3 and #4 end boxAftFt behind the front element in their slots: delayed 90 and delayed 45, both directions', () => {
  for (const [maneuver, turnDeg] of [['delayed90away', 90], ['delayed45away', 45]]) {
    for (const direction of ['right', 'left']) {
      const label = `${maneuver} ${direction}`;
      const { p, three, four, two } = fly({ ...BASE, maneuver, turnDeg, direction });
      const h = p[1].headingRad;
      // Slot order across Lead's final heading: #3 between Lead and #2, #4 beyond #2.
      const lateral = (a) => -(a.xFt - p[1].xFt) * Math.sin(h) + (a.yFt - p[1].yFt) * Math.cos(h);
      const sign = Math.sign(lateral(p[2]));
      assert.ok(lateral(p[3]) * sign > 0 && lateral(p[3]) * sign < lateral(p[2]) * sign, `${label}: #3 between Lead and #2 (${lateral(p[3]).toFixed(0)})`);
      assert.ok(lateral(p[4]) * sign > lateral(p[2]) * sign, `${label}: #4 outside #2 (${lateral(p[4]).toFixed(0)})`);
      assert.ok(Math.abs(-three.ahead - DEFAULTS.boxAftFt) < AFT_TOLERANCE_FT, `${label}: #3 ${(-three.ahead).toFixed(0)} ft aft of the front pair, want ${DEFAULTS.boxAftFt}`);
      assert.ok(Math.abs(-four.ahead - DEFAULTS.boxAftFt) < AFT_TOLERANCE_FT, `${label}: #4 ${(-four.ahead).toFixed(0)} ft aft of #2, want ${DEFAULTS.boxAftFt}`);
      assert.ok(Math.abs(two.ahead) < 300, `${label}: the front pair abreast`);
    }
  }
});

test('the hook in the box: the rear element trails boxAftFt behind (delay about boxAftFt / speed), and no pair but the designed crossing passes within 1,000 ft', () => {
  for (const direction of ['right', 'left']) {
    const { run, p, three, four, pairMinFt } = fly({ ...BASE, maneuver: 'hook90', turnDeg: 180, direction });
    assert.ok(Math.abs(-three.ahead - DEFAULTS.boxAftFt) < AFT_TOLERANCE_FT, `hook ${direction}: #3 ${(-three.ahead).toFixed(0)} ft aft`);
    assert.ok(Math.abs(-four.ahead - DEFAULTS.boxAftFt) < AFT_TOLERANCE_FT, `hook ${direction}: #4 ${(-four.ahead).toFixed(0)} ft aft`);
    // The designed crossing: at 3 G the hook's diameter is 3,030 ft, and the rear aircraft starts 3,000 ft to the side of the front
    // aircraft whose outbound leg it flies inbound to, so the two pass nose to nose about 30 ft apart whatever the delay (right
    // hook: #3 with Lead and #4 with #2; left hook: #3 with #2). The box is an altitude-separated formation, and the screen says so.
    const crossing = direction === 'right' ? ['1-3', '2-4'] : ['2-3'];
    for (const [pair, ft] of Object.entries(pairMinFt)) {
      if (!crossing.includes(pair)) assert.ok(ft >= 1000, `hook ${direction}: #${pair} passes ${ft.toFixed(0)} ft apart`);
    }
    const expected = DEFAULTS.boxAftFt / (DEFAULTS.speedKt * 1.68781);
    assert.ok(Math.abs(run.state.offsetBox.rear[0].delaySec - expected) < 0.5, `hook ${direction}: delay ${run.state.offsetBox.rear[0].delaySec} vs ${expected.toFixed(1)}`);
    assert.ok(p[3] && p[4]);
  }
});

test('the delays outside 10 to 15 s are flagged, not hidden (a right Delayed 90 needs about 27 s for #3)', () => {
  const run = createRun({ ...BASE, maneuver: 'delayed90away', turnDeg: 90, direction: 'right' });
  assert.ok(run.state.offsetBox.rear.some((r) => r.outsideBand));
});

test('\'rearDelay\' (the fixed rearDelaySec) is still a choice, and \'boxSlot\' is the default', () => {
  assert.equal(DEFAULTS.offsetBox4Timing, 'boxSlot');
  const run = createRun({ ...BASE, maneuver: 'delayed90away', turnDeg: 90, direction: 'right', offsetBox4Timing: 'rearDelay' });
  assert.deepEqual(run.state.offsetBox.rear.map((r) => r.delaySec), [12.5, 12.5]);
});

test('the clock cue in the box: the rear fallback uses the box slot shift, so #3 and #4 still end boxAftFt behind in their slots, both directions', () => {
  for (const [maneuver, turnDeg] of [['delayed90away', 90], ['hook90', 180]]) {
    for (const direction of ['right', 'left']) {
      const label = `clock ${maneuver} ${direction}`;
      const { run, p, three, four } = fly({ ...BASE, timing: 'clock', clockCuePos: 'auto', maneuver, turnDeg, direction });
      assert.equal(run.state.turnComplete, true, `${label}: all turned`);
      const h = p[1].headingRad;
      const lateral = (a) => -(a.xFt - p[1].xFt) * Math.sin(h) + (a.yFt - p[1].yFt) * Math.cos(h);
      const sign = Math.sign(lateral(p[2]));
      assert.ok(lateral(p[3]) * sign > 0 && lateral(p[3]) * sign < lateral(p[2]) * sign, `${label}: #3 between Lead and #2`);
      assert.ok(lateral(p[4]) * sign > lateral(p[2]) * sign, `${label}: #4 outside #2`);
      assert.ok(Math.abs(-three.ahead - DEFAULTS.boxAftFt) < AFT_TOLERANCE_FT, `${label}: #3 ${(-three.ahead).toFixed(0)} ft aft`);
      assert.ok(Math.abs(-four.ahead - DEFAULTS.boxAftFt) < AFT_TOLERANCE_FT, `${label}: #4 ${(-four.ahead).toFixed(0)} ft aft`);
    }
  }
});

test('under the clock cue the fixed rearDelay is still there as a choice: #3 turns rearDelaySec after #1', () => {
  const run = createRun({ ...BASE, timing: 'clock', clockCuePos: 'auto', maneuver: 'delayed90away', turnDeg: 90, direction: 'right', offsetBox4Timing: 'rearDelay' });
  const at = {};
  while (run.step()) for (const a of run.state.aircraft) if (a.turning && at[a.id] === undefined) at[a.id] = run.state.tSec;
  assert.ok(Math.abs(at[3] - at[1] - 12.5) < 0.11, JSON.stringify(at));
});

test('state.crossings lists the pairs that pass under 300 ft, known before the first step: the box hook has them, the delayed 90 does not', () => {
  const near = (direction) => createRun({ ...BASE, maneuver: 'hook90', turnDeg: 180, direction }).state.crossings;
  const key = (list) => list.map((c) => `${c.a}-${c.b}`).sort();
  assert.deepEqual(key(near('right')), ['1-3', '2-4']);
  assert.deepEqual(key(near('left')), ['2-3']);
  for (const c of near('right')) assert.ok(c.minFt < 300 && c.minFt > 0, `${c.minFt}`);
  assert.deepEqual(createRun({ ...BASE, maneuver: 'delayed90away', turnDeg: 90, direction: 'right' }).state.crossings, []);
  const run = createRun({ ...BASE, maneuver: 'hook90', turnDeg: 180, direction: 'right' });
  while (run.step());
  assert.deepEqual(key(run.state.crossings), ['1-3', '2-4'], 'and after the run');
});

test('the band is read as Fig 16.30 does: #3 from the later front start, #4 from #3\'s start (default readings, both directions)', () => {
  // [#3, #4] at the defaults. Delayed 90: #3 is 10.9 s after the later front start in both directions, inside the band; #4 turns as
  // far after #3 as #2 does after #1 (the LAB cue), 16.1 s to the right, and before it (-16.1 s) to the left, where the outside aircraft goes first.
  // Delayed 45 waits 38.6 s between the front pair, so #4 reads about 38.5 s from #3. The hook's rear element turns together, 18.9 s after the front.
  const readings = { 'delayed90away right': [10.9, 16.1], 'delayed90away left': [10.9, -16.1], 'delayed45away right': [-0.5, 38.8], 'delayed45away left': [-0.5, -38.2], 'hook90 right': [18.9, 18.9], 'hook90 left': [18.9, 18.9] };
  for (const [key, want] of Object.entries(readings)) {
    const [maneuver, direction] = key.split(' ');
    const run = createRun({ ...BASE, maneuver, turnDeg: maneuver === 'delayed90away' ? 90 : maneuver === 'delayed45away' ? 45 : 180, direction });
    const got = run.state.offsetBox.rear.map((r) => r.delaySec);
    assert.ok(Math.abs(got[0] - want[0]) < 0.3 && Math.abs(got[1] - want[1]) < 0.3, `${key}: ${got.map((x) => x.toFixed(1))} vs ${want}`);
    const band = run.state.offsetBox.rear.map((r) => r.outsideBand);
    assert.deepEqual(band, got.map((x) => x < 10 || x > 15), `${key}: the flag follows the reading`);
  }
  // The measured times are the flown ones.
  const run = createRun({ ...BASE, maneuver: 'delayed90away', turnDeg: 90, direction: 'right' });
  const started = {};
  while (run.step()) for (const a of run.state.aircraft) if (a.turning && started[a.id] === undefined) started[a.id] = run.state.tSec;
  const [three, four] = createRun({ ...BASE, maneuver: 'delayed90away', turnDeg: 90, direction: 'right' }).state.offsetBox.rear.map((r) => r.delaySec);
  assert.ok(Math.abs(started[3] - Math.max(started[1], started[2]) - three) < 0.11 && Math.abs(started[4] - started[3] - four) < 0.11);
});

test('state.crossings is worked out only when read (a preview run is a whole run), and gives the same answer each time', () => {
  const run = createRun({ ...BASE, maneuver: 'hook90', turnDeg: 180, direction: 'right' });
  assert.equal(typeof Object.getOwnPropertyDescriptor(run.state, 'crossings').get, 'function');
  assert.deepEqual(run.state.crossings, run.state.crossings);
  run.reset();
  assert.equal(run.state.crossings.length, 2);
});
