# Turn Fight: plan

Spec: [`specs/SPEC-turn-fight.md`](../../specs/SPEC-turn-fight.md), approved by Patrick on 2026-09-30. Tasks: [`todo.md`](todo.md).

## Waits on

| Needed for | What | Owner |
|---|---|---|
| Any code | The coordinator says it's the Turn Fight's turn (after the debrief and the Turn Sim) | Coordinator |
| Task 1 | Nothing new from `core`: `limitG`, `turnRadiusFt`, `turnRateRadPerSec`, `wrapPi`, `absAngleDeg`, `headingRad` and the units are merged and pinned against Turn Fight's copies | Flight math core thread (done) |
| Tasks 3 to 5 | ui-kit `createControls`, `createPanel`, `createCanvasSurface` (merged in #65) | App frame thread (done) |
| Tasks 3 and 4 | The module's `load` in `src/shell/registry.js`, and `tests/e2e/turn-fight.spec.js` | App frame thread, through the coordinator |

## Order and why

1. **The fight first, with no screen.** `sim.js` and V6's own script run side by side in Node, so R9 is proven before anything is drawn. This is where all the risk is.
2. **Readouts next**, as pure functions against the same golden runs, so every number on screen is checked before layout.
3. **Then the screen**: columns, controls, the top-down view and the playback bar, essentials only (R22).
4. **Then the extras** behind their checkboxes: the chase, Climb and dive with the side view.
5. **The decided changes last** (Q48 to Q51), each as its own commit after V6's behaviour is pinned (D10).

## Pull requests

- PR A: tasks 1 and 2 (the fight and readouts, golden-tested; no screen yet).
- PR B: tasks 3 to 5 (the screen, the view, the extras, browser tests, README).
- PR C: task 6 (answered questions, one commit each) and task 7 (polish and checklist).

Each PR is reviewed with code-review-and-quality before it leaves draft, lists the skills it applied (see the spec's Skills used), and merges on green under the merge rule once this spec is approved.

## Risks

| Risk | What we do |
|---|---|
| V6's script can't run outside a page | Already tried: it runs in Node with a stand-in page, and its fight state can be read after each step (checked while writing the spec). |
| `core`'s turn rate differs from V6's `M` in the last digit, so long fights drift | Compare within 1e-9 ft over 10 minutes; if drift grows past that, compare per step from V6's state instead. |
| An even fight's first nose-on is decided by rounding noise | Leave exact ties out of the golden grid; the "Both" rule (Q48) gets its own unit tests. |
| Long trails slow the drawing | A point every 0.1 s and the 10-minute stop cap it at 6,000 points per aircraft; measure at 4× on 1920 × 1080. |
