// The Traffic Sim's 3D view (specs/SPEC-traffic.md: 3D view; SPEC-ui-kit "3D aircraft (three.js, D138)" and
// "2D/3D switch (D141)"): the same run as the 2D map, drawn with three.js through the ui-kit's shared pieces
// (three-aircraft.js, ct156-model.js). It reads the engine's state (where each aircraft is, its heading, height
// and speed) and draws it: the routes as lines at their heights, the shared T-6 for the CT-156 and CT-157 and a
// stand-in shape for the other types, banking with their turns, and a caution ring round each aircraft. It works
// out no flight math of its own: heading, bank and pitch are only read off how the state changes.
//
// three.js is loaded (a dynamic import, the ui-kit's loadThree) only when 3D is switched on, and everything it
// builds is freed when the person switches back to 2D and when the module closes. The renderer's canvas is made
// new each time 3D opens, because a canvas whose WebGL context has been let go can't be given another.
//
// Three parts:
//   the pure functions   heading, bank, pitch, the box round the routes, the camera (tested in Node)
//   createSceneKit       the three.js objects for the routes, aircraft, rings and ground, with their freeing
//   createView3d         the canvases, the renderer, the camera's hands (drag, wheel, keys) and the frame
import {
  loadThree, webglSupported, matchProjection, worldToScreen, altToZ, addLights, addSky, createStandInMesh, createAircraftMesh, disposeAircraftMesh,
} from '../../ui-kit/three-aircraft.js';
import { createCt156Model, CT156_UNIT_LENGTH, PAINT_DEFAULT } from '../../ui-kit/ct156-model.js';
import { KT_TO_FTPS, G_FTPS2 } from '../../core/units.js';
import { paletteFrom, conflictLevels, isFlying, aircraftColor, heightSpeedText, LEVEL_MARKS } from './map2d.js';

/** Every axis is drawn at the same scale: a foot of height is a foot of ground (SPEC-traffic: the 3D view). */
export const ALT_SCALE = 1;

/** Camera limits. pitch is degrees from straight down (0 looks down, 90 is level); zoom is pixels to 1,000 ft. */
export const CAMERA_LIMITS = Object.freeze({ pitch: [0, 85], zoom: [0.3, 400] });

/** The pitch of each camera button: Fit, High look-down and Low chase. */
export const PRESET_PITCH_DEG = Object.freeze({ fit: 45, high: 20, low: 72 });
/** How much ground the chase camera shows across the screen, in feet. */
const CHASE_SPAN_FT = 3000;
const CHASE_LERP = 0.15; // how fast the chase camera swings behind a turning aircraft, a share of the gap each frame

/** Real length of a T-6 in feet. A zoomed-out aircraft is drawn bigger, so it can still be seen. */
export const T6_LENGTH_FT = 33.4;
/** The length an aircraft is drawn at least, on screen, in pixels. */
export const MIN_PLANE_PX = 44;

const ORBIT_DEG_PER_PX = Object.freeze({ yaw: 0.4, pitch: 0.25 });
const WHEEL_ZOOM = Object.freeze({ in: 1.12, out: 0.89 });

/** The bank the picture never goes past, and the pitch it never goes past, in degrees. */
const MAX_BANK_DEG = 75;
const MAX_PITCH_DEG = 25;
/** How long a stretch of the run the bank and pitch are read from, in sim seconds, and the shortest to trust. */
const ATTITUDE_WINDOW_S = 1;
const ATTITUDE_MIN_S = 0.3;
/** A jump in time longer than this (a reset, a step) starts the reading again. */
const ATTITUDE_JUMP_S = 5;

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const clamp = (v, /** @type {readonly number[]} */ range) => Math.max(range[0], Math.min(range[1], v));
const wrapDeg = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const finite = (v, fallback = 0) => (Number.isFinite(v) ? v : fallback);

// ---------------------------------------------------------------------------
// Heading, bank and pitch (pure)

/** The model's heading for a compass heading: (90 - compass) degrees, in radians (0 is east, counter-clockwise). */
export const hdgRadOf = (compassDeg) => (Number.isFinite(compassDeg) ? rad(90 - compassDeg) : 0);

/**
 * How fast the aircraft is turning, in radians a second, counter-clockwise (a left turn) positive, from two
 * compass headings `dt` seconds apart (across north too). No time gives no rate; time going back (a rewind)
 * turns the sign round with it, so a turn still looks like the same turn.
 */
export function turnRateRadPerS(fromCompassDeg, toCompassDeg, dt) {
  if (!dt) return 0;
  return -rad(wrapDeg(toCompassDeg - fromCompassDeg)) / dt;
}

/** The bank a steady turn needs, atan(v * rate / g), in radians: positive leans left, and never past 75 degrees. */
export function bankRadFromTurn(kt, omegaRadPerS) {
  const bank = Math.atan((finite(kt) * KT_TO_FTPS * omegaRadPerS) / G_FTPS2);
  return Math.max(-rad(MAX_BANK_DEG), Math.min(rad(MAX_BANK_DEG), bank));
}

/**
 * Reads each aircraft's bank and pitch off how its state changes: the heading rate over the last second or so
 * of sim time gives the bank (a rounded turn is a row of short legs, so a single step would flicker), and the
 * change of height gives the pitch. Nothing here feeds back into the engine.
 * update(id, { t, headingDeg, kt, altFt }) returns { bankRad, pitchRad }, level until it has seen a moment of the flight.
 */
export function createAttitude() {
  const seen = new Map(); // id -> { samples: [{ t, headingDeg, altFt }], last: { bankRad, pitchRad } }
  return {
    update(id, { t, headingDeg, kt, altFt }) {
      let entry = seen.get(id);
      if (!entry) seen.set(id, (entry = { samples: [], last: { bankRad: 0, pitchRad: 0 } }));
      const { samples } = entry;
      const newest = samples.at(-1);
      if (newest && newest.t === t) return entry.last; // drawn again with nothing moved
      if (newest && Math.abs(t - newest.t) > ATTITUDE_JUMP_S) {
        samples.length = 0;
        entry.last = { bankRad: 0, pitchRad: 0 };
      }
      samples.push({ t, headingDeg, altFt });
      // The reference is the newest sample at least a window away (or the oldest, while there is less than that).
      while (samples.length > 2 && Math.abs(t - samples[1].t) >= ATTITUDE_WINDOW_S) samples.shift();
      const ref = samples[0];
      const dt = t - ref.t;
      if (Math.abs(dt) < ATTITUDE_MIN_S) return entry.last;
      const omega = turnRateRadPerS(ref.headingDeg, headingDeg, dt);
      const climb = (finite(altFt) - finite(ref.altFt)) / dt;
      const groundSpeed = Math.max(finite(kt) * KT_TO_FTPS, 1);
      entry.last = {
        bankRad: bankRadFromTurn(kt, omega),
        pitchRad: Math.max(-rad(MAX_PITCH_DEG), Math.min(rad(MAX_PITCH_DEG), Math.atan(climb / groundSpeed))),
      };
      return entry.last;
    },
    forget: (id) => seen.delete(id),
    clear: () => seen.clear(),
  };
}

/**
 * Puts an aircraft's model where and how the state says: the position (height in true feet), the size, and the
 * attitude rotation.set(-bank, -pitch, heading) in order 'ZYX' (heading about up, then pitch, then bank; the model's
 * nose is +X and left is +Y). pose is { x, y, altFt, headingDeg (compass), bankRad (left positive), pitchRad (up positive) }.
 */
export function applyPose(mesh, pose, lengthFt) {
  mesh.position.set(pose.x, pose.y, altToZ(pose.altFt, ALT_SCALE));
  mesh.scale.setScalar(lengthFt / CT156_UNIT_LENGTH);
  mesh.rotation.order = 'ZYX';
  mesh.rotation.set(-pose.bankRad, -pose.pitchRad, hdgRadOf(pose.headingDeg));
}

/** Feet an aircraft is drawn at, at a zoom (pixels to 1,000 ft): its real length, or MIN_PLANE_PX if that is smaller on screen. */
export function planeLengthFt(zoom) {
  return Math.max(T6_LENGTH_FT, MIN_PLANE_PX / (zoom / 1000));
}

/** The CT-156 and CT-157 are the shared T-6; every other type is a stand-in shape until it has its own model. */
export const modelKindFor = (type) => (type === 'CT-156' || type === 'CT-157' ? 'ct156' : 'standin');

// ---------------------------------------------------------------------------
// The scene's box and the camera (pure)

/** The ground: the lowest height on any route that shows (the runway), or 0 with no route. */
export function groundFt(routes) {
  let low = Infinity;
  for (const route of routes) if (route.visible !== false) for (const p of route.path ?? []) if (finite(p.alt) < low) low = finite(p.alt);
  return low === Infinity ? 0 : low;
}

/** The box round every route that shows, heights too (or, with no route, every aircraft), or null with nothing. A plain loop, so a long list is fine. */
export function sceneBox(routes, aircraft = []) {
  const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
  const take = (list) => {
    for (const p of list) {
      const z = finite(p.alt);
      if (p.x < box.minX) box.minX = p.x;
      if (p.x > box.maxX) box.maxX = p.x;
      if (p.y < box.minY) box.minY = p.y;
      if (p.y > box.maxY) box.maxY = p.y;
      if (z < box.minZ) box.minZ = z;
      if (z > box.maxZ) box.maxZ = z;
    }
  };
  for (const route of routes) if (route.visible !== false) take(route.path ?? []);
  if (box.minX === Infinity) take(aircraft);
  return box.minX === Infinity ? null : box;
}

/**
 * The camera that shows `box` whole in a canvas of `size`, looking along `view` ({ yawDeg, pitchDeg }): its centre
 * (the middle of the box) and the zoom that takes all eight corners with a tenth to spare. Returns { center, cam }.
 * matchProjection's screen-right is (cos yaw, -sin yaw, 0) and screen-up is forward * cos(pitch) + up * sin(pitch),
 * with forward (sin yaw, cos yaw, 0), so the corners' spread on each is what has to fit.
 */
export function fitCamera(box, size, view) {
  const center = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2, z: (box.minZ + box.maxZ) / 2 };
  const yaw = rad(view.yawDeg);
  const pitch = rad(view.pitchDeg);
  const right = [Math.cos(yaw), -Math.sin(yaw), 0];
  const up = [Math.sin(yaw) * Math.cos(pitch), Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch)];
  let halfW = 0;
  let halfH = 0;
  for (const x of [box.minX, box.maxX]) {
    for (const y of [box.minY, box.maxY]) {
      for (const z of [box.minZ, box.maxZ]) {
        const d = [x - center.x, y - center.y, altToZ(z, ALT_SCALE) - altToZ(center.z, ALT_SCALE)];
        halfW = Math.max(halfW, Math.abs(d[0] * right[0] + d[1] * right[1] + d[2] * right[2]));
        halfH = Math.max(halfH, Math.abs(d[0] * up[0] + d[1] * up[1] + d[2] * up[2]));
      }
    }
  }
  const pxPerFt = 0.9 * Math.min((Math.max(size.width, 1) / 2) / Math.max(halfW, 1), (Math.max(size.height, 1) / 2) / Math.max(halfH, 1));
  return { center, cam: { yawDeg: view.yawDeg, pitchDeg: view.pitchDeg, zoom: clamp(pxPerFt * 1000, CAMERA_LIMITS.zoom), altScale: ALT_SCALE } };
}

/** The camera for Fit (north up, tilted 45 degrees) and High look-down (steeper), each framed on the routes; anything else is Fit. */
export function cameraFor(name, box, size) {
  const pitchDeg = PRESET_PITCH_DEG[name === 'high' || name === 'low' ? name : 'fit'];
  return fitCamera(box, size, { yawDeg: 0, pitchDeg });
}

/** Low chase: low behind an aircraft, looking the way it flies, centred on it. `ac` is { x, y, alt, headingDeg } (compass). */
export function chaseCamera(ac, size) {
  return {
    center: { x: ac.x, y: ac.y, z: finite(ac.alt) },
    // The camera looks along the world direction (sin yaw, cos yaw): a compass heading is exactly that yaw.
    cam: { yawDeg: wrapDeg(finite(ac.headingDeg)), pitchDeg: PRESET_PITCH_DEG.low, zoom: clamp((Math.max(size.width, 1) / CHASE_SPAN_FT) * 1000, CAMERA_LIMITS.zoom), altScale: ALT_SCALE },
  };
}

/** A camera change from a drag of (dx, dy) pixels. */
export function orbit(cam, dx, dy) {
  return {
    ...cam,
    yawDeg: wrapDeg(cam.yawDeg + dx * ORBIT_DEG_PER_PX.yaw),
    pitchDeg: clamp(cam.pitchDeg - dy * ORBIT_DEG_PER_PX.pitch, CAMERA_LIMITS.pitch),
  };
}

/** A camera change from one wheel notch: in when `deltaY` is negative. */
export function zoomBy(cam, deltaY) {
  return { ...cam, zoom: clamp(cam.zoom * (deltaY < 0 ? WHEEL_ZOOM.in : WHEEL_ZOOM.out), CAMERA_LIMITS.zoom) };
}

/** Turns the camera's yaw part-way to a target, the short way round. */
const swingTo = (from, to, share) => wrapDeg(from + wrapDeg(to - from) * share);

// ---------------------------------------------------------------------------
// Routes, in three.js

/** What a route's line looks like, so a changed route is found without comparing every point again. */
export function routeSignature(route) {
  const path = route.path ?? [];
  let sum = 0;
  path.forEach((p, i) => {
    sum += (i + 1) * (finite(p.x) * 1.3 + finite(p.y) * 1.7 + finite(p.alt) * 2.3);
  });
  return `${route.kind}|${route.color}|${path.length}|${sum.toFixed(3)}`;
}

// A pattern is a closed loop, entries and splits open lines. Entries are dashed and splits dotted, as on the 2D map.
const DASH_FT = Object.freeze({ entry: [500, 350], split: [120, 380] });

/** How many T-6s flying at once get the full Harvard model (55 draw calls each); later ones get the ui-kit's plain T-6 (about 10). */
export const MAX_FULL_T6 = 8;

const RING_SEGMENTS = 64;
const RING_COLORS = Object.freeze({ calm: '#9bb8c6', caution: '#f5c542', conflict: '#ff6b6b' });
const DROP_COLOR = '#6e8ea0';
const GRID_STEP_FT = 2000;
const GRID_CELLS = 100;

const numberOf = (id) => String(id).replace(/\D+/g, '') || String(id);

/**
 * The three.js objects for one scene: the routes (one line each), an aircraft each (made when it first flies), a
 * caution ring round each flying aircraft, a line dropping from each to the ground, and the ground grid. sync() makes
 * what is missing, moves what is there and frees what has gone; dispose() frees the lot. `root` is the group to add
 * to the scene. models: { ct156, t6plain, standin }, each (THREE, { color, number, paint }) returning a mesh, for tests.
 */
export function createSceneKit(THREE, { models = defaultModels() } = {}) {
  const root = new THREE.Group();
  const routeLines = new Map(); // route id -> { line, sig }
  const planes = new Map(); // aircraft id -> { mesh, kind, paint }
  const rings = new Map(); // aircraft id -> LineLoop
  const attitude = createAttitude();
  let disposed = false;

  // The ring is one circle shared by every ring, scaled to the caution distance; three colours shared too.
  const ringPoints = [];
  for (let i = 0; i < RING_SEGMENTS; i++) ringPoints.push(new THREE.Vector3(Math.cos((i / RING_SEGMENTS) * Math.PI * 2), Math.sin((i / RING_SEGMENTS) * Math.PI * 2), 0));
  const ringGeometry = new THREE.BufferGeometry().setFromPoints(ringPoints);
  const ringMaterials = Object.fromEntries(Object.entries(RING_COLORS).map(([level, color]) => [level, new THREE.LineBasicMaterial({ color, transparent: level === 'calm', opacity: level === 'calm' ? 0.45 : 1, fog: false })]));

  // One line-segment object for every drop line, its buffer grown when there are more aircraft than room.
  let dropCapacity = 48; // floats: 8 aircraft to start with
  const dropGeometry = new THREE.BufferGeometry();
  dropGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(dropCapacity), 3));
  dropGeometry.setDrawRange(0, 0);
  const dropMaterial = new THREE.LineBasicMaterial({ color: DROP_COLOR, transparent: true, opacity: 0.5, fog: false });
  const drops = new THREE.LineSegments(dropGeometry, dropMaterial);
  drops.frustumCulled = false;
  root.add(drops);
  let dropCount = 0;

  const grid = new THREE.GridHelper(GRID_STEP_FT * GRID_CELLS, GRID_CELLS, '#2c5a44', '#1c3a30');
  grid.rotation.x = Math.PI / 2; // GridHelper lies in X-Z; the ground here is X-Y
  grid.material.fog = false;
  root.add(grid);

  function syncRoutes(list) {
    const wanted = new Set();
    for (const route of list) {
      if (route.visible === false || !route.path || route.path.length < 2) continue;
      wanted.add(route.id);
      const sig = routeSignature(route);
      const have = routeLines.get(route.id);
      if (have && have.sig === sig) continue;
      if (have) freeLine(have.line);
      const positions = new Float32Array(route.path.length * 3);
      route.path.forEach((p, i) => positions.set([p.x, p.y, altToZ(p.alt, ALT_SCALE)], i * 3));
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const dash = DASH_FT[route.kind];
      const material = dash
        ? new THREE.LineDashedMaterial({ color: route.color, dashSize: dash[0], gapSize: dash[1], fog: false })
        : new THREE.LineBasicMaterial({ color: route.color, fog: false });
      const line = route.kind === 'pattern' ? new THREE.LineLoop(geometry, material) : new THREE.Line(geometry, material);
      if (dash) line.computeLineDistances();
      line.frustumCulled = false;
      root.add(line);
      routeLines.set(route.id, { line, sig });
    }
    for (const [id, { line }] of routeLines) {
      if (wanted.has(id)) continue;
      freeLine(line);
      routeLines.delete(id);
    }
  }

  function freeLine(line) {
    line.removeFromParent();
    line.geometry.dispose();
    line.material.dispose();
  }

  // `kind` is which builder made the mesh: 'ct156' (the full Harvard model), 't6plain' (the ui-kit's plain T-6) or 'standin'.
  function planeFor(ac, kind, paint) {
    const have = planes.get(ac.id);
    if (have && have.kind === kind && (kind !== 'ct156' || have.paint === paint)) return have.mesh;
    if (have) disposeAircraftMesh(have.mesh); // the T-6 in another paint or another detail: built again
    const options = { color: aircraftColor(ac), number: numberOf(ac.id), paint };
    const mesh = models[kind](THREE, options);
    mesh.rotation.order = 'ZYX';
    root.add(mesh);
    planes.set(ac.id, { mesh, kind, paint });
    return mesh;
  }

  function syncAircraft(scene, options) {
    const flying = scene.aircraft.filter(isFlying);
    const levels = conflictLevels(scene.conflicts ?? []);
    const lengthFt = planeLengthFt(options.zoom);
    const present = new Set();
    const wantRings = options.layerCautionRings !== false;
    if (flying.length * 6 > dropCapacity) {
      dropCapacity = Math.max(flying.length * 6, dropCapacity * 2, 48);
      dropGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(dropCapacity), 3));
    }
    const dropAt = dropGeometry.attributes.position;
    const floor = altToZ(options.groundFt ?? 0, ALT_SCALE);
    let n = 0;
    let fullLeft = MAX_FULL_T6; // the full model is some 55 draw calls; the first few T-6s flying get it, the rest the plain one
    for (const ac of flying) {
      present.add(ac.id);
      const kind = modelKindFor(ac.type) === 'ct156' ? (fullLeft-- > 0 ? 'ct156' : 't6plain') : 'standin';
      const mesh = planeFor(ac, kind, options.paint ?? PAINT_DEFAULT);
      mesh.visible = true;
      const { bankRad, pitchRad } = attitude.update(ac.id, { t: options.time ?? 0, headingDeg: ac.headingDeg, kt: ac.kt, altFt: ac.alt });
      applyPose(mesh, { x: ac.x, y: ac.y, altFt: ac.alt, headingDeg: ac.headingDeg, bankRad, pitchRad }, lengthFt);

      const z = altToZ(ac.alt, ALT_SCALE);
      dropAt.setXYZ(n * 2, ac.x, ac.y, z);
      dropAt.setXYZ(n * 2 + 1, ac.x, ac.y, Math.min(floor, z));
      n++;

      let ring = rings.get(ac.id);
      if (wantRings) {
        if (!ring) {
          ring = new THREE.LineLoop(ringGeometry, ringMaterials.calm);
          ring.frustumCulled = false;
          root.add(ring);
          rings.set(ac.id, ring);
        }
        const level = levels.get(ac.id);
        ring.material = ringMaterials[level ?? 'calm'];
        ring.position.set(ac.x, ac.y, z);
        ring.scale.set(options.cautionLatFt, options.cautionLatFt, 1);
      } else if (ring) {
        ring.removeFromParent();
        rings.delete(ac.id);
      }
    }
    dropAt.needsUpdate = true;
    dropGeometry.setDrawRange(0, n * 2);
    dropCount = n;
    // An aircraft that has landed, finished or gone is put away; one that has gone from the list is freed.
    const listed = new Set(scene.aircraft.map((a) => a.id));
    for (const [id, { mesh }] of planes) {
      if (!present.has(id)) mesh.visible = false;
      if (!listed.has(id)) {
        disposeAircraftMesh(mesh);
        planes.delete(id);
        attitude.forget(id);
      }
    }
    for (const [id, ring] of rings) {
      if (present.has(id)) continue;
      ring.removeFromParent();
      rings.delete(id);
    }
  }

  return {
    root,
    grid,
    /** Brings the objects in line with `scene` (routes, aircraft, conflicts) and options: { paint, layerCautionRings, cautionLatFt, zoom, groundFt, time }. */
    sync(scene, options) {
      if (disposed) return;
      syncRoutes(scene.routes);
      syncAircraft(scene, options);
    },
    /** The ground grid follows the view in whole steps, so it looks endless and still. */
    placeGrid(focus, groundFtNow) {
      grid.position.set(Math.round(focus.x / GRID_STEP_FT) * GRID_STEP_FT, Math.round(focus.y / GRID_STEP_FT) * GRID_STEP_FT, altToZ(groundFtNow, ALT_SCALE));
    },
    aircraftMesh: (id) => planes.get(id)?.mesh ?? null,
    ringOf: (id) => rings.get(id) ?? null,
    counts: () => ({
      routes: routeLines.size,
      aircraft: planes.size,
      visibleAircraft: [...planes.values()].filter((p) => p.mesh.visible).length,
      rings: rings.size,
      drops: dropCount,
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      // The shared T-6's own geometry and textures are kept by the ui-kit for the next ship, and it lets go of
      // only some of them when the last ship goes; whatever the scene still holds is freed here too (a second dispose is harmless).
      const leftovers = new Set();
      root.traverse((o) => {
        if (o.geometry) leftovers.add(o.geometry);
        for (const m of [].concat(o.material ?? [])) for (const value of Object.values(m)) if (value?.isTexture) leftovers.add(value);
      });
      for (const { line } of routeLines.values()) freeLine(line);
      routeLines.clear();
      for (const { mesh } of planes.values()) disposeAircraftMesh(mesh);
      planes.clear();
      for (const item of leftovers) item.dispose();
      for (const ring of rings.values()) ring.removeFromParent();
      rings.clear();
      ringGeometry.dispose();
      for (const material of Object.values(ringMaterials)) material.dispose();
      dropGeometry.dispose();
      dropMaterial.dispose();
      dropCount = 0;
      grid.geometry.dispose();
      grid.material.dispose();
      root.clear();
      root.removeFromParent();
    },
  };
}

/** How many distinct geometries and materials the kit's scene holds, for the tests and the leak check. */
export function threeStats(kit) {
  const geometries = new Set();
  const materials = new Set();
  kit.root.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
    for (const m of [].concat(o.material ?? [])) materials.add(m);
  });
  return { geometries: geometries.size, materials: materials.size };
}

// The two models the view uses: the shared T-6 (the Harvard scheme by default) and the plain stand-in.
function defaultModels() {
  return {
    ct156: (THREE, { color, number, paint }) => createCt156Model(THREE, { color, number, paint, lengthFt: CT156_UNIT_LENGTH }),
    t6plain: (THREE, { color }) => createAircraftMesh(THREE, { color, outline: '#0b1620' }),
    standin: (THREE, { color }) => createStandInMesh(THREE, { color, outline: '#0b1620', kind: 'generic' }),
  };
}

// ---------------------------------------------------------------------------
// The view

let software = null;

/**
 * Whether WebGL here is drawn by the CPU (SwiftShader, llvmpipe: a machine or a browser with no graphics
 * acceleration). Smoothing the edges costs a software renderer about twice the time and a real graphics
 * card almost nothing, so the view smooths them only on a card. Asked once, on a spare canvas.
 */
export function softwareRenderer(doc) {
  if (software !== null) return software;
  let gl = null;
  try {
    gl = doc.createElement('canvas').getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    software = Boolean(info) && /swiftshader|llvmpipe|softpipe|software/i.test(String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)));
  } catch {
    software = false;
  }
  try {
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    // letting it go early is a courtesy
  }
  return software;
}

/** For tests: forget the answer. */
export function resetSoftwareCheck() {
  software = null;
}

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/**
 * host: the element the view puts its canvases in (a box the size of the map). timers: the module's scheduler scope
 * (frame). source: { scene(): the scene map2d draws (routes with path, aircraft, conflicts), settings(): the Traffic
 * settings (paint, layers, caution distance), time(): the sim time in seconds }. onLost(): the graphics context was
 * lost, so 3D has been put away. win: for tests.
 * Returns { show, hide, requestDraw, camera, isChasing, stats, dispose }.
 */
export function createView3d({ host, timers, source, onLost = () => {}, win = globalThis }) {
  let THREE = null;
  let gl = null; // { canvas, labels, ctx, renderer, scene, camera, sky, kit, palette }
  let visible = false;
  let disposed = false;
  let loading = null;
  let token = 0; // counts shows and hides, so a late three.js load can't undo a later choice
  let pendingFrame = null;
  let resizer = null;
  let dragging = null;
  let drawn = 0;
  let averageMs = 0;
  let slowestMs = 0;
  let view = /** @type {{ center: { x: number, y: number, z: number }, cam: { yawDeg: number, pitchDeg: number, zoom: number, altScale: number } }} */ ({ center: { x: 0, y: 0, z: 0 }, cam: { yawDeg: 0, pitchDeg: PRESET_PITCH_DEG.fit, zoom: 20, altScale: ALT_SCALE } });
  let fitted = false; // the camera has been framed on the routes since 3D was first shown
  let wantPreset = null; // a camera button pressed before there was something to frame
  let follow = null; // { id, autoYaw }: the chase camera
  let chasePending = false; // Low chase was asked for with nothing flying: it starts on the first aircraft that does

  const sizeOf = (canvas) => ({ width: Math.max(1, canvas.clientWidth), height: Math.max(1, canvas.clientHeight) });

  function build() {
    const canvas = win.document.createElement('canvas');
    canvas.className = 'traffic-map3d';
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', '3D view of the traffic. Drag to turn it, scroll or press + and − to zoom, or use the camera buttons.');
    const labels = win.document.createElement('canvas');
    labels.className = 'traffic-labels3d';
    labels.setAttribute('aria-hidden', 'true');
    host.append(canvas, labels);
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: !softwareRenderer(win.document) });
    } catch (err) {
      canvas.remove();
      labels.remove();
      throw err;
    }
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2);
    addLights(THREE, scene);
    const sky = addSky(THREE, scene);
    const kit = createSceneKit(THREE);
    scene.add(kit.root);
    const style = win.getComputedStyle?.(canvas);
    const palette = paletteFrom((name) => style?.getPropertyValue(name).trim() ?? '');
    gl = { canvas, labels, ctx: labels.getContext('2d'), renderer, scene, camera, sky, kit, palette };
    for (const [type, fn] of hands) canvas.addEventListener(type, fn, type === 'wheel' ? { passive: false } : undefined);
    canvas.addEventListener('webglcontextlost', contextLost);
  }

  function contextLost(e) {
    e.preventDefault();
    teardown();
    onLost();
  }

  function teardown() {
    stopFrame();
    visible = false;
    resizer?.disconnect();
    resizer = null;
    dragging = null;
    if (!gl) return;
    const { canvas, labels, renderer, kit, sky } = gl;
    for (const [type, fn] of hands) canvas.removeEventListener(type, fn);
    canvas.removeEventListener('webglcontextlost', contextLost);
    gl = null;
    kit.dispose();
    sky.dispose();
    renderer.dispose();
    // What is left on the graphics card, for the leak check: nothing.
    const { memory } = renderer.info;
    host.dataset.gpu = `${memory.geometries},${memory.textures}`;
    renderer.forceContextLoss?.();
    canvas.remove();
    labels.remove();
    host.dataset.gl = 'closed';
  }

  function frame() {
    if (!gl || !visible || disposed) return;
    const started = win.performance?.now() ?? 0;
    const { canvas, labels, ctx, renderer, scene: threeScene, camera, kit, palette } = gl;
    const size = sizeOf(canvas);
    if (canvas.clientWidth < 2 || canvas.clientHeight < 2) return; // hidden: the observer draws when it has a size
    const ratio = Math.min(win.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(ratio);
    if (canvas.width !== Math.round(size.width * ratio) || canvas.height !== Math.round(size.height * ratio)) {
      renderer.setSize(size.width, size.height, false);
      labels.width = Math.round(size.width * ratio);
      labels.height = Math.round(size.height * ratio);
    }

    const data = source.scene();
    const options = source.settings();
    const floor = groundFt(data.routes);
    const box = sceneBox(data.routes, data.aircraft);

    if (box && (!fitted || wantPreset)) {
      const name = wantPreset ?? 'fit';
      wantPreset = null;
      fitted = true;
      chasePending = false;
      if (name === 'low') startChase(data, box, size);
      else {
        follow = null;
        view = cameraFor(name, box, size);
      }
    }
    if (chasePending && !follow) {
      const target = data.aircraft.find(isFlying);
      if (target) {
        follow = { id: target.id, autoYaw: true };
        view = chaseCamera(target, size);
        chasePending = false;
      }
    }
    if (follow) followAircraft(data);
    const shown = dragging?.cam ?? view.cam;
    const focus = view.center;

    kit.sync(data, {
      paint: options.paint, layerCautionRings: options.layerCautionRings, cautionLatFt: options.cautionLatFt,
      zoom: shown.zoom, groundFt: floor, time: source.time(),
    });
    kit.placeGrid(focus, floor);
    matchProjection(THREE, camera, focus, shown, size, 1);
    renderer.render(threeScene, camera);
    drawLabels(ctx, labels, size, ratio, data, options, palette);

    drawn++;
    const ms = (win.performance?.now() ?? 0) - started;
    averageMs += (ms - averageMs) * 0.1;
    slowestMs = Math.max(slowestMs * 0.98, ms);
    canvas.dataset.draws = String(drawn);
    canvas.dataset.drawMs = averageMs.toFixed(2);
    canvas.dataset.calls = String(renderer.info.render.calls); // draw calls and triangles of the last frame, for finding what a slow frame costs
    canvas.dataset.triangles = String(renderer.info.render.triangles);
  }

  // The callsigns and, with the layer on, heights and speeds, written over the picture; a word for a conflict too (colour is never the only signal).
  function drawLabels(ctx, labelCanvas, size, ratio, data, options, palette) {
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    const levels = conflictLevels(data.conflicts ?? []);
    const camera = gl.camera;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = palette.halo;
    ctx.textBaseline = 'alphabetic';
    const write = (text, x, y, colour, bold = false, px = 11) => {
      ctx.font = `${bold ? '700 ' : ''}${px}px ${FONT}`;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = colour;
      ctx.fillText(text, x, y);
    };
    for (const ac of data.aircraft) {
      if (!isFlying(ac)) continue;
      const p = worldToScreen(THREE, camera, { x: ac.x, y: ac.y, z: altToZ(ac.alt, ALT_SCALE) }, size.width, size.height);
      if (p.x < -50 || p.y < -20 || p.x > size.width + 50 || p.y > size.height + 20) continue;
      const half = MIN_PLANE_PX / 2;
      ctx.textAlign = p.x + 130 > size.width ? 'right' : 'left';
      const x = ctx.textAlign === 'left' ? p.x + half : p.x - half;
      write(ac.id, x, p.y - 6, aircraftColor(ac), true, 12);
      if (options.layerLabels) write(heightSpeedText(ac), x, p.y + 7, palette.text);
      const level = levels.get(ac.id);
      if (level) write(LEVEL_MARKS[level], x, p.y + 20, level === 'conflict' ? palette.bad : palette.caution, true);
    }
  }

  function startChase(data, box, size) {
    const target = data.aircraft.find(isFlying);
    if (!target) {
      follow = null;
      chasePending = true;
      view = fitCamera(box, size, { yawDeg: 0, pitchDeg: PRESET_PITCH_DEG.low });
      return;
    }
    follow = { id: target.id, autoYaw: true };
    view = chaseCamera(target, size);
  }

  // The chase camera stays on its aircraft; when that one lands or is gone it moves to the next one flying, or lets go.
  function followAircraft(data) {
    let target = data.aircraft.find((a) => a.id === follow.id && isFlying(a));
    if (!target) {
      target = data.aircraft.find(isFlying);
      if (!target) {
        follow = null;
        chasePending = true; // the chase picks up again with the next aircraft to fly
        return;
      }
      follow.id = target.id;
    }
    view.center = { x: target.x, y: target.y, z: finite(target.alt) };
    if (follow.autoYaw) view.cam = { ...view.cam, yawDeg: swingTo(view.cam.yawDeg, wrapDeg(target.headingDeg), CHASE_LERP) };
  }

  function requestDraw() {
    if (disposed || !visible || !gl || pendingFrame) return;
    pendingFrame = timers.frame(() => {
      const done = pendingFrame;
      pendingFrame = null; // first, so a frame that throws doesn't leave the view thinking one is still coming
      done?.();
      frame();
    });
  }

  function stopFrame() {
    pendingFrame?.();
    pendingFrame = null;
  }

  // ---- the person's hands: drag to turn and tilt, wheel or + and - to zoom --------------------
  const endDrag = (e) => {
    if (!dragging || e.pointerId !== dragging.id) return;
    view = { ...view, cam: dragging.cam };
    dragging = null;
    gl?.canvas.classList.remove('is-dragging');
  };
  const zoomTo = (deltaY) => {
    view = { ...view, cam: zoomBy(view.cam, deltaY) };
    requestDraw();
  };
  const hands = /** @type {[string, (e: any) => void][]} */ ([
    ['pointerdown', (e) => {
      if (e.button !== 0) return;
      dragging = { id: e.pointerId, x: e.clientX, y: e.clientY, cam: view.cam };
      gl.canvas.setPointerCapture?.(e.pointerId);
      gl.canvas.classList.add('is-dragging');
    }],
    ['pointermove', (e) => {
      if (!dragging || e.pointerId !== dragging.id) return;
      dragging.cam = orbit(dragging.cam, e.clientX - dragging.x, e.clientY - dragging.y);
      dragging.x = e.clientX;
      dragging.y = e.clientY;
      if (follow) follow.autoYaw = false; // turned by hand: the chase camera stops swinging behind
      requestDraw();
    }],
    ['pointerup', endDrag],
    ['pointercancel', endDrag],
    ['wheel', (e) => {
      e.preventDefault();
      if (e.deltaY) zoomTo(e.deltaY);
    }],
    ['keydown', (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const deltaY = e.key === '+' || e.key === '=' ? -1 : e.key === '-' || e.key === '_' ? 1 : 0;
      if (!deltaY) return;
      e.preventDefault();
      zoomTo(deltaY);
    }],
  ]);

  return {
    /**
     * Shows the 3D view, loading three.js the first time. Resolves { ok: true }, or { ok: false, reason }: 'gl' when
     * the browser has no WebGL (checked before anything is built), 'load' when three.js could not be fetched (offline
     * the first time), 'closed' or 'cancelled' when the module closed or 3D was switched off while it loaded. A later call tries again.
     */
    async show() {
      if (disposed) return { ok: false, reason: 'closed' };
      const mine = ++token;
      if (!gl) {
        if (!webglSupported({ document: win.document })) return { ok: false, reason: 'gl' };
        loading ??= (async () => {
          try {
            THREE = await loadThree();
          } catch (err) {
            console.warn('three.js could not be loaded:', err);
            return { ok: false, reason: 'load' };
          }
          return { ok: true };
        })();
        const result = await loading;
        loading = null;
        if (!result.ok) return result;
        if (disposed) return { ok: false, reason: 'closed' };
        if (mine !== token) return { ok: false, reason: 'cancelled' };
        if (!gl) {
          try {
            build();
          } catch (err) {
            console.warn('WebGL could not start:', err);
            return { ok: false, reason: 'gl' };
          }
        }
      }
      visible = true;
      host.dataset.gl = 'open';
      if (win.ResizeObserver && !resizer) {
        resizer = new win.ResizeObserver(() => requestDraw());
        resizer.observe(host);
      }
      requestDraw();
      return { ok: true };
    },
    /** Switching back to 2D: stops drawing and frees everything, the renderer too. The camera is kept for the next time. */
    hide() {
      token++;
      teardown();
    },
    requestDraw,
    /** A camera button: 'fit', 'high' (High look-down) or 'low' (Low chase). Done at the next frame, when the size is known. */
    preset(name) {
      wantPreset = name;
      requestDraw();
    },
    isChasing: () => follow !== null,
    stats: () => ({
      loaded: gl !== null, visible, drawn, pending: pendingFrame !== null, averageMs, slowestMs,
      geometries: gl?.renderer.info.memory.geometries ?? 0, textures: gl?.renderer.info.memory.textures ?? 0,
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      token++;
      teardown();
    },
  };
}
