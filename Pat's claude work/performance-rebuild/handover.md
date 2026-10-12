# Handover: the performance model rebuild

12 Oct 2026, last updated about 07:30Z. Branch `claude/project-thread-swv8zh`, head is the commit that adds this note, on top of `3efc66c`, which merges main V2.387 (08263f8). Main has never received any of it.

**Patrick, 12 Oct 2026:**
- 03:14Z: "do not replace any of the files yet or push this to main".
- 07:06Z: "the performance thread stays on its own branch for now".

Nothing on this branch goes to main, or into a pull request, until Patrick says so.

## What is on the branch
`src/core/t6-performance.js` is rebuilt from public sources, the SMM and EFIG, standard aerodynamics and Patrick's flying experience. Every number carries its source in the file.

| Commit | What it does | Patrick's ruling |
|---|---|---|
| c62dc21 | The model from public and pilot sources | spec approved 12 Oct 00:20Z |
| 612fd80 | Drag 0.027 and the propeller curve; speed brake and idle propeller drag in core | 12 Oct 04:03Z |
| 8e82e13 | At 4 to 6 % torque the propeller flies as if feathered | 12 Oct 04:16Z |
| 0450381 | Idle propeller drag full to 200 KIAS, gone by 250 | 12 Oct 05:52Z |
| 10eec49 | Full power to 16,000 ft; pitch fitted to his attitudes; weight in the stall, shaker and pitch | 12 Oct 05:55Z |
| 2c19567 | A tail slide under 1 KIAS no longer stops the split S, zoom or fight step | bug fix |
| cc82530 | The split S settings test checks what a pilot sees, not earlier numbers | 12 Oct 06:31Z |
| 238878a | Idle propeller drag full to 220 KIAS, gone by 250 | 12 Oct 07:18Z |
| aabab26 | No extra drag near the stall: the level MPT is about 147 / 144 / 141 KIAS at sea level, 6,000 and 10,000 ft (SMM 14.14) | 12 Oct 06:42Z |

`tools/trj-casadi/model.py` carries the same inputs.

## Review
Fable reviewed `aabab26` on 12 Oct and passed the model and the core tests.

## Left before it can go to main
Five unit tests fail on this branch and pass on main (V2.387). All of them are in modules that were tuned to the old model, not in core. Each owner fixes its own file:

1. **Formation, 4-ship Side switch:** two aircraft come within a wingspan (echelon right).
2. **Formation, 4-ship turn buttons:** #4 is not rolling with Lead (echelon, hook right: 1° against −12°).
3. **Traffic, smooth breakout from downwind at 20 kt from 200:** a turn-rate snap (14.9°/s² where 7.4 is allowed).
4. **Turn Fight, a jet forced past the reference line:** the forced split S now peaks at 302 KIAS, short of its 305 line. The test's entry needs to be faster.
5. **Turn Fight, pure pursuit:** the chaser goes 0.06 G over the shaker.

The 4-ship "tour of the formations" crash on a negative speed was fixed on main by Formation's #961 (V2.387) and passes here.

Also at integration:
- `src/modules/turn-sim/live/slow-down.js` keeps its own idle propeller and speed brake figures. It should use core's, which now fade the idle drag out between 220 and 250 KIAS.
- `docs/modules/shared/flight-math.md` still lists `zoomT6A`, which this branch removes.
- The page `docs/references/how-the-performance-model-works.md` (approved wording) goes in with the docs pull request.

## Open questions for Patrick (the model keeps its current values until he answers)
1. **Available G at speed:** on the shaker at low level, what speed gives 4 G, and what speed 7 G?
2. **Static thrust:** keep 3,100 lbf? It meets his 3,100 ft/min climb.
3. **Take-off ground roll:** what does he see?
4. **The climb above 20,000 ft:** the model climbs a little too fast up there. A likely cause is propeller tip speed near Mach 0.9 at height, which the model leaves out (a guess; nothing sizes it). His rough time to FL250 would settle it.
5. **Temperature:** the model is a standard day only. Add it to the future list?
6. **Gear-down drag:** two of his figures disagree. The 2,600 ft gear-down orbit (SMM 13.5 para 11, his 6 Oct ruling) needs about 2.5 times the gear drag that his 35 % torque at 120 KIAS with gear and takeoff flap allows. The model keeps the orbit's larger drag for engine-off flight only, so a powered orbit at 5 % torque loses about 1,950 ft. Which should win?

## Not seen
- Not flown in the app.
- CI has never run on this branch.
- Formation has not been flown on the new model.
