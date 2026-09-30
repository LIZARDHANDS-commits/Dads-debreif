# Turn Sim (formation turns)

Two-ship and four-ship formation turns from the SMM (line abreast delayed 90 and 45, hook, in-place, shackle, cross turn, offset box, spread 4), with spacing and sweep checks.

- Spec: `specs/SPEC-turn-sim.md`. Tasks: `tasks/turn-sim/`. Code: `src/modules/turn-sim/` (Turn-Sim-only math in `engine/`).
- Live as PROTOTYPE. On main through #234: SMM turn fixes (#189), controls say what is flown (#215), Delayed 45 check turn (#223), solver engine (#234).

## Paused work (all behind main; merge main in first)

| What | Branch | State |
|---|---|---|
| Screen review fixes: drag ending, reset wording, NM rings contrast, keyboard line, axe coverage | `handover/turn-sim-screen-audit` (b568d0f) | Needs one more review read. |
| Re-check of #215: notes on the Turn menu, check-turn wording, negative rear delay reads "front waits N s" | `handover/turn-sim-215-recheck` (a3a62b6) | Ready for its PR. |
| Re-check of #223: check turn only at 45°, box keeps its shape at box aft 6,000 | `handover/turn-sim-223-fixes` (f18cac1) | Ready for its PR. |
| Sequences: turns flown one after another, and the two-ship G-warm (task 17) | `handover/turn-sim-sequences` (5478339) | Engine only; screen not started. |

## Still to build

Error dragging (drag an aircraft off its spot), the spacing graph, saved profiles, sequences on screen, G-warm, then browser tests and a checklist (`docs/checklists/turn-sim.md`).

Profiles need a small shared store: add an optional `app.scenarioStore` line to `specs/SPEC-shell.md` and the shell before building them.

## Settled calls

- Default G 3.0 (SMM 16.18). Offset box trail 7,000 ± 1,000 ft (SMM 16.41). Lead 220 KIAS low block, 200 mid block.
- Shackle and Cross turn are two-ship only, greyed out for four-ship (D146).
- Hook is a same-direction 180° (Q43); shackle crosses with sides swapped (Q44).
- Rejoins, fighting wing and fluid manoeuvring are future features (FF39-FF41).

## Open

- Two questions for Dad (Delayed 45 cue; rear element delay). See HANDOVER.md.
