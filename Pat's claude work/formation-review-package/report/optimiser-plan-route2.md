# Plan: the follower optimiser, route 2 (collocation with a solver)

Written 6 Oct 2026 22:15Z for Patrick, parallel to optimiser-plan.md (route 1). Nothing here is built. Every number is an estimate unless a manual page or ruling is beside it. Where a step is the same as route 1 it says so rather than repeating it.

## 0. What route 2 is, in one paragraph

Route 1 flies guesses forward through the step and nudges them. Route 2 writes the whole move down as one big set of unknowns (the follower's state and controls at 40-60 instants, plus the total time), writes the physics as equations that must hold between neighbouring instants, writes the limits as inequalities, and hands all of it to a solver that uses derivatives to move every unknown at once toward the lowest cost. It finds a better answer in fewer iterations and can treat limits as true constraints rather than penalties. The price is that the physics must exist a second time as smooth equations the solver can differentiate, and the solver itself is a piece of numerical software you do not write.

Preconditions are route 1's plus one: **a decision from you on the no-new-libraries rule**, because route 2 cannot be done without one.

## 1. The diagram

```
   PRESS -> CHOOSER (unchanged) races: technique planners | tracker | ROUTE 2 PLANNER (new)
                                                                      |
                     technique winner's track = WARM START ---------->|
                                                                      v
   +------------------------------------------------------------------------------+
   | 1 model.js  SMOOTH EQUATIONS of the T-6A (a second copy, checked vs the step) |
   |   dV/dt = g((T(thr,V,h) - D(V,h,n,boards))/W - sin(gamma))                    |
   |   dpsi/dt = g sqrt(n^2 - 1)/V (banked turn)   dh/dt = V sin(gamma)            |
   |   roll: dphi/dt = p, |p| <= pmax(V)   G onset: |dn/dt| <= 8 G/s               |
   |   stall: n <= nAvail(V) (smooth fit)   stages: boards 0..1 smooth, not on/off  |
   +------------------------------------------------------------------------------+
                                                                      |
                                                                      v
   +------------------------------------------------------------------------------+
   | 2 collocation.js  THE PROBLEM, built once per press                           |
   |   unknowns z = [x_1..x_N, u_1..u_N, T]   N = 40-60 instants                   |
   |   defects: x_{i+1} - x_i - (dt/2)(f(x_i,u_i) + f(x_{i+1},u_{i+1})) = 0        |
   |   Lead at instant i: read from his RECORDED flight (known, not an unknown)    |
   |   path limits at every i: bubble, lane, G, stall, roll rate, onset            |
   |   ends: x_1 = state at press; x_N in the window (TS-106/110) or in band       |
   |   cost: same terms as route 1 (score.js), written smooth                      |
   +------------------------------------------------------------------------------+
                                                                      |
                                       derivatives (ad.js, automatic) |
                                                                      v
   +------------------------------------------------------------------------------+
   | 3 SOLVER  (downloaded or built: section 2)                                    |
   |   Nonlinear programme: minimise cost(z) s.t. defects = 0, limits <= 0          |
   |   IPOPT / SLSQP / own SQP; iterates until KKT tolerance or iteration cap      |
   +------------------------------------------------------------------------------+
                                                                      |
                                                                      v
   +------------------------------------------------------------------------------+
   | 4 confirm.js  resample u(t) to 0.05 s, RE-FLY through the real stepAircraft   |
   |   + gateRoll (the truth), check limits and window, record [bank,kias,power]   |
   |   if the re-fly disagrees with the solution beyond margin: fall back to seed  |
   +------------------------------------------------------------------------------+
                                                                      |
                                                                      v
                              candidate -> CHOOSER -> REPLAY -> CARD (score breakdown, iterations, solver status)
```

Box 1 is the new work that route 1 does not have. Box 3 is the download. Box 4 keeps the rule "the path drawn is the path flown": the step, not the solver, is always the truth.

## 2. What to download, with the options

Route 2 needs (a) a solver and (b) derivatives. Four ways to get them, in order of how well they fit the rule book.

| Option | What and where | Size, licence | Fit | Verdict |
|---|---|---|---|---|
| **A. Own SQP + own automatic differentiation, no download** | Write `ad.js` (dual numbers: every arithmetic op carries its derivative; ~150 lines) and a small sequential quadratic programming or augmented-Lagrangian solver with L-BFGS (~400 lines). All plain JS in the repo. | 0 bytes; ours | Keeps no-new-libraries and readability | **Hardest to make robust**: a home SQP on 500 unknowns with 1,000 constraints will stall on badly scaled problems; expect weeks of numerical debugging. Honest only if someone on the team has done it before |
| **B. NLopt compiled to WebAssembly** (`nlopt-js` on npm, or build NLopt with Emscripten) | NLopt's SLSQP or AUGLAG+L-BFGS, called from JS; derivatives still from our `ad.js` or finite differences | ~1-2 MB wasm; MIT/LGPL | One library, no server, works from a link | **Recommended if route 2 at all.** SLSQP handles a few hundred unknowns well; above ~1,000 it slows. N = 40 keeps us inside |
| **C. IPOPT in WebAssembly** | No maintained package; build IPOPT + MUMPS + BLAS with Emscripten yourself | ~5-10 MB wasm; EPL/CPL | The industry solver, best at large sparse problems | A build pipeline to own forever; days to get the first build, and every browser update is a risk. Not for this team |
| **D. Solver on your PC as a local service** | Python 3 + CasADi (`pip install casadi`, bundles IPOPT); a 50-line local HTTP service the browser calls when it is there | ~100 MB Python side; LGPL | Zero browser weight, the real IPOPT, CasADi gives derivatives for free | Breaks "a link in a normal browser" for anyone but you; fits the rule book only as an **install for a heavier mode**, with the browser falling back to technique or route 1 when the service is absent. Also the right tool for the offline yardstick either way |

Recommendation: **D first as the offline prototype** (phase A below, learning whether optimality buys enough), then **B for the browser** if it does, with **A's `ad.js`** written anyway because SLSQP wants gradients and dual numbers are 150 readable lines. C never.

Where things go: `tools/trj-casadi/` for the Python prototype (never shipped; the repo rule "no new top-level folders" is kept since `tools/` exists); `package.json` gains one dependency (`nlopt-js`) with your yes; wasm served from the site like any asset.

## 3. What to write, file by file

Under `src/modules/turn-sim/live/optimise2/` (or share `optimise/` with route 1 for `score.js`, `modes.js`, `confirm`).

| File | Lines | Job | How |
|---|---|---|---|
| `tools/trj-casadi/rejoin.py` | ~250 | Phase A prototype | CasADi Opti stack: declare x, u, T; trapezoidal defects; path limits; window end; cost; warm start from a CSV of the technique track exported from the app; IPOPT solve; write the control history to CSV. Lead's path as a CasADi interpolant over his recorded flight. |
| `tools/trj-casadi/compare.mjs` | ~100 | Phase A check | Loads the CSV controls into the real `stepAircraft`, re-flies, prints end state, time, G, min range against the technique's. |
| `optimise2/model.js` | ~250 | Smooth T-6A equations | Thrust and drag as smooth fits of core `t6-performance.js` curves (polynomials or splines in V and h; the stall line `nAvail(V)` as a smooth fit of `availableG`); boards as a 0..1 blend of drag; the engine lag as a first-order filter on throttle (TS-108, 0.2 s); roll rate limit `pmax(V)` from T6A_ROLL; G onset as a bound on dn/dt (8 G/s). Must be checked against the step: fly the same controls through both and show the difference under margin (section 5 item 1). |
| `optimise2/ad.js` | ~150 | Derivatives | Dual numbers: a value and its gradient vector; +, −, ×, ÷, sin, cos, sqrt, atan2, pow, smooth min/max. The model is written once with plain operators on these objects, so gradients come free. Readable to an engineer: "each number carries its slope". |
| `optimise2/collocation.js` | ~300 | Build the problem | From the start state, Lead's record, the formation and the mode: lay out z, the defect constraints, path constraints at each instant, end constraints, the cost; scaling of every unknown to order 1 (positions in thousands of feet, speeds in hundreds of knots, time in tens of seconds); sparsity pattern for the solver. |
| `optimise2/solve.js` | ~120 | Solver adapter | Wraps nlopt-js (SLSQP or AUGLAG): passes cost and constraint functions with gradients from `ad.js`; iteration cap (200, estimate), tolerance (1e-4 scaled, estimate), returns status, iterations, final cost and z. Deterministic for a given warm start. |
| `optimise2/confirm.js` | ~80 | The truth | Resample u(t) to 0.05 s, fly through `stepAircraft`+`gateRoll` against Lead's record, check hard limits and the window, record the track. If the re-fly misses the window by more than the margin, return the warm start instead. Shared with route 1's `fly.js` where possible. |
| `optimise2/planner.js` | ~120 | The chooser's candidate | Warm start from the technique winner (sample at the N instants); build; solve; confirm; hand back the candidate with score breakdown, iterations and solver status for the card. |
| `optimise/score.js`, `modes.js` | shared | Same terms and modes as route 1 | Written once; route 2 needs each term differentiable (hinges squared already are). |
| `chooser.js`, card, `rates.js`, docs | as route 1 | | plus a card line "solver: converged in 37 iterations" or "solver: did not converge, flew the technique". |

## 4. The problem written out (what the solver sees)

Unknowns per instant i = 1..N: position x, y; height h; true airspeed V; heading ψ; bank φ; load factor n; throttle τ; boards b (0..1). Controls: roll rate p, G rate ṅ, throttle rate τ̇, boards rate. Plus total time T. With N = 40: about 40 × 13 + 1 ≈ 520 unknowns.

Dynamics (standard aerodynamics, per instant, with dt = T/(N−1)):
- ẋ = V cos γ cos ψ, ẏ = V cos γ sin ψ, ḣ = V sin γ, where the climb angle γ follows from n cos φ − cos γ = (V/g) γ̇ (or hold γ as a state and n as its control; pick one in phase B).
- V̇ = g [(T(τ,V,h) − D(V,h,n,b))/W − sin γ].
- ψ̇ = g n sin φ / (V cos γ).
- φ̇ = p, ṅ as given, τ̇, ḃ as given (so the limits on rates are simple bounds).

Path limits at every instant: 1 ≤ n ≤ 7 and n ≤ nAvail(V) (stall, smooth fit of core `availableG`); |p| ≤ pmax(V) (T6A_ROLL); |ṅ| ≤ 8 G/s (gate ceiling); range to Lead ≥ 500 ft (bubble); not ahead of Lead's 3/9 line inside 1,000 ft, written as a smooth constraint on the fore/aft component when range < 1,000 (Patrick 5 Oct 08:04Z); 0 ≤ τ ≤ 1 with a 5% torque floor on rejoin legs (TS-108); 0 ≤ b ≤ 1.

Ends: x_1 is the follower at the press. x_N: range 100-250 ft along the rejoin line and overtake 10-20 KIAS (TS-106/110), or inside the cone band (SMM 12.29 para 69) for a cone move; in Lead's plane (TS-126/127) as a soft term.

Lead: his recorded flight interpolated at t_i = (i−1) dt. Because T is an unknown, t_i moves as the solver changes T, so the interpolation must be smooth (cubic), not step-wise.

Cost: route 1's table (optimiser-plan.md section 4), each term written as a smooth function of z: time = T; energy lost = ∫ (idle/boards use) dt + height lost below the cone converted to seconds; control movement = Σ (p² + ṅ² + τ̇²) dt; technique terms as squared hinges on the X-line distance, the canopy-blind angle, the speed floor and the line speed.

## 5. Techniques and details to get right

1. **Prove the second physics equals the first.** Before any solving: feed the same control history to `model.js` (integrated at 0.05 s) and to `stepAircraft`, over the flight set, and show end state inside ±10 kt, ±100 ft, ±5°, ±0.5 G and time within 2%. Any larger difference is a modelling error to fix, not to tune. This check becomes a permanent test (the one test allowed for that PR).
2. **Smooth everything.** Stages (power / boards / idle / idle+boards) become a continuous boards share and a throttle floor; the gate's clamps become rate bounds; table lookups become fits. Where the step has a true switch (boards instant, TS-108), the model uses a steep smooth ramp (0.2 s) and the confirm re-fly shows the real behaviour.
3. **Scaling.** Solvers fail on unscaled problems. Every unknown is divided by a typical size (positions 1,000 ft, V 200 kt, angles 1 rad, n 1, T 60 s) so all are order 1.
4. **Warm start always.** From the technique winner, resampled at N instants; T from its duration. Cold starts diverge or find the path through Lead.
5. **Mesh.** N = 40 trapezoidal first; Hermite-Simpson (more accurate per instant) only if the confirm re-fly keeps disagreeing. Refine near the window (more instants in the last 10 s) if the arrival is sloppy.
6. **Constraints as constraints, bubble excepted.** Let the solver treat G, stall, roll rate and lane as true constraints. Keep the bubble both as a constraint and as a hard reject in the confirm, since a constraint satisfied at 40 instants can be violated between them.
7. **Failure handling.** Solver status is one of: converged, iteration cap, infeasible. Converged → confirm → candidate. Cap → confirm anyway; if it passes, candidate; else warm start. Infeasible → warm start, and the card says the solver found no path under the chosen mode's constraints (which is itself a teaching message in unrestricted-vs-book comparisons).
8. **Determinism.** Same warm start, same solver build, same answer. WebAssembly is deterministic within a build; different browsers can differ in the last bits of floating point, which can change the iteration count but not, after confirm, which path is flown within margin. Record the solver version on the card.
9. **Time budget.** SLSQP with 520 unknowns and analytic gradients: 50-300 ms per solve in wasm (estimate). Cap iterations at 200. Re-plans warm start from the previous solution shifted in time.
10. **4-ship.** Same as route 1: per wingman, against the recorded flight of the aircraft he flies off, in order.
11. **Modes and translation.** Same `modes.js`; here switching a technique term off removes a constraint or a cost term, and the solver reports the Lagrange multiplier of each active constraint, which is exactly "how many seconds this rule costs" without a second run. That is route 2's one real advantage for the teaching card.
12. **Keep the step as truth.** Never let the solver's trajectory be replayed directly; always the confirm re-fly. This is what keeps spec F1 and the sign-off meaningful.

## 6. Phases, gates and options

| Phase | Build | Risk to flying | Gate |
|---|---|---|---|
| **A. Offline prototype** | `tools/trj-casadi/rejoin.py` + `compare.mjs`; solve three or four turning rejoins and two cone moves on your PC; compare with the technique and (if built) route 1 | None | You see how many seconds and how much energy the optimum saves. If under ~10% on the flight set, stop here: route 1 is enough |
| **B. Second physics** | `model.js`, `ad.js`, the equality test against the step | None (nothing flies from it) | Model matches the step inside margins on the whole flight set |
| **C. Browser solver** | Your yes to `nlopt-js`; `collocation.js`, `solve.js`, `confirm.js`, `planner.js`; behind a More switch, off | None with the switch off | Flight set with the switch on: converged ≥ 90% of starts, confirm passes, press under 1 s |
| **D. Modes and multipliers** | Shared `modes.js`; card shows per-rule seconds from the multipliers | None | Breakdown reads right on three or four starts per mode |
| **E. Default on** | As route 1 phase D | Medium | Your sign-off from the default start |

Options at the forks:
- **Solver source.** D (PC service) for prototype, B (nlopt-js) for browser: pick. A (own SQP): only if B is refused. C (IPOPT wasm): no.
- **Derivatives.** Dual numbers (pick; readable, exact) vs finite differences (simple, 520× slower, noisy at the hinges).
- **Discretisation.** Trapezoidal (pick) vs Hermite-Simpson vs multiple shooting (route 1's step inside the solver: no second physics, but gradients through the branches are the original problem again).
- **Where γ lives.** As a state with n as control (pick; keeps the window and plane constraints simple) vs derived.

## 7. Cost and gain against route 1

| | Route 1 | Route 2 |
|---|---|---|
| New code | ~550 lines | ~1,400 lines + Python prototype |
| Downloads | none | nlopt-js (your yes) + Python/CasADi on your PC |
| Second physics | no | yes, with a permanent equality test |
| Time to first flight in the app | 1-2 weeks | 4-6 weeks after the polish (A 3-5 days, B 2 weeks, C 2 weeks, D 3-5 days) |
| Press time | seconds | under a second |
| Optimality | local, near the technique | near-global under the constraints |
| Teaching card | per-term seconds by re-running | per-rule seconds from multipliers in one run |
| Failure mode | a slightly worse path | "did not converge" and a fallback |
| Readable to a non-developer | yes | the model and the problem yes; the solver no |
| Rule book | fits | needs one library yes; readability partly |

## 8. Risks and what I am unsure of

- The second physics drifting from the step is the long-term cost; the equality test is the only defence and must stay in CI.
- SLSQP on 520 unknowns with 1,000 constraints is near the top of what it handles comfortably; if it struggles, N must fall to 30 or the solver must change (which pushes toward C).
- Whether the lane and the X-line terms, which depend on Lead's position at a moving time t_i, stay smooth enough; a cubic interpolant of Lead's record should do, untested.
- Whether the gain over route 1 is worth it for a trainer; phase A exists precisely to answer that with numbers before anything else is written.
- All times and sizes are estimates; nothing was run.

## 9. After the phase A weights: the exact next steps for route 2

Route 2 shares phase A (the score terms and weights) with route 1; the weights are the same table. From there:

1. **Export the flight set as CSV** from the app (start states, Lead's recorded flights, the technique tracks). A small Node script under `tools/`.
2. **Offline prototype on Patrick's PC** (`tools/trj-casadi/rejoin.py`): solve the same moves with CasADi and IPOPT, warm-started from the technique tracks, and re-fly each answer through the real step with `compare.mjs`. Report per move: seconds saved against the technique (and against route 1 if built), energy saved, max G, iterations, solver status. **Gate:** if the saving on the flight set is under about 10% of time (estimate), stop route 2 here and keep the prototype as a yardstick only.
3. **Second physics** (`model.js`, `ad.js`) with the equality test against the step. Gate: inside the shared margins on the whole flight set.
4. **Patrick's yes to one library** (`nlopt-js`), then `collocation.js`, `solve.js`, `confirm.js`, `planner.js` behind the More switch. Gate: converged on ≥ 90% of starts, confirm passes, press under 1 s.
5. **Modes with multipliers**, then **default on**, as route 1.

## 10. What this thread learned

The same list as optimiser-plan.md section 10 applies; read it there. Route 2 specifics added:

- The solver is never the truth: the confirm re-fly through `stepAircraft` and `gateRoll` decides what is flown.
- The second physics is the long-term cost and the equality test is its only defence; it stays in CI for good.
- Route 2's one real advantage for a trainer is the Lagrange multipliers: the price of each rule in seconds from one run, without re-running per mode.
- Route 2 cannot be done without one new library (or a solver service on Patrick's PC); that decision is Patrick's and comes before phase C.

## 11. The plan on a tracker-only engine (Patrick's question 23:13Z)

The maths is unchanged: the solver works on states and controls, not on recipes. Two simplifications:
- **End condition:** arrive at the 500 ft phase change with the tracker's phase-two closure, bank and power, one set of numbers from one controller (in `collocation.js`'s end constraints). The confirm re-fly hands straight into phase two with no seam.
- **Warm start:** the tracker's own track for the move, resampled at the N instants.

Removed by tracker-only: the lines-as-seeds option and the two-controllers risk. The settle and hold stay the tracker's and are never part of the collocation problem. Route 1's "optimise the recipe" choice has no equivalent here; if the recipe-level search proves enough on the flight set, that is a reason not to build route 2 at all (phase A's stop rule).
