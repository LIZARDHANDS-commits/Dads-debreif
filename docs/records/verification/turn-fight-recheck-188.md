# Turn Fight recheck after #188 (main 96192a2)

Build: npm ci, npm run build, vite preview on 4306. Scripts in scratchpad/tf/ (rc.mjs, rc2.mjs, rc3.mjs, geo3.mjs). Shots in /mnt/project-files/verification/shots/turn-fight-2/.

## Hookup checks (all PASS)
- Home card "Turn Fight" (eyebrow BFM) opens the module; card shows PROTOTYPE badge (01-home.png, 02-opened-1440.png).
- Deep link #/turn-fight in a fresh page mounts the module, title "Turn Fight". Back returns to home, forward returns to Turn Fight (also back-forward-back).
- __ooda.stats() after 5 to 6 full cycles through all five modules and Turn Fight (Space pressed once while playing): home always listeners 3, subscriptions 1, frames 0, timers 2; Turn Fight always listeners 1, subscriptions 0, frames 0, timers 2. No growth.
- Console: no errors from Turn Fight. The only error seen was ERR_CERT_AUTHORITY_INVALID / ERR_ABORTED for api.met.no (SOF weather fetch, sandbox proxy), not Turn Fight.
- axe (default rules): 0 violations at 1440x900 and 1366x768.
- Overlap scan (23 controls): none at 1440x900 or 1366x768; no sideways scroll; page scrolls 52 px vertically at both (app frame, known).
- Full e2e suite (throwaway config, port 4306, reuseExistingServer false): 192 passed, 0 failed (3.8 min). Includes 20 turn-fight.spec tests, visual, buttons, layout at 1366 and 1920.

## Geometry (node sim.js vs closed form, unchanged from earlier report)
| Setup | Merge | First nose-on after merge | Earlier |
|---|---|---|---|
| 2-circle 220/220 | T+16.36 | Red +18.24 (closed form 18.20) | +18.2 |
| 1-circle 220/220 | T+16.36 | Red +9.12 (9.10) | +9.1 |
| 2-circle B250/R200 | T+16.00 | Red +14.42 (14.40) | +14.4 |
| 1-circle B250/R200 | T+16.00 | Red +7.42 (7.41) | +7.4 |
Rates 19.2/19.2 and 16.9/21.2 deg/s, radii 1,106/1,106 and 1,429/914 ft: same. No regression. Diff of src/modules/turn-fight since the earlier build (f35aaad) is a type comment in sim.js and a destructuring change in view.js only.

## Status of earlier findings
- TF-1 "Sustained G" label: NOT fixed. layout.js:37 still `label: 'Sustained G'`; on screen for both aircraft (04-climb-dive.png).
- TF-2 first nose-on wording: unchanged on purpose. Row reads "Red at +18.2 s" beside T+36.6. D187 (logged 10:17) keeps it as the approved spec wording. Closed as a decision, not a defect.
- TF-3 chase hint: NOT fixed (no change to layout.js text).
- TF-4 label collisions: NOT fixed. R letter still sits on the MERGE mark/trail just after the merge (05-just-after-merge.png).
- TF-5 "Speed (KTAS)" wrap: NOT fixed. With Climb and dive on the label wraps to two lines (label box 39 px, 04-climb-dive.png). Stopped banner shift not re-flown (no code change touches it).
- D175 note: spec line 354 (SPEC-turn-fight.md) says the note beside the >15,000 ft start altitude is about the turn rate reading low (core check, 28 % at 20,000 ft); it does NOT mention SMM 14.5 para 10 (aerobatics below 16,000 ft MSL). Energy mode is not on main, so nothing to see on screen. Recommendation (owner acts without waiting): add "SMM 14.5 para 10 recommends aerobatics below 16,000 ft MSL" to that one note, per the audit (one note, not two).

## Missing tests (still)
- tests/unit/turn-fight/layout.test.js: control labels equal the spec's list (TF-1).
- tests/e2e/turn-fight.spec.js: assert Speed label is one line with Climb and dive on at 1440x900 (TF-5); assert the R/B letters keep clear of the MERGE label (TF-4).
- tests/unit/turn-fight/energy-inputs.test.js (with task 10): altitude above 15,000 ft gives a note that cites SMM 14.5 para 10.
