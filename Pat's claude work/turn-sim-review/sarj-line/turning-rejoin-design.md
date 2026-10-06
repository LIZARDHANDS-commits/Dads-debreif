# Turning rejoin: Lead fixed on the canopy to a 100 ft decision point

Design for the four-ship thread to build in `src/modules/turn-sim/live/turning-rejoin.js`. Read-only design, 6 Oct 2026, from the thread "Wingman chooser review, retry".

## Status

- **Ratified by Patrick (card, 03:14Z): "Fixed on canopy".** "Nose on Lead" means Lead stays at one fixed spot on #2's canopy down to the 100 ft decision point, as in SMM Fig 12.15 views 1 to 3.
- **Dry-run only**: a stand-alone kinematic sketch, not the sim's flight step. Numbers marked *estimate* have no manual page or Patrick ruling yet.

## Patrick's picture (6 Oct 02:30-02:53Z)

- The vertical stab and far wing make an X (SMM 12.24 paras 56-57). Hold that picture to about 100 ft from Lead, the decision point.
- At the decision point: not controlled, roll wings level and overshoot. Controlled: "Through the decision point, out slightly to route, then up the line to eschelon. One smooth movement." (02:50Z)
- To the outside, the same up to the decision point, then cross over (02:32Z).
- Rules: geometry first, power as needed; never stop until in position; keep it simple.

## Why the four builds failed

`flyToDecision` steers onto a fixed 45° line with a 150 ft cross-track capture band. A 150 ft band at 100 ft from Lead covers everything from astern to abeam, so the arrival bearing was random and every tail plan was refused. The fix is to capture the **bearing as an angle**, not the line as feet.

## The law: Lead fixed on the canopy

Work in Lead's turning frame, as `flyToDecision` already does (`vfx`, `vfy`: Lead's velocity plus his turn at #2's spot).

1. **Bearing.** Let b be #2's angle off Lead's tail (0 = astern), with bX = 45° (`TURNING_REJOIN.lineDeg`, SMM 12.24 paras 56-57). The relative motion wanted is straight at Lead, plus a sideways correction that turns the bearing onto the X:

   `vRel = -Vc * p + r * (bX - b) / tauB * t`

   Here p is the unit vector from Lead to #2, t is the unit vector of increasing b, and r is the range. With tauB fixed, the bearing error shrinks with time, not with range, so it is gone well before 100 ft. *Estimate:* tauB 6 s.
2. **Geometry first.** Keep the bearing correction. Take the closure from whatever #2's speed gives now. Today's `disc`/`lam` solve does this unchanged: it solves `|frame + tangential - lam * p| = W.tasFtps` for lam, then sets the heading from that vector. Keep the existing feed-forward (`ff`) and `lineTauSec` heading loop. In the sketch the bearing slid aft by up to 40° without the feed-forward.
3. **Power as needed.** The speed command is the speed that would make lam equal the closure wanted: `|frame + tangential - Vc(r) * p|`. Use the existing speed loop, jerk limit and power choice.
   - `Vc(r) = sqrt(arrive^2 + 2 * aC * (r - decisionFt))`. arrive is **10 kt of closing speed (about 17 ft/s, range rate) at the decision point, for every Rates choice** (Patrick 6 Oct 03:16Z: "set the airspeed to target ten knots at the decision point"). This replaces today's `arriveFtps` (Instructor 40 ft/s) for the turning rejoin only. Faster before the decision point is fine (Patrick 03:16Z). Above it, the closure is still capped by the line's speed. aC is the power-back rate. *Estimate:* 3.5 ft/s², about 2.1 KIAS/s × the true/indicated ratio, from slow-down.js at 200 KIAS, 8,000 ft.
   - Cap at the line's 220 KIAS (`REJOIN.lineKias`, TS-75).
   - Floor at 200 KIAS (TS-75). Inside 500 ft, the floor is the inside place's own speed in Lead's turn, about 196 KIAS. *Estimate:* the 500 ft.
4. **Hot starts** (line abreast, SMM Fig 16.25). Far out inside Lead's turn, a fixed bearing would need less than 200 KIAS. The floor holds, so the bearing drifts as Lead crosses #2's nose, then the bearing law brings it back to the X. No special case is needed.
5. **End.** Stop at r ≤ `decisionFt`, now **100 ft** (Patrick 02:30Z) instead of route.left / cos 45° (about 230 ft). There is no capture band.

What to delete from `flyToDecision`: the u/nrm line frame, `chi`/`approachDeg`/`aimFt`, the `captureFt` gate, and the `runIn`/`runInRelease` logic. `Vc(r)` replaces them. Keep the 3/9 check (`ahead`); it should never fire now. In `searchTurningRejoin`, the `aimsFt` search becomes one tauB, or [4, 6, 9] s if one isn't enough.

## Dry run (kinematic sketch)

Lead at 200 KIAS and 30° bank, turning toward #2. #2 has a 60° bank cap, +1.6 and -6.4 KIAS/s, and Instructor closure. Script: the thread's scratchpad `xline.mjs` (not in the repo).

Dry run with 10 kt at the decision point (03:16Z): every start reached 100 ft at 44-47° off the tail, 17 ft/s, 204-205 KIAS, 3-4 s slower than the table below, and none came closer than 68 ft behind Lead's 3/9 line or went below 199 KIAS.

First run, at Instructor's 40 ft/s:

| Start | Time to 100 ft | Bearing at 100 ft | Closure | KIAS | Closest to Lead's 3/9 line inside 1,000 ft |
|---|---|---|---|---|---|
| FW 750 ft, 45° | 14 s | 45° | 40 ft/s | 214 | 71 ft behind |
| FW 1,000 ft, 30° | 20 s | 45° | 40 ft/s | 214 | 71 ft behind |
| FW 600 ft, 60° | 11 s | 49° | 40 ft/s | 212 | 67 ft behind |
| 1,500 ft astern | 30 s | 45° | 40 ft/s | 214 | 71 ft behind |
| LAB 4,000 ft, slightly aft | 39 s | 43° | 40 ft/s | 214 | 74 ft behind |
| LAB 5,000 ft abeam | 64 s | 45° | 40 ft/s | 214 | 71 ft behind |
| LAB 6,000 ft abeam | 71 s | 45° | 40 ft/s | 214 | 71 ft behind |

Every start arrives on the X at the same closure. None goes below 200 KIAS, and the bank peaks at 60°.

## After the decision point: out slightly, up the line

At 100 ft and 45°, #2 is 71 ft back and 71 ft out. The spinner-to-wingtip line runs from echelon (25 back, 45 out) at 1 ft back per ft out (slots.js `LINE_BACK_PER_OUT`). The nearest point on the line is about 51 ft down it from echelon, about 1.5 wingspans. #2 is about 14 ft aft of the line there. So "out slightly to route" means about 14 ft onto the route line, and "up the line" means about 51 ft up it to echelon. Route itself, at about 217 ft, stays behind him.

`tailLegs` today aims its first leg at the **route slot**, which is behind #2 at a 100 ft decision point. Change it to:

1. **First leg:** the point on the line nearest #2, `downTheLine(pairSlot('echelon', s), s, alongFt)`, where alongFt is the decision point's distance along the line (about 51 ft). Use `closeThrough(..., { advanceTol: TURNING_REJOIN.routeFlowFt })` so it flows through without stopping.
2. **Second leg:** echelon, at the close-in rate, with closure kept above zero until IN POSITION (within 5 ft and 5 kt, TS-80; never-stop rule).
3. **To the outside:** same to the decision point, then cross behind Lead to the far side's matching point on its line, then up it (Patrick 02:32Z). Reuse `legsFor`'s crossing, starting from the line point.
4. **Not controlled at 100 ft** (Patrick card 03:15Z, "Closure or bearing"): overshoot when the closing speed is more than 1.5 times the target (over 15 kt, about 25 ft/s), or Lead is more than 10° off the X picture (bearing outside 35-55° off his tail). Both thresholds are estimates. Fly the overshoot the tracker's existing way: wings level, behind Lead (SMM 12.27 para 65).

**The stop.** At 10 kt (17 ft/s) with about 50 ft to go, the stop needs about 3 ft/s², which power back and a little geometry give easily. From the decision point the run-in may take the Rates close-in rate again, with the stop at echelon.

**Fighting wing.** Out of scope. A 100 ft decision point only applies to close formations, so keep today's FW decision point and tail.

## Numbers to add (tuning.js TURNING_REJOIN)

- `decisionFt: 100` (Patrick 6 Oct 02:30Z)
- `bearingTauSec: 6` (estimate)
- `slowFtps2: 3.5` (estimate, slow-down.js power back at 200 KIAS)
- `insideFloorFt: 500` (estimate)

## Still open for Patrick (asked one at a time in the Fable thread)

1. ~~Does "nose on Lead" mean Lead fixed on the canopy?~~ Yes, Patrick 03:14Z.
2. ~~What counts as "not controlled" at 100 ft?~~ Closure or bearing, Patrick 03:15Z (thresholds above are estimates).
3. ~~Closure at the decision point?~~ 10 kt, Patrick 03:16Z.

## Update 03:32Z: the decision window (Patrick, card "Approve", wording confirmed)

> "#2 holds the X picture until his closure is stable (10 kt). He then moves out to route and up the spinner-to-wingtip line to echelon in one movement, anywhere between 250 ft and 100 ft from Lead. If his closure isn't stable by 100 ft, he overshoots."

What changes in the build:
- **Slowing.** The slowing curve targets 10 kt at about 250 ft, not 100 ft. This follows SMM 12.24 para 53 ("stabilize in route" before closing) and para 58 (the move to the line can come at route's lateral spacing, or as late as the near corner).
- **Leaving the X.** #2 leaves the X at the first point in the window where his closure is stable and the bearing is within 10°. At 250 ft the nearest point on the spinner line is route itself, about 20 ft forward of him. At 100 ft it is about 51 ft down from echelon.
- **Overshoot.** If he is not stable by 100 ft, he overshoots under the 03:15Z rule.
- **Tuning numbers.** windowFarFt 250 and windowNearFt 100 (Patrick 03:31Z, 03:32Z). The slowing to be stable by 250 ft is an estimate to fly and judge; it costs a few seconds against aiming at 100 ft.

## Update 03:33Z: five SMM rules for the spec (Patrick, card "Approve all five", wording confirmed)

1. Height: on the X, #2 stays just slightly below Lead's plane (SMM 12.24 para 58).
2. Overtake: down the X, up to 20 KIAS over Lead's 200 (220 KIAS), off by the window (para 56: 10-20 KIAS; ours already does this).
3. Line-up: approaching route's spacing, #2 aligns his fuselage with Lead's before moving to echelon (para 58).
4. No steep turn inside Lead's circle to stop the closure: torque and speed brake first, then overshoot (caution after para 58; para 65).
5. Overshoot path: roll wings level, reduce torque, pass behind and below Lead, never climbing to his altitude; stabilize on the outside, then cross back with at least one aircraft length clear and no overtake (para 65, Fig 12.18). On an outside rejoin, pass 1-2 lengths behind and below (para 59).

Build notes: rule 4 means the bearing law's bank stays near Lead's own once inside the window; if closure isn't stable, overshoot rather than steepen. Rule 5 needs checking against the tracker's existing overshoot: it must go below Lead (no climb to his altitude) and wait outside with no overtake before crossing back.

## Update 03:43Z: the rejoin plans only to the window (Patrick)

> "All the "rejoin" needs to really plan is to get the aircraft from 250-100 feet at 10-20 knots overtake on lead, and then it should always work after that."

- **The plan's only job:** reach the window (250-100 ft from Lead, on the X) closing at 10-20 kt. Read as closing speed on Lead (range rate), about 17-34 ft/s; inside Lead's turn this is within a few knots of KIAS overtake.
- **Replaces the single 10 kt target.** Arriving anywhere in 10-20 kt counts. The slowing curve aims for the middle, 15 kt, by 250 ft.
- **From the window on,** the tracker flies the run-in up the spinner line to echelon. The plan is not checked past the window, so the 20 ft check goes. A closure over 20 kt at 100 ft, or Lead more than 10° off the X, is the overshoot (03:15Z, last resort, 03:35Z).

## Correction 03:44Z: 10-20 kt is KIAS over Lead (Patrick)

> "10-20 knots more speed than lead (lead flies 220) PLUS the overtake from the [geometry]. so its 10-20 knots KIAS more than lead, with that distance band (along the line)."

- **In the window:** #2 is 10-20 KIAS faster than Lead, measured as indicated airspeed against indicated airspeed. Closure is that overtake plus whatever the geometry of the turn adds. This replaces the 03:43Z reading as closing speed.
- **The band** (250-100 ft) is measured along the X line to Lead.
- **Lead's speed: 200 KIAS** (Patrick card 03:44Z, SMM 12.23 para 53). #2 is 210-220 KIAS in the window.
- **Overshoot (03:15Z) re-based:** more than about 1.5 times the top of the band at 100 ft, i.e. over about 30 KIAS above Lead, or more than 10° off the X. Both are estimates.

## Approved 03:45Z: windows everywhere (Patrick, card "Approve", wording confirmed)

General rule: "Every Formation target is a window, never one exact point: each move aims for the middle and accepts anywhere inside. A move always tries to reach the position; the overshoot is the last resort, never an error."
1. Rejoins (turning and straight-ahead): "A rejoin plans only to the window: #2 arrives 250-100 ft from Lead, measured along the rejoin line, 10-20 KIAS faster than Lead (Lead at 200). From there he flows up the spinner-to-wingtip line to echelon. If at 100 ft he is more than about 30 KIAS fast, or more than 10° hot of the picture (ahead of the X, toward Lead's 3/9 line), he overshoots. Cold of the picture is fine."
2. Four-ship: "#3 and #4 wait anywhere 250-550 ft and 600-900 ft behind their places, still closing slowly, and come in one at a time."
3. The 20 ft check ahead of the slot becomes a warning on screen, not a refusal; if #2 can't stop, he overshoots.
Sources: Patrick 6 Oct 03:35Z, 03:40Z-03:45Z; cards 03:44Z (Lead 200), 03:45Z (wording).
