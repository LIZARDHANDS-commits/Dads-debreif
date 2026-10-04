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

// Tests for src/modules/sof/map-lightning.js: the fixed box read around home and the decoding
// of ECCC's lightning density picture into lightning.js's samples (SPEC-sof, SOF-3).
// The picture is made up here as an ImageData-like { data, width, height }.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { greatCircleNm } from '../../../src/airfields/distance.js';
import { lightningNearHome, MAX_CELLS } from '../../../src/modules/sof/lightning.js';
import { getMapUrl, LAYERS } from '../../../src/modules/sof/feeds.js';
import { lightningBox, decodeDensity, CELL_KM, recolourLightning, LIGHTNING_MARK } from '../../../src/modules/sof/map-lightning.js';

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

test('the box is centred on home, two pixels to a 2.5 km cell each way (1.25 km pixels), and reaches the radius plus a cell each way', () => {
  const box = lightningBox({ home: HOME, radiusNm: 20 });
  assert.equal(CELL_KM, 2.5);
  assert.equal(box.width, box.height);
  const mid = { lat: (box.bounds.north + box.bounds.south) / 2, lon: (box.bounds.east + box.bounds.west) / 2 };
  assert.ok(Math.abs(mid.lat - HOME.lat) < 1e-9 && Math.abs(mid.lon - HOME.lon) < 1e-9);
  // north-south a pixel is 1.25 km, so a 2.5 km cell is never between two samples
  const kmPerPx = ((box.bounds.north - box.bounds.south) / box.height) * 111.195;
  assert.ok(Math.abs(kmPerPx - 1.25) < 0.01, `${kmPerPx} km`);
  // west-east a pixel is 1.25 km too, at home's latitude
  const eastKm = greatCircleNm({ lat: HOME.lat, lon: box.bounds.west }, { lat: HOME.lat, lon: box.bounds.east }) * 1.852;
  assert.ok(Math.abs(eastKm / box.width - 1.25) < 0.02, `${eastKm / box.width} km`);
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
  assert.ok(lightningBox({ home: HOME, radiusNm: 50 }).width <= 160, 'the biggest box is 160 pixels a side');
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
  // a sample 20.5 NM north (lightning.js counts a sample up to 1 NM beyond the radius: half a 2.5 km cell's diagonal)
  const north = pixelOf(box, HOME.lat + 20.5 / 60, HOME.lon);
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

test('an isolated 2.5 km cell that sits off the sampling grid still reads near (no gap between samples)', () => {
  const box = lightningBox({ home: HOME, radiusNm: 20 });
  // ECCC's cells are 2.5 km squares on their own grid, which is not ours: this one starts half a pixel
  // into ours, so it covers parts of 3 x 3 of our 1.25 km pixels. Any of them lit is enough.
  const [px, py] = pixelOf(box, HOME.lat, HOME.lon + 10 / 60 / Math.cos((HOME.lat * Math.PI) / 180));
  const data = new Uint8ClampedArray(box.width * box.height * 4);
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) data[((py + dy) * box.width + px + dx) * 4 + 3] = 255;
  const out = decodeDensity({ data, width: box.width, height: box.height }, box);
  assert.equal(out.samples.length, 4);
  const r = lightningNearHome({ samples: out.samples, coverage: out.coverage, home: HOME, radiusNm: 20, layerTime: LAYER_TIME, now: NOW });
  assert.equal(r.state, 'near');
  // and a cell whose only lit sample is at one corner of that 2.5 km square is found too
  const corner = new Uint8ClampedArray(box.width * box.height * 4);
  corner[((py + 1) * box.width + px + 1) * 4 + 3] = 255;
  const one = decodeDensity({ data: corner, width: box.width, height: box.height }, box);
  assert.equal(lightningNearHome({ samples: one.samples, coverage: one.coverage, home: HOME, radiusNm: 20, layerTime: LAYER_TIME, now: NOW }).state, 'near');
});

// ---- F4 (sof-recheck-207, HIGH): lightning is drawn as a mark that can be seen on every base map -------------------------

// WCAG relative luminance and contrast ratio (sRGB), the measure the audit used for 1.4.11 (3 : 1 for graphics that carry meaning).
const lin = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const over = (top, under, alpha) => top.map((v, i) => Math.round(v * alpha + under[i] * (1 - alpha)));

// Representative colours of each base map as drawn (the satellite is dimmed by BASE_DIM; the first two satellite colours
// are the audit's measured surroundings of a real cell), from dark forest and water to bright snow, cloud and bare fields;
// the VNC chart's pale paper, tinted land and water, and its magenta lines; VNC over satellite at its 70% default.
const SATELLITE = [[49, 50, 69], [69, 75, 36], [20, 30, 40], [90, 100, 80], [128, 128, 128], [170, 165, 140], [215, 215, 205], [250, 250, 250]];
const VNC = [[236, 232, 214], [200, 225, 190], [180, 205, 228], [240, 215, 170], [170, 60, 150], [90, 120, 160], [255, 255, 255]];
const VNC_OVER_SATELLITE = VNC.flatMap((chart) => SATELLITE.slice(0, 4).map((sat) => over(chart, sat, 0.7)));
const BASES = { satellite: SATELLITE, vnc: VNC, 'vnc over satellite': VNC_OVER_SATELLITE };

test('SPEC-sof line ~314 (audit #9, "lightning is visible"): a lightning cell is at least 3 : 1 against the satellite, the VNC chart and VNC over satellite, at the default and full opacity', () => {
  for (const opacity of [0.85, 1]) {
    // What is seen at this opacity: each part of the mark over the base.
    for (const [name, colours] of Object.entries(BASES)) {
      for (const base of colours) {
        const f = over(LIGHTNING_MARK.fill, base, opacity);
        const o = over(LIGHTNING_MARK.outline, base, opacity);
        // A cell reads if its fill or its outline stands out from the base, and the fill from the outline (so the shape holds on any ground).
        const best = Math.max(contrast(f, base), contrast(o, base));
        assert.ok(best >= 3, `${name} ${base} at ${opacity * 100}%: ${best.toFixed(2)} : 1`);
        assert.ok(contrast(f, o) >= 3, `${name} ${base} at ${opacity * 100}%: fill against its outline ${contrast(f, o).toFixed(2)} : 1`);
      }
    }
  }
  // The satellite is mostly dark: there the bright fill itself carries it, at 3 : 1 or better against the dark colours (the first four).
  for (const base of SATELLITE.slice(0, 4)) {
    assert.ok(contrast(over(LIGHTNING_MARK.fill, base, 0.85), base) >= 3, `fill on satellite ${base}`);
  }
});

test('the old colour did not pass: ECCC\'s (0,0,190) at 85% over the audit\'s satellite surroundings is 1.02 to 1.41 : 1', () => {
  for (const base of [[49, 50, 69], [69, 75, 36]]) {
    const old = contrast(over([0, 0, 190], base, 0.85), base);
    assert.ok(old < 3 && old < 1.5, `${old.toFixed(2)}`);
  }
});

test('recolourLightning: each lit pixel becomes a bright fill with a dark outline, at least 3 pixels across, and nothing else is drawn', () => {
  const box = { width: 20, height: 20 };
  const image = picture(box, [[10, 10]]);
  const out = recolourLightning(image);
  assert.equal(out.width, 20);
  assert.equal(out.height, 20);
  const px = (x, y) => Array.from(out.data.slice((y * 20 + x) * 4, (y * 20 + x) * 4 + 4));
  assert.deepEqual(px(10, 10), [...LIGHTNING_MARK.fill, 255], 'the cell itself is the fill');
  assert.deepEqual(px(9, 9), [...LIGHTNING_MARK.fill, 255], 'the fill is at least 3 pixels across');
  assert.deepEqual(px(11, 11), [...LIGHTNING_MARK.fill, 255]);
  assert.deepEqual(px(12, 10), [...LIGHTNING_MARK.outline, 255], 'a dark outline round it');
  assert.deepEqual(px(8, 8), [...LIGHTNING_MARK.outline, 255]);
  assert.equal(px(13, 10)[3], 0, 'and nothing beyond');
  assert.equal(px(0, 0)[3], 0);
});

test('recolourLightning: an empty picture stays empty, a cell at the edge stays inside the picture, and the input is not changed', () => {
  const empty = picture({ width: 8, height: 8 });
  assert.ok(recolourLightning(empty).data.every((v) => v === 0));
  const edge = picture({ width: 8, height: 8 }, [[0, 0], [7, 7]]);
  const before = Array.from(edge.data);
  const out = recolourLightning(edge);
  assert.equal(out.data.length, 8 * 8 * 4);
  assert.deepEqual(Array.from(out.data.slice(0, 4)), [...LIGHTNING_MARK.fill, 255]);
  assert.deepEqual(Array.from(edge.data), before);
});

test('recolourLightning: two neighbouring cells share one outline (the fill of one is never overdrawn by the other\'s outline)', () => {
  const out = recolourLightning(picture({ width: 20, height: 8 }, [[8, 4], [10, 4]]));
  const px = (x, y) => Array.from(out.data.slice((y * 20 + x) * 4, (y * 20 + x) * 4 + 3));
  for (const x of [7, 8, 9, 10, 11]) assert.deepEqual(px(x, 4), [...LIGHTNING_MARK.fill], `x=${x}`);
  assert.deepEqual(px(12, 4), [...LIGHTNING_MARK.outline]);
});

test('recolourLightning: a picture that is not readable gives null rather than a blank one', () => {
  for (const bad of [null, undefined, {}, { width: 2, height: 2 }, { width: 2, height: 2, data: new Uint8ClampedArray(3) }]) {
    assert.equal(recolourLightning(bad), null);
  }
});

test('recolourLightning: a picture that is mostly lit (over a quarter of its pixels) skips the outline pass, so a hostile opaque picture is cheap, but still shows its lightning', () => {
  const box = { width: 40, height: 40 };
  const lit = [];
  for (let y = 0; y < 40; y++) for (let x = 0; x < 15; x++) lit.push([x, y]); // 37.5% lit
  const out = recolourLightning(picture(box, lit));
  const px = (x, y) => Array.from(out.data.slice((y * 40 + x) * 4, (y * 40 + x) * 4 + 4));
  assert.deepEqual(px(5, 5), [...LIGHTNING_MARK.fill, 255], 'every lit pixel is still the bright fill');
  assert.equal(px(16, 5)[3], 0, 'no outline round it (the pass is skipped)');
  // A quarter or less keeps the outline.
  const few = recolourLightning(picture(box, Array.from({ length: 10 }, (_, i) => [i, 0])));
  assert.deepEqual(Array.from(few.data.slice((0 * 40 + 11) * 4, (0 * 40 + 11) * 4 + 4)), [...LIGHTNING_MARK.outline, 255]);
});

test('recolourLightning: over the cap the outline and dilation work is skipped: one paint per lit pixel, not two 25- and 9-pixel ones (counted, not timed)', () => {
  const size = 200;
  const stats = { paints: 0, writes: 0 };
  recolourLightning({ data: new Uint8ClampedArray(size * size * 4).fill(255), width: size, height: size }, stats);
  assert.equal(stats.paints, size * size, 'fully lit: fill only, one paint each');
  assert.equal(stats.writes, size * size, 'and one pixel written each');
  const few = { paints: 0, writes: 0 };
  recolourLightning(picture({ width: size, height: size }, [[100, 100]]), few);
  assert.equal(few.paints, 2, 'a single cell: an outline paint and a fill paint');
  assert.equal(few.writes, 25 + 9);
});
