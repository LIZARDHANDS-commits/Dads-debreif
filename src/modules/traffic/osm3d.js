// Roads and power lines from OpenStreetMap (TR-147; Patrick, 11 Oct: yes to "Roads from OpenStreetMap", "Power lines"). The data is
// osm-features.js (made once by tools/osm/build-osm.mjs; © OpenStreetMap contributors, ODbL), so nothing is fetched while it runs.
//
// Roads are crisp ribbons over the photo, one mesh per surface (highway with painted lines, plain asphalt, gravel, dirt track), laid
// on the real ground. Widths are estimates: a highway 36 ft with its shoulders, a paved road or street 28 ft, a gravel grid road
// 26 ft, a farm track 12 ft. Power lines stand on wooden poles where OpenStreetMap has them, with poles put in between where its
// spans are longer than real ones: transmission lines on H-frames about 65 ft tall, spans up to 700 ft; distribution lines on single
// 35 ft poles, spans up to 300 ft; the wires sag 3% of the span (all estimates of common Saskatchewan practice). Drawing only.
// userData.drape(heights) lays everything on the real ground (view3d.js applyGround).
import { OSM_ROADS, OSM_POWER } from './osm-features.js';
import { holdScreenWidth, trackScreen } from './min-width3d.js';

const ROAD_WIDTH_FT = Object.freeze({ highway: 36, paved: 28, gravel: 26, dirt: 12 });
const ROAD_TILE_FT = 120; // the length one road picture covers (tools/osm/make-road-textures.py)
const ROAD_STEP_FT = 80; // points along a road this far apart at most, so it follows the ground
const ROAD_LIFT_FT = 1.5; // just above the ground
/** Far off a road holds at least this many pixels wide, up to this many times its width (min-width3d.js; estimates, set by eye). */
const ROAD_MIN_PX = 1.2;
const ROAD_GROW_MAX = 4;
const POWER = Object.freeze({
  line: Object.freeze({ spanFt: 700, poleFt: 65, legs: 10, arms: Object.freeze([-12, 0, 12]), armFt: 30, wireZ: 61 }),
  minor: Object.freeze({ spanFt: 300, poleFt: 35, legs: 0, arms: Object.freeze([-3.5, 3.5]), armFt: 8, wireZ: 33 }),
});
const SAG = 0.03;
const WIRE_FADE_FT = Object.freeze({ from: 1500, to: 6000 }); // estimates: wires are hard to see past about a mile

const mediaBase = () => (typeof import.meta !== 'undefined' && /** @type {any} */ (import.meta).env?.BASE_URL) || '/';
const pairs = (flat) => Array.from({ length: flat.length / 2 }, (_, i) => [flat[2 * i], flat[2 * i + 1]]);

/** Points no more than `step` apart along a polyline. */
function densify(pts, step) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  return out;
}

/** One road surface's ribbons as a mesh: positions (z set by drape), UVs across 0..1 and along in tiles. */
function roadMesh(THREE, surface) {
  const half = ROAD_WIDTH_FT[surface] / 2;
  const pos = [], uv = [], idx = [], ground = [], widths = [], grow = [];
  for (const r of OSM_ROADS) {
    if (r.s !== surface) continue;
    const pts = densify(pairs(r.p), ROAD_STEP_FT);
    if (pts.length < 2) continue;
    const base = pos.length / 3;
    let along = 0;
    pts.forEach(([x, y], i) => {
      const [px, py] = pts[Math.max(0, i - 1)], [nx, ny] = pts[Math.min(pts.length - 1, i + 1)];
      const dl = Math.hypot(nx - px, ny - py) || 1;
      let ox = -(ny - py) / dl, oy = (nx - px) / dl; // left, the mean of the two sides' directions
      // Mitre: widen at a bend so the road keeps its width, at most twice.
      if (i > 0 && i < pts.length - 1) {
        const [ax, ay] = pts[i - 1];
        const la = Math.hypot(x - ax, y - ay) || 1;
        const cos = (-(y - ay) / la) * ox + ((x - ax) / la) * oy;
        const k = 1 / Math.max(0.5, cos);
        ox *= k;
        oy *= k;
      }
      if (i > 0) along += Math.hypot(x - pts[i - 1][0], y - pts[i - 1][1]);
      pos.push(x + ox * half, y + oy * half, ROAD_LIFT_FT, x - ox * half, y - oy * half, ROAD_LIFT_FT);
      ground.push(x + ox * half, y + oy * half, x - ox * half, y - oy * half);
      uv.push(0, along / ROAD_TILE_FT, 1, along / ROAD_TILE_FT);
      const ol = Math.hypot(ox, oy) || 1;
      widths.push(2 * half, 2 * half);
      grow.push(ox / ol, oy / ol, -ox / ol, -oy / ol);
      if (i > 0) {
        const a = base + 2 * (i - 1);
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('stripeW', new THREE.Float32BufferAttribute(widths, 1));
  geometry.setAttribute('growDir', new THREE.Float32BufferAttribute(grow, 2));
  geometry.setIndex(idx);
  const material = new THREE.MeshBasicMaterial({
    transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
    color: { highway: '#5f5f62', paved: '#68686b', gravel: '#ada288', dirt: '#8c7a5f' }[surface],
  });
  if (typeof document !== 'undefined') {
    new THREE.TextureLoader().load(`${mediaBase()}media/traffic-textures/road-${surface}.png`, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
      material.map = t;
      material.color.set('#ffffff');
      material.needsUpdate = true;
    });
  }
  holdScreenWidth(material, { minPx: ROAD_MIN_PX, maxGrow: ROAD_GROW_MAX, floor: 0.3 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.onBeforeRender = trackScreen(THREE);
  mesh.name = `osm-roads-${surface}`;
  mesh.renderOrder = -2.5; // over the pattern photo, under the airfield's sharp photo
  mesh.userData.ground = ground;
  return mesh;
}

/** Each power line's poles: [x, y, heading] with the poles OpenStreetMap has and more where its spans are long. */
function poles() {
  const out = { line: [], minor: [] };
  for (const l of OSM_POWER) {
    const P = POWER[l.k];
    const pts = densify(pairs(l.p), P.spanFt);
    const line = pts.map(([x, y], i) => {
      const [ax, ay] = pts[Math.max(0, i - 1)], [bx, by] = pts[Math.min(pts.length - 1, i + 1)];
      return [x, y, Math.atan2(by - ay, bx - ax)];
    });
    out[l.k].push(line);
  }
  return out;
}

/** A pole's shape, standing on z = 0 with its crossarm across the line (local y): two legs for an H-frame, one otherwise. */
function poleGeometry(THREE, P) {
  const parts = [];
  for (const y of P.legs ? [-P.legs / 2, P.legs / 2] : [0]) {
    const leg = new THREE.CylinderGeometry(0.5, 0.7, P.poleFt, 6);
    leg.rotateX(Math.PI / 2);
    leg.translate(0, y, P.poleFt / 2);
    parts.push(leg);
  }
  const arm = new THREE.BoxGeometry(0.8, P.armFt, 0.8);
  arm.translate(0, 0, P.wireZ + 0.6);
  parts.push(arm);
  const pos = [];
  for (const g of parts) {
    const n = g.index ? g.toNonIndexed() : g;
    pos.push(...n.attributes.position.array);
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * The roads and power lines, at z = floor; userData.drape(heights) lays them on the ground (heights.offsetAt, or flat for null).
 * @param {any} THREE
 * @param {number} floor
 */
export function createOsmFeatures(THREE, floor) {
  const group = new THREE.Group();
  group.name = 'osm-features';
  group.position.z = floor;
  const roads = Object.keys(ROAD_WIDTH_FT).map((s) => roadMesh(THREE, s));
  group.add(...roads);

  const lines = poles();
  const wood = new THREE.MeshLambertMaterial({ color: '#6b5640' });
  const poleMeshes = {};
  for (const k of Object.keys(POWER)) {
    const all = lines[k].flat();
    const mesh = new THREE.InstancedMesh(poleGeometry(THREE, POWER[k]), wood, Math.max(1, all.length));
    mesh.count = all.length;
    mesh.name = `power-poles-${k}`;
    poleMeshes[k] = mesh;
    group.add(mesh);
  }
  const wireGeo = new THREE.BufferGeometry();
  const wireMat = new THREE.LineBasicMaterial({ color: '#2b2b2b', transparent: true, opacity: 0.75, fog: false });
  // A drawn line is never thinner than a pixel, so the wires fade out between WIRE_FADE_FT.from and .to from the eye, where real ones
  // can no longer be seen; the poles stay.
  wireMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vCamDist;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCamDist = distance((modelMatrix * vec4(transformed, 1.0)).xyz, cameraPosition);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vCamDist;')
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>\ngl_FragColor.a *= 1.0 - smoothstep(${WIRE_FADE_FT.from.toFixed(1)}, ${WIRE_FADE_FT.to.toFixed(1)}, vCamDist);`);
  };
  wireMat.customProgramCacheKey = () => 'power-wires-fade';
  const wires = new THREE.LineSegments(wireGeo, wireMat);
  wires.name = 'power-wires';
  group.add(wires);

  const drape = (heights) => {
    const at = (x, y) => (heights ? heights.offsetAt(x, y) : 0);
    for (const mesh of roads) {
      const pos = mesh.geometry.attributes.position;
      const g = mesh.userData.ground;
      for (let i = 0; i < pos.count; i++) pos.setZ(i, at(g[2 * i], g[2 * i + 1]) + ROAD_LIFT_FT);
      pos.needsUpdate = true;
      mesh.geometry.computeBoundingSphere();
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), zAxis = new THREE.Vector3(0, 0, 1), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    const seg = [];
    for (const k of Object.keys(POWER)) {
      const P = POWER[k];
      let n = 0;
      for (const line of lines[k]) {
        const tops = line.map(([x, y, h]) => {
          const z = at(x, y);
          poleMeshes[k].setMatrixAt(n++, m.compose(p.set(x, y, z), q.setFromAxisAngle(zAxis, h), one));
          return P.arms.map((off) => [x - Math.sin(h) * off, y + Math.cos(h) * off, z + P.wireZ]);
        });
        // Each wire from pole to pole, sagging in the middle (a parabola, 6 pieces a span).
        for (let i = 1; i < tops.length; i++) {
          for (let w = 0; w < P.arms.length; w++) {
            const [ax, ay, az] = tops[i - 1][w], [bx, by, bz] = tops[i][w];
            const sag = SAG * Math.hypot(bx - ax, by - ay);
            let prev = [ax, ay, az];
            for (let s = 1; s <= 6; s++) {
              const t = s / 6;
              const cur = [ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t - 4 * sag * t * (1 - t)];
              seg.push(...prev, ...cur);
              prev = cur;
            }
          }
        }
      }
      poleMeshes[k].instanceMatrix.needsUpdate = true;
      poleMeshes[k].computeBoundingSphere?.();
    }
    wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
    wireGeo.computeBoundingSphere();
  };
  drape(null);
  group.userData.drape = drape;
  return group;
}

/** Frees everything createOsmFeatures made. */
export function disposeOsmFeatures(group) {
  if (!group) return;
  group.traverse((o) => {
    o.geometry?.dispose();
    for (const m of [].concat(o.material ?? [])) {
      m.map?.dispose();
      m.dispose();
    }
    if (o.isInstancedMesh) o.dispose?.();
  });
  group.clear();
  group.removeFromParent();
}
