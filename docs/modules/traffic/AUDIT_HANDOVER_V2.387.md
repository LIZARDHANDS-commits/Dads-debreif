# Traffic and core audit: handover at V2.387

Written by the Fable audit thread, 12 Oct 2026, at Patrick's wrap-up ("make sure we have everything recorded and handed over"). It closes the audit that began with `REFACTOR_HANDOVER_V2.350.md` and `../shared/REFACTOR_HANDOVER_CORE_V2.350.md`. A new auditor reads this, then the project-files package it points at.

## 1. What was audited, and the verdicts

Every Traffic and core pull request from the refactor's step 1 to V2.383 was audited before merge: a static read of the diff (every number sourced, no second copy of a formula, no test pinned to the code's own output) plus the proof set of section 2. All passed. The audit notes, one per pull request, are in the project files: `traffic-review-package-v2350/reports/fable-*.md`.

| Merge | What it was | Flying difference against the baseline |
| --- | --- | --- |
| Refactor steps 1 to 5 (#917, #921, #924, #926, #930) | Pure moves | Byte-identical traces |
| #937 join fix (V2.372) | The turning rejoin's join point | Explained case by case |
| #941 rewind fix (V2.374) | `joinOffset` and `sideStep` carried in snapshots | Rewinds identical |
| #944 feet per NM (V2.377) | One exact constant | A PFL start moves 0.027 ft; a stale Turn Fight test fixed in the same PR |
| #949 runway at 1,892 ft (V2.380, TR-149) | Field elevation | Every trace moves 12 ft and about a second; two deconfliction calls flipped, both correctly |
| #953 descent point without limit (V2.383, TR-150) | The straight-in's 3° descent point | None inside the −50 to 50 °C box (the old clamp never bit); checked at −50 and 50 °C too |

Core (`src/core/`): steps 1 and 2 (#905, #915) proved by the core trace, a grid of about 50,000 function results, byte-identical before and after.

## 2. The proof set, and where the baseline lives

Not committed, in the project files under `traffic-review-package-v2350/`:

- `tools/traffic-trace.mjs OUTDIR [case]`: the nine cases of the refactor handover (Busy at calm, 260/15 and 320/10 on the standard day; Busy at calm on the hot and cold days; Moose Jaw with the command script; Random seeds 1 to 3 at 260/15), each 600 s, written rounded (`.txt`) and at full precision (`.fp.txt`), with one rewind check per case (seek to 150 s, step to 300 s, rows compared).
- `tools/traffic-trace-randomize.mjs`: the same for two cases with Randomize on.
- `baseline/`: one folder per main commit, named by the commit (`traffic-main-<sha>`, `traffic-randomize-main-<sha>`); `baseline/README.md` says which is current and which range of main each one covers. **Current: `traffic-main-9aa2f041` and `traffic-randomize-main-9aa2f041` (V2.383).** V2.384 to V2.387 changed nothing under `src/core`, `src/modules/traffic` or `src/ui-kit` that the traces read, so it still holds.

How a pull request is checked: run the two tools on the pull request's head in its own worktree, in the background (never re-run main; never switch the working checkout), and byte-compare with the newest baseline whose commit is an ancestor of the pull request's base. A refactor must be byte-identical. A flying change must trace every difference to its one cause and keep what a pilot would recognise: every aircraft lands on the runway, no collision, nothing below the field, the rewind rows identical to the forward run. After a merge that changes the traces, the head's traces become the new baseline when main's flying files equal the head's.

## 3. Rough spots found by the audit, not yet built

For the Traffic plan or `future.md`, in Patrick's order:

- A join's climb has no excess-thrust cap: a wingman joining from low can climb faster than the aircraft has power for. Sourced fix: the shared `excessThrustPerWeight` (`src/core/t6-performance.js`), as the circuit climb already uses.
- The pattern window height is a literal in five places (`route.js`, `weather.js`, `moose-jaw.json`) and the final-turn middle in two. One named number each.
- `PFL_CIRCLE_RADIUS_FT` is 3038.06, a number baked in from the old geometry. It should be derived from the glide ratio and the High Key height, with its source beside it.

## 4. State at hand-over

- Main is at V2.387. Its unit suite had one red test from V2.381 to V2.386, Formation's hand-over smoothness check, fixed by #961. The type-check step prints errors from the three.js loader in `node_modules`; it is warning-only (Patrick, 10 Oct 2026) and never turns CI red.
- The performance model rebuild lives on its own branch and is audited privately in the project files (`performance-rebuild/reports/`). It stays off main until Patrick says (12 Oct 2026). On it, seven module tests fail that pass on main (Formation 3, Traffic 1: the breakout from downwind rolls at 14.9°/s² against its 7.4 line, Turn Fight 3); each is its module owner's integration fix, then the branch is re-audited before any merge.
- Unseen by the audit: the app on screen. The traces prove the flying; Patrick's own flight on the published site is the sign-off.
