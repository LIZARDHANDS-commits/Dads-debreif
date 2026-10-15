// Golden test (R9, D10): the map's world-to-screen transform and the embedded
// VNC chart warp against V6's KML viewer code, run unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadV6, v6Page } from './v6-source.js';
import { seeded } from './inputs.js';
import { makeLocalRef, latLonToLocalFt } from '../../src/core/geo.js';
import { toScreen } from '../../src/ui-kit/canvas-view.js';
import {
  VNC_CHARTS, VNC_WARP_MESH, VNC_MESH_CELLS, vncBaseLatLon, vncWarpLatLon, vncWarpGrid, triangleTransform,
} from '../../src/modules/debrief/map2d/vnc.js';
import { VNC_ANCHOR } from '../../src/modules/debrief/data/cymj.js';

const MARKER = 'const KML_FT_PER_M=3.28084';

/** V6's literal between `start` and the first `end` after it, evaluated. */
function v6Literal(start, end) {
  const src = v6Page();
  const i = src.indexOf(start);
  const j = src.indexOf(end, i);
  assert.ok(i >= 0 && j > i, start);
  return new Function(`${src.slice(i, j)}; return ${start.match(/const (\w+)/)[1]};`)();
}

function v6Map() {
  const charts = v6Literal('const EMBEDDED_VNC_CHARTS=', 'const embeddedVncImages');
  const mesh = v6Literal('const VNC_WARP_MESH=', 'function vncBaseGeo');
  const v6 = loadV6(['kWorldToScreen', 'kLatLonToLocal', 'ensureEmbeddedVncRef', 'mercatorY', 'invMercatorY', 'vncBaseGeo', 'vncWarpPoint', 'drawTri'], {
    marker: MARKER,
    prelude: `const KML_FT_PER_M=3.28084;
      let kmlRef=null, kmlPan={x:0,y:0}, kmlZoom=0.09, canvas={width:1200,height:800}, devicePixelRatio=1, last=null;
      const VNC_WARP_MESH=__mesh;
      const kc=()=>canvas, kmlIs3D=()=>false;
      const ctx={ save(){}, restore(){}, beginPath(){}, moveTo(){}, lineTo(){}, closePath(){}, clip(){}, drawImage(){},
        setTransform(...m){ last=m; } };
      function setMap(s){ kmlRef=s.ref===undefined?kmlRef:s.ref; kmlPan=s.pan||kmlPan; kmlZoom=s.zoom||kmlZoom; canvas=s.canvas||canvas; devicePixelRatio=s.dpr||1; }
      function tri(...a){ last=null; drawTri(ctx,null,...a); return last; }`.replace('__mesh', JSON.stringify(mesh)),
    expose: ['setMap', 'tri'],
  });
  return { v6, charts, mesh };
}

test('the chart bounds and warp mesh are V6\'s', () => {
  const { charts, mesh } = v6Map();
  for (const key of ['south', 'north']) {
    const { name, west, east, north, south } = charts[key];
    assert.deepEqual({ ...VNC_CHARTS[key] }, { name, west, east, north, south });
  }
  assert.deepEqual(VNC_WARP_MESH, mesh);
});

test('with no track loaded, local feet are measured from V6\'s CYMJ anchor', () => {
  const { v6 } = v6Map();
  v6.setMap({ ref: null });
  v6.ensureEmbeddedVncRef();
  const ref = makeLocalRef(VNC_ANCHOR.lat, VNC_ANCHOR.lon);
  for (const [lat, lon] of [[51, -105], [48.7, -108.3], [53.1, -103.1]]) {
    assert.deepEqual(latLonToLocalFt(ref, lat, lon), v6.kLatLonToLocal(lat, lon));
  }
});

test('the ui-kit canvas view with centre −pan and scale zoom × pixel ratio is V6\'s 2D kWorldToScreen', () => {
  const { v6 } = v6Map();
  const r = seeded(41);
  for (let i = 0; i < 3000; i++) {
    const pan = { x: -80000 + 160000 * r(), y: -80000 + 160000 * r() };
    const zoom = 0.01 + 0.49 * r(), dpr = [1, 2, 1.25][Math.floor(3 * r())];
    const size = { width: Math.round(400 + 3000 * r()), height: Math.round(300 + 2000 * r()) };
    v6.setMap({ pan, zoom, canvas: size, dpr });
    const x = -100000 + 200000 * r(), y = -100000 + 200000 * r();
    const want = v6.kWorldToScreen(x, y);
    const [sx, sy] = toScreen({ cx: -pan.x, cy: -pan.y, scale: zoom * dpr }, size, x, y);
    assert.ok(Math.abs(sx - want.x) < 1e-6 && Math.abs(sy - want.y) < 1e-6, `${sx},${sy} vs ${want.x},${want.y}`);
  }
});

test('vncBaseLatLon and vncWarpLatLon match V6 for any image point and alignment', () => {
  const { v6 } = v6Map();
  const ref = makeLocalRef(VNC_ANCHOR.lat, VNC_ANCHOR.lon);
  // Screen = local feet exactly: no pan, zoom 1, pixel ratio 1, canvas 0 × 0.
  v6.setMap({ ref, pan: { x: 0, y: 0 }, zoom: 1, canvas: { width: 0, height: 0 }, dpr: 1 });
  const r = seeded(42);
  for (let i = 0; i < 4000; i++) {
    const key = r() < 0.5 ? 'south' : 'north', ch = VNC_CHARTS[key];
    const u = [0, 0.5, 1, r()][Math.floor(4 * r())], v = [0, 0.5, 1, r()][Math.floor(4 * r())];
    const align = r() < 0.3 ? { nudgeEastNm: 0, nudgeNorthNm: 0, scalePct: 100 }
      : { nudgeEastNm: Math.round(-20 + 40 * r()), nudgeNorthNm: Math.round(-20 + 40 * r()), scalePct: 97 + 6 * r() };
    assert.deepEqual(vncBaseLatLon(ch, u, v), v6.vncBaseGeo(ch, u, v));
    const want = v6.vncWarpPoint(ch, key, u, v, align.nudgeEastNm, align.nudgeNorthNm, align.scalePct / 100);
    const g = vncWarpLatLon(key, u, v, align);
    const got = v6.kLatLonToLocal(g.lat, g.lon);
    assert.deepEqual({ x: got.x, y: -got.y }, { x: want.x, y: want.y });
  }
});

test('vncWarpGrid gives the 19 × 19 mesh V6 warps each frame, in local feet', () => {
  const { v6 } = v6Map();
  const ref = makeLocalRef(50.33, -105.56);
  v6.setMap({ ref, pan: { x: 0, y: 0 }, zoom: 1, canvas: { width: 0, height: 0 }, dpr: 1 });
  const align = { nudgeEastNm: 3, nudgeNorthNm: -2, scalePct: 100.4 };
  const grid = vncWarpGrid('north', ref, align);
  assert.equal(grid.length, (VNC_MESH_CELLS + 1) ** 2);
  for (let j = 0; j <= VNC_MESH_CELLS; j++) {
    for (let i = 0; i <= VNC_MESH_CELLS; i++) {
      const want = v6.vncWarpPoint(VNC_CHARTS.north, 'north', i / VNC_MESH_CELLS, j / VNC_MESH_CELLS, 3, -2, 1.004);
      const p = grid[j * (VNC_MESH_CELLS + 1) + i];
      assert.deepEqual({ x: p.x, y: -p.y }, { x: want.x, y: want.y });
    }
  }
});

test('triangleTransform is V6\'s drawTri canvas transform, and null for a flat image triangle', () => {
  const { v6 } = v6Map();
  const r = seeded(43);
  const pt = () => ({ x: -500 + 3000 * r(), y: -500 + 3000 * r() });
  for (let i = 0; i < 2000; i++) {
    const s = [pt(), pt(), pt()], d = [pt(), pt(), pt()];
    assert.deepEqual(triangleTransform(...s, ...d), v6.tri(...s, ...d));
  }
  const flat = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }];
  assert.equal(triangleTransform(...flat, ...flat), null);
  assert.equal(v6.tri(...flat, ...flat), null);
});
