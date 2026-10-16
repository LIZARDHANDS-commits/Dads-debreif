# Fighting wing on the live wingman: architecture review before round 5 (T29t part 2, 14 Oct 2026)

An Opus agent's read-only review (plan B5 T29t; Patrick 14 Oct 2026: "Have the opus agent do an architecture review after his tidy", "we aren't TIED to the spec diagram"). It reviews the live fighting wing technique as tidied on `formation-fighting-wing-tidy` (8e575bc7; flying identical to V2.433, round 4), against spec 7e, TS-233 and its addenda, Fable's three reviews, the web research, the SMM sweep and the recorded four-ship. Nothing here changes code. Patrick's words and the manuals win over everything in it.

**What was run for it** (all on the tidy branch, nothing committed but this file):
- the gauge's live b5 set (`--only b5- --fw live`), its traces read step by step;
- a delay sweep: `FW_SEE.extraDelaySec` at +0.1, +0.2 and +0.3 s (a temporary edit, restored);
- the recorded four-ship (`pair-geometry.mjs`, #2 off #1 and #4 off #3, 18:40-19:05Z, behind the wing line at 400-1,200 ft);
- a short kinematics sketch of Patrick's "relax some G and recapture the pure turn circle": level flight, both aircraft at a constant 380 ft/s, standard turn physics, 0.4 s delay, roll at 60°/s. It is not the sim's point mass and has no energy, so **every sketch number is a guess** to be checked in the sim.
- Not used: `tools/flight-design/` (python-control, CasADi). The loop margins below are worked by hand; the sweep did the rest.

**Terms, the first time.** *Feed-forward*: a control set from what you know is coming (Lead's bank, the drag of your own G) rather than from an error. *Feedback loop*: a control set from an error (range, height). *Gain*: how hard a loop pushes per unit of error. *Hysteresis*: different on and off thresholds, so a switch doesn't flicker. *Relay*: a control that jumps between two settings at a threshold. *Phase margin, delay margin*: how much extra lag a loop can take before it starts to oscillate. *Guard rail*: a safety layer that does nothing until a limit is near.

---

## Verdict

The technique is short of structure, not of tuning. It is a pursuit law aimed at a point, and seven later mechanisms each move that point or override the turn to answer one symptom of a single root problem: #2 inside Lead's circle at equal speed gains on him round the turn (research §1 item 1). Each round added a mechanism; none took one out. They now fight each other and the flying shows it. Turning into him from in position, #2 rolls the wrong way, to 90° of bank away from Lead's turn, ends 1,000 ft outside Lead's circle and 1,900 ft of arc behind, then sits at his 3.5 G cap for 6 s getting back in. That is Patrick's "overbanks and overshoots" made by the mechanisms meant to stop it. Under all of this, the separation filter's lines sit at the ideal range (600-650 ft), so the filter flies him through much of each turn. That one overlap makes the job flicker, the 300 ft-low finishes, the power relay and most of the fragility.

The recommended structure is Patrick's frame, one law and an energy intent:
- **The frame:** entry, turning and exit, read from Lead's roll as #2 sees it.
- **One steering law for every phase:** follow Lead's circle (a line when Lead is level) with a bounded approach angle. This is Patrick's "relax some G and recapture the pure turn circle" written as one law. From inside he relaxes and drifts out; on the circle he flies pure; outside he pulls a little more.
- **Each phase and case** sets where that circle sits (lead, pure, lag), the approach limits (his ruled 20° out, 12° in), an energy intent (keep, gain or bleed) and the vertical target.
- **Power** always pays for the G he pulls (his drag fed forward), plus the intent.
- **The vertical** is assertive at the exit, and first (below) from tight.
- **The filter** becomes a guard rail, with one predictor, lines below the ideal, and vertical escapes among its choices.

It keeps perception, the (s, d) frame, the arc loop's form, the predictor, how the lift is put together, unload-roll-pull, idle and the boards, the yo-yo and the S-turns. It removes lag first, the nose behind, the cap on the aim's turn, the guard's second predictor and the power cut. In the sketch it flies the five academic cases tried at 1.0-2.7 G, never ahead of the 3/9 line, ending 770-785 ft of arc behind. From tight it needs the vertical, as Patrick ruled. Build it in six slices behind the Live switch, with Old as the default throughout. Round 5 should start with the gauge (slice 0) and the guard rail (slice 1), because the rail is what most of today's failing numbers trace back to.

---

## 1. Findings

Each is marked **fix before round 5**, **can wait** or **note**.

**F1. Fix before round 5. One root problem, eleven mechanisms.** The research's rotating-frame fact: inside Lead's circle by d at Lead's speed, #2 gains round the turn at about V·d/(R − d), 65-76 ft/s for 380-430 ft inside a 60°/2 G turn. No gain removes that. The speed must change, the offset must change, or he must be allowed to drift. Today's answers, and which of them that one fact explains:

| Mechanism (round) | What it answers | Same root? |
|---|---|---|
| Speed-consistent offset d_ss = R(1 − V2/V_L) (round 3, F1) | Slow inside: fly inside | Yes, its energy half |
| Arc loop, half-gain fix (rounds 3-4) | The range in a turn | The range variable: keep |
| Following Lead's circle 3 s ahead (thread) | Aiming at Lead's place cut across from inside | Yes |
| Lag first, 20° out for 2.5 s (round 4) | Inside and gaining at entry | Yes, and as built it overdoes it (F2) |
| Cap on the aim's turn rate (round 4) | Aim jumps (lag first, nose behind, blends) fed forward | A symptom of the moving aim point |
| Filter's capture model (round 4) | The filter read the steer-behind as a turn across Lead | A symptom of the filter judging the aim's turn |
| Lag side first in the filter (round 4) | The filter's inside escape carried him round inside | Yes |
| Nose behind Lead, in and down (round 4) | Wing line out of reach: gaining | Yes |
| High yo-yo (round 4, ruled) | Gaining inside | Yes, its vertical half: keep, smaller job |
| Filter hysteresis (round 4) | Filter switching at the pass line | No: F3's overlap. Changed the label, not the flying |
| Tighter-at-min, power off only while closing (round 4) | Filter on at the arc target; filter holding power off all turn | No: F3's overlap again |

One principled mechanism covers the first eight: follow Lead's circle with a bounded approach angle (section 2.2). From inside at equal speed the law's wanted course points outward of the circle, so he turns less than the circle needs. That is "relax some G", and it works because inside a 2,590 ft circle, holding 430 ft inside at 380 ft/s needs about 2.3 G against Lead's 2.0. As he nears the circle the angle closes, he tightens to Lead's G and is captured. No aim point jumps, so nothing needs capping. He never goes inside on purpose, so the lag-side rule and the nose behind lose their job. The yo-yo keeps the case geometry alone can't fix (equal speed with no room to drift: the aggressive Lead, F9).

**F2. Fix before round 5. Turn entry into him from in position: today's law rolls the wrong way.** From the trace (`b5-into-in-position`):
- 1.1-3.5 s: Lead rolls right to 60°. Lag first aims 20° outward of Lead's circle's tangent at #2's place. That tangent already points 16° left of his heading, because he starts behind Lead round the circle. So he asks a 36° left turn: his aim's turn is +13°/s left while Lead turns −8.4°/s right. He rolls to **+90° of bank, the wrong way**, at 1.4-2.3 G, the filter pushing the same way (+10°/s); HCA grows to 62° by 5.5 s.
- 4-5 s: he rolls back through wings level at 0.7-0.9 G.
- By 6 s he is 360 ft outside Lead's circle; by 10 s 1,000 ft outside; by 18 s 1,900 ft of arc behind.
- 5.5-11 s: the arc loop asks for its full 400 ft of lead and he sits at **3.5 G (his cap) for 6 s**, at 70-74° of bank, getting back in. He ends the turn 900 ft behind.

The manual's "turn slightly toward Lead" (SMM 12.29 Fig 12.20) and Patrick's "relax some G" both mean *keep turning with Lead, a little less*. Lag first, built as an aim point fixed to his position, means *turn away*.

**F3. Fix before round 5. The guard rail's lines sit at the ideal, so it flies him.** The filter's pass line is 500 ft + 1.4 s × closure with a floor of 600 ft (TS-233). It releases only once his aim's own turn clears that line by 50 ft for 1 s, so at zero closure it releases at 650 ft. That release line is exactly the arc target (650 ft, Patrick's happy 600-650), and the swept place (625 ft) is inside it. Measured:
- **Turn away from in position:** the filter engages at 12.4 s and holds to the end of the turn while he rides 600-620 ft slant, on the line. The guard (its own predictor, F4) is on too, so pass-clear owns pitch and walks him down to **290 ft below Lead**. With the power cut working only while closing, the torque **toggles 20%↔100% 30 times in the turn** as the closure crosses zero.
- **After wings level:** the job label flips swept↔filter every 1.1 s for 12 s. The predicted pass is 591-600 ft against slants of 653-667 ft: flying to his own swept place, he predicts a pass just inside the floor.

So round 4's finding is right, the job flicker is the filter switching at the pass line, and the numbers make it permanent. Its hysteresis changed only the label. The cure is to move the rail's lines below the ideal (section 2.5); that needs Patrick's word (question 1).

**F4. Fix before round 5. Two predictors of the same pass, which disagree.**
- The guard (`fwGuard`) predicts from what he *saw* (0.4 s old), himself holding his present turn, with no vertical. It gives pass-clear its pitch and depth, freezes the power integral, stops the aim blending and opens the G cap.
- The filter predicts from him *now*, with Lead carried across the delay, the capture of Lead's turn and his vertical counted. It changes his turn and cuts power.

They engage and release at different moments. That is part of why pass-clear holds pitch while the filter is quiet, and the reverse. Use one predictor (the filter's).

**F5. Fix before round 5. Power has no energy intent, and a relay fights the G.** In a turn, power is "hold a speed near Lead's plus the arc error over 15 s". Pulling G does raise the throttle, since `holdThrottle` adds the drag at his G, but only to hold that speed. On top of it:
- the filter's power cut drops him to 20% torque for 1 s whenever it has changed his turn and he is closing;
- low inside throws MAX;
- the yo-yo's way down pulls power back.

Those are four owners of one throttle. Patrick's rule: "when I pull G I need power to maintain energy (unless I WANT to lose energy right now)". Today he can pull 3.5 G with the power cut at the same moment, and the turn into him from tight ends 27 kt slow.

**F6. Fix before round 5. Why every turn ends about 300 ft low.** Three pitch owners command 300 ft below Lead: low inside (`lowFt` 300), pass-clear (`missFt` up to 300) and the nose behind (`behind.downFt` 300). Only the yo-yo goes up. Pass-clear holds pitch whenever the guard is on and the filter has acted in the last second, which F3 makes most of the turn. The stack (−50 ft) then comes back over 15 s, after the turn. Measured: 166-304 ft low at every turn's end. Patrick ruled 100 ft low at the end of a turn (TS-233); the recorded wingmen sat 42-111 ft from their leaders' height (median), 100-358 ft (90th percentile).

**F7. Fix before round 5 (the gauge). It counts the code's labels, not the flying.** Job switches count changes of the job's name, which hysteresis can hide or add without the aircraft moving differently (round 4: "the hysteresis changed labels not flying"). What a pilot would recognise, all measurable from the traces:
- a wrong-way roll (his bank more than 30° the other way from Lead's while Lead is banked past 30°);
- time over Lead's G + 0.5;
- smoothed G and roll reversals;
- torque reversals (swings over 30 points);
- most HCA;
- time ahead of the 3/9 line;
- least slant and time inside 500 ft;
- range, height and speed against Lead at the end against the ruled numbers;
- time the rail acts.

Beside the recorded four-ship, #2 off #1 and #4 off #3 over 18:40-19:05Z behind the wing line at 400-1,200 ft: the wingman's G less his leader's has a median of 0.0, a 90th percentile of +0.2 and +0.7 G, and he is more than 0.5 G over his leader 3% and 12% of the time. The sim's #2 spends up to 68% of a turn within 0.1 G of his Lead + 1.5 G cap (from tight), and 18% in the turn into him from in position. A reference only (Patrick: "this isnt perfect"); never a test.

**What drives the pulls to 3.5 G** (question 6, and the thread's sharp question), from the traces:
- *The arc loop's full lead after an over-lag:* into him from in position or stretched, 6 s at the cap with d at its 400 ft limit (F2). Not a steady-turn demand.
- *The filter and pass-clear at the ideal range:* away from in position, 3.0-3.5 G spikes at 77-81° of bank at 15 and 22 s, while the filter was engaged, pass-clear had pitch and he rode 600-620 ft slant (F3).
- *The filter's side flip under delay:* 4.0-4.2 G into Lead's turn (F8).

The 5.4 s window did not show up as a driver in these cases. In a steady turn on Lead's circle the law asks for Lead's G, as it should. Relax-and-recapture (section 2.2) removes the first, and moving the rail's lines (2.5) removes the second and third. That leaves the vertical the tight entry, the yo-yo and the exit, and leaves power to pay G's drag and serve the intent.

**F8. Fix before round 5. The fragility is an either-or in the rail, not loop margin (question 3).**
- *The loops by hand* (spec 7e.7's bandwidths): steering P is 0.05 G per degree, a heading loop of about 0.24 rad/s. The arc loop sits at 0.1 rad/s and the vertical PD at about 0.40 rad/s with damping about 0.8. Phase lost at 0.3 rad/s: the 0.4 s delay about 7°, the roll build about 8.5°, the aim line's 0.5 s smoothing about 8.5°. That leaves about 60° of margin and a delay margin of seconds, not tenths. All are far under the research's 1.3 rad/s ceiling for 0.4 s.
- *The sweep:* the turn into him from in position holds at +0.1 s and breaks at +0.2 s. From tight it breaks at +0.3 s. The turns away stay safe and behind at +0.3 s, but some end further back (away from tight: 605 ft at +0, 1,766 ft at +0.3 s). When it breaks the smoothed G reversals don't grow (5, 3, 4, 4), which a loop out of margin would show. Instead, at 2 s the filter's choice of side flips: at +0 it turned him toward Lead's tail (+10°/s); at +0.2 s it turned him into Lead's turn (−9 to −22°/s) at 4.0-4.2 G. From there he is inside, then ahead of the 3/9 line from 10 s (aspect 112°). The nose behind, the yo-yo and the filter take turns for 20 s, the filter acts 28.8 s of the 30 s turn, and power sits at 20% (−46 kt).
- *So:* margin comes from removing the either-or, not from slower loops. The steering law should be continuous (an arctan-shaped approach angle, not jumps of aim). The rail should sit away from the ideal so it rarely acts. When it does act, it should choose with a cost that is continuous in time (a 3 s dwell on its side, the roll time to reverse counted). Power should have no relays. With those, the delay margin is the linear loops' (seconds), and the 0.2 s target is easy. This is a guess from one sweep of eight cases; slice 1's acceptance re-runs it.

**F9. Can wait. The aggressive Lead (T29d) needs the vertical, whatever the law.** Sketch: Lead at 4 G (75.5° of bank, about 18.8°/s, radius about 1,160 ft) rolling in at 90°/s into #2 from in position. In the plane, the least pass is about 330 ft even with a perfect relax-and-capture, at 5 G for about 5 s. Away from him it is easy: 1.7-4.2 G, never inside 760 ft. So T29d's turns into him are flown with the vertical by design (the rail's vertical escape, section 2.5), not by tuning the turn.

**F10. Note. The entry case drives nothing today.** `fwJob` classes each turn entry (into or away, in position, stretched or tight: SMM Figs 12.20-12.22), but only the trace's job name reads it. The gauge's "in position" start (780 ft) is classed "stretched" (over 700 ft). In Patrick's frame the case chooses the aim (section 2.2), so it has to work and its edges have to match the gauge's cases.

**F11. Note. Patrick's ruled approach caps are not flown.** TS-233 agrees a 20° steer-behind and a 12° steer-ahead cap. With `pathCaps` gone (it flew worse), only lag first's 20° remains. In the recommended law they come back as the approach angle's limits, measured at #2's own place off the circle's tangent rather than to a point 3 s ahead. They then limit how hard he cuts, not how far he may close, because the arc loop moves the circle (d), not the angle. That is the difference from round 3's `pathCaps`, which capped the line to the look-ahead point against an offset up to 400 ft.

**F12. Note. Two numbers the rule book would flag.** `guard.torquePct` (20%, "power off") and `brakes.slowKt` (0) are estimates that act as relays. Section 2.3 replaces both with the energy intent.

---

## 2. The recommended structure: what is the simplest thing that flies it like a pilot?

Patrick's frame (14 Oct 2026): "Very simply fighting wing is turn entry, turning, and turn exit, and you use geometry at each of those three to fix spacing or maintain as required." His technique for the central case: "wouldn't he just relax some g/ bank, and re-capture the pure- turn circle? we don't HAVE to fly at route the whole time if it makes this simpler, only if it makes sense for energy". His exit: "Assertive use of the vertical on turn exit to fix spacing, staying within the cone. if stretched, dive. if tight, climb/s turns". The structure below is those three sentences, plus the manual's tables (SMM 12.29-12.30, Figs 12.20-12.23) and the rulings in TS-233.

### 2.1 The phase, from Lead's roll as #2 sees it

Four phases, one at a time, each change blended over about 1.5 s (spec 7e.7's 1-2 s):
- **Level:** Lead straight, climbing or descending. #2 to and in the swept place.
- **Entry:** from the moment he sees Lead's roll start (his seen bank past 10° *and* rolling, with no 1 s hold, so it starts as early as lag first does today) until he is captured on the circle the case wants (on it within about 100 ft, approach angle under about 5°; guesses) or 8 s.
- **Turning:** on or around Lead's circle until Lead rolls out.
- **Exit:** from Lead's roll-out (his seen bank under 5° and rolling toward level) until settled in the cone (in the cone, closure under 10 ft/s for 5 s: Fable's "steady", F13), then Level.
- **A reversal** is an exit followed at once by an entry the other way, with the case read again (Fable F4). Lead rolling through wings level is exactly that.

The case is read at the start of entry and exit, from what he sees: the range on Lead's new circle (the arc behind, s) and which side of it he is (d), plus closure. Its edges are spec 7e's: stretched past about 700 ft, tight under about 560 ft (Patrick's "lead if more than 700, lag if near 500"). F10: the gauge's starts should sit clearly inside each band.

### 2.2 One steering law: follow the circle, with a bounded approach angle

In every phase #2 follows a **reference path**: a circle concentric with Lead's, d inside it (negative d outside), or with Lead level a straight line parallel to Lead's track at the swept place's offset. His wanted course is the path's tangent at his own place plus an approach angle that grows smoothly with his distance off the path:

- approach angle = (2/π) × χmax × atan(k × distance off the path), toward the path;
- χmax = 20° when he is inside and has to drift out (lag), 12° when outside and closing in (lead): Patrick's ruled caps (TS-233);
- k about 1 per 150 ft (a guess), so 150 ft off gives half the cap and 470 ft off gives about 80% of it;
- his turn = the path's own turn rate at his radius (the feed-forward: on the circle he flies Lead's G) + a gain × (wanted course − his course), through today's lift composition (hold and the vertical first, then the turn, within the G cap, unload-roll-pull).

This is vector-field path following (Nelson et al. 2007, Garcia de Marina et al. 2017; research §2.1, §2.3), the standard law for "converge on a circle and stay on it". Patrick's technique falls out of it:

| Where #2 is against the path | What the law does | In Patrick's words |
|---|---|---|
| Inside, at Lead's speed | Wanted course outward of the tangent: he turns less than the circle, drifts out at up to V sin 20°, about 130 ft/s, then tightens to Lead's G as the angle closes | "relax some g/bank, and re-capture the pure turn circle" |
| On it | Approach angle zero: Lead's G, Lead's turn | pure |
| Outside | Wanted course inward, up to 12°: a little more G than Lead's | lead |
| Lead level | The same law on a straight line: he converges on the line and holds it; fore and aft by power | swept |

**The sketch's numbers** (guesses; level, equal speeds, no energy). Into him from in position with the arc loop setting d: G 1.0-2.7, about 2 s over Lead + 0.5 G, most HCA 25°, never past 42° of aspect, captured at 6.7 s, ending 773 ft of arc behind. To drift out he has to relax briefly to about 1 G: his heading starts 16° inside the circle's tangent (he is behind Lead round it), so he holds his heading a moment while Lead's turn comes to him. That sits between the manual's "turn slightly toward Lead" (Fig 12.20, in position) and its "delay your turn" (Fig 12.21, stretched); it is question 2. Away from in position: 1.4-2.1 G, never inside 778 ft, captured at 9 s, ending 785 ft. Today, by contrast, the same two cases fly 0.7-3.5 G with a wrong-way roll (F2), and 1.3-3.5 G with the filter engaged for 59% of the turn (F3).

**Where the reference path sits, by phase and case.** The arc loop (today's form: d = d_ss + wanted closure/ω + kc × shortfall/ω, wanted = (s − 650 ft)/10 s) sets d in Turning. Each case gives the entry its start and its limits, and each exit picks the side.

| Phase, case | The path | Energy intent | The vertical | The manual |
|---|---|---|---|---|
| Level | Line at the swept place, his side; fore and aft by power; S-turns across when too tight (the line swaps sides) | Keep | Stack, 50 ft below | Swept, 625 ft at 45° (Patrick) |
| Entry, into, in position | Lead's circle, d from the arc loop (starts near 0) | Keep (relaxing G sheds drag: a small gain for free) | Stack | Fig 12.20: collapse to the 6 toward Lead's tail, then capture |
| Entry, into, stretched | Lead's circle, d inside (lead) by the arc loop | Gain | Stack, or a short dive | Fig 12.21: delay the turn, then capture |
| Entry, into, tight | The rail first: vertical, below (above if already more than 100 ft high), keeping roughly his heading; then Lead's circle from outside, inward approach | Keep, the dive's energy taken out with power back | Pass-clear, below | Fig 12.22; Patrick's "Vertical first, below" |
| Entry, away, in position | Lead's circle, he is outside: inward at up to 12° | Keep | Stack | Fig 12.20: aim inside the circle |
| Entry, away, stretched | Lead's circle with d well inside (the arc loop's far limit) | Gain | Short dive allowed | Fig 12.21: aim well inside |
| Entry, away, tight | Lead's circle, d slightly outside: he falls back about 0.4°/s per 100 ft outside (Fable) | Keep or bleed | Stack | Fig 12.22: aim at Lead's tail |
| Turning | Lead's circle, d from the arc loop, small (Patrick's wing-down and wing-up route positions, about ±120 ft, are its comfortable range, not its limits) | Keep; gain if slow (the d_ss term flies him inside) | Stack; the high yo-yo if gaining with no room to drift (ruled) | SMM 12.30 para 74: on or around the circle |
| Exit, tight or closing fast | Line at the swept place on the outside of the turn | Bleed | Climb, sized by the error (2.3) | Fig 12.23: the longer path |
| Exit, stretched | Line at the swept place on the inside | Gain | Dive, sized by the error | Fig 12.23: the shorter path |
| Exit, in position | Line at the swept place, the side he is on; roll out with Lead | Keep | Back to the stack | Fig 12.23 |

"Very stretched" (Patrick: outside about 1,000 ft he may cut across the turn, then reset onto a circle) opens the 12° inward limit, as `pathOpenFt` did. With the rail no longer at the ideal, the job switches that made round 4 drop it should not recur. That is a risk to check, not a promise.

### 2.3 The energy intent, and how power and the vertical serve it

Each phase and case sets one intent: **keep, gain or bleed** (the table above). It is split across the controls in Patrick's order: geometry first (the path), then the vertical, then power (TS-96: "power as a last resort but as required").

- **Power, one owner.** Throttle = the drag of his G and climb (fed forward: the same power-for-G-and-climb physics close formation uses through `powerFor`, and `holdThrottle`'s `dragPerWeight` already does for fighting wing) + the intent (gain: up to MAX; bleed: back to idle, then the boards past 60 ft/s of closure as today) + a slow trim on his speed against Lead's (today's PI, 15 s). The rail never cuts power. When it predicts a closing pass it asks for *bleed*, and the intent does the rest. Low inside at MAX becomes Turning's "gain if slow". The yo-yo's way down is "bleed while faster than Lead".
- **The vertical, one owner at a time** (Fable F7, F9). In Level and Turning, the stack. In Exit, the exit vertical. The yo-yo only in Turning. The rail's pass-clear over all of them while it acts.
- **The exit vertical** (Patrick 14 Oct 2026: "Assertive use of the vertical on turn exit to fix spacing, staying within the cone"). Sized from the spacing error as energy, standard energy at 380 ft/s being about 20 ft of height per knot (research §6):
  - stretched by Δs, to be fixed in about T (10 s, the arc loop's time, a guess): he needs Δv = Δs/T, so a dive of h ≈ V·Δv/g. For example, 300 ft stretched asks 30 ft/s, about 18 kt, about 350 ft of dive.
  - tight: the same as a climb, or S-turns when a climb would leave the cone.
  - Bounded by the cone itself (500-1,000 ft slant, behind the wing line) and by the height band (200 ft, TS-80) until Patrick rules otherwise (question 3). Blended in over about 2 s, as today's quick fix, then back to the stack over about 15 s once the spacing is fixed.
  - This is today's quick fix (±150 ft, straight flight only) made assertive and given the exit to own. It also answers F6: the exit is where he leaves the 300 ft-low owners and climbs back to his stack, on purpose.
- **Does it help today's failures?** Ending 300 ft low: yes, since the low owners lose pitch at the exit by design and the rail no longer holds pass-clear at the ideal (F3, F6). Stretched job flicker: yes, but mainly because of F3. In the turns away from stretched the flicker is the rail at the pass line, and the exit vertical then closes the leftover spacing without power relays.

### 2.4 How the loops talk to each other (Patrick: "perhaps we need other ways for the controllers to interact with each other?")

Four ways, loosest to tightest:
1. **Through the aircraft only.** Each loop sees the others' effects late. Fighting wing today, mostly: the filter turns him, the arc loop reads the closure that made and moves the aim, power reads the speed loss later.
2. **Cross-feeds.** Each command tells the others what it will cost: G pays its drag with power, bank pays the pull that holds height, a climb pays its power, a roll-in leads its power. Close formation already does this (`holdingTorque` asks power for his G, his climb and his place's speed; `powerLeadPct` leads it before a roll-in; the place's motion is fed forward to pitch). That is Patrick's "coordination of all of the controls at once".
3. **One intent, split across the controls.** The phase decides what is needed (close, open or hold the range; gain, keep or bleed energy), and that need is split in Patrick's order, each quantity with one owner, as pitch already has.
4. **A short predictive planner** (model-predictive control, MPC) choosing G, bank and power together a few seconds ahead. The rail is already a small predictor; CasADi is in `tools/flight-design/`.

**Recommendation: 2 plus 3; keep 4 in reserve.**
- *Cost in tuning values:* none for 2. The cross-feeds are physics already in the code (drag at G, power for climb). About 6 for 3: the intent's gain and bleed thresholds, the exit vertical's gain and blend.
- *Cost in delay margin:* none. A feed-forward sits outside the feedback loop, so it adds no lag to it; it takes work off it, which raises the margin in practice.
- *Against the cases:* 2 plus 3 covers the academic set, T29b's climbs and descents (the path is a line in Lead's flight-path plane; whether that removes today's 4.1 G in the descent was not checked, see section 6), T29c (it *is* entry, exit and S-turns), B4 (2.8) and the 4-ship.
- *When 4 would earn its place:* only if T29d's back-to-back reversals at 4 G show that one-step-at-a-time choices can't line up the vertical and the turn in time. Even then, use it offline first (CasADi) to find the shape, and feed the result back as a rule, not as an in-browser solver (rule book: nothing to install; a light mode keeps working).

### 2.5 The separation filter as a guard rail only

- **One predictor** (the filter's: Lead carried across the delay, #2's state now, the capture of Lead's turn, his vertical counted in the slant). The guard keeps only "a pass under 500 ft predicted or the range now under 500 ft: open the G cap, flagged", from the same prediction.
- **Its lines below the ideal.** The hard line stays 500 ft slant, never planned inside, a brief kiss while correcting firmly allowed (TS-233). The working line stays 500 ft + 1.4 s × closure, but counted only while closing, with a floor below the ideal: 550 ft, releasing at 600 ft (guesses; question 1). At the ideal range with no closure the rail is then quiet; today it flies him there.
- **Its choices.** Today's turn rates, plus **vertical escapes** as candidates (research §8 item 5): pass below, or above if already more than 100 ft high, with the height counted in the slant. Patrick's "vertical first, below" from tight is then simply the cheapest candidate there: the turn needed is large and the height needed is small.
- **Its costs** (research §3.4, §8): separation hard, staying behind the wing line soft, a wing-line overshoot costed far above crossing behind Lead. When the pass line and the wing line want opposite turns, one evasive manoeuvre is chosen for both (research §3.1), usually the vertical, rather than the search hopping between two allowed bands (Fable F12). A change of side is charged its roll time (120° of bank change at 60°/s is 2 s) and held at least 3 s once taken (a dwell). F8's either-or then needs a real difference to flip.
- **Its look.** The least pass over the whole closing part of the relative motion, not a fixed 5.4 s window. The research's closed form for two constant turns (Squires et al., §3.1) gives this; so does today's stepped integration run until the range starts opening, capped at about 10 s. The window's edge, a pass at 5.5 s it can't see, is one of the research's chattering causes.
- **Its outputs:** a turn change, a vertical demand, and a request to bleed. Never a power setting, never an aim point. No Terminate; Lead never waits (Patrick 14 Oct 2026).

### 2.6 One set of loops, not one controller per phase (Patrick: "do we perhaps need a controller for entry, then 'manoeuvring', then 'exit'?")

Agreed with the thread: no. Separate controllers per phase would bring back the hand-over bumps the 12 Oct architecture review found in the "five ways of flying #2", because each would start from its own state. One set of loops flies the reference path; the phase only picks:
- the path (circle or line, d, side);
- the approach limits;
- the energy intent;
- the vertical's owner and target;
- perhaps a gain schedule (the arc loop's limits by phase).

The path moves continuously: d slews, and a circle becomes a line smoothly as Lead's radius grows (Fable F10's (s, d) limit). The aircraft's state is never handed from one law to another, so it is bumpless by construction. Close formation works the same way: one law for echelon, route, line astern and the corner, the place chosen by the job.

### 2.7 The structure in words

```
Lead (stepLead, his plan; never reads #2)
  │ what #2 can see: position, velocity, body up
  ▼
perception.js seeFw ─ 0.4 s late, Lead carried across the delay round his turn
  │ range, closure, aspect, HCA, line of sight; Lead's bank, roll, circle
  ▼
the phase (supervisor.js, from fwJob) ─ Level / Entry / Turning / Exit; the case at each start
  │ picks: the reference path (circle d inside or out, or the swept line), the approach limits (20° out, 12° in),
  │        the energy intent (keep, gain, bleed), the vertical's owner and target
  ▼
the loops (fighting-wing.js), one set for every phase
  ├─ steering: follow the path, bounded approach angle; the path's turn fed forward ─▶ turn (G across)
  ├─ the arc loop (Turning): d from the arc behind Lead and its closure
  ├─ the vertical: PD on height against Lead, one owner (stack / exit vertical / yo-yo) ─▶ G up or down
  └─ power: drag of his G and climb fed forward + intent + slow trim ─▶ throttle, idle, boards
  ▼
the guard rail (separation.js) ─ one predictor; acts only under the working line (below the ideal)
  │ may change the turn, demand pass-clear's height, ask to bleed; opens the G cap under 500 ft, flagged
  ▼
the lift (fighting-wing.js liftWithin) ─ hold and the vertical first, the turn gives way; unload, roll, pull
  ▼
the aircraft (stepLead, the same point mass as Lead) ─ the T-6A's roll, G onset and engine
```

### 2.8 Against the cases

| Case | How the structure flies it | Sketch (guesses) or note |
|---|---|---|
| Into, in position | Entry: relax and drift out at up to 20°, capture, arc loop | G 1.0-2.7, aspect ≤ 42°, ends 773 ft; least 491 ft in the plane (a kiss), so the stack and a touch of rail height |
| Away, in position | Entry: in at up to 12°, pure | G 1.4-2.1, never inside 778 ft, ends 785 ft |
| Into, stretched | Entry: d inside, gain | G 1.0-2.7, ends 775 ft |
| Away, stretched | Entry: well inside, gain; Patrick's very-stretched cut | Not sketched; today's best (r4f7) passed with the inward limit open |
| Into, tight | The rail: vertical first, below, heading kept; recapture from outside | In the plane alone, least 355 ft: the vertical is required, as ruled (Fable: the chord from tight is under 500 ft by itself) |
| Away, tight | Entry: d slightly outside, fall back | G 1.4-2.0, least 518 ft, ends 773 ft |
| Reversal mid-entry | Exit then entry, case re-read | Not sketched; by construction no special logic |
| Outside the cone | Entry from outside: inward approach, gain | Not sketched |
| Wings level, then settle | Exit by Fig 12.23 with the exit vertical; Level | Today's flicker (F3) goes with the rail's lines |
| T29b: straight climb and descent | Level: the line in Lead's flight-path plane, the stack measured from Lead as he climbs (spec 7e.7) | Today's descent pulls 4.1 G; not re-checked here |
| T29c: entry, exit, S-turns | The phases themselves | — |
| T29d: aggressive Lead, 4 G, 90°/s, reversals | The same law; G cap Lead + 1.5 (5.5) with the training rules' +5 G as the reference (SMM Table 16.1, flagged, not a wall); the rail's vertical candidates | Into from in position at 4 G: about 5 G for 5 s and only about 330 ft in the plane, so the vertical is the answer there (F9). Away: 1.7-4.2 G, never inside 760 ft |
| Into-tight ruling | Section 2.5: vertical first is the cheapest candidate | — |
| B4: rejoins from fighting wing (spec 7d) | The same follower: a circle (TRJ) or line (SARJ) inside Lead's with intent *gain* at the ruled overtake (15 kt TRJ, 25 kt SARJ), handing over to close formation's law about 500 ft out; collision avoidance is the rail | Fits: a turning rejoin is "cut inside Lead's circle" |
| 4-ship (12.8) | Each wingman follows the circle of the aircraft he flies off, 650 ft of arc behind (spec 8's TS-208: today's Old law already flies Lead's circle that way); the rail per pair | Delay ripples down the chain (each sees the one ahead 0.4 s late); SMM 16.36 para 100: Lead's hard turns into a wingman are limited in the 3- and 4-ship |

What the structure can't do that today's does:
- Today's lag first starts on Lead's bank before the jobs call the turn. The new entry must start as early: no 1 s hold.
- The nose behind is today's only remedy for being ahead of the 3/9 line. The new law doesn't put him there in the academic cases, and the rail costs a wing-line overshoot highest. In T29d it may still happen; "roll over Lead", the ruling's other remedy, is not built either way.

### 2.9 Migration in slices

Every slice sits behind "#2 in fighting wing: Live"; Old stays the default. Every slice keeps the default gauge traces (close formations, fluid, rejoins, Old) byte-identical and the 4-ship probe's hashes the same (the tidy's checks), and adds at most the plan's one test.

| Slice | What | Gauge acceptance (the academic set) |
|---|---|---|
| 0. The gauge measures the flying | F7's columns and the per-loop readout (section 4); today's run saved as the known-bad case. No flying change | The new columns show today's faults: the wrong-way roll at 1-4 s into from in position; the rail engaged 59% of the turn away from in position; 30 torque reversals there |
| 1. The guard rail | One predictor; the lines below the ideal (question 1); no power cut (a bleed request instead); the dwell and roll-time cost on a side change | Rail acting under 10% of each academic turn; no job flips after wings level; never inside 500 ft (a brief kiss allowed); delay sweep: no case breaks at +0.2 s |
| 2. The path follower | The circle and line follower with bounded approach replaces the aim point, lag first, the nose behind, the aim-turn cap and the look-ahead point | No wrong-way roll; HCA under about 30°; at most about 2 s over Lead + 0.5 G a turn; never ahead of the 3/9 line; every turn ends 500-900 ft |
| 3. The phases | Level, entry, turning, exit (a reversal is exit then entry); the case chooses the path and limits | T29c's cases; settled in the cone within 30 s of wings level; the reversal like any other entry |
| 4. Energy intent | Power: drag fed forward, intent, slow trim, one owner; low inside folds in | Within 15 KIAS of Lead at each turn's end; torque reversals under 5 a turn; MAX and idle only by intent |
| 5. The vertical | The exit vertical, sized and blended; the rail's vertical candidates; the into-tight ruling | Ends within 100-200 ft of Lead's height (TS-233's 100 ft low at the turn's end); into tight: vertical first and below, never inside 500 ft beyond a kiss, ends outside then recaptures |
| 6. T29b and T29d | Climbs and descents on the line; the aggressive set | T29b: the descent under Lead + 1.5 G; T29d: the academic set's lines, stretching allowed while Lead manoeuvres (plan T29d) |

Slices 0 and 1 are worth doing even if Patrick picks a different steering law, because the rail and the measurements are under every option.

---

## 3. Consequences, in short

**Keeps** (the tidy's names): `seeFw` and the delay (perception); `leadNowOf`; `arcRange` ((s, d), Fable F10); the arc loop's form in `aimInTurn`; `leastPass` and `searchTurn` (the rail's predictor and search, given vertical candidates and the new costs); `verticalFor` (the PD); `liftWithin` and `gCap`; `highYoYo` (Turning only); idle and the boards; the swept place and the S-turns; `fwJob`'s Lead-turn detection, becoming the phase.

**Removes or folds:** `lagFirst`; `noseBehind`; the aim-turn cap; `aheadOnCircle`'s 3 s look-ahead point (the approach-angle law replaces it); `fwGuard`'s own predictor; the power cut (`missPower`, `guard.torquePct`); low inside's separate MAX; the lag-side penalty and rescue; the quick fix (into the exit vertical); the job label as a measure.

**Tuning values** (leaf numbers, each a separate entry):

| Table | Before the tidy | After the tidy | After the structure (estimate) |
|---|---|---|---|
| CLOSE_SEE | 3 | 3 | 3 |
| CLOSE_WING | 62 | 62 | 62 |
| FW_SEE | 6 | 6 (historySec has no caller now) | 5 |
| FW_WING | 103 numbers + 22 switches + 1 null (the thread's "104 + 22" counts the null as a number) | 92, no switches | about 70 |
| FW_LIVE (the Old law, until 12.9) | 44 | 44 | 44 until retired |

Of FW_WING's 92 today:
- about 20 are rulings or geometry, not tuning: the 500 ft rule, happy 600-650, the swept 625 ft at 45°, the stack, the height band, the 15 KIAS band, Lead + 1.5 G, roll 60°/s, the entry edges, the turn-start bank.
- about 8 are search effort: the filter's steps and refinements, the look step.
- about 64 are tuning: gains, time constants, thresholds and limits.

The structure removes about 30 values (lag first 3, the nose behind 3, the aim-turn cap and the aim line's smoothing 3, the look-ahead point 2, the swept look-ahead 1, the guard's own release 3, the power cut 2, low inside 3, the quick fix 6, the yo-yo's speed trigger 3, routeFt 1) and adds about 10 (the approach law 3, the phase thresholds 2, the intent 3, the exit vertical 2): 92 − 30 + 10, about 70.

**Delay margin:** from about 0.1 s today (the rail's either-or, F8) to the linear loops' margin of seconds, if F8 is right. Slice 1 re-runs the sweep.

**Risks:**
- *Relaxing to about 1 G from inside.* Into him from in position, the law holds his heading briefly while Lead banks 60°, which reads as "slow to turn". Patrick may want a shallower relax (question 2), which costs arc (the sketch without the arc loop ended 490 ft).
- *The rail's new lines need his yes* (question 1); until then slice 1 can't land as designed.
- *Round 4's four passing cases may get worse* in slices 1-2 before slices 3-5 bring them back. Keep Live as a switch and Old the default throughout.
- *The sketch is level and at equal speeds.* The energy of relaxing (less drag: a gain) and of the exit dive are untested in the sim.
- *T29d's turns into him rely on the vertical candidates.* If the rail picks height too late at 4 G, an MPC study offline (2.4's option 4) is the fallback.
- *The 4-ship's chain delay* is untested under any live law.

---

## 4. Tables

### 4.1 The loops the live wingman runs today (Patrick: "How many different PID controllers do we have now?")

Close formation runs three PID-shaped loops on the shared core `pilotAxis` (P and D, its I set to 0, soft threshold off), plus feed-forwards and a pace cascade. Fighting wing runs four hand-written loops of its own, a search (the filter), and five on/off rules.

| Technique | Loop | Measures | Commands | Gains (source) |
|---|---|---|---|---|
| Close | Plane (`pilotAxis`) | Off his place up and down, its rate | G correction | P 0.04 G/ft, D 0.06 G per ft/s, I 0 (spec 7b, Fable's 13 Oct audit: crossover 2.0 rad/s, about 37° margin at 0.3 s) |
| Close | Line, in and out (`pilotAxis`) | Off his place across, its rate | Bank off Lead's (as lift across) | D 1.9° per ft/s, P = D × 0.4/s = 0.76°/ft, I 0 (CLOSE_WING; estimates tuned against Patrick's flying) |
| Close | Hinge, fore and aft (`pilotAxis`) | Off his place along, its rate | Torque | D 12% per ft/s, P 4.8%/ft, I 0 (CLOSE_WING) |
| Close | Feed-forwards | Lead's G and bank 0.3 s ahead; his place's motion as Lead rolls; holding power for G, climb and place speed; the power lead; roll catch-up 0.6 | Lift; torque | Physics plus CLOSE_WING's catch-up (Patrick 13 Oct 2026) |
| Close | Pace cascade and shaper | Distance to the place | Pace (√(2 × braking × distance), at most 8 ft/s); pressure sizes and torque rates per job | CLOSE_WING (Patrick's jog) |
| FW | Steering, pursuit | Angle from his path to the aim line; the aim line's turn | Turn: P 0.05 G/deg plus the aim line's turn fed forward (capped) | spec 7e.7, Fable F6, F10, F16 |
| FW | Arc loop (turn) | Arc behind Lead (s), its closure | Offset from Lead's circle (d) | (s − 650)/10 s within ±25/±60 ft/s; d = d_ss + wanted/ω + 0.5 × shortfall/ω, ±400 ft, 60 ft/s (Fable F1, research §2, §5) |
| FW | Vertical PD | Height against Lead's target, its rate | G up or down | 0.005 G/ft, 0.02 G per ft/s, ±1 G (spec 7e.7, Fable F6) |
| FW | Power | Arc error (turn, P over 15 s); place along Lead's track (level, PI over 15 s) | Speed to hold, within 15 KIAS of Lead | spec 7e.7; Patrick 4 Oct 19:12Z |
| FW | On/off rules | Filter acted and closing; slow inside; yo-yo down; closure | 20% torque; MAX; power back; idle at 40/25 ft/s, boards at 60/35 ft/s | Estimates; Patrick's rulings for low inside and the brakes |
| FW | Separation filter | Predicted pass and wing line over 5.4 s | Turn rate (searched) | FW_WING.guard (Fable F1-F6, F12; TS-233) |
| FW | The jobs and pitch owners | Lead's bank; range and closure; who wants pitch | Turning or level, side, S-turns; one pitch owner (2 s hold) | spec 7e.7, Fable F4, F7, F9 |

Older laws still flying beside them until plan 12.9 retires them:
- `fw-live.js` (Old: the 2-ship default, and every 4-ship fighting wing, FW_LIVE's 44 values);
- `fluid-wing-live.js` (fluid manoeuvring);
- the tracker (changes into and out of fighting wing, the rejoins from line abreast);
- Held close formation (the switch, until Checkpoint E's ruling removes it).

**Should fighting wing share `pilotAxis` and the shaper?**
- The vertical PD and the power trim: yes. They are exactly `pilotAxis`'s form (P and D on a deviation and its rate, a held I), so sharing it gives one PID function to read and one anti-windup.
- The throttle's hand: yes, the shaper's rate limits.
- Steering: no. It is a guidance law with a feed-forward, not a PID (Fable F16).
- Do it in a flying slice (slice 4), not a tidy: the sign conventions and order of operations differ, so it may not be bit-identical.

### 4.2 Watching the controllers (Patrick: "include the 'controller gain/setting/influence' ... a drop down setting in the app we can watch while flying?")

**For the gauge traces and the plot page** (T29r), per step, per loop: what it measures, its target, each term's share of its command (feed-forward, P, I, D) and the command. Then the phase and case, the job, the pitch owner, the energy intent, power's split (drag of his G, intent, trim, in torque %), and whether the rail acts (which line, its predicted pass, the change it made). Each term in the loop's own unit, so a stacked chart shows who is doing the work.

| Column (each loop) | Unit | Close formation | Fighting wing |
|---|---|---|---|
| error, rate | ft, ft/s | plane, line, hinge | arc s − target, d − d_cmd, height − target |
| ff, p, i, d | the command's | each `pilotAxis` term; Lead's lift | path turn fed forward, approach term; vertical P, D; power drag, intent, trim |
| cmd | G, °, % | upCorrG, leftCorrG, torque | turn G, vertical G, torque |
| phase, case, intent, owner, rail | words | job, masks | Level/Entry/Turning/Exit, case, keep/gain/bleed, pitch owner, rail on and which line |

**The smallest in-app readout:** a closed "#2's controls" drop-down under the HUD, four lines, updated a few times a second:
- **Steer:** the phase and case, the aim (lead, pure, lag) and approach angle against its cap, his G against Lead's.
- **Vertical:** the owner, its target in ft against Lead, the G it asks for.
- **Power:** the intent, torque %, and how much of it is paying for his G.
- **Rail:** quiet or acting, the predicted pass in ft.

In close formation the same four lines show the plane, line and hinge errors and pressures, and the job. Closed by default (rule book: a module opens with only its essentials showing).

---

## 5. Questions for Patrick

**Q1. Where should the guard rail's working line sit?** Today it is 500 ft plus 1.4 s of closure, never under 600 ft (TS-233), and it lets go only 50 ft further out. That lands exactly on the ideal: the 650 ft arc in a turn, and the 625 ft swept place inside it. So the rail flies #2 through much of each turn, takes him 300 ft low and cycles the power. 500 ft stays the rule either way, never planned inside, a kiss allowed.
- (a) Floor 550 ft, released at 600 ft, the closure allowance counted only while closing. *Recommended:* the rail is quiet at the ideal and still works to 500 ft plus the closure he can't see yet.
- (b) Keep 600 ft and move the ideal out: the arc target and swept place to about 700 ft. Wider than your happy 600-650.
- (c) Keep it as it is and accept the rail flying him near the ideal.
- (d) Your own numbers.

**Q2. Turning into him from in position: how much may he relax?** To drift out to your circle from inside, the law holds his heading briefly (about 1 G) while you roll to 60°, then follows your turn a little shallower and captures. He never banks away from you. In the sketch he ends about 770 ft behind, never past 42° of aspect.
- (a) Yes, relax as far as it takes. *Recommended:* the manual's "turn slightly toward Lead", and the quickest drift out.
- (b) Never shallower than about 30° of bank (about 1.15 G): slower drift, more arc lost, he ends closer, nearer 500 ft.
- (c) Your own picture.

**Q3. How big may the assertive exit vertical be?** Sized by the spacing error at about 20 ft per knot: for example 300 ft stretched asks about a 350 ft dive to make it up in about 10 s.
- (a) Within the 200 ft band of Lead's height (TS-80), as the yo-yo is today. *Recommended to start:* the cone as you've defined it for in position.
- (b) Up to 300 ft (the miss's deepest today).
- (c) Anywhere the slant stays 500-1,000 ft and behind the wing line ("as long as wg stays in the cone").
- (d) Your own.

---

## 6. Untested, unseen and unsure

- **Unseen:** nothing here was flown by Patrick or seen in the app. The recommended structure is not built.
- **The sketch** is level flight at equal constant speeds, with no energy, no point mass and a simple rail-free law. Its numbers are guesses for the review only. Not sketched: away stretched, the reversal, outside the cone, T29b, T29c, 4-ship.
- **The delay sweep** is eight cases, one run each. F8's reading (an either-or in the rail, not loop margin) fits all eight; it is not proven.
- **The recorded four-ship** is a reference, flown academically by unknown pilots, with phases unconfirmed. The G comparison uses the iPads' estimated G for #1 and #2 and the Sentries' recorded G for #3 and #4.
- **Unsure:**
  - whether 550/600 ft (Q1) leaves enough room for the closure allowance at the aggressive end;
  - whether the approach law's k and gain (guesses) hold at 4 G;
  - whether the descent's 4.1 G (T29b) is the path or the vertical: not re-checked here;
  - how the 4-ship's chain delay behaves under any live law.
- **Not used:** `tools/flight-design/` (python-control, CasADi). The margins were worked by hand and the sweep did the rest.
