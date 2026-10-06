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

## 8. How big, how easy, what effect (Patrick's question 23:07Z)

**Size: medium-small, mostly deletion.** About 1,000 lines go with no new code: `kinematic-moves.js` (285), `line-moves.js` (160), the run-in law, `lineRunIn` and the line branch of the tail re-plan in `hand-over.js` (~150), and the path, time-law and power-law halves of `kinematic.js` (~300 of 591; the pose and track helpers stay for fluid and the lag roll). One entry leaves the chooser's candidate list.

**The one real piece of work (50-100 lines):** confirming each move the line covered has a tracker recipe that reaches the 500 ft point at the rejoin closure. The recipes exist (`legsFor`, `straightAhead`, `dropBack`, `sweepOut`, `openOut`, `cornerBehind`) and `onClosure` already gives a long leg the rejoin closure; this is wiring and checking. Where a dedicated planner already wins the race nothing changes.

**Difficulty: low.** The 4-ship did exactly this (V2.97-V2.100) and 2-ship mid-move re-plans have never used lines. The risk is tuning the tracker's long-leg behaviour (closure cap far out, bank cap), one or two numbers with sources.

**Effort:** one Opus agent, two to four pull requests grouped by move, one end-picture test each, flight set before and after; one to two weeks of thread time, less without dry runs.

**Effect on screen:** same end pictures; no bump at 500 ft; power planned with geometry each step (no STRETCHED from an unflyable shape); slight shape shifts possible on the crossing behind Lead and the opening out, times moving a few seconds either way; press times unchanged or slightly faster. **Effect on code:** one way to fly a 2-ship move, as the 4-ship; duplicated lane, bubble and closure copies gone; the hand-over is a phase change readable in one place. **What it does not do:** make any move faster or more efficient by itself; that is the optimiser's job if ever wanted.

## 9. Is tracker-only better than the lines in every way? (Patrick's question 23:17Z)

Tracker-only now, optimiser later, is the order both optimiser plans assume; step 5 needs nothing from the optimiser. In every way that matters the tracker is better, with three honest exceptions: (1) **shape control**: a line draws an exact geometric arc; the tracker gets to an aim by its law, so the arc between aims is the law's. For the manual's corner-and-stop shapes the recipes put aims at the corners and that is enough; a sweeping arc wanted for its own sake needs an extra aim or two. The lag roll and fluid keep their own 3D path generators. (2) **Sketchability**: a line's path is known from its waypoints; the tracker's only after the dry run. No difference on screen (both are planned at the press), but a line is easier to draw on paper in a design talk. (3) **Far-out tuning is new to the 2-ship**: the tracker's long-leg closure law has flown the 4-ship's long legs but not been the 2-ship's main planner for these moves since 5 Oct; expect one tuning pass on the closure cap far out and the bank cap, with sources beside the numbers. Everything else favours the tracker: power planned with geometry every step, no seam at 500 ft, one controller for both ships, one copy of each rule, no smoothing passes, no STRETCHED from an unflyable shape, the 4-ship's G-onset fix on the 2-ship.

## 10. How the tracker works (Patrick's question 23:18Z)

A planned pilot: at the press it flies #2 forward through the same flight step Lead uses, 0.05 s at a time, making a wingman's decisions each moment, and records them; replay plays the record. Each step: (1) **where am I supposed to be**: the current phase's aim point in the frame of the aircraft he flies off (fore/aft, left, height), moving with him and his turn; a move is a short list of phases (slide, stop at a corner, close through route, rejoin to, open out, sweep out); the aim may be a region (the whole cone). (2) **How fast to close**: a closure law from range, the Rates rejoin closure far out (15/25/50 kt), easing to the close-in rate inside about 500 ft, dying to zero only on the slot ("controlled, not stopped"); sideways and vertical rates have their own caps. (3) **Which way to point**: a heading loop with feed-forward for the reference's turn, asking the bank for that heading rate; the envelope gate clips roll rate, G onset and stall bank. (4) **What power**: a speed loop turning the wanted closure into an acceleration limited to what full power or idle and boards give at this speed, height and G, the climb paid from the same energy; the power profile sets it as Patrick does (a lot briefly to set the rate, the amount that holds it, back early to stop on the slot); height is energy in the cone (zoom to soak speed, dive to buy it) before the lever. (5) **Am I in**: the judge's band and steadiness (5 ft and 5 kt close; the whole cone for cone position). The lane, bubble and G rule ride along. Closed-loop, so one recipe works from any start and a mid-move press restarts it from where he is. Lines drew the path and read controls off it afterwards; the tracker decides the controls and the path follows.

## 11. Is the tracker designed properly? (Patrick's question 23:18Z)

**Design right, build accreted, two real gaps.** Right: closed-loop pilot in the reference frame, planned and replayed; closure law from range with the Rates closures; heading loop with feed-forward through the one gate; power through the real thrust and drag curves with climb cost and cone energy; phases as data. **Gap 1, speed is written not flown:** `tracker.js setKias` sets airspeed each step from the tracker's own acceleration rather than commanding power and letting the step integrate speed from thrust, drag, G and climb; energy is not conserved by construction and every planner borrowing the speed code borrows the shortcut (fix: route 1 plan section 5 item 4; changes flying slightly; Patrick's yes). **Gap 2, height is scripted not controlled:** the vertical is a smootherstep profile fitted on a second pass (`trackTwice`), not a loop like heading; a height loop (aim height, climb-rate command inside G and energy limits) makes it one pass and lets height react to Lead. **Accretion:** `runTracker` ~230 lines with a dozen mode flags (rejoin leg, energy, zoom, aligning, hold line, plane ease) in one loop, to be split into the five jobs above; gains are unsourced estimates (position 0.3/s, speed loop 0.8/s, feed-forward filter 0.2) with old names (`kcap`, `vrel0`); the phase object's overrides have grown wide and some recipe defaults fight rulings (4-ship bank caps vs no-bank-cap). **Verdict:** keep it; do the split (no flying change), then the height loop, then physics-owned speed, each with the flight set before and after, as part of or right after the tracker-only step, because every move will then go through it. Offered: write this as the tracker design note for the step 5 brief.

## 12. Is the tracker the same as the two-ship manoeuvring module's pilot? (Patrick's question 23:19Z)

Same family, not the same thing; the two-ship module's code was outside the review package, so this is from the project's own notes (the 5 Oct chooser review), not its code. Same: both are step controllers on the shared flight step and core T-6A curves, deciding bank, G and power each step from the other aircraft's position, under the same envelope limits. Different: the tracker decides at the press and replays (plan-at-press); the two-ship pilot decides live each frame with a short look-ahead over a few candidate moves (report section 1.2 option C with some B), which the formation sim does not use because it needs the drawn path ahead and exact replay. The tracker aims at a place in the leader's frame and a closure and stops on a slot or band; the two-ship pilot re-chooses its aim geometry each step and never stops. The 5 Oct chooser review's answer stands: far out a held technique chosen by search, close in a controller every step, the live pilot only for a stick-flown Lead or errors mid-move. The two could share the aim-closure-heading-power loop in `src/core/` later, through the coordinator; not part of the tracker-only step. A real comparison needs the two-ship module's files packaged as the formation engine was.

## 13. Implementation brief: full tracker on the 2-ship (for Antigravity)

Everything above is already in this paper (sections 8-12 hold the size, the "better in every way" exceptions, how the tracker works, the design assessment and the two-ship module comparison). This section turns it into a build brief. Names below are the review copy's; on the real code read cone position as fighting wing, pointing as pursuit, lead point / nose on / lag point as lead / pure / lag pursuit, follow as chase, spread as tactical, alpha as angle of attack. Nothing here is built; sizes are estimates.

### 13.1 Read first
`AGENTS.md`; `docs/PLAN.md`; `docs/modules/turn-sim/` (README, spec sections 3, 6, 8, 12; decisions TS-61, 65, 75, 76, 78, 80, 93, 96, 108, 110, 111, 124, 126-128, 133, 136, 139, 140; testing); this paper; `report.md` sections 1, 4 and 6.4 C; `optimiser-plan.md` sections 10-11 (lessons, tracker-only). The flight set script and its baseline (`/mnt/project-files/turn-sim-review/fset.mjs`, `fset-base.txt`) must be copied into the repo for Antigravity, since it cannot read project files.

### 13.2 Order of work (one pull request each, one writer, one end-picture test each)

| PR | Task | Files it may touch | Flying change |
|---|---|---|---|
| 1 | **Split `runTracker`** into the five jobs: `aimOf(phase, ref)`, `closureOf(range, phase, rates)`, `headingBank(aim, ref, wing)`, `powerOf(closure, wing, profile)`, `isIn(judge)`; mode flags become fields on the phase, read in one place. Pure extraction. | `tracker.js` | None (flight set identical) |
| 2 | **Lines out, part 1: opening out to line abreast** on tracker phases (`openOut` recipe at the rejoin closure to 500 ft, then close-in). Remove `planLineChange`'s route for it. | `line-moves.js`, `chooser.js`, `transitions.js` (legsFor) | Shape may shift slightly; times within a few seconds |
| 3 | **Lines out, part 2: cone position across behind Lead, and close formation out to cone position** (`cornerBehind`, `dropBack`/`sweepOut`); `crossBehindFwd` moves to the cone table with its source. | `line-moves.js`, `kinematic-moves.js`, `slots.js`, `transitions.js` | As above |
| 4 | **Lines out, part 3: cone position to echelon/route/astern and the straight-ahead rejoin from line abreast**, through `straight-rejoin.js`'s law or `straightAhead` phases; delete `line-moves.js`, `kinematic-moves.js`, `lineRunIn`/`runInLaw`/line branches in `hand-over.js`, the path/time/power halves of `kinematic.js`; keep pose and track helpers. | those files, `chooser.js`, `hand-over.js` | As above; the "line, then tracker" candidate is gone |
| 5 | **Height loop.** Replace `trackTwice`'s second pass with a height command inside the law: aim height from the phase (cone energy decides it), climb-rate command limited by G (TURNING_REJOIN.heightG, TS-140) and the energy budget, one pass. | `tracker.js`, `transitions.js` (phase fields) | Yes, small; wait for Patrick's yes on the spec wording |
| 6 | **Physics-owned speed.** Replace `setKias` with a throttle/boards command integrated by the step through `slow-down.js` / `power.js`; one jerk limit; power-stage hysteresis (dwell about 2 s, estimate). All planners that call `setKias` (9 callers) move to the same call. | `tracker.js`, `flight.js` (a speed state), `slow-down.js`, `power.js`, the callers | Yes; the biggest change; Patrick's yes first |
| 7 | **Numbers and names.** Source or label every tracker gain (position 0.3/s, speed loop 0.8/s, feed-forward 0.2, closure caps); rename `kcap`, `vrel0`, `W`, `L`, `ph`; regenerate `numbers.md`. | `moves.js`, `tracker.js`, `tools/turn-sim-numbers.mjs` | None |

PRs 1-4 are the tracker-only step (report.md step 5) and change no manual shape. PRs 5-7 are the design fixes from section 11; 5 and 6 wait for Patrick's yes because they change the flying.

### 13.3 Rules that bind every PR
- Read `AGENTS.md` and the module folder first; search for existing flight math before writing new (`docs/modules/shared/`, `src/core/`).
- Tests check what a pilot would recognise; no tight time gates; expected values from a manual page, standard aerodynamics, Patrick's ruling or recorded data, never V6 or the code's own output; shared margins ±10 kt, ±100 ft, ±5°, ±0.5 G; never change the flight physics to make a test pass; published limits are flagged, never walls; never skip or delete a failing test; keep it light; one test per PR; no local test runs before a PR, CI is the check; every status says what is untested or unseen.
- Model: Opus for all of these (flight code and maths); effort high for PRs 5 and 6, medium otherwise.
- Flight set before and after on every PR; identical for PRs 1 and 7; within the shared margins and not slower for 2-6.
- One writer per file; stop and find the cause after two failed fixes; a judgement call that changes the flying waits for Patrick's yes.
- Version label bumps with every merge; merge title "Formation V2.xxx Formation: <plain words>"; tag.

### 13.4 Acceptance, in Patrick's words
From the default start, with Polish off: every 2-ship button lands the wingman where the manual's picture puts him; no visible bump as he passes about 500 ft; the power word on the tag changes at a pilot's pace; no STRETCHED on a standard move; a press mid-move re-plans from where he is; the 4-ship sequence is unchanged.

### 13.5 Open for Patrick before PR 5-6
- Yes or no to tracker-only (PRs 1-4).
- Spec wording for the height loop and for physics-owned speed (TS rows to confirm).
- Whether the tracker gains are "tuning numbers by Patrick's ruling" or need a source each.
- The 4-ship's own bank caps (45°, 75°) after the no-bank-cap rulings.
