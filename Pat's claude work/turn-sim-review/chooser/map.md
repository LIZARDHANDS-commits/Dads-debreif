# One chooser for the wingman: map for the review

**Context:** this is a pilot training tool. Patrick is an RCAF flight instructor who teaches formation flying on the CT-156 Harvard II (T-6) at 15 Wing Moose Jaw. The tool replays and simulates training flights for debriefs: formation rejoins, fighting wing (FW, a training formation position behind and to the side of Lead), and two-ship aerobatic manoeuvring. Everything here is about how a simulated wingman flies smoothly and realistically to his place in the formation.

Prepared by the Formation Sim thread on 5 Oct 2026 (repo main at 8ad75a3) so the review starts from the facts instead of re-reading everything. It is orientation only: check the code before relying on any line. Guesses are marked as guesses. File paths are left as they are in the repo.

## Patrick's ask, in his words

- 18:11Z: "What if we dynamically hand off between lines, tracker, and the "AI" used in [the two-ship manoeuvring module]? how could we know when the bst spot was to use for each? top level review? different threat? requirements and constraitnts and clairfiacitons?"
- 18:36Z: "[review] but I want it to focus on the big picture and how it fits together and works and why what what's the best path forward and how to make it work not spend time doing tasks opus can do . It can code the complicated parts if it needs to"

## How #2 is flown today (Formation Sim, `src/modules/turn-sim/live/`)

| Way of flying #2 | Files | What it is | Used for |
|---|---|---|---|
| Planned line | `kinematic.js`, `line-moves.js`, `hot-rejoin.js`, `hand-over.js` | Positions read off a planned path on the power time law; hands over to the tracker about 500 ft out (TS-65) | Long moves that no held-command planner takes |
| Held-command planners | `turning-rejoin.js` (turning rejoin, TS-75), `straight-rejoin.js` (straight-ahead rejoin, TS-72), `echelon-to-fw.js` (TS-73), `lag-roll.js` (TS-71) | Hold bank and power segments, flown through the real step; search a few candidates (banks, aims, overtakes), keep the quickest that passes the checks; then a tracker tail | 2-ship rejoins, out to FW, lag roll |
| Tracker | `tracker.js` (`phase`, `trackTwice`, `stepCommanded`), `transitions.js` (`planGoTo`, `legsFor`) | Closed-loop slot keeper (bank and speed commands toward a moving slot) | The last few hundred feet, holding a slot, and odd starts on its own |
| Fluid wingman | `fluid.js`, `fluid-wing.js`, `full-power.js` (`flyFluidStep`, TS-74) | Speed from energy height, spacing by lag or lead (geometry) | Fluid manoeuvring |
| FW moves | `formation-turns.js` (`fwGoal`, `planFwMove`, TS-70) | Whole-cone goal, Lead's moves | FW turns, reversals, climbs |
| 4-ship | `four-ship.js`, `four-ship-moves.js` | Old tracker legs | All 4-ship changes (still slow) |

**How the pick happens now:** `formation.js` lines 249-257 is a fixed fallback chain. The first planner that accepts the case wins: lag roll, then 4-ship, hot rejoin, turning rejoin, straight-ahead rejoin, echelon to FW, line, and last the tracker alone (`planGoTo`). Each planner refuses what is outside its rule. Nothing scores one method against another, and nothing re-picks mid-move except the line-to-tracker hand-over at about 500 ft.

**Formation's aircraft model:** `flight.js` `stepAircraft`, 0.05 s step. Commanded bank eased at the roll rate; speed by `setKias` and power stages (`slow-down.js` `fullPowerKtps`, `slowKtps`); height by smooth profile legs. A height change's pull is not charged as G, which is why the vertical looked free in dry runs (V2.71 tried it; `future.md`, "height as energy").

## The two-ship manoeuvring module's look-ahead pilot (folder `src/modules/turn-fight/energy/`, about 2,650 lines; its own thread owns it, read only)

- `pilot.js`: the one decider. Auto picks from the SMM table; the look-ahead mode picks through dry runs; hand-over when a manoeuvre ends; re-pick inside the MPT (minimum-power turn).
- `lookahead.js`: flies copies of the whole two-ship run through the module's own step. Candidate manoeuvres get about 20 s dry runs, scored by `judge.js`.
- `moves/`: following the other aircraft (pure, lead or lag aim, and a blend), high and low yo-yo, Immelmann, split S, MPT, bank move, climb out, collision avoidance, hard-deck guard.
- `aircraft.js`: steps core's 3D point mass (`src/core/point-mass.js` `stepPointMass`) with the limits, `rollToward` and input smoothing. Full 3D, with G and roll build-up and energy cost.

So the two modules already fly different aircraft models: the two-ship manoeuvring module uses core's point mass; Formation uses its own commanded-bank step.

## Shared core already there (`src/core/`)

`point-mass.js` (3D point mass, lift toward an aim), `t6-performance.js` (`availableG`, IAS/TAS, energy height, excess power), `flight-math.js` (turn radius, roll), `closest-approach.js` (shared closing pieces, PRs 288, 289, 295). The shared list is `docs/modules/shared/flight-math.md`.

## Already known

- `../fable-compiled.md`: the earlier rejoin review, compiled with Used and To do. Section 5 lists suspected, unchecked faults in the two-ship module's following logic: re-aiming every step, closure read as range rate instead of overtake, high-G turns that cost no speed.
- `../architecture/architecture.md`: the 4 Oct Turn Sim architecture review (before the live core; background only).
- Formation's lessons so far: hold commands instead of re-aiming every step; plan in Lead's turning frame; cost the G and the climb; compare like speeds with like.

## Patrick's rules any answer must keep

- Rejoins (TS-75): never below 200 KIAS unless close in and hot (then a brief dip and MAX); on the line at 200-210; at least 220 up the line; slow at the decision point, where an idle stop fits.
- FW uses the whole cone; the slot is only the aim.
- Form uses geometry (cut-off, lag, height) inside the aircraft's real speed and power, not impossible speed changes.
- Manoeuvres match the manual pictures; if sources conflict, ask Patrick. "A lot of advanced form is art."
- Keep it simple and get it to testing. No new tests; a few troubleshooting sims are fine.
- Published limits are flags on screen; only physical limits (7 G) are walls.
- Modules never import each other. Shared code moves into `src/core` with one writer at a time, through the coordinator. The two-ship manoeuvring module's thread owns how its aircraft follow each other.

## Open questions for Patrick (one at a time, with options and a recommendation)

- What "best" means: quickest, smoothest, most like a real wingman, or a blend.
- Scope: rejoins, FW, fluid, overshoots, 4-ship.
- How often it may re-pick.
