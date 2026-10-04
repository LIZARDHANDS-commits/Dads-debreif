// Checks: the last weather slice at or before the moment (never a later one), slices too old dropped, frames to
//   fetch, scrubber ticks, nearest airfield, age words.
// Serves: DB-R18.
// Expected values: typed-in times and strings; the airfield list comes from src/airfields/catalog.js.

// Weather slices (SPEC-debrief: Weather at the time of the flight): the last
// slice at or before the moment, never one from the future, with its age.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sliceAt, frameTimes, reportTicks, tickLabel, nearestAirfield, ageText, MAX_AGE_S } from '../../../src/modules/debrief/weather/slices.js';
import { CATALOG } from '../../../src/airfields/catalog.js';

const T0 = Date.UTC(2026, 8, 30, 14, 0, 0) / 1000;
const frames = [0, 600, 1200, 1800].map((s) => ({ t: T0 + s, name: `f${s}` }));

test('the slice is the last one at or before the moment, with its age', () => {
  assert.equal(sliceAt(frames, T0 + 700).item.name, 'f600');
  assert.equal(sliceAt(frames, T0 + 700).ageS, 100);
  assert.equal(sliceAt(frames, T0 + 600).item.name, 'f600'); // exactly on a frame
  assert.equal(sliceAt(frames, T0 + 599).item.name, 'f0'); // never the next one
  assert.equal(sliceAt(frames, T0 - 1), null); // before the first
  assert.equal(sliceAt([], T0), null);
});

test('a slice older than its source allows is not shown', () => {
  assert.equal(sliceAt(frames, T0 + 1800 + MAX_AGE_S.satellite, MAX_AGE_S.satellite).item.name, 'f1800');
  assert.equal(sliceAt(frames, T0 + 1801 + MAX_AGE_S.satellite, MAX_AGE_S.satellite), null);
});

test('frames to fetch cover the flight: the one at or before the start, then every step', () => {
  assert.deepEqual(frameTimes(T0 + 250, T0 + 1300, 600), [T0, T0 + 600, T0 + 1200]);
  assert.deepEqual(frameTimes(T0, T0, 600), [T0]);
});

test('scrubber ticks: each report inside the flight, in time order, with its type', () => {
  const reports = [
    { t: T0 + 3600, type: 'METAR' }, { t: T0 - 600, type: 'METAR' }, { t: T0 + 1500, type: 'SPECI' },
  ];
  assert.deepEqual(reportTicks(reports, T0, T0 + 3600), [{ t: T0 + 1500, type: 'SPECI' }, { t: T0 + 3600, type: 'METAR' }]);
});

test('a tick says what it is in words, in UTC, for sight and for a screen reader', () => {
  assert.equal(tickLabel({ t: T0 + 32 * 60, type: 'SPECI' }), 'SPECI 14:32Z');
  assert.equal(tickLabel({ t: T0, type: 'METAR' }), 'METAR 14:00Z');
  assert.equal(tickLabel({ t: T0 - 5 * 3600 + 7 * 60, type: 'METAR' }), 'METAR 09:07Z');
});

test('the nearest airfield to the formation, from the built-in list', () => {
  const list = Object.entries(CATALOG).map(([icao, f]) => ({ icao, ...f }));
  const overMooseJaw = nearestAirfield(list, { lat: 50.33, lon: -105.56 });
  assert.equal(overMooseJaw.icao, 'CYMJ');
  assert.ok(overMooseJaw.nm < 5);
  const overRegina = nearestAirfield(list, { lat: 50.43, lon: -104.66 });
  assert.equal(overRegina.icao, 'CYQR');
  assert.equal(nearestAirfield(list, { lat: NaN, lon: 0 }), null);
  assert.equal(nearestAirfield([{ icao: 'XXXX', lat: null, lon: null }], { lat: 50, lon: -105 }), null);
});

test('ages in words for the corner labels', () => {
  assert.equal(ageText(20), 'at this moment');
  assert.equal(ageText(120), '2 min before');
  assert.equal(ageText(5400), '1 h 30 min before');
  assert.equal(ageText(7200), '2 h before');
});
