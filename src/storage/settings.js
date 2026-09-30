// Versioned settings kept in one document per storage scope.
// See specs/SPEC-storage.md.

const DOC = 'settings';

// store: a storage scope from createStore(...).scope(id)
// defaults: every setting and its default value; saved values must match the default's type
// options.allowed: optional list of allowed values per setting
// options.version / options.migrate(values, fromVersion): for renaming or reshaping later
export function createSettings(store, defaults, { version = 1, allowed = {}, migrate } = {}) {
  const listeners = new Set();

  function valid(key, value) {
    if (!Object.hasOwn(defaults, key)) return false;
    if (typeof value !== typeof defaults[key]) return false;
    if (typeof value === 'number' && !Number.isFinite(value)) return false;
    if (allowed[key] && !allowed[key].includes(value)) return false;
    return true;
  }

  function clean(values) {
    const out = { ...defaults };
    if (values && typeof values === 'object') {
      for (const [key, value] of Object.entries(values)) if (valid(key, value)) out[key] = value;
    }
    return Object.freeze(out);
  }

  function load() {
    const saved = store.get(DOC, null);
    if (!saved || typeof saved !== 'object') return clean(null);
    if (saved.version === version) return clean(saved.values);
    if (typeof migrate === 'function' && Number.isInteger(saved.version) && saved.version < version) {
      let migrated;
      try {
        migrated = clean(migrate(saved.values ?? {}, saved.version));
      } catch (err) {
        console.error('Old settings could not be converted; using the defaults:', err);
        return clean(null);
      }
      save(migrated);
      return migrated;
    }
    return clean(null);
  }

  function save(values) {
    store.set(DOC, { version, values });
  }

  let current = load();

  function change(next) {
    const changed = Object.keys(defaults).some((k) => next[k] !== current[k]);
    current = next;
    save(current);
    if (!changed) return;
    for (const fn of [...listeners]) {
      try {
        fn(current);
      } catch (err) {
        console.error('Settings listener failed:', err);
      }
    }
  }

  return {
    get: () => current,
    update(patch) {
      const next = { ...current };
      for (const [key, value] of Object.entries(patch ?? {})) if (valid(key, value)) next[key] = value;
      change(Object.freeze(next));
    },
    reset() {
      change(clean(null));
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
