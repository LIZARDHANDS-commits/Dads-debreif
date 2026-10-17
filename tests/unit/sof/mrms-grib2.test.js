// Checks: our own GRIB2 reader (src/modules/sof/grib2.js) reads a real NOAA MRMS file right: MRMS's grid (7000 x 3500 at 0.01°, first point 54.995 N
//   129.995 W), the field it holds (the 50 dBZ echo top, at the 0.5 km surface, PNG packed) and its time; the echo top of a West Texas storm cell and its
//   neighbours; and a cell with no echo and a cell with no radar coverage read as such, never as a height. A file of another product fails the check
//   the 3D view puts every file through (src/modules/sof/mrms-model.js `checkField`).
// Serves: SOF-R29, SOF-67 (spec "3D view", "Radar with its real heights": "our own GRIB2 reader"; "Untrusted replies"; "-1 no echo, -3 no coverage").
// Expected values: real recorded data. The fixture is NOAA's own file, unchanged: tests/fixtures/sof/MRMS_EchoTop_50_00.50_20261014-050840.grib2.gz
//   (47,090 bytes, SHA-256 59b9682a…98d2), from the public bucket noaa-mrms-pds (CONUS/EchoTop_50_00.50/20261014/), fetched 14 Oct 2026. The
//   expected grid, field numbers and cell values were read from that same file by ECMWF's ecCodes (as bundled with pygrib 2.1.8), not by this code:
//   row 2406, column 2719 (30.935 N, 102.805 W) is 10.8 km; row 1500, column 3000 (39.995 N, 99.995 W, Kansas) is -1 (no echo); row 2000, column 100
//   (34.995 N, 128.995 W, the Pacific) is -3 (no coverage). Margin: the file packs heights in steps of 0.001 km (decimal scale 3), so values are
//   checked to 0.0005 km, half a step; the shared table's margins are for flying numbers, not for a file's own packing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readGrib2Window } from '../../../src/modules/sof/grib2.js';
import { checkField, classify, PRODUCTS, levelProduct, keyTime } from '../../../src/modules/sof/mrms-model.js';

const FILE = 'MRMS_EchoTop_50_00.50_20261014-050840.grib2.gz';
const gz = new Uint8Array(readFileSync(new URL(`../../fixtures/sof/${FILE}`, import.meta.url)));
// The 50 dBZ echo top, as ecCodes reads the file: MRMS's local discipline 209, category 3, number 46, surface type 102 (height above sea level) at 500 m.
const ECHO_TOP_50 = { name: 'EchoTop_50_00.50', kind: 'top', category: 3, number: 46, surfaceM: 500, words: '50 dBZ echo top' };
const HALF_STEP = 0.0005;

test('the GRIB2 reader reads a real MRMS echo-top file: its grid, its field, a storm top, and no-echo and no-coverage cells', async () => {
  // A window round the storm cell, and one cell each from Kansas and the Pacific, read in three windows (the reader stops at each window's last row).
  const storm = await readGrib2Window(gz, { row0: 2405, row1: 2407, col0: 2718, col1: 2720 });
  const { grid, product, packing, discipline, edition, time } = storm.meta;

  assert.equal(edition, 2, 'GRIB edition 2');
  assert.deepEqual([grid.ni, grid.nj], [7000, 3500], 'MRMS grid of 7000 by 3500 points');
  assert.ok(Math.abs(grid.di - 0.01) < 1e-9 && Math.abs(grid.dj - 0.01) < 1e-9, 'a point every 0.01 degree each way');
  assert.ok(Math.abs(grid.la1 - 54.995) < 1e-6 && Math.abs(grid.lo1 - 230.005) < 1e-6, 'the first point is 54.995 N, 230.005 E (129.995 W)');
  assert.ok(Math.abs(grid.la2 - 20.005) < 1e-5 && Math.abs(grid.lo2 - 299.995) < 1e-5, 'the last point is 20.005 N, 299.995 E (60.005 W)');
  assert.deepEqual([discipline, product.category, product.number, product.surfaceType, product.surfaceValue], [209, 3, 46, 102, 500], 'the 50 dBZ echo top at 500 m above sea level');
  assert.equal(packing.template, 41, 'PNG packing (data template 5.41)');
  assert.equal(time.toISOString(), '2026-10-14T05:08:40.000Z', 'valid at 0508:40Z, as its name says');
  assert.equal(+time, keyTime(FILE), 'the file time matches the time in its name');

  // The storm cell and its eight neighbours, km above sea level, as ecCodes reads them (north row first).
  const expected = [
    [6.75, 9.2, 8.167],
    [9.6, 10.8, 9.167],
    [9.857, 10.167, 9.2],
  ];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const got = storm.values[r * 3 + c];
      assert.ok(Math.abs(got - expected[r][c]) <= HALF_STEP, `row ${2405 + r}, column ${2718 + c}: ${got} km, expected ${expected[r][c]} km`);
      assert.equal(classify(got, 'top'), 'value', 'a measured top, inside 0 to 25 km');
    }
  }

  const kansas = await readGrib2Window(gz, { row0: 1500, row1: 1500, col0: 3000, col1: 3000 });
  assert.equal(kansas.values[0], -1, 'Kansas, inside the radars\' coverage with no 50 dBZ echo: -1');
  assert.equal(classify(kansas.values[0], 'top'), 'none', 'read as no echo, not as a height');
  const pacific = await readGrib2Window(gz, { row0: 2000, row1: 2000, col0: 100, col1: 100 });
  assert.equal(pacific.values[0], -3, 'the Pacific, out of every radar\'s reach: -3');
  assert.equal(classify(pacific.values[0], 'top'), 'gap', 'read as no coverage, never as clear air');

  // The checks every file gets before it is drawn: this file passes as the 50 dBZ echo top, and fails as anything else.
  assert.equal(checkField(storm.meta, ECHO_TOP_50, keyTime(FILE)), null, 'the file is the field its name says');
  assert.ok(checkField(storm.meta, PRODUCTS.top18, keyTime(FILE)), 'not taken as the 18 dBZ echo top');
  assert.ok(checkField(storm.meta, levelProduct(3), keyTime(FILE)), 'not taken as reflectivity at 3 km');
  assert.ok(checkField(storm.meta, ECHO_TOP_50, keyTime(FILE) + 60 * 60_000), 'not taken when its time is an hour from the one asked for');
});
