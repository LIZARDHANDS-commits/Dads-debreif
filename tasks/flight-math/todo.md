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

- [ ] **Task 11: 3D attitude estimate, then D40 and D47.** Port the pure part of `attitudeFor` (line 3788): bank from heading rate and speed, with recorded G overriding it. Pin it to V6, including the halved rate (the legs are 1 s apart but it divides by about 2 s) and the sign. Then land D40 (real rate, correct wing down, G only in level turns) and D47 (recorded bank, estimated pitch when blank) as separate commits. "Level turn" needs a threshold from Dad before D40's last part. Size S.
- [ ] **Task 12: Turn Sim's G correction, then D74.** Port the G correction (line 1583) with the Turn Sim screen. Pin V6's order first: limit to 1.01, then the correction of up to −0.8 G, so G below 1 gives NaN. Then, as its own commit, limit G to 1.01 after the correction (D74), so the wingman flies almost straight. Size S.
