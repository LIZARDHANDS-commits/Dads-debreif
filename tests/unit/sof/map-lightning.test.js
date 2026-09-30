// Tests for src/modules/sof/map-lightning.js: the fixed box read around home and the decoding
// of ECCC's lightning density picture into lightning.js's samples (SPEC-sof, SOF-3).
// The picture is made up here as an ImageData-like { data, width, height }.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { greatCircleNm } from '../../../src/airfields/distance.js';
import { lightningNearHome, MAX_CELLS } from '../../../src/modules/sof/lightning.js';
import { getMapUrl, LAYERS } from '../../../src/modules/sof/feeds.js';
import { lightningBox, decodeDensity, CELL_KM } from '../../../src/modules/sof/map-lightning.js';

const HOME = { icao: 'CYMJ', lat: 50.3303, lon: -105.559 };
const NOW = new Date('2026-09-29T18:42:00Z');
const LAYER_TIME = new Date('2026-09-29T18:40:00Z');

// An empty picture for the box, with the pixels asked for lit (opacity 0 to 255).
function picture(box, lit = []) {
  const data = new Uint8ClampedArray(box.width * box.height * 4);
  for (const [x, y, alpha = 255] of lit) {
    data[(y * box.width + x) * 4 + 3] = alpha;
    data[(y * box.width + x) * 4] = 200;
  }
  return { data, width: box.width, height: box.height };
}

// The pixel whose centre is nearest a place.
function pixelOf(box, lat, lon) {
  const { west, east, south, north } = box.bounds;
  return [Math.floor(((lon - west) / (east - west)) * box.width), Math.floor(((north - lat) / (north - south)) * box.height)];
}

test('the box is centred on home, one pixel to a 2.5 km cell, and reaches the radius plus a cell each way', () => {
  const box = lightningBox({ home: HOME, radiusNm: 20 });
  assert.equal(CELL_KM, 2.5);
  assert.equal(box.width, box.height);
  const mid = { lat: (box.bounds.north + box.bounds.south) / 2, lon: (box.bounds.east + box.bounds.west) / 2 };
  assert.ok(Math.abs(mid.lat - HOME.lat) < 1e-9 && Math.abs(mid.lon - HOME.lon) < 1e-9);
  // north-south a pixel is 2.5 km
  const kmPerPx = ((box.bounds.north - box.bounds.south) / box.height) * 111.195;
  assert.ok(Math.abs(kmPerPx - 2.5) < 0.02, `${kmPerPx} km`);
  // west-east a pixel is 2.5 km too, at home's latitude
  const eastKm = greatCircleNm({ lat: HOME.lat, lon: box.bounds.west }, { lat: HOME.lat, lon: box.bounds.east }) * 1.852;
  assert.ok(Math.abs(eastKm / box.width - 2.5) < 0.03, `${eastKm / box.width} km`);
  // it reaches at least radius + a cell (21.35 NM) each way
  assert.ok(greatCircleNm(HOME, { lat: box.bounds.north, lon: HOME.lon }) >= 20 + 2.5 / 1.852);
  assert.ok(greatCircleNm(HOME, { lat: HOME.lat, lon: box.bounds.east }) >= 20 + 2.5 / 1.852);
});

test('the box does not depend on the map: same home and radius, same box; a bigger radius, a bigger box', () => {
  assert.deepEqual(lightningBox({ home: HOME, radiusNm: 20 }), lightningBox({ home: { lat: HOME.lat, lon: HOME.lon }, radiusNm: 20 }));
  assert.ok(lightningBox({ home: HOME, radiusNm: 50 }).width > lightningBox({ home: HOME, radiusNm: 20 }).width);
});

test('the radius is kept to 5 to 50 NM like lightning.js does, and stays inside the picture size limit', () => {
  assert.deepEqual(lightningBox({ home: HOME, radiusNm: 1 }), lightningBox({ home: HOME, radiusNm: 5 }));
  assert.deepEqual(lightningBox({ home: HOME, radiusNm: 500 }), lightningBox({ home: HOME, radiusNm: 50 }));
  assert.deepEqual(lightningBox({ home: HOME, radiusNm: NaN }), lightningBox({ home: HOME }));
  assert.ok(lightningBox({ home: HOME, radiusNm: 50 }).width <= 2048);
});

test('the box makes an address ECCC\'s image builder accepts, in latitude and longitude', () => {
  const box = lightningBox({ home: HOME, radiusNm: 20 });
  const { west, south, east, north } = box.bounds;
  const url = getMapUrl({ layer: LAYERS.lightning, bbox: [west, south, east, north], width: box.width, height: box.height, crs: 'EPSG:4326', time: LAYER_TIME });
  assert.match(url, /^https:\/\/geo\.weather\.gc\.ca\/geomet\?/);
  assert.match(url, /crs=EPSG:4326/);
  assert.match(url, new RegExp(`width=${box.width}&height=${box.height}`));
});

test('no box for a home that is not a place, or too near the poles or date line', () => {
  for (const home of [null, undefined, {}, { lat: NaN, lon: 0 }, { lat: '50', lon: -105 }, { lat: 89, lon: 0 }, { lat: 50, lon: 181 }, { lat: 50, lon: -179.99 }]) {
    assert.equal(lightningBox({ home }), null, JSON.stringify(home));
  }
  assert.equal(lightningBox(), null);
});

test('only pixels that are not see-through become samples, each at its cell centre, and every pixel is counted as read', () => {
  const box = lightningBox({ home: HOME, radiusNm: 20 });
  const lit = [[10, 20, 255], [11, 20, 128], [30, 5, 1]];
  const out = decodeDensity(picture(box, lit), box);
  assert.equal(out.samples.length, 3);
  assert.equal(out.coverage.cellsRead, box.width * box.height, 'the see-through pixels count too');
  assert.deepEqual(out.coverage.bounds, box.bounds);
  assert.ok(out.samples.every((s) => s.value > 0 && s.value <= 1));
  // read row by row from the top left
  assert.deepEqual(out.samples.map((s) => s.value), [0.004, 1, 0.502]);
  assert.deepEqual(pixelOf(box, out.samples[0].lat, out.samples[0].lon), [30, 5]);
  assert.deepEqual(pixelOf(box, out.samples[1].lat, out.samples[1].lon), [10, 20]);
});

test('an empty picture is no samples but still a full read, so lightning.js can say "clear"', () => {
  const box = lightningBox({ home: HOME, radiusNm: 20 });
  const out = decodeDensity(picture(box), box);
  assert.deepEqual(out.samples, []);
  assert.equal(out.coverage.cellsRead, box.width * box.height);
  const r = lightningNearHome({ ...out, home: HOME, radiusNm: 20, layerTime: LAYER_TIME, now: NOW });
  assert.equal(r.state, 'clear');
  assert.equal(r.caution, null);
});

test('lightning inside the radius is near, and outside it is clear, through lightning.js', () => {
  const box = lightningBox({ home: HOME, radiusNm: 20 });
  const east = (nm) => [HOME.lat, HOME.lon + nm / 60 / Math.cos((HOME.lat * Math.PI) / 180)];
  const at = (nm) => pixelOf(box, ...east(nm));
  const check = (nm) => lightningNearHome({ ...decodeDensity(picture(box, [at(nm)]), box), home: HOME, radiusNm: 20, layerTime: LAYER_TIME, now: NOW });

  const inside = check(12);
  assert.equal(inside.state, 'near');
  assert.equal(inside.cells, 1);
  assert.ok(Math.abs(inside.nearestNm - 12) < 1.5, `${inside.nearestNm}`);
  assert.equal(inside.bearingWords, 'east');
  assert.equal(inside.caution.source, 'LIGHTNING');

  const outside = check(22.2);
  assert.equal(outside.state, 'clear');
  assert.equal(outside.cells, 0);
  assert.ok(Math.abs(outside.nearestNm - 22.2) < 1.5);
});

test('the edge of the box still counts as covering home plus the radius (a cell at the edge of the radius is seen)', () => {
  const box = lightningBox({ home: HOME, radiusNm: 20 });
  // a cell 21 NM north, the outer reach of a cell that overlaps the radius
  const north = pixelOf(box, HOME.lat + 21 / 60, HOME.lon);
  const r = lightningNearHome({ ...decodeDensity(picture(box, [north]), box), home: HOME, radiusNm: 20, layerTime: LAYER_TIME, now: NOW });
  assert.equal(r.state, 'near');
  assert.match(r.words, /edge of the 20 NM radius/);
});

test('a picture that is not the size asked for, or has no data, is null so nothing reads as clear', () => {
  const box = lightningBox({ home: HOME, radiusNm: 20 });
  const good = picture(box);
  assert.equal(decodeDensity({ ...good, width: box.width - 1 }, box), null);
  assert.equal(decodeDensity({ ...good, height: box.height + 1 }, box), null);
  assert.equal(decodeDensity({ ...good, data: good.data.slice(4) }, box), null);
  assert.equal(decodeDensity({ width: box.width, height: box.height }, box), null);
  assert.equal(decodeDensity(null, box), null);
  assert.equal(decodeDensity(good, null), null);
  assert.equal(decodeDensity({ data: [], width: 0, height: 0 }, { ...box, width: 0, height: 0 }), null);
  // and lightning.js, given nothing (the caller passes no samples when the image fails), can't tell
  const r = lightningNearHome({ samples: null, home: HOME, layerTime: LAYER_TIME, now: NOW });
  assert.equal(r.state, 'unknown');
});

test('a sky full of lightning is capped so it can\'t use memory, and lightning.js says it can\'t check it all', () => {
  const box = { bounds: { west: -106, east: -105, south: 50, north: 51 }, width: 400, height: 400, cellKm: 2.5 };
  const data = new Uint8ClampedArray(400 * 400 * 4).fill(255);
  const out = decodeDensity({ data, width: 400, height: 400 }, box);
  assert.ok(out.samples.length <= MAX_CELLS + 400, `${out.samples.length} kept`);
  assert.equal(out.coverage.cellsRead, 160000);
});
