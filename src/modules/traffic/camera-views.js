// The Traffic Sim's extra 3D viewpoints (tasks/traffic-camera/plan.md, Phase 2): Top-down, Tower, Cockpit and
// Padlock. Pure functions, no three.js: each returns the same { center, cam: { yawDeg, pitchDeg, zoom, altScale } }
// the rest of view3d.js uses, so matchProjection (an OrthographicCamera) draws them with no extra state.
//
// The camera is orthographic, so a viewpoint is a look direction plus what sits in the middle of the screen. yaw is
// a compass bearing (the camera looks along (sin yaw, cos yaw)); pitch is degrees from straight down (0 looks down,
// 90 is level), clamped to the view's limits. Display only: no flight math.

/** The tower cab at CYMJ, in local feet, and how far above the field its eye sits. */
export const TOWER_FT = Object.freeze({ x: 30, y: 2575 });
export const TOWER_EYE_AGL_FT = 140;
/** Runway 29L threshold (local feet, ft MSL): what the Padlock view keeps in sight. */
export const RWY_29L_THRESHOLD = Object.freeze({ x: 3104, y: -3194, alt: 1880 });

/** The views the Camera menu offers, in menu order. */
export const CAMERA_VIEWS = Object.freeze([
  { id: 'fit', label: 'Fit' },
  { id: 'high', label: 'High look-down' },
  { id: 'top', label: 'Top-down' },
  { id: 'tower', label: 'Tower' },
  { id: 'low', label: 'Chase' },
  { id: 'cockpit', label: 'Cockpit' },
  { id: 'padlock', label: 'Padlock (runway)' },
]);
/** The views that need a followed aircraft. */
export const NEEDS_AIRCRAFT = Object.freeze(new Set(['cockpit', 'padlock']));

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
