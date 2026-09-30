// Safe browser storage. Nothing here throws because of the browser: if storage
// is blocked, missing or full, values are kept in memory for the rest of the
// visit and `persistent` becomes false. See specs/SPEC-storage.md.

export const KEY_PREFIX = 'ooda:v1:';
const PROBE_KEY = `${KEY_PREFIX}__probe__`;
const SCOPE_NAME = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

// `source` is a storage object (like window.localStorage) or a function that
// returns one. Pass a function in the browser: just reading window.localStorage
// can throw when the browser blocks it.
export function createStore(source) {
  const memory = new Map();
  let backend = null;
  let readable = false; // can we still read what the browser saved earlier?
  let persistent = false; // are new values still being saved?

  try {
    backend = (typeof source === 'function' ? source() : source) ?? null;
    if (backend) {
      backend.getItem(PROBE_KEY);
      readable = true;
      backend.setItem(PROBE_KEY, '1'); // fails when blocked or already full
      backend.removeItem(PROBE_KEY);
      persistent = true;
    }
  } catch {
    // keep whatever was confirmed before the failure
  }

  function read(key) {
    if (memory.has(key)) return memory.get(key);
    if (!readable) return null;
    try {
      return backend.getItem(key);
    } catch {
      readable = false;
      persistent = false;
      return null;
    }
  }

  function write(key, text) {
    memory.set(key, text);
    if (!persistent) return false;
    try {
      backend.setItem(key, text);
      memory.delete(key); // the browser has it now
      return true;
    } catch {
      persistent = false; // blocked or full: keep it in memory from here on
      return false;
    }
  }

  function erase(key) {
    memory.delete(key);
    if (!readable) return;
    try {
      backend.removeItem(key);
    } catch {
      persistent = false;
    }
  }

  function scoped(scopeName) {
    if (!SCOPE_NAME.test(scopeName)) throw new Error(`Storage scope must be a kebab-case module id, got "${scopeName}"`);
    const full = (name) => `${KEY_PREFIX}${scopeName}:${name}`;
    return {
      get persistent() {
        return persistent;
      },
      get(name, fallback = undefined) {
        const text = read(full(name));
        if (text === null) return fallback;
        try {
          return JSON.parse(text);
        } catch {
          return fallback;
        }
      },
      set(name, value) {
        return write(full(name), JSON.stringify(value));
      },
      remove(name) {
        erase(full(name));
      },
    };
  }

  const app = scoped('app');
  return {
    get persistent() {
      return persistent;
    },
    get: app.get,
    set: app.set,
    remove: app.remove,
    scope: scoped,
  };
}

// The browser's own storage, read lazily (reading it can throw when blocked).
export const browserStorage = () => globalThis.localStorage;
