# Todo: airfields

- [x] **Task 1: Catalog and distance** (S). `src/airfields/catalog.js`, `distance.js` and their tests. Done when: the 15 V6 airfields load with names, positions and valid time zones; CYMJ to CYQR, CYYN, CYXE gives 35, 82, 119 NM within 1 NM; a missing position gives `null`.
- [x] **Task 2: Alternate and landing minima** (S). `src/airfields/minima.js` and tests. Done when: each CAP GEN row, the trade-offs, "whichever is greater" per element (350 ft / ¾ SM gives 700-2), rounding (420 → 400, 421 → 500), the 3 SM cap, and "not set" = V6's 600/2 all pass.
- [x] **Task 3: The setting** (M). `src/airfields/airfields.js`, `README.md` and tests. Done when: defaults are V6's; bad ids, numbers, zones and approach types are dropped; home is never an alternate; up to 6 alternates; blocked storage works for the visit; `subscribe` fires; `checkOptions` into the real `assessAlternate` gives the spec's three example results.
- [ ] Checkpoint: `npm test` green; open PR 1 (tasks 1 to 3); code-review-and-quality, `/security-review`, `/simplify`; merge on green.
- [ ] **Task 4: The Settings panel** (M). `src/airfields/panel.js` and unit tests. Done when: default view shows only the home field, the alternates table and the minima line; More opens and closes; unknown ICAO opens its row in More; all text goes in as text.
- [ ] **Task 5: Hook-ups** (through the coordinator). Header zone and Settings mount (app-frame thread), debrief field elevation (debrief thread), `tests/e2e/airfields.spec.js`.
