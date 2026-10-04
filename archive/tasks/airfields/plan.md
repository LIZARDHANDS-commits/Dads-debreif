# Plan: airfields (home field and alternates)

Spec: `specs/SPEC-airfields.md` (approved by Patrick 2026-09-30). Owner: the "Airfields: home field and alternates" thread. Owns `src/airfields/`, `tests/unit/airfields/`, `specs/SPEC-airfields.md`, `tasks/airfields/`. Anything else goes through the coordinator.

## Order (bottom-up, each slice working and committed)

1. **Catalog and distance.** V6's 15 airfields (sof.html line 563) with time zones, CYMJ's elevation; `greatCircleNm`. No dependencies.
2. **Minima.** `alternateMinima`, `landingMinima`, `roundCeilingFt`: the CAP GEN table, trade-offs, "whichever is greater", rounding, the 3 SM cap. Pure, test-first. Highest risk (a weather rule), so it goes early.
3. **The setting.** `createAirfields`: defaults, checking what's read back, `update`, `subscribe`, `stations`, `checkOptions`. Tested straight into `wx`'s real `assessAlternate`.
4. **The panel.** `panel.js`, the Settings section (R22), built with the ui-kit.
5. **Hook-ups through other threads** (coordinator): the shell's header zone and the Settings dialog mount (app-frame); the debrief's field elevation; `tests/e2e/airfields.spec.js`.

Checkpoint after 3: `npm test` green, `checkOptions` output accepted by `assessAlternate`. PR 1 carries tasks 1 to 3; PR 2 carries task 4.

## Risks

- Minima logic is a weather rule: every case cites its CAP GEN line, and nothing changes the "not set" fallback (V6's 600/2).
- The panel is mounted by the shell, which this thread doesn't own; it exports a function and the app-frame thread mounts it.

## Skills

spec-driven-development (done), planning-and-task-breakdown (this file), incremental-implementation and test-driven-development (tasks 1 to 3), frontend-ui-engineering and security-and-hardening (task 4 and the setting's input checks), code-review-and-quality and code-simplification before each PR leaves draft.
