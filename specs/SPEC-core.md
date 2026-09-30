# Spec: `core`, the shared flight math

Status: **approved by Patrick on 2026-09-30** ("spec-core approved", in the Flight math core thread). Changes go through a pull request. Module id `core` in [`SPEC.md`](../SPEC.md). Requirement IDs (R#), decisions (D#) and questions (Q#) refer to the plan doc: https://claude.ai/code/artifact/29712036-a126-43c3-ac39-57ba919ff102

## Objective

One set of small, pure, tested functions for the numbers every module shows: units, angles and headings, map projection, turn performance, formation standards and time. Today V6 has several copies of each, some of which disagree (audit issue #43). `core` replaces them with one copy, so a number means the same thing in the debrief, Turn Sim, Turn Fight and Traffic.

The rule for this module is R9: every function gives **the same answer V6 gives** for the same input, proven by a golden test that runs V6's own function, unchanged, next to the port. Fixes to V6's math come later, one at a time, only with Dad's sign-off and a logged decision (CLAUDE.md, Q18).

Users never see `core` directly. Its "users" are the other modules and the people who later read or change the math (R8).

## Assumptions

1. V6's numbers are the reference, even where the audit shows them wrong (D29). A wrong number is ported as it is and fixed later, separately.
2. Inputs are finite numbers. `core` checks for missing values only where V6 did. Screens validate what people type (see "Things `core` will flag").
3. Time zones come from the browser's built-in time-zone data (`Intl`), which current Chrome, Edge, Firefox and Safari all ship (R1, R10).
4. The golden tests read `original/shell.html` when they run, so they always compare against the untouched V6.

## Tech stack

Plain JavaScript ES modules with no dependencies, which run as they are in a browser and in Node. Tests use Node's built-in `node:test` (Node 22 or later), with no packages.

## Scope

In `core`:

| File | Holds | PR |
|---|---|---|
| `units.js` | V6's constants (ft/NM, kt↔ft/s, ft/m, g, Earth radius) and small conversions | 1 |
| `angles.js` | The one heading convention, wrapping, relative bearing, clock positions, aspect, HCA, compass conversions | 1 |
| `geo.js` | The debrief's flat local map (lat/lon ↔ feet), map tiles, Mercator | 1 |
| `time.js` | Zulu and zone-aware formatting, KML time parsing, the Zulu DTG | 1 |
| `flight-math.js` | Turn radius and rate, bank from G, ISA density ratio and IAS estimate, closure, estimated G, the EM chart point | 2 |
| `tennis.js` | The tennis ball: one solver for both views, V6's debrief solver changed as Patrick decided (D62, D63) | 2, 3 |
| `standards.js` | Formation standards classifier (debrief and Turn Sim) and V6's default standards preset (R18); #3's fore/aft per D78 | 3 |

Not in `core`: resolving a TAF's day-of-month into a date (`wx` owns it, in `src/wx/dates.js`); anything that reads the page, a canvas or storage; KML parsing, interpolation and the playback clock (`flight-data`); weather parsing (`wx`); drawing.

## The heading convention (pinned by `tests/unit/core/angles.test.js`)

- Inside the code a **heading is a math angle in radians**: 0 points east (+x), angles grow counter-clockwise, so π/2 is north. The world is north-up, x east and y north, in feet.
- This is what V6's debrief, 3D view, EM chart, Turn Sim and Turn Fight already use (`Math.atan2(dy, dx)` everywhere), so porting them needs no conversion.
- A relative bearing is positive to the **left** (V6's `relativeBearingDeg`); 3 o'clock is −90°.
- Only the screen shows **compass headings** (000 = north, clockwise). Convert at the edge with `compassDegToHeadingRad` and `headingRadToCompassDeg`.
- V6's Traffic page is the exception: compass degrees with screen y pointing down. `unitVectorFromCompassDeg` returns its vector north-up (y flipped), and the golden test proves that is the only difference.
- Turn Sim's start heading becomes a compass heading (D45, Dad). `core` converts it at the screen with `compassDegToHeadingRad`.

## API, first PR

Every function is pure: plain numbers and `{x, y}` objects in, plain values out. Names carry units where it matters.

| Function | V6 source (line in `original/shell.html`, or sub-page) |
|---|---|
| `FT_PER_NM`, `KT_TO_FTPS`, `FTPS_TO_KT`, `FT_PER_M`, `M_PER_FT`, `G_FTPS2`, `EARTH_RADIUS_M` | 780, 2105, 2378, 4154, 4234 |
| `ktToFtps`, `ftpsToKt`, `formatNm` | 786–787, traffic 146 |
| `degToRad`, `radToDeg`, `wrapDeg180`, `wrapPi`, `angleDiffRad`, `absAngleDeg`, `headingRad` | 786, 1480, 2706–2707, 3139, 4155–4156, 3783, 4238–4239 |
| `relativeBearingDeg`, `clockToRelativeDeg` | 1477, 1481 |
| `aspectAngleDeg`, `headingCrossAngleDeg` | 2708, 2717 |
| `compassDegToHeadingRad`, `headingRadToCompassDeg`, `unitVectorFromCompassDeg` | traffic 150 (new names for the edge conversion) |
| `makeLocalRef`, `latLonToLocalFt`, `localFtToLatLon`, `distance` | 2376–2379, 2500, 2507, 1688 |
| `lonLatToTile`, `tileBounds`, `pickTileZoom`, `mercatorY`, `invMercatorY`, `lonLatToWorldPixel` | 2514–2525, 2585–2589, traffic 250 |
| `formatZuluSeconds`, `formatZulu`, `parseIsoSeconds` | 2429, 4432, 2321 |
| `formatDtgZulu`, `formatInZone`, `zoneAbbreviation` | sof 743–745 |
| `utcOffsetMinutes` | new (V6 hard-coded UTC-6; R10 needs any home airfield's zone) |

Changes made while porting, none of which changes a number:

- Functions that read V6 globals take them as arguments: `pickTileZoom(centerLat, zoomPxPerFt)` (V6 read `kmlZoom`), `latLonToLocalFt(ref, …)` (V6 read `kmlRef`), the SOF clock functions take a `Date` (V6 always used "now").
- V6's five "wrap an angle" copies (`normAngleRad`, `wrapH`, `dAng`, `headingDelta`, `ad`) become `wrapPi`. Three are the identical loop. The 3D view's `headingDelta` returns −π where the loop keeps +π and differs by at most about 4e-14 rad on angles of many turns; Turn Fight's `ad` agrees to 1e-10°. The golden test pins both differences.
- V6 uses 0.592484 for ft/s→kt in the debrief but 1.68781 for kt→ft/s everywhere else; they are not exact inverses (off by 4e-7). Both stay, named, until a decision says otherwise.

## API, second PR

| Function | V6 source |
|---|---|
| `MIN_TURN_G`, `limitG` | the G limits in 1582, 4237 and traffic 147–148 |
| `bankDegFromG`, `turnRadiusFt`, `turnRateRadPerSec` | Turn Sim 788–789, Turn Fight `M` 4237, traffic 147–148 |
| `isaDensityRatio`, `emPoint` | EM chart `isaRhoRatio` 4154, `metrics` 4158 |
| `closureKt`, `formatClosureKt` | debrief `closureRateKt` 3119, `fmtClosureKt` 3131 |
| `gFromTrack` | debrief `estimatedGAtTrack` 2462 |
| `tennisBall` (PR 2 had `tennisDebrief` and `tennis3D`) | debrief `getKmlTennisSolution` 3140; V6's 3D `draw3DDogfightArc` 3970 was pinned, then dropped |

Changes made while porting:

- The three copies of the turn physics become one. They differ only in how they limit G: Turn Sim limits it before calling (1.01 and up), Turn Fight inside `M` (1.01 and up), and the Traffic page to 1.01 to 9, reading an empty box as 2 G. `limitG(g, maxG)` covers all three.
- Turn Fight works out the turn rate as gravity × √(g² − 1) / speed, Turn Sim as speed / radius. They differ in the last digit for about a third of inputs. `core` uses Turn Sim's order, and the golden test allows Turn Fight 1e-15 relative.
- Functions that read the track take what they need instead: `emPoint` takes the three moments, `closureKt` the four positions and the time between them, and `gFromTrack` two positions and headings. Choosing the moments and reading the track at them is `flight-data`'s job, and each golden test shows how it has to do it.
- The tennis solvers take their settings as numbers. Reading the boxes, the pitch estimate and the headings stays with the screen.
- **D39 is fixed** in its own commit: `emPoint` shows the real turn rate, twice what V6 showed. The golden test expects exactly twice V6's value.

## API, third PR

| Function | V6 source |
|---|---|
| `V6_STANDARDS` | the debrief's standards boxes (lines 698–709) and Turn Sim's numbers (1881–1946) |
| `formationAxes` | debrief `kmlAxes` 3041, Turn Sim `formationAxes` 1877 |
| `classifyDebriefPosition`, `classifyLeadParameters`, `standardsSummaryLines` | debrief `classifyKmlError` 3051, `classifyLeadDesired` 3088, `kmlStandardsSummary` 3110 |
| `classifyTurnSimPosition` | Turn Sim `classifyFormationError` 1881 |

Changes made while porting:

- The standards are one object shaped like `V6_STANDARDS` (spread, offset, lead; each with `on` and its numbers), passed in by the screen. V6 read them from the page's boxes; the golden test reads the boxes V6's way and passes the result.
- Turn Sim wrote V6's numbers into its code (4,000, 6,000, 250, 7,000 and 9,000 ft). The port takes them from the same standards object, and a test proves the written-in numbers are `V6_STANDARDS`. Turn Sim ignores the `on` switches, as V6 does.
- V6 calls Lead's across-vector `right`, but it points to Lead's **left** (the heading turned 90° counter-clockwise). `core` names it `left`. Intervals are unsigned, so no label changes.
- `standardsSummaryLines` returns the lines; the screen joins them (V6 joined them with `<br>`).
- `classifyLeadParameters` takes Lead's estimated G (from `gFromTrack`) as an argument, and uses Lead's ground speed as V6 does. D31 (compare est. IAS) is the debrief's to apply, by passing IAS as the speed.

## Things `core` will flag, not choose

- **Two tennis-ball solvers disagreed** (issue #19). **Decided by Patrick on 2026-09-30 (D62, D63):** one solver, `tennisBall`. It is the debrief's, pinned to V6 in PR 2, and then changed one answer at a time in PR 3. The ball carries the shooter's whole velocity, climb included. The target flies its recorded path, climb included. The cone is ±3° for a width of 6, and INTERCEPT needs the target in the cone; Patrick confirmed both on 2026-09-30 (D77). The golden test still matches V6 when given V6's straight, level target path and no climb, apart from the cone rule. [`tasks/flight-math/tennis-ball.md`](../tasks/flight-math/tennis-ball.md) keeps the comparison that led here.
- **#3 judged by two standards at once** (#21, Q39): with spread and offset both on, V6 judges #3's fore/aft by both, so #3 is never "ON PARAMETERS" and can read "FORE / FORE" or "AFT / FORE". **Decided by Patrick on 2026-09-30 (D78):** when the offset standard is on, it alone judges #3's fore/aft, and the spread standard judges #3's interval. PR 3 pinned V6's labels; the change landed as its own commit. The golden test proves that the result is V6's `classifyKmlError` with the spread's fore/aft tolerance set too large to fire, for #3 with both standards on, and exactly V6 everywhere else. Turn Sim needed no change, since each of its formations judges #3 by one standard. Kept from V6: an aircraft no standard checks still reads "ON PARAMETERS".
- **Below 1 G, Turn Sim's turn goes to NaN.** Turn Sim's G correction (line 1583) adds up to −0.8 G after the 1.01 limit. So when base G plus the aircraft's G error is under 1.8, a wingman's G can drop below 1 (at exactly 1.8 it reaches 1 G, and the turn rate is 0). Then `turnRateRadPerSec` gives NaN, as V6's `turnRate` does, and that aircraft's position becomes NaN. This was read from the code, not run. Decided (D74, Patrick's pick on the Q38 card, 2026-09-30): when the Turn Sim G correction is ported, G is limited to 1.01 after the correction, so the wingman flies almost straight instead of going NaN. V6's order is pinned by a golden test first, and the floor lands as its own commit (D10).
- **Fixes Dad approved (D39 to D47):** EM turn rate without the divide by 2 (D39); 3D bank from the real rate, correct wing down, G only in level turns (D40); Turn Sim toward/away (D41) and wide/tight (D42); auto timing (D43, D44); compass start heading (D45); true circular arcs in Traffic (D46); recorded bank and estimated blank pitch (D47). Under D10, each function is first ported and pinned to V6's number, and the fix then lands as its own change that updates the golden value. None of them touches PR 1's functions. D39 landed in the second PR. Q31 is answered (Patrick, 2026-09-30): in 4312, #2 flies on lead's left, as V6 draws it. In real life it depends on how the formation joined, so the Turn Sim port should make the side a setting with left as the default.
- **Infinite headings hang.** V6's angle-wrapping loops (`normDeg`, `normAngleRad` and their copies) never return for ±Infinity, and crawl on values past about 1e9. In V6, a huge number such as 1e20 typed into Turn Sim's Start heading box becomes the aircraft's heading (line 798), and with the clock or bearing cue trigger on, it reaches these loops (lines 1499 and 1528), so the page would freeze. This was read from the code, not run. `core` keeps the loops as they are. The fix is at the screen: `ui-kit` controls must reject non-finite and out-of-range numbers. A guard inside `core` would change no number V6 ever shows, but it would still change behaviour, so it needs a decision.

## Commands

```
node --test "tests/**/*.test.js"     # what npm test should run (see note below)
```

Note for the app frame: on Node 22, `node --test tests/unit tests/golden` fails ("Cannot find module"), because `--test` takes files or globs, not folders. The glob above runs both folders.

## Project structure

```
src/core/            README.md (what's here, the heading rule, how to change a number)
                     units.js angles.js geo.js time.js (PR 1); flight-math.js tennis.js (PR 2); standards.js (PR 3)
tests/golden/        v6-source.js  loads V6's own functions from original/shell.html
                     inputs.js     fixed edge cases plus seeded random inputs
                     core-*.test.js  V6 vs core, function by function
tests/unit/core/     *.test.js     what the numbers mean (known answers, the heading convention, R10 dates)
```

## Code style

Plain ES modules, no dependencies, no page access. A short comment on each function names its V6 source line, so the port can be checked by eye.

```js
/** Heading crossing angle (HCA) in degrees, 0 to 180 (debrief line 2717). */
export function headingCrossAngleDeg(h1, h2) {
  if (!Number.isFinite(h1) || !Number.isFinite(h2)) return null;
  return absAngleDeg(h2 - h1);
}
```

## Testing strategy

1. **Golden tests** (`tests/golden/core-*.test.js`, R9). `v6-source.js` cuts each V6 function out of `original/shell.html` by name (or out of the SOF and Traffic pages V6 embeds as base64) and runs it unchanged. Globals V6 reads are supplied by a small prelude. Each test runs V6 and `core` on the same inputs: fixed edge cases (±π, month ends, both 2026 clock changes, bad input) and a few hundred seeded random values around Moose Jaw.
2. **Exact match by default.** A tolerance is allowed only where V6 itself has two copies that disagree, and the test says why.
3. **Unit tests** (`tests/unit/core/`) check meaning against known answers: a minute of latitude is a nautical mile, 3 o'clock is on the right, Moose Jaw stays UTC-6 across both clock changes while Denver moves (R10).
4. **The tests must catch a broken port.** Before each PR, a mutation check breaks the ports on purpose, one change at a time (a constant nudged, a sign flipped, a boundary moved). After D78, 119 of 123 changes turn a test red. The other four are equivalent: `absAngleDeg(h1 - h2)` for `(h2 - h1)`; 0.3048 for 1/3.28084 inside the tile-zoom rounding; and two guards kept from V6 that no input can reach (`emPoint`'s density floor of 0.15, since the ratio never falls below 0.297, and `gFromTrack`'s floor of 0.8 G, since its G is never below 1). Line coverage of `src/core` is 100%.
5. **Same answers in a browser.** Each PR also loads `src/core` in Chromium as plain ES modules and compares about 14,700 results with Node's, failing on anything beyond the last digits. Time and Intl results match exactly. 248 results that use `sin`, `cos`, `atan2` or `Math.pow` differ in the last digits (at most 3.2e-15 relative), because JavaScript engines may round these functions differently. The golden tests run V6 and `core` in the same engine, so they compare exactly. Any comparison with numbers recorded in a browser (such as `tests/golden/v6-baseline.json`) must allow at least 1e-12 relative. That tolerance is far below anything shown on screen, and it is the "stated tolerance" R9 asks for.

## Boundaries

- **Always:** port unchanged; pin with a golden test first; cite the V6 line; run the tests before each commit.
- **Ask first:** any change to a number V6 shows; adding a package (none are used; `node:test` only).
- **Never:** edit `original/`; change a number without a logged decision (D39 to D47 and Q31 are settled); fold a fix into the port that pins V6's number; loosen a golden tolerance to get green.

## Success criteria

- Every function in the tables above has a golden test against V6 and passes.
- The mutation check leaves no surviving change that isn't equivalent, and `src/core` runs unchanged in a current browser with the same answers as Node.
- Every number the later modules show that depends on these functions comes from `core`, not a local copy.
- The heading convention is written here and in `angles.js`, and pinned by tests.

## Plan

The tasks, checkpoints and risks are in [`tasks/flight-math/plan.md`](../tasks/flight-math/plan.md) and [`todo.md`](../tasks/flight-math/todo.md).

## Open questions

1. Guard against infinite input inside `core`, or only at the screen (see above)? The default is at the screen only.
