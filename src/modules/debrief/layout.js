// The debrief's screen (SPEC-debrief: The screen, R22): the Flight column,
// the stage (toolbar, map, playback bar) and the Formation column. Only the
// essentials show at first; the full status and the Layers menu open on
// request, and the columns collapse with a real button (#34, #35). All file
// content goes in as text (h, textContent), never as HTML.
import { h, clear } from '../../ui-kit/dom.js';
import { createPanel } from '../../ui-kit/panel.js';
import { SHIP_COLORS, OUTLINED_SHIPS, flightSummary, trackStatus, assignShips, setShip, shipName } from './state.js';
import { MAX_TRACKS } from '../../flight-data/load.js';
import { createReadoutsPanel } from './readouts-panel.js';
import { BUBBLE_MIN_FT, BUBBLE_MAX_FT } from './map2d/geometry.js';

function shipSwatch(slot) {
  const el = h('span', { class: `ship-swatch${OUTLINED_SHIPS.has(slot) ? ' is-outlined' : ''}`, 'aria-hidden': 'true' });
  el.style.setProperty('--ship', SHIP_COLORS[slot]); // through the CSSOM, which a style-src policy allows
  return el;
}

/**
 * listen: app.listen, so the page-wide listener ends when the debrief closes.
 * flightExtras: panels under the status in the Flight column (Save, open).
 * formationExtras: panels under the readouts in the Formation column (DFPs, Standards).
 */
export function createLayout({ layout, controls, bar, canExample, listen, flightExtras = [], formationExtras = [] }) {
  const handlers = {};
  let flight = null;

  // Flight column
  const fileInput = h('input', { type: 'file', class: 'visually-hidden', multiple: true, accept: '.kml,application/vnd.google-earth.kml+xml' });
  const loadLabel = h('label', { class: 'button primary file-button' }, fileInput, 'Load tracks');
  fileInput.addEventListener('change', () => {
    const files = [...fileInput.files];
    fileInput.value = ''; // so the same files can be picked again
    handlers.pick?.(files);
  });
  const exampleButton = h('button', { type: 'button', class: 'button', disabled: !canExample, onclick: () => handlers.example?.() }, 'Example flight');

  const picker = h('div', { class: 'debrief-picker', hidden: true });
  const busyLine = h('p', { class: 'debrief-busy', role: 'status' });
  const message = h('p', { class: 'debrief-message', role: 'alert', hidden: true });

  const statusButton = h('button', { type: 'button', class: 'flight-status', disabled: true, 'aria-expanded': 'false', 'aria-controls': 'debrief-status-details' });
  const statusText = h('span', {}, flightSummary(null));
  statusButton.append(statusText);
  statusButton.addEventListener('click', () => layout.update({ statusDetails: !layout.get().statusDetails }));
  const statusDetails = h('div', { class: 'status-details', id: 'debrief-status-details', hidden: true });

  const flightPanel = createPanel({ title: 'Flight', onToggle: (collapsed) => layout.update({ flightColumn: !collapsed }) });
  flightPanel.body.append(
    h('div', { class: 'debrief-actions' }, loadLabel, exampleButton),
    picker,
    busyLine,
    message,
    statusButton,
    statusDetails,
  );

  // Stage
  const canvas = h('canvas', { class: 'debrief-map' });
  const empty = h('p', { class: 'debrief-empty' }, 'Load up to four track files, or the example flight, to start.');
  const fitButton = h('button', { type: 'button', class: 'button', disabled: true, onclick: () => handlers.fit?.() }, 'Fit');
  // The Layers menu: a real button that opens a small panel over the map, and
  // closes again on Escape or a click elsewhere.
  const layersButton = h('button', { type: 'button', class: 'button menu-button', 'aria-expanded': 'false', 'aria-controls': 'debrief-layers' }, 'Layers');
  const layersBody = h(
    'div',
    { class: 'debrief-menu-body', id: 'debrief-layers', hidden: true },
    controls.select('trail', { label: 'Trail', options: [
      { value: 'full', label: 'Full tracks' },
      { value: 'history', label: 'History only' },
      { value: 'window', label: 'Last 60 s' },
    ] }),
    controls.checkbox('spacingLines', { label: 'Spacing lines' }),
    controls.checkbox('grid', { label: 'Grid (5,000 ft)' }),
    controls.checkbox('lead39', { label: 'Lead 3/9 line' }),
    controls.checkbox('three39', { label: '#3 3/9 line' }),
    controls.checkbox('cone', { label: 'Fighting-wing cone' }),
    controls.checkbox('clockMarks', { label: 'Clock marks' }),
    controls.checkbox('bubble', { label: 'Safety bubble' }),
    controls.number('bubbleFt', { label: 'Bubble radius', unit: 'ft', min: BUBBLE_MIN_FT, max: BUBBLE_MAX_FT, step: 50 }),
    controls.checkbox('followLead', { label: 'Follow Lead' }),
    h('button', { type: 'button', class: 'button', onclick: () => handlers.reset?.() }, 'Reset layout'),
  );
  const layersMenu = h('div', { class: 'debrief-menu' }, layersButton, layersBody);
  const setLayersOpen = (open) => {
    layersBody.hidden = !open;
    layersButton.setAttribute('aria-expanded', String(open));
  };
  layersButton.addEventListener('click', () => setLayersOpen(layersBody.hidden));
  layersMenu.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || layersBody.hidden) return;
    e.preventDefault();
    setLayersOpen(false);
    layersButton.focus();
  });
  listen(document, 'pointerdown', (e) => {
    if (!layersMenu.contains(e.target)) setLayersOpen(false);
  });
  const stage = h(
    'section',
    { class: 'debrief-stage', 'aria-label': 'Map and playback' },
    h('div', { class: 'debrief-toolbar' }, fitButton, layersMenu),
    h('div', { class: 'debrief-map-wrap' }, canvas, empty),
    bar.element,
  );

  // Formation column: the Formation card and More detail (readouts-panel.js).
  const readouts = createReadoutsPanel({ layout, swatch: shipSwatch });
  const formationPanel = createPanel({ title: 'Formation', onToggle: (collapsed) => layout.update({ formationColumn: !collapsed }) });
  formationPanel.body.append(readouts.element, ...formationExtras);

  flightPanel.body.append(...flightExtras);
  const flightCol = h('aside', { class: 'debrief-col debrief-col-flight', 'aria-label': 'Flight' }, flightPanel.element);
  const formationCol = h('aside', { class: 'debrief-col debrief-col-formation', 'aria-label': 'Formation' }, formationPanel.element);
  const element = h(
    'div',
    { class: 'debrief' },
    h('h1', { class: 'visually-hidden' }, 'Debrief Viewer'),
    flightCol,
    stage,
    formationCol,
  );

  function renderStatus() {
    statusText.textContent = flightSummary(flight);
    statusButton.disabled = !flight;
    clear(statusDetails);
    for (const s of trackStatus(flight)) {
      statusDetails.append(
        h('h3', {}, shipSwatch(s.slot), `#${s.slot} `, h('span', { class: 'ship-name' }, shipName(s.slot, s.name))),
        h('ul', {}, s.lines.map((line) => h('li', {}, line))),
      );
    }
  }

  // The picker: each chosen file gets a ship, #1 upward in the order picked,
  // and any can be changed; choosing a ship another file has swaps the two.
  function showPicker(files) {
    let rows = assignShips(files.map((f) => f.name));
    const render = () => {
      clear(picker);
      const table = h(
        'table',
        { class: 'picker-table' },
        h('caption', { class: 'visually-hidden' }, 'Ship for each file'),
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'File'), h('th', { scope: 'col' }, 'Ship'))),
        h(
          'tbody',
          {},
          rows.map((row, i) => {
            const select = h(
              'select',
              { 'aria-label': `Ship for ${row.name}` },
              Array.from({ length: MAX_TRACKS }, (_, k) => h('option', { value: String(k + 1), selected: row.slot === k + 1 }, `#${k + 1}`)),
            );
            select.addEventListener('change', () => {
              rows = setShip(rows, i, Number(select.value));
              render();
              picker.querySelectorAll('select')[i]?.focus();
            });
            return h('tr', {}, h('td', { class: 'ship-name' }, row.name), h('td', {}, select));
          }),
        ),
      );
      const load = h('button', { type: 'button', class: 'button primary', onclick: () => {
        const picked = rows.map((row, i) => ({ slot: row.slot, file: files[i] }));
        hidePicker();
        handlers.load?.(picked);
      } }, 'Load');
      const cancel = h('button', { type: 'button', class: 'button', onclick: hidePicker }, 'Cancel');
      picker.append(table, h('div', { class: 'debrief-actions' }, load, cancel));
    };
    render();
    picker.hidden = false;
    setMessage(null);
    picker.querySelector('select')?.focus();
  }

  function hidePicker() {
    picker.hidden = true;
    clear(picker);
  }

  function setMessage(text) {
    message.textContent = text ?? '';
    message.hidden = !text;
  }

  function applyLayout(values) {
    flightPanel.setCollapsed(!values.flightColumn);
    formationPanel.setCollapsed(!values.formationColumn);
    readouts.setCollapsed(!values.moreDetail);
    flightCol.classList.toggle('is-collapsed', !values.flightColumn);
    formationCol.classList.toggle('is-collapsed', !values.formationColumn);
    const open = values.statusDetails && Boolean(flight);
    statusDetails.hidden = !open;
    statusButton.setAttribute('aria-expanded', String(open));
  }

  readouts.render(null, null);
  applyLayout(layout.get());

  return {
    element,
    canvas,
    summary: () => flightSummary(flight),
    showFlight(next) {
      flight = next;
      empty.hidden = Boolean(flight);
      fitButton.disabled = !flight;
      renderStatus();
      applyLayout(layout.get());
    },
    /** Shows the readouts for the current time (at most 10 times a second while playing). */
    renderReadouts: (r) => readouts.render(r, flight),
    showPicker,
    setMessage,
    setBusy(what) {
      busyLine.textContent = what ? `${what}…` : '';
      exampleButton.disabled = Boolean(what) || !canExample;
      fileInput.disabled = Boolean(what);
      loadLabel.classList.toggle('is-disabled', Boolean(what));
    },
    applyLayout,
    onPick: (fn) => (handlers.pick = fn),
    onLoad: (fn) => (handlers.load = fn),
    onExample: (fn) => (handlers.example = fn),
    onFit: (fn) => (handlers.fit = fn),
    onReset: (fn) => (handlers.reset = fn),
  };
}
