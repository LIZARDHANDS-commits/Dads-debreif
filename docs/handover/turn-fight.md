# Turn Fight (BFM)

Two-aircraft turning fight. Simple mode ports V6; Energy mode (D112) flies a real T-6A energy model from `src/core` with climbs, dives and Auto manoeuvres (split S, Immelmann, pitch back, slice) toward the max-performance turn (MPT).

- Spec: `specs/SPEC-turn-fight.md`. Tasks: `tasks/turn-fight/`. Code: `src/modules/turn-fight/`. Checklist: `docs/checklists/turn-fight.md`.
- Live as PROTOTYPE. On main through #235: PR A to C, 2D/3D, Energy engine, Energy top speed from core's `modelMaxIasT6A` (VMO 316 KIAS, true Mach 0.67), MPT speed 125 to 175.

## Paused work

| What | Where | State |
|---|---|---|
| Energy screen (PR D): graphs, winner rules, checklist numbers, speed-at-height helper | branch `handover/turn-fight-energy-screen` (226729d) | Top commit is WIP: narrower error catching, every Energy setting resets, start picture and pass line follow what flies. No unit or e2e run yet. |

## To finish the Energy screen

1. Merge main in. Swap the `topKiasAt` helper to `energyTopKias` (now on main via #235). MPT minimum 125.
2. Add the tests for the WIP commit, and the Split S pause intervals (50) item.
3. Describe the mode as "Energy (T-6)" in its help and label.
4. Low items from the last check (F1-F11) only where they touch safety or numbers; skip polish.
5. CI green, merge, then one full test pass and Patrick's checklist run.

## Settled calls

- Stall 86 kt (Patrick, D158; V-n diagram). Zoom weight 5,800 lb (D159).
- Level MPT keeps the turn-chart bank (about 69°); SMM's 75° is in the help text (D143).
- Split S pulls 5 G at the shaker (D144). Above 220 KIAS Auto uses an Immelmann or pitch back (D145).
- Only OVER G and STALL are flagged. Pursuit Pure by default (D132).

## Open

- Two questions for Dad (slice below 120 KIAS; Immelmann top speed 120 or 140). See HANDOVER.md.
- Future: the chaser picks its own pursuit (FF42).
