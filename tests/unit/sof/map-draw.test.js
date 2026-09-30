// Tests for src/modules/sof/map-draw.js drawGeoImage: a see-through picture is laid in strips that meet exactly,
// so no row is drawn twice (L1 of sof-recheck-207: faint seams in the cloud and coverage layers below 100%).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawGeoImage } from '../../../src/modules/sof/map-draw.js';

/** A context that records drawImage's destination boxes and the alpha each was drawn at. */
function recorder() {
  const calls = [];
  const ctx = {
    globalAlpha: 1,
    save() {},
    restore() {},
    drawImage(_img, _sx, _sy, _sw, _sh, x, y, w, h) {
      calls.push({ x, y, w, h, alpha: this.globalAlpha });
    },
  };
  return { ctx, calls };
}

const IMAGE = { width: 400, height: 240 };
const BBOX = [-107, 49.2, -104, 51.4];
// A north-up projection, not a whole number of pixels per strip: y grows southwards.
const project = (lat, lon) => [(lon + 107) * 301.3, (51.4 - lat) * 377.7 + 13.2];

test('L1: below full opacity the strips meet exactly on whole pixels, so no row is drawn twice', () => {
  const { ctx, calls } = recorder();
  drawGeoImage(ctx, IMAGE, BBOX, project, 0.6);
  assert.equal(calls.length, 12);
  for (const c of calls) assert.equal(c.alpha, 0.6);
  for (let i = 1; i < calls.length; i++) {
    assert.equal(calls[i - 1].y + calls[i - 1].h, calls[i].y, `strip ${i} starts where strip ${i - 1} ends`);
    assert.equal(Number.isInteger(calls[i].y), true);
  }
});
