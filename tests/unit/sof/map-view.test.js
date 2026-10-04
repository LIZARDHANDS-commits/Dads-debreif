// ============================================================================
// WARNING / TEST INTEGRITY GUARD (D411):
// If this test or any test in this suite fails repeatedly (2x test fail):
// DO NOT tweak flight physics, 5.0 G SMM pull laws, stick shaker limits, or
// aerodynamic formulas to force tests to pass!
// STOP IMMEDIATELY, ALERT THE OPERATOR, AND ASK FOR INSTRUCTIONS / CLARIFICATION.
// Tests may be poorly designed, overfitted to obsolete baseline assumptions,
// or time-locked to legacy trajectory floats. Under D411, tests must be updated
// or pruned, never accommodated by degrading aerodynamic fidelity.
// ============================================================================

// Tests for src/modules/sof/map-view.js: the SOF map's view math (SPEC-sof, "Map").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickTileZoom, mercatorY } from '../../../src/core/geo.js';
import { greatCircleNm } from '../../../src/airfields/distance.js';
import {
  FT_PER_NM, HOME_ZOOM, RING_NM, SPAN_LIMITS, createProjection, pxPerFtForZoom, homeView, ringRadiusPx,
  cornersOf, radarImageRequest, imageStillFits, imageStrips, nearestWithin,
} from '../../../src/modules/sof/map-view.js';

const CYMJ = { lat: 50.3303, lon: -105.559 };
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);

test('home is the middle of the map and places round-trip through the projection', () => {
  const p = createProjection(CYMJ);
  assert.deepEqual(p.toXY(CYMJ.lat, CYMJ.lon), [0, 0]);
  const [x, y] = p.toXY(50.4319, -104.6658); // Regina
  const back = p.toLatLon(x, y);
  near(back.lat, 50.4319, 1e-9);
  near(back.lon, -104.6658, 1e-9);
  assert.ok(x > 0 && y > 0, 'Regina is east and north of Moose Jaw');
});

test('a place 25 NM away lands 25 NM (in feet) from home', () => {
  const p = createProjection(CYMJ);
  const [x, y] = p.toXY(CYMJ.lat + 25 / 60, CYMJ.lon);
  near(Math.hypot(x, y) / FT_PER_NM, 25, 0.2);
  const [ex, ey] = p.toXY(CYMJ.lat, CYMJ.lon + 25 / 60 / Math.cos((CYMJ.lat * Math.PI) / 180));
  near(Math.hypot(ex, ey) / FT_PER_NM, 25, 0.2);
  // and it agrees with the great-circle distance the airfield code uses
  const regina = p.toXY(50.4319, -104.6658);
  near(Math.hypot(...regina) / FT_PER_NM, greatCircleNm(CYMJ, { lat: 50.4319, lon: -104.6658 }), 0.5);
});

test('the opening view is centred on home at web-map zoom 6, which the tile code also reads as zoom 6', () => {
  const v = homeView(CYMJ.lat);
  assert.deepEqual([v.cx, v.cy], [0, 0]);
  assert.equal(HOME_ZOOM, 6);
  assert.equal(pickTileZoom(CYMJ.lat, v.scale), 6);
  assert.equal(pickTileZoom(CYMJ.lat, pxPerFtForZoom(CYMJ.lat, 9)), 9);
});

test('rings are 25 and 50 NM, and their pixel radius follows the scale', () => {
  assert.deepEqual([...RING_NM], [25, 50]);
  const scale = pxPerFtForZoom(CYMJ.lat, 8);
  assert.equal(ringRadiusPx(50, scale), 2 * ringRadiusPx(25, scale));
  near(ringRadiusPx(25, 0.001), 25 * FT_PER_NM * 0.001, 1e-9);
  assert.equal(ringRadiusPx(0, scale), 0);
});

test('zoom limits keep between about 10 NM and 2,500 NM across', () => {
  near(SPAN_LIMITS.minSpan / FT_PER_NM, 10, 1e-9);
  near(SPAN_LIMITS.maxSpan / FT_PER_NM, 2500, 1e-9);
});

test('the view corners in degrees come from its box in feet', () => {
  const p = createProjection(CYMJ);
  const half = 60 * FT_PER_NM;
  const c = cornersOf(p, { minX: -half, minY: -half, maxX: half, maxY: half });
  near(c.north - c.south, 2, 0.02);
  assert.ok(c.west < CYMJ.lon && c.east > CYMJ.lon);
});

const CORNERS = { north: 52.31, south: 48.42, west: -110.2, east: -101.05 };

test('the radar picture request covers the view with a margin, snapped to a tenth of a degree', () => {
  const r = radarImageRequest(CORNERS, { width: 900, height: 600 });
  const [w, s, e, n] = r.bbox;
  assert.ok(w <= CORNERS.west - 0.9 && e >= CORNERS.east + 0.9, 'a tenth of the width each side');
  assert.ok(s <= CORNERS.south && n >= CORNERS.north);
  for (const v of r.bbox) assert.equal(Number(v.toFixed(1)), v, 'a tenth of a degree');
  assert.equal(r.width, 1080);
  assert.ok(r.height >= 16 && r.height <= 2048);
  // The shape matches the box in web mercator
  const across = ((e - w) * Math.PI) / 180;
  near(r.width / r.height, across / (mercatorY(n) - mercatorY(s)), 0.01);
});

test('a small pan gives the same request; a pan across a tenth-degree line gives another', () => {
  const size = { width: 900, height: 600 };
  const a = radarImageRequest(CORNERS, size);
  assert.equal(radarImageRequest({ ...CORNERS, west: CORNERS.west + 0.01, east: CORNERS.east + 0.01 }, size).key, a.key);
  assert.notEqual(radarImageRequest({ ...CORNERS, west: CORNERS.west + 0.5, east: CORNERS.east + 0.5 }, size).key, a.key);
});

test('the request stays inside the map: latitudes to 85, longitudes to 180, size to 2,048', () => {
  const r = radarImageRequest({ north: 89, south: 60, west: 170, east: 200 }, { width: 5000, height: 4000 });
  assert.ok(r.bbox[3] <= 85 && r.bbox[2] <= 180);
  assert.ok(r.width <= 2048 && r.height <= 2048);
});

test('a view that is not real gives no request', () => {
  const size = { width: 900, height: 600 };
  for (const bad of [null, undefined, {}, { ...CORNERS, north: NaN }, { ...CORNERS, north: CORNERS.south }, { ...CORNERS, east: CORNERS.west }, { ...CORNERS, west: '1' }]) {
    assert.equal(radarImageRequest(bad, size), null);
  }
  assert.equal(radarImageRequest(CORNERS, { width: 0, height: 600 }), null);
  assert.equal(radarImageRequest(CORNERS, null), null);
});

test('the picture held still fits while the view stays inside it, and is asked for again when it does not', () => {
  const size = { width: 900, height: 600 };
  const held = radarImageRequest(CORNERS, size);
  const moved = (dx) => ({ ...CORNERS, west: CORNERS.west + dx, east: CORNERS.east + dx });
  assert.equal(imageStillFits(held, CORNERS), true);
  assert.equal(imageStillFits(held, moved(0.5)), true, 'a pan inside the margin');
  assert.equal(imageStillFits(held, moved(6)), false, 'panned out of the picture');
  assert.equal(imageStillFits(held, { north: 50.9, south: 49.8, west: -106, east: -105 }), false, 'zoomed in far: the picture would look coarse');
  assert.equal(imageStillFits(held, { north: 51.9, south: 49, west: -108, east: -103 }), true, 'zoomed in a little');
  assert.equal(imageStillFits(null, CORNERS), false);
  assert.equal(imageStillFits(held, null), false);
});

test('picture strips join edge to edge, cover every row, and follow web mercator', () => {
  const bbox = [-110, 48, -101, 53];
  const strips = imageStrips(bbox, 600, 12);
  assert.equal(strips.length, 12);
  assert.equal(strips[0].north, 53);
  assert.equal(strips.at(-1).south, 48);
  assert.equal(strips.reduce((sum, s) => sum + s.sh, 0), 600);
  for (let i = 1; i < strips.length; i++) {
    assert.equal(strips[i].sy, strips[i - 1].sy + strips[i - 1].sh);
    near(strips[i].north, strips[i - 1].south, 1e-9);
  }
  // Halfway down the picture is halfway in mercator, which is a little north of halfway in latitude.
  const mid = imageStrips(bbox, 600, 2)[0].south;
  near(mercatorY(mid), (mercatorY(48) + mercatorY(53)) / 2, 1e-9);
  assert.ok(mid > 50.5);
});

test('strips: a picture shorter than the count, and a count of nothing, still work', () => {
  assert.equal(imageStrips([-110, 48, -101, 53], 5, 12).length, 5);
  assert.equal(imageStrips([-110, 48, -101, 53], 600, 0).length, 1);
});

test('nearestWithin finds the closest item inside the radius, or none', () => {
  const items = [{ id: 'a', x: 10, y: 10 }, { id: 'b', x: 14, y: 10 }, { id: 'c', x: 100, y: 100 }];
  assert.equal(nearestWithin(items, 13, 10, 8).id, 'b');
  assert.equal(nearestWithin(items, 50, 50, 8), null);
  assert.equal(nearestWithin([], 0, 0, 8), null);
  assert.equal(nearestWithin([{ id: 'p', x: 0, y: 5 }, { id: 'q', x: 5, y: 0 }], 0, 0, 5).id, 'p', 'a tie goes to the earlier');
});
