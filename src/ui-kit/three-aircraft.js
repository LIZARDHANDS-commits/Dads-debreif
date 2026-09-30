// The shared three.js pieces for every 3D aircraft view (D138): one T-6-like
// aircraft, the lighting and sky, and a camera that reproduces the Debrief's
// projectPoint (src/modules/debrief/view3d/scene.js) exactly. Spec:
// specs/SPEC-ui-kit.md, "3D aircraft (three.js, D138)".
//
// three is NEVER imported statically here (or anywhere on the home screen's path):
// a 3D view calls `await loadThree()` when it opens, and hands the result to the
// functions below as their first argument. That keeps three out of the home bundle
// and lets the tests run these functions in Node without WebGL.
//
// World frame, as in the debrief: X east, Y north, Z up. A point's Z is its
// altitude in feet times the altitude-scale setting (`altToZ`); the aircraft
// model itself is not scaled by it.

/** Distance from the camera to its target, in feet. The camera is orthographic, so it only has to be far. */
export const CAMERA_DISTANCE_FT = 500_000;

const HORIZON = '#1a3a55';
const rad = (d) => (d * Math.PI) / 180;

let threePromise = null;

/** The three module, from a dynamic import, fetched once and cached. Call it when a 3D view opens. */
export function loadThree() {
  threePromise ??= import('three').catch((err) => {
    threePromise = null; // a failed load (offline) can be retried
    throw err;
  });
  return threePromise;
}

/** Height of a point in three.js world units: altitude in feet times the altitude-scale setting. */
export function altToZ(altFt, altScale) {
  return (altFt || 0) * altScale;
}

// The parts of a T-6-like aircraft: nose +X, left +Y, up +Z.
function buildGeometry(THREE) {
  // Fuselage: lathe profile (radius, axial) around Y, then turned so the axis is +X.
  const profile = [
    [0.004, -0.78], [0.02, -0.72], [0.034, -0.55], [0.05, -0.3], [0.072, -0.05],
    [0.085, 0.15], [0.088, 0.3], [0.085, 0.42], [0.07, 0.5], [0.06, 0.52], [0.001, 0.52],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const fuselage = new THREE.LatheGeometry(profile, 20);
  fuselage.rotateZ(-Math.PI / 2);

  const flat = (pts, depth, z0) => {
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    g.translate(0, 0, z0);
    return g;
  };
  // Straight, tapered, low wing (plan view: x forward, y left).
  const wing = flat([[0.16, 0.66], [0.33, 0.07], [0.33, -0.07], [0.16, -0.66], [0.06, -0.66], [0.03, -0.07], [0.03, 0.07], [0.06, 0.66]], 0.022, -0.05);
  // Horizontal stabiliser.
  const stab = flat([[-0.6, 0.3], [-0.5, 0.05], [-0.5, -0.05], [-0.6, -0.3], [-0.7, -0.3], [-0.72, -0.03], [-0.72, 0.03], [-0.7, 0.3]], 0.014, 0.0);
  // Vertical fin: shape in (x, up), extruded across.
  const finShape = new THREE.Shape([[-0.42, 0.03], [-0.6, 0.24], [-0.72, 0.24], [-0.72, 0.03]].map(([x, z]) => new THREE.Vector2(x, z)));
  const fin = new THREE.ExtrudeGeometry(finShape, { depth: 0.014, bevelEnabled: false });
  fin.translate(0, 0, -0.007);
  fin.rotateX(Math.PI / 2);

  const canopy = new THREE.SphereGeometry(1, 16, 10);
  canopy.scale(0.17, 0.062, 0.062);
  canopy.translate(0.17, 0, 0.075);

  const spinner = new THREE.ConeGeometry(0.045, 0.14, 14);
  spinner.rotateZ(-Math.PI / 2);
  spinner.translate(0.59, 0, 0);

  const disc = new THREE.CircleGeometry(0.26, 32);
  disc.rotateY(Math.PI / 2);
  disc.translate(0.53, 0, 0);

  return { fuselage, wing, stab, fin, canopy, spinner, disc };
}

/**
 * One T-6-like aircraft as a THREE.Group: nose +X, left +Y, up +Z, about 1.44
 * long (tail to spinner) and 1.32 across the wings, centred near the origin. Set
 * `scale` to the plane size in feet, `position` to the world point, and
 * `rotation` (order 'ZYX') to the attitude.
 *
 * `color` is the plain ship colour (no paint scheme yet); wings and stabiliser
 * are drawn a shade darker and the fin a shade lighter. `outline`, if given, is
 * a colour for edge lines around the wings, stabiliser and fin so the aircraft
 * stays readable against any background. Each call builds its own geometry and
 * materials; free them with `disposeAircraftMesh`.
 */
export function createAircraftMesh(THREE, { color, outline = null }) {
  const geo = buildGeometry(THREE);
  const base = new THREE.Color(color);
  const mat = (c, extra) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.55, metalness: 0.1, ...extra });
  const group = new THREE.Group();
  const add = (geometry, material) => group.add(new THREE.Mesh(geometry, material));
  add(geo.fuselage, mat(base));
  add(geo.wing, mat(base.clone().multiplyScalar(0.82)));
  add(geo.stab, mat(base.clone().multiplyScalar(0.82)));
  add(geo.fin, mat(base.clone().lerp(new THREE.Color('#ffffff'), 0.15)));
  add(geo.canopy, mat('#8fc4ff', { transparent: true, opacity: 0.6, roughness: 0.1, metalness: 0.4 }));
  add(geo.spinner, mat('#20242a', { roughness: 0.4 }));
  add(geo.disc, new THREE.MeshBasicMaterial({ color: '#dcebff', transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
  if (outline) {
    const edge = new THREE.LineBasicMaterial({ color: outline });
    for (const part of [geo.wing, geo.stab, geo.fin]) {
      group.add(new THREE.LineSegments(new THREE.EdgesGeometry(part, 30), edge));
    }
  }
  return group;
}

/** Frees the geometry and materials of an aircraft made by `createAircraftMesh` (and removes it from its parent). */
export function disposeAircraftMesh(mesh) {
  mesh.removeFromParent();
  const materials = new Set();
  mesh.traverse((o) => {
    o.geometry?.dispose();
    for (const m of [].concat(o.material ?? [])) materials.add(m);
  });
  for (const m of materials) m.dispose();
}

/**
 * Sets an OrthographicCamera so a world point lands on the same CSS-pixel screen
 * position as scene.js `projectPoint(p, ctr, camera, size, pxRatio)`. The
 * arguments are named for it: `ctr` is { x, y, z } (z in feet, as formationCenter
 * gives it) and is the point the camera looks at, `cam` is { yawDeg, pitchDeg,
 * zoom, altScale } (projectPoint's `camera`), `size` is { width, height } of the
 * canvas, and `pxRatio` is 1 when `size` is in CSS pixels. The point to project
 * is { x, y, z: altToZ(altFt, cam.altScale) }.
 *
 * The camera is CAMERA_DISTANCE_FT away, yawed about the vertical and tilted by
 * the pitch, with near and far planes wide enough for the whole scene. It also
 * agrees with projectPoint on which of two points is nearer the viewer. Call it
 * whenever the view or the canvas size changes. Pinned by
 * tests/unit/ui-kit/three-aircraft.test.js; do not change without that test.
 */
export function matchProjection(THREE, camera, ctr, cam, size, pxRatio = 1) {
  const yaw = rad(cam.yawDeg);
  const pitch = rad(cam.pitchDeg);
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const D = CAMERA_DISTANCE_FT;
  const forward = new THREE.Vector3(sy, cy, 0); // the ground direction that points up the screen
  const up = new THREE.Vector3(0, 0, 1);
  const target = new THREE.Vector3(ctr.x, ctr.y, altToZ(ctr.z, cam.altScale));
  camera.up.copy(forward).multiplyScalar(cp).addScaledVector(up, sp);
  camera.position.copy(target).addScaledVector(forward, -sp * D).addScaledVector(up, cp * D);
  const pxPerFt = (cam.zoom / 1000) * pxRatio;
  camera.left = -size.width / 2 / pxPerFt;
  camera.right = size.width / 2 / pxPerFt;
  camera.top = size.height / 2 / pxPerFt;
  camera.bottom = -size.height / 2 / pxPerFt;
  camera.near = D - 250_000;
  camera.far = D + 250_000;
  camera.updateProjectionMatrix();
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  return camera;
}

/** Screen position { x, y } in pixels (y down) of a three.js world point { x, y, z }, for placing 2D labels over the canvas. */
export function worldToScreen(THREE, camera, point, width, height) {
  const v = new THREE.Vector3(point.x, point.y, point.z).project(camera);
  return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height };
}

/** The Debrief's lighting: a sky-and-ground hemisphere light plus a warm sun from the south-west. Returns { hemisphere, sun }. */
export function addLights(THREE, scene) {
  const hemisphere = new THREE.HemisphereLight('#b8d0ff', '#12301a', 0.8);
  const sun = new THREE.DirectionalLight('#fff3dd', 3);
  sun.position.set(-0.5, -0.7, 1).normalize().multiplyScalar(1000);
  scene.add(hemisphere, sun, sun.target);
  return { hemisphere, sun };
}

/**
 * A dark-blue sky gradient as the scene background, and fog in the horizon
 * colour beyond the camera's distance so a big ground plane fades out. Not tied
 * to the debrief; any 3D view can use it. `document` is only for tests.
 * Returns { texture, horizon }; dispose the texture with the view.
 */
export function addSky(THREE, scene, { horizon = HORIZON, document: doc = globalThis.document } = {}) {
  const canvas = doc.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#040a12');
  grad.addColorStop(0.35, '#0b1c2e');
  grad.addColorStop(0.7, horizon);
  grad.addColorStop(1, horizon);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  scene.background = texture;
  scene.fog = new THREE.Fog(horizon, CAMERA_DISTANCE_FT + 5_000, CAMERA_DISTANCE_FT + 70_000);
  return { texture, horizon };
}
