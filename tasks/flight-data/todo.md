# Tasks: flight-data

Plan: [`plan.md`](plan.md). Verify every task with `npm test`.

## Phase 1: pin V6

- [ ] **Task 1: record V6's parser.** `tests/golden/checks/record-flight-data.cjs` runs V6's `parseKmlText` in Chromium on the four example tracks, Patrick's track and `tests/fixtures/flight-data/*.kml`, and writes `tests/golden/v6-flight-data.json` (a SHA-256 of every point plus sample points). Size S.
- [ ] **Task 2: `kml.js`.** `readKml(text, name)` returns V6's points exactly, plus the security limits (size, DOCTYPE, KMZ, fix count) that refuse files V6 would also have choked on. Golden test against the recording. Size M.
- [ ] **Task 3: `flight.js` port.** V6's `projectAll`, `interpTrack`, `headingAtTrack`, `aircraftPitchAtTrack` and `estimatedGAtTrack`, taking tracks as arguments. Golden tests run V6's functions in Node on the same points at seeded times. Size M.

## Phase 2: changes (one commit each)

- [ ] C1 blank recorded values are missing, not 0 (D47).
- [ ] C2 read recorded bank (D47).
- [ ] C3 drop impossible fixes (D32, 450 kt rule).
- [ ] C4 mark gaps over 5 s (D32).
- [ ] C5 every fix needs a time.
- [ ] C6 end-frame speed; interpolated lat/lon (#24).
- [ ] C7 heading unknown when stationary (#22).
- [ ] C8 refuse tracks that don't overlap; say when one was cut (#22).
- [ ] C9 all-or-nothing load (#23).

## Phase 3: new pieces

- [ ] `clock.js` (#24, R12).
- [ ] `debrief-file.js` (R17, #25), with the allowlist checks.
- [ ] `examples.js` and the README.
- [ ] Switch estimated G to `core/flight-math.js` once core's Task 8 merges.
