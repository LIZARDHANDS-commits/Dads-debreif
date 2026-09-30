// The 3D view run in Node with a fake renderer: what it draws for a ship in a
// GPS gap (D32), and how it looks after its WebGL side (materials, size, teardown).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createView3d } from '../../../src/modules/debrief/view3d/view.js';
import { shipsIn3d } from '../../../src/modules/debrief/view3d/frame.js';
import { viewKit, exampleFlight, installFakeDocument, drawn, fakeCanvas, FakeRenderer } from './view3d-harness.js';

/** Opens a view on `flight` at time `t`, lets three "load" and draws once. */
async function open({ settings = {}, flight, t }) {
  const restore = installFakeDocument();
  const kit = await viewKit(settings);
  FakeRenderer.all.length = 0;
  const time = { t };
  const view = createView3d(kit.canvas, {
    timers: kit.timers, flight: () => flight, time: () => time.t, settings: () => kit.state, fieldFt: () => 0,
    setCamera() {}, loadThree: () => Promise.resolve(kit.THREE), onUnavailable(m) { throw new Error(m); },
  });
  const settle = async () => {
    kit.timers.flush();
    await Promise.resolve();
    await Promise.resolve();
    kit.timers.flush();
  };
  await settle();
  return { ...kit, view, time, settle, renderer: () => FakeRenderer.all[0], close() { view.dispose(); restore(); } };
}

const START_S = 40 * 60; // a while into the example flight, when all four are flying

test('a ship in a GPS gap shows no bank, pitch or height in 3D (D32)', async () => {
  const at = (await exampleFlight()).startT + START_S;
  const flight = await exampleFlight(2, at - 10, at + 20);
  const t = at + 5;
  assert.ok(shipsIn3d(flight, t).find((s) => s.slot === 2).inGap, 'the set-up has ship 2 in a gap');
  const k = await open({ flight, t });
  try {
    const text = drawn(k.ctx);
    assert.equal(text.filter((s) => s === 'GPS gap').length, 1);
    assert.ok(text.includes('#2'));
    // The three ships still in GPS carry bank, pitch and stick heights; the gap ship none.
    assert.equal(text.filter((s) => s.startsWith('bank ')).length, 3);
    assert.equal(text.filter((s) => /ft above datum$/.test(s)).length, 3);
    // In the picture: three height sticks and three Harvard models; the gap ship's is the hollow marker.
    const world = k.renderer().scene.children.find((o) => o.type === 'Group' && o.children.length);
    assert.equal(world.children.filter((o) => o.geometry?.type === 'CylinderGeometry').length, 3);
    assert.equal(k.renderer().scene.children.filter((o) => o.visible && o.type === 'Group' && o !== world).length, 3);
  } finally {
    k.close();
  }
});

// The WebGL side: materials made once, the renderer told only what changed, a clean teardown (auditor #169).

const EVERYTHING = { landscape3d: true, groundRef3d: true, grid3d: true, trailSec3d: 120, sticks3d: true };
const allMaterials = (made) => [...made.basic, ...made.line, ...made.standard];

test('materials are made once and kept across draws, and freed only when the view goes', async () => {
  const flight = await exampleFlight();
  const k = await open({ flight, t: flight.startT + START_S, settings: EVERYTHING });
  try {
    const after1 = allMaterials(k.made).length;
    assert.ok(after1 > 0);
    k.time.t += 30;
    k.view.requestDraw();
    await k.settle();
    k.time.t += 30;
    k.view.requestDraw();
    await k.settle();
    assert.equal(allMaterials(k.made).length, after1, 'later draws make no new materials');
    assert.ok(k.renderer().count('render') >= 3);
    assert.ok(allMaterials(k.made).every((m) => m.disposed === 0), 'and dispose none between draws');
    k.close();
    assert.ok(allMaterials(k.made).every((m) => m.disposed >= 1), 'each is disposed when the view is disposed');
  } catch (err) {
    k.close();
    throw err;
  }
});

test('on dispose the renderer is disposed, then its context is lost', async () => {
  const flight = await exampleFlight();
  const k = await open({ flight, t: flight.startT + START_S });
  const r = k.renderer();
  k.close();
  const names = r.calls.map((c) => c[0]).filter((n) => n === 'dispose' || n === 'forceContextLoss');
  assert.deepEqual(names, ['dispose', 'forceContextLoss']);
});

test('the renderer is sized only when the size or pixel ratio changes', async () => {
  const seen = { observer: null };
  globalThis.ResizeObserver = class {
    constructor(fn) { seen.observer = fn; }
    observe() {}
    disconnect() {}
  };
  const oldRatio = globalThis.devicePixelRatio;
  const flight = await exampleFlight();
  const k = await open({ flight, t: flight.startT + START_S });
  try {
    const r = k.renderer();
    assert.deepEqual([r.count('setSize'), r.count('setPixelRatio')], [1, 1]);
    for (let i = 0; i < 3; i++) {
      k.time.t += 10;
      k.view.requestDraw();
      await k.settle();
    }
    assert.deepEqual([r.count('setSize'), r.count('setPixelRatio')], [1, 1], 'more draws at the same size: no change');
    k.canvas.clientWidth = 640;
    seen.observer();
    await k.settle();
    assert.deepEqual([r.count('setSize'), r.count('setPixelRatio')], [2, 1], 'a new size sets the size only');
    assert.deepEqual(r.calls.filter((c) => c[0] === 'setSize').at(-1), ['setSize', 640, 600]);
    globalThis.devicePixelRatio = 2;
    k.view.requestDraw();
    await k.settle();
    assert.equal(r.count('setPixelRatio'), 2);
    assert.equal(r.calls.filter((c) => c[0] === 'setPixelRatio').at(-1)[1], 2);
  } finally {
    k.close();
    delete globalThis.ResizeObserver;
    if (oldRatio === undefined) delete globalThis.devicePixelRatio;
    else globalThis.devicePixelRatio = oldRatio;
  }
});

// When 3D can't start: say so and stay in 2D (D141).

test('with no WebGL the view says so, and never builds a renderer (no console error from three.js)', async () => {
  const restore = installFakeDocument();
  const asked = [];
  globalThis.document = { createElement: () => ({ ...fakeCanvas(), getContext(type) { asked.push(type); return null; } }) };
  const flight = await exampleFlight();
  const kit = await viewKit();
  FakeRenderer.all.length = 0;
  const said = [];
  const view = createView3d(kit.canvas, {
    timers: kit.timers, flight: () => flight, time: () => flight.startT + START_S, settings: () => kit.state, fieldFt: () => 0,
    setCamera() {}, loadThree: () => Promise.resolve(kit.THREE), onUnavailable: (m) => said.push(m),
  });
  try {
    kit.timers.flush();
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(said, ['3D needs WebGL 2, which this browser doesn\'t have or has turned off.']);
    assert.equal(FakeRenderer.all.length, 0, 'no WebGLRenderer was made');
    assert.deepEqual(asked, ['webgl2'], 'only WebGL 2 is asked for, as three.js needs it');
  } finally {
    view.dispose();
    restore();
  }
});

test('with WebGL the picture is built once, and the probe context is let go', async () => {
  const flight = await exampleFlight();
  const k = await open({ flight, t: flight.startT + START_S });
  try {
    assert.equal(FakeRenderer.all.length, 1);
    assert.equal(globalThis.document.made.filter((c) => c.getContext().calls.includes('loseContext')).length, 1);
  } finally {
    k.close();
  }
});
