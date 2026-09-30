// Inputs bound to settings, so math reads settings and never input boxes.
// Each control writes its setting when the value is good and follows the
// setting when something else changes it. See specs/SPEC-ui-kit.md.
import { h } from './dom.js';

let nextId = 1;
const newId = (kind) => `ctl-${kind}-${nextId++}`;

const formatNumber = (n) => n.toLocaleString('en-CA', { maximumFractionDigits: 6 });

// options: [[value, label], …] or [{ value, label }, …]
const normalise = (options) => options.map((o) => (Array.isArray(o) ? { value: o[0], label: o[1] } : o));

// settings: { get, update, subscribe }, such as storage/settings.js
export function createControls(settings) {
  const syncs = new Set();
  const byKey = new Map(); // setting key → the inputs (or fieldsets) bound to it
  let unsubscribe = null;

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

  return {
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
      const unitText = unit ? ` ${unit}` : '';
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

    // Greys out every control bound to `key`, for example 3D-only options in 2D.
    // The setting keeps its value.
    setDisabled(key, disabled) {
      for (const el of byKey.get(key) ?? []) el.disabled = Boolean(disabled);
    },

    dispose() {
      unsubscribe?.();
      unsubscribe = null;
      syncs.clear();
      byKey.clear();
    },
  };
}
