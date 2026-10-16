// The planner's 3D view (docs/modules/nav-planner/spec.md, "Brief" and Brief mode; NP-10, NP-11), built from the shared pieces as the EP
// Tabletop's Moose Jaw is: the real terrain (ui-kit terrain3d.js) with the Esri picture draped on it (draped-ground.js), the shared sky (its
// clouds hidden: they are not the day's weather), the runways round the route (airfield3d.js), and the shared CT-156 (ct156-model.js). On top:
// the route line at its planned heights with a see-through curtain down to the ground, a pole and name at each turn point, and the flown track.
// World units are feet, x east and y north of the area's centre, z above sea level.
//
// Two cameras: the chase camera behind and above the aircraft (drag to swing round it, the wheel to move closer or further), and the eye camera
// Brief mode places on a leg's run-in (a position and a point to look at).
// When data fails: a terrain tile that doesn't come leaves its part flat at the area's fallback height; a satellite tile that doesn't come
// leaves the plain ground colour; no WebGL leaves a message and returns null (the map and tables still work).
import { loadThree, addLights, webglSupported } from '../../ui-kit/three-aircraft.js';
import { createCt156Model, disposeCt156Model, PAINT_DEFAULT } from '../../ui-kit/ct156-model.js';
import { CT156_FT_PER_UNIT } from '../../ui-kit/ct156-cockpit.js';
import { addSkyAndClouds, SKY_COLOURS } from '../../ui-kit/sky-clouds.js';
import { createTerrain3d } from '../../ui-kit/terrain3d.js';
import { createDrapedGround } from '../../ui-kit/draped-ground.js';
import { buildAirports } from '../../ui-kit/airfield3d.js';
import { makeLocalRef, latLonToLocalFt, localFtToLatLon } from '../../core/geo.js';
import { zoomForTiles, holeFor } from '../../core/terrain-grid.js';
import { compassDegToHeadingRad, degToRad } from '../../core/angles.js';
import { FT_PER_NM } from '../../core/units.js';
import { pointAlong, legGeometry, FIELD_FT } from './legs.js';
import { COLOURS } from './map2d.js';

/** The haze: the ground fades to the horizon colour between these distances (NM; estimates for the look, as the EP Tabletop's). */
const HAZE_NM = Object.freeze({ from: 20, to: 60 });
/** Tiles that arrive are read into the ground at most this often (ms; an estimate, as the EP Tabletop's). */
const GROUND_REFRESH_MS = 400;
/** The route line's points are this far apart along a leg (ft): enough for an AGL leg to follow the ground (an estimate). */
const LINE_STEP_FT = 1500;
/** A turn point's pole stands this far above the route line (ft; for the eye). */
const POLE_ABOVE_FT = 400;
/** The chase camera: distance behind (ft), and its limits for the wheel (estimates for the view). */
const CHASE = Object.freeze({ distFt: 300, minFt: 120, maxFt: 400000, pitchDeg: 12 });

/** The ground's two squares for an area centred on { lat, lon }: outerNm and innerNm across (the inner one sharper). As the EP Tabletop's mooseJawArea, sized by the caller. */
export function planArea(centre, outerNm, innerNm) {
  const ref = makeLocalRef(centre.lat, centre.lon);
  const toLatLon = (x, y) => localFtToLatLon(ref, x, y);
  const projection = {
    lat: centre.lat,
    lon: centre.lon,
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
  const outerFt = outerNm * FT_PER_NM;
  const innerFt = innerNm * FT_PER_NM;
  const [ob, ib] = [box(outerFt), box(innerFt)];
  return {
    key: `${centre.lat.toFixed(4)},${centre.lon.toFixed(4)},${outerNm},${innerNm}`,
    projection,
    plan: {
      outer: { sizeFt: outerFt, cells: 160, zoom: zoomForTiles(ob, { maxTiles: 36, minZoom: 5, maxZoom: 10 }).zoom },
      inner: { sizeFt: innerFt, cells: 240, zoom: zoomForTiles(ib, { maxTiles: 49, minZoom: 7, maxZoom: 12 }).zoom },
      hole: holeFor({ outerSizeFt: outerFt, outerCells: 160, innerSizeFt: innerFt }),
    },
    imagery: {
      outer: { px: 2048, maxZoom: zoomForTiles(ob, { maxTiles: 36, minZoom: 5, maxZoom: 11 }).zoom },
      inner: { px: 2048, maxZoom: zoomForTiles(ib, { maxTiles: 49, minZoom: 7, maxZoom: 15 }).zoom },
    },
  };
}

/** A sprite with a name on it that stays the same size on screen. */
function nameSprite(T, doc, text, colour = '#e3eef5') {
  const canvas = doc.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = '600 40px system-ui, sans-serif';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 28;
  canvas.width = w;
  canvas.height = 60;
  ctx.font = font;
  ctx.fillStyle = 'rgba(2, 10, 16, 0.72)';
  ctx.fillRect(0, 0, w, 60);
  ctx.fillStyle = colour;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 14, 31);
  const tex = new T.CanvasTexture(canvas);
  tex.colorSpace = T.SRGBColorSpace;
  const sprite = new T.Sprite(new T.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: false, transparent: true }));
  sprite.scale.set((0.032 * w) / 60, 0.032, 1);
  sprite.center.set(0.5, 0);
  sprite.renderOrder = 10;
  return sprite;
}

/**
 * Builds the view in `host` (an element the canvas fills). timers: the module's scheduler scope; doc: the page's document.
 * Returns a Promise of the view, or of null when WebGL is missing (a message is left in `host`). The view:
 * { setArea(centre, outerNm, innerNm), setRoute(points, legs), setFlown(fixes|null), setAircraft(pos|null), chase(), eye(from, to),
 *   groundAt(lat, lon), redraw(), dispose() }.
 */
export async function createRouteWorld({ host, timers, doc = globalThis.document }) {
  if (!webglSupported({ document: doc })) {
    const note = doc.createElement('p');
    note.className = 'np-3d-note';
    note.textContent = 'This browser can\'t draw the 3D view (no WebGL). The map, the tables and the route card still work.';
    host.append(note);
    return null;
  }
  const T = await loadThree();
  const canvas = doc.createElement('canvas');
  canvas.className = 'np-3d-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'The route in 3D over the terrain and satellite picture: drag to look round the aircraft, scroll to move closer or further');
  host.append(canvas);
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  const scene = new T.Scene();
  const sky = addSkyAndClouds(T, scene, { doc });
  sky.setVisible(false); // the shared clouds are not the day's weather
  scene.fog = new T.Fog(SKY_COLOURS.horizon, HAZE_NM.from * FT_PER_NM, HAZE_NM.to * FT_PER_NM);
  addLights(T, scene);
  const camera = new T.PerspectiveCamera(55, 1, 5, 600_000);
  camera.up.set(0, 0, 1);

  let area = null;
  let terrain = null;
  let ground = null;
  let airports = null;
  let groundDirty = true;
  let wake = null;
  let disposed = false;
  const nudge = () => {
    if (wake || disposed) return;
    wake = timers.after(GROUND_REFRESH_MS, () => {
      wake = null;
      draw();
    });
  };

  // The route, the flown track and the aircraft, rebuilt in the area's frame.
  const routeGroup = new T.Group();
  const flownGroup = new T.Group();
  scene.add(routeGroup, flownGroup);
  const owned = [];
  let route = { points: [], legs: [] };
  let flown = null;
  let routeRevision = -1;
  const ship = createCt156Model(T, { color: '#58a6ff', paint: PAINT_DEFAULT, number: 1 });
  ship.scale.setScalar(CT156_FT_PER_UNIT);
  ship.rotation.order = 'ZYX';
  ship.visible = false;
  scene.add(ship);

  const xy = (lat, lon) => (area ? area.projection.toXY(lat, lon) : [0, 0]);
  const groundZ = (x, y) => (terrain ? terrain.heightFt(x, y) : FIELD_FT);

  function clearGroup(group) {
    for (const child of [...group.children]) group.remove(child);
    for (const thing of owned.splice(0)) thing.dispose?.();
  }

  function buildRoute() {
    clearGroup(routeGroup);
    routeRevision = terrain?.revision ?? 0;
    const { points, legs } = route;
    if (!area || points.length < 1) return;
    legs.forEach((leg) => {
      const a = points[leg.i];
      const b = points[leg.i + 1];
      const n = Math.max(1, Math.ceil(legGeometry(a, b).distFt / LINE_STEP_FT));
      const top = [];
      const bottom = [];
      for (let k = 0; k <= n; k++) {
        const p = pointAlong(a, b, k / n);
        const [x, y] = xy(p.lat, p.lon);
        const g = groundZ(x, y);
        const z = leg.heightRef === 'AGL' ? g + leg.heightFt : leg.heightFt;
        top.push(x, y, z);
        bottom.push(x, y, Math.min(g, z));
      }
      const colour = leg.clearance.low ? COLOURS.low : COLOURS.route;
      const lineGeo = new T.BufferGeometry();
      lineGeo.setAttribute('position', new T.Float32BufferAttribute(top, 3));
      const lineMat = new T.LineBasicMaterial({ color: colour });
      owned.push(lineGeo, lineMat);
      routeGroup.add(new T.Line(lineGeo, lineMat));
      // The curtain: a see-through wall from the line down to the ground, so the height reads.
      const pos = [];
      for (let k = 0; k < n; k++) {
        const t0 = k * 3;
        const t1 = (k + 1) * 3;
        const v = (arr, o) => [arr[o], arr[o + 1], arr[o + 2]];
        pos.push(...v(top, t0), ...v(bottom, t0), ...v(top, t1), ...v(top, t1), ...v(bottom, t0), ...v(bottom, t1));
      }
      const wallGeo = new T.BufferGeometry();
      wallGeo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      const wallMat = new T.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.22, side: T.DoubleSide, depthWrite: false });
      owned.push(wallGeo, wallMat);
      routeGroup.add(new T.Mesh(wallGeo, wallMat));
    });
    // Poles and names at the turn points.
    points.forEach((p, i) => {
      const [x, y] = xy(p.lat, p.lon);
      const g = groundZ(x, y);
      const leg = route.legs[Math.min(i, route.legs.length - 1)];
      const h = leg ? (leg.heightRef === 'AGL' ? g + leg.heightFt : leg.heightFt) : g + 500;
      const topZ = Math.max(h, g) + POLE_ABOVE_FT;
      const poleGeo = new T.CylinderGeometry(25, 25, topZ - g, 8);
      poleGeo.rotateX(Math.PI / 2);
      const poleMat = new T.MeshBasicMaterial({ color: '#ffd166' });
      owned.push(poleGeo, poleMat);
      const pole = new T.Mesh(poleGeo, poleMat);
      pole.position.set(x, y, (g + topZ) / 2);
      routeGroup.add(pole);
      const sprite = nameSprite(T, doc, `${i + 1} ${p.name}`);
      owned.push(sprite.material.map, sprite.material);
      sprite.position.set(x, y, topZ + 50);
      routeGroup.add(sprite);
    });
  }

  function buildFlown() {
    for (const child of [...flownGroup.children]) {
      flownGroup.remove(child);
      child.geometry?.dispose();
      child.material?.dispose();
    }
    if (!flown?.length || !area) return;
    const pos = [];
    for (const f of flown) {
      const [x, y] = xy(f.lat, f.lon);
      pos.push(x, y, f.altFt);
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    flownGroup.add(new T.Line(geo, new T.LineBasicMaterial({ color: COLOURS.flown })));
  }

  function setArea(centre, outerNm, innerNm) {
    const next = planArea(centre, outerNm, innerNm);
    if (area && next.key === area.key) return;
    terrain?.dispose();
    if (ground) {
      scene.remove(ground.group);
      ground.dispose();
    }
    if (airports) {
      scene.remove(airports.root);
      airports.dispose();
    }
    area = next;
    groundDirty = true;
    ground = createDrapedGround({ T, timers, doc, plan: area.plan, imagery: area.imagery, polygonOffset: true, onChange: () => { groundDirty = true; nudge(); } });
    ground.setHeight(FIELD_FT);
    scene.add(ground.group);
    terrain = createTerrain3d({ timers, doc, plan: area.plan, maxTiles: 100, onChange: nudge });
    terrain.setView(area.projection, FIELD_FT);
    airports = buildAirports(T, { toXY: area.projection.toXY, scale: 1, groundFt: FIELD_FT, doc, halfFt: area.plan.outer.sizeFt / 2, liftFt: 20, aboveGround: false });
    scene.add(airports.root);
    buildRoute();
    buildFlown();
  }

  // The cameras.
  let mode = 'chase';
  const look = { yawDeg: 0, pitchDeg: CHASE.pitchDeg, distFt: CHASE.distFt };
  let eyeAt = null;
  let plane = null;

  function aimCamera(w, h) {
    camera.aspect = w / h;
    if (mode === 'eye' && eyeAt) {
      camera.fov = 60;
      scene.fog.near = HAZE_NM.from * FT_PER_NM;
      scene.fog.far = HAZE_NM.to * FT_PER_NM;
      camera.position.set(...eyeAt.from);
      camera.lookAt(...eyeAt.to);
    } else {
      camera.fov = 55;
      // The haze starts beyond the aircraft, so a far overview isn't washed out.
      scene.fog.near = HAZE_NM.from * FT_PER_NM + look.distFt;
      scene.fog.far = HAZE_NM.to * FT_PER_NM + look.distFt * 1.5;
      const p = ship.position;
      const head = plane ? plane.headingDegT : 0;
      const yaw = degToRad(head + 180 + look.yawDeg); // behind the nose, swung by the drag
      const pitch = degToRad(look.pitchDeg);
      const d = look.distFt;
      const cx = p.x + Math.sin(yaw) * Math.cos(pitch) * d;
      const cy = p.y + Math.cos(yaw) * Math.cos(pitch) * d;
      const cz = Math.max(p.z + Math.sin(pitch) * d, groundZ(cx, cy) + 30);
      camera.position.set(cx, cy, cz);
      camera.lookAt(p.x, p.y, p.z);
    }
    camera.updateProjectionMatrix();
  }

  let size = { w: 0, h: 0 };
  function draw() {
    if (disposed) return;
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    if (w !== size.w || h !== size.h) {
      size = { w, h };
      renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
      renderer.setSize(w, h, false);
    }
    if (terrain?.refresh()) {
      ground.setRelief({ grids: terrain.grids, on: true, scale: 1, homeFt: FIELD_FT });
      buildRoute(); // AGL legs and the poles follow the ground as it arrives
      if (plane) placeShip();
    }
    if (groundDirty && ground) {
      groundDirty = false;
      ground.paint({ projection: area.projection });
    }
    if (terrain?.isDirty()) nudge();
    aimCamera(w, h);
    renderer.render(scene, camera);
  }

  function placeShip() {
    const [x, y] = xy(plane.lat, plane.lon);
    ship.position.set(x, y, plane.altFt);
    ship.rotation.set(0, 0, compassDegToHeadingRad(plane.headingDegT ?? 0), 'ZYX');
    ship.visible = !plane.hidden; // hidden: a place for the camera to look at, with no aircraft drawn
  }

  // Drag swings the chase camera round the aircraft; the wheel moves it closer or further.
  let drag = null;
  const onDown = (e) => {
    if (mode !== 'chase') return;
    drag = { x: e.clientX, y: e.clientY, yaw: look.yawDeg, pitch: look.pitchDeg };
    canvas.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!drag) return;
    look.yawDeg = drag.yaw - (e.clientX - drag.x) * 0.3;
    look.pitchDeg = Math.max(-5, Math.min(85, drag.pitch + (e.clientY - drag.y) * 0.3));
    draw();
  };
  const onUp = () => {
    drag = null;
  };
  const onWheel = (e) => {
    if (mode !== 'chase') return;
    e.preventDefault();
    look.distFt = Math.max(CHASE.minFt, Math.min(CHASE.maxFt, look.distFt * Math.exp(e.deltaY * 0.0015)));
    draw();
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  const resizer = globalThis.ResizeObserver ? new globalThis.ResizeObserver(() => draw()) : null;
  resizer?.observe(host);

  return {
    setArea,
    /** The route's turn points and computeLegs' legs; redrawn in the area's frame. */
    setRoute(points, legs) {
      route = { points, legs };
      buildRoute();
    },
    setFlown(fixes) {
      flown = fixes;
      buildFlown();
    },
    /** The aircraft: { lat, lon, altFt, headingDegT, hidden? }, or null to hide it (hidden: the chase camera's centre with no aircraft drawn). */
    setAircraft(pos) {
      plane = pos;
      if (pos) placeShip();
      else ship.visible = false;
    },
    /** The chase camera, behind the aircraft; `distFt` and `pitchDeg` (above the horizon) to start from, both optional. */
    chase(distFt, pitchDeg) {
      mode = 'chase';
      if (Number.isFinite(distFt)) look.distFt = distFt;
      if (Number.isFinite(pitchDeg)) look.pitchDeg = pitchDeg;
      look.yawDeg = 0;
    },
    /** The eye camera from { lat, lon, altFt } looking at { lat, lon, altFt }. */
    eye(from, to) {
      mode = 'eye';
      const [fx, fy] = xy(from.lat, from.lon);
      const [tx, ty] = xy(to.lat, to.lon);
      eyeAt = { from: [fx, fy, from.altFt], to: [tx, ty, to.altFt] };
    },
    /** The drawn ground's height (ft) at a point, or NaN outside the area or where no tile came. */
    groundAt(lat, lon) {
      if (!terrain) return NaN;
      const [x, y] = xy(lat, lon);
      return terrain.known(x, y) ? terrain.heightFt(x, y) : NaN;
    },
    isRouteStale: () => (terrain?.revision ?? 0) !== routeRevision,
    redraw: draw,
    dispose() {
      disposed = true;
      wake?.();
      resizer?.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      clearGroup(routeGroup);
      flown = null;
      buildFlown();
      disposeCt156Model(ship);
      airports?.dispose();
      terrain?.dispose();
      ground?.dispose();
      sky.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
