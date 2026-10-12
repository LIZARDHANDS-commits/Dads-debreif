# core: the shared flight math

The small functions behind every number the tool shows: units, angles and headings, map projection and time. Every other module uses these instead of keeping its own copy. The spec is [`docs/modules/shared/spec.md`](../../docs/modules/shared/spec.md). Before writing any flight math, read [the flight-math list](../../docs/modules/shared/flight-math.md).

| File | What's in it |
|---|---|
| `units.js` | Feet per nautical mile, knots to feet per second, feet per metre, gravity, Earth radius |
| `angles.js` | Headings, bearings, clock positions, aspect angle, heading crossing angle, compass conversion, compass bearing of a vector |
| `geo.js` | The debrief map: latitude/longitude to feet and back, map tiles; distance along and off a leg |
| `terrain-tiles.js` | The public Terrarium elevation tiles: their address and credit, decoding a tile's pixels into heights, the tiles covering a box, and a store that answers the height at a point (SOF terrain and Traffic's 3D ground, TR-117) |
| `terrain-grid.js` | The height grids a 3D view's real ground is drawn from, read from `terrain-tiles.js`'s store: a grid over a square (`createGrid`, `fillGrid`, `sampleGrid`), an inner patch stitched into a hole of an outer grid (`holeFor`, `stitchInner`), hill shading (`hillshade`), and the finest zoom under a tile cap (`zoomForTiles`). Shared by the SOF's 3D terrain and the Debrief's terrain ground (SOF-65, DB-27); a picture only, not flight math |
| `time.js` | Zulu and local time, KML times, the Zulu date-time group |
| `flight-math.js` | Turn radius, rate and bank from G, and G, radius and rate from bank; the least G (1.01, D74); the EM chart point; closure; G estimated from a track; the smooth roll |
| `atmosphere.js` | The standard day once: temperature, pressure and density as fractions of sea level, and the speed of sound, each with an optional temperature deviation (Traffic's hot and cold days) |
| `tennis.js` | The tennis ball, one solver for the map and the 3D view |
| `standards.js` | Formation standards (spread, offset, lead) for the Debrief, with the SMM's as the default preset (D114-D116) |
| `wind.js` | Crab angle, heading and ground speed in a wind (compass degrees in and out); the wind as a vector |
| `t6-performance.js` | The one T-6A performance model: V-n limits and stall line, roll and G onset, IAS and TAS, thrust and drag, pitch attitude, energy height, glide, the engine-out zoom, and the stick-shaker pull and split S, checked against reference data |
| `closest-approach.js` | Closest approach of two aircraft, the danger test that holds until the range opens, which side to dodge, and when two aircraft first get inside a cylinder of each other (ALL-27); every limit passed in |
| `point-mass.js` | One step of an aircraft flown by G and bank as a point, through loops and straight up or down |
| `t6a-turn-data.js` | The sustained turn points, read by eye, and the thrust and drag fitted to them |
| `canopy.js` | Whether Lead is in the wingman's canopy glass, and the overshoot lane round Lead (`LANE`) |

## One heading rule

Inside the code, a heading is an angle in radians: 0 points east, angles grow counter-clockwise, so north is π/2. North is up (+y) and distances are in feet. Only the screen shows compass headings (000 north, 090 east). Use `compassDegToHeadingRad` and `headingRadToCompassDeg` to convert at the screen.

## Changing something

- **A constant** (for example feet per nautical mile) lives in `units.js`, once.
- **Any number the tool shows** comes from a manual page, standard aerodynamics or Patrick's ruling, never from V6 (`AGENTS.md`, `docs/TESTING.md`), and the comment beside it names that source. To change a number on purpose, record the decision in the module's `decisions.md` first, and change its test in the same change.
- **A changed number** lands as its own commit, with its source beside it.
- **Inputs must be finite numbers.** The angle-wrapping loops never finish if they're given infinity, and crawl on huge values. Screens must check what people type before it reaches these functions.

## Tests

```
node --test "tests/**/*.test.js"
```

`tests/unit/core/` checks what the numbers mean against known answers.
