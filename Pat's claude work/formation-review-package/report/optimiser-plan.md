# Plan: the follower optimiser (route 1), after the polish

Written 6 Oct 2026 22:05Z for Patrick, from the review (report.md sections 1, 4, 6.4, 7). Nothing here is built. Every number is an estimate unless a manual page or ruling is beside it. Names are the renamed copy's (cone position = fighting wing); the four-ship thread maps them back.

## 0. Where it sits and what must be true first

The optimiser is a **planner**, not a new physics. It takes the same inputs as today's planners (the pair at the press, Lead's recorded flight, the formation asked for) and hands the chooser the same output (a bank/speed/power track to replay). Nothing about replay, the drawn path, the envelope gate or the 4-ship legs changes.

Before starting:
1. The polish of what exists is finished and signed off by you.
2. Refactor steps 1-4 from report.md section 4 are merged: one cone table, one lane rule, one set of core maths, dead code gone, one rejoin law. Reason: the optimiser needs one seed and one set of rules to score against. With four planners it would get four different seeds and four copies of the rules.
3. The flight set (report.md section 4) is recorded on the polished code: end states, times, max G, closest approach, lowest speed for each move. That is the before picture every phase below is checked against.

## 1. The diagram

```
                      PRESS (formation button, Rates, Mode switches)
                                      |
                                      v
   +------------------------------------------------------------------+
   |  CHOOSER (chooser.js, unchanged)                                 |
   |  races every planner that applies, scores, picks, replays        |
   +------------------------------------------------------------------+
        |                     |                        |
        v                     v                        v
   technique planners    tracker fallback      OPTIMISER (new)
   (turning rejoin,      (phases)              |
    straight, lines)                           |
        |                                      |
        |  winner's track = SEED  ------------>|
        |                                      v
        |                     +----------------------------------+
        |                     | 1 controls.js: knots -> curves   |
        |                     |    bank(t) G(t) power(t) boards  |
        |                     +----------------------------------+
        |                                      |
        |                                      v
        |                     +----------------------------------+
        |                     | 2 fly: existing stepAircraft +   |
        |                     |   gateRoll against Lead's record |  <-- same step, same gate
        |                     +----------------------------------+      as every aircraft
        |                                      |
        |                                      v
        |                     +----------------------------------+
        |                     | 3 score.js: time + energy lost   |
        |                     |   + control movement + penalties |  <-- each term: source, weight,
        |                     |   (mode switches pick the terms) |      on/off by mode
        |                     +----------------------------------+
        |                                      |
        |                          better? <---+---> nudge knots
        |                                      |   (search.js, Nelder-Mead,
        |                                      |    stop when no gain / N flights)
        |                                      v
        |                     +----------------------------------+
        |                     | 4 best track + score breakdown   |
        |                     +----------------------------------+
        |                                      |
        +------------------->  candidates  <---+
                                      |
                                      v
                            REPLAY (transitions.js flyStep)
                            CARD: path, times, "what it traded"
```

Read it as: the technique planner gives the first guess; the optimiser flies, scores and nudges it a few hundred times through the exact same step; the chooser decides whether the polished path beats the technique.

## 2. What to download

**Route 1 needs nothing.** No library, no build step, no download. The search (Nelder-Mead) is 60 lines of arithmetic that any textbook gives; writing it is less work than vetting a package, and the rule book's no-new-libraries rule holds.

Options you may want beside it, none required:

| Option | What | Where | Why you might | Why not |
|---|---|---|---|---|
| A. Reference search library | `fmin` (Ben Frederickson's Nelder-Mead in JS, MIT) | would go in `package.json`; needs your yes | A tested implementation to compare ours against once | One more dependency for 60 lines |
| B. Offline cross-check | Python 3 + CasADi (`pip install casadi`, free) on your PC | `tools/` script only, never shipped | Solve the same rejoin "properly" on your PC and compare with route 1's answer, to see how far from optimal the hill climb lands | A second physics in Python to keep honest; use it for spot checks, not as a source of numbers |
| C. Profiling | nothing to download; the browser's own performance tab | | To see where the press time goes | |

Recommendation: nothing now; B later if you want a yardstick for "how good is good".

## 3. What to write, file by file

All under `src/modules/turn-sim/live/`, no new top-level folder. Plain ES modules. Estimated sizes.

| File | Lines | Job | How |
|---|---|---|---|
| `optimise/controls.js` | ~80 | Knots to curves | K knots per control (K = 8 default, estimate), each knot a time share 0..1 and a value; curves through them with the smootherstep already in `flight.js`; one extra knot is the total time scale; boards as one switch-on time. Also `sampleFrom(track, K)` to make knots from a technique's track (the seed). Clamp each knot to the Rates profile's bounds (section 5). |
| `optimise/score.js` | ~150 | The cost | A table of terms (section 4), each `{ key, label, source, weight, on(mode), value(flight) }`. `score(flight, mode, rates)` returns the total and the per-term breakdown. All terms in **seconds-equivalent** so weights mean something: energy lost is converted to the seconds full power needs to win it back at that speed (core `excessThrustPerWeight`); control movement to seconds via a weight you set. |
| `optimise/search.js` | ~60 | Nelder-Mead | Textbook simplex: reflect, expand, contract, shrink. Deterministic (no randomness). Stops when the best score improves by less than `tol` (0.1 s, estimate) over 20 flights, or at `maxFlights` (300, estimate). Returns best point and how many flights it took. |
| `optimise/fly.js` | ~80 | One candidate flown | Takes knots, Lead's record, the start state; steps `stepAircraft` with the curves as commands (bank through `stepCommanded` as the held-command planners do; speed through the power curve via `slow-down.js`/`power.js`, **not** `setKias`, so energy is honest); records `[bank, kias, power]` per step, the end state, min range, lane, time, energy, G history. Coarse step option (0.2 s) for the search, 0.05 s for the final confirm. |
| `optimise/planner.js` | ~120 | The planner the chooser races | Seed from the technique winner; build the simplex around it (±10° bank, ±0.5 G, ±0.2 throttle, ±10% time, estimates); run `search`; confirm the best at 0.05 s; if the confirmed flight breaks a hard limit, return the seed unchanged; hand back `{ plan, durationSec, inSec, score, breakdown, how: 'optimised from <technique>' }` in the chooser's candidate shape. Time budget: abort at `maxFlights` and return best so far. |
| `optimise/modes.js` | ~40 | The three modes | `BY_THE_BOOK`, `CHOSEN`, `UNRESTRICTED`: which score terms are on, with the switch list for CHOSEN. Hard terms (physics, bubble) are not in this file: they are always on. |
| `chooser.js` | +10 | Race it | Add the optimiser as a candidate behind a setting (`optimise: off` by default until phase D). |
| card wording | +20 | Show it | "Optimised from turning rejoin: 41 s (technique 47 s). Traded: X picture 3.1 s, energy 1.4 s, smoothness 0.8 s." and in CHOSEN mode the tick boxes. |
| `rates.js` | +15 | Rates profile | The bounds and shares from report.md 6.4 A: G aim, roll share, G onset, cone-height share, power staging. |
| docs | | | `spec.md` new section "The optimiser"; `decisions.md` one TS row per phase; `numbers.md` regenerated (the register tool must read `optimise/`); `testing.md` one check per phase. |

## 4. The score: terms, formulas, sources

Every term returns seconds. Weights (w) are the tuning and start as estimates.

| Term | Formula (per flight) | Source | Mode | Starting weight |
|---|---|---|---|---|
| Time to in-band | seconds from press to in band and steady (TS-78) | TS-78, TS-80 | all | 1.0 |
| Energy thrown away | seconds of idle or boards, plus height lost below the cone converted to the seconds MAX needs to regain it | TS-61 (order of use), TS-96 (cone as energy), Patrick 6 Oct 01:25Z "geometry first, power as needed" | all | 1.0 (estimate) |
| Control movement | integral of roll acceleration² + G rate² + lever travel, scaled to seconds | TS-108 (power 0.2 s), TS-85 (roll) | all | 0.3 (estimate) |
| G rule | hinge² on G above 5 (soft), hard above 7 | SMM 16.17 para 44a; TS-60 | all (hard part always) | 2.0 above 5; hard at 7 |
| Bubble | hard: any range < 500 ft rejects | SMM 16.17 para 44c; FLUID.bubbleFt | always hard | reject |
| Lane | hard: ahead of the 3/9 line inside the lane range | Patrick 5 Oct 08:04Z | always hard | reject |
| Stall / roll / onset | enforced by the gate during the fly; no term | TS-85, TS-93 | always | none needed |
| Window | hinge² on range outside 250-100 ft and overtake outside 10-20 KIAS at the end | TS-106, TS-110 | by the book, chosen | 1.0 |
| Speed floor | hinge² on KIAS below 200 before the window | TS-75 | by the book, chosen | 1.0 |
| Line speed target | hinge² below 210/220/235 on the line | TS-133 | by the book, chosen | 0.3 |
| X picture | seconds off the X line beyond captureFt before the decision point | SMM 12.24 paras 56-58; Patrick 6 Oct 02:30Z | by the book, chosen | 0.5 |
| Not blind on Lead | seconds Lead is outside the canopy's top half | Patrick 6 Oct (TS-124 "don't go blind on Lead close in") | by the book, chosen | 1.0 |
| Lead's plane at the end | hinge² on the angle between #2's wings and Lead's plane at in-band | SMM Fig 12.11; TS-126/127 | by the book, chosen | 0.5 |
| Rates profile | hinge² on G above the level's aim, roll faster than its share, cone use beyond its share | report.md 6.4 A (estimates) | all | 0.5 |

Rules for terms: a term is a smooth hinge (zero inside, growing as the square outside), never a step, so the search can feel its way; hard limits are rejects, so the fastest path is never through Lead. Every term shows its seconds on the card, which is the "translation" between modes.

## 5. Techniques and details to get right

1. **Parameterisation.** K = 8 knots per control on a 0..1 time share plus one time-scale knot: 25 numbers. Fewer knots (5) makes it faster and smoother but less able to find a two-stage power move; more (12) slows the search and wiggles. Start at 8 and let the flight set decide.
2. **Seeding.** Sample the technique winner's track at the knot times. Also try the second-best technique as a second seed when the two differ by more than TIE_SEC; keep the better optimised result. Never start from scratch at the press.
3. **Search settings.** Nelder-Mead with initial simplex offsets of ±10° bank, ±0.5 G, ±0.2 throttle, ±10% time (estimates); stop at 0.1 s improvement over 20 flights or 300 flights. Coarse step 0.2 s during search, 0.05 s confirm at the end. Deterministic: same seed, same order, same answer, so replay stays exact and tests stay fair.
4. **Honest speed.** The fly uses the power curve through `slow-down.js` and `power.js` to change speed, not `setKias`. Then energy terms are real, and height-for-speed trades fall out of the physics.
5. **Bounds from Rates.** Each knot is clamped to the profile: Student bank ≤ 60°, G ≤ 3, roll share 0.5; Instructor 4 G, 0.75; AI the G rule and the whole aircraft (report.md 6.4 A). So the same optimiser produces three pilots.
6. **Hand-over to the tracker.** The optimiser plans to the window (or to in-band for a cone move); the tracker's settle takes the last feet as every planner does today (`hand-over.js onClosure`). Do not optimise the settle.
7. **Events.** At a press mid-move, the chooser's "from here" re-plan calls the optimiser with the current state; seed from the previous optimised track shifted in time (warm start), so a re-plan is a few dozen flights, not hundreds.
8. **4-ship.** Each wingman is already planned against the recorded flight of the aircraft he flies off (`four-legs.js`). The optimiser fits in per wingman, in the same order, with the same records. The "wait for the one ahead" gates stay as hard terms (start time).
9. **Time budget.** Count flights, not seconds, so the plan is the same on a slow and a fast machine. If the budget runs out, return the best so far; the chooser still has the technique.
10. **Modes and translation.** One optimiser; a mode is a set of switches on the score terms. The card shows both totals when two modes are run from the same start, and the per-term seconds show the price of each rule.
11. **Validation.** Before/after on the flight set: in-band end state inside the shared margins (±10 kt, ±100 ft, ±5°, ±0.5 G), time not longer than the technique's, no hard term broken, press flights ≤ 300. One end-picture test per phase (the rule book's one test per PR).
12. **Explaining it to a student.** The card's breakdown is the teaching tool: "by the book 47 s; the fastest legal path 39 s; the X picture cost 3 s, staying unblind 3 s, energy 2 s." Draw both paths when two modes are run.

## 6. The phases, with gates and options

| Phase | Build | Risk to flying | Gate to the next |
|---|---|---|---|
| **A. Score only** | `score.js`, `modes.js`, card breakdown. Score today's chosen plan and show it; change nothing that flies | None | You read the breakdowns on the flight set and agree the terms and starting weights |
| **B. Optimiser as a hidden candidate** | `controls.js`, `fly.js`, `search.js`, `planner.js`; chooser races it behind a More switch "Polish", off by default | None with the switch off; with it on, the chooser only takes it if it passes the band and lane | Flight set with Polish on: in band, inside margins, not slower, ≤ 300 flights |
| **C. Modes** | By the book / chosen / unrestricted switches; two-mode comparison on the card | None (planner already proven) | You fly three or four starts in each mode and the breakdown reads right |
| **D. Default on** | Polish on by default for rejoins and cone moves; techniques stay as seeds and fallbacks | Medium: every press now flies the optimised path | Your sign-off on the flight set from the default start |
| **E. Optional later** | Offline yardstick (CasADi on your PC) and, if ever wanted, route 3 tables for instant presses | None to the app | Only if press time or optimality is still a complaint |

Options at the forks, with my pick:

- **Search method.** Nelder-Mead (pick: robust, no gradients, 60 lines) versus coordinate nudging (simpler, slower) versus a finite-difference gradient descent (faster per flight, fragile near the hinges).
- **Where the seed comes from.** Technique winner (pick) versus the tracker fallback versus the previous optimised track only.
- **Speed model in the fly.** Through the power curves (pick; honest energy) versus `setKias` as today (faster to write, lies about energy).
- **Who decides between optimised and technique.** The chooser (pick; one rule, already approved TS-76) versus always optimised when available.
- **Default mode.** By the book (pick; it is a trainer) versus chosen.

## 7. Risks and what to watch

- **Bad weights make silly paths fast.** Phase A exists to catch this before anything flies.
- **Local optimum.** Seeded from the technique it stays near the technique. That is wanted here; if you ever want "the fastest thing possible", run unrestricted with two or three seeds.
- **Press time.** 300 flights at 0.2 s step ≈ one of today's turning-rejoin searches. If it is too slow, cut K, cut flights, or warm start. Never cut the confirm at 0.05 s.
- **Two copies of the rules.** Every technique rule becomes a score term; the technique planners must then stop hard-coding the same rule, or the two drift. Steps 1-4 of the refactor are what make this possible.
- **The tracker settle still has its own law.** It is the one piece the optimiser does not touch; if its gains fight the optimised arrival, the hand-over shows a bump. Watch the hand-over in phase B.

## 8. What I am unsure of

- Whether 8 knots are enough for a hot rejoin with lag-the-cut and a zoom (TS-138): it is two power moves and one height move, which 8 knots should carry, but it is untested.
- The seconds-equivalent conversion of energy loss: using full power's regain time is defensible but your ruling on how to price energy would be better.
- Whether Nelder-Mead stays well-behaved with the hard rejects for bubble and lane; a reject inside the simplex can stall it. The fallback is to use a very steep hinge instead of a reject for the search and keep the hard reject only at the confirm.
- Press-time numbers: counts from loop shapes, nothing timed.

## 9. After the phase A weights: the exact next steps

Phase A ends when you have read the score breakdowns of today's chosen plans over the flight set and settled the terms and starting weights. From there, in order:

1. **Freeze the flight set and its before-picture.** Record, on the polished code with Polish off, every move in report.md section 4: end state in Lead's frame, time to in band, max G, max G onset, closest approach, lowest speed, and the phase A score breakdown. Save it as a JSON fixture under `tests/` (one file). This is the yardstick for every later phase.
2. **Write `controls.js` and `fly.js` first, with no search.** Prove the loop closes: sample the technique winner into knots, turn the knots back into curves, fly them through the step, and show the re-flown track matches the technique's own track within the shared margins. If it does not, the knot count or the speed model is wrong and no search will fix it. One end-picture test.
3. **Add `search.js` and run it on one move only**, the turning rejoin from 4,000 ft abeam, with the by-the-book terms. Report: flights used, score before and after, the per-term breakdown, press time. You look at the two paths side by side. Gate: not slower, in the window, no hard term broken.
4. **Widen to the flight set** with Polish behind the More switch, off by default. Report the same four numbers per move. Gate: the phase B gate in section 6.
5. **Modes** (phase C), then **default on** (phase D) after your sign-off from the default start.

Each step is one pull request, one writer, one test, per the rule book. The brief for each names the model (Opus: flight code and maths), the effort (high for the score and the fly, medium otherwise), the files it may touch, and the testing lines from `AGENTS.md`.

## 10. What this thread learned (for Antigravity or any new agent)

Antigravity cannot read the project files, so these two plans and report.md must be copied into the repo (suggested home: `docs/modules/turn-sim/optimiser/`), with the rename map reversed (cone position → fighting wing, pointing → pursuit, lead point / nose on / lag point → lead / pure / lag pursuit, follow → chase, spread → tactical, alpha → angle of attack, "two-ship module" → Turn Fight). The four-ship thread owns that copy. Nothing in these files is built; everything is a plan.

Points settled in conversation with Patrick on 6 Oct 2026, 21:37-22:33Z:

1. **The mechanism stays.** Plan at the press by dry-running every aircraft through the one flight step, record, replay. The path drawn is the path flown (spec F1). Plain JavaScript, no framework. Any optimiser is a planner the chooser races, never a replacement for the step or the gate.
2. **The follower model is what changes.** Today he is four programs (tracker phases, geometric lines, held-control planners, 3D point-mass paths) stitched with hand-overs. The target is one closed-loop pilot law plus a small search over the real choices (side, cut, dive or zoom, roll or plain). The optimiser is the polish layer under that, built after refactor steps 1-4 (report.md section 4), not before.
3. **What exists is route 1's physics with a coarse hand-made search**, not an archaic route 2. The equations are already written as a readable step; what is missing is a search that works backwards from a written cost instead of enumerating technique knobs.
4. **Route 2's month is the plumbing, not the download:** a second, differentiable copy of the physics, proved equal to the step; a WebAssembly or JS solver; constraints whose failures read as solver messages; conversion back to a checked track. Done offline in Python with CasADi it is days, which is route 2's phase A.
5. **Millions of combinations are not enumerated.** A hill climb starts from the technique and walks downhill on the score, a few hundred flights. It stays near the manual's shape, which a trainer wants. The chooser keeps the either-or choices.
6. **Dynamics:** everything is planned at the press and re-planned from the current state on a press mid-move (TS-76/78); the optimiser re-seeds at each re-plan. Nothing today runs every frame against a stick-flown Lead; if ever wanted, the pilot law is the piece that runs live, the optimiser stays a planner.
7. **Modes:** by the book, chosen restrictions (tick boxes, like the Fix tools panel, TS-52), unrestricted. One optimiser with switches on the score terms, never separate planners. Hard limits (bubble, stall, G onset, 7 G, lane) stay in every mode. Translation between modes is the per-term seconds on the card; the Rates profile sits on top as how much of the aircraft he may use.
8. **Patrick's decisions:** keep both plans (route 1 and route 2); move toward the optimiser after the polish of what exists; Patrick chooses the phase A starting weights (open at 22:33Z).
9. **Rules that bind the work:** every number carries a source or "estimate"; orders and SMM limits are references, physics is the wall; geometry first, power as needed, always; no new libraries without Patrick's yes (route 2 needs one); one writer per file; one test per pull request, the end-picture kind; no local test runs before a pull request, CI is the check; confirm the wording of any spec or decision row with Patrick before writing it.
10. **Open questions for Patrick** (also for the waiting list in `docs/PLAN.md`): phase A weights; how to price energy lost in seconds (full power's regain time is the working answer); whether the 4-ship's own bank caps (45°, 75°) stand after the no-bank-cap rulings; whether `LAG_ROLL`'s cone far edge (1,250 ft) should join the judge's (1,300 ft); whether the judge's wider regions were a ruling.
11. **Lines out, tracker stays, hand-over at 500 ft** (Patrick's question 22:37Z, answered 22:40Z). The split "big move, then settle" is kept: the optimiser plans the big move to the window or the cone edge; the tracker, a closed-loop controller, takes the last stretch and the hold against the moving reference, where a planned-at-press track goes stale. The kinematic lines (`kinematic.js`, `kinematic-moves.js`, `line-moves.js`, `lineRunIn`) go, as report.md step 5 says: the optimiser produces bank, G and power directly through the real step, so there is nothing to back-solve and no smoothing passes at the join. The seam is removed two ways: the optimiser's end conditions include the tracker's starting conditions (closure, bank near Lead's plane, power set), and the tracker's close-in phase shares the optimiser's cone table, lane rule and Rates profile. The boundary stays a named number (HAND_OVER_FT 500, Patrick 5 Oct 06:24Z) in the one table; the flight set decides if it moves.
12. **What today's lines do at the hand-over** (Patrick's question 22:39Z). Of the three hand-over conditions, the kinematic line meets one: closure. Its time law (`hand-over.js lineRunIn`) arrives at the hand-over point at the close-in rate and passes the acceleration there to the tracker. Bank is not aimed: it is read off the path's curvature (`kinematic.js posesFrom`) and lagged toward Lead's bank by a fixed delay; the wing-plane ease exists only on the turning rejoin (TS-126/127). Power is not planned: it is back-solved from the path's speed changes (`holdToPower`, `labelStages`) and clamped. The line has no window condition (TS-106/110); that lives in the turning rejoin's law and the tracker. The three smoothing passes in `lineRunIn` exist to hide the bank and power seams. The optimiser states all three conditions as end terms and the search meets them, which is what lets the passes go.
13. **Fixing today's hand-over to the tracker** (Patrick's question 22:43Z). Four ways, cheapest first: (1) seed the tracker's loops from the line's last two steps (heading feed-forward, speed-loop acceleration, bank and roll rate, power stage) instead of starting them at rest, about 20 lines in `tracker.js runTracker` and `hand-over.js`; (2) make the line aim its last ~3 s (estimate): blend its bank toward Lead's plane with the `inLeadsPlane` ease already in `turning-rejoin.js:632`, and hold the back-solved power at the tracker's first-phase setting, about 40 lines in `kinematic.js posesFrom` / `hand-over.js lineRunIn`; with (1) this meets all three hand-over conditions and two of the three smoothing passes can go; (3) hand over at 1,000 ft (inside Patrick's 5 Oct "500-1,000 ft") and let the tracker's `rejoinTo` phase fly the last 1,000 ft, one number in `rates.js`, which moves the seam rather than removing it; (4) remove the lines (report.md step 5), the real fix both plans assume. Recommended order: (1)+(2) as one small reversible pull request with a setting that keeps the old behaviour, fly the flight set, then (4) in the refactor; skip (3) unless (1)+(2) disappoint; by the two-failed-fixes rule, if (1)+(2) do not remove the bump, go straight to (4).
