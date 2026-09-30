// Golden test (R9, D10): the 3D view's geometry in src/modules/debrief/view3d/
// scene.js against V6's own 3D Debrief code, run unchanged. These pin V6 before
// D40 (bank) and the #27 drawing fixes change it on purpose; each change has
// its own test below saying exactly how it differs from V6.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadV6 } from './v6-source.js';
import { seeded } from './inputs.js';
import {
  formationCenter, projectPoint, drawOrder, bankFromTrack, t6Points,
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

test('#27: drawOrder paints far aircraft first, the reverse of V6\'s ascending-depth order', () => {
  const v6 = v6Scene();
  const r = seeded(33);
  for (let i = 0; i < 200; i++) {
    const camera = randomCamera(r), size = { width: 1200, height: 800 };
    const live = { 1: randomPoint(r), 2: randomPoint(r), 3: randomPoint(r), 4: randomPoint(r) };
    const ctr = formationCenter(live, 'center');
    v6.setScene({ dom: slider(camera), canvas: size });
    const depths = Object.entries(live).map(([id, p]) => v6.project(p, ctr).depth);
    if (new Set(depths).size < depths.length) continue; // ties keep insertion order both ways
    const v6Order = Object.entries(live).sort((A, B) => v6.project(A[1], ctr).depth - v6.project(B[1], ctr).depth).map(e => e[0]);
    const got = drawOrder(Object.entries(live), ([, p]) => projectPoint(p, ctr, camera, size).depth).map(e => e[0]);
    assert.deepEqual(got, [...v6Order].reverse());
  }
});

test('#27: looking straight down, the higher of two stacked aircraft is drawn last', () => {
  const camera = { yawDeg: 0, pitchDeg: 0, zoom: 70, altScale: 2 }, size = { width: 800, height: 600 };
  const live = { 1: { x: 0, y: 0, altFt: 8000 }, 2: { x: 0, y: 0, altFt: 7500 } };
  const ctr = formationCenter(live, 'center');
  const order = drawOrder(Object.entries(live), ([, p]) => projectPoint(p, ctr, camera, size).depth).map(e => e[0]);
  assert.deepEqual(order, ['2', '1']);
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

test('D40: bank from the real turn rate is V6\'s with the rate doubled', () => {
  const v6 = v6Scene();
  const r = seeded(34);
  for (let i = 0; i < 3000; i++) {
    const { p, before, after, t } = turning(r);
    if (before && !Number.isFinite(before.t)) continue; // V6's missing-time fallback is kept; checked below
    const noG = { ...p };
    delete noG.gNative;
    v6.setScene({ api: { getTime: () => t, getTracks: () => ({ 2: {} }), getInterp: (id, tt) => (tt < t ? before : after) } });
    const v6Bank = v6.attitudeFor(2, noG).bank;
    const got = bankFromTrack({ before, now: p, after, speedKt: p.spdKt, recordedBankDeg: null });
    assert.equal(got.source, 'estimated');
    if (v6Bank === 0) { assert.equal(got.bankDeg, 0); continue; }
    assert.equal(Math.sign(got.bankDeg), Math.sign(v6Bank));
    const want = Math.min(85, (Math.atan(2 * Math.tan((Math.abs(v6Bank) * Math.PI) / 180)) * 180) / Math.PI);
    assert.ok(Math.abs(Math.abs(got.bankDeg) - want) < 1e-9, `${got.bankDeg} vs ${want}`);
  }
  assert.deepEqual(bankFromTrack({}), { bankDeg: 0, source: 'estimated' });
});

/** A steady level turn flown at `kt` and `g`, sampled a second apart; left turns when dir is +1. */
function levelTurn(kt, g, dir) {
  const v = kt * 1.68781, rate = dir * (32.174 * Math.sqrt(g * g - 1)) / v, R = v / Math.abs(rate);
  const at = (t) => ({ t, x: R * Math.sin(Math.abs(rate) * t), y: dir * R * (1 - Math.cos(Math.abs(rate) * t)) });
  return { before: at(9), now: at(10), after: at(11), speedKt: kt };
}

test('D40: a 4 G level turn reads 75.5° with the turning wing down; V6 read about 63°', () => {
  const trueBank = (Math.acos(1 / 4) * 180) / Math.PI;
  const left = bankFromTrack(levelTurn(200, 4, 1));
  const right = bankFromTrack(levelTurn(200, 4, -1));
  // The chord headings of a circle sampled a second apart turn by exactly rate × 1 s,
  // but ground speed over a chord is a hair under the arc speed; well under 0.1°.
  assert.ok(Math.abs(left.bankDeg - trueBank) < 0.1, `${left.bankDeg}`);
  assert.ok(Math.abs(right.bankDeg + trueBank) < 0.1, `${right.bankDeg}`);
  const v6 = v6Scene();
  const turn = levelTurn(200, 4, 1);
  v6.setScene({ api: { getTime: () => 10, getTracks: () => ({ 2: {} }), getInterp: (id, tt) => (tt < 10 ? turn.before : turn.after) } });
  assert.ok(Math.abs(v6.attitudeFor(2, { ...turn.now, spdKt: 200 }).bank - 62.69) < 0.01);
});

test('D40: a wings-level 3 G pull with recorded G draws wings level; V6 drew 70.5°', () => {
  const pull = { before: { t: 9, x: 0, y: 2700 }, now: { t: 10, x: 0, y: 3000 }, after: { t: 11, x: 0, y: 3300 }, speedKt: 178 };
  assert.deepEqual(bankFromTrack(pull), { bankDeg: 0, source: 'estimated' });
  const v6 = v6Scene();
  v6.setScene({ api: { getTime: () => 10, getTracks: () => ({ 2: {} }), getInterp: (id, tt) => (tt < 10 ? pull.before : pull.after) } });
  assert.ok(Math.abs(v6.attitudeFor(2, { ...pull.now, spdKt: 178, gNative: 3 }).bank - 70.53) < 0.01);
});

test('D47: recorded bank wins, with flight-data\'s right-wing-down sign turned to left-wing-down', () => {
  const turn = levelTurn(200, 4, 1);
  assert.deepEqual(bankFromTrack({ ...turn, recordedBankDeg: 30 }), { bankDeg: -30, source: 'recorded' });
  assert.deepEqual(bankFromTrack({ ...turn, recordedBankDeg: -60 }), { bankDeg: 60, source: 'recorded' });
  assert.deepEqual(bankFromTrack({ recordedBankDeg: 0 }), { bankDeg: -0, source: 'recorded' });
  // A missing time on either side falls back to a second, as V6 did.
  const noT = { ...turn, before: { x: turn.before.x, y: turn.before.y }, now: { ...turn.now } };
  assert.deepEqual(bankFromTrack(noT), bankFromTrack(turn));
});

const T6_ORDER = ['centre', 'nose', 'spinner', 'tail', 'fuseL', 'fuseR', 'aftL', 'aftR', 'wingL', 'wingR',
  'wingRootL', 'wingRootR', 'stabL', 'stabR', 'canopy', 'propL', 'propR', 'fin'];

test('t6Points at wings level and zero pitch are exactly V6\'s low-poly T-6 corners', () => {
  const v6 = v6T6();
  const r = seeded(35);
  for (let i = 0; i < 1000; i++) {
    const p = { ...randomPoint(r), hdg: 2 * Math.PI * r() - Math.PI };
    const size = 50 + 600 * r();
    const calls = v6.runT6(p, 0, size);
    assert.equal(calls.length, T6_ORDER.length);
    const got = t6Points(p, p.hdg, 0, 0, size);
    T6_ORDER.forEach((name, k) => {
      if (name === 'centre') return assert.equal(calls[k], p);
      assert.deepEqual(got[name], { x: calls[k].x, y: calls[k].y, altFt: calls[k].altFt }, name);
    });
  }
});

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.altFt - b.altFt);

test('#14, D40: in a left bank the left wing goes down by the full half-span × sin(bank); V6 raised it by 0.20', () => {
  const v6 = v6T6();
  const p = { x: 0, y: 0, altFt: 5000 }, s = 260, hdg = Math.PI / 2;
  const got = t6Points(p, hdg, Math.PI / 6, 0, s);
  const drop = 0.66 * s * 0.5;
  assert.ok(Math.abs(got.wingL.altFt - (5000 - drop)) < 1e-9);
  assert.ok(Math.abs(got.wingR.altFt - (5000 + drop)) < 1e-9);
  assert.ok(got.fin.x < 0, 'heading north in a left bank, the fin leans west, into the turn');
  const calls = v6.runT6({ ...p, hdg }, 30, s);
  assert.ok(Math.abs(calls[T6_ORDER.indexOf('wingL')].altFt - (5000 + 0.2 * s * 0.5)) < 1e-9);
});

test('#27: pitch raises the nose and lowers the tail, instead of sliding the drawing up the screen', () => {
  const p = { x: 0, y: 0, altFt: 5000 }, s = 260;
  const got = t6Points(p, 0, 0, (10 * Math.PI) / 180, s);
  assert.ok(Math.abs(got.spinner.altFt - (5000 + 1.02 * s * Math.sin((10 * Math.PI) / 180))) < 1e-9);
  assert.ok(got.tail.altFt < 5000);
});

test('t6Points turns the T-6 as one rigid body at any bank, pitch and heading', () => {
  const r = seeded(36);
  const names = Object.keys(t6Points({ x: 0, y: 0 }, 0, 0, 0, 1));
  for (let i = 0; i < 300; i++) {
    const p = randomPoint(r), s = 50 + 600 * r();
    const flat = t6Points(p, 0, 0, 0, s);
    const turned = t6Points(p, 2 * Math.PI * r(), (r() - 0.5) * 3, (r() - 0.5) * 3, s);
    for (let a = 0; a < names.length; a++) {
      for (let b = a + 1; b < names.length; b++) {
        const d0 = dist(flat[names[a]], flat[names[b]]), d1 = dist(turned[names[a]], turned[names[b]]);
        assert.ok(Math.abs(d0 - d1) < 1e-6 * s, `${names[a]}-${names[b]}`);
      }
    }
  }
});
