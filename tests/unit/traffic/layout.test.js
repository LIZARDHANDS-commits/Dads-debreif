// The Traffic Sim's screen (specs/SPEC-traffic.md: The screen, R2, R22): three
// columns, the bar above the map, each side column collapsible with a real
// button, and only the routes list and + New route on the left until a route is picked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDocument } from '../ui-kit/fake-dom.js';
import { h } from '../../../src/ui-kit/dom.js';
import { createPlaybackBar } from '../../../src/modules/traffic/playback-bar.js';
import {
  NEW_ROUTE_CHOICES, SIMPLIFIED_NOTE, createLayout, newRouteChoices, routeDetail,
} from '../../../src/modules/traffic/layout.js';

const document = installFakeDocument();

// The stand-in DOM from the ui-kit tests only reads text. These few additions let a
// test set text, look inside, move focus and set a style property, as a browser does.
const nodeProto = Object.getPrototypeOf(Object.getPrototypeOf(document.createElement('div')));
const readText = Object.getOwnPropertyDescriptor(nodeProto, 'textContent').get;
Object.defineProperty(nodeProto, 'textContent', {
  configurable: true,
  get: readText,
  set(value) {
    this.childNodes = [];
    if (value !== '') this.appendChild(document.createTextNode(value));
  },
});
const elementProto = Object.getPrototypeOf(document.createElement('div'));
elementProto.append = function append(...nodes) {
  for (const node of nodes) this.appendChild(node);
};
elementProto.contains = function contains(node) {
  return node === this || this.childNodes.some((child) => child.contains?.(node));
};
elementProto.focus = function focus() {
  document.activeElement = this;
};
Object.defineProperty(elementProto, 'style', {
  configurable: true,
  get() {
    this.styleProps ??= {};
    return { setProperty: (name, value) => (this.styleProps[name] = value) };
  },
});
elementProto.value = '';
elementProto.checked = false;

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
  };
  const ui = createLayout({ bar, listen, on, available: options.available });
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
  assert.equal(document.activeElement.dataset.routeId, 'e1');

  withClass(ui.element, 'route-row')[2].focus();
  ui.setRoutes(ROUTES, 's1');
  assert.equal(document.activeElement.dataset.routeId, 's1', 'still on the line the keyboard was on');
  assert.ok(withClass(ui.element, 'route-row').includes(document.activeElement), 'and it is the new line, not the old one');
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
  assert.equal(document.activeElement, pressable(menu, '+ New route'), 'focus goes back to the + New route button');

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

test('the right column has room for the spawner, the aircraft list, the conflicts and, last, the settings menu; the left for the point table', () => {
  const { ui } = setup();
  const [, routes, , aircraft] = ui.element.childNodes;
  for (const name of ['spawner', 'aircraft', 'conflicts', 'settings']) assert.ok(aircraft.contains(ui.slots[name]), name);
  const body = ui.slots.settings.parentNode;
  assert.equal(body.childNodes.at(-1), ui.slots.settings, 'the settings menu comes last, under the readouts');
  assert.ok(routes.contains(ui.slots.pointTable));
  assert.ok(routes.contains(ui.slots.leftExtras));
  assert.deepEqual(Object.keys(ui.slots), ['pointTable', 'leftExtras', 'spawner', 'aircraft', 'conflicts', 'settings']);
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
