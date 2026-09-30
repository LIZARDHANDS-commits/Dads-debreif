// "Profiles and notes" (task 7, #48) in Node, on the stand-in page: closed at first, built-ins first and
// read-only, Save over a name / Load / Delete ask first, Load fills in the name, a browser that won't keep
// profiles says so in plain words, and names go on the page as text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './fake-dom-extras.js';
import { createStore } from '../../../src/storage/store.js';
import { createProfileStore } from '../../../src/modules/traffic/profile-store.js';
import { createProfilesPanel, NOT_KEPT, TITLE } from '../../../src/modules/traffic/profiles-panel.js';
import { BUILT_IN } from '../../../src/modules/traffic/profile.js';

installFakeDom();

const all = (root, test) => [root, ...root.childNodes.flatMap((child) => (child.childNodes ? all(child, test) : []))].filter(test);
const tagged = (root, tag) => all(root, (n) => n.tagName === tag);
const withClass = (root, name) => all(root, (n) => n.getAttribute?.('class')?.split(' ').includes(name));
const words = (node) => node.textContent.replace(/\s+/g, ' ').trim();
const button = (root, name) => tagged(root, 'BUTTON').find((b) => words(b) === name);
const press = (root, name) => {
  const b = button(root, name);
  assert.ok(b, `a "${name}" button`);
  assert.ok(!b.disabled, `"${name}" is enabled`);
  b.dispatch('click');
};

function fakeBrowser({ full = false } = {}) {
  const items = new Map();
  return {
    items,
    getItem: (k) => (items.has(k) ? items.get(k) : null),
    setItem: (k, v) => { if (full && !k.includes('__probe__')) throw new Error('full'); items.set(k, String(v)); },
    removeItem: (k) => items.delete(k),
  };
}

function setup({ browser = fakeBrowser(), current, prefill = [] } = {}) {
  const storage = createStore(browser).scope('traffic');
  const store = createProfileStore(storage);
  for (const p of prefill) store.save(p);
  const loads = [];
  const captures = [];
  const panel = createProfilesPanel({
    store,
    current,
    capture: (name, notes) => {
      captures.push([name, notes]);
      return { ...structuredClone(BUILT_IN[0].profile), name, notes };
    },
    load: (profile, entry) => loads.push([profile.name, entry]),
  });
  const el = panel.element;
  const nameBox = () => tagged(el, 'INPUT')[0];
  const list = () => tagged(el, 'SELECT')[0];
  const notes = () => tagged(el, 'TEXTAREA')[0];
  const message = () => words(withClass(el, 'profiles-message')[0]);
  const confirmBox = () => withClass(el, 'profiles-confirm')[0];
  const options = () => tagged(list(), 'OPTION').map((o) => words(o));
  return { panel, store, el, loads, captures, nameBox, list, notes, message, confirmBox, options, browser };
}
const saved = (name) => ({ ...structuredClone(BUILT_IN[0].profile), name });

test('it is a closed section titled Profiles and notes, so the first look stays simple', () => {
  const { el } = setup();
  assert.equal(TITLE, 'Profiles and notes');
  assert.equal(words(el.childNodes[0]), 'Profiles and notes');
  const toggle = tagged(el, 'BUTTON')[0];
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
});

test('it starts filled in: the name box holds the name it was given, the notes are empty, and the list has the built-in setups first', () => {
  const { nameBox, notes, options, list } = setup({ current: { name: 'Setup 1', notes: '' } });
  assert.equal(nameBox().value, 'Setup 1');
  assert.equal(nameBox().getAttribute('maxlength'), '40');
  assert.equal(notes().value, '');
  assert.deepEqual(options(), ['Moose Jaw (built-in)', 'Moose Jaw (V6 original)']);
  assert.equal(list().value, 'built-in:moose-jaw');
  assert.equal(tagged(list(), 'OPTGROUP')[0].getAttribute('label'), 'Built-in (read-only)');
});

test('saved profiles follow the built-in ones, with their airfield, as text (a name is never HTML)', () => {
  const { options, list } = setup({ prefill: [saved('Busy Tuesday'), saved('<img src=x onerror=alert(1)>')] });
  assert.deepEqual(options(), ['Moose Jaw (built-in)', 'Moose Jaw (V6 original)', 'Busy Tuesday (CYMJ)', '<img src=x onerror=alert(1)> (CYMJ)']);
  assert.equal(tagged(list(), 'IMG').length, 0);
});

test('the last profile used is the one selected in the list', () => {
  const browser = fakeBrowser();
  const first = setup({ browser, prefill: [saved('Alpha'), saved('Beta')] });
  first.store.setLast({ kind: 'saved', name: 'Beta' });
  const again = setup({ browser });
  assert.equal(again.list().value, 'saved:Beta');
});

test('Delete is off while a built-in setup is picked, with a reason, and on for a saved one', () => {
  const { list, el } = setup({ prefill: [saved('Alpha')] });
  const del = button(el, 'Delete');
  assert.equal(del.disabled, true);
  assert.equal(del.getAttribute('title'), 'Built-in setups are read-only.');
  list().value = 'saved:Alpha';
  list().dispatch('change');
  assert.equal(del.disabled, false);
});

test('Save under a new name saves at once, and says so; the profile is captured with the notes as typed', () => {
  const { el, nameBox, notes, store, captures, message, options, list, confirmBox } = setup();
  nameBox().value = '  Busy Tuesday ';
  notes().value = '12 aircraft, 20 kt crosswind';
  press(el, 'Save');
  assert.deepEqual(captures, [['Busy Tuesday', '12 aircraft, 20 kt crosswind']]);
  assert.equal(message(), 'Saved "Busy Tuesday".');
  assert.equal(store.list().profiles[0].name, 'Busy Tuesday');
  assert.equal(store.list().profiles[0].notes, '12 aircraft, 20 kt crosswind');
  assert.deepEqual(store.lastUsed(), { kind: 'saved', name: 'Busy Tuesday' });
  assert.ok(options().includes('Busy Tuesday (CYMJ)'));
  assert.equal(list().value, 'saved:Busy Tuesday');
  assert.equal(nameBox().value, 'Busy Tuesday');
  assert.equal(confirmBox().hidden, true);
});

test('Save over a name that is there asks first: Cancel leaves it, Replace replaces it', () => {
  const { el, nameBox, store, confirmBox, message } = setup({ prefill: [{ ...saved('Alpha'), notes: 'old' }] });
  nameBox().value = 'Alpha';
  press(el, 'Save');
  assert.equal(confirmBox().hidden, false);
  assert.match(words(confirmBox()), /Replace the saved profile "Alpha" with what is on the screen now\?/);
  press(confirmBox(), 'Cancel');
  assert.equal(confirmBox().hidden, true);
  assert.equal(store.list().profiles[0].notes, 'old');
  press(el, 'Save');
  press(confirmBox(), 'Replace');
  assert.equal(confirmBox().hidden, true);
  assert.equal(store.list().profiles.length, 1);
  assert.equal(store.list().profiles[0].notes, '', 'the captured profile has replaced the old one');
  assert.equal(message(), 'Saved "Alpha".');
});

test('Save with no name, or with a built-in name, says what to do and saves nothing', () => {
  const { el, nameBox, store, message, captures } = setup();
  nameBox().value = '   ';
  press(el, 'Save');
  assert.equal(message(), 'Type a name for the profile first.');
  nameBox().value = 'Moose Jaw (built-in)';
  press(el, 'Save');
  assert.equal(message(), '"Moose Jaw (built-in)" is a built-in setup and can\'t be replaced. Type another name.');
  assert.deepEqual(store.list().profiles, []);
  assert.deepEqual(captures, []);
});

test('Save says why when the profile fails the checks', () => {
  const browser = fakeBrowser();
  const storage = createStore(browser).scope('traffic');
  const store = createProfileStore(storage);
  const panel = createProfilesPanel({ store, capture: (name) => ({ ...structuredClone(BUILT_IN[0].profile), name, routes: [] }), load: () => {} });
  const box = tagged(panel.element, 'INPUT')[0];
  box.value = 'Broken';
  press(panel.element, 'Save');
  assert.equal(words(withClass(panel.element, 'profiles-message')[0]), "That profile can't be saved: it has no routes.");
});

test('Load asks first, then loads, and fills in the name (so the next Save cannot overwrite another profile, #48) and the notes', () => {
  const { el, list, nameBox, notes, loads, confirmBox, message, store } = setup({ prefill: [{ ...saved('Alpha'), notes: 'about Alpha' }, saved('Beta')] });
  list().value = 'saved:Alpha';
  list().dispatch('change');
  press(el, 'Load');
  assert.match(words(confirmBox()), /Load "Alpha"\? The routes and aircraft on the screen now are replaced\./);
  assert.deepEqual(loads, []);
  press(confirmBox(), 'Load');
  assert.deepEqual(loads, [['Alpha', { kind: 'saved', name: 'Alpha' }]]);
  assert.equal(nameBox().value, 'Alpha');
  assert.equal(notes().value, 'about Alpha');
  assert.equal(message(), 'Loaded "Alpha".');
  assert.deepEqual(store.lastUsed(), { kind: 'saved', name: 'Alpha' });
});

test('loading a built-in setup shows the next free name, so a Save keeps your own version rather than failing', () => {
  const { el, list, nameBox, loads, confirmBox, message, store } = setup({ prefill: [saved('Setup 1')] });
  list().value = 'built-in:moose-jaw-v6';
  list().dispatch('change');
  press(el, 'Load');
  press(confirmBox(), 'Load');
  assert.deepEqual(loads, [['Moose Jaw (V6 original)', { kind: 'built-in', id: 'moose-jaw-v6' }]]);
  assert.equal(nameBox().value, 'Setup 2');
  assert.equal(message(), 'Loaded "Moose Jaw (V6 original)". Type a name and press Save to keep your own version.');
  assert.deepEqual(store.lastUsed(), { kind: 'built-in', id: 'moose-jaw-v6' });
});

test('Cancel on a Load loads nothing', () => {
  const { el, loads, confirmBox } = setup();
  press(el, 'Load');
  press(confirmBox(), 'Cancel');
  assert.deepEqual(loads, []);
  assert.equal(confirmBox().hidden, true);
});

test('Delete asks first, then removes the saved profile and says so; a built-in setup cannot be deleted', () => {
  const { el, list, store, confirmBox, message, options } = setup({ prefill: [saved('Alpha'), saved('Beta')] });
  list().value = 'saved:Alpha';
  list().dispatch('change');
  press(el, 'Delete');
  assert.match(words(confirmBox()), /Delete the saved profile "Alpha"\? This can't be undone\./);
  assert.equal(store.list().profiles.length, 2);
  press(confirmBox(), 'Delete');
  assert.deepEqual(store.list().profiles.map((p) => p.name), ['Beta']);
  assert.equal(message(), 'Deleted "Alpha".');
  assert.ok(!options().some((o) => o.startsWith('Alpha')));
  assert.equal(list().value, 'built-in:moose-jaw', 'the list falls back to the first built-in setup');
  assert.equal(button(el, 'Delete').disabled, true);
});

test('after a Delete is confirmed, focus goes to the list, not to the Delete button that has just been disabled (PR-01)', () => {
  const { el, list, confirmBox } = setup({ prefill: [saved('Alpha')] });
  list().value = 'saved:Alpha';
  list().dispatch('change');
  press(el, 'Delete');
  press(confirmBox(), 'Delete');
  assert.equal(button(el, 'Delete').disabled, true);
  assert.equal(globalThis.document.activeElement, list(), 'the list has focus, so the next Tab moves on from inside the section');
});

test('Escape closes a question and puts focus back on the button that asked', () => {
  const { el, confirmBox } = setup();
  press(el, 'Load');
  assert.equal(confirmBox().hidden, false);
  assert.equal(globalThis.document.activeElement, button(confirmBox(), 'Cancel'), 'the safe answer has focus');
  let prevented = false;
  for (const fn of confirmBox().listeners.keydown) fn({ key: 'Escape', preventDefault: () => { prevented = true; } });
  assert.equal(confirmBox().hidden, true);
  assert.ok(prevented);
  assert.equal(globalThis.document.activeElement, button(el, 'Load'));
});

test('a browser that will not keep profiles: the section says so, and a Save says it is held only for this visit', () => {
  const blocked = fakeBrowser();
  blocked.setItem = () => { throw new Error('blocked'); };
  const { el, nameBox, message, options } = setup({ browser: blocked });
  const note = withClass(el, 'profiles-note')[0];
  assert.equal(words(note), NOT_KEPT);
  assert.equal(note.hidden, false);
  nameBox().value = 'Alpha';
  press(el, 'Save');
  assert.match(message(), /^Saved "Alpha", but this browser wouldn't keep it \(its storage is blocked or full\), so it is held only until this page is closed\.$/);
  assert.ok(options().includes('Alpha (CYMJ)'), 'it is still in the list for the visit');
});

test('when the browser keeps profiles the note is hidden', () => {
  const { el } = setup();
  assert.equal(withClass(el, 'profiles-note')[0].hidden, true);
});

test('profiles that failed the checks are skipped with a plain sentence each, and the rest are listed', () => {
  const browser = fakeBrowser();
  const seed = createStore(browser).scope('traffic');
  seed.set('profiles', { version: 1, profiles: [saved('Good'), { ...saved('Bad'), routes: [] }] });
  const { el, options } = setup({ browser });
  assert.ok(options().includes('Good (CYMJ)'));
  assert.ok(!options().some((o) => o.startsWith('Bad')));
  const skipped = withClass(el, 'profiles-skipped')[0];
  assert.equal(skipped.hidden, false);
  assert.equal(words(skipped), '"Bad" was skipped: it has no routes.');
});

test('setCurrent puts a name and notes in the boxes', () => {
  const { panel, nameBox, notes } = setup();
  panel.setCurrent({ name: 'Setup 4', notes: 'x' });
  assert.equal(nameBox().value, 'Setup 4');
  assert.equal(notes().value, 'x');
  assert.equal(panel.getNotes(), 'x');
});

test('every box has a label, and the notes box is capped', () => {
  const { el, notes } = setup();
  for (const field of [...tagged(el, 'INPUT'), ...tagged(el, 'SELECT'), ...tagged(el, 'TEXTAREA')]) {
    const id = field.getAttribute('id');
    assert.ok(id, 'has an id');
    assert.ok(tagged(el, 'LABEL').some((l) => l.getAttribute('for') === id), `a label for ${id}`);
  }
  assert.equal(notes().getAttribute('maxlength'), '2000');
});

test('profiles that can\'t be read are counted, kept as they are, and can be removed after asking', () => {
  const browser = fakeBrowser();
  createStore(browser).scope('traffic').set('profiles', { version: 1, profiles: [saved('Good'), { junk: true }, { also: 'junk' }] });
  const { el, store, confirmBox, message } = setup({ browser });
  const box = withClass(el, 'profiles-unreadable')[0];
  assert.equal(box.hidden, false);
  assert.equal(words(withClass(box, 'profiles-unreadable-text')[0]), "2 saved profiles can't be read. They are kept as they are until you remove them.");
  press(el, 'Remove unreadable');
  assert.match(words(confirmBox()), /Remove the 2 saved profiles that can't be read\? This can't be undone\./);
  press(confirmBox(), 'Remove');
  assert.equal(box.hidden, true);
  assert.equal(message(), 'Removed 2 unreadable profiles.');
  assert.deepEqual(store.list().profiles.map((p) => p.name), ['Good']);
  assert.equal(store.list().unreadable, 0);
});

test('one unreadable profile is said in the singular, and with none the section is hidden', () => {
  const browser = fakeBrowser();
  createStore(browser).scope('traffic').set('profiles', { version: 1, profiles: [{ junk: true }] });
  const { el } = setup({ browser });
  assert.equal(words(withClass(el, 'profiles-unreadable-text')[0]), "1 saved profile can't be read. It is kept as it is until you remove it.");
  assert.equal(withClass(setup().el, 'profiles-unreadable')[0].hidden, true);
});

test('profiles from another version of the page are left alone: the section says so and Save says why nothing was saved', () => {
  const browser = fakeBrowser();
  const foreign = { version: 2, profiles: [saved('Future')] };
  createStore(browser).scope('traffic').set('profiles', foreign);
  const { el, nameBox, message, store } = setup({ browser });
  assert.match(words(withClass(el, 'profiles-unreadable-text')[0]), /^The profiles saved in this browser are damaged or from a different version of this page and can't be read\./);
  nameBox().value = 'Mine';
  press(el, 'Save');
  assert.match(message(), /different version of this page, so nothing was saved/);
  assert.deepEqual(createStore(browser).scope('traffic').get('profiles'), foreign);
  assert.equal(store.list().profiles.length, 0);
});

test('a Save that would take the stored list past its cap says so in words', () => {
  const storage = createStore(fakeBrowser()).scope('traffic');
  const store = createProfileStore(storage);
  const panel = createProfilesPanel({ store, capture: (name) => ({ ...structuredClone(BUILT_IN[0].profile), name, notes: 'x'.repeat(10) }), load: () => {} });
  store.save = () => ({ ok: false, problem: 'The saved profiles would take more than 2,000,000 characters in this browser (2,100,000). Delete a profile to make room.' });
  tagged(panel.element, 'INPUT')[0].value = 'Big';
  press(panel.element, 'Save');
  assert.match(words(withClass(panel.element, 'profiles-message')[0]), /more than 2,000,000 characters/);
});
