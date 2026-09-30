// The Traffic Sim's screen (specs/SPEC-traffic.md: The screen, R2, R22): three
// columns, none covering another. Routes on the left, the map in the middle
// with the playback bar above it (not on it), Aircraft on the right. Each side
// column collapses with a real button (ui-kit panel.js), and the map takes the room.
//
// Only the essentials show at first. No route is selected when the sim opens, so
// the left column is just the routes list and the "+ New route" menu; the point
// table's place appears when a route is picked and closes again with its ✕. The
// spawner, aircraft list and conflicts of the right column, and the point table,
// are built elsewhere and put into the empty slots this file makes.
//
// It builds the screen and reports what was pressed; it holds no traffic
// data. All names go in as text (h, textContent), never as HTML.
import { h, clear } from '../../ui-kit/dom.js';
import { createPanel } from '../../ui-kit/panel.js';
import { createMenu } from './playback-bar.js';

export const SIMPLIFIED_NOTE = 'Simplified: aircraft fly their routes at set speeds, no avoiding action.';

/** What + New route offers, in order. `needs` is a feature that has to exist. */
export const NEW_ROUTE_CHOICES = Object.freeze([
  { kind: 'pattern', label: 'Pattern' },
  { kind: 'entry', label: 'Entry' },
  { kind: 'split', label: 'Split' },
  { kind: 'pfl', label: 'PFL', needs: 'pfl' },
]);

/** The choices to list, leaving out those whose feature isn't built yet: available = { pfl }. */
export const newRouteChoices = (available = {}) => NEW_ROUTE_CHOICES.filter((c) => !c.needs || available[c.needs] === true);

/** The second line of a route's row: where it joins ("→ Pattern 1 P8", "P6 → P1"), or its kind. */
export const routeDetail = (row) => row.link || row.kind;

/**
 * bar: the playback bar (playback-bar.js). listen: app.listen.
 * on: { selectRoute(id | null), newRoute(kind), toggleColumn(name, open) } where name is 'routes' or 'aircraft'.
 * available: { pfl } (the PFL choice in + New route).
 */
export function createLayout({ bar, listen, on = {}, available = {} }) {
  let selectedId = null;
  let closedRoute = null; // the route whose details were just closed with ✕, to give focus back to its row

  // Slots for pieces built elsewhere; an empty one takes no room.
  const slot = (name) => h('div', { class: `traffic-slot traffic-slot-${name}` });
  const slots = { pointTable: slot('point-table'), leftExtras: slot('left-extras'), spawner: slot('spawner'), aircraft: slot('aircraft'), conflicts: slot('conflicts'), settings: slot('settings') };

  // Left column: the routes list, + New route, and the selected route's point table.
  const list = h('ul', { class: 'route-list' });
  const empty = h('p', { class: 'route-empty' }, 'No routes yet. Use + New route to make one.');
  const newRoute = createMenu({
    label: '+ New route',
    listen,
    children: newRouteChoices(available).map((choice) =>
      h('button', { type: 'button', class: 'button menu-item', onclick: () => {
        newRoute.setOpen(false);
        on.newRoute?.(choice.kind);
      } }, choice.label)),
  });
  const tableTitle = h('h3', { class: 'point-table-title' });
  const tableClose = h('button', { type: 'button', class: 'button point-table-close', 'aria-label': 'Close route details', onclick: () => {
    closedRoute = selectedId;
    on.selectRoute?.(null);
  } }, '✕');
  const tableSection = h('section', { class: 'point-table-section', hidden: true }, h('div', { class: 'point-table-head' }, tableTitle, tableClose), slots.pointTable);
  const routesPanel = createPanel({ title: 'Routes', onToggle: (collapsed) => columnToggled('routes', !collapsed) });
  routesPanel.body.append(list, empty, newRoute.element, tableSection, slots.leftExtras);
  const routesCol = h('aside', { class: 'traffic-col traffic-col-routes', 'aria-label': 'Routes' }, routesPanel.element);

  // Middle: the bar, then the map with its one-line hint, then the note under it.
  const canvas = h('canvas', { class: 'traffic-map' });
  const hint = h('p', { class: 'traffic-hint', role: 'status', hidden: true });
  const stage = h(
    'section',
    { class: 'traffic-stage', 'aria-label': 'Map and playback' },
    bar.element,
    h('div', { class: 'traffic-map-wrap' }, canvas, hint),
    h('p', { class: 'traffic-note' }, SIMPLIFIED_NOTE),
  );

  // Right column: the spawner, the aircraft list and the conflicts, with the Traffic settings
  // menu (settings-panel.js) last, closed until asked for, and opening in the column's flow.
  const aircraftPanel = createPanel({ title: 'Aircraft', onToggle: (collapsed) => columnToggled('aircraft', !collapsed) });
  aircraftPanel.body.append(slots.spawner, slots.aircraft, slots.conflicts, slots.settings);
  const aircraftCol = h('aside', { class: 'traffic-col traffic-col-aircraft', 'aria-label': 'Aircraft' }, aircraftPanel.element);

  const element = h('div', { class: 'traffic' }, h('h1', { class: 'visually-hidden' }, 'Traffic Pattern Sim'), routesCol, stage, aircraftCol);

  const columns = { routes: { panel: routesPanel, col: routesCol }, aircraft: { panel: aircraftPanel, col: aircraftCol } };
  function columnToggled(name, open) {
    columns[name].col.classList.toggle('is-collapsed', !open);
    on.toggleColumn?.(name, open);
  }

  function renderRoutes(rows) {
    // A rebuilt list keeps keyboard focus on the row that had it.
    const active = document.activeElement;
    const kept = active && list.contains(active) ? active.dataset.routeId : null;
    clear(list);
    const buttons = new Map();
    for (const row of rows) {
      const swatch = h('span', { class: `route-swatch kind-${row.kind}`, 'aria-hidden': 'true' });
      swatch.style.setProperty('--route', row.color);
      const rowButton = h(
        'button',
        { type: 'button', class: 'route-row', dataset: { routeId: row.id }, 'aria-current': row.id === selectedId ? 'true' : null, onclick: () => on.selectRoute?.(row.id) },
        swatch,
        h('span', { class: 'route-name' }, row.name),
        h('span', { class: 'route-detail' }, routeDetail(row)),
      );
      buttons.set(row.id, rowButton);
      list.appendChild(h('li', {}, rowButton));
    }
    empty.hidden = rows.length > 0;
    const focusTarget = kept ?? closedRoute;
    if (focusTarget !== null) buttons.get(focusTarget)?.focus();
    closedRoute = null;
    return buttons;
  }

  return {
    element,
    /** The map's <canvas>, for createMap2d. */
    canvas,
    /** Empty places for the pieces built elsewhere: pointTable, leftExtras, spawner, aircraft, conflicts, settings. */
    slots,
    /**
     * Shows the routes, one line each ({ id, name, kind, color, link? }), and which one is picked.
     * With one picked its point table shows, titled with its name; with none, only the list shows.
     */
    setRoutes(rows, selected = null) {
      selectedId = rows.some((row) => row.id === selected) ? selected : null;
      renderRoutes(rows);
      const picked = rows.find((row) => row.id === selectedId);
      tableSection.hidden = !picked;
      tableTitle.textContent = picked ? picked.name : '';
    },
    /** Opens or collapses a side column ('routes' or 'aircraft') without calling toggleColumn. */
    setColumnOpen(name, open) {
      columns[name].panel.setCollapsed(!open);
      columns[name].col.classList.toggle('is-collapsed', !open);
    },
    /** The one line on the map ("Press Play to watch the Moose Jaw traffic."); nothing hides it. */
    setHint(text) {
      const words = text || '';
      if (hint.textContent !== words) hint.textContent = words;
      hint.hidden = !words;
    },
  };
}
