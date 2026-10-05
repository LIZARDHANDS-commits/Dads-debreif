// The Turn Sim's 3D view (SPEC-turn-sim: 2D/3D switch): the same run as the 2D
// picture, drawn with three.js through the ui-kit's shared pieces
// (three-aircraft.js, ct156-model.js). It reads the engine's state, so position,
// heading, bank and trails are exactly the 2D view's. It only draws.
//
// three.js loads on the first show() and never before, so a 2D-only visit
// downloads nothing extra. The view draws one frame when asked (requestDraw) and
// never while it is hidden or disposed, so 3D costs nothing when it isn't showing
// (R4). The camera is the ui-kit's matchProjection; nothing here does camera maths
// of its own beyond choosing yaw, pitch, zoom and centre.
import {
  loadThree, webglSupported, matchProjection, worldToScreen, altToZ, addLights, addSky, disposeAircraftMesh,
} from '../../ui-kit/three-aircraft.js';
import { drawTags, T6_LENGTH_FT, trailSince, BACKGROUND, CLOCK_LINE_RED } from './view.js';
import { FW_TURN } from './live/tuning.js';
import { turnRadiusFromBankFt } from '../../core/flight-math.js';
import { createCt156Model, CT156_UNIT_LENGTH } from '../../ui-kit/ct156-model.js';

/** The formation's height in the picture (feet). An aircraft with altAboveFt is drawn that far above or below it (the vertical miss). */
export const FLIGHT_ALT_FT = 0;
/** The ground grid sits this far below the aircraft, so there is something to judge the view against. */
const GROUND_BELOW_FT = 1500;
const GRID_STEP_FT = 5000;
const GRID_CELLS = 40;
const ALT_SCALE = 1;

/**
 * Camera limits: the pitch is above the horizon (5 to 80 degrees) and zoom is pixels per 1,000 ft. Zoomed right in, a
 * close formation shows at its real size (about 8 px a foot, a 120 ft picture across a 1,000 px screen, as the 2D view's
 * closest), so an echelon's step down and its bearing line can be seen (SMM 12.4 Figs 12.3-12.4; spec section 10.2).
 */
export const CAMERA_LIMITS = Object.freeze({ pitch: [5, 80], zoom: [0.5, 8000] });
export const CAMERA_START_PITCH_DEG = 5; // top down at the start (Patrick, 5 Oct; was 35°); 5° is the closest to straight down the camera allows
/** Padlock may tilt the camera past level to look up at the other aircraft (90° is level; more looks up from below). */
const PADLOCK_PITCH = Object.freeze([5, 175]);
const ORBIT_DEG_PER_PX = Object.freeze({ yaw: 0.4, pitch: 0.25 });
const WHEEL_ZOOM = Object.freeze({ in: 1.12, out: 0.89 });
/** How far the fit-all zoom moves toward the zoom it wants, each frame (the 2D view's ease). */
const FIT_ZOOM_EASE = 0.08;

/** Real length of a T-6 (feet, view.js). A zoomed-out aircraft is drawn bigger than that, so it can still be seen. */
export { T6_LENGTH_FT };
/** The length an aircraft is drawn at least, on screen, in pixels. */
export const MIN_PLANE_PX = 40;
/** The most points a trail holds: the newest part of the ground track (over 30 minutes at the live screen's 0.25 s). */
const TRAIL_POINTS = 8000;
/** The most points a planned path holds, and its dashes on screen (pixels), as the 2D view's 7 on, 6 off. */
const PLAN_POINTS = 4000;
const PLAN_DASH_PX = Object.freeze({ on: 7, off: 6 });
/** Room for the 3D guides (the 3/9 and 7/5 lines and the turn circles), in points. */
const GUIDE_LINE_POINTS = 4000;
const CIRCLE_STEPS = 48;
/** Half the depth range the 3D camera keeps round the formation, feet (the grid beyond it simply isn't drawn). */
const DEPTH_HALF_FT = 60_000;
/** The 3D cone's facets: round the tail, and across the 30-60° band. */
const CONE_ROUND_STEPS = 48;
const CONE_BAND_STEPS = 6;

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
/** @param {number} v @param {ArrayLike<number>} range [min, max] */
const clamp = (v, range) => Math.max(range[0], Math.min(range[1], v));
const wrapRad = (r) => Math.atan2(Math.sin(r), Math.cos(r));

/**
 * The yaw that puts the camera behind an aircraft flying `headingRad` (radians from east,
 * counter-clockwise, as the engine has it): matchProjection's screen-up is the world direction
 * (sin yaw, cos yaw), and the aircraft's direction is (cos h, sin h), so yaw = 90 - heading.
 */
export function yawBehind(headingRad) {
  const yaw = 90 - deg(headingRad);
  return ((((yaw + 180) % 360) + 360) % 360) - 180;
}

/** A camera change from a drag of (dx, dy) pixels. */
export function orbit(camera, dx, dy) {
  const yaw = camera.yawDeg + dx * ORBIT_DEG_PER_PX.yaw;
  return {
    ...camera,
    yawDeg: ((((yaw + 180) % 360) + 360) % 360) - 180,
    pitchDeg: clamp(camera.pitchDeg - dy * ORBIT_DEG_PER_PX.pitch, CAMERA_LIMITS.pitch),
  };
}

/** A camera change from one wheel notch: in when `deltaY` is negative. */
export function zoomBy(camera, deltaY) {
  return { ...camera, zoom: clamp(camera.zoom * (deltaY < 0 ? WHEEL_ZOOM.in : WHEEL_ZOOM.out), CAMERA_LIMITS.zoom) };
}

/** +1 for a left turn (heading grows, counter-clockwise), -1 for a right turn, 0 for no change. */
export function turnSign(previousHeadingRad, headingRad) {
  const d = wrapRad(headingRad - previousHeadingRad);
  return Math.abs(d) < 1e-9 ? 0 : Math.sign(d);
}

/**
 * Where and how one aircraft is drawn, from the engine's state alone: the world point, the heading,
 * the bank with the wing down positive on the left (`sign` is +1 for a left turn, from turnSign; the
 * live screen's bank is already signed, so it passes +1) and the nose above the horizon.
 * The model is then set with rotation.set(-bank, -pitch, heading), order 'ZYX'.
 */
export function aircraftPose(a, sign = 1) {
  return {
    x: a.xFt,
    y: a.yFt,
    z: altToZ(FLIGHT_ALT_FT + (a.altAboveFt ?? 0), ALT_SCALE),
    headingRad: a.headingRad,
    bankRad: rad(a.bankDeg) * (sign < 0 ? -1 : 1),
    pitchRad: rad(a.pitchDeg ?? 0),
  };
}

/**
 * Feet an aircraft is drawn at, at a zoom (pixels per 1,000 ft): its real length, or MIN_PLANE_PX if that is smaller on
 * screen, times `scale`; with `real` (Real aircraft size, Patrick 5 Oct) its real length whatever the zoom.
 */
export function planeLengthFt(zoom, { real = false, scale = 1 } = {}) {
  if (real) return T6_LENGTH_FT;
  const pxPerFt = zoom / 1000;
  return Math.max(T6_LENGTH_FT, MIN_PLANE_PX / pxPerFt) * scale;
}

/** The camera that shows `bounds` (feet) whole in a canvas of `size`, behind Lead, at the start pitch. */
export function fitCamera(bounds, size, leadHeadingRad) {
  const spanX = bounds.maxX - bounds.minX;
  const spanY = bounds.maxY - bounds.minY;
  // The picture turns with the yaw, so fit the diagonal, which holds whatever way it is turned.
  const span = Math.max(Math.hypot(spanX, spanY), 1);
  const pxPerFt = (0.9 * Math.max(1, Math.min(size.width, size.height))) / span;
  return {
    center: { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 },
    camera: {
      yawDeg: yawBehind(leadHeadingRad),
      pitchDeg: CAMERA_START_PITCH_DEG,
      zoom: clamp(pxPerFt * 1000, CAMERA_LIMITS.zoom),
      altScale: ALT_SCALE,
    },
  };
}

/**
 * canvas: the 3D <canvas>, sized by CSS (it holds the WebGL context, so it is never used for 2D).
 * timers: the module's scheduler scope (frame). source: {
 *   state(): the engine's live state; trails(): { trail }; layers(): { followLead };
 *   focus?(): { x, y } to keep in the middle (the live screen follows the formation);
 *   fitBounds?(): bounds { minX, minY, maxX, maxY } (feet) the zoom keeps in the picture, or null to leave the zoom alone;
 *   paint(): 'harvard' or 'ship'; bankSigns(): { id: +1 or -1 }; colors: { id: '#rrggbb' } }.
 * onUserMove(kind): the person orbited ('orbit') or zoomed ('zoom'). win: for tests.
 * Returns { show, hide, requestDraw, fit, dispose, stats }.
 */
export function createView3d(canvas, { timers, source, overlay = null, onUserMove = (_kind) => {}, win = globalThis }) {
  let THREE = null;
  let gl = null; // { renderer, scene, camera, sky, grid, planes: Map, trails: Map }
  let visible = false;
  let disposed = false;
  let loading = null;
  let pendingFrame = null;
  let drawn = 0;
  let resizer = null;
  let dragging = null;
  let center = { x: 0, y: 0 };
  let cam = { yawDeg: 0, pitchDeg: CAMERA_START_PITCH_DEG, zoom: 20, altScale: ALT_SCALE };
  let waitingFit = null; // a fit asked before three had loaded, or before the canvas had a size
  let paintNow = null;
  let userZoom = 1; // the person's wheel zoom on top of the fit-all zoom (Patrick, 5 Oct: the zoom keeps following the formation)

  const size = () => ({ width: Math.max(1, canvas.clientWidth), height: Math.max(1, canvas.clientHeight) });

  function build() {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2);
    addLights(THREE, scene);
    const sky = addSky(THREE, scene);
    // The same charcoal as 2D, flat, with its fog (Patrick, 5 Oct), and a faint grey ground grid.
    scene.background = new THREE.Color(BACKGROUND);
    scene.fog?.color.set(BACKGROUND);
    const grid = new THREE.GridHelper(GRID_STEP_FT * GRID_CELLS, GRID_CELLS, '#3a434c', '#2b333b');
    grid.rotation.x = Math.PI / 2; // GridHelper is flat in X-Z; the sim's ground is X-Y
    grid.material.fog = false;
    scene.add(grid);
    // The guides (Patrick, 5 Oct: every layer in 3D too): dashed lines in each aircraft's colour. The Cone is its own object (syncCones).
    const guideLines = new THREE.LineSegments(guideGeometry(GUIDE_LINE_POINTS), new THREE.LineDashedMaterial({ vertexColors: true, transparent: true, opacity: 0.6, fog: false }));
    guideLines.frustumCulled = false;
    scene.add(guideLines);
    gl = { renderer, scene, camera, sky, grid, planes: new Map(), trails: new Map(), plans: new Map(), guideLines, cones: new Map(), coneGeometry: {} };
  }

  function planeFor(id) {
    let entry = gl.planes.get(id);
    if (entry && entry.paint !== paintNow) {
      disposeAircraftMesh(entry.mesh);
      gl.planes.delete(id);
      entry = null;
    }
    if (!entry) {
      const mesh = createCt156Model(THREE, { color: source.colors[id] ?? '#ffffff', number: id, paint: paintNow, lengthFt: CT156_UNIT_LENGTH });
      mesh.rotation.order = 'ZYX';
      gl.scene.add(mesh);
      entry = { mesh, paint: paintNow };
      gl.planes.set(id, entry);
    }
    return entry.mesh;
  }

  function trailFor(id) {
    let line = gl.trails.get(id);
    if (!line) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_POINTS * 3), 3));
      geometry.setDrawRange(0, 0);
      // A faint line (Patrick, 5 Oct: "a more translucent line").
      line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: source.colors[id] ?? '#ffffff', transparent: true, opacity: 0.3, fog: false }));
      line.frustumCulled = false;
      gl.scene.add(line);
      gl.trails.set(id, line);
    }
    return line;
  }

  function guideGeometry(points) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points * 3), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(points * 3), 3));
    geometry.setDrawRange(0, 0);
    return geometry;
  }

  /**
   * The 3/9 line, the 7/5 lines and the turn circles in 3D, as the 2D view draws them (view.js): at each
   * aircraft's height, in its colour, for the aircraft ticked in each list.
   */
  function drawGuides(state, layers, lengthFt) {
    const lines = gl.guideLines.geometry;
    let nl = 0;
    const colour = new THREE.Color();
    const put = (geo, i, x, y, z) => {
      geo.attributes.position.setXYZ(i, x, y, z);
      geo.attributes.color.setXYZ(i, colour.r, colour.g, colour.b);
    };
    const seg = (a, b) => {
      if (nl + 2 > GUIDE_LINE_POINTS) return;
      put(lines, nl++, ...a);
      put(lines, nl++, ...b);
    };
    for (const a of state.aircraft) {
      colour.set(source.colors[a.id] ?? '#ffffff');
      const z = aircraftPose(a).z;
      const out = (h, r) => [a.xFt + Math.cos(h) * r, a.yFt + Math.sin(h) * r, z];
      colour.set(CLOCK_LINE_RED); // the 3/9 and 7/5 lines are red (Patrick, 5 Oct)
      if (layers.lead39 && layers[`l39_${a.id}`]) seg(out(a.headingRad + Math.PI / 2, lengthFt), out(a.headingRad - Math.PI / 2, lengthFt));
      if (layers.lead75 && layers[`l75_${a.id}`]) {
        for (const off of [Math.PI / 6, -Math.PI / 6]) seg([a.xFt, a.yFt, z], out(a.headingRad + Math.PI + off, lengthFt));
      }
      // The circle each banked aircraft is flying now, as the 2D live view's (view.js drawBankCircles).
      colour.set(source.colors[a.id] ?? '#ffffff');
      if (layers.turnCircles && !state.finished && a.bankDeg) {
        const r = turnRadiusFromBankFt(a.tasFtps, Math.abs(a.bankDeg));
        const side = Math.sign(a.bankDeg);
        const cx = a.xFt + Math.cos(a.headingRad + side * Math.PI / 2) * r;
        const cy = a.yFt + Math.sin(a.headingRad + side * Math.PI / 2) * r;
        const p = (i) => [cx + Math.cos((2 * Math.PI * i) / CIRCLE_STEPS) * r, cy + Math.sin((2 * Math.PI * i) / CIRCLE_STEPS) * r, z];
        for (let i = 0; i < CIRCLE_STEPS; i++) seg(p(i), p(i + 1));
      }
    }
    syncCones(state, layers);
    lines.attributes.position.needsUpdate = true;
    lines.attributes.color.needsUpdate = true;
    lines.setDrawRange(0, nl);
    if (nl) gl.guideLines.computeLineDistances();
  }

  /**
   * The fighting wing cone in 3D (Patrick, 5 Oct: "actually 3D", a true cone round the tail): the 2D band spun round the
   * aircraft's tail line, a hollow shell from 30° to 60° off the tail (60-30° of sweep from the wing line) and 500-1,000 ft
   * out (SMM 12.29 para 69, Fig 12.19; FW_TURN.band). Built once in the aircraft's own frame (x forward, y left, z up) and
   * turned with it, so it banks and pitches as the aircraft does.
   */
  function coneGeometry(shape) {
    if (gl.coneGeometry[shape]) return gl.coneGeometry[shape];
    const { minFt, maxFt, minSweepDeg, maxSweepDeg } = FW_TURN.band;
    const tris = [];
    const edges = [];
    const quad = (a, b, c, d) => tris.push(...a, ...b, ...c, ...a, ...c, ...d);
    if (shape === 'flat') {
      // The 2D band at the aircraft's height, both sides (the 2D view's drawCone): a bearing of nose + side·(90° + sweep).
      const at = (r, side, sweepDeg) => {
        const b = side * (Math.PI / 2 + rad(sweepDeg));
        return [r * Math.cos(b), r * Math.sin(b), 0];
      };
      for (const side of [1, -1]) {
        for (let i = 0; i < CONE_BAND_STEPS * 2; i++) {
          const s0 = minSweepDeg + ((maxSweepDeg - minSweepDeg) * i) / (CONE_BAND_STEPS * 2);
          const s1 = minSweepDeg + ((maxSweepDeg - minSweepDeg) * (i + 1)) / (CONE_BAND_STEPS * 2);
          quad(at(minFt, side, s0), at(maxFt, side, s0), at(maxFt, side, s1), at(minFt, side, s1));
          for (const r of [minFt, maxFt]) edges.push(...at(r, side, s0), ...at(r, side, s1));
        }
        for (const s of [minSweepDeg, maxSweepDeg]) edges.push(...at(minFt, side, s), ...at(maxFt, side, s));
      }
    } else {
      const offTail = [90 - maxSweepDeg, 90 - minSweepDeg].map(rad); // 30° and 60° off the tail
      const at = (r, alpha, phi) => [-r * Math.cos(alpha), r * Math.sin(alpha) * Math.cos(phi), r * Math.sin(alpha) * Math.sin(phi)];
      for (let j = 0; j < CONE_ROUND_STEPS; j++) {
        const p0 = (2 * Math.PI * j) / CONE_ROUND_STEPS;
        const p1 = (2 * Math.PI * (j + 1)) / CONE_ROUND_STEPS;
        for (const alpha of offTail) quad(at(minFt, alpha, p0), at(maxFt, alpha, p0), at(maxFt, alpha, p1), at(minFt, alpha, p1)); // inner and outer walls
        for (let i = 0; i < CONE_BAND_STEPS; i++) {
          const a0 = offTail[0] + ((offTail[1] - offTail[0]) * i) / CONE_BAND_STEPS;
          const a1 = offTail[0] + ((offTail[1] - offTail[0]) * (i + 1)) / CONE_BAND_STEPS;
          for (const r of [minFt, maxFt]) quad(at(r, a0, p0), at(r, a1, p0), at(r, a1, p1), at(r, a0, p1)); // the 500 and 1,000 ft caps
        }
        // Only the four rims, faint: no lines across the cone (Patrick, 5 Oct: "get rid of the lines in the cone").
        for (const alpha of offTail) for (const r of [minFt, maxFt]) edges.push(...at(r, alpha, p0), ...at(r, alpha, p1));
      }
    }
    const fill = new THREE.BufferGeometry();
    fill.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tris), 3));
    const lines = new THREE.BufferGeometry();
    lines.setAttribute('position', new THREE.BufferAttribute(new Float32Array(edges), 3));
    gl.coneGeometry[shape] = { fill, lines };
    return gl.coneGeometry[shape];
  }

  function syncCones(state, layers) {
    const signs = source.bankSigns();
    const want = new Set();
    for (const a of state.aircraft) {
      if (!layers.cone || !layers[`cone_${a.id}`]) continue;
      want.add(a.id);
      const shape = layers.coneShape === 'flat' ? 'flat' : '3d';
      const geo = coneGeometry(shape);
      let cone = gl.cones.get(a.id);
      if (!cone) {
        const colour = source.colors[a.id] ?? '#ffffff';
        cone = new THREE.Group();
        cone.add(
          new THREE.Mesh(geo.fill, new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, fog: false })),
          new THREE.LineSegments(geo.lines, new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: 0.25, fog: false })),
        );
        cone.rotation.order = 'ZYX';
        for (const o of cone.children) o.frustumCulled = false;
        gl.scene.add(cone);
        gl.cones.set(a.id, cone);
      }
      cone.children[0].geometry = geo.fill;
      cone.children[1].geometry = geo.lines;
      const pose = aircraftPose(a, signs[a.id] ?? 1);
      cone.position.set(pose.x, pose.y, pose.z);
      if (shape === 'flat') cone.rotation.set(0, 0, pose.headingRad); // the 2D band stays level, turned with the heading
      else cone.rotation.set(-pose.bankRad, -pose.pitchRad, pose.headingRad); // as the aircraft model
    }
    for (const [id, cone] of gl.cones) {
      if (want.has(id)) continue;
      cone.removeFromParent();
      for (const o of cone.children) o.material.dispose();
      gl.cones.delete(id);
    }
  }

  /** Each aircraft's path still to fly, dashed in its colour (the 2D view's planned paths; Patrick, 5 Oct: in 3D too). */
  function planFor(id) {
    let line = gl.plans.get(id);
    if (!line) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PLAN_POINTS * 3), 3));
      geometry.setDrawRange(0, 0);
      line = new THREE.Line(geometry, new THREE.LineDashedMaterial({ color: source.colors[id] ?? '#ffffff', transparent: true, opacity: 0.75, fog: false }));
      line.frustumCulled = false;
      gl.scene.add(line);
      gl.plans.set(id, line);
    }
    return line;
  }

  function draw() {
    if (!gl || !visible || disposed) return;
    const { renderer, scene, camera } = gl;
    const box = size();
    const ratio = Math.min(win.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(ratio);
    renderer.setSize(box.width, box.height, false);

    if (waitingFit) {
      const fitted = fitCamera(waitingFit.bounds, box, waitingFit.headingRad);
      center = fitted.center;
      cam = fitted.camera;
      waitingFit = null;
    }
    // The fit-all camera (spec section 10.3): the zoom eases toward the one that keeps `fitBounds` in the picture, as the
    // 2D view's does; the yaw and pitch stay the person's. Nothing moves while they drag.
    const keep = !dragging && source.fitBounds?.();
    if (keep) {
      const want = clamp(fitCamera(keep, box, 0).camera.zoom * userZoom, CAMERA_LIMITS.zoom);
      cam = { ...cam, zoom: cam.zoom + (want - cam.zoom) * FIT_ZOOM_EASE };
    }
    const state = source.state();
    const lead = state.aircraft.find((a) => a.id === 1);
    // Follow or Padlock (Patrick, 5 Oct): the camera's yaw comes from the aircraft it is on; the pitch stays the person's.
    const look = !dragging && source.look?.();
    if (look) cam = { ...cam, yawDeg: look.yawDeg };
    const held = dragging?.camera ?? cam;
    // Padlock tilts by the other aircraft's elevation on top of the person's tilt, so it looks up when the other is above.
    const shown = look?.pitchUpDeg ? { ...held, pitchDeg: clamp(held.pitchDeg + look.pitchUpDeg, PADLOCK_PITCH) } : held;
    const wanted = source.focus?.();
    // Free (Patrick, 5 Oct): nothing to follow, so the camera stays where it last was, and shift-drag or right-drag pans it.
    if (wanted) center = { x: wanted.x, y: wanted.y };
    const focus = wanted ?? (source.layers().followLead && lead ? { x: lead.xFt, y: lead.yFt } : center);
    paintNow = source.paint();

    const signs = source.bankSigns();
    const sizing = source.layers();
    const lengthFt = planeLengthFt(shown.zoom, { real: Boolean(sizing.realSize), scale: sizing.planeScale ?? 1 });
    const present = new Set();
    for (const a of state.aircraft) {
      present.add(a.id);
      const pose = aircraftPose(a, signs[a.id] ?? 1);
      const mesh = planeFor(a.id);
      mesh.position.set(pose.x, pose.y, pose.z);
      mesh.scale.setScalar(lengthFt / CT156_UNIT_LENGTH);
      mesh.rotation.set(-pose.bankRad, -pose.pitchRad, pose.headingRad);
    }
    for (const [id, entry] of gl.planes) {
      if (present.has(id)) continue;
      disposeAircraftMesh(entry.mesh); // a two-ship has no #3 or #4
      gl.planes.delete(id);
    }

    const layers = source.layers();
    const trail = trailSince(source.trails().trail, state.tSec, layers.trackSec);
    for (const a of state.aircraft) {
      const points = layers.tracks === false ? [] : trail[a.id] ?? []; // the Tracks tick, as in 2D
      const line = trailFor(a.id);
      const attr = line.geometry.attributes.position;
      const every = 1; // every track point, a smooth line
      const count = Math.min(Math.floor(points.length / every), TRAIL_POINTS);
      const first = points.length - count * every;
      for (let i = 0; i < count; i++) {
        const p = points[first + i * every];
        attr.setXYZ(i, p[1], p[2], altToZ(FLIGHT_ALT_FT + (p[3] ?? 0), ALT_SCALE));
      }
      attr.needsUpdate = true;
      line.geometry.setDrawRange(0, count);
    }
    for (const [id, line] of gl.trails) {
      if (present.has(id)) continue;
      line.removeFromParent();
      line.geometry.dispose();
      line.material.dispose();
      gl.trails.delete(id);
    }

    const planned = layers.planned && source.planned ? source.planned() ?? {} : {};
    const ftPerPx = 1000 / shown.zoom;
    for (const a of state.aircraft) {
      const ahead = (planned[a.id] ?? []).filter((p) => p[0] >= state.tSec - 1e-9);
      const line = planFor(a.id);
      const attr = line.geometry.attributes.position;
      const count = Math.min(ahead.length, PLAN_POINTS);
      for (let i = 0; i < count; i++) {
        const p = ahead[i];
        attr.setXYZ(i, p[1], p[2], altToZ(FLIGHT_ALT_FT + (p[3] ?? 0), ALT_SCALE));
      }
      attr.needsUpdate = true;
      line.geometry.setDrawRange(0, count >= 2 ? count : 0);
      if (count >= 2) line.computeLineDistances();
      line.material.dashSize = PLAN_DASH_PX.on * ftPerPx;
      line.material.gapSize = PLAN_DASH_PX.off * ftPerPx;
    }
    drawGuides(state, layers, (Math.max(box.width, box.height) * ftPerPx) * 0.75);
    gl.guideLines.material.dashSize = 8 * ftPerPx;
    gl.guideLines.material.gapSize = 24 * ftPerPx; // quieter: half the dashes, wider gaps (Patrick, 5 Oct)
    for (const [id, line] of gl.plans) {
      if (present.has(id)) continue;
      line.removeFromParent();
      line.geometry.dispose();
      line.material.dispose();
      gl.plans.delete(id);
    }

    // The ground follows the view in whole grid steps, so it looks endless and still.
    gl.grid.position.set(
      Math.round(focus.x / GRID_STEP_FT) * GRID_STEP_FT,
      Math.round(focus.y / GRID_STEP_FT) * GRID_STEP_FT,
      altToZ(FLIGHT_ALT_FT, ALT_SCALE) - GROUND_BELOW_FT,
    );

    matchProjection(THREE, camera, { x: focus.x, y: focus.y, z: FLIGHT_ALT_FT }, shown, box, 1);
    // A depth range round the formation only (the shared one spans Traffic's 30-mile scene), so close up the aircraft's
    // near-touching surfaces don't flicker through each other (Patrick, 5 Oct: the striped tails).
    const mid = (camera.near + camera.far) / 2;
    camera.near = mid - DEPTH_HALF_FT;
    camera.far = mid + DEPTH_HALF_FT;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    drawTagsOver(state, layers, box, ratio, signs);
    drawn++;
    canvas.dataset.draws = String(drawn);
  }

  /** The info tags over the 3D picture, beside each aircraft where it is drawn (Patrick, 5 Oct: tags in 3D too). */
  function drawTagsOver(state, layers, box, ratio, signs) {
    if (!overlay) return;
    const w = Math.round(box.width * ratio);
    const h = Math.round(box.height * ratio);
    if (overlay.width !== w || overlay.height !== h) {
      overlay.width = w;
      overlay.height = h;
    }
    const ctx = overlay.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const tags = layers.tags ? source.tags?.() : null;
    if (!tags) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const screenOf = (a) => {
      const pose = aircraftPose(a, signs[a.id] ?? 1);
      const p = worldToScreen(THREE, gl.camera, { x: pose.x, y: pose.y, z: pose.z }, box.width, box.height);
      return [p.x, p.y];
    };
    const noseOf = (a) => {
      const pose = aircraftPose(a, signs[a.id] ?? 1);
      const p = worldToScreen(THREE, gl.camera, { x: pose.x + Math.cos(a.headingRad) * 100, y: pose.y + Math.sin(a.headingRad) * 100, z: pose.z }, box.width, box.height);
      return [p.x, p.y];
    };
    drawTags(ctx, { screenOf, noseOf, size: box }, state, tags);
  }

  function requestDraw() {
    if (disposed || !visible || !gl || pendingFrame) return;
    pendingFrame = timers.frame(() => {
      pendingFrame();
      pendingFrame = null;
      draw();
    });
  }

  function stopFrame() {
    pendingFrame?.();
    pendingFrame = null;
  }

  // ---- the person's hands: drag to orbit, wheel or + and - to zoom -------------------------
  const endDrag = (e) => {
    if (!dragging || e.pointerId !== dragging.id) return;
    cam = dragging.camera;
    dragging = null;
    canvas.classList.remove('is-dragging');
  };
  const zoomTo = (deltaY) => {
    const was = cam.zoom;
    cam = zoomBy(cam, deltaY);
    if (source.fitBounds?.()) userZoom *= cam.zoom / was; // following: the wheel sets how close, the fit keeps adjusting
    onUserMove('zoom');
    requestDraw();
  };
  const hands = [
    ['contextmenu', (e) => e.preventDefault()], // right-drag pans
    ['pointerdown', (e) => {
      if (e.button !== 0 && e.button !== 2) return;
      dragging = { id: e.pointerId, x: e.clientX, y: e.clientY, camera: cam, pan: e.button === 2 || e.shiftKey };
      canvas.setPointerCapture?.(e.pointerId);
      canvas.classList.add('is-dragging');
    }],
    ['pointermove', (e) => {
      if (!dragging || e.pointerId !== dragging.id) return;
      if (dragging.pan) {
        // Pan along the ground: screen right is (cos yaw, -sin yaw), screen up is (sin yaw, cos yaw) (matchProjection).
        const ftPerPx = 1000 / cam.zoom;
        const yaw = rad(cam.yawDeg);
        const dx = (e.clientX - dragging.x) * ftPerPx;
        const dy = (e.clientY - dragging.y) * ftPerPx;
        center = { x: center.x - dx * Math.cos(yaw) + dy * Math.sin(yaw), y: center.y + dx * Math.sin(yaw) + dy * Math.cos(yaw) };
        dragging.x = e.clientX;
        dragging.y = e.clientY;
        onUserMove('pan');
        requestDraw();
        return;
      }
      dragging.camera = orbit(dragging.camera, e.clientX - dragging.x, e.clientY - dragging.y);
      dragging.x = e.clientX;
      dragging.y = e.clientY;
      onUserMove('orbit');
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
  ];
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', '3D view of the formation from behind Lead. Drag to turn it, scroll or press + and − to zoom.');
  for (const [type, fn] of hands) canvas.addEventListener(type, fn, type === 'wheel' ? { passive: false } : undefined);

  return {
    /**
     * Shows the 3D view, loading three.js the first time. Resolves { ok: true }, or { ok: false, reason }:
     * 'load' when three.js could not be fetched (offline) and 'gl' when the browser has no WebGL.
     * A later call after a failure tries again.
     */
    async show() {
      if (disposed) return { ok: false, reason: 'closed' };
      if (!gl) {
        loading ??= (async () => {
          // No WebGL2 (what three needs): stay in 2D without downloading three.js or logging a context error.
          if (!webglSupported()) return { ok: false, reason: 'gl' };
          try {
            THREE = await loadThree();
          } catch (err) {
            console.warn('three.js could not be loaded:', err);
            return { ok: false, reason: 'load' };
          }
          if (disposed) return { ok: false, reason: 'closed' };
          try {
            build();
          } catch (err) {
            console.warn('WebGL could not start:', err);
            return { ok: false, reason: 'gl' };
          }
          return { ok: true };
        })();
        const result = await loading;
        loading = null;
        if (!result.ok) return result;
      }
      if (disposed) return { ok: false, reason: 'closed' };
      visible = true;
      if (win.ResizeObserver && !resizer) {
        resizer = new win.ResizeObserver(() => requestDraw());
        resizer.observe(canvas);
      }
      requestDraw();
      return { ok: true };
    },
    /** Stops drawing (2D is showing, or the Turn Sim is closing). The scene stays, ready to show again. */
    hide() {
      visible = false;
      stopFrame();
      resizer?.disconnect();
      resizer = null;
    },
    requestDraw,
    /** Puts the whole of `bounds` in view, behind Lead (`leadHeadingRad`), at the next draw. */
    fit(bounds, leadHeadingRad) {
      if (!bounds) return;
      userZoom = 1;
      waitingFit = { bounds, headingRad: leadHeadingRad };
      requestDraw();
    },
    stats: () => ({ loaded: Boolean(gl), visible, drawn, pending: Boolean(pendingFrame) }),
    dispose() {
      if (disposed) return;
      disposed = true;
      visible = false;
      stopFrame();
      resizer?.disconnect();
      resizer = null;
      for (const [type, fn] of hands) canvas.removeEventListener(type, fn);
      if (!gl) return;
      for (const { mesh } of gl.planes.values()) disposeAircraftMesh(mesh);
      for (const line of [...gl.trails.values(), ...gl.plans.values(), gl.guideLines]) {
        line.geometry.dispose();
        line.material.dispose();
      }
      for (const cone of gl.cones.values()) for (const o of cone.children) o.material.dispose();
      for (const geo of Object.values(gl.coneGeometry)) {
        geo.fill.dispose();
        geo.lines.dispose();
      }
      gl.grid.geometry.dispose();
      gl.grid.material.dispose();
      gl.sky.dispose();
      gl.renderer.dispose();
      gl.renderer.forceContextLoss?.();
      gl = null;
    },
  };
}
