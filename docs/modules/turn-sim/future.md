# Turn Sim: future ideas

Ideas for the Turn Sim that are not being built. The review decided on 4 Oct (a new flying core, `decisions.md` TS-35); each item here is built on that core, one at a time, only once Patrick moves it into `plan.md`. An idea moves into `plan.md` only with Patrick's yes (TQ-1), and a new idea goes on this list the same day it is asked for. "Feature Ideas" numbers are from the researched list of 54 ideas, kept at https://claude.ai/artifact/6PMvFiKigB29hBvVSoJ2op (`pf/reset/2-inventory/agents/sources/feature-ideas.md:30`). "FF" numbers are from the old plan's future-features list (`archive/docs/records/future-ideas.md:5`).

The second wave of live mode (rejoins, fighting wing and fluid manoeuvring, old FF39 to FF41) is not listed here: Patrick put it in the plan, in the order the review sets, so its single home is `plan.md` Step 4 (`pf/reset/1-requirements/questions.md:165`). The G-warm exercise (two-ship and four-ship) is also in the plan: its question is TS-Q19 and the four-ship picture check is a Step 1 item (`pf/reset/1-requirements/questions.md:164`). Items below are grouped by topic; the ones that were built since this list was last tidied (6 Oct, refactor PR 9) are gone from it and are recorded in `decisions.md`.

## Rejoins and changing formation (2-ship)

- The Overshoot button and rejoin mistakes (too hot, too much bank), SMM 12.27; break and rejoin (design M7); the turning rejoin with Lead turning away from #2 (SMM Fig 16.24) and the in-place-turn rejoin (M9); the hot or cold line choice, an overtake box and a bank-cap box under More.
- The dynamic entry to line abreast (both turn onto a new heading together, design M8).
- The straight-ahead rejoin's overshoot (SMM 12.27 para 66: vertical separation and turn away), with training errors applied to the straight-ahead rejoin.
- **What the retired hot rejoin did that is not flown now** (refactor PR 2, TS-94): the decision-point overshoot from a training error's start (behind and below Lead, stable on the outside, cross back and join; SMM 12.27 para 65, Fig 12.18) and its card words naming the stage used (boards, idle). With Smart wingman off (TS-96) #2 keeps the error, so the overshoot can come back there as a lesson if Patrick wants it.
- **Ahead of the 3/9 line in a hot rejoin** (Patrick 5 Oct 03:02Z: "What if he does idle boards 6g descending turn ?"; with 03:05Z: "Yeah over 5 g is a last resort and must stay below 7 in all cases"): for a start that leaves #2 ahead of Lead's 3/9 line once Lead turns into him (ahead, ahead and tight, or fast at the normal reference), today the tracker's rejoin flies it (a question for Patrick). The idea: idle and boards and a descending turn with only the G he needs (over 5 G as a last resort, never 7), Lead passing ahead and above, #2 rejoining from behind and below. Not built (Patrick 03:49Z: get it to testing first).
- Holding every planned speed-up to full power (TS-63 held only the off-standard capture lines): the planned capture lines may ask up to 3 kt/s (the standard rejoin's already ask 2.2-2.7), and a little more where nothing else fits.
- The moves into a close place while Lead is banked (the hot rejoin's capture, the station changes, the hand-over's run-in) still follow Lead's wing plane 3 s late (`KINEMATIC.planeLagSec`). Give them TS-77's hold (`formation-turns.js` `holdInPlane`) if Patrick sees the same drift there.
- The turning rejoin's X (TS-106) still to finish: the move over flies the decision point's straight slide into the slot, not "out slightly to route, then up the line" (the tracker inside Lead's turn ran #2 abeam of the slot); from fighting wing it cuts slightly inside the line. #2's height on the X is 30 ft below Lead's height, not below Lead's banked plane (card 03:33Z rule 1: about 40 ft lower at 100 ft out in a 30° turn). The 4-ship's #2 on the X.
- **The near-inverted pull onto the line** (Patrick 6 Oct 04:07Z: "IRL I would flip almost upside down and point my lift vector otwards \"the line\" for a turning rejoin"): since V2.119 the bank drawn follows the lift (TS-108), but the rejoin still picks its descent apart from its turn; planning the pull as rolling the lift vector onto a lower line is still to do.
- Route, line astern and the 4-ship's turns at the slow close formation roll (Patrick 20:50Z: not now).
- Pressing a manoeuvre button while another manoeuvre flies and re-planning from the banked state (it queues, TS-45; a formation press mid-move re-plans since TS-78 and a turn mid-change since TS-79).
- Fighting wing S-turns to bleed energy (Patrick 5 Oct 23:02Z: "in fighting wing a common way to bleed energy is to S turn left and right if required"): after the cone's height (TS-96) and before power. Not built in V2.95; the tracker uses height, then power.
- A pitchout and rejoin exercise sits with the rejoins in Step 4 of the plan, not here (`pf/reset/1-requirements/scope-and-ideas.md:237`).

## Fighting wing and fluid manoeuvring

- Terminate for position (SMM 16.17 para 46; Patrick 23:02Z): #2 calls it when he is outside the parameters and can't regain them quickly; Lead acknowledges and flies a predictable turn, #2 repositions and calls "Cleared to Manoeuvre", Lead restarts. A button for it, with Lead's predictable turn, waits for Patrick's yes.
- Turning #2 toward parallel over the top of a wingover or barrel roll (V2.19 leaves him 30-45° off at 600 ft; Patrick 23:00Z calls parallel a loose aim). Turning him in Lead's turning plane, as in the loop, gave G spikes far over 5 G because that plane swings round as Lead rolls; it would need its own design.
- #2's planned place in the loop at long range (TS-74, V2.69; TS-63 (4) asked for the loop at a long distance setting under 5 G): at the 1,000 ft setting the place is turned about Lead on a 1,000 ft lever. Over the top it runs faster than any aircraft can there and jumps once, so #2 opens to about 1,700 ft with a one-step G spike to about 6.9 (about 7.8 G before TS-74). A loop place built in the loop's own frame, not turned about Lead's nose, would fix it.
- The Live wingman as a setting (Patrick 18:03Z 4 Oct: a setting, Planned the default; 22:04Z: live as a future feature): superseded by TS-76 (5 Oct). There is one pilot, run ahead and replayed; the plan is re-made at events (F1, F11). Running the chosen technique live every step (so #2 also answers things nobody named: a gust, an error given mid-move, a Lead flown by hand) is a build step inside TS-76, taken only when such a thing exists in the tool; the review's options are in `/mnt/project-files/turn-sim-review/chooser/options.md`.
- Fluid 4 manoeuvring (AFM8 brief pp.20-22; SMM 16.40 para 108), with #3 and #4 opposite #2 (Fig 16.29) and 6,000 ft spacing (setting 4,000-6,000; Patrick's picks rows 8-9).
- Cloverleaf, Cuban eight and Immelmann (design 5.1; not in the baseline or the next pieces).

## Power, speed and the aircraft

- A torque curve from the NFM (torque against PCL, speed and height) in place of the model's throttle and the 0.81 efficiency behind TQ % (Patrick 02:05Z).
- Power on the tags for the tracker's rejoin and the other planned lines (they set no power, so none shows).
- Speed and block height: a low or mid block choice (220 or 200 KIAS, TS-R6), the real low block height (8,000 ft is an estimate, TS-38), and a simple speed bleed in 3 G turns (constant for now, TS-38).
- Wind (TS-R10; still air for now).
- Vertical G shown on every height leg (only the push over shows its G on the card today).
- A lead +4 G, wingmen +5 G advanced-formation limits check is flagged in fighting wing and fluid manoeuvring (TS-53, TS-57, TS-60); the same flag for other formations is not built (Gen Book p.11).
- **Idle spool-up lag** (Patrick 6 Oct 03:20Z): from idle the engine takes about 4 s to come back up; not modelled (TS-108 has the torque answer in 0.2 s from any setting above idle).

## Training errors and faults

- Errors and faults (TS-R8): the first layer is built (TS-52: late or early, wide, tight, fore or aft, high or low, fast or slow; carried or fixed; the Fix tools; Smart wingman, TS-96). Still here: more or less G as an error; one-click faults (TS-Q16); injecting an error between presses (during a flying manoeuvre or in line abreast); hiding the error until after the roll-out so it can be spotted; errors for the 4-ship.

## The 4-ship

The four-ship rebuild (refactor PRs 6-8, V2.97 to V2.101, TS-99, TS-101) is built; the items below are what it left.
- **The 4-ship build's source is the moves table Patrick ratified on 5 Oct**: project files `turn-sim-review/four-ship/moves-from-the-manuals.md`, sections 7 and 8. Build from it, not from the items below. Fluid 4's #3 now sits abeam at the Setup's spacing (TS-90).
- The 4-ship's other order (2134). Spread 4 (V2.7, TS-50) and the offset box as a formation (V2.13, TS-54) are built, each wingman flying off its reference aircraft.
- Four-ship design asked for (Patrick, 4 Oct 11:14Z, list agreed 11:15Z), designed in the project files `turn-sim-review/four-ship/`. The planned part is built (V2.13, TS-54: G-warm, close position changes, rejoins, Fluid 4 and the offset box in and out, the fighting wing places). Still here: manoeuvring inside the offset box and Fluid 4 (Fluid 4 and Fluid manoeuvring are two buttons, Patrick 11:43Z); live fighting wing and fluid manoeuvring for the four; fighting wing to echelon direct (the straight-ahead rejoin flies it since TS-55; a direct turning rejoin is not built); finger to offset box direct and "offset box east/west" from fighting wing (design question 4); the left offset box crossing (Dad question 3); #2 choosing the stack; lost sight, overshoot and contingencies (with the training errors); take-offs and the initial recovery (the Traffic Sim).
- The 2-ship G-warm (the four-ship's is built, TS-54).
- The mid-flight transition between 2-ship and 4-ship (V2.7 restarts from the default start of the mode chosen); being designed in another thread.
- The 4-ship's delayed 45 as the brief draws it: all the aircraft after #2 check together right after #2 starts its turn, then turn in sequence (AFM8 brief p.18). That cannot roll out in exact line abreast, which is what the brief's own note admits ("quickly fix any spacing or sweep errors on roll out"), so it waits for the errors layer; V2.7 flies each check and turn in sequence instead, which is exact except for a little tight on the first aircraft to check.
- The 4-ship's altitude stack chosen by #2 (the SMM: #2 sets it, #3 and #4 take the opposite block, so #2 can be below Lead) and a stack-change step before a turn ("return to stack promptly when directed by Lead", AFM8 brief p.14). V2.7 keeps the brief's stack all the time.
- The 4-ship rejoins still fly the old tracker: from spread, #2 drops to about 178 KIAS and the rejoin takes minutes. Give them TS-75's rule when the 4-ship turning rejoin is built.
- The 4-ship's overshoot and off-standard rejoins (SMM 16.34 paras 94-96).
- Finish the one-candidate shape (TS-94) for the 4-ship: every planner returns the same { plans, endSec, judged } for the chooser; the 4-ship still sits outside it.

## Screen, setups and V6's features

Patrick, 4 Oct (review thread): he wants all of V6's features eventually, added one at a time on the working 2-ship model (`spec.md` section 1). The order of the first few is in `plan.md` Step 4; the rest wait here.

- Plan mode on the same core: pick a start and a manoeuvre, press Play (TS-R1).
- The clock cue drawn as a picture (where the other aircraft is at the turn point), and a Clock cue timing option (TS-R7, TS-40).
- An angle box for the check turn (5 to 30°; the first version flies 20°, TS-46).
- The wingman passing below instead of above in the shackle and cross turn (TS-42's working answer is above).
- Saved setups (TS-R18), the CSV export (TS-R19, TS-Q13), the spacing graph (TS-Q14), which read the rolling record.
- Dragging a wingman to a new start (TS-R17). (Moving #2 around inside the band with the Position buttons is built, TS-98.)
- A vertical step in the offset-box hook (old FF46, old decision D207): separate the 31 ft flat nose-to-nose pass with the SMM's own vertical separation or an offset, instead of only a caution flag. The requirement TS-R11 already says the screen warns that real aircraft would be stacked 300 ft apart where aircraft cross by design (`archive/docs/records/future-ideas.md:22`, `pf/reset/1-requirements/requirements.md:338`).
- V6's other layers: breadcrumbs with time stamps, spacing lines, clock marks, NM labels (the drawing code is still in `view.js`).
- **Formation position trainer**: top-down and sight-picture views of fingertip, echelon, route, fighting wing and trail, with a quiz mode; pairs with the Formation Turn Sim (Feature Ideas idea 28; value medium, effort small; `pf/reset/2-inventory/agents/sources/feature-ideas.md:30`)

## Asked 6 Oct (Patrick, in his words; not built until he moves them up)

- **A scorer on every press** (00:56Z): "Shouldn't we have a scorer for every time we press a "command the formation" button?" Fable's framing: a scorer wherever a press has more than one way to fly it (changes, rejoins, a real choice such as the turn-circle entry made high or low), and a single law where there is only one way.
- **Click to place #2, with a height slider** (00:58Z): "Instead of the fore /aft buttons can I have an altitude slider that shows its min/max values for the position 2 is in, and CLICK on a yellow translucent box that appears when I say "Set 2's position" ? and it flies to where I click? or is that too hard? the fore/aft buttons are clunky". With (01:00Z) "There should be a blue box in LAB then that shows the 0-10 deg sweep 4-6k feet as well" (the line abreast band, SMM 16.18 para 49), and (01:11Z) "should it be a click, THEN set altitude (pop up) because in fighting wing the cone would have different alttidues depending on where the click?" The flow Fable sketched: "Set 2's position" lights the band (yellow; blue for line abreast); a click picks a point in Lead's frame; a height slider or pop-up shows that spot's min and max, starting slightly low on Lead in fighting wing and level in line abreast; on Go, #2 flies there with the move-in-band planner, held to the band. It replaces the fore/aft buttons. Built in V2.108 (TS-104, spec section 11), wording confirmed 6 Oct 02:54Z; kept here as the ask's record.
- **Everything planned off Lead** (00:58Z): "Everything should be planned off lead." Today the 4-ship's wingmen fly off the aircraft ahead (SMM 16.38); changing that is a question for Patrick, with both options.
- **A left or right switch for the turning rejoin** (01:01Z): "The rejoins should have a left or right switch for turning rejoin. if lead turns away 2 would have to pull agressive lead to get on the circle at full power. dos that make sense?" Today the turning rejoin covers Lead turning into #2 (SMM Fig 12.15); Lead turning away (Fig 12.16) puts #2 on the cold side, pulling hard lead at full power onto the circle (the circle capture in `fw-pursuit.js`, TS-100). The away case would be its own candidate for the scorer.
- **The Rates setting is a ceiling** (Patrick, relayed 00:57Z): the SP/IP/AI setting is the most rate targeted; not reaching it is not an error.

## Ideas kept from the retired plan-mode code (clean-up step 4; Patrick, card "Approve, all 4" 5 Oct 01:36Z)

The first Turn Sim engine (plan mode, ported from V6) was removed in clean-up step 4; today's screen had not used it since live mode. Its ideas, for a later plan mode (TS-Q2, the two modes) if Patrick wants one back. The code is in git history before the step 4 pull request.
- **Plan a whole turn in advance and play it** (engine/plan.js, run.js, step.js): who turns which way, how far and when, from settings, stepped 0.05 s at a time.
- **Clock-position cues** (engine/cues.js): an aircraft waits until another passes a clock position on it, then turns (V6 `clockCueCrossed`).
- **The Delayed 45 with the check turn** for the 2-ship, spread 4 and box (engine/check-plan.js; SMM 16.19 Figs 16.17, 16.31, 16.34).
- **The offset box's rear element check** (engine/rear-check.js): #3 and #4 turn a few degrees away, hold and turn back to look behind.
- **The Solver** (engine/solver.js): finds the base delay, starting spacing or G that gives a target spacing at the end of a run.
- **The Spacing graph** (engine/series.js): pair distances, minimum separation and closure over a run.
- **Auto timing and the G correction** (plan.js, step.js): turn starts timed to keep spacing; a wingman's G corrected toward his slot.
- **V6's formation slots and position errors, settings and input boxes** (engine/formation.js, settings.js, fields.js) and the old Formation card rows (readouts.js).
- Two shared helpers in `src/core` were used only by plan mode and are now unused by the Formation Sim: `turnSimG` (flight-math.js) and `classifyTurnSimPosition` (standards.js). They stay until a `src/core` change is agreed.

## Refactor leftovers (Fable, 5 Oct 22:12Z; Patrick 22:13Z "execute")

Built as refactor PRs 1 to 5 (TS-85, TS-93 to TS-97) and the docs rewrite (PR 9); PRs 6 to 8, the four-ship rebuild, are merged (V2.101). Still here:
- Project files: condense the `turn-sim-review` notes into the README's "How #2 is planned now" and archive the rest.
