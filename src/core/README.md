# core: the shared flight math

The small functions behind every number the tool shows: units, angles and headings, map projection and time. Every other module uses these instead of keeping its own copy. The spec is [`docs/modules/shared/spec.md`](../../docs/modules/shared/spec.md). Before writing any flight math, read [the flight-math list](../../docs/modules/shared/flight-math.md).

| File | What's in it |
|---|---|
| `units.js` | Feet per nautical mile, knots to feet per second, feet per metre, gravity, Earth radius |
| `angles.js` | Headings, bearings, clock positions, aspect angle, heading crossing angle, compass conversion, compass bearing of a vector |
| `geo.js` | The debrief map: latitude/longitude to feet and back, map tiles; distance along and off a leg |
| `time.js` | Zulu and local time, KML times, the Zulu date-time group |
| `flight-math.js` | Turn radius, rate and bank from G, and G, radius and rate from bank; the Turn Sim's G with its correction (floored at 1.01, D74); the EM chart point; closure; G estimated from a track |
| `tennis.js` | The tennis ball, one solver for the map and the 3D view |
| `standards.js` | Formation standards (spread, offset, lead): V6's values (pinned) and the SMM's as the default preset (D114-D116) |
| `wind.js` | Crab angle, heading and ground speed in a wind (compass degrees in and out); the wind as a vector |
| `t6-performance.js` | The one T-6A performance model: V-n limits and stall line, IAS and TAS, thrust and drag, energy height, glide, the flight manual's zoom, and the stick-shaker pull and split S (new, checked against the T-6A's charts, not V6) |
| `closest-approach.js` | Closest approach of two aircraft, the danger test that holds until the range opens, which side to dodge, and when two aircraft first get inside a cylinder of each other (ALL-27); every limit passed in |
| `point-mass.js` | One step of an aircraft flown by G and bank as a point, through loops and straight up or down |
| `t6a-turn-charts.js` | The sustained turn chart's points, read by eye, and the thrust and drag fitted to them |

## One heading rule

Inside the code, a heading is an angle in radians: 0 points east, angles grow counter-clockwise, so north is π/2. North is up (+y) and distances are in feet. Only the screen shows compass headings (000 north, 090 east). Use `compassDegToHeadingRad` and `headingRadToCompassDeg` to convert at the screen.

## Changing something

- **A constant** (for example feet per nautical mile) lives in `units.js`, once.
- **Any number the tool shows** comes from a manual page, standard aerodynamics or Patrick's ruling, never from V6 (`AGENTS.md`, `docs/TESTING.md`). Each function names the V6 line it started from, as history. To change a number on purpose, record the decision in the module's `decisions.md` first, and change its test in the same change.
- **A changed number** lands as its own commit, with its source beside it.
- **Inputs must be finite numbers.** Like V6, the angle-wrapping loops never finish if they're given infinity, and crawl on huge values. Screens must check what people type before it reaches these functions.

## Tests

```
node --test "tests/**/*.test.js"
```

`tests/unit/core/` checks what the numbers mean against known answers.
