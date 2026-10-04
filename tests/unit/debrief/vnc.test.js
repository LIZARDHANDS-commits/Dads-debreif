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

// The VNC chart layer (SPEC-debrief: Map layers): charts fetched only when
// shown, warped once per alignment (#43), and a failed chart reported.
// The warp itself is pinned in tests/golden/debrief-vnc.test.js. What the user sees is checked here: the chart covers
// its corners on the map and is redrawn once a frame (DB-R14); how many triangles the warp uses is not checked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeLocalRef, latLonToLocalFt } from '../../../src/core/geo.js';
import {
  VNC_CHARTS, VNC_CHOICES, VNC_FILES, VNC_DEFAULT_ALIGN, chartsBounds, createVncLayer,
} from '../../../src/modules/debrief/map2d/vnc.js';

const ref = makeLocalRef(50.3916, -105.5349);

// A stand-in canvas that counts its drawImage calls.
function fakeCanvas(width, height) {
  const calls = { drawImage: 0, drawn: [] };
  const ctx = new Proxy({ calls }, {
    get: (o, k) => (k in o ? o[k] : (...a) => { if (k === 'drawImage') { calls.drawImage += 1; calls.drawn.push(a); } return a; }),
    set: (o, k, v) => { o[k] = v; return true; },
  });
  return { width, height, getContext: () => ctx, ctx };
}

function setup() {
  const images = [];
  const made = [];
  let changes = 0;
  const layer = createVncLayer({
    base: 'https://example.test/app/',
    onChange: () => { changes += 1; },
    makeImage: () => { const im = { naturalWidth: 2048, naturalHeight: 1190 }; images.push(im); return im; },
    makeCanvas: (w, h) => { const c = fakeCanvas(w, h); made.push(c); return c; },
  });
  const map = { worldToScreen: (x, y) => [x / 1000, -y / 1000] };
  const screen = fakeCanvas(100, 100);
  const draw = (keys, align = VNC_DEFAULT_ALIGN) => layer.draw(screen.ctx, { keys, map, ref, align, opacityPct: 78 });
  return { layer, images, made, draw, changes: () => changes, screen };
}

test('the choices are Off, South, North and Both (DB-R14)', () => {
  assert.deepEqual({ ...VNC_CHOICES }, { off: [], south: ['south'], north: ['north'], both: ['south', 'north'] });
});

test('nothing is fetched until a chart is shown, then only that chart, once', () => {
  const s = setup();
  s.draw([]);
  assert.equal(s.images.length, 0);
  s.draw(['south']);
  s.draw(['south']);
  assert.deepEqual(s.images.map((im) => im.src), [`https://example.test/app/${VNC_FILES.south}`]);
  assert.deepEqual(s.layer.state(), { wanted: 1, ready: 0, failed: 0 });
});

test('a chart is warped once per alignment, then drawn with one drawImage a frame', () => {
  const s = setup();
  s.draw(['north']);
  s.images[0].onload();
  assert.equal(s.changes(), 1);
  s.draw(['north']);
  assert.equal(s.made.length, 1);
  const warped = s.made[0];
  assert.ok(warped.ctx.calls.drawImage > 0); // the chart was drawn into its warped copy (how many triangles it takes is not checked)
  assert.ok(Math.abs(warped.width - 2048) < 400 && warped.height > 1000); // about the image's own resolution
  const before = s.screen.ctx.calls.drawImage;
  s.draw(['north']);
  s.draw(['north']);
  assert.equal(s.made.length, 1);
  assert.equal(s.screen.ctx.calls.drawImage - before, 2); // two frames, two drawImage calls: one a frame
  s.draw(['north'], { nudgeEastNm: 2, nudgeNorthNm: 0, scalePct: 100 });
  assert.equal(s.made.length, 2);
  assert.deepEqual(s.layer.state(), { wanted: 1, ready: 1, failed: 0 });
});

test('each chart covers its four corners on the map, and nudging it east moves it east', () => {
  const NM_FT = 6076.12; // feet in a nautical mile
  for (const key of Object.keys(VNC_CHARTS)) {
    const s = setup();
    s.draw([key]);
    s.images[0].onload();
    const rectOf = (align) => {
      s.screen.ctx.calls.drawn.length = 0;
      s.draw([key], align);
      const [, x, y, w, h] = s.screen.ctx.calls.drawn.at(-1);
      return { left: x, top: y, right: x + w, bottom: y + h };
    };
    const rect = rectOf(VNC_DEFAULT_ALIGN);
    // The chart's four corners are where its edges say, in latitude and longitude, turned into map feet and then
    // through the map's own scale (1 px = 1,000 ft in this test's map). The chart's hand alignment moves its
    // edges by up to about 1.4 NM, so each edge must be within 2 NM of its nominal place.
    const ch = VNC_CHARTS[key];
    const px = (lat, lon) => { const p = latLonToLocalFt(ref, lat, lon); return [p.x / 1000, -p.y / 1000]; };
    const tolPx = (2 * NM_FT) / 1000;
    const [westPx, northPx] = px(ch.north, ch.west);
    const [eastPx, southPx] = px(ch.south, ch.east);
    assert.ok(Math.abs(rect.left - westPx) <= tolPx, `${key} west edge ${rect.left} vs ${westPx}`);
    assert.ok(Math.abs(rect.right - eastPx) <= tolPx, `${key} east edge ${rect.right} vs ${eastPx}`);
    assert.ok(Math.abs(rect.top - northPx) <= tolPx, `${key} north edge ${rect.top} vs ${northPx}`);
    assert.ok(Math.abs(rect.bottom - southPx) <= tolPx, `${key} south edge ${rect.bottom} vs ${southPx}`);
    // Nudge 2 NM east: the whole chart moves 2 NM (12 px here) east, and not north or south.
    const nudged = rectOf({ nudgeEastNm: 2, nudgeNorthNm: 0, scalePct: 100 });
    assert.ok(Math.abs(nudged.left - rect.left - (2 * NM_FT) / 1000) < 1, `${key} moved ${nudged.left - rect.left}`);
    assert.ok(Math.abs(nudged.top - rect.top) < 1);
  }
});

test('a chart that can\'t load is reported, and a closed layer ignores late arrivals', () => {
  const s = setup();
  s.draw(['south', 'north']);
  s.images[0].onerror();
  s.draw(['south', 'north']);
  assert.deepEqual(s.layer.state(), { wanted: 2, ready: 0, failed: 1 });
  s.layer.dispose();
  assert.equal(s.images[1].onload, null);
});

test('the charts\' box covers each chart\'s corners, to fit the view to them', () => {
  const box = chartsBounds(['south', 'north'], ref);
  for (const ch of Object.values(VNC_CHARTS)) {
    for (const [lat, lon] of [[ch.north, ch.west], [ch.south, ch.east]]) {
      const p = latLonToLocalFt(ref, lat, lon);
      assert.ok(p.x >= box.minX - 1 && p.x <= box.maxX + 1 && p.y >= box.minY - 1 && p.y <= box.maxY + 1, `${ch.name}`);
    }
  }
  // Moose Jaw, the anchor, is inside.
  assert.ok(box.minX < 0 && box.maxX > 0 && box.minY < 0 && box.maxY > 0);
});
