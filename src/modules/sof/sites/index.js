// Site profiles (plan Step 2c, part A): the SOF's own data for each home base, in one place per base. `siteFor(homeIcao)` gives the profile the
// SOF reads for the current home field. Only Moose Jaw's is real so far (cymj.js); generic.js is for any field without one.
import { CYMJ } from './cymj.js';
import { GENERIC } from './generic.js';

export { CYMJ, GENERIC };
export { magVarUnknown, magVarWords, noSourceWords } from './words.js';

/**
 * The (frozen) site profile for a home field's ICAO.
 * - CYMJ: Moose Jaw's.
 * - Any other Canadian field (ICAO starting with C, such as CYQR or CYXE): Moose Jaw's too. That is what the SOF does today when home is set to
 *   one of them (same ECCC sources, NAV CANADA through the relay, same Saskatchewan airspace and towns), so nothing changes for them.
 * - Anything else: GENERIC, with no sources and `standards: null`.
 */
export function siteFor(homeIcao) {
  const icao = typeof homeIcao === 'string' ? homeIcao.trim().toUpperCase() : '';
  if (icao === 'CYMJ') return CYMJ;
  if (/^C[A-Z0-9]{3}$/.test(icao)) return CYMJ;
  return GENERIC;
}
