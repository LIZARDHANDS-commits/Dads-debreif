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
import { T6_LENGTH_FT, CLOSE_UP_DRAW_FT } from './types.js';
import { paletteFrom, conflictLevels, isFlying, aircraftColor, heightSpeedText, LEVEL_MARKS, MIN_RING_PX, photoAlignment, photoView, getPflBadge, pflCircleLayout, calculateGlideFootprint, shouldShowGlideFootprint } from './map2d.js';
import { createTileLayer, ESRI_IMAGERY } from '../../ui-kit/map-tiles.js';
import { makeLocalRef, latLonToLocalFt } from '../../core/geo.js';
import { createAirfieldScenery, disposeAirfieldScenery, DEFAULT_FLOOR_FT, RUNWAY_TOP_FT } from './scenery3d.js';
import { createLandmarks, disposeLandmarks, createWindsocks, updateWindsocks, disposeWindsocks } from './landmarks3d.js';
import { createBaseBuildings, disposeBaseBuildings } from './base-buildings3d.js';
import { createRiverGeometry } from './rivers3d.js';
import { ejectionAt, EJECTION } from './ejection.js';
import { trueAltFt } from './weather.js';
import { createEjectionModel, poseEjectionModel, disposeEjectionModel } from './ejection3d.js';
import { approachMarks, createApproachMarks, updateApproachMarks, disposeApproachMarks } from './approach3d.js';
import { AIRFIELD_CORE_BOUNDS_FT, paintCoreAirfieldVector, getCoreCorners, getOptimalCoreTileZoom } from './airfield-core-ground.js';
import { fieldCamera, topDownCamera, towerCamera, cockpitCamera, padlockCamera, NEEDS_AIRCRAFT, RWY_29L_THRESHOLD, towerFree, freeAim, freeLookVector, freeStepFt, moveFree, turnFree, FREE_MIN_AGL_FT } from './camera-views.js';
import { createCameraBar } from './camera-bar.js';

/** The viewpoints worked out from an aircraft each frame, rather than framed once. */
const POV_VIEWS = new Set(['cockpit', 'padlock']);
/** The free-flying perspective camera, and Tower, which starts it in the cab (TR-92). */
const FREE_VIEWS = new Set(['tower', 'free']);

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
// Chase looks 10° below level (an estimate): with the perspective camera that keeps the horizon in the picture.
export const PRESET_PITCH_DEG = Object.freeze({ fit: 45, high: 20, low: 80 });
/** How much ground the chase camera shows across the screen, in feet. */
const CHASE_SPAN_FT = 3000;
const CHASE_LERP = 0.15; // how fast the chase camera swings behind a turning aircraft, a share of the gap each frame

/** Real length of a T-6 in feet (kept in types.js). A zoomed-out aircraft is drawn bigger, so it can still be seen. */
export { T6_LENGTH_FT, CLOSE_UP_DRAW_FT };
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

/** Feet an aircraft is drawn at, at a zoom (pixels to 1,000 ft): CLOSE_UP_DRAW_FT (half the runway width, Patrick 5 Oct), or MIN_PLANE_PX if that is smaller on screen, times the Aircraft size setting. */
export function planeLengthFt(zoom, scale = 1) {
  return Math.max(CLOSE_UP_DRAW_FT, MIN_PLANE_PX / (zoom / 1000)) * (Number(scale) > 0 ? Number(scale) : 1);
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

/**
 * Cockpit and Chase are drawn with a true perspective camera (Patrick, 6 Oct 06:07Z, card "Build now"): nearer is
 * bigger, so the runway's shape on final changes with the glide angle as a pilot sees it. Every other view stays
 * orthographic. 60° across is a natural field of view (an estimate); nothing nearer than 1 ft is drawn (with a logarithmic depth buffer, TR-96), so the far
 * ground stays steady; the haze starts at 12,000 ft and is full at 45,000 ft, short of where the photo ends (estimates).
 */
export const PERSPECTIVE = Object.freeze({ fovAcrossDeg: 60, nearFt: 1, farFt: 400_000, hazeFromFt: 12_000, hazeToFt: 45_000 });
/**
 * The pilot's eye in Cockpit: this far above the drawn model's middle along its top, and never lower than this over the
 * ground, ft (estimates: about a T-6 pilot's eye height on the runway; TR-96), so the view never goes under the photo.
 */
export const COCKPIT_EYE = Object.freeze({ aboveModelFt: 3, leastAglFt: 8 });
/** The views drawn in perspective. */
export const PERSPECTIVE_VIEWS = Object.freeze(new Set(['cockpit', 'low', 'padlock']));
/**
 * Looking up (Patrick, 6 Oct 06:26Z; TR-92). Chase may tilt to 60° above level (150° from straight down); its eye is
 * kept at least CHASE_MIN_AGL_FT over the ground. In Cockpit the head turns 160° either way, up 80° and down 60° from
 * the nose (estimates for a pilot's head in the seat); C brings it back to the nose.
 */
export const CHASE_PITCH_DEG = Object.freeze([0, 150]);
export const CHASE_MIN_AGL_FT = 10;
export const HEAD_LOOK_DEG = Object.freeze({ yaw: [-160, 160], pitch: [-60, 80] });
/** Free camera keys: W/S forward and back along the look, A/D sideways, R/F up and down (shift moves four times as far). */
const FREE_MOVE_KEYS = Object.freeze({ w: { forward: 1 }, s: { forward: -1 }, d: { right: 1 }, a: { right: -1 }, r: { up: 1 }, f: { up: -1 } });

/** The vertical field of view, in degrees, that gives PERSPECTIVE.fovAcrossDeg across a canvas of `size` (never more than that). */
export function perspectiveFovDeg(size) {
  const across = rad(PERSPECTIVE.fovAcrossDeg / 2);
  const tall = Math.max(size.height, 1) / Math.max(size.width, 1);
  return Math.min(PERSPECTIVE.fovAcrossDeg, 2 * deg(Math.atan(Math.tan(across) * tall)));
}

/**
 * How far behind its aircraft the perspective Chase camera sits, in feet: a fifth of the ground the flat Chase showed
 * across the screen at that zoom (600 ft at the opening zoom; an estimate), so the wheel still brings it in and out.
 */
export function chaseDistanceFt(cam, size) {
  const acrossFt = (Math.max(size.width, 1) / Math.max(finite(cam.zoom, 1), 1e-3)) * 1000;
  return clamp(acrossFt / 5, [100, 30_000]);
}

/**
 * The perspective Chase camera: `distanceFt` behind the aircraft along the look (`cam`'s yaw, a compass bearing, and
 * pitch, degrees from straight down), looking at it. Returns { eye, at } in feet ({ x, y, z }).
 */
export function chaseEye(ac, cam, distanceFt) {
  const yaw = rad(finite(cam.yawDeg));
  const down = rad(90 - finite(cam.pitchDeg, 90));
  const at = { x: finite(ac.x), y: finite(ac.y), z: altToZ(finite(ac.alt), ALT_SCALE) };
  const f = { x: Math.sin(yaw) * Math.cos(down), y: Math.cos(yaw) * Math.cos(down), z: -Math.sin(down) };
  return { eye: { x: at.x - f.x * distanceFt, y: at.y - f.y * distanceFt, z: at.z - f.z * distanceFt }, at };
}

/** A camera change from a drag of (dx, dy) pixels; `pitchLimits` are CAMERA_LIMITS.pitch except in Chase (CHASE_PITCH_DEG). */
export function orbit(cam, dx, dy, /** @type {readonly number[]} */ pitchLimits = CAMERA_LIMITS.pitch) {
  return {
    ...cam,
    yawDeg: wrapDeg(cam.yawDeg + dx * ORBIT_DEG_PER_PX.yaw),
    pitchDeg: clamp(cam.pitchDeg - dy * ORBIT_DEG_PER_PX.pitch, pitchLimits),
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
  const chutes = new Map(); // ejected aircraft id -> its seat and parachute (ejection3d.js)
  const approach = createApproachMarks(THREE); // the window, the 3° intercept and the aim line (approach3d.js, TR-78)
  root.add(approach);
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

  /**
   * The ejections (TR-75): each ejected aircraft's seat and parachute, posed for now, and the abandoned aircraft while
   * it is still above the ground, returned as aircraft to draw like the flying ones.
   */
  function syncEjections(scene, options, lengthFt) {
    const tNow = options.time ?? 0;
    const wind = { windFromDeg: scene.windFromDeg, windKt: scene.windKt };
    const groundFt = options.groundFt ?? 0;
    const abandoned = [];
    const now = new Set();
    for (const ac of scene.aircraft) {
      const ej = ac.ejectAt;
      if (ac.status !== 'ejected' || !ej || !Number.isFinite(ej.t) || tNow < ej.t) continue;
      const since = tNow - ej.t;
      const st = ejectionAt({ ...ej, alt: trueAltFt(ej.alt) }, since, wind, groundFt); // drawn at true height (TR-77)
      if (st.aircraft) abandoned.push({ ...ac, ...st.aircraft, bankDeg: 0, status: 'flying' });
      let chute = chutes.get(ac.id);
      if (!chute) {
        chute = createEjectionModel(THREE);
        root.add(chute);
        chutes.set(ac.id, chute);
      }
      poseEjectionModel(chute, st, altToZ(st.person.alt, ALT_SCALE), lengthFt / T6_LENGTH_FT, since, EJECTION.riseSec);
      now.add(ac.id);
    }
    for (const [id, chute] of chutes) {
      if (now.has(id)) continue;
      disposeEjectionModel(chute);
      chutes.delete(id);
    }
    return abandoned;
  }

  function syncAircraft(scene, options) {
    const levels = conflictLevels(scene.conflicts ?? []);
    const lengthFt = planeLengthFt(options.zoom, options.aircraftScale);
    const flying = [...scene.aircraft.filter(isFlying), ...syncEjections(scene, options, lengthFt)];
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
      const z = altToZ(ac.alt, ALT_SCALE);
      // Drawn at its true height, on its route line; raised only where its wheels would go under the runway (Patrick,
      // 5 Oct: the aircraft flew "above the line" when the wheel lift was added in the air too).
      mesh.position.z = Math.max(z, floor + wheelLiftFt(lengthFt));
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
      updateApproachMarks(approach, {
        altToZ: (ft) => altToZ(ft, ALT_SCALE),
        floorFt: options.groundFt ?? 0,
        pattern: scene.routes?.find((r) => r.id === 'PAT1') ?? null,
        selected: scene.aircraft.find((a) => a.id === (scene.selectedAircraftId ?? null) && isFlying(a)) ?? null,
        showMarks: options.layerWindow !== false,
        showAim: options.layerAimLine !== false,
        drawScale: planeLengthFt(options.zoom, options.aircraftScale) / T6_LENGTH_FT,
      });
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
      for (const chute of chutes.values()) disposeEjectionModel(chute);
      disposeApproachMarks(approach);
      chutes.clear();
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
  // Less sky fill and a stronger sun, so the sun side and the shade side of an aircraft or building differ clearly
  // (Patrick, 5 Oct: "I don't see any shade from the sun"; was 1.1 and 2.4).
  const hemisphere = new THREE.HemisphereLight('#bcd6f5', '#7a6646', 0.45);
  const sun = new THREE.DirectionalLight('#ffeccc', 3.2);
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
  let viewMode = 'field'; // the Camera menu's choice: field (Over the field), fit, high, top, tower, free, low (Chase), cockpit or padlock
  let freeCam = null; // the free camera, { x, y, z, yawDeg, elevDeg, track } (camera-views.js), in Tower and Free camera
  let headLook = { yawDeg: 0, pitchDeg: 0 }; // Cockpit: where the pilot's head is turned from the nose
  let padlockFrom = 'cockpit'; // Padlock keeps the eye of the view it was picked from: cockpit or low (Chase)
  let noteText = ''; // a short word in the 3D bar, such as why Cockpit fell back to Fit
  let cameraBar = null; // the 3D bar (camera-bar.js), made with the canvas and freed with it
  let coreCanvas = null;
  let coreTexture = null;
  let coreImagery = null;
  let coreDrawn = null; // the tiles the core picture already holds
  let coreDebounce = null;
  let coreAlign = null;

  // Loading without stutter (TR-72): a photo square repaints only the tiles that arrived since its last paint, and sends
  // only those patches to the graphics card, instead of repainting and resending the whole 2,048 to 6,144 px square.
  let patchCanvas = null; // scratch canvas a patch is copied through on its way to the card
  let patchTexture = null;
  /** A drawing pen for imagery.draw that skips tiles this canvas already holds and notes where new ones landed. */
  function tilePen(ctx, drawn, rects) {
    return {
      drawImage(image, x, y, w, h) {
        if (drawn.has(image)) return;
        drawn.add(image);
        ctx.drawImage(image, x, y, w, h);
        rects.push([x, y, w, h]);
      },
    };
  }
  /**
   * Sends the changed patches of `canvas` to `texture` on the card. Falls back to resending the whole picture when the
   * card has no copy yet, a full send is already due, or the patches cover much of the picture.
   */
  function sendPatches(texture, canvas, rects) {
    if (!texture || !rects.length) return;
    const renderer = gl?.renderer;
    const props = renderer?.properties?.get?.(texture);
    const W = canvas.width;
    const H = canvas.height;
    const area = rects.reduce((sum, [, , w, h]) => sum + Math.abs(w * h), 0);
    if (!renderer?.copyTextureToTexture || !props?.__webglTexture || props.__version !== texture.version || area > 0.4 * W * H) {
      texture.needsUpdate = true;
      return;
    }
    if (!patchCanvas) {
      patchCanvas = win.document.createElement('canvas');
      patchTexture = new THREE.Texture(patchCanvas);
    }
    const pctx = patchCanvas.getContext?.('2d');
    if (!pctx) {
      texture.needsUpdate = true;
      return;
    }
    const mipmaps = texture.generateMipmaps;
    rects.forEach(([x, y, w, h], i) => {
      const x0 = Math.max(0, Math.floor(x));
      const y0 = Math.max(0, Math.floor(y));
      const x1 = Math.min(W, Math.ceil(x + w));
      const y1 = Math.min(H, Math.ceil(y + h));
      if (x1 <= x0 || y1 <= y0) return;
      patchCanvas.width = x1 - x0;
      patchCanvas.height = y1 - y0;
      pctx.drawImage(canvas, x0, y0, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0);
      texture.generateMipmaps = mipmaps && i === rects.length - 1; // the smaller copies are rebuilt once, after the last patch
      // The picture is sent flipped (flipY), so a patch's row on the card counts up from the bottom.
      renderer.copyTextureToTexture(patchTexture, texture, null, new THREE.Vector2(x0, H - y1));
    });
    texture.generateMipmaps = mipmaps;
  }

  /**
   * A ground tier: a square canvas of Esri tiles laid on a plane `span` feet across. One tile-layer draw takes at most
   * 64 tiles, so the square is drawn in split-by-split chunks. Same trim and offset as the 2D map's photo, so it lines up.
   * Three tiers stack (far 10+ miles soft, middle sharper, core sharpest) so the ground is sharp where you look.
   */
  function createTier({ span, px, maxZoom, split, cx = 0, cy = 0, debounceMs = 150, maxKept = undefined, transparent = false }) {
    const half = span / 2;
    const tier = { canvas: null, texture: null, imagery: null, debounce: null, align: null, drawn: null };
    /** Paints the tiles that arrived since the last paint; `full` starts the picture again (a new square or alignment). */
    function paint(full = false) {
      const { canvas, imagery, align } = tier;
      if (!canvas || !imagery || disposed || !gl) return;
      const anchor = source.anchor?.();
      const ctx = canvas.getContext?.('2d');
      if (!anchor || !ctx) return;
      const ref = makeLocalRef(anchor.lat, anchor.lon);
      if (full || !tier.drawn) {
        tier.drawn = new WeakSet();
        ctx.fillStyle = '#243b2f';
        if (transparent) ctx.clearRect(0, 0, px, px); else ctx.fillRect(0, 0, px, px);
        full = true;
      }
      const rects = [];
      const pen = tilePen(ctx, tier.drawn, rects);
      const step = span / split;
      for (let i = 0; i < split; i++) {
        for (let j = 0; j < split; j++) {
          const q = { minX: cx - half + i * step, maxX: cx - half + (i + 1) * step, minY: cy - half + j * step, maxY: cy - half + (j + 1) * step };
          const fake = {
            view: { scale: px / span },
            visibleBounds: () => q,
            worldToScreen: (wx, wy) => [((wx - cx + half) / span) * px, ((cy + half - wy) / span) * px],
          };
          imagery.draw(pen, photoView(fake, ref, align));
        }
      }
      if (full) {
        if (tier.texture) tier.texture.needsUpdate = true;
      } else {
        sendPatches(tier.texture, canvas, rects);
      }
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
        tier.texture.anisotropy = sharpestFiltering(); // the photo stays sharp looking along the ground (TR-96)
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
        paint(true);
      } else if (changed) {
        paint(true);
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
      tier.drawn = null;
    };
    return tier;
  }
  /** The most anisotropic filtering this graphics card does (often 16), or 8 before the renderer is made. */
  function sharpestFiltering() {
    return Math.max(8, gl?.renderer?.capabilities?.getMaxAnisotropy?.() ?? 8);
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
      coreTexture.anisotropy = sharpestFiltering();
    }

    function paintCorePhoto(full = false) {
      if (!coreCanvas || disposed || !gl) return;
      const ctx = coreCanvas.getContext?.('2d');
      if (!ctx) return;
      // Offline fallback first; satellite tiles paint over it as they arrive (only the new ones after the first paint, TR-72).
      if (full || !coreDrawn) {
        coreDrawn = new WeakSet();
        paintCoreAirfieldVector(ctx, { width: coreCanvas.width, height: coreCanvas.height, bounds: AIRFIELD_CORE_BOUNDS_FT });
        full = true;
      }
      const rects = [];
      const pen = tilePen(ctx, coreDrawn, rects);
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
            coreImagery.draw(pen, photoView(fake, ref, coreAlign));
          }
        }
      }
      if (full) {
        if (coreTexture) coreTexture.needsUpdate = true;
      } else {
        sendPatches(coreTexture, coreCanvas, rects);
      }
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
      paintCorePhoto(true);
    } else if (alignChanged) {
      paintCorePhoto(true);
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
    coreDrawn = null;
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
      // A logarithmic depth buffer, so the perspective views can draw from a foot away (the cockpit on the runway) without the
      // stacked photo squares flickering far off (TR-96).
      renderer = new THREE.WebGLRenderer({ canvas, antialias: !softwareRenderer(win.document), logarithmicDepthBuffer: true });
    } catch (err) {
      canvas.remove();
      labels.remove();
      throw err;
    }
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2);
    const perspective = new THREE.PerspectiveCamera(50, 1, PERSPECTIVE.nearFt, PERSPECTIVE.farFt); // Cockpit and Chase
    const lights = addTrafficLights(THREE, scene);
    const sky = addSky(THREE, scene);
    const flatHaze = scene.fog ? { near: scene.fog.near, far: scene.fog.far } : null;
    const kit = createSceneKit(THREE, { fatLines });
    scene.add(kit.root);
    const style = win.getComputedStyle?.(canvas);
    const palette = paletteFrom((name) => style?.getPropertyValue(name).trim() ?? '');
    gl = { canvas, labels, ctx: labels.getContext('2d'), renderer, scene, camera, perspective, flatHaze, shownCamera: camera, sky, lights, kit, palette };
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
    patchTexture?.dispose();
    patchTexture = null;
    patchCanvas = null;
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
      if (name === 'padlock' && (viewMode === 'cockpit' || viewMode === 'low')) padlockFrom = viewMode;
      if (name === 'cockpit') headLook = { yawDeg: 0, pitchDeg: 0 };
      const was = viewMode;
      viewMode = name;
      noteText = '';
      if (name === 'low') startChase(data, box, size);
      else if (name === 'tower') {
        const target = follow ? (data.aircraft.find((a) => a.id === follow.id && isFlying(a)) ?? null) : null;
        freeCam = towerFree(floor, target);
      } else if (name === 'free') {
        freeCam = freeFromView(was, size, floor);
        follow = null;
      }
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
          // Padlock from Chase keeps Chase's distance behind the aircraft (the zoom); otherwise the opening Chase distance.
          const chaseZoom = was === 'low' ? view.cam.zoom : chaseCamera(target, size).cam.zoom;
          view = povCamera(name, target, size, floor);
          if (name === 'padlock') view = { ...view, cam: { ...view.cam, zoom: chaseZoom } };
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
    // Cockpit and Chase on an aircraft are drawn in perspective; everything else is flat.
    const povTarget = follow && PERSPECTIVE_VIEWS.has(viewMode) ? (data.aircraft.find((a) => a.id === follow.id && isFlying(a)) ?? null) : null;
    const freeOn = FREE_VIEWS.has(viewMode) && freeCam !== null;

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
      zoom: povTarget || freeOn ? CAMERA_LIMITS.zoom[1] : shown.zoom, groundFt: floor, time: source.time(), // in perspective, aircraft at their close-up size
      fullModels: options.fullModels ?? true,
      layerHeightLines: options.layerHeightLines !== false,
      layerEngineReach: options.layerEngineReach,
      layerWindTrack: options.layerWindTrack,
      layerSmmReference: options.layerSmmReference,
      layerPflCircle: options.layerPflCircle,
      layerWindow: options.layerWindow,
      layerAimLine: options.layerAimLine,
      layerPhoto: options.layerPhoto,
      photoTexture: photoTex,
      outerTexture: outerTex,
      midTexture: midTex,
      patternMidTextures,
      tightTexture: tightTex,
      coreTexture: coreTex,
      photoOpacityPct: options.photoOpacityPct,
    });
    kit.setResolution(size.width, size.height);
    const pov = freeOn ? aimFree(data, size, floor) : povTarget && !dragging?.isPan ? aimPerspective(povTarget, shown, size, floor) : null;
    kit.placeGrid(pov ? pov.eye : focus, floor);
    kit.grid.visible = !pov; // the grid under the photo shows through at the horizon in perspective, as stripes
    // The flat views never look above level, whatever a perspective view left in the camera.
    if (!pov) matchProjection(THREE, camera, focus, { ...shown, pitchDeg: Math.min(shown.pitchDeg, CAMERA_LIMITS.pitch[1]) }, size, 1);
    if (threeScene.fog && gl.flatHaze) {
      threeScene.fog.near = pov ? PERSPECTIVE.hazeFromFt : gl.flatHaze.near;
      threeScene.fog.far = pov ? PERSPECTIVE.hazeToFt : gl.flatHaze.far;
    }
    gl.shownCamera = pov ? gl.perspective : camera;
    const facing = freeOn
      ? { yawDeg: Math.round(finite(freeCam.yawDeg)), tiltDeg: Math.round(90 + finite(freeCam.elevDeg)) }
      : { yawDeg: Math.round(finite(shown.yawDeg)), tiltDeg: Math.round(finite(shown.pitchDeg)) };
    if (facing.yawDeg !== lastFacing?.yawDeg || facing.tiltDeg !== lastFacing?.tiltDeg) { lastFacing = facing; onFacing(facing.yawDeg, facing.tiltDeg); }
    renderer.render(threeScene, gl.shownCamera);
    if (pov?.hidden) pov.hidden.visible = true;
    drawLabels(ctx, labels, size, ratio, data, options, palette, { zoom: pov ? pov.labelZoom : shown.zoom, floor, skipId: pov?.hidden ? povTarget.id : null, noLocator: Boolean(pov) && PERSPECTIVE_VIEWS.has(viewMode) });

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
  /** Sets the perspective camera's field of view for the canvas; returns pixels to 1,000 ft at `distFt` from the eye. */
  function shapePerspective(size) {
    const p = gl.perspective;
    p.fov = perspectiveFovDeg(size);
    p.aspect = Math.max(size.width, 1) / Math.max(size.height, 1);
    return (distFt) => ((Math.max(size.height, 1) / 2) / Math.tan(rad(p.fov / 2)) / Math.max(distFt, 1)) * 1000;
  }

  function finishPerspective() {
    gl.perspective.updateProjectionMatrix();
    gl.perspective.updateMatrixWorld(true);
  }

  /**
   * Points the perspective camera for Cockpit, Chase or Padlock on `target` and returns { eye, hidden, labelZoom }.
   * Cockpit sits at the aircraft looking along its nose (turned by the pilot's head, headLook), banked with it, and
   * hides its own model for the frame (`hidden`, shown again after drawing); Chase sits behind it along the look, at
   * chaseDistanceFt. Padlock keeps the eye of the view it came from and looks at the 29L threshold: from the cockpit
   * banked with the aircraft, from Chase over the aircraft's shoulder. labelZoom is the pixels to 1,000 ft at the
   * followed aircraft, for the label sizes.
   */
  function aimPerspective(target, cam, size, floor) {
    const p = gl.perspective;
    const pxPerKft = shapePerspective(size);
    const at = { x: finite(target.x), y: finite(target.y), z: altToZ(finite(target.alt), ALT_SCALE) };
    const threshold = new THREE.Vector3(RWY_29L_THRESHOLD.x, RWY_29L_THRESHOLD.y, altToZ(RWY_29L_THRESHOLD.alt, ALT_SCALE));
    let eye, hidden = null, labelZoom;
    if (viewMode === 'cockpit' || (viewMode === 'padlock' && padlockFrom !== 'low')) {
      const mesh = gl.kit.aircraftMesh(target.id);
      const turn = new THREE.Quaternion();
      if (mesh) {
        // The model's nose is +X and its top +Z (applyPose), so its turn gives the pilot's look and the bank.
        turn.copy(mesh.quaternion);
        mesh.visible = false;
        hidden = mesh;
      } else turn.setFromAxisAngle(new THREE.Vector3(0, 0, 1), rad(90 - finite(target.headingDeg)));
      const up = new THREE.Vector3(0, 0, 1).applyQuaternion(turn);
      // At the seat: the drawn model's middle (raised onto its wheels on the runway), up along its top.
      const seat = mesh ? mesh.position : new THREE.Vector3(at.x, at.y, at.z);
      eye = {
        x: seat.x + up.x * COCKPIT_EYE.aboveModelFt,
        y: seat.y + up.y * COCKPIT_EYE.aboveModelFt,
        z: Math.max(seat.z + up.z * COCKPIT_EYE.aboveModelFt, floor + COCKPIT_EYE.leastAglFt),
      };
      p.position.set(eye.x, eye.y, eye.z);
      p.up.copy(up);
      if (viewMode === 'padlock') p.lookAt(threshold);
      else {
        // The head turns left-right about the aircraft's top (positive to the right), then up-down.
        const yaw = rad(-headLook.yawDeg);
        const pitch = rad(headLook.pitchDeg);
        const look = new THREE.Vector3(Math.cos(yaw) * Math.cos(pitch), Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch)).applyQuaternion(turn);
        p.lookAt(eye.x + look.x * 1000, eye.y + look.y * 1000, eye.z + look.z * 1000);
      }
      labelZoom = CAMERA_LIMITS.zoom[1];
    } else if (viewMode === 'padlock') {
      // Over the shoulder: behind the aircraft on the line from the threshold, a little above, looking at the threshold.
      const distanceFt = chaseDistanceFt(cam, size);
      const toward = new THREE.Vector3(threshold.x - at.x, threshold.y - at.y, 0);
      if (toward.lengthSq() < 1) toward.set(Math.sin(rad(finite(target.headingDeg))), Math.cos(rad(finite(target.headingDeg))), 0);
      toward.normalize();
      eye = { x: at.x - toward.x * distanceFt, y: at.y - toward.y * distanceFt, z: Math.max(at.z + distanceFt * 0.3, floor + CHASE_MIN_AGL_FT) };
      p.position.set(eye.x, eye.y, eye.z);
      p.up.set(0, 0, 1);
      p.lookAt(threshold);
      labelZoom = pxPerKft(distanceFt);
    } else {
      const distanceFt = chaseDistanceFt(cam, size);
      const look = chaseEye(target, cam, distanceFt);
      eye = { ...look.eye, z: Math.max(look.eye.z, floor + CHASE_MIN_AGL_FT) };
      p.position.set(eye.x, eye.y, eye.z);
      p.up.set(0, 0, 1);
      p.lookAt(look.at.x, look.at.y, look.at.z);
      labelZoom = pxPerKft(distanceFt);
    }
    finishPerspective();
    return { eye, hidden, labelZoom };
  }

  /**
   * Points the perspective camera from the free camera (Tower or Free camera). While it tracks, it looks at the
   * followed aircraft and its bearing and look angle follow, so turning it by hand starts from what was shown.
   */
  function aimFree(data, size, floor) {
    const p = gl.perspective;
    const pxPerKft = shapePerspective(size);
    freeCam = { ...freeCam, z: Math.max(freeCam.z, floor + FREE_MIN_AGL_FT) };
    const eye = { x: freeCam.x, y: freeCam.y, z: freeCam.z };
    const target = freeCam.track && follow ? data.aircraft.find((a) => a.id === follow.id && isFlying(a)) : null;
    let distFt = 3000; // labels sized as if 3,000 ft away when nothing is tracked (an estimate)
    if (target) {
      const at = { x: finite(target.x), y: finite(target.y), z: altToZ(finite(target.alt), ALT_SCALE) };
      freeCam = { ...freeCam, ...freeAim(eye, at) };
      distFt = Math.hypot(at.x - eye.x, at.y - eye.y, at.z - eye.z);
    }
    const f = freeLookVector(freeCam.yawDeg, freeCam.elevDeg);
    p.position.set(eye.x, eye.y, eye.z);
    p.up.set(0, 0, 1);
    p.lookAt(eye.x + f.x * 1000, eye.y + f.y * 1000, eye.z + f.z * 1000);
    finishPerspective();
    return { eye, hidden: null, labelZoom: pxPerKft(distFt) };
  }

  /**
   * The free camera starting from the view `was`: from the perspective camera's own eye and look when that view was in
   * perspective, else from a point back along the flat view's look, as far as about the ground across the screen.
   */
  function freeFromView(was, size, floor) {
    if ((PERSPECTIVE_VIEWS.has(was) || FREE_VIEWS.has(was)) && gl?.perspective && gl.shownCamera === gl.perspective) {
      const p = gl.perspective;
      const dir = new THREE.Vector3();
      p.getWorldDirection(dir);
      const eye = { x: p.position.x, y: p.position.y, z: p.position.z };
      return { ...eye, ...freeAim(eye, { x: eye.x + dir.x, y: eye.y + dir.y, z: eye.z + dir.z }), track: false };
    }
    const cam = view.cam;
    const acrossFt = (Math.max(size.width, 1) / Math.max(finite(cam.zoom, 1), 1e-3)) * 1000;
    const elevDeg = Math.min(finite(cam.pitchDeg, 90), 89) - 90;
    const f = freeLookVector(cam.yawDeg, elevDeg);
    const c = view.center;
    return { x: c.x - f.x * acrossFt, y: c.y - f.y * acrossFt, z: Math.max(c.z - f.z * acrossFt, floor + FREE_MIN_AGL_FT), yawDeg: wrapDeg(finite(cam.yawDeg)), elevDeg, track: false };
  }

  function drawLabels(ctx, labelCanvas, size, ratio, data, options, palette, { zoom = 20, floor = 0, skipId = null, noLocator = false } = {}) {
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    const levels = conflictLevels(data.conflicts ?? []);
    const camera = gl.shownCamera ?? gl.camera;
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
    // A point behind the perspective camera, or past its clip planes, has no place on the screen.
    const screenOf = (x, y, alt) => {
      const depth = new THREE.Vector3(x, y, altToZ(alt, ALT_SCALE)).project(camera).z;
      return depth < -1 || depth > 1 ? { x: NaN, y: NaN } : worldToScreen(THREE, camera, { x, y, z: altToZ(alt, ALT_SCALE) }, size.width, size.height);
    };
    const onScreen = (p, margin = 50) => p.x > -margin && p.y > -margin && p.x < size.width + margin && p.y < size.height + margin;

    // The window and the 3° intercept, named (TR-78).
    if (options.layerWindow !== false) {
      const marks = approachMarks(data.routes?.find((r) => r.id === 'PAT1') ?? null);
      ctx.textAlign = 'center';
      const w = screenOf(marks.window.x, marks.window.y, marks.window.highFt);
      if (onScreen(w)) write('THE WINDOW', w.x, w.y - 8, '#7dd3fc', true, 11);
      // The altimeter's window (TR-81): named under the window, with how far it sits from it.
      const alt = marks.altimeter;
      const b = alt && screenOf(marks.window.x, marks.window.y, marks.window.lowFt);
      if (alt && onScreen(b)) write(`ALTIMETER 2,100-2,200 (${alt.hot ? '+' : '−'}${Math.round(Math.abs(alt.shiftFt))} FT ${alt.hot ? 'HOT' : 'COLD'})`, b.x, b.y + 16, alt.hot ? '#f87171' : '#60a5fa', true, 11);
      const i = screenOf(marks.intercept.x, marks.intercept.y, marks.intercept.altFt);
      if (onScreen(i)) write(`3° INTERCEPT (${(marks.intercept.outFt / FT_PER_NM).toFixed(1)} NM)`, i.x, i.y - 8, '#fde047', true, 11);
    }

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
      if (!isFlying(ac) || ac.id === skipId) continue; // not the one the Cockpit view is sitting in
      const p = screenOf(ac.x, ac.y, ac.alt);
      if (!onScreen(p)) continue;
      const colour = aircraftColor(ac);
      // The locator circle: round the selected aircraft only (Patrick, 4 Oct: "the default to be no circles anywhere,
      // and when you click an aircraft THAT aircraft has a green circle").
      // Not in Cockpit, Chase or Padlock, where the aircraft are drawn true size (Patrick, 6 Oct 06:33Z; TR-93).
      if (!noLocator && ac.id === (data.selectedAircraftId ?? null)) {
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
    // The followed aircraft stays chosen (Cockpit or Padlock back to Chase); else the first one flying.
    const target = (follow && data.aircraft.find((a) => a.id === follow.id && isFlying(a))) || data.aircraft.find(isFlying);
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
      if (FREE_VIEWS.has(viewMode) && freeCam) {
        freeCam = { ...freeCam, track: true }; // Tower and the free camera watch the aircraft from where they are
      } else if (POV_VIEWS.has(viewMode)) {
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
    if (FREE_VIEWS.has(viewMode) && freeCam) moveFreeBy({ forward: deltaY < 0 ? 3 : -3 });
    else view = { ...view, cam: zoomBy(view.cam, deltaY) };
    requestDraw();
  };
  const floorNow = () => groundFt(source.scene?.()?.routes ?? []);
  /** Moves the free camera by steps of freeStepFt ({ forward, right, up }). */
  function moveFreeBy(steps) {
    const floor = floorNow();
    const step = freeStepFt(freeCam, floor);
    freeCam = moveFree(freeCam, { forward: (steps.forward ?? 0) * step, right: (steps.right ?? 0) * step, up: (steps.up ?? 0) * step }, floor);
  }
  /** Chase may look up; the flat views stop at CAMERA_LIMITS.pitch. */
  const pitchLimits = () => (viewMode === 'low' && follow ? CHASE_PITCH_DEG : CAMERA_LIMITS.pitch);
  /**
   * Turns the view by a drag or arrow key of (dx, dy) pixels: the free camera's look, the pilot's head in Cockpit, or
   * the orbit round the middle (or the aircraft) in every other view. Returns the orbited camera, or null when the
   * free camera or the head was turned instead.
   */
  function turnBy(cam, dx, dy) {
    if (FREE_VIEWS.has(viewMode) && freeCam) {
      freeCam = turnFree(freeCam, dx * ORBIT_DEG_PER_PX.yaw, -dy * ORBIT_DEG_PER_PX.pitch);
      return null;
    }
    if (viewMode === 'cockpit' && follow) {
      headLook = {
        yawDeg: clamp(headLook.yawDeg + dx * ORBIT_DEG_PER_PX.yaw, HEAD_LOOK_DEG.yaw),
        pitchDeg: clamp(headLook.pitchDeg - dy * ORBIT_DEG_PER_PX.pitch, HEAD_LOOK_DEG.pitch),
      };
      return null;
    }
    if (follow) follow.autoYaw = false; // turned by hand: the chase camera stops swinging behind
    return orbit(cam, dx, dy, pitchLimits());
  }
  /** P: Padlock on the runway from Chase or Cockpit, and back. C: the look back to the nose (Cockpit) or behind (Chase). */
  function cameraLetter(key) {
    if (key === 'p') {
      if (viewMode === 'padlock') api.preset(padlockFrom);
      else if (viewMode === 'cockpit' || viewMode === 'low') api.preset('padlock');
      else return false;
      return true;
    }
    if (key === 'c') {
      if (viewMode === 'cockpit') headLook = { yawDeg: 0, pitchDeg: 0 };
      else if (viewMode === 'low' && follow) {
        follow.autoYaw = true;
        view = { ...view, cam: { ...view.cam, pitchDeg: PRESET_PITCH_DEG.low } };
      } else return false;
      requestDraw();
      return true;
    }
    const move = FREE_MOVE_KEYS[key];
    if (move && FREE_VIEWS.has(viewMode) && freeCam) {
      moveFreeBy(move);
      requestDraw();
      return true;
    }
    return false;
  }
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
    } else if (typeof e.key === 'string' && e.key.length === 1) {
      const key = e.key.toLowerCase();
      // Shift moves the free camera four times as far.
      const times = e.shiftKey && FREE_MOVE_KEYS[key] ? 4 : 1;
      let used = false;
      for (let i = 0; i < times; i++) used = cameraLetter(key) || used;
      if (used) e.preventDefault();
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
      if (dragging.isPan && FREE_VIEWS.has(viewMode) && freeCam) {
        // The free camera slides sideways and up with the ground under the pointer.
        const floor = floorNow();
        const ftPerPx = freeStepFt(freeCam, floor) / 40;
        freeCam = moveFree(freeCam, { right: -dx * ftPerPx, up: dy * ftPerPx }, floor);
      } else if (dragging.isPan) {
        if (follow) follow = null; // user panned: detach chase
        dragging.center = panCamera(dragging.center, view.cam, dx, dy);
        view.center = dragging.center;
      } else {
        dragging.cam = turnBy(dragging.cam, dx, dy) ?? dragging.cam;
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
        if (e.shiftKey && FREE_VIEWS.has(viewMode) && freeCam) {
          moveFreeBy({ right: Math.sign(turn[0]), up: -Math.sign(turn[1]) });
        } else if (e.shiftKey) {
          if (follow) follow = null;
          view = { ...view, center: panCamera(view.center, view.cam, -turn[0], -turn[1]) };
        } else if (FREE_VIEWS.has(viewMode) && freeCam) {
          turnBy(view.cam, turn[0], turn[1]);
        } else {
          view = { ...view, cam: turnBy(view.cam, turn[0], turn[1]) ?? view.cam };
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
