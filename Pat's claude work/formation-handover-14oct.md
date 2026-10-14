# Formation handover, 14 Oct 2026: the live wingman's fighting wing, Round 5 (`B5`) in slices

For the next Formation session. Read `AGENTS.md`, `docs/PLAN.md` (its waiting list) and `docs/modules/turn-sim/README.md`, then this page. The long handover before it, `formation-handover-12oct-night.md`, is history: use it only to look something up.

## Where it stands

- **Branch** `formation-close-wingman-b2` (PR #1031; phase B's CI is not watched, Patrick's call). Isolated builder worktree: `../formation-b5-slices` (synced to `formation-close-wingman-b2`). On screen: **V2.433**. Phase B never goes to main without Patrick.
- **Close formation (B1–B3):** flown and approved, and Live is the default (`four-ship-probe.mjs` hash `2d5b5a8020839796` locked across all B5 slices).
- **Fighting wing (B5) control model & Spec 7e Draft 4 (`T29m`, `D2b`, `T29s`):** merged (`b2527e14`, `84f4d965`).
  - `TARGET_BLOCKS` (`B01–B15`), `TARGET_SIGNALS` (`S01–S45`), target Mermaid diagrams, and `TS-234` `C1` single-writer enforcement are wired in `tools/control-map/signals.mjs`, `check.mjs`, `draw.mjs`, and `docs/modules/turn-sim/control-model.md`.
  - Fable's `3a` (`D1–D20`) and `3b` (`D21–D26`) model/audit reports and Patrick's 14 Oct rulings are folded into `Pat's claude work/formation-review-12oct/spec-7e-draft-4.md`, `docs/modules/turn-sim/spec.md` §7e, `docs/modules/turn-sim/decisions.md` (`TS-233`), and `docs/modules/turn-sim/plan.md` (§B5).
- **Round 5 (`B5`) Chunk 1 (`S0 + S1`, `54655fde`):** built, verified, and merged (`6/15` target blocks `B01, B02, B08, B13, B14, B15` and `33/53` target signals built):
  - **`S0` (Perception & rig lags):** one `0.4 s` dead-reckoned Lead delay rule (`B02`, bank extrapolated by seen roll rate `0.2 s` capped `±70°` `D3` `S03`, seen Lead G `S05b` `0.15 s` `D22`, velocity-projected slant closure `S14` with 1 s smoother removed `D11`, `historySec`/`wasAt` removed), `in-position` start fixed to `750 ft` (`R7`), and `--s0-lags` added to `tools/fw-rig.mjs`.
    - Rig lag results (`D13`): turn-rate $t_{63} = 0.15\text{–}0.25\text{ s}$ (confirming $K_\chi = 0.5\text{ /s}, K_e = 0.026^\circ/\text{ft}$ for `S2`, `D2`); vertical G $t_{63} = 0.15\text{ s}$.
    - Un-smoothed slant-closure ripple (`D25`): `21.66 ft/s` p2p in `T2` (`> 20 ft/s`), setting `S4`'s speed-brake retract threshold to `10 ft/s`.
  - **`S1` (Reference blender, lift cap order & urgency shaper):** scalar reference record & blender (`B08` in `src/modules/turn-sim/live/wingman/fw-reference.js`, carrying $h_T$ and $\dot{h}_T$ `D1`, `D5`), lift composer (`B13` `liftWithin` with `0.2 G` soft knee and cap order: 1. positive climb $\Delta G_v > 0$, 2. `1 G` level hold, 3. horizontal turn `D20`, `R6` closed, verified on 3.5 G forced cap test), and urgency G-onset shaper (`B14` `shapeFwLift` with $\dot{G}_{\max} = 1 + 3u\text{ G/s}$; close formation's `shape()` untouched).
- **Nothing is running.** The overnight `/goal` loop paused at 02:28 AM due to a `429 RESOURCE_EXHAUSTED` quota limit right after `S0 + S1` completed.

## Next, in order (plan B5 in `docs/modules/turn-sim/plan.md`)

1. **Chunk 2 (`S2 + S3`):**
   - **`S2` (Normal circle & line follower):** `B05`, `B07` ($\tau_s = \tau_r = 10\text{ s}$ `D21`, unmet closure `S29b` $\to$ `S27g` $\Delta v_{\text{ref}}$, `0.3 /s` proportional speed loop `D23`), `B09` ($K_\chi = 0.5\text{ /s}, K_e = 0.026^\circ/\text{ft}$ `D2`), `B10` ($\dot{h}_T - \dot{h}$ damping `D1`), and `90°`/`180°` turn cases (`D26`).
   - **`S3` (Separation guard `B12`):** single 3 s forward predictor using `S03`, `600 → 500 ft` smooth barrier, `350 ft` hard floor, vertical floor `S38` (`D16`), retiring `separationFilter` (`R8`, `R9`).
2. **Chunk 3 (`S3a + S3b`):**
   - **`S3a` (`B03` phase & case classifier):** continuous `entry / turning / exit` weights (`S21`, `3 s`), latched `tight / inBand / stretched / veryStretched` case (`S22`, `±50 ft` band `D17`), phase-driven normal follower (`R7`, `R12`).
   - **`S3b` (`B06` technique scheduler + `T1` the miss):** `techniques/index.js` + `techniques/miss.js` (`3 s ≤ t_pass ≤ 10 s`, depth $h = \sqrt{625^2 - p^2}$ below Lead, `minG = 0.5 G` unload-roll-pull overbanking past `90°` when urgent, least turn mix `D4`, picture-based energy intent).
3. **Chunk 4 (`S4 + S5`):**
   - **`S4` (`B11` energy & power loop + `D24` drop-low-inside):** physics feed-forwards + `0.3 /s` speed loop (`D23`, `R4`, `R10`), speed brake (`> 60 ft/s` for `1 s`, in `< 10 ft/s` per `D25`, hold `≥ 3 s` `D8`), continuous drop-low-inside height term (`20 ft/kt` past `5 kt` slow, cap `-300 ft` `D24`).
   - **`S5` (`T2` high yo-yo + `T4` exit vertical):** `techniques/high-yoyo.js` and `techniques/exit-vertical.js`.
4. **Chunk 5 (`S6 + S7`):**
   - **`S6` (Abeam to `0°` & `T3` lag-abeam):** widen band to `0°` sweep (`R14`) + `techniques/lag-abeam.js` (track crossing + LOS rate backup `D18`).
   - **`S7` (`T5` S-turns, `T6` cut-across, `T7` behind 3/9):** `techniques/s-turns.js`, `cut-across.js`, `behind-3-9.js` (`15/15` blocks, `53/53` signals built).
5. **Audit & Full-System Tuning (`A1`, `A2`, Chunk 6 `S8a–T31`, Systems Engineering Plots):**
   - Intermediate slices (`S2–S7`) target "close enough for tuning" (clean build, control-map checks, rig steps, 4-ship/close non-regression); full-sim trace tuning (`A2`, `S8a`, `S8b`), `T29r` HUD readout, `T30` (`T8` move-out from close), `CR` code removal, `T31` full verification, and systems-engineering plot reproduction (`fw-systems-plot-agent`) run once the full architecture is assembled.
   - Model allocation: **Argon (`pro`)** for `fw-slice-builder`, `fw-structure-auditor`, and Orchestrator; **Flash (`flash`)** for `fw-slice-verifier`, `fw-systems-plot-agent`, and `fw-refs-docs-expert`.

## Patrick's rulings on 14 Oct (all in `TS-233` and `TS-234` in `decisions.md`, and in `spec.md` §7e and §7a)

- **Fighting wing is turn entry, turning and turn exit,** geometry first in each. Stretched with Lead turning in can fly straight ahead until on the circle wanted; tight with Lead turning away can fly ahead a bit or pull gentle lag; fastest reaction when tight and Lead turns in (the miss: vertical first below) or stretched and Lead turns away (roll in promptly onto an inside lead circle with gain intent, or cut across past 1,000 ft).
- **One `10 s` range constant (`D21`, `D23`):** $\tau_s = \tau_r = 10\text{ s}$ in turns and level flight; unmet closure `S29b` ($w - \omega \cdot d_{\text{cmd}}$, clipped `±15 kt`) shifts `S27g` ($\Delta v_{\text{ref}}$) into a `0.3 /s` proportional speed loop with physics feed-forwards (no integrator).
- **Drop-low-inside (`D24`):** continuous height term in the normal follower (`20 ft/kt` past `5 kt` slow inside a turn, capped `-300 ft`, blended over `4.3 s`).
- **The miss (`3b` §7):** `#2` never pushes to `0 G` or negative G (`minG = 0.5 G` floor stands); ordinary drop unloads to `~0.5 G`, and urgent drop **rolls (overbanking past 90° if required, via unload-roll-pull) and pulls positive G** along $n_p = 0.5(1 - u)$ with least turn mix $\Delta\omega$.
- **At the G cap (`D20`, `R6`, built in `S1`):** positive climb $\Delta G_v > 0$ gives way first, then the `1 G` level hold, then horizontal turn last (`0.2 G` soft knee).
- **G onset by urgency (built in `S1`):** $\dot{G}_{\max} = 1 + 3u\text{ G/s}$ (`1 G/s` ordinary, `2–2.5 G/s` assertive/reversals, `4 G/s` urgent).
- **One `0.4 s` delay rule (built in `S0`):** Lead `0.4 s` late and dead-reckoned with bank extrapolated by seen roll rate (`S03`); `#2`'s own state known now.

## The documents

| What | Where |
|---|---|
| The plan, slice tracker (`S0–T31`) and Argon/Flash agent pipeline | `docs/modules/turn-sim/plan.md` (§B5) |
| Running log of B5 assumptions, decisions, modelling notes & questions for Patrick | `Pat's claude work/formation-review-12oct/b5-assumptions-decisions-log.md` |
| The design and the rulings | `docs/modules/turn-sim/spec.md` §7e (`Pat's claude work/formation-review-12oct/spec-7e-draft-4.md`); `decisions.md` `TS-233`, `TS-234` |
| Fable's `3a` (`D1–D20`) and `3b` (`D21–D26`) model & audit reports | `Pat's claude work/formation-review-12oct/fable-draft-4-model-report-14oct-mapped.md`, `fable-draft-4-model-report-3b-14oct-mapped.md` |
| The control model (current + target `B01–B15` / `S01–S45` diagrams, N², ledger) | `docs/modules/turn-sim/control-model.md` (drawn by `tools/control-map/draw.mjs` from `tools/control-map/signals.mjs`) |
| Every tuning number and its source | `docs/modules/turn-sim/numbers.md` (`tools/turn-sim-numbers.mjs`); tables in `src/modules/turn-sim/live/wing-moves.js` |
| The code | `src/modules/turn-sim/live/wingman/`: `fighting-wing.js`, `fw-reference.js`, `perception.js`, `separation.js`, `supervisor.js`, `shaper.js`, `close-formation.js` |

## The checks

- **Build & numbers:** `npm run build` (no local unit/browser tests; GitHub CI not watched per Patrick); `node tools/turn-sim-numbers.mjs` (`789 rows`).
- **Control model:** `node tools/control-map/draw.mjs --check` (no diff) and `node tools/control-map/check.mjs --tag cm` (`6/15` blocks built, `33/53` signals built).
- **Rig (`S0` lags & cap order):** `node tools/fw-rig.mjs --s0-lags`.
- **Close & 4-ship non-regression:** `node "Pat's claude work/formation-review-12oct/four-ship-probe.mjs" file:///C:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif-physics/` (`2d5b5a8020839796` for both `{}` and `{"fwWing":"live"}`).
