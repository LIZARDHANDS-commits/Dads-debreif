# Formation Sim code review: brief (DRAFT, wording not yet confirmed by Patrick)

Model: Opus, high thinking (a one-off design review of flight code). Read-only: it reads and reports, never edits, reverts or commits.

## Context
Read `AGENTS.md`, `docs/modules/turn-sim/` (README, spec, decisions), `/mnt/project-files/turn-sim-review/formation-sim-handover.md` and last night's `refactor-plan.md` (PRs 1-8, partly built) first. The code is `src/modules/turn-sim/live/` (45 files, about 14,000 lines) on main at V2.154. It flies: every rejoin ends in position and fighting wing turns have no busts. The trouble is that each fix needs a round of dry runs to see what else moved.

## The aim
Find the simplest design that flies the same as today, or better, and that a pilot-engineer can read. A ruling from Patrick should change one line in one place.

## Work from big to small

1. **The big picture: is there a more elegant way?** Describe in plain words how a wingman is flown today: the planners, searches, tracker, lines and hand-overs, and who decides what. Then answer whether a different kind of logic would do it with less code and fewer special cases. Weigh at least these:
   - one pilot model every move uses: aim at a place in Lead's frame (geometry, including the vertical), manage energy with height first and power last, and stay inside the aircraft's envelope;
   - a look-ahead search over a few held techniques, which is what the planners do now;
   - a guidance law flown live each step;
   - a mix of the above.
   Say what each would cost to move to, and what it would lose.
2. **The middle: one place per rule.** List every rule that lives in more than one place, with file:line for each copy. Examples are "in position", the 500 ft bubble, cone energy and the zoom, the speed floors, the 3/9 lane and the Rates. Also list dead or near-dead code (old rejoin code, errors.js), and files that do two jobs.
3. **The small: readability.** Find long functions and deep nested loops, such as the turning rejoin's seven-deep search. Find numbers without a source, names that don't say what they are, and comments that no longer match the code.

## Also check
- **Rulings:** does the code still do what the rulings in the handover and `decisions.md` say? List any place it doesn't.
- **Hot spots:** which files have had the most fix-on-fix commits (git history), and why?
- **Shared code:** any flight math that duplicates `src/core/` or should move there.
- **Speed:** planning time on a press (some take 1-15 s).
- **Last night's refactor plan:** which PRs are built, and whether the rest still makes sense.

## What it reports
One file, `/mnt/project-files/turn-sim-review/code-review/report.md`:
- the big-picture answer first, with a recommendation;
- then a ranked list of findings, each with what it costs, what it buys and what it risks;
- a proposed refactor in a few large PRs, each with the dry runs that prove the flying hasn't changed;
- what it didn't look at, and what it was unsure of.

No code changes and no tests. Questions for Patrick go one at a time through the thread.

## The aim of the refactor that follows
- **Same flying:** today's dry runs give the same results before and after. Only Patrick's rulings change how it flies.
- **One place per rule:** each rule and each number lives in one place, with its source beside it.
- **Old code gone:** what it did is listed first, then it's deleted.
- **Readable:** small enough to read, so a fix doesn't need a hunt for side effects.
