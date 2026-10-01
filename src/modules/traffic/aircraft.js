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
import { MOST_AIRCRAFT } from './profile.js';

/** The spawner's number boxes as the person sees them, by setting (for the line that names the box to fix). */
const BOX_NAMES = Object.freeze({ spawnStartPoint: 'Start at point', spawnDelayS: 'Delay', pairGapS: 'Pair gap' });

import { SPAWN_TYPES } from './types.js';
export { SPAWN_TYPES };

export const PILOT_SPAWN_PRESETS = Object.freeze([
  { id: 'custom', label: 'Preset: (Custom point)', routeId: '', point: 1 },
  { id: 'closed', label: 'Preset Point - Closed Pattern (2,400 ft, 140 kt)', routeId: 'PAT1', point: 2 },
  { id: 'initial', label: 'Initial (3,500 ft, 220 kt, Run-in)', routeId: 'PAT1', point: 9 },
  { id: 'downwind', label: 'Inner Downwind (3,500 ft, 140 kt)', routeId: 'PAT1', point: 11 },
  { id: 'perch', label: 'Perch (3,500 ft, 120 kt, Final turn)', routeId: 'PAT1', point: 12 },
  { id: 'final2m', label: '2-Mile Final (2,700 ft, 120 kt, Straight-in)', routeId: 'ENT2', point: 4 },
  { id: 'final1m', label: '1-Mile Final (2,120 ft, 100 kt, Short final)', routeId: 'PAT1', point: 13 },
  { id: 'takeoff', label: 'Takeoff (RWY 29L Threshold, 100 kt)', routeId: 'PAT1', point: 1 },
  { id: 'rejoin45', label: 'Rejoin 45° Line (Entry 1, 3,500 ft, 220 kt)', routeId: 'ENT1', point: 1 },
  { id: 'rejoinStraight', label: 'Rejoin Straight-In Line (Entry 2, 2,700 ft, 140 kt)', routeId: 'ENT2', point: 1 },
]);

/** The most points a start-point box accepts (the engine's own check is the route's length). */
const MOST_POINTS = 999;

/** How often the list and the conflicts are rewritten while the run is playing. */
const LIST_EVERY_MS = 100;

/** The route the spawner starts on: the first entry, or the first pattern when there is none (the spec's Defaults table). */
export function defaultSpawnRouteId(routes) {
  const visible = routes.filter((r) => r?.kind !== 'split');
  const pool = visible.length > 0 ? visible : routes;
  return (pool.find((r) => r?.kind === 'entry') ?? pool.find((r) => r?.kind === 'pattern') ?? pool[0])?.id ?? '';
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
 * timers: the module's scheduler (`after`), so a pending line is cancelled when the module closes.
 * sim, setup: the engine's sim and the setup it flies. onChange(): called after the run changed
 * (an aircraft was added or cleared), so the screen can redraw.
 * Returns { elements: { spawner, aircraft, conflicts }, update(state, { playing, now }), routesChanged() }.
 */
export function createAircraftPanel({ controls, timers, settings, sim, setup, onChange }) {
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
    const visibleRoutes = setup.routes.filter((r) => r && r.kind !== 'split');
    for (const route of visibleRoutes) routeSelect.appendChild(h('option', { value: route.id }, route.name));
    routeSelect.value = spawnRouteId(settings.get().spawnRoute, visibleRoutes.length > 0 ? visibleRoutes : setup.routes);
  };
  fillRoutes();

  // The spawner keeps its own choice of route: picking a route on the left doesn't change it (#45).
  function spawn(pair) {
    const validRoutes = setup.routes.filter((r) => r && r.kind !== 'split');
    const routesToUse = validRoutes.length > 0 ? validRoutes : setup.routes;
    const asked = spawnSpec(settings.get(), routesToUse);
    if (asked.problem) return say(asked.problem);
    const second = pair ? pairSpec(asked.spec, settings.get()) : null;
    if (second?.problem) return say(second.problem);
    // A saved profile holds MOST_AIRCRAFT at most (PR-04): stop here, in the same words Save would use.
    const total = sim.state().aircraft.length + (second ? 2 : 1);
    if (total > MOST_AIRCRAFT) return say(`Nothing was added: that would make ${total} aircraft (the most is ${MOST_AIRCRAFT}). Clear finished aircraft or remove some first.`);
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

  const callsignBadge = h('span', { class: 'traffic-callsign-badge' }, sim.nextCallsign ? `Next: ${sim.nextCallsign()}` : '');

  const pointCaption = h('div', { class: 'spawner-point-caption', 'aria-live': 'polite' });
  const updatePointCaption = (vals = settings.get()) => {
    const validRoutes = setup.routes.filter((r) => r && r.kind !== 'split');
    const routesToUse = validRoutes.length > 0 ? validRoutes : setup.routes;
    const routeId = spawnRouteId(vals.spawnRoute, routesToUse);
    const route = routesToUse.find((r) => r.id === routeId);
    const ptIdx = (vals.spawnStartPoint ?? 1) - 1;
    const pt = route?.points?.[ptIdx];
    if (pt) {
      const isClosed = route.id === 'PAT1' && ptIdx === 1;
      const label = pt.label || `Point ${ptIdx + 1}`;
      const extra = isClosed ? ' (Closed Pattern)' : '';
      const alt = isClosed ? 2400 : (pt.alt ?? 2500);
      const kt = isClosed ? 140 : (pt.kt ?? 120);
      pointCaption.textContent = `↳ ${label}${extra}: ${alt} ft, ${kt} kt`;
    } else {
      pointCaption.textContent = '';
    }
  };
  settings.subscribe?.(updatePointCaption);
  updatePointCaption();

  const pairLabel = () => `+ Pair, ${settings.get().pairGapS} s apart`;
  const pairButton = h('button', { type: 'button', class: 'button', onclick: () => spawn(true) }, pairLabel());
  const spawnButton = h('button', { type: 'button', class: 'button primary', onclick: () => spawn(false) }, '+ Spawn');
  const spawner = h(
    'section',
    { class: 'spawner', 'aria-label': 'Spawn aircraft' },
    h('div', { class: 'spawner-head' }, h('h3', { class: 'traffic-subtitle' }, 'Spawn'), callsignBadge),
    controls.select('spawnType', { label: 'Type', options: SPAWN_TYPES.map((type) => [type, type]) }),
    h('div', { class: 'control control-select' }, h('label', { for: routeSelect.id }, 'Route'), routeSelect),
    controls.number('spawnStartPoint', { label: 'Start at point', min: 1, max: MOST_POINTS, step: 1 }),
    pointCaption,
    controls.number('spawnDelayS', { label: 'Delay', unit: 's', min: LIMITS.spawnDelayS[0], max: LIMITS.spawnDelayS[1], step: 1 }),
    h(
      'div',
      { class: 'spawn-buttons' },
      spawnButton,
      pairButton,
      h('button', { type: 'button', class: 'button', onclick: clearFinished }, 'Clear finished'),
    ),
    message,
  );

  // TR-14: neither button acts while a box it reads refuses what was typed (the setting would keep its last good
  // value, which the person can't see). The box shows its own message; the spawner's line names the box too.
  const guardButton = (button, keys) => {
    button.addEventListener('click', (event) => {
      // The guard has run by the end of the click: if it held the action back, say which box to fix.
      timers.after(0, () => {
        if (!event.defaultPrevented) return;
        const bad = keys.filter((k) => controls.invalid().includes(k)).map((k) => BOX_NAMES[k]);
        if (bad.length) say(`Nothing was added: fix the ${bad.join(' and ')} box first.`);
      });
    }, true); // registered first, so it sees the click before the guard stops it
    controls.guard(button, keys);
  };
  guardButton(spawnButton, ['spawnStartPoint', 'spawnDelayS']);
  guardButton(pairButton, ['spawnStartPoint', 'spawnDelayS', 'pairGapS']);

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
      if (callsignBadge && sim.nextCallsign) {
        const next = `Next: ${sim.nextCallsign()}`;
        if (callsignBadge.textContent !== next) callsignBadge.textContent = next;
      }
      for (const row of rows) {
        const swatch = h('span', { class: 'aircraft-swatch', 'aria-hidden': 'true' });
        swatch.style.setProperty('--ac', row.color);
        const children = [
          h('span', { class: 'aircraft-name' }, swatch, h('strong', {}, row.id), ` ${row.type} on ${row.routeName}`),
          ' ',
          h('span', { class: 'aircraft-detail' }, detailText(row)),
        ];
        if (row.status === 'flying') {
          const breakoutBtn = h(
            'button',
            {
              type: 'button',
              class: `button-tiny${row.command === 'breakout' ? ' is-active' : ''}`,
              title: 'Breakout: climb immediately to 3,500 ft, vector south to breakout point, and rejoin via entry gate',
              onclick: (e) => {
                e?.stopPropagation?.();
                sim.command(row.id, 'breakout');
                onChange?.();
              },
            },
            'Breakout',
          );
          const highKeyBtn = h(
            'button',
            {
              type: 'button',
              class: `button-tiny${row.command === 'climb_high_key' || row.command === 'climb_low_key' ? ' is-active' : ''}`,
              title: 'High Key: fly over threshold facing down the runway at 5,000 ft, then glide PFL profile',
              onclick: (e) => {
                e?.stopPropagation?.();
                sim.command(row.id, 'climb_high_key');
                onChange?.();
              },
            },
            'High Key',
          );
          const pflBtn = h(
            'button',
            {
              type: 'button',
              class: `button-tiny danger${row.command === 'pfl_current' || row.engineFailed ? ' is-active' : ''}`,
              title: 'PFL (Current Position): simulate engine failure, zoom climb if >130 kt, glide 125 kt to intercept PFL profile',
              onclick: (e) => {
                e?.stopPropagation?.();
                sim.command(row.id, 'pfl_current');
                onChange?.();
              },
            },
            'PFL',
          );
          // Go-around only works after the window (when slowing to 100 knots)
          const canGoAround = row.phase === 'final' || row.phase === 'short_final' ||
            (row.leg >= 13) || (row.altFt <= 2200 && row.kt <= 110);
          const goAroundBtn = h(
            'button',
            {
              type: 'button',
              class: `button-tiny${canGoAround ? '' : ' disabled'}${row.command === 'go_around' ? ' is-active' : ''}`,
              disabled: !canGoAround,
              title: canGoAround
                ? 'Go-around: abort landing, climb to 2,500 ft, accelerate to 220 kt and re-enter pattern'
                : 'Go-around available only on final approach after the window (slowing to 100 kt)',
              onclick: (e) => {
                e?.stopPropagation?.();
                if (!canGoAround) return;
                sim.command(row.id, 'go_around');
                onChange?.();
              },
            },
            'Go-around',
          );
          children.push(h('div', { class: 'aircraft-actions' }, breakoutBtn, highKeyBtn, pflBtn, goAroundBtn));
        }
        listBody.appendChild(
          h(
            'li',
            {
              class: `aircraft-row status-${row.status}${row.engineFailed ? ' has-engine-fail' : ''}`,
              dataset: { aircraftId: row.id },
            },
            ...children,
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
      updatePointCaption();
    },
  };
}
