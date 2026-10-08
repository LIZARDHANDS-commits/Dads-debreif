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
import { AREA_CHOICES_NM, DEFAULT_AREA_NM, TRAFFIC_DISPLAY_DEFAULTS, cleanTrafficDisplay, MOUSE_LEFT_CHOICES, DEFAULT_MOUSE_LEFT } from './scene3d-model.js';
import { cleanAirspaceHidden } from './airspace-filter.js';

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
/**
 * rainToGround3d: the radar blocks' faint rain curtains to the ground, on by default (Dad, 8 Oct 2026: the blocks sit in the cloud; the curtain keeps the rain reaching the ground).
 * approaches3d and approachField3d: the instrument approaches (Dad, 8 Oct 2026), off by default so the start view stays as it was, and the field they are drawn for:
 * 'home' (the default), 'all', or an alternate's ICAO (one not among the base's fields is read as home by the view).
 * approachRunway3d and approachRunways3d: which runways' approaches are drawn and checked (Dad, 8 Oct 2026: "The runway in use should load the directional
 * approaches"; runway-in-use.js): 'wind' (the default: the runway in use from each field's METAR wind) or 'all', and the runway ends chosen by hand per field,
 * { KSAT: '04' }, each overriding the choice for its field.
 * trafficIconSize, trafficTagSize, trafficTagShows, trafficNamesFor, trafficT6Tags: the Traffic display settings for the 2D layer and the 3D view (Dad, 8 Oct 2026:
 * "the callsign and aircraft display should be more customizable.. smaller icons... bigger text etc"), each starting at the look before them (scene3d-model.js
 * TRAFFIC_DISPLAY_DEFAULTS), so nothing changes until one is chosen.
 * mouseLeft3d: what a plain left-drag does in the 3D view (Dad, 8 Oct 2026: "i should be able to click and move around with the mouse"): 'move' (the default:
 * it slides the map, and a right-drag or Ctrl-drag turns it) or 'turn' (as before: a right-drag or Shift-drag slides it). scene3d-model.js `dragAction`.
 * airspaceHidden3d: the airspace hidden from the 3D picture in its Airspace tab, per base: { KDLF: { kinds: ['moa'], ids: ['R-6312'] } } (airspace-filter.js;
 * Dad, 8 Oct 2026: "hide certain airspace if needed in a tab somewhere"). Nothing hidden to begin with; the airspace log reads everything either way.
 */
export const VIEW3D_DEFAULTS = Object.freeze({
  cloudStyle3d: 'slabs', area3dNm: DEFAULT_AREA_NM, rainToGround3d: true, approaches3d: false, approachField3d: 'home', approachRunway3d: 'wind', approachRunways3d: Object.freeze({}),
  trafficIconSize: TRAFFIC_DISPLAY_DEFAULTS.iconSize, trafficTagSize: TRAFFIC_DISPLAY_DEFAULTS.tagSize, trafficTagShows: TRAFFIC_DISPLAY_DEFAULTS.tagShows,
  trafficNamesFor: TRAFFIC_DISPLAY_DEFAULTS.namesFor, trafficT6Tags: TRAFFIC_DISPLAY_DEFAULTS.t6Tags,
  mouseLeft3d: DEFAULT_MOUSE_LEFT, airspaceHidden3d: Object.freeze({}),
});

/** The "3D mouse" choice, in the menu's words. */
export const MOUSE_OPTIONS = Object.freeze([
  Object.freeze({ value: 'move', label: 'Left-drag moves the map (default)' }),
  Object.freeze({ value: 'turn', label: 'Left-drag turns the view (as before)' }),
]);

/** The Traffic display choices, in the menu's words (SOF settings, "Traffic display"). */
export const TRAFFIC_SIZE_OPTIONS = Object.freeze([
  Object.freeze({ value: 'small', label: 'Small' }),
  Object.freeze({ value: 'medium', label: 'Medium (default)' }),
  Object.freeze({ value: 'large', label: 'Large' }),
]);
export const TRAFFIC_TAG_SHOWS_OPTIONS = Object.freeze([
  Object.freeze({ value: 'callsign', label: 'Callsign' }),
  Object.freeze({ value: 'callsign-altitude', label: 'Callsign and altitude (default)' }),
  Object.freeze({ value: 'full', label: 'Callsign, altitude, speed and type' }),
]);
export const TRAFFIC_NAMES_FOR_OPTIONS = Object.freeze([
  Object.freeze({ value: 'all', label: 'All aircraft (default)' }),
  Object.freeze({ value: 't6-mil', label: 'T-6s and military only' }),
  Object.freeze({ value: 't6', label: 'T-6s only' }),
]);
const SIZE_VALUES = Object.freeze(TRAFFIC_SIZE_OPTIONS.map((o) => o.value));
const TAG_SHOWS_VALUES = Object.freeze(TRAFFIC_TAG_SHOWS_OPTIONS.map((o) => o.value));
const NAMES_FOR_VALUES = Object.freeze(TRAFFIC_NAMES_FOR_OPTIONS.map((o) => o.value));

/** The Traffic display settings from the "view3d" document's values, as the 2D layer and the 3D view take them (scene3d-model.js `cleanTrafficDisplay`). */
export const trafficDisplayOf = (values) => cleanTrafficDisplay({
  iconSize: values?.trafficIconSize, tagSize: values?.trafficTagSize, tagShows: values?.trafficTagShows, namesFor: values?.trafficNamesFor, t6Tags: values?.trafficT6Tags,
});
const APPROACH_FIELD_RE = /^(home|all|[A-Z][A-Z0-9]{3})$/;
const RUNWAY_MODE_VALUES = Object.freeze(['wind', 'all']);
const ICAO_RE = /^[A-Z][A-Z0-9]{3}$/;
const RUNWAY_END_RE = /^\d{1,2}[LCR]?$/;
/** At most this many fields keep a runway chosen by hand (an estimate: far more than a base and its alternates). */
const MANUAL_RUNWAYS_MAX = 40;

/** The runways chosen by hand, checked: { ICAO: end } with a real-looking ICAO and runway end each, at most MANUAL_RUNWAYS_MAX of them; anything else is dropped. */
export function cleanManualRunways(value) {
  const out = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return Object.freeze(out);
  for (const [icao, end] of Object.entries(value)) {
    if (Object.keys(out).length >= MANUAL_RUNWAYS_MAX) break;
    if (ICAO_RE.test(icao) && typeof end === 'string' && RUNWAY_END_RE.test(end)) out[icao] = end;
  }
  return Object.freeze(out);
}

/**
 * The 3D view's settings checked: a style or an area not offered is the default, Rain to ground is on unless it is false, the Approaches are off unless true, a Traffic
 * display or mouse choice not offered is its default, and the hidden airspace is cleaned (airspace-filter.js `cleanAirspaceHidden`).
 */
export function cleanView3d(values) {
  const v = values ?? {};
  return Object.freeze({
    cloudStyle3d: STYLE_VALUES.includes(v.cloudStyle3d) ? v.cloudStyle3d : VIEW3D_DEFAULTS.cloudStyle3d,
    area3dNm: AREA_CHOICES_NM.includes(v.area3dNm) ? v.area3dNm : VIEW3D_DEFAULTS.area3dNm,
    rainToGround3d: typeof v.rainToGround3d === 'boolean' ? v.rainToGround3d : VIEW3D_DEFAULTS.rainToGround3d,
    approaches3d: typeof v.approaches3d === 'boolean' ? v.approaches3d : VIEW3D_DEFAULTS.approaches3d,
    approachField3d: typeof v.approachField3d === 'string' && APPROACH_FIELD_RE.test(v.approachField3d) ? v.approachField3d : VIEW3D_DEFAULTS.approachField3d,
    approachRunway3d: RUNWAY_MODE_VALUES.includes(v.approachRunway3d) ? v.approachRunway3d : VIEW3D_DEFAULTS.approachRunway3d,
    approachRunways3d: cleanManualRunways(v.approachRunways3d),
    trafficIconSize: SIZE_VALUES.includes(v.trafficIconSize) ? v.trafficIconSize : VIEW3D_DEFAULTS.trafficIconSize,
    trafficTagSize: SIZE_VALUES.includes(v.trafficTagSize) ? v.trafficTagSize : VIEW3D_DEFAULTS.trafficTagSize,
    trafficTagShows: TAG_SHOWS_VALUES.includes(v.trafficTagShows) ? v.trafficTagShows : VIEW3D_DEFAULTS.trafficTagShows,
    trafficNamesFor: NAMES_FOR_VALUES.includes(v.trafficNamesFor) ? v.trafficNamesFor : VIEW3D_DEFAULTS.trafficNamesFor,
    trafficT6Tags: typeof v.trafficT6Tags === 'boolean' ? v.trafficT6Tags : VIEW3D_DEFAULTS.trafficT6Tags,
    mouseLeft3d: MOUSE_LEFT_CHOICES.includes(v.mouseLeft3d) ? v.mouseLeft3d : VIEW3D_DEFAULTS.mouseLeft3d,
    airspaceHidden3d: cleanAirspaceHidden(v.airspaceHidden3d),
  });
}

/**
 * The 3D view's cloud style, area and Rain to ground, kept in their own document in the SOF's storage ("view3d"), apart from the settings above so those stay as they were (as the
 * crosswind settings are). { get, update, reset, subscribe } like createSofSettings; a value not offered is dropped on the way in and is the default on the way out.
 */
export function createView3dSettings(store) {
  const renamed = {
    get: (name, fallback) => store.get(name === 'settings' ? 'view3d' : name, fallback),
    set: (name, value) => store.set(name === 'settings' ? 'view3d' : name, value),
  };
  const inner = createSettings(renamed, VIEW3D_DEFAULTS, {
    allowed: {
      cloudStyle3d: [...STYLE_VALUES], area3dNm: [...AREA_CHOICES_NM], approachRunway3d: [...RUNWAY_MODE_VALUES],
      trafficIconSize: [...SIZE_VALUES], trafficTagSize: [...SIZE_VALUES], trafficTagShows: [...TAG_SHOWS_VALUES], trafficNamesFor: [...NAMES_FOR_VALUES],
      mouseLeft3d: [...MOUSE_LEFT_CHOICES],
    },
  });
  return {
    get: () => cleanView3d(inner.get()),
    update(patch = {}) {
      const next = {};
      if (STYLE_VALUES.includes(patch.cloudStyle3d)) next.cloudStyle3d = patch.cloudStyle3d;
      if (AREA_CHOICES_NM.includes(patch.area3dNm)) next.area3dNm = patch.area3dNm;
      if (typeof patch.rainToGround3d === 'boolean') next.rainToGround3d = patch.rainToGround3d;
      if (typeof patch.approaches3d === 'boolean') next.approaches3d = patch.approaches3d;
      if (typeof patch.approachField3d === 'string' && APPROACH_FIELD_RE.test(patch.approachField3d)) next.approachField3d = patch.approachField3d;
      if (RUNWAY_MODE_VALUES.includes(patch.approachRunway3d)) next.approachRunway3d = patch.approachRunway3d;
      if (patch.approachRunways3d && typeof patch.approachRunways3d === 'object') next.approachRunways3d = cleanManualRunways(patch.approachRunways3d);
      if (SIZE_VALUES.includes(patch.trafficIconSize)) next.trafficIconSize = patch.trafficIconSize;
      if (SIZE_VALUES.includes(patch.trafficTagSize)) next.trafficTagSize = patch.trafficTagSize;
      if (TAG_SHOWS_VALUES.includes(patch.trafficTagShows)) next.trafficTagShows = patch.trafficTagShows;
      if (NAMES_FOR_VALUES.includes(patch.trafficNamesFor)) next.trafficNamesFor = patch.trafficNamesFor;
      if (typeof patch.trafficT6Tags === 'boolean') next.trafficT6Tags = patch.trafficT6Tags;
      if (MOUSE_LEFT_CHOICES.includes(patch.mouseLeft3d)) next.mouseLeft3d = patch.mouseLeft3d;
      if (patch.airspaceHidden3d && typeof patch.airspaceHidden3d === 'object') next.airspaceHidden3d = cleanAirspaceHidden(patch.airspaceHidden3d);
      if (Object.keys(next).length) inner.update(next);
    },
    reset: () => inner.reset(),
    subscribe: (fn) => inner.subscribe(() => fn(cleanView3d(inner.get()))),
  };
}
