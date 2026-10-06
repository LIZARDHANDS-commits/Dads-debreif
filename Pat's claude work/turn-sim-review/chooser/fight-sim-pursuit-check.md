# Fight Sim's pursuit: the three suspected faults, checked

Fable, 5 Oct 2026, reading only (the Fight Sim thread owns these files). Repo main `8ad75a3`. Section 5 of `../fable-compiled.md` listed three faults suspected but unchecked in Fight Sim's chase, carried over from the Formation rejoin review. Here is what the code does.

| Suspected fault | What the code does | Verdict |
|---|---|---|
| **Chases every step** (re-aims each 0.05 s, the Formation tracker's fault) | `energy/moves/pursuit.js` `controlPursuit` re-aims the lift at the aim point every step through core's `liftTowardAim` (`src/core/point-mass.js`), with a pointing gain (`TUNING.chaseGainPerSec`). The command then goes through `energy/smoothing.js`: G builds at no more than `gOnsetGPerSec`, the roll rate through core's `easeRoll`. | True, and right for the job. A chaser tracking a target is a gunsight; it should re-aim every instant. The Formation fault was a tracker flying a long move that a pilot flies with a held bank and power. The named moves (yo-yos, Immelmann, the MPT) are the held parts in Fight Sim. |
| **Closure read as range rate instead of overtake** | `tacticalAimCalculation` works out `closureKt` as range rate (minus the relative velocity along the line of sight). It is used only to weight the blend of lag, pure and lead aim points. No pursuit step commands a speed: `controlPursuit` returns `throttle: 1` always. | Not the Formation fault. In Formation the closure number set a speed and was read three ways in three files. Here it only moves the aim point. Whether a range-rate blend is the right cue for lag versus lead is a tactics question for the Fight Sim thread, not a units fault. |
| **High-G turns cost no speed** | `energy/aircraft.js` `flyStep` calls `stepPointMass(pm, { g, bankRad }, d, excessFnFor(throttle))`. `excessFnFor` (`src/core/t6-performance.js`) returns thrust minus `dragPerWeight(kias, altFt, g)`, so drag rises with the G flown. | False. Energy is charged at the G flown. It is the Formation Sim's `flight.js` that charges no G for speed (speed follows planned segments) and no pull for a height change. |

**What this means for the chooser:** nothing in Fight Sim needs porting or fixing. The only cross-over worth a later decision is the other way round: Formation's vertical (height as energy, the lag roll's G) would be more honest on core's point mass, which Fight Sim already uses.

**Unchecked:** whether the chase gain and the smoothing numbers give a pilot-like chase on screen; the lag versus lead blend thresholds (1,800 to 4,000 ft, 40 to 100 kt of closure, estimates in the code with a doctrine note); the MPT re-pick cadence (every 3.5 s after a 4 s lock-out). None of these is a fault, and none bears on the Formation chooser.

## Added 5 Oct 21:48Z (Fable, from the Formation Sim work)

Two things worth carrying into the two-ship manoeuvring module's next piece of work; nothing else from TS-76 to TS-80
applies to it (bands, slots and the formation chooser are Formation's).
1. Energy sanity check: the core T-6 curve gives about 1.6 kt/s at 200 KIAS, 1.05 at 220, 0.5 at 240 and nothing near
   255 at 8,000 ft, level, 1 G. A look-ahead pilot that sustains speed in a hard turn, or accelerates while turning, is
   outside the aircraft. Check its traces against this once.
2. Show what the aircraft cannot do rather than hide it: Formation flags a planned path the aircraft cannot keep as
   STRETCHED on the tag and card (full-power.js holdToPower). If the look-ahead pilot ever picks a move the aircraft cannot
   fly, it should show the same way, not quietly cap it.
