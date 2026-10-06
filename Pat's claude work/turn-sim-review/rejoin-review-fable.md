# Rejoin review (one-off, read-only, Fable), 5 Oct 2026 08:45Z

Reviewed: rejoin-analysis.md and the code on main at V2.62. Patrick's asks added during the review: overtake 15/25/50 kt (08:20Z), most efficient bank and power mix (08:20Z), no constraints (08:21Z), any model or program (08:26Z), energy levels and formations, keep the close moves (08:28Z).

## Verdict
Agree, with changes. The analysis pointed the right way but missed the main mechanism, and its fix B still solved too much.

## What it found
- **Why the line lasts forever.** On the rejoin line inside Lead's turn at matched speed, the closure is roughly proportional to the range: about ω·r·(1 − r / 1.414 R), from Lead's rotating frame (an estimate). The range therefore dies away exponentially, with a time constant of about 1/ω, which is 20-30 s for Lead at 30° and 200 KIAS at 8,000 ft (an estimate). An overtake Δ adds a closure floor of about 1.414·Δ. Without it, the line never finishes.
- **Where the code goes wrong.**
  - The tracker's line hold (tracker.js:241-257) never commands an overtake.
  - The down-the-line leg aims only 200 ft ahead (turning-rejoin.js:50), so the stopping-distance cap (tracker.js:62-74) holds the last ~700 ft to about 20 kt.
  - The onto-the-line leg (turning-rejoin.js:48) makes no progress down the line.
  - REJOIN_CLOSURE_KT is read as a range rate in three places: tracker.js:62-74, kinematic.js:510-520 and hand-over.js:108-174.
- **The analysis's other causes.**
  - The tracker chasing (cause 2) is confirmed.
  - The drawn lines at full power (cause 3) are confirmed, but only the Errors panel uses them now.
  - Fluid's STRETCHED has a different cause: Lead flies at full power.

## Design (three held segments, flown through flight.js like Lead)
1. **Point.**
   - Hold a bank of 45° or 60° toward Lead until Lead sits at #2's 10:30 or 1:30.
   - Set power to MAX for Lead's planned KIAS + Δ.
   - From fighting wing, which is already on the line, this segment is nil.
2. **Hold the line.**
   - The bank comes from one law: #2's turn rate equals the line-of-sight rate, which keeps Lead at 45° off the nose.
   - That bank comes out at about 24-32°, near Lead's 30° (an estimate). Δ is held throughout.
   - From 4,000 ft to the decision point takes about 29 s at Δ 25 and 37 s at Δ 15 (estimates).
   - #2 flies slightly low (SMM 12.24 para 56).
3. **Decision point and run-in.**
   - The slow-down starts at the decision point's range plus the stopping distance, (c² − c_close²)/2a, using the slow-down stages: power back, idle, boards.
   - That works out to about 500-850 ft, close to Patrick's "about 500 ft" (06:24Z).
   - Then route and echelon follow in one motion on the existing tracker close-in moves, which Patrick says work well.

**How it's solved.** Only the point bank is searched, with two candidates. The line uses the law and the run-in uses the formula. The plan with the least time to IN POSITION wins, with the fewest setting changes as the tie-break.

**Failure cases.**
- No cut-off: lag onto the line while Lead keeps turning. Refuse if Lead's turn would pass about 360°.
- Too much closure at the decision point: a planned overshoot (SMM 12.27 paras 64-66).
- Never ahead of Lead's 3/9 line inside 1,000 ft: a candidate that crosses it is refused.

## Most efficient bank and power mix (Patrick's question)
Efficient here means the least time to IN POSITION, within the overtake, with no overshoot unless the closure is excessive and at most four setting changes.

Most of the closure comes from Lead's turn and the overtake, not from #2's bank. So a medium bank held through the long middle is the efficient answer, and Patrick's intuition is right. A bigger bank pays only in the point segment: 60° saves a few seconds over 45°, and beyond about 60° the extra drag buys nothing. On power, set MAX to get the overtake, hold it, then at the end go power back, idle, and the boards only if needed.

## Energy levels and formations (08:28Z)
- **Overtake target.** Δ is added to Lead's planned KIAS, not his speed at the moment, because he is still slowing from 220.
- **Matching Δ to the room.** Δ_eff is the largest Δ up to 15/25/50 that leaves room to stop before the decision point. That one number covers fighting wing, where it's small, and line abreast, where it's full.
- **Height.**
  - #2 high: power back so the dive doesn't push him past Lead + Δ.
  - #2 low: climb at MAX and accept a smaller Δ.
- **SARJ.** It is slow for the same cause 1, and Fix A alone fixes it: the same planner with no point segment and no bank law.
- **Echelon out to fighting wing.** This is a close move flown at the close-in rate with the close-move bank, so it is a separate later fix.

## Outside library or tool
Not recommended. The job is a few lines of trigonometry on the existing stepper. A library would add size and a second copy of the flight formulas, and Patrick couldn't read it against the SMM. Simulators' formation AI also chases. The next bigger model would be the Live wingman already on future.md.

## Delete list (once the planner flies)
turning-rejoin.js's tracker legs; tracker.js holdLine (241-257, 326); TURNING_REJOIN line tuning; planGoTo's Lead-waits paths for the 2-ship (transitions.js:350-377); legsFor lab→rejoinTo (transitions.js:223-226); kinematic-moves.js planLineMove (unused). Keep hot-rejoin.js until the planner covers the Errors panel.

## Unsure / not checked

## Follow-up 1 (08:46Z, Patrick: worst case, tight, ahead of the line, high), summary
- The pilot's way (SMM 12.24 paras 56-58; 16.20 paras 65-67; 12.27 paras 64-66):
  1. Geometry first: don't point at Lead. Ease the bank below Lead's or hold the heading, so Lead's turn sweeps the aspect back to 45°. Go nose low to slightly below Lead early, trading height for spacing.
  2. Then power off, idle and boards, down to about Lead − 25 KIAS.
  3. If he is still hot at the decision point, overshoot: below and behind Lead to the outside, then rejoin from there.
- What failed in V2.63:
  - No planned overshoot: crossing behind Lead returned "no plan".
  - The "ahead of 3/9" flag counted the start geometry, so tight starts were refused before anything was flown.
  - Height was not flown as energy: any height difference was taken out in 10 s.
  - There was no gentle lag choice for hot starts.
  - Undertake versus the stall at high bank.
- Bug: full-power and slowing rates were worked out at 1 G. The 60-79° capture cost no speed in the model, so it looked quicker than it would fly.

## Follow-up 2 (08:52-08:58Z): model, power, SARJ, echelon to FW, fallbacks, lag roll (summaries)
- **Model** (Patrick 08:52Z asked that the reviewer be told how the model works): no answer changes. What matters for rejoins: height doesn't trade with speed (flag it, don't model it tonight); power is back-computed, so every planner must clamp to fullPowerKtps/slowKtps with G and climb (load-bearing); G onset is ignored (a few tenths of a second). Keep per-step setKias with held commands, not smootherstep speed segments. The tracker's double KT_TO_FTPS (tracker.js closureCap, hand-over.js runInLaw) makes stops look about 1.7x shorter than the aircraft can fly; fixing it means re-setting CLOSURE.stopShare to keep today's close-in times.
- **Power** (08:48Z): set the overtake with MAX (a lot for a short time), hold it with trim power, and take it out with the least stage that fits the room left (power back, then idle, then boards). Use MAX then idle and boards only when the room is short. Planner: three held commands instead of the 0.8/s proportional loop.
- **SARJ** (08:40Z): the TRJ planner with ω = 0, steering for Lead's extended track. MAX in the cut, then Lead + Δ held on the six, then the least stop stage, then the tracker through route.
- **Echelon to FW in 10 s**: roll away to 60°, idle and boards, nose down to FW height, 15-30° off heading, then MAX into the cone. In the cone still moving aft at about 10-12 s; settled at about 18-20 s (estimates; the 530 ft aft is the bottleneck at this thrust).
- **Fallbacks**: Student LAB to FW: decision point at the slot plus fwArriveFtps 5 is too late (Lead's turn still gives about 34 ft/s there). Suggested hand-over 500 ft earlier: tried in V2.64 and it did not fix it; a whole-cone tail was also tried and was worse. Both reverted (two failed tries: find the cause in the tracker's rejoinTo tail first). AI LAB 4000 to route: flow through route at Instructor's close-in rate: fixed in V2.64.
- **Lag roll to FW** (Patrick 08:54Z): not named in the SMM/EFIG text the reviewer may read. Nearest pages: SMM 12.29 para 69 (cone, using the vertical); SMM 12.30-12.31 para 74 and EFIG's Fighting Wing card (lag pursuit); SMM 14.8 paras 18-19, Fig 14.1, Table 14.1 (barrel roll).
  - As flown (estimates unless sourced): from FW, MAX, pull 2.5-3 G (barrel roll's 3 G entry) to 30-45° nose up, roll toward Lead at about 45-60°/s, over Lead's six inverted canopy to canopy at about 1,000-1,300 ft, about 2 G over the top (barrelTopG 2.25), speed to about 160-170 KIAS at the top, nose down on the other side, power as needed into the cone (anywhere, high or low).
  - Model: reuse fluid-lead.js's barrel-roll nose path as #2's own 3D manoeuvre (attitude.js poseOf3d, a poseTrack segment, which transitions.js flyStep already plays). Search pull G {2.5, 3} and nose-off {30, 45} so the exit lands in the cone on the other side, then rejoinTo(fw). Lead straight and level first; in a turn later in Lead's turning frame. No 3D stepper option needed.
  - Checks: G within availableG each step; refuse plans inside the 500 ft bubble; flag (not wall) when Lead leaves the top half of #2's canopy.

## Follow-up 3 (09:08Z): why Student line abreast to FW at 6,000/8,000 ft never settles (V2.64)
- Cause: the tracker's speed clamp (tracker.js runTracker, kiasCmd = max(L.kias − under, min(L.kias + over, …)), under = over = the Rates closure) is centred on Lead's KIAS. The FW slot inside Lead's 30° turn is nearer the turn centre (about 7,300 ft against Lead's 7,810 ft, estimate), so holding it needs about 13 KIAS less than Lead. Student's clamp allows about 13.3 KIAS under, so holding the slot uses all of it and closing on a slot behind him allows about 0.2 KIAS more: he creeps aft at under 1 ft/s, and settled wants 1.5 ft. Instructor (about 22 under) and AI (about 44) have room.
- Why the two tries failed: the clamp is the same at any range; deeper cone points need even more undertake (about 17 KIAS at 1,000 ft).
- Smallest fix: centre the clamp on the slot's own speed (the reference point's speed, ω × r included, already computed in refPoint): slotKias = |v_ref| / ratio. In straight flight that's Lead's KIAS, so straight close moves are unchanged. A cruder stop-gap: under = max(closure, rejoinTo's 25 KIAS undertake).
