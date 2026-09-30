// The SOF's own settings (SPEC-sof, "Settings"): plain values, no page. They
// sit behind the screen's one closed "SOF settings" menu (settings-view.js),
// and every one starts at its default.
//
// The stored settings are the two limit numbers; the trigger choice is read
// from them, so "Custom" appears by itself when a number is changed by hand
// (D111) and the label can never disagree with the check (D59).
import { triggerLimits, describeTrigger } from './waves.js';

const LOCAL = triggerLimits('local');

/**
 * ceilingFt, visSm: the home alternate trigger, Local (MTCA) 2000/3 to begin with (V6, D59, D111).
 * banner: the new-caution banner (V6's "New-alert caution box"), used from task 3.
 * lightningNm: the radius for lightning near home (V6's `lightningNm`), used from task 7.
 */
export const SETTINGS_DEFAULTS = Object.freeze({
  ceilingFt: LOCAL.ceilingFt,
  visSm: LOCAL.visSm,
  banner: true,
  lightningNm: 20,
});

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
  const view = (values) => ({ ...values, trigger: describeTrigger(values).id });
  return {
    get: () => view(settings.get()),
    update(patch = {}) {
      const { trigger, ...rest } = patch;
      settings.update({ ...rest, ...(PRESETS.has(trigger) ? triggerLimits(trigger) : {}) });
    },
    subscribe: (fn) => settings.subscribe((values) => fn(view(values))),
  };
}
