# Debrief re-check: #182 (Debrief settings menu) and #186 (model wind), main at 8e7cafb

Checker: independent verification thread. `npm ci`, `npm run build`, `vite preview` on port 4302, Playwright Chromium at 1440x900 and 1366x768. Nothing pushed, committed or edited in the repo. Scratch scripts are in the worktree `s/` folder (`g1`-`g5` settings menu, `w1`-`w4` wind, `r1`-`r3` regression). Shots are in `shots-2/`. Real-shaped Open-Meteo replies I fetched are in `fixtures/` (see the wind section).

## Summary

| Severity | Count |
|---|---|
| High | 0 |
| Medium | 1 (W1) |
| Low | 7 (W2 to W7, S1) |
| PILOT JUDGEMENT | 2 (each with a recommendation) |

The settings menu (#182) is good: no regressions found. The model wind (#186) does the maths right (interpolation, direction convention, units, time hour, HRRR, error states all check out against independent hand and Node calculations), but the words on the Lead line do not say the wind is true, do not print "kt", and do not say "model".

All of M1 to M5 and the Low items I re-ran are unchanged from the earlier report. The logged Debrief fixes for M1a, M1b, M2 and M4 (decision rows dated 10:20 to 10:30, "next Debrief PR") are not on main at 8e7cafb, so that is expected.

Top 5 lines:
1. W1 (Medium): the Lead line reads "wind 280/38 at 12,600 ft (HRDPS 18Z, Open-Meteo)": no "true", no "kt", no "model/forecast". A pilot reads 280/38 as magnetic (ATIS style); the model's direction is true (about 8 degrees different at Moose Jaw).
2. W4 (Low, PILOT JUDGEMENT-ish): the lowest model level (950 hPa, about 1,600 ft) is about 290 ft below Moose Jaw's field (1,892 ft), so on the ramp and in the first roughly 460 ft AGL the wind is blended with a below-ground value ("wind 290/8 at 1,900 ft" on the ramp).
3. W2 (Low): the wind is appended to the Lead verdict and takes its yellow warning colour; the Lead line grows to six lines.
4. W3 (Low): the wind steps at each hour (35 kt / 284 degrees at 18:59:59Z, 38 kt / 282 degrees at 19:00:00Z) with up to 59 minutes of lag; no blend in time.
5. S1 (Low): stale refusal messages stay on other boxes in the settings menu; the wording under Spread maximum names the minimum.

## 1. Debrief settings menu (#182)

All checked in a fresh browser profile, example flight loaded.

| Check | Result |
|---|---|
| Starts closed | PASS. Button `Debrief settings`, `aria-expanded=false`, body not visible, before any flight and after loading the example. |
| Title | PASS. Exactly "Debrief settings" (old "Standards" button is gone: count 0). |
| Every field has a default | PASS. 3 switches and 12 numbers, each filled: spread 4000 / 6000 ft, sweep 0 / 10 degrees; offset 7000 +/- 1000 ft; Lead 220 kt low, 200 kt mid, low block top 10250 ft, +/-10 kt, 1.0 +/-0.2 G. Identical to `DEFAULT_STANDARDS` in `src/core/standards.js` (compared). Units and min/max shown by each box. |
| Edits apply | PASS. Sweep most 3: summary "sweep 0 to 3", card recalculated. Lead mid block 230: card changed from "FAST (target 200 kt)" to "on parameters (target 230 kt, mid block)". Each of the three Judge switches off changes the card; all off gives "All standards are off: no labels are shown." |
| Refuses bad values | PASS. Spread minimum -5: box `aria-invalid=true`, "must be between 0 and 20,000 ft. Kept 4000 ft." |
| Persist | PASS. After a reload the values (`true,4000,7000,0,3,true,7000,1000,true,220,230,...`) and the open state stay. |
| Reset | PASS. "Reset to the default standards" restores all 15 values; still defaults after a reload. Works with Enter on the keyboard. `Layers > Reset layout` closes the menu and leaves the standards alone (correct: it is layout, not standards). Closed then reload stays closed. |
| Nothing lost from the old panel | PASS. Compared the diff of `standards-panel.js`: same three groups, same fields (built from `standards.limits`), same summary list, same Reset label, same `standardsOpen` key. Only change: fieldset frame and Reset button now come from `createSettingsMenu`. |
| No overlap | PASS at 1366x768 and 1440x900 with menu, More detail, Save/open/CSV and a DFP all open: 0 overlaps (clipping-aware scan; the right column scrolls internally as it did before). Shots: `/mnt/project-files/verification/shots/debrief-2/11-menu-open-1366x768.png`, `12-everything-open-1366x768.png`, `12-everything-open-1440x900.png`. |
| Keyboard | PASS. Tab reaches the button (27 tabs from the top, after "+ Add" in the right column), Enter opens, then 15 fields and Reset in reading order, every one with a visible focus ring; Space toggles a switch; typing a number and Enter commits it. |
| Axe (WCAG 2 A, AA and 2.1 AA) | PASS. No violations with the menu open and closed, and at 1366x768 and 1440x900 with everything open. |
| Console | No errors (only the Service Worker note that comes from Playwright blocking it). |

**S1 (Low). Stale and confusing refusal messages.** Where: Spread boxes. Steps: type 3000 in Spread maximum (min is 4000), Tab; then -5 in Spread minimum, Tab. Expected: one clear message per refused box, and the message under a box talks about that box. Actual: the box keeps "3000" (invalid, kept 6000) and shows "Spread minimum must not be more than the spread maximum. Kept 6000 ft." under the Maximum box; that message stays while the Minimum box gets its own. Both are shown at once until a later accepted edit re-syncs. Known/planned: No (the earlier audit already noted the box marks itself invalid, so the box mismatch is by design). Missing test: `tests/e2e/debrief.spec.js` standards test: after a refused Spread maximum, the message under it names "maximum", and a second refused box clears the first message.

**S2 note (not a defect): at 1366x768 the open menu (about 1,140 px tall in a 240 px column) and the Formation card cannot both be on screen**, so you cannot watch the labels change while editing a number. Labels wrap to two lines and the two Sweep boxes sit a few pixels off from the others. Cosmetic; I did not compare with the old panel's height. Option: none needed, or a one-line "what the card says now" in the summary (the summary is already there).

## 2. Model wind (#186)

### 2.1 Method

The container's IP has used Open-Meteo's daily allowance on the historical archive (I got a real HTTP 429 with body `{"reason":"Daily API request limit exceeded. Please try again tomorrow.","error":true}` and `access-control-allow-origin: *`). That is the real shape of the daily 429 and the app's `/daily/i` test matches it, so the "free daily allowance" message is right in practice. The forecast API (not rate limited) answered, so I fetched real replies from `api.open-meteo.com` for HRDPS (`gem_hrdps_continental`) and HRRR (`ncep_hrrr_conus`) at 50.33, -105.56 with the exact variables and `wind_speed_unit=kn&timezone=GMT` the app sends. Both have all 9 levels x 3 variables, no nulls, 48 hours, heights in metres, speeds in knots. They are in `fixtures/live-gem_hrdps_continental.json` and `fixtures/live-ncep_hrrr_conus.json`. In the browser I answered the app's historical-forecast request with these (re-timed onto the flight's day by hour of day) through Playwright's `page.route`.

### 2.2 Altitude interpolation between pressure levels: PASS

- Independent implementation (u/v components, meteorological FROM convention) against `windAtAltitude` over 48 hours x 205 altitudes (1,700 to 30,000 ft, 9,928 points): worst difference 0.00 (identical).
- Hand check, hour 0 of the HRDPS reply, 5,500 ft, between 850 hPa (1431 m = 4,694.9 ft, 6.9 kt from 232) and 800 hPa (1933 m = 6,341.9 ft, 10.8 kt from 242): k = 805.1 / 1647.0 = 0.4888. Components x = -5.4373 + (-4.0986)(0.4888) = -7.4407, y = -4.2481 + (-0.8222)(0.4888) = -4.6500. Speed 8.774 kt, direction 180 + atan(7.4407/4.65) = 238.0 degrees. Code: 238.00 degrees, 8.774 kt. Words "240/9".
- Wrap-around: 350/20 and 010/20 half way gives 360/19.7 (words "360/20"), not 180. Exactly on a level returns that level's wind. Below the lowest and above the highest level: null (the line then says which end and names the level).
- Opposite winds (090/20 and 270/20) blend to calm (vector result 1e-15 kt), words "calm": physically right for a vector blend.
- In the browser, at 10 playback times (18:19Z to 20:03Z) the Lead-line words equal my independent expected values every time (direction to the nearest 10 degrees, speed to the knot; e.g. 19:39:04Z, Lead 3,208 ft: screen "290/15", expected 288.3 degrees / 14.65 kt). Lead's altitude used is the same MSL altitude shown in More detail (ramp reads 1,875 ft against the field's 1,892 ft), and Open-Meteo's geopotential height is metres above sea level converted at 0.3048, so the datums agree.

### 2.3 Direction convention, units, labels

- Convention: FROM (matches METAR and Open-Meteo `wind_direction`). PASS. North shows as 360, three-figure directions padded ("010/12").
- Units: knots. The URL sends `wind_speed_unit=kn`, and the returned `hourly_units` say `kn`. PASS in the data.
- **W1 (Medium). The words on screen do not say what the wind is.** Where: Formation card, Lead line (2D and 3D), e.g. `wind 280/38 at 12,600 ft (HRDPS 18Z, Open-Meteo)` (`/mnt/project-files/verification/shots/debrief-2/21-winds-line.png`). Expected: the brief and the METAR line next to it carry units and reference ("wind 180/14 kt"); wind direction must say true or magnetic; the value must read as model wind, not observed. Actual: (a) no "kt" (METAR line prints it); (b) no "true": Open-Meteo directions are true, and pilots read a pair like "280/38" as magnetic, as ATIS and tower winds are, about 8 degrees different at Moose Jaw; (c) the words "model" or "forecast" are absent: only the menu item says "(model)", and "HRDPS" tells a pilot little. It is not shown as observed anywhere else either, so a reader could take it for measured wind. Spec line 190 gives the example text without these words, so this is "built as specced but not enough" (Medium). Known/planned: No. Recommendation: `model wind 280°T/38 kt at 12,600 ft (HRDPS 18Z, Open-Meteo)`. Missing test: `tests/unit/debrief/weather-winds.test.js`: `windTextAt` contains "kt", "true" (or "°T") and "model". Also update SPEC-debrief line 190 and `docs/checklists/debrief.md`.
- Time label: "18Z" is the model hour used, always in Zulu (the header order Zulu/local does not change it). PASS, labelled.

### 2.4 Time matching to the playback time

- Uses the model hour at or before the playback time (spec line 190, D176). In the browser: 18:59:04Z, 18:59:59Z show "18Z"; 19:00:00Z and 19:00:01Z show "19Z"; 19:39Z shows "19Z". PASS, per spec.
- Model hours older than 90 minutes are dropped: with a reply that only had the 18Z hour, 19:19Z still showed the 18Z wind (1 h 19 old) and 19:39Z (1 h 39 old) and 19:59Z say "no HRDPS wind for this time". PASS. The stale text does not say why (too old versus missing).
- The request asks for `start_date` = the day 90 minutes before take-off and `end_date` = the day of the landing, so the hour in force at take-off is there. Only one point (rounded to 0.01 degree: `latitude=49.94&longitude=-105.61`, Lead halfway through the flight), the model, the dates, the level variables and units are sent; nothing else. PASS on privacy.
- **W3 (Low, PILOT JUDGEMENT). The wind is a staircase in time.** At 18:59:59Z the line says 280/35 (284.3 degrees, 35.3 kt); one second later, 19:00:00Z, 280/38 (281.9 degrees, 37.6 kt). Up to 59 minutes of lag, because Open-Meteo's pressure-level winds are the hour's value. It is per spec and D176. Question for Dad: is a step at the hour acceptable, or should the wind change smoothly? Recommendation: blend linearly (as a vector, like the levels) between the hour at or before and the next hour, and label the time as the exact minute ("18:30Z, between 18Z and 19Z"). Cheap, no extra requests. Otherwise leave as is. Missing test: `tests/unit/debrief/weather-winds.test.js`: at 30 minutes past the hour, the wind is the midpoint of the two hours.

### 2.5 HRRR option, model choice: PASS

- Wind model select (HRDPS default, "HRRR (US, from 2018)"): picking HRRR makes one new request with `models=ncep_hrrr_conus` and the line becomes `wind 280/35 at 12,600 ft (HRRR 18Z, Open-Meteo)`; independent expected value: 284.8 degrees, 35.49 kt, words 280/35. Switching back to HRDPS makes no new request (cached).
- `windModelFor` (Node): a June 2022 flight with HRDPS chosen uses HRRR; 2017 gives null and the line says "no model winds go back this far"; HRRR chosen for 2026 uses HRRR. I could not load a 2022 flight in the browser (no such file); Node only.
- The Weather items are all off at first (Winds aloft unchecked on a fresh profile, no request before it is ticked, no request before a flight is loaded). After a reload the tick and the model choice are remembered like the other layout settings, and the winds are fetched again when the next flight loads.

### 2.6 Off, loading and error states: PASS

Each in a fresh page, request answered by `page.route`, playback 18:59Z:

| State | Line shows |
|---|---|
| Off | nothing, no request |
| Loading (2 s delay) | "· loading HRDPS winds…" then the wind |
| 429 daily | "HRDPS winds: this browser has used Open-Meteo's free daily allowance, try tomorrow" |
| 429 minutely | "HRDPS winds: Open-Meteo is busy. Turn Winds aloft off and on to try again." |
| HTTP 500 | "HRDPS winds couldn't load. They need a connection." (see W5) |
| Request aborted (offline) | same text, correct here |
| HTML instead of JSON | same text (see W5) |
| Reply with no hours, or all null | "no HRDPS wind for this time" |
| Lead below 950 hPa level or above 300 hPa | names the level ("below the lowest model level (1,600 ft)" / "above the highest model level (30,400 ft)"; Node) |
| Retry | no automatic retry (requests +0 after the server recovers); Winds aloft off then on asks again and works |

No console errors in any state.

- **W5 (Low). "They need a connection" for a server error.** Same wording issue as L7 (METAR 503), now also for the wind: an HTTP 500 or an HTML reply is reported as a missing connection. Recommendation: "Open-Meteo answered with an error (500). Turn Winds aloft off and on to try again." Missing test: `tests/unit/debrief/weather-winds.test.js` feed test: a 500 answer gives a message that does not contain "connection"; an aborted fetch does.

### 2.7 Other wind findings

- **W2 (Low). The wind takes the Lead verdict's colour and lengthens the Lead line.** The wind text is a `<span class="lead-wind">` inside the same list item as the verdict, so it turns warning yellow with "FAST, HIGH G" and the line is six lines tall in the 240 px column (`/mnt/project-files/verification/shots/debrief-2/21-winds-line.png`). It reads as part of the warning. Recommendation: put it on its own neutral line under Lead ("Model wind: ..."). Known: No. Missing test: `tests/e2e/debrief.spec.js` (winds test): `.lead-wind` computed colour equals the card's neutral text colour, not the verdict tone.
- **W4 (Low, PILOT JUDGEMENT). The wind near the ground is blended with a level that is under the ground.** The lowest level asked, 950 hPa, has a geopotential height of about 489 to 494 m (1,604 to 1,620 ft) in both models over Moose Jaw; the field is 1,892 ft (577 m, `elevation 573` in the reply). Those are model values below the surface (the extrapolated ones differ a lot by model: 0.8 kt HRDPS against 5 kt HRRR at the same moment). Any Lead altitude from 1,604 ft up to the 925 hPa level (2,356 ft, about 460 ft above the field) blends one below-ground number: on the ramp the line reads "wind 290/8 at 1,900 ft" (18:19Z, Lead stationary at 1,875 ft). The 925 hPa level at 2,356 ft and higher is fine. D176 says "no guessing below the model's lowest level"; the lowest level here is below the ground, so the promise is not kept for take-off and landing. Question for Dad: does he want a model wind for the roll, the circuit's low pass and landing, where crosswind matters? Recommendation: do not show a model wind while Lead is below the 925 hPa level's height (say "below 2,400 ft: see the METAR"), or add `wind_speed_10m` and `wind_direction_10m` to the same request (no extra call) and blend from the field up. The first is a two-line change. Known: No. Missing test: `tests/unit/debrief/weather-winds.test.js` using the real-shaped `fixtures/live-*.json` (add them to `tests/fixtures/`): `windTextAt` at the field elevation plus 100 ft does not report a wind (or reports the 10 m wind).
- **W6 (Low). Weather menu layout.** The new "Wind model" select truncates its text ("HRDPS (Canada, fro"), and the menu now is about 430 px wide and 310 px tall, covering the whole top of the Formation card, which includes the Lead line the wind is for (`/mnt/project-files/verification/shots/debrief-2/21-winds-line.png`). This is L3 and L4 unchanged, plus the truncated select. Missing test: as L3 and L4 in the earlier report; add "select text is not clipped (scrollWidth is at most clientWidth)".
- **W7 (note, not built).** Wind arrows on the map are todo 12e-2, not built: not a bug.
- **Test coverage note.** The repo's e2e reply is synthetic (7 levels, one wind at every level); the code asks for 9 levels. Add `fixtures/live-*.json` as unit fixtures so a change to Open-Meteo's shape is caught: `tests/unit/debrief/weather-winds.test.js`: `readWinds` on the real reply gives 48 hours x 9 levels, no gaps. The repo's 8 wind unit tests all pass (`node --test tests/unit/debrief/weather-winds.test.js`: 8 pass, 0 fail).

## 3. Earlier findings: status at 8e7cafb

Method: same example flight and same times as the earlier report, re-run through `s/r1.mjs`, `s/r2.mjs`, `s/r3.mjs`.

| ID | Status | What I read now |
|---|---|---|
| M1 | Still there, not fixed. The logged calls M1(a), M1(b) (rows dated 10:30, "next Debrief PR") are not merged. | Start: "Lead 0 kt est. IAS, G --, SLOW (target 220 kt, low block)" beside "(Lead not moving)". 19:19:25Z "#2 TIGHT by 3,955 ft, AFT by 19 degrees" (same numbers). 19:44:06Z "Lead 237 kt est. IAS, FAST (target 220 kt, low block)". Sampling every 60 s with Lead above 100 kt: 174 of 203 wingman readings TIGHT (86%). |
| M2 | Still there. Logged fix M2 not merged. | #2 at start+1676 to +1688: bank 5 left, 35 right, 0, 23 left, 4 right, 2 left, 3 left (G 1.67), 80 right (G 1.85), 0, 64 left, 0, 0, 14 left: identical to the earlier report. |
| M3 | Still there. No logged fix for it. | 3D at 19:00:04Z: #2 drawn with "bank 0, pitch 0" and "1,374 ft above datum" while More detail says "GPS gap" (`/mnt/project-files/verification/shots/debrief-2/30-3d-gap-t41.png`). |
| M4 | Still there. Logged fix D182 not merged. | start+2089: "G 8.29 est., pitch -1, bank 10 left est." |
| M5 | Unchanged (PJ2 still with Patrick). | #3 at +28:13 "bank 33 right recorded"; #4 +31:13 "12 right recorded"; #4 +40:13 "18 right recorded". |
| L1 | Still there. | Route names "TAC NAV 2, TAC NAV 3, TAC test North, TAC test South, TACNAV 1, TACNAV 4". |
| L2 | Still there. | 3D labels collide (`/mnt/project-files/verification/shots/debrief-2/30-3d-gap-t41.png`: "1,374 ft above datum" over "bank 3 L, pitch +8"). |
| L3 | Still there. | Satellite checkbox above its label (`/mnt/project-files/verification/shots/debrief-2/21-winds-line.png`). |
| L4 | Still there and the menu is larger. | See W6. |
| L5 | Still there. | DFP Name and Note background rgb(59,59,59) with a 2px inset border, against the dark rgb(3,8,13) of the number boxes (`/mnt/project-files/verification/shots/debrief-2/40-dfp-edit.png`). |
| L6 | Partly rejected earlier; the box stays invalid-marked. | See S1. |
| L7 | Still there and now also for the wind (W5). | |
| L8, L9, L10 | Not re-run. No commit since 94b00a1 touched the map tiles, the EM chart or the 3D scene. | |
| L11 | Still there. | Focused map canvas; Shift+arrows and arrows change nothing in the view. |
| L12 | Still there. | Max zoom shows an empty map (`/mnt/project-files/verification/shots/debrief-2/41-zoom-max.png`). |
| L13 | Still there. | WebGL off: 3 console errors from `THREE.WebGLRenderer`. |

`git diff 94b00a1..HEAD` shows `src/core/standards.js` and `t6-performance.js`/`tennis.js` changed; the Debrief numbers I read at the four earlier times are identical to the earlier report (range, TIGHT values, Lead line), so no flight-math regression.

## 4. Pilot judgement items (with recommendations)

- **PJ-W3. A wind that steps at the hour, or blends in time?** Recommendation: blend linearly in time between the hour at or before and the next hour (same vector method). No extra requests. Owner may act without waiting.
- **PJ-W4. A model wind for take-off and landing?** The model levels do not reach the ground here (950 hPa is under the field). Recommendation: below the 925 hPa level's height (about 2,400 ft at Moose Jaw) show "see the METAR" instead of a blended number; keep the model wind from there up. If Dad wants ground wind from the model, add the 10 m wind to the same request.

## 5. Decision log check

`/mnt/project-files/logs/decisions-for-review.md` rows for the Debrief:
- D176 (winds: HRDPS default, one point mid-flight, hour at or before, 950-300 hPa): matches the code (checked). Does not contradict a manual or the spec. Point out W4: "no guessing below the model's lowest level" is not met because the lowest level (950 hPa) is under the ground at Moose Jaw; and the log's "about 1,800 ft" for 950 hPa is about 1,600 ft.
- D182 (est. G unknown near a gap and above 7 G): consistent with the manuals index (V-n symmetric limit +7 G); pending merge.
- Rows dated 10:30 for M1(a), M1(b), M2: consistent with Gen Book p.12 blocks (6,000 to 10,000 ft and 10,500 to 15,500 ft) and the SMM sweep default; pending merge.
None contradicts the SMM, manuals or the spec. Note: the flag "low block top 10,250 ft" is Patrick's, not in the manuals (as before).

## 6. Missing tests, all in one list

| Finding | Test that should exist |
|---|---|
| W1 | `tests/unit/debrief/weather-winds.test.js`: `windTextAt` output has "kt", "true" and "model". |
| W2 | `tests/e2e/debrief.spec.js` winds test: `.lead-wind` neutral colour, own line. |
| W3 | `tests/unit/debrief/weather-winds.test.js`: half past the hour is the midpoint of two model hours (if adopted). |
| W4 | `tests/unit/debrief/weather-winds.test.js` with real-shaped fixtures: no model wind below the 925 hPa height (or 10 m wind used). |
| W5 | feed test: 500 and HTML answers do not say "connection". |
| W6 | `tests/e2e/debrief.spec.js`: no clipped select text; Weather menu does not cover the Formation card. |
| S1 | `tests/e2e/debrief.spec.js` standards test: refusal message names the box it sits under; only one refusal message at a time. |
| Real reply shape | `tests/unit/debrief/weather-winds.test.js`: `readWinds` on `fixtures/live-*.json`: 48 hours x 9 levels. |

## Files

- Findings: `/tmp/claude-0/-home-user-Dads-debreif/6ddc387e-27fc-5b5c-b107-4621f1ad06d7/scratchpad/findings/debrief/recheck-182-186.md`
- Shots: `/tmp/claude-0/-home-user-Dads-debreif/6ddc387e-27fc-5b5c-b107-4621f1ad06d7/scratchpad//mnt/project-files/verification/shots/debrief-2/` (01-closed, 02-open-1440, 03-all-off, 10/11/12 open-menu layouts, 20-winds-on, 21-winds-line, 30-3d-gap-t41, 40-dfp-edit, 41-zoom-max)
- Fixtures: `/tmp/claude-0/-home-user-Dads-debreif/6ddc387e-27fc-5b5c-b107-4621f1ad06d7/scratchpad/findings/debrief/fixtures/`

## Thread check (10:40Z)
- W1 confirmed in code: winds.js windWords() returns "280/38" (no °T, no kt) and the Lead line text (winds.js ~line 140) has no "model". Open-Meteo directions are true.
- W4 confirmed: WIND_LEVELS_HPA starts at 950 hPa (winds.js:25), so ramp-level readings blend with a level below the field.
- Recommendations for the Debrief thread (go ahead; W3/W4 log for review): (1) W1 wording "model wind 280°T/38 kt at 12,600 ft (HRDPS 18Z, Open-Meteo)"; (2) W2 own neutral line; (3) W3 blend linearly between model hours, no extra requests; (4) W4 below the 925 hPa height say "see the METAR" (or add the 10 m wind to the same request); (5) W5 error wording for 500/HTML replies.

## Re-check after #199 (3a781a0), 11:15Z
- W1 FIXED: line reads "model wind 270°T/25 kt at 8,500 ft (... Open-Meteo)" (winds.js windWords/line builder).
- W3 FIXED: blended by time between the hour at or before t and the next (end_date extended one hour).
- W4 FIXED: below the lowest level left above ground the line says "below the model's lowest level: see the METAR" (D176).
- W5 FIXED: only a missing answer blames the connection; server errors say so.
- W2 own line: per the merge note; not re-screenshotted.
- Wind unit tests 21 pass. S1 (settings refusals) reported fixed in the same PR.
