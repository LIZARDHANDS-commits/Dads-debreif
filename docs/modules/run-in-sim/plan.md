# Run-in Simulator: plan (proposed)

> **Status:** proposed, waiting on Patrick's yes. Dad asked on 16 Oct 2026: "Lets build a run in simulator...the target can be a stadium, a bridge, mountains etc in a 3d enviroment. the user should see an orbit and a run in and be able to set those parameters along with speed alt winds. to see how the flyover, inert bomb drop, DZ offload will go, Diving drop or flat, as well as the escape manuver". Dad's picks below (16 Oct 2026, card answers).

## What it does

A training simulator in 3D: an aircraft flies an orbit, a run-in to a target, a release (or a flypast), and an escape manoeuvre, flown by the shared flight model to the parameters the user sets, over the real terrain and satellite picture. The user watches it from chase, cockpit, the target or overhead, and sees how the pass went: time over target, the inert practice bomb's or cargo bag's fall and where it landed, the escape's clearance from the ground and the target.

Practice and training only: inert practice bombs and cargo, generic target shapes, no real-world target data. "Training only" on screen.

## Dad's picks (16 Oct 2026)

1. **Targets: generic shapes on real terrain.** Simple built targets (a stadium bowl, a bridge, a tower, a range circle, a drop zone) placed anywhere on the shared terrain and satellite ground, so mountains and valleys are real. No outside building data.
2. **Run types: all three, one engine.** A flyover (time over target, such as a stadium flypast), an inert practice-bomb pass (flat or diving), and a cargo offload over a drop zone (the C-130J). They share the orbit, run-in, release and escape, and the drop's falling math (core `drop.js`, built for the Debrief's drop, DB-36).
3. **Flying: auto-flown to the user's settings.** The user sets the orbit (radius or bank, altitude, direction), the run-in (heading, length, initial point, altitude, speed, flat or dive angle), the release, and the escape (turn direction, bank, climb); the shared flight model flies it, so bank, G and energy are the aircraft's. Wind (speed and direction at height) is set too.

## What already exists (search first, never copy)

- Core `drop.js`: the fall of a practice bomb or a cargo bag on a G-12 through the wind, and the computed release point (DB-36, pull request "V2.500 Debrief: a simulated drop").
- Core `point-mass.js` and the T-6 performance sets: the aircraft flown by G and bank through turns, climbs and dives (the EP Tabletop flies with it; Traffic's patterns use it).
- The Debrief's terrain and satellite ground in 3D and the shared terrain heights (DB-27, DB-34), and the CT-156, T-38A and C-130J models.
- Core wind helpers.

## What it would show (to settle in the spec)

- The set-up: target type and place, run-in heading, IP distance, orbit, speeds, heights, dive angle, release point, escape, wind; every default an estimate until Patrick or a manual page gives it.
- The flight: orbit, IP, run-in, release, escape, with the time on each leg.
- The result: time over target against the planned time; for a drop, the impact and miss from the aim point (clock and feet) and the ideal release point; for every pass, the lowest height above the ground and the closest distance to the target during the escape, flagged against a set minimum (a flag, never a wall).
- Cameras: chase, cockpit, from the target, overhead, with replay and speed.

## When data fails

Terrain tiles missing: the ground is flat at the target's height, said on screen, and clearance shows as unknown. A setting the aircraft can't fly (a turn tighter than the stall line allows, a dive it can't pull out of above the ground) is shown as flown with the result flagged, never silently changed.

## Steps (after Patrick's yes)

0. Patrick's yes, and the whole-tool decision for the new module.
1. Spec, requirements and decisions, with screen pictures, approved before code.
2. The world: target shapes placed on the terrain and satellite ground; cameras.
3. The flying: orbit, run-in (flat and dive), release, escape, auto-flown by the shared flight model; wind.
4. The three run types: flyover timing, practice-bomb pass, cargo offload, with the results.
5. One light test: a flat pass in still air releases where the drop math puts the impact on the aim point, and the escape stays above the ground.
6. Sign-off checklist in Dad's and Patrick's words.

## Questions still open (one at a time)

- Which aircraft fly which runs (CT-156 and T-38A for flyovers and practice bombs, C-130J for cargo; working answer).
- The default heights, speeds, dive angles and escape for each run type, from Patrick or a manual page (estimates until then).
- The minimum height and target distance to flag in the escape.
- Its own module, or a mode inside the Debrief (working answer: its own module).

## Not in this plan

Live weapons, real-world target data, threats, formation runs, and the user flying the aircraft by hand (a "take control" option is a future idea).
