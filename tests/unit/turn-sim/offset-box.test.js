// The offset box's #4 timing in plain facts. V6's LATE and EARLY are pinned to V6 in tests/golden/;
// the ground track (Q44b) is the rebuild's own, so it is stated here from the spec.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, V6_DEFAULTS } from '../../../src/modules/turn-sim/settings.js';
import { createRun, offsetBoxStatus } from '../../../src/modules/turn-sim/engine/run.js';
import { offsetBoxPlan, simulateDelayedTurnFinalPos } from '../../../src/modules/turn-sim/engine/plan.js';
import { ktToFtps } from '../../../src/core/units.js';
import { turnRadiusFt } from '../../../src/core/flight-math.js';

// The Q44b numbers were worked out with V6's 1,000 ft stagger.
const BASE = { ...DEFAULTS, offsetBox4Timing: 'rearDelay', boxStaggerFt: 1000, formation: 'offsetBox', maneuver: 'delayed90away', turnDeg: 90, baseDelaySec: 16, durationSec: 120 };
/** The ground track (Q44b) and V6's timings are choices now; the SMM's rear delay is the default (see rear-delay.test.js). */
const GT = { ...BASE, offsetBox4Timing: 'groundTrack' };
const fly = (settings) => { const run = createRun(settings); while (run.step()); return run; };

/** Everyone's final place in Lead's final frame: ft ahead of Lead and ft to Lead's left. */
function finalPlaces(run) {
  const p = Object.fromEntries(run.state.aircraft.map((a) => [a.id, a]));
  const h = p[1].headingRad;
  const at = (a) => ({ ahead: (a.xFt - p[1].xFt) * Math.cos(h) + (a.yFt - p[1].yFt) * Math.sin(h), left: -(a.xFt - p[1].xFt) * Math.sin(h) + (a.yFt - p[1].yFt) * Math.cos(h) });
  return Object.fromEntries([1, 2, 3, 4].map((id) => [id, at(p[id])]));
}

test('Q44b: the ground track is a choice, the SMM rear delay is the default; V6 stays LATE', () => {
  assert.equal(DEFAULTS.offsetBox4Timing, 'boxSlot'); // audit R1: the box slot solve; 'rearDelay' (SMM 12.5 s) stays a choice
  assert.equal(V6_DEFAULTS.offsetBox4Timing, 'late');
});

test('Q44b: a delayed 90 in the offset box rolls #4 out on the far side of #2 from the slot, both ways', () => {
  for (const direction of ['right', 'left']) {
    const places = finalPlaces(fly({ ...GT, direction }));
    const out = Math.sign(places[2].left - places[3].left); // which way is "outside #2", away from the slot
    assert.ok(out !== 0);
    const outsideBy = (places[4].left - places[2].left) * out;
    // It misses by about 1,600 ft, not 0: a delay only slides #4 along its old heading, so it cannot also reach the aft distance
    // and the 3,000 ft together (it ends about 4,600 ft outside #2, nearest the target that the line allows).
    assert.ok(outsideBy > 0 && Math.abs(outsideBy - 3000) < 2000, `${direction}: #4 is ${outsideBy.toFixed(0)} ft outside #2`);
    assert.ok(places[4].ahead < places[2].ahead - 3000, `${direction}: #4 is well aft of the front element`);
  }
});

test('Q44b: V6\'s LATE in a left turn ends #4 about 20,000 ft aft; the ground track brings it back near the box', () => {
  const late = finalPlaces(fly({ ...GT, direction: 'left', offsetBox4Timing: 'late' }));
  const track = finalPlaces(fly({ ...GT, direction: 'left' }));
  assert.ok(late[1].ahead - late[4].ahead > 19000, `LATE ${late[4].ahead.toFixed(0)}`);
  assert.ok(track[1].ahead - track[4].ahead < 9000, `ground track ${track[4].ahead.toFixed(0)}`);
});

test('Q44b: the solved delay fits #4 to the target as well as LATE or EARLY do (never worse), for many settings', () => {
  for (const direction of ['right', 'left']) {
    for (const [maneuver, turnDeg] of [['delayed90away', 90], ['delayed45away', 45]]) {
      for (const baseDelaySec of [5, 12, 16, 25]) {
        const run = createRun({ ...GT, maneuver, turnDeg, direction, baseDelaySec });
        const list = run.state.aircraft.map((a) => ({ id: a.id, xFt: a.xFt, yFt: a.yFt, headingRad: a.headingRad }));
        const v = ktToFtps(BASE.speedKt);
        const cfg = (timing4) => ({ baseDelaySec, selectedDir: direction === 'right' ? -1 : 1, goalRad: (turnDeg * Math.PI) / 180, direction, speedFtps: v, baseG: BASE.baseG, boxAftFt: BASE.boxAftFt, startHeadingRad: list[0].headingRad, timing4 });
        const track = offsetBoxPlan(list, cfg('groundTrack'));
        // The target, written out from the spec: 3,000 ft outside #2 and Box aft behind the front element's middle.
        const R = turnRadiusFt(v, BASE.baseG);
        const finalOf = (id, delay) => simulateDelayedTurnFinalPos(list.find((a) => a.id === id), cfg().selectedDir, cfg().goalRad, v, R, delay);
        const one = finalOf(1, track.delaysSec[1]);
        const two = finalOf(2, track.delaysSec[2]);
        const mid = { x: (one.xFt + two.xFt) / 2, y: (one.yFt + two.yFt) / 2 };
        const h = list[0].headingRad + cfg().selectedDir * cfg().goalRad;
        const fwd = { x: Math.cos(h), y: Math.sin(h) };
        const left = { x: Math.cos(h + Math.PI / 2), y: Math.sin(h + Math.PI / 2) };
        const side = Math.sign((two.xFt - mid.x) * left.x + (two.yFt - mid.y) * left.y);
        const reach = Math.hypot(one.xFt - two.xFt, one.yFt - two.yFt) / 2 + 3000;
        const target = { x: mid.x - fwd.x * BASE.boxAftFt + left.x * side * reach, y: mid.y - fwd.y * BASE.boxAftFt + left.y * side * reach };
        const missBy = (delay) => { const f = finalOf(4, delay); return Math.hypot(f.xFt - target.x, f.yFt - target.y); };
        assert.ok(Math.abs(missBy(track.delaysSec[4]) - track.fitErrFt[4]) < 1e-6, 'the reported fit is the real miss');
        for (const timing4 of ['late', 'early']) {
          const other = offsetBoxPlan(list, cfg(timing4));
          assert.deepEqual([other.delaysSec[1], other.delaysSec[2], other.delaysSec[3]], [track.delaysSec[1], track.delaysSec[2], track.delaysSec[3]], 'only #4 differs');
          assert.ok(track.fitErrFt[4] <= missBy(other.delaysSec[4]) + 100, `${direction} ${maneuver} ${baseDelaySec} vs ${timing4}`);
        }
      }
    }
  }
});

test('SMM item 5: the delays of #3 and #4 after the front element are in the state, against the 10 to 15 s band, before the first step too', () => {
  // 'rearDelay' (BASE here): each 12.5 s after its front counterpart (the band's middle), inside the band.
  const dflt = createRun({ ...BASE, direction: 'right' });
  assert.deepEqual([dflt.state.offsetBox.minSec, dflt.state.offsetBox.maxSec], [10, 15]);
  assert.deepEqual(dflt.state.offsetBox.rear.map((r) => [r.id, r.delaySec, r.outsideBand]), [[3, 12.5, false], [4, 12.5, false]]);
  // The ground track solves its own delays, which can fall outside the band: they are measured as Fig 16.30 does: #3 from the later front start, #4 from #3's start.
  const run = createRun({ ...GT, direction: 'right' });
  const box = run.state.offsetBox;
  assert.deepEqual(box.rear.map((r) => r.id), [3, 4]);
  const solved = box.rear.map((r) => r.delaySec);
  assert.ok(solved.every(Number.isFinite));
  const started = {};
  while (run.step()) for (const a of run.state.aircraft) if (a.turning && started[a.id] === undefined) started[a.id] = run.state.tSec;
  assert.ok(Math.abs(started[3] - Math.max(started[1], started[2]) - solved[0]) < 0.11 && Math.abs(started[4] - started[3] - solved[1]) < 0.11, `${JSON.stringify(started)} vs ${solved}`);
  for (const r of box.rear) assert.equal(r.outsideBand, r.delaySec < 10 || r.delaySec > 15);
  assert.equal(box.rear[1].outsideBand, true, 'the ground track puts #4 well past 15 s after the front element');
  // The band is a setting, and the flag follows it.
  const wide = createRun({ ...GT, rearDelayMinSec: 0, rearDelayMaxSec: 60 });
  assert.ok(wide.state.offsetBox.rear.every((r) => r.outsideBand === false));
});

test('SMM item 5: no solved delays for the other presets, the clock cue, or turns that start at once', () => {
  assert.equal(createRun({ ...BASE, formation: 'weighted' }).state.offsetBox, null);
  assert.equal(createRun({ ...BASE, timing: 'clock' }).state.offsetBox, null);
  assert.equal(createRun({ ...BASE, maneuver: 'inplace90' }).state.offsetBox, null);
  // The hook has them: #3 and #4 delay after the front element (SMM 112a, tests/unit/turn-sim/hook.test.js).
  assert.deepEqual(createRun({ ...BASE, maneuver: 'hook90' }).state.offsetBox.rear.map((r) => r.delaySec), [12.5, 12.5]);
});

test('SMM item 5: the in-place turn in the offset box turns all four together, as V6 already does (para 112b)', () => {
  for (const maneuver of ['inplace90']) {
    for (const rearCheckOn of [false, true]) {
      const run = createRun({ ...BASE, maneuver, rearCheckOn, rearCheckStartSec: 60, durationSec: 30 });
      run.step();
      assert.ok(run.state.aircraft.every((a) => a.turning), `${maneuver}: all four turn on the first step`);
    }
  }
});

test('the band edges: 10 and 15 s are inside, 9.99 and 15.01 s are outside', () => {
  const edge = (three, four) => offsetBoxStatus({ 3: three, 4: four }, 10, 15).rear.map((r) => r.outsideBand);
  assert.deepEqual(edge(10, 15), [false, false]);
  assert.deepEqual(edge(9.99, 15.01), [true, true]);
  assert.equal(offsetBoxStatus(null, 10, 15), null);
});

test('the box opens on spacing: at the defaults #2 is spacingFt abreast of Lead (V6\'s 1,000 ft stagger read wide)', () => {
  assert.equal(DEFAULTS.boxStaggerFt, 0);
  assert.equal(V6_DEFAULTS.boxStaggerFt, 1000);
  const run = createRun({ ...DEFAULTS, formation: 'offsetBox' });
  const [one, two, three, four] = run.state.aircraft;
  assert.ok(Math.abs(Math.hypot(two.xFt - one.xFt, two.yFt - one.yFt) - DEFAULTS.spacingFt) < 1e-6);
  assert.ok(Math.abs(two.yFt - one.yFt) < 1e-6, 'abreast');
  assert.ok(Math.abs(Math.abs(four.xFt - three.xFt) - DEFAULTS.spacingFt) < 1e-6, '#3 and #4 are spacingFt apart');
  const wide = createRun({ ...DEFAULTS, formation: 'offsetBox', boxStaggerFt: 1000 }).state.aircraft;
  assert.ok(Math.abs(Math.hypot(wide[1].xFt - wide[0].xFt, wide[1].yFt - wide[0].yFt) - (DEFAULTS.spacingFt + 1000)) < 1e-6, 'the stagger is still there to set');
});
