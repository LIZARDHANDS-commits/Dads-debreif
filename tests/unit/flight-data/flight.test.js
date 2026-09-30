// What the flight model means: recorded bank, gaps, ends of the track and so on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readKml } from '../../../src/flight-data/kml.js';
import { buildFlight, sampleAt } from '../../../src/flight-data/flight.js';

const example = id => readKml(readFileSync(new URL(`../../../original/assets/${id}.kml`, import.meta.url), 'utf8')).fixes;
const fix = (t, extra = {}) => ({ t, lat: 50, lon: -105 + t * 1e-4, altM: 1000, gRecorded: null, pitchRecordedDeg: null, bankRecordedDeg: null, ...extra });

test('recorded bank is read when a track has it (C2, D47)', () => {
  const three = example('3085ab3861e2bae6');
  assert.ok(three.every(f => Number.isFinite(f.bankRecordedDeg)));
  assert.equal(Math.min(...three.map(f => f.bankRecordedDeg)), -141.08);
  // #1's bank column is blank, so there is no recorded bank.
  assert.ok(example('585aab2601b787ed').every(f => f.bankRecordedDeg === null));
});

test('recorded bank is interpolated the short way round (C2)', () => {
  const flight = buildFlight({ 1: { name: 'a', fixes: [fix(0, { bankRecordedDeg: 170 }), fix(1, { bankRecordedDeg: -170 }), fix(2, { bankRecordedDeg: 10 })] } });
  const track = flight.tracks[1];
  assert.equal(sampleAt(track, 0.5).bankRecordedDeg, 180);
  assert.ok(Math.abs(sampleAt(track, 0.25).bankRecordedDeg - 175) < 1e-9);
  assert.ok(Math.abs(sampleAt(track, 0.75).bankRecordedDeg - -175) < 1e-9);
  assert.ok(Math.abs(sampleAt(track, 1.5).bankRecordedDeg - -80) < 1e-9);
  const oneSided = buildFlight({ 1: { name: 'a', fixes: [fix(0, { bankRecordedDeg: 30 }), fix(1)] } });
  assert.equal(sampleAt(oneSided.tracks[1], 0.5).bankRecordedDeg, 30);
});

const kmlWith = (body, bank) => `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"><Document><Placemark>
  ${body}<gx:SimpleArrayData name="bank">${bank.map(v => `<gx:value>${v}</gx:value>`).join('')}</gx:SimpleArrayData></Placemark></Document></kml>`;
const WHEN = ['2026-09-25T15:00:00Z', '2026-09-25T15:00:01Z', '2026-09-25T15:00:02Z', '2026-09-25T15:00:03Z'].map(w => `<when>${w}</when>`).join('');

test('recorded bank up to ±180° is kept, beyond it is missing (C2)', () => {
  const coords = [0, 1, 2, 3].map(i => `<gx:coord>-105.${i} 50 1000</gx:coord>`).join('');
  const fixes = readKml(kmlWith(WHEN + coords, [180, -180, 180.5, 30])).fixes;
  assert.deepEqual(fixes.map(f => f.bankRecordedDeg), [180, -180, null, 30]);
});

test('with plain coordinate lists, bank lines up by the running fix count, as G and pitch do in V6 (C2)', () => {
  const lists = '<LineString><coordinates>-105.0,50,1000 -105.1,50,1000</coordinates></LineString>'
    + '<LineString><coordinates>-105.2,50,1000 -105.3,50,1000</coordinates></LineString>';
  const fixes = readKml(kmlWith(WHEN + lists, [10, 20, 30, 40])).fixes;
  const byLon = Object.fromEntries(fixes.map(f => [f.lon, f.bankRecordedDeg]));
  assert.deepEqual(byLon, { '-105': 10, '-105.1': 20, '-105.2': 30, '-105.3': 40 });
});

test('sampleAt says when a time falls inside a gap of more than 5 s (C4)', () => {
  const track = buildFlight({ 1: { name: 'a', fixes: [fix(0), fix(1), fix(6), fix(11.5), fix(12)] } }).tracks[1];
  const inGap = t => sampleAt(track, t).inGap;
  assert.deepEqual([-1, 0, 0.5, 1, 3, 6, 6.01, 11, 11.5, 11.8, 12, 13].map(inGap),
    [false, false, false, false, false, false, true, true, false, false, false, false]);
});

test('the first and last frame show the speed of the nearest segment, not none (C6, #24)', () => {
  const fixes = [fix(0), fix(1, { lon: -105 + 2e-4 }), fix(3, { lon: -105 + 8e-4 })];
  const track = buildFlight({ 1: { name: 'a', fixes } }).tracks[1];
  const first = sampleAt(track, 0.5).speedKt;
  const last = sampleAt(track, 2).speedKt;
  assert.ok(first > 0 && last > 0 && Math.abs(first - last) > 1);
  for (const t of [-10, 0]) assert.equal(sampleAt(track, t).speedKt, first);
  for (const t of [3, 10]) assert.equal(sampleAt(track, t).speedKt, last);
  // A single fix has no segment, so no speed.
  assert.equal(sampleAt(buildFlight({ 1: { name: 'a', fixes: [fix(0)] } }).tracks[1], 0).speedKt, undefined);
});

test('latitude and longitude are interpolated like x and y (C6)', () => {
  const fixes = [fix(0, { lat: 50, lon: -105 }), fix(2, { lat: 50.002, lon: -104.996 })];
  const track = buildFlight({ 1: { name: 'a', fixes } }).tracks[1];
  const p = sampleAt(track, 0.5);
  assert.ok(Math.abs(p.lat - 50.0005) < 1e-12);
  assert.ok(Math.abs(p.lon - -104.999) < 1e-12);
  assert.equal(sampleAt(track, 2).lat, 50.002);
});
