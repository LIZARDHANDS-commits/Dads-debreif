// A page-free stand-in for the 3D view's surroundings, so view.js runs in Node:
// a fake canvas and document, a scheduler that runs frames when asked, a fake
// WebGL renderer that counts its calls (three itself is the real module, from
// node_modules; tests only), and a recording 2D context.
import { readFileSync } from 'node:fs';
import { loadExampleFlight } from '../../../src/flight-data/examples.js';
import { resetWebglCheck } from '../../../src/ui-kit/three-aircraft.js';

/** A 2D context that records the text it is asked to draw; every other call does nothing. */
export function recordingContext() {
  const texts = [];
  const calls = [];
  return new Proxy({ texts, calls }, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === 'fillText' || k === 'strokeText') return (text) => o.texts.push({ kind: k, text });
      if (k === 'getExtension') return () => ({ loseContext: () => calls.push('loseContext') });
      return () => {
        calls.push(k);
        return { addColorStop() {}, width: 0 }; // a gradient or measured text, should a caller want one
      };
    },
    set(o, k, v) {
      o[k] = v;
      return true;
    },
  });
}

/** Just the text strings filled, in order. */
export const drawn = (ctx) => ctx.texts.filter((t) => t.kind === 'fillText').map((t) => t.text);

export function fakeCanvas(ctx = recordingContext()) {
  const c = {
    width: 0, height: 0, clientWidth: 800, clientHeight: 600, className: '', tabIndex: 0, attrs: {},
    classList: { add() {}, remove() {} },
    after(el) { c.next = el; },
    remove() { c.removed = true; },
    setAttribute(k, v) { c.attrs[k] = v; },
    getContext() { return ctx; },
    addEventListener() {},
    removeEventListener() {},
    setPointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  };
  return c;
}

/** A renderer that counts what the view asks of it. */
export class FakeRenderer {
  static all = [];
  constructor() {
    this.calls = [];
    this.domElement = fakeCanvas();
    FakeRenderer.all.push(this);
  }
  count(name) { return this.calls.filter((c) => c[0] === name).length; }
  setClearColor() {}
  setPixelRatio(v) { this.calls.push(['setPixelRatio', v]); }
  setSize(w, h) { this.calls.push(['setSize', w, h]); }
  render(scene) {
    this.scene = scene;
    this.calls.push(['render']);
  }
  dispose() { this.calls.push(['dispose']); }
  forceContextLoss() { this.calls.push(['forceContextLoss']); }
}

/** The scheduler scope createCanvasSurface wants: frames wait until flush(). */
export function manualTimers() {
  let queue = [];
  return {
    frame(fn) {
      const entry = { fn, live: true };
      queue.push(entry);
      return () => { entry.live = false; };
    },
    flush() {
      const run = queue;
      queue = [];
      for (const e of run) if (e.live) e.fn();
    },
  };
}

/** The real three module with a fake renderer, a canvas, a scheduler and the layout values. */
export async function viewKit(settings = {}) {
  const realThree = await import('three');
  const made = { basic: [], line: [], standard: [] };
  // The materials the view makes itself are counted, and so are their disposals.
  const counted = (Base, list) => class extends Base {
    disposed = 0;
    constructor(...args) {
      super(...args);
      list.push(this);
    }
    dispose() {
      this.disposed++;
      super.dispose();
    }
  };
  const THREE = {
    ...realThree,
    WebGLRenderer: FakeRenderer,
    MeshBasicMaterial: counted(realThree.MeshBasicMaterial, made.basic),
    LineBasicMaterial: counted(realThree.LineBasicMaterial, made.line),
    MeshStandardMaterial: counted(realThree.MeshStandardMaterial, made.standard),
  };
  const ctx = recordingContext();
  const state = {
    view: '3d', cam3d: 'followLead', yaw3d: -35, pitch3d: 52, zoom3d: 70, altScale3d: 2, model3d: 't6', paint3d: 'harvard',
    planeSize3d: 240, attLabels3d: true, trailSec3d: 0, landscape3d: false, groundRef3d: false, datum3d: 'min',
    grid3d: false, sticks3d: true, altMarks3d: false, ...settings,
  };
  return { THREE, made, timers: manualTimers(), ctx, canvas: fakeCanvas(ctx), state };
}

const readAsset = async (asset) => readFileSync(new URL(`../../../original/assets/${asset}`, import.meta.url), 'utf8');

/** The example flight, with track `slot` losing its fixes from `fromT` to `toT` when given (a GPS gap there). */
export async function exampleFlight(slot = null, fromT = 0, toT = 0) {
  const flight = await loadExampleFlight(readAsset);
  if (slot !== null) flight.tracks[slot].fixes = flight.tracks[slot].fixes.filter((f) => f.t < fromT || f.t > toT);
  return flight;
}

/** Installs the fake document; returns a function that puts the old one back. */
export function installFakeDocument() {
  resetWebglCheck(); // ui-kit keeps the WebGL answer for the page; each test's fake document asks afresh
  const before = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const made = [];
  globalThis.document = {
    made,
    createElement() {
      const c = fakeCanvas();
      made.push(c);
      return c;
    },
  };
  return () => {
    resetWebglCheck();
    if (before) Object.defineProperty(globalThis, 'document', before);
    else delete globalThis.document;
  };
}
