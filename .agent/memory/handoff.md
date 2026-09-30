# Handoff

Rewritten by `/save` at the end of each session. Read by `/sync` at the start.

## Last updated
30 Sep 2026, 21:50Z (Antigravity).

## State
- **Decisions Unified & Synchronized:** Master single decisions document in [`docs/records/plan-decisions.md`](../../docs/records/plan-decisions.md) (categorized by module on TOP, complete chronological register D1–D388 on BOTTOM), with an exact copy at `C:\Users\patri\Downloads\decisions-for-review.md`.
- **Ratified Overrides & Reversals:** D186 superseded by D384 ("Reset to Standard Defaults"), D209 & D210 reversed by D382 (60° break at 3,500 ft MSL, 45° final turn to 2,700 ft straight-in), D219 superseded by D383 (3-point median filtering of GPS jitter), D325 superseded by D385 (rollout scoring).
- **Design Tree Alignment (/grill-me):**
  1. *Turn Sim (D380):* "Auto" timing uses closed-loop geometry solver; manual delay and clock cue kept in UI.
  2. *Traffic Sim (Core 4):* Spawner uses authentic RCAF types (`CT-156 Harvard II`, `CT-155 Hawk`, `CT-114 Tutor`, `CF-188 Hornet`) flying manual speeds.
  3. *Turn Fight (D381):* Slice turns are descending (less than Split S); hard deck is absolute (never breach floor; recovers to level MPT if deck tight).
  4. *Debrief (D383):* Median filter applies to derived G and bank; recorded ForeFlight AHRS data stays untouched.
  5. *Build Cadence (D376):* Pause after Milestone 0 for Patrick's interactive Gate 0 checklist verification (Debrief & SOF) before opening Milestone 1 PRs.
- **Verification Baseline:** Test suite 100% green (`3,168 passed, 0 failed`).
- **Remediation Roadmap:** Living roadmap ratified in [`docs/REMEDIATION_ROADMAP.md`](../../docs/REMEDIATION_ROADMAP.md) and [`.agent/rules/dads-debrief.md`](../rules/dads-debrief.md).

## Next step
Execute **Milestone 0: Foundation, Pilot Tolerances Helper & V6 Decoupling (PR 0)**:
1. Create `tests/helpers/tolerances.js` implementing pilot domain tolerances (`±10 kt`, `±100 ft`, `±5°`, `±0.5 G`, `±2.5°/s`, `±5%`).
2. Move `tests/golden/` to `archive/tests/golden/`, and `tests/unit/wx/v6-compare.test.js` & `tests/unit/wx/v6-sof.js` to `archive/tests/wx/`. Scope `package.json` test runner to `tests/unit/` and `tests/crosscheck/`.
3. Pre-wire `app.scenarioStore: store.scope('scenarios')` in `src/app.js` and `src/shell/host.js`.
4. Add `prototype: true` to Debrief card in `src/shell/registry.js`.
5. Relax `tests/crosscheck/traffic-scenarios.test.js:99` to `assertTableWithinTolerance`.
6. Add `.agents/` to `.gitignore`.
7. Relabel Settings dialog reset buttons from "Reset to V6 defaults" to "Reset to Standard Defaults".
8. Verify `npm test` and `npm run build`.
9. Pause for Patrick's interactive **Gate 0 (Debrief & SOF)** checklist sign-off.

## Waiting on Patrick
Patrick's word to execute Milestone 0.
