# Spec: DAD's OODA LOOP, module map

Status: **approved by Patrick on 2026-09-29**. Changes to the map go through a pull request, and each module gets its own spec before its code is written.

This is the top-level spec. It says which pieces the new app is made of, what each piece owns, which pieces depend on which, and the order we build them in. Each module then gets its own `specs/SPEC-<module-id>.md` before its code is written.

Requirement IDs (R1–R21) and decision numbers (D1–D34) refer to the tabs in the plan doc: https://claude.ai/code/artifact/29712036-a126-43c3-ac39-57ba919ff102

## Objective

Turn the 119 MB single-file V6 webtool into a small, fast web app that anyone can open from a link (R1), where each module can be found, read and changed on its own (R8), modules no longer interfere with each other (R4), and every number the tool shows is either identical to V6 or deliberately changed and logged (R9).

The users are T-6 instructors and students debriefing sorties, and the SOF watching the weather all day. The target is a desktop or laptop browser (Patrick, 2026-09-29).

## Assumptions

1. It stays a static website: HTML, CSS and plain JavaScript ES modules, no framework, no server of our own (CLAUDE.md, R1).
2. Vite is used only as the dev server and bundler (D13). The source still runs as plain modules.
3. Hosting is GitHub Pages from this repo (D12). A service worker makes it work offline after one visit (D15, R6).
4. Unit tests use Node's built-in test runner (`node --test`), so they need no extra packages. Browser tests use Playwright, which the baseline recorder already uses.
5. Live weather comes from an official source first (aviationweather.gov) with a backup, both tested from a real browser (D33).

## Why the code is split this way

The audit (see `docs/audit/`) found that most of V6's bugs come from three structural problems, not from the flight math itself:

- **One shared global scope.** Thirteen scripts share one page. Some call functions they cannot see (the KML map never resizes when panels collapse), and others register listeners for a different module (Turn Sim listeners live in the 3D script).
- **The page is the data.** Flight math reads settings straight from input boxes, so it cannot be tested, saved or reused.
- **Copies instead of shared code.** Ship colours exist 4 times, the playback clock 4 times, the tennis-ball solver twice (with different answers), METAR/TAF parsing about 8 times (with different bugs), and the SOF 24-hour timeline 5 times.

So the map below has one shared `core` of pure, tested functions, one `ui-kit`, one playback clock and one weather parser, and each module is mounted and unmounted by the shell so only the open module runs.

## Capability map

| Module id | What it owns | Depends on | Replaces in V6 |
|---|---|---|---|
| `core` | Pure functions, no page access: units and conversions, angles and vectors, one heading convention, turn radius/rate, G and bank, ISA density and IAS estimate, aspect/HCA/closure, formation standards classifier, time formatting (Zulu/local). | none | Duplicated helpers across Turn Sim, KML, 3D, EM and BFM |
| `storage` | Safe browser storage (never crashes when storage is blocked), one key naming scheme, versioned settings, named profiles, and file export/import. | `core` | Four key families; unguarded reads that can stop the whole page |
| `airfields` | Home airfield and alternates as a setting: ICAO, position, elevation, time zone, charts, weather stations. Defaults to CYMJ. | `core`, `storage` | Moose Jaw hard-coded in about 15 places, with 3 different coordinates (R16) |
| `ui-kit` | Shared look (colour tokens, cards, collapsible panels, toolbar), a control registry that binds inputs to settings, a pan/zoom canvas view, and one animation scheduler that runs only the open module. | `core` | Six CSS patch layers, 348 `!important`, side rails that cover controls, a Tab key that hides panels |
| `shell` | Home screen and module cards, routing (`#/debrief`, `#/turn-sim` …), module mount/unmount, the one Zulu/local switch, settings, About, Report a problem. | `ui-kit`, `storage`, `airfields`, `core` | Splash, launcher, tab bar, About, two hidden splash buttons, debug badges |
| `flight-data` | ForeFlight KML parsing (with data-quality checks), projection, interpolation, derived speed/G/pitch, the Flight and Debrief data model, the playback clock, and the save/open debrief file. | `core`, `storage`, `airfields` | KML parsing, `DADS3DAPI`, four separate clocks, one global DFP list (R11, R17) |
| `debrief` | The debrief viewer: 2D map and 3D view of the same flight (switch, not a separate tab), spacing and standards readouts, EM diagram, one tennis-ball solver, DFPs, map layers and charts, CSV export. | `flight-data`, `ui-kit`, `airfields`, `core` | KML viewer + 3D viewer + EM card (R11, R12, R17, R18) |
| `turn-sim` | Formation Turn Sim: formation presets, turn planning, cues, integrator, readouts, profiles. | `core`, `ui-kit`, `storage` | Turn Sim tab |
| `turn-fight` | BFM Turn Fight: 1-circle, 2-circle and vertical fights. | `core`, `ui-kit` | BFM tab |
| `traffic` | Traffic Pattern Sim: left side defines patterns, right side spawns aircraft that fly them; default patterns plus locally saved ones. | `core`, `ui-kit`, `storage`, `airfields` | Traffic iframe (R14) |
| `wx` | Weather data: METAR/TAF parsing (TEMPO, BECMG, PROB, FM, M1/4SM, CB/TCU), limit checks, alternate rules, data age, source adapters. No page access, heavily tested. | `core`, `airfields` | About 8 copies of METAR/TAF parsing in the SOF iframe |
| `sof` | SOF Dashboard: clocks and DTG, airfield weather cards, the wave plan and 24-hour timeline, alternate-required calls, radar, live traffic and lightning views, cautions that can be acknowledged, stale-data warnings, big-screen layout. Renders from one weather store instead of reading its own page. | `wx`, `ui-kit`, `storage`, `airfields`, `core` | SOF iframe (35 script blocks, about 58% of its code never runs) and the orphaned second SOF in the main page (R13) |

Dependencies point one way. Modules never import each other; they share data only through `core` types, `storage` and `flight-data`.

### Module lifecycle (the fix for R4)

Every module exports the same shape, and the shell guarantees only one is mounted:

```js
// src/modules/turn-sim/index.js
export default {
  id: 'turn-sim',
  title: 'Formation Turn Sim',
  mount(root, app) {
    // build the page inside root, subscribe to app.scheduler and app.settings
    return () => {
      // unmount: stop loops and timers, remove listeners and keyboard shortcuts
    };
  },
};
```

## Project structure

```
index.html              home screen
src/
  app.js                entry: starts the shell
  shell/                router.js registry.js host.js home.js about.js header.js …
  core/                 units.js angles.js geo.js flight-math.js standards.js time.js
  storage/              store.js settings.js file.js
  airfields/            airfields.js  data/CYMJ.json …
  ui-kit/               tokens.css panel.js controls.js canvas-view.js scheduler.js
  flight-data/          kml.js flight.js clock.js debrief-file.js
  wx/                   metar.js taf.js limits.js sources.js
  modules/
    debrief/            index.js map2d.js view3d.js em.js tennis.js dfp.js README.md
    turn-sim/           index.js … README.md
    turn-fight/         index.js … README.md
    traffic/            index.js … README.md
    sof/                index.js … README.md
public/media/           card videos (WebM, about 2.3 MB total), chart images
original/               untouched V6 reference (never edited)
tests/
  unit/                 node --test, one file per core/wx/flight-data file
  golden/               v6-baseline.json and comparison tests (R9)
  e2e/                  Playwright: overlap scan, click-through, module switching, offline
docs/audit/             the verified V6 audit
specs/                  SPEC-<module-id>.md
```

Each module folder has a short README saying what it does and where to change common things (R8).

## Commands

```
npm install                 # once, installs Vite and Playwright
npm run dev                 # local dev server with live reload
npm test                    # unit + golden tests (node --test)
npm run test:e2e            # Playwright browser tests
npm run build               # static site in dist/, fails if the size budget is exceeded (R5, R15)
python3 tools/rebuild_original.py /tmp/v6.html   # exact V6 for side-by-side checks
```

## Code style

Plain, readable modules. Pure functions take plain values and return plain values; nothing in `core` or `wx` touches the page. Units are in the name.

```js
// src/core/flight-math.js
import { G_FTPS2, KT_TO_FTPS } from './units.js';

/** Level-turn radius in feet for a true airspeed in knots and a load factor in G. */
export function turnRadiusFt(tasKt, loadG) {
  const v = tasKt * KT_TO_FTPS;
  return (v * v) / (G_FTPS2 * Math.sqrt(loadG * loadG - 1));
}
```

- One heading convention inside the code, written down in `core/angles.js` and pinned by tests. The UI shows compass headings.
- Numbers shown to the user carry their unit and say whether they are ground speed or airspeed, horizontal or 3D range.
- No `!important`, no inline styles for layout, no `setInterval` outside `ui-kit/scheduler.js`.

## Testing strategy

1. **Pin before moving (CLAUDE.md).** Every piece of flight math is first extracted and pinned against V6's answers (`tests/golden/v6-baseline.json` plus new characterisation cases), then moved. The golden test must pass before and after.
2. **Deliberate changes are logged.** Where the audit shows V6 is wrong (for example, the EM turn rate is half the real value), the fix is a separate change, approved by Dad or Patrick, logged in Decisions, and the golden value is updated in the same change.
3. **Unit tests** for `core`, `wx` and `flight-data` with `node --test`. `wx` gets a table of real TAF/METAR strings, including every parser bug the audit found.
4. **Browser tests** (Playwright) for R2 (no control covers another at 1366×768 and 1920×1080), R3 (every visible button does something), R4 (switch modules, then check no background loops or timers), R6 (offline), R7 (any console error fails the test).
5. **Sign-off checklist** per module (R21), run by a person before release.

## Boundaries

- **Always:** keep `original/` untouched; run `npm test` before every commit; cite R# in specs, tests and issues; keep numbers identical to V6 unless a logged decision says otherwise.
- **Ask first:** any change to a flight-math or weather-limit result; adding a runtime dependency; a new outside data source; changing a default standard.
- **Never:** edit `original/`; delete or skip a failing test to get green; ship a number that disagrees with V6 without a logged decision.

## Build order

Pieces are built in dependency order, up to three workstreams at once, each in its own thread, branch and pull request (D14).

1. **Now, side by side:**
   - App frame: `storage`, `ui-kit`, `shell`, an empty app live on GitHub Pages with CI, size budget and the browser tests (`tasks/app-frame/`).
   - Flight math: `core`, ported function by function under golden tests (`tasks/flight-math/`).
   - Weather parser: `wx` parsing and limits, no live sources yet (`tasks/wx/`).
2. **After flight math's first pull request** (units, angles, geo, time): `airfields`, `flight-data`, KML loading and the clock, pinned against V6.
3. **Module screens**, two or three at a time, each once the app frame and its data pieces have landed: `debrief` (2D and 3D together), `turn-sim`, `turn-fight`, `traffic`.
4. **`sof` last**, after `wx` and once an environment that can reach the weather sites is set up.

Only the app frame edits `package.json`, `vite.config.js` and CI. Each step ends with Patrick's (or Dad's) sign-off on that module's checklist.

## Success criteria

- R1–R21 each have a passing automated check or a completed sign-off.
- The golden comparison passes for every number V6 shows, except the changes listed in Decisions.
- No audit finding marked confirmed is still present, unless Decisions says it is kept on purpose.

## Open questions

These need Dad and are also in the Questions tab (Q18, Q24, Q25 and Q26). None of them blocks step 1 of the build order; each is needed only before the module it touches. V6 is not in use (Patrick, 2026-09-29), so no V6 fix jumps the queue and the SOF stays last.

1. Flight-math corrections: the audit found places where V6's numbers are wrong (EM turn rate halved; 3D bank halved and mirrored; Turn Sim "toward/away" inverted and "wide/tight" inverted for aircraft on lead's right; auto timing holding wingmen for #1) and two that depend on Dad's intent (whether 4312/2134 are drawn mirrored; the auto-timing delay rule). Fix them, or keep V6 behaviour? The plan doc's Flight math check tab has the reasoning and a V6 test run for each.
2. Turn Sim start heading (Q24): V6 treats it as a math angle (0 = east, 90 = north). Make it a compass heading (000 = north, 090 = east), as the Traffic Sim already does?
3. Traffic Sim rounded turns (Q25): V6 joins each corner with a Bézier curve, so a 90° corner is flown at 0.71 of the stated radius and a 135° corner at 0.38. Fly a true circular arc at the stated radius?
4. Recorded flight data (Q26): V6's debrief reads a track's recorded G and pitch but never its recorded bank, and reads a blank pitch column as 0°. Show recorded bank when a track has it, and estimate pitch when the column is blank?

## Settled since the first draft

- The lead's 200 kt target is indicated airspeed. The debrief converts GPS ground speed to an estimated IAS, labelled "est. IAS" (D31).
- GPS gaps break the track line and blank the spacing readouts, and impossible points are dropped with a note in the status line (D32).
- Weather: an official source first (aviationweather.gov) with a backup, both tested from a real browser (D33).
- Lightning: Blitzortung live strikes (D34). Its terms of use get checked when the SOF is built.
