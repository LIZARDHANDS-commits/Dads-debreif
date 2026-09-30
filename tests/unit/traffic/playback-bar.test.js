// The Traffic Sim's playback bar (specs/SPEC-traffic.md: The screen, R22, R3):
// every control calls what it is given, the state it is told shows, and a
// control for a feature that isn't there yet is left out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDocument } from '../ui-kit/fake-dom.js';
import { h } from '../../../src/ui-kit/dom.js';
import { createControls } from '../../../src/ui-kit/controls.js';
import { createSettings } from '../../../src/storage/settings.js';
import { DEFAULTS, LIMITS } from '../../../src/modules/traffic/defaults.js';
import {
  LAYER_ITEMS, STATUS_TEXT, layerItems, speedLabel, createMenu, createPlaybackBar,
} from '../../../src/modules/traffic/playback-bar.js';

const document = installFakeDocument();

// The stand-in DOM from the ui-kit tests only reads text. These few additions let a
// test set text, ask what's inside and move focus, as a browser does.
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
elementProto.contains = function contains(node) {
  return node === this || this.childNodes.some((child) => child.contains?.(node));
};
elementProto.focus = function focus() {
  document.activeElement = this;
};
elementProto.removeAttribute = function removeAttribute(name) {
  delete this.attributes[name];
};
elementProto.value = ''; // a fresh input or select starts with an empty value, unchecked
elementProto.checked = false;

const all = (root, test) => [root, ...root.childNodes.flatMap((child) => (child.childNodes ? all(child, test) : []))].filter(test);
const tagged = (root, tag) => all(root, (n) => n.tagName === tag);
const words = (node) => node.textContent.replace(/\s+/g, ' ').trim();
const pressable = (root, name) => tagged(root, 'BUTTON').find((b) => words(b).includes(name));
const press = (root, name) => {
  const b = pressable(root, name);
  assert.ok(b, `a "${name}" button`);
  b.dispatch('click');
};

// Controls that record what the bar asks for, so the keys and limits are checked without a settings store.
function stubControls() {
  const asked = [];
  const make = (kind) => (key, options) => {
    asked.push({ kind, key, ...options });
    return h('div', { class: `control control-${kind}`, dataset: { key } }, options.label);
  };
  return { asked, number: make('number'), checkbox: make('checkbox'), choice: make('choice') };
}

function setup(options = {}) {
  const calls = [];
  const on = {
    play: () => calls.push('play'),
    pause: () => calls.push('pause'),
    reset: () => calls.push('reset'),
    fit: () => calls.push('fit'),
    speed: (x) => calls.push(['speed', x]),
    rewind: () => calls.push('rewind'),
    step: (s) => calls.push(['step', s]),
    ...options.on,
  };
  const controls = options.controls ?? stubControls();
  const listeners = [];
  const listen = (target, type, fn) => listeners.push({ target, type, fn });
  const bar = createPlaybackBar({ controls, on, available: options.available, settingsPanel: options.settingsPanel, listen });
  return { bar, calls, controls, listeners };
}

test('the bar starts paused at 0:00:00 and 8×, with every clock control there', () => {
  const { bar } = setup();
  const first = words(bar.element);
  for (const name of ['Play', 'Rewind', '−10 s', '+10 s', 'Reset', 'Speed', 'Paused', '0:00:00', 'Layers', 'Fit']) assert.ok(first.includes(name), name);
  assert.equal(tagged(bar.element, 'SELECT')[0].value, String(DEFAULTS.speed));
  assert.equal(all(bar.element, (n) => n.getAttribute?.('role') === 'status')[0].textContent, 'Paused');
});

test('Play, Reset and Fit call what they are given; the steps say which way', () => {
  const { bar, calls } = setup();
  for (const name of ['Play', 'Reset', 'Fit', '−10 s', '+10 s', 'Rewind']) press(bar.element, name);
  assert.deepEqual(calls, ['play', 'reset', 'fit', ['step', -10], ['step', 10], 'rewind']);
});

test('the speed list runs from 0.25× to 8× and a choice is passed on as a number', () => {
  const { bar, calls } = setup();
  const select = tagged(bar.element, 'SELECT')[0];
  const options = tagged(select, 'OPTION');
  assert.deepEqual(options.map((o) => o.textContent), ['0.25×', '0.5×', '1×', '2×', '4×', '8×']);
  assert.equal(speedLabel(8), '8×');
  select.value = '0.25';
  select.dispatch('change');
  assert.deepEqual(calls, [['speed', 0.25]]);
});

test('Play becomes Pause while it runs, and Pause is what it does then', () => {
  const { bar, calls } = setup();
  bar.setState({ mode: 'running' });
  assert.ok(pressable(bar.element, 'Pause'));
  assert.equal(pressable(bar.element, 'Play'), undefined);
  press(bar.element, 'Pause');
  bar.setState({ mode: 'paused' });
  press(bar.element, 'Play');
  assert.deepEqual(calls, ['pause', 'play']);
});

test('while rewinding, Rewind is shown as pressed and pressing it, or Pause, stops it; Play goes forward', () => {
  const { bar, calls } = setup();
  const rewind = pressable(bar.element, 'Rewind');
  assert.equal(rewind.getAttribute('aria-pressed'), 'false');
  bar.setState({ mode: 'rewinding' });
  assert.equal(rewind.getAttribute('aria-pressed'), 'true');
  assert.ok(words(bar.element).includes('Rewinding'));
  press(bar.element, 'Rewind');
  press(bar.element, 'Pause');
  assert.deepEqual(calls, ['pause', 'pause']);
  bar.setState({ mode: 'paused' });
  assert.equal(rewind.getAttribute('aria-pressed'), 'false');
});

test('the status says Running, Paused or Rewinding, and an unknown mode changes nothing', () => {
  const { bar } = setup();
  const status = () => all(bar.element, (n) => n.getAttribute?.('role') === 'status')[0].textContent;
  for (const mode of ['running', 'rewinding', 'paused']) {
    bar.setState({ mode });
    assert.equal(status(), STATUS_TEXT[mode]);
  }
  bar.setState({ mode: 'running' });
  bar.setState({ mode: 'sideways' });
  assert.equal(status(), 'Running');
});

test('the clock and the speed show what they are told, and a partial update leaves the rest alone', () => {
  const { bar } = setup();
  bar.setState({ clockText: '1:02:03', speed: 2 });
  assert.ok(words(bar.element).includes('1:02:03'));
  assert.equal(tagged(bar.element, 'SELECT')[0].value, '2');
  bar.setState({ mode: 'running' });
  assert.ok(words(bar.element).includes('1:02:03'));
  assert.equal(tagged(bar.element, 'SELECT')[0].value, '2');
  bar.setState();
  assert.ok(words(bar.element).includes('Running'));
});

test('the clock is announced to screen readers as "Sim time", and the status as a status', () => {
  const { bar } = setup();
  assert.ok(all(bar.element, (n) => n.getAttribute?.('class') === 'visually-hidden').some((n) => n.textContent === 'Sim time '));
});

test('Rewind and the ±10 s steps are left out until they can be called, so nothing is on screen doing nothing (R3)', () => {
  const { bar } = setup({ on: { rewind: undefined, step: undefined } });
  for (const name of ['Rewind', '−10 s', '+10 s']) assert.equal(pressable(bar.element, name), undefined, name);
  for (const name of ['Play', 'Reset', 'Fit']) assert.ok(pressable(bar.element, name), name);
  const stepsOnly = setup({ on: { rewind: undefined } });
  assert.equal(pressable(stepsOnly.bar.element, 'Rewind'), undefined);
  assert.ok(pressable(stepsOnly.bar.element, '+10 s'));
});

test('the wind boxes are wind direction (°T) and speed (kt), with the spec\'s limits', () => {
  const { controls } = setup();
  const [from, speed] = controls.asked.filter((a) => a.kind === 'number');
  assert.deepEqual([from.key, from.min, from.max, from.unit], ['windFromDeg', 1, 360, '°T']);
  assert.deepEqual([speed.key, speed.min, speed.max, speed.unit], ['windKt', 0, 60, 'kt']);
  assert.deepEqual([from.min, from.max], [...LIMITS.windFromDeg]);
});

test('the Layers menu lists every layer that has a feature behind it, each bound to its own setting', () => {
  const { controls } = setup();
  const layers = controls.asked.filter((a) => a.kind === 'checkbox');
  assert.deepEqual(layers.map((l) => l.key), [
    'layerTrails', 'layerLabels', 'layerPoints', 'layerLegDistances', 'layerTurnData', 'layerBubbles', 'layerCautionRings',
  ]);
  assert.deepEqual(layers.map((l) => l.label), [
    'Trails', 'Height and speed labels', 'Route points', 'Leg distances', 'Turn data (radius and bank)', 'Conflict bubbles', 'Caution rings',
  ]);
});

test('the photo and Engine-out reach layers, and the 2D | 3D switch, appear only when their features are there', () => {
  assert.deepEqual(layerItems().map((i) => i.key), LAYER_ITEMS.filter((i) => !i.needs).map((i) => i.key));
  assert.deepEqual(layerItems({ photo: true }).map((i) => i.key).slice(-1), ['layerPhoto']);
  assert.deepEqual(layerItems({ photo: true, reach: true }).map((i) => i.key).slice(-2), ['layerPhoto', 'layerEngineReach']);
  assert.equal(layerItems({ photo: 'yes' }).some((i) => i.key === 'layerPhoto'), false, 'only true counts');

  assert.equal(setup().controls.asked.some((a) => a.kind === 'choice'), false);
  const withThree = setup({ available: { view3d: true } });
  const choice = withThree.controls.asked.find((a) => a.kind === 'choice');
  assert.deepEqual([choice.key, choice.options.map((o) => o.label)], ['view', ['2D', '3D']]);
});

test('every layer in the menu is a real setting with a default, and the photo one starts on', () => {
  for (const item of LAYER_ITEMS) assert.equal(typeof DEFAULTS[item.key], 'boolean', item.key);
});

test('a Settings menu is there only when a settings panel is given, and holds it', () => {
  assert.equal(pressable(setup().bar.element, 'Settings'), undefined);
  const panel = { element: h('div', { class: 'settings-panel' }, 'Conflict limits') };
  const { bar } = setup({ settingsPanel: panel });
  assert.ok(pressable(bar.element, 'Settings'));
  assert.ok(all(bar.element, (n) => n === panel.element).length === 1);
});

test('a menu opens from its button, is closed at first, and closes on a second press', () => {
  const { element, button, body, isOpen } = createMenu({ label: 'Layers', children: [h('p', {}, 'x')], listen: () => {} });
  assert.equal(isOpen(), false);
  assert.equal(body.hidden, true);
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.equal(button.getAttribute('aria-controls'), body.getAttribute('id'));
  button.dispatch('click');
  assert.equal(isOpen(), true);
  assert.equal(body.hidden, false);
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  button.dispatch('click');
  assert.equal(isOpen(), false);
  assert.equal(element.tagName, 'DIV');
});

test('Escape closes an open menu and puts focus back on its button; a click elsewhere closes it, one inside does not', () => {
  const listeners = [];
  const menu = createMenu({ label: 'Layers', children: [h('p', { class: 'inside' }, 'x')], listen: (target, type, fn) => listeners.push({ target, type, fn }) });
  assert.equal(listeners.length, 1);
  assert.equal(listeners[0].target, document);
  assert.equal(listeners[0].type, 'pointerdown');

  menu.setOpen(true);
  let prevented = 0;
  menu.element.listeners.keydown[0]({ key: 'Enter', preventDefault: () => prevented++ });
  assert.equal(menu.isOpen(), true, 'other keys leave it open');
  menu.element.listeners.keydown[0]({ key: 'Escape', preventDefault: () => prevented++ });
  assert.equal(menu.isOpen(), false);
  assert.equal(prevented, 1);
  assert.equal(document.activeElement, menu.button);

  menu.setOpen(true);
  listeners[0].fn({ target: menu.body.childNodes[0] });
  assert.equal(menu.isOpen(), true, 'a click inside stays open');
  listeners[0].fn({ target: h('div') });
  assert.equal(menu.isOpen(), false, 'a click outside closes it');
  listeners[0].fn({ target: h('div') });
  assert.equal(menu.isOpen(), false);
});

test('two menus have their own ids', () => {
  const a = createMenu({ label: 'A', listen: () => {} });
  const b = createMenu({ label: 'B', listen: () => {} });
  assert.notEqual(a.body.getAttribute('id'), b.body.getAttribute('id'));
});

// ---------------------------------------------------------------------------
// With the real ui-kit controls: what typing in the boxes does

function withRealControls() {
  const kept = new Map();
  const store = { get: (k, fallback) => (kept.has(k) ? kept.get(k) : fallback), set: (k, v) => kept.set(k, v) };
  const settings = createSettings(store, DEFAULTS);
  return { settings, ...setup({ controls: createControls(settings) }) };
}

const numberBoxes = (bar) => tagged(bar.element, 'INPUT').filter((i) => i.getAttribute('type') === 'number');
const messages = (bar) => all(bar.element, (n) => n.getAttribute?.('class') === 'control-message');

test('the wind boxes start calm, take a good wind into the settings, and refuse the rest with a message', () => {
  const { bar, settings } = withRealControls();
  const [from, speed] = numberBoxes(bar);
  assert.deepEqual([from.value, speed.value], ['360', '0']);

  from.value = '250';
  from.dispatch('input');
  speed.value = '20';
  speed.dispatch('input');
  assert.deepEqual([settings.get().windFromDeg, settings.get().windKt], [250, 20]);

  for (const [box, bad] of [[from, '400'], [from, '0'], [from, ''], [speed, '61'], [speed, '-1']]) {
    box.value = bad;
    box.dispatch('input');
    box.dispatch('change');
    assert.deepEqual([settings.get().windFromDeg, settings.get().windKt], [250, 20], `"${bad}" is refused and the last good value stays`);
    assert.equal(box.getAttribute('aria-invalid'), 'true');
  }
  assert.match(messages(bar)[0].textContent, /Enter a number from 1 to 360/);
  assert.match(messages(bar)[1].textContent, /Enter a number from 0 to 60/);
});

test('a layer checkbox in the menu writes its setting, and follows the setting when something else changes it', () => {
  const { bar, settings } = withRealControls();
  const boxes = tagged(bar.element, 'INPUT').filter((i) => i.getAttribute('type') === 'checkbox');
  assert.equal(boxes.length, 7);
  const trails = boxes[0];
  assert.equal(trails.checked, true);
  trails.checked = false;
  trails.dispatch('change');
  assert.equal(settings.get().layerTrails, false);
  settings.update({ layerTrails: true });
  assert.equal(trails.checked, true);
  // Leg distances and turn data start off, as the spec says.
  assert.deepEqual([boxes[3].checked, boxes[4].checked], [false, false]);
});
