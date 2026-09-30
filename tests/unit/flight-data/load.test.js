// Loading a whole flight at once, all or nothing (C9).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadFlight, MAX_TRACKS } from '../../../src/flight-data/load.js';

const EXAMPLES = { 1: '585aab2601b787ed', 2: '3ee2a7e81a74880c', 3: '3085ab3861e2bae6', 4: '46e14716b39044c4' };
const text = slot => readFileSync(new URL(`../../../original/assets/${EXAMPLES[slot]}.kml`, import.meta.url), 'utf8');
const err = fn => { try { fn(); } catch (e) { return e; } return null; };

test('the example flight loads with all four tracks cleaned (C9)', () => {
  const flight = loadFlight([1, 2, 3, 4].map(slot => ({ slot, name: `#${slot}`, text: text(slot) })));
  assert.deepEqual(Object.keys(flight.tracks), ['1', '2', '3', '4']);
  assert.deepEqual(flight.tracks[2].dropped, { altitude: 1, position: 0, jump: 23 });
  assert.equal(flight.tracks[2].gaps.length, 25);
  assert.equal(flight.tracks[1].name, '#1');
  assert.deepEqual(flight.cutTracks.map(c => c.slot), [1, 2, 3, 4]);
});

test('if any file fails, nothing loads and the message names that file (C9, #23)', () => {
  const good = { slot: 1, name: 'lead.kml', text: text(1) };
  const e = err(() => loadFlight([good, { slot: 2, name: 'broken.kml', text: '<kml><Document>' }]));
  assert.equal(e?.name, 'KmlError');
  assert.equal(e.code, 'xml');
  assert.match(e.message, /"broken\.kml"/);
  // The same slot twice, a slot outside 1 to 4, too many or no files.
  assert.equal(err(() => loadFlight([good, { ...good, name: 'again.kml' }]))?.code, 'slots');
  assert.equal(err(() => loadFlight([{ ...good, slot: 5 }]))?.code, 'slots');
  assert.equal(err(() => loadFlight([{ ...good, slot: 1.5 }]))?.code, 'slots');
  assert.equal(err(() => loadFlight(Array.from({ length: MAX_TRACKS + 1 }, (_, i) => ({ ...good, slot: i + 1 }))))?.code, 'slots');
  assert.equal(err(() => loadFlight([]))?.code, 'slots');
  assert.equal(MAX_TRACKS, 4);
});

test('a long file name is shortened on loading, so the flight can be saved (review)', async () => {
  const { toDebriefFile } = await import('../../../src/flight-data/debrief-file.js');
  const name = `tracklog-${'x'.repeat(90)}.kml`;
  const flight = loadFlight([{ slot: 1, name, text: text(1) }]);
  assert.equal(flight.tracks[1].name.length, 80);
  assert.equal(flight.tracks[1].name, name.slice(0, 79) + '…');
  assert.equal(flight.files[0].name, flight.tracks[1].name);
  assert.doesNotThrow(() => toDebriefFile(flight, [], {}));
});

test('five files are refused for being five, before any is read (C9)', () => {
  const good = { slot: 1, name: 'lead.kml', text: text(1) };
  const five = [1, 2, 3, 4, 4].map(slot => ({ ...good, slot }));
  assert.match(err(() => loadFlight(five)).message, /between 1 and 4 track files/);
});
