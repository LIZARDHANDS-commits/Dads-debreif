# Debrief re-check: PR #224 (1a8185c), saved radar and lightning in the debrief file (12f) and the #213 fixes W1, W2, W5 (independent, read-only)

Built 1a8185c in wt-debrief (npm ci, npm run build), served on 4302; Chromium via Playwright at 1280x720, 1366x768, 1440x900. Live site https://lizardhands-commits.github.io/Dads-debreif/#/debrief also checked (its `app-version` meta reads "2026-09-30 1a8185c", so #224 is deployed; an earlier curl of the page returned 7d5c981, a cached copy). A pre-#224 build (adf165c, the parent) was served on 4303 to make "old" files. Scripts: wt-debrief/s/224/*.mjs (t1..t27, lib.mjs, png.mjs, mem.mjs). Shots: /mnt/project-files/verification/shots/debrief-224/.

Sandbox and hosts. From this sandbox, by curl through the proxy: Open-Meteo (historical-forecast-api) reachable, ECCC GeoMet (geo.weather.gc.ca: GetCapabilities and GetMap for RADAR_1KM_RRAI, RADAR_1KM_RSNO, Lightning_2.5km_Density) reachable and returning real pictures, RainViewer (api.rainviewer.com) reachable, github.io reachable. Chromium cannot use the proxy, so, as in the #213 run, every external request the page made was fetched by curl at the moment the page asked and handed to the page byte for byte (real replies, different transport); everything else external was aborted, which also serves as the "offline" state. ECCC facts checked with curl: plain GET answered 200 image/png with `access-control-allow-origin: *`; OPTIONS and HEAD answer 500 (so "plain GET, no preflight" in the spec is right); a frame ECCC does not have answers 200 text/xml (a ServiceException), as the spec says. Real frame sizes (see F7).

Real-data test flight. The four example KMLs were shifted in time so the flight ran 12:35:41Z to 14:20:29Z on 30 Sep (ended 20 minutes before I loaded it, so ECCC still had every frame: radar 11:36Z to 14:36Z every 6 min, lightning 11:30Z to 14:30Z every 10 min).

## Verdict
| Item | Verdict |
|---|---|
| W1 (status says "no wind" while arrows drawn) | PASS |
| W2 (height off the 500 ft step accepted silently) | PASS |
| W5 (checkbox paired with the wrong control) | PASS |
| W3 (failure shown only in the open menu) | per spec, unchanged, noted |
| W4 (labels over the 3/9 line) | logged as kept, unchanged, noted |
| 2. Save and reload round trip | PASS (bytes, times, positions, boxes and the drawn map identical; offline open makes 0 requests; an older file opens) |
| 3. Size limits | limits are exact and thinning says so; 6 Low wording or silence findings (F2 to F7); nothing is lost except as in F4b |
| 4. Security | PASS: 36 hostile blocks and a hostile text-field file; no code ran, the page never broke; PNG only. 3 Low silent-drop notes (F4) |
| 5. Regressions | unit 2,981 tests, 2,973 pass, 0 fail, 8 todo; e2e (debrief + a11y + layout, chromium) 96 of 96; axe 0 violations in 18 states; one layout regression (F1) |

Counts: High 0, Medium 1 (F1), Low 8 (F2 to F9). No PILOT JUDGEMENT items (nothing here needs a flying call).

## 1. W1, W2, W5

W1 PASS. `arrowStatus` with some points empty, in the app with the live 9-point fixture (open-meteo-9pt-live.json) edited three ways, example flight at 18:49Z, 8,000 ft:
- list of 4 replies: 4 arrows drawn, status "no HRDPS wind for this time at 5 of 9 points" (was "no HRDPS wind for this time")
- 9 replies, every second point all null: 5 drawn, "no HRDPS wind for this time at 4 of 9 points"
- one object: 1 drawn, "no HRDPS wind for this time at 8 of 9 points"
- full reply: "9 of 9 points have model wind" (unchanged)
Direct calls: `[wind, time, time]` gives "no HRDPS wind for this time at 2 of 3 points"; `[wind, below, time]` (mixed reasons, some drawn) gives "1 of 3 points have model wind"; all missing for one reason keeps "here" wording. Shots 20-w1-*.png. Wording note: it counts the missing points ("at 5 of 9 points") rather than the points that have wind, but it no longer contradicts the map.

W2 PASS. Typed 8250 gives box 8500 and caption "8,500 ft"; 9999 gives 10000 / "10,000 ft"; 8249 gives 8000; 12345 gives 12500; 29999 gives 30000; 2200 gives 2000 (no arrows, status "no model wind at 2,000 ft here (below the model's lowest level)"). 35000 and 1000 still show "Enter a number from 2,000 to 30,000 ft." with the box keeping what was typed and the caption keeping the last valid height. Typing 31234 one key at a time keeps the box at 31234 with the message (the box is not overwritten with a part of it); the map stays at the last height that was valid on the way (3,000 ft from "3123"), as in #213. ArrowUp steps 8000 to 8500 to 9000. One Open-Meteo request through all of it. The value is remembered after a reload. Shot 21-w2-typed-8250.png.

W5 PASS. In the Weather menu "Wind arrows (model)" (checkbox) and "Wind arrow height" (box, "ft") are now on one row, the status line under them (shot 20-w1-four_of_nine.png at 1440, 22-weather-menu-offer-1366.png at 1366).

W3 (per spec): unchanged; a failed request shows only in the open Weather menu. W4 (labels over the 3/9 line): logged as kept; unchanged, still visible in shot 20-w1-full.png.

## 2. Save and reload round trip (the coordinator's ask)

Flow (t3.mjs, real ECCC data): load the four shifted tracks, Weather, "Save radar and lightning with this debrief", 50 frames in 18.7 s (19 rain, 19 snow, 12 lightning, 12:30Z to 14:20Z, 3 requests at a time), tick Radar and Lightning, scrub to three times, screenshot the map canvas each time, Save debrief, reload the page (same browser profile), Open debrief, scrub to the same three times, screenshot again.
- Stored data against what ECCC sent: all 50 frames are byte-for-byte the same base64 as the reply bodies the page received (0 different, 0 missing, 0 extra). Layers, times (whole seconds, exact WMS times), order (layer, then time ascending) as specified. The stored box {49.32, 50.98, -106.85, -104.57} is exactly the bbox the requests used (asked as lat,lon order 49.32,-106.85,50.98,-104.57, the right order for WMS 1.3.0 EPSG:4326). Block: `{v:1, box, fetchedT, thin:1, frames}`, file `settings.savedWeather` (one string). File 11,392,073 bytes (tracks about 11.2 MB, radar about 0.15 MB).
- Rendered map, three times (13:00Z, 13:30Z, 14:12Z): the canvas PNG bytes before save and after reopening are identical (0 pixels different), and the line under the map is identical ("Radar 13:24Z, 2 min before · Lightning 13:20Z, 6 min before · Data Source: Environment and Climate Change Canada" and the other two). The scrubber comes back at the saved time. Real radar over Moose Jaw had only 500 to 850 visible pixels a frame that day, so the same test was repeated with synthetic frames that cover the map (t4.mjs; shots 06, 07): also 3 of 3 identical, the map differs with the layers off, 50 of 50 frames byte-identical.
- Offline: after the reload and open, 0 requests to ECCC and 0 external requests of any kind (also while scrubbing the whole flight); every external host was aborted in this run. Same on the live site (t20.mjs, deployed 1a8185c): 50 of 50 frames byte-identical to ECCC's replies, reopened map identical, 0 ECCC requests after open.
- Placement (t17.mjs): a synthetic frame with a cross through the track's fix at the scrubber start drew its cross at the ship's position to within about 1 radar pixel (about 1 km: 3.5 px and 6 px off at about 5 screen px per km, inside the quantisation of a 1 km picture). Shot 26-georeference-marker.png.
- Saving an opened file again: the block comes out string-equal to the one read (t12.mjs); closing asks nothing. Only an out-of-window frame is lost on the way (F4b).
- Older file: a file saved by the pre-#224 build (adf165c, four tracks, a DFP; no `savedWeather`) opens in 1a8185c with the same status text, the scrubber at the saved time, the offer button shown (flight under 3 h old), Radar and Lightning saying "not saved yet: use Save radar and lightning with this debrief in the Weather menu.", 0 requests (shot 09). The reverse also works: the pre-#224 build opens the new file (it drops the unknown setting) without a message (shot 08). A flight older than 3 h (the example) says "Not kept: radar is only available for 3 hours after the flight." and fetches nothing.
- Fetch failures (t22.mjs): offline "ECCC couldn't be reached. Check the connection and try again."; half the pictures answered with the XML error: "Kept ... 25 radar and lightning pictures ... 25 pictures couldn't be fetched."; Cancel mid-fetch (at 12 of 50) returns to the offer, and 0 further requests after it. Closing the flight with unsaved fetched frames asks first (confirm text "The radar and lightning you saved aren't in a saved debrief file yet, and ECCC can't give them again after 3 hours."), and closing the tab raises the browser's own beforeunload question (t24.mjs).

## 3. Size limit

Where it is. specs/SPEC-debrief.md (Saved radar and lightning, "Size limit", "Reading a file is untrusted", "Writing the file"), D275 and src/modules/debrief/weather/saved-radar.js `LIMITS`: 25 MiB of image bytes in all, 1.5 MiB a frame, 100 frames a layer, 36 MiB of block text (`MAX_SAVED_CHARS`), boxes at most 30 degrees, pictures at most 1,024 by 1,024. The file as a whole: flight-data `MAX_DEBRIEF_BYTES` = 4 x 30 MiB x 1.25 + 2 MiB = 152 MiB (159,383,552 bytes), unchanged by #224. The spec asks the app frame to add 37 MiB to it (F6); that has not been done.

Boundaries pushed (fetch side, synthetic ECCC with exact-size PNGs, 50 frames, t7.mjs):
| Case | Result |
|---|---|
| 50 x 524,000 = 26,200,000 B (under 26,214,400) | all 50 kept, thin 1, file 46,177,957 B |
| 50 x 524,288 = 26,214,400 B (at) | all 50 kept, thin 1, file 46,197,156 B |
| 50 x 524,289 = 26,214,450 B (over by 50 B) | thinned: 27 kept (10 rain, 10 snow, 7 lightning), thin 2, first and last frame of every layer kept, line "Every 20 min kept to fit the size limit." (shot 12) |
| one frame 1,572,864 B (1.5 MiB) | accepted (50 frames of it thin to 16 kept, 25,165,824 B, "Every 40 min kept ...") |
| one frame 1,572,865 B | rejected as not a picture; all 50 of that size: "Couldn't save radar and lightning: ECCC had no pictures for this flight any more." (F2, shot 14) |

Reader side, hand-made files (t11.mjs), block text and bytes exact:
| Case | Result |
|---|---|
| image bytes exactly 26,214,400 | opens, 50 pictures |
| image bytes 26,214,401 | block left out, line "The radar and lightning saved in this file couldn't be read (the pictures are too big), so they were left out. The rest of the debrief is as saved." |
| one frame 1.5 MiB / +1 byte | opens / left out with "(a picture is too big)" |
| block text 37,748,736 chars (36 MiB) | opens |
| block text 37,748,737 chars | left out with NO line (F4a) |
| 100 frames a layer / 101 | 101 gives "(it holds too many pictures)" |

Whole file (t8.mjs, four tracks padded with an XML comment to 30.7 to 31.4 million characters each, the tool's own maximum; 25 MiB radar, block 34.96 million characters):
- File without radar 124,426,982 B. With the radar, the app wrote 159,383,465 B (152 MiB minus 87 B) and 159,383,551 B (minus 1 B): both saved with the radar. One byte over (159,383,553): saved without the radar, message "This debrief file would be over the size this tool opens (152 MB), so it was saved without the radar and lightning. They stay here until you close the flight." and the radar stays in memory (closing still asks). So nothing is silently dropped there.
- Opening: a file of exactly 159,383,552 B opens (radar and all, 2.0 s); 159,383,553 B is refused with '"big-over.json" is too big to be a debrief file. Nothing was changed.' (shot 17).
- Read wording of the write-side line: "(152 MB)" is 152 MiB; fine.
- Context. V6's single HTML is about 119 MB of app and pictures. A debrief file is only tracks and this block: the four example tracks are 11.2 MB (2.4 to 3.1 MB each), with a real radar set 11.4 MB; with the tool's full 25 MiB of radar 46 MB; the largest file that is written and read is 152 MiB, 1.3 times V6's file. Real ECCC pictures (measured with curl, 14:30Z): a 1,024 x 1,024 rain frame 62,482 B, snow 76,608 B, lightning 4,144 B (F7: the spec says 20 to 30 kB); this flight's 163 x 185 box gave 110,593 B for all 50.
- Memory while loading (t9.mjs; page process tree RSS with the harness's own start at about 510 to 520 MB, and JS heap):
| File | Open time | RSS after (peak) | JS heap |
|---|---|---|---|
| 11 MB tracks + 25 MiB radar (46 MB) | 1.1 s | 791 MB | 149 MB |
| 124 MB tracks, no radar | 1.9 s | 921 MB | 191 MB |
| 152 MiB (124 MB tracks + 35 MB radar block) | 2.0 to 2.5 s | 881 (peak 992 to 1,044) MB | 159 to 273 MB |
So the radar adds about 30 to 80 MB of heap and 60 to 120 MB of RSS to a load; scrubbing through the flight adds about 40 MB (8 decoded pictures are kept, `IMAGES_KEPT`). Fine on a laptop; a phone with a 152 MiB file would be tight (not run).
- Saving a 152 MiB file took 2.7 to 3.0 s and the browser's memory rose about 150 to 230 MB during the save.

## 4. Security (hostile or hand-edited files)

36 hostile variants of the block (plus an unchanged baseline) made from a real saved file (t6.mjs), each opened after a page reload: all opened the flight, the page kept working, no dialog, no `window.__pwned`, no element with an `onerror` or `onload`, no inline script, 0 page errors, 0 external requests. The result line on screen, per variant:
- Script/markup in `layer`, `mime`, `fetchedT`, `thin`, extra fields (`onload`, `src`, an https address, `evil`): layer and mime are refused with the fixed sentences ("a picture is for a layer this tool does not know", "a picture is not a PNG"); unknown fields and a script in `fetchedT`/`thin` are dropped and the rest opens; nothing from the file is written into the page as HTML (the messages are fixed text).
- Bad image data: SVG with `image/svg+xml` refused ("a picture is not a PNG"); an SVG body under `image/png` refused ("not the kind it says"); `image/jpeg` refused; a `data:image/png;base64,` prefix inside `data` refused ("damaged"); base64 with `<>!!` refused; a header claiming 60000 x 60000, 0 x 0 or 1025 x 10 refused ("too large") before anything decodes; a frame over 1.5 MiB refused; a corrupt or truncated PNG that claims a legal size is accepted (F3c).
- Bad timestamps: 0.5 s off (fraction), "abc", null: whole block left out with "a picture's time is not a whole number of seconds"; 1e20 and -5: that frame is left out, the rest opens (F4b); all frames outside the flight: left out with "none of its pictures fall inside the flight"; the same layer and time twice: "a picture is in twice".
- Huge arrays: 301 frames, 101 in one layer: "too many pictures"; one million frames (an 86 MB file that flight-data accepts as a file): opened in 1.0 s, block silently dropped (F4a).
- Box: a null, reversed or 30-degree-plus box refused ("its area is wrong"); a small box in the wrong place is accepted and the picture is stretched over it (harmless: it only misplaces a picture the file's own writer would have placed).
- `__proto__` keys in the block and in a frame: no pollution (`({}).polluted` is undefined).
- Text fields elsewhere in the file (a DFP label and note, a track name, an unknown setting, a `__proto__` key), each holding `<img onerror>` and `<script>`: shown as plain text, nothing executed (t18.mjs; shot 18).
- Restriction to safe image types: `ALLOWED_MIMES = ['image/png']`, checked three times (reader, writer read-back, `imageAddress` before the `data:` address), and the picture must open with the PNG signature and an IHDR; the map also refuses an image that decodes larger than 1,024 px (`saved-weather.js` `onload`). No SVG, JPEG or WebP is accepted.
- The page has no Content-Security-Policy today. If one is added, saved pictures need `img-src data:` and the fetch needs `connect-src https://geo.weather.gc.ca` (as well as the Open-Meteo host noted in #213).

## 5. Regressions

- Wind arrows (#213): with the live 9-point reply, 9 arrows at 8,000 ft, caption "Model wind at 8,000 ft (HRDPS 18–19Z, Open-Meteo)", "9 of 9 points have model wind", one request; the tests at debrief.spec.js for the arrows pass.
- "--" wording: More detail at start+900 s reads "G --, pitch 0° est., bank --" and "Lead 0 kt est. IAS, G --"; 0 occurrences of "-- est" or "-- recorded" on the page (shot 30).
- 2D/3D switch (swiftshader) at 1280x720, 1366x768, 1440x900: 3D on and back to 2D work; the 3D Weather, 3D settings and Tools menus open; 0 console errors.
- Menus: Layers, Routes and charts, Tools unchanged (455-881, 558/566/644/718 to 984/992/1070/1144, bottom 179 to 456 or 326). Weather changed, see F1. No sideways scroll at any size.
- Axe (WCAG 2 A and AA, t21.mjs) at 1280, 1366, 1440 in recent-flight states: menus closed, Weather open with the offer, Weather open while fetching (Cancel), Weather open with the kept line, map with the radar note: 0 violations in all 18 runs (only the usual color-contrast "incomplete" for the canvas). The live status region carries only the start, about every 25 %, and the result.
- `npm test`: 2,981 tests, 2,973 pass, 0 fail, 0 cancelled, 8 todo (the #213 run had 2,692).
- E2E (`PW_PORT=4302 npx playwright test tests/e2e/debrief.spec.js tests/e2e/a11y.spec.js tests/e2e/layout.spec.js --project=chromium`): 96 passed, 0 failed (includes the eight saved-radar tests at debrief.spec.js:1621 to 1996). A vite preview that another checker killed mid-run was restarted; no result here depends on it.

## Findings

### F1 (Medium). The Weather menu is now too tall at 1280x720 and 1366x768 and the line under the map covers its last rows
- Where: 2D map, Weather menu (Radar, Lightning and the offer added by #224) and the line under the map (`.map-credit`).
- Steps: 1280x720. Load the four tracks (or any flight under 3 h old), open Weather, tick Satellite, Radar, Lightning and Wind arrows. (Old-flight variant: Example flight, tick METAR, Satellite, Radar, Lightning, Winds aloft and Wind arrows.) Measure the menu and the line. Also 1366x768 with the offer showing plus Satellite, Radar, Lightning, Wind arrows.
- Expected: menus end above the map's bottom and the last rows can be reached and read (SPEC-debrief menu rule, tasks/debrief/todo.md 9a: "Menus now end above the map's bottom edge and scroll, so no menu covers the playback bar"; the #213 check had the Weather menu ending at 528 of 615 at 1280x720 with nothing under it, and layout.spec.js's "no overlapping or cut-off controls" rule).
- Actual: Weather content is 555 to 578 px tall with the offer (493 px with nothing ticked on an old flight; #213: about 415). At 1280x720 the menu's box is 488 px, so it scrolls inside (even the plain old-flight menu scrolls by 5 px: 493 of 488). With the offer and items on, the line under the map, now two lines (33 px) with "Radar not saved yet ... · Lightning not saved yet ...", sits over the menu's bottom rows: at 1280x720 the menu bottom is 607 and the line's top 581 (shot 22-weather-menu-offer-1280.png, "Wind arrow height" faded under the line); old flight, all on: menu bottom 572, line top 542 (25-oldflight-allon-1280.png). At 1366x768 with the offer: menu bottom 697 against a line top of about 679, so the wind status "no HRDPS wind for this time" is half covered (22-weather-menu-offer-1366.png). At 1440x900 (bottom 612 to 697, line at about 811) there is no overlap. The 3D Weather menu at 1280x720 also scrolls (bottom 607).
- Screenshots: /mnt/project-files/verification/shots/debrief-224/22-weather-menu-offer-1280.png, 22-weather-menu-offer-1366.png, 25-oldflight-allon-1280.png, 24-map-note-1280.png.
- Known/planned: no.
- Missing test: tests/e2e/layout.spec.js (or debrief.spec.js): at 1280x720 and 1366x768 with a flight under 3 h old (page.clock) and every Weather item ticked, the Weather menu's bottom edge is above `.map-credit`'s top and the menu has no inner scroll for its default rows (the existing overlap scan does not open Weather with the offer).
- Recommendation: shorten the two "not saved yet" sentences on the map line to one ("Radar and lightning not saved yet: see Weather") and put the offer under Radar and Lightning in the same row block, or let the menu grow only when the offer is showing; at minimum stop the line from being drawn over an open menu (menu above the line in z-order).

### F2 (Low). Frames that fail for a reason other than "gone" say "ECCC had no pictures for this flight any more."
- Where: Weather menu status after "Save radar and lightning ...".
- Steps: make every picture reply an HTTP 500, or a picture over 1.5 MiB, or a 200 with XML (t22.mjs, t7.mjs 1572865).
- Expected: SPEC-debrief Saved radar "Which frames": a frame that fails is counted ("2 pictures couldn't be fetched."), "with none at all, or no connection, nothing is kept and the line says why". Why should be the real reason (an error, a picture too large) and the connection case is already worded separately.
- Actual: HTTP 500 for all 50: "Couldn't save radar and lightning: ECCC had no pictures for this flight any more." Same for all-too-large and all-XML. Offline is worded correctly ("ECCC couldn't be reached").
- Screenshot: 29-fetch-http500.png, 14-frame-over.png.
- Known/planned: no.
- Missing test: tests/unit/debrief/weather-saved-radar-feed.test.js: every GetMap answers 500 (expect a line that says ECCC gave an error, not "no pictures"), and every GetMap over 1.5 MiB (expect "pictures too large").

### F3 (Low). After Save debrief the menu still says "Save the debrief to put them in the file."
- Where: Weather menu status line.
- Steps: fetch, Save debrief (the file has the radar), open Weather.
- Expected: once the frames are in a saved file the sentence no longer applies (the spec drops it only "when they came from a file", but the app already tracks `weatherWritten`, which is what stops Close flight from asking).
- Actual: "Kept with this debrief: 50 radar and lightning pictures, 12:30Z to 14:20Z. Save the debrief to put them in the file." stays after the save, and also in the screen reader's live text. A user can think the file is without radar and save again or worry.
- Screenshot: 32-stale-save-line-after-save.png.
- Known/planned: no.
- Missing test: tests/e2e/debrief.spec.js saved-radar round trip test: after Save debrief, `#debrief-saved-wx-status` does not contain "Save the debrief".

### F4 (Low). Three ways a file's radar is left out or changed with no line
- Where: opening a debrief file, and saving it again.
- (a) Block over 36 MiB of text, or a `savedWeather` that is not text: flight-data's `checkSettings` drops the setting before the debrief's reader sees it, so none of the "left out with a line" wording appears (h-huge_array_1M.json, 86 MB, and a block of 37,748,737 chars). Expected: SPEC "a bad one leaves the rest of the debrief opening, with a line saying the saved radar was left out". Actual: the debrief opens, Radar says "not saved yet: use Save radar ..." (a false offer for an old flight it is not).
- (b) Frames whose time is outside the flight's window are dropped one by one with no line: `savedFromSetting` returns a `dropped` count that index.js ignores. Steps: one frame t = 1000 (or -5, or 1e20) in an otherwise good block: opens with "Kept ... 49 ...pictures". Saving the debrief again then writes 49 frames, so the file loses the frame for good. Expected: "nothing is silently dropped ... without saying so" (coordinator's ask); spec only says such a frame is "left out rather than failing the block".
- (c) A picture that passes the header checks but does not decode is never drawn, and the line still claims it: with header-valid garbage bodies (t27.mjs) the map line says "Radar 13:24Z, 2 min before · Data Source: Environment and Climate Change Canada" over an empty map. `createSavedWeatherLayer` records `failed` but nothing shows it.
- Screenshots: 31-undecodable-frames-line.png (c); (a) and (b) are text-only (run output in t6.mjs, t11.mjs, t12.mjs).
- Known/planned: no.
- Missing tests: tests/unit/debrief/debrief-session.test.js or an e2e in debrief.spec.js: open a file whose savedWeather is 36 MiB + 1 chars and expect the "left out" line (needs flight-data to report the dropped setting, or the debrief to read the raw string); tests/unit/debrief/weather-saved-radar.test.js `savedFromSetting` with one frame outside the window and index.js showing the count; tests/unit/debrief/weather-saved-layer.test.js: an image that fires onerror makes the map line say "picture couldn't be drawn".
- Recommendation: (a) rare, log it and ask the app frame to report a dropped over-long setting; (b) add "N pictures outside the flight were left out." to the notice and keep them in the file on re-save if that is easy; (c) add the words "not drawn" to the line when `state().failed > 0`.

### F5 (Low, cosmetic). The thinning line names the widest gap of any layer
- Where: Weather menu after a thinned fetch.
- Steps: 50 frames of 524,289 B (t7.mjs).
- Expected: the spec's own example is "every 12 min kept to fit the size limit" (radar's 6 min times 2).
- Actual: "Every 20 min kept to fit the size limit." (`maxGapS` is the widest gap, lightning's 10 min times 2); radar is at 12 min. At thin 4: "Every 40 min" while radar is at 24. True for the lightning layer only.
- Screenshot: 12-size-over.png.
- Known/planned: no.
- Missing test: tests/unit/debrief/weather-saved-radar-feed.test.js: thinned to every 2nd frame reads for radar 12 min (or "radar every 12 min, lightning every 20 min").

### F6 (Low, spec follow-up, not built). MAX_DEBRIEF_BYTES was not raised, so a full radar set can be refused next to four large tracks
- Where: flight-data `MAX_DEBRIEF_BYTES` (152 MiB), SPEC-debrief "Writing the file".
- Steps: four tracks near the tool's own 30 MiB each plus a 25 MiB radar set (t8.mjs).
- Expected: the spec asks the app frame to add 37 MiB so that "a full set fits beside four full tracks".
- Actual: not done (src/flight-data/ is not in the PR). With four tracks at 31 million characters each (124,426,982 B) the file is refused from 159,383,553 B; a save that would exceed is made without the radar with the words above, which is the specified fallback. Real tracks are 2.4 to 3.1 MB so this is unreachable in practice.
- Known/planned: yes, in the spec as a request to the app frame; not yet logged as done.
- Missing test: tests/unit/debrief/debrief-session.test.js has the `buildDebriefFile` limit case; nothing pins that the two limits fit together (a test that 4 x MAX_FILE_BYTES x 1.25 + MAX_SAVED_CHARS <= MAX_DEBRIEF_BYTES) so the day flight-data is raised the debrief's 36 MiB is checked against it.

### F7 (Low). The spec's picture sizes are 2 to 3 times too small
- Where: SPEC-debrief "Size limit" ("a real 1,024 pixel radar frame is 20 to 30 kB, lightning 4 kB, so an hour and a half comes to about half a megabyte"), D275 and tasks/debrief/todo.md 12f.
- Actual (curl, ECCC, 14:30Z, box 44 to 55 N, 112 to 96 W at 1,024 x 1,024): rain 62,482 B, snow 76,608 B, lightning 4,144 B. A 3 h flight with a full-size box would be 31 + 31 + 19 frames, about 4.4 MB (still far under the 25 MiB cap). D275's "90-minute flight is about 0.5 MB" is right for a small box (this flight's 163 x 185 box: 110,593 B for 50 frames) and wrong for a wide one.
- Recommendation: correct the sentence in the spec, D275 and todo.md; the limits themselves are fine.
- Missing test: none (a note, not behaviour).

### F8 (Low). "Radar" and "Lightning" are off after a reload or in another browser, so an opened debrief shows nothing until they are ticked
- Where: Weather menu items.
- Steps: open a saved debrief in a fresh browser profile (t2.mjs).
- Expected: the debrief says what is kept ("Kept with this debrief: 50 radar and lightning pictures, ..." in the menu) but the map shows nothing and the line under the map is empty; only a user who opens Weather learns why. Off by default is per R22 and D253's pattern for layers, so this is by the spec's own rule.
- Known/planned: by design (layers off by default); noted, not a bug.
- Suggestion: none needed unless Patrick wants the saved layers on when a file that holds them opens.

### F9 (Low, note). Real ECCC rain over the test flight is faint at 75 %; radar drawn with `drawImage` smoothing looks soft
- Where: 2D map, Radar item.
- Actual: a 163 x 185 picture is magnified about 5x, so echoes look blurred (shots 02, 05); the real echoes that day were 500 to 850 pixels a frame. The drawing is exactly what the spec says (one rectangle between the box corners, 75 %).
- Known/planned: no. PILOT JUDGEMENT not needed; noted so the owner can see it against real weather.

## Passed (brief)
- W1, W2, W5; #213's wind arrows and "--" wording unchanged.
- Fetch: only on the button (0 ECCC requests from ticking items or loading a file), 3 at a time, every step from the last frame at or before the start to the last at or before the end (rain 19, snow 19, lightning 12 for a 105 minute flight), plain GETs, transparent PNG, EPSG:4326, bbox in the right axis order, no other parameters, Cancel stops requests at once and keeps nothing.
- Saved data byte-identical after save, reload and open; map identical; offline open with 0 requests; old file opens; new file opens on the old build.
- Size limits exact at the byte on every boundary tried (fetch cap, frame, block text, file); thinning keeps first and last frame of each layer and says it; the "over the size this tool opens" line appears when saving; opening at exactly the limit works and one byte more is refused with a clear line.
- Security: PNG only, header size read before decoding, strict base64, whole-block-or-none, no HTML from the file, no code run.
- Axe 0 violations; focus moves to the status line when the offer button goes; screen reader text announces only start, 25 % steps and the result.
- Live site 1a8185c: same behaviour and same bytes.

## Logged calls checked (/mnt/project-files/logs/decisions-for-review.md)
- D275 (saved radar, limits 25 MB / 1.5 MB / 100 frames, thinning, saved layers draw only kept frames): matches the code and SPEC-debrief; only the "about 0.5 MB" line is loose (F7). No contradiction with the manuals or SMM (weather features are outside them).
- D276 (weather stays in the file's settings for now, first-class field later): matches (`WEATHER_KEY = 'savedWeather'`). One consequence to note: flight-data drops an over-long setting silently (F4a) until the field is first-class.
- D253 and D254 (wind arrows, "--"): unchanged and still matching.

## Not covered
- Real rain over the flight box was faint, so the visible-pixel checks for real data rely on the 500 to 850 pixel echoes and on the synthetic frames; no case with heavy precipitation.
- A phone or low-memory browser with a 152 MiB file (memory numbers above are a desktop Chromium).
- Firefox and WebKit (CI runs them for @smoke only; only Chromium available here).
- ECCC's real behaviour for a flight that began more than 3 h ago (the "from 11:36Z: ECCC no longer had earlier pictures" line was produced only by the unit and e2e stubs; my flights began inside the window).
- Browser-side network stack against ECCC and github.io (bridged through curl as in #213); CORS was checked by headers (`access-control-allow-origin: *` on GET).

## F6 re-check after app frame #226 (6ee5d69, checked on e0942d0), 15:25Z: PASS
- MAX_DEBRIEF_BYTES = 198,180,864 bytes = exactly 189 MiB, an integer. SAVED_WEATHER_BYTES = 37 MiB.
- readDebriefFile at MAX-1 and at MAX passes the size gate (it then fails only because the filler isn't JSON). At MAX+1 it is refused with "it is too big".
- The open path (debrief index.js:448) compares file.size in bytes against the same constant, and the save fallback (:434) uses it too.
- Note (none): the parser gate at debrief-file.js:77 counts characters (text.length), not bytes. It is lenient for non-ASCII text, and the byte check at open catches it first.
