// Plausibility guards on the built-in Moose Jaw setup (verification batch 6,
// 2026-09-30). The engine copies V6 exactly for now, so these are listed as
// todo and become real tests in the tasks named (tasks/traffic/todo.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routePath, positionAt } from '../../../src/modules/traffic/route.js';
import { CATALOG } from '../../../src/airfields/catalog.js';
import { FT_PER_NM } from '../../../src/core/units.js';
import { flownCorners } from '../../crosscheck/traffic-measure.js';

const SETUP = JSON.parse(readFileSync(new URL('../../../src/modules/traffic/data/moose-jaw.json', import.meta.url), 'utf8'));
const FIELD_FT = CATALOG.CYMJ.elevationFt;

test.todo('no flown slope steeper than 15° on any built-in route (TR-02, task 15)');
test.todo('final turn: height falls linearly with the angle turned, ±20 ft (TR-02, task 15)');
// SMM 4.7 para 12 / EFIG p.397: about 240 ft above the field at the window (3/4 NM out).
// The two built-in straight-ins (Split 1 and Entry 2) fly 227 ft today.
for (const id of ['SPL1', 'ENT2']) {
  test(`the ${id} straight-in is 240 ± 40 ft above the field at 0.75 NM (TR-03)`, () => {
    const route = SETUP.routes.find((r) => r.id === id);
    const above = positionAt(route, routePath(route).lengthFt - 0.75 * FT_PER_NM).alt - FIELD_FT;
    assert.ok(Math.abs(above - 240) <= 40, `${id} is ${above.toFixed(0)} ft above the field at 0.75 NM`);
  });
}
test.todo('the built-in break starts 2,000 ± 500 ft past the threshold (TR-06, task 15)');
test.todo('no step moves an aircraft more than 2 × speed × 0.05 s + 5 ft at a split or join, 20 seeds (TR-05, task 12)');
// TR-20. The G the flown curve needs at its tightest corner (from the peak bank) may not pass what the T-6A can pull at that point's speed
// (core `availableG(kias)`: the stall line `stallLimitG(kias)`, at most +7 G). Two built-in corners do: Split 3 point 2 (4.19 G at 150 kt against
// 3.04 G) and Split 2 point 2 (3.28 G). It is a todo until task 12 (banks that the speed can fly) fixes the
// setup; the same numbers are in the cross-check table (t-corner-flown-* rows). Remove the `.todo` when it passes.
test.todo('every corner of every built-in route is flown within the G the T-6A can pull at its speed (TR-20, task 12)', () => {
  const over = flownCorners(SETUP).filter((c) => c.margin > 0.05)
    .map((c) => `${c.routeId} point ${c.point}: ${c.flownG.toFixed(2)} G flown at ${c.kt} kt, can pull ${c.canPullG.toFixed(2)} G`);
  assert.deepEqual(over, []);
});
test.todo('the bank each point flies is within 5° of its turn data, or the point is flagged (TR-07, task 12)');
test.todo('a straight-in joining at the first point rolls the landing decision once (TR-08, task 12)');
test.todo('two Pattern 1 aircraft set to meet: the second rolls out at least 3,000 ft behind (TR-04, task 18)');
