// What the flight model means: recorded bank, gaps, ends of the track and so on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readKml } from '../../../src/flight-data/kml.js';
import { buildFlight, sampleAt, headingAt, estimatedGAt, pitchAt, gAt, STILL_KT } from '../../../src/flight-data/flight.js';

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
  assert.equal(sampleAt({ fixes: [{ ...fix(0), xFt: 0, yFt: 0, altFt: 0 }] }, 0).speedKt, undefined);
});

test('latitude and longitude are interpolated like x and y (C6)', () => {
  const fixes = [fix(0, { lat: 50, lon: -105 }), fix(2, { lat: 50.002, lon: -104.996 })];
  const track = buildFlight({ 1: { name: 'a', fixes } }).tracks[1];
  const p = sampleAt(track, 0.5);
  assert.ok(Math.abs(p.lat - 50.0005) < 1e-12);
  assert.ok(Math.abs(p.lon - -104.999) < 1e-12);
  assert.equal(sampleAt(track, 2).lat, 50.002);
});

test('heading is unknown while the aircraft is still, instead of due east (C7, #22)', () => {
  // 1e-4° of longitude at 50° N is about 23.4 ft; one per second is about 14 kt.
  const fixes = [fix(0, { lon: -105 }), fix(1, { lon: -105 }), fix(2, { lon: -105 + 1e-6 }), fix(3, { lon: -105 + 1e-4 }), fix(4, { lon: -105 + 2e-4 })];
  const track = buildFlight({ 1: { name: 'a', fixes } }).tracks[1];
  assert.equal(STILL_KT, 3);
  assert.equal(headingAt(track, -5), null); // duplicate fixes at the start
  assert.equal(headingAt(track, 0.5), null);
  assert.equal(headingAt(track, 1.5), null); // 0.23 ft in a second: GPS jitter on the ramp
  assert.equal(headingAt(track, 2.5), 0); // moving east at taxi speed
  assert.equal(headingAt(track, 10), 0);
  // Just either side of 3 kt.
  const ftPerDegLon = 6371000 * Math.PI / 180 * Math.cos(50 * Math.PI / 180) * 3.28084;
  const at = kt => headingAt(buildFlight({ 1: { name: 'a', fixes: [fix(0, { lon: -105 }), fix(1, { lon: -105 + kt / 0.592484 / ftPerDegLon })] } }).tracks[1], 0.5);
  assert.equal(at(2.99), null);
  assert.equal(at(3.01), 0);
});

test('no G is estimated where the heading is unknown (C7)', () => {
  // Fast enough over the window overall, but still at its start.
  const fixes = [fix(0, { lon: -105 }), fix(1, { lon: -105 }), fix(2, { lon: -105 + 1e-3 }), fix(3, { lon: -105 + 2e-3, lat: 50.0005 }), fix(4, { lon: -105 + 3e-3, lat: 50.0015 })];
  const track = buildFlight({ 1: { name: 'a', fixes } }).tracks[1];
  assert.equal(headingAt(track, 0.5), null);
  assert.equal(estimatedGAt(track, 2), null);
  assert.ok(estimatedGAt(track, 3) > 1);
});

const fixesFrom = (t0, n = 3) => Array.from({ length: n }, (_, k) => ({ t: t0 + k, lat: 50 + k * 1e-3, lon: -105, altM: 1000, gRecorded: null, pitchRecordedDeg: null, bankRecordedDeg: null }));
const err = fn => { try { fn(); } catch (e) { return e; } return null; };

test('tracks that do not overlap in time are refused, naming the one that does not fit (C8)', () => {
  const e = err(() => buildFlight({ 1: { name: 'lead.kml', fixes: fixesFrom(0, 10) }, 2: { name: 'two.kml', fixes: fixesFrom(5, 10) }, 3: { name: 'tuesday.kml', fixes: fixesFrom(86400) } }));
  assert.equal(e?.code, 'no-overlap');
  assert.match(e.message, /"tuesday\.kml".*doesn't overlap/);
  assert.doesNotMatch(e.message, /lead\.kml|two\.kml/);
  // Meeting at one instant is not an overlap either.
  assert.equal(err(() => buildFlight({ 1: { name: 'a', fixes: fixesFrom(0) }, 2: { name: 'b', fixes: fixesFrom(2) } }))?.code, 'no-overlap');
  // With two tracks neither fits better, so the later ship is named.
  assert.match(err(() => buildFlight({ 1: { name: 'a', fixes: fixesFrom(0) }, 4: { name: 'b', fixes: fixesFrom(100) } })).message, /"b"/);
});

test('the window is the time all tracks share, and says how much of each was cut (C8)', () => {
  const flight = buildFlight({ 1: { name: 'a', fixes: fixesFrom(0, 10) }, 2: { name: 'b', fixes: fixesFrom(3, 4) }, 3: { name: 'c', fixes: fixesFrom(2, 12) } });
  assert.deepEqual([flight.startT, flight.endT], [3, 6]);
  assert.deepEqual(flight.cutTracks, [{ slot: 1, beforeS: 3, afterS: 3 }, { slot: 3, beforeS: 1, afterS: 7 }]);
  assert.deepEqual(buildFlight({ 1: { name: 'a', fixes: fixesFrom(0) } }).cutTracks, []);
});


test('pitch and G are estimated from the track by default; recorded values only when asked (C10, Q32)', () => {
  // Climbing, turning, with recorded pitch 12° and G 3 on every fix.
  const fixes = Array.from({ length: 12 }, (_, i) => fix(i, {
    lat: 50 + 0.005 * Math.sin(i * 0.1), lon: -105 + 0.008 * Math.cos(i * 0.1), altM: 1000 + 10 * i, pitchRecordedDeg: 12, gRecorded: 3,
  }));
  const track = buildFlight({ 1: { name: 'a', fixes } }).tracks[1];
  const p = pitchAt(track, 5);
  assert.equal(p.source, 'estimated');
  assert.notEqual(p.deg, 12);
  assert.deepEqual(pitchAt(track, 5, { recorded: true }), { deg: 12, source: 'recorded' });
  const g = gAt(track, 5);
  assert.equal(g.source, 'estimated');
  assert.equal(g.g, estimatedGAt(track, 5));
  assert.deepEqual(gAt(track, 5, { recorded: true }), { g: 3, source: 'recorded' });
  // Asked for recorded values where there are none: estimated, as V6 did.
  const bare = buildFlight({ 1: { name: 'a', fixes: fixes.map(f => ({ ...f, pitchRecordedDeg: null, gRecorded: null })) } }).tracks[1];
  assert.equal(pitchAt(bare, 5, { recorded: true }).source, 'estimated');
  assert.deepEqual(gAt(bare, 5, { recorded: true }), { g: estimatedGAt(bare, 5), source: 'estimated' });
  // The recorded values are still kept on the samples.
  assert.equal(sampleAt(track, 5.5).pitchRecordedDeg, 12);
});

test('a track whose fixes all have the same time is refused, not played for zero seconds (review)', () => {
  const e = err(() => buildFlight({ 1: { name: 'still.kml', fixes: [fix(5), fix(5, { lon: -105.001 })] } }));
  assert.equal(e?.code, 'no-overlap');
  assert.match(e.message, /"still\.kml" covers no time/);
});

test('the ends of a track are never "in a gap", even when the first or last segment is one (C4)', () => {
  const track = buildFlight({ 1: { name: 'a', fixes: [fix(0), fix(10), fix(11), fix(21)] } }).tracks[1];
  assert.equal(sampleAt(track, 0).inGap, false);
  assert.equal(sampleAt(track, 21).inGap, false);
  assert.equal(sampleAt(track, 5).inGap, true);
  // A lone fix has no segment: its sample after it is the fix, with no speed.
  assert.equal(sampleAt({ fixes: [{ ...fix(0), xFt: 0, yFt: 0, altFt: 0 }] }, 1).speedKt, undefined);
});

test('tracks that only touch are not counted as overlapping when naming the misfit (C8)', () => {
  // a ends when b starts; c overlaps b only. a is the one that fits nowhere.
  const e = err(() => buildFlight({ 1: { name: 'a', fixes: fixesFrom(0) }, 2: { name: 'b', fixes: fixesFrom(2) }, 3: { name: 'c', fixes: fixesFrom(3) } }));
  assert.match(e.message, /^"a"/);
});

// D32 (verification M4, 30 Sep 2026): a jump across a GPS gap read as 8.29 G on
// the example flight. No estimated G when its ±1.5 s window touches a gap.
test('no estimated G when its window touches a GPS gap; the same G either side of it', () => {
  // A steady turn, one fix a second, with 8 s missing in the middle.
  const turn = [];
  for (let t = 0; t <= 40; t++) {
    if (t > 20 && t < 28) continue;
    const a = t * 0.05;
    turn.push(fix(t, { lat: 50 + 0.01 * Math.sin(a), lon: -105 + 0.0156 * (1 - Math.cos(a)) }));
  }
  const flight = buildFlight({ 1: { name: 'turn', fixes: turn } });
  const tr = flight.tracks[1];
  const t0 = flight.startT;
  assert.ok(Number.isFinite(estimatedGAt(tr, t0 + 10)));
  assert.equal(estimatedGAt(tr, t0 + 19.6), null); // window reaches 21.1, inside the gap
  assert.equal(estimatedGAt(tr, t0 + 24), null);
  assert.equal(estimatedGAt(tr, t0 + 29.4), null); // window starts at 27.9, still in the gap
  assert.ok(Number.isFinite(estimatedGAt(tr, t0 + 30)));
  assert.equal(gAt(tr, t0 + 24).g, null);
});

test('the example flight never shows an estimated G above the T-6\'s 7 G', () => {
  const ids = { 1: '585aab2601b787ed', 2: '3ee2a7e81a74880c', 3: '3085ab3861e2bae6', 4: '46e14716b39044c4' };
  const flight = buildFlight(Object.fromEntries(Object.entries(ids).map(([slot, id]) => [slot, { name: id, fixes: example(id) }])));
  let worst = 0;
  for (const tr of Object.values(flight.tracks)) {
    for (let t = Math.ceil(flight.startT); t <= flight.endT; t++) worst = Math.max(worst, estimatedGAt(tr, t) ?? 0);
  }
  assert.ok(worst <= 7, `highest estimated G ${worst.toFixed(2)}`);
});
