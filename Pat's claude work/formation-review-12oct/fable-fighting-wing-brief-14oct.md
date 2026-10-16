# Design review brief: the simulated wingman in the trail cone

## Context and purpose (please read first)

This is a design document for a **flight-school training tool**. Patrick, a flight instructor at a basic pilot-training school, is building a debrief and formation simulator for student pilots on a single-engine turboprop **basic trainer aircraft**. The simulator shows students how a wingman flies in formation behind a lead aircraft and keeps a safe position. The aim of the tool is to **make formation training safer and prevent mid-air collisions**: students learn, on the ground, what a correct and safe wingman position looks like and how an instructor corrects it.

**The absolute priority of the design is that the simulated wingman never comes close to hitting the lead aircraft and always stays in a safe position.** Everything else (smoothness, realism, accuracy of the picture) comes after that.

Everything you need is in this one document. Please do not open any other file.

## Terms used here

- **Lead**: the lead aircraft. **#2**: the wingman being simulated.
- **The trail cone** (the school's loose formation): #2 sits 500-1,000 ft from Lead, 30-60° back from Lead's wing line (the "sweep"), so he can follow Lead through turns, climbs and descents without being tied to one exact spot. **Never closer than 500 ft** (the instructor's ruling).
- **Close formation**: #2 a few feet from Lead's wingtip (echelon, route, line astern, the corner). Already built.
- **Steering modes** (the school's names for how a following aircraft manages spacing):
  - **steer-ahead**: #2's flight path points ahead of Lead (Lead low in #2's windscreen), inside Lead's turn circle. It closes the range.
  - **steer-on**: #2's flight path points at Lead (Lead in the middle of the windscreen). Closes less; zero line-of-sight rate.
  - **steer-behind**: #2's flight path points behind Lead (Lead high in the windscreen), outside Lead's turn circle. It opens the range and lowers the closure and aspect that the other two build.
- **Lead's turn circle**: the circle Lead is flying in a turn. Following on or around it keeps a constant, safe spacing.
- **Route position**: a close-formation place out along Lead's spinner-to-wingtip line, about 120 ft out and 75 ft back, one on each side ("wing-down" side = inside Lead's turn, "wing-up" side = outside).
- **Pass clear**: when the geometry would bring #2 too close, he moves out of Lead's way first (usually by going above or below Lead's level, or by steering behind), before anything else.
- **Free manoeuvring**: a separate mode (aerobatics in formation), not part of this review.

## The simulator as built (for your reference)

- Every aircraft is a point mass flown by the trainer's performance model (thrust, drag, roll rate and roll build-up, G build-up, stall warning), stepped every 0.05 s. Units: feet, seconds, degrees, G, knots indicated (KIAS).
- Lead flies a plan; #2 is a **live wingman**: each step he reads what he can see of Lead and moves his controls, like a pilot.
- **The live wingman's structure** (built for close formation, flown and approved by the instructor):
  1. **Perception**: what #2 can see of Lead (Lead's position, velocity and the direction of his lift, nothing from Lead's plan), about **0.3 s late** (reaction time), with rates lightly smoothed as an eye judges motion. What he feels himself (his G, his throttle) is immediate.
  2. **Supervisor**: picks the job (on station; a small move; a large move; "out before up" when he is under Lead; a move between places at a jogging pace of 8 ft/s; a deconfliction guard: never within a wingspan of Lead, never ahead of Lead's wing line). Each job switch has a dead band so it never flickers.
  3. **Technique (close formation)**: three small loops in Lead's wing frame, one per control: pitch (G) on up/down, roll (bank relative to Lead's) on in/out, power on fore/aft. Each is feed-forward (what he sees Lead doing, including the motion of his place as Lead rolls and turns) plus P (how far off), D (how fast it is changing, on the measured motion, never the error) and a weak I (a slow trim, held at limits). One shared ~10-line PID function `pilotAxis(memory, deviation, rate, dt, gains)` returns the pressure and new memory. Starting example: plane axis P 0.04 G/ft, D 0.06 G per ft/s; with the 0.3 s delay it crosses over near 2 rad/s with about 37° phase margin. No dead band on station (instructor's ruling): he corrects any drift.
  4. **Shaper**: the pilot's hand. Pressure sizes per job, how fast torque may change, inputs eased in, never stepped; a new job starts from the inputs he already has (bumpless). The aircraft's own roll and G build-up are applied once, in the aircraft model.
  5. **The aircraft**: the same point mass as Lead.
- Each tuning table is a frozen object of numbers, every number with a source or marked "estimate".
- Measured results in close formation: holds within 0.04 ft straight and level; 60° turns within about 2 ft.

## The trail cone today (what is being replaced)

A separate older model flies #2 in the trail cone. It reads Lead's exact state each step (no reaction time). It follows the path Lead has flown (his turn circle, worked out from his bank and speed where he flew it), aiming about 650 ft of arc behind Lead, never closer than 500 ft. It steers by 1 G of turn per 10° of heading error. To keep 500 ft it looks 6 s ahead with Lead holding his turn and, if the heading it wants would bring it inside 500 ft plus a 100 ft margin, it picks the nearest heading on the behind side from a list in 5° steps (up to 20° off), re-chosen every step, a new choice winning by 1 ft. It stacks 50-100 ft below the aircraft ahead. Its G is capped at Lead's plus 1.5 G (and 5 G overall), roll up to 60°/s (estimates).

**Measured problems:** in a 25 s level turn toward #2 his G reverses 19 times and his roll 10 times (pinned between 0.52 and 3.5 G); in a 4-aircraft version the trailing aircraft reverse their roll 28-34 times in 80 s. The instructor: today's #2 "kind of cuts off the circle in straight lines and overbanks and overshoots desired spacing". The older planner that flies changes into the cone flicks his roll at 81-98°/s at its hand-overs.

## The proposed design (spec section "7e", draft 2)

### 1. What the formation is for and its goal (school manual 12.29 paras 68-69, paraphrased)
A loose, easily manoeuvred formation in which each pilot can keep a good lookout while the formation holds together. #2 keeps 500-1,000 ft and 30-60° of sweep. When Lead manoeuvres, #2 is free to manoeuvre as he needs to **stay behind Lead and keep separation**: moving in directly behind Lead, moving to the other side, using the vertical, adjusting power, or any mix. When Lead stops manoeuvring, #2 returns to the swept position, either side. The prime objective is keeping separation by flying on or around Lead's turn circle, using steer-ahead or steer-behind as needed (para 74).

### 2. Steering modes (manual 12.30 paras 71-74; instructor guide p.391)
As defined in "Terms". The amount of each depends only on how hard Lead is manoeuvring. Instructor guide: steer-ahead is inside Lead's turn circle, steer-behind outside it; "go to where lead was and do what lead did"; power if required.

### 3. The visual cues a pilot reads (manual 12.2 paras 4-9; 16.16)
- **Closure**: how fast the range changes, judged by how fast Lead grows in size; the change from low to high closure is subtle, so watched constantly.
- **Aspect angle**: #2's position relative to the line through Lead's long axis (0° directly behind Lead, 180° in front). A little high is "hot", a little low "cold".
- **Range**: judged by Lead's size in the canopy against cockpit features at known distances (the instructor guide: the flat part of the instrument panel and the fire lights). Lead's 33.4 ft span fills about 3.8° at 500 ft, 2.7° at 700 ft, 1.9° at 1,000 ft.
- **Line of sight (LOS)**: how fast Lead moves across the windscreen; zero when holding constant range on Lead's turn circle.
- **Heading crossing angle (HCA)**: the angle between the two headings. On Lead's turn circle, LOS and closure are zero and HCA is about twice the aspect (manual Fig 16.10).
- A definite increase in LOS is the manual's cue to reverse when joining with Lead turning toward #2 (16.20).
- Sweep picture references: "nose wingtip" and "nose mid wing" sight pictures (instructor guide p.391).

### 4. Turn entry (manual Figs 12.20-12.22)
| Where #2 is | Lead turns away from #2 | Lead turns toward #2 |
|---|---|---|
| In position | Promptly aim inside the turn circle (steer-ahead), move in behind Lead: stops the range growing | Move toward Lead's tail by turning slightly toward Lead (steer-behind), pass clear (steer-behind or height), then reverse and promptly join the turn circle by matching Lead's turn (steer-on) |
| Too far / behind | Range will grow: immediately aim well inside the turn circle (steer-ahead): stops the range growing, starts closure | Opportunity: delay the turn to close slowly (steer-ahead), then progressively join the turn circle (steer-on) |
| Too close / forward | Opportunity: promptly aim at Lead's tail (steer-on) and join the turn circle; the extra distance fixes the close range | Closure and angle problems: first pass clear (a climbing turn above Lead or a descending turn below him), which likely leaves #2 outside the turn circle; then rejoin it with geometry (steer-on) |

### 5. Turn exit (manual Fig 12.23)
When Lead rolls out: too close or closing fast, flow to the outside of the turn (longer path); too far or range growing, flow to the inside (shortest path); good range and no closure, either side. Then back to the swept position.

### 6. How the instructor flies it (his words, 14 Oct 2026)
- Technique: "smoothly set the G and aimpoint to either [steer-ahead, steer-behind or steer-on] depending on what we need ([steer-ahead] if more than 700, [steer-behind] if near 500 ... numbers are a guess), then smoothly reset to [steer-on] once we're happy". "We also use geometry on turn entry and turn exit to fix/maintain our spacing."
- Aim point in a turn: "I personally fly at the 'route position' instead of directly at lead in turns", "sometimes his wing down, sometimes his wing up route for spacing/energy". Wing-down (inside the turn) acts as a built-in steer-ahead, wing-up (outside) a built-in steer-behind, Lead himself steer-on. So in his picture Lead sits further left or right in the windscreen than in the manual's pictures.
- Range by eye: "too far or too close is visual - how big his wings are in my windscreen and how much detail I can see".
- Height: "most people fly ... stacked slightly high or low in case lead turns hard in front of them"; "stacking below is nice because you see more of lead". (The manual: "level or slightly below", no number.)
- Order of controls: the aim point for ordinary spacing; "vertical when I need to fix my spacing quickly or bleed energy quickly or [get out of Lead's way], power as a last resort but as required to stay in position".
- Too close with Lead level: "S turns back and forth from sides of the cone" (his own technique; not in the manuals).
- **Rulings for this design:** reaction 0.4 s; preferred ("happy") range 600-650 ft, steer-ahead beyond about 700 ft, steer-behind near 500 ft; default swept place 625 ft at 45°, 50 ft below Lead; the move from close formation into the cone is flown by the live wingman in this step; the opening turn from the cone to a wider formation is a later step.

### 7. The proposed design: one wingman, a cone technique of its own
The live wingman gains a second technique beside close formation's, with its own quantities, loops and tuning table (`CONE_WING` beside `CLOSE_WING`), reusing the same `pilotAxis` function with its own gains. Close formation holds a point; the cone holds a region and a picture, so its quantities are range (Lead's apparent size), closure, Lead's place in the windscreen and the aim point.

- **Perception** (0.4 s late, only what he can see): Lead's position, velocity, lift direction; derived range and closure (as apparent size and its rate), bearing and sweep, aspect, HCA, LOS, height against Lead, Lead's bank, Lead's turn circle as seen (centre and radius from the turn he is flying), and the two route positions.
- **Supervisor jobs** (each with a dead band):
  - *Swept*: Lead level; return to or hold the swept place on his side, anywhere in the cone, stacked slightly below. Too close or closing with Lead level: S-turns across the cone until the range is back.
  - *Turn entry*: at Lead's roll-in, classify once (in position / too far / too close; toward / away) and set the first aim per the table.
  - *In the turn*: on or around Lead's turn circle; the aim slides between wing-down route position (steer-ahead), Lead (steer-on) and wing-up route position (steer-behind) by range and closure; back to steer-on once happy.
  - *Turn exit*: per section 5; then swept.
  - *Separation guard (always first)*: if predicted range will pass inside 500 ft, pass clear: the vertical first (above or below Lead), with steer-behind; never a hard reversal across Lead's nose.
  - *Quick fix*: a range error or closure past a threshold (estimate) also takes the vertical.
- **Technique loops:**
  - *Aim loop*: a steering setting from steer-behind through steer-on to steer-ahead, set from range error and closure (P and rate), slewed so it moves smoothly; it places the aim point between wing-up route position, Lead and wing-down route position (or the entry's first aim).
  - *Steering*: G and bank to bring his flight path onto the aim point as a curve, set smoothly (a lift-vector command), so he flies arcs, not straight cuts, and never overbanks.
  - *Vertical*: holds the stack, takes the quick fixes and passing clear, inside the cone's height (within 200 ft of Lead).
  - *Power*: last, slow, on what geometry and the vertical leave; within 15 KIAS of Lead.
- **Shaper**: as close formation's.
- **Hand-overs**: switching technique starts the incoming one from his bank, G and aim and blends (bumpless). Moving from close formation into the cone: drop back first, then move out sideways to the side he held (manual 16.32, 16.38), keeping Lead in sight.
- **Known open points**: Lead's turn circle as seen goes stale when Lead changes his turn rate or plane suddenly. The manuals have a "terminate" call (any member calls it, Lead levels his turn) for when someone cannot keep position; the design has no "cannot keep 500 ft" outcome yet and adding one needs the instructor's yes.
- **Numbers to rule:** steer-ahead beyond ~700 ft, steer-behind near 500 ft (instructor's guesses); happy 600-650 ft; swept 625 ft at 45°, 50 ft below; quick-fix threshold (estimate); G at most Lead's + 1.5 G and 5 G overall (the school's wingman +5 G is a reference); roll up to 60°/s (estimate).
- **Boundaries:** the 4-aircraft cone keeps today's model until a later step; free manoeuvring unchanged; close formation unchanged (checked against a saved run).
- **Done:** in the cone (500-1,000 ft, 30-60°, within 200 ft of Lead's height) and steady, Lead's manoeuvre done.

## The plan (step "B5")
- T26 this design approved by the instructor, then this review.
- T27 the measurement tool's cone set: level turn toward #2 and away, from in position, too far and too close; reversal; wings level; climb; the turn buttons (20°, 45°, 90°, 180° turns); close formation to the cone. A run saved before the change; today's model is the known-bad case (cuts across, overbanks, overshoots; 19 G reversals).
- T28 perception's cone quantities and the supervisor's jobs.
- T29 the cone technique (aim loop, steering, vertical, power) behind the live switch; today's model kept until the instructor has flown the new one.
- T30 the blended hand-over from close formation into the cone.
- T31 the step's one automated test (a level turn toward #2 from in position: never inside 500 ft less a margin, in the cone at the end; generous limits, no tight time gates) and documentation; then the instructor flies it.
- Project rules: each task touches at most about 5 files; tests check what a pilot would recognise, with generous limits; numbers need a source or "estimate"; manual limits are references, not walls (but **never closer than 500 ft** is the instructor's safety rule); after two failed fixes, stop and find the cause.

## Questions for the review

Please answer each with a verdict, reasoning and a concrete recommendation. Keep the absolute priority (never close to Lead; always a safe position) in mind throughout.

1. Does the design capture the instructor's technique and the manual's turn entry and exit guidance? What is missing that matters now, and what can wait?
2. Is choosing steer-ahead / steer-on / steer-behind through the aim point (wing-down route position, Lead, wing-up route position) a sound mechanism at 500-1,000 ft, including when Lead turns toward #2? Compare with "aim inside/outside Lead's turn circle". Give the geometry (angles) where it helps or fails.
3. Should the loops close on the visual cues (range from apparent size, closure as its rate, LOS, aspect, HCA) or on positions derived from them? Effects on realism, stability, tuning and the 0.4 s delay. How should perception compute and filter each cue (how coarse should range-by-size be, given the instructor's "no dead band" in close formation)?
4. For each loop (aim loop, steering, vertical, power): input, output, form (P / PD / PI / PID, or a geometric guidance law), starting gains or how to derive them, limits; where a PID is the wrong tool.
5. Will dead bands, rate limits and supervisor job switches with hysteresis remove the reversals? Should job changes blend? Where can limit cycles arise (separation guard vs aim loop, vertical vs stack, delay vs gain)?
6. Architecture: a separate cone technique with its own tuning table, vs one technique gain-scheduled by formation. Is the bumpless hand-over from close formation sound in the structure described? What interfaces change?
7. Stability margins with the 0.4 s delay: rough bandwidth limits for the range and steering loops.
8. Edge cases: Lead reversing mid-entry; Lead climbing or descending in a turn; #2 starting outside the cone; the separation guard and the vertical loop wanting the same axis; Lead's seen turn circle going stale; G or roll limits reached; what #2 should do if 500 ft cannot be kept (and whether a "terminate" outcome is worth proposing to the instructor).
9. Risks to what is already built (close formation, the 4-aircraft cone model, free manoeuvring).
10. Any number in the design without a source or estimate label; any manual figure treated as a hard wall.
11. Are T27-T31 right-sized and in the right order? What should the measurement tool record, what is the known-bad case, and what is the one test?
12. Recommended build order, and where the instructor should fly it.

**Report format:** a one-paragraph verdict; findings F1..Fn, each with severity (blocker / fix before build / can wait), what, why, recommendation, and the design section it touches; a loop table (loop | input | output | form | starting gains | limits); questions needing the instructor's ruling, one line each with your recommended answer; what you could not check. Short plain sentences; mark guesses as guesses.
