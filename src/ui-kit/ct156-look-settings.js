// The CT-156's look settings (Patrick, 15 Oct 2026, "Yeah add em"): three sliders that change the model's paint live,
// with no reload and no new shader (ct156-blender.js reads them as uniforms and the normal pictures' strength):
// weathering (how far and how dark the painted soot, oil, edge wear and scuffs show), relief (the normal picture's
// strength: panel lines and rivets) and wear (the mesh's convex edges lightened toward worn paint, its hollows darkened).
// Saved in the browser with the graphics settings, the same for every view and module; Reset puts the defaults back.
// A picture only: no flight numbers.
import { h } from './dom.js';
import { browserStorage, createStore } from '../storage/store.js';

/**
 * The defaults: weathering medium 0.7 (3d-work ct156/pictures/stamp.json "strengths": light 0.35, medium 0.7, heavy
 * 1.0; medium until slice 4.3's pick), relief 1 and wear 1 (the strengths the pictures were baked for).
 */
export const CT156_LOOK_DEFAULTS = Object.freeze({ weathering: 0.7, relief: 1, wear: 1 });
/** Each slider's range and step (scratch/increment-4/app-additions.md). */
export const CT156_LOOK_RANGES = Object.freeze({
  weathering: Object.freeze({ min: 0, max: 1.5, step: 0.05, label: 'Weathering' }),
  relief: Object.freeze({ min: 0.4, max: 1.6, step: 0.05, label: 'Relief' }),
  wear: Object.freeze({ min: 0, max: 1.5, step: 0.05, label: 'Wear' }),
});

let store = null;
const saved = () => (store ??= createStore(browserStorage).scope('ct156'));
let look = null;
const listeners = new Set();

/** A whole look from any input: each value a finite number held to its range, or its default. */
function clean(input) {
  const out = {};
  for (const [k, r] of Object.entries(CT156_LOOK_RANGES)) {
    const v = Number(input?.[k]);
    out[k] = Number.isFinite(v) ? Math.min(r.max, Math.max(r.min, v)) : CT156_LOOK_DEFAULTS[k];
  }
  return out;
}

/** The look now: { weathering, relief, wear } (the saved one, or the defaults). */
export function getCt156Look() {
  look ??= clean(saved().get('look', CT156_LOOK_DEFAULTS));
  return { ...look };
}

/** Changes some of the look, saves it unless save is false, and tells every listener. Returns the look now. */
export function setCt156Look(patch, { save = true } = {}) {
  look = clean({ ...getCt156Look(), ...patch });
  if (save) saved().set('look', look);
  for (const fn of listeners) fn({ ...look });
  return { ...look };
}

/** Puts the defaults back (and saves them). */
export const resetCt156Look = () => setCt156Look(CT156_LOOK_DEFAULTS);

/** Calls fn with the look now and on every change; returns a function that stops it. */
export function onCt156Look(fn) {
  listeners.add(fn);
  fn(getCt156Look());
  return () => listeners.delete(fn);
}

/**
 * The three sliders and a "Reset to defaults" button, for a view's Graphics menu: each slider changes the look as it
 * moves and shows its value; they follow changes made elsewhere. Returns the element; `stop()` on it unhooks it.
 */
let made = 0; // each set of controls its own ids
export function ct156LookControls() {
  const inputs = {};
  const shown = {};
  made++;
  const rows = Object.entries(CT156_LOOK_RANGES).map(([k, r]) => {
    const id = `ct156-look-${k}-${made}`;
    inputs[k] = h('input', { type: 'range', id, min: String(r.min), max: String(r.max), step: String(r.step), 'aria-describedby': `${id}-value` });
    shown[k] = h('output', { id: `${id}-value`, for: id });
    inputs[k].addEventListener('input', () => setCt156Look({ [k]: Number(inputs[k].value) }));
    return h('div', { class: 'ct156-look-row' }, h('label', { for: id }, r.label), inputs[k], shown[k]);
  });
  const reset = h('button', { type: 'button', class: 'button ct156-look-reset' }, 'Reset to defaults');
  reset.addEventListener('click', () => resetCt156Look());
  const element = h('div', { class: 'ct156-look', role: 'group', 'aria-label': 'CT-156 look (3D)' }, ...rows, reset);
  const stop = onCt156Look((now) => {
    for (const k of Object.keys(inputs)) {
      inputs[k].value = String(now[k]);
      shown[k].textContent = now[k].toFixed(2);
    }
  });
  element.stop = stop;
  return element;
}
