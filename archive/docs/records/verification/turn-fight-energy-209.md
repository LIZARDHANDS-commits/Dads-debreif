# Turn Fight Energy engine (#209, c01dd90), re-run on d5ec406

Checked 12:40Z 2026-09-30 in Node (no screen yet). energy-sim unit tests 166/166; npm test at d5ec406 2567 pass, 0 fail. Checker scripts: scratchpad/en209/, auditor scripts: scratchpad/audit209/.

# Turn Fight Energy engine (#209, c01dd90): engine check in Node

Checker: independent, read only. Scripts and raw runs: scratchpad/en209/ (r1..r20, fuzz*.mjs, scan*.mjs). No repo file edited. Existing unit file passes (166 of 166).
Method: drove createEnergyFight/stepEnergyFight directly (0.02 s steps) over merge speeds, forced moves, deck starts, pursuits, altitudes, and random fuzz.

## Summary
High 0, Medium 2 (F1, F2), Low 6 (F3 to F8), 2 PILOT JUDGEMENT items (P1, P2), 1 spec/decision wording mismatch (S1).
Top: F1 forced Slice from very slow speed at 14,000 ft+ (or MPT speed 180) dives vertically to the ground with no flag; F2 Auto pitch back entered over 220 KIAS takes 300 to 390 deg of turn to reach the MPT (SMM/spec aim is under 180); P1 split S below 120 KIAS is 4x slower to the MPT than a slice; S1 spec still says level MPT bank "about 75 deg" while the engine (Patrick's 09:27Z choice) flies 68.5.

## Findings

### F1 (Medium) Vertical dive that never pulls out: forced Slice from very slow speed, high up
- Where: engine, physicalBankCommand (energy-sim.js ~line 1057, "nearVertical ... holds the current bank until the nose is 15 deg off the vertical") with handToMpt.
- Steps: createEnergyFight({blueKias:40, redKias:40, blueAltFt:15000, redAltFt:15000, blueMove:'slice', redMove:'slice', pursuit:'none'}); step 75 s. Also {blueKias:92, blueAltFt:22300, blueMove:'slice', mptKias:180, hardDeckFt:7500} (from fuzz) and {70 KIAS, 14,000 ft, mptKias 180}.
- Expected: the slice hands to the MPT and the MPT (and the deck guard, D178/D242 style) pulls out, holding 160 KIAS and the deck (spec step 3; "Auto reaches and holds the MPT").
- Actual: slice hands over at climb -79 deg with the carried bank at 97 deg (lift below the horizon). Within 15 deg of the vertical the command "holds the bank", so the nose is pinned at -90 deg for ever: G 7.0, speed 696 KIAS, altitude -35,000 ft at 75 s, label "Level MPT" from 22 s with nothing levelling. No OVER G/STALL (7.00 is not above 7), which is per the two-flag rule, but the state is meaningless.
- Reach: only outside the spec range. Merge speeds 100 to 316 KIAS at 10,000 to 25,000 ft, MPT speed 160 to 200, every move: 560 cases, 0 failures. Failures only below about 90 KIAS with a forced Slice at 14,000 ft and up (2 of 720 in a 40 to 140 KIAS sweep; the engine accepts 40 to 316 KIAS).
- Known/planned: no (D239 covers under-stall-speed sinking at the deck, not this).
- Recommendation: in the nearVertical branch, if the nose is below the horizon and the law wants it raised, command a bank at or under 90 deg toward the pull-out (or release to the current bank only when it is under 90); alternatively validate the merge speed at 60 or 86 KIAS and up. Log as a decision.
- Missing test: tests/unit/turn-fight/energy-sim.test.js, "a forced slice from 40 to 90 KIAS at 15,000 to 25,000 ft never dives past -60 deg for good: still above the deck minus 500 ft and under VMO after 150 s".

### F2 (Medium) A pitch back entered over 220 KIAS takes 300 to 390 deg of turn to reach the MPT
- Where: Auto above 220 when the Immelmann is gated (top under 120 KIAS) or loses the race, or a forced pitch back.
- Steps: pitch back, pursuit none, 10,000 ft: MPT within 5 kt at +9.1 s/140 deg (220 KIAS), +16.7 s/303 deg (221), +17.8 s/318 deg (230), +19.8 s/344 deg (250), +24.6 s/391 deg (316). Handover to the MPT is 2 to 6 s in (16 to 43 deg); the speed then takes the rest.
- Expected: spec step 2 "aiming to be there before 180 deg of turn (SMM 14.17 para 42)"; 220 KIAS meets it, the step at 221 misses it by 120 deg. The jump 140 to 303 deg between 220 and 221 comes from D236 (6 s lead above 220).
- Actual: as above; Auto at 221 to 235 KIAS (where the Immelmann tops under 120 KIAS at 10,000 ft) picks this.
- Known: partly (D236 explains the lead; the turn cost is not stated).
- Recommendation: accept (the SMM band ends at 220 and the reason already says "outside the SMM band"), but add the degrees to the Dad-check list: "pitch back over 220 KIAS: 300 to 390 deg".
- Missing test: energy-sim.test.js, "a pitch back from 221 to 316 KIAS reaches the MPT within N deg", pinning today's numbers (at most 400) so a change is seen. The existing 180-deg test stops at 220.

### F3 (Low) STALL not shown before the pass at a merge speed under 86 KIAS
- Steps: createEnergyFight({blueKias:70, redKias:70}); step 5 times: kias 70, stall false, stallReason ''. It turns on at the pass (reason "70.0 KIAS is below the 86 KIAS stall speed").
- Expected: spec "STALL when ... the speed falls below the 1 G stall speed". Plan value: readOut sets no stall in flyStraight/newAircraft.
- Missing test: energy-sim.test.js, "below the stall speed STALL reads from T+0, before the pass".
- Reach: the spec range is 100 to 250, so only for a typed 40 to 85.

### F4 (Low) Pass at 1 to 12 ft in every even (mirror) fight, and no winner
- Steps: default setup (220 v 220, same altitude): first nose-on "both" at +17 s, range at the closest 2 ft; 230/230 8 ft; 316/316 12 ft. No chase ever (D152); both descend to the 6,000 ft deck and fly the level MPT (146 KIAS) to the 10-minute stop.
- Expected: by design (D152, spec step 4). Nothing is wrong in the maths; the default demo looks unfinished and the two jets occupy one point.
- Recommendation: the screen (task 11) says "Even fight: nobody gets behind" beside the result; do not add a collision flag (two-flag rule).
- Missing test: readouts/screen test when the screen lands: default fight after 10 min shows first nose-on "both" and no chase, and the note.

### F5 (Low) Stall text prints equal numbers
- Steps: forced pitch back 220 KIAS, blueForceG 5.5: "The pull needs 5.5 G; the stall line at 202 KIAS gives 5.5 G" (5.5 vs 5.49).
- Recommendation: 2 decimals when they round the same. Missing test: energy-sim.test.js, the stall reason never reads "needs X; gives X" with equal text.

### F6 (Low) Above the stall line and above 7 G at once, only STALL shows
- Steps: forced MPT 240 KIAS, blueForceG 8: STALL for 1 s at 1 G; OVER G never (pull 8 G, stall line 7.8 G). At 1 G it is right that OVER G clears, but the instant flag cost is lost.
- Recommendation: fine as is (STALL takes the turn); mention in the help text. Missing test: none needed unless Patrick wants both.

### F7 (Low) Reason text rounds to the boundary
- Steps: pickMove(119.9, 10000) reads "Split S: 120 KIAS, below 120"; pickMove(220.1) reads "Immelmann: 220 KIAS, above 220". Only non-integer speeds (the box may give integers).
- Missing test: energy-sim.test.js, reason KIAS uses the same rounding as the rule (or one decimal at a boundary).

### F8 (Low) "MPT speed" box has no range; a high value near the deck sinks under it
- Steps: mptKias 200, 220 or 250, start 7,000 ft, 100 to 160 KIAS, deck 6,000 (Auto picks "Level MPT at the deck"): lowest 5,495 (mpt200), 4,783 (mpt220), 4,570 (mpt250 at 140 KIAS). At 160 to 180 no problem in 560 cases.
- Recommendation: bound the box (for example 100 to 200) in checkedSetup and the screen. Missing test: energy-sim.test.js, "the MPT speed has a bound", like the other Auto settings.

Also seen, not worth an ID: a start at 164 KIAS ("MPT straight away", within 5) rises to 165.3 to 165.8 KIAS (3 of 280 starts, 5.3 to 5.8 kt from 160).

## PILOT JUDGEMENT

### P1 Split S below 120 versus a slice
- Model numbers (10,000 ft, deck low, no chase): slice from 100 to 119 KIAS reaches the MPT in 6.4 to 7.4 s and 58 to 80 deg, at 9,320 to 9,480 ft. The Auto split S (from 100 to 119) reaches it in 25 to 29 s and 360 deg, at 8,700 ft; it exits at 205 to 209 KIAS and Auto then flies a pitch back as its follow-on. At 50 to 90 KIAS the slice still wins (7 s, alt 8,980 to 9,240 against 20 s, 8,260 to 8,350), with STALL for the first 1 to 3 s under 86.
- Question: does a Harvard slice from 100 to 119 KIAS really build 160 KIAS in about 7 s and 60 deg, losing 600 to 700 ft?
- Recommendation: keep the approved rule (split S under 120, SMM Table 14.1), but put this comparison on the Dad-check list beside "Auto's split points: 220 and 120". If Dad says the slice is right, drop the split point to about 100 (the SMM slice band is 100 to 160). No code change until he answers.

### P2 Even fight has no chase
- Question: in a mirror fight, should the head-on re-pass ever start a pursuit? Recommendation: keep it off (D152, D205); the screen says why (F4).

## Spec / decision mismatches
- S1 (Low, wording): spec "How the model flies" step 3 says the level MPT bank is "about 75 deg". Patrick's 09:27Z answer (a) chose the chart bank; the engine flies 68.5 deg at 6,000 ft, 68.1 at 8,000 (energy-model-check.md a). Recommendation: change the spec line to "about 69 deg (SMM ~75)". Missing test: none (a doc line), or add to the existing level-MPT test a 68 to 70 deg bound.
- D154/D168: level MPT 146.4 KIAS at a 6,000 ft deck (rule 144, +2.4), 145.3 at 8,000 (rule 142, +3.3): inside the spec's 5 kt. Consistent with D168.
- No logged Turn Fight or Energy call contradicts the SMM or the spec otherwise (D152, D153, D165, D175, D177, D178, D179, D234 to D243 checked in the numbers below).

## Checked and PASSED
- Auto pick boundaries (pickMove, integer speeds 99 to 316): 99 to 119 split S, 120 to 154 slice, 155 to 165 MPT straight away, 166 to 220 pitch back, 221+ Immelmann (or pitch back when the top is under 120 KIAS, or the race). Out-of-band note appears at 251+ Immelmann and 221+ pitch back (reasons quoted in scratch r19). Deck fallback: 110 KIAS at 7,900 ft split S (loss from top 1,890), at 6,500 ft (under 1,000 above the 6,000 deck) MPT, level at the deck.
- Every forced move (100 to 250 KIAS): none NaN; each ends at the MPT and holds it within 1.3 kt after 10 s.
- Speeds converge: 280 Auto starts (40 to 316 KIAS by 4, 8,000 to 20,000 ft): all reach the MPT (slowest 44.5 s); after reaching it 277 stay within 5 kt of 160 (3 are the 164 KIAS starts above).
- Level MPT at the deck: 146.4 KIAS at 6,000 ft, bank 68.5, 2.7 G, height 6,000.0 (never under), from 100 to 250 KIAS starts, 6,000 and 8,000 ft decks. Settles in 20 to 230 s (the 10,000 ft descent takes 230 s).
- CSMPT: 160 KIAS, 72.2 deg, 3.26 G at 10,000 ft, 18.5 deg/s, sink 1,442 ft/min; energy height falls at exactly the Ps the readout gives (25.18 vs 25.18 ft/s).
- Energy accounting: over 60 runs of 100 s (6 moves x 5 speeds x 2 altitudes), change in energy height against the integral of Ps: worst error 10.5 ft (140 KIAS Immelmann, in a near stall at the top).
- Turn rate against the NFM chart (core's points): level MPT at 6,000 ft 16.7 deg/s against about 17.3 read; at 10,000 ft deck 16.3 against about 15.9; both within 1 deg/s.
- Split S: identical to core's splitST6A at 90 to 200 KIAS and 7,000 to 15,000 ft (loss from entry 1,689 and from the top 1,976 at 110 KIAS/10,000 ft; peak 5.00 G).
- Immelmann/pitch back/slice: 250 KIAS Immelmann gains 2,483 ft, tops at 125 KIAS; 220 KIAS pitch back gains 809 ft, MPT after 140 deg, bank 30 deg at 220 rising to 60 at 160; slice bank 98/105/113/120/128/135 deg for 150/140/130/120/110/100 KIAS (spec 90 to 135 line).
- Throttle: forced MPT from 220 KIAS at mid-range and 4 G, MAX when the shaker comes on (thr 0.5 then 1 at +8 s); other moves at 1.
- Stall costs the turn: forced 5 G at 160 KIAS gives STALL, 1.00 G for 1.02 s, then the shaker (3.37 G).
- OVER G: forced 5.5 G pitch back while rolling at 220 KIAS flags "5.5 G while rolling is above +4.7 G"; no unforced run in 400 random fights flagged OVER G or STALL (from the stall line), and no G above 7 or above the stall line went unflagged.
- Pursuit: pure/lead/lag nearest approach 424/186/662 ft (100 v 220), 164/122/222 (1-circle 220 v 200), 134/168/674 (300 v 280). Head-on re-pass starts no chase (default) and does with chaseAfterHeadOn.
- Auto v Auto, 500 random starts (all geometry, altitudes 6,000 to 25,000 ft, pursuits, 200 s): 0 runs under the deck by over 500 ft, 0 over 320 KIAS. Auto/forced mixes reached VMO or the deck only when a forced split S or slice from 250+ KIAS was flown (what-ifs).
- Fuzz for NaN and errors: 1,500 random starts with extreme model settings (stall 60 to 110, shaker 0.7 to 1, roll 20 to 180, MPT 90 to 250, forced G 0 to 12), 4.5 million steps: 0 NaN, 0 unexpected throws (only the documented "range more than the height between" refusal), stepping in odd chunks equals 0.02 s steps exactly, 1,500 of 1,500.
- Determinism: same setup twice gives identical fights (60 of 60).
- Start altitude 6,500 to 25,000 ft: pitch back 200 KIAS gain 334 to 506 ft; Immelmann 250 KIAS gain 2,239 to 4,404 ft (top speed falls to 92 KIAS at 25,000 ft, MPT reached late at 20,000 ft and up: a forced Immelmann; Auto's 120 KIAS gate stops it); split S 110 KIAS from-entry loss 1,145 to 2,437 ft rising with altitude.
- Known and not raised: D205 (head-on chase can climb past 25,000 ft), D239 (under stall speed near the deck).

## Audit (auditor agent, read-only) — its corrections override the text above
| Finding | Verdict | Notes |
|---|---|---|
| F1 Medium, forced Slice at slow speed dives vertically | Confirmed | 40 KIAS/15,000 ft ends at 695 KIAS, -35,646 ft, 7 G, no flag. The cause is energy-sim.js:931: the near-vertical rule holds a 97-103° bank, so the dive becomes a stable corkscrew. "90 KIAS or less" is approximate (92 KIAS/22,300 ft/MPT 180 also fails). A 1,224-case sweep from 40 to 140 KIAS failed 4 times, all forced slice. Missing test: a slow forced slice from 15,000-25,000 ft stays above the deck and under VMO. |
| F2 Medium, pitch back over 220 KIAS takes 300-391° | Confirmed, range corrected | Auto uses the pitch back at 221-240 KIAS at 10,000 ft (221-238 at 8,000, 247 at 15,000, 258 at 20,000). The cause is the 6 s lead (captureLeadFastSec, :145/:778). A mutation to 3 s gives 109-173° for 221-300 KIAS, so a speed-graded lead fixes it; only 290-316 KIAS needs the long lead. Missing test: extend the 180° test (:1099) past 220 KIAS. Side note: Auto Immelmann at 241+ also takes 279-295°, but the spec's 180° aim covers only the pitch back and slice. |
| P1 split S under 120 KIAS against a slice | Confirmed | Slice 6.4-7.4 s, 58-80°, ends 9,321-9,484 ft. Split S 25.4-28.8 s, 360°, ends 8,703-8,718 ft (3.4-4.5x slower). A question for Dad. |
| S1 spec says about 75°, engine flies 68.5° | Confirmed | SPEC-turn-fight.md:283. The engine matches D143 (MPT about 69°), so the spec wording is stale. |
