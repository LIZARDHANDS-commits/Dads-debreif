// Where the Traffic Sim keeps its saved profiles and which one was used last (specs/SPEC-traffic.md:
// Profiles and notes; task 7, #48). It sits on the app's storage layer (`app.storage`, scope
// `traffic`, src/storage/store.js), never on the browser's storage directly, so a blocked or
// full browser storage can't break anything: the profiles are then kept for the visit and
// `persistent` says they won't outlive it.
//
// Everything read is checked (profile.js) and everything written was checked first, so the
// list only ever gains profiles that pass. What this page can't read (an entry that fails the
// checks, or a list from another version of the page) is never lost by a Save or a Delete:
// entries are carried through unchanged, and a list from another version is left alone and the
// write refused. The whole list is capped, so the app's shared storage never hits its quota
// because of a profile. The built-in setups are never stored.
import { BUILT_IN, MOST_SAVED, MOST_STORED_CHARS, PROFILE_VERSION, checkProfile, isBuiltInName, readEntries } from './profile.js';

const PROFILES_KEY = 'profiles';
const LAST_KEY = 'last';

const FOREIGN = "The profiles saved in this browser are from a different version of this page, so nothing was saved or changed. Use Remove unreadable in Profiles and notes to clear them.";

/**
 * storage: `app.storage`. Returns:
 *   persistent   false when this browser won't keep what is saved
 *   list()       { profiles, skipped, unreadable, foreign }: the saved profiles that pass the checks, a sentence for each one
 *                skipped, how many entries can't be read, and whether the list is from another version of the page
 *   save(profile)   { ok, persisted, profile } or { ok: false, problem }; a profile with the same name is replaced
 *   remove(name)    { ok, persisted } or { ok: false, problem } (also when there is no such profile)
 *   discardUnreadable()   { ok, persisted, removed }: drops the entries that can't be read (all of a list from another version)
 *   lastUsed()   { kind: 'built-in', id } or { kind: 'saved', name } or null
 *   setLast(entry)
 * @param {{ get: (name: string, fallback?: any) => any, set: (name: string, value: any) => boolean, remove?: (name: string) => void, persistent?: boolean }} storage
 */
export function createProfileStore(storage) {
  const read = (key) => {
    try {
      return storage.get(key, null);
    } catch {
      return null;
    }
  };
  const write = (key, value) => {
    try {
      return storage.set(key, value) === true;
    } catch {
      return false;
    }
  };

  const stored = () => readEntries(read(PROFILES_KEY));
  const doc = (entries) => ({ version: PROFILE_VERSION, profiles: entries.map((e) => e.profile ?? e.raw) });

  function list() {
    const { state, entries } = stored();
    if (state === 'foreign') return { profiles: [], skipped: ['The saved profiles in this browser could not be read, so they were skipped.'], unreadable: 0, foreign: true };
    const skipped = entries.map((e) => e.skipped).filter((s) => s !== null);
    if (entries.length > MOST_SAVED * 2) skipped.push('More profiles were saved than this page keeps, and the rest were skipped.');
    return { profiles: entries.filter((e) => e.profile).map((e) => e.profile), skipped, unreadable: entries.filter((e) => !e.profile).length, foreign: false };
  }

  return {
    get persistent() {
      return storage.persistent === true;
    },
    list,

    save(profile) {
      const result = checkProfile(profile);
      if (!result.ok) return { ok: false, problem: `That profile can't be saved: ${result.problem}.` };
      const clean = result.profile;
      if (isBuiltInName(clean.name)) return { ok: false, problem: `"${clean.name}" is a built-in setup and can't be replaced. Type another name.` };
      const { state, entries } = stored();
      if (state === 'foreign') return { ok: false, problem: FOREIGN };
      const at = entries.findIndex((e) => e.profile?.name === clean.name);
      if (at < 0 && entries.filter((e) => e.profile).length >= MOST_SAVED) return { ok: false, problem: `${MOST_SAVED} profiles are saved already. Delete one to make room.` };
      if (at >= 0) entries[at] = { raw: clean, profile: clean, skipped: null };
      else entries.push({ raw: clean, profile: clean, skipped: null });
      const next = doc(entries);
      const size = JSON.stringify(next).length;
      if (size > MOST_STORED_CHARS) {
        return { ok: false, problem: `The saved profiles would take more than ${MOST_STORED_CHARS.toLocaleString('en-CA')} characters in this browser (${size.toLocaleString('en-CA')}). Delete a profile to make room.` };
      }
      return { ok: true, persisted: write(PROFILES_KEY, next), profile: clean };
    },

    remove(name) {
      const { state, entries } = stored();
      if (state === 'foreign') return { ok: false, persisted: true, problem: FOREIGN };
      const at = entries.findIndex((e) => e.profile?.name === name);
      if (at < 0) return { ok: false, persisted: true, problem: 'That profile is not in the list any more.' };
      entries.splice(at, 1);
      return { ok: true, persisted: write(PROFILES_KEY, doc(entries)) };
    },

    discardUnreadable() {
      const { state, entries } = stored();
      if (state === 'empty') return { ok: true, persisted: true, removed: 0 };
      const kept = entries.filter((e) => e.profile);
      const removed = entries.length - kept.length;
      if (state === 'ok' && removed === 0) return { ok: true, persisted: true, removed: 0 };
      return { ok: true, persisted: write(PROFILES_KEY, doc(kept)), removed };
    },

    lastUsed() {
      const raw = read(LAST_KEY);
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
      if (raw.kind === 'built-in' && BUILT_IN.some((b) => b.id === raw.id)) return { kind: 'built-in', id: raw.id };
      if (raw.kind === 'saved' && typeof raw.name === 'string') return { kind: 'saved', name: raw.name };
      return null;
    },

    setLast(entry) {
      write(LAST_KEY, entry.kind === 'built-in' ? { kind: 'built-in', id: entry.id } : { kind: 'saved', name: entry.name });
    },
  };
}
