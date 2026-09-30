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

**Home screen:** the title "DAD's OODA LOOP" (D27), then one card per module in `src/shell/registry.js`, in build order: Debrief, Formation Turn Sim, Turn Fight, Traffic Pattern Sim, SOF Dashboard, then About. A module that isn't built yet shows as a plain card marked "Coming soon". It isn't a button and can't be clicked (R3). A module hooked in before the combined sign-off opens as usual and its card carries a PROTOTYPE badge (D135); the flag comes off at sign-off. PT-PT Sim and the Briefing Board don't appear (R19).

**Card videos:** each module's card plays its V6 loop, re-encoded silent at 640 px (D9, R15; about 1 MB for all five, made by `tools/make_card_media.py`). A card shows a still until its video is needed. A video loads only when its card is on screen, plays only while visible, and doesn't play at all when the user or the system asks for reduced motion (#41).

**Header** (on every screen): the title (links home), the time, Settings, and Report a problem.

- **Time:** Zulu first with local beside it, or local first, as set in Settings (D18, R10). Local time is the home airfield's zone (`airfields.home().timeZone`; America/Regina, UTC-6 all year, for CYMJ). It is read on every tick, and the clock redraws at once when the home field changes (SPEC-airfields). The formatting comes from `core/time.js` (owned by the flight-math workstream). The clock ticks once a second on the shell's scheduler scope and pauses while the tab is hidden.
- **Settings** opens a dialog: time order (Zulu first / Local first) and card videos (follow this computer's setting / play them / still pictures only; the setting is `motion`, and "still pictures only" also turns off transitions). Below them, the Airfields section (`createAirfieldsPanel` from `src/airfields/panel.js`, SPEC-airfields), set apart by a rule. If the browser blocks storage, the dialog says settings won't be saved.
- **Report a problem** (R20) opens GitHub's new-issue form for this repo, using the form in `.github/ISSUE_TEMPLATE/problem.yml`, with the current module and app version filled in.

**About:** V6's About page content (the formation photo, Dad's text, contact, mission, and support links), with a link back home.

**Footer:** when this copy was published, in plain words ("Updated 30 Sep 2026, 02:01Z", R22). The version (build date and commit) sits in its tooltip and goes with every bug report, so reports say which version they're about.

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

The registry lists each module's id, title, card text, card media and a `load()` that dynamically imports its `index.js`, so a module's code downloads only when it opens (R5). It also carries `prototype: true` for every module except Debrief, which puts the PROTOTYPE badge on the card once the module is hooked in; the flag is removed at the combined sign-off (D135).

`app` handed to a module:

| Field | What it is |
|---|---|
| `app.settings` | Shared settings: `get()` and `subscribe()` (subscriptions end on unmount) |
| `app.storage` | The store scoped to the module's id |
| `app.scheduler` | A scheduler scope, disposed on unmount |
| `app.listen(target, type, handler, options)` | Adds an event listener that's removed on unmount |
| `app.keys({ 'KeyP': fn, … })` | Keyboard shortcuts that work only while this module is open and never while typing in a field |
| `app.time` | Time from `core/time.js` for the home airfield: `zulu(date)` "18:00:00Z", `local(date)` "12:00:00 CST", `ordered(date)` both in the order Settings picked, `offsetMinutes(date)`, `zone` (read live, so it follows the home field), `now()` |
| `app.airfields` | The home field and alternates, read-only: `home()`, `alternates()`, `stations()`, `checkOptions(icao)`, and `subscribe()` (subscriptions end on unmount). They're changed only in Settings. |
| `app.standards` | The formation standards the debrief and the Turn Sim judge by (R18, D89), one shared copy kept in the `standards` storage scope. `get()` returns a frozen object shaped like core's `DEFAULT_STANDARDS` (the SMM's numbers: 0-10° of sweep D116, offset 7,000 ± 1,000 ft D114, lead 220 kt in the low block and 200 kt in the mid block D115), ready for `core/standards.js`. `update(patch)` merges per group (`{ spread: { minFt: 4500 } }`) and saves only if every value is in range and the spread minimum and sweep least don't pass their maximums; it returns `{ ok, errors }`, each error `{ path: 'spread.minFt', message }` for showing beside that box. `reset()` goes back to `DEFAULT_STANDARDS`. Saves from before D114-D116 (version 1, V6's shape) fall back to the defaults. `limits` gives each number's label, unit, min, max and step; `check(value)` lists the problems with a whole standards object (for a debrief file). `subscribe()` ends on unmount. The debrief owns the editor. |
| `app.exampleText(asset)` | Downloads one of the example flight's track files by its asset name (flight-data's `EXAMPLE_FLIGHT`) and resolves to its text, so `loadExampleFlight(app.exampleText)` works as it is. The files are served gzipped from `public/examples/<asset>.gz` (about 0.7 MB for all four instead of 11 MB) and un-gzipped in the browser. Nothing downloads until it's called (R5). |
| `app.status(text)` | Shows a short message in the module's status line |

Opening a route: the shell unmounts the current module (calls its cleanup, disposes its scheduler scope, removes its listeners, shortcuts and subscriptions, empties its root), then mounts the next. If loading or mounting throws, the shell shows an error card with a Report a problem link and the Home button still works.

## Offline and install (D15, R6)

- A web app manifest and icons, so browsers offer to install it.
- A service worker (`sw.js`, generated at build time with the list of built files) caches the app on the first visit, so after that every built module opens with the network off. Live weather and map tiles are never cached as if they were fresh.
- When a new version is published, the service worker downloads it in the background and the shell shows the "new version" bar. Nobody is left on an old version without being told.
- Card videos aren't kept for offline use (their stills show instead), which keeps the first visit about 2 MB lighter.
- The example flight's files aren't part of the first visit either. The service worker keeps each one the first time it's downloaded, so an example opened once also plays offline (R6).
- An open app looks for a new version every hour, since the SOF screen stays open all day, and again when its tab comes back into view (at most every five minutes).

## Files

```
index.html               the page: header, main view, footer; loads src/app.js
src/app.js               entry: creates store, settings, scheduler, host; starts the router
src/shell/registry.js    the module list (ids, titles, card text and media, load())
src/shell/router.js      parses the hash into a route
src/shell/host.js        mounts and unmounts modules, builds the app object
src/shell/home.js        home screen and cards
src/shell/about.js       About page
src/shell/header.js      the header clock and app.time
src/shell/settings-dialog.js
src/shell/update-bar.js  new-version bar and service-worker registration
src/shell/version.js     the footer's "Updated …" line
src/shell/sw.js          the service worker; the build fills in its file list (tools/service-worker.mjs)
src/shell/README.md      where to change common things (R8)
public/media/cards/      card videos and stills
public/manifest.webmanifest, public/icons/   (icons drawn by tools/make_icons.mjs)
.github/ISSUE_TEMPLATE/problem.yml
```

## Tests

Unit (`tests/unit/shell/`, Node):

- Router: every route in the table, including unknown ones.
- Registry: ids are unique kebab-case and match the approved map; no PT-PT or Briefing Board (R19).
- Home cards: `cardBadge` gives "Coming soon" until a module is hooked in, then "PROTOTYPE" while its registry entry has `prototype: true` (D135), then nothing; only turn-sim, turn-fight, traffic and sof carry the flag.
- Host, with a fake module that starts frames, timers, listeners, shortcuts and a settings subscription: after unmount, all are gone and `scheduler.stats()` is zero (R4). A module whose `mount` throws leaves the host usable.

Browser (`tests/e2e/`, Playwright, every test fails on any console error, R7):

- Smoke (R1): home, About, Settings and every route open in Chromium, Firefox and WebKit.
- Accessibility (D142): axe checks for WCAG 2.0 A and AA on home, About, the Settings dialog and the Debrief Viewer (empty, and with the example flight); each module route is added as it is hooked into the registry. Known problems in another thread's files are excluded by selector with a `TODO(owner)` comment, never by turning a rule off.
- Overlap scan (R2): at 1280 × 800, 1366 × 768 and 1920 × 1080, no visible control overlaps another or is cut off, on every route. 1280 px is the smallest supported width (D183); narrower windows may scroll sideways.
- Click-through (R3): every visible button and link on every route does something: the route changes, a dialog opens, or the page changes. External links are checked by address instead of being opened.
- Module switching (R4): after visiting every route and coming back home, no module frames, timers or listeners remain.
- Storage blocked: the app opens and says settings won't be saved.
- Offline (R6): after one visit, with the network off, a reload shows the home screen and About. A new build shows the new-version bar, and Reload switches to it and removes the old copy.
- Size (R5): the build fails if the home screen needs more than 3 MB, or card videos total more than 3 MB (R15).
- Screenshots (D142, `tests/e2e/visual.spec.js`): Chromium only, on Linux, at 1440 x 900, to catch a change that moves or covers something by accident. Covers home, About, the Settings dialog, and the Debrief Viewer empty and with the example flight. The clock is frozen at noon Zulu, card videos stay still pictures (reduced motion), other sites are answered with an empty reply (satellite tiles with a plain square), fonts are pinned to Liberation Sans and Mono, and the footer's "Updated" line is masked. A picture may differ by up to 1% of its pixels (`playwright.config.js`). References are in `tests/e2e/__screenshots__/visual.spec.js/`; change them with `npx playwright test tests/e2e/visual.spec.js --update-snapshots=all` (plain `--update-snapshots` rewrites only pictures that fail, so a small change within the 1% would keep an old picture) only in a PR that means to change the look, and look at the new pictures before committing. A module adds its own screen to this file when it is hooked in.

## Sign-off checklist (R21)

`docs/checklists/shell.md`: a short list anyone can run in a browser: open the link, open About, change the time order and reload, Report a problem opens the form, install it, reload it offline.

## Out of scope for step 1

Module content, saving a debrief to a file (step 2 with `flight-data`).
