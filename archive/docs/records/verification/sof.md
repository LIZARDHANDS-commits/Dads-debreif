# SOF Dashboard: verification findings

Checker: independent sub-agent. Checked on `origin/main` f35aaad (includes #174 screen with live weather, #177 traffic-layer model and lightning logic, #178 home-card hookup marked PROTOTYPE, #180 screenshot comparison). Opened from `#/sof` in Chromium at 1366x768, 1920x1080 and 390x844, with the weather hosts served from the sample files in `/mnt/project-files/wx-sources/samples/` (Playwright route fixtures, fake clock) and again with the hosts blocked. Nothing pushed, committed or edited in the repo. Scripts: `scratchpad/findings/scripts/sof1.mjs` to `sof7.mjs`; screenshots in `/mnt/project-files/verification/shots/sof/`.

Authorities: SPEC-sof (approved 2026-09-30), `weather-and-limits-numbers.md` (Gen Book p.7 to p.10), `wx-sources/canada-ifr-alternate-rules.md`, decisions D57 to D81, D95, D111.

## What exists, and what does not

| Piece | State on main |
|---|---|
| On screen | SOF bar (DTG, feed status in words and a symbol, Refresh), the closed SOF settings menu (trigger choice, ceiling and visibility boxes, banner and lightning radius have no controls yet), the every-feed-failing message, airfield cards (home first, then alternates, 4 by default), credits line. |
| Built and unit-tested but **not on screen yet** | `cautions.js` (banner list, acknowledge), `waves.js` (wave times to UTC, home call, alternate calls), `timeline.js` (24-hour model), `lightning.js`, `traffic.js`, `feeds.js` for radar and lightning. No banner, no waves panel, no timeline, no map, no radar, no lightning, no traffic layer, no world clocks or other-airfields panel appear. Those are tasks 3 to 8 in `tasks/sof/`. |
| Not built at all | Crosswind (FF21; needs runway data FF20), take-off and filing minima, per-activity limits, GFA alternate. `weather-and-limits-numbers.md` lists these as "not built" too. |

Because the banner, waves and timeline are not drawn, I tested `cautions.js`, `waves.js` and `timeline.js` in Node with real and hand-written reports (`sof3.mjs`, `sof4.mjs`, `sof5.mjs`).

## Summary

| Severity | Count | IDs |
|---|---|---|
| High | 0 | |
| Medium | 1 | SOF-01 (PILOT JUDGEMENT, engine only) |
| Low | 2 | SOF-02, SOF-03 |
| Not built yet (not bugs) | 8 | see list at the end |

Top items:
1. SOF-01 The banner's TAF window starts at the beginning of the local day, so a forecast thunderstorm that ended hours ago still raises a caution (engine only; the banner is not on screen yet).
2. SOF-02 A green tick sits beside "Within limits (STALE report)".
3. SOF-03 The banner keeps acknowledgements per calendar day at home, so a caution acknowledged at 23:50 comes back as new after midnight even if it never cleared (by design, worth knowing).
4. Everything else that could be reproduced agreed with the manual, the spec and the decisions (list of passes below).

## Findings

Every finding names the test that should have caught it.

### SOF-01 (Medium, PILOT JUDGEMENT) Elapsed TAF periods raise banner cautions
- Where: `src/modules/sof/cautions.js` `bannerWindow` and `tafCautionsForBanner`; not yet drawn on the screen.
- Steps (`sof4.mjs` F): a home TAF issued 06Z with a TEMPO of TSRA and CB from 08Z to 10Z; now is 23:00Z (17:00 CST). Call `tafCautionsForBanner({ tafs, now, timeZone: 'America/Regina' })` and `cautionList`.
- Actual: `Caution: CYMJ TAF TEMPO 30/08Z-30/10Z: THUNDERSTORM / SEVERE WX (TSRA)` and `CB/TCU (BKN040CB)` are listed 13 hours after the period ended. The window is from 06:00Z (start of today at home, `localToUtc(today, 0)`) to the later of the end of today and now plus 12 h.
- Expected: SPEC-sof "Caution banner" says the banner lists "every unacknowledged caution ... the TAF group and its times". It does not say past forecast periods count. A forecast that is over is not something to act on; a SOF opening the page in the evening would be told about the morning's weather.
- Known or planned: no; the code comment states the window as a choice.
- PILOT JUDGEMENT: should a forecast caution that ended before now raise the banner? Recommendation (owner acts on it): start the window at now minus 1 h (so a period that has only just ended, or the last METAR-observed weather, still shows) and keep the look-ahead to the later of the end of today and now plus 12 h. Elapsed periods stay visible on the timeline, not in the banner. Cards already show METAR cautions for what is happening now.
- Missing test: `tests/unit/sof/cautions.test.js`: "a TAF caution whose period ended more than an hour before now is not in the banner list" (fails today).

### SOF-02 (Low) A green tick beside a stale result
- Where: airfield cards, result line, e.g. CYYN in `/mnt/project-files/verification/shots/sof/03-feed-down-86min.png`: "check mark Within limits (STALE report)" after the feed has been down 76 minutes. The words carry the warning, the card is outlined and the report shows `STALE: 2 h 21 min old` in red just above; but the green tick is the same one shown for a fresh report.
- Expected: SPEC-sof stale rules say stale data must be unmistakable and never read as "fine" (R7, "colour is never the only signal"). A tick is a "good" symbol.
- Recommendation: replace the tick with the warning triangle used in the bar when the report is stale (`cards.js` `resultModel` already knows `stale`). Not a flight-answer error, hence Low.
- Known or planned: no.
- Missing test: `tests/unit/sof/cards.test.js` and `tests/e2e/sof.spec.js`: "a stale METAR card does not show the within-limits tick".

### SOF-03 (Low, by design, worth knowing) Acknowledgements reset at local midnight
- Where: `cautions.js` `readAcks` (the day is the home zone's calendar day; another day reads as nothing acknowledged).
- Steps (`sof3.mjs` B7 and B8): acknowledge a TS caution on 30 Sep; the same TS is still in the METAR after 06:00Z (00:00 CST) on 1 Oct: it is new again. `ackDay` flips at exactly 06:00Z.
- Expected: SPEC-sof says acknowledgements "are kept for the day" and SOF-4 says it stays acknowledged "while the same airfield keeps reporting the same thing". A storm that spans midnight is one storm.
- Recommendation: keep the day reset (it bounds storage and matches the spec's wording), but carry over any caution that is still reported at the first refresh after midnight, or note it in the help text. Low.
- Missing test: `tests/unit/sof/cautions.test.js`: "a caution acknowledged at 23:50 and still reported at 00:05 stays acknowledged" (or the opposite, if Patrick wants the reset, pinned as intended).

## Caution and timeline logic checked in Node (all correct unless listed above)

`sof3.mjs`, `sof4.mjs`, `sof5.mjs`, plus `sof1.mjs` for wx's alternate and home rules.

- **Acknowledge lifecycle (SOF-4).** A VCTS plus FEW040CB METAR gives two cautions. After Acknowledge, the same weather in the next report (new time) is not new. When it clears, its keys are dropped; when it returns it is new. A different caution at the same field (TSRA instead of VCTS) is new. A missing METAR keeps the acknowledgements (a source that can't be read is not a caution that cleared). Storage is checked on read-back (day, shape, key count and length).
- **What raises a caution (D58) and what does not.** Raised: TS and VCTS, +FC, FZRA, FZFG, GR, PL, DS, BLSN, CB and TCU on any layer, plain FG, and any report below its limits. Not raised: at the limit (ceiling exactly 2,000 ft or visibility exactly 3 SM), VCSH, BCFG, VCFG, plain snow (below-limits only when the visibility falls under 3 SM). Matches SPEC-wx "Cautions" and `limits.js`.
- **Reasons are wx's own words**, e.g. `CEILING 1500 FT < 2000 FT`, `VIS 2 SM < 3 SM`, `THUNDERSTORM / SEVERE WX (VCTS)`, `SIGNIFICANT WX (FG)`; the TAF lines name the group and times (`TAF TEMPO 30/20Z-30/23Z`).
- **Home call (Gen Book p.7).** Local (MTCA) 2000/3 and Cross-country 3000/3 (D111): ceiling 2,500 ft meets Local and is below Cross-country; exactly 2,000 and exactly 3,000 are "at the limit"; visibility 3 SM is at the limit, 2 1/2 SM below. The window is takeoff to landing plus 1 h: a TEMPO ending exactly at the window start or starting exactly at its end does not count. PROB and TEMPO fog inside the window count as below for the home trigger; BECMG worsening counts from its start; a TAF that ends before the window is "not covered", and a hit before it ends is still "ALTERNATE REQUIRED (TAF doesn't cover the whole wave)". NIL and cancelled TAFs read "No TAF".
- **Alternate rules (Gen Book p.7).** Minima 600-2 default: ceiling 600 and visibility 2 SM are "at the limit"; 500 ft and 1 1/2 SM are below. TEMPO checked against the alternate minima; PROB against the landing minima only (no landing minima given: "unchecked", never "below"); BECMG improving counts only after its end, worsening from its start; the window is the landing time plus and minus 60 min (D70); a FM at the exact window end does not count and at 16:29 does. Visual descent from the MEA (D80): ceiling under MEA minus elevation plus 500 (3,107 ft for MEA 4,500 and 1,893 ft field) is below; one foot over meets. A visual descent with no MEA is "incomplete", never hatched.
- **Wave times.** Moose Jaw is fixed CST (UTC-6, no clock change): 14:00 CST is 20:00Z, a landing at 01:00 is the next day (04:00Z to 07:00Z on the 1st); the home window is takeoff to landing plus 1 h; an evening wave lands on the Zulu-first timeline (x = 0.917 to 1.0). For America/Edmonton the day is 23 h on the spring change (8 Mar) and 25 h on the fall change (1 Nov).
- **Timeline (`timelineModel`).** The day is the home zone's local day; Zulu row first then local; prevailing lane and TEMPO/PROB/BECMG overlay lane; each piece has its NATO colour and `below` when wx's home or alternate check says so, so the timeline cannot disagree with the wave call (checked: the home TEMPO fog piece 21Z to 23Z is `AMB, below limits`, and the W1 home call reports the same 21Z reason). The now line sits at 0.708 for 17:00 CST. A piece that runs off the day is cut and marked `clippedStart/End`.
- **Lightning (`lightningNearHome`).** Inside 20 NM: state near, "Lightning about 12 NM north-east of home, within 20 NM", and a caution in the banner's shape. Outside: clear, with the nearest cell named. Stale (45 min) or no coverage of home plus radius: "Can't tell", never clear. Radius clamps to 5 to 50 NM.

## Screen checks (browser)

- **Fresh at 01:55Z with the samples:** bar `300155Z SEP 26`, `Weather just now` with a tick, four cards: CYMJ home (METAR 0027Z, 1 h 28 min old, TAF 0030Z valid 30/00 to 30/12, "TAF cancelled"), CYQR, CYYN, CYXE (no reports in the sample: "No METAR from MET Norway or Datamask (last tried 0155Z)"). CYMJ's METAR is 88 min old and not shown as stale because it says LAST OBS / NXT 011000Z and the card says "No obs until 1000Z", "Within limits (last observation)"; that is the closed-station rule. `/mnt/project-files/verification/shots/sof/01-sample-0155Z.png`, `/mnt/project-files/verification/shots/sof/05-layout-1366x768.png`.
- **Auto refresh (D67):** 4 requests per 5-minute round (two stations per source), rounds at +5 and +10 min. Hidden-tab and wake behaviour were not exercised.
- **Feed down:** after 16 min the bar reads STALE; at 76 min `Weather Failed, showing 1 h 16 min old` with a warning symbol and the message `Weather feeds are not answering (MET Norway and NOAA NWS via Datamask both failed at 0317Z). Showing the last reports, 1 h 16 min old.`; each card shows `STALE: 2 h 21 min old` and `Last refresh failed (tried 0317Z)`, and keeps its last report. Recovery: Refresh brings back `just now`. `/mnt/project-files/verification/shots/sof/02-feed-down-16min.png`, `/mnt/project-files/verification/shots/sof/03-feed-down-86min.png`.
- **Hosts blocked from the start:** `Failed, no reports yet`, message `No reports are being shown yet.`, no console errors. `/mnt/project-files/verification/shots/sof/04-blocked-hosts.png`.
- **Settings menu (`/mnt/project-files/verification/shots/sof/06-settings-open.png`, `07-settings-crosscountry.png`, `08-settings-invalid.png`):** closed by default. Typing 2,050 ft snaps up to 2,100 on Enter and the trigger reads Custom (2100/3); 2.6 SM snaps to 2.75; the card label reads `Limits: Custom 2100/2¾`. Choosing Cross-country fills 3000/3 and the card reads `Cross-country 3000/3`. 99999 and -100 show `Enter a number from 0 to 10,000 ft.` and the check keeps the last good value; 11 SM shows the visibility message. Reset to defaults returns 2000/3. The choice survives a reload (`Custom 2500/3`). Custom cannot be chosen from the list.
- **Layout:** no horizontal scroll and no covered control at 1366x768 (page 14 px taller than the window, footer partly below), 1920x1080 (fits) and 390x844 (single column, 2,136 px tall). `shots/05-layout-*.png`. No console errors in any run.

## Logged decisions checked

`decisions-for-review.md` has no row for the SOF. Nothing in it contradicts the SOF spec. D111 (Local 2000/3 and Cross-country 3000/3) matches Gen Book p.7.

## PILOT JUDGEMENT summary

- SOF-01: recommendation above (start the banner window at now minus 1 h).
- Trigger snapping up to the next 100 ft or quarter mile (safe side): recommendation keep.
- Closed station "last observation" rule (a stale METAR with a NXT time in the future shows "Within limits (last observation)"): recommendation keep; it is the honest reading of a station that stops reporting overnight.

## Not built yet (per the plan, not bugs)

1. Caution banner on screen (task 3). 2. Waves and the home/alternate calls on screen (task 3). 3. 24-hour timeline drawing (task 5). 4. Map, radar and lightning drawing (task 6). 5. Traffic layer and the ADS-B Exchange view (task 7 onwards). 6. Other airfields panel, world clocks, large text, About screen. 7. Crosswind check (FF21) and runway data (FF20). 8. Banner on/off and lightning radius controls in the settings menu.

## Audit (second checker, Opus, ~10:30Z)
- SOF-01 TAF banner window starts at local midnight: CONFIRMED (a TEMPO TS that ended 13 h and 3 h earlier both still raise the banner). Medium. Not V6 (V6's box never ran, #5), but tests/unit/sof/cautions.test.js:512 pins the midnight start on purpose. Recommendation: start the window at now − 1 h, amend that test, log the decision for Patrick's review.
- Lows as written; not-built items listed as not built.
