# Core refactor: audit and handover at V2.350

Written by the Fable review thread, 11 Oct 2026, on Patrick's order (23:05Z "We need a one-time-fable-refractor audit on traffic sim", 23:06Z "and CORE"). It is the companion of `docs/modules/traffic/REFACTOR_HANDOVER_V2.350.md` and uses the same shape: one audit, then steps, one pull request per step, each a pure move proved by the same numbers before and after. Core is shared by every module, so this file comes first: its steps 1 and 2 run before the Traffic plan's step 2, which moves Traffic formulas into core.

This file is the whole brief for the thread that builds it. Read `AGENTS.md`, this folder's `README.md`, `flight-math.md` and `plan.md` Step 2 first. Search for existing flight math before writing new. Patrick reads this plan before any build thread starts.

## 1. What core is, and what the audit found

`src/core/` is 15 files and 2,297 lines of plain functions: no state, no screen, no fetches (the terrain files decode tiles a caller has fetched). It is tested by `tests/unit/core/` (12 files, 1,945 lines, light, with fixed seeds for the random-input properties). Nothing in core imports from outside core, and nothing in `src/ui-kit/` or `src/core/` imports a module. By kind:

| Kind | Files | Read by |
|---|---|---|
| Pure maths | `angles.js`, `units.js`, `geo.js`, `wind.js`, `flight-math.js`, `point-mass.js`, `closest-approach.js` | every module; `src/flight-data/`, `src/airfields/`, `src/shell/`, `src/wx/` |
| The aircraft's numbers | `t6-performance.js`, `t6a-turn-charts.js` | Traffic, Formation, Turn Fight, Debrief, `src/flight-data/gap-fill.js` |
| Judgement two modules share | `standards.js`, `tennis.js`, `canopy.js` | Debrief and `src/storage/standards.js`; Debrief; Formation |
| Pictures and clock | `terrain-tiles.js`, `terrain-grid.js`, `time.js` | SOF, Debrief, Traffic, `src/ui-kit/`, `src/shell/header.js` |

Who reads what, by import lines: Formation 108 (units, angles, flight-math, t6-performance, point-mass, canopy), Traffic 72, Turn Fight 63, Debrief 41, SOF 31. The Traffic plan's step 2 adds about ten more.

### 1.1 Findings

- **One break of the "modules never import each other" rule.** `src/modules/sof/map.js` imports three Debrief files: `../debrief/map2d/vnc.js` (the VNC chart layer), `../debrief/map2d/overlays.js` (`projectRoute`, `drawRoute`) and `../debrief/data/routes.js`. Everything else respects the rule. Dad owns both modules.
- **The standard atmosphere is written three times inside core** and a fourth time in Traffic: `flight-math.js` `isaDensityRatio` (line 131), `t6-performance.js` `isaPressureRatio` and `speedOfSoundKt` (lines 95 to 105), and `src/modules/traffic/weather.js` `isaTempK` with today's temperature. `isaDensityRatio` sits in the turn file, not with the atmosphere. `wind.js` keeps a private `wrap360` that is `angles.js` `wrapDeg360`.
- **Two zoom models.** Core's `flyZoomT6A` and `zoomT6A` are read only by tests; Traffic's PFL flies its own zoom (`pfl.js` `zoomPitchStep`, `flyZoomPlan`). One aircraft, two zooms.
- **Module copies of core formulas.** The level-turn bank from G (`Math.acos(1 / g)`) is written in `turn-fight/readouts.js:113`, `turn-fight/view3d.js:137`, `debrief/view3d/scene.js:124` and five places in Traffic, where `bankDegFromG` exists. Feet per nautical mile has three values in the repo: `units.js` 6076.12, `sof/map-view.js:11` and `turn-sim/view.js:18` 6076.11549, and the bare 6076 in nine Traffic lines. `debrief/weather/winds.js:27` has its own metres-to-feet; `src/flight-data/gap-fill.js:75`, `src/airfields/distance.js:5`, `traffic/pfl.js:35` and `traffic/ejection.js:26` each define their own radians-per-degree beside `angles.js` `DEG`.
- **`units.js` keeps a rounding it says it should not.** `FTPS_TO_KT` is 0.592484, not 1 / `KT_TO_FTPS` (0.5924838), "until a logged decision says otherwise". No decision was logged.
- **V6 as the pin.** Seventy-two lines in core say "exactly as V6 uses them", "ported unchanged", "pinned by the golden tests" or "line numbers refer to original/shell.html" (`angles.js`, `units.js`, `geo.js`, `time.js`, `flight-math.js`, `standards.js`, `tennis.js`, `t6a-turn-charts.js`). There is no `tests/golden/` folder. Four `standards.js` functions default their standards argument to `V6_STANDARDS`; the Debrief passes its own standards every time, so the default is never used by the app, but the rule book says V6's numbers are never answers.
- **Exports nothing reads.** Three are dead (`rollLimitsT6A`, `flapAoADeltaDeg`, and `GEAR_DRAG_FACTOR` as an export; it is used inside its file). Twenty-one are read only by tests, among them one-module logic that no module calls any more: `flight-math.js` `turnSimG` (the Formation Sim's old G rule), `standards.js` `classifyTurnSimPosition`, `formationAxes` and `leadTargetKt`, `canopy.js` `canopySightVector`, `canopyLosDot` and `checkDoctrinalInvariants`, `closest-approach.js` `firstEntry`, `angles.js` `clockToRelativeDeg` and `compassDegToHeadingRad`, `t6-performance.js` `T6A_ROLL`, `speedOfSoundKt`, `machToKiasKt`, `pitchDegFromClimb`, `T6A_GLIDE`, `glideSinkFpm` and the zoom trio, and the five point arrays in `t6a-turn-charts.js` (only `T6A_FIT` is read).
- **Docs.** `flight-math.md` lists `standards.js` in one line and has no rows for `tennis.js`, `canopy.js`, `time.js` or Traffic's temperature-aware airspeed pair. `spec.md` is still the archived SPEC-core text with "pinned by" wording and the "fifth PR" headings. `plan.md` Step 2 holds the one-import-point ("barrel") question Patrick flagged for review; section 4, step 5 below gives Fable's answer.
- **Sound.** The dependency direction inside core is a tree with no cycles (`t6-performance` reads `flight-math`, `t6a-turn-charts` and `point-mass`; `terrain-grid` reads `geo` and `terrain-tiles`; everything reads `units` and `angles`). The tests check manual values, standard aerodynamics and always-true properties, as the rule book asks. No module-level mutable state anywhere in core.

## 2. Rules for the build

- Model Opus, thinking medium. The same fresh thread that builds the Traffic plan, in this order: core steps 1 and 2, then Traffic steps 1 to 5, then core steps 3 to 5 as the module threads allow. One pull request per step. The thread does the work itself; no agent swarm.
- One writer per file: this thread owns `src/core/` and `docs/modules/shared/` for the duration. Core is shared, so the coordinator tells the Formation, Turn Fight, Debrief and SOF threads (and Dad) before step 1 starts, and any addition another thread needs in core goes through this thread while it runs. Steps 1 and 2 rename no file another module imports; the only new file is `atmosphere.js`.
- Never change flight physics (turn, energy, G, stall or stick-shaker formulas), any number in `T6A_LIMITS`, `T6A_FIT`, `T6A_ROLL`, `T6A_G_ONSET`, `T6A_PITCH`, `T6A_GLIDE`, `T6A_MANOEUVRE`, `LANE`, `DEFAULT_STANDARDS` or `units.js`, or any ruling in a decisions file. A formula that moves must give the same number to the last digit.
- Pure moves only, in every step: when a number differs, stop, find why, and either show it is a float-order change in the last digit with the rows listed, or back the change out. Two failed fixes stop the step until Patrick answers.
- The Formation thread's files under `src/modules/turn-sim/live/` are not touched: this plan reaches Formation only through core's exports, which keep their names and values, and through `turn-sim/view.js` in step 3, which the Formation thread does itself.
- Version label bumps with every merge that reaches the app (`src/modules/traffic/version.js`, the home-screen number). Merge titles "V2.3xx Core: ..." in plain words. Docs-only pull requests do not bump.
- Testing lines (copied in full from `AGENTS.md`):
  - Tests check what a pilot would recognise: things that are always true, and end results (it landed on the runway, it stayed above the deck).
  - No tight time gates. A generous, realistic limit is fine, with its reason beside it (a PFL lands within 5 minutes).
  - Expected values come from a manual page, standard aerodynamics, Patrick's ruling or real recorded data, never from V6 or from the code's own output.
  - Margins use the shared table by default (±10 kt, ±100 ft, ±5°, ±0.5 G); a check may use another margin if it says why. Margins are not requirements and never become rules inside the flight code.
  - Never change the flight physics (turn, energy, G, stall or stick-shaker formulas) to make a test pass. If a flight test disagrees, check the test against the manuals and Patrick's practice; if the physics still looks wrong, ask Patrick. A test that fails twice stops the work until Patrick answers.
  - Published limits (the G limit, the hard deck, the orders) are flagged on screen, never walls; a test never expects the aircraft to be held at one. Physical limits always hold.
  - Never skip, disable or delete a failing test just to get green. A test is only retired or rewritten as `docs/TESTING.md` says, with Patrick's yes.
  - Keep it light: no mutation, stress or long runs.
  - Each PR adds at most one test, the one that best shows it flies right. Skills that say otherwise are overridden.
  - Checks: don't run tests locally before a pull request. CI on the pull request is the one check. Patrick may merge before CI finishes. If main then goes red, fix it next.
  - Every status says what is untested or unseen.
- Report at the end of each step: what moved, the number comparison result (identical, or the rows that differ and why), what is untested or unseen, what was unsure.

## 3. The proof: the same numbers before and after

Core is a library, so its proof is a table of numbers, not a flight.

- Runner: `core-trace.mjs`, in the project files beside the Traffic driver (`traffic-review-package-v2350/`), not committed. It imports every export of every core file and prints each function's result, to full precision, over a fixed grid of inputs (speeds 60 to 320 KIAS by 10, heights 0 to 31,000 ft by 1,000, G 1 to 7 by 0.5, bank −90° to 90° by 5°, the winds 0 to 40 kt from eight directions, the four glide configurations, a dozen aircraft pairs for closest approach and the standards). About 50,000 rows. The thread records the baseline on main before step 1 and diffs after every step.
- "Identical" means every row matches. A pure move must reproduce them.
- The module traces are the second proof: the Traffic driver of the Traffic plan (standard, hot and cold day) after core step 2, and Fable's Formation set on a renamed copy after any core merge, as the standing order already runs it.
- The core unit tests stay as they are and stay green; no new tests for pure-move steps (a trace-equality test would be a test of the code's own output).

## 4. The steps, one pull request each

### Step 1. Dead code, V6 pins out of the text, docs truth

Files: `src/core/*.js`, `tests/unit/core/*.js` (only where a deleted export was its only subject), `docs/modules/shared/`.

- Remove the three dead exports. For the twenty-one read only by tests, delete the one-module leftovers (`turnSimG`, `classifyTurnSimPosition`, `formationAxes`, `leadTargetKt`, `checkDoctrinalInvariants`, `canopySightVector`, `canopyLosDot`, `firstEntry`) with their tests, listing in the pull request what each did; keep the aircraft's numbers and the general maths (`speedOfSoundKt`, `machToKiasKt`, `pitchDegFromClimb`, `T6A_GLIDE`, `glideSinkFpm`, the zoom trio, the chart point arrays) since a module may need them next, unless step 5 decides otherwise. A test that covers a kept export stays.
- The four `standards.js` defaults become `DEFAULT_STANDARDS` (the Debrief passes its standards explicitly, so the app's numbers do not change; the `core-trace` rows for the standards use explicit arguments). `V6_STANDARDS` stays only if a test still needs it as data, renamed to say what it is.
- Rewrite every header and comment that cites V6 as the pin or `original/shell.html` line numbers, the `tests/golden/` mentions and the "SPEC-core" mentions, to describe the code as it is and name its source (the page, standard aerodynamics, or Patrick's ruling).
- `flight-math.md`: a row for every export that stays, including `tennis.js`, `canopy.js`, `standards.js`, `time.js` and Traffic's temperature-aware airspeed pair (under "not in core" until step 2 moves the atmosphere). `spec.md`'s core part rewritten as the as-built description, with the "fifth PR" headings gone. `README.md` "Where it stands" brought to V2.350.
- Proof: `core-trace` identical; core tests unchanged apart from deleted subjects.

### Step 2. One standard atmosphere, one angle wrap

Files: new `src/core/atmosphere.js`; `flight-math.js`, `t6-performance.js`, `wind.js`; `src/modules/traffic/weather.js` (with the Traffic plan's step 2, same thread).

- `atmosphere.js` holds the standard day once: temperature, pressure ratio, density ratio and speed of sound at a height, each taking an optional temperature deviation (0 by default). `isaDensityRatio` moves there and `flight-math.js` re-exports it under the same name so no importer changes; `isaPressureRatio` and `speedOfSoundKt` call it; `t6-performance.js` `iasToTasKt` and `tasToIasKt` stay as the standard-day pair, and Traffic's `weather.js` becomes the same two lines with today's deviation passed in. Same number to the last digit, standard day and off it.
- `wind.js` `wrap360` is deleted for `wrapDeg360`.
- Proof: `core-trace` identical; the Traffic driver's standard, hot and cold runs identical.

### Step 3. Module copies pointed at core (each module's thread does its own)

Not this thread's edit. This thread writes the list below into each module's `future.md` or hands it to the module's thread through the coordinator; Dad's modules go to Dad.

- Turn Fight: `readouts.js:113` and `view3d.js:137` call `bankDegFromG`.
- Debrief: `view3d/scene.js:124` calls `bankDegFromG`; `weather/winds.js:27` uses `FT_PER_M`.
- SOF: `map-view.js:11` imports `FT_PER_NM` (a last-digit scale change on screen, so it waits for step 5's ruling on the constant).
- Formation: `view.js:18` the same, and the same wait.
- `src/flight-data/gap-fill.js:75` and `src/airfields/distance.js:5` import `DEG` (this thread may do these two: they are shared folders, not modules).
- Traffic's copies are the Traffic plan's step 2.
- Proof: each in its own module's trace or crash check, as that module's thread runs it.

### Step 4. The SOF's Debrief imports move to shared folders (waits on Dad)

Files: `src/modules/debrief/map2d/vnc.js`, `src/modules/debrief/map2d/overlays.js` (`projectRoute`, `drawRoute` only), `src/modules/debrief/data/routes.js`, `src/modules/sof/map.js`, the Debrief importers.

- The VNC layer and the route drawing go to `src/ui-kit/` (they are map drawing, like `map-tiles.js`); the routes data goes to `src/airfields/` beside the airspace and airports data. Both modules import from there. Dad owns SOF and Debrief, so this step is proposed to him through Patrick and built only on his word, by whoever he names; it is a pure move with no number in it.
- Proof: both modules' crash check from the default start; `git grep "\.\./debrief/"` in `src/modules/sof` and `"\.\./sof/"` in `src/modules/debrief` return nothing.

### Step 5. Numbers and decisions for Patrick (docs, with Patrick)

Not a code step. One table (number, file, what it does, proposed answer) for Patrick to rule on, one question at a time, his own value always an option:

- Feet per nautical mile: 6076.12 (core), 6076.11549 (SOF and Formation screens) or the exact 1852 ÷ 0.3048 = 6076.1155. Fable recommends one value in `units.js` and every screen reading it.
- `FTPS_TO_KT` 0.592484 against 1 ÷ 1.68781: keep the rounding or make it the reciprocal (a last-digit change in the Debrief's speed readouts).
- Two zoom models: core's `flyZoomT6A` (the published engine-out procedure flown on the point mass) and Traffic's PFL zoom (`zoomPitchStep`). Which is the one; the other goes or becomes a caller of it. Fable recommends Traffic's, since it is the one that flies in the app and carries the wind, with core's kept as the cross-check its test already is.
- `LANE` (100 ft margin, 1,000 ft range, 2,000 ft step-down range, 1,200 ft canopy range), `T6A_ROLL` and `T6A_G_ONSET`, and `SHADE_GAIN`: all marked estimates; a page or a ruling for each, or they stay marked.
- The one-import-point ("barrel", `plan.md` Step 2). Fable's answer: no barrel. A named import from the file that holds the formula tells a reader where it lives, which is what plain code for a non-developer asks; a barrel that re-exports `t6-performance.js` pulls `point-mass.js` and the chart fit into every module that wants one angle wrap; and `flight-math.md` is already the one place to find the maths. Patrick decides.

## 5. What Fable does

After each core merge Fable reads the diff for anything that is not a pure move, checks the `core-trace` diff the thread reports, and runs the Formation set on a renamed copy as the standing order says; after step 2 it also reads the Traffic driver's hot and cold rows. PASS or FAIL to Patrick in the Fable thread; a FAIL stops the next step until the cause is found.

## 6. Open at the start

- Patrick's yes to this plan is the one gate for steps 1 and 2. Step 3 waits on each module's thread, step 4 on Dad, step 5 on Patrick's rulings.
- The Formation thread is changing `turn-sim/live/` files that import core while this runs. Steps 1 and 2 keep every imported name and value, so Formation's work is unaffected; if Formation needs a new core function in that window, it asks this thread.
- Unseen by Fable: the screens. Everything above is proved on numbers; Patrick sees each module's screen at the end of its merge, and the version label tells him which build he has.
