# Spec: DAD's OODA LOOP, module map

Status: **approved by Patrick on 2026-09-29**. Changes to the map go through a pull request, and each module gets its own spec before its code is written.

This is the top-level spec. It says which pieces the new app is made of, what each piece owns, which pieces depend on which, and the order we build them in. Each module then gets its own `specs/SPEC-<module-id>.md` before its code is written.

Requirement IDs (R1–R21) and decision numbers (D#) refer to the tabs in the plan doc: https://claude.ai/code/artifact/29712036-a126-43c3-ac39-57ba919ff102

## Objective

Turn the 119 MB single-file V6 webtool into a small, fast web app that anyone can open from a link (R1), where each module can be found, read and changed on its own (R8), modules no longer interfere with each other (R4), and every number the tool shows is either identical to V6 or deliberately changed and logged (R9).

The users are T-6 instructors and students debriefing sorties, and the SOF watching the weather all day. The target is a desktop or laptop browser (Patrick, 2026-09-29).

## Assumptions

1. It stays a static website: HTML, CSS and plain JavaScript ES modules, no framework, no server of our own (CLAUDE.md, R1).
2. Vite is used only as the dev server and bundler (D13). The source still runs as plain modules.
3. Hosting is GitHub Pages from this repo (D12). A service worker makes it work offline after one visit (D15, R6).
4. Unit tests use Node's built-in test runner (`node --test`), so they need no extra packages. Browser tests use Playwright, which the baseline recorder already uses.
   The plain JavaScript is type-checked by TypeScript's checker reading JSDoc comments (`npm run typecheck`, `jsconfig.json`, D142). Nothing is converted to TypeScript and nothing is emitted. Folders are added to the check one at a time as their owners clear them; since the shell and storage joined, every folder under src/ is checked.
5. Runtime libraries are few, small and approved one by one (Boundaries: ask first). Approved so far: `uplot` for time-series graphs (D137), loaded only inside the module that draws a graph, with a text readout beside each graph for screen readers. `three` for every 3D aircraft view (D138), loaded only inside 3D views by dynamic import (`ui-kit/three-aircraft.js`), never on the home screen.
6. Live weather: METAR and TAF from MET Norway with Datamask as the backup (D64), radar from ECCC with RainViewer as the backup (D65), lightning from ECCC (D66); no proxy and no keys (D69).

## Why the code is split this way

The audit (see `docs/audit/`) found that most of V6's bugs come from three structural problems, not from the flight math itself:

- **One shared global scope.** Thirteen scripts share one page. Some call functions they cannot see (the KML map never resizes when panels collapse), and others register listeners for a different module (Turn Sim listeners live in the 3D script).
- **The page is the data.** Flight math reads settings straight from input boxes, so it cannot be tested, saved or reused.
- **Copies instead of shared code.** Ship colours exist 4 times, the playback clock 4 times, the tennis-ball solver twice (with different answers), METAR/TAF parsing about 8 times (with different bugs), and the SOF 24-hour timeline 5 times.

So the map below has one shared `core` of pure, tested functions, one `ui-kit`, one playback clock and one weather parser, and each module is mounted and unmounted by the shell so only the open module runs.

## Capability map

| Module id | What it owns | Depends on | Replaces in V6 |
|---|---|---|---|
| `core` | Pure functions, no page access: units and conversions, angles and vectors, one heading convention, turn radius/rate, G and bank, ISA density and IAS estimate, aspect/HCA/closure, formation standards classifier, time formatting (Zulu/local), the wind triangle (`wind.js`, #120), and one shared T-6A performance model (D128: V-n and stall line, IAS to TAS, thrust and drag fitted from the turn charts, the point-mass step, energy height, the max glide and the NFM zoom) that the Turn Fight, Traffic and Turn Sim all use. | none | Duplicated helpers across Turn Sim, KML, 3D, EM and BFM |
| `storage` | Safe browser storage (never crashes when storage is blocked), one key naming scheme, versioned settings, named profiles, and file export/import. | `core` | Four key families; unguarded reads that can stop the whole page |
| `airfields` | Home airfield and alternates as a setting: ICAO, position, elevation, time zone, charts, weather stations. Defaults to CYMJ. | `core`, `storage` | Moose Jaw hard-coded in about 15 places, with 3 different coordinates (R16) |
| `ui-kit` | Shared look (colour tokens, cards, collapsible panels, toolbar), a control registry that binds inputs to settings, a pan/zoom canvas view, one animation scheduler that runs only the open module, and the map layers more than one module draws: the satellite tile loader (moved from the debrief for Traffic and the SOF) and, from SOF task 6, the VNC charts. | `core` | Six CSS patch layers, 348 `!important`, side rails that cover controls, a Tab key that hides panels |
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
  core/                 units.js angles.js geo.js flight-math.js standards.js time.js tennis.js wind.js
                        t6-performance.js t6a-turn-charts.js point-mass.js (the T-6A model, D128)
  storage/              store.js settings.js file.js
  airfields/            airfields.js  data/CYMJ.json …
  ui-kit/               tokens.css base.css dom.js panel.js controls.js canvas-view.js scheduler.js
                        map-tiles.js vnc.js (satellite tiles, moved from the debrief; the VNC charts follow at SOF task 6)
  flight-data/          kml.js flight.js clock.js debrief-file.js
  wx/                   metar.js taf.js limits.js sources.js
  modules/
    debrief/            index.js map2d.js view3d.js em.js tennis.js dfp.js README.md
    turn-sim/           index.js … README.md
    turn-fight/         index.js … README.md
    traffic/            index.js … README.md
    sof/                index.js … README.md
public/media/           card videos (WebM, about 2.3 MB total); charts/ the VNC chart images
original/               untouched V6 reference (never edited)
tests/
  unit/                 node --test, one file per core/wx/flight-data file
  golden/               v6-baseline.json and comparison tests (R9)
  e2e/                  Playwright: accessibility (axe), overlap scan, click-through, module switching, offline
docs/audit/             the verified V6 audit
specs/                  SPEC-<module-id>.md
```

Each module folder has a short README saying what it does and where to change common things (R8).

## Commands

```
npm install                 # once, installs Vite and Playwright
npm run dev                 # local dev server with live reload
npm test                    # unit + golden tests (node --test)
npm run typecheck           # type-check the plain JavaScript from its JSDoc comments (D142)
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
3. **Unit tests** for `core`, `wx` and `flight-data` with `node --test`. `wx` gets a table of real TAF/METAR strings, including every parser bug the audit found. Random-input property tests (`fast-check`, D142) throw thousands of speeds, banks and headings at the flight math and check rules that must always hold; they add to the golden tests and never change a number.
4. **Browser tests** (Playwright) for R2 (no control covers another at 1366×768 and 1920×1080), R3 (every visible button does something), R4 (switch modules, then check no background loops or timers), R6 (offline), R7 (any console error fails the test).
5. **Sign-off checklist** per module (R21), run by a person before release.
6. **Security alerts** (D142): Dependabot checks our npm packages and GitHub Actions weekly (`.github/dependabot.yml`), and CodeQL scans our JavaScript and workflows on every pull request (`.github/workflows/codeql.yml`; V6's `original/` and the media are skipped). Findings show under the repo's Security tab.

## Boundaries

- **Always:** keep `original/` untouched; run `npm test` before every commit; cite R# in specs, tests and issues; keep numbers identical to V6 unless a logged decision says otherwise.
- **Ask first:** any change to a flight-math or weather-limit result; adding a runtime dependency; a new outside data source; changing a default standard.
- **Never:** edit `original/`; delete or skip a failing test to get green; ship a number that disagrees with V6 without a logged decision.

## Build order

Pieces are built in dependency order, each workstream in its own thread, branch and pull requests (D14). Once the data pieces have landed, all the module screens build at once (D133).

1. **Now, side by side:**
   - App frame: `storage`, `ui-kit`, `shell`, an empty app live on GitHub Pages with CI, size budget and the browser tests (`tasks/app-frame/`).
   - Flight math: `core`, ported function by function under golden tests (`tasks/flight-math/`).
   - Weather parser: `wx` parsing and limits, no live sources yet (`tasks/wx/`).
2. **After flight math's first pull request** (units, angles, geo, time): `airfields`, `flight-data`, KML loading and the clock, pinned against V6.
3. **The debrief** (2D and 3D together), once the app frame and its data pieces have landed.
4. **Everything else at once** (Patrick, 2026-09-30, D133): `turn-sim`, `turn-fight`, `traffic` and `sof` in parallel. Their one shared dependency, core's T-6A performance model (D128), comes first. Each slice merges to main as it passes, and the four are integrated and tested together at the end. The SOF also needs an environment that can reach the weather sites.

Only the app frame edits `package.json`, `vite.config.js` and CI. Each step ends with Patrick's (or Dad's) sign-off on its checklist; step 4's modules are tested together.

## Success criteria

- R1–R21 each have a passing automated check or a completed sign-off.
- The golden comparison passes for every number V6 shows, except the changes listed in Decisions.
- No audit finding marked confirmed is still present, unless Decisions says it is kept on purpose.

## Open questions

None left from the first draft. Q18, Q24, Q25 and Q26 were answered and are listed under "Settled since the first draft". Later questions live in the plan doc's Questions tab and in each module's spec.

## Settled since the first draft

- The lead's 200 kt target is indicated airspeed. The debrief converts GPS ground speed to an estimated IAS, labelled "est. IAS" (D31).
- GPS gaps break the track line and blank the spacing readouts, and impossible points are dropped with a note in the status line (D32).
- Weather and lightning sources: D33 and D34 were reversed after browser tests (aviationweather.gov can't be read from a browser, and Blitzortung's terms are private use only). Now D64 to D69: MET Norway with Datamask as the backup, ECCC radar and lightning, Blitzortung as a link only.
- Flight-math corrections (Q18): Dad said fix them (2026-09-29): EM turn rate without the divide by 2 (D39); 3D bank from the real rate, correct wing down, G only in level turns (D40); Turn Sim toward/away (D41) and wide/tight (D42); auto timing (D43, D44). Each lands after a golden test pins V6's number (D10). The 4312 picture (Q31) keeps #2 on lead's left, as V6 draws it (D48). SPEC-core has the detail.
- Turn Sim start heading is a compass heading, 000 = north (Q24, D45).
- Traffic Sim rounded turns fly a true circular arc at the stated radius (Q25, D46).
- Recorded flight data: recorded bank is shown when a track has it, and a blank pitch column is estimated (Q26, D47).
