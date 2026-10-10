# flight-data: flight tracks for the debrief

Reads ForeFlight track logs (KML), puts up to four aircraft on one map and one playback window, and says where each one was and what it was doing at any moment. The debrief's 2D map, 3D view, readouts and EM chart all read from here. The spec is [`docs/modules/debrief/spec.md`](../../docs/modules/debrief/spec.md).

| File | What's in it |
|---|---|
| `xml.js` | A small, strict XML reader. Refuses anything that isn't well-formed, and any DOCTYPE, so a hostile file can't expand entities or reach other files. |
| `kml.js` | `readKml(text, name)`: the fixes of one track file (position, altitude, time, recorded G and pitch), sorted by time. Refuses KMZ files, files over 30 MB and more than 200,000 fixes. |
| `clean.js` | `cleanTrack(raw)`: drops fixes no aircraft could have flown (off the globe, ForeFlight's −100,000 m "no altitude", GPS jumps over 450 kt), counts them, and lists gaps of more than 5 s. The limits are named constants at the top. |
| `load.js` | `loadFlight([{ slot, name, text }])`: reads, cleans and places up to four track files at once, or refuses the lot with a message naming the file. What the debrief calls. |
| `flight.js` | `buildFlight(tracks)`: one map and playback window for up to four tracks (refused if they don't overlap in time). `sampleAt` (with `inGap`), `headingAt` (null while still), `pitchAt` and `gAt` (estimated from the track unless `{ recorded: true }`): each aircraft at a given time. |
| `gap-fill.js` | `fillGaps(flight, { windFtps })` (and `fillGapsInSteps`, a gap at a time): a best guess at each GPS gap as a path a T-6 could fly, with a zone round it, or the reason it can't be filled (DB-19). Formation first (another ship's real path plus the offset carried across), else one or two turns eased in and out (core `easeRoll`, `rollWithinT6A`, `turnRateFromBankRadPerSec`) with speed and height on smooth curves, solved in the model wind when given. `fillAt` and `fillSampleAt` read a fill at a moment; every sample says `estimated: true`. Never read by `sampleAt`, the readouts or the CSV. Also `smoothAt` (a smooth curve through a track's fixes), `endState` (what the aircraft was doing at a fix, from a curve through its neighbours) and `hermite`. The numbers, all estimates, are `GAP_FILL`. |
| `clock.js` | `createClock({ startT, endT })`: the one playback clock every view reads. Play, pause, reset, seek and step to whole seconds, 0.25× to 16×. No timers of its own: the ui-kit scheduler calls `tick(nowMs)` each frame. |
| `debrief-file.js` | `toDebriefFile(flight, dfps, settings)` and `readDebriefFile(text, { settings })`: the `.dadsdebrief.json` format (original track files, cleaning limits, DFPs, settings). An opened file is checked field by field; the caller lists which settings to keep. |
| `examples.js` | `EXAMPLE_FLIGHT` (V6's four example tracks and their nicknames, D22) and `loadExampleFlight(fetchText)`, which fetches them only when asked (R5). |

## Changing something

- **Numbers come from the spec and the manuals, not V6** (`docs/TESTING.md`). Each function names the V6 line it started from, as history. The changes the spec approved (C1 to C10: blank columns, recorded bank, bad fixes, gaps and so on) each landed as their own commit.
- **A track file is untrusted.** Never put anything from it (a name, a note) into `innerHTML`; the screen uses `textContent`. Size limits live at the top of `kml.js`, `xml.js` and `debrief-file.js`. They count characters of text, not bytes on disk (a 30-million-character file can be larger on disk), so whoever opens the file should also check its size first.
- **Units are in the names:** `altM` metres, `altFt` feet, `xFt`/`yFt` feet east/north of the map's origin, `t` seconds since 1970, `speedKt` knots of ground speed. Headings are radians, 0 = east, counter-clockwise (`core`'s rule).

## Tests

```
npm test
```

The old V6 comparison scripts are archived in `archive/tests/golden/checks/` (Q-T8).
