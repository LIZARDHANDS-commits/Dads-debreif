// Airfield furniture (TR-141; Patrick, 10 Oct: "Airfield furniture: runway, approach and PAPI lights, taxiway and hold signs, proper
// trees instead of cones, ramp vehicles and parked aircraft"). Drawing only: nothing here changes how anything flies.
//
// SOURCES. Lights and signs follow standard airfield practice (TP 312, Aerodrome Standards, and the FAA's equivalents), not a CYMJ
// survey, so their layout is AN ESTIMATE until the Canada Flight Supplement's CYMJ entry is checked: edge lights every 200 ft just
// off the pavement edge, green threshold lights across each threshold bar, a simple approach light line, and a four-box PAPI on
// the left of 29L and 29R set for a 3 degree approach. The signs stand at every holding position the paint has (runway-markings.js):
// a red hold sign with the runway's designators and, outboard of it, a black location sign with the taxiway's working letter. The
// parked Harvards and the ramp vehicles stand where Esri's photo shows them (10 Oct, about ±5 ft).
//
// The PAPI shows what a pilot would see from wherever the camera is: each box white above its angle and red below, so on a
// 3 degree slope two whites and two reds, the reds nearer the runway.

import { RUNWAY_ENDS, AIM_FROM_FT, holdingPositions } from './runway-markings.js';
import { disposeCt156Model, CT156_UNIT_LENGTH } from '../../ui-kit/ct156-model.js';
import { createAircraftMesh } from '../../ui-kit/three-aircraft.js';
import { batchByMaterial } from './batch3d.js';

/** Light layout, ft (estimates from standard practice; see the header). */
const LIGHTS = Object.freeze({
  edgeEveryFt: 200, // TP 312: no more than 60 m apart
  edgeOutFt: 4, // past the edge stripe's middle, just off the pavement
  thresholdEveryFt: 10, // green, across the threshold bar
  thresholdHalfFt: 75,
  approach: Object.freeze({ fromFt: 200, toFt: 1400, everyFt: 100, barHalfFt: 7, perBar: 5, crossAtFt: 1000, crossHalfFt: 50, crossEveryFt: 10 }),
  headFt: 0.8, // the light's diameter
  standFt: 1.2, // its stalk, to the light's middle
});
/**
 * The PAPI (estimate, standard layout): four boxes on the left of each landing runway, level with the aiming point, the inner
 * box 50 ft from the pavement edge and 30 ft apart; set for a 3 degree approach, their angles 3.5, 3.17, 2.83 and 2.5 degrees
 * from the inside out (FAA AC 150/5345-28 layout; standard practice, not a CYMJ source).
 */
const PAPI = Object.freeze({ alongFt: AIM_FROM_FT + 60, innerFt: 50, spacingFt: 30, anglesDeg: Object.freeze([3.5, 3.17, 2.83, 2.5]), box: Object.freeze([3, 2.5, 2]) });
/** Signs: a 2.5 ft panel (30 in), its foot 1 ft off the ground, standing 15 ft outside the pavement edge (estimates). */
const SIGN = Object.freeze({ panelFt: 2.5, footFt: 1, outFt: 15, gapFt: 2, deepFt: 0.8, rowPx: 96 });
/** The parked Harvards (Esri's photo, 10 Oct): ft from the ARP and the way the nose points (degrees, 0 east, 90 north). */
const PARKED = Object.freeze([
  [-642, 1828, -135], [753, 1860, -90], [835, 1853, -90], [916, 1838, -90], [1087, 1820, -90], [1110, 1675, -90],
]);
/** Ramp vehicles (Esri's photo): a tug, two baggage carts and a van. [x, y, heading degrees, kind]. */
const VEHICLES = Object.freeze([
  [938, 1862, 0, 'tug'], [1095, 1843, 90, 'cart'], [1110, 1843, 90, 'cart'], [838, 1972, 0, 'van'],
]);
const T6_FT = 33.4; // the drawn length (types.js T6_LENGTH_FT)

function runwayFrame(a, b) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
  return { len, ux, uy, at: (s, n) => ({ x: a.x + s * ux - n * uy, y: a.y + s * uy + n * ux }) };
}

/** One InstancedMesh of `geo` at each [x, y, z] in `pts`. */
function instances(THREE, geo, material, pts, name) {
  const mesh = new THREE.InstancedMesh(geo, material, Math.max(1, pts.length));
  mesh.count = pts.length;
  mesh.name = name;
  const m = new THREE.Matrix4();
  pts.forEach(([x, y, z = 0], i) => mesh.setMatrixAt(i, m.makeTranslation(x, y, z)));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.userData.points = pts;
  return mesh;
}

/** The runway, threshold and approach lights: one draw call per colour plus one for the stalks. */
function runwayLights(THREE) {
  const white = [], green = [], approach = [];
  for (const R of RUNWAY_ENDS) {
    const f = runwayFrame(R.a, R.b);
    const s0 = R.barA, s1 = f.len + R.barBPast;
    const n = Math.round((s1 - s0) / LIGHTS.edgeEveryFt);
    for (let i = 0; i <= n; i++) {
      for (const side of [-1, 1]) {
        const p = f.at(s0 + ((s1 - s0) * i) / n, side * (R.edgeFt + LIGHTS.edgeOutFt));
        white.push([p.x, p.y]);
      }
    }
    for (const s of [s0 - 3, s1 + 3]) {
      for (let k = -LIGHTS.thresholdHalfFt; k <= LIGHTS.thresholdHalfFt + 1e-6; k += LIGHTS.thresholdEveryFt) {
        const p = f.at(s, k);
        green.push([p.x, p.y]);
      }
    }
    // The approach lights before the landing threshold (29L, 29R): a short bar every 100 ft and a crossbar at 1,000 ft.
    const A = LIGHTS.approach;
    for (let d = A.fromFt; d <= A.toFt; d += A.everyFt) {
      for (let k = 0; k < A.perBar; k++) {
        const p = f.at(s0 - d, -A.barHalfFt + (2 * A.barHalfFt * k) / (A.perBar - 1));
        approach.push([p.x, p.y]);
      }
      if (d === A.crossAtFt) {
        for (let k = A.crossEveryFt * 2; k <= A.crossHalfFt; k += A.crossEveryFt) {
          for (const side of [-1, 1]) {
            const p = f.at(s0 - d, side * k);
            approach.push([p.x, p.y]);
          }
        }
      }
    }
  }
  const g = new THREE.Group();
  g.name = 'runway-lights';
  const head = new THREE.SphereGeometry(LIGHTS.headFt / 2, 8, 6);
  head.translate(0, 0, LIGHTS.standFt);
  const stalk = new THREE.CylinderGeometry(0.12, 0.12, LIGHTS.standFt, 5);
  stalk.rotateX(Math.PI / 2);
  stalk.translate(0, 0, LIGHTS.standFt / 2);
  const lit = (color) => new THREE.MeshBasicMaterial({ color });
  g.add(instances(THREE, head, lit('#fff4d6'), white, 'runway-edge-lights'));
  g.add(instances(THREE, head, lit('#3dff6e'), green, 'threshold-lights'));
  const appHeads = instances(THREE, head, lit('#ffffff'), approach, 'approach-lights');
  const allStalks = instances(THREE, stalk, new THREE.MeshLambertMaterial({ color: '#5d6166' }), [...white, ...green, ...approach], 'light-stalks');
  g.add(appHeads, allStalks);
  // The approach lights run off the flat airfield onto the real ground: view3d.js stands them on it (drape).
  g.userData.drape = (heights) => {
    const m = new THREE.Matrix4();
    const firstApproach = white.length + green.length;
    approach.forEach(([x, y], i) => {
      const z = heights ? heights.offsetAt(x, y) : 0;
      appHeads.setMatrixAt(i, m.makeTranslation(x, y, z));
      allStalks.setMatrixAt(firstApproach + i, m.makeTranslation(x, y, z));
    });
    appHeads.instanceMatrix.needsUpdate = true;
    allStalks.instanceMatrix.needsUpdate = true;
  };
  return g;
}

/** The PAPI boxes: each lens turns red or white by the camera's angle above it. */
function papis(THREE) {
  const g = new THREE.Group();
  g.name = 'papi';
  const [bw, bd, bh] = PAPI.box;
  const boxGeo = new THREE.BoxGeometry(bw, bd, bh);
  boxGeo.translate(0, 0, 1 + bh / 2);
  const boxMat = new THREE.MeshLambertMaterial({ color: '#d8d4c8' });
  const lensGeo = new THREE.PlaneGeometry(bw * 0.8, bh * 0.6);
  const legGeo = new THREE.BoxGeometry(bw * 0.9, bd * 0.9, 1);
  legGeo.translate(0, 0, 0.5);
  const legMat = new THREE.MeshLambertMaterial({ color: '#4b4f55' });
  const red = new THREE.Color('#ff2a1a'), white = new THREE.Color('#ffffff');
  const here = new THREE.Vector3(), eye = new THREE.Vector3();
  for (const R of RUNWAY_ENDS) {
    const f = runwayFrame(R.a, R.b);
    const facing = Math.atan2(-f.uy, -f.ux); // the lenses face the approach
    PAPI.anglesDeg.forEach((deg, k) => {
      const p = f.at(R.barA + PAPI.alongFt, R.edgeFt + PAPI.innerFt + k * PAPI.spacingFt); // on the left of the landing runway
      const unit = new THREE.Group();
      unit.name = `papi-${R.ids[0]}-${k + 1}`;
      unit.position.set(p.x, p.y, 0);
      unit.rotation.z = facing + Math.PI / 2; // the box's -y side toward the approach
      unit.add(new THREE.Mesh(boxGeo, boxMat), new THREE.Mesh(legGeo, legMat));
      const lensMat = new THREE.MeshBasicMaterial({ color: white });
      const lens = new THREE.Mesh(lensGeo, lensMat);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(0, -bd / 2 - 0.05, 1 + bh / 2);
      lens.name = `${unit.name}-lens`;
      const tan = Math.tan((deg * Math.PI) / 180);
      lens.onBeforeRender = (renderer, scene, camera) => {
        lens.getWorldPosition(here);
        camera.getWorldPosition(eye);
        const above = (eye.z - here.z) / Math.max(1, Math.hypot(eye.x - here.x, eye.y - here.y));
        lensMat.color.copy(above >= tan ? white : red);
      };
      unit.add(lens);
      g.add(unit);
    });
  }
  return g;
}

/** Draws one sign's face onto the atlas row: 'hold' red with white letters and a black frame; 'location' black with yellow letters and a yellow frame. */
function drawSign(ctx, kind, text, y, rowPx) {
  ctx.font = `bold ${Math.round(rowPx * 0.68)}px "Arial Narrow", Arial, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width + rowPx * 0.5);
  const [bg, fg, frame] = kind === 'hold' ? ['#c8102e', '#ffffff', '#111111'] : ['#111111', '#ffd23a', '#ffd23a'];
  ctx.fillStyle = frame;
  ctx.fillRect(0, y, w, rowPx);
  const inset = Math.round(rowPx * 0.06);
  ctx.fillStyle = bg;
  ctx.fillRect(inset, y + inset, w - 2 * inset, rowPx - 2 * inset);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, y + rowPx / 2 + rowPx * 0.03);
  return w;
}

/** The hold and location signs at every holding position: one picture (an atlas) for all the faces, two draw calls in all. */
function signs(THREE) {
  if (typeof document === 'undefined') return null;
  const holds = holdingPositions();
  const lines = Object.fromEntries(RUNWAY_ENDS.map((R) => [R.ids[0], R]));
  const faces = new Map(); // `${kind}|${text}` -> { row, w }
  const list = [];
  for (const h of holds) {
    const R = lines[h.runway];
    const u = runwayFrame(R.a, R.b);
    // The designator whose direction lies to the pilot's left reads first (facing the runway: -ux, -uy).
    const cross = -h.ux * u.uy + h.uy * u.ux;
    const hold = cross > 0 ? `${R.ids[0]}-${R.ids[1]}` : `${R.ids[1]}-${R.ids[0]}`;
    const items = [['hold', hold]];
    if (h.taxiway !== '03-21') items.push(['location', h.taxiway === 'Echo' ? 'E' : h.taxiway]);
    for (const [kind, text] of items) if (!faces.has(`${kind}|${text}`)) faces.set(`${kind}|${text}`, { row: faces.size });
    list.push({ h, items });
  }
  const rowPx = SIGN.rowPx;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = faces.size * rowPx;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  for (const [key, face] of faces) {
    const [kind, text] = key.split('|');
    face.w = drawSign(ctx, kind, text, face.row * rowPx, rowPx);
  }
  const atlas = new THREE.CanvasTexture(canvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;

  const pos = [], uv = [], idx = [];
  const bodies = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: '#2a2d31' });
  const H = SIGN.panelFt;
  for (const { h, items } of list) {
    const left = { x: h.uy, y: -h.ux }; // the pilot's left, facing the runway
    const right = { x: -left.x, y: -left.y };
    let out = h.halfWidth + SIGN.outFt;
    for (const [kind, text] of items) {
      const face = faces.get(`${kind}|${text}`);
      const w = (H * face.w) / rowPx;
      const c = { x: h.x + left.x * (out + w / 2), y: h.y + left.y * (out + w / 2) };
      out += w + SIGN.gapFt;
      // The panel's body, turned so its face looks back along the taxiway at the pilot.
      const body = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, SIGN.deepFt, H + 0.2), bodyMat);
      body.position.set(c.x, c.y, SIGN.footFt + H / 2);
      body.rotation.z = Math.atan2(right.y, right.x);
      bodies.add(body);
      for (const leg of [-1, 1]) {
        const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, SIGN.footFt), bodyMat);
        l.position.set(c.x + right.x * leg * w * 0.35, c.y + right.y * leg * w * 0.35, SIGN.footFt / 2);
        bodies.add(l);
      }
      // The face: a quad just in front of the body, on the holding side, reading left to right for the pilot.
      const front = { x: h.ux * (SIGN.deepFt / 2 + 0.03), y: h.uy * (SIGN.deepFt / 2 + 0.03) };
      const v0 = 1 - (face.row + 1) / faces.size, v1 = 1 - face.row / faces.size, u1 = face.w / canvas.width;
      const base = pos.length / 3;
      for (const [sx, sz, uu, vv] of [[-0.5, 0, 0, v0], [0.5, 0, u1, v0], [0.5, 1, u1, v1], [-0.5, 1, 0, v1]]) {
        pos.push(c.x + front.x + right.x * sx * w, c.y + front.y + right.y * sx * w, SIGN.footFt + sz * H);
        uv.push(uu, vv);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const facesMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: atlas, side: THREE.DoubleSide }));
  facesMesh.name = 'sign-faces';
  const g = new THREE.Group();
  g.name = 'taxiway-signs';
  g.add(bodies, facesMesh);
  batchByMaterial(THREE, bodies);
  return g;
}

/**
 * The parked Harvards, as the photo shows them: the light Harvard (the plain T-6 shape in navy; TR-152, Patrick 12 Oct 2026: only
 * the aircraft being viewed or flown in is the detailed model), without the turning prop's disc.
 */
function parkedAircraft(THREE) {
  if (typeof document === 'undefined') return null;
  const g = new THREE.Group();
  g.name = 'parked-aircraft';
  const lift = (0.15 * T6_FT) / CT156_UNIT_LENGTH; // the light model has no gear: its belly about 3.5 ft up (estimate)
  for (const [x, y, hdg] of PARKED) {
    const ship = createAircraftMesh(THREE, { color: '#151d31', outline: '#0b1620' });
    ship.scale.setScalar(T6_FT / CT156_UNIT_LENGTH);
    ship.traverse((o) => { if (o.geometry?.type === 'CircleGeometry') o.visible = false; }); // parked: no prop blur
    ship.position.set(x, y, lift);
    ship.rotation.z = (hdg * Math.PI) / 180;
    ship.name = 'parked-harvard';
    g.add(ship);
  }
  return g;
}

/** A ramp vehicle, ft: a yellow tug, a white baggage cart or a white van (sizes estimates). */
function vehicle(THREE, mats, kind) {
  const g = new THREE.Group();
  const box = (w, d, h, z, mat, x = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), mat);
    m.position.set(x, 0, z + h / 2);
    g.add(m);
  };
  if (kind === 'tug') {
    box(10, 5.5, 2.5, 1, mats.yellow);
    box(3.5, 5, 3, 3.5, mats.yellow, -2.5);
    box(3.2, 4.8, 1.6, 4.4, mats.glass, -2.5);
  } else if (kind === 'cart') {
    box(8, 4.5, 3.5, 1.2, mats.white);
  } else {
    box(17, 6.5, 5.5, 1.3, mats.white);
    box(3, 6, 2.2, 3.6, mats.glass, 6.2);
  }
  for (const [wx, wy] of [[-0.3, -0.5], [-0.3, 0.5], [0.3, -0.5], [0.3, 0.5]]) {
    const len = kind === 'van' ? 17 : kind === 'tug' ? 10 : 8;
    const width = kind === 'van' ? 6.5 : kind === 'tug' ? 5.5 : 4.5;
    const w = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.8, 10), mats.tyre);
    w.position.set(wx * len, wy * width, 1);
    g.add(w);
  }
  return g;
}

function vehicles(THREE) {
  const mats = {
    yellow: new THREE.MeshLambertMaterial({ color: '#e8b51a' }),
    white: new THREE.MeshLambertMaterial({ color: '#eef0f1' }),
    glass: new THREE.MeshLambertMaterial({ color: '#2b3a4a' }),
    tyre: new THREE.MeshLambertMaterial({ color: '#1c1c1e' }),
  };
  const g = new THREE.Group();
  g.name = 'ramp-vehicles';
  for (const [x, y, hdg, kind] of VEHICLES) {
    const v = vehicle(THREE, mats, kind);
    v.position.set(x, y, 0);
    v.rotation.z = (hdg * Math.PI) / 180;
    g.add(v);
  }
  batchByMaterial(THREE, g);
  return g;
}

/**
 * Everything above, standing on the airfield at z = floor (the runways' level). userData.drape(heights) stands the approach
 * lights on the real ground (view3d.js applyGround).
 * @param {any} THREE
 * @param {number} floor
 */
export function createAirfieldFurniture(THREE, floor) {
  const group = new THREE.Group();
  group.name = 'airfield-furniture';
  group.position.z = floor;
  const lights = runwayLights(THREE);
  group.add(lights, papis(THREE), vehicles(THREE));
  const s = signs(THREE);
  if (s) group.add(s);
  const parked = parkedAircraft(THREE);
  if (parked) group.add(parked);
  group.userData.drape = lights.userData.drape;
  return group;
}

/** Frees everything createAirfieldFurniture made (the parked Harvards through ct156-model.js, which shares its parts). */
export function disposeAirfieldFurniture(group) {
  if (!group) return;
  const ships = [];
  group.traverse((o) => {
    if (o.userData?.ct156) ships.push(o);
  });
  for (const ship of ships) {
    ship.removeFromParent();
    disposeCt156Model(ship);
  }
  const geos = new Set(), mats = new Set();
  group.traverse((o) => {
    if (o.geometry) geos.add(o.geometry);
    for (const m of [].concat(o.material ?? [])) mats.add(m);
    if (o.isInstancedMesh) o.dispose?.();
  });
  for (const g of geos) g.dispose();
  for (const m of mats) {
    m.map?.dispose();
    m.dispose();
  }
  group.clear();
  group.removeFromParent();
}
