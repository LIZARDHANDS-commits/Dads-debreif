// The EP Tabletop student's view (spec, "The two screens"): the shared CT-156 front cockpit (ui-kit ct156-cockpit.js, its engine displays
// live, EP-4) seen from the front-seat eye, looking along the nose (Boresight) with a modest head turn by dragging, and outside the Moose Jaw
// 3D environment (Patrick, relayed by Dad, 12 Oct 2026: "use the moose jaw 3d environment") built from the shared pieces: the real terrain
// (ui-kit terrain3d.js) with the satellite picture draped on it (ui-kit draped-ground.js), Moose Jaw's runways from Patrick's measured points
// and the other fields round it (ui-kit airfield3d.js, src/airfields), and the shared sky (ui-kit sky-clouds.js). Traffic's richer CYMJ world
// (buildings, landmarks) stays Traffic's for now (EP-7). A picture only: the aircraft holds the pose it is given (no flight maths).
//
// When data fails: a terrain tile that doesn't come leaves its part flat at the field's elevation; a satellite tile that doesn't come leaves the
// plain ground colour there; no WebGL leaves a message in place of the view, and the step track and the instructor's console still work.
import { loadThree, addLights, webglSupported } from '../../ui-kit/three-aircraft.js';
import { createCt156Model, PAINT_DEFAULT } from '../../ui-kit/ct156-model.js';
import { createCockpitMount, aimCockpitCamera, createCockpitZoomKey, CT156_FT_PER_UNIT } from '../../ui-kit/ct156-cockpit.js';
import { addSkyAndClouds, SKY_COLOURS } from '../../ui-kit/sky-clouds.js';
import { createTerrain3d } from '../../ui-kit/terrain3d.js';
import { createDrapedGround } from '../../ui-kit/draped-ground.js';
import { buildAirports, airportElevationFt } from '../../ui-kit/airfield3d.js';
import { CYMJ_ORIGIN } from '../../airfields/cymj-runways.js';
import { makeLocalRef, latLonToLocalFt, localFtToLatLon } from '../../core/geo.js';
import { zoomForTiles, holeFor } from '../../core/terrain-grid.js';
import { compassDegToHeadingRad, degToRad } from '../../core/angles.js';
import { FT_PER_NM } from '../../core/units.js';

/**
 * Magnetic variation at Moose Jaw, degrees east (Patrick's ruling, TR-65: 9° E). Scenario headings are magnetic, the world is drawn in true.
 * The Traffic sim keeps the same number in its airfield.js (MAG_VARIATION_DEG_E); a shared home for it is a proposal (EP-7).
 */
export const MAG_VARIATION_DEG_E = 9;

/** The head turn a drag allows from the nose, degrees: modest, so the panel and the windscreen stay the picture (an estimate, a tool choice). */
export const HEAD_LIMITS = Object.freeze({ yawDeg: 60, pitchDeg: [-35, 25] });
/** Degrees of head turn per pixel dragged (an estimate for feel). */
const DRAG_DEG_PER_PX = 0.2;
/** The boresight looks this far below the nose, degrees, so the panel's engine displays sit in the picture with the horizon (an estimate for the view). */
export const BORESIGHT_PITCH_DEG = -12;

/**
 * The ground's area round Moose Jaw: the outer square 160 NM across (beyond the haze from 8,000 ft), the inner sharper square 30 NM across
 * round the field. Sizes and tile caps are estimates that keep each tier to the tile layer's limits (about 36 to 49 tiles).
 */
const OUTER_NM = 160;
const INNER_NM = 30;
const OUTER_CELLS = 160;
const INNER_CELLS = 240;
const IMAGERY_PX = Object.freeze({ outer: 2048, inner: 2048 });
/** The haze: the ground fades to the horizon colour from 25 NM out to 70 NM (estimates for the look; the outer square's edge then never shows). */
const HAZE_NM = Object.freeze({ from: 25, to: 70 });
/** Runways sit this far over the draped ground so the picture never hides them (an estimate; airfield3d.js's own is 40 ft). */
const RUNWAY_LIFT_FT = 20;
/** Tiles that arrive are read into the ground at most this often (milliseconds; an estimate that keeps the page quick, as the Debrief's). */
const GROUND_REFRESH_MS = 400;

function mooseJawArea() {
  const ref = makeLocalRef(CYMJ_ORIGIN.lat, CYMJ_ORIGIN.lon);
  const toLatLon = (x, y) => localFtToLatLon(ref, x, y);
  const projection = {
    lat: CYMJ_ORIGIN.lat,
    lon: CYMJ_ORIGIN.lon,
    toLatLon,
    toXY: (lat, lon) => {
      const p = latLonToLocalFt(ref, lat, lon);
      return [p.x, p.y];
    },
  };
  const box = (sizeFt) => {
    const h = sizeFt / 2;
    const p = [[-h, -h], [-h, h], [h, -h], [h, h]].map(([x, y]) => toLatLon(x, y));
    return { north: Math.max(...p.map((q) => q.lat)), south: Math.min(...p.map((q) => q.lat)), west: Math.min(...p.map((q) => q.lon)), east: Math.max(...p.map((q) => q.lon)) };
  };
  const outerFt = OUTER_NM * FT_PER_NM;
  const innerFt = INNER_NM * FT_PER_NM;
  const [ob, ib] = [box(outerFt), box(innerFt)];
  return {
    projection,
    plan: {
      outer: { sizeFt: outerFt, cells: OUTER_CELLS, zoom: zoomForTiles(ob, { maxTiles: 36, minZoom: 5, maxZoom: 9 }).zoom },
      inner: { sizeFt: innerFt, cells: INNER_CELLS, zoom: zoomForTiles(ib, { maxTiles: 49, minZoom: 7, maxZoom: 11 }).zoom },
      hole: holeFor({ outerSizeFt: outerFt, outerCells: OUTER_CELLS, innerSizeFt: innerFt }),
    },
    imagery: {
      outer: { px: IMAGERY_PX.outer, maxZoom: zoomForTiles(ob, { maxTiles: 36, minZoom: 5, maxZoom: 10 }).zoom },
      inner: { px: IMAGERY_PX.inner, maxZoom: zoomForTiles(ib, { maxTiles: 49, minZoom: 7, maxZoom: 13 }).zoom },
    },
  };
}

/** Where a scenario's start puts the aircraft, map feet from CYMJ's origin: `bearingDegT` and `distNm` from the field. */
export function startPositionFt({ bearingDegT = 0, distNm = 0 } = {}) {
  const b = degToRad(bearingDegT);
  return { x: Math.sin(b) * distNm * FT_PER_NM, y: Math.cos(b) * distNm * FT_PER_NM };
}

/**
 * Builds the view in `host` (an element; the canvas fills it). timers: the module's scheduler scope; doc: the page's document.
 * Returns a Promise of { setPose({ x, y, altFt, headingDegM, pitchDeg, bankDeg }), setHud(hud), boresight(), redraw(), dispose() },
 * or of null when WebGL is missing (a message is left in `host`).
 */
export async function createWorld3d({ host, timers, doc = globalThis.document }) {
  if (!webglSupported({ document: doc })) {
    const note = doc.createElement('p');
    note.className = 'ep-3d-note';
    note.textContent = 'This browser can\'t draw the 3D cockpit (no WebGL). The step track and the instructor\'s console still work.';
    host.append(note);
    return null;
  }
  const THREE = await loadThree();
  const canvas = doc.createElement('canvas');
  canvas.className = 'ep-3d-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'The CT-156 front cockpit, looking ahead over Moose Jaw');
  host.append(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  const scene = new THREE.Scene();
  const sky = addSkyAndClouds(THREE, scene, { doc });
  scene.fog = new THREE.Fog(SKY_COLOURS.horizon, HAZE_NM.from * FT_PER_NM, HAZE_NM.to * FT_PER_NM);
  addLights(THREE, scene);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 400_000);

  // The ground round Moose Jaw.
  const area = mooseJawArea();
  const fieldFt = airportElevationFt('CYMJ') ?? 1892; // OurAirports' 1,892 ft (src/airfields/airports-data.js)
  let groundDirty = true;
  let wake = null;
  const nudge = () => {
    if (wake) return;
    wake = timers.after(GROUND_REFRESH_MS, () => {
      wake = null;
      draw();
    });
  };
  const ground = createDrapedGround({ T: THREE, timers, doc, plan: area.plan, imagery: area.imagery, polygonOffset: true, onChange: () => { groundDirty = true; nudge(); } });
  ground.group.name = 'ep-moose-jaw-ground';
  ground.setHeight(fieldFt);
  scene.add(ground.group);
  const terrain = createTerrain3d({ timers, doc, plan: area.plan, maxTiles: 100, onChange: nudge });
  terrain.setView(area.projection, fieldFt);
  const airports = buildAirports(THREE, {
    toXY: area.projection.toXY, scale: 1, groundFt: fieldFt, doc, halfFt: area.plan.outer.sizeFt / 2, liftFt: RUNWAY_LIFT_FT, aboveGround: false,
  });
  scene.add(airports.root);

  // The aircraft and its front cockpit, the engine displays live (EP-4).
  const ship = createCt156Model(THREE, { color: '#58a6ff', paint: PAINT_DEFAULT, number: 1 }); // the fin's colour (unseen from the seat)
  ship.scale.setScalar(CT156_FT_PER_UNIT);
  ship.rotation.order = 'ZYX';
  scene.add(ship);
  const cockpit = createCockpitMount(THREE, { doc, liveEngine: true });
  cockpit.mount(ship, 'front');

  const head = { yawDeg: 0, pitchDeg: BORESIGHT_PITCH_DEG };
  // Holding Shift zooms in where the view looks, as in the other cockpits (ct156-cockpit.js COCKPIT_ZOOM): for reading the engine displays.
  const zoomKey = createCockpitZoomKey(doc.defaultView ?? globalThis, () => draw());
  zoomKey.start();
  let hud = null;
  let size = { w: 0, h: 0 };
  let disposed = false;

  function draw() {
    if (disposed) return;
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    if (w !== size.w || h !== size.h) {
      size = { w, h };
      renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
      renderer.setSize(w, h, false);
    }
    if (terrain.refresh()) ground.setRelief({ grids: terrain.grids, on: true, scale: 1, homeFt: fieldFt });
    if (groundDirty) {
      groundDirty = false;
      ground.paint({ projection: area.projection });
    }
    if (terrain.isDirty()) nudge();
    // The panel takes the numbers before the picture is drawn; a redraw it held back (PANEL_REDRAW_MS) comes on the next frame.
    cockpit.update(hud);
    aimCockpitCamera(THREE, camera, ship, { seat: 'front', yawDeg: head.yawDeg, pitchDeg: head.pitchDeg, width: w, height: h, zoomed: zoomKey.held() });
    renderer.render(scene, camera);
  }

  // The head: drag to look round, the view turning the way the drag goes (within HEAD_LIMITS); double-click looks along the boresight again.
  let drag = null;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const onDown = (e) => {
    drag = { x: e.clientX, y: e.clientY, yaw: head.yawDeg, pitch: head.pitchDeg };
    canvas.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!drag) return;
    head.yawDeg = clamp(drag.yaw - (e.clientX - drag.x) * DRAG_DEG_PER_PX, -HEAD_LIMITS.yawDeg, HEAD_LIMITS.yawDeg);
    head.pitchDeg = clamp(drag.pitch - (e.clientY - drag.y) * DRAG_DEG_PER_PX, HEAD_LIMITS.pitchDeg[0], HEAD_LIMITS.pitchDeg[1]);
    draw();
  };
  const onUp = () => {
    drag = null;
  };
  const boresight = () => {
    head.yawDeg = 0;
    head.pitchDeg = BORESIGHT_PITCH_DEG;
    draw();
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('dblclick', boresight);
  const resizer = globalThis.ResizeObserver ? new globalThis.ResizeObserver(() => draw()) : null;
  resizer?.observe(host);

  return {
    /** The aircraft's pose: map feet from CYMJ, altitude (feet above sea level), heading (°M), pitch and bank (right wing down positive). */
    setPose({ x = 0, y = 0, altFt = fieldFt, headingDegM = 0, pitchDeg = 0, bankDeg = 0 }) {
      ship.position.set(x, y, altFt);
      ship.rotation.set(-degToRad(bankDeg), -degToRad(pitchDeg), compassDegToHeadingRad(headingDegM + MAG_VARIATION_DEG_E), 'ZYX');
    },
    /** The panel's numbers (ct156-cockpit.js update's `hud`, with `engine` for the live engine displays). */
    setHud(next) {
      hud = next;
    },
    boresight,
    redraw: draw,
    dispose() {
      disposed = true;
      wake?.();
      zoomKey.stop();
      resizer?.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('dblclick', boresight);
      cockpit.dispose();
      airports.dispose();
      terrain.dispose();
      ground.dispose();
      sky.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
