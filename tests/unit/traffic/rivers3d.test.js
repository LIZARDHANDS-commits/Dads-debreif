// Checks: the recessed river valley stays on the photo square it is laid in, sinks below the photo but no deeper than
//   the valley depth, meets the photo at its edges, and is absent from a square no river crosses.
// Serves: TR-R23 (scenery), TR-70.
// Expected values: always-true geometry, not traced numbers.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadThree } from '../../../src/ui-kit/three-aircraft.js';
import { createRiverGeometry, RIVER_VALLEY_DEPTH_FT } from '../../../src/modules/traffic/rivers3d.js';
import { PATTERN_MID_QUADS, PATTERN_MID_SPAN_FT } from '../../../src/modules/traffic/view3d.js';

const THREE = await loadThree();

test('each river valley stays on its photo square, below the photo, no deeper than the valley, edges on the photo', () => {
  let squares = 0;
  for (const q of PATTERN_MID_QUADS) {
    const geo = createRiverGeometry(THREE, { x: q.x, y: q.y, span: PATTERN_MID_SPAN_FT / 2 });
    if (!geo) continue;
    squares++;
    const pos = geo.getAttribute('position');
    const uv = geo.getAttribute('uv');
    let edgesOnPhoto = 0;
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      assert.ok(z <= 0 && z >= -RIVER_VALLEY_DEPTH_FT - 1e-6, 'between the photo and the valley floor');
      if (z === 0) edgesOnPhoto++;
      assert.ok(uv.getX(i) >= 0 && uv.getX(i) <= 1 && uv.getY(i) >= 0 && uv.getY(i) <= 1, 'on the square\'s own photo');
    }
    assert.ok(edgesOnPhoto > 0, 'the banks meet the photo');
    geo.dispose();
  }
  assert.ok(squares > 0, 'the rivers cross the High photo squares');
});

test('a square far from both rivers gets no valley', () => {
  assert.equal(createRiverGeometry(THREE, { x: -200_000, y: 200_000, span: 10_000 }), null);
});
