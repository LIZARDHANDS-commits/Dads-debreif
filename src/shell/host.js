// Mounts one module at a time and guarantees that closing it stops everything
// it started: animation frames, timers, event listeners, keyboard shortcuts and
// settings subscriptions (R4). See the module contract in specs/SPEC-shell.md.
import { clear } from '../ui-kit/dom.js';

const TYPING = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export function createHost({ root, scheduler, store, settings, time, keyTarget = globalThis, onStatus = () => {} }) {
  let current = null; // { id, cleanups: Set, scope, unmount }
  let openToken = 0;

  function makeApp(session) {
    const track = (undo) => {
      session.cleanups.add(undo);
      return () => {
        session.cleanups.delete(undo);
        undo();
      };
    };
    return {
      id: session.id,
      settings: {
        get: settings.get,
        subscribe: (fn) => {
          const unsubscribe = settings.subscribe(fn);
          session.subscriptions += 1;
          return track(() => {
            unsubscribe();
            session.subscriptions -= 1;
          });
        },
      },
      storage: store.scope(session.id),
      scheduler: session.scope,
      time,
      listen(target, type, handler, options) {
        target.addEventListener(type, handler, options);
        session.listeners += 1;
        return track(() => {
          target.removeEventListener(type, handler, options);
          session.listeners -= 1;
        });
      },
      keys(bindings) {
        const onKey = (event) => {
          const t = event.target ?? {};
          if (TYPING.has(t.tagName) || t.isContentEditable) return;
          if (event.ctrlKey || event.metaKey || event.altKey) return;
          const fn = bindings[event.code] ?? bindings[event.key];
          if (!fn) return;
          event.preventDefault?.();
          fn(event);
        };
        return this.listen(keyTarget, 'keydown', onKey);
      },
      status: (text) => onStatus(text),
    };
  }

  function teardown(session) {
    try {
      session.unmount?.();
    } catch (err) {
      console.error(`Closing "${session.id}" failed; cleaned up anyway:`, err);
    }
    for (const undo of [...session.cleanups]) {
      try {
        undo();
      } catch (err) {
        console.error(`Cleanup for "${session.id}" failed:`, err);
      }
    }
    session.cleanups.clear();
    session.scope.dispose();
    clear(root);
    delete root.dataset.module;
  }

  function close() {
    openToken += 1; // cancels any module still loading
    if (!current) return;
    const session = current;
    current = null;
    teardown(session);
  }

  async function open(entry) {
    close();
    const token = openToken;
    const mod = (await entry.load()).default;
    if (token !== openToken) return; // the user went somewhere else while it loaded

    const session = { id: entry.id, cleanups: new Set(), scope: scheduler.scope(entry.id), unmount: null, listeners: 0, subscriptions: 0 };
    root.dataset.module = entry.id;
    current = session;
    try {
      const unmount = mod.mount(root, makeApp(session));
      session.unmount = typeof unmount === 'function' ? unmount : null;
    } catch (err) {
      current = null;
      teardown(session);
      throw err;
    }
  }

  return {
    open,
    close,
    get current() {
      return current?.id ?? null;
    },
    stats: () => ({
      mounted: current?.id ?? null,
      listeners: current?.listeners ?? 0,
      subscriptions: current?.subscriptions ?? 0,
    }),
  };
}
