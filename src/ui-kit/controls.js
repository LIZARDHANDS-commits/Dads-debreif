// Inputs bound to settings, so math reads settings and never input boxes.
// Each control writes its setting when the value is good and follows the
// setting when something else changes it. See specs/SPEC-ui-kit.md.
import { h } from './dom.js';

let nextId = 1;
const newId = (kind) => `ctl-${kind}-${nextId++}`;

const formatNumber = (n) => n.toLocaleString('en-CA', { maximumFractionDigits: 6 });

// options: [[value, label], …] or [{ value, label }, …]
const normalise = (options) => options.map((o) => (Array.isArray(o) ? { value: o[0], label: o[1] } : o));

/**
 * The 2D | 3D switch every simulator shares (D141): the Debrief, Turn Fight, Turn Sim and
 * Traffic (the SOF stays 2D). A module seeds its `view` setting with VIEW_DEFAULT and lists
 * VIEW_ALLOWED as that setting's allowed values, and puts `controls.viewSwitch()` on screen.
 */
export const VIEW_DEFAULT = '2d';
export const VIEW_ALLOWED = Object.freeze(['2d', '3d']);

// settings: { get, update, subscribe }, such as storage/settings.js
export function createControls(settings) {
  const syncs = new Set();
  const byKey = new Map(); // setting key → the inputs (or fieldsets) bound to it
  const invalidKeys = new Set(); // number boxes now showing a "not accepted" message
  const guards = new Set(); // () => void, re-run when invalidKeys changes
  let unsubscribe = null;

  const markInvalid = (key, invalid) => {
    if (invalid === invalidKeys.has(key)) return;
    if (invalid) invalidKeys.add(key);
    else invalidKeys.delete(key);
    for (const fn of guards) fn();
  };

  const register = (key, el) => {
    if (!byKey.has(key)) byKey.set(key, new Set());
    byKey.get(key).add(el);
  };

  function bind(sync) {
    syncs.add(sync);
    sync(settings.get());
    unsubscribe ??= settings.subscribe((values) => {
      for (const fn of syncs) fn(values);
    });
  }

  const field = (kind, label, input, ...extra) =>
    h('div', { class: `control control-${kind}` }, h('label', { for: input.id }, label), input, ...extra);

  const api = {
    // A number box: only finite numbers from min to max are accepted.
    number(key, { label, unit = '', min = -Infinity, max = Infinity, step = 'any' }) {
      const id = newId('number');
      const messageId = `${id}-message`;
      const input = h('input', {
        type: 'number',
        id,
        min: Number.isFinite(min) ? min : null,
        max: Number.isFinite(max) ? max : null,
        step,
        inputmode: 'decimal',
        'aria-describedby': messageId,
      });
      const message = h('span', { class: 'control-message', id: messageId });
      // Degrees sit on the number ("45°", "270°T"); other units take a space (TF3-9).
      const unitText = unit ? `${unit.startsWith('°') ? '' : ' '}${unit}` : '';
      const rule =
        Number.isFinite(min) && Number.isFinite(max)
          ? `Enter a number from ${formatNumber(min)} to ${formatNumber(max)}${unitText}.`
          : Number.isFinite(min)
            ? `Enter a number of at least ${formatNumber(min)}${unitText}.`
            : Number.isFinite(max)
              ? `Enter a number of at most ${formatNumber(max)}${unitText}.`
              : 'Enter a number.';

      const read = () => {
        if (input.validity?.badInput || input.value.trim() === '') return null;
        const n = Number(input.value);
        return Number.isFinite(n) && n >= min && n <= max ? n : null;
      };
      const setInvalid = (invalid) => {
        if (invalid) input.setAttribute('aria-invalid', 'true');
        else input.removeAttribute('aria-invalid');
        message.textContent = invalid ? rule : '';
        markInvalid(key, invalid);
      };

      // While typing, good values go straight to the setting; the message waits
      // for Enter or leaving the box, so "1" on the way to "1500" isn't an error.
      input.addEventListener('input', () => {
        const n = read();
        if (n === null) return;
        setInvalid(false);
        settings.update({ [key]: n });
      });
      input.addEventListener('change', () => setInvalid(read() === null));

      register(key, input);
      bind((values) => {
        const n = values[key];
        if (read() !== n) input.value = String(n);
        if (read() !== null) setInvalid(false);
      });
      return field('number', label, input, unit ? h('span', { class: 'control-unit' }, unit) : null, message);
    },

    // A slider with its value shown beside it.
    slider(key, { label, min, max, step = 1, format = String }) {
      const id = newId('slider');
      const input = h('input', { type: 'range', id, min, max, step });
      const output = h('output', { class: 'control-value', for: id });
      input.addEventListener('input', () => {
        const n = Number(input.value);
        if (Number.isFinite(n)) settings.update({ [key]: n });
      });
      register(key, input);
      bind((values) => {
        input.value = String(values[key]);
        output.textContent = format(values[key]);
      });
      return field('slider', label, input, output);
    },

    checkbox(key, { label }) {
      const id = newId('checkbox');
      const input = h('input', { type: 'checkbox', id });
      input.addEventListener('change', () => settings.update({ [key]: input.checked }));
      register(key, input);
      bind((values) => {
        input.checked = values[key] === true;
      });
      // The box comes first, as usual for a checkbox.
      return h('div', { class: 'control control-checkbox' }, input, h('label', { for: id }, label));
    },

    select(key, { label, options }) {
      const id = newId('select');
      const list = normalise(options);
      const input = h('select', { id }, list.map((o, i) => h('option', { value: String(i) }, o.label)));
      input.addEventListener('change', () => {
        const option = list[Number(input.value)];
        if (option) settings.update({ [key]: option.value });
      });
      register(key, input);
      bind((values) => {
        input.value = String(list.findIndex((o) => o.value === values[key]));
      });
      return field('select', label, input);
    },

    // A small set of buttons where one is chosen, such as 2D | 3D (radio buttons).
    choice(key, { label, options }) {
      const name = newId('choice');
      const list = normalise(options);
      const inputs = list.map((o) => {
        const input = h('input', { type: 'radio', name, value: String(o.value) });
        input.addEventListener('change', () => {
          if (input.checked) settings.update({ [key]: o.value });
        });
        return input;
      });
      bind((values) => {
        list.forEach((o, i) => {
          inputs[i].checked = o.value === values[key];
        });
      });
      const fieldset = h(
        'fieldset',
        { class: 'control control-choice' },
        h('legend', {}, label),
        list.map((o, i) => h('label', { class: 'choice-option' }, inputs[i], h('span', {}, o.label))),
      );
      register(key, fieldset);
      return fieldset;
    },

    // The shared 2D | 3D switch: a "View" choice with 2D then 3D, bound to `key` (default 'view').
    viewSwitch(key = 'view') {
      return api.choice(key, { label: 'View', options: [{ value: '2d', label: '2D' }, { value: '3d', label: '3D' }] });
    },

    // Greys out every control bound to `key`, for example 3D-only options in 2D.
    // The setting keeps its value. The whole control (label, box, unit) is
    // marked aria-disabled too, so contrast checks treat the dimmed text as
    // inactive, which WCAG 1.4.3 exempts.
    setDisabled(key, disabled) {
      for (const el of byKey.get(key) ?? []) {
        el.disabled = Boolean(disabled);
        const control = el.tagName === 'FIELDSET' ? el : el.parentNode;
        if (!control) continue;
        if (disabled) control.setAttribute('aria-disabled', 'true');
        else control.removeAttribute('aria-disabled');
      }
    },

    // The keys of number boxes now refusing what was typed (the setting keeps
    // its last good value meanwhile).
    invalid() {
      return [...invalidKeys];
    },

    // Turns `button` off while a number box it depends on refuses what was
    // typed, so an action never runs on a value the person can't see (TR-14).
    // keys: the settings it uses; leave it out to depend on every number box.
    // Returns a function that stops guarding (dispose also stops it).
    guard(button, keys = null) {
      const blocked = () => (keys ? keys.some((k) => invalidKeys.has(k)) : invalidKeys.size > 0);
      const sync = () => {
        button.disabled = blocked();
      };
      guards.add(sync);
      sync();
      return () => guards.delete(sync);
    },

    dispose() {
      unsubscribe?.();
      unsubscribe = null;
      syncs.clear();
      byKey.clear();
      guards.clear();
      invalidKeys.clear();
    },
  };
  return api;
}
