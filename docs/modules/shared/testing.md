# Shared parts: testing and sign-off

The whole-tool testing policy in `../../TESTING.md` applies. This file adds the module's own rules, how each of its requirements is checked, its sign-off checklist, and what happens to each of its test files.

Sources in this file point to where things were on 4 Oct 2026: `pf/` means the project files (`pf/`, private), and repo paths such as `docs/records/` or `specs/` are now under `archive/` (see `archive/README.md`).


Built on the whole-tool requirements ALL-R1 to ALL-R28 (section 3 says how each one is checked). The module requirements that use each shared piece also apply: SOF for weather and airfields, the Debrief for flight data, and every simulator for the flight math. The per-test marks are in the test register's Shared core and App frame sections.

**Today:**
- Shared core: 38 unit files (502 tests), all passing at `6283f38` apart from one skipped test, which reads a file that is only on one computer (`tests/unit/flight-data/clean.test.js:21`).
- App frame: 17 unit files (143 tests), all passing, and 14 browser files (119 runs), of which 10 fail at `6283f38` (`pf/reset/5-testing/browser-results-6283f38.md`):
  - 3 want the old heading without the version badge.
  - 3 show a real overlap on the Traffic screen.
  - 2 are the Traffic and Turn Fight screenshots, which predate those screens' changes.
  - 2 are every-button walks that timed out: Traffic again when run alone, SOF not.
- These are the soundest tests in the app. Most check rules, round trips, refusals of bad input and clean-up, and the weather and track tests use real recorded data as input.
- What needs work:
  - The T-6 model's own output is pinned in a few places.
  - Model-against-chart gaps are locked in as passing tests (`tests/unit/core/t6-performance.test.js:246-271`).
  - One computer-time budget (`tests/unit/flight-data/kml.test.js:142-147`).
  - A handful of values labelled "V6's" that only need their real source named.

## Rules on top of the whole-tool rules

- **SC1. Shared flight math is checked once, in one place (ALL-R23).** Each formula is checked against standard aerodynamics worked out in the test, or a manual page reference. Laws that hold for every input (more G at the same speed turns tighter; energy is never made) are property tests with fixed seeds (T6, Q-T10). Modules trust the shared math and don't re-test it.
- **SC2. The T-6 model names where each number comes from (ALL-R22, T7).** Each number is a manual page reference or Patrick's choice, such as the 86 kt stall. Where the model and a chart differ, the difference goes in a report for Patrick and Dad at sign-off. It is not a passing test that locks the gap in. The model's own output is never the expected answer (T3).
- **SC3. Parsers take real data and refuse bad data in words (ALL-R13).**
  - Weather reports, Dad's tracks and the browser's own parser answers are recorded once and used as input.
  - Hostile, broken or oversize input is refused with a plain message that names the file.
  - How long a refusal takes is not checked (T2).
- **SC4. Rules about time run on a fake clock (Q-T9, decided).** A report is stale after a set age, the update check runs hourly and the clock ticks each second. Each test reads the code's single constant, as in the SOF's S3.
- **SC5. The app frame's browser checks are the per-change set in section 2.** They are smoke, layout, buttons, accessibility, leaving, offline and blocked storage. They open every module, so a module change can turn them red. That failure belongs to the module, and the app-frame test is kept.
- **SC6. Words that change by design are matched by part, not whole.** The heading is checked to contain "DAD's OODA LOOP", so the version badge (ALL-R27) can't break it.
- **SC7. No screenshot comparisons (Q-T2, decided: "Drop them", Patrick 4 Oct 02:59Z).** The layout check and a person's look at sign-off cover how the screens look.
- **SC8. House rules stay a test.** One scheduler for timers, 3D loaded only when asked, storage only through the store, no raw HTML (`tests/unit/source-rules.test.js`). The rules themselves are written in the rule book.

## What the shared tests serve

| Requirement | Shared or app-frame tests that check it | When |
|---|---|---|
| ALL-R1, ALL-R3, ALL-R4 | Smoke and registry tests; the heading checked by "contains" (SC6) | Each change |
| ALL-R6, ALL-R8 | Settings menu and controls tests; the every-button walk | Each change |
| ALL-R7 | The layout check at 1280 × 800, 1366 × 768 and 1920 × 1080 with every panel open | Each change |
| ALL-R9 | The size budget in the build and its unit test | Each change |
| ALL-R11 | The accessibility scan against WCAG 2.1 AA (Q-T3, decided); keyboard checks in the host and switching tests | Each change |
| ALL-R12 | Host, scheduler, leave and switching tests: nothing keeps running after leaving | Each change |
| ALL-R13, ALL-R17 | Storage, store, file and blocked-storage tests; parsers refuse bad input in words (SC3) | Each change |
| ALL-R14, ALL-R27 | Offline, service-worker, update-bar and version tests | Each change |
| ALL-R15, ALL-R16 | Time, header-clock, clock and airfields tests on fixed dates | Each change |
| ALL-R18 | Report test | Each change |
| ALL-R19, ALL-R20, ALL-R28 | Flight-math, point-mass, property, wind and T-6 model tests (SC1, SC2) | Each change (few seeds); sign-off (many seeds and the model report) |
| ALL-R22, ALL-R23 | Each shared formula's source named in its test; the house-rules test | Each change (review) |

**At sign-off of the first module that uses them:**
- The T-6 model report (SC2), read by Patrick and Dad.
- The property tests over many seeds.
- `archive/docs/checklists/shell.md` rewritten. It still says the five modules are "Coming soon" and the heading has no version (`pf/reset/5-testing/agents/app-frame.md`, ASK-8).


## Sign-off checklist

Anyone can run it, in the real app, from the module's default start, on a laptop at 1280 wide, and send Patrick the result with the date, their name and the version shown on screen (`../../TESTING.md`, section 4). Anything not seen working is listed as unseen.

### From the ratified requirements (the hands-on column above)

- [ ] (no hands-on lines in this module's table)

> The old checklist below was written before the reset. It is refreshed against the requirements above when the module's work resumes: lines that test V6 numbers or exact times are rewritten or dropped.

### Carried over from `archive/docs/checklists/shell.md`

#### Sign-off checklist: the app frame (step 1)

Anyone can run this in about ten minutes, in any up-to-date browser on a desktop or laptop. Nothing needs installing. Tick each line. If one fails, use **Report a problem** in the app, say which line failed, and name your browser.

Link: https://lizardhands-commits.github.io/Dads-debreif/

### Opening it

- [ ] The link opens the home screen, titled "DAD's OODA LOOP". The footer says when the site was last updated, for example "Updated 30 Sep 2026, 02:01Z". If you visited before and a bar says "A new version is ready", press **Reload** first.
- [ ] There are six cards. The five modules say "Coming soon" and do nothing when clicked. The About card opens About.
- [ ] Card videos play quietly on their own, unless your computer is set to reduce motion, in which case you see still pictures. Nothing makes a sound.
- [ ] **About** in the header opens the About Dad page. **Home** brings you back.
- [ ] Typing a made-up address such as `…/Dads-debreif/#/nowhere` shows the home screen with a note that the page doesn't exist.

### The clock

- [ ] The header shows Zulu time in bold with Moose Jaw local time beside it, for example `18:00:00Z 12:00:00 CST`, and both tick every second.
- [ ] Zulu matches a trusted clock (time.gov or your phone) to the second. Local is six hours behind Zulu.

### Settings

- [ ] **Settings** opens a dialog. Choose "Local first, Zulu beside it". The header swaps straight away.
- [ ] Press **Done**, then reload the page. Local is still first.
- [ ] Under **Card videos**, choose "Show still pictures only". The home cards show still pictures instead of videos.
- [ ] Put both settings back the way you like them.

### Report a problem

- [ ] **Report a problem** opens a GitHub form in a new tab, with the page and version already filled in. You don't have to send it.

### Install and offline

- [ ] Your browser offers to install the app: an install icon in the address bar in Chrome or Edge, or File > Add to Dock in Safari. Once installed, it opens in its own window with the loop-and-T-6 icon. Firefox doesn't install web apps, so skip this line there.
- [ ] Turn the network off (Wi-Fi off, or airplane mode) and reload. The home screen and About still open, and the clock still runs. The card videos may show still pictures instead.
- [ ] Turn the network back on.

### Updates (only when a new version has just gone out)

- [ ] With the app open, a bar appears saying "A new version is ready": within the hour, or as soon as you come back to the tab. Nothing changes until you press **Reload**, and after that the "Updated" time in the footer is the new one.

### Sign-off

Browser and version: ________  Date: ________  Name: ________

All lines ticked means step 1 is done (R21).


## Test files and what happens to each

From the ratified test register (`pf/reset/5-testing/test-register.md`, Part B). The clean-up pull requests carry these out.

| File | Keep, rewrite or retire | Why (policy line or requirement) | What the rewrite checks instead | Runs |
|---|---|---|---|---|
| `tests/unit/core/angles.test.js` | Keep | ALL-R23; geometry of the heading convention. "V6's nose/tail convention" (`:63`) is a label only | | Each change |
| `tests/unit/core/flight-math.test.js` | Keep, with changes | ALL-R20, ALL-R23: bank = acos(1/n) and radius worked out in the test (`:21-29`). The six turnSimG tests (`:57-99`) belong to the Turn Sim's correction model, whose fate is TS-Q17 and the Turn Sim review; they move with it. "V6 gave 0.7 G" and "V6 showed half" (`:87`, `:107`) are labels only | | Each change |
| `tests/unit/core/geo.test.js` | Keep | ALL-R16; the nautical mile by definition | | Each change |
| `tests/unit/core/point-mass.test.js` | Keep | ALL-R20, T1: energy height held through a loop and a split S; the climbing-turn formula worked out in the test | | Each change |
| `tests/unit/core/properties.test.js` | Keep | ALL-R20, T1, T6 (fixed seeds): radius rises with speed and falls with G; available G never above the V-n or stall line. Few seeds each change, more at sign-off (Q-T10, decided). "V6's constants" (`:145-158`) are labels only; the unit factors are standard definitions | | Each change (few seeds); sign-off (many) |
| `tests/unit/core/standards.test.js` | Keep, with changes | DB-R10, TS-R24: defaults with SMM page references (`:114`, `:139`). Goes: the V6_STANDARDS pins (`:199-215`, T3) and the check that compares the defaults object with itself (circular, T8) | Each default checked against its page reference or Patrick's ruling, one line each | Each change |
| `tests/unit/core/t6-performance.test.js` | Keep, with changes | ALL-R20, ALL-R22, T10: V-n limits, the stall line, IAS to TAS and Mach worked out in the test with page references. Goes: the model's own output pinned as the answer (the fit sum 0.0227 at `:280`, the zoom's 13.04 s at `:371`, the split S's 16.6 s at `:442`; T2, T3). The known gaps against the turn chart (`:246-271`) become a report for Patrick and Dad, not a test that locks them in (T7). The 86 kt stall is named as Patrick's choice (`:41`). The 120 s guard (`:506`) is a safety stop (Q-T13, decided) | The split S loses height and the zoom gains it, as shapes; the sustained turn rate is compared with the chart and shown, with any gap reported (T7) | Each change |
| `tests/unit/core/tennis.test.js` | Keep, with changes | DB-R19 (Patrick's Q33 to Q37). The rounded strings such as "INTERCEPT 105 ft" (`:36`) are the code's own output (T3); "V6's floors" (`:70`) are relabelled to Patrick's rulings | A known setup gives the word INTERCEPT, and the miss distance matches the geometry worked out in the test | Each change |
| `tests/unit/core/time.test.js` | Keep | ALL-R15: fixed dates either side of a clock change; Moose Jaw UTC-6 all year | | Each change |
| `tests/unit/core/wind.test.js` | Keep | ALL-R19, T1: the wind triangle worked out in the test; calm gives no crab | | Each change |
| `tests/unit/wx/alternates.test.js` | Keep, with changes | SOF alternates. "Bad minima fall back to V6's 600/2" (`:219`) follows SOF-R12, where an alternate with no usable minima reads amber "Incomplete" (as in `partb/sof.md`, cards row) | An alternate with unusable minima reads "Incomplete", never "meets" | Each change |
| `tests/unit/wx/conditions.test.js` | Keep | SOF weather reading; unit conversions are standard | | Each change |
| `tests/unit/wx/limits.test.js` | Keep, with changes | SOF S4 (limits are settings with page references). "Match V6 (0.24 and 6.01)" and "V6 thresholds" (`:76`, `:154`) get their real source: a page reference or Patrick's ruling | | Each change |
| `tests/unit/wx/metar.test.js` | Keep | SOF S1: real-format reports as input | | Each change |
| `tests/unit/wx/review-findings.test.js` | Keep | SOF S2: unknown is never good; each case once made a bad forecast read "meets" | | Each change |
| `tests/unit/wx/sources.test.js` | Keep | SOF S1, S3: recorded real replies as input; stale after 75 minutes and refresh every 5 are rules on a fake clock (Q-T9, decided) | | Each change |
| `tests/unit/wx/spans.test.js` | Keep | SOF highlighting; slices of the raw report | | Each change |
| `tests/unit/wx/taf.test.js` | Keep | SOF forecast timeline; fixed dates | | Each change |
| `tests/unit/wx/verification-findings.test.js` | Keep | SOF S2: implausible periods are a problem, never "meets"; unusable minima give "Incomplete" | | Each change |
| `tests/unit/flight-data/clean.test.js` | Keep, with changes | DB-R4, Debrief D1. The dropped-fix counts and fastest speed on Dad's tracks (`:22-28`) are the code's own output (T3). The skipped test reads a file outside the repo (`:21`), so it runs on no machine but one and can't fail anywhere else (T8): it goes | Whole-flight invariants on Dad's tracks: no kept fix implies more than 450 kt or a jump; the limits are named as the Debrief's own cut-offs (D5) | Each change |
| `tests/unit/flight-data/clock.test.js` | Keep | DB-R12: playback arithmetic on numbers fed in, not a flight time. "V6's" speed list (`:17-18`) is a label only | | Each change |
| `tests/unit/flight-data/debrief-file.test.js` | Keep | DB-R17, DB-R25, ALL-R17: round trip; damaged or hostile files refused in one plain message | | Each change |
| `tests/unit/flight-data/examples.test.js` | Keep | DB-R1: the example flight is Dad's four real tracks, fetched only when asked | | Each change |
| `tests/unit/flight-data/flight.test.js` | Keep, with changes | DB-R6, DB-R7. The bank minimum −141.08 on a real track (`:25`) is the code's own output (T3). "Never above 7 G estimated" on the example flight is DB-R7's invariant and stays | The recorded bank is read the short way round, checked on a hand-made track (Debrief D2) | Each change |
| `tests/unit/flight-data/kml.test.js` | Keep, with changes | DB-R25, ALL-R13: hostile and broken files refused, error names file and line; the browser-recorded parser table is real recorded data (T3). Goes: the 5 s computer-time budget on four refusals (`:142-147`, T2) | Each hostile file is refused with its message; how long it takes is a sign-off look | Each change |
| `tests/unit/flight-data/load.test.js` | Keep, with changes | DB-R1, DB-R2: all or nothing, the bad file named. The dropped counts (`:25-26`) duplicate `clean.test.js` and go with them | | Each change |
| `tests/unit/airfields/airfields.test.js` | Keep, with changes | ALL-R16: default CYMJ, alternates, corrupt saves fall back. The default alternates at "600-2, not checked" (`:37-47`) follow SOF-R12: the usual alternates come with their approaches and published landing minima filled in, with a "checked on" date | The usual alternates open with their approaches and minima filled in and dated; one with nothing filled in reads "Incomplete" | Each change |
| `tests/unit/airfields/catalog.test.js` | Keep | ALL-R16: the built-in list and great-circle distances worked out in the test. "V6's 15 airfields" (`:17`) is a label only | | Each change |
| `tests/unit/airfields/format.test.js` | Keep | ALL-R10: visibility and minima wording | | Each change |
| `tests/unit/airfields/minima.test.js` | Keep, with changes | SOF S4: the approach-type rules are named by title only; each gets its page reference. "V6's single 600-2, marked not checked" (`:23`) follows SOF-R12 ("Incomplete") | | Each change |
| `tests/unit/storage/file.test.js` | Keep | ALL-R17, ALL-R13: safe names; an oversize file is refused before it is read | | Each change |
| `tests/unit/storage/settings.test.js` | Keep | ALL-R6, ALL-R17: defaults, reset, bad values ignored, migration | | Each change |
| `tests/unit/storage/standards.test.js` | Keep, with changes | DB-R10, TS-R24. The default check compares storage with the code's own defaults object (`:22`, circular); it checks the page-referenced defaults instead, as in `core/standards.test.js`. The version 1 fallback (`:157`) stays as migration | | Each change |
| `tests/unit/storage/store.test.js` | Keep | ALL-R17: blocked or full storage never throws and keeps values for the visit | | Each change |
| `tests/unit/relay/traffic.test.js` | Retire with the feature | SOF-R17: the live-traffic relay went to the future list (SOF-Q9). Leaves when thread 7 archives the relay code, with the other relay tests listed in the SOF section; keeps running until then | | Each change, until archived |
| `tests/unit/tools/check-size.test.js` | Keep | ALL-R9: the home-screen and card-video budget (a size, not a time) | | Each change |
| `tests/unit/tools/service-worker.test.js` | Keep | ALL-R14, ALL-R27: what the offline copy keeps; the build id changes only when a kept file changes | | Each change |
| `tests/unit/source-rules.test.js` | Keep | House rules: one scheduler for timers and frames (ALL-R12), 3D loaded only when asked (ALL-R9), storage only through the store (ALL-R17), no raw HTML (security). The rules themselves move to the rule book; the test stays | | Each change |

| File | Keep, rewrite or retire | Why (policy line or requirement) | What the rewrite checks instead | Runs |
|---|---|---|---|---|
| `tests/unit/shell/examples.test.js` | Keep | DB-R1, ALL-R14: the example files the app serves are byte for byte Dad's recorded tracks. That checks the file isn't damaged; it is real recorded data, not a V6 number (T3) | | Each change |
| `tests/unit/shell/header.test.js` | Keep | ALL-R15: Zulu and local in the chosen order, worked out from the time zone; ticks on a fake clock; nothing left running (ALL-R12) | | Each change |
| `tests/unit/shell/home.test.js` | Keep | ALL-R4: prototype and coming-soon badges | | Each change |
| `tests/unit/shell/host.test.js` | Keep | ALL-R12: leaving or a failed module removes every frame, timer, listener and subscription; shortcuts ignored while typing (ALL-R11) | | Each change |
| `tests/unit/shell/registry.test.js` | Keep | ALL-R4: exactly the five modules; PT-PT Sim and the Briefing Board absent until specced | | Each change |
| `tests/unit/shell/report.test.js` | Keep | ALL-R18: the form opens with page and version filled in, and the field ids exist in the repo's form. Who can use it while the repo is private is Q-ALL-1 | | Each change |
| `tests/unit/shell/router.test.js` | Keep | ALL-R12, ALL-R17: addresses, and the "leave?" question keeps or leaves the page | | Each change |
| `tests/unit/shell/update-bar.test.js` | Keep | ALL-R27: a new version offers Reload and never reloads by itself. The hourly and five-minute checks are rules on a fake clock (Q-T9, decided) | | Each change |
| `tests/unit/shell/version.test.js` | Keep | ALL-R27: the build date in Zulu; "Development copy" when unknown | | Each change |
| `tests/unit/ui-kit/canvas-view.test.js` | Keep | Map pan and zoom geometry worked out in the test | | Each change |
| `tests/unit/ui-kit/controls.test.js` | Keep | ALL-R6, ALL-R8, ALL-R10: bad numbers refused in words, greyed states, guarded actions | | Each change |
| `tests/unit/ui-kit/ct156-model.test.js` | Keep, with changes | ALL-R12 (memory freed). The model's span of 1.32 units (`:65`) has no source; it gets one (the published Harvard II span, scaled), or the check becomes length and span in the right ratio (T3) | | Each change |
| `tests/unit/ui-kit/dom.test.js` | Keep | Security: text is never inserted as HTML | | Each change |
| `tests/unit/ui-kit/map-tiles.test.js` | Keep, with changes | ALL-R14: tiles cover the view; retries stop on dispose. The tile zoom is checked against the same function that picks it ("V6's zoom", `:20-22`; circular, T8) | The tiles at the picked zoom cover the view's corners and are no finer than the screen needs, worked out in the test | Each change |
| `tests/unit/ui-kit/scheduler.test.js` | Keep | ALL-R12: one frame loop, stops when idle, dispose cancels everything; fake clock | | Each change |
| `tests/unit/ui-kit/settings-menu.test.js` | Keep | ALL-R6: starts closed, one Reset button, Escape closes and returns focus (ALL-R11) | | Each change |
| `tests/unit/ui-kit/three-aircraft.test.js` | Keep | DB-R3, DB-R15: the 3D camera puts every point where the 2D view does (two separate pieces of code that must agree, so it can fail, T8); meshes freed (ALL-R12). "V6's first open" (`:26`) is a label only | | Each change |
| `tests/e2e/offline.spec.js` | Keep, with changes | ALL-R14, ALL-R27. Fails at `6283f38`: the heading check wants exactly "DAD's OODA LOOP" (`:47`) and the screen now reads "DAD's OODA LOOP V2.5". It checks "contains" instead (section 3, ALL-R3). The two byte counts (`:82`, `:98`) check that shipped files aren't damaged and stay | | Each change |
| `tests/e2e/storage.spec.js` | Keep | ALL-R17: with storage blocked the app opens, says settings won't be saved and keeps working | | Each change |
| `tests/e2e/a11y.spec.js` | Keep, with changes | ALL-R11: the accessibility scan on every screen. It moves from WCAG 2.0 to 2.1 AA (Q-T3, decided; the rule tags are set in `tests/e2e/fixtures.js:63`) | | Each change |
| `tests/e2e/media.spec.js` | Keep, with changes | ALL-R3, ALL-R9: home is 3 MB or less (a size); only visible cards play; reduced motion loads no video. The fixed half-second wait (`:43`) becomes a wait for what is on screen (section 5) | | Each change |
| `tests/e2e/ui-kit.spec.js` | Keep | ALL-R6, ALL-R8, ALL-R12: controls, the settings menu, map drag and zoom, and the 3D model giving back its graphics memory | | Each change |
| `tests/e2e/layout.spec.js` | Keep | ALL-R7: nothing overlaps or is cut off at 1280 × 800, 1366 × 768 and 1920 × 1080 on every screen. Fails at `6283f38` on Traffic at all three sizes: an unlabelled box overlaps the "Traffic settings" button. The test is doing its job; the fault is in Traffic (inferred from the error text, not looked at on screen) | | Each change |
| `tests/e2e/smoke.spec.js` | Keep, with changes | ALL-R1, ALL-R3, ALL-R4, ALL-R18. Two fail at `6283f38` on the same exact-heading check (`:18`, `:41`): it checks "contains" instead | | Each change |
| `tests/e2e/file.spec.js` | Keep | ALL-R17, ALL-R13: safe names; an oversize file is refused in plain words | | Each change |
| `tests/e2e/airfields.spec.js` | Keep, with changes | ALL-R16. "119 NM" to CYXE (`:42`) and CYMJ's position and 1,892 ft elevation (`:133`) are typed in with no source: the distance is worked out in the test, the elevation gets its publication reference (T3). The default alternates' minima follow SOF-R12 | | Each change |
| `tests/e2e/buttons.spec.js` | Keep | ALL-R8: every control does something with no error. At `6283f38` the Traffic run timed out twice: the "+ Spawn PFL" button never became steady and clickable. Whether the button or the test is at fault is unclear. The SOF run timed out once and passed alone, so the flaky-test rule applies (Q-T4, decided) | | Each change |
| `archive/tests/e2e/visual.spec.js` and its nine reference pictures (`archive/tests/e2e/__screenshots__/visual.spec.js`) | Retire | Q-T2, decided: screenshot comparisons are dropped (Patrick, 4 Oct 02:59Z); the layout check and a person's look cover the screens. Two failed at `6283f38`: Traffic (60,024 pixels, 5 %) and Turn Fight (38,606 pixels, 3 %) differ from pictures last drawn on 30 Sep, before those screens changed (stale reference, inferred) | | |
| `tests/e2e/leave.spec.js` | Keep | ALL-R12, ALL-R17: the "leave?" question in a real browser, history kept | | Each change |
| `tests/e2e/clock.spec.js` | Keep | ALL-R15, ALL-R16: fixed browser clock; the clock follows the home field | | Each change |
| `tests/e2e/switching.spec.js` | Keep | ALL-R12, ALL-R11: after visiting every screen nothing keeps running; Tab and the skip link work | | Each change |
