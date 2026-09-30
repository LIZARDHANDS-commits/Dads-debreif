// The Debrief settings menu (R22): the screen's one closed menu of tuning
// numbers, built on ui-kit's settings menu like every module's. It holds the
// standards (R18, D23): spread, offset and lead, each with an on/off box and
// its numbers, and a reset to the default preset (the SMM's numbers, D114 to
// D116). It edits the app's one shared copy (app.standards), which the Turn
// Sim reads too (D89). A value outside its limits is refused with a message
// under its box; the saved standard stays as it was. Only the latest refusal
// stays on screen: any edit clears the other boxes' messages, and their boxes
// show the kept value again.
import { h } from '../../ui-kit/dom.js';
import { createSettingsMenu } from '../../ui-kit/settings-menu.js';
import { standardsSummaryLines } from '../../core/standards.js';

const GROUPS = [
  { key: 'spread', title: 'Spread (every wingman)', on: 'Judge spread' },
  { key: 'offset', title: 'Offset (#3 aft of Lead)', on: 'Judge the offset' },
  { key: 'lead', title: 'Lead (est. IAS and G)', on: 'Judge Lead' },
];

let nextId = 1;

// Pairs that must not cross (src/storage/standards.js): each box's partner and
// how it must not compare with it. The storage reports a crossed pair under the
// lower box's path with words about the lower box, so a refused Spread maximum
// would carry a message about the minimum; both boxes are reworded here from
// their own side, with the partner's value.
const PARTNERS = {
  spread: {
    minFt: { key: 'maxFt', rule: 'more', words: 'the spread maximum' },
    maxFt: { key: 'minFt', rule: 'less', words: 'the spread minimum' },
    sweepMinDeg: { key: 'sweepMaxDeg', rule: 'more', words: 'the most sweep' },
    sweepMaxDeg: { key: 'sweepMinDeg', rule: 'less', words: 'the least sweep' },
  },
};
const withUnit = (value, unit) => `${value}${unit === '°' ? '' : ' '}${unit}`;

/**
 * standards: app.standards ({ get, limits, update, reset, subscribe }).
 * layout: the remembered layout settings (standardsOpen).
 * Returns { element, setCollapsed, dispose }.
 */
export function createStandardsPanel({ standards, layout }) {
  const menu = createSettingsMenu({
    title: 'Debrief settings',
    collapsed: !layout.get().standardsOpen,
    onToggle: (collapsed) => layout.update({ standardsOpen: !collapsed }),
    onReset: () => standards.reset(),
    resetLabel: 'Reset to the default standards',
  });
  menu.element.classList.add('standards-panel');
  const summary = h('ul', { class: 'detail-lines standards-summary', 'aria-label': 'Standards in use' });
  const boxes = []; // { group, key, input, message }

  /** A box as the saved standard has it: no message, no mark, the kept value. */
  function settle({ group, key, input, message }, values) {
    input.value = String(values[group][key]);
    input.setAttribute('aria-invalid', 'false');
    message.textContent = '';
  }

  /**
   * What to say under a refused box. A value inside the box's own limits that
   * is still refused can only have crossed its partner (the storage checks the
   * order only when every value is in range).
   */
  function refusal(group, key, limit, value, result) {
    const kept = `Kept ${withUnit(standards.get()[group][key], limit.unit)}.`;
    const partner = PARTNERS[group]?.[key];
    if (partner && Number.isFinite(value) && value >= limit.min && value <= limit.max) {
      const other = standards.limits[group][partner.key];
      return `${limit.label} must not be ${partner.rule} than ${partner.words} (${withUnit(standards.get()[group][partner.key], other.unit)}). ${kept}`;
    }
    const problem = result.errors.find((e) => e.path === `${group}.${key}`) ?? result.errors[0];
    return `${problem.message} ${kept}`;
  }
  const switches = []; // { group, input }

  menu.body.append(summary);
  for (const { key: group, title, on } of GROUPS) {
    const id = `std-${nextId++}`;
    const toggle = h('input', { type: 'checkbox', id: `${id}-on` });
    toggle.addEventListener('change', () => standards.update({ [group]: { on: toggle.checked } }));
    switches.push({ group, input: toggle });
    const fields = Object.entries(standards.limits[group]).map(([key, limit]) => {
      const inputId = `${id}-${key}`;
      const message = h('span', { class: 'control-message', id: `${inputId}-message`, 'aria-live': 'polite' });
      const input = h('input', {
        type: 'number', id: inputId, min: String(limit.min), max: String(limit.max), step: String(limit.step),
        'aria-describedby': message.id,
      });
      input.addEventListener('change', () => {
        const text = input.value.trim();
        const value = text === '' ? NaN : Number(text);
        // An earlier refusal on another box is over: back to the kept value, no message.
        for (const other of boxes) if (other.input !== input) settle(other, standards.get());
        const result = standards.update({ [group]: { [key]: value } });
        input.setAttribute('aria-invalid', String(!result.ok));
        message.textContent = result.ok ? '' : refusal(group, key, limit, value, result);
      });
      boxes.push({ group, key, input, message });
      return h(
        'div',
        { class: 'control control-number' },
        h('label', { for: inputId }, limit.label),
        input,
        h('span', { class: 'control-unit' }, limit.unit),
        message,
      );
    });
    const section = menu.section(title);
    section.classList.add('standards-group');
    section.append(h('div', { class: 'control control-checkbox' }, toggle, h('label', { for: toggle.id }, on)), ...fields);
  }

  function sync(values) {
    summary.replaceChildren(...standardsSummaryLines(values).map((line) => h('li', {}, line)));
    if (!summary.children.length) summary.append(h('li', {}, 'All standards are off: no labels are shown.'));
    for (const { group, input } of switches) input.checked = values[group].on;
    for (const box of boxes) settle(box, values);
  }
  sync(standards.get());
  const stop = standards.subscribe(sync);

  return {
    element: menu.element,
    setCollapsed: menu.setCollapsed,
    dispose: stop,
  };
}
