# Turn Sim refactor: plan and handover at V2.304

Written by the Fable review thread, 11 Oct 2026, on Patrick's order (09:31Z: "Once you're satisfied with formation's work, come up with the refactor plan, give it to a fresh Opus thread to execute with a full handover, then verify/audit their work"; 10:37Z: "make it work for the four ship stuff then refactor, it will be easier to optimize then"). Formation's bug round closed at V2.304 (#820); its rough spots left for later are in `future.md` and stay as they fly (Patrick 10:36Z).

This file is the whole brief for the thread that builds it. Read `AGENTS.md`, this module's `README.md`, `plan.md` Step 8 and `HANDOVER_REPORT_V2.210_TRJ.md` section 8 first. Search for existing flight math before writing new (`docs/modules/shared/` and `src/core/`).

## 1. What this refactor is, and is not

It is a tidy of the live formation code (`src/modules/turn-sim/live/`, about 15,000 lines) so that the optimiser (`plan.md` Step 9) has one ride law with named knobs to work on, and the next bug does not come from state carried between phases. It is the five-step list from Fable's V2.210 review (`formation-review-package-v2210/report/report-v2210.md` section 5, project files), minus the steps already built (the slope, TS-166; the first dead-code pass, V2.218), plus the duplicate rules the review counted in section 2.7.

It is not a flying change. Every step but the last ends with the same aircraft in the same place at the same time, and the proof is the same trace before and after. Nothing in `future.md` "Rough spots left for later" is fixed here. No 3D, no screen, no optimiser code.

## 2. Rules for the build

- Model Opus, thinking medium (high for step 5 only). One fresh thread, one pull request per step, in the order below. The thread does the work itself; no agent swarm.
- Fable flies every merge on a renamed copy before Patrick does (standing order 03:50Z) and audits the diff. Each pull request names what is untested or unseen.
- One writer per file: this thread owns `src/modules/turn-sim/live/` and `docs/modules/turn-sim/` for the duration. Formation's bug-fix thread is finished; if Patrick reopens a Formation bug while this runs, the coordinator says which thread holds the file.
- Never change flight physics (turn, energy, G, stall or stick-shaker formulas), the ride law's numbers (`moves.js` `TURNING_REJOIN`), or any ruling in `decisions.md`. A move of a formula into `src/core/` must give the same number to the last digit.
- Pure moves only in steps 1 to 4: when a step's trace differs from the one before, stop, find why, and either show it is a float-order change under 1 ft and 0.1° with the rows listed, or back the change out. Two failed fixes stop the step until Patrick answers.
- Version label bumps with every merge (`src/modules/traffic/version.js`, the home-screen number). Merge titles "V2.3xx Formation: ..." in plain words. Docs/test-only pull requests do not bump.
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

The proof set is Fable's driver run, not the unit tests. Before step 1 the thread records the baseline on main at the version it starts from; each step reruns the same set and diffs the two logs.

- Runner: `run-v2304.sh` in the project files, `formation-review-package-v2304/report/`, with the drivers beside it (`four-from.mjs`, `high-trj.mjs`, `break-rejoin.mjs`, `er-trace.mjs`, `rollout-auto.mjs`, `four-times.mjs`; `trj-trace.mjs`, `fly-roll2.mjs`, `fly-turn.mjs` are in the same folder). The drivers import from `src/modules/turn-sim/live/` by relative path; copy them to the repo root (or the renamed copy's root), run, and remove them. They are not committed.
- The set: the 16 four-ship turning rejoins (Spread 4, fighting wing, offset box, Fluid 4, each to echelon and finger, left and right); the 2-ship hot turning rejoin from 2,000 ft high, level, and 2,000 / 1,000 / 500 ft low, tight spacing; the trail rejoin after break and rejoin, echelon to route and back, Lead's roll-out, the far echelon-left ride, and the station-change timings. About 2,400 trace rows.
- "Identical" means the trace rows match except the version label. The drivers print positions to the foot and bank to the degree; a pure move must reproduce them.
- No new tests for steps 1 to 4 (a trace-equality test would be a test of the code's own output, which the rules forbid). Step 5 adds one end-picture test.
- Fable repeats the run on a renamed copy of each merge and reports to Patrick.

## 4. The steps, one pull request each

### Step 1. Dead code, stale names and comments, numbers.md

Files: any in `live/` and this module's docs. No behaviour.

- Remove exports nothing imports. At V2.304 about 62 exported functions and constants in `live/` have no reader outside their own file (find them with: for each `export function|const` in `live/*.js`, `git grep -l` the name across `src`, `tests`, `tools`, excluding its own file). Before deleting each, list what it did in the pull request; anything a unit test still covers stays, named, until Patrick retires the test (`aimLiftVector` is the known case, `tests/unit/core/canopy.test.js`).
- `trackTwice` (`tracker.js`) runs once: fold it into `runTracker` or delete it.
- `hand-over.js` holds closure-rate mapping and there is no hand-over any more: rename to what it is or merge into `rates.js`. `kinematic.js` header says "tracker-only migration Slice 4": write what the file is.
- Stale comments naming deleted files (the review's 2.8 list: `lead-turn-in.js`, `recipes.js`, `replan.js`, `replay.js`, `moves.js`, `rates.js`, `fw-switch.js`, `turning-rejoin.js`, `chooser.js` header) rewritten to describe the code as it is now.
- Regenerate `numbers.md` with `tools/turn-sim-numbers.mjs`; fix `README.md` "Where it stands" (still says Formation V2.102 and lists files that no longer exist) and `spec.md` lines that list deleted files or describe "Lines, then tracker" as live behaviour.
- Proof: trace identical.

### Step 2. One copy of each rule

Files: `live/*.js`, `src/core/flight-math.js` (additions only, with the coordinator told first since `src/core` is shared).

| Rule | Copies at V2.304 | One home |
|---|---|---|
| `DEG = Math.PI / 180` | `manoeuvres.js` (exported) and redefined in `attitude.js`, `fluid-lead.js`, `fluid-wing.js`, `kinematic.js`, `slots.js`, `slow-down.js`, `optimise/score.js` | one export, every file imports it |
| Stall or max-G bank, acos(1/G) | `flight.js:59, 75`, `pilot.js:106`, `slow-down.js:72, 92, 99`, `turning-rejoin.js:129`; `core/flight-math.js:31` already has it | `core/flight-math.js` (add `bankFromGDeg` if the inverse is missing) |
| Turn rate from bank | `core/flight-math.js turnRateFromBankRadPerSec` is used by `flight.js`, `fluid-lead.js`, `fw-pursuit.js`; check `kinematic.js`, `tracker.js`, `formation-turns.js`, `rates.js` for the inline `g·tan(bank)/V` the review found and point them at core | `core/flight-math.js` |
| The fighting wing cone | `slots.js FW_BAND` with its `FW_LIMITS` / `FW_REGION` margins is the table; `tracker.js:196` still has `r <= 1200 && along <= 1200`, `:963` `1000 : 1500`, and `formation-turns.js fwGoal` carries its own aim margins | `slots.js`, one settle margin |
| Lead's six, the 3/9 lane, 2,000 ft step-down, 1,200 ft canopy | `slots.js LANE` (100 / 1,000 / 2,000), `core/canopy.js`, literals in `tracker.js:649, 705, 790, 1110`, `turning-rejoin.js`, `straight-rejoin.js` | `slots.js LANE`, or move `LANE` into `core/canopy.js` so gate and engine read one number |

Each number must come out equal, not "close". Proof: trace identical.

### Step 3. Split `tracker.js` by phase kind, one state object per phase

Files: `live/tracker.js` (1,193 lines, CRLF line endings: convert to LF in its own commit first so the diff is readable), new `live/ride.js` and `live/line.js`, and the importers (`chooser.js`, `formation-turns.js`, `four-legs.js`, `four-open.js`, `four-rejoin.js`, `lead-turn-in.js`, `move-in-band.js`, `recipes.js`, `replan.js`, `replay.js`, `rolling-rejoin.js`, `straight-rejoin.js`, `transitions.js`, `turning-rejoin.js`).

- `ride.js`: `rideAim`, the `ride` branches of `closureOf`, `lineAltOf`, the height-as-speed and boards logic in `powerOf` that belongs to the ride. This is the file the optimiser will read.
- `line.js`: the `line` kind, used at V2.304 only by `straight-rejoin.js:58` and `turning-rejoin.js:621`. Kept until step 5 deletes it.
- `tracker.js`: the slot tracker and `runTracker` as a dispatcher calling `aim`, `closure`, `height`, `isIn` per kind.
- Each phase gets its own state object created when `advance` starts it; `aimOf`, `heightOf`, `powerOf` read only that. The run-level flags the review named (`pclMaxActive`, `ref.ride` read as `rideEstablished`, `heightState.activeLeg`, `aligning`) move into it. This is the change that stops the next `heightState.cone` class of bug (handover 3.5, TS-160).
- Proof: trace identical, plus the 4-ship close-changes matrix (`tests/turn-sim/close-formation-matrix.mjs`) unchanged.

### Step 4. One phase-list builder and one search pass

Files: `live/turning-rejoin.js` (1,079 lines).

- `flyTurningRejoinWith` (about 390 lines, 22 options) builds three different phase lists in a `to === 'fw' / onX / else` ladder. Replace it with one builder that takes the destination as data (the slot, the cone middle, the tail path) and one list of phases, so the 2-ship, the 4-ship #2, the element and the trail case read the same code.
- `searchTurningRejoin` flies the same candidate up to twelve times (review 2.4). Give it one pass per candidate and a counter of runs printed in the driver output.
- Proof: trace identical; the winners and their times the same; the run count down and printed.

### Step 5. The straight rejoin and the box line onto the ride; delete the `line` kind

Files: `live/straight-rejoin.js`, `live/four-rejoin.js` (`onBoxLine`, already `kind: 'ride'`), `live/line.js` (deleted), `spec.md` 10.9, `decisions.md` (one row, next free TS number, Patrick's wording).

This is the one step that may change the flying, so it waits for Patrick's yes to its spec before it starts: the straight-ahead rejoin at full power until on Lead's six, then the overtake (TS-72), flown as a zero-turn-rate ride (the ride law with Lead not turning), and the same decision point and slide into the slot as the turning rejoin. Expected on screen: the same end picture; closure may differ by a few knots.

- Proof: trace of the straight rejoin set (the `break-rejoin.mjs` `straight` cases and the training panel's straight starts) compared and the differences listed; all other traces identical.
- The one test: a straight rejoin from 3,000 ft in trail ends in the echelon slot, behind Lead's 3/9 line all the way, within 150 s (generous; Fable's v2276 SARJ took 119 s).

### Step 6. Unsourced numbers (docs, with Patrick)

Not a code step. `plan.md` Step 8 still carries the unsourced numbers from review 2.6 and 2.8: the 45° follow bank cap, the +5° cone ease, the 70% hold power, the 25 kt emergency overshoot in `powerOf`, the ride's tau 6 and 4 s, and the rest of the list. After step 5 the thread writes them as one table (number, file, what it does, proposed source or "estimate") for Patrick to rule on, one question at a time, his own value always an option. Numbers he sources go into `numbers.md` with the page; numbers he drops come out in one more pull request.

## 5. What Fable does

After each merge the coordinator builds a renamed copy; Fable runs the proof set on it, diffs against the previous copy, reads the diff of the pull request for anything that is not a pure move, and reports PASS or FAIL to Patrick in the Fable thread. A FAIL stops the next step until the cause is found. After step 5 Fable records the flight set that the optimiser (Step 9) uses as its baseline.

## 6. Open at the start

- Patrick's yes to this plan, and later to step 5's spec, are the two gates. Steps 1 to 4 need no further yes.
- The handover state and open items are in `HANDOVER_REPORT_V2.210_TRJ.md` section 8; the rough spots left for later are in `future.md`. Neither is this thread's to fix.
- Unseen by Fable: the screen. Everything above is proved on traces; Patrick sees the screen at the end, and the version label tells him which build he has.
