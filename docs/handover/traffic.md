# Traffic Pattern Sim

Moose Jaw traffic pattern simulator (V6's traffic iframe). Left side defines patterns; right side spawns aircraft that fly them, with wind changing crab and ground speed by aircraft type.

- Spec: `specs/SPEC-traffic.md` (approved). Tasks: `tasks/traffic/plan.md`, `tasks/traffic/todo.md`. Engine API: `src/modules/traffic/README.md`. Code: `src/modules/traffic/`.
- Live as PROTOTYPE. On main through #220: screen, engine (V6-pinned goldens), setup fixes against the manuals (`tests/crosscheck`), profiles and rewind.

## Paused work

| What | Where | State |
|---|---|---|
| Satellite photo and 3D view (task 8) | PR #229, branch `claude/traffic-spec-j17uqw` (head 13f2397) | CI green on 2026-09-30 15:42Z, not merged; main has moved since, so merge main in and let CI run again. Includes the 3D e2e timing fixes. No more 3D work after it. |
| Polish batch (TR-03/14/15/16/17/18/20, review items PR-01..06, UI-01/02) | branch `handover/traffic-polish` (68e59d9) | Reviewed twice, pass. Needs main (and #229) merged in: keep the playback bar tidy once the 2D/3D switch is in it, and check PR-03 against main's storage `raw(name)` (#230; the branch already calls `raw?.()`). It also edits `tasks/traffic/todo.md` (TR-20 notes on tasks 12 and 15), so expect a small conflict there; keep both. |
| Rewind fix: spawn, remove and Clear finished are timed events; replay after an edit runs in slices (RW-01/02/03) | branch `handover/traffic-rewind-fix` (eed055b) | Review blockers fixed (a reused callsign after spawning while rewound; a stale picture after an edit). Not yet run since those fixes: full `npm test`, typecheck and build (Traffic unit, golden and e2e passed). One nit left as is: an edit made during a replay finishes it in one go. |

## Order to pick up

1. Merge #229 (merge main in, CI green, merge).
2. Polish branch as one PR.
3. Rewind fix as one PR.
4. Core, with tolerance-based tests:
   - Task 10 wind: crab and ground speed from the type picked at spawn.
   - Task 11 aircraft types: T-6A, CT-156, Grob, Tutor rows.
   - Task 12, only what the break and traffic on final need (D46 arcs, turn hand per runway, 60° break, runway 11R).
   - Task 15 the break and the final turn: a continuous descending final turn from the perch to the window, up to 45° at 120 KIAS (SMM 4.19); break at 60°/2 G.
   - Task 18 traffic on final (sequencing).
   - Task 13 polish and checklist, only what the core needs; write `docs/checklists/traffic.md`.
5. End of module: one full test pass (unit, full e2e, screenshots, axe), the Verification check, the rest of task 24 limited to spacing on final and break timing, then Patrick's sign-off.

Streamlined build rules apply throughout: tolerances (about ±1 kt, ±50 ft, ±1°, ±1 %) instead of exact matches, no fuzz or mutation runs, and until the end of the module a PR needs only GitHub's automatic tests green.

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
