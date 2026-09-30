# Tennis ball: V6's two solvers disagree (#19)

**Decided by Patrick on 2026-09-30 (D62, D63).** There is one solver, `tennisBall` in `src/core/tennis.js`. It starts from the debrief map's solver, pinned to V6, and then:

- The ball carries the shooter's whole velocity, climb included (Q33, D62).
- The target flies its recorded path, climb included (Q34 and Q37, D62).
- The cone is ±3° for a width of 6 (Q35, D63). This is flagged for review later.
- INTERCEPT needs the target in the cone (Q36, D63). This is flagged for review later.

The 3D arc's solver is not kept. Both views show this one solution. What follows is the comparison that led here.

V6 works out the tennis ball twice: once for the debrief map (`getKmlTennisSolution`, line 3140) and once for the 3D view (`draw3DDogfightArc`, line 3970). Both write to the same readout, so a student can see one verdict and then the other. Both are now in `src/core/tennis.js`, each matching V6 exactly (`tests/golden/core-tennis.test.js`). The rebuild needs one. Choosing it is for Patrick and Dad.

## Where they differ

| | Debrief map | 3D view |
|---|---|---|
| Ball speed | Ball speed tilted by pitch, plus the shooter's speed flat | Ball speed plus shooter's speed, both tilted by pitch |
| Shooter pitch | Recorded pitch, or estimated from the climb | Pitch bias setting only: neither the recorded nor the estimated pitch reaches the 3D view |
| Shooter heading | Direction of the track segment now | Direction flown over the last second |
| Target's path | Straight on at its current heading and speed, never climbing | Its actual recorded track over the next seconds |
| Cone, for "Cone width" 6 | ±3° | ±6°, drawn twice as wide |
| Verdicts | INTERCEPT, IN CONE, OUT OF CONE | INTERCEPT, NO INTERCEPT |
| Checks along the path | About every 0.15 s (20 for 3 s) | 70 steps |
| Smallest hit radius | 10 ft | 1 ft |

In both, INTERCEPT ignores the cone: a target 8° off the nose can be an intercept with a ±0.05° cone.

## The same moment, two answers

These are V6's defaults (350 kt ball, 3 s, 250 ft, gravity on). Both jets fly at 200 kt, 5,000 ft, with the shooter 1,500 ft behind. `tests/unit/core/tennis.test.js` checks each line.

| Situation | Debrief map | 3D view |
|---|---|---|
| Level and straight | INTERCEPT, 105 ft | INTERCEPT, 103 ft |
| Shooter 10° nose up | INTERCEPT, 158 ft | NO INTERCEPT, 308 ft |
| Shooter 10° nose up, target 300 ft higher, as V6 runs it (3D gets pitch 0) | INTERCEPT, 144 ft | NO INTERCEPT, 400 ft |
| Target in a 4 G left turn | INTERCEPT, 105 ft | NO INTERCEPT, 320 ft |

## Questions for Dad

1. Should the ball carry the shooter's whole velocity, climb included, as a thrown ball would? That is what the 3D view does.
2. Should the target fly its recorded track, as in the 3D view? The debrief is a replay, so the track ahead is known. The other choice is to extrapolate, as a pilot would judge it in the air.
3. Is "Cone width" the full width (the debrief's ±3° for 6) or the half-width (3D's ±6°)?
4. Should INTERCEPT require the target to be in the cone?
5. Should the target's climb or descent count? The debrief ignores it; the 3D view follows the track.

Until these are answered, the rebuild can show either solver unchanged. Both are pinned, so any answer lands as a separate, tested change (D10).
