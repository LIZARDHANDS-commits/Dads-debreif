# Fight Sim: aircraft data display (proposal)

Patrick, 10:43Z: "The data boxes cover the aircraft right now. What should we display on the right?" Read from main `1020583`. Proposal only.

## Today

- **Data tags on the jets** (`view.js:180-207`, `view3d.js:761-790`, text from `readouts.js:124`): a 2-line box 14 px beside each jet: "220 KIAS · 5.0 G" and the move ("Pitch back (Shaker)"). Fixed offset, no leader line, no check for the other jet, its trail or the other tag, so in a close fight they cover the jets and each other (TF-R19 asks that they never do). On by default; the switch appears twice.
- **Right column, Result** (`energy-readouts.js:92-120`): kill/collision line, KIAS, altitude, G, move, "To the MPT" (time and degrees), flags, range, first nose-on, chase, winner.
- **More detail (closed)** (`:127-139`): TAS, climb angle, bank, Ps, energy height, ATA, AA, HCA, time since the pass.
- Missing: turn rate and radius in Energy (TF-R16, plan Step 2), closure rate, the "why" of the move (shown only under the setup boxes on the left), the shaker G the jet could pull.

## Proposed

### On the jets (2D and 3D)

- The letter B or R on the jet always.
- Tag (when on): **two short lines** on a short leader line, placed on the side away from the other jet and its trail, nudged so tags never overlap. Line 1: "220 · 5.0 G" plus SHAKER or STALL when on (STALL in the alert colour). Line 2: the move ("Pitch back") (Patrick, 10:45Z).
- When the jets are close (about 1,000 ft, an estimate to tune on screen), the tags shrink to the letter and SHAKER or STALL only, so nothing covers the picture when it matters most.

### Right column, top to bottom

| Block | Rows | Why |
|---|---|---|
| 1. Fight state | One line: "Blue wins: gun kill at T+55.7", or "Fighting: Red offensive, 0.4 NM, Blue defensive" | The answer first |
| 2. Blue / Red side by side | KIAS; altitude; G pulled and G available (shaker) as "4.8 / 5.1 G"; turn rate (°/s); turn radius (ft); move and the reason in one line; flags (STALL, OVER G, below deck, over top speed) | The pilot's numbers; turn rate and radius are the module's name (TF-R16) |
| 3. Geometry | range; closure (kt); ATA each; AA; HCA | BFM terms, SMM 12.2 |
| 4. Energy | energy height each; Ps each (gaining / bleeding) | Who is winning the energy game |
| 5. Events | first nose-on; chase; time since the pass | |
| More detail (closed) | TAS, climb angle, bank, time and turn to reach the MPT | Detail for the curious; "To the MPT" no longer a headline now that the MPT is not the goal (TF-R6) |

Everything the column shows comes from the engine's state; no new physics.
