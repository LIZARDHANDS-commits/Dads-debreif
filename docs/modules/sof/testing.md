# SOF Dashboard: testing and sign-off

The whole-tool testing policy in `../../TESTING.md` applies. This file adds the module's own rules, how each of its requirements is checked, its sign-off checklist, and what happens to each of its test files.

Sources in this file point to where things were on 4 Oct 2026: `pf/` means the project files (`pf/`, private), and repo paths such as `docs/records/` or `specs/` are now under `archive/` (see `archive/README.md`).


Built on SOF-R1 to SOF-R28, ratified by Patrick on 4 Oct (`pf/reset/1-requirements/requirements.md`, "## SOF"), and the "Weather and limits mean" paragraph under them. The per-test keep, rewrite or retire marks are in the test register's SOF section.

**Today:** 27 unit files (796 tests, all pass) and two browser files (69 and 40 tests, all pass at `6283f38`; the every-button check on the SOF timed out once while the machine was busy and passed when run alone, `pf/reset/5-testing/browser-results-6283f38.md`). The SOF has no flight math, and its tests are mostly sound: they use real recorded reports as input, a simulated clock instead of real waiting, and say "can't tell" cases out loud. What needs work: four tests pin V6's "local + 6 h" wave times (`tests/unit/sof/waves.test.js:60`, `:70`, `:82`), an alternate with no approaches set is checked against 600-2 and can read "Meets minima" (three unit tests and `tests/e2e/sof.spec.js:672`) where SOF-R12 now asks for amber "Incomplete", one test fails if reading takes 50 ms (`tests/unit/sof/feeds.test.js:485-501`), the live-traffic relay tests leave with the relay (SOF-R17), and the screen-layout tests change with the one-screen rebuild (SOF-R19). Reading the METAR and TAF correctly (SOF-R6, SOF-R9) is proved in the shared weather tests (`tests/unit/wx/`), marked with the shared core.

## SOF rules on top of the whole-tool rules

- **S1. Real reports are input; the reading is the answer.** Recorded METARs, TAFs and map replies may be used as input. The expected answer comes from reading the report the way the Canadian rules say (Gen Book p.7, page reference only), worked out in the test, never from V6 or the code's own output (T3). Hand-written reports cover the edge cases (`1/2SM` in a TEMPO, a missing cloud group, a hostile report).
- **S2. Unknown is never good.** Every check of a state also checks the missing, old and failed cases: a missing ceiling reads unknown, a stale METAR never reads "within limits", a failed lightning picture reads "can't tell", never clear, and a failed refresh keeps the last report with its age (SOF-R5, SOF-R6, SOF-R16, SOF-R23). This is the SOF's main invariant (T1).
- **S3. Time rules are tested as rules, on a simulated clock (Q-T9, decided).** Report ages (METAR 75 min, TAF past its end, radar 20, lightning 40, cloud 60), the refresh every 5 minutes and the 30-minute lightning episode gap are rules about time by definition, so they are allowed under T2. They are starting values for Dad to confirm (SOF-Q8), so a test takes the number from the one place the code keeps it (for example `STALE_MS` at `src/modules/sof/feeds.js:30`) and checks just before and just after it. No test waits on the computer's clock or judges how long something took.
- **S4. Limits are settings with page references (T10).** The home trigger, the alternate minima, the alternate window and the wind numbers are settings. Tests check the call just under, at and just over whatever the setting holds (red below, yellow at the limit, SOF-R6), and that changing a setting changes the call. The default values are checked once against their page references (Gen Book p.7, p.8 and p.10; the orders named in SOF-R27), never against V6. Weather past a limit raises a caution; nothing stops.
- **S5. Words first, then colour.** Every state check reads the words or symbol, not only the colour (SOF-R7, SOF-R24). A marked group is checked against the raw report text. Report text only ever reaches the page as text.
- **S6. Matching wx is wiring, not proof.** Several SOF tests compare the screen's answer with the shared weather code's answer (cautions, timeline, waves, cards). They stay as wiring checks: they show the screen uses the weather code. Whether the weather code reads reports correctly is proved in the weather tests with hand-worked answers (T8).
- **S7. Time zones are named.** Wave and timeline tests name the zone (America/Regina for Moose Jaw, which keeps CST all year) and a fixed date. Clock-change tests use a zone that has one (America/Toronto, Europe/Paris) and say so when they skip because the machine's time-zone data has none that year (`tests/fixtures/sof/timeline-zones.js:42-52`). A skip is listed at sign-off.

Dad's open SOF questions (SOF-Q5 to SOF-Q8, SOF-Q12) are settings or named defaults under S3 and S4, so an answer changes a setting and at most the one test that names it.

## How each SOF requirement is checked

"Each change" means a unit test or one of the per-change browser checks in section 2 (smoke, layout, accessibility, buttons, leaving, offline). Checks that need the whole SOF browser files run at sign-off. "New" means no test checks it today; the test is written with the change that builds it and fails until then.

| Requirement | Automatic check | When | Hands-on checklist |
|---|---|---|---|
| SOF-R1 The desk screen answers the four questions | Covered by SOF-R4, SOF-R5, SOF-R11 and SOF-R15; the smoke test opens the screen with the bar, cards, waves and map | Each change | Enter today's waves and read the call and every airfield's weather without opening anything else |
| SOF-R2 Runs all day; nothing runs after leaving | Simulated clock: refresh every 5 minutes, waking from sleep refreshes when the last round is old, and after leaving no timer or request is left (S3) | Each change | Leave it open for an hour; ages move and new reports arrive |
| SOF-R3 Planning-aid line and credits | The "Not for flight planning" line and the credits are on the screen | Each change | |
| SOF-R4 One card per airfield, raw text, age, source, category in words, decoded line | Card words for fresh, stale and missing reports. New: the decoded line (for example "270/12G20, 2SM, 800 ft") worked out by hand from a hand-written METAR | Each change | One card matches the NAV CANADA weather site the same day |
| SOF-R5 Old, missing or failed data is never current | S2: a stale METAR reads unknown, not "within"; a failed refresh keeps the last report with its age; the failure line names the source and when it last worked | Each change | Network off, press Refresh |
| SOF-R6 Judged in words: red below, yellow at, unknown when missing | Weather tests and card tests: "Below limits: CEILING 400 FT < 600 FT", "At the limit" exactly on it, unknown with no cloud group | Each change | |
| SOF-R7 The words that trip a limit are marked | The marked group sits on the raw text's own words and the reason line names the same group (S5) | Each change | |
| SOF-R8 Dangerous weather raises a caution; information-only doesn't | VCTS raises a caution, VCSH is "Watch" only; an acknowledged caution stays quiet while the same weather is reported and returns after it clears and comes back (SOF-Q5 open with Dad) | Each change | |
| SOF-R9 The TAF is read the way a pilot reads it | Weather tests with hand-worked answers: a TEMPO `1/2SM FG` is below the home limits; a BECMG worsening still counts after its period; `2920 1/2SM` is half a mile; CB and TCU layers count. Marked with the shared core | Each change | |
| SOF-R10 Up to five waves in home local time | Landing earlier than takeoff is the next day; a 22:00 to 00:30 wave is kept and gets a call; the same takeoff and landing time is refused; an old date is never kept; the plan survives a reload | Each change | |
| SOF-R11 The alternate call in words, from the TAF | A TEMPO below 2000 ft over a wave reads ALTERNATE REQUIRED and names the group; switching to Cross-country changes the label and the call; there is no switch that flips the call by hand; default Local (MTCA) 2000/3 checked once against Gen Book p.7 (S4) | Each change | |
| SOF-R12 Each alternate against its own minima | Existing: own minima, several minima options, GNSS and no-IFR alternates use the visual descent. New: an airfield with approaches or landing minima not filled in reads amber "Incomplete", never "meets"; a PROB group is judged against the landing minima and a TEMPO against the alternate minima; a pre-filled alternate shows its "checked on" date; an approach marked out by NOTAM is not used for the day. The window round the landing time is a setting (SOF-Q6) | Each change | Dad or a current SOF checks the pre-filled minima against the current approach charts |
| SOF-R13 The 24-hour timeline | The pieces, hatching and labels match the TAF; waves are bands with landing + 1 h marks; Zulu or local row first. Focus kept while editing a wave is a browser check | Each change (unit); sign-off (browser) | |
| SOF-R14 The map: dots, rings, pan, zoom, Home; works with no network | Dots name ICAO and category in words; rings at 25 and 50 NM worked out from the latitude; with no network dots and rings still show and the map says it needs a connection. New: no two labels overlap at the default zoom (fails today) | Each change | |
| SOF-R15 Radar and lightning, each with its own time and age | Simulated clock: each picture's own layer time and age; STALE past its limit (S3); after two ECCC failures the backup takes over and says so | Each change | |
| SOF-R16 Lightning near home, never "clear" when it can't tell | Lightning inside the radius raises a caution with the distance; a failed or old picture says "can't tell"; a caution already up is kept, marked old, through a failed refresh; the radius is a setting, 20 NM to start (SOF-Q7) | Each change | |
| SOF-R17 Live traffic through ADS-B Exchange's map | The switch builds the address from numbers only and swaps the map area for their map and back. The relay layer's tests leave with the relay (future list) | Each change (unit); sign-off (browser) | |
| SOF-R18 Only the essentials at first | The smoke test: the bar, four cards and a closed settings menu, nothing optional on (`tests/e2e/sof.spec.js:115`) | Each change | Nothing on screen you don't need first |
| SOF-R19 One desk screen | New, written with the rebuild: at 1280 wide and at 1920 × 1080, with five cautions up, the waves, a card and the map are visible without scrolling, and nothing overlaps. Replaces "the banner pushes the screen down" (`tests/e2e/sof.spec.js:612`) | Each change (layout) | Look at it on a desk screen from across the room |
| SOF-R20 No dead controls | The every-button check on the SOF | Each change | Click every control once |
| SOF-R21 DTG, Zulu first, the home field's own zone | The DTG reads in the form "031842Z OCT 26" from the clock given; wave times in America/Regina are local + 6 h every day of the year because Regina keeps CST (S7); another home zone changes the wave labels | Each change | |
| SOF-R22 Home field and alternates are a setting | Set another home field: cards, map centre, rings, timeline and zone follow | Each change (unit); sign-off (browser) | |
| SOF-R23 Every service down; offline after one visit | Every feed blocked: the screen opens, names the failed feeds in words, keeps the last reports with their ages, no console errors | Each change (offline) | |
| SOF-R24 Not colour alone, keyboard, text only | S5; a report that looks like HTML shows as text; the accessibility scan; keyboard walks through the banner, waves and timeline | Each change (scan and unit); sign-off (keyboard walks) | Tab through the screen |
| SOF-R25 The SOF checklist is run and signed | No automatic check. `archive/docs/checklists/sof.md` is updated for the one-screen rebuild and run after it (SOF-Q13), the same day against NAV CANADA and V6 | Sign-off | The checklist itself |
| SOF-R26 The everyday extras | New: the Zulu and local clocks agree with the DTG; the radar loop steps through the last hour's pictures, each with its own time; tapping a card centres the map on that airfield; Other airfields and About open from buttons and start closed. The NATO chart, Large text and the links are on the future list and get no tests | Each change (unit); sign-off (browser) | |
| SOF-R27 Wind and crosswind | New: crosswind worked out by hand for each runway from the wind and the runway heading; amber just over 15 kt dry (10 wet, 5 icy), red just over 25 kt dry; a 30 kt wind or gust gives the warning and 35 kt the cease-flying caution; changing a setting changes the call; nothing stops past a limit (S4, T10) | Each change | Dad checks the numbers and their page references |
| SOF-R28 Extra map layers, off by default except radar coverage | Fresh map: radar, lightning and radar coverage on, the rest off; each turns on and off; label overlap as in SOF-R14 | Each change (unit); sign-off (browser) | |

**At SOF sign-off:** both SOF browser files in full, the hands-on checklist above and `archive/docs/checklists/sof.md`, and one look in real Safari. Sign-off comes after the one-screen rebuild (SOF-Q13).

**Live-traffic relay** went to the future list (SOF-Q9). Its tests leave with it: `tests/unit/sof/traffic.test.js`, the relay's own `tests/unit/relay/traffic.test.js`, the traffic-layer tests in `tests/unit/sof/map-loops.test.js`, the relay-address tests in `tests/unit/sof/settings-model.test.js` and the relay tests in `tests/e2e/sof-map.spec.js`. Until thread 7 archives the relay code they keep running.


## Sign-off checklist

Anyone can run it, in the real app, from the module's default start, on a laptop at 1280 wide, and send Patrick the result with the date, their name and the version shown on screen (`../../TESTING.md`, section 4). Anything not seen working is listed as unseen.

### From the ratified requirements (the hands-on column above)

- [ ] Enter today's waves and read the call and every airfield's weather without opening anything else (SOF-R1)
- [ ] Leave it open for an hour; ages move and new reports arrive (SOF-R2)
- [ ] One card matches the NAV CANADA weather site the same day (SOF-R4)
- [ ] Network off, press Refresh (SOF-R5)
- [ ] Dad or a current SOF checks the pre-filled minima against the current approach charts (SOF-R12)
- [ ] Nothing on screen you don't need first (SOF-R18)
- [ ] Look at it on a desk screen from across the room (SOF-R19)
- [ ] Click every control once (SOF-R20)
- [ ] Tab through the screen (SOF-R24)
- [ ] The checklist itself (SOF-R25)
- [ ] Dad checks the numbers and their page references (SOF-R27)

> The old checklist below was written before the reset. It is refreshed against the requirements above when the module's work resumes: lines that test V6 numbers or exact times are rewritten or dropped.

### Carried over from `archive/docs/checklists/sof.md`

#### Sign-off checklist: the SOF Dashboard

Anyone can run this in about twenty minutes, in any up-to-date browser on a desktop or laptop. Nothing needs installing. Tick each line. If one fails, use **Report a problem** in the app, say which line failed, and name your browser.

Link: https://lizardhands-commits.github.io/Dads-debreif/#/sof

This runs on the live weather, so what you see depends on today. Where a line needs a certain kind of weather (a closed field, lightning), it says what to do if today doesn't have it: tick "not today" and go on. A few lines use the limits in the **SOF settings** menu to make the screen show a caution on demand. Put them back afterwards (choose the **Local (MTCA)** trigger: 2000 ft and 3 SM).

Keep the NAV CANADA weather site open in another tab for the side-by-side line.

### The top, the cards and the limits

- [ ] The **SOF Dashboard** card on the home screen opens the screen. The bar shows the date-time group (for example 301842Z SEP 26), "Weather just now" (or a few minutes ago) with a tick, and **Refresh**. Press **Refresh**: it says "Refreshing" for a moment and the age goes back to "just now". Nothing covers anything else.
- [ ] There is a card for home (CYMJ, marked HOME) and one for each alternate. Each shows the flight category and NATO colour state as words on small chips, the METAR and TAF with their ages, and a result line such as "Within limits" with a tick. Compare one METAR with NAV CANADA's: the raw words are the same, and the age ("42 min ago") is right for the time in the report.
- [ ] Open **SOF settings** (closed at first). Set **Home ceiling below** to 10000 and **Home visibility below** to 10. The trigger shows Custom and the home card says "Below limits" with the reason in words (for example "CEILING 4500 FT < 10000 FT"). The words in the report that cause it are underlined and marked, and they agree with the reason. Leave it like this for the banner lines below.

### Old reports and closed fields

- [ ] A METAR more than 75 minutes old (a card that says **STALE** with how old it is, or wait until one does) has grey chips, and never says "Within limits" as if it were current: it says "Unknown" and the age. No stale card today: tick "not today".
- [ ] A field that is closed overnight (CYMJ does this: its METAR ends "LAST OBS/NXT" and a time): the card says "Within limits at last observation (field closed until" that time, with grey chips, and it does not say STALE. Not closed today: tick "not today".
- [ ] Switch the network off (airplane mode) and press **Refresh**. The bar says the weather failed and how old the reports on screen are, and a line under it says the weather feeds are not answering and names the sources. The cards keep the last reports, marked as old. Turn the network on and press **Refresh**: it recovers.

### The caution banner

- [ ] With the limits from above, a **NEW CAUTION** box shows above the waves. Each line names the airfield, METAR or TAF, and the reason in words, with the report's own words marked under it ("In the report:"). It has a symbol and words, not only a colour.
- [ ] Press **Acknowledge**: the box goes. Reload the page: it stays gone for the day. Set the ceiling and visibility back to normal (Local (MTCA)) and then to 10000 and 10 again: a caution that cleared and came back is new, and the box returns.
- [ ] In **SOF settings**, untick **Show the new-caution banner**. The box goes, the cards still show every weather caution, and the hint under the switch says lightning then shows only in the map's strip. Tick it again and put the limits back to Local (MTCA).

### Waves and the alternate call

- [ ] Press **Add wave**. A row appears with a name (W1) and **Takeoff** and **Landing** times in home local time, with the zone (CST) named. Enter times for today. A chip shows the alternate call in words: "No alternate needed", "ALTERNATE REQUIRED", "At the limit", "TAF doesn't cover the wave" or "No TAF", and how many alternates meet. Press the chip: the list of every reason opens with its time (for example "TEMPO 1/2SM FG from 16Z"); press it again to close it.
- [ ] Each alternate card shows its own line for the selected wave (meets, meets with a caution, or does not meet) with the reason. Pick another wave and the lines change. **Tomorrow** moves the waves to tomorrow's date. A landing earlier than takeoff means the next day.
- [ ] Add waves until there are five: **Add wave** stops and says why. Remove one: the others stay. Reload: the waves are kept.

### The 24-hour timeline

- [ ] The **24-hour timeline** has one row for home and each alternate over the home local day, the axis in Zulu (or local, if Settings puts that first), each piece labelled with its NATO colour state in words, your waves as bands across every row, and a line for now. The heading folds it away and back, and a reload keeps your choice.
- [ ] A piece below the limits is hatched and has a ▼; a very short piece shows only the ▼, as the legend under the timeline says. Hover or Tab to a piece: a card gives the group, the times in Zulu and local, the conditions in words and the result.

### The map

- [ ] Below the cards is the map: satellite picture, home and the alternates as dots with their ICAO and flight category in words, wind barbs, and dashed 25 and 50 NM rings. The strip under the map says when each picture is from and how old it is (for example "Radar 1840Z (2 min ago) ✓"). **+**, **−** and dragging move it, and **Home** brings it back and says it centred on home.
- [ ] Open **Layers**. Press Tab once: focus goes into the menu, not across the map. Press Escape from inside the menu, then open it again and press Escape from **Home** or **+**: the menu closes and focus is back on **Layers**.
- [ ] In the menu, switch **Satellite cloud picture (GOES)** on and off, move the **Radar (rain or snow)** slider, and try **VNC chart**, **VNC over satellite** (its opacity slider comes alive) and **Satellite** again. With a VNC chart showing, the credit line under the map names VNC charts © NAV CANADA and a note says the charts cover Moose Jaw, Regina, Saskatoon and Swift Current. Reload: your layer choices are kept.
- [ ] Press **Map key** under the strip. It explains the radar colours (light blue lightest, purple heaviest, in mm/h of rain, or cm/h of snow when **Radar shows** is Snow), the lightning mark (yellow with a dark outline) and the rings. Close it.

### Lightning near home

- [ ] The strip has a line for lightning near home, for example "No lightning within 20 NM of home ✓". On the map, lightning is a bright yellow mark with a dark outline that is easy to see on the satellite. If there is lightning within the radius, the line says how far and which way and a caution shows in the banner. To see the other wording with clear skies, open **SOF settings**, set **Lightning radius around home** to 50 and then back to 20.
- [ ] "Can't tell" means the check could not read the lightning picture (no network, the weather service is down, or the picture is too old). It does not mean it is clear. The strip line shows a question mark and "can't tell" instead of a tick, and with no earlier reading the banner gets an amber "Lightning: can't tell" line. A lightning caution that was already up stays up, marked "can't tell now, last seen" some minutes ago, until a good reading replaces it. To see it, switch the network off for a couple of minutes and wait for the next refresh. Then turn it on again.
- [ ] If a lightning caution is up, press **Acknowledge** and reload the page: it stays acknowledged (the same storm is the same caution after a reload). No lightning today: tick "not today".

### The ADS-B Exchange view

- [ ] Press **ADS-B Exchange view**. The map is replaced by ADS-B Exchange's own live map centred on your area, with a link **Open ADS-B Exchange in a new tab**. **Home**, **+**, **−** and **Radar shows** go grey, the strip says ADS-B Exchange's own map is showing, and the lightning-near-home line stays. Their page has its own ads; that is theirs. Press the button again: your map comes back with your layers, and focus is on the map.

### The settings menu and the keyboard

- [ ] **SOF settings** opens in the page (not a popup) and holds only what you need: the trigger, the home ceiling and visibility, the banner switch, the lightning radius and the traffic relay address (empty, so there is no Traffic button, and that is right). A number out of range is refused and the range is said.
- [ ] Put the limits back to Local (MTCA). Tab through the screen from the top: every button, box and chip can be reached and used without the mouse, in the order you read them, with a clear outline.

### Sign-off

Browser and version: ________  Date: ________  Name: ________

Differences from V6 or NAV CANADA noted (what, where, their value, the SOF's value): ________

All lines ticked, or marked "not today" with a reason, means the SOF Dashboard is done (R21).


## Test files and what happens to each

From the ratified test register (`pf/reset/5-testing/test-register.md`, Part B). The clean-up pull requests carry these out.

| File | Keep, rewrite or retire | Why (policy line or requirement) | What the rewrite checks instead | Runs |
|---|---|---|---|---|
| `tests/unit/sof/banner-model.test.js` | Keep | SOF-R8; the "wave flown hours ago" check at `:245` is a time rule (S3) | | Each change |
| `tests/unit/sof/cards.test.js` | Rewrite (one test) | SOF-R4 to SOF-R6 are kept. The test at `:284` checks "V6's 600-2" for an alternate with no minima, and SOF-R12 now says such an airfield reads amber "Incomplete" (T3). The comparison with wx at `:325` stays as wiring (S6) | An alternate with no approaches or landing minima set reads amber "Incomplete", says what it was checked against, and never reads "meets". New beside it: the decoded line (SOF-R4) | Each change |
| `tests/unit/sof/cautions.test.js` | Keep | SOF-R8 (D58's list); the reasons come from wx on purpose, a wiring check (S6); time rules at `:523`, `:554` (S3) | | Each change |
| `tests/unit/sof/feeds.test.js` | Rewrite (one test) | SOF-R15 is kept, and the stale checks are time rules (S3). The test at `:485-501` fails if reading takes 50 ms or more, a computer-time gate (T2) that can fail on a slow machine | Each hostile reply gets an answer or is refused, and nothing over 256 KB is read; the time is logged, not judged. If the reader gains a step counter, count the work as `tests/unit/sof/map-lightning.test.js:276` does | Each change |
| `tests/unit/sof/lightning.test.js` | Keep | SOF-R16 ("can't tell" at `:223`); distances from great-circle geometry; 20 NM is a setting (SOF-Q7) | | Each change |
| `tests/unit/sof/map-adsbx.test.js` | Keep | SOF-R17 (the ADS-B Exchange switch stays); address from numbers only (SOF-R24) | | Each change |
| `tests/unit/sof/map-draw.test.js` | Keep | SOF-R15; an invariant (no row drawn twice) | | Each change |
| `tests/unit/sof/map-feeds.test.js` | Keep | SOF-R15, SOF-R2; simulated clock; backup after two failures | | Each change |
| `tests/unit/sof/map-fetch.test.js` | Keep | SOF-R2, SOF-R23, SOF-R24; timeout, size cap and no cookies on every map request | | Each change |
| `tests/unit/sof/map-layers.test.js` | Keep, with changes | SOF-R28: the defaults (radar, coverage and lightning on, the rest off) match. Two changes: `defaultLayers()` is called without a date (for example `:46`, `:128`), so rain or snow follows the computer's date; give it a fixed date (T6). The traffic-layer parts (`:50`, `:65`, `:132`) leave with the relay (SOF-R17) | | Each change |
| `tests/unit/sof/map-lightning.test.js` | Keep | SOF-R16; the cost cap is counted, not timed (`:276`), the pattern T2 asks for | | Each change |
| `tests/unit/sof/map-loops.test.js` | Keep | SOF-R16 (the F1 and Y tests keep a caution through a failed refresh), SOF-R2. The 15 traffic-layer tests (`:197` to `:361`, `:459`, `:787`) leave with the relay (SOF-R17) | | Each change |
| `tests/unit/sof/map-model.test.js` | Keep | SOF-R14 (dots, category in words, credits) | | Each change |
| `tests/unit/sof/map-view.test.js` | Keep | SOF-R14; the 25 NM ring is worked out from 25/60 of a degree of latitude in the test (`:35-44`) | | Each change |
| `tests/unit/sof/marked-cautions.test.js` | Keep | SOF-R7; positions from wx on purpose, a wiring check (S6) | | Each change |
| `tests/unit/sof/marks.test.js` | Keep | SOF-R7, SOF-R24 (marks are text, not colour alone) | | Each change |
| `tests/unit/sof/reports-store.test.js` | Keep | SOF-R5, SOF-R23 (last reports kept, checked when read back); the three-day limit at `:91` is a time rule (S3) | | Each change |
| `tests/unit/sof/screen-model.test.js` | Rewrite (one test) | SOF-R5, SOF-R21 kept. The test at `:185` (D95) checks only the "checked against 600-2" note; SOF-R12 adds amber "Incomplete". The DTG test at `:39` stays, re-sourced from "V6's form" to SOF-R21 | The alternate card with no approaches set reads amber "Incomplete" and keeps the note | Each change |
| `tests/unit/sof/settings-model.test.js` | Keep | SOF-R11 (default Local (MTCA) 2000/3), SOF-R16 (radius 5 to 50 NM). The relay-address tests (`:148`, `:160`, `:170`) leave with the relay. SOF-R27's wind settings get new tests beside these | | Each change |
| `tests/unit/sof/taf-state.test.js` | Keep | SOF-R5 (a TAF past its end says STALE and how long ago) | | Each change |
| `tests/unit/sof/timeline.test.js` | Keep | SOF-R13; the comparison with wx is a wiring check (S6); clock-change tests skip and say so (S7) | | Each change |
| `tests/unit/sof/timeline-view-model.test.js` | Keep | SOF-R13, SOF-R24 (words for the card, arrow-key stepping) | | Each change |
| `tests/unit/sof/traffic.test.js` | Retire with the feature | SOF-R17: the relay layer went to the future list (SOF-Q9). Leaves when thread 7 archives the relay code; keeps running until then | | Each change, until archived |
| `tests/unit/sof/waves-view-model.test.js` | Keep | SOF-R10, SOF-R11 | | Each change |
| `tests/unit/sof/waves-view-plan.test.js` | Keep | SOF-R10 (five waves, Today or Tomorrow, survives a reload). It tests the plan store, so a later rename to match is fine | | Each change |
| `tests/unit/sof/waves.test.js` | Rewrite (about 5 tests) | SOF-R10, SOF-R11 kept. The pins at `:60`, `:70` and `:82` (two years) check the code against V6's "local + 6 h" formula and V6 against itself (T3). The D95 test at `:423` needs SOF-R12's "Incomplete". The tests titled "as in V6" (`:213`, `:231`) keep their checks, re-sourced to SOF-R10 and SOF-R11. The wx comparisons at `:281`, `:388` stay as wiring (S6) | Moose Jaw wave times are local + 6 h on every day of the year because America/Regina keeps CST all year (SOF-R21, S7), not because V6 did; the V6-against-V6 test goes; an alternate with no approaches set reads "Incomplete" | Each change |
| `tests/unit/sof/weather.test.js` | Keep | SOF-R2, SOF-R5 (refresh every 5 minutes, waking refreshes, a failed refresh keeps the last report, nothing after leaving) | | Each change |
| `tests/e2e/sof.spec.js` | Keep, with changes | All 69 pass at `6283f38`. Changes: the layout tests are redone for the one-screen rebuild (SOF-R19), and "the banner pushes the screen down" (`:612`) becomes "with five cautions, the waves, a card and the map are visible"; the "600-2" alternate checks (`:151-155`, `:672`) follow SOF-R12's pre-filled minima and "Incomplete"; the exact colour at `:500` becomes "dimmer than a current mark and still 4.5:1", as `:774-786` does (T3); the fixed 300 ms wait at `:289` waits for a condition instead (T2) | New beside it: SOF-R26's clocks, radar loop and tap-to-centre; SOF-R27's wind cautions; the decoded line (SOF-R4) | Smoke, layout, buttons, leaving and offline parts each change; the whole file at sign-off |
| `tests/e2e/sof-map.spec.js` | Keep, with changes | All 40 pass at `6283f38`. The relay tests (`:423`, `:439`, `:471`, `:483`, `:515`, `:605` and the relay part of `:616`) leave with the relay; three of the four fixed waits are in them. The last fixed wait (`:552`) waits for a condition instead (T2) | New: no two map labels overlap at the default zoom (SOF-R14, SOF-R28), which fails today | Layout and leaving parts each change; the whole file at sign-off |
