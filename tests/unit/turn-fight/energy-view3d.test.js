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

// The 3D view in Energy mode (SPEC-turn-fight, "2D and 3D views"): each aircraft's own bank from the energy state in place
// of the level-turn bank, its pitch from its climb angle, the see-through hard-deck plane, and the first nose-on
// mark for a tie. three runs in Node without WebGL, so the real three.js builds the scene and a stand-in renderer draws nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadThree, resetWebglCheck } from '../../../src/ui-kit/three-aircraft.js';
import { createRun, createEnergyRun, advanceRun } from '../../../src/modules/turn-fight/playback.js';
import { aircraftPose, showsMergeMark, firstNoseText, applyAttitude, createView3d, DECK_OPACITY, ALT_SCALE } from '../../../src/modules/turn-fight/view3d.js';
import { passMarkWord } from '../../../src/modules/turn-fight/geometry.js';

const DEG = Math.PI / 180;
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} is not ${b}`);

const play = (run, seconds) => {
  for (let t = 0; t < seconds - 1e-9; t += 0.02) advanceRun(run, 0.02);
  return run;
};

test('in Energy mode the pose is the aircraft\'s own: bank from the energy state toward the turn, pitch from the climb angle, height from its altitude', () => {
  const run = play(createEnergyRun({}), 18); // the pitch back is 4 G, 105° of bank and climbing at T+18
  const blue = run.engine.blue;
  assert.ok(blue.bankDeg > 60 && blue.climbDeg > 10, `bank ${blue.bankDeg}, climb ${blue.climbDeg}`);
  const pose = aircraftPose(run.fight, 'blue', 1);
  near(pose.bankRad, blue.turnDir * blue.bankDeg * DEG);
  near(pose.pitchRad, blue.climbDeg * DEG);
  near(pose.headingRad, blue.headingRad);
  near(pose.z, blue.altFt * ALT_SCALE);
  assert.equal(pose.x, blue.xFt);
  // Not the level-turn bank for the same G: acos(1/4) is 75.5°, and this bank is 105° over the top.
  assert.ok(Math.abs(pose.bankRad - Math.acos(1 / blue.g)) > 10 * DEG);
});

test('the bank\'s sign is the turn\'s: left is positive, right negative, and a fight before the turns is flat', () => {
  const start = createEnergyRun({});
  assert.equal(aircraftPose(start.fight, 'blue', 0).bankRad, 0);
  assert.equal(aircraftPose(start.fight, 'blue', 0).pitchRad, 0);
  const run = play(createEnergyRun({ ataDeg: 90, ataSide: 'right', aaDeg: 90, aaSide: 'right', turnsStart: 'now' }), 3);
  const { blue } = run.engine;
  assert.equal(blue.turnDir, -1, 'Red is on the right, so Blue turns right');
  assert.ok(aircraftPose(run.fight, 'blue', 1).bankRad < 0);
  // And the direction the caller passes is ignored: the aircraft knows which way it turns.
  assert.equal(aircraftPose(run.fight, 'blue', 1).bankRad, aircraftPose(run.fight, 'blue', -1).bankRad);
});

test('the simple fight\'s pose is unchanged: the level-turn bank for its own G', () => {
  const run = createRun({});
  advanceRun(run, 0.08);
  for (let i = 0; i < 1000; i++) advanceRun(run, 0.02);
  const pose = aircraftPose(run.fight, 'blue', 1);
  near(pose.bankRad, Math.acos(1 / run.fight.perf.blue.g));
  assert.equal(pose.pitchRad, 0);
  assert.equal(run.fight.energy, undefined);
});

test('the attitude goes into the scene\'s axes as ui-kit says, for the energy bank too', () => {
  const object = { rotation: { order: '', set(x, y, z) { this.value = [x, y, z]; } } };
  applyAttitude(object, { bankRad: 105 * DEG, pitchRad: 20 * DEG, headingRad: 0.5 });
  assert.equal(object.rotation.order, 'ZYX');
  assert.deepEqual(object.rotation.value, [-105 * DEG, -20 * DEG, 0.5]);
});

test('the MERGE mark, the pass word and first nose-on read the Energy run as they do the simple one', () => {
  const head = createEnergyRun({});
  assert.equal(showsMergeMark(head.fight), true);
  assert.equal(passMarkWord(head.fight), 'MERGE');
  assert.equal(showsMergeMark(createEnergyRun({ turnsStart: 'now' }).fight), false);
  assert.equal(passMarkWord(createEnergyRun({ aaDeg: 90 }).fight), 'PASS');
  assert.equal(firstNoseText(null), '');
  const tie = play(createEnergyRun({}), 32); // the equal fight ties: the engine says by 'both'
  assert.equal(tie.engine.firstNose.by, 'both');
  assert.equal(firstNoseText(tie.fight.firstNose), 'FIRST NOSE — BOTH');
});

// ── the deck plane, in a scene built by the real three.js ────────────────────

async function threeWithSceneCapture() {
  const real = await import('three');
  const scenes = [];
  class FakeRenderer {
    constructor() { this.calls = []; }
    setPixelRatio() {}
    setSize() {}
    render(scene) { scenes.push(scene); }
    dispose() {}
    forceContextLoss() {}
  }
  return { THREE: { ...real, WebGLRenderer: FakeRenderer }, scenes };
}

function fakePage() {
  resetWebglCheck();
  const element = (tag) => {
    const el = {
      tag, children: [], style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, listeners: {},
      append(...kids) { this.children.push(...kids); },
      replaceChildren(...kids) { this.children = kids; },
      setAttribute() {}, remove() {},
      addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
      removeEventListener() {},
      getContext: (type) => {
        if (type === '2d') return new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
        return type === 'webgl2' ? { fake: 'context' } : null;
      },
      clientWidth: 800, clientHeight: 600,
    };
    return el;
  };
  const doc = { createElement: element };
  const host = element('div');
  host.ownerDocument = doc;
  return { host, doc };
}

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

test('Energy mode draws a see-through hard-deck plane at the deck\'s height; the simple fight draws none', async () => {
  const { THREE, scenes } = await threeWithSceneCapture();
  const page = fakePage();
  await withPageDocument(page, async () => {
    let current = createEnergyRun({ hardDeckFt: 7000 });
    const queue = [];
    const view = createView3d(page.host, {
      timers: { frame: (fn) => { queue.push(fn); return () => {}; }, after: () => () => {} },
      run: () => current,
      paint: () => 'harvard',
      win: { devicePixelRatio: 1 },
      load: async () => THREE,
    });
    assert.deepEqual(await view.start(), { ok: true });
    while (queue.length) queue.shift()();
    const scene = scenes.at(-1);
    const deck = scene.getObjectByName('hard-deck');
    assert.ok(deck, 'the scene has a hard-deck plane');
    assert.equal(deck.visible, true);
    assert.equal(deck.position.z, 7000 * ALT_SCALE);
    assert.equal(deck.material.transparent, true, 'see-through');
    assert.equal(deck.material.opacity, DECK_OPACITY);
    assert.ok(DECK_OPACITY > 0 && DECK_OPACITY < 0.5);
    assert.equal(deck.material.depthWrite, false, 'it never hides the aircraft or the trails');
    assert.equal(deck.geometry.type, 'PlaneGeometry');
    // The plane is flat over the ground (X-Y): its normal is straight up.
    assert.equal(deck.rotation.x, 0);
    // The ground grid sits at sea level under it; the deck's name floats over it.
    assert.equal(scene.children.find((o) => o.type === 'GridHelper').position.z, 0);
    const label = page.host.children.at(-1);
    assert.equal(label.textContent, 'HARD DECK');
    assert.notEqual(label.style.display, 'none');

    // A hard deck the person sets moves the plane at the next frame.
    current = createEnergyRun({ hardDeckFt: 9000 });
    view.requestDraw();
    while (queue.length) queue.shift()();
    assert.equal(scenes.at(-1).getObjectByName('hard-deck').position.z, 9000);

    // The simple fight: no plane, no word.
    current = createRun({});
    view.requestDraw();
    while (queue.length) queue.shift()();
    assert.equal(scenes.at(-1).getObjectByName('hard-deck').visible, false);
    assert.equal(page.host.children.at(-1).style.display, 'none');
    view.dispose();
  });
});

test('in the Energy scene the aircraft are drawn with their own bank and pitch, and a tie\'s first nose-on line does not break the scene', async () => {
  const { THREE, scenes } = await threeWithSceneCapture();
  const page = fakePage();
  await withPageDocument(page, async () => {
    const current = play(createEnergyRun({}), 18);
    const queue = [];
    const view = createView3d(page.host, {
      timers: { frame: (fn) => { queue.push(fn); return () => {}; }, after: () => () => {} },
      run: () => current,
      paint: () => 'harvard',
      win: { devicePixelRatio: 1 },
      load: async () => THREE,
    });
    await view.start();
    while (queue.length) queue.shift()();
    const scene = scenes.at(-1);
    const blue = current.engine.blue;
    const planes = scene.children.filter((o) => o.type === 'Group' && Math.abs(o.position.z - blue.altFt) < 1e-6);
    assert.ok(planes.length >= 1, 'an aircraft is drawn at Blue\'s altitude');
    near(planes[0].rotation.x, -blue.turnDir * blue.bankDeg * DEG, 1e-6);
    near(planes[0].rotation.y, -blue.climbDeg * DEG, 1e-6);
    // Fly on to the tie: the first nose-on line is drawn from Blue to Red although the engine's `by` is 'both'.
    play(current, 14);
    assert.equal(current.engine.firstNose.by, 'both');
    view.requestDraw();
    while (queue.length) queue.shift()();
    assert.ok(scenes.at(-1).children.some((o) => o.type === 'Line' && o.material.type === 'LineDashedMaterial'));
    view.dispose();
  });
});
