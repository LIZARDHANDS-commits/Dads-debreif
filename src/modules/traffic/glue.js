// The small pieces between the screen's settings and the engine's setup (specs/SPEC-traffic.md:
// Route options, Conflict limits). Split out of index.js so they are tested on their own.
//
// The engine reads its limits and route options from the setup it flies (V6 keeps them
// there), so the screen copies its settings across whenever one changes. The numbers are
// checked against their ranges on the way: whatever a setting holds, the setup only gets a
// number the sim can use.
import { DEFAULTS, LIMITS } from './defaults.js';
import { fieldTempFor, setFieldTemperature } from './weather.js';

/**
 * A number held to its range; anything that is not a finite number becomes `fallback`.
 * @param {unknown} value
 * @param {readonly number[]} range [least, most]
 * @param {number} fallback
 */
export function within(value, range, fallback) {
  const [least, most] = range;
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(most, Math.max(least, value)) : fallback;
}

/**
 * Copies the traffic settings the engine reads into the setup: the conflict and caution
 * distances (`setup.conflictLimits`), the route options (`setup.routeOptions`), and wind.
 * @param {{ conflictLimits?: any, routeOptions?: any, windFromDeg?: number, windKt?: number, deconflict?: boolean, randomize?: boolean, randomizeSharePct?: number }} setup
 * @param {Record<string, any>} values the traffic settings (settings.get())
 */
export function applyToSetup(setup, values) {
  const distance = (key) => within(values[key], LIMITS[key], DEFAULTS[key]);
  setup.conflictLimits = {
    latFt: distance('conflictLatFt'),
    vertFt: distance('conflictVertFt'),
    cautionLatFt: distance('cautionLatFt'),
    cautionVertFt: distance('cautionVertFt'),
  };
  setup.deconflict = values.autoDeconflict === true;
  setup.randomize = values.randomizeBehaviour === true;
  setup.randomizeSharePct = within(values.randomizeSharePct, LIMITS.randomizeSharePct, DEFAULTS.randomizeSharePct);
  setup.routeOptions = {
    flyRoundedTurns: values.flyRoundedTurns === true,
    radiusFromG: values.radiusFromG === true,
    manualRadiusFt: within(values.manualRadiusFt, LIMITS.manualRadiusFt, DEFAULTS.manualRadiusFt),
    trueArcs: setup.routeOptions?.trueArcs !== false, // SMM true arcs: the standard overhead break and final turn, with or without wind
  };
  if (values.windFromDeg !== undefined) setup.windFromDeg = within(values.windFromDeg, LIMITS.windFromDeg, DEFAULTS.windFromDeg);
  if (values.windKt !== undefined) setup.windKt = within(values.windKt, LIMITS.windKt, DEFAULTS.windKt);
  // The day's temperature at the field (TR-77): a Weather preset, or the box when it is "Set the temperature".
  setup.fieldTempC = fieldTempFor(values.weather, within(values.fieldTempC, LIMITS.fieldTempC, DEFAULTS.fieldTempC));
  setFieldTemperature(setup.fieldTempC); // so the routes drawn before the next step use it too
}

/** The settings aren't remembered between visits yet (profiles are a later task), so they live in memory. */
export function memoryStore() {
  const docs = new Map();
  return { get: (name, fallback) => (docs.has(name) ? docs.get(name) : fallback), set: (name, value) => docs.set(name, value) };
}

/**
 * Wraps a frame's work so that if it throws, `pause()` runs first and the error is thrown again:
 * the bar never keeps saying Running over a sim that has stopped, and the error is not hidden.
 * @template {any[]} A
 * @param {(...args: A) => void} work
 * @param {() => void} pause
 * @returns {(...args: A) => void}
 */
export function pauseOnThrow(work, pause) {
  return (...args) => {
    try {
      work(...args);
    } catch (err) {
      pause();
      throw err;
    }
  };
}
