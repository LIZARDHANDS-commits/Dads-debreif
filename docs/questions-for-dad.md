# Questions for Dad

Flying calls only a T-6 pilot can settle. Nothing here has been sent: Patrick decides when and how to ask. Every question has a working answer in the tool (the best guess), and that answer stays until Dad replies. When he answers, the answer goes into the module's `requirements.md` or `decisions.md` in the same change, and the question is marked answered here.

Sources point to where things were on 4 Oct 2026: `pf/` means the project files (private); old repo paths are now under `archive/`.

# Current list (13 questions, from the requirements review)

## SOF

| ID | Question | Options | Best guess (the working answer until it is settled) | Source |
|---|---|---|---|---|
| SOF-Q4 | **Answered by Patrick, 4 Oct 00:40Z: decoded line now; wind and gust limits researched in the manuals (and Dad asked); beep to the future list.** Original question: The orphaned V6 SOF (the one in the main file) had wind and gust limits (home wind above 25 kt, gust above 30; alternates 30 and 35), a decoded line on each card (ceiling, visibility, wind, gust, altimeter) and an optional beep. The V6 SOF people actually saw had none of these, and the new SOF has none. Do you want any of them? | Wind/gust limits: add / future / drop. Decoded line on cards: add / drop. Beep on new caution: add / future / drop. | Decoded line: add (a pilot reads "270/12G20, 2SM, 800 ft" faster than the raw text). Wind and gust limits: ask Dad what the SOF's wind limits are (crosswind per runway is the better rule, FF21). Beep: future list. | `original/shell.html:4378-4379`, `original/shell.html:4385-4386`, `original/shell.html:4392`, `original/shell.html:4448`; new `src/wx/limits.js` (no wind check); `pf/manuals/weather-and-limits-numbers.md:44-46`; `v6/feature-ideas.md:40` |
| SOF-Q5 | Two defaults the spec chose for a current SOF to confirm: (1) no manual "alternate required" switch (V6 let you click the chip to flip it), (2) an acknowledged caution stays quiet while the same airfield keeps reporting the same thing and returns only if it clears and comes back. Also (3) the waves stay the same from day to day and apply to Today or Tomorrow. Do these stay? | Per item: keep default / change. | Keep all three until a current SOF says otherwise. Item (2) matters most: if the SOF wants a re-alert on every new report it changes how the banner behaves. | `specs/SPEC-sof.md:131`, `specs/SPEC-sof.md:119`, `specs/SPEC-sof.md:127`, `specs/SPEC-sof.md:348-352` (SOF-2, SOF-4, SOF-6); `docs/records/plan-decisions.md:477-481` (D104, D106, D108, approved by "sof spec approved") |
| SOF-Q6 | The alternate is checked over a window from one hour before to one hour after the landing time, and the home call over takeoff to one hour after landing. That is stricter than the civil rule (the ETA). The window width and any RCAF rule were to be confirmed with a current SOF. Are they right? | Keep ETA plus or minus 1 h / use the ETA only / ask 15 Wing orders. | Keep until a current SOF answers; it errs on the safe side. | `docs/records/plan-decisions.md:433` (D60), `docs/records/plan-decisions.md:443` (D70); `pf/archive/2026-09/dad-email/round-2-questions.md:29-31`; Gen Book p.7 at `pf/manuals/weather-and-limits-numbers.md:9` |
| SOF-Q7 | Lightning: should the SOF raise a caution for lightning near home at all, is 20 NM right (can be set 5 to 50), and should a caution already up stay up while the picture is old or the feed is down ("can't tell now, last seen N min ago")? Dad has not answered the three questions. | Per item: yes / no / change number. | Yes to all three; 20 NM until Dad answers (V6's own number, no manual gives one; the NFM mentions lightning up to 50 miles). | `specs/SPEC-sof.md:349` (SOF-3); `pf/archive/2026-09/dad-email/dads-check-list.md:37-51`; `docs/records/plan-decisions.md:725-726` (D352, D353) |
| SOF-Q8 | How old is too old? A report or picture is marked stale when: METAR over 75 min, a TAF past its end, radar over 20 min, lightning over 40, satellite cloud over 60. These came from the build, not from a SOF. Are they right for a desk screen? | Keep / ask Dad / change. | Keep and ask Dad (PJ2). These are screen behaviours, not test gates, so a change here does not move any test time. | `docs/records/plan-decisions.md:440` (D67), `docs/records/plan-decisions.md:727` (D354); `pf/archive/2026-09/dad-email/dads-check-list.md:42-46`; `src/modules/sof/feeds.js:30` |
| SOF-Q12 | V6-A's NATO chart hover card showed a favoured runway with headwind and crosswind from hard-coded runway headings. The new SOF does not, pending runway data. Is that a requirement now, or the future list (FF20, FF21)? | Now / future. | Future list, but ask Dad whether crosswind matters more to the SOF than the NATO chart, since it was the one thing V6 computed from wind. | `v6/sof.html:1016-1036`; `specs/SPEC-sof.md:233`, `specs/SPEC-sof.md:340`; `v6/feature-ideas.md:12`; `docs/records/future-ideas.md:10` |

## Traffic

| ID | Question | Options | Best guess (the working answer until it is settled) | Source |
|---|---|---|---|---|
| TR-Q8 | Whose numbers set each type's speeds and pattern? | (a) manuals for each type; (b) Dad's list; (c) CT-156 numbers for all with a label | (b) checked against manuals. Today type changes nothing but colour in V6 (audit) and pattern speeds per type are an open question to Dad. | `docs/audit/findings.json:4947`; `pf/archive/2026-09/questions/traffic-questions-expanded.md:60,114` |
| TR-Q11 | How close counts as a conflict and as a caution? (Dad's call) | (a) V6 built-in 200 / 200 ft and 500 / 500 ft; (b) V6's general 1,500 / 500 and 2,500 / 1,000 ft; (c) another | Ask Dad; shipped value is (a). | `docs/records/dads-questions.md:71-76`; `src/modules/traffic/defaults.js:130-133` |

## Turn Fight

| ID | Question | Options | Best guess (the working answer until it is settled) | Source |
|---|---|---|---|---|
| TF-Q6 | ASK. At what point does a jet leave its turn and chase? V6 and the spec use a strict nose-on within 5 degrees. Later records use 45 degrees, 65 degrees and, latest (D429), 60 degrees from the nose across a height difference. Dad's list has this as an open pilot question. | Keep first nose-on strict for the result and let the AI chase earlier as a labelled model setting / use one pilot-chosen window / ask Dad | Keep the result strict; ask Dad for the real attack window; do not hide the number | `specs/SPEC-turn-fight.md:286`; `docs/records/dads-questions.md:25-29`; `docs/records/decisions-log.md:276,282,290`; `src/modules/turn-fight/energy-sim.js:2043-2055` |
| TF-Q10 | Dad's check list: 2 original items (split S vs slice under 120 KIAS; Immelmann floor), now marked answered by Patrick's rule, and 4 items written by agents (pitch back minimum turn, MPT tracking, attack window, energy floor) that Dad never saw. Which go to Dad, and in what words? The spec's "For Dad to check" list (stall 83 or 86, shaker 94 %, stall length, mid throttle, lead/lag points, roll rate, pitch-back bank, split points, deck margin, handover lead) is still unanswered. | Send the spec list plus the attack window / send only what changes a requirement / hold | Send the short list that changes the model (attack window, slice vs split S, roll rate, mid throttle, MPT bank) | `pf/archive/2026-09/dad-email/dads-check-list.md:9-19`; `docs/records/dads-questions.md:9-33`; `specs/SPEC-turn-fight.md:323-339` |

## Turn Sim

| ID | Question | Options | Best guess (the working answer until it is settled) | Source |
|---|---|---|---|---|
| TS-Q5 | The "4312" preset draws #2 #1 #3 #4 left to right as seen from behind (V6 does too); 2134 draws #4 #3 #1 #2. Usually "4312" reads #4 #3 #1 #2 in that order. Which is right? Dad's question 9 is still open. | (a) keep as is (V6's); (b) swap the labels; (c) swap the sides | (b), after Dad confirms | `docs/records/dads-questions.md:76-79`; `docs/audit/findings.json:6086`; `pf/archive/2026-09/flight-math-check/turnsim.js:25-30`; `docs/checklists/turn-sim.md:38-40` ("#4, #3, #1, #2" while the screen shows #2 #1 #3 #4) |
| TS-Q7 | Bank is instant today (no roll-in). Traffic uses 30-50 degrees per second. Add a roll-in to the Turn Sim? It would shift every roll-out slightly. | (a) no; (b) a simple roll rate | (b) later; flag to Dad | `src/modules/turn-sim/engine/step.js:89-100`; `docs/records/plan-requirements.md:30` (R34) |
| TS-Q17 | Correction model (lag / lead / G adjustment): you asked for it back (D82); the bloat report calls it non-physical. Keep? | keep behind the checkbox / remove | ASK Dad; default remove | `docs/records/plan-decisions.md:455`; report `:301-335`; `src/modules/turn-sim/layout.js:190-194` |

# Older questions (from `docs/records/dads-questions.md`, before the reset)

These were written before the reset. Some are already settled by Patrick's 4 Oct answers (for example items 1 and 2, the Immelmann speed rule D381, were replaced by his Turn Fight answer TF-Q4: anyone may try an Immelmann at any speed and the physics decides). Before anything goes to Dad, each older item is checked against the current list and the module requirements, and either merged, marked settled, or kept.

<details><summary>The old file, unchanged</summary>

Each item names the thread that raised it and where the detail is.

### Turn Fight

**1. Split S below 120 KIAS, or a slice? (Turn Fight P1) — RESOLVED BY PATRICK (D381)**
- **Answered 2026-09-30 (D381):** At 140 KIAS or below, aircraft must NOT fly an Immelmann and must choose either a Split S (if deck height allows) or a slice turn. *Patrick's rule:* A slice turn is descending (although losing less altitude than a Split S). Never go below the hard deck: if altitude margin does not permit a slice turn without breaching the deck, transition to level MPT.

**2. Lowest Immelmann top speed: 120, or about 140? (Turn Fight N3) — RESOLVED BY PATRICK (D381)**
- **Answered 2026-09-30 (D381):** Immelmann depletes energy. Below 140 KIAS, an Immelmann is strictly forbidden (must fly Split S or slice turn). The minimum top speed threshold is codified in D381.

**10. Pitch Back minimum turn before level unload (Turn Fight BFM-1)**
- **Question:** What is the authentic minimum heading change a Harvard II pilot completes during a Pitch Back before unloading to level flight or transitioning to MPT? (e.g. 90°, 120°, or 140°?).
- **Why we ask:** SMM Ch 14 states the pitch back is a climbing reversal executed "before 180°". Without a minimum turn angle gate, a speed-based lookahead previously caused the aircraft to abort the pitch back after turning only 23°.
- **Now:** A 90° minimum turn constraint is enforced (`c.turnDeg >= 90`) before speed-based handover to MPT is permitted, with hard-deck protection (`altFt - hardDeckFt < 1000`).

**11. Max Performance Turn (MPT) tactical tracking vs. blind circle (Turn Fight BFM-2)**
- **Question:** In the 15 Wing Harvard II BFM syllabus, is the Max Performance Turn (MPT at 160 KIAS) treated primarily as a 2-circle rate fight tool that actively tracks and maneuvers relative to the bandit, or is it flown as a fixed reference circle?
- **Why we ask:** In the original simulation, aircraft entered a canned 160 KIAS circle that maintained bank and airspeed blindly without referencing the opponent's position or turn circle.
- **Now:** Aircraft in MPT monitor the opponent; when tactical advantage exists (Austin/Carbone matrix > 0.45, ATA < 45°) or dynamic altitude separation exceeds 100 ft, fighters break out of the level MPT into active 3D combat pursuit.

**12. Pursuit engagement criterion & attack window (Turn Fight BFM-3)**
- **Question:** What angular window (Antenna Train Angle / ATA) triggers a Harvard II pilot to commit from a neutral rate turn into aggressive pursuit tracking?
- **Why we ask:** Standard military doctrine (e.g. CNATRA P-825) uses an "attack window" of roughly 30°–45° ATA off the bandit's tail. Previously, the sim required an exact 5° boresight (`FIRST_NOSE_DEG = 5.0°`) which caused aircraft in 2-circle fights to orbit indefinitely without ever triggering pursuit.
- **Now:** Tactical pursuit engages when ATA is within 45° and tactical advantage is positive, or when dynamic altitude splits allow line-of-sight tracking within 5° azimuth.

**13. Pursuit energy floor / G-unload threshold (Turn Fight BFM-4)**
- **Question:** Below what airspeed should a pursuing Harvard II pilot unload G and lower pitch to regain corner speed, rather than continuing to pull max G in a vertical climb?
- **Why we ask:** In mutual vertical pursuit, chasers pulling continuous 5.0 G into high pitch angles could bleed airspeed down to 68 KIAS into a deep stall.
- **Now:** An energy governor enforces a 140 KIAS floor during climbing pursuit: when KIAS falls below 140 and the aircraft is climbing, maximum commanded G is clamped to $\le 2.0$ G and vertical pitch demand is eased to prevent aerodynamic stall and recover corner speed.


### Turn Sim

**3. The 5 o'clock cue on a Delayed 45 (Turn Sim C3)**
- **Question:** Do you roll the second aircraft in later than the 5 (or 7) o'clock cue, so the roll-out lands inside 4,000 to 6,000 ft? Or do you roll in on the cue and "fix spacing and sweep on the roll-out"?
- **Why we ask:** Flown exactly on the SMM's cue, the default 4-ship and box Delayed 45 end about 3,700 to 3,900 ft apart. That shows red TIGHT flags on every wingman.
- **Now:** the tool keeps the SMM cue and adds a "fix spacing and sweep on the roll-out" line.
- Detail: verification/turn-sim-recheck-223.md, C3 / PJ-1.

**4. Rear element delay in a box Delayed 45 with a check turn (Turn Sim, D281)**
- **Question:** The SMM gives the rear element a 10 to 15 s delay. Is that what you fly?
- **Why we ask:** In the sim, a fixed 12.5 s collapses the box. The tool works out the delay that keeps the box's shape instead: 36.7 s in a right turn and 1.0 s in a left turn. The screen flags when this happens.
- **Now:** the delay is solved rather than taken from the SMM, logged as D281.
- Detail: verification/turn-sim-recheck-223.md, section 5.

### SOF dashboard

**5. Keeping a lightning caution through a feed outage (SOF PJ1)**
- **Question:** If the last good lightning picture showed a strike inside the radius and the feed then fails or goes old, should the banner keep the caution until a good picture says clear?
- **Now:** yes. The caution stays, marked "can't tell now, last seen N min ago", with a plain amber "Lightning: can't tell" line once the gap passes 40 min (D352, D353).
- Detail: verification/sof-recheck-207.md, PJ1.

**6. How old can the cloud picture be? (SOF PJ2)**
- **Question:** Is a satellite cloud picture up to an hour old still useful at a SOF desk?
- **Why we ask:** ECCC's GOES picture normally arrives about 31 min late. With a 30 min limit it read STALE most of the time.
- **Now:** cloud 60 min, lightning 40 min, radar 20 min (D354).
- Detail: verification/sof-recheck-207.md, PJ2.

**7. Lightning caution radius: 20 NM? (SOF PJ3)**
- **Question:** Is 20 NM right for the SOF's lightning caution? Should the tool allow more?
- **Why we ask:** 20 NM (settable from 5 to 50) is V6's number, and no manual gives an NM radius. The NFM (Section VII, p. 7-4) notes lightning can travel up to 50 miles from a storm. A cell also counts as "within 20 NM" when its centre is up to about 1 NM beyond that, because the tool measures to the cell's edge.
- **Now:** 20 NM, as in V6.
- Detail: verification/sof-recheck-207.md, PJ3.

### Traffic Sim

**8. What counts as a conflict? (Traffic T4)**
- **Question:** What lateral and vertical distances should the Moose Jaw pattern use for a conflict and a caution?
- **Why we ask:** V6's built-in setup uses 200 / 200 ft (conflict) and 500 / 500 ft (caution), which is nearly touching; its general defaults are 1,500 / 500 ft and 2,500 / 1,000 ft.
- **Now:** the built-in setup's V6 numbers.

### Turn Sim

**9. The 4312 picture (plan doc Q31)**
- Still open from Dad's first email reply. Ask Patrick what it refers to before sending.


</details>
