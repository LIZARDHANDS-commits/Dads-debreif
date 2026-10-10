// Checks: a mid-air collision (Traffic spec 4.18, TR-116): two aircraft that touch both eject, where they met, and
//   two that pass 200 ft apart in height fly on.
// Serves: TR-116.
// Expected values: the hitbox is Fight Sim's 35 ft (CT-156 wingspan 33.4 ft, length 33.3 ft); 200 ft is the Traffic
//   conflict limit (TR-Q11, Patrick 4 Oct 09:09Z), well clear of touching; head-on at 120 KIAS each (about 126 kt true at
//   3,000 ft) they meet halfway along 60,000 ft, at 30,000 ft, about 140 s in (the 200 s limit is generous).

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSim } from '../../../src/modules/traffic/sim.js';

const point = (x, y, alt) => ({ label: '', x, y, alt, kt: 120, g: 2 });
const line = (id, from, to, alt) => ({ id, name: id, kind: 'entry', visible: true, color: '#fff', points: [point(from, 0, alt), point(to, 0, alt)], attachTo: '', mergeIndex: 0 });
const headOn = (altB) => createSim({
  version: 1, name: 'test', routes: [line('EAST', 0, 60000, 3000), line('WEST', 60000, 0, altB)],
  aircraft: [{ id: 'A', type: 'CT-156', routeId: 'EAST', startIndex: 0, startsAtSec: 0 }, { id: 'B', type: 'CT-156', routeId: 'WEST', startIndex: 0, startsAtSec: 0 }],
});

test('two aircraft that touch both eject where they met; two passing 200 ft apart fly on', () => {
  const hit = headOn(3000);
  hit.stepTo(200);
  const [a, b] = hit.state().aircraft;
  assert.equal(a.status, 'ejected');
  assert.equal(b.status, 'ejected');
  for (const ac of [a, b]) assert.ok(Math.abs(ac.ejectAt.x - 30000) < 100, `${ac.id} should eject where they met: ${Math.round(ac.ejectAt.x)} ft`);

  const miss = headOn(3200);
  miss.stepTo(200);
  assert.ok(miss.state().aircraft.every((ac) => ac.status !== 'ejected'), 'a 200 ft pass is not a collision');
});
