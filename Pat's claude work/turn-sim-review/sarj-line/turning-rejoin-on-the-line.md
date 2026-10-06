# Turning rejoin: reaching the line at route (four-ship thread, 6 Oct 2026)

Patrick 02:11Z: route is on the spinner-to-wingtip line (built in V2.107, TS-103), and the turning rejoin is the same picture as the SARJ. From the reaction point, #2 moves "down" relative to Lead onto the line (down because Lead is banked), then up the line into echelon, never stopping before the slot.

This is not built yet. I tried two fixes and both failed, so I stopped to find the cause (AGENTS.md: two failed fixes).

## What happens today (V2.107, dry run, line abreast right to echelon right)

- **The decision point is not on the line.** `turning-rejoin.js flyToDecision` ends #2's part where the distance along the 45° rejoin line reaches route's spacing (about 230 ft) and he is within `TURNING_REJOIN.captureFt` (150 ft) of the line. In the dry run he gets there about 100 ft ahead of the line (hot), at f -96, l -235, 205 KIAS. Lead is still at 30° of bank.
- **The re-plan there decides the picture Patrick sees.** It is the decision-point re-plan in `events.js` (`replanAtEvents`, the chooser's "from here"). It rolls Lead out and slides #2 straight in to echelon, from near abeam and off the line. It wins because it is quicker than the planned tail.

## Fix 1, failed: fly the planned tail in Lead's banked plane, with no decision re-plan

- **What I built:**
  - Each tail place is lowered by |left| x tan(Lead's bank): about 94 ft at route and 26 ft at echelon, at 30° of bank.
  - A height leg rises with the plane as Lead rolls out (`trackTwice moreHeights`).
  - The tail no longer re-plans at the decision point.
- **Result:** from about 100 ft ahead of the line, the tracker ran #2 up to f -10 (nearly abreast), back to f -166, then forward into echelon. Line abreast to echelon took 67 s (it was 30 s). This is the overshoot Patrick described, and the old route hid it on main.
- The code is kept in the scratchpad (tr-attempt2.js), not in the repo.

## Fix 2, failed: the decision point only when he is within 30 ft of the line

- **Result:** no turning rejoin plans from line abreast, and the chooser falls back to a slower planner.
- In every capture and bank the search tries, he reaches the decision distance either hot by 97 to 177 ft or cold by 70 to 133 ft. None is within 30 ft.

## The cause

The line capture in Lead's turning frame doesn't converge before the decision distance:

- **Capture law.** `aimFt` is 300 to 1,200 ft, `approachDeg` 80° and `lineTauSec` 4 s. With 100 ft to go he heads only about 16° across the line, so he closes on it slowly.
- **Search rule.** The search picks the quickest rejoin, which arrives hot inside the 150 ft capture.
- **Speed.** Hot and inside Lead's turn, he holds at least Lead's 200 KIAS (TS-75), but the inside place moves slower (about 196 KIAS at route). He keeps gaining forward after the decision point.

## Proposal (an estimate, not built)

1. **Close targets: on the line before the decision point.** For echelon and route, add a sharper capture (aims of 100 and 150 ft) and require him to be within about 30 ft of the line by the time he is about one route distance out along it.
2. **The decision point is route itself on the spinner-to-wingtip line.** Route sits about 20 ft ahead of the 45° rejoin line from Lead's centre.
3. **Speed from there: the inside place's own speed.** That is about 196 KIAS, as fighting wing already does (`leastKias`). This is Patrick's "close in and hot" exception to the 200 KIAS floor, not a new rule.
4. **Then fly the planned tail in Lead's plane** (fix 1's heights), with no decision re-plan for echelon and route.
5. **Dry runs:** line abreast and fighting wing to echelon and route, both sides, the four's #2, and the 2-ship regression.

Owner: four-ship thread (turning-rejoin.js). A Fable read of the capture law is the AGENTS.md step after two failed Opus fixes, if Patrick wants it.

## Try 3 (6 Oct, after the card; the card's recommended option while Patrick decides): failed, stopped

- **What I built:**
  - Proposal steps 1, 2 and 4: the decision point is route on the spinner-to-wingtip line, within 50 ft of it.
  - Sharper captures, with aims of 100 and 150 ft.
  - The tail in Lead's plane, with no decision re-plan.
- **#2's part now works.** He reaches route on the line in about 11 s, from line abreast.
- **The tail from there doesn't.** From route at 200 to 215 KIAS, inside Lead's 30° turn, the tracker runs him 30 to 98 ft ahead of echelon, toward Lead's 3/9 line, and the lane check refuses it. This happens with or without the plane heights. The one plan that passed went far behind (dipping to 175 KIAS), came up the line from 870 ft back, and took 76 s, with a 14 ft forward overshoot.
- **What still has to be solved:** taking out the closure from route to echelon inside Lead's turn. Step 3 (slow to the inside place's speed before route) is untried. It needs the tail to start at the inside place's speed, not Lead's 200 KIAS.
- Code is in the scratchpad (tr-attempt3.js, moves-attempt3.js), not in the repo. The repo is at V2.107.

## The general "never stop" closure law (tried 6 Oct 02:40Z, not shipped)

- **What it did:** the tracker closed on a point on the way (route, a vector point) as if on the last slot beyond it, so it passed through instead of slowing to it (`passThroughFt`). The diff is in the scratchpad as pass-through.diff.
- **2-ship:** every change came out the same as V2.107, within a second. The 2-ship legs were already capped and flowing.
- **4-ship:** fighting wing to finger went from 87 s to 129 s, and the closest pass fell from 49 ft to 18 ft, because wingmen run through their stack points into each other. I backed it out.
- **Where the stops are now:** the SARJ (V2.105) and the four's echelon (V2.106) already flow. What's left is the turning rejoin's decision point. Patrick's 02:30Z picture is the X line to about 100 ft, then route and echelon in one fluid motion; see his card on where the 100 ft is measured from.

## Patrick's picture, confirmed (6 Oct 02:30Z, 02:50Z)

- 02:30Z: "The 'line' for the turning rejoin is not the same prop/spinner line ... From the perspective of the rejoining aircraft the vertical stab and the far wing make 'an x'. You maintain that sight picture until about 100 feet away, which is the decision point. At this point you either roll wings level and overshoot if you are not stable/controlled, or you move into the route position, then to echelon, in one fluid motion."
- 02:32Z: a rejoin to the outside crosses to the other side at the decision point, then goes up to route, then down into echelon. Up to the decision point it is the same manoeuvre.
- 02:50Z: "Through the decision point, out slightly to route, then up the line to eschelon. One smooth movement."

## Try 4 (02:55Z): decision point 100 ft from Lead on the X line. Failed, backed out

- **Where he arrives.** With `TURNING_REJOIN.decisionFt` 100 and the tail in Lead's plane, #2 reaches the 100 ft point anywhere inside the 150 ft capture.
  - Sometimes nearly astern (f -118, l -23).
  - Sometimes nearly abeam (f -23, l -117).
  - He is at 209 to 218 KIAS, 10 to 18 kt of overtake at 100 ft.
- **The tail.** From there it passes Lead's 3/9 line by 30 to 125 ft, so every plan is refused.
- **Debug build.** In the scratchpad as tr4-dbg.js.
- **What it needs.** A capture law that actually holds the X picture down to 100 ft, which tries 2 and 3 couldn't get either. Arriving at the decision point needs closure under control, close to Lead's speed, not 10 to 18 kt over it. That means slowing on the line before the decision point, which today's planner times for about 230 ft.
- **Recommendation:** a Fable design read of `flyToDecision` (capture and slowing for a 100 ft decision point), then the four-ship thread builds it.
