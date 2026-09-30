# Turn Sim (formation turns)

Two-ship and four-ship formation turns from the SMM (line abreast delayed 90 and 45, hook, in-place, shackle, cross turn, offset box, spread 4), with spacing and sweep checks.

- Spec: `specs/SPEC-turn-sim.md`. Tasks: `tasks/turn-sim/`. Code: `src/modules/turn-sim/` (Turn-Sim-only math in `engine/`).
- Live as PROTOTYPE. On main through #234: SMM turn fixes (#189), controls say what is flown (#215), Delayed 45 check turn (#223), solver engine (#234).

## Paused work (all behind main; merge main in first)

Nothing below has been merged. The judgement calls in it are in the decisions log. Some rows still have no D number, e.g. the In-place 90 trail judge, "Not judged" after a check turn, wingmen-only dragging, negative box shift and the G-warm legs.

| What | Branch | State |
|---|---|---|
| Task 12 screen: Aircraft errors moved into the settings menu under "More …"; **error dragging** (drag or keyboard-nudge a wingman before Play, stored as its position error; Lead stays put); NM rings layer; then the review fixes (Lead not movable, announced keyboard nudges, "Reset aircraft errors", ring contrast, axe with menus open) | `handover/turn-sim-screen-audit` (b568d0f) | Built; needs one more review read. Local run: 2,985 unit, 105 Chrome e2e pass. |
| Re-check of #215 and #223 (screen): a finished In-place 90 is judged **in trail** from each wingman's own reference aircraft (no more false "#2 TIGHT / FORE"); a check turn's end reads "Not judged"; More detail shows trail numbers; circle labels no longer overprint; select lists not cut off; greyed Direction shows the side flown; the four-ship Shackle/Cross switch also runs on opening; `app.scenarioStore` values are run through `checkSettings`; check-turn notes and labels (C2-C8); a negative rear delay reads "front waits N s"; the `checkFallback` note | `handover/turn-sim-215-recheck` (a3a62b6) | Built; 3,087 unit tests pass. The full Chrome e2e run and the screenshot remake were not done yet. The `checkFallback` note needs `turn-sim-223-fixes` merged first. |
| Re-check of #223 (engine): the Delayed 45 check turn flies only at 45° Turn degrees, other angles fall back to the plain chain with `state.checkFallback`; the box keeps its shape at Box aft 5,000-6,000 (the solved shift may be negative: the front element waits) | `handover/turn-sim-223-fixes` (f18cac1) | Built; 3,087 unit tests pass. 45° is pinned bit for bit before the change. Ready for its PR. |
| Sequences (task 17, engine): `engine/sequence.js`, `createRun` options `continueFrom` and `level`, two-ship G-warm legs; four-ship refused (a `test.todo`) | `handover/turn-sim-sequences` (5478339) | Engine only; 3,096 unit tests pass. Screen (Exercises panel) not started. |

**Merge order.**
1. `223-fixes`.
2. `215-recheck`. It conflicts with 223-fixes in `specs/SPEC-turn-sim.md` only.
3. `screen-audit`. It conflicts with 215-recheck in `view.js`, `tests/e2e/turn-sim.spec.js` and the Turn Sim screenshot. Keep both sides' changes and remake the screenshot.
4. `sequences`. It merges cleanly with 223-fixes and screen-audit.

## Still to build

- **Spacing graph and solver on screen (task 16).** The engine is on main (#234: `engine/solver.js`, `engine/series.js`, pinned to V6). The screen still needs two checkboxes, off by default: the graph (`graph.js`) and a Solve button with a busy state (a 600 s run takes about 4 s). Label the answer "at Duration (N s)".
- **Saved profiles and CSV (task 13).** The Turn Sim already reads an optional `app.scenarioStore` (on the 215-recheck branch). `specs/SPEC-shell.md` and the shell still need to add it: one line in the app table for an optional store with `get(name, fallback)` and `set(name, value)`.
- **Sequences on screen and G-warm (tasks 17-18).** Add the Exercises panel with a G-warm button. The four-ship spread-4 G-warm waits for Patrick's picture check.
- **Module sign-off (task 14).** The full local run, screenshots, axe, the Chrome/Firefox/Safari check, `docs/checklists/turn-sim.md` and the README.

Error dragging is built (on `handover/turn-sim-screen-audit`), so it is no longer on this list.

## Settled calls

- Default G 3.0 (SMM 16.18). Offset box trail 7,000 ± 1,000 ft (SMM 16.41). Lead 220 KIAS low block, 200 mid block.
- Shackle and Cross turn are two-ship only, greyed out for four-ship (D146).
- Hook is a same-direction 180° (Q43); shackle crosses with sides swapped (Q44).
- Rejoins, fighting wing and fluid manoeuvring are future features (FF39-FF41).

## Open

- Two questions for Dad (Delayed 45 cue, D257/C3; rear element delay, D281/N5). See HANDOVER.md.
- Patrick: the four-ship G-warm picture (spread-4, SMM 16.44) before it is built.
