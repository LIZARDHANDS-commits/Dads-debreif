// The SOF's own settings (SPEC-sof, "Settings"): plain values, no page. They
// sit behind the screen's one closed "SOF settings" menu (settings-view.js),
// and every one starts at its default.
//
// The stored settings are the two limit numbers; the trigger choice is read
// from them, so "Custom" appears by itself when a number is changed by hand
// (D111) and the label can never disagree with the check (D59).
//
// A hand-typed limit snaps UP to its step (ceiling to 100 ft, visibility to a
// quarter mile), the safe side: a higher limit calls for an alternate sooner.
// What is stored, shown and checked is always the snapped number.
import { createSettings } from '../../storage/settings.js';
import { triggerLimits, describeTrigger } from './waves.js';
import { trafficUrl } from './traffic.js';
import { CROSSWIND_DEFAULTS, RUNWAY_STATES } from './crosswind.js';
import { AREA_CHOICES_NM, DEFAULT_AREA_NM } from './scene3d-model.js';

const LOCAL = triggerLimits('local');

/**
 * ceilingFt, visSm: the home alternate trigger, Local (MTCA) 2000/3 to begin with (V6, D59, D111).
 * banner: the new-caution banner (V6's "New-alert caution box"); its switch is in the menu (task 3).
 * lightningNm: the radius for lightning near home (V6's `lightningNm`), used from task 7.
 * trafficRelay: the address of our traffic relay (SPEC-sof, Live traffic layer); empty, so the Traffic layer is hidden.
 * heightScale3d: how many times taller than the ground the 3D view draws heights (SOF-39); 5 is an estimate for readability, not from a source.
 */
export const SETTINGS_DEFAULTS = Object.freeze({
  ceilingFt: LOCAL.ceilingFt,
  visSm: LOCAL.visSm,
  banner: true,
  lightningNm: 20,
  trafficRelay: '',
  heightScale3d: 5,
});

/** The hint under the banner switch. Lightning near home is not on the airfield cards (it is not a report), so it says where it shows instead (F6). */
export const BANNER_HINT = 'The banner lists cautions you have not acknowledged. The airfield cards show every weather caution either way; lightning shows in the map strip.';

/** The longest relay address kept; anything longer is the default (empty). */
export const MAX_RELAY_CHARS = 200;

/** Whether the traffic relay's address is one the layer will use (https, or http on localhost; the origin alone). Empty is not. */
export const relayAccepted = (text) => typeof text === 'string' && trafficUrl({ baseUrl: text }) !== null;

// The ranges and steps from SPEC-sof, "Settings".
const RANGES = Object.freeze({
  ceilingFt: { min: 0, max: 10000, step: 100 },
  visSm: { min: 0, max: 10, step: 0.25 },
  lightningNm: { min: 5, max: 50, step: 1 },
  heightScale3d: { min: 1, max: 20, step: 1 }, // SOF-39: 1 to 20 times
});

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

// Rounds up to the step (a tiny allowance so 0.75 / 0.25 is 3, not 3.0000000000000004), then keeps it in range.
function snapUp(value, { min, max, step }, fallback) {
  if (!isNumber(value)) return fallback;
  const snapped = Math.ceil(value / step - 1e-9) * step;
  return Math.min(max, Math.max(min, Number(snapped.toFixed(2))));
}

/** A ceiling in feet, rounded up to 100 and kept from 0 to 10,000; not a number gives the default. */
export const snapCeiling = (ft) => snapUp(ft, RANGES.ceilingFt, SETTINGS_DEFAULTS.ceilingFt);
/** A visibility in statute miles, rounded up to a quarter and kept from 0 to 10; not a number gives the default. */
export const snapVisibility = (sm) => snapUp(sm, RANGES.visSm, SETTINGS_DEFAULTS.visSm);
/** { ceilingFt, visSm } as the check uses them. */
export const snapLimits = (limits) => ({ ceilingFt: snapCeiling(limits?.ceilingFt), visSm: snapVisibility(limits?.visSm) });

const inRange = (key, v) => isNumber(v) && v >= RANGES[key].min && v <= RANGES[key].max;

/**
 * Every setting checked: a number out of range or of the wrong type is the default,
 * a limit is snapped up to its step (unless `snap` is false, for a box being typed in),
 * and anything unknown is left out.
 */
export function cleanSettings(values, { snap = true } = {}) {
  const out = { ...SETTINGS_DEFAULTS };
  const v = values ?? {};
  if (inRange('ceilingFt', v.ceilingFt)) out.ceilingFt = snap ? snapCeiling(v.ceilingFt) : v.ceilingFt;
  if (inRange('visSm', v.visSm)) out.visSm = snap ? snapVisibility(v.visSm) : v.visSm;
  if (inRange('lightningNm', v.lightningNm)) out.lightningNm = v.lightningNm;
  if (inRange('heightScale3d', v.heightScale3d)) out.heightScale3d = v.heightScale3d;
  if (typeof v.banner === 'boolean') out.banner = v.banner;
  if (typeof v.trafficRelay === 'string' && v.trafficRelay.length <= MAX_RELAY_CHARS) out.trafficRelay = snap ? v.trafficRelay.trim() : v.trafficRelay;
  return Object.freeze(out);
}

/**
 * The SOF's settings on a storage scope: storage/settings.js with every value
 * checked on the way out (a stored 99999 is the default; a limit is snapped up) and
 * on the way in (a number out of range is dropped). { get, update, reset, subscribe }.
 *
 * `editing` is the same settings for the boxes in the menu: the same, except that a limit
 * is not snapped while it is being typed (snapping "2" to 100 would rewrite the box under
 * the fingers). The menu snaps it on commit, and everything else reads the snapped `get`.
 */
export function createSofSettings(store) {
  const inner = createSettings(store, SETTINGS_DEFAULTS);
  const update = (patch = {}) => {
    const next = {};
    for (const [key, value] of Object.entries(patch)) {
      if (key in RANGES) {
        if (inRange(key, value)) next[key] = value;
      } else if (key === 'trafficRelay') {
        if (typeof value === 'string' && value.length <= MAX_RELAY_CHARS) next[key] = value;
      } else next[key] = value;
    }
    inner.update(next);
  };
  const editing = {
    get: () => cleanSettings(inner.get(), { snap: false }),
    update,
    subscribe: (fn) => inner.subscribe(() => fn(cleanSettings(inner.get(), { snap: false }))),
  };
  return {
    get: () => cleanSettings(inner.get()),
    update,
    reset: () => inner.reset(),
    subscribe: (fn) => inner.subscribe(() => fn(cleanSettings(inner.get()))),
    editing,
  };
}

// The words on the choice come from the numbers each one fills in.
export const TRIGGER_OPTIONS = Object.freeze(
  ['local', 'crossCountry'].map((id) => Object.freeze({ value: id, label: describeTrigger(triggerLimits(id)).label }))
    .concat([Object.freeze({ value: 'custom', label: 'Custom' })]),
);

const PRESETS = new Set(['local', 'crossCountry']);

/**
 * The settings as the menu's controls see them: the same values plus `trigger`
 * ('local', 'crossCountry' or 'custom'). Choosing a preset fills in both numbers;
 * choosing Custom does nothing, since Custom is only ever what the numbers say.
 * Returns { get, update, subscribe } like storage/settings.js, which is what createControls binds to.
 */
export function withTrigger(settings) {
  const view = (values) => ({ ...values, trigger: describeTrigger(snapLimits(values)).id });
  return {
    get: () => view(settings.get()),
    update(patch = {}) {
      const { trigger, ...rest } = patch;
      settings.update({ ...rest, ...(PRESETS.has(trigger) ? triggerLimits(trigger) : {}) });
    },
    subscribe: (fn) => settings.subscribe((values) => fn(view(values))),
  };
}

// ---- Crosswind levels and the runway state (SOF-R27, SOF-43) -------------------------------------------------------

/** Each crosswind level is a whole number of knots from 0 to 50 (an estimate of a sensible range: references, not walls). */
export const CROSSWIND_RANGE = Object.freeze({ min: 0, max: 50, step: 1 });
const XW_KEYS = Object.freeze(['xwAmberDryKt', 'xwAmberWetKt', 'xwAmberIcyKt', 'xwRedDryKt']);
const STATES = Object.freeze(RUNWAY_STATES.map((s) => s.value));
const xwInRange = (v) => isNumber(v) && v >= CROSSWIND_RANGE.min && v <= CROSSWIND_RANGE.max;

/** The crosswind settings checked: a level out of range or not a number is its default, a state not offered is Dry. */
export function cleanCrosswind(values) {
  const out = { ...CROSSWIND_DEFAULTS };
  const v = values ?? {};
  for (const key of XW_KEYS) if (xwInRange(v[key])) out[key] = v[key];
  if (STATES.includes(v.runwayState)) out.runwayState = v.runwayState;
  return Object.freeze(out);
}

/**
 * The crosswind levels and the runway state, kept in their own document in the SOF's storage ("crosswind"), apart from the settings above so those
 * stay as they were. { get, update, reset, subscribe } like createSofSettings; a number out of range is dropped on the way in and is the default on the way out.
 */
export function createCrosswindSettings(store) {
  // storage/settings.js keeps its values under one name; this one is "crosswind".
  const renamed = {
    get: (name, fallback) => store.get(name === 'settings' ? 'crosswind' : name, fallback),
    set: (name, value) => store.set(name === 'settings' ? 'crosswind' : name, value),
  };
  const inner = createSettings(renamed, CROSSWIND_DEFAULTS, { allowed: { runwayState: STATES } });
  return {
    get: () => cleanCrosswind(inner.get()),
    update(patch = {}) {
      const next = {};
      for (const [key, value] of Object.entries(patch)) {
        if (XW_KEYS.includes(key) ? xwInRange(value) : key === 'runwayState' && STATES.includes(value)) next[key] = value;
      }
      inner.update(next);
    },
    reset: () => inner.reset(),
    subscribe: (fn) => inner.subscribe(() => fn(cleanCrosswind(inner.get()))),
  };
}

// ---- The 3D view's cloud style (SOF-39; Fable review, 7 Oct) ----------------------------------------------------------

/**
 * How the 3D view draws the model's cloud: 'slabs' (the default: each stage as a slab with a base and a top per model column) or 'levels' (the old style: one flat
 * sheet at each pressure level's mean height). Kept behind the setting "3D cloud style" so the old sheets stay reachable.
 */
export const CLOUD_STYLES = Object.freeze([
  Object.freeze({ value: 'slabs', label: 'Slabs with a base and top' }),
  Object.freeze({ value: 'levels', label: 'One sheet per model level (old)' }),
]);
const STYLE_VALUES = Object.freeze(CLOUD_STYLES.map((s) => s.value));
/**
 * The 3D view's area (Dad, 8 Oct 2026): the square round home, 450 NM on a side by default (as before), or 600 or 900 NM to see further. The model clouds keep their
 * 13 x 13 points, so they are further apart on a bigger square (37.5, 50 or 75 NM); the 3D view's key says so.
 */
export const AREA_OPTIONS = Object.freeze(AREA_CHOICES_NM.map((nm) => Object.freeze({ value: nm, label: `${nm} NM${nm === DEFAULT_AREA_NM ? ' (default)' : ''}` })));
export const VIEW3D_DEFAULTS = Object.freeze({ cloudStyle3d: 'slabs', area3dNm: DEFAULT_AREA_NM });

/** The 3D view's settings checked: a style or an area not offered is the default. */
export function cleanView3d(values) {
  const v = values ?? {};
  return Object.freeze({
    cloudStyle3d: STYLE_VALUES.includes(v.cloudStyle3d) ? v.cloudStyle3d : VIEW3D_DEFAULTS.cloudStyle3d,
    area3dNm: AREA_CHOICES_NM.includes(v.area3dNm) ? v.area3dNm : VIEW3D_DEFAULTS.area3dNm,
  });
}

/**
 * The 3D view's cloud style and area, kept in their own document in the SOF's storage ("view3d"), apart from the settings above so those stay as they were (as the
 * crosswind settings are). { get, update, reset, subscribe } like createSofSettings; a value not offered is dropped on the way in and is the default on the way out.
 */
export function createView3dSettings(store) {
  const renamed = {
    get: (name, fallback) => store.get(name === 'settings' ? 'view3d' : name, fallback),
    set: (name, value) => store.set(name === 'settings' ? 'view3d' : name, value),
  };
  const inner = createSettings(renamed, VIEW3D_DEFAULTS, { allowed: { cloudStyle3d: [...STYLE_VALUES], area3dNm: [...AREA_CHOICES_NM] } });
  return {
    get: () => cleanView3d(inner.get()),
    update(patch = {}) {
      const next = {};
      if (STYLE_VALUES.includes(patch.cloudStyle3d)) next.cloudStyle3d = patch.cloudStyle3d;
      if (AREA_CHOICES_NM.includes(patch.area3dNm)) next.area3dNm = patch.area3dNm;
      if (Object.keys(next).length) inner.update(next);
    },
    reset: () => inner.reset(),
    subscribe: (fn) => inner.subscribe(() => fn(cleanView3d(inner.get()))),
  };
}
