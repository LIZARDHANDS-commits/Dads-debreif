// The formation standards the debrief and the Turn Sim judge by (R18, D89).
// See specs/SPEC-shell.md ("app.standards").
//
// One shared copy, kept in the 'standards' storage scope. The SMM's values
// (core's DEFAULT_STANDARDS: D114, D115, D116) are the default preset and what
// reset() goes back to. Nothing here judges a position: core/standards.js does
// that with whatever get() returns, which has the same shape as
// DEFAULT_STANDARDS.
import { DEFAULT_STANDARDS } from '../core/standards.js';

const KEY = 'standards';
// Version 1 held V6's shape (fore/aft ± ft, one lead speed). A version 1 save
// falls back to the defaults whole: every save held every field, so keeping
// its values would keep V6's offset and fore/aft for anyone who ever saved.
const VERSION = 2;

function deepFreeze(value) {
  for (const inner of Object.values(value)) if (inner && typeof inner === 'object') deepFreeze(inner);
  return Object.freeze(value);
}

// V6's boxes had steps but no limits. These only keep out values no formation
// would use; they are not part of any standard, and the defaults sit inside.
export const STANDARD_LIMITS = deepFreeze({
  spread: {
    minFt: { label: 'Spread minimum', unit: 'ft', min: 0, max: 20000, step: 100 },
    maxFt: { label: 'Spread maximum', unit: 'ft', min: 0, max: 20000, step: 100 },
    sweepMinDeg: { label: 'Sweep, least', unit: '°', min: -10, max: 10, step: 1 },
    sweepMaxDeg: { label: 'Sweep, most', unit: '°', min: 0, max: 45, step: 1 },
  },
  offset: {
    aftTargetFt: { label: 'Offset aft target', unit: 'ft', min: 0, max: 30000, step: 100 },
    aftTolFt: { label: 'Offset aft tolerance', unit: 'ft', min: 0, max: 10000, step: 100 },
  },
  lead: {
    lowTargetKt: { label: 'Lead speed, low block', unit: 'kt', min: 100, max: 300, step: 5 },
    midTargetKt: { label: 'Lead speed, mid block', unit: 'kt', min: 100, max: 300, step: 5 },
    lowBlockTopFt: { label: 'Low block top', unit: 'ft', min: 0, max: 20000, step: 250 },
    speedTolKt: { label: 'Lead speed tolerance', unit: 'kt', min: 0, max: 100, step: 1 },
    targetG: { label: 'Lead target G', unit: 'G', min: 0, max: 7, step: 0.1 },
    gTol: { label: 'Lead G tolerance', unit: 'G', min: 0, max: 3, step: 0.05 },
  },
});

const GROUP_NAMES = { spread: 'Spread', offset: 'Offset', lead: 'Lead' };
const plain = (n) => n.toLocaleString('en-US');

function fieldError(group, key, value) {
  if (key === 'on') return typeof value === 'boolean' ? null : `${GROUP_NAMES[group]} on/off must be true or false.`;
  const limit = STANDARD_LIMITS[group][key];
  if (!limit) return `Unknown standard: ${group}.${key}.`;
  if (typeof value === 'number' && Number.isFinite(value) && value >= limit.min && value <= limit.max) return null;
  const unit = limit.unit === '°' ? '°' : ` ${limit.unit}`;
  return `${limit.label} must be between ${plain(limit.min)} and ${plain(limit.max)}${unit}.`;
}

/**
 * Every problem with a whole standards object, as [{ path, message }]; empty
 * when it can be used. Also for checking the standards in a debrief file.
 */
export function checkStandards(value) {
  if (!value || typeof value !== 'object') return [{ path: '', message: 'Standards are missing.' }];
  const errors = [];
  for (const key of Object.keys(value)) {
    if (!(key in DEFAULT_STANDARDS)) errors.push({ path: key, message: `Unknown standard: ${key}.` });
  }
  for (const [group, defaults] of Object.entries(DEFAULT_STANDARDS)) {
    const fields = value[group];
    if (!fields || typeof fields !== 'object') {
      errors.push({ path: group, message: `${GROUP_NAMES[group]} standard is missing.` });
      continue;
    }
    for (const key of new Set([...Object.keys(defaults), ...Object.keys(fields)])) {
      const message = fieldError(group, key, fields[key]);
      if (message) errors.push({ path: `${group}.${key}`, message });
    }
  }
  if (!errors.some((e) => e.path.startsWith('spread'))) errors.push(...spreadOrder(value.spread));
  return errors;
}

// Pairs in the spread group that must not cross.
function spreadOrder(spread) {
  const errors = [];
  if (spread.minFt > spread.maxFt) {
    errors.push({ path: 'spread.minFt', message: 'Spread minimum must not be more than the spread maximum.' });
  }
  if (spread.sweepMinDeg > spread.sweepMaxDeg) {
    errors.push({ path: 'spread.sweepMinDeg', message: 'Sweep, least must not be more than sweep, most.' });
  }
  return errors;
}

// Stored values are checked field by field; a bad one falls back to the default.
function clean(saved) {
  if (!saved || typeof saved !== 'object' || saved.version !== VERSION) return DEFAULT_STANDARDS;
  const raw = saved.standards && typeof saved.standards === 'object' ? saved.standards : {};
  const out = {};
  for (const [group, defaults] of Object.entries(DEFAULT_STANDARDS)) {
    const fields = raw[group] && typeof raw[group] === 'object' ? raw[group] : {};
    out[group] = { ...defaults };
    for (const key of Object.keys(defaults)) {
      if (key in fields && !fieldError(group, key, fields[key])) out[group][key] = fields[key];
    }
  }
  if (spreadOrder(out.spread).length) out.spread = { ...DEFAULT_STANDARDS.spread };
  return deepFreeze(out);
}

const same = (a, b) => Object.keys(a).every((g) => Object.keys(a[g]).every((k) => a[g][k] === b[g][k]));

/**
 * createStandards({ store }): `store` is a storage scope (src/storage).
 * get() returns a frozen object shaped like DEFAULT_STANDARDS, ready for core's
 * classifiers. update(patch) merges per group ({ spread: { minFt: 4500 } })
 * and saves only if every value passes; it returns { ok, errors }.
 */
export function createStandards({ store }) {
  let current = clean(store.get(KEY, null));
  const listeners = new Set();

  function save(next) {
    const changed = !same(next, current);
    current = next;
    store.set(KEY, { version: VERSION, standards: current });
    if (!changed) return;
    for (const fn of [...listeners]) {
      try {
        fn(current);
      } catch (err) {
        console.error('Standards listener failed:', err);
      }
    }
  }

  return {
    get: () => current,
    limits: STANDARD_LIMITS,
    check: checkStandards,
    update(patch = {}) {
      const next = { ...current };
      for (const [group, change] of Object.entries(patch ?? {})) {
        next[group] = change && typeof change === 'object' && current[group] ? { ...current[group], ...change } : change;
      }
      const errors = checkStandards(next);
      if (errors.length) return { ok: false, errors };
      save(deepFreeze(next));
      return { ok: true, errors: [] };
    },
    reset() {
      save(DEFAULT_STANDARDS);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
