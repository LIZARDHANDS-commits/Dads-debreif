// Checks: sliding the SOF's 3D map (Dad, 8 Oct: "click and drag to move around the 3D map"): a drag moves the point looked at across the ground by the
//   dragged distance at that zoom, in the direction the camera's heading says, the point never leaves the chosen 3D area however far it is dragged, and
//   Home brings it back to home; the 900 NM area choice is 900 NM wide.
// Serves: the SOF 3D view's pan and "3D area" setting (Dad, 8 Oct 2026; SOF-47).
// Expected values: plain geometry of a straight-down or tilted orthographic view, stated here: with the camera facing north (heading 0) screen right
//   is east and up the screen is north; facing north-west (heading -45 degrees, the start view from the south-east) screen right is north-east. A
//   ground distance up the screen shows foreshortened by cos(tilt from straight down), so 100 px up the screen at 45 degrees is 100 / cos 45 = 141.4 px
//   of ground. 1 NM = 1,852 m and 1 ft = 0.3048 m (international definitions). Margin: the shared table's 100 ft for positions. Not from the code's output.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { panBy, homeCamera, setAreaNm, AREA_NM, AREA_FT } from '../../../src/modules/sof/scene3d-model.js';

const FT_PER_NM = 1852 / 0.3048; // international nautical mile and foot
const MARGIN_FT = 100; // shared table

test('a drag slides the ground under the pointer, stays inside the chosen area, and Home goes back to home; the 900 NM area is 900 NM wide', () => {
  try {
    // Straight down, facing north, 1,000 ft a pixel: a drag 100 px to the right carries the ground east with the pointer, so the point looked at is 100,000 ft west.
    const north = { yawDeg: 0, pitchDeg: 0, zoom: 1, tx: 0, ty: 0 };
    const west = panBy(north, 100, 0, 1000);
    assert.ok(Math.abs(west.tx - -100_000) <= MARGIN_FT && Math.abs(west.ty) <= MARGIN_FT, `drag right: looks ${west.tx} ft east, ${west.ty} ft north`);
    // A drag 100 px down the screen carries the ground south, so the point looked at is 100,000 ft north.
    const up = panBy(north, 0, 100, 1000);
    assert.ok(Math.abs(up.ty - 100_000) <= MARGIN_FT && Math.abs(up.tx) <= MARGIN_FT, 'drag down: the point looked at moves north');

    // The start view looks north-west from the south-east, 45 degrees down: dragging 100 px left moves the point looked at 100,000 ft to the north-east (screen right),
    // and dragging 100 px down moves it 141,421 ft (100 / cos 45 px of ground) to the north-west (up the screen).
    const start = { yawDeg: -45, pitchDeg: 45, zoom: 1, tx: 0, ty: 0 };
    const ne = panBy(start, -100, 0, 1000);
    const d = 100_000 / Math.SQRT2;
    assert.ok(Math.abs(ne.tx - d) <= MARGIN_FT && Math.abs(ne.ty - d) <= MARGIN_FT, `drag left: north-east by 100,000 ft (got ${Math.round(ne.tx)}, ${Math.round(ne.ty)})`);
    const nw = panBy(start, 0, 100, 1000);
    const g = (100_000 / Math.cos(Math.PI / 4)) / Math.SQRT2;
    assert.ok(Math.abs(nw.tx + g) <= MARGIN_FT && Math.abs(nw.ty - g) <= MARGIN_FT, `drag down: north-west by 141,421 ft (got ${Math.round(nw.tx)}, ${Math.round(nw.ty)})`);

    // The 900 NM choice: the square is 900 NM on a side, and the point looked at never leaves it however far the map is dragged, in any direction.
    setAreaNm(900);
    assert.equal(AREA_NM, 900);
    assert.ok(Math.abs(AREA_FT - 900 * FT_PER_NM) <= MARGIN_FT, `the area is 900 NM wide (${AREA_FT} ft)`);
    const half = (900 / 2) * FT_PER_NM;
    let cam = { ...start };
    for (const [dx, dy] of [[-5000, 0], [0, 5000], [5000, 5000], [-5000, -5000], [3000, -7000]]) {
      cam = panBy(cam, dx, dy, 2000);
      assert.ok(Math.abs(cam.tx) <= half + MARGIN_FT && Math.abs(cam.ty) <= half + MARGIN_FT, `inside the 900 NM square after a long drag (${Math.round(cam.tx)}, ${Math.round(cam.ty)})`);
    }
    // Home: back to home, from the south-east, 45 degrees down.
    const home = homeCamera();
    assert.equal(home.tx ?? 0, 0);
    assert.equal(home.ty ?? 0, 0);
    assert.deepEqual([home.yawDeg, home.pitchDeg, home.zoom], [-45, 45, 1]);
  } finally {
    setAreaNm(450); // the default, for any test after this one
  }
});
