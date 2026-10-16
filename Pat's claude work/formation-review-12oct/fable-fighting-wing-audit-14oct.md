# Fable audit of spec 7e (fighting wing on the live wingman), 14 Oct 2026

Fable 5.1, high effort, read-only. Patrick asked for it ("we will have another fable audit before we build"). Fable's safeguards stopped two runs that read the manuals directly, so at Patrick's direction (14 Oct 2026) it reviewed one self-contained brief in the thread's scratchpad: our spec 7e draft 2, 7b in short, section 8's measured problems and plan B5, with a flight-school safety disclaimer first ("the absolute priority is to NOT hit the lead aircraft but stay in a safe position") and renamed terms. The repo docs were not changed for it.

**Term map (brief → ours):** the trail cone = fighting wing; steer-ahead / steer-on / steer-behind = lead / pure / lag pursuit; pass clear = make the miss; move in behind Lead = collapse to Lead's 6; free manoeuvring = fluid manoeuvring; CONE_WING = FW_WING.

## Verdict (Fable)

The structure is right and a clear improvement: one live wingman, a fighting wing technique of its own, a continuous aim point instead of a 5° heading list, a lift-vector command through the shaper, and the gauge with a saved known-bad run first. No blocker. Three fixes before building, all in what keeps #2 safe: (1) the separation guard is under-specified for Lead turning into #2 (the dangerous case); (2) the route-position aim point has authority that scales with Lead's turn rate and is zero with Lead level, so the aim loop must be scheduled by Lead's turn rate and hand off to power and S-turns when Lead is level; (3) "classify once at roll-in" leaves a hole when Lead reverses mid-entry. And one risk to what is built: the reaction time must be per technique (0.3 s close formation, 0.4 s fighting wing), or close formation's phase margin drops from about 37° to about 25°.

## Findings (one line each; Fable's severity)

- **F1, fix before build.** The guard for Lead turning into #2: a geometric predictor with priority, not a PID. Predict the miss 3-5 s ahead from Lead's current bank and speed (and one step tighter); engage under 600 ft predicted, release over 700 ft held 3 s; its command is the manual's sequence: aim at "where Lead was" (about 600-650 ft of his track behind him: "go to where lead was and do what lead did", EFIG p.391), the vertical (below by default), power off; it owns pitch while engaged; it may use G past the Lead + 1.5 G reference to the airframe limit, flagged; the reversal onto the circle cued by a definite increase in line of sight (SMM 16.20). A vertical-only miss inside the 200 ft band can't reach 500 ft by itself.
- **F2, fix before build.** Is the 500 ft rule slant range or range in Lead's turn plane? The guard, the miss and the one test depend on it.
- **F3, fix before build.** The aim loop's output should be a wanted closure, turned into an offset from Lead's turn circle divided by Lead's turn rate; the route positions (120 ft) are the comfortable amount, not the end stops (about ±250 ft); below about 2°/s of Lead's turn the rest goes to power and the S-turns.
- **F4, fix before build.** Re-classify the turn entry whenever Lead's turn direction changes, with hysteresis on his seen bank (a turn starts past 10° held 1 s, ends under 5° held 1 s); work Lead's circle out from his current bank and true airspeed each step, so it is only 0.4 s stale.
- **F5, fix before build.** Reaction time per technique (close formation 0.3 s stays; fighting wing 0.4 s).
- **F6, fix before build.** Write the loop bandwidths down before tuning, nested 3-5 times apart: steering about 0.3 rad/s, range about 0.1, vertical about 0.4, power under 0.07. Don't copy close formation's gains.
- **F7, fix before build.** One pitch owner at a time: guard, then quick fix, then stack. The quick fix moves the height target (about ±150 ft) and holds it until the range is happy, then the stack returns slowly; hysteresis on the quick fix (engage over 150 ft or 20 ft/s, release under 75 ft and 10 ft/s; estimates).
- **F8, fix before build.** Moving out from close formation needs its own "stretch" job: open straight back to about 500 ft at about 10 ft/s by power, the close-formation guard still on, then out sideways to the swept place on the side he held; hand over to the fighting wing technique past about 250 ft, its trims started from his bank, G and throttle.
- F9, can wait. The seen circle uses true airspeed (the shared helper).
- F10, can wait. Steering carries Lead's bank as feed-forward (as close formation does); HCA − 2 × aspect is a free on-circle check for the gauge.
- F11, can wait. A rigid 45° swept place can't be held in a turn at equal speed (inside it needs about 26 kt slower, outside about 29 kt faster): near astern during the turn, the sweep after the exit; the gauge and "done" must expect it.
- F12, can wait. Lead's speed changes not in the gauge set (future list).
- F13, can wait. Numbers the brief left unsourced (they are sourced in the repo: route place TS-181, 0.3 s TS-211, 8 ft/s Patrick, 200 ft TS-80, 15 KIAS Patrick 4 Oct 19:12Z, span slots.js); "steady" for done undefined (suggest closure under 10 ft/s, in the cone 5 s).
- F14, can wait. Propose a "terminate" outcome when the guard predicts 500 ft can't be kept even at the airframe limit (needs Patrick's yes).
- F15, note. Range from apparent size: continuous, filtered (closure about 1 s, line of sight about 0.5 s), not quantised (steps make a dead band by the back door and wreck the D term); loops close on range and closure; aspect, HCA and line of sight feed the supervisor (classification, the reversal cue, the on-circle check). The happy band is a soft zone (low P), not a dead band.
- F16, note. PID is the wrong tool for steering (a pursuit guidance law with bank feed-forward), the guard (predictor with priority and hysteresis) and turn entry/exit (the manual's tables as logic). The aim/range loop and the vertical are PD; power PI.
- F17, note. Today's reversals come from the 5° list re-chosen each step on a 1 ft tie-break, the 6 s look-ahead against a hard wall, and a high heading gain behind a roll cap and delay; the design removes all three. Job changes blend over 1-2 s.
- F18, note. A separate FW_WING table is right; technique chosen explicitly by formation; share nothing new with the 4-ship's old law; interfaces: perception gains the fighting wing quantities, the supervisor its jobs, technique(state, perception, job, dt) with memory, the shaper unchanged.
- F19, note. Build order: T27 gauge; T28 perception and the guard first (Patrick flies the turn into #2); T29 steering and aim in the turn, then swept, entry, exit, the vertical, power (Patrick flies the full set); T30 the stretch job (may be more than one task; Patrick flies the move out). Gauge records: least slant and in-plane range, time inside 500 and 600 ft, G and roll reversals (defined on filtered rates), max G and roll rate, range, closure, aspect, HCA, line of sight, aim and job histories with switch counts, settle time, final range, sweep, height, speed difference. One test: level turn into #2 from in position, never inside 500 ft, in the cone and steady at the end.

## Loop table (Fable; every gain a guess to start from)

| Loop | Input | Output | Form | Starting gains | Limits |
|---|---|---|---|---|---|
| Aim / range (outer) | range error from 625 ft; closure (size rate, 1 s filter) | wanted closure, then an offset from Lead's circle (lag point "where Lead was", Lead, inside points; route positions at ±120 ft) | PD scheduled by Lead's turn rate; no I | closure = −error / 10 s, ±25 ft/s; offset = closure / max(turn rate, 0.03 rad/s), slewed 20 ft/s | ±250 ft or ±20° of aim; low P inside 600-650 ft; below about 2°/s the rest to power and S-turns |
| Steering (inner) | angle between his flight path and the aim line; Lead's bank; aim line's turn rate | lateral G and bank (lift vector) | pursuit guidance: Lead's bank fed forward + P, no I | 0.05 G per degree; crossover about 0.3 rad/s | G Lead + 1.5 (guard: airframe limit, flagged); roll ≤ 60°/s through the shaper; aspect never past 90° |
| Vertical | height against Lead (−50 ft, or ±150 ft quick fix); vertical rate | G increment | PD | 0.005 G/ft, 0.02 G per ft/s (0.4 rad/s, damping 0.8) | ±200 ft of Lead; one pitch owner: guard, quick fix, stack |
| Power | speed against Lead; the closure the aim can't give | throttle | PI, slow | time constant 15-20 s; I held at limits | ±15 KIAS of Lead |
| Separation guard | predicted miss 3-5 s ahead, Lead's bank and speed, plus one step tighter | overrides aim (lag point), pitch (below), power off | geometric predictor, priority, hysteresis | engage < 600 ft, release > 700 ft held 3 s | G to the airframe limit, flagged; never a reversal across Lead's nose; terminate if 500 ft can't be kept (ruling) |

## Questions for Patrick (Fable's recommendation in brackets)

1. The 500 ft rule: slant range or range in Lead's turn plane? (Slant; the guard works to 600 ft predicted; the test checks 500 ft, no margin.)
2. Lead turning into #2 from in position: miss below or above? (Below by default, above if already high.)
3. May the guard pull past Lead + 1.5 G, up to the airframe limit, when that keeps 500 ft? (Yes, flagged.)
4. A "terminate" outcome when 500 ft can't be kept? (Yes.)
5. The lag aim point "where Lead was, 600-650 ft of his track back" beside the wing-up route position? (Yes; route positions the comfortable amount.)
6. Reaction 0.3 s close formation, 0.4 s fighting wing? (Yes, per technique.)
7. Happy 600-650 ft, lead beyond 700, lag near 500 as the aim schedule's flat zone and ends? (Yes.)
8. "Steady" for done? (Closure under 10 ft/s, in the cone 5 s; estimate.)

## The thread's check against the repo (14 Oct 2026)

- **Speed:** Fable assumed 180 KIAS, about 304 ft/s true. Ours is 200 KIAS at the 8,000 ft block, about 380 ft/s true (KIAS_OUTSIDE_LAB; LIVE_DEFAULTS blockFt): Lead's turn rate is 2.8°/s at 30°, 4.9°/s at 45°, 8.4°/s at 60° (radius 7,770, 4,480, 2,590 ft). Lower turn rates make F3's point stronger (the route-position aim has less authority still); F1's distances change but not its conclusion.
- **F5:** the delay already lives in a per-technique table (`wing-moves.js` CLOSE_SEE.delaySec 0.3, TS-211); fighting wing gets its own (FW_SEE 0.4). Easy, and close formation untouched.
- **F2:** today's floor (`fw-live.js`) measures horizontal range only (along and across), so the question is real.
- **F13:** every number it flagged is sourced in the repo (the brief left the sources out); "steady" is a real gap.
- **Against the decisions:** F1(e) (G past Lead + 1.5) fits "references, not walls" (Lead + 1.5 G is an estimate in FW_LIVE); the guard's miss below fits Patrick's "stacking below is nice"; F11 fits SMM 12.29 para 69 (collapse to the 6 in turns) and TS-208; nothing conflicts with TS-208, TS-211, TS-212, TS-226, TS-228 to TS-232. TS-228's "no dead band" is close formation's; F15's soft zone keeps to it.
