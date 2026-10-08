// The NAS Corpus Christi site profile (plan Step 2c, part B): the SOF's own data for KNGP. The parts every US base shares, and their sources, are in us-base.js.
// No weather standards yet (Limits not set), no airspace yet, and no picture or report source except the WPC fronts.
import { usBase, towns } from './us-base.js';

export const KNGP = usBase({
  icao: 'KNGP',
  name: 'NAS Corpus Christi',
  shortName: 'Corpus Christi',
  // The usual alternates: a guess Dad said to use for now.
  usualAlternates: ['KCRP', 'KNQI'],
  alternatesSource: 'a guess (nearby fields with an ILS) that Dad said to use for now, 7 Oct 2026; Dad to confirm',
  // [id, name, lat, lon (GeoNames, for drawing only), built-up radius NM (estimate), tallest block ft (estimate)]
  towns: towns([
    ['corpus-christi', 'Corpus Christi', 27.8006, -97.3964, 5, 300],
    ['portland', 'Portland', 27.8773, -97.3239, 1.5, 40],
    ['port-aransas', 'Port Aransas', 27.8339, -97.0611, 1, 50],
    ['robstown', 'Robstown', 27.7903, -97.6689, 1, 30],
    ['kingsville', 'Kingsville', 27.5159, -97.8561, 1.8, 60],
  ]),
  tourField: { icao: 'KCRP', label: 'Corpus Christi Intl' },
  // 2.8° E: NOAA WMM2025 at the field for 8 Oct 2026 (2.82°), to a tenth (us-base.js).
  magVarDeg: 2.8,
});
