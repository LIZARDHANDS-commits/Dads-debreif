// Golden test (R9, D10): the 3D view's geometry in src/modules/debrief/view3d/
// scene.js against V6's own 3D Debrief code, run unchanged. These pin V6 before
// D40 (bank) and the #27 drawing fixes change it on purpose.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadV6 } from './v6-source.js';
import { seeded } from './inputs.js';
import {
  formationCenter, projectPoint, drawOrderV6, attitudeV6, t6PointsV6,
} from '../../src/modules/debrief/view3d/scene.js';

const MARKER = "const canvas=$('threeDCanvas')";

/** V6's 3D functions, reading their "sliders" from `dom` and the canvas size from `canvas`. */
function v6Scene() {
  return loadV6(['dpr', 'val', 'deg', 'centerOf', 'project', 'clamp', 'headingDelta', 'attitudeFor'], {
    marker: MARKER,
    prelude: `let dom={}, canvas={width:0,height:0}, apiObj=null, window={devicePixelRatio:1};
      const $=id=>dom[id]||null;
      const api=()=>apiObj;
      function setScene(s){ dom=s.dom||{}; canvas=s.canvas||canvas; apiObj=s.api||null; window.devicePixelRatio=s.dpr||1; }`,
    expose: ['setScene'],
  });
}

/** V6's T-6 drawing with a recording `project`, so its corner points can be read back in call order. */
function v6T6() {
  return loadV6(['drawLowPolyT6'], {
    marker: MARKER,
    prelude: `let calls=[], att={bank:0,pitch:0}, size=260;
      const noop=()=>{};
      const ctx=new Proxy({}, { get:(o,k)=> k in o ? o[k] : noop, set:(o,k,v)=>{ o[k]=v; return true; } });
      const $=()=>null;
      const dpr=()=>1;
      const val=(id,def)=> id==='threeDPlaneSize' ? size : def;
      const colorFor=()=>'#0066ff', shadeColor=()=>'#000';
      const attitudeFor=()=>att;
      const project=(p)=>{ calls.push(p); return {x:0,y:0,depth:0}; };
      function runT6(p, bankDeg, s){ calls=[]; att={bank:bankDeg,pitch:0}; size=s; drawLowPolyT6(1,p,{x:0,y:0,z:0}); return calls; }`,
    expose: ['runT6'],
  });
}

function slider(camera) {
  return {
    threeDYaw: { value: String(camera.yawDeg) }, threeDPitch: { value: String(camera.pitchDeg) },
    threeDZoom: { value: String(camera.zoom) }, threeDAltScale: { value: String(camera.altScale) },
  };
}

function randomPoint(r) {
  return { x: -30000 + 60000 * r(), y: -30000 + 60000 * r(), altFt: [0, undefined, 500 + 12000 * r()][Math.floor(3 * r())] };
}

function randomCamera(r) {
  return { yawDeg: -180 + 360 * r(), pitchDeg: 5 + 75 * r(), zoom: 10 + 290 * r(), altScale: [1, 2, 0.5 + 4 * r()][Math.floor(3 * r())] };
}

test('projectPoint matches V6 project for any camera, size and pixel ratio', () => {
  const v6 = v6Scene();
  const r = seeded(31);
  for (let i = 0; i < 3000; i++) {
    const camera = randomCamera(r);
    const size = { width: Math.round(300 + 3000 * r()), height: Math.round(200 + 2000 * r()) };
    const pxRatio = [1, 2, 1.25][Math.floor(3 * r())];
    const p = randomPoint(r), ctr = { x: 20000 * r(), y: 20000 * r(), z: 8000 * r() };
    v6.setScene({ dom: slider(camera), canvas: size, dpr: pxRatio });
    const want = v6.project(p, ctr);
    const got = projectPoint(p, ctr, camera, size, pxRatio);
    assert.deepEqual({ x: got.x, y: got.y, depth: got.depth }, { x: want.x, y: want.y, depth: want.depth });
  }
});

test('formationCenter matches V6 centerOf, following Lead or the whole formation', () => {
  const v6 = v6Scene();
  const r = seeded(32);
  for (let i = 0; i < 500; i++) {
    const live = {};
    for (const id of [1, 2, 3, 4]) live[id] = r() < 0.8 ? randomPoint(r) : null;
    for (const mode of ['followLead', 'center', 'free']) {
      v6.setScene({ dom: { threeDCamera: { value: mode } } });
      assert.deepEqual(formationCenter(live, mode), v6.centerOf(live));
    }
  }
  v6.setScene({ dom: { threeDCamera: { value: 'followLead' } } });
  assert.deepEqual(formationCenter({}, 'followLead'), v6.centerOf({}));
});

test('drawOrderV6 is V6\'s ascending-depth order', () => {
  const v6 = v6Scene();
  const r = seeded(33);
  for (let i = 0; i < 200; i++) {
    const camera = randomCamera(r), size = { width: 1200, height: 800 };
    const live = { 1: randomPoint(r), 2: randomPoint(r), 3: randomPoint(r), 4: randomPoint(r) };
    const ctr = formationCenter(live, 'center');
    v6.setScene({ dom: slider(camera), canvas: size });
    const want = Object.entries(live).sort((A, B) => v6.project(A[1], ctr).depth - v6.project(B[1], ctr).depth).map(e => e[0]);
    const got = drawOrderV6(Object.entries(live), ([, p]) => projectPoint(p, ctr, camera, size).depth).map(e => e[0]);
    assert.deepEqual(got, want);
  }
});

/** A turning aircraft sampled at t−1, t and t+1, as DADS3DAPI.getInterp would give it. */
function turning(r) {
  const t = 1000 + 5000 * r(), h = 2 * Math.PI * r(), kt = [0, 5, 60 + 300 * r()][Math.floor(3 * r())];
  const rate = [0, 1e-5, (r() - 0.5) * 0.6][Math.floor(3 * r())];
  const v = kt * 1.68781;
  const at = (dt) => ({ t: t + dt, x: v * Math.cos(h + rate * dt) * dt, y: v * Math.sin(h + rate * dt) * dt });
  const p = { ...at(0), spdKt: kt };
  if (r() < 0.4) p.pitchNative = -30 + 60 * r();
  if (r() < 0.4) p.gNative = [1, 1.01, 1.02, 0.5, -2, 0.5 + 5 * r()][Math.floor(6 * r())];
  const before = r() < 0.9 ? at(-1) : null, after = r() < 0.9 ? at(1) : null;
  if (before && r() < 0.1) delete before.t;
  return { p, before, after, t };
}

test('attitudeV6 matches V6 attitudeFor (bank from the turn or recorded G, recorded pitch or 0)', () => {
  const v6 = v6Scene();
  const r = seeded(34);
  for (let i = 0; i < 3000; i++) {
    const { p, before, after, t } = turning(r);
    v6.setScene({ api: { getTime: () => t, getTracks: () => ({ 2: {} }), getInterp: (id, tt) => (tt < t ? before : after) } });
    const want = v6.attitudeFor(2, p);
    const got = attitudeV6(p, before, after, t);
    assert.equal(got.bankDeg, want.bank);
    assert.equal(got.pitchDeg, want.pitch);
    assert.equal(got.pitchSource, want.src === 'native pitch' ? 'recorded' : 'estimated');
  }
  v6.setScene({ api: null });
  assert.deepEqual(v6.attitudeFor(1, { x: 0, y: 0 }), { bank: 0, pitch: 0, src: 'estimated' });
  assert.deepEqual(attitudeV6(null), { bankDeg: 0, pitchDeg: 0, pitchSource: 'estimated' });
});

const T6_ORDER = ['centre', 'nose', 'spinner', 'tail', 'fuseL', 'fuseR', 'aftL', 'aftR', 'wingL', 'wingR',
  'wingRootL', 'wingRootR', 'stabL', 'stabR', 'canopy', 'propL', 'propR', 'fin'];

test('t6PointsV6 gives the corner points V6 projects for the low-poly T-6', () => {
  const v6 = v6T6();
  const r = seeded(35);
  for (let i = 0; i < 1000; i++) {
    const p = { ...randomPoint(r), hdg: 2 * Math.PI * r() - Math.PI };
    const bankDeg = -85 + 170 * r(), size = 50 + 600 * r();
    const calls = v6.runT6(p, bankDeg, size);
    assert.equal(calls.length, T6_ORDER.length);
    const got = t6PointsV6(p, p.hdg, (bankDeg * Math.PI) / 180, size);
    T6_ORDER.forEach((name, k) => {
      if (name === 'centre') return assert.equal(calls[k], p);
      assert.deepEqual(got[name], { x: calls[k].x, y: calls[k].y, altFt: calls[k].altFt }, name);
    });
  }
});
