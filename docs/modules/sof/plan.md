# SOF: plan

How to read this plan: steps are in the order to do them. Only what is in a step gets built; new ideas go to `future.md`. A line marked "Patrick decides" waits for his yes (his answer TQ-1: `pf/reset/4-decisions/answers.md:12`). The last step is the sign-off. Requirement numbers such as SOF-R12 are in `requirements.md`; how each is checked is in `testing.md`.

## Where it stands

1. The SOF weather screen is built and live, but Patrick's answers on 4 Oct re-open it: it is rebuilt to one desk screen with buttons for more detail, so the sign-off checklist runs after the rebuild, not before (`pf/reset/1-requirements/questions.md:64`, `pf/reset/1-requirements/questions.md:76`).
2. The built screen does not yet do what two ratified lines say: the "extras" the old task list ticks as done are not in the code, and an alternate with unfilled approaches can still read "meets" instead of amber "Incomplete" (`pf/reset/1-requirements/requirements.md:117`, `archive/tasks/sof/todo.md:63`).
3. Two old task boxes (the live-traffic relay and the 12-hour soak run) were deferred to Phase 2; they are on the future list, not in this plan (`archive/tasks/sof/todo.md:55`, `archive/tasks/sof/todo.md:68`).

## Step 1. Refresh spec.md against the new requirements

- [ ] Refresh `spec.md` against the new requirements when work resumes, rewriting every "same answer V6 gives" or "pinned to V6" line: the "Times pinned before they move" rule that runs V6's own wave-time code (`archive/specs/SPEC-sof.md:316`), and the test lines in the weather-parser spec that name the archived V6 files (`archive/specs/SPEC-wx.md:172`). Patrick's answer: flight and weather math is checked against the manuals and the reports, never V6 (`pf/reset/1-requirements/questions.md:31`).
- [ ] Rewrite the spec lines the ratified answers replaced: the default-screen table of "five extras behind checkboxes" (`pf/reset/4-decisions/partb-sof.md:25`), the Blitzortung "link only" wording (`pf/reset/4-decisions/partb-sof.md:22`), and the spec lines that say the app never carries approach data (see the Shared plan).
- [ ] Add the "not for flight planning" line and "the chip always carries its reason" to `requirements.md` as the register says (moved from `archive/tasks/sof/plan.md` and `archive/specs/SPEC-sof.md`) (`pf/reset/2-inventory/file-register.md:121`).
- [ ] Move the relay README (`relay/README.md`) into this module's spec, or keep it next to the code; the relay itself is on the future list (`pf/reset/2-inventory/agents/agent-3-specs-plans.md:99`).
- [ ] Move `docs/modules/sof/csp-hosts.md` here as a reference (the hosts SOF and Debrief call), with a pointer from the Shared plan (`pf/reset/2-inventory/agents/agent-2-records.md:39`).

## Step 2. Rebuild to one desk screen, with the everyday extras

- [ ] Rebuild the default SOF as one desk screen, laid out as decision SOF-38 (timeline across the top with the waves in its header; Dad approved the mock-up 6 Oct): bar, caution banner, waves, cards, map and timeline reachable without hunting, nothing overlapping at 1280 wide and larger, and a banner with many cautions does not push the screen out of reach (SOF-R19; Patrick's answer SOF-Q1: one screen with buttons for more detail, such as full weather briefs per area) (`pf/reset/1-requirements/requirements.md:163`, `pf/reset/1-requirements/questions.md:64`). The old screen is 2,198 px tall with no data and 3,286 px with five cautions at 1366 × 768.
- [ ] Build the extras that the task list ticked but the code lacks: world clocks (Zulu and local), a radar loop of the last hour, tapping a card centres the map on that airfield, and "Other airfields" and "About this screen" behind buttons (SOF-R26; Patrick: essentials now) (`pf/reset/1-requirements/requirements.md:164`, `archive/tasks/sof/todo.md:63`).
- [ ] Fix map labels piling up at the default zoom (SOF-R14, SOF-R28); keep the extra map layers (VNC chart bases, GOES satellite cloud, Environment Canada warnings, training routes, radar-coverage hatching), each off by default except radar coverage (SOF-Q11, keep all) (`pf/reset/1-requirements/requirements.md:154`, `pf/reset/1-requirements/questions.md:74`).
- [ ] Keep the ADS-B Exchange switch; the relay layer on our own map is on the future list (SOF-Q9) (`pf/reset/1-requirements/requirements.md:156`).

## Step 3. Build the safety and limits gaps between decided and built

- [ ] Amber "Incomplete" for any airfield whose approaches or landing minima are not filled in, never a green tick, including a PROB group below the alternate limits with minima unset (old decision D388, new decision SOF-32; SOF-R12). The code does not do it yet (`pf/reset/4-decisions/partb-sof.md:74`, `pf/reset/1-requirements/requirements.md:144`, `src/wx/alternates.js:163`).
- [ ] Ship the usual alternates (CYQR, CYYN, CYXE) with their approaches and published landing minima filled in and a "checked on" date, and let the SOF mark an approach out of service by NOTAM for the day (SOF-R12; Patrick's answer SOF-Q3, 4 Oct 00:48Z) (`pf/reset/1-requirements/questions.md:66`). This changes the airfield data in the Shared parts and reverses two lines of the airfields spec; the spec rewrite is in the Shared plan.
- [ ] A decoded line beside each raw METAR and TAF, for example "270/12G20, 2SM, 800 ft" (SOF-R4; SOF-Q4) (`pf/reset/1-requirements/requirements.md:131`).
- [x] Wind: Patrick moved every wind check (SOF-R27: crosswind per runway and the 30 and 35 kt field checks) and the favoured-runway hover card to the future list on 4 Oct 09:22Z (SOF-37; SOF-Q4, SOF-Q12). The SOF shows the wind but flags nothing for now. The beep is on the future list too (see `future.md`).
- [ ] When each requirement above is built, the check marked "New" in `testing.md` is written with it and fails until then (SOF-R4, R12, R14, R19, R26) (`pf/reset/1-requirements/requirements.md:131`, `pf/reset/1-requirements/requirements.md:144`).

## Step 4. Settle the open questions when the work resumes

- [ ] SOF-Q10: settings are in two places (the SOF's own menu and the app Settings dialog); should they be one? (`pf/reset/1-requirements/questions.md:73`)
- [ ] SOF-Q14: should the SOF check any of the Gen Book's weather limits by activity (low level, formation, chase, advanced formation, a wx check flight)? (`pf/reset/1-requirements/questions.md:77`)
- [x] Answered by Patrick on 4 Oct, in place of Dad (decisions SOF-33 to SOF-37): Questions for Dad, kept in `../../questions-for-dad.md`: SOF-Q5 (manual "alternate required" switch, quiet acknowledged cautions), SOF-Q6 (the alternate check window), SOF-Q7 (lightning caution, 20 NM radius), SOF-Q8 (how old is too old), SOF-Q12 (favoured runway on the NATO hover card) (`pf/reset/1-requirements/questions.md:68`, `pf/reset/1-requirements/questions.md:69`, `pf/reset/1-requirements/questions.md:70`, `pf/reset/1-requirements/questions.md:71`, `pf/reset/1-requirements/questions.md:75`).
- [ ] The alternate trigger (local MTCA 2000/3 default, cross-country 3000/3 option) is a settled number from the Gen Book p.7; confirm it with a current SOF when the checklist is run (`archive/docs/handover/sof.md:16`).

## Step 5. Sign-off

- [ ] Check two old findings during the sign-off run, since the later final check did not say they were fixed: an alternate's TAF marked "below limits" for forecast times no wave lists (M2), and a visual-descent alternate whose TAF is marked against the descent minima while its METAR is not (L2) (`archive/docs/records/verification/sof-recheck-228.md:54`, `archive/docs/records/verification/sof-recheck-228.md:79`, `archive/docs/handover/sof.md:12`).
- [ ] Sign-off: anyone runs the checklist in `testing.md` against NAV CANADA's own reports for the same day and sends Patrick the result; the next module starts only after his yes (SOF-R25; TQ-2) (`pf/reset/4-decisions/answers.md:13`, `pf/reset/1-requirements/requirements.md:170`).
- [ ] Remove the PROTOTYPE flag from the SOF card only if Patrick says so (ALL-R4) (`pf/reset/1-requirements/requirements.md:20`).
