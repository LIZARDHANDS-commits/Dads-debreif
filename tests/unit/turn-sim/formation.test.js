// Formation slots and position errors in plain facts (the golden test pins V6 itself).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, V6_DEFAULTS, aircraftKey } from '../../../src/modules/turn-sim/settings.js';
import { formationSlots, startPositions } from '../../../src/modules/turn-sim/engine/formation.js';

/** Feet from Lead across the start heading (north, so along x), positive to the west: V6's "right" vector. */
const acrossFromLead = (list, id) => {
  const lead = list.find((a) => a.id === 1);
  const a = list.find((x) => x.id === id);
  return -(a.xFt - lead.xFt);
};

test('D42: Wide moves an aircraft further from Lead and Tight closer, on either side of Lead', () => {
  for (const formation of ['weighted', 'weightedReverse', 'offsetBox', 'twoShip']) {
    for (const id of [2, 3, 4]) {
      if (formation === 'twoShip' && id > 2) continue;
      const settings = { ...V6_DEFAULTS, startHeadingDeg: 0, formation };
      const slot = acrossFromLead(formationSlots(settings), id);
      for (const [lateralDir, sign] of [['wide', 1], ['tight', -1]]) {
        const moved = startPositions({ ...settings, [aircraftKey(id, 'positionErrorOn')]: true, [aircraftKey(id, 'lateralDir')]: lateralDir, [aircraftKey(id, 'lateralFt')]: 1000 });
        const now = acrossFromLead(moved, id);
        assert.ok(Math.abs(now - (slot + Math.sign(slot) * sign * 1000)) < 1e-6, `${formation} #${id} ${lateralDir}: slot ${slot}, now ${now}`);
      }
    }
  }
});

test('D42: on the far side V6 moved "wide" in (an example of what changed), and the near side and Lead are as V6 had them', () => {
  const base = { ...V6_DEFAULTS, startHeadingDeg: 0, formation: 'weighted' };
  const wide = (id) => startPositions({ ...base, [aircraftKey(id, 'positionErrorOn')]: true, [aircraftKey(id, 'lateralDir')]: 'wide', [aircraftKey(id, 'lateralFt')]: 1500 });
  // 4312: #2 is on the "right" vector's side (west of Lead, heading north): as V6, 6,000 ft becomes 7,500.
  assert.equal(acrossFromLead(wide(2), 2), 7500);
  // #3 is on the other side: V6 gave 4,500 ft (tighter), and now it is 7,500 ft.
  assert.equal(acrossFromLead(wide(3), 3), -7500);
  // Lead has no side and keeps V6's direction.
  const lead = wide(1).find((a) => a.id === 1);
  assert.deepEqual([lead.xFt, lead.yFt].map((v) => Math.round(v)), [-1500, 0]);
});

test('the defaults still put the formation where V6 did', () => {
  assert.deepEqual(formationSlots(DEFAULTS).map((a) => [a.id, Math.round(a.xFt)]), [[1, 0], [2, -6000], [3, 6000], [4, 12000]]);
});
