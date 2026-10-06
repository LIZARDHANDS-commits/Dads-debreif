# Traffic Sim: automatic deconfliction (design on paper)

Written 4 Oct 2026 for Patrick. Paper only: nothing in the repo was changed, nothing was built, no test was run. Code read at `e1111bb` (main with the Turn Fight split, #271, in it). Manual references are page or paragraph only, never manual text: "SMM 4.28 para 67" is the section and paragraph the way `manuals/README.md` cites them, with the split-PDF page where it helps ("part 2 p.26"). "WFO" is the 15 Wing Flying Orders AL 6.2. The CFAFM was not opened.

---

## Read this first (the short version)

**What it is.** Two layers, as Patrick said (11:06Z and 11:07Z):

1. **Layer 1, by the book.** About 25 s before two aircraft would get inside the caution distance, work out who has right of way from the Flying Orders and the SMM. The other aircraft does the manual's move: break out, fly through, or move over between the runways.
2. **Layer 2, by skill.** If a red conflict (inside 200 ft lateral and 200 ft vertical) is still coming within about 10 s, because no rule fitted or the move was not enough, the aircraft hands over from the path follower to physics flight, flinches (a quick out-of-plane move, the Turn Fight idea), and then goes into a breakout.

**Shared helper in `src/core`: yes, a small one.** Only the pure maths (closest approach, "is a conflict about to happen", "which way out of the way") goes into core; the moves, the right-of-way table and the numbers stay in each module. It must be sequenced: Turn Fight's PR 3 is already turning its avoidance into a pure helper, so that file should be born in `src/core/` in that PR (one writer), and Traffic imports it afterwards. Interface in section 3. This needs the coordinator, and a line in `docs/DECISIONS.md` because it touches two modules.

**What Traffic must do differently from Turn Fight.** Turn Fight's avoidance only exists inside pursuit, so jets that never start a chase (Auto) collide at 66 s. Traffic runs its check once per decision tick for every aircraft, in every mode (rail, physics, blending, PFL, go-around), before any mover, and it predicts along the aircraft's planned path, not in a straight line. Section 1.3 lists all seven lessons.

**Where it sits in the plan.** After refactor PR 4 (High Key from anywhere, closed pattern, go-around and breakout on one climbing-turn controller), because the flinch and the breakout reuse that controller. Build in three small steps: watch only, then Layer 1, then Layer 2 (section 8).

**Waiting on Patrick:** the nine questions in section 7, one at a time. The three that change the flying most are Q1 (who yields at the perch), Q2 (how early and how close) and Q3 (what follows the flinch).

**Not verified:** all numbers marked "estimate" (the 25 s, 10 s and 5 s especially) come from my own calculations, not a manual. Nothing was flown in Node or in a browser. Cost per step is not measured. See section 9.

---

## 1. How Turn Fight does it today

### 1.1 The pieces (all under `src/modules/turn-fight/energy/`)

| Piece | Where | What it does | Worth copying? |
|---|---|---|---|
| Closest approach (TCPA) | `moves/pursuit.js:106-130` | Closed form in 3D from the two positions and velocities: time to closest point and the miss distance. If the range is not closing it says "not closing" | **The maths, yes.** It is straight-line only, so Traffic uses it for aircraft with no known path and predicts along the path for the rest |
| Danger test | `moves/pursuit.js:152-160` | Danger if closing and (within 3.5 s and miss under 120 ft), or closing and range under 600 ft, or already avoiding and range under 800 ft | **The shape, yes:** "soon and close", "very close", and "stay avoiding until clear" (hysteresis, so it does not chatter). Not the numbers |
| The flinch | `moves/pursuit.js:178-197`, plus `turnPlaneNormal` at `:137-146` | The aim point is pushed 85 ft out of the other jet's turn plane (`DECONFLICTION_OFFSET_FT`, `setup.js:14`). The jet goes to the side it is already on, and ties are broken by colour, so the two jets go opposite ways without talking. A floor keeps the aim above the deck (`:196-197`) | **The idea, yes:** move the aim out of the plane, pick the side by where you already are, opposite sides for the two aircraft, never into the floor. Not the 85 ft (a 35 ft hitbox needs far less than a pattern needs) |
| Look-ahead dry runs | `lookahead.js:61-93` and `:194-340`; the copies are `structuredClone` at `:62` and `:214` | Flies a copy of the whole fight forward with the real step, tries each candidate move, picks one | **The idea, yes** (try the move on a copy before committing). Not as built: it judges only "who gets the nose on" (`:77-83`, `:253-265`), copies the whole fight, and the review measured 0.2 to 1 s to build and 50 to 100 ms per re-pick (`turn-fight-review/traces.md`, Compute) |
| Mid-air collision | `judge.js:161-215` | 35 ft hitbox, then a ballistic tumble | No tumble in Traffic. The closest approach per pair is worth recording for the checks |
| The switch | `setup.js:71`, `layout.js:221` | "Collision avoidance" tick box | Yes, a setting that turns it off so Patrick can compare |

### 1.2 Why Auto jets still collide at about 66 s (the pursuit-only bug)

From the review (`turn-fight-review/review.md` section 4 item 4, `traces.md`, `keep-list.md:22`), checked against the code:

1. The danger test lives inside `aimPoint`. `aimPoint` is called from only two places: `controlPursuit` (`pursuit.js:224`) and `readAims` (`fight.js:142-148`), and `readAims` skips every jet that is not in pursuit. The other seven controllers (MPT, pitch back, slice, Immelmann, split S, the yo-yos; `moves/index.js:90-100`) never call it.
2. A jet only enters pursuit on a nose-on (`pilot.js:225-248`). In the Auto run both jets sit in the MPT for 46 s; Red gets nose-on at 65.9 s and they collide 0.4 s later (`traces.md`). At that closing speed 0.4 s is about 200 ft, too late for any sidestep.
3. Turning avoidance off changes nothing in that run, 66.3 s either way (`keep-list.md:22`).
4. The look-ahead never checks for a collision, so Tactical can pick a move that merges (point 3 of the table above).

Two smaller faults in the same code, both easy to repeat by accident:

- The numbers disagree. Decision TF-54 and the exported constants say 0.5 to 1.5 s and 75 ft (`setup.js:11-13`, `decisions.md:66`), but the code uses 3.5 s, 120 ft, 600 ft and 800 ft (`pursuit.js:159`). `TCPA_GATE_MIN_SEC`, `TCPA_GATE_MAX_SEC` and `TCPA_MISS_GATE_FT` are not used by any code.
- A check that changes state. `aimPoint` sets `ac.deconflicting` (`pursuit.js:179`, `:199`) and is also called just to draw the aim (`fight.js:145`), so drawing the screen can change the flag.

The Turn Fight thread is fixing the first part in its PR 3 ("avoidance in every move", `refactor-wording.md`). Traffic must not wait for that and must not copy the bug.

### 1.3 What Traffic does differently

1. **One check for everyone, in every mode.** It runs once per decision tick, before any mover, over all flying aircraft: on the rail, in the physics modes, in a PFL, a go-around or a High Key climb. It is not inside any one controller.
2. **It starts from the aircraft's own path.** Most Traffic aircraft are on a known path (the circuit, an entry, a flown go-around or PFL). Their future positions are read from the path, so the prediction is right through the break, where a straight-line guess is wrong (60° bank, about 2,700 ft radius at 220 KIAS, by my calculation). Straight-line extrapolation is only for an aircraft with no path, and only for a few seconds.
3. **Try the move on a copy, judge it on separation.** The "would this clear it" test scores the predicted closest approach to every neighbour, never a result such as a nose-on. Only the two aircraft involved are copied, and there is a fixed cap on how many tries a tick may make.
4. **Frozen snapshot.** Everyone's decision is made from a copy of all the states taken at the start of the tick. Turn Fight does this (`fight.js:188`: "both read each other's state from before the step"); Traffic's step does not today, because it moves the aircraft one after another in place (`sim.js:455-490`), so later aircraft see earlier ones already moved.
5. **One table of numbers, each with its source or the word estimate,** in one frozen object, and nothing in the code uses a literal that is not in it.
6. **A pure check.** It returns decisions and changes nothing. Starting a manoeuvre happens in one place in `sim.js`, through the same functions the buttons use.
7. **Judge the cure.** A flinch is tried on a copy first and rejected if it makes a new conflict with a third aircraft (for example climbing into a PFL's High Key airspace).

---

## 2. The Traffic design

### 2.1 The two layers

```
every 0.5 s:  freeze all states -> predict each aircraft 25 s along its path
              -> for each pair: will it get inside the caution distance (500/500 ft)?
        no  -> nothing happens (also: release anything latched once clear)
        yes -> LAYER 1: who has right of way? (table 2.4)
                 a rule fits  -> the aircraft giving way flies the manual's move
                 no rule fits -> wait
              LAYER 2: still going inside the red distance (200/200 ft) within 10 s?
                 (the right-of-way aircraft waits until 5 s)
                 -> flinch (physics), then breakout
```

Layer 1 is planned and calm: the moves are built the same way the go-around and High Key climb are today, a path flown once by the simulated pilot (`circuit.js`) and followed by the path follower. Layer 2 is the skill: it takes over from the path follower and flies live, the way the breakout and closed pattern do now, with a hand-over that has no snap (spec items 13a and 18; the six smooth limits in `smooth-transitions.test.js` apply to every one of these moves).

### 2.2 Order of checks, every decision tick

The tick is every 10 sim steps (0.5 s). Ten divides the 200-step snapshot interval (`sim.js:79`), and the decision is a pure function of the state, so a rewind and replay makes the same decisions.

1. **Freeze.** Copy each flying aircraft's x, y, height, track, ground speed, climb rate, turn rate, bank, phase, tag, route and distance along it, and its latch (below). Anything not `flying`, or with a non-finite number, is left out and counted as "no data" (section 5).
2. **Pair filter.** Drop pairs that cannot meet within the longer horizon: height gap above the caution height plus what the two climb rates could close, or a horizontal range above what the two ground speeds could close. This keeps 200 aircraft affordable; the cap on work per tick is a setting.
3. **Predict** each aircraft's position every second out to 25 s: along its route for any aircraft on one (using the route's own speeds), constant turn rate and climb for 10 s then straight for one with no path.
4. **Find the first entry** into the caution cylinder (500 ft lateral, 500 ft vertical) for each pair. No entry within the horizon means nothing is done. This is what keeps it from acting far out.
5. **Layer 1.** For each pair with an entry within 25 s, work out the situation of each aircraft (section 2.4, one function `standingOf(a)`, keyed on route kind and phase, not on route names) and look the pair up in the table. Decide **once per pair**, not once per aircraft, so both aircraft can never both give way to each other. A give-way aircraft is latched with its manoeuvre.
6. **Dry run (only when the table says "fly through" or "move over").** Build the planned path, predict it against the neighbours, and if it would itself enter the caution distance take the next choice (fly through becomes breakout, section 2.5). Capped number of tries per tick.
7. **Layer 2.** For each pair with an entry into the red cylinder within 10 s (5 s for the aircraft with right of way) and no manoeuvre already clearing it: flinch, then breakout. Both aircraft when no rule fits, opposite sides.
8. **Hysteresis.** A latched pair is released only when the predicted miss is at least 1.2 times the caution distance and the range is opening. A manoeuvre already flying is never restarted.
9. **Apply.** Hand the decisions to `sim.js`, which starts each through the same internal functions the buttons call (`startGoAround`, the breakout command, and the new builders). Nothing else writes the aircraft.

### 2.3 How far ahead, and what "close to happening" means

Patrick: act only when a conflict is close, never far out. Two tests must both be true before anything happens: the aircraft are predicted to get inside a distance, and that is within a time.

| Setting | Default | Why this number | Source |
|---|---|---|---|
| Caution distance (Layer 1 trigger) | 500 ft lateral, 500 ft vertical | Patrick's conflict distances stay as shipped | Patrick, 4 Oct 09:09Z (TR-Q11); `defaults.js:130-133` |
| Conflict distance (Layer 2 trigger, the red) | 200 ft lateral, 200 ft vertical | same | same |
| Layer 1 looks ahead | **25 s** | The manual's moves are slow. A breakout at about 2,400 ft/min (full power, 140 KIAS, 1.56 G, from the core performance fit) takes about 12 s to open 500 ft in height. Add the roll-in and a margin, and 25 s is about the earliest a pilot would act. At a 440 kt head-on closing speed (two aircraft at 220 KIAS) that is about 3 NM, so the caution-distance test is what keeps it from acting on far-off traffic | **Estimate** (my calculation) |
| Layer 2 looks ahead | **10 s** | Opening 500 ft sideways at 60° bank takes about 5 s (lateral acceleration g tan 60° = 56 ft/s², with a 1.8 s roll-in at the shipped roll limits). Add a 2 s recognition delay and a 3 s margin | **Estimate** |
| The aircraft with right of way acts at | **5 s** | Only if the other aircraft has not moved by then (SMM 4.28 para 69: the one with right of way still has to avoid if the other does not) | **Estimate**; rule: SMM 4.28 para 69 (part 2 p.26) |
| Release | miss at least 1.2 times the caution distance and opening | Stops the on-off chatter (Turn Fight's hysteresis idea, `pursuit.js:159`) | **Estimate** |
| Decision tick | 0.5 s (10 steps) | Cheap, and divides the 200-step snapshot interval | Engineering choice |

All of these are settings, in one closed "More" panel, each with a line saying what it is and where the default comes from (same style as Turn Fight's Advanced setup).

### 2.4 Right of way: who gives way

Built from Patrick's list (09:40Z and 09:43Z) and the manuals. One row decides one pair, and the answer is the same whichever aircraft you ask.

| # | Situation | Has right of way | Gives way | What the one giving way does | Source |
|---|---|---|---|---|---|
| R1 | An aircraft joining on an entry line, before it merges, against one already in the pattern | The one in the pattern | The joining aircraft | Breaks out and rejoins on the entry line at pattern height, at least 1 NM out | SMM 4.15 para 35 (part 2 p.14); SMM 4.5 para 8 (p.4); WFO S2 art 401 paras 5-7 (p.4-2); Patrick |
| R2 | An aircraft flying through, against one established on downwind | The one on downwind | The fly-through aircraft | Breaks out: climbs straight ahead above pattern height | WFO S2 art 401 para 9 Note 1 (p.4-2); SMM 4.28 para 67 (p.26) |
| R3 | A PFL, against an overhead aircraft reaching initial where they would meet | The PFL | The overhead aircraft | Flies through: stays at pattern height past the break point, 90° left at the end of the runway, crosswind, outer downwind. If its own fly-through would conflict with traffic on the outer downwind, it breaks out instead (R2) | Patrick, 09:43Z; WFO S2 art 401 para 9 (p.4-2); SMM 4.28 para 67 (p.26) |
| R4 | An aircraft about to perch (start the final turn), against a straight-in established on final | The straight-in | The aircraft about to perch | Breaks out instead of turning | Patrick, 09:40Z; SMM 4.19 para 43, the lookout note before the turn (p.18); SMM 4.5 para 7 (p.3), do not cut off other aircraft |
| R5 | A straight-in, against an aircraft already in the final turn (past the perch), or one who got there by accident | The aircraft in the final turn | The straight-in | Low approach between the runways ("move over"), then a go-around | Patrick, 09:40Z; SMM 4.28 para 68 (p.26), 4.21 paras 50-51 (p.21), 4.22 para 54 (p.22); WFO Annex J p.J-4 |
| R6 | A straight-in, against a PFL | The PFL | The straight-in | Same as R5 | SMM 4.28 para 68 (p.26) |
| R7 | Any other pair: no listed relationship, or equal standing | Nobody | Both, if the red is predicted | Layer 2 only: both flinch, opposite sides | SMM 4.28 para 69 (p.26) |

Notes:

- **R4 and R5 meet at the perch.** Patrick's two lines (an aircraft that would perch into a straight-in breaks out; a straight-in someone perches on by accident goes between the runways) fit together if there is a point of commitment. I propose the perch itself: before it the perching aircraft yields, after it the straight-in yields. SMM 4.28 para 68 gives ATC's priority for final turns over straight-ins and SMM 4.19 para 43 gives the pilot's duty to look first. This is Q1.
- **Two PFLs never meet by rule:** simultaneous PFLs are not allowed (WFO S2 art 403 para 1d, p.4-3), so a PFL against a PFL goes to Layer 2 only. A new PFL being held outside 5 DME until the last is through High Key (art 403 para 1a) is a spawner rule, not part of this.
- **Landing spacing** is 2,000 ft by day (WFO S2 art 404 paras 1-3, p.4-3). It belongs to TR-R18 (extend downwind, Step 5), not to this build. See Q8. (The note under art 404 mentions 3,500 ft for dissimilar groups; I could not square it with the 2,000 ft lines and have not used it. Q8.)
- **A closed pattern pull-up while someone flies through** should not be cleared (WFO S2 art 401 para 9, caution, p.4-2). The same check covers it: the closed pattern's path is predicted like any other.
- **ATC.** The real rules assume a tower that sequences. The sim has none, so the table stands in for what Tower and the pilots would agree. Only what the manuals say is in the table, nothing invented. EFIG, the Gen Book and the 2 CFFTS Orders were searched for right-of-way rules and gave only syllabus lists (EFIG p.51 and p.53 name break out and fly through as taught sequences); I did not read them page by page.
- **Names.** Routes are called PAT1, ENT1 and ENT2 in the data, PAT_INNER, ENT_OHB and ENT_SI in `nav-plans.js`, and the names are still an open question (TR-Q14). `standingOf` must key on route kind and where an entry merges (a merge at point 0 is a straight-in), never on a name.

### 2.5 The manoeuvres, and what already exists

| Move | What it is | Reuse |
|---|---|---|
| **Breakout** (R1, R4, and the end of every flinch) | Immediate climbing turn to 4,500 ft, 2 NM south of the pattern and clear of the rejoin lines, rejoin on the entry line at pattern height at least 1 NM out (TR-R34; WFO S2 art 401 paras 5-7; SMM 4.23 para 55, part 2 p.23) | The existing flown breakout (`breakout.js`, the `breakout` command). After PR 4 it flies on the one climbing-turn controller. Needed: the sim can start it, and the rejoin line is a parameter (today the code is built round ENT1 only: `breakout.js:36-45`), so straight-in traffic can rejoin as a straight-in (Q7) |
| **Flinch** (Layer 2) | A short physics move out of the plane of the near-miss, then hand over to the breakout. Aim point moved out of the plane by one caution distance (500 ft) from where the aircraft would have been, flown at the real bank and G with the roll eased (up to 90°/s, never an instant snap). Vertical is tried first, for an aircraft free to climb. The aircraft below, or one that must stay level, banks away instead. The side is chosen by where each aircraft already is, ties by callsign order, so the two go opposite ways. A PFL only banks, never zooms. Never beyond the physical limits: stall line (`stallLimitG`), ground | New, small. It is the climbing-turn controller of PR 4 with its aim point moved out of the plane: the Turn Fight idea ported as it stands, a displaced aim point, not a new controller. Hand-over from the path follower with place, track, bank, roll rate and climb rate carried (`startGoAround` and `buildHighKeyClimb` already do this "flown from where it is") |
| **Fly-through** (R3, then R2's breakout if needed) | Stay at pattern height and 220 KIAS past the break point, straight ahead along the runway track, 90° left at the end of the runway (60° bank, SMM 4.14 para 33), crosswind, then the outer downwind and the normal circuit again | `flyOuter` in `circuit.js:321-425` already flies the outer pattern from any start state (that is how the go-around is built). Add one stage, "hold the centreline to the departure end, then turn crosswind", beside `buildGoAround` (`circuit.js:306`). The orders say the crosswind turn starts at the departure end (WFO S2 art 401 para 9) |
| **Breakout from a fly-through** | A climb straight ahead above pattern height, then the normal breakout (SMM 4.28 para 67) | The breakout's first stage with no turn until about 500 ft above pattern height (the 500 ft is an **estimate**; the SMM says only "above"). Q4 |
| **Move over** (R5, R6) | Slide to the side between the two runways, low approach at no lower than 200 ft above the ground and no slower than 120 KIAS, then go around, parallel to the runway, and rejoin the circuit like a take-off (SMM 4.21 paras 50-51, 4.22 paras 52-54) | `buildGoAround` with the centreline shifted toward the inner runway (the pilot already holds a line with `trackForLine`) and a low-approach lead-in. The go-around that follows is today's (spec 4.10) |
| **Extend downwind** | Not in this build (TR-R18, Step 5). SMM 4.17 para 41 (p.16) and WFO S2 art 401 para 8 | The circuit builder already takes a perch point, so a later perch is a variant of `flyInner`, but the final-turn height profile would need work; that is for TR-R18's own design |

**Where the aircraft is flown from.** All of these start "from where it is", with the same place, track, bank, roll rate, climb rate and speed, so they pass the six smooth-transition limits. The old 1 s blend (`BLEND_DURATION_SEC`, `tick-aircraft.js:33`) is not used by new code.

**What happens after a flinch if nothing else is wrong.** The flinch always hands to the breakout (Patrick's words), except on final and in a PFL (Q3).

**Moose Jaw's inner runway.** "Between the runways" needs the gap between 29L and 29R. The 3D scenery puts 29R about 1,000 ft north of 29L (`airfield-core-ground.js:410-415`), which is a drawing estimate, not a manual figure. Half of it (about 500 ft) is the offset used, marked as an estimate (Q5). No traffic is simulated on the inner runway; the move-over assumes none.

### 2.6 What the screen shows

Nothing moves or disappears except one line of text. A small tag beside an aircraft says what the software is doing, in pilot words, like the PFL tag (`getPflBadge`, `map2d.js:362`):

```
A3  CT-156  3,500 ft  220 KIAS   [GIVING WAY: fly-through]
A5  CT-156  3,500 ft  220 KIAS   [GIVING WAY: break out]
A2  CT-156  2,300 ft  120 KIAS   [MOVING OVER: between the runways]
A6  CT-156  3,600 ft  140 KIAS   [EVASIVE: flinch]
A4  CT-156  PFL                  [PFL: Low Key · Gear]   (right of way, unchanged)
```

- The Conflicts list stays as it is (red and yellow with feet apart, TR-R17). A red that still appears despite the software is the honest signal that it could not clear it.
- The footer note "Simplified: aircraft fly their routes at set speeds, no avoiding action." (`layout.js:17`) is replaced. Wording to Patrick before it is written.
- Settings, in one closed "More" panel, all starting on: Automatic deconfliction (the master switch), and one box each for breaking out, flying through, moving over and the skill layer. The old unused settings `ruleFlyThrough`, `ruleMoveOver`, `ruleExtendDownwind`, `ruleBreakAtDepartureEnd`, `ruleClosedPattern` (`defaults.js:141-145`) are the natural homes; the ones for features that are still not built stay hidden (TR-R27).
- Published limits that a move goes past (a breakout level-off, a bank over 45° below the 2,100 ft gate, a low approach under 200 ft) are flagged on the tag, never forbidden. Only the ground, the stall line and the aircraft's own limits are walls.

---

## 3. One shared helper in `src/core`?

**Yes, a small one, later, and only the maths.**

Why: the closest-approach formula exists only in Turn Fight today (`pursuit.js:106-130`); AGENTS.md says never write a second copy of a formula and that shared code lives in the shared folders, and modules never import each other. Both modules need the same three things. They need different things *done* with them, so the moves, the table and the numbers do not move.

**Proposed interface** (name and file for the coordinator to settle; for example `src/core/separation.js`, tests in `tests/unit/core/`, a line in `docs/modules/shared/flight-math.md`). All pure: no state, no globals, every threshold passed in so each module keeps its own numbers. Positions in feet (x east, y north, z up), velocities in ft/s, ground-speed kind.

```
closestApproach(a, b)
  -> { tcpaSec, missFt, closing }            // constant velocity, 3D; Turn Fight's computeTcpa, same maths
firstEntry(a, b, { latFt, vertFt }, horizonSec)
  -> { tSec, latFt, vertFt } | null          // constant velocity, exact for a cylinder:
                                             // a quadratic in the plane, linear in height
firstEntrySampled(trackA, trackB, { latFt, vertFt }, horizonSec, stepSec)
  -> same shape                              // trackX(t) -> { x, y, z }: for planned paths
dangerGate(wasAvoiding, entryOrCpa, { soonSec, missFt, nearFt, releaseFt })
  -> boolean                                 // the three-part test with hysteresis
clearanceSide(a, b, tieBreakKey)
  -> +1 | -1                                 // side out of the plane of relative motion; the two aircraft get opposite signs
```

What stays in each module: Turn Fight's aim-point offset and the 85 ft; Traffic's right-of-way table, the manoeuvres, the horizons and the 500/500 ft cylinder. The cylinder (not a sphere) is Traffic's metric; Turn Fight can pass a very tall cylinder to get its sphere, or keep `closestApproach` for that.

**Sequencing for the coordinator** (I could not see Turn Fight PR 3's real signature; the file names below are a proposal):

1. Turn Fight PR 3 creates the file in `src/core/` with the first two or three functions and their tests, in that PR (one writer per file). Traffic adds `firstEntrySampled` and the cylinder test afterwards, in its own PR.
2. If Turn Fight's PR is late, Traffic's first step (watch only) uses the same function shapes in one file inside the Traffic folder, and the move into core is a small clean-up PR. That is a short-lived second copy and needs the coordinator's yes.
3. Either way, record the decision in `docs/DECISIONS.md` (it affects two modules), and give the Turn Sim thread the heads-up, since it also plans planned paths.

Turn Fight needs nothing from Traffic.

---

## 4. Every number and where it comes from

"Estimate" means no manual or ruling backs it yet; it stays labelled until one does (AGENTS.md).

| Number | Value | Source |
|---|---|---|
| Conflict and caution distances | 200/200 ft and 500/500 ft | Patrick, 4 Oct 09:09Z (TR-Q11); `defaults.js:130-133` |
| Near mid-air collision, for reference only | within 1,000 ft | WFO S1 art 403 para 1 (S1 p.4-2). A reference, not a trigger |
| Landing separation, for reference | 2,000 ft by day | WFO S2 art 404 paras 1-3 (p.4-3); TR-R18; Patrick 01:25Z |
| Right of way, established over joining | no distance | SMM 4.5 para 8 (p.4); SMM 4.15 para 35 (p.14) |
| Downwind over fly-through | no distance | WFO S2 art 401 para 9 Note 1 (p.4-2); SMM 4.28 para 67 (p.26) |
| Final turn over straight-in (ATC priority); straight-in moves over | no distance | SMM 4.28 para 68 (p.26) |
| Right of way holder still avoids if the other does not | no distance | SMM 4.28 para 69 (p.26) |
| Lookout before the final turn for straight-in traffic | no distance | SMM 4.19 para 43 note (p.18) |
| Pattern height, speed | 3,500 ft, 220 KIAS | Patrick (TR-R4); SMM 4.14 para 32 gives 3,000 ft, recorded as a difference |
| Pattern turns | 60° bank | SMM 4.14 para 33 (p.14) |
| Breakout height, place, rejoin | 4,500 ft, 2 NM south, ENT1 line at least 1 NM out | Patrick 01:24Z (TR-R34); WFO S2 art 401 paras 5-7 (p.4-2); SMM 4.23 para 55 (p.23). The orders' 4,000 ft is recorded as a difference |
| Low approach | at least 200 ft above ground, at least 120 KIAS | SMM 4.21 paras 50-51 (p.21). A reference: flagged on screen, not a wall |
| Go-around from final | parallel the runway, watch for traffic | SMM 4.22 para 54 (p.22) |
| Fly-through | pattern height, straight ahead, crosswind at the departure end; 90° left | WFO S2 art 401 para 9 (p.4-2); Patrick 09:43Z |
| Climb at full power, 140 KIAS | about 2,400 ft/min at 1.56 G, 3,500 ft | Core fit (`excessThrustPerWeight`, `T6A_FIT`); my calculation. Climb speeds from SMM 3.14 para 35, EFIG p.126 |
| Roll limit in a manoeuvre | 90°/s peak, eased | Patrick 08:54Z (the most the T-6 is rolled in the sim); the 90°/s² build-up is an **estimate** (`circuit.js:36`) |
| Bank in a lateral flinch | up to 60° while under the stall line | SMM 4.14 para 33 (p.14); stall line from core (`stallLimitG`; stall 86 KIAS, Patrick 30 Sep) |
| Flinch size | one caution distance, 500 ft | **Estimate** (my choice; the number is Patrick's caution distance) |
| Layer 1 horizon, Layer 2 horizon, holder trigger | 25 s, 10 s, 5 s | **Estimate**, section 2.3 |
| Release | 1.2 times the caution distance | **Estimate** |
| Decision tick | 0.5 s | Engineering choice |
| Recognition delay in the 10 s | 2 s | **Estimate** |
| Straight-in commitment point | the perch | **Estimate** of Patrick's two lines; Q1 |
| Runway gap, 29L to 29R | about 1,000 ft; offset about 500 ft | **Estimate**: traced in the 3D scenery (`airfield-core-ground.js:410-415`), not a manual figure. A question for Dad if Patrick agrees |
| Breakout from fly-through: about 500 ft above pattern | 500 ft | **Estimate**; the SMM says only "above the pattern altitude" |
| Aircraft below which a move is flagged | 2,092 ft MSL (200 ft above the 1,892 ft field) | SMM 4.21 para 51 and field height (Patrick, D373). A reference |

My own calculations (not manual figures), from `src/core` run once in Node: 220 KIAS at 3,500 ft is about 232 kt true (391 ft/s); the 60° break radius at that speed is about 2,740 ft; 140 KIAS at 50° bank climbs about 2,440 ft/min; the stall limit is 2.65 G at 140 KIAS and 1.95 G at 120 KIAS. The spec's 2,470 ft break radius (spec 3.6) is from a lower speed; worth reconciling when the spec is refreshed.

---

## 5. When data fails, and which airspeed is meant

**Which speed.** Predictions and closing speeds are **ground speed** (the track and ground speed from the wind triangle, `wind.js`), because separation is about where the aircraft go over the ground; the climb is a vertical speed in ft/s. Manoeuvre targets are **indicated** (the breakout and the climbing turn at 140 KIAS full power; pattern 220 KIAS; low approach 120 KIAS), changed to true with `iasToTasKt` for radius and turn rate, and to ground speed with `windTriangle` for the path. Nothing compares one kind with another. The pair filter uses the highest true airspeed plus the wind, never an indicated number. The screen shows closing speed as "ground speed".

**When data fails** (a safety item, so written into the spec as AGENTS.md asks):

| Failure | What happens |
|---|---|
| An aircraft with a non-finite position, height, track, speed or climb rate | Left out of the check for that tick, counted as "no data", never throws. Every other pair is still checked. The Conflicts list also skips it (it does the same sum). Whatever stopped it moving is the mover's problem, not this code's |
| An aircraft with no route (`routeOf` finds none) | Predicted by extrapolation from its own track, ground speed and climb rate for 10 s, then straight. If that is not possible either, as above |
| A prediction returns nothing finite for a pair | That pair is skipped and shown as "no data"; the red/amber lines still come from the real positions |
| A builder returns no path or a path with a bad point (fly-through, move-over, flinch) | The move is not started; the next choice is tried (fly through becomes breakout, then flinch); if none works the aircraft carries on and the conflict stays on the screen in red |
| The wind is missing | The same default the rest of the sim uses (calm, 360°T) |
| The sim is rewound | The latch and the decision state are plain data on the aircraft record, so they are in the snapshot; the check is a pure function of the state, no random numbers, so the replay decides the same way |
| Any threshold missing or out of range | The default is used and the settings panel says so |

"Fail visible, never silent": if the software cannot act, the red conflict stays on screen. It never pretends a conflict was avoided.

---

## 6. Light checks a pilot would recognise

Written in the style of `docs/TESTING.md`. These are the testing lines from AGENTS.md, copied in full, as every brief must:

- Tests check what a pilot would recognise: things that are always true, and end results (it landed on the runway, it stayed above the deck).
- No tight time gates. A generous, realistic limit is fine, with its reason beside it (a PFL lands within 5 minutes).
- Expected values come from a manual page, standard aerodynamics, Patrick's ruling or real recorded data, never from V6 or from the code's own output.
- Margins use the shared table by default (±10 kt, ±100 ft, ±5°, ±0.5 G); a check may use another margin if it says why. Margins are not requirements and never become rules inside the flight code.
- Never change the flight physics (turn, energy, G, stall or stick-shaker formulas) to make a test pass. If a flight test disagrees, check the test against the manuals and Patrick's practice; if the physics still looks wrong, ask Patrick. A test that fails twice stops the work until Patrick answers.
- Published limits (the G limit, the hard deck, the orders) are flagged on screen, never walls; a test never expects the aircraft to be held at one. Physical limits always hold.
- Never skip, disable or delete a failing test just to get green.
- Keep it light: no mutation, stress or long runs.
- Every status says what is untested or unseen.

**The checks** (each can fail if the behaviour is wrong; each starts from a two- or three-aircraft setup the test builds, with a fixed seed, in calm air and in a 20 kt crosswind):

| # | What a pilot would say | Expected from | Margin or limit |
|---|---|---|---|
| D1 | "Two aircraft on a collision course at the same height never get inside 200 ft and 200 ft." And with the switch off the same two do, so the check can fail | Patrick's conflict distances (09:09Z) | None needed: outside the limit is the result |
| D2 | "Nothing happens far out": two aircraft that never come inside 500/500 ft in 25 s keep their routes for a whole lap; nobody is tagged | Patrick, 09:40Z ("only when close") | A lap is run by event (landing or a second break), with a generous 10 minute stop, since a stuck aircraft is what the stop catches |
| D3 | "The one already in the pattern keeps its track." An aircraft joining on an entry that would conflict is the one that breaks out; the one in the pattern is within ±100 ft of where it flies alone | SMM 4.15 para 35 | ±100 ft |
| D4 | "The PFL keeps its right of way." Same PFL with and without an overhead aircraft at initial lands at the same place, within ±100 ft | Patrick 09:43Z; SMM 4.28 para 67 | ±100 ft |
| D5 | "The overhead aircraft flies through." It stays at pattern height (±100 ft) and on the runway track (±5°) past the break point, turns about 90° left (±5°) at the end of the runway, and flies the outer downwind | WFO S2 art 401 para 9; Patrick 09:43Z | ±100 ft, ±5° |
| D6 | "Downwind has right of way over a fly-through, and the fly-through climbs out." If its fly-through would conflict, it climbs above pattern height, and the downwind aircraft is within ±100 ft of its solo track | WFO S2 art 401 para 9 Note 1; SMM 4.28 para 67 | ±100 ft |
| D7 | "The straight-in moves over between the runways, then goes around; the final turner lands." The straight-in ends its low approach offset toward the inner runway, no lower than 200 ft above the ground unless the screen flags it; the other aircraft lands on the runway | SMM 4.28 para 68, 4.21 para 51, 4.22 para 54 | Offset about 500 ft ±100 ft (an estimate, flagged). Landing by event, 10 minute stop |
| D8 | "Every aircraft that breaks out rejoins and lands or is back in the circuit." | TR-R13, TR-R34 | 10 minutes: a breakout and rejoin is about 3 to 4 minutes and a circuit about 3 more; the limit only catches a lost aircraft |
| D9 | "Two aircraft with no rule between them both flinch, in opposite directions, and stay out of the red; neither pulls more G than its wing gives" | Standard aerodynamics (core `availableG`); ALL-R20 | ±0.5 G |
| D10 | "No jumps": the flinch, the fly-through, the move-over and a deconfliction breakout pass the six smooth-transition limits, added to the manoeuvre list in `smooth-transitions.test.js` | Patrick's card 10:18Z | the six limits already approved |
| D11 | "Exactly one gives way, and the answer is the same whichever aircraft you ask": for any two states, Layer 1 never has both give way; swapping A and B gives the same decision. Property test, a few fixed seeds | Rule table | None |
| D12 | "The order of the list does not matter, and a rewind gives the same picture": reverse the aircraft order, or rewind and replay, and the decisions and the closest approach are the same | ALL-R19 (same setup, same picture) | None |
| D13 | "A broken aircraft does not stop the others": one aircraft with a non-finite position, and one with no route; no error, the other pair is still deconflicted | Section 5 | None |
| D14 | "The switch off means off": with Automatic deconfliction off, no aircraft starts any of these moves | The setting | None |
| D15 | The shared maths: closest approach and cylinder entry checked against a brute-force step through the same two straight tracks, and against hand-worked cases (head-on, crossing, diverging, tail-chase) | Geometry, worked by hand in the test | ±1 ft and ±0.1 s, because the brute force steps at 0.01 s |

Light by design: no long runs, no sweeps. One light check per module at sign-off, as the rule book asks: Patrick's hands-on lines are below, and D1, D5 and D7 are the one light run.

**Hands-on checklist, in Patrick's words (for the sign-off):**

- Press Play at the default start. Does anything happen that was not there before? (Nothing should, unless two really are about to meet.)
- Spawn two on a collision course. Does one of them break out and the other carry on? Does either go red?
- Start a PFL at High Key with an overhead aircraft arriving at initial. Does the overhead aircraft fly through, turn left at the end of the runway and join the outer downwind, while the PFL lands?
- Put a straight-in on final and perch another aircraft on it. Does the straight-in slide between the runways and go around?
- Join on an entry line into traffic. Does the joining aircraft break out and rejoin?
- Switch Automatic deconfliction off. Do the aircraft fly exactly as before?

Unseen until built: all of it. Nothing is flown yet.

---

## 7. Questions for Patrick

Ask one at a time, in this order, each with his own idea as an option. Each has a working answer the tool uses until he says otherwise.

**Q1. Who yields when an aircraft is about to perch and a straight-in is on final?** Your two lines (09:40Z) are both in the SMM, but at different moments.
- (a) The perch is the point of no return: before it the aircraft about to perch breaks out; after it the straight-in moves over between the runways (SMM 4.19 para 43 and SMM 4.28 para 68). **Recommended.**
- (b) The straight-in always moves over (ATC's priority for final turns, SMM 4.28 para 68).
- (c) The aircraft about to perch always breaks out.
- (d) Your own idea.

**Q2. How early and how close does it act?**
- (a) Rules from 25 s out, skill from 10 s (right-of-way aircraft from 5 s); the rules wait until the pair would be inside 500/500 ft, the skill until it would be inside 200/200 ft. **Recommended.** All estimates, in the More panel.
- (b) Tighter: 15 s, 6 s, 3 s.
- (c) Wider: 40 s, 15 s, 8 s.
- (d) Your own numbers or idea.

**Q3. What follows a flinch?**
- (a) Always the breakout (your words), except on final, where it goes around, and a PFL, which only banks away and stays on its circle. **Recommended.**
- (b) Flinch only: when clear, rejoin the path where it is.
- (c) Always the breakout, with no exceptions (a PFL would then be broken out of its glide; not recommended).
- (d) Your own idea.

**Q4. The shape of the breakout from a fly-through.** The SMM says climb straight ahead above pattern height (SMM 4.28 para 67). Your circuit breakout turns to the south (TR-R34).
- (a) Climb straight ahead to about 500 ft above pattern height, then the normal breakout turn to the south and 4,500 ft. **Recommended.** The 500 ft is an estimate.
- (b) The normal breakout turn straight away.
- (c) Straight ahead only, holding the climb, no turn.
- (d) Your own idea.

**Q5. "Between the runways": how far over, and what about the inner runway?** The 3D scenery puts 29R about 1,000 ft north of 29L, so half is about 500 ft. Nothing is simulated on the inner runway.
- (a) 500 ft toward the inner runway, labelled an estimate, assume no inner traffic; add the figure to the questions for Dad. **Recommended.**
- (b) Offset to the runway centre line itself (the SMM says offset to one side, para 51).
- (c) Wait for a chart value before building the move-over.
- (d) Your own idea.

**Q6. Switched on or off at the start?**
- (a) On, with the master switch and a tag on every aircraft it acts on, so you can see it working; switching it off gives today's behaviour. **Recommended.**
- (b) Off until you have seen it work, then default on.
- (c) Your own idea.

**Q7. Where does an aircraft rejoin after a breakout?** Today the breakout code rejoins only on the overhead entry (ENT1).
- (a) The same kind of entry it left: a straight-in rejoins as a straight-in, an overhead as an overhead (SMM 4.5 para 8 and 4.15 para 35 say reposition for another rejoin attempt). **Recommended.**
- (b) Always the overhead entry.
- (c) Your own idea.

**Q8. Is extending downwind (spacing, TR-R18) part of this?** Your list at 09:40Z and the 11:06Z clarification name breakout and move-over only.
- (a) Leave it out. It keeps its own place in Step 5 (TR-R18, 2,000 ft by day), which can use the same helper later. **Recommended.** Also asks which landing separation to use, because the note under WFO S2 art 404 mentions 3,500 ft for the same group.
- (b) Put extend-downwind in now.
- (c) Your own idea.

**Q9. Two aircraft with no right-of-way rule between them (R7): who moves?**
- (a) Both, in opposite directions, like the Turn Fight flinch. **Recommended.**
- (b) Only the one that is behind or lower.
- (c) Your own idea.

---

## 8. Where it sits in the plan (proposed, for Patrick's yes)

Nothing here goes into `plan.md` until he agrees; this is the entry that would move from `future.md` (Patrick, 09:40Z, 09:43Z).

1. **Needs PR 4 first** (High Key from anywhere, closed pattern, go-around and breakout on the one climbing-turn controller), because the flinch and the sim-started breakout use it. Today the breakout still runs through the older physics path and a 1 s blend (`tick-aircraft.js`, `breakout.js`).
2. **D1: watch only.** The decision tick, the frozen snapshot, prediction, the shared maths, the tags and a log of what it would have done. No manoeuvre starts. Patrick sees what it would do from the default start, and the count of times it fires tells us if 25 s and 10 s are sensible.
3. **D2: Layer 1.** The right-of-way table and the breakout, fly-through and move-over builders, with the master switch and the rule boxes.
4. **D3: Layer 2.** The flinch and the hand-over to the breakout.
5. Each step is checked on screen from the default start, with the version label changed and "unseen" listed. Brief for each: Opus, high effort, read AGENTS.md and the Traffic folder first, search for existing flight math first (this design lists what exists), the testing lines in section 6 copied in full.

Files the build would touch: a new `src/modules/traffic/deconflict.js` (pure decisions), `sim.js` (one tick call and one apply function), `circuit.js` (two builders beside `buildGoAround`), `breakout.js` (the rejoin line as a parameter), `map2d.js` and `aircraft.js` (the tag), `defaults.js` and the settings panel, `layout.js` (the footer line), and the shared `src/core` file. Docs: `spec.md`, `requirements.md`, `decisions.md` (next free TR- number), `testing.md`, in the same change as the code.

---

## 9. What I was unsure of or could not source

- **The 25 s, 10 s, 5 s, 0.5 s, 1.2 times, 500 ft flinch, 500 ft above pattern and 500 ft offset are my estimates.** Calculations only. No manual gives them. They should be tuned from D1's log.
- **The right-of-way rules are what the SMM and the Flying Orders say, read by me.** They assume a Tower sequencing traffic. The table is a stand-in for that, and Patrick's two perch lines (R4 and R5) needed my "commitment at the perch" reading to fit together. Q1.
- **Runway gap.** Only the 3D scenery's 1,000 ft, no manual figure, no chart. The inner runway is not simulated.
- **WFO art 404 note on 3,500 ft** against its 2,000 ft lines: not reconciled.
- **Page numbers.** Paragraph numbers are the manual's own. The "p." numbers are the WFO page marks in the text file (S2 p.4-2 holds art 401 paras 5-10; p.4-3 holds art 403 and 404; S1 p.4-2 holds art 403 NMAC) and the split-PDF page for the SMM from `text/smm.txt`. The page headers in the WFO text sit at the top of each page; I read them that way.
- **Turn Fight PR 3's real helper signature** was not visible (it is not on main). The interface in section 3 is Traffic's proposal and must be matched to it.
- **Cost.** The per-tick work for 200 aircraft is not measured. The pair filter and a cap on tries per tick are the safeguard; Turn Fight's own look-ahead dropped frames for the same reason (review, Compute).
- **Rewind of user commands.** I did not check how a button press behaves on a rewind (the code applies spawn and remove as timed events and commands do not look like events). The deconfliction itself is a pure function of the state, so it replays the same way. Worth a look when the checks are written.
- **The default start.** I did not run it, so I do not know whether it already contains pairs that would trigger. D1 (watch only) is how to find out first.
- **Not searched page by page:** EFIG, the Gen Book and the 2 CFFTS Orders (grep found no right-of-way rules in them).
- **Turn Fight line numbers** are from `4a1e3df` (the split); they will move when PR 3 lands.
- **All code and doc claims** are from reading the files. Nothing was run except one small Node sum of core performance functions for section 4.

## Patrick's answers

- Q1 (11:23Z, card): (a) The perch is the point of no return. Before it, the aircraft about to perch breaks out; after it, the straight-in moves over between the runways.
- Q2 (11:23Z, card): (b) Tighter: rules from 15 s, skill from 6 s, right-of-way aircraft from 3 s (distance triggers stay 500/500 ft and 200/200 ft).
- Q3 (11:23Z, card): (a) After the flinch, it breaks out, except on final (go-around) and in a PFL (banks away only, stays on the circle).
- Q4 (11:24Z, card): (a) After a fly-through, it climbs straight ahead to about 500 ft above pattern height (estimate), then flies the normal breakout turn south to 4,500 ft.
- Q5 (11:24Z, card): (a) Move-over slides 500 ft toward the inner runway (estimate); assume no inner traffic; the real 29L/29R gap goes on the questions for Dad.
- Q6 (11:24Z, card): (a) On at the start, with a master switch and a tag on each aircraft it acts on.
- Q7 (11:24Z, card): (a) A breakout rejoins on the same kind of entry it left (straight-in as straight-in, overhead as overhead).
- Q8 (11:24Z, card): (a) Extend-downwind (TR-R18) stays out of this build, in its own step.
- Q9 (11:25Z card "Your idea"; his words 11:25:46Z): "Higher aircraft would move or the one on the right has right of way (except traffic on downwind have right of way over traffic rejoining)". Reading used: the higher aircraft moves; at the same height the aircraft on the right has right of way, so the one on the left moves; downwind traffic always has right of way over rejoining traffic. Patrick confirmed this reading 11:26Z ("That's it").
