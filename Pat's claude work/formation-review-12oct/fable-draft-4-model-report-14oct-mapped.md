*Fable's report on brief 3 (`fable-draft-4-model-brief-14oct.md`), plan D2, 14 Oct 2026: one read-only agent, model Fable, effort high. Filed verbatim by the Formation thread; renamed terms (map back with `scrub.mjs back`, copy beside it). Its proposals are hypotheses until checked against TS-233 and TS-234 and ruled by Patrick.*

---

# Design review 3: model, sizing and gate check of the wingman's proposed control structure

## Verdict

The structure is sound and is the right shape: one reference, one set of loops, a guard that only constrains, techniques that only write the reference. Built as drafted it would not pass its own gates. Four things must change before building:

1. The vertical loop's damping term acts on #2's own height rate, so it fights every planned descent (a 100 ft/s pass-clear descent meets 2 G of opposing demand). The reference must carry a height rate, and pass clear [make the miss] must plan a vertical profile, not a target with a 2 s blend.
2. The normal follower's steering as drafted (course gain 0.3 rad/s, approach slope 1 per 150 ft under a 20° cap) has a phase margin of 18-29° at every trim: it fails C2 and would bounce at capture. Resizing the slope to about 1 per 420 ft (or 1 per 250 ft under the 12° cap) with a course gain of 0.5 rad/s gives 48-65°.
3. The guard's predictor uses Lead's bank 0.4 s stale. At Lead's roll-in that is 12° (academic) to 36° (hard) of bank error, which over a 5 s prediction horizon is an 84-337 ft error in the predicted pass: more than the whole 600→500 ft taper band. Dead-reckon Lead's bank by his seen roll rate, as his position already is.
4. Several technique cues have zero or sub-wobble hysteresis (pass clear [make the miss] on at 600 ft, off at 600 ft; climb-out on 15 ft/s, off 10 ft/s; S-turns on 600 ft, off 625 ft against a 43 ft ripple). Each needs a band and a dwell before it exists in code.

The build plan's first slice cannot stand alone: the guard as a constraint needs a defined turn command to limit (slice 2's lift composer) and the one-delay-rule perception (slice 3a). Reorder so the plumbing and perception come first.

Everything else is sized below and passes, or is marked "can't tell on paper" with the rig step that settles it.

## Assumptions (all mine; state them in the model)

- Lead-only delay with dead-reckoning is exact in a steady turn, so at T1, T2 and T4 it adds no phase to the loops; it matters only at Lead's changes (T5). "Whole picture" is a pure 0.4 s delay on every measured signal.
- Small-signal lag from turn-rate command to achieved turn rate (roll shaper plus G build-up): 0.4 s at T1, 0.3 s at T2, 0.25 s at T4 (less bank change per unit of turn rate at steeper bank), 0.5 s at T5 (roll-rate-limited). Vertical G lag 0.1 s (this reproduces the brief's vertical margins exactly, 0.69 rad/s, 66°/50°, so it is what today's model uses). Engine 0.25 s. Speed damping 2D/(mV) ≈ 0.017 /s (L/D about 10 at 200 KIAS; a guess).
- Arc-loop plant: closure c = V·d/(R − d) ≈ ω·d, so the law's ÷ω cancels and the loop's margins do not depend on Lead's G (T2 = T4), as today's table also shows.
- The d slew (60 ft/s) and the approach-angle caps are large-signal saturations, ignored in the linear sizing and treated in the findings.
- Finding numbers here are D1-D20 (this review), to avoid colliding with F1-F19 from the first review.

## 1a. The structure as tables

### Blocks

| id | name | kind | what it does |
|---|---|---|---|
| B01 | Lead (scripted) | aircraft | flies the test script; the only source of Lead's truth |
| B02 | Perception | perception | Lead 0.4 s late and dead-reckoned: position round his seen turn, and (D3) bank extrapolated by his seen roll rate; #2's own state now; derives slant, closure, line-of-sight rate, aspect, HCA, sweep, height against Lead, Lead's circle, arc s, offset d, arc closure |
| B03 | Supervisor: phase and case | supervisor | phase weights (level/entry/turning/exit, sum 1) from Lead's seen roll, each change blended over 1.5 s; the case label read once at each entry and exit |
| B04 | Supervisor: technique picker | supervisor | polls each technique's cue; one active at a time by priority; no-restart timer; longest-run timer; writes the blend weight 0→1→0 |
| B05 | Normal follower | normal follower | writes the normal reference: path (circle concentric with Lead's at B07's offset d, or the swept line parallel to Lead's track), approach caps, height target = stack, intent 0, urgency 0 |
| B06 | Techniques T1-T7 (pass clear [make the miss], back behind the wing line, steer-behind [lag pursuit] from abeam, climb-out reset, cut-across, exit vertical, S-turns) | technique | each: cue, plan, monitor, done; writes one candidate reference and nothing else |
| B07 | Arc loop | loop | d = d_ss + w/ω + kc(w − c)/ω, w = (s − 650)/τ_s, soft closure limit, ±250 ft, slewed; writes the normal path's offset only |
| B08 | Reference blender | reference | from the two references and #2's own position computes, and blends by B04's weight, the loop inputs: wanted course, path turn-rate feed-forward, height target and height-target rate, intent, urgency, cap change |
| B09 | Steering loop | loop | ω_cmd = ω_FF + Kχ (χ_wanted − χ) |
| B10 | Vertical loop | loop | ΔG_v = Kp (h_T − h) + Kd (ḣ_T − ḣ) |
| B11 | Power loop | loop | throttle = drag of commanded G + climb feed-forward + roll-in lead + intent + slow PI trim on speed against Lead; idle by a smooth reduction; the speed brake (the one real switch) |
| B12 | Guard | guard | one predictor (least slant over the closing part, horizon ≤ 10 s); taper 600→500 ft; least-change bounds on ω_cmd and ΔG_v; graded bleed request; smooth cap opening 550→500; side choice held 3 s |
| B13 | Lift composer | shaper | builds the lift vector from the bounded turn, the 1 G hold and the bounded vertical; applies the cap in the order height demand, level hold, turn; hands the drag of the commanded G to B11 |
| B14 | Shaper | shaper | G onset 1 + 3u G/s; roll ≤ 60°/s; unload-roll-pull when the wings are more than 20° off the wanted lift |
| B15 | #2 aircraft | aircraft | point mass: thrust, drag, roll rate and build-up, G build-up ≤ ~4 G/s, stall warning, engine 0.25 s / 3.5 s spool |

The gauge and the rig read every signal and write none; they are tools, not blocks.

### Signals

Delay kinds: N = now; L = Lead 0.4 s dead-reckoned; W = whole picture 0.4 s (should not exist after the perception slice; marked where today's code has it).

| id | signal | unit | writer | readers | delay | smoothing | limits / notes |
|---|---|---|---|---|---|---|---|
| S01 | Lead position, dead-reckoned | ft ×3 | B02 | B05 B06 B07 B12 | L | none | |
| S02 | Lead velocity, dead-reckoned | ft/s ×3 | B02 | B05 B06 B07 B12 | L | none | |
| S03 | Lead bank | deg | B02 | B03 B05 B11 B12 | L (today W-like: raw 0.4 s old; D3 extrapolates by S04) | none | |
| S04 | Lead roll rate | deg/s | B02 | B03 B11 B12 | L | ~0.2 s | |
| S05 | Lead turn rate ω | rad/s | B02 | B05 B07 B09 B12 | L | from S03, S06 | |
| S06 | Lead true airspeed | ft/s | B02 | B07 B11 | L | none | |
| S07 | Lead's circle: centre, radius | ft | B02 | B05 B07 B12 | L | none | radius → ∞ gives the line |
| S08 | own position, velocity, course | ft, ft/s, deg | B15 | B05-B12 | N | none | |
| S09 | own bank, roll rate | deg, deg/s | B15 | B13 B14 | N | none | |
| S10 | own G | G | B15 | B11 B13 B14 | N | none | |
| S11 | own height rate | ft/s | B15 | B10 B11 | N | none | |
| S12 | own KIAS / TAS | kt, ft/s | B15 | B07 B11 | N | none | |
| S13 | slant range | ft | B02 | B03 B06 gauge | L (today W) | none (D11) | |
| S14 | slant closure | ft/s | B02 | B06 B11 | L (today W, 1 s) | from S02 and S08, no smoother (D11) | |
| S15 | line-of-sight rate | deg/s | B02 | B06 (steer-behind [lag pursuit]) | L | 0.5 s | |
| S16 | aspect, HCA, sweep | deg | B02 | B03 B05 B06 B12 | L (today W) | none | |
| S17 | height against Lead (+ above) | ft | B02 | B06 B10 B12 | L (today W) | none | |
| S18 | arc behind s | ft | B02 | B03 B06 B07 | L | none | |
| S19 | offset d, measured | ft | B02 | B03 B06 B07 | L | none | |
| S20 | arc closure | ft/s | B02 | B06 B07 | L | ≤ 0.5 s | |
| S21 | phase weights | 4 × 0-1 | B03 | B05 B06 | L | blend 1.5 s | sum 1 |
| S22 | case | label | B03 | B05 B06 | L | held through the phase | decision [D] |
| S23 | active technique, blend weight | id; 0-1 | B04 | B08 (weight), B06 (start/stop) | N | weight slides (D5: ≥ 6 s path, ≥ 4.3 s height) | one at a time |
| S24 | cue strength, done, abort (per technique) | 0-1; bool; bool | B06 | B04 | L | dwell per cue (D6) | decision [D] |
| S25 | normal reference: path kind, centre, radius, d, side, χmax in/out, k, h_T, ḣ_T, intent, urgency, cap change | mixed | B05 | B08 | L | none | d from S30 |
| S26 | technique reference (same fields) | mixed | B06 | B08 | L | none | |
| S27a | wanted course χ_w (blended) | deg | B08 | B09 | L | blend by S23 | approach angle capped before blending |
| S27b | path turn-rate feed-forward ω_FF | rad/s | B08 | B09 | L | blend by S23 | |
| S27c | height target h_T and rate ḣ_T | ft, ft/s | B08 | B10 B11 | L | blend by S23; back to the stack 15 s | |
| S27d | intent | −1..+1 | B08 | B11 | L | blend by S23 | |
| S27e | urgency u | 0-1 | B08 | B14 | L | max(technique, guard S36) | stated rule |
| S27f | cap change | G | B08 | B13 | L | blend | |
| S28 | d_ss = R(1 − V2/V_L) | ft | B07 | B07, gauge | L | none | |
| S29 | wanted closure w | ft/s | B07 | B07 | L | soft limit 25→60 over 200-400 ft of error | |
| S30 | d command | ft | B07 | B05 | L | slew 60 ft/s | ±250 ft |
| S31 | ω_cmd | rad/s | B09 | B12 | N (own course), L (χ_w) | none | |
| S32 | ΔG_v | G | B10 | B12 | N (own h rate), L (Δh) | none | |
| S33 | throttle | 0-1 | B11 | B15 | N | engine lag in B15 | 0-1 |
| S34 | speed brake | bool | B11 | B15 | L (closure) | hold ≥ 3 s | switch: band ≥ 2× ripple (D8) |
| S35 | predicted pass p, time to pass | ft, s | B12 | B06 (pass clear [make the miss] cue), B14, gauge | L | none (D3) | horizon ≤ 10 s |
| S36 | guard urgency | 0-1 | B12 | B08 | L | rises at once, decays ~2 s | cubic in (600 − p)/100 |
| S37 | turn bounds (lo, hi) on ω_cmd | rad/s | B12 | B13 | L | none | least change |
| S38 | vertical bounds (lo, hi) on ΔG_v | G | B12 | B13 | L | none | least change |
| S39 | bleed request | 0-1 | B12 | B11 | L | as S36 | request, not a setting |
| S40 | cap opening | G | B12 | B13 | L | smooth 550→500 | ≤ stall-warning G |
| S41 | guard side | ±1 | B12 | B12 | L | held ≥ 3 s | internal |
| S42 | commanded G and lift direction | G, deg | B13 | B14 | N | none | cap = min(stall warning, Lead + 1.5 + S40 + S27f) |
| S43 | what gave way at the cap | label | B13 | gauge | N | | telemetry only |
| S44 | drag of the commanded G and climb | thrust fraction | B13 | B11 | N | none | physics cross-feed |
| S45 | achieved G, bank rate | G, deg/s | B14 | B15 | N | onset 1 + 3u; roll ≤ 60°/s | |

### N² chart (row passes to column; [D] = a decision or switch state crosses this cell)

| from → to | what passes |
|---|---|
| B01 → B02 | Lead's true state (the only entry of Lead) |
| B15 → B02 | #2's own state (S08-S12), now |
| B02 → B03 | S03, S04 (phase), S13, S18, S19, S16 (case) |
| B02 → B05 | S01, S02, S05, S07, S16, S21 |
| B02 → B06 | S01, S02, S13-S20 (cues and plans) |
| B02 → B07 | S05, S06, S07, S12, S18, S19, S20 |
| B02 → B10 | S17 |
| B02 → B11 | S03, S04 (roll-in lead), S06, S12, S14 |
| B02 → B12 | S01, S02, S03, S05, S07, S16, S17 |
| B03 → B05 | S21 phase weights (continuous); S22 case [D]: chooses the path's side and the stretched/tight placement |
| B03 → B06 | S21, S22 [D]: gates which cues may fire |
| B04 → B06 | start / stop / abort [D] (the one intended decision channel) |
| B04 → B08 | S23 blend weight (continuous) |
| B05 → B08 | S25 |
| B06 → B04 | S24 cue strength, done, abort [D] |
| B06 → B08 | S26 |
| B07 → B05 | S30 d (the normal path's offset) |
| B08 → B09 | S27a, S27b |
| B08 → B10 | S27c |
| B08 → B11 | S27c (climb feed-forward), S27d intent |
| B08 → B13 | S27f cap change |
| B08 → B14 | S27e urgency |
| B09 → B12 | S31 ω_cmd (to be bounded) |
| B10 → B12 | S32 ΔG_v (to be bounded) |
| B12 → B13 | S37, S38 bounds; S40 cap opening (limits, all continuous) |
| B12 → B11 | S39 graded bleed request |
| B12 → B08 | S36 guard urgency (merged by max) |
| B12 → B06 | S35 predicted pass (pass clear [make the miss]'s cue reads it) |
| B13 → B11 | S44 drag of the commanded G and climb (physics cross-feed) |
| B13 → B14 | S42 |
| B14 → B15 | S45 |
| B11 → B15 | S33, S34 |
| B07 → B11 | nothing (today's power term on the arc error is removed; the ±250 ft saturation cross-feed of D9 would go here as a continuous signal) |
| B12 → B09, B10, B07 | nothing: the guard never retargets a loop |
| B06 → B09-B14 | nothing: the checker fails any technique writing here |

Decision cells: B03→B05, B03→B06, B04→B06, B06→B04. All four are within the supervisor-technique family, which is where rule 3 puts planning. No decision crosses into a loop, the guard or the shaper.

### Resource matrix

| control | writer | limiter | rule when more than one acts |
|---|---|---|---|
| turn (horizontal lift) | B09 ω_cmd | B12 bounds S37 (least change); B13 cap order (turn last); B14 roll and onset rates | B12's bound clamps B09's output; B13 reduces the turn only after the height demand and the level hold are at zero; B14 rate-limits the total G, not each component |
| height (vertical lift increment ΔG_v) | B10 | B12 bounds S38; B13 cap order (height demand gives way first, then the 1 G hold) | the bound may sit below the loop's demand, which makes the guard the effective writer of a vertical escape: this must be written as the rule (D16); the loop's demand resumes as the bound relaxes; no integrator, so no wind-up |
| height target | B08 (blend of B05's stack and B06's plan) | none | the guard never writes it (its vertical acts through S38) |
| throttle | B11 only | none | inputs: S44 physics, S03/S04 roll lead, S27d intent, S39 request, speed trim. Effective intent = min(S27d, −S39). Full power only by intent ≥ +0.8 or the trim at its 15 KIAS limit; idle only by effective intent ≤ −0.8. All continuous |
| speed brake | B11 | none | a switch: on when closure > 60 ft/s for 1 s and effective intent ≤ −0.5; off when closure < 20 ft/s or intent > −0.2; hold ≥ 3 s (D8) |
| G cap | B13 computes min(stall-warning G, Lead's G + 1.5 + S40 + S27f) | B12 writes S40 | S40 rises smoothly 0 → (aircraft − cap) as p goes 550 → 500 ft; flagged on screen when > 0 |
| urgency | B08 = max(technique's, guard's S36) | none | stated rule: max |
| path offset d | B07 for the normal path; B06 for its own path; B08 blends | ±250 ft on B07 | while a technique has weight 1, B07 keeps running on the measured s and d so its d is sane at hand-back (D5) |

## 1b. Sizing on the linear model

Trims: T1 straight and level at the swept place; T2 Lead's 60°/2 G turn, #2 on the circle 650 ft back; T4 Lead at 4 G; T5 Lead's roll-in frozen (rate-limited roll, lag 0.5 s). Lead-only = 0 s added phase at T1/T2/T4 (dead-reckoning exact); whole picture = 0.4 s on all measured signals. Extra-delay margin = phase margin ÷ crossover.

| loop | gains (all guesses) | trim | delay | crossover rad/s | phase margin | gain margin | extra-delay margin | nesting (C4) |
|---|---|---|---|---|---|---|---|---|
| Steering as drafted: Kχ 0.3 /s, k 1/150 ft under χmax 20° (slope 0.565 rad/s per ft×V, inside) | | T1 | Lead-only / whole | 0.47 | 29° / 18° | ∞ / 16 dB | 1.1 / 0.7 s | FAILS C2 |
| same, under χmax 12° (outside) | | T2 | Lead-only / whole | 0.39 | 43° / 34° | ∞ / 18 dB | 1.9 / 1.5 s | FAILS C2 whole picture; asymmetric inside/outside |
| Steering resized: Kχ 0.5 /s; cross-track slope Ke·V 0.17 /s (Ke 0.026°/ft, so k ≈ 1/420 ft under 20°, 1/250 ft under 12°) | | T1 (lag 0.4) | Lead-only / whole | 0.52 | 60° / 48° | ∞ / 14 dB | 2.0 / 1.6 s | steering ÷ arc = 4.8: pass |
| | | T2 (lag 0.3) | Lead-only / whole | 0.52 | 63° / 51° | ∞ / 15 dB | 2.1 / 1.7 s | |
| | | T4 (lag 0.25) | Lead-only / whole | 0.52 | 65° / 53° | ∞ / 15 dB | 2.2 / 1.8 s | |
| | | T5 (lag 0.5) | Lead-only / whole | 0.51 | 57° / 46° | ∞ / 14 dB | 2.0 / 1.6 s | |
| Steering, softer option: Kχ 0.4, Ke·V 0.13 | | T1-T5 | Lead-only / whole | 0.41 | 61-67° / 51-57° | ∞ / 16-17 dB | 2.6-2.8 / 2.2-2.4 s | steering ÷ arc = 3.8: pass |
| Course loop alone (the inner part): Kχ 0.5, lag 0.4 | | any | own course now / 0.4 s | 0.49 | 79° / 68° | ∞ / 15 dB | 2.8 / 2.4 s | the cross-track term is this loop's derivative action, not a nested loop |
| Arc loop: τ_s 10 s, kc 0.5, soft limit inactive, steering as resized | | T2 = T4 | Lead-only / whole | 0.108 | 90° / 88° | 24 / 12 dB | 14.6 / 14.3 s | pass |
| Arc loop: τ_s 10 s, kc 1.0 | | T2 = T4 | Lead-only / whole | 0.106 | 92° / 90° | 22 / 7.7 dB | 15 s | gain margin thin under whole picture |
| Arc loop: τ_s 7 s, kc 0.5 | | T2 = T4 | Lead-only / whole | 0.16 | 87° / 85° | 21 / 8.9 dB | 9.4 / 9.0 s | steering ÷ arc = 3.2: just passes |
| Arc loop: τ_s 5 s, kc 1.0 | | T2 = T4 | whole | 0.25 | 86° | 1.7 dB | 6.1 s | FAILS C2 |
| Arc loop without kc (kc 0) | | T2 = T4 | Lead-only / whole | 0.11 | 86° / 84° | 27 / 15 dB | 13 s | the feed-forward alone delivers the wanted closure; kc only trims model error |
| Vertical PD: 0.005 G/ft, 0.02 G/(ft/s), lag 0.1 | | T1, T2 | Lead-only / whole | 0.68 | 66° / 50° | ∞ / 14 dB | 1.7 / 1.3 s | independent of steering below the cap (vector sum), coupled at the cap by the order |
| Vertical PD, if the G lag is 0.25 | | T1, T2 | Lead-only / whole | 0.68 | 60° / 45° | ∞ / 12 dB | 1.6 / 1.2 s | marginal: measure the lag on the rig first (D13) |
| Vertical PD, alternative 0.004 / 0.02 | | T1, T2 | Lead-only / whole | 0.67 | 70° / 54° | ∞ / 14 dB | 1.8 / 1.4 s | |
| Power slow trim: 1/15 kt/s per kt, Ti 15 s | | T1 | Lead-only / whole | 0.084 | 62° / 60° | ∞ / 33 dB | 13 s | arc ÷ power = 1.3: not nested; decoupled by d_ss (stated cross-feed) |
| Power slow trim: 1/15 kt/s per kt, Ti 45 s (recommended) | | T1 | Lead-only / whole | 0.068 | 85° / 83° | ∞ / 33 dB | 22 s | arc ÷ power = 1.6: see D12 |
| Power trim at 10 s / Ti 30 | | T1 | | 0.104 | 80° | | 13 s | sits on the arc loop's crossover: avoid |
| Today's speed hold (P 0.2 /s) for reference | | T1 | | 0.20 | 92° / 88° | | 8 s | this is what the new trim replaces |
| Power feed-forwards (drag of G and climb, roll-in lead), intent | not loops | | | | | | | size: Δthrottle = (drag at the commanded G − drag at 1 G) ÷ thrust slope; roll-in lead = the same for Lead's expected end bank, ramped over Lead's seen roll time, started when his seen roll rate passes ~10°/s |
| Guard | not a loop when solved as a least-change bound each step | | | effective bandwidth ~1/t_pass (0.1-0.3 rad/s) | a 0.4 s delay costs 2-7° of phase when active | | | the real cost is the predictor's error at Lead's roll-in (D3) |

Starting gains, all guesses, that meet C2-C4 on this model: Kχ 0.5 /s; Ke 0.026°/ft (k ≈ 1/420 ft under the 20° cap, 1/250 ft under the 12° cap, so the small-signal slope is the same inside and out and only the saturation differs); τ_s 10 s; kc 0.5; vertical 0.005 / 0.02 unchanged; power trim 1/15 kt/s per kt with Ti 45 s. If the rig's measured turn-rate lag is over 0.5 s, fall back to Kχ 0.4, Ke·V 0.13.

Blend times against the loops they retarget (rule: at least 3 ÷ the slowest crossover fed):

| blend | drafted | feeds | minimum by the rule | verdict |
|---|---|---|---|---|
| phase change | 1.5 s | the path kind (steering 0.52) | 5.7 s | too short if it moves the path; make the path geometry continuous in Lead's seen bank (circle → line as R grows, already drafted) and blend only the case/side choice, over ≥ 6 s |
| technique weight 0 → 1 | not stated | course and ω_FF (0.52); height (0.68) | 5.7 s; 4.3 s | state it: ≥ 6 s for path fields, ≥ 4.3 s for height fields; pass clear [make the miss] excepted because its plan is a profile whose own ramp supplies the smoothness (D1) |
| pass clear [make the miss]'s path slide home | 2 s | steering | 5.7 s | lengthen to 6 s |
| height target to a technique's | 2 s | vertical | 4.3 s | fails the rule; replace with a profile carrying height and height rate (D1) |
| height target back to the stack | 15 s | vertical | 4.3 s | pass |
| cut-across cap back | 3 s | a saturation, not a reference | - | fine, the approach angle is inside the cap at hand-back |
| arc loop's soft closure limit | 200-400 ft of error | the arc loop itself | - | fine (a shape, not a time) |
| guard urgency decay | ~2 s (my proposal) | the shaper's onset rate | - | fine; it is a filter on a rate limit |

## 1c. The gates

| gate | verdict on paper | evidence |
|---|---|---|
| C1 one owner | pass, with three rules to write | the resource matrix: urgency merged by max; effective intent = min(intent, −bleed request); the guard's vertical bound as the effective writer of an escape (D16). Runtime contest: can't tell on paper |
| C2 linear margins | fails as drafted; passes resized | steering as drafted 18-29°; resized 46-65° at every trim and both delay kinds. Arc 85-92°, gain margin ≥ 12 dB at kc 0.5. Vertical 50-66° if the G lag is ≤ 0.15 s (45° at 0.25 s: D13). Power 62-85° |
| C3 delay margin in the simulator | can't tell on paper | the loops carry 1.3-2 s on the fast ones and 14-22 s on the slow ones; the remaining fragile paths are the technique cues (D6) and the guard's predictor at roll-in (D3) |
| C4 nesting | pass with one stated cross-feed | steering ÷ arc 4.8; vertical and steering independent below the cap; power ÷ arc 1.6, decoupled by d_ss in a steady turn (any speed change is handed to the offset, not to the arc); couples only when d saturates at ±250 ft (D9) |
| C5 interaction | can't tell on paper | by construction: arc-power RGA ≈ 1 in a steady turn (d_ss), steering-vertical ≈ 1 below the cap; at the cap the order makes it one-way. Measure on the rig with 2×2 steps |
| C6 switches | fails as drafted | pass clear [make the miss] 600/600 (zero band); climb-out 15/10 ft/s against arc-closure ripple (unknown; slant closure today ripples 7-25 ft/s); S-turns 600/625 ft against 43 ft of ripple; exit vertical 20/10 ft/s; speed brake 60/35 against 25 ft/s (1×). Phase changes ≤ 3 a turn: pass by construction (Lead's dead-reckoned bank is clean). The case label drives the path side and the cues: pass if written so (D17) |
| C7 the guard stays a guard | can't tell; design intent passes | the gauge measures it; D3's predictor error is the likely cause if it fails in steady entries |
| C8 tool order | pass on paper | the cap is a continuous allocation (question 4 below); the sketch's 2.7 G peak is under the 3.5 G cap at Lead's 2 G |
| C9 energy intent | pass by construction | the drag feed-forward raises throttle with G; a power cut only through effective intent ≤ −0.8, which needs a bleed intent or a bleed request |
| C10 tuning count | fails "fewer" as drafted; "no switches" needs a definition | my count of the draft: perception 3, phase 10, normal follower 7, arc 8, power 10, vertical 6, onset 3, cap 3, guard 7, techniques ≈ 35: about 92, the same as today. Switch-like events: the speed brake plus seven technique starts (blended effects, discrete decisions). Recommend the gate count the normal follower, loops and guard (≈ 47) apart from technique plan constants, and define a switch as an on/off that writes a control |
| C11 model right | can't tell | the rig; the model's two actuator lags (turn-rate lag 0.25-0.5 s, G lag 0.1-0.25 s) are the main unknowns and decide the vertical's C2 verdict; step them first |

## 2. Smaller questions

**The guard's shape and urgency curve.** Use x = (600 − p) ÷ 100 clipped to 0-1. Allowed closing speed toward the pass = c_max (1 − x³); urgency u = x³. That gives: p 575 ft, u 0.016, onset 1.05 G/s, 98% of closure allowed; 550 ft, u 0.125, onset 1.4 G/s, 87% allowed; 525 ft, u 0.42, onset 2.3 G/s, 58%; 510 ft, u 0.73, onset 3.2 G/s, 27%; 500 ft, u 1, 4 G/s, none. A quadratic gives 1.75 G/s at 550 ft, which is firmer than "gentle". Cost in delay margin: none while silent; when active the constraint behaves as a loop of bandwidth about 1/t_pass, so a 0.4 s delay costs 2-7° of phase, acceptable. The slope near 500 ft (3 ÷ 100 per ft) turns a 28 ft prediction ripple into a 0.5 ripple in u near the firm end; filter u so it rises at once and decays over about 2 s (no switch, no band). The predictor must be solved as a least-change bound each step, not iterated through the aircraft, because the loop gain prediction-horizon × slope (c_max × 3 × t_pass ÷ 100 ≈ 6 at 40 ft/s and 5 s) is well over 1. The one real cost is D3: at Lead's roll-in the stale bank puts 84-337 ft of error on a 5 s prediction, which is the whole taper band.

**Cues and hand-backs that can flicker, with the band and dwell each needs.**

| technique | drafted on / off | ripple | needed |
|---|---|---|---|
| pass clear [make the miss] | p < 600 closing / p > 600 opening | 28-50 ft (today's two predictors) | on p < 600 and closing for 2 steps; done p > 650 and opening for 2 s; no-restart 3 s |
| back behind the wing line | sweep < 0° or predicted within 3 s / behind by 15° | sweep is clean (dead-reckoned) | the 15° band is enough; dwell 2 s on done |
| steer-behind [lag pursuit] from abeam | sweep < 20° at Lead's roll toward / captured | clean | fine; the internal reversal cue "definite rise in LOS rate" is a switch on a 0.5 s-smoothed signal: make "crossing Lead's track" the primary cue and LOS rate a backup with a band of 2× its ripple (D18) |
| climb-out reset | arc closure > 15 / < 10 ft/s | unknown; slant closure 7-25 ft/s today | measure arc-closure ripple on the gauge first; on > 15 for 2 s, off < 5 for 5 s (as drafted "closure under 10 ft/s" plus "near the stack" is two conditions: fine with a 5 s dwell) |
| cut-across | > 1,000 ft not closing / < 900 ft and closure < 30 | ~50 ft | 100 ft band = 2×: pass; dwell 3 s |
| exit vertical | spacing error > 100 ft or closure > 20 / within 50 ft and closure < 10 | 43 ft, 7-25 ft/s | range band 50 ft ≈ 1×: widen to on > 150, off < 50; closure band 10 vs ripple: use the 5 s dwell on done |
| S-turns | < 600 ft or closure > 15 / 625 ft and closure < 5 | 43 ft | 25 ft band fails: on < 575, off > 650 with a 5 s dwell |

**±250 ft and a slow wingman.** At T2, +250 ft inside gives 40 ft/s of closure at equal speed; d_ss is 11.5 ft per knot slow (115 ft at 10 kt, 230 ft at 20 kt). At 10 kt slow the cap leaves 135 ft, about 22 ft/s of closure: enough for the ±25 ft/s band near the ideal. At 20 kt slow it leaves 20 ft, about 3 ft/s: the loop is saturated whenever he is slow and stretched. When he is slow and tight the cap does not bite (he wants to be less inside, and −250 ft gives 33 ft/s of opening plus the speed deficit). So ±250 ft is enough up to about 10 kt slow; beyond that the rest must come from the energy intent (full power gives 1 kt/s, so 20 kt takes 20 s) and the planned drop low inside (300 ft ≈ 25 ft/s ≈ 15 kt, ruling 13). Write it as a continuous cross-feed, not a switch: when |d_cmd| saturates, the unmet part of the wanted closure drives the intent (gain when stretched and slow, bleed when tight and fast) (D9). Note the ±120 ft "comfortable range" is already used up by a 10 kt speed difference.

**The G cap with the new order.** It is smooth if built as an allocation: the cap caps the total lift; when the vector exceeds it, the climb part of ΔG_v is trimmed toward zero first, then the 1 G hold toward zero, then the turn, each as a continuous clip. Two things to write down: a descent demand (ΔG_v < 0) never binds at the cap, so the order only ever cuts climb demands; and giving up the 1 G hold means he sinks, which in a turn inside Lead's circle is the low-inside drop of ruling 13 (safe direction, counted as a fault to justify). It becomes a switch only if built as today's "pitch owner" priority. Add a soft knee about 0.2 G below the cap so the trimming starts before the cap, and keep the shaper's onset limit on the total G.

**The build plan.** The order is mostly right; the first slice is not buildable alone and two dependencies run backwards.

- Slice 1 (guard as a constraint) needs a defined turn command and vertical command to bound (slice 2's lift composer and reference) and perception on one delay rule (slice 3a) so its predictor is sized under the rule the model assumes. Built on today's aim-point law and pitch owners it would have two writers on height and no clean turn signal, and would be sized against a plant that slice 3a then changes.
- Slice 3b (pass clear [make the miss]) needs the vertical's blended target with height rate, which is in slice 5.
- Slice 4 (energy intent) is the first reader of the guard's bleed request, so slices 1-3 build a request nobody reads; harmless, but the acceptance "power cut removed" in slice 1 leaves closing cases with no energy tool until slice 4.
- Recommended order: 0 perception onto one rule, the model rows for the whole design, and the rig steps that measure the two actuator lags (acceptance: traces unchanged, C11 on the lags); 1 the reference record, blender, lift composer, shaper with onset by urgency, built as a refactor of today's law writing the reference (acceptance: the close-formation and academic traces unchanged within the shared margins); 2 the normal follower and the arc loop; 3 the guard as a constraint; 3a phases; 3b picker plus pass clear [make the miss], with the vertical's profile target pulled in from slice 5; 4 energy; 5 exit vertical and S-turns; 6, 7, 8a, 8b as drafted.
- Acceptance lines to change: slice 2's "never ahead of the wing line" and "every turn ends 500-900 ft" cannot hold for the abeam case until slice 6; restrict slice 2 to cases with sweep ≥ 30°. Slice 2's "at the cap the vertical gives way before the turn" needs a forced case (a scripted Lead at 3.5 G) since C8 says the cap is not reached in academic turns. Slice 1's "never inside 500 ft" from tight with Lead turning toward him depends on the vertical escape, so it is really a slice 3b acceptance.
- Gates per slice: C2, C4, C11 from the first loop slice onward; C5 from slice 2 (two loops); C6 from 3a; C7 from the guard slice; C9 only from 4; C10 at the structure reviews (after 3b and 7); C3 every slice.

## 3. Findings

**Fix before building**

- **D1. The vertical loop's damping fights planned descents.** The PD's derivative term is on #2's own height rate. A pass-clear descent of 100-160 ft/s meets 0.02 × 100 = 2 G of opposing demand; the 2 s target blend cannot help because 0.005 G/ft × 355 ft = 1.8 G saturates the shaper at once. Fix: the reference carries h_T and ḣ_T, the PD acts on both errors, and pass clear [make the miss] plans a profile (push to a floor G, hold, pull) rather than a target. Cost: one reference field, no new tuning number (the 2 s blend goes). Margin: unchanged (same gains). Gauge case: tight, Lead turning toward him; the height trace follows the planned profile within ±100 ft and the G trace shows one push and one pull. Confidence high.
- **D2. The steering as drafted fails C2.** With k = 1/150 ft under χmax 20°, the cross-track slope is 0.565 rad/s per (ft × V), the course gain 0.3 /s: crossover 0.47 rad/s, phase margin 29° Lead-only and 18° whole picture at T1, 32°/21° at T2. Under the 12° cap it is 40-44°/31-35°, so the loop is also asymmetric inside versus outside. Fix: Kχ 0.5 /s and one slope Ke 0.026°/ft (k 1/420 under 20°, 1/250 under 12°), giving 48-65°. Cost: no new numbers (k changes); +30° of margin, extra-delay margin 1.6-2.2 s. Gauge case: the design sketch's "Lead turning toward him from in position": capture within ±250 ft with one overshoot at most. Confidence high on the margins, medium on the lag assumption (rig step).
- **D3. The guard's predictor uses Lead's bank 0.4 s stale.** At Lead's academic roll-in (30°/s) the bank error is 12°, a turn-rate error of 0.018-0.024 rad/s, which over a 5 s horizon is 84-112 ft of predicted-pass error (216-288 ft over 8 s); at 90°/s it is 253-337 ft over 5 s. The taper band is 100 ft. Fix: dead-reckon Lead's bank by his seen roll rate across the 0.4 s (capped at a plausible end bank), as his position already is; the residual error is from roll acceleration only, about 20-30 ft. Cost: one number (the extrapolation cap). Gauge case: Lead's roll-in from in position; the guard's active share in the first 3 s of entry near zero (C7). Confidence high.
- **D4. Pass clear [make the miss]'s vertical reach versus its cue time.** From tight, p ≈ 355 ft needs h ≈ 515 ft. Unloading to 0 G gives 145 ft in 3 s, 402 ft in 5 s, 580 ft in 6 s; to 0.3 G, 282 ft in 5 s, 406 ft in 6 s. The plan is unreachable with less than about 5.5-6 s to the pass even at 0 G, and the floor G is an unsourced flying number. Fix: the cue must fire with t_pass ≥ 6 s (the 10 s horizon allows it if the predictor runs on the normal follower's path, as drafted), and the plan must take the guard's least-change mix of turn and height when the vertical alone cannot reach 625 ft; name the floor G and its source. Cost: one number (the floor). Gauge case: tight, Lead toward him at 30°/s; least slant ≥ 500 ft with the pass at 625 ± 100 ft. Confidence high on the arithmetic.
- **D5. What blends must be defined at the signal level, and hand-back must re-initialise.** Blending the parameters of unlike paths (a concentric circle versus a held heading) gives a path that is neither; blend the loop inputs (wanted course, ω_FF, h_T, ḣ_T, intent, urgency) as scalars in B08. At hand-back the normal follower's reference must start from where he is (the arc loop running on the measured s and d throughout) or the slide home begins with a step. Cost: none in numbers. Gauge case: pass clear [make the miss] hand-back; no aim jump over 25 ft and no G step over 0.3 G at the hand-back instant. Confidence high.
- **D6. Technique cues need bands and dwells (the table above).** Zero-band cues recreate today's 132-crossing filter line. Cost: about 7 numbers, each with a role; delay margin unaffected. Gauge case: switch counts per turn ≤ 3 (C6).
- **D7. Reorder the build plan** as above. Confidence high on the dependencies.

**Can wait**

- **D8. The speed brake's band** (60/35 against 25 ft/s of ripple) is 1×, not 2×. Make it 60 on / 20 off, 3 s hold, and only under an effective bleed intent ≤ −0.5, or drive it from intent alone. Cost: none.
- **D9. The ±250 ft saturation cross-feed to intent** (above). Cost: one gain. Gauge case: 20 kt slow and 300 ft stretched inside Lead's 60° turn; closes without the cap holding him forever, with the drop low counted.
- **D10. Keep kc ≤ 0.5 and τ_s ≥ 7 s.** kc 1.0 with τ_s 5 s has 1.7 dB of gain margin under whole picture; kc 1.0 at 10 s has 7.7 dB. The feed-forward alone (kc 0) already delivers the wanted closure with 84-86° of margin; kc only trims model error. Cost: none.
- **D11. Drop the 1 s smoother on slant closure** and compute closure from the dead-reckoned Lead velocity and his own; the dead-reckoned signal is already smooth, and 1 s of lag on every cue is the biggest avoidable delay in the design. Cost: −1 number, +1 s of margin on every closure cue.
- **D12. Power trim Ti.** Ti = 15 s gives 62°; Ti 45 s gives 85° at the same 15 s response. Do not make the trim faster than 15 s: at 10 s it sits on the arc loop's crossover (0.104 vs 0.108), and although d_ss decouples them in a steady turn, they couple at the ±250 ft cap.

**Notes**

- **D13.** The vertical's whole-picture margin is 50° at a 0.1 s G lag and 45° at 0.25 s. Under the Lead-only rule it is 60-66° regardless. Measure the lag on the rig before slice 2.
- **D14. Energy question.** If induced drag at 2 G exceeds the roughly 1 kt/s the trainer has in hand at 200 KIAS and 8,000 ft (my guess: it does, by 0.4-1.4 kt/s depending on the induced-drag share), a scripted constant-speed Lead at 2 G is unphysical for #2: he bleeds speed in every academic turn, d_ss grows, and slice 4's "within 15 KIAS of Lead at each turn's end" cannot be met without the low-inside drop in every turn. At 4 G both aircraft bleed several knots per second. This needs the SMM's sustained-turn data or Patrick's ruling.
- **D15.** C10's count ties with today's; the techniques carry about 35 of the numbers.
- **D16.** The guard's vertical "bound" is a writer in effect when it sits below the loop's demand; write the rule so C1 is honest.
- **D17.** The phase's end-of-entry test (within 100 ft, approach under 5°, or 8 s) is a switch; since the phase only chooses the case and side, and blends over 1.5 s, the impact is small. Make the case drive only the path side and the cues.
- **D18.** Steer-behind [lag pursuit]'s reversal cue (above).
- **D19.** The margins are small-signal. A 20° approach-angle step at T1 needs up to 64° of bank change (1.1 s of roll), 29° at T2 (0.5 s): the effective lag at capture is 0.5-1 s and the margin there about 35-45°. One overshoot at capture is expected; the approach caps and the onset limit are what keep it benign.
- **D20.** The cap order only ever cuts climb demands; write that in the spec so nobody builds a case for it on descents.

## Cost summary of the recommended changes

| change | tuning values | delay margin | gauge case that shows it |
|---|---|---|---|
| D1 height-rate reference and profile | +1 field, −1 blend time | unchanged | tight, Lead toward him: height within ±100 ft of the profile |
| D2 steering resize | 0 (k changes) | +30° phase, +0.7 s extra delay | sketch case: capture with ≤ 1 overshoot |
| D3 dead-reckon Lead's bank | +1 cap | guard error 84-337 ft → 20-30 ft | roll-in from in position: guard share ≈ 0 in the first 3 s |
| D4 cue time and floor G | +1 (floor) | - | tight toward him: least slant ≥ 500, pass 625 ± 100 |
| D5 signal-level blend and re-init | 0 | - | hand-back: no jump over 25 ft, no G step over 0.3 |
| D6 cue bands and dwells | +7 | - | switch counts ≤ 3 a turn |
| D8 speed brake band | 0 | - | speed brake ≤ 1 cycle a turn |
| D9 saturation cross-feed | +1 | - | 20 kt slow and stretched inside |
| D11 drop the 1 s smoother | −1 | +1 s on every closure cue | cue timing in the tight case |
| D12 Ti 45 s | 0 | +23° on the trim | speed within 15 KIAS at turn end |

## Questions for the instructor

1. The lowest G for a planned pass-clear push (0 G? 0.3 G?): a flying number with no source yet, and it sets how early pass clear [make the miss] must start (D4).
2. Can the trainer hold 200 KIAS in a sustained 2 G level turn at 8,000 ft at full power? If not, is the drop low inside expected in every academic turn, and should Lead's script lose speed too (D14)?
3. Pass clear [make the miss]'s energy intent: keep (the dive gains about 25 kt, the climb back to the stack spends it) or bleed during the dive?
4. The resized approach slope means that 150 ft off the path he points only about 5° at it, and the 20° cap is reached beyond about 500 ft. Does that match his picture of a gentle correction? The alternative, keeping 1 per 150 ft, fails the margin gate and would bounce at capture.
5. The arc loop's 10 s constant (300 ft of error closes at 30 ft/s): keep 10 s, or 7 s (still within margins, response 30% quicker)?
6. The speed brake in the trail cone [fighting wing]: automatic at all, or only under a bleed intent?
7. The climb-out-of-plane reset ends above Lead and slow; ruling 4 prefers below. Is "above" acceptable there because he is behind on the circle?

## Notes

- The brief's own linear table for today's code and this model agree on the vertical to the degree (0.69, 66°/50°), which supports the 0.1 s G lag and the method.
- The scratch computation (margins.py) sits in the session scratchpad, not in the project; nothing in the repo was opened or changed. Observations: none logged (read-only design review, no skill observations arose).
