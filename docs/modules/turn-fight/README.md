# Turn Fight

This folder is the turn fight: two aircraft manoeuvring against each other, with energy, G and turn performance shown. Start here, then read only the file you need.

## Where it stands

Built much further than the old file; the roadmap calls it ready for Patrick, and the reset found gaps between what Patrick decided and what is built (top-speed and hard-deck flags, pull G on screen, extra-stats panel) (`archive/HANDOVER.md:90`, `pf/reset/4-decisions/partb-turnfight.md:15`).

Energy pilot (4 Oct): TF-57 PR 1 and 2 merged, and PR 3 merged as #297 (v2.11): one Smart pilot (TF-59), below the deck loses and climbs out (TF-R6), a deck guard and a collision break in every move, and a chase that can end (TF-58). Then #309 (v2.12): the Smart pilot picks its next move at once and keeps under the top speed. Not yet seen on screen by Patrick.

On screen the module is called "Pat's Fight and Turn Sim" (TF-60, v2.13); the folder and id stay `turn-fight`.

## What is next

The plan's steps, in order: Step 1: Refresh spec.md against the new requirements; Step 1b: Refactor the pilot layer (TF-57); Step 2: Build the gaps between decided and built; Step 3: Check the possible faults from the reset's browser run; Step 4: Settle the open screen questions when work resumes; Step 5: Sign-off. Only what is in `plan.md` gets built.

## The files

| File | What it holds |
|---|---|
| `spec.md` | How the module works: screens, behaviour, data, and what happens when data fails |
| `requirements.md` | What the module must do, in Patrick's words, with how each is checked |
| `decisions.md` | Decisions in force (new IDs), replaced ones and their history, and decisions waiting on a question |
| `testing.md` | This module's testing rules, its sign-off checklist and its list of tests |
| `plan.md` | The ordered steps and checkboxes; the last step is the sign-off |
| `future.md` | Ideas not being built until Patrick moves them up |

## Open questions

Each has a working answer that the tool uses until it is settled.

### Waiting on Patrick now (also on the list in `../../PLAN.md`)

- **The two PC-only reports** (Turn Sim and Turn Fight architecture reports): where in the repo their content lands (`pf/reset/2-inventory/file-register.md:194`).
- **An on-screen look at the fight** from the default start (Smart pilot, deck rule, top-speed guard, OVERSPEED and BELOW DECK flags; v2.14 once #327 merges).
- **The sign-off checklist's Energy section:** new wording posted in the thread 4 Oct for his word-for-word yes; written into `testing.md` only after it.
- **The look-ahead freeze:** a Smart pick can freeze the screen up to about 0.3 s (0.1 s on Reset). Card posted 4 Oct: spread it out (recommended), a shorter look-ahead, or leave it.

### Settled when this module's work resumes

Screen and build details. Each has a working answer (the best guess) that stands until then.

| ID | Question | Options | Best guess (the working answer until it is settled) | Source |
|---|---|---|---|---|
| TF-Q5 | ASK. After a head-on pass, should a jet start chasing at once? Spec: off by default, waiting for Patrick's word, and D152 says nobody chases a head-on pass. D403 says it defaults on by Patrick's ratification of 1 Oct. | On / Off | On (it is the later decision and the build does it), but say so on screen | `archive/specs/SPEC-turn-fight.md:238`; `docs/records/plan-decisions.md:235,525` (D152); `archive/docs/records/decisions-log.md:260` (D403); `src/modules/turn-fight/energy-sim.js:101` |
| TF-Q9 | ASK. Where do the "model settings for checking" (stall speed, shaker, roll rate, throttle, look-aheads, deck margin) live? Spec: a visible section for Dad. Build: hidden unless the page address ends in ?debug=aero. | Visible closed section / hidden behind the address / separate page for Dad | Visible but closed, at the bottom, since Dad has to find them | `archive/specs/SPEC-turn-fight.md:239-250`; `src/modules/turn-fight/layout.js:432` |
| TF-Q13 | Keep a stop at 10 minutes (and the auto-pause on a kill) so a run cannot go on for ever, or leave runs open-ended with a safe long-run? Not a timing gate either way. | Keep a stop / open-ended | Keep a stop, shown in plain words | `archive/specs/SPEC-turn-fight.md:136`; `src/modules/turn-fight/sim.js:25-26` |
| TF-Q14 | Is the "BFM Energy Fight" name and "Turn Circle Geometry" naming (D409) right for students, and should the module keep its V6 name "Turn Rate / Turn Radius Fight"? Screen says Turn Fight, Simple footer says "Simple 2D Circles". | Keep current / return to V6 name for Simple | The module is now "Pat's Fight and Turn Sim" on screen (TF-60); keep the mode names; describe Simple as "turn rate and radius" in its first line | `src/modules/turn-fight/layout.js:25-26`; `archive/docs/records/decisions-log.md:270` (D409) |

### For Dad

Both answered by Patrick on 4 Oct, in place of Dad: TF-Q6 is decision TF-55 and TF-Q10 is TF-56 in `decisions.md`. The answers are also marked in `../../questions-for-dad.md`.

### Decision clashes from the requirements review

Handed to the decisions review (reset thread 4); check `decisions.md` for the verdict before relying on either side.

| ID | Question | Options | Best guess (the working answer until it is settled) | Source |
|---|---|---|---|---|
| TF-Q15 | ASK (for thread 4). The two decision registers disagree on numbers for the same Turn Fight decisions: the decisions log has D420 as a Traffic row and runs yo-yos D421, gun-kill D422, camera D423, presets D424; plan-decisions has yo-yos D420, gun-kill D421, camera D422 and presets twice (D423, D424). Which numbering stands? | Decisions log / plan-decisions / renumber | Decided by thread 4 | `archive/docs/records/decisions-log.md:281-285`; `archive/docs/records/plan-decisions.md:281-285` |
| TF-Q16 | ASK. When the two jets start at different heights, how big a height split counts? Patrick said 0 to 10 ft; a later decision (D408) used 100 ft; the code does neither and starts the chase on a 60 degree canopy look instead. | 0 to 10 ft / 100 ft / the canopy look | Thread 4 sorts the records; the canopy look is what flies today | `archive/docs/records/decisions-log.md:269`; `src/modules/turn-fight/energy-sim.js:2044-2050`; `pf/reset/0-lessons/lessons.md:170` |

Dad's flying questions for every module are in `../../questions-for-dad.md`.

Old decisions held until a question is answered are listed in `decisions.md` under "Old decisions waiting on an open question".
