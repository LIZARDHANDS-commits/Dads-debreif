# Spec: `wx`, weather parsing and limit checks

Status: **approved by Patrick on 2026-09-30.** Module id `wx` in [`SPEC.md`](../SPEC.md). Requirements: R13 (SOF), R16 (home airfield and alternates are a setting), R7 (no browser errors), R9 (numbers match V6 unless a logged decision says otherwise).

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
- `alternates.js`: the home-weather alternate trigger over a wave window, and the alternate airfield check at ETA.

Out, for now:

- `sources.js` (live fetching from aviationweather.gov and the backup, D33) waits for an environment whose network reaches those sites.
- Lightning (D34), radar and anything that touches the page.
- Deciding what a limit should be. `wx` takes limits as input; the SOF gets them from settings.

## Assumptions

1. Reports are in North American format as the SOF shows them today: visibility in statute miles (`15SM`, `1 1/2SM`, `M1/4SM`, `P6SM`), with metric visibility (`9999`, `0800`) and `CAVOK` also understood.
2. A raw report string is the input. JSON from a feed is the adapter's job; the adapter passes the raw text through.
3. A report only carries day-of-month. Every parse takes a reference time (`now`) and resolves days to the nearest matching month, so reports around month ends work.
4. Nothing in `wx` imports `src/core/` until the flight-math thread's first PR merges. The one conversion it needs (metres to statute miles, 1609.344) is a local constant, to be swapped for `core/units.js` later.
5. `node --test` only, no packages.

## Behaviour

### Parsing rules

- Everything after `RMK` is ignored for conditions and kept as `remarks`.
- Tokens are read one at a time, so a TAF period like `2916/2920` can never be read as visibility (issue #1).
- Visibility: `M` means "less than" and `P` means "more than". The value keeps its number and a qualifier: `M1/4SM` is `{ sm: 0.25, qualifier: 'less' }` (issue #3, V6 read it as 4 SM). A whole number joins a following fraction only when it is one or two digits (`1 1/2SM`). A fraction of a mile is always below one, so `11/2SM` is read as `1 1/2SM` with the space dropped (V6 read 5.5). Metric visibility is converted to SM; `9999` means 10 km or more. `CAVOK` means 10 km or more, no cloud that matters, no weather.
- Cloud: `FEW`, `SCT`, `BKN`, `OVC`, `VV` with a base in hundreds of feet, and an optional `CB` or `TCU` kept on the layer (issue #3: `BKN015CB` is a 1500 ft ceiling, V6 saw no ceiling). `///` base means unknown. `SKC`, `CLR`, `NSC`, `NCD` and `CAVOK` mean an explicit clear sky, which a change group uses to clear the cloud it inherited.
- Ceiling: the lowest `BKN`, `OVC` or `VV` layer. `null` means no ceiling. The ceiling is **unknown** when such a layer has a `///` base, or when there is no cloud group at all and no `SKC`/`CLR`/`NSC`/`NCD`/`CAVOK`.
- Times: a report's observation or issue time is the latest matching date no more than an hour after `now`, since reports are never written in the future. Group times resolve to the date nearest the valid period, so a group starting just before it stays in its own month. Impossible values (day 32, hour 25) give no time.
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

### Limit checks (V6 behaviour kept)

- A report is below a limit when the ceiling is **strictly below** the ceiling limit, or the visibility is strictly below the visibility limit. This is V6's rule (`<`), kept until someone decides otherwise (question WX-1).
- `M` visibility counts as below when its number is at or below the limit (`M1/4SM` is below 1/4 SM). `P` visibility counts as below only when its number is below the limit. For limits of 6 SM or less this gives exactly V6's results, which used 0.24 and 6.01.
- Thunderstorm or severe weather: any `TS` at the station, plus `FC` and `SQ`. V6's pattern missed `TS` combined with more than one precipitation type (`TSRAGR`); that is a parsing fix.
- Significant weather: freezing rain or drizzle, `PL`, `GR`, `GS`, `BLSN`, and fog (`FG`, including `FZFG`). V6 missed `FZFG` and `FZRAPL` because of how its pattern was written; that is a parsing fix.
- Reported but not yet raised as a caution, pending question WX-2: `VCTS` and other vicinity weather, `CB`/`TCU` layers, snow, and shallow or patchy fog (`MIFG`, `BCFG`, `PRFG`). The check returns them in their own fields so the SOF can show them.
- An unknown visibility or ceiling is reported as unknown, never as "within limits".

Default limits are V6's WX SETUP defaults: home 2000 ft and 3 SM, alternates 600 ft and 2 SM. The home airfield and alternates list is a setting (R16); `wx` takes the ICAO ids and limits as input.

### Alternates

- **Home trigger.** For a wave window (takeoff to landing plus one hour, as V6), every prevailing period and every overlay touching the window is checked against the home limits. Status is `no-time` when the window can't be read, `no-taf` when there is no usable TAF (missing, `NIL` or `CNL`), `not-covered` when the TAF's valid period does not cover the whole window, else `below` if anything is below, else `incomplete` if a prevailing ceiling or visibility is unknown or the TAF has problems, else `meets`. Hits are returned either way, with the group, its times and the reason. `TEMPO` and `PROB` count, as in V6.
- **Alternate airfield at ETA.** The same check at the ETA with the alternate limits, prevailing plus any overlay active at that time. This replaces V6's alternate cards, which showed green whatever the weather (issue #4). If the ETA is missing, the TAF is missing or cancelled, does not cover the ETA, or part of it cannot be read, the status says so (`no-time`, `no-taf`, `not-covered`, `incomplete`) instead of passing. An ETA exactly where one period ends and the next begins is checked against both.
- **GNSS-only alternates.** V6 lets the SOF mark an alternate GNSS-only with an MEA. V6 never computed a result for it and said so on the card. `wx` keeps that: the result carries `gnssOnly` and `meaFt`, and a status of `needs-mea` when the MEA is missing. No visual-descent rule is invented (question WX-4).

### Classifications (V6 thresholds, unchanged)

- NATO colour state from the lowest `SCT` or thicker layer and the visibility in metres: RED below 200 ft or 800 m, AMB 300/1600, YLO2 500/2500, YLO1 700/3700, GRN 1500/5000, WHT 2500/8000, else BLU. V6's `nato()` at sof.html line 2009; its parsing bugs are fixed, not its thresholds. `UNK` when a layer's base is unknown and the colour isn't already RED.
- Flight category, used only when the feed does not supply one: LIFR ceiling below 500 ft or visibility below 1 SM; IFR below 1000 ft or 3 SM; MVFR 3000 ft or 5 SM and below; else VFR. V6's `cat()` at sof.html line 576. `UNK` when nothing is known, or when a ceiling layer's base is unknown and the category isn't already LIFR.

### Data age

- `ageMinutes(report, now)` (in `dates.js`) from the report's observation or issue time. What counts as stale is the SOF's call (R13) and lives in its spec.

## Interface

```js
import { parseMetar } from './src/wx/metar.js';
import { parseTaf, tafTimeline, forecastAt } from './src/wx/taf.js';
import { checkConditions, DEFAULT_LIMITS, natoColour, flightCategory } from './src/wx/limits.js';
import { homeAlternateTrigger, assessAlternate } from './src/wx/alternates.js';

const now = new Date('2026-09-29T15:30:00Z');
const taf = parseTaf('TAF CYMJ 291120Z 2912/3012 27010KT P6SM SKC TEMPO 2916/2920 1/2SM FG', { now });
taf.groups[1];          // { kind: 'TEMPO', from: Date(29 16Z), to: Date(29 20Z), conditions: { visibility: { sm: 0.5, ... }, weather: [FG] } }

homeAlternateTrigger(taf, { from: takeoff, to: landPlus1h }, DEFAULT_LIMITS.home);
// { status: 'below', covered: true, hits: [{ kind: 'TEMPO', from, to, reasons: ['VIS 1/2 SM < 3 SM', 'SIGNIFICANT WX (FG)'] }] }
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

- **Always:** keep functions pure; add a test case for every report that ever parses wrong; cite the audit issue in the test name.
- **Ask first:** changing a default limit, the `<` rule, or which weather raises a caution; adding a data source.
- **Never:** touch the page from `wx`; guess a value the report does not give (unknown stays unknown).

## Open questions (plan doc Questions tab Q27 to Q30)

Logged as Q27 (WX-1) to Q30 (WX-4), for Dad or a current SOF. Until they are answered, the code keeps V6's behaviour.

- **WX-1.** Is "below a limit" strictly below (`<`, V6) or at-or-below (`<=`)? At 2000 ft, is `BKN020` below the home limit?
- **WX-2.** Should any of these raise a caution: thunderstorm in the vicinity (`VCTS`), `CB` or `TCU` cloud, snow, shallow or patchy fog? V6 raises none of them.
- **WX-3.** V6's wave panel shows "DEST TRIGGER <3000 FT / 3 SM" as a fixed label, while its check uses 2000 ft / 3 SM. Which is the real home trigger, and does 3000 ft belong anywhere?
- **WX-4.** For the alternate check, is the ETA a point in time (V6) or a window (for example ETA ±1 hour)? And what weather does the GNSS-only visual-descent branch need?
