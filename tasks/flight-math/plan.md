# Implementation plan: flight math (`core`)

Spec: [`specs/SPEC-core.md`](../../specs/SPEC-core.md). Tasks: [`todo.md`](todo.md). Owner: the "Flight math core" thread, which owns `src/core/`, `tests/unit/core/`, `tests/golden/` (except `v6-baseline.json`, which `tools/record_v6_baseline.js` records) and `specs/SPEC-core.md`.

## Overview

Move V6's flight math into `src/core/` one function at a time. Each port is pinned by a golden test that runs V6's own function next to it (R9). The work lands as three PRs: the base pieces other threads wait on, then turn performance, then formation standards. Dad has approved the fixes in D39 to D47; each one lands after its port, as a separate change (D10).

## Architecture decisions

- **One heading convention:** math radians, 0 = east, counter-clockwise, north up. V6 already uses this everywhere except the Traffic page, so ports need no conversion. Compass headings appear only on screen.
- **Pure functions only:** V6 functions that read page globals or input boxes take those values as arguments. The golden test supplies the same values to V6 through a prelude.
- **Duplicates collapse into one function** only when a golden test shows every V6 copy agrees, or pins exactly where they differ. Copies that disagree in a way people could see are flagged, not merged (the tennis-ball solvers).
- **Exact match by default:** tolerances only where V6's own copies differ, or when comparing with numbers recorded in a browser (1e-12 relative, because engines round `sin`, `cos` and `atan2` differently in the last digit).

## Skills used

From [`.claude/skills/`](../../.claude/skills/README.md). Each PR description lists the skills it applied.

| Skill | How `core` uses it |
|---|---|
| spec-driven-development | SPEC-core.md came first and Patrick approved it before any code. New ports that other specs ask for (Turn Sim, Turn Fight) are added to SPEC-core first. |
| planning-and-task-breakdown | This plan and [`todo.md`](todo.md): small tasks, each with acceptance, verification and size. |
| test-driven-development | Golden tests run V6's own function next to each port and must pass before the port counts (R9). A fix (D39, D62, D63, D74) first changes the test to the new expected number, sees it fail, then changes the code. |
| incremental-implementation | One function or one decision per commit: port and pin first, then each fix as its own commit (D10). |
| debugging-and-error-recovery | When a golden test stops matching V6, or CI goes red: reproduce, find the root cause, never loosen a tolerance to pass. |
| code-review-and-quality | An independent review of each PR's diff before it leaves draft. The mutation check and the browser check are part of that review. |
| code-simplification | After a port is pinned: collapse duplicate V6 copies and drop dead code, with the golden tests proving nothing changed. |

Not used by `core`: frontend-ui-engineering (no screens), security-and-hardening (no outside data; flight-data and the screens check input), performance-optimization (unless a screen measures core as slow).

### For the remaining work

- **Task 11 (3D attitude, D40, D47)** and **Task 12 (Turn Sim G correction, D74):** test-driven-development and incremental-implementation. Pin V6 in a golden test, then land each decision as its own commit, with the test changed first. Use debugging-and-error-recovery if the pin won't match. Run code-review-and-quality before the PR leaves draft.
- **Ports the Turn Sim and Turn Fight specs ask for:** spec-driven-development first, adding the API to SPEC-core. Then planning-and-task-breakdown for new tasks here, and the same build loop. Use code-simplification where a Turn Sim or Turn Fight copy duplicates a function already in `core`.

## Task list

### Phase 1: base pieces (PR #51)
- [x] Task 1: golden-test harness
- [x] Task 2: `units.js`
- [x] Task 3: `angles.js` and the heading convention
- [x] Task 4: `geo.js`
- [x] Task 5: `time.js`

### Checkpoint: base pieces
- [x] `node --test "tests/**/*.test.js"` passes (51 tests)
- [x] Mutation check: 56 of 58 caught, 2 equivalent
- [x] Browser check: Chromium matches Node (25 of 10,517 differ in the last digit, all trig)
- [x] Patrick approves SPEC-core.md (2026-09-30)
- [x] PR #51 merged (2026-09-30)

### Phase 2: turn performance (PR 2)
- [x] Task 6: turn radius, turn rate and bank from G
- [x] Task 7: air data and the EM chart point
- [x] Task 8: closure and estimated G
- [x] Task 9: both tennis-ball solvers

### Checkpoint: turn performance
- [x] Suite, mutation check (97 of 101, 4 equivalent) and browser check pass
- [x] Tennis-ball disagreement written up for Patrick and Dad (#19): [`tennis-ball.md`](tennis-ball.md)
- [ ] Patrick reviews PR 2

### Phase 3: standards (PR 3)
- [x] Task 10: formation standards classifiers and V6's default preset
- [x] Tennis ball: Patrick's answers (D62, D63), one change each, then one solver

### Later, with the screens that use them
- [ ] Task 11: 3D attitude estimate, then D40 and D47

### Checkpoint: complete
- [x] Every function in SPEC-core's tables is ported and pinned
- [x] Patrick reviews PR 3 ("go for 67", 2026-09-30)

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A prelude stub makes V6 behave differently from the real page | High | Stub only values V6 reads, never V6's code. Cross-check module results against `v6-baseline.json`, recorded in a real browser. |
| The tennis-ball solvers are tangled with drawing and input boxes | High | Pull out only the math, with settings as arguments. If that isn't possible without edits, pin by running V6 in a browser page instead. Do this task early in PR 2. |
| Engines round trig differently in the last digit | Low | Exact comparisons stay within one engine. Browser-recorded numbers are compared at 1e-12 relative. |
| Infinite or huge inputs hang V6's angle loops | Medium | Documented in SPEC-core and the core README. The screens validate typed numbers (asked of `ui-kit`). A guard in `core` needs a decision. |
| Dad's approved fixes (D39 to D47) blur into the ports | Medium | Each port lands pinned to V6 first; each fix is its own later commit, citing its decision and updating the golden value (D10). |
| Other threads build on `core`'s function names | Medium | PR 1 first. Any later rename goes through a PR and a note to the coordinator. |

## Parallel and sequential

- Tasks 6, 7, 8 and 10 don't depend on each other and could run in parallel. Task 9 uses Task 6's turn math and V6's pitch estimate.
- `flight-data` (another thread) needs only Phase 1. Turn Sim needs Phases 2 and 3. The debrief needs Phase 2 for the EM chart and the tennis ball.

## Open questions

- Q39: whether the offset standard alone judges #3's fore/aft.
- Whether `core` should also guard against infinite input (default: only the screens do).
