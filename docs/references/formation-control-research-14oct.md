# Formation control research: keeping a fighting wing wingman behind a turning Lead (14 Oct 2026)

**What this is.** A read-only web research report written by a Sonnet researcher on 14 Oct 2026 for the Formation Sim's B5 fighting wing technique (spec 7e, TS-233). It covers control papers and public non-RCAF trainer manuals, paraphrased with sources. It is **background only**: Patrick's rulings and the SMM win over everything here (AGENTS.md, "Flying numbers and manuals"). Results the researcher derived itself are marked **(mine)**. Several .mil sites could not be fetched; those items are marked "excerpt only".

**The thread's check (14 Oct 2026).**
- The "half-gain trap" (§1 item 4, §5) is confirmed in the code. In `fighting-wing.js` (17f32caa), the arc loop's `d = dss + (cArc − closing)/ω` settles at half the closure asked for. The fix went to the B5 builder.
- Where the sources disagree on climb or dive (§9), the rulings in TS-233 stand: the miss below Lead (above only if already high); the high yo-yo inside Lead's turn; low inside at MAX when short of energy.
- The Navy and SOP formations are much tighter than ours (cruise about 100 ft lateral; SOP fighting wing 50-100 m). Their techniques carry over; their numbers do not.

## 1. Summary, ranked for the unsolved case

1. **A rotating-frame speed problem (mine).** Inside Lead's circle by d, holding a place in Lead's frame needs V2 = V_L(1 − d/R). For 380-430 ft inside that is 33-37 kt slower. At equal speed the arc closure is V·d/(R − d), 65-76 ft/s (1.4-1.7°/s). No gain in the path law or range loop removes it. The speed must change, the offset must change, or the geometry must be allowed to drift.
2. **The manual technique is the canonical fix.** US Navy T-34C cruise (CNATRA P-357 §701): go to Lead's tail (lag) first, then to the inside (lead). Delaying the lag too long gets the wingman "spit out" of the turn. So make the offset a schedule driven by Lead's roll-in, not only an error loop. Lead's bank leads his turn rate by the roll time, which partly beats the 0.4 s delay.
3. **Combine three tools; none is enough alone (mine).**
   - Speed: each knot slower buys about 11.5 ft of inside offset.
   - Moving sideways: a 10° heading lag gives about 66 ft/s, so about 6 s for 400 ft.
   - Height: 300 ft of vertical turns 400 ft horizontal into 500 ft slant, and costs about 16 kt (about 20 ft of height per knot at 380 ft/s).
4. **The range loop's half-gain trap (mine).** d = d_ss + (wanted − measured)/ω has loop gain 1, because the measured closure ≈ ω(d − d_ss). The closure settles at half the wanted value. Add the feed-forward wanted/ω, or make d incremental (an integrator).
5. **The predictive filter is the published "evasive-manoeuvre barrier"** (Squires et al., §3.1).
   - Evaluate it over the whole relative period; there is a closed form for two constant-turn aircraft. A fixed 5.4 s window has edge effects that look like chattering.
   - When the stay-behind and stay-apart constraints want opposite turns, use one shared evasive manoeuvre and add the vertical as a third direction.
6. **Only a wing-line overshoot is dangerous.** Crossing Lead's flight path behind him is tolerable if separated; ending ahead of his wing line is not. Cost the two differently.
7. **The delay budget.** With 0.4 s of delay and integrator-like loops, keep the crossover at or below about 1.3 rad/s (about 60° of phase margin). Check it with a delay sweep (§5).

## 2. Leader-follower formation keeping with a turning Lead

**Relative motion in Lead's frame (mine, standard).** x is forward, y toward the turn centre, and Lead turns at ω = V_L/R. Holding a place in Lead's frame means:
- #2's speed is ω × his distance from the centre;
- his turn rate is ω;
- his heading is rotated outward by atan(x/(R − y)), about 15° at 600 ft aft.

Wang et al. give the same error dynamics in polar form.

| Inside offset d | Arc closure at equal speed | Speed needed to hold station |
|---|---|---|
| 200 ft | 32 ft/s | −17 kt |
| 300 ft | 50 ft/s | −26 kt |
| 400 ft | 69 ft/s | −35 kt |
| 430 ft | 76 ft/s | −37 kt |

Moving from 400 ft inside to Lead's circle in about 6 s loses about 200 ft of arc.

**2.1 Garcia de Marina, Sun, Bronz, Hattenberger, "Circular formation control of fixed-wing UAVs with constant speeds", arXiv:1703.07736 (2017).** https://arxiv.org/pdf/1703.07736v1, read §II-IV.
- **The law:** each aircraft tracks a concentric circle of radius r + δ (eqs. 12-15). A smaller radius gives a faster angular rate, so the phase error is corrected by radius alone, at equal speed. δ = k_r × the phase errors, saturated so that the radius stays positive (eq. 16). The circle is tracked by an orbit vector field (eqs. 7-8), which converges exponentially.
- **Stability:** the phase-error dynamics are Hurwitz (eq. 19), as a slow-fast cascade over the path loop.
- **Their numbers:** 1.2 m span, 13 m/s, r = 80 m; the phase error halved in about 15 s; steady error ±10°; 30-35 m of height separation for safety.
- **Mapping:** their δ is our d, and their phase error is s/R. Our "arc error ÷ 10 s" is K = 0.1·R/V ≈ 0.68 ft of offset per foot of arc error (mine), so a 600 ft arc error asks for about 410 ft of offset. Copy the eq. 16 saturation. The cascade needs the path follower faster than the range loop: our 3 s look-ahead gives about 0.47 rad/s against the range loop's 0.1 rad/s, a ratio of about 5 (adequate).
- **Limits:** equal constant speeds, offsets small against r, no throttle.
- **Confidence:** high on content; medium on carrying it over to a 2 G turn at 380 ft/s.

**2.2 Wang, Baldi, Feng, Wu, Xie, De Schutter, "A fixed-wing UAV formation algorithm based on vector field guidance", IEEE T-ASE (2023); TU Delft report 22-003.** https://www.bartdeschutter.org/publications/22-003-fixed-wing-uav-formation/22-003-fixed-wing-uav-formation.pdf, read §II-III.
- **The law:** the formation error is taken in Lead's frame, with a "double vector field":
  - wanted course = Lead's course + (2/π)·χ_max·atan(k_y·y_E);
  - wanted speed = V_L + (2/π)·ΔV·atan(k_x·x_E).

  It is asymptotically stable under a gain condition, with wind, and was flown in software-in-the-loop and hardware-in-the-loop.
- **Mapping:** the along-track error gives a bounded speed command (it can never ask for −35 kt), and the cross-track error a bounded course command, the same split as our path law and throttle.
- **Confidence:** medium.

**2.3 Others** (abstract only unless noted).
- **Nelson, Barber, McLain, Beard, "Vector Field Path Following for Miniature Air Vehicles", IEEE T-RO 23(3):519-529, 2007.** https://scholarsarchive.byu.edu/facpub/1902. The orbit vector field; errors decay asymptotically in constant wind; flight-test error under a wingspan. Confidence high.
- **Kim, Cho, Jung, "Circular Formation Guidance of Fixed-Wing UAVs Using Mesh Network", IEEE Access 10, 2022.** Radial and phase errors to a moving reference point, giving course and speed commands, with a Lyapunov proof. Confidence medium.
- **Challa and Ratnoo, JGCD 44(7), 2021, and the "variable virtual target" paper, AIAA 2018** (https://eprints.iisc.ac.in/76098). Which of Lead's manoeuvres a follower can follow, given bank, stall and top speed. Use it as a pre-check: if the speed a place needs is outside the aircraft's range, change the place. Confidence medium.
- **Heintz and Hoagg, ACC 2020.** A leader-fixed rotating frame with a hard speed limit. Confidence low to medium.
- **Park, Deyst, How, the L1 nonlinear guidance law, AIAA JGCD.** Acts like PD on straight lines and is stable on circles; a = 2V²/L1·sin η (from memory). Confidence low to medium.

## 3. Safety filters

**3.1 Squires, Pierpaoli, Konda, Coogan, Egerstedt, "Composition of Safety Constraints for Fixed-Wing Collision Avoidance Amidst Limited Communications", arXiv:1906.03771 (2021).** https://arxiv.org/pdf/1906.03771, read §III-IV, VII and the appendix.
- **The law:** the barrier is built by flying the system forward under an "evasive manoeuvre" the designer chooses and taking the worst-case distance; a QP changes the nominal command as little as possible to keep it non-negative.
- **Closed form:** for constant turn rates the relative position is a phasor sum (eq. 16), so the least separation over all future time is in closed form.
- **Opposite turns:** two constraints can each be valid and still demand opposite turns (eqs. 21-22). The fix is one shared evasive manoeuvre.
- **Mapping:** our filter is this. (a) Use the closed-form relative-period minimum instead of a fixed 5.4 s window. (b) Fix one evasive direction at a time.
- **Confidence:** high on the method, medium on the mapping.

**3.2 Lee, Park, Kim, "Turning Circle-based Control Barrier Function for Efficient Collision Avoidance of Nonholonomic Vehicles", arXiv:2503.20280 (2025).** Read.
- **The law:** one barrier per side, on the turning circle R = u/r_max. The sides are combined by a smooth max, (1/k)·ln((e^{k·h_r} + e^{k·h_l})/2), with k = 5. It runs inside an MPC with a discrete CBF condition (α = 0.01-0.05).
- **Limits:** no hysteresis or chattering analysis.
- **Mapping:** a documented way to stop side-switching. Confidence medium.

**3.3 Park, Kim, Panagou, "Dynamic Parabolic CBFs", arXiv:2510.01402.** Read §III.
- **The law:** h = ṽ_x + λ·ṽ_y² + μ, with μ = k_μ√d: the allowed closing speed grows with the square root of the clearance.
- **Results:** it stayed feasible where collision cones failed.
- **Mapping:** our pass line (500 ft + 1.4 s × closure) is a linear time gap; a square-root law is physically right if the escape is by acceleration. Worth trying. Confidence medium.

**3.4 Xu, Tabuada, Grizzle, Ames, "Robustness of Control Barrier Functions for Safety Critical Control", arXiv:1612.01554 (2016).** The cruise-control barrier h = D − τ·v (τ = 1.8 s). Safety is a hard constraint and performance a soft one, relaxed when needed, so the QP is always feasible. **Mapping:** keep separation hard and stay-behind soft. Confidence high.

**3.5 Infeasibility, delay, switching.**
- **Breeden and Panagou, arXiv:2210.01354 (abstract only):** two barriers can each be feasible and still be jointly infeasible with bounded inputs; design them so the composed set is viable.
- **Predictive safety filters with a backup trajectory** (Wabersich and Zeilinger, arXiv:1812.05506; Tearle et al., arXiv:2102.11907): search results only.
- **Soft-min composition** (Molnár and Ames, arXiv:2309.06647, attribution unverified).
- **Input delay** (Kiss, Das, Molnár, Ames, arXiv:2603.24566, abstract only): a predictor feeds the delayed state forward into the safety QP. No source was found on sensing delay; the equivalent here is dead-reckoning Lead forward 0.4 s (Fable F5, built).
- **Side-switching:** no source gives a hysteresis rule. Pilots avoid switching sides by changing height first.

## 4. Pursuit angle as range control (station keeping)

- **CNATRA P-357 §305 (p. 3-8):** elevator for the vertical, power for fore and aft, aileron for lateral.
- **§312 (pp. 3-31 to 3-32):** in the rendezvous, hold power and use bank to hold the bearing line and set closure. The common error is adding bank when acute with high closure.
- **§312 steps 3-4:** after a break, set 800-1,000 ft, then hold it with pursuit curves. The further Wing's nose is behind Lead's, the faster the range grows. Lead at 11 o'clock (left turn) or 1 o'clock (right) holds range. Lead at 20° of bank; Wing up to 60°.
- **Definitions** (Wikipedia, "Basic fighter maneuvers", medium confidence): lag stops or reverses closure; lead closes fast; a high yo-yo slows closure and moves into lag. A wing-line overshoot is dangerous; a flight-path overshoot usually is not.
- **Closure from the pursuit angle (mine):** closing speed = V2·cos η − V_L·cos α. Its sensitivity to his heading is V·sin η:
  - about 4.7 ft/s per degree at a 45° bearing;
  - about 0.9 ft/s per degree when 700 ft behind on the same circle.

  Heading offsets work at fighting wing bearings and poorly near Lead's tail, which supports starting the lag early.

## 5. Pilot model and delay

- **McRuer's crossover model:** near crossover, pilot plus aircraft ≈ ω_c·e^(−τs)/s. Per the MathWorks documentation (citing McRuer and Krendel, AGARDograph 188, 1974): ω_c 1-10 rad/s, delay 0.1-0.2 s. MIT 16.400 Lecture 10 (2011): 0.1-0.25 s typical, and delay limits the bandwidth. NASA NTRS 20180001222 (Bachelder et al.) uses a 0.20 s pilot delay.
- **Delay margin:** Δτ = PM/ω_c.
- **Phase margin for an integrator plus delay (mine):** PM = 90° − ω_c·τ.

  | τ | ω_c 1.0 rad/s | ω_c 1.25 rad/s | ω_c 2.0 rad/s |
  |---|---|---|---|
  | 0.4 s | 67° | 61° | 44° |
  | 0.3 s | 73° | 69° | 56° |

- **Mapping:** our 0.4 s is about twice a human's. Path loop at or below about 1.3 rad/s (the 3 s look-ahead is about 0.47 rad/s); range loop an order lower (0.1-0.2 rad/s).
- **The delay sweep:**
  1. Add 0, 0.1, 0.2 and 0.3 s of extra sensing delay.
  2. Run the unsolved case and straight and level.
  3. Find the extra delay at which range or bank starts a limit cycle; that is the delay margin.
  4. Aim for at least 0.2 s (a guess).
- **Loop form (mine):**
  - Algebraic: L = e^(−τs)/(T_p·s + 1) has |L| < 1, so it can't go unstable, but it has the 50% steady shortfall (the half-gain trap).
  - Incremental: L = k_i·e^(−τs)/(s(T_p·s + 1)), which needs the delay sweep.

## 6. The vertical for closure and energy

- **Energy (mine; specific energy, Ps = V(T − D)/W):** at 380 ft/s, 5 kt is worth 99 ft of height, 10 kt 195 ft, 15 kt 289 ft, 20 kt 381 ft, 37 kt 677 ft (about 20 ft per knot).
- **In a climb:** 10° removes up to 3.3 kt/s before excess thrust is counted; 5° removes 1.7 kt/s.
- **The high yo-yo:** pitching out of plane trades speed for height, slows closure and moves into lag. The low yo-yo is the reverse. This matches the instructor's rulings.
- **Slant payoff:** for 500 ft slant, 200 ft of height needs 458 ft horizontal, 300 ft needs 400 ft, 400 ft needs 300 ft.
- **CNATRA P-357 §313 (pp. 3-38 to 3-39), underrun in a turn:** nose down to at least 20 ft of stepdown, wings level, move outside Lead's radius of turn, idle so as not to pass ahead; as he passes Lead's tail he matches Lead's bank and rejoins once there's no closure. The trigger is excess closure, or too close to correct with bank.
- **§311 (pp. 3-22 to 3-23), crossunder:** straight down, straight across, straight up. Side changes go through a height change.
- **Formation SOPs v3.0 (2015):** para 124, the outside aircraft in a crossover turn "goes High if necessary"; para 110, the wingman stays above the leader below 2,000 ft AGL.
- **T-44 tactical formation, Fig. 3-3:** the wingman holds 200 ft above Lead in a turn.

## 7. Public trainer formation material (background only)

**CNATRA P-357 (Rev. 09-06), "Flight Training Instruction, Primary Formation, T-34C", 2006.** A single-engine turboprop trainer; a civil-hosted copy at https://cessnas2oshkosh.com/documents/doc02.pdf, read in full.
- **Cruise position (§700-701):** a 45° bearing line, about 3 wingspans lateral, 30 ft stepdown. Fix the stepdown first, then the offset, then the range.
- **Tools (§701):** pursuit curves first, power "a last resort"; 850 ft-lb cruise power.
- **Cruise manoeuvring (§805):** Lead up to 90° of bank at 100-200 KIAS. The common errors are being slow to lag on turns into, getting acute, and too much power.
- **Bank limits (§700):** Lead 45° in level turns; Wing up to 60° in Basic.
- **Turn into Wing (§701, pp. 7-4 to 7-5):** to Lead's tail (lag) first, then inside (lead). Lead's roll rate sets a slight lag or a quick roll inside. Too long in lag spits Wing out.
- **Parade turn into (§310):** Wing is on a shorter radius, so at equal speed he gets acute. Reduce power slightly first, then modulate, and add power on roll-out. In a turn away he is on a longer radius: power, aileron and a little back stick.
- **Knock-it-off (§804):** one trigger is being unable to stay in formation without crossing in front of the leader.
- **Energy (§803):** cruise manoeuvring is an energy loser.

**Formation SOPs v3.0 (2015), North Weald Flying Services**, a civil trainer and warbird SOP; https://www.t6harvard.com/wp-content/uploads/2019/08/Formation-SOP-Ver-3.0-2015.pdf.
- The fighting wing cone is 50-100 m and 50-80° of sweep, ideally 65° at 75 m. The wingman is responsible for avoiding the leader and may cross over in turns; a leader turning toward the wingman takes care.
- Battle turns at 45° of bank with power, or 60°/2 G for experienced crews.
- In a turning join the wingman flies toward the turn's centre, never more than about 20 kt of closure, keeping a height separation as an escape plane. After an overshoot on the inside he stays outside until cleared.

**Other sources.**
- UOAF Codex, "Formation Flying" (unofficial): 30-70° aft of line abreast, about 500-3,000 ft.
- T-44 tactical formation, Fig. 3-3: +200 ft step-up in a turn into.
- CNATRA VT-35 tactical formation (excerpt only): combat cruise bearing 30-45°, 0.7 NM in the T-44; "Dash-2 is always responsible for separation"; in a turn into, the inside aircraft waits until the outside aircraft's nose points at it.
- CNATRA HT-18 (excerpt only): a common error is holding too much bank moving inside, which makes Wing acute.

## 8. The researcher's recommendations (starting numbers are guesses)

1. **Lag first, scheduled from Lead's bank** (P-357 §701): when Lead's bank passes about 10° toward #2, bias the path law outward for about 2-3 s, then ease back to d_ss. The filter caps it.
2. **Fix the range loop's gain:** d = d_ss + wanted/ω, or an incremental d. Saturate it as Garcia de Marina's eq. 16 does, and keep K at or below about 0.7 ft/ft.
3. **Speed feed-forward at roll-in** (P-357 §310; Wang et al.'s arctan form): V2 = V_L(1 − d/R), clipped to about −15 kt, with power added on roll-out.
4. **The vertical as a third input:** climb about 200-300 ft out of plane when the predicted slant is under 600 ft and the arc closure over about 20 ft/s. Go low (outside Lead's radius, idle) when short of energy. Gate side changes on a height difference.
5. **The filter:**
   - the closed-form relative-period minimum;
   - vertical escapes as candidates;
   - separation hard and stay-behind soft;
   - a wing-line overshoot costed far above a crossing behind;
   - dead-reckon Lead 0.4 s ahead;
   - count the roll time to reverse (120° at 60°/s is 2 s) when judging a side change.
6. **Chattering:** a smooth max over the left and right escapes (k ≈ 5) and a dwell of about 3 s on a side change.
7. **Delay sweep** on the final gains: an extra-delay margin of at least 0.2 s, and inner crossover at or below 1.3 rad/s.

## 9. Disagreements

- **Climb or dive:** the Navy underrun dives and keeps the wingman low. The SOPs and the T-44 go high. Our instructor's rulings (TS-233) decide which, per situation.
- **The approach law:** a linear time gap (ours) against a square-root clearance law (Park et al.).
- **Formation size:** Navy cruise is about 100 ft lateral and the SOP fighting wing 50-100 m, against our 500-1,000 ft. The techniques carry over; the numbers don't.
- **Power:** P-357 says power last. For a 35 kt gap it can't be enough, so power plays a bigger part here.
- **Rigid or drifting:** rigid-formation theory matches speed and turn rate; Navy practice lets the bearing drift and corrects after.

## 10. Not found

- No public control law for this exact case: a follower starting inside a turning Lead's circle.
- Full texts not read: Nelson 2007, Challa and Ratnoo, Kim et al., Park/Deyst/How, Wabersich, Breeden and Panagou.
- Not reachable here (DoD certificate or 403):
  - the T-6B formation FTI (CNATRA P-766);
  - the AFMAN 11-2T-6 and AETC 11-248 formation chapters (`aetcman11-248-cockpit.md` in this folder covers 11-248's sight pictures);
  - the cnatra.navy.mil PDFs.
- No RAF, RAAF or RCAF trainer guides.
- No CBF paper on sensing delay, side-switch hysteresis, or a stay-behind half-plane combined with a minimum separation.
- No tabulated McRuer values from AGARDograph 188 itself.
