# Tasks: flight math (`core`)

Plan: [`plan.md`](plan.md). Every task is verified with `node --test "tests/**/*.test.js"`, and each PR also runs `python3 tests/golden/checks/mutate.py` and `NODE_PATH=$(npm root -g) node tests/golden/checks/browser-parity.cjs`.

## Phase 1: base pieces (PR #51), done

- [x] **Task 1: golden-test harness.** `tests/golden/v6-source.js` cuts a named V6 function out of `original/shell.html` (or the SOF and Traffic pages it embeds) and runs it unchanged. Size S.
- [x] **Task 2: `units.js`.** V6's constants and conversions. Size S.
- [x] **Task 3: `angles.js`.** Wrapping, bearings, clock positions, aspect, HCA and compass conversion, plus unit tests pinning the heading convention. Size S.
- [x] **Task 4: `geo.js`.** Local map projection, tiles and Mercator. Size S.
- [x] **Task 5: `time.js`.** Zulu and zone formatting, KML time, DTG, UTC offset (R10). TAF day resolution was dropped from core: `wx` owns it. Size S.

## Phase 2: turn performance (PR 2), done

- [x] **Task 6: turn radius, turn rate and bank from G**
  - Acceptance: one function for each, matching Turn Sim (lines 787 to 789), Turn Fight `M` (line 4237) and the Traffic page (`bankFromG`, `turnRadiusFromG`, lines 147 and 148), with each copy's G clamps and defaults kept. Any disagreement between the copies is pinned and reported.
  - Verify: golden tests against all three copies; unit tests for known answers (4 G at 220 KTAS turns at 19.2°/s).
  - Dependencies: Phase 1. Files: `src/core/flight-math.js`, `tests/golden/core-flight-math.test.js`, `tests/unit/core/flight-math.test.js`. Size S.
- [x] **Task 7: air data and the EM chart point**
  - Acceptance: `isaRhoRatio` (line 4154), the IAS estimate and the EM point (`metrics`, line 4158) match V6, including the halved turn rate. Then, as a separate commit, remove the divide by 2 (D39) and update the golden value.
  - Verify: golden tests; a unit test that states the halving, so the later fix has to change it deliberately.
  - Dependencies: Phase 1. Files: as Task 6. Size S.
- [x] **Task 8: closure and estimated G**
  - Acceptance: the math in `closureRateKt` (line 3119) and `estimatedGAtTrack` (line 2462) matches V6, taking positions and times as arguments. Track interpolation stays in `flight-data`.
  - Verify: golden tests with V6's functions fed the same track points.
  - Dependencies: Phase 1. Files: as Task 6. Size S.
- [x] **Task 9: both tennis-ball solvers**
  - Acceptance: the debrief's `getKmlTennisSolution` (line 3140) and the 3D view's `draw3DDogfightArc` (line 3970) are each ported and pinned, with settings as arguments. The inputs where they give different answers are listed for Patrick and Dad (#19). Neither is chosen.
  - Verify: golden tests for each; a test that shows the disagreement.
  - Dependencies: Task 6. Files: `src/core/tennis.js` (or `flight-math.js`), its tests. Size M.

  - Done: the disagreement is written up in [`tennis-ball.md`](tennis-ball.md).

## Phase 3: standards (PR 3), done

- [x] **Task 10: formation standards**
  - Acceptance: the debrief classifiers (`classifyKmlError`, `classifyLeadDesired`, `kmlStandardsSummary`, lines 3051 to 3117) and Turn Sim's `classifyFormationError` (line 1881) match V6, including the #21 behaviour, with V6's values as the default preset (R18).
  - Verify: golden tests; unit tests for the preset.
  - Dependencies: Phase 1. Files: `src/core/standards.js`, its tests. Size M.

## Later, with the screens that use them

- [x] **Task 11: 3D attitude estimate, then D40 and D47.** Built by the debrief thread in its own module as `bankFromTrack` (`src/modules/debrief/view3d/scene.js`, #81): V6's bank pinned first, then D40 (real rate, correct wing down) and D47 (recorded bank first) as separate commits. It never uses recorded G for bank. **Level turn, decided by Patrick (2026-09-30, open-questions item G, option 1):** a turn counts as level when the nose is within 10° of the horizon and the heading is changing by more than about 1° a second. Only then may recorded G set the bank (acos(1/G)). This last part of D40 belongs in `bankFromTrack`, with a test first, and is the debrief thread's to build.
- [x] **Task 12: Turn Sim's G correction, then D74.** Port the G correction (line 1583) with the Turn Sim screen. Pin V6's order first: limit to 1.01, then the correction of up to −0.8 G, so G below 1 gives NaN. Then, as its own commit, limit G to 1.01 after the correction (D74), so the wingman flies almost straight. Size S. Built as `turnSimG` (`flight-math.js`), two commits.

## Decisions landed after PR 3

- [x] **D77:** the ±3° cone and INTERCEPT-needs-in-cone are confirmed; wording only.
- [x] **D78 (#21):** when the offset standard is on, it alone judges #3's fore/aft in the debrief. Tests changed first (red), then `classifyDebriefPosition`.
- [x] **D114-D116, the SMM's standards:** sweep check (D116), lead speed by block (D115), then `DEFAULT_STANDARDS` with the offset box at 7,000 ± 1,000 (D114), each its own commit, V6 still pinned. Next, outside core: the debrief's readouts and editor handle the new fields, then `app.standards` seeds from `DEFAULT_STANDARDS` with a stored-version bump.

## For the Traffic Sim

- [x] **Task 13: `wind.js`** (SPEC-traffic): `windTriangle`, new math with known-answer tests first; nothing in V6 to pin. Patrick approved SPEC-traffic at 06:43Z.

## For the Turn Fight, Traffic and Turn Sim

The shared T-6A performance model (SPEC-core "API, fifth PR"; Patrick 06:58Z). Built at 07:08Z, when Patrick chose to build every module in parallel with this model as the one shared piece. Every task wrote its known-answer tests first.

- [x] **Task 14: limits and speeds.** `T6A_LIMITS`, `stallLimitG`, `availableG`, `iasToTasKt`, `tasToIasKt`, `energyHeightFt`. Accept: 7 G at 227.5 KIAS, +4.7 G rolling, IAS↔TAS round-trips through `isaDensityRatio`, energy height from known answers. Size S.
- [x] **Task 15: the point-mass step.** `point-mass.js` `stepPointMass`. Accept: a level turn gives `turnRadiusFt` and `turnRateRadPerSec`; a steady climbing turn gives g·√(n² − cos²γ) / (V cos γ); thrust equal to drag keeps energy height constant round a loop, including straight up and down. Size M.
- [x] **Task 16: thrust and drag from the turn charts.** `t6a-turn-charts.js` (chart points with reading notes), `thrustPerWeight`, `dragPerWeight`, `excessThrustPerWeight`. Accept: SPEC-turn-fight's chart checks within their tolerances (run at both 86 and 83 kt stall speeds). Size L.
- [x] **Task 17: glide and zoom, and the cross-checks.** `T6A_GLIDE`, `glideSinkFpm`, `zoomT6A` from the chart and NFM Fig 3-4. Accept: they return the chart and manual numbers exactly; drag alone gives a 125 KIAS clean glide within 15 % of 2 NM per 1,000 ft; a thrust-off point-mass zoom from 200 and 250 KIAS lands inside the manual's gains. If the glide misses, add it as a fit point (thrust zero) and keep Task 16's checks passing. Size M.
  - Done: the drag comes from the glide chart, so the glide is exact; the NFM's zoom table (Fig 3-4) turned out to measure the gain to the 125 KIAS glide after a push, so `zoomT6A` returns that table and the model's zoom lands within 10 % of it.
- [x] **Task 18: the shaker and the split S** (Patrick 09:27Z). `T6A_MANOEUVRE`, `shakerG`, `splitST6A`. Accept: known answers for the shaker G; the split S from 100 to 120 KIAS at 10,000 ft against the SMM's about 2,000 ft (14.16 para 40), peak G at most 5, level and upright at the exit; the old stall-line pull loses less. Size M.
