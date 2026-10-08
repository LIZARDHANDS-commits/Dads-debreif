// The Laughlin AFB site profile (plan Step 2c, part B): the SOF's own data for KDLF. The parts every US base shares, and their sources, are in us-base.js.
// No weather standards yet (Limits not set), no airspace yet, and no picture or report source except the WPC fronts.
import { usBase, towns } from './us-base.js';

export const KDLF = usBase({
  icao: 'KDLF',
  name: 'Laughlin AFB',
  shortName: 'Laughlin',
  // The usual alternates: Dad's.
  usualAlternates: ['KDRT', 'KSAT', 'KSJT', 'KABI', 'KLRD'],
  alternatesSource: 'Dad, 7 Oct 2026 (SOF plan Step 2c)',
  // [id, name, lat, lon (GeoNames, for drawing only), built-up radius NM (estimate), tallest block ft (estimate)]
  towns: towns([
    ['del-rio', 'Del Rio', 29.3627, -100.8968, 2.5, 100],
    ['ciudad-acuna', 'Ciudad Acuña', 29.3232, -100.9522, 3, 80],
    ['brackettville', 'Brackettville', 29.3105, -100.4179, 0.6, 30],
    ['eagle-pass', 'Eagle Pass', 28.7091, -100.4995, 2.2, 80],
    ['uvalde', 'Uvalde', 29.2097, -99.7862, 1.6, 60],
  ]),
  tourField: { icao: 'KDRT', label: 'Del Rio' },
  // 4.7° E: NOAA WMM2025 at the field for 8 Oct 2026 (4.65°), to a tenth (us-base.js).
  magVarDeg: 4.7,
});
