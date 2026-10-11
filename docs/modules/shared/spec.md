> **Note (reset, 4 Oct 2026):** this is the spec as it stood before the reset, moved here unchanged. It is refreshed against this module's new `requirements.md` and `decisions.md` when the module's work resumes. Where it disagrees with them, they win. Lines saying the code must give "the same answer V6 gives" or must match V6 are replaced: flight math is checked against the manuals and standard aerodynamics (ALL-R22, Patrick's answer Q-ALL-4).
>
> **Replaced old decisions:** this spec still cites D10, D29, D34, D59, D60, D63, D72, D89, D112, which are no longer in force. The "Replaced old decisions" section of `../../DECISIONS.md`, `../sof/decisions.md`, `../turn-fight/decisions.md` and `../turn-sim/decisions.md` says what took each one's place.

# Shared parts spec

This module's spec is made of 6 old specs, one section each: `archive/specs/SPEC-core.md`, `archive/specs/SPEC-shell.md`, `archive/specs/SPEC-storage.md`, `archive/specs/SPEC-ui-kit.md`, `archive/specs/SPEC-wx.md`, `archive/specs/SPEC-airfields.md`.

## From `archive/specs/SPEC-core.md`

## Spec: `core`, the shared flight math

Status: **approved by Patrick on 2026-09-30** ("spec-core approved", in the Flight math core thread). Changes go through a pull request. Module id `core` in [`archive/SPEC.md`](../../../archive/SPEC.md). Requirement IDs (R#), decisions (D#) and questions (Q#) refer to the plan doc: https://claude.ai/code/artifact/29712036-a126-43c3-ac39-57ba919ff102

### Objective

One set of small, pure, tested functions for the numbers every module shows: units, angles and headings, map projection, turn performance, formation standards and time. Today V6 has several copies of each, some of which disagree (audit issue #43). `core` replaces them with one copy, so a number means the same thing in the debrief, Turn Sim, Turn Fight and Traffic.

The rule for this module is R9: every function gives **the same answer V6 gives** for the same input, proven by a golden test that runs V6's own function, unchanged, next to the port. Fixes to V6's math come later, one at a time, only with Dad's sign-off and a logged decision (CLAUDE.md, Q18). **[Replaced by ALL-R22 and Q-ALL-4: flight math is checked against the manuals and standard aerodynamics, not V6.]**

Users never see `core` directly. Its "users" are the other modules and the people who later read or change the math (R8).

### Assumptions

1. V6's numbers are the reference, even where the audit shows them wrong (D29). A wrong number is ported as it is and fixed later, separately.
2. Inputs are finite numbers. `core` checks for missing values only where V6 did. Screens validate what people type (see "Things `core` will flag").
3. Time zones come from the browser's built-in time-zone data (`Intl`), which current Chrome, Edge, Firefox and Safari all ship (R1, R10).
4. The golden tests read `original/shell.html` when they run, so they always compare against the untouched V6.

### Tech stack

Plain JavaScript ES modules with no dependencies, which run as they are in a browser and in Node. Tests use Node's built-in `node:test` (Node 22 or later), with no packages.

### Scope

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

### The heading convention (pinned by `tests/unit/core/angles.test.js`)

- Inside the code a **heading is a math angle in radians**: 0 points east (+x), angles grow counter-clockwise, so π/2 is north. The world is north-up, x east and y north, in feet.
- This is what V6's debrief, 3D view, EM chart, Turn Sim and Turn Fight already use (`Math.atan2(dy, dx)` everywhere), so porting them needs no conversion.
- A relative bearing is positive to the **left** (V6's `relativeBearingDeg`); 3 o'clock is −90°.
- Only the screen shows **compass headings** (000 = north, clockwise). Convert at the edge with `compassDegToHeadingRad` and `headingRadToCompassDeg`.
- V6's Traffic page is the exception: compass degrees with screen y pointing down. `unitVectorFromCompassDeg` returns its vector north-up (y flipped), and the golden test proves that is the only difference.
- Turn Sim's start heading becomes a compass heading (D45, Dad). `core` converts it at the screen with `compassDegToHeadingRad`.

### API, first PR

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

### API, second PR

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

### API, third PR

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

### API, fourth PR: wind (for SPEC-traffic)

V6 has no wind, so there is nothing to pin: this is new, checked against known answers (`tests/unit/core/wind.test.js`), and with the wind calm it gives V6's numbers exactly. It takes **compass degrees** (000 north, 090 east), unlike the rest of `core`, because a wind comes that way from a METAR and Traffic routes are laid out that way. The wind is one steady wind, given as the direction it blows **from**.

| Function | Returns |
|---|---|
| `windTriangle(trackDeg, tasKt, windFromDeg, windKt)` | `{ crabDeg, headingDeg, groundSpeedKt, headwindKt, crosswindKt, canHoldTrack }` |

- crosswind = W × sin(D − T), + from the right; headwind = W × cos(D − T), − for a tailwind; crab = asin(crosswind ÷ TAS), + to the right; heading = T + crab, 0 to 360; ground speed = TAS × cos(crab) − headwind. Track 290°, 110 KTAS, wind 250° at 20 kt gives a crab of 6.7° left and 94 kt over the ground.
- Calm gives exactly no crab, the track as the heading and the airspeed as the ground speed.
- `canHoldTrack` is false when the crosswind is stronger than the airspeed (then the crab is ±90°, straight into the wind) or the ground speed would be 0 or less; `groundSpeedKt` is then 0. What to do then (the Traffic Sim crawls at 10 kt) is the screen's.

### API, fifth PR: T-6A performance (shared by the Turn Fight, Traffic and Turn Sim)

**Decided by Patrick on 2026-09-30 (06:58Z, "Yess hared model"):** one T-6A performance model in `core`, which every module reads. Each module keeps its own flying: the Turn Fight its moves (Energy mode, D112, SPEC-turn-fight), the Traffic Sim its pattern at the SMM speeds and its engine-out glide (SPEC-traffic), and the Turn Sim its V6 formation turns. Nothing a module shows today changes because of this: the model only puts the numbers in one place and checks them against each other. It is built test-first (tasks 14 to 17 in `archive/tasks/flight-math/todo.md`) when Patrick's build order reaches it; until he picks, that is the Turn Fight's turn, before the Traffic build needs it. V6 has none of this, so there is nothing to pin; it is checked against the T-6A's own charts.

| Function or data | What it gives | First used by |
|---|---|---|
| `T6A_LIMITS` | The V-n limits, clean, at the V-n diagram's 5,168 lb: +7 G and −3.5 G, +4.7 G while rolling, VO 227 KIAS, VMO 316 KIAS, Mmo 0.67 (NFM Fig 5-3, p.5-9); and the stall speed, 86 KIAS by default (the V-n curve reads about 89) | Turn Fight, Turn Sim |
| `stallLimitG(kias)` | (KIAS ÷ stall speed)², which reaches 7 G at 227.5 KIAS with the 86 kt default (the V-n curve itself reaches 7 G near 236 KIAS; VO, 227, is a limit speed, not this corner) | Turn Fight; the Turn Sim's warning beside its G box when the set G is above it |
| `availableG(kias, rolling)` | The G the aircraft can pull now: the stall line, capped at +7 G (+4.7 while rolling) | Turn Fight |
| `iasToTasKt(kias, altFt)`, `tasToIasKt(ktas, altFt)` | TAS = IAS ÷ √σ, through `isaDensityRatio`; compressibility ignored | Turn Fight, Traffic |
| `thrustPerWeight(kias, altFt)` | Maximum-power propeller thrust ÷ weight, falling with speed and density | Turn Fight |
| `dragPerWeight(kias, altFt, g)` | Drag ÷ weight: a zero-lift part plus a part growing with G² | Turn Fight; the glide and zoom cross-checks |
| `excessThrustPerWeight(kias, altFt, g)` | thrustPerWeight − dragPerWeight, (T − D)/W | Turn Fight |
| `t6aExcessFn(ktas, altFt, g)` | `excessThrustPerWeight` in the form `stepPointMass` calls it (true airspeed in) | Turn Fight |
| `speedOfSoundKt(altFt)` | The speed of sound on a standard day, √(γRT): 661.5 kt at sea level, 573.6 kt above 36,089 ft | `machToKiasKt` |
| `machToKiasKt(mach, altFt)` | The KIAS an airspeed indicator reads at a Mach number: standard calibrated airspeed, with compressibility, standard day. M0.67 is 279.1 KIAS at 25,000 ft, 245.3 at 31,000 ft | `maxKiasT6A` |
| `maxKiasT6A(altFt)` | The top speed at a height, on the NFM's line (Fig 5-3): VMO 316 KIAS, or Mmo 0.67 where that is slower (above about 18,900 ft; 309 KIAS at 20,000 ft, 279 at 25,000 ft, 245 at 31,000 ft against the chart's 244). The airspeed indicator's reading, for showing a pilot; not for holding a model's IAS (TAS × √σ) to, which would fly about Mach 0.69 at 25,000 ft | Turn Fight readouts |
| `modelMaxIasT6A(altFt)` | The same limit on the model's own IAS (TAS × √σ): VMO 316, or the IAS at a true Mach 0.67 where that is slower (from about 17,600 ft; 300 at 20,000 ft, 270 at 25,000 ft, 236 at 31,000 ft). A model held to it is never over Mach 0.67 | Turn Fight guards |
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
| `t6a-turn-charts.js` | The sustained turn rate chart's points (Figure 4-10-1: each altitude line's top at the stall limit, its 150 and 200 KIAS crossings and its zero; sea level to 31,000 ft), read off by eye, with the chart and reading notes, and the fitted constants (`T6A_FIT`). `archive/tests/golden/checks/t6a-fit.mjs` refits them | the fit and its tests |

Sources, by page reference only (the charts and manuals stay in the project files, not the repo): the T-6A V-n diagram and sustained turn rate and radius charts (maximum power, clean, standard day); the T-6A max glide chart (Patrick's upload, 06:33Z) and SMM 13.5 para 7; the flight manual's zoom, NFM Fig 3-4, p.3-12. The motion, the fit and the chart checks are as SPEC-turn-fight describes them ("The model (T-6A, point mass)" and "Checks against the charts"); those words move here when that spec points to this section.

**Known-answer tests** (`tests/unit/core/t6-performance.test.js`, `point-mass.test.js`), each written first:
- The turn-chart checks: best sustained rate at sea level, 10,000 and 20,000 ft, zero sustained turn near 260 KIAS, smallest radius, the model's corner at 227.5 KIAS (SPEC-turn-fight's table and tolerances).
- Turn rate against the chart directly, at every chart point and at 12 more read by pixel in the independent check (verification/core.md): within 0.65°/s, or within 3 kt of speed where the curve is steep, from sea level to 15,000 ft; zero turn within 6 kt of every line; the tops of the lines within 0.35°/s with an 83 kt stall. The known misses are pinned, so they can't grow unseen: at 20,000 ft and up, from 175 KIAS, the model is up to 0.95°/s low (8 to 28 %), and with the 86 kt default the tops are 1.1 to 1.6°/s low.
- A level turn from `stepPointMass` gives `turnRadiusFt` and `turnRateRadPerSec`; with thrust equal to drag, energy height stays constant round a loop.
- **Glide cross-check:** `dragPerWeight` alone (no thrust) at 125 KIAS clean gives a glide ratio within 15 % of the chart's 2 NM per 1,000 ft (about 12:1). The test reports the difference.
- **Zoom cross-check:** a thrust-off `stepPointMass` zoom from 200 and 250 KIAS, flown as the NFM flies it, lands inside the manual's gains (595 to 883 ft from 200 KIAS, 1,172 to 1,552 ft from 250 KIAS) and within 10 % of the table's 5,400 lb row at every altitude. Built: 636 to 753 ft and 1,258 to 1,486 ft, 0 to 7 % above the table up to 3,000 ft; at 6,000 ft 5 % under (200 KIAS) and level (250 KIAS).
- `T6A_GLIDE`, `glideSinkFpm` and `zoomT6A` return the chart and manual numbers directly, so the Traffic Sim's answers never depend on the fit.

**Default if the glide cross-check misses:** add the glide chart as a fit point for the drag (thrust zero) and keep every turn-chart check passing. **Built that way:** in a sustained turn only thrust minus drag shows, so the turn chart alone could not tell them apart (a turn-chart-only fit missed the glide by 38 %). The drag comes from the glide chart alone (best glide at 125 KIAS, where the two drag parts are equal, and L/D 12.15), and the thrust (falling with true airspeed, flat to about 14,000 ft like the flat-rated PT6A-68, then falling with density) is fitted to the turn chart. All of SPEC-turn-fight's chart checks pass at both stall speeds. Every chart point's thrust is within 10 % of its drag at the chart's G. In turn rate, which is what the chart shows, that is within 0.65°/s up to 15,000 ft, but up to 28 % low at 20,000 ft and above near 200 KIAS, where the curves fall steeply (see the known limits below). Later, not now: if Dad gives an idle thrust or drag number (Q74), the break's slow-down could come from the model. **Since then:** Patrick's own break numbers (2 G, 220 to about 130 KIAS in 180°) give the idle prop's extra drag, about 0.16 of the weight at 200 KIAS; the Formation Sim holds it as its own term and the core curves are unchanged (Formation Sim decision TS-61, `docs/modules/turn-sim/decisions.md`).

**The shaker and the split S** (Patrick, 2026-09-30 09:27Z, answering the manuals' energy check: "Split s goes up to 5g, go with your model"). Manoeuvre pulls fly in the stick shaker, not on the stall line; the split S pulls up to 5 G, and its height loss is measured from the entry altitude. The 5 G is the split S's own cap: `shakerG` alone stops at the V-n 7 G, so the Turn Fight picks each move's cap. The new functions change nothing already there: `stallLimitG` and `availableG` still give the stall line and the V-n limits. Checked against the SMM's about 2,000 ft (14.16 para 40) from 100 to 120 KIAS at 10,000 ft: 1,640 to 1,720 ft below the entry, 1,970 to 1,990 ft below the top. The same split S pulled on the stall line loses about 1,470 ft. So the SMM's 2,000 ft matches the loss from the top of the nose-up; from the entry the model is 14 to 18 % short. A hard-deck check that wants the safe side can use the loss from the top. Known-answer tests: `tests/unit/core/t6-performance.test.js`.

**Known limits** (the independent check of 2026-09-30, verification/core.md; kept, logged for Patrick's review):
- **Stall speed (F1).** 86 kt fits neither chart: the V-n curve reads about 89 kt, the turn charts about 83 kt at maximum power. Patrick kept 86 (09:29Z); the check recommends 83 for Energy mode with a 90 % shaker, which he can pick on review.
- **Turn rate above 20,000 ft (F2).** Up to 28 % low near 200 KIAS; within 0.65°/s at 15,000 ft and below, which covers the MTCA working blocks (6,000 to 15,500 ft). A refit to turn rate with the extra points only brings the worst miss from 0.90 to 0.69°/s, so the fit stays. Energy mode's start altitude has no cap yet, so above the MTCA blocks its turns can run this low.
- **Stall line and altitude (F3).** The V-n's 31,000 ft curve stalls about 12 % faster than sea level; the model's stall line doesn't change with height.
- **Compressibility (F4).** True airspeed is 2 to 4 % high at 20,000 ft and up at 200 to 250 KIAS; under 1 % below 15,000 ft.
- **Zoom outside the table and Mach (F5).** From 151 to 190 KIAS the zoom is 20 to 60 ft above the model's own flown zoom. The zoom and split S still accept up to VMO (316) at every height; a caller that flies high holds its aircraft to `modelMaxIasT6A` (Mach 0.67 in the model's own IAS) and shows the pilot `maxKiasT6A` (the NFM's KIAS line). The two differ because the model's IAS-to-TAS has no compressibility: holding a model to the NFM's KIAS would fly about Mach 0.69 at 25,000 ft. VMO is still read on the model's IAS as it stands, like every other manual KIAS, which is about 4 to 10 kt fast in true airspeed from 10,000 ft to about 17,600 ft, where the Mach limit takes over. Turn Fight's Energy guards move from `maxKiasT6A` to `modelMaxIasT6A` in its own follow-up (2026-09-30).
- **Weight (F6).** The turn and glide numbers are for the charts' weight; only the zoom takes a weight.

**Decided by Patrick on 2026-09-30 (09:29Z, "Go with recommended on both"):** the stall speed stays 86 kt, from the V-n diagram, not the turn charts' 83 kt (SPEC-turn-fight, "One mismatch to settle"), and the zoom's weight stays 5,800 lb. **For Dad (flagged, not chosen here):** the zoom numbers for the CT-156 (Q74, T10). Each is one constant.

### Things `core` will flag, not choose

- **Two tennis-ball solvers disagreed** (issue #19). **Decided by Patrick on 2026-09-30 (D62, D63):** one solver, `tennisBall`. It is the debrief's, pinned to V6 in PR 2, and then changed one answer at a time in PR 3. The ball carries the shooter's whole velocity, climb included. The target flies its recorded path, climb included. The cone is ±3° for a width of 6, and INTERCEPT needs the target in the cone; Patrick confirmed both on 2026-09-30 (D77). The golden test still matches V6 when given V6's straight, level target path and no climb, apart from the cone rule. [`archive/tasks/flight-math/tennis-ball.md`](../../../archive/tasks/flight-math/tennis-ball.md) keeps the comparison that led here.
- **#3 judged by two standards at once** (#21, Q39): with spread and offset both on, V6 judges #3's fore/aft by both, so #3 is never "ON PARAMETERS" and can read "FORE / FORE" or "AFT / FORE". **Decided by Patrick on 2026-09-30 (D78):** when the offset standard is on, it alone judges #3's fore/aft, and the spread standard judges #3's interval. PR 3 pinned V6's labels; the change landed as its own commit. The golden test proves that the result is V6's `classifyKmlError` with the spread's fore/aft tolerance set too large to fire, for #3 with both standards on, and exactly V6 everywhere else. Turn Sim needed no change, since each of its formations judges #3 by one standard. Kept from V6: an aircraft no standard checks still reads "ON PARAMETERS".
- **The SMM's standards** (Patrick, 2026-09-30 05:37Z, from the manuals' Q7-Q9; SMM 16.18 para 49, 16.41 para 109; Gen Book p.12). A new preset, `DEFAULT_STANDARDS`, is what `app.standards` starts with; `V6_STANDARDS` stays V6's and the golden tests still pin every V6 check. Each change landed as its own commit after the pin:
  - **D116, sweep:** a spread standard with `sweepMinDeg`/`sweepMaxDeg` (default 0 and 10) replaces V6's ± `foreAftTolFt` of the 3/9 line with the SMM's 0-10° of sweep behind it. Less is FORE, more is AFT. The angle is measured from the aircraft the interval is measured from, so #4 flying off #3 (SMM 16.42 para 116) is swept from #3. Positions report `sweepDeg` (+ aft). With the offset standard on, #3's fore/aft is still the offset standard's (D78). The Turn Sim uses the same check when given the new standards (D89).
  - **D114, offset box:** `aftTargetFt` 7,000 ± 1,000, so 6,000-8,000 ft passes (V6: 8,000 ± 1,000).
  - **D115, lead speed:** a lead standard with `lowTargetKt` (220 KIAS), `midTargetKt` (200) and `lowBlockTopFt` (10,250 ft, between the low block's 10,000 ft top and the mid block's 10,500 ft floor) replaces V6's single `targetKt`. `leadTargetKt(leadStd, altFt)` picks it from Lead's altitude; with no altitude it uses the mid block's 200, V6's number. The debrief compares its estimated IAS with it.
- **Below 1 G, Turn Sim's turn goes to NaN.** Turn Sim's G correction (line 1583) adds up to −0.8 G after the 1.01 limit. So when base G plus the aircraft's G error is under 1.8, a wingman's G can drop below 1 (at exactly 1.8 it reaches 1 G, and the turn rate is 0). Then `turnRateRadPerSec` gives NaN, as V6's `turnRate` does, and that aircraft's position becomes NaN. This was read from the code, not run. Decided (D74, Patrick's pick on the Q38 card, 2026-09-30): when the Turn Sim G correction is ported, G is limited to 1.01 after the correction, so the wingman flies almost straight instead of going NaN. V6's order is pinned by a golden test first, and the floor lands as its own commit (D10). **Built:** `turnSimG` in `flight-math.js`, pinned to V6's own two lines first, then the floor; the golden test shows the new G equals V6's except where V6's ended under 1.01, which is now 1.01.
- **Fixes Dad approved (D39 to D47):** EM turn rate without the divide by 2 (D39); 3D bank from the real rate, correct wing down, G only in level turns (D40); Turn Sim toward/away (D41) and wide/tight (D42); auto timing (D43, D44); compass start heading (D45); true circular arcs in Traffic (D46); recorded bank and estimated blank pitch (D47). Under D10, each function is first ported and pinned to V6's number, and the fix then lands as its own change that updates the golden value. None of them touches PR 1's functions. D39 landed in the second PR. Q31 is answered (Patrick, 2026-09-30): in 4312, #2 flies on lead's left, as V6 draws it. In real life it depends on how the formation joined, so the Turn Sim port should make the side a setting with left as the default.
- **Infinite headings hang.** V6's angle-wrapping loops (`normDeg`, `normAngleRad` and their copies) never return for ±Infinity, and crawl on values past about 1e9. In V6, a huge number such as 1e20 typed into Turn Sim's Start heading box becomes the aircraft's heading (line 798), and with the clock or bearing cue trigger on, it reaches these loops (lines 1499 and 1528), so the page would freeze. This was read from the code, not run. `core` keeps the loops as they are. The fix is at the screen: `ui-kit` controls must reject non-finite and out-of-range numbers. A guard inside `core` would change no number V6 ever shows, but it would still change behaviour, so it needs a decision.

### Commands

```
node --test "tests/**/*.test.js"     # what npm test should run (see note below)
```

Note for the app frame: on Node 22, `node --test tests/unit tests/golden` fails ("Cannot find module"), because `--test` takes files or globs, not folders. The glob above runs both folders.

### Project structure

```
src/core/            README.md (what's here, the heading rule, how to change a number)
                     units.js angles.js geo.js time.js (PR 1); flight-math.js tennis.js (PR 2); standards.js (PR 3); wind.js (PR 4);
                     t6-performance.js point-mass.js t6a-turn-charts.js (PR 5)
tests/golden/        v6-source.js  loads V6's own functions from original/shell.html
                     inputs.js     fixed edge cases plus seeded random inputs
                     core-*.test.js  V6 vs core, function by function
tests/unit/core/     *.test.js     what the numbers mean (known answers, the heading convention, R10 dates)
```

### Code style

Plain ES modules, no dependencies, no page access. A short comment on each function names its V6 source line, so the port can be checked by eye.

```js
/** Heading crossing angle (HCA) in degrees, 0 to 180 (debrief line 2717). */
export function headingCrossAngleDeg(h1, h2) {
  if (!Number.isFinite(h1) || !Number.isFinite(h2)) return null;
  return absAngleDeg(h2 - h1);
}
```

### Testing strategy

1. **Golden tests** (`tests/golden/core-*.test.js`, R9). `v6-source.js` cuts each V6 function out of `original/shell.html` by name (or out of the SOF and Traffic pages V6 embeds as base64) and runs it unchanged. Globals V6 reads are supplied by a small prelude. Each test runs V6 and `core` on the same inputs: fixed edge cases (±π, month ends, both 2026 clock changes, bad input) and a few hundred seeded random values around Moose Jaw.
2. **Exact match by default.** A tolerance is allowed only where V6 itself has two copies that disagree, and the test says why.
3. **Unit tests** (`tests/unit/core/`) check meaning against known answers: a minute of latitude is a nautical mile, 3 o'clock is on the right, Moose Jaw stays UTC-6 across both clock changes while Denver moves (R10).
4. **The tests must catch a broken port.** Before each PR, a mutation check breaks the ports on purpose, one change at a time (a constant nudged, a sign flipped, a boundary moved). With the T-6A model (PR 5) and `turnSimG` (Task 12), 205 of 210 changes turn a test red; all 49 in the T-6A files and all 13 for `turnSimG` are caught. The other five are equivalent: `absAngleDeg(h1 - h2)` for `(h2 - h1)`; 0.3048 for 1/3.28084 inside the tile-zoom rounding; and two guards kept from V6 that no input can reach (`emPoint`'s density floor of 0.15, since the ratio never falls below 0.297, and `gFromTrack`'s floor of 0.8 G, since its G is never below 1); and `wind.js`'s `<` for `<=` where the crosswind equals the airspeed, since a crosswind exactly equal to the airspeed leaves no headway either way. Line coverage of `src/core` is 100%.
5. **Same answers in a browser.** Each PR also loads `src/core` in Chromium as plain ES modules and compares about 14,700 results with Node's, failing on anything beyond the last digits. Time and Intl results match exactly. 248 results that use `sin`, `cos`, `atan2` or `Math.pow` differ in the last digits (at most 3.2e-15 relative), because JavaScript engines may round these functions differently. The golden tests run V6 and `core` in the same engine, so they compare exactly. Any comparison with numbers recorded in a browser (such as `archive/tests/golden/v6-baseline.json`) must allow at least 1e-12 relative. That tolerance is far below anything shown on screen, and it is the "stated tolerance" R9 asks for.

### Boundaries

- **Always:** port unchanged; pin with a golden test first; cite the V6 line; run the tests before each commit.
- **Ask first:** any change to a number V6 shows; adding a package (none are used; `node:test` only).
- **Never:** edit `original/`; change a number without a logged decision (D39 to D47 and Q31 are settled); fold a fix into the port that pins V6's number; loosen a golden tolerance to get green.

### Success criteria

- Every function in the tables above has a golden test against V6 and passes.
- The mutation check leaves no surviving change that isn't equivalent, and `src/core` runs unchanged in a current browser with the same answers as Node.
- Every number the later modules show that depends on these functions comes from `core`, not a local copy.
- The heading convention is written here and in `angles.js`, and pinned by tests.

### Plan

The tasks, checkpoints and risks are in [`archive/tasks/flight-math/plan.md`](../../../archive/tasks/flight-math/plan.md) and [`todo.md`](../../../archive/tasks/flight-math/todo.md).

### Open questions

1. Guard against infinite input inside `core`, or only at the screen (see above)? The default is at the screen only.


## From `archive/specs/SPEC-shell.md`

## Spec: shell

Module id `shell` in the approved map (`archive/SPEC.md`). Build step 1.

### Objective

The hub: the home screen, the one place that opens and closes modules, the settings everyone shares, and the pages that aren't modules (About, Report a problem). In V6 every module lived on one page at once, hidden modules kept running (#39), dead cards and buttons stayed on screen (#40), the home screen autoplayed 61 MB of video (#41), and there was no shared Zulu/local switch (#42). Here, exactly one module is mounted at a time, only real features appear, and the home screen loads in about 3 MB or less (R5).

Step 1 ends with this shell live on GitHub Pages (D12) with no modules built yet. Each module's card becomes clickable when that module lands.

### Behaviour

**Routes** (hash-based, so it works on GitHub Pages and from a plain file server):

| Route | Shows |
|---|---|
| `#/` (or empty) | Home screen |
| `#/about` | About Dad (V6's About content) |
| `#/<module-id>` | That module, e.g. `#/debrief` |
| anything else | Home screen with a one-line "page not found" note |

Ids match without regard to case, so `#/SOF` opens the SOF (AF-4). The not-found note shows the address as it was typed.

The browser's Back and Forward buttons move between these. After a page change, the new page opens at its top with keyboard focus on it, so Tab and screen readers carry on from there. The "Skip to content" link moves focus to the page without changing the address.

**Browsers:** current Chrome, Edge and Firefox, and Safari 15.4 or newer (the Settings dialog and `Object.hasOwn` need it). Nothing to install (R1).

**Home screen:** the title "DAD's OODA LOOP" (D27), then one card per module in `src/shell/registry.js`, in build order: Debrief, Formation Turn Sim, Turn Fight, Traffic Pattern Sim, SOF Dashboard, then About. A module that isn't built yet shows as a plain card marked "Coming soon". It isn't a button and can't be clicked (R3). A module hooked in before the combined sign-off opens as usual and its card carries a PROTOTYPE badge (D135); the flag comes off at sign-off. PT-PT Sim and the Briefing Board don't appear (R19).

**Card videos:** each module's card plays its V6 loop, re-encoded silent at 640 px (D9, R15; about 1 MB for all five, made by `tools/make_card_media.py`). A card shows a still until its video is needed. A video loads only when its card is on screen, plays only while visible, and doesn't play at all when the user or the system asks for reduced motion (#41).

**Header** (on every screen): the title (links home), the time, Settings, and Report a problem.

- **Time:** Zulu first with local beside it, or local first, as set in Settings (D18, R10). Local time is the home airfield's zone (`airfields.home().timeZone`; America/Regina, UTC-6 all year, for CYMJ). It is read on every tick, and the clock redraws at once when the home field changes (SPEC-airfields). The formatting comes from `core/time.js` (owned by the flight-math workstream). The clock ticks once a second on the shell's scheduler scope and pauses while the tab is hidden.
- **Settings** opens a dialog: time order (Zulu first / Local first) and card videos (follow this computer's setting / play them / still pictures only; the setting is `motion`, and "still pictures only" also turns off transitions). Below them, the Airfields section (`createAirfieldsPanel` from `src/airfields/panel.js`, SPEC-airfields), set apart by a rule. If the browser blocks storage, the dialog says settings won't be saved.
- **Report a problem** (R20) opens GitHub's new-issue form for this repo, using the form in `.github/ISSUE_TEMPLATE/problem.yml`, with the current module and app version filled in.

**About:** V6's About page content (the formation photo, Dad's text, contact, mission, and support links), with a link back home.

**Footer:** when this copy was published, in plain words ("Updated 30 Sep 2026, 02:01Z", R22). The version (build date and commit) sits in its tooltip and goes with every bug report, so reports say which version they're about.

**New version available:** when an updated version has been published, a bar says so with a Reload button (see Offline).

### Module contract (the fix for R4)

Every module's `index.js` exports:

```js
export default {
  id: 'turn-sim',
  title: 'Formation Turn Sim',
  mount(root, app) {
    // build the module inside root
    return () => { /* optional extra cleanup */ };
  },
};
```

The registry lists each module's id, title, card text, card media and a `load()` that dynamically imports its `index.js`, so a module's code downloads only when it opens (R5). It also carries `prototype: true` for every module except Debrief, which puts the PROTOTYPE badge on the card once the module is hooked in; the flag is removed at the combined sign-off (D135).

`app` handed to a module:

| Field | What it is |
|---|---|
| `app.settings` | Shared settings: `get()` and `subscribe()` (subscriptions end on unmount) |
| `app.storage` | The store scoped to the module's id |
| `app.scheduler` | A scheduler scope, disposed on unmount |
| `app.listen(target, type, handler, options)` | Adds an event listener that's removed on unmount |
| `app.keys({ 'KeyP': fn, … })` | Keyboard shortcuts that work only while this module is open and never while typing in a field |
| `app.time` | Time from `core/time.js` for the home airfield: `zulu(date)` "18:00:00Z", `local(date)` "12:00:00 CST", `ordered(date)` both in the order Settings picked, `offsetMinutes(date)`, `zone` (read live, so it follows the home field), `now()` |
| `app.airfields` | The home field and alternates, read-only: `home()`, `alternates()`, `stations()`, `checkOptions(icao)`, and `subscribe()` (subscriptions end on unmount). They're changed only in Settings. |
| `app.standards` | The formation standards the debrief and the Turn Sim judge by (R18, D89), one shared copy kept in the `standards` storage scope. `get()` returns a frozen object shaped like core's `DEFAULT_STANDARDS` (the SMM's numbers: 0-10° of sweep D116, offset 7,000 ± 1,000 ft D114, lead 220 kt in the low block and 200 kt in the mid block D115), ready for `core/standards.js`. `update(patch)` merges per group (`{ spread: { minFt: 4500 } }`) and saves only if every value is in range and the spread minimum and sweep least don't pass their maximums; it returns `{ ok, errors }`, each error `{ path: 'spread.minFt', message }` for showing beside that box. `reset()` goes back to `DEFAULT_STANDARDS`. Saves from before D114-D116 (version 1, V6's shape) fall back to the defaults. `limits` gives each number's label, unit, min, max and step; `check(value)` lists the problems with a whole standards object (for a debrief file). `subscribe()` ends on unmount. The debrief owns the editor. |
| `app.exampleText(asset)` | Downloads one of the example flight's track files by its asset name (flight-data's `EXAMPLE_FLIGHT`) and resolves to its text, so `loadExampleFlight(app.exampleText)` works as it is. The files are served gzipped from `public/examples/<asset>.gz` (about 0.7 MB for all four instead of 11 MB) and un-gzipped in the browser. Nothing downloads until it's called (R5). |
| `app.status(text)` | Shows a short message in the module's status line |
| `app.canLeave(check)` | Before the shell closes the module for another page, `check()` returns the question to ask (something would be lost, e.g. the Debrief's unsaved radar) or nothing. The shell asks with the browser's own OK/Cancel box; Cancel keeps the page and puts the address and history back. A check that throws still asks ("This page couldn't check for unsaved work. Leave anyway?"). Removed on unmount; returns a function that stops it. Reload and tab close are the module's own `beforeunload` |

Opening a route: the shell unmounts the current module (calls its cleanup, disposes its scheduler scope, removes its listeners, shortcuts and subscriptions, empties its root), then mounts the next. If loading or mounting throws, the shell shows an error card with a Report a problem link and the Home button still works.

### Offline and install (D15, R6)

- A web app manifest and icons, so browsers offer to install it.
- A service worker (`sw.js`, generated at build time with the list of built files) caches the app on the first visit, so after that every built module opens with the network off. Live weather and map tiles are never cached as if they were fresh.
- When a new version is published, the service worker downloads it in the background and the shell shows the "new version" bar. Nobody is left on an old version without being told.
- Card videos aren't kept for offline use (their stills show instead), which keeps the first visit about 2 MB lighter.
- The example flight's files aren't part of the first visit either. The service worker keeps each one the first time it's downloaded, so an example opened once also plays offline (R6).
- An open app looks for a new version every hour, since the SOF screen stays open all day, and again when its tab comes back into view (at most every five minutes).

### Files

```
index.html               the page: header, main view, footer; loads src/app.js
src/app.js               entry: creates store, settings, scheduler, host; starts the router
src/shell/registry.js    the module list (ids, titles, card text and media, load())
src/shell/router.js      parses the hash into a route; pageFor picks the page and the note ("coming soon", "no page"); watchAddress shows each new address and asks the open module (app.canLeave) first; Cancel puts the address and history back
src/shell/host.js        mounts and unmounts modules, builds the app object
src/shell/home.js        home screen and cards
src/shell/about.js       About page
src/shell/header.js      the header clock and app.time
src/shell/settings-dialog.js
src/shell/update-bar.js  new-version bar and service-worker registration
src/shell/version.js     the footer's "Updated …" line
src/shell/sw.js          the service worker; the build fills in its file list (tools/service-worker.mjs)
src/shell/README.md      where to change common things (R8)
public/media/cards/      card videos and stills
public/manifest.webmanifest, public/icons/   (icons drawn by tools/make_icons.mjs)
.github/ISSUE_TEMPLATE/problem.yml
```

### Tests

Unit (`tests/unit/shell/`, Node):

- Router: every route in the table, including unknown ones.
- Registry: ids are unique kebab-case and match the approved map; no PT-PT or Briefing Board (R19).
- Home cards: `cardBadge` gives "Coming soon" until a module is hooked in, then "PROTOTYPE" while its registry entry has `prototype: true` (D135), then nothing; only turn-sim, turn-fight, traffic and sof carry the flag.
- Host, with a fake module that starts frames, timers, listeners, shortcuts and a settings subscription: after unmount, all are gone and `scheduler.stats()` is zero (R4). A module whose `mount` throws leaves the host usable.

Browser (`tests/e2e/`, Playwright, every test fails on any console error, R7, and on any request to another site that has no stub in `fixtures.js` or the spec; the failure names the URL. Service workers are blocked unless a spec opts in with `test.use({ serviceWorkers: 'allow' })` (the offline tests do), because a worker's requests get past those stubs. `PW_PORT` picks the preview port so two checkouts can test at once):

- Smoke (R1): home, About, Settings and every route open in Chromium, Firefox and WebKit. CI runs Chromium on every PR; Firefox and WebKit run when the CI workflow is started by hand from the Actions tab, once at each module's sign-off (Patrick, 30 Sep).
- Accessibility (D142): axe checks for WCAG 2.0 A and AA on home, About, the Settings dialog and the Debrief Viewer (empty, and with the example flight); each module route is added as it is hooked into the registry. Known problems in another thread's files are excluded by selector with a `TODO(owner)` comment, never by turning a rule off.
- Overlap scan (R2): at 1280 × 800, 1366 × 768 and 1920 × 1080, no visible control overlaps another or is cut off, on every route. 1280 px is the smallest supported width (D183); narrower windows may scroll sideways. Below 1180 px the shell shows one quiet line under the header, "This tool is laid out for screens 1280 px or wider; some panels may overlap." (D225); it blocks nothing (full-height screens may scroll by that line) and is hidden at 1180 px and wider.
- Click-through (R3): every visible button and link on every route does something: the route changes, a dialog opens, or the page changes. External links are checked by address instead of being opened.
- Module switching (R4): after visiting every route and coming back home, no module frames, timers or listeners remain.
- Storage blocked: the app opens and says settings won't be saved.
- Offline (R6): after one visit, with the network off, a reload shows the home screen and About. A new build shows the new-version bar, and Reload switches to it and removes the old copy.
- Size (R5): the build fails if the home screen needs more than 3 MB, or card videos total more than 3 MB (R15).
- Screenshots (D142, `archive/tests/e2e/visual.spec.js`): Chromium only, on Linux, at 1440 x 900, to catch a change that moves or covers something by accident. Covers home, About, the Settings dialog, and the Debrief Viewer empty and with the example flight. The clock is frozen at noon Zulu, card videos stay still pictures (reduced motion), other sites are answered with an empty reply (satellite tiles with a plain square), fonts are pinned to Liberation Sans and Mono, and the footer's "Updated" line is masked. A picture may differ by up to 1% of its pixels (`playwright.config.js`). References are in `archive/tests/e2e/__screenshots__/visual.spec.js`; change them with `npx playwright test tests/e2e/visual.spec.js --update-snapshots=all` (plain `--update-snapshots` rewrites only pictures that fail, so a small change within the 1% would keep an old picture) only in a PR that means to change the look, and look at the new pictures before committing. A module adds its own screen to this file when it is hooked in.

### Sign-off checklist (R21)

`archive/docs/checklists/shell.md`: a short list anyone can run in a browser: open the link, open About, change the time order and reload, Report a problem opens the form, install it, reload it offline.

### Out of scope for step 1

Module content, saving a debrief to a file (step 2 with `flight-data`).


## From `archive/specs/SPEC-storage.md`

## Spec: storage

Module id `storage` in the approved map (`archive/SPEC.md`). Build step 1.

### Objective

One safe place for everything the app remembers in the browser. V6 used four families of storage keys and read them without guards, so a browser that blocks storage (private windows, locked-down machines) could stop the whole page. Here, nothing crashes when storage is blocked, and modules can't overwrite each other's data (R4).

### What it provides

`src/storage/store.js`

```js
const store = createStore(browserStorage); // a function returning the backend; optional
store.get('settings', fallback);  // parsed JSON, or fallback if missing, blocked or corrupt
store.set('settings', value);     // returns true if it was saved to the browser
store.raw('settings');             // the saved text as it is, or null if missing or blocked
store.remove('settings');
store.persistent;                 // false when the browser refuses storage
const turnSim = store.scope('turn-sim'); // same API, keys kept separate
```

- The backend is passed as a function (`browserStorage = () => globalThis.localStorage`) because in a browser that blocks storage, merely reading `localStorage` throws. The store calls it inside its own guard, so nothing outside `storage/` ever touches `localStorage`.
- Every key is stored as `ooda:v1:<scope>:<name>`. The shell's own data uses the scope `app`. Shared data has its own scope: `airfields` for the home field and alternates, `standards` for the formation standards (`src/storage/standards.js`, reached as `app.standards`).
- Every backend call is wrapped. If the backend is missing or throws (blocked, full, disabled), the store keeps working from memory for the rest of the visit and `persistent` becomes `false`, so the settings screen can say "settings won't be saved in this browser".
- Values are JSON. A value that fails to parse counts as missing and falls back.

`src/storage/settings.js`

```js
const settings = createSettings(store.scope('app'), DEFAULTS, { version: 1 });
settings.get();                    // a frozen copy: defaults overlaid with saved values
settings.update({ timePrimary: 'local' });
settings.reset();
const stop = settings.subscribe(next => { … }); // called after every change
```

- One settings document per scope, saved with its `version`. An older version is passed through `migrate(saved, fromVersion)` if given; otherwise it's dropped for defaults.
- Each saved field is checked against its default: a field whose type differs from the default, or that isn't in the defaults, is ignored. Allowed values can be listed per field (`{ timePrimary: ['zulu', 'local'] }`).

Step 1's shared settings: `timePrimary` (`'zulu'` or `'local'`, default `'zulu'`, D18) and `motion` (`'system'` follows the computer's reduced-motion setting, `'full'` plays card videos and animations, `'reduced'` shows stills only; default `'system'`, issue #41).

`file.js`: saving a file to the computer and opening one from it, for every module (the debrief file R17, Turn Sim and Traffic setups). It moves text only; the module that owns a format checks what's in it.

```js
import { downloadText, pickTextFiles, readTextFiles } from '../../storage/file.js';
downloadText(json, 'sortie.dadsdebrief.json', { type: 'application/json' }); // the browser's normal download
const files = await pickTextFiles({ accept: '.json', maxBytes }); // [{ name, size, text }], [] if cancelled
const dropped = await readTextFiles(event.dataTransfer.files, { maxBytes }); // same, for a drop or your own <input>
```

- The saved name is cleaned (`safeFileName`): no folders, no characters a file system refuses, at most 120 characters.
- A file over `maxBytes` is refused with a `FileTooBigError` ("big.kml is too big to open (12.3 MB; the limit is 10.0 MB).") before any file is read.
- `pickTextFiles` must be called from a click, since browsers only open the picker in answer to one.

### Boundaries

- No page access except the storage backend passed in, so it's unit-tested in Node with a fake backend.
- No other code touches `localStorage` directly. Modules get `app.storage`, already scoped to their id.
- Never throws to its caller because of the browser's storage.

### Tests (`tests/unit/storage/`)

- Round trip of values; `get` fallback for missing, corrupt and blocked keys; `raw` gives corrupt text back as it is and null for a missing key.
- A backend that throws on every call: nothing throws, values are kept for the visit, `persistent` is `false`.
- A backend that fills up (`QuotaExceededError`) on `set`: returns `false`, value kept in memory.
- Scopes don't see each other's keys, and nothing is written outside the `ooda:v1:` prefix.
- Settings: defaults, update, reset, subscribe/unsubscribe, wrong types ignored, values outside the allowed list ignored, unknown fields dropped, version migration.

### Success criteria

- All tests above pass under `npm test`.
- In the browser, blocking storage (Playwright: a context where `localStorage` throws) still opens the app with no errors (R7), and the settings screen says settings won't be saved.


## From `archive/specs/SPEC-ui-kit.md`

## Spec: ui-kit

Module id `ui-kit` in the approved map (`archive/SPEC.md`). Build step 1, extended as modules need it.

### Objective

One shared look and one set of building blocks, so modules stop fighting over the page. V6 had six layers of CSS patches with 348 `!important`, side rails that covered controls (#34), a Tab key that hid panels (#35), and animation loops that kept running for hidden modules (#39). Here there's one stylesheet of tokens, panels that never cover controls, normal keyboard behaviour, and one scheduler that only runs the open module's work (R2, R4).

### What step 1 provides

`src/ui-kit/tokens.css`: colours, spacing, type and radii as CSS custom properties, taken from V6's palette (dark navy background, cyan accent). No module defines its own colours for shared things.

`src/ui-kit/base.css`: page reset, typography, buttons, links, focus outlines, form controls, the `[hidden]` rule, and a `prefers-reduced-motion` rule. Transitions and animations take their length from the `--motion-duration` token, which is 0 when the computer asks for reduced motion or the Settings choice is "Show still pictures only" (`data-motion` on `<html>`). No `!important` anywhere in `src/` (checked by a test).

`src/ui-kit/dom.js`: `h(tag, props, ...children)` builds elements. Text always goes in as text, never as HTML, so a track name or DFP label can't break the page (#25).

`src/ui-kit/scheduler.js`

```js
const scheduler = createScheduler();       // browser rAF and timers by default
const scope = scheduler.scope('turn-sim');
scope.frame((dtMs, nowMs) => { … });       // runs every animation frame
scope.every(1000, () => { … });            // repeating timer
scope.after(500, () => { … });             // one-off timer
scope.dispose();                           // cancels everything the scope started
scheduler.stats();                         // { frames, timers } still active
```

- One `requestAnimationFrame` loop for the whole app, running only while at least one frame callback exists.
- Every frame callback and timer belongs to a scope. The shell gives each module its own scope and disposes it when the module closes, so nothing a module started can outlive it (R4).
- A callback that throws is reported once to the console and removed, so one bad callback can't stop the others.
- `createScheduler({ raf, caf, setTimeout, clearTimeout, onError })` accepts fakes, so it's unit-tested in Node. Frame times come from `requestAnimationFrame` itself.
- No `setInterval` or `requestAnimationFrame` anywhere else in `src/` (checked by a test).

`src/ui-kit/panel.js`: `createPanel({ title, collapsed, onToggle })` makes a collapsible section whose header is a real `<button>` with `aria-expanded`. Collapsing a panel never hides another panel's controls, and there are no side rails or Tab-key tricks.

### Added for the debrief (step 3)

The debrief is the first module to use these two (SPEC-debrief, PR #62); Turn Sim, Turn Fight and Traffic use them next.

`src/ui-kit/controls.js` binds inputs to settings, so math never reads input boxes (V6's "the page is the data").

```js
const controls = createControls(settings);   // any { get, update, subscribe }, such as storage/settings.js
panel.body.append(
  controls.number('bubbleFt', { label: 'Safety bubble', unit: 'ft', min: 100, max: 5000, step: 50 }),
  controls.slider('vncOpacity', { label: 'Chart opacity', min: 0, max: 1, step: 0.05, format: (v) => `${Math.round(v * 100)}%` }),
  controls.checkbox('showGrid', { label: '5,000 ft grid' }),
  controls.select('trail', { label: 'Trail', options: [['full', 'Full'], ['history', 'History'], ['last60', 'Last 60 s']] }),
  controls.choice('view', { label: 'View', options: [['2d', '2D'], ['3d', '3D']] }),
);
return () => controls.dispose();                // in the module's cleanup
```

- Each call returns one element: a real `<label>` tied to its input, so clicking the words and screen readers both work.
- A control writes its setting as soon as the value is good, and follows the setting when something else changes it (a loaded debrief file, Reset).
- **Number rule:** a number box accepts only a finite number from `min` to `max`. Anything else (blank, `Infinity`, a huge value) is refused with a message beside the box ("Enter a number from 100 to 5,000 ft"), the box is marked invalid, and the setting keeps its last good value. V6's angle loops never return for `Infinity`, so a huge Turn Sim start heading could freeze the page (from the flight math workstream, PR #51).
- `select` and `choice` give back the option's own value, so a number option stays a number.
- `setDisabled(key, true)` greys out every control bound to that setting (for example 3D-only options while in 2D), and `false` turns them back on. The setting keeps its value. The whole control (label, box, unit and any message) is also marked `aria-disabled="true"`, so the dimmed text counts as inactive and passes the contrast check (WCAG 1.4.3 exempts inactive parts); modules need no axe exclusion for it.
- `guard(button, keys?)` holds back an action button while a number box for any of `keys` (every number box when left out) refuses what was typed, so an action such as Traffic's + Spawn never runs on a last good value the person can no longer see (verification TR-14, D256). While blocked the button has `aria-disabled="true"` (dimmed like a disabled button, still focusable) and its click is stopped before the module's own handler; the boxes are read again at the click, so it works even when the box hasn't sent `change` yet. The button's own `disabled` stays the module's. It returns a function that stops guarding; `dispose()` stops them all. `invalid()` lists the keys of number boxes now refusing input.
- In the refusal message a degree unit sits on the number ("0 to 90°"); other units take a space ("5 to 60 s") (TF3-9).
- `dispose()` removes the one settings subscription the controls share.

`src/ui-kit/canvas-view.js` is pan and zoom for the 2D views, drawn only when something changes.

```js
const view = createCanvasView(canvas, {
  timers: app.scheduler,                 // draws in the next animation frame, only when asked
  draw(ctx, view) { … },                 // ctx is in CSS pixels, already scaled for sharp screens
  minSpan: 500, maxSpan: 50 * 6076,      // the visible width, in world units (here feet)
  label: 'Debrief map',                  // for screen readers
  onUserMove() { followLead = false; },  // the person dragged, zoomed or used the keys
});
view.fit({ minX, minY, maxX, maxY });    // show the whole flight
view.setCenter(x, y);                    // follow a ship
view.worldToScreen(x, y);                // → [sx, sy]
view.screenToWorld(sx, sy);              // → [x, y]
view.view;                               // → { cx, cy, scale }: centre, and CSS px per world unit
view.visibleBounds();                    // → { minX, minY, maxX, maxY } on screen, for tiles and culling
view.size;                               // → { width, height } in CSS px
view.requestDraw();                      // after the data or a layer changed
view.dispose();                          // in the module's cleanup
```

The 3D view and the EM chart need the same sharp, draw-on-request canvas without pan and zoom:

```js
const chart = createCanvasSurface(canvas, { timers: app.scheduler, draw(ctx, chart) { … }, label: 'EM chart' });
chart.size;          // → { width, height } in CSS px
chart.requestDraw();
chart.dispose();
```

- World units are the module's choice (the debrief uses feet), with x to the east and y to the north; the screen's y points down.
- Drag with the mouse to pan and use the wheel to zoom about the pointer. With the view focused, the arrow keys pan and + and − zoom (#35: normal keyboard behaviour).
- **Keys and module shortcuts:** a key the view handles is marked as handled, and `app.keys` shortcuts skip handled keys, so the two never both act. A module that wants the arrows for itself (the debrief steps playback with ← and →) passes `arrowKeys: false`; the view then leaves the arrows alone and + and − still zoom.
- The visible width stays between `minSpan` and `maxSpan`, for fit too.
- Drawing happens in one scheduler frame after `requestDraw`, pan, zoom or a resize, and several requests in one frame draw once. A still view uses no frames (#43).
- The canvas follows its box size (a `ResizeObserver`) and the screen's pixel ratio, and redraws only when the size really changed.
- The transform maths (`toScreen`, `toWorld`, `zoomAbout`, `fitBounds`) is exported as pure functions and unit-tested.

### Map layers: satellite tiles and VNC charts (from the debrief)

The debrief built these two layers and kept them free of debrief state so they could be shared. Modules never import each other (`archive/SPEC.md`), so they move into ui-kit. The tile loader has moved already, ahead of the Traffic Sim's satellite task (Traffic task 8). The VNC layer moves at the SOF's base map (SOF task 6). Each move changes where the code lives and nothing it does: every number stays as the debrief has it, and `archive/tests/golden/debrief-vnc.test.js` still pins the VNC warp to V6.

`src/ui-kit/map-tiles.js` (moved from the debrief) draws web map tiles under a flat map in local feet.

```js
import { ESRI_IMAGERY, createTileLayer } from '../../ui-kit/map-tiles.js';
const imagery = createTileLayer({ source: ESRI_IMAGERY, timers: app.scheduler, onChange: () => view.requestDraw() });
imagery.draw(ctx, { corners, pxPerFt, toScreen });  // corners: { north, south, west, east }; toScreen(lat, lon) → [x, y]
imagery.state();                                    // → { wanted, ready, failed } from the last draw
imagery.dispose();                                  // in the module's cleanup
```

- `ESRI_IMAGERY` is Esri World Imagery at `services.arcgisonline.com`, with the address built from the tile numbers only (no user-entered URL), and its credit line in `ESRI_IMAGERY.credit`. The module draws that credit on the map whenever the layer shows. A page Content Security Policy must allow `services.arcgisonline.com` for images.
- The tile zoom follows the map's scale (core `pickTileZoom`, V6's rule). A view that would need more than 64 tiles draws none, so a wrong zoom can't freeze the page (#49).
- At most 300 tiles are kept, and the least recently drawn go first.
- A failed tile is tried twice more, after 2 s and 6 s, through the scheduler scope, so the retries stop when the module closes. The last try goes without CORS. A tile that still fails is counted in `state().failed`, so the module can say "satellite imagery needs a connection" and show its grid (R6).
- Each tile that arrives calls `onChange` once. The canvas view already draws at most once a frame, however many tiles land (#43).
- A source may set `maxZoom` (its finest zoom level; NASA GIBS GOES stops at 7 for GeoColor and 6 for infrared). Closer in than that, the layer keeps asking for that zoom and stretches each tile to its bounds. Esri has no `maxZoom`, so it follows the map's scale as before.
- `tilesFor(corners, pxPerFt, maxZoom)` is the pure part (which tiles, at which zoom) and is unit-tested. `makeImage` is there for tests.

`src/ui-kit/vnc.js` (today still `src/modules/debrief/map2d/vnc.js`, until SOF task 6) holds the two embedded VNC charts, South (Moose Jaw and Regina) and North (Saskatoon and Moose Jaw), with V6's bounds, its 3 × 3 correction mesh and its alignment controls.

```js
import { VNC_CHOICES, VNC_DEFAULT_ALIGN, VNC_ALIGN_LIMITS, chartsBounds, createVncLayer } from '../../ui-kit/vnc.js';
const charts = createVncLayer({ base: document.baseURI, onChange: () => view.requestDraw() });
charts.draw(ctx, { keys: VNC_CHOICES.both, map: view, ref, align, opacityPct: 70 });
charts.state();                                     // → { wanted, ready, failed }
view.fit(chartsBounds(VNC_CHOICES.both, ref, align));
charts.dispose();
```

- Each chart image is fetched the first time it is shown, never at start-up (R5). After that the service worker keeps it for offline use (R6), as it does today.
- Each chart is warped once per origin and alignment into an off-screen image (V6's mesh of affine triangles, 18 × 18 cells), so every frame draws it with one `drawImage` (#43).
- The alignment is `{ nudgeEastNm, nudgeNorthNm, scalePct }`, limited by `VNC_ALIGN_LIMITS` (±20 NM, 97 % to 103 %). Where a module keeps it is the module's choice.
- The pure parts (`vncBaseLatLon`, `vncWarpLatLon`, `vncWarpGrid`, `triangleTransform`, `chartsBounds`) run in Node and stay pinned by the golden test.
- A module that shows the charts says "Not for navigation" beside them, as the debrief's chart line does. Credits beyond that (the SOF's "VNC © NAV CANADA") are the module's own.

**The tile loader move is done.** It was one pull request by the app frame, agreed with the debrief thread: `tiles.js` and its test went to `src/ui-kit/map-tiles.js` and `tests/unit/ui-kit/map-tiles.test.js` with `git mv`, and the debrief's imports (`layout.js`, `map2d/view.js`) point at the new file.

**The VNC layer moves in its own pull request when the SOF reaches task 6, agreed with the debrief thread:**

- It moves `vnc.js` to `src/ui-kit/vnc.js`, with `git mv` so the history follows. The debrief's imports point at the new file.
- It moves the chart images from `public/media/debrief/` to `public/media/charts/`, changes `VNC_FILES` to match, and changes the service worker's skip rule (`tools/service-worker.mjs`) from `media/debrief/` to `media/charts/`.
- It moves `tests/unit/debrief/vnc.test.js` to `tests/unit/ui-kit/vnc.test.js`. The golden test keeps its name and changes only its import (a one-line change in core's folder, agreed with the flight math core thread).
- It updates the debrief's README and SPEC-debrief's file tree, the ui-kit README, and `archive/SPEC.md`'s structure.
- It is done when `npm test` and the debrief's browser tests pass unchanged, including "VNC charts: off at first, fetched only when chosen".
- It lands with the SOF's task 6, which needs the VNC layer.

### 3D aircraft (three.js, D138)

three.js draws every 3D aircraft view: the Debrief's 3D view (its `view3d` moves onto this next), Turn Fight's 3D view, and any later Turn Sim or Traffic 3D view. The shared pieces live in `src/ui-kit/three-aircraft.js` so each view draws the same aircraft with the same camera.

```js
import { createCt156Model, disposeCt156Model, CT156_UNIT_LENGTH, PAINT_DEFAULT, PAINT_OPTIONS } from '../../ui-kit/ct156-model.js';
import { loadThree, createAircraftMesh, disposeAircraftMesh, createStandInMesh, matchProjection, worldToScreen, altToZ, addLights, addSky } from '../../ui-kit/three-aircraft.js';

const THREE = await loadThree();                       // dynamic import('three'), cached; call when the 3D view opens
addLights(THREE, scene);                               // { hemisphere, sun }
const sky = addSky(THREE, scene);                     // gradient background and horizon fog (any view can use it)
const plane = createCt156Model(THREE, { color: SHIP_COLORS[slot], number: slot, paint: settings.get().paint, lengthFt: planeSizeFt * CT156_UNIT_LENGTH });
// (createAircraftMesh(THREE, { color, outline }) is the plain, canvas-free model; see "Paint" below)
plane.position.set(s.x, s.y, altToZ(s.altFt, cam.altScale));   // the model is not scaled by altScale
const other = createStandInMesh(THREE, { color, outline, kind: 'generic' });   // Traffic's non-T-6 types: same frame and size, clearly not a T-6
plane.rotation.order = 'ZYX';
plane.rotation.set(-bankRad, -pitchRad, hdgRad);       // heading about Z (0 = east), then pitch, then bank
matchProjection(THREE, camera, ctr, cam, { width, height });    // camera: THREE.OrthographicCamera
const p = worldToScreen(THREE, camera, { x, y, z: altToZ(altFt, cam.altScale) }, width, height); // for 2D labels
disposeAircraftMesh(plane); sky.dispose();             // when the view closes (sky.dispose frees the texture, clears background and fog)
```

- **Parity rule (the flight-math guard).** `matchProjection(THREE, camera, ctr, cam, size, pxRatio = 1)` takes the same inputs as `scene.js projectPoint(p, ctr, cam, size, pxRatio)`: the centre `ctr` `{ x, y, z }` (feet), the view `cam` `{ yawDeg, pitchDeg, zoom, altScale }`, and the canvas `size`. A world point `{ x, y, z: altToZ(altFt, altScale) }` then lands on the same CSS-pixel position the projection gives, within 1e-6 px, and nearer to the viewer agrees with a smaller `depth`. The camera is orthographic, so nothing about the flight geometry changes; only who draws it. `scene.js` stays the reference, and `tests/unit/ui-kit/three-aircraft.test.js` pins the match over many views, centres, canvas sizes and points. Any new 3D view uses `matchProjection` and does not build its own camera maths.
- **Dynamic import only.** Nothing may import `three` (or `three/addons/...`) statically: `tests/unit/source-rules.test.js` scans all of `src/` for it. A 3D view awaits `loadThree()` when it opens, so the home screen and modules that draw no 3D never download it. If the load fails (offline, first visit), the view shows a message and the 2D view keeps working.
- **Depth range.** The camera sits `CAMERA_DISTANCE_FT` (1,000,000 ft) from its target with near and far planes 900,000 ft either side, so nothing the Debrief allows is clipped: altitude scale up to 10, pitch 0 to 90, ground 70,000 ft out, a formation at 31,000 ft over sea-level ground. The tests check every point stays inside the planes and that the depth agrees with `projectPoint`'s `depth`.
- **Fog is for the ground only.** The sky's fog fades a big ground plane toward the horizon; aircraft materials (and their outline and prop disc) set `fog: false` so an aircraft never fades. Any ground, grid or trail a view adds decides its own fog.
- **Paint (Harvard scheme).** The T-6 is drawn as a CT-156 Harvard II from Moose Jaw by `createCt156Model(THREE, { color, number, paint = 'harvard', lengthFt })` in `src/ui-kit/ct156-model.js` (nose +X, left +Y, up +Z; `lengthFt` is the nose-to-tail length, and `CT156_UNIT_LENGTH` (1.44) is the length in model units, the same as the plain mesh, so a view can swap paints without moving anything). It is drawn in code only (procedural materials and small canvas decals; no image files, no models). `paint: 'harvard'` (the default) is the navy scheme with the cheat line, chrome spinner, red-tipped prop, roundels, Canada wordmark, red triangles and the tail leaf, NATO star, flag and serial, with the **whole fin in the ship colour** and the **ship number on both faces of the fin, on the nose, and under the right wing**; `'ship'` is the plain all-ship-colour look. Modules offer the choice as "Paint: Harvard / Ship colours" in their settings menu from `PAINT_OPTIONS`, Harvard the default (`PAINT_DEFAULT`); any other value draws Harvard. Geometry, textures and materials shared by all ships are built once per THREE module and reference-counted: `disposeCt156Model(group)` frees the ship's own materials and textures, and the shared part only when the last CT-156 in the view is gone (`disposeAircraftMesh` hands a CT-156 to it). After the last one goes, `renderer.info.memory` is back where it was, apart from what three.js itself keeps once it has drawn such materials: a lookup table (1 texture, kept after the first shiny material of any kind, never freed) and its reflection-map converter (1 texture plus planes, 9 geometries for the model's 256-wide map, another count if a module converts a map of another size; rebuilt, not added to, for a new size). A module's leak check takes its baseline after one Harvard has been drawn and disposed, and checks that later rounds come back to it; it never hard-codes those counts and never disposes three.js's own objects. Decals are drawn on 2D canvases, so it needs a browser `document`; every material is `fog: false`. Never commit reference photos of the aircraft.
- **Cockpit eye, bow and nose (ALL-31).** The eyes (`EYES_FT` in `src/ui-kit/ct156-cockpit.js`), the helmets and seats (`CT156_SEAT_X`, `CT156_HELMET_Z`, front then rear), the forward bow, the canopy's top and the nose's top line (`ct156-model.js`) follow the T-6A-1 side drawing: front eye 13.2 ft behind the spinner tip and 1.9 ft up, rear eye 18.6 ft and 2.2 ft, bow crest 11.3 ft and 2.75 ft, canopy peak 3.45 ft over the centre arch, nose top line 0.85 to 1.45 ft. The front cockpit (seat, panel, coaming, rail) sits with the front eye, the rail's top 6° below it, so level at 220 KIAS the horizon is about a quarter of the way up the windscreen, as the SMM's 220 KIAS picture shows (no test: Patrick, 11 Oct 2026).
- **`createAircraftMesh` stays the plain model.** It does not delegate to the CT-156: it is the small, canvas-free T-6 (ship colours, optional outline) that runs in Node tests and anywhere without a `document`, and its geometry is pinned by its tests. A view that shows T-6s uses `createCt156Model` (with `paint: 'ship'` for the plain look); the Harvard model is what the Debrief, Turn Fight, Turn Sim and Traffic show by default.
- **Plain paint (`createAircraftMesh`, `createStandInMesh`).** The aircraft is the T-6-like model in ship colours only: fuselage in the ship colour, wings and stabiliser a shade darker, fin a shade lighter, dark spinner, translucent canopy and prop disc. Traffic's other types are plain stand-ins with no scheme. `outline` is optional edge lines on wings, stabiliser and fin.
- **Stand-ins for other types (D141).** `createStandInMesh(THREE, { color, outline, kind })` is for Traffic's Grob, Tutor, Astra, CT-156 and the like: `kind: 'generic'` (default, and any unknown kind) is a slim fuselage, straight wing and T-tail; `'dart'` is a low-poly delta wing with one fin. Same frame and size scale as the T-6, no prop disc, `fog: false`, freed by `disposeAircraftMesh`. Several aircraft at once are just several meshes, one per ship.
- **Model frame.** Nose +X, left +Y, up +Z; about 1.44 long (tail to spinner) and 1.32 across the wings, so `scale` is set to the plane size in feet. It is the Debrief spike's model, not V6's `t6Points`.
- No timers and no animation frames: the view draws when the scheduler's frame callback asks it to.

### Airspace and airfields in 3D (SOF-63, DB-24; wording not yet confirmed with Patrick)

- `airspace3d.js` `buildAirspace(T, { volumes, routes, toXY, scale, groundFt })`: each checked airspace (src/airfields/airspace/model.js `checkedAirspace`) as a faint see-through prism from floor to ceiling, edged by kind (`KIND_COLOURS`), and training routes as curtains; routes at 500 ft AGL dashed. Returns `{ root, labels, picks, lines, summary, dispose }`.
- `airfield3d.js` `buildAirports(T, { toXY, scale, groundFt, doc, airports, halfFt, liftFt, aboveGround })`: each airfield's runways at true place, length and width, painted as the Traffic sim paints 29L (TR-98: its grey, white paint with a 0.5 ft black outline, threshold bar, piano keys, 98 ft centreline dashes, edge stripes, aiming point; sizes across scale with the width, an estimate), the numbers reading from the approach end, a few schematic buildings. `fit(ftPerPx)` keeps a far field a few pixels long. The SOF keeps runways above its ground (`aboveGround`, 40 ft lift); the Debrief draws them at their own elevation, 3 ft up.
- Both build at the height scale given; the Debrief builds at 1 and stretches the group by its altitude scale, so its overview and its true-scale cockpit share one build.
- **Data failure:** both draw only what they are given; the caller says when data is loading, missing or failed (src/airfields/airspace/load.js words).

### 2D/3D switch (D141)

Every simulator has a 2D | 3D switch: the Debrief, Turn Fight, Turn Sim and Traffic. The SOF dashboard stays 2D and has none.

```js
import { VIEW_DEFAULT, VIEW_ALLOWED } from '../../ui-kit/controls.js';
const settings = createSettings(scope, { view: VIEW_DEFAULT /* '2d' */, /* … */ }, { allowed: { view: VIEW_ALLOWED } });
panel.body.append(controls.viewSwitch());          // a "View" choice, 2D then 3D, bound to the 'view' setting
controls.viewSwitch('mode')                        // or to another setting key
```

- `controls.viewSwitch(key = 'view')` is exactly `controls.choice(key, { label: 'View', options: 2D, 3D })`; `VIEW_DEFAULT` is `'2d'` and `VIEW_ALLOWED` is `['2d', '3d']`, so every module seeds and validates the setting the same way.
- **2D is the default.** three loads only when 3D is switched on: the module awaits `loadThree()` then, never at start-up.
- If `loadThree()` fails (offline on the first visit), the module shows "3D needs a connection the first time." beside the switch, puts the setting back to `2d`, and the 2D view keeps working. A later try loads it (a failed load is not cached).
- `webglSupported()` (from `three-aircraft.js`) says whether this browser can draw WebGL2, which three needs, checked once per page on a spare canvas. A 3D view should check it before building a renderer and, when it is false, stay in 2D with its "3D needs WebGL" message, so three never logs "Error creating WebGL context". Each module wires it in its own view (a follow-up for the module owners); until then their existing try/catch around the renderer still falls back to 2D.
- The 3D view uses `matchProjection` for its camera (no camera maths of its own) and `createAircraftMesh` or `createStandInMesh` for its aircraft; no flight math changes.

### Not overwhelming (R22)

Each screen shows only the essentials by default. Every setting the module has goes in its one settings menu (`createSettingsMenu`), closed by default. Extra detail goes behind a switch the person turns on: a `controls.checkbox` for a layer or graph (off by default), or a `createPanel({ collapsed: true })` section titled "More …" for extra readouts. A module's spec lists what shows by default and what sits behind a switch, and its sign-off checklist opens it fresh and checks nothing optional is on.

### Settings menu (R22)

Every module screen keeps its own tuning numbers behind one settings menu that starts closed, so the screen shows only the essentials. It looks and works the same in every module. `src/ui-kit/settings-menu.js`, built on `createPanel`.

The header's **Settings** button stays the app-wide dialog (home airfield, time zone, motion, formation standards); a module adds a section there only for a choice that applies across the app. The module's own numbers (turn G, spacing, speeds, what the sim does) go in its settings menu, titled with the module's name so the two never read the same.

```js
const menu = createSettingsMenu({ title: 'Turn Sim settings', onReset: () => standards.reset(), onToggle });
const turn = menu.section('Turn');           // a titled group; returns an element to append controls to
turn.append(controls.number('g', { label: 'Turn G', unit: 'G', min: 1, max: 6, step: 0.5 }));
layout.append(menu.element);                 // put this in the module's layout
menu.collapsed;                              // true until opened
menu.setCollapsed(false);                    // open it from code
menu.body;                                   // the container the sections live in
```

- It starts closed (`collapsed: true`) unless the caller passes `collapsed: false`. Pass the module's name as the title ("Turn Sim settings", "SOF settings"); it defaults to "Module settings". Never title it plain "Settings", which is the header's app-wide button.
- `onToggle(collapsed)` is called with the new state when the person opens or closes it. `setCollapsed()` from code does not call it, so a module that remembers the menu's state saves it in `onToggle` and restores it with `setCollapsed`.
- The header is the panel's real button with `aria-expanded`, so the mouse, Enter, Space and Tab all work (#35).
- Escape inside the open menu closes it, calls `onToggle(true)` and puts focus back on the header, as a dialog would. When it is closed, Escape does nothing.
- `section(title)` returns a `<fieldset class="settings-group">` with a `<legend>` holding the title as text, never HTML. Sections appear in the order they are made.
- With `onReset`, the menu has a "Reset to defaults" button (`resetLabel` changes the words) that calls it straight away, with no confirm dialog. Without `onReset`, there is no button.
- Opening or closing it never covers other controls: it expands in the page flow like other panels (R2, #34).
- Styles are in `base.css`, using tokens only.

### Boundaries

- `ui-kit` depends only on `core`. It never imports a module.
- Module stylesheets are scoped under the module's root element (`[data-module="turn-sim"] …`), so one module's CSS can't restyle another.

### Tests

- `tests/unit/ui-kit/scheduler.test.js`: one rAF loop shared by all scopes; the loop stops when the last frame callback is cancelled; `dispose` cancels frames and timers; a throwing callback is removed and the rest keep running; `stats()` returns to zero.
- `tests/unit/ui-kit/dom.test.js`: text children are inserted as text (a string with `<b>` shows the characters, not bold). Uses a minimal fake document.
- `tests/unit/source-rules.test.js`: no `!important`, `setInterval` or bare `requestAnimationFrame` outside `ui-kit/scheduler.js`, and no `localStorage` outside `storage/`.
- `tests/unit/ui-kit/canvas-view.test.js`: the transform maths: round trips, zoom keeps the point under the pointer still, the span limits, fit, and the visible bounds.
- `tests/unit/ui-kit/map-tiles.test.js` (moved from the debrief) and `vnc.test.js` (moves at SOF task 6): which tiles a view needs and the 64-tile limit, retries and giving up, the least-recently-drawn cache, nothing loaded after `dispose`; the VNC warp and bounds, and each chart fetched only when first shown.
- `tests/unit/ui-kit/settings-menu.test.js`: closed by default and opens with `collapsed: false`; a section title is inserted as text; sections keep their order; the Reset button exists only with `onReset`, calls it on click, and takes a custom label.
- `tests/unit/ui-kit/three-aircraft.test.js`: the three.js camera projects points to the same screen position as `scene.js projectPoint` (many views, canvas sizes and points, 1e-6 px); the aircraft mesh's axes, size, colours and outline; the CT-156 model (`ct156-model.test.js`, with a stub canvas document): both paints, frame and length, whole fin in the ship colour, number drawn, `fog: false`, and reference-counted dispose that frees every geometry, material and texture the models drew with; the depth range; the aircraft's attitude (`rotation.set(-bank, -pitch, hdg)`, order 'ZYX') pointing the nose and left wing where `scene.js t6Points` does; `loadThree` returns one cached module (the no-static-import rule is in `source-rules.test.js`). three runs in Node without WebGL.
- `tests/unit/ui-kit/controls.test.js`: `viewSwitch` is a "View" choice with 2D then 3D, follows the setting, writes it, and binds another key; `VIEW_DEFAULT` and `VIEW_ALLOWED`. Stand-in aircraft (axes, size, colour, fog, dispose) are in `three-aircraft.test.js`.
- Browser (with the shell): panels open and close with the mouse and the keyboard, and Tab moves between controls.
- Browser (`tests/e2e/ui-kit.spec.js`, on a test page that loads the modules): each control updates its setting, follows outside changes, and refuses bad numbers with a message; the canvas view pans, zooms and uses the keys, draws only when asked, leaves the arrows to the page with `arrowKeys: false`, and stops listening after `dispose`; `setDisabled` greys out a control, marks it `aria-disabled` and turned-off controls pass axe; a guarded action waits while its number box refuses input; Harvard models drawn and disposed on a real WebGL renderer, three rounds after a warm-up round, leave `renderer.info.memory` at its baseline (`pages/ct156.html`); the Settings menu starts closed, opens from the keyboard, holds a working number control, calls Reset and closes again; the canvas surface redraws only on request or resize.

### Success criteria

- The tests above pass, and the shell's browser tests (overlap scan and module switching) pass using these pieces.


## From `archive/specs/SPEC-wx.md`

## Spec: `wx`, weather parsing and limit checks

Status: **approved by Patrick on 2026-09-30**; the Q30 alternate rules (D60) approved 2026-09-30. Module id `wx` in [`archive/SPEC.md`](../../../archive/SPEC.md). Requirements: R13 (SOF), R16 (home airfield and alternates are a setting), R7 (no browser errors), R9 (numbers match V6 unless a logged decision says otherwise).

### Objective

One tested place that turns raw METAR and TAF text into plain data, and answers the SOF's questions about it: what is forecast at a time, is it below the home or alternate limits during a wave, and what colour state or flight category is it. It replaces the eight or so copies of METAR/TAF parsing in V6's SOF page, which disagree with each other and carry the safety bugs in audit issues #1 to #5.

The users are the SOF (weather cards, 24-hour timeline, alternate calls) and, later, anything else that shows weather. `wx` has no screen of its own.

Done means: every case in the report table below passes, including one per audit bug, and the SOF can be built on these functions without parsing text itself.

### Scope

In:

- `metar.js`: parse a METAR or SPECI.
- `taf.js`: parse a TAF into dated change groups, and build its timeline (prevailing conditions plus TEMPO, PROB and BECMG overlays).
- `conditions.js`: the shared parts (wind, visibility, weather, cloud), merging a change group into what it changes, and display formatting.
- `limits.js`: limit checks, the V6 default limits, NATO colour state and flight category.
- `alternates.js`: the home-weather alternate trigger over a wave window, and the alternate airfield check over an arrival window.
- `sources.js`: fetching METARs and TAFs from MET Norway, with Datamask as the backup, refreshing them, and saying when a report is stale. See "Sources".

Out, for now:

- Lightning (D34), radar and anything that touches the page.
- Deciding what a limit should be. `wx` takes limits as input; the SOF gets them from settings.

### Assumptions

1. Reports are in North American format as the SOF shows them today: visibility in statute miles (`15SM`, `1 1/2SM`, `M1/4SM`, `P6SM`), with metric visibility (`9999`, `0800`) and `CAVOK` also understood.
2. A raw report string is the input. JSON from a feed is the adapter's job; the adapter passes the raw text through.
3. A report only carries day-of-month. Every parse takes a reference time (`now`) and resolves days to the nearest matching month, so reports around month ends work.
4. `wx` does not import `src/core/`. The one conversion it needs (metres to statute miles, 1609.344, exact by definition) is a local constant, because `core/units.js` holds only the flight-math constants V6 uses and has no statute mile.
5. `node --test` only, no packages.

### Behaviour

#### Parsing rules

- **Word positions (for the SOF banner).** Parsing keeps where each word sits in the raw text, as `{ start, end }` character offsets into the report's `raw` (the text as given, trimmed; end exclusive; a trailing `=` is not part of the last word). Each TAF group has a `span` covering its whole text, header words included. The wind, the visibility (both words of `1 1/2SM`, or the `CAVOK` word), each cloud layer and each weather item carry the `span` of their own words. `checkConditions` returns `reasonSpans`, where `reasonSpans[k]` lists the spans behind `reasons[k]` (filter the two together, by index, never `reasons` alone). A span can be `null` or an empty list where there is nothing to mark. Every hit, at-limit piece and caution from the home trigger and the alternate check carries its group's `span` and its `reasonSpans`. An inherited value points at the group that stated it. All of this is additive and changes no result.
- Everything after `RMK` is ignored for conditions and kept as `remarks`. One remark is read: `LAST OBS/NXT 011000Z` (or `LAST STFD OBS/NXT`, with or without the day) sets `lastObservation: true` and `nextObservation` to the next report time after the observation, else `false` and `null`.
- Tokens are read one at a time, so a TAF period like `2916/2920` can never be read as visibility (issue #1).
- Visibility: `M` means "less than" and `P` means "more than". The value keeps its number and a qualifier: `M1/4SM` is `{ sm: 0.25, qualifier: 'less' }` (issue #3, V6 read it as 4 SM). A whole number joins a following fraction only when it is one or two digits (`1 1/2SM`). A fraction of a mile is always below one, so `11/2SM` is read as `1 1/2SM` with the space dropped (V6 read 5.5). Metric visibility is converted to SM; `9999` means 10 km or more. `CAVOK` means 10 km or more, no cloud that matters, no weather. `CAVOK` in the same group as a stated visibility below 10 km / 6 SM, cloud or weather contradicts it: the stated values are kept, never the better CAVOK ones, and `CAVOK` is listed as unread (WX-3).
- Cloud: `FEW`, `SCT`, `BKN`, `OVC`, `VV` with a base in hundreds of feet, and an optional `CB` or `TCU` kept on the layer (issue #3: `BKN015CB` is a 1500 ft ceiling, V6 saw no ceiling). `///` base means unknown. `SKC`, `CLR`, `NSC`, `NCD` and `CAVOK` mean an explicit clear sky, which a change group uses to clear the cloud it inherited.
- Ceiling: the lowest `BKN`, `OVC` or `VV` layer. `null` means no ceiling. The ceiling is **unknown** when such a layer has a `///` base, or when there is no cloud group at all and no `SKC`/`CLR`/`NSC`/`NCD`/`CAVOK`.
- Times: a report's observation or issue time is the latest matching date no more than an hour after `now`, since reports are never written in the future. Group times resolve to the date nearest the valid period, so a group starting just before it stays in its own month. Impossible values (day 32, hour 25) give no time.
- A repeated TAF header, as some feeds send it (`TAF AMD TAF AMD CYMJ ... CNL`), is read once, so a cancelled TAF reads as cancelled, not unreadable.
- A METAR trend (`TEMPO`, `BECMG`, `NOSIG` at the end of an ICAO METAR) is kept apart as `trend`, not read as observed.
- Weather: intensity (`-`, `+`, or `VC` for vicinity), descriptor (`MI BC PR DR BL SH TS FZ`) and phenomena (`RA SN FG ...`). `NSW` in a change group clears inherited weather.

#### TAF groups and timeline

- Groups: the base forecast, `FMddhhmm`, `BECMG dd hh/dd hh`, `TEMPO`, `PROB30`/`PROB40` (alone or followed by `TEMPO`, keeping the probability; V6 lost it). Hour 24 means midnight at the end of that day.
- `FM` starts a complete new forecast.
- `BECMG`, `TEMPO` and `PROB` change only what they state; everything else carries over from what is prevailing.
- Prevailing conditions: the base forecast until the first `FM` or `BECMG`; after an `FM`, that group; after a `BECMG`, the merged new conditions from the **end** of its change period until the next `FM` (issue #2: V6 dropped them once the change period ended). During the change period the old conditions stay prevailing and the new ones are an overlay, since either may be present.
- The base forecast ends at the first `FM` or `BECMG`, not at the first group of any kind (issue #2, finding sof-c#7: a leading `TEMPO` stretched the base to the end of the TAF).
- `TEMPO` and `PROB` are overlays, split wherever the prevailing conditions under them change, and each piece merged with the prevailing conditions it sits on.
- `FM` and `BECMG` are applied in time order, and nothing earlier runs past an `FM`.
- Anything that makes the forecast less than fully readable is listed in `taf.problems`: a group keyword with no readable time (its conditions are kept apart, never merged into the group before), `FM` groups out of time order, a group outside the valid period, a `BECMG`/`TEMPO`/`PROB` period that is longer than the TAF's valid period or runs past its end or ends at or before its start (together these catch one that ends before it starts, such as `TEMPO 2920/2916`, whichever month it resolves to, WX-1), an implausible valid period (ending at or before its start, over 30 hours, or more than a day from the issue time), or tokens that could not be read.

#### Limit checks

V6's thresholds, with Patrick's answers to Q27 (D57) and Q28 (D58), 2026-09-30.

- **Below (red).** A report is below a limit when the ceiling is **strictly below** the ceiling limit, or the visibility is strictly below the visibility limit. This is V6's rule (`<`), confirmed by Patrick (Q27): "below a limit, not at or below".
- **At the limit (yellow).** When nothing is below, a ceiling exactly on its limit or a plain visibility exactly on its limit is `atLimit` (Q27: "at limit can be yellow"). At the home limits, `3SM BKN020` is at the limit, not below it. `M3SM` against a 3 SM limit is below; `P6SM` against a 6 SM limit is not at it.
- `M` visibility counts as below when its number is at or below the limit (`M1/4SM` is below 1/4 SM). `P` visibility counts as below only when its number is below the limit. For limits of 6 SM or less this gives exactly V6's results, which used 0.24 and 6.01.
- **Cautions.** Dangerous weather raises a caution the SOF must acknowledge (Q28: "VCTS and CB/TCU, same with FC or +FC or anything dangerous"). A caution is raised at the station or in the vicinity (`VC`) for:
  - `TS` thunderstorm, in any combination (`TSRA`, `+TSRAGR`, `VCTS`). V6's pattern missed `TSRAGR`; that is a parsing fix.
  - `FC` funnel cloud and `+FC` tornado or waterspout (`VCFC` too).
  - `SQ` squall.
  - `GR` hail and `GS` small hail.
  - `FZRA` and `FZDZ` freezing rain and drizzle, and `PL` ice pellets. V6 missed `FZRAPL`; that is a parsing fix.
  - `VA` volcanic ash, `SS` sandstorm, `DS` duststorm, `PO` dust or sand whirls.
  - `BLSN` blowing snow.
  - Fog at the station: `FG` and `FZFG` (not `MIFG`, `BCFG` or `PRFG`). V6 missed `FZFG`; that is a parsing fix.
  - `CB` or `TCU` on any cloud layer, whatever its cover (`FEW040CB`).

  `DANGEROUS_WEATHER` in `limits.js` exports the weather codes above for the SOF to show.
- **Information only** (Q28): snow (`SN`, `-SN`, `SHSN`), shallow, patchy or partial fog (`MIFG`, `BCFG`, `PRFG`), and other vicinity weather (`VCSH`, `VCFG`, `VCBLSN`). The check returns them in `watch` so the SOF can show them without asking for an acknowledgement.
- An unknown visibility or ceiling is reported as unknown, never as "within limits".
- `checkConditions` returns a `level`, worst first: `below` (red), `caution` (dangerous weather), `unknown`, `at-limit` (yellow), `within`. It also returns the flags behind it (`belowLimits`, `atLimit`, `cautions`, `alert`) and the reasons in V6's wording: `CEILING 1500 FT < 2000 FT`, `CEILING 2000 FT AT LIMIT 2000 FT`, `VIS 3 SM AT LIMIT 3 SM`, `THUNDERSTORM / SEVERE WX (VCTS)`, `SIGNIFICANT WX (FZFG)`, `CB/TCU (FEW040CB)`.

Default limits are V6's WX SETUP defaults: home 2000 ft and 3 SM, alternates 600 ft and 2 SM. The home trigger has two named choices in `HOME_TRIGGERS` (Q4, D111, Gen Book p.7): `local`, labelled "Local (MTCA) 2000/3" and the default, and `crossCountry`, labelled "Cross-country 3000/3". The Gen Book applies the trigger over the flight plus 1 h after the ETA; the SOF passes that window. The home airfield and alternates list is a setting (R16); `wx` takes the ICAO ids and limits as input.

#### Alternates

- **Home trigger.** For a wave window (takeoff to landing plus one hour, as V6), every prevailing period and every overlay touching the window is checked against the home limits. Status is `no-time` when the window can't be read, `no-taf` when there is no usable TAF (missing, `NIL` or `CNL`), `below` when the TAF's valid period does not cover the whole window but the part it covers is already below, `not-covered` when it does not cover the whole window otherwise, else `below` if anything is below, else `incomplete` if a prevailing ceiling or visibility is unknown or the TAF has problems, else `at-limit` if anything is exactly on a limit (Q27, yellow), else `meets`. Hits, at-limit pieces and caution pieces are returned either way, each with the group, its times and the reasons. `TEMPO` and `PROB` count, as in V6. Cautions (Q28) are listed but never change the status, which stays about ceiling and visibility.
- **Alternate airfield over an arrival window (Q30, D60).** Patrick's answer: check alternates over a window, not only at the ETA. The civil rule (CAR 602.123) checks only at the ETA, so a window is stricter. Sources are in `pf/wx-sources/canada-ifr-alternate-rules.md`.
  - **Window.** By default, the wave's earliest ETA minus 60 minutes to its latest ETA plus 60 minutes. `arrivalWindow(etas, { marginMin = 60 })` builds it, and the margin is a setting. A single ETA with a margin of 0 gives V6's point check.
  - **Minima per airfield, as input.** Each alternate brings its own `minima`: one `{ ceilingFt, visSm }` or a list of equivalent options. Conditions **at or above** the minima pass (CAR 602.123); exactly at them shows yellow (D57). The Canada Air Pilot's table: 400-1 (or 200-½ above the lowest HAT) with two or more precision approaches to separate runways; 600-2 with one usable precision approach (also 700-1½ or 800-1); 800-2 with non-precision only (also 900-1½ or 1000-1); 500 ft above the lowest HAT/HAA and 3 SM with only an advisory forecast; no cloud below 1000 ft above it, no CB and 3 SM with only a GFA. Which row applies, and any "300-1 above HAT" values, are the Airfields piece's to enter; `wx` just checks the numbers it is given. A piece passes when it meets any one option. It is below only when it is below every option. It is at-limit when its best option is exactly met. The airfield list and its values belong to the Airfields piece; until it exists, the fallback is V6's single 600/2.
  - **How each part of the TAF counts** (CAP GEN, TC AIM RAC 3.13):
    - Prevailing conditions and FM groups: against the alternate minima.
    - BECMG: against the alternate minima, taking the worse of the before and after conditions over the change period.
    - TEMPO: against the alternate minima.
    - PROB30/40: against the airfield's **landing minima** (`landingMinima`, from its approach plates), not the alternate minima. Without landing minima, a PROB below the alternate minima is listed in `probUnchecked` as a warning and does not change the status.
  - **Status**, worst first: `no-time`, `no-taf`, `not-covered` (the TAF doesn't cover the whole window and nothing it covers is below), `below`, `incomplete`, `at-limit`, `meets`. The result lists every hit, at-limit piece and caution with its times. **Short TAF (Patrick, 2026-09-30 07:36Z, decision card):** when the TAF ends before the window does but the part it covers is already below limits, the status is `below` with `covered: false`, so the SOF shows the alternate is needed and that the TAF ends early. The same applies to the home trigger. Weather already known to be below limits can't become acceptable because the forecast runs out. `worst` names the first-in-time piece with the worst result, so the SOF can show "below from 17Z".
  - **GNSS.** An alternate can be marked `gnssApproach` (it relies on a satellite approach). When home also relies on one (`homeGnssApproach`) and the two are under 100 NM apart (`distanceNm`), or the distance is unknown, `warnings` says so. From Moose Jaw only Saskatoon qualifies. For alternates, no credit is given for LPV, and RNAV with vertical guidance is not a precision approach; both belong in the minima the Airfields piece enters. V6's `needs-mea` and `gnss-check` statuses go away.
  - **Military alternates (D79).** 15 Wing uses the same alternate rules as above, with no exceptions (Patrick, 2026-09-30, closing WX-5).
  - **GNSS-only visual descent (D80).** An alternate reached by a GNSS-only visual descent passes when the ceiling is at least MEA + 500 ft and the visibility at least 3 SM over the arrival window. `visualDescent: { meaFt, elevationFt, visSm = 3 }` replaces `minima` for that airfield. The MEA is above sea level and a ceiling is above the field, so the check reads the rule at sea level: the cloud base must be at least MEA + 500 ft above sea level, which is a ceiling above the field of MEA + 500 ft minus the field elevation. Worked example: CYYN is at 2,677 ft and the MEA is 5,200 ft. The cloud base must be at 5,700 ft above sea level, so a ceiling of at least 3,023 ft above the field passes: `OVC035` passes, and `OVC030` is below. (Patrick chose this sea-level reading over the other one, a ceiling of MEA + 500 ft above the field, on 2026-09-30: D81.) Without a readable MEA and elevation the status is `incomplete`, never a pass. The Airfields piece supplies the values per airfield. `visualDescentMinima({ meaFt, elevationFt, visSm })` and `checkOptions(conditions, minima)` (one pair or a list of options; null when none is usable) are exported so the SOF card applies the same rules to a single report.

#### Classifications (V6 thresholds, unchanged)

- NATO colour state from the lowest `SCT` or thicker layer and the visibility in metres: RED below 200 ft or 800 m, AMB 300/1600, YLO2 500/2500, YLO1 700/3700, GRN 1500/5000, WHT 2500/8000, else BLU. V6's `nato()` at sof.html line 2009; its parsing bugs are fixed, not its thresholds. `UNK` when a layer's base is unknown, or when there is no cloud group and no `SKC`/`CLR`/`NSC`/`NCD`/`CAVOK`, or no visibility (WX-5), and the colour isn't already RED.
- Flight category, used only when the feed does not supply one: LIFR ceiling below 500 ft or visibility below 1 SM; IFR below 1000 ft or 3 SM; MVFR 3000 ft or 5 SM and below; else VFR. V6's `cat()` at sof.html line 576. `UNK` when nothing is known, or when a ceiling layer's base is unknown, no cloud is stated at all, or no visibility is stated (WX-5), and the category isn't already LIFR.

#### Sources

Patrick's choice, 2026-09-30: MET Norway first, Datamask as the backup. No proxy and no keys, because the site is static and a key in the page is public. Tested from a browser on the live site (`pf/wx-sources/sof-weather-sources.md`).

- **MET Norway tafmetar.** `https://api.met.no/weatherapi/tafmetar/1.0/metar?icao=CYMJ,CYQR` and `.../taf?icao=...`. One request covers every airfield. The response is plain text, one report per line ending in `=`, oldest first, for the whole day. `wx` keeps the newest report per station. Reports carry no `METAR`, `SPECI`, `TAF` or `AMD` prefix, so an unmarked SPECI reads as a METAR. An unknown station is simply missing (HTTP 200, empty body). Licence CC BY 4.0, credited on screen as "MET Norway".
- **Datamask.** `https://datamask.org/api/v1/metar/CYQR` and `.../taf/CYQR`, one airfield per request. JSON; `wx` uses only `raw` and ignores Datamask's own decoding and times. HTTP 404 means no report. A doubled `TAF AMD TAF AMD` prefix is read once by `parseTaf`. Credited as "NOAA NWS via Datamask".
- **Order.** MET Norway is asked for every airfield in one request. Any airfield it has nothing for, or every airfield if it fails, is asked of Datamask one at a time. Each report says which source it came from.
- **Requests.** Plain `GET` with no custom headers, so the browser sends no preflight (MET Norway allows only simple requests). `cache: 'no-cache'` lets the browser revalidate with `If-Modified-Since` itself where the source sends `Last-Modified`. Each request gives up after 10 seconds. Station ids must be four letters or digits before they go in a URL; anything else is refused.
- **Refresh.** Every 5 minutes by default (a setting, never faster than once a minute), with timers passed in so tests control time. A failed refresh keeps the last good report and reports the error; it never clears data.
- **Stale.** A METAR is stale when it is more than 75 minutes old by its own observation time. A TAF is stale when its valid period has ended. A cancelled TAF reads as `cancelled`, not stale or unreadable. A report with no readable time is stale. The fetch time never counts: Datamask has served a 12-day-old METAR as current.
- **Untrusted replies.** A reply over 256 KB, or a report over 4000 characters, is refused, not parsed. A Datamask report for a different station than the one asked for is refused. Only `metar` or `taf` and at most 30 valid station ids ever reach a URL, and requests send no cookies (`credentials: 'omit'`). Raw report text goes to the page as data: the SOF must show it as text, never as HTML.
- `sources.js` is the only module in `wx` that talks to the network. `fetch` and the timers are passed in, so every other rule in this spec (pure functions, no throwing) still holds and it can be tested without a network.

#### Data age

- `ageMinutes(report, now)` (in `dates.js`) from the report's observation or issue time, never the fetch time: a feed can serve a report days old as if it were current. The stale rules for METAR and TAF are under "Sources"; how the SOF shows them is its own spec (R13).

### Interface

```js
import { parseMetar } from './src/wx/metar.js';
import { parseTaf, tafTimeline, forecastAt } from './src/wx/taf.js';
import { checkConditions, DEFAULT_LIMITS, natoColour, flightCategory } from './src/wx/limits.js';
import { arrivalWindow, homeAlternateTrigger, assessAlternate } from './src/wx/alternates.js';

const now = new Date('2026-09-29T15:30:00Z');
const taf = parseTaf('TAF CYMJ 291120Z 2912/3012 27010KT P6SM SKC TEMPO 2916/2920 1/2SM FG', { now });
taf.groups[1];          // { kind: 'TEMPO', from: Date(29 16Z), to: Date(29 20Z), conditions: { visibility: { sm: 0.5, ... }, weather: [FG] } }

homeAlternateTrigger(taf, { from: takeoff, to: landPlus1h }, DEFAULT_LIMITS.home);
// { status: 'below', covered: true, hits: [{ kind: 'TEMPO', from, to, reasons: ['VIS 1/2 SM < 3 SM', 'SIGNIFICANT WX (FG)'] }],
//   atLimit: [], cautions: [{ kind: 'TEMPO', ..., cautions: ['FG'] }] }

assessAlternate(taf, arrivalWindow([eta1, eta2]), {
  minima: [{ ceilingFt: 600, visSm: 2 }, { ceilingFt: 700, visSm: 1.5 }, { ceilingFt: 800, visSm: 1 }],
  landingMinima: { ceilingFt: 300, visSm: 0.75 },
});
// { status: 'below' | 'incomplete' | 'at-limit' | 'meets' | ..., hits, atLimit, cautions, probUnchecked, worst, warnings }
```

Every function is pure: plain values in, plain values out, times as `Date` in UTC. Functions never throw on bad text, missing times or missing limits (missing limits fall back to the defaults; limits or minima that are given but can't be read add a problem and give `incomplete`, WX-7); they return what they could read plus what they could not.

### Commands

```
node --test 'tests/unit/wx/*.test.js'   # this module's tests
npm test                          # everything, once the app frame adds package.json
```

### Project structure

```
src/wx/
  conditions.js     shared parsing of wind, visibility, weather, cloud; merge; formatting
  metar.js          parseMetar
  taf.js            parseTaf, tafTimeline, forecastAt
  limits.js         DEFAULT_LIMITS, checkConditions, natoColour, flightCategory
  alternates.js     homeAlternateTrigger, assessAlternate
  dates.js          day-of-month times to full UTC dates; ageMinutes
  README.md         what each file does, where to change common things (R8)
tests/unit/wx/
  reports.js        the table of report strings the tests share
  v6-sof.js         loads V6's own SOF functions from original/shell.html
  *.test.js         one per source file, plus v6-compare.test.js
```

### Testing strategy

1. **Table-driven from real reports.** Each case is a real-format report string with the expected parse or result. The table includes each audit bug as its own named case: `TEMPO 2916/2920 1/2SM FG` (#1), BECMG carried past its change period and a leading TEMPO not stretching the base (#2), `BKN015CB`, `SCT025TCU` and `M1/4SM` (#3), an alternate below minima at ETA (#4), and the limit and caution evaluation that never ran in V6 (#5).
2. **Compared with V6.** `v6-compare.test.js` decodes V6's SOF page from `original/shell.html` (as `tools/extract_subapps.py` does), runs V6's own `vals()`, `nato()`, `cat()` and `tafHazards()` on the same reports, and asserts the new code agrees wherever V6 parsed the report correctly, and differs exactly where an audit bug says V6 is wrong.
3. **Dates.** Month and year ends, hour 24, and a TAF that crosses midnight.

### Boundaries

- **Always:** keep functions pure (only `sources.js` fetches, with `fetch` passed in); add a test case for every report that ever parses wrong; cite the audit issue in the test name.
- **Ask first:** changing a default limit, the `<` rule, or which weather raises a caution; adding a data source.
- **Never:** touch the page from `wx`; guess a value the report does not give (unknown stays unknown).

### Open questions (plan doc Questions tab Q27 to Q30)

Logged as Q27 (WX-1) to Q30 (WX-4). Patrick answered all four on 2026-09-30.

- **WX-1 / Q27, answered (D57).** Below stays strictly below (`<`); exactly at a limit is yellow. See "Limit checks".
- **WX-2 / Q28, answered (D58).** `VCTS`, `CB`/`TCU`, `FC`, `+FC` and other dangerous weather raise an acknowledgeable caution; snow and shallow fog stay information only. The list is under "Limit checks".
- **WX-3 / Q29, answered (D59).** The home trigger is 2000 ft / 3 SM, and its label must read 2000/3 to match the check. The SOF builds its label from the limits it passes in, so the label can never drift from the check again. **Corrected by Q4 / D111 (Patrick, 2026-09-30 05:19Z):** V6's "DEST TRIGGER <3000 FT / 3 SM" label was not wrong, because 3000/3 is the Gen Book's cross-country rule (2000/3 applies when staying within the MTCA). The default stays 2000/3, labelled "Local (MTCA) 2000/3", and "Cross-country 3000/3" is the other choice (`HOME_TRIGGERS`).
- **WX-4 / Q30, answered (D60).** Alternates are checked over an arrival window (±1 hour by default) with the Canadian alternate rules. See "Alternates"; Patrick approved this spec change on 2026-09-30.
- **WX-5 / Q40, answered (D79).** Military alternates follow the same rules as the SOF's civil rules, with no exceptions. The GNSS-only visual descent rule is D80, under "Alternates".


## From `archive/specs/SPEC-airfields.md`

## Spec: `airfields`, the home field and its alternates

Status: **approved by Patrick on 2026-09-30** ("approve", in the Airfields thread). Changes go through a pull request. Module id `airfields` in [`archive/SPEC.md`](../../../archive/SPEC.md). Requirements: R16 (home airfield and alternates are a setting), R10 (one Zulu/local switch, local is the home field's zone), R13 (SOF), R22 (essentials first). Decisions: the home airfield is a setting usable anywhere, default CYMJ (Patrick, 2026-09-29), D60 and D70 to D73 (Q30 alternate rules), D79 (military alternate rules are the same as these civil rules) and D80 (visual descent from the MEA), both Patrick's answers of 2026-09-30. Decision, requirement and question numbers refer to the plan doc: https://claude.ai/code/artifact/29712036-a126-43c3-ac39-57ba919ff102

### Objective

One place that knows the home airfield and the alternates, and what each alternate needs to count as legal. V6 hard-codes Moose Jaw in about 15 places with three different positions, assumes CST everywhere (#7, #42), keeps the alternates as a text box in the SOF's WX SETUP, and checks every alternate against one 600 ft / 2 SM limit that nothing actually reads (#4). Here:

1. The home field is a setting (default CYMJ). Its time zone drives local time in every module.
2. The alternates are a short list (default CYQR, CYYN, CYXE, as V6).
3. Each alternate carries its approach type and lowest landing minima, and `airfields` turns those into the numbers the weather parser's `assessAlternate` already takes: alternate minima (with the trade-offs), landing minima for PROB groups, the GNSS flag and the distance from home.

Users: the SOF (alternate calls), and every module that shows local time or needs the home field's position or elevation. Done means the SOF can call `assessAlternate(taf, window, airfields.checkOptions('CYXE'))` with nothing typed twice, and the header clock follows the home field.

### Scope

In:

- A built-in list of known airfields: V6's 15 (sof.html line 563: CYMJ, CYQR, CYYN, CYXE, CYQV, KGGW, KISN, CYPA, CYQW, KMIB, CYXH, KMOT, CYBR, CYQL, KGTF), with V6's names and positions, plus each one's time zone. CYMJ also carries V6's field elevation, 1,892 ft (shell.html line 737).
- The setting: home ICAO, the alternates list, and each airfield's approach type and lowest landing minima. Any four-character ICAO can be added. One that isn't in the built-in list needs a name and, for distances, a position; as the home field it also needs a time zone.
- The alternate-minima rules from the Canada Air Pilot (CAP GEN, "Operating Minima – Alternate"), as decided in D71 and D73. Research: `pf/wx-sources/canada-ifr-alternate-rules.md`.
- Great-circle distance from home to each alternate.
- One settings panel (below), built with `src/ui-kit/`.

Out:

- Deciding whether weather is good enough. `wx` does that (`src/wx/alternates.js`); `airfields` only supplies the numbers.
- The home-weather trigger (2000 ft / 3 SM), the ± window margin and the refresh rate. Those are SOF settings, in the SOF spec.
- Real runway data (FF20), SOF crosswind (FF21), NOTAMs, and any approach data shipped with the app. Approach charts change every 56 days, so the app never carries them. People enter the approach type and the lowest minima from the current Canada Air Pilot. **[Replaced: Patrick's SOF answer SOF-Q3 reverses "never carries approach data"; see `../sof/requirements.md`. Rewritten when the shared work resumes.]**
- The VNC charts and the 19 route overlays. They are pinned to places, not to the home setting, so they stay with the debrief (`src/modules/debrief/data/cymj.js`).

### Behaviour

#### The setting

```js
{
  version: 1,
  home: 'CYMJ',
  alternates: ['CYQR', 'CYYN', 'CYXE'],
  fields: {            // only what someone changed or added; the built-in list fills the rest
    CYXE: { approach: 'one-precision', lowestHatFt: 250, lowestVisSm: 0.75 },
  },
}
```

- Stored with `src/storage/` under the scope `airfields`. If the browser won't store it, it lasts for the visit, as every other setting does.
- Everything read back is checked: ICAO ids must be four letters or digits (upper-cased), numbers must be finite and in range (HAT 0 to 5,000 ft, visibility 0 to 10 SM, latitude ±90, longitude ±180, elevation −1,500 to 15,000 ft, MEA 0 to 20,000 ft), the time zone must be one the browser knows, and the approach type must be one of the list below. Anything else is dropped, never guessed.
- The home field can't also be an alternate. Duplicates are dropped. Up to 6 alternates (V6 showed 3).
- Making an alternate the home field takes it off the alternates, and the panel says so under the box ("CYQR is now home, so it was taken off the alternates.", AF-5). It is a remark, not a refusal: the box is not marked invalid and the text is not red.
- Changing the home field changes local time everywhere at once (the shell's header clock, the SOF's clocks and wave times, debrief times) through `subscribe`.

#### Approach type, and the alternate minima it gives

Each airfield has one approach type. It says which row of the CAP GEN table applies, counting only approaches that are usable at the ETA.

| Approach type (what the user picks) | Alternate minima (CAP GEN) | GNSS flag |
|---|---|---|
| Not set (default) | V6's 600-2, marked "not checked against approaches" | off |
| Two or more precision approaches, to separate runways | 400-1, or 200-½ above the lowest HAT and visibility | off |
| One precision approach (ILS or PAR) | 600-2, also 700-1½ or 800-1; or 300-1 above the lowest HAT and visibility | off |
| Non-precision only (LOC, VOR, NDB) | 800-2, also 900-1½ or 1000-1; or 300-1 above the lowest HAT/HAA and visibility | off |
| GNSS only (RNAV, LNAV minima) | as non-precision | on |
| No IFR approach (visual descent from the MEA) | none from the table: the visual-descent check below is the whole test (D80) | off |

- **"Whichever is greater"**, for each of ceiling and visibility separately: for one precision approach with a lowest HAT of 350 ft and visibility ¾ SM, the minima are the greater of 600 and 650 ft, and of 2 and 1¾ SM, so 700-2. The trade-offs (700-1½, 800-1 and so on) apply only when the standard values win. When the lowest HAT or visibility isn't entered, the standard values are used.
- **Rounding** (CAP GEN): a computed ceiling up to 20 ft over a hundred rounds down, anything more rounds up (HAT 420 gives 400, 421 gives 500). A computed visibility is never more than 3 SM.
- **No LPV credit** (D73): the GNSS-only row uses the LNAV minima, and RNAV with vertical guidance is not a precision approach. The panel's help line says so.
- **PAR counts as a precision approach.** CAP GEN and military FLIP agree on this, and D79 says the military rules are the same as these.

#### Visual descent from the MEA (D80)

- A GNSS-only or no-IFR-approach airfield can have an **MEA** (the minimum IFR altitude to reach it, feet above sea level) and a **visual-descent visibility** (default 3 SM). Both sit under More.
- With an MEA entered, `checkOptions` returns `visualDescent: { meaFt, elevationFt, visSm }`, the names `wx` uses. `wx` checks that the ceiling (above the field) is at least MEA + 500 ft − field elevation, and the visibility at least `visSm`, over the arrival window. When the MEA or the elevation is missing, `wx` says "incomplete", never "meets".
- Built-in airfields other than CYMJ have no elevation in V6, so their elevation can be entered under More (it is fixed only where the built-in list has one). Without an MEA, `visualDescent` is `null`; a no-IFR-approach airfield then shows "needs MEA".

#### Landing minima (for PROB groups)

- The lowest usable HAT and its visibility, as entered for the airfield (`lowestHatFt`, `lowestVisSm`), are the landing minima that PROB30/40 groups are checked against (D72). For a GNSS-only field these are the LNAV numbers, not LPV.
- When they aren't entered, `landingMinima` is `null`, and `wx` lists a PROB below the alternate minima as "unchecked" instead of passing or failing it, as it does today.

#### GNSS and distance (D73)

- `gnssApproach` is on for an airfield whose approach type is GNSS only. A "Plan uses a GNSS approach here" checkbox (under More) can turn it on for any airfield, including home, for a day when the plan relies on RNAV although other approaches exist.
- `distanceNm` is the great-circle distance from the home field, from the two positions, rounded to 0.1 NM. It is `null` when either position is missing, which `wx` already reports as "distance unknown".
- From CYMJ with V6's positions: CYQR 35 NM, CYYN 82 NM, CYXE 119 NM, so only CYXE clears 100 NM, matching the research.

#### Questions (all answered)

- **Q40:** the military rules are the civil rules above (D79).
- **GNSS visual descent:** see above (D80). Patrick picked the sea-level reading of the MEA.
- **Who fills in the default airfields' approaches:** each user, in Settings (Patrick, 2026-09-30, "agree with recommendations"). CYQR, CYYN and CYXE ship as "Not set (600-2)", exactly V6, because approach plates change every 56 days. The current approach type and lowest minima come from the Canada Air Pilot and are kept in that browser.

### The screen (R22)

An **Airfields** section in the Settings dialog. It shows only this by default:

```
Airfields
  Home field   [CYMJ    ]  Moose Jaw · local time UTC−6
  Alternates   ICAO   Approaches                    Lowest HAT   Vis     From home
               CYQR   [One precision (ILS/PAR) ▾]   [ 250 ] ft   [¾] SM  35 NM
               CYYN   [Not set (600-2)         ▾]   [     ] ft   [ ] SM  82 NM
               CYXE   [Not set (600-2)         ▾]   [     ] ft   [ ] SM  119 NM
               + Add alternate                                         (✕ removes a row)
  Minima used  CYQR 600-2 (or 700-1½, 800-1) · CYYN 600-2, not checked · CYXE 600-2, not checked
  ▸ More airfield settings
```

- **More airfield settings** (collapsed): per airfield, the name, position, elevation and time zone (filled in and read-only for built-in airfields, editable for added ones, and elevation editable wherever the built-in list has none), the MEA and visual-descent visibility for GNSS-only and no-IFR-approach fields (D80), and the "Plan uses a GNSS approach here" checkbox; the rounding and no-LPV notes; and "Reset airfields to defaults".
- An ICAO that isn't in the built-in list opens its row in More so the name, position and (for home) time zone can be entered. Until the home field has a time zone, local time stays on the last good zone and the row says so.
- Built with `src/ui-kit/` (`createPanel`, `h`, controls). Text in, never HTML. Every input has a real label, works from the keyboard, and states errors in words, not only colour.

### Interface

```js
import { createAirfields } from './src/airfields/airfields.js';

const airfields = createAirfields({ store: app.storage.scope('airfields') });
airfields.home();          // { icao: 'CYMJ', name: 'Moose Jaw', lat: 50.3303, lon: -105.559, elevationFt: 1892, timeZone: 'America/Regina', approach: 'not-set', ... }
airfields.alternates();    // [{ icao: 'CYQR', ... }, ...] in the user's order
airfields.stations();      // ['CYMJ', 'CYQR', 'CYYN', 'CYXE'], for the weather sources
airfields.checkOptions('CYXE');
// { minima: [{ ceilingFt: 600, visSm: 2 }],   // "not set": V6's 600-2 only
//   minimaChecked: false, landingMinima: null,
//   gnssApproach: false, homeGnssApproach: false, distanceNm: 119.x, visualDescent: null }
// → passed straight to wx's assessAlternate(taf, window, options)
airfields.update({ alternates: ['CYQR', 'CYXE'] });
const stop = airfields.subscribe((next) => { … });
```

Pure functions, tested on their own, in `src/airfields/minima.js` and `distance.js`: `alternateMinima(field)`, `landingMinima(field)`, `roundCeilingFt(ft)`, `greatCircleNm(a, b)`.

Other modules only read through this interface. Changes other threads make to use it go through the coordinator:

- **Shell** (app-frame thread): the header takes its zone from `airfields.home().timeZone` in place of `HOME_ZONE`, and the Settings dialog mounts the Airfields section.
- **Debrief**: the "Field elev" datum reads the home elevation.
- **SOF** (later): the station list, the alternate cards and `checkOptions`.

### Commands

```
npm test                                     # everything
node --test 'tests/unit/airfields/*.test.js' # this module
npm run test:e2e                              # includes the Airfields panel
```

### Project structure

```
src/airfields/
  airfields.js     createAirfields: the setting, checking what's read back, subscribe
  catalog.js       V6's 15 airfields: name, position, time zone; CYMJ's elevation
  minima.js        CAP GEN table, trade-offs, "whichever is greater", rounding, landing minima
  distance.js      great-circle distance in NM
  panel.js         the Settings section (R22)
  airports-data.js the runways the 3D airfields and the SOF's crosswind check read (SOF-63): OurAirports' list with the best ends laid over (DB-26)
  runway-ends.js   the best runway ends, written by tools/cifp-runways.mjs: Patrick's points at CYMJ (from Traffic's airfield.js), FAA CIFP at the US fields (DB-26)
  airspace/        the airspace the SOF and the Debrief draw (SOF-63, DB-24): data.js, dah/, faa/, model.js, filter.js, load.js, areas.js
  README.md        what each file does, and how to add a built-in airfield
tests/unit/airfields/
  *.test.js        one per source file
tests/e2e/airfields.spec.js   the panel, keyboard and blocked-storage cases (owned here, added through the app-frame thread)
tasks/airfields/   plan.md and todo.md, once this spec is approved
```

### Testing strategy

1. **Minima table.** Each row of the CAP GEN table, each trade-off, "whichever is greater" for ceiling and visibility separately (the 350 ft / ¾ SM example gives 700-2), the rounding examples (420 → 400, 421 → 500), the 3 SM cap, and "not set" giving exactly V6's 600/2.
2. **Straight into `wx`.** `checkOptions` fed to the real `assessAlternate` with TAFs from `tests/unit/wx/reports.js`: a field at 800-2 (non-precision) fails a TAF of `BKN007 3SM` that passes at 600-2; a PROB30 at 300 ft passes with landing minima of 250 ft and is "unchecked" without them; CYQR (35 NM) with GNSS at both ends warns, CYXE (119 NM) doesn't.
3. **Distances.** CYMJ to CYQR, CYYN and CYXE match 35, 82 and 119 NM to within 1 NM, and a missing position gives `null`.
4. **The setting.** Defaults are V6's (CYMJ; CYQR, CYYN, CYXE; 600-2). Bad ICAO ids, out-of-range numbers, unknown time zones and unknown approach types are dropped; home is never an alternate; blocked storage works for the visit; `subscribe` fires on every change.
5. **Screen** (Playwright): the default view shows only the rows above; More opens and closes; changing the home field to an airfield with a different zone changes the header's local time; everything reachable by keyboard; nothing overlaps at 1366 × 768 (R2).

### Skills used

From `.claude/skills/` (which one when: `.claude/skills/README.md`). Each PR lists the skills it applied.

| Step | Skill | What it means here |
|---|---|---|
| This spec | spec-driven-development | Nothing is built until Patrick approves it. |
| Plan | planning-and-task-breakdown | `archive/tasks/airfields/plan.md` and `todo.md`: small, ordered tasks, each with its own tests. |
| Build | incremental-implementation | One working, committed slice at a time: catalog and distance, then minima, then the setting, then the panel. |
| Build | test-driven-development | A failing test first for every minima row, trade-off, rounding case, distance and dropped bad value, each citing its CAP GEN rule. The window logic stays in `wx`, which already tests it. |
| The Settings panel | frontend-ui-engineering, with `.claude/references/accessibility-checklist.md` | Labelled inputs, keyboard access, errors in words, essentials first (R22). |
| Entered and stored airfields | security-and-hardening, with `.claude/references/security-checklist.md` | Typed ICAO ids, names and numbers, and whatever comes back from storage, are untrusted: checked where they enter, shown as text only (`h()`), never `innerHTML`. |
| Anything that breaks | debugging-and-error-recovery | Reproduce, find the cause, fix, add a regression test. |
| Before a PR leaves draft | code-review-and-quality, then code-simplification | Five-axis review with `/code-review` and `/security-review`, then `/simplify`. |

performance-optimization doesn't apply: the module is a few kilobytes and does no work while it's idle.

### Boundaries

- **Always:** keep the minima functions pure; cite the CAP GEN rule in each test name; unknown stays unknown (a missing HAT or position is `null`, never a guess).
- **Ask first:** shipping any approach or runway data; changing a CAP GEN rule, a default, or the "not set" fallback.
- **Never:** decide pass or fail on weather here (that's `wx`); edit `original/`; put entered text into the page as HTML.

### Success criteria

- The tests above pass under `npm test` and `npm run test:e2e`.
- With nothing changed, every number the SOF would use is V6's (600-2 for each alternate, CYMJ local time UTC−6).
- Setting CYXE to "Non-precision only" makes the SOF check it against 800-2, 900-1½ and 1000-1 with no other change.
- Setting the home field to CYXH (Medicine Hat) shows local time in Mountain time across the app.
