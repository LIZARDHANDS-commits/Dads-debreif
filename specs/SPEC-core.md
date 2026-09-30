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
| `standards.js` | Formation standards classifier (debrief and Turn Sim), V6's standards (pinned) and the SMM default preset (R18, D114-D116); #3's fore/aft per D78 | 3 |
| `wind.js` | The wind triangle (crab, heading, ground speed): new, for the Traffic Sim (SPEC-traffic) and later the SOF crosswind (FF21) | 4 |
| `t6-performance.js`, `point-mass.js`, `t6a-turn-charts.js` | The one T-6A performance model every module reads (Patrick, 2026-09-30 06:58Z): limits and stall line, IAS↔TAS, thrust and drag, energy height, glide, zoom, and the point-mass step. New; tasks 14 to 17 | 5 |

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
| `turnSimG` | Turn Sim `moveAircraftList` 1582–1583: G with the error and G-fix correction, floored at 1.01 (D74) |
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

## API, fourth PR: wind (for SPEC-traffic)

V6 has no wind, so there is nothing to pin: this is new, checked against known answers (`tests/unit/core/wind.test.js`), and with the wind calm it gives V6's numbers exactly. It takes **compass degrees** (000 north, 090 east), unlike the rest of `core`, because a wind comes that way from a METAR and Traffic routes are laid out that way. The wind is one steady wind, given as the direction it blows **from**.

| Function | Returns |
|---|---|
| `windTriangle(trackDeg, tasKt, windFromDeg, windKt)` | `{ crabDeg, headingDeg, groundSpeedKt, headwindKt, crosswindKt, canHoldTrack }` |

- crosswind = W × sin(D − T), + from the right; headwind = W × cos(D − T), − for a tailwind; crab = asin(crosswind ÷ TAS), + to the right; heading = T + crab, 0 to 360; ground speed = TAS × cos(crab) − headwind. Track 290°, 110 KTAS, wind 250° at 20 kt gives a crab of 6.7° left and 94 kt over the ground.
- Calm gives exactly no crab, the track as the heading and the airspeed as the ground speed.
- `canHoldTrack` is false when the crosswind is stronger than the airspeed (then the crab is ±90°, straight into the wind) or the ground speed would be 0 or less; `groundSpeedKt` is then 0. What to do then (the Traffic Sim crawls at 10 kt) is the screen's.

## API, fifth PR: T-6A performance (shared by the Turn Fight, Traffic and Turn Sim)

**Decided by Patrick on 2026-09-30 (06:58Z, "Yess hared model"):** one T-6A performance model in `core`, which every module reads. Each module keeps its own flying: the Turn Fight its moves (Energy mode, D112, SPEC-turn-fight), the Traffic Sim its pattern at the SMM speeds and its engine-out glide (SPEC-traffic), and the Turn Sim its V6 formation turns. Nothing a module shows today changes because of this: the model only puts the numbers in one place and checks them against each other. It is built test-first (tasks 14 to 17 in `tasks/flight-math/todo.md`) when Patrick's build order reaches it; until he picks, that is the Turn Fight's turn, before the Traffic build needs it. V6 has none of this, so there is nothing to pin; it is checked against the T-6A's own charts.

| Function or data | What it gives | First used by |
|---|---|---|
| `T6A_LIMITS` | The V-n limits, clean, at the V-n diagram's 5,168 lb: +7 G and −3.5 G, +4.7 G while rolling, VO 227 KIAS, VMO 316 KIAS, Mmo 0.67 (NFM Fig 4-1-2); and the stall speed, 86 KIAS by default (the V-n curve reads about 89) | Turn Fight, Turn Sim |
| `stallLimitG(kias)` | (KIAS ÷ stall speed)², which reaches 7 G at 227.5 KIAS with the 86 kt default (the V-n curve itself reaches 7 G near 236 KIAS; VO, 227, is a limit speed, not this corner) | Turn Fight; the Turn Sim's warning beside its G box when the set G is above it |
| `availableG(kias, rolling)` | The G the aircraft can pull now: the stall line, capped at +7 G (+4.7 while rolling) | Turn Fight |
| `iasToTasKt(kias, altFt)`, `tasToIasKt(ktas, altFt)` | TAS = IAS ÷ √σ, through `isaDensityRatio`; compressibility ignored | Turn Fight, Traffic |
| `thrustPerWeight(kias, altFt)` | Maximum-power propeller thrust ÷ weight, falling with speed and density | Turn Fight |
| `dragPerWeight(kias, altFt, g)` | Drag ÷ weight: a zero-lift part plus a part growing with G² | Turn Fight; the glide and zoom cross-checks |
| `excessThrustPerWeight(kias, altFt, g)` | thrustPerWeight − dragPerWeight, (T − D)/W | Turn Fight |
| `t6aExcessFn(ktas, altFt, g)` | `excessThrustPerWeight` in the form `stepPointMass` calls it (true airspeed in) | Turn Fight |
| `speedOfSoundKt(altFt)` | The speed of sound on a standard day, √(γRT): 661.5 kt at sea level, 573.6 kt above 36,089 ft | `maxKiasT6A` |
| `maxKiasT6A(altFt)` | The top speed at a height: VMO 316 KIAS, or Mmo 0.67 where that is slower (above about 17,600 ft; 270 KIAS at 25,000 ft). In the model's own IAS, so a few knots under the NFM's KIAS line (about 279 at 25,000 ft), the safe side | Turn Fight |
| `energyHeightFt(altFt, ktas)` | Altitude + V²/2g | Turn Fight readout, Traffic engine-out check, later the debrief |
| `T6A_GLIDE` | The max glide chart by configuration: clean, prop feathered, 125 KIAS, 2.0 NM per 1,000 ft; gear down 105 KIAS, 1.5; landing flap and gear 95 KIAS, 1.1; clean, prop windmilling 110 KIAS, 1.0. Its sink rates (1,350, 1,500, 1,850 and 2,350 ft/min) are each row's glide ratio at about 16,000 ft | Traffic |
| `glideSinkFpm(config, kias, altFt)` | TAS ÷ the glide ratio: the ratio is fixed through the air, so the sink rate grows with height | Traffic |
| `zoomT6A(kias, altFt, weightLb)` | The flight manual's zoom after an engine failure (NFM Fig 3-4, p.3-12, and p.3-9): 2 s to react, a 2 G pull to 20° nose up held to 145 KIAS, then a 0 to +0.5 G push to capture the 125 KIAS glide. At 200 and 250 KIAS from 500 to 6,000 ft it is the manual's table (5,400 to 6,500 lb; 5,800 lb, the NFM's example, unless told); elsewhere the same share of the energy height down to 125 KIAS as the table's nearest speed and altitude; none at or below 150 KIAS, where the NFM slows down level (so the gain steps from 0 to about 200 ft there). 0 to 316 KIAS, or it throws. About 960 ft from 220 KIAS at 3,500 ft. Returns the height gained, and the time and distance from `flyZoomT6A` | Traffic |
| `NFM_ZOOM` | Fig 3-4's lightest and heaviest rows at 200 and 250 KIAS; the rows between are straight lines from them to within 1 ft | `zoomT6A` and its tests |
| `flyZoomT6A(kias, altFt)` | The same zoom flown by `stepPointMass` with the engine off (drag only, 0.25 G push, until 125 KIAS or the clean glide path): height, time and distance over the ground in still air | `zoomT6A`'s time and distance; the zoom cross-check |
| `T6A_MANOEUVRE` | How the model flies a manoeuvre (Patrick, 2026-09-30 09:27Z): pulls in the stick shaker 7 kt above the stall (NFM p.1-52: 5 to 10 kt), the split S at most 5 G (Patrick: split S goes up to 5 G; AIF 2410), a 90°/s roll (SPEC-turn-fight's default; no manual gives one), and the split S's 20° nose up and 0.5 G roll (SMM 14.16 para 41) | Turn Fight |
| `shakerG(kias, { stallKias, marginKt, maxG })` | The G a pull in the shaker gives: (KIAS ÷ 93)², 1 G at 93 KIAS, at most the V-n 7 G unless told. With no margin it is the stall line | Turn Fight |
| `splitST6A(kias, altFt, options)` | The SMM's split S (14.16 para 41) flown by `stepPointMass` at full power: 20° nose up, roll inverted at 0.5 G, pull through in the shaker until level, up to 5 G (Patrick's cap, 09:27Z; the SMM's Table 14.1 gives about 4 G). Every number above is an option, and so is the roll's side (right unless told). Returns the height lost from the entry altitude and from the top, the exit speed, the most G, the time, the heading change and whether it finished. From 110 KIAS at 10,000 ft: 1,688 ft below the entry, 1,976 ft below the top, 206 KIAS out. Below the shaker speed (93 KIAS) the nose can't come up, so it rolls at once and loses about 300 ft more from the entry. 1 to 316 KIAS, or it throws | Turn Fight's hard-deck check and forced split S |
| `stepPointMass(state, { g, bankRad }, dtSec, excessFn)` (`point-mass.js`) | One fourth-order Runge-Kutta step of a point with speed, flight-path direction and bank, on the velocity vector (so it passes straight up or down) | Turn Fight; the zoom cross-check |
| `t6a-turn-charts.js` | The sustained turn rate chart's points (Figure 4-10-1: each altitude line's top at the stall limit, its 150 and 200 KIAS crossings and its zero; sea level to 31,000 ft), read off by eye, with the chart and reading notes, and the fitted constants (`T6A_FIT`). `tests/golden/checks/t6a-fit.mjs` refits them | the fit and its tests |

Sources, by page reference only (the charts and manuals stay in the project files, not the repo): the T-6A V-n diagram and sustained turn rate and radius charts (maximum power, clean, standard day); the T-6A max glide chart (Patrick's upload, 06:33Z) and SMM 13.5 para 7; the flight manual's zoom, NFM Fig 3-4, p.3-12. The motion, the fit and the chart checks are as SPEC-turn-fight describes them ("The model (T-6A, point mass)" and "Checks against the charts"); those words move here when that spec points to this section.

**Known-answer tests** (`tests/unit/core/t6-performance.test.js`, `point-mass.test.js`), each written first:
- The turn-chart checks: best sustained rate at sea level, 10,000 and 20,000 ft, zero sustained turn near 260 KIAS, smallest radius, the model's corner at 227.5 KIAS (SPEC-turn-fight's table and tolerances).
- Turn rate against the chart directly, at every chart point and at 12 more read by pixel in the independent check (verification/core.md): within 0.65°/s, or within 3 kt of speed where the curve is steep, from sea level to 15,000 ft; zero turn within 6 kt of every line; the tops of the lines within 0.35°/s with an 83 kt stall. The known misses are pinned, so they can't grow unseen: at 20,000 ft and up, from 175 KIAS, the model is up to 0.95°/s low (8 to 28 %), and with the 86 kt default the tops are 1.1 to 1.6°/s low.
- A level turn from `stepPointMass` gives `turnRadiusFt` and `turnRateRadPerSec`; with thrust equal to drag, energy height stays constant round a loop.
- **Glide cross-check:** `dragPerWeight` alone (no thrust) at 125 KIAS clean gives a glide ratio within 15 % of the chart's 2 NM per 1,000 ft (about 12:1). The test reports the difference.
- **Zoom cross-check:** a thrust-off `stepPointMass` zoom from 200 and 250 KIAS, flown as the NFM flies it, lands inside the manual's gains (595 to 883 ft from 200 KIAS, 1,172 to 1,552 ft from 250 KIAS) and within 10 % of the table's 5,400 lb row at every altitude. Built: 636 to 753 ft and 1,258 to 1,486 ft, 0 to 7 % above the table up to 3,000 ft; at 6,000 ft 5 % under (200 KIAS) and level (250 KIAS).
- `T6A_GLIDE`, `glideSinkFpm` and `zoomT6A` return the chart and manual numbers directly, so the Traffic Sim's answers never depend on the fit.

**Default if the glide cross-check misses:** add the glide chart as a fit point for the drag (thrust zero) and keep every turn-chart check passing. **Built that way:** in a sustained turn only thrust minus drag shows, so the turn chart alone could not tell them apart (a turn-chart-only fit missed the glide by 38 %). The drag comes from the glide chart alone (best glide at 125 KIAS, where the two drag parts are equal, and L/D 12.15), and the thrust (falling with true airspeed, flat to about 14,000 ft like the flat-rated PT6A-68, then falling with density) is fitted to the turn chart. All of SPEC-turn-fight's chart checks pass at both stall speeds. Every chart point's thrust is within 10 % of its drag at the chart's G. In turn rate, which is what the chart shows, that is within 0.65°/s up to 15,000 ft, but up to 28 % low at 20,000 ft and above near 200 KIAS, where the curves fall steeply (see the known limits below). Later, not now: if Dad gives an idle thrust or drag number (Q74), the break's slow-down could come from the model.

**The shaker and the split S** (Patrick, 2026-09-30 09:27Z, answering the manuals' energy check: "Split s goes up to 5g, go with your model"). Manoeuvre pulls fly in the stick shaker, not on the stall line; the split S pulls up to 5 G, and its height loss is measured from the entry altitude. The 5 G is the split S's own cap: `shakerG` alone stops at the V-n 7 G, so the Turn Fight picks each move's cap. The new functions change nothing already there: `stallLimitG` and `availableG` still give the stall line and the V-n limits. Checked against the SMM's about 2,000 ft (14.16 para 40) from 100 to 120 KIAS at 10,000 ft: 1,640 to 1,720 ft below the entry, 1,970 to 1,990 ft below the top. The same split S pulled on the stall line loses about 1,470 ft. So the SMM's 2,000 ft matches the loss from the top of the nose-up; from the entry the model is 14 to 18 % short. A hard-deck check that wants the safe side can use the loss from the top. Known-answer tests: `tests/unit/core/t6-performance.test.js`.

**Known limits** (the independent check of 2026-09-30, verification/core.md; kept, logged for Patrick's review):
- **Stall speed (F1).** 86 kt fits neither chart: the V-n curve reads about 89 kt, the turn charts about 83 kt at maximum power. Patrick kept 86 (09:29Z); the check recommends 83 for Energy mode with a 90 % shaker, which he can pick on review.
- **Turn rate above 20,000 ft (F2).** Up to 28 % low near 200 KIAS; within 0.65°/s at 15,000 ft and below, which covers the MTCA working blocks (6,000 to 15,500 ft). A refit to turn rate with the extra points only brings the worst miss from 0.90 to 0.69°/s, so the fit stays. Energy mode's start altitude has no cap yet, so above the MTCA blocks its turns can run this low.
- **Stall line and altitude (F3).** The V-n's 31,000 ft curve stalls about 12 % faster than sea level; the model's stall line doesn't change with height.
- **Compressibility (F4).** True airspeed is 2 to 4 % high at 20,000 ft and up at 200 to 250 KIAS; under 1 % below 15,000 ft.
- **Zoom outside the table and Mach (F5).** From 151 to 190 KIAS the zoom is 20 to 60 ft above the model's own flown zoom. The zoom and split S still accept up to VMO (316) at every height; a caller that flies high asks `maxKiasT6A` for the Mach limit (0.67, about 17,600 ft and up in the model's IAS).
- **Weight (F6).** The turn and glide numbers are for the charts' weight; only the zoom takes a weight.

**Decided by Patrick on 2026-09-30 (09:29Z, "Go with recommended on both"):** the stall speed stays 86 kt, from the V-n diagram, not the turn charts' 83 kt (SPEC-turn-fight, "One mismatch to settle"), and the zoom's weight stays 5,800 lb. **For Dad (flagged, not chosen here):** the zoom numbers for the CT-156 (Q74, T10). Each is one constant.

## Things `core` will flag, not choose

- **Two tennis-ball solvers disagreed** (issue #19). **Decided by Patrick on 2026-09-30 (D62, D63):** one solver, `tennisBall`. It is the debrief's, pinned to V6 in PR 2, and then changed one answer at a time in PR 3. The ball carries the shooter's whole velocity, climb included. The target flies its recorded path, climb included. The cone is ±3° for a width of 6, and INTERCEPT needs the target in the cone; Patrick confirmed both on 2026-09-30 (D77). The golden test still matches V6 when given V6's straight, level target path and no climb, apart from the cone rule. [`tasks/flight-math/tennis-ball.md`](../tasks/flight-math/tennis-ball.md) keeps the comparison that led here.
- **#3 judged by two standards at once** (#21, Q39): with spread and offset both on, V6 judges #3's fore/aft by both, so #3 is never "ON PARAMETERS" and can read "FORE / FORE" or "AFT / FORE". **Decided by Patrick on 2026-09-30 (D78):** when the offset standard is on, it alone judges #3's fore/aft, and the spread standard judges #3's interval. PR 3 pinned V6's labels; the change landed as its own commit. The golden test proves that the result is V6's `classifyKmlError` with the spread's fore/aft tolerance set too large to fire, for #3 with both standards on, and exactly V6 everywhere else. Turn Sim needed no change, since each of its formations judges #3 by one standard. Kept from V6: an aircraft no standard checks still reads "ON PARAMETERS".
- **The SMM's standards** (Patrick, 2026-09-30 05:37Z, from the manuals' Q7-Q9; SMM 16.18 para 49, 16.41 para 109; Gen Book p.12). A new preset, `DEFAULT_STANDARDS`, is what `app.standards` starts with; `V6_STANDARDS` stays V6's and the golden tests still pin every V6 check. Each change landed as its own commit after the pin:
  - **D116, sweep:** a spread standard with `sweepMinDeg`/`sweepMaxDeg` (default 0 and 10) replaces V6's ± `foreAftTolFt` of the 3/9 line with the SMM's 0-10° of sweep behind it. Less is FORE, more is AFT. The angle is measured from the aircraft the interval is measured from, so #4 flying off #3 (SMM 16.42 para 116) is swept from #3. Positions report `sweepDeg` (+ aft). With the offset standard on, #3's fore/aft is still the offset standard's (D78). The Turn Sim uses the same check when given the new standards (D89).
  - **D114, offset box:** `aftTargetFt` 7,000 ± 1,000, so 6,000-8,000 ft passes (V6: 8,000 ± 1,000).
  - **D115, lead speed:** a lead standard with `lowTargetKt` (220 KIAS), `midTargetKt` (200) and `lowBlockTopFt` (10,250 ft, between the low block's 10,000 ft top and the mid block's 10,500 ft floor) replaces V6's single `targetKt`. `leadTargetKt(leadStd, altFt)` picks it from Lead's altitude; with no altitude it uses the mid block's 200, V6's number. The debrief compares its estimated IAS with it.
- **Below 1 G, Turn Sim's turn goes to NaN.** Turn Sim's G correction (line 1583) adds up to −0.8 G after the 1.01 limit. So when base G plus the aircraft's G error is under 1.8, a wingman's G can drop below 1 (at exactly 1.8 it reaches 1 G, and the turn rate is 0). Then `turnRateRadPerSec` gives NaN, as V6's `turnRate` does, and that aircraft's position becomes NaN. This was read from the code, not run. Decided (D74, Patrick's pick on the Q38 card, 2026-09-30): when the Turn Sim G correction is ported, G is limited to 1.01 after the correction, so the wingman flies almost straight instead of going NaN. V6's order is pinned by a golden test first, and the floor lands as its own commit (D10). **Built:** `turnSimG` in `flight-math.js`, pinned to V6's own two lines first, then the floor; the golden test shows the new G equals V6's except where V6's ended under 1.01, which is now 1.01.
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
                     units.js angles.js geo.js time.js (PR 1); flight-math.js tennis.js (PR 2); standards.js (PR 3); wind.js (PR 4);
                     t6-performance.js point-mass.js t6a-turn-charts.js (PR 5)
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
4. **The tests must catch a broken port.** Before each PR, a mutation check breaks the ports on purpose, one change at a time (a constant nudged, a sign flipped, a boundary moved). With the T-6A model (PR 5) and `turnSimG` (Task 12), 205 of 210 changes turn a test red; all 49 in the T-6A files and all 13 for `turnSimG` are caught. The other five are equivalent: `absAngleDeg(h1 - h2)` for `(h2 - h1)`; 0.3048 for 1/3.28084 inside the tile-zoom rounding; and two guards kept from V6 that no input can reach (`emPoint`'s density floor of 0.15, since the ratio never falls below 0.297, and `gFromTrack`'s floor of 0.8 G, since its G is never below 1); and `wind.js`'s `<` for `<=` where the crosswind equals the airspeed, since a crosswind exactly equal to the airspeed leaves no headway either way. Line coverage of `src/core` is 100%.
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
