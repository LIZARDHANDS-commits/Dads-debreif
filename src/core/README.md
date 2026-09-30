# core: the shared flight math

The small functions behind every number the tool shows: units, angles and headings, map projection and time. Every other module uses these instead of keeping its own copy. The spec is [`specs/SPEC-core.md`](../../specs/SPEC-core.md).

| File | What's in it |
|---|---|
| `units.js` | Feet per nautical mile, knots to feet per second, feet per metre, gravity, Earth radius |
| `angles.js` | Headings, bearings, clock positions, aspect angle, heading crossing angle, compass conversion |
| `geo.js` | The debrief map: latitude/longitude to feet and back, map tiles |
| `time.js` | Zulu and local time, KML times, the Zulu date-time group |

## One heading rule

Inside the code, a heading is an angle in radians: 0 points east, angles grow counter-clockwise, so north is π/2. North is up (+y) and distances are in feet. Only the screen shows compass headings (000 north, 090 east). Use `compassDegToHeadingRad` and `headingRadToCompassDeg` to convert at the screen.

## Changing something

- **A constant** (for example feet per nautical mile) lives in `units.js`, once.
- **Any number the tool shows** must stay what V6 shows. Each function names the V6 line it came from, and `tests/golden/` runs that V6 line next to it. To change a number on purpose, update the function and its golden test in the same change, and log the decision in the plan doc first (CLAUDE.md, R9).
- **Inputs must be finite numbers.** Like V6, the angle-wrapping loops never finish if they're given infinity, and crawl on huge values. Screens must check what people type before it reaches these functions.

## Tests

```
node --test "tests/**/*.test.js"
```

`tests/golden/` compares each function with V6's own; `tests/unit/core/` checks what the numbers mean against known answers.
