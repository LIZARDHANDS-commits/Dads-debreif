# One chooser for the wingman: the plan

Fable, 5 Oct 2026, for Patrick. Read at repo main `8ad75a3`. Nothing in the repo was changed and nothing was run; this is a reading of the code and the manuals' page references. Guesses are marked as guesses. Software words are explained the first time they come up.

Patrick's ask (18:11Z): "What if we dynamically hand off between lines, tracker, and the 'AI' used in fight sim? how could we know when the best spot was to use for each?" And (18:36Z): the big picture, how it fits together and why, the best path forward, and how to make it work.

## 1. The answer in short

1. **Don't build a fourth way of flying #2, and don't hand off between three "pilots" every step.** The three methods are not rivals. They are three layers of one job, and two of them already choose by trying candidates in a dry run (a *dry run* is the move flown through the aircraft model on a copy, to see what it would do, before the real aircraft flies it). What is missing is one small piece: a **scoreboard** that lets the planners compete on the same terms, instead of today's fixed order where the first planner that accepts the case wins.
2. **Fight Sim's "AI" is the same pattern, not a better pilot.** It dry-runs each named move about 20 s ahead, scores it, flies the best, and picks again when a move ends. Formation's turning rejoin already does exactly that inside one move (banks, aims, overtakes, the speed floor). Borrow the pattern; don't move the code. Its score (who gets a nose-on first) and its moves are a dogfight's, and it flies a different aircraft model.
3. **Keep #2 planned, and re-plan at decision points, not every step.** You ruled on 4 Oct that the wingman is Planned across the board and Live is a future feature. A hand-off "dynamically" mid-move is the Live wingman by another name. The middle road keeps your rule: plan at the press, plan again at each decision point (the line's hand-over at 500 ft already does this), and plan again when the picture breaks. The path drawn ahead stays the path flown until the next decision point.
4. **"Best" should mean: passes the pilot's checks, then quickest, then smoothest.** The checks already exist in the planners (behind Lead's 3/9 line, the speed floors, the G rule, the bubble, in band at the end). Quickest is what you asked for on 5 Oct ("fast and effective like the SMM"). Smoothest breaks ties.
5. **The hard core is small** (one new file, about 150 lines, plus the chain in `formation.js`). The real work was the decision, which is this file. Opus does the wrapping of each planner, the "picture breaks" trigger and the 4-ship later.

## 2. How the three methods fit together

| Layer | What it really is | Where it lives (Formation) | Its twin in Fight Sim |
|---|---|---|---|
| **The planner** | How the pilot plans the move: a few candidate techniques, each flown through the model in a dry run; keep the quickest that passes the checks | `turning-rejoin.js` (aims x banks x overtakes x speed floor, in order of preference), `straight-rejoin.js`, `echelon-to-fw.js`, `lag-roll.js` (pull x nose) | `lookahead.js` `pickTacticalMove`: the candidates are named moves, the score is nose-on first, then an advantage number |
| **The line** | The shape of a long move, read off positions on a power time law. A planner's output, not a pilot | `kinematic.js`, `line-moves.js`, `hot-rejoin.js` | none: Fight Sim draws nothing ahead |
| **The tracker** | The hands: a small closed-loop slot keeper, bank and speed toward a moving slot, re-aimed every 0.05 s step. Flown once in a dry run at the press and replayed by the real aircraft. Every planner ends in it | `tracker.js`, `hand-over.js` (the 500 ft hand-over, planned again when the line ends) | `moves/pursuit.js` `controlPursuit`: point the lift at an aim point every step, with input smoothing |
| **The live pieces** | #2 flown step by step against Lead's planned line, by energy and geometry; the fighting wing goal worked out afresh each step | `full-power.js` `flyFluidStep` (fluid), `formation-turns.js` `fwGoal` (the cone) | the whole fight: both aircraft decide every step |
| **The pick** | Which planner flies this press | `formation.js` lines 249-257: a fixed fallback chain. The first that accepts wins; nothing scores one against another; nothing re-picks except the hand-over | `pilot.js`: pick when a move ends, or every 3.5 s in the MPT after a 4 s lock-out |

Two things follow:

- A re-aim-every-step controller (the tracker, Fight Sim's pursuit) is right for the last few hundred feet and for a gunsight, and wrong for a long move. That was the lesson of the rejoin review (`../fable-compiled.md` section 1, item 4), and it is why "hand off to the AI for the long part" would bring the chasing fault back.
- The planner pattern is already the chooser. The turning rejoin runs up to a few dozen dry runs at a press and keeps the quickest that passes. Putting the planners side by side on one scoreboard is a small step from there.

## 3. Planned or live: the fork that decides everything

**How Formation flies today.** Every aircraft flies a pre-planned path worked out at the press (spec F1, Patrick 4 Oct 08:53Z). Lead's path is fixed at the press. #2's is a recorded track of bank and speed commands from a dry run, replayed by the real aircraft. The same presses give the same picture at any playback speed (F10). The judge reads the picture at roll-out. The only re-plan is the line's hand-over at about 500 ft (TS-65).

**How Fight Sim flies.** Both aircraft decide every step. Nothing is drawn ahead; the look-ahead is a copy of the whole fight run forward.

**What a live hand-off would cost.** The line drawn ahead (it would be a guess, redrawn every step), repeatable replays, the roll-out judge as it stands, the training-errors layer (it plans a response at the press), and the calm of one plan per press. This is the "Live wingman" you parked on 4 Oct 22:04Z: "get it working for planned across the board and implement live as a future feature" (`docs/modules/turn-sim/future.md`).

**The middle road (recommended).** Plan at the press. Plan again at each decision point: the line's hand-over (exists), the rejoin's decision point, the moment a move ends with another queued. And plan again when the picture breaks: a check the plan relied on fails in the real flight (the tracker's run-in does not settle, #2 gets ahead of Lead's 3/9 line, #2 leaves the cone). Each re-plan starts from the aircraft as they really are and from the rest of Lead's plan, which `hand-over.js` `replanFor` already does. The path drawn ahead is the current plan and is redrawn at each re-plan, so it stays true.

## 4. What "best" means: the score

Proposed, until you say otherwise:

1. **Pass the pilot's checks first.** All exist today inside the planners: behind Lead's 3/9 line inside 1,000 ft (Patrick 08:04Z); the speed floors (TS-75: never below 200 KIAS unless close in and hot; 220 up the line); the G rule (bank caps; over 5 G a last resort, 7 G the wall, Patrick 03:05Z); the 500 ft bubble; ends IN POSITION by the judge's band. A candidate that fails a check is out, whatever its time.
2. **Then quickest.** The planner's own `durationSec`. This is "fast and effective like the SMM" (Patrick 08:12Z).
3. **Then smoothest, as a tie-break only.** Fewest bank reversals and power changes along the track (a small count, new). Ties within about a second go to the smoother one (the half-second rule `turning-rejoin.js` already uses).

What the score does **not** do: it does not grade "how like the manual picture" as a number. The manual's picture is in the candidate list (the rejoin line with Lead at 10:30 or 1:30, SMM 12.24 paras 56-57; the cone, SMM 12.29 para 69), not in the score. "A lot of advanced form is art" (Patrick 05:21Z) is honoured by letting any candidate that passes the checks win on time.

Fight Sim's score (nose-on first, then a weighted advantage of angles, range and energy, `judge.js` `tacticalAdvantage`) does not carry over: being on Lead's six first is not being in position.

## 5. Scope and order

**Phase A: the scoreboard for the 2-ship changes (now).** The chain in `formation.js` becomes: run every planner that applies (hot rejoin, TRJ, SARJ, echelon to fighting wing, the line, the tracker alone), each returning its best candidate in one shape; drop any failing a hard check; fly the winner; the card's note says what it compared ("Turning rejoin 58 s; straight-ahead 62 s"). Each planner stays as it is inside. Nothing in the flying changes; only who gets picked when two planners both accept a case (today the order decides).

**Phase B: re-plan at decision points and when the picture breaks.** The rejoin's decision point joins the hand-over as a re-plan point. A live check (`formation.js` `step`) watches the three things above and, on a break, re-plans from the real state. This needs re-planning from a banked, accelerating #2; the planners copy the aircraft as it is and the tracker's `init` carries his acceleration and bank, so most of it is there. The one known gap: `turning-rejoin.js` plans Lead's turn-in from the press; a re-plan mid-rejoin must take Lead's remaining plan instead (as `replanFor` does for the tracker).

**Phase C: fighting wing and fluid.** Already live goals (`fwGoal` each step; `flyFluidStep` each step). Add only the "picture breaks" re-plan (#2 out of the cone). Nothing else.

**Later: the 4-ship**, with the 4-ship turning rejoin (`future.md`). Its moves are the old tracker legs and need the TS-75 rule first.

**Not in scope:** moving Fight Sim's look-ahead into core; a translator between the two aircraft models; replacing `flight.js` with core's point mass; the Live wingman; any new test (Patrick 09:08Z).

## 6. Fight Sim's AI: borrow the pattern, not the code

Why not share the code:

- Its look-ahead copies the whole fight (`structuredClone`) and scores by who gets a nose-on first. Its candidates are fight moves (Immelmann, yo-yos, split S, the MPT). None of that is a formation change.
- It steps core's 3D point mass (`src/core/point-mass.js`, G and bank commanded, drag charged at the G flown). Formation steps `flight.js` (bank eased at the roll rate, speed by planned segments). A translator between the two is a second aircraft model to keep honest, and the rule book says one source of truth per topic.
- The pattern (candidates, dry runs, a score, re-pick when a move ends) is already in Formation's planners.

What is worth sharing, later and as its own decision: core's point mass for the vertical. `flight.js` does not charge a height change's pull as G, which is why the vertical looked free in the V2.71 trial and why the lag roll keeps its own pose track. "Height as energy" is on `future.md`; it is the one place Fight Sim's model is the better tool. Not part of the chooser.

**Section 5 of `../fable-compiled.md`, checked** (the suspected faults in Fight Sim's pursuit; the Fight Sim thread owns the file, this is a reading only; the note is `fight-sim-pursuit-check.md` beside this file):

| Suspected | Found | Verdict |
|---|---|---|
| Chases every step | `controlPursuit` re-aims the lift every step through `liftTowardAim`, with G onset and roll rate limits in `smoothing.js` | True, and right for a gunsight tracking a target. Not the Formation fault (a long move flown by a tracker) |
| Closure read as range rate instead of overtake | `tacticalAimCalculation` works out closure as range rate, but uses it only to blend lag, pure and lead aim points. The chase never commands a speed: the throttle is full in every pursuit step | Not the Formation fault. No speed is set from it |
| High-G turns cost no speed | `stepPointMass` takes `excessFnFor(throttle)`, which is thrust minus `dragPerWeight(kias, alt, g)` at the G flown | False. Energy is charged. It is Formation's `flight.js` that charges no G for speed |

So nothing in Fight Sim needs porting or fixing for the chooser.

## 7. How it works, step by step

1. **One candidate shape**, returned by every planner: the plans for both aircraft; `durationSec`; the checks it passed (behind 3/9, floors, G rule, bubble, in band); `maxBankDeg`, `minKias`; a smoothness count; and the words for the card. Most planners already return most of this (`planTurningRejoin` returns `laneFwdFt`, `maxBankDeg`, `judged`, `endSec`). The wrap is small.
2. **`chooser.js`** (new, in `src/modules/turn-sim/live/`): given the aircraft, the target formation and the options, call each planner that applies, collect the candidates, drop the failures, sort by (checks, duration, smoothness), return the winner with a one-line comparison for the note. `formation.js` `startChange` calls it in place of the chain.
3. **Re-pick points**: the press; the hand-over (exists); the decision point; a queued press when a move ends; a live check failing. Never a timer, never each step. A re-pick from mid-move starts from the aircraft as they are and the rest of Lead's plan.
4. **Cost** (a guess): a turning rejoin press already runs up to a few dozen dry runs of up to three minutes each and finishes in well under a second on a PC; the scoreboard adds the straight-ahead rejoin and the line beside it, a handful more. Fine at a press and at decision points. A per-step chooser would not be, which is one more reason not to build one.
5. **What the screen shows**: nothing new. The card's note names the winner and what it beat. The drawn line ahead is the current plan.

## 8. Who builds what (the ticket rule, AGENTS.md)

- **Fable, now:** this plan. Then, with your yes and the coordinator told first so the Formation thread holds `formation.js`: the candidate shape and `chooser.js`, with the chain in `formation.js` switched over. One pull request, no test, a few troubleshooting dry runs.
- **Opus (Formation thread):** wrapping each planner's return in the candidate shape; the smoothness count; Phase B's live check and re-plan; later the 4-ship.
- **Sonnet:** the spec section, decision TS-76 (wording confirmed with you first), this plan's home in `docs/modules/turn-sim/`, the card wording.
- **Fight Sim thread:** nothing to build. `fight-sim-pursuit-check.md` is for them to read.

## 9. Questions for you (one at a time, on cards)

Each has a working answer the plan uses until you answer.

1. **What "best" means.** Working answer: pass the pilot's checks, then quickest, then smoothest.
2. **Planned with re-plans at decision points, or live.** Working answer: decision points (your 4 Oct ruling).
3. **Scope first.** Working answer: the 2-ship changes (rejoins, out to fighting wing, the lag roll), then fighting wing and fluid's "picture breaks" only, the 4-ship later.
4. **How often it may re-pick.** Working answer: at the press, at each decision point, and when the picture breaks. Never on a timer.

## 10. What is unchecked or unseen

- Nothing was run on screen or in a dry run. The cost figures in section 7 are guesses from the loop counts in the code.
- `fluid.js`, `fluid-wing.js`, `fluid-lead.js`, `four-ship-moves.js` and `kinematic.js` were skimmed, not read line by line.
- Whether `kinematic.js` still reads a closure as range rate (the review's open note, `../fable-compiled.md` section 3) is still unchecked; it does not change this plan.
- The manual text was read from the project files' text extract for the page references only (SMM 12.24 paras 54-59, 12.27 paras 64-66, 12.29 para 69, 16.17 paras 42-46). No manual text is in this file.

## 11. Patrick's rulings, 5 Oct 19:51Z (after options.md)

- **Change the plan mid-change:** yes. "I want to be able to 'change the plan' mid change and have the wingman react correctly." R10 means: a new button pressed, a new formation command. (Not a stick-flown Lead; not errors mid-move for now.) So: Option 2, with a press mid-move as an event. F1 and F11 are reworded (wording card 19:55Z).
- **The vertical is a candidate** (R4): "Formation can use the vertical, if it scores high enough in our model. For example, the aircraft should dive away at max power to get to line abreast from echelon faster." Consequence: the vertical goes into the candidate lists (a dive-away at MAX for echelon to line abreast; the high early line in a hot rejoin), and the model must charge the pull-out so it scores honestly. `flight.js` charges a dive's speed gain (the planners' `climbKtps`) but not the G of the pull; without that charge the vertical would win falsely. So "height as energy" (future.md) moves up: it is a precondition for scoring the vertical, built right after the scoreboard. Opus, flight code.
- **Echelon turn fault (new):** "when in echelon the aircraft falls well outside of position and then corrects on roll out. The aircraft should use bank and pitch and roll to stay in position as lead flies in echelon, from any close formation position." Read of the code (`formation-turns.js` `planCloseTurn`): the close turn is a kinematic line. #2's place is fixed in Lead's wing plane, the plane lagged behind Lead's roll (`planeLagSec`), and the line is followed into with a blend (`closeBlendSec`); his bank and roll are copied from Lead's, not taken from his own path. On the outside of the turn his own path needs more bank and speed than Lead's, so copying Lead's bank and blending the follow leaves him drifting outside, and `settleLast` brings him home at the end. A guess until a dry run shows it. The fix is the "holding" row of the matrix: fly #2's path from the geometry of the slot in Lead's real wing plane every step, bank from his own path, speed from his own radius, with the roll lag only for the roll itself. Formation thread (Opus), one file, before or beside the scoreboard. Not part of the chooser.
- **Cards 3 and 4 answered by "I agree on the matrix and the options":** scope = the 2-ship changes first, the close-formation turn fault beside them, the 4-ship later; re-pick = at the press (now, not queued), the hand-over, the decision point, and when the picture breaks.
- **What is left before building:** only the exact wording of F1 and F11 (the card). The scoreboard (Option 1) starts now.

## 12. Built (5 Oct 20:05Z)

PR #455 merged: Formation Sim V2.75, TS-76. `live/chooser.js` and the switch in `formation.js`; spec section 10.13, F1 and F11 reworded; decisions TS-76; `future.md` Live wingman toggle superseded. Dry runs: every pick as the fixed order gave; `auto` races both rejoins. Owed to the Formation thread (Opus): the `auto` menu entry, the event re-plans and the mid-move press, height as energy then the vertical as a candidate, and the echelon turn fault. Nothing seen on screen by Patrick yet.

## 13. The second piece: re-plan at events and the press mid-move (design, 5 Oct 20:40Z; Patrick 20:30Z "I do the re-plan only")

**What changes for the pilot.** A "Change formation" press while a change is still being flown re-plans now, from where both aircraft are (position, heading, speed, bank, roll rate, height), and the new plan flies at once. Nothing queues (F11 as reworded). The card shows the new plan and its comparison line as at any press. If no planner can make the new formation from where the pair is, the card says so and the move being flown carries on.

**What stays queued, for now.** A turn button, a manoeuvre, the lag roll, the 4-ship and fluid keep today's rule (flown after the current move) because their planners build Lead's path from scratch and would roll him out of a turn he is holding. Giving every planner "Lead's remaining plan" as an input is the next piece (owed, Opus; section 14).

**Where it goes (files).**
- `formation.js` `change()`: when the move being flown is a 2-ship change (not the lag roll, not the 4-ship), call `startChange` from the current state instead of queueing. On refusal, keep the current plan and put the reason on the card with the move's name. `pressFw` already does exactly this for Lead's fighting wing moves (TS-70), so the shape is proven.
- `turning-rejoin.js` and `straight-rejoin.js`: accept a start the classifier calls `other` when #2 is outside the close range (300 ft) and behind Lead's 3/9 line, with hot/cold read from his place against the rejoin line instead of from the formation name. Today both refuse `other`, so a press mid-rejoin would fall to the tracker alone (planGoTo treats `other` as line abreast: rejoin to fighting wing first). The line planner keeps refusing `other` (no line rule covers it: the tracker is right there).
- `chooser.js`: no change to the score. The fallback rule already handles a mid-move start (long move = more than 500 ft from the new slot).
- `index.js`: nothing. The frozen planned path is redrawn when `state.current` is a new object, which a re-plan makes.

**Events that re-plan after this piece:** the press (new), and the hand-over at the end of a line (already, `replanFor`). The decision point and "the picture breaking" are left as no-ops on purpose: with Lead on a planned path and #2 replaying, nothing diverges between the press's dry run and the flight, so a re-plan there would return the same plan. They become real when something can diverge (a stick-flown Lead, a training error mid-move); the hook is the same one `replanFor` uses.

**Checks (no tests, Patrick 09:08Z):** dry runs from the default start: press Echelon, then at 5, 15 and 30 s press Fighting wing, Route, Line abreast and Echelon on the other side; press Fighting wing then mid-way Echelon; press Line abreast from echelon then mid-way Fighting wing. Each must end IN POSITION and name the planner picked. Typecheck. Unseen on screen until Patrick flies it.

**Handover to Formation (Opus), after this merges:** (1) Lead's remaining plan as an input to every planner, so a turn button mid-change and a change mid-turn re-plan too; (2) the tracker's fighting wing legs ending at "in the cone" rather than the slot (Patrick 20:32Z: "get in the cone and stay there"); (3) height as energy, then vertical candidates; (4) the `auto` entry if not yet merged.

## 14. Formation thread handover (5 Oct 20:50Z)

**Merged:** V2.77 (#460) Auto rejoin, 2-ship only: both rejoins tried ahead, the quicker flown; a training error still flies the hot rejoin. V2.76 (#459) close turns hold position (TS-77). Main badge V2.77.

**Released to Fable:** formation.js, hand-over.js, turning-rejoin.js, straight-rejoin.js, live/chooser.js, lag-roll.js, tuning.js, transitions.js, kinematic-moves.js, tracker.js, fluid-panel.js, transitions-panel.js.

**Echelon turns, Patrick's words:**
- 20:28Z "Turns in eschelon are very slow. 2 needs to stay within 3-5 feet."
- 20:33Z "they are supposed to be slow for wingman's stability. thats how that formation works." Card 20:34Z: what feels slow is the **turn rate**, not the roll-in.
- Ruling (via coordinator): about 4-5 s to 60° of bank at 2 G.
- 20:50Z (chooser thread): "Eschelon turns are very slow and smooth. about 4-5 seconds to get to 60/2. Fithging wing, rejoins, tactical formations, line abreast etc is unrestricted (realistic) roll rates & aircraft handling. Escelon is smooth to allow 2 to stay in position in tight formation." So the slow, smooth roll applies to echelon (tight) turns only; every other formation and move keeps realistic roll rates.
- 20:48Z "Close this up now with a handover, fables work may fix this." Route, line astern and 4-ship turns: not now (20:36Z).

**Tuning findings (not merged; formation-turns.js and flight.js are at main):**
- In echelon (~45 ft out) Lead's roll acceleration α pushes #2 along Lead's lift line by α·l, plus ω²·l toward the roll axis. Rolling toward #2's side makes #2 unload; with #2 held at ≥0.3 G and never banking against Lead, α must stay ≲15°/s² (≈3.5 s to 45°, ≈4 s to 60°), which matches Patrick's 4-5 s. Rolling away from #2 can go ~30°/s².
- Working dry-run setting: Lead bank 60° (2 G), roll rate ≤45°/s building at 15°/s² both ways; #2 hold followG 1.0, min 0.3 G, bank offset up to 25° toward Lead's side, never against Lead's bank, onset 8 G/s. Result: echelon worst 2 ft (V2.76 ~7 ft), route 60/40 ft (V2.76 75), 4-ship #4 24-30 ft (V2.76 40). Turn ~16-17 s for 90°.
- Bug to avoid: separate roll-in and roll-out limits made Lead overshoot heading (211°) because out-limits were used while still rolling in; use out-limits only once the roll rate is heading back toward level.
- The brisk roll-in for turns away left #2 up to 4 ft and a brisk roll-out left 28 ft lateral; gentle both ways was cleanest.

**Mid-move press (F11) work set aside, in formation-handover/:** f11-wip.diff (formation.js midPress, chooser MID_PLANNERS/FROM_HERE, slideInPlane/heldPoses), f11-replan.js (nearestPlace, legsFromHere, planFromHere: Lead carries his move or holds his turn; Lead's speed change waits until #2 is in), mid*.mjs dry-run cases, sweep-close.mjs (close-turn sweep). Faults met: the line planner from a moving start jumped roll and pulled 7.7 G (excluded mid-move); a station change mid-turn jumped roll 297°/s (needs a starting roll rate); the lane failed when Lead slowed under #2. Use or drop as you see fit.

**Unseen on screen:** V2.77 Auto, all echelon numbers.

## 15. Built in V2.78 (#461, TS-78, 5 Oct 21:19Z) and the handover back to the Formation thread

Built: press mid-move re-plans (F11, replan.js); in band and steady finish (STEADY, STOP_KT); opening out to line abreast
in a full power dive, unrestricted (OPEN_OUT, Lead holds speed until #2 out: Patrick card 21:22Z "Done when in band" covers both); line abreast
finishes without waiting for Lead's speed-up (card pending, recommended "Done when in band"); echelon 2-ship turns 60°/2 G
in ~4 s (CLOSE_TURN.echelonBankDeg/echelonRoll), #2's roll limited (rollFrom); lag roll from echelon (closeTopRangeFt,
fluid panel). Timing table: spec 10.15.

Owed, for the Formation thread (Opus, flight code):
1. Turn buttons mid-change re-plan instead of queuing: every planner takes Lead's remaining plan.
2. Re-plans at the decision point and when the picture breaks (F1).
3. Height as energy (pull-out G costed), then vertical candidates in the chooser.
4. Tracker's fighting wing legs end "in the cone" (no fixed spot).
5. Route, line astern and 4-ship turns at the slow close roll (Patrick 20:50Z: not now).
6. Refactor (Patrick 21:06Z), its own PR, no flying change: one place for the two rate sets, holding close formation vs
   tactical/unrestricted (Patrick 21:11Z), now spread over KINEMATIC, OPEN_OUT, RUN_IN, CLOSE_TURN.
If Patrick's card answers "Wait for Lead" or "Lead at 220 first": formation.js inBandAndSteady (the lab line) and
OPEN_OUT.leadHolds.
Scratch sims used: legs.mjs, trace-lab.mjs, lag-ech.mjs, mid.mjs (this session's scratchpad; copies below).
7. Line abreast stack band (Patrick 21:23Z: "LAB has a stack band as well, as per the SMM, doesnt have to be co altitude.
   most formations are like that"). Today the 2-ship judge checks line abreast for spacing, fore-aft and sweep only, no
   height, and the opening-out path climbs #2 back to Lead's height because that climb bleeds the dive's speed. To do:
   find the SMM page with the band (not found in the 16.18 text under "stack"/"feet"; the 4-ship's 300 ft steps are AFM8
   brief p.14-15), judge height against it, and let the opening out end inside the band instead of level. Ask Patrick the
   page if the search fails. Decision number from the coordinator (TS-80 or next free).

## 16. Tips for the Formation thread (Fable, 21:42Z, at Patrick's request)

- The T-6 has about 1 kt/s in hand at 220 KIAS at 8,000 ft (core curve: 1.6 at 200, 1.05 at 220, 0.5 at 240, 0 at ~255).
  A plan that needs #2 faster than Lead for long is fiction: geometry and height first, power last.
- Every planner draws a path then asks whether the aircraft can fly it (holdToPower). When a move looks slow, the path is
  asking for speed it cannot have: check line.stretched in a dry run before touching rates. Once STRETCHED, holdToPower
  caps #2 at Lead + HOLD.overtakeKias, which kills an opening out.
- Rate caps live in Lead's frame (relSpeedLimit). A cap meant for arrival (nearPerSec) also throttles departure from a close
  place; keep arrival and departure rates separate (OPEN_OUT does).
- Finish on the band, not the slot (TS-78, TS-80): the slot is the aim, the judge decides done.
- Dry runs over screenshots: chooser/sims/legs.mjs gives every change in one table in about a minute.
- Two failed fixes means trace, not tune: echelon to line abreast took four passes because the first three tuned numbers.
- Done since #461: V2.79 turn buttons mid-change (Formation), V2.80 bands (TS-80, #465).

## 17. Review of the Formation thread's V2.81 to V2.84 (Fable, 5 Oct 22:10Z, read-only)

Read on main (merge 5f30950) against the handover in section 15, then the troubleshooting sims in `sims/` re-run on main.

**Reads right.**
- V2.81 (TS-81) re-plans at the decision point only when the new plan ends sooner than the chooser's tie, and on a broken picture (100 ft off plan, the shared margin) whenever the new plan passes; the old plan is kept whole when the new one fails. The lag roll, training-error rejoins and the 4-ship are left out, as the handover said.
- V2.82 (TS-82) charges a height leg's pull or push as G the standard way (sideways share from the bank, vertical share from the leg's curvature, root-sum-square), and the rejoin planner already takes the climb's energy off the full-power acceleration (turning-rejoin.js line 150), so the vertical candidate is not a free climb. It is flown only when it is quicker by more than the tie and stays under the 5 G rule. One edge: a push past zero G while banked gives a negative total, fine for the wings-level push-over it was written for.
- V2.83 (TS-83) ends fighting wing legs anywhere in the cone through fwGoal. It adds an import of formation-turns.js into transitions.js while formation-turns.js imports transitions.js (a circle). It works because both only use the other inside functions; nothing to fix, but worth knowing before anyone adds a top-level use.
- V2.84 (TS-84) is the tidy-up only: RATE_SETS is the one home, every number the same as before.

**Sims on main (all IN POSITION).** legs: lab→echelon 43 s (was 49 at V2.80), lab→fw 24 (33), lab→route 44 (54), fw→echelon 23 (27), fw→route 25 (29), fw→lab 51 (48), echelon→fw 15, echelon→route 6, echelon→lab 60 (59), echelon→echelon 23, echelon→astern 19. mid: all 10 in position. lag roll from echelon both sides 21 s, from fighting wing 42 s.

**One fault for the Formation thread (its files).** mid case 6, lab→fw with line abreast pressed at 25 s: the chooser now picks "line, then tracker" (63 s against the tracker's 75; at V2.80 it picked "from here"), and in the line's first second #2's bank thrashes -5° → -56° → +42° → -37° (740°/s, the sim's roll-jump measure). The replayed bank track is not put through the roll limiter, so the planned thrash is flown. V2.80 had 174°/s on this case. Likely cause: the line's one-second blend (hand-over.js RUN_IN.blendSec) starts from #2's position but not his bank and turn rate, so the smoothest fit swings to catch the sideways velocity he has mid-turn. Fix belongs with the roll-ceiling work (performance-audit-5oct.md section 3): seed the blend from the bank and turn rate he has now, and have the ceiling apply to replayed tracks as well as to the planners, so a plan that asks more roll than the aircraft gives is stretched, not snapped.

**Pre-existing, not new.** Lead's roll-in of 144°/s in mid cases 1, 2, 6 and 8 (lab→echelon turning rejoin) was already there at V2.80; it is inside today's 180°/s and the core ceiling will cap it. lab→fw's 186 KIAS low point is unchanged from V2.80.

## 18. Refactor suggestions (Fable, 5 Oct 22:12Z, at Patrick's ask; for Formation's future.md until Patrick moves any up)

Sizes: src/modules/turn-sim/live is 11,900 lines in 32 files; tuning.js is 668 lines, 36 tables, 147 numbers marked "estimate"; spec.md is 1,085 lines, testing.md 522.

Code, in the order worth doing:
1. One envelope gate at the aircraft, not in each planner: roll rate, G and speed limits applied in flight.js stepAircraft to whatever is replayed (bankTrack, poseTrack, tracker), so no planner can fly what the aircraft can't (section 17's 740°/s). Goes with the core roll ceiling (performance-audit-5oct.md section 3).
2. Finish the one-candidate shape: every planner returns the same { plans, endSec, judged } and the chooser scores it. Lag roll, training-error rejoins (errors.js, 857 lines), hot-rejoin.js (766) and the 4-ship still sit outside; hot-rejoin and errors duplicate rejoin logic the turning rejoin and chooser now own. Retire or fold them after listing what each did (rule book, Building).
3. tuning.js split by rate set and by move family (close, tactical, rejoin, bands), keeping RATE_SETS as the one home; plus a generated numbers register (one line per number: value, source or "estimate") so the spec stops repeating them.
4. formation.js (731): the press, re-plan and finish events out into one small events file; the state machine stays.

Docs:
5. spec.md is a changelog shaped like a spec (a section per version: 10.8, 10.15, ...). Rewrite by topic: how #2 is planned, rejoins, lines, bands and "in position", rate sets, 4-ship; each paragraph cites its TS decision. History goes to decisions.md. Sonnet, after Patrick's fly-through of V2.75-V2.84 so the rewrite describes what he approved.
6. testing.md: keep only the current sign-off checklist; per-version sign-off lines move to archive/.
7. Project files: turn-sim-review has 30+ folders and parked patches. Condense fable-compiled.md, chooser/plan.md sections 15-18 and rulings-to-ratify.md into the repo README's "How #2 is planned now" (#472 started it), archive the rest.

Recommendation: 1 now with the ceiling PR; 5 next; the rest wait until the module is signed off, since a refactor before anything is seen on screen is where earlier work was lost (rule book, lesson 5).

## 19. Patrick's fly-through items (5 Oct, logged the same day; for Formation's plan.md)

1. 22:29Z "Fighting wing side swap should be fast, not slow like the corner to corner station change." Dry run on main V2.84 (scratch fwswap.mjs): fw right → left 58 s, left → right 45 s, 187-207 KIAS, 2 G; the chooser takes "line, then tracker" (66/54 s) and the tracker alone (49/45 s) is only a fallback. The line flies at the close set's 25 kt closure and KINEMATIC frame rates, though fighting wing is tactical (RATE_SETS.tactical, Patrick 21:11Z: unrestricted once tactical). Fix for Formation: the swap uses the tactical rate set and the opening-out style lateral law (OPEN_OUT), lag then lead across Lead's six with a little height, ending anywhere in the cone (TS-83); about 15-20 s is the geometry at 1,000-1,100 ft across (estimate). No new ruling needed, it applies his tactical rule.
2. 22:30Z "fluid manoeuvring should just move into position to begin, not start a turn yet. the 360 happens when we hit sequence." Today the Fluid button flies Lead's entry (fluid-lead.js entry: a 30° turn away from #2 while ready calls, then the chosen bank at MAX until #2 is blended into the fluid picture; source AFM7 brief p.17), and the Standard sequence button's first part is already the 360° level turn (sequenceParts; Patrick 01:03Z). Fix for Formation: the Fluid button keeps Lead straight and level at his speed while #2 moves from fighting wing into the fluid picture (cue 'lead', the blend), and the session then waits for a press; the 360 stays in the sequence. Both sources written down: AFM7 brief p.17's entry turn vs Patrick's practice; Patrick's word wins (AGENTS.md, flying numbers). Keep the 30° entry turn as a setting holding the old value, off by default.
3. 22:32Z "after fluid manoeuvring the planes seem to get stuck in that I can't rejoin." Dry run on main (scratch fluidstuck.mjs): while fluid runs, every Change formation is refused ("Terminate fluid manoeuvring first; it ends in fighting wing"); after Terminate it is refused again until Terminate has fully ended (about 35 s, #2 back in the cone), and a press during it is dropped, not queued. Only then does a change start (echelon in 21 s). Fix for Formation: a Change formation press during fluid or Terminate ends the session and re-plans the change from where the pair is (the chooser's from-here candidates; Lead flies on straight or in Terminate's gentle turn), per Patrick's rule that a mid-move press is an event (TS-78/79). No refusal, no queue.
4. 22:33Z "the fighting wing rejoin from line abreast should target the cone, not join to echelon then move to the cone." On main the turning rejoin to fighting wing aims straight at the cone (turning-rejoin.js tailLegs: rejoinTo(pairSlot('fw'))): default start, lab→fw right, in the cone at 24 s, closest 552 ft, never near echelon. Two ways it can look like join-then-move on screen: an older version on screen (badge below V2.84, no hard refresh), or Fighting wing pressed to the OPPOSITE side from #2's line abreast side, which rejoins to the cone on his own side and then flies the slow side swap (item 1). Asked Patrick which. Also found in that trace: #2 dips to 186 KIAS for about 9 s at 1,600-3,700 ft range, under the 200 KIAS rejoin rule (TS-75: below 200 only close in and hot); for Formation to check.
5. 22:35Z "on a turning rejoin that rejoins to the opposite side lead should keep turning until 2 is in echelon." Dry run on main (f2d0a41, scratch opp.mjs): lab right → echelon left: Lead holds 30° until #2 is at about route on the RIGHT (34 s), rolls out, and #2 then crosses under straight and level to echelon left, done at 75 s. lab right → fw left: Lead rolls out at 22 s with #2 about 420 ft behind-right, then #2 slides across behind Lead to the left cone over 40 s (the slow swap of item 1), done at 64 s; and #2 dips to 181-186 KIAS on the way (TS-75 again). This is what Patrick saw as item 4 ("join to echelon then move to the cone"). Fix for Formation: on an opposite-side turning rejoin Lead keeps his 30° turn (SMM 16.20 para 65b "holds it until #2 is in") while #2 flows through Lead's six, inside the turn, to echelon or the cone on the far side; Lead rolls out only when #2 is in. Same for fighting wing: cross to the far cone inside the turn. Plan it in Lead's turning frame (the held planner's own frame), not as rejoin-then-swap.
6. 22:36Z "'lag roll' is mixed in with the fluid manoeuvring buttons. the only buttons visible in any formation position should be the ones that can be actually USED from that formation." Today fluid-panel.js shows the Lag roll button inside the fluid group (V2.78 put it there with an echelon title). Screen rule for the module (Sonnet, screen work, with the docs rewrite or before it): every button shows only when it can be used from where the pair is now; the rest are hidden, not greyed. So: in fighting wing or echelon, #2's lag roll in its own small group ("#2" or "Wingman"); the fluid moves only once Fluid is running; Change formation only the formations reachable from here; the fluid Entry button only from fighting wing (Patrick 4 Oct 19:03Z). Goes in the spec's screen section with a picture of the screen, per the rule book.
   Update 22:38Z: V2.86 (#481) merged by Formation covers items 1, 2 and 3; items 4 and 5 are one fix, queued. The 186 KIAS dip in the fighting wing rejoin is by design (TS-75: fighting wing's least speed is what holds its place inside Lead's 30° turn, about 187 KIAS; the spec says so). Question for Patrick, after the ratify question: keep about 187 KIAS inside the turn (the geometry) or hold 200 KIAS as the floor everywhere (one-line change, against the geometry). Not yet asked.
7. 22:39Z "line abreast from echelon or fighting wing should start at FULL POWER and that will make it faster to get in position." Trace on main V2.86 (chooser/sims/trace-lab.mjs): it already does. From the press #2 is at MAX in the 400 ft dive: 197 → 206 KIAS at 5 s, 218 at 10 s, 229 at 25 s, which is the T-6's own full-power curve at 8,000 ft (core: about 1.6 kt/s at 200, 1 at 220, 0.5 at 240). fw→lab 43 s on V2.86 (51 at V2.84). What bounds it is the speed in hand: with about 1 kt/s to spare #2 can only hold about 25-30° off Lead's heading without falling behind the 3/9 line, so 6,000 ft across takes about 25-30 s plus the turn back and settle. Real gains left: (a) default spacing at the middle of the SMM band (5,000 ft) instead of its far edge (6,000), about 8 s quicker: Patrick's call (question queued after the ratify and 187 KIAS ones); (b) end once in band even while still sliding out, with the settle inside the band (the "steady" part of done); (c) nothing else without more thrust than the aircraft has.
8. 22:41Z Echelon turns look good (TS-77/78 ticked). The vertical "doesn't happen" on screen; "FW rejoins should always just target the cone." Dry run on V2.86 (scratch vert.mjs): the engine does fly it on every line abreast to fighting wing rejoin, both sides, Instructor and Student: +264 ft at 5 s, +500 ft at 10 s, level by 20 s, then 60 ft low in the cone (same side 24 s, far side 64 s). So on screen it is a display matter (the 2D view shows no height; the 3D view and the tag should) unless Patrick wants it gone. Asked him: keep / drop (fighting wing rejoins level, straight to the cone) / only when the level path would overshoot. Pending his answer.
   22:43Z Patrick: KEEP the vertical ("Keep it. It is about 4 s quicker and is only flown when it scores quicker"). TS-82 stands. Display: make the pop-up visible in 2D (height in the tag or a shadow), for the screen list.
9. 22:43Z Patrick's screenshot: echelon left → line abreast left, #2 at 196 KIAS "TQ 25% + BOARDS" early in the move. Reproduced on V2.86 (scratch echlab.mjs), both sides: the chooser takes "line, then tracker" (77 s scored, flown 60 s); for the first 10 s #2 is at 9-29% torque with the boards out from 2 to 4 s, slowing 199 → 192 KIAS, and full power arrives only at about 15-20 s. The note promises "a full power dive", so the words and the flying disagree. Cause (Fable's own V2.78 line, so this is mine to own): the opening out is a kinematic line whose speed is back-computed from the planned geometry; its first leg (kinematic-moves.js lab points: out 110 ft and down 40, then fwd -200 at 500 ft out) moves #2 aft in Lead's frame, which the back-computation turns into power off and boards, while the lateral rate near Lead is small (gain × √range) so the dive has nothing to feed. Fix for Formation (Opus): plan the opening out as a held-command planner like the rejoins, not a line: MAX from the press, the 400 ft dive, bank away to the angle off that full power allows (about 30°), fall back by geometry only, climb back and settle in the band; or at least seed the line's first leg with #2 at MAX and his speed rising (no aft move at constant lateral). Fable's lesson 4 (fly like a pilot) applies to its own line.
10. 22:45Z RULING (Patrick "yes" to the wording, 22:45:56Z): "On a turning rejoin to fighting wing, #2 never slows below 200 KIAS. Where the place inside Lead's turn needs less speed than that, he keeps the extra as height and climbs into the cone instead of slowing." And the general principle, his words: "they can do that all the time. that's why fighting wing is nice. energy can be managed with the cone." So in fighting wing, at any time, #2 manages energy with height in the cone (speed in hand becomes height, height becomes speed) rather than with the throttle alone. For Formation: decision TS-87 (or next free) with both lines; the turning rejoin's floor (TURNING_REJOIN leastKias for fw) becomes 200 with the surplus flown as a climb into the cone; and the fighting wing follow/fluid logic may use cone height as the energy store (full-power.js already does height-as-energy in fluid; extend to the cone). Goes in every Formation brief.
11. 22:46Z Patrick: default line abreast spacing 5,000 ft (the middle of the SMM 16.18 para 49 band), was 6,000. For Formation: the spacing default (the setup's spacing / FORMATIONS lab) and the docs; one small commit, the old value kept available in the spacing setting.
   22:48Z Patrick: the roll-rate and G-onset numbers in V2.85 are his agreed numbers ("I agreed on your numbers before"); source = Patrick's ruling 22:01Z/22:48Z, noted as Fable's estimate originally. No further number is awaited from him.

## 20. The 4-ship: what has to change, and when (Fable, 5 Oct 22:58Z, read-only, at Patrick's ask 22:50Z)

Read: four-ship.js (163 lines, Spread 4 start and its five turns), four-ship-moves.js (858 lines, the changes of formation through a from-to graph over the pre-chooser tracker legs), g-warm.js; design four-ship/design.md; TS-50, TS-54, TS-55. Dry run on main V2.87 (scratch four.mjs, Instructor rates, default start):

| Change | Time | Lowest KIAS | Max G | Max roll |
|---|---|---|---|---|
| Spread 4 → fighting wing | 164 s | 178 | 5.0 | 117°/s |
| fighting wing → finger | 86 s | 184 | 3.0 | 104 |
| finger → echelon → box → line astern → route → finger | 55 / 80 / 104 / 94 / 15 s | 189-200 | 2.0 | ~103 |
| finger → Spread 4 | 289 s | 154 | 12.2 | 120 |
| Spread 4 → Fluid 4 | 254 s | 178 | 5.0 | 117 |
| Fluid 4 → offset box | 140 s | 187 | 5.0 | 237 |
| offset box → Spread 4 | 366 s | 151 | 8.4 | 7,050°/s |
| Spread 4 → fighting wing (second time) | 291 s | 86 | 8.6 | 268 |
| fighting wing → echelon | 233 s | 170 | 5.1 | 116 |
| echelon → Spread 4 | 339 s | 154 | 12.1 | 122 |

Every change ends IN POSITION, but the numbers on the way are not the aircraft: 12 G, 86 KIAS, a 7,050°/s bank jump. The Spread 4 turn buttons (Delayed 90 52 s, Delayed 45 107 s, hook 16 s, check, in place) are fine: 220 KIAS, 3 G, roll 112°/s. A press mid-change queues (no re-plan) in the four.

**Why.** The four still flies the generation before the rejoin redesign: tracker legs and `legsFor` through a graph where everything goes via finger or fighting wing, no held-command planners, no TS-75 rejoin rule, no bands, no rate sets, no chooser, and its replayed tracks bypass the roll and G limits (the envelope gate, section 18 item 1). The gates ("wait for the one ahead", SMM 16.32 para 86, 16.34 paras 95-96) and the stack handling are right and worth keeping.

**What has to change.**
1. Rejoins from Spread 4, Fluid 4 and the offset box to fighting wing and finger: each wingman flies the 2-ship held turning rejoin (TS-75, cone energy TS-87) off its reference aircraft, in that aircraft's turning frame, with the join-order gates kept. Today 164-291 s and 86-178 KIAS; the 2-ship does it in 24-43 s.
2. Opening out to Spread 4 and into the offset box: the full-power opening out (section 19 item 9's held planner) per wingman off its reference, not the tracker. Today 289-366 s with 12 G.
3. The close changes (finger, echelon, box, line astern, route): shape right, 55-104 s; the close rate set with the cross-under gates. Modest gain.
4. A press mid-change re-plans (TS-78/79) in the four as in the pair.
5. The envelope gate applied to the four's replayed tracks (nothing above the aircraft's roll, G and speed).
6. Later (future.md already): manoeuvring inside Fluid 4 and the offset box, live fighting wing for the four, the 2134 order, errors for the four.

**When: after refactor items 1 and 2** (the envelope gate and the one-candidate shape). Once every 2-ship planner returns the same candidate, the four becomes "run the 2-ship planner per link, in the reference's frame, with the gates", which is the design's own idea (design section 4: each wingman flies off the aircraft it flies off). Doing it now would rebuild 858 lines on the machinery the refactor replaces, and it would be the second time. Spread 4 turns are usable now and need nothing. Estimate: three Opus PRs (rejoins; opening out; close changes and mid-press), one sign-off.

**References, checked against the slot table (slots.js slotsFor) and the design's sources (22:55Z ask).** Who flies off whom matches the design and Patrick's description:
- Spread 4: #2 and #3 off Lead, #4 off #3 (SMM 16.42 paras 113, 116, Fig 16.33). Stack #2 +300, #3 -300, #4 -600 (AFM8 brief p.14-15; the SMM lets #2 set it: future.md).
- Fluid 4: two elements line abreast, each in fighting wing: #3 6,000 ft abeam Lead, #2 fighting wing off Lead, #4 fighting wing off #3 (AFM8 brief p.20). Patrick's words 22:52Z exactly. Small thing: #3's abeam distance is a fixed number, not the Spacing setting.
- Offset box: #2 off Lead; #3 off Lead 7,000 ft back in the slot between Lead and #2; #4 off #3, outside #2 (SMM 16.41 paras 109-112, Figs 16.30-16.32; TS-18, TS-22).
- Fighting wing (4): a chain, #2 off Lead, #3 off #2, #4 off #3, #3 and #4 opposite #2 (SMM 16.38 paras 104-107; Patrick 11:44Z 4 Oct for the 650 ft / 45° and 30°).
- Finger, echelon, box, line astern, route: as SMM 16.23 para 73 and Fig 16.27 (#4 line astern on Lead in the box, SMM 16.32 para 91).
Manual pages are cited from the design and the code comments; I did not re-read the manuals myself. **The part that does not make sense is the moves, not the references:** the from-to graph (four-ship-moves.js EDGES, design section 6) routes almost everything through fighting wing, route and finger, so one press can be three or four legs (Spread 4 → box = via fighting wing, route, finger; echelon → Spread 4 = crossunder to finger, then open out), which is where the 300 s come from, and the moves themselves are the old tracker. The SMM rejoin (16.34 paras 95-96) goes to the formation called, in join order, with Lead turning; the command decides the picture, not a graph. So the 4-ship plan should start from Lead's calls: "fighting wing", "rejoin" (to finger or echelon, turning or straight), "Fluid 4, go", "offset box", "Spread 4", the station changes, each as one move with its gates, and the long chains dropped.

Recommended order: (a) now, read-only, Sonnet manual reader: a from-to table in Patrick's words from SMM ch 16 and the AFM7/AFM8 briefs, every move with its page and its join order, Patrick ratifies it; (b) after refactor items 1-2, Opus builds the four's moves on the 2-ship planners per link (section 20 items 1-5); (c) sign-off on the ratified table.

## 21. For the refactor plan (step 5): energy-aware fighting wing control (Patrick 23:02Z, routed 23:06Z)

Patrick 23:02Z: "Use the cone as required, power as a last resort. In fighting wing a common way to bleed energy is to S turn left and right if required." Folded into the refactor plan, not a fly-through fix. Order of control for #2 in every fighting wing move: 1 cone height (speed in hand as height, height back as speed); 2 position in the cone or S-turns to bleed energy; 3 power last. Today the shared fighting wing tracker (tracker.js / fwGoal) holds #2 with power alone; Formation's zoom-only try on the fighting wing rejoin was rolled back (30 s against 24 s, #2 still went to idle) because the tracker's speed loop pulls the throttle while he climbs. So the refactor's candidate shape needs an energy-managed fighting wing follower (the fluid full-power.js flyFluidStep already does height-as-energy with lag/lead for spacing: extend that shape to the cone), replacing the speed-loop tracker inside the cone. Goes in the step 5 plan as its own item, with TS-87.
