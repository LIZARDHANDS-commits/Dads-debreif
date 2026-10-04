// Checks: saved setups are listed, replaced, refused or skipped with plain sentences; at most 20 setups and
//   2,000,000 characters; blocked or full storage still works for the visit; damaged or other-version lists are
//   never overwritten.
// Serves: TR-R25, ALL-R13, ALL-R17.
// Expected values: design choices typed in (20 setups, 2,000,000 characters, the sentences), equal to the
//   code's own limits.

// Where profiles are kept (task 7, #48): on the app's storage layer, checked both ways, and nothing breaks
// when the browser blocks or fills its storage.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../src/storage/store.js';
import { createProfileStore } from '../../../src/modules/traffic/profile-store.js';
import { BUILT_IN, MOST_CHARS, MOST_SAVED, MOST_STORED_CHARS, PROFILE_VERSION } from '../../../src/modules/traffic/profile.js';

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
  // Text that is not JSON at all reads as unreadable/foreign, and does not throw.
  browser.items.set('ooda:v1:traffic:profiles', '{not json');
  assert.deepEqual(open(browser).profiles.list(), { profiles: [], skipped: ['The saved profiles in this browser could not be read, so they were skipped.'], unreadable: 0, foreign: true });
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
  assert.deepEqual(profiles.list(), { profiles: [], skipped: [], unreadable: 0, foreign: false });
  assert.equal(profiles.save(profile()).persisted, false);
  assert.equal(profiles.lastUsed(), null);
  assert.equal(profiles.persistent, false);
});

// ── Profiles this page can't read are never lost by a Save or a Delete ───────

const stored = (storage) => storage.get('profiles', null);

test('Save and Delete carry the entries that were skipped through unchanged, in place', () => {
  const { profiles, storage } = open();
  const unreadable = { version: PROFILE_VERSION, name: 'From a newer page', routes: 'a new shape' };
  storage.set('profiles', { version: PROFILE_VERSION, profiles: [profile('Good'), unreadable, profile('Other')] });
  assert.equal(profiles.list().unreadable, 1);
  assert.equal(profiles.list().foreign, false);

  assert.ok(profiles.save({ ...profile('Good'), notes: 'changed' }).ok);
  assert.ok(profiles.save(profile('New')).ok);
  let raw = stored(storage).profiles;
  assert.deepEqual(raw.map((p) => p.name), ['Good', 'From a newer page', 'Other', 'New']);
  assert.deepEqual(raw[1], unreadable, 'the skipped entry is exactly as it was');
  assert.equal(raw[0].notes, 'changed');

  assert.ok(profiles.remove('Other').ok);
  raw = stored(storage).profiles;
  assert.deepEqual(raw.map((p) => p.name), ['Good', 'From a newer page', 'New']);
  assert.deepEqual(raw[1], unreadable);
  assert.equal(profiles.list().unreadable, 1);
});

test('profiles from another version of the page are left alone: Save and Delete refuse in words and write nothing', () => {
  const { profiles, storage } = open();
  const foreign = { version: 2, profiles: [profile('Future one')] };
  storage.set('profiles', foreign);
  const listed = profiles.list();
  assert.equal(listed.foreign, true);
  assert.deepEqual(listed.profiles, []);
  assert.match(listed.skipped[0], /could not be read/);
  const saved = profiles.save(profile('Mine'));
  assert.equal(saved.ok, false);
  assert.match(saved.problem, /different version of this page, so nothing was saved/);
  const removed = profiles.remove('Future one');
  assert.equal(removed.ok, false);
  assert.match(removed.problem, /different version of this page/);
  assert.deepEqual(stored(storage), foreign, 'nothing was written');
  // Text that is not a list at all is the same.
  storage.set('profiles', { version: PROFILE_VERSION, profiles: 'x' });
  assert.equal(profiles.save(profile('Mine')).ok, false);
});

// PR-03 (D269: a Save or Delete never loses what this page can't read). The app's storage hands back the
// fallback for text that is not JSON, exactly as for a key that isn't there, so the store keeps a mark that it has
// written the list; a list that then reads as nothing has been damaged. Where the storage can also give the raw
// text (`raw(name)`), damaged text is found even before this page has saved anything.
const KEY = 'ooda:v1:traffic:profiles';

test('a saved list whose text has been damaged is reported as unreadable, and Save, Delete and the list leave it alone (PR-03)', () => {
  const { browser, profiles } = open();
  profiles.save(profile('Alpha'));
  browser.items.set(KEY, '{not json');
  const listed = open(browser).profiles.list();
  assert.equal(listed.foreign, true);
  assert.deepEqual(listed.profiles, []);
  const again = open(browser).profiles;
  const saved = again.save(profile('Fresh save'));
  assert.equal(saved.ok, false);
  assert.match(saved.problem, /damaged or from a different version of this page, so nothing was saved/);
  assert.equal(again.remove('Alpha').ok, false);
  assert.equal(browser.items.get(KEY), '{not json', 'nothing was written');
  // Remove unreadable clears it, and then Save works.
  assert.deepEqual(again.discardUnreadable(), { ok: true, persisted: true, removed: 0 });
  assert.equal(again.list().foreign, false);
  assert.equal(again.save(profile('Fresh save')).ok, true);
  assert.deepEqual(again.list().profiles.map((p) => p.name), ['Fresh save']);
});

test('where the storage gives the raw text, text that is not JSON is unreadable even in a browser that never saved (PR-03)', () => {
  const written = [];
  const storage = { get: (name, fallback) => fallback, set: (name, value) => (written.push([name, value]), true), raw: (name) => (name === 'profiles' ? '{not json' : null), persistent: true };
  const profiles = createProfileStore(storage);
  assert.equal(profiles.list().foreign, true);
  assert.equal(profiles.save(profile('Fresh save')).ok, false);
  assert.deepEqual(written, [], 'nothing was written');
  // No text at all is not damaged.
  const empty = createProfileStore({ ...storage, raw: () => null });
  assert.equal(empty.list().foreign, false);
  assert.equal(empty.save(profile('Fresh save')).ok, true);
});

test('a list that was never saved, or that holds nothing, is not reported as damaged', () => {
  const { profiles } = open();
  assert.equal(profiles.list().foreign, false);
  profiles.save(profile('Alpha'));
  profiles.remove('Alpha');
  assert.equal(profiles.list().foreign, false);
  assert.equal(profiles.save(profile('Beta')).ok, true);
});

test('skipped sentences past five are summarised in one line (PR-06)', () => {
  const { profiles, storage } = open();
  const names = Array.from({ length: 60 }, (_, i) => `Profile ${i + 1}`);
  storage.set('profiles', { version: PROFILE_VERSION, profiles: names.map((n) => profile(n)) }); // 20 are kept, 20 more are read and skipped, and the rest are only carried
  const listed = profiles.list();
  assert.equal(listed.profiles.length, MOST_SAVED);
  assert.equal(listed.skipped.length, 7, 'five sentences, one line counting the rest, and the overflow sentence');
  assert.match(listed.skipped[0], /"Profile 21" was skipped: only 20 profiles are kept\./);
  assert.equal(listed.skipped[5], 'And 35 more were skipped.', '40 entries are not profiles (21 to 60), five of them shown');
  assert.equal(listed.skipped[6], 'More profiles were saved than this page keeps, and the rest were skipped.', 'always last, never swallowed by the count');
  // Five or fewer are all shown, as they were.
  storage.set('profiles', { version: PROFILE_VERSION, profiles: names.slice(0, 25).map((n) => profile(n)) }); // 20 kept, 5 skipped
  assert.equal(profiles.list().skipped.length, 5);
  assert.ok(!profiles.list().skipped.some((s) => /^And /.test(s)));
  // Six sentences, no overflow: five and a line for the one more.
  storage.set('profiles', { version: PROFILE_VERSION, profiles: names.slice(0, 26).map((n) => profile(n)) });
  assert.deepEqual(profiles.list().skipped.slice(5), ['And 1 more were skipped.']);
});

test('Remove unreadable drops only the entries that can\'t be read; on another version\'s list it clears the list', () => {
  const { profiles, storage } = open();
  storage.set('profiles', { version: PROFILE_VERSION, profiles: [profile('Good'), { junk: true }, profile('Also good'), 5] });
  assert.deepEqual(profiles.discardUnreadable(), { ok: true, persisted: true, removed: 2 });
  assert.deepEqual(stored(storage).profiles.map((p) => p.name), ['Good', 'Also good']);
  assert.equal(profiles.list().unreadable, 0);
  assert.deepEqual(profiles.discardUnreadable(), { ok: true, persisted: true, removed: 0 });
  storage.set('profiles', { version: 9, profiles: [profile('x')] });
  assert.equal(profiles.discardUnreadable().ok, true);
  assert.deepEqual(stored(storage), { version: PROFILE_VERSION, profiles: [] });
  assert.ok(profiles.save(profile('Fresh')).ok);
});

test('the whole stored list is capped at 2,000,000 characters: a Save that would pass it is refused in words and writes nothing', () => {
  const { profiles, storage } = open();
  const big = (name) => {
    const p = profile(name);
    const pat = p.routes.find((r) => r.kind === 'pattern');
    p.routes = Array.from({ length: 30 }, (_, i) => ({ ...structuredClone(pat), id: `R${i}`, name: `Route ${i}`, points: Array.from({ length: 100 }, (_, k) => ({ ...pat.points[k % pat.points.length], label: `Point number ${k}`, x: k * 10.123456789, y: k * 7.987654321 })) }));
    p.aircraft = [];
    return p;
  };
  const one = JSON.stringify(big('n0')).length;
  assert.ok(one < MOST_CHARS && one > 100_000, `a big profile is ${one} characters`);
  const fits = Math.floor((MOST_STORED_CHARS - 200) / one);
  for (let i = 0; i < fits; i++) assert.ok(profiles.save(big(`n${i}`)).ok, `profile ${i}`);
  const before = JSON.stringify(stored(storage));
  const over = profiles.save(big('one too many'));
  assert.equal(over.ok, false);
  assert.match(over.problem, /more than 2,000,000 characters/);
  assert.match(over.problem, /Delete a profile/);
  assert.equal(JSON.stringify(stored(storage)), before, 'nothing was written');
  assert.ok(JSON.stringify(stored(storage)).length <= MOST_STORED_CHARS);
  // Replacing one with a smaller one still works, and so does Delete.
  assert.ok(profiles.save(profile('n0')).ok);
  assert.ok(profiles.remove('n1').ok);
});
