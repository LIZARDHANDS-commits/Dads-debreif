# Plan B5 (Fighting Wing Round 5) — Assumptions, Decisions & Tuning Log

**Branch:** `formation-close-wingman-b2`  
**Spec:** [spec.md](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif-physics/docs/modules/turn-sim/spec.md) (§7e) · [spec-7e-draft-4.md](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif-physics/Pat's%20claude%20work/formation-review-12oct/spec-7e-draft-4.md)  
**Rulings:** [decisions.md](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif-physics/docs/modules/turn-sim/decisions.md) (`TS-233`, `TS-234`)  
**Control Model:** [control-model.md](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif-physics/docs/modules/turn-sim/control-model.md) (`B01–B15`, `S01–S45`)

**How this log is used:**  
Intermediate slices (`S2–S7`) are built to **"close enough for tuning"** (clean build, `check.mjs` / `draw.mjs --check`, `fw-rig.mjs` step checks against `fw_loops.py`, and default/close/4-ship non-regression) so the full Round 5 architecture (`S0–S7`) can be assembled before running end-to-end full-sim trace tuning (`A2`, `S8a`, `S8b`) and Patrick's live flying session. Every assumption made during autonomous slice builds, every open tuning question for Patrick, and every modelling observation or edge case discovered along the way is recorded here.

---

## 1. Open Questions for Patrick (Tomorrow's Tuning Review)

Each item below has an active working estimate in the code (`TS-233` / `spec.md` §7e) so the build proceeds without blocking; Patrick ratifies or adjusts these during the live tuning flight:

1. **Steering & capture feel (`S2`, `FW_WING`):**
   - Does the gentler cross-track approach slope ($K_e = 0.026^\circ/\text{ft}$, reaching half of the `20°` lag cap at `~420 ft` and half of the `12°` lead cap at `~250 ft`, with course gain $K_\chi = 0.5\text{ /s}$) feel crisp enough on turn entry and roll-out, or should the slope be tightened/softened?
   - Does the tighter `±250 ft` circle offset limit (`arcOffsetMaxFt = 250 ft`, down from `400 ft`) give enough room in `60° / 2 G` and `3–4 G` turns before the `±15 kt` speed-offset hand-off (`S29b → S27g`, `D21`) steps in?
2. **Guard taper & urgency feel (`S1`, `S3`, `FW_WING.guard`):**
   - With the cubic barrier $x^3$ from `600 ft` down to `500 ft` and linear G-onset law $\dot{G}_{\max} = 1 + 3u\text{ G/s}$, a predicted pass at `550 ft` ($x = 0.5, u = 0.125$) gives a gentle correction at `~1.38 G/s`. Does `550 ft` feel appropriately gentle while `510–500 ft` (`~3–4 G/s`) feels firm enough?
3. **Pass-clear (the miss) roll-and-pull profile (`S3b`, `FW_MISS`):**
   - In `b5-into-tight` (tight at `520–560 ft` with Lead turning in), `#2` unloads toward `minG = 0.5 G` for an ordinary drop and rolls (overbanking past `90°` via unload-roll-pull if required) and pulls positive G along $n_p = 0.5(1 - u)$ for an urgent drop, with least turn mix `D4` when vertical reach alone cannot make `625 ft`. Does the roll-and-pull urgency scaling $u = \text{clip}((8 - t_{\text{pass}})/5, 0, 1)$ feel natural in the seat?
4. **Power feed-forwards, speed brake & continuous drop-low-inside (`S4`, `FW_WING`):**
   - Does the `0.3 /s` proportional speed loop (no integrator, `D23`) with commanded-G drag, climb, and seen roll-in lead feed-forwards hold speed cleanly across `90°`, `180°`, and `30 s` turns?
   - Does the continuous drop-low-inside height term (`20 ft/kt` past `5 kt` slow inside a turn, capped at `-300 ft` and blended over `4.3 s`, `D24`) trade height for energy smoothly without holding `#2` too low too often?
   - Speed brake retract threshold (`20 ft/s` vs `10 ft/s` per `S0`'s `D25` closure ripple measurement): confirm the chosen threshold never cycles the boards more than once per turn.
5. **Techniques `T2–T7` cues & hand-backs (`S5–S7`):**
   - Confirm the feel and hand-back timing (`6 s` path, `15 s` height return to the `50 ft` stack) on `exit-vertical` (`T6`), `s-turns` (`T7`), `lag-abeam` (`T3` from truly abeam `5–10°` sweep), `yo-yo` (`T4` ending stacked low on Lead's circle), `cut-across` (`T5` outside `1,000 ft`), and `behind-39` (`T2`).

---

## 2. Slice-by-Slice Decisions & Assumptions Log

### `S0` — Perception on one delay rule & rig lags
- **Status:** **Built & verified (`Chunk 1`)** (`3/15` blocks, `19/53` signals built in `S0`; `6/15` blocks, `31/53` signals cumulative with `S1`).
- **Decisions, assumptions & rig measurements (`fw-rig.mjs --s0-lags`):**
  - **One delay rule (`B02`, `R1`):** `#2` sees Lead `0.4 s` late (`FW_SEE.delaySec = 0.4 s`) dead-reckoned across `0.4 s` along his seen turn (`S01, S02`), with seen bank extrapolated across `0.4 s` by seen roll rate (`S04`, smoothed over `FW_SEE.rollRateSec = 0.2 s`, estimate) and capped at `±70°` (`FW_SEE.bankCarryMaxDeg = 70`, estimate, `D3`, `S03`); Lead's seen G is smoothed over `0.15 s` (`FW_SEE.gSec = 0.15 s`, `S05b`, `D22`). `#2`'s own state (`S08–S12`) is known now (`N`), and slant range (`S13`), velocity-projected slant closure (`S14` with no `1 s` smoother — `FW_SEE.closureSec`, `FW_SEE.historySec`, and `seeFw.wasAt` removed, `D11`, `R2`), LOS rate (`S15`), aspect/HCA/sweep (`S16`), and height against Lead (`S17`) are computed from dead-reckoned Lead and current `#2`.
  - **Measured plant lags (`D13`, `C11`):**
    - Turn-rate step at `T1` (`30°` bank): `+0.02 rad/s` $\to$ $t_{63} = 0.15\text{ s}$ (linear model `~0.18 s`), $t_{90} = 0.20\text{ s}$; `+0.05 rad/s` $\to$ $t_{63} = 0.25\text{ s}$, $t_{90} = 0.35\text{ s}$.
    - Turn-rate step at `T2` (`60°` bank): `+0.02 rad/s` $\to$ $t_{63} = 0.15\text{ s}$ (model `~0.18 s`), $t_{90} = 0.20\text{ s}$; `+0.05 rad/s` $\to$ $t_{63} = 0.20\text{ s}$, $t_{90} = 0.30\text{ s}$.
    - Vertical G step (`±0.2 G` at `T1` and `T2`): $t_{63} = 0.15\text{ s}$ (linear model `~0.20 s`), $t_{90} = 0.20\text{ s}$.
    - **Sizing confirmation (`D2`, `D13`):** Because measured turn-rate lag is `0.15–0.25 s` (well below Fable's `0.52 s` fallback threshold), `S2` is confirmed to use $K_\chi = 0.5\text{ /s}$ and $K_e = 0.026^\circ/\text{ft}$.
  - **Measured steady-turn closure ripples (`D25`):**
    - `T1` (`30°` bank): `S14` slant closure p2p = `0.35 ft/s` ($\sigma = 0.10\text{ ft/s}$); `S20` arc closure p2p = `0.31 ft/s` ($\sigma = 0.09\text{ ft/s}$).
    - `T2` (`60°` bank): `S14` slant closure p2p = `21.66 ft/s` ($\sigma = 6.44\text{ ft/s}$); `S20` arc closure p2p = `24.70 ft/s` ($\sigma = 7.45\text{ ft/s}$).
    - **Speed-brake retract decision (`D25` for `S4`):** Because `S14` slant-closure p2p in a `60°` turn is `21.66 ft/s` (`> 20 ft/s`), `S4` will set the speed-brake retract threshold to `10 ft/s` per `D25`.

### `S1` — The reference plumbing, lift cap & shaper
- **Status:** **Built & verified (`Chunk 1`)** (`6/15` blocks `B01, B02, B08, B13, B14, B15` and `31/53` signals built).
- **Decisions, assumptions & rig verification:**
  - `B08` (`src/modules/turn-sim/live/wingman/fw-reference.js`) creates and blends scalar loop inputs ($\chi_w, \omega_{\text{FF}}, h_T, \dot{h}_T, \Delta v_{\text{ref}}, \text{intent}, u, \Delta G_{\text{cap}}$) over `6 s` path / `4.3 s` height (`15 s` return to stack) and merges technique urgency with guard urgency via `Math.max` (`D1`, `D5`).
  - `B13` (`liftWithin` in `fighting-wing.js`) reads seen Lead G (`S05b`, `D22`), applies a `0.2 G` soft knee (`FW_WING.capKneeG = 0.2 G`, estimate) via `softMin`, and trims in Patrick's priority order (`TS-233`, `D20`, `R6` closed):
    1. Positive climb demand ($\Delta G_v > 0$) gives way toward zero first (`capGaveWay: 'climb'`; forced `3.5 G` stage-1 rig test keeps `turnKeptG = 3.35 G`, trims `vertZKeptG` to `1.335 G`).
    2. Then `1 G` level hold gives way toward zero (`capGaveWay: 'hold'`; stage-2 rig test keeps `turnKeptG = 3.35 G`, trims `holdZKeptG` to `0.669 G`).
    3. Horizontal turn demand gives way last (`capGaveWay: 'turn'`; stage-3 rig test trims `turnKeptG` to `2.783 G` with `holdZKeptG = 0 G`).
    - Negative vertical demand (descending) reduces total lift and never binds at the cap; `minG = 0.5 G` floor and unload-roll-pull (`pullWithinDeg = 20°`) are preserved (`URP at 60° off: rawAskedG = 2 G -> grantedG = 1 G`).
  - `B14` (`shapeFwLift` in `shaper.js`) shapes fighting-wing G onset by urgency $\dot{G}_{\max} = 1 + 3u\text{ G/s}$ (`FW_WING.onsetMinGps = 1.0`, `onsetMaxGps = 4.0`, leaving close formation's `shape()` 100% untouched; 4-ship probe `2d5b5a8020839796` unchanged).

### `S2` — Normal follower, arc loop & level range hold
- **Status:** Pending build.
- **Planned assumptions & checks:**
  - Radius is clipped smoothly near `20,000 ft` (`|bank| < 2°`) so the circle follower becomes the swept-line follower with no switch (`D21`).
  - Unmet closure $w - \omega \cdot d_{\text{cmd}}$ (`S29b`) from `B07` is converted to knots and clipped to `±15 kt` to form $\Delta v_{\text{ref}}$ (`S27g`), giving one `10 s` range time constant in both turns and straight-and-level flight (`D21`, `D23`).
  - Intermediate slice note: before `S3` replaces the legacy separation filter with the silent-above-600-ft barrier and `S4` adds full physics power feed-forwards, full-sim turns will still reflect legacy guard/power interactions; `S2` is judged "close enough for tuning" on `fw-rig.mjs` step responses, `check.mjs`, and non-regression.

### `S3` — The guard as a barrier
- **Status:** Pending build.
- **Planned assumptions & checks:**
  - Single forward predictor (`B12`) over the closing part of the next `10 s` on raw loop demands (`S31`, `S32`) using run-forward Lead bank (`S03`).
  - Cubic barrier $x = \text{clip}((600 - p)/100, 0, 1)$, allowed closing speed $c_{\max}(1 - x^3)$, urgency $u = x^3$ with immediate rise and `~2 s` decay, and `3 s` hold on turn-escape side choice (`S41`).

### `S3a` — Phases & case from Lead's seen roll
- **Status:** Pending build.
- **Planned assumptions & checks:**
  - Continuous phase weights (`S21`, `1.5 s` blend) from Lead's seen bank and roll rate (`10°` entry with no `1 s` hold, `5°` exit); entry/exit case (`S22`) latched once per phase with `±50 ft` dead band and `≥ 6 s` side blend (`D17`).

### `S3b` — Technique picker, vertical profile & the miss
- **Status:** Pending build.
- **Planned assumptions & checks:**
  - `B04` supervisor enforces priority order, one active technique at a time, `3 s` no-restart timer, and blend weights over `≥ 6 s` path / `≥ 4.3 s` height (`15 s` height return to stack).
  - `techniques/miss.js` (`T1`) plans a parabolic vertical profile $n_p = 0.5(1 - u)$ below Lead ($h = \sqrt{625^2 - p^2}$), flown via `minG = 0.5 G` unload-roll-pull (rolling and pulling positive G, never pushing to `0 G` or negative G), with least turn mix $\Delta\omega \approx 2\Delta q / (V t_{\text{pass}}^2)$ (`D4`) and picture-based energy intent (`-0.5 / 0 / +0.5`).

### `A1` — Structure audit 1 (after `S3b`)
- **Status:** Pending audit.

### `S4` — Energy intent, power feed-forwards & drop-low
- **Status:** Pending build.
- **Planned assumptions & checks:**
  - Completes `B11` (`15/15` blocks, `53/53` signals in `signals.mjs`): commanded-G drag (`S44`), climb rate (`S27c`), speed-brake drag, seen roll-in lead (`S03, S04`), `0.3 /s` proportional speed term, and $\min(\text{intent}, -\text{bleed request})$.
  - Continuous drop-low-inside height term (`20 ft/kt` past `5 kt` slow inside a turn, capped at `-300 ft`, blended over `4.3 s`, `D24`).

### `S5` — Exit vertical & S-turns (`T6`, `T7`)
- **Status:** Pending build.

### `S6` — Abeam band & lag pursuit from abeam (`T3`)
- **Status:** Pending build.

### `S7` — High yo-yo, cut-across & back behind the 3/9 line (`T4`, `T5`, `T2`)
- **Status:** Pending build.

### `A2` — Structure audit 2 (after `S7`)
- **Status:** Pending audit.

### `S8a` — `T29b`: Climbs and descents
- **Status:** Pending build.

### `S8b` — `T29d`: Aggressive Lead (to 4 G, 90°/s, reversals)
- **Status:** Pending build.

### `T29r` — Controller HUD readout & phase-plane plot
- **Status:** Pending build.

### `T30` — Blended hand-over close ↔ fighting wing & `T8` (`moving-out`)
- **Status:** Pending build.

### `CR` & `T31` — Whole-B5 code review, B5's one test & Checkpoint G
- **Status:** Pending build.

---

## 3. Modelling Issues, Observations & Improvement Ideas (For Later Review)

1. **Physical T-6A energy bleed above `2.7 G` vs constant-speed scripted Lead (`D14`, `D26`):**
   - At `200 KIAS` and `8,000 ft`, the sim's T-6A has `+0.93 kt/s` excess power at `2 G` (matching `60°` level bank) and sustains `~2.71 G` at `MAX` power (`0 kt/s` bleed). At `3 G` it bleeds `-0.60 kt/s`, and at `4 G` it bleeds `-2.75 kt/s`. Because the scripted Lead holds `200 KIAS` kinematically even in a `3–4 G` turn, any `#2` pulling `3–4 G` on the inside of an aggressive turn must physically bleed airspeed or trade altitude (`drop-low-inside`). The gauge's speed check (`D26`) therefore judges `±15 KIAS` after the `30 s` wings-level exit settle for `90–180°` turns and accounts for physical `G·s` bleed in `S8b`.
2. **Short predictive planner held in reserve (`CA7`):**
   - Linear loop margins are large (`48–90°` phase margin, `1.2–19 s` extra-delay margin), so a model-predictive planner is unnecessary for stability in academic turns. It is held in reserve (`control-model.md` §10) only if back-to-back `4 G` reversals in `S8b` (`T29d`) require multi-second turn-and-vertical sequencing beyond `B03` and `B06`.
3. **Unload-roll-pull cosine taper vs `20°` kink (`control-model.md` §9):**
   - Today's `liftWithin` switches from full pull to wing-aligned pull share at `pullWithinDeg = 20°` (continuous in value, kinked in slope). If roll-and-pull during the urgent miss (`S3b`) or `S8b` reversals shows a noticeable G-rate corner at `20°` bank error, replacing the piecewise share with a smooth cosine window is a zero-parameter improvement.
4. **Close formation line-axis stiffness in `60° / 2 G` turns (`control-model.md` §11, for later close-formation polish):**
   - In close formation (`closeLaw`), bank-to-lift gain multiplies by Lead's G, doubling the line-axis crossover in a `2 G` turn and narrowing its paper phase margin to `~18°`. Close formation is untouched in B5, but this is logged for future reference if steep close turns ever show lateral hunting.

---

## 4. Fable `D1–D26` & Control-Map `R1–R15` Resolution Ledger

| ID | Summary | Target Slice | Status | Verification / Notes |
|---|---|---|---|---|
| **D1** | Vertical loop's damping on own $\dot{h}$ fights planned descents | `S1` / `S3b` | `S27c` built (`54655fde`) / `B10` in `S2`/`S3b` | `S27c` carries $(h_T, \dot{h}_T)$ in `fw-reference.js`; `B10` damps $(\dot{h}_T - \dot{h})$ in `S2`/`S3b` |
| **D2** | Drafted steering ($K_\chi = 0.3\text{ /s}$, $k = 1/150\text{ ft}$) fails `C2` | `S2` | Planned | Resized to $K_\chi = 0.5\text{ /s}$, $K_e = 0.026^\circ/\text{ft}$ (48–65° PM; confirmed by `S0` $t_{63} = 0.15\text{–}0.25\text{ s}$) |
| **D3** | Guard predictor uses Lead's bank 0.4 s stale | `S0` | **Built (`54655fde`)** | `seeFw` / `leadNowOf` extrapolates Lead's seen bank by seen roll rate (`S03`, capped `±70°`) |
| **D4** | Miss vertical reach vs cue time & floor G | `S3b` | Planned | $3\text{ s} \le t_{\text{pass}} \le 10\text{ s}$; `minG = 0.5 G` roll-and-pull; least turn mix $\Delta\omega$ |
| **D5** | Blend scalar loop inputs (`B08`) over $\ge 6\text{ s}$ path / $\ge 4.3\text{ s}$ height | `S1` / `S3b` | **`B08` built (`54655fde`)** | `fw-reference.js` blends scalar loop inputs; `B07` runs on measured $(s, d)$ in `S2` |
| **D6** | Explicit hysteresis bands ($\ge 2\times$ ripple) and dwells on all technique cues | `S3b, S5–S7` | Planned | Applied across `T1–T7` with 3 s no-restart timer |
| **D7** | Re-cut slice order so perception (`S0`) and plumbing (`S1`) precede follower/guard | `S0, S1` | **Built (`54655fde`)** | `S0` and `S1` landed first on `formation-b5-slices` and merged into `formation-close-wingman-b2` |
| **D8** | Speed brake out $> 60\text{ ft/s}$ for 1 s under bleed $\le -0.5$, in $< 20\text{ ft/s}$, hold $\ge 3\text{ s}$ | `S4` | Planned | Implemented in `B11` (`S34`); retract set to `10 ft/s` per `S0` `D25` ripple (`21.66 ft/s`) |
| **D9** | $\pm 250\text{ ft}$ offset saturation hands unmet closure to energy/speed | `S2` | Planned | Generalized by `D21` via `S29b` ($w - \omega \cdot d_{\text{cmd}}$) $\to$ `S27g` ($\Delta v_{\text{ref}}$) |
| **D10** | Keep $k_c = 0.5$ and $\tau_s = 10\text{ s}$ in arc loop | `S2` | Planned | `B07` uses $\tau_s = 10\text{ s}$, $k_c = 0.5$ |
| **D11** | Drop 1 s smoother on slant closure | `S0` | **Built (`54655fde`)** | `S14` computed directly from dead-reckoned Lead velocity and own velocity (`FW_SEE.closureSec` removed) |
| **D12** | Power PI integral time $T_i = 45\text{ s}$ | `S2` / `S4` | Superseded by `D23` | Integrator dropped in favour of `0.3 /s` proportional speed loop + feed-forwards |
| **D13** | Measure vertical G lag and turn-rate lag on rig in `S0` | `S0` | **Built (`54655fde`)** | `fw-rig.mjs --s0-lags`: turn-rate $t_{63} = 0.15\text{–}0.25\text{ s}$, vertical G $t_{63} = 0.15\text{ s}$ |
| **D14** | Sustained turn energy bleed vs constant-speed Lead | `S4` / `S8b` | Planned | Withdrawn at 2 G (+0.93 kt/s spare); accounted for at 3–4 G in `S8b` |
| **D15** | `C10` counts core loops ($\approx 48$) separately from technique plans ($\approx 36$) | `A2` | Planned | Checked in `A2` audit |
| **D16** | Guard vertical bound (`S38`) stated in resource matrix | `S3` | Planned | Documented in `control-model.md` and built in `separation.js` |
| **D17** | Continuous phase weights (`S21`) and latched case label (`S22`, $\pm 50\text{ ft}$ band) | `S3a` | Planned | Built in `supervisor.js` |
| **D18** | `lag-abeam` reverses on crossing Lead's track behind him (LOS rate backup) | `S6` | Planned | Built in `techniques/lag-abeam.js` |
| **D19** | Verify large-signal roll-rate capture within $\pm 250\text{ ft}$ ($\le 1$ overshoot) | `S2` | Planned | Checked on `S2` sketch capture cases |
| **D20** | G cap trims positive climb $\Delta G_v$ first, 1 G hold second, turn last (0.2 G knee) | `S1` | **Built (`54655fde`)** | Built in `B13` (`liftWithin`) and verified by `--s0-lags` `C8` 3.5 G cap test |
| **D21** | One 10 s range constant in turns and level via unmet closure `S29b` $\to$ `S27g` | `S2` | Planned | `S27g` built in `S1` (`54655fde`); `S29b` and `0.3 /s` speed loop in `S2` |
| **D22** | Wire `S05b` (Lead G), `S31`, `S32` into `B13` in `signals.mjs` | `D2b` / `S1` | **Built (`54655fde`)** | Target rows in `D2b` (`b2527e14`); `S05b` and `B13` flight wiring in `S1` (`54655fde`) |
| **D23** | Proportional `0.3 /s` speed loop + physics feed-forwards, no integrator | `S2` / `S4` | Planned | Proportional loop in `S2`; full feed-forwards in `S4` |
| **D24** | Continuous drop-low-inside height term (`20 ft/kt` past `5 kt` slow, cap `-300 ft`) | `S4` | Planned | Built in `B05` normal follower |
| **D25** | Measure un-smoothed slant closure ripple in `S0` to confirm `20` vs `10 ft/s` brake in-level | `S0` / `S4` | **Measured in `S0` (`54655fde`)** | `S14` ripple at `T2` is `21.66 ft/s` p2p (`> 20 ft/s`) $\to$ `S4` brake retract threshold set to `10 ft/s` |
| **D26** | Add `90°` and `180°` turns in `S2`; judge `±15 KIAS` after `30 s` exit settle | `S2` / `S4` / `S8b` | Planned | Scenarios added in `S2`; speed check in `S4` and `S8b` |
| **R1** | Bring all fighting-wing signals onto one `L`/`N` delay rule | `S0` | **Built (`54655fde`)** | Built in `perception.js` and `fighting-wing.js` |
| **R2** | Unify slant closure on velocity projection with no 1 s smoother | `S0` | **Built (`54655fde`)** | Built in `perception.js` (`S14`) |
| **R3** | Replace aim-line turn hidden feedback with true path turn-rate $\omega_{\text{FF}}$ | `S2` | Planned | Built in `B05` / `B08` / `B09` |
| **R4** | Replace 3-in-series power hold with `B11` speed + physics feed-forward loop | `S4` | Planned | Built in `fighting-wing.js` |
| **R5** | Remove duplicate arc-error power term (`powerArcSec`) | `S2` | Planned | Removed in `S2`; replaced by `S29b` unmet-closure hand-off |
| **R6** | Fix `liftWithin` cap order so turn does not give way first | `S1` | **Built (`54655fde`)** | Built in `S1` (`B13`) and verified by `--s0-lags` `C8` 3.5 G cap test |
| **R7** | Fix `in-position` 780 ft start and make `B03` phase/case drive entry/exit placement | `S0` / `S3a` | Planned | Gauge start fixed in `S0`; `B03` built in `S3a` |
| **R8** | Replace dual predictors (`fwGuard` + `separationFilter`) with single predictor `B12` | `S3` | Planned | Built in `separation.js` |
| **R9** | Remove switch-to-switch relays (`filterHold → powerCut`, `lineShort → noseBehind`) | `S2` / `S3` / `S3b` | Planned | Removed across `S2–S3b` |
| **R10** | Carry close formation's physics feed-forward pattern into fighting wing | `S4` | Planned | Built in `B11` (`S4`) |
| **R11** | Remove every-step 1.5 s world-axes aim blend that lags steady turns by 12–26° | `S2` | Planned | Removed in `S2`; transitions blended by `B08` |
| **R12** | Connect seen sweep/aspect/HCA and LOS rate (`S15`) to phases and `lag-abeam` | `S3a` / `S6` | Planned | Connected in `S3a` and `S6` |
| **R13** | Verify linear step responses on rig (`offset-T2`, `arc-T2`) once filter stops acting at trim | `S2` / `S3` | Planned | Checked via `fw-rig.mjs` (`C11`) |
| **R14** | Widen fighting-wing band to `0°` sweep (truly abeam) and build `lag-abeam` (`T3`) | `S6` | Planned | Built in `slots.js` and `techniques/lag-abeam.js` |
| **R15** | Eliminate baseline over-control faults (G onset, aim jumps, 300 ft low, torque swings) | `S2–T31` | Planned | Verified by `faults.mjs` at `A2` and `T31` |
