// SPIKE (not for merge): the Debrief 3D view drawn with three.js instead of by
// hand on a 2D canvas. Same data functions as view.js (shipsIn3d, groundDatumFt,
// groundGrid, formationCenter, sampleAt) and a camera that reproduces
// scene.js projectPoint exactly (orthographic), so no flight math changes;
// only the drawing does. World: X east ft, Y north ft, Z up = altFt * altScale.
import * as THREE from 'three';
import { SHIP_COLORS, OUTLINE_COLOR } from '../state.js';
import { sampleAt } from '../../../flight-data/flight.js';
import { formationCenter, projectPoint } from './scene.js';
import { shipsIn3d, groundDatumFt, heightLabel, groundGrid, GROUND_EXTENT_FT } from './frame.js';

const D = 500_000; // camera distance, ft (orthographic, so it only has to be far)
const TRAIL_SAMPLES = 80;
const TEXT = '#d9e6f2';
const HORIZON = '#1a3a55';
const rad = (d) => (d * Math.PI) / 180;
const ft = (n) => Math.round(n).toLocaleString('en-US');

// One T-6-like aircraft in unit length: nose +X, left +Y, up +Z.
function buildAircraftGeometry() {
  // Fuselage: lathe profile (radius, axial) around Y, then turned so the axis is +X.
  const profile = [
    [0.004, -0.78], [0.02, -0.72], [0.034, -0.55], [0.05, -0.3], [0.072, -0.05],
    [0.085, 0.15], [0.088, 0.3], [0.085, 0.42], [0.07, 0.5], [0.06, 0.52], [0.001, 0.52],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const fuselage = new THREE.LatheGeometry(profile, 20);
  fuselage.rotateZ(-Math.PI / 2);

  const flat = (pts, depth, z0) => {
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    g.translate(0, 0, z0);
    return g;
  };
  // Straight, tapered, low wing (plan view: x forward, y left).
  const wing = flat([[0.16, 0.66], [0.33, 0.07], [0.33, -0.07], [0.16, -0.66], [0.06, -0.66], [0.03, -0.07], [0.03, 0.07], [0.06, 0.66]], 0.022, -0.05);
  // Horizontal stab.
  const stab = flat([[-0.6, 0.3], [-0.5, 0.05], [-0.5, -0.05], [-0.6, -0.3], [-0.7, -0.3], [-0.72, -0.03], [-0.72, 0.03], [-0.7, 0.3]], 0.014, 0.0);
  // Vertical fin: shape in (x, up), extruded across.
  const finShape = new THREE.Shape([[-0.42, 0.03], [-0.6, 0.24], [-0.72, 0.24], [-0.72, 0.03]].map(([x, z]) => new THREE.Vector2(x, z)));
  const fin = new THREE.ExtrudeGeometry(finShape, { depth: 0.014, bevelEnabled: false });
  fin.translate(0, 0, -0.007);
  fin.rotateX(Math.PI / 2);
  fin.translate(0, 0, 0);

  const canopy = new THREE.SphereGeometry(1, 16, 10);
  canopy.scale(0.17, 0.062, 0.062);
  canopy.translate(0.17, 0, 0.075);

  const spinner = new THREE.ConeGeometry(0.045, 0.14, 14);
  spinner.rotateZ(-Math.PI / 2);
  spinner.translate(0.59, 0, 0);

  const disc = new THREE.CircleGeometry(0.26, 32);
  disc.rotateY(Math.PI / 2);
  disc.translate(0.53, 0, 0);

  return { fuselage, wing, stab, fin, canopy, spinner, disc };
}

function buildAircraft(geo, colorHex) {
  const base = new THREE.Color(colorHex);
  const mat = (color, extra) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.55, metalness: 0.1, ...extra });
  const g = new THREE.Group();
  const add = (geometry, material) => g.add(new THREE.Mesh(geometry, material));
  add(geo.fuselage, mat(base));
  add(geo.wing, mat(base.clone().multiplyScalar(0.82)));
  add(geo.stab, mat(base.clone().multiplyScalar(0.82)));
  add(geo.fin, mat(base.clone().lerp(new THREE.Color('#ffffff'), 0.15)));
  add(geo.canopy, mat('#8fc4ff', { transparent: true, opacity: 0.6, roughness: 0.1, metalness: 0.4 }));
  add(geo.spinner, mat('#20242a', { roughness: 0.4 }));
  add(geo.disc, new THREE.MeshBasicMaterial({ color: '#dcebff', transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
  return g;
}

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const x = c.getContext('2d');
  const grad = x.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#040a12');
  grad.addColorStop(0.35, '#0b1c2e');
  grad.addColorStop(0.7, HORIZON);
  grad.addColorStop(1, HORIZON);
  x.fillStyle = grad;
  x.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * canvas: the WebGL <canvas> (its parent should be a positioned box; a 2D label
 * layer is laid over it). flight(), time(), settings(), fieldFt() as createView3d.
 * Returns { render(), dispose(), projectToScreen(p) } (the last is for checking
 * the camera against scene.js).
 */
export function createThreeView3d(canvas, { flight, time, settings, fieldFt }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setClearColor(HORIZON);
  const scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(HORIZON, D + 5_000, D + 70_000);

  scene.add(new THREE.HemisphereLight('#b8d0ff', '#12301a', 0.8));
  const sun = new THREE.DirectionalLight('#fff3dd', 3);
  sun.position.set(-0.5, -0.7, 1).normalize().multiplyScalar(1000);
  scene.add(sun, sun.target);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, D - 250_000, D + 250_000);
  const geo = buildAircraftGeometry();
  const ships = new Map(); // slot -> group
  const dynamic = new THREE.Group(); // ground, grid, trails, sticks: rebuilt each render
  scene.add(dynamic);

  // The label layer: same box, drawn with scene.js projectPoint (the camera matches).
  const box = canvas.parentElement;
  if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
  const overlay = document.createElement('canvas');
  overlay.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none';
  canvas.after(overlay);

  let lastCamera = null;

  function clearDynamic() {
    for (const o of [...dynamic.children]) {
      dynamic.remove(o);
      o.geometry?.dispose();
      o.material?.dispose();
    }
  }

  function render() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    const ratio = globalThis.devicePixelRatio || 1;
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    overlay.width = Math.round(w * ratio);
    overlay.height = Math.round(h * ratio);
    const ctx = overlay.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const shown = flight();
    if (!shown) {
      renderer.clear();
      return;
    }
    const on = settings();
    const t = time();
    const size = { width: w, height: h };
    const cam = { yawDeg: on.yaw3d, pitchDeg: on.pitch3d, zoom: on.zoom3d, altScale: on.altScale3d };
    const all = shipsIn3d(shown, t);
    const live = Object.fromEntries(all.map((s) => [s.slot, s]));
    const ctr = formationCenter(live, on.cam3d);
    const datum = groundDatumFt(all, on.datum3d, fieldFt());
    const S = on.altScale3d;
    const Zw = (altFt) => altFt * S;

    // Camera identical to projectPoint: yaw about vertical, tilt by pitch, orthographic.
    const yaw = rad(on.yaw3d);
    const pitch = rad(on.pitch3d);
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const ey1 = new THREE.Vector3(sy, cy, 0);
    const up = new THREE.Vector3(0, 0, 1);
    const target = new THREE.Vector3(ctr.x, ctr.y, Zw(ctr.z));
    camera.up.copy(ey1).multiplyScalar(cp).addScaledVector(up, sp);
    camera.position.copy(target).addScaledVector(ey1, -sp * D).addScaledVector(up, cp * D);
    const pxPerFt = on.zoom3d / 1000;
    camera.left = -(w / 2) / pxPerFt;
    camera.right = (w / 2) / pxPerFt;
    camera.top = (h / 2) / pxPerFt;
    camera.bottom = -(h / 2) / pxPerFt;
    camera.updateProjectionMatrix();
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
    lastCamera = { size };

    clearDynamic();
    const ftPerPx = 1 / pxPerFt;
    const dz = Zw(datum);

    // Ground (fixed to the map), then its grid.
    if (on.landscape3d || on.groundRef3d) {
      const ext = GROUND_EXTENT_FT * 2;
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(ext * 2, ext * 2),
        new THREE.MeshStandardMaterial({ color: '#0b4a1e', roughness: 1, metalness: 0 }),
      );
      plane.position.set(ctr.x, ctr.y, dz);
      dynamic.add(plane);
    }
    if (on.grid3d) {
      const { xs, ys, min, max } = groundGrid(ctr);
      const pts = [];
      for (const x of xs) pts.push(x, min.y, dz + 4, x, max.y, dz + 4);
      for (const y of ys) pts.push(min.x, y, dz + 4, max.x, y, dz + 4);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      dynamic.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#7ee787', transparent: true, opacity: 0.28 })));
    }

    // Trails: last trailSec3d seconds, broken where a ship is in a GPS gap; fade toward the tail.
    if (on.trailSec3d > 0) {
      for (const tr of Object.values(shown.tracks)) {
        const t0 = Math.max(shown.startT, t - on.trailSec3d);
        const pos = [];
        const col = [];
        const base = new THREE.Color(SHIP_COLORS[tr.slot]);
        const bg = new THREE.Color('#0b1c2e');
        let prev = null;
        for (let i = 0; i <= TRAIL_SAMPLES; i++) {
          const s = sampleAt(tr, t0 + ((t - t0) * i) / TRAIL_SAMPLES);
          if (s.inGap) { prev = null; continue; }
          const c = bg.clone().lerp(base, 0.25 + 0.75 * (i / TRAIL_SAMPLES));
          const p = [s.xFt, s.yFt, Zw(s.altFt), c];
          if (prev) pos.push(prev[0], prev[1], prev[2], p[0], p[1], p[2]), col.push(prev[3].r, prev[3].g, prev[3].b, c.r, c.g, c.b);
          prev = p;
        }
        if (!pos.length) continue;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        dynamic.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, fog: false })));
      }
    }

    // Aircraft (position scaled by altScale; the model itself is not).
    const seen = new Set();
    for (const s of all) {
      seen.add(s.slot);
      let m = ships.get(s.slot);
      if (!m) {
        m = buildAircraft(geo, SHIP_COLORS[s.slot]);
        ships.set(s.slot, m);
        scene.add(m);
      }
      m.visible = true;
      m.position.set(s.x, s.y, Zw(s.altFt));
      m.scale.setScalar(on.planeSize3d);
      m.rotation.order = 'ZYX';
      m.rotation.set(-rad(s.bankDeg), -rad(s.pitchDeg), s.hdg ?? 0);
    }
    for (const [slot, m] of ships) if (!seen.has(slot)) m.visible = false;

    // Sticks to the ground (dashed) with a shadow disc.
    if (on.sticks3d) {
      for (const s of all) {
        const color = SHIP_COLORS[s.slot];
        const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(s.x, s.y, Zw(s.altFt)), new THREE.Vector3(s.x, s.y, dz + 6)]);
        const line = new THREE.Line(g, new THREE.LineDashedMaterial({ color, dashSize: 8 * ftPerPx, gapSize: 5 * ftPerPx, fog: false }));
        line.computeLineDistances();
        dynamic.add(line);
        const disc = new THREE.Mesh(
          new THREE.CircleGeometry(on.planeSize3d * 0.55, 32),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false }),
        );
        disc.position.set(s.x, s.y, dz + 8);
        dynamic.add(disc);
      }
    }

    renderer.render(scene, camera);

    // Labels and caption on the 2D layer, positioned with scene.js projectPoint.
    const outlined = (text, x, y, color) => {
      ctx.lineWidth = 3;
      ctx.strokeStyle = OUTLINE_COLOR;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
    };
    ctx.lineJoin = 'round';
    for (const s of all) {
      const c = projectPoint(s, ctr, cam, size);
      ctx.font = '600 12px system-ui, sans-serif';
      outlined(`#${s.slot}`, c.x + 12, c.y - 14, SHIP_COLORS[s.slot]);
      if (on.attLabels3d && s.hdg !== null) {
        const bank = Math.round(Math.abs(s.bankDeg));
        const p = Math.round(s.pitchDeg);
        ctx.font = '10px system-ui, sans-serif';
        outlined(`bank ${bank}°${bank ? (s.bankDeg > 0 ? ' L' : ' R') : ''}, pitch ${p > 0 ? '+' : ''}${p}°`, c.x + 12, c.y + 2, TEXT);
      }
      if (on.sticks3d) {
        const g = projectPoint({ x: s.x, y: s.y, altFt: datum }, ctr, cam, size);
        ctx.font = '11px system-ui, sans-serif';
        outlined(`${ft(s.altFt - datum)} ${heightLabel(on.datum3d)}`, (c.x + g.x) / 2 + 8, (c.y + g.y) / 2, TEXT);
      }
    }
    ctx.font = '12px system-ui, sans-serif';
    outlined(`Altitude ×${S}`, 14, 22, TEXT);
    outlined(`Ground: ${ft(datum)} ft`, 14, 40, TEXT);
  }

  return {
    render,
    /** Screen position (CSS px) of a world point, from the three.js camera. */
    projectToScreen(p) {
      const { size } = lastCamera;
      const v = new THREE.Vector3(p.x, p.y, p.z).project(camera);
      return { x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height };
    },
    dispose() {
      clearDynamic();
      overlay.remove();
      renderer.dispose();
    },
  };
}
