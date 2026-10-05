// The Traffic Sim's screen (specs/SPEC-traffic.md: The screen, R2, R22): three
// columns, none covering another. Setup on the left (scenarios, wind, routes), the map in the middle
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

export const SIMPLIFIED_NOTE = 'Simplified: aircraft fly their routes at set speeds, no avoiding action.';

/** Backwards-compatibility stub: published military procedures are immutable. */
export const NEW_ROUTE_CHOICES = Object.freeze([]);
export const newRouteChoices = () => NEW_ROUTE_CHOICES;

/** The words beside a route's name: "Hidden" when it is off the map, else nothing; the name says what it is (Patrick, 4 Oct). */
export const routeDetail = (row) => (row.visible === false ? 'Hidden' : '');

/**
 * bar: the playback bar (playback-bar.js). listen: app.listen.
 * on: { toggleRoute(id), newRoute(kind), toggleColumn(name, open) } where name is 'routes' or 'aircraft' for a column.
 * The 3D view's camera is chosen in its own bar (camera-bar.js); the three buttons that repeated it went (Patrick, 4 Oct).
 * available: { pfl } (the PFL choice in + New route).
 * @param {{ bar: any, listen: any, on?: { toggleRoute?: (id: string) => void, newRoute?: (kind: string) => void, toggleColumn?: (name: string, open: boolean) => void }, available?: { pfl?: boolean }, filterSplits?: boolean }} options
 */
export function createLayout({ bar, listen, on = {}, available = {}, filterSplits = false }) {
  const openLines = new Set(); // the route rows whose line settings are open, kept when the list is rebuilt
  let closedRoute = null;

  // Slots for pieces built elsewhere; an empty one takes no room.
  const slot = (name) => h('div', { class: `traffic-slot traffic-slot-${name}` });
  const slots = { setup: slot('setup'), pointTable: slot('point-table'), leftExtras: slot('left-extras'), profiles: slot('profiles'), spawner: slot('spawner'), aircraft: slot('aircraft'), conflicts: slot('conflicts'), settings: slot('settings'), layers: slot('layers') };

  // Left column, "Setup" (Patrick, 4 Oct 11:05Z): the scenario buttons and the wind, Profiles and notes (closed: one line), and the routes list.
  // Each route's row shows or hides its line on the map (Patrick, 4 Oct); the aircraft on it fly on either way.
  const listTitle = h('p', { class: 'traffic-subtitle' }, 'Routes on the map');
  const list = h('ul', { class: 'route-list', 'aria-label': 'Routes on the map: press one to show or hide it' });
  const empty = h('p', { class: 'route-empty' }, 'No routes yet.');
  const routesPanel = createPanel({ title: 'Setup', onToggle: (collapsed) => columnToggled('routes', !collapsed) });
  routesPanel.element.classList.add('panel-pop'); // stands out as clickable (Patrick, 5 Oct)
  // Traffic settings sit at the foot of the Setup column (Patrick, 4 Oct: it was in the Aircraft column).
  // Display (Patrick, 4 Oct): the routes on the map and the layers, in one box that opens and closes like Traffic
  // settings, closed at first.
  const displayPanel = createPanel({ title: 'Display', collapsed: true });
  displayPanel.body.append(listTitle, list, empty, h('p', { class: 'traffic-subtitle' }, 'Layers'), slots.layers);
  routesPanel.body.append(slots.setup, slots.profiles, displayPanel.element, slots.pointTable, slots.leftExtras, slots.settings);
  const routesCol = h('aside', { class: 'traffic-col traffic-col-routes', 'aria-label': 'Setup' }, routesPanel.element);

  // Middle: the bar, then the map with its one-line hint, then the note under it.
  const canvas = h('canvas', { class: 'traffic-map' });
  const hint = h('p', { class: 'traffic-hint', role: 'status', hidden: true });
  const credit = h('p', { class: 'traffic-credit', 'aria-live': 'polite', hidden: true }); // Esri's credit, or that the photo needs a connection
  // The 3D view: a box the size of the map for its canvases (made when 3D opens), the three camera buttons over
  // it, and a line for "Loading 3D…" or why 3D can't start (that one shows in 2D too, where the person stays).
  const stage3d = h('div', { class: 'traffic-3d', hidden: true });
  const makeInstant = (fn) => {
    let last = 0;
    return (e) => {
      if (e && e.button !== undefined && e.button !== 0) return;
      const now = Date.now();
      if (now - last < 250) return;
      last = now;
      fn?.(e);
    };
  };
  const note3d = h('p', { class: 'traffic-note3d', role: 'status', hidden: true });
  let photoText = '';
  let view = '2d';
  const stage = h(
    'section',
    { class: 'traffic-stage', 'aria-label': 'Map and playback' },
    bar.element,
    h('div', { class: 'traffic-map-wrap' }, canvas, stage3d, hint, credit, note3d),
    h('p', { class: 'traffic-note' }, SIMPLIFIED_NOTE),
  );

  // Right column: the spawner (Spawn aircraft, a box that opens and closes), then the aircraft list and the conflicts.
  // The Traffic settings menu moved to the Setup column (Patrick, 4 Oct).
  const aircraftPanel = createPanel({ title: 'Aircraft', onToggle: (collapsed) => columnToggled('aircraft', !collapsed) });
  aircraftPanel.body.append(slots.spawner, slots.aircraft, slots.conflicts);
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
    const kept = active && list.contains(active) ? /** @type {HTMLElement} */ (active).dataset.routeId : null;
    clear(list);
    const buttons = new Map();
    for (const row of rows) {
      const swatch = h('span', { class: `route-swatch kind-${row.kind}`, 'aria-hidden': 'true' });
      swatch.style.setProperty('--route', row.color);
      const trigger = makeInstant(() => on.toggleRoute?.(row.id));
      const shown = row.visible !== false;
      const rowButton = h(
        'button',
        { type: 'button', class: 'route-row', dataset: { routeId: row.id }, 'aria-pressed': String(shown), title: `${shown ? 'Hide' : 'Show'} ${row.name} on the map`, onpointerdown: trigger, onclick: trigger },
        swatch,
        h('span', { class: 'route-name' }, row.name),
        h('span', { class: 'route-detail' }, routeDetail(row)),
      );
      buttons.set(row.id, rowButton);
      // A route's line settings (Patrick, 4 Oct): thickness, opacity, and in 3D at its heights or on the ground, behind
      // a small ▸ beside the row. Rows without a line (the PFL circle) have none.
      if (!row.line) {
        list.appendChild(h('li', {}, rowButton));
        continue;
      }
      const open = openLines.has(row.id);
      const panel = h('div', { class: 'route-line-settings', hidden: !open });
      const more = h('button', { type: 'button', class: 'button route-line-more', 'aria-expanded': String(open), 'aria-label': `Line settings for ${row.name}`, title: `Line settings for ${row.name}` }, open ? '▾' : '▸');
      more.addEventListener('click', () => {
        const now = panel.hidden;
        panel.hidden = !now;
        more.textContent = now ? '▾' : '▸';
        more.setAttribute('aria-expanded', String(now));
        if (now) openLines.add(row.id); else openLines.delete(row.id);
      });
      const range = (label, min, max, step, value, show, onValue) => {
        const id = `route-line-${row.id}-${label.toLowerCase()}`;
        const out = h('span', { class: 'route-line-value' }, show(value));
        const input = h('input', { id, type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) });
        input.addEventListener('input', () => { out.textContent = show(Number(input.value)); onValue(Number(input.value)); });
        return h('div', { class: 'route-line-control' }, h('label', { for: id }, label), input, out);
      };
      const ground = h('input', { id: `route-line-${row.id}-ground`, type: 'checkbox', checked: Boolean(row.line.onGround) });
      ground.addEventListener('change', () => on.routeLine?.(row.id, { onGround: ground.checked }));
      panel.append(
        range('Thickness', 0.5, 4, 0.25, row.line.lineScale, (v) => `×${v}`, (v) => on.routeLine?.(row.id, { lineScale: v })),
        range('Opacity', 0.1, 1, 0.05, row.line.lineOpacity, (v) => `${Math.round(v * 100)}%`, (v) => on.routeLine?.(row.id, { lineOpacity: v })),
        h('div', { class: 'route-line-control' }, ground, h('label', { for: ground.id }, 'Draw on the ground (3D)')),
      );
      list.appendChild(h('li', {}, h('div', { class: 'route-line-row' }, rowButton, more), panel));
    }
    empty.hidden = rows.length > 0;
    listTitle.hidden = rows.length === 0;
    const focusTarget = kept ?? closedRoute;
    if (focusTarget !== null) buttons.get(focusTarget)?.focus();
    closedRoute = null;
    return buttons;
  }

  return {
    element,
    /** The map's <canvas>, for createMap2d. */
    canvas,
    /** Empty places for the pieces built elsewhere: setup, pointTable, leftExtras, profiles, spawner, aircraft, conflicts, settings. */
    slots,
    /**
     * Shows the routes, one line each ({ id, name, kind, color, link?, visible? }); a row is pressed while its route shows on the map.
     */
    setRoutes(rows) {
      const displayRows = filterSplits ? rows.filter((row) => row && row.kind !== 'split') : rows.filter(Boolean);
      renderRoutes(displayRows);
    },
    /** Opens or collapses a side column ('routes' or 'aircraft') without calling toggleColumn. */
    setColumnOpen(name, open) {
      columns[name].panel.setCollapsed(!open);
      columns[name].col.classList.toggle('is-collapsed', !open);
    },
    /** The photo's line in the map's corner: Esri's credit, or that the photo needs a connection; '' hides it. */
    setPhotoNote(text) {
      photoText = text || '';
      if (credit.textContent !== photoText) credit.textContent = photoText;
      credit.hidden = !photoText || view === '3d'; // the photo is under the 2D map only
    },
    /** The box the 3D view puts its canvases in (createView3d's `host`). */
    stage3d,
    /** Which picture is on screen: '2d' (the map) or '3d'. The View setting is what the person chose; this is what shows. */
    setView(next) {
      view = next === '3d' ? '3d' : '2d';
      canvas.hidden = view === '3d';
      stage3d.hidden = view !== '3d';
      credit.hidden = !photoText || view === '3d';
    },
    /** A short line on the map ("Loading 3D…", "3D needs WebGL"), or '' for none. */
    setNote3d(text) {
      const words = text || '';
      if (note3d.textContent !== words) note3d.textContent = words;
      note3d.hidden = !words;
    },
    /** The one line on the map ("Press Play to watch the Moose Jaw traffic."); nothing hides it. */
    setHint(text) {
      const words = text || '';
      if (hint.textContent !== words) hint.textContent = words;
      hint.hidden = !words;
    },
  };
}
