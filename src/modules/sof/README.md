# SOF Dashboard

The weather screen a Supervisor of Flying keeps open on a desk: the weather now and forecast at home and at the alternates, each report with its age. The spec is [`docs/modules/sof/spec.md`](../../../docs/modules/sof/spec.md); the plan is [`docs/modules/sof/plan.md`](../../../docs/modules/sof/plan.md). This folder holds tasks 1 to 5 so far: the wave, card and caution decisions, and a screen with live weather, the caution banner, the waves and the 24-hour timeline. The map and the rest come in later tasks.

| File | What's in it |
|---|---|
| `index.js` | `mount(root, app)`: builds the screen and wires the weather feed, the airfields, the settings and a slow clock tick to it. Closing the module stops the refresh, cancels every request still out and removes the stylesheet. |
| `weather.js` | The refresh, without a page: wx's `startRefresh` on the module's scheduler scope, restarted when the airfields change, the last good reports kept, a note of which reports the last round really fetched. Tested in Node with fake timers and a fake fetch. |
| `reports-store.js` | The last good reports as kept in the browser (raw text, source, fetch time), and read back checked: shape, station, size and age are verified and each report is parsed again by wx. |
| `screen-model.js` | Everything the screen says, as plain data: the DTG, the weather feed's state in words, the message for every feed failing, one model per airfield card, the credits line. Tested in Node. |
| `cards.js` | The card model for one airfield (task 1): category, NATO state, report ages, stale and missing states, the limit result. `screen-model.js` calls it; it is not edited here. |
| `waves.js` | The wave plan in UTC and the home and alternate calls (task 1). The screen uses its trigger names and limit rules; the waves themselves come on screen in task 4. |
| `feeds.js` | Radar and lightning addresses and feed ages (task 1). Not used by the screen yet: the map comes in task 6. |
| `settings-model.js` | The SOF's settings and their defaults, range-checked on read; limits snapped up to their step; how the trigger choice and the two limit numbers stay in step. Tested in Node. |
| `settings-view.js` | Fills ui-kit's shared "SOF settings" menu with the controls. |
| `layout.js` | The one-screen layout (SOF-38): SOF bar with world clocks and the settings drop-down, the every-feed-failing line, caution strip, timeline, the cards beside the map, and the one-line credits with the map's credits in view. Touches the page only when a word changes. |
| `cards-view.js` | The airfield cards' DOM. Report text goes in as text only, never as HTML. |
| `banner-model.js` | The caution banner as data: one line per caution in words (cautions.js `evaluate`, TAF cautions, wave results, and an `extra` hook), what is new since last drawn, and the acknowledgements to keep (only when `storable`). Tested in Node. |
| `banner-view.js` | The one-line caution strip (lead caution, "+N more", Show all, Acknowledge) and its list that drops over the screen with Acknowledge per line and Acknowledge all; `role=alert` on the strip; focus handed on when a line goes. |
| `plan-store.js` | The wave plan as kept in the browser (key `plan`): up to 5 waves, Today or Tomorrow, checked on read. A Tomorrow chosen on an earlier home-zone day reads as Today. |
| `waves-view-model.js` | The waves list as data: each wave's home-local times with the zone, its chip (call in words, tone, first reason), the list of every hit, and each alternate's result for the selected wave. |
| `waves-view.js` | The waves' DOM. Every input is made once per wave and never rewritten, so typing never loses focus. |
| `timeline-view-model.js` | The 24-hour timeline as data, from timeline.js's model: pieces as percentages of the day, lanes, hatch, cards in words, wave bands, the now line, keyboard stepping. |
| `timeline-view.js` | The timeline's DOM. Redrawn only when the signature changes; the now line moves on its own. One tab stop, arrow keys step through the pieces. |
| `scene3d-model.js` | What the 3D view (SOF-39) shows, as plain data: each airfield's METAR cloud layers as flat decks (`cloudDecks`, base above the field plus its elevation, opacity by cover), the pins with their words (`sceneAirfields`), and the camera's numbers. The cloud-deck rule is tested in Node. |
| `view3d.js` | The 3D view's three.js objects and camera hands: satellite ground with the 2D map's radar and lightning pictures laid on it, pins, decks, the 25 and 50 NM rings, drag to turn, wheel or pinch to zoom, arrow keys. three.js loads when it is first opened; it draws only on change and frees everything when hidden or when the module closes. `map.js` swaps it with the map. |
| `sof.css` | The styles, all under `[data-module='sof']`. Loaded when the SOF opens and removed when it closes. |

## What the screen shows

- **SOF bar:** the DTG, the weather feed in words and a symbol (`Weather 2 min ago ✓`, `Refreshing…`, `STALE 48 min ⚠`, `Failed, showing 12 min old ⚠`, `Off`), and Refresh. Traffic is a map layer (SOF-7, task 7b), not a link here. The feed status can be focused and says where the weather came from and when it asks again.
- **Airfield cards:** home, then each alternate. Each shows the raw METAR and TAF as text with the report's own time and age, `STALE` in words for an old report (greyed), the words for a missing, cancelled or NIL report, `Last refresh failed` for a report the last round couldn't refresh, and the limit result in words.
- **Every feed failing:** its own row above the cards says so, names which sources failed and when, and says how old the reports still shown are. The cards keep the last reports.
- **Settings:** one closed menu, "SOF settings", holds the alternate trigger (Local (MTCA) 2000/3 by default, or Cross-country 3000/3) and the two limit numbers. A typed limit snaps up to the next 100 ft or quarter mile when committed, so the box shows what the check uses. The banner switch and the lightning radius have defaults (`SETTINGS_DEFAULTS`) but get their controls in tasks 3 and 7. Reset puts every setting back. Stored settings are range-checked on read.

- **Caution banner:** one line per caution with its level in words and a symbol; Acknowledge and Acknowledge all. Marked words inside the report are not built yet (wx exposes no word positions). "Show the new-caution banner" in SOF settings turns it off (on by default); cautions are still worked out and acknowledgements pruned. The lightning hook is `screen.extraCautions`.
- **Waves:** up to 5, home local time with the zone, Today or Tomorrow. Each has a chip; pressing it lists every hit and shows that wave's result on each alternate card. New waves start with blank times.
- **24-hour timeline:** a row per airfield, Zulu axis first (Local first follows the app setting) with a local row, NATO-state pieces labelled in words, hatched when below limits, wave bands with landing and +1 h marks, the METAR mark and the now line. Hover or focus shows the card in words. Open by default; the choice is kept under `timelineCollapsed`.
- **3D view (SOF-39, phase 1):** the **3D** button in the map controls swaps the map area for a 3D picture of the 250 NM square round home (it reads **2D** while shown, and the ADS-B Exchange view and 3D never show together). Satellite ground, radar and lightning on it with the same stale fading, home and alternates as pins with their category in words, each METAR's cloud layers as flat decks 10 NM across, the 25 and 50 NM rings, and "Heights ×5" in the corner. Drag to turn, wheel or pinch to zoom, Home (or the Home key) resets. A pin is a button that shows its card's result line, and the camera never moves on a click. An airfield outside the square is named, not drawn. No WebGL: the button stays and says why on hover. Nothing in it raises or clears a caution.
- **Model clouds, winds aloft and the freezing level (SOF-39, phase 2):** while the 3D view is shown it asks Open-Meteo's GEM forecast (free, no key, CC BY 4.0) for a 9 × 9 grid over the square, once on opening and then once an hour. Each grid column's cloud levels (cover over 30 %) become soft blocks with a base and a top; wind barbs (pennant 50 kt, feather 10, half 5; °M, kt) stand at 850, 700 and 500 hPa at every other grid point; one faint sheet marks the mean freezing level. Low, Mid, High, Winds and Freezing level are toggle buttons (all on), and a slider moves the model layers from Now to +24 h (Zulu, with home local beside it); the METAR decks, radar and lightning stay at now, and the view says so. A closed "Model key" explains it and the winds over home, and "Model clouds and winds: Open-Meteo, ECCC GEM (model estimate)" stays on while the layers show. A failed refresh keeps the last good answer on screen until it is 3 hours old, saying "Model refresh failed at 1030Z, showing the 0900Z answer (90 min old)"; past 3 hours (or with no answer yet) the layers are taken away (never frozen) and the panel says "Model clouds unavailable, showing METAR decks only" with the time of the last good answer (or "not yet"). It asks again after 10 minutes. A reply that fails its checks counts as a failed refresh. It is a model estimate and never raises or clears a caution.

## Changing something

- **The 3D height scale:** "3D height scale" in SOF settings (`heightScale3d`, 5 by default, 1 to 20; an estimate for readability, SOF-39). The view's corner says the number in use.
- **How solid a cloud deck is:** `COVER_OPACITY` in `scene3d-model.js` (FEW 25 %, SCT 45 %, BKN 70 %, OVC 90 %; estimates, SOF-39). The deck width is `DECK_NM` (10) and the square is `AREA_NM` (250).
- **The model layers' numbers** (`model-clouds.js`): the grid (`GRID_SIZE` 9, so 31.25 NM apart), the variables and levels (`HOURLY_VARIABLES`, `CLOUD_LEVELS_HPA`, `WIND_LEVELS_HPA`), the cloud line (`CLOUD_COVER_THRESHOLD_PCT`, 30 %; estimate, SOF-39), the low, mid and high stages (`CLOUD_STAGES_FT_AGL`: 6,500 and 20,000 ft above the ground), how long an answer is kept (`STALE_MS`, 3 hours), how often it is asked for (`REFRESH_MS`, 1 hour) and the retry after a failure (`RETRY_MS`, 10 minutes; an estimate). How the blocks, barbs and sheet look (colours, opacity, barb size) is in `model-layers3d.js`.
- **How sharp the 3D ground is:** `GROUND_ZOOM` and `GROUND_PX` in `view3d.js` (Esri zoom 8, a 1,024 px square: about 16 to 25 tiles, so it loads fast; an estimate).
- **How often the weather is asked for:** `REFRESH_MS` in `weather.js` (5 minutes, D67). `wake()` refreshes at once when the tab comes back and a round is due.
- **When the weather feed reads STALE:** `STALE_FEED_MIN` in `screen-model.js` (15 minutes, three missed rounds). A single report's own staleness (75 minutes for a METAR, a TAF past its end) is wx's, through `cards.js`.
- **How long a kept report is still shown:** `MAX_KEEP_MS` in `reports-store.js` (3 days). It shows with its age and STALE.
- **A limit's step:** `RANGES` in `settings-model.js`; limits always snap up, never down.
- **A default setting:** `SETTINGS_DEFAULTS` in `settings-model.js`. The trigger presets themselves are wx's (`HOME_TRIGGERS`).
- **The credits line:** `CREDITS` in `screen-model.js`. Add each new source here as its layer lands.
- **The card's layout:** `children()` in `cards-view.js`, and the classes in `sof.css`.

## Things to know

- **What's kept in the browser** (through `app.storage`, scope `sof`): the settings, the last good reports, the wave plan (`plan`), the acknowledged cautions (`cautionAcks`) and whether the timeline is closed (`timelineCollapsed`). If the browser blocks storage they last for the visit only.
- **The 3D view reads the 2D map's pictures** (`pictures3d` in `map.js`): the radar and lightning feeds keep running while 3D is shown and nothing is fetched twice. The picture covers what the 2D map last asked for, which is wider than the square at the opening zoom; if the 2D map was zoomed in far before 3D was opened, the picture on the 3D ground covers only that part. The backup radar (RainViewer tiles) is not drawn in 3D.
- **The model feed** (`createModelFeed` in `model-clouds.js`, started by `map.js` when 3D opens and stopped when it closes) asks through `map-fetch.js` (20 s timeout, 3 MB cap, no cookies, no redirects) and keeps the last good answer in memory only. Its reply is checked field by field in one function (`checkModelReply`: 81 points, the same times and array lengths for every variable, every number finite and in range); one wrong value fails the whole reply. A `null` is no data for that one value (cloud cover null is not cloudy, a null height drops that level, a null wind draws no barb, a null freezing level is left out of the mean), but nulls in more than half of all the values fail the reply too ("Model data incomplete"). Wind direction is shown in °M with 9° East variation (Patrick, TR-65); `MAG_VARIATION_DEG_E` in `model-clouds.js` repeats Traffic's number because modules do not import each other and there is no shared copy yet.
- **Timers** come only from the module's scheduler scope: the refresh's 5-minute timer (via wx's `startRefresh`) and one 15-second tick that redraws ages and the DTG. Requests are made with an abort signal that unmount fires.
- **Chrome logs a 404 as a console error.** Datamask answers 404 for a station it doesn't have, and that is logged by the browser, not by this code. It only happens when MET Norway has no report for a station, which is also when the card says `No METAR from MET Norway or Datamask`.

## Tests

```
node --test 'tests/unit/sof/*.test.js'     # waves, cards, feeds, and this screen's model, refresh and storage
npm run build && npx playwright test tests/e2e/sof.spec.js   # once the registry entry is in
```

The browser tests serve every reply from `tests/fixtures/sof/screen-*`, never a live feed.
