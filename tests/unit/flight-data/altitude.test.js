// Checks: the altitude check (DB-28): two ships that taxi, fly level side by side and taxi in, one GPS reading 30 ft high at taxi out and
//   40 ft high at taxi in, come out level with each other in the air and the same height above the ground while parked.
// Serves: DB-R28 (the 3D shows the aircraft where they were) and Dad's ask of 11 Oct 2026 ("Each aircraft should be taxiing on the same
//   plane ... that should help with the altitude error").
// Expected values: from the constructed tracks: both ships truly at the same height (wingtip to wingtip, level), #2's GPS 30 ft high at
//   taxi out drifting to 40 ft at taxi in. Margin 10 ft, tighter than the shared ±100 ft because the tracks carry no other error: the
//   check has only the constructed 30 to 40 ft to take out, and 10 ft is a quarter of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFlight, sampleAt } from '../../../src/flight-data/flight.js';
import { altitudeCheck, correctAltitudes } from '../../../src/flight-data/altitude.js';

const FT_PER_DEG_LAT = 364000; // about, at 50° N: only needs to be consistent between the track and the terrain below
const LAT0 = 50.33;
const LON0 = -105.56;
const KT = 6076 / 3600; // ft/s per knot
/** The ground: rising 3 ft per 1,000 ft northward (a sloping field, then a higher one at the landing end). */
const terrainFt = (lat) => 1800 + 0.003 * (lat - LAT0) * FT_PER_DEG_LAT;
const refAt = (lat) => terrainFt(lat);

/** Speed (kt) at second t: parked, taxi out at 15 kt, airborne at 150 kt, taxi in at 15 kt, parked. */
const speedKt = (t) => (t < 120 ? 0 : t < 180 ? 15 : t < 1020 ? 150 : t < 1080 ? 15 : 0);
const LAND_T = 1020;

/** One ship's fixes: `eastFt` beside the other, its GPS reading `errorAt(t)` feet high. True height: the ground (plus 6 ft to the reference point) on the ground, 3,000 ft above the take-off point in the air. */
function ship(eastFt, errorAt) {
  const fixes = [];
  let north = 0;
  let airborneFt = null;
  for (let t = 0; t <= 1140; t++) {
    if (t > 0) north += speedKt(t) * KT;
    const lat = LAT0 + north / FT_PER_DEG_LAT;
    const lon = LON0 + eastFt / (FT_PER_DEG_LAT * Math.cos((LAT0 * Math.PI) / 180));
    const flying = speedKt(t) >= 150;
    if (flying && airborneFt === null) airborneFt = terrainFt(LAT0) + 3000;
    // Level in the air, then straight down to the landing field's ground in the last second (a constructed landing, nothing judged on it).
    const trueFt = flying && t < LAND_T - 1 ? airborneFt : terrainFt(lat) + 6;
    fixes.push({ t: 1.7e9 + t, lat, lon, altM: (trueFt + errorAt(t)) / 3.28084, gRecorded: null, pitchRecordedDeg: null, bankRecordedDeg: null });
  }
  return fixes;
}

test('two ships level side by side read level after the altitude check, and park at the same height above the ground', () => {
  const drift = (t) => 30 + (10 * Math.min(Math.max(t - 180, 0), LAND_T - 180)) / (LAND_T - 180);
  const flight = buildFlight({ 1: { name: 'lead', fixes: ship(0, () => 0) }, 2: { name: 'two', fixes: ship(60, drift) } });
  const corrected = correctAltitudes(flight, altitudeCheck(flight, { refAt }), {});

  const gapAt = (fl, t) => sampleAt(fl.tracks[2], 1.7e9 + t).altFt - sampleAt(fl.tracks[1], 1.7e9 + t).altFt;
  for (const t of [300, 600, 900]) {
    assert.ok(gapAt(flight, t) >= 30, `as recorded #2 reads at least 30 ft high at ${t} s`);
    assert.ok(Math.abs(gapAt(corrected, t)) <= 10, `level after the check at ${t} s: ${gapAt(corrected, t).toFixed(1)} ft`);
  }
  // Parked before taxi and after taxi in: the same height above the ground under each.
  for (const t of [60, 1120]) {
    const above = (slot) => {
      const s = sampleAt(corrected.tracks[slot], 1.7e9 + t);
      return s.altFt - terrainFt(corrected.tracks[slot].fixes.find((f) => f.t === 1.7e9 + t).lat);
    };
    assert.ok(Math.abs(above(2) - above(1)) <= 10, `parked at ${t} s, #2 is ${(above(2) - above(1)).toFixed(1)} ft from #1 above the ground`);
  }
});

// Checks (V2.434): a ship whose log starts in the air, with one slow step there (a GPS hiccup at start-up), is not "corrected" from that
//   one fix, and does not move the ships that taxied. Expected values from the constructed tracks: every ship truly level in the air, with
//   no GPS error, so nothing should move; margin 10 ft as above. Shape from Dad's Cobra flight (14 Oct 2026): Lead's log began at 4,519 ft
//   and 192 kt, its first step read slow, and the check took it for ground and moved Lead about 2,000 ft down and the others 660 ft up.
test('a ship whose log starts in the air is left as recorded, and the ships that taxied stay where they were', () => {
  const lead = ship(0, () => 0).filter((fx) => fx.t - 1.7e9 >= 300 && fx.t - 1.7e9 <= 900); // airborne only: starts and ends in the air
  lead[1] = { ...lead[1], lat: lead[0].lat, lon: lead[0].lon }; // its first step reads as standing still: one "ground" fix 3,000 ft up
  const flight = buildFlight({ 1: { name: 'lead', fixes: lead }, 2: { name: 'two', fixes: ship(60, () => 0) }, 3: { name: 'three', fixes: ship(120, () => 0) } });
  const corrected = correctAltitudes(flight, altitudeCheck(flight, { refAt }), {});

  assert.equal(corrected.tracks[1].altitude.corrected, false, 'the airborne-only ship is left as recorded');
  for (const t of [400, 600, 800]) {
    for (const slot of [1, 2, 3]) {
      const moved = sampleAt(corrected.tracks[slot], 1.7e9 + t).altFt - sampleAt(flight.tracks[slot], 1.7e9 + t).altFt;
      assert.ok(Math.abs(moved) <= 10, `#${slot} at ${t} s moved ${moved.toFixed(1)} ft`);
    }
  }
});
