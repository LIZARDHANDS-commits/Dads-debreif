// Golden test (R9, D10): src/flight-data/flight.js puts the tracks on the map and
// samples them exactly as V6's own projectAll, interpTrack, headingAtTrack,
// aircraftPitchAtTrack and estimatedGAtTrack do, run unchanged next to it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readKml } from '../../src/flight-data/kml.js';
import { buildFlight, sampleAt, headingAt, pitchAt, estimatedGAt, STILL_KT, EST_G_MAX } from '../../src/flight-data/flight.js';
import { loadV6 } from './v6-source.js';
import { spread } from './inputs.js';

// The globals V6's functions read, with the page (el) stubbed out.
const PRELUDE = `
  const KML_FT_PER_M=3.28084, KML_KT_PER_FPS=0.592484;
  let tracks={}, kmlRef=null, kmlStart=0, kmlEnd=0, kmlT=0, kmlPan={x:0,y:0};
  const el=()=>({});
  function setTracks(t){tracks=t}
  function state(){return {tracks,kmlRef,kmlStart,kmlEnd}}`;
const v6 = loadV6(['projectAll', 'interpTrack', 'headingAtTrack', 'aircraftPitchAtTrack', 'estimatedGAtTrack', 'normAngleRad', 'rad2deg'],
  { prelude: PRELUDE, expose: ['setTracks', 'state'] });

const EXAMPLES = { 1: '585aab2601b787ed', 2: '3ee2a7e81a74880c', 4: '46e14716b39044c4', 3: '3085ab3861e2bae6' };
const read = id => readFileSync(new URL(`../../original/assets/${id}.kml`, import.meta.url), 'utf8');
const toV6 = f => ({ lon: f.lon, lat: f.lat, altm: f.altM, t: f.t, gNative: f.gRecorded, pitchNative: f.pitchRecordedDeg });

/** Loads the same slots into V6 and the port. */
function load(slots) {
  const ours = {};
  const theirs = {};
  for (const slot of slots) {
    const { fixes } = readKml(read(EXAMPLES[slot]), `#${slot}`);
    ours[slot] = { name: `#${slot}`, fixes };
    theirs[slot] = { id: slot, name: `#${slot}`, raw: fixes.map(toV6), pts: [] };
  }
  v6.setTracks(theirs);
  v6.projectAll();
  return { flight: buildFlight(ours), v6: v6.state() };
}

/** The pair of V6 points around t, as interpTrack picks them (inside the track only). */
function pairAt(pts, t) {
  let lo = 0;
  let hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].t < t) lo = mid;
    else hi = mid;
  }
  return [pts[lo], pts[lo + 1]];
}
const segmentKt = (a, b) => Math.hypot(b.x - a.x, b.y - a.y) / (b.t - a.t || 1) * 0.592484;

const SAME_POINT = (ours, theirs, where, pts) => {
  assert.equal(ours.xFt, theirs.x, `x ${where}`);
  assert.equal(ours.yFt, theirs.y, `y ${where}`);
  assert.equal(ours.altFt, theirs.altFt, `altFt ${where}`);
  assert.equal(ours.t, theirs.t, `t ${where}`);
  const n = pts.length;
  if (theirs.t <= pts[0].t || theirs.t >= pts[n - 1].t) {
    // C6 (decided): at the ends V6 gave no speed; ours is the end segment's speed.
    assert.equal(theirs.spdKt, undefined, `V6 end speed ${where}`);
    const [a, b] = theirs.t <= pts[0].t ? [pts[0], pts[1]] : [pts[n - 2], pts[n - 1]];
    assert.equal(ours.speedKt, segmentKt(a, b), `end speed ${where}`);
    assert.equal(ours.lat, theirs.lat, `lat ${where}`);
    assert.equal(ours.lon, theirs.lon, `lon ${where}`);
  } else {
    assert.equal(ours.speedKt, theirs.spdKt, `speed ${where}`);
    // C6 (decided): V6 used the earlier fix's lat/lon; ours are interpolated like x and y.
    const [a, b] = pairAt(pts, theirs.t);
    assert.equal(theirs.lat, a.lat, `V6 lat ${where}`);
    const k = (theirs.t - a.t) / (b.t - a.t || 1);
    assert.equal(ours.lat, a.lat + (b.lat - a.lat) * k, `lat ${where}`);
    assert.equal(ours.lon, a.lon + (b.lon - a.lon) * k, `lon ${where}`);
  }
  assert.equal(ours.gRecorded, theirs.gNative, `G ${where}`);
  assert.equal(ours.pitchRecordedDeg, theirs.pitchNative, `pitch ${where}`);
};

/** Whether the aircraft is still over V6's pair of points for t, under C7's rule. */
function stillAt(pts, t) {
  const n = pts.length;
  const [a, b] = t <= pts[0].t ? [pts[0], pts[1]] : t >= pts[n - 1].t ? [pts[n - 2], pts[n - 1]] : pairAt(pts, t);
  return segmentKt(a, b) < STILL_KT;
}

/** C7 (decided): heading is null where the aircraft is still; elsewhere it is V6's. */
function SAME_HEADING(ours, pts, t, where) {
  const theirs = v6.headingAtTrack({ pts }, t);
  if (stillAt(pts, t)) assert.equal(ours, null, `heading ${where}`);
  else assert.equal(ours, theirs, `heading ${where}`);
}

/** True when a pair of fixes more than 5 s apart (a GPS gap, C4) overlaps t0 to t1. */
function gapIn(pts, t0, t1) {
  return pts.some((p, i) => i > 0 && p.t >= t0 && pts[i - 1].t < t1 && p.t - pts[i - 1].t > 5);
}

/**
 * C7 (decided): no estimated G where the heading at either end of V6's window is unknown.
 * D32 (verification M4, 30 Sep 2026): none where the window touches a GPS gap either, and none
 * above the T-6's 7 G (V6 allowed 9). Elsewhere V6's.
 */
function SAME_G(ours, pts, t, where, windowS = 1.5) {
  const theirs = v6.estimatedGAtTrack({ pts }, t);
  const t0 = Math.max(pts[0].t, t - windowS);
  const t1 = Math.min(pts[pts.length - 1].t, t + windowS);
  if (pts.length >= 3 && (stillAt(pts, t0) || stillAt(pts, t1))) assert.equal(ours, null, `est G ${where}`);
  else if (pts.length >= 3 && t1 - t0 >= 0.5 && gapIn(pts, t0, t1)) assert.equal(ours, null, `est G across a gap ${where}`);
  else if (theirs !== null && theirs > EST_G_MAX) assert.equal(ours, null, `est G above ${EST_G_MAX} ${where}`);
  else assert.equal(ours, theirs, `est G ${where}`);
}

const SOURCE = { recorded: 'native aircraft pitch', estimated: 'estimated flight path', default: 'default' };

for (const slots of [[1, 2, 3, 4], [3], [2, 4]]) {
  test(`buildFlight and sampling match V6 for tracks ${slots.join(', ')}`, () => {
    const { flight, v6: s } = load(slots);
    assert.deepEqual(flight.ref, s.kmlRef);
    assert.equal(flight.startT, s.kmlStart);
    assert.equal(flight.endT, s.kmlEnd);
    for (const slot of slots) {
      const ours = flight.tracks[slot];
      const theirs = s.tracks[slot];
      const unrecorded = { pts: theirs.pts.map(p => ({ ...p, pitchNative: null })) };
      ours.fixes.forEach((f, i) => {
        assert.equal(f.xFt, theirs.pts[i].x);
        assert.equal(f.yFt, theirs.pts[i].y);
        assert.equal(f.altFt, theirs.pts[i].altFt);
      });
      const first = ours.fixes[0].t;
      const last = ours.fixes[ours.fixes.length - 1].t;
      // Seeded times over the whole track and a little beyond it, plus every fix time and the ends.
      const times = [...spread(1500, first - 30, last + 30, 0xf117 + slot), first, last, ...ours.fixes.slice(0, 200).map(f => f.t),
        ...ours.fixes.slice(0, 50).map(f => f.t + 0.25)];
      for (const t of times) {
        const where = `#${slot} at ${t}`;
        SAME_POINT(sampleAt(ours, t), v6.interpTrack(theirs, t), where, theirs.pts);
        SAME_HEADING(headingAt(ours, t), theirs.pts, t, where);
        // Asked for recorded pitch, ours is V6's.
        const p = pitchAt(ours, t, { recorded: true });
        const q = v6.aircraftPitchAtTrack(theirs, t);
        assert.equal(p.deg, q.deg, `pitch ${where}`);
        assert.equal(SOURCE[p.source], q.source, `pitch source ${where}`);
        // C10 (decided): by default recorded pitch is not used; ours is V6's estimate on the same track without it.
        const e = pitchAt(ours, t);
        const qe = v6.aircraftPitchAtTrack(unrecorded, t);
        assert.equal(e.deg, qe.deg, `estimated pitch ${where}`);
        assert.equal(SOURCE[e.source], qe.source, `estimated pitch source ${where}`);
        SAME_G(estimatedGAt(ours, t), theirs.pts, t, where);
      }
    }
  });
}

test('tracks that do not overlap: V6 played the whole span; now they are refused (C8)', () => {
  const a = readKml(read(EXAMPLES[1])).fixes;
  const moved = a.map(f => ({ ...f, t: f.t + 86400 }));
  v6.setTracks({ 1: { id: 1, raw: a.map(toV6), pts: [] }, 2: { id: 2, raw: moved.map(toV6), pts: [] } });
  v6.projectAll();
  const s = v6.state();
  assert.ok(s.kmlEnd - s.kmlStart > 86400);
  assert.throws(() => buildFlight({ 1: { name: 'a', fixes: a }, 2: { name: 'b', fixes: moved } }), { code: 'no-overlap' });
});

test('short and single-fix tracks give V6\'s defaults', () => {
  const one = { fixes: [{ t: 10, xFt: 0, yFt: 0, altFt: 0, lat: 50, lon: -105, gRecorded: null, pitchRecordedDeg: null }] };
  const theirs = { pts: [{ t: 10, x: 0, y: 0, altFt: 0, lat: 50, lon: -105, gNative: null, pitchNative: null }] };
  for (const t of [0, 10, 20]) {
    assert.equal(v6.headingAtTrack(theirs, t), 0);
    assert.equal(headingAt(one, t), null); // C7: no heading from one fix (V6: due east)
    assert.deepEqual([pitchAt(one, t).deg, SOURCE[pitchAt(one, t).source]], Object.values(v6.aircraftPitchAtTrack(theirs, t)));
    assert.equal(estimatedGAt(one, t), v6.estimatedGAtTrack(theirs, t));
  }
  assert.equal(sampleAt({ fixes: [] }, 5), v6.interpTrack({ pts: [] }, 5));
});

test('edge-case tracks match V6: tiny spans, steep dives, slow movers, two fixes', () => {
  // Built to sit on each of V6's thresholds: 0.25 s and 0.5 s windows, 20 ft of
  // travel, the ±30° pitch cap, 20 ft/s, and tracks of 2 and 3 fixes.
  const make = (pts) => pts.map(([t, x, y, altFt]) => ({ t, xFt: x, yFt: y, altFt, lat: 50, lon: -105, gRecorded: null, pitchRecordedDeg: null }));
  const cases = {
    twoFixes: make([[0, 0, 0, 1000], [1, 300, 0, 1000]]),
    span027: make([[0, 0, 0, 1000], [0.13, 40, 0, 1000], [0.27, 80, 5, 1000]]),
    span055: make([[0, 0, 0, 1000], [0.3, 90, 0, 1000], [0.55, 160, 20, 1000]]),
    steepDive: make([[0, 0, 0, 5000], [1, 200, 0, 4850], [2, 400, 0, 4700], [3, 600, 0, 4550]]),
    steepClimb: make([[0, 0, 0, 5000], [1, 200, 0, 5150], [2, 400, 0, 5300], [3, 600, 0, 5450]]),
    slow: make([[0, 0, 0, 1000], [1, 6.5, 0, 1001], [2, 13, 0, 1002], [3, 19.5, 0, 1003], [4, 26, 1, 1004]]),
    turning: make(Array.from({ length: 12 }, (_, i) => [i, 3000 * Math.cos(i * 0.1), 3000 * Math.sin(i * 0.1), 3000])),
  };
  for (const [name, fixes] of Object.entries(cases)) {
    const ours = { fixes };
    const theirs = { pts: fixes.map(f => ({ t: f.t, x: f.xFt, y: f.yFt, altFt: f.altFt, lat: f.lat, lon: f.lon, gNative: null, pitchNative: null })) };
    const last = fixes[fixes.length - 1].t;
    for (let t = -0.5; t <= last + 0.5; t += 0.01) {
      const where = `${name} at ${t}`;
      const p = pitchAt(ours, t);
      const q = v6.aircraftPitchAtTrack(theirs, t);
      assert.equal(p.deg, q.deg, `pitch ${where}`);
      assert.equal(SOURCE[p.source], q.source, `pitch source ${where}`);
      SAME_G(estimatedGAt(ours, t), theirs.pts, t, where);
    }
  }
});

test('tracks that meet at one instant: V6 played the whole span; now they are refused (C8)', () => {
  const at = (t0) => [0, 1, 2].map(k => ({ t: t0 + k, lat: 50 + k * 1e-3, lon: -105, altM: 1000, gRecorded: null, pitchRecordedDeg: null }));
  const a = at(0);
  const b = at(2); // a ends when b starts
  v6.setTracks({ 1: { id: 1, raw: a.map(toV6), pts: [] }, 2: { id: 2, raw: b.map(toV6), pts: [] } });
  v6.projectAll();
  assert.deepEqual([v6.state().kmlStart, v6.state().kmlEnd], [0, 4]);
  assert.throws(() => buildFlight({ 1: { name: 'a', fixes: a }, 2: { name: 'b', fixes: b } }), { code: 'no-overlap' });
});
