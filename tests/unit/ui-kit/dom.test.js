import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDocument } from './fake-dom.js';
import { h, clear } from '../../../src/ui-kit/dom.js';
import { createPanel } from '../../../src/ui-kit/panel.js';

installFakeDocument();

test('strings are inserted as text, never as HTML', () => {
  const el = h('p', {}, '<b>bold</b>', ' & more');
  assert.equal(el.childNodes.length, 2);
  assert.equal(el.childNodes[0].nodeName, '#text');
  assert.equal(el.textContent, '<b>bold</b> & more');
});

test('props set classes, data, listeners, properties and attributes', () => {
  let clicked = 0;
  const el = h('button', { class: 'primary', dataset: { module: 'debrief' }, onclick: () => clicked++, disabled: true, 'aria-label': 'Open', title: null, hidden: false }, 'Open');
  assert.equal(el.getAttribute('class'), 'primary');
  assert.equal(el.dataset.module, 'debrief');
  assert.equal(el.disabled, true);
  assert.equal(el.getAttribute('aria-label'), 'Open');
  assert.equal(el.getAttribute('title'), null);
  el.dispatch('click');
  assert.equal(clicked, 1);
});

test('children can be nested arrays, numbers and nodes; empty ones are skipped', () => {
  const el = h('ul', {}, [h('li', {}, 1), [h('li', {}, 2)]], null, false, undefined);
  assert.equal(el.childNodes.length, 2);
  assert.equal(el.textContent, '12');
  clear(el);
  assert.equal(el.childNodes.length, 0);
});

test('a panel opens and closes from its header button and reports it', () => {
  const toggles = [];
  const panel = createPanel({ title: 'Formation', onToggle: (c) => toggles.push(c) });
  const button = panel.element.childNodes[0].childNodes[0];
  assert.equal(button.tagName, 'BUTTON');
  assert.equal(button.getAttribute('type'), 'button');
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  assert.equal(button.getAttribute('aria-controls'), panel.body.getAttribute('id'));
  button.dispatch('click');
  assert.equal(panel.collapsed, true);
  assert.equal(panel.body.hidden, true);
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  button.dispatch('click');
  assert.deepEqual(toggles, [true, false]);
});

test('a panel can start collapsed', () => {
  const panel = createPanel({ title: 'Errors', collapsed: true });
  assert.equal(panel.body.hidden, true);
});
