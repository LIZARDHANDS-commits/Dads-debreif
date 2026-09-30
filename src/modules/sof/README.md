# SOF Dashboard

The weather screen a Supervisor of Flying keeps open on a desk: the weather now and forecast at home and at the alternates, each report with its age. The spec is [`specs/SPEC-sof.md`](../../../specs/SPEC-sof.md); the tasks are in [`tasks/sof/`](../../../tasks/sof/todo.md). This folder holds tasks 1 and 2 so far: the wave and card decisions, and a screen with live weather. Cautions, the timeline, the map and the rest come in later tasks.

| File | What's in it |
|---|---|
| `index.js` | `mount(root, app)`: builds the screen and wires the weather feed, the airfields, the settings and a slow clock tick to it. Closing the module stops the refresh, cancels every request still out and removes the stylesheet. |
| `weather.js` | The refresh, without a page: wx's `startRefresh` on the module's scheduler scope, restarted when the airfields change, the last good reports kept, a note of which reports the last round really fetched. Tested in Node with fake timers and a fake fetch. |
| `reports-store.js` | The last good reports as kept in the browser (raw text, source, fetch time), and read back checked: shape, station, size and age are verified and each report is parsed again by wx. |
| `screen-model.js` | Everything the screen says, as plain data: the DTG, the weather feed's state in words, the message for every feed failing, one model per airfield card, the Traffic link and the credits line. Tested in Node. |
| `cards.js` | The card model for one airfield (task 1): category, NATO state, report ages, stale and missing states, the limit result. `screen-model.js` calls it; it is not edited here. |
| `waves.js` | The wave plan in UTC and the home and alternate calls (task 1). The screen uses its trigger names and limit rules; the waves themselves come on screen in task 4. |
| `feeds.js` | Radar and lightning addresses and feed ages (task 1). Not used by the screen yet: the map comes in task 6. |
| `settings-model.js` | The SOF's settings and their defaults, and how the trigger choice and the two limit numbers stay in step. Tested in Node. |
| `settings-view.js` | Fills ui-kit's shared "SOF settings" menu with the controls. |
| `layout.js` | The screen: SOF bar, the settings menu, the every-feed-failing message, the cards and the credits line. Touches the page only when a word changes. |
| `cards-view.js` | The airfield cards' DOM. Report text goes in as text only, never as HTML. |
| `sof.css` | The styles, all under `[data-module='sof']`. Loaded when the SOF opens and removed when it closes. |

## What the screen shows

- **SOF bar:** the DTG, the weather feed in words and a symbol (`Weather 2 min ago ✓`, `Refreshing…`, `STALE 48 min ⚠`, `Failed, showing 12 min old ⚠`, `Off`), Refresh, and a Traffic link (ADS-B Exchange's live map, opened in a new tab, centred on the home field).
- **Airfield cards:** home, then each alternate. Each shows the raw METAR and TAF as text with the report's own time and age, `STALE` in words for an old report (greyed), the words for a missing, cancelled or NIL report, `Last refresh failed` for a report the last round couldn't refresh, and the limit result in words.
- **Every feed failing:** its own row above the cards says so, names which sources failed and when, and says how old the reports still shown are. The cards keep the last reports.
- **Settings:** one closed menu, "SOF settings", holds the alternate trigger (Local (MTCA) 2000/3 by default, or Cross-country 3000/3), the two limit numbers, the caution banner switch and the lightning radius. The banner and the radius are saved now and used when the cautions and the lightning check arrive (tasks 3 and 7). Reset puts every setting back.

## Changing something

- **How often the weather is asked for:** `REFRESH_MS` in `weather.js` (5 minutes, D67). `wake()` refreshes at once when the tab comes back and a round is due.
- **When the weather feed reads STALE:** `STALE_FEED_MIN` in `screen-model.js` (15 minutes, three missed rounds). A single report's own staleness (75 minutes for a METAR, a TAF past its end) is wx's, through `cards.js`.
- **How long a kept report is still shown:** `MAX_KEEP_MS` in `reports-store.js` (3 days). It shows with its age and STALE.
- **A default setting:** `SETTINGS_DEFAULTS` in `settings-model.js`. The trigger presets themselves are wx's (`HOME_TRIGGERS`).
- **The credits line:** `CREDITS` in `screen-model.js`. Add each new source here as its layer lands.
- **The card's layout:** `children()` in `cards-view.js`, and the classes in `sof.css`.

## Things to know

- **What's kept in the browser** (through `app.storage`, scope `sof`): the settings, and the last good reports. If the browser blocks storage they last for the visit only.
- **Timers** come only from the module's scheduler scope: the refresh's 5-minute timer (via wx's `startRefresh`) and one 15-second tick that redraws ages and the DTG. Requests are made with an abort signal that unmount fires.
- **Chrome logs a 404 as a console error.** Datamask answers 404 for a station it doesn't have, and that is logged by the browser, not by this code. It only happens when MET Norway has no report for a station, which is also when the card says `No METAR from MET Norway or Datamask`.

## Tests

```
node --test 'tests/unit/sof/*.test.js'     # waves, cards, feeds, and this screen's model, refresh and storage
npm run build && npx playwright test tests/e2e/sof.spec.js   # once the registry entry is in
```

The browser tests serve every reply from `tests/fixtures/sof/screen-*`, never a live feed.
