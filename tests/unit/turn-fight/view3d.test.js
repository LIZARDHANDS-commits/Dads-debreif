// The Turn Fight's 3D view, the parts that are plain values (SPEC-turn-fight, "2D and 3D views"): the attitude
// it draws (bank from G, heading and pitch into the scene's axes), the trail conversion, the camera choices, and
// how the view starts and stops. three runs in Node without WebGL, so the real three.js checks the axes; the
// drawing itself is checked in the browser (tests/e2e/turn-fight.spec.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadThree, matchProjection, worldToScreen, resetWebglCheck } from '../../../src/ui-kit/three-aircraft.js';
import { createFight, stepFight } from '../../../src/modules/turn-fight/sim.js';
import { createRun, advanceRun } from '../../../src/modules/turn-fight/playback.js';
import {
  ALT_SCALE, CAMERA_LIMITS, MIN_PLANE_PX, T6_LENGTH_FT, CHASE_PITCH_DEG,
  levelBankRad, turnDirection, showsMergeMark, firstNoseText, aircraftPose, applyAttitude, fillTrail, heightAtTime, trailCapacity,
  emptyBounds, extendBounds, DEFAULT_CAMERA, yawBehind, orbit, zoomBy, zoomByRatio, fitZoom, planeLengthFt, cameraFor, VIEWS, cameraForButton,
  computeFloorZ, computePlumbGeometry, createView3d,
} from '../../../src/modules/turn-fight/view3d.js';

const THREE = await loadThree();
const DEG = Math.PI / 180;
const SIZE = { width: 800, height: 600 };
const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) < tol, `${a} is not ${b}`);

/** A fight moved to `sec` seconds, by the same whole steps the screen uses. */
function fightAt(sec, setup = {}) {
  const fight = createFight(setup);
  stepFight(fight, sec);
  return fight;
}

// ---- bank from G -----------------------------------------------------------------------------

test('the level-turn bank is acos(1 / G): 60° at 2 G, about 75.5° at 4 G, flat at 1 G', () => {
  near(levelBankRad(2), 60 * DEG);
  near(levelBankRad(4), Math.acos(0.25));
  near(levelBankRad(4) / DEG, 75.5225, 1e-3);
  assert.equal(levelBankRad(1), 0);
  assert.equal(levelBankRad(0.5), 0); // below 1 G there is no level turn: never a NaN
  near(Math.cos(levelBankRad(7.3)), 1 / 7.3);
});

test('the bank drawn is the fight\'s own (limited) G, toward the turn, and nothing before the merge', () => {
  const before = fightAt(2, { blueG: 4, redG: 6 });
  assert.equal(before.merged, false);
  assert.equal(turnDirection(before, 'blue'), 0);
  assert.equal(aircraftPose(before, 'blue', 0).bankRad, 0);

  const after = fightAt(25, { blueG: 4, redG: 6 });
  assert.equal(after.merged, true);
  near(aircraftPose(after, 'blue', 1).bankRad, Math.acos(1 / after.perf.blue.g));
  near(aircraftPose(after, 'red', 1).bankRad, Math.acos(1 / 6));
  // A G box at its lowest, 1.1, is limited to 1.01 by the fight; the picture follows the fight, not the box.
  const low = fightAt(25, { blueG: 1.1 });
  near(aircraftPose(low, 'blue', 1).bankRad, Math.acos(1 / low.perf.blue.g));
  // A right turn has the same size of bank, the other way.
  near(aircraftPose(after, 'red', -1).bankRad, -Math.acos(1 / 6));
});

test('Blue always turns left; Red turns left in a 2-circle fight and right in a 1-circle fight', () => {
  const two = fightAt(25, { circles: 2 });
  assert.equal(turnDirection(two, 'blue'), 1);
  assert.equal(turnDirection(two, 'red'), 1);
  const one = fightAt(25, { circles: 1 });
  assert.equal(turnDirection(one, 'blue'), 1);
  assert.equal(turnDirection(one, 'red'), -1);
});

test('after first nose-on with chase on, each aircraft banks toward the other, and keeps its last bank inside a half degree', () => {
  const fight = fightAt(40, { chase: true, circles: 1 });
  assert.ok(fight.firstNose, 'the test needs a first nose-on');
  for (const who of ['blue', 'red']) {
    const other = who === 'blue' ? 'red' : 'blue';
    const los = Math.atan2(fight[other].yFt - fight[who].yFt, fight[other].xFt - fight[who].xFt);
    const err = Math.atan2(Math.sin(los - fight[who].headingRad), Math.cos(los - fight[who].headingRad));
    if (Math.abs(err) > 0.5 * DEG) assert.equal(turnDirection(fight, who, 0), Math.sign(err), who);
  }
  // Pointing straight at the other: the last direction stays, so the nose never flickers between banks.
  const pointing = { ...fight, blue: { ...fight.blue, headingRad: Math.atan2(fight.red.yFt - fight.blue.yFt, fight.red.xFt - fight.blue.xFt) } };
  assert.equal(turnDirection(pointing, 'blue', -1), -1);
  assert.equal(turnDirection(pointing, 'blue', 1), 1);
});

// ---- heading and pitch into the scene's axes -------------------------------------------------

/** Where the model's own nose (+X) and left wing (+Y) point after the attitude is applied, in the scene's axes. */
function attitude(pose) {
  const o = new THREE.Object3D();
  applyAttitude(o, pose);
  o.updateMatrixWorld(true);
  return {
    nose: new THREE.Vector3(1, 0, 0).applyMatrix4(o.matrixWorld),
    leftWing: new THREE.Vector3(0, 1, 0).applyMatrix4(o.matrixWorld),
    order: o.rotation.order,
  };
}

test('the attitude goes in as ZYX, rotation.set(-bank, -pitch, heading)', () => {
  const o = new THREE.Object3D();
  applyAttitude(o, { headingRad: 0.7, pitchRad: 0.2, bankRad: 0.5 });
  assert.equal(o.rotation.order, 'ZYX');
  assert.deepEqual([o.rotation.x, o.rotation.y, o.rotation.z], [-0.5, -0.2, 0.7]);
});

test('heading is radians from east, counter-clockwise: the nose points along (cos h, sin h)', () => {
  for (const headingDeg of [0, 30, 90, 180, -90, 225]) {
    const h = headingDeg * DEG;
    const { nose } = attitude({ headingRad: h, pitchRad: 0, bankRad: 0 });
    near(nose.x, Math.cos(h));
    near(nose.y, Math.sin(h));
    near(nose.z, 0);
  }
});

test('a climb puts the nose up and a dive puts it down, at any heading, by the pitch angle', () => {
  for (const headingDeg of [0, 90, 200]) {
    const h = headingDeg * DEG;
    const up = attitude({ headingRad: h, pitchRad: 25 * DEG, bankRad: 0 }).nose;
    near(up.z, Math.sin(25 * DEG));
    near(Math.hypot(up.x, up.y), Math.cos(25 * DEG));
    near(Math.cos(Math.atan2(up.y, up.x) - h), 1); // the ground direction is still the heading
    const down = attitude({ headingRad: h, pitchRad: -40 * DEG, bankRad: 0 }).nose;
    near(down.z, -Math.sin(40 * DEG));
  }
});

test('a left turn has the left wing down and a right turn the right wing down, by the bank angle', () => {
  const left = attitude({ headingRad: 0.7, pitchRad: 0, bankRad: levelBankRad(4) }).leftWing;
  near(left.z, -Math.sin(levelBankRad(4)));
  const right = attitude({ headingRad: 0.7, pitchRad: 0, bankRad: -levelBankRad(4) }).leftWing;
  assert.ok(right.z > 0.9);
  near(attitude({ headingRad: 0.7, pitchRad: 0, bankRad: 0 }).leftWing.z, 0);
});

test('an aircraft is drawn where the fight has it: east, north and height in feet, on its heading and pitch', () => {
  const fight = fightAt(25, { vertical: true, bluePitchDeg: 20, redPitchDeg: -30 });
  assert.equal(fight.merged, true);
  for (const who of ['blue', 'red']) {
    const a = fight[who];
    const pose = aircraftPose(fight, who, 1);
    assert.equal(pose.x, a.xFt);
    assert.equal(pose.y, a.yFt);
    assert.equal(pose.z, a.zFt * ALT_SCALE); // heights are real
    assert.equal(pose.headingRad, a.headingRad);
    assert.equal(pose.pitchRad, a.pitchRad);
  }
  assert.notEqual(aircraftPose(fight, 'blue', 1).z, 0);
});

test('with Climb and dive off, the aircraft are flat: height 0 and no pitch, whatever the pitch boxes say', () => {
  const fight = fightAt(25, { vertical: false, bluePitchDeg: 40, redPitchDeg: -40 });
  for (const who of ['blue', 'red']) {
    const pose = aircraftPose(fight, who, 1);
    assert.equal(pose.z, 0);
    assert.equal(pose.pitchRad, 0);
  }
});

// ---- trails ----------------------------------------------------------------------------------

test('a trail goes to the scene as east, north, height in feet, and ends at the aircraft itself', () => {
  const points = [
    { timeSec: 0, xFt: -6076, yFt: 0, zFt: 0 },
    { timeSec: 0.1, xFt: -6000, yFt: 10, zFt: 50 },
    { timeSec: 0.2, xFt: -5900, yFt: 25, zFt: -75 },
  ];
  const now = { xFt: -5850, yFt: 30, zFt: -100 };
  const out = new Float32Array(3 * 8);
  const count = fillTrail(out, points, now);
  assert.equal(count, 4);
  assert.deepEqual([...out.slice(0, 12)], [-6076, 0, 0, -6000, 10, 50, -5900, 25, -75, -5850, 30, -100]);
});

test('the height goes in unscaled (real feet, no height scale), and only the new points are written when asked', () => {
  assert.equal(ALT_SCALE, 1);
  const points = [{ xFt: 1, yFt: 2, zFt: 3 }, { xFt: 4, yFt: 5, zFt: 6 }, { xFt: 7, yFt: 8, zFt: 9 }];
  const now = { xFt: 10, yFt: 11, zFt: 12 };
  const whole = new Float32Array(15);
  fillTrail(whole, points, now);
  const grown = new Float32Array(15);
  fillTrail(grown, points.slice(0, 2), { xFt: 0, yFt: 0, zFt: 0 });
  fillTrail(grown, points, now, 2); // the first two were written already
  assert.deepEqual([...grown], [...whole]);
});

test('a whole 10-minute fight fits the trail buffer', () => {
  const run = createRun({});
  for (let i = 0; i < 7500 && !run.fight.stopped; i++) advanceRun(run, 0.08);
  assert.equal(run.fight.stopped, true);
  assert.ok(run.trails.blue.length + 1 <= trailCapacity(), `${run.trails.blue.length} points`);
  const out = new Float32Array(3 * trailCapacity());
  assert.equal(fillTrail(out, run.trails.red, run.fight.red), run.trails.red.length + 1);
});

test('the height at a moment is found between the two trail points around it', () => {
  const points = [0, 1, 2, 3].map((t) => ({ timeSec: t * 0.1, xFt: 0, yFt: 0, zFt: t * 100 }));
  assert.equal(heightAtTime(points, 0), 0);
  near(heightAtTime(points, 0.15), 150);
  near(heightAtTime(points, 0.3), 300);
  assert.equal(heightAtTime(points, 5), 300); // after the last point
  assert.equal(heightAtTime(points, -1), 0); // before the first
  assert.equal(heightAtTime([], 1), 0);
});

test('the first nose-on words name who got there, or BOTH for a tie, and are empty before it happens', () => {
  assert.equal(firstNoseText(null), '');
  assert.equal(firstNoseText(undefined), '');
  assert.equal(firstNoseText({ by: 'blue' }), 'FIRST NOSE — BLUE'); // a fight state with no `both` field
  assert.equal(firstNoseText({ by: 'red', both: false }), 'FIRST NOSE — RED');
  assert.equal(firstNoseText({ by: 'blue', both: true }), 'FIRST NOSE — BOTH');
});

// ---- camera ----------------------------------------------------------------------------------

/** Where a world point lands on the screen for a camera and its centre. */
function screenOf({ center, camera }, point, size = SIZE) {
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2);
  matchProjection(THREE, cam, center, camera, size, 1);
  return worldToScreen(THREE, cam, { x: point.x, y: point.y, z: point.z ?? 0 }, size.width, size.height);
}

test('the camera keeps the fight\'s centre mid-screen and every point of the fight on screen', () => {
  const bounds = emptyBounds();
  for (const p of [{ xFt: -6076, yFt: 0, zFt: 0 }, { xFt: 6076, yFt: 0, zFt: 0 }, { xFt: 500, yFt: 4000, zFt: 800 }]) extendBounds(bounds, p);
  const view = cameraFor({ mode: 'fit', yawDeg: 0, pitchDeg: 35, zoom: 50, zoomAuto: true }, { bounds, fight: fightAt(0), size: SIZE });
  near(view.center.x, 0);
  near(view.center.y, 2000);
  const mid = screenOf(view, { x: view.center.x, y: view.center.y, z: view.center.z });
  near(mid.x, SIZE.width / 2, 1e-3);
  near(mid.y, SIZE.height / 2, 1e-3);
  for (const [x, y] of [[-6076, 0], [6076, 0], [500, 4000]]) {
    const p = screenOf(view, { x, y });
    assert.ok(p.x > 0 && p.x < SIZE.width && p.y > 0 && p.y < SIZE.height, `(${x}, ${y}) is at ${p.x}, ${p.y}`);
  }
});

test('a climbing or diving fight stays whole on screen under the default camera, out to T+240 s (the fit counts height too)', () => {
  const size = { width: 708, height: 605 };
  for (const pitch of [20, 45]) {
    for (const [bluePitchDeg, redPitchDeg] of [[pitch, -pitch], [pitch, pitch], [-pitch, -pitch]]) {
      const run = createRun({ vertical: true, bluePitchDeg, redPitchDeg });
      const bounds = emptyBounds();
      let written = 0;
      let checked = -1;
      for (let t = 0; t < 240 && !run.fight.stopped; t += 0.08) {
        advanceRun(run, 0.08);
        if (Math.floor(run.fight.timeSec / 10) === checked) continue; // look every 10 s of fight time
        checked = Math.floor(run.fight.timeSec / 10);
        for (; written < run.trails.blue.length; written++) {
          extendBounds(bounds, run.trails.blue[written]);
          extendBounds(bounds, run.trails.red[written]);
        }
        const now = { ...bounds };
        for (const who of ['blue', 'red']) extendBounds(now, run.fight[who]);
        const view = cameraFor(DEFAULT_CAMERA, { bounds: now, fight: run.fight, size });
        for (const who of ['blue', 'red']) {
          const a = run.fight[who];
          const p = screenOf(view, { x: a.xFt, y: a.yFt, z: a.zFt }, size);
          assert.ok(p.x > 0 && p.x < size.width && p.y > 0 && p.y < size.height,
            `pitch ${bluePitchDeg}/${redPitchDeg}, T+${run.fight.timeSec.toFixed(0)}: ${who} is at ${p.x.toFixed(0)}, ${p.y.toFixed(0)}`);
        }
      }
    }
  }
});

test('the zoom that fits grows as the fight shrinks, and never goes beyond the limits; manual zoom is kept', () => {
  const small = emptyBounds();
  extendBounds(small, { xFt: -100, yFt: 0, zFt: 0 });
  extendBounds(small, { xFt: 100, yFt: 0, zFt: 0 });
  const big = emptyBounds();
  extendBounds(big, { xFt: -60000, yFt: 0, zFt: 0 });
  extendBounds(big, { xFt: 60000, yFt: 0, zFt: 0 });
  assert.ok(fitZoom(small, SIZE) > fitZoom(big, SIZE));
  assert.ok(fitZoom(big, SIZE) >= CAMERA_LIMITS.zoom[0] && fitZoom(small, SIZE) <= CAMERA_LIMITS.zoom[1]);
  // A tiny start (0.5 NM apart) is shown at least 3,000 ft wide each way, as the 2D view does.
  near(fitZoom(small, SIZE), fitZoom({ minX: -3000, maxX: 3000, minY: -3000, maxY: 3000, minZ: 0, maxZ: 0 }, SIZE));
  const manual = cameraFor({ mode: 'fit', yawDeg: 10, pitchDeg: 20, zoom: 123, zoomAuto: false }, { bounds: small, fight: fightAt(0), size: SIZE });
  assert.equal(manual.camera.zoom, 123);
  assert.equal(manual.camera.yawDeg, 10);
  assert.equal(manual.camera.altScale, ALT_SCALE);
});

test('Overhead looks straight down with north up, as the 2D view does: east is right, north is up, height changes nothing', () => {
  const bounds = emptyBounds();
  extendBounds(bounds, { xFt: -1000, yFt: -1000, zFt: 0 });
  extendBounds(bounds, { xFt: 1000, yFt: 1000, zFt: 0 });
  const cam = cameraForButton('overhead', { fight: fightAt(0), size: SIZE });
  const view = cameraFor(cam, { bounds, fight: fightAt(0), size: SIZE });
  const c = screenOf(view, { x: 0, y: 0 });
  const east = screenOf(view, { x: 500, y: 0 });
  const north = screenOf(view, { x: 0, y: 500 });
  const high = screenOf(view, { x: 0, y: 0, z: 2000 });
  assert.ok(east.x > c.x); near(east.y, c.y, 1e-3);
  assert.ok(north.y < c.y); near(north.x, c.x, 1e-3);
  near(high.y, c.y, 1e-3);
  assert.equal(cam.pitchDeg, 0);
  assert.equal(cam.mode, 'fit');
});

test('a chase view sits behind the aircraft on its heading, and what is ahead of it is up the screen', () => {
  assert.deepEqual(Object.keys(VIEWS).sort(), ['blue', 'overhead', 'red']);
  const fight = fightAt(25);
  for (const who of ['blue', 'red']) {
    const cam = cameraForButton(who, { fight, size: SIZE });
    assert.equal(cam.mode, who);
    assert.equal(cam.pitchDeg, CHASE_PITCH_DEG);
    const view = cameraFor(cam, { bounds: emptyBounds(), fight, size: SIZE });
    const a = fight[who];
    near(view.center.x, a.xFt);
    near(view.center.y, a.yFt);
    near(view.camera.yawDeg, yawBehind(a.headingRad));
    const here = screenOf(view, { x: a.xFt, y: a.yFt });
    const ahead = screenOf(view, { x: a.xFt + 500 * Math.cos(a.headingRad), y: a.yFt + 500 * Math.sin(a.headingRad) });
    near(ahead.x, here.x, 1e-3);
    assert.ok(ahead.y < here.y);
    // Orbiting in a chase view turns the camera round the aircraft, from behind it.
    const turned = cameraFor({ ...cam, yawDeg: 90 }, { bounds: emptyBounds(), fight, size: SIZE });
    near(turned.camera.yawDeg, yawBehind(a.headingRad) + 90 > 180 ? yawBehind(a.headingRad) + 90 - 360 : yawBehind(a.headingRad) + 90);
  }
});

test('chase follows the aircraft as it turns: the same call a moment later is centred on its new place and heading', () => {
  const early = fightAt(25);
  const later = fightAt(28);
  const cam = cameraForButton('blue', { fight: early, size: SIZE });
  const a = cameraFor(cam, { bounds: emptyBounds(), fight: early, size: SIZE });
  const b = cameraFor(cam, { bounds: emptyBounds(), fight: later, size: SIZE });
  assert.notEqual(a.center.x, b.center.x);
  assert.notEqual(a.camera.yawDeg, b.camera.yawDeg);
  near(b.center.x, later.blue.xFt);
  near(b.center.z, later.blue.zFt);
});

test('yawBehind stays within one turn; orbit turns and tilts within limits; zoom stays within its limits', () => {
  for (const d of [-720, -181, -90, 0, 90, 180, 361, 1000]) {
    const yaw = yawBehind(d * DEG);
    assert.ok(yaw >= -180 && yaw < 180, `${d} gives ${yaw}`);
  }
  const start = { mode: 'fit', yawDeg: 170, pitchDeg: 35, zoom: 20, zoomAuto: true };
  near(orbit(start, 100, 0).yawDeg, -150); // 170 + 40 wraps round
  assert.equal(orbit(start, 0, 10_000).pitchDeg, CAMERA_LIMITS.pitch[0]);
  assert.equal(orbit(start, 0, -10_000).pitchDeg, CAMERA_LIMITS.pitch[1]);
  let z = start;
  for (let i = 0; i < 300; i++) z = zoomBy(z, -1);
  assert.equal(z.zoom, CAMERA_LIMITS.zoom[1]);
  for (let i = 0; i < 600; i++) z = zoomBy(z, 1);
  assert.equal(z.zoom, CAMERA_LIMITS.zoom[0]);
  assert.ok(zoomBy(start, -1).zoom > start.zoom && zoomBy(start, 1).zoom < start.zoom);
  assert.equal(zoomBy(start, -1).zoomAuto, false, 'a zoom by hand stops the automatic fit');
  assert.equal(orbit(start, 10, 10).zoomAuto, true, 'orbiting does not');
});

test('a pinch zooms by the ratio of the fingers\' distance, within the limits', () => {
  const start = { mode: 'fit', yawDeg: 0, pitchDeg: 35, zoom: 40, zoomAuto: true };
  near(zoomByRatio(start, 2).zoom, 80);
  near(zoomByRatio(start, 0.5).zoom, 20);
  assert.equal(zoomByRatio(start, 1e9).zoom, CAMERA_LIMITS.zoom[1]);
  assert.equal(zoomByRatio(start, 0).zoom, start.zoom, 'a zero or bad ratio changes nothing');
  assert.equal(zoomByRatio(start, NaN).zoom, start.zoom);
  assert.equal(zoomByRatio(start, 2).zoomAuto, false);
});

test('an aircraft is at least its real length, and at least MIN_PLANE_PX long on screen', () => {
  assert.equal(planeLengthFt(2000), T6_LENGTH_FT); // 2 px per foot: real size is already big enough
  assert.equal(planeLengthFt(10), MIN_PLANE_PX / 0.01); // zoomed out: drawn bigger so it can be seen
  for (const zoom of [1, 5, 20, 100, 400]) {
    const px = (planeLengthFt(zoom) * zoom) / 1000;
    assert.ok(px >= MIN_PLANE_PX - 1e-9 || planeLengthFt(zoom) === T6_LENGTH_FT, `zoom ${zoom}`);
  }
});

// ---- starting and stopping ---------------------------------------------------------------------

/** The least of a page the view touches, so its start and stop can be checked in Node. */
function fakePage({ webgl = true, webgl1 = false } = {}) {
  resetWebglCheck(); // ui-kit remembers the answer; each fake page asks afresh
  const made = [];
  const element = (tag) => {
    const el = {
      tag, children: [], style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} },
      listeners: {},
      append(...kids) { this.children.push(...kids); },
      replaceChildren(...kids) { this.children = kids; },
      setAttribute() {}, remove() { this.removed = true; },
      addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
      removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn); },
      // The sky paints a gradient on a spare 2D canvas; anything asked of that context does nothing.
      getContext: (type) => {
        if (type === '2d') return new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
        if (type === 'webgl2') return webgl ? { fake: 'context' } : null;
        return webgl || webgl1 ? { fake: 'webgl 1', getExtension: () => ({ loseContext() { el.spareReleased = true; } }) } : null; // 'webgl'
      },
      clientWidth: 800, clientHeight: 600,
    };
    made.push(el);
    return el;
  };
  const doc = { createElement: element };
  const host = element('div');
  host.ownerDocument = doc;
  return { host, made, doc };
}

const flatTimers = () => ({ frame: () => () => {}, after: () => () => {} });
const makeView = (over = {}) => {
  const page = over.page ?? fakePage();
  const view = createView3d(page.host, {
    timers: flatTimers(),
    run: () => createRun({}),
    paint: () => 'harvard',
    win: { devicePixelRatio: 1 },
    ...over,
  });
  return { view, page };
};

test('when three.js cannot load, starting says why ("load") and leaves nothing behind', async () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    const { view, page } = makeView({ load: async () => { throw new Error('offline'); } });
    assert.deepEqual(await view.start(), { ok: false, reason: 'load' });
    assert.equal(view.stats().active, false);
    assert.equal(page.host.children.length, 0);
    // A later try asks again (a failed load is not cached by loadThree).
    let asked = 0;
    const retry = makeView({ load: async () => { asked++; throw new Error('offline'); } }).view;
    await retry.start();
    await retry.start();
    assert.equal(asked, 2);
  } finally {
    console.warn = warn;
  }
});

test('with no WebGL, starting says so ("gl") without asking three.js for a renderer', async () => {
  let built = 0;
  const THREE_STUB = { WebGLRenderer: class { constructor() { built++; } } };
  const warn = console.warn;
  console.warn = () => {};
  try {
    const { view } = makeView({ page: fakePage({ webgl: false }), load: async () => THREE_STUB });
    assert.deepEqual(await view.start(), { ok: false, reason: 'gl' });
    assert.equal(built, 0);
    assert.equal(view.stats().active, false);
  } finally {
    console.warn = warn;
  }
});

test('TF3-7: with WebGL 1 only, starting says "gl2" (three.js needs WebGL 2) without asking three.js for a renderer, and frees the spare context', async () => {
  let built = 0;
  const THREE_STUB = { WebGLRenderer: class { constructor() { built++; } } };
  const warn = console.warn;
  console.warn = () => {};
  try {
    const page = fakePage({ webgl: false, webgl1: true });
    const { view } = makeView({ page, load: async () => THREE_STUB });
    assert.deepEqual(await view.start(), { ok: false, reason: 'gl2' });
    assert.equal(built, 0);
    assert.equal(view.stats().active, false);
    assert.ok(page.made.some((el) => el.spareReleased), 'the WebGL 1 probe context is released');
  } finally {
    console.warn = warn;
  }
});

test('stopping while three.js is still loading wins: the late start builds nothing and says "closed"', async () => {
  let release;
  let built = 0;
  const gate = new Promise((resolve) => { release = resolve; });
  const THREE_STUB = { WebGLRenderer: class { constructor() { built++; } } };
  const { view } = makeView({ load: () => gate.then(() => THREE_STUB) });
  const starting = view.start();
  view.stop();
  release();
  assert.deepEqual(await starting, { ok: false, reason: 'closed' });
  assert.equal(built, 0);
  assert.equal(view.stats().active, false);
});

test('a disposed view never starts again, and stop and dispose can be called twice', async () => {
  const { view } = makeView({ load: async () => { throw new Error('unused'); } });
  view.stop();
  view.dispose();
  view.dispose();
  assert.deepEqual(await view.start(), { ok: false, reason: 'closed' });
  view.requestDraw(); // nothing to draw, and no frame asked for
  assert.equal(view.stats().pending, false);
});

// ---- R28: start geometry in 3D ---------------------------------------------------------------

test('R28: the MERGE mark is drawn only when the jets pass at the centre, as in the top-down view: not for a beam start or turns at once', () => {
  assert.equal(showsMergeMark(createFight()), true, 'head-on, as V6');
  assert.equal(showsMergeMark(createFight({ startAaDeg: 90 })), true, 'a crossing passes at the centre');
  assert.equal(showsMergeMark(createFight({ startAtaDeg: 90, startAaDeg: 90 })), false, 'a beam start: the range is not closing, no pass');
  assert.equal(showsMergeMark(createFight({ turnsAt: 'once' })), false, 'turns at once');
  assert.equal(showsMergeMark(createFight({ startAaDeg: 0 })), false, 'a tail chase: not closing');
  assert.equal(showsMergeMark(createFight({ startAaDeg: 0, blueKt: 221, redKt: 220 })), false, 'a pass after the 10-minute stop');
});

test('R28: the bank follows the way each jet turns toward the other, and a 1-circle Red still turns the other way', () => {
  const beam = { startAtaDeg: 90, startAtaSide: 'right', startAaDeg: 90, startAaSide: 'right', turnsAt: 'once' };
  const two = fightAt(1, { ...beam, circles: 2 });
  assert.deepEqual([turnDirection(two, 'blue'), turnDirection(two, 'red')], [-1, -1]);
  const one = fightAt(1, { ...beam, circles: 1 });
  assert.deepEqual([turnDirection(one, 'blue'), turnDirection(one, 'red')], [-1, 1]);
  // The bank's sign is the turn's: right wing down for a right turn.
  assert.ok(aircraftPose(two, 'blue', turnDirection(two, 'blue')).bankRad < 0);
  // And at V6's head-on start nothing changed.
  const v6 = fightAt(25);
  assert.deepEqual([turnDirection(v6, 'blue'), turnDirection(v6, 'red')], [1, 1]);
});

// ---- WebGL context loss (task 7) ---------------------------------------------------------------

/** The real three.js with a renderer that draws nothing, so a start can build its whole scene in Node. */
async function threeWithFakeRenderer() {
  const real = await import('three');
  const renderers = [];
  class FakeRenderer {
    constructor() { this.calls = []; renderers.push(this); }
    setPixelRatio() {}
    setSize() {}
    render() { this.calls.push('render'); }
    dispose() { this.calls.push('dispose'); }
    forceContextLoss() { this.calls.push('forceContextLoss'); }
  }
  return { THREE: { ...real, WebGLRenderer: FakeRenderer }, renderers };
}

/** Runs `fn` with the page's fake document as the global one, which ui-kit's sky reads; puts the old one back. */
async function withPageDocument(page, fn) {
  const before = Object.getOwnPropertyDescriptor(globalThis, 'document');
  globalThis.document = page.doc;
  try {
    await fn();
  } finally {
    if (before) Object.defineProperty(globalThis, 'document', before);
    else delete globalThis.document;
  }
}

/** Sends `type` to every listener on `el`, as the browser does, and returns what preventDefault was called. */
function fire(el, type) {
  const event = { type, target: el, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  for (const fn of [...(el.listeners[type] ?? [])]) fn(event);
  return event;
}

test('a lost WebGL context is handled: preventDefault, everything freed, drawing stopped, and the screen told once', async () => {
  const { THREE, renderers } = await threeWithFakeRenderer();
  const page = fakePage();
  await withPageDocument(page, async () => {
    let lost = 0;
    let frames = 0;
    const { view } = makeView({ page, load: async () => THREE, onLost: () => lost++, timers: { frame: () => { frames++; return () => { frames--; }; }, after: () => () => {} } });
    assert.deepEqual(await view.start(), { ok: true });
    const canvas = page.host.children[0];
    assert.equal(view.stats().active, true);
    assert.equal(canvas.listeners.webglcontextlost.length, 1);

    const event = fire(canvas, 'webglcontextlost');
    assert.equal(event.defaultPrevented, true, 'preventDefault is called, as three.js does too');
    assert.equal(lost, 1);
    assert.equal(view.stats().active, false);
    assert.equal(view.stats().pending, false);
    assert.equal(frames, 0, 'no frame is left asked for');
    assert.equal(page.host.children.length, 0, 'the canvas and labels are gone');
    assert.deepEqual(canvas.listeners.webglcontextlost, [], 'the listener goes with the canvas');
    assert.ok(renderers[0].calls.includes('dispose'), 'the renderer is freed');
    assert.ok(!renderers[0].calls.includes('forceContextLoss'), 'a context the browser already took is not released again');

    // Nothing draws after the loss, and a second loss message changes nothing.
    view.requestDraw();
    assert.equal(view.stats().pending, false);
    fire(canvas, 'webglcontextlost');
    assert.equal(lost, 1);
    view.stop();
    view.dispose(); // leaving the page still frees what is left, and does not complain
  });
});
test('after a lost context, 3D can start again on a new canvas, and the camera choice is kept', async () => {
  const { THREE } = await threeWithFakeRenderer();
  const page = fakePage();
  await withPageDocument(page, async () => {
    const { view } = makeView({ page, load: async () => THREE });
    await view.start();
    view.setView('blue');
    fire(page.host.children[0], 'webglcontextlost');
    assert.equal(view.stats().camera.mode, 'blue');
    assert.deepEqual(await view.start(), { ok: true });
    assert.equal(view.stats().active, true);
    assert.equal(page.host.children[0].listeners.webglcontextlost.length, 1);
    view.dispose();
  });
});
test('stopping 3D on purpose releases the context without calling it a loss', async () => {
  const { THREE, renderers } = await threeWithFakeRenderer();
  const page = fakePage();
  await withPageDocument(page, async () => {
    let lost = 0;
    const { view } = makeView({ page, load: async () => THREE, onLost: () => lost++ });
    await view.start();
    const canvas = page.host.children[0];
    view.stop();
    assert.ok(renderers[0].calls.includes('forceContextLoss'), 'the context is released on purpose');
    fire(canvas, 'webglcontextlost'); // the browser reports that release a moment later
    assert.equal(lost, 0, 'and that report is not a loss');
    view.dispose();
  });
});

// ---- D401: Tactical 3D Suite (plumb lines and contact discs) ----------------

test('computeFloorZ returns terrain level in Simple mode and hard deck in Energy mode', () => {
  // Simple mode: 1000 ft below lowest reached altitude
  const simpleFight = { energy: false };
  const bounds = { minZ: -500, maxZ: 1200 };
  const simpleFloor = computeFloorZ(simpleFight, bounds);
  assert.equal(simpleFloor, -(1000 + 1200));

  // Energy mode: hard deck altitude
  const energyFight = { energy: true, setup: { hardDeckFt: 5000 } };
  const energyFloor = computeFloorZ(energyFight, bounds, 8000);
  assert.equal(energyFloor, 5000);

  // Energy mode: breaches hard deck -> floor plunges to 0 MSL
  const breachFloor = computeFloorZ(energyFight, bounds, 4500);
  assert.equal(breachFloor, 0);

  // Energy mode default fallback hard deck (6000 ft)
  const defaultEnergyFight = { energy: true, setup: {} };
  assert.equal(computeFloorZ(defaultEnergyFight, bounds, 7000), 6000);
});

test('computePlumbGeometry produces 6-element vertical segment between pose and floor', () => {
  const pose = { x: 1500, y: -2200, z: 8000 };
  const floorZ = 5000;
  const geom = computePlumbGeometry(pose, floorZ);
  assert.ok(geom instanceof Float32Array);
  assert.equal(geom.length, 6);
  assert.equal(geom[0], 1500);
  assert.equal(geom[1], -2200);
  assert.equal(geom[2], 8000);
  assert.equal(geom[3], 1500);
  assert.equal(geom[4], -2200);
  assert.equal(geom[5], 5000);
});

