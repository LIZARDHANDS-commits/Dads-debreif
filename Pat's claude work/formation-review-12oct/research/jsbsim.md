# JSBSim T-6 (aircraft/t6texan2/t6texan2.xml) against our handling numbers

All paths under `_reference/jsbsim/`. F = `aircraft/t6texan2/t6texan2.xml`; E = `engine/PT6A-68.xml`; T = `src/models/propulsion/FGTurbine.cpp` / `.h`. Numbers and line references only; no code copied.

## Is it a template? Yes.
- F:8 author "Aeromatic / David Culp"; F:12-19 note: "publicly available data, ... textbooks, and guesses ... only validated to the extent it seems to fly right". Made with the Aeromatic generator (a form that turns a few inputs into coefficients).
- E:4-9 "Author: Aero-Matic v 0.8", input "power 1100 hp". E is a copy of the generic PT6-27 template with different thrust and fuel flow (diff against engine/PT6A-27.xml: only milthrust, maxthrust and tsfc differ; internal name still "PT6-27", E:14).
- F:114 the thruster is `direct` (no propeller file): there is no propeller, governor or prop inertia in the model.
- No reference to T-6 flight test, manuals or reports anywhere in the files. Only the geometry looks real.

## Table

| Quantity | JSBSim value (file:line) | Ours | Difference | Comment |
|---|---|---|---|---|
| Wing area | 176 ft2 (F:27) | not in numbers.md | n/a | about the real T-6A (roughly 175 ft2, from memory) |
| Span / chord | 33.4 ft (F:28) / 5.27 ft (F:29) | n/a | n/a | span plausible; chord is just S/b |
| Empty weight | 5,000 lb (F:56) + 2 x 500 lb fuel (F:133,142) = 6,000 lb | 5,168 lb (T6A_LIMITS.weightLb) | +832 lb at full fuel | empty weight is a guess |
| Ixx / Iyy / Izz | 4,216 / 7,608 / 10,355 slug ft2; Ixz -1,000 (F:52-55) | none | n/a | Aeromatic estimates |
| Aileron deflection | input -1..+1 maps to -20 deg..+15 deg (F:180-183, 190-193), 0.017 rad per deg (F:179) | none | n/a | asymmetric; the roll moment uses the left aileron only (F:468), so one direction gets 15 deg and the other 20 deg: an artefact |
| Cl_da | 0.29 per rad (F:469) | none | n/a | template value |
| Cl_p (roll damping) | -0.50 per unit pb/2V (F:448) | none | n/a | |
| Steady full-aileron roll | 129-171 deg/s at 150 KIAS; 171-228 at 200; 214-286 at 250 (worked below) | 0.45 deg/s per KTAS: 67.5 / 90 / 112 deg/s, cap 120 | JSBSim about 1.9x ours on the 15 deg side (0.86 deg/s per kt), 2.5x on the 20 deg side (1.14), vs 0.45 | very high for a trainer; no adverse yaw or other coupling cuts it |
| Roll time constant tau | 0.285 s at 150, 0.214 s at 200, 0.171 s at 250 KIAS | full rate in 0.3 s, accel built over 0.2 s | JSBSim reaches 95 percent in about 0.64 s at 200 KIAS; ours 100 percent in 0.3 s | similar scale; JSBSim is first-order, so it has its biggest acceleration at the start |
| Aileron / control rate limit | none (F:167-196: scale and clip only; no lag, no rate limiter) | roll accel built over 0.2 s | n/a | control surface is instantaneous; roll damping is the only lag |
| Elevator limit | -30 to +30 deg (F:160-163), 0.017 rad per deg | none | n/a | no rate limit or actuator lag (F:147-166) |
| CL_alpha | about 5.3 per rad (table F:372-390: 0.25 at 0, 0.73 at 0.09 rad) | none | n/a | normal for a straight wing |
| CLmax | 1.47 at 0.28 rad = 16 deg (F:385); CL0 = 0.25 | none | n/a | clean; flaps add 0.2 at 10, 0.35 at 30 deg (F:403-405) |
| 1 G stall (derived) | 83 kt at 6,000 lb; 77 kt at 5,168 lb (sqrt(2W/(rho S CLmax))) | 86 KIAS | -3 to -9 kt | our numbers.md note already says about 83 kt at max power |
| Max G at 200 KIAS (derived) | qS CLmax/W = 5.8 G at 6,000 lb, 6.8 G at 5,168 lb | +7 limit | below 7 G at 200 KIAS | 7 G is reached at about 215 KIAS at 5,168 lb (derived) |
| Cm_alpha | -1.9 per rad (F:507) | none | n/a | static margin about 36 percent of chord (1.9/5.3): very stable, template |
| Cm_q | -12 per unit qc/2V (F:528); plus Cm_alphadot -9 (F:539) | none | n/a | combined -21 used below |
| Cm_de / CL_de | -1.2 / +0.193 per rad (F:517, 416) | none | n/a | |
| Engine rated power | 1,100 hp in header (E:9); static thrust 2,464 lbf (E:15-16) | 1,100 shp | same number | no propeller model, so shp is not used: thrust is a lookup (E:39-53) |
| Engine thrust lag | idle to full N2 in about 1.7 s (worked below); thrust = idle + mil x N2norm squared (T:225) | torque 0-100 percent in about 0.25 s (ENGINE_RESPONSE_SEC) | JSBSim about 7x slower | spool rates T:326-340; stepping T:403-413 |
| Idle / max N2 | 65 / 100 percent (E:18-19) | n/a | n/a | |
| Throttle rate limit | none on the lever itself | none | | only the N2 spool |
| Prop governor | none (direct thruster, F:114) | n/a | | no constant-speed prop |
| Gear / flap travel | gear 5 s, flaps 4 s to 15 deg then 3 s to 30 deg (F:221-231, 255-260) | n/a | | not handling-critical |

## Worked: steady full-aileron roll rate
p = (2V/b) x (Cl_da x delta_a) / (-Cl_p), delta in radians (the file converts degrees with 0.017). Sea level, KIAS = KTAS, V = KIAS x 1.6878 ft/s, b = 33.4 ft.

- pb/2V = 0.29 x delta / 0.5 = 0.58 x delta. delta = 15 deg = 0.255 rad gives 0.1479; delta = 20 deg = 0.340 rad gives 0.1972.
- 150 KIAS: V = 253.2 ft/s, 2V/b = 15.16 /s: p = 2.24 rad/s = 128.5 deg/s (15 deg side); 2.99 rad/s = 171 deg/s (20 deg side).
- 200 KIAS: V = 337.6, 2V/b = 20.2: p = 2.99 rad/s = 171 deg/s; 3.99 rad/s = 228 deg/s.
- 250 KIAS: V = 421.9, 2V/b = 25.3: p = 3.74 rad/s = 214 deg/s; 4.98 rad/s = 286 deg/s.
- Linear in V, no cap. Per knot: 0.86 deg/s (15 deg side) and 1.14 (20 deg side) against our 0.45 deg/s per KTAS. Ours caps at 120 deg/s (reached at 267 KTAS); JSBSim exceeds 120 above about 140 KIAS.

## Worked: roll mode time constant
tau = Ixx / L_p, with L_p = q S b^2 x 0.5 / (2V) (damping moment per unit roll rate, from the file's own form, F:441-449). Ixx = 4,216.3 slug ft2.
- 200 KIAS: q = 135.4 psf; L_p = 135.4 x 176 x 1,115.6 x 0.5 / 675.2 = 19,692 ft lbf per rad/s; tau = 0.214 s.
- 150 KIAS: q = 76.2, tau = 0.285 s. 250 KIAS: q = 211.6, tau = 0.171 s.
- Initial roll acceleration for a full-stick step at 200 KIAS (15 deg side): p_ss / tau = 2.99 / 0.214 = 14 rad/s2 = about 800 deg/s2. Ours reaches 120 deg/s in 0.3 s, an average of about 400 deg/s2. So JSBSim has about 2x the roll acceleration as well as 2x the rate, and takes longer (about 0.64 s) to settle near its plateau.

## Worked: short period at 200 KIAS, sea level
Two-state approximation (alpha, q). q = 135.4 psf, S = 176, c = 5.27, Iyy = 7,608, CL_alpha = 5.3, Cm_alpha = -1.9, Cm_q + Cm_alphadot = -21, V = 337.6 ft/s.
- Z_alpha = -qS CL_alpha / (m V) = -2.01 /s at 6,000 lb (-2.33 at 5,168 lb).
- M_alpha = q S c Cm_alpha / Iyy = -31.4 /s2.
- M_q' = q S c^2 (Cm_q + Cm_alphadot) / (2 V Iyy) = -2.71 /s.
- omega_sp^2 = Z_alpha x M_q' - M_alpha = 36.8, so omega_sp = 6.07 rad/s (about 0.97 Hz; period 1.1 s). 2 zeta omega = -(Z_alpha + M_q') = 4.71, so zeta = 0.39 (0.41 at 5,168 lb). With Cm_q alone: omega 5.9, zeta 0.30.
- Normal acceleration follows alpha with lag 1/|Z_alpha| = 0.43-0.50 s. After an elevator step, G builds with a time constant of about 0.4-0.5 s, peaking within about 0.3-0.5 s with modest overshoot (zeta 0.4). A 4 G pull then builds at roughly 4 G / 0.45 s, about 8-9 G/s, with the elevator itself instantaneous. So the airframe does not limit G onset to our 4 G/s; the pilot does. Our 8 G/s gate is about what this airframe would allow. (Estimate from the standard approximation; not simulated.)

## Worked: engine spool (T:326-340, 403-413, 515-524)
N2 target = 65 + 35 x throttle percent. Spool-up rate = (90 / 3) / (1 + 3(1 - n)^3 + (1 - density ratio)) percent N2 per second, bypass ratio 0, n = min(1, N2norm + 0.1). Stepped numerically (sea level, idle to full): N2norm 50 percent at 1.14 s, 90 percent at 1.62 s, 99 percent at 1.73 s. Thrust = idle + (mil - idle) x N2norm^2 (T:225), so thrust is 25 percent of the way at 1.14 s and 81 percent at 1.62 s. Spool-down is 3x faster in its coefficient. This is a jet-turbine spool applied to a turboprop with no propeller; it says nothing real about the PT6A-68 plus propeller (Patrick's 0.25 s torque figure stands).
Thrust level: the mil table (E:45-50) gives about 0.79 x 2,464 = 1,950 lbf at Mach 0.3, sea level, about 1,200 thrust hp at 200 KIAS, above 1,100 shp: not physical for a propeller, another sign of a template.

## Unsure
- The aerosurface_scale gain 0.017 I read as degrees to radians, applied after the range (the output names say rad). I did not run JSBSim to confirm.
- Only the left aileron enters the roll moment, so the two directions differ; I give both.
- Short-period figures are a two-state approximation with no drag term in Z_alpha and no elevator lift; real values vary a little.
- Weight is 6,000 lb at full fuel; at 5,168 lb values shift slightly (given for pitch and stall only).
