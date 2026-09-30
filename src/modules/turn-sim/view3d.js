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
  loadThree, matchProjection, altToZ, addLights, addSky, disposeAircraftMesh,
} from '../../ui-kit/three-aircraft.js';
import { createCt156Model, CT156_UNIT_LENGTH } from '../../ui-kit/ct156-model.js';

/** The Turn Sim is flat: every aircraft flies at this one altitude (feet). */
export const FLIGHT_ALT_FT = 0;
/** The ground grid sits this far below the aircraft, so there is something to judge the view against. */
const GROUND_BELOW_FT = 1500;
const GRID_STEP_FT = 5000;
const GRID_CELLS = 40;
const ALT_SCALE = 1;

/** Camera limits: the pitch is above the horizon (5 to 80 degrees) and zoom is pixels per 1,000 ft. */
export const CAMERA_LIMITS = Object.freeze({ pitch: [5, 80], zoom: [0.5, 400] });
export const CAMERA_START_PITCH_DEG = 35;
const ORBIT_DEG_PER_PX = Object.freeze({ yaw: 0.4, pitch: 0.25 });
const WHEEL_ZOOM = Object.freeze({ in: 1.12, out: 0.89 });

/** Real length of a T-6 (feet). A zoomed-out aircraft is drawn bigger than that, so it can still be seen. */
export const T6_LENGTH_FT = 33.4;
/** The length an aircraft is drawn at least, on screen, in pixels. */
export const MIN_PLANE_PX = 40;
/** The most points a trail holds (TRAIL_SEC of 0.05 s steps, with room). */
const TRAIL_POINTS = 1300;

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
 * Where and how one aircraft is drawn, from the engine's state alone: the world point, the heading
 * and the bank with the wing down positive on the left (`sign` is +1 for a left turn, from turnSign).
 * The model is then set with rotation.set(-bank, 0, heading), order 'ZYX'.
 */
export function aircraftPose(a, sign = 1) {
  return {
    x: a.xFt,
    y: a.yFt,
    z: altToZ(FLIGHT_ALT_FT, ALT_SCALE),
    headingRad: a.headingRad,
    bankRad: rad(a.bankDeg) * (sign < 0 ? -1 : 1),
  };
}

/** Feet an aircraft is drawn at, at a zoom (pixels per 1,000 ft): its real length, or MIN_PLANE_PX if that is smaller on screen. */
export function planeLengthFt(zoom) {
  const pxPerFt = zoom / 1000;
  return Math.max(T6_LENGTH_FT, MIN_PLANE_PX / pxPerFt);
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
 *   paint(): 'harvard' or 'ship'; bankSigns(): { id: +1 or -1 }; colors: { id: '#rrggbb' } }.
 * onUserMove(): the person orbited or zoomed. win: for tests.
 * Returns { show, hide, requestDraw, fit, dispose, stats }.
 */
export function createView3d(canvas, { timers, source, onUserMove = () => {}, win = globalThis }) {
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

  const size = () => ({ width: Math.max(1, canvas.clientWidth), height: Math.max(1, canvas.clientHeight) });

  function build() {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2);
    addLights(THREE, scene);
    const sky = addSky(THREE, scene);
    const grid = new THREE.GridHelper(GRID_STEP_FT * GRID_CELLS, GRID_CELLS, '#2c5a44', '#1c3a30');
    grid.rotation.x = Math.PI / 2; // GridHelper is flat in X-Z; the sim's ground is X-Y
    grid.material.fog = false;
    scene.add(grid);
    gl = { renderer, scene, camera, sky, grid, planes: new Map(), trails: new Map() };
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
      line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: source.colors[id] ?? '#ffffff', fog: false }));
      line.frustumCulled = false;
      gl.scene.add(line);
      gl.trails.set(id, line);
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
    const state = source.state();
    const lead = state.aircraft.find((a) => a.id === 1);
    const shown = dragging?.camera ?? cam;
    const focus = source.layers().followLead && lead ? { x: lead.xFt, y: lead.yFt } : center;
    paintNow = source.paint();

    const signs = source.bankSigns();
    const lengthFt = planeLengthFt(shown.zoom);
    const present = new Set();
    for (const a of state.aircraft) {
      present.add(a.id);
      const pose = aircraftPose(a, signs[a.id] ?? 1);
      const mesh = planeFor(a.id);
      mesh.position.set(pose.x, pose.y, pose.z);
      mesh.scale.setScalar(lengthFt / CT156_UNIT_LENGTH);
      mesh.rotation.set(-pose.bankRad, 0, pose.headingRad);
    }
    for (const [id, entry] of gl.planes) {
      if (present.has(id)) continue;
      disposeAircraftMesh(entry.mesh); // a two-ship has no #3 or #4
      gl.planes.delete(id);
    }

    const { trail } = source.trails();
    for (const a of state.aircraft) {
      const points = trail[a.id] ?? [];
      const line = trailFor(a.id);
      const attr = line.geometry.attributes.position;
      const count = Math.min(points.length, TRAIL_POINTS);
      const first = points.length - count;
      for (let i = 0; i < count; i++) {
        const p = points[first + i];
        attr.setXYZ(i, p[1], p[2], altToZ(FLIGHT_ALT_FT, ALT_SCALE));
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

    // The ground follows the view in whole grid steps, so it looks endless and still.
    gl.grid.position.set(
      Math.round(focus.x / GRID_STEP_FT) * GRID_STEP_FT,
      Math.round(focus.y / GRID_STEP_FT) * GRID_STEP_FT,
      altToZ(FLIGHT_ALT_FT, ALT_SCALE) - GROUND_BELOW_FT,
    );

    matchProjection(THREE, camera, { x: focus.x, y: focus.y, z: FLIGHT_ALT_FT }, shown, box, 1);
    renderer.render(scene, camera);
    drawn++;
    canvas.dataset.draws = String(drawn);
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
    cam = zoomBy(cam, deltaY);
    onUserMove();
    requestDraw();
  };
  const hands = [
    ['pointerdown', (e) => {
      if (e.button !== 0) return;
      dragging = { id: e.pointerId, x: e.clientX, y: e.clientY, camera: cam };
      canvas.setPointerCapture?.(e.pointerId);
      canvas.classList.add('is-dragging');
    }],
    ['pointermove', (e) => {
      if (!dragging || e.pointerId !== dragging.id) return;
      dragging.camera = orbit(dragging.camera, e.clientX - dragging.x, e.clientY - dragging.y);
      dragging.x = e.clientX;
      dragging.y = e.clientY;
      onUserMove();
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
      for (const line of gl.trails.values()) {
        line.geometry.dispose();
        line.material.dispose();
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
