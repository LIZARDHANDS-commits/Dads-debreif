// The left column's route editor (specs/SPEC-traffic.md: The screen, task 5): make a new
// pattern, entry or split, rename it, say where an entry or split joins, and change its
// points (height, speed, G, label; add a point, delete a point). Every change goes straight
// into the setup the engine flies, so the map and the aircraft follow at once.
//
// The first half is plain functions on the setup's routes (no page), tested in Node. The
// second half puts them on the page: names and labels go in as text, never as HTML.
//
// Links between routes are by point number counted from 0 (route.js), so adding or deleting
// a point moves the links of the routes that join it. That is done here, in one place.
import { h, clear } from '../../ui-kit/dom.js';
import { createControls } from '../../ui-kit/controls.js';
import { createPanel } from '../../ui-kit/panel.js';
import { LIMITS } from './defaults.js';
import { DEFAULT_ROUTE_OPTIONS, newEntry, newPattern, newSplit, nextRouteColor } from './route.js';
import { legDistanceRows, pointRows } from './readouts.js';

/** The label V6 gives a point made with + Point (its built-in data has them too). */
export const NEW_POINT_LABEL = 'New Point';

/** The fewest points a route keeps: a pattern needs a loop, an entry or split needs two ends. */
export const MIN_POINTS = Object.freeze({ pattern: 3, entry: 2, split: 2 });

const KIND_WORD = Object.freeze({ pattern: 'Pattern', entry: 'Entry', split: 'Split' });
const ID_PREFIX = Object.freeze({ pattern: 'PAT', entry: 'ENT', split: 'SPL' });

// ── Routes ───────────────────────────────────────────────────────────────────

/**
 * Hands out route ids: "PAT2", "ENT5", "SPL3". A number is never used twice, even after its
 * route is gone, so nothing ever finds a new route wearing an old one's id (#44).
 * Returns `next(kind, routes)`.
 */
export function createIdMaker(routes = []) {
  const last = Object.fromEntries(Object.keys(ID_PREFIX).map((kind) => [kind, 0]));
  for (const route of routes) {
    for (const [kind, prefix] of Object.entries(ID_PREFIX)) {
      const match = new RegExp(`^${prefix}(\\d+)$`).exec(route.id);
      if (match) last[kind] = Math.max(last[kind], Number(match[1]));
    }
  }
  return (kind, current = []) => {
    let id;
    do id = `${ID_PREFIX[kind]}${++last[kind]}`;
    while (current.some((r) => r.id === id));
    return id;
  };
}

/** The name a new route starts with: "Pattern 2", the next number of its kind that no route has. */
export function newRouteName(kind, routes) {
  let n = routes.filter((r) => r.kind === kind).length + 1;
  const names = new Set(routes.map((r) => r.name));
  while (names.has(`${KIND_WORD[kind]} ${n}`)) n++;
  return `${KIND_WORD[kind]} ${n}`;
}

/**
 * A new route of a kind ('pattern', 'entry' or 'split') from V6's builders. An entry or split
 * joins the selected pattern, or the first pattern when none is selected. It gets the next colour
 * and a fresh id and name. Returns { route } (not yet added to `routes`) or { problem } in words.
 */
export function makeRoute(kind, { routes, selectedId = null, nextId }) {
  if (!KIND_WORD[kind]) return { problem: 'That kind of route cannot be made yet.' };
  const id = nextId(kind, routes);
  const name = newRouteName(kind, routes);
  if (kind === 'pattern') return { route: newPattern(id, name, { color: nextRouteColor(routes) }) };
  const selected = routes.find((r) => r.id === selectedId);
  const pattern = selected?.kind === 'pattern' ? selected : routes.find((r) => r.kind === 'pattern');
  if (!pattern) return { problem: `Make a pattern first: an ${kind} joins a pattern.` };
  return { route: (kind === 'entry' ? newEntry : newSplit)(id, name, pattern.id, routes) };
}

/** Checks a new name for a route: { name } trimmed, or { problem } saying why not. */
export function checkName(routes, route, text) {
  const name = String(text).trim();
  if (!name) return { problem: 'A route needs a name.' };
  if (routes.some((r) => r !== route && r.name.toLowerCase() === name.toLowerCase())) return { problem: `Another route is already called ${name}.` };
  return { name };
}

// ── Links ────────────────────────────────────────────────────────────────────

/** The links a route has, in the order the editor shows them. `routeKey` and `indexKey` are the route's fields. */
export function linkFields(route) {
  if (route.kind === 'entry') return [{ text: 'Joins', routeKey: 'attachTo', indexKey: 'mergeIndex' }];
  if (route.kind === 'split') return [{ text: 'Leaves', routeKey: 'sourceRoute', indexKey: 'sourceIndex' }, { text: 'Rejoins', routeKey: 'attachTo', indexKey: 'mergeIndex' }];
  return [];
}

/**
 * Puts the ends of an entry or split back on the points they are linked to: a split starts at
 * the point it leaves, and an entry or split ends at the point it joins. Only the place moves.
 */
export function joinEnds(routes, route) {
  const at = (id, index) => routes.find((r) => r.id === id)?.points[index];
  const end = route.points[route.points.length - 1];
  const merge = route.kind === 'pattern' ? null : at(route.attachTo, route.mergeIndex);
  if (merge && end) Object.assign(end, { x: merge.x, y: merge.y });
  const source = route.kind === 'split' ? at(route.sourceRoute, route.sourceIndex) : null;
  if (source && route.points[0]) Object.assign(route.points[0], { x: source.x, y: source.y });
}

/** Sets where a route is linked ({ attachTo, mergeIndex, sourceRoute, sourceIndex }, any of them) and moves its ends to fit. */
export function setLink(routes, route, patch) {
  for (const key of ['attachTo', 'mergeIndex', 'sourceRoute', 'sourceIndex']) if (key in patch) route[key] = patch[key];
  for (const { routeKey, indexKey } of linkFields(route)) {
    const target = routes.find((r) => r.id === route[routeKey]);
    if (target) route[indexKey] = Math.max(0, Math.min(route[indexKey] | 0, target.points.length - 1));
  }
  joinEnds(routes, route);
}

/** Every link of the other routes that names `route`, as { other, indexKey }. */
function linksTo(routes, route) {
  const found = [];
  for (const other of routes) {
    if (other === route) continue;
    for (const { routeKey, indexKey } of linkFields(other)) if (other[routeKey] === route.id) found.push({ other, indexKey });
  }
  return found;
}

// ── Points ───────────────────────────────────────────────────────────────────

const average = (a, b) => (a + b) / 2;

/**
 * Adds a point after point `afterIndex` (V6's rule): halfway to the next point, with the average
 * height, speed and G of the two, labelled "New Point". After the last point of a pattern it goes
 * between the last and the first; an entry or split keeps its last point where it joins, so a point
 * "after" the last goes just before it. Links to later points of the route move up by one.
 * Changes `route` in place and returns the new point's index.
 */
export function insertPoint(routes, route, afterIndex) {
  const count = route.points.length;
  const open = route.kind !== 'pattern';
  const after = Math.max(0, Math.min(afterIndex | 0, count - 1 - (open && count > 1 ? 1 : 0)));
  const a = route.points[after], b = route.points[(after + 1) % count];
  const placed = {
    label: NEW_POINT_LABEL, x: average(a.x, b.x), y: average(a.y, b.y),
    alt: average(a.alt ?? 2500, b.alt ?? 2500), kt: average(a.kt ?? 120, b.kt ?? 120), g: average(a.g ?? 2, b.g ?? 2),
  };
  const at = after + 1;
  route.points.splice(at, 0, placed);
  for (const { other, indexKey } of linksTo(routes, route)) if (other[indexKey] >= at) other[indexKey] += 1;
  return at;
}

/**
 * Deletes point `index`. Refused (returns { problem }) when the route would be left with too few
 * points. Links to later points move down by one; a link to the deleted point moves to the point
 * before it, and the route that was linked moves its end there. Returns { ok: true }.
 */
export function deletePoint(routes, route, index) {
  const least = MIN_POINTS[route.kind] ?? 2;
  if (!Number.isInteger(index) || index < 0 || index >= route.points.length) return { problem: 'Pick the point to delete first: click in its row.' };
  if (route.points.length <= least) return { problem: `${route.name} needs at least ${least} points, so this one stays.` };
  route.points.splice(index, 1);
  const count = route.points.length;
  const moved = [];
  for (const { other, indexKey } of linksTo(routes, route)) {
    if (other[indexKey] > index) other[indexKey] -= 1;
    else if (other[indexKey] === index) {
      other[indexKey] = Math.min(Math.max(0, index - 1), count - 1);
      moved.push(other);
    }
  }
  for (const other of moved) joinEnds(routes, other);
  // An entry or split starts and ends where it is linked, so whichever point is now first or last goes back there.
  if (route.kind !== 'pattern') joinEnds(routes, route);
  return { ok: true };
}

// ── On the page ──────────────────────────────────────────────────────────────

/** A store for one point's boxes: reads and writes the point itself, so the boxes are always its values. */
function pointStore(point, changed) {
  let values = { alt: point.alt ?? 2500, kt: point.kt ?? 120, g: point.g ?? 2 };
  const listeners = new Set();
  return {
    get: () => values,
    update(patch) {
      values = { ...values, ...patch };
      Object.assign(point, patch);
      for (const fn of [...listeners]) fn(values);
      changed();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/**
 * The editor for the selected route. `setup` is the engine's setup (edited in place);
 * `onChange({ structure })` is called after every change so the screen can redraw:
 * `structure` is true when routes, names, links or the number of points changed.
 * Returns { element, message, show(routeId), refresh(), say(text), dispose() }: `element` is the
 * point table for the layout's slot, `message` is the line the editor writes to, and `refresh()`
 * rewrites the readouts after the route options changed.
 */
export function createRouteEditor({ setup, onChange }) {
  let route = null;
  let selected = null; // the point picked in the list (0-based), the one + Point adds after and Delete point removes
  let rows = []; // [{ li, data, controls }] for the points of the list
  let ids = 0;

  const message = h('p', { class: 'editor-message', role: 'status' });
  const say = (text) => {
    if (message.textContent !== text) message.textContent = text;
  };

  // ---- the name and the links ----
  const nameInput = h('input', { type: 'text', id: 'traffic-route-name', autocomplete: 'off' });
  nameInput.addEventListener('input', () => {
    if (!route) return;
    const checked = checkName(setup.routes, route, nameInput.value);
    if (checked.problem) return say(checked.problem);
    say('');
    if (checked.name === route.name) return;
    route.name = checked.name;
    showLinks();
    onChange({ structure: true });
  });
  nameInput.addEventListener('change', () => {
    if (route) nameInput.value = route.name; // leaving the box with a name that was refused shows the name that stands
  });
  const nameField = h('div', { class: 'control editor-name' }, h('label', { for: nameInput.id }, 'Name'), nameInput);

  const links = h('div', { class: 'editor-links' });
  function showLinks() {
    clear(links);
    if (!route) return;
    for (const { text, routeKey, indexKey } of linkFields(route)) {
      const routeId = `traffic-link-${++ids}`, pointId = `traffic-link-${++ids}`;
      const target = setup.routes.find((r) => r.id === route[routeKey]);
      const routeSelect = h('select', { id: routeId });
      if (!target) routeSelect.appendChild(h('option', { value: '' }, 'Not linked'));
      for (const other of setup.routes) if (other !== route) routeSelect.appendChild(h('option', { value: other.id }, other.name));
      routeSelect.value = target ? target.id : '';
      const pointSelect = h('select', { id: pointId });
      for (const [i, p] of (target?.points ?? []).entries()) pointSelect.appendChild(h('option', { value: String(i) }, `${i + 1} ${p.label || ''}`.trim()));
      pointSelect.value = String(route[indexKey]);
      const apply = (patch) => {
        setLink(setup.routes, route, patch);
        showLinks();
        showLegs();
        onChange({ structure: true });
      };
      routeSelect.addEventListener('change', () => routeSelect.value && apply({ [routeKey]: routeSelect.value }));
      pointSelect.addEventListener('change', () => apply({ [indexKey]: Number(pointSelect.value) }));
      links.appendChild(h('div', { class: 'editor-link' }, h('label', { for: routeId }, text), routeSelect, h('label', { for: pointId }, 'at point'), pointSelect));
    }
  }

  // ---- the points ----
  const list = h('ol', { class: 'point-list' });

  function select(index) {
    selected = index;
    rows.forEach((row, i) => {
      row.li.classList.toggle('is-selected', i === index);
      if (i === index) row.li.setAttribute('aria-current', 'true');
      else row.li.removeAttribute('aria-current');
    });
  }

  function showData() {
    const options = setup.routeOptions ?? DEFAULT_ROUTE_OPTIONS;
    const text = route ? pointRows(route, options) : [];
    rows.forEach((row, i) => {
      const words = text[i]?.turnText ? `${text[i].dataText}, ${text[i].turnText}` : (text[i]?.dataText ?? '');
      if (row.data.textContent !== words) row.data.textContent = words;
    });
  }

  function showPoints() {
    for (const row of rows) row.controls.dispose();
    rows = [];
    clear(list);
    if (!route) return;
    route.points.forEach((point, i) => {
      const store = pointStore(point, () => {
        showData();
        onChange({ structure: false });
      });
      const controls = createControls(store);
      const label = h('input', { type: 'text', class: 'point-label', 'aria-label': `Point ${i + 1} label`, autocomplete: 'off' });
      label.value = point.label ?? '';
      label.addEventListener('input', () => {
        point.label = label.value;
        onChange({ structure: false });
      });
      const data = h('p', { class: 'point-data' });
      const li = h(
        'li',
        { class: 'point-row', dataset: { point: String(i) } },
        h('div', { class: 'point-line' }, h('span', { class: 'point-number' }, String(i + 1)), label),
        h(
          'div',
          { class: 'point-values' },
          controls.number('alt', { label: 'Alt ft', unit: 'ft', min: LIMITS.pointAltFt[0], max: LIMITS.pointAltFt[1], step: 100 }),
          controls.number('kt', { label: 'KT', min: LIMITS.pointKias[0], max: LIMITS.pointKias[1], step: 5 }),
          controls.number('g', { label: 'G', min: LIMITS.pointG[0], max: LIMITS.pointG[1], step: 0.1 }),
        ),
        data,
      );
      li.addEventListener('focusin', () => select(i));
      li.addEventListener('click', () => select(i));
      rows.push({ li, data, controls });
      list.appendChild(li);
    });
    showData();
    select(selected !== null && selected < rows.length ? selected : null);
  }

  // ---- the leg distances ----
  const legList = h('ul', { class: 'leg-list' });
  const legs = createPanel({ title: 'Leg distances', collapsed: true });
  legs.body.append(legList);
  function showLegs() {
    clear(legList);
    if (!route) return;
    for (const leg of legDistanceRows(route)) {
      legList.appendChild(h('li', { class: 'leg-row' }, h('span', { class: 'leg-name' }, leg.leg), ` ${Number(leg.ftText).toLocaleString('en-CA')} ft, ${leg.nmText} NM`));
    }
  }

  // ---- + Point and Delete point ----
  function addPoint() {
    if (!route) return;
    const at = insertPoint(setup.routes, route, selected ?? route.points.length - 1);
    selected = at;
    showPoints();
    showLinks();
    showLegs();
    rows[at]?.li.querySelector?.('input')?.focus();
    say(`Added point ${at + 1}. Give it a name, height and speed.`);
    onChange({ structure: true });
  }

  function removePoint() {
    if (!route) return;
    if (selected === null) return say('Pick the point to delete first: click in its row.');
    const index = selected;
    const done = deletePoint(setup.routes, route, index);
    if (done.problem) return say(done.problem);
    selected = Math.min(index, route.points.length - 1);
    showPoints();
    showLinks();
    showLegs();
    say(`Deleted point ${index + 1}.`);
    onChange({ structure: true });
  }

  const buttons = h(
    'div',
    { class: 'point-buttons' },
    h('button', { type: 'button', class: 'button', onclick: addPoint }, '+ Point'),
    h('button', { type: 'button', class: 'button', onclick: removePoint }, 'Delete point'),
  );

  const element = h('div', { class: 'route-editor' }, nameField, links, list, buttons, legs.element);

  return {
    element,
    message,
    say,
    /** Shows the route with this id (or none). */
    show(routeId) {
      const next = setup.routes.find((r) => r.id === routeId) ?? null;
      if (next !== route) selected = null;
      route = next;
      say('');
      nameInput.value = route?.name ?? '';
      showLinks();
      showPoints();
      showLegs();
    },
    /** The route options changed: the turn data in the point rows follows. */
    refresh: showData,
    dispose() {
      for (const row of rows) row.controls.dispose();
      rows = [];
    },
  };
}
