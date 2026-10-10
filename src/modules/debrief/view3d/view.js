// The 3D view: the formation in the air over one fixed ground, turned with
// the mouse (drag to orbit, wheel to zoom: input.js) or the 3D settings'
// sliders. three.js draws the picture (ground, trails, sticks and the CT-156
// Harvard models from ui-kit, D138) on a WebGL canvas under the view's own
// canvas, where overlay.js draws the labels, ruler, compass and tennis ball.
// The camera is ui-kit matchProjection, which lands every point where
// scene.js projectPoint puts it, so both layers agree and no flight math
// changes. three.js loads only when 3D is first shown (D141). It draws only
// when something changed and only while it's the view showing (#39, #43).
//
// The Cockpit camera (DB-21) is a perspective camera at a seat's eye in the
// ridden ship (ui-kit ct156-cockpit.js), the picture at true scale with
// altitude ×1 and the ground at the home field; its labels are placed through
// that camera. Filled GPS gaps (DB-20) are a translucent ribbon with a dashed
// centre line, the ship in one a ghosted model labelled "est.".
import { createCanvasSurface } from '../../../ui-kit/canvas-view.js';
import {
  loadThree as loadThreeModule, matchProjection, altToZ, addLights, addSky, disposeAircraftMesh, webglSupported, worldToScreen,
} from '../../../ui-kit/three-aircraft.js';
import { createCt156Model, CT156_UNIT_LENGTH, CT156_LENGTH_FT, PAINT_DEFAULT } from '../../../ui-kit/ct156-model.js';
import { createCockpitMount, aimCockpitCamera, PANEL_REDRAW_MS } from '../../../ui-kit/ct156-cockpit.js';
import { SHIP_COLORS } from '../state.js';
import { sampleAt } from '../../../flight-data/flight.js';
import { createRide, COCKPIT_CAPTION } from './cockpit.js';
import { formationCenter, projectPoint, attitudeEuler } from './scene.js';
import { shipsIn3d, groundDatumFt, heightLabel, groundGrid, GROUND_EXTENT_FT } from './frame.js';
import { attachCameraInput } from './input.js';
import { padlockTarget, ridesShip } from './camera-modes.js';
import { headToward, aimChaseCamera } from './aim.js';
import {
  drawStickLabel, drawAltitudeScale, drawMarker, labelShip, drawCompass, drawCaption, drawCockpitCaption, drawTennis3d, TEXT,
} from './overlay.js';

const BACKGROUND = '#050b12';
const LAND = '#0b3318';
const DATUM_FILL = '#17351b';
const DATUM_EDGE = '#7ee787';
const TRAIL_SAMPLES = 80; // points along each trail, as V6
const STICK_PX = 3; // the height sticks' width on screen, as the 2D-canvas view drew them
/** A filled gap in 3D (DB-20): the zone's ribbon about 18 % opaque, a ship in one ghosted to about 45 %. */
const FILL_RIBBON_OPACITY = 0.18;
const GHOST_OPACITY = 0.45;
/** The cockpit's sky (a plain colour: a screen-fixed gradient would not bank with the aircraft) and its wider ground. */
const COCKPIT_SKY = '#2f6aa8';
const COCKPIT_LAND = '#3d5a2e';
const COCKPIT_GROUND_FT = 800_000;

/**
 * canvas: the 3D <canvas> (the overlay; the WebGL canvas goes right after
 * it). timers: the module's scheduler scope. flight(): the loaded flight or
 * null. time(): the playback time. settings(): the layout values (view,
 * cam3d, yaw3d, pitch3d, zoom3d, altScale3d, model3d, paint3d, planeSize3d,
 * attLabels3d, trailSec3d, landscape3d, groundRef3d, datum3d, grid3d,
 * sticks3d, altMarks3d). fieldFt(): the home field's elevation.
 * setCamera(patch): keeps a camera change (yaw3d, pitch3d, zoom3d, or the
 * cockpit's headYaw3d, headPitch3d). fills(): the filled GPS gaps to draw
 * (gap-fill.js fillGaps's `fills`), or null while the fill is off. wind(t,
 * altFt): the model wind { dirDeg, kt } or null, and windKey(): which wind it
 * is ('' for none), for the cockpit's crab and airspeed.
 * onUnavailable(message): three.js or WebGL couldn't start; the screen
 * says so and goes back to 2D. loadThree: for tests.
 */
export function createView3d(canvas, {
  timers, flight, time, settings, fieldFt, setCamera, tennis = () => null,
  fills = () => null, wind = /** @type {(t: number, altFt: number) => any} */ (() => null), windKey = () => '',
  onUnavailable = /** @type {(message: string) => void} */ (() => {}), loadThree = loadThreeModule,
}) {
  const glCanvas = document.createElement('canvas');
  glCanvas.className = 'debrief-3d-picture';
  glCanvas.setAttribute('aria-hidden', 'true');
  canvas.after(glCanvas);

  let THREE = null;
  let gl = null; // { renderer, scene, camera, persp, world, ships, ghosts, sky, cockpit }
  const ride = createRide(); // the Cockpit camera's ridden ship (cockpit.js)
  let panelRetry = null; // a draw asked for after a held-back panel update
  let loading = false;
  let disposed = false;

  function start() {
    if (gl || loading) return;
    if (!webglSupported()) { // asked first: three.js would write a console error, and needn't be fetched
      onUnavailable('3D needs WebGL 2, which this browser doesn\'t have or has turned off.');
      return;
    }
    loading = true;
    loadThree().then((module) => {
      loading = false;
      if (disposed) return;
      try {
        gl = createPicture(module, glCanvas);
        THREE = module;
      } catch {
        onUnavailable('3D needs WebGL 2, which this browser doesn\'t have or has turned off.');
        return;
      }
      surface.requestDraw();
    }, () => {
      loading = false;
      if (!disposed) onUnavailable('3D needs a connection the first time.');
    });
  }

  let input = null;
  const surface = createCanvasSurface(canvas, {
    timers,
    label: '3D view of the formation: drag to turn it, scroll or press + and − to zoom',
    draw(ctx, { size }) {
      const on = settings();
      if (on.view !== '3d' || !size.width) return; // hidden: nothing to load or draw
      start();
      if (!gl) {
        ctx.fillStyle = BACKGROUND;
        ctx.fillRect(0, 0, size.width, size.height);
        ctx.fillStyle = TEXT;
        ctx.font = '13px system-ui, sans-serif';
        ctx.fillText('Loading the 3D view…', 14, 22);
        return;
      }
      drawScene(ctx, size, flight(), time(), on, input.camera(), fieldFt(), tennis());
    },
  });
  input = attachCameraInput(canvas, { settings, setCamera, redraw: surface.requestDraw });

  function drawScene(ctx, size, shown, t, on, camera, groundFieldFt, ball) {
    const filled = shown ? fills() : null;
    let ships = /** @type {any[]} */ (shown ? shipsIn3d(shown, t, filled) : []);
    // The Cockpit camera: the ridden ship sits where its smooth table (or its gap's fill) puts it (DB-21).
    // Chase (DB-22) rides the same smooth ship and draws it from behind, with no cockpit in it.
    const cockpit = ridesShip(on) && shown?.tracks[on.cockpitShip3d]
      ? {
        slot: on.cockpitShip3d, seat: on.cockpitSeat3d, chase: on.cam3d === 'chase', aim: on.aim3d, windKey: windKey(),
        head: on.aim3d === 'freelook' ? { yawDeg: camera.headYawDeg, pitchDeg: camera.headPitchDeg } : { yawDeg: 0, pitchDeg: 0 },
      }
      : null;
    let riding = null;
    if (cockpit) {
      riding = ride.at(shown, cockpit.slot, t, { wind, windKey: cockpit.windKey, fills: filled });
      cockpit.panel = riding.panel;
      cockpit.hdg = riding.hdg;
      const lock = on.aim3d === 'padlock' ? padlockTarget(on, ships.map((s) => s.slot)) : null; // Padlock: the ship kept in view
      cockpit.lockSlot = lock;
      ships = ships.map((s) => (s.slot === cockpit.slot
        ? { ...s, x: riding.x, y: riding.y, altFt: riding.altFt, hdg: riding.hdg, bankDeg: riding.bankDeg, pitchDeg: riding.pitchDeg, bankKnown: true, ridden: true, inGap: Boolean(riding.gap), estimated: riding.gap === 'filled' }
        : s));
    }
    const live = Object.fromEntries(ships.map((s) => [s.slot, s]));
    if (cockpit?.lockSlot) {
      const s = live[cockpit.lockSlot];
      cockpit.target = { x: s.x, y: s.y, z: altToZ(s.altFt, 1) };
    }
    const ctr = cockpit ? { x: riding.x, y: riding.y, z: riding.altFt } : shown ? formationCenter(live, on.cam3d) : { x: 0, y: 0, z: 0 };
    const view = cockpit ? { ...camera, altScale: 1 } : camera; // true scale in the cockpit
    const datum = shown ? (cockpit ? groundFieldFt : groundDatumFt(ships, on.datum3d, groundFieldFt)) : 0;

    const modelled = renderPicture(gl, THREE, { size, flight: shown, t, on, camera: view, ctr, ships, datum, filled, cockpit });
    if (cockpit?.again && !panelRetry) {
      panelRetry = timers.after(cockpit.again, () => {
        panelRetry = null;
        surface.requestDraw();
      });
    }
    if (!shown) return; // the screen's own message says what to load

    if (cockpit) {
      // Labels through the perspective camera; a point behind the eye has none (NaN draws nothing).
      const P = (p) => {
        const v = new THREE.Vector3(p.x, p.y, altToZ(p.altFt, 1)).project(gl.persp);
        if (v.z > 1 || v.z < -1) return { x: NaN, y: NaN };
        return worldToScreen(THREE, gl.persp, { x: p.x, y: p.y, z: altToZ(p.altFt, 1) }, size.width, size.height);
      };
      for (const s of ships) {
        if (s.ridden && !cockpit.chase) continue;
        const c = P(s);
        if (Number.isFinite(c.x)) labelShip(ctx, c, s, on);
      }
      if (ball?.points) drawTennis3d(ctx, P, ball);
      drawCockpitCaption(ctx, { slot: cockpit.slot, seat: cockpit.seat, chase: cockpit.chase, gap: riding.gap, windKnown: Boolean(cockpit.windKey) }, COCKPIT_CAPTION);
      return;
    }
    const P = (p) => projectPoint(p, ctr, camera, size);
    if (on.altMarks3d) drawAltitudeScale(ctx, P, ctr, ships, datum);
    if (on.sticks3d) {
      const unit = heightLabel(on.datum3d);
      for (const s of ships) if (!s.inGap) drawStickLabel(ctx, P(s), P({ x: s.x, y: s.y, altFt: datum }), s.altFt - datum, unit);
    }
    for (const s of ships) {
      if (modelled.has(s.slot)) labelShip(ctx, P(s), s, on);
      else drawMarker(ctx, P, s, on); // the flat marker, or a dot for a ship with no heading
    }
    if (ball?.points) drawTennis3d(ctx, P, ball);
    if (on.groundRef3d) drawCompass(ctx, size, camera);
    drawCaption(ctx, camera, on, datum);
  }

  return {
    requestDraw: surface.requestDraw,
    dispose() {
      disposed = true;
      panelRetry?.();
      surface.dispose();
      input.dispose();
      if (gl) disposePicture(gl);
      gl = null;
      glCanvas.remove();
    },
  };
}

// The WebGL side: renderer, scene, camera, lights, and a group rebuilt each
// draw for the ground, grid, trails and sticks. Aircraft are kept per ship.
function createPicture(THREE, glCanvas) {
  // preserveDrawingBuffer keeps the last picture readable (a saved picture, the tests).
  const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setClearColor(BACKGROUND);
  const scene = new THREE.Scene();
  addLights(THREE, scene);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2);
  const persp = new THREE.PerspectiveCamera(60, 1, 0.5, 400_000); // the Cockpit camera (DB-21)
  const world = new THREE.Group();
  scene.add(world);
  // materials: one of each kind, colour and opacity, made when first wanted and kept.
  // size: what the renderer was last told, so it is told again only when it changes.
  // ghosts: the see-through models of ships in a filled gap, with their own materials (DB-20).
  // cockpit: the CT-156 cockpit, moved into the ridden ship (ui-kit createCockpitMount), made when first wanted.
  return {
    renderer, scene, camera, persp, world, ships: new Map(), ghosts: new Map(), sky: null, skyFog: null, materials: new Map(), size: null,
    cockpit: null, cockpitSky: new THREE.Color(COCKPIT_SKY), doc: glCanvas.ownerDocument ?? globalThis.document,
  };
}

// A material of `kind` (basic, line or standard) made once and kept in the
// picture, so a draw reuses it instead of building and freeing a dozen.
function material(gl, THREE, kind, color, extra = {}) {
  const key = `${kind}|${color}|${JSON.stringify(extra)}`;
  let m = gl.materials.get(key);
  if (!m) {
    if (kind === 'basic') m = new THREE.MeshBasicMaterial({ color, fog: false, ...extra });
    else if (kind === 'line') m = new THREE.LineBasicMaterial({ color, transparent: true, fog: false, ...extra });
    else if (kind === 'dashed') m = new THREE.LineDashedMaterial({ color, transparent: true, fog: false, ...extra });
    else m = new THREE.MeshStandardMaterial({ color, ...extra });
    gl.materials.set(key, m);
  }
  return m;
}

// Frees what a draw built: the geometries. Its materials are shared and kept (see material).
function clearGroup(group) {
  for (const o of [...group.children]) {
    group.remove(o);
    o.geometry?.dispose();
  }
}

// A ship's model made see-through for a filled gap: its own copies of the materials, so other ships keep theirs.
function ghostModel(THREE, options) {
  const mesh = createCt156Model(THREE, options);
  const copies = [];
  mesh.traverse((o) => {
    if (!o.material) return;
    const swap = (m) => {
      const c = m.clone();
      c.transparent = true;
      c.opacity = (m.opacity ?? 1) * GHOST_OPACITY;
      c.depthWrite = false;
      copies.push(c);
      return c;
    };
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
  });
  return { mesh, copies };
}

function disposeGhost({ mesh, copies }) {
  disposeAircraftMesh(mesh);
  for (const c of copies) c.dispose();
}

function disposePicture(gl) {
  clearGroup(gl.world);
  gl.cockpit?.dispose();
  gl.cockpit = null;
  for (const { mesh } of gl.ships.values()) disposeAircraftMesh(mesh);
  gl.ships.clear();
  for (const ghost of gl.ghosts.values()) disposeGhost(ghost);
  gl.ghosts.clear();
  gl.sky?.dispose();
  for (const m of gl.materials.values()) m.dispose();
  gl.materials.clear();
  gl.renderer.dispose();
  gl.renderer.forceContextLoss(); // hand the GPU context back now, not when the page collects it
}

/** Draws the picture; returns the slots drawn as a model (the rest get a 2D marker). */
function renderPicture(gl, THREE, { size, flight, t, on, camera, ctr, ships, datum, filled = null, cockpit = null }) {
  const { renderer, scene, world } = gl;
  const ratio = globalThis.devicePixelRatio || 1;
  const told = gl.size;
  if (told?.ratio !== ratio) renderer.setPixelRatio(ratio);
  if (told?.ratio !== ratio || told.width !== size.width || told.height !== size.height) {
    renderer.setSize(size.width, size.height, false); // the ratio changes the canvas's pixels too
    gl.size = { ratio, width: size.width, height: size.height };
  }
  if (!cockpit) matchProjection(THREE, gl.camera, ctr, camera, size);
  const view = cockpit ? gl.persp : gl.camera;

  // V6's sky and far ground, fading to the horizon (#27). In the cockpit a plain sky and no fog, so the horizon shows.
  if (on.landscape3d && !gl.sky) {
    gl.sky = addSky(THREE, scene);
    gl.skyFog = scene.fog;
  }
  if (!on.landscape3d && gl.sky) {
    gl.sky.dispose();
    gl.sky = null;
    gl.skyFog = null;
  }
  if (cockpit) {
    scene.background = gl.cockpitSky;
    scene.fog = null;
  } else if (gl.sky) {
    scene.background = gl.sky.texture;
    scene.fog = gl.skyFog;
  } else if (scene.background === gl.cockpitSky) scene.background = null;

  clearGroup(world);
  const modelled = new Set();
  if (!flight) {
    gl.cockpit?.mount(null);
    for (const { mesh } of gl.ships.values()) mesh.visible = false;
    for (const { mesh } of gl.ghosts.values()) mesh.visible = false;
    renderer.render(scene, gl.camera);
    return modelled;
  }
  const Z = (altFt) => altToZ(altFt, camera.altScale);
  const dz = Z(datum);
  const ftPerPx = 1000 / camera.zoom;
  const basic = (color, extra = {}) => material(gl, THREE, 'basic', color, extra);
  const line = (color, opacity) => material(gl, THREE, 'line', color, { opacity });

  if (on.landscape3d || cockpit) {
    const extent = cockpit ? COCKPIT_GROUND_FT : GROUND_EXTENT_FT * 4;
    const land = new THREE.Mesh(new THREE.PlaneGeometry(extent, extent), cockpit
      ? basic(COCKPIT_LAND) // flat and plain, so the horizon reads against the sky at any bank
      : material(gl, THREE, 'standard', LAND, { roughness: 1, metalness: 0 }));
    land.position.set(ctr.x, ctr.y, dz - 2 * camera.altScale);
    world.add(land);
  }
  // The datum plane with its edge (V6's ground reference), then the grid on it. Not in the cockpit: its edge would read
  // as a second horizon.
  if (on.groundRef3d && !cockpit) {
    const { min, max } = groundGrid(ctr, GROUND_EXTENT_FT, 10_000);
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(max.x - min.x, max.y - min.y),
      basic(DATUM_FILL, { transparent: true, opacity: 0.28, depthWrite: false }),
    );
    plane.position.set((min.x + max.x) / 2, (min.y + max.y) / 2, dz);
    world.add(plane);
    const edge = new THREE.BufferGeometry().setFromPoints(
      [[min.x, min.y], [max.x, min.y], [max.x, max.y], [min.x, max.y]].map(([x, y]) => new THREE.Vector3(x, y, dz + 2)),
    );
    world.add(new THREE.LineLoop(edge, line(DATUM_EDGE, 0.65)));
  }
  if (on.grid3d) {
    const { xs, ys, min, max } = groundGrid(ctr);
    const pts = [];
    for (const x of xs) pts.push(x, min.y, dz + 4, x, max.y, dz + 4);
    for (const y of ys) pts.push(min.x, y, dz + 4, max.x, y, dz + 4);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    world.add(new THREE.LineSegments(g, line(DATUM_EDGE, 0.22)));
  }

  // Each ship's last trailSec3d seconds, broken where it's in a GPS gap (V6 drawTrails).
  if (on.trailSec3d > 0) {
    for (const tr of Object.values(flight.tracks)) {
      const t0 = Math.max(flight.startT, t - on.trailSec3d);
      const pos = [];
      let prev = null;
      for (let i = 0; i <= TRAIL_SAMPLES; i++) {
        const s = sampleAt(tr, t0 + ((t - t0) * i) / TRAIL_SAMPLES);
        if (s.inGap) {
          prev = null;
          continue;
        }
        const p = [s.xFt, s.yFt, Z(s.altFt)];
        if (prev) pos.push(...prev, ...p);
        prev = p;
      }
      if (!pos.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      world.add(new THREE.LineSegments(g, line(SHIP_COLORS[tr.slot], 0.7)));
    }
  }

  // Filled GPS gaps (DB-20): the zone as a flat translucent ribbon at the fill's height and its centre line dashed, for
  // the trail's seconds and the whole of any gap a ship is in now.
  if (filled) {
    const t0 = Math.max(flight.startT, t - on.trailSec3d);
    for (const [slot, list] of Object.entries(filled)) {
      const color = SHIP_COLORS[slot];
      for (const fill of list) {
        const now = fill.fromT < t && t < fill.toT;
        if (!now && (fill.toT <= t0 || fill.fromT >= t)) continue;
        const shown = now ? fill.samples : fill.samples.filter((s) => s.t >= t0 && s.t <= t);
        if (shown.length < 2) continue;
        const centre = shown.map((s) => new THREE.Vector3(s.xFt, s.yFt, Z(s.altFt) + 1));
        if (fill.method !== 'ground') {
          const pos = [];
          const edge = (s, side) => {
            const len = Math.hypot(s.vx, s.vy) || 1;
            const w = side > 0 ? s.leftFt : -s.rightFt;
            return [s.xFt - (s.vy / len) * w, s.yFt + (s.vx / len) * w, Z(s.altFt)];
          };
          for (let k = 0; k < shown.length - 1; k++) {
            const [l0, r0, l1, r1] = [edge(shown[k], 1), edge(shown[k], -1), edge(shown[k + 1], 1), edge(shown[k + 1], -1)];
            pos.push(...l0, ...r0, ...l1, ...r0, ...r1, ...l1);
          }
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          world.add(new THREE.Mesh(g, basic(color, { transparent: true, opacity: FILL_RIBBON_OPACITY, depthWrite: false, side: THREE.DoubleSide })));
        }
        const dash = material(gl, THREE, 'dashed', color, { opacity: 0.9 });
        dash.dashSize = cockpit ? 60 : 5 * ftPerPx;
        dash.gapSize = cockpit ? 90 : 7 * ftPerPx;
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(centre), dash);
        line.computeLineDistances();
        world.add(line);
      }
    }
  }

  // A stick from each ship down to the datum, as wide on screen as before, and its shadow (#26). Not in the cockpit.
  if (on.sticks3d && !cockpit) {
    for (const s of ships) {
      const top = Z(s.altFt);
      const height = Math.abs(top - dz);
      if (height > 0 && !s.inGap) { // no stick for a ship in a GPS gap: its height is a guess (D32)
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 8), basic(SHIP_COLORS[s.slot], { transparent: true, opacity: 0.85 }));
        stick.rotation.x = Math.PI / 2; // the cylinder's axis is Y; stand it up along Z
        stick.scale.set((STICK_PX / 2) * ftPerPx, height, (STICK_PX / 2) * ftPerPx);
        stick.position.set(s.x, s.y, (top + dz) / 2);
        world.add(stick);
      }
      const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 32), basic(SHIP_COLORS[s.slot], { transparent: true, opacity: 0.45, depthWrite: false }));
      shadow.scale.set(18 * ftPerPx, 18 * ftPerPx, 1);
      shadow.position.set(s.x, s.y, dz + 6);
      world.add(shadow);
    }
  }

  // The CT-156 Harvard for each ship with a heading (D138). Its size is the
  // plane size setting, not stretched by the altitude scale. A ship in a GPS
  // gap gets the hollow marker instead, with no attitude drawn (D32).
  // A ship in a filled gap is the same model ghosted (DB-20); in the cockpit every ship is a model at its true size and
  // the ridden one is always solid, with the cockpit in it (DB-21).
  const paint = on.paint3d ?? PAINT_DEFAULT;
  // In the cockpit the model is built at its unit length and its root scaled to the real 33 ft, as Turn Sim and Turn
  // Fight do, so the shared seat helpers (eye, cockpit) land in the seat; otherwise the plane size setting, as before.
  const lengthFt = cockpit ? CT156_UNIT_LENGTH : on.planeSize3d * CT156_UNIT_LENGTH;
  const rootScale = cockpit ? CT156_LENGTH_FT / CT156_UNIT_LENGTH : 1;
  const key = `${paint}|${lengthFt}|${rootScale}`;
  const ghosted = new Set();
  let ridden = null;
  for (const s of ships) {
    const ghost = s.estimated && !s.ridden;
    if ((!cockpit && on.model3d !== 't6') || s.hdg === null || (s.inGap && !s.estimated && !s.ridden)) continue;
    const store = ghost ? gl.ghosts : gl.ships;
    let entry = store.get(s.slot);
    if (entry && entry.key !== key) {
      if (gl.cockpit?.root === entry.mesh) gl.cockpit.mount(null);
      if (ghost) disposeGhost(entry);
      else disposeAircraftMesh(entry.mesh);
      store.delete(s.slot);
      entry = null;
    }
    if (!entry) {
      const options = { color: SHIP_COLORS[s.slot], number: s.slot, paint, lengthFt };
      entry = ghost ? { key, ...ghostModel(THREE, options) } : { key, mesh: createCt156Model(THREE, options) };
      entry.mesh.rotation.order = attitudeEuler(s).order;
      entry.mesh.scale.setScalar(rootScale);
      scene.add(entry.mesh);
      store.set(s.slot, entry);
    }
    entry.mesh.position.set(s.x, s.y, Z(s.altFt));
    const turn = attitudeEuler(s);
    entry.mesh.rotation.set(turn.x, turn.y, turn.z);
    if (ghost) ghosted.add(s.slot);
    else modelled.add(s.slot);
    if (s.ridden) ridden = entry.mesh;
  }
  for (const [slot, { mesh }] of gl.ships) mesh.visible = modelled.has(slot);
  for (const [slot, { mesh }] of gl.ghosts) mesh.visible = ghosted.has(slot);
  for (const slot of ghosted) modelled.add(slot); // labelled as a model, not given a flat marker

  if (cockpit && ridden && cockpit.chase) {
    gl.cockpit?.mount(null); // seen from outside: the cockpit is not opened
    aimChaseCamera(THREE, gl.persp, ridden, {
      hdg: cockpit.hdg, yawDeg: cockpit.head.yawDeg, pitchDeg: cockpit.head.pitchDeg, target: cockpit.target ?? null, width: size.width, height: size.height,
    });
  } else if (cockpit && ridden) {
    gl.cockpit ??= createCockpitMount(THREE, { doc: gl.doc });
    gl.cockpit.mount(ridden, cockpit.seat);
    // Padlock turns the head to the locked ship; boresight keeps it straight ahead (cockpit.head is zero then).
    const head = cockpit.target ? headToward(THREE, ridden, cockpit.target) : cockpit.head;
    aimCockpitCamera(THREE, gl.persp, ridden, { seat: cockpit.seat, yawDeg: head.yawDeg, pitchDeg: head.pitchDeg, width: size.width, height: size.height });
    // The panel's numbers go in before the picture is drawn. It redraws at most every PANEL_REDRAW_MS and this view
    // draws only on change, so a held-back update asks for one more draw, or a paused panel would keep an old number.
    const key = JSON.stringify(cockpit.panel);
    if (gl.cockpit.update(cockpit.panel)) gl.shownPanel = key;
    else if (key !== gl.shownPanel) cockpit.again = PANEL_REDRAW_MS + 20;
  } else gl.cockpit?.mount(null);

  renderer.render(scene, view);
  return modelled;
}
