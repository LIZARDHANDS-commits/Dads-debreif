# Spec: `sof`, the SOF Dashboard

Status: **approved by Patrick on 2026-09-30** ("sof spec approved", 04:49Z, in the SOF dashboard spec thread), with SOF-7 answered (traffic as a layer through our own relay). Changes go through a pull request. Module id `sof` in [`SPEC.md`](../SPEC.md). Requirement IDs (R#), decisions (D#) and questions refer to the plan doc: https://claude.ai/code/artifact/29712036-a126-43c3-ac39-57ba919ff102

The SOF is built last, after the debrief, Turn Sim, Turn Fight and Traffic, and only when the coordinator says it's its turn. Until then this spec and [`tasks/sof/`](../tasks/sof/plan.md) are the work.

## Objective

A weather screen the Supervisor of Flying (SOF) keeps open on a desk all day (R13, Patrick 2026-09-29). At a glance it answers:

1. What is the weather now and forecast at home and at the alternates, and is any of it below our limits?
2. Does today's flying need an alternate, wave by wave?
3. Is there rain, snow or lightning nearby?
4. Can I trust what I'm looking at? Every report shows how old it is, and anything out of date says so plainly.

Users are the SOF at 2 CFFTS and anyone else watching the weather, on a desktop or laptop (D6), often a second screen left open for a whole shift.

V6 does this in its "SOF Dashboard" (a separate page inside `original/shell.html`; `python3 tools/extract_subapps.py` writes it out as `sof.html`). V6's SOF has 35 script blocks, about 58% of its code never runs, and its weather checks carry the safety bugs in audit issues #1 to #12. The rebuild keeps what V6's SOF was for, uses the tested weather code in `src/wx` for every weather answer, and shows only the essentials by default (R22).

Done means: a SOF can open the screen, enter the day's waves, and read the alternate call and the weather with nothing else open; every report's age is visible; nothing runs after the module is closed; and a current SOF (or Patrick) signs off the checklist.

## Assumptions

1. **No new weather logic.** Parsing, limit checks, cautions, alternate rules and the METAR/TAF feeds are already in `src/wx` (SPEC-wx, approved), and the airfields, their minima and their options are in `src/airfields` (SPEC-airfields, approved). The SOF module turns their answers into a screen. If the SOF needs a weather rule that `wx` doesn't have, it goes to the Weather parser thread, not into the SOF.
2. **Sources are decided** (D64 to D69): METAR and TAF from MET Norway with Datamask as the backup; radar from ECCC with RainViewer as the backup; lightning from ECCC; traffic as a link out; no proxy and no keys. Every source was checked from a browser on the live site (`/mnt/project-files/wx-sources/sof-weather-sources.md`), and the ECCC layers again while writing this spec.
3. **No map library.** V6 loaded Leaflet from unpkg, and the whole screen died when it couldn't (#6). The rebuild draws the map on a canvas with ui-kit's `createCanvasView`, as the debrief does. Radar and lightning are single images from ECCC's map service, sized to the view.
4. **The time zone comes from the home airfield** (`app.time`, SPEC-airfields), not V6's fixed CST (#7, #42). For Moose Jaw that is still UTC−6 all year, so every Moose Jaw time comes out as it did in V6.
5. **The SOF runs all day.** It must not slow down, grow its memory, or stop refreshing after hours open, and it must survive the computer sleeping and the tab being hidden.
6. **Open questions never block the build.** Each has a default below that the build follows until it's answered.

## Tech stack

Plain JavaScript ES modules, no framework and no new packages (SPEC.md). The map is a Canvas 2D view through ui-kit. Tests use Node's `node:test` and the Playwright set-up the app frame already has, with every weather reply served from captured files so tests never need the network.

## Commands

```
npm run dev                                  # the app with live reload; open the SOF card
npm test                                     # unit tests (node --test), including tests/unit/sof/
node --test 'tests/unit/sof/*.test.js'       # just the SOF's own tests
npm run test:e2e                             # Playwright, weather replies served from tests/fixtures/sof/
npm run build && npm run preview             # a local build, to measure (performance-optimization)
python3 tools/extract_subapps.py /tmp/v6     # V6's SOF page as /tmp/v6/sof.html, for side-by-side checks
```

## Code style

Pure functions decide everything the screen shows, and the page code only draws their answers. A comment names the V6 line a behaviour comes from, so the port can be checked by eye:

```js
// src/modules/sof/waves.js
import { homeAlternateTrigger } from '../../wx/alternates.js';

const HOUR_MS = 3_600_000;

/** A wave's home-weather window: takeoff to landing plus one hour (V6 sof.html lines 1441 to 1443). */
export function waveWindow(wave) {
  return { from: wave.takeoff, to: new Date(wave.land.getTime() + HOUR_MS) };
}

/** The wave's alternate call from the home TAF, with the reasons behind it. */
export function homeCall(wave, homeTaf, homeLimits) {
  return homeAlternateTrigger(homeTaf, waveWindow(wave), homeLimits);
}
```

- Weather answers come only from `src/wx` and airfield answers only from `app.airfields`. The SOF never reads a report's text itself, except to mark the words behind a limit in the raw text.
- No `innerHTML`, `!important`, `setInterval` or `requestAnimationFrame` (checked by `tests/unit/source-rules.test.js`). Timers come from the module's `app.scheduler` scope, so closing the module stops them all (R4). `wx`'s `startRefresh` is given that scope as its timers.
- Report text reaches the page only as text (`textContent` or ui-kit's `h()`), never as HTML.

## The screen

One screen, no tabs, sized for a 1920 × 1080 desk monitor and still with nothing overlapping at 1366 × 768 (R2). No side rails, no Tab-key tricks, and nothing fixed on top of the controls (#10, #34, #35). The app's header, with its Zulu and local clock, stays above it as on every screen.

```
┌ SOF bar ───────────────────────────────────────────────────────────────────────────────────┐
│ 301842Z SEP 26    Weather 2 min ago ✓  Radar 4 min ✓  Lightning 8 min ✓    ⟳ Refresh           │
├ ⚠ NEW CAUTION  CYMJ TAF: TEMPO 1/2SM FG 16–20Z  CYQR METAR: VCTS           [Acknowledge]  ┤
├ Waves  Today ▾ ───────────────────────────────────────────────────────────────────────────┤
│ W1 0800–0930 CST  No alternate needed │ W2 1030–1200 CST  ALTERNATE REQUIRED: CYMJ below │ + Wave │
├ Airfields ──────────────────────┬ Map ──────────────────────────────────────────────────────┤
│ CYMJ Moose Jaw   HOME  IFR  YLO1│                                                           │
│ METAR 1800Z (42 min)  ⚠ below   │      radar, lightning, home and alternates as dots        │
│ 301800Z 27012KT 2SM BR OVC008 … │      coloured by flight category, 25 and 50 NM rings      │
│ TAF 1740Z  TEMPO 1/2SM FG …     │                                                           │
│ CYQR Regina      ALT   MVFR GRN │                                                           │
│ …                               │                                                           │
│ ▸ Other airfields               │ Rain ▾  ☐ Loop last hour  Opacity ─○─   Lightning map ↗   │
├ 24-hour timeline (today, CST) ──┴───────────────────────────────────────────────────────────┤
│ CYMJ ████ GRN ████▒▒ YLO1 ▒▒████  (TEMPO row)  ▕wave 1▏  ▕wave 2▏   │now                      │
│ CYQR …                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
  Not for flight planning. Confirm with NAV CANADA. Weather: MET Norway (CC BY 4.0), NOAA via Datamask; radar and lightning: ECCC; map: Esri imagery, VNC © NAV CANADA (not for navigation).
```

| Shown by default | Behind a checkbox (off) or a collapsed "More …" panel (R22) |
|---|---|
| **SOF bar:** the date-time group (DTG), each feed's age and state in words, and Refresh | **World clocks:** Pacific, Mountain and Eastern, as V6's top bar had them (the header already shows Zulu and home local) |
| **Caution banner** when there's something new to acknowledge; it takes its own row and pushes the screen down, never covering it | **Other airfields:** the rest of V6's 15 fields as short rows (ICAO, name, category, ceiling and visibility, age). Fetched only while the panel is open |
| **Waves:** today's waves, each with its alternate call and the reason in words; Today or Tomorrow; add, edit and remove a wave | **NATO colour state chart:** V6's grid with each airfield placed on it, and a hover or focus card with its ceiling, visibility and wind |
| **Airfield cards** for home and each alternate: name and role, flight category and NATO colour state as words, report times and age, the raw METAR and TAF with the words behind a limit marked, the limit result in words, and for alternates their result over the arrival window | **Radar loop:** the last hour of ECCC frames, played in a loop (off: the latest frame only) |
| **Map:** a satellite picture of the area, switchable to the VNC chart (like ForeFlight's map choice), with the latest radar, ECCC lightning, home and alternates coloured by category with their ICAO, 25 and 50 NM rings around home, pan and zoom; and a **Live traffic** layer from our own relay (SOF-7, answered) | **Large text:** a bigger type size for a screen across the room |
| **24-hour timeline** for home and the alternates, collapsible | **About this screen:** where each feed comes from, how often it refreshes, when it counts as stale, and the rules behind the calls |
| **Credits and the "not for flight planning" line** | |

### SOF bar

- **DTG** in V6's form, `301842Z SEP 26` (V6's `dtgZulu`, sof.html line 745; it never showed in V6 because the script crashed first, #6). It comes from `core/time.js`'s `formatDtgZulu`.
- **Feed status** for weather, radar and lightning, each as words and a symbol, never colour alone: `2 min ago ✓`, `Refreshing…`, `STALE 48 min`, `Failed, showing 12 min old`, `Off`. Hovering or focusing it says which source answered (MET Norway or Datamask; ECCC or RainViewer) and when it will try again.
- **Refresh** asks every feed now. It's never needed for normal use.
- Live traffic is a layer on the map (see Map), not a link here.

### Caution banner (fixes #5)

V6's "NEW WEATHER LIMIT" box never appeared, because its code sat inside the Leaflet script tag, and its button was wired before it existed (#5).

- A **caution** is any of: a report below its limits (red), dangerous weather in `wx`'s `cautions` list (D58: thunderstorm, CB/TCU, funnel cloud, freezing precipitation, hail, fog at the station and the rest), or lightning near the home field if SOF-3 is answered yes. "At the limit" (yellow, D57) and "information only" weather (`watch`) show on the card but don't raise the banner.
- Each caution is **new** until acknowledged. The banner lists every unacknowledged caution, one line each, in words: the airfield, whether it's the METAR or the TAF (and the TAF group and its times), and `wx`'s reason (`CEILING 800 FT < 2000 FT`, `THUNDERSTORM / SEVERE WX (VCTS)`).
- **Acknowledge** clears the banner. An acknowledged caution stays acknowledged while the same airfield keeps reporting the same thing, and comes back if it clears and returns later (SOF-4). A different caution at the same airfield is new.
- The banner is announced to screen readers (`role="alert"`) and has a symbol and words, not only colour. A setting, on by default as in V6 ("New-alert caution box"), can turn the banner off; the cards still show every caution.
- Acknowledgements are kept for the day in the module's storage, so a reload doesn't re-raise everything already acknowledged.

### Waves and the alternate call (fixes #7, and #4 for the calls)

V6 had three separate sets of wave inputs, two of them hidden and dead, assumed CST, kept an old date forever, and dropped evening waves in Zulu mode (#7). Its alternate chips never appeared, and the label read "DEST <3000 FT / 3 SM" while the check used 2000 ft (D59).

- **A wave** is a name (W1, W2 … by default), a takeoff time and a landing time, entered in the home field's local time and labelled with its zone (`CST`). A landing earlier than takeoff means the next day, as in V6. Up to 5 waves, as V6 (sof.html line 1220). They're saved as the daily plan and applied to **Today** or **Tomorrow** (home-field local date), so a date never goes stale (SOF-6).
- **Home call** for each wave: `wx`'s `homeAlternateTrigger` over takeoff to landing plus one hour (V6 lines 1441 to 1443) against the home limits (default 2000 ft and 3 SM, V6's WX SETUP, D59). Shown as words: `No alternate needed`, `ALTERNATE REQUIRED`, `At the limit`, `TAF doesn't cover the wave`, `No TAF` (missing, NIL or cancelled), `Can't tell` (a ceiling or visibility unknown). The chip names the first reason and when (`CYMJ TEMPO 1/2SM FG from 16Z`); selecting it lists every hit, at-limit piece and caution.
- **Alternates** for each wave: `wx`'s `assessAlternate` over `arrivalWindow([landing])`, the landing time ±60 minutes (D70), with each alternate's options from `app.airfields.checkOptions(icao)`: its minima from its approaches (D70, D71), PROB against landing minima (D72), the GNSS 100 NM warning (D73), the GNSS-only visual descent rule (D80, D81), and military fields on the same rules (D79). An alternate whose approaches are "Not set" is checked against V6's 600-2 and says so (D95). The card shows the result for the selected wave; the wave chip says how many alternates meet.
- The **label is built from the numbers** the check used, so it can never disagree with the check again (D59).
- There's **no manual "alternate required" switch** (V6 had a hidden click-to-toggle, line 1295), unless SOF-2 says otherwise. The call is always computed and always shows why.
- The call is a planning aid. The SOF makes the decision; the "not for flight planning" line says so.

### Airfield cards (fixes #3 display, #4, #8, #12)

- One card each for home and the alternates, in the order set in Settings (SPEC-airfields). V6's alternate cards showed green whatever the weather (#4); here every card shows `wx`'s answer for its own limits: home against the home limits, alternates against their alternate minima.
- **Header:** ICAO, name, `HOME` or `ALT`, flight category (`wx`'s `flightCategory`) and NATO colour state (`natoColour`), both as text badges.
- **Report lines:** `METAR 1800Z (42 min ago)` and `TAF 1740Z, valid 30/18–01/18`, then the raw text. The words that trip a limit or a caution are marked (V6's `wxTokenHighlights`, line 52): red for below, amber for a caution, yellow for at the limit, each also underlined with a hover or focus note, so colour isn't the only signal.
- **Result line** in words: `Below limits: CEILING 800 FT < 2000 FT`, `At the limit: VIS 3 SM AT LIMIT 3 SM`, `Within limits`, `Unknown: no ceiling reported`. Weather that is information only (snow, shallow fog, vicinity showers) is listed as `Watch: VCSH`.
- **Stale** (D67): a METAR older than 75 minutes by its own time, or a TAF past its end, greys the text and says `STALE: 1 h 40 min old`. A cancelled TAF says `TAF cancelled` and a METAR with `LAST OBS/NXT 011000Z` says `No obs until 1000Z`, not an error (CYMJ closes overnight). A report that failed to refresh stays up with its age; it's never wiped (#8).
- **Missing:** `No METAR from MET Norway or Datamask` with the time of the last try.
- Clicking or pressing Enter on a card centres the map on that airfield.

### Map (fixes #6, #9, #11)

- **Base map, as in ForeFlight: Satellite or VNC.** Satellite is Esri's world imagery, the same satellite picture the debrief uses (Patrick, 2026-09-30), through the shared tile loader the debrief's code moves into ui-kit. VNC is the two VNC charts the debrief already carries (South: Moose Jaw and Regina; North: Saskatoon and Moose Jaw), with V6's alignment; together they cover CYMJ, CYQR, CYYN and CYXE. Outside the charts, the VNC view shows the satellite picture, and the map says so. The base map is dimmed a little (a setting) so radar stands out. Each is credited on screen, and the VNC carries "Not for navigation". Pan by dragging, zoom with the wheel or the + and − buttons, and a Home button that returns to the home field. The view opens centred on the home field, at V6's zoom level (6), which shows southern Saskatchewan and the fields around it.
- **Layers menu, like ForeFlight's.** Layers stack; each has its own switch, and the image layers have an opacity slider. Checked from a browser on 2026-09-30; every image layer is from ECCC's map service, which the SOF already uses. Only the layers marked "on" start on (R22); the menu remembers the SOF's choices.

  | Layer | Source | Starts |
  |---|---|---|
  | Base: Satellite, VNC, or VNC over satellite with the chart's opacity (as the debrief does) | Esri imagery; the debrief's VNC charts | Satellite |
  | Radar (rain or snow) | ECCC 1 km, every 6 min | on |
  | Radar coverage: hatches areas no working radar covers, so an empty patch isn't read as "no rain" | ECCC `RADAR_COVERAGE_RRAI.INV` | on |
  | Lightning, last 10 min | ECCC CLDN | on |
  | Airfields coloured by flight category, with wind barbs from their METARs | the SOF's own reports | on |
  | 25 and 50 NM rings around home, and the lightning radius if SOF-3 is yes | drawn by the SOF | on |
  | Satellite cloud picture: visible by day, infrared by night | ECCC GOES-West 1 km `DayVis-NightIR`, every 10 min | off |
  | Weather warnings in force (thunderstorm, snow squall, fog and others) | ECCC `Current-Alerts` | off |
  | The training routes and areas the debrief already carries (TACNAV 1 to 4, North and South routes) | the debrief's route overlays, moved to a shared place | off |

  Traffic comes through the SOF's own relay (see below). SIGMETs, PIREPs, NOTAMs and the GFA could come through the same relay later; they're a future feature, not this spec. ECCC's capability list is 40 MB, so the SOF only ever asks for one named layer's times, never the whole list.
- **Live traffic layer, through our own relay** (SOF-7, Patrick 2026-09-30: "let's just set up our own"). No free live-traffic feed lets a web page read it directly (checked 2026-09-30: ADS-B Exchange needs a paid key, Airplanes.live and adsb.one refuse, adsb.fi, adsb.lol and OpenSky don't allow browser reads). V6 solved this with a Netlify function of Dad's behind `/api/traffic` (ADSB.lol, then Airplanes.live, 100 NM, every 10 s), which isn't in the V6 file. The rebuild does the same with its own small relay:
  - **The relay** (`relay/traffic.js`): a Cloudflare Worker on Patrick's free Cloudflare account. It answers one request, `GET /traffic?lat=…&lon=…&nm=…`, with numbers checked (latitude and longitude in range, radius 5 to 150 NM), asks adsb.lol's `/v2/point` for aircraft, and returns only what the layer draws: hex id, callsign, registration, type, position, barometric altitude, ground speed, track, squawk, seconds since seen, and military flag. It caches each answer for 5 seconds so any number of open screens make at most one upstream request per 5 seconds. It sends a CORS header for the live site and local development only, holds no keys, stores nothing, and logs nothing about who asked. It caps the reply at 1,000 aircraft and 1 MB. adsb.lol's data is open (ODbL) and credited on screen; its terms are read again when the relay is built.
  - **The layer:** every 10 seconds while it's on (V6's rate), aircraft within 100 NM of home as small symbols pointing along their track, drawn over radar and lightning. Military aircraft are marked, and stale positions (over 20 s old, as V6) are faded. Labels are off by default; V6's choices come back as layer options: callsign, altitude, military only. Hover or focus shows V6's popup facts (callsign, registration and type, altitude, ground speed, track, squawk, age). About 8,600 requests a day with one screen open, well inside Cloudflare's free 100,000.
  - **When it fails:** the layer and the feed status say `Traffic unavailable` with the time of the last good answer, the aircraft are removed rather than frozen, and everything else carries on. It never stops the SOF.
  - **Starts:** off (R22), with its switch in the Layers menu and in the map controls. It stops asking the moment it's off or the module closes (R4).
  - **Setup:** the relay's address is a build setting. Patrick sets up the free Cloudflare account when the SOF is built (task 7), with steps given then; until the address is set, the layer's switch is hidden.
- **Airfields:** home and alternates as dots in their flight-category colour with the ICAO beside them and the category in the dot's label, so it isn't colour alone. 25 and 50 NM rings around home (V6's "reference" circles, line 569).
- **Radar** (D65): ECCC's 1 km radar (`RADAR_1KM_RRAI` rain, `RADAR_1KM_RSNO` snow), one image for the view, refreshed every 6 minutes (D67), stale after 20 minutes. Rain or Snow is a choice, snow by default from November to March. The image time comes from ECCC's own layer time, so the age shown is the radar's, not the fetch's. If ECCC fails twice in a row, RainViewer's tiles take over (max zoom 7, credited, "backup" in the feed status) until ECCC answers again.
- **Lightning** (D66): ECCC's 10-minute lightning density (`Lightning_2.5km_Density`), refreshed every 10 minutes and stale after 30, on by default with an opacity slider (V6's, line 543). **Lightning map ↗** opens Blitzortung in a new tab; its terms allow private use and prefer a link to an embed, so it's never embedded or read (D34 revised by D66).
- With no network the map says `Map and radar need a connection` and still shows the airfield dots and rings.
- Map pieces are drawn only when something changes (a new image, a pan, a zoom), never on a timer.

### 24-hour timeline (fixes #7 and V6's five copies of it)

V6 wrote the timeline five times; the one that ran (V8, line 1985) parsed TAFs itself with the audit's bugs.

- One row per airfield (home, then alternates), from `wx`'s `tafTimeline`: the prevailing forecast on the top line and TEMPO, PROB and BECMG on a second line, as V6. Each piece is coloured by its NATO colour state (V6, line 2044) and labelled with it; a piece below the limits for that airfield also has a hatch pattern and `below` in its label.
- The day is the home field's local day (00:00 to 24:00 local) for Today or Tomorrow. The axis is labelled in Zulu or local, whichever Settings puts first, and the hover or focus card shows both. Evening waves are never dropped (#7).
- Each wave is a band across all rows, with marks at landing and landing plus one hour (V6). A "now" line moves once a minute.
- The latest METAR is a small mark at its time on the top line (V6).
- Hovering or focusing a piece shows its group, times, conditions in words and its limit result. Keyboard users can step through pieces with the arrow keys.
- It's drawn again only when a report, a wave, the day or the time order changes, never torn down while someone is typing (#7).

### Settings

The home field and alternates, and each alternate's approaches, minima and MEA, are set in the Airfields section of Settings (SPEC-airfields), not here. V6's own WX SETUP airfield boxes go away. The SOF adds a small section to the Settings dialog, through the app frame:

| Setting | Default | Range |
|---|---|---|
| Home limits: ceiling below (ft) | 2000 (V6, D59) | 0 to 10,000 in 100s |
| Home limits: visibility below (SM) | 3 (V6, D59) | 0 to 10 in quarter miles |
| New-caution banner | On (V6's "New-alert caution box") | on or off |
| Lightning near home: radius (NM) | 20 (V6's `lightningNm`, which did nothing in V6) | 5 to 50, only if SOF-3 is yes |

V6's "alternate highlights" (600 ft and 2 SM) aren't a SOF setting any more: each alternate's minima come from its approaches in the Airfields section, and 600-2 is the fallback when they're not set (D70, D95). The refresh times and stale limits are fixed at D67's values and explained under About this screen, not settings.

## What V6 does, and what the rebuild keeps

| V6 piece (sof.html) | Rebuild |
|---|---|
| World clocks and DTG (lines 512 to 518 and 745) | DTG in the SOF bar; Zulu and home local in the app header; the other three zones behind World clocks |
| ⟳ WX button | Refresh in the SOF bar |
| ⟳ TRAFFIC button and LIVE TRAFFIC tab (dead, #6) | The Live traffic switch on the map |
| Airplanes.live globe and Windy radar swapping every 10 s, no pause (#11, audit b#22) | Removed. Radar is on the SOF's own map and traffic is a layer on it (SOF-7), so neither swaps on a timer. |
| Priority weather cards, left and right rails (lines 532 and 546) | Airfield cards, one column |
| SHOW OTHER AIRFIELDS (always empty, #6) | Other airfields panel that works |
| Raw Aviation Weather and Setup tabs (unreachable, #6) | Raw text is on every card; the setup text becomes About this screen |
| WX SETUP dialog | Airfields in Settings (SPEC-airfields) and the SOF section above |
| ALTERNATE APPROACH / MEA rows | The Airfields section's approach type, minima and MEA (D70 to D73, D80, D81) |
| Limit highlighting and NEW WEATHER LIMIT box (never ran, #5) | Marked report words, result lines, caution banner |
| Wave banner, wave row and hidden duplicates (#7) | Waves, one set |
| Home alternate trigger and alternate ETA checks (four versions, two dead) | `wx`'s home trigger and alternate check, one each |
| 24-hour timeline (five versions) | One timeline from `wx`'s `tafTimeline` |
| NATO colour state chart, hover card with favoured runway and crosswind (lines 1012 to 1214) | The chart behind a checkbox, with ceiling, visibility and wind. Favoured runway and crosswind wait for runway data (FF20, FF21) |
| METAR.CLOUD runway and wind embed (line 492) | A link on each card (SOF-5) |
| ECCC lightning image in a hidden panel, Blitzortung strike canvas hidden by CSS (#9) | ECCC lightning on the map; Blitzortung as a link |
| RainViewer radar in a hidden map (line 655) | Backup radar only |
| Leaflet map (crashed at start, #6) | Canvas map, no library |
| Home-screen card flashing "SOF ACTION REQUIRED" with no weather behind it (#12) | The home card shows no live state (the shell owns it; nothing to do in this module) |
| `BUILD:` debug badge | Removed |

## What the SOF needs from other pieces

| From | What | State |
|---|---|---|
| `wx` (Weather parser thread) | `startRefresh`, `staleness`, `checkConditions`, `DANGEROUS_WEATHER`, `flightCategory`, `natoColour`, `tafTimeline`, `forecastAt`, `homeAlternateTrigger`, `arrivalWindow`, `assessAlternate`, `formatVisibility` | Merged. `startRefresh` takes the station list at start, so the SOF stops and restarts it when the airfields change |
| `wx` | Where each caution's words are in the raw text (character positions), so the SOF can mark them without reading the text itself | New, small: asked of the Weather parser thread through the coordinator at task 3 |
| `app.airfields` (Airfields thread) | `home()`, `alternates()`, `stations()`, `checkOptions(icao)`, `subscribe()`, and the catalog's positions and names for the map and Other airfields | Merged |
| `app.time`, `core/time.js` | Home zone, `formatDtgZulu`, the Zulu or local order | Merged |
| ui-kit (app frame) | `h()`, `createPanel`, `createControls`, `createCanvasView`, the scheduler | Merged |
| App frame | The registry entry `#/sof`, the SOF section in the Settings dialog, `tests/e2e/sof.spec.js`, and the page's Content Security Policy allowing `api.met.no`, `datamask.org`, `geo.weather.gc.ca`, `api.rainviewer.com`, `tilecache.rainviewer.com`, `server.arcgisonline.com` and the traffic relay's address, and no outside frames | Asked for through the coordinator at the task that needs it |
| Debrief and app frame | The satellite tile loader, moving from the debrief into ui-kit before Traffic task 8 (coordinator, 2026-09-30), and the VNC charts and their alignment (`src/modules/debrief/map2d/vnc.js` and its images), which need the same move so the SOF can use them | Planned for the tile loader; the VNC move is asked for through the coordinator at task 6. |

## Security (untrusted replies)

security-and-hardening, with `.claude/references/security-checklist.md`. Every weather reply is untrusted text from outside.

- METAR and TAF text arrives through `wx`'s `sources.js`, which already refuses oversized replies, reports for the wrong station and bad station ids. The SOF puts that text on the page only as text nodes, and the marked words are built as separate text spans.
- Radar and lightning images are built from fixed addresses with only numbers (view bounds, size, a time read from ECCC's own reply and checked to be a time) in the query. ECCC's layer-time reply is read with a size cap and a strict pattern. RainViewer's list is checked for shape and its paths must match its documented pattern before they go in a tile address.
- There are no embedded outside pages. Links out are fixed addresses with numbers only, opened with `noopener noreferrer`.
- The traffic relay's reply is untrusted too: checked for shape, size and number ranges before anything is drawn, and callsigns and registrations go on the page only as text. The relay itself accepts only its three numbers, so it can't be used to fetch anything else.
- Stored waves, settings and acknowledgements are checked for shape and range when read back, and anything wrong falls back to the defaults.
- Nothing is sent anywhere except the weather requests, which carry only station ids or map bounds. No cookies (`credentials: 'omit'`).

## Performance (all day on a desk)

performance-optimization, with `.claude/references/performance-checklist.md`.

- Refresh on D67's timings only: METAR and TAF every 5 minutes, radar every 6, lightning every 10, and Other airfields only while open. When the tab comes back after being hidden, or the computer wakes, anything due refreshes at once; while hidden, the clocks stop and only the weather keeps refreshing, so the cautions are right when the SOF looks back.
- Draw on change only. The clocks change a few text nodes once a second; the timeline's "now" line moves once a minute; nothing else moves unless the radar loop is on.
- Memory stays flat: kept reports are replaced, never appended; radar loop frames are capped at the last hour (10 images); caution acknowledgements are cleared at the end of the day.
- Measured on a local build: a simulated 12-hour run with fake timers and captured replies must end with the same number of timers, listeners and DOM nodes it had after the first hour.

## Project structure

```
src/modules/sof/
  index.js       mount and unmount: wires app.*, the feeds and the screen
  waves.js       wave plan, local times to UTC for Today or Tomorrow, home and alternate calls
  cards.js       card model (pure) and the card DOM, with marked report words
  cautions.js    which cautions are new, acknowledging, when one comes back (pure)
  timeline.js    timeline pieces (pure) and drawing
  feeds.js       radar and lightning image addresses, ECCC layer times, RainViewer backup, feed status and stale limits
  lightning.js   lightning near the home field (only if SOF-3 is yes)
  map.js         canvas map: tiles, radar and lightning images, airfields, rings
  layout.js      the screen: SOF bar, banner, waves, columns, More panels
  sof.css
  README.md      what each file does and where to change common things (R8)
tests/unit/sof/  one test file per pure file
tests/fixtures/sof/  captured replies: MET Norway, Datamask, ECCC layer times and images, RainViewer
docs/checklists/sof.md   the sign-off checklist (R21)
relay/traffic.js         the traffic relay (a Cloudflare Worker), with tests/unit/relay/traffic.test.js
```

`tests/e2e/sof.spec.js` and the registry entry belong to the app frame thread and go through the coordinator.

## Skills used

Patrick asked every thread to name the repo skills it uses (2026-09-30). These follow `.claude/skills/README.md`, and each PR lists the ones it applied.

| Step | Skill (`.claude/skills/`) | How it's used here |
|---|---|---|
| This spec | spec-driven-development | The six core areas, assumptions up front, open questions with defaults, and Patrick's approval before any code |
| The task plan | planning-and-task-breakdown | `tasks/sof/`: vertical slices, each with acceptance, verify and at most about 5 files, checkpoints between PRs |
| Tasks 1, 3, 4, 5 (waves, cautions, cards, timeline) | test-driven-development | Failing tests first from captured reports. The wave time conversion is pinned to V6's fixed CST for Moose Jaw before it uses the home zone (CLAUDE.md: time conversions) |
| Every task | incremental-implementation | One task per commit, each leaving the app working; `npm test` before each commit |
| Tasks 2 to 8 (every screen piece) | frontend-ui-engineering, with `.claude/references/accessibility-checklist.md` | Labelled controls, keyboard use, colour never the only signal, clear empty, error and stale states, R22's essentials-first layout, tokens instead of `!important` |
| Tasks 2, 6, 7 (feeds, map images, links) | security-and-hardening, with `.claude/references/security-checklist.md`, plus `/security-review` | Replies treated as untrusted: text only, shape and size checks, fixed addresses built from numbers, the CSP list for the app frame |
| Tasks 6 and 9 (map, all-day run) | performance-optimization, with `.claude/references/performance-checklist.md` | Measure a local build; the simulated 12-hour run; one change at a time, logged in the PR |
| When something breaks | debugging-and-error-recovery | Reproduce from a captured reply, find the cause, fix, and add the reply to the fixtures |
| Before each PR leaves draft | code-review-and-quality, plus `/code-review` | The five-axis review with severity labels, and `.claude/references/definition-of-done.md` |
| Polish, before sign-off | code-simplification, plus `/simplify` | Tidy without changing what the screen says |

## Testing strategy

1. **Pure pieces first, from captured replies.** `waves.js`, `cards.js`, `cautions.js`, `timeline.js` and `feeds.js` are tested in Node with the real MET Norway, Datamask and ECCC replies already captured (`/mnt/project-files/wx-sources/samples/`, copied into `tests/fixtures/sof/`), plus the report table in `tests/unit/wx/reports.js`.
2. **Times pinned before they move.** A test runs V6's own wave-time code (the `+6` hours at sof.html line 1441, and the timeline's `absoluteLocal` at line 2032) and checks the new conversion gives the same UTC times for Moose Jaw on every day of a year, including midnight-crossing waves. Then further cases check a home field with daylight saving (Swift Current doesn't have it; a test zone such as America/Edmonton does).
3. **Each audit issue is a named test:** #4 an alternate below its minima shows below; #5 a caution raises the banner and Acknowledge clears it; #7 an evening wave shows in the Zulu-first timeline and a saved plan uses today's date; #8 a failed refresh keeps the last report with its age; #9 lightning is visible; #11 nothing runs after unmount.
4. **Browser tests** (Playwright, replies served from fixtures, no network): every control does something (R3); nothing overlaps at 1366 × 768 and 1920 × 1080 (R2); leaving the module leaves no timers, frames or requests running (R4); it works with every feed failing, showing the failure in words (R7, no console errors); the banner, cards and timeline can be used with the keyboard alone.
5. **The all-day run:** fake timers over 12 hours with replies that change, fail and recover, checking refresh times, stale labels, cautions and flat memory.
6. **Sign-off checklist** (R21), run by a current SOF or Patrick against V6 and the NAV CANADA weather site on the same day.

## Boundaries

- **Always:** take every weather answer from `wx` and every airfield answer from `app.airfields`; show every report's age; keep the last good report when a refresh fails; run `npm test` before each commit.
- **Ask first:** any change to a limit, a caution rule or an alternate rule (those are `wx` decisions); a new outside source or embed; anything that sends data anywhere except the weather requests.
- **Never:** edit `original/`; parse report text in the SOF; show a report without its age, or show a stale one as current; put reply text into HTML; embed a site whose terms say not to.

## Success criteria

- A SOF can enter the day's waves and read each wave's alternate call and its reasons with only the default controls showing (R22).
- Every audit issue from #4 to #12 that belongs to the SOF has a passing test or a checklist line.
- Every report and map layer shows its age, and a stale or failed feed says so in words (R13).
- After 12 simulated hours the screen still refreshes on time with flat memory, and closing it leaves nothing running (R4).
- Nothing overlaps at 1366 × 768 or 1920 × 1080, every control does something, and there are no console errors (R2, R3, R7).
- A current SOF or Patrick signs off the checklist (R21).

## Not in this spec

- **NOTAMs, PIREPs and the GFA.** Checked again on 2026-09-30: NAV CANADA's weather site answers but doesn't allow a browser page to read it, the FAA NOTAM service needs a key, and aviationweather.gov doesn't allow browser reads. They would need a relay (a small proxy), which D69 rules out. They can come back as a future feature if a relay is ever set up.
- **Favoured runway and crosswind** (FF21), which need runway data (FF20).
- **SIGMETs, PIREPs and the GFA through the relay.** Possible later with the same relay (from the US Aviation Weather Center; NAV CANADA's data needs their permission). A future feature, logged separately.

## Open questions

Labelled SOF-1 to SOF-7 here (SOF-7 answered); they get Q numbers when they're logged in the plan doc's Questions tab. None blocks the build: each default is what gets built until it's answered.

- **SOF-1 (Patrick): is the default screen right?** Shown by default: the SOF bar, caution banner, waves with their calls, airfield cards, map with radar and lightning, and the timeline. Behind checkboxes: world clocks, other airfields, the NATO chart, radar loop and large text. **Default and my recommendation:** as in the table under The screen. It covers everything a SOF uses every few minutes and nothing they don't.
- **SOF-2 (a current SOF): keep a manual "alternate required" switch?** V6 let you click the call to flip it, and the flip was saved and looked exactly like a computed call. **Default and my recommendation:** no switch. The call is always computed and always shows its reasons, and the SOF decides. If SOFs want to record their own call, it should look different from the computed one (for example `SOF: ALTERNATE REQUIRED` beside the computed chip).
- **SOF-3 (Patrick, as it adds a caution rule): warn when lightning is near the home field?** V6 had a "Lightning alert radius (NM)", 20 by default, that never did anything. The rebuild can read ECCC's 10-minute lightning map and raise a caution when any lightning is within the radius. It's an estimate on a 2.5 km grid, not individual strikes. **Default:** on, 20 NM, with the reading labelled "about". **My recommendation:** yes, since V6 meant to have it and lightning is the reason most SOFs watch the radar.
- **SOF-4 (a current SOF): when should an acknowledged caution come back?** **Default and my recommendation:** it stays acknowledged while the same airfield keeps reporting the same thing (so a thunderstorm in every METAR for three hours alerts once), and comes back if it clears and returns, or if a new kind of caution appears there. The other choice is to re-alert on every new report, which would ring every hour through a long spell of weather.
- **SOF-5 (Patrick): the METAR.CLOUD runway and wind picture.** V6 embedded metar.cloud's page for the selected airfield. It still loads in a frame, but it's a third-party site whose terms we haven't checked, and it's a second view of the same METAR. **Default and my recommendation:** a small `Runway view ↗` link on each card that opens it in a new tab. Drawing our own runway and wind picture is part of FF20 and FF21.
- **SOF-6 (a current SOF): do the wave times stay the same from day to day?** **Default:** yes. The SOF enters up to 5 waves once, they apply to Today (or Tomorrow when picked), and they stay until changed. **My recommendation:** the default, because it removes V6's bug of keeping an old date. If waves change daily, a "Clear waves at the end of the day" option is a small addition.

- **SOF-7, answered (Patrick, 2026-09-30).** Live traffic is a layer on our own map through our own relay ("let's just set up our own"), replacing D69's "no server" for traffic and D68's link out. See Map.

Also for the plan doc, not questions: the refresh timings and stale limits here are D67's; Blitzortung stays a link (D34 as revised by D66), and its terms are read again when task 7 is built.

## Plan

The tasks, checkpoints and risks are in [`tasks/sof/plan.md`](../tasks/sof/plan.md) and [`todo.md`](../tasks/sof/todo.md).
