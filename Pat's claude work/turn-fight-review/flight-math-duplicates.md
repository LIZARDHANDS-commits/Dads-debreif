# Fight Sim: flight math duplicated outside src/core

From a Sonnet reader's report (line numbers checked on main 1020583), plus my own reading. "Core" is `src/core/`; the shared list is `docs/modules/shared/flight-math.md`.

**In short:** Fight Sim is much cleaner than Traffic was. The physics (point-mass step, thrust, drag, stall line, energy height, IAS/TAS, split S) all come from core. What is duplicated is guidance and geometry helpers, plus one home-made integrator for the tumble.

| What | Copies in Fight Sim | Core already has | Agree? |
|---|---|---|---|
| Roll toward a bank, short way round | `energy-sim.js:1694-1699` | `flight-math.js:207` `rollToward` | Identical, line for line. Delete and import. |
| Lift needed to bring the flight path onto a target angle, cos γ + (V/g)·ω·Δγ | `energy-sim.js:1072, 1291, 1360, 1668` (4 copies) | `flight-math.js:238` `dampedClimbG` | Same formula (ω = 1 in both). Use core. |
| Bank from G, acos(1/G) | `view3d.js:86-88` (cutoff G > 1), `readouts.js:113` (cutoff G > 1.01) | `flight-math.js:30` `bankDegFromG`, `MIN_TURN_G` 1.01 | Same maths; the two cutoffs disagree between 1 and 1.01 G. |
| Smooth roll with finite roll acceleration | none (roll rate jumps 0 to 90°/s in one step) | `flight-math.js:221` `easeRoll` | Missing in Fight Sim: the cause of the wing snaps (traces.md). |
| Pitch attitude = flight path + angle of attack | none; 3D shows the flight path as the nose | `t6-performance.js:155` `pitchDegFromClimb` | Missing: in the MPT (about 3.3 G at 160 KIAS) core's estimate puts the nose about 11° above the flight path (an estimate until checked). |
| Nose-on cone (azimuth ≤ 5°, elevation ≤ 10°) | `sim.js:128-139`, `energy-sim.js:1941-1955` | none | Same code copied. One shared rule needed (lesson 8). |
| 3D angle off the nose (ATA) | `sim.js:98-111` (atan2), `energy-sim.js:939-945` (acos), `view3d.js:705-711` (acos) | 2D only (`angles.js:65`) | Same quantity, three ways; acos is less accurate near 0° and 180°. |
| Aspect angle, HCA, side of the other | `energy-sim.js:952-963` and others | `angles.js:89, 96, 65` (2D) | Agree; Energy needs a 3D version. |
| Wrap to ±180° | `view3d.js:78` | `angles.js:28` `wrapDeg180` | Agree except exactly 180°. |
| Air density ratio | `energy-sim.js:1737-1739` (via tasToIasKt squared) | `flight-math.js:130` `isaDensityRatio` | Agree. |
| g = 32.174 | `energy-sim.js:1746` | `units.js:24` `G_FTPS2` | Agree; already imported in the file. |
| Tumble motion | `energy-sim.js:1734-1767` own Euler step, drag 0.00052 (no source) | `point-mass.js` | A second integrator; climb angle integrated apart from the velocity, so the nose and the path can disagree. |
| Part-throttle excess power | `energy-sim.js:231-235` | `excessThrustPerWeight` has no throttle | Core lacks it; candidate to add. |
| Specific excess power Ps = excess × TAS | `energy-sim.js:934-935` | none named | Candidate to add. |
| Shaker G | `energy-sim.js:225` (94 % of the stall-line G) | `t6-performance.js:347` (stall speed + 7 kt) | **Two different shaker rules on purpose** (3.25 G vs 2.96 G at 160 KIAS). Needs Patrick's ruling on one. |
| Degrees/radians inline | about 9 places | `angles.js:16, 20` | Agree. |
| VMO 316 | `state.js:210-226` literals | `T6A_LIMITS.vmoKias` | Agree. |
| Hard deck 6,000 default | `energy-sim.js:99, 1582`, `view3d.js:215` | none (a Fight Sim setting) | Agree; should be one constant. |

Core pieces Fight Sim does not use yet: `rollToward`, `easeRoll`, `dampedClimbG`, `bankDegFromG`, `gFromBankDeg`, `isaDensityRatio`, `bankDegFromTurnRate`, `wrapDeg180`, `relativeBearingDeg`, `aspectAngleDeg`, `pitchDegFromClimb`.
