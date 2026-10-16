# Design review brief 2: the simulated wingman in the trail cone, in Lead's turns

## Context and purpose (please read first)

This is a design document for a **flight-school training tool**. Patrick, a flight instructor at a basic pilot-training school, is building a formation simulator for student pilots on a single-engine turboprop **basic trainer aircraft**. It shows students, on the ground, how a wingman keeps a safe position behind a lead aircraft, so that formation training is **safer and mid-air collisions are prevented**.

**The absolute priority is that the simulated wingman never comes close to hitting the lead aircraft and always stays in a safe position behind it.** Smoothness and realism come after that.

Everything you need is in this one document. Please do not open any other file. You reviewed an earlier draft of this design (your findings F1-F19 are referred to by number below; you do not need them in front of you).

## Terms

- **Lead**: the lead aircraft. **#2**: the simulated wingman.
- **The trail cone**: the school's loose formation. #2 is 500-1,000 ft from Lead, 30-60° back from Lead's wing line ("sweep"). **Never closer than 500 ft slant range** (the instructor's one hard rule). The instructor's happy range is 600-650 ft.
- **Steer-ahead / steer-on / steer-behind**: #2's flight path points ahead of Lead (inside Lead's turn circle, closes range), at Lead, or behind Lead (outside the circle, opens range).
- **Pass clear**: when the geometry would bring #2 too close, he moves out of Lead's way first.
- **Aspect**: #2's angle off Lead's tail (0° directly behind, 90° abeam on Lead's wing line, 180° in front). **#2 must never get ahead of Lead's wing line (aspect over 90°) in the cone.**
- **HCA**: heading crossing angle between the two aircraft.
- **Lead's turn circle**: the circle Lead is flying, worked out each step from his bank and true airspeed as #2 sees them.

## The simulator

- Point-mass aircraft (the trainer's performance: thrust, drag, roll rate and build-up, G build-up, stall warning), stepped every 0.05 s. Feet, seconds, G, knots indicated (KIAS).
- **The formation flies 200 KIAS at 8,000 ft, about 380 ft/s true** (your earlier numbers assumed 180 KIAS). Lead's level turn in the test: **60° bank, 2 G**, so about 8.4°/s and a radius of about 2,590 ft.
- #2 is a live wingman: he sees Lead **0.4 s late** (the instructor's reaction time for this formation), with closure smoothed over about 1 s and line-of-sight rate over about 0.5 s. He feels his own state at once.
- His command is a **lift vector** (G and its direction; bank is not capped and he may go past 90° only if needed), plus throttle. Roll rate up to 60°/s. G up to Lead's + 1.5 normally; the pass-clear guard may pull to the aircraft's limit, flagged on screen.

## Built since your first review, and how it measures

All numbers come from the simulator's measuring tool. The scenario: Lead rolls into the 60°/2 G level turn, holds it 30 s, then rolls wings level for 30 s. #2 starts in one of three places, with Lead turning **toward** him ("into") or **away**:
- **in position**: about 780 ft, 37° aspect;
- **stretched**: about 950 ft;
- **tight**: about 520 ft.

### What was tried and why it failed

1. **Pass clear by aiming at "where Lead was 1 s ago"** (as specified after your F1). At the start of Lead's turn that point is still on Lead's old straight track, about 80° off #2's nose. #2 pulled 3.5 G at 90° bank across Lead's track: HCA reached 66-70°, then the range opened at more than 200 ft/s to 1,500-3,800 ft. The instructor's manual says to turn only *slightly* toward Lead's tail.
2. **The pass-clear filter (built, works):**
   - Each step, #2's aim gives him a wanted turn rate.
   - The pass is predicted over 5.4 s: #2 holding that turn; Lead holding his and also turning 1.3 times tighter; the least slant range taken.
   - If the predicted pass is at least 600 ft, he flies the aim's turn. Otherwise he flies the turn rate nearest to it that keeps the predicted pass at 600 ft or more: a search of 41 turn rates from full left to full right, refined by bisection, staying on the same side as last step unless only the other side works.
   - While it is changing his turn he goes below Lead (up to 300 ft, enough to make the slant 600 ft) with power back to 20% torque, held 1 s after.
   - No miss or reverse phases, so nothing to cycle.
   - **Result:** from tight, Lead turning into him, he never comes inside 500 ft (least 520 ft). This is the first version that meets the rule.
3. **The range loop in the turn used slant range.** Slant can't tell behind from ahead: on a circle inside Lead's, #2 kept closing past Lead's wing line (aspect 127°) while the slant grew again. **Changed:** in the turn the range is #2's **signed arc behind Lead around Lead's circle**, and its closure is the arc's rate (smoothed about 1 s). The wanted closure is the arc error ÷ 10 s, within ±25 ft/s. As in your F3, it is turned into an offset d from Lead's circle (d = wanted closure ÷ Lead's turn rate, within ±250 ft, slewed 20 ft/s). What d can't give goes to power.
4. **How he steers to d:**
   - **Option A:** aim at Lead's position moved d inward. From inside Lead's circle (every turn into him) this cuts across Lead's track.
   - **Option B:** follow the circle of radius (Lead's radius − d), aiming at the point on it 3 s (or 6 s) of his own flight ahead of where he is on it. Separation is excellent (least slant 600-880 ft in every case except tight).
5. **High climb out of plane.** The instructor's ruling for this inside-the-turn case: a climbing turn out of Lead's plane to kill the horizontal closure and bleed speed, then back down behind Lead, ending stacked low. Pass clear itself stays below. A first try (go 400 ft above Lead when the arc closure exceeds 15 ft/s and would bring him inside 600 ft within 5 s; down again under 5 ft/s) barely triggered in the in-position case and made the tight case worse (least 491 ft), so it was taken out.

### The measured table

Each cell gives the least slant during the turn, the slant at the end of the 30 s turn, and his KIAS against Lead's at that moment.
- **Older model:** the previous trail-cone model, no reaction time, stepped heading search.
- **Guard + steer-on:** the live wingman with pass clear by aiming at where Lead was, then steer-on at Lead.
- **Filter + arc + B (3 s):** pass-clear filter, arc range, option B with the 3 s point.

| Start | Older model | Guard + steer-on | Filter + arc + B (3 s) |
|---|---|---|---|
| into, in position | 533 / 619 ft | 652 / 1,040 ft | 658 / 746 ft, −39 kt |
| away, in position | 630 / 658 | 642 / 781, −16 kt | 736 / 755, −15 kt |
| into, stretched | 544 / 625 | 661 / 849 | 601 / **2,596** |
| away, stretched | 657 / 657 | 672 / 672 | 731 / 746, −13 kt |
| into, tight | **394** / 617 | **472** / 2,050 | 520 / 646, −14 kt |
| away, tight | 520 / 664 | 513 / 653 | 520 / **1,820** |

**Most aspect in the turn** (over 90° means ahead of Lead's wing line; must not happen):
- Guard + steer-on: 37-66° in every case.
- Filter + arc + B with the 3 s point: into, in position **142°**; into, tight **160°**; the rest 37-89°.
- With the 6 s point: **137-167°** in most "into" and "away, in-position" cases, but least slant 784 ft or more except tight.

The older model also had 19 G reversals in a turn. The live versions have 3-8 smoothed reversals.

### The cause left

Starting inside Lead's circle (every turn toward #2), at Lead's speed, #2 gains angle round the circle. At 430 ft inside a 2,590 ft circle, the inner circle's turn rate is about 1.7°/s more than Lead's. Your F11: holding a place inside needs about 86% of Lead's speed.

He has three ways to stop the gain, and so far each has failed somewhere:
- **Moving out to Lead's circle quickly:** a big crossing turn, high closure and HCA, and the filter then pulls hard.
- **Moving out slowly:** he is already level with Lead by about 7 s and ends ahead of the wing line.
- **Steer-on at Lead:** he never gets ahead, but ends the turn 1,040-2,050 ft back.

Power alone is slow (about 26 kt to lose). The instructor's manual tools are the vertical (a climbing turn above or a descending turn below Lead), power, and steer-behind. The instructor ruled that #2 climbs out of plane in this case. The manual's sequence for a turn into #2 from in position: collapse to Lead's six by turning slightly toward Lead (steer-behind), then reverse and promptly capture Lead's turn circle by matching his turn. From tight: pass clear (a climbing turn above or a descending turn below); expect to end outside the circle and recapture it. From stretched: delay the turn (steer-ahead), then capture the circle by matching Lead's turn.

### The instructor's rulings that stand

- 500 ft slant range is the rule, with no margin.
- Pass clear goes below, or above if he is already high.
- The guard may exceed Lead + 1.5 G, flagged.
- No "terminate" call. Lead never waits.
- In the turn: low inside at full power when short of speed; the high climb out of plane when gaining on Lead inside his turn.
- 0.4 s reaction time.
- Loop bandwidths (your F6): steering about 0.3 rad/s, range 0.1, vertical 0.4, power under 0.07.
- One pitch owner at a time (your F7).

## What we ask

1. **The in-turn steering law for #2 starting inside Lead's circle.** Recommend the structure that collapses to Lead's six without crossing hard and without ever getting ahead of the wing line, reaching 500-900 ft behind by the end of a 30 s 60° turn if that is achievable. If it isn't achievable at equal power, say what is, with the geometry. Should the reference be Lead's circle, a point on it a set arc behind Lead, the "steer-behind" angle relative to the line of sight, or something else? How should the three manual cases (in position, tight, stretched) and "away" fall out of one law rather than a case table?
2. **A second constraint in the pass-clear filter:** "stay behind Lead's wing line (aspect under 90°) over the look-ahead", besides "pass at least 600 ft". Is a predictive filter with both constraints sound? What look-ahead and what model of #2's own future (constant turn, or something better) should it use, so it neither over-pulls nor lets him get ahead? How should the vertical (below for pass clear, above for the climb out of plane) enter the filter's search, since a slant constraint can be met partly in height?
3. **The climb out of plane:** a trigger and size that work. Why might the first try have triggered late in the in-position case and cost separation in the tight case? How should it be ordered against pass clear below (one pitch owner)?
4. **The range variable:** arc behind Lead in the turn, slant when straight. How should it blend at the turn's entry and exit (the circle's centre jumps as Lead rolls), and with the filter?
5. **Loop margins:** a quick check, or a method we can run offline, that the 0.4 s delay, the 60°/s roll and the G build-up leave enough phase margin for the steering, range and vertical loops at these bandwidths.
6. Anything else that is unsafe or will not converge.

Please give a verdict, numbered findings (fix before building, can wait, note), a recommended structure with starting numbers (each marked a guess), and the questions that need the instructor's ruling. State any assumption you make.
