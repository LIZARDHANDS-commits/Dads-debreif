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
import { ROUTES } from './data/routes.js';
import { VNC_ALIGN_LIMITS, VNC_DEFAULT_ALIGN } from './map2d/vnc.js';
import { ESRI_IMAGERY } from '../../ui-kit/map-tiles.js';
import { CAMERA_LIMITS } from './view3d/frame.js';
import { V6_CAMERA } from './view3d/scene.js';

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
  const canvas = h('canvas', { class: 'debrief-map debrief-2d' });
  const canvas3d = h('canvas', { class: 'debrief-map debrief-3d', hidden: true });
  // Esri's credit while its imagery shows, and why none shows when it can't load.
  const credit = h('p', { class: 'map-credit', hidden: true, 'aria-live': 'polite' });
  const empty = h('p', { class: 'debrief-empty' }, 'Load up to four track files, or the example flight, to start.');
  const fitButton = h('button', { type: 'button', class: 'button', disabled: true, onclick: () => handlers.fit?.() }, 'Fit');
  // A menu: a real button that opens a small panel over the map, and closes
  // again on Escape or a click elsewhere.
  function menu(label, id, children) {
    const button = h('button', { type: 'button', class: 'button menu-button', 'aria-expanded': 'false', 'aria-controls': id }, label);
    const body = h('div', { class: 'debrief-menu-body', id, hidden: true }, ...children);
    const wrap = h('div', { class: 'debrief-menu' }, button, body);
    const setOpen = (open) => {
      body.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
      // It ends above the map's bottom edge, so it never covers the playback
      // bar or a panel below the map; a longer menu scrolls.
      if (open) body.style.maxHeight = `${Math.max(160, mapWrap.getBoundingClientRect().bottom - body.getBoundingClientRect().top - 8)}px`;
    };
    button.addEventListener('click', () => setOpen(body.hidden));
    wrap.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || body.hidden) return;
      e.preventDefault();
      setOpen(false);
      button.focus();
    });
    listen(document, 'pointerdown', (e) => {
      if (!wrap.contains(e.target)) setOpen(false);
    });
    return { element: wrap, setOpen };
  }

  const resetLayout = () => h('button', { type: 'button', class: 'button', onclick: () => handlers.reset?.() }, 'Reset layout');
  const { nudgeNm: NUDGE, scalePct: SCALE } = VNC_ALIGN_LIMITS;
  const layersMenu = menu('Layers', 'debrief-layers', [
    controls.checkbox('satellite', { label: 'Satellite imagery' }),
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
    resetLayout(),
  ]);
  // Routes and VNC charts under the tracks, in a menu of their own so each stays short.
  const chartsMenu = menu('Routes and charts', 'debrief-charts', [
    controls.select('route', { label: 'Route', options: [{ value: '', label: 'None' }, ...ROUTES.map((r) => ({ value: r.name, label: r.name }))] }),
    controls.slider('routeOpacity', { label: 'Route opacity', min: 10, max: 100, step: 5, format: (v) => `${v}%` }),
    controls.select('vnc', { label: 'VNC chart', options: [
      { value: 'off', label: 'Off' },
      { value: 'south', label: 'South (Moose Jaw, Regina)' },
      { value: 'north', label: 'North (Saskatoon, Moose Jaw)' },
      { value: 'both', label: 'Both' },
    ] }),
    controls.slider('vncOpacity', { label: 'Chart opacity', min: 10, max: 100, step: 1, format: (v) => `${v}%` }),
    // V6's fine alignment, closed at first (R22).
    h(
      'details',
      { class: 'debrief-menu-wide' },
      h('summary', {}, 'Chart alignment'),
      h(
        'div',
        { class: 'debrief-menu-group' },
        controls.slider('vncEastNm', { label: 'East / West', min: NUDGE[0], max: NUDGE[1], format: (v) => `${v} NM` }),
        controls.slider('vncNorthNm', { label: 'North / South', min: NUDGE[0], max: NUDGE[1], format: (v) => `${v} NM` }),
        controls.slider('vncScalePct', { label: 'Chart scale', min: SCALE[0], max: SCALE[1], step: 0.1, format: (v) => `${Number(v).toFixed(1)}%` }),
        h('button', {
          type: 'button',
          class: 'button',
          onclick: () => layout.update({ vncEastNm: VNC_DEFAULT_ALIGN.nudgeEastNm, vncNorthNm: VNC_DEFAULT_ALIGN.nudgeNorthNm, vncScalePct: VNC_DEFAULT_ALIGN.scalePct }),
        }, 'Reset alignment'),
      ),
    ),
  ]);
  // Tools: each opens its own panel below the stage and closes it again (#37).
  const toolsMenu = menu('Tools', 'debrief-tools', [
    controls.checkbox('emOpen', { label: 'EM chart' }),
    controls.checkbox('tennisOpen', { label: 'Tennis ball' }),
  ]);

  // The EM chart's panel, below the stage so it never covers the map (#37).
  const emCanvas = h('canvas', { class: 'debrief-em-canvas' });
  const emNote = h('p', { class: 'debrief-em-note' });
  const emPanel = h(
    'section',
    { class: 'debrief-em', 'aria-label': 'EM chart', hidden: true },
    emCanvas,
    h(
      'div',
      { class: 'debrief-em-side' },
      h('h2', {}, 'EM chart'),
      controls.select('emChart', { label: 'Chart', options: [
        { value: 'auto', label: 'Nearest the formation' },
        { value: '6500', label: '6,500 ft' },
        { value: '8000', label: '8,000 ft' },
        { value: '13000', label: '13,000 ft' },
      ] }),
      controls.checkbox('emTrail', { label: 'Trail (60 s)' }),
      h('button', { type: 'button', class: 'button', onclick: () => layout.update({ emOpen: false }) }, 'Close EM chart'),
      emNote,
    ),
  );

  // The 3D view's settings, in 3D only (SPEC-debrief: The screen).
  const { yaw: YAW, pitch: PITCH, zoom: ZOOM } = CAMERA_LIMITS;
  const view3dMenu = menu('3D settings', 'debrief-3d-settings', [
    controls.select('cam3d', { label: 'Camera', options: [{ value: 'followLead', label: 'Follow Lead' }, { value: 'formation', label: 'Centre formation' }] }),
    controls.select('model3d', { label: 'Aircraft', options: [{ value: 't6', label: 'Low-poly T-6' }, { value: 'flat', label: 'Flat marker' }] }),
    controls.slider('yaw3d', { label: 'Turn', min: YAW[0], max: YAW[1], format: (v) => `${v}°` }),
    controls.slider('pitch3d', { label: 'Look down', min: PITCH[0], max: PITCH[1], format: (v) => `${v}°` }),
    controls.slider('zoom3d', { label: 'Zoom', min: ZOOM[0], max: ZOOM[1], format: (v) => String(Math.round(v)) }),
    controls.number('altScale3d', { label: 'Altitude ×', min: 1, max: 10, step: 0.25 }),
    controls.number('planeSize3d', { label: 'Aircraft size', unit: 'ft', min: 60, max: 2000, step: 20 }),
    controls.number('trailSec3d', { label: 'Trail length', unit: 's', min: 0, max: 600, step: 10 }),
    controls.select('datum3d', { label: 'Ground', options: [
      { value: 'min', label: 'Lowest ship − 500 ft' },
      { value: 'field', label: 'Home field elevation' },
      { value: 'zero', label: 'Sea level' },
    ] }),
    controls.checkbox('attLabels3d', { label: 'Bank and pitch' }),
    controls.checkbox('sticks3d', { label: 'Altitude sticks' }),
    controls.checkbox('altMarks3d', { label: 'Altitude scale' }),
    controls.checkbox('groundRef3d', { label: 'Compass' }),
    controls.checkbox('grid3d', { label: 'Ground grid' }),
    controls.checkbox('landscape3d', { label: 'Landscape' }),
    h('button', { type: 'button', class: 'button', onclick: () => layout.update({ yaw3d: V6_CAMERA.yawDeg, pitch3d: V6_CAMERA.pitchDeg, zoom3d: V6_CAMERA.zoom }) }, 'Reset view'),
    resetLayout(),
  ]);
  const viewSwitch = controls.choice('view', { label: 'View', options: [{ value: '2d', label: '2D' }, { value: '3d', label: '3D' }] });
  viewSwitch.classList.add('view-switch');
  const mapWrap = h('div', { class: 'debrief-map-wrap' }, canvas, canvas3d, empty, credit);
  const stage = h(
    'section',
    { class: 'debrief-stage', 'aria-label': 'Map and playback' },
    h('div', { class: 'debrief-toolbar' }, viewSwitch, fitButton, layersMenu.element, chartsMenu.element, view3dMenu.element, toolsMenu.element),
    mapWrap,
    bar.element,
    emPanel,
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

  // The lines under the map, satellite first.
  const notes = { imagery: '', charts: '' };
  function showNotes() {
    const text = [notes.imagery, notes.charts].filter(Boolean).join(' · ');
    if (credit.textContent !== text) credit.textContent = text;
    credit.hidden = !text;
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
    // One view shows at a time; the other's canvas and tools hide (R12).
    const is3d = values.view === '3d';
    canvas.hidden = is3d;
    canvas3d.hidden = !is3d;
    fitButton.hidden = is3d;
    layersMenu.element.hidden = is3d;
    chartsMenu.element.hidden = is3d;
    view3dMenu.element.hidden = !is3d;
    if (is3d) {
      layersMenu.setOpen(false);
      chartsMenu.setOpen(false);
    } else view3dMenu.setOpen(false);
    credit.classList.toggle('is-3d', is3d);
    emPanel.hidden = !values.emOpen;
    const open = values.statusDetails && Boolean(flight);
    statusDetails.hidden = !open;
    statusButton.setAttribute('aria-expanded', String(open));
  }

  readouts.render(null, null);
  applyLayout(layout.get());

  return {
    element,
    canvas,
    canvas3d,
    emCanvas,
    /** Says which chart the EM panel shows and how its numbers are found. */
    setEmChart(altitude) {
      const text = `${altitude.toLocaleString('en-US')} ft chart. IAS is estimated from ground speed (no wind); turn rate is from the track.`;
      if (emNote.textContent !== text) emNote.textContent = text;
    },
    summary: () => flightSummary(flight),
    showFlight(next) {
      flight = next;
      empty.hidden = Boolean(flight);
      fitButton.disabled = !flight;
      renderStatus();
      applyLayout(layout.get());
    },
    /** The satellite line under the map: Esri's credit, or that the imagery needs a connection. */
    setImagery(state) {
      notes.imagery = !state ? ''
        : state.wanted && state.failed === state.wanted ? 'Satellite imagery needs a connection. The grid still shows where things are.'
          : ESRI_IMAGERY.credit;
      showNotes();
    },
    /** The chart line under the map: loading, can't load, or "Not for navigation" (#43). */
    setCharts(state) {
      notes.charts = !state || !state.wanted ? ''
        : state.failed === state.wanted ? 'The VNC chart couldn\'t load. It needs a connection the first time it\'s shown.'
          : state.ready < state.wanted ? 'Loading the VNC chart…'
            : 'VNC chart: not for navigation. Its alignment is fitted by hand.';
      showNotes();
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
