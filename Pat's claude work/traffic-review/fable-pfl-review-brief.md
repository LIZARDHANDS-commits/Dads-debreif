# Traffic code review request (Fable): draft for Patrick

**Model and effort:** Fable, high thinking. This is a one-off, read-only architecture review (AGENTS.md, Agents and models). Patrick asked for it on 5 Oct 17:46Z.

**What it may touch:** nothing in the repo. It reads, and it may run small Node traces of single flights to check a mechanism (no test suites, no sweeps, no long runs). It writes one file: `/mnt/project-files/traffic-review/fable-report.md`. No edits, no commits, no branches.

**Read first:** `AGENTS.md`, `docs/PLAN.md`, then `docs/modules/traffic/` (README, spec 4.5 for the PFL, decisions TR-39 to TR-53 and TR-75), `docs/modules/shared/flight-math.md` and `src/core/` (search for existing flight math before proposing any new formula). For background, also read the Formation Sim review's lessons: `/mnt/project-files/turn-sim-review/fable-compiled.md`, sections 1 and 5. The manuals are in `/mnt/project-files/manuals/`: cite pages only and never quote them. The flight manual is not available and must not be used.

**Code:** `src/modules/traffic/` on main. The PFL is `pfl.js` (about 1,040 lines), started from `sim.js`, with `high-key.js`, `ejection.js`, `weather.js` and the shared `src/core/t6-performance.js` glide numbers. The screens and 3D files are out of scope.

## Patrick's rule for this review (5 Oct 17:46Z)

"Gear and flaps can be taken before getting on the profile if it makes sense, but if it's possible to get on profile (the PFL spiral) the aircraft should."

Patrick added at 17:51Z: "For the drag - the priority is to get on the circle, gear can come early but if it has to maneouver unrealistically it can do drag first."

An unrealistic manoeuvre means more bank than the PFL's 60° maximum, S-turns, or an orbit flown only to lose height (Patrick confirmed, 17:51Z).

Spec 4.5 item 7 currently says drag goes out only once on the circle, so this is a change. Review against Patrick's rule.

## Questions, PFL first

1. **Write the method down as a pilot flies it.** Trace one PFL end to end: button press, zoom, join choice, the circle and its keys, drag, the 2,100 ft gate, touchdown. Say in pilot terms what the code does at each stage, and where it differs from spec 4.5.
2. **Getting on profile.** When the aircraft can physically reach the spiral, does it always join it? List the starts where it goes direct, widens, orbits or ejects although a join existed. List where taking gear or flap before the join would let it fit, for example a high or fast start.
3. **Frames and kinds of speed.** Check every energy and reach sum:
   - energy height with true airspeed;
   - glide reach in the air mass versus over the ground;
   - wind on the circle;
   - KIAS versus KTAS versus ground speed in each comparison;
   - the temperature (`weather.js`).
   Name any place where one kind of speed is compared with another, or a turn is costed at 1 G.
4. **Does the plan stay inside what the aircraft can do?** "Form uses geometry" (Patrick, 5 Oct): look for any planned path that asks for:
   - more bank than the stall line allows;
   - a turn tighter than the bank gives;
   - a sink or speed the configuration can't fly;
   - a speed below the trade floor.
   The Formation review found a planned line that asked for more power than the aircraft had. Look for the same kind of fault here.
5. **Known weak spots.** Find the cause of each and propose the simplest fix:
   - high starts land long;
   - a start in the final turn that can't line up lands beside the runway;
   - there is no flare;
   - the gear decision at the 50 ft-low edge;
   - the "obviously short" ejection test (1.5 times the glide ring, an estimate);
   - what happens when the join search finds nothing.
6. **Structure.** Is a planner plus a carrot follower the right shape for a glide? Would one planner of held bank and configuration segments, re-planned only at decision points, fly more like a pilot? Look for dead code, duplicated flight maths (versus `src/core/`), and constants without a source.

## Then the rest of the flying code, lighter

`circuit.js`, `route.js`, `sim.js`, `deconflict.js`, `evade.js`, `randomize.js` and `high-key.js`. Look for the same wrong-frame and wrong-speed faults, turns costed at 1 G, and caches that miss something they depend on (the temperature was missing from the path cache until today, TR-83). Check that the circuit stays smooth at every hand-over.

## What to report

In `fable-report.md`, in this order:

1. A one-page summary in plain words.
2. Findings ranked by how much they hurt the flying. Each one gets:
   - the file and line;
   - the evidence (code reading, or a trace with its numbers);
   - the cause;
   - the fix, in pilot terms first;
   - whether each number in the fix is sourced (manual page or Patrick's ruling) or an estimate.
3. Questions only Patrick can answer, one per line, each with options and a recommendation.
4. What it did not look at, and what it is unsure of.

Any suggestion about tests must follow AGENTS.md's Testing section (at most one test per PR, checking what a pilot would recognise). Never change the flight physics to make a test pass.
