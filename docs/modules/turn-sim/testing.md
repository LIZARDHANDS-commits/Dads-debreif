# Turn Sim: testing and sign-off

The whole-tool testing policy in `../../TESTING.md` applies. This file adds the module's own rules, how each of its requirements is checked, its sign-off checklist, and what happens to each of its test files.

Sources in this file point to where things were on 4 Oct 2026: `pf/` means the project files (`pf/`, private), and repo paths such as `docs/records/` or `specs/` are now under `archive/` (see `archive/README.md`).


Built on TS-R1 to TS-R27, ratified by Patrick on 4 Oct 02:26Z (`pf/reset/1-requirements/requirements.md`, "## Turn Sim"), and the "Realistic kinematics means (Turn Sim)" paragraph under them. The Turn Sim review, the plan's last step, decides whether the Turn Sim is rebuilt, gets a new core, or is fixed (`pf/reset/consolidation-plan.md:261-268`). So every Turn Sim test file is marked "follows the Turn Sim review" in the test register's Turn Sim section, with the mark it would get if the code is kept and what carries over either way. The rules below hold whatever the review decides.

**Today:** 21 unit files (189 tests) and one browser file (46 runs), all passing at `6283f38` (`pf/reset/5-testing/browser-results-6283f38.md`). Passing means only that the tests match the code. Patrick found on 3 Oct that the aircraft "do not behave as per the smm" (`pf/reset/0-lessons/antigravity.md:71`), and the ratified requirements differ from what the tests pin in three places:
- The default timing is a fixed 16 s delay (`src/modules/turn-sim/settings.js:73`), where TS-R7 says the clock cue.
- The Speed box is flown as ground speed, where TS-R6 says KIAS converted to true airspeed.
- The Delayed 45 ends about 3,900 ft apart and TIGHT (`tests/unit/turn-sim/delayed-45-check.test.js:93`), where TS-R5 says the wingmen fix to line abreast on roll-out.

Other facts from the test agent's report (`pf/reset/5-testing/agents/turn-sim.md`, module summary):
- 44 unit tests and 5 browser tests gate on a time.
- 22 pin a V6 number or V6 behaviour.
- Several pin the engine's own output.
- 75 have a tolerance band typed into the test, and none uses the shared tolerance table.
- No test checks that an in-place turn ends in trail (TS-R4) or that labels wait for the roll-out (TS-R23).

## First version (live mode, `spec.md` Part 1)

The first version's checks are in `tests/unit/turn-sim/live.test.js` and follow FM1, FM2, FM5, FM6 and FM8 below: end pictures for every button both ways and with #2 on either side (who is where, which way they face, spacing within ±100 ft, heading within ±5°, against SMM 16.19 paras 52-64); bank never past the manoeuvre's bank by more than half a degree and G at 3; at least 300 ft vertical at the cross in the shackle and cross turn; every hand-over smooth (Patrick, 4 Oct 10:05Z: no jump in position, track, bank or pitch or their rates; TS-47); a press while flying is queued. No time gates. The plan-mode tests stay as they are until Step 3 of `plan.md`. The plan-mode browser test (`tests/e2e/turn-sim.spec.js`, sign-off only) checks the old screen and fails on the new one; it is retired or rewritten in Step 3 with Patrick's yes.

**Sign-off checklist, first version** (draft, for Patrick to put in his own words). Open the Turn Sim fresh, V2.6 or later, 2D:
1. The pair sits in line abreast, Lead on 000, #2 on the right at 6,000 ft, paused at t = 0; nothing covers the picture.
2. Press each button, both ways where it has sides: the pair flies it the way the SMM figure draws it and carries on in line abreast. Delayed 90 and 45 roll out abeam with sides swapped; check 20 keeps the shape turned 20°; in place 90 ends in trail; the hook comes back the other way abreast; the shackle ends on the original heading with sides swapped; the cross turn comes back the other way.
3. In the shackle and cross turn, #2 climbs over Lead (the Formation card shows about 300 ft) and comes back down.
4. Nothing jumps or snaps: rolls in and out look smooth at 0.25×, in 2D and in 3D.
5. A press during a manoeuvre shows "Next: ..." and is flown when the first ends.
6. The camera keeps both aircraft in view; ground tracks stay drawn; the planned path is dashed ahead.
7. The Formation card judges only after roll-out, in words with the numbers.
8. Change Spacing to 3,000 ft: it is flown and flagged as outside the SMM band; type 500 ft: refused with a reason. Switch #2 to the left: the start mirrors and the buttons' into/away words swap.

## 4-ship (live mode V2.7, `spec.md` section 8)

The 4-ship's checks are in `tests/unit/turn-sim/four-ship.test.js`, with the 2-ship's margins (±100 ft, ±5°): the start picture and altitude stack (AFM8 brief p.14-15, SMM Fig 16.33); the end picture of each button both ways and with #2 on either side (SMM 16.19 paras 52-60, 16.43 para 118, 16.45 para 121, Fig 16.34); who turns first and the wait between them, spacing ÷ speed × cot half the turn (AFM8 brief p.17, SMM 16.19 paras 52-57); the delayed 45's check turn of 10 to 15° (AFM8 brief p.18; one degree either side for the roll-out running on); bank and G for all four; no two aircraft within 300 ft vertically and horizontally (SMM 16.13 para 31, Gen Book p.11) with the stack held, and an **estimate** that they are never under 1,000 ft apart horizontally; every hand-over smooth for all four (TS-47); the queue; the roll-out judgement per wingman. The delayed 45's end gaps are only held to the SMM's 4,000 to 6,000 ft band (plus 100 ft) because the check turn costs room (the brief's note says fix on roll-out). No time gates.

**Sign-off checklist, 4-ship** (draft, for Patrick to put in his own words). Open the Turn Sim fresh, V2.7 or later, 2D, and choose Formation: 4-ship:
1. Four aircraft side by side facing 000, #4 #3 Lead #2 from left to right, 6,000 ft apart, on a stack (the Formation card shows #2 +300, #3 -300, #4 -600 against Lead); the shackle and cross turn buttons are gone.
2. Delayed 90 right: they turn one after another from the outside in (#4, #3, Lead, #2 with #2 on the right) and roll out abreast, sides swapped, one spacing apart. Left turns go the other way round.
3. Delayed 45 right: the outside aircraft turns 45 first; each other aircraft checks a little back toward it, then turns; all roll out abreast on the new heading, the first to check a little tight.
3b. Clear "Delayed 45 with the check turn" under Setup and fly Delayed 45 again: nobody checks away; they turn one after another and roll out abreast at one spacing.
4. Check 20 keeps the line turned 20°; in place 90 ends as a column of four; the hook comes back the other way abreast.
5. Nothing jumps; the camera keeps all four in view; ground tracks and dashed planned paths show for all four; 3D shows all four at their heights.
6. Switch back to 2-ship: it starts again from the 2-ship's default start. Switch to 4-ship again: back to the 4-ship's default start.

**Training errors (TS-52), `tests/unit/turn-sim/errors.test.js`.** Expected values are worked out in the test from the SMM pictures and plain geometry, never from the code's own output: with a start offset and no fix, #2 ends at the SMM picture plus the offset turned with Lead's heading change; a timing error moves #2 by speed times seconds times the chord of the turn. Margin ±100 ft (the shared table). "Fix it" is checked as "never worse" and "closer where a fix has something to work with", not as "always perfect": at constant speed some fore/aft errors cannot be fully fixed in the check turn, Delayed 45 and shackle (spec section 9), and the test does not pretend otherwise. The fix limits (bank 50 to 75°, 30 s delay, 60 ft/s climb) are estimates, checked only as "the flying stays inside what the plan allows"; they are not requirements. Physical limits (roll 90°/s, build-up 360°/s², constant speed with Speed/power unticked) and smooth hand-overs (F12) are checked with errors on. **Fix tools (V2.10):** with all four ticked, a 1,200 ft fore/aft and a 1,500 ft spacing error end in the SMM picture (±100 ft) after a Delayed 90, both ways and on both sides; an unticked tool is never used (speed constant with Speed/power unticked, no extra roll-in with Lateral unticked, the height error stays with Vertical unticked, no fix bank with Geometry unticked, nothing ticked carries the error); the hand-over test above now flies speed changes too (default all ticked). The speed segment itself is checked in `live.test.js` (ends on the new speed, the acceleration never jumps, straight when flown alone). Not in CI: a per-step energy check through the speed changes (dropped after two failures, the second a finding about the V2.8 crossing climb, see `README.md`). No time gates, no browser test yet.

**Sign-off checklist, training errors** (draft, for Patrick to put in his own words; V2.6 or later, 2D). Open "Errors (training)", it starts closed and everything on it is "None":
1. With every error "None" the screen and every button behave as in the first version.
2. Set Along the 3/9 line to Ahead, response "Turn at normal reference", press Delayed 90: #2 ends ahead of abeam by about the same amount, and the Formation card says the error carried through.
3. Same error, response "Fix it": #2 delays or presses on so he ends close to abeam, and the card says what was fixed and what was left. Try Wide, Tight and Late the same way; "closer, turn early; wider, delay" should look right to you.
4. Set Height High 500 ft, press the shackle: #2 comes back to Lead's height smoothly and still clears Lead by 300 ft at the cross.
5. Nothing jumps or snaps with an error set; the bank looks smooth into and out of a stronger fix turn, and the card flags any G above 3.
6. Random error: Reset a few times; each time one error is named on the card.
7. Say if "Ahead (acute)" and "Behind (sucked)" are the right way round for how you and Dad use the words.
8. Fix tools (V2.10): with Fix it, untick Geometry, set Behind and press Check: #2 rolls out, dives a little as he adds power, slides forward, climbs back and matches Lead's speed. Untick Speed/power too: the card says what is left and that Speed/power (with Lateral spacing if needed) would have fixed it. Tick everything again, set Wide and press Delayed 45: after the roll-out #2 turns a few degrees in and back and ends on spacing. The speed and heading changes look gentle and nothing jumps.

## Changing formation, 2-ship (TS-53, `spec.md` section 10)

The checks are in `tests/unit/turn-sim/transitions.test.js`, a handful, written to Patrick's 4 Oct 11:50Z rule (test that it flies right; no exact wording, exact seconds, control counts or one-off values):

| What | Check | Source of the expected value |
|---|---|---|
| Every from-to pair ends in the target's band | All 20 changes between line abreast, fighting wing, echelon, route and line astern (Side kept) end in the band written out from the spec table, with the pair parallel (within 1°) and reading as that formation | `spec.md` section 10 table: SMM 16.18 para 49, 12.29 para 69, 12.6 para 15, 12.4 paras 11-12 (estimate), 12.5 para 13; margins ±100 ft and ±5° where the shared table applies, the close positions use the table's own |
| Speeds | Both aircraft end at 200 KIAS outside line abreast and 220 in it (±0.5 KIAS) | Patrick 11:08Z; SMM 12.23 para 53, 16.18 para 49 |
| Smooth hand-overs | Hot turning rejoin, entry to line abreast (Lead speeds up) and a station change: no jump in position, track, bank, roll rate (90°/s, 360°/s²), pitch rate (0.5°/s per step) or speed (3 kt/s, no step in its rate) | Patrick 10:05Z (TS-47); the speed bound covers the smootherstep's peak; from V2.20 slowing follows the slow-down model (TS-61), whose planned ramps peak within the power stage's own rate, about 2 kt/s at 200 KIAS |
| Rejoin lane | #2 below Lead inside 2,000 ft, never more than 100 ft ahead of Lead's 3/9 line inside 1,000 ft, #2's bank within the 60° cap and Lead's within 30° (each plus half a degree for the roll) | SMM 12.27 para 65; design section 10; the 60° cap is an estimate |
| The queue and the greying | A press during a change is flown the moment it ends; a manoeuvre is refused outside line abreast | TS-45, spec section 10 |
| Time | Only a 3-minute catch that the planner finished; no timing check | spec section 10 |

Not tested: the screen (buttons, card, range ring, zoom): sign-off only. Not run locally before the pull request (CI is the one check).

**Sign-off checklist, changing formation** (draft, for Patrick to put in his own words). Open the Turn Sim fresh, with the version shown on screen, 2D, 2-ship:
1. "Change formation" sits above the manoeuvres: Line abreast (greyed: you are here), Fighting wing, Echelon, Route, Fluid manoeuvring (greyed, "coming later"), the Side switch, and Line astern under More.
2. Press Fighting wing: Lead slows to 200 KIAS, pauses while #2 closes, then turns gently into #2; #2 ends about 750 ft back at about 45° on the same side and below Lead. The card shows Now, Flying and the rejoin block (range, closure, Lead's clock position, ON LINE / HOT / COLD, height) and judges the end against the fighting wing band.
3. Press Echelon, then Route, then Line astern, then Fighting wing again: each is a slow station change that looks like the manuals (cross behind and below, never in front of Lead); the camera zooms in by itself as they get close and the card judges each end.
4. From fighting wing press Line abreast: Lead speeds up to 220 KIAS and #2 opens out to the spacing. Press echelon from line abreast: the hot turning rejoin straight to echelon through the fighting wing position.
5. Use the Side switch (L or R) with Echelon and Fighting wing: #2 changes side behind Lead.
6. In any close formation the manoeuvre buttons are greyed with a reason; in line abreast they work as before.
7. Press a second button while a change is flying: "Next: ..." shows and it is flown after.
8. Nothing jumps or snaps in 2D or 3D at 0.25x; bank looks smooth into and out of the rejoin turn; the flags stay quiet unless something is wrong.
9. Say if the estimates look right: the 60° bank cap, the 15 KIAS overtake, Lead's pause and 30° turn, hot and cold at 60° and 30°, the fighting wing default of 750 ft, 45° and 60 ft below, and the close-formation distances.

## 4-ship G-warm and changes (TS-54, `spec.md` section 8.1)

The checks are in `tests/unit/turn-sim/g-warm.test.js` and `tests/unit/turn-sim/four-ship-changes.test.js`, written to Patrick's 4 Oct 11:50Z rule (test that it flies right: no snaps, limits flagged not walled, ends in the right formation, nothing breaks; no wording, seconds, counts or one-off values):

| What | Check | Source of the expected value |
|---|---|---|
| G-warm, both sides | The first turn is toward #2; the least G is about half a G and the most about 4 (±0.5 G); the four sink in the push and end level, on the starting heading (±5°), on the stack (±100 ft), in the same left-to-right order, abeam at 4,000 ft (±100 ft) with sweep under 15° | SMM 16.22 para 71, 16.44 para 120; AFM8 brief pp.14, 16; SMM 16.18 para 49 |
| G-warm smoothness | Nothing jumps; the four stay apart (300 ft) | TS-47; SMM 16.13 para 31 |
| G-warm refusals | Refused outside Spread 4; a 2-ship press throws | spec section 8.1 |
| A tour of the formations, both sides | Fighting wing, Fluid 4, offset box, fighting wing, finger, echelon, finger, box, finger, route, finger, line astern, finger, fighting wing, Spread 4: each ends in the formation pressed, link by link, on the side asked, at 200 KIAS (220 in Spread 4 and the offset box, ±10 kt) | The bands written out in the test from SMM 12.6 para 15, 12.29 para 69, 16.18 para 49, 16.32, 16.38, 16.41 para 109; AFM8 brief pp.14, 20; the 2-ship spec table's close margins; Patrick 11:08Z, 11:44Z |
| The Side switch and straight-ahead rejoins | Finger and echelon both ways across, the straight-ahead rejoins, each ending in place | spec section 8.1 |
| Always true | No roll faster than 90°/s, no jump in position or height (40 ft/s at most, an estimate of a gentle climb), bank under 90°, never two aircraft within a wingspan | TS-37, TS-47; T-6A wingspan |
| Gates | In the turning rejoin to finger, #2 is in before #3, and #3 before #4 | SMM 16.34 para 96 |
| Refusals and the queue | Fluid manoeuvring and "already there" are refused with nothing moved; a press during a change waits its turn; the manoeuvres are refused outside Spread 4 | spec section 8.1 |
| Time | Only catches (5 minutes for G-warm, 10 for a change) that the plan finished; no timing check | design section 9 |

Not tested: the screen (buttons, card lines, the 4-ship close zoom): sign-off only. Not run locally before the pull request beyond the two files once (CI is the one check).

**Sign-off checklist, 4-ship G-warm and changes** (draft, for Patrick to put in his own words). Open the Turn Sim fresh, with the version shown on screen (V2.13), 2D, Setup Formation 4-ship:
1. The Change formation group shows the four's buttons: Spread 4 (greyed: you are here), Fighting wing, Fluid 4, Fluid manoeuvring (greyed, "coming later"), Offset box, Finger, Echelon, Box; Line astern, Route and the rejoin choice under More.
2. Press G-warm: in place 90 toward #2, the push over (a small dip), hook the other way, back to the start heading, and the wingmen tighten to about 4,000 ft. The card shows each step and, after, the G flown against each call.
3. Press Fighting wing: Lead slows to 200 KIAS, pauses, turns gently toward #2; #2 rejoins inside, #3 and #4 on the far side, each about 650 ft off the one ahead, holding the stack.
4. Press Finger: Lead turns into #2; #2 joins first, then #3, then #4; nobody crosses until the one ahead is in. The camera zooms in as they close.
5. Press Echelon, Box, Line astern and Route, coming back to Finger between them: each looks like the SMM (cross behind and below, #4 lower than #3), slow and smooth.
6. Use the Side switch with Echelon and Finger: #2 crosses behind and below Lead.
7. From fighting wing press Fluid 4, then Offset box: #3 goes out to about 6,000 ft abeam with #2 and #4 in fighting wing; then both elements turn in place 90 and spread into the box, the second element about 7,000 ft back. Press Fighting wing: the box rejoins.
8. Press Spread 4: Lead speeds up to 220 KIAS and the four open out on the stack. The manoeuvre buttons work again; in any other formation they are greyed with a reason.
9. Nothing jumps or snaps in 2D or 3D at 0.25x; a second press during a change shows "Next: ..." and is flown after.
10. Say if the estimates look right (`decisions.md` TS-54): the push-over dip and recovery, Lead's 90° turn into the others to finger, Fluid 4's #4 at 45°, the box on #2's side, (#2 above Lead in a stacked rejoin and fighting wing to echelon through finger are replaced by TS-55: he comes off the stack first, and fighting wing to echelon is a straight-ahead rejoin.)

## Hot turning rejoin, fighting wing turns and the SMM's moves (TS-55, `spec.md` section 10.1)

The checks are in `tests/unit/turn-sim/formation-moves.test.js`. They follow Patrick's 4 Oct 11:50Z rule: test only that it flies right. No wording, seconds, counts or one-off values are pinned.

| What | Check | Source of the expected value |
|---|---|---|
| Hot turning rejoin, standard start | Lead's first turn is into #2. Inside 2,000 ft #2 stays below Lead, and inside 1,000 ft he stays in the overshoot lane. Bank stays under the caps. It ends in fighting wing or echelon. | SMM 16.20 paras 65-66, 12.24 para 54, 12.27 para 65; Patrick 18:00Z, 19:16Z |
| Fighting wing turns | Delayed 90 both ways, Check, Hook, In place 90 and Delayed 45 each start in fighting wing. #2 stays below Lead and under the bank cap, and ends in the 500-1,000 ft, 30-60° band (±100 ft, ±5°). | SMM 12.29 para 69, Fig 12.19; Patrick 19:12Z |
| Echelon to fighting wing | In the band inside 30 s and ends there. Patrick asked for about 7-15 s; 30 s is a generous limit with its reason in the test. | Patrick 19:03Z |
| Fighting wing to echelon, both sides | #2 lines up on Lead's six, stays below Lead, never overlaps him, and ends in echelon on the side asked. | SMM 12.26 paras 62-63, Fig 12.17; Patrick 19:04Z |
| 4-ship stack and echelon | No wingman closes while at or above Lead's height inside 2,000 ft: Spread 4 to fighting wing, then fighting wing to echelon. The four end in echelon, link by link. | SMM 12.27 para 65; Patrick 19:11Z |
| 2-ship station changes | Echelon to echelon across, echelon to line astern, line astern to echelon. No wings overlap. Crossing is below Lead. #2 stops behind the new slot before moving up. Each ends in the formation pressed. | SMM 12.20 paras 44-47, Figs 12.12-12.13; Patrick 19:26Z |
| Always true | Roll rate never steps by more than the T-6 can. Speed changes stay under 3 kt/s and never step. | TS-37, TS-47 |

Not tested:
- the screen (the turn buttons enabled in fighting wing, the Flying line) and the 3D view: sign-off only;
- off-standard hot rejoin starts (not built);
- the side change during a hot rejoin to fighting wing ("fw" with Side left). In scratch runs it peaks at about 3.1 kt/s and has one small speed-rate step, just over the smoothness line, so it is left out of the test until it is fixed.

Not run locally before the pull request beyond this file once (CI is the one check).

**Sign-off checklist, TS-55** (draft, for Patrick to put in his own words). Open the Formation Simulator fresh, with the version shown on screen (V2.15), 2D, 2-ship:
1. Press Fighting wing from the default start. Lead turns into #2 at once. #2 points at Lead, rolls out, reverses as the line of sight moves, and slides into fighting wing with fuselages aligned, below Lead throughout.
2. Press Echelon from the default start. The same rejoin carries on through the fighting wing spot to echelon.
3. In fighting wing, press each turn button both ways. In the check #2 holds his place. In the bigger turns #2 collapses toward Lead's six and fixes tight or stretched on the turn in and turn out, ending anywhere in the band.
4. From echelon press Fighting wing. #2 drops back and sweeps out in about 7-15 s, smoothly.
5. From fighting wing press Echelon. #2 lines up on Lead's six, closes with overtake, takes a small vector out at about 500 ft, stabilises in route, then moves up to echelon. Try the Side switch too.
6. From echelon press Echelon with the Side switch on the other side. #2 goes back and down into the corner and stops. He crosses at a steady speed slightly behind line astern, stops behind the new slot, then moves forward and up. Try Line astern and back.
7. 4-ship: press Fighting wing from Spread 4. #2 comes off the stack before he closes. Then press Echelon: each wingman flies the straight-ahead rejoin in turn.
8. Nothing jumps or snaps in 2D or 3D at 0.25x.
9. Say if the estimates in TS-55 look right.

## Turns in every formation, 4-ship station changes and the screen pieces (TS-56, `spec.md` section 10.2)

Patrick's 11:50Z rule again: test only that it flies right. No wording, seconds, counts or one-off values are pinned.

| What | Check | Source of the expected value |
|---|---|---|
| 2-ship close formation turns | Echelon (both sides), route and line astern, Hook and Delayed 90 both ways. #2's bank stays within ±5° of Lead's. Once Lead has held his bank 5 s (the 3 s plane lag, an estimate, plus 2 s), #2 out to the side is stepped up on the outside and down on the inside. No wings overlap, height changes stay gentle, and #2 ends in the same formation on the same side. | SMM 12.19 paras 41-43, Fig 12.11; Patrick 18:11Z |
| 4-ship turns | Finger, echelon, box, line astern, route and fighting wing, Delayed 90 and Hook. The same rolling and stepping checks link by link in the close formations. The four end in the formation they started in. Nothing snaps and nobody comes within a wingspan. | SMM 16.36 paras 99-102, 16.37 para 103; AFM7 brief p.14 |
| 4-ship station changes wait for the one ahead | Finger to echelon on #3's side: when #2 crosses behind Lead, #3 is already wider than his echelon place. Finger to line astern: #3 moves across only once #2 is in line astern. Each ends in the formation pressed. | SMM 16.32 paras 86, 87, 89; AFM7 brief p.19 |
| 4-ship turning rejoin and straight-ahead rejoin | As before (TS-54, TS-55): joins in order #2, #3, #4, and each ends in place. | SMM 16.34 paras 95-96 |
| Info tag, fighting wing | 750 ft at 45° is IN POSITION; 400 ft TIGHT; 1,200 ft STRETCHED; 15° and 75° OUT OF CONE. Sweep reads 0° abeam and 30°, 45°, 60° at the cone (±5°). | SMM 12.29 para 69, Fig 12.19 |
| Always true | Roll rate never steps by more than the T-6 can. Speed changes stay under 3 kt/s and never step (2-ship). | TS-37, TS-47 |

Changed to keep their intent when the turns came to the close formations: `transitions.test.js` presses the Shackle in route (still refused) instead of Delayed 90 (now flown), and `four-ship-changes.test.js` presses G-warm in finger (still refused) instead of the Hook (now flown).

Not tested:
- the screen: the Fit button, the camera pausing on a pan or zoom, Lead's 3/9 and 7/5 lines, the tags on screen, the 3D picture. These were checked by eye in a browser run against `npx vite` (pictures in the project files at `turn-sim-review/screens/v216-*.png`) and are for sign-off;
- the layout saved before V2.16 keeping its choices (layout version 3): browser sign-off only;
- the 4-ship's speed smoothness in turns (the 4-ship test checks jumps in position and height, not kt/s; scratch runs stayed under about 2.3 kt/s).

Not run locally before the pull request beyond the touched files once (CI is the one check).

**Sign-off checklist, TS-56** (draft, for Patrick to put in his own words). Open the Formation Simulator fresh, with the version shown on screen (V2.16), 2D:
1. 2-ship: change to Echelon. The picture zooms in to the pair by itself. Press Hook Left: #2 rolls with Lead, steps up on the outside, and ends in echelon. Try route and line astern too.
2. Drag the picture: it stays where you put it and Fit appears. Press Fit: back to the pair. Switch Layers' "Fit all aircraft" off and on.
3. Layers: switch on Lead 3/9 line and Lead 7 and 5 o'clock lines. In fighting wing, #2 sits between the 3/9 line and the 5 (or 7) o'clock line.
4. Info tags: each wingman's tag says what it is doing and IN POSITION, TIGHT, STRETCHED or OUT OF CONE, with the sweep from the wing line in fighting wing.
5. 3D in echelon: wings matched to Lead, #2 stepped down along the bearing line; in a turn both banked in Lead's plane.
6. 4-ship: from fighting wing press Echelon: each lines up about 1,000 ft back and waits until the one ahead is in. Press Finger (turning rejoin): #3 crosses only once #2 is in, #4 once #3 is.
7. 4-ship from finger: Echelon on #3's side (the AFM7 p.19 item 1 picture), Echelon on #2's side (item 2), Box (p.20), Line astern, and back to Finger each time. Then the turn buttons in each formation.
8. Nothing jumps or snaps at 0.25x.
9. Say if the estimates in TS-56 look right, and which 4-ship fighting wing sweep you want for #3 and #4.

## Fluid manoeuvring, the simplified baseline (TS-57, `spec.md` section 10.3)

Patrick's 11:50Z rule again: test only that it flies right. No wording, seconds, counts or one-off values are pinned.

| What | Check | Source of the expected value |
|---|---|---|
| Entry from fighting wing only | Fluid manoeuvring is refused from the default line abreast start and in the 4-ship, and starts from fighting wing | Patrick 21:44Z |
| ~~#2 in the cone~~ (rewritten V2.19 on Patrick's 23:02Z ruling, TS-60: the cone is the aim, no "in the cone throughout") | ~~Through a level turn and a reversal #2 stays 500-1,000 ft and within 30° (+5°)~~ | |
| Always true (V2.19, TS-60) | In every fluid check, once #2 is in: G positive for both, no jumps, roll within 90°/s, #2 outside the 500 ft bubble and behind Lead's 3/9 line (aspect under 90°) | SMM 16.17 para 44c; 2 CFFTS Orders B2 ch 8 para 1a; TS-37 |
| Back in the cone (V2.19, TS-60) | After each manoeuvre (the reversal, climb, descent, loop, wingovers, barrel roll, sequence) #2 is at the 600 ft set within the shared ±100 ft and 15° off Lead's tail within the shared ±5°, inside the 30° half cone | Patrick 23:02Z, 22:28Z; SMM 16.17 paras 42-43; Patrick 19:20Z rows 2-4 |
| Lead's level turn is level | Lead's height stays within the shared ±100 ft | AFM7 brief p.17 (level turns) |
| No jumps | Nobody rolls faster than 90°/s; no one's G changes by more than the shared 0.5 G in a step | TS-37, TS-47 |
| Terminate | Ends with the pair in fighting wing, inside its band | Patrick 19:20Z row 7; SMM 12.29 para 69 |
| Refusals | A reversal from wings level is refused; a distance outside 500-1,000 ft is refused | Patrick's list; SMM 16.17 para 42 |
| Hold 15° (V2.18, TS-59) | In a steady level turn, right and then left, #2's aspect is 15° within the shared ±5° | Patrick 22:28Z ("hold 15") |
| Climb and descend (V2.18, TS-59) | Lead ends level more than 1,000 ft higher, then lower; #2 in the cone as above; both aircraft keep positive G | Patrick's list, design 5.1; SMM 16.16 para 39c; 2 CFFTS Orders B2 ch 8 para 1a |
| The loop (V2.18, TS-59) | Lead goes inverted and more than 1,000 ft up, and ends wings level on his entry heading (±5°); entry and exit 230 KIAS (±10 kt); slowest 100-120 KIAS (±10 kt) over the top; #2 back in the cone after it (V2.19) | SMM 7.5 paras 10-13, Fig 7.2, Table 7.1; EFIG p.171; SMM 16.17 para 42 |
| Side swap (V2.19, TS-60) | Through a 70/3 turn and its reversal, if #2 changes sides he crosses within the 30° half cone behind Lead, never in front; he ends 15° off the tail (±5°) on either side | Patrick 19:21Z, 22:28Z; SMM 16.18 para 50 (70/3) |
| Wingovers (V2.19, TS-60) | Flight path about 45° up and 45° down (±5°), bank up to 120° (+5°) and over 90°, Lead's G about 3 (+0.5), the first turns 180° (-5°) from the entry, entry 230 KIAS (±10 kt), back on the entry heading (±5°) wings level | SMM 16.17 para 47 |
| Barrel roll (V2.19, TS-60) | Flight path about 45° up and down (±5°), pitch attitude under 60°, level (±5°) and inverted (bank within 5° of 180°) at 90° off the line (±5°), entry and exit 230 KIAS (±10 kt), back on the line (±5°) wings level | SMM 14.8 para 19, Fig 14.1, Table 14.1; AFM7 brief p.17; Patrick 19:20Z rows 5-6 |
| Standard sequence (V2.19, TS-60) | One press flies a level turn, a loop, the wingovers and a barrel roll, in that order, then straight and level | SMM 16.17 para 42 |
| Distance-only tags (V2.19, TS-60) | `tags.test.js`: with Lead manoeuvring a wingman 15° or 75° back from the wing line is not OUT OF CONE; inside 500 ft TIGHT, past 1,000 ft STRETCHED; ahead of the 3/9 line AHEAD OF 3/9 either way | Patrick 23:07Z, 23:08Z; SMM 12.29 para 69 |

Not tested:
- the screen: the Fluid button greying, Lead's buttons, the settings, the card lines, the flags and the tags. Checked by eye in a browser run against `npx vite` (pictures in the project files at `turn-sim-review/screens/v217-*.png`), for sign-off;
- the flags firing (bubble, G, aspect and HCA, hard deck): the baseline's turns don't reach them from the default start; they are worded in `live/fluid.js` and seen only by reading the code;
- the 70/3 and 30° banks and a distance change while flying: scratch runs only;
- (V2.19) #2's lag, pure and lead in the wingovers and the barrel roll, how near parallel he is over the top (a loose aim, Patrick 23:00Z: never tested), the swap rule's own numbers, the wingovers' exit speed (the SMM gives none), the barrel roll's bank at the 45° points (about 75°), the pitch flag firing (the roll stays under 60°), the 1,000 ft runs where #2 is flagged over 5 G (V2.20: now only the loop; the wingovers and the barrel roll open the range, one unit check), the 360° level turn's settle on a distance change (scratch run only, V2.20), the wingovers and the roll from a turn or at other block heights, a press queued during the sequence: scratch runs only. The screen (the new buttons, the card's speeds and SWAPPING, the distance-only tags in fighting wing) was seen in one browser run (`turn-sim-review/screens/v219-*.png`); the 3D view of the new manoeuvres was not looked at.
- (V2.18) Patrick's loop rule for #2 is not checked by a test (lag up, near parallel over the top, lead down: seen in scratch runs only, HCA about 22° at the top); a climb from a steep turn; a press queued during the loop; the loop's card speeds line (seen in a browser run, `turn-sim-review/screens/v218-*.png`); the 3D view of the loop (its camera looks down).

Not run locally before the pull request beyond the touched file once (CI is the one check).

**Sign-off checklist, TS-57** (draft, for Patrick to put in his own words). Open the Formation Simulator fresh, with the version shown on screen (V2.17), 2D:
1. Fluid manoeuvring is greyed in line abreast ("From fighting wing only"). Press Fighting wing and wait: it lights up.
2. Press Fluid manoeuvring: Lead turns away from #2 at 30°, then rolls to 60° at MAX; #2 moves from his fighting wing slot into the cone behind Lead.
3. Press Level turn R, then Reversal, then Wings level, then a level turn again. #2's tag reads IN POSITION with the range near 600 ft and the aspect inside 30°; his pursuit word changes (LAG into a turn toward him, LEAD away, then PURE).
4. Fluid settings: try Gentle 30° and Steep 70/3, and a distance of 800 ft (it eases out to it). Live is greyed.
5. Press Terminate: Lead flies a gentle 30° turn at 200 KIAS and rolls out; #2 goes back to his fighting wing slot; the card judges fighting wing.
6. Nothing jumps or snaps at 0.25x; the other buttons are greyed while fluid manoeuvring runs.
7. Say if the estimates in TS-57 look right, and where #2 should sit in a turn away from him (see the question in the report: he can end up close to Lead's tail).

**Sign-off checklist, TS-60** (draft, for Patrick to put in his own words), V2.19, 2D, hard refresh:
1. Start fluid manoeuvring from fighting wing. Set Steep 70/3 in Fluid settings, press Level turn R, then Reversal: #2 may cross behind Lead to the other side; his tag reads SWAPPING while he does, and he never passes in front of Lead.
2. Press Wingovers L: Lead sets up 230 KIAS, pulls up about 3 G, about 45° nose up, rolls to about 120° of bank over the top, comes down about 45°, comes out 180° from the entry, then the second the other way back to the entry heading. #2 reads LAG, PURE, LEAD; he may drift out of the cone and swap, then settles back to 15°. The card shows entry and exit speeds ("the exit not given").
3. Press Barrel roll R: Lead sets up 230 KIAS, pulls 3 G and rolls; 45° up at 45° off the line, level inverted at 90° off, 45° down, back on the line at about 230 KIAS. No 60° pitch flag.
4. Press Standard sequence L: a 360° level turn (back on the entry heading), a loop, two wingovers and a barrel roll, each named on the card; a press during it waits. Change the distance during the level turn: #2 eases to it over the rest of the turn, with no jump (V2.20, Patrick 01:03Z).
5. At distance 1,000 ft, press Wingovers L, then Barrel roll L: #2 lets the range open a little in the pulls rather than pulling past 5 G, then closes back to the setting smoothly (V2.20, Patrick 01:01Z "Open his path").
6. In fighting wing and fluid, while Lead turns, #2's tag shows only IN RANGE, TIGHT or STRETCHED with the range; straight and level the full verdict comes back.
7. Nothing jumps at 0.25x; #2's G flag shows only above 5 G (at 1,000 ft it still can in the loop; since V2.20 the wingovers and the barrel roll open the range instead).

**Sign-off checklist, TS-59** (draft, for Patrick to put in his own words), V2.18, 2D:
1. Start fluid manoeuvring from fighting wing. In a level turn either way, once it is steady, #2's tag reads about 15° of aspect.
2. Press Climb: Lead pitches up 15°, the speed bleeds, and he levels off about 2,000 ft higher, still in his bank; #2 follows his path just below it. Press Descend: the same downwards, the speed building.
3. Press Loop: Lead rolls wings level and sets up 230 KIAS (the card says "setting up"), pulls, goes over the top at about 100-120 KIAS and comes out level on his heading at about 230; the card shows the entry and exit speeds against the SMM's 230 and 230.
4. Through the loop #2 reads LAG going up, PURE over the top, LEAD coming down, then PURE; he stays IN POSITION about 600 ft back and inside 30° of aspect. Say whether crossing the top about 20° off parallel is right, or whether you want him parallel at the cost of negative G (see the question in TS-59).
5. Nothing jumps; Lead's G flag shows only above 4 G and #2's above 5 G.

## Fighting wing desired spacing and sweep as settings (TS-58, `spec.md` section 10.4)

| What | Check | Source of the expected value |
|---|---|---|
| #2 goes where the setting says | 2-ship set to a spacing and sweep inside the band: after Fighting wing, #2 is within the shared ±100 ft and ±5° of them, sweep measured from Lead's wing line | Patrick 21:25Z; SMM 12.29 para 69, Fig 12.19 |
| Flagged, never walled | A spacing past 1,000 ft is flown there (±100 ft), and the roll-out judgement flags it | Rule book (published limits are flags); SMM 12.29 para 69 |
| The 4-ship's own pairs | #3 and #4 settle at their own spacing and sweep off the one ahead (shared margins); #2 at the 4-ship default | Patrick 21:25Z; Patrick 11:44Z (FW4) |
| The flag and the refusal | A place inside the SMM band has no flag; outside it has one; far outside what the sim flies it is refused | SMM 12.29 para 69 |

Not tested: the More section on screen (seen in a browser run, `turn-sim-review/screens/v217-fw-settings-*.png`); a sweep setting through a fighting wing side swap or turn; Fluid 4 with a changed #2 pair.

**Sign-off checklist, TS-58** (draft, for Patrick to put in his own words), V2.17, 2D:
1. Setup, "More: fighting wing spacing and sweep": the 2-ship shows #2's spacing 750 ft and sweep 45°; switch to the 4-ship and it shows #2 650 ft and 45°, #3 and #4 650 ft and 30°.
2. Type 1,100 ft: a line says it is outside the SMM band and is flown anyway. Press Fighting wing: #2 settles about 1,100 ft out and the card flags it.
3. In the 4-ship set #3 and #4's sweep to 60° and press Fighting wing: #3 and #4 sit further back.

## Off-standard hot turning rejoin, the overshoot, slowing down and power on the tags (TS-61, TS-62, `spec.md` section 10.5)

| What | Check | Source of the expected value |
|---|---|---|
| Slowing never beats the aircraft | In off-standard rejoins #2's slowing, averaged over 1 s, is never more than idle and the boards give at his speed and G (0.5 kt/s for reading it back from the line) | TS-61 (Patrick 00:11Z, 00:47-00:48Z); standard aerodynamics |
| The stages are in order | Power, boards, idle, idle and boards each slow harder than the one before at every rejoin speed; idle at 200 KIAS is about 5 kt/s (±1, his estimate) | Patrick 23:37-23:38Z, 00:11Z |
| A corrected start ends in the formation | Fix it from a fast, a behind and a high start ends in echelon or fighting wing (the bands written out from the manuals), below Lead inside 1,000 ft, no roll-rate jumps, and the card says how #2 dealt with it | SMM 12.27 para 65, 12.29 para 69, 16.20 paras 65b(2) and 66 |
| An overshoot stays below and passes behind | Whenever #2 is OVERSHOOTING he is below Lead and crosses Lead's track at least one length behind; he still ends in the formation pressed | SMM 12.27 paras 64-66, Fig 12.18; Patrick 23:29Z |
| Held to full power (V2.21, TS-63) | `full-power.test.js`: in an off-standard rejoin #2 never speeds up faster than full power gives at his speed, height and G (1 s read-back, 0.3 kt/s for reading it off the line); a fixable fast start ends in echelon with no overshoot; an overshooting #2 is never at MAX and never at or above Lead's height | Patrick 02:48Z, 03:46Z, 23:29Z; standard aerodynamics; EFIG p.374 |
| Power shows on the tags | A set power shows on the tag; red exactly when idle or the boards are in use (the words are not pinned) | Patrick 01:44Z, 02:05Z |

Not tested: the tag's red letters and the torque numbers on screen (sign-off; the torque checks against SMM Table 8.1 are approximate, in TS-62); the decision overshoot at the decision point (built, but no start tried with the default amounts needs it); the starts that still fly the tracker's rejoin (ahead of Lead's 3/9 line); the 4-ship. Not run locally before the pull request beyond the touched test files once (CI is the one check). Seen in one browser run (V2.20, 2D, `turn-sim-review/screens/v220-*.png`): Speed fast 20 KIAS to Echelon (Fix it and normal reference fly the same line: a slide to the outside about 1,700 ft out and 1,500 ft back, then joined in position), and Behind to Fighting wing with "TQ 17% + BOARDS" in red on #2's tag; the 3D view was not looked at.

**Sign-off checklist, TS-61 and TS-62** (draft, for Patrick to put in his own words), V2.20, 2D, hard refresh:
1. With every error at None, press Echelon from line abreast: the hot turning rejoin flies as before, a few seconds longer (Lead slows to 200 on power). The tags show Lead's TQ and #2's power; nothing jumps at 0.25x.
2. Open Errors (training) and set Speed: fast (20 KIAS), Response Fix it. Reset and press Echelon: #2 corrects with the cut-off and reversal first, then power; if he needs the boards his tag shows TQ nn% + BOARDS in red. He ends in echelon, and the card says how he fixed it.
3. Set Spacing: wide, Response Turn at normal reference. Reset and press Echelon: #2 flies the standard rejoin from where he is; if he swings behind Lead to the outside of the turn and back, it is a normal rejoin (V2.21, TS-63: no OVERSHOOTING). He stays below Lead, crosses behind him, comes back and ends in echelon.
4. Set Height: high (500 ft). Reset and press Fighting wing: #2 comes down to below Lead before he is close, then rejoins.
5. Try the worst case (Fore/aft ahead, Height high, Spacing tight, Speed fast): say what #2 should do when Lead's turn puts him ahead of the 3/9 line (today the tracker's rejoin flies it).
6. Say whether the torque readings look right: about 40-45% level at 180 KIAS, Lead about 55-60% in the 30° rejoin turn at 200 KIAS, MAX on a full-power speed-up.
7. (V2.21, TS-63) Set Speed: fast (20 KIAS), Response Turn at normal reference. Reset and press Fighting wing: if #2 falls behind his line at full power his tag and the card say STRETCHED and his power shows MAX; once he can he closes with power and the normal state comes back. No OVERSHOOTING unless he is within about 1,000 ft of Lead with power reduced.

**Sign-off checklist line, clean-up step 2 (TS-65)** (draft, for Patrick to put in his own words), V2.22, hard refresh: with Rates at Student, Instructor and AI in turn (More), press Route then Echelon and back: #2 slides about 5 wingspans to echelon in roughly 10, 5 and a few seconds; press Echelon from fighting wing: a line up the six at the rejoin closure, then the tracker from about 500 ft with nothing jumping at the hand-over; fly a fighting wing check turn: Lead at 60° and #2 collapses and comes back out. Not tested by any automatic check (Patrick 06:25Z).

**Sign-off checklist line, V2.59 rejoins and fluid (TS-67, TS-68)** (draft, for Patrick to put in his own words), V2.59, hard refresh: from the default start press Echelon: Lead turns into #2 and keeps turning until #2 is in, #2 gets onto the line with Lead at his 10:30, never crosses behind Lead, closes down the line and flows through route into echelon in one motion; from fighting wing press Echelon with Rejoin kind Turning (TRJ) and again with Straight ahead (SARJ): the TRJ has Lead turning into #2, the SARJ drops onto the six; press Fluid manoeuvring with Rates at Student and at AI: the move into the cone is slower or quicker with the rate; fly a loop: if #2 falls behind his tag says STRETCHED, he cuts inside and comes back to the lag line. Not tested by any automatic check (Patrick 06:25Z).

## Turn Sim rules on top of the whole-tool rules

- **FM1. The end picture is the test (TS-R3 to TS-R5).** For each turn, both ways, in each formation, check who is where and which way they face once every aircraft has rolled out, against the SMM figure's page reference (Figs 16.15 to 16.21 and 16.30 to 16.36). The checks are positions relative to Lead and spacing against the set spacing. Each has a stated margin and its reason. How long the turn took is never checked (T2).
- **FM2. Turn geometry is worked out in the test (TS-R6).** The test works out radius, rate and bank from speed and G (bank = acos(1/G)). It converts KIAS to true airspeed at the block height itself. The circle drawn has the radius shown, and more G at the same speed always tightens it. Constant speed through the turn is the SMM's own wording; the sustained-G question stays with TS-Q8.
- **FM3. Who turns when is checked by its rule, not by seconds (TS-R7).**
  - Clock cue: each wingman starts its turn when the aircraft beside it reaches the cue bearing, worked out in the test, outside aircraft first.
  - Time delay and Auto are teaching options. The test checks that the delay set is the delay flown, and that Auto equals spacing ÷ speed × cot(half the turn). Those are checks of a rule, like a readout, not time gates.
  - The box's 10 to 15 s band is the SMM's number, and its flag is checked at the edges.
- **FM4. The engine's own output is never the expected answer (T3).** Where the engine and the SMM picture differ, the difference is written down for Patrick and Dad, never tuned to pass (T7). An example is the Delayed 45's tight end before TS-R5.
- **FM5. Same plan, same picture (TS-R9).**
  - Playback at 0.25× and 4×, and any frame rate, gives the same end.
  - A setup change returns to time 0.
  - The same turn flown north or east is the picture turned 90°.
  - Right and left are mirror images.
- **FM6. Limits are flagged, never walls (T10, TS-R11, TS-R12).** A G the T-6 can't pull at that speed shows a warning and is still flown. Crossings and passes under 300 ft show the 300 ft vertical note.
- **FM7. Judging is fair to the turn (TS-R23, TS-R24).** Labels are judged at roll-out, and an in-place turn is judged in trail. The standards are the shared ones the Debrief edits.
- **FM8. Live mode is tested the same way when it is built (TS-R1).** Pressing any manoeuvre button at any moment gives the SMM end picture (FM1), and the formation carries on. Seeded runs of random button presses check that nothing jumps or is lost, as in Traffic's TP4. Its checks are written with the build and fail until then.

## How each Turn Sim requirement is checked

"Each change" means a unit test or one of the per-change browser checks in section 2 (smoke, layout, accessibility, buttons, leaving, offline). Checks that need the whole Turn Sim browser file run at sign-off. "New" means no test checks it today; the test is written with the change that builds it and fails until then.

| Requirement | Automatic check | When | Hands-on checklist |
|---|---|---|---|
| TS-R1 Plan mode and live mode | Plan mode: 4312, Delayed 90, Play, and the Formation card names who ended tight, wide, fore or aft. New: live mode per FM8 | Each change | A first-time user says who ended where |
| TS-R2 The SMM's turns | The turn menu offers Delayed 90, Delayed 45, check, in-place, hook, and for two-ship the shackle and cross turn; each passes FM1 | Each change | |
| TS-R3 The offset box | FM1 for the box in Delayed 90 both ways: the same box shape on the new heading | Each change | Dad looks at the box against Figs 16.30 to 16.32 |
| TS-R4 Every turn ends as the SMM says | FM1 for every turn, both ways, in 4312, the box and the two-ship. New: the in-place turn ends in trail | Each change (a few cases); sign-off (all) | Dad checks each end picture against its figure |
| TS-R5 The Delayed 45 never ends in trail | New: with time delay, clock and Auto, in every formation, the end after the roll-out fix is a line (or box) across the new heading; if a wingman isn't abreast the screen says why | Each change | |
| TS-R6 A real coordinated turn at the set G | FM2, including KIAS to true airspeed at the low (220) and mid (200) block | Each change | |
| TS-R7 Who turns when | FM3. New: a fresh open reads Clock cue | Each change | |
| TS-R8 Later layer: wingman mistakes | Wide and tight move 1,000 ft out or in on either side of Lead; each mistake changes the end picture the way its name says. **Built as the training errors (TS-52)**, checked in `tests/unit/turn-sim/errors.test.js`: errors off changes nothing; at "Turn at normal reference" each error carries to the end picture within ±100 ft; "Fix it" never ends further out than carrying, ends closer (by more than ±100 ft) where there is room, and puts #2 back in the picture where the turn gives him the room; physical limits and smooth hand-overs hold | Each change | Patrick flies each error both ways (checklist below) |
| TS-R9 Same picture every time | FM5 | Each change | |
| TS-R10 No wind, said on screen | New: the screen's one line says the air is still | Each change | |
| TS-R11 Crossings need 300 ft vertical | The two-ship shackle shows the crossing note; FM6 | Each change | |
| TS-R12 Too much G warned, still flown | 8 G at 220 kt shows the warning beside the G box and the turn is flown | Each change | |
| TS-R13 Only the essentials first | Fresh open: the Setup fields listed in TS-R13; the other panels and Layers closed | Each change | Nothing on screen you don't need first |
| TS-R14 Every field has its default | No blank box anywhere, closed panels included; Play with nothing typed flies 4312 Delayed 90 | Each change | |
| TS-R15 Playback and keys | Play, Pause, Step (exactly one 0.05 s step), Reset, 0.25× to 4×, Fit; Space, right arrow and Home, never while typing | Each change | |
| TS-R16 Only controls that apply | The every-button check; in 4312 the shackle is greyed with its reason; box options show only for the box | Each change | |
| TS-R17 Drag a wingman before Play | New: drag #3 wide, Play starts from there, Reset keeps it as that wingman's position error | Each change, when built | |
| TS-R18 Saved setups | Until built the Profiles panel is hidden (TS-R18). When built: save, reload, load gives the same setup including errors; save-over, delete and factory reset ask first; blocked storage still opens | Each change | |
| TS-R19 Export CSV (if TS-Q13 keeps it) | Export downloads a file, one row per step, with no NaN for the two-ship | Each change, when built | |
| TS-R20 Fitted, nothing covered, at 1280 | Layout check at 1280 × 800 and larger with every panel open: no control over the picture, every control reachable, no page scroll | Each change (layout) | |
| TS-R21 Colours plus numbers and words | Every aircraft has its number; #4's circle, label and trail are drawn as visibly as #1's | Each change | |
| TS-R22 The Formation card | Default 4312 at the start reads ON SPACING for all three; one turn line matching FM2; pairs under More detail | Each change | A pilot reads the card without help |
| TS-R23 Fair judging | FM7. New: a perfect in-place 90 never ends flagged; no TIGHT or AFT label mid-turn | Each change | |
| TS-R24 Shared standards | Edit a standard in the Debrief and the Turn Sim labels follow | Each change | |
| TS-R25 Layers and the 2D/3D switch | Each layer appears and disappears; the defaults on and off as listed; 3D loads only when switched on and a 2D-only visit makes no outside requests | Each change (unit); sign-off (browser) | One look at the 3D view |
| TS-R26 Plain words | Every box has a label with its unit and a hint; warnings sit beside what they are about | Each change | A pilot who has never seen it reads every label |
| TS-R27 Few settings | The settings count and each closed-panel control's reason are reported at sign-off for Patrick; no test pins the number of settings (T3) | Sign-off | Fewer controls than today, each with a reason |

**At Turn Sim sign-off:**
- The whole Turn Sim browser file.
- FM1 for every turn and formation, and FM8 over many seeds once live mode exists.
- The hands-on checklist above, with Dad's look at each end picture.
- `docs/checklists/turn-sim.md` rewritten for the ratified requirements. Today it disagrees with the code on the start heading (360 against 000), the reset button's name and the speed list (TS-Q23; `pf/reset/5-testing/agents/turn-sim.md`, conflicts 3 to 5).
- One look in real Safari at the 3D view.


## Sign-off checklist

Anyone can run it, in the real app, from the module's default start, on a laptop at 1280 wide, and send Patrick the result with the date, their name and the version shown on screen (`../../TESTING.md`, section 4). Anything not seen working is listed as unseen.

### From the ratified requirements (the hands-on column above)

- [ ] A first-time user says who ended where (TS-R1)
- [ ] Dad looks at the box against Figs 16.30 to 16.32 (TS-R3)
- [ ] Dad checks each end picture against its figure (TS-R4)
- [ ] Nothing on screen you don't need first (TS-R13)
- [ ] A pilot reads the card without help (TS-R22)
- [ ] One look at the 3D view (TS-R25)
- [ ] A pilot who has never seen it reads every label (TS-R26)
- [ ] Fewer controls than today, each with a reason (TS-R27)

> The old checklist below was written before the reset. It is refreshed against the requirements above when the module's work resumes: lines that test V6 numbers or exact times are rewritten or dropped.

### Carried over from `docs/checklists/turn-sim.md`

#### Sign-off checklist: Turn Sim (Formation Geometry Simulation) (Gate 3)

Anyone can run this in about twenty-five minutes, in any up-to-date browser on a desktop or laptop. Nothing needs installing. Tick each line. If one fails, use **Report a problem** in the app, say which line failed, and name your browser.

Link: https://lizardhands-commits.github.io/Dads-debreif/#/turn-sim (or `http://localhost:5173/#/turn-sim` locally)

The simulator models 2-ship and 4-ship tactical formation turns baselined on standard aerodynamics and 15 Wing Moose Jaw SMM Chapter 16 procedures.

---

### 1. First look & UI Layout

- [ ] On the home screen, the **Turn Sim** card has the short description and opens cleanly. **Home** in the header brings you back.
- [ ] Three main columns show without overlap at 1280 × 800:
  - **Setup panel** on the left (Formation, Spacing, Start heading, Turn type, Direction, Speed, G, Timing).
  - **Stage canvas** in the middle with toolbar above it (Play, Pause, Step, Reset, Speed multiplier, sim time, Fit, Layers).
  - **Formation results panel** on the right (wingman spacing status badges, minimum separation, turn kinematics: radius, rate, bank).
- [ ] Default values load on initial open: Formation `4312`, Spacing `6000 ft`, Start heading `360°`, Turn `Delayed 90`, Speed `220 KTAS`, `G: 3.0`.
- [ ] No controls overlap, no scrollbars obscure the flight canvas, and the whole formation fits cleanly on screen.

---

### 2. Playback, Step & Interactive Manipulation

- [ ] **Play / Pause:** Pressing Play starts simulation; aircraft turn and progress along their tactical flight paths. Pause halts aircraft instantaneously.
- [ ] **Step:** With simulation paused, pressing Step advances simulation clock by exactly one discrete physics step (0.05 s) per click.
- [ ] **Reset:** Clicking Reset restores simulation time to `t = 0.0 s` and returns all aircraft to their starting formation slots.
- [ ] **Speed Multipliers:** Toggle 0.5×, 1×, 2×, 4×. Aircraft kinematics scale smoothly at each rate.
- [ ] **Pre-Play Drag Interaction (D334):** Before pressing Play, click and drag a wingman (e.g. #2 or #4) on the canvas.
  - The aircraft moves to the new position.
  - Initial position error is updated in the readout.
  - Lead (#1) remains anchored.

---

### 3. Tactical Formation Geometries

- [ ] **4312 (Standard Tactical 4-Ship):**
  - Verify slot layout: #4, #3, #1, #2 in Line Abreast.
  - Spacing defaults to 6,000 ft lateral interval.
- [ ] **2134 (Inverted Tactical 4-Ship):**
  - Switching to `2134` mirrors formation layout cleanly across the flight axis.
- [ ] **Two-Ship Formation:**
  - Select `Two-Ship`: Displays Lead (#1) and Wingman (#2) abreast.
  - Kinematics and spacing badges reflect 2-ship standards.
- [ ] **Offset Box Formation (SMM Ch 16):**
  - Select `Offset Box`: Front element (#1 & #2) with trailing element (#3 & #4).
  - Trail spacing defaults to 7,000 ft aft (6,000–8,000 ft standard band per D155 / SMM 16.41).

---

### 4. Tactical Maneuvers & Aerodynamic Standards

- [ ] **Delayed 90° Turn:**
  - Aircraft outside the turn initiates; inside aircraft delay turn according to timing law.
  - Aircraft roll out in tactical Line Abreast on the new heading.
- [ ] **Delayed 45° Turn (D151):**
  - Aircraft cross paths without reaching 90°; rolls out smoothly in Line Abreast with sides swapped.
- [ ] **Hook Turn (180° Formation Turn, D84, Task 3.1):**
  - Select `Hook Turn`.
  - Verify that the formation executes a **true 180° formation reversal** per SMM Chapter 16 and Dad, rolling out on reciprocal heading (180° heading change), completely resolving the legacy V6 90° bug.
- [ ] **Shackle Formation Turn (D85):**
  - Aircraft turn toward each other, cross flight tracks forming an X, and swap sides, rolling out on original heading.
- [ ] **Cross Turn (D150, D170):**
  - Lead and wingman turn toward each other: 2 G to 90°, then solved G to roll out abreast.

---

### 5. Timing Laws & Spacing Solver

- [ ] **Timing Law Dropdown:**
  - **Time Delay:** Aircraft turn after fixed seconds (`Base delay`).
  - **Clock Cue:** Wingman turns when designated reference aircraft crosses target clock cue (e.g. 4:30 or 7:30).
  - **Auto Timing (D44, D380):** Closed-loop timing solver calculates exact delay ($\text{spacing} / \text{speed} \times \cot(\theta/2)$) so wingmen roll out abreast.
- [ ] **Spacing Solver Scoring (D385):**
  - Solver evaluates and scores station-keeping trials at maneuver rollout completion, not arbitrary clock durations.

---

### 6. Offset Box Rear Element & Vertical De-Confliction

- [ ] Select `Offset Box` and `Delayed 90` Right:
  - Trailing element (#3 & #4) delay turn to maintain box geometry.
  - When flight tracks cross within 1,000 ft lateral separation in the flat simulation, a salient caution flags:
    `"Crossing: 300 ft vertical needed"` (D207 / SMM para 111).

---

### 7. Settings Menu & Standards

- [ ] Open **Turn Sim settings**:
  - Contains **Start geometry**, **Display**, and **More setup** sections.
  - Relabeled reset button reads **Reset to Standard Defaults** (D384).
- [ ] Click **Reset to Standard Defaults**:
  - Restores certified 15 Wing SMM standards (3.0 G turn rate, 7,000 ft trail spacing, standard timing delays) without losing page responsiveness.

---

### 8. Sign-Off

**Browser and version:** _______________________  
**Date:** _______________________  
**Name:** Patrick  

**Notes / Observations:** __________________________________________________________________  

All lines ticked means Milestone 3 (Turn Sim Formation Simulation) is complete and signed off for Gate 3.


## Test files and what happens to each

**All Turn Sim test files follow the Turn Sim review** (rebuild, reuse parts or fix). The marks below apply only if the code is kept.
From the ratified test register (`pf/reset/5-testing/test-register.md`, Part B). The clean-up pull requests carry these out.

| File | Keep, rewrite or retire | Why (policy line or requirement) | What the rewrite checks instead | Runs |
|---|---|---|---|---|
| `tests/unit/turn-sim/auto-timing.test.js` | Follows the Turn Sim review (if kept: keep, with changes) | TS-R7 keeps Auto as a teaching option. Kept: Auto never writes into Base delay (a V6 bug), and the step equals spacing ÷ speed × cot(half the turn), the formula at `:64`, a rule check (FM3). Goes: the V6 base (`:18`) and the typed 16.16 s (`:63`); the formula alone is the expectation. The speed in the formula follows TS-R6 | Carries over: the Auto formula as a rule; outside aircraft first; line abreast at the set spacing at roll-out (FM1) | Each change |
| `tests/unit/turn-sim/box-slot.test.js` | Follows the Turn Sim review (if kept: rewrite) | TS-R3, TS-R7 (box #3 delays 10 to 15 s, #4 on the cue). Four time gates (T2); the "default readings" 10.9, 16.1, −0.5, 38.8, −38.2 and 18.9 s at `:131` are the engine's own (T3) | Carries over: in Delayed 90, Delayed 45 and the hook, both ways, the four roll out in the box shape on the new heading (FM1); designed crossings are listed (TS-R11); the 10 to 15 s band flag at its edges | Each change |
| `tests/unit/turn-sim/check-turn.test.js` | Follows the Turn Sim review (if kept: keep) | TS-R2, TS-R4, FM1: the two-ship check puts #2 5,196 ft right and 3,000 ft ahead (`:49`), which is 6,000 ft at 30° worked out, against SMM 16.19 para 58, Fig 16.18 (`:12`) | Carries over: the whole file's checks | Each change |
| `tests/unit/turn-sim/correction.test.js` | Follows the Turn Sim review (if kept: keep) | Whether the correction model stays is TS-Q17 (open with Dad). Nothing goes NaN at low G (TS-R12); the 0.25 G is worked out in the test (`:62`) | Carries over: no NaN and a G floor at any setting; the rest only if TS-Q17 keeps the model | Each change |
| `tests/unit/turn-sim/cross-turn.test.js` | Follows the Turn Sim review (if kept: keep, with changes) | TS-R4 (the two turn toward each other and roll out on the reciprocal), TS-R11. Goes: the solved 1.57 G (`:113`), the engine's own (T3); the crossing time "5 to 15 s" (`:45`) becomes "they cross near the 90° point", found from heading (F6-style event). The comment's "±200 ft" against the code's 120 (`:20`, `:22`) is fixed | Carries over: the reciprocal end picture, the crossing note | Each change |
| `tests/unit/turn-sim/cues.test.js` | Follows the Turn Sim review (if kept: keep, with changes) | TS-R7: the clock cue is the default. Kept: each wingman turns when the aircraft it watches reaches its bearing (135° at 7:30, 150° at 7 o'clock, worked out at `:75`, `:153-154`); #3 and #4 in the box can't see the cue. Goes: the Auto step of 14 to 15.5 s (`:166`, engine's own, T3) and the comparison of two engine runs called "V6's cascade" (`:94`) | Carries over: turn start by cue bearing, outside first (FM3) | Each change |
| `tests/unit/turn-sim/delayed-45-check.test.js` | Follows the Turn Sim review (if kept: rewrite) | TS-R5 rules out the end this file pins: abreast but about 3,924 ft apart and tight of 6,000 (`:86`, `:93`). Eleven time gates (T2); 894 ft, 36.74 s and 0.96 s are the engine's own (`:294`, `:323`; T3) | Carries over: Delayed 45 right and left in 4312, 2134, the box and the two-ship, with each timing: the four end on a slanted line, each wingman fixes to line abreast on roll-out, and if it can't the screen says why (TS-R5, FM1) | Each change (a few cases); sign-off (all) |
| `tests/unit/turn-sim/delayed-45.test.js` | Follows the Turn Sim review (if kept: rewrite) | TS-R4, TS-R5, TS-R7. Six time gates (T2). The 38.6 s delay is a formula (`:22`) but the clock cue is now the default, and the comment's 39.05 s disagrees with it. The 300 s stop (`:155`) is a run rule, tested as a rule (Q-T9, decided). "No aircraft turns past 45" stays | Carries over: the end picture as in the row above; the cue labels 4:30 right and 7:30 left (`:113-115`, Figs 16.15 and 16.16) | Each change |
| `tests/unit/turn-sim/fields.test.js` | Follows the Turn Sim review (if kept: keep, with changes) | TS-R26 (plain words), TS-R11, TS-R16. States are built by hand. Numbers inside the strings (36.7 s, 18.9 s) are copied from other tests and go with them (T3) | Carries over: no NaN in any label; the crossing note; the greyed-out reasons | Each change |
| `tests/unit/turn-sim/formation.test.js` | Follows the Turn Sim review (if kept: keep, with changes) | TS-R8: Wide 1,000 ft moves either side 1,000 ft further out (`:25`), the requirement's own check. "Where V6 did" (`:40`, `:64`) is relabelled to the spec's slots. Which way 4312 is drawn is TS-Q5 (open with Dad) and may move the slots | Carries over: wide and tight the same on both sides; 2134 mirrors 4312 | Each change |
| `tests/unit/turn-sim/heading.test.js` | Follows the Turn Sim review (if kept: keep, with changes) | TS-R13, FM5: compass headings, and the same turn flown north or east is the same picture turned 90° (`:49`). V6's east default (`:38`) is relabelled as history | Carries over: compass definition; rotation gives the same picture | Each change |
| `tests/unit/turn-sim/hook.test.js` | Follows the Turn Sim review (if kept: keep, with changes) | TS-R4: the hook is the same direction through 180° and ends line abreast (`:38`). The box test sets the old 12.5 s rear delay (`:20`, `:65`, `:72`); under TS-R7 the box #3 delays 10 to 15 s and #4 turns on the cue | Carries over: two-ship and four-ship hook end pictures; the box hook by cue | Each change |
| `tests/unit/turn-sim/offset-box.test.js` | Follows the Turn Sim review (if kept: rewrite) | TS-R3. V6's LATE and EARLY are pinned (`:36`, `:54`, `:140`; T3); whether they stay is TS-Q15. Kept: #4 ends outside #2; the band edges 10 and 15 s (`:133`), a rule check; the in-place turn moves all four together (`:123`) | Carries over: the box shape at roll-out (FM1); the band flag | Each change |
| `tests/unit/turn-sim/plan.test.js` | Follows the Turn Sim review (if kept: keep) | TS-R7: "toward" and "away" turn the right way (geometry in the comments, `:23`, `:34`). The V6 swap (D41) is history only | Carries over: both checks | Each change |
| `tests/unit/turn-sim/readouts.test.js` | Follows the Turn Sim review (if kept: keep, with changes) | TS-R22, TS-R12, TS-R24. States built by hand (`:13`). The turn line "R 1,5xx ft · 13-14°/s · bank 71°" (`:131`) changes with TS-R6's KIAS to true airspeed, so radius and rate are worked out in the test (FM2). "V6's fixed 250 ft" and "V6 order" (`:63`, `:120`) are relabelled to the spec | New beside it: labels are judged at roll-out only, an in-place turn is judged in trail (TS-R23, FM7) | Each change |
| `tests/unit/turn-sim/rear-check.test.js` | Follows the Turn Sim review (if kept: keep, with changes) | TS-Q24's working answer (rear check only between turns) and TS-Q16 (one rear-check button) may change it. "Limited as V6 limits them" (`:23`) is relabelled; the typed start times 35.1 and 90.1 s (`:72`, `:80`) become "once #3 and #4 finish turning" (F6-style event) | Carries over: the check swings out and back; a new leg clears it | Each change |
| `tests/unit/turn-sim/rear-delay.test.js` | Follows the Turn Sim review (if kept: rewrite) | TS-R7 (box #3 10 to 15 s, #4 on the cue). Five time gates (T2); V6's 0, 16, 32 and 48 s chain (`:101`, `:107`; T3); an assert that can't fail (`:67`); the aft distance falls short of 7,000 ft (comment `:66`) | Carries over: the rear pair ends in its slots behind the front pair (FM1); the band flag | Each change |
| `tests/unit/turn-sim/run.test.js` | Follows the Turn Sim review (if kept: keep, with changes) | TS-R9, TS-R15: fixed 0.05 s step, reset, start leg; the engine touches no page objects (`:225`). Goes: the V6-default Delayed 90 chain of 16, 32, 48 s ending at 75 s (`:79`, `:89`, `:92`), which TS-R7 replaces with the clock cue (T2, T3); the 600 s history run (`:139`) is cut down (T9) | Carries over: same plan, same picture at any step rate (FM5); a setup change returns to time 0 | Each change |
| `tests/unit/turn-sim/settings.test.js` | Follows the Turn Sim review (if kept: rewrite) | TS-R27 shrinks the settings. The change detectors that list exactly which settings differ from V6 or are new (`:24`, `:51`) and the version pin (`:125`) break on every added setting (T3). Kept: every setting has a valid default (TS-R14), bad values are refused, old saved settings still load | New: the default timing is the clock cue (TS-R7); Speed is KIAS with a low or mid block (TS-R6) | Each change |
| `tests/unit/turn-sim/shackle.test.js` | Follows the Turn Sim review (if kept: keep, with changes) | TS-R4: the shackle ends on the start heading with sides swapped. The 19.45 s hold (`:83`) comes from the engine; it becomes the formula worked out in the test from true airspeed (TS-R6, FM2) | Carries over: the shackle end picture; a short Duration never cuts it off | Each change |
| `tests/unit/turn-sim/view3d.test.js` | Follows the Turn Sim review (if kept: keep) | TS-R25: camera and attitude are geometry worked out in the test; no V6 values | Carries over: the whole file, if the 3D view stays | Each change |
| `tests/unit/turn-sim/errors.test.js` | New, keep (TS-52, training errors) | TS-R8, TS-47, F12: errors off changes nothing; each error carried at normal reference; Fix it never worse and closer where there is room; flight limits and smooth hand-overs hold; expected values from the SMM pictures and geometry | | Each change |
| `tests/unit/turn-sim/live.test.js` | New, keep (first version) | FM1, FM6, FM8, TS-R4, TS-R5, TS-R11, TS-47: end pictures, 300 ft at the cross, smooth hand-overs; expected values worked out in the test from the SMM pictures and the shared margins | | Each change |
| `tests/unit/turn-sim/formation-moves.test.js` | New, keep (TS-55, V2.15) | FM1, TS-47, Patrick 11:50Z: the hot turning rejoin, fighting wing turns, the quick sweep to fighting wing, the straight-ahead rejoin to echelon (2-ship and 4-ship), coming off the stack and the SMM station changes end in the formation pressed with no snaps, below Lead and under the caps. Expected values come from the SMM, EFIG and Patrick's rulings; one generous limit (30 s), with its reason | | Each change |
| `tests/unit/turn-sim/fluid.test.js` | New, keep (TS-57, V2.17; TS-59, V2.18; TS-60, V2.19: rewritten on Patrick's 23:02Z ruling) | FM1, Patrick 11:50Z: fluid manoeuvring starts only from fighting wing; always G positive, no jumps, outside the bubble, behind Lead's 3/9 line; #2 back in the cone at the distance set and 15° after each manoeuvre (shared margins); Lead level; Terminate ends in fighting wing; #2 holds 15° in a steady turn (Patrick 22:28Z); climb and descend end level; the loop ends level on its heading at 230 KIAS (SMM 7.5, Table 7.1); the side swap only behind Lead; the wingovers (SMM 16.17 para 47), the barrel roll (SMM 14.8, Table 14.1) and the standard sequence (para 42) | | Each change |
| `tests/unit/turn-sim/fw-shape.test.js` | New, keep (TS-58, V2.17) | Patrick 21:25Z: #2, #3 and #4 settle at the fighting wing spacing and sweep set (shared margins); outside the SMM band flown and flagged, never walled | | Each change |
| `tests/unit/turn-sim/tags.test.js` | New, keep (TS-56, V2.16) | FM1, Patrick 11:50Z: the info tag's fighting wing states against the cone written out from SMM 12.29 para 69 and Fig 12.19, and sweep measured from the wing line | | Each change |
| `tests/unit/turn-sim/four-ship.test.js` | New, keep (4-ship, V2.7) | FM1, FM6, TS-47, TS-50: the start picture and stack, end pictures of every 4-ship button, who turns first and the wait, the check turn, bank and G, 300 ft separation with the stack held, smooth hand-overs for all four; expected values from the briefs, SMM and the shared margins; one horizontal-only figure is an estimate and says so | | Each change |
| `tests/e2e/turn-sim.spec.js` | Follows the Turn Sim review (if kept: keep, with changes) | 46 of 46 pass at `6283f38`. Changes: the typed defaults include "time delay, 16 s" and 220 KTAS (`:155-160`), which TS-R7 and TS-R6 change; "Close pass: 894 ft", "954 ft", 36.7 s and 1.0 s (`:719`, `:859`, `:731-736`) are the engine's own (T3); real-time waits (`:184`, `:431`, `:433`) wait for an event instead (T2); the layout check runs at 1366 and 1920 wide (`:93`), and TS-R20 asks for 1280; stale "skipped" comments (`:15-16`, `:881`) go | Carries over: the whole-tool per-change checks for any build (smoke, layout with every panel open, keys, leaving, 3D loads only when asked). New: the still-air line (TS-R10); live mode (TS-R1) when built | Smoke, layout, buttons, leaving and offline parts each change; the whole file at sign-off |

**Sign-off checklist line, V2.64 turning rejoin (TS-69)** (draft, for Patrick to put in his own words), V2.64, hard refresh: with TRJ selected, from the default start press Echelon at each Rates choice: #2 sets his overtake (the tag shows MAX, then a torque), gets onto the line with a turn toward Lead and a reversal, holds Lead at his 10:30 or 1:30 with a steady medium bank, takes the overtake out early with a held power-back torque (IDLE or BOARDS only when the room is short) as he nears route, and flows through route into echelon without passing ahead of Lead's 3/9 line; from fighting wing press Echelon: the same from the line, quicker. Not tested by any automatic check (Patrick 06:25Z).

**Sign-off checklist line, V2.66 fighting wing moves (TS-70)** (draft, for Patrick to put in his own words), V2.66, hard refresh: from the default start press Fighting wing; as soon as #2 is in the cone the formation box shows "Fighting wing, Lead" with Level turn L/R, Wings level, Reversal, Climb, Descend, and the line abreast turns are gone; press Level turn L: Lead turns at the set bank and keeps turning, #2 stays in the cone and collapses toward Lead's six; Climb, then Reversal, then Wings level: #2 follows, settles back out in the cone, and it is judged in position. Not tested by any automatic check (Patrick 06:25Z, 09:08Z).

**Sign-off checklist line, V2.67 straight-ahead rejoin (TS-72)** (draft, for Patrick to put in his own words), V2.67, hard refresh: with SARJ selected, from fighting wing press Echelon, and from the default line abreast start press Echelon: #2 goes to full power and cuts to Lead's six, falling back a little, sets the overtake on the six, comes up it just below the wake, takes the small vector at about 500 ft and flows through route into echelon; never ahead of Lead's 3/9 line. Untested: Patrick hasn't flown it.

**Sign-off checklist line, V2.68 echelon to fighting wing (TS-73)** (draft, for Patrick to put in his own words), V2.68, hard refresh: from echelon press Fighting wing at each Rates choice: #2 rolls away, idle and boards, eases down, turns back and goes to MAX, and is in the cone in about 10 s; Lead's fighting wing buttons show as he gets there. Untested: Patrick hasn't flown it.

**Sign-off checklist line, V2.69 fluid by energy and geometry (TS-74)** (draft, for Patrick to put in his own words). V2.69, hard refresh. From fighting wing, press Fluid manoeuvring, then the Loop and the standard sequence. #2 stays at MAX and keeps 500-1,000 ft through the loop. He lags going up and leads coming down, comes out at about Lead's speed, and shows STRETCHED only past 1,000 ft. Untested: Patrick hasn't flown it.

**Sign-off checklist line, V2.71 rejoins at 220 (TS-75)** (draft, for Patrick to put in his own words). V2.71, hard refresh. From the default start, press Echelon, then Fighting wing, then try 4,000 ft and SARJ. #2 never goes below 200 KIAS, except a brief dip at 4,000 ft. He meets the line at 200-210, holds up to 220 down it, and slows from about 500 ft. To fighting wing he settles where he arrives in the cone. Untested: Patrick hasn't flown it.

**Sign-off checklist line, V2.76 close formation turns (TS-77)** (draft, for Patrick to put in his own words). V2.76, hard refresh. From the default start press Echelon, then a 90° turn each way, then Route and the same. Lead rolls in over about 3 s. In echelon #2 stays in his place through the roll-in, the turn and the roll-out, stepped down on the inside and up on the outside, and his tag stays IN POSITION; in route he is out for a few seconds at the roll-in and roll-out and comes straight back. His bank stays within about 10° of Lead's. Untested on screen.
