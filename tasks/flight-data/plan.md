# Plan: flight-data

Spec: [`specs/SPEC-flight-data.md`](../../specs/SPEC-flight-data.md) (approved by Patrick, 2026-09-30). Owner: the "Flight data" thread. Owns `src/flight-data/`, `tests/unit/flight-data/`, `tests/fixtures/flight-data/`, `tests/golden/flight-data-*.test.js`, `tests/golden/v6-flight-data.json`, `tests/golden/checks/record-flight-data.cjs`, `specs/SPEC-flight-data.md` and `tasks/flight-data/`.

## Order

1. **Pin V6 (PR #58, phase 1).** Record V6's `parseKmlText` in Chromium, then port reading, projection and sampling with no behaviour change. Golden tests must pass exactly.
2. **Changes C1 to C9 (PR #58 or a follow-up, phase 2).** One commit each, each flipping the golden expectation it touches on purpose and adding a unit test of what it now means.
3. **Clock, debrief file and example flight (phase 3).** New code, no V6 numbers to pin beyond the clock's speeds.

## Dependencies

- `core`: `geo.js` (projection), `units.js` (0.592484, 3.28084), `time.js` (`parseIsoSeconds`), `angles.js` (`wrapPi`). The estimated-G formula moves to `core/flight-math.js` in core's Task 8; until then `flight-data` keeps V6's `estimatedGAtTrack` body pinned by its golden test, then switches to core's in one commit.
- `storage/file.js` (app frame) saves and opens the debrief file; `flight-data` only builds and checks its contents.
- The example flight's KML files need a home in `public/` (app frame owns it); asked for when the debrief screen is built.

## Checkpoints

- After phase 1: `npm test` green, the golden test matches V6 on all five real tracks and the fixtures, mutation check run.
- After phase 2: the spec's data-quality acceptance numbers hold on all five tracks.
- After phase 3: a save, reopen and compare test passes (R17).

## Risks

- Browser and Node disagree in the last digit of `cos` (D38). Parsing has no trig, so its golden check is exact; projection and sampling run V6 and the port in the same engine, so they are exact too.
- Patrick's track must never be committed; only its fingerprint is.
