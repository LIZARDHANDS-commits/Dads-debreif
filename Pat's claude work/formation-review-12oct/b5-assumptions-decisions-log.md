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

### `S2 + S3 + S3a + S3b + A1` — Step 1 (`B03–B10`, `B12`, `T1: pass-clear`, Audit 1)
- **Status:** **Built & verified (`e25b131d`).**
- **What was built & verified:**
  - `S2` (`B05`, `B07`, `B09`): normal follower on concentric circle (`R - d_cmd`, radius clipped at `20,000 ft`) or swept line with asymmetric approach caps `20°` out / `12°` in ($K_e = 0.026^\circ/\text{ft}$, `D2`), true path curvature feed-forward $\omega_{\text{FF}}$ (`R3` closed), arc/range loop ($\tau_s = \tau_r = 10\text{ s}$, $k_c = 0.5$, soft closure limit `25 → 60 ft/s` over `200–400 ft`, `d_cmd` `±250 ft` slewed `60 ft/s`, unmet closure `S29b` $\to$ `S27g` $\Delta v_{\text{ref}}$, `D9`, `D10`, `D21`), steering loop ($K_\chi = 0.5\text{ /s}$), and `90°`/`180°` turn cases (`D26`).
  - `S3` (`B12` in `separation.js`): single `10 s` closing-pass predictor `leastPass` on raw demands (`S31`, `S32`) using extrapolated Lead bank (`S03`), cubic barrier $x = \text{clip}((600 - p)/100, 0, 1)$, urgency $u = x^3$ (`2 s` decay), least-change horizontal (`S37`) and vertical (`S38`, below unless `> 100 ft` high, `D16`) bounds, `3 s` side hold (`S41`), graded bleed request (`S39`), and smooth cap opening (`S40`, `550 → 500 ft`); `R8` and `R9` closed.
  - `S3a` (`B03` in `supervisor.js`): continuous phase weights `S21` (`1.5 s` blend, no `1 s` hold), latched case label `S22` (`±50 ft` dead band, `D17`), and `6 s` `sideBlend`; `R7` and `R12` (entry/capture) closed.
  - `S3b + A1` (`B04`, `B06` `T1: pass-clear` in `techniques/miss.js`, `B10` with $\dot{h}_T - \dot{h}$ damping `D1`): `3 s ≤ t_pass ≤ 10 s`, depth $h = \sqrt{625^2 - p^2}$ below Lead, `minG = 0.5 G` unload-roll-pull (rolling and pulling positive G, never pushing 0/neg G), least outward turn mix $\Delta\omega$ (`D4`), picture-based energy intent, `14/15` blocks and `51/53` signals built, `5/5` `fw-rig.mjs` step responses clean.

### `S4` — Energy intent, power feed-forwards & drop-low (Step 2)
- **Status:** **Built & verified (`15/15` target blocks, `53/53` target signals built — `100%` of target control model).**
- **What was built & verified:**
  - Complete `B11` (`powerFromRef` in `fighting-wing.js`): physics feed-forwards for commanded-G drag (`S44` from `B13` before unload-roll-pull and shaper), climb rate (`S27c` $0.5\dot{h} + 0.5(\dot{z}_L + \dot{h}_T)$), speed-brake drag when `S34` is out, and Lead's seen roll-in rate (`S03, S04` above `10°/s` ramping to `30°/s`), plus `0.3 /s` proportional speed loop on $(V_L + \Delta v_{\text{ref}} - V)$ (`D21`, `D23`) and effective intent bias $\min(\text{intent `S27d`}, -\text{bleedReq `S39`}) \times 2\text{ kt/s}$, handing `{ throttle }` directly to `stepLead` (`R4` `ac.speedHold` series cascade and `lowMax` relay retired; `R10` closed).
  - Intent-gated speed brake switch `S34` (`D8`, `D25`): deploys only when `slantClosing > 60 ft/s` for `1 s` (`boardsOnSec`) under deliberate bleed (`effectiveIntent <= -0.5`), retracts below `10 ft/s` (`boardsOffFtps = 10` per `S0`'s `D25` `21.66 ft/s` ripple measurement) or when `effectiveIntent > -0.2`, held at least `3 s` (`boardsHoldSec`).
  - Continuous drop-low-inside height term in `B05` (`D24`): $h_T = \text{stack} - \min(300, 20 \times \max(0, \text{deficit} - 5))$ when turning inside, blended over `4.3 s` going down and `15 s` returning to stack, with profile rate $\dot{h}_T$ (`D1`) and `lowCounted = dropLowFt > 100` (`TS-233`).
  - Rig check (`fw-rig.mjs`): `power-T1` `t63 = 3.45 s` (matching $\tau = 1/0.3 = 3.33\text{ s}$ + `0.12 s` engine lag), `0%` overshoot; all `30 s`, `90°`, and `180°` gauge turns end within `15 KIAS` of Lead at roll-out and settle (`D26`).

### `S5` — Exit vertical & S-turns (`T6`, `T7`)
- **Status:** **Built & verified (`1e33a17c` plugins, `28b61f27` `B04` registration & gauge verification).**
- **What was built & verified (`1e33a17c` + `28b61f27`):**
  - `src/modules/turn-sim/live/wingman/techniques/exit-vertical.js` (`T6`, priority 6): cues in `exit` phase when `|s - 650| > 150 ft` or `|closure| > 20 ft/s` for 2 steps (deferring to `s-turns` when tight and cone-limited); sizes vertical target $h_T = \text{stack} - (\Delta s / 10\text{ s}) \times 12\text{ ft/(ft/s)}$ (`±350 ft` cap, `[500, 1000] ft` cone slant cap when `horiz < 950 ft`, keeping full dive authority when stretched outside `950 ft`) with smooth profile rate $\dot{h}_T$ (`D1`) and energy intent (`+0.5` dive / `-0.5` climb); done when `|s - 650| <= 50 ft` and `|closure| <= 10 ft/s` for `5 s`.
  - `src/modules/turn-sim/live/wingman/techniques/s-turns.js` (`T7`, priority 7): cues in `level`/`exit` phase when `slant < 575 ft` or (`closure > 15 ft/s` and `slant < 650 ft`) for 2 steps; sizes heading swing `12°–30°` from $\cos\psi = 1 - \Delta s / (V \cdot 10\text{ s})$, alternates legs every `6 s` or across cone edges (`32°`/`58°`) with `-0.5` bleed intent; aborts on new turn, done when `slant >= 650 ft` and `closure <= 5 ft/s` for `5 s`.
  - Verified on `b5-level-tight` (`520 ft` tight wings-level start): settles cleanly at `628 ft`, `42.5°` sweep, `-54 ft` height, `+0.1 KIAS`, `0` torque swings, `0` filter/guard steps.

### `S6` — Abeam band & lag pursuit from abeam (`T3`)
- **Status:** **Built & verified (`28b61f27`).**
- **What was built & verified:**
  - Widened `FW_REGION.sweepDeg` in `src/modules/turn-sim/live/slots.js` (`#L157-L161`) to `Object.freeze([0, FW_BAND.sweepDeg[1] + FW_BAND.seeMarginDeg])` (`[0, 70]`) so `#2` anywhere behind Lead's 3/9 line (`sweep >= 0°`) within `400–1,300 ft` is classified as `'fw'` and `pressFw` never refuses Lead's turn at `0–19°` sweep (`TS-233`, `R14`).
  - Built `src/modules/turn-sim/live/wingman/techniques/lag-abeam.js` (`FW_LAG_ABEAM_TECHNIQUE`, `T3`, priority 3, `FW_WING.lagAbeam` in `wing-moves.js`): cues when Lead turns/rolls into `#2` near abeam (`0° <= sweep < 20°`, `450–1,050 ft`), steers a gentle outward lag course (`lagOutDeg = 15°`, `lagTurnRadps = 0`) toward `tailAimFt = 650 ft` behind Lead while descending along a `D = 625 ft` clearance profile (`minDepthFt = 120`, `maxDepthFt = 275`), then reverses onto Lead's circle upon crossing behind Lead's track (`dContFt <= 180 ft` with `sweepDeg >= 25°` and `sContFt >= 250 ft`, or backup `S15` LOS-rate cue `losDps >= 2 * 2.5°/s`, `D18`, `R12`).
  - Moved `b5-into-abeam` in `tools/formation-gauge.mjs` to `sweepDeg: 10` (truly abeam): `#2` passes clear below (`least slant = 432 ft`, `wrong-way roll = 1.5 s`, `-9.1 KIAS` at rollout) and achieves **all 3 wings-level settle rulings green (`899 ft` in `500–1,000 ft`, `+10 ft` height, `+9.1 KIAS`)**.

### `S7` — High yo-yo, cut-across & back behind the 3/9 line (`T4`, `T5`, `T2`)
- **Status:** **Built & verified (`1e33a17c` plugins, `28b61f27` `B04` registration, legacy retirement & gauge verification).**
- **What was built & verified (`1e33a17c` + `28b61f27`):**
  - `src/modules/turn-sim/live/wingman/techniques/behind-39.js` (`T2`, priority 2): cues when `sweep < 0°` or predicted cross-ahead within `3 s` for 2 steps; sizes vertical pass depth below Lead (`100–300 ft` for `625 ft` slant), `35°` inward/lag course bias, `-0.5` bleed intent, `0.5` urgency; done when `sweep >= 15°` and `slant >= 500 ft` for `2 s`.
  - `src/modules/turn-sim/live/wingman/techniques/yo-yo.js` (`T4`, priority 4): cues in `turning` when inside circle (`dFt > 30 ft`, since `dFt = R - r` is `+` inside) and `closure > 15 ft/s` for `2 s` (`predPass < 620 ft` or `sweep < 25°`); climbs `12 ft/(ft/s)` above Lead (`100–450 ft`, bounded by `1,000 ft` slant) with `-0.5` bleed intent, tops out when `closure < 5 ft/s` for `5 s`, and descends back onto circle **ending stacked low** (`-50 ft`); done within `50 ft` of stack with `|closure| < 10 ft/s` or on turn exit.
  - `src/modules/turn-sim/live/wingman/techniques/cut-across.js` (`T5`, priority 5): cues in `turning` when `slant > 1,000 ft` and `closure <= 0 ft/s` for `3 s`; opens inward approach cap up to `45°` total (`+25°` above `normalRef`'s `20°`), `-150 ft` lead offset, `-150 ft` dive, `+15 kt` speed offset, `+1.0` gain intent; aborts if `!turning` or `sweep < 15°`, done when `slant < 900 ft` or closing `>= 30 ft/s` inside `1,000 ft`.
  - Registered all 7 techniques `[T1..T7]` in strict priority order in `src/modules/turn-sim/live/wingman/techniques/index.js`, retired the inline `sTurn` block in `supervisor.js` and legacy `sTurnFt`, `sTurnDoneFt`, `yoyo.slowKt`, `yoyo.powerBackKt`, `yoyo.excessFtps`, `yoyo.ownerHoldSec` in `wing-moves.js` and `signals.mjs`.
  - Verified on `b5-away-very-stretched` (`1,150 ft` start): cuts across chord and settles in the cone at `975 ft`, `32.5°` sweep, `-85 ft` height, `+9.7 KIAS` (all 3 settle rulings green).

### `A2` — Structure audit 2 (after `S7`)
- **Status:** **Built & verified (`28b61f27`, Subagent `b9b5857d`).**
- **Audit Summary (`C1`, `C10`, `C11`):**
  - **`C1` Technique Purity (`7/7` pass):** All 7 techniques in `src/modules/turn-sim/live/wingman/techniques/` (`miss.js`, `behind-39.js`, `lag-abeam.js`, `yo-yo.js`, `cut-across.js`, `exit-vertical.js`, `s-turns.js`) have zero forbidden imports (`fluid-lead.js`, `power.js`, `shaper.js`, `separation.js`) and write strictly through `makeFwReference` (`S24` / `S26`).
  - **`C10` Structural Counts (`check.mjs --tag cm` `PASSED`):**
    - Target blocks built: `15/15` (`100%`)
    - Target signals built: `53/53` (`100%`)
    - Registered `B06` techniques: `7` (`T1..T7`, priorities `1..7`)
    - Delays: `1` (`0.4 s` dead-reckoned Lead with extrapolated bank `S03`)
    - Separation predictors: `1` (`leastPass` closing-pass predictor in `separation.js`)
    - Throttle owners: `1` (`powerFromRef` proportional `0.3 /s` + physics feed-forwards, `0` integrators)
    - Lift composers: `1` (`liftWithin` with `0.2 G` knee)
    - Control switches writing a plant input: `1` (`S34` intent-gated speed brake)
    - Tuning numbers & sources: `906 rows` in `numbers.md` (`0` missing sources), `268` tuning numbers in `check.mjs` across `119` ledger entries (`0` un-ledgered numbers; core fighting-wing loops/follower/guard/perception/phase `≈ 51` numbers + `7` technique sub-tables `99` numbers).
  - **`C11` Rig & Non-Regression:** `5/5` `fw-rig.mjs` step responses clean (`1% / 1% / 0% / 1% / 6%` overshoot, `0` filter steps); `four-ship-probe.mjs` `2d5b5a8020839796` for both `{}` and `{"fwWing":"live"}`.

### `S8a` — `T29b`: Climbs and descents
- **Status:** Built (`55c8aa35`).

### `S8b` — `T29d`: Aggressive Lead (to 4 G, 90°/s, reversals)
- **Status:** Built (`55c8aa35`); `b5-hard-*` gauge set.

### `T29r` — Controller HUD readout & phase-plane plot
- **Status:** Built (15 Oct 2026). Drop-down is a Data tag menu tick, off by default (so closed unless asked), not a click target on the HUD: a deviation from "beside TQ"; the label `CTL ▾` shows beside TQ when open. `D3b` is a canvas plot of slant vs closure, not (s−650, −c). Not yet seen in the app by Patrick. `LAYOUT_VERSION` not bumped.

### `T30` — Blended hand-over close ↔ fighting wing & `T8` (`moving-out`)
- **Status:** Built (`288f1c70`). Also fixed a root cause in `errors.js` `planRollOutFix` (roll-out speed pulse started from Lead's speed): max hand-over pitch-rate jump `7.27 → 1.47 °/s`.

### `CR` & `T31` — Whole-B5 code review, B5's one test & Checkpoint G
- **Status:** Partly built. The test (`tests/unit/turn-sim/fighting-wing.test.js`) passes first run, unbent. Gates green (`check.mjs` PASSED, `919` numbers rows, rig `5/5`, probe `2d5b5a8020839796`, build clean). **Not done:** the 4-ship recorded Lead replay; a read-only `CR` agent review; Checkpoint G (Patrick).

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
| **D1** | Vertical loop's damping on own $\dot{h}$ fights planned descents | `S1` / `S3b` | **Built (`e25b131d`)** | `S27c` carries $(h_T, \dot{h}_T)$ in `fw-reference.js`; `B10` damps $(\dot{h}_T - \dot{h})$ in `fighting-wing.js` |
| **D2** | Drafted steering ($K_\chi = 0.3\text{ /s}$, $k = 1/150\text{ ft}$) fails `C2` | `S2` | **Built (`e25b131d`)** | Resized to $K_\chi = 0.5\text{ /s}$, $K_e = 0.026^\circ/\text{ft}$ (48–65° PM; `steering-T1` $t_{63} = 6.75\text{ s}$, `1%` overshoot) |
| **D3** | Guard predictor uses Lead's bank 0.4 s stale | `S0` | **Built (`54655fde`)** | `seeFw` / `leadNowOf` extrapolates Lead's seen bank by seen roll rate (`S03`, capped `±70°`) |
| **D4** | Miss vertical reach vs cue time & floor G | `S3b` | **Built (`e25b131d`)** | $3\text{ s} \le t_{\text{pass}} \le 10\text{ s}$; `minG = 0.5 G` roll-and-pull; least turn mix $\Delta\omega$ in `techniques/miss.js` |
| **D5** | Blend scalar loop inputs (`B08`) over $\ge 6\text{ s}$ path / $\ge 4.3\text{ s}$ height | `S1` / `S3b` | **Built (`e25b131d`)** | `fw-reference.js` blends scalar loop inputs; `B07` runs on measured $(s, d)$ |
| **D6** | Explicit hysteresis bands ($\ge 2\times$ ripple) and dwells on all technique cues | `S3b, S5–S7` | **Built (`28b61f27`)** | Applied across all 7 registered techniques (`T1–T7`) with `noRestartSec: 3` and explicit cue/done dwells |
| **D7** | Re-cut slice order so perception (`S0`) and plumbing (`S1`) precede follower/guard | `S0, S1` | **Built (`54655fde`)** | `S0` and `S1` landed first on `formation-b5-slices` and merged into `formation-close-wingman-b2` |
| **D8** | Speed brake out $> 60\text{ ft/s}$ for 1 s under bleed $\le -0.5$, in $< 20\text{ ft/s}$, hold $\ge 3\text{ s}$ | `S4` | **Built (`568a56c3`)** | Implemented in `B11` (`S34`); retract set to `10 ft/s` per `S0` `D25` ripple (`21.66 ft/s`), held $\ge 3\text{ s}$ |
| **D9** | $\pm 250\text{ ft}$ offset saturation hands unmet closure to energy/speed | `S2` | **Built (`e25b131d`)** | Generalized by `D21` via `S29b` ($w - \omega \cdot d_{\text{cmd}}$) $\to$ `S27g` ($\Delta v_{\text{ref}}$) |
| **D10** | Keep $k_c = 0.5$ and $\tau_s = 10\text{ s}$ in arc loop | `S2` | **Built (`e25b131d`)** | `B07` uses $\tau_s = 10\text{ s}$, $k_c = 0.5$ (`offset-T2` `1%` overshoot, `arc-T2` `6%` overshoot) |
| **D11** | Drop 1 s smoother on slant closure | `S0` | **Built (`54655fde`)** | `S14` computed directly from dead-reckoned Lead velocity and own velocity (`FW_SEE.closureSec` removed) |
| **D12** | Power PI integral time $T_i = 45\text{ s}$ | `S2` / `S4` | **Built (`568a56c3`, superseded by `D23`)** | Integrator dropped in favour of `0.3 /s` proportional speed loop + physics feed-forwards |
| **D13** | Measure vertical G lag and turn-rate lag on rig in `S0` | `S0` | **Built (`54655fde`)** | `fw-rig.mjs --s0-lags`: turn-rate $t_{63} = 0.15\text{–}0.25\text{ s}$, vertical G $t_{63} = 0.15\text{ s}$ |
| **D14** | Sustained turn energy bleed vs constant-speed Lead | `S4` / `S8b` | **Built at 2 G (`568a56c3`)** / 3–4 G in `S8b` | Withdrawn at 2 G (+0.93 kt/s spare, all 2 G turns within 15 KIAS); accounted for at 3–4 G in `S8b` |
| **D15** | `C10` counts core loops ($\approx 48$) separately from technique plans ($\approx 36$) | `A2` | **Built (`28b61f27`)** | Verified in `A2` (`51` core loop/follower/guard/perception/phase numbers, `99` technique numbers across `7` sub-tables, `1` control switch `S34`, `0` un-sourced numbers) |
| **D16** | Guard vertical bound (`S38`) stated in resource matrix | `S3` | **Built (`e25b131d`)** | Documented in `control-model.md` and built in `separation.js` |
| **D17** | Continuous phase weights (`S21`) and latched case label (`S22`, $\pm 50\text{ ft}$ band) | `S3a` | **Built (`e25b131d`)** | Built in `supervisor.js` (`1.5 s` phase weights, `6 s` `sideBlend`) |
| **D18** | `lag-abeam` reverses on crossing Lead's track behind him (LOS rate backup) | `S6` | **Built (`28b61f27`)** | Built in `techniques/lag-abeam.js` (`dContFt <= 180 ft` behind track primary, `losDps >= 2 * 2.5°/s` backup) |
| **D19** | Verify large-signal roll-rate capture within $\pm 250\text{ ft}$ ($\le 1$ overshoot) | `S2` | **Built (`e25b131d`)** | Verified on `fw-rig.mjs` (`offset-T2` `1%` overshoot) and `b5-` turns |
| **D20** | G cap trims positive climb $\Delta G_v$ first, 1 G hold second, turn last (0.2 G knee) | `S1` | **Built (`54655fde`)** | Built in `B13` (`liftWithin`) and verified by `--s0-lags` `C8` 3.5 G cap test |
| **D21** | One 10 s range constant in turns and level via unmet closure `S29b` $\to$ `S27g` | `S2` | **Built (`e25b131d`)** | `S29b` and `0.3 /s` speed loop hold range in both turns and wings-level flight |
| **D22** | Wire `S05b` (Lead G), `S31`, `S32` into `B13` in `signals.mjs` | `D2b` / `S1` | **Built (`54655fde`)** | Target rows in `D2b` (`b2527e14`); `S05b` and `B13` flight wiring in `S1` (`54655fde`) |
| **D23** | Proportional `0.3 /s` speed loop + physics feed-forwards, no integrator | `S2` / `S4` | **Built (`568a56c3`)** | Complete `B11` law (`power-T1` $t_{63} = 3.45\text{ s}$, `0%` overshoot; `15/15` blocks built) |
| **D24** | Continuous drop-low-inside height term (`20 ft/kt` past `5 kt` slow, cap `-300 ft`) | `S4` | **Built (`568a56c3`)** | Built in `B05` (`buildNormalReference`, blended `4.3 s` down / `15 s` return, counted past `100 ft`) |
| **D25** | Measure un-smoothed slant closure ripple in `S0` to confirm `20` vs `10 ft/s` brake in-level | `S0` / `S4` | **Built (`568a56c3`)** | `S14` ripple at `T2` is `21.66 ft/s` p2p (`> 20 ft/s`) $\to$ `FW_WING.brakes.boardsOffFtps = 10` in `S4` |
| **D26** | Add `90°` and `180°` turns in `S2`; judge `±15 KIAS` after `30 s` exit settle | `S2` / `S4` / `S8b` | **Built (`S2` / `S4`)** | `b5-into-90/180` and `b5-away-90/180` all within `15 KIAS` at roll-out and settle |
| **R1** | Bring all fighting-wing signals onto one `L`/`N` delay rule | `S0` | **Built (`54655fde`)** | Built in `perception.js` and `fighting-wing.js` |
| **R2** | Unify slant closure on velocity projection with no 1 s smoother | `S0` | **Built (`54655fde`)** | Built in `perception.js` (`S14`) |
| **R3** | Replace aim-line turn hidden feedback with true path turn-rate $\omega_{\text{FF}}$ | `S2` | **Built (`e25b131d`)** | Built in `B05` / `B08` / `B09` (`0` aim jumps across all `b5-` cases) |
| **R4** | Replace 3-in-series power hold with `B11` speed + physics feed-forward loop | `S4` | **Built (`568a56c3`)** | `B11` hands `{ throttle }` directly to `stepLead`, retiring `ac.speedHold` in fighting wing |
| **R5** | Remove duplicate arc-error power term (`powerArcSec`) | `S2` | **Built (`e25b131d`)** | Removed in `S2`; replaced by `S29b` unmet-closure hand-off |
| **R6** | Fix `liftWithin` cap order so turn does not give way first | `S1` | **Built (`54655fde`)** | Built in `S1` (`B13`) and verified by `--s0-lags` `C8` 3.5 G cap test |
| **R7** | Fix `in-position` 780 ft start and make `B03` phase/case drive entry/exit placement | `S0` / `S3a` | **Built (`e25b131d`)** | Gauge start fixed in `S0`; `B03` built in `S3a` |
| **R8** | Replace dual predictors (`fwGuard` + `separationFilter`) with single predictor `B12` | `S3` | **Built (`e25b131d`)** | Built in `separation.js` (`leastPass` + $x^3$ barrier) |
| **R9** | Remove switch-to-switch relays (`filterHold → powerCut`, `lineShort → noseBehind`) | `S2` / `S3` / `S3b` | **Built (`e25b131d`)** | Removed across `S2–S3b` |
| **R10** | Carry close formation's physics feed-forward pattern into fighting wing | `S4` | **Built (`568a56c3`)** | Built in `B11` (`S44` commanded-G drag, `S27c` climb rate, `S03/S04` roll-in lead) |
| **R11** | Remove every-step 1.5 s world-axes aim blend that lags steady turns by 12–26° | `S2` | **Built (`e25b131d`)** | Removed in `S2`; transitions blended by `B08` |
| **R12** | Connect seen sweep/aspect/HCA and LOS rate (`S15`) to phases and `lag-abeam` | `S3a` / `S6` | **Built (`28b61f27`)** | Connected to phases in `S3a` and `lag-abeam.js` (`S15` backup reversal cue) in `S6` |
| **R13** | Verify linear step responses on rig (`offset-T2`, `arc-T2`) once filter stops acting at trim | `S2` / `S3` | **Built (`e25b131d`)** | Verified via `fw-rig.mjs` (`5/5` rig cases have `0` filter/guard steps at trim, `C11`) |
| **R14** | Widen fighting-wing band to `0°` sweep (truly abeam) and build `lag-abeam` (`T3`) | `S6` | **Built (`28b61f27`)** | Built in `slots.js` (`FW_REGION.sweepDeg = [0, 70]`) and `techniques/lag-abeam.js` |
| **R15** | Eliminate baseline over-control faults (G onset, aim jumps, 300 ft low, torque swings) | `S2–T31` | In progress (`S0–S7 + A2` built) | `0` aim jumps, `< 5` torque swings, `±15 KIAS` met; final sign-off at `T31` |

---

## 5. Subagent & Audit Recommendations, Questions & Corrections Ledger

Every recommendation, question, or correction raised by a `flash` or `pro` subagent (`fw-slice-builder`, `fw-slice-verifier`, `fw-structure-auditor`, `fw-systems-plot-agent`, `fw-refs-docs-expert`) is logged below with its disposition:

| Wave / Slice | Agent & Tier | Kind | Finding / Recommendation / Question | Disposition & Commit |
|---|---|---|---|---|
| **Docs (`D4/D5`)** | `fw-refs-docs-expert` (`pro`) | **Correction** | Identified 4 stale pre-`3b` lines in `spec-7e-draft-4.md` (`D12` integrator wording vs `D23` proportional loop; `D24` discrete `-300 ft` vs continuous `20 ft/kt`; miss `0 G` wording vs `minG = 0.5 G` roll-and-pull; `T2 behind-39` numbering). | **Resolved in Docs (`84f4d965`):** Reconciled across `spec-7e-draft-4.md`, `spec.md` §7e, `decisions.md` `TS-233`, and `plan.md`. |
| **Chunk 1 (`S0`)** | `fw-slice-builder` (`pro`) + `fw-slice-verifier` (`flash`) | **Measurement & Recommendation** | `fw-rig.mjs --s0-lags` measured turn-rate lag $t_{63} = 0.15\text{–}0.25\text{ s}$ (confirming $K_\chi = 0.5\text{ /s}, K_e = 0.026^\circ/\text{ft}$ for `S2`, `D2`) and un-smoothed slant-closure ripple `21.66 ft/s` p2p in `T2` (`> 20 ft/s` `D25` threshold) $\to$ recommended setting `S4` speed-brake retract threshold `boardsOffFtps = 10 ft/s`. | **Resolved in Code (`54655fde` & `568a56c3`):** Confirmed $K_\chi = 0.5\text{ /s}$ in `S2` and set `FW_WING.brakes.boardsOffFtps = 10` in `S4`. |
| **Chunk 1 (`S1`)** | `fw-slice-verifier` (`flash`) | **Verification** | Forced `3.5 G` Lead rig test confirmed `B13` (`liftWithin`) trims positive climb $\Delta G_v > 0$ first (`stage 1`), `1 G` level hold second (`stage 2`), and horizontal turn last (`stage 3`), with `four-ship-probe.mjs` hash `2d5b5a8020839796` unchanged. | **Verified (`54655fde`):** Gate `C8` closed. |
| **Step 1 (`A1`)** | Orchestrator (`pro`) | **Correction / Observation** | In `S3b`, `miss.js` needed a picture-based energy intent (`-0.5 / 0 / +0.5` based on whether `#2` is inside/ahead vs outside/behind) and `replanTighterFt = 50 ft` one-shot re-plan so tightening passes don't under-shoot `625 ft`. | **Resolved in Code (`e25b131d`)** and logged in **Section 1 (#3)** for Patrick's live seat check at Checkpoint G. |
| **Wave 1 (`S5 + S7`)** | `fw-slice-builder` (`flash`, `a3fe02cb`) | **2-Strike Escalation & Correction** | Adding `FW_WING.{behind39, cutAcross, exitVert, sTurn}` in `wing-moves.js` caused `check.mjs --tag cm` to fail (54 un-ledgered tuning numbers) because `tools/control-map/signals.mjs` lacked prefix `LEDGER` entries for those 4 new sub-tables. Builder obeyed Disjoint Ownership & `0080` and returned the exact 4 `LEDGER` lines to Orchestrator. | **Resolved in Code (`1e33a17c`):** Orchestrator audited the 6 files, added the 4 `LEDGER` prefixes in `tools/control-map/signals.mjs`, and verified `check.mjs --tag cm` (`PASSED`, `249` numbers, `123` ledger entries). |
| **Wave 2 (`S6 + B04`)** | Orchestrator (`pro`) | **5 Cross-Module Integration Fixes** | During `B04` coupled wiring of Wave 1 plugins (`T1–T7`), caught and fixed 5 cross-module integration bugs: (1) `fighting-wing.js` `pickerCtx.arc` lacked `cActual` (lived on `arcLoop`) and `chiOwnDeg`; (2) `yo-yo.js` checked `dFt < -30` instead of `dFt > 30` (`dFt = R - r` is `+` inside Lead's circle) and needed `!ctx.phase?.turning` exit completion; (3) `cut-across.js` failed to abort when Lead rolled wings level before `slant < 900 ft` and over-steered when adding `45°` on top of `normalRef`'s `20°`; (4) `exit-vertical.js` clamped `heightTargetFt = 0` whenever `horiz > 1,000 ft` (`Math.sqrt(Math.max(0, 1000^2 - horiz^2))`), blocking the catch-up dive on `b5-away-very-stretched`, and overwrote `B07`'s `+15 kt` unmet-closure speed offset with `+5 kt`; (5) `separation.js` assumed `#2` would bank into Lead at `thenSec = 2.5 s` during an into-turn and only credited `120 ft` vertical reach when `vg < -0.15`. | **Resolved in Code (`28b61f27`):** All 5 cross-module fixes landed and verified against the full `b5-*` gauge set. |
| **Wave 2 (`A2` Audit)** | `fw-structure-auditor` (`flash`, `b9b5857d`) | **Audit Finding & Recommendation** | (1) Confirmed `C1` purity across all 7 techniques (`T1–T7`), `check.mjs --tag cm` `PASSED` (`15/15` blocks, `53/53` signals, `268` tuning numbers, `119` ledger entries), `5/5` rig cases clean, and `four-ship-probe` `2d5b5a8020839796`. (2) Identified that an aggressive `50°` outward break (`0.14 rad/s`) in `lag-abeam.js` caused a `5.22 G`, `5.3 s` wrong-way roll into `279 ft` (`-47.8 KIAS`), whereas restoring the gentle `15°` outward lag (`lagTurnRadps = 0`) brought `b5-into-abeam` to `least slant = 432 ft`, `wrong-way roll = 1.5 s`, `-9.1 KIAS` at rollout, and all 3 wings-level settle rulings green (`899 ft`, `+10 ft`, `+9.1 KIAS`). (3) Noted for Checkpoint G / `S8b` tuning that `b5-into-tight` (`431 ft` min slant) and `b5-into-abeam` (`432 ft` min slant) dip ~`68 ft` inside `500 ft` during the initial `0.4 s` reaction + roll-under geometry before settling cleanly in the cone. | **Resolved in Code (`28b61f27`)** (gentle `15°` lag restored in `lag-abeam.js`) & **Logged in Section 1 (#3, #5)** for Patrick's live seat check and `S8b` review. |


