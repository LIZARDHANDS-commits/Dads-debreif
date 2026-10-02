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
// The warp itself is pinned to V6 in tests/golden/debrief-vnc.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeLocalRef, latLonToLocalFt } from '../../../src/core/geo.js';
import {
  VNC_CHARTS, VNC_CHOICES, VNC_FILES, VNC_DEFAULT_ALIGN, chartsBounds, createVncLayer,
} from '../../../src/modules/debrief/map2d/vnc.js';

const ref = makeLocalRef(50.3916, -105.5349);

// A stand-in canvas that counts its drawImage calls.
function fakeCanvas(width, height) {
  const calls = { drawImage: 0 };
  const ctx = new Proxy({ calls }, {
    get: (o, k) => (k in o ? o[k] : (...a) => { if (k === 'drawImage') calls.drawImage += 1; return a; }),
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

test('the choices are V6\'s Off, South, North and Both', () => {
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
  assert.equal(warped.ctx.calls.drawImage, 18 * 18 * 2); // V6's mesh, every triangle
  assert.ok(Math.abs(warped.width - 2048) < 400 && warped.height > 1000); // about the image's own resolution
  const before = s.screen.ctx.calls.drawImage;
  s.draw(['north']);
  s.draw(['north']);
  assert.equal(s.made.length, 1);
  assert.equal(s.screen.ctx.calls.drawImage - before, 2);
  s.draw(['north'], { nudgeEastNm: 2, nudgeNorthNm: 0, scalePct: 100 });
  assert.equal(s.made.length, 2);
  assert.deepEqual(s.layer.state(), { wanted: 1, ready: 1, failed: 0 });
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
