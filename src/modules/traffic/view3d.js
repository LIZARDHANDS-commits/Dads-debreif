// The Traffic Sim's 3D view (specs/SPEC-traffic.md: 3D view; SPEC-ui-kit "3D aircraft (three.js, D138)" and
// "2D/3D switch (D141)"): the same run as the 2D map, drawn with three.js through the ui-kit's shared pieces
// (three-aircraft.js, ct156-model.js). It reads the engine's state (where each aircraft is, its heading, height
// and speed) and draws it: the routes as lines at their heights, the shared T-6 for the CT-156 and CT-157 and a
// stand-in shape for the other types, banking with their turns, and a caution ring round each aircraft. It works
// out no flight math of its own: it draws the sim's bank and pitch, and reads them off how the state changes only when the state has none.
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
  loadThree, webglSupported, matchProjection, worldToScreen, altToZ, addSky, createStandInMesh, createAircraftMesh, disposeAircraftMesh,
} from '../../ui-kit/three-aircraft.js';
import { createCt156Model, CT156_UNIT_LENGTH, PAINT_DEFAULT } from '../../ui-kit/ct156-model.js';
import { KT_TO_FTPS, G_FTPS2, FT_PER_NM } from '../../core/units.js';
import { T6_LENGTH_FT } from './types.js';
import { paletteFrom, conflictLevels, isFlying, aircraftColor, heightSpeedText, LEVEL_MARKS, MIN_RING_PX, photoAlignment, photoView, getPflBadge, pflCircleLayout, calculateGlideFootprint, shouldShowGlideFootprint } from './map2d.js';
import { createTileLayer, ESRI_IMAGERY } from '../../ui-kit/map-tiles.js';
import { makeLocalRef, latLonToLocalFt } from '../../core/geo.js';
import { createAirfieldScenery, disposeAirfieldScenery, DEFAULT_FLOOR_FT, RUNWAY_TOP_FT } from './scenery3d.js';
import { createLandmarks, disposeLandmarks, createWindsocks, updateWindsocks, disposeWindsocks } from './landmarks3d.js';
import { createBaseBuildings, disposeBaseBuildings } from './base-buildings3d.js';
import { createRiverGeometry } from './rivers3d.js';
import { AIRFIELD_CORE_BOUNDS_FT, paintCoreAirfieldVector, getCoreCorners, getOptimalCoreTileZoom } from './airfield-core-ground.js';
import { fieldCamera, topDownCamera, towerCamera, cockpitCamera, padlockCamera, NEEDS_AIRCRAFT } from './camera-views.js';
import { createCameraBar } from './camera-bar.js';

/** The viewpoints worked out from a place (the tower) or an aircraft each frame, rather than framed once. */
const POV_VIEWS = new Set(['tower', 'cockpit', 'padlock']);

/** The camera for a Tower, Cockpit or Padlock view; `target` is the followed aircraft, or null (Tower only). */
export function povCamera(name, target, size, floorFt) {
  if (name === 'cockpit' && target) return cockpitCamera(target, size);
  if (name === 'padlock' && target) return padlockCamera(target, size);
  return towerCamera(target ?? null, size, floorFt);
}

/** Every axis is drawn at the same scale: a foot of height is a foot of ground (SPEC-traffic: the 3D view). */
export const ALT_SCALE = 1;
export const PHOTO_SPAN_FT = 105_600; // ten miles each way
/**
 * The outermost, softest ring: thirty nautical miles each way, out past Old Wives Lake (Patrick, 5 Oct 03:19Z "extend the
 * blurry image layer all the way out to old wives lake", 03:20Z "go in every direction"; TR-70). One 2,048 px square at
 * Esri zoom 11 (about 178 ft a pixel), so about 16 MB and some 80 tiles, at every quality.
 */
export const OUTER_PHOTO_SPAN_FT = 364_560;
export const MID_SPAN_FT = 30_000;
/**
 * On High the middle tier covers the pattern lines plus a mile (Patrick, 4 Oct 2026: "sharp all the way to a mile
 * past the pattern lines"): a square round the built-in Moose Jaw Pattern 1 points plus 6,076 ft, about 9 x 7 NM
 * in true feet (TR-67). It is four 4,096 px squares (about 6.8 ft a pixel, Esri zoom 15), not one 8,192 px canvas,
 * which some browsers refuse.
 */
export const PATTERN_MID_SPAN_FT = 55_500;
export const PATTERN_MID_CENTER_FT = Object.freeze({ x: -3_500, y: -7_700 });
/** The four squares' centres, west to east then south to north. */
export const PATTERN_MID_QUADS = Object.freeze([-1, 1].flatMap((dy) => [-1, 1].map((dx) => Object.freeze({
  x: PATTERN_MID_CENTER_FT.x + (dx * PATTERN_MID_SPAN_FT) / 4,
  y: PATTERN_MID_CENTER_FT.y + (dy * PATTERN_MID_SPAN_FT) / 4,
}))));
/** The sharpest ground (Esri zoom 18, about 1.3 ft a pixel): a box round both runway ends and the flight line. */
export const TIGHT_SPAN_FT = 7_600;
export const TIGHT_CENTER_FT = Object.freeze({ x: -400, y: -125 }); // divided by 1.2 to true feet (TR-67)

/** Camera limits. pitch is degrees from straight down (0 looks down, 90 is level); zoom is pixels to 1,000 ft. */
export const CAMERA_LIMITS = Object.freeze({ pitch: [0, 85], zoom: [0.3, 4000] });

/** The pitch of each camera button: Fit, High look-down and Low chase. */
export const PRESET_PITCH_DEG = Object.freeze({ fit: 45, high: 20, low: 72 });
/** How much ground the chase camera shows across the screen, in feet. */
const CHASE_SPAN_FT = 3000;
const CHASE_LERP = 0.15; // how fast the chase camera swings behind a turning aircraft, a share of the gap each frame

/** Real length of a T-6 in feet (kept in types.js). A zoomed-out aircraft is drawn bigger, so it can still be seen. */
export { T6_LENGTH_FT };
/** The length an aircraft is drawn at least, on screen, in pixels. */
export const MIN_PLANE_PX = 44;

const ORBIT_DEG_PER_PX = Object.freeze({ yaw: 0.4, pitch: 0.25 });
const WHEEL_ZOOM = Object.freeze({ in: 1.12, out: 0.89 });
/** The arrow keys turn and tilt the view as a drag of this many pixels would, for anyone who can't drag. */
const KEY_ORBIT_PX = Object.freeze({ ArrowLeft: [-30, 0], ArrowRight: [30, 0], ArrowUp: [0, -30], ArrowDown: [0, 30] });

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
 * The attitude to draw: the sim's own bank (right positive, so it turns round here) and pitch when it gives
 * them, so the picture shows what is flown (Traffic spec item 9). `readOff` (from createAttitude) is only the
 * fallback for an aircraft whose state has no bank or pitch.
 */
export function attitudeOf(ac, readOff) {
  return {
    bankRad: Number.isFinite(ac?.bankDeg) ? -rad(ac.bankDeg) : readOff.bankRad,
    pitchRad: Number.isFinite(ac?.pitchDeg) ? rad(ac.pitchDeg) : readOff.pitchRad,
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

/**
 * How far up a model is drawn from its height so its wheels, not its middle, are at the height (Patrick, 5 Oct 02:40Z:
 * the aircraft clipped through the runway): the prop disc's lowest edge below the model's axis (0.26 model units, plus a
 * little clearance), at the drawn size, plus the raised runway slab. Drawing only; the flight numbers are unchanged.
 */
const GEAR_LIFT_UNITS = 0.27;
export function wheelLiftFt(lengthFt) {
  return (GEAR_LIFT_UNITS * lengthFt) / CT156_UNIT_LENGTH + RUNWAY_TOP_FT;
}

/** The see-through blurred disc of a turning prop (Patrick, 5 Oct 02:42Z: "a still graphic that looks like spinning"). */
function drawPropBlur(ctx, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const r = w / 2;
  const g = ctx.createRadialGradient(cx, cy, r * 0.12, cx, cy, r);
  g.addColorStop(0, 'rgba(40, 44, 52, 0)');
  g.addColorStop(0.35, 'rgba(40, 44, 52, 0.22)');
  g.addColorStop(0.8, 'rgba(30, 34, 40, 0.30)');
  g.addColorStop(0.88, 'rgba(210, 32, 44, 0.32)'); // the red blade tips as a faint ring
  g.addColorStop(0.97, 'rgba(210, 32, 44, 0.12)');
  g.addColorStop(1, 'rgba(210, 32, 44, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(20, 22, 28, 0.10)';
  for (let k = 0; k < 4; k++) { // faint blade streaks
    ctx.beginPath();
    ctx.arc(cx, cy, r * (0.5 + k * 0.1), k * 0.9, k * 0.9 + 1.1);
    ctx.lineWidth = r * 0.06;
    ctx.stroke();
  }
}

// One small blur picture for the whole page, made on first use and kept (a 128-pixel texture).
const propBlurMaps = new WeakMap();
function propBlurMap(THREE) {
  if (propBlurMaps.has(THREE)) return propBlurMaps.get(THREE);
  const doc = globalThis.document;
  const canvas = doc?.createElement ? doc.createElement('canvas') : null;
  const ctx = canvas?.getContext?.('2d');
  let map = null;
  if (ctx) {
    canvas.width = 128;
    canvas.height = 128;
    drawPropBlur(ctx, 128, 128);
    map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
  }
  propBlurMaps.set(THREE, map);
  return map;
}

function propBlurMaterial(THREE) {
  const map = propBlurMap(THREE);
  return new THREE.MeshBasicMaterial({
    color: map ? '#ffffff' : '#2c3036', map, transparent: true, opacity: map ? 1 : 0.22, side: THREE.DoubleSide, depthWrite: false, fog: false,
  });
}

/** Shows a T-6 model's prop as turning: its blades hidden and its disc given the blurred look. Only this model changes. */
export function blurProp(THREE, mesh) {
  const ct = mesh.userData?.ct156;
  const blades = ct ? new Set([ct.kit.geo.blade, ct.kit.geo.bladeTip]) : new Set();
  const material = propBlurMaterial(THREE);
  let used = false;
  mesh.traverse((o) => {
    if (!o.isMesh) return;
    if (blades.has(o.geometry)) o.visible = false;
    else if (o.geometry?.type === 'CircleGeometry') {
      if (!ct) o.material.dispose(); // the plain model's own disc material; the full model's is shared, so kept
      o.material = material;
      used = true;
    }
  });
  if (!used) material.dispose();
  else if (ct) ct.mine.push({ dispose: () => material.dispose() }); // freed with the model; the shared picture stays
}

/** Feet an aircraft is drawn at, at a zoom (pixels to 1,000 ft): its real length, or MIN_PLANE_PX if that is smaller on screen, times the Aircraft size setting (1 = realistic). */
export function planeLengthFt(zoom, scale = 1) {
  return Math.max(T6_LENGTH_FT, MIN_PLANE_PX / (zoom / 1000)) * (Number(scale) > 0 ? Number(scale) : 1);
}

/** The CT-156 and CT-157 are the shared T-6; every other type (CT-102B, CT-102, CT-114, CT-155, CF-188) is a stand-in shape until it has its own model. */
export const modelKindFor = (type) => (type === 'CT-156' || type === 'CT-157' ? 'ct156' : 'standin');

/**
 * Stand-in mesh kind for aircraft types without dedicated custom 3D models.
 * CT-102B, CT-102, and CT-157 map to 'generic' (turboprop trainer stand-in mesh with straight wings).
 */
export function standInKindFor(type) {
  if (type === 'CT-102B' || type === 'CT-102' || type === 'CT-157') return 'generic';
  return 'generic';
}

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

/** A camera pan from a drag of (dx, dy) pixels. */
export function panCamera(center, cam, dx, dy) {
  const pxPerFt = Math.max(1e-4, cam.zoom / 1000);
  const yaw = rad(cam.yawDeg);
  const pitch = rad(cam.pitchDeg);
  const cosPitch = Math.max(0.15, Math.cos(pitch));
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const dxFt = dx / pxPerFt;
  const dyFt = dy / pxPerFt / cosPitch;
  return {
    x: center.x - (dxFt * cosYaw - dyFt * sinYaw),
    y: center.y - (-dxFt * sinYaw - dyFt * cosYaw),
    z: center.z,
  };
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
  return `${route.kind}|${route.color}|${path.length}|${sum.toFixed(3)}|${route.lineScale ?? 1}|${route.lineOpacity ?? 1}|${route.onGround ? 'g' : 'h'}`;
}

// A pattern is a closed loop, entries and splits open lines. Entries are dashed and splits dotted, as on the 2D map.
const DASH_FT = Object.freeze({ entry: [500, 350], split: [120, 380] });
/**
 * How wide and how solid the routes are drawn in 3D, in pixels and 0-1, with a thin dark edge either side so they
 * stand out on the photo (Patrick, 4 Oct 10:55Z: more contrast). Patrick, 17:50Z: the first wide lines (3 px with a
 * 2.5 px solid edge) were too thick and opaque, "somewhere in the middle" of those and the old 1 px lines; these
 * are that middle. Plain WebGL lines are always 1 px, so these use three's own wide lines; without them the routes
 * fall back to the thin lines.
 */
const ROUTE_LINE_PX = Object.freeze({ pattern: 2, other: 1.5, edge: 1 });
const ROUTE_LINE_OPACITY = Object.freeze({ line: 0.75, edge: 0.45 });
const ROUTE_EDGE_COLOR = '#0b1620';
/** The PFL circle on the 3D ground (layer "PFL ground circle"), drawn as on the map: pink circle, red spoke to Low Key. */
const PFL_CIRCLE_COLOR = '#ff9bce';
const PFL_SPOKE_COLOR = '#ff6b6b';
const GLIDE_RING_COLOR = '#38bdf8';
/** Feet above the ground the PFL lines are drawn, so the photo doesn't hide them. */
const GROUND_LINE_LIFT_FT = 8;

let fatLinesPromise = null;
/**
 * three's own wide lines (Line2, LineMaterial, LineGeometry from three/addons, part of the three package the 3D view
 * already loads; no new library). Loaded with the 3D view only. Null when they can't load: the thin lines are used.
 */
export function loadFatLines() {
  fatLinesPromise ??= Promise.all([
    import('three/addons/lines/Line2.js'),
    import('three/addons/lines/LineMaterial.js'),
    import('three/addons/lines/LineGeometry.js'),
  ]).then(([a, b, c]) => ({ Line2: a.Line2, LineMaterial: b.LineMaterial, LineGeometry: c.LineGeometry }))
    .catch((err) => {
      fatLinesPromise = null;
      console.warn('Wide 3D lines could not be loaded; drawing thin ones:', err);
      return null;
    });
  return fatLinesPromise;
}

/** How many T-6s flying at once get the full Harvard model (55 draw calls each); later ones get the ui-kit's plain T-6 (about 10). */
export const MAX_FULL_T6 = 24;
/**
 * The full Harvard model is only worth its draw calls when the aircraft is drawn this many pixels long or more
 * (zoomed right in on it); smaller than that the plain T-6 looks the same. Once full it is kept until it is under
 * FULL_MODEL_KEEP_PX, so a wheel notch across the line does not build it over and over.
 */
export const FULL_MODEL_PX = 120;
export const FULL_MODEL_KEEP_PX = 100;

/** How long an aircraft is drawn on screen, in pixels, at a zoom. */
export const planePx = (zoom) => (planeLengthFt(zoom) * zoom) / 1000;

/** Whether an aircraft drawn `px` long gets the full model, given whether it has it now. */
export const wantsFullModel = (px, wasFull) => px > (wasFull ? FULL_MODEL_KEEP_PX : FULL_MODEL_PX);

/** The caution ring's radius in feet: the caution distance, or MIN_RING_PX on screen (as on the 2D map) if that is smaller. */
export const ringRadiusFt = (cautionLatFt, zoom) => Math.max(cautionLatFt, MIN_RING_PX / (zoom / 1000));

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
export function createSceneKit(THREE, { models = defaultModels(), fatLines = null } = {}) {
  const root = new THREE.Group();
  const routeLines = new Map(); // route id -> { line, sig, edge }
  const resolution = { width: 1, height: 1 }; // the canvas size, which the wide lines need to be drawn in pixels
  const planes = new Map(); // aircraft id -> { mesh, kind, paint }
  const rings = new Map(); // aircraft id -> LineLoop
  const attitude = createAttitude();
  let disposed = false;

  // The ring is one circle shared by every ring, scaled to the caution distance; three colours shared too.
  const ringPoints = [];
  for (let i = 0; i < RING_SEGMENTS; i++) ringPoints.push(new THREE.Vector3(Math.cos((i / RING_SEGMENTS) * Math.PI * 2), Math.sin((i / RING_SEGMENTS) * Math.PI * 2), 0));
  const ringGeometry = new THREE.BufferGeometry().setFromPoints(ringPoints);
  const ringMaterials = Object.fromEntries(Object.entries(RING_COLORS).map(([level, color]) => [level, new THREE.LineBasicMaterial({ color, transparent: level === 'calm', opacity: level === 'calm' ? 0.45 : 1, fog: false })]));

  // One line-segment object for every drop line, its geometry built again, bigger, when there are more aircraft than room.
  const DROP_FLOATS = 6; // two ends of three numbers, per aircraft
  let dropCapacity = 64 * DROP_FLOATS; // room for 64 aircraft to start with
  const newDropGeometry = (floats) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(floats), 3));
    geometry.setDrawRange(0, 0);
    return geometry;
  };
  let dropGeometry = newDropGeometry(dropCapacity);
  const dropMaterial = new THREE.LineDashedMaterial({ color: '#8fc4ff', dashSize: 150, gapSize: 100, transparent: true, opacity: 0.85, fog: false });
  const drops = new THREE.LineSegments(dropGeometry, dropMaterial);
  drops.frustumCulled = false;
  root.add(drops);
  let dropCount = 0;
  let fullModels = false; // the zoom is close enough for the full Harvard model
  let targetedId = null;
  let lastScene = null;

  const shadows = new Map(); // aircraft id -> LineLoop
  const shadowMaterial = new THREE.LineBasicMaterial({ color: '#58a6ff', transparent: true, opacity: 0.6, fog: false });


  // Outermost photo ring (OUTER_PHOTO_SPAN_FT), under everything else
  const outerGeometry = new THREE.PlaneGeometry(OUTER_PHOTO_SPAN_FT, OUTER_PHOTO_SPAN_FT);
  const outerMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const outerMesh = new THREE.Mesh(outerGeometry, outerMaterial);
  outerMesh.renderOrder = -5;
  outerMesh.visible = false;
  root.add(outerMesh);

  // Satellite photo ground plane
  const photoGeometry = new THREE.PlaneGeometry(PHOTO_SPAN_FT, PHOTO_SPAN_FT);
  const photoMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
  });
  const photoMesh = new THREE.Mesh(photoGeometry, photoMaterial);
  // The ground photos are see-through, so they draw in a fixed order, coarsest first and sharpest on top;
  // left to sort by distance from the camera they swap, and a coarser one could hide a sharper one (Patrick 18:59Z).
  // Negative, so everything else, the route lines included, still draws over the ground.
  photoMesh.renderOrder = -4;
  photoMesh.visible = false;
  root.add(photoMesh);

  // Middle tier (Performance): sharper imagery for about three miles round the field
  const midGeometry = new THREE.PlaneGeometry(MID_SPAN_FT, MID_SPAN_FT);
  const midMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.97, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const midMesh = new THREE.Mesh(midGeometry, midMaterial);
  midMesh.renderOrder = -3;
  midMesh.visible = false;
  root.add(midMesh);
  // High: the middle tier stretched to the pattern plus a mile, in four squares (PATTERN_MID_QUADS)
  const patternMidGeometry = new THREE.PlaneGeometry(PATTERN_MID_SPAN_FT / 2, PATTERN_MID_SPAN_FT / 2);
  const patternMid = PATTERN_MID_QUADS.map((q) => {
    const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.97, depthWrite: false, fog: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(patternMidGeometry, material);
    mesh.renderOrder = -3;
    mesh.visible = false;
    root.add(mesh);
    // The recessed river valley in this square (rivers3d.js, TR-70): the square's own photo on a sunk ribbon, drawn just
    // after the flat square so the valley replaces it there; it writes depth so a near bank hides the far one.
    const riverGeometry = createRiverGeometry(THREE, { x: q.x, y: q.y, span: PATTERN_MID_SPAN_FT / 2 });
    let river = null;
    let riverMaterial = null;
    if (riverGeometry) {
      riverMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.97, depthWrite: true, fog: false, side: THREE.DoubleSide });
      river = new THREE.Mesh(riverGeometry, riverMaterial);
      river.name = 'river-valley';
      river.renderOrder = -2.5;
      mesh.add(river);
    }
    return { mesh, material, river, riverGeometry, riverMaterial };
  });

  // Sharpest tier: zoom-18 imagery over the runways and flight line (transparent until tiles arrive)
  const tightGeometry = new THREE.PlaneGeometry(TIGHT_SPAN_FT, TIGHT_SPAN_FT);
  const tightMaterial = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const tightMesh = new THREE.Mesh(tightGeometry, tightMaterial);
  tightMesh.renderOrder = -1;
  tightMesh.visible = false;
  root.add(tightMesh);

  // High-resolution core ground mesh (Runways, taxiways, ramp)
  const coreGeometry = new THREE.PlaneGeometry(AIRFIELD_CORE_BOUNDS_FT.width, AIRFIELD_CORE_BOUNDS_FT.height);
  const coreMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.98,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
  });
  const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
  coreMesh.renderOrder = -2;
  coreMesh.visible = false;
  coreMesh.position.set(AIRFIELD_CORE_BOUNDS_FT.centerX, AIRFIELD_CORE_BOUNDS_FT.centerY, 0);
  root.add(coreMesh);

  // 3D Airfield Scenery: Control Tower, 4 Arch Hangars, South Apron
  const scenery = createAirfieldScenery(THREE);
  root.add(scenery);
  // Every other base building (PMQs, offices, annexes) as simple boxes: three instanced draw calls (TR-69)
  const baseBuildings = createBaseBuildings(THREE, { floor: DEFAULT_FLOOR_FT });
  root.add(baseBuildings);

  // Circuit landmarks (Window Farm, Sukanen, Fiat Farm, Arrow Trees): always on.
  const landmarks = createLandmarks(THREE, { floor: DEFAULT_FLOOR_FT });
  root.add(landmarks);
  const windsocks = createWindsocks(THREE, { floor: DEFAULT_FLOOR_FT });
  root.add(windsocks);

  const grid = new THREE.GridHelper(GRID_STEP_FT * GRID_CELLS, GRID_CELLS, '#2c5a44', '#1c3a30');
  grid.rotation.x = Math.PI / 2; // GridHelper lies in X-Z; the ground here is X-Y
  grid.material.fog = false;
  root.add(grid);

  function syncRoutes(list, options = {}) {
    const wanted = new Set();
    const showWind = options.layerWindTrack !== false;
    const showSmm = options.layerSmmReference !== false;

    for (const route of list) {
      if (route.visible === false) continue;
      const isPat1 = route.id === 'PAT1';
      const hasCalm = Boolean(route.calmPath);

      if (route.path && route.path.length >= 2 && (!isPat1 || !hasCalm || showWind)) {
        wanted.add(route.id);
        const sig = routeSignature(route);
        const have = routeLines.get(route.id);
        if (!have || have.sig !== sig) {
          if (have) freeRoute(have);
          // On the ground (the Display box's Draw choice, Patrick, 4 Oct) the line lies on the field, else at its heights.
          const drawn = route.onGround ? route.path.map((p) => ({ ...p, alt: (options.groundFt ?? 0) + GROUND_LINE_LIFT_FT })) : route.path;
          const scale = Number.isFinite(route.lineScale) && route.lineScale > 0 ? route.lineScale : 1;
          const fade = Number.isFinite(route.lineOpacity) ? Math.min(1, Math.max(0, route.lineOpacity)) : 1;
          const positions = new Float32Array(drawn.length * 3);
          drawn.forEach((p, i) => positions.set([p.x, p.y, altToZ(p.alt, ALT_SCALE)], i * 3));
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
          const dash = DASH_FT[route.kind];
          if (fatLines) {
            geometry.dispose(); // the wide line keeps its own copy of the points
            const closed = route.kind === 'pattern';
            const widthPx = (closed ? ROUTE_LINE_PX.pattern : ROUTE_LINE_PX.other) * scale;
            // Both see-through, the edge drawn first (render order goes before three's sorting of see-through lines).
            const seeThrough = (opacity) => ({ transparent: true, opacity, depthWrite: false });
            const edge = wideLine(drawn, closed, { color: ROUTE_EDGE_COLOR, linewidth: widthPx + 2 * ROUTE_LINE_PX.edge, ...seeThrough(ROUTE_LINE_OPACITY.edge * fade) }, 1);
            // Pulled a hair toward the eye, so the colour never flickers with the edge at the same depth.
            const line = wideLine(drawn, closed, { color: route.color, linewidth: widthPx, dash, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, ...seeThrough(ROUTE_LINE_OPACITY.line * fade) }, 2);
            routeLines.set(route.id, { line, sig, edge });
          } else {
            const material = dash
              ? new THREE.LineDashedMaterial({ color: route.color, dashSize: dash[0], gapSize: dash[1], fog: false, transparent: fade < 1, opacity: fade })
              : new THREE.LineBasicMaterial({ color: route.color, fog: false, transparent: fade < 1, opacity: fade });
            const line = route.kind === 'pattern' ? new THREE.LineLoop(geometry, material) : new THREE.Line(geometry, material);
            if (dash) line.computeLineDistances();
            line.frustumCulled = false;
            root.add(line);
            routeLines.set(route.id, { line, sig });
          }
        }
      }

      if (isPat1 && hasCalm && showSmm) {
        const calmId = route.id + '_calm';
        wanted.add(calmId);
        const sig = `${routeSignature(route)}_calm`;
        const have = routeLines.get(calmId);
        if (!have || have.sig !== sig) {
          if (have) freeRoute(have);
          const positions = new Float32Array(route.calmPath.length * 3);
          route.calmPath.forEach((p, i) => positions.set([p.x, p.y, altToZ(p.alt, ALT_SCALE)], i * 3));
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
          const material = new THREE.LineDashedMaterial({ color: '#8b949e', dashSize: 400, gapSize: 300, transparent: true, opacity: 0.6, fog: false });
          const line = new THREE.LineLoop(geometry, material);
          line.computeLineDistances();
          line.frustumCulled = false;
          root.add(line);
          routeLines.set(calmId, { line, sig });
        }
      }
    }
    for (const [id, have] of routeLines) {
      if (wanted.has(id)) continue;
      freeRoute(have);
      routeLines.delete(id);
    }
  }

  /** A wide line through `points` ({ x, y, alt }), `material` options for three's LineMaterial; drawn after `order` lower. */
  function wideLine(points, closed, { dash = null, ...options }, order) {
    const flat = [];
    for (const p of points) flat.push(p.x, p.y, altToZ(p.alt, ALT_SCALE));
    if (closed && points.length > 2) flat.push(flat[0], flat[1], flat[2]);
    const geometry = new fatLines.LineGeometry();
    geometry.setPositions(flat);
    const material = new fatLines.LineMaterial({ ...options, worldUnits: false, dashed: Boolean(dash), dashSize: dash?.[0] ?? 1, gapSize: dash?.[1] ?? 0, fog: false });
    material.resolution.set(resolution.width, resolution.height);
    const line = new fatLines.Line2(geometry, material);
    if (dash) line.computeLineDistances();
    line.renderOrder = order;
    line.frustumCulled = false;
    root.add(line);
    return line;
  }

  function freeRoute(have) {
    freeLine(have.line);
    if (have.edge) freeLine(have.edge);
  }

  // The PFL circle and its spoke to Low Key, on the ground; built once, moved to the ground's height each sync.
  const pflLayout = pflCircleLayout();
  const PFL_SEGMENTS = 96;
  const pflCirclePoints = [];
  for (let i = 0; i < PFL_SEGMENTS; i++) {
    const a = (i / PFL_SEGMENTS) * Math.PI * 2;
    pflCirclePoints.push(new THREE.Vector3(pflLayout.center.x + pflLayout.radiusFt * Math.cos(a), pflLayout.center.y + pflLayout.radiusFt * Math.sin(a), 0));
  }
  const pflCircleGeometry = new THREE.BufferGeometry().setFromPoints(pflCirclePoints);
  const pflCircleMaterial = new THREE.LineDashedMaterial({ color: PFL_CIRCLE_COLOR, dashSize: 400, gapSize: 280, fog: false });
  const pflCircle = new THREE.LineLoop(pflCircleGeometry, pflCircleMaterial);
  pflCircle.computeLineDistances();
  const pflSpokeGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(pflLayout.highKey.x, pflLayout.highKey.y, 0), new THREE.Vector3(pflLayout.lowKey.x, pflLayout.lowKey.y, 0)]);
  const pflSpokeMaterial = new THREE.LineDashedMaterial({ color: PFL_SPOKE_COLOR, dashSize: 250, gapSize: 250, fog: false });
  const pflSpoke = new THREE.Line(pflSpokeGeometry, pflSpokeMaterial);
  pflSpoke.computeLineDistances();
  const pflGround = new THREE.Group();
  pflGround.add(pflCircle, pflSpoke);
  pflGround.visible = false;
  root.add(pflGround);

  // Each PFL aircraft's glide ring on the ground (as on the map): the shared unit circle, scaled to the glide distance.
  const glideRings = new Map(); // aircraft id -> LineLoop
  const glideMaterial = new THREE.LineBasicMaterial({ color: GLIDE_RING_COLOR, transparent: true, opacity: 0.8, fog: false });

  function syncPflGround(scene, options) {
    const lift = altToZ((options.groundFt ?? 0) + GROUND_LINE_LIFT_FT, ALT_SCALE);
    pflGround.visible = options.layerPflCircle !== false;
    pflGround.position.z = lift;
    const present = new Set();
    for (const ac of scene.aircraft) {
      if (options.layerEngineReach === false || !isFlying(ac) || !shouldShowGlideFootprint(ac, scene.selectedAircraftId ?? null)) continue; // the Engine-out reach tick, selected aircraft only
      const footprint = calculateGlideFootprint(ac, scene.windFromDeg ?? 360, scene.windKt ?? 0);
      if (!(footprint.rGlide > 0)) continue;
      present.add(ac.id);
      let ring = glideRings.get(ac.id);
      if (!ring) {
        ring = new THREE.LineLoop(ringGeometry, glideMaterial);
        ring.frustumCulled = false;
        root.add(ring);
        glideRings.set(ac.id, ring);
      }
      ring.position.set(footprint.cx, footprint.cy, lift);
      ring.scale.set(footprint.rGlide, footprint.rGlide, 1);
    }
    for (const [id, ring] of glideRings) {
      if (present.has(id)) continue;
      ring.removeFromParent();
      glideRings.delete(id);
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
    const options = { color: aircraftColor(ac), number: numberOf(ac.id), paint, type: ac.type };
    const mesh = models[kind](THREE, options);
    if (kind !== 'standin') blurProp(THREE, mesh);
    mesh.rotation.order = 'ZYX';
    root.add(mesh);
    planes.set(ac.id, { mesh, kind, paint });
    return mesh;
  }

  function syncAircraft(scene, options) {
    const flying = scene.aircraft.filter(isFlying);
    const levels = conflictLevels(scene.conflicts ?? []);
    const lengthFt = planeLengthFt(options.zoom, options.aircraftScale);
    const present = new Set();
    const wantRings = options.layerCautionRings !== false;
    const wantHeightLines = options.layerHeightLines !== false;
    drops.visible = wantHeightLines;
    if (flying.length * DROP_FLOATS > dropCapacity) {
      // A new geometry, not a new attribute on the old one: the old buffer on the graphics card goes with dispose().
      dropCapacity = Math.max(flying.length * DROP_FLOATS, dropCapacity * 2);
      dropGeometry.dispose();
      dropGeometry = newDropGeometry(dropCapacity);
      drops.geometry = dropGeometry;
    }
    const dropAt = dropGeometry.attributes.position;
    const floor = altToZ(options.groundFt ?? 0, ALT_SCALE);
    let n = 0;
    // The full model is some 55 draw calls, so only a T-6 drawn big enough to show it gets it, and only the first few of those.
    fullModels = options.fullModels !== undefined ? options.fullModels : wantsFullModel(planePx(options.zoom), fullModels);
    const maxT6 = options.graphicsQuality === 'low' ? 4 : MAX_FULL_T6;
    let fullLeft = fullModels ? maxT6 : 0;
    for (const ac of flying) {
      present.add(ac.id);
      const kind = modelKindFor(ac.type) === 'ct156' ? (fullLeft-- > 0 ? 'ct156' : 't6plain') : 'standin';
      const mesh = planeFor(ac, kind, options.paint ?? PAINT_DEFAULT);
      mesh.visible = true;
      const { bankRad, pitchRad } = attitudeOf(ac, attitude.update(ac.id, { t: options.time ?? 0, headingDeg: ac.headingDeg, kt: ac.kt, altFt: ac.alt }));
      applyPose(mesh, { x: ac.x, y: ac.y, altFt: ac.alt, headingDeg: ac.headingDeg, bankRad, pitchRad }, lengthFt);
      mesh.position.z += wheelLiftFt(lengthFt);

      const z = altToZ(ac.alt, ALT_SCALE);
      const groundZ = Math.min(floor, z);
      dropAt.setXYZ(n * 2, ac.x, ac.y, z);
      dropAt.setXYZ(n * 2 + 1, ac.x, ac.y, groundZ);
      n++;

      if (wantHeightLines) {
        let shadow = shadows.get(ac.id);
        if (!shadow) {
          shadow = new THREE.LineLoop(ringGeometry, shadowMaterial);
          shadow.frustumCulled = false;
          root.add(shadow);
          shadows.set(ac.id, shadow);
        }
        shadow.visible = true;
        shadow.position.set(ac.x, ac.y, groundZ);
        shadow.scale.set(120, 120, 1);
      }

      let ring = rings.get(ac.id);
      // Round the selected aircraft only (Patrick, 4 Oct).
      if (wantRings && ac.id === (scene.selectedAircraftId ?? null)) {
        if (!ring) {
          ring = new THREE.LineLoop(ringGeometry, ringMaterials.calm);
          ring.frustumCulled = false;
          root.add(ring);
          rings.set(ac.id, ring);
        }
        const level = levels.get(ac.id);
        ring.material = ringMaterials[level ?? 'calm'];
        ring.position.set(ac.x, ac.y, z);
        const radiusFt = ringRadiusFt(options.cautionLatFt, options.zoom);
        ring.scale.set(radiusFt, radiusFt, 1);
      } else if (ring) {
        ring.removeFromParent();
        rings.delete(ac.id);
      }
    }
    dropAt.needsUpdate = true;
    dropGeometry.setDrawRange(0, n * 2);
    if (drops.computeLineDistances) drops.computeLineDistances();
    dropCount = n;

    for (const [id, shadow] of shadows) {
      if (present.has(id) && wantHeightLines) continue;
      shadow.removeFromParent();
      shadows.delete(id);
    }

    if (options.outerTexture && options.layerPhoto !== false) {
      outerMesh.visible = true;
      if (outerMaterial.map !== options.outerTexture) {
        outerMaterial.map = options.outerTexture;
        outerMaterial.needsUpdate = true;
      }
      outerMaterial.opacity = (Number.isFinite(options.photoOpacityPct) ? options.photoOpacityPct : 100) / 100 * 0.95;
      outerMesh.position.set(0, 0, floor - 2.25);
    } else {
      outerMesh.visible = false;
    }

    if (photoMesh) {
      if (options.photoTexture && options.layerPhoto !== false) {
        photoMesh.visible = true;
        if (photoMaterial.map !== options.photoTexture) {
          photoMaterial.map = options.photoTexture;
          photoMaterial.needsUpdate = true;
        }
        photoMaterial.opacity = (Number.isFinite(options.photoOpacityPct) ? options.photoOpacityPct : 100) / 100;
        photoMesh.position.set(0, 0, floor - 2);
      } else {
        photoMesh.visible = false;
      }
    }

    if (options.midTexture && options.layerPhoto !== false) {
      midMesh.visible = true;
      if (midMaterial.map !== options.midTexture) {
        midMaterial.map = options.midTexture;
        midMaterial.needsUpdate = true;
      }
      midMaterial.opacity = (Number.isFinite(options.photoOpacityPct) ? options.photoOpacityPct : 100) / 100 * 0.97;
      midMesh.position.set(0, 0, floor - 1.75);
    } else {
      midMesh.visible = false;
    }
    patternMid.forEach(({ mesh, material, riverMaterial }, i) => {
      const texture = options.layerPhoto !== false ? options.patternMidTextures?.[i] : null;
      mesh.visible = !!texture;
      if (!texture) return;
      if (material.map !== texture) {
        material.map = texture;
        material.needsUpdate = true;
      }
      material.opacity = (Number.isFinite(options.photoOpacityPct) ? options.photoOpacityPct : 100) / 100 * 0.97;
      if (riverMaterial) {
        if (riverMaterial.map !== texture) {
          riverMaterial.map = texture;
          riverMaterial.needsUpdate = true;
        }
        riverMaterial.opacity = material.opacity;
      }
      mesh.position.set(PATTERN_MID_QUADS[i].x, PATTERN_MID_QUADS[i].y, floor - 1.75);
    });

    if (options.tightTexture && options.layerPhoto !== false) {
      tightMesh.visible = true;
      if (tightMaterial.map !== options.tightTexture) {
        tightMaterial.map = options.tightTexture;
        tightMaterial.needsUpdate = true;
      }
      tightMaterial.opacity = (Number.isFinite(options.photoOpacityPct) ? options.photoOpacityPct : 100) / 100;
      tightMesh.position.set(TIGHT_CENTER_FT.x, TIGHT_CENTER_FT.y, floor - 1.25);
    } else {
      tightMesh.visible = false;
    }

    if (coreMesh) {
      if (options.coreTexture && options.layerPhoto !== false) {
        coreMesh.visible = true;
        if (coreMaterial.map !== options.coreTexture) {
          coreMaterial.map = options.coreTexture;
          coreMaterial.needsUpdate = true;
        }
        coreMaterial.opacity = (Number.isFinite(options.photoOpacityPct) ? options.photoOpacityPct : 100) / 100;
        coreMesh.position.set(AIRFIELD_CORE_BOUNDS_FT.centerX, AIRFIELD_CORE_BOUNDS_FT.centerY, floor - 1.5);
      } else {
        coreMesh.visible = false;
      }
    }

    if (scenery) {
      scenery.visible = options.layerBuildings !== false;
      scenery.position.set(0, 0, floor - DEFAULT_FLOOR_FT);
    }
    baseBuildings.visible = options.layerBuildings !== false;
    baseBuildings.position.set(0, 0, floor);
    // Circuit landmarks: always on at every quality, same floor as the airfield scenery.
    landmarks.position.set(0, 0, floor - DEFAULT_FLOOR_FT);

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
      lastScene = scene;
      syncRoutes(scene.routes, options);
      syncAircraft(scene, options);
      syncPflGround(scene, options);
      updateWindsocks(windsocks, scene.windFromDeg, scene.windKt);
    },
    /** The canvas size in pixels, which the wide route lines are drawn against. */
    setResolution(width, height) {
      if (resolution.width === width && resolution.height === height) return;
      resolution.width = width;
      resolution.height = height;
      for (const have of routeLines.values()) {
        for (const line of [have.line, have.edge]) if (line?.material?.resolution) line.material.resolution.set(width, height);
      }
    },
    /** Where the glide rings are, for the labels: aircraft id -> { x, y, rFt }. */
    glideRingsNow() {
      return new Map([...glideRings].map(([id, ring]) => [id, { x: ring.position.x, y: ring.position.y, rFt: ring.scale.x }]));
    },
    /** The ground grid follows the view in whole steps, so it looks endless and still. */
    placeGrid(focus, groundFtNow) {
      grid.position.set(Math.round(focus.x / GRID_STEP_FT) * GRID_STEP_FT, Math.round(focus.y / GRID_STEP_FT) * GRID_STEP_FT, altToZ(groundFtNow, ALT_SCALE) - 40); // below the photo (which is at ground - 2), so the photo covers it
    },
    aircraftMesh: (id) => planes.get(id)?.mesh ?? null,
    ringOf: (id) => rings.get(id) ?? null,
    target(id) {
      if (id == null) {
        targetedId = null;
        return;
      }
      targetedId = id;
    },
    currentTarget() {
      if (!targetedId) return null;
      if (lastScene?.aircraft) {
        const ac = lastScene.aircraft.find((a) => a.id === targetedId);
        if (!ac || !isFlying(ac)) {
          const flying = lastScene.aircraft.filter(isFlying);
          if (flying.length === 0) {
            targetedId = null;
            return null;
          }
          const oldIndex = lastScene.aircraft.findIndex((a) => a.id === targetedId);
          let next = null;
          if (oldIndex !== -1) {
            for (let i = 1; i <= lastScene.aircraft.length; i++) {
              const candidate = lastScene.aircraft[(oldIndex + i) % lastScene.aircraft.length];
              if (isFlying(candidate)) {
                next = candidate;
                break;
              }
            }
          }
          targetedId = next ? next.id : flying[0].id;
        }
      }
      return targetedId;
    },
    nextTarget(direction = +1) {
      const flying = (lastScene?.aircraft ?? []).filter(isFlying);
      if (flying.length === 0) {
        targetedId = null;
        return null;
      }
      const cur = this.currentTarget();
      const idx = cur ? flying.findIndex((a) => a.id === cur) : -1;
      let nextIdx;
      if (idx === -1) {
        nextIdx = direction >= 0 ? 0 : flying.length - 1;
      } else {
        const step = direction >= 0 ? 1 : -1;
        nextIdx = (idx + step + flying.length) % flying.length;
      }
      targetedId = flying[nextIdx].id;
      return targetedId;
    },
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
      targetedId = null;
      lastScene = null;
      for (const have of routeLines.values()) freeRoute(have);
      routeLines.clear();
      for (const ring of glideRings.values()) ring.removeFromParent();
      glideRings.clear();
      glideMaterial.dispose();
      pflCircleGeometry.dispose();
      pflCircleMaterial.dispose();
      pflSpokeGeometry.dispose();
      pflSpokeMaterial.dispose();
      for (const { mesh } of planes.values()) disposeAircraftMesh(mesh);
      planes.clear();
      for (const ring of rings.values()) ring.removeFromParent();
      rings.clear();
      ringGeometry.dispose();
      for (const material of Object.values(ringMaterials)) material.dispose();
      dropGeometry.dispose();
      dropMaterial.dispose();
      dropCount = 0;
      for (const shadow of shadows.values()) shadow.removeFromParent();
      shadows.clear();
      shadowMaterial.dispose();
      coreGeometry.dispose();
      coreMaterial.dispose();
      if (scenery) {
        disposeAirfieldScenery(scenery);
        scenery.removeFromParent();
      }
      disposeBaseBuildings(baseBuildings);
      disposeLandmarks(landmarks);
      disposeWindsocks(windsocks);
      photoGeometry.dispose();
      photoMaterial.dispose();
      midGeometry.dispose();
      midMaterial.dispose();
      patternMidGeometry.dispose();
      patternMid.forEach(({ material, riverGeometry, riverMaterial }) => {
        material.dispose();
        riverGeometry?.dispose();
        riverMaterial?.dispose();
      });
      outerGeometry.dispose();
      outerMaterial.dispose();
      tightGeometry.dispose();
      tightMaterial.dispose();
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

// The models the view uses: the shared T-6 (the Harvard scheme by default) and the stand-in.
function defaultModels() {
  return {
    ct156: (THREE, { color, number, paint }) => createCt156Model(THREE, { color, number, paint, lengthFt: CT156_UNIT_LENGTH }),
    t6plain: (THREE, { color }) => createAircraftMesh(THREE, { color, outline: '#0b1620' }),
    standin: (THREE, { color, type }) => createStandInMesh(THREE, { color, outline: '#0b1620', kind: standInKindFor(type) }),
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
/** The dark edge round the 3D words, in pixels (was 3; thicker so they read on the photo). */
const LABEL_EDGE_PX = 4;
/** The ring round each 3D aircraft, in its colour: line width, the gap outside the drawn aircraft, and the smallest radius, in pixels. */
const LOCATOR_PX = 2;
const LOCATOR_GAP_PX = 5;
const LOCATOR_MIN_PX = 14;

function paintBaseAirfield(ctx) {
  ctx.fillStyle = '#243b2f';
  ctx.fillRect(0, 0, 1024, 1024);
  // Airfield perimeter / infield
  ctx.fillStyle = '#2d4839';
  ctx.beginPath();
  ctx.ellipse(512, 512, 220, 160, -0.4, 0, Math.PI * 2);
  ctx.fill();
  // Runways
  ctx.save();
  ctx.translate(512, 512);
  ctx.rotate(-0.5); // align with Runway 29L heading (~298° true)
  // Runway 29L / 11R
  ctx.fillStyle = '#182026';
  ctx.fillRect(-180, -12, 360, 24);
  // Runway 29R / 11L
  ctx.fillRect(-160, 32, 320, 20);
  // Runway 04 / 22 cross runway
  ctx.fillRect(-15, -140, 20, 280);
  // Threshold & centerline markings
  ctx.strokeStyle = '#e6edf3';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(-160, 0);
  ctx.lineTo(160, 0);
  ctx.stroke();
  ctx.restore();
}

/** Sun direction for the Traffic scene: a fixed mid-afternoon summer sun from the south-west, 45° above the horizon. */
export const SUN_AZIMUTH_DEG = 225;
export const SUN_ELEVATION_DEG = 45;

/**
 * Traffic's lighting: one warm DirectionalLight (sun) and one HemisphereLight (sky blue above, prairie brown below).
 * No shadow maps. MeshBasicMaterial (the satellite ground) ignores lights. World frame: X east, Y north, Z up.
 * Returns { hemisphere, sun, dispose() }; dispose() removes both from the scene and frees them.
 */
export function addTrafficLights(THREE, scene) {
  const hemisphere = new THREE.HemisphereLight('#bcd6f5', '#7a6646', 1.1);
  const sun = new THREE.DirectionalLight('#ffeccc', 2.4);
  sun.castShadow = false;
  const az = SUN_AZIMUTH_DEG * Math.PI / 180, el = SUN_ELEVATION_DEG * Math.PI / 180;
  sun.position.set(Math.sin(az) * Math.cos(el), Math.cos(az) * Math.cos(el), Math.sin(el)).multiplyScalar(1000);
  scene.add(hemisphere, sun, sun.target);
  return {
    hemisphere,
    sun,
    dispose() {
      scene.remove(hemisphere, sun, sun.target);
      hemisphere.dispose?.();
      sun.dispose?.();
    },
  };
}

/**
 * host: the element the view puts its canvases in (a box the size of the map). timers: the module's scheduler scope
 * (frame). source: { scene(): the scene map2d draws (routes with path, aircraft, conflicts), settings(): the Traffic
 * settings (paint, layers, caution distance), time(): the sim time in seconds }. onLost(): the graphics context was
 * lost, so 3D has been put away. onFacing(yawDeg, tiltDeg): the bearing up the picture or the camera's tilt from
 * straight down changed (Patrick, 4 Oct: the wind dial is drawn as the view shows the ground). win: for tests.
 * Returns { show, hide, requestDraw, camera, isChasing, stats, dispose }.
 */
export function createView3d({ host, timers, source, onLost = () => {}, onFacing = () => {}, win = globalThis }) {
  let THREE = null;
  let fatLines = null; // three's wide lines, loaded with three (loadFatLines); null draws thin lines
  let gl = null; // { canvas, labels, ctx, renderer, scene, camera, sky, kit, palette }
  let visible = false;
  let disposed = false;
  let loading = null;
  let token = 0; // counts shows and hides, so a late three.js load can't undo a later choice
  let pendingFrame = null;
  let resizer = null;
  let dragging = null;
  let drawn = 0;
  let lastFacing = null; // { yawDeg, tiltDeg } last reported to onFacing, whole degrees
  let averageMs = 0;
  let slowestMs = 0;
  let view = /** @type {{ center: { x: number, y: number, z: number }, cam: { yawDeg: number, pitchDeg: number, zoom: number, altScale: number } }} */ ({ center: { x: 0, y: 0, z: 0 }, cam: { yawDeg: 0, pitchDeg: PRESET_PITCH_DEG.fit, zoom: 20, altScale: ALT_SCALE } });
  let fitted = false; // the camera has been framed on the routes since 3D was first shown
  let wantPreset = null; // a camera button pressed before there was something to frame
  let follow = null; // { id, autoYaw }: the chase camera
  let chasePending = false; // Low chase was asked for with nothing flying: it starts on the first aircraft that does
  let viewMode = 'field'; // the Camera menu's choice: field (Over the field), fit, high, top, tower, low (Chase), cockpit or padlock
  let noteText = ''; // a short word in the 3D bar, such as why Cockpit fell back to Fit
  let cameraBar = null; // the 3D bar (camera-bar.js), made with the canvas and freed with it
  let coreCanvas = null;
  let coreTexture = null;
  let coreImagery = null;
  let coreDebounce = null;
  let coreAlign = null;

  /**
   * A ground tier: a square canvas of Esri tiles laid on a plane `span` feet across. One tile-layer draw takes at most
   * 64 tiles, so the square is drawn in split-by-split chunks. Same trim and offset as the 2D map's photo, so it lines up.
   * Three tiers stack (far 10+ miles soft, middle sharper, core sharpest) so the ground is sharp where you look.
   */
  function createTier({ span, px, maxZoom, split, cx = 0, cy = 0, debounceMs = 150, maxKept = undefined, transparent = false }) {
    const half = span / 2;
    const tier = { canvas: null, texture: null, imagery: null, debounce: null, align: null };
    function paint() {
      const { canvas, imagery, align } = tier;
      if (!canvas || !imagery || disposed || !gl) return;
      const anchor = source.anchor?.();
      const ctx = canvas.getContext?.('2d');
      if (!anchor || !ctx) return;
      const ref = makeLocalRef(anchor.lat, anchor.lon);
      ctx.fillStyle = '#243b2f';
      if (transparent) ctx.clearRect(0, 0, px, px); else ctx.fillRect(0, 0, px, px);
      const step = span / split;
      for (let i = 0; i < split; i++) {
        for (let j = 0; j < split; j++) {
          const q = { minX: cx - half + i * step, maxX: cx - half + (i + 1) * step, minY: cy - half + j * step, maxY: cy - half + (j + 1) * step };
          const fake = {
            view: { scale: px / span },
            visibleBounds: () => q,
            worldToScreen: (wx, wy) => [((wx - cx + half) / span) * px, ((cy + half - wy) / span) * px],
          };
          imagery.draw(ctx, photoView(fake, ref, align));
        }
      }
      if (tier.texture) tier.texture.needsUpdate = true;
      requestDraw();
    }
    tier.ensure = (options) => {
      if (options.layerPhoto === false || !source.anchor?.() || win.document?.createElement === undefined) return null;
      const next = photoAlignment(options);
      const changed = tier.align && JSON.stringify(tier.align) !== JSON.stringify(next);
      tier.align = next;
      if (!tier.canvas) {
        tier.canvas = win.document.createElement('canvas');
        tier.canvas.width = px;
        tier.canvas.height = px;
        const ctx = tier.canvas.getContext?.('2d');
        if (ctx) {
          ctx.fillStyle = '#243b2f';
          if (transparent) ctx.clearRect(0, 0, px, px); else ctx.fillRect(0, 0, px, px);
        }
        tier.texture = new THREE.CanvasTexture(tier.canvas);
        tier.texture.anisotropy = 8;
      }
      if (!tier.imagery) {
        tier.imagery = createTileLayer({
          source: { ...ESRI_IMAGERY, maxZoom }, maxKept,
          timers,
          onChange: () => {
            if (disposed || !gl) return;
            if (tier.debounce) timers.clearTimeout?.(tier.debounce);
            tier.debounce = timers.after(debounceMs, () => {
              tier.debounce = null;
              paint();
            });
          },
        });
        paint();
      } else if (changed) {
        paint();
      }
      return tier.texture;
    };
    tier.dispose = () => {
      if (tier.debounce) timers.clearTimeout?.(tier.debounce);
      tier.debounce = null;
      tier.imagery?.dispose();
      tier.imagery = null;
      tier.texture?.dispose();
      tier.texture = null;
      tier.canvas = null;
    };
    return tier;
  }
  const outerTier = createTier({ span: OUTER_PHOTO_SPAN_FT, px: 2048, maxZoom: 11, split: 2 }); // 30 NM each way, softest
  // 10+ miles each way; 2,048 px (about 52 ft a pixel), as it is only seen far off (TR-71: was 4,096, about 65 MB more)
  const farTier = createTier({ span: PHOTO_SPAN_FT, px: 2048, maxZoom: 12, split: 3 });
  const midTier = createTier({ span: MID_SPAN_FT, px: 4096, maxZoom: 15, split: 3 }); // about 3 miles each way
  const ensurePhotoTexture = (options) => farTier.ensure(options);
  const tightTier = createTier({ span: TIGHT_SPAN_FT, px: 6144, maxZoom: 18, split: 4, cx: TIGHT_CENTER_FT.x, cy: TIGHT_CENTER_FT.y, debounceMs: 700, maxKept: 900, transparent: true });
  const ensureMidTexture = (options) => midTier.ensure(options);
  const patternMidTiers = PATTERN_MID_QUADS.map((q) => createTier({ span: PATTERN_MID_SPAN_FT / 2, px: 4096, maxZoom: 15, split: 3, cx: q.x, cy: q.y }));
  /** The middle ground for this quality: High the pattern-wide squares, Performance today's 30,000 ft square. The other one is let go, to free its memory. */
  function ensureMiddle(options, isLow) {
    if (isLow) {
      patternMidTiers.forEach((t) => { if (t.canvas) t.dispose(); });
      return { midTex: ensureMidTexture(options), patternMidTextures: null };
    }
    if (midTier.canvas) midTier.dispose();
    return { midTex: null, patternMidTextures: patternMidTiers.map((t) => t.ensure(options)) };
  }
  const ensureTightTexture = (options) => tightTier.ensure(options);

  function ensureCoreTexture(options) {
    if (options.layerPhoto === false || !source.anchor?.() || win.document?.createElement === undefined) return null;
    const anchor = source.anchor();
    if (!anchor) return null;
    const nextAlign = photoAlignment(options);
    const alignChanged = coreAlign && JSON.stringify(coreAlign) !== JSON.stringify(nextAlign);
    coreAlign = nextAlign;

    if (!coreCanvas) {
      coreCanvas = win.document.createElement('canvas');
      coreCanvas.width = 4096;
      coreCanvas.height = 4096;
      const ctx = coreCanvas.getContext?.('2d');
      if (ctx) paintCoreAirfieldVector(ctx, { width: 4096, height: 4096, bounds: AIRFIELD_CORE_BOUNDS_FT });
      coreTexture = new THREE.CanvasTexture(coreCanvas);
      coreTexture.anisotropy = 8;
    }

    function paintCorePhoto() {
      if (!coreCanvas || disposed || !gl) return;
      const ctx = coreCanvas.getContext?.('2d');
      if (!ctx) return;
      // Offline fallback first; satellite tiles paint over it as they arrive.
      paintCoreAirfieldVector(ctx, { width: coreCanvas.width, height: coreCanvas.height, bounds: AIRFIELD_CORE_BOUNDS_FT });
      if (coreImagery && anchor) {
        const ref = makeLocalRef(anchor.lat, anchor.lon);
        const B = AIRFIELD_CORE_BOUNDS_FT;
        const cw = coreCanvas.width;
        const ch = coreCanvas.height;
        // Same trim and offset as the 2D map, so the picture lines up with the routes and the runways.
        // Drawn in quarters: the whole box is more than the 64 tiles one draw allows.
        const halfW = B.width / 2;
        const halfH = B.height / 2;
        for (let i = 0; i < 2; i++) {
          for (let j = 0; j < 2; j++) {
            const q = { minX: B.minX + i * halfW, maxX: B.minX + (i + 1) * halfW, minY: B.minY + j * halfH, maxY: B.minY + (j + 1) * halfH };
            const fake = {
              view: { scale: cw / B.width },
              visibleBounds: () => q,
              worldToScreen: (wx, wy) => [((wx - B.minX) / B.width) * cw, ((B.maxY - wy) / B.height) * ch],
            };
            coreImagery.draw(ctx, photoView(fake, ref, coreAlign));
          }
        }
      }
      if (coreTexture) coreTexture.needsUpdate = true;
      requestDraw();
    }

    if (!coreImagery) {
      coreImagery = createTileLayer({
        source: { ...ESRI_IMAGERY, maxZoom: 16 },
        timers,
        onChange: () => {
          if (disposed || !gl) return;
          if (coreDebounce) timers.clearTimeout?.(coreDebounce);
          coreDebounce = timers.after(150, () => {
            coreDebounce = null;
            paintCorePhoto();
          });
        },
      });
      paintCorePhoto();
    } else if (alignChanged) {
      paintCorePhoto();
    }

    return coreTexture;
  }
  /** Lets the core picture go (High: the sharp square and the pattern squares already cover it), to free its memory. */
  function releaseCore() {
    if (coreDebounce) timers.clearTimeout?.(coreDebounce);
    coreDebounce = null;
    coreImagery?.dispose();
    coreImagery = null;
    coreTexture?.dispose();
    coreTexture = null;
    coreCanvas = null;
    coreAlign = null;
  }

  const sizeOf = (canvas) => ({ width: Math.max(1, canvas.clientWidth), height: Math.max(1, canvas.clientHeight) });

  function build() {
    const canvas = win.document.createElement('canvas');
    canvas.className = 'traffic-map3d';
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', '3D view of the traffic. Drag or press the arrow keys to turn it, scroll or press + and − to zoom, or use the camera buttons.');
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
    const lights = addTrafficLights(THREE, scene);
    const sky = addSky(THREE, scene);
    const kit = createSceneKit(THREE, { fatLines });
    scene.add(kit.root);
    const style = win.getComputedStyle?.(canvas);
    const palette = paletteFrom((name) => style?.getPropertyValue(name).trim() ?? '');
    gl = { canvas, labels, ctx: labels.getContext('2d'), renderer, scene, camera, sky, lights, kit, palette };
    if (win.__traffic3dLeakCheck) probeMemory(renderer, camera);
    for (const [type, fn] of hands) canvas.addEventListener(type, fn, type === 'wheel' ? { passive: false } : undefined);
    canvas.addEventListener('webglcontextlost', contextLost);
    cameraBar = createCameraBar({
      onView: (id) => api.preset(id),
      onFollow: (id) => setTarget(id),
      onQuality: setGraphicsQuality,
    });
    host.append(cameraBar.element);
  }

  /**
   * The bar's High | Performance switch writes the graphicsQuality setting through source.setSettings (the Traffic
   * screen gives it). Without it, it falls back to a Graphics box on the page, if there is one.
   */
  function setGraphicsQuality(quality) {
    if (source.setSettings) source.setSettings({ graphicsQuality: quality });
    else {
      const doc = win.document;
      const label = [...(doc?.querySelectorAll?.('label') ?? [])].find((l) => l.textContent.trim() === 'Graphics' && l.getAttribute('for'));
      const box = /** @type {HTMLSelectElement | null} */ (label ? doc.getElementById(label.getAttribute('for')) : null);
      if (box) {
        const index = [...box.options].findIndex((o) => (quality === 'low' ? /^Performance/ : /^High/).test(o.textContent.trim()));
        if (index !== -1) {
          box.value = String(box.options[index].value);
          box.dispatchEvent(new win.Event('change'));
        }
      }
    }
    requestDraw();
  }

  // For the leak check (tests only, set from a test page): draws one Harvard on its own and disposes it, then notes what the
  // renderer counts (data-gpu-base). teardown() writes the count again after the view has freed everything it made; the two must
  // be the same. Whatever three.js keeps for itself once it has drawn such a material is in both, so nothing is hard-coded.
  function probeMemory(renderer, camera) {
    const probeScene = new THREE.Scene();
    const probe = createCt156Model(THREE, { color: '#7ee787', number: '1', paint: PAINT_DEFAULT, lengthFt: T6_LENGTH_FT });
    probe.traverse((o) => { o.frustumCulled = false; }); // drawn even though the camera is elsewhere
    probeScene.add(probe);
    // A picture as the background, like the sky's: three.js makes itself a plane to draw it on, and keeps that plane until the renderer goes.
    const backdrop = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    backdrop.needsUpdate = true;
    probeScene.background = backdrop;
    renderer.render(probeScene, camera);
    probeScene.background = null;
    backdrop.dispose();
    probeScene.remove(probe);
    disposeAircraftMesh(probe);
    const { memory } = renderer.info;
    host.dataset.gpuBase = `${memory.geometries},${memory.textures}`;
  }

  function contextLost(e) {
    e.preventDefault();
    teardown({ lost: true });
    onLost();
  }

  // `lost`: the browser has already lost the graphics context, so it is not asked to lose it again (that logs a warning).
  function teardown({ lost = false } = {}) {
    win.removeEventListener?.('keydown', onWindowKeydown);
    stopFrame();
    visible = false;
    resizer?.disconnect();
    resizer = null;
    dragging = null;
    if (!gl) return;
    const { canvas, labels, renderer, kit, sky, lights } = gl;
    for (const [type, fn] of hands) canvas.removeEventListener(type, fn);
    canvas.removeEventListener('webglcontextlost', contextLost);
    cameraBar?.dispose();
    cameraBar = null;
    gl = null;
    kit.dispose();
    sky.dispose();
    lights.dispose();
    outerTier.dispose();
    farTier.dispose();
    midTier.dispose();
    patternMidTiers.forEach((t) => t.dispose());
    tightTier.dispose();
    releaseCore();
    // What three.js still counts on the graphics card, for the leak check (data-gpu; see probeMemory): the ui-kit's T-6 frees
    // everything it made and so does the view, so this is what three.js keeps for itself, the same as after one Harvard.
    const { memory } = renderer.info;
    host.dataset.gpu = `${memory.geometries},${memory.textures}`;
    renderer.dispose();
    if (!lost) renderer.forceContextLoss?.();
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
    const data = source.scene();
    const options = source.settings();
    const isLow = options.graphicsQuality === 'low';

    // Sizes are set only when they change: writing a canvas's width, even to the same number, clears it and
    // rebuilds its drawing buffer. Floor, as three.js does.
    const maxRatio = isLow ? 1 : 2;
    const ratio = Math.min(win.devicePixelRatio || 1, maxRatio);
    if (renderer.getPixelRatio() !== ratio) renderer.setPixelRatio(ratio);
    const [w, h] = [Math.floor(size.width * ratio), Math.floor(size.height * ratio)];
    if (canvas.width !== w || canvas.height !== h) renderer.setSize(size.width, size.height, false);
    if (labels.width !== w || labels.height !== h) {
      labels.width = w;
      labels.height = h;
    }

    const floor = groundFt(data.routes);
    const box = sceneBox(data.routes, data.aircraft);

    if (box && (!fitted || wantPreset)) {
      const name = wantPreset ?? 'field'; // 3D opens over the field (Patrick, 4 Oct 10:17Z); the buttons and menu still choose
      wantPreset = null;
      fitted = true;
      chasePending = false;
      viewMode = name;
      noteText = '';
      if (name === 'low') startChase(data, box, size);
      else if (name === 'field') {
        follow = null;
        view = fieldCamera(size);
      } else if (name === 'top') {
        follow = null;
        view = topDownCamera(box, size);
      } else if (POV_VIEWS.has(name)) {
        if (follow && !data.aircraft.some((a) => a.id === follow.id && isFlying(a))) fallbackTarget(data);
        const target = follow ? data.aircraft.find((a) => a.id === follow.id && isFlying(a)) : null;
        if (!target && NEEDS_AIRCRAFT.has(name)) {
          viewMode = 'fit';
          follow = null;
          view = cameraFor('fit', box, size);
          noteText = `${name === 'cockpit' ? 'Cockpit' : 'Padlock'} needs an aircraft: choose one in Follow, or press ].`;
        } else {
          view = povCamera(name, target, size, floor);
          if (follow) follow.autoYaw = false;
        }
      } else {
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
    if (follow && POV_VIEWS.has(viewMode)) {
      const target = data.aircraft.find((a) => a.id === follow.id && isFlying(a)) ?? fallbackTarget(data);
      if (target) {
        const next = povCamera(viewMode, target, size, floor);
        // The person's zoom is kept; the look follows the aircraft unless they are turning the view by hand.
        view = { center: next.center, cam: dragging ? view.cam : { ...next.cam, zoom: view.cam.zoom } };
      }
    } else if (follow) followAircraft(data);
    cameraBar?.setView(viewMode);
    cameraBar?.update({ flying: data.aircraft.filter(isFlying).map((a) => a.id), followId: follow?.id ?? null, quality: options.graphicsQuality });
    cameraBar?.setNote(noteText);
    const shown = dragging?.isPan ? view.cam : (dragging?.cam ?? view.cam);
    const focus = dragging?.isPan ? dragging.center : view.center;

    const photoTex = ensurePhotoTexture(options);
    const outerTex = outerTier.ensure(options);
    const { midTex, patternMidTextures } = ensureMiddle(options, isLow);
    const tightTex = isLow ? null : ensureTightTexture(options);
    // The core airfield picture (4,096 px) only on Performance: on High the sharp square (zoom 18) covers the field and the
    // pattern squares (zoom 15) the rest of the core box, so it would only cost about 85 MB of graphics memory (TR-71).
    if (!isLow && coreCanvas) releaseCore();
    const coreTex = isLow ? ensureCoreTexture(options) : null;
    kit.sync(data, {
      paint: options.paint,
      graphicsQuality: options.graphicsQuality,
      layerCautionRings: options.layerCautionRings,
      cautionLatFt: options.cautionLatFt,
      aircraftScale: options.aircraftScale,
      zoom: shown.zoom, groundFt: floor, time: source.time(),
      fullModels: options.fullModels ?? true,
      layerHeightLines: options.layerHeightLines !== false,
      layerEngineReach: options.layerEngineReach,
      layerWindTrack: options.layerWindTrack,
      layerSmmReference: options.layerSmmReference,
      layerPflCircle: options.layerPflCircle,
      layerPhoto: options.layerPhoto,
      photoTexture: photoTex,
      outerTexture: outerTex,
      midTexture: midTex,
      patternMidTextures,
      tightTexture: tightTex,
      coreTexture: coreTex,
      photoOpacityPct: options.photoOpacityPct,
    });
    kit.placeGrid(focus, floor);
    kit.setResolution(size.width, size.height);
    matchProjection(THREE, camera, focus, shown, size, 1);
    const facing = { yawDeg: Math.round(finite(shown.yawDeg)), tiltDeg: Math.round(finite(shown.pitchDeg)) };
    if (facing.yawDeg !== lastFacing?.yawDeg || facing.tiltDeg !== lastFacing?.tiltDeg) { lastFacing = facing; onFacing(facing.yawDeg, facing.tiltDeg); }
    renderer.render(threeScene, camera);
    drawLabels(ctx, labels, size, ratio, data, options, palette, { zoom: shown.zoom, floor });

    drawn++;
    const ms = (win.performance?.now() ?? 0) - started;
    averageMs += (ms - averageMs) * 0.1;
    slowestMs = Math.max(slowestMs * 0.98, ms);
    canvas.dataset.draws = String(drawn);
    canvas.dataset.drawMs = averageMs.toFixed(2);
    canvas.dataset.calls = String(renderer.info.render.calls); // draw calls and triangles of the last frame, for finding what a slow frame costs
    canvas.dataset.triangles = String(renderer.info.render.triangles);
    canvas.dataset.planePx = String(Math.round(planePx(shown.zoom))); // how long an aircraft is drawn; over FULL_MODEL_PX the T-6s are the full Harvard model
  }

  // The callsigns and, with the layer on, heights and speeds, written over the picture; a word for a conflict too (colour is never the only signal).
  // A ring in the aircraft's colour round each one, and a thick dark edge on the words, so they stand out on the photo
  // (Patrick, 4 Oct 10:55Z). With the PFL layer on, the keys and each PFL aircraft's glide distance are named as on the map.
  function drawLabels(ctx, labelCanvas, size, ratio, data, options, palette, { zoom = 20, floor = 0 } = {}) {
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    const levels = conflictLevels(data.conflicts ?? []);
    const camera = gl.camera;
    ctx.lineJoin = 'round';
    ctx.textBaseline = 'alphabetic';
    const write = (text, x, y, colour, bold = false, px = 12) => {
      ctx.font = `${bold ? '700 ' : ''}${px}px ${FONT}`;
      ctx.lineWidth = LABEL_EDGE_PX;
      ctx.strokeStyle = palette.halo;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = colour;
      ctx.fillText(text, x, y);
    };
    const screenOf = (x, y, alt) => worldToScreen(THREE, camera, { x, y, z: altToZ(alt, ALT_SCALE) }, size.width, size.height);
    const onScreen = (p, margin = 50) => p.x > -margin && p.y > -margin && p.x < size.width + margin && p.y < size.height + margin;

    if (options.layerPflCircle !== false) {
      const layout = pflCircleLayout();
      /** @type {Array<[{ x: number, y: number }, string, string]>} */
      const keys = [
        [layout.highKey, "HIGH KEY (5,000' MSL)", PFL_CIRCLE_COLOR],
        [layout.lowKey, "LOW KEY (3,700' MSL)", PFL_SPOKE_COLOR],
        [layout.finalKey, "FINAL KEY (3,000' MSL)", GLIDE_RING_COLOR],
      ];
      ctx.textAlign = 'center';
      for (const [pt, words, colour] of keys) {
        const p = screenOf(pt.x, pt.y, floor + GROUND_LINE_LIFT_FT);
        if (onScreen(p)) write(words, p.x, p.y - 6, colour, true, 11);
      }
      for (const [, ring] of gl.kit.glideRingsNow()) {
        const p = screenOf(ring.x, ring.y + ring.rFt, floor + GROUND_LINE_LIFT_FT);
        if (onScreen(p)) write(`PFL GLIDE (${(ring.rFt / FT_PER_NM).toFixed(1)} NM)`, p.x, p.y - 6, GLIDE_RING_COLOR, true, 11);
      }
    }

    const planeRadiusPx = Math.max(LOCATOR_MIN_PX, (planeLengthFt(zoom, options.aircraftScale) * zoom) / 1000 / 2 + LOCATOR_GAP_PX);
    for (const ac of data.aircraft) {
      if (!isFlying(ac)) continue;
      const p = screenOf(ac.x, ac.y, ac.alt);
      if (!onScreen(p)) continue;
      const colour = aircraftColor(ac);
      // The locator circle: round the selected aircraft only (Patrick, 4 Oct: "the default to be no circles anywhere,
      // and when you click an aircraft THAT aircraft has a green circle").
      if (ac.id === (data.selectedAircraftId ?? null)) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, planeRadiusPx, 0, Math.PI * 2);
        ctx.lineWidth = LOCATOR_PX + 2;
        ctx.strokeStyle = palette.halo;
        ctx.stroke();
        ctx.lineWidth = LOCATOR_PX;
        ctx.strokeStyle = colour;
        ctx.stroke();
      }
      ctx.textAlign = p.x + 160 > size.width ? 'right' : 'left';
      const x = ctx.textAlign === 'left' ? p.x + planeRadiusPx + 4 : p.x - planeRadiusPx - 4;
      write(ac.id, x, p.y - 6, colour, true, 13);
      if (options.layerLabels) write(heightSpeedText(ac), x, p.y + 8, palette.text, false, 12);
      const level = levels.get(ac.id);
      if (level) write(LEVEL_MARKS[level], x, p.y + 22, level === 'conflict' ? palette.bad : palette.caution, true);
      // The PFL tag, its decision and configuration, as on the map (TR-R35).
      const pfl = getPflBadge(ac);
      if (pfl) write(pfl, x, p.y + (level ? 36 : options.layerLabels ? 22 : 8), pfl === '[CRASH SHORT]' ? palette.bad : GLIDE_RING_COLOR, true, 12);
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

  function fallbackTarget(data) {
    if (!follow) return null;
    const flying = (data.aircraft ?? []).filter(isFlying);
    if (flying.length === 0) {
      follow = null;
      chasePending = false;
      return null;
    }
    const oldIndex = (data.aircraft ?? []).findIndex((a) => a.id === follow.id);
    let next = null;
    if (oldIndex !== -1 && data.aircraft.length > 0) {
      for (let i = 1; i <= data.aircraft.length; i++) {
        const candidate = data.aircraft[(oldIndex + i) % data.aircraft.length];
        if (isFlying(candidate)) {
          next = candidate;
          break;
        }
      }
    }
    if (!next) next = flying[0];
    follow.id = next.id;
    return next;
  }

  // The chase camera stays on its aircraft; when that one lands or is gone it moves to the next one flying, or lets go.
  function followAircraft(data) {
    let target = data.aircraft.find((a) => a.id === follow.id && isFlying(a));
    if (!target) {
      target = fallbackTarget(data);
      if (!target) return;
    }
    view.center = { x: target.x, y: target.y, z: finite(target.alt) };
    if (follow.autoYaw) view.cam = { ...view.cam, yawDeg: swingTo(view.cam.yawDeg, wrapDeg(target.headingDeg), CHASE_LERP) };
  }

  function setTarget(id) {
    if (id == null) {
      follow = null;
      chasePending = false;
      gl?.kit?.target?.(null);
      requestDraw();
      return;
    }
    follow = { id, autoYaw: true };
    chasePending = false;
    gl?.kit?.target?.(id);
    const data = source.scene?.() ?? { routes: [], aircraft: [] };
    const ac = data.aircraft?.find((a) => a.id === id && isFlying(a));
    if (ac) {
      const size = gl?.canvas ? sizeOf(gl.canvas) : { width: 900, height: 600 };
      if (POV_VIEWS.has(viewMode)) {
        follow.autoYaw = false;
        view = povCamera(viewMode, ac, size, groundFt(data.routes ?? []));
      } else {
        viewMode = 'low';
        view = chaseCamera(ac, size);
      }
      noteText = '';
    }
    requestDraw();
  }

  function currentTarget() {
    if (!follow) return null;
    const data = source.scene?.();
    if (data?.aircraft) {
      const ac = data.aircraft.find((a) => a.id === follow.id);
      if (!ac || !isFlying(ac)) {
        fallbackTarget(data);
      }
    }
    return follow?.id ?? null;
  }

  function nextTarget(direction = +1) {
    const data = source.scene?.() ?? { routes: [], aircraft: [] };
    const flying = (data.aircraft ?? []).filter(isFlying);
    if (flying.length === 0) {
      setTarget(null);
      return null;
    }
    const currentId = currentTarget();
    const currentIndex = currentId ? flying.findIndex((a) => a.id === currentId) : -1;
    let nextIndex;
    if (currentIndex === -1) {
      nextIndex = direction >= 0 ? 0 : flying.length - 1;
    } else {
      const step = direction >= 0 ? 1 : -1;
      nextIndex = (currentIndex + step + flying.length) % flying.length;
    }
    const nextAc = flying[nextIndex];
    setTarget(nextAc.id);
    return nextAc.id;
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

  // ---- the person's hands: drag to turn and tilt, wheel or + and - to zoom, pan with right/middle/shift-drag ----
  const endDrag = (e) => {
    if (!dragging || e.pointerId !== dragging.id) return;
    if (dragging.isPan) {
      view = { ...view, center: dragging.center };
    } else {
      view = { ...view, cam: dragging.cam };
    }
    dragging = null;
    gl?.canvas.classList.remove('is-dragging', 'is-panning');
  };
  const zoomTo = (deltaY) => {
    view = { ...view, cam: zoomBy(view.cam, deltaY) };
    requestDraw();
  };
  function onWindowKeydown(e) {
    if (!visible || !gl || disposed) return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === '[') {
      e.preventDefault();
      nextTarget(-1);
    } else if (e.key === ']') {
      e.preventDefault();
      nextTarget(1);
    }
  }

  const hands = /** @type {[string, (e: any) => void][]} */ ([
    ['pointerdown', (e) => {
      if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
      const isPan = e.button === 1 || e.button === 2 || e.shiftKey;
      dragging = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        cam: view.cam,
        center: { ...view.center },
        isPan,
      };
      gl.canvas.setPointerCapture?.(e.pointerId);
      gl.canvas.classList.add(isPan ? 'is-panning' : 'is-dragging');
    }],
    ['pointermove', (e) => {
      if (!dragging || e.pointerId !== dragging.id) return;
      const dx = e.clientX - dragging.x;
      const dy = e.clientY - dragging.y;
      if (dragging.isPan) {
        if (follow) follow = null; // user panned: detach chase
        dragging.center = panCamera(dragging.center, view.cam, dx, dy);
        view.center = dragging.center;
      } else {
        dragging.cam = orbit(dragging.cam, dx, dy);
        if (follow) follow.autoYaw = false; // turned by hand: the chase camera stops swinging behind
      }
      dragging.x = e.clientX;
      dragging.y = e.clientY;
      requestDraw();
    }],
    ['pointerup', endDrag],
    ['pointercancel', endDrag],
    ['contextmenu', (e) => {
      e.preventDefault();
    }],
    ['wheel', (e) => {
      e.preventDefault();
      if (e.deltaY) zoomTo(e.deltaY);
    }],
    ['keydown', (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === '[') {
        e.preventDefault();
        nextTarget(-1);
        return;
      }
      if (e.key === ']') {
        e.preventDefault();
        nextTarget(1);
        return;
      }
      const turn = KEY_ORBIT_PX[e.key];
      if (turn) {
        e.preventDefault();
        if (e.shiftKey) {
          if (follow) follow = null;
          view = { ...view, center: panCamera(view.center, view.cam, -turn[0], -turn[1]) };
        } else {
          if (follow) follow.autoYaw = false;
          view = { ...view, cam: orbit(view.cam, turn[0], turn[1]) };
        }
        requestDraw();
        return;
      }
      const deltaY = e.key === '+' || e.key === '=' ? -1 : e.key === '-' || e.key === '_' ? 1 : 0;
      if (!deltaY) return;
      e.preventDefault();
      zoomTo(deltaY);
    }],
  ]);

  const api = {
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
            fatLines = await loadFatLines();
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
      if (win.addEventListener) {
        win.removeEventListener('keydown', onWindowKeydown);
        win.addEventListener('keydown', onWindowKeydown);
      }
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
    /** A camera view by id ('fit', 'high', 'low', … as camera-views.js lists them). Done at the next frame, when the size is known. */
    preset(name) {
      wantPreset = name;
      requestDraw();
    },
    isChasing: () => follow !== null,
    /** The Camera menu's current view id (fit, high, top, tower, low, cockpit, padlock) and any note beside it. */
    cameraView: () => ({ view: viewMode, note: noteText }),
    /** The bearing up the picture and the camera's tilt at the last frame, whole degrees ({ 0, 0 } before any). */
    facing: () => lastFacing ?? { yawDeg: 0, tiltDeg: 0 },
    target: setTarget,
    currentTarget,
    nextTarget,
    stats: () => ({
      loaded: gl !== null, visible, drawn, pending: pendingFrame !== null, averageMs, slowestMs,
      geometries: gl?.renderer.info.memory.geometries ?? 0, textures: gl?.renderer.info.memory.textures ?? 0,
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      win.removeEventListener?.('keydown', onWindowKeydown);
      token++;
      teardown();
    },
  };
  return api;
}
