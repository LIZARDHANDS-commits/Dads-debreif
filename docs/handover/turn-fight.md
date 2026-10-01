# Turn Fight (BFM)

A two-aircraft turning fight with two modes:
- **Simple mode** ports V6 (pinned by the golden test).
- **Energy mode** (D112) flies a real T-6A energy model from `src/core`, with climbs, dives and Auto manoeuvres (split S, Immelmann, pitch back, slice) toward the max-performance turn (MPT).

- **Where things are:**
  - Spec: `specs/SPEC-turn-fight.md`.
  - Tasks: `tasks/turn-fight/todo.md`.
  - Code: `src/modules/turn-fight/`.
  - Sign-off checklist: `docs/checklists/turn-fight.md`.
- **Live as PROTOTYPE.** On main through #235:
  - PR A to C: the V6 fight, screen, extras, decided changes and start geometry.
  - The 2D/3D switch, with the 3D fallback on a graphics reset.
  - The Energy engine (`energy-sim.js`, with no screen yet).
- **Energy engine rules now on main:**
  - The top speed is core's `modelMaxIasT6A`, exported here as `energyTopKias`. It is VMO 316 KIAS, or true Mach 0.67 in the model's IAS: 316 KIAS up to about 17,566 ft, 300 at 20,000 ft, 269 at 25,000 ft.
  - The MPT speed is 125 to 175 KIAS (`MPT_KIAS_RANGE`).
  - `state.evenFight` is true only when both noses came on together and no chase has started.

## Status: Completed (Milestone 2 / Gate 2 Sign-Off Ready)

Turn Fight is 100% complete and fully verified:
- **504/504 unit tests green** (`tests/unit/turn-fight/**/*.test.js`).
- **67/67 Playwright E2E tests green** (`tests/e2e/turn-fight.spec.js`, including 18 Energy tests and axe accessibility).
- **TypeScript typecheck clean** (`npm run typecheck`, 0 errors).
- **Vite production build clean** (`npm run build`, sizes within budget).
- **Tactical 3D Suite** integrated: vertical dashed plumb lines and ground-shadow contact discs (D392).
- **Immelmann G-Law** calibrated: 5.0 G pull to stick shaker then rides boundary (D393).
- **8 Forensic Traps neutralized**: coordinate snap, mutual pursuit, D386 10° elevation cone, topKiasAt Mach 0.67 corner, D381 Immelmann <= 140 KIAS slice/split-S constraint, Neutral Head-on UI relabeling, test expectation alignments, and head-on pass check bypass.
- **Patrick Gate 2 Sign-Off Ready**: Checklist at `docs/checklists/turn-fight.md`.

## Implemented Work (PATCH-023)

| What | Where | State |
|---|---|---|
| Energy screen (PR D, task 10's screen half) | Merged and integrated with engine on main | 100% complete. Error catch narrowed to engine setup errors; unit tests verify RangeError containment. All 18 Energy E2E tests passing green. |
| Tactical 3D Suite (D392) | `src/modules/turn-fight/view3d.js` | 100% complete. `computeFloorZ` and `computePlumbGeometry` tested and verified in 2D/3D. |
| Immelmann G-Law (D393) | `src/modules/turn-fight/energy-sim.js` | 100% complete. 5.0 G pull to shaker line via `pullCmdG(ctx)`. |
| MPT Range & Aerodynamic Limits | `state.js`, `energy-sim.js` | 100% complete. 125 to 175 KIAS MPT range; Mach 0.67 corner speed (269 KIAS at 25,000 ft). |
| Standard Defaults (D384) | `state.js`, `layout.js` | 100% complete. "Reset to Standard Defaults" loading SMM 3.0 G standards. |
| Neutral Head-on (D368/D372) | `layout.js`, `tests/e2e/` | 100% complete. Relabeled from legacy V6 text. |

Known limit: OVER G cannot be triggered from the screen in Auto mode, because Auto never pulls past +7 G and no forced move does. The flag and its words are built, unit-tested, and verified in E2E.


## Small fixes left from the last check (#219 re-check)

These are worth doing:
- **Time label.** More detail's "Time since the pass" counts from T+0 when the turns start at once or there is no pass. Label that row "Time since the turns started" in those cases, and add a readouts unit test.
- **Checklist wording** (`docs/checklists/turn-fight.md`):
  - The trails are blue and red, not yellow.
  - With Climb and dive, the side view shows Blue rising and Red falling only *after the pass*.
  - After a graphics reset, View stays 2D, even after a reload, until you choose 3D again.
- **Greyed height box.** With Climb and dive off, Red's height box is greyed but still shows a number. This is optional.

Cut under the Streamlined build (3D is a bonus): the other 3D fallback items. These are focus after a reset, the restored-context listener, canvas clean-up, the note's wording, and a console recipe for testers. They go on the future features list if wanted.

## Settled calls

- Stall 86 kt (Patrick, D158; V-n diagram). Zoom weight 5,800 lb (D159).
- The level MPT keeps the turn-chart bank (about 69°); the SMM's 75° is in the help text (D143).
- The split S pulls up to 5 G at the shaker (D144). Above 220 KIAS, Auto picks an Immelmann or a pitch back by a short look-ahead, whichever gets there faster (D145, Patrick 09:32Z).
- Only OVER G and STALL are flagged. Pursuit is Pure by default (D132).
- Every manual KIAS (VMO, stall, charts) is compared with the model's IAS, which has no compressibility (D273). The Mach limit alone is checked as true Mach 0.67 (review rows D345, D347, D349 and D350).

## Open

- Two questions for Dad, in `docs/records/dads-questions.md`:
  - a slice or a split S below 120 KIAS;
  - whether the lowest Immelmann top speed should be 120 or about 140.
- Future: the chaser picks its own pursuit (FF42).
