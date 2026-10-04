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
import { getPflBadge } from './map2d.js';

/** The spawner's number boxes as the person sees them, by setting (for the line that names the box to fix). */
const BOX_NAMES = Object.freeze({ spawnStartPoint: 'Start at point', spawnDelayS: 'Delay', pairGapS: 'Pair gap' });

import { SPAWN_TYPES } from './types.js';
import { conflictSpawnPlan } from './scenario-timing.js';
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
  if (row.status === 'flying') return `${feet(row.altFt)} ft, ${row.kt} kt, ${groundText(row)}, ${row.statusText}`;
  return `${feet(row.altFt)} ft, ${row.statusText}`;
}

/** Ground speed and crab for a flying row (TR-R6), as the old spec's layout shows them: "GS 162 kt, crab 7° R". */
function groundText(row) {
  const crab = row.crabDeg ?? 0;
  const gs = `GS ${row.gsKt ?? row.kt} kt`;
  return crab === 0 ? `${gs}, no crab` : `${gs}, crab ${Math.abs(crab)}° ${crab > 0 ? 'R' : 'L'}`;
}

/**
 * controls, settings: the ui-kit controls bound to the traffic settings, and those settings.
 * timers: the module's scheduler (`after`), so a pending line is cancelled when the module closes.
 * sim, setup: the engine's sim and the setup it flies. onChange(): called after the run changed
 * (an aircraft was added or cleared), so the screen can redraw.
 * onSelectAircraft: optional callback called when an aircraft row is clicked.
 * Returns { elements: { spawner, aircraft, conflicts }, update(state, { playing, now }), routesChanged() }.
 */
export function createAircraftPanel({ controls, timers, settings, sim, setup, onChange, onSelectAircraft = null }) {
  // ---- the spawner ----------------------------------------------------------
  const message = h('p', { class: 'spawn-message', role: 'status' });
  const say = (text) => {
    if (message.textContent !== text) message.textContent = text;
  };

  const pointSelect = h('select', {
    id: 'traffic-spawn-start-point',
    onchange: () => {
      const val = parseInt(pointSelect.value, 10) || 1;
      settings.update({ spawnStartPoint: val });
    },
  });

  const fillStartPoints = () => {
    clear(pointSelect);
    const validRoutes = setup.routes.filter((r) => r && r.kind !== 'split');
    const routesToUse = validRoutes.length > 0 ? validRoutes : setup.routes;
    const routeId = spawnRouteId(settings.get().spawnRoute, routesToUse);
    const route = routesToUse.find((r) => r.id === routeId);
    const pts = route?.points ?? [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const idx = i + 1;
      const isClosed = route?.id === 'PAT1' && i === 1;
      const label = p.label || p.tag || `Point ${idx}`;
      const extra = isClosed ? ' (Closed Pattern)' : '';
      const alt = isClosed ? 2400 : (p.alt ?? 2500);
      const kt = isClosed ? 140 : (p.kt ?? 120);
      pointSelect.appendChild(h('option', { value: String(idx) }, `${idx}: ${label}${extra} (${alt} ft, ${kt} kt)`));
    }
    const current = settings.get().spawnStartPoint ?? 1;
    pointSelect.value = String(current);
  };

  const routeSelect = h('select', {
    id: 'traffic-spawn-route',
    onchange: () => {
      settings.update({ spawnRoute: routeSelect.value, spawnStartPoint: 1 });
      fillStartPoints();
    },
  });
  const fillRoutes = () => {
    clear(routeSelect);
    const visibleRoutes = setup.routes.filter((r) => r && r.kind !== 'split');
    for (const route of visibleRoutes) routeSelect.appendChild(h('option', { value: route.id }, route.name));
    routeSelect.value = spawnRouteId(settings.get().spawnRoute, visibleRoutes.length > 0 ? visibleRoutes : setup.routes);
  };
  fillRoutes();
  fillStartPoints();

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

  // Spawn a conflict (Patrick, 4 Oct 19:24Z): a new aircraft on the spawner's route, started where and when it will
  // meet the selected aircraft, so that one of them has to manage it (scenario-timing.js conflictSpawnPlan).
  const routeName = (id) => setup.routes.find((r) => r.id === id)?.name ?? id;
  function spawnConflict() {
    const targetId = selectedAircraftId;
    const target = sim.state().aircraft.find((a) => a.id === targetId);
    if (!target || target.status !== 'flying') return say('Spawn a conflict: select a flying aircraft first.');
    if (sim.state().aircraft.length + 1 > MOST_AIRCRAFT) return say(`Nothing was added: the most is ${MOST_AIRCRAFT} aircraft. Clear finished aircraft or remove some first.`);
    const validRoutes = setup.routes.filter((r) => r && r.kind !== 'split');
    const routeId = spawnRouteId(settings.get().spawnRoute, validRoutes.length > 0 ? validRoutes : setup.routes);
    say(`Working out where an aircraft on ${routeName(routeId)} meets ${targetId}…`);
    // A moment later, so the line above shows while it works (it flies everyone ahead on a copy of the run).
    timers.after(0, () => {
      let plan = null;
      try {
        plan = conflictSpawnPlan(sim, setup, targetId, routeId, { type: settings.get().spawnType });
      } catch (err) {
        console.error('Spawn a conflict failed:', err);
      }
      if (!plan) return say(`No start on ${routeName(routeId)} meets ${targetId} in the next 3 minutes. Try another route.`);
      try {
        const id = sim.spawn({ type: settings.get().spawnType, routeId, startPoint: plan.startPoint, delaySec: plan.delaySec });
        const route = setup.routes.find((r) => r.id === routeId);
        const where = route?.points?.[plan.startPoint - 1]?.label ?? `point ${plan.startPoint}`;
        const when = plan.delaySec > 0 ? `in ${Math.round(plan.delaySec)} s` : 'now';
        say(`Added ${id} on ${routeName(routeId)} at ${where}, ${when}: it meets ${targetId} in about ${Math.round(plan.inSec)} s.`);
      } catch (err) {
        if (!(err instanceof RangeError)) console.error('Adding an aircraft failed:', err);
        say(engineProblem(err));
      }
      onChange();
    });
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
    if (vals?.spawnStartPoint !== undefined && pointSelect.value !== String(vals.spawnStartPoint)) {
      pointSelect.value = String(vals.spawnStartPoint);
    }
  };
  settings.subscribe?.(updatePointCaption);
  updatePointCaption();

  const pairLabel = () => `+ Pair, ${settings.get().pairGapS} s apart`;
  const pairButton = h('button', { type: 'button', class: 'button', onclick: () => spawn(true) }, pairLabel());
  const spawnButton = h('button', { type: 'button', class: 'button primary', onclick: () => spawn(false) }, '+ Spawn');
  const conflictButton = h('button', { type: 'button', class: 'button', disabled: true, title: 'Select an aircraft first', onclick: spawnConflict }, 'Spawn a conflict');
  // The button waits for a selected aircraft (Patrick: "when an aircraft is selected").
  const conflictButtonFollows = () => {
    const on = Boolean(selectedAircraftId);
    conflictButton.disabled = !on;
    conflictButton.title = on ? `A new aircraft on the route above, timed to meet ${selectedAircraftId}` : 'Select an aircraft first';
  };

  // PFL From Area: an aircraft already gliding with the engine out, somewhere in the training area. Closed until asked for.
  const pflBox = (id, label, unit, value, min, max) => {
    const input = h('input', { id, type: 'number', value: String(value), min: String(min), max: String(max), step: '1', inputmode: 'numeric' });
    return { input, element: h('div', { class: 'control control-number' }, h('label', { for: id }, `${label} (${unit})`), input) };
  };
  const pflRadial = pflBox('traffic-pfl-radial', 'Radial', '°T', 180, 0, 360);
  const pflDist = pflBox('traffic-pfl-dist', 'Distance', 'NM', 5, 1, 30);
  const pflAlt = pflBox('traffic-pfl-alt', 'Altitude', 'ft MSL', 7500, 3000, 15000);
  const spawnPfl = () => {
    const [radialDeg, distNm, altFt] = [pflRadial, pflDist, pflAlt].map((b) => Number(b.input.value));
    if (![radialDeg, distNm, altFt].every(Number.isFinite)) return say('PFL From Area: radial, distance and altitude must be numbers.');
    if (sim.state().aircraft.length + 1 > MOST_AIRCRAFT) return say(`Nothing was added: the most is ${MOST_AIRCRAFT} aircraft. Clear finished aircraft or remove some first.`);
    try {
      const id = sim.spawnPflFromArea({ type: settings.get().spawnType, radialDeg, distNm, altFt });
      say(`Added ${id}: engine out, inbound to High Key.`);
    } catch (err) {
      if (!(err instanceof RangeError)) console.error('Adding a PFL aircraft failed:', err);
      say(engineProblem(err));
    }
    onChange();
  };
  const pflPanel = h(
    'details',
    { class: 'spawner-pfl' },
    h('summary', {}, 'PFL From Area'),
    pflRadial.element,
    pflDist.element,
    pflAlt.element,
    h('button', { type: 'button', class: 'button danger', onclick: spawnPfl }, '+ Spawn PFL'),
  );
  const startPointControl = h(
    'div',
    { class: 'control control-select' },
    h('label', { for: pointSelect.id }, 'Start at point'),
    pointSelect,
  );
  const spawner = h(
    'section',
    { class: 'spawner', 'aria-label': 'Spawn aircraft' },
    h('div', { class: 'spawner-head' }, h('h3', { class: 'traffic-subtitle' }, 'Spawn'), callsignBadge),
    controls.select('spawnType', { label: 'Type', options: SPAWN_TYPES.map((type) => [type, type]) }),
    h('div', { class: 'control control-select' }, h('label', { for: routeSelect.id }, 'Route'), routeSelect),
    startPointControl,
    pointCaption,
    controls.number('spawnDelayS', { label: 'Delay', unit: 's', min: LIMITS.spawnDelayS[0], max: LIMITS.spawnDelayS[1], step: 1 }),
    h(
      'div',
      { class: 'spawn-buttons' },
      spawnButton,
      pairButton,
      h('button', { type: 'button', class: 'button', onclick: clearFinished }, 'Clear finished'),
      conflictButton,
    ),
    pflPanel,
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
  // The list stays on one screen (Patrick, 4 Oct 19:27Z): rows that would run past the bottom of the window wait
  // behind a "More" button, which opens the whole list (and closes it again). The selected aircraft always shows.
  let showAll = false;
  const moreButton = h('button', {
    type: 'button',
    class: 'button aircraft-more',
    hidden: true,
    onclick: () => {
      showAll = !showAll;
      fold();
    },
  }, 'More');
  function fold() {
    const lis = [...(listBody.children || listBody.childNodes || [])];
    for (const li of lis) li.hidden = false;
    moreButton.hidden = true;
    const room = typeof window !== 'undefined' && Number.isFinite(window.innerHeight) ? window.innerHeight : null;
    if (room === null || !listBody.getBoundingClientRect) return; // no screen to measure (tests)
    const limit = room - 44; // leave room for the button itself
    const past = lis.filter((li) => (li.getBoundingClientRect?.().bottom ?? 0) > limit && li.dataset?.aircraftId !== selectedAircraftId);
    if (!past.length) return;
    moreButton.hidden = false;
    if (showAll) {
      moreButton.textContent = 'Show fewer';
      return;
    }
    for (const li of past) li.hidden = true;
    moreButton.textContent = `More (${past.length})`;
  }
  const aircraft = h('section', { class: 'aircraft', 'aria-label': 'Aircraft' }, h('h3', { class: 'traffic-subtitle' }, 'Aircraft'), listBody, moreButton, emptyNote);

  const conflictBody = h('ul', { class: 'conflict-list' });
  const noConflicts = h('p', { class: 'conflict-none' }, noConflictsText);
  const conflicts = h('section', { class: 'conflicts', 'aria-label': 'Conflicts' }, h('h3', { class: 'traffic-subtitle' }, 'Conflicts'), conflictBody, noConflicts);

  let shown = { list: '', conflicts: '' };
  let last = -Infinity;
  let selectedAircraftId = null;
  // Which menu each aircraft card shows (Patrick, 4 Oct 23:23Z): 'pattern', 'landing' or 'manoeuvres' (the default).
  const cardMenus = new Map();

  function setSelected(id) {
    selectedAircraftId = id;
    conflictButtonFollows();
    for (const li of (listBody.children || listBody.childNodes || [])) {
      const isTarget = li.dataset?.aircraftId === id;
      li.classList?.toggle?.('is-selected', isTarget);
      const classes = (li.getAttribute?.('class') || '').split(' ').filter((c) => c && c !== 'is-selected');
      if (isTarget) classes.push('is-selected');
      li.setAttribute?.('class', classes.join(' '));
    }
    fold();
  }

  function findChildWithClass(parent, cls) {
    if (parent.querySelector) {
      const el = parent.querySelector('.' + cls);
      if (el) return el;
    }
    for (const child of (parent.childNodes || [])) {
      const c = child.getAttribute?.('class') || child.className || '';
      if (c.split(' ').includes(cls)) return child;
      const found = findChildWithClass(child, cls);
      if (found) return found;
    }
    return null;
  }

  const makeActionButton = (label, title, actionFn, isActive = false, extraClass = '', disabled = false) => {
    let lastTime = 0;
    const trigger = (e) => {
      if (e && e.button !== undefined && e.button !== 0) return;
      e?.stopPropagation?.();
      const now = Date.now();
      if (now - lastTime < 250) return;
      lastTime = now;
      actionFn(e);
    };
    return h(
      'button',
      {
        type: 'button',
        class: `button-tiny${extraClass ? ' ' + extraClass : ''}${isActive ? ' is-active' : ''}${disabled ? ' disabled' : ''}`,
        disabled,
        title,
        onpointerdown: trigger,
        onclick: trigger,
      },
      label,
    );
  };

  /** Writes the state into the list and the conflicts, changing only what is different. */
  function write(state) {
    const rows = aircraftRows(state, setup);
    const listKey = JSON.stringify([
      selectedAircraftId,
      rows.map((r) => [r.id, r.type, r.routeName, r.status, r.color, getPflBadge(r), r.command, r.engineFailed, r.intent, r.pattern, cardMenus.get(r.id)]),
    ]);
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
        const pflBadge = getPflBadge(row);
        const nameChildren = [swatch, h('strong', {}, row.id), ` ${row.type} on ${row.routeName}`];
        if (pflBadge) {
          const badgeClass = pflBadge === '[CRASH SHORT]' ? 'pfl-badge badge-crash' : 'pfl-badge';
          nameChildren.push(h('span', { class: badgeClass }, pflBadge));
        }
        // Remove this one aircraft (TR-R19); going back to before now brings it back.
        nameChildren.push(makeActionButton('Remove', `Remove ${row.id}`, () => {
          sim.remove(row.id);
          onChange?.();
        }, false, 'aircraft-remove'));
        const children = [
          h('span', { class: 'aircraft-name' }, ...nameChildren),
          ' ',
          h('span', { class: 'aircraft-detail' }, detailText(row)),
        ];
        if (row.status === 'flying') {
          const breakoutBtn = makeActionButton(
            'Breakout',
            'Breakout: climb immediately to 3,500 ft, vector south to breakout point, and rejoin via entry gate',
            () => {
              sim.command(row.id, 'breakout');
              onChange?.();
            },
            row.command === 'breakout',
          );
          const closedBankSelect = h(
            'select',
            {
              class: 'aircraft-closed-bank-select',
              'aria-label': `Closed pattern bank angle for ${row.id}`,
              onchange: (e) => {
                e?.stopPropagation?.();
              },
            },
            h('option', { value: '45' }, '45°'),
            h('option', { value: '50' }, '50°'),
            h('option', { value: '60' }, '60°'),
          );
          closedBankSelect.value = String(row.closedPatternBankDeg || settings.get().closedPatternBankDeg || 50);

          const closedPatternBtn = makeActionButton(
            'Closed Pattern',
            'Closed Pattern: climb to 3,500 ft, 140 kt, selected bank turn into downwind',
            () => {
              const bankDeg = Number(closedBankSelect.value) || 50;
              sim.command(row.id, 'closed_pattern', { bankDeg });
              onChange?.();
            },
            row.command === 'closed_pattern',
          );
          const highKeyBtn = makeActionButton(
            'High Key',
            'High Key: fly over threshold facing down the runway at 5,000 ft, then glide PFL profile',
            () => {
              sim.command(row.id, 'climb_high_key');
              onChange?.();
            },
            row.command === 'climb_high_key' || row.command === 'climb_low_key',
          );
          const pflBtn = makeActionButton(
            'PFL',
            'PFL (Current Position): engine failure here; zoom if above 150 KIAS, glide at 125 KIAS clean (120 with the gear) to the PFL circle, or direct to the runway, or eject',
            () => {
              sim.command(row.id, 'pfl_current');
              onChange?.();
            },
            row.command === 'pfl_current' || row.engineFailed,
            'danger',
          );
          // Go-around only works after the window (when slowing to 100 knots)
          const canGoAround = row.phase === 'final' || row.phase === 'short_final' ||
            (row.leg >= 13) || (row.altFt <= 2200 && row.kt <= 110);
          const goAroundBtn = makeActionButton(
            'Go-around',
            canGoAround
              ? 'Go-around: abort landing, climb to 2,500 ft, accelerate to 220 kt and re-enter pattern'
              : 'Go-around available only on final approach after the window (slowing to 100 kt)',
            () => {
              if (!canGoAround) return;
              sim.command(row.id, 'go_around');
              onChange?.();
            },
            row.command === 'go_around',
            '',
            !canGoAround,
          );
          // The card's menu (Patrick, 4 Oct 23:23Z): pick Pattern, Landing behaviour or Manoeuvres and that menu's buttons show.
          const menu = cardMenus.get(row.id) ?? 'manoeuvres';
          const menuSelect = h(
            'select',
            {
              class: 'aircraft-menu-select',
              'aria-label': `Menu for ${row.id}`,
              onclick: (e) => {
                e?.stopPropagation?.();
              },
              onchange: (e) => {
                e?.stopPropagation?.();
                cardMenus.set(row.id, e.target?.value || 'manoeuvres');
                write(state);
              },
            },
            h('option', { value: 'pattern' }, 'Pattern'),
            h('option', { value: 'landing' }, 'Landing behaviour'),
            h('option', { value: 'manoeuvres' }, 'Manoeuvres'),
          );
          menuSelect.value = menu;
          // Pattern: OHB, or the SI pattern lap after lap (Traffic spec 4.15); takes effect at the next outer downwind.
          const patternButtons = [['ohb', 'OHB', 'OHB: fly the overhead pattern each lap'], ['si', 'SI', 'SI: descend from abeam the departure end to 2,700 ft and fly the straight-in each lap']]
            .map(([value, label, title]) => makeActionButton(label, title, () => {
              sim.setPattern?.(row.id, value);
              onChange?.();
            }, row.pattern === value));
          // Landing behaviour: what it does at the end of final.
          const landingButtons = [['touch_and_go', 'Touch & Go'], ['full_stop', 'Full Stop'], ['go_around', 'Go-around']]
            .map(([value, label]) => makeActionButton(label, `Landing behaviour: ${label}`, () => {
              sim.setIntent?.(row.id, value);
              onChange?.();
            }, (row.intent || 'touch_and_go') === value, 'aircraft-landing'));
          const buttons = menu === 'pattern' ? patternButtons
            : menu === 'landing' ? landingButtons
              : [breakoutBtn, closedPatternBtn, closedBankSelect, highKeyBtn, pflBtn, goAroundBtn];

          children.push(
            h(
              'div',
              {
                class: 'aircraft-actions',
                onclick: (e) => {
                  e?.stopPropagation?.();
                },
              },
              menuSelect,
              ...buttons,
            ),
          );
        }
        const isSelected = selectedAircraftId === row.id;
        listBody.appendChild(
          h(
            'li',
            {
              class: `aircraft-row status-${row.status}${row.engineFailed ? ' has-engine-fail' : ''}${isSelected ? ' is-selected' : ''}`,
              dataset: { aircraftId: row.id },
              onpointerdown: (e) => {
                if (e?.target && (e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT')) return;
                setSelected(row.id);
                onSelectAircraft?.(row.id);
              },
              onclick: (e) => {
                if (e?.target && (e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT')) return;
                setSelected(row.id);
                onSelectAircraft?.(row.id);
              },
            },
            ...children,
          ),
        );
      }
      emptyNote.hidden = rows.length > 0;
      fold();
    } else {
      // In-place update: altitude and speed numbers update smoothly without destroying button DOM
      const lis = listBody.childNodes || listBody.children || [];
      for (let i = 0; i < rows.length; i++) {
        const li = lis[i];
        if (!li) continue;
        const detailSpan = findChildWithClass(li, 'aircraft-detail');
        if (detailSpan) {
          const txt = detailText(rows[i]);
          if (detailSpan.textContent !== txt) detailSpan.textContent = txt;
        }
      }
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
      fillStartPoints();
      updatePointCaption();
    },
    selectAircraft: setSelected,
    selectedAircraft: () => selectedAircraftId,
  };
}
