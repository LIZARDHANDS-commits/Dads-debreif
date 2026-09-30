# Traffic Pattern Sim: plan

Spec: [`specs/SPEC-traffic.md`](../../specs/SPEC-traffic.md), a draft waiting for Patrick's approval. Tasks: [`todo.md`](todo.md).

## Waits on

| Needed for | What | Owner |
|---|---|---|
| Any code | Patrick approves the spec, and the coordinator says it's the Traffic Sim's turn (after the debrief, the Turn Sim and the Turn Fight) | Patrick, coordinator |
| Tasks 1 and 2 | Nothing new from `core`: `ktToFtps`, `limitG`, `turnRadiusFt`, `bankDegFromG`, `unitVectorFromCompassDeg` and `lonLatToWorldPixel` are merged and pinned against the Traffic page's copies | Flight math core thread (done) |
| Tasks 4 to 8 | ui-kit `createControls`, `createPanel`, `createCanvasView`, `createCanvasSurface`, `h` (merged) | App frame thread (done) |
| Task 4 | The module's `load` in `src/shell/registry.js`, and `tests/e2e/traffic.spec.js` | App frame thread, through the coordinator |
| Task 4 | `app.airfields.home()` for the home field (merged) | App frame thread (done) |
| Task 8 | The debrief's satellite tile loader moved into `ui-kit` | Debrief and app frame threads, through the coordinator |
| Task 10 | Answers to T1 to T6 (each defaults to V6 until answered) | Patrick (T1, T2), Dad (T3 to T6) |

## Order and why

1. **The routes first, with no screen.** `route.js` against V6's own rounded-path functions in Node. Every position the sim uses comes from here, so R9 is proven at the bottom first.
2. **The flying next**, against V6's own `step` with the same seeded dice: spawning, loops, landing, splits, joins, conflicts. This is where the risk is.
3. **Readouts** as pure text from a sim state, so every number on screen is checked before layout.
4. **Then the screen in slices that each work**: playback and the map with the built-in setup; the left-side editor; the right-side spawner and conflicts; profiles; the satellite photo and 3D view.
5. **Rewind and ±10 s** once the sim is deterministic, with snapshots.
6. **The changes last** (D46's arcs, the dice per aircraft, one roll per split point, the joined path, and each answered question), one commit each after V6 is pinned (D10). The bug fixes that aren't about flying (links, buttons, spawner, profiles, layout) are built right in the screen tasks, because V6's behaviour there isn't a number to pin.

## Pull requests

- PR A: tasks 1 to 3 (routes, flying and readouts, golden-tested; no screen yet).
- PR B: tasks 4 to 6 (the module on screen: playback, map, editor, spawner, conflicts; browser tests; README).
- PR C: tasks 7 to 9 (profiles, satellite photo and 3D, rewind).
- PR D: task 10 (D46 and the decided changes, one commit each) and task 11 (polish and checklist).

Each PR is reviewed with code-review-and-quality before it leaves draft, lists the skills it applied (see the spec's Skills used), and merges on green under the merge rule once the spec is approved.

## Risks

| Risk | What we do |
|---|---|
| V6's Traffic script can't run outside a page | Already tried: its `step` runs in Node with a stand-in page and a seeded `Math.random`, for 30 minutes of sim time on the built-in setup (checked while writing the spec). |
| V6 draws its dice in an order that depends on the aircraft list and the splits list | The port keeps V6's order while the golden test pins it; the per-aircraft dice land afterwards as their own commit, with their own tests of the odds. |
| V6's step length depends on the frame rate | Pin V6 at 1× with 0.05 s frames, which is V6's own largest step; the port's fixed 0.05 s step matches it exactly. |
| Splits and joins behave differently after the joined-path fix, so the golden run parts at the first split | That commit narrows the golden comparison to "same until the first split or join", and unit tests cover the rest (no jumps, same odds). |
| The satellite loader isn't in ui-kit when task 8 starts | Build task 8's 3D half first and ask the coordinator; the map works without the photo. |
| Long runs with many aircraft slow the page | Route paths cached, snapshots every 10 s, side columns updated at most 5 times a second; measured at 8× with 30 aircraft. |
