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

// The satellite tile layer: which tiles cover a view, retries, and giving up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tilesFor, createTileLayer, ESRI_IMAGERY } from '../../../src/ui-kit/map-tiles.js';
import { pickTileZoom } from '../../../src/core/geo.js';

const CYMJ = { north: 50.45, south: 50.33, west: -105.65, east: -105.42 };

test('the tiles for a view use V6\'s zoom and cover its corners', () => {
  const pxPerFt = 0.01;
  const tiles = tilesFor(CYMJ, pxPerFt);
  const z = pickTileZoom((CYMJ.north + CYMJ.south) / 2, pxPerFt);
  assert.ok(tiles.length > 0 && tiles.every((t) => t.z === z));
  const b = tiles.map((t) => t.bounds);
  assert.ok(Math.max(...b.map((x) => x.north)) >= CYMJ.north);
  assert.ok(Math.min(...b.map((x) => x.south)) <= CYMJ.south);
  assert.ok(Math.min(...b.map((x) => x.west)) <= CYMJ.west);
  assert.ok(Math.max(...b.map((x) => x.east)) >= CYMJ.east);
  assert.deepEqual(tilesFor({ north: 60, south: 40, west: -120, east: -90 }, 5), []); // far too many: none
});

test('a source with maxZoom caps the zoom, so coarse sources (GOES) still cover a close view', () => {
  const pxPerFt = 0.5; // close in: V6's zoom is well past 7
  const z = pickTileZoom((CYMJ.north + CYMJ.south) / 2, pxPerFt);
  assert.ok(z > 7);
  const tiles = tilesFor(CYMJ, pxPerFt, 7);
  assert.ok(tiles.length > 0 && tiles.every((t) => t.z === 7));
  assert.ok(Math.max(...tiles.map((t) => t.bounds.north)) >= CYMJ.north);
  assert.ok(Math.min(...tiles.map((t) => t.bounds.west)) <= CYMJ.west);
  // Below the cap, and with no cap, nothing changes.
  assert.deepEqual(tilesFor(CYMJ, 0.01, 20), tilesFor(CYMJ, 0.01));
  assert.deepEqual(tilesFor(CYMJ, pxPerFt, undefined), tilesFor(CYMJ, pxPerFt));
});

test('the layer asks for tiles at its source\'s maxZoom', () => {
  const asked = [];
  const source = { maxZoom: 6, url: (z, x, y) => { asked.push(z); return `t/${z}/${x}/${y}`; } };
  const layer = createTileLayer({ source, timers: { after: () => () => {} }, onChange: () => {}, makeImage: () => ({}) });
  const ctx = { drawImage() {} };
  layer.draw(ctx, { corners: CYMJ, pxPerFt: 0.5, toScreen: () => [0, 0] });
  assert.ok(asked.length > 0 && asked.every((z) => z === 6));
  layer.dispose();
});

test('the address is Esri\'s, built from numbers only', () => {
  assert.equal(ESRI_IMAGERY.url(12, 845, 1373), 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/12/1373/845');
});

function harness() {
  const images = [];
  const waits = [];
  const layer = createTileLayer({
    source: { url: (z, x, y) => `t/${z}/${x}/${y}` },
    timers: { after: (ms, fn) => { const w = { ms, fn, cancelled: false }; waits.push(w); return () => { w.cancelled = true; }; } },
    onChange: () => { changes.n += 1; },
    makeImage: () => { const im = {}; images.push(im); return im; },
  });
  const changes = { n: 0 };
  const drawn = [];
  const ctx = { drawImage: (im) => drawn.push(im) };
  const view = { corners: { north: 50.4, south: 50.39, west: -105.54, east: -105.53 }, pxPerFt: 0.02, toScreen: () => [0, 0] };
  return { layer, images, waits, changes, drawn, ctx, view };
}

test('a tile is fetched once, drawn when it arrives, and asks for one redraw', () => {
  const h = harness();
  h.layer.draw(h.ctx, h.view);
  const wanted = h.layer.state().wanted;
  assert.equal(h.images.length, wanted);
  assert.equal(h.images[0].crossOrigin, 'anonymous');
  assert.equal(h.drawn.length, 0);
  h.images.forEach((im) => im.onload());
  assert.equal(h.changes.n, wanted);
  h.layer.draw(h.ctx, h.view);
  assert.equal(h.images.length, wanted); // nothing fetched again
  assert.equal(h.drawn.length, wanted);
});

test('a failed tile is tried twice more, the last time without CORS, then given up on', () => {
  const h = harness();
  h.layer.draw(h.ctx, h.view);
  const first = h.images[0];
  first.onerror();
  assert.equal(h.waits[0].ms, 2000);
  h.waits[0].fn();
  h.images.at(-1).onerror();
  assert.equal(h.waits[1].ms, 6000);
  h.waits[1].fn();
  const last = h.images.at(-1);
  assert.equal(last.crossOrigin, undefined);
  const before = h.changes.n;
  last.onerror();
  assert.equal(h.changes.n, before + 1);
  h.layer.draw(h.ctx, h.view);
  assert.ok(h.layer.state().failed >= 1);
});

test('dispose stops pending retries and late arrivals', () => {
  const h = harness();
  h.layer.draw(h.ctx, h.view);
  h.images[0].onerror();
  h.layer.dispose();
  assert.equal(h.waits[0].cancelled, true);
  assert.equal(h.images[1]?.onload ?? null, null);
});
