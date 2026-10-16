# The live wingman as a control system: a plan to model it, analyse it and use the analysis (14 Oct 2026)

**What this is.** A plan, not the analysis. It says how we will model #2's control system accurately (every controller, what it senses and commands, how they interact, how they are tuned), how we will analyse it, and how the results will feed the fighting wing design choices and round 5's acceptance. Written by an Opus agent (high thinking) for the Formation Sim (module `turn-sim`), phase B, rung B5, at Patrick's request (14 Oct 2026: "it's a plan on how to accruately model control systems and functions and analyse them ... it will return a plan for us to action once we have the code reveiw and tidy finished"). The thread folds the tasks in section 8 into `docs/modules/turn-sim/plan.md` under B5, after T29t.

**Status.** Background until Patrick approves it (AGENTS.md: Patrick's words, then the rule book, then the plan and the module's folder). Nothing here changes how anything flies. Every number carries its source or is marked an estimate; the toy results in section 2 are a scratch check, not design values.

**Read against.** `formation-close-wingman-b2` at c141568f (V2.433); the tidy branch `formation-fighting-wing-tidy` at 8e575bc7, read only (its split of `fighting-wing.js`, the new `separation.js`, and `fighting-wing-code-history.md`). The architecture review half of T29t was not out when this was written.

**Words used here, explained once.**
- **Loop:** a controller that measures something, compares it with what it wants, and moves a control to close the gap (feedback).
- **Feed-forward:** a control movement made from what is seen coming (Lead's bank), before any error appears.
- **Crossover frequency:** how quickly a loop works, in radians per second; roughly, 1 ÷ crossover is the time scale it corrects on (0.1 rad/s is a 10 s loop).
- **Phase margin, gain margin:** how far a loop is from oscillating, in degrees of extra lag or in extra gain it could take.
- **Extra-delay margin:** how much more reaction delay a loop can take before it starts to chase (oscillate). Phase margin ÷ crossover.
- **Linearise:** treat the flying near one steady condition (a "trim point", such as a steady 60°/2 G turn) as a straight-line relationship, so the textbook tools apply.
- **Saturation:** a command at its limit (the 3.5 G cap, ±400 ft of offset, MAX).
- **Hysteresis:** a switch that turns on at one value and off at another, so it doesn't flicker; **dwell:** a minimum time a switch must stay put.
- **N² chart:** a square grid with the controllers on the diagonal; each off-diagonal cell says what one passes to another (a systems engineering tool, explained in 4.3).

---

## 1. The approach in a few lines

1. **One signal dictionary is the master.** Every controller, signal, unit, delay, limit, switch and arbitration rule is written once in a small data file. The block diagram, the N² chart and the bandwidth table are drawn from it by a script, and a check compares it with the gauge's traces, so the pictures can't drift from the code.
2. **Split the system into a linear core and a switching layer, and analyse each with its own tools.** The core (steering, the arc loop, the vertical, power) is linearised at four trim points and checked with python-control. The switching layer (jobs, pitch owners, the separation filter, the yo-yo, lag first, nose behind, idle and boards) is analysed by simulation: hysteresis against the ripple of the signal that trips it, describing functions, and the (s, d) phase plane in Lead's turn-centre frame.
3. **Measure in the real sim, not only on paper.** A small injection hook and a scripted-Lead rig let us put steps and frequency sweeps into the running technique and read each loop's response and margins, the way flight-test engineers do.
4. **Score each candidate structure the same way before building it** (through the aircraft only; cross-feeds; one intent handed down in Patrick's order; a short predictive planner), on the same rig and criteria: owners per control, margins, interaction, switch counts, tuning count, and the gauge cases.

**What the scratch check already says** (section 2.3): on paper every fighting wing loop has more than a second of extra-delay margin, yet the gauge measures about 0.1 s in the full sim (plan.md T29, round 4). So the fragility is almost certainly in the switching layer and the hand-offs between controllers, not in the gains of the loops. That points the analysis effort at sections 4.6 and 5.5.

---

## 2. What the code is, checked against the thread's model

### 2.1 The layers

Both techniques share one frame (spec 7b.2, 7e.7): **perception** (what #2 sees, late) → **supervisor** (which job) → **technique** (the loops) → **allocation** (how the loops' asks are combined into one lift vector and one power ask, within the G cap) → **shaper** (the hand; close formation only) → **aircraft** (`stepLead`: G onset, roll rate, the engine, and an inner speed hold) → back to perception.

The thread's inventory (its brief, and the coordinator's added context A-E) is right in outline. Reading the code adds these points, each of which changes how the model must be built.

### 2.2 Findings from reading the code (what the model must capture)

| # | Finding | Where (concept, not line) | Why it matters to the analysis |
|---|---|---|---|
| R1 | **The delay sits in different places in the two techniques.** Close formation delays the whole relative picture 0.3 s: his deviation is read from Lead and himself as they were (`perception.js` `perceive`). Fighting wing, with dead-reckoning (always on since the tidy), delays only Lead 0.4 s, then carries him forward round his turn; #2's own position and velocity are used as they are now (`leadNowOf`). | perception; the fighting wing "now" | In the textbook pilot model the delay is inside the loop (spec 7b.6b). In fighting wing most of the delay is on the reference (Lead), not in the loop, so the loops look far more robust than a pilot with 0.4 s would be. `FW_SEE.extraDelaySec` adds delay to Lead's picture that his dead-reckoning doesn't know about: that measures how wrong a prediction he tolerates, which is a different thing from the classical delay margin. Both must be measured and named apart (method M3). Which one is right for a pilot is Patrick's question Q1. |
| R2 | **"Closure" is two different signals.** In a turn the arc loop, power's "off while closing", the brakes and the yo-yo use the arc closure from velocities, now (no smoothing). The pass line (500 ft + 1.4 s × closure) and the guard use the slant closure, smoothed about 1 s and 0.4 s late (`FW_SEE.closureSec`, SMM 12.2 para 5). The brakes use both: one to trip, the other for "where". | arcRange; separation filter; powerFor | Same word, different timing. Switches tripped by one and released by the other are prime flicker suspects. The dictionary gives each its own name. |
| R3 | **The aim line's "feed-forward" turn is partly feedback.** Steering feeds forward the turn of the line from #2 to his aim point. That line turns because Lead moves, but also because #2 moves, so the term carries #2's own motion back into his command (as proportional navigation does). Round 4 had to cap it (`aimTurnCap`) when aim changes made it jump. | steerToAim | It must be inside the steering loop's model, not treated as an outside input. Every "feed-forward" in the dictionary gets a column: true feed-forward (depends only on Lead) or hidden feedback. |
| R4 | **Power is a cascade of three.** Fighting wing's outer law sets a wanted speed (Lead's plus the arc term plus a slow integral); `stepLead`'s speed hold turns that into a throttle at 0.2 kt/s per knot off, at most 3 kt/s, with the drag of his present G fed forward (`fluid-lead.js` `holdThrottle`, `LEAD.speedHold`, estimates); then the engine (0.25 s; 3.5 s from idle, `handling.js` ENGINE, TS-218). The inner hold's numbers are Lead's, shared. | powerFor → holdThrottle → engine | The power loop's speed (Fable F6: under 0.07 rad/s) can only be checked with all three in the model. The inner 5 s speed hold is the same speed as the outer loop it serves, which the textbook (nest 3-5 times apart) warns against. |
| R5 | **In a turn the arc error has two owners at once.** The arc loop moves the offset inside Lead's circle (wanted closure = arc error ÷ 10 s), and power works on the same arc error at 15 s (`powerArcSec`). T29a's "one owner for closure" holds for power's integral, not its proportional part. | aimInTurn; powerFor | Two paths on one error add: the scratch check gives 0.10 rad/s for the aim alone, 0.06 for power alone and 0.15 together. Not unstable, but it is a shared cell with no stated rule, and the history note shows it was tuned around (`speedFf`). |
| R6 | **The allocation is a priority rule, and it favours the vertical.** The lift is "what holds him up" (1 G plus the vertical's ask) first; the turn gives way when the total passes the cap (`liftWithin`). The separation filter replaces the steering's turn when it acts, so the steering loop is open then. Unload-roll-pull trims the lift again while rolling. | gCap; liftWithin | At the 3.5 G cap, which every academic turn reaches (round 4 gauge), the vertical outranks the geometry: the reverse of Patrick's order (geometry first, then the vertical, then power; TS-233). The analysis must show who loses at the cap and how often. |
| R7 | **The three phases exist only as labels.** The entry case (into or away; in position, stretched or tight) is classified but nothing flies by it (history note, "Left as they are"). | fwJob | Patrick's three-phase framing (TS-233) has no home in the code yet. Any per-phase structure is new. |
| R8 | **Two predictors with different models.** The guard predicts from his seen (0.4 s old) state holding his turn; the filter from his state now, with the capture and the vertical counted. | fwGuard; separationFilter | Two judges of the same pass can disagree near the line. The switching map (4.6) shows whether they do. |
| R9 | **Cross-links between switches.** Power's state ("power back") is one of the yo-yo's triggers; the filter's state (wing line out of reach, its hold) triggers the nose-behind, pass-clear and power off. | highYoYo; ownerWanted; powerFor | These are controller-to-controller links that bypass the aircraft: the N² chart's off-diagonal cells, and the likeliest places for chains of switches (one trips the next). |
| R10 | **Close formation already does the cross-feed pattern.** One lift vector, feed-forward doing most of the work (his place's motion, Lead's bank and G dead-reckoned, `holdingTorque`, `powerLeadPct`), three PID axes through core `pilotAxis`, one law for every station (spec 7b.6c-d). | close-formation.js | The reference design: the same artefacts are drawn for it first, so the method is proven on a design Patrick has flown and approved. |

### 2.3 What the scratch check showed (run 14 Oct 2026; toy models, estimates only)

A throwaway python-control script (pinned kit, 0.10.2) linearised each fighting wing loop by hand at 200 KIAS, 8,000 ft (about 380 ft/s true) and Lead at 60°/2 G (radius about 2,590 ft, `fable-cone-turn-report-14oct.md`), with today's `FW_WING` gains. The delay was put inside the whole loop (the classical way) to compare with close formation.

| Loop (toy) | Crossover | Phase margin | Extra-delay margin | Note |
|---|---|---|---|---|
| Close formation plane axis, 0.3 s (check of the method) | 2.0 rad/s | 37° | 0.32 s | Matches spec 7b.6c's "about 37°": the method reproduces a documented result |
| Integrator plus 0.4 s at 1.0 / 1.25 / 2.0 rad/s | - | 67° / 61° / 44° | - | Matches `formation-control-research-14oct.md` §5 exactly |
| Steering (0.05 G/deg, 3 s look-ahead), 0.5 s bank and G build, 0.4 s in the loop | 0.34 rad/s | 28° | 1.45 s | Fable F6's 0.3 rad/s confirmed; the margin is the thinnest of the four |
| Arc loop with the feed-forward (kc 0.5), 0.4 s | 0.10 rad/s | 77° | 13.6 s | Fable's 0.1 rad/s; full closure delivered |
| Arc loop without it (the half-gain trap) | 0.05 rad/s | 85° | 30 s | Delivers half the wanted closure, as the research found |
| Vertical PD, 0.25 s G build, 0.4 s | 0.68 rad/s | 45° | 1.15 s | Natural frequency 0.40 rad/s, damping 0.8, as Fable F6 |
| Arc error through aim and power together | 0.15 rad/s | 66° | 7.9 s | The two owners of R5 add |

So the linear loops are slow and well clear of the 0.4 s. The measured 0.1 s in the full sim (plan.md T29, round 4: "the delay margin into in position about 0.1 s, under the 0.2 s target") must come from what the toy leaves out: the switches and their thresholds, the saturations, the filter's turn search, and the hand-offs between them. Untested: the toy's steering model is a simplification (a cross-track loop to a straight path, no roll-rate limit), and no toy result has been checked against the sim yet; that check is task CA5.

---

## 3. What to model, and at what fidelity

### 3.1 The signals (the dictionary's rows)

Each row: name, meaning in flying words, unit, frame, who writes it, who reads it, how late it is (none, Lead-only 0.4 s, whole picture 0.3 or 0.4 s), how it is smoothed, and its source (code concept, manual page or Patrick's ruling).

- **Seen cues (perception):** slant range (ft), slant closure (ft/s, + closing), line of sight rate (°/s), aspect and HCA (°), sweep (°), height against Lead (ft), Lead's bank (°), Lead's G, Lead's turn rate (rad/s), radius (ft) and centre, all as seen (SMM 12.2 paras 4-9; spec 7e.3b).
- **Derived states:** arc behind Lead round his circle s (ft), offset inside his circle d (ft), arc closure (ft/s), the station-holding offset d_ss = R(1 − V2/V_L) (ft), the shortfall against Lead's speed (kt, indicated).
- **Commands:** wanted closure (ft/s), offset (ft), aim point (ft, Lead's frame), the in-plane turn ask (G), the vertical ask (G), total lift (G vector), roll rate (°/s), wanted speed (KIAS), throttle (share), torque (%), idle, boards.
- **Discrete states:** job (swept, turning, S-turns, low inside, quick fix), entry case, pitch owner (pass-clear, in and down, yo-yo up and down, stack family), filter engaged, filter side, filter hold, lag-first timer, nose-behind, wing line out of reach, power back, idle, boards.
- **The aircraft:** speed (KIAS and true named apart, AGENTS.md), G, bank, roll rate, flight path, torque, energy height.

Close formation gets the same treatment (its rows are fewer: three axes, the station-change pace cascade, the supervisor's jobs).

### 3.2 The delay, exactly

The dictionary records for every signal which delay it carries (R1). Three delay models are built into the analysis, so Patrick's answer to Q1 can be applied without redoing the work:
- **D-Lead:** Lead's picture 0.4 s late, dead-reckoned; #2's own state now (fighting wing today).
- **D-Picture:** the whole relative picture 0.4 s late (close formation's way, McRuer's model).
- **D-Split:** Lead's picture 0.4 s; #2's own motion as he feels it (G, roll) about 0.1-0.2 s (estimate; MIT 16.400's typical pilot delay of 0.1-0.25 s, spec 7b.6b), his position against Lead at the picture's 0.4 s.

### 3.3 What can be linearised, and where

**Trim points** (all at 200 KIAS and 8,000 ft, the formation's briefed speed, `slots.js`; Lead's turns per TS-65 and T29d):

| Trim | Lead | #2 | Loops that are linear here |
|---|---|---|---|
| T1 Straight and level, swept | Wings level | 625 ft at 45°, 50 ft low (TS-233) | Steering to the swept place, vertical, power |
| T2 Academic turn, on the circle | 60°/2 G steady (TS-65) | 650 ft of arc behind on Lead's circle (`arcTargetFt`, Patrick's 600-650 ft), 100 ft low at the end of a turn (TS-233) | Steering on the circle, the arc loop, vertical, power |
| T3 Inside and gaining | 60°/2 G | 380-430 ft inside, gaining 65-76 ft/s (research §1 item 1) | Only as an operating point for the relax manoeuvre; the gain itself is geometry |
| T4 Aggressive turn | 4 G (T29d, the training rules' Lead line) | On the circle | As T2, with the G cap and the shaker close |
| T5 Lead's roll-in | Rolling 0 to 60° (TS-209 / TS-222 rates) | In position | Not steady: analysed as frozen snapshots at 0°, 30° and 60° (frozen-time analysis), plus simulation |

**Linear at a trim point:** the steering law's angle and feed-forward, the arc loop between its limits, the vertical PD, power's outer and inner loops and the engine, perception's smoothing filters and delay, the G onset and roll response of `stepLead` (as first-order lags, values from `point-mass.js` and `rates.js`).

**Not linear, analysed by simulation and the tools in 4.6 and 5.5:** saturations (the G cap, ±400 ft offset, the 60 ft/s slew, ±25/60 ft/s wanted closure, MAX and idle, the 15 KIAS band); every switch with hysteresis; the separation filter (a turn search over 41 rates with bisection, against a pass line and a wing line; a predictor, not a gain); the jobs and pitch owners; unload-roll-pull; the cap allocation; the geometry of being inside Lead's circle (the closure ω·d is linear in d, but the cone, the 3/9 line and the 500 ft rule are boundaries).

---

## 4. The artefacts, and how they stay true to the code

The rule for all of them: they are keyed by concept and trace-column names, never by line numbers, so the tidy and later rounds move code without breaking them. Each is drawn from the dictionary, and checked against the running sim through the gauge's traces.

### 4.1 The signal dictionary (the master)

- **What:** one data file listing blocks (controllers, switches, perception, allocation, aircraft) and signals (section 3.1), with writer, readers, unit, delay, smoothing, limits, arbitration rule where several write one thing, and the trace column that shows it.
- **Notation:** plain JavaScript data (an ES module), readable by a non-developer as a table; the generated markdown is what people read.
- **Extraction:** by hand, from a checklist (every function the tidy named in `fighting-wing.js` and `separation.js`, every `FW_WING` / `FW_SEE` group, every field `stepLead` reads from the ask). The thread's T29t page is the first draft.
- **Check against the sim:** a script reads a gauge run's traces and confirms (a) every dictionary signal has a trace column and every column a dictionary row, and (b) every claimed writer actually moves its signal in some case, and nothing unclaimed does (needs T29r's per-term columns, 6.2).
- **Kept current:** the check is run by whoever changes a fighting wing or close formation file, as part of that piece of work (not a test, not CI). A failed check means the dictionary changes in the same piece of work (rule book: one source of truth).
- **Where:** proposed `tools/control-map/` (data, draw and check scripts; under `tools/`, no new top-level folder), with the generated pages in `docs/modules/turn-sim/control-model.md`. Spec 7e links to it; the spec says what is intended, the control model what is built and measured.

### 4.2 The block diagram

- **Notation:** two levels. Level 1, the layers of 2.1 for each technique, with the delay drawn where it really sits (R1) and the cross-links (R9). Level 2, one diagram per controller: what it senses, its law in one line (for example "wanted closure = (s − 650 ft) ÷ 10 s, within ±25 / ±60 ft/s"), its gains with sources, its limits, what it commands. Feed-forward drawn as dashed lines, hidden feedback (R3) marked as such.
- **Extraction:** generated as a plain SVG and a markdown outline from the dictionary by the draw script (no new library; the layout is a fixed set of rows: perception, supervisor, loops, allocation, aircraft).
- **Check:** the dictionary check above; plus one hand step response per loop in the rig (5.2) compared with the diagram's law.
- **Where:** generated into `control-model.md`; the thread's page (an Artifact) shows it to Patrick, with today's diagram and the review's recommended one side by side, as T29t's thread step asks.

### 4.3 The N² chart (and the resource matrix beside it)

An N² chart (Lano, TRW 1970s; the NASA Systems Engineering Handbook's interface tool) puts the elements on the diagonal; the cell in row A, column B says what A passes to B. A blank cell means no interface; conflicts show up where cells crowd. Sources: https://en.wikipedia.org/wiki/N2_chart (read: the definition, clockwise flow, use for finding conflicts); the NASA handbook https://www.nasa.gov/sites/default/files/atoms/files/nasa_systems_engineering_handbook_0.pdf (search summary only; its interface sections not read here).

Two views are drawn, because the question "who fights" has two halves:

1. **Controller to controller (the N² chart proper).** Diagonal: perception, jobs, arc loop, aim overrides (lag first, nose behind, job blend), steering, the vertical and its pitch owners, the yo-yo, the separation filter, the guard, allocation (cap, unload-roll-pull), power, brakes, the aircraft. Off-diagonal: the signal passed (from the dictionary). Cells that bypass the aircraft (R9) are highlighted.
2. **The resource matrix** (who writes and who reads each shared thing). Columns are the shared resources: in-plane turn G, vertical G, total G, roll, throttle, boards; and the shared signals: arc s, arc closure, slant, slant closure, Lead's bank, Lead's turn, height against Lead, speed against Lead. Rows are the controllers. Each column carries **one arbitration rule**: sum, priority (in what order), replace, blend (over how long), or min/max. **A column with two or more writers and no rule is a fight.** A column read by two switches with different timing (R2) is a flicker risk.

**Starting entries (from reading the code; to be checked and completed by CA1):**

| Shared resource | Writers today | Rule today |
|---|---|---|
| In-plane turn | steering (aim-line turn fed forward + P on the angle); the filter (replaces it); the cap (cuts it); unload-roll-pull | Replace, then priority at the cap (the turn gives way) |
| The aim point | the arc loop's offset (turn) or the swept place; lag first (blend over 1 s); nose behind (replaces); job change (blend 1.5 s); the guard (at once) | Override chain, implicit in the call order |
| Vertical G | the vertical PD on a height target owned by one pitch owner: pass-clear, in and down, yo-yo, stack family (low inside, quick fix, stack) | Priority with a 2 s dwell (Fable F9) |
| Throttle | power's wanted speed through `holdThrottle`; the filter's cut to 20% while closing; the yo-yo's way down; low inside at MAX; idle | Replace, by an if-chain |
| Arc error | the arc loop (offset) and power's proportional part | Sum, unstated (R5) |
| Closure (read) | arc loop, power, brakes, yo-yo (arc closure); pass line, guard, brakes' "where" (slant closure) | Two signals under one name (R2) |

**The history overlay.** Each item in `fighting-wing-code-history.md` (the tidy's note: rounds T28 to 4, the four removed options and the eighteen folded switches) is placed on the cell it acted on. Examples: `pathCaps` on aim → in-plane turn; `speedFf` on arc error → throttle; `behind.onCircle` on nose behind → aim point; `guard.engage.holdsPower` and `guard.offClosingOnly` on filter → throttle; `aimTurnCap` on aim → steering's feed-forward (R3); `yoyo.excessFtps` on closure → yo-yo; the brakes' raised thresholds on closure → boards; `guard.engage` (the label-only pass) on filter → job label. The count of history items per cell is a heat map: the cells that were tuned round and round are where the structure, not the gains, is wrong.

- **Extraction:** generated from the dictionary; the history overlay is a list in the dictionary (item, commit, cell, what it did, verdict), filled by hand once from the note.
- **Check:** runtime, from T29r's columns: for each writer in a column, the share of the resource it supplied, case by case. A writer that never moves its resource in any gauge case is either dead or untested.
- **Where:** `control-model.md` and the thread page.

### 4.4 The bandwidth and delay table

One row per loop, at each trim point: crossover, phase and gain margin, the two extra-delay margins (D-Picture, and Lead-only prediction error, R1), the separation ratio to the next loop in (Fable F6: 3-5 times), the share of time at a limit in the gauge cases, and where each number came from (linear model, identification from the sim, or the gauge's sweep). Built for close formation too, as the check of the method (its plane axis should read about 37°, spec 7b.6c).

- **Where:** results come back from the kit as small committed tables with a header naming the script, its inputs and the date (`tools/flight-design/README.md`), shown on the thread page.

### 4.5 The interaction measures

- **The relative gain array (RGA)** for the linear core at each trim point, at steady state and at each loop's crossover. In plain words: for each pairing of a control with what it corrects (bank with arc, G with height, power with speed), it compares how strongly that control moves its quantity with the other loops left alone against with them closed. Near 1, the pairing is clean; above 1, the other loops fight it ("fighting loops give slower control"); between 0 and 1 they help it more than expected; negative is the worst case, the loop's sign reverses when the others close. Sources: Skogestad's decentralized control lecture, https://folk.ntnu.no/skoge/presentation/OLD-2017-and-earlier/promatch-cybernetica-06/5decentralized.pdf, and Skogestad and Morari (1992), https://www.mic-journal.no/ABS/MIC-1992-2-3 (search summaries only); the textbook is Skogestad and Postlethwaite, *Multivariable Feedback Control* (not read here). Caveat: the RGA is a linear, steady-state-first tool; it says nothing about the switches.
- **Loop-closing sweeps** in the rig: close the loops one at a time in Patrick's order (geometry, then the vertical, then power) and watch each closed loop's crossover and margin move as the next is added. A move over about 30% (estimate) marks an interaction worth a cross-feed or a single owner.

### 4.6 The switching map

One row per discrete element (R7-R9; 3.1's discrete states): the signal that trips it and the one that releases it, the thresholds and the hysteresis band, the dwell, what it changes in the flying (which resource column), and three measured numbers from the gauge cases: how often it switches, the ripple of its trigger signal near the threshold (the signal's wobble from the loops underneath), and the ratio of the hysteresis band to that ripple. A band narrower than about twice the ripple (estimate) will chatter. A switch whose two sides fly the same command is a label, not a control (round 4's `guard.engage` moved the job count, not the flying: history note), and is listed for removal.

### 4.7 The phase plane in Lead's turn-centre frame

A picture of every turn case in the (s, d) plane: arc behind Lead across, offset inside his circle up. Overlaid: the ideal (650 ft of arc on his circle), the cone, Lead's 3/9 line, the 500 ft rule, the filter's pass line, the wing line, and the switch lines (lag-first window, yo-yo trigger, idle and boards). In this frame the root problem is visible at a glance: inside the circle at equal speed he gains at ω·d, 65-76 ft/s at 380-430 ft (research §1). Patrick's relax-to-capture (TS-233) is one curve on it: from about 470 ft inside, drifting out at 100-130 ft/s with 15-20° of lag, onto the circle in 4-5 s, having gained 100-150 ft of arc (the coordinator's context C, from Patrick's numbers). The plane shows directly which switch lines a trajectory crosses and in what order, which is how chains of switches are found. Drawn on the dev plot page (`tools/flight-plot/`) as an added view, from the trace columns `sFt` and `dFt` the code already writes.

### 4.8 The tuning ledger

The tidy's `numbers.md` rows for `FW_WING` and `CLOSE_WING`, with three added columns: the controller it belongs to (from the dictionary), its role (sets a loop's speed, a limit, a threshold, a schedule, a physical constant or a ruling), and which analysis result would set it. Counts by role go on the thread page. A threshold whose value can't be tied to a ripple measurement (4.6), a ruling or a manual page is a candidate to remove.

---

## 5. The methods, each runnable

### 5.1 M1: analytic linearisation (python-control, the pinned kit)

For each loop at each trim point (3.3), write its small-signal model from the dictionary's law: the steering's angle-to-turn gain and look-ahead, the arc loop's d = d_ss + c*/ω + kc(c* − c)/ω with the path follower's lag, the vertical PD, power's outer law, `holdThrottle`'s 0.2/s and the engine's 0.25 s; perception's 1 s and 0.5 s smoothing; `stepLead`'s G onset and roll response as first-order lags fitted to step responses of the real point mass (core `point-mass.js`, as `tools/flight-design/README.md` requires). Delay as a Padé approximation of order 6 in the place each delay model (3.2) puts it. Output: Bode and Nyquist data, margins, closed-loop step responses, RGA. **Validation before use:** each linear model's step response is compared with the rig's (5.2) for a small step; they must agree within the shared margins (±10 ft/s, ±100 ft, ±5°, ±0.5 G, TESTING.md) or the model is wrong, not the sim.

### 5.2 M2: identification from the running sim (injected test signals)

The flight-test way of getting a loop's real response: inject a known signal at a summing point inside the control law, record the signal going into the next block and the one coming back, and compute the broken-loop response L(jω) = −(returning) ÷ (going in) across frequency, with coherence to show where the reading is trustworthy. This is the CIFER method (US Army and NASA; Tischler): sweeps injected "as disturbance inputs at summing locations inside the control laws" give stability margins and disturbance rejection (https://gs.sjsu.edu/researchfoundation/resources/flight-control/cifer.php, https://oucampustest.sjsu.edu/researchfoundation/docs/AHS_2007_Downs.pdf; search summaries only).

- **Signals:** a step and a doublet (time domain, small), and a frequency sweep (a chirp, from about 0.02 to 2 rad/s over 60-120 s) or a sum of sines at chosen frequencies, at two sizes: small (to stay linear) and large (to see the saturations).
- **Injection points:** the wanted closure, the offset d, the steering angle, the in-plane turn ask, the vertical ask, the height target, the wanted speed, and Lead's bank (to measure the response to Lead, the feed-forward path).
- **Where it runs:** the scripted-Lead rig (6.2: Lead in a steady turn or straight, nothing else changing), so each run is short, repeatable and needs no session.
- **Maths:** SciPy's cross-spectral estimates (in the pinned kit) in a kit script; the flying data comes from the rig as JSON.

### 5.3 M3: margins with the delay in the loop

Three measurements, each reported in the table (4.4):
1. **Classical (linear):** phase margin ÷ crossover from M1 and M2, with the delay placed per model D-Picture.
2. **Prediction-error margin:** today's `FW_SEE.extraDelaySec` sweep (extra delay on Lead's picture only), 0 to 0.4 s in 0.05 s steps, in the eight gauge turn cases and straight and level: the extra delay at which range, bank or G starts a sustained oscillation, or a switch starts to chatter.
3. **Whole-picture margin in the full nonlinear sim:** the same sweep with the extra delay on the whole relative picture (needs the hook, 6.2). Also a gain sweep: each loop's gain scaled ×0.5, ×0.7, ×1.4, ×2 in turn, the scale at which a limit cycle starts being that loop's gain margin in the real system.

The target (research §5, a guess; Fable's cone report: keep the delay at least 0.6 s below the critical one for each loop) is at least 0.2 s of extra delay on the full sim, for both kinds. If the linear margins are large and the full-sim one small (as the scratch check suggests), the sweep runs again with switches frozen one at a time (each held in the state it is in most of the turn) to find which one eats the margin.

### 5.4 M4: interaction between loops

- RGA from M1 (4.5).
- Loop-closing sweeps in the rig (4.5).
- The runtime N² check (4.3): each resource's writers' shares over each case; any case where two writers push a resource opposite ways for more than about 1 s (estimate) is logged as a fight, with its time and the phase-plane position.
- Coupling through the allocation (R6): for each step at the cap, how much each ask was cut; the share of the turn the geometry lost to the vertical.

### 5.5 M5: the predictive filter, the switches and the saturations

- **Saturations:** for each limit, the share of each turn spent on it (from T29r's columns), and a describing function (the equivalent gain of a saturation for a signal of a given size) to see how much a loop's gain drops when it rides a limit, and so how much margin it loses or gains. A loop on its limit is a loop opened.
- **Switches with hysteresis:** the switching map (4.6), and for each switch that sits inside a loop, a describing-function check: a relay with hysteresis has an equivalent gain of size and lag set by the band; a limit cycle is predicted where the loop's response meets the negative inverse of that equivalent gain. Its frequency and size are compared with the gauge's job-switch rhythm. Sources: Lund University's FRTN05 nonlinear control lecture (describing functions: limit cycles at the intersections of G(iω) and −1/N(A); the relay's N(A) = 4H/πA), URL found but not readable (404) when fetched; the hysteresis relay's describing function and the delay's effect are standard results (from knowledge, to verify against Åström and Murray, *Feedback Systems*, free from https://fbswiki.org/wiki/index.php/Main_Page; landing page read, chapters not). The method is a check, not a proof: it is approximate, worst with delays, and a simulation always confirms it.
- **The separation filter:** treated as a safety supervisor, not a gain. Four measures: (1) its authority share, the fraction of each turn it is engaged and the size of its change (`omPickDps` against `omNomDps`, already traced); (2) its local gain when active, the change of its chosen turn for a small change of the predicted pass, by finite difference in the rig, which shows whether it acts like a stiff relay or a smooth boundary-follower; (3) its predictor checked against the closed form for two constant-turn aircraft (Squires et al. 2021, arXiv:1906.03771, as summarised in `formation-control-research-14oct.md` §3.1), which also shows the 5.4 s window's edge effects; (4) its agreement with the guard's prediction (R8). Patrick's "a guard rail, not the pilot" (TS-233) becomes a measured number: the share of an academic turn it flies.
- **Jobs and pitch owners:** transition counts and dwell times from the traces (which state follows which, how long each lasts), plotted on the phase plane.

### 5.6 M6: checking candidate structures before they are built

Each candidate is written as a small law in the rig (not in app code), run on the same eight turn cases, straight and level, and the T29d aggressive cases, and scored on the criteria of section 7. The candidates are the four the thread named (coordinator's context E), plus Patrick's techniques as tests each must pass:

| Candidate | What it is | What the analysis looks at |
|---|---|---|
| O1 Through the aircraft only | Today's loops, each seeing the others late | The baseline: N² fights, margins, switch counts |
| O2 Cross-feeds | Each command tells the others its cost: G calls power for its drag (`holdThrottle` already does this inner), bank calls pull to hold height (the lift's 1 G share already), a climb calls power, Lead's roll-in calls a power lead (close formation's `powerLeadPct`) | Which N² cells it turns from fights into feed-forwards; the RGA moving toward 1; margins unchanged or better |
| O3 One intent handed down in Patrick's order | The phase sets what's needed (close, open or hold; gain, keep or bleed energy); geometry takes all it can, the vertical takes the remainder, power the rest; one owner per resource | This is "daisy-chain" control allocation from aircraft flight control: a set priority order among controls, each later one supplying only what the earlier ones could not, the later ones at rest otherwise (described in https://arxiv.org/pdf/1903.10623 for a tiltwing UAV; constrained allocation surveyed in https://vtechworks.lib.vt.edu/handle/10919/28570; search summaries only). Known weakness: when an early control saturates the hand-down must be smooth, or it is a switch; so check the hand-down for bumps and chatter at the cap |
| O2 + O3 (the thread's lean) | Cross-feeds inside, one intent outside | Both of the above, and whether the tuning count falls |
| O4 A short predictive planner | G, bank and power chosen together a few seconds ahead (model predictive control), extending the filter's predictor | First offline in CasADi (pinned) as the best achievable: an upper bound on what any structure can do in each case. Built in app code only if O2 + O3 misses the criteria and the bound shows a planner would meet them |

**Patrick's techniques as checks every candidate is run against:**
- **Relax to capture** (TS-233, "inside Lead's circle and gaining"): from T3, does the candidate relax toward Lead's G, drift onto his circle and match his turn, in about the times Patrick gives (4-5 s from about 470 ft inside, 100-150 ft of arc gained; coordinator's context C)? Read on the phase plane.
- **Three phases with one aim, blended without bumps** (TS-233, coordinator's context D): the phase (from Lead's roll as #2 sees it) chooses the aim's geometry, the vertical target, the energy intent and perhaps gain schedules. Checks: (a) frozen-time margins at each phase's trim point, (b) the blend slow against the loops it feeds (blend time at least about 3 ÷ crossover of the slowest loop it retargets; estimate), (c) no step in any command at a phase change (largest one-step change of G, bank and throttle across each change, against the same step without the change).
- **Pull G, add power** unless bleeding on purpose (TS-233): in keep-energy phases, the throttle rises with G above Lead's; the filter's power cut is the counter-case (R5, plan.md T29 note).
- **Vertical first, below, from tight with Lead turning into him** (TS-233), and **the assertive vertical at the exit within the cone** (TS-233).

### 5.7 M7: beside recorded flying (a reference, never a test)

The Debrief's example four-ship (`Pat's claude work/formation-track-logs/README.md`; plan.md "Recorded formation flying"; Patrick: "this isnt perfect") gives distributions to compare each candidate's academic runs with: range (#2 mostly 500-1,000 ft), aspect (15-35°), height (mostly within 100-200 ft), and the wingman's peak G against the leaders' 1-2 G (about 2.9 G peaks, against the sim's 3.5 G cap every turn). Reported beside the criteria, never as a pass mark.

---

## 6. The tooling

### 6.1 What exists and is used as is

- `tools/flight-design/` (Python 3.10; CasADi 3.8.1, python-control 0.10.2, SciPy 1.15.3, pinned; results come back as small committed tables). A working environment exists in Patrick's main checkout; worktrees need it set up once (the README's two commands).
- `tools/formation-gauge.mjs` with `--only b5- --fw live --tag`, traces in `tmp/gauge`; the trace columns fighting wing already writes (job, aim, offset, the guard's and the filter's pass, closure wanted and had, s and d, pitch owner, the filter's turn against his aim's, the brakes).
- `tools/flight-plot/` (the plot page), `gauge-trace-compare.mjs` (the keep-unchanged check, already shown failing on a known-bad change by the tidy), `four-ship-probe.mjs`, the `b5-gauge-*.cjs` helpers.
- `FW_SEE.extraDelaySec`: the prediction-error delay sweep (R1).

### 6.2 Small additions proposed (each with its reason and its file; no new library)

| Addition | Reason | File (proposed) | Flying |
|---|---|---|---|
| **T29r's trace half, brought forward**: each loop's target, measured value and each term's share (feed-forward, P, I, D); per resource, what each writer asked and what it was granted after the cap; the arbitration winner; the energy intent | The N² runtime check, the allocation coupling (R6) and the saturation shares all need it | `live/wingman/fighting-wing.js`, `separation.js`, `close-formation.js` (trace objects only); the gauge's column list | Unchanged: traces identical apart from new columns (`gauge-trace-compare.mjs`) |
| **An injection hook**: an optional `probe` argument to the wingman's start, adding a signal (a function of time) at named summing points (3.1's commands), and an optional extra delay on #2's own state (D-Picture, D-Split) | M2 and M3 | `live/wingman/fighting-wing.js`, `perception.js`, `wingman.js` (one optional field each) | Default off; byte-identical traces |
| **A scripted-Lead rig**: flies one wingman technique against a scripted Lead (steady turn, roll-in, chirp in Lead's bank) on the real point mass and laws, without the session; writes JSON for the kit | Short, repeatable identification and candidate runs | `tools/fw-rig.mjs` (beside the gauge) | Reads app code only |
| **Kit scripts**: linear models, margins, RGA, describing functions; identification from rig JSON | M1, M2, M4, M5 | `tools/flight-design/fw_loops.py`, `fw_ident.py`; results as committed tables `tools/flight-design/results/` | Offline only |
| **The control map**: the dictionary, the draw script (N² chart, resource matrix and block diagram as markdown and plain SVG) and the check against a gauge run | 4.1-4.3 | `tools/control-map/signals.mjs`, `draw.mjs`, `check.mjs`; output `docs/modules/turn-sim/control-model.md` | None |
| **Gauge counts**: per resource, how often its winner changes; per loop, time at a limit; per switch, count and dwell; `--extra-delay` and `--delay-mode lead|picture` flags in place of editing `FW_SEE` | M3, M5; the sweep run without editing a tuning table | `tools/formation-gauge.mjs` | None (measuring tool) |
| **Phase-plane view** on the plot page | 4.7 | `tools/flight-plot/main.js` | None |

The hook and the trace columns are the only changes inside flight code, and both are proved flying-identical by `gauge-trace-compare.mjs` and the 4-ship probe, shown first catching a known-bad change (planning skill Step 5, item 5).

---

## 7. How the analysis feeds the decisions

The criteria below are **design gates for choosing a structure and judging round 5, read beside the gauge and Patrick's flying.** They are not tests, never become rules inside the flight code, and add no test to any PR (TESTING.md lines, copied in 8.0). Every threshold is an estimate until Patrick sets it (Q4).

| # | Criterion | Measure | Proposed gate (estimate) | Source of the gate |
|---|---|---|---|---|
| C1 | One owner, or a stated rule, per shared resource | Resource matrix (4.3) | No column with two writers and no rule; no runtime fight over 1 s in the academic set | The thread's N² idea; Fable F7 ("by priority, not by adding") |
| C2 | Linear margins | Table 4.4 | Phase margin at least 45°, gain margin at least 6 dB, each loop, each trim | Fable's cone report (overshoot under 25% ≈ 45°); standard practice |
| C3 | Delay margin in the full sim, both kinds | M3 | At least 0.2 s extra delay before oscillation or chatter, every academic case | `formation-control-research-14oct.md` §5 (a guess); plan.md T29 round 4 target |
| C4 | Loops nested apart | Table 4.4 | Each loop's crossover at least 3 times the next one out, or a stated cross-feed | Fable F6 ("3-5 times apart") |
| C5 | Interaction | RGA, loop-closing sweeps | Paired RGA elements 0.7-1.5, none negative; closing a loop moves another's crossover under 30% | Skogestad's pairing rule (near 1, never negative) |
| C6 | Switches that don't chatter, and do something | Switching map | Hysteresis at least twice the trigger's ripple, a dwell on each; no label-only switch; job switches within the acceptance's 3 a turn | plan.md T29 acceptance; history note's `guard.engage` lesson |
| C7 | The guard rail stays a guard rail | Filter authority share (5.5) | Engaged under about 10% of an academic turn, none in steady turning | Patrick, TS-233: "the separation filter a guard rail, not the pilot" |
| C8 | The tool order holds | Allocation coupling (R6) | Geometry not cut by the vertical at the cap in the academic set; the G cap not reached in academic turns | TS-233 tool order; the recorded four-ship's about 2.9 G peaks (reference) |
| C9 | Energy intent | Throttle against G above Lead's | In keep-energy phases they rise together; the cut only in a bleed intent | TS-233, "pull G, add power" |
| C10 | Tuning count | Ledger (4.8) | Every number has a role and a source; fewer numbers and no switches compared with today's 92 (tidy) | Observation 0080's removal budget; close formation's 41 numbers in its law (plan.md T29t) as the comparison |
| C11 | The model is right | M1 against M2, rig against gauge | Step responses and end results agree within the shared margins | TESTING.md's shared margins |

**How a structure is chosen:** the candidates of 5.6 are scored on C1-C11 and on the gauge's eight turn cases and T29d's aggressive set, side by side on the thread page with Patrick's techniques (relax to capture, vertical first below, the assertive exit) shown on the phase plane. Patrick picks, with the T29t review's recommendation. **Round 5's acceptance** then adds C1, C3, C6 and C7 beside the gauge lines already in plan.md (TS-233's lines), with Patrick's yes on the wording.

---

## 8. The tasks (planning-and-task-breakdown form; for the thread to fold into plan.md under B5)

### 8.0 Lines every brief carries (the rule book's testing lines, in full)

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

Every brief also says: read `AGENTS.md` and the module's folder first; search for existing flight math before writing new (core `flight-math.js`, `point-mass.js`, `t6-performance.js`, `live/power.js`); report what was done, what is untested or unseen, what was unsure. None of these tasks adds a test. The analysis runs are measuring runs, not tests; each is short (a gauge case is seconds; a sweep a few minutes), and anything over a minute runs in the background.

### Phase 1: the model, true to the code

#### Task CA0: Baseline after the tidy

**Description:** Once T29t's tidy is merged into b2, save the gauge's b5 traces (`--fw live --tag ca0`) and the default set as the analysis baseline, and note the tidy's commit in the control model's header.
**Acceptance:**
- [ ] Baseline traces saved under the tag and their commit named.
- [ ] `gauge-trace-compare.mjs` against the tidy's own check run reads "unchanged".
**Verification:** manual check of the compare output.
**Dependencies:** T29t's tidy merged.
**Files likely touched:** none in the repo (traces in `tmp/`); one line in the plan.
**Estimated scope:** XS. **Model:** the thread itself.

#### Task CA1: The signal dictionary and the block diagram, by hand

**Description:** Write the dictionary (4.1) for fighting wing and close formation from the tidied code, with every signal's delay (R1), smoothing, writer, readers and limits; draw level 1 and level 2 block diagrams and the starting resource matrix (4.3); place every history-note item on its cell. Folds into the thread's T29t control-systems page.
**Acceptance:**
- [ ] Every function the tidy named and every `FW_WING` / `FW_SEE` / `CLOSE_WING` group appears in the dictionary or is listed as not a controller (with why).
- [ ] Findings R1-R10 confirmed or corrected against the tidied code, each with its concept name.
- [ ] Every history-note item placed on an N² cell.
**Verification:** a second reader (the thread, if an agent wrote it) checks ten random rows against the code; manual check of the diagrams by Patrick on the thread page.
**Dependencies:** CA0; T29t's review (to draw its recommended structure beside today's).
**Files likely touched:** `tools/control-map/signals.mjs` (new), `docs/modules/turn-sim/control-model.md` (new).
**Estimated scope:** M. **Model:** Opus, medium (reading flight maths correctly is the whole job).

#### Task CA2: The control map scripts

**Description:** The draw script (N² chart, resource matrix, block diagram outline and SVG, history heat map) and the check script against a gauge run's columns (4.1), from CA1's data.
**Acceptance:**
- [ ] `control-model.md` regenerates from the dictionary with no hand edits.
- [ ] The check flags a deliberately missing row and a deliberately unknown trace column (the known-bad case), then passes on the real data.
**Verification:** run both scripts; manual look at the drawn pages.
**Dependencies:** CA1.
**Files likely touched:** `tools/control-map/draw.mjs`, `check.mjs` (new), `control-model.md`.
**Estimated scope:** S. **Model:** Sonnet, medium (tooling and pages).

#### Task CA3: The trace columns, the injection hook and the rig

**Description:** T29r's trace half brought forward (6.2 row 1), the injection hook (row 2), the delay-mode flag, and the scripted-Lead rig (row 3).
**Acceptance:**
- [ ] Every default gauge trace and every `--fw live` b5 trace unchanged apart from added columns, and the 4-ship probe's hashes the same, the compare first shown catching a deliberate change.
- [ ] A step injected at each named point shows in the rig's output, and with no probe the rig's run matches the gauge's own straight and steady-turn runs within the shared margins.
- [ ] `npm run build` passes.
**Verification:** `gauge-trace-compare.mjs`, `four-ship-probe.mjs`, the rig against the gauge; CI on the PR.
**Dependencies:** CA0; the files are free (one writer per file: not while round 5 or T29r's HUD step is writing them).
**Files likely touched:** `live/wingman/fighting-wing.js`, `separation.js`, `perception.js`, `wingman.js`, `close-formation.js` (traces and optional probe only), `tools/fw-rig.mjs` (new), `tools/formation-gauge.mjs`.
**Estimated scope:** M (five small edits plus one script). **Model:** Opus, medium (flight code, flying unchanged).

### Checkpoint A (after CA0-CA3): the model is the code

- [ ] The control map's check passes on a gauge run.
- [ ] Flying identical, shown by the compare and the probe.
- [ ] The thread page shows Patrick the block diagrams and the N² chart with the history heat map; Patrick answers Q1 (where the delay sits).

### Phase 2: the analysis

#### Task CA4: Linear models and the bandwidth and delay table

**Description:** M1 in the kit at the five trim points, for both techniques, under the three delay models; validated against the rig's small steps.
**Acceptance:**
- [ ] Close formation's plane axis reads about 37° at 0.3 s (spec 7b.6c), the check of the method.
- [ ] Each fighting wing loop's linear step response agrees with the rig's within the shared margins, or the difference is explained and the model fixed.
- [ ] Table 4.4 and the RGA committed as small tables with their script header.
**Verification:** run `fw_loops.py`; manual comparison of model and rig plots on the thread page.
**Dependencies:** CA1, CA3.
**Files likely touched:** `tools/flight-design/fw_loops.py` (new), `tools/flight-design/results/` (tables).
**Estimated scope:** M. **Model:** Opus, high (designing flight maths).

#### Task CA5: Identification and the full-sim margins

**Description:** M2 and M3 in the rig and the gauge: frequency responses from injected sweeps; the two delay sweeps and the gain sweeps over the eight turn cases and straight and level; where the full-sim margin is small, the same sweep with switches frozen one at a time to find the one that eats it.
**Acceptance:**
- [ ] For each loop, identified and linear crossover and phase margin side by side, with coherence shown.
- [ ] For each case, both delay margins and each loop's gain margin, with what failed first (a loop's oscillation or a switch's chatter).
- [ ] The switch (or switches) responsible for the gap between the linear and the full-sim margin named, with the evidence.
**Verification:** results tables committed; traces of the failing runs tagged for the plot page.
**Dependencies:** CA3, CA4.
**Files likely touched:** `tools/flight-design/fw_ident.py` (new), results tables.
**Estimated scope:** M. **Model:** Opus, high.

#### Task CA6: Interaction, switches and the phase plane

**Description:** M4 and M5: the loop-closing sweeps, the runtime N² fights, the allocation coupling at the cap, the switching map with ripple against hysteresis, describing-function checks of the in-loop switches, the filter's four measures, and the phase-plane view on the plot page.
**Acceptance:**
- [ ] The resource matrix filled with measured shares, every runtime fight over 1 s listed with its case and time.
- [ ] Every switch with its count, dwell, ripple ratio and whether it changes the flying.
- [ ] The phase plane drawn for all eight cases with the switch lines.
**Verification:** manual check on the plot page; the control map's check still passes.
**Dependencies:** CA3, CA4.
**Files likely touched:** `tools/flight-design/fw_loops.py` (RGA, describing functions), `tools/flight-plot/main.js` (the view), `tools/formation-gauge.mjs` (the counts).
**Estimated scope:** M. **Model:** Opus, high.

### Checkpoint B (after CA4-CA6): what the analysis found

- [ ] The thread page, for Patrick: which cells fight, which switches chatter, where the margin goes, the filter's authority share, who loses at the G cap; each finding with its case and phase-plane picture.
- [ ] Checked against the T29t review's recommendation: where they agree, where they don't.
- [ ] Patrick picks which candidates go to CA7 (Q3 sets the depth).

### Phase 3: using it

#### Task CA7: Candidate structures on the rig

**Description:** M6: each chosen candidate as a small law in the rig (not app code), run on the academic and aggressive cases with Patrick's techniques as checks, scored on C1-C11; O4 first as the CasADi bound only.
**Acceptance:**
- [ ] One score table, candidates side by side, every criterion and every case.
- [ ] Relax to capture, vertical first below and the assertive exit shown on the phase plane for each candidate.
- [ ] Each candidate's tuning count and owners per resource listed.
**Verification:** rig runs repeatable (same output twice); manual review on the thread page.
**Dependencies:** Checkpoint B.
**Files likely touched:** `tools/fw-rig.mjs` (candidate laws as rig options), `tools/flight-design/` (the O4 bound), results tables.
**Estimated scope:** M per candidate pair; split per candidate if more than two (observation 0075: one loop group per task). **Model:** Opus, high.

### Checkpoint C: Patrick picks the structure

- [ ] The score table and the T29t review together; Patrick picks; the criteria he adopts (Q4) go into round 5's brief and, with his yes on the wording, into spec 7e and TS-233's row (one source of truth).

#### Task CA8: Round 5's acceptance pack and upkeep

**Description:** Round 5's brief carries the chosen criteria beside the gauge lines; the dictionary becomes the structure's interface (each round 5 slice says which cells and rows it changes, and reports what it removed as well as added, observation 0080); the control map's check and the margin table re-run at the end of each slice.
**Acceptance:**
- [ ] Round 5's brief lists the criteria and the re-run steps.
- [ ] The plan.md row for upkeep names who runs the check when a wingman file changes.
**Verification:** the thread's read of the brief against this plan.
**Dependencies:** Checkpoint C.
**Files likely touched:** `docs/modules/turn-sim/plan.md`, the round 5 brief.
**Estimated scope:** S. **Model:** the thread itself.

### Order and dependencies at a glance

T29t (tidy, review) → CA0 → CA1 → CA2, and CA3 alongside CA1 → **Checkpoint A** → CA4 → CA5 and CA6 → **Checkpoint B** → CA7 → **Checkpoint C** → CA8 → round 5. CA1 and CA3 touch different files and can run at once (one writer per file); everything else is in order.

---

## 9. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| The code moves under the analysis (round 5, T29r's HUD, T30) | Medium | Everything keyed by concept and trace column; the control map's check fails loudly; re-run CA4's table at each slice (CA8) |
| The linear model is wrong and misleads | High | No linear result used until checked against the rig (C11); the full-sim sweeps are the final word |
| Analysis becomes a new accretion: more tools than flying | Medium | Small additions only (6.2), all measuring; the criteria include a removal budget (C10); Q3 lets Patrick cap the depth |
| The delay placement (R1) changes the flying when settled | High | Q1 asked first, with the three models analysed side by side so its effect is known before any change; any change is a flying change for Patrick's yes |
| A criterion turns into a wall in the code | Medium | Stated as design gates, never as code rules (TESTING.md lines); the gates read on the thread page, not in tests |
| One writer per file clashes (CA3 against round 5 or T29r) | Medium | CA3 before round 5 starts, or folded into T29r's trace half by the same writer (Q2) |
| The describing-function and RGA results are approximate for this system | Low | Used to find suspects; simulation confirms every finding |
| A Fable review is wanted on the analysis | Low | Brief from a self-contained, renamed document, follow-ups held until its report lands (observation 0071) |

---

## 10. Questions for Patrick (one at a time; each with his own idea as an option)

**Q1. Where does #2's 0.4 s sit in fighting wing?** Today it is on Lead only: #2 sees Lead 0.4 s late and carries him forward, but knows his own position and motion now. Close formation delays the whole picture 0.3 s.
- (a) Lead only, as now: matches your words ("0.4 s after he sees Lead's bank and nose start"); the loops look very robust.
- (b) The whole picture 0.4 s late, as close formation: the textbook pilot; the loops lose margin, so gains may have to soften.
- (c) Split: Lead 0.4 s, his own motion felt sooner (about 0.1-0.2 s, an estimate), his place against Lead from the picture.
- (d) Your own picture of it.
- **Recommendation:** analyse all three (no extra cost in CA4-CA5) and decide after Checkpoint A; working answer (a), as built, until then.

**Q2. Bring T29r's trace half forward, ahead of round 5, as the analysis groundwork?**
- (a) Yes: the trace columns now (CA3), the HUD drop-down with round 5 as planned. **Recommended:** the analysis can't check the N² chart or the cap without it, and it changes no flying.
- (b) No: keep T29r with round 5, and run the analysis on today's columns (the N² runtime check and the allocation coupling are then left out).
- (c) Your idea.

**Q3. How deep before round 5?**
- (a) The model only (Phase 1: the dictionary, diagrams, N² chart and history map): fastest; the thread's T29t page made rigorous.
- (b) Phases 1 and 2 (adds the linear and full-sim margins, the switching map, the phase plane). **Recommended:** it is what finds which switch eats the delay margin, which tuning alone hasn't.
- (c) All three phases (adds the candidate structures on the rig, and the planner's bound): strongest basis for the structure choice, about twice as long.
- (d) Your idea.

**Q4. The design gates (section 7), as estimates to start from?** Phase margin 45°, at least 0.2 s of extra delay in the full sim, loops 3 times apart, the filter engaged under about 10% of an academic turn, the G cap not reached in academic turns.
- (a) Adopt them as working estimates, tuned as the analysis shows what is possible. **Recommended.**
- (b) Adopt only the ones from your rulings and the research (the delay margin and the filter as a guard rail), and read the rest as information.
- (c) Your own numbers.

(For later, not now: at the G cap the code keeps the vertical and cuts the turn, the reverse of your tool order. That becomes a question once CA6 shows how often it happens.)

---

## 11. What was run, what is untested, what is unsure

- **Run:** one throwaway python-control script in the scratchpad (not in the repo), with the pinned kit from the main checkout's environment: the toy margins of 2.3. It reproduced the research's integrator-plus-delay table and spec 7b.6c's 37° exactly; the fighting wing toy loops are hand simplifications, not checked against the sim.
- **Read in the repo:** AGENTS.md; plan.md 12.4, B5, T26-T31, T29t, T29r, T29d and "Recorded formation flying"; spec 7b and 7e; TS-233; the research and Fable reports; `fighting-wing.js` (b2) and the tidy's split, `separation.js`'s outline, `perception.js`, `close-formation.js`'s `pilotAxis` use, `stepLead` and `holdThrottle`, `FW_SEE` and `FW_WING`; the tidy's history note; the gauge's header and helpers; the track-log README.
- **Not read:** the T29t architecture review (not out); `supervisor.js`'s jobs in full; the tidy's `numbers.md`; `loop-design.md` was read and is Lead's aerobatic loop design (a useful precedent for re-running a law offline on the core point mass, not a control-loop study).
- **Web sources:** search summaries only, except the N² chart's Wikipedia entry and the Feedback Systems landing page (read); the Lund lecture returned 404. All are background; Patrick's rulings and the manuals win.
- **Unsure:** whether R6 (the vertical outranking the geometry at the cap) is intended; the size of the ripple-to-hysteresis rule (twice, an estimate); whether the scripted-Lead rig can reproduce the gauge closely enough without the session's hand-overs (CA3's acceptance tests exactly that).

## 12. Sources

- Åström and Murray, *Feedback Systems*, 2nd ed., free PDF via https://fbswiki.org/wiki/index.php/Main_Page (landing page read; chapters not).
- N² chart: https://en.wikipedia.org/wiki/N2_chart (read); NASA Systems Engineering Handbook, https://www.nasa.gov/sites/default/files/atoms/files/nasa_systems_engineering_handbook_0.pdf (search summary only).
- Relative gain array: Skogestad, decentralized control lecture, https://folk.ntnu.no/skoge/presentation/OLD-2017-and-earlier/promatch-cybernetica-06/5decentralized.pdf; Skogestad and Morari 1992, https://www.mic-journal.no/ABS/MIC-1992-2-3 (search summaries only).
- Describing functions: Lund FRTN05 lecture, https://www.control.lth.se/fileadmin/control/Education/EngineeringProgram/FRTN05/2018/lec06eight.pdf (404 when fetched; search summary only).
- Frequency-response identification, broken-loop margins: CIFER, https://gs.sjsu.edu/researchfoundation/resources/flight-control/cifer.php; Downs et al., AHS 2007, https://oucampustest.sjsu.edu/researchfoundation/docs/AHS_2007_Downs.pdf (search summaries only).
- Daisy-chain control allocation: https://arxiv.org/pdf/1903.10623; constrained allocation, https://vtechworks.lib.vt.edu/handle/10919/28570 (search summaries only).
- In the repo: `docs/references/formation-control-research-14oct.md` (McRuer's crossover model, the delay budget, the half-gain trap, Squires et al.'s barrier); `Pat's claude work/formation-review-12oct/research/pilot-model-sources/` (MIT 16.400 lecture 10; Bhandari and Csurcsia 2022); `fable-fighting-wing-report-14oct.md` (F6's loop table); `fable-cone-turn-report-14oct.md` (the phase budget and the delay sweep).
