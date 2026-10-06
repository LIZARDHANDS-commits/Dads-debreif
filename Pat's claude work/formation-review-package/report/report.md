# Formation trainer engine: review before the refactor

Reviewed 6 Oct 2026 on the renamed copy (main 768c568, V2.154). Read only: nothing was run, edited or built. Line numbers are the copy's; names are the copy's rename map (cone position = fighting wing, pointing = pursuit, and so on). Every "cost" below is a judgement, not a measurement.

## 1. The answer first

**Recommendation: keep plan-at-press, and converge on one pilot model, with a small look-ahead search left only for the few real choices.** Today the engine has four different ways of flying a follower and reconciles them with hand-overs, re-plans and copied rules. Most of the duplicated numbers, the dead code, the 7-deep search and the 1-15 s button presses come from that one fact. Making the tracker's closed-loop "pilot" the only thing that flies a follower, and reducing the planners to "which aim, which energy plan", removes most of the findings in section 3 at one stroke. The cost is a few large steps over several threads, each proved by re-flying the same set of moves before and after. What is lost is some hand-tuned behaviour in two places (echelon to cone position in about 10 s, opening out at full power) that would have to be re-earned as tracker recipes and re-flown for Patrick.

### 1.1 How a follower is flown today, in plain words

Every move is planned at the button press and then replayed. The planner runs a dry run through the same step function the live aircraft use (`flight.js` `stepAircraft`, 0.05 s steps) and records what the follower did each step, as bank/speed/power (`bankTrack`) or as full poses (`poseTrack`). Replay (`transitions.js` `flyStep`, line 61) just reads that record back. That is why the dashed path drawn is the path flown (spec F1) and why the sim is deterministic.

Who decides what, from the press inward:

1. **The chooser** (`chooser.js`) races every planner that applies to the from-to pair (technique planners, the tracker fallback, a "from here" re-plan) and scores them: passes the band and the overshoot lane first, technique before plain tracker on long moves, then inside the G rule, then quickest within 0.5 s (`TIE_SEC`, line 41), then smoothest (`compareCandidates`, line 135). Nothing is ever refused; the best of a bad set is flown.
2. **The planners** each fly the follower a different way:
   - **Tracker phases** (`tracker.js` `runTracker`, line 120): a closed-loop pilot. Each phase is an aim point in the reference aircraft's frame (fore/aft, left, height), with a closure law (`closureCap`, line 62), a heading loop with feed-forward, a speed loop with jerk limit, a power profile, and cone energy (height as speed, a zoom to the cone's top). Phases are built from recipes in `transitions.js` (slide, stopAt, closeThrough, rejoinTo, openOut, sweepOut, dropBack, straightAhead; lines 178-224) and the per-formation leg table `legsFor` (line 226). `trackTwice` (line 414) runs it twice: once for the times, once with a smooth height profile.
   - **Lines then tracker** (`hand-over.js` `lineRunIn`, line 124; `kinematic.js`, `kinematic-moves.js`, `line-moves.js`): a geometric line in the reference frame is drawn through waypoints, poses are read off it, power is back-solved, and at 500 ft from the slot (`HAND_OVER_FT`, `rates.js:210`) the tracker takes over.
   - **Held-command planners** (`turning-rejoin.js`, `straight-rejoin.js`, `echelon-to-fw.js`, `open-out.js`): the follower is flown as a pilot holds controls, bank, speed target and power stage, through the same step, with small searches over the held values; the tracker takes the last stretch and the settle.
   - **Point-mass 3D paths** (`rolling-rejoin.js`, `lag-roll.js`, fluid manoeuvring in `fluid*.js`, `full-power.js`): a path through the air is drawn, then lift, G and pose follow from its acceleration. The rolling rejoin tries 72 roll shapes this way and then confirms up to 6 with a full turning-rejoin search.
3. **The turning rejoin** is the deepest: `flyToDecision` (line 77) flies the line law to a decision; `flyOnTheX` (line 275) closes the last stretch on the X with the 250-100 ft, 10-20 KIAS window; `flyWith` (line 493) adds the height and dive search, the Lead-holds-turn rule and the wing-plane ease; `searchTurningRejoin` (line 654) loops over seven axes and breaks on the first that passes; `planTurningRejoin` (line 712) packs it as a candidate.
4. **Events** (`events.js`): a press mid-move re-plans from here; a turn pressed mid-change is flown at once (`turnMidChange`, line 93); the decision-point and picture-break re-plans of TS-81 are still wired in but no longer fire (section 3, finding 6).
5. **The envelope** holds everywhere in one place (`flight.js` `gateRoll`, lines 56-74: T-6A roll rate, G onset, stall bank), which is right and should stay.

So there is no one answer to "who flies the follower": it depends on which planner won, and inside one move it can be a line, then a held-command planner, then the tracker.

### 1.2 The four ways forward, weighed

| Way | What it is | Cost to get there | What it buys | What it loses or risks |
|---|---|---|---|---|
| **A. One pilot model** every move uses | A single closed-loop law: aim at a place in the leader's frame (including height), geometry first, energy as height first and power last, every step inside the envelope. Planners only choose the aim sequence and energy plan. The tracker is 80% of this already. | Medium-high: fold the line run-in, both `flyToDecision`s, echelon-to-fw and open-out into tracker recipes; the rolling rejoin and lag roll stay as path generators feeding the same law. 4-6 large PRs. | One place for every rule (bubble, lane, cone energy, speed floors, Rates). One speed, one G, one power model. Searches shrink to a handful of aims. Button presses fall from seconds to well under a second. Much less code. | Some tuned shapes change (the 10 s echelon to cone, the full-power open-out, the exact X-law window). Each must be re-flown and signed off by Patrick. A single law that is wrong is wrong everywhere. |
| **B. Look-ahead search over held techniques** (today) | Keep planners as written technique shapes, search over their knobs, pick with the chooser. | Low to stay; medium to clean (dedupe rules, prune axes). | Shapes match the manual pictures closely; each technique is readable as a pilot's recipe. | Rules keep living in several places; each new ruling is patched into 3-5 files; search time grows with every new axis; 7-deep loops stay. |
| **C. Live guidance law each step** (no plan at press) | Fly the follower live from state each frame, no recorded track. | Medium: the tracker almost is this, but drawing the path ahead and determinism across frame rates (spec F1, FM5) would need re-architecting. | No planning delay at all; re-plans are free. | Loses "path drawn is path flown" and the 0.001 ft replay determinism, which the sign-off and the 4-ship joins rely on. Not recommended on its own. |
| **D. A mix** (recommended) | A as the law; a short look-ahead search (3-10 candidates, coarse step) only where a real choice exists: which side and cut for a turning rejoin, roll or plain, how much dive or zoom; plan-at-press kept as the mechanism. | As A, plus keeping the chooser. | Keeps the readable technique names and the chooser's "best of a bad set" rule, which Patrick has approved, with one physics and one rule set underneath. | The search must be capped (coarse step, fewer axes) or press times come back. |

**Why D and not B:** the findings below are not isolated. The bubble, lane, in-band, speed floor and climb-cost rules each exist in 3-7 places because each planner re-implements the pilot. Deduping them while keeping four planners buys little; the next ruling re-splits them.

**Why keep plan-at-press:** the spec and tests lean on replay (F1, FM5), the 4-ship joins legs on the exact planned step, and a planner can still be a live law run forward in a dry run. The law and the mechanism are separate choices.

## 2. Ranked findings

Rank is by payoff for the refactor. "Cost" is effort to fix; "buys" is what it gives; "risks" is what could go wrong on screen.

| # | Finding | Where (file:line) | Cost | Buys | Risks |
|---|---|---|---|---|---|
| 1 | **Four ways to fly a follower** (section 1.1), each with its own closure, speed, power and energy handling. Root cause of most rows below. | `tracker.js:120`; `hand-over.js:124`; `turning-rejoin.js:77,275,493`; `straight-rejoin.js:45,146`; `echelon-to-fw.js`; `open-out.js:52`; `rolling-rejoin.js`; `lag-roll.js`; `full-power.js:248` | High | One law, one rule set, fast presses, far less code | Tuned shapes change; needs the before/after flight set (section 4) |
| 2 | **The cone's band is written in six places** with four different widths: 500-1,000 ft / 30-60° (slot table), 450-1,250 / 25-65 (limits), 400-1,300 / 20-70 (classifier and lag roll), 500/1,000 as bubble min/max. | `slots.js:95` FW_BAND; `slots.js:100` FW_LIMITS; `judge.js:53-58` regions; `moves.js:229` FW_BUBBLE minFt/maxFt; `moves.js:75` verticalUpFt; LAG_ROLL coneRangeFt/coneSweepDeg (`moves.js`, LAG_ROLL block); `fluid.js:44,399` FLUID.bubbleFt | Low | One cone table with band, margin, bubble; the judge and planners read it | A planner that relied on the wider classifier band may re-plan differently at the edges |
| 3 | **Overshoot lane and height-under-Lead ranges copied**: the 100 ft lane margin three times; the 1,000 / 2,000 ft measuring ranges once as named numbers and twice hard-coded. | `chooser.js:39`, `replan.js:25`, `transitions.js:49` LANE_MARGIN_FT; `moves.js:313-314` laneRangeFt/belowRangeFt; `kinematic-moves.js:231-232` and `rolling-rejoin.js:104` hard-coded | Low | One lane rule | None if values kept |
| 4 | **The 3/9 "never ahead" check and the whole `flyToDecision` law are duplicated** between the turning and straight rejoins (about 170 lines each, same structure: line law, climb cost, stall bank, stop fit). | `turning-rejoin.js:77-250` vs `straight-rejoin.js:45-143`; the 3/9 check at `turning-rejoin.js:245-246`, `:372-373`, `straight-rejoin.js:137-140` | Medium | One rejoin law with a "Lead turning or not" flag; one place for TS-75/TS-133 speed floors and targets | Subtle differences between the two copies (the straight one's cut angles) must be listed before merging |
| 5 | **Shared maths re-derived instead of taken from `src/core/`**: climb cost (g·climb/TAS·KIAS/KTAS) in 6 copies; level-turn radius/rate from bank in 5 copies while `core/flight-math.js:64,69` has them; stall bank acos(1/G) in 4 copies; `DEG = Math.PI/180` in 11 files while `core/angles.js:16` has `degToRad`; a second knots-to-ft/s constant (1.6878 vs core 1.68781). | climb cost: `tracker.js:94`, `full-power.js:44`, `echelon-to-fw.js:141`, `open-out.js:83`, `straight-rejoin.js:101`, `kinematic.js:564`; turn radius: `formation-turns.js:63`, `fw-pointing.js:38`, `fw-switch.js:56`, `echelon-to-fw.js:150`, `fluid-lead.js:343`; stall bank: `flight.js:58,74`, `turning-rejoin.js:59,66`; `kinematic-moves.js:204` KT_FTPS | Low | Rule book item 8 (one formula); fewer places for a sign error | The 1.6878 vs 1.68781 change moves the kinematic lines by about 0.01%; flag it as a known change |
| 6 | **Dead or unreachable code**: the decision-point re-plan branch (both 2-ship rejoins now set `decisionSec: null`, TS-112) and the picture-break trigger (never fires, said in the comment); `RULED_REJOIN` is a table of nulls; `planGoTo` still loops over `REJOIN.turnAnglesDeg` as a fallback; FW_TURN.gentleBankDeg "no longer flown"; REJOIN hot/cold bearings only feed a word. | `events.js:43` decision branch; `turning-rejoin.js:773`, `rolling-rejoin.js:227` decisionSec null; spec section 12 still describes both; `moves.js:163` RULED_REJOIN; `transitions.js:366-396` planGoTo fallback and `turnAnglesDeg` loop (`moves.js:38`); `moves.js:169`; `moves.js:36` with `judge.js:441` | Low | Less to read; spec section 12 and TS-81 can be marked superseded | Confirm nothing in the 4-ship reads `decisionSec` before deleting (grep says no) |
| 7 | **The turning rejoin search is seven loops deep**, each leaf flying up to 3,600 steps (180 s / 0.05 s), then a height search ×2, then `flyWith` re-flies with a dive search and two or three tracker runs of up to 6,000 steps. This is the main driver of the 1-15 s press (section 3.5). | `searchTurningRejoin` `turning-rejoin.js:654-704`; `CHANGE_LIMIT_SEC` `transitions.js:51`; `PLAN_MAX_SEC` `tracker.js:19`; `trackTwice` `tracker.js:414` | Medium | Presses under a second with a coarse-then-fine search; readable search axes | A coarser search can pick a slightly different candidate; prove with the flight set |
| 8 | **The rolling rejoin multiplies that**: 72 point-mass rolls, then up to 6 full turning-rejoin searches. | `rolling-rejoin.js:57-65` candidates; `fullSearches: 6` in ROLL (`rates.js`) | Low-medium | The 15 s presses drop to a few seconds without changing which roll wins (rank first on the point-mass result, confirm the top 1-2) | The confirmed roll could differ from today's in rare ties |
| 9 | **Files doing two or more jobs**: `transitions.js` holds the replay step, the dry run, speed segments, the leg recipes, the per-formation leg table and a whole planner (`planGoTo`); `formation.js` is the session, the event wiring, the press handlers and the readouts; `hand-over.js` holds the hand-over point, the line run-in, Lead's turn-in and the tail re-plan; `tracker.js` holds the law and the phase/recipe defaults. | `transitions.js:61,102,119,132,178-224,226,330`; `formation.js:97-640`; `hand-over.js:108,124,229,250,269` | Medium (moves only) | Readable to a non-developer (rule book, Building) | None if pure moves, but every import path changes at once; do it in one PR |
| 10 | **Long functions**: `runTracker` ~230 lines, `flyToDecision` ~170, `flyWith` ~120, `createFormation` ~540 with nested closures, `lineRunIn` ~100, `planCloseTurn` in `formation-turns.js`. | `tracker.js:120-350`; `turning-rejoin.js:77-250, 493-615`; `formation.js:97-640`; `hand-over.js:124-228` | Medium | Each law readable on one screen | Behaviour must stay bit-identical; pure extraction only |
| 11 | **Numbers without a source outside the register**: the register (`numbers.md`) covers only `rates.js`, `bands.js`, `moves.js`. The 4-ship files and the judge carry their own constants with no source or "estimate" beside many of them. | `judge.js:32` BOX_SLOT_MARGIN_FT 500 and `:53-58` regions; `four-close.js:24-37` CROSS_LOW_FT 15, FOUR_LOWER_FT 10, LINE_LEAD_SEC 1, LINE_DOWN_SEC 4, TRIPLE_ACROSS_SHARE 0.5, MAKE_ROOM; `four-close.js:303` DROP_FAST 50 kt, 40 KIAS; `four-rejoin.js:30-55` FAR_OVERTAKE_KIAS 25, MAX_CLOSURE 80 kt, TRJ windows, FW_PASS_FT 300, VERTICAL_MIN_G 0.5; `four-open.js:21,157` THREE_WAITS_SEC 10, bankCap 75; `four-legs.js:34` GENTLE_ALT_FTPS 15; `move-in-band.js:94` MOVE_ALT_RATE 2,000 ft/min | Low | Rule book item 9; the register tool can read more files | None |
| 12 | **The same height rate shared by reference across three unrelated rules**: tracker max height rate, turning-rejoin descent and cone-energy climb are one object, so changing one changes all; the band move has its own separate rate. | `moves.js` TRACKER.height.maxRateFtps = TURNING_REJOIN.descentFtps = FW_ENERGY.climbFtps (30 ft/s); `move-in-band.js:94` | Low | Each rule owns its number with its source | A ruling meant for one of them has silently applied to all three; check with Patrick which he meant |
| 13 | **Side-selection boilerplate** (`sTo = to === 'astern' ? 0 : want === 'left' ? 1 : ...`) in seven files. | `chooser.js`, `replan.js`, `straight-rejoin.js`, `rolling-rejoin.js`, `turning-rejoin.js`, `transitions.js`, `line-moves.js` | Low | One `sideFor(to, want, s)` | None |
| 14 | **Names that don't say what they are**: `flyWith` (two different functions in two files), `partOver`, `trackTwice`, `fly2`, `kcap`, `vrel0`, `c`, `W`, `L`, `how`, `over`, `rec`, `s`/`sTo`, `quick`, `hard`. | `turning-rejoin.js:493`, `straight-rejoin.js:146`, `transitions.js:444`, `moves.js:193,249`, `four-legs.js:202` | Low | Readable to Patrick | None |
| 15 | **Stale comments**: roll "90°/s" (now 180); `hot-rejoin.js` named as a sharer (retired); tracker header says recipes live in `transitions.js` (half true); spec section 12 describes two events that cannot fire. | `transitions.js:4`; `hand-over.js:12`; `tracker.js:7-8`; `docs/trainer/spec.md` section 12 | Low | Trust in the comments | None |
| 16 | **The judge keeps a second, wider band table of its own** rather than the slot table plus a margin, so "in position" (TS-80) and "nearest formation" can disagree at the edges. | `judge.js:53-58` vs `slots.js:95,100` | Low | One band plus one margin | Classification at the edges could flip; check with the flight set |

## 3. Middle and small detail

### 3.1 Rules that live in more than one place

| Rule | Copies |
|---|---|
| In position / cone band | `slots.js:95` FW_BAND; `slots.js:100` FW_LIMITS; `judge.js:53-58`; `moves.js:229` FW_BUBBLE; `moves.js:75` verticalUpFt; LAG_ROLL cone numbers; `fluid.js:44` |
| 500 ft bubble | `moves.js:229` minFt; `rates.js:210` HAND_OVER_FT (same number, different meaning, same value by coincidence); `fluid.js:399`; `lag-roll.js:16` (comment and check); `rolling-rejoin.js:70`; `move-in-band.js:117` DIVE_ROLL.minFt; `fw-pointing.js:105-107` |
| Cone energy and zoom | `tracker.js:312-335` (law); `open-out.js:126-128` (its own height-as-speed); `turning-rejoin.js` lag-the-cut zoom (`zoomLegOf`, line 252); `echelon-to-fw.js` dive to cone height; `formation-turns.js` fwGoal/fwExit; `fw-pointing.js` bubble predict |
| Speed floors and targets (200 min, 210/220/235 line) | `rates.js:99` REJOIN_LINE_KIAS; `moves.js:23` KIAS_OUTSIDE_LAB; `moves.js:57,76-77` TURNING_REJOIN hot/undertake/lineOver; `straight-rejoin.js` own floors; `four-rejoin.js:30` FAR_OVERTAKE_KIAS; `four-open.js:157` |
| 3/9 lane | finding 3 and 4 above |
| Rates (closure, close-in) | `rates.js` is the one home (good); but `four-close.js:303` DROP_FAST and `four-rejoin.js:36` MAX_CLOSURE_FTPS set their own closures beside it |
| Climb cost, turn radius, stall bank, DEG, kt to ft/s | finding 5 |
| Height rate | finding 12 |

### 3.2 Dead or near-dead code

Finding 6, plus: `hand-over.js` `lineRunIn` smoothing runs three passes where one would do (comment says so); `transitions.js:350-356` option override logic keyed on equality with `REJOIN.overtakeKias`, fragile and probably unreachable from the chooser.

### 3.3 Files doing two jobs

Finding 9. Suggested split: `transitions.js` into `replay.js` (flyStep, dryRunT, recordFlight), `recipes.js` (phase recipes, legsFor), and delete `planGoTo` once the fallback loop is confirmed unused by the chooser; `formation.js` into `session.js`, `presses.js`, `readouts.js`; `hand-over.js` into `hand-over.js` (point and rule) and `lead-turn-in.js`.

### 3.4 Rulings against the code (sample, not exhaustive)

| Ruling | Code | Verdict |
|---|---|---|
| TS-75 200 KIAS floor; TS-133 210/220/235 targets | `rates.js:99`; TURNING_REJOIN hot/lineOver | Built as written; the floor and target logic is split between two files and both rejoins (finding 4) |
| TS-81 decision-point and picture-break re-plans | `events.js:43`; spec section 12 | Decision point unreachable for both 2-ship rejoins since TS-112/TS-137; picture break never fires; spec still lists both. Mark superseded or delete |
| TS-112 Lead holds turn until #2 in | `hand-over.js:229` leadTurnInto; `replan.js:166`; `four-rejoin.js:147` | Built; three callers, one function (good) |
| TS-93 one envelope gate | `flight.js:56-74` | Holds; every planner steps through it. The point-mass paths (lag roll, rolling rejoin, fluid) check G against `availableG` themselves rather than through `gateRoll`, so "one gate" is one gate for bank/G onset but two for G against stall |
| TS-107/108 no bank cap in formation | `rates.js` NO_BANK_CAP_DEG; `four-rejoin.js:181,192` bankCapDeg 45; `four-open.js:157` bankCapDeg 75 | 4-ship legs still carry their own caps; either they are intended (Patrick's "stepped down" joins) or they are left over from before 6 Oct. Ask |
| TS-96 cone energy, TS-136 zoom | `tracker.js:312-335` | Built in the tracker; `open-out.js:128` re-implements height-as-speed on its own |
| Torque floor 5% | not found as a named 0.05 throttle floor; `floorThr` passed as 0 in `powerOf` default (`tracker.js:82`) | Unsure where the 5% lives; it may be inside `slow-down.js` `POWER_FLOOR_THROTTLE = 0` (line 42) which says zero. Check against the ruling |
| TS-80 in position is the band | `judge.js:53-58` wider regions | See finding 16 |

### 3.5 Why a press takes 1-15 s, and what drives it

Rough count for a 2-ship turning rejoin from 4,000 ft (unmeasured; from the loop shapes):

- One `flyToDecision` flight: up to 3,600 steps (180 s limit at 0.05 s), each step a full `stepAircraft` plus the recorded Lead lookup.
- `searchTurningRejoin`: passes 4 × overshoot 2 × low-floor 2 × overtakes (2-3) × caps (about 2) × tries (3 aims + 2 hard pulls) × bank caps (about 2) = up to about 1,000 leaf flights before the break on first pass; typically far fewer because the first pass level passes, but a cold or across start walks deeper.
- Then height tries [500, 1000] × 2, `flyWith`'s dive search × 2, each ending in `trackTwice` (two tracker runs up to 6,000 steps) plus one more `runTracker` for the wing-plane ease.
- Rolling rejoin: 72 point-mass rolls (cheap) then up to 6 full searches (6 × the above). That is the 15 s.
- Line moves: `lineRunIn` smooths three times and re-flies the hand-over.

What would cut it most, in order: (1) rank rolls on the point-mass result and confirm only the top one or two; (2) search at 0.2 s step and confirm the winner at 0.05 s; (3) stop a leaf flight the moment it breaks the lane or band rather than flying to the 180 s limit; (4) reduce the search axes to those a pilot actually chooses (side, cut, dive/zoom); (5) memoise Lead's recorded flight per press (partly done).

### 3.6 Small items

- Deep loops: `searchTurningRejoin` (7), `straight-rejoin.js:210-218` (3), `rolling-rejoin.js:57-65` (4), `move-in-band.js:221-231` tries.
- `tracker.js:371-372` and `kinematic-moves.js:231-232` are the same two lines with different constants (finding 3).
- `four-ship.js:46` and `four-legs.js:36` both define NAMES.
- `manoeuvres.js:40` exports DEG; ten other files define their own (finding 5).

## 4. Proposed refactor, in large steps

Before step 1, fix the **flight set**: the moves below, flown from the default start on the renamed copy and recorded as end state (fore/aft, left, height in Lead's frame), time to in band, max G, max G onset, closest approach and lowest speed. The rename copy already matched the real code to 0.001 ft, so the same comparison works here.

Flight set (2-ship: each Rates choice; 4-ship: default): route to echelon; echelon to cone position; cone position to line abreast; line abreast to cone position; turning rejoin hot, cold and abeam from 4,000 ft to echelon and to cone position, both sides; straight rejoin from 3,000 ft; TRJ + roll; lag roll; cone-position turn tight and wide, both ways; the 4-ship sequence (finger, echelon, box, trail, Spread 4, Fluid 4, offset box, TRJ to finger).

| Step | What changes | Prove before / after |
|---|---|---|
| 1. Numbers and helpers | One cone table (band, margin, bubble); one lane rule; climb cost, turn radius, stall bank, DEG and kt-to-ft/s from one place (core where it exists). Pure moves, no logic change except the 1.68781 constant. Extend the register tool to every file in `live/`. | Flight set identical to 0.01 ft (the constant change is the only expected drift) |
| 2. Dead code and docs | Delete the decision-point and picture-break events, RULED_REJOIN, `planGoTo`'s fallback loop, unused FW_TURN and REJOIN fields; mark TS-81 superseded; fix stale comments and spec section 12. | Flight set identical |
| 3. File splits and names | Split `transitions.js`, `formation.js`, `hand-over.js` (section 3.3); rename the two `flyWith`s and the one-letter arguments. | Flight set identical |
| 4. One rejoin law | Merge the two `flyToDecision`s and the 3/9 check; search coarse (0.2 s) then confirm fine; rank rolls on point-mass first. | Flight set: end states within the shared margins (±10 kt, ±100 ft, ±5°, ±0.5 G); times within a generous 20%; press time measured and reported |
| 5. One pilot model | Fold the line run-in, echelon-to-cone and open-out into tracker recipes with the power profile; retire `kinematic.js`, `kinematic-moves.js`, `line-moves.js`, `lineRunIn`. | Flight set within shared margins; the 10 s echelon-to-cone and the full-power open-out re-flown by Patrick before merge |
| 6. Judge on the one table | Judge reads the cone table plus one margin. | Flight set identical in which formation each end state is called |

Each step is one pull request, one writer, with at most one new test (the end-picture kind). Steps 1-3 change no flying and can go fast; 4-6 change flying and wait for Patrick's look at the screen.

## 5. What I did not look at, and what I was unsure of

- Not run: nothing was executed; all speed numbers are counts from the loop shapes, not timings.
- Read at header and export level only: `fluid-lead.js`, `fluid-wing.js`, `errors.js`, `g-warm.js`, `offset-box-turns.js`, `four-close.js`, `four-rejoin.js`, `four-open.js`, `attitude.js`, `power.js`, `slow-down.js`, `lag-roll.js` bodies; the fluid and errors code may hold more duplicates of the cone and bubble rules than listed.
- Not in the package: the screen, card and 3D files, and the tests; I could not check what the tests expect or whether any test pins an exact time.
- Unsure: whether the 4-ship's own bank caps (45°, 75°) are intended after the no-bank-cap rulings of 6 Oct; where the 5% torque floor is implemented; whether the judge's wider regions were a ruling or a convenience; whether the shared 30 ft/s height rate was meant for all three rules; whether `planGoTo`'s fallback can still be reached from the chooser (I believe not).
- Judgement call: I weighted "fewer places for a rule" above "keeps every tuned shape", because the rule book's items 6, 8 and 9 and the press-time complaint all point the same way. Patrick may weigh the tuned shapes higher; then step 5 can wait and steps 1-4 still stand.

## Recap

The engine flies a follower four different ways and stitches them together, which is where the copied rules, the dead events, the 7-deep search and the slow presses come from. Keep plan-at-press, make the tracker the one pilot model, leave a small coarse search for the real choices, and do it in six large steps, three of which change no flying. Highest-value first moves: one cone table, one lane rule, one rejoin law, and ranking the roll candidates before confirming them.

## 6. Follow-ups (6 Oct 2026, 20:30Z)

Three follow-ups relayed from the four-ship thread as Patrick's. Same rules: read only inside the package, nothing run or changed. Sections 1-5 are left as written; where this section corrects them it says so.

### 6.1 The files only skimmed before, now read

Read: `fluid-lead.js`, `fluid-wing.js`, `errors.js`, `four-close.js`, `four-rejoin.js`, `four-open.js`, `lag-roll.js`, `slow-down.js`, `offset-box-turns.js`.

**Further copies found**

| Rule | Copy | Note |
|---|---|---|
| Cone band | `lag-roll.js:166` `landsInCone` reads `LAG_ROLL.coneRangeFt` [400, 1250] and `coneSweepDeg` [20, 70] (`moves.js:479-480`), "the judge's region kept 50 ft inside its far edge" | A fifth width: 400-1,250 / 20-70, between the judge's 400-1,300 and the limits' 450-1,250 |
| Cone band | `fluid.js:34` `FLUID.rangeFt` min 500 / max 1,000 / def 600 / goodMax 750 and `:35` `coneHalfDeg: 30` (SMM 16.17 para 42; Patrick rows 2-3) | Fluid's own cone: same 500-1,000 ft, but 30° either side of the tail instead of 30-60° of sweep. A different definition, not a copy; keep separate |
| Cone band | `fluid-wing.js:452` `phiMaxDeg: 20` with the comment "inside the 30° half cone" | Derived from Fluid's cone, hard-coded |
| Cone band (whole cone, aim only) | `four-close.js:343`, `four-rejoin.js:131`, `four-open.js:84` each build the same `{ ...toSlot(c, sweepOut, slot), ...FW_FOLLOW, coneAlt: false, goal: (R, W) => fwGoal(R, W, side, false) }` | Three copies of one "settle anywhere in the cone" recipe; no numbers, but one helper would do |
| 500 ft bubble | `lag-roll.js:129,144,150,227` via `LAG_ROLL.bubbleFt` (`moves.js:473`) | Same value as `FLUID.bubbleFt` (`fluid.js:36`) and `rolling-rejoin.js:101-102`; three names for one rule |
| 500 ft (other meaning) | `errors.js:73` `errHeightFt: 500`, `:147` `FIX_LIMITS.diveFt: 500` | Training-error sizes, labelled estimates; not the bubble |
| Lane (3/9) | `errors.js:52-57,121,225,236` | Words and error offsets along the 3/9 line only; no lane check |
| Lane / height-under-Lead ranges | none new in these files | `rolling-rejoin.js:104` (hard-coded 1,000) stays the only one outside the tracker and kinematic-moves |
| Speed floors and targets | `fluid-lead.js:72` `fwKias: 200` (TS-53, SMM 12.23 para 53); `four-open.js:4` comment 220 / 200 and `:88,150` Lead to 220 KIAS; `four-rejoin.js:30` `FAR_OVERTAKE_KIAS: 25` and `:36` `MAX_CLOSURE_FTPS` 80 kt | The 200 KIAS cone speed is written in `moves.js:23` `KIAS_OUTSIDE_LAB` and again in `fluid-lead.js:72` |
| Cone energy and zoom | `errors.js:623-664` energy height (P = dh/dt + V/g dV/dt) sizing a dive or zoom for the Speed/power fix | A fourth place that trades height for speed, with its own formula; the tracker's (`tracker.js:312-335`), `open-out.js:128` and the turning rejoin's zoom are the others |
| Core maths: turn rate from bank | `fluid-lead.js:343` `(G_FTPS2 * tan(bank)) / V` | Core has `turnRateFromBankRadPerSec` (`flight-math.js:64`) |
| Core maths: energy and G from acceleration | `fluid-wing.js:290-291,537`, `lag-roll.js:94,148` compute G as (acc + g·up)·up / g; `errors.js:632,639,646,664` the energy-height trade | Legitimate 3D maths that core does not have; `point-mass.js:117` `gAndBankForLift` is the nearest. Not a copy, but a candidate for one shared `attitude.js` helper |
| Core maths: DEG | `fluid-lead.js:57`, `fluid-wing.js:37`, `errors.js:166`, `lag-roll.js:31` | Already counted in finding 5 |
| Core maths: ft/s to KIAS/s | `slow-down.js:72` `excess * G_FTPS2 * FTPS_TO_KT * (kias / KTAS)` | This is the one place the climb-cost factor should come from; the six copies in finding 5 re-derive the same KIAS/KTAS ratio |

**The 5% torque floor is found, and section 3.4's "unsure" row is wrong.** It lives in one named number, `moves.js:34` `REJOIN.floorTorquePct: 5` (Patrick 6 Oct 03:17-03:20Z, TS-108), turned into a throttle by `power.js:59` `throttleAtTorque`, and applied at `tracker.js:308` (rejoin legs only), `turning-rejoin.js:177` and `:363`, and `straight-rejoin.js:102`. `slow-down.js:42` `POWER_FLOOR_THROTTLE = 0` is a different thing: the engine model's "no thrust, no extra drag" point, not the rule. None of the nine files read here applies the torque floor; the 4-ship's rejoin legs get it through the tracker's `rejoinLeg` flag.

### 6.2 Step 1 recipe: one cone table, one lane rule, one set of core maths

**The one cone table** (new, in `slots.js` beside `FW_BAND`, since `slots.js` is already the one slot table):

```
CONE = {
  rangeFt:    [500, 1000],   // SMM 12.29 para 69, Fig 12.19 (today FW_BAND.rangeFt)
  sweepDeg:   [30, 60],      // SMM 12.29 para 69, Fig 12.19 (today FW_BAND.sweepDeg)
  flyMarginFt: 50, flyMarginDeg: 5,     // what the sim will fly: band widened by this (today FW_LIMITS 450-1250 / 25-65, estimate)
  seeMarginFt: 100, seeMarginDeg: 10,   // what the judge still calls cone position (today judge.js 400-1300 / 20-70, estimate)
  bubbleFt:   500,           // SMM 16.17 para 44c, SMM 16.23, Gen Book p.11 (today FW_BUBBLE.minFt, LAG_ROLL.bubbleFt, FLUID.bubbleFt)
}
```
`FW_BAND`, `FW_LIMITS` stay as derived views (`FW_LIMITS = widen(CONE, fly)`) so no import breaks in step 1; they go in step 3.

| Site | Today | After step 1 | Flying changes? |
|---|---|---|---|
| `slots.js:95` FW_BAND | literal [500,1000] / [30,60] | `CONE.rangeFt`, `CONE.sweepDeg` | No |
| `slots.js:100` FW_LIMITS | literal [450,1250] / [25,65] | derived from CONE with flyMargin 50 / 5 | No (same numbers) |
| `judge.js:54` classifier | `range >= 400 && range <= 1300 && sweep >= 20 && sweep <= 70` | `inCone(range, sweep, CONE.seeMargin)` giving 400-1,300 / 20-70 | No (same numbers) |
| `judge.js:176-177` in-position check | `FW_BAND.rangeFt/sweepDeg` | `CONE.rangeFt/sweepDeg` | No |
| `moves.js:177` FW_TURN.band | built from FW_BAND | built from CONE | No |
| `moves.js:229` FW_BUBBLE.minFt / maxFt | literal 500 / 1000 | `CONE.bubbleFt` / `CONE.rangeFt[1]` | No |
| `moves.js:75` TURNING_REJOIN.verticalUpFt | literal [500, 1000] | leave: it is a search list of heights, not the band (coincidence of values) | n/a |
| `moves.js:473` LAG_ROLL.bubbleFt | literal 500 | `CONE.bubbleFt` | No |
| `moves.js:479-480` LAG_ROLL.coneRangeFt / coneSweepDeg | literal [400, 1250] / [20, 70] | **differs**: far edge 1,250 vs the judge's 1,300 (comment: "kept 50 ft inside"). Either `seeMargin` with the far edge pulled in 50 ft, or leave. **Stays separate until Patrick rules** | Yes if merged (a roll ending 1,250-1,300 ft out would now count) |
| `fluid.js:34-36` FLUID.rangeFt, coneHalfDeg, bubbleFt | literal 500/1000/600/750, 30, 500 | `bubbleFt` → `CONE.bubbleFt`; rangeFt min/max → `CONE.rangeFt`; `coneHalfDeg` stays (a different cone definition, SMM 16.17) | No |
| `fluid-wing.js:452` phiMaxDeg 20 | literal, "inside the 30° half cone" | leave; note it derives from FLUID.coneHalfDeg | n/a |
| `move-in-band.js:53-54, 79-80` | FW_BAND | CONE | No |
| `move-in-band.js:117` DIVE_ROLL.minFt 500 | literal | leave: it is the least height loss for a rolling dive, not the bubble (same value by chance) | n/a |
| `echelon-to-fw.js:63, 73-74`, `kinematic-moves.js:94`, `replan.js:87` | FW_BAND | CONE | No |
| `rolling-rejoin.js:101-102` | LAG_ROLL.bubbleFt | CONE.bubbleFt | No |
| `lag-roll.js:129-150, 166, 227` | LAG_ROLL.bubbleFt, coneRangeFt, coneSweepDeg | bubbleFt → CONE; cone edges per the LAG_ROLL row above | See above |
| `four-close.js:343`, `four-rejoin.js:131`, `four-open.js:84` | three copies of the settle-in-cone recipe | one `settleInCone(c, slot, side, over)` in `four-legs.js` | No |

**The one lane rule** (new, in `rates.js` or `bands.js`):

```
LANE = {
  marginFt:   100,   // how far ahead of the slot's fore/aft place the follower may pass inside the lane (estimate; today LANE_MARGIN_FT ×3)
  rangeFt:    1000,  // the lane is measured inside this range (SMM 12.27 para 65; today TRACKER.laneRangeFt)
  belowRangeFt: 2000 // height under Lead measured inside this range (SMM 12.27 para 65; today TRACKER.belowRangeFt)
}
laneOk(laneFwdFt, slotFwdFt) = laneFwdFt <= slotFwdFt + LANE.marginFt
```

| Site | Today | After | Flying changes? |
|---|---|---|---|
| `chooser.js:39,114` | `LANE_MARGIN_FT = 100`; `laneFwdFt <= slotFwd + LANE_MARGIN_FT` | `laneOk(plan.laneFwdFt, slotFwd)` | No |
| `replan.js:25,160` | own `LANE_MARGIN_FT = 100`; `max(0, toSlot.fwd) + LANE_MARGIN_FT` | `LANE.marginFt`; keep the `max(0, …)` (it clamps a slot behind Lead to 0; the chooser does not). **Differs in rule, not value**: merging the rule would change which re-plans pass for slots behind Lead (astern). Share the number only until Patrick rules | Only if the rule is merged |
| `transitions.js:49,363` | own `LANE_MARGIN_FT = 100`; `laneFwdFt <= LANE_MARGIN_FT && minBelowFt > 0` (no slot offset, plus a "never above Lead" test) | share the number; the rule is `planGoTo`'s fallback (finding 6) and goes with it in step 2 | No |
| `moves.js:313-314` TRACKER.laneRangeFt / belowRangeFt | literal 1000 / 2000 | `LANE.rangeFt`, `LANE.belowRangeFt` (TRACKER keeps the fields as aliases) | No |
| `tracker.js:371-372` | `T.laneRangeFt`, `T.belowRangeFt` | `LANE.*` | No |
| `kinematic-moves.js:231-232` | hard-coded `< 1000`, `< 2000` | `LANE.rangeFt`, `LANE.belowRangeFt` | No |
| `rolling-rejoin.js:104` | hard-coded `< 1000` | `LANE.rangeFt` | No |
| `turning-rejoin.js:245-246`, `straight-rejoin.js:139-140` | `TRACKER.laneRangeFt` in the 3/9 "ahead" test | `LANE.rangeFt`; the test itself becomes one `aheadOfLine(after, startFt, wasBehind)` helper (identical code in both) | No |
| `turning-rejoin.js:110,198` | `TRACKER.laneRangeFt` as "far from Lead" tests (allowAcross, low-energy MAX) | `LANE.rangeFt` by alias; note they borrow the lane range for another meaning | No |

**Core maths copies and what replaces them**

| Copy | Replace with | Flying changes? |
|---|---|---|
| Climb cost `G_FTPS2 * climb / TAS / (TAS/KIAS)`: `tracker.js:94` `climbCostKtps`, `full-power.js:44` `climbKtps`, `echelon-to-fw.js:141`, `open-out.js:83`, `straight-rejoin.js:101`, `turning-rejoin.js:159` (`perFtps`), `kinematic.js:564` | one `climbCostKtps(climbFtps, tasFtps, kias)` in `slow-down.js` (next to `ktpsFrom`, line 71, which already holds the ft/s² to KIAS/s factor); `tracker.js` and `full-power.js` re-export or import it | No: the seven are the same expression. `kinematic.js:564` averages it over a window first; keep the averaging, swap the per-point formula |
| Level-turn radius `TAS² / (g tan bank)`: `formation-turns.js:63`, `fw-pointing.js:38`, `fw-switch.js:56`; turn rate `g tan bank / V`: `echelon-to-fw.js:150`, `fluid-lead.js:343` | core `turnRadiusFromBankFt(speedFtps, bankDeg)` (`flight-math.js:69`) and `turnRateFromBankRadPerSec` (`:64`) | No, if core's functions are the plain formula. **Check first**: `formation-turns.js:63` clamps the bank with `Math.max(abs(bank), …)` before the tan; keep that clamp outside the call |
| Stall bank `acos(1/availableG(kias))`: `turning-rejoin.js:161`, `:338`, `:445`, `straight-rejoin.js:91`; `flight.js:58,74` (`gateRoll`) | one `stallBankDeg(kias)` in `flight.js` beside `gateRoll`, built on core `bankDegFromG(availableG(kias))` (`flight-math.js:30`) | No, provided `bankDegFromG` is `acos(1/g)` in degrees with the same clamp at g < 1 (`Math.max(1, …)` today) |
| `DEG = Math.PI/180` in 11 files (`attitude.js:26`, `errors.js:166`, `fluid-lead.js:57`, `fluid-wing.js:37`, `fluid.js:22`, `formation.js:56`, `kinematic.js:27`, `lag-roll.js:31`, `move-in-band.js:43`, `slots.js:33`, plus `manoeuvres.js:40` exported) | import `DEG` from `manoeuvres.js` (already exported), or add `DEG` to core `angles.js` beside `degToRad` (`:16`) and import from there | No |
| `kinematic-moves.js:204` `KT_FTPS = 1.6878` | core `KT_TO_FTPS` 1.68781 (`units.js:8`) | **Yes, by 0.0006%**: the kinematic lines' speeds move by about 0.001 kt. Below any margin, but the flight set will not match to 0.001 ft on line moves. Say so in the PR |
| `four-ship.js:46` and `four-legs.js:36` NAMES | one, in `four-legs.js` | No |

Sites that stay separate until Patrick rules: `LAG_ROLL.coneRangeFt` far edge (1,250 vs 1,300); `replan.js:160` lane clamp vs the chooser's; the fluid cone (`coneHalfDeg`, a different definition); `TURNING_REJOIN.verticalUpFt` and `DIVE_ROLL.minFt` (same values, different meanings, left alone).

### 6.3 `flyToDecision`: turning (`turning-rejoin.js:77-250`) against straight (`straight-rejoin.js:45-143`)

Both: step #2 against Lead's recorded flight for up to 180 s (`CHANGE_LIMIT_SEC`), steer toward a line with a heading loop (`bankDegFromTurnRate`, a tau), cap bank at the stall line, run a speed loop with the jerk limit, decide the run-in where "the stop with the torque floor and the boards just fits" (same `rampFt`, `needKtps`, `aStop`, `aMax`, `aPower`, `aAll` lines), set power with `powerFor`/`powerFrom`, record `[bank, kias, power]`, and run the identical 3/9 "ahead" check. The differences:

| # | Difference | Turning | Straight | Flag covers it? |
|---|---|---|---|---|
| 1 | Parameters | `allowAcross, maxWhenLow, aimFt, bankCapDeg, decisionFt, arriveFtps, overtakeKt, floorKias, lineAtKias, lineDeg, lagCut, placeKias, profile` | `route, cutDeg, aimFt, overtakeKt, profile`; decision and arrival derived inside from the window (`TR.windowFarFt`, mid of `TR.stableKt`) | Mostly yes: the straight one is the turning one with fixed values. `route` and `cutDeg` are the real extra inputs |
| 2 | The line | A fixed line at `lineDeg` off Lead's tail in his turning frame; the frame's motion (Lead's velocity + ω×r) is solved for the heading that closes along the chosen direction (lines 128-140) | Lead's six, then from `vectorAtFt` back a small vector toward the route slot (`lineLeft`, line 58); Lead straight so heading = Lead's heading minus the cut | Partly. With Lead straight, ω = 0 and the turning solver reduces to the straight case, so one solver works. The six-then-vector shape is a different line definition: a `line(back)` function argument, not a flag |
| 3 | Cut / approach angle | `TR.approachDeg` fixed, scaled by `atan(cross/aimFt)` | `cutDeg` searched over three values, same `atan` shaping | Parameter, not a flag: pass `approachDeg` in both |
| 4 | Heading tau | `TR.lineTauSec` | `SR.lineTauSec` | Parameter |
| 5 | Bank cap | `min(bankCapDeg, stall bank)`, further cut to `sustainedBankDeg` within `floorMarginKias` of the floor (line 162) | `min(TR.bankCapDeg, stall bank)`; no sustained-bank cut | **Technique difference**: the straight one may bank past what full power sustains near 200 KIAS. Probably an omission, since TS-75 applies to both; ask |
| 6 | Across to the other side | Returns null if #2 crosses Lead's six unless `allowAcross` and far out (line 110) | Returns null if he crosses the six by more than `SR.captureFt` before getting onto it (line 75) | Flag plus a tolerance; same intent |
| 7 | "On the line" | `|cross| <= TR.captureFt` | `onSix` latched when behind Lead and within `SR.captureFt` of the six | Same idea, two capture widths; parameter |
| 8 | Stop condition | `along <= decisionFt && |cross| <= captureFt` (line 117) | `onSix && back <= decisionFt && |cross| <= captureFt && (W.kias - L.kias) <= stableKt[1]` (line 80), and null if `back < windowNearFt` without having met it (line 81) | **Technique difference**: the straight one also requires the overtake inside the window's top and refuses past the near edge (TS-110's window), the turning one leaves that to `flyOnTheX`. Covered if the shared law takes a `done(rel, W, L)` predicate |
| 9 | Speed before the line | Hot: least speed (`floorKias`, or the place's speed when zooming), climbing to `lineAtKias` as he reaches the line; cold: MAX with no top; low and far: MAX (`maxWhenLow`) | Not yet on the six: MAX, always (`aCmd = aMax`, line 115) | **Technique difference**: hot vs cold has no meaning with Lead straight (there is no "ahead of the line" until on the six), so MAX-always is the cold branch. A flag `leadTurning=false` can route to the cold branch, but the hot branch's floor and `lineAtKias` logic only exists on the turning side |
| 10 | Speed on the line, before run-in | `max(targetKias, W.kias)` (keeps what he has) | `max(0, speedLoop·(targetKias - W.kias))` with `aCmd >= 0`: MAX up to target, never power back | Same intent ("no power back if he has more"); the straight one cannot slow, the turning one holds. Parameter-level |
| 11 | Floors | `floorKias` passed in (200, or the Rates line speed logic in the caller); `leastKias` may drop to `placeKias` while zooming; the final ease-off toward `leastKias` (line 220) | `floorKias = KIAS_OUTSIDE_LAB` fixed at 200 (line 112), applied only inside the run-in ease (line 122) | Parameter; but note the straight one never eases toward the floor outside the run-in |
| 12 | Climb cost | `perFtps = g/TAS/ratio`; `climbKtps = zoom ? 0 : perFtps·climb`; plus `zoomKtps` added to the stop/power sums | `climbKtps = g·climb/TAS/ratio`; no zoom term | Same formula (finding 5). The zoom is a feature flag (`lagCut`), already optional on the turning side |
| 13 | Closure measured | Along the line (or toward the place when lagging), divided by `cosL` where it converts to speed | Fore/aft (`back`), no `cosL` | Falls out of the line definition: cosL = 1 for Lead straight if the line is his six |
| 14 | Run-in release | Can leave the run-in again when the closure dies (line 191, `runInHoldSec`, `runInReleaseShare`) | Once in, stays in | **Technique difference**, small: Lead's turn closes the range by itself and the turning one accounts for that. With Lead straight the release would rarely trigger; harmless to share |
| 15 | Power stage | `idleBoards` allowed when `runIn` or hot beyond `captureFt` | `idleBoards` when `runIn` only | Follows from the hot branch (row 9) |
| 16 | Returned record | adds `minKias, maxG, minG, lineKias, zoomLeg` | adds `sixFt` | Union of both; harmless |
| 17 | 3/9 check | lines 245-246 | lines 139-140 | Identical; one helper |

**Verdict:** one law with a `leadTurning` flag covers rows 1-4, 6-7, 10-13, 15-17 (the straight case is the turning case with ω = 0 and a different line function). Three rows are real technique differences to settle before merging: row 5 (the straight one lacks the sustained-bank cut near the floor), row 8 (the straight one checks the window's overtake and near edge inside the law; the turning one does that in `flyOnTheX`), and row 9 (the straight one has no hot branch, which is right for Lead straight but means the merged law must take the hot logic from the turning side). Row 14 is a small difference that can be shared as is. The merge is best done as: one `flyLine({ line(back|along), leadTurning, done(), approachDeg, tau, floors… })`, with the straight planner passing its six-then-vector line and its window predicate.

### 6.4 Smooth, realistic and efficient handling, built on the current model

Four parts: what Rates should control, the speed tables, where the code jerks today, and how one pilot model smooths them. "Ruling" names a row in `docs/trainer/decisions.md`; "judgement" means no ruling covers it; every number has a source or says estimate.

**A. What the Rates setting should control**

Today Rates sets the close-in time (10 / 5 / 2.5 s, `rates.js` CLOSE_IN_SEC, Patrick 5 Oct 06:11Z), the rejoin closure (15 / 25 / 50 kt, REJOIN_CLOSURE_KT, 06:09Z; AI's 50 an estimate) and the line speed (210 / 220 / 235 KIAS, TS-133). Bank is the same for all three (Patrick 06:07Z "No on bank and g"; 06:43Z up to 60° close; no cap elsewhere, TS-107/108). Everything else is one set of numbers for everyone.

Judgement: Rates should become an **experience profile**, one row per level in one table, that every move reads. It should set how boldly he uses the aircraft, not what the aircraft can do (the envelope gate stays one gate, TS-93, TS-85). Proposed fields and what each level should feel like:

| Field | Student | Instructor | AI | Source |
|---|---|---|---|---|
| Close-in time route to echelon, s | 10 | 5 | 2.5 | Patrick 06:11Z (built) |
| Rejoin closure, kt | 15 | 25 | 50 | Patrick 06:09Z; AI estimate (built) |
| Line speed target, KIAS | 210 | 220 | 235 | TS-133 (built) |
| Normal G aim in a rejoin or cone move | 3 | 4 | 5 | G rule 5 G normal (SMM 16.17 para 44a, TS-60); the lower student/instructor aims are **estimates**; the 7 G ceiling stays physics for all |
| Roll rate he asks for, share of the T-6A's | 0.5 | 0.75 | 1.0 | T6A_ROLL (`t6-performance.js:50`, estimates); shares are **estimates** |
| G onset he asks for, G/s | 2 | 3 | 4 | T6A_G_ONSET 4 G/s (`t6-performance.js:52`, estimate); the 8 G/s gate ceiling stays for all |
| How much of the cone's height he uses, share of coneUpFt | 0.5 | 0.8 | 1.0 | TS-96, TS-136 (the whole cone); shares **estimates** |
| Power steps: how far he moves the lever at a time | part power, boards early | set-and-hold, boards as needed | MAX or idle, boards as needed | CLOSURE power profile (Patrick 04:58Z, 05:47Z, 05:54Z); the staging is **judgement** |
| Lead's turn-in bank for a turning rejoin | 30° | 30° | 30° | SMM 16.20 para 65b; the same for all |
| Window he plans to (ft from Lead, KIAS over) | 250-100, 10-20 | same | same | TS-106/TS-110; the same for all (windows are the manual's, not experience) |

What each should feel like: **Student** flies the picture from the manual, gentle and a little slow, uses power before geometry, stays in the middle of the cone, never near a limit. **Instructor** is the SMM done well: geometry first, set-and-hold power, uses the cone's height, near but not at the G rule. **AI** is the best a T-6A can do: full lever travel, full roll rate, the whole cone, up to the G rule and past it only as a last resort (TS-60), every limit still flagged on screen. Judgement, all three; Patrick's own words from 5 Oct 21:06Z ("as soon as a spread formation is selected, unrestricted attitude changes and power") already describe the AI row.

Two things Rates should not control: the envelope (one gate for all, TS-93) and the windows and bands (the manual's, TS-110). A student who misses the window should miss it, not be given a bigger one.

**B. Speeds, windows and targets: which exist, where they live**

Today they are spread over `rates.js` (line speeds), `moves.js` (KIAS_OUTSIDE_LAB 200, KIAS_LAB 220, TURNING_REJOIN windows and overtakes, STRAIGHT_REJOIN, REJOIN.floorTorquePct), `bands.js` (STOP_KT), `fluid-lead.js:72` (200 again) and the 4-ship files (`four-rejoin.js:30,36`, `four-open.js:4,157`). Proposed: one table `SPEEDS` in `rates.js`, each row typed **limit** (physics or a hard floor) or **target** (aim, may be missed and flagged):

| Row | Value | Kind | Source |
|---|---|---|---|
| Formation speed outside line abreast | 200 KIAS | target (Lead's) | SMM 12.23 para 53 (`moves.js:23`) |
| Line abreast speed | 220 KIAS | target | TS-38 (`moves.js` KIAS_LAB) |
| Rejoin least speed | 200 KIAS | **limit** (floor), with Patrick's exception "unless massively high on energy and tight" as a flagged case | TS-75 |
| Line speed by Rates | 210 / 220 / 235 | target | TS-133 |
| Overtake at the window | 10-20 KIAS over Lead | target band | TS-106 (SMM 12.24 paras 56-58; EFIG p.374) |
| Window range | 250-100 ft | target band | TS-106 / TS-110 |
| Overshoot trigger | > 30 kt fast or 10° hot | **limit** (the decision) | SMM 12.27 para 65 (TS-110) |
| Rejoin closure by Rates | 15 / 25 / 50 kt | target | Patrick 06:09Z |
| Close-in closure (from the close-in time) | derived | target | Patrick 06:11Z |
| Stop speed in the slot | STOP_KT | target | `bands.js` |
| Roll-manoeuvre least speed over the top | about 140-166 KIAS | target, flagged | Patrick ~17:00Z 6 Oct (TS-137) |
| Stall / shaker | from core availableG, shakerG | **limit** (physics) | core `t6-performance.js` |
| Torque floor on a rejoin | 5% | target (idle is a last resort, not forbidden) | TS-108 |

Rule of thumb, judgement: anything the manuals give as a number a pilot aims at is a target and goes on the card when missed; only physics and Patrick's explicit floors are limits. That matches the rule book ("references, not walls").

**C. Where the code jerks or snaps today**

| Place | What happens | Evidence |
|---|---|---|
| Hand-over from a kinematic line to the tracker at 500 ft | The line's poses are read off a geometric path and smoothed with three one-second running means (`hand-over.js:147-172`); the tracker then starts from the last pose. A bank or power step is possible at the join, and the three passes are a patch for it | `hand-over.js:156`; finding 1 |
| Speed set directly | `setKias` writes the speed each step from the planner's acceleration; the physics step does not own it. The jerk limit (`TRACKER.gain.jerkKtps2` 25 kt/s², TS-108) is applied by each planner separately, so two planners joined can double the jerk at the join | `tracker.js:22-26`; 9 callers |
| Power stages are discrete | power / boards / idle / idle+boards (`slow-down.js:45`, `power.js:66` RANK): a planner can flip stage between steps, and the tag flickers; the engine lag (ENGINE_RESPONSE_SEC 0.25, `rates.js`) smooths thrust but not the choice | `power.js:74-90` |
| Two height passes | `trackTwice` flies for times, then re-flies with a smoothed height profile; the second pass can disagree with the first on when he arrives, and `flyWith` runs a third pass for the wing-plane ease | `tracker.js:414`; `turning-rejoin.js:632` |
| Held-command planners switch branches | `flyToDecision` flips between hot, cold, on-line and run-in branches with different commanded speeds; the jerk limit hides most of it, but the run-in release (`turning-rejoin.js:191`) can toggle | section 6.3 rows 9, 14 |
| Pose replay catching up | A replayed pose faster than the aircraft rolls is held by `holdToEnvelope` until the wings catch up; the path flown is the pose's, so the drawn bank and the path can disagree for a moment | `flight.js:holdToEnvelope` |
| Legs joined on a step | 4-ship legs start "when the one ahead is settled"; a wingman holding on a slot then starts a new leg from rest, so his first command is a step | `four-legs.js:174` joinLegs; `flight.js hold thenNext` |
| Bank cap changes mid-move | Different caps per phase (close 60°, rejoin none, 4-ship 45°/75°) mean the commanded bank can jump when a phase changes | `four-rejoin.js:181,192`; `four-open.js:157` |

The envelope gate itself is smooth: roll rate and roll onset from the T-6A curves, G onset at 8 G/s with a look-ahead, stall bank (`flight.js:56-74`, TS-93). The jerks are upstream of it, in what is commanded.

**D. How one pilot model smooths them**

1. **One command path.** Every planner outputs the same three commands each step: aim point in the reference frame (fore/aft, left, height), desired closure, and energy intent (hold / gain / lose). One law turns those into bank, G and power. Then one jerk limit, one power-stage hysteresis and one roll shaping apply everywhere, and a hand-over is just a change of aim, not a change of controller. This removes the first, second, fifth and eighth rows of C. Judgement, consistent with TS-93's "one gate" idea extended one layer up.
2. **Power as a continuous lever with hysteresis.** Command throttle 0-1 plus boards as a separate switch with a minimum dwell (estimate 2 s, the RATE_SET_SEC the Rates profile already uses), idle only when the boards at the torque floor are not enough (TS-61 order, TS-108 floor). The tag then changes at a pilot's pace.
3. **Speed owned by the physics step.** Instead of `setKias`, the law commands throttle and the step integrates speed from thrust, drag, G and climb (core `excessFnFor`, `slow-down.js`). Energy is then conserved by construction, so height-for-speed trades (TS-96, TS-136) need no separate formula in each planner. This is the biggest single change and must be proved with the flight set.
4. **One height profile, planned once.** Replace `trackTwice`'s two passes with a height command inside the law (cone energy decides the height aim; the profile is the smootherstep already in `flight.js heightAt`), so arrival time and height agree in one pass.
5. **Shaped bank commands.** The law asks for bank through the same `easeRoll` shape the gate uses, at the Rates profile's share of the T-6A's roll rate and G onset (table A), so a student rolls visibly slower than the AI without touching the gate.
6. **Phases start in motion.** A leg that begins from a hold starts with the hold's last commands, not zero; "stable means controlled, not stopped" (Patrick 05:29Z).
7. **Efficiency comes from the aim, not the search.** Geometry first (TS-111): the aim point for a rejoin is the line, then the window; height first for energy (TS-124 "steeper dive, harder pull, deeper roll"); power last. With one law the search is over three or four aims (side, cut, dive-or-zoom, roll-or-plain), coarse step first, so the planner is quick and the follower is quick to position without wasting energy because the law never throws speed away with idle when height will do.

What this does not change: plan-at-press and replay, the envelope gate, the chooser's "best of a bad set", the windows and bands from the manuals, the 4-ship's "wait for the one ahead" gates. What to fly before trusting it: the section 4 flight set, plus three smoothness checks a pilot would recognise: no bank change over 30°/s² of commanded roll acceleration above the gate's (estimate), no power stage flipping back within 2 s (estimate), and the tag's power word changing no more than once per phase.

### 6.5 Recap of the follow-ups

The skimmed files add a fifth cone width (the lag roll's 400-1,250), Fluid's own cone definition, a third name for the 500 ft bubble, a fourth height-for-speed formula (errors.js) and three copies of the settle-in-cone recipe. The 5% torque floor is in one place (`REJOIN.floorTorquePct`) and reaches the rejoins and rejoin tracker legs; section 3.4's doubt is withdrawn. Step 1 can merge every cone and lane site but three without changing the flying, and the only core-maths change that moves anything is the knots constant by one part in 170,000. The two `flyToDecision`s share their skeleton; a `leadTurning` flag plus a line function covers all but three rows, which need Patrick's word. For handling: make Rates an experience profile (G aim, roll share, cone use, power staging), keep one typed speed table (limits against targets), and route every planner through one command path so one jerk limit, one power hysteresis and one roll shaping apply everywhere.

## 7. Trajectory optimisation: the three routes in detail (Patrick, 6 Oct 21:41Z)

Written from engineering knowledge, not from anything run. Every size, time and line count here is an **estimate**. "Complexity" is given two ways: how hard it is to build and keep (people), and how much work the computer does per press (machine).

### 7.0 What all three share

The problem statement is the same whichever route solves it, and it is worth writing down first because it is also the spec:

- **State** each step: position, heading, speed, height, bank, G (what `flight.js` already carries).
- **Controls**: bank (or roll rate), G (or pitch), power stage and throttle, boards. Three to four numbers per instant.
- **Hard limits** (never broken): T-6A roll rate and roll onset (`t6-performance.js` T6A_ROLL, estimates), G onset ceiling 8 G/s (`flight.js`, estimate), stall and 7 G (core `availableG`, `T6A_LIMITS`), the 500 ft bubble (SMM 16.17 para 44c), never ahead of the 3/9 line inside 1,000 ft (Patrick 5 Oct 08:04Z), the end state inside the window (250-100 ft, 10-20 KIAS over; TS-106/110).
- **Cost** (the sum to make small; weights are the tuning, every one an estimate until Patrick picks): time to the window; speed thrown away (idle or boards time, or energy height lost below the cone); control movement (roll acceleration, G rate, power lever travel); soft penalties for passing the G rule's 5 G (SMM 16.17 para 44a), for leaving Lead's plane at the end (TS-126/127), for a Student profile using more than its share of the aircraft (section 6.4 A).

A route is then: how the control history is represented, and how the search over it is done.

### 7.1 Route 1: write it yourself on the existing step (direct shooting)

**Shape.** A new file, say `optimise.js` (about 300 lines, estimate), plus a 60-line Nelder-Mead or coordinate hill climb. No other file changes at first: it is one more planner the chooser races (`chooser.js` candidateOf), handing back the same `bankTrack` shape as the held-command planners do today. The flight step, the envelope gate, the recorder and the replay are all reused.

**Step by step.**
1. Pick the knots: K points in time for each of bank, G-or-climb, and throttle (K = 6 to 10, estimate), joined by the smootherstep in `flight.js` so the controls are smooth between knots. Boards as one on/off time. That is about 3K + 1 numbers, 20 to 30 in all.
2. Seed from today: run the existing technique planner (say `searchTurningRejoin`'s winner), read its bank/speed/power track, and sample it at the K times. The optimiser starts from a path that already flies.
3. Fly one guess: step the follower through `stepAircraft` against Lead's recorded flight with the knot controls, as `flyToDecision` does today, until the window is met or a time limit. The gate holds the hard aircraft limits during the fly, so the optimiser cannot ask for an impossible roll.
4. Score it: the cost in 7.0, with the other hard limits (bubble, lane, window reached) as large penalties, never as "refuse".
5. Improve: Nelder-Mead over the 20-30 numbers, or one knot at a time (coordinate search), each move re-flying step 3. Stop when the cost stops falling by more than a small amount or after a fixed number of flights (estimate 200 to 500).
6. Hand back the best as a candidate; the chooser scores it against the technique planners as it does today, so a bad optimisation loses to the manual's shape rather than being flown.
7. Show why: the card lists the cost terms of the winner (time, energy lost, control movement, penalties), so a user can see what the path traded.

**Machine cost per press.** Each flight is up to 3,600 steps (180 s at 0.05 s) today; at a coarse search step of 0.2 s it is 900. 300 flights × 900 steps ≈ 270,000 steps, comparable to one of today's turning-rejoin searches, so roughly today's press times, not worse, if seeded. Unseeded (random start) it is 5 to 20 times that and often finds a worse path than the seed.

**People cost.** Medium. The maths is plain (fly, score, nudge). The hard part is the cost's weights: too much weight on time and he idles then firewalls; too much on smoothness and he crawls. Expect a week of flying the sign-off set and adjusting weights (estimate), then every new ruling becomes a cost term with its source, which fits the rule book well.

**Gain.** Paths that are near-optimal for the cost you wrote, from any start, with one code path; the search's knobs are the physics (K knots), not technique names. Readable to a non-developer: "fly, score, improve".

**Loss and risk.** Local optimum: hill climbs find the best path near the seed, not the best in the world, which is also what keeps the result looking like the manual. The paths are explained by numbers, not by names; teaching value depends on step 7. Determinism is kept (same seed, same search order, same answer).

### 7.2 Route 2: bring in a proper solver (direct collocation with a nonlinear programming solver)

**Shape.** The dynamics are written as equations, not stepped code: at N collocation points (N = 30 to 60, estimate) the solver holds state and control as unknowns and enforces "the state at point i+1 equals the state at point i plus the step" as constraints, with the limits as inequality constraints and the cost as the objective. A solver such as IPOPT (interior point) or an SQP method finds all N×(states+controls) unknowns at once, using gradients. In a browser that means either a WebAssembly build of IPOPT/CasADi (large: several MB, a toolchain to maintain) or a JavaScript nonlinear least-squares library (Levenberg-Marquardt) with constraints as penalties, which is weaker.

**Step by step.**
1. Write the flight model as differentiable equations (speed, heading, height, bank from controls; drag and thrust from core's curves). The existing step is code with branches (gate, stages), so this is a re-derivation and must be checked against the step: a second copy of the physics, which the rule book forbids unless the step itself is rebuilt on it.
2. Choose and add the solver (Patrick's yes needed, no-new-libraries). Set up a build step for the WebAssembly or vendor the JS library.
3. Encode constraints: dynamics at each point, limits, bubble, lane, window at the end, Lead's recorded path as known data.
4. Warm start from the technique planner's track (as route 1 step 2).
5. Solve; convert the solution to a `bankTrack` by re-flying it through `stepAircraft` to check and record (the solver's own path and the step's can differ slightly; the fly-through is the truth).
6. Chooser races it as in route 1.

**Machine cost per press.** A warm-started IPOPT solve of this size is 50 to 500 ms native; in WebAssembly 2 to 5 times that (estimate). Faster than route 1 and far faster than today.

**People cost.** High. A second flight model to keep equal to the step; a numerical-methods skill to debug failed convergence ("restoration phase failed" tells a pilot nothing); a build pipeline. A month to first flight (estimate), and every physics change is made twice.

**Gain.** Near-global optimum under the limits, robust, fast at run time, and the standard engineering answer; constraints are hard constraints, not penalties.

**Loss and risk.** Opaque: when it fails or does something odd, only the solver log explains it. Non-determinism across machines is possible with floating-point differences in WebAssembly builds. Against three rule-book rules (no new libraries, one copy of flight math, readable to a non-developer).

### 7.3 Route 3: precompute offline, interpolate in the browser

**Shape.** Route 2 (or route 1 run long) on your PC, over a grid of start states relative to Lead: range (say 1,000 to 6,000 ft in 8 steps), angle off (12 steps), height difference (5 steps), speed (3 steps), Lead's bank (3 steps) ≈ 4,300 cells (estimate), each holding a control history (the K knots). Shipped as a JSON table (a few MB). At the press the browser finds the nearest cells, blends their knots, and flies the blend through `stepAircraft` to record and check it.

**Step by step.**
1. Build route 1 or 2 as a Node script in `tools/`, not in the app.
2. Define the grid and run it (hours on a PC for route 1, minutes for route 2; estimates).
3. Store knots per cell with the version of the rules they were solved under.
4. In the app: a small `lookup.js` (about 100 lines) that interpolates knots and flies the result; the chooser races it.
5. On a ruling change, re-run step 2 and re-ship the table.

**Machine cost per press.** One fly-through: tens of milliseconds. The fastest route.

**People cost.** Medium to high: everything in route 1 or 2, plus the grid tooling and the discipline to regenerate. Starts outside the grid (a 4-ship wingman off another wingman who is also moving) have no cell, so the 4-ship still needs a live planner.

**Gain.** Instant presses, library-free in the browser, deterministic.

**Loss and risk.** Blended knots between cells can break a limit (the fly-through catches it, but then there is no fallback except today's planners); the table goes stale silently when a ruling changes; Lead's recorded path is not a start state, so anything beyond "Lead in a steady turn or straight" is outside the grid.

### 7.4 Side by side

| | Route 1: shooting on the step | Route 2: collocation + solver | Route 3: offline table |
|---|---|---|---|
| New code | ~300 lines plain JS, one planner | solver (MB) + ~500 lines model + build step | tool script + ~100 lines lookup + table (MB) |
| Second copy of physics | No (reuses the step) | Yes (equations) | Only in the tool |
| New library | No | Yes (Patrick's yes) | In the tool only |
| Press time (estimate) | seconds, like today, if seeded | 0.1-2 s | milliseconds |
| Readable to a non-developer | Yes: fly, score, improve | No | Table yes, maker no |
| Explains the path | By cost terms on the card | Solver log | Not at all |
| Handles any start, 4-ship, moving references | Yes | Yes | No (grid only) |
| Time to first flight (estimate) | 1-2 weeks | 1 month+ | 2-3 weeks after route 1 or 2 |
| Fits the rule book | Yes | Against three rules | Partly |

### 7.5 My recommendation, as before

Route 1, and only as the polish step under the one-pilot-model plan (section 1.2 D): the pilot law produces the first guess and keeps the shape teachable; the optimiser trims time and energy inside the limits and reports what it traded. Build it after refactor steps 1-4 (section 4), not before, because today's four planners would give it four different seeds. Routes 2 and 3 are for a later tool whose job is "best path", not for a trainer whose job is "the right technique, flown well".
