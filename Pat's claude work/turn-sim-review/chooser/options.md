# How #2 should be flown: the options, your requirements, and where they clash

Fable, 5 Oct 2026, for Patrick (asked 19:10Z: "explain our options and the structure of each option and the challenges / strengths / weaknesses / complexity of each, what you think my requirements are (and suggestions of what they SHOULD be). Maybe I have restrictions or limitations that are confusing"). Read-only; repo main `8ad75a3`. Line counts and times are guesses unless a file is named.

## 0. One fact that changes the picture

Formation's planners are already live pilots, run ahead of time. `turning-rejoin.js` `flyToDecision` is a step-by-step controller: each 0.05 s it reads where Lead and #2 are, commands a bank and a power, and steps the aircraft. The tracker (`tracker.js`) is the same. What makes them "planned" is only that they are run at the press on a copy, and the bank and speed they commanded are recorded and replayed by the real aircraft (`transitions.js` `flyStep`, the `bankTrack` segment). The search (which aim, which bank, which overtake) is the part that needs the dry runs. Fluid's #2 (`full-power.js` `flyFluidStep`) is the one piece already run live, every step, against Lead's planned line.

So "planned" versus "live" is not two pilots. It is one pilot, and the question is whether he is run ahead and replayed, or run as the aircraft flies, and how often the search is re-run.

## 1. The options

### Option 1. Scoreboard at the press (planned, as today, better chosen)

- **Structure:** the planners each return their best candidate in one shape; a new `chooser.js` drops the ones that fail the checks and flies the quickest. One plan per press, replayed. The 500 ft hand-over re-plan stays as it is.
- **Strengths:** smallest change. The line ahead is the line flown. Same presses, same picture. Nothing in the flying changes, only who wins when two planners both accept a case.
- **Weaknesses:** a change mid-move still waits: a press during a move is queued until the move ends (spec F11, TS-45). Nothing reacts if the picture goes wrong mid-move, though in still air with no disturbance the replay is exact, so today nothing can go wrong that the dry run didn't already show.
- **Complexity:** low. About 150 lines, one pull request, Fable can write it. A few troubleshooting dry runs, no test.

### Option 2. Re-plan at events (planned, re-thought when something happens)

- **Structure:** Option 1, plus an event list. At each event the chooser runs again from the aircraft exactly as they are (bank, roll rate, acceleration carried over, which `tracker.js` `init` and the planners' copies already do) and from the rest of Lead's plan (`hand-over.js` `replanFor` already does this for the tracker). Events: a press (now, not queued), the hand-over, the rejoin's decision point, a queued move starting, and the picture breaking (#2 out of the cone, ahead of Lead's 3/9 line, under a speed floor). The line ahead is redrawn at each event.
- **Strengths:** reacts to a change the moment it happens, and the drawn line stays true between events. Replays repeat. The judge, the training errors and all the planners work as they are. This is how a wingman re-assesses: at events, then a held technique until the next one.
- **Weaknesses:** it reacts only to events we name. Each planner must accept any start, mid-turn included; most do, but `turning-rejoin.js` plans Lead's turn-in from the press and must be given Lead's remaining plan instead. "Press mid-move re-plans now" replaces the queue, which changes what a second press means. Each event costs a burst of dry runs (well under a second on a PC, a guess).
- **Challenges:** defining "the picture breaks" without false alarms; a re-plan while #2 is at 60° of bank must start from that bank, not from wings level.
- **Complexity:** medium. Option 1 plus about 200 to 300 lines across `formation.js`, `turning-rejoin.js` and the event check. Two pull requests. Opus can build it from the plan.

### Option 3. The same pilot run live (the controllers fly the real aircraft; the search runs at events)

- **Structure:** Option 2, but the chosen candidate's controller runs every step on the real aircraft instead of being recorded and replayed, as `flyFluidStep` already does for fluid. The search (chooser) still runs only at events. The line drawn ahead is the dry run of the chosen technique: a prediction, exact in still air with nothing unplanned, and redrawn at events.
- **Strengths:** handles things nobody named: a gust, an error injected mid-move, a Lead flown by hand on a stick in real time. If a stick-flown Lead is ever in the plan, this is the only option that works. Between events #2 still flies a held technique, so the chasing fault stays out.
- **Weaknesses:** the drawn line is a prediction. Replays repeat only while the inputs do (a stick-flown Lead never repeats). The planners must expose their step as a function (they are written as loops today; a refactor, not new maths). The roll-out judge needs "this piece has ended" defined for a controller that never records an end.
- **Challenges:** the refactor of each planner into "search" and "step" halves without changing what it flies. The drawn line's meaning on screen.
- **Complexity:** medium-high. Option 2 plus about 300 to 500 lines, mostly moving code, two or three pull requests. Needs Opus with the lessons file; each planner re-checked in dry runs against its V2.71 times.

### Option 4. Fight Sim's model and pilot in Formation (3D point mass, a steer-to-slot pilot, a look-ahead that picks techniques)

- **Structure:** replace `flight.js` with core's `stepPointMass` (G and bank commanded, drag charged at the G flown, true in the vertical). #2 flown by a pursuit-type controller aiming at a slot (`liftTowardAim`), techniques picked by a look-ahead on a copy of the formation, as `lookahead.js` does for the fight.
- **Strengths:** honest energy everywhere, the vertical included: the lag roll, a high yo-yo rejoin, loops at 1,000 ft, height as energy. One aircraft model for both modules one day.
- **Weaknesses:** throws away the model your F1 to F12 rulings were written for (eased bank at 90°/s, smooth height legs, speed by power stages, the same step for planning and flying). Every V2.x number re-tuned and re-checked. The steer-to-slot controller is the chasing tracker in 3D unless held techniques are built on top, which is the planner work again. The look-ahead's score (nose-on first) does not fit; a formation score is new work. Fight Sim's thread owns that code.
- **Complexity:** high. Most of the 11,000 lines in `live/` touched or retired. Weeks, several threads, and the one thing the rule book says to avoid (a swarm on numbers).

### Option 5. Port Fight Sim's look-ahead into core with a translator between the two models

- **Structure:** `lookahead.js` and the move pick move to `src/core`; a translator turns a `flight.js` aircraft into a point mass and back for each dry run.
- **Weaknesses:** two aircraft models, and a translator that lies at the edges (a height change that `flight.js` doesn't charge becomes a pull the point mass does). The score still doesn't fit. All cost, little gain: the pattern is already in Formation.
- **Complexity:** high for the translator, low payoff. Not recommended.

### At a glance

| | Reacts to a press mid-move | Reacts to things nobody named | Line ahead true | Replays repeat | Change to today's flying | Size (guess) |
|---|---|---|---|---|---|---|
| 1 Scoreboard at the press | no (queued) | no | yes | yes | none | 150 lines |
| 2 Re-plan at events | yes | no | yes, redrawn at events | yes | none in the techniques | +250 lines |
| 3 Same pilot run live | yes | yes | a prediction | while inputs repeat | none in the techniques; the code is restructured | +400 lines |
| 4 Fight Sim's model and pilot | yes | yes | a prediction | while inputs repeat | everything | most of `live/` |
| 5 Port the look-ahead with a translator | depends | no | a prediction | yes | the search only | high, little gain |

**Recommendation:** build 1, then 2, in that order; take 3 only when something unplanned exists in the tool (a stick-flown Lead, errors injected mid-move). 1 and 2 are on the way to 3, nothing is thrown away. 4 is a different project; 5 is not worth it.

## 2. Your requirements as I read them

From your words in the thread logs, the spec and the decisions. R10 is today's.

| # | Requirement (your words or close) | Where it comes from |
|---|---|---|
| R1 | Manoeuvres match the manual pictures; "a lot of advanced form is art" | 18:57Z 4 Oct; 05:21Z 5 Oct |
| R2 | Rejoins fast and effective like the SMM; never below 200 unless close in and hot; 220 up the line; slow at the decision point | 08:12Z, 17:29Z-17:55Z 5 Oct; TS-75 |
| R3 | Fighting wing uses the whole cone, high or low | 08:54Z, 08:58Z 5 Oct |
| R4 | Form uses geometry inside the aircraft's real speed and power; no impossible speed changes | 16:42Z 5 Oct |
| R5 | Every aircraft flies a pre-planned, kinematically accurate path worked out at the press; the line drawn ahead is the line flown | 08:53Z 4 Oct; spec F1 |
| R6 | Same presses, same picture, at any playback speed | spec F10 |
| R7 | A press mid-move is queued and flown when the current move ends | spec F11, TS-45 (your working answer) |
| R8 | The wingman is Planned across the board; Live is a future feature behind a setting | 18:03Z, 22:04Z 4 Oct; `future.md` |
| R9 | Keep it simple, get it to testing; no new tests; a few troubleshooting sims only | 03:49Z, 06:25Z, 09:08Z 5 Oct |
| R10 | An effective training aid for real formation flying, where things change mid-manoeuvre | 19:09Z today |
| R11 | Published limits are flags; only physical limits are walls | AGENTS.md; 00:47Z 4 Oct |
| R12 | Modules never import each other; Fight Sim owns how a fighter chases; one writer per file | AGENTS.md |

## 3. Where they clash, and what they should say

- **R10 against R5 and R7.** F1 as written ("worked out when a button is pressed") and F11 ("queued until the move ends") forbid a change mid-move. That is the clash behind your question, not a limitation of the code. **Suggested wording:** F1 becomes "every aircraft flies a planned, kinematically accurate path; the plan is worked out at the press and again at each event, from where the aircraft are then; the line drawn ahead is the current plan." F11 becomes "a press mid-move re-plans now from the banked state; nothing is queued." That is Option 2 and it keeps R6.
- **R8 "Planned versus Live as a setting".** Those words were coined on 4 Oct as two pilots with a toggle. Section 0 shows there is one pilot. **Suggestion:** drop the toggle idea. The one mode is "planned at events" (Option 2), and "run live" (Option 3) is a build step inside it, not a user setting.
- **R10 needs defining.** "Things change mid-manoeuvre" can mean three things with very different cost: (a) Lead (the instructor at the keyboard) presses something new mid-move; (b) an error is given to #2 mid-move; (c) Lead is flown by hand, continuously. **Suggestion:** (a) now (Option 2); (b) with the errors layer, also Option 2 since an error is an event; (c) only if you want a stick-flown Lead, and then Option 3. Say which you mean.
- **R2 and R1 against "most like the SMM" scoring.** You chose "checks, then quickest". Good: the manual picture lives in the candidates (the rejoin line, the cone), not in the score. No clash left.
- **R9 against a dry-run chooser.** None. The dry runs are the tool's own look-ahead, not tests. But R9 does rule out Option 4.
- **R12 against "use Fight Sim's AI".** Resolved by borrowing the pattern, not the code (`plan.md` section 6). The pattern is already in Formation. Nothing to move into core for the chooser.
- **R4 and "height as energy".** `flight.js` charges no G for a height change, so the vertical looks free. This is a real gap for R4 in the lag roll, rejoins using the vertical, and loops. It is its own decision (charge the pull in `flight.js`, or use core's point mass for the vertical only), not part of the chooser. **Suggestion:** keep it on `future.md` as "height as energy", and take it after the chooser.
- **One restriction that may be confusing you:** "the line drawn ahead is the line flown" was never a limit on reacting. It is a promise about honesty: what the student sees ahead is what will happen. Re-planning at events keeps that promise; re-picking every step breaks it. That is the whole difference between Options 2 and 3.

## 4. What I'd settle now, in order

1. What "things change mid-manoeuvre" means for the tool: (a), (b) or (c) above. Working answer: (a) and (b).
2. Reword F1 and F11 as in section 3 (exact wording to be confirmed with you before it goes in the spec).
3. Build Option 1 (Fable, after you say go), then Option 2 (Opus), then decide on Option 3 only when (c) is wanted.
4. Keep "height as energy" as the next flight decision after the chooser.

## 5. Unchecked

Nothing run. Line counts and times are guesses. `fluid-wing.js`, `fluid-lead.js`, `four-ship-moves.js` and `kinematic.js` skimmed only.

## 6. The matrix (Patrick 19:11Z: "would we have a different system for close in vs far away? how can we organise this? a matrix?")

Yes, and the split already exists in the code: far away is a held technique, close in is the tracker's hands, with the hand-over at about 500 ft (TS-65). Organised by phase:

| Phase | Range from the slot | Who flies #2 | How often he thinks | What makes him re-think (an event) |
|---|---|---|---|---|
| **Far: getting to the picture** | more than about 500 ft | one held technique picked by the search: the rejoin line (TRJ), the straight-ahead rejoin, the drop-back out to fighting wing, the lag roll, or a line | the search at events only; between events the technique's own controller (bank and power held, as a pilot flies it) | a press by Lead (a new formation, a turn, a move) while #2 is still moving; the decision point; the picture breaks (ahead of 3/9, under a floor, out of the cone) |
| **Close in: the last few hundred feet** | inside about 500 ft | the tracker: closed-loop hands, bank and speed toward the slot at the close-in rate | every step (it is a controller) | the hand-over (exists today); the picture breaks |
| **Holding, Lead manoeuvring** | in the slot or the cone | the tracker's goal phase (the cone, `fwGoal`), or fluid's energy-and-geometry pilot | every step | Lead's press; #2 leaves the cone; Terminate |

Answers to the four questions:

- **Decision points / re-plan at events?** Yes.
- **Does a formation change pressed while the last one is still flying count as an event?** Yes. That is the one change to today's rule (F11 queued it until the move ended). Any press, by Lead or on #2 (an error given mid-move), is an event.
- **Is there a place for live?** Yes: close in and holding, where #2 is already a controller run every step (recorded today, could run live tomorrow at small cost, as fluid's #2 already does). Far away, "live" would mean re-aiming every step on a long move, which is the chasing fault; there, the search runs at events and the technique is held.
- **Different systems for close in and far away?** Yes, as above, and it is one chooser with two kinds of candidate: far away it chooses a technique, close in it hands to the tracker. The hand-over range (500 ft, your 5 Oct 05:44Z "500 to 1,000 ft") is the one number that moves the line between them.
