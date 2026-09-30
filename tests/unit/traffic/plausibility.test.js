// Plausibility guards on the built-in Moose Jaw setup (verification batch 6,
// 2026-09-30). The engine copies V6 exactly for now, so these are listed as
// todo and become real tests in the tasks named (tasks/traffic/todo.md).
import { test } from 'node:test';

test.todo('no flown slope steeper than 15° on any built-in route (TR-02, task 15)');
test.todo('final turn: height falls linearly with the angle turned, ±20 ft (TR-02, task 15)');
test.todo('each straight-in is 240 ± 40 ft above the field at 0.75 NM (TR-03, task 15)');
test.todo('the built-in break starts 2,000 ± 500 ft past the threshold (TR-06, task 15)');
test.todo('no step moves an aircraft more than 2 × speed × 0.05 s + 5 ft at a split or join, 20 seeds (TR-05, task 12)');
test.todo('the bank each point flies is within 5° of its turn data, or the point is flagged (TR-07, task 12)');
test.todo('a straight-in joining at the first point rolls the landing decision once (TR-08, task 12)');
test.todo('two Pattern 1 aircraft set to meet: the second rolls out at least 3,000 ft behind (TR-04, task 18)');
