// The Low-level Navigation Planner (docs/modules/nav-planner/spec.md; ALL-43): plan a route at Moose Jaw (tap points on the map, edit them in
// the table), see each leg's track, heading, distance, time, fuel and terrain clearance, brief it in 2D, 3D and Brief mode, print a route card,
// and load a flown KML against it. mount() wires the pure parts (route.js, legs.js, terrain.js, winds.js, debrief.js, flythrough.js) to the
// map (map2d.js), the 3D view (world3d.js), Brief mode (brief.js) and the route card (card.js). Everything it starts runs on the shell's
// scheduler and listeners, so closing the module stops it all. Not for flight planning: said in the bar and on the card.
import { h, clear } from '../../ui-kit/dom.js';
import { createPanel } from '../../ui-kit/panel.js';
import { downloadText, pickTextFiles, FileTooBigError } from '../../storage/file.js';
import { loadFlight } from '../../flight-data/load.js';
import { MAX_FILE_BYTES as MAX_TRACK_BYTES } from '../../flight-data/kml.js';
import { TRAFFIC_VERSION } from '../traffic/version.js';
import {
  emptyRoute, exampleRoute, makePoint, toRouteFile, readRouteFile, routeFileName, cleanName, RouteFileError, SETTING_DEFAULTS, RANGES, MAX_POINTS, MAX_FILE_BYTES,
} from './route.js';
import { computeLegs, legGeometry, mmss, hmmss, deg3, FIELD_FT } from './legs.js';
import { createRouteTerrain } from './terrain.js';
import { createLegWinds } from './winds.js';
import { toKml, toGpx, readRouteExchange } from './exchange.js';
import { compareFlown } from './debrief.js';
import { planTimeline, planPositionAt, flownPositionAt } from './flythrough.js';
import { createRouteMap } from './map2d.js';
import { openBrief, clearanceWords } from './brief.js';
import { buildCard } from './card.js';

const STYLESHEET = new URL('./nav-planner.css', import.meta.url).href;
const SPEEDS = Object.freeze([1, 2, 4, 8, 16, 32]);
const DRAFT_KEY = 'draft';

const fmtFt = (n) => (Number.isFinite(n) ? `${(Math.round(n / 10) * 10).toLocaleString('en-CA')}` : '—');
const signed = (s) => {
  if (!Number.isFinite(s)) return '—';
  const words = Math.abs(s) < 1 ? 'on time' : s > 0 ? 'late' : 'early';
  return words === 'on time' ? 'on time' : `${mmss(Math.abs(s))} ${words}`;
};

function mount(root, app) {
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = STYLESHEET;
  document.head.append(stylesheet);

  // ---- State ----
  let route = emptyRoute();
  let settings = { ...SETTING_DEFAULTS, wind: { ...SETTING_DEFAULTS.wind } };
  try {
    const draft = app.storage.get(DRAFT_KEY, null);
    if (typeof draft === 'string') ({ route, settings } = readRouteFile(draft)); // checked as any opened file is
  } catch {
    // a damaged or old draft: start empty
  }
  let selected = -1;
  let addMode = true;
  let result = { legs: [], totals: { distNm: 0, timeS: 0, fuelUsedLb: 0, fuelRemLb: settings.startFuelLb, complete: true } };
  let flown = null; // { name, fixes, startT, endT }
  let comparison = null;
  let view = '2d';
  let replay = 'plan';
  let playing = false;
  let speed = 8;
  let playT = 0;
  let plane = null;
  let world = null;
  let worldLoading = null;
  let brief = null;
  let closed = false;

  // ---- Shared services ----
  let pending = null;
  const soon = () => {
    if (pending || closed) return;
    pending = app.scheduler.after(250, () => {
      pending = null;
      recompute();
    });
  };
  const terrain = createRouteTerrain({ timers: app.scheduler, doc: document, onChange: soon });
  const winds = createLegWinds({ onChange: soon });

  // ---- Left column: Route, Plan, Flown track ----
  const message = h('p', { class: 'np-message', role: 'status', 'aria-live': 'polite' });
  const say = (text, bad = false) => {
    message.textContent = text;
    message.classList.toggle('is-bad', bad);
  };
  const nameBox = h('input', { type: 'text', class: 'np-input', maxlength: '40', 'aria-label': 'Route name', value: route.name });
  app.listen(nameBox, 'change', () => {
    route.name = cleanName(nameBox.value, 'Route');
    nameBox.value = route.name;
    saveDraft();
  });
  const addBtn = h('button', { type: 'button', class: 'button np-toggle', 'aria-pressed': 'true', title: 'Tap the map to add a turn point at the end of the route' }, 'Add points by tapping');
  app.listen(addBtn, 'click', () => {
    addMode = !addMode;
    addBtn.setAttribute('aria-pressed', String(addMode));
  });
  const btn = (text, fn, title = '') => {
    const b = h('button', { type: 'button', class: 'button', title: title || null }, text);
    app.listen(b, 'click', fn);
    return b;
  };
  const routePanel = createPanel({ title: 'Route', collapsed: false });
  routePanel.body.append(
    h('label', { class: 'np-field' }, h('span', {}, 'Name'), nameBox),
    h('div', { class: 'np-actions' },
      btn('New', () => setRoute(emptyRoute(), 'New route: tap the map to add turn points.')),
      btn('Example', () => setRoute(exampleRoute(), 'The Example route is made up, to try the planner: not a real low-level route.'), 'A made-up five-leg route round Moose Jaw'),
      btn('Open…', () => openRoute(), 'Open a saved route file (.navroute.json)'),
      btn('Save', () => saveRoute(), 'Save the route as a file')),
    h('div', { class: 'np-actions' },
      btn('Import KML/GPX…', () => importRoute(), 'A route from ForeFlight or a GPS'),
      btn('Export KML', () => exportRoute('kml')),
      btn('Export GPX', () => exportRoute('gpx'))),
    addBtn,
    h('p', { class: 'np-hint' }, 'Tap the map to add a point · drag a point to move it · click one to select it, Delete removes it.'),
    message);

  function numberField(label, key, unit, note, step, onCommit = null) {
    const [lo, hi] = RANGES[key];
    const box = h('input', { type: 'number', class: 'np-input np-num', min: String(lo), max: String(hi), step: String(step), value: String(onCommit ? '' : settings[key]) });
    app.listen(box, 'change', () => {
      const v = Number(box.value);
      if (box.value === '' || !Number.isFinite(v) || v < lo || v > hi) {
        say(`${label} must be between ${lo} and ${hi} ${unit}; kept the last good value.`, true);
        box.value = String(onCommit ? onCommit.get() : settings[key]);
        return;
      }
      if (onCommit) onCommit.set(v);
      else settings[key] = v;
      say('');
      recompute();
    });
    const el = h('label', { class: 'np-field' }, h('span', {}, `${label} (${unit})`), box, note ? h('small', { class: 'np-est' }, note) : null);
    return { el, box };
  }
  const fuelStart = numberField('Start fuel', 'startFuelLb', 'lb', 'estimate', 10);
  const fuelFlow = numberField('Fuel flow', 'fuelFlowPph', 'lb/h', 'estimate', 10);
  const minClear = numberField('Minimum clearance to flag', 'minClearanceFt', 'ft', 'estimate; a flag, never a wall', 50);
  const windFrom = numberField('From', 'fromDegT', '°T', '', 5, { get: () => settings.wind.fromDegT, set: (v) => { settings.wind.fromDegT = v; } });
  const windKt = numberField('Speed', 'kt', 'kt', '', 1, { get: () => settings.wind.kt, set: (v) => { settings.wind.kt = v; } });
  windFrom.box.value = String(settings.wind.fromDegT);
  windKt.box.value = String(settings.wind.kt);
  const windTime = h('input', { type: 'datetime-local', class: 'np-input', step: '60', 'aria-label': 'Take-off date and time, Zulu' });
  if (settings.wind.timeZ) windTime.value = settings.wind.timeZ.slice(0, 16);
  app.listen(windTime, 'change', () => {
    const t = Date.parse(`${windTime.value}:00Z`);
    settings.wind.timeZ = Number.isFinite(t) ? new Date(t).toISOString().replace('.000Z', 'Z') : '';
    recompute();
  });
  const windModes = [['none', 'None'], ['typed', 'Typed'], ['model', 'Model winds aloft']].map(([mode, text]) => {
    const b = h('button', { type: 'button', class: 'button np-seg', 'aria-pressed': String(settings.wind.mode === mode) }, text);
    app.listen(b, 'click', () => {
      settings.wind.mode = mode;
      if (mode === 'model' && !settings.wind.timeZ) {
        const now = new Date();
        now.setUTCMinutes(0, 0, 0);
        settings.wind.timeZ = now.toISOString().replace('.000Z', 'Z');
        windTime.value = settings.wind.timeZ.slice(0, 16);
      }
      showWindMode();
      recompute();
    });
    return { mode, b };
  });
  const typedBox = h('div', { class: 'np-wind-typed' }, windFrom.el, windKt.el);
  const modelBox = h('div', { class: 'np-wind-model' }, h('label', { class: 'np-field' }, h('span', {}, 'Take-off (Z)'), windTime));
  const windStatus = h('p', { class: 'np-hint' });
  function showWindMode() {
    for (const { mode, b } of windModes) b.setAttribute('aria-pressed', String(settings.wind.mode === mode));
    typedBox.hidden = settings.wind.mode !== 'typed';
    modelBox.hidden = settings.wind.mode !== 'model';
  }
  const planPanel = createPanel({ title: 'Plan', collapsed: false });
  planPanel.body.append(fuelStart.el, fuelFlow.el, minClear.el,
    h('div', { class: 'np-field' }, h('span', {}, 'Wind'), h('div', { class: 'np-segs', role: 'group', 'aria-label': 'Wind' }, windModes.map((m) => m.b))),
    typedBox, modelBox, windStatus);

  const flownStatus = h('p', { class: 'np-hint' }, 'Load a ForeFlight track (KML) to see it against the plan.');
  const closeFlownBtn = btn('Close track', () => {
    flown = null;
    comparison = null;
    replay = 'plan';
    setReplayButtons();
    recompute();
  });
  closeFlownBtn.hidden = true;
  const flownPanel = createPanel({ title: 'Flown track (debrief)', collapsed: true });
  flownPanel.body.append(h('div', { class: 'np-actions' }, btn('Load KML…', () => loadTrack()), closeFlownBtn), flownStatus);

  // ---- The stage: map, 3D, bar ----
  const canvas = h('canvas', { class: 'np-map' });
  const stage3d = h('div', { class: 'np-stage3d', hidden: true });
  const viewWrap = h('div', { class: 'np-viewwrap' }, canvas, stage3d);
  const viewBtns = [['2d', '2D'], ['3d', '3D']].map(([v, text]) => {
    const b = h('button', { type: 'button', class: 'button np-seg', 'aria-pressed': String(v === view) }, text);
    app.listen(b, 'click', () => setView(v));
    return { v, b };
  });
  const playBtn = btn('Play', () => togglePlay(), 'Fly the route at the planned ground speeds (Space)');
  const speedSel = h('select', { class: 'np-input', 'aria-label': 'Fly-through speed' }, SPEEDS.map((s) => h('option', { value: String(s), selected: s === speed }, `${s}×`)));
  app.listen(speedSel, 'change', () => {
    speed = Number(speedSel.value);
  });
  const scrub = h('input', { type: 'range', class: 'np-scrub', min: '0', max: '1000', step: '1', value: '0', 'aria-label': 'Fly-through time' });
  const playTime = h('span', { class: 'np-playtime' }, '0:00');
  app.listen(scrub, 'input', () => {
    playT = (Number(scrub.value) / 1000) * duration();
    placePlane();
  });
  const replayBtns = [['plan', 'Plan'], ['flown', 'Flown']].map(([v, text]) => {
    const b = h('button', { type: 'button', class: 'button np-seg', 'aria-pressed': String(v === replay) }, text);
    app.listen(b, 'click', () => {
      replay = v;
      playT = 0;
      setReplayButtons();
      placePlane();
    });
    return { v, b };
  });
  const replayGroup = h('div', { class: 'np-segs', role: 'group', 'aria-label': 'Replay' }, h('span', { class: 'np-bar-label' }, 'Replay'), replayBtns.map((r) => r.b));
  function setReplayButtons() {
    for (const { v, b } of replayBtns) b.setAttribute('aria-pressed', String(v === replay));
    replayGroup.hidden = !flown;
  }
  const bar = h('div', { class: 'np-bar' },
    h('div', { class: 'np-segs', role: 'group', 'aria-label': 'View' }, viewBtns.map((v) => v.b)),
    btn('Fit', () => fit(), 'Fit the route to the view'),
    playBtn, speedSel, scrub, playTime, replayGroup,
    h('span', { class: 'np-bar-gap' }),
    btn('Brief', () => startBrief(), 'Full-screen, leg by leg, for briefing a room'),
    btn('Route card', () => printCard(), 'Print the route card'));
  const stageStatus = h('p', { class: 'np-hint np-stage-status' });

  // ---- Tables ----
  const pointsBody = h('tbody', {});
  const pointsTable = h('table', { class: 'np-table np-points' },
    h('thead', {}, h('tr', {}, ['#', 'Name', 'Lat', 'Lon', 'Next leg height (ft)', '', 'KIAS', ''].map((t) => h('th', {}, t)))), pointsBody);
  const legsBody = h('tbody', {});
  const legsFoot = h('tfoot', {});
  const legsTable = h('table', { class: 'np-table np-legs' },
    h('thead', {}, h('tr', {}, ['Leg', '°T', 'Trk °M', 'Hdg °M', 'NM', 'Alt ft MSL', 'KTAS', 'Wind', 'GS kt', 'Time', 'Run', 'Fuel used', 'Fuel rem', 'Clearance ft', 'High ground ft', 'MSL to clear'].map((t) => h('th', {}, t)))),
    legsBody, legsFoot);
  const debriefBox = h('section', { class: 'np-section', hidden: true });
  const cardHost = h('div', { class: 'np-card' });

  root.append(h('section', { class: 'np' },
    h('header', { class: 'np-top' }, h('h1', {}, 'Low-level Navigation Planner'), h('span', { class: 'np-version' }, TRAFFIC_VERSION),
      h('p', { class: 'np-notice' }, 'Not for flight planning. Training only.')),
    h('div', { class: 'np-main' },
      h('aside', { class: 'np-side' }, routePanel.element, planPanel.element, flownPanel.element),
      h('div', { class: 'np-stage' }, viewWrap, bar, stageStatus,
        h('section', { class: 'np-section' }, h('h2', {}, 'Turn points'), h('div', { class: 'np-scroll' }, pointsTable)),
        h('section', { class: 'np-section' }, h('h2', {}, 'Legs'),
          h('p', { class: 'np-hint' }, 'KIAS planned; KTAS on the standard day at the leg\'s altitude; ground speed with the wind. °M with 9° E variation (TR-65). Fuel and terrain clearance are estimates. Obstacles: not shown (no Canadian obstacle data).'),
          h('div', { class: 'np-scroll' }, legsTable)),
        debriefBox)),
    cardHost));

  // ---- The map ----
  const map = createRouteMap({
    canvas,
    wrap: viewWrap,
    timers: app.scheduler,
    state: () => ({ points: route.points, legs: result.legs, selected, addMode, flown: flown?.fixes ?? null, plane }),
    on: {
      add(lat, lon) {
        if (route.points.length >= MAX_POINTS) {
          say(`A route holds at most ${MAX_POINTS} turn points.`, true);
          return;
        }
        route.points.push(makePoint(Number(lat.toFixed(5)), Number(lon.toFixed(5)), {}, route.points.length + 1));
        selected = route.points.length - 1;
        renderPoints();
        recompute();
      },
      move(i, lat, lon) {
        route.points[i] = { ...route.points[i], lat: Number(lat.toFixed(5)), lon: Number(lon.toFixed(5)) };
        const row = pointsBody.children[i];
        if (row) {
          row.querySelector('[data-k="lat"]').value = route.points[i].lat.toFixed(5);
          row.querySelector('[data-k="lon"]').value = route.points[i].lon.toFixed(5);
        }
        recomputeNextFrame();
      },
      moveEnd: () => recompute(),
      select(i) {
        selected = i;
        markSelected();
        map.requestDraw();
      },
    },
  });

  let frameAsk = null;
  function recomputeNextFrame() {
    if (frameAsk) return;
    frameAsk = app.scheduler.frame(() => {
      frameAsk();
      frameAsk = null;
      recompute();
    });
  }

  // ---- Turn points table ----
  function cellInput(i, key, attrs, value) {
    const box = h('input', { class: 'np-input', dataset: { k: key }, value: String(value), ...attrs });
    app.listen(box, 'change', () => commitCell(i, key, box));
    return box;
  }
  function commitCell(i, key, box) {
    const p = route.points[i];
    if (!p) return;
    if (key === 'name') {
      p.name = cleanName(box.value, `TP${i + 1}`);
      box.value = p.name;
    } else if (key === 'heightRef') {
      p.heightRef = box.value === 'MSL' ? 'MSL' : 'AGL';
    } else {
      const v = Number(box.value);
      const [lo, hi] = RANGES[key];
      if (box.value === '' || !Number.isFinite(v) || v < lo || v > hi) {
        say(`Turn point ${i + 1}: ${key === 'kias' ? 'KIAS' : key === 'heightFt' ? 'height' : key === 'lat' ? 'latitude' : 'longitude'} must be between ${lo} and ${hi}; kept the last good value.`, true);
        box.value = key === 'lat' || key === 'lon' ? p[key].toFixed(5) : String(p[key]);
        return;
      }
      p[key] = key === 'lat' || key === 'lon' ? Number(v.toFixed(5)) : v;
    }
    say('');
    recompute();
  }
  function renderPoints() {
    clear(pointsBody);
    const n = route.points.length;
    if (!n) pointsBody.append(h('tr', {}, h('td', { colspan: '8', class: 'np-faint' }, 'No turn points yet: tap the map, or press Example.')));
    route.points.forEach((p, i) => {
      const last = i === n - 1;
      const del = h('button', { type: 'button', class: 'np-x', 'aria-label': `Delete turn point ${i + 1} ${p.name}` }, '✕');
      app.listen(del, 'click', (e) => {
        e.stopPropagation();
        deletePoint(i);
      });
      const ref = h('select', { class: 'np-input', dataset: { k: 'heightRef' }, 'aria-label': `Turn point ${i + 1} height reference` },
        h('option', { value: 'AGL', selected: p.heightRef === 'AGL' }, 'AGL'), h('option', { value: 'MSL', selected: p.heightRef === 'MSL' }, 'MSL'));
      app.listen(ref, 'change', () => commitCell(i, 'heightRef', ref));
      const row = h('tr', { dataset: { i: String(i) } },
        h('td', {}, String(i + 1)),
        h('td', {}, cellInput(i, 'name', { type: 'text', maxlength: '40', 'aria-label': `Turn point ${i + 1} name` }, p.name)),
        h('td', {}, cellInput(i, 'lat', { type: 'number', step: '0.00001', min: String(RANGES.lat[0]), max: String(RANGES.lat[1]), 'aria-label': `Turn point ${i + 1} latitude` }, p.lat.toFixed(5))),
        h('td', {}, cellInput(i, 'lon', { type: 'number', step: '0.00001', min: String(RANGES.lon[0]), max: String(RANGES.lon[1]), 'aria-label': `Turn point ${i + 1} longitude` }, p.lon.toFixed(5))),
        last ? h('td', { class: 'np-faint' }, 'end') : h('td', {}, cellInput(i, 'heightFt', { type: 'number', step: '50', min: '0', max: String(RANGES.heightFt[1]), 'aria-label': `Leg ${i + 1} height, ft` }, p.heightFt)),
        last ? h('td', {}) : h('td', {}, ref),
        last ? h('td', {}) : h('td', {}, cellInput(i, 'kias', { type: 'number', step: '5', min: String(RANGES.kias[0]), max: String(RANGES.kias[1]), 'aria-label': `Leg ${i + 1} KIAS` }, p.kias)),
        h('td', {}, del));
      app.listen(row, 'click', () => {
        selected = i;
        markSelected();
        map.requestDraw();
      });
      pointsBody.append(row);
    });
    markSelected();
  }
  function markSelected() {
    [...pointsBody.children].forEach((row, i) => row.classList.toggle('is-selected', i === selected));
  }
  function deletePoint(i) {
    if (i < 0 || i >= route.points.length) return;
    route.points.splice(i, 1);
    selected = Math.min(selected, route.points.length - 1);
    if (selected === i) selected = -1;
    renderPoints();
    recompute();
  }

  // ---- Legs table ----
  function renderLegs() {
    clear(legsBody);
    clear(legsFoot);
    const { legs, totals } = result;
    if (!legs.length) {
      legsBody.append(h('tr', {}, h('td', { colspan: '16', class: 'np-faint' }, 'Two or more turn points make a leg.')));
      return;
    }
    for (const l of legs) {
      const c = l.clearance;
      const windCell = l.wind ? `${deg3(l.wind.fromDegT)}/${Math.round(l.wind.kt)}` : 'still air';
      const clrText = clearanceCell(l);
      legsBody.append(h('tr', { class: c.low ? 'is-low' : '' },
        h('td', {}, `${l.i + 1} ${l.from} → ${l.to}`),
        h('td', {}, deg3(l.trackDegT)),
        h('td', {}, deg3(l.trackDegM)),
        h('td', { class: 'np-strong' }, deg3(l.headingDegM)),
        h('td', {}, l.distNm.toFixed(1)),
        h('td', { title: l.altEstimated ? 'The ground is not known yet: the field\'s 1,892 ft plus the AGL height (estimate)' : null }, `${l.altEstimated ? '≈' : ''}${fmtFt(l.altFt)}`),
        h('td', {}, String(Math.round(l.tasKt))),
        h('td', { title: l.windNote || null }, windCell),
        h('td', {}, Number.isFinite(l.timeS) ? String(Math.round(l.gsKt)) : '[NO TRACK]'),
        h('td', {}, mmss(l.timeS)),
        h('td', {}, hmmss(l.runS)),
        h('td', {}, Number.isFinite(l.fuelUsedLb) ? String(Math.round(l.fuelUsedLb)) : '—'),
        h('td', { class: l.fuelRemLb < 0 ? 'is-bad' : '' }, Number.isFinite(l.fuelRemLb) ? String(Math.round(l.fuelRemLb)) : '—'),
        h('td', { class: c.low ? 'np-low' : c.ft === null ? 'np-unknown' : '', title: clearanceWords(l, settings.minClearanceFt) }, clrText),
        h('td', { class: Number.isFinite(c.highestFt) ? '' : 'np-unknown' }, Number.isFinite(c.highestFt) ? fmtFt(c.highestFt) : c.status === 'loading' ? 'loading' : 'unknown'),
        h('td', {}, Number.isFinite(c.safeAltFt) ? fmtFt(c.safeAltFt) : '—')));
    }
    legsFoot.append(h('tr', {},
      h('td', {}, `Total${totals.complete ? '' : ' (incomplete)'}`), h('td', {}), h('td', {}), h('td', {}),
      h('td', {}, totals.distNm.toFixed(1)), h('td', {}), h('td', {}), h('td', {}), h('td', {}), h('td', {}),
      h('td', {}, hmmss(totals.timeS)), h('td', {}, String(Math.round(totals.fuelUsedLb))), h('td', { class: totals.fuelRemLb < 0 ? 'is-bad' : '' }, String(Math.round(totals.fuelRemLb))),
      h('td', {}, `${legs.filter((l) => l.clearance.low).length} [LOW] (min ${settings.minClearanceFt})`), h('td', {}), h('td', {})));
  }
  function clearanceCell(l) {
    const c = l.clearance;
    const flag = c.low ? ' [LOW]' : '';
    if (l.heightRef === 'AGL') return `${c.ft} AGL${flag}`;
    if (c.ft === null) return c.status === 'loading' ? 'loading' : 'unknown';
    return `${c.atMost ? '≤ ' : ''}${fmtFt(c.ft)}${flag}`;
  }

  // ---- The debrief table ----
  function renderDebrief() {
    clear(debriefBox);
    debriefBox.hidden = !flown;
    if (!flown) return;
    if (!comparison || !result.legs.length) {
      debriefBox.append(h('h2', {}, 'Plan against flown'), h('p', { class: 'np-hint' }, 'Plan a route of two or more turn points to compare the track with.'));
      return;
    }
    const tz = (t) => (Number.isFinite(t) ? new Date(t * 1000).toISOString().slice(11, 19) + 'Z' : '—');
    const passRows = comparison.passes.map((p) => h('tr', {},
      h('td', {}, `${p.i + 1} ${route.points[p.i]?.name ?? ''}`), h('td', {}, tz(p.t)), h('td', {}, Number.isFinite(p.missNm) ? p.missNm.toFixed(2) : '—'),
      h('td', { class: p.earlyS > 30 || p.earlyS < -30 ? 'np-strong' : '' }, p.i === 0 ? 'clock starts' : signed(p.earlyS))));
    const side = (nm) => (Number.isFinite(nm) ? `${Math.abs(nm).toFixed(2)} ${nm >= 0 ? 'R' : 'L'}` : '—');
    const legRows = comparison.legs.map((l) => {
      const leg = result.legs[l.i];
      return h('tr', {},
        h('td', {}, `${l.i + 1} ${leg.from} → ${leg.to}`), h('td', {}, side(l.maxXtNm)), h('td', {}, Number.isFinite(l.avgXtNm) ? l.avgXtNm.toFixed(2) : '—'),
        h('td', {}, Number.isFinite(l.avgDevFt) ? `${l.avgDevFt >= 0 ? '+' : '−'}${fmtFt(Math.abs(l.avgDevFt))}` : '—'), h('td', {}, `${leg.altEstimated ? '≈' : ''}${fmtFt(leg.altFt)}`),
        h('td', {}, fmtFt(l.lowestFt)));
    });
    debriefBox.append(
      h('h2', {}, `Plan against flown: ${flown.name}`),
      h('div', { class: 'np-debrief-grid' },
        h('table', { class: 'np-table' }, h('thead', {}, h('tr', {}, ['Turn point', 'Pass', 'Miss NM', 'Early / late'].map((t) => h('th', {}, t)))), h('tbody', {}, passRows)),
        h('table', { class: 'np-table' }, h('thead', {}, h('tr', {}, ['Leg', 'Largest track error NM', 'Average NM', 'Height vs plan ft', 'Planned ft MSL', 'Lowest flown ft MSL'].map((t) => h('th', {}, t)))), h('tbody', {}, legRows))),
      h('p', { class: 'np-hint' }, 'Each pass is the flown fix nearest the turn point, in order; the clock starts at the first. Track error: R right of the planned line, L left. Heights are ForeFlight\'s GPS heights, not pressure altitude.'));
  }

  // ---- Working everything out ----
  function windWords() {
    return winds.status(settings);
  }
  function recompute() {
    if (closed) return;
    const pts = route.points;
    terrain.want(pts);
    const mids = [];
    for (let i = 0; i + 1 < pts.length; i++) mids.push(legGeometry(pts[i], pts[i + 1]).mid);
    winds.update(settings, mids);
    const summaries = mids.map((_, i) => terrain.summarize(pts[i], pts[i + 1]));
    result = computeLegs(pts, { ...settings, windFor: winds.windFor(settings), terrainFor: (i) => summaries[i] });
    comparison = flown && result.legs.length ? compareFlown(pts, result.legs, flown.fixes) : null;
    renderLegs();
    renderDebrief();
    windStatus.textContent = windWords();
    const ts = terrain.stats();
    stageStatus.textContent = [
      ts.tiles ? `Terrain: ${ts.tiles - ts.loading - ts.failed} of ${ts.tiles} tiles${ts.loading ? ', loading' : ''}${ts.failed ? `, ${ts.failed} missing (those legs say unknown)` : ''}${ts.capped ? ', route too long: some tiles not asked for' : ''}.` : '',
      'Imagery: Esri, Maxar, Earthstar Geographics. Terrain: Mapzen/AWS (USGS, NRCan).',
    ].filter(Boolean).join(' ');
    playBtn.disabled = !duration();
    map.requestDraw();
    if (world) {
      world.setRoute(route.points, result.legs);
      world.setFlown(flown?.fixes ?? null);
      placePlane();
    }
    if (brief?.isOpen()) brief.refresh();
    saveDraft();
  }
  function saveDraft() {
    try {
      app.storage.set(DRAFT_KEY, toRouteFile(route, settings));
    } catch {
      // the browser keeps nothing: fine, the route stays on screen
    }
  }

  function setRoute(next, words) {
    route = next;
    nameBox.value = route.name;
    selected = -1;
    stopPlay();
    playT = 0;
    renderPoints();
    recompute();
    fit();
    say(words);
  }

  // ---- Files ----
  async function openRoute() {
    try {
      const [file] = await pickTextFiles({ accept: '.json,application/json', maxBytes: MAX_FILE_BYTES });
      if (!file) return;
      const opened = readRouteFile(file.text);
      settings = opened.settings;
      fuelStart.box.value = String(settings.startFuelLb);
      fuelFlow.box.value = String(settings.fuelFlowPph);
      minClear.box.value = String(settings.minClearanceFt);
      windFrom.box.value = String(settings.wind.fromDegT);
      windKt.box.value = String(settings.wind.kt);
      windTime.value = settings.wind.timeZ ? settings.wind.timeZ.slice(0, 16) : '';
      showWindMode();
      setRoute(opened.route, `Opened "${opened.route.name}": ${opened.route.points.length} turn points.`);
    } catch (err) {
      fileFailed(err, 'That route file couldn\'t be opened.');
    }
  }
  function saveRoute() {
    if (route.points.length < 2) {
      say('A route needs at least 2 turn points to save.', true);
      return;
    }
    downloadText(toRouteFile(route, settings), routeFileName(route, '.navroute.json'), { type: 'application/json' });
    say('Saved the route file.');
  }
  async function importRoute() {
    try {
      const [file] = await pickTextFiles({ accept: '.kml,.gpx,application/vnd.google-earth.kml+xml,application/gpx+xml', maxBytes: MAX_FILE_BYTES });
      if (!file) return;
      const imported = readRouteExchange(file.text, file.name);
      setRoute(imported, `Imported "${imported.name}": ${imported.points.length} turn points, each at ${imported.points[0].heightFt} ft ${imported.points[0].heightRef} and ${imported.points[0].kias} KIAS (change them in the table).`);
    } catch (err) {
      fileFailed(err, 'That file couldn\'t be imported.');
    }
  }
  /** Turn point i's planned MSL altitude (the leg leaving it; the last point the leg before), or NaN while its ground is unknown. */
  function mslAt(i) {
    const p = route.points[i];
    const legPoint = route.points[Math.min(i, route.points.length - 2)] ?? p;
    if (legPoint.heightRef === 'MSL') return legPoint.heightFt;
    const g = terrain.heightAt(p.lat, p.lon);
    return Number.isFinite(g) ? g + legPoint.heightFt : NaN;
  }
  function exportRoute(kind) {
    if (route.points.length < 2) {
      say('A route needs at least 2 turn points to export.', true);
      return;
    }
    if (kind === 'kml') downloadText(toKml(route, mslAt), routeFileName(route, '.kml'), { type: 'application/vnd.google-earth.kml+xml' });
    else downloadText(toGpx(route, mslAt), routeFileName(route, '.gpx'), { type: 'application/gpx+xml' });
    say(`Exported the route as ${kind.toUpperCase()}.`);
  }
  function fileFailed(err, fallback) {
    if (err instanceof RouteFileError || err instanceof FileTooBigError || err?.name === 'KmlError') say(`${err.message} Nothing was changed.`, true);
    else {
      console.warn('Nav planner: file failed', err);
      say(`${fallback} Nothing was changed.`, true);
    }
  }
  async function loadTrack() {
    try {
      const [file] = await pickTextFiles({ accept: '.kml,application/vnd.google-earth.kml+xml', maxBytes: MAX_TRACK_BYTES });
      if (!file) return;
      const flight = loadFlight([{ slot: 1, name: file.name, text: file.text }]);
      const track = flight.tracks[1];
      flown = { name: track.name || file.name, fixes: track.fixes, startT: track.fixes[0].t, endT: track.fixes[track.fixes.length - 1].t };
      flownStatus.textContent = `${flown.name}: ${track.fixes.length.toLocaleString('en-CA')} fixes, ${new Date(flown.startT * 1000).toISOString().slice(0, 16).replace('T', ' ')}Z, ${hmmss(flown.endT - flown.startT)}.`;
      closeFlownBtn.hidden = false;
      setReplayButtons();
      recompute();
      map.fit([...route.points, ...flown.fixes.filter((_, k) => k % 20 === 0)]);
      say(`Loaded the flown track "${flown.name}".`);
    } catch (err) {
      fileFailed(err, 'That track couldn\'t be loaded.');
    }
  }

  // ---- 2D and 3D ----
  function routeBox() {
    const list = [...route.points, ...(flown ? flown.fixes.filter((_, k) => k % 30 === 0) : [])];
    if (!list.length) return { centre: { lat: 50.3303, lon: -105.5592 }, spanNm: 20 };
    const lats = list.map((p) => p.lat);
    const lons = list.map((p) => p.lon);
    const centre = { lat: (Math.max(...lats) + Math.min(...lats)) / 2, lon: (Math.max(...lons) + Math.min(...lons)) / 2 };
    const spanNm = Math.max((Math.max(...lats) - Math.min(...lats)) * 60, (Math.max(...lons) - Math.min(...lons)) * 60 * Math.cos((centre.lat * Math.PI) / 180));
    return { centre, spanNm };
  }
  function routeArea() {
    const { centre, spanNm } = routeBox();
    const round = (v, step) => Math.ceil(v / step) * step;
    return { centre, outerNm: Math.min(200, Math.max(60, round(spanNm * 1.5 + 20, 10))), innerNm: Math.min(40, Math.max(12, round(spanNm + 6, 2))) };
  }
  function ensureWorld() {
    if (world) return Promise.resolve(world);
    if (!worldLoading) {
      worldLoading = import('./world3d.js').then(({ createRouteWorld }) => createRouteWorld({ host: stage3d, timers: app.scheduler })).then((w) => {
        if (closed) {
          w?.dispose();
          return null;
        }
        world = w;
        if (w) {
          const a = routeArea();
          w.setArea(a.centre, a.outerNm, a.innerNm);
          w.setRoute(route.points, result.legs);
          w.setFlown(flown?.fixes ?? null);
          placePlane();
          w.chase(6000, 20);
        }
        return w;
      }).catch((err) => {
        console.warn('Nav planner: 3D view failed to load', err);
        stage3d.append(h('p', { class: 'np-3d-note' }, 'The 3D view could not load. The map, tables and route card still work.'));
        return null;
      });
    }
    return worldLoading;
  }
  function setView(v) {
    view = v;
    for (const { v: key, b } of viewBtns) b.setAttribute('aria-pressed', String(key === v));
    canvas.hidden = v !== '2d';
    stage3d.hidden = v !== '3d';
    if (v === '3d') {
      ensureWorld().then((w) => {
        if (!w) return;
        const a = routeArea();
        w.setArea(a.centre, a.outerNm, a.innerNm);
        w.setRoute(route.points, result.legs);
        placePlane();
        w.redraw();
      });
    } else map.requestDraw();
  }
  function fit() {
    const list = [...route.points, ...(flown ? flown.fixes.filter((_, k) => k % 20 === 0) : [])];
    if (list.length) {
      const { centre, spanNm } = routeBox();
      if (spanNm > 200) map.setRef(centre.lat, centre.lon);
    }
    map.fit(list);
    if (world && view === '3d') {
      const a = routeArea();
      world.setArea(a.centre, a.outerNm, a.innerNm);
      world.chase(6000, 20);
      world.redraw();
    }
  }

  // ---- The fly-through and the replay ----
  const timeline = () => planTimeline(route.points, result.legs);
  function duration() {
    if (replay === 'flown' && flown) return flown.endT - flown.startT;
    return timeline().durationS;
  }
  function groundAt(lat, lon) {
    const a = terrain.heightAt(lat, lon);
    const b = world ? world.groundAt(lat, lon) : NaN;
    if (Number.isFinite(a) && Number.isFinite(b)) return Math.max(a, b);
    return Number.isFinite(a) ? a : b;
  }
  function placePlane() {
    const d = duration();
    playT = Math.max(0, Math.min(playT, d));
    plane = replay === 'flown' && flown ? flownPositionAt(flown.fixes, flown.startT + playT) : planPositionAt(timeline(), playT, groundAt);
    if (plane && plane.headingDegT === null) plane.headingDegT = 0;
    scrub.value = String(d ? Math.round((playT / d) * 1000) : 0);
    playTime.textContent = `${hmmss(playT)} / ${hmmss(d)}`;
    map.requestDraw();
    if (world) {
      world.setAircraft(plane);
      if (!brief?.isOpen()) world.redraw();
    }
  }
  let playFrame = null;
  function togglePlay() {
    if (playing) stopPlay();
    else startPlay();
  }
  function startPlay() {
    const d = duration();
    if (!d) return;
    if (playT >= d) playT = 0;
    playing = true;
    playBtn.textContent = 'Pause';
    playFrame = app.scheduler.frame((dtMs) => {
      playT += (Math.min(dtMs, 250) / 1000) * speed; // a hidden tab's long gap doesn't jump far
      if (playT >= duration()) {
        playT = duration();
        stopPlay();
      }
      placePlane();
    });
  }
  function stopPlay() {
    playing = false;
    playBtn.textContent = 'Play';
    playFrame?.();
    playFrame = null;
  }

  // ---- Brief mode and the route card ----
  async function startBrief() {
    if (result.legs.length < 1) {
      say('Brief needs a route of two or more turn points.', true);
      return;
    }
    stopPlay();
    stage3d.hidden = false;
    const w = await ensureWorld();
    if (closed) return;
    brief = openBrief({
      data: () => ({ route, legs: result.legs, totals: result.totals, settings, windWords: windWords() }),
      world: () => w,
      stage: stage3d,
      groundAt,
      onClose() {
        brief = null;
        stage3d.hidden = view !== '3d';
        if (w) {
          const a = routeArea();
          w.setArea(a.centre, a.outerNm, a.innerNm);
          w.chase(6000, 20);
          placePlane();
          w.redraw();
        }
      },
    });
  }
  function printCard() {
    if (result.legs.length < 1) {
      say('The route card needs a route of two or more turn points.', true);
      return;
    }
    clear(cardHost);
    cardHost.append(buildCard({ route, legs: result.legs, totals: result.totals, settings, windWords: windWords() }));
    globalThis.print?.();
  }

  // ---- Keys (never while typing: app.keys) ----
  app.keys({
    ArrowRight: () => brief?.isOpen() && brief.next(),
    ArrowLeft: () => brief?.isOpen() && brief.back(),
    Escape: () => brief?.isOpen() && brief.close(),
    Delete: () => !brief?.isOpen() && selected >= 0 && deletePoint(selected),
    Space: () => !brief?.isOpen() && togglePlay(),
  });

  showWindMode();
  setReplayButtons();
  renderPoints();
  recompute();
  if (route.points.length) app.scheduler.after(50, () => map.fit(route.points));

  return () => {
    closed = true;
    stopPlay();
    pending?.();
    frameAsk?.();
    brief?.close();
    world?.dispose();
    terrain.dispose();
    winds.dispose();
    map.dispose();
    stylesheet.remove();
  };
}

export default { id: 'nav-planner', title: 'Low-level Navigation Planner', mount };
