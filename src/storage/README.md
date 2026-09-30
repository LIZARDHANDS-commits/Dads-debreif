# storage

Everything the app remembers in the browser goes through here (spec: `specs/SPEC-storage.md`).

- `store.js`: `createStore(() => window.localStorage)` gives `get`, `set`, `remove` and `scope(moduleId)`. If the browser blocks or fills its storage, nothing breaks: values are kept for the visit and `store.persistent` is `false`.
- `settings.js`: `createSettings(store.scope(id), DEFAULTS, { allowed })` keeps one settings document per scope, checks each value against its default, and tells subscribers about changes.

Keys look like `ooda:v1:<module-id>:<name>`. Modules never touch `localStorage` themselves; they use `app.storage`, which is already scoped to them.

**To add a shared setting:** add it with its default to `SHARED_DEFAULTS` in `src/app.js` (and its allowed values, if it's a choice).
