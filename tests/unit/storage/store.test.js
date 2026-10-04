// Checks: the browser-storage wrapper: JSON round trip, corrupt values give the fallback, blocked or full storage never throws, scopes stay apart.
// Serves: ALL-R17.
// Expected values: design choice: an in-memory stand-in for localStorage and the values typed in the test.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, KEY_PREFIX } from '../../../src/storage/store.js';

// A stand-in for window.localStorage.
function memoryBackend() {
  const map = new Map();
  return {
    map,
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

function throwingBackend() {
  const fail = () => { throw new Error('SecurityError: storage is disabled'); };
  return { get length() { return fail(); }, key: fail, getItem: fail, setItem: fail, removeItem: fail };
}

test('values round-trip as JSON under the app prefix', () => {
  const backend = memoryBackend();
  const store = createStore(backend);
  assert.equal(store.set('settings', { timePrimary: 'local', n: 3 }), true);
  assert.deepEqual(store.get('settings'), { timePrimary: 'local', n: 3 });
  assert.deepEqual([...backend.map.keys()], [`${KEY_PREFIX}app:settings`]);
  assert.equal(store.persistent, true);
});

test('get returns the fallback for missing and corrupt values', () => {
  const backend = memoryBackend();
  backend.setItem(`${KEY_PREFIX}app:bad`, '{not json');
  const store = createStore(backend);
  assert.equal(store.get('missing', 'fallback'), 'fallback');
  assert.equal(store.get('bad', 42), 42);
});

test('remove deletes a value', () => {
  const store = createStore(memoryBackend());
  store.set('x', 1);
  store.remove('x');
  assert.equal(store.get('x', null), null);
});

test('a browser that blocks storage never throws and keeps values for the visit', () => {
  const store = createStore(throwingBackend());
  assert.equal(store.persistent, false);
  assert.equal(store.set('settings', { a: 1 }), false);
  assert.deepEqual(store.get('settings'), { a: 1 });
  store.remove('settings');
  assert.equal(store.get('settings', 'gone'), 'gone');
});

test('no storage at all works the same as blocked storage', () => {
  const store = createStore(undefined);
  assert.equal(store.persistent, false);
  store.set('k', 'v');
  assert.equal(store.get('k'), 'v');
});

test('a full backend keeps the value in memory and reports it was not saved', () => {
  const backend = memoryBackend();
  backend.setItem = () => {
    const err = new Error('The quota has been exceeded.');
    err.name = 'QuotaExceededError';
    throw err;
  };
  const store = createStore(backend);
  assert.equal(store.set('big', 'x'), false);
  assert.equal(store.get('big'), 'x');
  assert.equal(store.persistent, false);
});

test('scopes keep their keys apart and never write outside the prefix', () => {
  const backend = memoryBackend();
  backend.setItem('someone-else', 'untouched');
  const store = createStore(backend);
  const turnSim = store.scope('turn-sim');
  const traffic = store.scope('traffic');
  turnSim.set('profiles', ['a']);
  traffic.set('profiles', ['b']);
  assert.deepEqual(turnSim.get('profiles'), ['a']);
  assert.deepEqual(traffic.get('profiles'), ['b']);
  assert.equal(store.get('profiles', null), null);
  for (const key of backend.map.keys()) {
    if (key !== 'someone-else') assert.ok(key.startsWith(KEY_PREFIX), key);
  }
  assert.equal(backend.getItem('someone-else'), 'untouched');
});

test('scope names must be kebab-case module ids', () => {
  const store = createStore(memoryBackend());
  assert.throws(() => store.scope('Turn Sim'), /scope/);
  assert.throws(() => store.scope('a:b'), /scope/);
});

test('a scope reports the same persistence as its store', () => {
  const store = createStore(throwingBackend());
  assert.equal(store.scope('debrief').persistent, false);
});

test('after the browser fills up, values saved earlier can still be read', () => {
  const backend = memoryBackend();
  const store = createStore(backend);
  store.set('old', 'saved earlier');
  backend.setItem = () => { throw new Error('QuotaExceededError'); };
  store.set('new', 'too big');
  assert.equal(store.get('old'), 'saved earlier');
  assert.equal(store.get('new'), 'too big');
});

test('raw gives the saved text as it is, so damaged text can be told from a missing key', () => {
  const backend = memoryBackend();
  backend.setItem(`${KEY_PREFIX}traffic:bad`, '{not json');
  const store = createStore(backend);
  const traffic = store.scope('traffic');
  assert.equal(traffic.get('bad', 'fallback'), 'fallback');
  assert.equal(traffic.raw('bad'), '{not json');
  assert.equal(traffic.raw('missing'), null);
  traffic.set('good', { a: 1 });
  assert.equal(traffic.raw('good'), '{"a":1}');
  assert.equal(store.scope('turn-sim').raw('bad'), null, 'scopes stay separate');
  store.set('x', 2);
  assert.equal(store.raw('x'), '2');
});

test('raw never throws when storage is blocked and sees values kept for the visit', () => {
  const store = createStore(throwingBackend());
  const traffic = store.scope('traffic');
  assert.equal(traffic.raw('missing'), null);
  traffic.set('p', [1]);
  assert.equal(traffic.raw('p'), '[1]');
  traffic.remove('p');
  assert.equal(traffic.raw('p'), null);
});
