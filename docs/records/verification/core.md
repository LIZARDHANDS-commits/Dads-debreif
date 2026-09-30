# core-t6a: independent check of the shared T-6A performance model

Checker: independent, read-only. Repo at main 94b00a1 (worktree wt-core). Nothing in the repo or /mnt/project-files was edited. No browser needed. Scratch scripts are in `scratchpad/core-t6a/` (run.mjs ... run12.mjs, plus png.py / trace.py / rtrace.py that read the chart images).

Manual refs only below (no manual text pasted): NFM Fig 4-10-1 (sustained turn rate), Fig 4-10-2 (sustained turn radius), the V-n diagram (maximum take-off weight, 5,168 lb, sea level and 31,000 ft), Fig 4-1-2 (airspeed and Mach limits), Fig 3-5 (maximum glide), Fig 3-4 (zoom data, p.3-12), Figs 3-2 and 3-3, p.3-9 (zoom procedure), p.6-6 and Fig 6-3 (stall warning, stall speeds; Fig 6-3 is an image not in the project files), SMM 14.14.

## Summary

Counts: High 0, Medium 3, Low 6. Everything that is "the model vs a chart at one point" is within 5% for sea level to 15,000 ft; the big misses are two: the stall-speed default (86 fits neither chart), and sustained rate at 20,000 ft and up above 175 KIAS.

Top five:
1. F1 (Medium) Stall 86 kt matches neither chart: V-n reads about 89 kt (7 G at about 236 KIAS, not 227.5), the turn chart implies 83 kt. At 86 the model's best sustained rate is 5 to 7 kt too fast and its rate at the chart's own stall-limit speed is 7 to 18% low; its available G is 7 to 9% above the V-n at any speed.
2. F2 (Medium) Sustained rate at 20,000 ft and above, 175 KIAS and up, is 8 to 28% low (5 kt or less in speed; steep-curve sensitivity), and the "within 10%" test measures thrust vs drag, not turn rate.
3. F3 (Medium) The V-n has a second curve: at 31,000 ft the stall speed is about 100 to 104 KIAS, 12% above sea level; the model's stall line ignores altitude, and the two NFM charts contradict each other at 31,000 ft (turn chart n=1.41 at 97.7 KIAS; V-n 31,000 ft curve is 1.0 G there).
4. F4 (Low) IAS-to-TAS ignores compressibility: TAS is 2 to 4% high at 20,000 ft and up at 200 to 250 KIAS.
5. F5 (Low) `zoomT6A` reproduces Fig 3-4 to under 1 ft, but outside 200 to 250 KIAS it is an extrapolation that is 10 to 22% above the model's own physics at 150 to 190 KIAS; there is no Mmo (Fig 4-1-2).

Existing checks (tests/unit/core, tests/golden/checks/t6a-fit.mjs): my independent read agrees with their chart points (details at "Agreement with the existing tests"). The tests pass on their own terms; the gaps are in what they measure (thrust vs drag at the chart's G, and turn-rate tolerances of plus or minus 1 degree per second), not in the chart reading.

## Method

- Chart images read by pixel, not by eye: I decoded the PNGs, calibrated each axis from the printed grid lines (turn rate: 2.01 px per KIAS, 27.27 px per degree per second; radius: 1.995 px per KIAS, 0.1194 px per ft; V-n: 1.313 px per KIAS, 25.27 px per G; glide: 7.95 px per NM and 0.2133 px per lb), and traced the solid altitude curves column by column (rate), row by row (radius, V-n). Reading accuracy: about plus or minus 0.15 deg/s, plus or minus 2 kt, plus or minus 15 ft (radius), plus or minus 0.3 kt on the V-n stall line. Curves were checked by overlay on the picture.
- Model run in Node straight from `src/core` (no browser): sustained level turn = the G where `excessThrustPerWeight` is zero, capped at `availableG`; rate = g*sqrt(n^2-1)/V with V the true airspeed from `iasToTasKt`.
- Speed-shift metric added: because the turn-rate curves fall steeply on the right, a small speed error is a large percentage rate error. I also report "the KIAS at which the model reaches the chart's rate" minus the chart's KIAS.

## Table 1: sustained turn rate (Fig 4-10-1), max power, clean, standard day. Stall 86 kt (the default); 83 kt shown where it differs

| # | KIAS | Alt ft | Chart deg/s | Model deg/s | Diff | Speed shift (kt) |
|---|---|---|---|---|---|---|
| 1 | 150 | 0 | 19.84 | 19.45 | -2.0% | |
| 2 | 200 | 0 | 15.36 | 14.75 | -4.0% | -5.6 |
| 3 | 230 | 0 | 11.46 | 10.87 | -5.1% | -3.9 |
| 4 | 250 | 0 | 7.32 | 7.08 | -3.2% | -1.0 |
| 5 | 200 | 5,000 | 13.35 | 12.93 | -3.2% | -4.0 |
| 6 | 250 | 5,000 | 4.51 | 5.01 | +11.1% | +1.6 |
| 7 | 150 | 10,000 | 15.53 | 15.49 | -0.2% | |
| 8 | 187 (chart's example arrow) | 10,000 | 12.73 | 12.49 | -1.9% | |
| 9 | 200 | 10,000 | 11.50 | 11.22 | -2.5% | -2.8 |
| 10 | 175 | 15,000 | 11.90 | 11.65 | -2.1% | |
| 11 | 200 | 15,000 | 9.75 | 9.39 | -3.7% | -3.6 |
| 12 | 150 | 20,000 | 10.60 | 10.45 | -1.4% | |
| 13 | 200 | 20,000 | 6.86 | 6.12 | -10.8% | -6.4 |
| 14 | 175 | 25,000 | 6.27 | 5.78 | -7.8% | -5.5 |
| 15 | 200 | 25,000 | 3.17 | 2.27 | -28.3% | -4.2 |
| 16 | 150 | 31,000 | 4.88 | 4.72 | -3.2% | |
| 17 | 175 | 31,000 | 2.31 | 1.96 | -15.1% | -1.9 |

Full set of 38 points (SL to 31,000 ft at 150, 175, 200, 210, 220, 230, 240, 250 KIAS where the curve exists) is in `run.mjs rate`; 30 of 38 are within 5%.

Stall-limit tops of each altitude line (the chart's peak sustained rate):

| Alt ft | Chart peak (KIAS, deg/s) | Model at 86 kt: best (KIAS, deg/s) | Model rate at the chart's speed, 86 kt | Model rate at the chart's speed, 83 kt |
|---|---|---|---|---|
| 0 | 139.6, 20.6 | 144.3, 19.91 (-3.4%) | 19.07 (-7.4%) | 20.28 (-1.6%) |
| 10,000 | 132.2, 16.55 | 138.9, 16.27 (-1.7%) | 15.20 (-8.2%) | 16.46 (-0.6%) |
| 20,000 | 118.3, 12.0 | 125.2, 11.90 (-0.8%) | 10.83 (-9.8%) | 11.84 (-1.3%) |
| 31,000 | 97.7, 6.68 | 104.8, 6.86 (+2.7%) | 5.48 (-18.0%) | 6.37 (-4.6%) |

Zero sustained turn (T = D at 1 G), chart vs model: SL 260.5 vs 264.4 (+1.5%), 5,000 ft 254.0 vs 258.5 (+1.8%), 10,000 ft 247.3 vs 252.5 (+2.1%), 15,000 ft 240.6 vs 244.4 (+1.6%), 20,000 ft 225.7 vs 224.4 (-0.6%), 25,000 ft 205.8 vs 204.4 (-0.7%), 31,000 ft 179.6 vs 179.9 (+0.2%). All within about 5 kt.

## Table 2: sustained turn radius (Fig 4-10-2) and physics

| KIAS | Alt ft | Chart ft | V/omega from the rate chart | Model ft | Model vs chart |
|---|---|---|---|---|---|
| 150 | 0 | 750 | 731 (-2.5%) | 746 | -0.6% |
| 240 | 0 | 2,450 | 2,403 (-1.9%) | 2,526 | +3.1% |
| 175 | 5,000 | 1,185 | 1,163 (-1.9%) | 1,188 | +0.2% |
| 187 | 10,000 | 1,675 to 1,690 (arrow) | 1,653 | 1,685 | about 0% |
| 220 | 10,000 | 2,781 | 2,733 (-1.7%) | 2,789 | +0.3% |
| 175 | 15,000 | 1,822 | 1,793 (-1.6%) | 1,831 | +0.5% |
| 200 | 20,000 | 3,928 | 3,862 (-1.7%) | 4,329 | +10.2% |
| 175 | 25,000 | 4,075 | 4,032 (-1.1%) | 4,375 | +7.4% |

- The two NFM turn charts agree with each other: radius = TAS / rate to within 1 to 3%; the radius chart is a steady 2% larger (every point 1.1 to 2.7% high), so nothing is wrong with the units. Not a model problem; small, and the direction is unexplained by compressibility (that would go the other way).
- Model radius equals V^2/(g*sqrt(n^2-1)) exactly for its own n (checked at 25 points, TAS in ft/s from KTAS times 1.68781, g 32.174), and rate = V/R. Units OK: KIAS to KTAS through sigma, feet, degrees per second.
- Radius stall-limit start points imply the same stall speed as the rate chart: 82.3 to 84.2 kt (constant with altitude to about 1 kt), so the two turn charts are consistent.
- `stepPointMass` flown for 30 s at the sustained G and bank (t6aExcessFn): altitude drift 0.00 ft, KIAS unchanged, heading change matches the analytic turn to 0.1 degree at three altitudes; with no thrust and no drag, energy height is conserved to 0.1 ft over 10 s of loop flying. The integrator is sound.
- Corner check: at 7 G and 227 KIAS the model gives 33.3 deg/s on 659 ft (correct arithmetic for that speed).

## Table 3: V-n diagram (5,168 lb, clean, sea level curve) stall line and 7 G corner

Chart read: the G on the heavy sea-level curve at a given KIAS. Model: `stallLimitG` with 86 kt.

| Chart KIAS | Chart G | Model stallLimitG | Model G above chart |
|---|---|---|---|
| 109.3 | 1.5 | 1.62 | +7.7% |
| 126.0 | 2.0 | 2.15 | +7.3% |
| 154.2 | 3.0 | 3.21 | +7.2% |
| 179.4 | 4.0 | 4.35 | +8.8% |
| 199.2 | 5.0 | 5.37 | +7.3% |
| 219.0 | 6.0 | 6.48 | +8.1% |
| 235.0 | 6.9 | 7.47 | +8.2% |

The chart's curve is a clean (KIAS/Vs)^2 with Vs = 89.4 kt (89.0 to 89.7 across all 10 points, plus or minus 0.3). 7 G is reached at about 236 to 237 KIAS, not 227.5. The 1 G crossing is a shallow line 7 pixels thick spanning 86.4 to 93.4 kt, which is the likely source of "86" (its left edge). "7 G at 227.5 matches VO" (SPEC-core, SPEC-turn-fight) is a coincidence of the 86 number: Fig 4-1-2 gives VO as a limit speed of 227, which is 4% below the V-n corner, not the corner itself.

The 31,000 ft curve: G = 1.68 at 130, 2.19 at 150, 3.78 at 200, 5.5 at 244 KIAS (end of the curve at the Mach 0.67 limit). Those give a stall speed of 100 to 104 KIAS, rising with speed.

## Table 4: max glide (Fig 3-5), engine inoperative, IAS tabulated

| Config | Chart glide NM per 1,000 ft (curve read) | Model | Diff |
|---|---|---|---|
| Clean, feathered, 125 KIAS | 1.92 at 5,000 lb; 1.95 at 5,400; 1.97 at 5,800; 1.98 at 6,500 (the table prints 2.0) | 2.00 (drag fit, L/D 12.15; best-glide speed 125) | +1.0% (6,500 lb) to +4.2% (5,000 lb); +1.5% at 5,800 |
| Other three configurations | 1.5 / 1.1 / 1.0 as printed | returned directly by `T6A_GLIDE` | 0 |

Distance to 31,000 ft: chart 60.5 NM at 5,400 lb vs model 62.0 (+2.5%). Sink-rate column: the printed 1,350 / 1,500 / 1,850 / 2,350 fpm all work out as TAS / glide ratio at 16,000 to 16,700 ft (16,685 / 16,202 / 16,180 / 16,017), so the four rows are internally consistent and the "about 16,000 ft" reading in the code comment is right. Drag fit shape: L/D 9.9 at 90, 11.0 at 100, 11.8 at 110, 12.15 at 125, 11.85 at 140, 10.8 at 160 KIAS (the chart gives only the 125 point, so the shape cannot be checked). Within 5%.

## Table 5: zoom (Fig 3-4, p.3-9 and p.3-12)

- `zoomT6A` against every table entry (12 weights, 4 altitudes, 200 and 250 KIAS = 96 points): largest miss 0.91 ft. The NFM worked examples: 692.3 ft against 693 (200 KIAS, 3,000 ft, 5,800 lb) and 1,534.3 against 1,535 (250 KIAS, 6,000 ft, 6,200 lb). Text ranges (about 600 to 900 ft at 200 KIAS, 1,170 to 1,550 at 250) reproduced.
- The physics zoom `flyZoomT6A` (engine off, 2 s delay, 2 G to 20 degrees, hold to 145 KIAS, 0.25 G push) against the table at 5,400 lb: 200 KIAS: 636 vs 595 (500 ft, +7%), 655 vs 621 (+5%), 686 vs 649 (+6%), 753 vs 794 (6,000 ft, -5%); 250 KIAS: 1,258 vs 1,172 (+7%), 1,296 vs 1,232 (+5%), 1,356 vs 1,297 (+5%), 1,486 vs 1,487 (0%). Its altitude trend is weaker than the table's (200 KIAS: +18% from 500 to 6,000 ft against +28%).
- `zoomT6A` away from the table (3,500 ft, 5,800 lb) against the physics zoom: 151 KIAS 210 vs 172 ft (+22%); 160 KIAS 292 vs 268 (+9%); 175 KIAS 440 vs 383 (+15%); 190 KIAS 600 vs 569 (+5%); 220 KIAS 959 vs 962 (0%); 275 KIAS 1,750 vs 1,733 (+1%); 300 KIAS 2,169 vs 2,092 (+4%); 316 KIAS 2,456 vs 2,323 (+6%). Above 250 KIAS the share-of-ideal extrapolation is sound; the 151 to 190 KIAS band is optimistic by 20 to 60 ft (small absolute). About 960 ft from 220 KIAS at 3,500 ft (spec) confirmed: 959 ft.
- Time and distance (13 to 20 s and 3,560 to 6,720 ft for 200 to 250 KIAS) have no manual value to check against. The zoom does not depend on weight for time or distance, only for the gain.

## Findings

### F1 (Medium, PILOT JUDGEMENT for Dad; already flagged, but the numbers are new). Stall speed default 86 kt is not what either chart says
- Where: `T6A_LIMITS.stallKias` (86), `stallLimitG`, `availableG`; every consumer.
- Expected: V-n diagram (5,168 lb) and the turn chart (Fig 4-10-1 stall limit).
- Actual: V-n sea-level curve is (KIAS / 89.4)^2 (10 points, plus or minus 0.3 kt); 7 G at about 236 to 237 KIAS. Turn chart stall-limit line implies 83.2 kt at sea level and 82.3 kt at 31,000 ft (n from the rate at each top; the radius chart gives the same, 82.3 to 84.2). With 86: best sustained rate 5 to 7 kt too fast at every altitude (144.3 vs 139.6 at sea level), rate at the chart's peak speed 7 to 18% low (worse with altitude), and stall-line G 7 to 9% above the V-n at every speed. With 89.4 (the V-n) the turn-chart rates at their own stall limits would be 15 to 34% low.
- Reading: 83 is the max-power, lighter-weight, power-on stall line (NFM p.6-6: stall speed drops with power on); 89.4 is the maximum-weight V-n. Both are right for their chart; 86 fits neither. "7 G at 227.5 KIAS matches VO" is a coincidence.
- Known/planned: the choice is flagged for Dad (SPEC-turn-fight "One mismatch to settle", SPEC-core "For Dad"). The V-n number being 89 and the coincidence with VO are not stated anywhere. The shipped default (86) is what the spec's "chart checks pass at both stall speeds" tolerates (plus or minus 1 deg/s).
- Recommendation: use 83 kt as the Energy-mode default (the model's thrust and drag are fitted to the chart that implies 83, and the turn chart is what the mode flies at max power), keep it a setting; for the G-limit warnings that the Turn Sim and Turn Fight show (D128), use the V-n's 89 kt for 5,168 lb so a warning appears no later than the manual's own limit; scale by the square root of weight if a weight is ever added. Re-run the LMPT numbers in the 09:36Z decision (model 146 / 144 KIAS at 6,000 / 10,000 ft) at 83, since they were computed at 86 and the model's best-rate speed drops 5 to 6 kt at 83 (10,000 ft: 138.9 to 133.3).

### F2 (Medium). Sustained rate is 8 to 28% low at 20,000 ft and above from 175 KIAS up; the test that guards it measures the wrong thing
- Where: `thrustPerWeight`, `dragPerWeight` (fit); `tests/unit/core/t6-performance.test.js` "every chart point: thrust within 10%".
- Actual: rows 13 to 17 in Table 1: 200 KIAS at 20,000 ft 6.12 vs 6.86 (-10.8%); 200 KIAS at 25,000 ft 2.27 vs 3.17 (-28%); 175 KIAS at 31,000 ft 1.96 vs 2.31 (-15%). In speed terms it is 2 to 6 kt (1 to 3%), so these are curves that fall steeply, not a wild fit. Radius follows (+7 to +10% at 20,000 to 25,000 ft). The same sign of error (model low) appears at every altitude from 175 KIAS to the zero-turn speed, growing with speed to -5% at sea level (230 KIAS), so the fit's thrust falls slightly too fast with speed in the middle of the range, while the zero-turn speed is 4 to 5 kt too high at sea level to 15,000 ft (F1 aside, that is a mild shape mismatch, no direction reversal).
- Impact: only Turn Fight positions that hold a level turn at 20,000 ft and above near 200 KIAS. MTCA blocks (6,000 to 15,500 ft) are within 5%.
- Known/planned: no; SPEC-core says "every chart point is within 10%", which is true of (T - D)/D at the chart's G, not of rate.
- Recommendation: leave the fit; change the test to compare turn rate (plus or minus 0.5 deg/s or 3 kt of speed) so a 28% miss cannot pass. If Turn Fight will fly above 15,000 ft, refit thrust with more mid-speed points (175, 210, 230 KIAS) which this read supplies (Table 1).

### F3 (Medium). The V-n has an altitude effect the model does not, and the two NFM charts disagree at 31,000 ft
- Where: `stallLimitG` / `availableG` take no altitude.
- Actual: V-n thin (31,000 ft) curve: stall about 100 to 104 KIAS, 12% above sea level (Table 3). The turn chart's 31,000 ft peak (97.7 KIAS, 6.68 deg/s = 1.41 G) is above what the V-n curve allows at that speed (about 1.0 G). The model follows the turn chart (altitude-independent). Interpolating linearly to 10,000 ft, the V-n stall would be about 93 kt (an interpolation, not a chart value).
- Impact: available G at altitude is optimistic against the V-n (35% at 31,000 ft, roughly 10% at 10,000 ft by interpolation); harmless below the MTCA blocks unless the warning wording claims the V-n limit.
- Known/planned: no.
- Recommendation: note it in the warning text or SPEC-core; do not add altitude to the stall line until Dad decides F1. PILOT JUDGEMENT: does the T-6A really stall about 12% faster at 31,000 ft, or is the V-n curve Mach-limited? Recommendation: ignore for Turn Fight (blocks below 15,500 ft), record as a limit.

### F4 (Low). IAS to TAS ignores compressibility
- `iasToTasKt` = IAS / sqrt(sigma). Against the exact CAS-to-TAS relation (ISA): 0.0% at sea level; 0.4% at 125 KIAS / 16,000 ft; 0.5% at 200 / 10,000; 0.8% at 250 / 10,000; 1.9% at 250 / 20,000; 1.8% at 200 / 25,000; 2.2% at 180 / 31,000; 3.9% at 244 / 31,000. Model TAS is always high, so radius and glide sink rate are 1 to 4% too large at altitude. The thrust fit partly absorbs it. Below 15,000 ft it is under 1%.
- Known/planned: the comment says "no compressibility" (deliberate). Recommendation: leave, quote the limit in the help text; optional later fix, one function.

### F5 (Low). Zoom outside the table, and no Mach limit
- Where: `zoomT6A` below 200 KIAS, `T6A_LIMITS.vmoKias`.
- Actual: 151 to 190 KIAS the extrapolated gain is 5 to 22% above the model's own physics zoom (20 to 60 ft); above 250 KIAS it agrees within 6%. The table is reproduced to under 1 ft. `vmoKias` is 316 at every altitude; Fig 4-1-2 shows Mmo 0.67 above 18,769 ft, falling to 244 KIAS at 31,000 ft (VG 206). `flyZoomT6A(316, 25000)` is accepted.
- Known/planned: extrapolation is documented in code. Mmo not mentioned.
- Recommendation: keep; add Mmo to `T6A_LIMITS` if Turn Fight flies above 18,769 ft.

### F6 (Low). The model has no weight input for the turn and glide model
- The sustained-turn thrust and drag fractions are for the chart weight (max take-off less climb fuel). The zoom takes a weight (table interpolation only); the glide chart moves 1.92 to 1.98 NM per 1,000 ft with weight, the model 2.0. Stall speed goes with the square root of weight, so a 5,800 lb jet stalls about 6% faster than the V-n's 5,168 lb. Not a chart mismatch; a limitation to note. Known/planned: implicit.

### F7 (Low). Stick shaker margin (not in core, noted in passing)
- SPEC-turn-fight sets the shaker at 94% of the stall-line G, which is 3% in speed (about 3 to 4 kt at 100 to 140 KIAS). The NFM says the warning comes at least 5 kt before the stall (5 to 10 kt power off, more in accelerated turns; p.6-6). Recommendation: 88 to 90% of stall G (5 to 6% speed) as the default; the SMM level MPT is flown "in the shaker".

### F8 (Low). turnSimG and the basic turn functions
- `turnSimG` is V6 arithmetic, pinned by the golden tests: G is unitless, minimum 1.01, correction plus or minus 0.8 G. `bankDegFromG`, `turnRadiusFt`, `turnRateRadPerSec` check out physically (radius V^2/(g sqrt(n^2-1)), rate V/R, feet per second and G in ft/s^2 of 32.174). It does not cap to `availableG` (by design: a warning only). No finding.

### F9 (Low). Decision-log claim
- decisions-for-review.md, 09:36Z, T-6 manuals: "model is within 4 kt across the working blocks and fits the T-6A turn chart". The first half holds; the second holds only at 83 kt: at the shipped 86 kt the best-rate speed is 4.7 kt above the chart at sea level and the rate at the chart's peak is 7 to 8% low (F1). No logged call contradicts a manual number otherwise. The 09:22Z energy-model note's arithmetic (69 to 71 degrees level MPT bank at 146 KIAS) is correct for both stall speeds.

## Passed (checked and fine)

- Chart point reading: my zero-turn speeds (260.5, 254.0, 247.3, 240.6, 225.7, 205.8, 179.6) and 150 / 200 KIAS crossings match `T6A_TURN_150_200` and `T6A_TURN_ZERO` to 0.1 deg/s and 1 kt. Stall-limit tops match to a pixel.
- Sea level to 15,000 ft: 19 of 20 radius points within 3.1% and one at 4.9% (200 KIAS, 15,000 ft, steep part); rates within 5% except 230 KIAS at sea level (-5.1%) and the steep 250 KIAS at 5,000 ft.
- `isaDensityRatio`: 0.8617, 0.7385, 0.6292, 0.5328, 0.4481, 0.3605 (31,000 ft), 0.3099 (35,000 ft) against the standard atmosphere, all exact.
- Units constants: 1.68781 ft/s per kt, 32.174 ft/s2, 6,076.12 ft per NM.
- Glide: 4 configurations internally consistent (sink rate = TAS / ratio at about 16,000 ft), clean 125 KIAS best-glide speed comes out of the drag fit at exactly 125, 1 to 4% from the chart curves.
- Zoom table and worked examples reproduced.
- Trend directions: best-rate speed falls with altitude on both chart and model (139.6 to 97.7 vs 144.3 to 104.8); rate falls with altitude; radius rises with speed and altitude; glide distance scales linearly with altitude (chart 9.7 NM at 5,000 ft to 60.5 NM at 31,000 ft at 5,400 lb).
- Steady turn and energy conservation in `stepPointMass`.

## Agreement with the existing tests

- The chart points in `t6a-turn-charts.js` (31 points) agree with my independent read within read accuracy (0.1 deg/s, 1 kt). I read them by pixel; the spec says "by eye", and I reach the same numbers.
- The tests pass by their own definitions, but three definitions are loose: (1) thrust within 10% of drag at the chart's G (F2); (2) best sustained rate within plus or minus 1 deg/s at three altitudes (the model at 86 kt is -0.7 at sea level, so it passes even though the rate at the chart's peak speed is 1.5 deg/s low); (3) corner "7 G at 227.5 KIAS" is checked against the model's own constant, not the V-n (F1: 236 to 237 by the chart).
- The glide and zoom cross-checks are fair; the glide check ("within 15%") is met with a 1 to 4% gap.
- Mutation coverage claim is outside this check.

## Pilot-judgement summary (with recommendations)

1. Stall speed 86 vs 83 vs 89 (F1): recommend 83 kt for the Energy mode (fitted to the chart it flies); V-n's 89 kt (5,168 lb) for G-limit warnings. Question for Dad: is the T-6A's power-on turning stall near 83 kt at typical MTCA weight, and idle 1 G near 89 to 94 kt?
2. Zoom weight 5,800 lb (the NFM's own example): recommend keep it. Across the whole table's weight range (5,400 to 6,500 lb) the zoom gain changes by 143 ft at 200 KIAS, 500 ft (595 to 738) and 127 ft at 250 KIAS, so 5,800 is within plus or minus 12% of either end. Leave it a setting.
3. Shaker margin 94% (F7): recommend 90%.

## Audit (second checker, Opus, 2026-09-30 ~09:55Z)

Every finding re-run from src/core and spot-checked by eye on 6 chart points. Verdicts:

| # | Verdict | Severity | Known? |
|---|---|---|---|
| F1 stall 86 fits neither chart | CONFIRMED (V-n reads 88.8-89.5 kt; 7 G at ~236 KIAS) | Medium | Partly (86 vs 83 flagged in SPEC-turn-fight/SPEC-core); V-n 89 kt and "corner = VO" coincidence are new |
| F2 rate low at 20,000 ft+ and the 10% test measures T-D not rate | CONFIRMED | Medium (test gap is the main part) | No |
| F3 V-n altitude effect | CONFIRMED | Low (Turn Fight blocks are 15,500 ft and below) | No |
| F4 compressibility | CONFIRMED | Low | Deliberate (SPEC-core); size of error new |
| F5 zoom extrapolation, no Mmo | CONFIRMED (flyZoomT6A(316, 25000) accepted at ~M0.76) | Low | Mmo not documented |
| F6 no weight input | CONFIRMED as a limitation | Low | Implicit |
| F7 shaker 94% | PLAUSIBLE; recommendation flawed: 94% is "where the pilot pulls in the shaker" (SMM 14.14 para 33), not shaker onset | Low | In SPEC-turn-fight |
| F8 turnSimG | no finding | - | Pinned by golden tests |
| F9 D154 "within 4 kt" | CONFIRMED with correction: +2.5 to +5.0 kt above the SMM rule at 6,000-15,500 ft (inside the spec's ±5 kt, not within 4 kt above 10,000 ft) | Low | D154 |

Audit notes:
- The "turn charts are a lighter jet" explanation is likely backwards: max take-off weight is 6,500 lb (NFM p.5-11, glide chart); only the V-n image says 5,168 lb. The 83 kt turn-chart stall is more likely a power-on effect (NFM p.6-6). Affects wording in SPEC-turn-fight ~line 291, the T6A_LIMITS comment, and t6-performance.test.js line 38; not the number.
- Level MPT speed vs the SMM rule for stall/shaker pairs: 86/94% +2.5 to +5.0 kt; 83/94% −3.7 to −1.0; 83/90% +0.1 to +2.7 (best fit); 86/90% +6.3 to +8.7 (fails ±5 kt).
- Test gaps: compare turn rate directly (±0.5 °/s or ±3 kt per chart point) instead of ±1 °/s best rate and (T−D)/D within 10%.
- NFM Fig 6-2 (G available) and Fig 6-3 (idle stall speeds) aren't in project files; either would settle the stall question.

## Recommendations (go ahead and log, per Patrick 09:31Z)
1. Energy mode stall 83 kt with shaker pull point 90% (best SMM fit; decide the two together). Keep 94% if 86 kt stays.
2. Keep zoom weight 5,800 lb as a setting.
3. Fix the "corner = VO 227" wording; tighten the chart tests to compare turn rate directly.
4. Question for Dad (via Patrick's review): is the power-on turning stall ~83 kt and the idle 1 G stall ~89-94 kt at a typical weight?

## Re-check after core #184 (39d4abf), 10:03Z
- src/core change is the T6A_LIMITS comment only (wording now says V-n ~89 kt, turn charts ~83 kt power-on, VO match a coincidence): no numbers changed. Matches the audit.
- tests/unit/core: 136 pass, 0 fail; t6-performance.test.js 36 pass (turn rate now compared directly per chart point).
- Still open by Patrick's choice (review rows logged): stall 86 kt / shaker 94%; the thrust fit's 20,000 ft+ misses are pinned, not fixed. Batch 1 closed.
