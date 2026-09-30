# Traffic Pattern Sim: plan

Spec: [`specs/SPEC-traffic.md`](../../specs/SPEC-traffic.md), approved by Patrick on 2026-09-30 (06:43Z). Tasks: [`todo.md`](todo.md).

## Waits on

| Needed for | What | Owner |
|---|---|---|
| Any code | Patrick approved the spec (2026-09-30 06:43Z); the coordinator says it's the Traffic Sim's turn (after the debrief, the Turn Sim and the Turn Fight) | Patrick, coordinator |
| Tasks 1 and 2 | Nothing new from `core`: `ktToFtps`, `limitG`, `turnRadiusFt`, `bankDegFromG`, `unitVectorFromCompassDeg` and `lonLatToWorldPixel` are merged and pinned against the Traffic page's copies | Flight math core thread (done) |
| Tasks 4 to 8 | ui-kit `createControls`, `createPanel`, `createCanvasView`, `createCanvasSurface`, `h` (merged) | App frame thread (done) |
| Task 4 | The module's `load` in `src/shell/registry.js`, and `tests/e2e/traffic.spec.js` | App frame thread, through the coordinator |
| Task 4 | `app.airfields.home()` for the home field (merged) | App frame thread (done) |
| Task 8 | The satellite tile loader in `ui-kit` (`src/ui-kit/map-tiles.js`, merged #133); the shared three.js 3D piece when it lands | App frame thread (tile loader done) |
| Task 10 | `windTriangle` in `src/core/wind.js`, with known-answer tests (merged, #120) | Flight math core thread (done) |
| Tasks 10, 17 and 23 | `core`'s shared T-6A performance model: `iasToTasKt`, `T6A_GLIDE`, `glideSinkFpm`, `zoomT6A` (SPEC-core, "API, fifth PR"; core tasks 14 to 17, built at the Turn Fight's turn) | Flight math core thread, through the coordinator |
| Task 12 | T2 to T6, T11 answered by Patrick (2026-09-30); T5b, T6b and T10 closed on the defaults (Patrick 07:21Z); T1 builds on its default (decision points and plans) | Patrick (done) |
| Task 14 | Patrick and Dad at the screen to redraw the Moose Jaw routes over the true-scale photo, and their list of ground references (T8) | Patrick, Dad |

## Order and why

1. **The routes first, with no screen.** `route.js` against V6's own rounded-path functions in Node. Every position the sim uses comes from here, so R9 is proven at the bottom first.
2. **The flying next**, against V6's own `step` with the same seeded dice: spawning, loops, landing, splits, joins, conflicts. This is where the risk is.
3. **Readouts** as pure text from a sim state, so every number on screen is checked before layout.
4. **Then the screen in slices that each work**: playback and the map with the built-in setup; the left-side editor; the right-side spawner and conflicts; profiles; the satellite photo and 3D view.
5. **Rewind and ±10 s** once the sim is deterministic, with snapshots.
6. **Wind and aircraft types** (Patrick's requirement, 2026-09-30), as new behaviour on top of the pinned port: indicated to true airspeed, crabbing on the legs and steady-bank turns with the roll-in moved for the wind first, with the calm-wind golden tests as the guard, then types, phases and the wind on screen.
7. **The changes last** (D46's arcs, the dice per aircraft, decision points and plans, the joined path, and each answered question), one commit each after V6 is pinned (D10). The bug fixes that aren't about flying (links, buttons, spawner, profiles, layout) are built right in the screen tasks, because V6's behaviour there isn't a number to pin.

## Pull requests

- PR A: tasks 1 to 3 (routes, flying and readouts, golden-tested; no screen yet).
- PR B: tasks 4 to 6 (the module on screen: playback, map, editor, spawner, conflicts; browser tests; README).
- PR C: tasks 7 to 9 (profiles, satellite photo and 3D, rewind).
- PR D: tasks 10 and 11 (wind and aircraft types).
- PR E: task 12 (D46 and the decided changes, one commit each) and task 13 (polish and checklist).
- PR F: task 14 (the redrawn Moose Jaw setup), when Patrick and Dad have redrawn it.
- PR G: tasks 15 to 18 (the break and final turn, PFLs, engine-outs, traffic on final; Patrick 06:03Z and 06:13Z).
- PR H: tasks 19 to 21 (the prediction, rules and live commands; fly-throughs, breaks at the departure end, closed-pattern rules; Patrick 06:15Z and 06:19Z).
- PR I: tasks 22 and 23 (set up a conflict; engine-out check and reach; Patrick 06:30Z).

Each PR is reviewed with code-review-and-quality before it leaves draft, lists the skills it applied (see the spec's Skills used), and merges on green under the merge rule once the spec is approved.

## Risks

| Risk | What we do |
|---|---|
| V6's Traffic script can't run outside a page | Already tried: its `step` runs in Node with a stand-in page and a seeded `Math.random`, for 30 minutes of sim time on the built-in setup (checked while writing the spec). |
| V6 draws its dice in an order that depends on the aircraft list and the splits list | The port keeps V6's order while the golden test pins it; the per-aircraft dice land afterwards as their own commit, with their own tests of the odds. |
| V6's step length depends on the frame rate | Pin V6 at 1× with 0.05 s frames, which is V6's own largest step; the port's fixed 0.05 s step matches it exactly. |
| Splits and joins behave differently after the joined-path fix, so the golden run parts at the first split | That commit narrows the golden comparison to "same until the first split or join", and unit tests cover the rest (no jumps, same odds). |
| The satellite loader isn't in ui-kit when task 8 starts | Build task 8's 3D half first and ask the coordinator; the map works without the photo. |
| Wind math disagrees between the Traffic Sim and, later, the SOF crosswind (FF21) | One `core/wind.js` for both, with known-answer tests. |
| The Tutor has no published circuit speeds | Its row is marked as a placeholder with where each number came from; Dad corrects it as one row of data. |
| The steady-bank turn in a wind doesn't roll out exactly on the next leg | It's worked out in closed form (turn time from the bank, the wind's drift over that time, one straight-line solve for the roll-in), and a unit test checks the roll-out point for every wind direction; in calm air it must equal D46's arc. |
| The redraw depends on Patrick and Dad having time at the screen | The built-in setup keeps V6's routes until then, so nothing waits on it. |
| Long runs with many aircraft slow the page | Route paths cached, snapshots every 10 s, side columns updated at most 5 times a second; measured at 8× with 30 aircraft. |
