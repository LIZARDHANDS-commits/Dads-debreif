# Design review brief 3: model and size the wingman's new control structure, and check it against the design gates

*Filed 14 Oct 2026 by the Formation thread for plan D2 ("model and audit draft 4"), with the `fable-review-brief` skill. Not yet sent: it goes once Patrick has read spec 7e draft 4 and settled the technique list (plan D1). Renamed terms (skill section 3); scrubbed with `scrub.mjs check` before filing.*

---

## Context and purpose (please read first)

This is a design document for a **flight-school training tool**. Patrick, a flight instructor at a basic pilot-training school, is building a formation simulator for student pilots on a single-engine turboprop **basic trainer aircraft**. It shows students, on the ground, how a wingman keeps a safe position behind a lead aircraft, so that formation training is **safer and mid-air collisions are prevented**.

**The absolute priority is that the simulated wingman never comes close to hitting the lead aircraft and always stays in a safe position behind it.** Smoothness and realism come after that.

Everything you need is in this one document. Please do not open any other file. You reviewed two earlier drafts of this design (your findings F1-F19 from the first review, and your second report on the cone in Lead's turns, are referred to below; you do not need them in front of you).

This time the job is different. The design has been restructured, and before anyone builds it we want it **modelled as a control system and sized on paper**: the structure written out block by block and signal by signal, the new loops sized with their margins against the reaction delay, and the whole design checked against eleven written design gates. Your tables will be copied into the project's model of the wingman and checked with its own tools afterwards.

## Terms

- **Lead**: the lead aircraft. **#2**: the simulated wingman.
- **The trail cone**: the school's loose formation. #2 is 500-1,000 ft from Lead, 30-60° back from Lead's wing line ("sweep"). **Never closer than 500 ft slant range** (the instructor's one hard rule; a brief, shallow entry while already correcting firmly out of it is accepted). His happy range is 600-650 ft.
- **The 500 ft ring**: the sphere of 500 ft slant range round Lead.
- **Steer-ahead / steer-on / steer-behind**: #2's flight path points ahead of Lead (inside Lead's turn circle, closes the range), at Lead, or behind Lead (outside the circle, opens the range).
- **Pass clear**: when the geometry would bring #2 too close, he moves out of Lead's way first, in the vertical, below by default.
- **Aspect**: #2's angle off Lead's tail (0° directly behind, 90° abeam on Lead's wing line). **#2 must never get ahead of Lead's wing line.** **HCA**: the heading crossing angle.
- **Lead's turn circle**: the circle Lead is flying, worked out each step from his seen bank and true airspeed.
- **The arc behind (s) and the offset (d)**: in Lead's turn, #2's position in Lead's turn-centre frame: s is the arc distance behind Lead round Lead's circle; d is how far inside (positive) or outside (negative) Lead's circle he is.
- **The swept place**: with Lead wings level, 625 ft at 45° of sweep, 50 ft below Lead.
- **The stack**: #2's normal height, 50 ft below Lead.
- **The guard**: the protection for the 500 ft ring.
- **The gauge**: the simulator's measuring tool, which flies scripted cases and records everything.
- **The rig**: a scripted-Lead test bench that flies #2's law on the real aircraft model, settles him, injects a small step at one summing point and records the response, so each loop's real response can be set beside its linear model.

## The simulator

- Point-mass aircraft with the trainer's performance (thrust, drag, roll rate and build-up, G build-up, stall warning), stepped every 0.05 s. Feet, seconds, G; speeds in knots indicated (KIAS) unless marked true.
- **The formation flies 200 KIAS at 8,000 ft: 381 ft/s true.** Lead's academic level turn: **60° bank, 2 G: 8.4°/s on a radius of about 2,600 ft.** A second test set has a **hard-manoeuvring Lead**: turns to 4 G, roll-ins at 90°/s, back-to-back reversals.
- **Reaction delay (the instructor's ruling):** #2 sees Lead 0.4 s late and carries him forward across the 0.4 s (dead-reckoned round his seen turn); he knows his own position, speed, G and roll at once. Today some signals still use the whole relative picture 0.4 s late (see R1).
- **His command** is a lift vector (G and its direction; bank not capped, past 90° only if needed) plus throttle and the speed brake. Roll rate up to 60°/s through a "shaper" (the pilot's hand). The aircraft's own G onset is about 4 G/s at most. G up to Lead's + 1.5 normally (an estimate); the guard may pull to the aircraft's limit, flagged on screen; the stall warning is a physical limit.
- **Energy:** at 200 KIAS and 8,000 ft the trainer has only about 1 kt/s of acceleration in hand at full power. Standard energy: about 12 ft of height per ft/s of speed at 381 ft/s.
- **Speed and position in Lead's turn:** inside Lead's circle by d, holding a place in Lead's frame needs #2's speed V2 = V_L(1 − d/R); at equal speed the arc closure is V × d ÷ (R − d). So 10 kt slower than Lead means sitting about 115 ft inside just to hold position, 20 kt about 230 ft.

## Before: the control system as built today

### The structure in words

1. **Perception** (the 0.4 s delay; closure smoothed about 1 s, line of sight about 0.5 s).
2. **Jobs** (a supervisor): "turning" when Lead's seen bank passes 10° for 1 s, ending under 5° for 1 s; an entry case (tight under 560 ft or closing over 20 ft/s; stretched over 700 ft) that labels only; an exit side by the manual's exit picture; S-turns across the cone when too close; a "quick fix" that moves the height target ±150 ft when the range is off by over 150 ft; "low inside" (5 kt short of Lead's speed: height −300 ft and full power).
3. **The aim point**: an aim between Lead's wing-down and wing-up close positions (about ±120 ft from Lead's circle), and in a turn an offset d from Lead's circle set by the arc loop.
4. **Steering**: a law steering #2's flight path at the aim point 3 s of his flight ahead, with the aim line's turn fed forward (which is really feedback, R3).
5. **The arc loop**: d = d_ss + wanted ÷ ω + kc × (wanted − closure) ÷ ω, with ω Lead's turn rate, wanted = (s − 650 ft) ÷ 10 s, d_ss = R(1 − V2/V_L), kc 0.5, the wanted closure within ±25 ft/s near the target (300 ft) and ±60 ft/s beyond, d within ±400 ft, slewed 60 ft/s.
6. **Vertical**: a PD on height against Lead (0.005 G per ft; 0.02 G per ft/s acting on his height rate), with one "pitch owner" at a time chosen by priority (guard, quick fix, stack), changes held 2 s.
7. **Power**: three in series: a wanted speed, a speed hold (0.2 kt/s per kt, at most 3 kt/s, the drag of his present G fed forward), the engine (0.25 s; 3.5 s spool-up from idle). Idle and the speed brake by closure thresholds.
8. **The guard and the separation filter** (two predictors): the guard predicts the pass from the 0.4 s old picture holding his present turn, switches on under 600 ft predicted and off over 700 ft held 3 s; the filter predicts from now over 5.4 s and replaces his turn with the nearest one that keeps the predicted pass over 500 ft + 1.4 s × closure (at least 600 ft), and cuts power to 20% while closing.
9. **The lift**: the 1 G hold and the vertical first; at the G cap the turn is cut; unload, roll, then pull when the wings are more than 20° off the wanted lift.
10. **Add-ons from earlier tuning rounds** (all now judged harmful): "turn toward Lead first" for 2.5 s at every turn into him; "nose behind Lead" when the filter can't reach the wing line; an always-on 1.5 s blend of the aim; a cap on the aim line's turn.

### What the model of today's code found

- **R1 Three delay kinds inside one law:** Lead-only dead-reckoned; the whole picture 0.4 s late (slant, slant closure, aspect, HCA, height, the guard); Lead 0.4 s late without dead-reckoning (the wanted speed).
- **R2 Two closures:** arc closure (now) and slant closure (1 s, 0.4 s late) feed different switches; the power cut trips on one while the filter's line moves with the other.
- **R3** The aim line's turn "fed forward" is hidden feedback: linearised it adds a rate term V/L ≈ 0.33 /s on his heading.
- **R5** Power's term on the arc error does almost nothing: d_ss hands any speed change back as offset, so in a steady turn the closure is the arc loop's alone.
- **R6** At the G cap the lift keeps the 1 G hold and the vertical and cuts the turn (against the instructor's order, below).
- **R7** The entry case only labels; R8 the guard and the filter predict differently; R11 the always-on aim blend makes the aim lag Lead's rotation by atan(ω × 1.5 s), about 12° at 2 G, 26° at 4 G.
- **R9 Switch-to-switch links:** power back → the climb-out-of-plane trigger; filter "line short" → nose behind; filter hold → power cut and pass clear; guard on → pass clear, aim blend, power integral.
- **R10** The close-formation wingman (the same aircraft model, a different technique) works by physics feed-forwards: holding power for his G, climb and place speed; a power lead at Lead's roll-in; Lead's lift and his place's motion fed into the lift; three small feedback loops on what is left. It holds 60° turns within 1.75 ft with thin linear margins (14-18°), because the feed-forwards do most of the work.

### Today's loops, linearised (estimates; the rig confirmed the vertical, the swept steering and the speed hold within 30% where the filter is quiet)

Trim points, all at 200 KIAS and 8,000 ft: **T1** straight and level at the swept place; **T2** Lead's 60°/2 G turn, #2 650 ft of arc behind on Lead's circle; **T3** inside Lead's circle by 380-430 ft and gaining 65-76 ft/s (an operating point only); **T4** Lead at 4 G, #2 on the circle; **T5** Lead's roll-in, frozen at 0°, 30° and 60°. "Lead-only" is the delay as built for Lead; "whole picture" is everything 0.4 s late.

| Loop | Trim | Delay | Crossover (rad/s) | Phase margin | Gain margin | Extra-delay margin |
|---|---|---|---|---|---|---|
| Steering | T2 | Lead-only | 0.59 | 62° | 35 dB | 1.84 s |
| Steering | T2 | whole picture | 0.59 | 49° | 13 dB | 1.44 s |
| Steering without the aim-line term | T2 | Lead-only | 0.34 | 43° | 39 dB | 2.19 s |
| Steering | T1 | Lead-only | 0.38 | 71° | 38 dB | 3.28 s |
| Arc loop (power closed) | T2, T4 | Lead-only | 0.086 | 80° | 16 dB | 16.4 s |
| Arc loop without its feed-forward | T2 | Lead-only | - | - | - | delivers half the wanted closure |
| Vertical PD | T1, T2 | Lead-only | 0.69 | 66° | 31 dB | 1.68 s |
| Vertical PD | T1, T2 | whole picture | 0.69 | 50° | 13 dB | 1.28 s |
| Power on the swept place (PI) | T1 | Lead-only | 0.14 | 37° | 24 dB | 4.5 s |

So the linear loops are slow and far from the delay. Yet the full simulator breaks at about 0.1-0.2 s of extra delay: the fragility is in the switches, not the gains.

### The switches as built (the gauge's trail-cone set, 12 traces)

| Switch | Trigger | On / off | Crossings and wobble | Band ÷ wobble |
|---|---|---|---|---|
| Filter's working line | predicted pass | 500 ft + 1.4 s × closure, at least 600; no hysteresis | 132 crossings, 50 ft wobble | 0 |
| Power cut | filter hold and arc closure sign | closing > 0 | 42 crossings of zero | 0 (toggled 30 times in one turn) |
| Guard | its own predicted pass | < 600 ft / > 700 ft held 3 s | 41 crossings, 28 ft wobble | 3.6 |
| Idle | closure | > 40 / < 25 ft/s | 13 crossings, 22 ft/s wobble | 0.7 |
| Speed brake | closure | > 60 / < 35 ft/s | 13 crossings, 25 ft/s wobble | 1.0 |
| Quick fix | slant closure | > 20 / < 10 ft/s | 39 crossings, 7 ft/s wobble | 1.5 |
| S-turns | slant | < 550 / ≥ 600 ft | 2 crossings, 43 ft wobble | 1.2 |
| Turning | Lead's seen bank | > 10° for 1 s / < 5° for 1 s | (starts 1.4 s after Lead's roll is seen) | - |
| Filter side | cost of each side | flips when the other side costs less | the choice that breaks at +0.2 s of delay | - |
| Arc loop's closure limit | arc error | ±25 ft/s within 300 ft, ±60 beyond | a step in a saturation | - |
| G cap opening | guard's pass < 500 ft | Lead + 1.5 → the aircraft's | a step in the cap | - |

### What the gauge measures of today's flying (per academic turn, 30 s)

- **G onset** 1.7-3.3 G/s at most in every turn (Lead's own roll-in builds about 1 G over his roll).
- **Over Lead's G + 0.5:** 3-25 s of the 30 s.
- **Aim jumps** (over 25 ft in one step): 2-137 a turn; the aim line's turn reaches 109°/s before its cap.
- **Wrong-way roll:** 2.9 s into the turn toward him from in position.
- **Torque swings** (30 points or more): up to 33-36 a turn. **The throttle's owner** changes up to 37 times a turn.
- **Too low:** 8-25 s a turn more than 100 ft below the stack, lowest 240-315 ft.
- **Energy:** from tight with Lead turning toward him he loses 27 kt against Lead.
- **The filter's share of the flying:** 8-48% of a turn.
- **Lead turning toward him from nearly abeam (20° of sweep):** #2 banks the same way as Lead 92% of the first 10 s, the filter flies 98% of the turn, he ends 49° ahead of Lead's wing line, 302 ft low and 23.5 kt slow.
- At the rig's trim in the 60° turn (604 ft of arc, 102 ft inside, 228 ft low) the filter flies him half the time, so the arc loop can't be checked linearly there.
- The instructor flew it: "overcontrolling his aimpoint and roll and G way too much ... holding too much low stack ... the excess G and fast onset is bleeding his energy".

### What was tried and why it failed (rounds 1-4)

1. **Turn toward Lead first** at every turn into him (20° outward of Lead's circle for 2.5 s): rolled him the wrong way to 90° of bank, 1,000 ft outside Lead's circle, then 6 s at the G cap getting back.
2. **The path law's angle caps opened beyond 1,000 ft of arc:** worse on balance.
3. **A speed feed-forward V_L(1 − d/R)**, clipped to about −15 kt: it cost speed.
4. **Nose behind Lead at a point 650 ft back on his circle:** left him at 107° of aspect.
5. **Power and pitch held for the filter's whole action:** −25 to −42 kt.
6. **A climb out of plane (400 ft above Lead when arc closure exceeded 15 ft/s):** barely triggered from in position and made the tight case worse (least 491 ft).

Each round added a mechanism and none took one out: after four rounds, one 582-line function, 115 numbers, 18 switches.

## The instructor's rulings (fixed: design around them)

1. The trail cone is turn entry, turning and turn exit, with geometry first in each; a reversal is an exit and a new entry.
2. **Inside Lead's circle and gaining:** relax some G and bank, drift out onto Lead's circle behind him, then match his turn (steer-on). His place in the cone may drift while he does it, if the energy makes sense (a reading still to confirm).
3. **Lead turning toward him from in position, not tight:** fly straight ahead until on the circle he wants, then capture steer-on, or with a slight steer-ahead or steer-behind. Turn toward Lead only to stay outside the 500 ft ring, or when high on energy.
4. **From tight with Lead turning toward him:** pass clear in the vertical first, below (above only if already more than 100 ft above Lead), keeping roughly his heading; let Lead's turn go over him; end outside the circle and recapture it.
5. **Abeam with Lead turning toward him:** steer-behind toward Lead's tail, pass clear, then reverse and capture Lead's circle behind him (a reading still to confirm).
6. **Lead may manoeuvre with #2 anywhere behind the wing line** within 500-1,000 ft; Lead never waits for #2.
7. **The turn exit:** assertive use of the vertical to fix spacing (stretched: dive; tight: climb or S-turns), any height while the slant stays 500-1,000 ft and behind the wing line; then settle in the stack's 200 ft band.
8. **Power:** pull G, add power, unless bleeding energy on purpose. Power is the last tool. Power serves an energy intent (keep, gain or bleed).
9. **At the G cap:** airspeed gives way first (hold a smooth, steady G and let the speed bleed), then the vertical, then the turn. In the lift: the turn keeps its share; the height demand gives way first, then the level-flight hold, the turn last. Reaching the cap should be rare.
10. **G onset by urgency:** about 1 G/s for ordinary flying and planned corrections; about 2-2.5 G/s (an estimate) for assertive corrections and reversals to capture a line; up to about 4 G/s when about to hit something. Smooth, not switched.
11. **The guard tapers:** nothing at 600 ft predicted and over; firmer toward 500 ft; the correction is the least change to turn or height. Soft through the upper part, so a pass coming out near 550 ft gets a gentle correction, never a violent one; firm only close to 500 ft.
12. **Planned pass-clear manoeuvres aim their pass at about 625 ft**, the middle of the happy range.
13. **Inside Lead's turn when short of speed:** full power, then drop low on the inside (a few hundred feet), climbing back to the stack at roll-out. Every drop counts against a "no more than about 100 ft below the stack" line, so it shows as a fault to justify.
14. **The arc loop's offset d stays within ±250 ft** (a deliberate change from today's ±400 ft).
15. **The delay:** 0.4 s on Lead only, dead-reckoned; his own state at once.
16. **No "terminate" call:** Lead never waits; inside 500 ft #2 corrects out firmly.
17. **Smooth, planned corrections:** "assess the error, make a plan, smoothly execute the plan, monitor performance, adjust as required". Gentle hand-overs at every switch; low only when needed.
18. **Published limits are references, flagged on screen when passed, never walls; only physical limits are hard.**

## After: the proposed design

### Three rules for all the simulator's flying

1. **Phased hand-overs.** No on/off line in the flying. A change of technique, job, phase or owner blends in smoothly, over a stated time or by how near a limit is. A safety protection (the guard) is a constraint: silent far from its limit, firmer as it nears, only limiting what the loops ask for; it never steers or sets power. Real physical steps (the speed brake) stay switches, with a band at least twice the trigger's wobble and a hold time.
2. **One owner per control.** Turn, height and power each have one writer at a time, or a stated rule for sharing. Controllers pass each other physics (the drag of his G, the power for his climb), never a decision or a switch state.
3. **Techniques plan; the same loops fly.** A technique plans its path, energy intent, height and urgency once from a predicted cue, and the normal loops fly it with feedback. It writes only the reference and its limits, never the stick or throttle, and hands back by sliding the reference home.

### The structure in words

Lead → **perception** (Lead 0.4 s late, dead-reckoned; his own state now) → the **supervisor** (the phase from Lead's roll; picks one technique by priority) and the **normal follower** → the **reference** (path, approach limits, height target, energy intent, urgency, any cap change), blended between the normal follower's and the technique's by a weight that slides 0 → 1 → 0 → **one set of loops** (steering, arc, vertical, power), reading only the reference → the **guard** (limits the turn and height commands; sends a graded request to bleed energy) → the **shaper** (G onset by urgency, roll) → the aircraft.

### Perception

Lead 0.4 s late and dead-reckoned; his own state now; every signal brought onto this one rule (R1). Slant range and closure (about 1 s smoothing), line of sight (about 0.5 s), aspect, HCA, sweep, height against Lead, Lead's bank, roll and turn circle.

### The phase

Level, entry, turning, exit, read from Lead's seen roll with no hold; each change blended over about 1.5 s (estimate). Entry: from Lead's seen bank past about 10° and rolling, until captured on the wanted circle (within about 100 ft, approach angle under about 5°; guesses) or about 8 s. Exit: from Lead's seen bank under about 5° and rolling level, until settled (in the cone, closure under 10 ft/s for 5 s). The case (in position, stretched beyond about 700 ft, tight under about 560 ft, abeam) is read at each entry and exit.

### The normal follower (one law in every phase)

- **The path:** with Lead turning, a circle concentric with Lead's, offset d; with Lead level, a straight line parallel to Lead's track at the swept place's offset. As Lead's radius grows the circle becomes the line smoothly.
- **Wanted course** = the path's tangent at his place + an approach angle (2/π) × χmax × atan(k × e) toward the path, e his distance off it; χmax 20° when inside and drifting out, 12° when outside and closing in (the instructor's caps); k about 1 per 150 ft (guess).
- **His turn** = the path's own turn rate at his radius (fed forward; on the circle he flies Lead's G) + a gain × (wanted course − his course), sized to a crossover of about 0.3 rad/s (a guess to be checked).
- Where the path sits: the turns away (circle, inward approach), stretched (d inside, intent gain), tight with Lead turning away (d slightly outside), the swept line when level, the exit line on the side the manual's exit picture gives (tight or closing: outside; stretched: inside).
- **A design sketch** (simple model, level, equal speeds, no energy): Lead turning toward him from in position: G 1.0-2.7, about 2 s over Lead's G + 0.5, captured at 6.7 s, ending 773 ft of arc behind; turning away: 1.4-2.1 G, never inside 778 ft, ending 785 ft. From tight with Lead turning toward him the in-plane least range is about 355 ft, so the vertical is required.

### The arc loop (range in the turn)

d = d_ss + wanted ÷ ω + kc × (wanted − closure) ÷ ω; wanted = (s − 650 ft) ÷ 10 s (estimate); the wanted closure limited smoothly from 25 ft/s near the ideal to 60 ft/s far from it (a soft limit over about 200-400 ft of error, not a step); d slewed and **within ±250 ft** (ruling 14). The route positions' ±120 ft are the comfortable range. In Lead's 60° turn ±250 ft caps the closure from the offset at about 40 ft/s (inside) and the opening at about 33 ft/s (outside), at equal speed.

### Energy, power, the vertical and G

- **The energy intent:** keep, gain or bleed, carried as a number from −1 to +1 so it blends; spent geometry first, then the vertical, then power.
- **Power, one owner:** throttle = the drag of the G he asks for and of his climb, fed forward + a lead from Lead's seen roll (as the close-formation wingman does) + the intent (gain toward full power; bleed toward idle) + a slow trim on speed against Lead (PI, about 15 s; within 15 KIAS of Lead). Idle reached by a smooth reduction with closure; the speed brake a switch past about 60 ft/s of closure, with a band and a hold. The guard never sets the throttle: it sends a graded request to bleed.
- **The vertical, one loop:** the PD above (unchanged); its target the stack unless a technique or the energy intent plans another, blended between them over about 2 s (estimate); back to the stack over about 15 s (estimate). The guard's height is a constraint on its command, not a target.
- **G onset by urgency:** onset ≈ 1 + 3u G/s, u from 0 to 1 the larger of the guard's urgency (0 at a predicted pass of 600 ft, still low at 550 ft, 1 only close to 500 ft: a curve) and the technique's. Through the shaper; the aircraft's own limits stay in the aircraft model. Shape and curve are estimates.
- **The G cap:** Lead + 1.5 G (estimate); the guard opens it smoothly as the predicted pass goes from about 550 to 500 ft, flagged; it stops at the stall warning. In the lift: the turn keeps its share, the height demand gives way first, then the level-flight hold, the turn last (ruling 9; the reverse of R6).

### The guard (a constraint)

- One predictor: the least slant range over the closing part of the relative motion (looking until the range starts opening, capped at about 10 s), Lead dead-reckoned across the 0.4 s, #2's commanded vertical counted in the slant. (Your second report's closed form for two steady turns is the faster equivalent.)
- Silent at 600 ft predicted and over; between 600 and 500 ft the closing speed it allows toward the pass shrinks to none at 500 ft, soft through the upper part, firm close to 500 ft (ruling 11). Its correction is the least change to his turn or height that keeps within it.
- Choices: turn changes and vertical escapes (below by default, above only if more than 100 ft above Lead). Separation hard; staying behind the wing line soft, with a wing-line overshoot costed far above crossing behind Lead. When the two want opposite turns, one manoeuvre serves both, usually the vertical. A change of side is charged its roll time and held at least about 3 s once taken.
- Outputs: a limit on the turn and height commands, and a graded request to bleed. Never a throttle setting, an aim or a pitch owner.

### The techniques (as drafted; the instructor may still change the list)

How a technique works: it starts from a predicted cue (left alone, the normal follower would pass inside 600 ft, need more than the cap, or still be stretched at roll-out); plans once from the error and his energy; the same loops fly it; small errors are fed back, a plan that drifts past its bound is re-planned, an unsafe one goes to pass clear; it hands back by sliding the reference home over a blend time, only once well inside the normal follower's envelope; no restart for about 3 s (estimate) unless a fresher, more urgent cue fires; one at a time by priority; each has a longest run; techniques should be rare in ordinary flying.

| Priority | Technique | Cue | Plan (sized once) | Hand back | Numbers (estimates unless noted) |
|---|---|---|---|---|---|
| 1 | Pass clear | the guard's predictor: the normal follower's path passes inside 600 ft, closing | height h = √(D² − p²) below Lead's plane (above if already high), p the predicted pass without height, D 625 ft (ruling 12); heading roughly held; intent keep; urgency 1 at 3 s or less to the pass, about 0.4 at 6 s | predicted pass over 600 ft and opening: the path slides to Lead's circle from outside over about 2 s; height to the stack over about 15 s | from tight: p about 355 ft gives h about 515 ft; longest run about 15 s |
| 2 | Back behind the wing line (a candidate) | ahead of Lead's wing line, or predicted within about 3 s | nose pointed behind Lead, steep bank in and down, intent bleed; pass height sized as pass clear's | behind the wing line by about 15° of sweep, in the cone's range | longest run about 15 s |
| 3 | Steer-behind from abeam | Lead turning toward him with #2 behind the wing line under about 20° of sweep | a path toward a point on Lead's predicted track about 650 ft behind him; pass height as pass clear's; then reverse at a definite rise in line-of-sight rate (the manual's cue) or on crossing Lead's track; capture steer-on from outside; urgency about 0.5 | on Lead's circle within about 100 ft, approach under about 5°, behind the wing line | longest run about 20 s |
| 4 | Climb-out-of-plane reset | turning, inside Lead's circle and gaining (arc closure over about 15 ft/s) where the normal follower's drift-out is predicted not to stop it before 600 ft or the wing line | a climb sized from the closure to stop: about 12 ft per ft/s (30 ft/s → about 355 ft), within the cone; turn with Lead a little less; intent bleed going up, keep coming down; back down onto Lead's circle behind him, stacked low (the instructor's ruling; no size cap inside the cone) | on the circle behind him, closure under 10 ft/s, near the stack | top when closure under about 5 ft/s; longest run about 20 s |
| 5 | Very-stretched cut-across | in a turn, beyond about 1,000 ft (the instructor's number) and not closing | the inward approach cap opened from 12° to about 45° toward a point inside Lead's circle; intent gain; aim to arrive about 800 ft behind | inside about 900 ft and closure under 30 ft/s; cap back over about 3 s | longest run about 40 s |
| 6 | Exit vertical | exit, spacing more than about 100 ft from 650 ft or closure over about 20 ft/s | Δv = Δs ÷ T (T about 10 s); h about 12 ft per ft/s (300 ft stretched → about 355 ft of dive); tight: a climb, or S-turns if a climb leaves the cone; intent gain (dive) or bleed (climb) | spacing within about 50 ft of 650 ft and closure under 10 ft/s; height back to the stack over about 15 s | longest run about 25 s |
| 7 | S-turns | Lead level or rolling out, under about 600 ft or closing over about 15 ft/s, where a climb would leave the cone or the 200 ft band | heading swing ψ with 1 − cos ψ = Δs ÷ (V × T) (150 ft over 10 s → about 16°); legs across the cone between its sides (30-60° of sweep), the line swapping sides; intent bleed | range back to about 625 ft and closure under about 5 ft/s | longest run about 30 s |
| - | Moving out from close formation (a candidate) | the formation change pressed from close formation | straight back to about 500 ft at about 10 ft/s by power, then out sideways to the swept place on his side; close formation's law full under about 100 ft, the trail cone's full past about 250 ft, phased by range | at the swept place | written with a later task |

### How it would be programmed

The reference is plain data (path kind, offset and side; approach limits; height target; intent −1 to +1; urgency 0 to 1; any cap change), every field blendable. Each technique is one small module with four functions: cue (wanted now, how urgently), plan (the reference and limits, sized once), monitor (keep, re-plan or abort to pass clear), done (true once well inside the normal follower's envelope). The project's model of the wingman (a master list of blocks and signals, with a checker run against the gauge's traces) will list each technique as a block that writes only reference signals, and the checker will fail a technique that writes a control.

## The build plan: slices

The design is built in slices, each behind a switch (today's law stays the default until the instructor flies the new one). Every slice keeps the close-formation wingman's traces and the four-aircraft formation unchanged, meets the gates below before the instructor flies it, and runs model-first:
1. it names the model rows and N² cells it adds, changes or removes, and writes them first;
2. each new or changed loop is sized on the linear model, margins at 0.4 s, blend times against the loops they retarget;
3. it is built to that design;
4. on the rig, each loop's real response is set beside its linear one (C11), and any gap explained;
5. in the full simulator: both delay sweeps (C3), the switch counts (C6), the guard's share (C7);
6. the model's checker passes, and the slice reports what it removed as well as added.

Structure reviews come after slice 3b and after slice 7.

| Slice | What it builds | What it removes | Acceptance (the academic set) |
|---|---|---|---|
| 1 | The guard as a constraint: one predictor, the taper, the bleed request, vertical escapes, the side-change hold, the cap opened smoothly | The guard's on/off lines and holds, its second predictor, the power cut, the guard owning height | Acts under about 10% of each turn (C7); never inside 500 ft beyond a brief, shallow entry while correcting; a pass predicted near 550 ft gets a gentle correction (G onset near 1 G/s); no case breaks at +0.2 s of delay (C3) |
| 2 | The normal follower and the arc loop (offset ±250 ft); the reference and its blender; G onset by urgency; the lift at the cap in the instructor's order | The aim point, turn toward Lead first, nose behind, the aim-turn cap, the always-on aim blend, power's arc term, today's lift rule | No wrong-way roll; at most about 2 s a turn over Lead's G + 0.5; G onset about 1 G/s in ordinary turns; at the cap the vertical gives way before the turn (C8); never ahead of the wing line; every turn ends 500-900 ft; the design sketch's cases still capture inside ±250 ft |
| 3a | The phases from Lead's seen roll, no hold, blended; a reversal as exit then entry; every signal onto the 0.4 s rule | The jobs and their hysteresis, the 1 s turn-start hold, the quick fix | Settled in the cone within 30 s of wings level; a reversal flown like any other entry; no phase flicker (C6) |
| 3b | The technique picker (priority, one at a time, no-restart time, longest run) and the first technique, pass clear; the checker rule that a technique writes only the reference | - | From tight with Lead turning toward him: vertical first and below, never inside 500 ft beyond a brief entry, ends outside Lead's circle and recaptures; pass clear runs only where its cue says |
| 4 | The energy intent: power as drag fed forward + roll-in lead + intent + slow trim; the guard's bleed request; the drop low inside folded into "gain" | The low-inside relay, every other throttle writer | Within 15 KIAS of Lead at each turn's end; fewer than 5 torque swings a turn; full power and idle only by intent (C9) |
| 5 | The vertical with blended targets; the exit vertical; S-turns | The pitch-owner priority, the 300 ft-low owners | Ends within 200 ft of Lead's height; no more than about 100 ft below the stack outside a planned technique, every drop low inside counted; settled in the cone within 30 s |
| 6 | Abeam counts as the trail cone for Lead's moves; steer-behind from abeam | - | Truly abeam: never banks with Lead toward him; never ahead of the wing line; never inside 500 ft beyond a brief entry; captured behind Lead within about 30 s |
| 7 | Climb-out-of-plane reset, very-stretched cut-across, back behind the wing line | - | Each technique's own case; each rare in the academic set |
| 8a | Climbs and descents (the line in Lead's flight-path plane) | - | The descent under Lead's G + 1.5 (today 4.1 G); in the cone throughout |
| 8b | The hard-manoeuvring Lead (to 4 G, 90°/s, reversals) | - | The academic set's lines, stretching allowed while Lead manoeuvres |

Then: the live readout on the instructor's display, the blended hand-over from close formation (with the moving-out technique), and the final check, the instructor flying the whole set.

## The design gates (each slice must meet them before the instructor flies it; every number an estimate)

| Gate | What | Pass |
|---|---|---|
| C1 | One owner, or a stated rule, per shared control | No control with two writers and no rule; no runtime contest over 1 s in the academic set |
| C2 | Linear margins | Phase margin at least 45°, gain margin at least 6 dB, each loop, each trim |
| C3 | Delay margin in the full simulator, both delay kinds | At least 0.2 s of extra delay before oscillation or chatter, every academic case |
| C4 | Loops nested apart | Each loop's crossover at least 3 times the next one out, or a stated cross-feed |
| C5 | Interaction | Paired relative-gain-array elements 0.7-1.5, none negative; closing one loop moves another's crossover under 30% |
| C6 | Switches that don't chatter, and do something | Hysteresis at least twice the trigger's ripple, a dwell on each; no switch that only changes a label; job switches within 3 a turn |
| C7 | The guard stays a guard | Acting under about 10% of an academic turn, none in steady turning |
| C8 | The tool order holds | Geometry not cut by the vertical at the cap in the academic set; the G cap not reached in academic turns |
| C9 | Energy intent | In keep-energy phases throttle and G above Lead's rise together; power cut only in a bleed intent |
| C10 | Tuning count | Every number has a role and a source; fewer numbers and no switches compared with today's 92 |
| C11 | The model is right | Step responses and end results agree, model against simulator, within the shared margins (±10 kt, ±100 ft, ±5°, ±0.5 G) |

## What we ask

**1. The main job: model the proposed design and size it.**

a. **The structure as tables**, in these columns so they can be copied straight into the project's model:
   - *Blocks:* id, name, kind (perception, supervisor, normal follower, technique, reference, loop, guard, shaper, aircraft), what it does in one line.
   - *Signals:* id, unit, writer (one block, or the stated sharing rule), readers, delay kind (now; Lead 0.4 s dead-reckoned; whole picture 0.4 s), smoothing, limits.
   - *The N² chart:* for each pair of blocks, what the row passes to the column (a signal, a physics cross-feed, a limit, a request); mark any cell that passes a decision or a switch state.
   - *The resource matrix:* turn, height, throttle, speed brake: who writes each, who limits each, and the rule when more than one acts.

b. **Size the new loops** on the linear model at T1, T2, T4 and the frozen T5 snapshots, under both delay kinds: the normal follower's steering (course gain and the feed-forward), the arc loop with its feed-forward (kc, the 10 s, the soft closure limit, the ±250 ft offset and d_ss), the vertical with blended targets, power (drag and climb fed forward, the roll-in lead, the intent, the slow trim). For each loop: crossover, phase and gain margin, extra-delay margin at 0.4 s, and whether the nesting holds (C4). Check each blend time against the loops it retargets (at least about 3 ÷ the slowest crossover it feeds). Give starting gains, each marked a guess, that meet C2-C4.

c. **Check the design against C1-C11**, gate by gate: pass, fail, or can't tell on paper, with the evidence.

**2. Smaller questions.**
- The guard's shape between 600 and 500 ft and its urgency curve: what form gives "gentle at 550 ft, firm close to 500 ft" without a step, and what does it cost in delay margin?
- Which technique cues and hand-backs could flicker on and off under the 0.4 s delay, and what hysteresis or dwell each needs (C6)?
- Does ±250 ft leave the arc loop enough authority when he is 10-20 kt slow inside Lead's turn (d_ss 115-230 ft), and if not, what should carry the rest?
- At the G cap with the new order (the vertical gives way before the turn): is the hand-down smooth, or does it become a switch?
- **The build plan:** is the slice order sound? Each slice should add one loop group or one technique family, leave the wingman flyable, and have acceptance measurable for that slice alone. Say where the order or an acceptance line is wrong, what a slice depends on that only comes later, and which gates each slice can and can't be judged on.

**3. Anything else** that is unsafe, will not converge, or breaks the three rules.

Please give:
- a verdict;
- the four tables of 1a;
- the sizing table of 1b, with starting gains;
- the gate-by-gate check of 1c;
- numbered findings, each marked "fix before building", "can wait" or "note", with its evidence and your confidence;
- for each change you recommend: what it costs in tuning values and delay margin, and the measuring-tool case that would show it working;
- the questions that need the instructor's ruling.

State any assumption you make.

You are working on your own: nobody is watching, and nobody can answer a question while you work. Finish the whole review before you stop. Don't end with a plan for what you would do next, or with a question asking whether to carry on; do that work. If a question comes up, finish everything that doesn't depend on it, state the assumption you made, and list the question at the end. This is a design review, so the tables and findings are the deliverable: report them and stop, and don't write code. Keep to what is asked here; anything else you notice goes in a short "Notes" section at the end. Please remove all mannered prose: say what you mean in plain, direct words.
