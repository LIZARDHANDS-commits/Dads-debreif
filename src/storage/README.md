# storage

Everything the app remembers in the browser goes through here (spec: `specs/SPEC-storage.md`).

- `store.js`: `createStore(() => window.localStorage)` gives `get`, `set`, `remove` and `scope(moduleId)`. If the browser blocks or fills its storage, nothing breaks: values are kept for the visit and `store.persistent` is `false`.
- `standards.js`: `createStandards({ store })` keeps the shared formation standards (R18, D89), seeded from core's `DEFAULT_STANDARDS` (the SMM's numbers, D114-D116), with range checks. Modules reach it as `app.standards` (specs/SPEC-shell.md).
- `file.js`: `downloadText(text, name, { type })`, `pickTextFiles({ accept, multiple, maxBytes })` and `readTextFiles(files, { maxBytes })` for saving and opening files; a file over the limit is refused before it's read.
- `settings.js`: `createSettings(store.scope(id), DEFAULTS, { allowed })` keeps one settings document per scope, checks each value against its default, and tells subscribers about changes.

Keys look like `ooda:v1:<module-id>:<name>`. Modules never touch `localStorage` themselves; they use `app.storage`, which is already scoped to them.

**To add a shared setting:** add it with its default to `SHARED_DEFAULTS` in `src/app.js` (and its allowed values, if it's a choice).
