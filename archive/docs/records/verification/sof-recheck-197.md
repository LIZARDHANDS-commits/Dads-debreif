# SOF #197 recheck (caution banner, waves, 24-hour timeline; AF-1 and SOF-01 fixes)

Checker: independent sub-agent. Build of main 3ae20d8 (PR #197) in `wt-sof`, served with `vite preview` on port 4307, Chromium via Playwright at 1440x900 unless stated. MET Norway and Datamask served with `page.route` from the samples in `/mnt/project-files/wx-sources/samples/` and hand-made METAR/TAF text; `page.clock.install` for simulated time. Nothing pushed or edited in the repo. Scripts: `findings/scripts/sof2/*.mjs` (lib.mjs, af1, sof01, sof01b, ban, det, waves1, waves2, br, tl1, tl2, clip, clip2, lay, kb, kb2, tz, time1 to time3, wake, mid). Screenshots: `/mnt/project-files/verification/shots/sof-2/`.
Authorities: SPEC-sof (approved), tasks/sof, `weather-and-limits-numbers.md` (Gen Book p.7 to p.10, refs only), decisions D57 to D81, D111, D220 to D224.

Repo tests as shipped: `node --test tests/unit/sof/*.test.js` 563 pass, 0 fail; `playwright test tests/e2e/sof.spec.js` 56 pass. So every finding below is a gap those tests do not cover.

## Summary

| Severity | Count | IDs |
|---|---|---|
| High | 0 | |
| Medium | 4 | R1, R2, R3 (PILOT JUDGEMENT), R5 |
| Low | 7 | R4 (PJ), R6, R7, R8, R9, R10, R11 (PJ) |
| Not built (not bugs) | 4 | see end |

Top 5:
1. R1 SOF-01 is fixed for dangerous weather (TS/CB) but not for below-limit TAF hits tied to a wave: a fog TEMPO that ended 6 h ago still raises "Below limits" all day.
2. R2 AF-1's header part was not done: the bar still says "Weather just now ✓" when every report on screen is Unknown/stale (11 h to 34 h old).
3. R3 With no wave entered (the default), a forecast below the home limits (e.g. TEMPO 1SM BR OVC003 in 3 h) raises nothing on the banner, only the timeline hatch.
4. R5 Timeline piece labels are cut off: "TEMPO YLO1 below" reads "TEMPO YLO1 b" on 2 h pieces at 1280 and 1366, and "TEMPO YLO" on 1 h pieces even at 1920; the word "below" (the non-colour signal) is lost.
5. R7 to R11 small wording and validation items (equal takeoff/landing = 24 h wave, raw TAF codes in the hover card, 3 banner lines per foggy METAR).

## AF-1 (stale METAR): claimed fix VERIFIED, header wording NOT done

Passed (af1.mjs, shots `af1-a-stale.png`, `af1-b-closed.png`, `af1-c-closed-past.png`, `af1-d-closed-ts.png`):
- Fresh CYMJ at 18:42Z, others 8 h 42 min old, VFR/BLU: stale CYQR reads `? Unknown: report is 8 h 42 min old`, class `level-unknown is-stale`, chips VFR and BLU grey (rgb 155,184,198) with their words kept, red `STALE: 8 h 42 min old` note. Fresh CYMJ keeps `✓ Within limits`, green VFR.
- Stale and below (CYYN 1/4SM FG VV001): stays `▼ Below limits: CEILING 100 FT < 600 FT, VIS 1/4 SM < 2 SM (STALE report)`, red card edge. Stale and at the limit (CYXE 2SM BKN006, 600-2): `● At the limit ... (STALE report)`.
- Boundary (time1.mjs): METAR 1830Z reads within limits at 1 h 14 min and flips to Unknown at 1 h 15 min, matching D67's 75 min.
- CYMJ "last observation": METAR with `LAST OBS/NXT 011000Z` at 01:55Z (88 min old) reads `✓ Within limits at last observation (field closed until 1000Z)`, note `No obs until 1000Z`, chips grey, card edge grey. Same report at 10:30Z on 1 Oct (NXT passed) reads `? Unknown: report is 1 d 10 h old`. A closed field's last obs with VCTS still raises `Caution: CYMJ METAR 0027Z: THUNDERSTORM / SEVERE WX (VCTS) (STALE report)`.
- Stale caution lines on the banner are marked `(STALE report)`.

### R2 (Medium) The header still says "Weather just now ✓" over a screen of stale reports (AF-1 header wording not done)
- Where: SOF bar `.sof-feed`.
- Steps: af1 scenario C (now 10:30Z 1 Oct, all four METARs 1 d 9 h old) or time3 "TAF expired" (06:26Z, METAR 11 h 56 min, TAF ended 26 min ago).
- Expected: the app-frame audit recommendation (AF-1, item 3) was "Feeds answered just now; newest report is N h old"; SPEC-sof 312 "never show a stale one as current". The green tick is the fetch time, not the data age.
- Actual: `Weather just now ✓` (green tick) with every card `? Unknown`. Decision D220 does not mention the header.
- Screenshot: `/mnt/project-files/verification/shots/sof-2/af1-c-closed-past.png`, `/mnt/project-files/verification/shots/sof-2/time3-expired.png`.
- Known/planned: no.
- Missing test: `tests/e2e/sof.spec.js`: "when every METAR is stale the feed status names the age of the newest report and has no bare tick". Also `tests/unit/sof/screen-model.test.js`: feed status wording from the newest report's age.
- Recommendation: `Feeds answered just now; newest METAR 1 d 9 h old ⚠` when the newest METAR is stale (keep the source and next-try text in the hover).

### R6 (Low) Chips go grey for every stale METAR, D220 says below and at-limit "stay as they are"
- Actual: stale below (CYYN) shows LIFR and RED chips grey; stale at-limit shows IFR and YLO1 grey. The result line and card edge do stay red and amber.
- Recommendation: keep it (safe side, grey means stale) and correct the wording of D220 to "result line and edge stay; chips grey". Missing test: `tests/unit/sof/cards.test.js` pinning it either way.
- Note: `✓` stays beside "Within limits at last observation" for a closed field, even 9 h after that observation. The words carry it; PILOT JUDGEMENT recommendation keep (as the earlier check said).

## SOF-01 (banner window): claimed fix VERIFIED for cautions, INCOMPLETE for wave hits

Passed (sof01.mjs, sof01b.mjs; home CYMJ TEMPO TSRA BKN040CB, now 22:00Z unless stated):
- Ended 3 h ago: no banner. Ended 13 h ago: no banner.
- Ended 30 min ago (now 21:30Z) and 59 min ago (21:59Z): TSRA and CB/TCU lines listed. Ended 61 min ago (22:01Z): gone. The cut is 1 h.
- In progress: listed. Starts in 11 h and 12.5 h (valid TAF): listed. Starts in 14 h: not listed.
- FM group with TS superseded 3 h ago, PROB30 TSRA ended 3 h ago, alternate CYQR TEMPO TS ended 3 h ago: none listed. A prevailing FM group with TS that began 5 h ago and continues: listed once.
- Across home midnight (mid.mjs): TS ended at 00:00 CST, now 00:15 CST: listed; ended 70 min ago: gone.
- Acknowledge then the same weather in the next report (time1.mjs): stays acknowledged; focus goes to the Waves heading when the banner empties; banner off keeps cards listing cautions; banner-off/on does not re-raise.

### R1 (Medium) A below-limit TAF hit tied to a wave is never cut, so an old wave's fog still raises the banner
- Where: `src/modules/sof/cautions.js` `cautionList` (the `notEndedBefore` cut is `c.level === 'caution'` only); `banner-model.js` `tafInputs` adds each wave's `hits`.
- Steps (sof01.mjs j): home TAF TEMPO 2914/2916 `1/2SM FG VV002`, wave 08:00 to 09:30 CST (1400Z to 1530Z), now 22:00Z (16:00 CST).
- Expected: same reasoning as SOF-01 and D221 ("a forecast that is over is not something to act on"). The wave chip and timeline keep the elapsed hit; the banner should not.
- Actual: `▼ Below limits: CYMJ TAF TEMPO 29/14Z-29/16Z: CEILING 200 FT < 2000 FT` and the VIS line, 6 h after the period ended, until local midnight. Without the wave (k) the banner is empty, so the result depends on whether a wave was typed. Same for l (fog 17Z to 18Z, wave 1000 to 1130 CST, now 22Z). Screenshot `/mnt/project-files/verification/shots/sof-2/sof01-j-wave-hit-elapsed.png`.
- Known/planned: no; D221 says "TAF cautions", the code comment says "dangerous weather, not limits".
- Missing test: `tests/unit/sof/cautions.test.js`: "a below-limits TAF hit that ended more than an hour before now is not in the banner list" (fails today); `tests/e2e/sof.spec.js`: "an earlier wave's ended fog TEMPO does not raise the banner".
- Recommendation (owner acts on it): apply the same `notEndedBefore` cut to level `below` (cut after the join, same 1 h). Keep the hit in the wave's detail list.

## Banner cautions against the manuals (ban.mjs, det.mjs, mid.mjs)

Passed:
- TS/CB and the rest of D58 in METARs: VCTS, TSRA and BKN040CB, +FC ("THUNDERSTORM / SEVERE WX (+FC)"), GR, FZRA all raise a `Caution:` line in wx's own words. In TAFs: TEMPO TSRA, CB, PROB30 TSRA and TEMPO FG (no wave) raise `Caution: ... SIGNIFICANT WX (FG)`.
- Home trigger (Gen Book p.7, D111, wave = takeoff to landing + 1 h, wave 1300 to 1500 CST = 1900Z to 2200Z, ceiling 2500 ft from 20Z): Local (MTCA) gives `No alternate needed`, no banner line; Cross-country gives `ALTERNATE REQUIRED`, `CYMJ CEILING 2500 FT < 3000 FT from 20Z` and one banner line. Exactly 3000 ft (XC) and exactly 2000 ft (Local) read `At the limit`, no banner; 1900 ft Local is below with a banner line.
- Alternate suitability (600-2 default, landing +/- 60 min): CYQR TEMPO BKN005 at landing reads `Below minima ... CEILING 500 FT < 600 FT from 20Z`, "2 of 3 alternates meet", and the same line on the CYQR card; with home also requiring an alternate both banner lines appear.
- Wave times: Moose Jaw CST (UTC-6): 1300 to 1500 CST = 1900Z to 2100Z; 2200 to 0100 CST = 0400Z to 0700Z next day ("Lands the next day"); evening wave 1800 to 2030 CST = 0000Z to 0230Z is in the Zulu-first timeline.
- Crosswind: a 09030G40KT beam wind at CYMJ raises nothing (FF20 runway data and FF21 are not built; not a bug, see the end).

### R3 (Medium, PILOT JUDGEMENT) A forecast below the home limits with no wave entered raises no banner
- Where: `cautions.js` `tafCautionsForBanner` ("Pieces below the limits are not taken here; they stay tied to the wave windows"). D222 makes new waves start blank, so by default the banner never warns of low ceiling or visibility.
- Steps (br.mjs): no waves; home TAF `TEMPO 2921/2923 1SM BR OVC003`, or `FM292100 ... 1SM BR OVC003`, now 18:00Z.
- Expected: SPEC-sof line 117 lists "a report below its limits" as a caution; the timeline shows the piece `TEMPO YLO2 below` hatched, so the screen already says it is below.
- Actual: banner empty (fog with the letters FG does raise, because FG is a D58 caution). A ceiling or visibility drop without FG/TS/CB is silent.
- PILOT JUDGEMENT question: should the banner warn of forecast home weather below the home limits within the next 12 h when no wave covers it? Recommendation: yes, home only, using the same window and 1 h cut; alternates stay wave-tied. Acknowledge works as now.
- Missing test: `tests/unit/sof/cautions.test.js`: "a home TAF piece below the limits inside the banner window is listed with no waves"; `tests/e2e/sof.spec.js`: banner with an empty plan and a low-ceiling TAF.

### R4 (Low, PILOT JUDGEMENT) An alternate below its minima raises a red "Below limits" banner line even when no alternate is needed
- Steps: ban.mjs C: home fine (`No alternate needed`), CYQR TEMPO BKN005 at landing. Banner `Below limits: CYQR TAF TEMPO 29/20Z-29/22Z: CEILING 500 FT < 600 FT`, wording identical to a home line (it does not say alternate or the 600-2 minima).
- Question: is an unusable alternate a caution when it is not needed? Gen Book p.7 minima apply only when an alternate is required. Recommendation: keep it (a SOF wants to know the alternate has gone), but word it `ALT CYQR below alternate minima 600-2`, and rank it below the home lines.
- Missing test: `tests/unit/sof/banner-model.test.js`: alternate lines name "alternate" and the minima.

### R11 (Low, PILOT JUDGEMENT) The chip counts an alternate as meeting while it has thunderstorms forecast at landing
- Steps: ban.mjs D: CYQR TEMPO 2920/2922 `4SM TSRA BKN040CB`, landing 21Z. Chip `3 of 3 alternates meet`; detail shows `Caution: CYQR TEMPO THUNDERSTORM / SEVERE WX (TSRA), CB/TCU`; banner shows the two caution lines. Gen Book p.7 minima (ceiling and visibility) do not mention thunderstorms, so "meets" follows the rule.
- Recommendation: keep the count, add "(1 with caution)" on the chip so the tick alone does not read all-clear. Missing test: `tests/unit/sof/waves-view-model.test.js`.

## Waves (waves1.mjs, waves2.mjs; shots `waves-ok.png`, `waves-req.png`, `lay-*.png`)

Passed:
- Chip wording for all states, each with a symbol plus words (colour is an extra): `✓ No alternate needed`, `⚠ ALTERNATE REQUIRED` with first reason and time (`CYMJ CEILING 1500 FT < 2000 FT from 20Z`), `● At the limit`, `? TAF doesn't cover the wave` (with valid-to and window end), `? No TAF` (missing and cancelled), `⚠ ALTERNATE REQUIRED (TAF doesn't cover the whole wave)`; alternates count `N of 3 alternates meet`. Pressing the chip (Enter or Space) opens the hit list and pressing again closes it. The chip has a hidden name span ("W1:") for screen readers.
- Header `W1 1300-1500 CST (1900-2100Z)`, zone shown (`Times are home local time (CST)`), blank waves say `Takeoff time not set`, name limited to 12 characters, 5 waves then Add is `aria-disabled` with "Up to 5 waves", plan survives reload, a Tomorrow chosen on an earlier day reads as Today next day (D222).
- Failure/stale over simulated time (time2.mjs): chip adds `(TAF refresh failed, showing the last one)` and after the TAF ends `(STALE TAF, valid period ended 26 min ago)` with `?`; timeline rows say the same.

### R7 (Low) Equal takeoff and landing is accepted as a 24 h wave
- Steps: set landing = takeoff = 08:00. Note reads `Lands the next day`; chip `? TAF doesn't cover the wave` for a 24 h window. V6's rule is landing earlier than takeoff = next day; equal is a typo more often than a 24 h flight.
- Recommendation: refuse equal times with `Landing must be after takeoff`. Missing test: `tests/unit/sof/waves-view-model.test.js`: takeoff equals landing.

## 24-hour timeline (tl1, tl2, clip, clip2, kb2, tz, time3; shots `tl1-full.png`, `crop-tl-1280.png`, `crop-tl-1h-1920.png`, `tz-local-first.png`)

Passed:
- Day is the home local day (title `Tue 29 Sep (CST)`), axis Zulu row first, CST row second, both labelled (`Zulu`, `CST`), day numbers on the first and midnight ticks; `Local first` in app Settings swaps the rows. The hover or focus card shows both `Zulu 2200-0000, local 16:00-18:00 CST`.
- Rows follow wx: colours and `below` agree with the wave hits for the same airfield (home TEMPO 2SM BR OVC008 = YLO1 below Local; FM 1/2SM FG VV002 = AMB below; CYQR TEMPO BKN005 = YLO1 below 600-2; CYXE PROB30 2SM TSRA BKN030CB = YLO1 not below).
- Now line: `left` 70.8336% at 23:00Z (17:00 CST), 0% at 06:00Z, 25.0% at 12:00Z, 99.93% at 05:59Z next day, 52.92% at 18:42Z; moves 0.0694% per minute. Its label always reads Zulu (`Now 2300Z`).
- Wave bands with `L` and `+1` marks; W3 (evening, 0000Z to 0230Z) drawn; METAR mark; keyboard: one tab stop, arrows step across pieces and rows, hover shows the same card; the panel toggles by keyboard.
- Expired TAF or failed feed: rows blank with `(STALE TAF, valid period ended N min ago)` / `(TAF refresh failed, showing the last one)`.

### R5 (Medium) Timeline piece labels are cut off, hiding "below"
- Where: `.sof-tl-piece-label` (fixed 124 px wide) inside pieces whose width is proportional to duration.
- Steps: TEMPO 22Z to 00Z, hatched below, at 1280 and 1366; TEMPO 02Z to 03Z at 1920 (clip.mjs, clip2.mjs).
- Expected: SPEC-sof 179: a piece below the limits has a hatch and `below` in its label.
- Actual: piece 91 px (1280) or 98 px (1366) wide for a 124 px label: reads `TEMPO YLO1 b`, hatch mostly hidden under the label; a 1 h piece (49 px at 1366, 72 px at 1920) reads `TEMPO YLO` at any size. The full text is in the aria-label and hover, so screen-reader users lose nothing; sighted users lose the non-colour signal. The now line also runs through label text.
- Screenshot: `/mnt/project-files/verification/shots/sof-2/crop-tl-1280.png`, `/mnt/project-files/verification/shots/sof-2/crop-tl-1h-1920.png`.
- Known/planned: no. Existing "nothing overlaps or is cut off" e2e checks controls only.
- Missing test: `tests/e2e/sof.spec.js` at 1280x800 and 1366x768: "no timeline piece label is wider than its piece unless it is shortened on purpose (label scrollWidth <= piece width)".
- Recommendation: for narrow pieces show a short label (`T YLO1 ▼`, or the hatch alone plus a `▼` symbol) and keep the long text in the card.

### R8 (Low) The hover/focus card uses raw TAF codes and unclear 24 h ranges
- Steps: focus any piece. `Conditions: 25010KT P6SM SCT050` (SPEC-sof 181: "conditions in words"). A 24 h piece reads `Zulu 1800-1800, local 12:00-12:00 CST`.
- Recommendation: `wind 250 at 10 kt, visibility more than 6 SM, scattered cloud at 5,000 ft`; show day numbers on the times. Missing test: `tests/unit/sof/timeline-view-model.test.js` (card text).

## Layout, axe, keyboard, console

- 1280x800, 1366x768, 1920x1080 with 5 banner lines, 3 waves, one hit list open and the timeline open (lay.mjs): no horizontal scroll, no control overlapping another, no clipped controls; page 2130 / 2086 / 2048 px tall (the banner alone is about 360 px at 5 lines, pushing the cards below the fold; spec says it pushes down). Shots `lay-1280x800.png`, `lay-1366x768.png`, `lay-1920x1080.png`. My text-overlap scan flagged only the visually hidden "Flight category" span inside badges (false positive).
- axe (wcag2a, 2aa, 21aa, and all rules) at 1366x768 in that state: 0 violations.
- Keyboard: Tab order banner Acknowledge buttons, Acknowledge all, waves, cards, timeline (single stop), footer; Enter on Acknowledge keeps focus on the next line; Space on Acknowledge all sends focus to the Waves heading (D224); wave chip Enter and Space toggle the list; Add wave/Remove keep focus.
- Console errors and warnings: none in any run (about 40 page loads).

## Auto refresh and stale warnings over simulated time (time1, time2, time3, wake)

- Rounds every 5 min, 2 requests per round (MET Norway METAR and TAF; Datamask only when MET Norway fails). Ages tick (`METAR 1830Z (27 min ago)` at 18:57). Bar says `Weather 2 min ago ✓` and so on.
- New METAR with VCTS at the next round: banner line appears; acknowledged; a later report with the same weather is not re-raised.
- Feeds down: `Weather Failed, showing 6 min old ⚠` and the alert `Weather feeds are not answering (... both failed at 1847Z). Showing the last reports, 6 min old.`; cards keep reports with `Last refresh failed (tried 1847Z)`; at 20:04 the METAR reads `STALE: 1 h 34 min old` and `Unknown`; Refresh recovers. Wake after a 3 h jump with the tab visible again: asks at once and redraws.
- Fresh: the alert role sits on the banner for one render (`role=alert` removed by the next 15 s tick). I cannot check screen-reader announcement here (R10 below).

### R9 (Low) One foggy report or forecast gives 2 to 3 banner lines
- A METAR `1/4SM FG VV001` gives `Below limits CEILING`, `Below limits VIS` and `Caution FG` (3 lines); a foggy home TAF group gives 3 more. Recommendation: one line per airfield, source and group with all reasons joined (`CEILING 100 FT < 600 FT; VIS 1/4 SM < 2 SM; FG`), as the wave detail already does. Missing test: `tests/unit/sof/banner-model.test.js`.

### R10 (Low) role="alert" is set for only one render
- Not reproduced as a fault, but untested: `banner-view.js` sets `role="alert"` when there are new keys and removes it at the next render. Some screen readers announce only when the element appears; setting a role on an already visible section may not be read. Recommendation: put `role="alert"` on a small always-present live region and write the new line's words into it. Missing test: `tests/e2e/sof.spec.js`: a caution arriving while the banner is already visible is placed in a live region (`aria-live` content changes) and an unchanged refresh changes nothing.

## Logged decisions checked (`/mnt/project-files/logs/decisions-for-review.md`, SOF rows D220 to D224)

- D220 (stale to Unknown): consistent with SPEC-sof 312 and Gen Book use; behaviour matches except chip greying (R6) and the header (R2).
- D221 (1 h cut): consistent with the SOF-01 recommendation; not a manual matter. It covers cautions only (R1).
- D222 (blank wave times, list closed, Tomorrow expires, 12 characters, 5 waves): no contradiction with Gen Book p.7 (window = takeoff to landing + 1 h is used). See R3 for the effect of blank defaults on the banner.
- D223 (chip "?" for stale/failed TAF): matches; verified.
- D224 (banner on by default, focus to Waves heading, timeline open, Zulu first): matches; verified.
- D111 (Local 2000/3 default, Cross-country 3000/3) matches Gen Book p.7 and works on the chip and banner. Nothing logged contradicts the manuals or the spec.
- Still open in `weather-and-limits-numbers.md`: the destination trigger row was updated; other rows on crosswind and per-activity limits remain "not built".

## Not built (per plan, not bugs)

1. Crosswind (FF21, needs runway data FF20): no wind check on card, chip or banner. 2. Per-activity limits (low level 1,000/3 to 2,000/5; formation crosswind 15/10/5) and take-off and filing minima. 3. GFA alternate (no-TAF rule). 4. Map, radar, lightning, traffic layer and the extras (tasks 6 to 8); banner has the `extra` hook only.

## Unsure

- Screen-reader announcement of the banner (R10) cannot be exercised here.
- Whether equal takeoff and landing (R7) matches V6's exact behaviour was not checked against V6.
- Chrome shows time boxes in 12-hour form (`01:00 PM`) with the en-US locale; the values are 24-hour. Not a fault.

## Audit (second checker, Opus, ~11:40Z; 563 SOF unit tests pass)

| ID | Verdict | Severity | Fix or decision | Test |
|---|---|---|---|---|
| R1 old wave's below-limit TAF lines never cut | CONFIRMED (TEMPO FG from an 08:00-09:30 CST wave still on the banner at 23:30 CST; same TEMPO's FG caution is cut but its below lines stay) | Medium | STRAIGHT FIX inside D221 (spec's "caution" includes a report below limits): drop `c.level === 'caution' &&` in cautions.js:182 | cautions.test.js + a banner-model.test.js case through buildBanner + tafInputs with a real wave (line 630's test uses TS only) |
| R2 header "Weather just now ✓" over stale reports | CONFIRMED; follows the spec's feed-status wording | Low | Decision row (spec wording). Catch: weather.js newestAt is fetch time, not observation time; use the cards' METAR observation times. Lighter option: keep the tick, add "newest METAR observed N h ago" when all are stale | screen-model.test.js with observation times |
| R3 no banner for home forecast below limits with no wave | CONFIRMED; deliberate since #158 (cautions.test.js:490) but never logged | Medium, pilot judgement | Decision row: recommend home field only, same window and 1 h cut; rewrite test 490 | Yes |
| R5 timeline labels clip "below" | CONFIRMED (also "AMB belo") | Medium | Straight fix: put ▼/below first or short form under a width | every .sof-tl-piece scrollWidth <= clientWidth+1 at 1280/1366 with 1 h and 2 h TEMPO |
| R6 stale chips grey | PARTLY REJECTED: at-limit edge also greys; only below keeps red | Low | Reword D220: "result line stays; below keeps its red edge; at-limit edge and all chips grey" | pin in cards.test.js |
| R11 "3 of 3 meet" with TS at landing | CONFIRMED; correct vs Gen Book p.7 minima | Low, pilot judgement | Decision row: add "(1 with caution)" | waves-view-model.test.js |
| R7 equal takeoff/landing accepted | Supported: waves.js:110 `land <= take` contradicts SPEC-sof "earlier than takeoff" wording | Low | Straight fix | |
