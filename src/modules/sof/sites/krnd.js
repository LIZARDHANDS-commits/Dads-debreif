// The Randolph (JBSA) site profile (plan Step 2c, part B): the SOF's own data for KRND. The parts every US base shares, and their sources, are in us-base.js.
// No weather standards yet (Limits not set), no airspace yet, and no picture or report source except the WPC fronts.
import { usBase, towns } from './us-base.js';

export const KRND = usBase({
  icao: 'KRND',
  name: 'Randolph (JBSA)',
  shortName: 'Randolph',
  // The usual alternates: a guess Dad said to use for now.
  usualAlternates: ['KSAT', 'KSKF'],
  alternatesSource: 'a guess (nearby fields with an ILS) that Dad said to use for now, 7 Oct 2026; Dad to confirm',
  // [id, name, lat, lon (GeoNames, for drawing only), built-up radius NM (estimate), tallest block ft (estimate)]
  towns: towns([
    ['universal-city', 'Universal City', 29.548, -98.2911, 1.2, 40],
    ['schertz', 'Schertz', 29.5522, -98.2697, 1.8, 40],
    ['converse', 'Converse', 29.518, -98.3161, 1.2, 40],
    ['cibolo', 'Cibolo', 29.5616, -98.227, 1.3, 40],
    ['san-antonio', 'San Antonio', 29.4241, -98.4936, 8, 400],
    ['new-braunfels', 'New Braunfels', 29.703, -98.1244, 2.6, 80],
  ]),
  tourField: { icao: 'KSAT', label: 'San Antonio' },
  // 3.4° E: NOAA WMM2025 at the field for 8 Oct 2026 (3.36°), to a tenth (us-base.js).
  magVarDeg: 3.4,
});
