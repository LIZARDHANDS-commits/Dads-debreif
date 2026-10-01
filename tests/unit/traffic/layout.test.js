// The Traffic Sim's screen (specs/SPEC-traffic.md: The screen, R2, R22): three
// columns, the bar above the map, each side column collapsible with a real
// button, and only the routes list and + New route on the left until a route is picked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './fake-dom-extras.js';
import { h } from '../../../src/ui-kit/dom.js';
import { createPlaybackBar } from '../../../src/modules/traffic/playback-bar.js';
import {
  NEW_ROUTE_CHOICES, SIMPLIFIED_NOTE, createLayout, newRouteChoices, routeDetail,
} from '../../../src/modules/traffic/layout.js';

installFakeDom();

const all = (root, test) => [root, ...root.childNodes.flatMap((child) => (child.childNodes ? all(child, test) : []))].filter(test);
const tagged = (root, tag) => all(root, (n) => n.tagName === tag);
const withClass = (root, name) => all(root, (n) => n.getAttribute?.('class')?.split(' ').includes(name));
const one = (root, name) => {
  const found = withClass(root, name);
  assert.equal(found.length, 1, `one .${name}`);
  return found[0];
};
const words = (node) => node.textContent.replace(/\s+/g, ' ').trim();
const pressable = (root, name) => tagged(root, 'BUTTON').find((b) => words(b) === name);

const ROUTES = [
  { id: 'p1', name: 'Pattern 1', kind: 'pattern', color: '#58a6ff' },
  { id: 'e1', name: 'Entry 1', kind: 'entry', color: '#7ee787', link: '→ Pattern 1 P8' },
  { id: 's1', name: 'Split 1', kind: 'split', color: '#ffcc66', link: 'P6 → P1' },
];

function setup(options = {}) {
  const calls = [];
  const controls = { number: (key, o) => h('div', {}, o.label), checkbox: (key, o) => h('div', {}, o.label), choice: (key, o) => h('div', {}, o.label) };
  const listeners = [];
  const listen = (target, type, fn) => listeners.push({ target, type, fn });
  const bar = createPlaybackBar({ controls, on: { play() {}, pause() {}, reset() {}, fit() {}, speed() {} }, listen });
  const on = {
    selectRoute: (id) => calls.push(['select', id]),
    newRoute: (kind) => calls.push(['new', kind]),
    toggleColumn: (name, open) => calls.push(['column', name, open]),
    camera: (name) => calls.push(['camera', name]),
  };
  const ui = createLayout({ bar, listen, on, available: options.available, filterSplits: options.filterSplits });
  return { ui, bar, calls, listeners };
}

test('the screen is three columns: Routes, the map with its bar above it, and Aircraft', () => {
  const { ui, bar } = setup();
  const [heading, routes, stage, aircraft] = ui.element.childNodes;
  assert.equal(heading.tagName, 'H1');
  assert.equal(words(heading), 'Traffic Pattern Sim');
  assert.equal(routes.getAttribute('aria-label'), 'Routes');
  assert.equal(stage.getAttribute('aria-label'), 'Map and playback');
  assert.equal(aircraft.getAttribute('aria-label'), 'Aircraft');
  // The bar comes before the map in the stage, so it sits above the map, not on it (#34, #35).
  const [first, second, third] = stage.childNodes;
  assert.equal(first, bar.element);
  assert.ok(withClass(second, 'traffic-map').length === 1, 'the map is next');
  assert.equal(words(third), SIMPLIFIED_NOTE);
  assert.equal(ui.canvas.tagName, 'CANVAS');
  assert.ok(second.childNodes.includes(ui.canvas));
});

test('the note under the map says the sim is simplified', () => {
  assert.equal(SIMPLIFIED_NOTE, 'Simplified: aircraft fly their routes at set speeds, no avoiding action.');
});

test('at first no route is picked: the left column shows only the routes list and + New route', () => {
  const { ui } = setup();
  const section = one(ui.element, 'point-table-section');
  assert.equal(section.hidden, true);
  assert.equal(pressable(ui.element, '+ New route')?.tagName, 'BUTTON');
  assert.equal(all(one(ui.element, 'route-list'), (n) => n.tagName === 'BUTTON').length, 0);
  assert.equal(one(ui.element, 'route-empty').hidden, false, 'an empty list says what to do');
  for (const slot of Object.values(ui.slots)) assert.equal(slot.childNodes.length, 0, 'the slots start empty');
});

test('the routes list has one line per route: its name and where it joins, or its kind', () => {
  const { ui } = setup();
  ui.setRoutes(ROUTES);
  const rows = withClass(ui.element, 'route-row');
  assert.deepEqual(rows.map((row) => withClass(row, 'route-name')[0].textContent), ['Pattern 1', 'Entry 1', 'Split 1']);
  assert.deepEqual(rows.map((row) => withClass(row, 'route-detail')[0].textContent), ['pattern', '→ Pattern 1 P8', 'P6 → P1']);
  assert.equal(one(ui.element, 'route-empty').hidden, true);
  assert.equal(routeDetail(ROUTES[1]), '→ Pattern 1 P8');
  assert.equal(routeDetail({ kind: 'split' }), 'split');
});

test('each route shows its colour and its line style, so it is told apart by more than colour', () => {
  const { ui } = setup();
  ui.setRoutes(ROUTES);
  const swatches = withClass(ui.element, 'route-swatch');
  assert.deepEqual(swatches.map((s) => s.styleProps['--route']), ['#58a6ff', '#7ee787', '#ffcc66']);
  assert.deepEqual(swatches.map((s) => s.getAttribute('class').split(' ').at(-1)), ['kind-pattern', 'kind-entry', 'kind-split']);
  assert.ok(swatches.every((s) => s.getAttribute('aria-hidden') === 'true'), 'the words say it too');
});

test('picking a route shows its point table under its name; the ✕ closes it; only that route is marked', () => {
  const { ui, calls } = setup();
  ui.setRoutes(ROUTES, 'e1');
  const section = one(ui.element, 'point-table-section');
  assert.equal(section.hidden, false);
  assert.equal(words(one(ui.element, 'point-table-title')), 'Entry 1');
  assert.deepEqual(withClass(ui.element, 'route-row').map((r) => r.getAttribute('aria-current')), [null, 'true', null]);
  assert.ok(section.contains(ui.slots.pointTable), 'the table goes in its slot');

  const close = pressable(section, '✕');
  assert.equal(close.getAttribute('aria-label'), 'Close route details');
  close.dispatch('click');
  assert.deepEqual(calls, [['select', null]]);
  ui.setRoutes(ROUTES, null);
  assert.equal(section.hidden, true);
  assert.deepEqual(withClass(ui.element, 'route-row').map((r) => r.getAttribute('aria-current')), [null, null, null]);
});

test('a route that is not in the list can\'t be picked, and a route that goes away closes its table', () => {
  const { ui } = setup();
  ui.setRoutes(ROUTES, 'gone');
  assert.equal(one(ui.element, 'point-table-section').hidden, true);
  ui.setRoutes(ROUTES, 's1');
  assert.equal(one(ui.element, 'point-table-section').hidden, false);
  ui.setRoutes(ROUTES.slice(0, 2), 's1');
  assert.equal(one(ui.element, 'point-table-section').hidden, true);
});

test('pressing a route line asks for that route', () => {
  const { ui, calls } = setup();
  ui.setRoutes(ROUTES);
  withClass(ui.element, 'route-row')[2].dispatch('click');
  assert.deepEqual(calls, [['select', 's1']]);
});

test('closing the details gives focus back to the route\'s line, and a rebuilt list keeps focus where it was', () => {
  const { ui } = setup();
  ui.setRoutes(ROUTES, 'e1');
  pressable(one(ui.element, 'point-table-section'), '✕').dispatch('click');
  ui.setRoutes(ROUTES, null);
  assert.equal(globalThis.document.activeElement.dataset.routeId, 'e1');

  withClass(ui.element, 'route-row')[2].focus();
  ui.setRoutes(ROUTES, 's1');
  assert.equal(globalThis.document.activeElement.dataset.routeId, 's1', 'still on the line the keyboard was on');
  assert.ok(withClass(ui.element, 'route-row').includes(globalThis.document.activeElement), 'and it is the new line, not the old one');
});

test('route names go in as text, never as HTML', () => {
  const { ui } = setup();
  ui.setRoutes([{ id: 'x', name: '<img src=x onerror=alert(1)>', kind: 'pattern', color: '#fff' }], 'x');
  assert.equal(tagged(ui.element, 'IMG').length, 0);
  assert.equal(withClass(ui.element, 'route-name')[0].textContent, '<img src=x onerror=alert(1)>');
  assert.equal(words(one(ui.element, 'point-table-title')), '<img src=x onerror=alert(1)>');
});

test('+ New route offers Pattern, Entry and Split (PFL once it exists), and choosing one asks for it and closes the menu', () => {
  const { ui, calls } = setup();
  const menu = one(ui.element.childNodes[1], 'traffic-menu'); // the one in the Routes column (the bar has its own)
  const body = one(menu, 'traffic-menu-body');
  assert.equal(body.hidden, true, 'closed at first');
  pressable(menu, '+ New route').dispatch('click');
  assert.equal(body.hidden, false);
  assert.deepEqual(tagged(body, 'BUTTON').map(words), ['Pattern', 'Entry', 'Split']);
  pressable(body, 'Entry').dispatch('click');
  assert.deepEqual(calls, [['new', 'entry']]);
  assert.equal(body.hidden, true);
  assert.equal(globalThis.document.activeElement, pressable(menu, '+ New route'), 'focus goes back to the + New route button');

  const withPfl = setup({ available: { pfl: true } });
  const pflBody = one(withPfl.ui.element.childNodes[1], 'traffic-menu-body');
  assert.deepEqual(tagged(pflBody, 'BUTTON').map(words), ['Pattern', 'Entry', 'Split', 'PFL']);
  pressable(pflBody, 'PFL').dispatch('click');
  assert.deepEqual(withPfl.calls, [['new', 'pfl']]);
});

test('the new-route choices are the spec\'s, with PFL only when it can be made', () => {
  assert.deepEqual(NEW_ROUTE_CHOICES.map((c) => c.kind), ['pattern', 'entry', 'split', 'pfl']);
  assert.deepEqual(newRouteChoices().map((c) => c.kind), ['pattern', 'entry', 'split']);
  assert.deepEqual(newRouteChoices({ pfl: true }).map((c) => c.kind), ['pattern', 'entry', 'split', 'pfl']);
  assert.deepEqual(newRouteChoices({ pfl: 1 }).map((c) => c.kind), ['pattern', 'entry', 'split']);
});

test('each side column collapses from a real button and says so; the other keeps its room', () => {
  const { ui, calls } = setup();
  const [, routes, , aircraft] = ui.element.childNodes;
  for (const [column, name] of [[routes, 'routes'], [aircraft, 'aircraft']]) {
    const button = withClass(column, 'panel-toggle')[0];
    assert.equal(button.tagName, 'BUTTON');
    assert.equal(button.getAttribute('aria-expanded'), 'true');
    button.dispatch('click');
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(column.classList.contains('is-collapsed'), true);
    button.dispatch('click');
    assert.equal(column.classList.contains('is-collapsed'), false);
    assert.deepEqual(calls.splice(0), [['column', name, false], ['column', name, true]]);
  }
  assert.equal(words(withClass(routes, 'panel-toggle')[0]), 'Routes');
  assert.equal(words(withClass(aircraft, 'panel-toggle')[0]), 'Aircraft');
});

test('setColumnOpen collapses or opens a column from outside (a remembered layout) without reporting it', () => {
  const { ui, calls } = setup();
  const [, routes, , aircraft] = ui.element.childNodes;
  ui.setColumnOpen('aircraft', false);
  assert.equal(aircraft.classList.contains('is-collapsed'), true);
  assert.equal(withClass(aircraft, 'panel-toggle')[0].getAttribute('aria-expanded'), 'false');
  assert.equal(routes.classList.contains('is-collapsed'), false);
  ui.setColumnOpen('aircraft', true);
  assert.equal(aircraft.classList.contains('is-collapsed'), false);
  assert.deepEqual(calls, []);
});

test('the right column has room for the spawner, the settings menu (above the aircraft list, TR-15), the aircraft list and the conflicts; the left for the point table', () => {
  const { ui } = setup();
  const [, routes, , aircraft] = ui.element.childNodes;
  for (const name of ['spawner', 'aircraft', 'conflicts', 'settings']) assert.ok(aircraft.contains(ui.slots[name]), name);
  const body = ui.slots.settings.parentNode;
  assert.deepEqual([...body.childNodes], [ui.slots.spawner, ui.slots.settings, ui.slots.aircraft, ui.slots.conflicts], 'the settings menu sits under the spawner, above the readouts, so it is found without scrolling');
  assert.ok(routes.contains(ui.slots.pointTable));
  assert.ok(routes.contains(ui.slots.leftExtras));
  // Profiles and notes sit above the routes list, so opened it is in the first screen (UI-02).
  const routesBody = ui.slots.profiles.parentNode;
  assert.ok(routes.contains(ui.slots.profiles));
  assert.equal(routesBody.childNodes[0], ui.slots.profiles, 'first in the left column');
  assert.deepEqual(Object.keys(ui.slots), ['pointTable', 'leftExtras', 'profiles', 'spawner', 'aircraft', 'conflicts', 'settings']);
});

test('the one-line hint shows over the map when given, and goes away when cleared', () => {
  const { ui } = setup();
  const hint = one(ui.element, 'traffic-hint');
  assert.equal(hint.hidden, true);
  ui.setHint('Press Play to watch the Moose Jaw traffic.');
  assert.equal(hint.hidden, false);
  assert.equal(hint.textContent, 'Press Play to watch the Moose Jaw traffic.');
  assert.equal(hint.getAttribute('role'), 'status');
  ui.setHint('');
  assert.equal(hint.hidden, true);
  ui.setHint(null);
  assert.equal(hint.hidden, true);
});

test('the photo\'s credit sits in the map\'s corner: shown with its words, hidden when there are none, and it never covers the hint', () => {
  const { ui } = setup();
  const credit = one(ui.element, 'traffic-credit');
  assert.equal(credit.hidden, true);
  ui.setPhotoNote('Imagery: Esri');
  assert.equal(words(credit), 'Imagery: Esri');
  assert.equal(credit.hidden, false);
  ui.setPhotoNote('Satellite photo needs a connection.');
  assert.equal(words(credit), 'Satellite photo needs a connection.');
  ui.setPhotoNote('');
  assert.equal(credit.hidden, true);
  ui.setPhotoNote(null);
  assert.equal(credit.hidden, true);
  assert.equal(credit.parentNode, one(ui.element, 'traffic-map-wrap'), 'in the map, not under it');
  assert.equal(credit.getAttribute('aria-live'), 'polite');
});

test('the 3D view has a box in the map, and the three camera buttons show only while 3D does', () => {
  const { ui, calls } = setup();
  const wrap = one(ui.element, 'traffic-map-wrap');
  const stage = one(ui.element, 'traffic-3d');
  const camera = one(ui.element, 'traffic-camera');
  assert.equal(ui.stage3d, stage);
  assert.equal(stage.parentNode, wrap, 'in the map\'s box, so 3D fills the map');
  assert.equal(stage.hidden, true, '2D is what opens');
  assert.equal(camera.hidden, true);
  ui.setView('3d');
  assert.equal(ui.canvas.hidden, true, 'the 2D map steps aside');
  assert.equal(stage.hidden, false);
  assert.equal(camera.hidden, false);
  assert.deepEqual(tagged(camera, 'BUTTON').map(words), ['Fit', 'High look-down', 'Low chase']);
  assert.equal(camera.getAttribute('aria-label'), 'Camera');
  for (const name of ['Fit', 'High look-down', 'Low chase']) pressable(camera, name).dispatch('click');
  assert.deepEqual(calls, [['camera', 'fit'], ['camera', 'high'], ['camera', 'low']]);
  ui.setView('2d');
  assert.equal(ui.canvas.hidden, false);
  assert.equal(stage.hidden, true);
  assert.equal(camera.hidden, true);
  ui.setView('nonsense');
  assert.equal(stage.hidden, true, 'anything but 3d is 2D');
});

test('the photo\'s credit is for the 2D map: it hides in 3D and comes back with 2D', () => {
  const { ui } = setup();
  const credit = one(ui.element, 'traffic-credit');
  ui.setPhotoNote('Imagery: Esri');
  ui.setView('3d');
  assert.equal(credit.hidden, true);
  ui.setPhotoNote('Imagery: Esri, Maxar');
  assert.equal(credit.hidden, true, 'still hidden while 3D shows');
  ui.setView('2d');
  assert.equal(credit.hidden, false);
  assert.equal(words(credit), 'Imagery: Esri, Maxar');
});

test('a line on the map says why 3D can\'t start, in 2D too, and clears again', () => {
  const { ui } = setup();
  const note = one(ui.element, 'traffic-note3d');
  assert.equal(note.hidden, true);
  assert.equal(note.getAttribute('role'), 'status');
  ui.setNote3d('3D needs WebGL, which this browser does not have.');
  assert.equal(words(note), '3D needs WebGL, which this browser does not have.');
  assert.equal(note.hidden, false);
  ui.setNote3d('');
  assert.equal(note.hidden, true);
  ui.setNote3d(null);
  assert.equal(note.hidden, true);
});

test('filterSplits filters out kind split and clears selection when split route is passed', () => {
  const { ui } = setup({ filterSplits: true });
  // With filterSplits: true, Split 1 should not appear in the routes list
  ui.setRoutes(ROUTES);
  const rows = withClass(ui.element, 'route-row');
  assert.deepEqual(rows.map((row) => withClass(row, 'route-name')[0].textContent), ['Pattern 1', 'Entry 1']);

  // Selecting a valid pattern route shows its point table
  ui.setRoutes(ROUTES, 'p1');
  const section = one(ui.element, 'point-table-section');
  assert.equal(section.hidden, false);
  assert.equal(words(one(ui.element, 'point-table-title')), 'Pattern 1');

  // Attempting to select a split route clears selection and hides the table
  ui.setRoutes(ROUTES, 's1');
  assert.equal(section.hidden, true);
  assert.equal(words(one(ui.element, 'point-table-title')), '');

  // Robust against null or undefined route items
  ui.setRoutes([null, undefined, ...ROUTES]);
  const rowsAfter = withClass(ui.element, 'route-row');
  assert.deepEqual(rowsAfter.map((row) => withClass(row, 'route-name')[0].textContent), ['Pattern 1', 'Entry 1']);
});

