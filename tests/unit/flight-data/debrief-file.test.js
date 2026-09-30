// The debrief file (R17, #25): save and reopen exactly, and treat an opened
// file as untrusted (SPEC-flight-data, Security).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadFlight } from '../../../src/flight-data/load.js';
import { toDebriefFile, readDebriefFile, MAX_DFPS, MAX_NOTE_CHARS, MAX_LABEL_CHARS } from '../../../src/flight-data/debrief-file.js';

const EXAMPLES = { 1: '585aab2601b787ed', 3: '3085ab3861e2bae6' };
const files = Object.entries(EXAMPLES).map(([slot, id]) => ({
  slot: Number(slot), name: `#${slot}.kml`, text: readFileSync(new URL(`../../../original/assets/${id}.kml`, import.meta.url), 'utf8'),
}));
const flight = loadFlight(files);
const SETTINGS = { view: { type: 'string', oneOf: ['2d', '3d'] }, trailS: { type: 'number', min: 0, max: 600 }, grid: { type: 'boolean' }, callsign: { type: 'string', max: 12 } };
const err = fn => { try { fn(); } catch (e) { return e; } return null; };
const t0 = flight.startT;

test('a saved debrief reopens with the same tracks, DFPs and settings (R17)', () => {
  const dfps = [{ t: t0 + 300, label: 'Rejoin', note: 'Wide on the join-up' }, { t: t0 + 60, label: 'Break', note: '' }];
  const text = toDebriefFile(flight, dfps, { view: '3d', trailS: 30, grid: true });
  const back = readDebriefFile(text, { settings: SETTINGS });
  assert.deepEqual(back.files, files);
  assert.deepEqual(back.dfps, [dfps[1], dfps[0]]); // sorted by time
  assert.deepEqual(back.settings, { view: '3d', trailS: 30, grid: true });
  assert.equal(back.sameCleaning, true);
  const again = loadFlight(back.files);
  assert.deepEqual([again.startT, again.endT, again.tracks[3].fixes.length], [flight.startT, flight.endT, flight.tracks[3].fixes.length]);
  assert.deepEqual(JSON.parse(text).format, 'dads-debrief');
});

test('unknown fields are dropped and bad settings ignored, one by one', () => {
  const file = JSON.parse(toDebriefFile(flight, [{ t: t0, label: 'A', note: 'n' }], {}));
  file.extra = 'x';
  file.tracks[0].colour = 'red';
  file.dfps[0].html = '<img src=x onerror=alert(1)>';
  file.settings = { view: 'side', trailS: 1e9, grid: 'yes', callsign: 'x'.repeat(13), __proto__: { polluted: true }, script: 'alert(1)' };
  const back = readDebriefFile(JSON.stringify(file), { settings: SETTINGS });
  assert.deepEqual(Object.keys(back.files[0]), ['slot', 'name', 'text']);
  assert.deepEqual(back.dfps, [{ t: t0, label: 'A', note: 'n' }]);
  assert.deepEqual(back.settings, {});
  assert.equal({}.polluted, undefined);
  // Without a settings list nothing from the file is kept.
  assert.deepEqual(readDebriefFile(toDebriefFile(flight, [], { view: '2d' })).settings, {});
});

test('damaged or hostile debrief files are refused with one plain message', () => {
  const good = JSON.parse(toDebriefFile(flight, [], {}));
  const bad = change => { const f = structuredClone(good); change(f); return JSON.stringify(f); };
  const cases = {
    'not JSON': '{"format":',
    'not an object': '[]',
    'another format': bad(f => { f.format = 'other'; }),
    'a newer version': bad(f => { f.version = 2; }),
    'no tracks': bad(f => { f.tracks = []; }),
    'five tracks': bad(f => { f.tracks = [1, 2, 3, 4, 5].map(slot => ({ ...f.tracks[0], slot })); }),
    'a track with no KML': bad(f => { delete f.tracks[0].kml; }),
    'a long track name': bad(f => { f.tracks[0].name = 'x'.repeat(MAX_LABEL_CHARS + 1); }),
    'a DFP with no time': bad(f => { f.dfps = [{ label: 'x', note: '' }]; }),
    'a DFP time that is not a number': bad(f => { f.dfps = [{ t: '12', label: 'x', note: '' }]; }),
    'a 10 MB note': bad(f => { f.dfps = [{ t: t0, label: 'x', note: 'x'.repeat(10 * 1024 * 1024) }]; }),
    'a long label': bad(f => { f.dfps = [{ t: t0, label: 'x'.repeat(MAX_LABEL_CHARS + 1), note: '' }]; }),
    'too many DFPs': bad(f => { f.dfps = Array.from({ length: MAX_DFPS + 1 }, (_, i) => ({ t: t0 + i, label: '', note: '' })); }),
  };
  for (const [what, text] of Object.entries(cases)) {
    const e = err(() => readDebriefFile(text, { settings: SETTINGS }));
    assert.equal(e?.code, 'debrief-file', what);
    assert.match(e.message, /^This debrief file can't be opened/, what);
    assert.doesNotMatch(e.message, /at .*\.js|SyntaxError/, what);
  }
  assert.equal(err(() => readDebriefFile(42))?.code, 'debrief-file');
  // At the limits is fine.
  const edge = bad(f => { f.dfps = [{ t: t0, label: 'x'.repeat(MAX_LABEL_CHARS), note: 'x'.repeat(MAX_NOTE_CHARS) }]; });
  assert.equal(readDebriefFile(edge).dfps.length, 1);
});

test('a file saved with different cleaning limits says so', () => {
  const f = JSON.parse(toDebriefFile(flight, [], {}));
  f.cleaning.gapS = 10;
  assert.equal(readDebriefFile(JSON.stringify(f)).sameCleaning, false);
  delete f.cleaning;
  assert.equal(readDebriefFile(JSON.stringify(f)).sameCleaning, false);
});

test('saving checks what it writes too', () => {
  assert.equal(err(() => toDebriefFile(flight, [{ t: NaN, label: '', note: '' }], {}))?.code, 'debrief-file');
  assert.equal(err(() => toDebriefFile({ tracks: {} }, [], {}))?.code, 'debrief-file');
});

test('problems saving say "saved", and an unknown version is not called newer (review)', () => {
  const e = err(() => toDebriefFile(flight, [{ t: NaN, label: '', note: '' }], {}));
  assert.match(e.message, /^This debrief can't be saved: DFP 1/);
  const f = JSON.parse(toDebriefFile(flight, [], {}));
  for (const version of [0, '1', undefined]) {
    assert.match(err(() => readDebriefFile(JSON.stringify({ ...f, version }))).message, /not a debrief file this tool understands/, String(version));
  }
  assert.match(err(() => readDebriefFile(JSON.stringify({ ...f, version: 2 }))).message, /newer version/);
});

test('ship numbers in a debrief file are checked: 1 to 4, each once (review)', () => {
  const f = JSON.parse(toDebriefFile(flight, [], {}));
  for (const slots of [[0], [5], [1, 1]]) {
    const tracks = slots.map(slot => ({ ...f.tracks[0], slot }));
    assert.equal(err(() => readDebriefFile(JSON.stringify({ ...f, tracks })))?.code, 'debrief-file', String(slots));
  }
});

test('five tracks are refused for being five (review)', () => {
  const f = JSON.parse(toDebriefFile(flight, [], {}));
  const tracks = [1, 2, 3, 4, 4].map(slot => ({ ...f.tracks[0], slot }));
  assert.match(err(() => readDebriefFile(JSON.stringify({ ...f, tracks }))).message, /1 to 4 tracks/);
  assert.match(err(() => toDebriefFile({ files: [] }, [], {})).message, /can't be saved: it needs 1 to 4 tracks/);
});
