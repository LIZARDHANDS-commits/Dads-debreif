// The Columbus AFB site profile (plan Step 2c, part B): the SOF's own data for KCBM. The parts every US base shares, and their sources, are in us-base.js.
// No weather standards yet (Limits not set), no airspace yet, and no picture or report source except the WPC fronts.
import { usBase, towns } from './us-base.js';

export const KCBM = usBase({
  icao: 'KCBM',
  name: 'Columbus AFB',
  shortName: 'Columbus',
  // The usual alternates: a guess Dad said to use for now.
  usualAlternates: ['KGTR', 'KBHM'],
  alternatesSource: 'a guess (nearby fields with an ILS) that Dad said to use for now, 7 Oct 2026; Dad to confirm',
  // [id, name, lat, lon (GeoNames, for drawing only), built-up radius NM (estimate), tallest block ft (estimate)]
  towns: towns([
    ['columbus', 'Columbus', 33.4957, -88.4273, 2.2, 100],
    ['caledonia', 'Caledonia', 33.6829, -88.3245, 0.5, 30],
    ['west-point', 'West Point', 33.6076, -88.6503, 1.2, 40],
    ['aberdeen', 'Aberdeen', 33.8251, -88.5437, 1, 40],
    ['starkville', 'Starkville', 33.4505, -88.8196, 2, 100],
  ]),
  tourField: { icao: 'KGTR', label: 'Golden Triangle' },
  // 2.9° W: NOAA WMM2025 at the field for 8 Oct 2026 (-2.91°), to a tenth (us-base.js).
  magVarDeg: -2.9,
});
