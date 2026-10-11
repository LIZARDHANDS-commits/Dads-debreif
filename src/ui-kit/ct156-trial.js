// The CT-156 model trial page (ct156-trial.html): the code model (ct156-model.js) and the Blender model
// (public/models/ct156.glb, built by tools/blender/build_ct156.py) side by side, same camera and light, with each one's
// frame time. Nothing in the app loads the Blender model yet; this page only compares the two.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createCt156Model, CT156_UNIT_LENGTH } from './ct156-model.js';
import { addLights } from './three-aircraft.js';

// The page sits at src/ui-kit/ in the dev server and the built site alike; public/ files sit at the site's root.
const MODEL_URL = new URL('../../models/ct156.glb', location.href);
const SHIP_COLOR = '#0066ff';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setScissorTest(true);
renderer.info.autoReset = false;
document.body.append(renderer.domElement);

function makeScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#6f9fd2');
  addLights(THREE, scene);
  return scene;
}
const scenes = { code: makeScene(), blender: makeScene() };
// The code model's paint carries its own sky reflection (ct156-model.js buildKit); a model file has none, so the Blender
// side gets the same sky and prairie as its scene's environment, to compare like with like.
const sky = document.createElement('canvas');
sky.width = 256;
sky.height = 128;
{
  const ctx = sky.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#2f6aa8'); g.addColorStop(0.3, '#6f9fd2'); g.addColorStop(0.49, '#dde9f3');
  g.addColorStop(0.51, '#8a8a62'); g.addColorStop(0.7, '#5d6440'); g.addColorStop(1, '#2c3220');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillRect(25.6, 15.4, 25.6, 10.2);
}
const skyTex = new THREE.CanvasTexture(sky);
skyTex.mapping = THREE.EquirectangularReflectionMapping;
skyTex.colorSpace = THREE.SRGBColorSpace;
// three's sky texture is Y-up; the aircraft frame is Z-up, so the environment is turned to match.
scenes.blender.environment = skyTex;
scenes.blender.environmentRotation.set(Math.PI / 2, 0, 0);
scenes.blender.environmentIntensity = 0.8;
const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 200);
camera.up.set(0, 0, 1);

let blenderTemplate = null;
let loadInfo = 'loading…';
const t0 = performance.now();
new GLTFLoader().load(MODEL_URL.href, (gltf) => {
  blenderTemplate = gltf.scene;
  blenderTemplate.traverse((o) => {
    if (o.isMesh && o.material.name === 'ship_color') o.material.color.set(SHIP_COLOR);
  });
  fetch(MODEL_URL.href, { method: 'HEAD' }).then((r) => {
    const kb = Math.round(Number(r.headers.get('content-length')) / 1024);
    loadInfo = `file ${kb || '?'} KB, loaded in ${Math.round(performance.now() - t0)} ms`;
  });
  loadInfo = `loaded in ${Math.round(performance.now() - t0)} ms`;
  setShips(shipCount);
}, undefined, (err) => { loadInfo = `failed to load: ${err.message ?? err}`; });

let shipCount = 1;
const fleets = { code: [], blender: [] };
function setShips(n) {
  shipCount = n;
  for (const key of ['code', 'blender']) {
    for (const s of fleets[key]) s.removeFromParent();
    fleets[key] = [];
  }
  const side = Math.ceil(Math.sqrt(n));
  for (let i = 0; i < n; i++) {
    const pos = n === 1 ? [0, 0, 0] : [((i % side) - (side - 1) / 2) * 2, (Math.floor(i / side) - (side - 1) / 2) * 2, 0];
    const code = createCt156Model(THREE, { color: SHIP_COLOR, number: 1, lengthFt: CT156_UNIT_LENGTH });
    code.position.set(...pos);
    scenes.code.add(code);
    fleets.code.push(code);
    if (blenderTemplate) {
      const b = blenderTemplate.clone();
      b.position.set(...pos);
      scenes.blender.add(b);
      fleets.blender.push(b);
    }
  }
}
setShips(1);

const VIEWS = {
  quarter: { from: [1.6, 1.1, 0.55], at: [0.05, 0, -0.05], fov: 35 },
  side: { from: [0, 3.2, 0], at: [-0.06, 0, -0.03], fov: 35 },
  top: { from: [-0.06, 0.001, 3.2], at: [-0.06, 0, 0], fov: 35 },
  chase: { from: [-2.2, 0.35, 0.45], at: [0.2, 0, 0], fov: 40 },
};
let view = 'quarter';
let spin = true;
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
  view = b.dataset.view;
  document.querySelectorAll('[data-view]').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
}));
document.querySelectorAll('[data-ships]').forEach((b) => b.addEventListener('click', () => {
  setShips(Number(b.dataset.ships));
  document.querySelectorAll('[data-ships]').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
}));
document.getElementById('spin').addEventListener('click', (e) => {
  spin = !spin;
  e.currentTarget.setAttribute('aria-pressed', String(spin));
});
document.getElementById('version').textContent = document.querySelector('meta[name="app-version"]')?.content ?? '';

// Frame time: the CPU time of each half's render call, averaged over the last 120 frames, plus three.js's draw calls and
// triangles for that half. (GPU time isn't measured; the frame time of the whole page shows in the browser's tools.)
const samples = { code: [], blender: [] };
const info = { code: {}, blender: {} };
let angle = 0;
function frame() {
  const w = innerWidth, h = innerHeight;
  if (renderer.domElement.width !== Math.floor(w * renderer.getPixelRatio())) renderer.setSize(w, h);
  if (spin) angle += 0.004;
  const v = VIEWS[view];
  const scale = shipCount === 1 ? 1 : 3.2;
  const c = Math.cos(angle), s = Math.sin(angle);
  const [fx, fy, fz] = v.from;
  camera.position.set((fx * c - fy * s) * scale, (fx * s + fy * c) * scale, fz * scale);
  camera.lookAt(...v.at);
  camera.fov = v.fov;
  camera.aspect = w / 2 / h;
  camera.updateProjectionMatrix();
  for (const [i, key] of ['code', 'blender'].entries()) {
    renderer.setViewport(i * w / 2, 0, w / 2, h);
    renderer.setScissor(i * w / 2, 0, w / 2, h);
    renderer.info.reset();
    const start = performance.now();
    renderer.render(scenes[key], camera);
    const ms = performance.now() - start;
    samples[key].push(ms);
    if (samples[key].length > 120) samples[key].shift();
    info[key] = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
  }
  for (const key of ['code', 'blender']) {
    const avg = samples[key].reduce((a, b) => a + b, 0) / samples[key].length;
    const extra = key === 'blender' ? `\n${loadInfo}` : '';
    document.getElementById(`stats-${key}`).textContent =
      `${shipCount} ship${shipCount > 1 ? 's' : ''}: ${avg.toFixed(2)} ms render (CPU), ${info[key].calls} draw calls, ${info[key].tris.toLocaleString()} triangles${extra}`;
  }
  window.ct156Trial = { samples, info, loadInfo, ready: Boolean(blenderTemplate) };
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
