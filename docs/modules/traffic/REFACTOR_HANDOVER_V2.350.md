# Traffic Sim refactor: audit and handover at V2.350

Written by the Fable review thread, 11 Oct 2026, on Patrick's order (23:05Z: "We need a one-time-fable-refractor audit on traffic sim"). It follows the shape of the Formation one, `docs/modules/turn-sim/REFACTOR_HANDOVER_V2.304.md`: one audit, then a step-by-step handover, one pull request per step, each step a pure move proved by the same trace before and after.

This file is the whole brief for the thread that builds it. Read `AGENTS.md`, this module's `README.md`, `plan.md` and `decisions.md` first. Search for existing flight math before writing new (`docs/modules/shared/` and `src/core/`). Patrick reads this plan before any build thread starts. Core has its own companion plan, `docs/modules/shared/REFACTOR_HANDOVER_CORE_V2.350.md`, whose steps 1 and 2 run before this plan's step 2.

## 1. What this refactor is, and is not

It is a tidy of the Traffic flying code (`src/modules/traffic/`, about 21,000 lines, of which about 9,000 fly the aircraft and the rest draw the screen) so that the next bug does not come from a flag carried on the aircraft between phases, and so that one rule lives in one place. The flying already has one mover: every aircraft rides a path on `path-follower.js`, and every manoeuvre is flown once by the simulated pilot in `circuit.js` (plan Step 2, done at DADS v2.10.17). What is left is the shape around that mover.

It is not a flying change. Every step ends with the same aircraft in the same place at the same time, and the proof is the same trace before and after. No 3D, no screen, no new feature: `view3d.js` (2,913 lines), `map2d.js` (1,267) and `scenery3d.js` (1,096) are read-only for this work; their tidy, if Patrick wants one, is a later piece with its own crash check. Nothing in `future.md` is fixed here. The open PFL flying question in `plan.md` (the arc speed against TR-R14) belongs to the Traffic and PFL audit thread, not to this.

### 1.1 What the audit found

The code as it stands, by file, with what the steps below do about it.

- **`sim.js` (1,628 lines).** One `createSim` closure holds everything: the roster, the tick order, rewind, the commands, deconfliction's glue, the runway, taxi, ejection. Its header still says the sim is "V6's own model, ported unchanged and pinned by `tests/golden/traffic-sim.test.js`"; there is no `tests/golden/` folder and the model is the simulated pilot's. Four near-identical "start a flown path" setters (`startClosedPattern`, `startGoAround`, `startFlown`, `startHighKeyClimb`) plus the two enders (`goAroundEnded`, `pflEnded`). The wind object `{ windFromDeg: setup.windFromDeg ?? 360, windKt: setup.windKt ?? 0 }` is written out eight times though `windNow()` exists; the closed-pattern default bank `?? setup.settings?.closedPatternBankDeg ?? 50` five times. The runway frame (along and across the 29L centreline) and "lined up on final" are re-derived inline in `beforeUpwindEnd`, `landForTheStop`, `runwayBusyTick`, `spacingTick`, `randomizeTick` and `state().tagOf`, each with its own thresholds (2,000 ft and 60°, 2,000 ft and 30°, a 300 ft window, and so on). Exports nothing reads: `G_FTPS2` (a copy of `src/core/units.js`), `MAX_ROLL_RATE_DPS`, `DEFAULT_CONFLICT_LIMITS`.
- **Flags on the aircraft.** An aircraft carries its state as loose fields set from many files: `command`, `phase`, `mode` (always `'RAIL'`; the physics mode was deleted), `intent`, `pendingClosed`, `deconflict`, `avoidanceBreakout`, `rndFinal`, `rndUpwind`, `rndDownwind`, `rndLowApproach`, `siLap`, `perchRoll`, `touchAndGo`, `engineFailed`, `status`, `tag`, the `pfl*` family (`pflFlight`, `pflDone`, `pflSegment`, `pflDecision`, `pflMarginFt`, `pflMarginTag`), `goAroundFlight`, `goAroundDone`, `highKeyFlight`, `sideStep`, `join`. Three slots carry a flown path (`goAroundFlight`, `highKeyFlight`, `pflFlight`) and `tick-aircraft.js` picks between them by precedence. This is the Traffic equivalent of Formation's run-level flags (the `heightState.cone` class of bug).
- **`route.js` (714 lines), V6-era.** `computeBreakRollout` and `simulateBreakArc` have no caller; `newEntry`, `newSplit`, `navSegs`, `roundedPoints`, `pointTurnRadiusFt`, `ROUTE_COLORS` and `nextRouteColor` are read by nothing outside the file. `computeWindPerch` is read only by `scene.js` for the wind-perch marker and by `tests/unit/traffic/vector-sim.test.js`. The Pattern 1 special cases inside `buildRoundedPoints` (the break deceleration curve, the final-turn easing, the phase labelling, about lines 192 to 253) are unreachable in the app: `buildPath` sends Pattern 1 to `buildCircuit` whenever `trueArcs` is on or there is wind, and `glue.js` and `data/moose-jaw.json` always set `trueArcs` on. `_breakCache` is a module-level cache keyed on wind and temperature only.
- **`circuit.js` (863 lines).** The simulated pilot and the circuit builder, the file that flies the circuit, in good order with its numbers sourced. Exports nothing reads: `aimPointOf`, `touchdownPointOf`, `plannedTurnEndCrossFt`, `timeToTurnOnto`, `breakTurnSec`, `finalTurnSec`, `breakPointAlongFt`. Four module-level caches (`rollOutMemo`, `planWaits`, `breakSecCache`, `finalSecCache`). `ROLL` (45°/s, 90°/s²) is marked an estimate.
- **`pfl.js` (1,536 lines).** Geometry, the zoom model, the chain of lines and arcs, the joins, the flight (`flyPfl`, about 450 lines) and the sim glue, all in one file. Its own `DEG` and `RAD` copy `src/core/angles.js`; the stall bank is written as `Math.acos(1/g)` three times (lines 178, 698, 1194) where `src/core/flight-math.js` has `bankDegFromG`; `flownBehind` builds the wind vector by hand (lines 1522 to 1525) where `src/core/wind.js` has `windVectorFtps`. `getPflBadge` tests phase strings nothing sets (`pfl_crash`, `crash_short`, `pfl_orbit`, `base_key`). Seven keys of the `PFL` table are defined and never read (`cutFtPerFtLow`, `followPatternLowFt`, `lookaheadFt`, `maxLookaheadFt`, `turnRoundOnProfileFt`, `interceptTurnDeg`, `inTurnBankDeg`). Exports nothing reads: `glideKias`, `flownGlideRatio`, `stallG`, `tradeFloorKias`, `speedTradeFt`, `directTurnRadiusFt`, `glideJoinMinRadiusFt`, `orbitRadiusFt`, `glideFootprint`, `obviouslyShort`, `chooseDirect`, `chooseJoin`. The "298 in two places" left on `plan.md` is gone: the file imports `RUNWAY_29L_HDG_DEG`.
- **Two copies of one rule.** `weather.js` has `iasToTasKt` and `tasToIasKt` with today's temperature; `src/core/t6-performance.js` has a standard-day pair of the same name. `path-follower.js` `resolveAircraftConfig` and `behaviour.js` `configOf` both decide gear and flap from the phase. `path-follower.js` carries its own runway frame (`RWY_OUT`, `RWY_29L_TRACK_DEG`) beside `airfield.js`. `envelope.js` `gateRoll` takes two different argument shapes and writes the stall bank inline. `breakout.js` holds `ENT1_ROUTE`, a copy of Entry 1's points from `data/moose-jaw.json`, with its own along- and cross-track helpers.
- **Module-level mutable state.** `weather.js` `deviationC` is a file-level variable set by the sim before every step; `placeStraightInDescent` rewrites the setup's Entry 2 points in place every step. Two sims in one page (as `scenario-timing.js` forks one to time the straight-in) share that variable. It works because every step resets it, which is the kind of thing the next change forgets.
- **Docs out of step with the code.** `src/modules/traffic/README.md` links `specs/SPEC-traffic.md` and `tasks/traffic/todo.md`, neither of which exists. `docs/modules/traffic/spec.md` sections 2.3 to 2.5 and 8 to 9 describe the deleted engine (`flight-engine.js`, the KIN and NRG models, `computeBreakRollout`) with "superseded" notes rather than the code as it is. `README.md` "Where it stands" and "What is next" stop at the DADS v2.10.x era. `airfield.js` keeps two field heights (`THRESHOLD_DATA_ELEV_FT` 1,880 and `FIELD_ELEV_FT` 1,892), a known and documented disagreement that stays until Patrick rules.
- **Screen and 3D.** `view3d.js`, `map2d.js`, `aircraft.js`, `scenery3d.js` and the rest export about 90 names nothing reads. They are listed for a later screen tidy only; nothing here touches them.

## 2. Rules for the build

- Model Opus, thinking medium (high for step 5 only, the PFL split). One fresh thread, one pull request per step, in the order below. The thread does the work itself; no agent swarm.
- One writer per file: this thread owns the flying files of `src/modules/traffic/` (`sim.js`, `tick-aircraft.js`, `path-follower.js`, `route.js`, `circuit.js`, `pfl.js`, `closed-pattern.js`, `high-key.js`, `breakout.js`, `evade.js`, `deconflict.js`, `envelope.js`, `weather.js`, `randomize.js`, `behaviour.js`, `nav-plans.js`, `scenario-timing.js`, `taxi.js`, `ejection.js`, `airfield.js`, `glue.js`) and `docs/modules/traffic/` for the duration. The Traffic and PFL audit thread owns Traffic code at V2.350: the coordinator says which thread holds which file before step 1 starts, and a PFL flying fix from that thread merges before step 5 or after it, never during. Additions to `src/core/` are shared code: tell the coordinator first, and a formula moved there must give the same number to the last digit.
- Fable reads the diff of every pull request for anything that is not a pure move, and runs the proof set on the merge (section 5).
- Never change flight physics (turn, energy, G, stall or stick-shaker formulas), any number in `CIRCUIT`, `PFL`, `ROLL`, `EVADE` or `WING_DOWN`, or any ruling in `decisions.md`.
- Pure moves only, in every step: when a step's trace differs from the one before, stop, find why, and either show it is a float-order change under 1 ft and 0.1° with the rows listed, or back the change out. Two failed fixes stop the step until Patrick answers.
- Version label bumps with every merge that reaches the app (`src/modules/traffic/version.js`, the home-screen number). Merge titles "V2.3xx Traffic: ..." in plain words. Docs-only pull requests do not bump.
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
- Report at the end of each step: what moved, the trace comparison result (identical, or the rows that differ and why), what is untested or unseen, what was unsure.

## 3. The proof: the same trace before and after

Traffic has no driver set yet, so the build thread writes one before step 1, records the baseline on main at the version it starts from, and reruns it after every step. The driver is not committed; it lives in the project files, `traffic-review-package-v2350/`, beside the renamed copies Fable reads, like Formation's.

- Runner: `traffic-trace.mjs`, run from the repo root. It loads `src/modules/traffic/data/moose-jaw.json`, applies the default settings through `glue.js` `applyToSetup`, builds the scenario's aircraft with `setup-panel.js` `scenarioAircraft`, makes the sim with `createSim(setup, { seed: 1 })`, and prints one row per aircraft every whole second: time, callsign, x and y to the foot, altitude to the foot, indicated airspeed to the knot, heading and bank to the degree, phase, configuration, tag, status, plus the conflict list from `state()`.
- The set, each run to 600 s (ten minutes covers a full circuit, a PFL from the area and a taxi-in):
  - the Busy circuit from the default start, at calm, at 260° 15 kt and at 320° 10 kt, on the standard day;
  - the Busy circuit at calm on the hot day (30 °C) and the cold day (−30 °C);
  - the built-in Moose Jaw setup at calm with these commands sent by the driver: `go_around` at 60 s, `closed_pattern` at 120 s, `breakout` at 180 s, `touch_and_go` and `full_stop` on the aircraft nearest final at 200 s, `climb_high_key` at 240 s, `engine_fail` at 300 s, `pfl_current` at 360 s, each to a named aircraft so the row is repeatable;
  - the Random scenario with seeds 1, 2 and 3 at 260° 15 kt;
  - one rewind check per run: `seek` back to 150 s then `stepTo` 300 s, rows compared to the forward run.
- "Identical" means the trace rows match except the version label. The sim is seeded and steps in whole 0.05 s steps, so a pure move must reproduce every row.
- No new tests for the pure-move steps (a trace-equality test would be a test of the code's own output, which the rules forbid). Where a step removes code a unit test still covers, the test is named in the pull request and stays until Patrick retires it.

## 4. The steps, one pull request each

### Step 1. Dead code, stale names and comments, docs truth

Files: any flying file in `src/modules/traffic/` and this module's docs. No behaviour.

- Remove the exports nothing reads, listed in section 1.1 for `sim.js`, `route.js`, `circuit.js`, `pfl.js`, `breakout.js` (`BREAKOUT_ALT_FT`, the `ENTRY_*` constants), `evade.js` (`buildRejoin`) and `deconflict.js` (`standingOf`). Find them again at the start (for each `export function|const`, `git grep -l` the name across `src`, `tests` and `tools`, excluding its own file), since main moves. Before deleting each, list what it did in the pull request; anything a unit test still covers stays, named (`computeWindPerch` and `vector-sim.test.js` is the known case).
- Delete the unreachable Pattern 1 branch in `route.js` `buildRoundedPoints`, `computeBreakRollout`, `simulateBreakArc` and `_breakCache`, after the driver confirms the app never reaches them (the trace is the proof: `trueArcs` is on in every setup).
- Delete `a.mode` and every `=== 'RAIL'` test (always true), the seven unread `PFL` keys, and the unset phase strings in `getPflBadge`.
- Rewrite stale headers and comments to describe the code as it is: the `sim.js` header, `src/modules/traffic/README.md` (its links to `specs/` and `tasks/`), `nav-plans.js` header, and any comment naming `flight-engine.js` or a rail/physics mode as live.
- `spec.md`: replace sections 2.3 to 2.5 and 8 to 9 with the as-built description (one mover, the simulated pilot, the flown-path carriers) and move the engine history to one short "History" note. `README.md` "Where it stands" and "What is next" brought to V2.350. `plan.md` "Left:" line updated (the 298 item is done).
- Proof: trace identical.

### Step 2. One copy of each rule

Files: the flying files; `src/core/flight-math.js`, `src/core/wind.js`, `src/core/angles.js` (additions only, coordinator told first).

- Airspeed: `weather.js` keeps the temperature-aware `iasToTasKt` and `tasToIasKt` and calls them through one density function; `src/core/t6-performance.js`'s standard-day pair is either made the one implementation with a density argument or renamed so the two cannot be confused. Same number to the last digit on the standard day.
- Stall bank: the three `Math.acos(1/g)` in `pfl.js` and the one in `envelope.js` call `bankDegFromG`. `pfl.js` `DEG` and `RAD` come from `src/core/angles.js`. `flownBehind`'s wind vector comes from `windVectorFtps`.
- Wind: `sim.js` uses `windNow()` in all eight places. The default closed-pattern bank is one helper.
- Gear and flap: one rule, in `behaviour.js` `configOf` or `path-follower.js` `resolveAircraftConfig`, the other calling it.
- Runway frame: one helper in `airfield.js` (along and across the 29L centreline, "lined up on final" with its thresholds as named arguments), read by `path-follower.js` and by the six places in `sim.js`. Each caller keeps its own thresholds in this step; the thresholds are listed in the pull request for Patrick (step 6).
- `breakout.js` `ENT1_ROUTE` reads Entry 1 from the setup's routes instead of its own copy, and its along- and cross-track helpers become `src/core/geo.js` `legOffsetsFt` calls if the numbers match to the foot.
- `envelope.js` `gateRoll` keeps one argument shape.
- Proof: trace identical.

### Step 3. One flown-path carrier, one setter

Files: `sim.js`, `tick-aircraft.js`, `path-follower.js`, `pfl.js` (sim glue only), `high-key.js`, `closed-pattern.js`, `breakout.js`, `evade.js`.

- The three slots (`goAroundFlight`, `highKeyFlight`, `pflFlight`) become one `a.flown` carrier: `{ kind, route, then, joinId, outcome, settings }`. `tick-aircraft.js` follows `a.flown.route` when present and the route it is on otherwise; the per-kind lines (the High Key hand-over into the PFL glide, the PFL's per-point fields, the engine-failed flag) sit in one small table keyed by `kind`.
- The four setters in `sim.js` collapse into one `startFlown(a, kind, route, options)`, and `goAroundEnded` and `pflEnded` into one `flownEnded(a)` that dispatches on `kind`. The screen reads (`map2d.js`, `view3d.js`, `readouts.js`) that look at the old slots change only their field name.
- Proof: trace identical, including the rewind check (the carrier must survive `takeSnapshot` and `putBack`).

### Step 4. One state object per aircraft, and the tick list in one place

Files: `sim.js`, `deconflict.js`, `randomize.js`, `behaviour.js`, `taxi.js`.

- The loose flags in section 1.1 move into named groups on the aircraft, created when the phase that uses them starts and deleted when it ends: `a.random` (the four `rnd*` flags), `a.spacing` (`deconflict`, `avoidanceBreakout`, the standing), `a.landing` (`touchAndGo`, `perchRoll`, `siLap`, `pendingClosed`), `a.pfl` (the `pfl*` fields). `command`, `phase`, `intent`, `tag`, `status` stay where they are: the screen reads them.
- `stepOnce` keeps its order (every tenth step: SI pattern, randomise, deconflict, runway busy; then per aircraft: follow, flown-path end, decisions, route end, pending closed pattern; then collisions; then snapshot) but as one list of named tick functions at the top of the file, so the order is read in one place.
- `weather.js` `deviationC` becomes a field of the sim's environment passed with the wind (the `env` object `tick-aircraft.js` already builds), and `placeStraightInDescent` runs when the setup or the temperature changes, not every step. The same rows must come out: the driver's hot and cold runs are the proof.
- Proof: trace identical, including rewind.
- As built (V2.350 refactor step 4), three items were left as they are:
  - The groups are made on first use and are not deleted when a phase ends, because deleting them would change reads that now see `false` into `undefined`.
  - `deviationC` stays a value set in `weather.js` at the start of every step, because passing it in `env` would change the helpers behind 58 speed conversions, well outside this step's files.
  - `placeStraightInDescent` still runs every step: it writes only when the point moves, and running it only on change would need a hook at every place the routes or the temperature can change.

### Step 5. Split `pfl.js` by concern

Files: `pfl.js` (1,536 lines), new `pfl-geometry.js` (geometry, zoom, chain), `pfl-joins.js` (`joinPath`, `interceptPath`, `directPath`, `turnOntoRunway`, `squarePath`, the choosers), `pfl-flight.js` (`flyPfl` and the `PFL` table), with `pfl.js` left as the sim glue (`startPflFlight`, `resumePflFlight`, `planNow`, `flownBehind`) and the importers (`tick-aircraft.js`, `nav-plans.js`, `high-key.js`, `map2d.js`, `view3d.js`, `readouts.js`, the tests).

- `flyPfl` gets one state object for its run (the keys, the margin, the decision, the configuration) created at the start and passed to the phases, in place of the local variables it threads through about 450 lines. No phase logic changes.
- Proof: trace identical; `tests/unit/traffic/pfl.test.js` unchanged.

### Step 6. Unsourced numbers (docs, with Patrick)

Not a code step. After step 5 the thread writes one table (number, file, what it does, proposed source or "estimate") of the Traffic numbers that carry no manual page or ruling: `ROLL` (45°/s, 90°/s²); the "lined up on final" thresholds from step 2; the `PFL` table's estimates; the `EVADE` and `spacingExtensionFt` distances; the 1,000 ft and 500 ft margins in `placeStraightInDescent`; the perch-search 0.6 share and 1,500 ft step in `buildCircuit`; the deconfliction limits. Patrick rules one question at a time, his own value always an option. Numbers he sources get their page beside them; numbers he drops come out in one more pull request. The two field heights in `airfield.js` go on the same list.

## 5. What Fable does

After each merge the coordinator builds a renamed copy in the project files; Fable runs the driver on it, diffs against the previous copy, reads the diff of the pull request for anything that is not a pure move, and reports PASS or FAIL to Patrick in the Fable thread. A FAIL stops the next step until the cause is found. Fable read every Traffic flying file for this audit without objection, so the renamed copy is a convenience for byte comparison, not a requirement.

## 6. Open at the start

- Patrick's yes to this plan is the one gate. No step changes the flying, so no step needs a spec approval.
- Which thread holds Traffic's code while this runs (the Traffic and PFL audit thread is open at V2.350): the coordinator settles it before step 1.
- The driver set in section 3 is Fable's proposal; Patrick may add a case he wants seen (a wind or a command) before the baseline is recorded.
- Unseen by Fable: the screen. Everything above is proved on traces; Patrick sees the screen at the end of each merge, and the version label tells him which build he has.
