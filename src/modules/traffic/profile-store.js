// Where the Traffic Sim keeps its saved profiles and which one was used last (specs/SPEC-traffic.md:
// Profiles and notes; task 7, #48). It sits on the app's storage layer (`app.storage`, scope
// `traffic`, src/storage/store.js), never on the browser's storage directly, so a blocked or
// full browser storage can't break anything: the profiles are then kept for the visit and
// `persistent` says they won't outlive it.
//
// Everything read is checked (profile.js) and everything written was checked first, so the
// stored list only ever holds profiles that pass. The built-in setups are never stored.
import { BUILT_IN, MOST_SAVED, PROFILE_VERSION, checkProfile, isBuiltInName, readProfiles } from './profile.js';

const PROFILES_KEY = 'profiles';
const LAST_KEY = 'last';

/**
 * storage: `app.storage`. Returns:
 *   persistent   false when this browser won't keep what is saved
 *   list()       { profiles, skipped }: the saved profiles that pass the checks, and a sentence for each one skipped
 *   save(profile)   { ok, persisted, profile } or { ok: false, problem }; a profile with the same name is replaced
 *   remove(name)    { ok, persisted } (ok is false when there is no such profile)
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

  const list = () => readProfiles(read(PROFILES_KEY));
  const writeList = (profiles) => write(PROFILES_KEY, { version: PROFILE_VERSION, profiles });

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
      const { profiles } = list();
      const at = profiles.findIndex((p) => p.name === clean.name);
      if (at < 0 && profiles.length >= MOST_SAVED) return { ok: false, problem: `${MOST_SAVED} profiles are saved already. Delete one to make room.` };
      if (at >= 0) profiles[at] = clean;
      else profiles.push(clean);
      return { ok: true, persisted: writeList(profiles), profile: clean };
    },

    remove(name) {
      const { profiles } = list();
      const kept = profiles.filter((p) => p.name !== name);
      if (kept.length === profiles.length) return { ok: false, persisted: true };
      return { ok: true, persisted: writeList(kept) };
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
