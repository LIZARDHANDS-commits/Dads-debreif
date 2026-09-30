# Spec: storage

Module id `storage` in the approved map (`SPEC.md`). Build step 1.

## Objective

One safe place for everything the app remembers in the browser. V6 used four families of storage keys and read them without guards, so a browser that blocks storage (private windows, locked-down machines) could stop the whole page. Here, nothing crashes when storage is blocked, and modules can't overwrite each other's data (R4).

## What it provides

`src/storage/store.js`

```js
const store = createStore(browserStorage); // a function returning the backend; optional
store.get('settings', fallback);  // parsed JSON, or fallback if missing, blocked or corrupt
store.set('settings', value);     // returns true if it was saved to the browser
store.raw('settings');             // the saved text as it is, or null if missing or blocked
store.remove('settings');
store.persistent;                 // false when the browser refuses storage
const turnSim = store.scope('turn-sim'); // same API, keys kept separate
```

- The backend is passed as a function (`browserStorage = () => globalThis.localStorage`) because in a browser that blocks storage, merely reading `localStorage` throws. The store calls it inside its own guard, so nothing outside `storage/` ever touches `localStorage`.
- Every key is stored as `ooda:v1:<scope>:<name>`. The shell's own data uses the scope `app`. Shared data has its own scope: `airfields` for the home field and alternates, `standards` for the formation standards (`src/storage/standards.js`, reached as `app.standards`).
- Every backend call is wrapped. If the backend is missing or throws (blocked, full, disabled), the store keeps working from memory for the rest of the visit and `persistent` becomes `false`, so the settings screen can say "settings won't be saved in this browser".
- Values are JSON. A value that fails to parse counts as missing and falls back.

`src/storage/settings.js`

```js
const settings = createSettings(store.scope('app'), DEFAULTS, { version: 1 });
settings.get();                    // a frozen copy: defaults overlaid with saved values
settings.update({ timePrimary: 'local' });
settings.reset();
const stop = settings.subscribe(next => { … }); // called after every change
```

- One settings document per scope, saved with its `version`. An older version is passed through `migrate(saved, fromVersion)` if given; otherwise it's dropped for defaults.
- Each saved field is checked against its default: a field whose type differs from the default, or that isn't in the defaults, is ignored. Allowed values can be listed per field (`{ timePrimary: ['zulu', 'local'] }`).

Step 1's shared settings: `timePrimary` (`'zulu'` or `'local'`, default `'zulu'`, D18) and `motion` (`'system'` follows the computer's reduced-motion setting, `'full'` plays card videos and animations, `'reduced'` shows stills only; default `'system'`, issue #41).

`file.js`: saving a file to the computer and opening one from it, for every module (the debrief file R17, Turn Sim and Traffic setups). It moves text only; the module that owns a format checks what's in it.

```js
import { downloadText, pickTextFiles, readTextFiles } from '../../storage/file.js';
downloadText(json, 'sortie.dadsdebrief.json', { type: 'application/json' }); // the browser's normal download
const files = await pickTextFiles({ accept: '.json', maxBytes }); // [{ name, size, text }], [] if cancelled
const dropped = await readTextFiles(event.dataTransfer.files, { maxBytes }); // same, for a drop or your own <input>
```

- The saved name is cleaned (`safeFileName`): no folders, no characters a file system refuses, at most 120 characters.
- A file over `maxBytes` is refused with a `FileTooBigError` ("big.kml is too big to open (12.3 MB; the limit is 10.0 MB).") before any file is read.
- `pickTextFiles` must be called from a click, since browsers only open the picker in answer to one.

## Boundaries

- No page access except the storage backend passed in, so it's unit-tested in Node with a fake backend.
- No other code touches `localStorage` directly. Modules get `app.storage`, already scoped to their id.
- Never throws to its caller because of the browser's storage.

## Tests (`tests/unit/storage/`)

- Round trip of values; `get` fallback for missing, corrupt and blocked keys; `raw` gives corrupt text back as it is and null for a missing key.
- A backend that throws on every call: nothing throws, values are kept for the visit, `persistent` is `false`.
- A backend that fills up (`QuotaExceededError`) on `set`: returns `false`, value kept in memory.
- Scopes don't see each other's keys, and nothing is written outside the `ooda:v1:` prefix.
- Settings: defaults, update, reset, subscribe/unsubscribe, wrong types ignored, values outside the allowed list ignored, unknown fields dropped, version migration.

## Success criteria

- All tests above pass under `npm test`.
- In the browser, blocking storage (Playwright: a context where `localStorage` throws) still opens the app with no errors (R7), and the settings screen says settings won't be saved.
