# Traffic Pattern Sim

Moose Jaw traffic pattern simulator (V6's traffic iframe). Left side defines patterns; right side spawns aircraft that fly them, with wind changing crab and ground speed by aircraft type.

- Spec: `specs/SPEC-traffic.md` (approved). Tasks: `tasks/traffic/plan.md`, `tasks/traffic/todo.md`. Engine API: `src/modules/traffic/README.md`. Code: `src/modules/traffic/`.
- Live as PROTOTYPE. On main through #220: screen, engine (V6-pinned goldens), setup fixes against the manuals (`tests/crosscheck`), profiles and rewind.

## Completed work (Milestone 1)

| What | Where | State |
|---|---|---|
| Satellite photo and 3D view (task 8) | PR 1 (PR #229) | Merged to `main` (commit `64cc09a`). Three.js 3D camera and Esri satellite tiles. |
| Polish & Rewind Fix (tasks 9/13, RW-01..03) | PR 2 (`traffic-polish-rewind`) | Merged to `main` (commit `4405cd9`). Callsign indexing safety on rewind verified (+422 lines of tests). |
| Traffic Core 4 (tasks 10/11/12/15/18) | PR 3 (`traffic/pr-3-core-4`) | Merged to `main` (commit `73ee4f4`). Wind vector math, authentic 15 Wing types, 60° break, 45° descending final turn, D389 perch drift guidance, D46 true circular arcs, zero-jump split/joins, and all 8 plausibility guards passing green. |
| Interactive Wind UI & Sim Updates (PATCH-014) | Direct on `main` | Merged to `main` (commit `8d6a517`). Bottom playback bar wind inputs wired, real-time dynamic crabbing and ground speed simulation updates. |

## Current Gate: Vector Guidance Migration approved (D406). Phases 1–5 pending.
- **Authoritative Master Specification:** [`specs/SPEC-traffic.md`](../../specs/SPEC-traffic.md) (unified spec superseding `SPEC-traffic-vector.md` per D406, R34; single source of truth for aerodynamics, guidance laws, and equations).
- **Master Flight Pattern Matrix:** [`docs/traffic-pattern-matrix.md`](../traffic-pattern-matrix.md) (authoritative single source of truth for nav-plan waypoints and coordinates).
- **Task Checklist:** [`tasks/traffic/vector-migration-todo.md`](../../tasks/traffic/vector-migration-todo.md) and [`tasks/traffic/todo.md`](../../tasks/traffic/todo.md).
- **Execution Plan:** [`tasks/traffic/plan.md`](../../tasks/traffic/plan.md) (Phases 1–5).
- **Legacy Remediation Checklist:** [`tasks/traffic/remediation-todo.md`](../../tasks/traffic/remediation-todo.md).
- Landed: PATCH-018 (3D satellite ground plane unfreeze & base airfield runways canvas rendering), height drop lines moved to Layers menu.
- Landed: PATCH-020 (Stage 1 Vector Physics Slices A–E in `sim.js: fly(a)`, overhead break drag curve, dynamic perch capture, adaptive final turn descent easing, touch-and-go closed pattern circuit, and crosscheck expected table realignment).
- Landed: PATCH-021 (Stage 2 Pilot UI Controls: operational spawner presets for Inner Downwind/Perch/Final, multi-track display toggles, in-flight Breakout and Go-around action buttons).
- Landed: PATCH-022 (V2.0 visual indicator badge, zero-wind V6 outer loop elimination, CT-156 authentic 50° bank closed-pattern climbing turn physics).
- Landed: PATCH-023 (Closed pattern wings-level 118° rollout to Perch; spawner clean-up keeping working 'Start at point' with dynamic waypoint caption; calm-wind 180° rounded arcs for 60° break and 35° final turn; High Key 5,000 ft threshold overflight heading 298°; continuous 360° circular PFL glide arc; Stage 1 deactivation of SPL1–SPL4).
- Full test baseline: `npm test` passes 100% green (3,045 passed, 0 failed, 1 skipped; 609/609 traffic tests).
- Production build: `npm run build` passes in ~284ms.
- Verification checklist: [`docs/checklists/traffic.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/checklists/traffic.md).

## Settled numbers (Patrick's calls win over the manuals)

- CT-156 Moose Jaw pattern 3,500 ft at 220 KIAS (D109; manuals say 3,000, Patrick kept 3,500). Straight-in descends to 2,700, base at 140, final turn 120 at 45°, window to threshold slows to 100 KIAS (D110).
- The Grob (CT-102 Astra II) flies its own closer pattern at 3,000 ft and 180 KIAS and joins the shared straight-in base legs (D117). Harvards break and fly downwind at 3,500 ft, Grobs at 3,000 ft (D118).
- 3,000 ft gap on final, 10 % miss rate (Q75). Break spreads 220 to 120 evenly; zoom per NFM (Q74).

## Known and waiting

- The every-corner stall-line test (TR-20, polish branch) is a `test.todo` until task 12: Split 3 point 2 needs 4.19 G and Split 2 point 2 needs 3.28 G at 150 KIAS, over the 3.04 G the T-6A can pull there.
- Judgement calls made while Patrick was away are rows in the project's decisions-for-review log (Traffic Sim rows, including the note on D265 and the Clear-after-edit rule); Patrick has not reviewed them yet.

## Open

- Route redraw with Patrick and Dad (Q59, task 14). V6 routes stay until then.
- Conflict box sizes (question for Dad, see HANDOVER.md).
- Built in Milestone 1: Closed pattern (50° bank climb, 118° downwind rollout to Perch), High Key PFL (5,000 ft threshold overflight with continuous 360° circular glide arc), calm-wind rounded arcs, Breakout, Go-around.
- Deferred to Phase 2 (`POST_PROTOTYPE_QUEUE.md`): Prediction engine, fly-through, conflict setup, engine-out reach.

## Tips

- e2e serves `dist/`: run `npm run build` first.
- 3D e2e: click the 2D|3D radios, allow slow WebGL (20 s waits), wait a frame after a camera button before zooming.
- Remake screenshots in the same PR when the screen moves, and look at them.
