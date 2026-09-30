// The offset box's #4 timing in plain facts. V6's LATE and EARLY are pinned to V6 in tests/golden/;
// the ground track (Q44b) is the rebuild's own, so it is stated here from the spec.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, V6_DEFAULTS } from '../../../src/modules/turn-sim/settings.js';
import { createRun } from '../../../src/modules/turn-sim/engine/run.js';
import { offsetBoxPlan, simulateDelayedTurnFinalPos } from '../../../src/modules/turn-sim/engine/plan.js';
import { ktToFtps } from '../../../src/core/units.js';
import { turnRadiusFt } from '../../../src/core/flight-math.js';

const BASE = { ...DEFAULTS, formation: 'offsetBox', maneuver: 'delayed90away', turnDeg: 90, baseDelaySec: 16, durationSec: 120 };
const fly = (settings) => { const run = createRun(settings); while (run.step()); return run; };

/** Everyone's final place in Lead's final frame: ft ahead of Lead and ft to Lead's left. */
function finalPlaces(run) {
  const p = Object.fromEntries(run.state.aircraft.map((a) => [a.id, a]));
  const h = p[1].headingRad;
  const at = (a) => ({ ahead: (a.xFt - p[1].xFt) * Math.cos(h) + (a.yFt - p[1].yFt) * Math.sin(h), left: -(a.xFt - p[1].xFt) * Math.sin(h) + (a.yFt - p[1].yFt) * Math.cos(h) });
  return Object.fromEntries([1, 2, 3, 4].map((id) => [id, at(p[id])]));
}

test('Q44b: the ground track is the default; V6 stays LATE', () => {
  assert.equal(DEFAULTS.offsetBox4Timing, 'groundTrack');
  assert.equal(V6_DEFAULTS.offsetBox4Timing, 'late');
});

test('Q44b: a delayed 90 in the offset box rolls #4 out on the far side of #2 from the slot, both ways', () => {
  for (const direction of ['right', 'left']) {
    const places = finalPlaces(fly({ ...BASE, direction }));
    const out = Math.sign(places[2].left - places[3].left); // which way is "outside #2", away from the slot
    assert.ok(out !== 0);
    const outsideBy = (places[4].left - places[2].left) * out;
    assert.ok(outsideBy > 0 && Math.abs(outsideBy - 3000) < 2500, `${direction}: #4 is ${outsideBy.toFixed(0)} ft outside #2`);
    assert.ok(places[4].ahead < places[2].ahead - 3000, `${direction}: #4 is well aft of the front element`);
  }
});

test('Q44b: V6\'s LATE in a left turn ends #4 about 20,000 ft aft; the ground track brings it back near the box', () => {
  const late = finalPlaces(fly({ ...BASE, direction: 'left', offsetBox4Timing: 'late' }));
  const track = finalPlaces(fly({ ...BASE, direction: 'left' }));
  assert.ok(late[1].ahead - late[4].ahead > 19000, `LATE ${late[4].ahead.toFixed(0)}`);
  assert.ok(track[1].ahead - track[4].ahead < 9000, `ground track ${track[4].ahead.toFixed(0)}`);
});

test('Q44b: the solved delay fits #4 to the target as well as LATE or EARLY do (never worse), for many settings', () => {
  for (const direction of ['right', 'left']) {
    for (const [maneuver, turnDeg] of [['delayed90away', 90], ['delayed45away', 45]]) {
      for (const baseDelaySec of [5, 12, 16, 25]) {
        const run = createRun({ ...BASE, maneuver, turnDeg, direction, baseDelaySec });
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
