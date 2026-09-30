// "Save, open, examples" in the Flight column (R17, R22, #28), closed at
// first: Save debrief, Open debrief, Close flight, and the four example
// track files as ordinary .kml downloads.
import { h } from '../../ui-kit/dom.js';
import { createPanel } from '../../ui-kit/panel.js';
import { EXAMPLE_FLIGHT } from '../../flight-data/examples.js';

/**
 * Offers `text` to the user as a file called `name`, through a download link
 * made for the moment. The browser decides where it goes. timers: the
 * module's scheduler scope, which frees the file's memory a little later.
 */
export function downloadText(name, text, type, timers) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = h('a', { href: url, download: name, hidden: true });
  document.body.append(link);
  link.click();
  link.remove();
  // Kept a few seconds so every browser has started the download first.
  timers.after(10_000, () => URL.revokeObjectURL(url));
}

/**
 * layout: the remembered layout settings (filesOpen). canExample: whether the
 * app serves the example files. on: { save(), open(file), close(), example(entry) }.
 * Returns { element, setCollapsed, setFlight(loaded), setBusy(busy) }.
 */
export function createFilePanel({ layout, canExample, on }) {
  const panel = createPanel({ title: 'Save, open, examples', collapsed: !layout.get().filesOpen, onToggle: (collapsed) => layout.update({ filesOpen: !collapsed }) });
  panel.element.classList.add('file-panel');

  const save = h('button', { type: 'button', class: 'button', disabled: true, onclick: () => on.save() }, 'Save debrief');
  const input = h('input', { type: 'file', class: 'visually-hidden', accept: '.json,application/json' });
  input.addEventListener('change', () => {
    const [file] = input.files;
    input.value = '';
    if (file) on.open(file);
  });
  const open = h('label', { class: 'button file-button' }, input, 'Open debrief');
  const close = h('button', { type: 'button', class: 'button', disabled: true, onclick: () => on.close() }, 'Close flight');
  const examples = EXAMPLE_FLIGHT.map((entry) =>
    h('li', {}, h('button', { type: 'button', class: 'link-button', disabled: !canExample, onclick: () => on.example(entry) }, entry.download)));

  panel.body.append(
    h('div', { class: 'debrief-actions' }, save, open, close),
    h('h3', {}, 'Example track files'),
    h('p', { class: 'debrief-hint' }, 'The example flight\'s four ForeFlight tracks, to try Load tracks with.'),
    h('ul', { class: 'example-files' }, examples),
  );

  return {
    element: panel.element,
    setCollapsed: panel.setCollapsed,
    setFlight(loaded) {
      save.disabled = !loaded;
      close.disabled = !loaded;
    },
    setBusy(busy) {
      input.disabled = busy;
      open.classList.toggle('is-disabled', busy);
    },
  };
}
