# Fable's second report: the cone in Lead's turns (14 Oct 2026)

Fable 5.1, high effort, on `fable-cone-turn-brief-14oct.md` (this folder). The terms are renamed as in the first review:
- the trail cone = fighting wing;
- steer-ahead / on / behind = lead / pure / lag pursuit;
- pass clear = make the miss;
- climb out of plane = the high yo-yo.

Patrick's bubble ruling ("If it kisses the bubble and we are assertively correcting that's fine", TS-233) was sent to Fable while it worked. The thread's check against the code and Patrick's answers come after this report (next session).

---

## Verdict

The pass-clear filter is the right safety layer, and the first thing that has met the 500 ft rule; keep it. The in-turn steering doesn't converge for two reasons:
- The range loop has nowhere near the authority the geometry needs. It asks for at most 25 ft/s of closure change, slewed at 20 ft/s, against an arc that closes at about 60 ft/s from the first second.
- Option B aims at the wrong circle during the move-out.

The fix is a change of structure, not tuning:
- Describe #2 in Lead's turn-centre frame: radius offset d and arc behind s.
- Follow Lead's circle with a bounded outward steer-behind angle of 15-20°.
- Let power and the climb handle speed.

At equal power, from "in position", arriving on Lead's circle 650-730 ft behind in about 3-4 s is achievable without crossing hard and without getting ahead. From "tight" it is not possible to stay on the circle above 500 ft, so the manual's "end outside and recapture" is the only solution, and the law gives it naturally. Four items must change before building (findings 1-4).

## Worked geometry (200 KIAS at 8,000 ft, 380 ft/s true; Lead at 60° bank and 2 G)

- **Lead:** turn rate 32.2 × tan 60° / 380 = 0.147 rad/s = 8.4°/s; radius 2,589 ft.
- **In position, Lead turning into #2** (780 ft, 37° aspect): 623 ft behind Lead and 469 ft toward the centre. His radius from Lead's centre is 2,210 ft, so 379 ft inside. Station 16.4° behind Lead: 741 ft of arc on Lead's circle, 632 ft on his own.
- **Stretched** (950 ft, 37°): 434 ft inside, 20.6° behind, 931 ft of arc.
- **Tight** (520 ft, 37°): 276 ft inside, 10.3° behind, 466 ft of arc. The chord between two points on Lead's circle 10.3° apart is 465 ft, so from tight, sliding out to Lead's circle at the same station breaks the 500 ft rule by itself. Only opening the arc (outside the circle, or slower) or adding height can fix it.
- **Concentric flight** at 380 ft/s on r = 2,210 ft gives 9.85°/s, 1.44°/s more than Lead (65 ft/s of arc on Lead's circle). Holding that circle needs 324 ft/s true: 85%, about 171 KIAS, 29 kt to lose. Power alone is too slow. A climb of (380² − 324²)/(2 × 32.2) = 612 ft does it with no power change; 300 ft loses about 15 kt.
- **Steer-behind** at an outward angle e from the local tangent, from 379 ft inside. The arc lost during the transit is the integral of (V cos e / r − Lead's rate):

  | e | Outward | To the circle | Arc lost | Arrives behind |
  |---|---|---|---|---|
  | 10° | 66 ft/s | 5.7 s | 2.9° | 13.5°, 610 ft |
  | 15° | 98 ft/s | 3.9 s | 1.4° | 15°, about 680 ft (chord 676 ft) |
  | 20° | 130 ft/s | 2.9 s | 0.3° | 16°, 727 ft |

  The heading crossing angle during the transit is e plus the station difference: about 30° at e = 15°, against 66-70° in the failed attempt. Least slant over the transit stays near 680 ft, and the filter does not intervene. The slower the move-out, the more arc he loses; that is exactly why "moving out slowly" put him level with Lead by 7 s. "Slightly toward Lead's tail" means 15-20° off the tangent, not 5°.
- **Capture:**
  - Arriving with 98-130 ft/s outward and killing it over about 2 s (an extra 8°/s, bank from 60° to about 68°) overshoots 100-130 ft outside.
  - Outside at equal speed he falls back about 0.4°/s per 100 ft outside. That is safe, and the path law brings him in again with a 5° steer-ahead over about 10 s.
  - At the end of a 30 s turn: about 700 ft, in trail.
  - 500-900 ft is achievable from in position.
  - From stretched: 860 ft after the move-out, then the d loop (143 ft inside for 10 s) closes to 650 ft.
  - From tight: expect 700-850 ft after a forced excursion outside.

## Findings

1. **Fix before building. The range loop has no closure feedback and far too little authority.**
   - The rule "wanted closure = arc error / 10 s, ±25 ft/s; d = wanted closure / turn rate, ±250 ft, slewed 20 ft/s" only acts once the arc has already collapsed.
   - It ignores the measured closure (about 60 ft/s at t = 0), and the d it then asks for (170 ft) takes 8.5 s to slew. Meanwhile the 632 ft arc is gone in about 11 s.
   - This, not the aim rule, is the main cause of the 142-160° aspect and of the 2,596 ft and 1,820 ft end ranges (closing 1,800 ft at 25 ft/s takes over a minute).
   - Fix, in the recommended structure below: command d from the speed ratio plus the arc error, raise the limits, add the closure term.
2. **Fix before building. Candidate turn rates in the filter must be bounded by the G available at #2's current speed.**
   - The brief shows #2 at −39 kt (about 161 KIAS) after a pass-clear, and the guard may pull to the aircraft's limit. Accelerated-stall G grows with the square of speed, so a 3.5 G pull at 161 KIAS is at or past the stick-shaker for a trainer with a clean stall near 85-90 KIAS (a guess).
   - The candidate set should stop at the shaker G for the current speed (a physical limit, so allowed as a wall); the slant constraint is then met with height and power instead.
   - Without this the filter commands a turn the aircraft cannot deliver, and its own prediction is wrong.
3. **Fix before building. The filter and the vertical must share one lift-vector command, and the filter must predict with the horizontal G actually left.**
   - Tilting the lift vector up (the climb) or down (pass-clear below) takes horizontal G away from the turn the filter chose, so #2 turns less than the filter predicted.
   - This is the most likely reason the first climb try cost separation in the tight case (least 491 ft): the horizontal geometry closed faster than predicted. The height gained early adds almost nothing to slant, because height adds in quadrature (100 ft of height on 520 ft horizontal adds 10 ft of slant; 300 ft is needed to lift 520 to 600).
   - Make the filter search over the horizontal turn rate with the vertical demand as a known term, predict the pass with the resulting horizontal component, and add the predicted height to the slant explicitly.
4. **Fix before building. The 600 ft working line must carry a closure allowance.**
   - With the 0.4 s delay and 1 s smoothing, #2 acts on a picture about 1.4 s old. The 100 ft between 600 ft and the 500 ft rule covers unseen closure up to about 70 ft/s; the failed crossing showed 200 ft/s.
   - Use a pass line of 500 + 1.4 s × observed closure, floored at 600 ft (a guess), or cap the closure the filter will tolerate. It's cheap, and it is the hard rule.
5. **Fix before building (a few lines). Dead-reckon Lead across the delay.** Propagate Lead's observed position forward 0.4 s at his observed turn rate before the filter and the steering use it. It recovers about 7° of phase at the steering bandwidth for free, and it's what a real wingman's eye does.
6. **Can wait. Replace "aspect" with "distance behind Lead's wing line" in the filter's second constraint.**
   - The angle is ill-conditioned at short range: tiny lateral displacements swing it through 90°. The along-track distance x_behind is linear and well behaved: constraint x_behind ≥ 100 ft (a guess) over the look-ahead.
   - Both constraints together can be infeasible. Then range wins, and the along-track constraint being infeasible with the steer-behind at its cap is the trigger for the climb (finding 8).
7. **Can wait. Option B aims at the wrong circle during the move-out.**
   - From inside with d near 0 the aim point is nearly tangent, and the outward angle comes only from the look-ahead geometry (atan(379/1,140) = 18° at 3 s). That is right in principle, but the slewed d then moves the target circle outward too late, and the 6 s point halves the angle (9°), hence the worse aspect with 6 s.
   - Keep the 3 s look-ahead (bandwidth about 0.33 rad/s, matching the steering loop) and aim at Lead's circle offset by the commanded d. Cap the resulting angle at +20° outward and −12° inward (guesses).
8. **Can wait. The climb out of plane: trigger and lockout.**
   - The likely reason it "barely triggered" in position: while Lead rolls in, his circle is huge, so the arc measure reads along-track distance with near-zero closure. The 1 s smoothing delays the 15 ft/s threshold a further second. By then pass-clear below had taken the single pitch owner, and the climb was locked out until closure was under 5 ft/s.
   - Recommended trigger: the filter's along-track constraint is infeasible with steer-behind at its cap (finding 6), or the speed needed to hold the current radius is more than 10 kt below his speed (a guess) and power is already back.
   - Size: the height whose speed loss cancels the arc gain, h = (V² − (Lead's rate × r)²)/(2g), capped at 400 ft above Lead (a guess; 612 ft would cancel it fully from 379 ft inside).
   - Exit: on Lead's circle with the arc error under 150 ft (a guess), descend with power back so drag bleeds off the speed regained. Measure in the sim how many knots the trainer regains in a 300 ft descent at 20% torque.
9. **Can wait. Pitch-owner order.**
   1. Pass-clear owns pitch when the predicted pass is under the pass line and #2 is not already high.
   2. "Already high" = more than 100 ft above Lead (a guess): pass-clear continues above.
   3. The climb out of plane owns when its trigger holds and the pass constraint is met, including the climb's predicted height.
   4. Otherwise the stack hold (low, by the instructor's number).

   Hysteresis of 2 s (a guess) on each change of owner.
10. **Can wait. Range variable: don't blend; use one continuous formula.**
    - With #2's position in Lead's frame (x forward along Lead's velocity, y toward the centre) and Lead's signed radius R: arc behind s = R × atan2(−x, R − y), and offset d = R − sqrt((R − y)² + x²).
    - As R goes to infinity these tend to −x (along-track distance) and y (lateral displacement), so the same pair is defined and continuous through wings level. Below 5° of Lead's bank (a guess), take the limit directly.
    - Compute the closure from velocities, not by differencing s, because s changes when Lead's bank changes without anyone moving: closure = V_Lead − V_2 × cos e × (R / r). This removes the spike when the centre jumps at turn entry and exit.
11. **Can wait. The d slew limit is a hidden phase lag.** A 20 ft/s rate limit inside a loop asking for 170-400 ft steps behaves like several seconds of lag at the range loop's 0.1 rad/s, enough to explain the 3-8 reversals. Raise it to 60 ft/s (a guess) and let the caps in finding 7 do the limiting.
12. **Note. The filter's side rule.** With two constraints the feasible set of turn rates can be two separate intervals, and "nearest to the aim, same side as last step" can hop between them. Keep the side hysteresis, and require the other side to be better by a margin (50 ft of predicted pass, a guess) before switching.
13. **Note.** Lead 1.3 times tighter in the prediction is conservative for both constraints (tighter into #2 raises aspect too). Keep it.
14. **Note. Compute cost.** 41 candidates × 108 sub-steps at 20 Hz is fine; the second constraint adds nothing.

## Recommended structure

State each step, in Lead's turn-centre frame (finding 10): d (offset inward from Lead's circle), s (arc behind), closure, #2's true airspeed V2, Lead's true airspeed V_L and turn rate w.

1. **Speed-consistent offset:** d_ss = R × (1 − V2/V_L). This is the only radius where his current speed holds station, so being slow is automatically answered by flying inside (the instructor's "low inside at full power when short of speed"), and d_ss returns to 0 as power restores the speed.
2. **Arc loop (0.1 rad/s):**
   - Wanted closure = (s − s_target)/10 s, limited to ±25 ft/s within 300 ft of error and ±60 ft/s beyond (a guess).
   - d_cmd = d_ss + (wanted closure − measured closure)/w, limited to ±400 ft (a guess), slewed at 60 ft/s (a guess).
   - Power works from the same arc error at under 0.07 rad/s.
   - s_target = 650 ft (the instructor's happy range).
3. **Path law (0.3 rad/s):** follow the circle of radius R − d_cmd with a 3 s look-ahead point. Cap the resulting angle off the local tangent at +20° outward (steer-behind) and −12° inward (steer-ahead) (guesses). Turn it into the horizontal G and bank; roll at up to 60°/s.
4. **Filter (every step, 5.4 s look-ahead):**
   - Candidates over the horizontal turn rate, bounded by the shaker G at V2 (finding 2), and by Lead + 1.5 G unless the pass constraint can't otherwise be met.
   - #2's future modelled as his current bank slewing at 60°/s to the candidate bank and then holding, not a constant turn from t = 0.
   - The vertical demand entered as a known term. Lead at his rate and at 1.3 times.
   - Constraints: predicted least slant, including predicted height, at or above the pass line (finding 4); predicted x_behind ≥ 100 ft (a guess). Range wins when both can't hold, and the along-track infeasibility sets the climb trigger.
5. **Vertical (0.4 rad/s), one owner** by finding 9: pass-clear below up to 300 ft (or above if already high), the climb out of plane up to 400 ft (a guess), otherwise the stack.
6. **How the manual's cases fall out, with no case table:**
   - **In position, inside:** a 15-20° steer-behind, arriving 650-730 ft behind, overshooting 100 ft outside, then a gentle recapture (collapse to six, reverse, capture).
   - **Tight, inside:** the filter forces more than 20° outward; he ends 300 ft outside, falls back to 700-850 ft and recaptures with steer-ahead (pass clear, end outside, recapture).
   - **Stretched:** the move-out, with the d loop asking for 143 ft inside, held for about 10 s, then d back to 0 (delay the turn, then capture).
   - **Away:** he is outside, falls back, and steer-ahead at the −12° cap brings him in over about 5 s to about 750-900 ft, as the table already shows.

## Starting numbers (all guesses until measured)

- Steer-behind cap +20°, steer-ahead cap −12°, look-ahead 3 s.
- s_target 650 ft; closure limits ±25 ft/s near and ±60 ft/s far; d limit ±400 ft; d slew 60 ft/s.
- Pass line 500 + 1.4 s × closure, floor 600 ft; along-track floor 100 ft behind the wing line.
- Climb: trigger per finding 8, size min(612 ft formula, 400 ft); "already high" 100 ft; owner hysteresis 2 s; side-switch margin 50 ft.
- Shaker-limited G from the sim's own stall model at the current speed.

## Loop margins (question 5)

The phase budget at the crossover frequency: a pure delay T costs w × T radians; a first-order lag or smoothing of time constant tau costs atan(w × tau); a rate limit costs up to 90° when it saturates.
- **Steering at 0.3 rad/s:** delay 0.4 s = 7°; line-of-sight smoothing 0.5 s = 8.5°; roll build (about 0.5 s for a 30° bank change at 60°/s) = 8.5°; G build 0.3 s = 5°. That is about 29° on top of the heading integrator's 90°, so about 60° of margin with proportional heading control: adequate. If the law is position-to-heading with no rate term (two integrators) the margin is gone; the 3 s look-ahead supplies the rate term, so keep it.
- **Range at 0.1 rad/s:** delay 2°, 1 s smoothing 6°, but the 20 ft/s d slew saturates and can add tens of degrees (finding 11).
- **Vertical at 0.4 rad/s:** delay 9°, G build 7°, pitch lag 0.5 s 11°: about 27°, fine with a rate term.
- **Offline methods you can run now:**
  - A step test against a constant-turn pseudo-Lead, each loop alone. Overshoot under 25% means about 45° of margin or better.
  - A delay sweep: run the same case at 0.4, 0.8, 1.2 and 1.6 s reaction time. The delay T_crit at which oscillation sustains gives a phase margin of about w_c × (T_crit − 0.4 s). Keep 0.4 s at least 0.6 s below T_crit for each loop.

## Questions for the instructor's ruling

1. How far is "slightly toward Lead's tail": is a 15-20° steer-behind off the tangent right? A 20° cap is recommended.
2. The working line above the 500 ft rule: accept 600 ft plus a closure allowance as the simulator's own margin?
3. The stack at the end of the turn: how low (100-200 ft), and is level acceptable on arrival?
4. The climb's size (300-400 ft above Lead), and "already high" = 100 ft?
5. When the guard's G would pass the stick-shaker at his speed, does #2 stop at the shaker and use height and power instead? Recommended, as a physical limit.
6. The along-track floor: 100 ft behind Lead's wing line as the working margin for "never ahead of the wing line"?
7. Should the sim log the (d, s) state each second for the in-position case, so the two cause hypotheses in findings 1 and 8 can be confirmed before rebuilding?

Assumptions: aspect 37° for the stretched and tight starts; still air; Lead's roll-in takes about 1.5 s; the trainer's clean stall is 85-90 KIAS (a guess, used for finding 2 only).
