// The check turn (SMM 16.19 para 58, Figure 16.18): both aircraft turn together in place through 30 degrees or less and roll
// out, keeping LAB with the line swung round. V6 had no button for it (In-place 90 with the degrees typed in flew it).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, MANEUVER_TURN_DEG, checkSettings, turnDegProblem } from '../../../src/modules/turn-sim/settings.js';
import { createRun } from '../../../src/modules/turn-sim/engine/run.js';

const BASE = { ...DEFAULTS, maneuver: 'check30', turnDeg: MANEUVER_TURN_DEG.check30, startHeadingDeg: 0, durationSec: 30 };

test('the check turn is 30 degrees by default and the Turn degrees box goes down to 5', () => {
  assert.equal(MANEUVER_TURN_DEG.check30, 30);
  assert.equal(checkSettings({ maneuver: 'check30', turnDeg: 5 }).turnDeg, 5);
  assert.equal(checkSettings({ maneuver: 'check30', turnDeg: 4 }).turnDeg, 30, 'below 5: the default, 90, brought back to the check turn\'s 30');
  assert.equal(checkSettings({ maneuver: 'check30' }).maneuver, 'check30');
});

test('every aircraft turns together, right and left, and rolls out 30 degrees round with LAB kept: the line swings by 30', () => {
  for (const formation of ['twoShip', 'weighted', 'offsetBox']) {
    for (const direction of ['right', 'left']) {
      const run = createRun({ ...BASE, formation, direction });
      const start = run.state.aircraft.map((a) => ({ ...a }));
      run.step();
      assert.ok(run.state.aircraft.every((a) => a.turning), `${formation} ${direction}: together`);
      while (run.step());
      const turn = (direction === 'right' ? -1 : 1) * Math.PI / 6;
      for (const a of run.state.aircraft) assert.ok(Math.abs(a.headingRad - (start.find((s) => s.id === a.id).headingRad + turn)) < 2e-4, `${formation} ${direction} #${a.id}`);
      // The line swings round Lead: every aircraft keeps its distance from Lead (LAB kept, only the line's bearing changes).
      for (const a of run.state.aircraft) {
        const s = start.find((x) => x.id === a.id);
        const then = Math.hypot(s.xFt - start[0].xFt, s.yFt - start[0].yFt);
        const now = Math.hypot(a.xFt - run.state.aircraft[0].xFt, a.yFt - run.state.aircraft[0].yFt);
        assert.ok(Math.abs(now - then) < 200, `${formation} ${direction} #${a.id}: ${then.toFixed(0)} ft became ${now.toFixed(0)}`);
      }
    }
  }
});

test('two-ship right check: #2 ends 5,196 ft to Lead\'s right and 3,000 ft ahead (the SMM reference, R5196 F3000)', () => {
  const run = createRun({ ...BASE, formation: 'twoShip', direction: 'right' });
  while (run.step());
  const [one, two] = run.state.aircraft;
  const h = one.headingRad;
  const dx = two.xFt - one.xFt;
  const dy = two.yFt - one.yFt;
  const right = dx * Math.sin(h) - dy * Math.cos(h);
  const ahead = dx * Math.cos(h) + dy * Math.sin(h);
  // Both turn by the same angle, so #2 keeps its 6,000 ft at 30 degrees to the new heading's line.
  assert.ok(Math.abs(right - 5196) < 150 && Math.abs(ahead - 3000) < 150, `${right.toFixed(0)} right, ${ahead.toFixed(0)} ahead`);
});

test('the check turn is 30 degrees at most: a larger Turn degrees is brought back to 30 with the reason (audit yellow)', () => {
  const out = checkSettings({ maneuver: 'check30', turnDeg: 90 });
  assert.equal(out.maneuver, 'check30');
  assert.equal(out.turnDeg, 30);
  assert.equal(checkSettings({ maneuver: 'check30', turnDeg: 30 }).turnDeg, 30);
  assert.equal(checkSettings({ maneuver: 'check30', turnDeg: 12 }).turnDeg, 12);
  assert.equal(checkSettings({ maneuver: 'inplace90', turnDeg: 90 }).turnDeg, 90, 'the in-place turn keeps its own');
  assert.match(turnDegProblem('check30', 90), /30/);
  assert.equal(turnDegProblem('check30', 30), null);
  const run = createRun({ ...BASE, turnDeg: 90 });
  assert.match(run.state.maneuverFallback, /30/);
  assert.equal(createRun({ ...BASE, turnDeg: 30 }).state.maneuverFallback, null);
});
