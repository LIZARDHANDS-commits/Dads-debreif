// Checks: a model column with cloud at 850 and 700 hPa (and thin cover at 925 hPa) becomes one low cloud slab in the SOF's 3D view, whose base lies between the
//   925 and 850 hPa levels and whose top lies above the 700 hPa level, with no mid or high slab; and the cloud read back above that place (what the radar shafts,
//   lightning bolts and satellite sheet stand on) has the same base and top.
// Serves: SOF-39 (3D view, model clouds: cloud slabs with a base and a top; plan Step 2b "Weather fidelity 2").
// Expected values: standard atmosphere heights of the pressure levels (1000 hPa about 110 m, 925 about 770 m, 850 about 1,500 m, 700 about 3,000 m, 600 about 4,200 m,
//   500 about 5,600 m, 400 about 7,200 m, 300 about 9,200 m); metres to feet with 3.2808 ft per metre; the 1,900 ft field is about Moose Jaw's elevation; the 30 % cloud
//   threshold is the model's estimate (SOF-39). Not read from V6 or from the code's own output.
// Margin: ±100 ft, the shared table's height margin, for the base and top read back.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slabColumns, slabGrids, slabFields, slabColumnAt } from '../../../src/modules/sof/cloud-field.js';

const FT_PER_M = 3.2808;
const LEVEL_HEIGHT_M = { 1000: 110, 925: 770, 850: 1500, 700: 3000, 600: 4200, 500: 5600, 400: 7200, 300: 9200 };
const LEVELS = Object.keys(LEVEL_HEIGHT_M).map(Number).sort((a, b) => b - a);
const COVER = { 925: 20, 850: 80, 700: 60 }; // percent; every other level 0
const FIELD_FT = 1900;
const SIZE = 3;

/** A 3 x 3 grid of the same column, one hour, in the shape the model feed gives (model-clouds.js checkModelReply). */
function model() {
  const series = { freezing_level_height: [null], cloud_cover_low: [null], cloud_cover_mid: [null], cloud_cover_high: [null] };
  for (const hPa of LEVELS) {
    series[`geopotential_height_${hPa}hPa`] = [LEVEL_HEIGHT_M[hPa]];
    series[`cloud_cover_${hPa}hPa`] = [COVER[hPa] ?? 0];
  }
  const points = [];
  for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) points.push({ index: points.length, i, j, series });
  return { gridSize: SIZE, cloudLevels: LEVELS, times: [0], points };
}

test('cloud at 850 and 700 hPa over a 1,900 ft field is one low slab from between 925 and 850 hPa to above 700 hPa, and reads back the same above the place', () => {
  const columns = slabColumns(model(), 0, FIELD_FT);
  const centre = columns.find((c) => c.i === 1 && c.j === 1);
  assert.ok(centre.low, 'there is a low slab');
  assert.equal(centre.mid, null, 'no mid slab');
  assert.equal(centre.high, null, 'no high slab');
  assert.ok(centre.low.baseFt < 1500 * FT_PER_M, 'the base is below the 850 hPa level');
  assert.ok(centre.low.baseFt > 770 * FT_PER_M, 'the base is above the 925 hPa level (its 20 % is not cloud)');
  assert.ok(centre.low.topFt > 3000 * FT_PER_M, 'the top is above the 700 hPa level');

  const slabs = slabFields(slabGrids(columns, SIZE), { groundFt: FIELD_FT });
  const above = slabColumnAt(slabs, 0.5, 0.5);
  assert.ok(above, 'there is cloud above the middle of the square');
  assert.ok(Math.abs(above.baseFt - centre.low.baseFt) <= 100, `base read back ${above.baseFt} ft, slab ${centre.low.baseFt} ft`);
  assert.ok(Math.abs(above.topFt - centre.low.topFt) <= 100, `top read back ${above.topFt} ft, slab ${centre.low.topFt} ft`);
});
