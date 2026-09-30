# SOF #207 recheck (map: radar, lightning, cloud, warnings, traffic, ADS-B Exchange view; tasks 6 and 7)

Checker: independent read-only sub-agent for the Verification thread, 30 Sep 2026, about 13:20Z to 14:45Z.
Build under test: commit 064458e (PR #207) in worktree `wt-sof`, built with `npm run build`, served by `vite preview` on port 4307, Chromium (Playwright) at 1440x900 unless stated. Live site: https://lizardhands-commits.github.io/Dads-debreif/#/sof was serving build 7d5c981, which contains 064458e (checked in `live2.mjs`).
Nothing pushed, committed or edited in the repo. Scripts: `findings/scripts/sof207/*.mjs` (lib, synth, reg, reg2, axis, layers, togglediff, failover, failtime, failures, lightning, lightning2, lightning3, radius, radius2, geo-sanity, traffic, traffic2, adsbx, csp, axe, axe2, axe3, kb, kb2, layout, perf, hidden, ltgvis, ltgcontrast, realltg, seam2, cloudseam, zoomvnc, ackreload, live1, live2). Screenshots: `/mnt/project-files/verification/shots/sof-207/` (46 files).

## How I tested (and what I could not)

- The sandbox proxy re-signs TLS, so Chromium cannot reach the internet directly. I ran Chromium with no proxy and answered every non-localhost request through Node's fetch (`NODE_USE_ENV_PROXY=1`, TLS still verified), giving the page the real headers and bytes. So the live-data checks used the real servers: ECCC GeoMet (radar, coverage, lightning, GOES, warnings, capabilities), Esri, MET Norway, Datamask, RainViewer's list, ADS-B Exchange's page. Hosts reached: geo.weather.gc.ca, services.arcgisonline.com, api.met.no, datamask.org, api.rainviewer.com (200 for the list; tile host 404 on its root, as expected), globe.adsbexchange.com (200), api.adsb.lol (302).
- Where the real world could not give me the case (a lightning cell at a chosen distance, ECCC failing, a relay answering), I used a synthetic ECCC responder (`synth.mjs`: PNG encoder, capabilities XML, cells and markers at exact lat/lon, fail modes) and `page.clock` for time. Those checks are marked "synthetic".
- The traffic relay is not deployed (`relay/traffic.js` exists, 45 tests). I fed the page a fake relay at `https://traffic.test.workers.dev` (a fixture reply shaped like the relay's). I did not test the real Worker or adsb.lol through it.
- A content security policy was simulated by adding a header to the localhost document, using the host list in `/mnt/project-files/sof/hookup/csp.md` plus the fake relay host.
- Real lightning data: over the hour I looked, the real ECCC lightning layer had 5 to 15 lit pixels per frame somewhere in the 1 km-scale picture, all at alpha 255 and colour (0,0,190) (`realltg.mjs`). None was near Moose Jaw, so the near-home distance and level checks are synthetic.

## Suites as shipped

| Suite | Result |
|---|---|
| `node --test tests/unit/sof/*.test.js` | 706 pass, 0 fail |
| `node --test tests/unit/relay/*.test.js` | 45 pass, 0 fail |
| `playwright test tests/e2e/sof.spec.js tests/e2e/sof-map.spec.js --project=chromium` (PW_PORT=4307) | 95 passed |

So every finding below is a gap those tests do not cover.

## Summary

| Severity | Count | IDs |
|---|---|---|
| High | 1 | F1 |
| Medium | 7 | F2, F3, F4, F5, F6, F7, F8 |
| Low | 6 | L1 to L6 |
| PILOT JUDGEMENT (question for Dad, inside findings) | 3 | PJ1 (with F1), PJ2 (with F3), PJ3 (default radius) |
| Not built (not bugs) | 4 | see end |

Top 5:
1. F1 An unacknowledged near-home lightning caution silently leaves the banner when the next refresh fails or goes stale; only the strip under the map says "Can't tell".
2. F4 Lightning cells are drawn dark blue at 1.04 to 1.42 : 1 contrast against the satellite, so they are nearly invisible on the map.
3. F2 The traffic layer keeps polling the relay in a hidden tab (52 requests in 10 min against 54 visible), against spec line 265.
4. F3 The GOES cloud layer reads STALE most of the time (ECCC's real lag is 25 to 38 min; the limit is 30).
5. F7 and F6 The relay address is a typed setting (spec says a build setting), so a CSP cannot list it; with the banner off, lightning shows only in a strip that starts about 1,000 px down the page.

## Findings

### F1 (High) A near-home lightning caution disappears from the banner when the reading goes bad; nothing on the banner says "can't tell"

- Where: `src/modules/sof/map-loops.js` (`createLightningWatch`), `lightning.js`, `screen-model.js` `cautions`; the banner reads `screen.cautions`.
- Steps (synthetic, `lightning2.mjs`, `lightning3.mjs`): cell 12 NM east of CYMJ, radius 20 NM. Banner shows "Caution: CYMJ lightning: about 12 NM east of home, within 20 NM" with Acknowledge. Do not acknowledge. Make the next 10-minute GetMap return 503 (or let the layer time go past 30 min).
- Expected: SPEC-sof line 117 makes lightning near home a caution; D278 says a failed or stale reading is "can't tell", never clear. A pilot at the SOF desk should not lose a live warning because a feed hiccuped. Either the caution stays (marked "last reading N min old") or the banner says "Lightning: can't tell".
- Actual: after the failed refresh the banner is empty (`banner []`). Only the strip under the map says "Lightning map failed, showing 11 min old ⚠" and "Can't tell: no lightning data ?". Same at 31 min stale ("Can't tell: lightning data is 39 min old ?", banner empty) with the cell still 10 NM east. If the caution had been acknowledged, nothing is lost; the problem is the unacknowledged case, which is the one that matters. If the feed never answers from the start, there is no banner line either (`fail caps`, `fail map`, `fail xml`, `fail empty`, `fail size`, `fail trunc` all: banner empty, strip "Can't tell").
- Screenshot: `/mnt/project-files/verification/shots/sof-207/lightning-caution-vanishes.png`; also `lightning-feed-fails.png`.
- Known or planned: not known. D278 is the right rule for "clear" but does not say what happens to a live caution.
- PILOT JUDGEMENT (PJ1): question for Dad: when the lightning picture is 10 to 40 minutes old and the last good picture had lightning inside the radius, should the banner keep saying so until a good picture says clear? Recommendation: yes. Keep the caution with the words "last reading 11 min ago, cannot refresh", and add a plain "Lightning: can't tell" banner line (not red, not counted as clear) when there was no earlier good reading. A false "nothing on the banner" is the unsafe side.
- Missing test: `tests/unit/sof/map-loops.test.js`, "a failed or stale refresh while a near-home caution is showing keeps the caution (marked old) or raises a can't-tell line in `screen.cautions`"; and `tests/e2e/sof-map.spec.js`, "banner still shows the lightning caution after the next lightning GetMap fails".

### F2 (Medium) The traffic layer keeps asking the relay while the tab is hidden

- Where: `map-loops.js` `createTrafficFeed` has no `paused()` check; `map.js` line 139 defines `paused = () => document.hidden || adsbOn` and gives it to the picture feeds but not to the traffic feed.
- Steps (`hidden.mjs`): traffic on with the fake relay; run 10 minutes on the fake clock visible, then 10 minutes with the tab hidden.
- Expected: SPEC-sof line 265: "The map's pictures and traffic pause while hidden and catch up when it is shown again." Also line 187 for the ADS-B view (the map is not drawn while it is on).
- Actual: visible 10 min: relay 54, ECCC capabilities 5, GetMap 5, near-home box 1. Hidden 10 min: relay 52, capabilities 1, near-home box 1, no other picture (correct). On showing the tab again the pictures catch up (4 GetMap in 2 s, correct). So only traffic ignores the pause. Over 2 hours idle with every layer on: 645 relay requests. A tab left open all night is about 8,600 requests a day against the relay's free 100,000, so eleven forgotten tabs would use it all. From the code (not measured) the traffic feed also keeps polling while the ADS-B view has the canvas hidden.
- Screenshot: none (numbers only).
- Known or planned: no.
- Missing test: `tests/unit/sof/map-loops.test.js`, "createTrafficFeed makes no request while paused() is true and asks at once when it turns false"; `tests/e2e/sof-map.spec.js`, "no relay request while the tab is hidden".

### F3 (Medium) The GOES cloud layer says STALE most of the time, because the 30 minute limit is shorter than ECCC's real delay

- Where: `map-feeds.js` `EXTRA_LAYERS` and the shared 30 minute limit; `map-view.js`/feed line.
- Steps: Layers menu, Satellite cloud picture (GOES) on. Live site as well (`live2.mjs`).
- Expected: a layer that is updated as fast as its provider allows should not read STALE in normal running (SPEC-sof lines about "stale after 30" for lightning; GOES is "every 10 min" in the layer table).
- Actual: measured against ECCC's own capabilities at 14:42Z: GOES-West default time 14:10Z, a lag of 32 min; earlier at 14:17Z the default was 13:40Z (37 min). Radar lag was 6 min and lightning 12 min (real, `realltg.mjs`). Live site: "Cloud STALE 1350Z (38 min ago) ⚠". Local run with the real feed: "Cloud STALE 1340Z (37 min ago) ⚠". A stale layer is also drawn faded. The layer is nearly always "STALE", so the word stops meaning anything, and a real outage cannot be told from normal running. Lightning has the same shape in a milder form: real lag 12 to 18 min plus a 10 min refresh gives up to 28 min, close to the 30 min limit (`Can't tell` starts at 30).
- Screenshot: `/mnt/project-files/verification/shots/sof-207/layer-cloud.png`, `live-site-layers.png`, `csp-all-layers.png`.
- Known or planned: no.
- PILOT JUDGEMENT (PJ2): question for Dad: is a cloud picture up to an hour old still useful on a SOF desk? Recommendation: stale limit 60 min for GOES (nothing else depends on it), keep 20 min for radar and 30 min for lightning, and make the lightning limit 40 min or start counting from the fetch as well.
- Missing test: `tests/unit/sof/map-feeds.test.js`, "a GOES picture whose layer time is 35 min old reads fresh" (uses the real lag as the fixture).

### F4 (Medium) Lightning cells are nearly invisible on the map

- Where: `map-draw.js`/`map.js` draw of the lightning strips; ECCC's layer colour is not changed.
- Steps: lightning on (default), satellite base, opacity 85% (default). Zoom levels 6 (default) and zoomed in (`ltgvis.mjs`, `ltgcontrast.mjs`); a synthetic 5 NM cell cluster, and the real frames.
- Expected: a warning layer should be readable. WCAG 2.1 1.4.11 asks 3 : 1 for graphics that carry meaning (frontend-ui-engineering checklist, accessibility reference).
- Actual: ECCC draws lit pixels as (0,0,190) at alpha 255 (real frames, `realltg.mjs`). At 85% over satellite the cell measures about (11,11,166) against surroundings of about (49,50,69) to (69,75,36): contrast ratios 1.04, 1.09, 1.09, 1.21 and 1.42 in the first six of the 23 cells I measured. A cell is 2.5 km, about 3 px at the default zoom. Nothing else marks it (no ring, no label, no marker at the position the near-home caution names).
- Screenshot: `/mnt/project-files/verification/shots/sof-207/lightning-visibility-zoom6.png`, `lightning-visibility-zoomed.png`, `lightning-visibility-crop.png`.
- Known or planned: no.
- Recommendation: recolour the lit pixels (yellow or white with a dark outline, a minimum 4 px mark), which is a draw-side change and does not touch the data.
- Missing test: `tests/unit/sof/map-draw.test.js`, "lightning cells are recoloured to a colour with at least 3 : 1 contrast against the satellite and the dark base"; `tests/e2e/sof-map.spec.js`, "a synthetic cell is at least 4 px and readable in a screenshot crop".

### F5 (Medium) No legend or units on the map; lightning strength is never shown

- Where: `map-layers.js` labels, `map.js`; no legend code exists in the SOF map (`grep -i legend` finds only form legends).
- Steps: open the map with radar, coverage and lightning on; open the Layers menu.
- Expected: check item 1 asks for legend units; a radar or lightning colour should have a key or unit somewhere (rain rate, flash density). ECCC's own layer title reads "Lightning Flash Density over Canada (2.5 km) [flash/km²/min]".
- Actual: the menu says "Radar (rain or snow) 75%", "Lightning density, last 10 min 85%"; no colour key, no unit. The code treats "opacity as strength" (`map-lightning.js` header: "its opacity is its strength"), but every real lit pixel is alpha 255, so the strength is always full: a single flash and a storm look the same and the "density" in the label is not shown. The near-home reading likewise uses "any non-see-through pixel".
- Screenshot: `/mnt/project-files/verification/shots/sof-207/layers-menu-default.png`, `layers-menu-open-1440.png`.
- Known or planned: no.
- Missing test: `tests/e2e/sof-map.spec.js`, "each image layer in the Layers menu shows its unit or a colour key"; `tests/unit/sof/map-lightning.test.js`, "a real ECCC lit pixel (0,0,190,255) is read as lightning, and the docs say strength is not available" (pins the real colour).

### F6 (Medium) With the banner switched off, near-home lightning shows only in a strip far below the fold

- Where: `settings-view.js` banner switch and hint; `map.js` strip; `layout` of the SOF page.
- Steps (`radius2.mjs`, `layout.mjs`): SOF settings, banner off, cell 40 NM north with radius 50.
- Expected: SPEC-sof line 117 (caution on the banner); if the banner is switched off the user has chosen that, but the switch's hint should say lightning is then only in the map strip, and the strip should be findable.
- Actual: banner `[]`; the home card does not mention lightning (`mentions lightning: false`); the only sign is the strip line "Lightning about 40 NM north of home, within 50 NM ⚠". In `layout.mjs` at 1280x800 the map starts at y=505 and its status strip is at y=1040 (below a 800 px viewport, scroll needed); at 1440x900 the map starts at y=505 too (canvas y 505 to 1097). The status strip and the near-home lightning line are therefore not visible without scrolling in the default state.
- Screenshot: `/mnt/project-files/verification/shots/sof-207/layout-1280x800.png`, `lightning-radius-setting.png`.
- Known or planned: no.
- Recommendation: keep the strip but also put lightning near home (and a can't-tell state, see F1) on the home card, which is always above the fold, and say so in the banner switch's hint.
- Missing test: `tests/unit/sof/screen-model.test.js`, "the home card carries the lightning result when the banner is off"; `tests/e2e/sof-map.spec.js`, "near-home lightning is visible in the first viewport at 1280x800".

### F7 (Medium) The traffic relay address is a typed setting; the spec says a build setting, and a CSP cannot list it

- Where: `settings-view.js` (`relayField`), `settings-model.js` (`relayAccepted`); SPEC-sof "Live traffic layer ... Setup: the relay's address is a build setting ... until the address is set, the layer's switch is hidden."
- Steps (`traffic.mjs`): before an address is typed the Traffic button is hidden (pass). Type `http://evil.example` and `https://traffic.test.workers.dev/x`: both refused with "Not used: it needs https:// and only the address, nothing after it." and zero requests (pass). Type `https://traffic.test.workers.dev`: the layer appears and asks `GET /traffic?lat=50.33&lon=-105.56&nm=100`.
- Expected: one address, set once by Patrick in the build, covered by the CSP list.
- Actual: every browser needs the address typed in; any `https://` host is accepted. `csp.md` itself says the relay origin is "not known yet: it is the address Patrick types". With a CSP, a different typed host is blocked by `connect-src` and the layer shows "Traffic unavailable" with nothing saying the policy blocked it. D280 logs when the box is committed but not that the address moved from a build setting to a typed one.
- Screenshot: `/mnt/project-files/verification/shots/sof-207/traffic-on.png`, `traffic-unavailable.png`.
- Known or planned: partly known (csp.md), planned for when the relay exists. The spec text and the build disagree; one of them needs to change.
- Missing test: `tests/unit/sof/settings-model.test.js`, "relayAccepted accepts only the build's relay origin (or an https origin when no build value is set, and says which)".

### F8 (Medium) The Layers menu cannot be dismissed from most places, and it is last in the tab order

- Where: `map-controls.js` (Escape handler on the panel and the Layers button only; the panel comes after the canvas in the DOM).
- Steps (`kb.mjs`, `kb2.mjs`): open the menu with Enter.
- Expected: frontend-ui-engineering and the accessibility checklist: a popup that covers content closes with Escape from anywhere in it or on the page, or by a click elsewhere; Tab from the button reaches the first control in the menu.
- Actual: Escape on the Layers button: closes, focus stays on the button (pass). Escape inside the panel, on a radio or a slider: closes, focus returns to the button (pass). Escape with focus on the Home button: menu stays open. Escape with focus on the map canvas: menu stays open. A click elsewhere on the page: menu stays open. Tab from the Layers button to the first control inside the open menu takes 7 presses (Zoom in, Zoom out, select, Home and the canvas come first). At 1280 the menu is 352 px of the 826 px map, 43%.
- Screenshot: `/mnt/project-files/verification/shots/sof-207/layers-menu-open-1440.png`.
- Known or planned: no.
- Missing test: `tests/e2e/sof-map.spec.js`, "Escape closes the Layers menu from the canvas and the zoom buttons; the first Tab from the Layers button lands in the menu".

## Low

### L1 Faint horizontal seams in the cloud and coverage layers below 100% opacity
- Where: `map-draw.js` `drawGeoImage` overlaps neighbouring strips by 1 px (12 strips).
- Steps (`seam2.mjs`): cloud on at 60% (default), coverage 60%. Rows brighter than their neighbours by more than 4 levels: cloud 60%: rows 113, 254, 400, 554, 715 (23 to 33 levels); coverage 60%: rows 52, 121, 190 (11 to 15); cloud 100%, warnings 60%: none. `cloudseam.mjs` in a 200 px crop found none my scan could see, so it is cosmetic.
- Screenshot: `/mnt/project-files/verification/shots/sof-207/seam-cloud60.png`, `seam-cov.png`, `cloud-seams-crop.png`.
- Missing test: `tests/unit/sof/map-draw.test.js`, "strips do not overlap when the layer is see-through" (draw at alpha 0.6 and compare rows).

### L2 The strip can show "STALE" and "No lightning within 20 NM ✓" next to each other
- Steps (`lightning3.mjs`): tab hidden for 60 min. Strip: "Lightning map STALE 1410Z (1 h 1 min ago) ⚠" and "No lightning within 20 NM of home ✓". This is correct (the picture is paused while hidden; the near-home check runs on its own fixed box, spec line 265 and D278) but reads as a contradiction.
- Recommendation: word the map line "Lightning map paused (tab hidden)" while paused.
- Missing test: `tests/unit/sof/map-feeds.test.js`, "a paused feed line says paused rather than STALE".

### L3 ADS-B Exchange view brings ads and trackers; the frame's own accessibility failures show in axe
- Steps (`adsbx.mjs`, `axe.mjs`): switch the view on. 69 requests to ADS-B Exchange and third-party hosts (doubleclick, linkedin, facebook, twitter, hotjar, googletagmanager, pub.network and others) inside the frame. axe with the view on: 8 violations, all inside the frame (for example a critical `button-name` on `iframe #altitude_chart_button`). Not our code.
- Our side is right: `src=https://globe.adsbexchange.com/?lat=50.33&lon=-105.559&zoom=6`, `sandbox="allow-scripts allow-same-origin"` (cross-origin, so it cannot reach our page), `referrerpolicy="no-referrer"`, `allow=""`, title "ADS-B Exchange live traffic map", fallback link `rel="noopener noreferrer" target=_blank`, frame removed on off with zero requests 3 s later and focus returned to the map canvas.
- Recommendation: add a line on the switch: "ADS-B Exchange's page carries its own ads and tracking." Spec already covers the terms.
- Screenshot: `/mnt/project-files/verification/shots/sof-207/adsbx-on.png`, `axe-ADS-B-Exchange-view-on-menu-open.png`.
- Known: partly (SPEC-sof "ADS-B Exchange terms"). Missing test: none possible for third-party content; `tests/e2e/sof-map.spec.js` could assert the help line.

### L4 axe "incomplete" items need a human look (not violations)
- `axe.mjs`, `axe3.mjs`: every layer on, menu open or closed, dark and light, and the banner plus wave hit list at 1280x800: 0 violations. Incomplete: `aria-prohibited-attr` on 4 timeline labels (`div[aria-label="CYMJ home: TAF cancelled"]` and three more; timeline code, not in this PR) and `color-contrast` on glyph-only nodes (the check marks, Zoom out "−"), 19 to 22 nodes.
- Missing test: `tests/e2e/sof.spec.js`, "timeline labels use a role that may carry aria-label".

### L5 D280's wording does not match the build
- D280 says "Map defaults: VNC over satellite at 70%". The build (and the spec's layer table) starts on Satellite; only the VNC-over-satellite opacity starts at 70% (radio "Satellite" checked, slider "VNC chart opacity 70%" disabled). Same row does not mention F7's spec change. Fix the log text.

### L6 VNC zoom message reads the same when zoomed in as at any zoom
- `zoomvnc.mjs`: the live region says "Zoomed in. The VNC charts cover Moose Jaw, Regina, Saskatoon and Swift Current. Outside them the satellite picture shows." for VNC and VNC over satellite, and "Zoomed in." for satellite. Correct; only note: the credits line still says "Esri, Maxar ..." with VNC on. `zoom-cymj-vnc.png`, `zoom-cymj-vncsat.png`, `zoom-cymj-sat.png` show the airport in the right place on all three (I did not judge chart alignment; that is the debrief's PJ4).
- Missing test: none needed. (Listed so the pass is not lost.)

## PILOT JUDGEMENT items

- PJ1 (with F1): keep a live lightning caution while the picture is old or failed? Recommendation: yes, marked old, until a good picture says clear.
- PJ2 (with F3): stale limit for the cloud picture. Recommendation: 60 min; do not let the lightning limit be reached by normal lag.
- PJ3 default radius: the default 20 NM (range 5 to 50) is V6's number. The T-6A NFM Section VII, "Lightning Strikes", p. 7-4, notes cloud-to-cloud lightning has been seen travelling up to 50 miles, and a cell reads "within 20 NM" when its centre is up to about 1 NM beyond (the reading is the cell edge). Question for Dad: is 20 NM right for a SOF's caution, and should there be a second, wider information level at 50 NM? Recommendation: keep 20 NM (Patrick's SOF-3 default), and show 50 NM as an information-only line on the strip (not the banner).

## What PASSED

1. Layers (`layers.mjs`, `togglediff.mjs`): default menu: Satellite base; radar 75%, coverage 60%, lightning 85%, rings, airfields on; cloud 60%, warnings 60%, routes 80% off; Military only and Labels present. Every layer switches on and off and the canvas changes (cloud 3,879 px, radar 1,887, coverage 2,004, lightning 287, warnings 2,756, routes 11,935, rings 3,536, airfields 4,866; switching off changes about the same number back); opacity 75 to 100 changes 2,208 px, 100 to 10 changes 2,652 px; base VNC and VNC over satellite change about 78,000 px and Satellite again returns to within 234 px. Snow chosen requests `RADAR_1KM_RSNO`.
2. Real data (`layers.mjs`, `live2.mjs`): each layer's time comes from ECCC's per-layer GetCapabilities default time and the age is that time, for example "Radar 1312Z (6 min ago) ✓", "Lightning map 1300Z (18 min ago) ✓", "Warnings as fetched 1330Z (just now) ✓" (no layer time, worded honestly). Credits name Esri and ECCC, and RainViewer only while it is used.
3. Placement (`reg.mjs`, `reg2.mjs`, `axis.mjs`): synthetic markers at the real lat/lon of CYMJ, CYQR, CYYN and CYXE in the ECCC pictures (the view's EPSG:3857 and the near-home EPSG:4326 box) landed within 0.3 to 1.1 px of the projected position at 1.19 px/NM (under 1 NM). The 4326 and 3857 pictures agree on 3,997 of 4,000 sampled pixels (`axis.mjs`). geo-sanity: 1 degree of latitude 60 NM, bearings 0/89/180/271 as expected, CYMJ to CYQR 34.7 NM against haversine 34.74.
4. Radar backup (`failover.mjs`, `failtime.mjs`): GetMap 503, XML exception, empty body, wrong-size PNG, truncated PNG each show "Radar failed, nothing to show ⚠" (or "showing 11 min old") in words; a first failure retries at 20.5 s and RainViewer takes over ("Radar (RainViewer backup) 1330Z (3 min ago) ✓", credit line names RainViewer, 16 RainViewer requests, max zoom 6 tiles); when ECCC answers again at the next ordinary round (6 min) the backup is dropped and credited off. Capabilities failure goes to RainViewer within 0.5 s. D277 matches the build.
5. Failure and offline states (`failures.mjs`, screenshots): every ECCC failure mode gives a word state, never a silent empty picture; lightning failures always read "Can't tell", never "clear"; offline shows the map message and still draws dots and rings.
6. Lightning near home (`lightning.mjs`, `lightning2.mjs`, `radius.mjs`, synthetic): due north sweep 5, 15, 19, 19.5, 20, 20.5 NM read "about 4, 15, 18.6, 19.2, 19.9, 19.9 NM, within 20 NM" (edge of the cell, up to 1 NM nearer than the centre, the safe side); 21 NM reads "about 20.6 NM north of home, at the edge of the 20 NM radius"; 21.5, 22, 23 NM read "No lightning within 20 NM (nearest about 21.3 / 21.9 / 23 NM north) ✓" with no banner; 30, 49, 51 NM clear. Bearings 0 to 315 in 45 degree steps read N, NE, E, SE, S, SW, W, NW correctly at 12 NM. A cell at home reads "about 1 NM north-west". Empty valid picture reads clear. Layer age 0 to 29 min gives the caution; 31, 35, 60 min give "Can't tell: lightning data is N min old ?". Radius setting: typed 50 finds a 40 NM cell ("within 50 NM"), 5 works, 4 and 51 show "Enter a number from 5 to 50 NM." and the check keeps using the last good value (5 for 4). Clear-down: a clear reading removes the caution, and a new cell later raises a new banner line; an acknowledged caution stays acknowledged while the same cell lasts, across a page reload and after leaving the SOF and coming back (`ackreload.mjs`). Near-home check runs with the lightning layer off (banner appears with cell 8 NM north and the layer off) and with the tab hidden for 60 min (6 requests, 10 min apart, and no other picture). No runaway: 12 lightning refreshes in 60 min visible.
7. Antimeridian and poles (`geo-sanity.mjs`, synthetic): `lightningNearHome` finds a strike 8 NM across the antimeridian (home at 179.95E, "about 8 NM east", 7.7 NM) and across the pole (89.9N: "about 12 NM north"). `lightningBox` returns null near 179.9E/W and at 86N and above (so it can't tell, fails safe); Alert at 82.5N and the equator give a box. Not a problem for CYMJ.
8. Traffic (`traffic.mjs`, `traffic2.mjs`, fake relay): request is `GET .../traffic?lat=50.33&lon=-105.56&nm=100` with no cookie, no key and no Authorization header (Origin, User-Agent, Accept only). The built SOF chunk holds no key; grep hits were help text. Positions: fresh aircraft drawn within 0.5 to 1.1 px of the projected place; military marked; ground aircraft hollow. Altitude in words: "FL350", "GND", "4,500 ft pressure altitude", "17,900 ft pressure altitude" (below 18,000), "FL180", "-300 ft pressure altitude", "Altitude unknown". Old positions fade, and go at about 60 s; "Position age unknown" handled; relay down: strip "Traffic unavailable, last good 1414Z ⚠" and the aircraft are removed (`No traffic on the map.`); an HTML captive-portal reply and a 5 MB reply give "Traffic unavailable ⚠"; a hostile reply (script in the callsign, extra fields, huge numbers) leaves 0 injected nodes and the good aircraft still show. Keyboard: `]` and `[` step through aircraft and the live region reads their facts.
9. ADS-B Exchange frame (`adsbx.mjs`, `csp.mjs`): sandbox `allow-scripts allow-same-origin` on a cross-origin address (adsbx.js refuses the page's own origin); the strip says "ADS-B Exchange's own map is showing. Radar, lightning and airfields are not drawn over it."; the map's own controls (Home, zoom, Rain/Snow, Traffic) are disabled while it is on and enabled again after; frame removed, no requests after 3 s, focus back on the map. Under a simulated CSP with `frame-src https://globe.adsbexchange.com` the frame loads.
10. Security (`csp.mjs`, code read): simulated CSP `default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https://api.met.no https://datamask.org https://geo.weather.gc.ca https://api.rainviewer.com <relay>; img-src 'self' https://services.arcgisonline.com https://tilecache.rainviewer.com; frame-src https://globe.adsbexchange.com; object-src 'none'; base-uri 'self'; form-action 'self'`: with every layer on, both VNC charts, cloud, warnings, traffic and the frame, 0 CSP violations. No host missing, and none of the listed ones is unused. The page only contacted geo.weather.gc.ca, services.arcgisonline.com, api.met.no, datamask.org (and the relay, RainViewer when used). No `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, `srcdoc` or inline style attributes in the SOF or `h()`; strings go in as text. Pictures are size-checked and the PNG trailer is checked; no redirects are followed; no cookies. Live site has no CSP at all (csp.md: the page has no policy yet; known).
11. Accessibility (`axe.mjs`, `axe3.mjs`): 0 violations with every layer on, menu open and closed, dark and light schemes, 1440x1300 and 1280x800 with the caution banner and a wave hit list open. Keyboard: the Layers button is a real button with `aria-expanded`; Enter opens; `+` and `-` zoom the map; `[` and `]` step through traffic with a live region.
12. Layout (`layout.mjs`): 1280x800, 1280x720, 1024x768, 768x1024 and 390x844: no horizontal scroll (scroll width equals window width), the menu panel is inside the map and scrolls inside, no bar controls overlap each other (the bar wraps to 2 rows at 1280 and 3 at 1024).
13. Performance (`perf.mjs`): 30 rounds of switching all 10 layers off and on plus base and Rain/Snow changes: 300 requests, listeners 232 before and after, subscriptions 2, timers 11, nodes 1302 to 1306. 2 hours idle with everything on: 805 requests (645 relay, 160 ECCC, nothing else), nodes and listeners unchanged, heap 3.6 to 5.2 MB. Leaving the SOF: mounted "home", timers 2; 60 minutes away: 0 SOF requests; coming back restores 4 listeners, 2 subscriptions, 11 timers. (The traffic polling in a hidden tab is F2.)
14. Live site (`live1.mjs`, `live2.mjs`): https://lizardhands-commits.github.io/Dads-debreif/#/sof shows the map with real ECCC radar and coverage, "Lightning map 1410Z (18 min ago) ✓", "No lightning within 20 NM of home ✓", Esri tiles, four airfields with "Within limits", no banner. Hosts: github.io, geo.weather.gc.ca (14), api.met.no (2), services.arcgisonline.com (49). The service worker could not register in my routed browser (my test rig, not the site). Screenshots `live-default.png`, `live-site-sof.png`, `live-site-layers.png`.

## R1 to R11 (from `sof-recheck-197.md`)

Not in this PR and not re-reported. The PR touches only map files, `index.js`, `layout.js`, `screen-model.js`, `settings-model.js`, `settings-view.js`, `sof.css` (git diff stat); none of `banner-model.js`, `banner-view.js`, `cautions.js`, `cards.js`, `waves*.js`, `timeline*.js` changed. I re-ran `sof01.mjs`, `br.mjs`, `clip.mjs` on this build: R1 (a below-limit TEMPO fog covered by a wave still raises "Below limits" at 22:00Z after it ended) and R3 (TEMPO 1SM BR OVC003 with no wave: banner empty, only the timeline "TEMPO YLO2 below") are unchanged; R5's cut-off timeline label text ("TEMPO YLO2 below") is unchanged. I did not re-run the others; nothing in the diff touches them, so I expect them unchanged.

## Logged decisions D277 to D280 against SMM, manuals and spec

- D277: agrees with the as-built spec section and with my measurement (backup at 20.5 s).
- D278: agrees with spec line 265 (as built) and with my measurement; it stops short of what happens to an existing caution (F1).
- D279: agrees with spec (ADS-B terms); measured as logged.
- D280: "VNC over satellite at 70%" reads as the default base, but the build and the spec table default to Satellite (L5); and the relay box timing is logged but not the move from build setting to typed setting (F7). No entry contradicts the SMM or the manuals; the map has no formation content. The NFM p. 7-4 reference is in PJ3.

## Not built (not bugs)

- The Blitzortung "Lightning map" link and the per-card "Runway view" link (task 7; spec "Not built").
- Moving the VNC charts and route overlays to a shared place (the SOF still imports `debrief/map2d/vnc.js`, spec "still owed").
- The traffic relay is not deployed, so live traffic through the real Worker was not tested (F7 setup owed).
- The CSP is not in `index.html`; the hook-up list is `csp.md` (app frame).

## Audit (auditor agent, read-only). Its corrections override the text above. Every finding still holds on main (1a8185c, includes #221).
| Finding | Verdict | Corrected facts |
|---|---|---|
| F1 near-home lightning caution vanishes on a failed or stale refresh | Confirmed HIGH | map-loops.js:73 passes null whenever failures>0, even with a 10 min old picture. lightning.js then gives "can't tell" and screen-model.js:114 sends nothing, so the banner line drops and comes back unacknowledged. A one-off 503 blanks it for about 20 s; an outage blanks it until ECCC recovers. The spec (line 178, D278) says "never clear" but is silent on keeping a live caution. |
| F4 lightning contrast on satellite | Raised to HIGH | 1.02-1.41:1 against WCAG 1.4.11's 3:1. Fails the spec's named test (line 314, V6 #9 "lightning is visible"). |
| F6 banner off: lightning only below the fold | Confirmed Medium, stronger | The banner-switch help (settings-view.js:58) says "The airfield cards show every caution either way", which is false for lightning. |
| F3 GOES stale at 30 min | Confirmed Medium | Measured a 31 min lag at 14:51Z. Cloud borrows lightning's limits (map.js:150), and the spec gives GOES none (line 157). Cloud does NOT fade (only lightning and radar do). Lightning's worst case is about 28 of 30 min, which feeds F1. |
| F7 relay is a typed setting | Confirmed Medium (spec conflict) | Line 167 (approved) says a build setting; line 180, added by this PR, says typed. D280 is not logged. Low security risk: replies are text-only. For Patrick to choose. |
| F2 traffic polls hidden | Lowered to Low | Traffic is already off while the ADS-B view is on (map.js:400). Within the spec budget (line 164). |
| F5 no legend | Lowered to Low | No spec line requires one. The map-lightning.js:9 comment is wrong (all pixels are alpha 255). |
| F8 Layers menu Escape | Lowered to Low | Non-modal disclosure. The real issue is focus order: the panel sits after the canvas (map.js:112), about 7 Tabs away (WCAG 2.4.3). |
PJ3: 20 NM is V6's number (SPEC-sof 207, SOF-3). NFM Sec VII p.7-4 gives up to 50 miles with no unit. No manual gives an NM radius, so this is for Dad.
