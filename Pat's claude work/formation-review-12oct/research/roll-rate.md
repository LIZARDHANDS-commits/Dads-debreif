# T-6A / CT-156 full-aileron roll rate from the airframe (research, 12 Oct 2026)

**Everything below is an ESTIMATE FROM STANDARD AERODYNAMICS** (lifting-line theory, flap-effectiveness theory, a mass build-up). No manual gives a roll rate, roll onset or aileron force (checked: NFM, SMM, EFIG, Gen Book; see `manuals.md`). Patrick's practice outranks all of it. Read-only work: no repo file was touched. Sums: `research/roll/roll.py` (design-kit Python, numpy only).

**Patrick's ruling (via the coordinator, 12 Oct 2026):** "Pilot has no issue reaching full deflection at any speed." So full aileron is assumed at every speed; the stick-force estimate (section 6) is a cross-check only and caps nothing.

## 1. Data and sources

| Item | Value used | Source | Confidence |
|---|---|---|---|
| Span b | 33.43 ft (33 ft 5 in) | Public figure (USAF/Navy fact sheets; `docs/references/open-source-performance-baseline.md`); also the 3D model's tip, `src/ui-kit/ct156-model.js` | high |
| Planform | centre section rectangular, 6.27 ft chord, 4.10 ft each side of the middle; outer panels taper straight to a 3.79 ft tip | **Measured from a drawing**: the reference top view scaled by the side view's 33 ft 4 in (Patrick's card "Tail and wing", 11 Oct 2026), as built in `ct156-model.js` (WING) | medium (about ±3 %) |
| Wing area S | 178.2 ft² from the measured planform; published 175.3 ft² (16.29 m², PC-9 / T-6A) or 177.5 ft² | Measured vs public (baseline doc); 1-2 % apart, which checks the measurement | high |
| Aspect ratio, taper | AR 6.27 (published PC-9 figure 6.29); outer-panel taper 0.60; MAC 5.46 ft | from the above | high |
| Dihedral | 8.4° on the outer panels, flat centre section | Measured from the front view, Patrick 11 Oct 2026 (`ct156-model.js`) | medium |
| Airfoil | Pilatus sections PIL15M825 at the root, PIL12M850 at the tip (15 % and 12 % thick); same as the PC-9 | Lednicer, *Incomplete Guide to Airfoil Usage* (m-selig.ae.illinois.edu/ads/aircraft.html) | medium |
| Section lift-curve slope a0 | 5.7 / 6.0 / 6.3 per rad (low/best/high) | standard aerodynamics for 12-15 % sections (about 0.10-0.11 per degree measured, 2π(1+0.77 t/c) theoretical upper bound) | estimate |
| Aileron span | 9.20 to 16.49 ft from the centreline (55 % to 99 % of the semi-span), 7.3 ft long each | **Measured from a drawing**: panel lines on the reference top view, `ct156-model.js` SURFACES.aileron (s0 0.40, s1 0.718 units along the bent wing) | medium |
| Aileron chord ratio | 0.235 (hinge line at 76.5 % chord); area 7.8 ft² each, 15.6 ft² both (8.7 % of S); mean chord 1.08 ft; area centroid at 76 % semi-span | **Measured from a drawing** (same); any nose overhang ahead of the hinge is unknown | medium |
| Aileron travel | 20° trailing edge up, 11° down (a strong differential) | NFM p.1-41 ("Ailerons"); Patrick 12 Oct 2026 (ALL-35) | high |
| Control system | Reversible and unboosted: stick, push-pull rods and bellcranks (NFM p.1-41), push rods, cables and pulleys (paraphrase) (NFM p.6-3); ailerons statically mass balanced with leading-edge weights (p.1-41) | NFM | high |
| Roll aids, tabs | No spoilers or roll aids. Ground-adjustable tabs on each aileron, 20° up / 8° down (NFM p.1-41 to 1-43); electric roll trim moves the ailerons through a spring box, about 6° each way on the ground (p.1-41). No servo or spring tab named, so no sign of an aerodynamic force aid in the manual | NFM | high (that none is named) |
| Forces | (paraphrase) lateral stick force grows with airspeed for a given deflection; control forces light throughout the speed range (NFM p.6-3, p.6-4) | NFM | high, qualitative |
| Weights | basic empty about 4,900 lb (NFM ch.1 "Gross Weight"); usable fuel 1,100 lb: 527 lb in each wing tank, 47 lb collector (NFM Fig 1-21, JP-8); max zero-fuel 5,500 lb (NFM ch.5, p.5-11 area); 5,168 lb = Patrick's chart weight (core `T6A_LIMITS`) | NFM; core | high |
| Fuel tank extent | three integral tanks in a one-piece wing (NFM p.1-27); spanwise extent not given. Modelled as the spar box (15-60 % chord, 0.85 t deep, 90 % usable) filled outboard from the root until it holds 527 lb: ends at about 8-15 ft out (best 10.6) | estimate | low |
| JSBSim cross-check | Cl_p -0.50, Cl_δa 0.29/rad, aileron -20°/+15°, Ixx 4,216 slug ft² empty plus tanks as points 4.2 ft out | `_reference/jsbsim/aircraft/t6texan2/t6texan2.xml` (Aeromatic template, LGPL; numbers only) | low |

Could not source: the real aileron hinge position and nose balance (so the hinge-moment coefficients), the lateral stick travel and gearing, the true wing-tank span, and any measured mass properties (no public Ixx for the T-6A or PC-9).

## 2. Roll damping and aileron power

Method: Glauert lifting line, solved for antisymmetric loading on the measured planform (60 even terms), checked against strip theory. Rolling moment C_l = (π AR / 4) A₂.

| a0 /rad | Cl_p strip | Cl_p lifting line | Cl_δa/τ strip | Cl_δa/τ lifting line |
|---|---|---|---|---|
| 5.7 | -0.82 | -0.48 | 0.80 | 0.48 |
| 6.0 | -0.86 | -0.49 | 0.85 | 0.49 |
| 6.3 | -0.91 | -0.51 | 0.89 | 0.51 |

Lifting line cuts both by about 42 %, so their ratio is almost unchanged (strip theory overstates each, not the ratio). The elliptic-wing check, -(a0/8)·AR/(AR+4) = -0.47, agrees.

- **Tail roll damping:** the tailplane (span about 11.3 ft) and fin add -0.006 to -0.015 (standard ½(S_h/S)(b_h/b)² build-up). **Cl_p total: -0.49 to -0.51 (best -0.50)**, in the usual -0.4 to -0.6 band for straight wings of AR 6. JSBSim's -0.50 happens to sit on it.
- **Flap effectiveness τ** for c_a/c = 0.235: thin-airfoil theory 0.59, the ceiling. A real thick section with a hinge gap gives about 80 % of that: **τ = 0.42 / 0.48 / 0.56** (low/best/high; a standard τ chart reads about 0.45-0.5 at this ratio).
- **Large deflection:** a plain flap loses effectiveness above about 10-12°. Taken as full to 10°, falling to K' = 0.70 / 0.80 / 0.90 at 20° (DATCOM-style shape, estimate). The 11° down aileron is barely touched; the 20° up aileron is.
- **Differential:** each aileron's lift change counts on its own. The effective deflection is ½(20·K'up + 11·K'down) = **12.3° / 13.4° / 14.5°**, against 15.5° if both were fully effective.
- **Cl_δa (per rad of that effective deflection) = 0.20 / 0.24 / 0.29.** JSBSim uses 0.29.
- **Other losses on the real rolling aircraft:**
  - Sideslip from adverse yaw, working through the large dihedral effect, opposes the roll. The NFM notes a yawing tendency at high roll rates (p.6-4). Factor 0.85 / 0.93 / 1.00 (estimate).
  - Wing twist from aileron load: a thick (15 %/12 %), short, one-piece wing, so reversal speed is far above VMO. Loss taken as 8 % / 3 % / 0 % at 260 KIAS, growing with q (a guess). It matters little.

## 3. Steady full-aileron roll rate

p = (2V/b)·(Cl_δa·δ_eff)/(-Cl_p), with V the TRUE airspeed. So pb/2V is about constant and p grows with KTAS.

**Helix angle pb/2V: 0.072 / 0.101 / 0.140** (low/best/high). Pure strip theory with 15.5° fully effective gives 0.127. For comparison, NACA's WWII requirement was 0.07 minimum for fighters (Gilruth, NACA Rep. 755, from memory). Ours is 0.078.

ISA 8,000 ft (σ 0.786), KTAS by the compressible CAS conversion:

| KIAS | KTAS | q psf | p low °/s | **p best °/s** | p high °/s | pb/2V best | Ours (0.45/KTAS, cap 120) |
|---|---|---|---|---|---|---|---|
| 140 | 158 | 66 | 67 | **93** | 128 | 0.102 | 71 |
| 180 | 202 | 109 | 84 | **119** | 164 | 0.101 | 91 |
| 200 | 225 | 134 | 93 | **131** | 182 | 0.101 | 101 |
| 230 | 258 | 177 | 105 | **150** | 209 | 0.100 | 116 |
| 260 | 291 | 226 | 116 | **168** | 236 | 0.100 | 120 (cap) |
| 316 (VMO) | 353 | | 135 | **201** | 287 | | 120 |

At sea level: 88 °/s at 150 KIAS, 117 at 200, 145 at 250, 180 at 316 (best).

Slope: **0.43 / 0.58-0.60 / 0.81 °/s per knot of true airspeed** (ours 0.45). Ours sits at the low edge of the band, about 25 % under the best estimate.

## 4. Inertia and the roll time constant

**Ixx build-up** (slug ft², low/best/high):

- **Wing structure:** 550/600/700 lb. Raymer's general-aviation wing-weight equation gives about 595 lb at Nz 10.5 (7 G × 1.5) and 6,500 lb. Radius of gyration 0.40/0.46/0.52 of the semi-span.
- **Tip lights and fairings:** 3/5/8 lb each at the tip.
- **Main gear:** 80/100/120 lb each, 2.5-4 ft out, retracted.
- **Wing fuel:** from the box model above.
- **Fuselage group (the rest):** engine, crew and tail on the centreline, k 1.2/1.5/1.8 ft.

| Weight | Ixx low | **Ixx best** | Ixx high | R_x = 2k/b (best) | Roskam R_x 0.20 / 0.25 |
|---|---|---|---|---|---|
| 5,168 lb (wing tanks nearly empty; with BEW about 4,900 + crew this is below a real zero-fuel weight) | 1,060 | **1,580** | 2,380 | 0.19 | 1,800 / 2,800 |
| 6,300 lb (1,054 lb in the wings) | 1,850 | **3,050** | 5,000 | 0.24 | 2,190 / 3,420 |

Wing fuel is the swing item: 800-2,700 slug ft² at full tanks, depending on how far out the tanks run. JSBSim's 4,216 (empty) is above the high band, a template value. A C-172 works out to R_x of about 0.20, so 0.19-0.24 for a fuselage-heavy turboprop trainer is plausible. Roskam's single-engine-propeller class value (about 0.25, from memory) bounds it from above.

**Time constant τ_r = Ixx / L_p**, with L_p = q S b²(-Cl_p)/(2V) (best aero):

| KIAS (8,000 ft) | L_p ft·lb·s | τ_r at 5,168 lb (low/best/high) | τ_r at 6,300 lb | p_ss best | Step: initial accel p/τ (5,168 / 6,300) | With 0.2 s stick throw: peak accel | 63 % / 95 % of rate, from stick start (5,168; 6,300) | Time to 90° bank (5,168; 6,300) |
|---|---|---|---|---|---|---|---|---|
| 140 | 12,400 | 0.09 / **0.13** / 0.19 s | 0.15 / **0.25** / 0.40 | 93 °/s | 730 / 380 °/s² | 370 / 260 °/s² | 0.24/0.49 s; 0.35/0.84 s | 1.20; 1.31 s |
| 200 | 17,700 | 0.06 / **0.09** / 0.13 | 0.11 / **0.17** / 0.28 | 131 | 1,470 / 760 | 590 / 450 | 0.21/0.39; 0.28/0.63 | 0.87; 0.96 |
| 260 | 22,900 | 0.05 / **0.07** / 0.10 | 0.08 / **0.13** / 0.22 | 168 | 2,450 / 1,260 | 800 / 650 | 0.19/0.33; 0.25/0.51 | 0.70; 0.77 |

- **What sets the onset:** the airframe's own roll mode (0.07-0.25 s) is as fast as or faster than the pilot's 0.2 s throw (Patrick's ruling). The throw, more than the inertia, sets how the roll builds. The peak acceleration comes at the end of the throw: p_ss/0.2·(1 - e^(-0.2/τ)).
- **Ours** reaches full rate 0.3 s after the acceleration starts building, with the acceleration built over 0.2 s. That gives about 400 °/s² at 200 KIAS and 0.4 s to full rate in a jerk-limited run.
  - Physics at 200 KIAS gives 450-590 °/s² peak and 95 % of rate in 0.4-0.6 s: the same shape.
  - Ours reaches 90° of bank in 1.14 s at 101 °/s. Physics gives 0.87-0.96 s, mostly from the higher rate. With our onset times and the best rate (131 °/s) it is 0.93 s.
- **Proportional to speed:** both acceleration and rate grow with speed, so a fixed fullRateSec gives about the right acceleration at every speed.

## 5. Comparison with the other evidence

| Evidence | Value | Our estimate (best, band) | Reading |
|---|---|---|---|
| Ours (core T6A_ROLL) | 101 °/s at 200 KIAS / 8,000 ft; pb/2V 0.078 | 131 (93-182) | ours is at the low edge of the band |
| Beech Mk II prototype (USNI 1996, snippet, unverified) | about 150 °/s, speed not given | 150 °/s at 230 KIAS / 8,000 ft; 145 at 250 KIAS sea level | consistent if flown at aerobatic entry speeds (SMM 7.4 para 9: aileron roll entry 230 KIAS; NFM Fig 6-1: 180-220) |
| T-6B (Flight International 2005, snippet, unverified) | over 200 °/s at 200 kt | 117 (83-162) at 200 KIAS sea level | above even the high band; it needs pb/2V of about 0.17. Treat it as a misread, or a different speed or condition |
| Pilatus PC-21 | 200 °/s | n/a | a different, hydraulically boosted aircraft with spoilerons |
| JSBSim t6texan2 | 171-228 °/s at 200 KIAS sea level; τ 0.21 s | 117 | its Cl_δa (0.29/rad) on full linear travel, with no large-deflection loss, gives pb/2V 0.15-0.20; a template, low credibility |
| GoPro, Patrick's phase 2 flight | not yet available (`research/gopro.md` did not exist when this finished) | | a student's roll rate will be a lower bound only |

## 6. Stick force (cross-check only; Patrick's ruling caps nothing)

Hinge moment H = Ch_δ·δ·q·S_a·c_a (minus the Ch_α part as the roll builds). Assumed: grip throw ±6 in (5-7) with linear gearing (20° and 11° at full throw), and Ch_δ from -0.10 (well balanced) to -0.45 (plain).

- Even the well-balanced case needs about 31 lb at 200 KIAS and 41 lb at 230 KIAS to hold full aileron in the steady roll.
- To meet Patrick's ruling (full deflection one-handed at about 30 lb up to VMO), the ailerons must be very well balanced: **Ch_δ of about -0.07 to -0.09 per rad** at 230 KIAS.
- So the estimate's message is that the real ailerons carry substantial aerodynamic balance (a set-back hinge or overhang that the drawing does not show). It is no reason to cap the rate.
- Pilot-force references (from memory, unverified): MIL-F-8785C Level 1 centre-stick roll force about 20-25 lb; Gilruth (NACA Rep. 755) 30 lb; NACA wartime roll comparisons used 50 lb.

## 7. Recommendation (in core T6A_ROLL's shape; ESTIMATE from standard aerodynamics, for Patrick's yes)

| Field | Now | Recommended | Why |
|---|---|---|---|
| rollPerKtasDps | 0.45 | **0.58** (band 0.43-0.81) | pb/2V 0.10 from lifting line, with the 20°/11° differential, large-deflection loss and a coordination loss; gives 131 °/s at 200 KIAS / 8,000 ft and 150 at 230 KIAS, matching the Mk II's "about 150" |
| maxRateDps | 120 | **200** (or no cap) | with full aileron at any speed (Patrick), nothing in the physics flattens the rate below VMO; 316 KIAS at 8,000 ft gives about 200 °/s. A 200 cap only stops runaway figures at high KTAS |
| fullRateSec | 0.3 | **0.3, keep** | rate/0.3 gives 435 °/s² at 200 KIAS, inside the 450-590 °/s² physics peak; 95 % of rate in 0.4-0.6 s |
| onsetSec | 0.2 | **0.2, keep** | Patrick's stick throw; the airframe's own τ (0.07-0.25 s) is shorter, so the throw sets the onset |

A gentler alternative, if Patrick feels 131 °/s at 200 KIAS is quicker than the jet rolls: 0.50 °/s per KTAS (pb/2V 0.087, the lower third of the band). Only Patrick's flying or the GoPro trace can choose between them. The question to ask him: "At about 200 KIAS, full stick, how long does a 360° aileron roll take?" At 131 °/s it is about 3.0 s including onset; at 101 °/s about 3.9 s.

## 8. What I am unsure of

- **Aileron geometry is measured from a drawing** (span stations ±0.3 ft, chord ratio ±0.02). The hinge's set-back or nose balance is unknown.
- **The large-deflection loss on the 20° up aileron** (K') and τ are the biggest levers on the rate: together about ±25 %.
- **Coupling losses** (adverse yaw with 8.4° dihedral) are a guess. A coordinated roll recovers some of the loss.
- **Ixx** depends mostly on how far out the wing tanks run and on the wing's mass distribution: ±50 %. It changes τ, not the steady rate.
- The two pilot-report snippets and the MIL-F-8785C force limits are unverified (paywalled or from memory).
- **Not modelled:** rolling at G (rolling-G limit +4.7, NFM ch.5), propeller slipstream on the inner wing, and compressibility (it is small: Mach below 0.55 here).
