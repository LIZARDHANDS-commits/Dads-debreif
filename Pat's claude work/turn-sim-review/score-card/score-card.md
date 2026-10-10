# Formation optimiser, Phase A: the score card on today's plans

Made by `node tools/turn-sim-score.mjs` (2026-10-10T21:02Z). Nothing that flies changed. Each cell is the term's raw seconds before its weight (weights: Fable's starting ones, optimiser plan section 4, until Patrick rules). Hard limits show under Rejects. Every scale is an estimate (`src/modules/turn-sim/live/optimise/score.js`).

| Start | Time to in band | Energy thrown away | Control movement | G above 5 | Window entry overtake | Under 200 KIAS before the window | Under the line speed target | Off the X after capture | Lead outside the canopy | Out of Lead's plane at the end | Rates profile | Weighted total | Rejects |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| LAB 5,000 right to echelon (TRJ) | 54 | 0.1 | 2.1 | 1.1 | 0.2 | 0 | 28 | 0 | 29 | 0 | 0 | 95 | none |
| LAB 4,000 to echelon (TRJ) | 50 | 0.1 | 2.2 | 1.0 | 0.2 | 0 | 26 | 0 | 26 | 0 | 0 | 87 | none |
| LAB 6,000 to echelon (TRJ) | 58 | 0.1 | 2.1 | 1.4 | 0.2 | 0 | 29 | 0 | 31 | 0 | 0 | 102 | none |
| LAB 5,000 to fighting wing (TRJ) | 24 | 0 | 2.6 | 1.0 | 0 | 0 | 30 | 0 | 13 | 0.4 | 0 | 48 | none |
| LAB 5,000 to route (TRJ) | 59 | 0.1 | 1.8 | 1.1 | 0.2 | 0 | 28 | 0 | 34 | 0 | 0 | 105 | none |
| LAB 5,000 to echelon (TRJ Away) | 97 | 0.1 | 2.2 | 1.6 | 0.2 | 0 | 44 | 0 | 34 | 0 | 0 | 148 | none |
| LAB 5,000 to echelon (SARJ) | 75 | 0 | 0.5 | 0 | 0.1 | 0 | 22 | 29 | 18 | 0 | 0 | 113 | none |
| LAB 5,000 to echelon (TRJ + roll) | 54 | 2.6 | 1.9 | 0 | 0.1 | 1.4 | 8.0 | 0 | 19 | 0 | 0 | 80 | none |
| LAB hot, 20 kt fast, to echelon | 56 | 14 | 2.2 | 1.1 | 0.2 | 0 | 44 | 0 | 30 | 0 | 0 | 117 | none |
| Fighting wing to echelon (TRJ) | 38 | 0.2 | 1.5 | 0 | 0.2 | 0 | 32 | 0 | 22 | 0 | 0 | 71 | none |
| Break and rejoin, trail to echelon (TRJ) | 78 | 0 | 1.5 | 0 | 0.2 | 0 | 40 | 0 | 34 | 0 | 0 | 124 | none |
| Break and rejoin, trail to echelon (SARJ) | 158 | 0 | 0.6 | 0 | 0 | 32 | 6.0 | 51 | 6.8 | 0 | 0 | 224 | none |

| Term | Starting weight | Source |
|---|---|---|
| Time to in band | 1 | TS-78, TS-80 |
| Energy thrown away | 1 | TS-61, TS-96; Patrick 6 Oct 01:25Z |
| Control movement | 0.3 | TS-85, TS-108 |
| G above 5 | 2 | SMM 16.17 para 44a; TS-60 |
| Window entry overtake | 1 | SMM 12.24 para 56; TS-106, TS-110 |
| Under 200 KIAS before the window | 1 | TS-75, TS-169 |
| Under the line speed target | 0.3 | TS-133 |
| Off the X after capture | 0.5 | SMM 12.24 paras 56-58 |
| Lead outside the canopy | 1 | TS-124 |
| Out of Lead's plane at the end | 0.5 | SMM Fig 12.11; TS-126, TS-127 |
| Rates profile | 0.5 | review 6.4 A (not built: the profile bounds are not in rates.js yet) |
