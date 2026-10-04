// Checks: Debrief focus points (DFPs): kept in time order, named, renamed, cut to length, at most 500, stepped
//   through, and read back from storage as untrusted data.
// Serves: DB-R16, DB-R25.
// Expected values: typed-in values; the length and count limits come from DFP_LIMITS in the code (design choice).

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DFP_LIMITS, addDfp, sortDfps, dfpLabel, renameDfp, setDfpNote, removeDfp, nextDfp, previousDfp,
  flightFingerprint, dfpStorageKey, readStoredDfps,
} from '../../../src/modules/debrief/dfp.js';

function listAt(...times) {
  let list = [];
  for (const t of times) list = addDfp(list, { t, x: t * 10, y: -t }).list;
  return list;
}

test('DFPs added out of order are kept in time order, with the time and Lead\'s position', () => {
  const { list, dfp } = addDfp(listAt(300, 100), { t: 200, x: 5, y: 6 });
  assert.deepEqual(list.map((d) => d.t), [100, 200, 300]);
  assert.deepEqual(dfp, { id: 3, t: 200, x: 5, y: 6, label: null, note: '' });
  assert.deepEqual(addDfp([], { t: 7 }).dfp, { id: 1, t: 7, x: null, y: null, label: null, note: '' });
  assert.equal(addDfp([], { t: NaN }).dfp, null);
});

test('automatic labels follow time order and renumber when a DFP is added before them', () => {
  let list = listAt(100, 300);
  assert.deepEqual(list.map((d) => dfpLabel(list, d)), ['DFP 1', 'DFP 2']);
  list = addDfp(list, { t: 50 }).list;
  assert.deepEqual(list.map((d) => dfpLabel(list, d)), ['DFP 1', 'DFP 2', 'DFP 3']);
  assert.equal(list[0].t, 50);
});

test('a renamed DFP keeps its name; a blank name goes back to automatic', () => {
  let list = listAt(100, 200);
  const id = list[1].id;
  list = renameDfp(list, id, '  Rejoin\n overshoot  ');
  assert.equal(dfpLabel(list, list[1]), 'Rejoin overshoot');
  list = addDfp(list, { t: 10 }).list;
  assert.deepEqual(list.map((d) => dfpLabel(list, d)), ['DFP 1', 'DFP 2', 'Rejoin overshoot']);
  list = renameDfp(list, id, '   ');
  assert.equal(dfpLabel(list, list[2]), 'DFP 3');
});

test('labels and notes are cut to the debrief file\'s limits, and markup stays plain text', () => {
  let list = listAt(1);
  const id = list[0].id;
  list = renameDfp(list, id, 'x'.repeat(500));
  assert.equal(list[0].label.length, DFP_LIMITS.label);
  list = setDfpNote(list, id, 'y'.repeat(5000));
  assert.equal(list[0].note.length, DFP_LIMITS.note);
  list = renameDfp(list, id, '<img src=x onerror=alert(1)>');
  assert.equal(list[0].label, '<img src=x onerror=alert(1)>');
  list = setDfpNote(list, id, 'line 1\r\nline 2\rline 3');
  assert.equal(list[0].note, 'line 1\nline 2\nline 3');
});

test('no more than 500 DFPs', () => {
  let list = [];
  for (let t = 0; t < DFP_LIMITS.count; t++) list = addDfp(list, { t }).list;
  const again = addDfp(list, { t: 9999 });
  assert.equal(again.dfp, null);
  assert.equal(again.list, list);
});

test('previous and next step through DFPs in time order, skipping the one you are on', () => {
  const list = listAt(300, 100, 200);
  assert.equal(nextDfp(list, 0).t, 100);
  assert.equal(nextDfp(list, 100).t, 200);
  assert.equal(nextDfp(list, 150).t, 200);
  assert.equal(nextDfp(list, 300), null);
  assert.equal(previousDfp(list, 300).t, 200);
  assert.equal(previousDfp(list, 250).t, 200);
  assert.equal(previousDfp(list, 100), null);
  assert.equal(nextDfp([], 0), null);
});

test('removing a DFP leaves the rest, renumbered', () => {
  let list = listAt(100, 200, 300);
  list = removeDfp(list, list[0].id);
  assert.deepEqual(list.map((d) => [d.t, dfpLabel(list, d)]), [[200, 'DFP 1'], [300, 'DFP 2']]);
});

test('the flight fingerprint changes with any track, its order or a split between tracks', () => {
  const fp = flightFingerprint(['lead kml', 'two kml']);
  assert.match(fp, /^[0-9a-f]{16}$/);
  assert.equal(flightFingerprint(['lead kml', 'two kml']), fp);
  assert.notEqual(flightFingerprint(['two kml', 'lead kml']), fp);
  assert.notEqual(flightFingerprint(['lead kml', 'two kmL']), fp);
  assert.notEqual(flightFingerprint(['lead kmltwo kml']), flightFingerprint(['lead kml', 'two kml']));
  assert.notEqual(flightFingerprint(['ab', 'c']), flightFingerprint(['a', 'bc']));
  assert.equal(dfpStorageKey(fp), `debrief:dfps:${fp}`);
});

test('DFPs read back from browser storage are checked like outside data', () => {
  assert.deepEqual(readStoredDfps(null), []);
  assert.deepEqual(readStoredDfps({ t: 1 }), []);
  const got = readStoredDfps([
    { id: 2, t: 200, x: 1, y: 2, label: 'Break', note: 'late' },
    { id: 2, t: 100, label: 42, note: null },
    { t: 'soon' },
    null,
    { id: -1, t: 50, x: 'far', label: 'z'.repeat(300), note: 'n'.repeat(3000) },
  ]);
  assert.deepEqual(got.map((d) => d.t), [50, 100, 200]);
  assert.equal(new Set(got.map((d) => d.id)).size, 3);
  assert.equal(got[0].x, null);
  assert.equal(got[0].label.length, DFP_LIMITS.label);
  assert.equal(got[0].note.length, DFP_LIMITS.note);
  assert.equal(got[1].label, null);
  assert.deepEqual({ ...got[2] }, { id: 2, t: 200, x: 1, y: 2, label: 'Break', note: 'late' });
  const many = Array.from({ length: 900 }, (_, i) => ({ id: i + 1, t: i }));
  assert.equal(readStoredDfps(many).length, DFP_LIMITS.count);
  assert.deepEqual(sortDfps(readStoredDfps(got)), got);
});
