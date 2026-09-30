// Golden test (R9, D10): the debrief's readout rows put together flight-data
// and core exactly as V6's own readout code does (updateKmlAspectHca,
// closureRateKt, classifyKmlError, lines 3041 to 3230), run unchanged next to
// it on the example flight. Both are fed the same cleaned fixes, so this pins
// how the readouts pick their moments and ships, not the cleaning (pinned in
// flight-data's own golden tests).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadExampleFlight } from '../../src/flight-data/examples.js';
import { V6_STANDARDS } from '../../src/core/standards.js';
import { readoutsAt } from '../../src/modules/debrief/readouts.js';
import { loadV6 } from './v6-source.js';

// V6's globals, with the page stubbed: el(id) gives a setting's box, or an empty one.
const PRELUDE = `
  const KML_FT_PER_M=3.28084, KML_KT_PER_FPS=0.592484;
  let tracks={}, kmlRef=null, kmlStart=0, kmlEnd=0, kmlT=0, kmlPan={x:0,y:0}, kmlErrors={}, boxes={};
  const el=(id)=>boxes[id]??{};
  function setUp(t, start, settings){tracks=t; kmlStart=start; boxes=settings}
  function setTime(t){kmlT=t}`;
const v6 = loadV6([
  'projectAll', 'interpTrack', 'headingAtTrack', 'interpTrackWithError', 'offsetKmlPoint', 'normAngleRad', 'absAngleDeg',
  'rad2deg', 'aspectAngleDeg', 'headingCrossAngleDeg', 'closureRateKt', 'kmlAxes', 'numSetting', 'settingOn', 'classifyKmlError',
], { prelude: PRELUDE, expose: ['setUp', 'setTime'] });

const fromRepo = async (asset) => readFileSync(new URL(`../../original/assets/${asset}`, import.meta.url), 'utf8');
const flight = await loadExampleFlight(fromRepo);

// V6 gets the same (cleaned) fixes, with the offset standard off: with it on,
// #3's labels differ from V6 on purpose (D78, pinned in core's golden test).
const SPREAD_ONLY = { ...V6_STANDARDS, offset: { ...V6_STANDARDS.offset, on: false } };
const v6Tracks = Object.fromEntries(Object.values(flight.tracks).map((tr) => [tr.slot, {
  id: tr.slot,
  name: tr.name,
  raw: tr.fixes.map((f) => ({ lon: f.lon, lat: f.lat, altm: f.altM, t: f.t, gNative: f.gRecorded, pitchNative: f.pitchRecordedDeg })),
  pts: [],
}]));
v6.setUp(v6Tracks, flight.startT, { kmlStdOffset: { value: 'off' } });
v6.projectAll();

// Every 7 s across the flight, well inside the window.
const times = [];
for (let t = flight.startT + 2; t < flight.endT - 2; t += 7) times.push(t);

test('range, aspect, HCA and closure versus Lead match V6 (R9)', () => {
  let compared = 0;
  for (const t of times) {
    v6.setTime(t);
    const ours = readoutsAt(flight, t, { standards: SPREAD_ONLY });
    for (const row of ours.vsLead) {
      const lead = v6.interpTrackWithError(v6Tracks[1], t);
      const p = v6.interpTrackWithError(v6Tracks[row.slot], t);
      const leadH = v6.headingAtTrack(v6Tracks[1], t);
      const h = v6.headingAtTrack(v6Tracks[row.slot], t);
      assert.equal(row.rangeFt, Math.hypot(p.x - lead.x, p.y - lead.y), `range #${row.slot} at ${t}`);
      assert.equal(row.closureKt, v6.closureRateKt(1, row.slot, 1.0), `closure #${row.slot} at ${t}`);
      // C7: a still aircraft has no heading (V6 made one up from GPS jitter), so no aspect or HCA.
      const shipStill = !ours.ships.find((s) => s.slot === row.slot).headingKnown;
      const leadStill = !ours.ships[0].headingKnown;
      if (leadStill) assert.equal(row.aspectDeg, null);
      else assert.equal(row.aspectDeg, v6.aspectAngleDeg(lead, p, leadH), `aspect #${row.slot} at ${t}`);
      if (leadStill || shipStill) assert.equal(row.hcaDeg, null);
      else {
        assert.equal(row.hcaDeg, v6.headingCrossAngleDeg(leadH, h), `HCA #${row.slot} at ${t}`);
        compared++;
      }
    }
  }
  assert.ok(compared > 1000, `compared ${compared} moving rows`);
});

test('horizontal spacing and closure for every pair match V6 (R9)', () => {
  for (const t of times.filter((_, i) => i % 5 === 0)) {
    v6.setTime(t);
    for (const pair of readoutsAt(flight, t, { standards: SPREAD_ONLY }).pairs) {
      const a = v6.interpTrackWithError(v6Tracks[pair.a], t);
      const b = v6.interpTrackWithError(v6Tracks[pair.b], t);
      assert.equal(pair.horizontalFt, Math.hypot(a.x - b.x, a.y - b.y));
      assert.equal(pair.closureKt, v6.closureRateKt(pair.a, pair.b, 1.0));
    }
  }
});

test('each wingman\'s position labels match V6 wherever the debrief shows one (R9)', () => {
  let compared = 0;
  const states = new Set();
  for (const t of times) {
    v6.setTime(t);
    for (const row of readoutsAt(flight, t, { standards: SPREAD_ONLY }).formation) {
      states.add(row.state);
      if (row.state !== 'ok') continue; // gaps and a still Lead show no label (D32, D52)
      const theirs = v6.classifyKmlError(row.slot, Object.fromEntries(
        Object.keys(v6Tracks).map((id) => [id, v6.interpTrackWithError(v6Tracks[id], t)]),
      ));
      assert.deepEqual(row.labels, theirs.labels, `#${row.slot} at ${t}`);
      assert.equal(row.intervalFt, theirs.intervalFt);
      assert.equal(row.foreAftFt, theirs.foreAftFt);
      compared++;
    }
  }
  assert.ok(compared > 500, `compared ${compared} labels`);
  assert.ok(states.has('gap') && states.has('no-heading'), 'the example flight has gaps and a parked Lead');
});
