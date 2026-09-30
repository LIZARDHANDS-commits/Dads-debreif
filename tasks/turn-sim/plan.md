# Turn Sim: plan

Spec: [`specs/SPEC-turn-sim.md`](../../specs/SPEC-turn-sim.md), approved by Patrick on 2026-09-30. Tasks: [`todo.md`](todo.md).

Building starts after the debrief screen, when the coordinator says it's the Turn Sim's turn.

## Waits on

| Needed for | What | Owner |
|---|---|---|
| Any code | The coordinator's go (after the debrief screen) | Coordinator |
| Task 4 on | ui-kit `controls.js`, `panel.js`, `canvas-view.js` and the scheduler (merged in #65) | App frame thread |
| Task 7 | SPEC-core Task 12: the Turn Sim G correction pinned to V6, then D74's 1.01 floor | Flight math core thread |
| Task 5 | `core/standards.js` `classifyTurnSimPosition`, `formationAxes`, `V6_STANDARDS` (merged in #67) | Flight math core thread |

Anything the Turn Sim needs changed in `core`, `ui-kit`, `storage` or the shell goes through the coordinator.

## Architecture decisions

- **Engine and screen apart.** `engine/` is pure: a scenario (plain settings) in, plain state out, no page access. V6's page globals (`$('spacing').value`, `ac`, `t`) become arguments. So every number is tested in Node against V6, and the screen only draws.
- **Shared math from `core`, Turn-Sim-only math in `engine/`** (spec, Assumption 2).
- **Fixed 0.05 s steps**, V6's own step, so results don't depend on frame rate (#17) and golden tests match V6 exactly.
- **Pin, then fix.** Each engine function lands pinned to V6 by a golden test; each decision (D41, D42, D43, D44, D45, D48) follows as its own commit that changes the pinned value on purpose (D10).
- **Golden tests run V6's own code** through `tests/golden/v6-source.js` (read-only, owned by the Flight math core thread), with a fake of the page's boxes as the prelude. Whole runs are compared too, not just single functions.

## Order and why

Vertical slices, each leaving a working screen:

1. **Engine foundations, then a screen that flies a time-delay turn** (tasks 1 to 4). The riskiest part is matching V6's integrator exactly, so it goes first; the screen follows as soon as there's something to fly.
2. **Readouts and the turn logic** (tasks 5 to 6): the numbers are what the tool is for.
3. **Timing** (tasks 7 to 10): G correction, auto timing, clock cue, compass heading and legs, each pinned then fixed.
4. **Offset box, errors and layers** (tasks 11 to 12).
5. **Profiles and CSV** (task 13), then browser tests, performance and the checklist (task 14).

## Pull requests

- PR A: tasks 1 to 5 (engine base, first screen, readouts).
- PR B: tasks 6 to 10 (turn logic and timing, with D41, D43, D44, D45, D74).
- PR C: tasks 11 to 12 (offset box, rear check, errors, layers, D42, D48).
- PR D: tasks 13 to 14 (profiles, CSV, browser tests, checklist).

Each PR lists the skills it applied, is reviewed with code-review-and-quality before it leaves draft, and merges on green under the merge rule once the spec is approved. PR D also runs `/security-review` (saved profiles). A and D log performance measurements.

## Risks

| Risk | Impact | What we do |
|---|---|---|
| V6's functions read the page everywhere, so golden tests need a big fake | Medium | One shared fake `$` from a settings object, in the test folder; whole-run tests reuse it. |
| A decision's fix interacts with another (for example D43 and D44 both change auto timing) | Medium | Separate commits in a fixed order, each with its own stated test; the whole-run golden shows exactly what changed. |
| Dad's answers to TS4 or TS5 change the offset box or clock cue after they're built | Low | V6's behaviour is kept and pinned; each answer becomes one more commit. |
| Core Task 12 arrives late | Low | Task 7 is the only one waiting; the correction model stays at None until it lands. |
| Drawing trails and breadcrumb labels at 4× drops frames | Low | Measure in task 4 and task 14; draw trails as one path; readouts at most 10 times a second. |

## Open questions

TS1 to TS7 in the spec (Q41 to Q47 in the plan doc). Each has a default, so none blocks the build.
