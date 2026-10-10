# Debrief: plan

How to read this plan: steps are in the order to do them. Only what is in a step gets built; new ideas go to `future.md`. A line marked "Patrick decides" waits for his yes (his answer TQ-1: `pf/reset/4-decisions/answers.md:12`). The last step is the sign-off. Debrief includes the flight-data parts (KML loading, cleaning, playback clock, saved debriefs), as the file register puts them (`pf/reset/2-inventory/file-register.md:163`). Requirement numbers such as DB-R8 are in `requirements.md`; how each is checked is in `testing.md`.

## Where it stands

1. The Debrief is built and live; its last check left nothing open ("Nothing left from the final check.") and the next thing is Patrick running the sign-off checklist (`archive/docs/handover/debrief.md:22`, `archive/docs/handover/debrief.md:26`). The old task list has one open box, task 11, browser tests and sign-off (`archive/tasks/debrief/todo.md:75`).
2. The ratified requirements (DB-R1 to DB-R26) differ from the built screen in a few places: wind is applied to Lead's airspeed only, the actual interval and sweep numbers are not shown, the first 3D view hides ships, and the EM chart is gone (`pf/reset/1-requirements/requirements.md:72`, `pf/reset/1-requirements/requirements.md:91`, `pf/reset/1-requirements/requirements.md:96`).
3. Fourteen small screen questions (the "Later" group) stay open until this module's work resumes; one needs Patrick's pick between two old decisions (`pf/reset/1-requirements/questions.md:17`).

## Step 1. Refresh spec.md against the new requirements

- [ ] Refresh `spec.md` against the new requirements when work resumes, rewriting every "same answer V6 gives" or "numbers stay V6's" line: the aspect, HCA, closure and spacing wording (`archive/specs/SPEC-debrief.md:134`), the "Golden first" test-order rule (`archive/specs/SPEC-debrief.md:305`) and the success line "The golden tests pass for V6's behaviour" (`archive/specs/SPEC-debrief.md:331`). Patrick's answer: flight math is checked against the manuals and standard geometry, never V6 (`pf/reset/1-requirements/questions.md:44`, `pf/reset/1-requirements/questions.md:31`).
- [ ] Delete the EM chart lines from the spec, the task list and the sign-off checklist; Patrick left the chart out (DB-Q1, DB-R20) (`pf/reset/1-requirements/questions.md:40`, `pf/reset/1-requirements/requirements.md:101`).
- [ ] Add one explicit line to `requirements.md` that the estimated model cloud base is dropped and the satellite picture stays live only, not saved in the file (Patrick's choice, 30 Sep; the old spec has no cloud-base row but never says it was dropped) (`pf/reset/0-lessons/agents/tags-3-debrief-and-core.md:43`, `pf/reset/0-lessons/lessons.md:146`).
- [ ] Move the flight-data spec into this folder's spec (`archive/specs/SPEC-flight-data.md`) as one file with the debrief spec, as the register proposes; keep the rule that a track must never be treated as real flying when a fix is impossible (DB-R4) (`pf/reset/2-inventory/agents/agent-3-specs-plans.md:31`).
- [ ] Move the tennis-ball decision note (D62, D63: one solver, `tennisBall`) into `decisions.md` (`pf/reset/2-inventory/agents/agent-3-specs-plans.md:53`).

## Step 2. Close the gaps between the ratified requirements and the built screen

- [ ] Apply the wind the same way to every ship wherever the screen quotes airspeed, turn rate, G or bank, when "Winds aloft" is on; with it off every ship says "(no wind)" (DB-R8; Patrick's answer DB-Q2: all ships, when ticked) (`pf/reset/1-requirements/requirements.md:88`, `pf/reset/1-requirements/questions.md:41`).
- [ ] Show each wingman's actual interval in feet and sweep in degrees, and #3's distance aft, in More detail (DB-R11); the numbers are worked out but never shown (`pf/reset/1-requirements/requirements.md:91`).
- [ ] Make the first 3D view readable: all four ships distinguishable, labels not overprinting, #4 not off to the side (DB-R15) (`pf/reset/1-requirements/requirements.md:96`).
- [ ] Remove the unused EM chart code (`src/modules/debrief/em.js`, 182 lines, and its unit test), since Patrick dropped the chart (`pf/reset/1-requirements/scope-and-ideas.md:21`).
- [ ] Model wind between the hours either side is blended and the screen names both hours (Patrick's answer DB-1, "Blend", 4 Oct 03:13Z). Check what the code does today and build it if it does not; the ratified DB-R18 wording needs Patrick's yes on a card before `requirements.md` carries the note (`pf/reset/4-decisions/answers.md:16`, `pf/reset/briefs/stage-3-briefs.md:53`).
- [x] Saved radar and lightning frames: Patrick chose to leave the built feature in as it is (card, 4 Oct 2026 05:03Z). No work on it until he moves it up from `future.md` (`pf/reset/1-requirements/requirements.md:99`, `pf/reset/4-decisions/partb-debrief.md:22`).
- [ ] The Debrief's own cut-offs (no verdict under 80 kt, Lead judged from 6,000 to 15,500 ft, a 5 s hole is a gap, ground speed over 350 kt blanked) are labelled as the Debrief's judgement calls until DB-Q6 is settled (Step 3) (`pf/reset/1-requirements/questions.md:45`).
- [ ] Optional: the shared GPS gap rule becomes "5 s or more" in the flight-data code (a one-line change; the Debrief already does it). It is in the Shared plan, Step 3 (`archive/docs/handover/core.md:10`).

## Step 3. Settle the open screen questions when the work resumes

Each has a working answer built in. Patrick answers these one at a time when this module's work resumes (`pf/reset/1-requirements/questions.md:17`). Each line below is one question in `questions.md`.

- [ ] DB-Q3: is one model wind point for the whole sortie good enough? (`pf/reset/1-requirements/questions.md:42`)
- [ ] DB-Q4: Patrick decides between two old decisions: no smoothing of the estimated G (D219) or a 3-point median filter (D383); neither is built. This is an ASK conflict (`pf/reset/1-requirements/questions.md:43`).
- [ ] DB-Q6: keep the Debrief's own cut-offs? (`pf/reset/1-requirements/questions.md:45`)
- [ ] DB-Q7: show each wingman's interval on the card as well as in More detail? (`pf/reset/1-requirements/questions.md:46`)
- [ ] DB-Q8: add a switch for the iPad's own recorded G, off by default? (`pf/reset/1-requirements/questions.md:47`)
- [ ] DB-Q9: add visible + and − zoom buttons to the map? (`pf/reset/1-requirements/questions.md:48`)
- [ ] DB-Q10: should the first map view frame the formation, with the whole sortie one click away? (`pf/reset/1-requirements/questions.md:49`)
- [ ] DB-Q11: which trail mode should open first? (`pf/reset/1-requirements/questions.md:50`)
- [ ] DB-Q13: keep all the Weather menu extras or trim to toggles? (`pf/reset/1-requirements/questions.md:52`)
- [ ] DB-Q14: judge only the line-abreast part of the sortie? (`pf/reset/1-requirements/questions.md:53`)
- [ ] DB-Q15: show and judge vertical separation between ships? (`pf/reset/1-requirements/questions.md:54`)
- [ ] DB-Q16: keep the shared time window for playback? (`pf/reset/1-requirements/questions.md:55`)
- [ ] DB-Q17: label the estimated G "turn G" or add the vertical pull? (`pf/reset/1-requirements/questions.md:56`)
- [ ] DB-Q18: should playback keys work after any click? (`pf/reset/1-requirements/questions.md:57`)

## Step 3a. 3D cockpit view and smooth GPS gap fill (Dad, 10 Oct 2026; Patrick approved, relayed by Dad the same day)

Dad: "add 3D from the cockpit to the KML viewer ... if there is a GPS gap, for the web tool to auto solve where they might be based on others and previous data then next position data. So if a 90 degree turn is missing the middle ... then there must be a smooth bank in there." Dad, 10 Oct: "its just on the KML Viewer he approves". The approach is written into the spec and decisions before coding (design pass first).

- [x] Smooth gap fill (built V2.211, DB-19, DB-20, on the working answers DB-Q20 to DB-Q22 and DB-Q24; wording waits on Patrick; not yet seen by Patrick in the real app): a gap (more than GAP_S, 5 s) is filled from the fixes before and after and, in formation, from the other ships over the same seconds, as a path the aircraft could fly (roll in, steady bank, roll out), always marked as an estimate, never used for verdicts as if real, with a setting that brings back the straight line.
- [x] Cockpit view (built V2.211, DB-21, on the working answer DB-Q23; wording waits on Patrick; not yet seen by Patrick in the real app): sit in any loaded ship's front or rear seat in the 3D and replay from there with the shared CT-156 cockpit (needs PR #697 merged), attitude worked out from the track.
- [x] Camera bar (built V2.214, DB-22, wording waits on Patrick; not yet seen by Patrick in the real app; Dad, 10 Oct: "can we use the same layout from the pattern sim view controls for the KML viewer"): the 3D view's camera is the Traffic sim's pill bar over the picture, Overview (Follow Lead, Centre formation), Chase and Cockpit, with Boresight, Freelook and Padlock, the ship pills and the seat, and the keys C, P, [ and ]; it replaces the Camera, Ship and Seat controls in 3D settings.
- [x] GPS puck (built V2.215, DB-23, on the working answers DB-Q25 and DB-Q26; wording waits on Patrick; not yet seen by Patrick in the real app; Dad, 10 Oct: "in close formation the location of the sentry puck matters. Can you select a sentry puck in front or back"): each loaded ship's "GPS puck: Not set / Front cockpit / Rear cockpit", moving its positions from the puck on that cockpit's glareshield to the aircraft's reference point for every view and number; Not set keeps today's positions.
- [x] Airspace and airfields (built V2.216, DB-24, with the SOF's move SOF-62; wording waits on Patrick; not yet seen by Patrick in the real app; Dad, 10 Oct: "lets use the 3d airspace in SOF in the KML viewer ... sure just use the boundaries etc", "use the airfield graphics like pattern sim too"): the SOF's airspace (floors and ceilings) and airfields round the loaded flight in 3D and 2D, Airspace off and Airfields on at first, with an Airspace kinds list.

## Step 4. Check the Debrief's tests match the new rules

The test register marks the Debrief's files: about 9 unit checks and about 5 browser checks are pinned to V6's numbers, and one pins seconds of the example flight. Those are rewritten by the clean-up pull requests, not by this plan (`pf/reset/5-testing/test-register.md:641`). This plan only adds:

- [ ] When a requirement above is built, its check in `testing.md` is written with it (DB-R8 wind on every ship, DB-R11 numbers shown), failing until then (`pf/reset/1-requirements/requirements.md:88`, `pf/reset/1-requirements/requirements.md:91`).
- [ ] Keep the rule that debrief focus points never show on another flight (moved from `archive/tasks/debrief/todo.md` to `requirements.md`) (`pf/reset/2-inventory/file-register.md:122`).

## Step 5. Sign-off

- [ ] Sign-off: anyone runs the checklist in `testing.md` and sends Patrick the result; the next module starts only after his yes (`pf/reset/4-decisions/answers.md:13`).
- [ ] Remove the PROTOTYPE flag from the Debrief card only if Patrick says so (the registry keeps Debrief out of prototype status already, roadmap Task 0.5) (`archive/docs/REMEDIATION_ROADMAP.md:301`).
