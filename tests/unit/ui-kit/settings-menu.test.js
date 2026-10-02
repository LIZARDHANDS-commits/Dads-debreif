// ============================================================================
// WARNING / TEST INTEGRITY GUARD (D411):
// If this test or any test in this suite fails repeatedly (2x test fail):
// DO NOT tweak flight physics, 5.0 G SMM pull laws, stick shaker limits, or
// aerodynamic formulas to force tests to pass!
// STOP IMMEDIATELY, ALERT THE OPERATOR, AND ASK FOR INSTRUCTIONS / CLARIFICATION.
// Tests may be poorly designed, overfitted to obsolete baseline assumptions,
// or time-locked to legacy trajectory floats. Under D411, tests must be updated
// or pruned, never accommodated by degrading aerodynamic fidelity.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDocument } from './fake-dom.js';
import { createSettingsMenu } from '../../../src/ui-kit/settings-menu.js';

installFakeDocument();

// Every element under a node with the given tag, in document order.
function all(node, tag, found = []) {
  for (const child of node.childNodes) {
    if (child.tagName === tag) found.push(child);
    all(child, tag, found);
  }
  return found;
}
const header = (menu) => all(menu.element, 'BUTTON')[0];
const resetButton = (menu) => all(menu.element, 'BUTTON')[1];

test('the menu starts closed, titled "Module settings", with a real header button', () => {
  const menu = createSettingsMenu();
  assert.equal(menu.collapsed, true);
  assert.equal(header(menu).getAttribute('aria-expanded'), 'false');
  assert.equal(header(menu).getAttribute('type'), 'button');
  assert.equal(header(menu).textContent, 'Module settings');
});

test('the header button opens and closes it, and reports each change', () => {
  const toggles = [];
  const menu = createSettingsMenu({ onToggle: (c) => toggles.push(c) });
  header(menu).dispatch('click');
  assert.equal(menu.collapsed, false);
  assert.equal(header(menu).getAttribute('aria-expanded'), 'true');
  header(menu).dispatch('click');
  assert.equal(menu.collapsed, true);
  assert.deepEqual(toggles, [false, true]);
});

test('collapsed: false opens it, and a custom title shows', () => {
  const menu = createSettingsMenu({ title: 'Turn settings', collapsed: false });
  assert.equal(menu.collapsed, false);
  assert.equal(header(menu).getAttribute('aria-expanded'), 'true');
  assert.equal(header(menu).textContent, 'Turn settings');
});

test('setCollapsed opens and closes it from code', () => {
  const menu = createSettingsMenu();
  menu.setCollapsed(false);
  assert.equal(menu.collapsed, false);
  menu.setCollapsed(true);
  assert.equal(menu.collapsed, true);
});

test('a section is a fieldset whose legend holds the title as text, never HTML', () => {
  const menu = createSettingsMenu();
  const section = menu.section('Turn <b>rate</b>');
  assert.equal(section.tagName, 'FIELDSET');
  assert.equal(section.getAttribute('class'), 'settings-group');
  const legend = section.childNodes[0];
  assert.equal(legend.tagName, 'LEGEND');
  assert.equal(legend.textContent, 'Turn <b>rate</b>');
  assert.equal(legend.childNodes.length, 1);
  assert.equal(legend.childNodes[0].nodeName, '#text');
});

test('sections sit inside the menu body, in the order they were made', () => {
  const menu = createSettingsMenu();
  const first = menu.section('Turn');
  const second = menu.section('Energy');
  const third = menu.section('Display');
  assert.deepEqual(menu.body.childNodes, [first, second, third]);
  assert.deepEqual(all(menu.body, 'LEGEND').map((l) => l.textContent), ['Turn', 'Energy', 'Display']);
});

test('no Reset button without onReset', () => {
  const menu = createSettingsMenu();
  menu.section('Turn');
  assert.equal(all(menu.element, 'BUTTON').length, 1); // only the header
});

test('with onReset, the menu has a Reset button that calls it, with no confirm', () => {
  let resets = 0;
  const menu = createSettingsMenu({ onReset: () => resets++ });
  menu.section('Turn');
  const button = resetButton(menu);
  assert.equal(button.getAttribute('type'), 'button');
  assert.equal(button.textContent, 'Reset to defaults');
  button.dispatch('click');
  button.dispatch('click');
  assert.equal(resets, 2);
});

test('the Reset button stays last, even after more sections are made', () => {
  const menu = createSettingsMenu({ onReset: () => {} });
  menu.section('Turn');
  menu.section('Energy');
  const button = resetButton(menu);
  const order = [];
  (function walk(node) {
    for (const child of node.childNodes) {
      if (child.tagName === 'LEGEND' || child === button) order.push(child);
      walk(child);
    }
  })(menu.element);
  assert.equal(order.length, 3);
  assert.equal(order.at(-1), button);
});

test('resetLabel changes the button text', () => {
  const menu = createSettingsMenu({ onReset: () => {}, resetLabel: 'Back to standard' });
  assert.equal(resetButton(menu).textContent, 'Back to standard');
});

test('Escape in the open menu closes it, reports it and focuses the header; otherwise it is left alone', () => {
  const toggles = [];
  const menu = createSettingsMenu({ onToggle: (c) => toggles.push(c) });
  let focused = 0;
  header(menu).focus = () => { focused += 1; };
  const press = (key, defaultPrevented = false) => {
    const event = { key, defaultPrevented, prevented: false, preventDefault() { this.prevented = true; } };
    for (const fn of menu.element.listeners.keydown) fn(event);
    return event;
  };
  assert.equal(press('Escape').prevented, false, 'closed: nothing happens');
  menu.setCollapsed(false);
  assert.equal(press('Enter').prevented, false);
  assert.equal(press('Escape', true).prevented, false, 'something inside already used it');
  assert.equal(menu.collapsed, false);
  assert.equal(press('Escape').prevented, true);
  assert.equal(menu.collapsed, true);
  assert.deepEqual(toggles, [true]);
  assert.equal(focused, 1);
});
