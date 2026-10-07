// Checks: the model's cloud levels become cloud blocks with a base and a top in the SOF's 3D view (a cloudy level fills from halfway down
//   to the level below to halfway up to the level above, and cloudy levels next to each other make one block), thin cover makes no cloud,
//   and a reply with one short array is thrown away whole.
// Serves: SOF-39 (3D view, phase 2: model clouds; "Untrusted replies").
// Expected values: hand-made column. The pressure levels' heights are about right for a standard atmosphere (1000 hPa about 110 m, 925 about 770 m,
//   850 about 1,500 m, 700 about 3,000 m, 600 about 4,200 m, 500 about 5,600 m, 400 about 7,200 m, 300 about 9,200 m); metres to feet
//   with 3.2808 ft per metre; the 30 % cloud threshold is the brief's. Not read from V6 or from the code's own output.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cloudBlocks, checkModelReply, HOURLY_VARIABLES, CLOUD_LEVELS_HPA } from '../../../src/modules/sof/model-clouds.js';

const FT_PER_M = 3.2808;
const LEVEL_HEIGHT_M = { 1000: 110, 925: 770, 850: 1500, 700: 3000, 600: 4200, 500: 5600, 400: 7200, 300: 9200 };

/** A column in feet: cover by pressure level (default 0 %), the heights above. */
const column = (cover = {}) => CLOUD_LEVELS_HPA.map((hPa) => ({ hPa, cover: cover[hPa] ?? 0, heightFt: LEVEL_HEIGHT_M[hPa] * FT_PER_M }));

/** A whole good reply: 81 points, two hours, calm clear sky. */
function goodReply() {
  const point = () => {
    const hourly = { time: ['2026-10-07T12:00', '2026-10-07T13:00'] };
    for (const variable of HOURLY_VARIABLES) {
      const hPa = Number(/(\d+)hPa$/.exec(variable)?.[1]);
      if (variable.startsWith('geopotential_height')) hourly[variable] = [LEVEL_HEIGHT_M[hPa], LEVEL_HEIGHT_M[hPa]];
      else if (variable.startsWith('wind_direction')) hourly[variable] = [270, 270];
      else if (variable.startsWith('freezing_level')) hourly[variable] = [2200, 2200];
      else hourly[variable] = [0, 0];
    }
    return { hourly };
  };
  return Array.from({ length: 81 }, point);
}
const gridOf81 = Array.from({ length: 81 }, (_, index) => ({ index, i: index % 9, j: Math.floor(index / 9), x: 0, y: 0, lat: 50, lon: -105 }));

test('cloudy model levels make one block from below the lower level to above the upper one, thin cover makes none, and one short array fails the whole reply', () => {
  // 850 hPa (1,500 m) 80 % and 700 hPa (3,000 m) 60 %, everything else clear: one block, joined, wider than the two levels themselves.
  const blocks = cloudBlocks(column({ 850: 80, 700: 60 }));
  assert.equal(blocks.length, 1);
  assert.ok(blocks[0].baseFt < 1500 * FT_PER_M, 'the base is below the 850 hPa level');
  assert.ok(blocks[0].topFt > 3000 * FT_PER_M, 'the top is above the 700 hPa level');
  assert.ok(blocks[0].baseFt > 770 * FT_PER_M && blocks[0].topFt < 4200 * FT_PER_M, 'it stops halfway to the next levels, not at them');

  // Every level at 10 % (under the 30 % line) is no cloud at all.
  assert.deepEqual(cloudBlocks(column(Object.fromEntries(CLOUD_LEVELS_HPA.map((l) => [l, 10])))), []);

  // A whole good reply passes; the same reply with one variable one value short does not, and nothing of it is kept.
  assert.equal(checkModelReply(goodReply(), { points: gridOf81 }).ok, true);
  const short = goodReply();
  short[40].hourly.cloud_cover_700hPa = [0];
  assert.equal(checkModelReply(short, { points: gridOf81 }).ok, false);
});
