# The live wingman's control model

<!-- Made by `node tools/control-map/draw.mjs` from tools/control-map/model.template.md and signals.mjs. Do not edit by hand. -->

**What this is.** The control-systems model of #2, the live wingman, in fighting wing and close formation: every controller, what it senses and commands, how the controllers share the controls, how they are tuned, and a first cut of each loop's speed and margins. Plan T29m part 1 (Patrick 14 Oct 2026: "build the system we asked originally, including its reccomendations"); the method is `Pat's claude work/formation-review-12oct/control-systems-analysis-plan.md`. It describes the code as built and changes nothing in flight. Every number here comes from the code, a ruling, a manual page or standard physics, or is an estimate; the loop margins are all estimates until part 2's rig checks them against the sim. The thread, the rule book (`AGENTS.md`), spec 7b and 7e and TS-233 win over anything here.

**Status.** {{META}}

**How it stays true to the code.** One master list (`tools/control-map/signals.mjs`) holds every block, signal, rule, switch and number role. This page and its pictures are drawn from it (`draw.mjs`), and a check (`check.mjs`) compares it with a gauge run's trace columns and with the code's tuning tables, failing on a missing row, an unknown column or an unlisted number. When a wingman file changes, run the check; if it fails, the master list changes in the same piece of work. The steps are in `tools/control-map/README.md`.

**Words used here.**
- **Loop:** a controller that measures something, compares it with what it wants, and moves a control to close the gap (feedback).
- **Feed-forward:** a control set from what is known to be coming (Lead's bank, the drag of his own G), not from an error.
- **Hidden feedback:** something labelled feed-forward that also carries #2's own motion back into his command, so it is really part of a loop.
- **Crossover:** how fast a loop works (rad/s); 1 ÷ crossover is roughly the time it corrects over.
- **Phase margin, gain margin:** how far a loop is from oscillating, in extra lag (degrees) or extra gain (dB).
- **Extra-delay margin:** how much more reaction delay it could take before it chases.
- **Switch, hysteresis, hold:** an on/off rule; different on and off lines so it doesn't flicker; a minimum time in one state.
- **Phased blend:** a controller's say that grows smoothly with a measure (how near a limit, how long since a hand-over), never on/off. Section 9.
- **N² chart:** a grid with the controllers on the diagonal; the cell in row A, column B says what A passes to B.

---

## 1. Findings: R1-R10 checked against the tidied code, and two new

{{FINDINGS}}

## 2. Block diagrams

### 2.1 Fighting wing today, level 1

![Fighting wing today, level 1](control-model/fw-today-level1.svg)

{{OUTLINE:fw}}

**Level 2** (each controller: what it does, senses, commands, and its numbers read from the code): [fw-today-level2.svg](control-model/fw-today-level2.svg).

![Fighting wing today, level 2](control-model/fw-today-level2.svg)

### 2.2 Close formation, level 1 (the reference design)

![Close formation, level 1](control-model/cf-level1.svg)

{{OUTLINE:cf}}

**Level 2:**

![Close formation, level 2](control-model/cf-level2.svg)

### 2.3 Fighting wing, the recommended target structure (Spec 7e Draft 4 + Fable 3a/3b, `B01–B15`, `S01–S45`)

Spec 7e Draft 4 reconciled with Fable's control-systems model and audit (`fable-draft-4-model-report-14oct-mapped.md` `D1–D20` and follow-up `fable-draft-4-model-report-3b-14oct-mapped.md` `D21–D26`) and Patrick's rulings of 14 Oct 2026 (`TS-233`, `TS-234`):
- **One delay rule (`B02`):** Lead seen 0.4 s late and dead-reckoned (position around his seen turn, bank run forward by his seen roll rate, `D3`); #2's own state known now; slant closure computed directly from velocities with no 1 s smoother (`D11`).
- **One normal follower (`B05`) and arc loop (`B07`):** follows Lead's circle at offset $d \in [-250, +250]\text{ ft}$ or the swept line ($K_\chi = 0.5\text{ /s}$, $K_e = 0.026^\circ/\text{ft}$, caps $20^\circ$ out / $12^\circ$ in, `D2`); one $10\text{ s}$ range constant ($\tau_s = \tau_r = 10\text{ s}$, $k_c = 0.5$, `D10`) with unmet closure $w - \omega \cdot d_{\text{cmd}}$ (`S29b`, clipped $\pm 15\text{ kt}$) feeding the speed set-point offset $\Delta v_{\text{ref}}$ (`S27g`, `D21`) and a continuous drop-low-inside height term ($20\text{ ft/kt}$ past $5\text{ kt}$ slow, capped $-300\text{ ft}$, `D24`).
- **Techniques (`B06`, `T1–T8`) plan once and write only the reference (`S26`):** blended by `B08` (`S27a–g`) over $\ge 6\text{ s}$ path and $\ge 4.3\text{ s}$ height (`D5`); in the miss (`T1`), #2 rolls and pulls positive G (`minG = 0.5 G` floor via unload-roll-pull, never pushing to 0 or negative G).
- **One set of loops (`B09` steering, `B10` vertical with profile rate `D1`, `B11` proportional $0.3\text{ /s}$ speed loop with physics feed-forwards `D23`), one barrier guard (`B12`, cubic $x^3$ taper $600 \to 500\text{ ft}$), lift composer (`B13`, cap order: climb height demand first, 1 G hold second, turn last, `0.2 G` knee `D20`, `D22`), and urgency shaper (`B14`, $1 + 3u\text{ G/s}$).**

![Recommended structure, level 1](control-model/fw-proposed-level1.svg)

{{OUTLINE:proposed}}

![Recommended structure, level 2](control-model/fw-proposed-level2.svg)

#### Level 1 architecture diagram (Mermaid, reconciled `B01–B15`)

{{TARGET_MERMAID_L1}}

#### Level 2 loop architecture diagram (Mermaid, `B07`, `B09`, `B10`, `B11`)

{{TARGET_MERMAID_L2}}

#### Target blocks (`B01–B15`)

{{TARGET_BLOCKS}}

#### Target signals (`S01–S45`, including `S05b`, `S27a–g`, `S29b`)

{{TARGET_SIGNALS}}

## 3. Where the delay sits

Fighting wing mixes three kinds of delay inside one technique (R1), while close formation has one. The loops' margins depend on which kind sits inside each loop: under D-Lead (as built) almost no delay is inside the fighting wing loops; under D-Picture the whole 0.4 s is (section 7).

{{DELAYS}}

## 4. Every signal

{{SIGNALS}}

## 5. The N² chart and the resource matrix

![Fighting wing N² chart](control-model/fw-today-n2.svg)

### 5.1 The cells

{{N2CELLS}}

### 5.2 The resource matrix: who writes each control and who reads each shared signal

Each shared thing has one rule: **sum**, **priority** (an order), **switch** (on/off with thresholds, hysteresis, hold), **phased** (authority growing smoothly) or **single** (one writer). Two writers with no rule would be a fight (plan criterion C1).

{{RESOURCES}}

### 5.3 The history note on its cells (where tuning went round in circles)

Every item of `Pat's claude work/formation-review-12oct/fighting-wing-code-history.md`, placed on the cell and resource it acted on. "Folded" means always on, its off branch removed by the tidy; "removed" flew worse; "label" changed a label only.

{{HISTORYHEAT}}

{{HISTORY}}

**Reading the heat map.** Two places carry most of the history: the in-plane turn (the filter's replacement of the steering's turn: shaker bound, shared lift, wing line, capture, lag side, the hysteresis) and the aim point (follow the circle, dead-reckoning, lag first, nose behind, path caps, the nose behind on the circle). Both are the one root problem the review names, #2 inside Lead's circle gaining, answered at the aim point and at the filter instead of in the steering law. The third is the throttle (power cut, closing only, hold power, speed feed-forward, low inside, brakes): four owners and no energy intent.

## 6. The switching map (today's code)

"Crossings" counts how often #2's trigger signal crossed the switch's on line in the fighting wing set (the cm gauge run, 12 traces with the abeam case); "wobble" is its spread about its own 2 s trend at a crossing; a band under about twice the wobble will chatter (an estimate, plan C6). Made by `tools/control-map/ripple.mjs`; switches whose trigger the gauge doesn't trace wait for part 2.

{{SWITCHES}}

**What it shows.** The filter's working line has no band at all and was crossed 132 times with a 50 ft wobble. Idle's band is smaller than its trigger's wobble (0.7 times) and the boards' only equal to it (1.0). The power cut trips on the sign of the closure, which crossed zero 42 times. These are exactly the places the round 4 gauge counted flicker and torque reversals, and the review's delay sweep broke on (its F8: the filter's choice of side). Two switches change only a label (the filter's engagement, the entry case) and one the trace only (the aim's kind).

## 7. Bandwidth and delay: a first cut

Each loop linearised by hand at the trim points, every gain read from the code (`tools/flight-design/fw_loops.py`, results in `tools/flight-design/results/`). **Every row is an estimate** until part 2's rig checks the loop's step response against the sim. D-Lead: the delay model as built in fighting wing (only the 0.05 s step inside the loop). D-Picture: the whole picture late (0.4 s fighting wing, 0.3 s close formation as built).

{{LOOPTABLE}}

**Reading it.**
- **The method checks out.** Close formation's plane axis gives 2.0 rad/s and 37° at 0.3 s, spec 7b.6c's numbers.
- **Fighting wing's loops are slow and far from the delay.** Steering 0.4-0.6 rad/s, the arc loop 0.09, the vertical 0.7, all with 45-80° of phase margin and 1-16 s of extra-delay margin, even with the whole picture 0.4 s late. Yet the gauge measures about 0.1 s in the full sim (plan T29, round 4; the review's sweep breaks at +0.2 s). So the fragility is in the switching layer (section 6), as the review's F8 says, not in the loops' gains.
- **The aim line's "feed-forward" is a loop term (R3).** Without it the steering crosses at 0.34 rad/s with 43° at T2; with it, 0.59 rad/s and 62°. It helps here, but it is a gain to analyse, and it jumps when the aim jumps (hence round 4's cap).
- **Power has almost no loop gain on the arc error (R5 corrected).** The d_ss term hands any speed change back as offset, so in a turn the closure is the arc loop's alone. Power's arc term only chooses how much of the closure is speed and how much is offset.
- **The half-gain trap is confirmed:** without the feed-forward the arc loop delivers half the closure it asks for.
- **Close formation's linear margins are thin, and it flies well anyway.** The plane axis with its 0.1 s rate filter and the step reads about 14°, the line axis in a 60°/2 G turn about 18° (its bank-to-lift gain doubles with Lead's G). Yet it holds 60° turns within 1.75 ft (spec 7b, B2 probe). The feed-forward (Lead's lift ahead, his place's motion, the holding power, the power lead) does most of the work, so the loops correct only small errors. That is the cross-feed pattern earning its place. Worth a rig check in part 2 before close formation is flown hard (section 11).
- **Swept power reads 33-37°:** adequate, and worth a step in the rig.

## 8. The tuning ledger

Every number of CLOSE_SEE, CLOSE_WING, FW_SEE and FW_WING, its value read from the code, its role, and its source from `docs/modules/turn-sim/numbers.md` (the code's own comment). **Role:** ruling (Patrick or a manual), geometry (physics or the aircraft), search (search effort), tuning (a gain, time, threshold or limit to tune), sweep (an analysis knob), label (names a trace only), unused. **Recommended structure:** what the recommended structure (2.3) does with it.

{{LEDGERCOUNTS}}

{{ADDS}}

{{LEDGER}}

## 9. The phased-in pattern (Patrick's "phased security guard")

**What it is, in control and systems-engineering words.** A protection or a hand-over whose authority grows smoothly with how much it is needed, instead of a switch that is either off or in charge. Patrick's guard ruling is the clearest case: it does nothing at or over 600 ft predicted, pushes harder as the pass nears 500 ft, and allows no closing speed at 500 ft. The same idea goes by several names:
- **Control barrier function (CBF)**, in safety-critical control: a barrier h (here: the predicted pass less 500 ft) and a rule that its rate may not fall faster than a function of how much room is left (ḣ ≥ −α(h)). Far from the limit it allows anything; at the limit it allows nothing; the correction is the least change to the pilot's command that keeps the rule. `docs/references/formation-control-research-14oct.md` §3.3-3.4 (Park, Kim and Panagou's square-root law; Xu et al.'s cruise-control barrier) is this.
- **Soft limits and envelope protection**, in flight control (general knowledge, not from a source here): a protection whose authority builds as a limit nears, so the aircraft rounds onto the limit rather than hitting a stop. The core already has the building block: `softMin` and `softMax` in `src/core/flight-math.js` ("rounds onto it over about knee instead of stopping dead, and its rate does not step").
- **Authority blending, or gain scheduling with smooth weights:** two controllers' commands mixed by a weight from 0 to 1 that moves with a measure.
- **Bumpless transfer:** a hand-over in which the incoming controller starts from the outgoing one's command and takes over gradually (spec 7b.6b; close formation's masks and pressure sizes already do it).
- In systems-engineering terms it is **graduated authority** (graceful degradation's counterpart): no single line where the system changes mode.

**Plain-words name for the tool:** *phased authority*. Two forms, and which one to use matters:
1. **The constraint form, for safety** (the guard): the protection limits the command (the least change that keeps the rule) and is silent otherwise. It never averages a safe command with an unsafe one.
2. **The blend form, for hand-overs and limits** (phase changes, the G cap, the arc loop's closure limit): a weight that moves smoothly with a measure or with time.

A blend is the wrong tool for safety: half of a safe command plus half of an unsafe one can be neither. A constraint is the wrong tool for a hand-over, where both controllers should keep flying.

**Why it helps.** No line to chatter on, so its hysteresis numbers go. Commands without steps, so fewer G and roll reversals. No either-or that flips under delay (the review's F8). Usually fewer numbers: a zone start, a zone end and a shape, in place of on, off and hold.

**What it costs.** A zone width to choose for each. Inside the zone both parts act, so their sum must be designed (the constraint form avoids that for safety). A smooth zone can feel softer than a pilot's firm correction, which is why the ruling keeps "inside 500 ft he corrects firmly".

**Where today's code uses an on/off switch where a phased blend would fit** (evidence from section 6):

| Today's switch | Evidence | Phased version | What it fixes | Tuning values |
|---|---|---|---|---|
| The filter's working line (500 ft + 1.4 s × closure, at least 600 ft; engaged until clear by 50 ft for 1 s) | 132 crossings, 50 ft wobble, no band | Patrick's taper, the constraint form: nothing at or over 600 ft, the allowed closing speed shrinking to none at 500 ft | The flicker, the rail flying him at the ideal, the label-only hysteresis | Removes 5 (engage and release lines, their holds); adds 1-2 (the taper's shape and time) |
| The power cut (20% torque while the filter held and closing) | 42 crossings of zero closure; 30 toggles in one turn (review F3) | The guard's graded bleed request into the energy intent, by the taper's weight | The power relay fighting the G | Removes 2; adds 0-1 |
| Idle and the boards (40/25 and 60/35 ft/s) | Bands 0.7 and 1.0 × the wobble | Idle: a phased throttle reduction by closure excess. The boards are a physical step (Patrick: "a very large step change in drag"), so keep the switch, with a band of at least twice the wobble and a minimum time out | Idle chatter; boards in and out | About the same |
| The G cap opening (Lead + 1.5 to the aircraft's, when the guard's pass is under 500 ft or the filter needs more) | A step in the cap | The cap rises with the taper's weight between about 550 and 500 ft | A G step at the bubble | Adds 0 (shares the taper) |
| The arc loop's closure limit (25 ft/s within 300 ft, 60 beyond) | A step in a saturation | A smooth limit from 25 to 60 over about 200-400 ft (softMin) | A jump in the wanted closure | Same count |
| Lead's turn start (10° held 1 s) | Starts 1.4 s after the roll is seen | The phase weight grows with Lead's seen bank and roll (review 2.1: no hold) | A late entry; lag first's reason to exist | Removes 1 |
| The pitch-owner hand-over (a 2 s hold; pass-clear and in and down at once) | Owners change in steps; 300 ft-low finishes (review F6) | The height target blended between owners over about 2 s, pass-clear at once but through the vertical's rate | Height steps | Same count |
| The quick fix (150/75 ft, 20/10 ft/s) | Band 1.6 × the closure's wobble | The exit vertical, sized continuously by the spacing error (ruled assertive) | Height target jumps | Removes 6, adds 2 |
| Low inside (5/1 kt short) | A relay on speed to MAX and −300 ft | The energy intent's "gain", weighted by the shortfall | MAX steps | Removes 3 |
| Unload, roll, pull (at 20° off) | A kink in the lift | A cosine-shaped share | A G kink as the wings come round | Same |
| Close formation's telegraph torque rate (on at 1°/s of Lead's roll) | A step in a rate limit | The rate weighted by Lead's seen roll rate | A small torque-rate step at the roll start | Same |

**Where else in the tool it could apply:**

| Where | What it would fix | Tuning values |
|---|---|---|
| The hand-overs between close formation and fighting wing (T30; Fable F8's stretch job) | Close formation's gains asking for tens of G at 100 ft: each technique's authority weighted by range (close formation full under about 100 ft, fighting wing full past about 250 ft), both started bumplessly | 2 (the zone's ends) |
| The G cap's on-screen flag | An amber zone as he nears the estimate and red past it, rather than one flag at the line (a screen step for the screen-layout skill) | 1 |
| The 15 KIAS power band | The wanted speed's corner at the band: a smooth saturation (arctan, as Wang et al.'s bounded speed command, research §2.2) | 0 |
| The cone's edges in the gauge and on the card (500-1,000 ft, 30-60°, the height band) | A graded "how far into the cone" in place of in or out, so the gauge reads how near the edge he ran, not only whether he crossed it | 0-1 |
| Job changes in fighting wing | The 1.5 s aim blend, applied only at a change, with a weight that ends (R11) | 0 |
| The 4-ship's deconfliction (close formation's dead bands) | The same taper as the bubble, for a wingspan | 1-2 |
| Lead's own limits (rolling and pulling 4.7 G; the 8 G/s gate) | Already rounded by softMin in Lead's loop (Step 12.3); the pattern is in use | 0 |
| The rejoins (B4): overtake closure near the join | Closure allowed shrinking with range, as the bubble's taper (a straight-ahead rejoin's 25 kt to the join) | 1-2 |

## 10. Controllers feeding each other: good idea or not?

**Verdict: yes, deliberate cross-feeds are a good idea, but only one kind of them.** A cross-feed is good when it passes **physics**: the cost of one control's action, worked out from the aircraft model and handed to the control that pays it, before any error appears. It is harmful when it passes a **decision or a switch state** from one controller to another, because that makes a loop through logic that bypasses the aircraft. Such loops have no dynamics to smooth them, and they flip under delay. Close formation is built on the first kind and flies well with thin loop margins (section 7). Fighting wing's trouble sits in the second kind (sections 5 and 6).

**The four options, judged on this model:**

| Option | What it does to the N² chart | Margins | Tuning values | Verdict |
|---|---|---|---|---|
| 1. Through the aircraft only | Leaves today's cells; each loop sees the others late | Linear margins large (section 7), but the switches carry the coupling | Today's | What fails now |
| 2. Cross-feeds (physics) | Adds feed-forward cells (G → power, climb → power, roll-in → power, vertical → guard); removes no fights by itself | None lost: a feed-forward sits outside the loop and adds no lag to it | 0 (the physics is already in the code) to about 1 | Yes |
| 3. One intent split in Patrick's order | Empties the shared-control cells: one owner each for turn, vertical, power; the guard and the jobs pass an intent and a constraint, not settings | Removes the switch-to-switch loops (R9), where the full-sim margin is lost | About 3-6 (the intent's thresholds, the exit vertical) | Yes, with 2 |
| 4. A short predictive planner | Replaces several cells with one block | A planner's margin depends on its model and horizon; nothing in this model calls for it | Many, and a solver | In reserve for T29d's back-to-back reversals |

**Which cells should carry a deliberate cross-feed, and what each passes:**

| From → to | Signal | Today | Rule |
|---|---|---|---|
| Turn G asked → power | The drag of the G he is asking for (`dragPerWeight` at the commanded G), so power leads the pull rather than lagging it. Patrick: "when I pull G I need power to maintain energy (unless I WANT to lose energy right now)" (TS-233) | Half there: `holdThrottle` adds the drag of the G he *has* | Paid when the intent is keep or gain; not paid when the intent is bleed |
| Bank → the lift that holds height | The 1 G share square to his path | There (`verticalFor`'s hold) | Kept first at the cap, as today |
| Climb or the vertical ask → power | The power for his climb rate (power.js `powerFor`'s climb term, as close formation's `holdingTorque` uses) | Missing in fighting wing | By intent: keep pays the climb, so a climb doesn't bleed speed and a dive doesn't gain it; gain lets a dive gain (the exit's "if stretched, dive") |
| Lead's roll seen → power (a lead) | The coming G's drag, from Lead's seen bank and roll, as close formation's `powerLeadPct` | Missing | Scaled by what he sees, never Lead's plan (TS-211) |
| The guard → the energy intent | A graded request to bleed, weighted by the taper | Today a 20% throttle relay | The intent owns power; the guard never sets the throttle |
| The vertical ask → the guard's prediction | The height he is asking for, counted in the predicted slant | There (Fable F3, `sharedLift`) | Keep |
| Lead's turn → steering | The path's own turn rate (on the circle, Lead's turn): true feed-forward | Today the aim line's turn, which is hidden feedback (R3) | The path follower's feed-forward replaces it |
| Speed → the offset | d_ss = R(1 − V2/V_L): his speed handed to the offset (R5) | There | Keep; it is what lets power serve energy and the arc loop own closure |

**Which existing links are the harmful kind:**
- **Power back → the yo-yo's trigger** (R9): a relay's state as a trigger; it ties the yo-yo to the power cut's 42 crossings.
- **The filter's lineShort → the nose behind** (R9): a search result switching an aim override.
- **The filter's hold → the power cut** (R9): pulling 3.5 G with power cut, the opposite of Patrick's rule (review F5), toggling 30 times in one turn.
- **The guard on → pass-clear's pitch, the aim blend, the power integral** (R8, R9): a second predictor's switch changing three loops' structure; with the filter's hold it is what takes him 300 ft low (review F6).
- **Low inside → MAX and −300 ft** (R5's cousin): a job setting the throttle and the height directly, past their owners.
- **The aim line's turn "feed-forward"** (R3): hidden feedback that jumped when the aim jumped, so it needed a cap.
- **The arc error → power's P** (R5): harmless, since the offset hands it back, but a second owner that costs a number and blurs who owns closure.

**What makes a cross-feed safe or unsafe:**
- *Safe:* worked from physics (the aircraft model, or kinematics) of a command or of what is seen of Lead. Continuous (no thresholds). Summed by the one owner of the control it feeds, inside that owner's limits. Consistent with the delay model (from what he sees, TS-211; from his own command now). Its model error caught by the receiving loop's feedback or trim (spec 7b: "his estimate need not be perfect").
- *Unsafe:* it carries a decision, a switch state or a threshold. Or it contains the receiver's own motion (hidden feedback), so it is really a loop gain. Or it writes a control that another block also writes, with no rule. Or it feeds one loop's measured error into another loop (two owners of one error: double counting, or one cancelling the other).

**What each costs:**
- *Tuning values:* physics cross-feeds cost none (they reuse `powerFor`, `dragPerWeight` and the kinematics already in the code). A roll-in lead may need one share, as close formation's telegraph rate. The intent split costs about 3-6 (review 3).
- *Delay margin:* a true feed-forward costs none, because it is outside the loop. In practice it raises the margin, because the loops have less to do and the switches trip less. Hidden feedback is a loop gain and must be in the margin table (it is, R3). The arc loop's own feed-forward shows both effects: the steady closure delivered went from half to all of what it asks for, and its margin stayed near 80°.

**Does the recommended structure hold up?** Yes: cross-feeds plus one intent (review 2.4), with the planner in reserve. Three changes from this model:
1. **The guard's only outputs are a constraint and a request.** The least change to turn or height, by the taper, plus a graded bleed request to the intent. Never a throttle setting, a pitch-owner switch or an aim point. That empties the guard → pitch owner, filter → power and filter → nose behind cells.
2. **Add the two missing physics cross-feeds to power: the climb, and the coming G (and the G asked, not the G had).** Both are gated by the intent. That is "pull G, add power" as a cross-feed, so power leads instead of chasing the speed a second later.
3. **Drop power's arc term (R5)** and make the cap's hand-down follow Patrick's order. When the cap binds, the turn and the vertical share it in his order (Q2), phased rather than a priority step.

The planner stays in reserve. The linear margins are large (section 7), so a planner would only be justified by sequencing (lining up the vertical and the turn in T29d's 4 G reversals), not by stability.

## 11. Notes and ideas (revelations and things that might work, each with its evidence)

- **R11, the aim blend is always on.** `steerToAim` eases the aim against Lead every step, so in a steady turn the aim lags Lead's rotation by about atan(ω × 1.5 s): about 12° at 60°/2 G, 26° at 4 G. Evidence: in the cm run, outside the filter, the commanded and flown offsets differ by a median 90-400 ft in the steady part of the turns away (a scratch count). It might be part of why the turns end far back. Idea: blend only across a change of aim, with a weight that ends; part 2's rig can show the difference before anyone changes the flying.
- **The fragility is in the switches, measured.** Linear margins of seconds (section 7) against 0.1 s in the full sim; the filter's line crossed 132 times. This supports the review's F8 and the taper ruling, and means round 5's guard-rail slice should move the delay margin most.
- **Power's arc term does nothing to closure (R5 corrected).** A whole N² cell and a tuning value that can go, with no loss.
- **Close formation's line axis is twice as stiff in a 60° turn.** Its bank-to-lift gain is multiplied by Lead's G, so the loop's crossover doubles in a 2 G turn and its linear margin drops to about 18°. It flies well today; if part 2 or Patrick's flying ever shows a lateral hunt in steep close turns, dividing by Lead's G (a fixed lift per foot) is the candidate. A flying change, for Patrick only.
- **Three seen cues feed nothing (R12).** Line of sight, aspect and HCA are traced but read by nobody since the tidy. The phase could use the manual's own reversal cue, a definite increase in line of sight (SMM 16.20 para 65b(2)), and HCA ≈ 2 × aspect as the "on the circle" test (SMM 16.16, Fable F10) for "captured".
- **The core already has the soft-limit building block** (`softMin`, `softMax`), so phased limits need no new maths (rule book: search for existing flight math first).
- **The check caught my own slips first.** It refused two of the master list's rules (up-down G is a sum; bank has one writer) before it passed. The method works on its own author.
- **The gauge's in-position start reads "stretched"** (780 ft against the 700 ft edge; R7 and the review's F10). Worth fixing in slice 0 so each case is what it says.

## 12. Questions for Patrick

**Answered since part 1 (TS-233):**

{{ANSWERED}}

**Open** (the thread relays these one at a time; each has a working answer until he replies):

{{QUESTIONS}}

## 13. Part 2: the measuring kit, and what it shows of today's faults

Patrick, his first flight of V2.433 Live (14 Oct 2026): "hes overcontrolling his aimpoint and roll and G way too much. I think we need to have 'gentle handovers' between switches. hes also holding too much low stack in general ... the excess G and fast onset is bleeding his energy ... in FW we basically assess the error, make a plan, smoothly execute the plan/monitor perofmrance/adjust as requied". The kit below measures exactly those, on today's code, as the known-bad baseline for round 5.

**What was added (flying unchanged).** Every default gauge trace (32) and every live b5 trace (11) is unchanged apart from added columns (`Pat's claude work/formation-review-12oct/gauge-trace-compare.mjs`, shown first catching one changed G value). The 4-ship probe still gives 2d5b5a8020839796 with default options and with fwWing 'live'.
- **Controller columns** in the gauge's traces: each loop's terms, each control's ask against its grant, the winner, the limits (table below). Close formation's P and D per axis, its feed-forwards and its asks against what the hand gave.
- **Fault measures and counts per press,** printed by the gauge and kept in each trace's `faults` key: the G onset, aim jumps, wrong-way roll, time over Lead's G + 0.5, torque swings of 30 points, time more than 100 ft below the stack, speed lost against Lead for the G used over his, the filter's and the guard's share, each control's owner changes with their mean hold, and each loop's time at a limit. Every threshold is an estimate, named in `tools/formation-gauge.mjs`.
- **An analysis probe and delay flags** (`fighting-wing.js` `setFwAnalysis`, never set in flying). The gauge's `--extra-delay s` and `--delay-mode lead|picture` (the whole picture late: Patrick kept "lead" and asked for "picture" to be measured beside it each slice). The probe adds a step at `cWant`, `aimLateral`, `heightTarget` or `wantKias`.
- **The scripted-Lead rig** `tools/fw-rig.mjs`: the real technique on the real point mass against a Lead flying a script, with a probe step after he settles.
- **The abeam case** `b5-into-abeam` in the gauge's b5 set: today's known-bad baseline.

{{CTLCOLS}}

### 13.1 Today's faults, case by case (the cm run; `tools/control-map/faults.mjs`)

{{FAULTS}}

**Reading it, in Patrick's words:**
- **"Overcontrolling ... G" and "fast onset":** the smoothed G onset reaches 1.7-3.3 G/s in every academic turn and spends 1-5 s a turn over 1 G/s. Lead's own academic roll-in builds about 1 G over his roll. He is over Lead's G + 0.5 for 3-25 s of a 30 s turn (into tight 24.5 s).
- **"Overcontrolling his aimpoint":** 2-137 aim jumps a turn (more than 25 ft against Lead in one step), the aim line's turn reaching up to 109°/s before its cap. R11's every-step aim blend and the overrides (lag first, the nose behind, the filter) are where they come from.
- **"Gentle handovers between switches":** the throttle changes owner up to 37 times in a turn (into from nearly abeam); the turn's winner flips between steering and the filter up to 16 times in a wings-level settle.
- **"Too much low stack":** 7-30 s a press more than 100 ft below his 50 ft stack, lowest 183-326 ft, in every academic turn case. The pitch owners commanding 300 ft (review F6) hold him there.
- **"The excess G ... is bleeding his energy":** into tight loses 27 kt against Lead for 40 G·s over Lead's G. The turns away lose 4-5 kt for 7-12 G·s.
- **"Abeam, Lead turning into him, he just matches his bank":** confirmed (R14). From nearly abeam he banks the same way as Lead 92% of the first 10 s, the filter flies 98% of the turn, and he ends 49° ahead of Lead's 3/9 line, 302 ft low and 23.5 kt slow.

### 13.2 The rig against the linear models (plan C11)

{{RIGCHECK}}

**Reading it.** Where the filter is quiet (straight and level), today's loops behave as their linear models say, so part 1's table holds for them (R13). The one fix was the vertical's model (D acts on his height rate, not the error), which changes its answer to a new target, not its margins. In Lead's 60° turn the arc loop and the offset can't be checked linearly: at the trim today's code settles to, the filter flies him half the time. That is the review's F3 measured on a single loop, and the reason round 5's guard-rail slice (the taper) comes first.

## 14. Untested, unseen and unsure

- **Nothing here was flown or seen in the app;** it reads the code and one gauge run.
- **Every loop margin is an estimate.** These are hand linearisations at fixed trim points, with the G onset and roll as small lags (0.05 s, from reading `easeValue`: rate limits, nearly transparent when small) and the limits and slews left out. Part 2's rig checks each against the sim (plan C11).
- **The ripple numbers** come from one gauge run of 11 fighting wing cases, measured on the traced signal nearest each trigger. The filter's line is taken at 600 ft, though it moves with closure.
- **The master list is read by hand.** The check proves its trace columns and its numbers, not its every writer and reader; part 2's per-term trace columns (T29r) let the check prove those too.
- **Unsure:** whether R11's offset gap is the blend or the 3 s chord to the look-ahead point; whether close formation's thin linear margins matter at the aggressive end; the T4 rows, since the arc loop's linear gains don't change with Lead's turn rate, so T4's real differences are nonlinear (the look-ahead angle's 90° cap, the blend's 26°).
