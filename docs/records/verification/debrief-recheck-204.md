# Debrief re-check: #204 on main 3345619 (independent, read-only)

Built 3345619 in wt-debrief, served on 4302, Chromium (swiftshader for 3D; `--disable-3d-apis --disable-gpu` for the WebGL-off case). Scripts: findings/debrief/scripts4/ (n2.mjs, n2b.mjs, n2screen.mjs, rc1.mjs, rc1d.mjs, rc3.mjs), wt-debrief/s/rc1-204.mjs. Shots: shots-4/.

## Verdicts
| Item | Verdict |
|---|---|
| N2 "bank --" where unknown (card, 3D label, CSV; recorded bank kept) | FIXED |
| RC-1 2D toolbar menus over the map at 1280/1366/1440, no sideways scroll, Formation buttons uncovered, re-placed after view/column change | FIXED |
| RC-3 3D/WebGL message by the 2D|3D switch | FIXED (Debrief) |

## N2 (whole example flight, every second, 25,152 ship-seconds, 1,038 in a GPS gap)
- Est. G unknown and not in a gap: 6,795 ship-seconds. "bank 0° est." on the card in those: 0 (before: 95 airborne, GS over 100 kt, plus the parked ones).
- Airborne (GS over 100 kt) with G unknown: 116 = 95 no bank recorded -> card "bank --" 95 of 95, 3D label "bank --, pitch ..." 95 of 95, CSV cell blank; 21 with recorded bank (#3 9 s, #4 12 s) -> card "bank 51° left recorded" etc, 3D label shows the number, CSV cell filled (21 of 21). Recorded bank kept where present: all 3,305 G-unknown seconds with a recorded bank (ground included) show it on card and in CSV; CSV blank cell for all 3,490 unknown-bank seconds, 0 non-blank.
- Card and 3D label agree on known/unknown in every non-gap ship-second (0 mismatches). "bank 0° est." still appears 1,682 times where G is known (level flight): correct, it is an estimate.
- On screen (1440x900): start+1688 #2 "G -- est., pitch 0° est., bank -- est."; 3D label "#2 bank --, pitch 0°" (/mnt/project-files/verification/shots/debrief-4/n2-3d-1688.png); start+1700 #3 "bank 37° left recorded", start+2414 #4 recorded kept.
- Logged row D226 matches; nothing contradicts spec line 118.

## RC-1 (176 checks, 0 real failures)
Sizes 1280x720, 1280x800, 1366x768, 1440x900. Every menu (2D: Layers, Routes and charts, Weather, Tools; 3D: Weather, 3D settings, Tools). Each check: menu left/right inside the map wrap, bottom above the map bottom, document scrollWidth <= viewport, no visible Formation/Flight column, playback or EM control under the menu (elementFromPoint).
- A default 2D; B 3D; C after 2D->3D->2D; D Weather open then the view switched from the keyboard both ways (menu moves 558-984 <-> 394-820 at 1280, stays inside the map); E Flight column collapsed; F both collapsed; G Flight open, Formation collapsed; H both open again; I menu open while a column is collapsed or opened from the keyboard (re-placed each time); J More detail open; K EM chart open. All pass at all four sizes. Widest cases: Tools at 1280 now 558-984 (map 296-984), was 894-1320; Weather at 1280 558-984, was 769-1195 over the Formation column.
- My first run reported 8 "Weather not open" fails in step D; that was my script clicking the radio with the mouse, which closes the menu by design (click elsewhere). Redone by keyboard (rc1d.mjs): pass at 1280, 1366, 1440.
- Console errors: 0. Debrief e2e chromium: 44 of 44 (includes the new RC-1/RC-3 tests).

## RC-3
With WebGL off, clicking 3D: "3D needs WebGL 2, which this browser doesn't have or has turned off." shows as an alert directly under the 2D|3D switch, inside the toolbar (msg box 296-984 x 128-156 at 1280, switch 296-386 x 71-120); the Flight column box stays empty; view stays 2D; console has only the Service Worker note. Second try shows the same one message (not doubled). Shot: /mnt/project-files/verification/shots/debrief-4/rc3-webgl-off-1280.png. Note (Low, by design?): the message stays after switching back to 2D until the next 3D try. Turn Sim's wiring was not in scope.

## No regression
- Four playback times vs debrief-numbers-raw.txt: identical to the #194 recheck (numbers-new.txt) except two "bank 0° est." lines at 18:31:11Z (parked #1, #2) now "bank -- est."; the only raw tokens not found are the 5 bank/G lines that changed intentionally (M2 bank, N2). Altitude, GS, IAS, lat/lon, range, aspect, HCA, closure and all six spacing lines unchanged. File: numbers-204.txt.
- `npm test`: 2,405 tests, 2,397 pass, 0 fail, 8 todo.

## New observations (Low)
- L1 (Low). Where bank is "--" the card still prints the source word: "bank -- est." (also "G -- est." was already so). Reads as an estimate of nothing. Expected: "bank --" with no source. Missing test: tests/unit/debrief/readouts.test.js: shipDetailText with bankDeg null contains "bank --" and no "est." after it. Recommendation: drop the source word when the value is "--".
- L2 (Low). The 3D "cannot start" message stays visible after the user goes back to 2D. Probably intended (it explains why 3D did not open). Recommendation: keep.

Missing tests named: none for FIXED items (e2e and unit tests exist); L1 as above.
