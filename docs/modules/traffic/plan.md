# Traffic Pattern Sim: plan

How to read this plan: steps are in the order to do them. Only what is in a step gets built; new ideas go to `future.md`. A line marked "Patrick decides" waits for his yes before anything changes the tool (his answer TQ-1, `pf/reset/4-decisions/answers.md:12`). The last step is the sign-off. Numbers like TR-R14 are the ratified Traffic requirements in `requirements.md`; what each check looks like is in `testing.md`; the overall order of modules is in `../../PLAN.md`.

## Where it stands

1. The Traffic Sim is built and was called ready for Patrick's checklist at the end of Milestone 1, but the sign-off box is still open and no run of the checklist is recorded (`archive/docs/REMEDIATION_ROADMAP.md:323`, `archive/HANDOVER.md:111`).
2. The ratified requirements (TR-R1 to TR-R34) ask for more than is shown today: the opening picture, crab and ground speed, Remove for one aircraft and spacing on final are missing, and the promised PFL review has not happened (`pf/reset/1-requirements/requirements.md:179`, `pf/reset/1-requirements/requirements.md:208`).
3. Six PFL commits landed on main after the reset's starting point (new decisions D438 to D440). They are new since the reset pin; Patrick held all three for the PFL review, which is the first thing reviewed and ratified when Traffic work resumes (4 Oct 04:12Z and 04:13Z) (`pf/reset/6-plan-and-rules/new-since-pin.md:5`, `pf/reset/consolidation-plan.md:189`).

## Step 1. The PFL review (TR-R14) and what waits on it

Patrick's rule: the forced-landing work gets its own review before it counts as done (`pf/reset/1-requirements/requirements.md:208`), and it is the first thing reviewed and ratified when Traffic work resumes (Patrick, 4 Oct 04:12Z) (`pf/reset/consolidation-plan.md:189`). Patrick decides the outcome of each line below; nothing here changes the flying code before his yes. The review is read against SMM chapter 13 by page, never by copying manual text.

- [ ] Start from the audited analysis of the PFL conversation (Antigravity 'Salvaging Dual Layer Simulation', steps 4400 to 8605): `pf/reset/inputs/pfl-antigravity-analysis.md` (Patrick asked for it, 4 Oct 05:29Z).
- [ ] Read with it Patrick's newly approved PFL inputs: the PFL definition `pf/reset/pfl-prep/pfl-definition.md` (ratified 4 Oct 07:03Z), the energy logic `pf/reset/pfl-prep/pfl-energy-logic.md` (approved 4 Oct 06:47Z) and the conflict answers `pf/reset/pfl-prep/answers.md`.
- [ ] Step 1a: the Traffic architecture review `pf/reset/traffic-architecture/review.md`. Patrick's answer: Refactor (keep and extend closed-pattern climb), 07:25Z; `pf/reset/traffic-architecture/review.md` sections 13-14.
- [ ] Review the PFL against the SMM chapter 13 pages and the glide chart: a power-off glide at the chart sink rate, wind effect, key heights, an aircraft that cannot reach the runway does not (TR-R14, TR-R31) (`pf/reset/1-requirements/requirements.md:209`, `pf/manuals/traffic-pattern-numbers.md:71`).
- [ ] Decide D436, the pre-built wind-shaped PFL track: it fits TR-R14 but TR-R30 does not list the PFL as a live manoeuvre, so either add it to the live list or keep the pre-built track and say why (`pf/reset/4-decisions/partb-traffic.md:82`, `pf/reset/1-requirements/requirements.md:197`).
- [ ] Judge D438 to D440 (new since the reset pin; held for this review by Patrick, 4 Oct 04:13Z): High Key arrival window, PFL separate from the circuit, and the direct-turn intercept. The reset's review held all three for this PFL review (`pf/reset/6-plan-and-rules/new-since-pin.md:11`, `pf/reset/6-plan-and-rules/new-since-pin.md:12`, `pf/reset/6-plan-and-rules/new-since-pin.md:13`).
- [ ] PFL Test 4 (no jumps over 25 ft a step, finite numbers, gear and flaps by height) failed at 644fb78: gear down at 3,701 ft where it wanted clean above 3,700 ft MSL. Taken out of CI on Patrick's word, 4 Oct 06:54Z; archived copy `archive/tests/unit/traffic/pfl-test-4.js`. Review the check and the configuration schedule here.
- [ ] Settle the zoom half of old plan-doc question 74 (zoom to 145 KIAS, 70 percent of ideal height, NFM Fig 3-4) as a cited default, and record that the 64-71 % zoom note did not hold (`pf/reset/4-decisions/partb-traffic.md:23`, `pf/reset/0-lessons/decisions-and-promises.md:252`). The same old question's break half is already settled by TR-R7.
- [ ] Decide Patrick's gear-and-flaps drag idea: if the PFL is high it adds drag early, if low it delays it. It lives here only; `future.md` points to this step (`pf/reset/1-requirements/scope-and-ideas.md:147`, `pf/reset/consolidation-plan.md:146`).
- [ ] Rewrite the engine-failure expectation in `tests/unit/traffic/commands.test.js`: it says height must have dropped 10 s after the command, but a pilot at 140 kt trades speed for height first, so the expectation itself may be wrong; check it against the manuals. At the new main one case still fails (the Low Key climb) (`pf/reset/5-testing/test-register.md:258`, `pf/reset/6-plan-and-rules/new-since-pin.md:21`).
- [ ] Settle the new flaps-takeoff glide row in `src/core/t6-performance.js:156`: Patrick approved labelling it an estimate (4 Oct 04:18Z); it stays an estimate until a manual page or Patrick backs it (`pf/reset/6-plan-and-rules/new-since-pin.md:15`, `pf/reset/consolidation-plan.md:189`).
- [ ] Candidate Dad question: the T/O flap glide ratio (the code's value is an AI estimate; no manual gives it). Not in `../../questions-for-dad.md` until Patrick says to add it.
- [ ] Settle D435 and D438's High Key arrival window as a Traffic setting with a default, not a tolerance (`pf/reset/4-decisions/partb-traffic.md:72`).
- [ ] Add the PFL to TR-R30's list of manoeuvres flown under live control if Patrick says so, then update `requirements.md` and `testing.md` together (`pf/reset/1-requirements/requirements.md:197`).

## Step 2. Refresh spec.md against the new requirements

- [ ] Refresh `spec.md` against the new requirements when work resumes, rewriting every "same answer V6 gives" or "pinned to V6" line so flight numbers are checked against the manuals and standard aerodynamics instead (Patrick's answer Q-ALL-4: `pf/reset/1-requirements/questions.md:31`; ALL-R22: `pf/reset/1-requirements/requirements.md:50`). The old Traffic handover still says "V6-pinned goldens" (`archive/docs/handover/traffic.md:6`).
- [ ] Rewrite the lines in the spec that the ratified answers replaced: the 20 / 80 landing dice (`pf/reset/4-decisions/partb-traffic.md:41`), "always physics-driven" against the ratified mix of planned paths and live manoeuvres (TR-R30: `pf/reset/1-requirements/requirements.md:197`), the 35-degree final turn against the ratified "steepen up to 45 if it needs to" (TR-R9: `pf/reset/1-requirements/requirements.md:201`), and the Phase 1 / Phase 2 scope note (roadmap: `archive/docs/REMEDIATION_ROADMAP.md:270`).
- [ ] Carry the one live pattern list into the spec: two files both call themselves the traffic pattern matrix (`docs/references/traffic-pattern-matrix.md` and `archive/tasks/traffic/pattern-matrix.md`); keep the first as the reference and fold the second's procedures into the spec (`pf/reset/2-inventory/agents/agent-3-specs-plans.md:70`). Patrick decides which is the master if they differ.

## Step 3. Fix the real faults found at the reset pin

Thread 5 ran the old browser tests at the pin: 13 passed, 37 failed, 5 skipped. Of the 37, 27 are old tests that no longer match the screen (they are rewritten, not fixed). These are the ones that look like real faults (`pf/reset/5-testing/test-register.md:296`, `pf/reset/consolidation-plan.md:266`).

- [ ] Play does not start the run after Pause or after Reset: the clock stays at 0:00:00 (browser test lines 110 and 314, and the playback-bar unit test fails the same way) (`pf/reset/5-testing/test-register.md:304`). At the new main this unit test passes, so first re-check whether it still happens (`pf/reset/6-plan-and-rules/new-since-pin.md:21`).
- [ ] At 1280 and 1366 pixels wide the playback bar wraps, the start-point list is clipped and an unlabelled box overlaps the "Traffic settings" button (TR-R29) (`pf/reset/5-testing/test-register.md:305`). The app-frame layout tests show the same overlap at 1280, 1366 and 1920 (`pf/reset/5-testing/test-register.md:631`). Taken out of CI on Patrick's word, 4 Oct 06:54Z: Traffic left the layout walk in `tests/e2e/layout.spec.js` (`CHECKED_ROUTES`); put it back when this is fixed.
- [ ] The 3D view asks for two files that are not there (two "404 Not Found" errors); find which two files and supply them or stop asking (`pf/reset/5-testing/test-register.md:306`).
- [ ] After "minus 10 s" the clock goes back but the map picture does not change; find out whether this is a missed redraw or a test that reads too early (`pf/reset/5-testing/test-register.md:307`).
- [ ] The "+ Spawn PFL" button did not become steady and clickable within 30 seconds in the every-button walk; find out why (`pf/reset/5-testing/test-register.md:632`). Taken out of CI on Patrick's word, 4 Oct 06:54Z: Traffic left the walk in `tests/e2e/buttons.spec.js` (`CHECKED_ROUTES`); put it back when this is fixed.
- [x] Settle which of these block turning CI back on (`pf/reset/consolidation-plan.md:266`). Patrick, 4 Oct 06:54Z: "Just delete those shitty tests"; the failing Traffic checks are out of CI, with the lines above.

## Step 4. Build what the ratified requirements ask for and the screen lacks

Each line says what the requirement asks and what the code shows today. After each one is built, its check in `testing.md` (marked "New") is written with it and fails until it is built.

- [ ] Opening picture: three or four Harvards already in the circuit, opening at 1x speed, instead of the shipped seven-aircraft schedule with starts from 12 s to 902 s and V6-style names (TR-R2) (`pf/reset/1-requirements/requirements.md:188`, `pf/reset/1-requirements/questions.md:95`).
- [ ] Show each aircraft's crab angle and ground speed (TR-R6); nothing shows them today (`pf/reset/1-requirements/requirements.md:198`).
- [ ] Add a Remove button for one aircraft; `sim.remove` exists but no button calls it, and the Rewind check must bring the aircraft back (TR-R19) (`pf/reset/1-requirements/requirements.md:225`, `src/modules/traffic/sim.js:675`).
- [ ] Spacing on final: aim for 2,000 ft between aircraft, extend downwind or move over to keep it (TR-R18). The screen says "traffic on final" avoidance is not built (`pf/reset/1-requirements/requirements.md:219`).
- [ ] Offer the CT-156 Harvard II only in this version, keep the type system so others can be added; the type list in the code still holds six aircraft types (TR-R16) (`pf/reset/1-requirements/requirements.md:212`, `src/modules/traffic/types.js:55`).
- [ ] Window to threshold speed is 100 KIAS in the ratified requirement; the shipped route file still holds 110 kt at the Window point (TR-R10) (`pf/reset/1-requirements/requirements.md:203`, `src/modules/traffic/data/moose-jaw.json:26`).
- [ ] Climb-outs, go-arounds and the closed-pattern start level at pattern height (3,500 ft) and rejoin; the code levels the go-around at 2,500 ft and the closed preset at 2,400 ft (TR-R13) (`pf/reset/1-requirements/requirements.md:206`, `src/modules/traffic/flight-engine.js:339`, `src/modules/traffic/aircraft.js:23`). These are the manual corrections the 3 Oct review proposed and nobody applied (`pf/reset/0-lessons/lessons.md:179`).
- [ ] Hide Runway 11R "Coming soon" and any other control or setting that does nothing yet (TR-R27, TR-R28) (`pf/reset/1-requirements/requirements.md:249`, `src/modules/traffic/defaults.js:17`).
- [ ] Check that no outcome depends on chance: landing choice already comes from each aircraft's intent, but the seeded dice still feed route splits and the "random" spawn plan (TR-R12) (`pf/reset/1-requirements/requirements.md:205`, `src/modules/traffic/sim.js:30`, `src/modules/traffic/defaults.js:111`).
- [ ] The left side shows the traffic patterns by pilots' names and the patterns are locked; the route editor was removed in commit 3ced22f (TR-R3) (`pf/reset/1-requirements/requirements.md:189`, `pf/reset/1-requirements/requirements.md:180`).
- [ ] Remove the built-in "Moose Jaw (V6 original)" setup and the old split routes SPL1 to SPL4 when the routes are redrawn (see Step 5) (`pf/reset/2-inventory/agents/agent-3-specs-plans.md:69`, `src/modules/traffic/profile.js:307`, `pf/reset/0-lessons/lessons.md:175`).
- [ ] Simple spawn test buttons were promised and never built; check whether TR-R19's named start points are enough, otherwise add to `future.md` (`pf/reset/0-lessons/lessons.md:174`).
- [ ] Settle the Traffic screen questions that stay open until work resumes (TR-Q10, Q14, Q15, Q16, Q18, Q22, Q23, Q24, Q25 in `questions.md`): `pf/reset/1-requirements/questions.md:96`, `pf/reset/1-requirements/questions.md:100`, `pf/reset/1-requirements/questions.md:101`, `pf/reset/1-requirements/questions.md:102`, `pf/reset/1-requirements/questions.md:104`, `pf/reset/1-requirements/questions.md:108`, `pf/reset/1-requirements/questions.md:109`, `pf/reset/1-requirements/questions.md:110`, `pf/reset/1-requirements/questions.md:111`.

## Step 5. Check the camera, graphics and scenery work against the code

The three old task folders show about 120 unticked boxes; most are old acceptance lines for work that is built, so the boxes are not live tasks. What is built: the six camera views (`pf/reset/2-inventory/agents/agent-3-specs-plans.md:71`, `src/modules/traffic/camera-views.js:61`), the tower, hangars and airfield ground (`pf/reset/2-inventory/agents/agent-3-specs-plans.md:73`, `src/modules/traffic/scenery3d.js:798`, `src/modules/traffic/airfield-core-ground.js:563`), and the sun, windsock, landmarks and trees (`pf/reset/2-inventory/agents/agent-3-specs-plans.md:75`, `src/modules/traffic/view3d.js:856`, `src/modules/traffic/landmarks3d.js:154`). What is still open:

- [ ] Patrick looks at the camera menu (Fit, Top-down, Tower, Chase, Cockpit, Padlock, and the follow list) and says it is right (TR-R23; the camera tasks' sign-off lines are the only open part) (`pf/reset/1-requirements/requirements.md:234`, `pf/reset/2-inventory/agents/agent-3-specs-plans.md:72`).
- [ ] Glass Palace: Patrick sends a close-up photo of the glass side; until then the south-east side stays (`archive/tasks/traffic-scenery/plan.md:100`).
- [ ] Questions for Dad on the landmarks: are both grain elevators still standing, is the Sukanen Ship intersection on Highway 2, which name does Dad use for "Flat Farm" or "Fiat Farm", is any landmark missing (`archive/tasks/traffic-scenery/plan.md:73`). They are not in `../../questions-for-dad.md` yet; add them there.
- [ ] Patrick signs off the landmark placement (the scenery list's last line) (`archive/tasks/traffic-scenery/todo.md:59`).
- [ ] Keep the rule that every 3D model sits exactly on its footprint in the satellite photo, and that every 3D piece is freed when 3D is switched off (the rules moved to `requirements.md` and `decisions.md`) (`pf/reset/2-inventory/file-register.md:116`).
- [ ] Keep the stall-line check for the route points as a to-do until the routes are redrawn: two route points need more G than the T-6 can pull (`archive/docs/handover/traffic.md:41`).
- [ ] Redraw the Moose Jaw routes over the satellite photo with Dad (Patrick and Dad; until then the V6 routes stay) (`archive/docs/handover/traffic.md:46`). Part of Step 4's V6 setup clean-up. The "Copy setup as text" helper that was promised with it is on `future.md` (`pf/reset/0-lessons/lessons.md:146`).

## Step 6. Review the route.js split (a review, not the split itself)

`src/modules/traffic/route.js` is 1,140 lines today. Patrick flagged the idea of splitting it, with a flight-math registry and one import point, as "GOOD IDEA, NEEDS REVIEW". The source says do it after the Traffic sign-off so no wide refactor lands while the module is being finished (`pf/reset/inputs/2026-10-03-why-agents-reinvent-the-wheel.md:102`). The registry and one import point are in the Shared plan.

- [ ] Write the review: where the route.js pieces would go, what imports change, and a before-and-after build size so no other module loads Traffic code (`pf/reset/inputs/2026-10-03-why-agents-reinvent-the-wheel.md:108`).
- [ ] Patrick decides whether the split is carried out, and when; if yes it becomes a new step in this plan after the sign-off (never mixed into the sign-off work) (`pf/reset/inputs/2026-10-03-why-agents-reinvent-the-wheel.md:11`).

## Step 7. Sign-off

- [ ] Sign-off: anyone runs the checklist in `testing.md` and sends Patrick the result; the next module starts only after his yes (`pf/reset/4-decisions/answers.md:13`).
- [ ] Remove the PROTOTYPE flag from the Traffic card only if Patrick says so at sign-off (roadmap Task 5.2; ALL-R4) (`archive/docs/REMEDIATION_ROADMAP.md:388`, `pf/reset/1-requirements/requirements.md:20`).
