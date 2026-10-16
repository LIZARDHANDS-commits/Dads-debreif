# Thrust check: Patrick's GoPro speed-up against the core T-6A model (12 Oct 2026, read-only)

Asked: why does Patrick's CT-156 flight (GoPro telemetry, `gopro.md` section 5) speed up faster at 230-249 KIAS than the core model allows? Opus, high. No repo file changed and no test was run. Scripts are in `research/thrust/`: `model.mjs` (node, imports core), `wind.py`, `wind2.py`, `compare.py` and `segments.py` (the design kit's Python, reading the earlier session's `gopro/` telemetry).

## Answer

**There is no gap.** The "KIAS" in `gopro.md` section 5 is GPS ground speed turned into KIAS with no wind. Four level turns in the same chapter put the wind at about **40 kt from about 300° true**, and the 03:32-04:25 run was flown almost straight downwind. So the run was really **about 124 to 214 KIAS (150 to 261 KTAS), not 160 to 249**. In true airspeed, the core model at MAX power on a standard day flies the same 53 s run to **301 kt ground speed, against 301 kt recorded**. Its acceleration stays within about 0.2 kt/s of the data from 03:40 on. At Patrick's "about 90%" torque, a +10 °C day and 6,000 lb, the model ends 5 kt short. That is inside the wind's uncertainty.

**Recommendation: no change to core.** Correct `gopro.md` instead: withdraw the "faster than the model" finding, and widen its wind allowance from ±10-15 kt to about ±40 kt on every GPS-derived KIAS (loop entries, roll speeds).

## 1. What the manuals say (cited by page; no chart reproduced)

| Item | Manual | Where |
|---|---|---|
| Engine | PT6A-68, flat-rated to 1,100 shp as installed | NFM p.1-5 (engine section) |
| Flat rating | 100% torque from sea level to about 12,000-16,000 ft on a standard day; 100% is about 2,900 ft-lb at the prop shaft, about 2,750 lb of thrust at sea level, zero airspeed | NFM p.1-18 |
| Critical altitude | where 100% torque stops being available at MAX: about 16,000 ft MSL, standard day | NFM p.A2-1 |
| MAX power | at least 1,100 shp and 100% torque below the critical altitude, ITT 820 °C at most | NFM p.A2-1; Fig 5-2 p.5-8 (100% max, 131% transient for 20 s) |
| Power at 12,600 ft | full 100% torque, 1,100 shp (below every version of the critical altitude above) | from the two lines above |
| Power available chart | Fig A2-1 p.A2-3 (MAX) and Fig A2-2 p.A2-4 (MAX cruise) | **not checked**: the NFM on this PC is the Scribd text layer and its charts are images that aren't there; no NFM PDF is in `manuals/pdf/` |
| Maximum level speed | no table in the NFM text. The sustained turn rate chart (max power, standard day, max take-off weight less climb fuel, flight test; NFM Fig A9-4 p.A9-7; its A9 example, 187 KIAS at 10,000 ft giving 12.8°/s, matches) reaches zero turn rate (1 G, so level top speed) at about 260 KIAS at sea level, 247 at 10,000 ft, 241 at 15,000 ft and 226 at 20,000 ft (the repo's `T6A_TURN_ZERO` read-offs). **About 250 at 8,000 ft and 244 at 12,600 ft** (interpolated) | NFM Fig A9-4 |
| Climb data | charted at 140 KIAS only (NFM p.A4-1), so it can't test thrust minus drag at 200-250 KIAS | NFM p.A4-1 |

The flat-rated power and the zero-rate points fit together. At constant power, the IAS of the level top speed scales with σ^(1/6). From 260 KIAS at sea level that gives 241 at 15,000 ft, which is what the chart shows. Standard aerodynamics.

## 2. The model's numbers (core `t6-performance.js`, `T6A_FIT`; `model.mjs`)

At 12,600 ft, 1 G, MAX, standard day (σ = 0.680). Thrust is held flat down to σ 0.643, which is **14,360 ft**, so at 12,600 ft the model already has full flat-rated thrust. Absolute numbers use the turn chart's weight, about **6,450 lb** (6,500 lb max take-off weight less climb fuel; an estimate). The model is fitted per unit weight.

| KIAS | KTAS | T/W | D/W | (T−D)/W | dV/dt, kt TAS/s | dKIAS/dt | thrust, lb | thrust hp | η at 1,100 shp |
|---|---|---|---|---|---|---|---|---|---|
| 160 | 194 | 0.244 | 0.093 | 0.151 | 2.89 | 2.38 | 1,573 | 937 | 0.85 |
| 200 | 243 | 0.207 | 0.121 | 0.085 | 1.63 | 1.34 | 1,333 | 992 | 0.90 |
| 230 | 279 | 0.185 | 0.152 | 0.034 | 0.65 | 0.53 | 1,196 | 1,024 | 0.93 |
| 240 | 291 | 0.179 | 0.163 | 0.016 | 0.31 | 0.26 | 1,156 | 1,033 | 0.94 |
| 250 | 303 | 0.174 | 0.175 | −0.001 | −0.03 | −0.02 | 1,119 | 1,041 | 0.95 |

η is the implied propeller efficiency: thrust × TAS / 550 / 1,100 shp. At 90% torque, multiply the thrust column by 0.9 (core `excessFnFor`).

Level top speed, 1 G:

| Height | Model 100%, KIAS (KTAS) | Model 90%, KIAS (KTAS) | Turn chart's zero-rate point |
|---|---|---|---|
| Sea level | 264 (264) | 254 (254) | 260 |
| 8,000 ft | 255 (288) | 245 (276) | about 250 (interpolated) |
| 12,600 ft | 249 (302) | 239 (290) | about 244 (interpolated) |
| 20,000 ft | 224 (307) | 215 (294) | 226 |

**Against the manual:** the model is 4-5 kt fast below 15,000 ft and 1-2 kt slow above 20,000. That is inside the existing test's 6 kt allowance. Its thrust is not low at high speed. If anything it is generous: at 6,450 lb the implied propeller efficiency reaches 0.93-0.95 at 280-300 KTAS, where a real constant-speed propeller gives about 0.85-0.88 (standard aerodynamics, an estimate). Only thrust minus drag is fitted to flight test. The thrust and drag split comes from the power-off glide data, so both are probably a little high at high speed. Their difference, which sets the acceleration, is right.

## 3. The GoPro run, redone in true airspeed

**Ground speed.** The raw GPS Doppler 2D speed (GPS5, 18 Hz) is smooth: about 0.3 kt between samples. The 10 Hz ground speed in the earlier `prep.py` comes from differentiated positions and jumps ±5-10 kt. That noise produced the "still gaining 1-2.5 kt/s" at the top. Doppler gives 190 kt at 03:32, 240 at 03:50, 265 at 04:00, 283 at 04:10, 295 at 04:20 and 301 at 04:25. The track holds within 6° and the height rises 120 ft, mostly after 04:08. The run ends at 04:26.7 because Patrick rolls into the steep 180° turn, not because a top speed is reached.

**Wind** (`wind.py`, `wind2.py`). In a level turn, the ground-velocity vectors lie on a circle of radius TAS around the wind vector. Each turn's TAS was allowed to vary smoothly in time, with one wind for the chapter. Residuals are about 1 kt.
- Chapter 2, four turns: 40-45 kt from 298-299°.
- The two 180° turns alone (the best-conditioned): 38-49 kt from 278-307°.
- Chapter 3, later and a little higher: 47-60 kt from 297-310°.
- Along the run, that is a **tailwind of 36-49 kt, best estimate 40**.
- Independent support: the loop entries in `gopro.md` section 3 differ by up to ±25 KIAS between the GPS speed and the wind-free speed from the pull. That is what a 30-40 kt wind on different headings would give.

**Comparison** (`compare.py`, tailwind 40 kt). Energy rate is written as an equivalent dV/dt in kt TAS per second: dGS/dt + g·(dh/dt)/TAS.

| Time | TAS | KIAS (ISA) | Data | Model 100%, ISA, 6,450 lb | Model 90%, ISA+10, 6,000 lb |
|---|---|---|---|---|---|
| 03:37.5 | 164 | 135 | 3.2 | 3.7 | 3.5 |
| 03:45 | 186 | 153 | 2.9 | 3.1 | 2.9 |
| 03:52.5 | 206 | 169 | 2.5 | 2.6 | 2.4 |
| 04:00 | 225 | 185 | 2.1 | 2.1 | 1.9 |
| 04:07.5 | 240 | 198 | 1.7 | 1.7 | 1.5 |
| 04:15 | 249 | 205 | 1.6 | 1.5 | 1.3 |
| 04:22.5 | 258 | 212 | 1.3 | 1.2 | 1.0 |
| mean, 03:35-04:25 | | | 2.12 | 2.34 | 2.15 |

Flying the model through the run at the recorded height (`segments.py`; end ground speed, data 301 kt):

| Case | End GS |
|---|---|
| 100% torque, standard day, 6,450 lb, 40 kt wind | 301 |
| 90% torque, ISA+10, 6,000 lb, 40 kt wind | 295 |
| 100% torque, standard day, wind 30 / 36 / 45 / 50 kt | 294 / 297 / 304 / 308 |
| With **no** wind (as `gopro.md` assumed) | 272 (100%), 261 (90%): the apparent 30-40 kt gap |

The other two speed-ups in chapter 2, flown the same way with the same wind:
- 00:03-00:58 (155 → 266 kt GS, with a 530 ft climb): the model ends 11-16 kt faster than the data.
- 02:30-02:55 (166 → 220 kt GS): the model ends 6-9 kt faster.

So across all three runs the model is as quick as, or quicker than, Patrick's aircraft.

## 4. Cause, by candidate

| Candidate | Verdict | Numbers |
|---|---|---|
| Thrust lapsing too early with height | no | The model holds full thrust to 14,360 ft. The manual says 12,000-16,000 ft (p.1-18) and about 16,000 (p.A2-1). At 12,600 ft both give the full 1,100 shp |
| Drag polar too high at high speed | no, for the acceleration | Thrust minus drag matches the flight-test zero-rate points within 5 kt (the model is fast, not slow). The absolute drag may be a little high, but so is the thrust |
| Propeller efficiency too low at high TAS | no | The implied η is 0.90-0.95 from 240 to 300 KTAS: generous, not low |
| Weight | small | Patrick mid-sortie at about 6,000 lb against the chart's about 6,450: about +0.1-0.2 kt/s |
| Temperature | small | An August day at about ISA+10 lowers KIAS about 2% at a given TAS: about +0.1 kt/s |
| **The GoPro data itself** | **yes** | A 40 kt tailwind (fitted, 36-49) read as airspeed made 124-214 KIAS look like 160-249. The position-derived ground speed's jitter made the end look like it was still accelerating hard |

## 5. Recommendation

- **Core: no change.** The smallest change that fixes the finding is none. The model matches Patrick's run within about 5 kt.
- **`gopro.md` (Formation thread):**
  - Replace section 5's speed-up lines with the true-airspeed figures above.
  - Withdraw "the data accelerates faster at high speed than the model allows".
  - Change the wind allowance on every GPS KIAS (sections 3, 4 and 8) from ±10-15 kt to about ±40 kt, or subtract the fitted wind: about 40 kt from about 300° true in chapter 2, and 47-60 kt in chapter 3.
  - Use the GPS's own Doppler speed (GPS5 2D speed), not differentiated positions, for any speed rate.
- **If core were ever changed** (not recommended now), these would feel it. Thrust and drag are read by:
  - Formation (`src/modules/turn-sim/live/`: `flight.js`, `fluid-lead.js`, `formation-turns.js`, `full-power.js`, `power.js`, `slow-down.js`, `turning-rejoin.js`, `replay.js`, `errors.js`, `optimise/score.js`);
  - Traffic (`circuit.js`, `evade.js`);
  - Turn Fight's energy model (`energy/aircraft.js`, `moves/mpt.js`);
  - core's own zoom and split S.
  - The Debrief reads `t6-performance.js` only for speeds and readouts, not thrust.
  - Tests that pin numbers: `tests/unit/core/t6-performance.test.js` (the formula at sea level, flat-rated to about 14,000 ft, thrust power 50-80% of 1,100 shp at 5,168 lb, every turn point within 10%, zero turn at sea level 260 ± 10), `tests/unit/core/properties.test.js`, `tests/unit/turn-fight/energy-sim.test.js` and `tests/unit/turn-sim/slow-down.test.js`.

**Asides** (outside this question; for `docs/modules/shared/future.md` if Patrick wants them):
1. The model's 1/(V + V0) thrust gives 0.88 W, about 5,650 lb, at zero airspeed. NFM p.1-18 gives about 2,750 lb. It passes that figure below about 80 KTAS. Only a take-off roll or a very slow speed-up would feel it.
2. The thrust-power test uses 5,168 lb. The turn chart's weight is about 6,450 lb, at which the implied η reaches about 0.95. The bound still holds. Only the weight in the comment is off.
3. The model's level top speed is 4-5 kt fast against the chart below 15,000 ft (inside the test's 6 kt).

## Untested, unseen, unsure

- The NFM's power available charts (Fig A2-1, A2-2) weren't read: they are images missing from the text copy. The critical altitude comes from the NFM's text only.
- The wind is fitted, not measured: 36-49 kt along the run. The temperature, Patrick's weight and his torque on the day are unknown. The 6,450 lb chart weight is an estimate.
- The comparison assumes a steady wind over the run (about 2.5 NM) and GPS height as pressure height.
- One run, one flight. It confirms the model at about 125-215 KIAS at 12,600 ft. It says nothing above about 215 KIAS, where the run ended.
- No repo file was changed and no repo test was run.
