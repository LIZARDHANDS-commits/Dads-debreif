# Handover: PFL full rewrite as a segment planner (future feature)

Patrick asked for this on 5 Oct 2026 at 19:57Z: "Add the full rewrite as a future feature and link the relevant fable documentation and all of our work towards it in the handover brief in the project files". It is **not being built**. It waits until Patrick moves it up from `docs/modules/traffic/future.md`. If he does, this file is the starting point, and the brief written then has to follow AGENTS.md (model, effort, testing lines, what to report).

## What the full rewrite is

Fable's review offered three ways to shape the PFL code (question Q7, `fable-report.md` line 218):
- (a) **the middle road**, which is what was built;
- (b) **a full rewrite as a segment planner**, which is this file;
- (c) keep pure pursuit and fix the faults inside it.

The full rewrite replaces today's PFL planner and follower in `src/modules/traffic/pfl.js`. It plans the whole glide as a chain of pieces:
- held-bank turns, each with its own bank, radius and direction;
- straights;
- gear and flap changes.

The aircraft flies those pieces exactly as planned and re-plans the chain at the keys, or when the height margin crosses its threshold. The height-needed sum is then worked out on the path actually flown, not on a path the follower cuts corners on (Fable F16, `fable-report.md` line 202).

**Why it was not picked (5 Oct):** the middle road keeps the geometry that already lands the normal starts well, and fixed every fault Fable found except H2. A rewrite is a bigger job, and it risks breaking the starts that land well today. It is worth doing only if what Patrick sees on screen still flies wrong, or if the open faults below need it.

## Fable's documents (all in `/mnt/project-files/traffic-review/`)

- `fable-report.md`, the full review. The parts that matter most here:
  - section 2, F16 "Structure" (line 202): the case for a segment planner, and the middle road;
  - F1 (line 35): orbits to lose height, and a follower that can't fly the plan;
  - F3 (line 78): the direct plan;
  - F5 and F6 (lines 111 and 119): the widen and the drag dump;
  - F9 (line 147): the join search and the decision layer disagree by about 144 ft on the same path, cause not proven;
  - F14 (line 181): dead code and copied flight maths;
  - section 3, Q1-Q7 (line 208): the questions for Patrick;
  - section 4 (line 222): what Fable did not look at or was unsure of.
- `fable-pfl-review-brief.md`: the review request Patrick approved ("Send as written", 17:50Z), with his 17:51Z drag rule.
- `fable-traces/`: Fable's read-only Node trace scripts.
  - `trace.mjs` runs the main starts: area, High Key, Low Key, break, high starts and temperature.
  - `trace2.mjs` to `trace4.mjs` cover joins, the direct and the final turn.
  - `pfl-debug.js` is an instrumented copy of pfl.js at v2.10.86.

## Our work towards it

- `pfl-rework-handover.md` (this folder): the brief for the PFL rework thread. It holds Patrick's six priorities, what "done" looks like, and every word said about the PFL on 5 Oct (appendices A-C).
- **PR #452** "PFL: joins without orbits, early gear, final-turn starts land, hot and cold days (TR-85)", merged 5 Oct as DADS v2.10.87. It is the middle road, and parts of it are the pieces a segment planner would keep:
  - planned turns flown as held-bank arcs (`arcBank`; join points carry `arc: { cx, cy, r, side }`);
  - the carry-on-the-turn direct onto the runway (`turnOntoRunway`);
  - a re-plan grace period (`PFL.planGraceSec`);
  - heights compared in altimeter feet (`heightFactor`);
  - joins searched down to 60° of bank with no orbit (`glideJoinMinRadiusFt`, `chooseJoin`).
- Repo docs:
  - `docs/modules/traffic/spec.md` section 4.5, items 3, 6, 7, 10 and 13 plus the new settings rows. Their wording still waits on Patrick's yes.
  - `docs/modules/traffic/decisions.md` TR-85.
  - `docs/modules/traffic/future.md`: the "PFL rework, waiting on Patrick" bullet, and the full-rewrite bullet that points here.
- `rework-traces/` (this folder): the rework thread's trace scripts and results.
  - `baseline.txt` is Fable's `trace.mjs` on main before #452.
  - `after3.txt` is the same after #452.
  - `dbg.mjs` traces one start step by step, by name (H2, G6, C, F, H) or as JSON.
  - `ft.mjs` runs five final-turn starts, calm and in a 269/15 wind.
  - `cj.mjs` looks inside `chooseJoin`.
  - The scripts import the repo by absolute path (`/home/user/Dads-debreif/...`). They change nothing.
- Results after #452:
  - Normal starts land 1,100-1,300 ft down the runway.
  - Low Key 600 ft high lands at about 2,008 ft with no turn away.
  - The inner downwind lands at 1,816-2,037 ft. The perch lands at about 2,379 ft.
  - The outer downwind at 220 KIAS lands at 2,435 ft calm and 3,142 ft in wind (long; Q1 would help).
  - At −30 °C and +30 °C the area start lands about 1,200 ft down the runway.
  - Final-turn starts land in about the first 1,000-1,769 ft with gear by 2,400 ft. The one that truly can't make it ejects.

## What is still open that a rewrite would have to settle

- **H2:** fixed by #474 (TR-87, v2.10.89): it now meets the circle from inside with all the drag out, as Patrick suggested at 22:07Z, and lands about 3,250 ft down. The widen's bulge past Final Key still shows as an S near Final Key, which a segment planner could fly more cleanly.
- **F6, staged drag:** dumping drag at the join is not fixed. Staging it 5 s apart landed the normal starts long. A segment planner could plan each drag step as its own piece.
- **F9:** the 144 ft disagreement between the join search and the decision layer. In a segment planner there would be one sum. A lead, 5 Oct 22:25Z: the plan leaves out the energy of slowing level from a start above 125 KIAS (140 to 125 KIAS is about 160-175 ft). Adding just that made the inner downwind start (B) land about 4,400 ft down instead of about 1,750, so other errors in the plan offset it, and the cause isn't found yet. The turn-round join for H2 arrives about 190 ft higher than planned, partly from this. Found 5 Oct 23:00Z (H2 traced piece by piece): the orbit was planned at 1,161 ft and flown at about 998 ft (the slowing energy), and the turn onto the circle is cut short by the carrot follower, so it flies a shorter path than planned. These two errors offset each other. Fixing either one alone, or both together with an intercept rebuilt from held-bank turns, made things worse: H2 ejected, and B landed short at 429 ft. Two failed fixes, so it was stopped. The real fix is one height sum on the path actually flown, which is this rewrite.
- **F14:** dead code (`generatePflTrack`), plus the break curve and the stall-bank formula copied three times. A rewrite should use the shared ones in `src/core/` and not add a fourth.
- **Questions waiting on Patrick:** Q1 gear-drag anchor (F4), Q2 inside Final Key, Q3 gear and flap on a direct, Q4 one zoom (F7), Q6 round-out (F8), Q5 only if the High Key orbit comes into question.
- **Area start at 3 NM and 10,000 ft:** it lands but misses the gate by 97°, as it did before #452.

## Rules that carry over

These apply whatever structure is used:
- Patrick's six PFL priorities: `pfl-rework-handover.md` section 1.
- The AGENTS.md testing lines.
- Every number has a manual page or Patrick's ruling.
- Manual text never goes in the repo.
- The CFAFM is never used.
