// The shared three.js aircraft (specs/SPEC-ui-kit.md, "3D aircraft (three.js, D138)").
// three runs in Node without WebGL, so the mesh and the camera maths are pinned here.
// scene.js projectPoint is the reference and is untouched: the three.js camera must
// give the same screen position for the same view (the flight-math guard).
import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPoint, t6Points } from '../../../src/modules/debrief/view3d/scene.js';
import {
  loadThree, createAircraftMesh, disposeAircraftMesh, matchProjection, worldToScreen, altToZ, addLights, addSky, CAMERA_DISTANCE_FT,
} from '../../../src/ui-kit/three-aircraft.js';

const THREE = await loadThree();

const VIEWS = [
  { yawDeg: -35, pitchDeg: 52, zoom: 70, altScale: 2 }, // V6's first open
  { yawDeg: 0, pitchDeg: 0, zoom: 30, altScale: 1 }, // straight down (in projectPoint pitch 0 looks straight down)
  { yawDeg: 0, pitchDeg: 90, zoom: 120, altScale: 3 }, // level, looking north (pitch 90 is level)
  { yawDeg: 181, pitchDeg: 40, zoom: 80, altScale: 2 }, // yaw outside +-180
  { yawDeg: -270, pitchDeg: 60, zoom: 40, altScale: 4 },
  { yawDeg: 137, pitchDeg: 15, zoom: 10, altScale: 1 },
  { yawDeg: -180, pitchDeg: 75, zoom: 300, altScale: 5 },
  { yawDeg: 91.5, pitchDeg: 33.3, zoom: 55, altScale: 0.5 },
];
const CENTRES = [{ x: 0, y: 0, z: 0 }, { x: 12345, y: -8765, z: 4200 }, { x: -50000, y: 30000, z: 15000 }];
const SIZES = [{ width: 800, height: 600 }, { width: 320, height: 640 }, { width: 1921, height: 977 }];

// A deterministic spread of world points (feet; altitude in feet), near and far from the centre.
function points(ctr) {
  const out = [];
  let s = 12345;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
  for (let i = 0; i < 40; i++) {
    out.push({ x: ctr.x + rnd() * 20000, y: ctr.y + rnd() * 20000, altFt: Math.max(0, ctr.z + rnd() * 6000) });
  }
  out.push({ x: ctr.x, y: ctr.y, altFt: ctr.z }, { x: ctr.x + 1, y: ctr.y, altFt: 0 });
  return out;
}

// NDC depth of a world point: orthographic, so linear in distance from the camera. With
// distance = D + projectPoint depth (depth grows away from the viewer, 0 at the target),
// ndc.z = 2 (distance - near) / (far - near) - 1, and anything outside -1..1 is clipped.
const ndcZ = (camera, pt) => new THREE.Vector3(pt.x, pt.y, pt.z).project(camera).z;
const expectedNdcZ = (camera, depth) => (2 * (CAMERA_DISTANCE_FT + depth - camera.near)) / (camera.far - camera.near) - 1;

const threePoint = (p, cam) => ({ x: p.x, y: p.y, z: altToZ(p.altFt, cam.altScale) });

test('matchProjection: the three.js camera puts every point where scene.js projectPoint does (1e-6 px)', () => {
  let checked = 0;
  for (const cam of VIEWS) {
    for (const ctr of CENTRES) {
      for (const size of SIZES) {
        const camera = new THREE.OrthographicCamera();
        matchProjection(THREE, camera, ctr, cam, size);
        for (const p of points(ctr)) {
          const want = projectPoint(p, ctr, cam, size);
          const got = worldToScreen(THREE, camera, threePoint(p, cam), size.width, size.height);
          const where = JSON.stringify({ cam, ctr, size, p });
          assert.ok(Math.abs(got.x - want.x) < 1e-6, `x ${got.x} vs ${want.x} for ${where}`);
          assert.ok(Math.abs(got.y - want.y) < 1e-6, `y ${got.y} vs ${want.y} for ${where}`);
          const z = ndcZ(camera, threePoint(p, cam));
          assert.ok(Math.abs(z) <= 1, `clipped (ndc z ${z}) for ${where}`);
          assert.ok(Math.abs(z - expectedNdcZ(camera, want.depth)) < 1e-9, `depth ${z} vs ${expectedNdcZ(camera, want.depth)} for ${where}`);
          checked++;
        }
      }
    }
  }
  assert.ok(checked > 2000);
});

// The Debrief's limits: altitude scale up to 10 (layout.js), pitch 0 to 90, ground out to
// GROUND_EXTENT_FT (70,000 ft) each way from the centre, ground at sea level under a
// formation high up. None of it may fall outside the near and far planes.
test('matchProjection: extreme views keep the ground, the grid corners and the aircraft inside the depth range', () => {
  const EXTENT = 70_000;
  const size = { width: 900, height: 700 };
  for (const altScale of [1, 5, 10]) {
    for (const pitchDeg of [0, 5, 45, 80, 90]) {
      for (const yawDeg of [-180, -35, 90, 181]) {
        for (const ctr of [{ x: 0, y: 0, z: 0 }, { x: 20000, y: -30000, z: 25_000 }, { x: 0, y: 0, z: 31_000 }, { x: -9e4, y: 9e4, z: 45_000 }]) {
          const cam = { yawDeg, pitchDeg, zoom: 10, altScale };
          const camera = new THREE.OrthographicCamera();
          matchProjection(THREE, camera, ctr, cam, size);
          const pts = [];
          for (const sx of [-1, 0, 1]) for (const sy of [-1, 0, 1]) {
            pts.push({ x: ctr.x + sx * EXTENT, y: ctr.y + sy * EXTENT, altFt: 0 }); // the ground
            pts.push({ x: ctr.x + sx * EXTENT, y: ctr.y + sy * EXTENT, altFt: ctr.z + 3000 }); // aircraft over it
          }
          for (const p of pts) {
            const z = ndcZ(camera, threePoint(p, cam));
            assert.ok(Math.abs(z) <= 1, `clipped (ndc z ${z}) for ${JSON.stringify({ cam, ctr, p })}`);
            assert.ok(Math.abs(z - expectedNdcZ(camera, projectPoint(p, ctr, cam, size).depth)) < 1e-9);
          }
        }
      }
    }
  }
});

test('matchProjection: depth precision stays well under a foot across the whole range', () => {
  const camera = new THREE.OrthographicCamera();
  matchProjection(THREE, camera, { x: 0, y: 0, z: 0 }, VIEWS[0], SIZES[0]);
  assert.ok((camera.far - camera.near) / 2 ** 24 < 0.2, 'a 24-bit depth buffer resolves 0.2 ft or better');
});

test('matchProjection: pxRatio scales the zoom as projectPoint does, and a camera can be re-matched', () => {
  const cam = VIEWS[0];
  const ctr = CENTRES[1];
  const size = { width: 1600, height: 1200 };
  const camera = new THREE.OrthographicCamera();
  matchProjection(THREE, camera, ctr, VIEWS[3], SIZES[0]); // a different view first
  matchProjection(THREE, camera, ctr, cam, size, 2);
  for (const p of points(ctr)) {
    const want = projectPoint(p, ctr, cam, size, 2);
    const got = worldToScreen(THREE, camera, threePoint(p, cam), size.width, size.height);
    assert.ok(Math.abs(got.x - want.x) < 1e-6 && Math.abs(got.y - want.y) < 1e-6);
  }
});

test('matchProjection: nearer to the viewer means a smaller projectPoint depth and a nearer camera distance', () => {
  const cam = VIEWS[0];
  const ctr = CENTRES[0];
  const camera = new THREE.OrthographicCamera();
  matchProjection(THREE, camera, ctr, cam, SIZES[0]);
  const hi = { x: 0, y: 0, altFt: 5000 };
  const lo = { x: 0, y: 0, altFt: 0 };
  const dist = (p) => camera.position.distanceTo(new THREE.Vector3(p.x, p.y, altToZ(p.altFt, cam.altScale)));
  assert.ok(projectPoint(hi, ctr, cam, SIZES[0]).depth < projectPoint(lo, ctr, cam, SIZES[0]).depth);
  assert.ok(dist(hi) < dist(lo));
  assert.ok(Math.abs(camera.position.length() - CAMERA_DISTANCE_FT) < 1e-6);
  assert.ok(camera.near > 0 && camera.near < CAMERA_DISTANCE_FT && camera.far > CAMERA_DISTANCE_FT);
  assert.ok(camera.near < CAMERA_DISTANCE_FT - 500_000 && camera.far > CAMERA_DISTANCE_FT + 500_000, 'room for the tallest scene');
});

test('altToZ scales altitude in feet by the altitude-scale setting', () => {
  assert.equal(altToZ(1000, 2), 2000);
  assert.equal(altToZ(0, 5), 0);
  assert.equal(altToZ(undefined, 3), 0);
});

function sizeOf(mesh) {
  mesh.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(mesh);
  return { box, size: box.getSize(new THREE.Vector3()) };
}

test('createAircraftMesh: nose +X, wingspan along Y, about unit length, up +Z', () => {
  const m = createAircraftMesh(THREE, { color: '#ff5533' });
  assert.ok(m instanceof THREE.Group);
  const { box, size } = sizeOf(m);
  assert.ok(Math.abs(size.x - 1.44) < 0.05, `length ${size.x}`); // tail -0.78 to spinner tip +0.66 (the spike's model, scaled by plane size)
  assert.ok(Math.abs(size.y - 1.32) < 0.05, `span ${size.y}`);
  assert.ok(size.z < 0.6 && size.y > size.z * 2, `height ${size.z}`); // includes the 0.26-radius prop disc
  assert.ok(box.max.x > 0.5 && box.min.x < -0.6, 'nose at +X, tail at -X');
  assert.ok(Math.abs(box.max.y + box.min.y) < 0.01, 'symmetric left and right');
  const fin = sizeOf(m.children[3]).box; // the fin stands up from the fuselage, so up is +Z
  assert.ok(fin.min.z > -0.01 && fin.max.z > 0.2 && fin.max.x < -0.4);
});

test('createAircraftMesh: ship colour on the body, darker on the wings, own materials per aircraft', () => {
  const a = createAircraftMesh(THREE, { color: '#ff0000' });
  const b = createAircraftMesh(THREE, { color: '#0000ff' });
  const body = a.children[0];
  assert.equal(body.material.color.getHexString(), 'ff0000');
  const wing = a.children[1];
  assert.ok(wing.material.color.r < body.material.color.r && wing.material.color.r > 0);
  assert.equal(b.children[0].material.color.getHexString(), '0000ff');
  assert.notEqual(a.children[0].material, b.children[0].material);
});

test('disposeAircraftMesh frees the geometry and materials of one aircraft', () => {
  const m = createAircraftMesh(THREE, { color: '#ffffff', outline: '#000000' });
  let freed = 0;
  m.traverse((o) => {
    o.geometry?.addEventListener('dispose', () => freed++);
    const mats = [].concat(o.material ?? []);
    for (const mat of mats) mat.addEventListener('dispose', () => freed++);
  });
  disposeAircraftMesh(m);
  assert.ok(freed >= 14);
});

test('createAircraftMesh: attitude turns the whole body (heading about Z, 0 = east)', () => {
  const m = createAircraftMesh(THREE, { color: '#ffffff' });
  m.rotation.order = 'ZYX';
  m.rotation.set(0, 0, Math.PI / 2);
  m.updateMatrixWorld(true);
  const nose = new THREE.Vector3(1, 0, 0).applyMatrix4(m.matrixWorld);
  assert.ok(Math.abs(nose.y - 1) < 1e-9 && Math.abs(nose.x) < 1e-9);
});

test('createAircraftMesh: rotation.set(-bank, -pitch, hdg) points the nose and left wing where scene.js t6Points does', () => {
  const m = createAircraftMesh(THREE, { color: '#ffffff' });
  m.rotation.order = 'ZYX';
  const unit = (v) => new THREE.Vector3(v.x, v.y, v.altFt).normalize();
  const origin = { x: 0, y: 0, altFt: 0 };
  let n = 0;
  for (const hdg of [0, 0.7, Math.PI / 2, 2.5, -1.9, Math.PI])
    for (const bank of [0, 0.5, -0.9, 1.4])
      for (const pitch of [0, 0.3, -0.6, 1.2]) {
        m.rotation.set(-bank, -pitch, hdg);
        m.updateMatrixWorld(true);
        const pts = t6Points(origin, hdg, bank, pitch, 1);
        const nose = new THREE.Vector3(1, 0, 0).transformDirection(m.matrixWorld);
        const left = new THREE.Vector3(0, 1, 0).transformDirection(m.matrixWorld);
        const wantNose = unit(pts.spinner);
        const wantLeft = unit({ x: pts.wingL.x - pts.wingR.x, y: pts.wingL.y - pts.wingR.y, altFt: pts.wingL.altFt - pts.wingR.altFt });
        const where = JSON.stringify({ hdg, bank, pitch });
        assert.ok(nose.distanceTo(wantNose) < 1e-9, `nose ${nose.toArray()} vs ${wantNose.toArray()} for ${where}`);
        assert.ok(left.distanceTo(wantLeft) < 1e-9, `left ${left.toArray()} vs ${wantLeft.toArray()} for ${where}`);
        n++;
      }
  assert.equal(n, 96);
});

test('createAircraftMesh: no aircraft material takes fog (fog is for the ground only)', () => {
  const m = createAircraftMesh(THREE, { color: '#ffffff', outline: '#000000' });
  let count = 0;
  m.traverse((o) => { if (o.material) { assert.equal(o.material.fog, false); count++; } });
  assert.ok(count >= 10);
});

test('createAircraftMesh: an outline colour adds edge lines and leaves the solid parts as they were', () => {
  const plain = createAircraftMesh(THREE, { color: '#ffffff' });
  const outlined = createAircraftMesh(THREE, { color: '#ffffff', outline: '#000000' });
  const lines = (g) => g.children.filter((c) => c.isLineSegments);
  assert.equal(lines(plain).length, 0);
  assert.ok(lines(outlined).length >= 3);
  assert.equal(lines(outlined)[0].material.color.getHexString(), '000000');
  assert.equal(outlined.children.filter((c) => c.isMesh).length, plain.children.filter((c) => c.isMesh).length);
});

test('addLights puts a hemisphere light and a sun in the scene', () => {
  const scene = new THREE.Scene();
  const { hemisphere, sun } = addLights(THREE, scene);
  assert.ok(scene.children.includes(hemisphere) && scene.children.includes(sun));
  assert.ok(sun.position.z > 0, 'the sun is above');
  assert.ok(scene.children.includes(sun.target));
});

test('addSky sets a gradient background and horizon fog beyond the camera distance', () => {
  const stops = [];
  const gradient = { addColorStop: (offset, color) => stops.push([offset, color]) };
  const fakeDocument = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ createLinearGradient: () => gradient, fillRect() {}, set fillStyle(v) {} }),
    }),
  };
  const scene = new THREE.Scene();
  const sky = addSky(THREE, scene, { document: fakeDocument });
  const { texture } = sky;
  assert.equal(scene.background, texture);
  assert.equal(stops.length, 4);
  assert.ok(scene.fog.near > CAMERA_DISTANCE_FT && scene.fog.far > scene.fog.near);
  let freed = 0;
  texture.addEventListener('dispose', () => freed++);
  sky.dispose();
  assert.equal(freed, 1);
  assert.equal(scene.background, null);
  assert.equal(scene.fog, null);
});

test('loadThree: the same module both times, and it is the real three', async () => {
  const a = loadThree();
  const b = loadThree();
  assert.equal(a, b, 'one cached promise');
  assert.equal(await a, await b);
  assert.equal(await a, THREE);
  assert.equal(typeof THREE.OrthographicCamera, 'function');
});
