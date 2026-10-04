# Turn Fight: plan

How to read this plan: steps are in the order to do them. Only what is in a step gets built; new ideas go to `future.md`. A line marked "Patrick decides" waits for his yes (his answer TQ-1: `pf/reset/4-decisions/answers.md:12`). The last step is the sign-off. Requirement numbers such as TF-R4 are in `requirements.md`; how each is checked is in `testing.md`.

## Where it stands

1. Turn Fight is built much further than V6: it opens on the Energy fight with a tactical-AI pilot, gun-kill with auto-pause, collisions, yo-yos and five presets. The roadmap calls it "READY FOR PATRICK" and Gate 2 is still open (`archive/docs/REMEDIATION_ROADMAP.md:364`, `archive/docs/handover/turn-fight.md:109`).
2. The reset's review found gaps between what Patrick decided and what is built: only OVER G and STALL are flagged (no top-speed or hard-deck flag), the pull G is on no screen, and the Energy extra-stats panel is not built (`pf/reset/4-decisions/partb-turnfight.md:15`).
3. The reset's browser run found one possible real fault (flipping a side at 0 degrees stops the fight); the rest of the 43 failing browser tests are old tests or unclear (`pf/reset/5-testing/test-register.md:375`).

## Step 1. Refresh spec.md against the new requirements

- [ ] Refresh `spec.md` against the new requirements when work resumes, rewriting every "same answer V6 gives" or "pinned to V6" line: the golden-test command (`archive/specs/SPEC-turn-fight.md:38`), "stays pinned to V6 by its golden test" (`archive/specs/SPEC-turn-fight.md:343`), "exactly V6's plus the Q49 centre start" (`archive/specs/SPEC-turn-fight.md:388`) and the fixed-step line that promises V6's exact answers at 50 frames a second (`archive/specs/SPEC-turn-fight.md:122`). Patrick's answer: the Simple fight is checked by geometry worked out in the test, not by V6 (`pf/reset/1-requirements/questions.md:134`).
- [ ] Rewrite the spec lines the ratified answers replaced: Energy opens first and Simple is one click away (TF-R20, replacing the old Simple-first opening), new defaults of 1.2 NM, 5 degrees and 5 G with Reset matching (TF-R14), any move at any speed for the AI and the student (TF-R7, replacing the 140 KIAS Immelmann ban), no wind and the screen says so (TF-R10) (`pf/reset/1-requirements/requirements.md:309`, `pf/reset/1-requirements/requirements.md:293`, `pf/reset/1-requirements/requirements.md:281`).
- [ ] Rewrite the SMM aerobatics reference where it says an Immelmann is "Any speed > 220 KIAS" so it agrees with TF-R7 (any speed, physics decides, flagged on screen); this is a conflict between two ratified-looking sources (`docs/references/smm-aerobatics-catalog.md:28`, `pf/reset/1-requirements/requirements.md:281`).
- [ ] The SMM aerobatics reference lists the Low and High Yo-Yo citing an old decision (D420) as its source, not an SMM page; add the page or mark the rows as this module's own (`pf/reset/1-requirements/scope-and-ideas.md:202`, `docs/references/smm-aerobatics-catalog.md:39`).
- [ ] Carry the "orders and SMM limits are references, not walls" wording into the spec where it speaks of protected limits (Patrick, 4 Oct 00:47Z) (`pf/reset/consolidation-plan.md:264`).
- [ ] Rewrite TF-R6 so reaching and holding the MPT is not a requirement: a jet flies the MPT only when it needs it to win the fight (Patrick, 4 Oct 07:40Z). Wording to be confirmed with Patrick. The test that checked reach-and-hold from every merge speed was taken out on his word (07:42Z); archived copy `archive/tests/unit/turn-fight/energy-sim-mpt-reach.js`.

## Step 2. Build the gaps between decided and built

- [ ] Top-speed flag: a jet that goes faster than the T-6's top speed shows a plain flag and keeps flying (TF-R4) (`pf/reset/1-requirements/requirements.md:278`, `pf/reset/4-decisions/partb-turnfight.md:15`).
- [ ] Hard-deck flag: a jet below the 6,000 ft MSL hard deck (3,000 ft AGL in the Moose Jaw areas) shows a flag and keeps flying; jets fly above it by default (TF-R6) (`pf/reset/1-requirements/requirements.md:280`).
- [ ] Pull G on screen: 5 G is the default pull for the split S, Immelmann, pitch back and slice, with the SMM's about 4 G shown as the reference; harder pulls are allowed up to the T-6's limits and flagged (`pf/reset/4-decisions/partb-turnfight.md:12`).
- [ ] Extra-stats panel (TF-Q2): show each jet's turn rate and turn radius in Energy mode, in the extra stats panel on the right that is usually hidden (TF-R16) (`pf/reset/1-requirements/questions.md:124`, `pf/reset/1-requirements/requirements.md:300`).
- [ ] Remove V6's simplified "Climb and dive" option and its two dead controls, "Red starts above Blue" and "Side view height scale" (TF-R22; Patrick's answer TF-Q8) (`pf/reset/1-requirements/requirements.md:311`, `pf/reset/1-requirements/questions.md:130`, `src/modules/turn-fight/layout.js:157`).
- [ ] The screen says in one line that Turn Fight has no wind (TF-R10) (`pf/reset/1-requirements/requirements.md:284`).
- [ ] Label the Energy readout row "Time since the turns started" when the turns start at once or there is no pass; the Simple readout already does (`archive/docs/handover/turn-fight.md:115`, `src/modules/turn-fight/readouts.js:84`, `src/modules/turn-fight/energy-readouts.js:140`).
- [ ] Known limit to keep checked: OVER G cannot be reached from the screen in Auto because Auto never pulls past +7 G; keep the unit test that proves the flag and its words (`archive/docs/handover/turn-fight.md:109`).

## Step 3. Check the possible faults from the reset's browser run

- [ ] Flipping a side at 0 degrees stops the fight (the button reads Play where Pause was expected); find out whether it is a real fault (TF-R13) (`pf/reset/5-testing/test-register.md:375`).
- [ ] After opening the settings menu the "Blue's move" list never became usable (six tests); find out why (`pf/reset/5-testing/test-register.md:372`).
- [ ] A beam start shows "TO THE PASS" where it should turn at once with no pass; find out whether the 5 degree default offset or a real fault is the cause (TF-R12) (`pf/reset/5-testing/test-register.md:374`).
- [ ] Patrick sees the stuck-in-turn fix working on the default start (it is ticked in the old plan but was never seen working), and the collision, deconfliction and tumble work gets a review record (`pf/reset/0-lessons/lessons.md:177`).
- [ ] Check the Task 16 acceptance lines are true on the default start: the Immelmann apex rollout settles into level turning, and a Split S recovery does not trigger a second Split S (`archive/tasks/turn-fight/plan.md:75`, `archive/tasks/turn-fight/plan.md:76`). The "2 ms" speed line is dropped: a tight timing gate is not allowed by the testing policy (`pf/reset/5-testing/testing-policy.md:1`).
- [ ] Read the Turn Fight architecture and MPT report that existed only on Patrick's PC (a copy is in the project files) and check its five causes of fighters getting stuck in a sustained maximum-performance turn against today's code, since the roadmap's Tasks 21 to 26 came after it; where the report is filed in the repo is on the waiting list in `../../PLAN.md` (`pf/reset/inputs/turn-fight-architecture-and-mpt-remediation-report.md:148`, `archive/docs/REMEDIATION_ROADMAP.md:353`, `pf/reset/2-inventory/file-register.md:195`).

## Step 4. Settle the open screen questions when work resumes

- [ ] TF-Q5: after a head-on pass, should a jet start chasing at once? (`pf/reset/1-requirements/questions.md:127`)
- [ ] TF-Q9: do the "model settings for checking" (stall speed, shaker, roll rate, throttle, look-aheads, deck margin) live on a visible section, or behind the page address ending "?debug=aero"? (`pf/reset/1-requirements/questions.md:131`)
- [ ] TF-Q13: keep the 10-minute stop, shown in plain words? (`pf/reset/1-requirements/questions.md:135`)
- [ ] TF-Q14: keep the names "BFM Energy Fight" and "Turn Circle Geometry"? (`pf/reset/1-requirements/questions.md:136`)
- [ ] TF-Q16: when the jets start at different heights, how big a height split counts for first nose-on (0 to 10 ft, 100 ft, or the canopy look the code uses)? The code does neither of the first two; Patrick decides (`pf/reset/1-requirements/questions.md:138`).
- [ ] Questions for Dad, kept in `../../questions-for-dad.md`: TF-Q6 (at what point a jet leaves its turn and chases) and TF-Q10 (which of the six check-list items go to Dad and in what words: pitch back minimum turn, the MPT's role, the pursuit commitment window, the pursuit energy floor) (`pf/reset/1-requirements/questions.md:128`, `pf/reset/1-requirements/questions.md:132`, `archive/docs/handover/turn-fight.md:136`).

## Step 5. Sign-off

- [ ] Sign-off: anyone runs the checklist in `testing.md` and sends Patrick the result; the next module starts only after his yes (`pf/reset/4-decisions/answers.md:13`).
- [ ] Correct the checklist wording that the last check found wrong (the trails are blue and red, not yellow; after a graphics reset View stays 2D until 3D is chosen again); the Climb and dive lines go with TF-R22 (`archive/docs/handover/turn-fight.md:117`).
- [ ] Remove the PROTOTYPE flag from the Turn Fight card only if Patrick says so (ALL-R4) (`pf/reset/1-requirements/requirements.md:20`).
