# Removing the kinematic lines from the 2-ship: before, after, costs, gains

For Patrick, 6 Oct 2026 23:00Z. From the review of the renamed copy (main 768c568, V2.154) plus the four-ship thread's merges since (V2.155-V2.161). Nothing here was run; sizes and times are estimates. Names are the copy's; "cone position" is fighting wing on screen.

## 1. The answer

**Remove the lines and fly every 2-ship move on tracker phases, as the 4-ship already does.** It takes one or two weeks and a re-fly of the flight set, changes no manual shape, and removes a whole controller with its own closure, power, bank and rule copies. The optimiser is not needed for it and is not part of it.

**Would you still want the optimiser afterwards?** Need: no. The tracker with a short search over aims flies the manual's techniques correctly, and that is what a trainer must do. Want: only for three things the tracker cannot give: trimming time and energy inside the limits from any start, the by-the-book / restricted / unrestricted modes with the price of each rule on the card, and a path from truly odd starts that no recipe covers. Those are teaching features, not correctness. Decide on them after the lines are out and you have flown the result; the optimiser plans stand either way.

## 2. Before: what the lines do today

A "line, then tracker" plan (`line-moves.js planLineChange`) is one of the candidates the chooser races (`chooser.js:55`), beside the turning rejoin, the straight-ahead rejoin, the drop-back to cone position, the opening out at full power and the plain tracker. It covers, per its own header: cone position to echelon, route or line astern (a straight-ahead rejoin shape onto Lead's six); a close formation out to cone position on the same side; cone position across to the other side behind Lead; any formation out to line abreast; and the straight-ahead rejoin from line abreast. Several of those now have a dedicated planner racing against it (echelon-to-fw.js, open-out.js, straight-rejoin.js), so the line wins only where it is quicker.

How a line flies:
1. `kinematic-moves.js routePoints` lays waypoints in Lead's frame (fore/aft, left, up).
2. `kinematic.js relPath / timeLaw / powerLaw` draws a smooth path through them and gives it a time law at the rejoin closure, capped by a rate table (`relSpeedLimit`).
3. `hand-over.js lineRunIn` samples the path once a step against Lead's recorded flight, blends #2 onto it, reads poses off it (`posesFrom`: bank from the path's curvature, lagged toward Lead's bank), back-solves the power from the speed changes (`holdToPower`, `labelStages`), smooths three times, and stops at the hand-over point 500 ft from the slot (`HAND_OVER_FT`, Patrick 5 Oct 06:24Z).
4. The tracker starts from the last pose with the line's acceleration and closes to the slot at the close-in rate; `trackTail` / `replanFor` re-plan the tail from the real state when the line ends.

Mid-move presses never use lines: `MID_PLANNERS` (`chooser.js:77`) filters `planLineChange` out, so every re-plan is already tracker or technique.

What the lines are good at: a readable geometric shape (the corner behind Lead, the stop points), cheap to compute, easy to draw.

What they cost today:
- **A third controller.** Their own closure law (`runInLaw`), their own power (worked out after the shape), their own bank (from curvature), their own copies of the lane and height-under-Lead rules (`kinematic-moves.js:231-232`, hard-coded 1,000 / 2,000 ft until step 1 of the refactor). Every ruling lands in them as well as in the tracker and the rejoin law.
- **Power as a consequence, not a plan.** The line decides the shape and finds out afterwards whether the engine can fly it (STRETCHED). "Geometry first, power as needed" is a joint choice a pilot makes each second; a line cannot make it.
- **The seams.** Bank and power at the hand-over are whatever the path implied, not what the tracker's first phase wants, so three smoothing passes exist to hide the join, and the tail is re-planned to cover the rest.
- **History.** The 4-ship was rebuilt on the tracker with "no kinematic line in front of the tracker" because the lines' replayed poses were where its 80-100 G/s onsets and 8-12 G came from (headers of `four-legs.js`, `four-close.js`, `four-rejoin.js`, `four-open.js`). The 2-ship still carries what the 4-ship dropped.
- **Code.** About 1,040 lines (`kinematic.js` 591, `kinematic-moves.js` 285, `line-moves.js` 160) plus `lineRunIn` and its helpers in `hand-over.js` (~150), of which a part (`applyPose`, `poseOf`, `smoothest`, `slotInWorld`, `makeTrack`) is shared with fluid manoeuvring and the lag roll and stays.

## 3. After: every 2-ship move on tracker phases

- The chooser's candidate list loses "line, then tracker". The moves it covered are already recipes: `transitions.js legsFor` has the same manual routes as phases (the line header says so: "the lines follow the same manual routes as the tracker's legs"); the straight-ahead shape onto Lead's six is `straightAhead`; the drop back and sweep out are `dropBack` / `sweepOut`; opening out is `openOut`; the crossing behind Lead is `cornerBehind`.
- A long move flies its first phase at the rejoin closure (`hand-over.js onClosure` already gives a rejoin's closure to a long leg and the close-in rate to the close leg) and the hand-over becomes the change from one phase to the next at 500 ft, inside one controller: no pose read-off, no back-solved power, no smoothing passes, no tail re-plan.
- `kinematic.js` keeps only what fluid, the lag roll and `full-power.js` use (poses, tracks, `slotInWorld`, the smooth curves); `kinematic-moves.js` and `line-moves.js` go; `lineRunIn`, `runInLaw`, `trackTail`'s line branch and `wingPlan`'s line field go from `hand-over.js`.
- The straight-ahead rejoin from line abreast (the More option) is flown by `straight-rejoin.js`'s law, which already exists, or by `straightAhead` phases if the law does not cover that start; check which on the flight set.

What stays the same: the end pictures (same manual routes), the hand-over distance, the Rates closures, the envelope gate, replay and the drawn path, the 4-ship (already there).

## 4. Costs and gains

| | Cost | Gain |
|---|---|---|
| Work | One or two weeks, one writer (Opus), one pull request per group of moves, one end-picture test each; re-fly the flight set (`/mnt/project-files/turn-sim-review/fset.mjs`) before and after | About 1,000 lines gone; one controller for the 2-ship as for the 4-ship |
| Flying | Some moves change shape slightly where the line's geometric path and the tracker's law differ (expect the crossing behind Lead and the opening out to show it most); times may move by a few seconds either way | No hand-over bump; power planned with geometry each step; no STRETCHED from a shape the engine could not fly; the 4-ship's G-onset fix comes to the 2-ship |
| Rules | None | Lane, height-under-Lead, bubble, Rates: read from one place by one controller; every future ruling lands once |
| Risk | The tracker's long-leg closure law has not been the 2-ship's main planner for these moves since 5 Oct; its gains were tuned for the close-in. Expect a tuning pass on the first phase (closure cap far out, bank cap) | The tracker already proved itself on the 4-ship's long legs with the same recipes |
| Readability | None | One way to read how a move is flown: its phases |
| Reversibility | Keep the line files on a branch tag for one version; a setting is not worth it (two controllers again) | |

## 5. Recommendations

1. **Do it as step 5 of the refactor, now that steps 1-4 are merged.** The one-cone-table, one-lane-rule and one-rejoin-law work (V2.155-V2.160) was the preparation; the lines are the last place those rules still have a private copy.
2. **Order of moves:** (a) any formation out to line abreast (the recipe exists and `open-out.js` already races it); (b) cone position across to the other side behind Lead; (c) close formation out to cone position (echelon-to-fw.js already wins most of these); (d) cone position to echelon/route/astern (the straight-ahead shape; check `straight-rejoin.js` covers it); (e) the straight-ahead rejoin from line abreast. Each a pull request with before/after on the flight set.
3. **Hand-over as a phase change.** Phase one at the rejoin closure to the 500 ft point, phase two at the close-in rate; make sure phase two inherits phase one's bank, acceleration and power stage (the tracker runs them in one loop, so this is the default once the line is gone).
4. **Tuning pass, not a redesign.** If a long first phase is too timid or too brisk, change the closure cap for long legs (`TRACKER.closureCap`, `CLOSURE.farGain`) with the number's source beside it; do not add a second law.
5. **Then decide on the optimiser** with the lines gone and the flight set in hand. If the tracker's paths look right and quick enough to you, stop there. If you want the modes and the per-rule prices on the card, or time and energy trimmed from odd starts, start route 1 phase A (`optimiser-plan.md`).

## 6. Suggestions beside the main point

- Keep `fset.mjs` and its baseline as the permanent before/after tool; add the hand-over bump (max bank change and power change in the second around 500 ft) as a column so the gain shows in numbers.
- When `kinematic-moves.js` goes, its `crossBehindFwd` (how far behind Lead a crossing passes, 0.9 × range, at least the bubble) should move to the cone table beside the bubble, with its source (SMM 12.29 para 69 is cited there).
- The three smoothing passes are the one thing nobody will miss; if any other planner still smooths after the fact, treat it as the same smell.
- Fluid manoeuvring and the lag roll keep their 3D path generators; they are not "lines" in this sense (they plan lift and G from the path and go through the gate), and they are out of scope here.

## 7. Unsure

- Whether `straight-rejoin.js` covers every start the line's straight-ahead shape covered (from cone position to astern, for instance); the flight set will show it.
- How many of the line's wins in the chooser race today are real (quicker and passing) versus the line being the only passing candidate for an odd start; the chooser's `how` note on each flight set move tells you.
- Shape changes are estimates; nothing was flown.
