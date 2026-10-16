# Fable's report, word for word (14 Oct 2026)

Fable 5.1, high effort, on the brief `fable-fighting-wing-brief-14oct.md` (this folder; terms renamed: the trail cone = fighting wing, steer-ahead / steer-on / steer-behind = lead / pure / lag pursuit, pass clear = make the miss, CONE_WING = FW_WING). The thread's summary and its check against the repo are in `fable-fighting-wing-audit-14oct.md`. Note: Fable assumed 180 KIAS (about 304 ft/s true); the sim flies 200 KIAS at 8,000 ft (about 380 ft/s true), so its turn rates and radii read lower and larger.

---

Design review: the simulated wingman in the trail cone (spec 7e draft 2). Read only the brief. No other file opened, nothing run, nothing changed.

Worked numbers below assume a formation speed of about 180 KIAS, taken as about 304 ft/s true at low level (a guess; the brief gives no speed). Turn rate = g tan(bank)/V, so 30° bank = 3.5°/s and R = 4,970 ft; 45° = 6.1°/s, R = 2,870 ft; 60° = 10.5°/s, R = 1,660 ft. Every gain below is a guess to start from, not a ruling.

## VERDICT

The structure is right and is a clear improvement on today's model: one live wingman, a cone technique of its own, continuous aim instead of a 5° heading list, a lift-vector command through the shaper, and a measurement tool with a saved known-bad run before anything changes. Nothing in it is a blocker. Three things need fixing before building, all of them in the parts that keep #2 safe: (1) the separation guard is under-specified for the one case that matters, Lead turning toward #2, where the geometry puts #2 inside 500 ft in about 4 s if he does nothing, and a vertical-only pass clear inside the cone's 200 ft height band cannot by itself reach 500 ft; (2) the aim-point mechanism (route positions) has authority that scales with Lead's turn rate and is zero with Lead level, so the aim loop must be scheduled by Lead's turn rate and hand the job to power and S-turns when Lead is level, or it will be sluggish in gentle turns, lively in steep ones and useless level; (3) "classify once at roll-in" and a stale seen turn circle leave a hole when Lead reverses mid-entry, which is the collision case; classification must re-run on a change of Lead's turn direction, with hysteresis on Lead's bank. One risk to the already-built close formation: if the reaction time is a single perception setting, moving it from 0.3 s to 0.4 s cuts close formation's phase margin from about 37° to about 25°; the delay must be per technique.

## FINDINGS

F1. Fix before build. The separation guard is not defined tightly enough for Lead turning toward #2. (Section 7, Supervisor "Separation guard"; section 4 "toward" column.)
Why: worked case, #2 in position at 625 ft, 45° sweep, Lead rolls to 45° bank toward him. If #2 flies straight, range is 580 ft at 2 s, 450 ft at 4 s, about 340 ft at 6 s (minimum), then opens. In this geometry everything near Lead, including the wing-up route position, is inside Lead's turn circle (#2 at 2,470 ft from the centre against Lead's 2,870 ft), so immediately matching Lead's bank also closes (#2 would be on a smaller concentric circle at the same speed, gaining about 40 ft/s of arc). The manual's sequence (turn slightly toward Lead's tail, pass clear, then reverse onto the circle) is the only one that works, and the guard must enforce it, not just "the vertical first". A 200 ft vertical offset against a 340 ft horizontal miss gives 395 ft slant range: still inside 500.
Recommendation: write the guard as a geometric predictor with priority, not as a PID: (a) predict the miss distance over a short horizon (3 to 5 s) using Lead's current bank and speed (not a fitted history), and a worst case where Lead tightens by one more step of bank; (b) engage when predicted miss < 600 ft, release when predicted miss > 700 ft and held for 3 s (hysteresis, so the guard and aim loop cannot alternate); (c) its command is the manual's sequence: aim at "where Lead was", about 600 to 650 ft of track behind him (the instructor guide's "go to where Lead was and do what Lead did"), plus the vertical (below by default, the instructor's "see more of Lead") and power off; (d) it owns pitch while engaged (the vertical loop's quick fix is suppressed, F7); (e) it may use G up to the airframe's physical limit and flags it on screen; the Lead +1.5 G and 5 G caps are references and must not block it; (f) the reversal to join the circle is cued by the manual's "definite increase in LOS" (16.20), which the design lists as a cue but never uses.

F2. Fix before build. The 500 ft rule is not defined: slant range, or range in Lead's turn plane? (Sections 7 and plan T31.)
Why: the guard, the "pass clear" vertical and the one test all depend on it. If 500 ft is slant, then passing 200 ft below and 460 ft behind (slant 500) is legal; if it is in-plane, the vertical never helps the rule and only helps the real miss. Also the test wording "never inside 500 ft less a margin" puts a tolerance on the one safety wall.
Recommendation: ask the instructor (question Q1 below). My recommendation: 500 ft slant range is the rule; the guard works to 600 ft predicted so the rule is met without a margin; the test checks the rule itself (500 ft slant), with no margin, and the reason written beside it: this is the instructor's safety ruling, the one wall allowed.

F3. Fix before build. Route positions as the aim point have authority that depends on Lead's turn rate, and none when Lead is level. (Section 7 "Aim loop"; section 2.)
Geometry: the wing-down route position is 120 ft inside Lead's track. Flying d ft inside Lead's circle at the same speed closes range at about ω × d (ω = Lead's turn rate in rad/s): 120 ft inside gives about 7 ft/s at 30° bank, 13 ft/s at 45°, 22 ft/s at 60°, and about 0 with Lead level (aiming δ degrees off a straight-flying Lead changes range only by V(1 − cos δ), under 2% of V at 11°). The route position's angular offset from Lead as seen is 13.5° at 500 ft, 10.9° at 625 ft, 6.8° at 1,000 ft, so the picture is right, but as a fixed amount of correction it is one-fifth as strong at 20° bank as at 60°, and the manual's "aim well inside" for the too-far/away case asks for more than a route position's worth.
Recommendation: make the aim loop's output a desired closure rate c* (ft/s) from range error and closure, then convert it to a radial offset from Lead's circle, d = c*/max(ω, ω_min), slewed and limited (about ±250 ft, or ±20° of aim); the route positions are the "comfortable" amount (120 ft) in that scale, not the end stops. When ω is below about 2°/s, d saturates and the remainder of c* goes to power (and the S-turn job when too close). This is the mechanism the instructor describes (aim first, vertical for quick fixes, power as required) with the maths that makes it work at every bank.

F4. Fix before build. Turn-entry "classify once" plus a seen turn circle that goes stale leave a hole when Lead reverses mid-entry. (Section 7 "Turn entry", "Known open points".)
Why: Lead reversing toward #2 while #2 is moving to the inside turns the "away" case into the "toward" case with #2 closer than in position. A one-off classification keeps steering for the wrong case for the rest of the turn.
Recommendation: classification re-runs whenever Lead's turn direction changes, with hysteresis on Lead's seen bank (turn starts at > 10° held 1 s; ends at < 5° held 1 s; a reversal is a sign change past those thresholds). Compute Lead's circle from his current bank and true airspeed each step (what a pilot reads from his bank), not from the path flown, so "stale" is only the 0.4 s delay. The guard (F1) always runs first and never depends on the classification.

F5. Fix before build. The reaction time must be per technique or close formation's margin drops. (Section 7 Perception: 0.4 s; section "as built": 0.3 s, crossover 2 rad/s, 37° margin.)
Why: 0.1 s more delay at 2 rad/s costs 0.1 × 2 × 57.3 = 11.5° of phase, so 37° becomes about 25°: more overshoot, and the saved close-formation run would no longer match.
Recommendation: reaction time is a field in each tuning table (CLOSE_WING 0.3, CONE_WING 0.4), not a perception-wide setting; the saved-run check in T29 is the proof.

F6. Fix before build. Loop bandwidths and gain separation need writing down before tuning starts. (Section 7 Technique loops; question 7.)
Why: today's model's 1 G per 10° of heading (5.7 G/rad) gives a heading time constant of about 1.7 s (0.6 rad/s), and with a 60°/s roll limit, 0.4 s delay and a 5° heading list re-chosen each step with a 1 ft tie-break, reversals follow. The 0.4 s delay alone gives 45° of phase lag at about 2 rad/s; adding a 1 s closure filter and the roll build-up, the cone's loops must sit well below that, nested a factor of 3 to 5 apart.
Recommendation (guesses to start from): steering (heading to aim line) crossover about 0.3 rad/s (P about 0.05 G per degree, 1 G per 20°; phase margin about 70° after delay and roll lag); aim/range loop about 0.1 rad/s (time constant 10 s: a 75 ft error asks for 7.5 ft/s of closure); vertical natural frequency about 0.4 rad/s (P 0.005 G/ft, D 0.02 G per ft/s, damping about 0.8; close formation's 0.04/0.06 would give 2 G for a 50 ft error); power time constant 15 to 20 s. Do not copy close formation's plane-axis gains.

F7. Fix before build. Two loops want pitch: the guard, the vertical quick fix and the stack loop. Resolve by priority, not by adding. (Section 7 Vertical, Separation guard, Quick fix.)
Why: adding commands produces the fight; and the quick fix is a temporary energy trade (down gains speed and closes; up loses speed and opens), so when the stack loop brings him back to −50 ft it hands the spacing back, which is a slow limit cycle between the vertical and the aim loop if both are at the same speed.
Recommendation: one pitch command at a time by priority guard > quick fix > stack. The quick fix moves the height target (to about ±150 ft, within the 200 ft band) and holds it until the range error is inside the happy band, then the stack target returns slowly (time constant 15 to 20 s) while aim and power carry the correction. Quick-fix engage/release thresholds get hysteresis (for example engage when range error > 150 ft or closure > 20 ft/s; release at < 75 ft and < 10 ft/s; estimates).

F8. Fix before build. The move from close formation into the cone is flown in a range band neither technique is tuned for. (Section 7 Hand-overs; T30.)
Why: close formation's gains (0.04 G/ft) would ask for tens of G at a 100 ft error; the cone's loops are sized for 500 to 1,000 ft. "Drop back first, then move out" from 10 ft to 625 ft needs its own job.
Recommendation: a "stretch" job: a target range that ramps from close to about 500 ft directly behind (line astern extended, Lead in sight, the close-formation deconfliction guard still on), opening at about 10 ft/s (a 6 kt speed difference, by power), then the sideways move out to the swept place on the side he held (16.32, 16.38). Hand over to the cone technique when range passes about 250 ft, bumplessly (initialise the cone loops' trims so their first output equals the current bank, G and throttle). The bumpless transfer as described is sound provided the integrators are back-computed, not zeroed.

F9. Can wait. Turn radius and the seen circle need true airspeed, not KIAS. (Section 7 Perception; "as built" units in KIAS.)
Recommendation: the seen circle uses the shared indicated-to-true helper; say so in the spec.

F10. Can wait. The steering loop should carry Lead's bank as feed-forward, as close formation does. (Section 7 Steering.)
Why: on Lead's circle at the same speed the steady bank equals Lead's; the aim loop then only adds the lead/lag angle, and the P term works on a small residual. This mirrors the close-formation structure (feed-forward plus P plus D) and makes "flies arcs, not straight cuts" the default. HCA − 2 × aspect (manual Fig 16.10) is a free check of being on the circle for the measurement tool.

F11. Can wait. The "swept" and "in the turn" jobs should expect that a 45° swept place cannot be held rigidly in a turn. (Sections 1, 7.)
Geometry: holding 625 ft at 45° sweep on the inside of a 45° bank turn needs 86% of Lead's speed (about 26 kt slower); on the outside 116% (about 29 kt faster). Both are outside the 15 KIAS power band. The only rigid place at equal speed is on Lead's circle nearly astern (about 6° of aspect at 625 ft arc on a 2,870 ft circle). The design's "on or around Lead's turn circle" already says this; make the measurement tool's "done" check expect a near-astern picture during the turn and the sweep only after exit, so the test does not demand the impossible.

F12. Can wait. Lead's speed changes are not in the tool's cone set (T27) and the cone must survive them. Add to the module's future list, with a note that power's 15 KIAS band is the first thing that saturates.

F13. Can wait. Numbers without a source or estimate label in this brief: route position 120 ft out, 75 ft back (no cite here); 0.3 s close-formation reaction (no cite); 8 ft/s jog (no cite); cone height band 200 ft (none); power band 15 KIAS (none); Lead's span 33.4 ft (manual presumably; not cited); "steady" in the done criterion is undefined (suggest closure under 10 ft/s and inside the cone for 5 s; estimate). Labelled as estimates and fine: quick-fix threshold, +1.5 G and 5 G caps, 60°/s roll. Hard walls: 500 ft is the instructor's rule and the one wall allowed (F2); the 200 ft height band and 15 KIAS band are limits inside the loops and should be labelled estimates and shown as references; the 5 G cap must not be a wall for the guard (F1e).

F14. Can wait. The "terminate" outcome is worth proposing. (Known open points.)
Recommendation: when the guard predicts it cannot keep 500 ft (predicted miss under 500 ft at the airframe limit), #2 calls terminate on screen, Lead's plan levels, #2 keeps passing clear. Needs the instructor's yes (Q4 below). Silent bubble busts are the worst outcome for a safety training tool.

F15. Note. Range from apparent size: keep it continuous, do not quantise. (Question 3.)
Why: size is span/range, so a linear loop on size has gain that grows as 1/range squared: lively close in, sluggish far out. Closing on range and closure derived from the delayed observation gives one set of gains across 500 to 1,000 ft; the eye's coarseness is better represented by filtering (closure from size rate, time constant about 1 s, because the manual calls the change subtle; LOS rate about 0.5 s) than by steps, which would create a dead band by the back door and wreck the D term. The instructor's "happy 600 to 650 ft" is a soft band in the aim schedule (low P inside it), not a dead band. Aspect, HCA and LOS are inputs to the supervisor (classification, the reversal cue, the on-circle check), not loop variables, except LOS rate as the reversal cue in F1.

F16. Note. Where a PID is the wrong tool: steering (use a pursuit guidance law with bank feed-forward, F10); the separation guard (a predictor with priority and hysteresis, F1); turn entry and exit (logic from the manual's tables, F4). The aim/range loop and the vertical are proper PD loops; power is PI.

F17. Note. The old model's reversals come from three things the new design already removes: a discrete heading list re-chosen each step with a 1 ft tie-break; a 6 s look-ahead against a hard 600 ft wall that flips the wanted heading on and off; a high heading gain with a roll-rate cap and delay. Continuous aim with a slew, hysteresis on every job switch, and the bandwidths in F6 should remove them. Job changes should blend over 1 to 2 s through the bumpless shaper; the guard's engagement is immediate but its command still passes the roll-rate limit. Remaining limit-cycle risks: guard against aim loop (F1b fixes), vertical against stack (F7), entry/exit flicker on Lead's bank (F4 hysteresis), and delay against gain (F6).

F18. Note. Risks to what is built: close formation (F5, and the technique must be selected explicitly by formation, with new supervisor jobs gated by formation type); the 4-aircraft cone keeps the old code, so share nothing new with it; free manoeuvring unchanged. Interfaces that change: perception gains cone quantities (compute them always, cheap); the supervisor gains jobs; the technique interface becomes technique(state, perception, job, dt) with memory returning G, bank and throttle; the shaper is unchanged. A separate CONE_WING table is the right choice over gain scheduling by formation: the cone controls a region and a picture, not a point, and its loop variables differ.

F19. Note. Plan T27 to T31: order is right, measurement first with a saved known-bad run. Build order within it: T27; T28 perception plus the guard first (the guard is the safety item and testable on its own: level turn toward #2 from in position and from too close); T29 steering and aim with the in-turn job, then swept, entry, exit, then the vertical, then power; T30 the stretch job; T31 the test. The instructor should fly it three times: after the guard plus steering on the toward-turn (the dangerous case), after the full job set, and after the hand-over from close. T30 may be bigger than one task (F8). The measurement tool should record: minimum slant range and minimum in-plane range; time inside 500 and 600 ft; G and roll reversal counts with a definition (sign change of filtered G rate or bank rate above a threshold, so noise does not count); maximum G and roll rate; range, closure, aspect, HCA, LOS histories; aim setting and job histories with switch counts; time to settle; final range, sweep and height; speed difference. The known-bad case is today's model's level turn toward #2 from in position (19 G reversals). The one test: level turn toward #2 from in position, never inside 500 ft slant, in the cone and steady at the end, generous limits; reversal counts are a tool measure for the instructor, not a test expectation.

## LOOP TABLE (all gains are guesses to start from)

| Loop | Input | Output | Form | Starting gains | Limits |
|---|---|---|---|---|---|
| Aim/range (outer) | range error vs 625 ft; closure (filtered size rate, 1 s) | desired closure c*, then radial offset d from Lead's circle (aim between lag point "where Lead was", Lead, and inside points; route positions at d = ±120 ft) | PD scheduled by Lead's turn rate ω; no I (trim lives in power) | c* = −error/10 s, limited ±25 ft/s; d = c*/max(ω, 0.03 rad/s); d slewed 20 ft/s | d ±250 ft or aim ±20° off Lead; low P inside 600 to 650; below ω about 2°/s hand residual c* to power/S-turns |
| Steering (inner) | angle between #2's velocity and the aim line; Lead's bank; aim-line rotation rate | lateral G and bank (lift-vector command) | pursuit guidance: feed-forward Lead's bank + P, no I | P 0.05 G/deg (1 G per 20°); crossover about 0.3 rad/s; feed-forward V × aim-line rate / g | G ≤ Lead + 1.5 (guard: airframe limit, flagged); roll rate ≤ 60°/s via shaper; aspect never past 90° |
| Vertical | height vs Lead (target −50 ft, or ±150 ft quick fix); vertical rate | G increment | PD, close formation's form, lower gains | P 0.005 G/ft, D 0.02 G per ft/s (0.4 rad/s, damping 0.8) | ±200 ft of Lead (estimate); one pitch owner at a time: guard > quick fix > stack |
| Power | speed vs Lead; residual c* the aim cannot deliver | throttle | PI, slow | time constant 15 to 20 s; I held at limits | ±15 KIAS of Lead (estimate); throttle rate limited by shaper |
| Separation guard | predicted miss over 3 to 5 s from Lead's current bank and speed, plus one step tighter | overrides aim (lag point 600 to 650 ft back), pitch (pass clear below), power off | geometric predictor with priority and hysteresis, not PID | engage predicted miss < 600 ft; release > 700 ft held 3 s | G up to airframe limit; never a reversal across Lead's nose; "terminate" if 500 ft cannot be kept (needs ruling) |

## QUESTIONS NEEDING THE INSTRUCTOR'S RULING

Q1. Is the 500 ft rule slant range or range in Lead's turn plane? Recommended: slant range; the guard works to 600 ft predicted; the test checks 500 ft with no margin.
Q2. When Lead turns toward #2 from in position, does #2 pass clear below (your "see more of Lead") or above? Recommended: below by default, above if he is already high.
Q3. Can the guard exceed Lead +1.5 G, up to the airframe limit, when that is what keeps 500 ft? Recommended: yes, flagged on screen.
Q4. Add a "terminate" outcome (#2 calls it, Lead levels) when 500 ft cannot be kept? Recommended: yes.
Q5. Is the steer-behind aim point "where Lead was, 600 to 650 ft of track back" an acceptable picture beside your wing-up route position? Recommended: yes, with the route positions as the comfortable amount.
Q6. Reaction time: 0.3 s stays for close formation and 0.4 s is the cone's? Recommended: yes, per technique.
Q7. Happy band 600 to 650 ft, steer-ahead beyond 700, steer-behind near 500 (your guesses) become the aim schedule's flat zone and end points? Recommended: yes, labelled his ruling once confirmed.
Q8. What counts as "steady" for done? Recommended: closure under 10 ft/s and inside the cone for 5 s (estimate).

## ANSWERS TO THE 12 QUESTIONS, IN SHORT

1. Captures the technique and tables; missing now: F1, F2, F3, F4, F8; can wait: F11, F12, F14.
2. Sound in turns of about 30° bank and more; weak in gentle turns; useless level; in the toward case every nearby aim point is inside the circle at entry, so the guard and the manual's sequence carry it (F1, F3, angles in F3 and F11).
3. Close on range and closure derived from the delayed observation; cues feed the supervisor; filter, do not quantise (F15).
4. Loop table; PID is wrong for steering, the guard and entry/exit (F16).
5. Yes, with hysteresis everywhere and blending; remaining limit-cycle risks and fixes in F17, F1, F7.
6. Separate technique with its own table is right; hand-over sound if integrators are back-computed and a stretch job carries the transit (F8, F18).
7. Steering about 0.3 rad/s, range about 0.1 rad/s, vertical about 0.4 rad/s, power under 0.07 rad/s (F6).
8. F1, F4, F7, F11, F14; climbing or descending turns: keep the stack in height relative to Lead and the circle in Lead's lift plane, and say which in the spec (the brief does not); #2 starting outside the cone needs a "rejoin to cone" case in T27, flown by the same aim loop with power.
9. F5, F18.
10. F13, F2.
11. F19.
12. F19.

## WHAT I COULD NOT CHECK

No code, manuals or figures were available: the actual perception delay implementation (global or per technique), close formation's loop code and saved run, the trainer's real formation speed and turn radii (assumed 180 KIAS, about 304 ft/s true; a guess), the route-position and span sources, whether the shaper's pressure sizes suit the cone, and the manual figures 12.20 to 12.23 and 16.10 themselves. Nothing was run.

---

**Patrick's rulings on the questions (14 Oct 2026):** Q1 slant range; Q2 below, above if already high; Q3 yes, flagged; Q4 **no Terminate** ("leave terminate out ... If the bubble gets nicked wing just assertively corrects out of it"); Q5 yes; Q6 and Q7 already his answers (0.4 s fighting wing, 0.3 s close formation; 600-650 ft happy, lead beyond 700, lag near 500); Q8 replaced by his "Lead can maneuver as required in fighting wing and once straight and level 2 settles in the cone. Lead does not wait for 2 at all". Spec 7e draft 3 approved, TS-233.
