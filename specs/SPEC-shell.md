# Spec: shell

Module id `shell` in the approved map (`SPEC.md`). Build step 1.

## Objective

The hub: the home screen, the one place that opens and closes modules, the settings everyone shares, and the pages that aren't modules (About, Report a problem). In V6 every module lived on one page at once, hidden modules kept running (#39), dead cards and buttons stayed on screen (#40), the home screen autoplayed 61 MB of video (#41), and there was no shared Zulu/local switch (#42). Here, exactly one module is mounted at a time, only real features appear, and the home screen loads in about 3 MB or less (R5).

Step 1 ends with this shell live on GitHub Pages (D12) with no modules built yet. Each module's card becomes clickable when that module lands.

## Behaviour

**Routes** (hash-based, so it works on GitHub Pages and from a plain file server):

| Route | Shows |
|---|---|
| `#/` (or empty) | Home screen |
| `#/about` | About Dad (V6's About content) |
| `#/<module-id>` | That module, e.g. `#/debrief` |
| anything else | Home screen with a one-line "page not found" note |

The browser's Back and Forward buttons move between these. After a page change, the new page opens at its top with keyboard focus on it, so Tab and screen readers carry on from there. The "Skip to content" link moves focus to the page without changing the address.

**Browsers:** current Chrome, Edge and Firefox, and Safari 15.4 or newer (the Settings dialog and `Object.hasOwn` need it). Nothing to install (R1).

**Home screen:** the title "DAD's OODA LOOP" (D27), then one card per module in `src/shell/registry.js`, in build order: Debrief, Formation Turn Sim, Turn Fight, Traffic Pattern Sim, SOF Dashboard, then About. A module that isn't built yet shows as a plain card marked "Coming soon". It isn't a button and can't be clicked (R3). PT-PT Sim and the Briefing Board don't appear (R19).

**Card videos:** each module's card plays its V6 loop, re-encoded silent at 640 px (D9, R15; about 1 MB for all five, made by `tools/make_card_media.py`). A card shows a still until its video is needed. A video loads only when its card is on screen, plays only while visible, and doesn't play at all when the user or the system asks for reduced motion (#41).

**Header** (on every screen): the title (links home), the time, Settings, and Report a problem.

- **Time:** Zulu first with local beside it, or local first, as set in Settings (D18, R10). Local time is the home airfield's zone, America/Regina (UTC-6 all year) for CYMJ, until `airfields` lands in step 2. The formatting comes from `core/time.js` (owned by the flight-math workstream). The clock ticks once a second on the shell's scheduler scope and pauses while the tab is hidden.
- **Settings** opens a dialog: time order (Zulu first / Local first) and card videos (follow this computer's setting / play them / still pictures only; the setting is `motion`, and "still pictures only" also turns off transitions). If the browser blocks storage, the dialog says settings won't be saved.
- **Report a problem** (R20) opens GitHub's new-issue form for this repo, using the form in `.github/ISSUE_TEMPLATE/problem.yml`, with the current module and app version filled in.

**About:** V6's About page content (the formation photo, Dad's text, contact, mission, and support links), with a link back home.

**Footer:** the app version (build date and commit) so bug reports say which version they're about.

**New version available:** when an updated version has been published, a bar says so with a Reload button (see Offline).

## Module contract (the fix for R4)

Every module's `index.js` exports:

```js
export default {
  id: 'turn-sim',
  title: 'Formation Turn Sim',
  mount(root, app) {
    // build the module inside root
    return () => { /* optional extra cleanup */ };
  },
};
```

The registry lists each module's id, title, card text, card media and a `load()` that dynamically imports its `index.js`, so a module's code downloads only when it opens (R5).

`app` handed to a module:

| Field | What it is |
|---|---|
| `app.settings` | Shared settings: `get()` and `subscribe()` (subscriptions end on unmount) |
| `app.storage` | The store scoped to the module's id |
| `app.scheduler` | A scheduler scope, disposed on unmount |
| `app.listen(target, type, handler, options)` | Adds an event listener that's removed on unmount |
| `app.keys({ 'KeyP': fn, … })` | Keyboard shortcuts that work only while this module is open and never while typing in a field |
| `app.time` | The time formatters from `core/time.js`, following the shared setting |
| `app.status(text)` | Shows a short message in the module's status line |

Opening a route: the shell unmounts the current module (calls its cleanup, disposes its scheduler scope, removes its listeners, shortcuts and subscriptions, empties its root), then mounts the next. If loading or mounting throws, the shell shows an error card with a Report a problem link and the Home button still works.

## Offline and install (D15, R6)

- A web app manifest and icons, so browsers offer to install it.
- A service worker (`sw.js`, generated at build time with the list of built files) caches the app on the first visit, so after that every built module opens with the network off. Live weather and map tiles are never cached as if they were fresh.
- When a new version is published, the service worker downloads it in the background and the shell shows the "new version" bar. Nobody is left on an old version without being told.

## Files

```
index.html               the page: header, main view, footer; loads src/app.js
src/app.js               entry: creates store, settings, scheduler, host; starts the router
src/shell/registry.js    the module list (ids, titles, card text and media, load())
src/shell/router.js      parses the hash into a route
src/shell/host.js        mounts and unmounts modules, builds the app object
src/shell/home.js        home screen and cards
src/shell/about.js       About page
src/shell/header.js      title, time, Settings, Report a problem
src/shell/settings-dialog.js
src/shell/update-bar.js  new-version bar and service-worker registration
src/shell/README.md      where to change common things (R8)
public/media/cards/      card videos and stills
public/manifest.webmanifest, public/icons/
.github/ISSUE_TEMPLATE/problem.yml
```

## Tests

Unit (`tests/unit/shell/`, Node):

- Router: every route in the table, including unknown ones.
- Registry: ids are unique kebab-case and match the approved map; no PT-PT or Briefing Board (R19).
- Host, with a fake module that starts frames, timers, listeners, shortcuts and a settings subscription: after unmount, all are gone and `scheduler.stats()` is zero (R4). A module whose `mount` throws leaves the host usable.

Browser (`tests/e2e/`, Playwright, every test fails on any console error, R7):

- Smoke (R1): home, About, Settings and every route open in Chromium, Firefox and WebKit.
- Overlap scan (R2): at 1366 × 768 and 1920 × 1080, no visible control overlaps another or is cut off, on every route.
- Click-through (R3): every visible button and link on every route does something: the route changes, a dialog opens, or the page changes. External links are checked by address instead of being opened.
- Module switching (R4): after visiting every route and coming back home, no module frames, timers or listeners remain.
- Storage blocked: the app opens and says settings won't be saved.
- Offline (R6): after one visit, with the network off, a reload shows the home screen and About.
- Size (R5): the build fails if the home screen needs more than 3 MB, or card videos total more than 3 MB (R15).

## Sign-off checklist (R21)

`docs/checklists/shell.md`: a short list anyone can run in a browser: open the link, open About, change the time order and reload, Report a problem opens the form, install it, reload it offline.

## Out of scope for step 1

Module content, the home airfield setting (step 2 with `airfields`), saving a debrief to a file (step 2 with `flight-data`).
