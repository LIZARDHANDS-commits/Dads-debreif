// "Save, open, CSV" in the Flight column (R17, R22, #28), closed at
// first: Save debrief, Open debrief, Export CSV, Close flight, and the four
// example track files as ordinary .kml downloads.
import { h } from '../../ui-kit/dom.js';
import { createPanel } from '../../ui-kit/panel.js';
import { EXAMPLE_FLIGHT } from '../../flight-data/examples.js';

/**
 * layout: the remembered layout settings (filesOpen). canExample: whether the
 * app serves the example files. on: { save(), open(file), csv(), close(), example(entry) }.
 * Returns { element, setCollapsed, setFlight(loaded), setBusy(busy) }.
 */
export function createFilePanel({ layout, canExample, on }) {
  const panel = createPanel({ title: 'Save, open, CSV', collapsed: !layout.get().filesOpen, onToggle: (collapsed) => layout.update({ filesOpen: !collapsed }) });
  panel.element.classList.add('file-panel');

  const save = h('button', { type: 'button', class: 'button', disabled: true, onclick: () => on.save() }, 'Save debrief');
  const input = h('input', { type: 'file', class: 'visually-hidden', accept: '.json,application/json' });
  input.addEventListener('change', () => {
    const [file] = input.files;
    input.value = '';
    if (file) on.open(file);
  });
  const open = h('label', { class: 'button file-button' }, input, 'Open debrief');
  const csv = h('button', { type: 'button', class: 'button', disabled: true, onclick: () => on.csv() }, 'Export CSV');
  const close = h('button', { type: 'button', class: 'button', disabled: true, onclick: () => on.close() }, 'Close flight');
  const examples = EXAMPLE_FLIGHT.map((entry) =>
    h('li', {}, h('button', { type: 'button', class: 'link-button', disabled: !canExample, onclick: () => on.example(entry) }, entry.download)));

  panel.body.append(
    h('div', { class: 'debrief-actions' }, save, open, csv, close),
    h('p', { class: 'debrief-hint' }, 'Export CSV: one row a second, every aircraft side by side, for a spreadsheet.'),
    h('h3', {}, 'Example track files'),
    h('p', { class: 'debrief-hint' }, 'The example flight\'s four ForeFlight tracks, to try Load tracks with.'),
    h('ul', { class: 'example-files' }, examples),
  );

  return {
    element: panel.element,
    setCollapsed: panel.setCollapsed,
    setFlight(loaded) {
      save.disabled = !loaded;
      csv.disabled = !loaded;
      close.disabled = !loaded;
    },
    setBusy(busy) {
      input.disabled = busy;
      open.classList.toggle('is-disabled', busy);
    },
  };
}
