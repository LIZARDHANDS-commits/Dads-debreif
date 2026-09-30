// The right column of the Traffic Sim (specs/SPEC-traffic.md: The screen; task 6): the
// spawner, the aircraft list and the conflicts. The spawner turns its boxes into a call to
// the engine's `sim.spawn` and says in plain words when it can't; the list and the conflicts
// show the engine's state as the text readouts.js makes. Names and callsigns go in as text,
// never as HTML.
//
// It builds pieces to put in the layout's slots and holds no traffic data of its own.
import { h, clear } from '../../ui-kit/dom.js';
import { TYPE_COLORS } from './sim.js';
import { aircraftRows, conflictLines, noConflictsText } from './readouts.js';
import { LIMITS } from './defaults.js';

/** The aircraft types the spawner offers, in V6's order. */
export const SPAWN_TYPES = Object.freeze(Object.keys(TYPE_COLORS));

/** The most points a start-point box accepts (the engine's own check is the route's length). */
const MOST_POINTS = 999;

/** How often the list and the conflicts are rewritten while the run is playing. */
const LIST_EVERY_MS = 100;

/** The route the spawner starts on: the first entry, or the first pattern when there is none (the spec's Defaults table). */
export function defaultSpawnRouteId(routes) {
  return (routes.find((r) => r.kind === 'entry') ?? routes.find((r) => r.kind === 'pattern') ?? routes[0])?.id ?? '';
}

/** The route the spawner's setting names, or the default when that route isn't there. */
export const spawnRouteId = (value, routes) => (routes.some((r) => r.id === value) ? value : defaultSpawnRouteId(routes));

/**
 * What the spawner's boxes ask for, checked in plain words before the engine is called.
 * `values` is the traffic settings. Returns { spec: { type, routeId, startPoint, delaySec } }
 * for the engine, or { problem } saying what to change.
 */
export function spawnSpec(values, routes) {
  if (!routes.length) return { problem: 'There are no routes to fly yet. Make one with + New route.' };
  const routeId = spawnRouteId(values.spawnRoute, routes);
  const route = routes.find((r) => r.id === routeId);
  const { spawnStartPoint: startPoint, spawnDelayS: delaySec } = values;
  if (!Number.isInteger(startPoint) || startPoint < 1) return { problem: 'The start point is a whole number from 1: point 1 is the first point.' };
  if (startPoint > route.points.length) return { problem: `${route.name} has ${route.points.length} points: choose a start point from 1 to ${route.points.length}.` };
  const [, mostDelay] = LIMITS.spawnDelayS;
  if (!Number.isFinite(delaySec) || delaySec < 0 || delaySec > mostDelay) return { problem: `The delay is a number of seconds from now, from 0 to ${feet(mostDelay)}.` };
  return { spec: { type: values.spawnType, routeId, startPoint, delaySec } };
}

/** The second aircraft of a pair: the same as the first, `pairGapS` seconds later, or { problem } when that gap doesn't make sense. */
export function pairSpec(spec, values) {
  const gap = values.pairGapS, [, mostDelay] = LIMITS.spawnDelayS;
  if (!Number.isFinite(gap) || gap < 0 || spec.delaySec + gap > mostDelay) return { problem: `The gap between a pair is a number of seconds from 0 up to ${feet(mostDelay - spec.delaySec)} more than the delay.` };
  return { spec: { ...spec, delaySec: spec.delaySec + gap } };
}

/** A problem the engine reported, in words a pilot can act on. */
export const engineProblem = (err) => (err instanceof RangeError ? `That aircraft could not be added: ${err.message}.` : 'That aircraft could not be added.');

const feet = (n) => n.toLocaleString('en-CA');

/** The detail line of an aircraft's row: "2,500 ft, 120 kt, Flying", or "Waiting, starts at 2:17". */
export function detailText(row) {
  if (row.status === 'waiting') return `${row.statusText}, ${row.startsText}`;
  if (row.status === 'flying') return `${feet(row.altFt)} ft, ${row.kt} kt, ${row.statusText}`;
  return `${feet(row.altFt)} ft, ${row.statusText}`;
}

/**
 * controls, settings: the ui-kit controls bound to the traffic settings, and those settings.
 * sim, setup: the engine's sim and the setup it flies. onChange(): called after the run changed
 * (an aircraft was added or cleared), so the screen can redraw.
 * Returns { elements: { spawner, aircraft, conflicts }, update(state, { playing, now }), routesChanged() }.
 */
export function createAircraftPanel({ controls, settings, sim, setup, onChange }) {
  // ---- the spawner ----------------------------------------------------------
  const message = h('p', { class: 'spawn-message', role: 'status' });
  const say = (text) => {
    if (message.textContent !== text) message.textContent = text;
  };

  const routeSelect = h('select', {
    id: 'traffic-spawn-route',
    onchange: () => settings.update({ spawnRoute: routeSelect.value }),
  });
  const fillRoutes = () => {
    clear(routeSelect);
    for (const route of setup.routes) routeSelect.appendChild(h('option', { value: route.id }, route.name));
    routeSelect.value = spawnRouteId(settings.get().spawnRoute, setup.routes);
  };
  fillRoutes();

  // The spawner keeps its own choice of route: picking a route on the left doesn't change it (#45).
  function spawn(pair) {
    const asked = spawnSpec(settings.get(), setup.routes);
    if (asked.problem) return say(asked.problem);
    const second = pair ? pairSpec(asked.spec, settings.get()) : null;
    if (second?.problem) return say(second.problem);
    try {
      const ids = [sim.spawn(asked.spec)];
      if (second) ids.push(sim.spawn(second.spec)); // the same route, as the spawner has it
      say(`Added ${ids.join(' and ')}.`);
    } catch (err) {
      if (!(err instanceof RangeError)) console.error('Adding an aircraft failed:', err);
      say(engineProblem(err));
    }
    onChange();
  }

  function clearFinished() {
    const cleared = sim.clearFinished();
    say(cleared ? `Cleared ${cleared} finished aircraft.` : 'No finished aircraft to clear.');
    onChange();
  }

  const pairLabel = () => `+ Pair, ${settings.get().pairGapS} s apart`;
  const pairButton = h('button', { type: 'button', class: 'button', onclick: () => spawn(true) }, pairLabel());
  const spawner = h(
    'section',
    { class: 'spawner', 'aria-label': 'Spawn aircraft' },
    h('h3', { class: 'traffic-subtitle' }, 'Spawn'),
    controls.select('spawnType', { label: 'Type', options: SPAWN_TYPES.map((type) => [type, type]) }),
    h('div', { class: 'control control-select' }, h('label', { for: routeSelect.id }, 'Route'), routeSelect),
    controls.number('spawnStartPoint', { label: 'Start at point', min: 1, max: MOST_POINTS, step: 1 }),
    controls.number('spawnDelayS', { label: 'Delay', unit: 's', min: LIMITS.spawnDelayS[0], max: LIMITS.spawnDelayS[1], step: 1 }),
    h(
      'div',
      { class: 'spawn-buttons' },
      h('button', { type: 'button', class: 'button primary', onclick: () => spawn(false) }, '+ Spawn'),
      pairButton,
      h('button', { type: 'button', class: 'button', onclick: clearFinished }, 'Clear finished'),
    ),
    message,
  );

  // ---- the aircraft list and the conflicts ------------------------------------
  const listBody = h('ul', { class: 'aircraft-list' });
  const emptyNote = h('p', { class: 'aircraft-empty' }, 'No aircraft yet. Use + Spawn to add one.');
  const aircraft = h('section', { class: 'aircraft', 'aria-label': 'Aircraft' }, h('h3', { class: 'traffic-subtitle' }, 'Aircraft'), listBody, emptyNote);

  const conflictBody = h('ul', { class: 'conflict-list' });
  const noConflicts = h('p', { class: 'conflict-none' }, noConflictsText);
  const conflicts = h('section', { class: 'conflicts', 'aria-label': 'Conflicts' }, h('h3', { class: 'traffic-subtitle' }, 'Conflicts'), conflictBody, noConflicts);

  let shown = { list: '', conflicts: '' };
  let last = -Infinity;

  /** Writes the state into the list and the conflicts, changing only what is different. */
  function write(state) {
    const rows = aircraftRows(state, setup);
    const listKey = JSON.stringify(rows.map((r) => [r.id, r.type, r.routeName, detailText(r), r.color]));
    if (listKey !== shown.list) {
      shown.list = listKey;
      clear(listBody);
      for (const row of rows) {
        const swatch = h('span', { class: 'aircraft-swatch', 'aria-hidden': 'true' });
        swatch.style.setProperty('--ac', row.color);
        listBody.appendChild(
          h(
            'li',
            { class: `aircraft-row status-${row.status}`, dataset: { aircraftId: row.id } },
            h('span', { class: 'aircraft-name' }, swatch, h('strong', {}, row.id), ` ${row.type} on ${row.routeName}`),
            ' ',
            h('span', { class: 'aircraft-detail' }, detailText(row)),
          ),
        );
      }
      emptyNote.hidden = rows.length > 0;
    }
    const lines = conflictLines(state);
    const conflictKey = JSON.stringify(lines.map((l) => l.text));
    if (conflictKey !== shown.conflicts) {
      shown.conflicts = conflictKey;
      clear(conflictBody);
      for (const line of lines) conflictBody.appendChild(h('li', { class: `conflict-line level-${line.level}` }, line.text));
      noConflicts.hidden = lines.length > 0;
    }
  }

  return {
    elements: { spawner, aircraft, conflicts },
    /**
     * Shows the engine's state. While the run is playing it rewrites the lists at most every
     * 100 ms (`now` is the time in ms); paused, every call writes at once.
     */
    update(state, { playing = false, now = 0 } = {}) {
      if (playing && now - last < LIST_EVERY_MS) return;
      last = now;
      write(state);
      const label = pairLabel();
      if (pairButton.textContent !== label) pairButton.textContent = label;
    },
    /** The routes changed (one was made, renamed or removed): the spawner's route list follows. */
    routesChanged() {
      fillRoutes();
    },
  };
}
