# Turn Sim: plan

Spec: [`specs/SPEC-turn-sim.md`](../../specs/SPEC-turn-sim.md), approved by Patrick on 2026-09-30. Tasks: [`todo.md`](todo.md).

Building starts after the debrief screen, when the coordinator says it's the Turn Sim's turn.

## Waits on

| Needed for | What | Owner |
|---|---|---|
| Any code | The coordinator's go (after the debrief screen) | Coordinator |
| Task 4 on | ui-kit `controls.js`, `panel.js`, `canvas-view.js` and the scheduler (merged in #65) | App frame thread |
| Task 7 | SPEC-core Task 12: the Turn Sim G correction pinned to V6, then D74's 1.01 floor | Flight math core thread |
| Task 5 | A shared home for the edited standards, read by the debrief and the Turn Sim (Q46) | Debrief and app frame threads, through the coordinator |
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
6. **G-warm** (tasks 17 and 18), last because it needs a new engine piece (sequences) and doesn't change anything V6 flies. Rejoins, fighting wing and fluid manoeuvring are future features (Patrick 06:59Z).

## Pull requests

- PR A: tasks 1 to 5 (engine base, first screen, readouts).
- PR B: tasks 6 to 10 (turn logic and timing, with D41, D43, D44, D45, D74, and the clock cue selectors from Q45).
- PR C: tasks 11, 12, 15 and 16 (offset box with #4 by ground track, rear check, errors, layers, hook and shackle, graph and solver; D42, D48, Q41, Q43, Q44, Q47).
- PR D: tasks 13 to 14 (profiles, CSV, browser tests, checklist).
- PR E: tasks 17 and 18 (G-warm, with sequences in the engine).

The other SMM additions (Patrick 06:40Z) ride in the existing PRs as their own commits: the separation flags in task 5 (PR A), the 5 or 7 o'clock cue in task 9 (PR B), the offset box 10-15 s band in task 11 and the check turn, delayed 45 into and away, and two-stage cross turn in task 15 (PR C).

Each PR lists the skills it applied, is reviewed with code-review-and-quality before it leaves draft, and merges on green under the merge rule once the spec is approved. PR D also runs `/security-review` (saved profiles). A and D log performance measurements.

## Risks

| Risk | Impact | What we do |
|---|---|---|
| V6's functions read the page everywhere, so golden tests need a big fake | Medium | One shared fake `$` from a settings object, in the test folder; whole-run tests reuse it. |
| A decision's fix interacts with another (for example D43 and D44 both change auto timing) | Medium | Separate commits in a fixed order, each with its own stated test; the whole-run golden shows exactly what changed. |
| The hook and 4-ship shackle pictures are read differently from what Patrick means | Medium | Draw them from the engine and check with Patrick before those commits (task 15). |
| The standards need a home shared with the debrief | Medium | Agree it through the coordinator before task 5; until then the default preset. |
| Dad's answer on the offset box clock cue (Q44c) arrives after it's built | Low | The message stays; his answer becomes one more commit. |
| The Turn Sim is flat, but the G-warm push, the cross turn and shackle crossings, are vertical | Medium | Flat versions with the vertical part labelled (the push as 5 s wings level, a crossing note instead of the 300 ft flag). |
| Core Task 12 arrives late | Low | Task 7 is the only one waiting; the correction model stays at None until it lands. |
| Drawing trails and breadcrumb labels at 4× drops frames | Low | Measure in task 4 and task 14; draw trails as one path; readouts at most 10 times a second. |

## Open questions

Q41 to Q47 answered by Patrick on 2026-09-30 (see the spec's "Answered questions"). Left: Q44c for Dad (the SMM's 10-15 s delay for #3 and #4, 16.41 para 112, is a starting point), and the pictures for Patrick at tasks 15 and 17 (hook, 4-ship shackle, delayed 45 into and away, 4-ship G-warm).
