import test from 'node:test';
import assert from 'node:assert/strict';
import { groundOffsetFt } from '../../../src/modules/traffic/ground-heights3d.js';
import { createRiverChannel, RIVERS } from '../../../src/modules/traffic/rivers3d.js';
import { FLAT_GROUND_BOXES, PATTERN_MID_CENTER_FT, PATTERN_MID_SPAN_FT } from '../../../src/modules/traffic/view3d.js';
import { THRESHOLD_29L } from '../../../src/modules/traffic/airfield.js';

// TR-117: the 3D ground follows the real heights, but the runways stay flat, the river valley is below the field, and missing data leaves it flat.
// The heights here are made up for the check (a field at 578 m with a valley 15 m lower east of 6,000 ft), not recorded data.
const area = { x: PATTERN_MID_CENTER_FT.x, y: PATTERN_MID_CENTER_FT.y, span: PATTERN_MID_SPAN_FT };
const metresAt = (x) => (x > 6000 ? 563 : 578);
const fieldFt = 578 / 0.3048;
const at = (x, y, more = {}) => groundOffsetFt(x, y, { metresAt, fieldFt, flatBoxes: FLAT_GROUND_BOXES, area, channelAt: createRiverChannel(), ...more });

test('traffic 3D ground: runway flat, river valley below the field, flat without data', () => {
  assert.equal(at(THRESHOLD_29L.x, THRESHOLD_29L.y), 0, 'the 29L threshold stays at field height');
  assert.equal(at(0, 0), 0, 'mid-field stays at field height');
  const river = RIVERS.mooseJawRiver[30]; // a traced point east of the field, outside the flat boxes
  assert.ok(at(river[0], river[1]) < -40, 'the river is drawn below the field: the valley plus the channel');
  assert.equal(at(river[0], river[1], { metresAt: () => NaN }) <= 0, true, 'no height data: no rise anywhere, only the channel cut');
  assert.equal(at(12000, -7700, { fieldFt: NaN, channelAt: null }), 0, 'field height unknown: flat');
});
