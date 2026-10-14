# The live wingman's control model

<!-- Made by `node tools/control-map/draw.mjs` from tools/control-map/model.template.md and signals.mjs. Do not edit by hand. -->

**What this is.** The control-systems model of #2, the live wingman, in fighting wing and close formation: every controller, what it senses and commands, how the controllers share the controls, how they are tuned, and a first cut of each loop's speed and margins. Plan T29m part 1 (Patrick 14 Oct 2026: "build the system we asked originally, including its reccomendations"); the method is `Pat's claude work/formation-review-12oct/control-systems-analysis-plan.md`. It describes the code as built and changes nothing in flight. Every number here comes from the code, a ruling, a manual page or standard physics, or is an estimate; the loop margins are all estimates until part 2's rig checks them against the sim. The thread, the rule book (`AGENTS.md`), spec 7b and 7e and TS-233 win over anything here.

**Status.** formation-close-wingman-b2 at 8509fcff: the T29t tidy (482f0857) and the powerFor to powerAsk rename (db651dec). 14 Oct 2026, plan T29m part 1 (Opus, high). An estimate of the code as built, read by hand; the trace columns and the ledger are checked by check.mjs. Nothing here changes how anything flies.

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

- **R1 (confirmed).** Fighting wing delays Lead only (dead-reckoned 0.4 s; leadNowOf); close formation the whole picture 0.3 s. Corrected in detail: three more delay kinds sit inside fighting wing. The slant, slant closure, aspect, HCA, height and the guard read the whole picture 0.4 s late (seeFw buffers both aircraft); the wanted speed and the swept place's closure read Lead 0.4 s late without the dead-reckoning (seen.lead.v). So one technique mixes three delays (DELAYS: leadDr, leadLate, picture04).
- **R2 (confirmed).** Two closures. Arc closure (velocities, now; level, the closure on the swept place) feeds the arc loop, the yo-yo, the power cut and the brakes in a turn; slant closure (1 s, 0.4 s late) feeds the pass line, S-turns, the quick fix, the exit side, the entry case, the brakes level and their "where". The power cut trips on the arc closure while the filter's line moves with the slant closure.
- **R3 (confirmed).** The aim line's turn fed forward is hidden feedback: the line turns with his own motion. Linearised (fw_loops.py), it adds a rate term V/L ≈ 0.33 /s on his heading: it acts like damping, not like feed-forward.
- **R4 (confirmed).** Power is three in series: powerAsk's wanted KIAS, holdThrottle (0.2 kt/s per kt, ≤ 3 kt/s, G drag fed forward), the engine. The inner hold's numbers are LEAD.speedHold, shared with Lead.
- **R5 (corrected).** Two owners of the arc error, but they don't add. The arc loop's d_ss = R(1 − V2/V_L) moves the offset outward by ΔV/ω for every ft/s power adds, so in a steady turn the closure is the arc loop's alone: power's arc term only chooses how much of it is speed and how much is offset (faster sits further outside). The plan's 0.15 rad/s "together" was wrong; fw_loops.py gives power almost no loop gain on closure.
- **R6 (confirmed).** liftWithin keeps the 1 G hold and the vertical, and cuts the turn at the cap. The filter replaces the steering's turn while failing, so the steering loop is open then. In the cm gauge run the job label reads "guard-filter" for 14-97% of the steady part of each academic turn (a scratch count; engaged is a label, so the share of steps it actually changes the turn is part 2's T29r column).
- **R7 (confirmed).** fwJob's entry case flies nothing; the jobs label it only.
- **R8 (confirmed).** fwGuard predicts from the 0.4 s old picture holding his own present turn, no vertical; the filter from now with the capture and the vertical. The guard decides pass-clear, the power integral, the aim blend and the cap; the filter the turn and the power cut.
- **R9 (confirmed).** Switch-to-switch links: power back → yo-yo; filter lineShort → nose behind; filter hold → power cut and pass-clear; guard on → pass-clear, aim blend, power I. One good link: the vertical ask → the filter's prediction (physics).
- **R10 (confirmed).** Close formation: holdingTorque and powerLeadPct fed forward into torque, Lead's lift and his place's motion into the one lift vector, three pilotAxis loops on what is left; job changes eased (masks, caps). The cross-feed pattern working.
- **R11 (new).** The aim is eased every step, not only at a change of aim. steerToAim eases his aim's offset against Lead (world axes) over 1.5 s every step, so in a steady turn the aim point lags Lead's rotation by atan(ω × 1.5 s): about 12° at 60°/2 G, 26° at 4 G. In the cm run the commanded and flown offset differ by a median 90-400 ft in the steady part of the turns away, outside the filter. A likely contributor; part 2's rig confirms or clears it.
- **R12 (new).** Three signals the spec meant for the supervisor are read by nothing: line of sight (the guard's reversal cue went with the tidy), aspect and HCA. Trace only.

## 2. Block diagrams

### 2.1 Fighting wing today, level 1

![Fighting wing today, level 1](control-model/fw-today-level1.svg)

1. **Lead**: His programme; never reads #2
2. **Sight (seeFw)**: The picture 0.4 s late: slant, closure (1 s), line of sight rate (0.5 s), aspect, HCA, sweep, height against Lead, Lead's bank, G (0.1 s) and turn circle · **Lead now**: Lead carried 0.4 s round his seen turn (Fable F5); his own position and velocity as they are now (R1) · **Arc range (s, d)**: In a turn: arc s behind Lead round his circle, offset d inside it, and the arc closure from the velocities (Fable F10)
3. **Guard (fwGuard)**: Second predictor of the pass, from the seen (0.4 s old) picture: on under 600 ft predicted or 500 ft now, off over 700 ft for 3 s; sets pass-clear's depth, freezes the power integral, skips the aim blend, opens the G cap under 500 ft · **Jobs (fwJob)**: Turning or level from Lead's seen bank; the entry case (a label, R7); the swept side at the exit; S-turns; the quick fix; low inside; the eased height target
4. **Arc loop (aimInTurn)**: d = d_ss + c*/ω + kc(c* − c)/ω, c* = (s − 650)/10 s within ±25/±60 ft/s, d within ±400 ft slewed 60 ft/s; aim 3 s ahead on the circle d inside Lead's; power's P = arc error/15 s · **Swept aim (aimSwept)**: Lead level: aim at the swept place (625 ft at 45°) carried 8 s ahead; power's P = how far behind his place/10 s within ±25 ft/s · **Lag first**: On Lead's bank passing 10° toward him: aim 20° outward of Lead's circle for 2.5 s, eased out over 1 s. Goes (ruling 14 Oct 2026) · **Nose behind**: While the filter finds the wing line out of reach: aim where Lead was 1 s ago and go 300 ft down · **High yo-yo**: Inside Lead's turn, slow-to-hold > 10 kt, power back and gaining > 20 ft/s: climb h = (V² − (ωr)²)/2g, at least 100 ft, at most 200 ft; then down
5. **Steering (steerToAim)**: Aim (against Lead) eased over 1.5 s every step; the aim line's turn (0.5 s) fed forward × V, capped at 1.5 ω_L + 3°/s; plus 0.05 G per degree to the aim line; in Lead's turn plane · **Pitch owner**: One owner: pass-clear, in and down, yo-yo, else the stack family (stack, quick fix, low inside); a 2 s hold except pass-clear and in and down · **Vertical PD**: 0.005 G/ft and 0.02 G per ft/s on height against Lead's target, square to Lead's turn plane, within ±1 G
6. **Separation filter**: His aim's turn, unless its predicted pass is under 500 ft + 1.4 s × closure (at least 600 ft) or within 100 ft of Lead's wing line: then the nearest of 41 turns (bisected 6 times) that keeps both, lag side first · **G cap**: Lead's G + 1.5 (estimate) under the shaker; what the aircraft gives while the guard's pass is under 500 ft or the filter needs more (flagged) · **Lift (liftWithin)**: 1 G hold + the vertical first, the turn gives way at the cap; unload, roll, pull past 20° off; never under 0.5 G · **Power (powerAsk)**: Wanted KIAS = Lead's + P (aim residual) + I (level only, 15 s), within 15 KIAS; 20% torque while the filter held and closing; MAX low inside; 20% on the yo-yo's way down; idle over 40 ft/s, boards over 60 ft/s · **Speed hold (inner)**: Throttle for a wanted KIAS: 0.2 kt/s per kt off, at most 3 kt/s (LEAD.speedHold, estimates), plus the drag at his present G fed forward (dragPerWeight)
7. **Engine**: Throttle travel in about 0.25 s; 3.5 s spool-up from idle (handling.js ENGINE, TS-218) · **#2 point mass**: G eased at the T-6A onset (T6A_G_ONSET), roll at the asked rate (fighting wing 60°/s, estimate) within the T-6A's, lift held under the stick shaker (the one physical limit), point mass in two half steps

**Level 2** (each controller: what it does, senses, commands, and its numbers read from the code): [fw-today-level2.svg](control-model/fw-today-level2.svg).

![Fighting wing today, level 2](control-model/fw-today-level2.svg)

### 2.2 Close formation, level 1 (the reference design)

![Close formation, level 1](control-model/cf-level1.svg)

1. **Lead**: His programme; never reads #2
2. **Sight (perceive)**: The whole picture 0.3 s late: deviation on plane, line, along; rates (0.1 s); Lead's bank, roll, G dead-reckoned 0.3 s; his place's motion as Lead rolls and turns
3. **Supervisor**: On station, small move, large move (plane, line, hinge masks eased at 0.5/s), out before up, off station; each with a dead band · **Station change and deconfliction**: B3: the places a change flies through; never within a wingspan, ahead of the 3/9 line or with wings overlapping
4. **Holding power (feed-forward)**: powerFor at the briefed 200 KIAS + his place's speed, his G, Lead's climb, his place's climb and his own climb · **Power lead (feed-forward)**: Torque for his place's acceleration along Lead's nose as Lead's turn builds or eases · **Three axes (closeLaw)**: Pace cascade (0.4 ft/s per ft, at most 8 ft/s, the braking taper), then P and D per axis: plane G 0.04/0.06, line bank 1.9° per ft/s, hinge torque 12% per ft/s; I 0
5. **Shaper (the hand)**: Pressure sizes per job, eased between jobs; torque rate 10 or 20%/s, 20%/s × reach in a telegraph; the trims held at a limit
6. **Lift (liftFor)**: Lead's lift at his G and bank 0.3 s ahead + his place's motion + the corrections; roll catch-up 0.6 of the gap
7. **Engine**: Throttle travel in about 0.25 s; 3.5 s spool-up from idle (handling.js ENGINE, TS-218) · **#2 point mass**: G eased at the T-6A onset (T6A_G_ONSET), roll at the asked rate (fighting wing 60°/s, estimate) within the T-6A's, lift held under the stick shaker (the one physical limit), point mass in two half steps

**Level 2:**

![Close formation, level 2](control-model/cf-level2.svg)

### 2.3 Fighting wing, the recommended structure (proposed, not built)

The T29t review's section 2.7 with Patrick's four rulings of 14 Oct 2026 folded in: the guard tapers from 600 ft to 500 ft and asks to bleed energy rather than cutting power; into him from in position he flies straight ahead until he is on the circle he wants, then captures it (lag first goes); the exit vertical may use any height while the slant stays 500-1,000 ft and he stays behind the wing line; and the analysis runs per slice. Two changes from this model are folded in too: power gets the climb and the coming G fed forward (section 10), and power's arc term goes (R5).

![Recommended structure, level 1](control-model/fw-proposed-level1.svg)

1. **Lead**: His programme; never reads #2
2. **Sight (seeFw)**: As today: the picture 0.4 s late; Lead carried across the delay (D-Lead, question 1)
3. **Phase**: Level, Entry, Turning, Exit from Lead's roll as seen (no 1 s hold); the case read at each start; a reversal is an exit then an entry (review 2.1)
4. **Reference path**: Lead's circle d inside or out (Turning: the arc loop), or the swept line; into him from in position: straight ahead until on the circle he wants (ruling); limits 20° out, 12° in (TS-233) · **Arc loop**: Today's form: d = d_ss + c*/ω + kc(c* − c)/ω; owns closure in a turn (R5) · **Energy intent**: Keep, gain or bleed from the phase and case, and the guard's graded bleed request
5. **Path follower**: Wanted course = tangent + (2/π)χmax atan(k × distance off); the path's turn fed forward (physics); course gain (review 2.2) · **Vertical (one owner)**: PD on the target of one owner: stack, exit vertical (any height, slant 500-1,000 ft, behind the wing line: ruling), yo-yo (Turning), pass-clear; changes blended · **Power (one owner)**: Drag of the G asked and the climb fed forward + the intent + a slow trim on speed; idle and the boards by intent
6. **Guard rail (taper)**: One predictor; does nothing at or over 600 ft; 600-500 ft the allowed closing speed shrinks to none at 500 ft (phased); the least change to turn or height; under 500 ft firm, G past the estimate flagged (ruling); asks bleed, never sets power
7. **Lift**: Within the cap in Patrick's order (question 2): geometry first; unload, roll, pull
8. **#2 point mass and engine**: As today (stepLead)

![Recommended structure, level 2](control-model/fw-proposed-level2.svg)

## 3. Where the delay sits

Fighting wing mixes three kinds of delay inside one technique (R1), while close formation has one. The loops' margins depend on which kind sits inside each loop: under D-Lead (as built) almost no delay is inside the fighting wing loops; under D-Picture the whole 0.4 s is (section 7).

| Delay kind | What it means | Signals |
|---|---|---|
| none | Now: his own state, or worked out this step from things known now | Lead as seen (position, velocity, body up), His own state, Wanted closure c*, Offset command d_cmd, Closure the aim can't give, Aim point, Aim line turn fed forward, Turn ask (aim's), Turn flown, Filter needs more G, Height target, Yo-yo height, Vertical G ask, G cap, Lift asked (fighting wing), Throttle, Idle and boards, Corrections wanted, Corrections given, The place he aims at, Lift asked (close formation) |
| leadDr | Lead 0.4 s late (FW_SEE.delaySec, Patrick 14 Oct 2026), then dead-reckoned 0.4 s round his seen turn (leadNowOf); his own state now | Lead now (position, velocity), Arc s behind Lead, Offset d inside Lead's circle, Arc closure, Predicted pass (filter) |
| leadLate | Lead 0.4 s late, not dead-reckoned (seen.lead used as it was) | Lead's bank (seen), Lead's G (seen), Lead's turn (ω, radius, centre), Short of Lead's speed, Wanted speed |
| picture04 | The whole relative picture 0.4 s late: Lead and himself as they were (seeFw buffers both) | Slant range, Slant closure, Line of sight rate, Aspect angle, Heading crossing angle, Height against Lead, Predicted pass (guard) |
| picture03 | The whole relative picture 0.3 s late (CLOSE_SEE.delaySec, TS-211): close formation | Deviation (plane, line, along), Deviation rates, Lead's bank and G 0.3 s ahead, His place's motion, Holding power, Power lead |
| state | Internal memory or a switch state, carried from the last step | Wing line out of reach, Filter hold (1 s), Guard on, Job label, Lead turning (job), Pitch owner, Low inside, Power back (flag), Job and masks |

## 4. Every signal

| Signal | Unit | Written by | Read by | Delay | Smoothing | Limits | Gauge column | Source |
|---|---|---|---|---|---|---|---|---|
| Lead as seen (position, velocity, body up) | ft, ft/s | Lead | Sight (seeFw), Sight (perceive) | none | none |  | none yet (part 2) | TS-211 |
| Slant range | ft | Sight (seeFw) | Guard (fwGuard), Jobs (fwJob), Power (powerAsk) | picture04 | none |  | `slantFt` | SMM 12.2 para 7; 500 ft is slant (Patrick 14 Oct 2026) |
| Slant closure | ft/s, + closing | Sight (seeFw) | Guard (fwGuard), Jobs (fwJob), Separation filter, Power (powerAsk) | picture04 | 1 s (FW_SEE.closureSec) |  | `closureFtps` | SMM 12.2 para 5 ("subtle"); R2 |
| Line of sight rate | °/s | Sight (seeFw) | (nothing) | picture04 | 0.5 s (FW_SEE.losSec) |  | `losDps` | SMM 12.2 para 8; read by nothing since the tidy (the guard's reversal cue went) |
| Aspect angle | ° | Sight (seeFw) | (nothing) | picture04 | none |  | `aspectDeg` | SMM 12.2 para 6, 16.16 para 40b; trace only |
| Heading crossing angle | ° | Sight (seeFw) | (nothing) | picture04 | none |  | `hcaDeg` | SMM 12.2 para 9; trace only |
| Height against Lead | ft, + above | Sight (seeFw) | Jobs (fwJob), Pitch owner, High yo-yo | picture04 | none |  | `heightFt` | TS-80 band; stack 50 ft below (Patrick 14 Oct 2026) |
| Lead's bank (seen) | ° | Sight (seeFw) | Jobs (fwJob), Lag first, Arc range (s, d), Arc loop (aimInTurn) | leadLate | none |  | none yet (part 2) | TS-211; spec 7e.7 |
| Lead's G (seen) | G | Sight (seeFw) | G cap, Separation filter | leadLate | 0.1 s (FW_SEE.gSec) |  | none yet (part 2) | spec 7e.7 |
| Lead's turn (ω, radius, centre) | rad/s, ft | Sight (seeFw) | Lead now, Arc range (s, d), Arc loop (aimInTurn), Steering (steerToAim), High yo-yo, Separation filter, Guard (fwGuard) | leadLate | from G (0.1 s) and true speed | ω ≥ 0.03 rad/s in d = c/ω | none yet (part 2) | Fable F4, F9 |
| Lead now (position, velocity) | ft, ft/s | Lead now | Arc range (s, d), Arc loop (aimInTurn), Swept aim (aimSwept), Nose behind, Steering (steerToAim), Vertical PD, Separation filter | leadDr | none |  | none yet (part 2) | Fable F5 (second review); R1 |
| His own state | ft, ft/s | #2 point mass | Arc range (s, d), Steering (steerToAim), Vertical PD, Separation filter, Lift (liftWithin), Power (powerAsk), Swept aim (aimSwept) | none | none |  | none yet (part 2) | leadNowOf: "his own state he knows" (R1) |
| Arc s behind Lead | ft, + behind | Arc range (s, d) | Arc loop (aimInTurn), High yo-yo | leadDr | none |  | `sFt` | Fable F10 (second review) |
| Offset d inside Lead's circle | ft, + inside | Arc range (s, d) | High yo-yo | leadDr | none |  | `dFt` | Fable F10 (second review) |
| Arc closure | ft/s, + closing | Arc range (s, d) | Arc loop (aimInTurn), High yo-yo, Power (powerAsk) | leadDr | none |  | `cActualFtps` | R2: in a turn; level, cActual is the closure on his swept place |
| Short of Lead's speed | KIAS | Sight (seeFw) | Jobs (fwJob) | leadLate | none |  | none yet (part 2) | TS-233 "Drop low inside, MAX" |
| Wanted closure c* | ft/s | Arc loop (aimInTurn), Swept aim (aimSwept) | Arc loop (aimInTurn), Power (powerAsk) | none | none | ±25 ft/s within 300 ft, ±60 beyond (turn); ±25 (level) | `cWantFtps` | Fable F1, F3 |
| Offset command d_cmd | ft, + inside | Arc loop (aimInTurn) | Steering (steerToAim) | none | slew 60 ft/s | ±400 ft | `offFt` | Fable F1 |
| Closure the aim can't give | ft/s of speed | Arc loop (aimInTurn), Swept aim (aimSwept) | Power (powerAsk) | none | none | ±15 KIAS | none yet (part 2) | spec 7e.7 power row |
| Aim point | ft | Arc loop (aimInTurn), Swept aim (aimSwept), Lag first, Nose behind | Steering (steerToAim) | none | eased 1.5 s against Lead, every step |  | `aim` (the aim's kind (lead, pure, lag, lagFirst, behind, swept, sTurn), not the point) | Patrick 14 Oct 2026 route positions; R11 |
| Aim line turn fed forward (hidden feedback) | G | Steering (steerToAim) | Separation filter | none | 0.5 s | 1.5 ω_L + 3°/s | none yet (part 2) | Fable F10; R3 |
| Turn ask (aim's) | ft/s², rad/s | Steering (steerToAim) | Separation filter | none |  |  | `omNomDps` | spec 7e.7 steering row |
| Turn flown | ft/s², rad/s | Separation filter | Lift (liftWithin) | none |  | stick shaker (filter); the cap (lift) | `omPickDps` (the filter's turn while it acts, else null) | TS-233 filter |
| Predicted pass (filter) | ft slant | Separation filter | Separation filter | leadDr |  |  | `passFt` | Squires et al. as mapped in formation-control-research-14oct.md §3.1 |
| Predicted pass (guard) | ft slant | Guard (fwGuard) | G cap, Pitch owner | picture04 |  |  | `predFt` | R8: a second predictor |
| Wing line out of reach | flag | Separation filter | Nose behind | state |  |  | `lineShort` | Fable F6; R9 |
| Filter hold (1 s) | s | Separation filter | Power (powerAsk), Pitch owner | state |  |  | none yet (part 2) | R9 |
| Filter needs more G | flag | Separation filter | G cap | none |  |  | none yet (part 2) | Patrick 14 Oct 2026: references, not walls |
| Guard on | flag | Guard (fwGuard) | Steering (steerToAim), Pitch owner, G cap, Power (powerAsk) | state |  |  | none yet (part 2) | R8 |
| Job label | words | Jobs (fwJob), Separation filter | (nothing) | state |  |  | `job` | History note: the filter's engagement changed only this label |
| Lead turning (job) | flag | Jobs (fwJob) | Arc range (s, d), Arc loop (aimInTurn), Swept aim (aimSwept), Nose behind, High yo-yo, Power (powerAsk), Separation filter | state | 10° / 5° held 1 s |  | none yet (part 2) | Fable F4 |
| Height target | ft against Lead | Jobs (fwJob), Pitch owner | Vertical PD | none | jobs: eased 2 s or 15 s | ±200 ft band for the stack family | `heightTargetFt` | Fable F7, F9; TS-233 |
| Pitch owner | name | Pitch owner | (nothing) | state | 2 s hold |  | `pitchOwner` | Fable F9 |
| Yo-yo height | ft | High yo-yo | Pitch owner | none |  | 100-200 ft | `yoyoFt` | TS-233 (no 400 ft cap) |
| Low inside | flag | Jobs (fwJob) | Power (powerAsk) | state |  |  | `fwLow` | TS-233 |
| Vertical G ask | G | Vertical PD | Separation filter, Lift (liftWithin) | none |  | ±1 G | none yet (part 2) | spec 7e.7 |
| G cap | G | G cap | Lift (liftWithin) | none |  | Lead + 1.5 under the shaker, or the aircraft's | none yet (part 2) | spec 7e.7 (estimate); shaker physical |
| Lift asked (fighting wing) | G vector | Lift (liftWithin) | #2 point mass | none |  | 0.5 G to the cap | none yet (part 2) |  |
| Wanted speed | KIAS | Power (powerAsk) | Speed hold (inner) | leadLate |  | Lead ± 15 KIAS | none yet (part 2) | Patrick 4 Oct 19:12Z band |
| Power back (flag) | flag | Power (powerAsk) | High yo-yo | state |  |  | none yet (part 2) | R9: power to yo-yo |
| Throttle | share of full thrust | Power (powerAsk), Speed hold (inner), Shaper (the hand) | Engine | none |  | 0 to MAX | `fwTorquePct` (torque %, fighting wing; close formation: torquePct) |  |
| Idle and boards | flags | Power (powerAsk) | Engine, #2 point mass | none |  |  | `fwBrakes` | TS-233 |
| Deviation (plane, line, along) | ft | Sight (perceive) | Supervisor, Three axes (closeLaw) | picture03 | none |  | `planeFt` (planeFt, lineFt, alongFt (the gauge's own)) | spec 7b.3 (plane, line, hinge) |
| Deviation rates | ft/s | Sight (perceive) | Supervisor, Three axes (closeLaw) | picture03 | 0.1 s (CLOSE_SEE.filterSec) |  | none yet (part 2) | spec 7b.6d item 7 |
| Lead's bank and G 0.3 s ahead (physics feed-forward) | °, G | Sight (perceive) | Lift (liftFor) | picture03 | 0.1 s, then dead-reckoned 0.3 s |  | none yet (part 2) | spec 7b.6d item 5; TS-227 |
| His place's motion (physics feed-forward) | G, ft/s | Sight (perceive) | Lift (liftFor), Holding power (feed-forward), Power lead (feed-forward) | picture03 | 0.1 s |  | none yet (part 2) | spec 7b.6d item 4 (rigid body) |
| Job and masks | name, 0-1 | Supervisor | Three axes (closeLaw), Shaper (the hand) | state | masks eased 0.5/s |  | `job` | spec 7b.6d item 12 |
| Holding power (physics feed-forward) | torque % | Holding power (feed-forward) | Three axes (closeLaw), Shaper (the hand) | picture03 |  |  | none yet (part 2) | Patrick 13 Oct 2026; powerFor |
| Power lead (physics feed-forward) | torque % | Power lead (feed-forward) | Three axes (closeLaw) | picture03 |  |  | none yet (part 2) | spec 7b.5 |
| Corrections wanted | G, G, torque % | Three axes (closeLaw) | Shaper (the hand) | none |  |  | none yet (part 2) | spec 7b.6c |
| Corrections given | G, G, torque % | Shaper (the hand) | Lift (liftFor), Three axes (closeLaw) | none | torque rate | per job | `torquePct` (torque only) | spec 7b.6d item 6 |
| The place he aims at | ft | Station change and deconfliction | Sight (perceive) | none |  | deconfliction | none yet (part 2) | spec 7c.3 |
| Lift asked (close formation) | G vector | Lift (liftFor) | #2 point mass | none |  |  | none yet (part 2) | spec 7b.6d item 8 |

## 5. The N² chart and the resource matrix

![Fighting wing N² chart](control-model/fw-today-n2.svg)

### 5.1 The cells

| From (row) | To (column) | What passes | History items on the cell |
|---|---|---|---|
| Lead | Sight (seeFw) | Lead as seen (position, velocity, body up) | - |
| Sight (seeFw) | Guard (fwGuard) | Slant range, Slant closure, Lead's turn (ω, radius, centre) | - |
| Sight (seeFw) | Jobs (fwJob) | Slant range, Slant closure, Height against Lead, Lead's bank (seen), Short of Lead's speed | - |
| Sight (seeFw) | Power (powerAsk) | Slant range, Slant closure | - |
| Sight (seeFw) | Separation filter | Slant closure, Lead's G (seen), Lead's turn (ω, radius, centre) | guard.passLine (F4) (folded); guard.tighterAtMin, built off then on (folded) |
| Sight (seeFw) | Pitch owner | Height against Lead | - |
| Sight (seeFw) | High yo-yo | Height against Lead, Lead's turn (ω, radius, centre) | - |
| Sight (seeFw) | Lag first | Lead's bank (seen) | - |
| Sight (seeFw) | Arc range (s, d) | Lead's bank (seen), Lead's turn (ω, radius, centre) | - |
| Sight (seeFw) | Arc loop (aimInTurn) | Lead's bank (seen), Lead's turn (ω, radius, centre) | - |
| Sight (seeFw) | G cap | Lead's G (seen) | - |
| Sight (seeFw) | Lead now | Lead's turn (ω, radius, centre) | - |
| Sight (seeFw) | Steering (steerToAim) | Lead's turn (ω, radius, centre) | - |
| Lead now | Arc range (s, d) | Lead now (position, velocity) | - |
| Lead now | Arc loop (aimInTurn) | Lead now (position, velocity) | - |
| Lead now | Swept aim (aimSwept) | Lead now (position, velocity) | - |
| Lead now | Nose behind | Lead now (position, velocity) | - |
| Lead now | Steering (steerToAim) | Lead now (position, velocity) | deadReckon (F5) (folded) |
| Lead now | Vertical PD | Lead now (position, velocity) | - |
| Lead now | Separation filter | Lead now (position, velocity) | - |
| #2 point mass | Arc range (s, d) | His own state | - |
| #2 point mass | Steering (steerToAim) | His own state | - |
| #2 point mass | Vertical PD | His own state | - |
| #2 point mass | Separation filter | His own state | - |
| #2 point mass | Lift (liftWithin) | His own state | - |
| #2 point mass | Power (powerAsk) | His own state | - |
| #2 point mass | Swept aim (aimSwept) | His own state | - |
| Arc range (s, d) | Arc loop (aimInTurn) | Arc s behind Lead, Arc closure | arcFrame (F10) (folded); arcLoop (F1) (folded); arcFeedForward: the half-gain fix (folded) |
| Arc range (s, d) | High yo-yo | Arc s behind Lead, Offset d inside Lead's circle, Arc closure | yoyo.excessFtps and yoyo.maxFt (folded) |
| Arc range (s, d) | Power (powerAsk) | Arc closure | speedFf: V_L(1 − d/R) to power, removed (removed); brakes: idle and boards, thresholds raised (folded) |
| Arc loop (aimInTurn) | Power (powerAsk) | Wanted closure c*, Closure the aim can't give | T29 aim loop, quick fix, power PI (three closures to 47 ft/s) (kept); T29a one owner for closure in a turn (no power I) (kept) |
| Swept aim (aimSwept) | Arc loop (aimInTurn) | Wanted closure c* | - |
| Swept aim (aimSwept) | Power (powerAsk) | Wanted closure c*, Closure the aim can't give | - |
| Arc loop (aimInTurn) | Steering (steerToAim) | Offset command d_cmd, Aim point | followCircle: follow Lead's circle 3 s ahead (folded); pathCaps (F7), built off, retried, removed (removed) |
| Swept aim (aimSwept) | Steering (steerToAim) | Aim point | - |
| Lag first | Steering (steerToAim) | Aim point | lagFirst.on and guard.lineShortAll (folded) |
| Nose behind | Steering (steerToAim) | Aim point | behind.onCircle: aim on Lead's circle, removed (removed) |
| Steering (steerToAim) | Separation filter | Aim line turn fed forward, Turn ask (aim's) | aimTurnCap (folded) |
| Separation filter | Lift (liftWithin) | Turn flown | guard.filter: the miss becomes the filter (folded); guard.wingLine (F6) (folded); guard.capture: candidates held 3 s then Lead's turn (folded); guard.lagSide: lag side first and rescue (folded) |
| Guard (fwGuard) | G cap | Predicted pass (guard), Guard on | - |
| Guard (fwGuard) | Pitch owner | **switch or decision:** Predicted pass (guard), Guard on, Guard on | - |
| Separation filter | Nose behind | **switch or decision:** Wing line out of reach, Wing line out of reach | behind.on: nose behind, in and down (folded) |
| Separation filter | Power (powerAsk) | **switch or decision:** Filter hold (1 s), Filter hold (1 s) | guard.offClosingOnly: power off only while closing (folded); guard.engage.holdsPower, removed (removed) |
| Separation filter | Pitch owner | **switch or decision:** Filter hold (1 s), Filter hold (1 s) | - |
| Separation filter | G cap | Filter needs more G | guard.shakerBound (F2) (folded) |
| Guard (fwGuard) | Steering (steerToAim) | **switch or decision:** Guard on, Guard on | T28 guard (miss, reversal phases) (folded) |
| Guard (fwGuard) | Power (powerAsk) | **switch or decision:** Guard on, Guard on | - |
| Jobs (fwJob) | Arc range (s, d) | Lead turning (job) | - |
| Jobs (fwJob) | Arc loop (aimInTurn) | Lead turning (job) | - |
| Jobs (fwJob) | Swept aim (aimSwept) | Lead turning (job) | - |
| Jobs (fwJob) | Nose behind | Lead turning (job) | - |
| Jobs (fwJob) | High yo-yo | Lead turning (job) | - |
| Jobs (fwJob) | Power (powerAsk) | Lead turning (job), Low inside | T29a low inside at MAX (kept) |
| Jobs (fwJob) | Separation filter | Lead turning (job) | - |
| Jobs (fwJob) | Vertical PD | Height target | - |
| Pitch owner | Vertical PD | Height target | - |
| High yo-yo | Pitch owner | Yo-yo height | yoyo.on and the pitch owners (F8, F9) (folded) |
| Vertical PD | Separation filter | **switch or decision:** Vertical G ask, Vertical G ask | guard.sharedLift (F3) (folded) |
| Vertical PD | Lift (liftWithin) | Vertical G ask | - |
| G cap | Lift (liftWithin) | G cap | - |
| Lift (liftWithin) | #2 point mass | Lift asked (fighting wing) | T29a unload, roll, pull (kept) |
| Power (powerAsk) | Speed hold (inner) | Wanted speed | - |
| Power (powerAsk) | High yo-yo | **switch or decision:** Power back (flag), Power back (flag) | - |
| Power (powerAsk) | Engine | Throttle, Idle and boards | - |
| Speed hold (inner) | Engine | Throttle | - |
| Power (powerAsk) | #2 point mass | Idle and boards | - |
| Separation filter | Separation filter |  | guard.engage: filter hysteresis (label only) (label) |

### 5.2 The resource matrix: who writes each control and who reads each shared signal

Each shared thing has one rule: **sum**, **priority** (an order), **switch** (on/off with thresholds, hysteresis, hold), **phased** (authority growing smoothly) or **single** (one writer). Two writers with no rule would be a fight (plan criterion C1).

| Resource | Kind | Writers (how) | Readers | Rule | Rule in words | History items |
|---|---|---|---|---|---|---|
| Turn G (in Lead's turn plane) | control, fighting wing | Steering (steerToAim): aim line turn fed forward + 0.05 G/deg; Separation filter: replaces it when the predicted pass fails; Lift (liftWithin): cuts it at the cap; unload-roll-pull; G cap: sets the cap | - | priority | Filter replaces steering (a switch, no hysteresis on failing); then the cap cuts the turn, never the hold and the vertical (R6) | 10 |
| Up-down G (square to the turn plane) | control, fighting wing | Vertical PD: PD on the height target; Lift (liftWithin): the 1 G hold, kept first at the cap | - | sum | The 1 G hold square to his path + the PD's ask; both kept first at the cap. The PD's target is the pitch owner's | 0 |
| Pitch owner (height target) | control, fighting wing | Pitch owner: pass-clear (guard on and filter held); Nose behind: in and down 300 ft; High yo-yo: climb 100-200 ft; Jobs (fwJob): stack −50, quick fix ±150, low inside −300 (eased) | - | priority | pass-clear > in and down > yo-yo > stack family; a 2 s hold except pass-clear and in and down (Fable F7, F9) | 1 |
| Bank and roll | control, fighting wing | Lift (liftWithin): from the lift vector (gAndBankForLift); the point mass rolls there at 60°/s within the T-6A | - | single | Bank follows the lift vector; no controller asks bank directly | 0 |
| Throttle | control, fighting wing | Power (powerAsk): wanted KIAS through the speed hold; Power (powerAsk): 20% while the filter held and closing; Power (powerAsk): MAX low inside; Power (powerAsk): 20% on the yo-yo's way down; Speed hold (inner): 0.2 kt/s per kt + G drag | - | switch | An if-chain of relays over the speed hold: filter cut / yo-yo down, then low inside MAX, else the hold (F5 of the review: four owners) | 4 |
| Idle | control, fighting wing | Power (powerAsk): arc or slant closure > 40 ft/s, off < 25 | - | switch | Hysteresis 40/25 ft/s; overrides the throttle | 1 |
| Boards | control, fighting wing | Power (powerAsk): closure > 60 ft/s, off < 35 | - | switch | Hysteresis 60/35 ft/s | 0 |
| Aim point | control, fighting wing | Arc loop (aimInTurn): turning; Swept aim (aimSwept): level; Lag first: blended in 3.5 s; Nose behind: replaces; Steering (steerToAim): eases it 1.5 s; at once with the guard or nose behind | - | priority | Call order: turn or swept, then lag first (blend), then nose behind (replace); eased 1.5 s every step | 7 |
| Arc closure (read) | signal, fighting wing | Arc range (s, d): from velocities, now | Arc loop (aimInTurn), High yo-yo, Power (powerAsk) | single | One signal, three readers: the arc loop's D, the yo-yo's gaining test, the filter cut's "closing" and the brakes in a turn | 1 |
| Slant closure (read) | signal, fighting wing | Sight (seeFw): 1 s smoothed, 0.4 s late | Separation filter, Guard (fwGuard), Jobs (fwJob), Power (powerAsk) | single | Pass line, S-turns, quick fix, exit side, entry case, brakes level and their "where" (R2) | 1 |
| Range (slant) | signal, fighting wing | Sight (seeFw): 0.4 s late | Guard (fwGuard), Jobs (fwJob), Power (powerAsk) | single | Jobs' thresholds and the brakes' "where"; in a turn the loops use s instead | 0 |
| Aspect | signal, fighting wing | Sight (seeFw): 0.4 s late | - | single | Read by nothing (spec 7e.7 meant it for the supervisor) | 0 |
| Arc s | signal, fighting wing | Arc range (s, d) | Arc loop (aimInTurn), High yo-yo, Power (powerAsk) | single | Arc loop (10 s) and power (15 s) both act on its error (R5) | 5 |
| Offset d | signal, fighting wing | Arc range (s, d) | High yo-yo | single | Only the yo-yo reads the measured d; the arc loop works on closure, not d | 0 |
| Torque (close) | control, close | Holding power (feed-forward): feed-forward; Power lead (feed-forward): feed-forward; Three axes (closeLaw): P and D on the hinge pace; Shaper (the hand): sizes and rate | - | sum | holding + lead + correction, the correction sized around holding + lead (the working cross-feed pattern, R10) | 0 |
| Lift (close) | control, close | Lift (liftFor): Lead's lift 0.3 s ahead + place motion; Three axes (closeLaw): plane and line corrections; Shaper (the hand): pressure sizes | - | sum | One lift vector: feed-forward + corrections (spec 7b.6d item 8) | 0 |
| Plane, line, hinge shares | control, close | Supervisor: masks eased 0.5 per second | - | phased | A large move shows the line's error once on the plane, the along error once on the line, each eased in: authority grows smoothly | 0 |
| Pressure sizes | control, close | Shaper (the hand): eased at capsPerSec between jobs | - | phased | A change of job never steps the sizes (bumpless) | 0 |

### 5.3 The history note on its cells (where tuning went round in circles)

Every item of `Pat's claude work/formation-review-12oct/fighting-wing-code-history.md`, placed on the cell and resource it acted on. "Folded" means always on, its off branch removed by the tidy; "removed" flew worse; "label" changed a label only.

| Resource | History items |
|---|---|
| Turn G (in Lead's turn plane) | 10 |
| Aim point | 7 |
| Arc s | 5 |
| Throttle | 4 |
| Pitch owner (height target) | 1 |
| Idle | 1 |
| Arc closure (read) | 1 |
| Slant closure (read) | 1 |

| Item | Commit | Cell (from → to) | Resource | Now |
|---|---|---|---|---|
| T28 guard (miss, reversal phases) | 9ab5a0e4 | Guard (fwGuard) → Steering (steerToAim) | Aim point | folded |
| T29 aim loop, quick fix, power PI (three closures to 47 ft/s) | 06196de8 | Arc loop (aimInTurn) → Power (powerAsk) | Arc s | kept |
| T29a unload, roll, pull | d4ae55f9 | Lift (liftWithin) → #2 point mass | Turn G (in Lead's turn plane) | kept |
| T29a one owner for closure in a turn (no power I) | d4ae55f9 | Arc loop (aimInTurn) → Power (powerAsk) | Arc s | kept |
| T29a low inside at MAX | d4ae55f9 | Jobs (fwJob) → Power (powerAsk) | Throttle | kept |
| guard.filter: the miss becomes the filter | b60a4a2b | Separation filter → Lift (liftWithin) | Turn G (in Lead's turn plane) | folded |
| followCircle: follow Lead's circle 3 s ahead | b60a4a2b | Arc loop (aimInTurn) → Steering (steerToAim) | Aim point | folded |
| deadReckon (F5) | 04ce6768 | Lead now → Steering (steerToAim) | Aim point | folded |
| guard.shakerBound (F2) | 31d304e6 | Separation filter → G cap | Turn G (in Lead's turn plane) | folded |
| guard.sharedLift (F3) | d5bef644 | Vertical PD → Separation filter | Turn G (in Lead's turn plane) | folded |
| guard.passLine (F4) | 26461ad3 | Sight (seeFw) → Separation filter | Slant closure (read) | folded |
| arcFrame (F10) | 0a48470d | Arc range (s, d) → Arc loop (aimInTurn) | Arc s | folded |
| arcLoop (F1) | 17f32caa | Arc range (s, d) → Arc loop (aimInTurn) | Arc s | folded |
| pathCaps (F7), built off, retried, removed | 2380ce07, 75f3163f, 1b395b73 | Arc loop (aimInTurn) → Steering (steerToAim) | Aim point | removed |
| guard.wingLine (F6) | 4251723f | Separation filter → Lift (liftWithin) | Turn G (in Lead's turn plane) | folded |
| yoyo.on and the pitch owners (F8, F9) | f0cfac10 | High yo-yo → Pitch owner | Pitch owner (height target) | folded |
| guard.offClosingOnly: power off only while closing | 1268e5f9 | Separation filter → Power (powerAsk) | Throttle | folded |
| guard.tighterAtMin, built off then on | 050968a8, fed616aa | Sight (seeFw) → Separation filter | Turn G (in Lead's turn plane) | folded |
| guard.capture: candidates held 3 s then Lead's turn | c67dc04e | Separation filter → Lift (liftWithin) | Turn G (in Lead's turn plane) | folded |
| behind.on: nose behind, in and down | 4db3ca78 | Separation filter → Nose behind | Aim point | folded |
| behind.onCircle: aim on Lead's circle, removed | 4db3ca78, 1b395b73 | Nose behind → Steering (steerToAim) | Aim point | removed |
| arcFeedForward: the half-gain fix | f379224d | Arc range (s, d) → Arc loop (aimInTurn) | Arc s | folded |
| lagFirst.on and guard.lineShortAll | 32359104 | Lag first → Steering (steerToAim) | Aim point | folded |
| aimTurnCap | b1261ec6 | Steering (steerToAim) → Separation filter | Turn G (in Lead's turn plane) | folded |
| guard.engage: filter hysteresis (label only) | fe258241 | Separation filter → Separation filter | Turn G (in Lead's turn plane) | label |
| guard.engage.holdsPower, removed | fe258241, 1b395b73 | Separation filter → Power (powerAsk) | Throttle | removed |
| yoyo.excessFtps and yoyo.maxFt | 794e5a7e | Arc range (s, d) → High yo-yo | Arc closure (read) | folded |
| speedFf: V_L(1 − d/R) to power, removed | 2f96613f, 1b395b73 | Arc range (s, d) → Power (powerAsk) | Throttle | removed |
| brakes: idle and boards, thresholds raised | 2423fc47 | Arc range (s, d) → Power (powerAsk) | Idle | folded |
| guard.lagSide: lag side first and rescue | 9e5c860f | Separation filter → Lift (liftWithin) | Turn G (in Lead's turn plane) | folded |

**Reading the heat map.** Two places carry most of the history: the in-plane turn (the filter's replacement of the steering's turn: shaker bound, shared lift, wing line, capture, lag side, the hysteresis) and the aim point (follow the circle, dead-reckoning, lag first, nose behind, path caps, the nose behind on the circle). Both are the one root problem the review names, #2 inside Lead's circle gaining, answered at the aim point and at the filter instead of in the steering law. The third is the throttle (power cut, closing only, hold power, speed feed-forward, low inside, brakes): four owners and no energy intent.

## 6. The switching map (today's code)

"Crossings" counts how often #2's trigger signal crossed the switch's on line in the fighting wing set (the cm gauge run, 11 traces); "wobble" is its spread about its own 2 s trend at a crossing; a band under about twice the wobble will chatter (an estimate, plan C6). Made by `tools/control-map/ripple.mjs`; switches whose trigger the gauge doesn't trace wait for part 2.

| Switch | Block | Trigger | On | Off | Hold | Changes | Flies or label | Crossings, wobble, band ÷ wobble (cm run) | Note |
|---|---|---|---|---|---|---|---|---|---|
| turning | Jobs (fwJob) | Lead's seen bank | \|bank\| > 10° held 1 s | \|bank\| < 5° held 1 s | 1 s each way | circle or swept aim; arc frame; power's I; quick fix and low inside allowed | yes | part 2 | Starts 1 s after the 10°: 1.4 s after Lead's roll is seen |
| entryCase | Jobs (fwJob) | slant, slant closure | tight < 560 ft or closure > 20 ft/s; stretched > 700 ft | at each turn start or reversal | the turn | the job label only | label | part 2 | R7; the gauge's "in position" 780 ft start reads stretched |
| exitSide | Jobs (fwJob) | slant, slant closure at the turn end | tight: slant < 600 or closure > 15 → outside; stretched: > 700 or opening > 10 → inside | - | until the next turn | the swept side | yes | part 2 | SMM Fig 12.23 |
| sTurn | Jobs (fwJob) | slant, slant closure | slant < 550 or (closure > 15 and slant < 650) | slant ≥ 600 and closure < 10 | side swapped at half the swept lateral | the swept side, back and forth | yes | 2 crossings of 550 (`slantFt`); wobble 43.3; band 50 = 1.16 × wobble | Patrick 14 Oct 2026 |
| quickFix | Jobs (fwJob) | slant error from 625, slant closure | error > 150 ft and closure < 10 (down); closure > 20 and error < 75 (up) | \|error\| < 75 and \|closure\| < 10 | target eased 2 s, back over 15 s | height target ±150 ft (level only) | yes | 35 crossings of 20 (`closureFtps`); wobble 6.3; band 10 = 1.58 × wobble | Fable F7 |
| lowInside | Jobs (fwJob) | short of Lead's KIAS | > 5 kt | < 1 kt | - | height −300 ft, power MAX (stack family has pitch) | yes | part 2 | TS-233 "Drop low inside, MAX" |
| lagFirst | Lag first | Lead's seen bank toward his side | crossing 10° | timer 2.5 s + 1 s ease | the timer | aim 20° outward of Lead's circle | yes | part 2 | Goes: ruling 14 Oct 2026 ("fly straight ahead until I'm on the turn circle I want") |
| noseBehind | Nose behind | the filter's lineShort (last step) | lineShort | lineShort false and 200 ft behind the wing line | - | aim where Lead was 1 s ago; pitch in and down 300 ft | yes | part 2 | A switch driven by a switch (R9) |
| yoyo | High yo-yo | slow-to-hold, powerBack, arc closure excess | > 10 kt and power back and > 20 ft/s over the arc loop's want | on circle (arc error and d < 150 ft), well behind, opening, or Lead's turn over; down ends within 50 ft of the stack | - | height target +100 to +200 ft, then down with power back | yes | part 2 | Three inputs from three blocks |
| ownerHold | Pitch owner | the owner wanted | a new owner | - | 2 s, except pass-clear and in and down at once | which height target the PD flies | yes | part 2 | Fable F9 |
| guard | Guard (fwGuard) | the guard's own predicted pass (0.4 s old picture), slant | < 600 ft predicted or < 500 ft now | > 700 ft for 3 s | 3 s | pass-clear wanted (with the filter's hold); power I frozen; aim not blended; G cap opened under 500 ft | yes | 35 crossings of 600 (`predFt`); wobble 25.7; band 100 = 3.89 × wobble | Replaced by the taper ruling (14 Oct 2026) |
| filterFailing | Separation filter | his aim's predicted pass and wing-line distance | pass < 500 + 1.4 s × closure (≥ 600 ft) or < 100 ft behind the wing line | the same line, no hysteresis | none | replaces his turn with the nearest clearing one | yes | 127 crossings of 600 (`passFt`); wobble 46.8; band 0 = 0 × wobble | The working switch: no band at all (F3 of the review) |
| filterEngaged | Separation filter | the same | failing | clear by 50 ft for 1 s | 1 s | the job label "guard-filter" only | label | part 2 | History: fe258241 moved job counts, not the flying |
| filterSide | Separation filter | the cost of each candidate | the other side clears and costs less by more than one full turn range | - | cost penalty, no time dwell | which way the filter turns him | yes | part 2 | The either-or that breaks at +0.2 s (review F8) |
| filterHold | Separation filter | the filter acted | it changed his turn | 1 s after | 1 s | power to 20% while closing; pass-clear wanted with the guard on | yes | part 2 | R9 |
| powerCut | Power (powerAsk) | filter hold and arc closure sign | held and closing > 0 | closure ≤ 0 or hold over | none on the closure sign | throttle to 20% torque | yes | 34 crossings of 0 (`cActualFtps`); wobble 3.4; band 0 = 0 × wobble | Toggled 30 times in the turn away from in position (review F3) |
| downPower | Power (powerAsk) | yo-yo down and faster than Lead | both | either | - | throttle to 20% | yes | part 2 |  |
| lowMax | Power (powerAsk) | low inside with the stack family on pitch | both | either | - | MAX | yes | part 2 |  |
| idle | Power (powerAsk) | closure (arc in a turn, else slant), where, not slow | > 40 ft/s and (slant < 650 or closing on the pass line) | < 25 ft/s | band 15 ft/s | throttle 0 (3.5 s spool-up) | yes | 11 crossings of 40 (`cActualFtps`); wobble 22.1; band 15 = 0.68 × wobble | brakes.slowKt 0 acts as a relay on speed (review F12) |
| boards | Power (powerAsk) | as idle | > 60 ft/s | < 35 ft/s | band 25 ft/s | boards out | yes | 10 crossings of 60 (`cActualFtps`); wobble 28.9; band 25 = 0.86 × wobble |  |
| capOpen | G cap | guard pass < 500 ft, or the filter needs more | either | neither | none | G cap from Lead + 1.5 to the aircraft's | yes | part 2 | A step in the cap |
| unloadRollPull | Lift (liftWithin) | wings off the wanted lift | > 20° | ≤ 20° | none | pulls only the share along the wings | yes | part 2 | A kink, continuous in value |
| turnPlane | Steering (steerToAim) | Lead's seen turn rate | > 1°/s | ≤ 1°/s | none | steering and the vertical in Lead's turn plane or the level plane | yes | part 2 |  |
| arcLimit | Arc loop (aimInTurn) | arc error | \|error\| ≥ 300 ft: ±60 ft/s | < 300 ft: ±25 ft/s | none | the wanted closure's limit jumps 25 ↔ 60 ft/s | yes | part 2 | A step in a saturation; a phased blend fits |
| aimKind | Arc loop (aimInTurn) | offset against a quarter route position (30 ft) | - | - | - | the trace's lead/pure/lag | label | part 2 | routeFt is read only here |
| cfJobs | Supervisor | distance off and rate | small > 1.5 ft; large > 10 ft or > 2 ft/s | station < 1 ft; small < 8 ft and < 1.5 ft/s | dead bands | pressure sizes (eased) and the plane, line, hinge masks (eased) | yes | part 2 | Each change phased in by the shaper and masks: the working pattern |
| cfUnder | Supervisor | under Lead | below his plane inside his wingtip | 2 ft clear | band 2 ft | no upward correction | yes | part 2 | Patrick 13 Oct 2026 |
| cfTelegraph | Shaper (the hand) | Lead's seen roll rate | > 1°/s | ≤ 1°/s | none | torque rate 20%/s × reach | yes | part 2 | A step in a rate limit |
| cfDeconflict | Station change and deconfliction | his place against Lead | wings overlap, within a span + 2 ft, ahead of 5 ft behind the 3/9 line | dead bands 1-5 ft | dead bands | the place he aims at | yes | part 2 | spec 7c.3 |

**What it shows.** The filter's working line has no band at all and was crossed 127 times with a 47 ft wobble. Idle and the boards have bands smaller than their trigger's wobble (0.7 and 0.9 times). The power cut trips on the sign of the closure, which crossed zero 34 times. These are exactly the places the round 4 gauge counted flicker and torque reversals, and the review's delay sweep broke on (its F8: the filter's choice of side). Two switches change only a label (the filter's engagement, the entry case) and one the trace only (the aim's kind).

## 7. Bandwidth and delay: a first cut

Each loop linearised by hand at the trim points, every gain read from the code (`tools/flight-design/fw_loops.py`, results in `tools/flight-design/results/`). **Every row is an estimate** until part 2's rig checks the loop's step response against the sim. D-Lead: the delay model as built in fighting wing (only the 0.05 s step inside the loop). D-Picture: the whole picture late (0.4 s fighting wing, 0.3 s close formation as built).

<!-- made by tools/flight-design/fw_loops.py on 2026-10-13; inputs: FW_WING, FW_SEE, CLOSE_WING, CLOSE_SEE (wing-moves.js), LEAD.speedHold, ENGINE, STEP_SEC, power.js, through tools/control-map/tables.mjs; G onset lag 0.05 s, roll lag 0.05 s, Padé order 6; every row an estimate until part 2's rig checks it -->

| Technique | Loop | Trim | Delay model | Crossover (rad/s) | Phase margin (°) | Gain margin (dB) | Extra-delay margin (s) | Steady share | Note |
|---|---|---|---|---|---|---|---|---|---|
| fighting wing | steering | T2 | D-Lead | 0.593 | 62.4 | 34.7 | 1.84 | - | look 3 s (1142 ft); P 0.242/s; aim-line turn 0.5 s (hidden feedback, R3); lag 0.1 s (estimate) |
| fighting wing | steering | T2 | D-Picture | 0.593 | 48.9 | 13.0 | 1.44 | - | look 3 s (1142 ft); P 0.242/s; aim-line turn 0.5 s (hidden feedback, R3); lag 0.1 s (estimate) |
| fighting wing | steering without the aim-line term | T2 | D-Lead | 0.339 | 42.6 | 38.6 | 2.19 | - | what the aim-line "feed-forward" adds: compare with the row above |
| fighting wing | steering | T1 | D-Lead | 0.377 | 70.9 | 37.7 | 3.28 | - | look 8 s (3046 ft); P 0.242/s; aim-line turn 0.5 s (hidden feedback, R3); lag 0.1 s (estimate) |
| fighting wing | steering | T1 | D-Picture | 0.377 | 62.3 | 18.3 | 2.88 | - | look 8 s (3046 ft); P 0.242/s; aim-line turn 0.5 s (hidden feedback, R3); lag 0.1 s (estimate) |
| fighting wing | steering without the aim-line term | T1 | D-Lead | 0.267 | 62.6 | 38.8 | 4.09 | - | what the aim-line "feed-forward" adds: compare with the row above |
| fighting wing | arc loop (power closed) | T2 | D-Lead | 0.086 | 80.4 | 16.4 | 16.36 | 1.00 | kc 0.5, aimSec 10 s, blend 1.5 s, limits and slew left out; same at T2 and T4: no gain here depends on Lead's turn rate |
| fighting wing | power on the arc error (arc closed) | T2 | D-Lead | - | - | - | - | - | R5 corrected: d_ss hands the speed back as offset, so power has little loop gain on closure |
| fighting wing | arc loop inner shortfall term (kc) | T2 | D-Lead | - | - | - | - | - | kc on the closure it has |
| fighting wing | arc loop (power closed) | T2 | D-Picture | 0.085 | 79.9 | 12.7 | 16.34 | 1.00 | kc 0.5, aimSec 10 s, blend 1.5 s, limits and slew left out; same at T2 and T4: no gain here depends on Lead's turn rate |
| fighting wing | power on the arc error (arc closed) | T2 | D-Picture | - | - | - | - | - | R5 corrected: d_ss hands the speed back as offset, so power has little loop gain on closure |
| fighting wing | arc loop inner shortfall term (kc) | T2 | D-Picture | - | - | - | - | - | kc on the closure it has |
| fighting wing | arc loop without the feed-forward (half-gain trap) | T2 | D-Lead | - | - | - | - | 0.50 | steady closure delivered against the wanted: about half |
| fighting wing | arc loop (power closed) | T4 | D-Lead | 0.086 | 80.4 | 16.4 | 16.36 | 1.00 | kc 0.5, aimSec 10 s, blend 1.5 s, limits and slew left out; same at T2 and T4: no gain here depends on Lead's turn rate |
| fighting wing | power on the arc error (arc closed) | T4 | D-Lead | - | - | - | - | - | R5 corrected: d_ss hands the speed back as offset, so power has little loop gain on closure |
| fighting wing | arc loop inner shortfall term (kc) | T4 | D-Lead | - | - | - | - | - | kc on the closure it has |
| fighting wing | arc loop (power closed) | T4 | D-Picture | 0.085 | 79.9 | 12.7 | 16.34 | 1.00 | kc 0.5, aimSec 10 s, blend 1.5 s, limits and slew left out; same at T2 and T4: no gain here depends on Lead's turn rate |
| fighting wing | power on the arc error (arc closed) | T4 | D-Picture | - | - | - | - | - | R5 corrected: d_ss hands the speed back as offset, so power has little loop gain on closure |
| fighting wing | arc loop inner shortfall term (kc) | T4 | D-Picture | - | - | - | - | - | kc on the closure it has |
| fighting wing | arc loop without the feed-forward (half-gain trap) | T4 | D-Lead | - | - | - | - | 0.50 | steady closure delivered against the wanted: about half |
| fighting wing | vertical PD | T1 | D-Lead | 0.685 | 66.0 | 30.8 | 1.68 | - | 0.005 G/ft, 0.02 G per ft/s; G onset 0.05 s (estimate) |
| fighting wing | vertical PD | T1 | D-Picture | 0.685 | 50.3 | 13.4 | 1.28 | - | 0.005 G/ft, 0.02 G per ft/s; G onset 0.05 s (estimate) |
| fighting wing | vertical PD | T2 | D-Lead | 0.685 | 66.0 | 30.8 | 1.68 | - | 0.005 G/ft, 0.02 G per ft/s; G onset 0.05 s (estimate) |
| fighting wing | vertical PD | T2 | D-Picture | 0.685 | 50.3 | 13.4 | 1.28 | - | 0.005 G/ft, 0.02 G per ft/s; G onset 0.05 s (estimate) |
| fighting wing | power on the swept place (PI) | T1 | D-Lead | 0.141 | 36.5 | 24.3 | 4.51 | - | P behind/10 s, I 15 s, speed hold 0.2/s, engine 0.25 s |
| fighting wing | power on the swept place (PI) | T1 | D-Picture | 0.141 | 33.3 | 16.9 | 4.11 | - | P behind/10 s, I 15 s, speed hold 0.2/s, engine 0.25 s |
| close formation | plane axis, as spec 7b.6c (no filter, no onset) | T1 | built 0.3 s | 2.032 | 36.9 | 7.8 | 0.32 | - | the check of the method: spec 7b.6c gives about 2 rad/s and 37° |
| close formation | plane axis with the 0.1 s rate filter, G onset and the step | T1 | built 0.3 s | 2.092 | 13.6 | 2.5 | 0.11 | - | Fable 13 Oct: 25.9° with the filter, about 17° with the onset (its estimate); onset lag 0.05 s here |
| close formation | plane axis, as above with a 0.15 s onset lag (sensitivity) | T1 | built 0.3 s | 2.022 | 4.0 | 0.8 | 0.03 | - | how much the onset lag guess matters; the flown axis settles in about 2 s without hunting (spec 7b status), so the true lag is small |
| close formation | line axis (bank on the pace) | T1 | built 0.3 s | 1.159 | 38.5 | 8.7 | 0.58 | - | 1.9° per ft/s at Lead's G 1; pace 0.4/s per ft |
| close formation | line axis (bank on the pace) | T2 | built 0.3 s | 2.188 | 17.6 | 2.7 | 0.14 | - | 1.9° per ft/s at Lead's G 2; pace 0.4/s per ft |
| close formation | hinge axis (torque on the pace) | T1 | built 0.3 s | 0.908 | 30.9 | 8.5 | 0.59 | - | 12% per ft/s, 0.036 kt/s per % (power.js); torque rate limit left out |

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

| Table | Leaf numbers | ruling | geometry | search | tuning | sweep | label | unused | Recommended removes | Changes |
|---|---|---|---|---|---|---|---|---|---|---|
| CLOSE_SEE | 3 | 1 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 |
| CLOSE_WING | 62 | 8 | 1 | 0 | 53 | 0 | 0 | 0 | 0 | 0 |
| FW_SEE | 6 | 1 | 0 | 0 | 3 | 1 | 0 | 1 | 1 | 0 |
| FW_WING | 94 | 12 | 0 | 3 | 78 | 0 | 1 | 0 | 33 | 12 |

| Added by the recommended structure | Value | Role | Source |
|---|---|---|---|
| approach angle out (lag) | 20° | ruling | TS-233 (steer-behind 20°) |
| approach angle in (lead) | 12° | ruling | TS-233 (steer-ahead 12°) |
| approach law k | about 1 per 150 ft | tuning | review 2.2 (guess) |
| course gain | about today's 0.05 G/deg | tuning | review 2.2 |
| phase thresholds (roll seen, captured) | 2 | tuning | review 2.1 |
| energy intent (gain, bleed thresholds, trim) | 3 | tuning | review 2.3 |
| exit vertical (gain, blend) | 2 | tuning | review 2.3; ruling 14 Oct 2026 (any height in the cone's range) |
| guard taper (shape, time) | 1-2 | tuning | ruling 14 Oct 2026: straight-line or square-root, an estimate for the guard-rail slice |

| Number | Value (code) | Role | Block | Recommended structure | Source (numbers.md) |
|---|---|---|---|---|---|
| `CLOSE_SEE.delaySec` | 0.3 | ruling | Sight (perceive) | keeps | everything he sees reaches his hands about 0.3 s late (TS-211, estimate; Tohidi and Yildiz (2020) measured 0.3 s as a pilot's total delay, decision plus neur... |
| `CLOSE_SEE.filterSec` | 0.1 | tuning | Sight (perceive) | keeps | the rates he reads (the picture moving, Lead's roll and its build-up, Lead's G) are smoothed over about 0.1 s, as an eye judges motion over a moment: at most... |
| `CLOSE_SEE.aheadSec` | 0.3 | tuning | Sight (perceive) | keeps | he dead-reckons Lead's bank across his own delay: seen bank + rate x 0.3 + half the build-up x 0.3² (spec 7b.6d item 5) |
| `CLOSE_WING.plane.kp` | 0.04 | tuning | Three axes (closeLaw) | keeps | Pitch, on the plane axis: G per foot and per ft/s (spec 7b.6c's starting gains; with the 0.3 s reaction about 2 rad/s and 37° of phase margin, the Fable audi... |
| `CLOSE_WING.plane.kd` | 0.06 | tuning | Three axes (closeLaw) | keeps | Pitch, on the plane axis: G per foot and per ft/s (spec 7b.6c's starting gains; with the 0.3 s reaction about 2 rad/s and 37° of phase margin, the Fable audi... |
| `CLOSE_WING.plane.ki` | 0 | tuning | Three axes (closeLaw) | keeps | Pitch, on the plane axis: G per foot and per ft/s (spec 7b.6c's starting gains; with the 0.3 s reaction about 2 rad/s and 37° of phase margin, the Fable audi... |
| `CLOSE_WING.plane.iMax` | 0 | tuning | Three axes (closeLaw) | keeps | Pitch, on the plane axis: G per foot and per ft/s (spec 7b.6c's starting gains; with the 0.3 s reaction about 2 rad/s and 37° of phase margin, the Fable audi... |
| `CLOSE_WING.kPosPerSec` | 0.4 | tuning | Three axes (closeLaw) | keeps | In Lead's wing plane both loops are a cascade (spec 7b.6c "Power is a cascade"): the distance to his place picks one pace straight at it, and roll and power ... |
| `CLOSE_WING.side.kdDegPerFtps` | 1.9 | tuning | Three axes (closeLaw) | keeps | Roll, in and out: degrees of bank off Lead's per ft/s of pace error (spec 7b.6d item 7: 1.7 to 2.1° per ft/s, crossover 1.0 to 1.2 rad/s; estimate), so 0.76°... |
| `CLOSE_WING.side.ki` | 0 | tuning | Three axes (closeLaw) | keeps | Roll, in and out: degrees of bank off Lead's per ft/s of pace error (spec 7b.6d item 7: 1.7 to 2.1° per ft/s, crossover 1.0 to 1.2 rad/s; estimate), so 0.76°... |
| `CLOSE_WING.side.iMax` | 0 | tuning | Three axes (closeLaw) | keeps | Roll, in and out: degrees of bank off Lead's per ft/s of pace error (spec 7b.6d item 7: 1.7 to 2.1° per ft/s, crossover 1.0 to 1.2 rad/s; estimate), so 0.76°... |
| `CLOSE_WING.fore.kdPctPerFtps` | 12 | tuning | Three axes (closeLaw) | keeps | Power, forward and back: about 12% torque per ft/s of pace error (spec 7b.6d item 7: 10 to 13%, estimate), so 4.8% per foot near the spot. Trim from zero as ... |
| `CLOSE_WING.fore.ki` | 0 | tuning | Three axes (closeLaw) | keeps | Power, forward and back: about 12% torque per ft/s of pace error (spec 7b.6d item 7: 10 to 13%, estimate), so 4.8% per foot near the spot. Trim from zero as ... |
| `CLOSE_WING.fore.iMax` | 0 | tuning | Three axes (closeLaw) | keeps | Power, forward and back: about 12% torque per ft/s of pace error (spec 7b.6d item 7: 10 to 13%, estimate), so 4.8% per foot near the spot. Trim from zero as ... |
| `CLOSE_WING.deadFt` | 0 | ruling | Three axes (closeLaw) | keeps | No threshold (Patrick 13 Oct 2026: "we notice ANY drift from the ideal references. if we're not exactly on plane or exactly on the line we will correct, unti... |
| `CLOSE_WING.deadFtps` | 0 | ruling | Three axes (closeLaw) | keeps | No threshold (Patrick 13 Oct 2026: "we notice ANY drift from the ideal references. if we're not exactly on plane or exactly on the line we will correct, unti... |
| `CLOSE_WING.paceFtps` | 8 | ruling | Three axes (closeLaw) | keeps | The pace: at most jogging, 8 ft/s, in B1 (Patrick 13 Oct 2026: "yes 8 ft/s and 13 ft/s works"; "start with slower rates until we figure out how to tune the P... |
| `CLOSE_WING.brakeTorquePct` | 20 | tuning | Three axes (closeLaw) | keeps | The pace: at most jogging, 8 ft/s, in B1 (Patrick 13 Oct 2026: "yes 8 ft/s and 13 ft/s works"; "start with slower rates until we figure out how to tune the P... |
| `CLOSE_WING.boardsBelowPct` | 10 | ruling | Shaper (the hand) | keeps | Below 10% torque he would use the boards before idle (Patrick 13 Oct 2026, "sure 10% tq for boards"; TS-61's order). The live step has no boards' drag, so B1... |
| `CLOSE_WING.rollCatchUp` | 0.6 | tuning | Lift (liftFor) | keeps | while his bank is behind the bank his lift asks for he rolls this share of the gap past it, so he rolls faster than Lead until caught up (Patrick 13 Oct 2026... |
| `CLOSE_WING.telegraphTorquePctps` | 20 | tuning | Shaper (the hand) | keeps | while he sees Lead rolling his hand moves the throttle at up to 20%/s (spec 7b.6d item 6: about 10%/s on station, 15-20%/s in a telegraph; estimate) |
| `CLOSE_WING.handOverBrakeKtps` | 1.3 | geometry | Supervisor | keeps | The hand-over from a change into echelon (events.js liveHandOver; spec 7b.6d items 2 and 3): he is handed over only closing slowly enough to stop on his plac... |
| `CLOSE_WING.handOverReactSec` | 0.3 | ruling | Supervisor | keeps | The hand-over from a change into echelon (events.js liveHandOver; spec 7b.6d items 2 and 3): he is handed over only closing slowly enough to stop on his plac... |
| `CLOSE_WING.jobs.onStation.gCap` | 0.3 | tuning | Shaper (the hand) | keeps | The pilot's hand (spec 7b.4 and 7b.6d item 6; estimates), by job: the most G off what Lead's motion needs, the most bank off Lead's, the most torque off the ... |
| `CLOSE_WING.jobs.onStation.bankCapDeg` | 5 | tuning | Shaper (the hand) | keeps | The pilot's hand (spec 7b.4 and 7b.6d item 6; estimates), by job: the most G off what Lead's motion needs, the most bank off Lead's, the most torque off the ... |
| `CLOSE_WING.jobs.onStation.torqueCapPct` | 10 | tuning | Shaper (the hand) | keeps | The pilot's hand (spec 7b.4 and 7b.6d item 6; estimates), by job: the most G off what Lead's motion needs, the most bank off Lead's, the most torque off the ... |
| `CLOSE_WING.jobs.onStation.torquePctps` | 10 | tuning | Shaper (the hand) | keeps | The pilot's hand (spec 7b.4 and 7b.6d item 6; estimates), by job: the most G off what Lead's motion needs, the most bank off Lead's, the most torque off the ... |
| `CLOSE_WING.jobs.smallMove.gCap` | 0.3 | tuning | Shaper (the hand) | keeps | The pilot's hand (spec 7b.4 and 7b.6d item 6; estimates), by job: the most G off what Lead's motion needs, the most bank off Lead's, the most torque off the ... |
| `CLOSE_WING.jobs.smallMove.bankCapDeg` | 5 | tuning | Shaper (the hand) | keeps | The pilot's hand (spec 7b.4 and 7b.6d item 6; estimates), by job: the most G off what Lead's motion needs, the most bank off Lead's, the most torque off the ... |
| `CLOSE_WING.jobs.smallMove.torqueCapPct` | 10 | tuning | Shaper (the hand) | keeps | The pilot's hand (spec 7b.4 and 7b.6d item 6; estimates), by job: the most G off what Lead's motion needs, the most bank off Lead's, the most torque off the ... |
| `CLOSE_WING.jobs.smallMove.torquePctps` | 10 | tuning | Shaper (the hand) | keeps | The pilot's hand (spec 7b.4 and 7b.6d item 6; estimates), by job: the most G off what Lead's motion needs, the most bank off Lead's, the most torque off the ... |
| `CLOSE_WING.jobs.largeMove.gCap` | 0.5 | tuning | Shaper (the hand) | keeps | The pilot's hand (spec 7b.4 and 7b.6d item 6; estimates), by job: the most G off what Lead's motion needs, the most bank off Lead's, the most torque off the ... |
| `CLOSE_WING.jobs.largeMove.bankCapDeg` | 15 | tuning | Shaper (the hand) | keeps | The pilot's hand (spec 7b.4 and 7b.6d item 6; estimates), by job: the most G off what Lead's motion needs, the most bank off Lead's, the most torque off the ... |
| `CLOSE_WING.jobs.largeMove.torqueCapPct` | 100 | tuning | Shaper (the hand) | keeps | The pilot's hand (spec 7b.4 and 7b.6d item 6; estimates), by job: the most G off what Lead's motion needs, the most bank off Lead's, the most torque off the ... |
| `CLOSE_WING.jobs.largeMove.torquePctps` | 20 | tuning | Shaper (the hand) | keeps | The pilot's hand (spec 7b.4 and 7b.6d item 6; estimates), by job: the most G off what Lead's motion needs, the most bank off Lead's, the most torque off the ... |
| `CLOSE_WING.jobs.outBeforeUp.gCap` | 0.5 | tuning | Shaper (the hand) | keeps | The pilot's hand (spec 7b.4 and 7b.6d item 6; estimates), by job: the most G off what Lead's motion needs, the most bank off Lead's, the most torque off the ... |
| `CLOSE_WING.jobs.outBeforeUp.bankCapDeg` | 15 | tuning | Shaper (the hand) | keeps | The pilot's hand (spec 7b.4 and 7b.6d item 6; estimates), by job: the most G off what Lead's motion needs, the most bank off Lead's, the most torque off the ... |
| `CLOSE_WING.jobs.outBeforeUp.torqueCapPct` | 100 | tuning | Shaper (the hand) | keeps | The pilot's hand (spec 7b.4 and 7b.6d item 6; estimates), by job: the most G off what Lead's motion needs, the most bank off Lead's, the most torque off the ... |
| `CLOSE_WING.jobs.outBeforeUp.torquePctps` | 20 | tuning | Shaper (the hand) | keeps | The pilot's hand (spec 7b.4 and 7b.6d item 6; estimates), by job: the most G off what Lead's motion needs, the most bank off Lead's, the most torque off the ... |
| `CLOSE_WING.jobs.offStation.gCap` | 0.5 | tuning | Shaper (the hand) | keeps | B3: a change between close places, a large move's sizes (estimate) |
| `CLOSE_WING.jobs.offStation.bankCapDeg` | 15 | tuning | Shaper (the hand) | keeps | B3: a change between close places, a large move's sizes (estimate) |
| `CLOSE_WING.jobs.offStation.torqueCapPct` | 100 | tuning | Shaper (the hand) | keeps | B3: a change between close places, a large move's sizes (estimate) |
| `CLOSE_WING.jobs.offStation.torquePctps` | 20 | tuning | Shaper (the hand) | keeps | B3: a change between close places, a large move's sizes (estimate) |
| `CLOSE_WING.offStation.paceFtps` | 8 | ruling | Station change and deconfliction | keeps | at most jogging, 8 ft/s, on every close move for now (Patrick 14 Oct 2026, "Jogging only for now"; spec 7c.4) |
| `CLOSE_WING.offStation.intoEchelonFtps` | 5 | tuning | Station change and deconfliction | keeps | from the corner forward and up into echelon at about 5 ft/s (spec 7c.3, approved 14 Oct 2026; an estimate beside SMM 12.20 paras 45, 47) |
| `CLOSE_WING.offStation.flowFt` | 5 | tuning | Station change and deconfliction | keeps | a place on the way is passed once within 5 ft of it ... (TS-117: corners passed within 5 ft, an estimate) |
| `CLOSE_WING.offStation.flowKt` | 5 | ruling | Station change and deconfliction | keeps | ... and no faster against it than 5 kt (TS-117, Patrick 6 Oct 05:29Z: "can be moving 5 knots thru corners") |
| `CLOSE_WING.offStation.doneFt` | 1.5 | tuning | Station change and deconfliction | keeps | on the last place the change's own list ends within the small move's 1.5 ft (smallFromFt) ... |
| `CLOSE_WING.offStation.doneFtps` | 1.5 | tuning | Station change and deconfliction | keeps | ... moving under a gentle drift (driftBackFtps); he holds it from there as always |
| `CLOSE_WING.deconflict.noseTailDeadFt` | 2 | tuning | Station change and deconfliction | keeps | no wings overlapping (SMM 12.20 para 44 CAUTION: "never overlap the wing of another aircraft"; para 45: nose at least 10 ft behind Lead's tail, below the pro... |
| `CLOSE_WING.deconflict.lookAheadSec` | 1 | tuning | Station change and deconfliction | keeps | about what stopping from 8 ft/s across takes with 15° of bank and his 0.3 s reaction (standard kinematics) |
| `CLOSE_WING.deconflict.spanDeadFt` | 2 | tuning | Station change and deconfliction | keeps | never within a wingspan (centre to centre): inside span + 2 ft he aims straight away from Lead to span + 4 ft |
| `CLOSE_WING.deconflict.aheadDeadFt` | 5 | tuning | Station change and deconfliction | keeps | never ahead of Lead's 3/9 line: further forward than 5 ft behind it he aims 10 ft behind it |
| `CLOSE_WING.capsPerSec.g` | 0.5 | tuning | Shaper (the hand) | keeps | a new job's pressure sizes are eased in, never stepped (bumpless; estimates) |
| `CLOSE_WING.capsPerSec.bankDeg` | 10 | tuning | Shaper (the hand) | keeps | a new job's pressure sizes are eased in, never stepped (bumpless; estimates) |
| `CLOSE_WING.capsPerSec.torquePct` | 30 | tuning | Shaper (the hand) | keeps | a new job's pressure sizes are eased in, never stepped (bumpless; estimates) |
| `CLOSE_WING.smallFromFt` | 1.5 | tuning | Supervisor | keeps | The supervisor's jobs, each with a dead band so it never flickers (spec 7b.6d item 12; estimates): a small move from 1.5 ft off (the 0.5 ft he can see and a ... |
| `CLOSE_WING.stationFromFt` | 1 | tuning | Supervisor | keeps | The supervisor's jobs, each with a dead band so it never flickers (spec 7b.6d item 12; estimates): a small move from 1.5 ft off (the 0.5 ft he can see and a ... |
| `CLOSE_WING.largeFromFt` | 10 | ruling | Supervisor | keeps | The supervisor's jobs, each with a dead band so it never flickers (spec 7b.6d item 12; estimates): a small move from 1.5 ft off (the 0.5 ft he can see and a ... |
| `CLOSE_WING.smallBackFt` | 8 | tuning | Supervisor | keeps | The supervisor's jobs, each with a dead band so it never flickers (spec 7b.6d item 12; estimates): a small move from 1.5 ft off (the 0.5 ft he can see and a ... |
| `CLOSE_WING.driftFtps` | 2 | tuning | Supervisor | keeps | ... and a large move too while he is moving faster than a gentle drift (spec 7b.6: "a gentle drift for a few feet, up to a jogging pace"), 2 ft/s, back under... |
| `CLOSE_WING.driftBackFtps` | 1.5 | tuning | Supervisor | keeps | ... and a large move too while he is moving faster than a gentle drift (spec 7b.6: "a gentle drift for a few feet, up to a jogging pace"), 2 ft/s, back under... |
| `CLOSE_WING.underClearFt` | 2 | tuning | Supervisor | keeps | ... and a large move too while he is moving faster than a gentle drift (spec 7b.6: "a gentle drift for a few feet, up to a jogging pace"), 2 ft/s, back under... |
| `CLOSE_WING.plhBandFt` | 2 | tuning | Supervisor | keeps | Plane, line, hinge (Patrick 13 Oct 2026): in a large move the line's error is shown to the loops once he is within 2 ft of the plane, and the error along the... |
| `CLOSE_WING.plhPerSec` | 0.5 | tuning | Supervisor | keeps | Plane, line, hinge (Patrick 13 Oct 2026): in a large move the line's error is shown to the loops once he is within 2 ft of the plane, and the error along the... |
| `FW_SEE.delaySec` | 0.4 | ruling | Sight (seeFw) | keeps | he acts 0.4 s after he sees Lead's bank and nose start (Patrick 14 Oct 2026; TS-211's 0.3-0.5 s) |
| `FW_SEE.extraDelaySec` | 0 | sweep | Sight (seeFw) | keeps: analysis knob; part 2 adds the whole-picture delay beside it | a further delay he does not know he has (his dead reckoning still carries Lead 0.4 s): the delay sweep's (Fable's loop margins), 0 in flying |
| `FW_SEE.closureSec` | 1 | tuning | Sight (seeFw) | keeps | closure (the range's rate) smoothed over about 1 s: the manual calls its change subtle (SMM 12.2 para 5) |
| `FW_SEE.losSec` | 0.5 | tuning | Sight (seeFw) | keeps | the line of sight's rate, Lead's drift across the windscreen, smoothed over about 0.5 s (spec 7e.7) |
| `FW_SEE.gSec` | 0.1 | tuning | Sight (seeFw) | keeps | Lead's G (his lift, so his turn circle) read as close formation reads it, over about 0.1 s (CLOSE_SEE.filterSec) |
| `FW_SEE.historySec` | 6 | unused | Sight (seeFw) | removes: no caller since the tidy | how long he remembers where Lead was (the lag aim's "where Lead was", 7e.7; estimate) |
| `FW_WING.gPerDeg` | 0.05 | tuning | Steering (steerToAim) | changes: the approach-angle law's gain | P: about 0.05 G per degree between his path and the line to his aim point, 1 G per 20° (spec 7e.7; Fable F6, estimate) |
| `FW_WING.aimTurnSec` | 0.5 | tuning | Steering (steerToAim) | removes: the aim line's smoothing goes with the moving aim point (review 3) | the aim line's turn read over about 0.5 s, as the line of sight's (spec 7e.7; estimate) |
| `FW_WING.aimTurnCap.k` | 1.5 | tuning | Steering (steerToAim) | removes: no aim point to jump (review 3) | ... and fed forward within 1.5 times Lead's turn rate plus 3°/s (thread, round 4, estimates): a change of aim (lag first, the nose behind, a job's blend) jum... |
| `FW_WING.aimTurnCap.plusDps` | 3 | tuning | Steering (steerToAim) | removes: no aim point to jump (review 3) | ... and fed forward within 1.5 times Lead's turn rate plus 3°/s (thread, round 4, estimates): a change of aim (lag first, the nose behind, a job's blend) jum... |
| `FW_WING.overLeadG` | 1.5 | tuning | G cap | keeps: an estimate (spec 7e.7), not a ruling | his G no more than Lead's + 1.5 (spec 7e.7, estimate); the guard and filter may pull to what the aircraft gives, flagged (Patrick 14 Oct 2026) |
| `FW_WING.minG` | 0.5 | tuning | Lift (liftWithin) | keeps | never under 0.5 G, so his lift always has a direction (estimate) |
| `FW_WING.rollDps` | 60 | tuning | #2 point mass | keeps: an estimate (spec 7e.7) | roll up to 60°/s (spec 7e.7, estimate); his bank is not capped: past 90° only when the lift he needs points there (Patrick 14 Oct 2026, "only if required") |
| `FW_WING.pullWithinDeg` | 20 | tuning | Lift (liftWithin) | keeps | unload, roll, pull: with his wings more than 20° off where the lift is wanted he pulls only its share along them (estimate; fw-live.js does the same) |
| `FW_WING.turnPlaneRadps` | 0.0175 | tuning | Steering (steerToAim) | keeps | steering in Lead's turn plane once Lead turns faster than about 1°/s, else the level plane (estimate) |
| `FW_WING.blendSec` | 1.5 | tuning | Steering (steerToAim) | changes: phase blends of the path, not an every-step lag on the aim point (R11) | a change of aim blends over about 1.5 s; the guard's and the nose behind at once (spec 7e.7: 1-2 s; Fable F17) |
| `FW_WING.turnStartDeg` | 10 | tuning | Jobs (fwJob) | changes: the phase starts at the roll seen, no 1 s hold (review 2.1) | Lead's turn starts once his seen bank passes 10° for 1 s ... |
| `FW_WING.turnEndDeg` | 5 | tuning | Jobs (fwJob) | keeps | ... and ends under 5° for 1 s; a reversal is his bank's sign changing past 10° (spec 7e.7, Fable F4; estimates) |
| `FW_WING.turnHoldSec` | 1 | tuning | Jobs (fwJob) | changes: no hold at the entry (review 2.1) | ... each held 1 s (spec 7e.7, Fable F4; estimate) |
| `FW_WING.happyFt.0` | 600 | ruling | Jobs (fwJob) | keeps | the range he is happy at, slant (Patrick 14 Oct 2026) |
| `FW_WING.happyFt.1` | 650 | ruling | Jobs (fwJob) | keeps | the range he is happy at, slant (Patrick 14 Oct 2026) |
| `FW_WING.stretchedFt` | 700 | ruling | Jobs (fwJob) | keeps | the entry case: stretched past 700 ft (Patrick 14 Oct 2026: "lead if more than 700, lag if near 500 (? numbers are a guess)") ... |
| `FW_WING.tightFt` | 560 | tuning | Jobs (fwJob) | keeps | ... tight under 560 ft (an estimate between) |
| `FW_WING.turnFrameDeg` | 5 | tuning | Arc range (s, d) | keeps | (s, d) in Lead's turn-centre frame; below 5° of his bank their straight-line limits (Fable F10, estimate) |
| `FW_WING.arcTargetFt` | 650 | ruling | Arc loop (aimInTurn) | keeps | s_target, the arc behind Lead he holds in a turn (Fable F1; Patrick's happy 600-650 ft) |
| `FW_WING.aimSec` | 10 | tuning | Arc loop (aimInTurn) | keeps | wanted closure = range error / 10 s (spec 7e.7: 75 ft off asks 7.5 ft/s); the swept place's power uses it too |
| `FW_WING.arcNearFt` | 300 | tuning | Arc loop (aimInTurn) | changes: a phased limit instead of a jump (switch arcLimit) | the wanted closure at most 25 ft/s within 300 ft of the target arc ... (Fable F1, estimate) |
| `FW_WING.arcNearFtps` | 25 | tuning | Arc loop (aimInTurn) | keeps | ... 25 ft/s near (Fable F1, estimate) |
| `FW_WING.arcFarFtps` | 60 | tuning | Arc loop (aimInTurn) | keeps | ... and 60 ft/s beyond (Fable F1, estimate) |
| `FW_WING.arcKc` | 0.5 | tuning | Arc loop (aimInTurn) | keeps | the offset from Lead's circle d = d_ss + wanted / omega + kc (wanted - closing) / omega: kc 0.5 corrects the shortfall without the half-gain trap (research f... |
| `FW_WING.arcOffsetMaxFt` | 400 | tuning | Arc loop (aimInTurn) | keeps | d within ±400 ft (Fable F1, estimate); R - d stays well positive (Lead's radius about 2,600 ft at 60°/2 G) |
| `FW_WING.arcSlewFtps` | 60 | tuning | Arc loop (aimInTurn) | keeps | d slewed at 60 ft/s (Fable F1, F11, estimate) |
| `FW_WING.minTurnRadps` | 0.03 | tuning | Arc loop (aimInTurn) | keeps | d divides by Lead's turn rate, never by less than about 1.7°/s (Fable F3) |
| `FW_WING.circleLookSec` | 3 | tuning | Arc loop (aimInTurn) | removes: the look-ahead point goes (review 3) | he follows the circle d inside Lead's, aiming 3 s of his flight ahead on it (about 1,100 ft at 200 KIAS; Fable F7 keeps 3 s; estimate) ... |
| `FW_WING.circleLeastFt` | 500 | tuning | Arc loop (aimInTurn) | removes: with the look-ahead point | ... never a circle tighter than 500 ft (estimate, a catch) |
| `FW_WING.routeFt` | 120 | label | Arc loop (aimInTurn) | removes: names the aim in the trace only | the route positions about 120 ft inside and outside Lead's circle (spec 7e.7; route 121 ft out, slots.js, TS-181): the trace calls the aim lead or lag past a... |
| `FW_WING.lagFirst.deg` | 20 | tuning | Lag first | removes: ruled out 14 Oct 2026 | Lag first on a turn into him (research: US Navy CNATRA P-357 section 701; Patrick's "turn slightly toward Lead's tail", SMM 12.29 Fig 12.20): once Lead's ban... |
| `FW_WING.lagFirst.sec` | 2.5 | tuning | Lag first | removes: ruled out 14 Oct 2026 | Lag first on a turn into him (research: US Navy CNATRA P-357 section 701; Patrick's "turn slightly toward Lead's tail", SMM 12.29 Fig 12.20): once Lead's ban... |
| `FW_WING.lagFirst.easeSec` | 1 | tuning | Lag first | removes: ruled out 14 Oct 2026 | Lag first on a turn into him (research: US Navy CNATRA P-357 section 701; Patrick's "turn slightly toward Lead's tail", SMM 12.29 Fig 12.20): once Lead's ban... |
| `FW_WING.behind.downFt` | 300 | tuning | Nose behind | removes: the follower never puts him there (review 3) | The nose behind Lead while the wing line is out of reach (Patrick 14 Oct 2026, TS-233: never ahead of Lead's 3/9 line, "nose pointed BEHIND Lead, banking ste... |
| `FW_WING.behind.clearFt` | 200 | tuning | Nose behind | removes: the follower never puts him there (review 3) | The nose behind Lead while the wing line is out of reach (Patrick 14 Oct 2026, TS-233: never ahead of Lead's 3/9 line, "nose pointed BEHIND Lead, banking ste... |
| `FW_WING.sweptFt` | 625 | ruling | Swept aim (aimSwept) | keeps | 625 ft at 45° (Patrick 14 Oct 2026) |
| `FW_WING.sweptDeg` | 45 | ruling | Swept aim (aimSwept) | keeps | ... 45° of sweep back from Lead's wing line (Patrick 14 Oct 2026) |
| `FW_WING.sweptLookSec` | 8 | tuning | Swept aim (aimSwept) | removes: the line follower replaces the look-ahead (review 3) | he steers at his place carried 8 s ahead along Lead's path, so the sideways error closes in about 8 s (estimate, near the aim loop's 0.1 rad/s) |
| `FW_WING.aimMaxFtps` | 25 | tuning | Swept aim (aimSwept) | keeps | fore and aft by power: the closure wanted at most ±25 ft/s (spec 7e.7) |
| `FW_WING.aimSlewFtps` | 20 | tuning | Swept aim (aimSwept) | keeps | the turn's offset slewed back to 0 at 20 ft/s (spec 7e.7) |
| `FW_WING.sTurnFt` | 550 | tuning | Jobs (fwJob) | keeps | S-turns across the cone when too tight with Lead level (Patrick 14 Oct 2026): under 550 ft, or closing faster than 15 ft/s inside the happy band's far edge, ... |
| `FW_WING.sTurnClosureFtps` | 15 | tuning | Jobs (fwJob) | keeps | S-turns across the cone when too tight with Lead level (Patrick 14 Oct 2026): under 550 ft, or closing faster than 15 ft/s inside the happy band's far edge, ... |
| `FW_WING.sTurnDoneFt` | 600 | tuning | Jobs (fwJob) | keeps | S-turns across the cone when too tight with Lead level (Patrick 14 Oct 2026): under 550 ft, or closing faster than 15 ft/s inside the happy band's far edge, ... |
| `FW_WING.stackFt` | -50 | ruling | Jobs (fwJob) | keeps | his stack: 50 ft below Lead (Patrick 14 Oct 2026, spec 7e.7 swept) |
| `FW_WING.heightBandFt` | 200 | ruling | Jobs (fwJob) | changes: where he settles, not a limit on the exit vertical (ruling 14 Oct 2026) | within 200 ft of Lead's height (TS-80; a reference, not a wall: the guard may pass it); the high yo-yo's most |
| `FW_WING.vertGPerFt` | 0.005 | tuning | Vertical PD | keeps | 0.005 G per foot and 0.02 G per ft/s (spec 7e.7's starting gains, Fable F6, damping about 0.8) ... |
| `FW_WING.vertGPerFtps` | 0.02 | tuning | Vertical PD | keeps | ... and 0.02 G per ft/s of his height rate against Lead's (spec 7e.7, Fable F6) |
| `FW_WING.vertMaxG` | 1 | tuning | Vertical PD | keeps | ... at most 1 G either way (estimate) |
| `FW_WING.quickFixFt` | 150 | tuning | Jobs (fwJob) | removes: folds into the exit vertical (review 3) | The quick fix in straight flight (spec 7e.7, Fable F7): a range error over 150 ft or closure over 20 ft/s moves the height target to ±150 ft (down to close, ... |
| `FW_WING.quickFixFtps` | 20 | tuning | Jobs (fwJob) | removes: folds into the exit vertical | The quick fix in straight flight (spec 7e.7, Fable F7): a range error over 150 ft or closure over 20 ft/s moves the height target to ±150 ft (down to close, ... |
| `FW_WING.quickFixHeightFt` | 150 | tuning | Jobs (fwJob) | removes: folds into the exit vertical | The quick fix in straight flight (spec 7e.7, Fable F7): a range error over 150 ft or closure over 20 ft/s moves the height target to ±150 ft (down to close, ... |
| `FW_WING.quickReleaseFt` | 75 | tuning | Jobs (fwJob) | removes: folds into the exit vertical | The quick fix in straight flight (spec 7e.7, Fable F7): a range error over 150 ft or closure over 20 ft/s moves the height target to ±150 ft (down to close, ... |
| `FW_WING.quickReleaseFtps` | 10 | tuning | Jobs (fwJob) | removes: folds into the exit vertical; also read by S-turns and the exit side | The quick fix in straight flight (spec 7e.7, Fable F7): a range error over 150 ft or closure over 20 ft/s moves the height target to ±150 ft (down to close, ... |
| `FW_WING.quickSec` | 2 | tuning | Jobs (fwJob) | removes: folds into the exit vertical's blend | The quick fix in straight flight (spec 7e.7, Fable F7): a range error over 150 ft or closure over 20 ft/s moves the height target to ±150 ft (down to close, ... |
| `FW_WING.stackReturnSec` | 15 | tuning | Jobs (fwJob) | keeps | The quick fix in straight flight (spec 7e.7, Fable F7): a range error over 150 ft or closure over 20 ft/s moves the height target to ±150 ft (down to close, ... |
| `FW_WING.lowFt` | 300 | tuning | Jobs (fwJob) | removes: low inside folds into the energy intent (review 3) | "a few hundred feet" (estimate) |
| `FW_WING.lowStartKt` | 5 | tuning | Jobs (fwJob) | removes: into the intent | short of energy: more than 5 KIAS slower than Lead (estimate) ... |
| `FW_WING.lowEndKt` | 1 | tuning | Jobs (fwJob) | removes: into the intent | ... until back within 1 KIAS of him (estimate) |
| `FW_WING.yoyo.slowKt` | 10 | tuning | High yo-yo | removes: the yo-yo's speed trigger (review 3) | the trigger: the speed that holds his radius round Lead's centre more than 10 kt under his own (Fable F8, estimate), with power already back (asking at least... |
| `FW_WING.yoyo.powerBackKt` | 5 | tuning | High yo-yo | removes: a power-to-yo-yo link (R9) | the trigger: the speed that holds his radius round Lead's centre more than 10 kt under his own (Fable F8, estimate), with power already back (asking at least... |
| `FW_WING.yoyo.excessFtps` | 20 | tuning | High yo-yo | removes: the speed trigger | the trigger: the speed that holds his radius round Lead's centre more than 10 kt under his own (Fable F8, estimate), with power already back (asking at least... |
| `FW_WING.yoyo.minFt` | 100 | tuning | High yo-yo | keeps | never planned inside 500 ft slant (Patrick, TS-208, TS-233) |
| `FW_WING.yoyo.exitArcFt` | 150 | tuning | High yo-yo | keeps | the exit: on Lead's circle (within 150 ft of it) with the arc error under 150 ft (Fable F8, estimates), or more than 150 ft behind his place, or opening; the... |
| `FW_WING.yoyo.onCircleFt` | 150 | tuning | High yo-yo | keeps | the exit: on Lead's circle (within 150 ft of it) with the arc error under 150 ft (Fable F8, estimates), or more than 150 ft behind his place, or opening; the... |
| `FW_WING.yoyo.downEndFt` | 50 | tuning | High yo-yo | keeps | the exit: on Lead's circle (within 150 ft of it) with the arc error under 150 ft (Fable F8, estimates), or more than 150 ft behind his place, or opening; the... |
| `FW_WING.yoyo.highFt` | 100 | ruling | Pitch owner | keeps | "already high": more than 100 ft above Lead, pass-clear goes above (TS-233; Fable F9, Q4) |
| `FW_WING.yoyo.ownerHoldSec` | 2 | tuning | High yo-yo | keeps | 2 s between pitch owners; pass-clear and the nose behind take it at once (Fable F9, estimate) |
| `FW_WING.powerBandKias` | 15 | ruling | Power (powerAsk) | keeps | within 15 KIAS of Lead (Patrick 4 Oct 19:12Z) |
| `FW_WING.powerSec` | 15 | tuning | Power (powerAsk) | keeps | swept: PI, the integral's time constant (spec 7e.7: 15-20 s) |
| `FW_WING.powerArcSec` | 15 | tuning | Power (powerAsk) | changes: power serves the intent and pays G's drag; the arc error belongs to the arc loop (R5) | in a turn: P on the arc error over 15 s, about 0.067 rad/s, under the 0.07 its loop sits at (Fable F1, F6, estimate) |
| `FW_WING.brakes.idleFtps` | 40 | tuning | Power (powerAsk) | keeps | Idle and the speed brake (Patrick 14 Oct 2026, TS-233: his to use, smartly, since it is easy to get stretched after): idle once closing faster than 40 ft/s, ... |
| `FW_WING.brakes.idleOffFtps` | 25 | tuning | Power (powerAsk) | keeps | Idle and the speed brake (Patrick 14 Oct 2026, TS-233: his to use, smartly, since it is easy to get stretched after): idle once closing faster than 40 ft/s, ... |
| `FW_WING.brakes.boardsFtps` | 60 | tuning | Power (powerAsk) | keeps | Idle and the speed brake (Patrick 14 Oct 2026, TS-233: his to use, smartly, since it is easy to get stretched after): idle once closing faster than 40 ft/s, ... |
| `FW_WING.brakes.boardsOffFtps` | 35 | tuning | Power (powerAsk) | keeps | Idle and the speed brake (Patrick 14 Oct 2026, TS-233: his to use, smartly, since it is easy to get stretched after): idle once closing faster than 40 ft/s, ... |
| `FW_WING.brakes.slowKt` | 0 | tuning | Power (powerAsk) | changes: a relay on speed; the intent replaces it (review F12) | the trigger: the speed that holds his radius round Lead's centre more than 10 kt under his own (Fable F8, estimate), with power already back (asking at least... |
| `FW_WING.guard.minFt` | 500 | ruling | Separation filter | keeps | never planned inside 500 ft slant (Patrick, TS-208, TS-233) |
| `FW_WING.guard.engageFt` | 600 | tuning | Guard (fwGuard) | removes: the taper from 600 to 500 ft replaces the 600 ft floor and the 600/700 engage and release (ruling 14 Oct 2026); 600 stays as the taper's top | the guard engages once the predicted pass is under 600 ft (spec 7e.7, estimate) ... |
| `FW_WING.guard.releaseFt` | 700 | tuning | Guard (fwGuard) | removes: the taper (ruling) | ... and releases once over 700 ft, predicted and now, held 3 s (spec 7e.7, estimates) |
| `FW_WING.guard.releaseSec` | 3 | tuning | Guard (fwGuard) | removes: the taper (ruling) | ... held 3 s (spec 7e.7, estimate) |
| `FW_WING.guard.lookSec` | 5 | tuning | Separation filter | changes: the whole closing part of the relative motion, about 10 s at most (review 2.5) | the pass predicted up to 5 s ahead (spec 7e.7: 3-5 s), every 0.25 s; the guard adds the 0.4 s he sees late |
| `FW_WING.guard.lookStepSec` | 0.25 | search | Separation filter | keeps | ... in 0.25 s steps (search effort) |
| `FW_WING.guard.tighter` | 1.3 | tuning | Separation filter | keeps | with Lead on his present turn and one step tighter: his turn rate 1.3 times (Fable F1, F13, estimate) |
| `FW_WING.guard.missFt.0` | 50 | tuning | Guard (fwGuard) | changes: pass-clear's depth becomes a vertical candidate of the one predictor | pass-clear's height: enough to make the slant 600 ft over the guard's predicted pass, from his 50 ft stack to 300 ft (estimates) |
| `FW_WING.guard.missFt.1` | 300 | tuning | Guard (fwGuard) | changes: pass-clear's depth becomes a vertical candidate of the one predictor | pass-clear's height: enough to make the slant 600 ft over the guard's predicted pass, from his 50 ft stack to 300 ft (estimates) |
| `FW_WING.guard.missSlantFt` | 600 | tuning | Guard (fwGuard) | removes: the guard's own predictor goes (R8) | ... the slant pass-clear's depth is sized to make (estimate) |
| `FW_WING.guard.torquePct` | 20 | tuning | Power (powerAsk) | removes: no power cut; a request to bleed (review 2.5) | "power off": 20% torque, well back but not idle, so the engine answers at once (estimate; TS-218, idle's spool-up lag) |
| `FW_WING.guard.passLineSec` | 1.4 | tuning | Separation filter | changes: the closure allowance becomes the taper's allowed closing speed | the pass line: 500 ft + 1.4 s x the closure he sees (the 0.4 s he sees late and the 1 s smoothing), never under engageFt (TS-233; Fable F4) |
| `FW_WING.guard.wingLineFt` | 100 | ruling | Separation filter | keeps | never closer than 100 ft behind Lead's wing line, along Lead's path (TS-233; Fable F6, Q6) |
| `FW_WING.guard.filterSteps` | 20 | search | Separation filter | keeps | the turns tried each way, from none to his most, then refined 6 times (search effort) |
| `FW_WING.guard.filterRefine` | 6 | search | Separation filter | keeps | ... and the refinements (search effort) |
| `FW_WING.guard.filterHoldSec` | 1 | tuning | Separation filter | removes: with the power cut | power off (while closing) and pass-clear's pitch held a second after the filter last changed his turn (estimate) |
| `FW_WING.guard.engage.marginFt` | 50 | tuning | Separation filter | removes: label-only hysteresis; the taper has no on/off line | Once engaged the filter stays engaged until his aim's own turn clears the pass line and the wing line by 50 ft (Fable F12's margin) for 1 s (thread, round 4,... |
| `FW_WING.guard.engage.releaseSec` | 1 | tuning | Separation filter | removes: label-only hysteresis; the taper has no on/off line | ... held 3 s (spec 7e.7, estimate) |
| `FW_WING.guard.lagSec` | 1 | tuning | Nose behind | removes: with the nose behind | the nose behind's aim: where Lead was 1 s ago, about 380 ft back along his path at 200 KIAS (estimate) |

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
| The filter's working line (500 ft + 1.4 s × closure, at least 600 ft; engaged until clear by 50 ft for 1 s) | 127 crossings, 47 ft wobble, no band | Patrick's taper, the constraint form: nothing at or over 600 ft, the allowed closing speed shrinking to none at 500 ft | The flicker, the rail flying him at the ideal, the label-only hysteresis | Removes 5 (engage and release lines, their holds); adds 1-2 (the taper's shape and time) |
| The power cut (20% torque while the filter held and closing) | 34 crossings of zero closure; 30 toggles in one turn (review F3) | The guard's graded bleed request into the energy intent, by the taper's weight | The power relay fighting the G | Removes 2; adds 0-1 |
| Idle and the boards (40/25 and 60/35 ft/s) | Bands 0.7 and 0.9 × the wobble | Idle: a phased throttle reduction by closure excess. The boards are a physical step (Patrick: "a very large step change in drag"), so keep the switch, with a band of at least twice the wobble and a minimum time out | Idle chatter; boards in and out | About the same |
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
- **Power back → the yo-yo's trigger** (R9): a relay's state as a trigger; it ties the yo-yo to the power cut's 34 crossings.
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
- **The fragility is in the switches, measured.** Linear margins of seconds (section 7) against 0.1 s in the full sim; the filter's line crossed 127 times. This supports the review's F8 and the taper ruling, and means round 5's guard-rail slice should move the delay margin most.
- **Power's arc term does nothing to closure (R5 corrected).** A whole N² cell and a tuning value that can go, with no loss.
- **Close formation's line axis is twice as stiff in a 60° turn.** Its bank-to-lift gain is multiplied by Lead's G, so the loop's crossover doubles in a 2 G turn and its linear margin drops to about 18°. It flies well today; if part 2 or Patrick's flying ever shows a lateral hunt in steep close turns, dividing by Lead's G (a fixed lift per foot) is the candidate. A flying change, for Patrick only.
- **Three seen cues feed nothing (R12).** Line of sight, aspect and HCA are traced but read by nobody since the tidy. The phase could use the manual's own reversal cue, a definite increase in line of sight (SMM 16.20 para 65b(2)), and HCA ≈ 2 × aspect as the "on the circle" test (SMM 16.16, Fable F10) for "captured".
- **The core already has the soft-limit building block** (`softMin`, `softMax`), so phased limits need no new maths (rule book: search for existing flight math first).
- **The check caught my own slips first.** It refused two of the master list's rules (up-down G is a sum; bank has one writer) before it passed. The method works on its own author.
- **The gauge's in-position start reads "stretched"** (780 ft against the 700 ft edge; R7 and the review's F10). Worth fixing in slice 0 so each case is what it says.

## 12. Questions for Patrick

The thread relays these one at a time; each has a working answer in the model until he replies.

**Q1. Where does #2's 0.4 s sit in fighting wing? Today it is on Lead only (he knows his own motion now); close formation delays the whole picture.**
- (a) Lead only, as now: matches "0.4 s after he sees Lead's bank and nose start"
- (b) the whole picture, as close formation: the textbook pilot; less margin
- (c) split: Lead 0.4 s, his own motion felt sooner (0.1-0.2 s, an estimate)
- (d) your own picture
- *Recommended:* (a) as the working answer, with (b) measured beside it in each slice (the table already has both); decide once a slice shows a difference.

**Q2. At the G cap, which gives way first: the turn (today) or the vertical? Your tool order is geometry first, then the vertical.**
- (a) the turn gives way (today): height held, geometry suffers
- (b) the vertical gives way: geometry first, as your order
- (c) shared in proportion
- (d) your own
- *Recommended:* (b) in the turn and at the entry, except while the guard asks for pass-clear (then the vertical first); for the path-follower slice to measure.

## 13. Untested, unseen and unsure

- **Nothing here was flown or seen in the app;** it reads the code and one gauge run.
- **Every loop margin is an estimate.** These are hand linearisations at fixed trim points, with the G onset and roll as small lags (0.05 s, from reading `easeValue`: rate limits, nearly transparent when small) and the limits and slews left out. Part 2's rig checks each against the sim (plan C11).
- **The ripple numbers** come from one gauge run of 11 fighting wing cases, measured on the traced signal nearest each trigger. The filter's line is taken at 600 ft, though it moves with closure.
- **The master list is read by hand.** The check proves its trace columns and its numbers, not its every writer and reader; part 2's per-term trace columns (T29r) let the check prove those too.
- **Unsure:** whether R11's offset gap is the blend or the 3 s chord to the look-ahead point; whether close formation's thin linear margins matter at the aggressive end; the T4 rows, since the arc loop's linear gains don't change with Lead's turn rate, so T4's real differences are nonlinear (the look-ahead angle's 90° cap, the blend's 26°).
