# Performance model and handling audit (Fable, 5 Oct 2026 21:50Z, read-only)

Asked by Patrick 21:48Z ("make sure they match the manuals ... assess if all of our roll rates/smoothing techniques/attitude
changes are realistic and physically sensical"). Nothing changed in the repo; Formation holds src/core.

## 1. The core T-6A model (src/core/t6-performance.js, t6a-turn-charts.js) against the manuals

| What | Model | Manual | Verdict |
|---|---|---|---|
| Sustained turn, 187 KIAS at 10,000 ft | 12.5°/s (2.69 G) | NFM A9 worked example, Fig A9-4: 12.8°/s | matches within the by-eye read of the chart |
| Best sustained rate, sea level | 20.6°/s at ~140 KIAS | NFM Fig 4-10-1 line top | fitted point; tests hold it within 0.35°/s with the chart's own 83 kt stall |
| Max level speed, sea level, 1 G | 265 KIAS | chart's zero-rate point 260 KIAS | within the test's 6 kt |
| Stall, 1 G clean | 86 KIAS (Patrick) | V-n ~89, turn chart ~83 (power on) | known choice; tests report the 1.1-1.6°/s gap at the line tops |
| V-n, VO, VMO, Mmo | 7/−3.5 G, 4.7 rolling, 227, 316, 0.67 | NFM Fig 5-3 p.5-9 | matches |
| Max glide | clean 2.0 NM per 1,000 ft at 125 KIAS; gear 1.5; landing 1.1 | max glide chart; SMM 13.5 para 7 | matches; T/O flap row is an estimate (no manual gives it) |
| Zoom after engine failure | table | NFM Fig 3-4 p.3-12 | exact |
| Best rate of climb speed | model's best 131-136 KIAS | NFM p.9129 and A4: 140 KIAS | model's best is 5-10 kt slow |
| Time to climb 2,000 to 29,000 ft | 10.5 min, 28 NM | NFM A4-2/A4-3 at 6,100 lb: 11.7 min, 38 NM | model climbs about 10% fast and covers 25% less ground |
| Climb rate at 15,000 ft | 3,100 fpm (same as sea level) | NFM: thrust flat-rated, but the climb charts fall off | optimistic above about 10,000 ft (thrust held flat to 14,000 ft, T6A_FIT.thrustFlatSigma) |
| Idle prop drag | 0.16 W at 200 KIAS, about 5 kt/s level | Patrick 5 Oct 00:11Z "probably closer to 5" | his word, no manual number |
| Speed brake drag | 0.095 W at 200 KIAS, about +1.7 kt/s | NFM p.1-39 gives the panel (70°), no size, no rate; SMM/EFIG give only its use | a GUESS (panel size); needs Patrick's number |
| Pitch attitude (AoA) | 2.8° x G x (180/KIAS)² | SMM 3.14 para 35, EFIG p.126: 10-15° nose up at 180 KIAS | estimate matched to the cue; fine |

Reading: the model is the sustained turn chart, and it is good where that chart governs (turns, speed-ups, slow-downs,
level max speed). Climb is its weak side: thrust minus drag is right at turn-chart speeds, but the split between thrust
and drag (from the glide chart, power off) puts the best climb a few knots slow and about 10% strong, and holding thrust
flat to 14,000 ft keeps the climb rate up where the NFM's falls. Effects in the tool: fluid climbs and the Formation
opening out's dive-and-climb-back are a little generous; a time-to-climb would read a minute short. Not worth changing
now; if Patrick wants climb right, the fix is to fit thrustFlatSigma and the drag split to NFM Fig A4-1/A4-2 as well
(Formation thread, core, one PR).

## 2. Roll rates, G onset, pitch, smoothing

| Where | Roll | G build | Pitch | Smoothing | Source |
|---|---|---|---|---|---|
| Core | none in T6A_LIMITS | none | pitchDegFromClimb | easeRoll: rate limit plus rate-of-change limit, stops on target with no overshoot (aileron-like) | kinematics |
| Formation (tactical) | 180°/s, 720°/s² (full rate in 0.25 s) | 4 G/s, 16 G/s² (fluid Lead, #2 in close turns) | 3°/s nose rate into a climb (fluid Lead) | lines: B-spline, 1 s running mean x3, bank and G read off the path; throttle changes limited to about 0.05 g/s (HOLD.jerk) | Patrick 06:07Z allowed 180°/s; the rest estimates |
| Formation (close turns) | Lead 30°/s, 20°/s² (route), 30°/s, 12°/s² (echelon, 60° in ~4 s) | #2 within 0.5 G of Lead's | | holdInPlane | Patrick 20:50Z |
| Fight Sim | 90°/s, 360°/s² (30% in a stall) | 6 G/s | | rolling G capped at 4.7 above 15°/s of roll | estimates, "for Dad to check" |
| Traffic | 45°/s, 90°/s² | | 3° move-over | easeRoll | estimates |

Verdict: every smoothing method is physically sensible (rate limits with finite rate of change, G from path curvature,
power with lag, no teleporting). Two things are not quite right:
1. There is no aircraft roll ceiling in core: three modules each pick a pilot's roll rate (180, 90, 45°/s) with no one
   number for what the aircraft can do, and the NFM text gives none. Fix: one T6A_LIMITS roll rate and roll acceleration
   from Patrick, each module's pilot at or below it. 180°/s with 720°/s² is at the brisk end for a Harvard II full-stick
   roll (my estimate, not a manual number); Fight Sim's 6 G/s onset is quick (a 1 to 5 G pull in under a second).
2. Fight Sim and Formation reach different G and roll rates for the same aircraft; that is pilot style, not physics, and
   should be written as such in each module's decisions.

Question for Patrick (one): the aircraft's full-stick roll rate and a realistic G onset, so core can carry them.

## 3. Brief: one roll and G-onset limit in core (Patrick 22:01Z "okay, let's do that")

Patrick agreed (22:01Z) to one aircraft limit in core that every module stays under, with roll rate following speed.
Model and effort: Opus, high (flight maths). Read AGENTS.md and docs/modules/turn-sim/ first; search for existing flight
math before writing new (core easeRoll is the one roll helper; reuse it).

Numbers (all Fable's estimates from standard aerodynamics, 21:59Z-22:01Z; no manual in the project files gives them; label
them estimates until Patrick corrects them):
- full-stick roll rate: about 0.45°/s per knot of TRUE airspeed, capped at 120°/s (about 65°/s at 140 KIAS, 90 at
  200, 115 at 250 at 8,000 ft); less near the stall (Fight Sim already uses 30% in a stall; keep that);
- roll acceleration: full rate in about 0.3 s (so about 400°/s² at 120°/s);
- G onset: 4 G per second, 16 G/s² (the fluid Lead's LEAD.gOnset today).

Wiring:
1. core/t6-performance.js: `rollLimitsT6A(kias, altFt)` returning { maxRateDps, maxAccelDps2 } for easeRoll, and
   `G_ONSET` { maxRateDps: 4, maxAccelDps2: 16 } (easeValue's shape), both in T6A_LIMITS' neighbourhood with the
   estimates marked. Add the row to docs/modules/shared/flight-math.md.
2. Formation (src/modules/turn-sim/live): ROLL (tuning.js 180/720) becomes the lower of the pilot's rate and core's at the
   speed now, in flight.js stepAircraft, formation-turns.js rollFrom, and lag-roll.js (its path from echelon peaks at
   about 157°/s today: the search must stretch the roll until the path's roll rate fits, or refuse with the reason).
   CLOSE_TURN.leadRoll and echelonRoll (Patrick's 30°/s) stay. Fluid Lead's gOnset reads core's G_ONSET.
3. Fight Sim (src/modules/turn-fight/energy): setup rollRateDegPerSec 90 and gOnsetGPerSec 6 read core's at each step
   (aircraft.js, smoothing.js); re-run its numbers once (Fight Sim thread, its next piece of work).
4. Traffic: ROLL 45/90 (circuit.js, sim.js MAX_ROLL_RATE_DPS) stays as the pilot's gentle rate; one comment that it sits
   under core's ceiling (Traffic thread, its next piece of work).
Decision: TS-81 (or next free) for Formation's part; a whole-tool decision in docs/DECISIONS.md for the core limit (Docs
keeper). Testing lines of AGENTS.md apply: no new tests (Patrick 21:06Z), a typecheck and a few dry runs
(chooser/sims/legs.mjs, lag-ech.mjs); every status says what is unseen.
