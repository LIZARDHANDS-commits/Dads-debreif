# Formation trainer engine review: brief

## Context
This is a formation flying trainer for 2 CFFTS, a Canadian flight training school. Instructors use it to teach student pilots basic and advanced formation in the CT-156 Harvard II, a two-seat turboprop trainer. It carries no weapons and has no combat use. The whole point of its rules is collision avoidance: the follower never closes too fast and never ends up ahead of the leader. A student who learns the right picture on a screen is safer in the real aircraft.

## What the trainer is trying to do
Press a formation manoeuvre button and see the formation fly it the way the school's manual (the SMM) and its instructors fly it: realistic T-6 energy, G and roll, geometry first and power as needed. Then see whether each follower ends in position, and why.

## Your job
Review and report only. Read everything in this folder and nothing outside it. Don't edit, build or run anything. The one file you write is `report/report.md` in this folder.

You are working on your own. The instructor isn't watching in real time and can't answer questions mid-task, so asking "Want me to...?" or "Shall I...?" will block the work. The deliverable is your assessment: report your findings and stop. Don't change any code, even where you find a bug. Put it in the report instead.

Before ending your turn, check your last paragraph. If it is a plan or a promise about work you haven't done ("I'll..."), do that work now. End only when the report is complete.

The scope is this review, so don't quietly narrow or widen it. Make routine judgement calls yourself and state the assumption in the report. If one part turns out to be blocked, complete every other part in full and say exactly what you left out and why.

Before you start, say in a line what you're about to do. Close with a short recap that stands on its own: what you found and what you recommend.

## What is in this folder
- `src/modules/turn-sim/live/`: the flying engine, which plans and flies the leader and followers (45 files, about 12,000 lines).
- `src/core/`: the shared flight maths it uses (T-6 performance, point mass, units, angles).
- `docs/trainer/`: the trainer's spec, requirements, decisions (the instructor's rulings, numbered TS-), numbers and the handover notes. The decisions are the rulings the engine must keep.

Some words used here:
- **Cone position** is a loose formation position: the follower anywhere in a cone 30-60° off the leader's tail, 500-1,000 ft back.
- **Lead point, nose on and lag point:** where the follower points his nose relative to the leader to close or open the gap.
- **The 3/9 line:** a safety boundary abeam the leader that the follower must not pass ahead of.
- **Overshoot:** the safe way out when the follower arrives too fast.
- **Rejoin:** a join-up. The follower flies back up to the leader and settles in position.

## The aim
Find the simplest design that flies the same as today, or better, and that an instructor who is a pilot and an engineer can read. A ruling should change one line in one place. Today it flies (every join-up ends in position), but each fix needs a round of test flights to see what else moved.

## Work from big to small
1. **Big: is there a more elegant way?** Describe in plain words how a follower is flown today: the planners, searches, tracker, lines and hand-overs, and who decides what. Then say whether a different kind of logic would do it with less code and fewer special cases. Weigh at least these:
   - one pilot model every move uses: aim at a place in the leader's frame (geometry, including the vertical), manage energy with height first and power last, and stay inside the aircraft's envelope;
   - a look-ahead search over a few held techniques (what the planners do now);
   - a guidance law flown live each step;
   - a mix of these.
   Say what each would cost to move to and what it would lose.
2. **Middle: one place per rule.** List every rule that lives in more than one place, with file:line for each copy. Examples are "in position", the 500 ft bubble, cone energy and the zoom, the speed floors, the 3/9 lane and the Rates. List dead or near-dead code, and files that do two jobs.
3. **Small: readability.** Find long functions and deep nested loops (the turning join-up's search loops seven deep). Find numbers without a source, names that don't say what they are, and comments that no longer match the code.

## Also check
- **Rulings:** does the engine do what the rulings in `docs/` say? List any place it doesn't.
- **Shared maths:** anything that duplicates `src/core/` or should move there.
- **Speed:** planning time on a button press (some take 1-15 s), and what drives it.

## What to report
Write in plain words, for a pilot and engineer, and remove all mannered prose: say what you mean. Use lists and tables where the content is multifaceted enough that they help. The report must have:
- the big-picture answer first, with a recommendation;
- a ranked list of findings, each with file:line, what fixing it costs, what it buys and what it risks;
- a proposed refactor in a few large steps, each with what to fly before and after to prove the flying hasn't changed;
- what you didn't look at, and what you were unsure of.
