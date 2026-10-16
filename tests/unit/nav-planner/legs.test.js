// Checks: a known two-leg route flown in a typed wind gives the tracks, headings, ground speeds and times a pilot works out with standard
//   navigation: 20 NM due north then 15 NM due east, 240 KIAS at 2,500 ft MSL, wind 270°T at 30 kt.
// Serves: NP-R2 (docs/modules/nav-planner/requirements.md).
// Expected values: standard navigation and standard aerodynamics, worked out here: one minute of latitude is one nautical mile and one
//   minute of longitude is cos(latitude) NM; the ICAO standard atmosphere's density ratio below 11 km, (1 − 6.8756e-6 h)^4.2559, for true
//   airspeed = IAS ÷ √σ; the wind triangle (a wind square to the track: crab = asin(W ÷ TAS), ground speed = √(TAS² − W²); a tailwind adds);
//   Moose Jaw's variation 9° E (Patrick's ruling, TR-65). Never the planner's own output.
// Margins: the shared table (tests/helpers/tolerances.js): ±5° on tracks and headings, ±10 kt on speeds, ±100 ft on distances (the planner's
//   Earth radius makes a minute of arc 0.07 % longer than a nautical mile, about 80 ft on 20 NM); ±5 % on times, the shared table's percentage,
//   because a leg time follows from the ground speed's margin.
import test from 'node:test';
import { computeLegs } from '../../../src/modules/nav-planner/legs.js';
import { TOLERANCES, assertNear } from '../../helpers/tolerances.js';

const FT_PER_NM = 6076.12;
/** How far compass direction a is from b, −180 to 180, so 359° and 001° are 2° apart. */
const off = (a, b) => ((a - b + 540) % 360) - 180;

test('a two-leg route in a typed wind gives the tracks, headings, ground speeds and times of standard navigation', () => {
  const lat0 = 50;
  const lon0 = -105.5;
  const latB = lat0 + 20 / 60; // 20 NM north: 20 minutes of latitude
  const lonC = lon0 + 15 / (60 * Math.cos((latB * Math.PI) / 180)); // 15 NM east along the parallel
  const leg = { heightFt: 2500, heightRef: 'MSL', kias: 240 };
  const points = [
    { name: 'A', lat: lat0, lon: lon0, ...leg },
    { name: 'B', lat: latB, lon: lon0, ...leg },
    { name: 'C', lat: latB, lon: lonC, ...leg },
  ];
  const wind = { fromDegT: 270, kt: 30 };
  const { legs, totals } = computeLegs(points, { startFuelLb: 1100, fuelFlowPph: 500, minClearanceFt: 500, windFor: () => wind });

  // Standard atmosphere at 2,500 ft and the true airspeed.
  const sigma = (1 - 6.8756e-6 * 2500) ** 4.2559;
  const tas = 240 / Math.sqrt(sigma); // about 249 KTAS
  // Leg 1, track 000°T: the wind from 270 is square to it from the left. Leg 2, track 090°T: a straight tailwind.
  const crab = (Math.asin(30 / tas) * 180) / Math.PI; // about 7° left, into the wind
  const gs1 = Math.sqrt(tas ** 2 - 30 ** 2);
  const gs2 = tas + 30;
  const variation = 9; // °E, TR-65: magnetic = true − 9

  assertNear(off(legs[0].trackDegT, 0), 0, TOLERANCES.ANGLE_DEG, 'leg 1 tracks north');
  assertNear(off(legs[1].trackDegT, 90), 0, TOLERANCES.ANGLE_DEG, 'leg 2 tracks east');
  assertNear(off(legs[0].trackDegM, 360 - variation), 0, TOLERANCES.ANGLE_DEG, 'leg 1 magnetic track 351');
  assertNear(off(legs[1].trackDegM, 90 - variation), 0, TOLERANCES.ANGLE_DEG, 'leg 2 magnetic track 081');
  assertNear(off(legs[0].headingDegM, 360 - crab - variation), 0, TOLERANCES.ANGLE_DEG, 'leg 1 heading: crabbed left into the wind');
  assertNear(off(legs[1].headingDegM, 90 - variation), 0, TOLERANCES.ANGLE_DEG, 'leg 2 heading: no crab in a tailwind');

  assertNear(legs[0].distNm * FT_PER_NM, 20 * FT_PER_NM, TOLERANCES.DISTANCE_FT, 'leg 1 is 20 NM');
  assertNear(legs[1].distNm * FT_PER_NM, 15 * FT_PER_NM, TOLERANCES.DISTANCE_FT, 'leg 2 is 15 NM');
  assertNear(legs[0].tasKt, tas, TOLERANCES.AIRSPEED_KT, 'true airspeed at 2,500 ft');
  assertNear(legs[0].gsKt, gs1, TOLERANCES.AIRSPEED_KT, 'leg 1 ground speed in the crosswind');
  assertNear(legs[1].gsKt, gs2, TOLERANCES.AIRSPEED_KT, 'leg 2 ground speed with the tailwind');

  const t1 = (20 / gs1) * 3600; // about 4 min 51 s
  const t2 = (15 / gs2) * 3600; // about 3 min 14 s
  assertNear(legs[0].timeS, t1, t1 * TOLERANCES.PERCENT, 'leg 1 time');
  assertNear(legs[1].timeS, t2, t2 * TOLERANCES.PERCENT, 'leg 2 time');
  assertNear(totals.timeS, t1 + t2, (t1 + t2) * TOLERANCES.PERCENT, 'running time at C');
});
