# The flight-math list

Read this before writing any flight math (`AGENTS.md`, "Search for existing flight math before writing new"). If what you need is here, use it. If it is close, improve it here and in its test. Never write a second copy. A new shared formula gets a line in this list in the same change.

Every function lives in `src/core/` and is tested in `tests/unit/core/`. Inside the code, headings are math radians (0 east, counter-clockwise), except where a line says compass degrees. Positions are feet with x east and y north. Speeds say which kind they are.

Sources: "aero" means standard aerodynamics, worked out in the test. A manual page is given where one backs the number. "Estimate" means no manual or ruling backs it yet.

## Turns

| Function | File | What it gives, in pilot words | Source |
|---|---|---|---|
| `gFromBankDeg(bank)` | flight-math.js | G in a level turn at this bank: 60° is 2 G | aero, 1 / cos(bank) |
| `bankDegFromG(g)` | flight-math.js | Bank for a level turn at this G | aero |
| `turnRadiusFromBankFt(v, bank)` | flight-math.js | Turn radius from bank and true airspeed (ft/s) | aero, v² / (g tan bank) |
| `turnRateFromBankRadPerSec(v, bank)` | flight-math.js | Turn rate from bank and true airspeed | aero, g tan bank / v |
| `turnRadiusFt(v, g)`, `turnRateRadPerSec(v, g)` | flight-math.js | The same, given G instead of bank | aero |
| `limitG(g, max)`, `MIN_TURN_G` | flight-math.js | Keeps G above 1.01 so a turn exists | design choice (D74) |
| `rollToward(bank, target, maxDelta)` | flight-math.js | Rolls toward a bank by at most a step, the short way round | kinematics |
| `bankDegFromTurnRate(v, rate)` | flight-math.js | Bank a turn at this rate needs at this true airspeed (ft/s); right turn positive | aero, atan(v × rate / g) |
| `easeRoll(bank, rollRate, target, dt, limits)` | flight-math.js | One step of a smooth roll toward a bank: the roll rate builds up, holds at its limit and dies away so the wings stop on the target without overshoot | kinematics; the Traffic limits (45°/s, 90°/s²) are estimates |
| `easeValue` | flight-math.js | easeRoll under a general name: limits any value's rate and the change of that rate (a G onset, a roll) | kinematics |
| `dampedClimbG(...)` | flight-math.js | G to bring the flight path smoothly onto a target climb angle | kinematics |
| `pilotAxis(mem, dev, rate, dt, gains)` | flight-math.js | One pilot's axis, one step: P on how far off, D on how fast it is changing (the motion he sees), a weak trim held at its limit; optional soft thresholds; returns the pressure and new memory (Formation's close-in wingman, TS-226) | PID difference equation (Bhandari and Csurcsia 2022; Toochinda 2011) |
| `gFromTrack(p0, h0, p1, h1, dt)` | flight-math.js | G of a level turn read off a recorded track | aero |
| GPS gap fill (not in core): `fillGaps`, `smoothAt`, `endState`, `hermite` | `src/flight-data/gap-fill.js` | A best-guess path across a gap in a recorded track: another ship's path plus the offset, or one or two turns eased in and out at a pilot's roll rate, built only from the core functions above (`easeRoll`, `rollWithinT6A`, `turnRateFromBankRadPerSec`, `bankDegFromTurnRate`, `gFromBankDeg`, `bankDegFromG`, `stallLimitG`, `tasToIasKt`); a smooth curve through a track's fixes; an end's speed, track and turn from a least-squares curve; a cubic Hermite join. The Debrief draws it only, never judges it (DB-19, DB-20) | kinematics and curve fitting; every threshold an estimate (`GAP_FILL`) |
| GPS puck move (not in core): `movePuck(track, ref, offsetFt)` | `src/flight-data/puck.js` | Moves every fix of a recorded track from where the portable GPS sat to the aircraft's reference point: the puck's offset turned to the fix's heading (the smooth curve's, `smoothAt`; held while still) and its height taken off. Heading only, not bank and pitch (under 2 ft for a puck a few feet from the reference point). The Debrief says where the puck sits (DB-23) | geometry; the offsets are estimates off the CT-156 cockpit model (TS-157) |
| GPS timestamps (not in core): `judgeTiming(fixes)`, `snapFixes(fixes, offsetS)`, `retimeFlight(flight, choices)`, `clampShift` | `src/flight-data/timing.js` | Whether a track's fix times sit on the GPS second, off it by a steady relay delay (an external GPS stamped on arrival at the iPad), faster than once a second, or irregular; the fixes put back on their GPS seconds (the whole second at or before each stamp, a second's collision keeping the fix nearer the typical offset); a per-ship time shift; gaps and the playback window worked out again (`findGaps` in `clean.js`, `playbackWindow` in `flight.js`). Positions never change (DB-25) | timing; every threshold an estimate from the example flight (`TIMING`) |
| Altitude check (not in core): `isGroundFix(fixes, i)`, `groundPhases(track)`, `altitudeCheck(flight, { refAt })`, `correctionAt`, `correctAltitudes(flight, check, choices)` | `src/flight-data/altitude.js` | The one ground-fix test (under the gap fill's 40 kt, steps of 5 s or less; the 3D ground, DB-26, reads it too); each ship's GPS height against the terrain under its taxi out and taxi in fixes (median), blended in time from take-off to landing, taken off relative to the mean of all ships so only the differences between ships change (DB-28) | statistics (median, linear blend); thresholds are estimates |
| `stepPointMass(state, control, dt)` | point-mass.js | One step of an aircraft flown by G and bank, through loops and vertical | aero, Runge-Kutta |
| `upFrom(vHat, prevUp)` | point-mass.js | The aircraft's up, square to the path, carried through the vertical the way the step carries it | geometry |
| `gAndBankForLift(lift, vHat, up)` | point-mass.js | The G and bank that give a lift vector: the inverse of the step's lift | geometry |
| `liftTowardAim(vHat, toAim, vFtps, gain)` | point-mass.js | The lift a pursuit asks for: carry the weight and turn toward any aim point (pure, lead, lag, a slot) | kinematics; the gain is the module's |
| `turnPlaneNormal(vel, up, turning)` | point-mass.js | The unit normal of a turn's plane | geometry |

## Aircraft performance sets

The T-6A rows below are one aircraft's numbers put through one set of formulas. Since Traffic plan Step 5c Phase 1 the formulas live in `aircraft-performance.js`; `t6-performance.js` keeps every name it always exported, each now the T-6A set's function, with the same value and behaviour.

| Function | File | What it gives | Source |
|---|---|---|---|
| `makePerformance({ name, fit, limits, roll, gOnset, pitch, glide, manoeuvre, sources })` | aircraft-performance.js | One aircraft's performance set from its numbers: `stallLimitG`, `availableG`, `rollLimitsAtKtas`, `rollWithin`, `maxKias`, `modelMaxIas`, `thrustPerWeight`, `dragPerWeight`, `excessThrustPerWeight`, `excessFn`, `excessFnFor`, `pitchDegFromClimb`, `attitudeDegFromClimb`, `glideRatio`, `glideSinkFpm`, `glideDragPerWeight`, `shakerG`, each the T-6A function of the same job closed over that aircraft's numbers. A set with no glide data (or no shaker margin) throws rather than borrow another aircraft's | the formulas of the T-6A rows below |
| `estimatesIn(perf)` | aircraft-performance.js | The names of a set's numbers still marked "estimate", for the screen's flags | none (a list) |
| `T6A_PERFORMANCE` | t6-performance.js | The T-6A's set, built from `T6A_FIT`, `T6A_LIMITS`, `T6A_ROLL`, `T6A_G_ONSET`, `T6A_PITCH`, `T6A_GLIDE` and `T6A_MANOEUVRE`; what Traffic's envelope gate uses unless told otherwise | as the T-6A rows |
| `CT102B_PERFORMANCE`, `CT102B_AIRFRAME`, `CT102B_FIT`, `CT102B_LIMITS`, `CT102B_PITCH`, `CT102B_SOURCES` | ct102b-performance.js | The CT-102B Astra II's set (Traffic spec 4.19): stall 68 KIAS, +6/−4 G, 240 KIAS top speed, thrust and drag worked from the 456 shp engine, wing area, span, weight, climb rate and estimated drag and propeller numbers; the T-6A's roll and G onset; no glide data. Each number's source status in `CT102B_SOURCES` | type certificate sheet and public figures (unchecked) and ESTIMATES, each named in the file; no manual |

## Speed, height and energy

| Function | File | What it gives | Source |
|---|---|---|---|
| `iasToTasKt(kias, alt, sigma)`, `tasToIasKt` | aircraft-performance.js (also exported from t6-performance.js) | Indicated to true airspeed and back, no compressibility: the standard day's density unless the caller passes the day's own (`sigma`) | aero |
| `machToKiasKt` | aircraft-performance.js (also exported from t6-performance.js) | KIAS for a Mach number, with compressibility | aero |
| `isaTempK(alt, dev)`, `isaPressureRatio(alt)`, `isaDensityRatio(alt)`, `speedOfSoundKt(alt, dev)` | atmosphere.js | The standard day once: temperature, pressure and density as a fraction of sea level, and the speed of sound; `dev` is today's temperature deviation, °C (0 by default). `isaDensityRatio` is also exported from flight-math.js and `speedOfSoundKt` from t6-performance.js, under the same names | standard atmosphere |
| `densityRatio(alt, dev)` | atmosphere.js | Air density at a pressure height on a day `dev` °C off standard: the standard ratio times T ÷ (T + dev). Traffic's airspeed pair in `weather.js` uses it with the day's deviation (TR-77) | standard atmosphere |
| `energyHeightFt(alt, ktas)` | t6-performance.js | Height plus the height the speed is worth | aero |
| `excessFnFor(throttle)` | t6-performance.js | The point-mass step's excess-power callback at part throttle: thrust scales with the throttle, drag does not | aero |
| Idle prop and speed brake drag (not in core) | Formation Sim (planned) | Extra drag at idle, full-fine prop: about 0.16 of the weight at 200 KIAS, growing with dynamic pressure; speed brake as a perforated flat plate. Used by the Formation Sim only; the core curves do not change | Patrick's break and "about 5 kt/s" (TS-61, `docs/modules/turn-sim/decisions.md`); brake size pending his number |
| `pitchDegFromClimb(climb, tas, kias, g)`, `T6A_PITCH` | t6-performance.js | Nose attitude: climb angle plus angle of attack, which grows with G and falls with speed squared (about 11° in a 180 KIAS climb) | climb angle aero; angle of attack an estimate matched to SMM 3.14 para 35 and EFIG p.126 |
| `attitudeDegFromClimb(climb, tas, kias, g)`, `T6A_PITCH.datumDeg` | t6-performance.js | The attitude the pilot sees: pitchDegFromClimb less the 2.6° fuselage datum (about −0.7° level at 220 KIAS, 8.5° in the 180 KIAS climb) | datum an estimate fitted to Patrick's 220 KIAS attitude, 6 Oct 06:17Z (TR-91) |
| `thrustPerWeight`, `dragPerWeight`, `excessThrustPerWeight`, `t6aExcessFn` | t6-performance.js | Full-power thrust, drag and what is left to climb or speed up with. Climb rate = excess × TAS. Pass the turn's real G. `t6aExcessFn` is the same in the point-mass step's shape (true airspeed in) | thrust fitted to the sustained turn points, drag to the best glide (`T6A_FIT`) |
| `T6A_FIT` and the turn points (`T6A_TURN_POINTS` and its four parts) | t6a-turn-data.js | The fitted thrust and drag constants, and the sustained turn points they are fitted to, read by eye | reference data; least-squares fit |
| `T6A_LIMITS`, `stallLimitG`, `availableG` | t6-performance.js | V-n limits, stall line, G available now | reference data; stall 86 KIAS (Patrick, 30 Sep) |
| `T6A_ROLL`, `rollLimitsAtKtasT6A`, `rollWithinT6A`, `T6A_G_ONSET` | t6-performance.js | The aircraft's roll limit at a speed (0.45°/s per knot of true airspeed, capped at 120°/s, full rate in 0.3 s) and G onset (4 G/s, 16 G/s²); every module's roll and G onset stays under them | ESTIMATES, standard aerodynamics (Fable's audit 5 Oct); Patrick 5 Oct 22:01Z agreed one core limit |
| `maxKiasT6A`, `modelMaxIasT6A` | t6-performance.js | Top speed at a height (VMO 316 or Mmo 0.67): the indicator's reading, and the same limit on the model's own IAS | reference data |
| `shakerG`, `T6A_MANOEUVRE`, `splitST6A` | t6-performance.js | Pulls in the stick shaker; the split S | SMM 14.16 |

## Engine out

| Function | File | What it gives | Source |
|---|---|---|---|
| `T6A_GLIDE` | t6-performance.js | Glide speed and ratio per configuration: clean 2.0, gear down 1.5, T/O flap 1.3, landing flap 1.1 NM per 1,000 ft | reference data; SMM 13.5 para 7. T/O flap row is an estimate |
| `glideRatio(config)` | t6-performance.js | Feet flown per foot of height lost (clean about 12.2) | as `T6A_GLIDE` |
| `glideSinkFpm(config, kias, alt)` | t6-performance.js | Sink rate at any height (the reference ft/min fit only at about 16,000 ft) | as `T6A_GLIDE` |
| `glideDragPerWeight(config, kias, alt, g)` | t6-performance.js | Drag over weight power off, for the configuration down, at any speed and G: the clean drag fit scaled by the square of the glide ratio (best glide comes out at about 108 KIAS gear down, 93 landing flap; reference 105 and 95) | as `T6A_GLIDE`; the clean fit in `T6A_FIT`; the gear's extra drag (`GEAR_DRAG_FACTOR`, inside the file) an estimate from Patrick's 2,600 ft orbit (SMM 13.5 para 11) |
| `zoomT6A`, `ZOOM_GAIN_TABLE` | t6-performance.js | Height gained by the zoom after an engine failure, by speed, height and weight | reference data |
| `flyZoomT6A` | t6-performance.js | The same zoom flown on the point mass with the engine off: the cross-check, and the zoom's time and distance | aero on the model |

## Wind and navigation

| Function | File | What it gives | Source |
|---|---|---|---|
| `windTriangle(track, tas, windFrom, windKt)` | wind.js | Crab, heading and ground speed to hold a track (compass degrees). Pass the track, not the heading | aero |
| `windVectorFtps(windFrom, windKt)` | wind.js | The wind as a vector, x east and y north, the way the air moves | aero |
| `legOffsetsFt(a, b, p)` | geo.js | Distance along a leg and off it (right positive) | geometry |
| `compassDegFromVector(dx, dy)`, `wrapDeg360` | angles.js | Compass bearing of a vector; degrees into 0-360 | geometry |
| `DEG`, `RAD`, `degToRad`, `radToDeg` | angles.js | Degrees and radians, once | geometry |
| `wrapDeg180`, `wrapPi`, `angleDiffRad`, `absAngleDeg`, `headingRad` | angles.js | Angle wrapping and differences, math radians | geometry |
| `compassDegToHeadingRad`, `headingRadToCompassDeg`, `unitVectorFromCompassDeg` | angles.js | Compass degrees to code headings and back | geometry |
| `relativeBearingDeg`, `aspectAngleDeg`, `headingCrossAngleDeg`, `clockToRelativeDeg` | angles.js | Bearing off the nose, aspect, heading crossing angle, clock code | geometry |
| `aspectAngle3dDeg`, `headingCrossAngle3dDeg` | angles.js | 3-D aspect angle (from the target's tail) and heading crossing angle, from velocity vectors (SMM 16.16 para 40) | geometry |
| `closureKt`, `formatClosureKt` | flight-math.js | Closure between two aircraft, and its "+12 kt" label | geometry |
| `emPoint(before, now, after)` | flight-math.js | Where an aircraft sits on the EM chart: IAS estimate and turn rate from three moments a second apart (D39) | aero |
| `closestApproach`, `dangerGate`, `clearanceSide`, `firstEntry`, `firstEntrySampled` | closest-approach.js | Closest approach of two straight tracks (time, miss, range now); the danger test that holds until the range opens; which side to dodge; the first time two aircraft are inside a cylinder (lateral and vertical) of each other, straight or along predicted tracks (ALL-27) | geometry |
| `makeLocalRef`, `latLonToLocalFt`, `localFtToLatLon`, `distance` | geo.js | Map feet and lat/lon | flat-earth projection |
| `lonLatToTile`, `tileBounds`, `pickTileZoom`, `mercatorY`, `invMercatorY`, `lonLatToWorldPixel` | geo.js | Web Mercator map tiles and pixels | the tile scheme's published formulas |
| `decodeTerrarium`, `tilesCovering`, `createHeightStore`, `TERRAIN_URL`, `TERRAIN_CREDIT`, `TILE_PX`, `PLAUSIBLE_M` | terrain-tiles.js | Ground height from the public elevation tiles (SOF terrain, Traffic 3D ground TR-117) | the tiles' published encoding |
| `createGrid`, `fillGrid`, `stitchInner`, `sampleGrid`, `hillshade`, `zoomForTiles`, `holeFor`, `SHADE_GAIN`, `SHADE_LIMITS` | terrain-grid.js | The two-tier height grids a 3D view's real ground is drawn from, read from that store (SOF terrain, Debrief Terrain and satellite; SOF-65, DB-27). A picture only | standard bilinear sampling; hill shade sun NW 45° and `SHADE_GAIN` 4 are estimates for the look |
| `FT_PER_NM`, `KT_TO_FTPS`, `FTPS_TO_KT`, `FT_PER_M`, `M_PER_FT`, `G_FTPS2`, `SEA_LEVEL_DENSITY_SLUG_FT3`, `EARTH_RADIUS_M`, `ktToFtps`, `ftpsToKt`, `formatNm` | units.js | Unit constants and conversions, once. `SEA_LEVEL_DENSITY_SLUG_FT3` is the standard day's sea-level air density (0.0023769 slug/ft³); Traffic's `path-follower.js` still types the same number for its wing-down slip. `FTPS_TO_KT` is rounded on its own (0.592484, not 1 ÷ 1.68781); a question for Patrick | standard values |

## Formation, gunnery and time

| Function | File | What it gives | Source |
|---|---|---|---|
| `DEFAULT_STANDARDS`, `classifyDebriefPosition`, `classifyLeadParameters`, `standardsSummaryLines` | standards.js | Each wingman's position labels (TIGHT, WIDE, FORE, AFT, ON PARAMETERS) against the spread and offset standards, Lead's speed and G labels, and the panel's summary lines. Every function takes the standards; with none given, `DEFAULT_STANDARDS` | SMM 16.18 para 49, 16.41 para 109, 16.42 para 116, Gen Book p.12 (D78, D114 to D116); the lead tolerances are estimates |
| `V6_STANDARDS` | standards.js | The fixed-tolerance standards (± 250 ft of the 3/9 line), kept as test data only | not a source |
| `isLeadInCanopy(lead, wing)`, `LANE` | canopy.js | Whether Lead is in the wingman's canopy glass (seen above the cockpit floor); the overshoot lane and the gates round Lead | geometry; SMM 12.24, 12.27 para 65 and 16.20; the `LANE` distances are estimates |
| `tennisBall({...})` | tennis.js | The tennis ball: would a ball thrown off the nose now pass within the hit radius of the target? INTERCEPT, IN CONE or OUT OF CONE, with both paths | kinematics; Patrick's rulings Q33 to Q37 (D77) |
| `formatZuluSeconds`, `formatZulu`, `parseIsoSeconds`, `formatDtgZulu` | time.js | Zulu times, ISO (KML) time parsing, the Zulu date-time group | time standards |
| `formatInZone`, `zoneAbbreviation`, `utcOffsetMinutes` | time.js | Wall-clock time, zone name and UTC offset in any IANA time zone (Moose Jaw UTC-6 all year) | the browser's time-zone data |

## Flight math still inside the Traffic Sim

These live in `src/modules/traffic/` today. The refactor moves or replaces them (Traffic plan, Step 2). The full table of copies is in `pf/reset/traffic-architecture/flight-math-duplicates.md`.

| What | Where now | What happens to it |
|---|---|---|
| Indicated to true airspeed and back on today's temperature (`iasToTasKt`, `tasToIasKt`, with the day's deviation from the standard day, TR-77) | `weather.js` | Same names as core's pair; each is one line calling core's `iasToTasKt` / `tasToIasKt` with `densityRatio` (`atmosphere.js`) at the day's deviation, so there is one formula (Traffic refactor step 2) |
| Moose Jaw numbers (threshold, runway heading, field elevation, pattern and key heights, PFL circle), and where a point sits against a runway (`runwayFrameFt`: along and across the centreline; `linedUp`: within a caller's distance and angle of it) | `airfield.js` | Stays there; any number still typed elsewhere moves in by PR 5. `sim.js` and `path-follower.js` read the runway frame from it (Traffic refactor step 2) |
| The circuit, built by flying it: climb-out, crosswind at 220 KIAS, fixed downwind and base, break, perch moved so the final turn rolls out at the window | `circuit.js` (`buildCircuit`, `breakPointAlongFt`, `CIRCUIT`, `ROLL`) | New in PR 2; `generateWindAdjustedTrack` in `route.js` now calls it |
| The path follower: moves an aircraft along a built path, with heading, bank, roll and pitch from the path | `path-follower.js` (`followRoute`, `trackAt`) | New in PR 2; uses the core functions above |
| Old wind perch (old closed pattern targeting) | `route.js` (`computeWindPerch`) | The closed pattern no longer uses it (it aims at the built circuit's downwind line, `closed-pattern.js`, 4 Oct); left for the map's wind perch marker. The old break arc (`simulateBreakArc`, `computeBreakRollout`) went in Traffic refactor step 1 |
| Full-power climb toward a speed with a smooth level-off (excess thrust at the turn's G, extra speed traded for height) | `circuit.js` (`powerClimb`) | Shared by the climb to High Key (`high-key.js`), the closed pattern (`closed-pattern.js`) and the breakout (`breakout.js` `buildBreakout`) |
| PFL circle and its old height schedule | `route.js` (`generatePflTrack`), `pfl-rail.js`, `pfl-solver.js` | The PFL is rebuilt in `pfl.js` (PR 3): a simulated pilot flies it at the press on `circuit.js`'s pilot and the path follower flies the result. `pfl-rail.js` and `pfl-solver.js` removed in the PR 4 clean-up (4 Oct) |
| The 1,350 ft/min sink literal | `pfl-rail.js`, `pfl-solver.js` | Gone from `map2d.js` in PR 3 (the glide ring uses `glideRatio` and true airspeed); the old PFL files were removed in the PR 4 clean-up (4 Oct) |
| Glide speeds 125 / 120 / 100 | `flight-engine.js` | Settled in PR 3: `PFL` in `pfl-geometry.js` (in `pfl.js` until the V2.350 refactor split it) (Patrick's C1: 125 clean, 120 gear down); `flight-engine.js`'s copy went with that file (4 Oct) |
| IAS used as TAS in calm air; heading passed where track is meant | `tick-aircraft.js`, `flight-engine.js` | Fixed in `tick-aircraft.js` in PR 2; `flight-engine.js` removed 4 Oct |
| Bank laws, intercept gain, climb-arrest pitch, break deceleration | `flight-engine.js`, `tick-aircraft.js`, `high-key.js`, `breakout.js` | One guidance law in PR 2 and PR 4; the old laws in `flight-engine.js`, `tick-aircraft.js` and `breakout.js` removed 4 Oct |
| Turn rate from bank, G from bank, g = 32.174 inline | `high-key.js`, `pfl-rail.js`, `pfl-solver.js`, `flight-engine.js` | Removed with those files' rewrites (PR 2 to PR 4); `pfl-rail.js`, `pfl-solver.js`, the old High Key rail and `flight-engine.js` are gone (PR 4 clean-up, 4 Oct) |
