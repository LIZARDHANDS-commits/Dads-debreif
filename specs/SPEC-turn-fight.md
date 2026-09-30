# Spec: `turn-fight`, the BFM Turn Fight

Status: **draft, for Patrick to approve.** Changes go through a pull request. Module id `turn-fight` in [`SPEC.md`](../SPEC.md). Requirement IDs (R#), decisions (D#) and questions (Q#) refer to the plan doc: https://claude.ai/code/artifact/29712036-a126-43c3-ac39-57ba919ff102

The build starts when the coordinator says it's the Turn Fight's turn, after the debrief and the Turn Sim. Until then this spec and [`tasks/turn-fight/`](../tasks/turn-fight/plan.md) are the work.

## Objective

A small teaching tool for the basic fighter manoeuvre (BFM) turn fight. Two aircraft, Blue and Red, start head-on, fly to the merge, and then turn: in the same direction (a 2-circle fight, won on turn **rate**) or in opposite directions (a 1-circle fight, won on turn **radius**). The student sets each aircraft's speed and G and watches who gets their nose on the other first.

Users are T-6 instructors and students, on a desktop or laptop (D6). They should be able to:

1. Pick a 1-circle or 2-circle fight, the start separation, and each aircraft's speed and G.
2. Play, pause and reset the fight, at 0.5× to 4×.
3. Read each aircraft's turn rate and turn radius, and see who gets their nose on first and when.
4. Optionally let the first aircraft to get its nose on chase the other, and optionally fly the fight with climb or dive angles and see a side view.

V6 does all of this in its "Turn Fight" tab (lines 778 and 4232 to 4294 of `original/shell.html`). The rebuild keeps V6's fight and its numbers, fixes the bugs the audit found (issue #20, and #34, #35, #39 on every screen), and shows only the essentials by default (R22).

## Assumptions

1. It's the same simple model as V6: each aircraft flies at a constant speed and a constant G, in a coordinated level turn, as a point. There's no energy, drag, or thrust. The screen says so in one line, as V6's help card does.
2. The fight is a pure calculation, kept apart from the drawing (`sim.js`), so it can be tested against V6's own code in Node (R9). The drawing never changes a number.
3. Every piece of turn math comes from `core` (see What the Turn Fight needs from `core`). The module keeps only the fight itself: the merge, the turn directions, the chase, and first nose-on.
4. Nothing is loaded from the network, so the Turn Fight works offline after the first visit (R6).
5. Open questions below never block the build. Each defaults to V6's behaviour until it's answered.

## Tech stack

Plain JavaScript ES modules with no framework and no new packages, as in the rest of the app (SPEC.md). Drawing is on a Canvas 2D through ui-kit's `createCanvasSurface`. Tests use Node's `node:test` and the Playwright set-up the app frame already has.

## Commands

```
npm run dev                                   # the app with live reload; open the Turn Fight card
npm test                                      # unit and golden tests (node --test)
node --test tests/golden/turn-fight-sim.test.js   # just the V6 comparison
npm run test:e2e                              # Playwright browser tests
npm run build && npm run preview              # a local build, to measure (performance-optimization)
python3 tools/rebuild_original.py /tmp/v6.html    # V6, to compare side by side
```

## Code style

Pure functions with units in their names, turn math from `core`, and a comment naming the V6 line each piece comes from, so the port can be checked by eye:

```js
// src/modules/turn-fight/sim.js
import { KT_TO_FTPS, FT_PER_NM } from '../../core/units.js';

/** Seconds from the start to the merge (V6 `reset`, line 4240). */
export function mergeTimeSec(separationNm, blueKt, redKt) {
  return (separationNm * FT_PER_NM) / ((blueKt + redKt) * KT_TO_FTPS);
}
```

- `sim.js` never reads the page, settings or the clock. It takes a plain setup object and returns a plain state, so the same numbers come out in Node and in the browser.
- No `innerHTML`, `!important`, `setInterval` or `requestAnimationFrame` in the module (ui-kit rules, checked by `tests/unit/source-rules.test.js`).

## The screen

Three columns at 1366 × 768 and up, none covering another (R2), each side column collapsed with a real button (ui-kit `panel.js`). No side rails and no Tab-key tricks (#34, #35).

```
┌ Fight setup ──────────┐┌ Stage ───────────────────────────────┐┌ Result ─────────────────┐
│ Fight  [1-circle|2-c] ││ ▶ Pause  Reset  1× ▾   T+34.6  2-CIRCLE ││          Blue    Red    │
│ Start separation 2 NM ││                                       ││ Turn rate 19.2°/s 19.2°/s│
│                       ││           top-down view               ││ Radius  1,106 ft 1,106 ft│
│ Blue  220 KTAS  4.0 G ││        (trails, aircraft, MERGE)      ││                         │
│ Red   220 KTAS  4.0 G ││                                       ││ Range 0.63 NM           │
│                       ││                                       ││ First nose-on           │
│ ☐ First nose chases   ││                                       ││  Blue at +18.2 s        │
│ ☐ Climb and dive      ││                                       ││ ▸ More detail           │
│ ▸ About this model    ││                                       ││                         │
└───────────────────────┘└───────────────────────────────────────┘└─────────────────────────┘
```

| Shown by default | Behind a checkbox (off by default) or a collapsed "More …" panel (R22) |
|---|---|
| Fight type (1-circle or 2-circle, a two-way choice), start separation, Blue and Red speed and G | **First nose chases** (V6's "First nose follows • defender turns inside"), off as in V6 |
| Play or Pause, Reset, playback speed, the fight time (T+), the phase (HEAD-TO-HEAD, then 1-CIRCLE or 2-CIRCLE) | **Climb and dive** (V6's "Vertical maneuvering"), off as in V6. Turning it on shows Blue and Red pitch, the side-view panel under the stage, and the side view's height scale (1×, 2×, 4×) |
| The top-down view: grid, trails, both aircraft, the MERGE mark, the first nose-on line | **More detail**: G, 360° time, each aircraft's angle-off, time since the merge, and with Climb and dive on, each aircraft's height change and the height between them |
| Result: turn rate and turn radius for each aircraft, range, first nose-on | **About this model**: V6's help text on 1-circle, 2-circle and first nose-on, plus the one-line model statement |

- **The fight changes only when the setup changes.** Changing the fight type, separation, a speed, a G, First nose chases, Climb and dive, or a pitch resets the fight, as in V6. Playback speed and the side view's height scale are display settings and never reset it (V6 reset on the height scale, #20).
- **Settings are remembered** in this browser (`app.storage`), and "Reset to V6 defaults" in More detail puts back V6's setup: 2-circle, 2 NM, both 220 KTAS and 4 G, both extras off, pitch 0°, height scale 2×, 1×.
- **Keyboard** (through `app.keys`, only while the Turn Fight is open and never while typing): Space plays or pauses, Home resets. Tab moves between controls as normal.
- **Colours** stay V6's: Blue #58a6ff, Red #ff6b6b, the first nose-on line #ffcc66. Each aircraft is also labelled B or R on the view and in every table, so colour is never the only signal.
- **Number boxes** use ui-kit's number rule, so a blank, zero, infinite or out-of-range entry is refused with a message and the last good value stays. The ranges are: speed 60 to 400 KTAS, G 1.1 to 9, start separation 0.5 to 10 NM, pitch −60° to +60°. V6 read a blank or 0 as its default (220 kt, 4 G, 2 NM) and had no limits except on pitch.

## What V6 does, and what the rebuild keeps

### The fight (`sim.js`)

All of this is V6's, ported as it is and pinned by a golden test (R9):

- **Performance** (V6 `M`, line 4237): speed in ft/s from KTAS, G limited to 1.01 and up, turn radius V²/(g√(G²−1)) and turn rate g√(G²−1)/V. At 220 KTAS and 4 G that's 1,106 ft and 19.2°/s, 18.7 s for 360°.
- **Start and merge** (line 4240): the aircraft start the set separation apart, heading at each other along the x axis, Blue on the left heading east and Red on the right heading west. They meet at T+ separation ÷ (V1 + V2): 16.4 s at V6's defaults.
- **Turns after the merge** (lines 4252 to 4268): Blue turns left (counter-clockwise, top-down). In a 2-circle fight Red also turns left; in a 1-circle fight Red turns right.
- **First nose-on** (`checkFirstNose`, line 4241): after the merge, the first aircraft whose nose points within 5° of the other (V6's "angle-off") is marked, with the time since the merge and a dashed yellow line between the two aircraft at that moment.
- **First nose chases** (lines 4255 to 4266): once first nose-on is marked, each aircraft turns toward the other at no more than its own turn rate. With Climb and dive on, each also pitches toward the other at the same rate, within ±60°.
- **Climb and dive** (lines 4248 and 4250): before the merge both fly level. At the merge each takes its set pitch and holds it (unless it's chasing), climbing or descending at speed × sin(pitch) while its track over the ground shrinks by cos(pitch). The turn rate stays the level-turn rate (see Q-TF3).

V6's answers on its own code, run in Node at a 0.02 s step, which the golden test will pin:

| Setup (4 G, 2 NM unless stated) | Merge | First nose-on |
|---|---|---|
| 2-circle, both 220 KTAS | T+16.4 s | +18.2 s, a tie (see Q-TF1) |
| 1-circle, both 220 KTAS | T+16.4 s | +9.1 s, a tie (see Q-TF1) |
| 2-circle, Blue 250 and Red 200 KTAS | T+16.0 s | Red at +14.4 s |
| 2-circle, Blue at 5 G | T+16.4 s | Blue at +12.6 s |

Changes that don't change a number:

- **One fixed step.** V6 moves the fight in steps of up to 0.02 s but cuts the last step of each screen frame short, so the fight comes out slightly different at 50, 60 or 30 frames a second (by up to about 0.7 ft after 40 s, and first nose-on can move by one step). The rebuild always moves in whole 0.02 s steps on its own fight clock and carries the remainder to the next frame. That gives V6's exact answers at 50 frames a second, the same answers on every screen, and a fight that can be tested.
- **The fight clock runs only while the Turn Fight is open.** V6 kept stepping and drawing the fight behind other screens (#39). Here the scheduler stops it when the module closes (R4), and it resumes from Reset when opened again.
- **Frame time** keeps V6's limit: each frame moves the fight by at most 0.08 s × the playback speed, so a slow or hidden frame doesn't jump the fight.

### The drawing

Kept from V6: the dark stage, the 1 NM grid, the trails, the two aircraft as arrowheads pointing along their heading, the MERGE mark at the merge point, the dashed first nose-on line and its label, and a view that keeps the whole fight in sight (it zooms out as the trails grow, and never shows less than 3,000 ft from the centre to the nearest edge, as V6's `mx`).

Changes:

- **Draw on change only.** V6 drew every frame for ever, playing or not (#39, #43). The rebuild draws when the fight moves, a setting changes, or the window resizes (ui-kit `createCanvasSurface`), so a paused fight uses no CPU.
- **Resizing** a column or the window resizes the canvas (a `ResizeObserver`, #36).
- **The grid** fills the view at any zoom. V6 drew only ±4 NM of grid lines.
- **Trails** keep a point every 0.1 s of fight time, whatever the frame rate. V6 kept one per screen frame, so its trails grew without limit.
- **The fight stops at 10 minutes.** V6 had no end, and after about 15 minutes of Climb and dive its side view crashed the page (a `Math.min(...)` over every trail point, #20). At T+10:00 the rebuild pauses and says "Fight stopped at 10 minutes. Reset to fly it again." Ten minutes is about 30 full turns at 4 G.
- **The side view's height scale works.** In V6, 1×, 2× and 4× drew exactly the same picture, because the scale cancelled out (#20). Here the height is drawn against a fixed range that grows with the fight, times the scale, and stays inside the panel.

### Readouts

Kept from V6, with the same rounding: speed (kt), G (1 decimal), turn rate (1 decimal, °/s), radius (whole ft), 360° time (1 decimal, s), range (2 decimals, NM, straight-line including height), each aircraft's angle-off (whole °), time since merge (1 decimal, s), height changes and height between them (whole ft), first nose-on ("BLUE @ +18.2 sec", shown as "Blue at +18.2 s").

- The readouts are built as text (ui-kit `h`), never as HTML. V6 wrote them with `innerHTML` every frame.
- They update at most 10 times a second while playing, and once when the fight pauses.

### Removed (R3)

| V6 control | Why it goes |
|---|---|
| "Vertical maneuvering" as an OFF/ON list | Becomes the Climb and dive checkbox; the pitch boxes and side view show only when it's on |
| Side collapse rails and the Tab shortcut | They floated over the Turn Fight and did nothing here (#34, #35). Replaced by the columns' collapse buttons |

## What the Turn Fight needs from `core`

Everything is already in `core` and pinned against Turn Fight's own copies, so `core` needs nothing new:

| Turn Fight in V6 | `core` | Pinned by |
|---|---|---|
| `KT`, `G`, `NM` (line 4234) | `KT_TO_FTPS`, `G_FTPS2`, `FT_PER_NM` | `tests/golden/core-units.test.js` |
| `M` (line 4237): G limit, radius, rate | `limitG`, `turnRadiusFt`, `turnRateRadPerSec` | `core-flight-math.test.js` (rate within 1e-15, because V6 works it out in a different order) |
| `wrapH` (line 4239) | `wrapPi` | `core-angles.test.js`, exact |
| `ad` and `ao` (lines 4238 and 4239) | `absAngleDeg`, `headingRad` | `core-angles.test.js` (`ad` within 1e-10°) |

The fight itself (merge, turn directions, chase, first nose-on) is this module's `sim.js`, as the Turn Sim owns its integrator in the module map (SPEC.md). It uses only the `core` functions above. If the Flight math core thread would rather own it, it moves to `core` unchanged.

## Questions for Patrick or Dad

Each has a recommendation and a default. The default is V6's behaviour, so none blocks the build. Their Q numbers are given when they're logged in the plan doc.

**Q-TF1. Who gets their nose on first when it's a tie?** In an even fight (same speed and G) both noses come on at the same moment. V6 then names the one whose angle is smaller by about a millionth of a millionth of a degree, which is rounding noise: Blue wins at 60 frames a second, Red at 50. *Recommendation:* when both are within 5° in the same step, show "Both at +18.2 s" and draw the line labelled BOTH. The chase is unaffected (in V6 both aircraft already turn toward each other). *Default until answered:* V6's rule. The golden test leaves exact ties out, because rounding noise can't be pinned.

**Q-TF2. The jump at the merge.** V6 starts both aircraft the same distance from the centre, but when their speeds differ they meet off-centre (675 ft off at 250 and 200 KTAS, 2 NM). At the merge V6 then moves both to the centre, so the trails jump. *Recommendation:* start each aircraft so they meet at the centre (Blue at −V1 ÷ (V1 + V2) × separation, Red at +V2 ÷ (V1 + V2) × separation). Everything after the merge stays exactly V6's; only the lines before it move. *Default:* V6's start and jump.

**Q-TF3. Climb and dive physics (for Dad).** With Climb and dive on, V6 keeps the level turn rate and the full speed at any pitch, and climbs with no loss of energy. At 30° pitch, 220 KTAS and 4 G its ground track has a 958 ft radius, where a real 4 G turn at a 30° climb would be about 823 ft and 22.4°/s, not 19.2°/s. The result table still shows the level numbers. *Recommendation:* keep V6's simple model, since the tool teaches geometry, and label the side view "Simplified: constant speed and turn rate". A true climbing turn, and energy, would be a future feature. *Default:* V6's model, with that label.

**Q-TF4. "Angle-off" (for Dad).** V6's "angle-off" is the angle between an aircraft's nose and its line of sight to the other, which BFM usually calls antenna train angle (ATA). True angle-off is the difference in headings: at a head-on merge V6 shows 0° where angle-off is 180°. It's also measured top-down only, so with Climb and dive on, first nose-on can be called with the other aircraft thousands of feet above or below the nose. *Recommendation:* call it "Off-nose angle (ATA)", add true angle-off in More detail (`core`'s heading crossing angle), and with Climb and dive on, measure off-nose angle in 3D. *Default:* V6's name and top-down measure.

## Project structure

```
src/modules/turn-fight/
  index.js        mount and unmount; wires settings, scheduler, keys
  sim.js          the fight: pure, no page access (createFight, stepFight, FIGHT_STEP_SEC)
  readouts.js     turns a fight state into readout lines (pure)
  view.js         top-down drawing on a ui-kit canvas surface
  profile.js      the side view (Climb and dive)
  layout.js       the three columns, panels and controls
  turn-fight.css
  README.md       what's here and where to change common things (R8)
tests/unit/turn-fight/      sim.test.js readouts.test.js (known answers, the 10-minute stop, the fixed step)
tests/golden/turn-fight-v6.js         runs V6's own Turn Fight script in Node with a stand-in page
tests/golden/turn-fight-sim.test.js   V6 vs sim.js, step by step, on a grid of setups
tests/e2e/turn-fight.spec.js          play, pause, reset, controls, no overlap, stops when closed
docs/checklists/turn-fight.md         the sign-off checklist (R21)
```

Adding the module to `src/shell/registry.js` (its `load`) and `tests/e2e/` go through the app frame thread, which owns those folders.

## Skills used

Patrick asked every thread to name the repo skills it uses (2026-09-30). These follow `.claude/skills/README.md`, and each PR lists the ones it applied.

| Step | Skill (`.claude/skills/`) | How it's used here |
|---|---|---|
| This spec | spec-driven-development | The six core areas, assumptions listed up front, and Patrick's approval before any code |
| The task plan | planning-and-task-breakdown | `tasks/turn-fight/`: vertical slices, each task with acceptance, verify and at most about 5 files, checkpoints between PRs |
| Tasks 1 and 2 (the fight, readouts) | test-driven-development | The golden test against V6's own script is written first and must fail before `sim.js` exists. Each answered question starts as a failing test that states the change from V6 (D10) |
| Every task | incremental-implementation | One task per commit, each leaving the app working; `npm test` before each commit |
| Tasks 3 to 5 (the screen) | frontend-ui-engineering, with `.claude/references/accessibility-checklist.md` | Labelled controls, keyboard use, colour never the only signal, R22's essentials-first layout, tokens instead of `!important` |
| Tasks 4 and 5 (drawing and playback) | performance-optimization, with `.claude/references/performance-checklist.md` | Measure a 4× fight with long trails at 1920 × 1080 on a local build; one change at a time; log each attempt in the PR |
| When something breaks | debugging-and-error-recovery | A golden mismatch or red CI: reproduce, find the step where V6 and `sim.js` part, fix, add a regression test |
| Before each PR leaves draft | code-review-and-quality, plus `/code-review` | The five-axis review with severity labels, and `.claude/references/definition-of-done.md` |
| Polish, before sign-off | code-simplification, plus `/simplify` | Tidy without changing a number (the golden test must still pass) |

security-and-hardening doesn't apply: the Turn Fight opens no files and fetches nothing. The only outside input is what people type, which ui-kit's number rule checks, and settings read back from browser storage, which are checked against the same ranges before use.

## Testing strategy

1. **Golden test first (R9, D10).** `turn-fight-v6.js` runs V6's own `bfmFight` script, unchanged, with a stand-in page (input values, a canvas that draws nothing), and reads its fight state after each step. `turn-fight-sim.test.js` runs V6 and `sim.js` side by side at 0.02 s steps for 10 minutes of fight time on a grid of setups: both fight types; First nose chases off and on; Climb and dive off and on with several pitches; equal and unequal speeds and G. Positions, headings, pitch, height, time, merge and first nose-on must agree within 1e-9 ft and 1e-12 rad (the turn rate differs from V6's in the last digit). Exact ties are left out (Q-TF1).
2. **Any answered question lands as its own commit** after the golden test passes on V6's behaviour, and that commit changes the golden test to say exactly what differs (as D39 did in `core`).
3. **Unit tests** check meaning: 220 KTAS at 4 G turns at 19.2°/s on a 1,106 ft radius; a 2-circle fight with the faster turn rate gets its nose on first; the fight is the same whatever the frame rate; the fight stops at 10 minutes; readouts round as V6 does.
4. **Browser tests** (Playwright): every control does something (R3); nothing overlaps at 1366 × 768 and 1920 × 1080 (R2); closing the module leaves no frames or timers running (R4); no console errors (R7).
5. **Sign-off checklist** (R21), run by Patrick or Dad against V6 side by side.

## Boundaries

- **Always:** keep V6's numbers unless a logged decision says otherwise; take turn math from `core`; run `npm test` before each commit.
- **Ask first:** any change to the fight's math or what it shows (Q-TF1 to Q-TF4 and anything new); a new package.
- **Never:** edit `original/`; fold a fix into the port that pins V6; read a number from an input box inside `sim.js`.

## Success criteria

- The golden test passes on every setup in its grid, and every change from V6 is a logged decision.
- A student can set up, play and read a fight with only the default controls showing (R22).
- Every control does something, nothing overlaps, and nothing runs after the module closes (R2, R3, R4).
- Patrick or Dad signs off the checklist (R21).

## Plan

The tasks, checkpoints and risks are in [`tasks/turn-fight/plan.md`](../tasks/turn-fight/plan.md) and [`todo.md`](../tasks/turn-fight/todo.md).
