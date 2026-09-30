// The hook turn as the SMM flies it (16.19 para 60, Figure 16.19; para 112a for the offset box; para 121 for spread 4):
// both turn the same way through 180 degrees together at 3 G and roll out in LAB on the reciprocal heading. V6's hook was 90
// degrees (an in-place turn under another name, same as In-place 90 in every run).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, MANEUVER_TURN_DEG } from '../../../src/modules/turn-sim/settings.js';
import { createRun } from '../../../src/modules/turn-sim/engine/run.js';

const BASE = { ...DEFAULTS, offsetBox4Timing: 'rearDelay', maneuver: 'hook90', turnDeg: MANEUVER_TURN_DEG.hook90, startHeadingDeg: 0, durationSec: 60 };
const TOLERANCE_FT = 100;
const fly = (settings) => { const run = createRun(settings); const start = run.state.aircraft.map((a) => ({ ...a })); while (run.step()); return { run, start }; };
/** `id` from Lead in Lead's own frame at the end: feet to Lead's right and feet ahead. */
const fromLead = (list, id) => {
  const lead = list.find((a) => a.id === 1);
  const b = list.find((a) => a.id === id);
  const h = lead.headingRad;
  const dx = b.xFt - lead.xFt;
  const dy = b.yFt - lead.yFt;
  return { right: dx * Math.sin(h) - dy * Math.cos(h), ahead: dx * Math.cos(h) + dy * Math.sin(h) };
};

test('the hook is 180 degrees by default', () => {
  assert.equal(MANEUVER_TURN_DEG.hook90, 180);
  assert.equal(MANEUVER_TURN_DEG.inplace90, 90);
});

test('two-ship, right and left: both turn the same way through 180 degrees and roll out in LAB, 6,000 ft abeam, sides swapped on the ground', () => {
  for (const direction of ['right', 'left']) {
    const { run, start } = fly({ ...BASE, formation: 'twoShip', direction });
    for (const a of run.state.aircraft) {
      const turned = Math.abs(a.headingRad - start.find((s) => s.id === a.id).headingRad);
      assert.ok(Math.abs(turned - Math.PI) < 2e-4, `${direction} #${a.id} turned ${turned}`);
    }
    const end = fromLead(run.state.aircraft, 2);
    assert.ok(Math.abs(Math.abs(end.right) - 6000) < TOLERANCE_FT && Math.abs(end.ahead) < TOLERANCE_FT, `${direction}: ${end.right.toFixed(0)} right, ${end.ahead.toFixed(0)} ahead`);
    // #2 started on Lead's right (two-ship); on the reciprocal heading its ground side is Lead's left.
    assert.ok(fromLead(start, 2).right > 0 && end.right < 0, `${direction}: on the other side of Lead's line`);
  }
});

test('4312 and 2134: all four roll out in LAB on the reciprocal heading, the same string mirrored', () => {
  for (const formation of ['weighted', 'weightedReverse']) {
    for (const direction of ['right', 'left']) {
      const { run, start } = fly({ ...BASE, formation, direction });
      for (const id of [2, 3, 4]) {
        const was = fromLead(start, id);
        const now = fromLead(run.state.aircraft, id);
        assert.ok(Math.abs(now.right + was.right) < TOLERANCE_FT && Math.abs(now.ahead) < TOLERANCE_FT, `${formation} ${direction} #${id}: ${was.right.toFixed(0)} became ${now.right.toFixed(0)}, ${now.ahead.toFixed(0)} ahead`);
      }
    }
  }
});

test('offset box (SMM 112a): #3 and #4 turn 12.5 s after the front element, together, and everyone rolls out 180 degrees round', () => {
  for (const direction of ['right', 'left']) {
    const run = createRun({ ...BASE, formation: 'offsetBox', direction });
    const startedAt = {};
    const start = run.state.aircraft.map((a) => a.headingRad);
    while (run.step()) for (const a of run.state.aircraft) if (a.turning && startedAt[a.id] === undefined) startedAt[a.id] = run.state.tSec;
    assert.ok(startedAt[1] < 0.1 && startedAt[2] < 0.1, `${direction}: the front element goes at once`);
    for (const id of [3, 4]) assert.ok(Math.abs(startedAt[id] - 12.5) < 0.11, `${direction} #${id} starts at ${startedAt[id]}`);
    run.state.aircraft.forEach((a, i) => assert.ok(Math.abs(Math.abs(a.headingRad - start[i]) - Math.PI) < 2e-4, `${direction} #${a.id} reversed`));
  }
});
