# Debrief re-check: #194 (verification batch 3 fixes) on main 96192a2

Checker: independent. `npm ci`, `npm run build`, vite preview on 4302, Chromium 1440x900. Nothing pushed or edited in the repo. Scripts: the auditor's `audit-debrief/m*.mjs` (pointing at wt-debrief, now 96192a2) plus `m1b/m1c/m1d/m2b-e/m3b/m4/y2/y4.mjs` (same folder), screen scripts `wt-debrief/s/rc1.mjs`, `rc2.mjs`. Shots in `shots-3/`. Numbers below are on the example flight, every second (6,289 s) unless said.

## Verdicts

| Item | Verdict | Numbers |
|---|---|---|
| M1 taxi gate | FIXED | Lead est. IAS under 80 kt for 1,845 s: 5,535 wingman readings, 0 with a standards label (2,247 say "Lead under 80 kt", 3,177 "Lead not moving", 111 "GPS gap"); 0 Lead FAST/SLOW/on-parameters verdicts. Ramp 18:31:11Z now "#2 - (Lead under 80 kt)", "Lead 10 kt est. IAS, G --" (was "TIGHT by 3,991 ft" and "SLOW"). |
| M1 Lead outside the block | FIXED | 1,281 airborne seconds below 6,000 ft: all read "not judged: below the low block" (0 verdicts); nothing above 15,500 ft on this flight. Inside 6,000 to 15,500 ft: 3,163 s, verdicts kept (SLOW 717, FAST 1,178, on parameters 985; the remaining 283 are 161 "GPS gap" and 122 "HIGH G" with a speed target). 19:44:06Z (2,790 ft) now "not judged: below the low block" (was FAST). |
| M1 % TIGHT | NOT FIXED (not attempted, needs Patrick) | Of 12,224 wingman readings with a heading, 10,435 (85.4%) still say TIGHT by about 3,900 ft (was 86%); 307 on parameters, 521 WIDE. Cause is the default SMM spread 4,000 to 6,000 ft against a crew flying close formation. #194 did not touch the default standards (correct: SPEC "ask first: changing the default standards"). Auditor's recommendation 2(c) (default "None" or a "Fighting wing" preset) is still open and no decision row exists for it. |
| M2 bank vs G | FIXED for agreement; PARTLY for flicker | Level turns (nose within 10 degrees, G 1.15 or more): 1,141 of 1,142 within 10 degrees of acos(1/G) (99.9%), 0 off by more than 20 degrees (before: 721 of 1,213 within 10, 290 off by more than 20 = 24%). Sign flips between seconds (both banks over 3 degrees) 294 to 98; mean second-to-second change 7.3 to 3.3 degrees; jumps over 30 degrees a second 511 to 193. #2 start+1676..1688: 6R,11R,5R,7L,7L,0,51R,62R,47R,34L,34L,7L,0 with G 1.00..1.87, bank and G agree. Residual: see N1. |
| M3 3D labels in gaps | FIXED | Whole 3D view run in Node (`m3b.mjs`, fake renderer, every second with a ship in a gap): 876 seconds, 1,041 ship-gap-seconds: every one draws "GPS gap", none draws a bank/pitch label or a height-stick label for the gap ship, and the other ships keep theirs (0 bad seconds). Screen at 19:00:04Z (`/mnt/project-files/verification/shots/debrief-3/03-3d-gap-t41.png`): hollow marker, "#2 GPS gap", no height; #1, #3, #4 keep "bank 46 R, pitch +2", "565 ft above datum". Was 992 of 1,041 labelled. |
| M4 G above 7 | FIXED | Any est. G above 7: 0 of 50,308 samples (max 6.749, at half-second steps); was 10 integer seconds up to 8.80. No est. G is shown with a GPS gap inside its 3 s window (0 cases). Only new "G --" cells are the 1,111 extra ship-seconds whose window touches a gap (null G 6,726 to 7,837); nothing else lost (6,660 nulls with no gap are ground/still, same as before). |

### The ten former over-7 G seconds now (start+seconds, ship, old G -> now)

| Second | Ship | Was | Now |
|---|---|---|---|
| 1698 | #1 | 8.17 | "G -- est., pitch 1 est., bank 0 est." |
| 1840 | #1 | 7.09 | "GPS gap: no numbers until the track resumes" |
| 2084 | #1 | 8.07 | G --, bank 0 |
| 2089 | #2 | 8.29 | G --, bank 0 (screen: `Alt 12,559 ft ... G -- est., pitch -1, bank 0`) |
| 2091 | #2 | 8.80 | GPS gap |
| 2415 | #4 | 7.12 | G --, bank 22 left recorded (recorded bank kept) |
| 2442 | #2 | 7.80 | GPS gap |
| 2643 | #2 | 7.07 | G --, bank 0 |
| 3660 | #2 | 8.68 | GPS gap |
| 5276 | #2 | 7.40 | GPS gap |

All ten have a gap in the 3 s window (matches the auditor's correction). None were a real manoeuvre.

## No flight-math regression

- Four playback times (18:31:11Z, 18:44:17Z, 19:19:25Z, 19:44:06Z), screen text now vs `/mnt/project-files/verification/debrief-numbers-raw.txt` (which matched V6 last time): altitude, ground speed, est. IAS, G, pitch, lat/lon, range, aspect, HCA, closure, all 6 spacing lines are identical line for line. Only three kinds of lines differ, all intended: the standards lines (M1), Lead verdict wording (M1), and bank. Bank: 18:44:17Z #1 13 to 40 degrees left (G 1.31, acos(1/G) = 40.2), #2 48 to 37 left (G 1.24, 36.2); 19:19:25Z #1 1 to 2 left; 19:44:06Z #1 4 to 5 right, #2 0 to 5 right. Screen dumps: `numbers-new.txt`. (The V6 chord bank is still in `bankFromTrack` and its golden pins are unchanged.)
- Tests: `npm test` 1,890 pass, 0 fail, 8 todo (1,898 tests; todo none in golden). Golden folder alone 237 of 237. The one golden edit in #194 is `tests/golden/flight-data-flight.test.js` SAME_G, which now expects null across a gap or above 7 G and V6's value everywhere else. Debrief e2e (chromium) 36 of 36.
- Console on the screen runs: only the Service Worker note and software-WebGL warnings; no errors.

## Model-wind items W1 to W5

No commit after #186 touches `src/modules/debrief/weather/` (git log 8e7cafb..HEAD -- src/modules/debrief shows only #194), so nothing changed: W1 NOT FIXED (`windTextAt` still prints "wind 280/38 at ... (HRDPS 18Z, Open-Meteo)": no "kt", "true" or "model"), W2 NOT FIXED (wind still inside the verdict's list item), W3 NOT FIXED (hourly step), W4 NOT FIXED (below-ground 950 hPa blend), W5 NOT FIXED (500 says "connection"). Not part of #194's brief; still open. Winds e2e still passes.

## Logged rows vs manuals and spec

Read: `decisions-for-review.md` rows D182, M1(a), M1(b), M2, M3, Y4, Y2 (Debrief).
- D182 (est. G unknown above 7 G and across gaps): consistent. The T-6 V-n symmetric limit is +7 G (formation-and-turn-numbers.md, V-n line); the example's highest sound value is 6.75. D32 supports gap windows. No contradiction.
- M1(a) (80 kt est. IAS): no manual gives an airborne speed for this; SMM 4.9 para 15 has touchdown at 80 to 90 KIAS, so 80 kt sits right at the landing speed and the labels come back for the last few seconds of a landing roll or approach only above 80. No contradiction; PILOT JUDGEMENT-lite, recommendation: keep 80 kt (Y4 latch not needed: 0 seconds on the example where Lead is under 80 kt est. IAS, moving over 40 kt GS and above 2,400 ft).
- M1(b) (blocks): the numbers match the Harvard blocks (Low 6,000 to 10,000 ft, Mid 10,500 to 15,500 ft, Gen Book p.12; formation-and-turn-numbers.md). One wording mismatch: the log row says Lead is judged only inside the Low and Mid blocks; the code and spec line 136 judge continuously 6,000 to 15,500 ft, so 10,000 to 10,500 ft (between the blocks) is judged against the nearest target (core's split at 10,250 ft). Spec is right and consistent with V6; log wording should say "6,000 to 15,500 ft". Above 15,500 ft the Hi block (16,000 to 19,000 ft, IF) also has no Lead speed, so "not judged" is right.
- M2 (bank window = G window): spec line 116 matches; recorded bank first (D47) still holds (recorded kept in 21 gap-window seconds). Consistent.
- Y2 (no bank where G is unknown): consistent with D32, but see N2.
- M3 rows: consistent with D32 and spec line 94.
- Nothing contradicts the SMM, manuals or spec. Default standards unchanged.

## New findings (all Low, both inherited or newly visible)

- **N1 (Low). One-second G/bank dropouts inside a sustained turn.** 21 isolated seconds (before: 25) where est. G drops below 1.12 between neighbours above 1.35, and bank flips to the other wing. Example: #1 at start+1522: bank 51, then -14 at 1.03 G, then 51 (G 1.61, 1.03, 1.60); #2 at 1536 (43, -13, 47). Same in V6's estimator (25 before #194), not a #194 regression; the 3D aircraft still rocks for one second, 98 flips remain (66 of them both sides 10 degrees or more). Expected: a steady turn reads steady. Known/planned: no. Missing test: `tests/unit/flight-data/flight.test.js`: on the example flight, no second where est. G is below 1.12 with both neighbours above 1.35 (or median-of-three on G and bank); needs a decision because it changes a V6-pinned number.
- **N2 (Low). Bank reads "0 degrees est." where the card says G is unknown.** 95 airborne ship-seconds (GS over 100 kt, not itself in a gap) show "G -- est., pitch 0 est., bank 0 est." and the 3D label "bank 0, pitch 0" (e.g. start+1688 #2, 1698 #1, 1712 #1) although the bank was not estimated, only set level (logged row Y2). It reads as a measurement. Expected: "bank --" on the card (wings can stay level in 3D). Missing test: `tests/unit/debrief/readouts.test.js`: when est. G is null and bank is not recorded, `shipDetailText` says "bank --". Recommendation: show "--" on the card and the 3D label.
- **N3 (note). Wingman labels are gated by Lead's speed only, not by block.** Below 6,000 ft (1,281 s, the circuit) wingman TIGHT/AFT/FORE labels still print against the line-abreast spread. Consistent with the log (M1(b) applies to Lead's speed) but the same "standard applied where it does not fit" as % TIGHT. Recommendation: fold into the open default-standards decision.

## Pilot judgement (with recommendation)

- PJ (M1 % TIGHT): should close formation read TIGHT against the 4,000 to 6,000 ft spread? Recommendation: default the spread judge to off unless the crew picks line abreast, keep the SMM preset one click away (the auditor's 2(c)); Patrick to confirm because it changes a default standard.

## Missing tests named, by finding

| Finding | Test that should have caught it |
|---|---|
| M1 % TIGHT | `tests/unit/debrief/readouts.test.js`: default standards on the example, close-formation seconds (wingman under 1,000 ft) are not labelled TIGHT (after the decision). |
| N1 | `tests/unit/flight-data/flight.test.js`: no isolated 1-second G dip inside a steady turn. |
| N2 | `tests/unit/debrief/readouts.test.js`: `shipDetailText` gives "bank --" when G is null and bank not recorded. |
| W1-W5 | as in `recheck-182-186.md` (`tests/unit/debrief/weather-winds.test.js`, winds e2e). |
| Log wording (M1(b)) | none needed; edit the row. |
