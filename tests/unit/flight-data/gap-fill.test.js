// Checks: a GPS gap that cuts the middle out of a real turn is filled with a smooth banked turn the aircraft could fly,
//   close to where it really went, and always marked as an estimate.
// Serves: DB-R27 (DB-19, DB-20; the PR's one test, DB-Q24).
// Expected values: real recorded data used as input (Lead's level left turn in the example flight, 585aab2601b787ed.kml,
//   the fixes strictly between 18:55:12Z and 18:55:46Z deleted and kept to compare); the turn's bank, G, radius and the
//   chord's miss worked out in the test by standard aerodynamics (tan bank = V x turn rate / g, G = 1 / cos bank,
//   R = V / turn rate); the roll limit is the T-6's (0.45 deg/s per knot of true airspeed, core T6A_ROLL, an estimate
//   used as a physical limit). Margins: the shared table (+-5 deg, +-0.5 G, +-100 ft) except the 500 ft position margin,
//   explained beside it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readKml } from '../../../src/flight-data/kml.js';
import { cleanTrack } from '../../../src/flight-data/clean.js';
import { buildFlight, sampleAt } from '../../../src/flight-data/flight.js';
import { fillGaps, fillSampleAt } from '../../../src/flight-data/gap-fill.js';
import { TOLERANCES } from '../../helpers/tolerances.js';

const G = 32.174; // ft/s², standard gravity
const KT = 1.68781; // ft/s per knot
const at = (hms) => Date.parse(`2026-06-02T${hms}Z`) / 1000;
const deg = (r) => (r * 180) / Math.PI;

test("a turn missing its middle is filled with a smooth bank close to Lead's real path, marked as an estimate", () => {
  const raw = readKml(readFileSync(new URL('../../../original/assets/585aab2601b787ed.kml', import.meta.url), 'utf8'), 'lead');
  const whole = buildFlight({ 1: cleanTrack(raw) }).tracks[1];
  // The fixes logged in the seconds 18:55:12Z and 18:55:46Z stay; everything between them goes (34 s, a real gap's length).
  const iA = whole.fixes.findIndex((f) => Math.floor(f.t) === at('18:55:12'));
  const iB = whole.fixes.findIndex((f) => Math.floor(f.t) === at('18:55:46'));
  assert.ok(iA > 0 && iB - iA > 30, 'the turn is in the example track');
  const cut = whole.fixes.slice(iA + 1, iB);
  const kept = { ...raw, fixes: raw.fixes.filter((f) => !cut.some((c) => c.t === f.t)) };
  const flight = buildFlight({ 1: cleanTrack(kept) });
  const track = flight.tracks[1];
  const A = whole.fixes[iA];
  const B = whole.fixes[iB];

  const { fills } = fillGaps(flight);
  const fill = (fills[1] ?? []).find((f) => f.fromT === A.t && f.toT === B.t);
  assert.ok(fill, 'the gap is filled');

  // Standard aerodynamics on the recorded turn: its track change and ground speed from the real fixes either side.
  const track0 = Math.atan2(A.yFt - whole.fixes[iA - 1].yFt, A.xFt - whole.fixes[iA - 1].xFt);
  const track1 = Math.atan2(whole.fixes[iB + 1].yFt - B.yFt, whole.fixes[iB + 1].xFt - B.xFt);
  const turnRad = Math.abs(Math.atan2(Math.sin(track1 - track0), Math.cos(track1 - track0))); // about 88°
  const T = B.t - A.t;
  const pathFt = cut.reduce((sum, f, i) => sum + Math.hypot(f.xFt - (i ? cut[i - 1] : A).xFt, f.yFt - (i ? cut[i - 1] : A).yFt), 0)
    + Math.hypot(B.xFt - cut[cut.length - 1].xFt, B.yFt - cut[cut.length - 1].yFt);
  const vFtps = pathFt / T; // about 444 ft/s (263 kt)
  const rate = turnRad / T; // about 2.6°/s
  const bankDeg = deg(Math.atan((vFtps * rate) / G)); // about 32°
  const gLevel = 1 / Math.cos((bankDeg * Math.PI) / 180); // about 1.18
  const radiusFt = vFtps / rate; // about 9,800 ft
  const chordMissFt = radiusFt * (1 - Math.cos(turnRad / 2)); // about 2,760 ft: how far the straight line misses the arc's middle

  // Every deleted second: the fill is within 500 ft of the real fix. 500 ft is about 1.1 s of flight at 263 kt and under
  // a fifth of the chord's miss, so it tells a turn from a straight line; the shared table's 100 ft is for flown
  // positions, not a guess across a 34 s hole.
  for (const real of cut) {
    const s = fillSampleAt(fill, real.t);
    const missFt = Math.hypot(s.xFt - real.xFt, s.yFt - real.yFt);
    assert.ok(missFt <= 500, `at +${(real.t - A.t).toFixed(0)} s the fill is ${missFt.toFixed(0)} ft from the real fix`);
    // Height within the shared table's 100 ft of what was recorded (the turn was flown level, ±20 ft).
    assert.ok(Math.abs(s.altFt - real.altFt) <= TOLERANCES.ALTITUDE_FT, `height at +${(real.t - A.t).toFixed(0)} s`);
  }

  // The middle of the fill is on the arc's side of the chord, at least half the chord's miss away from it.
  const mid = cut[Math.floor(cut.length / 2)];
  const side = (p) => ((B.xFt - A.xFt) * (p.yFt - A.yFt) - (B.yFt - A.yFt) * (p.xFt - A.xFt)) / Math.hypot(B.xFt - A.xFt, B.yFt - A.yFt);
  const fillMid = fillSampleAt(fill, mid.t);
  assert.ok(Math.sign(side(fillMid)) === Math.sign(side(mid)), 'the fill bends the same way as the real turn');
  assert.ok(Math.abs(side(fillMid)) >= chordMissFt / 2, `the fill's middle is ${Math.abs(side(fillMid)).toFixed(0)} ft off the chord, the arc's ${chordMissFt.toFixed(0)} ft`);

  // The steady part of the turn: about the bank and G a level turn at that rate and speed needs (shared table margins).
  assert.ok(Math.abs(Math.abs(fillMid.bankDeg) - bankDeg) <= TOLERANCES.ANGLE_DEG, `bank ${fillMid.bankDeg.toFixed(1)}°, expected ${bankDeg.toFixed(1)}°`);
  assert.ok(Math.abs(fillMid.g - gLevel) <= TOLERANCES.G_FORCE, `G ${fillMid.g.toFixed(2)}, expected ${gLevel.toFixed(2)}`);

  // Physical limit, always: the wings never roll faster than the T-6 can at that true airspeed. And every filled moment
  // is marked as an estimate, while the flight model itself still says the ship is in a GPS gap.
  for (let t = A.t; t <= B.t; t += 0.25) {
    const s = fillSampleAt(fill, t);
    assert.ok(Math.abs(s.rollRateDps) <= 0.45 * (s.tasKt ?? vFtps / KT) + 1e-9, `roll rate ${s.rollRateDps.toFixed(1)}°/s at +${(t - A.t).toFixed(2)} s`);
    assert.equal(s.estimated, true);
    if (t > A.t && t < B.t) assert.equal(sampleAt(track, t).inGap, true);
  }
});
