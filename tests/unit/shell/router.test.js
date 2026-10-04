// Checks: addresses map to home, About, a module or "not found" in any letter case; an unbuilt page opens home with a note; Cancel on "leave?" keeps the page.
// Serves: ALL-R12, ALL-R17.
// Expected values: design choice: addresses and note wording typed in the test.

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, hrefFor, pageFor, watchAddress } from '../../../src/shell/router.js';

const IDS = ['debrief', 'turn-sim'];

test('home, about and module routes', () => {
  for (const hash of ['', '#', '#/', '#//']) assert.deepEqual(parseRoute(hash, IDS), { name: 'home' }, hash);
  assert.deepEqual(parseRoute('#/about', IDS), { name: 'about' });
  assert.deepEqual(parseRoute('#/about/', IDS), { name: 'about' });
  assert.deepEqual(parseRoute('#/debrief', IDS), { name: 'module', id: 'debrief' });
  assert.deepEqual(parseRoute('#/turn-sim?x=1', IDS), { name: 'module', id: 'turn-sim' });
  assert.deepEqual(parseRoute('#debrief', IDS), { name: 'module', id: 'debrief' }, 'a missing slash is forgiven');
});

test('route ids match without regard to case (AF-4)', () => {
  assert.deepEqual(parseRoute('#/Debrief', IDS), { name: 'module', id: 'debrief' });
  assert.deepEqual(parseRoute('#/TURN-SIM/', IDS), { name: 'module', id: 'turn-sim' });
  assert.deepEqual(parseRoute('#/About', IDS), { name: 'about' });
  assert.deepEqual(parseRoute('#/PTPT', IDS), { name: 'not-found', path: 'PTPT' }, 'the note keeps what was typed');
});

test('anything else is not found', () => {
  assert.deepEqual(parseRoute('#/ptpt', IDS), { name: 'not-found', path: 'ptpt' });
  assert.deepEqual(parseRoute('#/debrief/extra', IDS), { name: 'not-found', path: 'debrief/extra' });
});

test('hrefFor builds the matching hash', () => {
  assert.equal(hrefFor({ name: 'home' }), '#/');
  assert.equal(hrefFor({ name: 'about' }), '#/about');
  assert.equal(hrefFor({ name: 'module', id: 'debrief' }), '#/debrief');
});

test('pageFor: a module not built yet opens home with a "coming soon" note', () => {
  const pages = { home: { title: 'Home' }, about: { title: 'About' } };
  const built = { title: 'Debrief Viewer', load: () => {} };
  const planned = { title: 'PT-PT Sim', load: null };
  const find = (id) => (id === 'debrief' ? built : planned);
  assert.deepEqual(pageFor({ name: 'module', id: 'ptpt' }, pages, find), { entry: pages.home, note: 'PT-PT Sim is coming soon.' });
  assert.deepEqual(pageFor({ name: 'module', id: 'debrief' }, pages, find), { entry: built, note: null });
  assert.deepEqual(pageFor({ name: 'about' }, pages, find), { entry: pages.about, note: null });
  assert.deepEqual(pageFor({ name: 'home' }, pages, find), { entry: pages.home, note: null });
  assert.deepEqual(pageFor({ name: 'not-found', path: 'PTPT' }, pages, find), {
    entry: pages.home,
    note: 'There\'s no page at "PTPT". Here\'s the home screen.',
  });
});

// A window whose history behaves like the browser's: entries with state, push on
// a new hash, go(n) moves and fires hashchange when the hash differs.
function fakeWindow(start = '#/debrief') {
  const entries = [{ hash: start, state: null }];
  let at = 0;
  const listeners = new Set();
  const fire = () => listeners.forEach((fn) => fn());
  const win = {
    location: { get hash() { return entries[at].hash; }, pathname: '/app/', search: '' },
    history: {
      get state() { return entries[at].state; },
      replaceState(state, _title, url) { entries[at] = { hash: url === undefined ? entries[at].hash : (url.startsWith('#') ? url : ''), state }; },
      go(n) { const before = entries[at].hash; at += n; if (entries[at].hash !== before) fire(); },
    },
    confirm: () => true,
    addEventListener: (type, fn) => listeners.add(fn),
    removeEventListener: (type, fn) => listeners.delete(fn),
    // A link: drops forward entries, pushes a new one, fires hashchange.
    click(hash) { entries.splice(at + 1); entries.push({ hash, state: null }); at += 1; fire(); },
    entries: () => entries.map((e) => e.hash),
    get at() { return at; },
  };
  return win;
}

test('watchAddress: with nothing to lose each new address is shown; a question is asked and Cancel stays put', () => {
  const win = fakeWindow();
  const shown = [];
  let question = null;
  const asked = [];
  win.confirm = (text) => { asked.push(text); return false; };
  const stop = watchAddress({ win, question: () => question, go: (h) => shown.push(h) });

  win.click('#/sof');
  assert.deepEqual(shown, ['#/sof'], 'nothing to lose: shown, nobody asked');
  assert.deepEqual(asked, []);

  question = 'Leave without the radar?';
  win.click('#/');
  assert.deepEqual(asked, ['Leave without the radar?']);
  assert.deepEqual(shown, ['#/sof'], 'Cancel shows nothing new');
  assert.equal(win.location.hash, '#/sof', 'the address is back');
  assert.equal(win.at, 1, 'one step back over the new entry, so Back still goes where it went before');

  win.confirm = () => true;
  win.click('#/');
  assert.deepEqual(shown, ['#/sof', '#/']);
  stop();
  win.click('#/sof');
  assert.deepEqual(shown, ['#/sof', '#/'], 'stopped watching');
});

test('watchAddress: Cancel on Back or Forward undoes the same number of steps and keeps every entry', () => {
  const win = fakeWindow('#/other');
  const shown = [];
  let question = null;
  watchAddress({ win, question: () => question, go: (h) => shown.push(h) });
  win.click('#/sof');
  win.click('#/debrief');
  assert.deepEqual(win.entries(), ['#/other', '#/sof', '#/debrief']);

  question = 'Leave without the radar?';
  win.confirm = () => false;
  win.history.go(-2); // Back twice (e.g. from the history menu)
  assert.equal(win.location.hash, '#/debrief', 'Cancel returns to the page on screen');
  assert.deepEqual(win.entries(), ['#/other', '#/sof', '#/debrief'], 'no entry lost or rewritten');
  assert.deepEqual(shown, ['#/sof', '#/debrief']);

  win.confirm = () => true;
  win.history.go(-1);
  assert.equal(win.location.hash, '#/sof');
  assert.deepEqual(shown, ['#/sof', '#/debrief', '#/sof']);
  question = null;
  win.history.go(1); // Forward, nothing to lose
  assert.deepEqual(shown, ['#/sof', '#/debrief', '#/sof', '#/debrief']);
});
