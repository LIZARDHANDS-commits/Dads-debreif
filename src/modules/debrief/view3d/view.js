// The 3D view: the formation in the air over one fixed ground, turned with
// the mouse (drag to orbit, wheel to zoom: input.js) or the 3D settings'
// sliders. three.js draws the picture (ground, trails, sticks and the CT-156
// Harvard models from ui-kit, D138) on a WebGL canvas under the view's own
// canvas, where overlay.js draws the labels, ruler, compass and tennis ball.
// The camera is ui-kit matchProjection, which lands every point where
// scene.js projectPoint puts it, so both layers agree and no flight math
// changes. three.js loads only when 3D is first shown (D141). It draws only
// when something changed and only while it's the view showing (#39, #43).
import { createCanvasSurface } from '../../../ui-kit/canvas-view.js';
import {
  loadThree as loadThreeModule, matchProjection, altToZ, addLights, addSky, disposeAircraftMesh,
} from '../../../ui-kit/three-aircraft.js';
import { createCt156Model, CT156_UNIT_LENGTH, PAINT_DEFAULT } from '../../../ui-kit/ct156-model.js';
import { SHIP_COLORS } from '../state.js';
import { sampleAt } from '../../../flight-data/flight.js';
import { formationCenter, projectPoint, attitudeEuler } from './scene.js';
import { shipsIn3d, groundDatumFt, heightLabel, groundGrid, GROUND_EXTENT_FT } from './frame.js';
import { attachCameraInput } from './input.js';
import {
  drawStickLabel, drawAltitudeScale, drawMarker, labelShip, drawCompass, drawCaption, drawTennis3d, TEXT,
} from './overlay.js';

const BACKGROUND = '#050b12';
const LAND = '#0b3318';
const DATUM_FILL = '#17351b';
const DATUM_EDGE = '#7ee787';
const TRAIL_SAMPLES = 80; // points along each trail, as V6
const STICK_PX = 3; // the height sticks' width on screen, as the 2D-canvas view drew them

/**
 * canvas: the 3D <canvas> (the overlay; the WebGL canvas goes right after
 * it). timers: the module's scheduler scope. flight(): the loaded flight or
 * null. time(): the playback time. settings(): the layout values (view,
 * cam3d, yaw3d, pitch3d, zoom3d, altScale3d, model3d, paint3d, planeSize3d,
 * attLabels3d, trailSec3d, landscape3d, groundRef3d, datum3d, grid3d,
 * sticks3d, altMarks3d). fieldFt(): the home field's elevation.
 * setCamera(patch): keeps a camera change (yaw3d, pitch3d, zoom3d).
 * onUnavailable(message): three.js or WebGL couldn't start; the screen
 * says so and goes back to 2D. loadThree: for tests.
 */
export function createView3d(canvas, {
  timers, flight, time, settings, fieldFt, setCamera, tennis = () => null,
  onUnavailable = /** @type {(message: string) => void} */ (() => {}), loadThree = loadThreeModule,
}) {
  const glCanvas = document.createElement('canvas');
  glCanvas.className = 'debrief-3d-picture';
  glCanvas.setAttribute('aria-hidden', 'true');
  canvas.after(glCanvas);

  let THREE = null;
  let gl = null; // { renderer, scene, camera, world, ships, sky }
  let loading = false;
  let disposed = false;

  function start() {
    if (gl || loading) return;
    if (!webGlWorks()) { // asked first: three.js would write a console error, and needn't be fetched
      onUnavailable('3D needs WebGL, which is turned off in this browser.');
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
        onUnavailable('3D needs WebGL, which is turned off in this browser.');
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
    const ships = shown ? shipsIn3d(shown, t) : [];
    const live = Object.fromEntries(ships.map((s) => [s.slot, s]));
    const ctr = shown ? formationCenter(live, on.cam3d) : { x: 0, y: 0, z: 0 };
    const P = (p) => projectPoint(p, ctr, camera, size);
    const datum = shown ? groundDatumFt(ships, on.datum3d, groundFieldFt) : 0;

    const modelled = renderPicture(gl, THREE, { size, flight: shown, t, on, camera, ctr, ships, datum });
    if (!shown) return; // the screen's own message says what to load

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
      surface.dispose();
      input.dispose();
      if (gl) disposePicture(gl);
      gl = null;
      glCanvas.remove();
    },
  };
}

// Whether this browser can make a WebGL context, tried on a canvas of its own and let go again.
function webGlWorks() {
  const probe = document.createElement('canvas');
  const context = probe.getContext('webgl2') || probe.getContext('webgl');
  if (!context) return false;
  context.getExtension?.('WEBGL_lose_context')?.loseContext();
  return true;
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
  const world = new THREE.Group();
  scene.add(world);
  // materials: one of each kind, colour and opacity, made when first wanted and kept.
  // size: what the renderer was last told, so it is told again only when it changes.
  return { renderer, scene, camera, world, ships: new Map(), sky: null, materials: new Map(), size: null };
}

// A material of `kind` (basic, line or standard) made once and kept in the
// picture, so a draw reuses it instead of building and freeing a dozen.
function material(gl, THREE, kind, color, extra = {}) {
  const key = `${kind}|${color}|${JSON.stringify(extra)}`;
  let m = gl.materials.get(key);
  if (!m) {
    if (kind === 'basic') m = new THREE.MeshBasicMaterial({ color, fog: false, ...extra });
    else if (kind === 'line') m = new THREE.LineBasicMaterial({ color, transparent: true, fog: false, ...extra });
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

function disposePicture(gl) {
  clearGroup(gl.world);
  for (const { mesh } of gl.ships.values()) disposeAircraftMesh(mesh);
  gl.ships.clear();
  gl.sky?.dispose();
  for (const m of gl.materials.values()) m.dispose();
  gl.materials.clear();
  gl.renderer.dispose();
  gl.renderer.forceContextLoss(); // hand the GPU context back now, not when the page collects it
}

/** Draws the picture; returns the slots drawn as a model (the rest get a 2D marker). */
function renderPicture(gl, THREE, { size, flight, t, on, camera, ctr, ships, datum }) {
  const { renderer, scene, world } = gl;
  const ratio = globalThis.devicePixelRatio || 1;
  const told = gl.size;
  if (told?.ratio !== ratio) renderer.setPixelRatio(ratio);
  if (told?.ratio !== ratio || told.width !== size.width || told.height !== size.height) {
    renderer.setSize(size.width, size.height, false); // the ratio changes the canvas's pixels too
    gl.size = { ratio, width: size.width, height: size.height };
  }
  matchProjection(THREE, gl.camera, ctr, camera, size);

  // V6's sky and far ground, fading to the horizon (#27).
  if (on.landscape3d && !gl.sky) gl.sky = addSky(THREE, scene);
  if (!on.landscape3d && gl.sky) {
    gl.sky.dispose();
    gl.sky = null;
  }

  clearGroup(world);
  const modelled = new Set();
  if (!flight) {
    for (const { mesh } of gl.ships.values()) mesh.visible = false;
    renderer.render(scene, gl.camera);
    return modelled;
  }
  const Z = (altFt) => altToZ(altFt, camera.altScale);
  const dz = Z(datum);
  const ftPerPx = 1000 / camera.zoom;
  const basic = (color, extra = {}) => material(gl, THREE, 'basic', color, extra);
  const line = (color, opacity) => material(gl, THREE, 'line', color, { opacity });

  if (on.landscape3d) {
    const extent = GROUND_EXTENT_FT * 4;
    const land = new THREE.Mesh(new THREE.PlaneGeometry(extent, extent), material(gl, THREE, 'standard', LAND, { roughness: 1, metalness: 0 }));
    land.position.set(ctr.x, ctr.y, dz - 2 * camera.altScale);
    world.add(land);
  }
  // The datum plane with its edge (V6's ground reference), then the grid on it.
  if (on.groundRef3d) {
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

  // A stick from each ship down to the datum, as wide on screen as before, and its shadow (#26).
  if (on.sticks3d) {
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
  const paint = on.paint3d ?? PAINT_DEFAULT;
  const key = `${paint}|${on.planeSize3d}`;
  for (const s of ships) {
    if (on.model3d !== 't6' || s.hdg === null || s.inGap) continue;
    let entry = gl.ships.get(s.slot);
    if (entry && entry.key !== key) {
      disposeAircraftMesh(entry.mesh);
      gl.ships.delete(s.slot);
      entry = null;
    }
    if (!entry) {
      const mesh = createCt156Model(THREE, { color: SHIP_COLORS[s.slot], number: s.slot, paint, lengthFt: on.planeSize3d * CT156_UNIT_LENGTH });
      mesh.rotation.order = attitudeEuler(s).order;
      scene.add(mesh);
      entry = { key, mesh };
      gl.ships.set(s.slot, entry);
    }
    entry.mesh.position.set(s.x, s.y, Z(s.altFt));
    const turn = attitudeEuler(s);
    entry.mesh.rotation.set(turn.x, turn.y, turn.z);
    modelled.add(s.slot);
  }
  for (const [slot, { mesh }] of gl.ships) mesh.visible = modelled.has(slot);

  renderer.render(scene, gl.camera);
  return modelled;
}
