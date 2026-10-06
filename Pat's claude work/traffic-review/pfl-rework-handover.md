# Brief: PFL rework thread (Traffic module, 5 Oct 2026)

You are the thread that reworks how a T-6 (CT-156) flies a practice forced landing (PFL) in the Traffic module of Dad's debrief tool. Patrick owns the tool. He is a pilot and an engineer who teaches at 15 Wing Moose Jaw. This brief is the whole ask. Everything said about the PFL today, and all of Fable's review, is in the appendices, verbatim.

**Later (5 Oct 19:57Z):** Patrick put the full rewrite (Q7 option b) on the future list. Its handover, with links to Fable's documents and all the work towards it, is `pfl-full-rewrite-handover.md` in this folder.

## 1. The goal, in Patrick's words

> "the most important thing is that if it can make the runway somehow it can, but it should prioritize flying the profile if it can. The whole purpose of the PFL pattern is so that the pilot is in an energy management pattern that they can recognize and make adjustments to because they practice it, but sometimes direct threshold is the only way, with drag managed appropriately." (18:39Z; spelling tidied, his exact words are in Appendix C)

The priorities, in order. When two of them conflict, the higher one wins.

1. **Make the runway** if it can be made at all.
2. **Fly the profile** (the PFL circle) whenever it can be joined. Join it the way a pilot would: no orbit flown only to lose height, no S-turns, and no more than the PFL's 60° bank (Patrick 17:51Z, confirmed 17:52Z).
3. **Drag order to get on the circle.** Gear can come early. Flaps or other drag before the join only when joining without them would need one of those unrealistic manoeuvres (17:51Z).
4. **Direct to the threshold** only when the circle can't be made, with the drag managed: gear and flap when the runway is assured, not dumped at the last moment.
5. **Gear timing.**
   - Gliding in from the area: not before about 5 NM out ("difficult to manage").
   - Pattern PFLs: early gear is often needed and is allowed (18:39Z).
6. **Eject only when no part of the runway is reachable.** "This is physics" (18:29Z).

## 2. What "done" looks like

Each item is something a pilot would recognise on screen. The trace names are from Fable's report (Appendix B) and can be re-run with its scripts.

- **Normal starts still fly as they do now.** This covers the area at 8,000 ft, High Key at 5,000-5,900 ft, Low Key at 3,700 ft, and the break or initial at 190-220 KIAS. They land in the first 1,000-1,300 ft with clean gate flags.
- **High starts join and land without orbiting or turning away.**
  - H2: inner downwind abeam the threshold, 4,600 ft.
  - G6: Low Key 600 ft high.
  - C: the perch.
  - F and F2: outer downwind at 220 KIAS.
  - In each: gear before the join when the join would be high, staged drag after that, and touchdown on the runway in line with it.
- **Cold and hot days fly the same profile.** At −30 °C and +30 °C the area PFL reaches High Key in the window and lands in the first third, like a standard day.
- **Final-turn starts that can reach the runway land.**
  - They continue the turn they are in onto the runway.
  - They line up on the runway, not beside it.
  - The gear goes down before the 2,100 ft gate.
- **Ejection happens only when no part of the runway is reachable.** TR-75's "obviously short" eject at the zoom top stays.
- **Patrick has seen it working in the app from the default start.** Green checks are not done (AGENTS.md lesson 2). Hand him the version on screen and say "hard refresh".

## 3. Scope

- **You own:**
  - `src/modules/traffic/pfl.js`;
  - the PFL parts of `src/modules/traffic/sim.js`;
  - spec section 4.5 and the PFL rows in `docs/modules/traffic/` (spec, decisions, plan, future, testing).
- **The Traffic thread keeps everything else in Traffic.** Need a change in another Traffic file (for example `circuit.js`, `weather.js`, `ejection.js`, or `nav-plans.js`)? Ask through the coordinator first.
- **Shared code** in `src/core/` (for example the drag numbers in `t6-performance.js`) has one writer at a time. Ask the coordinator before touching it.
- **Screen hold:** do not edit `setup-panel.js`, `aircraft.js`, `readouts.js`, `playback-bar.js`, `map2d.js`, `view3d.js`, `traffic.css` or `index.html` until the coordinator lifts it. The PFL tag text lives in pfl.js and sim.js and is fine.
- **Never** edit `docs/PLAN.md` (the Docs keeper owns it) or `original/`.

## 4. Model, effort and agents

- Do the work yourself where you can.
- Use one agent at a time only for a long, many-file piece. Brief it with this file plus the AGENTS.md brief lines.
- Model: Opus, because this is flight code.
- Thinking: high for designing and debugging the PFL maths, medium otherwise.
- Fable only if Opus fails twice on the same problem. Tell Patrick first.

## 5. Read first

1. `AGENTS.md`, the rule book.
2. `docs/modules/traffic/`, starting with its README, then spec 4.5 (the PFL), decisions TR-39 to TR-84, testing.md and future.md.
3. `/mnt/project-files/traffic-review/fable-report.md`, Fable's review: sections 1 and 2 for the findings, section 3 for the questions.
4. `docs/modules/shared/flight-math.md` and `src/core/`. Search for existing flight maths before writing new. Fable found the break curve and the stall-bank formula each copied three times (F14). Use the shared one and don't add a fourth.
5. SMM chapter 13, EFIG p.402-410 and NFM Fig 3-4, from `/mnt/project-files/manuals/`. Cite pages only. Never copy manual text into the repo.

## 6. The work, in order

Before coding each step, write in spec 4.5 how a pilot flies it, in plain words, with a page or a Patrick ruling for every number. Mark estimates as estimates. Then code it.

Fable's lesson from the other modules applies here too: check the right frame and the right kind of speed and height, and check the mechanism, not just the end result.

**Step 0. Structure (Q7).**
- Patrick was asked on a card in the Traffic thread: middle road (recommended), fix in place, or full rewrite. His answer will reach you through the coordinator. Don't ask again.
- Until it comes, work on the middle road (Fable F16):
  - keep `pflGeometry`, `arcToAim`, `neededFt` and the decision layer;
  - make joins and the direct into held-bank arcs flown at the planned bank, with the carrot follower only on straights;
  - re-plan only at the keys and when the margin check crosses its threshold;
  - give each new plan a few seconds' grace before it can be abandoned.
- If he picks "fix in place", skip the arcs and do steps 1-4 inside the pursuit follower.

**Step 1. Temperature (F2).**
- `neededFt` sums true feet but is compared with altimeter feet in seven places. Compare like with like using the shared `heightFactor` and `trueAltFt` in `weather.js`.
- `DIRECT_TURN_RADIUS_FT` is a standard-day constant. Scale it with true airspeed.
- This is a fix to match TR-77, which Patrick already approved, so no question is needed.

**Step 2. Joining the circle (F1, F10).** This is Patrick's drag rule, which changes spec 4.5 item 7: "Drag only once on the circle" becomes his 17:51Z rule.
- Search joins at up to 60° bank, not only 45°.
- Rank joins by least turn first. Prefer a join that fits over one that would be high only when it doesn't add an orbit or a turn away. Never pick a first turn over 180° unless it continues the aircraft's own turn (a break).
- When every join is high: gear first, before the join. For an area glide, not before about 5 NM out.
- Then T/O flap and landing flap before the join, only if still high and the other option is an unrealistic manoeuvre.
- The SMM orbit above the High Key window (13.7 para 16) stays. Q5's working answer is that it's exempt.

**Step 3. Direct and inside Final Key (F3, F12).**
- Replace "aim a third down, fresh 45° base turn, 2,000 ft straight final" with: continue the current turn (60° at most) to the nearest reachable point of the runway. Measure the margin to the first 1,000 ft.
- Apply the gear rule to the direct.
- Eject only when no runway point is reachable.
- Working answers until Patrick replies:
  - Q2(c): land wherever the turn reaches, with an on-screen flag when it's outside the first third.
  - Q3(a): on a direct, gear by 2,400 ft or once lined up, and flaps if the margin allows, the same as on the circle. Land gear up only when the gear would make it short.

**Step 4. Widen and drag pacing (F5, F6).**
- Size the widen with a buffer, so the next small deviation doesn't flip it to a direct.
- Stage gear, T/O flap and landing flap instead of putting all three out within two seconds at the join.

**Loose ends to pin down while building:**
- F9: the 144 ft disagreement between the join search and the decision layer on the same path.
- F2: the hot-day error is smaller than predicted, probably because of the wind triangle.

**Not now.** These wait for Patrick's answer, because each changes flight maths or adds behaviour he hasn't ruled on:
- F4 gear drag (Q1);
- F7 zoom numbers (Q4);
- F8 round-out (Q6);
- the clean-ups in F13 and F14 beyond the code you touch.

Put each one on `docs/modules/traffic/future.md` if it isn't there already. "Keep it simple, get to testing": build exactly the cases named, don't generalise.

## 7. Questions for Patrick

- Ask one at a time, each on a card.
- Give options with what each one does, mark your recommendation, and include his own idea as an option.
- Every question has a working answer, and the tool uses it until he replies. Open questions never stop the work.
- Order:
  1. **Q7.** Already asked, in the Traffic thread. Wait for the relay.
  2. **Q2, then Q3.** Needed by step 3.
  3. **Q1.** Gear drag; it unblocks F4.
  4. **Q6, then Q4.**
  5. **Q5.** Only if the High Key orbit comes into question.
- Fable's wording and recommendations are in its report, section 3.
- Show Patrick the exact wording of anything he has to approve before you write it.

## 8. Rules that apply

The testing lines from AGENTS.md, in full:

- Tests check what a pilot would recognise: things that are always true, and end results (it landed on the runway, it stayed above the deck).
- No tight time gates. A generous, realistic limit is fine, with its reason beside it (a PFL lands within 5 minutes).
- Expected values come from a manual page, standard aerodynamics, Patrick's ruling or real recorded data, never from V6 or from the code's own output.
- Margins use the shared table by default (±10 kt, ±100 ft, ±5°, ±0.5 G); a check may use another margin if it says why. Margins are not requirements and never become rules inside the flight code.
- Never change the flight physics (turn, energy, G, stall or stick-shaker formulas) to make a test pass. If a flight test disagrees, check the test against the manuals and Patrick's practice; if the physics still looks wrong, ask Patrick. A test that fails twice stops the work until Patrick answers.
- Published limits (the G limit, the hard deck, the orders) are flagged on screen, never walls; a test never expects the aircraft to be held at one. Physical limits always hold.
- Never skip, disable or delete a failing test just to get green. A test is only retired or rewritten as `docs/TESTING.md` says, with Patrick's yes.
- Keep it light: no mutation, stress or long runs.
- Each PR adds at most one test, the one that best shows it flies right. Skills that say otherwise are overridden.
- **Checks:** Don't run tests locally before a pull request. CI on the pull request is the one check. Patrick may merge before CI finishes. If main then goes red, fix it next.
- Every status says what is untested or unseen.

Patrick's standing rules for this work:

- **Tests.**
  - Fewer tests ("If I see something I don't like I'll report back").
  - No tests that pin wording, seconds, top speeds or one-off values.
  - Fable's suggested test for F1 is a good candidate for the one test: a Low Key start 600 ft high lands on the runway, gear down before Final Key, without orbiting or turning away.
- **Checks.** CI is paused. Before handing over, run a typecheck and a page load, plus a few Node traces to troubleshoot (Fable's scripts are ready). No sweeps.
- **Manoeuvres match the manuals.** If sources conflict, ask Patrick rather than guess. A lot of PFL flying is judgement, so it doesn't have to be a perfect SMM shape every time.
- **References, not walls.** SMM figures and orders are defaults, cited by page. Only what the aircraft physically can't do is a hard limit.
  - Never put manual text or images in the repo.
  - The repo is public.
- **Git.**
  - Work on a branch, open a PR, and squash-merge it yourself. Don't wait on CI.
  - Use plain-English names, for example "PFL: high starts take gear instead of orbiting (TR-85)".
  - Make fewer, larger PRs: one per step or pair of steps.
- **Versions and decision IDs.**
  - Pull main right before merging.
  - The version in `src/modules/traffic/version.js` becomes main + 1 at merge. Main is DADS v2.10.86 now, but Patrick's PC also pushes, so check.
  - The next free decision ID is TR-85 now. The Traffic thread also writes TR rows, so take the next free one at merge.
- **When a decision changes a rule,** change spec 4.5, the decision row and the plan in the same PR.
- **After each merge,** tell the coordinator the PR and version, so the Docs keeper and the Traffic thread stay current.

## 9. What to report

**To Patrick, in this thread, at each merge:**
- Use short, plain words and lead with the answer.
- Give the version shown on screen and say "hard refresh".
- Say what now flies differently, in pilot terms.
- Say what is untested or unseen, and what you were unsure of.

**In the status checklist:** short lines saying what's running.

**At the end:** a list of every finding (F1-F16) and question (Q1-Q7), each marked as done, waiting on Patrick, or moved to future.md.

---

# Appendices: everything said and produced so far (kept verbatim)

## Appendix A. Patrick's rules for the rework, as first handed over

- 17:46Z: "Gear and flaps can be taken before getting on the profile if it makes sense, but if it's possible to get on profile (the PFL spiral) the aircraft should."
- 17:51Z: "For the drag - the priority is to get on the circle, gear can come early but if it has to maneouver unrealistically it can do drag first." An unrealistic manoeuvre is more bank than the PFL's 60° maximum, S-turns, or an orbit flown only to lose height (Patrick confirmed this reading, 17:51Z).
- 18:29Z: "it makes sense that sometimes PFLs cant make it from the final turn. this is physics. if they cant make the runway eject". Fable's F3: eject only when no part of the runway is truly reachable. Today some final-turn starts that could reach the runway eject anyway, because the direct plan demands a fresh base turn and a 2,000 ft straight final.
- 18:39Z: "the most importnat thing is that if it can make the runway somehow it can, but it should prioritize flying the profile if it can. The hwole purpose of the PFL pattern is so that the pilot is in an energy management pattern that they can recognzie and make adjustments to becaue they practice it, but sometimes direct threshold is the only way, with drag managed appropriately. In general, one wouldn't take the gear before 5 miles when gliding in because its dificuly to manage, but frqeuenllty on patern pfls early gear is required to manage the PFL."

So, in order:
1. Make the runway if it can be made at all.
2. If it can, fly the profile (the circle).
3. Direct to the threshold only when that is the only way, with the drag managed.
4. Gear: not before about 5 NM out when gliding in from the area. On pattern PFLs, early gear is often needed and is allowed.

## Appendix B. Everything Fable produced (all in /mnt/project-files/traffic-review/)

- `fable-report.md`: the full report, 232 lines. It has a summary, findings F1-F16 with file and line, traces with numbers, causes and fixes (each number marked as sourced or an estimate), questions Q1-Q7 for Patrick with options and recommendations, and what it did not look at.
- `fable-pfl-review-brief.md`: the request Patrick approved word for word (card "Send as written", 17:50Z), with his 17:51Z additions.
- `fable-traces/`: Fable's read-only Node trace scripts, as it left them.
  - `trace.mjs`: the main scenarios (area, High Key, Low Key, break, high starts, temperature).
  - `trace2.mjs`, `trace3.mjs`, `trace4.mjs`: follow-ups on joins, the direct, and the final turn.
  - `pfl-debug.js`: an instrumented copy of `pfl.js` from main at v2.10.86, used by one trace.
  - The scripts import the repo by absolute path (`/home/user/Dads-debreif/...`). Run them with `node fable-traces/trace.mjs`. They change nothing.
- Fable's own closing summary (verbatim, 18:20Z):
  1. Normal starts (area 8,000 ft, High Key 5,000-5,900, Low Key 3,700, break/initial at 190-220 KIAS) all land in the first 1,300 ft with clean gate flags. The faults are in high starts and inside Final Key.
  2. F1 (worst): when a tangent join would be high, chooseJoin prefers a "fits" join reached by a 270° turn or a join behind the aircraft, which is an orbit only to lose height (Patrick's unrealistic manoeuvre). The pursuit follower saturates at 60° bank, cuts it, arrives high, dumps all drag in 2 s, widens, goes direct 2 s later and lands long or off the side. Trace H2: 4,600 ft abeam the threshold ends 435 ft beside the runway. Trace G6: Low Key 600 ft high turns away from the field. Drag is forbidden before the join (dragOk), so Patrick's "gear can come early" never happens.
  3. F2: neededFt sums true feet but is compared with altimeter feet in 7 places. At −30°C field temperature the plan is about 15% optimistic: an area PFL arrives at High Key 530 ft below the window, abandons the circle and fails the gate. At +30°C it lands 735 ft long. Fix: compare via heightFactor/trueAltFt. DIRECT_TURN_RADIUS_FT is a standard-day module constant too.
  4. F3: the direct plan aims a third down the runway with a 2,000 ft straight final and a fresh 45° turn circle. Final-turn starts 400 ft above the field eject at 320 ft (3 traces). Late finals trade speed to 91-99 KIAS and take gear and both flaps in the last 70-250 ft. Low speed caps the bank via the stall line, so it can't line up: that is the "beside the runway" case. Fix: continue the turn you're in (60° at most) to the nearest reachable runway point, with the margin measured to the first 1,000 ft, and mustGear applied to the direct.
  5. F4: core gear-down orbit loss is 2,013 ft, against about 2,600 ft in SMM 13.5 para 11 (clean 1,652 against about 1,700 is fine). So from High Key at 5,000 ft the T/O flap comes out at 4,776 ft (160° early), and any excess height lands long.
  6. Smaller:
     - F5: the widen is sized to zero spare, then abandoned.
     - F6: all drag is dumped at the join.
     - F7: there are two zooms. The plan uses the NFM table and the flight uses its own 30° pull, which gains about 20% more height.
     - F8: there is no round-out, so touchdown is at 120 KIAS against the SMM's 80-90.
     - F9: join reachability and the decision layer's margin disagree by 144 ft on the same path (cause not pinned).
     - F10: the join is searched at 45° only, though 60° is allowed.
     - F13: about 20 constants have no source, and two pairs of twin values disagree (4,750 vs 5,000 ft, 760 vs 3,000 ft).
     - F14: generatePflTrack is dead code, and the break curve and stall-bank formula each have three copies.
  7. Lighter review: the frames are right in circuit, route, sim, deconflict, evade, randomize and high-key, and the caches include temperature. Only two things were noted: flyRejoin's flat ±2 ft/s², and deconflict's straight-line prediction. The seam from the end of a PFL into goFromRunway has not been seen on screen.
  8. Questions for Patrick, Q1-Q7: see the report, section 3.
  10. Unsure: the 144 ft term in F9; the chart's 105 KIAS versus the SMM's 120 KIAS as the gear-drag anchor; the hot-day High Key figure being smaller than the frame error alone predicts.

## Appendix C. The whole conversation with Patrick about this (5 Oct, his words verbatim)

- 17:46Z: "I want you to send our traffic code to fable for a code review, with special attention on how to make the "PFL" better. Note: Gear and flaps can be taken before getting on the profile if it makes sense, but if it's possible to get on profile (The pfl spirlaL) the aircraft should. Before you deploy the review request, write it out for me. What should we ask it? any gaps?"
  - Claude drafted the brief. The gaps it raised: the rule changes spec 4.5 item 7 ("drag only once on the circle"); there is no flare or round-out in the code or spec; and several PFL numbers, including the ejection test, are estimates.
- 17:50Z card "Send as written" (the whole codebase, PFL first, then a lighter pass over the flying code).
- 17:51Z: "For the drag - the priority is to get on the circle, gear can come early but if it has to maneouver unrealistically it can do drag first." Then: "is that confusing?"
  - Claude's reading: join the circle if you can; gear may come early to help; flaps or more drag before the join only when joining without them would take an unrealistic manoeuvre, meaning more bank than the PFL's 60° maximum, S-turns, or an orbit just to lose height.
- 17:52Z: "thats right" (confirms that definition).
- 18:05Z "hows it going", 18:15Z "sitrep?", 18:15Z "tell it to wrap up". Fable was told to write up at 18:16Z and finished at about 18:20Z.
- Claude's summary to Patrick at 18:21Z gave four top findings: high starts orbit to lose height (F1), temperature (F2), the direct from the final turn (F3), and gear drag about 30% light (F4). It then posted the Q7 card, "Rework the PFL by which approach?": Middle road (recommended), Fix in place, or Full rewrite. **Not answered yet when this thread was opened.**
- 18:29Z: "1) can we / should we permit early gera? 2) it makes sense that sometimes PFLs cant make it  from the final turn. this is physics. if they cant make the runway eject 3) What was fable stagnating on/what did we interrupt? should we let it finish"
  - Claude's answers:
    1. Yes. Today the code forbids any drag before the join, which is why high starts orbit. Gear may go before the join when the join would otherwise be high, and other drag first only for an unrealistic manoeuvre.
    2. Agreed, the eject stays. The fix is narrower: final-turn starts that *can* make the runway shouldn't eject just because the direct plan demands a fresh base turn and a 2,000 ft straight final. They should continue the turn onto the runway, and eject only when no part of the runway is reachable.
    3. Fable wasn't stuck. It was pinning down two loose ends (the F9 144 ft term and the hot-day figure). Claude recommended not restarting it and pinning them down while building.
- 18:39Z: "the most importnat thing is that if it can make the runway somehow it can, but it should prioritize flying the profile if it can. The hwole purpose of the PFL pattern is so that the pilot is in an energy management pattern that they can recognzie and make adjustments to becaue they practice it , but sometimes direct threshold is the only way, with drag managed appropriately. In general, one wouldn't take the gear before 5 miles when gliding in because its dificuly to manage, but frqeuenllty on patern pfls early gear is required to manage the PFL. Should we do this in a fresh thread?"
- 18:42Z: "Make sure the new thread gets everything we've said and all of fables work in the handover"

## Appendix D. Earlier PFL work today in the Traffic thread (already on main)

- TR-75 (#408): a PFL that obviously can't make it ejects 5 s after the zoom apex. "Obviously" means the runway's nearest point is more than 1.5 times the glide ring radius from the ring's centre (1.5 is an estimate). This is `obviouslyShort` and `PFL.ejectDecideSec` in pfl.js. `glideFootprint` moved into pfl.js. ejection.js and ejection3d.js draw the seat, the parachute and the abandoned aircraft.
- TR-77 (#414): the Weather drop-down (field temperature). weather.js holds iasToTasKt, tasToIasKt, heightFactor and trueAltFt. The glide ring uses true height. Fable's F2 is the PFL side of this that was missed.
- TR-83 (#431): the path caches now key on temperature (`temperatureKey()` in weather.js).
- Ownership: this thread owns pfl.js and the PFL parts of sim.js. The Traffic thread keeps the rest of Traffic and stays out of those two while this thread runs.

## Appendix E. Open questions (from the report, one at a time to Patrick)

- Q7 structure. A card was asked in the old thread: middle road (recommended), fix in place, or full rewrite. Check the old thread for his answer.
- Q1 gear-drag anchor, Q2 inside Final Key (land ahead with a flag, or eject; 18:29Z leans to: land if the runway is reachable, eject if not), Q3 gear and flap on the direct, Q4 zoom numbers, Q5 High Key orbit exempt, Q6 round-out.

### Loose ends the old thread meant to pin down while building

- F9: the 144 ft disagreement between the join search's reachability sum and the decision layer's margin on the same path.
- F2: the hot-day error is smaller than predicted (probably the wind triangle at the higher TAS).

## Appendix F. State when this thread was opened

Main is DADS v2.10.86 (Traffic). Next decision ID is TR-85; check main before merging. CI is paused. Patrick tests it himself: typecheck and a page load, then hand him the version. At most one test per PR. The screen hold is on until the coordinator lifts it (no edits to setup-panel.js, aircraft.js, readouts.js, playback-bar.js, map2d.js, view3d.js, traffic.css, index.html).
