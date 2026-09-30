// Where profiles are kept (task 7, #48): on the app's storage layer, checked both ways, and nothing breaks
// when the browser blocks or fills its storage.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../src/storage/store.js';
import { createProfileStore } from '../../../src/modules/traffic/profile-store.js';
import { BUILT_IN, MOST_SAVED, PROFILE_VERSION } from '../../../src/modules/traffic/profile.js';

/** A browser storage stand-in; `full` refuses every write, `blocked` throws on any use. */
function fakeBrowser({ full = false, blocked = false } = {}) {
  const items = new Map();
  const guard = () => { if (blocked) throw new Error('blocked'); };
  return {
    items,
    getItem: (k) => { guard(); return items.has(k) ? items.get(k) : null; },
    setItem: (k, v) => { guard(); if (full && !k.includes('__probe__')) throw new Error('full'); items.set(k, String(v)); },
    removeItem: (k) => { guard(); items.delete(k); },
  };
}
const open = (browser = fakeBrowser()) => {
  const storage = createStore(browser).scope('traffic');
  return { browser, storage, profiles: createProfileStore(storage) };
};
const profile = (name = 'Alpha') => ({ ...structuredClone(BUILT_IN[0].profile), name });

test('a saved profile is listed, kept in the browser under the traffic scope, and found by a new store on the same storage', () => {
  const { browser, profiles } = open();
  const saved = profiles.save(profile('Busy Tuesday'));
  assert.deepEqual({ ok: saved.ok, persisted: saved.persisted }, { ok: true, persisted: true });
  assert.equal(profiles.persistent, true);
  assert.ok([...browser.items.keys()].some((k) => k === 'ooda:v1:traffic:profiles'));
  const again = open(browser).profiles.list();
  assert.deepEqual(again.profiles.map((p) => p.name), ['Busy Tuesday']);
  assert.deepEqual(again.skipped, []);
});

test('saving under a name that is there replaces it; a new name is added; the built-in names are refused', () => {
  const { profiles } = open();
  profiles.save({ ...profile('Alpha'), notes: 'first' });
  profiles.save(profile('Beta'));
  const replaced = profiles.save({ ...profile('Alpha'), notes: 'second' });
  assert.ok(replaced.ok);
  const { profiles: all } = profiles.list();
  assert.deepEqual(all.map((p) => p.name), ['Alpha', 'Beta']);
  assert.equal(all[0].notes, 'second');
  for (const b of BUILT_IN) {
    const refused = profiles.save(profile(b.name));
    assert.equal(refused.ok, false);
    assert.match(refused.problem, /built-in setup and can't be replaced/);
  }
  assert.equal(profiles.list().profiles.length, 2);
});

test('a profile that fails the checks is not saved, and the reason is in plain words', () => {
  const { profiles } = open();
  const bad = profiles.save({ ...profile(), routes: [] });
  assert.equal(bad.ok, false);
  assert.equal(bad.problem, "That profile can't be saved: it has no routes.");
  assert.deepEqual(profiles.list().profiles, []);
});

test('only 20 profiles are kept: the 21st says so, and replacing one still works', () => {
  const { profiles } = open();
  for (let i = 0; i < MOST_SAVED; i++) assert.ok(profiles.save(profile(`P${i}`)).ok);
  const over = profiles.save(profile('One too many'));
  assert.equal(over.ok, false);
  assert.match(over.problem, /20 profiles are saved already/);
  assert.ok(profiles.save({ ...profile('P3'), notes: 'still fine' }).ok);
});

test('delete removes only that profile, and says so when there was none', () => {
  const { profiles } = open();
  profiles.save(profile('Alpha'));
  profiles.save(profile('Beta'));
  assert.deepEqual(profiles.remove('Alpha'), { ok: true, persisted: true });
  assert.deepEqual(profiles.list().profiles.map((p) => p.name), ['Beta']);
  assert.equal(profiles.remove('Nobody').ok, false);
});

test('the last profile used is remembered: a built-in by its id, a saved one by its name; anything else is nothing', () => {
  const { browser, profiles, storage } = open();
  assert.equal(profiles.lastUsed(), null);
  profiles.setLast({ kind: 'built-in', id: 'moose-jaw-v6' });
  assert.deepEqual(open(browser).profiles.lastUsed(), { kind: 'built-in', id: 'moose-jaw-v6' });
  profiles.setLast({ kind: 'saved', name: 'Alpha' });
  assert.deepEqual(open(browser).profiles.lastUsed(), { kind: 'saved', name: 'Alpha' });
  for (const junk of [{ kind: 'built-in', id: 'nope' }, { kind: 'saved', name: 5 }, { kind: 'x' }, 'text', 7, [1], { kind: 'built-in', id: '__proto__' }]) {
    storage.set('last', junk);
    assert.equal(profiles.lastUsed(), null, JSON.stringify(junk));
  }
});

test('what is stored is checked on the way back: bad profiles are skipped with a sentence, the good ones load', () => {
  const { browser, profiles, storage } = open();
  storage.set('profiles', { version: PROFILE_VERSION, profiles: [profile('Good'), { ...profile('Bad'), routes: Array(31).fill({}) }, { ...profile('<script>alert(1)</script>'), aircraft: 'x' }] });
  const { profiles: kept, skipped } = profiles.list();
  assert.deepEqual(kept.map((p) => p.name), ['Good']);
  assert.equal(skipped.length, 2);
  assert.match(skipped[0], /^"Bad" was skipped: it has 31 routes \(the most is 30\)\.$/);
  // Text that is not JSON at all reads as nothing, and does not throw.
  browser.items.set('ooda:v1:traffic:profiles', '{not json');
  assert.deepEqual(open(browser).profiles.list(), { profiles: [], skipped: [] });
});

test('a browser that will not store: saving works for the visit, says it was not kept, and persistent is false', () => {
  for (const browser of [fakeBrowser({ full: true }), fakeBrowser({ blocked: true })]) {
    const { profiles } = open(browser);
    const saved = profiles.save(profile('Alpha'));
    assert.deepEqual({ ok: saved.ok, persisted: saved.persisted }, { ok: true, persisted: false });
    assert.equal(profiles.persistent, false, 'a full browser finds out on the first save');
    assert.deepEqual(profiles.list().profiles.map((p) => p.name), ['Alpha'], 'kept for the visit');
    assert.deepEqual(profiles.remove('Alpha'), { ok: true, persisted: false });
    assert.deepEqual(profiles.list().profiles, []);
    profiles.setLast({ kind: 'saved', name: 'x' }); // does not throw
  }
});

test('no storage at all (a missing app.storage backend) does not throw', () => {
  const profiles = createProfileStore({ get: () => { throw new Error('gone'); }, set: () => { throw new Error('gone'); } });
  assert.deepEqual(profiles.list(), { profiles: [], skipped: [] });
  assert.equal(profiles.save(profile()).persisted, false);
  assert.equal(profiles.lastUsed(), null);
  assert.equal(profiles.persistent, false);
});
