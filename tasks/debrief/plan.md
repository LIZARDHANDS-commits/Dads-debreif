# Debrief screen: plan

Spec: [`specs/SPEC-debrief.md`](../../specs/SPEC-debrief.md), approved by Patrick on 2026-09-30. Tasks: [`todo.md`](todo.md).

## Waits on

| Needed for | What | Owner |
|---|---|---|
| Any code | Flight data PR #58 merged (reading, cleaning, flight model, clock, debrief file) | Flight data thread |
| Any code | Flight math core PR #61 merged (turn math, EM point with D39, closure, estimated G) | Flight math core thread |
| Task 1 | ui-kit `controls.js` and `canvas-view.js` | App frame thread |
| Task 4 | `core/standards.js` (core PR 3): `V6_STANDARDS`, `classifyDebriefPosition(id, live, leadHdg, std)`, `classifyLeadParameters(lead, estG, std)` with est. IAS as `lead.spdKt` (D31), `standardsSummaryLines(std)`, `formationAxes(lead, hdg)` returning `{fwd, left}` | Flight math core thread |
| Task 9 | `core` tennis-ball changes for D62 and D63 (Q33 to Q37) | Flight math core thread |

Anything the debrief needs changed in those files goes through the coordinator.

## Order and why

Vertical slices, each leaving a working screen behind it:

1. **Screen and tracks first.** Loading, fit to view and the playback bar come first because everything else draws on top of them, and they close R11 and most of #23 and #24 early.
2. **Readouts before layers.** The numbers are what the debrief is for, and R9 is checked against V6 there.
3. **DFPs and the debrief file** next, so R17 is proven before the screen gets heavier.
4. **Map layers** one group at a time, with the VNC warp pinned by a golden test before it's cached.
5. **The 3D view** after the map. It reuses the readouts and the clock, so it's only the scene. V6's projection and attitude are pinned first, then D40 and the #27 fixes land as separate commits (D10).
6. **EM, tennis ball and CSV** last. The tennis ball waits on core's Q33 to Q37 changes.

## Pull requests

- PR A: tasks 1 to 3 (screen, tracks, playback, readouts without standards).
- PR B: tasks 4 and 5 (standards and DFPs with the debrief file).
- PR C: tasks 6 and 7 (map layers).
- PR D: task 8 (3D view).
- PR E: tasks 9 to 11 (EM, tennis ball, CSV, browser tests, checklist).

Each PR is reviewed with code-review-and-quality before it leaves draft, uses `/security-review` where files or network come in (A, B, C), and logs performance measurements (A, C, D).

## Risks

| Risk | What we do |
|---|---|
| Playback stutters at 16× with four tracks and all layers on | Measure in task 3 on the example flight at 1920 × 1080; draw on change only; cache projections and the VNC warp. |
| The 3D view is slow or wrong on the Canvas 2D | Pin V6's projection first; profile before any rewrite; no 3D library without asking (SPEC.md). |
| VNC charts (about 9.7 MB) hurt first use | Load only when turned on; measure re-encoding before proposing it. |
| The ui-kit pieces arrive late | Task 1 can start with a thin local pan/zoom behind the same interface and swap to ui-kit's when it lands. |
| Q39 (#3 under two standards) stays open | The debrief keeps V6's labels; the change is one line in `core` when decided. |
