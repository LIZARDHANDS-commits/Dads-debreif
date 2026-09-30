# Spec: `turn-fight`, the BFM Turn Fight

Status: **approved by Patrick on 2026-09-30** ("Spec turn flight approved", in the Turn Fight spec thread). Patrick answered its four questions (Q48 to Q51) on 2026-09-30; each change lands as its own commit after V6 is pinned. **Energy mode (FF23, D112) approved by Patrick on 2026-09-30** ("Energy mode approved", 06:16Z, in this thread). **Start geometry and altitudes (R28), the SMM additions to Energy mode (level turn at the deck, stall cost, throttle, pursuit), and the defaults-and-simplicity rule approved by Patrick on 2026-09-30** ("Agreed", 07:13Z, in this thread). Changes go through a pull request. Module id `turn-fight` in [`SPEC.md`](../SPEC.md). Requirement IDs (R#), decisions (D#) and questions (Q#) refer to the plan doc: https://claude.ai/code/artifact/29712036-a126-43c3-ac39-57ba919ff102

The build starts when the coordinator says it's the Turn Fight's turn, after the debrief and the Turn Sim. Until then this spec and [`tasks/turn-fight/`](../tasks/turn-fight/plan.md) are the work.

## Objective

A small teaching tool for the basic fighter manoeuvre (BFM) turn fight. Two aircraft, Blue and Red, start apart (head-on unless the student sets another start), fly to the pass (the merge, head-on) and then turn, or turn at once if the student asks: each toward the other (a 2-circle fight, won on turn **rate**) or Red away from Blue, so the two share one circle (a 1-circle fight, won on turn **radius**). Head-on these are V6's same and opposite directions. The student sets each aircraft's speed and G and watches who gets their nose on the other first.

Users are T-6 instructors and students, on a desktop or laptop (D6). They should be able to:

1. Pick a 1-circle or 2-circle fight, the start separation, and each aircraft's speed and G. Optionally change the start geometry (aspect, off-nose angle and height) from V6's head-on start (see Start geometry and altitudes).
2. Play, pause and reset the fight, at 0.5× to 4×.
3. Read each aircraft's turn rate and turn radius, and see who gets their nose on first and when.
4. Optionally let the first aircraft to get its nose on chase the other, and optionally fly the fight with climb or dive angles and see a side view.
5. Optionally switch on **Energy** mode, where each T-6 uses the vertical at full power (pitch back, slice, Immelmann or split S) to reach the 160 KIAS max-performance turn, trading speed and height the way the real aircraft does (see Energy mode).

V6 does all of this in its "Turn Fight" tab (lines 778 and 4232 to 4294 of `original/shell.html`). The rebuild keeps V6's fight and its numbers, fixes the bugs the audit found (issue #20, and #34, #35, #39 on every screen), and shows only the essentials by default (R22).

## Assumptions

1. By default it's the same simple model as V6: each aircraft flies at a constant speed and a constant G, in a coordinated level turn, as a point. There's no energy, drag, or thrust. The screen says so in one line, as V6's help card does. Energy mode, off by default, is the only place with energy, drag and thrust.
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
│ ☐ Energy (T-6)        ││                                       ││                         │
│ ▸ Turn Fight settings ││                                       ││                         │
│ ▸ About this model    ││                                       ││                         │
└───────────────────────┘└───────────────────────────────────────┘└─────────────────────────┘
```

| Shown by default | Behind a checkbox (off by default), in the closed **Turn Fight settings** menu, or in a collapsed "More …" panel for extra readouts (R22) |
|---|---|
| Fight type (1-circle or 2-circle, a two-way choice), start separation, Blue and Red speed and G | **First nose chases** (V6's "First nose follows • defender turns inside"), off as in V6 |
| Play or Pause, Reset, playback speed, the fight time (T+), the phase (HEAD-TO-HEAD, or TO THE PASS for other starts, then 1-CIRCLE or 2-CIRCLE) | **Climb and dive** (V6's "Vertical maneuvering"), off as in V6. Turning it on shows Blue and Red pitch beside their speed and G, and the side-view panel under the stage. The side view's height scale (1×, 2×, 4×) is in Turn Fight settings |
| The top-down view: grid, trails, both aircraft, the MERGE mark (PASS when the jets pass more than about 0.25 NM apart), the first nose-on line | **More detail**: G, 360° time, each aircraft's off-nose angle (ATA), and true angle-off (one number), time since the pass (V6 says merge; this tool counts from the pass, which is the merge when head-on), and with Climb and dive on, each aircraft's height change and the height between them |
| Result: turn rate and turn radius for each aircraft, range, first nose-on | **Energy (T-6)**, off by default: see Energy mode for what it shows |
| A warning beside a G box when that G is more than a T-6 can pull at that speed (see T-6 limit warning) | **About this model**: V6's help text on 1-circle, 2-circle and first nose-on, plus the one-line model statement |
| | **Turn Fight settings** (Patrick, 2026-09-30 07:20Z): one menu, closed by default, built with ui-kit's `createSettingsMenu` (SPEC-ui-kit, "Settings menu"). It holds every tuning number, in sections: **Start geometry** (head-on by default: Red off Blue's nose, Red's aspect angle, Red's starting height, when the turns start; see Start geometry and altitudes); **Display** (the side view's height scale and Paint, Harvard or Ship colours); with Energy on, **Energy** (see More energy settings in Energy mode) and **Model settings for checking**. Its Reset button is "Reset to V6 defaults". It opens in the page flow and never covers a control |

- **The fight changes only when the setup changes.** Changing the fight type, separation, a speed, a G, First nose chases, Climb and dive, or a pitch resets the fight, as in V6. Playback speed and the side view's height scale are display settings and never reset it (V6 reset on the height scale, #20).
- **Settings are remembered** in this browser (`app.storage`), and "Reset to V6 defaults" in Turn Fight settings puts back V6's setup: 2-circle, 2 NM, both 220 KTAS and 4 G, both extras off, pitch 0°, height scale 2×, 1×, and Paint back to Harvard. It keeps the View (2D or 3D), which is a mode, not a setup.
- **Keyboard** (through `app.keys`, only while the Turn Fight is open and never while typing): Space plays or pauses, Home resets. Tab moves between controls as normal.
- **Colours** stay V6's: Blue #58a6ff, Red #ff6b6b, the first nose-on line #ffcc66. Each aircraft is also labelled B or R on the view and in every table, so colour is never the only signal.
- **T-6 limit warning (simple mode).** When a set G is above what a T-6 can pull at the set speed, a warning shows beside the G box: "4.0 G is above the T-6's stall limit at 120 kt (1.9 G)" (the limit is rounded down, so the warning never understates it) or "Above the T-6's 7 G limit". The fight still flies what was set, as V6 does, so the tool can still show a generic fight. The stall limit is G = (speed ÷ 86 kt)², the sea-level stall line of the T-6A V-n diagram (manuals: formation-and-turn-numbers.md). The simple mode has no altitude, so its speed is taken as sea level, where true and indicated airspeed agree. V6's default, 220 KTAS at 4 G, is inside the limit (6.5 G), so no warning shows by default.
- **Number boxes** use ui-kit's number rule, so a blank, zero, infinite or out-of-range entry is refused with a message and the last good value stays. The ranges are: speed 60 to 400 KTAS, G 1.1 to 9, start separation 0.5 to 10 NM, pitch −60° to +60°. V6 read a blank or 0 as its default (220 kt, 4 G, 2 NM) and had no limits except on pitch.

## What V6 does, and what the rebuild keeps

### The fight (`sim.js`)

All of this is V6's, ported as it is and pinned by a golden test (R9):

- **Performance** (V6 `M`, line 4237): speed in ft/s from KTAS, G limited to 1.01 and up, turn radius V²/(g√(G²−1)) and turn rate g√(G²−1)/V. At 220 KTAS and 4 G that's 1,106 ft and 19.2°/s, 18.7 s for 360°.
- **Start and merge** (line 4240): the aircraft start the set separation apart, heading at each other along the x axis, Blue on the left heading east and Red on the right heading west. They meet at T+ separation ÷ (V1 + V2): 16.4 s at V6's defaults.
- **Turns after the merge** (lines 4252 to 4268): Blue turns left (counter-clockwise, top-down). In a 2-circle fight Red also turns left; in a 1-circle fight Red turns right.
- **First nose-on** (`checkFirstNose`, line 4241): after the merge, the first aircraft whose nose points within 5° of the other (V6's "angle-off", the off-nose angle after Q51) is marked, with the time since the merge and a dashed yellow line between the two aircraft at that moment.
- **First nose chases** (lines 4255 to 4266): once first nose-on is marked, each aircraft turns toward the other at no more than its own turn rate. With Climb and dive on, each also pitches toward the other at the same rate, within ±60°.
- **Climb and dive** (lines 4248 and 4250): before the merge both fly level. At the merge each takes its set pitch and holds it (unless it's chasing), climbing or descending at speed × sin(pitch) while its track over the ground shrinks by cos(pitch). The turn rate stays the level-turn rate (kept by Q50).

V6's answers on its own code, run in Node at a 0.02 s step, which the golden test will pin:

| Setup (4 G, 2 NM unless stated) | Merge | First nose-on |
|---|---|---|
| 2-circle, both 220 KTAS | T+16.4 s | +18.2 s, a tie (see Q48) |
| 1-circle, both 220 KTAS | T+16.4 s | +9.1 s, a tie (see Q48) |
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

Kept from V6, with the same rounding: speed (kt), G (1 decimal), turn rate (1 decimal, °/s), radius (whole ft), 360° time (1 decimal, s), range (2 decimals, NM, straight-line including height), each aircraft's off-nose angle (whole °, V6's "angle-off", renamed by Q51), time since merge (1 decimal, s), height changes and height between them (whole ft), first nose-on ("BLUE @ +18.2 sec", shown as "Blue at +18.2 s"). Whole feet get thousands separators ("1,106 ft"), and a height a hair below zero reads "0 ft" instead of V6's "-0 ft"; the numbers and rounding are V6's.

- The readouts are built as text (ui-kit `h`), never as HTML. V6 wrote them with `innerHTML` every frame.
- They update at most 10 times a second while playing, and once when the fight pauses.

### Removed (R3)

| V6 control | Why it goes |
|---|---|
| "Vertical maneuvering" as an OFF/ON list | Becomes the Climb and dive checkbox; the pitch boxes and side view show only when it's on |
| Side collapse rails and the Tab shortcut | They floated over the Turn Fight and did nothing here (#34, #35). Replaced by the columns' collapse buttons |

## What the Turn Fight needs from `core`

For the simple fight, everything is already in `core` and pinned against Turn Fight's own copies, so `core` needs nothing new:

| Turn Fight in V6 | `core` | Pinned by |
|---|---|---|
| `KT`, `G`, `NM` (line 4234) | `KT_TO_FTPS`, `G_FTPS2`, `FT_PER_NM` | `tests/golden/core-units.test.js` |
| `M` (line 4237): G limit, radius, rate | `limitG`, `turnRadiusFt`, `turnRateRadPerSec` | `core-flight-math.test.js` (rate within 1e-15, because V6 works it out in a different order) |
| `wrapH` (line 4239) | `wrapPi` | `core-angles.test.js`, exact |
| `ad` and `ao` (lines 4238 and 4239) | `absAngleDeg`, `headingRad` | `core-angles.test.js` (`ad` within 1e-10°) |

The fight itself (merge, turn directions, chase, first nose-on) is this module's `sim.js`, as the Turn Sim owns its integrator in the module map (SPEC.md). It uses only the `core` functions above. If the Flight math core thread would rather own it, it moves to `core` unchanged.

**Energy mode uses `core`'s shared T-6A performance model** (D128, Patrick 2026-09-30 06:58Z). It is built by the Flight math core thread, test-first, as SPEC-core's "API, fifth PR: T-6A performance" (tasks 14 to 17 in `tasks/flight-math/todo.md`). The Turn Fight uses `T6A_LIMITS`, `stallLimitG`, `availableG`, `iasToTasKt` and `tasToIasKt`, `excessThrustPerWeight`, `energyHeightFt` and `stepPointMass` from it, and builds none of them itself.

The moves (which bank and G each pilot uses, when a move ends) are the Turn Fight's own, in `energy-sim.js`.

## Decided changes from V6

Patrick answered the four questions this spec raised on 2026-09-30 ("agree with recommendations for the rest", with option 1 for Q50). Each lands as its own commit after the golden test pins V6's behaviour, and that commit changes the golden test to say exactly what differs (D10, task 6).

**Q48. A tie in first nose-on shows "Both".** In an even fight (same speed and G) both noses come on at the same moment, and V6 names the one whose angle is smaller by about a millionth of a millionth of a degree, which is rounding noise: Blue wins at 60 frames a second, Red at 50. Now, when both are within 5° in the same step, the result reads "Both at +18.2 s" and the line is labelled BOTH. The chase is unchanged (in V6 both aircraft already turn toward each other).

**Q49. The jets meet in the centre.** V6 starts both aircraft the same distance from the centre, so when their speeds differ they meet off-centre (675 ft off at 250 and 200 KTAS, 2 NM), and it then moves both to the centre, so the trails jump. Now Blue starts at −V1 ÷ (V1 + V2) × separation and Red at +V2 ÷ (V1 + V2) × separation, so they meet at the centre with no jump. Everything from the merge on stays exactly V6's; only the lines before it move.

**Q50. Climb and dive keeps V6's simple model.** With Climb and dive on, V6 keeps the level turn rate and the full speed at any pitch, and climbs with no loss of energy (at 30° pitch, 220 KTAS and 4 G its ground track has a 958 ft radius, where a real 4 G climbing turn would be about 823 ft and 22.4°/s). That stays, and the side view is labelled "Simplified: constant speed and turn rate". Real climbing and diving turns with energy are a future feature, outside this spec (`/mnt/project-files/questions/future-climbing-turns.md`, logged in the plan doc's Future features).

**Q51. "Angle-off" becomes "Off-nose angle (ATA)".** V6's "angle-off" is the angle between an aircraft's nose and its line of sight to the other, which BFM calls antenna train angle (ATA). True angle-off is the difference in headings: head-on, V6 shows 0° where angle-off is 180°. Now:
- The readout is called "Off-nose angle (ATA)", with V6's number while the fight is level.
- True angle-off is added under More detail (`core`'s `headingCrossAngleDeg`).
- With Climb and dive on, the off-nose angle is measured in 3D, from each aircraft's nose (heading and pitch) to the line of sight including height, so first nose-on isn't called on a jet thousands of feet above or below. At a fixed climb or dive angle the nose is never within 5° of the other jet, so first nose-on (and the chase) may not come at all (decision logged for Patrick's review). This changes first nose-on only with Climb and dive on.
- Dad is still to confirm his school uses ATA and angle-off this way; renaming back is a label change.

## 2D and 3D views (Patrick, 2026-09-30)

Patrick asked on 2026-09-30 (07:51Z, in the project chat) for a 2D/3D switch in every simulator, now. So the Turn Fight gets a 3D view of the fight beside its 2D views, as part of this build.

- **The switch.** ui-kit's shared View switch, `controls.viewSwitch()` (SPEC-ui-kit, "2D/3D switch", D141), sits on the stage toolbar next to Play: a "View" choice of 2D or 3D, seeded with `VIEW_DEFAULT` and checked against `VIEW_ALLOWED`. **2D is the default** and the choice is remembered in this browser. Switching never resets the fight or changes a number: both views draw the same fight state.
- **2D** is the top-down view and, with Climb and dive or Energy on, the side view, exactly as specified above.
- **3D** replaces the stage's drawing area with one 3D scene built from ui-kit's shared pieces (SPEC-ui-kit, "3D aircraft (three.js, D138)"):
  - both aircraft are ui-kit's CT-156 model (`createCt156Model`) at their positions, headings and pitch, painted as a Harvard by default. A **Paint** choice (Harvard or Ship colours, from `PAINT_OPTIONS`, default `PAINT_DEFAULT`) sits in the Display section of Turn Fight settings. With ship colours, Blue is #58a6ff and Red #ff6b6b; either way each aircraft keeps its B or R label;
  - bank: in the simple fight, the level-turn bank for the set G (cos bank = 1 ÷ G), toward the turn; in Energy mode, the model's own bank. The attitude goes in exactly as ui-kit says (rotation order 'ZYX', `rotation.set(-bank, -pitch, hdg)`, heading in radians from east, counter-clockwise);
  - the camera uses only ui-kit's `matchProjection`, with points placed through `altToZ`; scene light and sky come from `addLights` and `addSky`;
  - trails as lines, a ground grid, the MERGE mark and the first nose-on line; in Energy mode, the hard deck as a see-through plane;
  - heights are real: flat when Climb and dive and Energy are off, and without the 2D side view's height scale;
  - the camera orbits by drag and zooms by wheel or pinch, with three one-click views: Overhead, Chase Blue, Chase Red. It follows the fight's centre.
- **Loading.** three.js loads only when 3D is first switched on, through ui-kit's `loadThree()`, never a static import, so the 2D screen stays as fast as before.
- **When 3D can't start.** If `loadThree()` fails, the switch says "3D needs a connection the first time"; if the browser can't draw 3D it says so: "3D needs WebGL, which this browser does not have." with no WebGL at all, and "3D needs WebGL 2, which this browser does not have." when only WebGL 1 is there (three.js needs WebGL 2). Either way it stays on 2D, which keeps working. If the browser takes the WebGL context away while 3D shows (the graphics card was reset, `webglcontextlost`), the view frees everything, stops drawing and the screen goes to 2D with the note "3D stopped (the graphics card was reset); showing 2D." (simplest: no restore). The fight is not reset or stopped, and switching to 3D again starts a new context.
- **Clean up (R4).** The 3D view draws only while the fight plays or the camera moves. Switching back to 2D or leaving the module stops its drawing and frees its WebGL resources (`disposeCt156Model` for each aircraft, `sky.dispose()`, the renderer).
- **What doesn't change.** The fight engine, the turn math and every readout are the same in both views. The 3D view only reads the fight state. Its drawing lives in its own file (`view3d.js`), apart from the engine.
- **Tests.** Unit tests cover the attitude it draws (bank from G, heading and pitch into the scene's axes) and the trail conversion. The e2e spec switches to 3D and back while a fight plays, with no console errors, and checks that the WebGL context is released on leaving.

## Every setting has a default, and the screen stays simple (Patrick, 2026-09-30)

Patrick asked on 2026-09-30 (07:13Z, in this thread): every parameter starts with a default entry, and the interface is user friendly, intuitive and not overwhelming. So, for everything in this spec, including Energy mode and Start geometry:
- **Every box, choice and checkbox opens filled in** with its default, which is V6's value where V6 had one. The fight plays straight away with nothing typed. A blank or bad entry never runs; the last good value stays (ui-kit's number rule).
- **Layers, not a wall of boxes (R22).** The first view has the fight type, separation, and each aircraft's speed and G, as V6 did. Turning on Energy (T-6) adds only each aircraft's start altitude and merge speed. Everything else sits in the one closed Turn Fight settings menu (Patrick, 07:20Z: a settings menu that opens, so it doesn't overwhelm), in sections, most-used first: Start geometry, then Energy, then Model settings for checking. "More …" panels hold only extra readouts. Nothing opens by itself.
- **Plain words first.** Each label says what it is in plain words, with the SMM term after it in brackets, for example "Red's position off Blue's nose (ATA)". Each has a one-line hint showing its unit, range and default, for example "0 to 180°, default 0°", and the SMM reference where there is one.
- **Put it back in one click.** "Reset to V6 defaults" puts back the whole setup. "Head-on (V6)" resets Start geometry. "Reset to defaults" resets Model settings for checking.
- **Show the setup, not just numbers.** Start geometry draws a small picture of both jets as the numbers change. The chosen move and why ("Pitch back: 220 KIAS, SMM entry 160 to 220") shows beside each aircraft.
- **Checked in the sign-off checklist:** someone who has never seen the tool opens it, plays the default fight, then switches on Energy and plays again, without opening any panel or typing anything.

## Energy mode (FF23, D112)

Patrick agreed on 2026-09-30 (05:27Z, in the Flying manuals index thread) to bring the future feature "climbing and diving turns" (FF23) into this spec as an **Energy** mode. It gets built at the Turn Fight's turn, after the simple fight. The plan doc logs it as D112 (which also answers the manuals' Q68). It's new flight math; Patrick approved it on 2026-09-30, and Dad checks the result against how the Harvard flies. Its numbers come from the flying manuals index (`/mnt/project-files/manuals/`, private; only numbers and references go in the repo).

### What it's for

The SMM's advanced handling is about energy management: "achieve the desired exit parameters regardless of the entry parameters". For training, those exit parameters are **160 KIAS and 17 units AOA**, the max-performance turn (MPT) against a simulated threat (SMM 14.3 para 6, 14.4 para 8). Energy mode flies that. Each T-6, at full power, uses the vertical and G to get from its merge speed to the 160 KIAS best turn, then holds that turn:
- too fast: a pitch back or Immelmann trades speed for height;
- too slow: a slice or split S trades height for speed.

The simple fight never changes speed, so it can't show this. Energy mode shows how many degrees of turn and how much height each way of getting to 160 costs, and who wins the turn after.

### The screen

- **Energy (T-6)** is a checkbox, off by default. When it's on, the simple mode's speed, G, Climb and dive and First nose chases are greyed out (their values are kept), and these appear:
  - **Start altitude** for Blue and Red, each default 10,000 ft pressure altitude (see Start geometry and altitudes). That is the altitude the SMM's entry speeds assume (SMM 14.5 para 10), and high enough for a split S, which loses about 2,000 ft (SMM 14.16 para 40).
  - For Blue and Red: **merge speed** in KIAS (default 220), from 40 up to the top speed at that aircraft's start height, core's `maxKiasT6A` (the NFM's line, Fig 4-1-2, p. 5-9; core #211, #218): 316 KIAS (VMO) up to 18,879 ft, then Mach 0.67: 309 KIAS at 20,000 ft and 279 KIAS at 25,000 ft. Like VMO, the line is compared with the model's own indicated speed as it stands (SPEC-core, Known limits). The height is checked first, so a speed over the limit is refused with a message that names the limit at that height, for example "Blue's merge speed is above the T-6A's limit at 25,000 ft (279 KIAS, Mach 0.67)", or "(316 KIAS, VMO)" below the crossover, even for 317 or 400 KIAS. A speed under 40 says "from 40 to" the limit at that height. The limit is taken to the whole knot the message shows.
  - Beside each aircraft, the move the model chose and why, for example "Pitch back: 220 KIAS, SMM entry 160 to 220", then "MPT 160 KIAS" once it's there.
- **More energy settings**, the Energy section of Turn Fight settings:
  - **Move** for each aircraft: Auto (default), or force one of the moves below (Immelmann, Pitch back, Slice, Split S or MPT) to compare them.
  - **MPT speed**, default 160 KIAS (SMM 14.3 para 6), from 120 to 200 KIAS: above that the level MPT sinks under the deck.
  - **Hard deck**, default 6,000 ft MSL. That is 3,000 ft AGL in the Moose Jaw areas, which lie over the Coteau and Dirt Hills (SMM 14.6 para 16). The user can set it; it's where the model changes to the level MPT (step 3).
  - **Pursuit** for the aircraft that gets its nose on first: Pure (default), Lead or Lag (see step 4).
  - **Chase after a head-on pass**, off by default (pending Patrick's word): with it on, a head-on first nose-on starts the pursuit too (see step 4).
  - **Model settings for checking**, its own section at the bottom of Turn Fight settings, with its own "Reset to defaults" button: the numbers no manual gives, which Dad checks. A student never needs to open this.
    - Stall speed, default 86 KIAS.
    - Shaker, default 94 % of the stall-line G.
    - How long a stall lasts, default 1 s.
    - Mid-range throttle, default half of maximum thrust.
    - Lead and lag points, default 1 s ahead and behind.
    - Roll rate, default 90°/s.
    - Pitch back bank, default 60° at a 160 KIAS entry, falling to 30° at 220. The rule is from EFIG p.441: more bank when slower, less when faster.
    - Auto's split points, default 220 and 120 KIAS.
    - Immelmann off-nose angle, default 120° (0 to 180): above 220 KIAS, when neither move gets a chase in the look-ahead, Auto flies the Immelmann when the other aircraft is more than this off the nose, else the pitch back.
    - Lowest Immelmann top speed, default 120 KIAS (0 to VMO): an Immelmann that would be over the top slower than this is never picked.
    - Look-ahead, default 60 s (0 to 120; 0 turns the race off): how far ahead Auto races the Immelmann against the pitch back above 220 KIAS.
    - Deck margin, default 1,000 ft (0 to 10,000): under the MPT band and closer than this to the hard deck, Auto flies the MPT (level at the deck) instead of a slice or split S.
- **Result** adds each aircraft's KIAS, altitude, G and current move, and the time and degrees of turn to reach the MPT. When both noses came on together and nobody has got behind the other, it says "Even fight: nobody gets behind" (the engine sets `evenFight` for it). **More detail** adds true airspeed, climb angle, bank, specific excess power (Ps, ft/s, how fast the aircraft is gaining or losing energy) and energy height (altitude + V²/2g).
- **Side view:** the side-view panel shows altitude against time for both aircraft, with the hard deck as a line for reference (no flag and no pause). It needs no height scale, because the heights are real.
- **Two flags only** (Patrick, 2026-09-30), in the result card, words plus colour, per aircraft:
  - **OVER G** when the aircraft pulls more than +7 G, or more than +4.7 G while rolling (SMM 14.17 cautions that this is easy in a pitch back above 190 KIAS). The aircraft still flies the G it pulled, so the flag shows what the move would cost; a pull past both this and the stall line shows OVER G on the step it stalls, as well as STALL.
  - **STALL** when the pull needs more lift than the wing has at that speed (above the stall line, 18 units AOA), or the speed falls below the 1 G stall speed, for example at the top of an Immelmann entered too slow, or a merge speed under it (STALL shows from the start, before the pass). A stall costs the turn (Patrick, 2026-09-30; SMM 14.14 para 32: a high-speed stall stops the turn): while the flag is on, the G drops to 1 G, so the turn rate all but stops, until the pilot eases back to the shaker, 1 s later by default.
  - Nothing else is flagged: no deck, top-speed or entry-speed warnings.

### How the model flies (Auto)

Every move is at full power (100 % torque), and the aircraft turns toward the other aircraft, from the fight type (1-circle or 2-circle), as in the simple fight. "Pull to the shaker" means pulling to 17 units AOA, just under the 18-unit stall (SMM 14.14 para 33). The model takes the shaker as 94 % of the stall-line G at the current speed (17 ÷ 18), at most 7 G. Bank changes at the roll rate, never instantly.

**Throttle.** The one time the model is not at full power is when it rolls straight into an MPT (level or 160) from above that MPT's speed, for example reaching the deck fast or a forced MPT. Then, as the SMM says, the PCL goes to mid-range and the pilot pulls up to about 4 G to bleed the speed. When the shaker comes on, the PCL goes to MAX (SMM 14.14 paras 36 and 38). Mid-range is taken as half of maximum thrust. The pitch back, slice, Immelmann and split S stay at MAX (Table 14.1).

**1. Pick the move at the merge.** The move comes from the aircraft's KIAS and the SMM entry speeds (Table 14.1, at about 10,000 ft):

| KIAS at the merge | Move | What the pilot does (SMM, EFIG) |
|---|---|---|
| above 220 | Immelmann or pitch back | Whichever gets this aircraft's chase started sooner in a 60 s look-ahead of the real fight (Patrick: "whichever will get them into the position and win faster"). A run where the other's chase starts first, or this aircraft goes OVER G or STALLs, does not count, and a head-on pass is not a chase. On a tie, the move whose SMM band holds the entry speed (Immelmann 200 to 250, pitch back 160 to 220), else the pitch back. An Immelmann that would be over the top under 120 KIAS is never picked. With no chase for either in the look-ahead, the geometry decides: the Immelmann when the other is more than 120° off the nose, else the pitch back. Immelmann: wings level, a smooth pull to about 4 G, then held in the shaker up and over, rolling upright approaching inverted (SMM 14.15 para 39, EFIG p.435) |
| 160 to 220 | Pitch back | Lift vector above the horizon: bank from the entry speed (setting above), pull to about 4 G, then held in the shaker (SMM 14.17 para 43, EFIG p.441) |
| 120 to 160 | Slice | Lift vector past horizontal: 90° bank at 160 KIAS to 135° at 100 (SMM 14.18 para 46), squeezed to the shaker (EFIG p.444) |
| below 120 | Split S | About 20° nose up, roll inverted at about 0.5 G, then pull through in the shaker, at most 5 G (Patrick, 2026-09-30 09:27Z; the SMM's Table 14.1 says about 4 G), to level (SMM 14.16 para 41). The split S uses core's shaker, 7 kt over the stall speed. If the height a split S loses from its top (core's, about 2,000 ft) would take it below the hard deck, it flies a slice instead |
| 160 (within 5 kt) | MPT straight away | |
| under the MPT band, within 1,000 ft of the hard deck | MPT (the level MPT at the deck) | No room to slice or split S (deck margin, a model setting); this comes before the slice and split S rows |

The bands overlap in the SMM (the Immelmann is 200 to 250 and the pitch back 160 to 220; the split S is 100 to 120 and the slice 100 to 160). Auto takes the split points above, so the Immelmann is for speed the pitch back can't bleed, and the split S for speed the slice can't build.

**Both on Auto.** Each aircraft's race flies the other as it will really fly. Blue picks first, against the move Red would pick; Red then picks against Blue's plan. If Red's pick is not the one Blue raced against, Blue races again against Red's plan, and Red's race is run again against Blue's final pick. If Red's best move has then changed, the two picks answer each other in a circle, so Red keeps its pick, and its reason says "picked before the other's move was final", with both moves' times against Blue's final pick.

**2. Capture the MPT.** In a pitch back or slice, as KIAS nears the MPT speed, the pilot adjusts bank toward the MPT attitude, aiming to be there before 180° of turn (SMM 14.17 para 42, 14.18 para 44). After an Immelmann or split S rolls out, Auto looks at the speed again and picks the next move from step 1 (a "follow-on manoeuvre", SMM 14.15-14.16). The model hands a pitch back or slice to the MPT when its speed 3 s ahead would reach the MPT speed. For a move entered above 235 KIAS the lead grows with the entry speed, from 3 s at 235 KIAS to 3.7 s at 316 KIAS (VMO): a pitch back from that fast climbs so steeply that a flat 3 s leaves it too late above about 280 KIAS, and the speed then falls under 155, while the flat 6 s it used before took 303 to 391° to reach the MPT. From 221 to 316 KIAS the pitch back now reaches the MPT in under 180° and holds 155 to 165 KIAS once there (checked at 8,000 to 15,000 ft, 1 and 2 circles). A move that has not found the MPT speed by 170° of turn hands over anyway. With the nose low near the vertical (a slice from a very low speed, high up) the bank is taken from the true horizon and is at most 90°, so the nose comes up and does not corkscrew down. These are model tuning, not boxes.

**3. Hold the MPT.** There are two, from SMM 14.14:
- **Above the hard deck: the constant-speed MPT** (CSMPT, para 37), the two-circle rate fight. It holds 160 KIAS and gives up height to do it. 70 to 75° bank, pulled to the shaker, with bank used to hold the speed. Speed rising: less bank, nose higher. Speed falling: more bank, nose lower (EFIG p.430, SMM 14.4 para 8). The model has no fixed start bank: its speed-hold law sets the bank, kept within 60 to 85°, to hold 160 ± 5 KIAS; steady at 160 KIAS it settles at 72 to 73°.
- **At the hard deck: the level MPT** (paras 34 to 36). When the aircraft gets down to the deck, the pilot raises the nose to level and holds it there by bank, not pitch, in the shaker at full power. The bank is about 69° (the chart bank, D143; the SMM's rule of thumb is 70 to 75°). The model doesn't aim for a speed here: the speed settles wherever thrust meets drag. The SMM says that is about 150 KIAS minus the altitude in thousands of feet, 144 KIAS at a 6,000 ft deck, and the model must match it (see Checks).

**4. Pursuit after first nose-on.** The first aircraft to get its nose within 5° of the other, with the other's aspect angle 150° or less (from behind, not a head-on pass), stops its MPT and chases, in the pursuit picked under More energy settings (SMM 12.30 and 16.16). A head-on first nose-on is still marked as first nose-on but starts no chase, unless Chase after a head-on pass is on:
- **Pure:** nose on the other aircraft.
- **Lead:** nose on where the other aircraft will be in 1 s, for a guns shot.
- **Lag:** nose on where it was 1 s ago, to stop closing too fast and overshooting.

The chaser only pulls what a T-6 can: its G is capped at the shaker, and at +7 G. If the pursuit needs more than that, the chaser falls behind the curve and the result card says so. The other aircraft keeps its MPT. Choosing the pursuit for itself (lag when closing fast, lead when in guns range) is a later feature (Patrick, 2026-09-30).

**Forced moves** (from More energy settings) fly the same way from the merge whatever the speed. The move still exits into the MPT, so a split S at 220 KIAS shows what it costs.

### The model (T-6A, point mass)

This model is `core`'s shared T-6A performance model (SPEC-core, "API, fifth PR: T-6A performance"). It is described here because the Turn Fight is its first user, and its chart checks are the tests `core` builds it against.

- **Motion.** Each aircraft is a point with speed V, a flight-path direction, and a lift direction set by its bank. Every 0.02 s step:
  - the load factor n turns the flight path through the bank angle μ: rate of climb-angle change (g/V)(n cos μ − cos γ) and, level, rate of heading change g·n·sin μ / (V cos γ);
  - speed changes by dV/dt = g((T − D)/W − sin γ).
  The step works on the velocity as a vector, not on heading and climb angle, so an Immelmann or split S passes straight up or down without dividing by cos 90° = 0. A fourth-order Runge-Kutta step at 0.02 s keeps the energy error far below what the screen shows.
- **Speeds.** The charts are in indicated airspeed (IAS), and the motion uses true airspeed (TAS). TAS = IAS ÷ √σ, with σ the standard-atmosphere density ratio `core` already has (`isaDensityRatio`). Compressibility is ignored in the motion; the fight starts at or below 25,000 ft. Auto keeps under the top speed for its height (VMO up to 18,879 ft, then Mach 0.67: 309 KIAS at 20,000 ft, 279 at 25,000 ft); a forced move may go over it, unflagged (a forced split S from 300 KIAS at 18,000 ft reaches about 370 KIAS).
- **Limits (T-6A V-n diagram, clean, 5,168 lb).** +7 G and −3.5 G symmetric; +4.7 G while rolling; the stall limit G = (KIAS ÷ 86)², which reaches 7 G at 227.5 KIAS; the top speed is VMO, 316 KIAS, up to 18,879 ft, then Mach 0.67 (NFM Fig 4-1-2, p. 5-9, a straight line down to 244 KIAS at 31,000 ft; core #218, `maxKiasT6A`): 309 KIAS at 20,000 ft and 279 KIAS at 25,000 ft, compared with the model's own IAS like VMO. A chaser starts keeping its nose up 40 KIAS under the top speed at its own height, so the guard tightens as it climbs and eases as it dives; below 18,879 ft the top speed is exactly VMO, so a fight whose chase stays under that height flies it exactly as before. The 86 kt is the agreed setting (Patrick, 2026-09-30), not a chart reading: the V-n curve itself reads about 89 kt (7 G near 236 KIAS), and VO, 227 KIAS, is a limit speed rather than the V-n corner, so 227.5 lining up with it is a coincidence of the 86.
- **Thrust minus drag** comes from the T-6A sustained turn rate and radius charts (maximum power, clean, standard day). In a sustained turn, thrust equals drag, so each point on those charts gives the drag at that speed, altitude and G. A standard drag polar (drag = a zero-lift part plus a part growing with G² at a given speed) and a propeller thrust that falls with speed and density are fitted to the chart points at sea level, 10,000 and 20,000 ft. Then (T − D)/W at any speed, altitude and G comes from the fit. The chart points, read off by eye, are kept in a data file with their chart and reading notes.
- **Weight** is fixed at the chart's weight (maximum take-off weight less the fuel to climb), with no fuel burn.

### Checks against the charts (read off by eye, so approximate)

| Check | Chart | What the model must give |
|---|---|---|
| Best sustained turn rate at sea level | about 20.6°/s at about 140 KIAS | within 1°/s and 10 kt (see the note below) |
| Sustained turn rate at 10,000 and 20,000 ft | about 16.5 and 12°/s at their best | within 1°/s |
| Zero sustained turn (1 G sustained) | about 260 KIAS at sea level | within 10 kt |
| Smallest sustained turn radius, sea level | about 650 to 700 ft near 140 KIAS | within 10 % |
| Corner (7 G first available) | about 236 KIAS on the V-n curve (VO, 227 KIAS, is a limit speed, not the corner) | 227.5 KIAS from the 86 kt stall setting (a check of the setting, not the chart) |
| Instantaneous turn at the corner, sea level | not on a chart | 33.3°/s on a 659 ft radius (7 G at 227 KIAS) |
| Level MPT speed (SMM 14.14 para 34) | about 150 KIAS minus altitude in thousands: 140 at 10,000 ft, 144 at 6,000 ft | within 5 kt, at the shaker, full power |
| A stall costs the turn | SMM 14.14 para 32 | a pull past the stall line gives 1 G for 1 s, then back to the shaker |

**Stall speed (settled at 86 kt, Patrick 2026-09-30).** The sustained-turn chart's peak (20.6°/s at 140 KIAS) needs about 2.8 G, but an 86 kt stall line gives 2.65 G at 140 KIAS, which caps the peak at about 19.1°/s. The turn charts imply a stall near 83 kt, most likely because they are flown at maximum power and a power-on stall comes at a lower speed (NFM p.6-6), not because of weight. The V-n curve reads about 89 kt. The model keeps 86 kt and accepts a best sustained rate about 1.5°/s low at the stall limit. The stall speed is one constant (a model setting), and the chart checks run with it at 83 kt.

### For Dad to check

The defaults above that no manual gives, each a setting:
- the stall speed: 86 kt from the V-n diagram, or about 83 kt from the turn chart;
- the shaker: 94 % of the stall-line G;
- how long a stall lasts: 1 s at 1 G;
- mid-range throttle: half of maximum thrust;
- the lead and lag points: 1 s ahead and behind;
- the roll rate: 90°/s;
- the pitch back bank: 60° at 160 KIAS to 30° at 220;
- Auto's split points: 220 and 120 KIAS, and the split S entry in particular (SMM Table 14.1 gives it under 120): from 100 to 119 KIAS the model's slice reaches the MPT in about 7 s and 60 to 80° of turn, losing 600 to 700 ft, while its split S takes 25 to 29 s and 360°. Does a Harvard slice really do that? If Dad says the slice is right, the split point drops to about 100 (the SMM slice band is 100 to 160);
- Auto above 220 KIAS: the 60 s look-ahead, the 120° off-nose angle and the 120 KIAS lowest Immelmann top speed;
- the deck margin: 1,000 ft;
- the MPT handover lead: 3 s, growing to 3.7 s for a move entered from 235 up to 316 KIAS;
- chase after a head-on pass: off.

Then a run from several merge speeds (100, 140, 180, 220 and 250 KIAS) against how the Harvard really flies. Until he answers, the defaults stand.

### What stays the same

- The simple fight is untouched and stays pinned to V6 by its golden test. Energy mode is a separate stepper next to it, never a change to it.
- The merge, first nose-on (in 3D, as Q51 decided), the tie rule (Q48), the trails, the 10-minute stop and the playback work the same in both modes.

## Start geometry and altitudes (R28)

Patrick asked on 2026-09-30 (06:18Z, in this thread) to start the aircraft at different altitudes, crossing angles and aspects. V6 only starts them head-on, level, at the same height. This addition lets the student set up any start and still get V6's fight when the setup is left at head-on.

### The terms (SMM 12.2 paras 5 to 9)

- **Range:** the distance between the two aircraft. This is the existing start separation, 0.5 to 10 NM, default 2 NM.
- **Aspect angle (AA):** where Blue sits relative to Red's tail line. 0° means Blue is dead astern of Red (low aspect, Red heading away). 180° means Blue is on Red's nose (high aspect, Red heading at Blue). Left or right says which side of Red Blue is on.
- **Heading crossing angle (HCA):** the difference between the two headings, 0° (same heading) to 180° (opposite headings).
- **Off-nose angle (ATA):** where Red sits off Blue's nose, 0° (dead ahead) to 180° (dead astern), left or right.

Any two of AA, HCA and ATA, with their sides, fix the third. The screen sets the two positions (where Red is off Blue's nose, and where Blue is off Red's tail), because they place both jets without any side ambiguity. The HCA follows from those two and is shown beside them.

### The screen

- **Start geometry**, a section of the closed Turn Fight settings menu (R22). Its fields:
  - Red off Blue's nose (ATA): 0 to 180°, left or right, default 0°;
  - Red's aspect angle (AA): 0 to 180°, left or right, default 180°;
  - the HCA, shown live, with a line under it: "Pass at T+16.4 s", "Turns start at once (the jets pass at T+16.4 s)", or "No pass: the turns start at once" (no closing range, or a pass after the 10-minute stop); and under that which way each jet will turn, for example "Blue turns left, Red turns right" (the rule in Which way each aircraft turns, with the 1-circle flip; with First nose chases on it adds "(until first nose-on; then each chases the other)", because the chase turns each jet toward the other from first nose-on), so the student sees what 1-circle and 2-circle will do from this start before pressing Play;
  - the hints say what each term is: ATA is this tool's term for the angle off Blue's nose; AA and HCA are SMM 12.2 paras 6 and 9; the sides are SMM 16 para 40b (the SMM has no off-nose angle). The side means nothing at 0° or 180°, and the hint says so; flipping it there does not restart the fight (the setup treats the side as left);
  - a small picture of the start, drawn from the numbers;
  - a "Head-on (V6)" button that puts back the head-on defaults (ATA 0°, AA 180°, both sides left, Red level with Blue, turns at the pass).
  - For example: ATA 0° with AA 90° is Red crossing Blue's nose, HCA 90°. ATA 0° with AA 0° is Blue dead astern of Red, HCA 0°.
- **Start altitude for each aircraft.** In Energy mode, Blue and Red each have a start altitude, both defaulting to 10,000 ft, from the deck up to 25,000 ft. Above 15,000 ft a note beside the box says the model's sustained turn rate reads low up there (core's check found it up to 28 % low at 20,000 ft and above near 200 KIAS, and within 0.65°/s at 15,000 ft and below), and that the SMM recommends aerobatics below 16,000 ft MSL (SMM 14.5 para 10); it is one note, not two warnings, and it goes once core's high-altitude fix lands. Decision logged for Patrick's review, 2026-09-30. The start separation is measured level, so the Range readout (the slant range, height included) reads a little more than the set separation when Red starts above or below. In the simple mode, a "Red starts above Blue" height (−5,000 to +5,000 ft, default 0) sets the starting height difference; it is used with Climb and dive on (the box is greyed out otherwise).
- **When the turns start**, a choice in the Start geometry section (R22 keeps More detail for readouts):
  - At the pass (default): each aircraft flies straight until the range stops closing. At head-on that is V6's merge, T+16.4 s at the defaults. If the range is opening from the start, the turns start at once.
  - At once: the turns start at T+0, for a set-up like an offensive perch where the fight is already on.
- **More detail** adds the live aspect angle (AA), and its one "Angle-off (HCA)" row is the heading crossing angle. Range stays in Result, always in view. Before the pass the phase reads TO THE PASS (HEAD-TO-HEAD at the head-on start, as V6).
- Changing any of these resets the fight, like any other setup change.

### Which way each aircraft turns

Blue turns toward Red. In a 2-circle fight, Red turns toward Blue too. In a 1-circle fight, Red turns the other way. At exactly head-on the side is a tie, so V6's directions stand: Blue counter-clockwise, and Red counter-clockwise in a 2-circle fight and clockwise in a 1-circle fight. Energy mode uses the same rule for its lift vector, and its pursuit (step 4) starts from wherever first nose-on happens.

### The pass mark and first nose-on at the start

- **The mark.** The word at the pass (2D and 3D) is MERGE when the jets pass within about 0.25 NM (1,520 ft) of each other, level distance at the pass, so the head-on default shows MERGE as in V6; it is PASS when they pass farther apart (a crossing start passes 1.4 NM apart). The phase words and the rest are unchanged. The threshold is a judgement logged for Patrick's review.
- **Nose-on at the start (not head-on only).** When the start is not head-on, a jet whose off-nose angle is already 5° or less at the moment the turns start counts as first nose-on at +0.0 s (Both if both), as a stern chase is meant to (Blue has had Red on its nose the whole time). If the jets are within 10 ft of each other at that moment (a stern chase passes exactly through), the line of sight from just before they coincide is used, not the noise of two coincident positions. The head-on start (ATA 0°, AA 180°) is not changed, so V6's golden fight and its results stay as they are; a head-on start with the turns at once is marked one step (0.02 s) after T+0, as before (it reads Both at +0.0 s), not at T+0 by this rule. An off-nose angle within a rounding error of 5° counts as within it, so a start and its mirror image (side left or right) always agree.
- **A 2-circle fight between equal jets, from a head-on start,** has a first nose-on only if they come back exactly head-on; a sideways offset (ATA 1°, AA 179°) gives none, which is what a rate fight between equals means. A 1-circle fight changes smoothly (+9.1 s head-on, about +8.3 s at 1°). The About panel says so.

### What stays the same

- At the defaults (ATA 0°, AA 180°, so HCA 180°; same altitude, turns at the pass) the fight is exactly V6's plus the Q49 centre start. The golden test runs at those defaults and doesn't change.
- The turn math doesn't change. The only new math is placing the start (a position and a heading from range, ATA and AA) and finding the pass (the step where the range stops closing). Both have their own unit tests, written first:
  - ATA 0°, AA 180° gives today's head-on start;
  - ATA 0°, AA 90° puts Red crossing Blue's nose, with HCA 90°;
  - the pass comes at the closest point of approach to within one step.
- The view centres on the point midway between the two aircraft at the pass, the way Q49 centres the head-on merge (or at T+0 when the turns start at once or there is no pass).

## Project structure

```
src/modules/turn-fight/
  index.js        mount and unmount; wires settings, scheduler, keys
  sim.js          the fight: pure, no page access (createFight, stepFight, FIGHT_STEP_SEC)
  energy-sim.js   Energy mode: the moves, stepping both aircraft with core's point-mass step
  readouts.js     turns a fight state into readout lines (pure)
  view.js         top-down drawing on a ui-kit canvas surface
  view3d.js       the 3D view (three.js, loaded only when 3D is switched on), on ui-kit's three-aircraft.js
  profile.js      the side view (Climb and dive)
  layout.js       the three columns, panels and controls
  turn-fight.css
  README.md       what's here and where to change common things (R8)
tests/unit/turn-fight/      sim.test.js readouts.test.js (known answers, the 10-minute stop, the fixed step), energy-sim.test.js (each move)
tests/unit/core/            t6-performance.test.js point-mass.test.js (Energy mode's new core math, by its owner)
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
| Task 10 (Energy mode), with core's tasks 14 to 17 | test-driven-development | Every new formula starts as a failing known-answer test (core writes the model's; this module writes the moves'): a level turn gives today's `turnRadiusFt` and `turnRateRadPerSec` exactly; a steady climbing turn gives g·√(n² − cos²γ) / (V cos γ) (22.4°/s at 30°, 220 KTAS, 4 G); with thrust equal to drag, energy height stays constant round a loop; the stall line reaches 7 G at 227.5 KIAS; the fit meets the chart checks above |
| Tasks 1 and 2 (the fight, readouts) | test-driven-development | The golden test against V6's own script is written first and must fail before `sim.js` exists. Each answered question starts as a failing test that states the change from V6 (D10) |
| Every task | incremental-implementation | One task per commit, each leaving the app working; `npm test` before each commit |
| Tasks 3 to 5 (the screen) | frontend-ui-engineering, with `.claude/references/accessibility-checklist.md` | Labelled controls, keyboard use, colour never the only signal, R22's essentials-first layout, tokens instead of `!important` |
| Tasks 4 and 5 (drawing and playback) | performance-optimization, with `.claude/references/performance-checklist.md` | Measure a 4× fight with long trails at 1920 × 1080 on a local build; one change at a time; log each attempt in the PR |
| When something breaks | debugging-and-error-recovery | A golden mismatch or red CI: reproduce, find the step where V6 and `sim.js` part, fix, add a regression test |
| Before each PR leaves draft | code-review-and-quality, plus `/code-review` | The five-axis review with severity labels, and `.claude/references/definition-of-done.md` |
| Polish, before sign-off | code-simplification, plus `/simplify` | Tidy without changing a number (the golden test must still pass) |

security-and-hardening doesn't apply: the Turn Fight opens no files and fetches nothing. The only outside input is what people type, which ui-kit's number rule checks, and settings read back from browser storage, which are checked against the same ranges before use.

## Testing strategy

1. **Golden test first (R9, D10).** `turn-fight-v6.js` runs V6's own `bfmFight` script, unchanged, with a stand-in page (input values, a canvas that draws nothing), and reads its fight state after each step. `turn-fight-sim.test.js` runs V6 and `sim.js` side by side at 0.02 s steps for 10 minutes of fight time on a grid of setups: both fight types; First nose chases off and on; Climb and dive off and on with several pitches; equal and unequal speeds and G. Positions, headings, pitch, height, time, merge and first nose-on must agree within 1e-9 ft and 1e-12 rad. Known limit: `core`'s turn rate differs from V6's in the last digit for about a third of speed and G pairs. Without First nose chases that stays a last-digit difference for 10 minutes. With the chase on, the two aircraft keep passing close to each other, so the difference can grow after about 40 s, by as much as V6 itself differs between 50 and 60 frames a second. So the 10-minute grid uses speeds and G whose rates equal V6's to the last bit, and a separate test pins the chase with differing rates for 40 s. Exact ties are left out, because rounding noise can't be pinned; the tie rule (Q48) has its own unit tests.
2. **Any answered question lands as its own commit** after the golden test passes on V6's behaviour, and that commit changes the golden test to say exactly what differs (as D39 did in `core`).
3. **Unit tests** check meaning: 220 KTAS at 4 G turns at 19.2°/s on a 1,106 ft radius; a 2-circle fight with the faster turn rate gets its nose on first; the fight is the same whatever the frame rate; the fight stops at 10 minutes; readouts round as V6 does.
4. **Browser tests** (Playwright): every control does something (R3); nothing overlaps at 1366 × 768 and 1920 × 1080 (R2); closing the module leaves no frames or timers running (R4); no console errors (R7).
5. **Energy mode** has no V6 to compare against, so it's tested against known answers and the T-6A charts (see Energy mode's checks, and test-driven-development in Skills used), and then flown by Dad. Its tests never touch the simple fight's golden test.
6. **Sign-off checklist** (R21), run by Patrick or Dad against V6 side by side.

## Boundaries

- **Always:** keep V6's numbers unless a logged decision says otherwise; take turn math from `core`; run `npm test` before each commit.
- **Ask first:** any change to the fight's math or what it shows (anything beyond Q48 to Q51 and Energy mode as approved); a new package.
- **Never:** edit `original/`; fold a fix into the port that pins V6; read a number from an input box inside `sim.js`.

## Success criteria

- The golden test passes on every setup in its grid, and every change from V6 is a logged decision.
- A student can set up, play and read a fight with only the default controls showing (R22).
- Every control does something, nothing overlaps, and nothing runs after the module closes (R2, R3, R4).
- Energy mode meets its chart checks. From any merge speed between 100 and 250 KIAS, Auto reaches and holds the 160 KIAS max-performance turn, and Dad agrees each move flies like a Harvard.
- Patrick or Dad signs off the checklist (R21).

## Plan

The tasks, checkpoints and risks are in [`tasks/turn-fight/plan.md`](../tasks/turn-fight/plan.md) and [`todo.md`](../tasks/turn-fight/todo.md).
