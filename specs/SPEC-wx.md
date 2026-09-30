# Spec: `wx`, weather parsing and limit checks

Status: **approved by Patrick on 2026-09-30**; the Q30 alternate rules (D60) approved 2026-09-30. Module id `wx` in [`SPEC.md`](../SPEC.md). Requirements: R13 (SOF), R16 (home airfield and alternates are a setting), R7 (no browser errors), R9 (numbers match V6 unless a logged decision says otherwise).

## Objective

One tested place that turns raw METAR and TAF text into plain data, and answers the SOF's questions about it: what is forecast at a time, is it below the home or alternate limits during a wave, and what colour state or flight category is it. It replaces the eight or so copies of METAR/TAF parsing in V6's SOF page, which disagree with each other and carry the safety bugs in audit issues #1 to #5.

The users are the SOF (weather cards, 24-hour timeline, alternate calls) and, later, anything else that shows weather. `wx` has no screen of its own.

Done means: every case in the report table below passes, including one per audit bug, and the SOF can be built on these functions without parsing text itself.

## Scope

In:

- `metar.js`: parse a METAR or SPECI.
- `taf.js`: parse a TAF into dated change groups, and build its timeline (prevailing conditions plus TEMPO, PROB and BECMG overlays).
- `conditions.js`: the shared parts (wind, visibility, weather, cloud), merging a change group into what it changes, and display formatting.
- `limits.js`: limit checks, the V6 default limits, NATO colour state and flight category.
- `alternates.js`: the home-weather alternate trigger over a wave window, and the alternate airfield check over an arrival window.
- `sources.js`: fetching METARs and TAFs from MET Norway, with Datamask as the backup, refreshing them, and saying when a report is stale. See "Sources".

Out, for now:

- Lightning (D34), radar and anything that touches the page.
- Deciding what a limit should be. `wx` takes limits as input; the SOF gets them from settings.

## Assumptions

1. Reports are in North American format as the SOF shows them today: visibility in statute miles (`15SM`, `1 1/2SM`, `M1/4SM`, `P6SM`), with metric visibility (`9999`, `0800`) and `CAVOK` also understood.
2. A raw report string is the input. JSON from a feed is the adapter's job; the adapter passes the raw text through.
3. A report only carries day-of-month. Every parse takes a reference time (`now`) and resolves days to the nearest matching month, so reports around month ends work.
4. `wx` does not import `src/core/`. The one conversion it needs (metres to statute miles, 1609.344, exact by definition) is a local constant, because `core/units.js` holds only the flight-math constants V6 uses and has no statute mile.
5. `node --test` only, no packages.

## Behaviour

### Parsing rules

- Everything after `RMK` is ignored for conditions and kept as `remarks`.
- Tokens are read one at a time, so a TAF period like `2916/2920` can never be read as visibility (issue #1).
- Visibility: `M` means "less than" and `P` means "more than". The value keeps its number and a qualifier: `M1/4SM` is `{ sm: 0.25, qualifier: 'less' }` (issue #3, V6 read it as 4 SM). A whole number joins a following fraction only when it is one or two digits (`1 1/2SM`). A fraction of a mile is always below one, so `11/2SM` is read as `1 1/2SM` with the space dropped (V6 read 5.5). Metric visibility is converted to SM; `9999` means 10 km or more. `CAVOK` means 10 km or more, no cloud that matters, no weather.
- Cloud: `FEW`, `SCT`, `BKN`, `OVC`, `VV` with a base in hundreds of feet, and an optional `CB` or `TCU` kept on the layer (issue #3: `BKN015CB` is a 1500 ft ceiling, V6 saw no ceiling). `///` base means unknown. `SKC`, `CLR`, `NSC`, `NCD` and `CAVOK` mean an explicit clear sky, which a change group uses to clear the cloud it inherited.
- Ceiling: the lowest `BKN`, `OVC` or `VV` layer. `null` means no ceiling. The ceiling is **unknown** when such a layer has a `///` base, or when there is no cloud group at all and no `SKC`/`CLR`/`NSC`/`NCD`/`CAVOK`.
- Times: a report's observation or issue time is the latest matching date no more than an hour after `now`, since reports are never written in the future. Group times resolve to the date nearest the valid period, so a group starting just before it stays in its own month. Impossible values (day 32, hour 25) give no time.
- A repeated TAF header, as some feeds send it (`TAF AMD TAF AMD CYMJ ... CNL`), is read once, so a cancelled TAF reads as cancelled, not unreadable.
- A METAR trend (`TEMPO`, `BECMG`, `NOSIG` at the end of an ICAO METAR) is kept apart as `trend`, not read as observed.
- Weather: intensity (`-`, `+`, or `VC` for vicinity), descriptor (`MI BC PR DR BL SH TS FZ`) and phenomena (`RA SN FG ...`). `NSW` in a change group clears inherited weather.

### TAF groups and timeline

- Groups: the base forecast, `FMddhhmm`, `BECMG dd hh/dd hh`, `TEMPO`, `PROB30`/`PROB40` (alone or followed by `TEMPO`, keeping the probability; V6 lost it). Hour 24 means midnight at the end of that day.
- `FM` starts a complete new forecast.
- `BECMG`, `TEMPO` and `PROB` change only what they state; everything else carries over from what is prevailing.
- Prevailing conditions: the base forecast until the first `FM` or `BECMG`; after an `FM`, that group; after a `BECMG`, the merged new conditions from the **end** of its change period until the next `FM` (issue #2: V6 dropped them once the change period ended). During the change period the old conditions stay prevailing and the new ones are an overlay, since either may be present.
- The base forecast ends at the first `FM` or `BECMG`, not at the first group of any kind (issue #2, finding sof-c#7: a leading `TEMPO` stretched the base to the end of the TAF).
- `TEMPO` and `PROB` are overlays, split wherever the prevailing conditions under them change, and each piece merged with the prevailing conditions it sits on.
- `FM` and `BECMG` are applied in time order, and nothing earlier runs past an `FM`.
- Anything that makes the forecast less than fully readable is listed in `taf.problems`: a group keyword with no readable time (its conditions are kept apart, never merged into the group before), `FM` groups out of time order, a group outside the valid period, an implausible valid period (over 30 hours, or more than a day from the issue time), or tokens that could not be read.

### Limit checks

V6's thresholds, with Patrick's answers to Q27 (D57) and Q28 (D58), 2026-09-30.

- **Below (red).** A report is below a limit when the ceiling is **strictly below** the ceiling limit, or the visibility is strictly below the visibility limit. This is V6's rule (`<`), confirmed by Patrick (Q27): "below a limit, not at or below".
- **At the limit (yellow).** When nothing is below, a ceiling exactly on its limit or a plain visibility exactly on its limit is `atLimit` (Q27: "at limit can be yellow"). At the home limits, `3SM BKN020` is at the limit, not below it. `M3SM` against a 3 SM limit is below; `P6SM` against a 6 SM limit is not at it.
- `M` visibility counts as below when its number is at or below the limit (`M1/4SM` is below 1/4 SM). `P` visibility counts as below only when its number is below the limit. For limits of 6 SM or less this gives exactly V6's results, which used 0.24 and 6.01.
- **Cautions.** Dangerous weather raises a caution the SOF must acknowledge (Q28: "VCTS and CB/TCU, same with FC or +FC or anything dangerous"). A caution is raised at the station or in the vicinity (`VC`) for:
  - `TS` thunderstorm, in any combination (`TSRA`, `+TSRAGR`, `VCTS`). V6's pattern missed `TSRAGR`; that is a parsing fix.
  - `FC` funnel cloud and `+FC` tornado or waterspout (`VCFC` too).
  - `SQ` squall.
  - `GR` hail and `GS` small hail.
  - `FZRA` and `FZDZ` freezing rain and drizzle, and `PL` ice pellets. V6 missed `FZRAPL`; that is a parsing fix.
  - `VA` volcanic ash, `SS` sandstorm, `DS` duststorm, `PO` dust or sand whirls.
  - `BLSN` blowing snow.
  - Fog at the station: `FG` and `FZFG` (not `MIFG`, `BCFG` or `PRFG`). V6 missed `FZFG`; that is a parsing fix.
  - `CB` or `TCU` on any cloud layer, whatever its cover (`FEW040CB`).

  `DANGEROUS_WEATHER` in `limits.js` exports the weather codes above for the SOF to show.
- **Information only** (Q28): snow (`SN`, `-SN`, `SHSN`), shallow, patchy or partial fog (`MIFG`, `BCFG`, `PRFG`), and other vicinity weather (`VCSH`, `VCFG`, `VCBLSN`). The check returns them in `watch` so the SOF can show them without asking for an acknowledgement.
- An unknown visibility or ceiling is reported as unknown, never as "within limits".
- `checkConditions` returns a `level`, worst first: `below` (red), `caution` (dangerous weather), `unknown`, `at-limit` (yellow), `within`. It also returns the flags behind it (`belowLimits`, `atLimit`, `cautions`, `alert`) and the reasons in V6's wording: `CEILING 1500 FT < 2000 FT`, `CEILING 2000 FT AT LIMIT 2000 FT`, `VIS 3 SM AT LIMIT 3 SM`, `THUNDERSTORM / SEVERE WX (VCTS)`, `SIGNIFICANT WX (FZFG)`, `CB/TCU (FEW040CB)`.

Default limits are V6's WX SETUP defaults: home 2000 ft and 3 SM, alternates 600 ft and 2 SM. The home airfield and alternates list is a setting (R16); `wx` takes the ICAO ids and limits as input.

### Alternates

- **Home trigger.** For a wave window (takeoff to landing plus one hour, as V6), every prevailing period and every overlay touching the window is checked against the home limits. Status is `no-time` when the window can't be read, `no-taf` when there is no usable TAF (missing, `NIL` or `CNL`), `not-covered` when the TAF's valid period does not cover the whole window, else `below` if anything is below, else `incomplete` if a prevailing ceiling or visibility is unknown or the TAF has problems, else `at-limit` if anything is exactly on a limit (Q27, yellow), else `meets`. Hits, at-limit pieces and caution pieces are returned either way, each with the group, its times and the reasons. `TEMPO` and `PROB` count, as in V6. Cautions (Q28) are listed but never change the status, which stays about ceiling and visibility.
- **Alternate airfield over an arrival window (Q30, D60).** Patrick's answer: check alternates over a window, not only at the ETA. The civil rule (CAR 602.123) checks only at the ETA, so a window is stricter. Sources are in `/mnt/project-files/wx-sources/canada-ifr-alternate-rules.md`.
  - **Window.** By default, the wave's earliest ETA minus 60 minutes to its latest ETA plus 60 minutes. `arrivalWindow(etas, { marginMin = 60 })` builds it, and the margin is a setting. A single ETA with a margin of 0 gives V6's point check.
  - **Minima per airfield, as input.** Each alternate brings its own `minima`: one `{ ceilingFt, visSm }` or a list of equivalent options. Conditions **at or above** the minima pass (CAR 602.123); exactly at them shows yellow (D57). The Canada Air Pilot's table: 400-1 (or 200-½ above the lowest HAT) with two or more precision approaches to separate runways; 600-2 with one usable precision approach (also 700-1½ or 800-1); 800-2 with non-precision only (also 900-1½ or 1000-1); 500 ft above the lowest HAT/HAA and 3 SM with only an advisory forecast; no cloud below 1000 ft above it, no CB and 3 SM with only a GFA. Which row applies, and any "300-1 above HAT" values, are the Airfields piece's to enter; `wx` just checks the numbers it is given. A piece passes when it meets any one option. It is below only when it is below every option. It is at-limit when its best option is exactly met. The airfield list and its values belong to the Airfields piece; until it exists, the fallback is V6's single 600/2.
  - **How each part of the TAF counts** (CAP GEN, TC AIM RAC 3.13):
    - Prevailing conditions and FM groups: against the alternate minima.
    - BECMG: against the alternate minima, taking the worse of the before and after conditions over the change period.
    - TEMPO: against the alternate minima.
    - PROB30/40: against the airfield's **landing minima** (`landingMinima`, from its approach plates), not the alternate minima. Without landing minima, a PROB below the alternate minima is listed in `probUnchecked` as a warning and does not change the status.
  - **Status**, worst first: `no-time`, `no-taf`, `not-covered` (the TAF doesn't cover the whole window), `below`, `incomplete`, `at-limit`, `meets`. The result lists every hit, at-limit piece and caution with its times. `worst` names the first-in-time piece with the worst result, so the SOF can show "below from 17Z".
  - **GNSS.** An alternate can be marked `gnssApproach` (it relies on a satellite approach). When home also relies on one (`homeGnssApproach`) and the two are under 100 NM apart (`distanceNm`), or the distance is unknown, `warnings` says so. From Moose Jaw only Saskatoon qualifies. For alternates, no credit is given for LPV, and RNAV with vertical guidance is not a precision approach; both belong in the minima the Airfields piece enters. V6's `needs-mea` and `gnss-check` statuses go away.
  - **For a current SOF to confirm** (question WX-5; the military flying orders aren't public): whether 15 Wing uses the CAP GEN minima or its own; whether the orders set a window; whether PAR counts as a precision approach; any different TEMPO/PROB treatment; the Harvard II's GNSS rules. Until then the defaults above apply.

### Classifications (V6 thresholds, unchanged)

- NATO colour state from the lowest `SCT` or thicker layer and the visibility in metres: RED below 200 ft or 800 m, AMB 300/1600, YLO2 500/2500, YLO1 700/3700, GRN 1500/5000, WHT 2500/8000, else BLU. V6's `nato()` at sof.html line 2009; its parsing bugs are fixed, not its thresholds. `UNK` when a layer's base is unknown and the colour isn't already RED.
- Flight category, used only when the feed does not supply one: LIFR ceiling below 500 ft or visibility below 1 SM; IFR below 1000 ft or 3 SM; MVFR 3000 ft or 5 SM and below; else VFR. V6's `cat()` at sof.html line 576. `UNK` when nothing is known, or when a ceiling layer's base is unknown and the category isn't already LIFR.

### Sources

Patrick's choice, 2026-09-30: MET Norway first, Datamask as the backup. No proxy and no keys, because the site is static and a key in the page is public. Tested from a browser on the live site (`/mnt/project-files/wx-sources/sof-weather-sources.md`).

- **MET Norway tafmetar.** `https://api.met.no/weatherapi/tafmetar/1.0/metar?icao=CYMJ,CYQR` and `.../taf?icao=...`. One request covers every airfield. The response is plain text, one report per line ending in `=`, oldest first, for the whole day. `wx` keeps the newest report per station. Reports carry no `METAR`, `SPECI`, `TAF` or `AMD` prefix, so an unmarked SPECI reads as a METAR. An unknown station is simply missing (HTTP 200, empty body). Licence CC BY 4.0, credited on screen as "MET Norway".
- **Datamask.** `https://datamask.org/api/v1/metar/CYQR` and `.../taf/CYQR`, one airfield per request. JSON; `wx` uses only `raw` and ignores Datamask's own decoding and times. HTTP 404 means no report. A doubled `TAF AMD TAF AMD` prefix is read once by `parseTaf`. Credited as "NOAA NWS via Datamask".
- **Order.** MET Norway is asked for every airfield in one request. Any airfield it has nothing for, or every airfield if it fails, is asked of Datamask one at a time. Each report says which source it came from.
- **Requests.** Plain `GET` with no custom headers, so the browser sends no preflight (MET Norway allows only simple requests). `cache: 'no-cache'` lets the browser revalidate with `If-Modified-Since` itself where the source sends `Last-Modified`. Each request gives up after 10 seconds. Station ids must be four letters or digits before they go in a URL; anything else is refused.
- **Refresh.** Every 5 minutes by default (a setting, never faster than once a minute), with timers passed in so tests control time. A failed refresh keeps the last good report and reports the error; it never clears data.
- **Stale.** A METAR is stale when it is more than 75 minutes old by its own observation time. A TAF is stale when its valid period has ended. A cancelled TAF reads as `cancelled`, not stale or unreadable. A report with no readable time is stale. The fetch time never counts: Datamask has served a 12-day-old METAR as current.
- **Untrusted replies.** A reply over 256 KB, or a report over 4000 characters, is refused, not parsed. A Datamask report for a different station than the one asked for is refused. Only `metar` or `taf` and at most 30 valid station ids ever reach a URL, and requests send no cookies (`credentials: 'omit'`). Raw report text goes to the page as data: the SOF must show it as text, never as HTML.
- `sources.js` is the only module in `wx` that talks to the network. `fetch` and the timers are passed in, so every other rule in this spec (pure functions, no throwing) still holds and it can be tested without a network.

### Data age

- `ageMinutes(report, now)` (in `dates.js`) from the report's observation or issue time, never the fetch time: a feed can serve a report days old as if it were current. The stale rules for METAR and TAF are under "Sources"; how the SOF shows them is its own spec (R13).

## Interface

```js
import { parseMetar } from './src/wx/metar.js';
import { parseTaf, tafTimeline, forecastAt } from './src/wx/taf.js';
import { checkConditions, DEFAULT_LIMITS, natoColour, flightCategory } from './src/wx/limits.js';
import { arrivalWindow, homeAlternateTrigger, assessAlternate } from './src/wx/alternates.js';

const now = new Date('2026-09-29T15:30:00Z');
const taf = parseTaf('TAF CYMJ 291120Z 2912/3012 27010KT P6SM SKC TEMPO 2916/2920 1/2SM FG', { now });
taf.groups[1];          // { kind: 'TEMPO', from: Date(29 16Z), to: Date(29 20Z), conditions: { visibility: { sm: 0.5, ... }, weather: [FG] } }

homeAlternateTrigger(taf, { from: takeoff, to: landPlus1h }, DEFAULT_LIMITS.home);
// { status: 'below', covered: true, hits: [{ kind: 'TEMPO', from, to, reasons: ['VIS 1/2 SM < 3 SM', 'SIGNIFICANT WX (FG)'] }],
//   atLimit: [], cautions: [{ kind: 'TEMPO', ..., cautions: ['FG'] }] }

assessAlternate(taf, arrivalWindow([eta1, eta2]), {
  minima: [{ ceilingFt: 600, visSm: 2 }, { ceilingFt: 700, visSm: 1.5 }, { ceilingFt: 800, visSm: 1 }],
  landingMinima: { ceilingFt: 300, visSm: 0.75 },
});
// { status: 'below' | 'incomplete' | 'at-limit' | 'meets' | ..., hits, atLimit, cautions, probUnchecked, worst, warnings }
```

Every function is pure: plain values in, plain values out, times as `Date` in UTC. Functions never throw on bad text, missing times or missing limits (missing limits fall back to the defaults); they return what they could read plus what they could not.

## Commands

```
node --test 'tests/unit/wx/*.test.js'   # this module's tests
npm test                          # everything, once the app frame adds package.json
```

## Project structure

```
src/wx/
  conditions.js     shared parsing of wind, visibility, weather, cloud; merge; formatting
  metar.js          parseMetar
  taf.js            parseTaf, tafTimeline, forecastAt
  limits.js         DEFAULT_LIMITS, checkConditions, natoColour, flightCategory
  alternates.js     homeAlternateTrigger, assessAlternate
  dates.js          day-of-month times to full UTC dates; ageMinutes
  README.md         what each file does, where to change common things (R8)
tests/unit/wx/
  reports.js        the table of report strings the tests share
  v6-sof.js         loads V6's own SOF functions from original/shell.html
  *.test.js         one per source file, plus v6-compare.test.js
```

## Testing strategy

1. **Table-driven from real reports.** Each case is a real-format report string with the expected parse or result. The table includes each audit bug as its own named case: `TEMPO 2916/2920 1/2SM FG` (#1), BECMG carried past its change period and a leading TEMPO not stretching the base (#2), `BKN015CB`, `SCT025TCU` and `M1/4SM` (#3), an alternate below minima at ETA (#4), and the limit and caution evaluation that never ran in V6 (#5).
2. **Compared with V6.** `v6-compare.test.js` decodes V6's SOF page from `original/shell.html` (as `tools/extract_subapps.py` does), runs V6's own `vals()`, `nato()`, `cat()` and `tafHazards()` on the same reports, and asserts the new code agrees wherever V6 parsed the report correctly, and differs exactly where an audit bug says V6 is wrong.
3. **Dates.** Month and year ends, hour 24, and a TAF that crosses midnight.

## Boundaries

- **Always:** keep functions pure (only `sources.js` fetches, with `fetch` passed in); add a test case for every report that ever parses wrong; cite the audit issue in the test name.
- **Ask first:** changing a default limit, the `<` rule, or which weather raises a caution; adding a data source.
- **Never:** touch the page from `wx`; guess a value the report does not give (unknown stays unknown).

## Open questions (plan doc Questions tab Q27 to Q30)

Logged as Q27 (WX-1) to Q30 (WX-4). Patrick answered all four on 2026-09-30.

- **WX-1 / Q27, answered (D57).** Below stays strictly below (`<`); exactly at a limit is yellow. See "Limit checks".
- **WX-2 / Q28, answered (D58).** `VCTS`, `CB`/`TCU`, `FC`, `+FC` and other dangerous weather raise an acknowledgeable caution; snow and shallow fog stay information only. The list is under "Limit checks".
- **WX-3 / Q29, answered (D59).** The home trigger is 2000 ft / 3 SM, and its label must read 2000/3 to match the check. V6's fixed "DEST TRIGGER <3000 FT / 3 SM" label was wrong; `wx` has no 3000 ft figure, and the SOF builds its label from the limits it passes in, so the label can never drift from the check again.
- **WX-4 / Q30, answered (D60).** Alternates are checked over an arrival window (±1 hour by default) with the Canadian alternate rules. See "Alternates"; Patrick approved this spec change on 2026-09-30.
- **WX-5, open, for a current SOF.** 15 Wing's own flying orders aren't public: whether they use the CAP GEN minima or their own, set a window, count PAR as a precision approach, treat TEMPO or PROB differently, or have GNSS rules for the Harvard II. Until answered, the defaults under "Alternates" apply.
