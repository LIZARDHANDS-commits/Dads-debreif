// The right column of the Traffic Sim (specs/SPEC-traffic.md: The screen; task 6): the
// spawner, the aircraft list and the conflicts. The spawner turns a press on a spot into a call to
// the engine's `sim.spawn` and says in plain words when it can't; the list and the conflicts
// show the engine's state as the text readouts.js makes. Names and callsigns go in as text,
// never as HTML.
//
// It builds pieces to put in the layout's slots and holds no traffic data of its own.
import { h, clear } from '../../ui-kit/dom.js';
import { createPanel } from '../../ui-kit/panel.js';
import { TYPE_COLORS } from './sim.js';
import { aircraftRows, conflictLines, noConflictsText } from './readouts.js';
import { LIMITS } from './defaults.js';
import { MOST_AIRCRAFT } from './profile.js';
import { getPflBadge } from './map2d.js';

/** The spawner's number boxes as the person sees them, by setting (for the line that names the box to fix). */
const BOX_NAMES = Object.freeze({ spawnStartPoint: 'Start at point', spawnDelayS: 'Delay', pairGapS: 'Pair gap' });

import { SPAWN_TYPES } from './types.js';
import { conflictSpawnPlan } from './scenario-timing.js';
import { onProfileAltFt } from './nav-plans.js';
import { legDistances } from './route.js';
import { FT_PER_NM } from '../../core/units.js';
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
  { id: 'rejoin45', label: 'Rejoin 45° Line (OHB Rejoin, 3,500 ft, 220 kt)', routeId: 'ENT1', point: 1 },
  { id: 'rejoinStraight', label: 'Rejoin Straight-In Line (SI Rejoin, 2,700 ft, 140 kt)', routeId: 'ENT2', point: 1 },
]);

/**
 * The spots offered for a route, when not every point of it (Patrick, 4 Oct: for the overhead break only "Initial",
 * "In the break", "Downwind" and "Perch"; Base waits until its start is settled). `point` counts from 1 on the
 * built-in Moose Jaw Overhead break: 9 Final Entry (the run-in), 10 Break, 11 Break exit (the inner downwind,
 * 140 kt), 12 Perch. The same spots the code's Initial and Inner Downwind presets use.
 */
export const SPOT_CHOICES = Object.freeze({
  PAT1: Object.freeze([
    { label: 'Initial', point: 9 },
    { label: 'In the break', point: 10 },
    { label: 'Downwind', point: 11 },
    { label: 'Perch', point: 12 },
  ]),
});

/** The spots for a route: its SPOT_CHOICES (those it has), or every point by its own name. [{ label, point }] */
export function spotChoices(route) {
  const count = route?.points?.length ?? 0;
  const chosen = SPOT_CHOICES[route?.id]?.filter((c) => c.point <= count);
  if (chosen?.length) return chosen.map((c) => ({ ...c }));
  return Array.from({ length: count }, (_, i) => ({ label: route.points[i].label || route.points[i].tag || `Point ${i + 1}`, point: i + 1 }));
}

/**
 * Routes whose start is chosen by distance back along the line instead of by spot buttons (Patrick, 4 Oct: the
 * OHB Rejoin, "how many miles back on the rejoin line", in whole miles; the engine starts it partway along a
 * leg, sim.spawn backFt, approved by Patrick 4 Oct).
 */
export const MILES_BACK_ROUTES = Object.freeze(['ENT1', 'ENT2']);

/**
 * The miles boxes (Patrick, 4 Oct: "specifically selected", in 0.1 NM steps), each a distance back from its route's
 * last point along the route (sim.spawn backFt, TR-64): the OHB Rejoin's Merge, and the SI Rejoin's end at the
 * threshold. The most for a rejoin is its length; the least keeps the rejoin a rejoin (the OHB Rejoin's last half
 * mile is the merge itself; the SI Rejoin below 4.2 NM is final, which the SI pattern's "Miles on final" covers).
 * "Miles on final": 0.75 NM, the Window (3/4 mile), out to 4.1 NM, the SI Rejoin's Final point where it has rolled
 * out after base (route file). `fallback` is the box's first value.
 */
export const MILES_BOXES = Object.freeze({
  ENT1: Object.freeze({ label: 'Miles back from the Merge', least: 0.5, fallback: 9 }),
  ENT2: Object.freeze({ label: 'Miles from the threshold', least: 4.2, fallback: 10 }),
  final: Object.freeze({ label: 'Miles on final', routeId: 'ENT2', least: 0.75, most: 4.1, fallback: 2 }),
});
export const MILES_STEP_NM = 0.1;

/** Each start spot of a route but its last, with how far back from the last it is along the legs: [{ point, nm }], farthest first. */
export function milesBack(route) {
  const legs = legDistances(route);
  const out = [];
  let back = 0;
  for (let i = legs.length - 1; i >= 0; i--) {
    back += legs[i].ft;
    out.unshift({ point: i + 1, nm: Math.round((back / FT_PER_NM) * 10) / 10 });
  }
  return out;
}

/**
 * "SI pattern" in the Route list (Patrick, 4 Oct): Downwind, Base and Final. Downwind is the overhead break's
 * Abeam departure end (point 6) with the aircraft's pattern set to SI, so it flies the straight-in from there; Base
 * (the SI Rejoin's Entry Mid, the base leg the straight-in joins) and Final start on the SI Rejoin, which flies the SI
 * pattern lap after lap already (TR-61).
 */
export const SI_PATTERN_CHOICE = 'si-pattern';
export const SI_SPOTS = Object.freeze([
  Object.freeze({ label: 'Downwind', routeId: 'PAT1', point: 6, pattern: 'si' }),
  Object.freeze({ label: 'Base', routeId: 'ENT2', point: 2 }),
  Object.freeze({ label: 'Final', routeId: 'ENT2', point: 4 }),
]);

/** The Route list's last choice: an aircraft gliding in from the training area with the engine out (Patrick, 4 Oct). */
export const PFL_FROM_AREA = 'pfl-area';

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
  // Patrick, 4 Oct: Type and Route, then a button for each spot on the route; one press adds an aircraft there.
  // The delay and pairs sit under "Advanced settings". "PFL from area" is the Route list's last choice and
  // brings up its own boxes instead of the spots.
  const message = h('p', { class: 'spawn-message', role: 'status' });
  const say = (text) => {
    if (message.textContent !== text) message.textContent = text;
  };

  const flownRoutes = () => {
    const valid = setup.routes.filter((r) => r && r.kind !== 'split');
    return valid.length > 0 ? valid : setup.routes;
  };
  const currentRoute = () => {
    const routes = flownRoutes();
    return routes.find((r) => r.id === spawnRouteId(settings.get().spawnRoute, routes));
  };

  /** A spot's name and what an aircraft starts with there ("Departure End (Closed Pattern)", 2400, 140). */
  const spotOf = (route, i) => {
    const p = route.points[i];
    const isClosed = route.id === 'PAT1' && i === 1;
    return { label: `${p.label || p.tag || `Point ${i + 1}`}${isClosed ? ' (Closed Pattern)' : ''}`, alt: isClosed ? 2400 : (p.alt ?? 2500), kt: isClosed ? 140 : (p.kt ?? 120) };
  };

  let pflChosen = false; // "PFL from area" is picked in the Route list; it is not a route the setting can hold
  let siChosen = false; // "SI pattern" is picked: its spots are on two routes (SI_SPOTS)
  const routeSelect = h('select', {
    id: 'traffic-spawn-route',
    onchange: () => {
      pflChosen = routeSelect.value === PFL_FROM_AREA;
      siChosen = routeSelect.value === SI_PATTERN_CHOICE;
      if (!pflChosen && !siChosen) settings.update({ spawnRoute: routeSelect.value, spawnStartPoint: 1 });
      showRouteParts();
      conflictButtonFollows();
    },
  });
  const fillRoutes = () => {
    clear(routeSelect);
    const visibleRoutes = setup.routes.filter((r) => r && r.kind !== 'split');
    for (const route of visibleRoutes) routeSelect.appendChild(h('option', { value: route.id }, route.name));
    const hasSi = SI_SPOTS.every((s) => setup.routes.some((r) => r.id === s.routeId));
    if (hasSi) routeSelect.appendChild(h('option', { value: SI_PATTERN_CHOICE }, 'SI pattern'));
    else siChosen = false;
    routeSelect.appendChild(h('option', { value: PFL_FROM_AREA }, 'PFL from area'));
    routeSelect.value = pflChosen ? PFL_FROM_AREA : siChosen ? SI_PATTERN_CHOICE : spawnRouteId(settings.get().spawnRoute, flownRoutes());
  };

  // The advanced choices: a delay before the aircraft starts, and adding a pair. Closed until asked for.
  const pairBox = h('input', { id: 'traffic-spawn-pair', type: 'checkbox', onchange: () => showSpotsHint() });
  const pairChoice = h('div', { class: 'control control-checkbox' }, pairBox, h('label', { for: pairBox.id }, 'Add a pair (a second aircraft on the same spot, later by the pair gap)'));
  const advanced = h(
    'details',
    { class: 'spawner-advanced' },
    h('summary', {}, 'Advanced settings'),
    controls.number('spawnDelayS', { label: 'Delay', unit: 's', min: LIMITS.spawnDelayS[0], max: LIMITS.spawnDelayS[1], step: 1 }),
    pairChoice,
    controls.number('pairGapS', { label: 'Pair gap', unit: 's', min: 0, max: LIMITS.spawnDelayS[1], step: 1 }),
  );

  // The spots of the chosen route, one button each; the line above says what a press does with today's choices.
  const spotsHint = h('p', { class: 'spawn-spots-hint' });
  const spots = h('div', { class: 'spawn-spots', role: 'group', 'aria-label': 'Spots on the route' });
  function showSpotsHint() {
    const { spawnDelayS: delay, pairGapS: gap } = settings.get();
    const what = pairBox.checked ? `a pair, ${gap} s apart,` : 'an aircraft';
    const when = delay > 0 ? `in ${delay} s` : 'now';
    const milesRoute = !siChosen && MILES_BACK_ROUTES.includes(currentRoute()?.id);
    const text = milesRoute ? `Choose how far back, then + Spawn adds ${what} there ${when}.` : `Press a spot to add ${what} there ${when}.`;
    if (spotsHint.textContent !== text) spotsHint.textContent = text;
  }
  function fillSpots() {
    clear(spots);
    if (siChosen) {
      for (const choice of SI_SPOTS) {
        if (choice.label === 'Final') continue; // on final it is the miles box below
        const route = setup.routes.find((r) => r.id === choice.routeId);
        if (!route?.points?.[choice.point - 1]) continue;
        const spot = spotOf(route, choice.point - 1);
        const button = h('button', { type: 'button', class: 'button spawn-spot', dataset: { point: String(choice.point) }, title: `${choice.label}: ${feet(spot.alt)} ft, ${spot.kt} kt`, onclick: () => spawnSi(choice) }, choice.label);
        guardButton(button, ['spawnDelayS']);
        spots.appendChild(button);
      }
      const final = MILES_BOXES.final;
      const ent2 = setup.routes.find((r) => r.id === final.routeId);
      if (ent2) milesField(final, ent2, final.most);
      showSpotsHint();
      return;
    }
    const route = currentRoute();
    if (MILES_BACK_ROUTES.includes(route?.id)) {
      const box = MILES_BOXES[route.id];
      milesField(box, route, Math.round((milesBack(route)[0]?.nm ?? box.fallback) * 10) / 10);
      showSpotsHint();
      return;
    }
    for (const choice of spotChoices(route)) {
      const spot = spotOf(route, choice.point - 1);
      const button = h('button', {
        type: 'button',
        class: 'button spawn-spot',
        dataset: { point: String(choice.point) },
        title: `${spot.label}: ${feet(spot.alt)} ft, ${spot.kt} kt`,
        onclick: () => spawnAt(choice.point),
      }, choice.label);
      guardButton(button, ['spawnDelayS']);
      spots.appendChild(button);
    }
  }

  // The spawner keeps its own choice of route: picking a route on the left doesn't change it (#45).
  function spawn(pair, extra = {}) {
    // `extra.routeId` and `extra.startPoint` start it on a route other than the Route list's (the SI pattern's spots).
    const { routeId: onRoute, startPoint: atPoint, ...more } = extra;
    const asked = spawnSpec(onRoute ? { ...settings.get(), spawnRoute: onRoute, spawnStartPoint: atPoint } : settings.get(), flownRoutes());
    if (asked.problem) return say(asked.problem);
    asked.spec = { ...asked.spec, ...more };
    const second = pair ? pairSpec(asked.spec, settings.get()) : null;
    if (second?.problem) return say(second.problem);
    // A saved profile holds MOST_AIRCRAFT at most (PR-04): stop here, in the same words Save would use.
    const total = sim.state().aircraft.length + (second ? 2 : 1);
    if (total > MOST_AIRCRAFT) return say(`Nothing was added: that would make ${total} aircraft (the most is ${MOST_AIRCRAFT}). Clear finished aircraft or remove some first.`);
    try {
      const ids = [sim.spawn(asked.spec)];
      if (second) ids.push(sim.spawn(second.spec)); // the same route, as the spawner has it
      say(`Added ${ids.join(' and ')}.`);
      onChange();
      return ids;
    } catch (err) {
      if (!(err instanceof RangeError)) console.error('Adding an aircraft failed:', err);
      say(engineProblem(err));
    }
    onChange();
    return [];
  }

  /** An SI pattern spot: an aircraft (or a pair) there, its pattern set to SI where the spot says so. */
  function spawnSi(choice) {
    if (pairBox.checked && controls.invalid().includes('pairGapS')) return say('Nothing was added: fix the Pair gap box first.');
    const ids = spawn(pairBox.checked, { routeId: choice.routeId, startPoint: choice.point }) ?? [];
    if (choice.pattern) for (const id of ids) sim.setPattern?.(id, choice.pattern);
  }

  /**
   * A miles box and its + Spawn (MILES_BOXES): a number from `box.least` to `most` NM in 0.1 NM steps; + Spawn adds an
   * aircraft (or a pair) that far back from `route`'s last point along it. A figure outside the range is said in words.
   */
  function milesField(box, route, most) {
    const id = `traffic-spawn-miles-${route.id}-${box === MILES_BOXES.final ? 'final' : 'line'}`;
    const top = Math.round(Math.max(box.least, most) * 10) / 10;
    const input = h('input', { id, type: 'number', min: String(box.least), max: String(top), step: String(MILES_STEP_NM), inputmode: 'decimal', value: String(Math.min(box.fallback, top)) });
    const range = h('span', { class: 'spawn-miles-range' }, `${box.least} to ${top} NM`);
    const go = h('button', { type: 'button', class: 'button primary spawn-spot', onclick: () => {
      const nm = Number(input.value);
      if (!Number.isFinite(nm) || nm < box.least || nm > top) return say(`${box.label}: enter a number from ${box.least} to ${top}.`);
      spawnBack(Math.round(nm * 10) / 10, route.id);
    } }, '+ Spawn');
    guardButton(go, ['spawnDelayS']);
    spots.appendChild(h('div', { class: 'control control-number spawn-miles' }, h('label', { for: id }, box.label), h('div', { class: 'spawn-miles-row' }, input, range, go)));
  }

  /** + Spawn on a miles box: an aircraft (or a pair) `nm` back from the end of route `routeId` along it. */
  function spawnBack(nm, routeId) {
    if (pairBox.checked && controls.invalid().includes('pairGapS')) return say('Nothing was added: fix the Pair gap box first.');
    spawn(pairBox.checked, { routeId, startPoint: 1, backFt: nm * FT_PER_NM });
  }

  /** A spot was pressed: an aircraft (or a pair, from Advanced settings) at that spot of the chosen route. */
  function spawnAt(point) {
    // The pair gap is read only for a pair: a refused gap holds back a pair, not a single aircraft (TR-14).
    if (pairBox.checked && controls.invalid().includes('pairGapS')) return say('Nothing was added: fix the Pair gap box first.');
    settings.update({ spawnStartPoint: point });
    spawn(pairBox.checked);
  }

  // Spawn a conflict (Patrick, 4 Oct 19:24Z): a new aircraft on the spawner's route, started where and when it will
  // meet the selected aircraft, so that one of them has to manage it (scenario-timing.js conflictSpawnPlan).
  const routeName = (id) => setup.routes.find((r) => r.id === id)?.name ?? id;
  function spawnConflict() {
    const targetId = selectedAircraftId;
    const target = sim.state().aircraft.find((a) => a.id === targetId);
    if (!target || target.status !== 'flying') return say('Spawn a conflict: select a flying aircraft first.');
    if (sim.state().aircraft.length + 1 > MOST_AIRCRAFT) return say(`Nothing was added: the most is ${MOST_AIRCRAFT} aircraft. Clear finished aircraft or remove some first.`);
    // The SI pattern's conflicts come in on the SI Rejoin (its base and final); any other choice is its own route.
    const routeId = siChosen ? 'ENT2' : spawnRouteId(settings.get().spawnRoute, flownRoutes());
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
        // Anywhere along the route (TR-64), not only at its spots (Patrick, 4 Oct).
        const id = sim.spawn({ type: settings.get().spawnType, routeId, startPoint: 1, backFt: plan.backFt, delaySec: plan.delaySec });
        const route = setup.routes.find((r) => r.id === routeId);
        const after = route?.points?.[plan.startPoint - 1]?.label ?? `point ${plan.startPoint}`;
        const nm = (plan.backFt / FT_PER_NM).toFixed(1);
        const toEnd = routeId === 'ENT2' ? 'from the threshold' : routeId === 'ENT1' ? 'back from the Merge' : 'before the end of the route';
        const when = plan.delaySec > 0 ? `in ${Math.round(plan.delaySec)} s` : 'now';
        say(`Added ${id} on ${routeName(routeId)}, ${nm} NM ${toEnd} (past ${after}), ${when}: it meets ${targetId} in about ${Math.round(plan.inSec)} s.`);
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

  const conflictButton = h('button', { type: 'button', class: 'button', disabled: true, title: 'Select an aircraft first', onclick: spawnConflict }, 'Spawn a conflict');
  // The button waits for a selected aircraft (Patrick: "when an aircraft is selected") and a route to put the new one on.
  const conflictButtonFollows = () => {
    const on = Boolean(selectedAircraftId) && !pflChosen;
    conflictButton.disabled = !on;
    conflictButton.title = on ? `A new aircraft on the route above, timed to meet ${selectedAircraftId}` : pflChosen ? 'Choose a route above first' : 'Select an aircraft first';
  };

  // PFL from area: an aircraft already gliding with the engine out, somewhere in the training area. Its boxes show
  // when it is chosen in the Route list, in place of the spots.
  const pflBox = (id, label, unit, value, min, max) => {
    const input = h('input', { id, type: 'number', value: String(value), min: String(min), max: String(max), step: '1', inputmode: 'numeric' });
    return { input, element: h('div', { class: 'control control-number' }, h('label', { for: id }, `${label} (${unit})`), input) };
  };
  const pflRadial = pflBox('traffic-pfl-radial', 'Radial', '°T', 180, 0, 360);
  const pflDist = pflBox('traffic-pfl-dist', 'Distance', 'NM', 5, 1, 30);
  const pflAlt = pflBox('traffic-pfl-alt', 'Altitude', 'ft MSL', 7500, 3000, 15000);
  const spawnPfl = () => {
    const [radialDeg, distNm, altFt] = [pflRadial, pflDist, pflAlt].map((b) => Number(b.input.value));
    if (![radialDeg, distNm, altFt].every(Number.isFinite)) return say('PFL from area: radial, distance and altitude must be numbers.');
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
  // On profile (Patrick, 4 Oct): the start height from which this radial and distance cross High Key inside its
  // 5,000-6,000 ft window in today's wind, worked out by flying the sim's own PFL (nav-plans.js onProfileAltFt).
  const onProfile = () => {
    const [radialDeg, distNm] = [pflRadial, pflDist].map((b) => Number(b.input.value));
    if (![radialDeg, distNm].every(Number.isFinite)) return say('On profile: radial and distance must be numbers.');
    say('Working out a start on profile…');
    timers.after(0, () => {
      let found = null;
      try {
        found = onProfileAltFt(radialDeg, distNm, { windFromDeg: setup.windFromDeg ?? 360, windKt: setup.windKt ?? 0 }, setup.settings);
      } catch (err) {
        console.error('On profile failed:', err);
        return say('On profile could not be worked out.');
      }
      if (found.problem) return say(`On profile: ${found.problem}`);
      pflAlt.input.value = String(found.altFt);
      say(`On profile: from ${feet(found.altFt)} ft it crosses High Key at ${feet(found.highKeyFt)} ft in today's wind. Press + Spawn PFL.`);
    });
  };
  const pflFields = h(
    'div',
    { class: 'spawner-pfl', hidden: true },
    pflRadial.element,
    pflDist.element,
    pflAlt.element,
    h('div', { class: 'spawn-buttons' },
      h('button', { type: 'button', class: 'button', title: 'Sets the altitude so it crosses High Key between 5,000 and 6,000 ft in the wind set now', onclick: onProfile }, 'On profile'),
      h('button', { type: 'button', class: 'button danger', onclick: spawnPfl }, '+ Spawn PFL')),
  );

  /** The spots for a route, or the PFL boxes for "PFL from area". */
  function showRouteParts() {
    spotsHint.hidden = pflChosen;
    spots.hidden = pflChosen;
    advanced.hidden = pflChosen; // the delay and pairs are for the spots
    pflFields.hidden = !pflChosen;
    if (!pflChosen) fillSpots();
  }

  // "Spawn aircraft" opens and closes like Traffic settings, closed at first (Patrick, 4 Oct).
  const spawnPanel = createPanel({ title: 'Spawn aircraft', collapsed: true });
  const spawnerBody = h(
    'section',
    { class: 'spawner', 'aria-label': 'Spawn aircraft' },
    h('div', { class: 'spawner-head' }, callsignBadge),
    controls.select('spawnType', { label: 'Type', options: SPAWN_TYPES.map((type) => [type, type]) }),
    h('div', { class: 'control control-select' }, h('label', { for: routeSelect.id }, 'Route'), routeSelect),
    spotsHint,
    spots,
    pflFields,
    h('div', { class: 'spawn-buttons' }, conflictButton, h('button', { type: 'button', class: 'button', onclick: clearFinished }, 'Clear finished')),
    advanced,
    message,
  );
  spawnPanel.body.append(spawnerBody);
  const spawner = spawnPanel.element;

  // TR-14: no spot button acts while a box it reads refuses what was typed (the setting would keep its last good
  // value, which the person can't see). The box shows its own message; the spawner's line names the box too.
  function guardButton(button, keys) {
    button.addEventListener('click', (event) => {
      // The guard has run by the end of the click: if it held the action back, say which box to fix.
      timers.after(0, () => {
        if (!event.defaultPrevented) return;
        const bad = keys.filter((k) => controls.invalid().includes(k)).map((k) => BOX_NAMES[k]);
        if (bad.length) say(`Nothing was added: fix the ${bad.join(' and ')} box first.`);
      });
    }, true); // registered first, so it sees the click before the guard stops it
    controls.guard(button, keys);
  }

  fillRoutes();
  showRouteParts();
  showSpotsHint();
  settings.subscribe?.(() => showSpotsHint());

  // ---- the aircraft list and the conflicts ------------------------------------
  const listBody = h('ul', { class: 'aircraft-list' });
  const emptyNote = h('p', { class: 'aircraft-empty' }, 'No aircraft yet. Press a spot under Spawn to add one.');
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
    },
    /** The routes changed (one was made, renamed or removed): the spawner's route list follows. */
    routesChanged() {
      fillRoutes();
      showRouteParts();
    },
    selectAircraft: setSelected,
    selectedAircraft: () => selectedAircraftId,
  };
}
