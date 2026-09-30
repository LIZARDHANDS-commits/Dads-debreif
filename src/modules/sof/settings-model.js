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

const LOCAL = triggerLimits('local');

/**
 * ceilingFt, visSm: the home alternate trigger, Local (MTCA) 2000/3 to begin with (V6, D59, D111).
 * banner: the new-caution banner (V6's "New-alert caution box"), used from task 3.
 * lightningNm: the radius for lightning near home (V6's `lightningNm`), used from task 7.
 * trafficRelay: the address of our traffic relay (SPEC-sof, Live traffic layer); empty, so the Traffic layer is hidden.
 * The banner has no control until task 3; its default is kept here.
 */
export const SETTINGS_DEFAULTS = Object.freeze({
  ceilingFt: LOCAL.ceilingFt,
  visSm: LOCAL.visSm,
  banner: true,
  lightningNm: 20,
  trafficRelay: '',
});

/** The longest relay address kept; anything longer is the default (empty). */
export const MAX_RELAY_CHARS = 200;

/** Whether the traffic relay's address is one the layer will use (https, or http on localhost; the origin alone). Empty is not. */
export const relayAccepted = (text) => typeof text === 'string' && trafficUrl({ baseUrl: text }) !== null;

// The ranges and steps from SPEC-sof, "Settings".
const RANGES = Object.freeze({
  ceilingFt: { min: 0, max: 10000, step: 100 },
  visSm: { min: 0, max: 10, step: 0.25 },
  lightningNm: { min: 5, max: 50, step: 1 },
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
