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

## Current Gate: Gate 1 Refinements (D390 / D391)
- **Authoritative Master Specification:** [`specs/SPEC-traffic-vector.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/specs/SPEC-traffic-vector.md) (single source of truth for aerodynamics, guidance laws, and equations).
- **Execution Plan:** [`tasks/traffic/vector-physics-plan.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tasks/traffic/vector-physics-plan.md) (Before/After diagrams, 4-step pipeline).
- **Living Task Checklist:** [`tasks/traffic/vector-physics-todo.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tasks/traffic/vector-physics-todo.md) (discrete Stage 1 & Stage 2 slices).
- **Safety Pre-Edit Backup:** [`src/modules/traffic/sim.js.pre-vector.bak`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/sim.js.pre-vector.bak).
- Landed: PATCH-018 (3D satellite ground plane unfreeze & base airfield runways canvas rendering), height drop lines moved to Layers menu.
- Landed: PATCH-020 (Stage 1 Vector Physics Slices A–E in `sim.js: fly(a)`, overhead break drag curve, dynamic perch capture, adaptive final turn descent easing, touch-and-go closed pattern circuit, and crosscheck expected table realignment).
- Landed: PATCH-021 (Stage 2 Pilot UI Controls: operational spawner presets for Inner Downwind/Perch/Final, multi-track display toggles, in-flight Breakout and Go-around action buttons).
- Next up: Gate 1 Verification Checklist (`docs/checklists/traffic.md`) & human sign-off with Patrick.
- Full test baseline: `npm test` passes 100% green (2,965 passed, 0 failed, 1 skipped).
- Production build: `npm run build` passes in ~348ms.
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
- Not built (future features): PFLs, engine-outs, prediction, live rules, fly-through, departure-end break, closed pattern, set up a conflict, engine-out reach.

## Tips

- e2e serves `dist/`: run `npm run build` first.
- 3D e2e: click the 2D|3D radios, allow slow WebGL (20 s waits), wait a frame after a camera button before zooming.
- Remake screenshots in the same PR when the screen moves, and look at them.
