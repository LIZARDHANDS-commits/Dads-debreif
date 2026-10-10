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
import { CATALOG } from '../../airfields/catalog.js';
import { SATELLITE_LAYERS } from './weather/satellite.js';
import { WIND_MODELS } from './weather/winds.js';
import { ARROW_HEIGHT, clampArrowFt } from './weather/wind-arrows.js';
import { PAINT_OPTIONS } from '../../ui-kit/ct156-model.js';
import { createCameraBar } from './view3d/camera-bar.js';
import { ridesShip } from './view3d/camera-modes.js';
import { hiddenKinds, withKind } from './airspace.js';

const SAVE_WX_LABEL = 'Save radar and lightning with this debrief';
// DB-24: the ground drawn at the lowest ship less 500 ft hides the airspace and runways under it.
const GROUND_HIDES_WORDS = 'Airspace and airfields under the ground drawn (lowest ship − 500 ft) are hidden by it. Ground: Home field elevation shows them all.';
// What the button does, said once for a screen reader and as the button's tooltip, so the menu's own line can stay one line (F1).
const SAVE_WX_EXPLAIN = 'This fetches every picture from the flight and keeps them in the debrief file.';

/** A ship's colour swatch (its number always goes beside it). */
export function shipSwatch(slot) {
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
  let fillInfo = null; // the gap fill's state for the status: { on, running, result } (DB-19)

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
  // Why 3D can't start: by the 2D | 3D switch that was pressed, not in the Flight column (RC-3).
  const viewMessage = h('p', { class: 'debrief-view-message', role: 'alert', hidden: true });

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
  const menus = [];
  function menu(label, id, children, { compact = false } = {}) {
    const button = h('button', { type: 'button', class: 'button menu-button', 'aria-expanded': 'false', 'aria-controls': id }, label);
    const body = h('div', { class: `debrief-menu-body${compact ? ' is-compact' : ''}`, id, hidden: true }, ...children);
    const wrap = h('div', { class: 'debrief-menu' }, button, body);
    const setOpen = (open) => {
      body.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
      if (open) place();
    };
    // It stays over the map, as D183 asks from the 1280 px floor up: no wider than the map,
    // and opened leftward from its button when it would pass the map's right edge, so it
    // never scrolls the page sideways or covers a column. It ends above the map's bottom
    // edge, so it never covers the playback bar or a panel below the map; a longer menu scrolls.
    function place() {
      const map = mapWrap.getBoundingClientRect();
      body.style.left = '';
      body.style.maxWidth = `${Math.max(0, map.width)}px`;
      const box = body.getBoundingClientRect();
      const over = box.right - map.right;
      if (over > 0) body.style.left = `${-Math.min(over, Math.max(0, box.left - map.left))}px`;
      body.style.maxHeight = `${Math.max(160, map.bottom - box.top - 8)}px`;
    }
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
    menus.push({ body, place });
    return { element: wrap, setOpen };
  }

  const resetLayout = () => h('button', { type: 'button', class: 'button', onclick: () => handlers.reset?.() }, 'Reset layout');
  // Airspace and airfields round the flight (DB-24): the two switches, and under Airspace a closed "Airspace kinds" list
  // (each kind near the flight with its count, ticked when shown; the shared filter's kinds) and a line saying what is
  // drawn, loading, missing or why there is none. In both the Layers menu (2D) and 3D settings, as Fill GPS gaps is.
  const spaceBoxes = [];
  let spaceState = null;
  let spaceIds = 0; // each kind's tick gets its own id, for its label
  function spaceBox({ in3d = false } = {}) {
    const status = h('p', { class: 'debrief-menu-note', role: 'status', hidden: true });
    // In 3D, with the ground at the lowest ship less 500 ft, whatever is under that ground is hidden by it: said, with the way round it.
    const ground = in3d ? h('p', { class: 'debrief-menu-note', hidden: true }, GROUND_HIDES_WORDS) : null;
    const list = h('div', { class: 'debrief-menu-group debrief-space-kinds' });
    const kinds = h('details', { class: 'debrief-menu-wide', hidden: true }, h('summary', {}, 'Airspace kinds'), list);
    const box = h('div', { class: 'debrief-menu-wide debrief-menu-cell' },
      controls.checkbox('airspace', { label: 'Airspace' }),
      controls.checkbox('airfields', { label: 'Airfields' }),
      status,
      ...(ground ? [ground] : []),
      kinds);
    spaceBoxes.push({ status, list, kinds, ground });
    return box;
  }
  function renderSpace() {
    const on = layout.get();
    const st = spaceState;
    const hidden = new Set(hiddenKinds(on.airspaceHidden));
    const words = !st || !on.airspace ? '' : st.words;
    for (const box of spaceBoxes) {
      if (box.ground) box.ground.hidden = !st || st.status === 'none' || (!on.airspace && !on.airfields) || on.datum3d !== 'min' || ridesShip(on);
      if (box.status.textContent !== words) box.status.textContent = words;
      box.status.hidden = !words;
      const rows = on.airspace && st ? st.kinds : [];
      box.kinds.hidden = !rows.length;
      const key = rows.map((k) => `${k.key}:${k.count}:${hidden.has(k.key)}`).join();
      if (box.list.dataset.key === key) continue;
      box.list.dataset.key = key;
      clear(box.list);
      for (const k of rows) {
        spaceIds += 1;
        const id = `debrief-space-kind-${spaceIds}`;
        const input = h('input', { type: 'checkbox', id });
        input.checked = !hidden.has(k.key);
        input.addEventListener('change', () => layout.update({ airspaceHidden: withKind(layout.get().airspaceHidden, k.key, !input.checked) }));
        box.list.append(h('div', { class: 'control control-checkbox' }, input, h('label', { for: id }, `${k.words} (${k.count})`)));
      }
    }
  }
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
    controls.checkbox('fillGaps', { label: 'Fill GPS gaps (estimate)' }),
    spaceBox(),
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
  const WIND_MODEL_OPTIONS = [
    { value: 'hrdps', label: `${WIND_MODELS.hrdps.label} (Canada, from March 2023)` },
    { value: 'hrrr', label: `${WIND_MODELS.hrrr.label} (US, from 2018)` },
  ];
  // The wind arrows' small status line: how many points have a wind at the chosen height, or why none does.
  const windArrowStatus = h('p', { class: 'debrief-menu-note', role: 'status', id: 'debrief-wind-arrow-status', hidden: true });
  // The height box, read with the status line as well as its own range message.
  const windArrowHeight = controls.number('wxWindArrowFt', { label: 'Wind arrow height', unit: 'ft', min: ARROW_HEIGHT.min, max: ARROW_HEIGHT.max, step: ARROW_HEIGHT.step });
  const heightInput = windArrowHeight.querySelector('input');
  heightInput?.setAttribute('aria-describedby', `${heightInput.getAttribute('aria-describedby') ?? ''} ${windArrowStatus.id}`.trim());
  // A height between the 500 ft steps is drawn at the nearest step, so the box shows that step too
  // (verification re-check of #213, W2). Runs after the box has committed its own value.
  if (heightInput) {
    listen(heightInput, 'change', () => {
      const typed = layout.get().wxWindArrowFt;
      const used = clampArrowFt(typed);
      // Only when the box holds the saved value: a refused entry (over the top) keeps its warning,
      // not a part of it saved on the way ("3123" of "31234").
      if (Number(heightInput.value) !== typed) return;
      if (Number.isFinite(typed) && typed !== used) layout.update({ wxWindArrowFt: used });
    });
  }
  // Saved radar and lightning: the offer to fetch them, and what is kept or why not. The button is
  // Save while a fetch can start and Cancel while one is under way (setSavedWeather).
  let savedWxMode = 'hidden';
  const savedWxButton = h('button', {
    type: 'button', class: 'button', id: 'debrief-saved-wx', hidden: true,
    onclick: () => (savedWxMode === 'cancel' ? handlers.cancelWx : handlers.saveWx)?.(),
  }, SAVE_WX_LABEL);
  const savedWxExplain = h('span', { class: 'visually-hidden', id: 'debrief-saved-wx-explain' }, SAVE_WX_EXPLAIN);
  // The line shown updates with every picture and is not itself announced; a hidden live region beside
  // the map is told only at the start, about every 25 % and at the end (Y5).
  const savedWxStatus = h('p', { class: 'debrief-menu-note', id: 'debrief-saved-wx-status', tabindex: '-1', hidden: true });
  const savedWxLive = h('p', { class: 'visually-hidden', id: 'debrief-saved-wx-live', role: 'status' });
  savedWxButton.setAttribute('aria-describedby', `${savedWxStatus.id} ${savedWxExplain.id}`);
  savedWxButton.title = SAVE_WX_EXPLAIN;
  // Weather at the time of the flight: every item off at first (R22), and
  // fetched only while on (SPEC-debrief: Weather at the time of the flight).
  const weatherMenu = menu('Weather', 'debrief-weather', [
    controls.checkbox('wxMetar', { label: 'METAR' }),
    controls.select('wxMetarField', { label: 'METAR from', options: [
      { value: 'nearest', label: 'Nearest airfield' },
      ...Object.entries(CATALOG).map(([icao, f]) => ({ value: icao, label: `${icao} ${f.name}` })),
    ] }),
    // Each item with what belongs to it in the same cell, so the menu is as short as its rows (F1): the satellite's
    // opacity under its item, the radar offer's button and line together, the arrows' status under their item.
    h('div', { class: 'debrief-menu-cell' },
      controls.checkbox('wxSatellite', { label: 'Satellite (GOES-West)' }),
      controls.slider('wxSatelliteOpacity', { label: 'Satellite opacity', min: 10, max: 100, step: 5, format: (v) => `${v}%` })),
    controls.select('wxSatelliteLayer', { label: 'Satellite picture', options: Object.entries(SATELLITE_LAYERS).map(([value, l]) => ({ value, label: l.label })) }),
    controls.checkbox('wxRadar', { label: 'Radar' }),
    controls.checkbox('wxLightning', { label: 'Lightning' }),
    h('div', { class: 'debrief-menu-wide debrief-menu-cell' }, savedWxButton, savedWxExplain, savedWxStatus),
    controls.checkbox('wxWinds', { label: 'Winds aloft (model)' }),
    controls.select('wxWindModel', { label: 'Wind model', options: WIND_MODEL_OPTIONS }),
    h('div', { class: 'debrief-menu-cell' }, controls.checkbox('wxWindArrows', { label: 'Wind arrows (model)' }), windArrowStatus),
    windArrowHeight,
  ], { compact: true });
  // Tools: each opens its own panel below the stage and closes it again (#37).
  const toolsMenu = menu('Tools', 'debrief-tools', [
    controls.checkbox('tennisOpen', { label: 'Tennis ball' }),
  ]);

  // The 3D view's settings, in 3D only (SPEC-debrief: The screen). The camera itself (mount, aim, ship, seat) is the bar
  // over the picture (DB-22), not a setting here.
  const { yaw: YAW, pitch: PITCH, zoom: ZOOM } = CAMERA_LIMITS;
  const cameraBar = createCameraBar({ layout, listen });
  // In a ship's view (Cockpit or Chase) the picture is true scale (DB-21, DB-22): these settings do nothing there, so they hide.
  const notInCockpit = [];
  const outside = (el) => (notInCockpit.push(el), el);
  const view3dMenu = menu('3D settings', 'debrief-3d-settings', [
    controls.select('model3d', { label: 'Aircraft', options: [{ value: 't6', label: 'Harvard (CT-156)' }, { value: 'flat', label: 'Flat marker' }] }),
    controls.select('paint3d', { label: 'Paint', options: PAINT_OPTIONS.map((o) => ({ value: o.value, label: o.label })) }),
    outside(controls.slider('yaw3d', { label: 'Turn', min: YAW[0], max: YAW[1], format: (v) => `${v}°` })),
    outside(controls.slider('pitch3d', { label: 'Look down', min: PITCH[0], max: PITCH[1], format: (v) => `${v}°` })),
    outside(controls.slider('zoom3d', { label: 'Zoom', min: ZOOM[0], max: ZOOM[1], format: (v) => String(Math.round(v)) })),
    outside(controls.number('altScale3d', { label: 'Altitude ×', min: 1, max: 10, step: 0.25 })),
    outside(controls.number('planeSize3d', { label: 'Aircraft size', unit: 'ft', min: 60, max: 2000, step: 20 })),
    controls.number('trailSec3d', { label: 'Trail length', unit: 's', min: 0, max: 600, step: 10 }),
    outside(controls.select('datum3d', { label: 'Ground', options: [
      { value: 'min', label: 'Lowest ship − 500 ft' },
      { value: 'field', label: 'Home field elevation' },
      { value: 'zero', label: 'Sea level' },
    ] })),
    controls.checkbox('attLabels3d', { label: 'Bank and pitch' }),
    outside(controls.checkbox('sticks3d', { label: 'Altitude sticks' })),
    outside(controls.checkbox('altMarks3d', { label: 'Altitude scale' })),
    controls.checkbox('groundRef3d', { label: 'Compass' }),
    controls.checkbox('grid3d', { label: 'Ground grid' }),
    controls.checkbox('landscape3d', { label: 'Landscape' }),
    controls.checkbox('fillGaps', { label: 'Fill GPS gaps (estimate)' }),
    spaceBox({ in3d: true }),
    h('button', { type: 'button', class: 'button', onclick: () => layout.update({ yaw3d: V6_CAMERA.yawDeg, pitch3d: V6_CAMERA.pitchDeg, zoom3d: V6_CAMERA.zoom, headYaw3d: 0, headPitch3d: 0 }) }, 'Reset view'),
    resetLayout(),
  ]);
  const viewSwitch = controls.viewSwitch(); // 2D | 3D, as every simulator (D141)
  viewSwitch.classList.add('view-switch');
  // The METAR line under the playback bar, with the report as sent a click away.
  const metarText = h('span', { class: 'debrief-metar-text' });
  const metarRaw = h('code', { class: 'debrief-metar-raw' });
  const metarRawBox = h('details', { class: 'debrief-metar-details' }, h('summary', {}, 'Report as sent'), metarRaw);
  const metarLine = h('div', { class: 'debrief-metar', role: 'status', hidden: true }, metarText, metarRawBox);
  const mapWrap = h('div', { class: 'debrief-map-wrap' }, canvas, canvas3d, empty, credit, cameraBar.element);
  const toolbar = h('div', { class: 'debrief-toolbar' }, viewSwitch, viewMessage, fitButton, layersMenu.element, chartsMenu.element, weatherMenu.element, view3dMenu.element, toolsMenu.element);
  const stage = h(
    'section',
    { class: 'debrief-stage', 'aria-label': 'Map and playback' },
    toolbar,
    mapWrap,
    bar.element,
    metarLine,
    savedWxLive,
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
    statusText.textContent = flightSummary(flight, fillInfo);
    statusButton.disabled = !flight;
    clear(statusDetails);
    for (const s of trackStatus(flight, fillInfo)) {
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
  const notes = { imagery: '', charts: '', weather: '', saved: '', arrows: '' };
  function showNotes() {
    const text = [notes.imagery, notes.charts, notes.weather, notes.saved, notes.arrows].filter(Boolean).join(' · ');
    if (credit.textContent !== text) credit.textContent = text;
    credit.hidden = !text;
  }

  function setMessage(text) {
    message.textContent = text ?? '';
    message.hidden = !text;
  }

  function setViewMessage(text) {
    const next = text ?? '';
    if (viewMessage.textContent !== next) viewMessage.textContent = next;
    if (viewMessage.hidden === Boolean(next)) viewMessage.hidden = !next;
  }

  // An open menu is placed again whenever the map or the toolbar changes size (a column opened
  // or closed, the EM panel, a window resize) and when the view switches, which moves the buttons
  // without resizing the toolbar.
  const placeOpenMenus = () => {
    for (const m of menus) if (!m.body.hidden) m.place();
  };
  const resizer = globalThis.ResizeObserver ? new globalThis.ResizeObserver(placeOpenMenus) : null;
  resizer?.observe(mapWrap);
  resizer?.observe(toolbar);
  let shownView = null;

  function applyLayout(values) {
    flightPanel.setCollapsed(!values.flightColumn);
    formationPanel.setCollapsed(!values.formationColumn);
    readouts.setCollapsed(!values.moreDetail);
    flightCol.classList.toggle('is-collapsed', !values.flightColumn);
    formationCol.classList.toggle('is-collapsed', !values.formationColumn);
    // One view shows at a time; the other's canvas and tools hide (R12).
    const is3d = values.view === '3d';
    if (is3d) setViewMessage(null); // a new try, so the old refusal goes
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
    if (values.view !== shownView) {
      shownView = values.view;
      placeOpenMenus();
    }
    for (const el of notInCockpit) el.hidden = ridesShip(values);
    renderSpace();
    // The camera bar sits over the 3D picture once a flight is loaded.
    cameraBar.element.hidden = !is3d || !flight;
    if (flight) cameraBar.sync(values, Object.keys(flight.tracks).map(Number));
    if (fillInfo && fillInfo.on !== values.fillGaps) {
      fillInfo = { ...fillInfo, on: values.fillGaps };
      renderStatus();
    }
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
    summary: () => flightSummary(flight, fillInfo),
    /** The gap fill's state for the status line and details: { on, running, result }, or null (DB-19). */
    setGapFill(info) {
      fillInfo = info;
      renderStatus();
    },
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
    /**
     * The METAR line: null hides it; otherwise { text, raw, category }, with
     * the category colouring its edge and the raw report behind "Report as sent".
     */
    setMetar(line) {
      metarLine.hidden = !line;
      if (!line) return;
      if (metarText.textContent !== line.text) metarText.textContent = line.text;
      if (metarRaw.textContent !== line.raw) metarRaw.textContent = line.raw;
      metarRawBox.hidden = !line.raw;
      metarLine.dataset.category = line.category ?? '';
    },
    /** The weather picture's line under the map: its time and age, or why there's none. */
    setWeatherNote(text) {
      notes.weather = text ?? '';
      showNotes();
    },
    /**
     * The saved radar and lightning: the Weather menu's offer ({ button: 'hidden' | 'save' | 'cancel', status })
     * and the words under the map ('' for none).
     */
    setSavedWeather({ offer, note = '' }) {
      savedWxMode = offer.button;
      const label = offer.button === 'cancel' ? 'Cancel' : SAVE_WX_LABEL;
      if (savedWxButton.textContent !== label) savedWxButton.textContent = label;
      // A focused button that goes away would drop focus to the page: it goes to the line that says what happened (Y6).
      const hadFocus = savedWxButton.ownerDocument.activeElement === savedWxButton;
      if (savedWxButton.hidden !== (offer.button === 'hidden')) savedWxButton.hidden = offer.button === 'hidden';
      if (savedWxStatus.textContent !== offer.status) savedWxStatus.textContent = offer.status;
      if (savedWxLive.textContent !== offer.live) savedWxLive.textContent = offer.live;
      if (savedWxStatus.hidden === Boolean(offer.status)) savedWxStatus.hidden = !offer.status;
      if (hadFocus && offer.button === 'hidden' && offer.status) savedWxStatus.focus();
      if (notes.saved !== note) {
        notes.saved = note;
        showNotes();
      }
    },
    /**
     * The wind arrows' words: the caption under the map ("Model wind at
     * 8,000 ft (HRDPS 18–19Z, Open-Meteo)"), empty when there are none, and
     * the small status line in the Weather menu ('' hides it).
     */
    setWindArrows({ caption = '', status = '' } = {}) {
      notes.arrows = caption;
      showNotes();
      if (windArrowStatus.textContent !== status) windArrowStatus.textContent = status;
      windArrowStatus.hidden = !status;
    },
    /** The airspace and airfields' state for the menus (debrief/airspace.js createFlightSpace's), or null with no flight (DB-24). */
    setSpace(state) {
      spaceState = state;
      renderSpace();
    },
    /** Shows the readouts for the current time (at most 10 times a second while playing). */
    renderReadouts: (r, extra) => readouts.render(r, flight, extra),
    showPicker,
    setMessage,
    setViewMessage,
    /** Stops watching the map's size. */
    dispose: () => resizer?.disconnect(),
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
    onSaveWx: (fn) => (handlers.saveWx = fn),
    onCancelWx: (fn) => (handlers.cancelWx = fn),
    onReset: (fn) => (handlers.reset = fn),
  };
}
