// The Turn Fight's 3D view (SPEC-turn-fight, "2D and 3D views"): the same run as
// the 2D pictures, drawn with three.js through ui-kit's shared pieces
// (three-aircraft.js, ct156-model.js). It only READS the run ({ fight, trails },
// see playback.js): position, heading, pitch and trails are the fight's own, and
// nothing here changes a number, so switching views never resets the fight.
//
// three.js loads when 3D is first switched on (start()) and never before, so the
// 2D screen costs nothing extra. Everything 3D lives between start() and stop():
// stop() frees every model, the sky, the renderer and its WebGL context and stops
// the frame, so a paused or 2D screen holds no GPU resources (R4). The canvas is
// made new for each start, because a WebGL context that was released cannot be
// used again. If the browser takes the context away while 3D shows (the graphics card was reset), the view
// frees everything and tells the screen (onLost), which shows 2D with a note; the fight is not touched. The
// view draws one frame when asked (requestDraw): while the fight
// plays, or when the camera moves, and never otherwise.
//
// The camera is ui-kit's matchProjection, with points placed through altToZ;
// nothing here does camera maths beyond choosing yaw, pitch, zoom and centre.
// Units: feet, radians in the fight; degrees for the camera (as matchProjection
// has it, where pitch 0 looks straight down and 90 looks along the ground).
import { wrapPi, headingRad } from '../../core/angles.js';
import {
  loadThree, matchProjection, worldToScreen, altToZ, addLights, addSky, webglSupported,
} from '../../ui-kit/three-aircraft.js';
import { createCt156Model, disposeCt156Model, CT156_UNIT_LENGTH } from '../../ui-kit/ct156-model.js';
import { FT_PER_NM } from '../../core/units.js';
import { FIGHT_MAX_SEC } from './sim.js';
import { TRAIL_INTERVAL_SEC } from './trails.js';
import { MIN_REACH_FT } from './view.js';
import { passMarkWord } from './geometry.js';

/** The fight's heights go in as they are: no height scale in 3D (the 2D side view's scale is for that view only). */
export const ALT_SCALE = 1;

/** V6's picture colours, as in view.js (a test there keeps them equal to the page's). */
const COLORS = Object.freeze({ blue: '#58a6ff', red: '#ff6b6b', nose: '#ffcc66' });
const LETTERS = Object.freeze({ blue: 'B', red: 'R' });
const SHIPS = ['blue', 'red'];

/** Real length of a T-6 (feet). Zoomed out, an aircraft is drawn bigger than that so it can still be seen. */
export const T6_LENGTH_FT = 33.4;
/** The length an aircraft is drawn at least, on screen, in pixels. */
export const MIN_PLANE_PX = 56;

/** Camera limits: pitch is degrees from straight down (0 to 85), zoom is pixels per 1,000 ft. */
export const CAMERA_LIMITS = Object.freeze({ pitch: [0, 85], zoom: [0.3, 2000] });
export const DEFAULT_CAMERA = Object.freeze({ mode: 'fit', yawDeg: 0, pitchDeg: 35, zoom: 40, zoomAuto: true });
/** A chase view looks from behind and a little above, 20 degrees over the horizon. */
export const CHASE_PITCH_DEG = 70;
const CHASE_ZOOM = 120;
const ORBIT_DEG_PER_PX = Object.freeze({ yaw: 0.4, pitch: 0.25 });
const KEY_ORBIT_DEG = 10;
const WHEEL_ZOOM = Object.freeze({ in: 1.12, out: 0.89 });
/** The fraction of the shorter side the whole fight fills at most, on the diagonal (turn-sim's fit). */
const FIT_FILL = 0.9;

/** Half a degree: a chasing aircraft pointing this close at the other keeps the bank it had. */
const BANK_DEADBAND_RAD = (0.5 * Math.PI) / 180;

/** The ground sits this far below the lowest height flown (feet), so there is something to judge the view against. */
const GROUND_BELOW_FT = 1000;
const GRID_STEP_FT = FT_PER_NM;
const GRID_CELLS = 100;
/** The marks' size on screen, in pixels. */
const MERGE_MARK_PX = 7;
const DASH_PX = [7, 5];

const VIEW_LABELS = Object.freeze({ overhead: 'Overhead', blue: 'Chase Blue', red: 'Chase Red' });
/** The three one-click views, in the order of their buttons: { id: { label } }. */
export const VIEWS = Object.freeze(Object.fromEntries(Object.entries(VIEW_LABELS).map(([id, label]) => [id, Object.freeze({ label })])));

/** @param {number} v @param {readonly number[]} range [min, max] */
const clamp = (v, range) => Math.max(range[0], Math.min(range[1], v));
const wrapDeg = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const deg = (r) => (r * 180) / Math.PI;

// ─────────────────────────────────────────────────────────────────────────────
// What is drawn: the attitude, the trails. Plain values, tested in Node.
// ─────────────────────────────────────────────────────────────────────────────

/** The bank of a level, coordinated turn at `g`: cos bank = 1 ÷ G. Below 1 G there is no turn, so no bank. */
export function levelBankRad(g) {
  return g > 1 ? Math.acos(1 / g) : 0;
}

/**
 * Whether the MERGE mark is drawn: only when the jets pass each other at the centre, the same as the top-down
 * view. A start with the turns at once, or with a range that is not closing, has no pass to mark.
 */
export function showsMergeMark(fight) {
  return fight.mergeMark === true;
}

/**
 * Which way an aircraft is turning, for its bank: +1 left (counter-clockwise), -1 right, 0 not turning.
 * Before the merge both fly straight. After it each turns toward the other as the fight set it up
 * (`fight.turnDir`, read when the turns start; Blue left and Red left at the head-on start), and Red
 * the other way in a 1-circle fight (sim.js). With First nose chases, once someone has their nose on, each
 * turns toward the other; while it points within half a degree of the other it keeps `last`, so the bank
 * does not flicker from side to side.
 */
export function turnDirection(fight, who, last = 0) {
  if (!fight.merged) return 0;
  const set = fight.turnDir?.[who] ?? 1;
  const fixed = who === 'red' && fight.setup.circles === 1 ? -set : set;
  if (!(fight.setup.chase && fight.firstNose)) return fixed;
  const other = who === 'blue' ? 'red' : 'blue';
  const a = fight[who];
  const b = fight[other];
  const err = wrapPi(headingRad({ x: a.xFt, y: a.yFt }, { x: b.xFt, y: b.yFt }) - a.headingRad);
  if (Math.abs(err) > BANK_DEADBAND_RAD) return Math.sign(err);
  return last || fixed;
}

/**
 * Where and how one aircraft is drawn, from the fight's state alone: its place (feet, the height through
 * altToZ), heading (radians from east, counter-clockwise), pitch (only with Climb and dive on) and bank
 * (positive for a left turn). In the simple fight the bank is the level-turn bank for the fight's own
 * (limited) G: acos(1 / G), toward `direction` (turnDirection). Energy mode will bring its own bank.
 */
export function aircraftPose(fight, who, direction) {
  const a = fight[who];
  return {
    x: a.xFt,
    y: a.yFt,
    z: altToZ(a.zFt, ALT_SCALE),
    headingRad: a.headingRad,
    pitchRad: fight.setup.vertical ? a.pitchRad : 0,
    bankRad: direction * levelBankRad(fight.perf[who].g),
  };
}

/** Sets an object's attitude as ui-kit says: rotation order 'ZYX', rotation.set(-bank, -pitch, heading). */
export function applyAttitude(object3d, pose) {
  object3d.rotation.order = 'ZYX';
  object3d.rotation.set(-pose.bankRad, -pose.pitchRad, pose.headingRad);
}

/** Points a trail can hold: one every 0.1 s for the whole 10-minute fight, the aircraft itself, and a little room. */
export function trailCapacity() {
  return Math.ceil(FIGHT_MAX_SEC / TRAIL_INTERVAL_SEC) + 4;
}

/**
 * Writes a trail into a flat array of east, north, height (feet, the height through altToZ), from point
 * `from` on, followed by the aircraft's own place `now`, so the line ends at the aircraft and not at the
 * last 0.1 s point. Returns how many points the line now has. Trails only grow, so a screen that keeps
 * `from` (what it wrote last time) writes only what is new.
 */
export function fillTrail(out, points, now, from = 0) {
  for (let i = from; i < points.length; i++) {
    const p = points[i];
    out[i * 3] = p.xFt;
    out[i * 3 + 1] = p.yFt;
    out[i * 3 + 2] = altToZ(p.zFt, ALT_SCALE);
  }
  const n = points.length;
  out[n * 3] = now.xFt;
  out[n * 3 + 1] = now.yFt;
  out[n * 3 + 2] = altToZ(now.zFt, ALT_SCALE);
  return n + 1;
}

/**
 * The words for the first nose-on mark, as the top-down view has them: "FIRST NOSE — BLUE", or "BOTH" when
 * both got their nose on in the same step (`firstNose.both`, which an older fight state does not have).
 * Nothing before anyone has.
 */
export function firstNoseText(firstNose) {
  if (!firstNose) return '';
  return `FIRST NOSE — ${firstNose.both === true ? 'BOTH' : firstNose.by.toUpperCase()}`;
}

/** The height (feet) of a trail at fight time `timeSec`, between the two points around it; the ends before and after. */
export function heightAtTime(points, timeSec) {
  if (!points.length) return 0;
  if (timeSec <= points[0].timeSec) return points[0].zFt;
  const last = points[points.length - 1];
  if (timeSec >= last.timeSec) return last.zFt;
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].timeSec <= timeSec) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  return a.zFt + ((b.zFt - a.zFt) * (timeSec - a.timeSec)) / (b.timeSec - a.timeSec);
}

// ─────────────────────────────────────────────────────────────────────────────
// The camera.
// ─────────────────────────────────────────────────────────────────────────────

/** The reach of everything drawn so far, in feet. */
export function emptyBounds() {
  return { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
}

/** Widens `bounds` to hold a point with xFt, yFt, zFt. Returns the bounds. */
export function extendBounds(bounds, p) {
  if (p.xFt < bounds.minX) bounds.minX = p.xFt;
  if (p.xFt > bounds.maxX) bounds.maxX = p.xFt;
  if (p.yFt < bounds.minY) bounds.minY = p.yFt;
  if (p.yFt > bounds.maxY) bounds.maxY = p.yFt;
  if (p.zFt < bounds.minZ) bounds.minZ = p.zFt;
  if (p.zFt > bounds.maxZ) bounds.maxZ = p.zFt;
  return bounds;
}

/**
 * The yaw that puts the camera behind an aircraft flying `headingRad` (radians from east, counter-clockwise):
 * matchProjection's screen-up is the world direction (sin yaw, cos yaw) and the aircraft's is (cos h, sin h),
 * so yaw = 90 - heading.
 */
export function yawBehind(heading) {
  return wrapDeg(90 - deg(heading));
}

/** A camera change from a drag of (dx, dy) pixels: sideways turns it, up and down tilts it. Zoom is not touched. */
export function orbit(cam, dx, dy) {
  return {
    ...cam,
    yawDeg: wrapDeg(cam.yawDeg + dx * ORBIT_DEG_PER_PX.yaw),
    pitchDeg: clamp(cam.pitchDeg - dy * ORBIT_DEG_PER_PX.pitch, CAMERA_LIMITS.pitch),
  };
}

/** A zoom by hand stops the automatic fit. */
const zoomed = (cam, zoom) => ({ ...cam, zoom: clamp(zoom, CAMERA_LIMITS.zoom), zoomAuto: false });

/** A camera change from one wheel notch: in when `deltaY` is negative. */
export function zoomBy(cam, deltaY) {
  return zoomed(cam, cam.zoom * (deltaY < 0 ? WHEEL_ZOOM.in : WHEEL_ZOOM.out));
}

/** A camera change from a pinch: `ratio` is the fingers' new distance over the old. A zero or bad ratio changes nothing. */
export function zoomByRatio(cam, ratio) {
  return Number.isFinite(ratio) && ratio > 0 ? zoomed(cam, cam.zoom * ratio) : cam;
}

/**
 * The zoom (pixels per 1,000 ft) that shows the whole of `bounds` in a box of `size`, at least 3,000 ft
 * each way from the middle as the 2D view does (view.js MIN_REACH_FT). The picture turns with the yaw, so
 * it fits the 3D diagonal (height too), which holds whichever way it is turned or tilted.
 */
export function fitZoom(bounds, size) {
  const spanX = Math.max(bounds.maxX - bounds.minX, 2 * MIN_REACH_FT);
  const spanY = Math.max(bounds.maxY - bounds.minY, 2 * MIN_REACH_FT);
  const spanZ = Math.max(bounds.maxZ - bounds.minZ, 0);
  const pxPerFt = (FIT_FILL * Math.max(1, Math.min(size.width, size.height))) / Math.hypot(spanX, spanY, spanZ);
  return clamp(pxPerFt * 1000, CAMERA_LIMITS.zoom);
}

/** Feet an aircraft is drawn at, at a zoom: its real length, or MIN_PLANE_PX on screen if that is more. */
export function planeLengthFt(zoom) {
  return Math.max(T6_LENGTH_FT, MIN_PLANE_PX / (zoom / 1000));
}

/** The camera a one-click view sets: 'overhead' (straight down, north up, as the 2D picture), 'blue' or 'red' (chase). */
export function cameraForButton(name) {
  if (name === 'blue' || name === 'red') return { mode: name, yawDeg: 0, pitchDeg: CHASE_PITCH_DEG, zoom: CHASE_ZOOM, zoomAuto: false };
  return { mode: 'fit', yawDeg: 0, pitchDeg: 0, zoom: DEFAULT_CAMERA.zoom, zoomAuto: true };
}

/**
 * What matchProjection needs for a camera choice: { center: { x, y, z } in feet, camera: { yawDeg, pitchDeg,
 * zoom, altScale } }. The 'fit' camera looks at the middle of everything the fight has reached (`bounds`, which
 * grows with it) and, until the person zooms, keeps all of it in view. A chase camera follows its aircraft
 * from behind, turning with its heading; dragging sideways turns the camera round the aircraft.
 */
export function cameraFor(cam, { bounds, fight, size }) {
  if (cam.mode === 'blue' || cam.mode === 'red') {
    const a = fight[cam.mode];
    return {
      center: { x: a.xFt, y: a.yFt, z: a.zFt },
      camera: { yawDeg: wrapDeg(yawBehind(a.headingRad) + cam.yawDeg), pitchDeg: cam.pitchDeg, zoom: cam.zoom, altScale: ALT_SCALE },
    };
  }
  return {
    center: { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2, z: (bounds.minZ + bounds.maxZ) / 2 },
    camera: { yawDeg: cam.yawDeg, pitchDeg: cam.pitchDeg, zoom: cam.zoomAuto ? fitZoom(bounds, size) : cam.zoom, altScale: ALT_SCALE },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The view.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * host: the element the 3D picture fills (the stage sizes it; it stays on the page, so the pointer and key
 *   handlers stay on it while each start() puts a new canvas inside).
 * timers: the module's scheduler scope (frame). run(): the run to draw now, { fight, trails }.
 * paint(): 'harvard' or 'ship'. load: how three.js is fetched (ui-kit's loadThree; a test gives its own).
 * onLost(): called once when the browser takes the WebGL context away while 3D is showing (the graphics card
 *   was reset). By then the view has freed everything and stopped drawing, so the screen only has to show 2D.
 * win: for tests. Returns { start, stop, requestDraw, setView, stats, dispose }.
 */
export function createView3d(host, { timers, run, paint, onLost = () => {}, load = loadThree, win = globalThis }) {
  const doc = host.ownerDocument;
  let THREE = null;
  let gl = null; // the scene and everything that holds GPU resources, only between start() and stop()
  let generation = 0; // each start() and stop() takes a new one, so a late three.js load can't undo a later choice
  let disposed = false;
  let pendingFrame = null;
  let drawn = 0;
  let resizer = null;
  let cam = { ...DEFAULT_CAMERA };
  const pointers = new Map(); // id -> { x, y }, the fingers or the mouse now down
  let pinchDistance = 0;

  const size = () => ({ width: Math.max(1, host.clientWidth), height: Math.max(1, host.clientHeight) });

  function label(text, className) {
    const el = doc.createElement('span');
    el.className = `tf-3d-label ${className}`;
    el.textContent = text;
    return el;
  }

  /** What build() throws when there is no WebGL 2; `webgl1` says whether WebGL 1 is there, for the wording of the note. */
  function noWebgl2() {
    const err = /** @type {Error & { webgl1: boolean }} */ (new Error('no WebGL 2'));
    err.webgl1 = false;
    try {
      const probe = doc.createElement('canvas');
      const context = probe.getContext('webgl') || probe.getContext('experimental-webgl');
      err.webgl1 = Boolean(context);
      context?.getExtension?.('WEBGL_lose_context')?.loseContext(); // the spare context is released at once
    } catch {
      // no WebGL 1 either
    }
    return err;
  }
  function build() {
    const canvas = doc.createElement('canvas');
    canvas.className = 'tf-3d-canvas';
    // Checked first (ui-kit's webglSupported, WebGL2 as three needs), so a browser with no WebGL is told apart
    // from any other failure without three.js logging an error.
    if (!webglSupported({ document: doc })) throw noWebgl2();
    const context = canvas.getContext('webgl2', { antialias: true });
    if (!context) throw noWebgl2();
    const renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true });
    try {
      buildScene(canvas, renderer);
    } catch (err) {
      renderer.dispose(); // never leave a context behind when the rest could not be made
      renderer.forceContextLoss?.();
      throw err;
    }
    canvas.addEventListener('webglcontextlost', contextLost);
  }
  /**
   * The browser took the context away (the graphics card was reset). three.js already calls preventDefault
   * on this event (which asks the browser to restore the context); it is called here too so this does not
   * depend on that. No restore is waited for: if the browser restores the old canvas, it is detached and
   * nothing holds it, so it is collected. Everything is freed and the drawing stops, and the screen falls
   * back to 2D: the fight is not touched. A loss that teardown() itself caused (it releases the context on
   * purpose) is ignored, because by then the canvas is no longer the current one.
   */
  function contextLost(event) {
    event.preventDefault?.();
    if (!gl || event.target !== gl.canvas) return;
    generation++;
    teardown({ lost: true });
    onLost();
  }

  function buildScene(canvas, renderer) {
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2);
    addLights(THREE, scene);
    const sky = addSky(THREE, scene);

    // The ground: one-NM squares that follow the view in whole squares, so it looks endless and still.
    const grid = new THREE.GridHelper(GRID_STEP_FT * GRID_CELLS, GRID_CELLS, '#2c5a44', '#1c3a30');
    grid.rotation.x = Math.PI / 2; // GridHelper is flat in X-Z; the fight's ground is X-Y
    grid.material.fog = false;
    scene.add(grid);

    // The MERGE mark: a cross at the merge point, a fixed size on screen.
    const crossGeometry = new THREE.BufferGeometry();
    crossGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, 0, 0, 1, 0, 0, 0, -1, 0, 0, 1, 0]), 3));
    const mark = new THREE.LineSegments(crossGeometry, new THREE.LineBasicMaterial({ color: COLORS.nose, fog: false }));
    scene.add(mark);

    // The trails, as lines over a buffer big enough for a whole fight.
    const lines = {};
    for (const who of SHIPS) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * trailCapacity()), 3));
      geometry.setDrawRange(0, 0);
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: COLORS[who], fog: false }));
      line.frustumCulled = false;
      scene.add(line);
      lines[who] = line;
    }

    const labels = {
      blue: label(LETTERS.blue, 'tf-3d-label-blue'),
      red: label(LETTERS.red, 'tf-3d-label-red'),
      merge: label('MERGE', 'tf-3d-label-nose'),
      firstNose: label('', 'tf-3d-first-nose'),
    };
    host.replaceChildren(canvas, labels.blue, labels.red, labels.merge, labels.firstNose);
    gl = {
      canvas, renderer, scene, camera, sky, grid, mark, lines, labels,
      planes: {}, paint: null, nose: null, noseFor: null, ratio: 0, width: 0, height: 0,
      data: null, // what has been read from the current run: its trails, bounds, and how much of each is written
      directions: { blue: 0, red: 0 },
    };
  }

  /** Paints the aircraft anew when the paint has changed, or they do not exist yet. */
  function placePlanes(paintNow) {
    if (gl.paint === paintNow) return;
    for (const who of SHIPS) {
      if (gl.planes[who]) disposeCt156Model(gl.planes[who]);
      const mesh = createCt156Model(THREE, { color: COLORS[who], number: LETTERS[who], paint: paintNow, lengthFt: CT156_UNIT_LENGTH });
      gl.scene.add(mesh);
      gl.planes[who] = mesh;
    }
    gl.paint = paintNow;
  }

  /** Takes in the run's new trail points: the lines, and the reach of everything drawn. Returns the bounds with the aircraft now. */
  function readRun({ fight, trails }) {
    if (gl.data?.trails !== trails) {
      gl.data = { trails, bounds: emptyBounds(), written: { blue: 0, red: 0 } };
      if (cam.mode === 'fit') cam = { ...cam, zoomAuto: true }; // a new fight is shown whole again
    }
    const { bounds, written } = gl.data;
    for (const who of SHIPS) {
      const points = trails[who];
      const attribute = gl.lines[who].geometry.attributes.position;
      const from = written[who] <= points.length ? written[who] : 0;
      for (let i = from; i < points.length; i++) extendBounds(bounds, points[i]);
      const count = fillTrail(attribute.array, points, fight[who], from);
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(from * 3, (count - from) * 3);
      attribute.needsUpdate = true;
      gl.lines[who].geometry.setDrawRange(0, count);
      written[who] = points.length;
    }
    const now = { ...bounds };
    for (const who of SHIPS) extendBounds(now, fight[who]);
    return now;
  }

  /** The first nose-on line, from the fight's record of it; its height comes from the trails at that moment. */
  function placeFirstNose({ fight, trails }) {
    if (gl.noseFor === fight.firstNose) return;
    if (gl.nose) {
      gl.nose.removeFromParent();
      gl.nose.geometry.dispose();
      gl.nose.material.dispose();
      gl.nose = null;
    }
    gl.noseFor = fight.firstNose;
    if (!fight.firstNose) return;
    const { from, to, by, timeSec } = fight.firstNose;
    const other = by === 'blue' ? 'red' : 'blue';
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(from.xFt, from.yFt, altToZ(heightAtTime(trails[by], timeSec), ALT_SCALE)),
      new THREE.Vector3(to.xFt, to.yFt, altToZ(heightAtTime(trails[other], timeSec), ALT_SCALE)),
    ]);
    gl.nose = new THREE.Line(geometry, new THREE.LineDashedMaterial({ color: COLORS.nose, dashSize: 1, gapSize: 1, fog: false }));
    gl.nose.computeLineDistances();
    gl.nose.frustumCulled = false;
    gl.scene.add(gl.nose);
  }

  function draw() {
    if (!gl || disposed) return;
    const { renderer, scene, camera } = gl;
    const theRun = run();
    const { fight } = theRun;
    const box = size();
    // Each of these resets the drawing buffer, so only when the box or the screen's pixel ratio has changed.
    const ratio = Math.min(win.devicePixelRatio || 1, 2);
    if (gl.ratio !== ratio) renderer.setPixelRatio(ratio);
    if (gl.ratio !== ratio || gl.width !== box.width || gl.height !== box.height) renderer.setSize(box.width, box.height, false);
    Object.assign(gl, { ratio, width: box.width, height: box.height });

    placePlanes(paint());
    const bounds = readRun(theRun);
    placeFirstNose(theRun);
    const view = cameraFor(cam, { bounds, fight, size: box });
    const pxPerFt = view.camera.zoom / 1000;
    const lengthFt = planeLengthFt(view.camera.zoom);

    for (const who of SHIPS) {
      gl.directions[who] = turnDirection(fight, who, gl.directions[who]);
      const pose = aircraftPose(fight, who, gl.directions[who]);
      const mesh = gl.planes[who];
      mesh.position.set(pose.x, pose.y, pose.z);
      mesh.scale.setScalar(lengthFt / CT156_UNIT_LENGTH);
      applyAttitude(mesh, pose);
    }

    const groundZ = -(GROUND_BELOW_FT + Math.max(Math.abs(bounds.minZ), Math.abs(bounds.maxZ)));
    gl.grid.position.set(
      Math.round(view.center.x / GRID_STEP_FT) * GRID_STEP_FT,
      Math.round(view.center.y / GRID_STEP_FT) * GRID_STEP_FT,
      altToZ(groundZ, ALT_SCALE),
    );
    gl.mark.scale.setScalar(MERGE_MARK_PX / pxPerFt);
    gl.mark.visible = showsMergeMark(fight);
    if (gl.nose) {
      gl.nose.material.dashSize = DASH_PX[0] / pxPerFt;
      gl.nose.material.gapSize = DASH_PX[1] / pxPerFt;
    }

    matchProjection(THREE, camera, view.center, view.camera, box, 1);
    renderer.render(scene, camera);

    // The letters and the MERGE word ride over the picture at the point they name.
    const at = (point, dx, dy, el) => {
      const s = worldToScreen(THREE, camera, point, box.width, box.height);
      el.style.transform = `translate(${Math.round(s.x + dx)}px, ${Math.round(s.y + dy)}px)`;
    };
    at({ x: fight.blue.xFt, y: fight.blue.yFt, z: altToZ(fight.blue.zFt, ALT_SCALE) }, -22, -26, gl.labels.blue);
    at({ x: fight.red.xFt, y: fight.red.yFt, z: altToZ(fight.red.zFt, ALT_SCALE) }, 12, -26, gl.labels.red);
    gl.labels.merge.style.display = showsMergeMark(fight) ? '' : 'none';
    const markWord = passMarkWord(fight);
    if (gl.labels.merge.textContent !== markWord) gl.labels.merge.textContent = markWord;
    at({ x: 0, y: 0, z: 0 }, 8, 22, gl.labels.merge);
    const noseText = firstNoseText(fight.firstNose);
    if (gl.labels.firstNose.textContent !== noseText) gl.labels.firstNose.textContent = noseText;

    drawn++;
    host.dataset.draws = String(drawn);
  }

  function requestDraw() {
    if (!gl || disposed || pendingFrame) return;
    pendingFrame = timers.frame(() => {
      stopFrame();
      draw();
    });
  }

  function stopFrame() {
    pendingFrame?.();
    pendingFrame = null;
  }

  /** Frees every GPU resource and the canvas; the camera choice stays for the next start. */
  function teardown({ lost = false } = {}) {
    stopFrame();
    resizer?.disconnect();
    resizer = null;
    pointers.clear();
    pinchDistance = 0;
    if (!gl) return;
    const scene = gl;
    gl = null;
    scene.canvas.removeEventListener('webglcontextlost', contextLost);
    for (const mesh of Object.values(scene.planes)) disposeCt156Model(mesh);
    for (const line of Object.values(scene.lines)) {
      line.geometry.dispose();
      line.material.dispose();
    }
    scene.mark.geometry.dispose();
    scene.mark.material.dispose();
    scene.grid.geometry.dispose();
    scene.grid.material.dispose();
    if (scene.nose) {
      scene.nose.geometry.dispose();
      scene.nose.material.dispose();
    }
    scene.sky.dispose();
    scene.renderer.dispose();
    if (!lost) scene.renderer.forceContextLoss?.(); // a context the browser already took is not released again
    host.replaceChildren();
    delete host.dataset.draws;
    drawn = 0;
  }

  // ---- the person's hands: drag to orbit, wheel or pinch to zoom, + and − and the arrow keys ----
  const moved = (next) => {
    cam = next;
    requestDraw();
  };
  const distance = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const hands = [
    ['pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      host.setPointerCapture?.(e.pointerId);
      host.classList.add('is-dragging');
      if (pointers.size === 2) pinchDistance = distance();
    }],
    ['pointermove', (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (pointers.size === 2) {
        const now = distance();
        if (pinchDistance > 0) moved(zoomByRatio(cam, now / pinchDistance));
        pinchDistance = now;
      } else if (pointers.size === 1) {
        moved(orbit(cam, dx, dy));
      }
    }],
    ['pointerup', (e) => endPointer(e)],
    ['pointercancel', (e) => endPointer(e)],
    ['wheel', (e) => {
      e.preventDefault();
      if (e.deltaY) moved(zoomBy(cam, e.deltaY));
    }],
    ['keydown', (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const zoom = e.key === '+' || e.key === '=' ? -1 : e.key === '-' || e.key === '_' ? 1 : 0;
      const turn = { ArrowLeft: [-KEY_ORBIT_DEG, 0], ArrowRight: [KEY_ORBIT_DEG, 0], ArrowUp: [0, KEY_ORBIT_DEG], ArrowDown: [0, -KEY_ORBIT_DEG] }[e.key];
      if (!zoom && !turn) return;
      e.preventDefault();
      if (zoom) moved(zoomBy(cam, zoom));
      else moved(orbit(cam, turn[0] / ORBIT_DEG_PER_PX.yaw, turn[1] / ORBIT_DEG_PER_PX.pitch));
    }],
  ];
  function endPointer(e) {
    pointers.delete(e.pointerId);
    pinchDistance = 0;
    if (!pointers.size) host.classList.remove('is-dragging');
  }
  host.tabIndex = 0;
  host.setAttribute('role', 'img');
  host.setAttribute(
    'aria-label',
    '3D view of the fight. Blue (B) and Red (R) fly toward each other and turn at the MERGE or PASS mark, or at once. Drag to turn it, scroll or pinch to zoom, press plus and minus to zoom and the arrow keys to turn it. The tables beside it give the numbers.',
  );
  for (const [type, fn] of hands) host.addEventListener(type, fn, type === 'wheel' ? { passive: false } : undefined);

  return {
    /**
     * Starts the 3D picture, loading three.js the first time. Resolves { ok: true }, or { ok: false, reason }:
     * 'load' when three.js could not be fetched (offline), 'gl' when the browser can't draw 3D, 'gl2' when it has WebGL 1 only (three.js needs WebGL 2), and 'closed'
     * when stop() or dispose() came first. A later call after a failure tries again.
     */
    async start() {
      if (disposed) return { ok: false, reason: 'closed' };
      if (gl) return { ok: true };
      const mine = ++generation;
      try {
        THREE = await load();
      } catch (err) {
        console.warn('three.js could not be loaded:', err);
        return { ok: false, reason: mine === generation ? 'load' : 'closed' };
      }
      if (mine !== generation || disposed) return { ok: false, reason: 'closed' };
      try {
        build();
      } catch (err) {
        console.warn('3D could not start:', err);
        teardown();
        return { ok: false, reason: err?.webgl1 ? 'gl2' : 'gl' };
      }
      if (win.ResizeObserver) {
        resizer = new win.ResizeObserver(() => requestDraw());
        resizer.observe(host);
      }
      requestDraw();
      return { ok: true };
    },
    /** Frees everything 3D holds and stops its frame (2D is showing, or the module is closing). */
    stop() {
      generation++;
      teardown();
    },
    requestDraw,
    /** One of the three one-click views: 'overhead', 'blue' or 'red'. */
    setView(name) {
      moved(cameraForButton(name));
    },
    stats: () => ({ active: Boolean(gl), drawn, pending: Boolean(pendingFrame), camera: { ...cam } }),
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      teardown();
      for (const [type, fn] of hands) host.removeEventListener(type, fn);
    },
  };
}
