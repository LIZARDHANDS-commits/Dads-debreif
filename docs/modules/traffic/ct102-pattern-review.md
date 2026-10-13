# Traffic: a CT-102B Astra II pattern beside the CT-156's. Architecture review and phased plan

> **Status:** the one-off architecture review for plan Step 5c (Patrick's go-ahead, relayed by Dad, 13 Oct 2026). Its questions Q1 to Q6 wait on Patrick, one at a time, on the waiting list in `../../PLAN.md`. Nothing here is built until Patrick approves the plan. Where this file and `spec.md` or `decisions.md` disagree, those win.

Fable review, 13 Oct 2026, for Traffic plan Step 5c item 1 (Dad's ask; Patrick's go-ahead relayed by Dad). Read-only: nothing in any repo was changed. Code read at worktree `trafficwt` (main at c7dabbee). The plan is written for an Opus executor; Sonnet for the screen and docs phases.

**Lead:** the Astra can share Traffic's one simulated pilot and one path follower with its own parameter set, and nothing in the CT-156's flying has to change. But two of the numbers Dad gave cannot both hold as a turn: **180 KIAS at 30° of bank is a 5,400 ft radius turn (1.8 NM across), wider than the CT-156's own inner downwind**. The Astra's 180 KIAS must be a straight-leg speed; its turns are flown slow (about 90 KIAS, the perch speed), and that is what sets the pattern's size. Second, with the Astra downwind 500 ft below and inside, **the CT-156's descending final turn passes through 3,000 ft right over where the Astra downwind would run**, so the Astra's perch has to sit short of (upwind of) the CT-156's final turn, with a shorter final. Both are questions for Patrick before any flying code (Q1 and Q2 below).

---

## 0. Words used here

- **Point mass**: the one flight model in `src/core/point-mass.js`: the aircraft as a dot with a speed, pushed by G, bank, and thrust minus drag.
- **Performance set**: the numbers that make the point mass a particular aircraft (thrust, drag, stall speed, limits, glide, roll rate). Today there is one, the T-6A's (`src/core/t6-performance.js`, `t6a-turn-data.js`).
- **Simulated pilot** (`circuit.js` `makePilot`): flies a manoeuvre once, step by step, in today's wind, and records the track.
- **Path follower** (`path-follower.js` `followRoute`): the only code that moves an aircraft; it rides a recorded track at the track's speeds.
- **Route**: a named line on the map with points (`data/moose-jaw.json`): PAT1 the overhead break, ENT1 the OHB Rejoin, ENT2 the SI Rejoin. A route of kind `pattern` is a closed loop the aircraft flies lap after lap.
- **Type profile** (`types.js`): today only colour, a fallback speed, and a speeds table the flying code does not read.
- **Pure move**: a code change that moves things about without changing a single flown number; checked by building the same track before and after.

---

## 1. Aircraft type as data: what is CT-156-specific today

The rule book asks for a list of what the code does before it is rewritten. Each row: file, what it does now for the type, what it becomes, risk.

| File | What it does now | What it becomes | Risk |
|---|---|---|---|
| `src/core/t6-performance.js`, `t6a-turn-data.js` | Every function (thrust, drag, excess thrust, stall line, available G, roll limits, G onset, pitch attitude, glide, zoom, split S) reads the T-6 constants `T6A_FIT`, `T6A_LIMITS`, `T6A_ROLL`, `T6A_PITCH`, `T6A_GLIDE` by name. There is no way to ask them about another aircraft. | A factory `makePerformance({ fit, limits, roll, pitch, glide })` in a new `src/core/aircraft-performance.js` returns the same set of functions closed over one parameter set. `t6-performance.js` keeps every export under its present name, each now the T-6 instance's function (`const t6 = makePerformance(T6A…)`), so every caller in Traffic, Turn Fight, Formation and Debrief is untouched and every core test still passes. `src/core/ct102b-performance.js` holds the Astra set, each number with its source status (section 4). | Low if done as a pure move: identical constants, identical formulas, one place. The core tests pin the T-6 numbers against reference data, so a slip shows. |
| `src/modules/traffic/types.js` | Six type profiles, colour and speeds (the speeds table is read by nobody that flies). `SPAWN_TYPES = ['CT-156']`. `T6_LENGTH_FT = 33.4`. | Each profile gains `perf` (the performance set), `patternRouteId` (`'PAT1'` for the CT-156, the Astra route id for the CT-102B), `pattern` (its pattern numbers: height, speeds, banks, each with a source), `lengthFt`, `modelKind`, and `tagWord` (what the behaviour tag calls the pattern). `SPAWN_TYPES` adds `'CT-102B'`. The unused `speeds` tables stay or go in their own tidy. | Low. Data only. |
| `sim.js` lines 65-70 `TYPE_COLORS`, `spawn` line 1363 | Its own colour table with `'CT-102'` but **not** `'CT-102B'`, so `sim.spawn({ type: 'CT-102B' })` throws "unknown aircraft type" today. `map2d.js` lines 43-48 has a third copy. | Both read `types.js` (`TYPE_COLORS`, `isKnownType`). `sim.js` keeps exporting `TYPE_COLORS` (a test reads it). | Low. One source of truth; the rule book's "no second copy". |
| `sim.js`, about twelve `routeById('PAT1')` calls (lines 195, 205, 259, 297, 364, 451, 469, 574, 652, 721, 838, 859, 908, 1544) | The pattern an aircraft flies is assumed to be PAT1: the closed-pattern start, taxi-in, lap decisions (`checkDecisions`), joining when aligned, spacing on final, Randomize, the SI pattern, the go-around's rejoin, the touch-and-go's climb-out, the behaviour tag's window. | One helper `patternFor(a)` = the route whose id is `typeProfile(a.type).patternRouteId`, falling back to PAT1 as today. Only the per-aircraft calls change (toStart, landForTheStop, checkDecisions, joinWhenAligned, goAroundEnded, goFromRunway, the tag's window). Scenario-level calls (Randomize, SI pattern, Busy circuit) stay on PAT1: the Astra does not take part in them yet (section 7). | Medium: it is the busiest file. Each change is a one-line substitution whose CT-156 answer is the same route. Guarantee: the CT-156 tests (`sim`, `plausibility`, `vector-sim`, `smooth-transitions`, `deconflict`, `randomize`, `behaviour`) are unchanged. |
| `route.js` lines 184-186, 203, 235, 272-275, 518-523 | The flown (wind-shaped) track is built only for `route.id === 'PAT1'` (`generateWindAdjustedTrack` calls `buildCircuit`); other routes use V6's rounded corners. Special cases for PAT1 points 11 and 12. | Dispatch on a route field, not its id: `route.flown: 'ct156-overhead'` (PAT1, set in the data) or `'ct102b-circuit'` (the Astra route) picks the builder; an id check stays only as the fallback for PAT1 so an old saved setup still works. | Low. The PAT1 path through the code is identical. |
| `circuit.js` | `CIRCUIT` (220/180/120/100 KIAS, 60° and 35° banks, break point, 2,500 ft go-around), `PATTERN_ALT_FT` and the T-6 performance functions are read by name inside `makePilot`'s helpers (`accelFor`, `idleDecel`, `powerClimb`), `flyOuter`, `flyInner`, `buildGoAround`, `buildExtendedDownwind`. The pilot itself (`makePilot`, `bankFor`, `trackForLine`, `readyToTurnOnto`, `plannedBank`, `timeToTurnOnto`, `lineOf`) is type-neutral. The final approach, flare and touchdown live inside `flyInner` (lines 778-815) and are not callable on their own. | (a) `makePilot(start, wind)` accepts `start.perf` (default the T-6 set) and `accelFor`/`idleDecel`/`powerClimb` read `pilot.s.perf`. (b) A pure move lifts the final-approach-and-flare piece of `flyInner` into an exported `flyFinal(pilot, …)` that `flyInner` then calls, so the Astra builder can call the same code with its own threshold speed instead of copying it. Nothing in `CIRCUIT` changes. | (a) low: defaults equal today's calls. (b) medium: it touches the CT-156's landing. Guarantee: build Pattern 1 in calm, 15 kt and 25 kt before and after and compare the tracks point for point (the V2.350 refactor's method); the plausibility and smooth-transitions tests also cover it. |
| `envelope.js` `gateRoll`, `rollLimitAt` | Caps every roll at the **T-6's** stall bank (`stallLimitG(kias)` with 86 KIAS) and roll rates. **For an Astra at 90 KIAS this would cap its bank at 24°** (the T-6 at 90 KIAS has 1.095 G to the stall), so the 30° perch turn could not be flown. | `gateRoll(…, perf)` with the T-6 set as default; the pilot and follower pass `perf`. | Must-do in the flying phase, not optional. CT-156 unchanged (default). |
| `path-follower.js` | Type-neutral mover, except: `attitudeDegFromClimb` (T-6 angle-of-attack model, drawn pitch only), `glideDragPerWeight`/`glideRatio` (PFL side-step cost; the Astra has no PFL yet), `T6A_LIMITS.weightLb` and `WING_DOWN.wingAreaSqFt` (the drawn wing-down bank on final), `gateRoll` (T-6 envelope), gear/flap configuration rule (`resolveAircraftConfig`, T-6 speeds 147/110). | Passes `a.perf` to `gateRoll` and `attitudeDegFromClimb`; the wing-down slip reads the type's weight and wing area when present. Configuration rule: the Astra uses its own gear/flap speeds from its profile (estimates) or shows no configuration until Patrick gives them. | Low for the flying (ground track, speeds and heights are the track's); drawn pitch and the tag's configuration are display only. |
| `closed-pattern.js`, `high-key.js`, `breakout.js`, `evade.js`, `pfl*.js`, `randomize.js`, `scenario-timing.js` (Busy circuit part) | All on CT-156 numbers (140 KIAS climbs, 3,500 and 4,500 ft, 220 KIAS rejoins, T-6 glide). `conflictSpawnPlan` is route-generic (any `routeId`, takes `type`). | **Not reused for the Astra in this plan.** The Astra's card offers Landing behaviour (T+GO, full stop, go-around) and Remove; its Manoeuvres buttons are hidden (TR-R20, "commands only when they make sense"). The Astra go-around is built in the Astra builder. Astra PFL, closed pattern, High Key, breakout, SI pattern and Randomize go on `future.md`. `conflictSpawnPlan` works unchanged for the Astra route. | None to the CT-156. |
| `deconflict.js` | Standing is keyed on **phase names and route kind**, never a route id: good. Right-of-way rows are CT-156 pattern rows; between two aircraft with no rule, "the higher moves". `freeze` predicts along any path. | Works for Astra-vs-Astra and CT-156-vs-Astra as is, with one consequence: a CT-156 above an Astra by 500 ft is "higher" and gives way every time the two come within caution. Whether that is right is Patrick's (Q4). A cross-type row is added only on his answer. The moves an Astra can be told to make: go-around (its own), and a bank-away flinch; the CT-156 breakout (4,500 ft, 220 KIAS) is not offered to it. | Medium: new interactions; the test in Phase 4 covers the two it is built for. |
| `sim.js` `spacingTick` (lines 573-642) | Followers are only aircraft on PAT1's downwind; leaders are anyone lined up on 29L. Extension flown by `buildExtendedDownwind` (CT-156 numbers). | Followers include Astras on their downwind, extended by the Astra builder's own extension (same shape, its speeds). Leaders already include an Astra on final. The 2,000 ft aim (TR-R18) stays; with 90 and 100 KIAS on final the closure is slow, so the rule still works. | Medium. The CT-156 follower path is unchanged. |
| `behaviour.js` | Tag words by phase: an Astra would read `[OHB]`. Configuration by T-6 speeds. | The type profile's `tagWord` (Patrick's word, Q5) replaces `OHB` for the Astra's lap. | Low, words only. |
| `aircraft.js` (spawner) | Type list from `SPAWN_TYPES`; Route list from the setup's routes plus SI pattern and PFL from area; spot buttons keyed on PAT1 points (`SPOT_CHOICES`), the SI spots, miles-back boxes; `Spawn a conflict` passes `settings.spawnType`. | Type and Route are tied: picking the Astra pattern route sets Type to CT-102B and picking CT-102B shows its route; spots for the Astra route (Upwind, Crosswind, Downwind, Perch) from its route's tags. `Spawn a conflict` passes the route's type. | Low. Screen work (Sonnet). |
| `index.js` `showRoutes`/`toggleRoute`, `layout.js` | Every route in the setup already has a row that shows or hides its line ("Hidden"); the SI pattern and PFL circle are extra rows. | **The Astra ground-track toggle is free**: the new route gets a row like the others. Only its starting state is a choice (Q5). | None. |
| `scene.js` `windowToDeparture` | Cuts PAT1's drawn line between the window and the departure end by `src === 1` and `phase === 'final'` marks on the track. | The Astra builder marks its track the same way so the same cut applies (or the whole loop is drawn: Patrick's look). | None. |
| `view3d.js` `modelKindFor`, `standInKindFor`, `planeFor`, `applyPose`, `planeLengthFt` | CT-156 and CT-157 get the Harvard; everything else the ui-kit stand-in (`generic`: slim fuselage, straight wing, T-tail), **drawn at T-6 length**. | A `models.ct102b` builder when the model is delivered (section 5); until then the stand-in scaled by the type's `lengthFt` (27.6 ft against 33.4). | Low. Drawing only. |
| `map2d.js` | Aircraft symbol and colour by type (falls back to `types.js` colours). | Unchanged. | None. |
| `collision` (TR-116) | 35 ft CT-156 hitbox for everyone. | Unchanged for now (the Astra is 27.6 ft long, 33.8 ft span: close enough). Note on `future.md`. | None. |
| `data/moose-jaw.json` | Three routes. | A fourth route, the Astra pattern (`kind: 'pattern'`, `type: 'CT-102B'`, `flown: 'ct102b-circuit'`, hidden or shown per Q5), with its fixed points (section 2). Patrick's own CT-156 routes are not touched. | None to PAT1. The `profile.js` checks accept a new route id pattern; the saved-setup allowlist must admit the new fields (`type`, `flown`). |
| Tests `tests/unit/traffic/sim.test.js` line 428 | Spawns a `'CT-102'` on ENT2 to show the type system works (TR-R16). | Stays. | None. |

**What the CT-156 keeps, by construction:** every default parameter in the plan equals today's T-6 constant; every `PAT1` substitution returns PAT1 for a CT-156; the only edit inside the CT-156's own flying code is the pure move of `flyFinal`, checked track for track. No CT-156 test is edited or retired. That is the guarantee asked for in item 6 of the brief.

---

## 2. The second pattern's geometry

Frame: feet along the runway from the 29L threshold (positive up the runway toward the departure end, 7,250 ft away) and feet across from the centreline on the pattern side (left-hand, south-west). Turn radius is the shared formula `turnRadiusFromBankFt(v, bank)` = v² ÷ (g tan bank) with v the **true** airspeed (`iasToTasKt`), as `circuit.js` already does.

### 2.1 Where the CT-156 pattern is (read off `moose-jaw.json`, true feet)

| CT-156 piece | Along (ft) | Across (ft) | Height |
|---|---|---|---|
| Break starts (10 kt headwind) | +2,000 | 0 | 3,500 |
| Break exit | +3,130 | 3,340 | 3,500 |
| Perch (calm, route point 11) | −5,770 | 3,590 | 3,500 |
| Window (route point 12) | −4,560 (¾ NM) | 0 | 2,131 |
| Final turn arc (perch to window) | about −4,560 to −7,800 | 3,590 down to 0 | 3,500 down to 2,131 |
| Outer downwind (points 5-6) | | 12,180 (2.0 NM) | 3,500 |
| Crosswind turn (point 4) | about +25,000 (4.1 NM) | | 3,500 |

So the CT-156's **inner downwind runs about 3,340 to 3,590 ft out** (about 0.55 to 0.6 NM).

### 2.2 The turn radii Dad's numbers give (30° bank, Patrick)

| Turn | KIAS | Height | KTAS | Radius (ft) | 180° turn spans (2R) |
|---|---|---|---|---|---|
| 180 KIAS at 30° | 180 | 3,000 | 188 | **5,430** | 10,860 ft (1.8 NM) |
| 120 KIAS at 30° | 120 | 3,000 | 125 | 2,410 | 4,830 ft |
| 100 KIAS at 30° | 100 | 3,000 | 105 | 1,680 | 3,350 ft |
| 90 KIAS at 30° (the perch) | 90 | 3,000 to 2,300 | 93 | **1,340** | **2,680 ft (0.44 NM)** |
| For comparison, 180 KIAS at 60° | 180 | 3,000 | 188 | 1,810 | 3,620 ft (on top of the CT-156 downwind) |

**Finding 1.** A pattern's downwind cannot sit closer to the centreline than twice the radius of the turn that puts the aircraft on it (upwind to downwind) or takes it off (the final turn). At 30° of bank that is set by the slowest speed in the turn. At the perch speed, 90 KIAS, the Astra downwind comes out **about 2,700 ft out**, inside the CT-156's 3,340 to 3,590 ft. Any turn flown faster than about **100 KIAS at 30°** (2R = 3,350 ft) puts the Astra downwind on or outside the CT-156's. **180 KIAS has to be a straight-leg speed**, accelerated to once wings level on downwind and bled off again before the perch. The climbing turn onto downwind must be flown at about 90 to 100 KIAS at 30°, or steeper. This is Q1 and Q3 for Patrick.

**Finding 2 (the CT-156 final turn).** The CT-156 descends through 3,000 ft about a third of the way round its final turn, at roughly 2,700 ft across: exactly where an Astra downwind at 3,000 ft would run, if the Astra downwind reached that far (along −4,560 to −7,800). With the Astra at 3,000 and the CT-156 at about 3,100 there, 0 ft apart laterally, that is a red conflict (200/200 ft) by design on every CT-156 final turn with an Astra on downwind there. **So the Astra's perch must sit upwind (along-positive) of the CT-156 final-turn region, and its final is shorter than ¾ NM.** The working answer (Q2): the Astra perches about abeam a point 0.3 NM short of the threshold (along about −2,000), its 90 KIAS, 30° descending turn (R 1,340 ft, about 27 s) rolls out on the centreline about 0.5 NM out (along about −3,000 to −3,500), on the same 3° path the CT-156 flies (height about 2,050 ft there: `THRESHOLD_DATA_ELEV_FT` + 3,000 × tan 3°). From 3,000 ft that is a descent of about 950 ft in 27 s, about 2,100 ft/min, a flight-path angle of about 12°, which is what the CT-156's own final turn does today (1,370 ft in about 30 s). The Astra then shares the CT-156's final inside 0.5 NM, so **the spacing-on-final rule (TR-R18, 2,000 ft) must count both types**, not a geometric crossing.

**Finding 3 (vertical margin).** The two downwinds would be 500 ft apart vertically and 700 to 900 ft apart laterally. The caution is "both inside 500 ft and 500 ft", so exactly 500 ft apart is no caution, but there is no spare: a join's few feet of height blend (`startJoin`), or a settled downwind a few feet high, would flicker cautions. Nothing here changes a limit (that is Patrick's); the plan flags it and the Phase 3 check on screen looks for it. If Patrick wants spare, the only levers are the Astra's height (Dad's 3,000 ft) or the Astra's downwind being tighter (steeper perch turn). Recorded as a note under Q2.

**Finding 4 (the upwind).** The Astra climbs 1,108 ft (1,892 to 3,000) at about 2,100 ft/min (public fact-sheet climb rate, an estimate until checked) at about 100 KIAS: about 32 s and about 1 NM, so its crosswind turn comes **near the departure end of the runway**, about 3 NM short of the CT-156's crosswind turn (4.1 NM). A CT-156 taking off behind an Astra climbs at 180 KIAS and reaches 3,000 ft at about 1.1 NM: the same place and height. That is a real mixed-traffic hazard (the fast type overtaking the slow one on the upwind) and today's deconfliction only has the "higher moves" fallback for it. Q4.

### 2.3 The Astra pattern, as it would be built (working answer, pending Q1 to Q3)

| Piece | Where | Numbers | Source status |
|---|---|---|---|
| Take-off and climb-out | Runway centreline from the touchdown point (shared with the CT-156: `touchdownPointOf`) | full power, climb at the Astra climb speed (about 100 KIAS, estimate) to 3,000 ft | Dad (3,000 ft MSL); climb speed and rate: public fact sheet, estimates |
| Climbing turn to downwind | Starts when 3,000 ft is reached or the departure end is passed, whichever is later, so it clears the CT-156's 2,500 ft go-around level | 30° bank, held at about 90 to 100 KIAS until wings level (Q3) | Patrick (30°); the speed an estimate |
| Downwind | A fixed line about 2,700 ft out (route points A and B), parallel to the runway | accelerate to 180 KIAS, then power back to be at 90 KIAS by the perch | Dad (180, 90) |
| Perch | Found by the same search the CT-156 uses (move the perch until the final turn rolls out at the Astra's own window), starting from a nominal point about abeam 0.3 NM short of the threshold | 90 KIAS | Dad (90); position fitted (Q2) |
| Final turn | 30° descending, eased in and out as the CT-156's | 90 KIAS, 3,000 ft down to the 3° path | Patrick (30°), Dad (90) |
| Final and flare | The CT-156's `flyFinal` code with the Astra's threshold speed; same aim point (the base of the numbers), same 3° path, same flare and touchdown point | 90 KIAS over the threshold | Dad (90 land) |
| Go-around | Full power, straight ahead on the centreline, climb to 3,000 ft, rejoin the Astra downwind | climb speed as above | engineering choice, Patrick to confirm |
| Wind | Every leg flown in the wind by the same pilot: crab on the lines, the perch moved by the search, the climbing turn's ground track wider downwind | as the CT-156 | TR-38 |

**Size ratio (worked estimates, exact once flown):**
- Width: Astra downwind about 2,700 ft out against the CT-156 inner downwind about 3,500 ft: **about 0.77**. Against the CT-156 outer downwind (2.0 NM): about 0.22.
- Length: the Astra circuit spans about along −3,500 (its rollout) to about +9,000 (its climbing turn), about 2.0 NM, against the CT-156 overhead's about 5.4 NM (its perch region to its crosswind turn): **about 0.4**.
- So the Astra pattern fits in a box about 2 NM by 0.45 NM against the CT-156's about 5.4 NM by 2 NM, roughly a fifth of the footprint; against the CT-156's *inner* pattern alone (break to perch, about 1.5 NM by 0.6 NM) it is about three quarters the size either way. Dad's "50 to 75 percent smaller" lands between these two readings; report both to him.

### 2.4 The ground-track toggle

Free: the new route is a row in "Routes on the map" (`index.js` `showRoutes`, `toggleRoute`), which shows or hides its line, dims it and says "Hidden", and leaves the aircraft flying. Its starting state is Q5. In 3D the same row's "Draw on the ground" setting applies.

---

## 3. Flying the Astra on the existing pilot and follower

What is reused as is: `makePilot` (the step, wind, record), `bankFor`, `trackForLine`, `lineOf`, `readyToTurnOnto`, `plannedBank`, `timeToTurnOnto` (the planned turn onto a line, TR-95), `powerClimb` (full-power climb with level-off), `easedFraction`, the perch search loop (lifted into a small shared helper or repeated as a loop in the Astra builder: it is control flow, not flight math), `flyFinal` once lifted (section 1), the path follower whole, `startJoin`, the taxi-in, the lap logic, the behaviour tag, the spacing rule's shape, the deconfliction's prediction and decisions, `conflictSpawnPlan`.

What cannot be reused and is **not** built for the Astra now: the break (`breakKias` curve, 60°), `flyOuter` (the 4 NM upwind, outer downwind, 45° leg and initial), `buildGoAround` (2,500 ft level, 220 KIAS), the closed pattern, High Key climb, PFL (T-6 glide and zoom data; the Astra has none), breakout (4,500 ft, ENT1), the SI pattern, Randomize's rolls, the Busy circuit's PFL and straight-in.

New file `src/modules/traffic/astra-circuit.js` (Opus): `buildAstraCircuit(points, windFromDeg, windKt, perf, numbers)` returning `{ track, perch }` in the same point shape (`x, y, alt, kt, g, bankDeg, rollRateDps, src, phase, headingDeg, tag`) with the phases the rest of the code reads: `climb`, `crosswind`, `downwind`, `final_turn`, `final`, and tags `perch`, `window`, `threshold`, `touchdown`, `src` 1 at the departure end. And `buildAstraGoAround(points, from, wind, perf, numbers)` and `buildAstraExtendedDownwind(…)` for TR-R18. Every flight number comes from `perf` and `numbers`; nothing typed in.

### 3.1 Every Astra number needed, and where it stands

"Public" means a public fact sheet or type-certificate sheet (allowed by ALL-30), read so far only through web-search summaries (the Astra sources table `tools/blender/ct102b/sources.md` says the pages themselves were blocked from the cloud session). "Estimate" means no source yet. Every estimate is labelled `estimate: true` in `ct102b-performance.js` so the screen can flag it (section 3.2). No manual: there is no Astra manual in the project files.

| Number | Working value | Status | Where it is used |
|---|---|---|---|
| Pattern height | 3,000 ft MSL | Dad, 13 Oct; Patrick's working value | Astra route points, builder |
| Downwind speed | 180 KIAS (straight leg only, see Finding 1) | Dad | builder |
| Perch and threshold speed | 90 KIAS | Dad | builder, `flyFinal` |
| Bank in pattern turns | 30° | Patrick, 13 Oct | builder |
| Climb speed | about 100 KIAS | **estimate** (Q3) | builder |
| Rate of climb at full power | about 2,100 ft/min at sea level | public (manufacturer figure, unchecked); drives the thrust fit | performance set |
| Engine power | 456 shp (Rolls-Royce M250-B17F) | public, unchecked | thrust fit |
| Weight | empty 1,095 kg (2,414 lb), public (RCAF page, sources.md P1a); pattern weight about 1,450 kg (3,200 lb) | public and **estimate** | thrust and drag per weight |
| Wing area, span | 13.52 m² (145.5 ft²), 10.31 m (33.83 ft) | public (EASA sheet, sources.md P2) | induced drag (aspect ratio 7.9) |
| Zero-lift drag, Oswald efficiency | CD0 about 0.025, e about 0.8 | **estimates** (standard values for a clean light turboprop trainer) | drag fit `dragA`, `dragB` |
| Propeller efficiency | about 0.8 | **estimate** | thrust fit |
| Stall speed, clean and landing flap | about 68 and 59 KIAS | **estimates** (public figures quoted for the G 120TP, unchecked) | `stallLimitG`, the envelope gate, the behaviour tag |
| G limits | +6 / −4 | public (aerobatic category, EASA sheet), unchecked | `availableG` (not reached in the pattern) |
| VNE / VMO | about 240 KIAS | **estimate**, unchecked | `maxKias` (not reached) |
| Gear and flap limit speeds | unknown | **estimate** needed only for the tag's configuration | `behaviour.js` |
| Roll rate and G onset | the T-6's `T6A_ROLL`, `T6A_G_ONSET` | **estimates** (already estimates for the T-6) | envelope gate |
| Pitch attitude model (angle of attack constant, fuselage datum) | T-6's shape with the Astra's own stall speed scaling | **estimate**, drawn pitch only | path follower |
| Glide (clean, gear, flap) | not needed: no Astra PFL in this plan | | |
| Length, span, height for drawing | 27.62 ft, 33.83 ft, 8.66 ft | public (EASA sheet; `sources.md` P2) | 3D stand-in scale, model check |
| Go-around level height | climb straight to 3,000 | engineering choice, Patrick to confirm | builder |
| Window | the CT-156's 3° path to the base of the numbers; the Astra rolls out on it about 0.5 NM out | SMM 4.7 (the path); the rollout distance an engineering choice (Q2) | builder |
| Hitbox for collisions | the CT-156's 35 ft | kept; note | collision |

**How the thrust and drag fit is made without turn data (Opus, Phase 1):** the point mass needs thrust ÷ weight and drag ÷ weight. The T-6 fit form is already the one formula (`T/W = thrustK · σ^n ÷ (KTAS + V0)`, `D/W = dragA·KIAS² + dragB·G²/KIAS²`). For the Astra the four constants are worked from standard aerodynamics in `ct102b-performance.js` with the derivation in its comments and its test: `dragA = ½ρ₀(1.688)²·S·CD0 ÷ W`, `dragB = (W/S) ÷ (½ρ₀(1.688)²·π·e·AR)`, and `thrustK, V0` fitted so that `η·550·shp ÷ (V·W)` is matched at two speeds (90 and 180 KIAS) with `n` and the flat-rating height set so power holds to about 10,000 ft (turboprop flat rating, an estimate). The check that it is sane: the full-power climb rate at 100 KIAS comes out near the public 2,100 ft/min, and the 180 KIAS level cruise needs less than full power. No new formula; a new parameter set.

### 3.2 Estimates flagged on screen (rule book: "run with estimates flagged")

- The Astra's aircraft card tooltip and its behaviour tag carry " · est." while any number in its performance set is `estimate: true` (the type and route are in the tooltip today).
- The spawner's Astra route row says "Astra pattern (working numbers)" until Patrick rules or a manual lands.
- The route's name in "Routes on the map" the same.
- One line in the Traffic settings footer: "CT-102B numbers are estimates: see docs/modules/traffic/spec.md 4.19."

---

## 4. Spawns and conflicts

| Feature today | How it extends | Where |
|---|---|---|
| Type list (CT-156 only) | `SPAWN_TYPES = ['CT-156', 'CT-102B']`. Type and Route are tied: the Astra route sets the type and the type picks its route (one source of truth per aircraft: its type says its pattern). | `aircraft.js`, `types.js` |
| Spot buttons per route | The Astra route's tags give its spots: Upwind (climb-out), Crosswind (after the climbing turn), Downwind (abeam the departure end on its line), Perch. From the route's own flown track, as the CT-156's spots are (`SPOT_CHOICES` by tag, not by point number). | `aircraft.js` |
| Advanced: delay, pair, pair gap (20 s) | Unchanged; 20 s at 90 KIAS is about 3,000 ft, more than the 2,000 ft aim. | none |
| Miles back on a rejoin, SI spots | Not for the Astra (it has no rejoin routes). | none |
| PFL from area | Not for the Astra (no Astra glide data). Hidden when the Astra type is picked. | `aircraft.js` |
| Spawn a conflict | Already route-generic (`conflictSpawnPlan(sim, setup, targetId, routeId, { type })`): select any aircraft of either type, pick the Astra route or a CT-156 route, and it finds the start that meets the selected aircraft inside 500/500 ft within 3 minutes, appearing 1 NM from everyone within 1,000 ft of its height. **Both directions come free**: a CT-156 selected and the Astra route picked spawns an Astra timed to meet it (a CT-156 final turn against an Astra downwind, Finding 2, is exactly what it will find); an Astra selected and the OHB Rejoin picked spawns a CT-156 timed to cross the Astra's pattern. The only change: pass the route's type, and the plan's "met in N s" message names the type. | `scenario-timing.js` (type), `aircraft.js` |
| Scenarios (Busy circuit, Random, …) | Unchanged in this plan: all CT-156. A "Mixed circuit" scenario (say three Astras in their pattern with the Busy circuit) is a new scenario and goes on `future.md` unless Patrick moves it up (Q6). `randomStarts` already walks every pattern route, so if the Astra route is in the setup, **Random would put CT-156s on the Astra pattern** unless filtered by type: Phase 3 filters `randomStarts` to routes of the scenario's type. | `setup-panel.js` |
| Remove, Clear finished, More | Unchanged. | none |

**Conflicts and alerts with two patterns and two speeds:**
- Conflict and caution readouts (`sim.state().conflicts`) are plain distance tests between any two flying aircraft: nothing to change.
- `deconflict.js` `freeze` predicts each aircraft along its own path at its own ground speed, so a 90 KIAS Astra and a 220 KIAS CT-156 are predicted correctly as is. `standingOf` reads phase names, which the Astra builder shares (`climb_out`, `inner_downwind`, `final_turn`, `final`; there is no Astra `initial` or `break`).
- Right of way: the existing rows apply where they match (an aircraft on final over one about to perch, straight-in rules, PFL first). Between an Astra on downwind and a CT-156 above it there is no row, so "higher moves" picks the CT-156. Between an Astra and a CT-156 both climbing out, "higher moves" too. Patrick's answer to Q4 decides whether a cross-type row is added (for example, "the type whose pattern the other is crossing has right of way", or "the slower aircraft has right of way").
- Moves an Astra can be given: `go_around` (its own builder), `flinch`/`bank_away` (the side step, type-neutral), `extend_downwind` (its own builder). `breakout`, `move_over` (straight-in only), `fly_through` and `climb_breakout` are CT-156 moves and are not given to an Astra: `decide` leaves such a decision to the other aircraft, or the Astra flinches. Written into the deconfliction's `CAN_MOVE` by type in Phase 4.
- Spacing on final counts both types as leaders and followers (section 1, `spacingTick`).

---

## 5. The 3D model

**Until the model is delivered (Phase 3, Sonnet):** the ui-kit stand-in (`createStandInMesh`, kind `generic`: slim fuselage, straight wing, T-tail; the Astra really has a low tail and winglets, close enough for a fallback) drawn at the type's `lengthFt` (27.62 ft) instead of the T-6's 33.4 ft, in the Astra colour `#ffcc66` already in `types.js`. `planeFor` passes `lengthFt × (type.lengthFt ÷ T6_LENGTH_FT)` to `applyPose`. The ejection seat and parachute are not needed (no Astra PFL).

**What the app needs from the delivery (shared plan Step 3c item 6, the CT-156's delivery rules in Step 3b items 3.4, 6 and 7):**
1. Two glTF files, High and Performance, Meshopt-compressed, in `public/models/ct102b-*.glb`, built from the master file by one command, with the validator clean and a delivery sheet.
2. Real feet, the same frame and datum convention as the CT-156 delivery (exported Z-up, nose forward along the same axis), so `applyPose` and `loadParts` (`ct156-blender.js`) read it without a special case. The sheet states the datum point (spinner tip or the CT-156's convention) and the size check against `sources.md` P2 (27.62 ft, 33.83 ft, 8.66 ft).
3. Parts as top-level nodes read by material name, as the CT-156's are, with these named: `prop` (axis for the blur disc), `gear_nose`, `gear_main_l`, `gear_main_r` (the nose leg retracts aft and the mains inward, sources.md P6; gear down in the pattern below the gear speed, up otherwise, by the Astra's gear rule when Patrick gives it), `flap_l`, `flap_r`, `aileron_l`, `aileron_r`, `elevator`, `rudder`, `canopy` (slides aft on the ground, not in flight).
4. Named points: `eye_left`, `eye_right` (side-by-side seats) for the card's camera button and Cockpit view, and the reference datum.
5. A Performance budget like the CT-156's (outside under about 10,000 triangles).
6. Paint: the RCAF scheme is in the model (sources.md row D7); the app's "Paint" setting (Harvard or ship colours) applies to the CT-156 only, so the Astra ignores it.
7. Fallback (ALL-38 (4)): if the file fails to load, the stand-in above shows; the 3D view never stops.

App side: `src/ui-kit/ct102b-blender.js` mirroring `ct156-blender.js` (the file list and part names; shared `loadParts`), `models.ct102b` in `view3d.js` `planeFor`, `modelKindFor('CT-102B') → 'ct102b'`. Any instruments for an Astra cockpit are out of scope.

---

## 6. Phases (each a pull request)

Rule-book lines every phase carries: one test at most, pilot-recognisable, no tight time gates, expected values from standard aerodynamics, Patrick's rulings or public data (never V6 or the code's own output), shared margins (±10 kt, ±100 ft, ±5°, ±0.5 G) unless a reason is given, physics never changed to pass a test, published limits never walls, nothing skipped to get green, CI the one check, every status says what is unseen. Each PR title: version and module first ("V2.4xx Traffic: …").

### Phase 0. Docs and Patrick's answers (Sonnet, medium)
- **Goal:** the Astra pattern settled in writing before code (rule book: "write it down first"). Spec section 4.19 "CT-102B Astra II pattern" (the geometry of section 2, the numbers table of 3.1, the estimate flags of 3.2, the spawn and conflict rules of section 4, failure behaviour: a missing Astra route or a failed model load never stops the sim or the 3D view); requirements TR-R35 to TR-R38 (an Astra flies its own pattern at its own numbers; the CT-156's flying does not change; spawn and conflict features extend to the Astra; estimates shown); decisions TR-15x for Q1 to Q5 as answered; `future.md` rows for what is left out (Astra PFL, closed pattern, breakout, SI, Randomize, Mixed scenario, Astra hitbox, cockpit instruments); `testing.md` rows for the new tests.
- **Touches:** `docs/modules/traffic/spec.md`, `requirements.md`, `decisions.md`, `plan.md` (Step 5c items 2 on), `future.md`, `testing.md`, `docs/PLAN.md` waiting list. **Must not touch:** any `src/`.
- **Needs from Patrick first:** Q1, Q2, Q3 (the flying), Q5 (words). Q4 and Q6 can come later (Phases 4 and 3).
- **Test:** none (docs).
- **Check on screen:** none.

### Phase 1. The performance set as data, the T-6 unchanged (Opus, high thinking: flight maths)
- **Goal:** `src/core/aircraft-performance.js` (`makePerformance`), `t6-performance.js` re-exporting the T-6 instance under every present name, `src/core/ct102b-performance.js` with the Astra set and derivation (3.1), `envelope.js` `gateRoll(…, perf)` with the T-6 default, `types.js` profiles with `perf`, `patternRouteId`, `lengthFt`, `modelKind`, `tagWord`; `sim.js` and `map2d.js` read `types.js` colours. The flight-math list gains the factory's line. Nothing flies differently.
- **Touches:** `src/core/aircraft-performance.js` (new), `src/core/ct102b-performance.js` (new), `src/core/t6-performance.js` (re-exports only), `src/modules/traffic/envelope.js`, `types.js`, `sim.js` (colour table only), `map2d.js` (colour table only), `docs/modules/shared/flight-math.md`, `tests/unit/core/`. **Must not touch:** `circuit.js`, `path-follower.js`, any manoeuvre file, any CT-156 test.
- **Needs from Patrick first:** nothing (Q6 can follow; the estimates are flagged in the data).
- **Test (one):** "A 30° level turn at 90 knots is inside the Astra's stall line but at the T-6's": with the Astra set, the G available at 90 KIAS (`(90 ÷ stall)²`, standard aerodynamics, stall 68 KIAS as the working value) is above the 1.15 G a 30° turn needs; with the T-6 set it is about 1.09 G, below it (the T-6's 86 KIAS stall is Patrick's, 30 Sep). Expected values worked in the test from the formula, not read from the code. The existing core tests prove the T-6 numbers did not move.
- **Check on screen:** the Busy circuit looks and flies as before (nothing should change); the version label moves.
- **Guarantee for the CT-156:** every T-6 export keeps its name and value; CI's core tests pin them.

### Phase 2a. Pure move: the final approach and flare callable on its own (Opus, medium)
- **Goal:** lift lines 778-815 of `circuit.js` `flyInner` (the final: glide to the aim point, speed from the final-turn speed to the threshold speed, the flare cubic, the threshold and touchdown points) into an exported `flyFinal(pilot, ctx)` that `flyInner` calls, with the speeds passed in (today's `CIRCUIT` values by the CT-156 caller) and `settleFinalOnCentre` exported. Zero change to any flown number.
- **Touches:** `circuit.js` only. **Must not touch:** anything else.
- **Needs from Patrick first:** nothing (a pure move).
- **Test (one):** none new. The proof is the trace: the executor builds Pattern 1 before and after in calm, 15 kt from 260°M and 25 kt from 210°M and reports the largest difference in any point (expected: none to the foot and the tenth of a knot); the existing `plausibility`, `vector-sim` and `smooth-transitions` tests are the CI check. (A trace comparison is a build check, not a test, so it is not added to CI.)
- **Check on screen:** a CT-156 lands as before.

### Phase 2b. The Astra flies its pattern (Opus, high thinking)
- **Goal:** `astra-circuit.js` (`buildAstraCircuit`, `buildAstraGoAround`, `buildAstraExtendedDownwind`) on `makePilot` with `perf` and the pattern numbers; the Astra route in `moose-jaw.json` (`PAT_ASTRA`, `kind: 'pattern'`, `type: 'CT-102B'`, `flown: 'ct102b-circuit'`, points: threshold, departure end, downwind line A and B about 2,700 ft out, nominal perch, window; visible per Q5); `route.js` dispatch on `route.flown`; `makePilot` reads `start.perf`; `path-follower.js` passes `a.perf` to `gateRoll` and `attitudeDegFromClimb`; `profile.js` allowlist admits `type` and `flown`. The Astra is not yet offered on screen (Phase 3), so nothing changes for the user except the hidden route row.
- **Touches:** `astra-circuit.js` (new), `data/moose-jaw.json` (add a route; PAT1, ENT1, ENT2 untouched), `route.js`, `circuit.js` (`makePilot` `start.perf`, `accelFor`/`idleDecel`/`powerClimb` reading `pilot.s.perf`: defaults equal today), `path-follower.js` (pass `perf`), `profile.js`, `tests/unit/traffic/astra-circuit.test.js` (new). **Must not touch:** `sim.js` lap logic, manoeuvre files, any CT-156 test.
- **Needs from Patrick first:** Q1, Q2, Q3.
- **Test (one):** "An Astra flown round its pattern lands on the runway, inside the CT-156's pattern": in calm air and in 15 kt from 260°M, the built track (a) touches down on 29L between the threshold and the first third (TR-47's spirit; the touchdown tag within the runway's width of the centreline), (b) never climbs above 3,000 ft + 100, (c) banks no more than 30° + 5° anywhere, (d) at every point of its downwind lies closer to the centreline than the CT-156's inner downwind at the same along-runway position and 500 ft ± 100 below it (built by `buildCircuit` in the same wind, read as the reference line, not as an expected number), (e) crosses the threshold at 90 ± 10 KIAS, (f) is finite and has no step bigger than its own movement in one record (TP4). Expected values: Dad's and Patrick's working numbers and the shared margins; the CT-156 track is a geometric reference, not a pinned output. A safety stop of 20,000 pilot steps (`MAX_STEPS`) with the reason.
- **Check on screen:** none yet beyond the hidden row; Patrick can tick "Astra pattern" in Routes on the map and see the line sit inside the overhead break's.

### Phase 3. Astras in the sim and on the screen (Opus for `sim.js`; Sonnet for `aircraft.js`, `behaviour.js`, `view3d.js`; one PR or two, the executor's call)
- **Goal:** `patternFor(a)` in `sim.js` and the per-aircraft `PAT1` substitutions (section 1); Astra take-off, touch-and-go, full stop and taxi-in, go-around (its builder), spacing on final for Astra followers; the spawner offers CT-102B with its route and spots, hides PFL from area and the rejoin boxes for it; the card hides Manoeuvres for an Astra and keeps Landing behaviour and Remove; the tag word per type; the estimate flags of 3.2; `randomStarts` filtered by type; the stand-in drawn at 27.6 ft in 3D.
- **Touches:** `sim.js`, `aircraft.js`, `behaviour.js`, `setup-panel.js` (type filter), `view3d.js` (`planeFor` scale), `scenario-timing.js` (`type` from the route), `traffic.css` if needed, `tests/unit/traffic/`. **Must not touch:** `circuit.js`, manoeuvre files, `deconflict.js` (Phase 4), any CT-156 test.
- **Needs from Patrick first:** Q5 (words and default); Q6 if a Mixed scenario is wanted (else it stays on `future.md`).
- **Test (one):** "An Astra and a CT-156 land in turn with spacing": a CT-156 at Pattern 1's perch and an Astra on its downwind abeam the departure end, default wind, deconfliction on; both land on 29L (touchdown tag reached, within the runway width), and when the second crosses the threshold the first is at least 2,000 ft ahead or already climbing away (TR-R18, the Flying Orders' day minimum), with a generous safety stop of 10 minutes (ten times a lap) and the reason beside it. Found by event, never by the second.
- **Check on screen (Patrick or anyone, from the default start):** spawn an Astra at Downwind; it accelerates to 180, slows to 90 by the perch, turns final at about 30°, lands and goes round again; its line sits inside the overhead break's; tick its row off and the line hides while it flies on; its card shows Landing behaviour and no Manoeuvres; its tag reads Patrick's word with " · est."; in 3D it is a smaller yellow aircraft; no caution flickers between an Astra on downwind and a CT-156 on the inner downwind above it (Finding 3); nothing about the CT-156s has changed.

### Phase 4. Conflicts across the two patterns (Opus, high thinking)
- **Goal:** Spawn a conflict names the type and works from either type onto either route (it mostly does; check and fix the type passing and the message); the deconfliction's moves by type (`CAN_MOVE` and the move table: an Astra gets go-around, flinch or extend, never the CT-156 breakout or move-over); Patrick's cross-type right-of-way row if he gives one (Q4); the upwind overtake case (Finding 4) handled by whatever Q4 says.
- **Touches:** `deconflict.js`, `sim.js` (`deconflictTick` move dispatch), `scenario-timing.js`, `aircraft.js` (message), `tests/unit/traffic/deconflict.test.js` (one case added). **Must not touch:** `circuit.js`, `astra-circuit.js` numbers, any CT-156 case in the test file.
- **Needs from Patrick first:** Q4.
- **Test (one):** "A conflict spawned across the patterns is found, and with deconfliction on nobody gets inside the red": with a CT-156 on initial selected and the Astra route picked, `conflictSpawnPlan` returns a start that brings the two inside 500/500 ft within 3 minutes with deconfliction off (the plan's own promise, checked by flying it; the 3 minutes is the feature's own look-ahead, not a gate); the same two with deconfliction on never come inside 200/200 ft and both land or rejoin (safety stop 10 minutes with the reason).
- **Check on screen:** Spawn a conflict both ways; watch who gives way and whether it looks right to a pilot; does either go red.

### Phase 5. The Astra model in 3D (Sonnet, medium; after the delivery, shared plan Step 3c item 6)
- **Goal:** `src/ui-kit/ct102b-blender.js`, `models.ct102b` in `view3d.js`, the hinges driven (gear by the Astra's gear rule, flaps by configuration, prop blur, control surfaces as the CT-156's are), the eye points for the camera button; stand-in fallback kept.
- **Touches:** `src/ui-kit/ct102b-blender.js` (new), `view3d.js`, `public/models/ct102b-*`. **Must not touch:** any flying file.
- **Needs from Patrick first:** nothing beyond the delivery; he sees it on screen.
- **Test:** none (drawing; the rule book says no more 3D tests in a module still being built).
- **Check on screen:** Astra drawn at the right size beside a CT-156 (27.6 against 33.4 ft long, about the same span); gear up on downwind and down from the perch; from its left seat the runway is ahead on final; the stand-in appears if the file is renamed away.

### Phase 6. Sign-off lines and docs truth (Sonnet)
- **Goal:** `testing.md` hands-on lines for the Astra; `README.md` and `spec.md` section 8 file lists; `plan.md` Step 5c ticked with versions; every "unseen" listed for Patrick.
- **Touches:** docs only.

---

## 7. Open questions for Patrick (one at a time; his own idea is always an option)

**Q1. The Astra's turns at 180 KIAS and 30° do not fit inside the CT-156 pattern (5,400 ft radius). Where is the 180 flown?**
- (a) **180 KIAS on the straight downwind only**: the climbing turn onto downwind and the perch turn are flown slow (about 90 to 100 KIAS) at 30°, the Astra accelerates to 180 once wings level and powers back to 90 by the perch. The downwind then sits about 2,700 ft out, inside the CT-156's. **Recommended**: it keeps all three of your numbers and the physics.
- (b) An overhead-style pattern like the CT-156's: initial at 180, a break that slows before the bank settles. Needs a break at more than 30° or a slow-down first; a different pattern to build.
- (c) Keep 180 in the turns and let the pattern sit where it falls (about 1.8 NM across, outside the CT-156's inner downwind and on its outer downwind). Not "inside".
- (d) Your idea.

**Q2. Where does the Astra perch and roll out?** The CT-156's final turn comes down through 3,000 ft about where an Astra downwind at 3,000 would run (about 2,700 ft out, abeam ¾ to 1¼ NM short of the threshold).
- (a) **Perch about abeam 0.3 NM short of the threshold, roll out on the 3° path about 0.5 NM out**, inside the CT-156's ¾ NM window; the Astra downwind then ends before the CT-156 final-turn region, and the two types share final from 0.5 NM in, sequenced by the spacing rule. **Recommended.** Note: the two downwinds are then 500 ft apart vertically with no spare against the 500 ft caution.
- (b) Perch and window as the CT-156's (¾ NM): the Astra downwind runs under the CT-156 final turn at the same height: a red conflict by design each time a CT-156 turns final with an Astra there.
- (c) A lower Astra pattern (for spare below the CT-156's final turn), for example 2,800 ft MSL (about 900 ft above the field).
- (d) Your idea.

**Q3. The Astra's climb speed and the climbing turn onto downwind.**
- (a) **About 100 KIAS climb; the turn onto downwind at 30° held at 90 to 100 KIAS** (so its 2R of 2,700 to 3,350 ft matches the downwind), an estimate labelled as such until a Grob number comes. **Recommended.**
- (b) A steeper climbing turn (45°) at a higher climb speed (about 110 to 120 KIAS), 30° kept only for the perch turn.
- (c) Your number for the Grob's climb speed, from your knowledge or Dad's.

**Q4. Right of way between the two types.** Today, with no rule, the higher aircraft moves, so a CT-156 500 ft above an Astra would give way every time; and on the upwind a CT-156 climbing at 180 overtakes an Astra climbing at 100 near the departure end.
- (a) **The existing rules where they apply (the aircraft on final or past its perch has right of way; before the perch the one turning in extends or breaks out), and for the rest: the aircraft established in its own pattern at its own height has right of way, the one crossing or climbing through it gives way** (so the CT-156 climbing through 3,000 on the upwind, or descending through it in the final turn before its perch, gives way; an Astra joining or going around gives way to a CT-156 established). **Recommended**, as it reuses the perch-as-point-of-no-return rule.
- (b) The slower type has right of way, always.
- (c) Leave "higher moves" as it is and watch what happens.
- (d) Your idea.

**Q5. Screen words and the toggle's start.**
- (a) **The Astra route row "Astra pattern", hidden at first like the SI Rejoin and SI pattern (no new lines on the opening picture; TR-R2 unchanged), the tag word `[ASTRA]`, and " · est." on its card while any number is an estimate.** **Recommended.**
- (b) Shown at first.
- (c) Your words.

**Q6. Where the Astra's numbers come from, and a Mixed scenario.**
- (a) **Public fact-sheet and type-certificate figures as working values, each flagged "estimate" on screen until a Grob manual is in the project files or you rule on it; no Mixed scenario yet (future list).** **Recommended.**
- (b) Your rulings now for climb speed, stall speeds and flap/gear speeds; a "Mixed circuit" scenario added to the Scenario drop-down (a new scenario, so it would be a plan item).
- (c) Wait for a manual before Phase 2b.

---

## 8. Risks

1. **The envelope gate** (`envelope.js`) caps every bank at the T-6's stall line: an Astra at 90 KIAS would be held to 24° and never make its 30° perch turn. Phase 1 fixes it; the Phase 2b test would fail on (c) or on landing if it were missed. Never fix it by changing the T-6's stall speed.
2. **Twelve `PAT1` lookups in `sim.js`** and PAT1 special cases in `route.js`: a missed one sends an Astra onto the CT-156 pattern (it would then be flown at the CT-156's speeds by the follower). The Phase 3 test (both land, in turn) catches the common ones; the executor lists each substitution in the PR.
3. **500 ft vertical with no spare** between the downwinds (Finding 3): caution flicker on screen. Not a flying fault, but Patrick will see it. The limits are his to change, not the plan's.
4. **"Higher moves"** makes the CT-156 give way to Astras in every unruled meeting until Q4 is answered; Phase 4 waits for it.
5. **Thrust and drag from first principles** (no Astra turn data): the climb rate and the slow-down from 180 to 90 on downwind are estimates; if the Astra cannot slow enough by the perch, the builder extends the slow-down (powers back earlier), never the physics. If it still cannot, stop and ask Patrick (two failed fixes rule).
6. **Three colour tables** today (`types.js`, `sim.js`, `map2d.js`) and `sim.spawn` rejecting `'CT-102B'`: Phase 1 makes one.
7. **Spawn a conflict already crosses patterns**, so once the Astra route exists a CT-156 can be spawned onto the Astra pattern through the Route list unless Type and Route are tied (Phase 3 does that); until Phase 3 the route row is hidden and the Astra type is not offered.
8. **Drawn pitch and the tag's configuration** for the Astra use T-6 angle-of-attack and gear-speed numbers until its own are known: display only, flagged.
9. **The Astra model's frame**: if the delivery's datum or axis differs from the CT-156's, `applyPose` draws it off or facing wrong; the delivery sheet must state them (section 5).
10. **Nothing here has been seen on screen**; every phase's check is unseen until Patrick or Dad runs it.

## 9. Out of scope (goes on `future.md` in Phase 0)

Astra PFL and engine failure (no glide data), Astra closed pattern and High Key, Astra breakout and the 4,500 ft rejoin, Astra straight-in and SI pattern, Randomize behaviour for Astras, a Mixed circuit scenario (unless Q6 (b)), an Astra hitbox, Astra cockpit instruments, Runway 11R, Southport (where the Astra really flies).

## 10. What I was unsure of

- Whether Dad meant an overhead-style pattern (initial at 180, a break) or a plain circuit: the physics says only a circuit with slow turns fits inside at 30°; Q1 settles it.
- The Astra's real numbers: I have only public fact-sheet figures quoted through search summaries (the sources table says the pages were blocked), so climb speed, stall speeds and power are estimates until someone opens the pages or a manual arrives.
- Where the CT-156's final turn really is at 3,000 ft: read off the route points and the eased descent in `flyInner`; the Phase 2b test reads the built track instead of my arithmetic.
- The size ratio depends on which CT-156 pattern it is measured against (inner 0.75, outer about 0.2 to 0.4); both are reported.
