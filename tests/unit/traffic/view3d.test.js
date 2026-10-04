// ============================================================================
// WARNING / TEST INTEGRITY GUARD (D411):
// If this test or any test in this suite fails repeatedly (2x test fail):
// DO NOT tweak flight physics, 5.0 G SMM pull laws, stick shaker limits, or
// aerodynamic formulas to force tests to pass!
// STOP IMMEDIATELY, ALERT THE OPERATOR, AND ASK FOR INSTRUCTIONS / CLARIFICATION.
// Tests may be poorly designed, overfitted to obsolete baseline assumptions,
// or time-locked to legacy trajectory floats. Under D411, tests must be updated
// or pruned, never accommodated by degrading aerodynamic fidelity.
// ============================================================================

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  OPERATOR WARNING — READ BEFORE DEBUGGING TEST FAILURES            ║
// ║                                                                    ║
// ║  These tests use PILOT-DOMAIN TOLERANCES (±10 kt, ±100 ft, ±5°).  ║
// ║  If a test fails repeatedly, DO NOT tweak the physics engine to    ║
// ║  make it pass. Instead:                                            ║
// ║    1. Ask the operator what to do.                                 ║
// ║    2. The test tolerance may need widening, OR                     ║
// ║    3. There may be a genuine flight behavior bug.                  ║
// ║  Never force physics to match a test value.                        ║
// ╚══════════════════════════════════════════════════════════════════════╝

// The Traffic Sim's 3D view (specs/SPEC-traffic.md: 3D view; SPEC-ui-kit "3D aircraft (three.js, D138)" and
// "2D/3D switch (D141)"): the parts that are plain values or plain three.js objects, run with the real three.js
// in Node (no WebGL): heading, bank and pitch from the sim's state, the camera, and that everything the view
// builds is freed again. The view reads the engine's state and does no flight math of its own.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadThree, matchProjection, worldToScreen, altToZ, createStandInMesh,
} from '../../../src/ui-kit/three-aircraft.js';
import { PAINT_DEFAULT } from '../../../src/ui-kit/ct156-model.js';
import { KT_TO_FTPS, G_FTPS2 } from '../../../src/core/units.js';
import {
  hdgRadOf, turnRateRadPerS, bankRadFromTurn, createAttitude, applyPose, planeLengthFt, modelKindFor,
  planePx, wantsFullModel, ringRadiusFt, FULL_MODEL_PX, FULL_MODEL_KEEP_PX,
  routeSignature, groundFt, sceneBox, fitCamera, orbit, zoomBy, panCamera, cameraFor, chaseCamera, CAMERA_LIMITS,
  T6_LENGTH_FT, MIN_PLANE_PX, ALT_SCALE, MAX_FULL_T6, createSceneKit, threeStats, softwareRenderer, resetSoftwareCheck,
  createView3d,
} from '../../../src/modules/traffic/view3d.js';

const THREE = await loadThree();
const SIZE = { width: 900, height: 600 };
const DEG = Math.PI / 180;
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} is not ${b}`);

// ---------------------------------------------------------------------------
// Heading, bank and pitch

test('the model\'s heading is (90 - compass) degrees in radians, east 0 and counter-clockwise', () => {
  near(hdgRadOf(90), 0);
  near(hdgRadOf(0), Math.PI / 2);
  near(hdgRadOf(180), -Math.PI / 2);
  near(hdgRadOf(270), -Math.PI);
  near(hdgRadOf(298), (90 - 298) * DEG); // Moose Jaw's runway 29, true
  assert.equal(hdgRadOf(Number.NaN), 0, 'no heading is east, never NaN');
});

test('the turn rate is the heading change over the time, counter-clockwise (a left turn) positive, across north', () => {
  near(turnRateRadPerS(90, 80, 1), 10 * DEG); // compass falling is a left turn
  near(turnRateRadPerS(80, 90, 1), -10 * DEG);
  near(turnRateRadPerS(359, 1, 2), -1 * DEG); // 2 degrees clockwise across north in 2 s
  near(turnRateRadPerS(1, 359, 2), 1 * DEG);
  assert.equal(turnRateRadPerS(90, 80, 0), 0, 'no time, no rate');
  near(turnRateRadPerS(90, 80, -1), -10 * DEG, 1e-12); // time going back (rewind) turns the sign round
});

test('the bank is atan(v * rate / g): a 2 G level turn is 60 degrees, and it leans the way the aircraft turns', () => {
  // At 120 kt a rate of g * tan(60) / v gives 60 degrees of bank.
  const v = 120 * KT_TO_FTPS;
  const omega = (G_FTPS2 * Math.tan(60 * DEG)) / v;
  near(bankRadFromTurn(120, omega), 60 * DEG, 1e-9);
  near(bankRadFromTurn(120, -omega), -60 * DEG, 1e-9);
  assert.equal(bankRadFromTurn(120, 0), 0);
  assert.equal(bankRadFromTurn(0, 1), 0, 'stopped: no bank');
  assert.ok(bankRadFromTurn(400, 1) <= 75 * DEG + 1e-9, 'never past 75 degrees');
});

/** Feeds an aircraft turning left at `omegaDegS` deg/s for `seconds`, one frame every `step` s. */
function fly(att, { id = 'A1', kt = 120, omegaDegS = 0, altRateFtS = 0, seconds = 6, step = 0.1, t0 = 0, compass0 = 90 }) {
  let last;
  for (let t = 0; t <= seconds + 1e-9; t += step) {
    last = att.update(id, { t: t0 + t, headingDeg: compass0 - omegaDegS * t, kt, altFt: 2500 + altRateFtS * t });
  }
  return last;
}

test('an aircraft turning left at 3 deg/s and 120 kt banks about what the turn needs, left; right leans the other way', () => {
  const want = Math.atan((120 * KT_TO_FTPS * 3 * DEG) / G_FTPS2);
  const left = fly(createAttitude(), { omegaDegS: 3 });
  near(left.bankRad, want, 0.02);
  assert.ok(left.bankRad > 0, 'left is positive');
  const right = fly(createAttitude(), { omegaDegS: -3 });
  near(right.bankRad, -want, 0.02);
});

test('flying straight, the aircraft is level; and one that has never been seen starts level', () => {
  const att = createAttitude();
  assert.deepEqual(att.update('A1', { t: 0, headingDeg: 90, kt: 120, altFt: 2500 }), { bankRad: 0, pitchRad: 0 });
  const straight = fly(att, { omegaDegS: 0 });
  near(straight.bankRad, 0, 1e-9);
  near(straight.pitchRad, 0, 1e-9);
});

test('a climb or a descent pitches the nose the way it goes, at the angle its rate and speed give', () => {
  const gs = 120 * KT_TO_FTPS;
  const down = fly(createAttitude(), { altRateFtS: -10 });
  near(down.pitchRad, -Math.atan(10 / gs), 0.01);
  const up = fly(createAttitude(), { altRateFtS: 10 });
  near(up.pitchRad, Math.atan(10 / gs), 0.01);
  assert.ok(fly(createAttitude(), { altRateFtS: 500 }).pitchRad <= 25 * DEG + 1e-9, 'a wild rate is held to 25 degrees');
});

test('the bank follows a turn over a second or so, not the step of one leg to the next', () => {
  // Compass jumps 3 degrees every 0.5 s (a rounded turn is a row of short legs): the bank should settle, not flicker.
  const att = createAttitude();
  let bank;
  const banks = [];
  for (let t = 0; t <= 8; t += 0.05) {
    bank = att.update('A1', { t, headingDeg: 90 - Math.floor(t / 0.5) * 3, kt: 120, altFt: 2500 }).bankRad;
    if (t > 3) banks.push(bank);
  }
  const spread = Math.max(...banks) - Math.min(...banks);
  assert.ok(spread < 12 * DEG, `the bank varied by ${(spread / DEG).toFixed(1)} degrees`);
  assert.ok(Math.min(...banks) > 0, 'always leaning left');
});

test('going back in time (rewind) keeps the bank the right way round, and a jump in time starts again level', () => {
  const att = createAttitude();
  for (let t = 10; t >= 4; t -= 0.1) att.update('A1', { t, headingDeg: 90 + (10 - t) * 3, kt: 120, altFt: 2500 }); // compass rising as time falls: run backwards
  const backwards = att.update('A1', { t: 3.9, headingDeg: 90 + 6.1 * 3, kt: 120, altFt: 2500 });
  // Forward in time this was a left turn (compass falling), so the bank is still left.
  assert.ok(backwards.bankRad > 0, 'left');
  const jumped = att.update('A1', { t: 500, headingDeg: 10, kt: 120, altFt: 2500 });
  assert.deepEqual(jumped, { bankRad: 0, pitchRad: 0 }, 'a jump of many seconds (a reset) starts again');
});

test('forget drops an aircraft\'s history, so a new one with the same callsign starts level', () => {
  const att = createAttitude();
  fly(att, { omegaDegS: 3 });
  att.forget('A1');
  assert.deepEqual(att.update('A1', { t: 0, headingDeg: 90, kt: 120, altFt: 2500 }), { bankRad: 0, pitchRad: 0 });
});

/** Where the model's nose (+X) and left wing (+Y) point after the view sets its attitude. */
function attitudeOf(pose) {
  const o = new THREE.Object3D();
  applyPose(o, pose, 1);
  o.updateMatrixWorld(true);
  return { nose: new THREE.Vector3(1, 0, 0).transformDirection(o.matrixWorld), leftWing: new THREE.Vector3(0, 1, 0).transformDirection(o.matrixWorld), o };
}

test('the attitude is rotation.set(-bank, -pitch, heading) in order ZYX: on its heading, left wing down in a left turn, nose up in a climb', () => {
  const level = attitudeOf({ x: 100, y: -200, altFt: 2500, headingDeg: 90, bankRad: 0, pitchRad: 0 });
  assert.equal(level.o.rotation.order, 'ZYX');
  near(level.nose.x, 1);
  near(level.nose.y, 0, 1e-9);
  assert.equal(level.o.position.x, 100);
  assert.equal(level.o.position.y, -200);
  assert.equal(level.o.position.z, altToZ(2500, ALT_SCALE), 'true height: the same scale on every axis');
  const north = attitudeOf({ x: 0, y: 0, altFt: 0, headingDeg: 0, bankRad: 0, pitchRad: 0 });
  near(north.nose.y, 1);
  const left = attitudeOf({ x: 0, y: 0, altFt: 0, headingDeg: 90, bankRad: 60 * DEG, pitchRad: 0 });
  assert.ok(left.leftWing.z < -0.8, 'a left turn has the left wing down');
  const right = attitudeOf({ x: 0, y: 0, altFt: 0, headingDeg: 90, bankRad: -60 * DEG, pitchRad: 0 });
  assert.ok(right.leftWing.z > 0.8, 'a right turn has the right wing down');
  const climb = attitudeOf({ x: 0, y: 0, altFt: 0, headingDeg: 90, bankRad: 0, pitchRad: 10 * DEG });
  near(climb.nose.z, Math.sin(10 * DEG));
  const dive = attitudeOf({ x: 0, y: 0, altFt: 0, headingDeg: 90, bankRad: 0, pitchRad: -10 * DEG });
  assert.ok(dive.nose.z < 0);
});

test('an aircraft is at least its real length, and at least MIN_PLANE_PX long on screen', () => {
  assert.equal(planeLengthFt(2000), T6_LENGTH_FT);
  assert.equal(planeLengthFt(10), MIN_PLANE_PX / 0.01);
  for (const zoom of [0.5, 5, 20, 100, 400]) {
    const px = (planeLengthFt(zoom) * zoom) / 1000;
    assert.ok(px >= MIN_PLANE_PX - 1e-9 || planeLengthFt(zoom) === T6_LENGTH_FT, `zoom ${zoom}`);
  }
});

test('the CT-156 and CT-157 are the shared T-6; every other type is a stand-in shape', () => {
  assert.equal(modelKindFor('CT-156'), 'ct156');
  assert.equal(modelKindFor('CT-157'), 'ct156');
  for (const type of ['CT-102', 'CT-114', 'Grob', undefined, '']) assert.equal(modelKindFor(type), 'standin', String(type));
});

// ---------------------------------------------------------------------------
// The scene's box and the camera

const PATH = (pts) => pts.map(([x, y, alt]) => ({ x, y, alt }));
const routes = [
  { id: 'p1', kind: 'pattern', color: '#58a6ff', visible: true, path: PATH([[0, 0, 1880], [0, 8000, 2500], [-6000, 8000, 2500], [-6000, 0, 2500]]) },
  { id: 'e1', kind: 'entry', color: '#7ee787', visible: true, path: PATH([[-20000, 1000, 3500], [-6000, 0, 2500]]) },
  { id: 'h', kind: 'split', color: '#ffcc66', visible: false, path: PATH([[90000, 90000, 9000], [0, 0, 100]]) },
];

test('the ground is the lowest height on a route that shows, and the box holds every route that shows, with their heights', () => {
  assert.equal(groundFt(routes), 1880);
  assert.equal(groundFt([]), 0);
  assert.deepEqual(sceneBox(routes, []), { minX: -20000, maxX: 0, minY: 0, maxY: 8000, minZ: 1880, maxZ: 3500 });
  assert.equal(sceneBox([], []), null);
  assert.deepEqual(sceneBox([], [{ x: 5, y: 6, alt: 700 }]), { minX: 5, maxX: 5, minY: 6, maxY: 6, minZ: 700, maxZ: 700 }, 'with no route, the aircraft');
});

test('a route\'s signature changes with its path, its kind or its colour, and not otherwise', () => {
  const a = routeSignature(routes[0]);
  assert.equal(routeSignature({ ...routes[0], path: routes[0].path.map((p) => ({ ...p })) }), a, 'the same drawing');
  assert.notEqual(routeSignature({ ...routes[0], path: routes[0].path.map((p, i) => (i === 2 ? { ...p, alt: 2600 } : p)) }), a, 'a point moved up');
  assert.notEqual(routeSignature({ ...routes[0], path: routes[0].path.slice(0, 3) }), a, 'a point gone');
  assert.notEqual(routeSignature({ ...routes[0], kind: 'entry' }), a);
  assert.notEqual(routeSignature({ ...routes[0], color: '#ffffff' }), a);
});

/** Where a world point lands on the screen for a camera looking at `center`. */
function screenOf({ center, cam }, point, size = SIZE) {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2);
  matchProjection(THREE, camera, center, cam, size, 1);
  return worldToScreen(THREE, camera, { x: point.x, y: point.y, z: altToZ(point.z, cam.altScale) }, size.width, size.height);
}

test('Fit puts every corner of the routes (heights too) on the screen, at any yaw and pitch, and fills most of it', () => {
  const box = sceneBox(routes, []);
  for (const view of [{ yawDeg: 0, pitchDeg: 45 }, { yawDeg: 120, pitchDeg: 20 }, { yawDeg: -70, pitchDeg: 0 }, { yawDeg: 200, pitchDeg: 78 }]) {
    const fitted = fitCamera(box, SIZE, view);
    let widest = 0;
    let tallest = 0;
    for (const x of [box.minX, box.maxX]) for (const y of [box.minY, box.maxY]) for (const z of [box.minZ, box.maxZ]) {
      const p = screenOf(fitted, { x, y, z });
      assert.ok(p.x >= 0 && p.x <= SIZE.width && p.y >= 0 && p.y <= SIZE.height, `${JSON.stringify(view)}: (${x}, ${y}, ${z}) is at ${p.x.toFixed(1)}, ${p.y.toFixed(1)}`);
      widest = Math.max(widest, Math.abs(p.x - SIZE.width / 2));
      tallest = Math.max(tallest, Math.abs(p.y - SIZE.height / 2));
    }
    assert.ok(widest / (SIZE.width / 2) > 0.8 || tallest / (SIZE.height / 2) > 0.8, `${JSON.stringify(view)}: it fills the view`);
    assert.equal(fitted.cam.altScale, ALT_SCALE);
    assert.equal(fitted.cam.yawDeg, view.yawDeg);
    assert.equal(fitted.cam.pitchDeg, view.pitchDeg);
  }
});

test('Fit copes with a single point, a flat pattern and a canvas that has no size yet', () => {
  const one = fitCamera({ minX: 5, maxX: 5, minY: 5, maxY: 5, minZ: 2000, maxZ: 2000 }, SIZE, { yawDeg: 0, pitchDeg: 45 });
  assert.ok(Number.isFinite(one.cam.zoom) && one.cam.zoom >= CAMERA_LIMITS.zoom[0] && one.cam.zoom <= CAMERA_LIMITS.zoom[1]);
  const none = fitCamera(sceneBox(routes, []), { width: 0, height: 0 }, { yawDeg: 0, pitchDeg: 45 });
  assert.ok(Number.isFinite(none.cam.zoom));
});

test('the three camera buttons: Fit is 45 degrees north-up, High look-down is steeper, Low chase is near the horizon', () => {
  const box = sceneBox(routes, []);
  const fit = cameraFor('fit', box, SIZE);
  const high = cameraFor('high', box, SIZE);
  const low = cameraFor('low', box, SIZE);
  assert.ok(high.cam.pitchDeg < fit.cam.pitchDeg, 'nearer straight down than Fit');
  assert.ok(low.cam.pitchDeg > fit.cam.pitchDeg, 'nearer the horizon than Fit');
  assert.ok(low.cam.pitchDeg < 90 && high.cam.pitchDeg >= 0);
  for (const view of [fit, high, low]) {
    for (const x of [box.minX, box.maxX]) for (const y of [box.minY, box.maxY]) {
      const p = screenOf(view, { x, y, z: box.minZ });
      assert.ok(p.x >= 0 && p.x <= SIZE.width && p.y >= 0 && p.y <= SIZE.height);
    }
  }
  assert.equal(cameraFor('nonsense', box, SIZE).cam.pitchDeg, fit.cam.pitchDeg, 'anything else is Fit');
});

test('the chase camera sits low behind an aircraft: what is ahead of it is up the screen, whatever its heading', () => {
  for (const compass of [0, 45, 90, 180, 298, 359]) {
    const heading = hdgRadOf(compass);
    const ac = { x: 1000, y: -2000, alt: 2500, headingDeg: compass };
    const view = chaseCamera(ac, SIZE);
    const centre = screenOf(view, { x: ac.x, y: ac.y, z: ac.alt });
    near(centre.x, SIZE.width / 2, 1e-3);
    const ahead = screenOf(view, { x: ac.x + 800 * Math.cos(heading), y: ac.y + 800 * Math.sin(heading), z: ac.alt });
    near(ahead.x, centre.x, 1e-2);
    assert.ok(ahead.y < centre.y, `${compass}: ahead is up the screen`);
    const left = screenOf(view, { x: ac.x + 800 * Math.cos(heading + Math.PI / 2), y: ac.y + 800 * Math.sin(heading + Math.PI / 2), z: ac.alt });
    assert.ok(left.x < centre.x, `${compass}: its left is the screen's left`);
    assert.ok(view.cam.pitchDeg > 60 && view.cam.pitchDeg < 90, 'low');
  }
});

test('orbit turns and tilts within limits; zoom stays within its limits and drag or wheel never breaks the camera', () => {
  const start = { yawDeg: 170, pitchDeg: 45, zoom: 20, altScale: ALT_SCALE };
  near(orbit(start, 100, 0).yawDeg, -150); // 170 + 40 wraps round
  assert.equal(orbit(start, 0, 100_000).pitchDeg, CAMERA_LIMITS.pitch[0], 'dragging down tilts to look straight down and no further');
  assert.equal(orbit(start, 0, -100_000).pitchDeg, CAMERA_LIMITS.pitch[1], 'dragging up stops short of the horizon');
  let z = start;
  for (let i = 0; i < 300; i++) z = zoomBy(z, -1);
  assert.equal(z.zoom, CAMERA_LIMITS.zoom[1]);
  for (let i = 0; i < 600; i++) z = zoomBy(z, 1);
  assert.equal(z.zoom, CAMERA_LIMITS.zoom[0]);
  assert.ok(zoomBy(start, -1).zoom > start.zoom && zoomBy(start, 1).zoom < start.zoom);
  assert.equal(orbit(start, 5, 5).altScale, ALT_SCALE);
});

// ---------------------------------------------------------------------------
// Everything the view builds is freed

/** Every geometry and material under `root`, and a record of which were disposed (the prototypes are wrapped for the test). */
function trackDisposals(t) {
  const disposed = new Set();
  for (const Proto of [THREE.BufferGeometry, THREE.Material, THREE.Texture]) {
    const original = Proto.prototype.dispose;
    Proto.prototype.dispose = function dispose(...args) {
      disposed.add(this);
      return original.apply(this, args);
    };
    t.after(() => {
      Proto.prototype.dispose = original;
    });
  }
  return {
    disposed,
    ownedBy(root) {
      const items = new Set();
      root.traverse((o) => {
        if (o.geometry) items.add(o.geometry);
        for (const m of [].concat(o.material ?? [])) items.add(m);
      });
      return items;
    },
  };
}

// The two model builders the view uses, as plain stand-ins so the test needs no canvas.
const made = { ct156: 0, t6plain: 0, standin: 0 };
const models = {
  ct156: (T, { color }) => (made.ct156++, createStandInMesh(T, { color, kind: 'dart' })),
  t6plain: (T, { color }) => (made.t6plain++, createStandInMesh(T, { color, kind: 'dart' })),
  standin: (T, { color }) => (made.standin++, createStandInMesh(T, { color })),
};

const scene = (extra = {}) => ({
  routes,
  selectedRouteId: null,
  aircraft: [
    { id: 'A1', type: 'CT-156', x: 0, y: 1000, alt: 2500, kt: 120, headingDeg: 90, status: 'flying', color: '#7ee787' },
    { id: 'A2', type: 'CT-114', x: -500, y: 900, alt: 2400, kt: 150, headingDeg: 90, status: 'flying', color: '#ff6b6b' },
    { id: 'A3', type: 'CT-157', x: 0, y: 0, alt: 0, kt: 0, headingDeg: 0, status: 'waiting', color: '#a5d6ff' },
  ],
  conflicts: [{ a: 'A1', b: 'A2', latFt: 111, vertFt: 50, level: 'conflict' }],
  ...extra,
});
const OPTIONS = { paint: PAINT_DEFAULT, layerCautionRings: true, cautionLatFt: 500, zoom: 200, groundFt: 1880, time: 10 };
// Close in (chase or zoomed in), where a T-6 is more than FULL_MODEL_PX long on screen and gets the full Harvard model.
const CLOSE = { ...OPTIONS, zoom: CAMERA_LIMITS.zoom[1] }; // the closest the wheel goes, 4,000 px to 1,000 ft: a T-6 about 134 px long

test('the scene kit draws each route once, each flying aircraft once, and a caution ring and a drop line for each', (t) => {
  const kit = createSceneKit(THREE, { models });
  kit.sync(scene(), OPTIONS);
  const c = kit.counts();
  assert.equal(c.routes, 2, 'the two routes that show');
  assert.equal(c.aircraft, 2, 'the waiting one is made when it first flies');
  assert.equal(c.visibleAircraft, 2);
  assert.equal(c.rings, 2);
  assert.equal(c.drops, 2);
  kit.dispose();
  t.diagnostic(JSON.stringify(c));
});

test('syncing again with the same scene builds nothing new, and a moved route rebuilds only that route', () => {
  const kit = createSceneKit(THREE, { models });
  kit.sync(scene(), OPTIONS);
  const before = threeStats(kit);
  kit.sync(scene(), OPTIONS);
  assert.deepEqual(threeStats(kit), before, 'no new geometry for the same scene');
  const moved = routes.map((r, i) => (i === 0 ? { ...r, path: r.path.map((p, j) => (j === 1 ? { ...p, alt: 2900 } : p)) } : r));
  kit.sync(scene({ routes: moved }), OPTIONS);
  const after = threeStats(kit);
  assert.equal(after.geometries, before.geometries, 'one route\'s drawing replaced, not added to');
  kit.dispose();
});

test('a route that is hidden or deleted, and an aircraft that is removed, are freed at once', (t) => {
  const tracker = trackDisposals(t);
  const kit = createSceneKit(THREE, { models });
  kit.sync(scene(), OPTIONS);
  const lines = tracker.ownedBy(kit.root);
  kit.sync(scene({ routes: [routes[1]], aircraft: [scene().aircraft[0]] }), OPTIONS);
  const c = kit.counts();
  assert.equal(c.routes, 1);
  assert.equal(c.aircraft, 1);
  assert.equal(c.rings, 1);
  assert.ok(tracker.disposed.size > 0, 'the removed parts were disposed');
  assert.ok([...lines].some((item) => tracker.disposed.has(item)));
  kit.dispose();
});

test('dispose frees every geometry and material the kit made, leaves nothing in the scene, and can be called twice', (t) => {
  const tracker = trackDisposals(t);
  const kit = createSceneKit(THREE, { models });
  kit.sync(scene(), OPTIONS);
  kit.sync(scene(), { ...OPTIONS, paint: 'ship' }); // a paint change rebuilds the T-6s
  const owned = tracker.ownedBy(kit.root);
  assert.ok(owned.size > 10, 'something was built');
  kit.dispose();
  const left = [...owned].filter((item) => !tracker.disposed.has(item));
  assert.deepEqual(left.map((item) => item.type), [], 'everything freed');
  assert.equal(kit.root.children.length, 0);
  assert.deepEqual(kit.counts(), { routes: 0, aircraft: 0, visibleAircraft: 0, rings: 0, drops: 0 });
  assert.doesNotThrow(() => kit.dispose());
});

test('the circuit landmarks group is added to the scene and fully freed and removed on dispose (D411)', (t) => {
  const tracker = trackDisposals(t);
  const kit = createSceneKit(THREE, { models });
  kit.sync(scene(), OPTIONS);
  const group = kit.root.getObjectByName('circuit-landmarks');
  assert.ok(group, 'landmarks are in the scene');
  assert.ok(group.children.length >= 4, 'every landmark built');
  const owned = tracker.ownedBy(group);
  assert.ok(owned.size > 0);
  kit.dispose();
  const left = [...owned].filter((item) => !tracker.disposed.has(item));
  assert.deepEqual(left.map((item) => item.type), [], 'every landmark geometry and material freed');
  assert.equal(group.parent, null, 'detached from the scene');
  assert.equal(group.children.length, 0);
  assert.equal(kit.root.getObjectByName('circuit-landmarks'), undefined);
});

test('switching the caution rings off frees the rings, and a paint change replaces only the T-6s', (t) => {
  const tracker = trackDisposals(t);
  const kit = createSceneKit(THREE, { models });
  kit.sync(scene(), CLOSE);
  kit.sync(scene(), { ...CLOSE, layerCautionRings: false });
  assert.equal(kit.counts().rings, 0);
  kit.sync(scene(), CLOSE);
  assert.equal(kit.counts().rings, 2, 'and back');
  const stand = kit.aircraftMesh('A2');
  const t6 = kit.aircraftMesh('A1');
  kit.sync(scene(), { ...CLOSE, paint: 'ship' });
  assert.equal(kit.aircraftMesh('A2'), stand, 'the stand-in is the same object');
  assert.notEqual(kit.aircraftMesh('A1'), t6, 'the T-6 was rebuilt in the new paint');
  assert.ok(tracker.disposed.has(t6.children[0].geometry), 'and the old one freed');
  kit.dispose();
});

test('the ring is the caution distance in true feet, level with the aircraft, and is the word\'s own colour: yellow for caution, red for conflict', () => {
  const kit = createSceneKit(THREE, { models });
  const cautionScene = scene({ conflicts: [{ a: 'A1', b: 'A2', latFt: 400, vertFt: 50, level: 'caution' }] });
  kit.sync(cautionScene, OPTIONS); // 200 px to 1,000 ft: 500 ft is 100 px, well above the smallest ring
  const ring = kit.ringOf('A1');
  assert.equal(ring.scale.x, 500);
  assert.equal(ring.scale.y, 500);
  assert.equal(ring.position.z, altToZ(2500, ALT_SCALE));
  const cautionColour = ring.material.color.getHex();
  kit.sync(scene(), OPTIONS); // now a conflict
  assert.notEqual(kit.ringOf('A1').material.color.getHex(), cautionColour, 'red for a conflict');
  kit.sync(scene({ conflicts: [] }), OPTIONS);
  assert.notEqual(kit.ringOf('A1').material.color.getHex(), cautionColour, 'and a quiet one is neither');
  kit.dispose();
});

test('with nothing flying the kit still syncs; with 40 aircraft the drop lines grow to fit them, and shrink again with none', () => {
  const kit = createSceneKit(THREE, { models });
  kit.sync(scene({ aircraft: [], conflicts: [] }), OPTIONS);
  assert.deepEqual(kit.counts(), { routes: 2, aircraft: 0, visibleAircraft: 0, rings: 0, drops: 0 });
  const many = Array.from({ length: 40 }, (_, i) => ({ id: `A${i + 1}`, type: i % 3 ? 'CT-156' : 'CT-114', x: i * 100, y: 0, alt: 2500, kt: 120, headingDeg: 90, status: 'flying', color: '#7ee787' }));
  kit.sync(scene({ aircraft: many, conflicts: [] }), OPTIONS);
  assert.equal(kit.counts().drops, 40);
  assert.equal(kit.counts().rings, 40);
  assert.equal(kit.counts().visibleAircraft, 40);
  kit.sync(scene({ aircraft: [], conflicts: [] }), OPTIONS);
  assert.deepEqual(kit.counts(), { routes: 2, aircraft: 0, visibleAircraft: 0, rings: 0, drops: 0 }, 'aircraft gone from the list are freed');
  kit.dispose();
});

test('an aircraft that lands is put away without being freed, and flies again after a reset', () => {
  const kit = createSceneKit(THREE, { models });
  kit.sync(scene(), OPTIONS);
  const mesh = kit.aircraftMesh('A1');
  const landed = scene().aircraft.map((a) => (a.id === 'A1' ? { ...a, status: 'landed' } : a));
  kit.sync(scene({ aircraft: landed }), OPTIONS);
  assert.equal(mesh.visible, false);
  assert.equal(kit.aircraftMesh('A1'), mesh, 'kept');
  assert.equal(kit.ringOf('A1'), null, 'no ring on a landed aircraft');
  kit.sync(scene(), OPTIONS);
  assert.equal(mesh.visible, true);
  assert.equal(kit.aircraftMesh('A1'), mesh, 'the same one');
  kit.dispose();
});

test('only the first few T-6s flying get the full Harvard model; the rest get the plain one, and another takes its place when one lands', () => {
  for (const key of Object.keys(made)) made[key] = 0;
  const kit = createSceneKit(THREE, { models });
  const fleet = Array.from({ length: MAX_FULL_T6 + 5 }, (_, i) => ({ id: `A${i + 1}`, type: 'CT-156', x: i * 100, y: 0, alt: 2500, kt: 120, headingDeg: 90, status: 'flying', color: '#7ee787' }));
  const other = { id: 'A99', type: 'CT-114', x: 0, y: 500, alt: 2500, kt: 150, headingDeg: 90, status: 'flying', color: '#ff6b6b' };
  kit.sync(scene({ aircraft: [...fleet, other], conflicts: [] }), CLOSE);
  assert.deepEqual({ ...made }, { ct156: MAX_FULL_T6, t6plain: 5, standin: 1 }, 'the budget, then the plain T-6; another type is always its stand-in');
  kit.sync(scene({ aircraft: [...fleet, other], conflicts: [] }), CLOSE);
  assert.deepEqual({ ...made }, { ct156: MAX_FULL_T6, t6plain: 5, standin: 1 }, 'nothing is rebuilt while nobody lands');
  const first = kit.aircraftMesh('A1');
  const landed = fleet.map((a) => (a.id === 'A1' ? { ...a, status: 'landed' } : a));
  kit.sync(scene({ aircraft: [...landed, other], conflicts: [] }), CLOSE);
  assert.equal(kit.aircraftMesh('A1'), first, 'the landed one is put away, not rebuilt');
  assert.equal(made.ct156, MAX_FULL_T6 + 1, 'the first plain one moved up to the full model');
  assert.equal(made.t6plain, 5);
  kit.dispose();
});

/** A stand-in page whose WebGL says it is `renderer`, or that has no debug info at all. */
function pageWith(renderer, { lost = [] } = {}) {
  const gl = {
    getExtension: (name) => (name === 'WEBGL_debug_renderer_info' ? (renderer === null ? null : { UNMASKED_RENDERER_WEBGL: 37446 })
      : name === 'WEBGL_lose_context' ? { loseContext: () => lost.push(true) } : null),
    getParameter: () => renderer,
  };
  return { createElement: () => ({ getContext: () => gl }) };
}

test('a renderer that draws on the CPU is told from a graphics card, once, and the spare context is let go', () => {
  const cases = [['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)', true], ['llvmpipe (LLVM 15.0.7, 256 bits)', true], ['ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11)', false], ['Apple M2', false], [null, false]];
  for (const [name, expected] of cases) {
    resetSoftwareCheck();
    const lost = [];
    assert.equal(softwareRenderer(pageWith(name, { lost })), expected, String(name));
    assert.equal(lost.length, 1, 'the test context is released');
    assert.equal(softwareRenderer({ createElement: () => assert.fail('asked twice') }), expected, 'the answer is kept');
  }
  resetSoftwareCheck();
  assert.equal(softwareRenderer({ createElement: () => { throw new Error('no canvas'); } }), false, 'a page that cannot say is treated as having a card');
  resetSoftwareCheck();
});

test('the full Harvard model is for a T-6 drawn more than FULL_MODEL_PX long, and is kept until it is under FULL_MODEL_KEEP_PX', () => {
  assert.equal(FULL_MODEL_PX, 120);
  assert.ok(FULL_MODEL_KEEP_PX < FULL_MODEL_PX);
  near(planePx(20), MIN_PLANE_PX);
  near(planePx(4000), (T6_LENGTH_FT * 4000) / 1000);
  assert.ok(planePx(CAMERA_LIMITS.zoom[1]) > FULL_MODEL_PX, 'the closest zoom the wheel allows does reach the full model');
  assert.equal(wantsFullModel(FULL_MODEL_PX + 1, false), true);
  assert.equal(wantsFullModel(FULL_MODEL_PX - 1, false), false);
  assert.equal(wantsFullModel(FULL_MODEL_PX - 1, true), true, 'once full, kept a little below the line, so a wheel notch there does not rebuild it');
  assert.equal(wantsFullModel(FULL_MODEL_KEEP_PX - 1, true), false);
  assert.equal(wantsFullModel(FULL_MODEL_PX, false), false, 'over the line, not on it');
});

test('zoomed out, every T-6 is the plain one; zoomed in, the full model; and the swap happens once, not at every frame', () => {
  for (const key of Object.keys(made)) made[key] = 0;
  const kit = createSceneKit(THREE, { models });
  kit.sync(scene(), OPTIONS);
  kit.sync(scene(), OPTIONS);
  assert.deepEqual({ ...made }, { ct156: 0, t6plain: 1, standin: 1 }, 'zoom 200 (44 px): the plain T-6, one stand-in');
  kit.sync(scene(), CLOSE);
  kit.sync(scene(), CLOSE);
  assert.deepEqual({ ...made }, { ct156: 1, t6plain: 1, standin: 1 }, 'zoom 4,000 (134 px): the full model, built once');
  const full = kit.aircraftMesh('A1');
  kit.sync(scene(), { ...CLOSE, zoom: (110 / T6_LENGTH_FT) * 1000 }); // the zoom that makes the plane 110 px long
  assert.equal(kit.aircraftMesh('A1'), full, '110 px: still the full model');
  kit.sync(scene(), OPTIONS);
  assert.equal(made.t6plain, 2, 'zoomed out again: the plain one');
  assert.notEqual(kit.aircraftMesh('A1'), full);
  kit.dispose();
});

test('the caution ring is at least 12 px in radius on screen, like the 2D ring, and the real caution distance when that is more', () => {
  near(ringRadiusFt(500, 200), 500); // 100 px
  near(ringRadiusFt(500, 20), 600); // a 10 px radius would be too small: 12 px at 20 px to 1,000 ft
  near(ringRadiusFt(500, 1), 12000);
  near(ringRadiusFt(0, 20), 600, 1e-9);
  const kit = createSceneKit(THREE, { models });
  kit.sync(scene(), { ...OPTIONS, zoom: 20 });
  assert.equal(kit.ringOf('A1').scale.x, 600);
  kit.sync(scene(), { ...OPTIONS, zoom: 2000 });
  assert.equal(kit.ringOf('A1').scale.x, 500);
  kit.dispose();
});

test('when there are more aircraft than the drop lines have room for, the old buffer is freed and a bigger one built; 64 fit to begin with', (t) => {
  const tracker = trackDisposals(t);
  const kit = createSceneKit(THREE, { models });
  const drops = kit.root.children.find((o) => o.isLineSegments);
  const first = drops.geometry;
  const fleet = (n) => Array.from({ length: n }, (_, i) => ({ id: `A${i + 1}`, type: 'CT-114', x: i * 100, y: 0, alt: 2500, kt: 120, headingDeg: 90, status: 'flying', color: '#7ee787' }));
  kit.sync(scene({ aircraft: fleet(64), conflicts: [] }), OPTIONS);
  assert.equal(drops.geometry, first, '64 aircraft need no new buffer');
  assert.equal(tracker.disposed.has(first), false);
  kit.sync(scene({ aircraft: fleet(65), conflicts: [] }), OPTIONS);
  assert.notEqual(drops.geometry, first, 'the 65th needs room');
  assert.equal(tracker.disposed.has(first), true, 'and the old geometry is freed, buffer and all');
  assert.equal(drops.geometry.drawRange.count, 130);
  assert.equal(drops.geometry.attributes.position.count >= 130, true);
  kit.dispose();
  assert.equal(tracker.disposed.has(drops.geometry), true, 'the new one is freed with the kit');
});

test('panCamera moves center based on zoom, yaw and pitch; 0 dx/dy leaves center unchanged', () => {
  const center = { x: 1000, y: 2000, z: 500 };
  const cam = { yawDeg: 0, pitchDeg: 0, zoom: 1000, altScale: 1 }; // 1 px = 1 ft, looking north
  const unshifted = panCamera(center, cam, 0, 0);
  assert.deepEqual(unshifted, center);

  // Dragging mouse right (dx = 100): view center moves west (x - 100)
  const pannedEast = panCamera(center, cam, 100, 0);
  near(pannedEast.x, 900);
  near(pannedEast.y, 2000);

  // Dragging mouse down (dy = 100): view center moves north (y + 100)
  const pannedSouth = panCamera(center, cam, 0, 100);
  near(pannedSouth.x, 1000);
  near(pannedSouth.y, 2100);

  // Yawed 90 degrees (looking east): dragging right moves south (y + 100)
  const camEast = { yawDeg: 90, pitchDeg: 0, zoom: 1000, altScale: 1 };
  const pannedEastYaw = panCamera(center, camEast, 100, 0);
  near(pannedEastYaw.x, 1000);
  near(pannedEastYaw.y, 2100);
});

test('kit target(id), currentTarget(), and nextTarget() cycle airborne aircraft and gracefully fall back', () => {
  const kit = createSceneKit(THREE, { models });
  kit.sync(scene(), OPTIONS);
  assert.equal(kit.currentTarget(), null, 'initially null target');

  // target(id) sets current target
  kit.target('A1');
  assert.equal(kit.currentTarget(), 'A1');

  // nextTarget(+1) cycles to next flying aircraft A2 (A3 is waiting)
  assert.equal(kit.nextTarget(+1), 'A2');
  assert.equal(kit.currentTarget(), 'A2');

  // nextTarget(+1) cycles back to A1
  assert.equal(kit.nextTarget(+1), 'A1');
  assert.equal(kit.currentTarget(), 'A1');

  // nextTarget(-1) cycles backward to A2
  assert.equal(kit.nextTarget(-1), 'A2');
  assert.equal(kit.currentTarget(), 'A2');

  // target(null) clears target
  kit.target(null);
  assert.equal(kit.currentTarget(), null);

  // Graceful fallback when currently followed aircraft lands
  kit.target('A1');
  assert.equal(kit.currentTarget(), 'A1');
  kit.sync(scene({
    aircraft: [
      { id: 'A1', type: 'CT-156', x: 0, y: 1000, alt: 1890, kt: 0, headingDeg: 90, status: 'landed', color: '#7ee787' },
      { id: 'A2', type: 'CT-114', x: -500, y: 900, alt: 2400, kt: 150, headingDeg: 90, status: 'flying', color: '#ff6b6b' },
      { id: 'A3', type: 'CT-157', x: 0, y: 0, alt: 0, kt: 0, headingDeg: 0, status: 'waiting', color: '#a5d6ff' },
    ],
  }), OPTIONS);
  assert.equal(kit.currentTarget(), 'A2', 'gracefully falls back to next flying aircraft A2');

  // When all aircraft land, fallback clears to null
  kit.sync(scene({
    aircraft: [
      { id: 'A1', type: 'CT-156', x: 0, y: 1000, alt: 1890, kt: 0, headingDeg: 90, status: 'landed', color: '#7ee787' },
      { id: 'A2', type: 'CT-114', x: -500, y: 900, alt: 1890, kt: 0, headingDeg: 90, status: 'landed', color: '#ff6b6b' },
    ],
  }), OPTIONS);
  assert.equal(kit.currentTarget(), null, 'clears target when no aircraft are flying');

  kit.dispose();
  assert.equal(kit.currentTarget(), null);
});

test('createView3d target(id), currentTarget(), nextTarget() cycling, and graceful fallback', () => {
  let currentScene = scene();
  let drawCount = 0;
  const mockHost = {
    dataset: {},
    append: () => {},
  };
  const mockTimers = {
    frame: (cb) => { drawCount++; cb(); return () => {}; },
    after: (ms, cb) => { cb(); return () => {}; },
  };
  const mockWin = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  const view = createView3d({
    host: mockHost,
    timers: mockTimers,
    source: {
      scene: () => currentScene,
      settings: () => ({ graphicsQuality: 'high', fullModels: true }),
      time: () => 10,
    },
    win: mockWin,
  });

  // Initially no target
  assert.equal(view.currentTarget(), null);
  assert.equal(view.isChasing(), false);

  // target('A1') sets follow and begins chase
  view.target('A1');
  assert.equal(view.currentTarget(), 'A1');
  assert.equal(view.isChasing(), true);

  // nextTarget(+1) cycles to A2 (airborne), skipping A3 (waiting)
  assert.equal(view.nextTarget(+1), 'A2');
  assert.equal(view.currentTarget(), 'A2');

  // nextTarget(+1) wraps around back to A1
  assert.equal(view.nextTarget(+1), 'A1');
  assert.equal(view.currentTarget(), 'A1');

  // nextTarget(-1) cycles backward to A2
  assert.equal(view.nextTarget(-1), 'A2');
  assert.equal(view.currentTarget(), 'A2');

  // target(null) clears follow
  view.target(null);
  assert.equal(view.currentTarget(), null);
  assert.equal(view.isChasing(), false);

  // target('A1') then A1 lands -> gracefully falls back to A2
  view.target('A1');
  assert.equal(view.currentTarget(), 'A1');
  currentScene = scene({
    aircraft: [
      { id: 'A1', type: 'CT-156', x: 0, y: 1000, alt: 1890, kt: 0, headingDeg: 90, status: 'landed', color: '#7ee787' },
      { id: 'A2', type: 'CT-114', x: -500, y: 900, alt: 2400, kt: 150, headingDeg: 90, status: 'flying', color: '#ff6b6b' },
      { id: 'A3', type: 'CT-157', x: 0, y: 0, alt: 0, kt: 0, headingDeg: 0, status: 'waiting', color: '#a5d6ff' },
    ],
  });
  assert.equal(view.currentTarget(), 'A2', 'gracefully switched to next flying aircraft A2');

  // When all aircraft land -> clears follow
  currentScene = scene({
    aircraft: [
      { id: 'A1', type: 'CT-156', x: 0, y: 1000, alt: 1890, kt: 0, headingDeg: 90, status: 'landed', color: '#7ee787' },
      { id: 'A2', type: 'CT-114', x: -500, y: 900, alt: 1890, kt: 0, headingDeg: 90, status: 'landed', color: '#ff6b6b' },
    ],
  });
  assert.equal(view.currentTarget(), null);
  assert.equal(view.isChasing(), false);

  view.dispose();
});

