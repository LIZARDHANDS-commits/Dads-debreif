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

## Current Gate: Gate 1 Sign-Off Ready (Milestone 1 Complete)
- **Authoritative Master Specification:** [`specs/SPEC-traffic.md`](../../specs/SPEC-traffic.md) (unified spec superseding `SPEC-traffic-vector.md` per D406, R34; single source of truth for aerodynamics, guidance laws, and equations).
- **Master Flight Pattern Matrix:** [`docs/traffic-pattern-matrix.md`](../traffic-pattern-matrix.md) (authoritative single source of truth for nav-plan waypoints and coordinates).
- **Task Checklist:** [`docs/REMEDIATION_ROADMAP.md`](../REMEDIATION_ROADMAP.md) (Milestone 1, Tasks 1.1–1.9).
- **Landed Work (D430–D437, PATCH-050–052):**
  - **3D Scenery, Landmarks & Lighting (D430–D434, PATCH-050):** 3D camera menu bar (Fit, High look-down, Top-down, Tower, Chase, Cockpit, Padlock runway) + airborne aircraft follow modes; Performance graphics quality default; Glass Palace, Rec Centre, Student Barracks, Hangars 5 & 6 traced on satellite footprints; Window Farm, Sukanen Ship, Fiat Farm, Arrow Trees visual landmarks; SW fixed afternoon sun lighting.
  - **Breakout & High Key Kinematic Controller (D435, PATCH-051):** Breakout rejoin 2 NM prior on ENT1 along 3,500 ft corridor; High Key SE approach intercept and continuous pitch arrest controller (`calcHighKeyPitch`).
  - **Authentic PFL Architecture (D436, PATCH-051):** Kinetic zoom apex (`zoomT6A`), SMM Ch 13 adaptive bank corner cutting (35° nominal, 45° tight bank), 3D continuous wind-shaped kinematic rail (`mode = 'RAIL'`), dynamic 2D wind-drifted glide footprint ring with range HUD, 6 tactical badges, and terrain contact clamp at 1,892 ft MSL (`status = 'crashed'` off-runway, `'landed'` on threshold).
  - **Single-Click Button Responsiveness & Stable DOM (D437, PATCH-052):** Dual `pointerdown` + `click` event listeners with 250ms debounce across all playback controls, action buttons, and layout toggles; in-place DOM updates in `aircraft.js:write()` preventing 100ms click cancellation.
- **Verification:**
  - 100% test green: all 126 unit tests passing (`high-key.test.js`, `pfl-solver.test.js`, `pfl-rail.test.js`, `pfl.test.js`, `aircraft.test.js`, etc.).
  - `npm run typecheck`: clean (0 errors).
  - `npm run build`: 100% clean (built in 534ms, all size budgets kept).
  - Active test server running on `http://localhost:5173/` and `http://10.0.0.149:5173/`.
- **Sign-Off Checklist:** [`docs/checklists/traffic.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/checklists/traffic.md).

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
- Built in Milestone 1 & Phase 3: Closed pattern (45° bank climbing left turn to break rollout position), High Key PFL (3 bugs fixed + 1.35× prototype drag, 5,000 ft threshold overflight with continuous circular glide arc), calm-wind rounded arcs, Breakout at 4,500 ft, Go-around, tickAircraft() three-mode physics engine.
- Deferred to Phase 2 (`POST_PROTOTYPE_QUEUE.md`): Prediction engine, fly-through, conflict setup, engine-out reach.

## Tips

- e2e serves `dist/`: run `npm run build` first.
- 3D e2e: click the 2D|3D radios, allow slow WebGL (20 s waits), wait a frame after a camera button before zooming.
- Remake screenshots in the same PR when the screen moves, and look at them.
