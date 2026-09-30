import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, hrefFor, pageFor } from '../../../src/shell/router.js';

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
