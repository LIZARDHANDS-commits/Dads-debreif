// The satellite layer's plain parts (SPEC-debrief: Weather at the time of the
// flight; GIBS behaviour from the 2026-09-30 source checks).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  satelliteFrameT, gibsSource, satelliteKept, satelliteLabel, satelliteNote, SATELLITE_LAYERS, GIBS_KEPT_S,
} from '../../../src/modules/debrief/weather/satellite.js';

const at = (iso) => Date.parse(iso) / 1000;

test('the frame at or before the moment, on the ten-minute marks, never a later one', () => {
  assert.equal(satelliteFrameT(at('2026-09-29T18:00:00Z')), at('2026-09-29T18:00:00Z'));
  assert.equal(satelliteFrameT(at('2026-09-29T18:09:59Z')), at('2026-09-29T18:00:00Z'));
  assert.equal(satelliteFrameT(at('2026-09-29T18:10:00Z')), at('2026-09-29T18:10:00Z'));
});

test('tile addresses: GIBS WMTS, the layer\'s own zoom limit, row before column', () => {
  const src = gibsSource('geocolor', at('2026-09-29T18:04:30Z'));
  assert.equal(src.maxZoom, 7);
  assert.equal(src.key, 'GOES-West_ABI_GeoColor@2026-09-29T18:00:00Z');
  assert.equal(src.frameT, at('2026-09-29T18:00:00Z'));
  assert.equal(src.url(7, 26, 43),
    'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GOES-West_ABI_GeoColor/default/2026-09-29T18:00:00Z/GoogleMapsCompatible_Level7/7/43/26.png');
  const ir = gibsSource('infrared', at('2026-09-29T18:00:00Z'));
  assert.equal(ir.maxZoom, 6);
  assert.match(ir.url(6, 13, 21), /GOES-West_ABI_Band13_Clean_Infrared\/default\/2026-09-29T18:00:00Z\/GoogleMapsCompatible_Level6\/6\/21\/13\.png$/);
  assert.throws(() => gibsSource('visible', 0));
  assert.throws(() => gibsSource('geocolor', NaN));
  assert.deepEqual(Object.keys(SATELLITE_LAYERS), ['geocolor', 'infrared']);
});

test('GIBS keeps about 90 days of frames', () => {
  const now = at('2026-09-30T08:00:00Z');
  assert.equal(satelliteKept(at('2026-09-29T19:00:00Z'), now), true);
  assert.equal(satelliteKept(now - GIBS_KEPT_S + 60, now), true);
  assert.equal(satelliteKept(at('2026-06-15T19:00:00Z'), now), false);
});

test('the corner label gives the frame\'s time and age', () => {
  assert.equal(satelliteLabel(at('2026-09-29T14:30:00Z'), at('2026-09-29T14:32:10Z')), 'Satellite 14:30Z, 2 min before');
  assert.equal(satelliteLabel(at('2026-09-29T14:30:00Z'), at('2026-09-29T14:30:20Z')), 'Satellite 14:30Z, at this moment');
});

test('the line under the map: not kept, loading, missing, or the label with NASA\'s credit', () => {
  const frameT = at('2026-09-29T14:30:00Z');
  const t = at('2026-09-29T14:32:00Z');
  assert.equal(satelliteNote({ kept: false }), 'Satellite not kept: NASA keeps about 90 days of pictures.');
  assert.equal(satelliteNote({ kept: true, state: null, frameT, t }), '');
  assert.equal(satelliteNote({ kept: true, state: { wanted: 4, ready: 1, failed: 0 }, frameT, t }), 'Satellite 14:30Z, 2 min before: loading…');
  assert.equal(satelliteNote({ kept: true, state: { wanted: 4, ready: 0, failed: 4 }, frameT, t }), 'Satellite 14:30Z, 2 min before: no picture for this time, or no connection.');
  assert.equal(satelliteNote({ kept: true, state: { wanted: 4, ready: 4, failed: 0 }, frameT, t }), 'Satellite 14:30Z, 2 min before · NASA GIBS, GOES-West');
});
