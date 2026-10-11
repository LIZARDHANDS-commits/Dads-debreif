// Checks: the SOF 3D view's Airspace tab and mouse choice (Dad, 8 Oct 2026: "i should be able to click and move around with the mouse. I should also
//   be able to hide certain airspace if needed in a tab somewhere"). Hiding a kind takes every airspace of that kind out of what is drawn, and the list the
//   airspace log reads is left whole; hiding one airspace by its id hides only that one; a choice made at Laughlin (KDLF) does not change Moose Jaw (CYMJ),
//   and survives the settings document being read back; a plain left-drag moves the map and a right-drag turns it, the other way round with the swapped choice.
// Serves: SOF plan item "3D mouse controls and an airspace filter"; SOF-47 (Dad decides SOF calls).
// Expected values: from the brief's wording of Dad's ask (left-drag moves, right-drag or Ctrl-drag turns, Shift-drag moves, touch unchanged; hidden airspace
//   is not drawn but the log still reads all of it). The airspace is the real FAA file for Laughlin and the DAH entries for Moose Jaw, used as input only:
//   what counts as a MOA is the FAA's own kind on each row, and the counts are taken from that input here, not from the filter's output.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawnAirspace, hiddenFor, withHidden } from '../../../src/airfields/airspace/filter.js';
import { cleanView3d } from '../../../src/modules/sof/settings-model.js';
import { dragAction } from '../../../src/modules/sof/scene3d-model.js';
import { AIRSPACE as KDLF_FAA } from '../../../src/airfields/airspace/faa/kdlf.js';
import { AIRSPACE as CYMJ_FIXED } from '../../../src/airfields/airspace/data.js';

test('hiding MOAs or one airspace changes only the picture at that base, and the mouse choice maps left and right drags', () => {
  // The list the airspace log reads: every entry, hidden or not. A copy is kept to show the filter never changes it.
  const logList = [...KDLF_FAA];
  const before = logList.length;
  const moaIds = logList.filter((e) => e.kind === 'moa').map((e) => e.id);
  assert.ok(moaIds.length > 0, 'Laughlin\'s FAA file has MOAs to hide');

  // Hide the kind "MOA" at Laughlin: no MOA is drawn, everything else still is, and the log's list still has every MOA.
  let choices = withHidden({}, 'KDLF', { kinds: ['moa'], ids: [] });
  const drawn = drawnAirspace(logList, hiddenFor(choices, 'KDLF'));
  assert.equal(drawn.filter((e) => e.kind === 'moa').length, 0, 'no MOA is drawn');
  assert.equal(drawn.length, before - moaIds.length, 'everything that is not a MOA is still drawn');
  assert.equal(logList.length, before, 'the airspace log\'s list is untouched');
  assert.equal(logList.filter((e) => e.kind === 'moa').length, moaIds.length, 'the airspace log still reads every MOA');

  // Hide one airspace by its id (the first restricted area in the file): only that one goes.
  const one = logList.find((e) => e.kind === 'restricted');
  const onlyOne = drawnAirspace(logList, { kinds: [], ids: [one.id] });
  assert.equal(onlyOne.length, before - 1, `only ${one.id} is hidden`);
  assert.ok(!onlyOne.some((e) => e.id === one.id), `${one.id} is not drawn`);

  // Laughlin's choice, read back through the settings document's cleaning, does not reach Moose Jaw: all of CYMJ's airspace is still drawn.
  choices = withHidden(choices, 'KDLF', { kinds: ['moa'], ids: [one.id] });
  const stored = cleanView3d({ airspaceHidden3d: JSON.parse(JSON.stringify(choices)) }).airspaceHidden3d;
  assert.deepEqual([...hiddenFor(stored, 'KDLF').kinds], ['moa'], 'Laughlin keeps MOAs hidden after a reload');
  assert.deepEqual([...hiddenFor(stored, 'KDLF').ids], [one.id], `Laughlin keeps ${one.id} hidden after a reload`);
  assert.equal(drawnAirspace(CYMJ_FIXED, hiddenFor(stored, 'CYMJ')).length, CYMJ_FIXED.length, 'Moose Jaw draws all its airspace');

  // The mouse: by default a left-drag moves the map and a right-drag turns it; Ctrl-drag turns, Shift-drag moves; one finger on a touch screen turns, as before.
  const left = { pointerType: 'mouse', button: 0 };
  const right = { pointerType: 'mouse', button: 2 };
  assert.equal(dragAction(left), 'move', 'default: left-drag moves');
  assert.equal(dragAction(right), 'turn', 'default: right-drag turns');
  assert.equal(dragAction({ ...left, ctrlKey: true }), 'turn', 'default: Ctrl-drag turns');
  assert.equal(dragAction({ ...left, shiftKey: true }), 'move', 'default: Shift-drag moves');
  assert.equal(dragAction({ pointerType: 'touch', button: 0 }), 'turn', 'one finger turns, as before');
  // Swapped back ("left-drag turns"): the reverse.
  assert.equal(dragAction(left, 'turn'), 'turn', 'swapped: left-drag turns');
  assert.equal(dragAction(right, 'turn'), 'move', 'swapped: right-drag moves');
  assert.equal(dragAction({ ...left, shiftKey: true }, 'turn'), 'move', 'swapped: Shift-drag still moves');
});
