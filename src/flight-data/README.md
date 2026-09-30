# flight-data: flight tracks for the debrief

Reads ForeFlight track logs (KML), puts up to four aircraft on one map and one playback window, and says where each one was and what it was doing at any moment. The debrief's 2D map, 3D view, readouts and EM chart all read from here. The spec is [`specs/SPEC-flight-data.md`](../../specs/SPEC-flight-data.md).

| File | What's in it |
|---|---|
| `xml.js` | A small, strict XML reader. Refuses anything that isn't well-formed, and any DOCTYPE, so a hostile file can't expand entities or reach other files. |
| `kml.js` | `readKml(text, name)`: the fixes of one track file (position, altitude, time, recorded G and pitch), sorted by time. Refuses KMZ files, files over 30 MB and more than 200,000 fixes. |
| `flight.js` | `buildFlight(tracks)`: one map and playback window for up to four tracks. `sampleAt`, `headingAt`, `pitchAt` and `estimatedGAt`: each aircraft at a given time. |

## Changing something

- **Every number here matches V6 today.** Each function names the V6 line it came from, and `tests/golden/flight-data-*.test.js` runs that V6 code next to it. The changes the spec approved (C1 to C10: blank columns, recorded bank, bad fixes, gaps and so on) land one at a time, each with its own test.
- **A track file is untrusted.** Never put anything from it (a name, a note) into `innerHTML`; the screen uses `textContent`. Size limits live at the top of `kml.js` and `xml.js`.
- **Units are in the names:** `altM` metres, `altFt` feet, `xFt`/`yFt` feet east/north of the map's origin, `t` seconds since 1970, `speedKt` knots of ground speed. Headings are radians, 0 = east, counter-clockwise (`core`'s rule).

## Tests

```
npm test
python3 tests/golden/checks/mutate-flight-data.py        # the tests must catch broken code
NODE_PATH=$(npm root -g) node tests/golden/checks/xml-parity.cjs          # xml.js vs the browser's parser
NODE_PATH=$(npm root -g) node tests/golden/checks/record-flight-data.cjs  # re-record V6's reader (rarely needed)
```
