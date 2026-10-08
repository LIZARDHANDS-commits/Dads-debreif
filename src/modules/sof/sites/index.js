// Site profiles (plan Step 2c): the SOF's own data for each home base, in one place per base. `siteFor(homeIcao)` gives the profile the SOF reads
// for the current home field. Moose Jaw's is cymj.js; the seven US T-6 bases (part B) are kdlf.js ... kngp.js, and San Angelo (Dad, 8 Oct 2026) ksjt.js,
// all built on us-base.js; generic.js is for any field without one.
import { CYMJ } from './cymj.js';
import { GENERIC } from './generic.js';
import { KDLF } from './kdlf.js';
import { KEND } from './kend.js';
import { KRND } from './krnd.js';
import { KCBM } from './kcbm.js';
import { KSPS } from './ksps.js';
import { KNSE } from './knse.js';
import { KNGP } from './kngp.js';
import { KSJT } from './ksjt.js';

export { CYMJ, GENERIC, KDLF, KEND, KRND, KCBM, KSPS, KNSE, KNGP, KSJT };
export { magVarUnknown, magVarWords, noSourceWords } from './words.js';

/** Every base with its own profile, in the order the Home base choice lists them: Moose Jaw (the default) first, then the US bases (San Angelo last, added 8 Oct). */
export const PROFILES = Object.freeze([CYMJ, KDLF, KEND, KRND, KCBM, KSPS, KNSE, KNGP, KSJT]);

const BY_ICAO = new Map(PROFILES.map((p) => [p.icao, p]));

/**
 * The (frozen) site profile for a home field's ICAO.
 * - CYMJ and the US bases in PROFILES: their own.
 * - Any other Canadian field (ICAO starting with C, such as CYQR or CYXE): Moose Jaw's too. That is what the SOF does today when home is set to
 *   one of them (same ECCC sources, NAV CANADA through the relay, same Saskatchewan airspace and towns), so nothing changes for them.
 * - Anything else: GENERIC, with no sources and `standards: null`.
 */
export function siteFor(homeIcao) {
  const icao = typeof homeIcao === 'string' ? homeIcao.trim().toUpperCase() : '';
  const own = BY_ICAO.get(icao);
  if (own) return own;
  if (/^C[A-Z0-9]{3}$/.test(icao)) return CYMJ;
  return GENERIC;
}

/** True when the field has a profile of its own (one of PROFILES), not a borrowed or generic one. */
export const hasOwnProfile = (homeIcao) => BY_ICAO.has(typeof homeIcao === 'string' ? homeIcao.trim().toUpperCase() : '');
