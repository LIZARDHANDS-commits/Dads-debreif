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
