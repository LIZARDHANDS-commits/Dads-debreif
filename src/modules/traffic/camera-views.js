// The Traffic Sim's extra 3D viewpoints (tasks/traffic-camera/plan.md, Phase 2): Top-down, Tower, Cockpit and
// Padlock. Pure functions, no three.js: each returns the same { center, cam: { yawDeg, pitchDeg, zoom, altScale } }
// the rest of view3d.js uses, so matchProjection (an OrthographicCamera) draws them with no extra state.
//
// The camera is orthographic (Cockpit, Chase, Padlock, Tower and the free camera are drawn in perspective in view3d.js,
// TR-90, TR-92), so a viewpoint is a look direction plus what sits in the middle of the screen. yaw is
// a compass bearing (the camera looks along (sin yaw, cos yaw)); pitch is degrees from straight down (0 looks down,
// 90 is level), clamped to the view's limits. Display only: no flight math.
import { THRESHOLD_29L, THRESHOLD_DATA_ELEV_FT } from './airfield.js';

/** The tower cab at CYMJ, in local feet (true feet, TR-67: placed on the stretched photo, then divided by 1.2), and how far above the field its eye sits. */
export const TOWER_FT = Object.freeze({ x: 25, y: 2146 });
export const TOWER_EYE_AGL_FT = 140;
/** Runway 29L threshold (local feet, ft MSL): what the Padlock view keeps in sight. */
export const RWY_29L_THRESHOLD = Object.freeze({ x: THRESHOLD_29L.x, y: THRESHOLD_29L.y, alt: THRESHOLD_DATA_ELEV_FT });

/** The views the Camera menu offers, in menu order (legacy compatibility). */
export const CAMERA_VIEWS = Object.freeze([
  { id: 'field', label: 'Over the field' },
  { id: 'fit', label: 'Fit' },
  { id: 'high', label: 'High look-down' },
  { id: 'top', label: 'Top-down' },
  { id: 'tower', label: 'Tower' },
  { id: 'free', label: 'Free camera' },
  { id: 'low', label: 'Chase' },
  { id: 'cockpit', label: 'Cockpit' },
  { id: 'padlock', label: 'Padlock (runway)' },
]);
/** The views that need a followed aircraft. */
export const NEEDS_AIRCRAFT = Object.freeze(new Set(['cockpit', 'padlock']));

/** 2-Tier Standardized Camera Architecture */
export const CAMERA_MOUNTS = Object.freeze([
  { id: 'overview', label: 'Overview' },
  { id: 'tower', label: 'Tower' },
  { id: 'free', label: 'Free' },
  { id: 'chase', label: 'Chase' },
  { id: 'cockpit', label: 'Cockpit' },
]);

export const OVERVIEW_PRESETS = Object.freeze([
  { id: 'field', label: 'Field' },
  { id: 'fit', label: 'Fit' },
  { id: 'high', label: 'High' },
  { id: 'top', label: 'Top' },
]);

export const AIM_MODES = Object.freeze({
  tower: [
    { id: 'freelook', label: 'Freelook' },
    { id: 'track', label: 'Track' },
    { id: 'padlock', label: 'Rwy 29L' },
  ],
  free: [
    { id: 'freelook', label: 'Freelook' },
    { id: 'track', label: 'Track' },
    { id: 'padlock', label: 'Rwy 29L' },
  ],
  chase: [
    { id: 'boresight', label: 'Trail' },
    { id: 'freelook', label: 'Orbit' },
    { id: 'padlock', label: 'Rwy 29L' },
  ],
  cockpit: [
    { id: 'boresight', label: 'Boresight' },
    { id: 'freelook', label: 'Freelook' },
    { id: 'padlock', label: 'Rwy 29L' },
  ],
});

export const COCKPIT_SEATS = Object.freeze([
  { id: 'front', label: 'Front' },
  { id: 'rear', label: 'Rear' },
]);

export const DEFAULT_CAMERA_STATE = Object.freeze({
  mount: 'overview',
  preset: 'field',
  aim: 'boresight',
  seat: 'front',
});

/** Translates legacy view names to 2-tier camera state */
export function stateFromLegacy(name, currentTarget = null) {
  switch (name) {
    case 'field': return { mount: 'overview', preset: 'field', aim: 'boresight', seat: 'front' };
    case 'fit':   return { mount: 'overview', preset: 'fit', aim: 'boresight', seat: 'front' };
    case 'high':  return { mount: 'overview', preset: 'high', aim: 'boresight', seat: 'front' };
    case 'top':   return { mount: 'overview', preset: 'top', aim: 'boresight', seat: 'front' };
    case 'tower': return { mount: 'tower', preset: 'field', aim: currentTarget ? 'track' : 'freelook', seat: 'front' };
    case 'free':  return { mount: 'free', preset: 'field', aim: 'freelook', seat: 'front' };
    case 'low':   return { mount: 'chase', preset: 'field', aim: 'boresight', seat: 'front' };
    case 'cockpit': return { mount: 'cockpit', preset: 'field', aim: 'boresight', seat: 'front' };
    case 'padlock': return { mount: 'cockpit', preset: 'field', aim: 'padlock', seat: 'front' };
    default: return { ...DEFAULT_CAMERA_STATE };
  }
}

const PITCH = [0, 85];
const ZOOM = [0.3, 4000];
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const clamp = (v, range) => Math.max(range[0], Math.min(range[1], v));
const wrapDeg = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const finite = (v, fallback = 0) => (Number.isFinite(v) ? v : fallback);

/** Pixels to 1,000 ft that put `spanFt` across a canvas `width` px wide. */
const zoomFor = (width, spanFt) => clamp((Math.max(width, 1) / Math.max(spanFt, 1)) * 1000, ZOOM);

/**
 * The look from `eye` to `at` (both { x, y, alt }): yaw is the compass bearing, pitch the view's tilt (90 minus the
 * angle below level, so a target far below looks more down). Level or above is clamped to the view's top limit.
 */
export function lookAt(eye, at) {
  const dx = finite(at.x) - finite(eye.x);
  const dy = finite(at.y) - finite(eye.y);
  const dz = finite(at.alt) - finite(eye.alt);
  const horiz = Math.hypot(dx, dy);
  const yawDeg = horiz < 1e-6 ? 0 : wrapDeg(deg(Math.atan2(dx, dy)));
  const belowDeg = deg(Math.atan2(-dz, Math.max(horiz, 1e-6)));
  return { yawDeg, pitchDeg: clamp(90 - belowDeg, PITCH), distanceFt: Math.hypot(horiz, dz) };
}

/** Top-down: straight down, north up, centred on the box (from sceneBox) and zoomed to fit it. */
export function topDownCamera(box, size) {
  const center = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2, z: (box.minZ + box.maxZ) / 2 };
  const pxPerFt = 0.9 * Math.min((Math.max(size.width, 1) / 2) / Math.max((box.maxX - box.minX) / 2, 1), (Math.max(size.height, 1) / 2) / Math.max((box.maxY - box.minY) / 2, 1));
  return { center, cam: { yawDeg: 0, pitchDeg: 0, zoom: clamp(pxPerFt * 1000, ZOOM), altScale: 1 } };
}

/**
 * The view 3D opens on (Patrick, 4 Oct 2026 10:17Z, from his screenshot): from north of the field looking
 * south-south-east, low over the base, with the runways in the lower half and the circuit beyond them. The angles,
 * the middle of the picture and the ground across the screen were measured from that picture by lining up the
 * runways and the tower (estimates): yaw 148°, 77° from straight down, about 11,500 ft across, centred over the
 * circuit south-east of the 29L threshold at field height. Centre and span divided by 1.2 with the true-scale
 * map (TR-67), so the same ground fills the screen.
 */
export const FIELD_VIEW = Object.freeze({ yawDeg: 148, pitchDeg: 77, spanFt: 9_600, center: Object.freeze({ x: 4250, y: -5167 }) });

/** Over the field: the opening view above, the same ground across any screen width. */
export function fieldCamera(size) {
  return {
    center: { x: FIELD_VIEW.center.x, y: FIELD_VIEW.center.y, z: RWY_29L_THRESHOLD.alt },
    cam: { yawDeg: FIELD_VIEW.yawDeg, pitchDeg: clamp(FIELD_VIEW.pitchDeg, PITCH), zoom: zoomFor(size.width, FIELD_VIEW.spanFt), altScale: 1 },
  };
}

/** Tower: from the cab (floor + 140 ft) toward `target` ({ x, y, alt }), or toward the 29L threshold with none. */
export function towerCamera(target, size, floorFt) {
  const eye = { ...TOWER_FT, alt: finite(floorFt, RWY_29L_THRESHOLD.alt) + TOWER_EYE_AGL_FT };
  const at = target ?? RWY_29L_THRESHOLD;
  const look = lookAt(eye, at);
  return {
    center: { x: finite(at.x), y: finite(at.y), z: finite(at.alt) },
    cam: { yawDeg: look.yawDeg, pitchDeg: look.pitchDeg, zoom: zoomFor(size.width, Math.max(3000, look.distanceFt * 0.6)), altScale: 1 },
  };
}

/** Cockpit: from the aircraft ({ x, y, alt, headingDeg }) looking along its heading, nearly level, a little ahead of the nose. */
export function cockpitCamera(ac, size) {
  const h = rad(finite(ac.headingDeg));
  const ahead = 1500;
  return {
    center: { x: finite(ac.x) + Math.sin(h) * ahead, y: finite(ac.y) + Math.cos(h) * ahead, z: finite(ac.alt) },
    cam: { yawDeg: wrapDeg(finite(ac.headingDeg)), pitchDeg: PITCH[1], zoom: zoomFor(size.width, 4000), altScale: 1 },
  };
}

/** Padlock: from the aircraft looking at the Runway 29L threshold, centred between the two so both are in the picture. */
export function padlockCamera(ac, size) {
  const eye = { x: finite(ac.x), y: finite(ac.y), alt: finite(ac.alt) };
  const look = lookAt(eye, RWY_29L_THRESHOLD);
  return {
    center: { x: (eye.x + RWY_29L_THRESHOLD.x) / 2, y: (eye.y + RWY_29L_THRESHOLD.y) / 2, z: (eye.alt + RWY_29L_THRESHOLD.alt) / 2 },
    cam: { yawDeg: look.yawDeg, pitchDeg: look.pitchDeg, zoom: zoomFor(size.width, Math.max(3000, look.distanceFt * 1.3)), altScale: 1 },
  };
}

/**
 * The free-flying perspective camera (Patrick, 6 Oct 06:26Z; TR-92): an eye in local feet ({ x, y, z }, z in ft MSL),
 * a compass bearing and a look angle above level (negative is down). Tower starts it in the cab. It keeps looking at
 * the followed aircraft while `track` is on; turning the view by hand switches tracking off.
 */
export const FREE_LOOK_DEG = Object.freeze([-89, 89]);
/** Nothing flies the eye closer to the ground than this, in feet (an estimate: about a person's eye height). */
export const FREE_MIN_AGL_FT = 6;

/** The free camera in the tower cab, looking at `target` ({ x, y, alt }) or the 29L threshold. */
export function towerFree(floorFt, target = null) {
  const eye = { x: TOWER_FT.x, y: TOWER_FT.y, z: finite(floorFt, RWY_29L_THRESHOLD.alt) + TOWER_EYE_AGL_FT };
  const at = target ?? RWY_29L_THRESHOLD;
  return { ...eye, ...freeAim(eye, { x: at.x, y: at.y, z: at.alt }), track: Boolean(target) };
}

/** The unit look of a bearing and an angle above level, in local feet axes (x east, y north, z up). */
export function freeLookVector(yawDeg, elevDeg) {
  const yaw = rad(finite(yawDeg));
  const elev = rad(finite(elevDeg));
  return { x: Math.sin(yaw) * Math.cos(elev), y: Math.cos(yaw) * Math.cos(elev), z: Math.sin(elev) };
}

/** The bearing and the angle above level from `eye` to `at` (both { x, y, z }). */
export function freeAim(eye, at) {
  const dx = finite(at.x) - finite(eye.x);
  const dy = finite(at.y) - finite(eye.y);
  const horiz = Math.hypot(dx, dy);
  return {
    yawDeg: horiz < 1e-6 ? 0 : wrapDeg(deg(Math.atan2(dx, dy))),
    elevDeg: clamp(deg(Math.atan2(finite(at.z) - finite(eye.z), Math.max(horiz, 1e-6))), FREE_LOOK_DEG),
  };
}

/** How far one key press or wheel notch moves the free camera: a tenth of its height above the ground, 30 to 2,000 ft. */
export function freeStepFt(free, floorFt) {
  return clamp((finite(free.z) - finite(floorFt)) / 10, [30, 2000]);
}

/**
 * The free camera moved `forward` along its look (climbing or descending with it), `right` across it and `up`, all in
 * feet; never below FREE_MIN_AGL_FT over the floor.
 */
export function moveFree(free, { forward = 0, right = 0, up = 0 }, floorFt) {
  const f = freeLookVector(free.yawDeg, free.elevDeg);
  const yaw = rad(finite(free.yawDeg));
  const r = { x: Math.cos(yaw), y: -Math.sin(yaw) };
  return {
    ...free,
    x: finite(free.x) + f.x * forward + r.x * right,
    y: finite(free.y) + f.y * forward + r.y * right,
    z: Math.max(finite(floorFt) + FREE_MIN_AGL_FT, finite(free.z) + f.z * forward + up),
  };
}

/** The free camera turned by hand: `dYawDeg` round, `dElevDeg` up. */
export function turnFree(free, dYawDeg, dElevDeg) {
  return { ...free, yawDeg: wrapDeg(finite(free.yawDeg) + dYawDeg), elevDeg: clamp(finite(free.elevDeg) + dElevDeg, FREE_LOOK_DEG), track: false };
}
