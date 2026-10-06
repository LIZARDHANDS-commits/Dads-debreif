# Session plan for Patrick's review: the press mid-move, and the lag roll as an entry (5 Oct 2026, 20:45Z)

Fable thread "Wingman chooser review". Patrick 20:30Z: "I do the re-plan only"; 20:35Z: "lag roll to be an ENTRY into fighting wing as well ... as well as a manoeuvre while already in fighting wing ... do all of this at once." One pull request, Formation V2.77 (or main plus one at merge), decision TS-78. Everything below is unseen on screen until Patrick flies it.

## 1. What Patrick will see

1. **A "Change formation" press while a change is being flown re-plans now.** Both aircraft carry on from exactly where they are (position, heading, speed, bank, roll rate, height) into the new plan. Nothing queues. The card shows the new plan and the "Chosen: ... over ..." line. If no planner can reach the new formation from there, the card says so and the move being flown carries on.
2. **Lag roll from echelon, route or line astern.** The Lag roll (#2) button shows in the close formations too. From a close position #2 pulls up, rolls toward Lead over the top, passes over Lead's six inverted and comes down into the cone on the other side, then closes at a small overtake. The card judges him as fighting wing on the new side. Lead straight and level, as now.
3. **Lag roll from fighting wing, as now,** unchanged.
4. **Question for Patrick (section 4):** whether a lag roll should also be one of the candidates the chooser scores when "Fighting wing" on the other side is pressed from a close formation.

## 2. What stays as it is (and goes on Formation's handover)

- A turn button, a manoeuvre, the 4-ship and fluid pressed mid-move still wait for the current move. Their planners build Lead's path from scratch and would roll him out of a turn he is holding. The fix is "Lead's remaining plan as an input to every planner" (Opus, next).
- A press during a lag roll still waits: no planner can start from inverted.
- The decision point and "the picture breaking" re-plan nothing yet, on purpose: Lead flies a planned path and #2 replays, so nothing diverges between the press's dry run and the flight. The hook exists (hand-over.js replanFor); it earns its keep when something can diverge (a stick-flown Lead, a training error mid-move).
- Lead manoeuvring during a lag roll (a turn while #2 is over the top): later. The path is drawn in Lead's frame, which must not accelerate.

## 3. How, file by file

| File | Change |
|---|---|
| `live/formation.js` | `change()`: when the move being flown is a 2-ship change (not the lag roll, not the 4-ship), re-plan through `startChange` from the current state instead of queueing; on refusal keep the current plan and put the reason on the card. The same shape `pressFw` already uses for Lead's fighting wing moves (TS-70). `lagRoll()`: allow the close formations as a start. |
| `live/turning-rejoin.js`, `live/straight-rejoin.js` | Accept a start the classifier calls "other" (between formations) when #2 is outside 300 ft and behind Lead's 3/9 line; hot or cold read from where he is against the rejoin line, not from the formation name. Today both refuse "other", so a press mid-rejoin would fall to the tracker alone. |
| `live/lag-roll.js` | From a close formation: the path starts at #2's close place; the 500 ft bubble check applies once he has left it (the start is inside by definition); the range over Lead's six comes from the search as now, with a wider band for a close start (estimate, see section 5). Words on the card say which start it was. |
| `live/chooser.js` | No change (Patrick 20:37Z: button only). |
| `live/tuning.js` | LAG_ROLL: the close-start numbers, each marked estimate. |
| `fluid-panel.js`, `transitions-panel.js` | The Lag roll (#2) button shows in echelon, route and line astern as well as fighting wing. Nothing else moves. |
| `src/shell/home.js`, `index.html` | Version badge. |
| `docs/modules/turn-sim/` | spec.md: F11's note, section 10.8 (lag roll from close), new 10.15 (the press mid-move); decisions.md TS-78; plan.md tick; future.md (what moved out); testing.md sign-off line draft. |

## 4. The one question (card): answered 20:37Z, "Button only"

Patrick chose **Button only**: the lag roll flies only from its own button. The chooser's candidates stay as they are, so the chooser.js change shrinks to nothing (the G rule line below is not needed either).

Should the lag roll also be a chooser candidate when "Fighting wing" on the other side is pressed from a close formation?
- **Button only** (safe): the lag roll flies only when its button is pressed. The chooser's candidates stay as they are.
- **Candidate too** (recommended): the chooser scores it against the drop back and cross behind (today 52 s from echelon). It wins when it passes the checks and is quicker, which it will be, so "Fighting wing left" from echelon right would usually fly a lag roll. That is the chooser doing its job: checks, then quickest.
- **Candidate, but only in fighting wing**: from fighting wing to the other side the lag roll races the flow behind Lead; from a close formation the button only.

## 4b. Added 20:39Z: a change ends at "in band and steady" (Patrick's card)

Dry runs on main (20:38Z) showed every change running on 11 to 18 s after #2 is IN POSITION, because the plan ends only when the tracker has settled within 1.5 ft and under 1.2 ft/s of the exact slot. Patrick chose **In band and steady**: in `formation.js` `step()`, a 2-ship change finishes once the judge says in band and #2 is steady (closure against the slot under the close-in rate, bank within a few degrees of Lead's: estimates), while the tracker's plan keeps flying underneath and goes on holding the slot. The card reads done then, and the next press is free. The dry-run end time on the card is the same rule. Lead's own plan (a speed change, a turn-in rolling out) must also be done. Not applied to the 4-ship or the lag roll.

Also found, for Formation's handover: opening out to line abreast is flown on speed (about 20 kt on Lead), 109 s from echelon and 81 s from fighting wing; a turn away and back would open 6,000 ft in about 35 s.

## 4c. Added 20:41Z: "stabilize" means within 5 knots (Patrick)

"I want 'stabilize' to be 'within 5 knots' instead of 'exactly zero'." Applied in `live/tuning.js`, each with his ruling as the source: the tracker's settled rule (today 1.2 ft/s against the slot, about 0.7 kt) becomes 5 kt (8.4 ft/s); a station change's stop at each corner (today 1 ft/s, then 2 s of dwell) becomes 5 kt; and the new "in band and steady" end of a change uses the same 5 kt against the slot. The dwell stays 2 s (SMM 12.20 para 45 "stabilize"; the 2 s is an estimate) unless Patrick says otherwise. Expected effect: the close moves' corners and the tail of every change come in several seconds sooner; the dry runs will show the before and after.

## 4d. Added 20:41Z: the opening out to line abreast by geometry (Patrick's card "Me, this PR")

Patrick 20:39Z: "rejoins and transitions between tactical formations should be assertive and smooth and quick". Fighting wing or a close formation to line abreast: #2 turns away 30 to 45 degrees (SMM 16.18 para 51 says 20 to 40; the extra is Patrick's "assertive", an estimate until he rules), holds it, and turns back parallel as the spacing comes up, speeding up to 220 KIAS as now, instead of opening out on about 20 kt of speed. In `kinematic-moves.js` (the line's places out to line abreast) and `transitions.js` `openOut` (the tracker's leg). Target: 6,000 ft in about 35 to 45 s from fighting wing (today 81 s), the dry runs to say. Lead holds 220 KIAS straight, as now.

**Read in the SMM (text copy, 20:45Z):** 16.18 para 51 says only that "the wingman then manoeuvres into position while lead flies straight and level", and that Lead may direct a more dynamic transition where both aircraft manoeuvre onto a new heading; 16.19 para 58 adds that check turns may be used to help a wingman gain a line abreast position. The "20 to 40 degree turn away" the code's comment cites against para 51 is not in that paragraph, so the turn-away angle is an estimate until Patrick rules (the code comment gets corrected). Where the 81 s goes today (fighting wing to line abreast): 44 s for the first 5,000 ft (the line's lateral rate is capped at 140 ft/s, and its closing law slows in proportion to the range left), 14 s for the last 500 ft at the close-in rate (20 kt, meant for close formation, not a 100 ft band), and 14 s of tail after in band. The fix: the line to line abreast runs at the turn-away's lateral rate (about 260 ft/s at 45 degrees and 220 KIAS), slows only over the last few hundred feet, hands over at the kick-out closure rather than the close-in rate, and the change ends at in band and steady.

## 4e. Added 20:50Z: roll rates (Patrick's ruling, routed to Formation)

"Echelon turns are very slow and smooth, about 4-5 seconds to get to 60/2. Fighting wing, rejoins, tactical formations, line abreast etc. is unrestricted (realistic) roll rates and aircraft handling." Outside close formation the code already rolls at the aircraft's rate (tuning.js ROLL, 180°/s). The close formation turn's Lead roll (V2.76, formation-turns.js CLOSE_TURN.leadRoll, 30°/s, about 3 s to 45°) is the Formation thread's to bring to 4-5 s to 60°; sent through the coordinator. Nothing in this PR changes for it.

## 5. Numbers (all estimates until Patrick rules; sources: the barrel roll SMM 14.8 paras 18-19, Table 14.1; the cone SMM 12.29 para 69)

- From a close start, the range over Lead's six: 500 to 1,400 ft (the bubble to the existing band's top). From fighting wing: 900 to 1,400 ft as now.
- The pull 2.5 to 3 G, nose 30 to 45° up, slowest 150 to 185 KIAS over the top: as now.
- Fall-back behind the slot 0 to 1,000 ft, closing at 20 kt: as now.

## 6. Checks (no tests, Patrick 09:08Z)

Dry runs from the default start: press Echelon, then at 5, 15 and 30 s press Fighting wing, Route, Line abreast and Echelon on the other side; press Fighting wing, then mid-way Echelon; press Line abreast from echelon, then mid-way Fighting wing. Each must end IN POSITION and name the planner picked. Lag roll from echelon left and right, route and line astern: ends IN POSITION in the cone on the other side, never inside 500 ft of Lead after leaving the close place, G inside the aircraft's. Typecheck. Unseen on screen until Patrick flies it; hard refresh.

## 7. Order

1. Wait for the Formation thread to release the files (the coordinator says when). 2. The press mid-move (formation.js, the two rejoins). 3. The lag roll from close (lag-roll.js, tuning.js, formation.js lagRoll). 4. The button in the close formations. 5. Docs, badge, dry runs, PR, merge, hand the files back with the handover list.
