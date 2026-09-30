# Debrief re-check: PR #213 (52eaaac), wind arrows on the 2D map (12e-2) and unknown G or bank reading "--" (independent, read-only)

Built 52eaaac in wt-debrief, served on 4302, Chromium via Playwright at 1280x720, 1366x900, 1440x900. Live site https://lizardhands-commits.github.io/Dads-debreif/#/debrief checked too (its `app-version` meta reads "2026-09-30 52eaaac", the same commit). Scripts: wt-debrief/s/w1..w17.mjs, lib2.mjs, rc1-213.mjs, rc1d-213.mjs. Shots: /mnt/project-files/verification/shots/debrief-213/. Live 9-point reply saved as /mnt/project-files/verification/fixtures/debrief/open-meteo-9pt-live.json.

Sandbox note: Chromium cannot use the sandbox proxy for localhost, and the proxy drops many browser-side requests (ERR_TOO_MANY_RETRIES). So in the browser every Open-Meteo request (and, for the live-site run, every github.io request) was fetched by curl through the proxy at the moment the page asked and handed to the page byte for byte. The replies are real; only the transport differs. CORS was checked separately with curl (below).

## Verdict
| Item | Verdict |
|---|---|
| 1. Hand-made 9-point fixture vs a live 9-point reply | STRUCTURE MATCHES (details below); the code's parser gives the same kind of arrows from the live reply |
| 2. Wind arrows: off by default, 8,000 ft, one request, 3x3 grid, downwind, labels, level, offline, no keys, CSP, axe, 1280 layout | PASS, with 3 Low findings (W1 to W3) and 2 Low cosmetic notes (W4, W5) |
| 3. Unknown G or bank reads just "--" | FIXED (closes Low L1 of the #204 re-check) |
| 4. No regressions (2D/3D switch, menus 1280-1440, unit and e2e) | PASS (unit 2,692 tests, 0 fail; e2e 86 of 86) |

Counts: High 0, Medium 0, Low 5 (W1 to W5). Two PILOT JUDGEMENT items with recommendations (P1, P2).

## 1. The coordinator's ask: hand-made fixture against a live reply

Fixture: tests/fixtures/debrief/handmade-gem_hrdps_continental-3x3.json (used by tests/unit/debrief/weather-wind-arrows.test.js and tests/e2e via openMeteoGridReply).

Live request: the app was driven (example flight, Weather, Wind arrows on) and the request URL it builds was captured, then sent live with curl. It is the URL the code builds and nothing else: `windsGridUrl({points, startT, endT, model:'hrdps'})` called from Node gives exactly the same string (checked equal). Shape: `https://historical-forecast-api.open-meteo.com/v1/forecast?latitude=49.83,49.83,49.83,50.15,50.15,50.15,50.47,50.47,50.47&longitude=-106.07,-105.71,-105.35,(x3)&start_date=2026-06-02&end_date=2026-06-02&hourly=wind_speed_950hPa,wind_direction_950hPa,geopotential_height_950hPa,(same for 925, 850, 800, 700, 600, 500, 400, 300 hPa)&models=gem_hrdps_continental&wind_speed_unit=kn&timezone=GMT` (commas percent-encoded as %2C by URLSearchParams; the API accepts that). The date is the example flight's, 2026-06-02 (18:19Z to 20:03Z, Moose Jaw area, tracks 49.826 to 50.470 N, 106.067 to 105.352 W). Reply: HTTP 200, 52,315 bytes, `content-type: application/json; charset=utf-8`, chunked.

| Field | Hand-made | Live | Match |
|---|---|---|---|
| Top level | JSON array of 9 | JSON array of 9 (multi-location = array, not object) | yes |
| Order | request order (row-major, south first, west to east) | request order: reply i is the i-th requested point (lat/lon of each entry fall in the same cell, checked for all 9) | yes |
| Per-point keys | latitude, longitude, generationtime_ms, utc_offset_seconds, timezone, timezone_abbreviation, elevation, hourly_units, hourly (plus `_handmade`) | the same nine keys, same order, no `_handmade` | yes |
| `hourly_units` | time iso8601; wind_speed kn; wind_direction °; geopotential_height m | identical, all 28 keys | yes |
| `hourly` keys and order | time + 27 arrays, speed/direction/height per level | identical key list and order (also identical to the earlier single-point live fixture live-gem_hrdps_continental.json) | yes |
| `hourly.time` | "2026-09-29T15:00" style (no seconds, no Z), 6 hours | "2026-06-02T00:00" style, same format, 24 hours (whole day 00:00 to 23:00) | format yes; length differs (fixture short) |
| Values | numbers | numbers (int for direction, float for speed and height), no nulls anywhere (0 of 9 x 27 x 24) | yes |
| `utc_offset_seconds`, `timezone`, `timezone_abbreviation` | 0, GMT, GMT | 0, GMT, GMT | yes |
| `elevation` | number in m, 570 to 586, rising 2 m per point | number in m, 581 to 738, not monotonic (720, 700, 732, 666, 738, 602, 606, 586, 581) | type yes; values differ (fixture is tidier than the model's real terrain) |
| `latitude`, `longitude` | the requested values (50.2, -105.9 ...) | the model cell's centre, not the request (49.820423 for 49.83; -106.0708 for -106.07), up to 0.01 deg off | differs; the code ignores the reply's lat/lon and places each arrow at the requested point, so no effect, and the offset is within the spec's "about 1 km" |
| `generationtime_ms` | number | number (4,182 ms for nine points) | yes |

Feeding the live reply to the code: `readWindsGrid(live, 9)` gives nine lists of 24 hours, each with `groundFt` set from that point's `elevation` (2,362, 2,297, 2,402, 2,185, 2,421, 1,975, 1,988, 1,923, 1,906 ft), nine levels per hour. `windArrowsAt` at 18:30Z gives nine arrows at 8,000 ft ("210°T/24 kt", "210°T/24 kt", "210°T/24 kt", "200°T/23 kt", ... "180°T/21 kt"), 12,500 ft (nine), 30,000 ft (nine), and "below" at 2,000 ft and "above" at 35,000 ft for all nine, the same kinds of results the hand-made path gives (hand-made: nine arrows at 8,000/12,500/30,000, "below" at 2,000, "above" at 35,000). The app, given the live reply through the browser, drew 9 arrows with the caption "Model wind at 8,000 ft (HRDPS 18–19Z, Open-Meteo)" and the status "9 of 9 points have model wind" (shot 03). The one-point request (`Winds aloft`) still reads a single object, and `readWindsGrid` copes with an object or a list.

Independent number check (own Python, not the code): point 0, 8,000 ft (2,438 m), 18:30Z. Levels above that point's ground (720 m): 925, 850, 800, 700 hPa and up; 800 hPa (1,989 m) and 700 hPa (3,068 m) straddle 2,438 m; vector blend by height, then halfway between the 18Z and 19Z hours: 206.0 deg at 24.34 kt. The code: 206 deg, 24.3 kt (label "210°T/24 kt", rounded to 10 deg). The right pressure levels are used. Also with height 12,500 ft the Lead line ("model wind 200°T/25 kt at 12,300 ft") and the nearest arrows ("200°T/26 kt", "200°T/25 kt", ...) agree (shot 05).

Result of the comparison: the hand-made fixture has the same structure as the real API reply (array of 9, same keys, same units, same hourly keys and order, same time format, same timezone fields); it differs only in content: 6 hours against 24, tidy elevations against real terrain, requested lat/lon against the model cell centre, and the extra `_handmade` key. None of these changes the parser's behaviour. The hand-made fixture is confirmed as a faithful stand-in. The task-list note in tasks/debrief/todo.md line 89 ("to check against a live 9-point reply from a full-network machine") can be closed by this run.

Recommendation: add the live file as a second fixture (tests/fixtures/debrief/open-meteo-9pt-live-2026-06-02.json, 52 KB) so the unit test reads real terrain elevations and 24-hour arrays.

CORS: `curl -H "Origin: https://lizardhands-commits.github.io"` on the same URL returns `access-control-allow-origin: *`; the OPTIONS preflight returns the same with GET allowed. On the live site the request from the github.io origin was answered 200 with `*`.

Missing test: tests/unit/debrief/weather-wind-arrows.test.js needs a case that loads the live file above and asserts nine lists, 24 hours each, groundFt equal to elevation x 3.28084, and nine arrows at 8,000 ft, so the structure is pinned to a real reply as well as the hand-made one.

## 2. Wind arrows: what was checked and passed

- Off by default: fresh profile, Weather menu: "Wind arrows (model)" unchecked, "Wind arrow height" 8000, no status line, no caption; 0 Open-Meteo requests until it is checked (also on the live site). Independent of "Winds aloft (model)" (also off). Shot 01.
- Height picker: 12500, 30000, 3000 change the arrows and the caption at once with no new request; 2000 and 2500 ft give no arrows and the status "no model wind at 2,500 ft here (below the model's lowest level)" (the lowest usable level at these points is 925 hPa, about 2,600 ft, above the ground of 1,906 to 2,421 ft; correct per the spec's "below the lowest level above the ground"); 35000 and 1000 show "Enter a number from 2,000 to 30,000 ft." and keep the last valid height (3,000).
- One request per load: turning on = 1 request; then height changes, scrubbing across the whole flight (18:19Z to 20:02Z, caption hours 18-19Z, 19-20Z, 20-21Z), pan, wheel zoom, Fit, off and on again = still 1. Model change to HRRR = a second request (the other model), by design. Closing the flight and loading it again = a new request (cache cleared per flight). 3D on = 0 requests. Lead line plus arrows both on = 2 requests (1 point + 9 points), by design.
- Grid: 9 points, 49.83/50.15/50.47 N by -106.07/-105.71/-105.35 W (0.32 deg x 0.36 deg spacing, south first, west to east), one request with 9 comma-separated values. Bounds against the four example KMLs (all 23,400 fixes): tracks span 49.8256 to 50.4700 N and -106.0674 to -105.3515 W; grid corners 49.83 to 50.47 and -106.07 to -105.35. Every fix is inside except by rounding to 0.01 deg: min lat 49.8256 (grid 49.83, 0.004 deg = 450 m inside the track edge) and max lat 50.470032 (grid 50.47, 3 m). This is the spec's "about 1 km" and is fine. A box of 0.0004 deg gives 1 point; a 0.02 deg box gives 9.
- Direction: screen vectors recorded from the canvas calls (moveTo/lineTo of the arrow shafts): wind from 207 deg is drawn pointing toward 27 deg (NNE), from 186 deg toward 6 deg, etc., for all nine, with the top row (50.47 N) above the bottom row on screen (north up). `arrowVector` for wind FROM 270 gives dx +25, dy 0: air going east; FROM 0 gives dy +25 (screen down = south); FROM 90 goes west; FROM 180 goes north. Downwind, as the spec and D253 say.
- Labels and units: every label is `windWords` ("210°T/24 kt": true direction the wind blows FROM to 10 deg, knots, `wind_speed_unit=kn`); the arrow for "210°T/24 kt" points NNE, consistent with a wind from 210. Arrow lengths 20 to 24 px for 20 to 24 kt (1 px per kt, held to 16 to 72). Calm ring verified in unit tests only (no calm point in this data).
- Level for the height: verified above by the independent calculation (800/700 hPa straddle 8,000 ft; 925 and up used, 950 hPa left out where under the ground).
- Consistent with windWords: the Lead line and arrows use the same function and the same blend; at 12,300/12,500 ft the values agree within one step (shot 05).
- Offline and failure (fulfilled or aborted in the browser): no connection = status "HRDPS winds couldn't load. They need a connection." (no caption, no arrows, 1 request); HTTP 500 = "HRDPS winds: Open-Meteo answered with an error (500). Turn Wind arrows off and on to try again." and off/on asks again (2 requests); 429 minute = "Open-Meteo is busy ..."; 429 daily = "this browser has used Open-Meteo's free daily allowance, try tomorrow"; 200 with HTML = "Open-Meteo's answer wasn't wind data ..."; reply without `elevation` = 9 of 9 (falls back to the home field's ground). No page errors; the only console errors are the browser's own "Failed to load resource" lines for the failed requests.
- No key leaks: the request URL has only latitude, longitude, dates, hourly names, model, unit and timezone; no key, token or account parameter; page requests go to the app's own host and historical-forecast-api.open-meteo.com only (live-site run). The reply is read as data, never inserted as HTML (labels are canvas text).
- CSP: none to satisfy. dist/index.html has no CSP meta tag, the repo has no CSP configuration (grep for "Content-Security-Policy" and "connect-src" finds only the security checklist doc), and GitHub Pages sends no CSP header. The Open-Meteo host already worked for the Lead line (#186). If a CSP is ever added, `connect-src` needs https://historical-forecast-api.open-meteo.com.
- Axe (WCAG 2 A and AA) at 1280, 1366 and 1440 with the arrows on: 0 violations with the Weather menu open and with it closed (only the usual `color-contrast` "incomplete" for the canvas). The height box is described by its own message and the status line (`aria-describedby` has both ids).
- Layout at 1280x720, 1366 and 1440: no sideways scroll (scrollWidth equals viewport); Weather menu 558 to 984 at 1280 (inside the map 296 to 984), 644 to 1070 at 1366, 718 to 1144 at 1440; bottom at 528, above the map bottom (615 at 1280x720); caption sits at the map's bottom right (678 to 979 at 1280) and does not touch the playback bar. Shots 10, 11.
- 3D: "Wind arrows show in the 2D map only." in the menu, no caption, 0 requests; back to 2D shows the arrows and makes the request once (shot 07).
- Persistence: the item and height are remembered after a reload (both are layout settings) and a stored "on" fetches once the flight loads; a fresh profile is off at 8,000 ft.
- Live site (deployed 52eaaac): default off and 8000, 0 requests before switching on; one request answered 200 with `access-control-allow-origin: *`; caption and "9 of 9 points have model wind" (shot 20).

## Findings

### W1 (Low). With some points empty, the menu status says "no HRDPS wind for this time" while other points are drawn
- Where: Weather menu status line (`arrowStatus` in src/modules/debrief/weather/wind-arrows.js).
- Steps: turn Wind arrows on with a reply that has data for only some of the nine points: (a) a list of 4 replies, (b) a list of 9 with the hourly values of every second point null, (c) a single object. Read the status line and the map.
- Expected: SPEC-debrief Winds aloft says the status line "says why" a point has no arrow and gives counts; arrowStatus already says "at 2 of 3 points" when the missing ones are below or above. For a point missing for lack of a model hour the same count wording would be true ("4 of 9 points have model wind").
- Actual: with (a) 4 of 9 replies, 4 arrows are drawn and the caption shows, and the status reads "no HRDPS wind for this time" (arrowStatus returns that whenever every missing point's reason is 'time', even when other points have arrows). Same for (b) and (c). In a mixed case (some below, some no hour) the "below" reason is given for all missing points. Plausible in life at the edge of the HRDPS domain or when Open-Meteo returns nulls for one location.
- Screenshot: /mnt/project-files/verification/shots/debrief-213/06-four_of_nine.png (arrows in the left/bottom rows only; status is in the closed menu, text recorded in the run: "no HRDPS wind for this time").
- Known/planned: no. Direct call: `arrowStatus([{wind:{dirDeg:200,kt:20},why:null},{wind:null,why:'time'},{wind:null,why:'time'}], 8000, 'HRDPS')` returns "no HRDPS wind for this time".
- Missing test: tests/unit/debrief/weather-wind-arrows.test.js, arrowStatus with some points having wind and others why 'time' must not say "no wind for this time" (expect a count such as "1 of 3 points have model wind"); plus a mixed 'below' and 'time' case.
- Recommendation: when at least one arrow exists, say "N of 9 points have model wind" (add the reason for the rest if all share one).

### W2 (Low). A height off the 500 ft step is accepted silently and the box does not match what is drawn
- Where: Weather menu, "Wind arrow height".
- Steps: type 8250 (or 9999) and leave the box.
- Expected: SPEC-debrief: "from 2,000 to 30,000 ft in steps of 500". Out-of-range values already get the box's message ("Enter a number from 2,000 to 30,000 ft."); an off-step value should either get a message or be shown as the value in use.
- Actual: the box keeps showing 8250 (9999) with no message, while the caption says "Model wind at 8,500 ft" ("10,000 ft") and the arrows are drawn at that height (`clampArrowFt` rounds).
- Screenshot: none needed (text only; run output in w7.mjs); the caption is in shot 03/20 form.
- Known/planned: no.
- Missing test: tests/e2e/debrief.spec.js "wind arrows" test: fill 8250 and expect either the box to read 8500 or a message, and the caption to name the same height as the box.
- Recommendation: after commit, write the rounded value back to the box (or add the range message for off-step values).

### W3 (Low, by spec). If the request fails and the Weather menu is closed, the map says nothing
- Where: 2D map after turning Wind arrows on and closing the menu; no connection, an Open-Meteo error or a rate limit.
- Steps: block the request (or use the sandbox with Open-Meteo unreachable), check the item, press Escape.
- Expected: the spec puts the reason in the menu's status line only ("the Weather menu's small status line under the item says why"). So this is as specified. The Lead line, by contrast, shows its failure on the Formation card.
- Actual: no arrows, no caption, no message anywhere except inside the open menu. A user who checks the box, closes the menu and sees nothing does not learn why.
- Screenshot: /mnt/project-files/verification/shots/debrief-213/06-offline.png and 06-http500.png (menu closed, blank map).
- Known/planned: by design; not in todo.
- Missing test: none for the specified behaviour; if changed, an e2e that the line under the map (`.map-credit`) says the reason when the request has failed.
- Recommendation: put the failure text in the line under the map too (the place the caption uses) while the item is on, so the menu need not be open.

### W4 (Low, cosmetic). Arrow labels are drawn over the 3/9 line and ships
- Where: 2D map.
- Steps: 1440x900, example flight, Wind arrows on, time +1750 s.
- Expected: labels readable (they are, with a dark outline).
- Actual: the bottom-row labels sit on the white/blue 3/9 line and near the ships ("210°T/24 kt" crossed by the line in shots 03, 11, 20). The arrows are under the tracks by spec, so this is only crowding.
- Screenshot: /mnt/project-files/verification/shots/debrief-213/11-arrows-map-1280.png.
- Known/planned: no.
- Missing test: none (visual judgement).

### W5 (Low, cosmetic). In the Weather menu, the arrows checkbox is paired with the model select, not its own height box
- Where: Weather menu at 1280 to 1440.
- Steps: open Weather with the item on.
- Actual: the two-column grid puts "Wind model" (left) beside "Wind arrows (model)" (right), then "Wind arrow height" alone at left below, then the status line. The checkbox for the arrows is on the right and its height box is on the left, one row down. It reads, but the pairing looks accidental (same pattern as "Satellite (GOES-West)" beside its picture select).
- Screenshot: /mnt/project-files/verification/shots/debrief-213/02-arrows-on-menu-open-1440.png.
- Known/planned: no.
- Missing test: none.

## 3. "--" wording (closes L1 of the #204 re-check)

Whole example flight, every second, 25,152 ship-seconds (1,038 in a GPS gap), through `readoutsAt` + `shipDetailText` (More detail line 2):
- G unknown and not in a gap: 6,795 ship-seconds; every one reads "G --" with nothing after it (0 read "G -- est." or "G -- recorded").
- Bank unknown: 3,490 ship-seconds; every one reads "bank --" (0 with a source word).
- Known values keep their source: G known 17,319 (all "est."), each with " est."; bank known 20,624: 12,457 "recorded", 8,167 "est."; 0 known values without a source. Pitch never reads "--" (0).
- Old code against new (main a17df82 against 52eaaac, same flight): 18,357 ship-seconds identical; the 6,795 that differ differ only by the removed " est." after a "--" (0 other differences).
- On screen (More detail, 1440x900): start+900 s parked "G --, pitch 0° est., bank --" (#1, #2) and "G --, pitch 0° est., bank 0° recorded" (#3, #4); start+1688 #2 "G --, pitch 0° est., bank --" beside #3 "G 1.00 est., ... bank 25° right recorded"; start+1700 "G 3.88 est., pitch -15° est., bank 37° left recorded". Shots 30-more-detail-gap-and-unknown.png and 30-more-detail-recorded-bank.png.
- The logged call D254 matches; it does not contradict the spec. The 3D label and the CSV (D226) are unchanged.
- Missing test (already added by the PR, confirmed present): tests/unit/debrief/readouts.test.js shipDetailText for a null G and null bank. Nothing further.

## 4. No regressions

- Menus and the 2D/3D switch (176 checks x 4 sizes, wt-debrief/s/rc1-213.mjs, from the #204 script): 168 pass; the 8 "Weather not open" reports are the known artefact of that script clicking the radio with the mouse (which closes the menu by design). Redone with the keyboard (s/rc1d-213.mjs) at 1280, 1366 and 1440: Weather 558-984 to 394-820 and back at 1280, 644-1070 to 394-820 at 1366, 718-1144 to 394-820 at 1440, always inside the map, no sideways scroll. All four 2D menus and the three 3D menus open and stay inside the map at 1280x720, 1280x800, 1366x768 and 1440x900; the wider Weather menu (bottom 505 to 528) still ends above the map bottom. Console errors: 0.
- The "Reset" playback button wraps under the bar at 1280 wide; it did so in the #204 re-check screenshots too (debrief-4/1280x720-2D-weather.png), so it is not from this PR (no playback CSS in the diff).
- 3D with swiftshader: switch, Weather and 3D settings menus work at 1280, 1366 and 1440 (shots 12-3d-*.png); 0 console errors.
- `npm test` (unit): 2,692 tests, 2,684 pass, 0 fail, 8 todo.
- E2E (chromium, debrief.spec.js + a11y.spec.js + layout.spec.js, `PW_PORT=4302`): 86 passed, 0 failed (includes the new wind-arrows tests at debrief.spec.js:1204, 1284, 1306 and the RC-1/RC-3 tests). A first run showed 5 failures with ERR_CONNECTION_REFUSED because my preview server on 4302 had stopped mid-run (killed by an earlier timeout of mine); rerun on a fresh server: all pass.

## Pilot judgement

### P1. PILOT JUDGEMENT: is 8,000 ft the right first height?
Question: the example flight is at 11,500 to 13,700 ft (mid block); the arrows at 8,000 ft show the wind about 4,000 ft under the formation. Would you rather brief the wind at the block you flew?
Recommendation: keep 8,000 ft as logged (D253, low block 6,000 to 10,000 ft, Gen Book p.12) for now, since Patrick chose a low-block default and the box takes any height; add later a small "Lead's altitude" button next to the box. No change needed for this PR.

### P2. PILOT JUDGEMENT: labels show the direction the wind blows FROM ("210°T/24 kt") while the arrow points where the air goes (NNE)
Question: does the pairing read naturally to a T-6 pilot, or should the label say "from 210°T"?
Recommendation: keep it; it is the same convention as ATIS and the Lead line, and the spec/D253 state it. If a pilot finds it confusing, prefix the caption with "wind from" rather than changing the labels.

## Logged calls checked (/mnt/project-files/logs/decisions-for-review.md)
- D253 (wind arrows: off by default, 8,000 ft MSL default, 3x3 grid in one request, downwind, 1 px per kt clamped 16 to 72, caption, 2D only): matches the code, the spec paragraph in SPEC-debrief.md (Winds aloft) and what I saw. No contradiction with the SMM, manuals or spec. Note its rationale "8,000 ft sits in the Low block where most of the flight is" does not hold for the example flight (mostly mid block); see P1.
- D254 (unknown G or bank reads "--"): matches; no contradiction.
- D226 (bank "--" where no turn rate and no recorded bank): unchanged and consistent.

## Not covered
- A flight with a tiny box (a single pattern) was checked only at the function level (1 point for a 0.0004 deg box, 9 points 1 km apart for 0.02 deg); no such flight file is in the repo to run in the app.
- Wind arrows at night across the UTC date change (the URL builder handles the next day; not run live).
- Real CORS from a browser on github.io was checked by response headers (GET and preflight) and by the page's own 200 with `*`, but the page's request went through curl in my harness, not Chromium's network stack.
