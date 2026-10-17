// Checks: NOAA's lightning strikes (SOF-71) read from a real NLDN one-minute file the way a SOF would recognise them: every lit cell is a whole number of
//   cloud-to-ground strikes at its place (the two-strike cell in West Texas included), the file is the field its name says and not NOAA's 5-minute one,
//   and the near-home check calls lightning near for a home 5 NM from a strike, and can't tell (never "no lightning") at Sheppard, 23 NM from the nearest
//   strike, while any of the last 10 minute files is missing; with all ten read it says clear.
// Serves: SOF-R30, SOF-R16 (S2: unknown is never good), SOF-71 (spec "Lightning strikes from NOAA at every base": Source, Near home, When data fails).
// Expected values: real recorded data. The fixture is NOAA's own file, unchanged: tests/fixtures/sof/MRMS_NLDN_CG_001min_AvgDensity_00.00_20261014-232800.grib2.gz
//   (1,671 bytes, SHA-256 7d3fce39…f042), from the public bucket noaa-mrms-pds (CONUS/NLDN_CG_001min_AvgDensity_00.00/20261014/), fetched 14 Oct 2026. Read by
//   ECMWF's ecCodes (as bundled with pygrib 2.1.8), not by this code: discipline 209, category 2, number 0, surface 102 at 0 m, valid 2328Z; 127 lit cells
//   (value above 0, -1 elsewhere); the cell at 33.935 N 100.385 W holds 1.946 strikes per km². A cell's area is standard geometry: (0.01° × 111.32 km)² ×
//   cos(latitude), so there 1.946 × 1.028 km² is 2.00 strikes; ecCodes' values × area all lie within 0.002 of a whole number (1 or 2). Sheppard AFB (KSPS, the
//   airfield catalog, OurAirports) is 23.3 NM from the nearest strike of the file by great circle on ecCodes' cell places. Margin: 0.01 strike for "a whole
//   number" (the file packs values in steps of 0.001, decimal scale 3); the shared table's margins are for flying numbers, not a file's packing.
//   The nine quiet minutes in the last part are stand-ins (empty lists, no file), only to make a full ten minutes; the rule they show is the spec's.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readGrib2Window } from '../../../src/modules/sof/grib2.js';
import { decodeFile, checkField, PRODUCTS, keyTime } from '../../../src/modules/sof/mrms-model.js';
import { strikesNearHome, strikesTarget } from '../../../src/modules/sof/strikes-model.js';
import { CATALOG } from '../../../src/airfields/catalog.js';

const FILE = 'MRMS_NLDN_CG_001min_AvgDensity_00.00_20261014-232800.grib2.gz';
const gz = () => new Uint8Array(readFileSync(new URL(`../../fixtures/sof/${FILE}`, import.meta.url)));
const MIN = 60_000;
const TWO_STRIKE_CELL = { lat: 33.935, lon: -100.385 }; // ecCodes: 1.946 strikes per km²
const WHOLE = 0.01;

test('a real NLDN minute file reads as whole strikes at their places, and near-home says near, can\'t tell with a minute missing, clear only with all ten', async () => {
  const time = keyTime(FILE);
  // The square kept round a home 5 NM north of the two-strike cell (450 NM each way, as the feed asks).
  const home = { icao: 'KXYZ', lat: TWO_STRIKE_CELL.lat + 5 / 60, lon: TWO_STRIKE_CELL.lon };
  const read = await decodeFile({ gz: gz(), product: PRODUCTS.strikes, nameTime: time, target: strikesTarget(home), layout: 'strikes' }, readGrib2Window);
  assert.equal(read.ok, true, `the file passes every check (${read.reason ?? ''})`);
  assert.equal(new Date(read.time).toISOString(), '2026-10-14T23:28:00.000Z', 'valid at 2328Z, as its name says');

  // The raw values too, to see each lit cell is a whole number of strikes before any rounding.
  const raw = await readGrib2Window(gz(), { row0: 0, row1: 3499, col0: 0, col1: 6999 });
  assert.equal(checkField(raw.meta, PRODUCTS.strikes, time), null, 'the one-minute strikes field: discipline 209, category 2, number 0');
  assert.ok(checkField(raw.meta, { ...PRODUCTS.strikes, number: 1 }, time), "not taken as NOAA's 5-minute file (number 1)");
  let lit = 0;
  for (let k = 0; k < raw.values.length; k++) {
    const v = raw.values[k];
    if (!(v > 0)) {
      assert.ok(Math.abs(v + 1) < 1e-6, `a cell with no strike is -1 (cell ${k}: ${v})`);
      continue;
    }
    lit += 1;
    const lat = raw.meta.grid.la1 - Math.floor(k / 7000) * 0.01;
    const strikes = v * (0.01 * 111.32) ** 2 * Math.cos((lat * Math.PI) / 180);
    assert.ok(Math.abs(strikes - Math.round(strikes)) < WHOLE && Math.round(strikes) >= 1, `cell ${k} at ${lat.toFixed(3)} N holds ${strikes.toFixed(3)} strikes, a whole number`);
  }
  assert.equal(lit, 127, '127 lit cells, as ecCodes reads the file');

  assert.ok(read.strikes.length > 0 && read.strikes.every((s) => Number.isInteger(s.count) && s.count >= 1), 'each kept strike cell is a whole number of strikes');
  const two = read.strikes.find((s) => Math.abs(s.lat - TWO_STRIKE_CELL.lat) < 0.001 && Math.abs(s.lon - TWO_STRIKE_CELL.lon) < 0.001);
  assert.ok(two, 'the cell at 33.935 N 100.385 W is kept, at its place');
  assert.equal(two.count, 2, 'and holds 2 strikes');

  // Near home: the one real minute is the newest file; the clock 3 minutes later (files arrive 1 to 2 minutes late).
  const now = new Date(time + 3 * MIN);
  const file = { key: FILE, time: read.time, strikes: read.strikes };
  const held = (files) => ({ files, newest: read.time, refused: [], failure: null, busy: false, rounds: 1 });
  const near = strikesNearHome({ held: held([file]), home, radiusNm: 20, now });
  assert.equal(near.state, 'near', `5 NM from a strike is lightning near (${near.words})`);
  assert.ok(near.nearestNm <= 5.1 && near.caution, 'about 5 NM, and a caution for the banner');

  // Sheppard, 23 NM from the nearest strike: with only this minute read, it can't tell; never "No lightning".
  const sheppard = { icao: 'KSPS', lat: CATALOG.KSPS.lat, lon: CATALOG.KSPS.lon };
  const sheppardRead = await decodeFile({ gz: gz(), product: PRODUCTS.strikes, nameTime: time, target: strikesTarget(sheppard), layout: 'strikes' }, readGrib2Window);
  const real = { key: FILE, time: sheppardRead.time, strikes: sheppardRead.strikes };
  const quiet = (m) => ({ key: `stand-in-${m}`, time: read.time - m * MIN, strikes: [] });
  const one = strikesNearHome({ held: held([real]), home: sheppard, radiusNm: 20, now });
  assert.equal(one.state, 'unknown', `one minute of ten read: can't tell (${one.words})`);
  const nine = strikesNearHome({ held: held([real, ...[1, 2, 3, 4, 5, 6, 7, 9].map(quiet)]), home: sheppard, radiusNm: 20, now });
  assert.equal(nine.state, 'unknown', `the 8th minute back missing: can't tell (${nine.words})`);
  assert.ok(!/^No lightning/.test(nine.words) && /2320Z/.test(nine.words), 'it names the missing minute and never says "No lightning"');
  const ten = strikesNearHome({ held: held([real, ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(quiet)]), home: sheppard, radiusNm: 20, now });
  assert.equal(ten.state, 'clear', `all ten minutes read, the nearest strike 23 NM away: clear (${ten.words})`);
  assert.ok(ten.nearestNm > 20 && ten.nearestNm < 25, 'with the nearest strike about 23 NM away');
});
