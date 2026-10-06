# Fight Sim architecture review (Turn Fight)

Read-only review of the Turn Fight code on main `1020583` (4 Oct 2026), for Patrick, modelled on the Traffic review (`../archive/2026-10-reset/traffic-architecture/review.md`). Nothing in the repo was changed. Appendices in this folder: `architecture.md` (flow chart, every file, every control, clean-up list), `inventory.md`, `flight-math-duplicates.md`, `traces.md` (19 fights flown in Node), `trace.mjs`.

Method: two Sonnet readers (file inventory, duplicated maths) and my own reading of `energy-sim.js`, `sim.js`, `state.js`, `playback.js` and core. I flew the engine through 19 setups in Node, with no browser. Inferences are marked.

## 1. The answer in brief

- **The aircraft model is sound. Keep it.** Every jet is moved by one integrator, core's point-mass step, with thrust, drag, stall line and limits all from core. There are no rails, blends or teleports: the largest position jump in 19 fights was 0.01 ft. This is the opposite of Traffic.
- **The pilot logic is the octopus.** Five places decide what a jet does next, eight controllers each have their own phase names, and pursuit never ends. It is all in one 2,252-line file.
- **It shows in the flying:**
  1. Auto ends in a mid-air collision in 3 of 3 runs.
  2. Tactical with equal jets at 140 or 180 KIAS: no nose-on in 240 s. Both jets flip pitch back / slice every 4-7 s, then sit in a level MPT at the deck.
  3. At 300 KIAS both jets chase each other for 220 s with no kill.
- **Snaps are in the controls, not the track.** G is applied as asked (1.9 to 5.0 G in one 0.02 s step, up to about 200 G/s), and roll rate goes from 0 to 90°/s in one step. In 3D that shows as the nose and wings jerking at every move change.
- **About 30 hidden tuning numbers** were tuned so every merge speed reaches 160 ± 5 KIAS and holds it, which is the MPT test you archived (TF-R6 rewording pending). Lesson 1 again: the pilot logic was bent to fit a test.
- **Recommendation: B, refactor the pilot layer and add one smoothing layer; keep the model, screens and core.** Details in sections 7 and 8.

## 2. What is there

| Group | Lines | State |
|---|---|---|
| Energy engine (`energy-sim.js`) | 2,252 | Model sound; decisions and controllers tangled (sections 3-4) |
| Simple engine (`sim.js`, `geometry.js`) | 574 | Works; dead Climb and dive code inside |
| Settings, run, screen, pictures | 3,643 | Work; defaults spread out, missing flags (plan Step 2), 3D is a bonus |
| CSS, readme | 713 | Readme stale |
| Tests | 458 unit, 64 e2e | Not run. Several assert a published limit is held, or pin recorded numbers (inventory) |

Nothing outside the two sims writes aircraft state. No imports from other modules.

## 3. Who decides, who flies (measured on main)

| Layer | What does it | Verdict |
|---|---|---|
| Move the jet | core `stepPointMass` (RK4), thrust minus drag from core | Keep |
| Limits | shaker (94 % of stall-line G), STALL, OVER G, bank at 90°/s | Keep, but G has no onset rate and roll has no acceleration limit |
| Fly a move | 8 controllers: pitch back, slice, Immelmann, split S, low yo-yo, high yo-yo, MPT / level MPT, pursuit | Each one sound alone; each has its own phases and ends itself |
| Decide | 1 Auto table + race; 2 Tactical look-ahead (7 dry runs × 20 s); 3 re-pick inside the MPT, Tactical only, every 3.5 s; 4 nose-on check starts pursuit for good (plus a 60° canopy rule with different heights); 5 step hand-over (move done → MPT, over 60 s → re-pick) | **The problem** |
| Judge | first nose-on, chase, gun kill (2 s in 2,500 ft, ATA 15°, AA 60°), collision (35 ft) | Keep; share the nose-on rule with Simple |
| Tumble | own Euler step, own drag guess, impact at 0 ft MSL | Replace with the one integrator |

## 4. Faults this structure produces

1. **Auto never re-decides in the MPT** (`energy-sim.js:1303-1320` checks Tactical only). Both jets circle until one is nose-on, then both chase head-on and collide (traces: auto, auto140, auto300). Still true from the 2 Oct Antigravity report, cause 1.
2. **Tactical churns.** Re-picking every 3.5 s with a 4 s lock-out and the move ending itself after a few seconds gives pitch back → MPT → slice → MPT → ... with no plan behind it (traces: m140, m180, unequal).
3. **Pursuit is a one-way door.** Once both jets pursue, nothing ends it: 220 s of mutual chase at 300 KIAS (trace m300).
4. **Collision avoidance only inside pursuit.** Two jets in mirror MPT circles collide after 113-152 s with no warning (traces forcedSlice, forcedPitchBack). A pilot keeps sight and deconflicts in any move.
5. **Control snaps.** No G onset limit, no roll acceleration limit (traces, smoothness table). Your rule: no snaps, matched boundary conditions at every transition.
6. **Tuned to an archived test.** `TUNING` (`:160-186`) says it is tuned so every merge speed reaches 160 ± 5 and holds it. With TF-R6 rewritten ("the MPT only when it needs it to win"), those numbers have no target.
7. **Cost.** Tactical takes 0.2-1 s to build a fight (every Reset or setting change) and 50-100 ms steps every 3.5 s, which the frame loop drops (inference: hitch on screen).
8. **Defaults in 4 places** that disagree (engine: 2 NM, Auto, ATA 0; screen: 1.2 NM, Tactical, ATA 5; geometry.js; presets at 250 KIAS). **Three version labels** (v2.2 card, v2.5 screen).
9. **Limits:** the pursuit deck guard refuses downward lift within 400 ft of the deck, and the level MPT aims at the deck. That is a pilot choice by default, which TF-R6 allows, but there is no deck or top-speed flag yet (plan Step 2), and several tests assert the limit is held (inventory).

## 5. Flight math duplicated

Short version (full table in `flight-math-duplicates.md`): the physics is all core. Duplicated: `rollToward` (identical copy), the flight-path lift formula 4 times (core `dampedClimbG`), bank from G twice with different cutoffs, the nose-on cone in both sims, the 3D off-nose angle three ways, and the tumble's own integrator. **Two shaker rules** exist on purpose (module 94 % of the stall-line G, core stall + 7 kt; 3.25 vs 2.96 G at 160 KIAS): one needs your ruling.

## 6. Can Fight Sim use Traffic's new pieces?

| Piece | Use it? | Why |
|---|---|---|
| `path-follower.js` `followRoute` | **No** | TF-R25: Fight Sim keeps full physics, each jet flies freely with no planned paths. A route is the wrong tool for chasing a moving target. |
| `startJoin` (Hermite join with matched end conditions) | **No** | Its job, a smooth hand-over between two systems, does not arise: there is only one system. Smoothness here comes from limiting the pilot's inputs (G onset, eased roll) instead. The idea (match G, roll rate and flight path at each boundary) carries over. |
| core `easeRoll` | **Yes** | The fix for the roll snaps. Traffic's limits (45°/s, 90°/s²) are estimates; Fight Sim needs 90°/s and its own roll acceleration (your ruling). |
| core `dampedClimbG` | **Yes** | Replaces 4 copies. |
| core `rollToward` | **Yes** | Replaces an identical copy (or goes away under `easeRoll`). |
| core `bankDegFromTurnRate` | Not needed | Energy bank comes from the lift vector; the Simple 3D bank needs `bankDegFromG`. |
| core `pitchDegFromClimb` | **Yes, for the 3D nose** | Today 3D shows the flight path as the nose. In the MPT core's estimate puts the nose about 11° higher (estimate). |
| Flight-math list | **Yes** | Add Fight Sim's new shared pieces (3D off-nose, nose-on cone, part-throttle excess, Ps) when they move to core. |

## 7. Overlap with the Turn Sim rebuild

Turn Sim is building pre-planned kinematic paths (70°/3 G, roll 90°/s, smooth transitions). Fight Sim flies free physics. The decision logic does not overlap. Three pieces do:

1. **Pilot input limits:** roll rate 90°/s, roll acceleration, G onset. Both need the same T-6 numbers and the same smooth-roll law. One core helper, one set of numbers.
2. **Attitude for the 3D view:** bank and pitch (flight path plus angle of attack) from the flight state.
3. **T-6 performance** (turn at G, stall line, limits): already shared in core.

Inference: whichever thread lands first puts the helper in `src/core` through the Traffic thread, which owns core; the other uses it. Turn Sim already asks the coordinator before moving Traffic's path-follower into core, so the same route works.

## 8. Options

| Option | What it is | Cost and risk | Fixes the faults? |
|---|---|---|---|
| **A. Fix in place** | Let Auto re-decide; avoidance in every move; a G-onset and roll-ease limiter in `stepAircraft`; one defaults table; delete duplicate maths | Smallest. The five decision points and the self-ending controllers stay, so the next behaviour fix lands in the same tangle | Partly: snaps and collisions yes; churn and the endless chase only by more tuning |
| **B. Refactor the pilot layer (recommended)** | Keep the model, the screens, core and the Simple fight. Split `energy-sim.js` into: one smoothing layer for pilot inputs; one file per move with enter / control / done; one `pilot.js` that alone picks the next move at decision points (Auto and Tactical alike, pursuit can end, avoidance always on); a cheap look-ahead with a time budget; one judge shared with Simple | Medium: about 2,000 lines restructured, in 3-4 pull requests, each checked on screen from the default start | Yes |
| **C. Rebuild the Energy engine from a new spec** | B, but the moves and the pilot written fresh | Largest; loses move controllers that work (the split S matches core, the MPT speed hold) | Yes |

**Recommendation: B.** The model and the moves are worth keeping; what hurts is who decides and how the inputs reach the model.

## 9. If B: order of work (each a pull request, each checked on screen)

1. **Clean-up, no change to the flying:** core formulas, one defaults table, one version label, stale comments, remove Climb and dive (TF-R22, already in plan Step 2).
2. **Pilot-input smoothing:** G onset and eased roll for every move; tumble on the one integrator. Check: no snaps in 3D, results still sensible.
3. **One pilot:** moves split into files; `pilot.js` the only decision point; Auto re-decides; pursuit can end; avoidance in every move; retune with TF-R6 rewritten. Check: from the default start and a few merge speeds, fights end in a result, no collisions with avoidance on, no move churn.
4. **Look-ahead budget and the flags:** no wait on Reset, no hitch; hard-deck and top-speed flags (plan Step 2).

Steps 2 and 3 change what the tool does, so their spec wording comes to you first (rule book, "write it down first"). This would replace plan Steps 2-3's piecemeal items where they overlap.

## 10. Not seen or not tested

- Nothing looked at in a browser; traces are Node runs. The hitch is inferred from timings and `playback.js`.
- Unit and e2e tests not run.
- The G-onset and roll-acceleration numbers have no manual source yet; the trace figures are measurements of the code, not limits.
- `view3d.js`, `layout.js` and the CSS were read by the Sonnet reader, not by me line by line.

## 11. Questions for Patrick (cards)

1. Fix in place, refactor the pilot layer, or rebuild the Energy engine? Recommended: refactor.
2. How brisk are the pilot's inputs (G onset and roll build-up)? Needed for step 2; numbers are guesses until a manual or your practice gives them.
3. Later, with step 3: which shaker rule (94 % of the stall-line G, or stall speed + 7 kt).
