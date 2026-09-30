// Golden test (R9): src/core/geo.js projects exactly as V6 does.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as geo from '../../src/core/geo.js';
import { loadV6 } from './v6-source.js';
import { CYMJ, spread } from './inputs.js';

const lats = spread(300, CYMJ.lat - 1.5, CYMJ.lat + 1.5, 21);
const lons = spread(300, CYMJ.lon - 2, CYMJ.lon + 2, 22);

// The debrief keeps its projection state in globals; the prelude stands in for them.
const debrief = loadV6(['projectAll', 'kLocalToLatLon', 'kLatLonToLocal', 'lonLatToTile', 'tileBounds', 'pickTileZoom'], {
  marker: 'const KML_FT_PER_M=3.28084',
  prelude: `
    const KML_FT_PER_M=3.28084;
    function rad2deg(r){return r*180/Math.PI}
    let tracks={}, kmlRef=null, kmlStart=0, kmlEnd=0, kmlT=0, kmlPan={x:0,y:0}, kmlZoom=1;
    const el=()=>({value:0});
    function setTracks(t){tracks=t} function getRef(){return kmlRef} function setZoom(z){kmlZoom=z}`,
  expose: ['setTracks', 'getRef', 'setZoom'],
});
const vnc = loadV6(['mercatorY', 'invMercatorY']);
const traffic = loadV6(['lonLatToPixel'], { page: 'traffic' });

/** Runs V6's projectAll on one track and returns its reference and projected points. */
function v6Project(raw) {
  const tr = { id: 1, raw: raw.map((p, i) => ({ ...p, altm: 1000, t: i })), pts: [] };
  debrief.setTracks({ 1: tr });
  debrief.projectAll();
  return { ref: debrief.getRef(), pts: tr.pts };
}

test('makeLocalRef and latLonToLocalFt give V6 projectAll\'s reference and points exactly', () => {
  const raw = lats.map((lat, i) => ({ lat, lon: lons[i] }));
  const { ref, pts } = v6Project(raw);
  const core = geo.makeLocalRef(raw[0].lat, raw[0].lon);
  assert.deepEqual(core, ref);
  raw.forEach((p, i) => {
    const xy = geo.latLonToLocalFt(core, p.lat, p.lon);
    assert.equal(xy.x, pts[i].x);
    assert.equal(xy.y, pts[i].y);
  });
});

test('latLonToLocalFt and localFtToLatLon are kLatLonToLocal and kLocalToLatLon', () => {
  v6Project([{ lat: CYMJ.lat, lon: CYMJ.lon }, { lat: CYMJ.lat + 0.1, lon: CYMJ.lon }]);
  const ref = geo.makeLocalRef(CYMJ.lat, CYMJ.lon);
  lats.forEach((lat, i) => {
    assert.deepEqual(geo.latLonToLocalFt(ref, lat, lons[i]), debrief.kLatLonToLocal(lat, lons[i]));
    const x = (lons[i] - CYMJ.lon) * 250000, y = (lat - CYMJ.lat) * 360000;
    assert.deepEqual(geo.localFtToLatLon(ref, x, y), debrief.kLocalToLatLon(x, y));
  });
});

test('tiles match V6 lonLatToTile and tileBounds', () => {
  for (let z = 1; z <= 19; z++) {
    lats.slice(0, 20).forEach((lat, i) => {
      const t = geo.lonLatToTile(lons[i], lat, z);
      assert.deepEqual(t, debrief.lonLatToTile(lons[i], lat, z));
      assert.deepEqual(geo.tileBounds(t.x, t.y, z), debrief.tileBounds(t.x, t.y, z));
    });
  }
});

test('pickTileZoom matches V6 at every zoom the viewer allows', () => {
  for (const zoom of [0.0005, 0.001, 0.01, 0.05, 0.1, 0.5, 1, 5, 50, 1000, ...spread(100, 0.0001, 10, 23)]) {
    debrief.setZoom(zoom);
    for (const lat of [0, 45, CYMJ.lat, 70, -33, 85, 89.9]) assert.equal(geo.pickTileZoom(lat, zoom), debrief.pickTileZoom(lat));
  }
});

test('mercatorY and invMercatorY match V6', () => {
  for (const lat of [0, 1, -1, 45, 60, 80, -80, ...lats]) {
    assert.equal(geo.mercatorY(lat), vnc.mercatorY(lat));
    assert.equal(geo.invMercatorY(geo.mercatorY(lat)), vnc.invMercatorY(vnc.mercatorY(lat)));
  }
});

test('lonLatToWorldPixel matches the Traffic page lonLatToPixel', () => {
  for (let z = 0; z <= 19; z++) {
    lats.slice(0, 20).forEach((lat, i) => assert.deepEqual(geo.lonLatToWorldPixel(lons[i], lat, z), traffic.lonLatToPixel(lons[i], lat, z)));
  }
});

test('distance is Turn Sim dist', () => {
  const v6 = loadV6(['dist']);
  const xs = spread(200, -30000, 30000, 24);
  for (let i = 0; i < 100; i++) {
    const a = { x: xs[i], y: xs[199 - i] }, b = { x: xs[100 + i], y: xs[99 - i] };
    assert.equal(geo.distance(a, b), v6.dist(a, b));
  }
});
