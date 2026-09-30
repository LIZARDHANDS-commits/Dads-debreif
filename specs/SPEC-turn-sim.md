# Spec: `turn-sim`, the Formation Turn Sim

Status: **approved by Patrick on 2026-09-30** ("Spec turn sim approved", in the Turn Sim spec thread). Patrick answered Q41 to Q47 the same day (see "Answered questions"), and this spec follows his answers. Changes go through a pull request. Module id `turn-sim` in [`SPEC.md`](../SPEC.md). Requirement IDs (R#), decisions (D#) and questions (Q#) refer to the plan doc: https://claude.ai/code/artifact/29712036-a126-43c3-ac39-57ba919ff102. The questions this spec raised were TS1 to TS7, logged in the plan doc as Q41 to Q47.

Building starts after the debrief screen, when the coordinator says it's the Turn Sim's turn. Until then this spec and the task plan in [`tasks/turn-sim/`](../tasks/turn-sim/) are the work.

## Objective

A trainer for 2-ship and 4-ship tactical turns. The user sets up a formation (4312, 2134, offset box or two-ship), picks a turn (delayed 90 or 45, hook, shackle, cross turn), chooses how each aircraft knows when to turn (a time delay, a clock-position cue or auto timing), and watches the aircraft fly it from above. The screen shows spacing, which wingman is tight, wide, fore or aft, and the turn radius, rate and bank.

V6 does all this in its first tab, and its flight math is Dad's. The rebuild keeps that math, fixes the mistakes Dad has already signed off (D41 to D45, D48, D74), and fixes the screen: controls that did nothing, side rails and a toolbar that covered the picture (#30, #34), settings that were lost from profiles (#31), and results that changed with the screen's frame rate (#17).

Users are T-6 instructors and students on a desktop or laptop (D6). They should be able to:

1. Open the Turn Sim and see the whole formation fitted to the screen, with nothing covering it (R2, #30).
2. Change the formation, turn or timing and press Play, and see the new plan flown, never a stale one (#31).
3. Read who is on spacing and who is off, and by how much, while it flies (R9).
4. Add errors to a wingman (late, early, wide, tight, fore, aft, extra or less G) and see what that does to the rollout.
5. Save a setup as a named profile or the startup default and get back exactly what they saved (#31, R18).

## Assumptions

1. **The flight math is Dad's V6 code, ported unchanged, then fixed one decision at a time** (CLAUDE.md, D10). Every Turn Sim number is pinned to V6 by a golden test before it moves, and each approved fix lands as its own commit that changes the pinned value on purpose.
2. **Shared pieces come from `core`**: angles and the compass conversion, turn radius, rate and bank, the G limit, distance, and the standards classifier (`classifyTurnSimPosition`, `formationAxes`, `V6_STANDARDS`). **Turn-Sim-only math** (the formation slots, turn planning, cues, the rear-element check and the step-by-step flying) lives in the module's own `engine/` folder, as pure functions with no page access. SPEC.md puts "formation presets, turn planning, cues, integrator" in `turn-sim`, and no other module uses them. See "What the Turn Sim needs from `core`" for the one piece `core` holds (D74).
3. **Speed is true airspeed with no wind**, as in V6. The box keeps V6's "KTAS" label, and V6 uses it as the ground speed.
4. **The sim steps in fixed 0.05 s steps**, V6's own step (`dt = 0.05`, line 784), whatever the frame rate. V6's Step button already does exactly this, so the pinned numbers are V6's, and the result no longer depends on the screen (#17). Playback speed changes how many steps run per frame, not their size.
5. The picture stays a hand-drawn Canvas 2D, as V6's, using ui-kit `canvas-view.js` for pan and zoom. No new package.
6. **The Turn Sim judges by the debrief's edited standards** (Q46, Patrick). V6 always used its fixed numbers, which are still the default preset (`V6_STANDARDS`), so nothing changes until someone edits a standard. The golden tests pin V6 with the default preset.
7. D78 (Q39: the offset standard alone judges #3's fore/aft in the debrief) doesn't change the Turn Sim: V6's Turn Sim judges #3 by the spread standard in 4312/2134 and by the offset standard in the offset box, never both. V6's labels stay (as `core/standards.js` also notes).

## The screen

It follows Patrick's rule (2026-09-30, R22): essentials by default, and everything else behind a checkbox (off by default) or a collapsed "More …" panel. Nothing covers anything else: no side rails, no toolbar over the canvas, no Tab-key tricks (#30, #34, #35).

**What a first-time user sees:**

```
┌ Setup ──────────────────┐┌ Stage ────────────────────────────────┐┌ Formation ──────────────┐
│ Formation   4312     ▾  ││ ▶ Pause Step Reset  1× ▾  t = 12.4 s   ││ #2  ON SPACING          │
│ Spacing     6000 ft     ││ Fit   Layers ▾                        ││ #3  WIDE   interval 6,420│
│ Start hdg   360°        ││                                       ││ #4  AFT    −380 ft       │
│ Turn        Delayed 90 ▾││                                       ││ Min sep  5,980 ft        │
│ Direction   Right  Left ││         formation picture             ││ R 3,610 ft  45.0°/…  60° │
│ Speed       220 KTAS    ││                                       ││ ▸ More detail            │
│ G           2.0         ││                                       │└─────────────────────────┘
│ Timing  Time delay   ▾  ││                                       │
│ Base delay  16.0 s      ││  drag an aircraft before Play to move │
│ ▸ Aircraft errors       ││                                       │
│ ▸ More setup            ││                                       │
│ ▸ Profiles              ││                                       │
└─────────────────────────┘└───────────────────────────────────────┘
```

| Shown by default | Behind a checkbox (off by default) or a collapsed "More …" panel (R22) |
|---|---|
| **Setup:** Formation, Spacing, Start heading (compass), Turn, Direction, Speed, G, Timing, and the one field the timing needs (Base delay, or Clock position for the clock cue, or the computed auto delay shown read-only) | **More setup:** Turn degrees, Duration, MOA boundary, Clock cue tolerance, Offset box settings (aft spacing, lateral stagger, #4 timing (ground track by default, or V6's Late and Early); shown only when the offset box is picked), #2's side in 4312 and 2134 (D48), and a **Correction model** checkbox (off; opens the model, strength and G fix, Q41) |
| **Stage:** the playback bar (Play, Pause, Step, Reset, speed 0.25× to 4×, sim time) above the canvas, Fit, and the picture | **Layers** menu: Lead 3/9 line (on), turn circles (on), error labels (on), follow lead, clock marks, breadcrumbs and their interval, distances in NM |
| **Formation card:** one line per wingman (its label and the number that's off), minimum separation, and one line of turn radius, rate and bank | **More detail:** every pair's spacing (1-2, 1-3, 1-4, 3-4, 2-3, 2-4), each wingman's interval, fore/aft and measuring note, and V6's summary table (time to turn, speed) |
| | **Aircraft errors:** per wingman, delay error, G error, and the position error (tight/wide and fore/aft in feet) |
| | **Rear element check** (offset box only, inside More setup): on/off, start time, direction, angle, hold, and a live status line |
| | **Spacing graph** checkbox (off, Q41): V6's hidden graph of the chosen pair distances, minimum separation and closure over the run, each in its own colour and labelled |
| | **Solver** checkbox (off, Q41): V6's hidden solver, which finds the base delay, spacing or G that gives a target spacing |
| | **Profiles:** named profiles, save and load the startup default, delete, factory reset; and Export CSV |

- **Layer defaults stay V6's** (3/9 line, turn circles and error labels on; the rest off), so the picture matches what V6 users know.
- **Open panels and layers are remembered** in this browser (`app.storage`), with a "Reset layout" in the Layers menu. They're not part of a profile, which carries the scenario.
- Only controls that apply are shown: offset-box settings and the rear-element check appear only with the offset box; the clock-cue fields only with the clock cue; the auto delay only with auto timing (#32).
- Panels are ui-kit `panel.js` sections (real buttons with `aria-expanded`), and every input is a ui-kit control bound to the module's settings, which refuses blank, non-finite and out-of-range numbers (so a huge start heading can't freeze the page, SPEC-core).
- **Keyboard** (through `app.keys`, only while the Turn Sim is open and never while typing): Space plays or pauses, → steps once, Home resets. The canvas view's arrows pan and + and − zoom.
- **Colours:** #1 blue, #2 green, #3 red as in V6. **#4 changes from black to white with a dark outline** (#29), as in the debrief. Every aircraft carries its number, and labels carry words, so colour is never the only signal.
- Three columns at 1366 × 768 and up, none covering another (R2). The side columns collapse with a real button for a canvas-only view.

## What V6 does, and what the rebuild keeps

### Formations

| V6 formation | Slots (V6 `desiredFormationAircraft`, line 797; `s` is Spacing) | Rebuild |
|---|---|---|
| 4312 (default) | #2 `s` on Lead's left, #3 `s` right, #4 `2s` right | Kept. #2's side becomes a setting, **left by default** (D48). |
| 2134 | the mirror of 4312 | Kept, with the same #2-side setting. |
| Offset box | #1/#2 front element `s + stagger` apart; #3 in the slot `box aft` behind; #4 3,000 ft outside #2 and `box aft` behind | Kept, with V6's 1,000 ft stagger, 8,000 ft aft and 3,000 ft (named in one place). |
| Two-ship | #2 `s` on Lead's right | Kept. CSV and readouts leave out the pairs that don't exist, instead of V6's "NaN" (#17). |

Dragging an aircraft before Play moves its start position, as in V6. "Follow lead" no longer breaks dragging (#31).

V6's code-only `fluid` and `trail` layouts, never in the menu, are not ported.

### Turns

| V6 turn | What it does (V6) | Rebuild |
|---|---|---|
| Delayed 90, Delayed 45 | Each aircraft turns in the chosen direction, one after another, **outside aircraft first** (lines 1116 to 1150). The offset box has its own plan (line 994). | Kept. The on-screen note is corrected to say the outside aircraft goes first (#16; V6's note says Lead). |
| Hook turn | Everyone turns 90° at once in the chosen direction, the same as In-place 90 (line 1217). | **Rebuilt to Patrick's definition (Q43):** the aircraft turn the same direction through 180°, and the fuselages line up in the middle. V6's hook is pinned first, then the new hook lands as its own commit. The exact rollout picture (who turns when, and where each ends up) is drawn and checked with Patrick before that commit. |
| In-place 90 | Everyone turns 90° at once in the chosen direction. | Kept as V6 flies it (Q43). |
| Shackle | 45° in, then 45° back to the start heading. Both aircraft turn the same way, and the rollback delay does nothing (line 1585). | **Fixed to Dad's note and Patrick's description (Q44a):** the aircraft turn 45° into each other, hold, and roll back, so the formation ends on the original heading, at the same spacing, with each aircraft on the opposite side from where it started (an X from above). The hold is worked out so the spacing comes back the same, and is shown instead of V6's dead "rollback delay" box. If the spacing is too small for two 45° turns, the screen says so. In a 4-ship, each aircraft swaps to its mirror position across the formation's centre line; that picture is checked with Patrick before its commit. V6's shackle is pinned first. |
| Cross turn | 180°, each wingman turning away from Lead's side, Lead in the chosen direction. | Kept. |

**Per-wingman turn logic** (auto, selected direction, right, left, toward or away from the cue aircraft) is kept. **"Toward" and "away" are swapped back to what they say** (D41, #15).

**Turn degrees** default to the turn's own value (90, 45 or 180) when the turn changes, and a profile's saved value is kept on load (#31).

### Timing

- **Time delay:** aircraft *n* in the turning order starts at *n* × Base delay, plus its own delay error. Kept.
- **Clock position cue:** each aircraft waits until the aircraft just outside it passes the chosen clock position, within the tolerance. Kept, with:
  - The **tolerance box works**. V6 always used 4° because it read the box itself instead of its value (#32). The default stays 4°, so the default behaviour doesn't change.
  - Per-aircraft clock positions keep working, and the status line shows each aircraft's own position and who it waits on, updated live (#32).
  - **The clock cue selectors work** (Q45, Patrick). V6 had them on screen but ignored them. "Clock cue sequence: Outside-in" (the default) keeps V6's cascade, so the default flight doesn't change. "Manual targets" makes each wingman watch the aircraft picked in its "Clock target" (or "Clock cue aircraft" when it has none), turn when that aircraft reaches the clock position picked, and turn the way its own turn logic says. This lands as its own commit after V6's clock cue is pinned.
  - With the offset box, V6's #3 and #4 never turn at the default 5:30 cue (#16). The rebuild says so on screen ("#3 and #4 can't see a 5:30 cue in the offset box; pick Time delay") instead of silently flying straight (Q44c, Patrick). Which cue #3 and #4 should use is flagged for Dad and for revision later.
- **Auto timing** (4312, 2134 and two-ship, delayed turns), with Dad's fixes:
  - **The outside aircraft turns first, then each at its own time** (D43). V6 held everyone until Lead started, so the planned order was never flown (#16).
  - **The step between aircraft is spacing ÷ speed × cot(half the turn angle)** (D44), the delay that rolls out line abreast. At V6's defaults (6,000 ft, 220 KTAS, 90°) that is 16.2 s, where V6's spacing × angle ÷ speed gave 25.4 s. Turn degrees are limited to 10° to 180° so the step stays finite.
  - The computed step is **shown, not written over Base delay** (#16), so switching back to Time delay keeps the user's own value.
  - In the offset box, auto timing keeps V6's offset-box plan.
- **Offset box #4 timing** (Q44b, Patrick): **#4 solves its own delay by ground track**, as V6's note promises and its dead code started to: it searches for the delay that rolls it out 3,000 ft outside #2 and the box aft distance behind the front element, the same way V6 solves #3 (`searchDelayToTarget`, line 979). This is the new default. V6's LATE and EARLY stay as choices, pinned to V6 first, so V6's ~21,000 ft aft left-turn result is still there if picked.
- **Rear element check** (Q47, Patrick): it starts at its set time **or once #3 and #4 have finished their turns, whichever is later**, so it no longer postpones a planned turn. V6's fixed start is pinned first.
- The hidden trigger modes (Lead heading, range, bearing), which V6's menu can't reach, are not ported (#32).

### The flying (integrator)

Each 0.05 s step, per aircraft (V6 `moveAircraftList`, line 1579):

1. G = the G setting plus the aircraft's G error, limited to at least 1.01 (`core` `limitG`).
2. With the Correction model set to "G fix", a wingman's G is nudged by up to ±0.8 toward its spacing. **After that, G is limited to 1.01 again (D74)**, so the aircraft turns gently instead of V6's NaN.
3. Turn rate from speed and G (`core` `turnRateRadPerSec`), the rear-element check first, then the planned turn once its cue is met, up to its goal. The shackle's second leg follows the first.
4. The lag and lead correction models bend the direction of travel by up to 4° × strength, as in V6.
5. Move along the heading at the end of the step, as V6 does (Euler step). This is pinned, not changed.

Changes that don't change a number V6's Step button shows:

- **Fixed steps** (Assumption 4): same result at 60 Hz, 144 Hz, any playback speed, Play or Step (#17).
- **Closure** is the change in the 1-3 distance over the real step, not over a fixed 0.05 s when the step was shorter (#17). With fixed steps, the two are the same.
- **History and trails are kept by time**, not by count: the whole run is in the CSV, and the trail shows the last 60 s (#17). V6 kept 2,000 samples and 800 trail points.
- Speed below 1 kt is refused by the Speed box, so the turn radius can't become 0 and the turn rate NaN.

### Starting, continuing and changing a run

- **Play at t = 0** points every aircraft at the start heading and plans the turn, as V6 does. **Play after the turn has finished** starts a new leg from where the aircraft are, as V6 does (by design, audit b#13), and resets the rear-element check and breadcrumbs for that leg (#31, V6 didn't).
- **Any setup change stops the run and goes back to t = 0 with the new plan** (#31). V6 kept flying the old plan. Changes to layers, the view and playback speed don't stop it.
- **The start heading is a compass heading**: 000 is north, 090 east (D45). The default is 000, flying up the screen (Q42). V6's default of 0 flew east. Continuing a leg fills in the new compass heading.
- **The view fits the formation when the Turn Sim opens** and when Fit is pressed, at the real canvas size and pixel ratio (#30). V6 fitted while hidden and opened at minimum zoom.
- The **MOA box** (V6's 30 NM boundary) is drawn as in V6.

### Readouts and standards (R9)

- **Formation card:** per wingman, V6's labels from `core` `classifyTurnSimPosition` (TIGHT, WIDE, FORE, AFT, ON SPACING) and the one number that's off. The standards line V6 printed ("4,000 to 6,000 ft interval, ±250 ft of Lead's 3/9; offset box 7,000 to 9,000 ft") is under More detail.
- **Wide and tight position errors are measured from Lead** (D42): "Wide 1,000 ft" moves a wingman 1,000 ft further out on whichever side it flies. V6 moved every aircraft along one fixed direction, so on one side "wide" came in tighter (#15).
- The turn circles use the same G as the flying (with D74 they can no longer disagree).
- **Spacing graph, Solver and Correction model** (Q41, Patrick): V6 hid all three. They come back, each behind its own checkbox, off by default (R22). The graph draws each metric in its own colour with a legend (V6 drew all four in white) and only while open. The solver's sweep is pinned to V6 and runs only when asked, not every frame.
- **Standards follow the debrief's edits** (Q46, Patrick). The Turn Sim reads the same standards the debrief edits and shows them, read-only, under More detail, with a "Default standards" note when unchanged. A standard switched off judges nothing, so an aircraft it would judge shows no label. The standards need one home both modules read (for example an app-level `standards` setting instead of the debrief's own settings); where it lives is agreed with the debrief and app frame threads through the coordinator before task 5.

### Profiles and CSV (#31, #33)

- **A profile saves the whole scenario**: every Setup, More setup, Aircraft errors and rear-element check value, and each aircraft's dragged start position. Loading one gives back exactly that, including turn degrees. The settings are one versioned object (`storage/settings.js`), checked field by field on load.
- Profiles and the startup default live in `app.storage` (scope `turn-sim`), which never crashes when the browser blocks storage (#33). With storage blocked, the Profiles panel says profiles won't be kept after this visit.
- **Saving over an existing name asks first. Delete profile and Factory reset ask first**, and Factory reset puts the Turn Sim back to V6's defaults without reloading the app (#31). The name box starts empty, not "NFTC Default".
- V6's saved profiles were kept by the old single file in its own browser storage, which the new site can't read. Nothing to migrate.
- **Export CSV** (in Profiles): one row per 0.05 s step over the whole run, with time, the pair distances that exist, minimum separation and 1-3 closure in ft/s, V6's columns (`turn_spacing.csv`). The download link is released after use.

## What the Turn Sim needs from `core`

Already there, used as they are: `limitG`, `MIN_TURN_G`, `turnRadiusFt`, `turnRateRadPerSec`, `bankDegFromG`, `ktToFtps`, `formatNm`, `distance`, `degToRad`, `radToDeg`, `wrapDeg180`, `relativeBearingDeg`, `clockToRelativeDeg`, `compassDegToHeadingRad`, `headingRadToCompassDeg`, `formationAxes`, `classifyTurnSimPosition`, `V6_STANDARDS`.

Needed from the Flight math core thread:

- **SPEC-core Task 12 (D74):** the Turn Sim's G correction (V6 line 1583) as a `core` function, pinned to V6's order first (limit, then correct, NaN below 1 G), then with the 1.01 floor after the correction as its own commit. The engine calls it in step 2 above. It's needed before engine task 7 (see the todo).

Nothing else. The rest of the Turn Sim math (slots, planning, cues, rear check, integrator) is used only here, so it stays in `src/modules/turn-sim/engine/`, pinned by this module's golden tests the same way `core` is pinned (`tests/golden/v6-source.js`, read-only). If the Flight math core thread would rather hold any of it, it moves before it's written.

## Module structure

```
src/modules/turn-sim/
  README.md            what's where, and how to change common things (R8)
  index.js             mount(root, app): builds the screen, wires settings to the engine; unmount cleans up
  settings.js          the versioned settings schema and V6's defaults; no page access
  engine/              pure, Node-tested, no page access
    formation.js       slot tables, position errors (D42), #2's side (D48)
    plan.js            turning order, directions (D41), time/clock/auto timing (D43, D44), offset-box plan
    cues.js            clock-cue crossing, cue checks
    rear-check.js      the offset box's rear-element check turn
    solver.js          V6's solver sweep (Q41)
    step.js            one fixed step: G (core, D74), turn, move
    run.js             a run: start, continue a leg, history by time, CSV rows
  layout.js            the three columns, panels, playback bar
  view.js              drawing: grid, MOA box, trails, breadcrumbs, 3/9 lines, turn circles, clock marks, labels
  graph.js             the spacing graph (Q41), drawn only while open
  readouts.js          Formation card and More detail rows from engine results; no page access
  profiles.js          named profiles and the startup default over app.storage
  turn-sim.css         scoped under [data-module="turn-sim"]
tests/unit/turn-sim/    engine, settings, readouts, profiles
tests/golden/turn-sim-*.test.js   engine vs V6's own functions, run unchanged
tests/e2e/turn-sim.spec.js
docs/checklists/turn-sim.md
```

## Commands

```
npm run dev                 # the Turn Sim at http://localhost:5173/#/turn-sim
npm test                    # unit and golden tests (node --test)
npm run test:e2e            # browser tests
npm run build && npm run preview   # measure a production build
python3 tools/rebuild_original.py /tmp/v6.html   # V6, to compare side by side
```

## Code style

As in `core`: plain ES modules, pure functions, units in names, and a comment naming the V6 line each ported piece came from. The engine takes a plain scenario and returns plain state, so V6's page globals (`$('spacing').value`, `ac`, `t`) become arguments.

```js
// src/modules/turn-sim/engine/plan.js
/**
 * Auto timing step between aircraft, in seconds (V6 computeAutoDelay, line 1369,
 * changed by D44 to spacing ÷ speed × cot(half the turn angle)).
 */
export function autoDelayStepSec(spacingFt, speedFtps, turnRad) {
  return (Math.abs(spacingFt) / Math.max(1, speedFtps)) / Math.tan(Math.abs(turnRad) / 2);
}
```

## Testing strategy

1. **Golden first (D10, R9).** Before any engine function is written, a golden test runs V6's own function, cut out of `original/shell.html` by `tests/golden/v6-source.js` with a small fake of the page's boxes (`$`) as its prelude, next to the port. Then whole runs: every formation × turn × direction × timing at V6's defaults and a set of seeded settings, stepped at 0.05 s, compared position by position each second. Exact match, no tolerance.
2. **Each decision is its own commit** that changes the pinned value on purpose and names its D#: D41 (toward/away), D42 (wide/tight), D43 (auto order), D44 (auto step), D45 (compass heading), D48 (#2's side), D74 (G floor, in `core`). A test states each: for example, auto timing at the defaults rolls out line abreast at 6,000 ft, within a tolerance the test states and explains.
3. **Unit tests** (`tests/unit/turn-sim/`): settings (defaults, bad values refused, versioned, profile round trip keeps everything), readouts (two-ship has no NaN), history by time, a setup change resets the run, a new leg resets the rear check and breadcrumbs, the clock tolerance is used.
4. **Cross-check with V6 in a browser.** `/mnt/project-files/flight-math-check/turnsim.js` already drives V6's real Turn Sim in Playwright; its numbers (presets, wide/tight, toward/away, auto timing) are copied into the golden tests as a second check.
5. **Browser tests** (`tests/e2e/turn-sim.spec.js`, Playwright, failing on any console error, R7):
   - Open the Turn Sim: fitted, nothing overlapping at 1366 × 768 and 1920 × 1080, with every panel open (R2, #30).
   - A first visit shows only the essentials (R22); Reset layout restores them.
   - Every button does something (R3).
   - Play, change a setting mid-run: the run stops and resets (#31).
   - Save a profile with errors and a rear check, reload, load it: identical (#31).
   - Storage blocked: the Turn Sim opens and plays (#33).
   - Leave the Turn Sim: no frames, timers or listeners left (R4, #39).
6. **Sign-off checklist** `docs/checklists/turn-sim.md` (R21), for Patrick or Dad: fly each formation and turn, compare a few rollouts with V6 side by side, and check the D41 to D45 fixes look right.

## Performance

Following performance-optimization: measure first, log each attempt in the PR. Target: 60 frames per second at 4× with all layers on at 1920 × 1080 on a mid-range laptop, and no drawing while paused. At 4× that's about 5 steps a frame, which is small; the risk is drawing (trails, breadcrumb labels), so trails are drawn as one path and readouts update at most 10 times a second.

## Security

A profile is data from this browser only, but it's still checked field by field on load (finite numbers in range, known option values), and profile names go on screen through `textContent` (ui-kit `h()`). There's no file import and no network use.

## Skills used

From `.claude/skills/README.md`, at each step:

| Step | Skill |
|---|---|
| This spec | spec-driven-development |
| The task plan (`tasks/turn-sim/`) | planning-and-task-breakdown |
| Every engine task | test-driven-development (golden test against V6 first, then each decision as its own commit), incremental-implementation |
| The screen | frontend-ui-engineering with `.claude/references/accessibility-checklist.md`, incremental-implementation, `/run` |
| Smooth animation | performance-optimization with `.claude/references/performance-checklist.md` |
| Profiles loaded from storage | security-and-hardening (checking saved data), `/security-review` |
| Red CI, a golden mismatch, a browser error | debugging-and-error-recovery |
| Before any PR leaves draft | code-review-and-quality, `/code-review` |
| Polish | code-simplification, `/simplify` |

Each PR description lists the skills it applied.

## Boundaries

- **Always:** pin V6 before moving any number; take shared math from `core`; keep the module inside `src/modules/turn-sim/`; run `npm test` before each commit; cite the V6 line.
- **Ask first:** any change to a number V6 shows beyond D41 to D45, D48, D74 and Patrick's answers to Q41 to Q47; the hook and 4-ship shackle pictures before their commits; adding a package.
- **Never:** edit `original/`, `src/core/`, `src/ui-kit/` or `src/storage/` (changes go to their threads through the coordinator); keep a timer or animation loop outside the ui-kit scheduler; touch `localStorage` directly.

## Success criteria

- Every engine function and whole-run scenario has a golden test against V6, and each of D41 to D45, D48, D74 and the flight changes from Q43 (hook), Q44 (shackle, #4 solver), Q45 (clock cue selectors) and Q47 (rear check) is its own commit with a test that states it.
- R2, R3, R4, R7 and R22 pass their browser tests on the Turn Sim route; results are the same at any frame rate and playback speed.
- Issues #15, #16, #17, #30, #31 and #32 are closed or reduced to the item still with Dad (the offset box clock cue, Q44c), and the Turn Sim parts of #29, #33, #34, #35, #39 and #43 are gone.
- Patrick or Dad signs off the checklist on the live site.

## Answered questions

Patrick answered all seven on 2026-09-30 (in the "Open questions explained" thread; mapping in `/mnt/project-files/questions/answers-2026-09-30.md`). Each flight change lands as its own commit after V6 is pinned (D10).

| Question | Answer | Where in this spec |
|---|---|---|
| Q41 (TS1) hidden cards | Bring back the Graph, Solver and Correction model, each behind a toggle, off by default. | The screen; Readouts |
| Q42 (TS2) start heading | 000, flying up the screen. | Starting a run |
| Q43 (TS3) hook and in-place 90 | Don't merge. Hook: same direction through 180°, fuselages lined up in the middle. In-place 90: a 90° turn. | Turns |
| Q44a (TS4) shackle | Ends on the original heading, same spacing, each aircraft on the opposite side: an X from above. | Turns |
| Q44b (TS4) offset box #4 | Finish the ground-track solver so #4 works out its own timing. | Timing |
| Q44c (TS4) offset box clock cue | Keep the on-screen message; ask Dad which cue #3 and #4 should use; revise later. | Timing |
| Q45 (TS5) clock cue selectors | Wire them up. | Timing |
| Q46 (TS6) standards | Follow the debrief's edited standards. | Assumptions; Readouts |
| Q47 (TS7) rear check | Start at the set time or once #3 and #4 finish turning, whichever is later. | Timing |

## Open questions

- **For Dad (Q44c):** which cue should #3 and #4 use in the offset box, since they never see 5:30? Until then, the on-screen message.
- **For Patrick, before those commits:** the hook's and the 4-ship shackle's exact rollout pictures, drawn from the rebuilt engine.
