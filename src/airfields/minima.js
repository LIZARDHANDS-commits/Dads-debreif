// Alternate minima from the Canada Air Pilot (CAP GEN, "Operating Minima –
// Alternate"), as decided in D71 and D73, and the landing minima PROB groups
// are checked against (D72). Research: /mnt/project-files/wx-sources/canada-ifr-alternate-rules.md.
// Pure: an airfield's settings in, plain numbers out. Whether the weather meets
// them is wx's job (src/wx/alternates.js).

export const APPROACH_TYPES = Object.freeze(['not-set', 'two-precision', 'one-precision', 'non-precision', 'gnss-only', 'no-ifr']);
const VISUAL_DESCENT_VIS_SM = 3; // D80 default

// For each approach type: the standard minima (first) and their trade-offs, and
// what is added to the lowest HAT and visibility for "whichever is greater".
const NON_PRECISION = { standard: [[800, 2], [900, 1.5], [1000, 1]], addFt: 300, addSm: 1 };
const TABLE = {
  'not-set': { standard: [[600, 2]] }, // V6's single 600/2, the D71 fallback
  'two-precision': { standard: [[400, 1]], addFt: 200, addSm: 0.5 },
  'one-precision': { standard: [[600, 2], [700, 1.5], [800, 1]], addFt: 300, addSm: 1 },
  'non-precision': NON_PRECISION,
  'gnss-only': NON_PRECISION, // LNAV minima; no LPV credit, and RNAV is never precision (D73)
  'no-ifr': { standard: null }, // no table minima: the visual descent from the MEA is the whole test (D80)
};

const MAX_COMPUTED_VIS_SM = 3;
const pair = ([ceilingFt, visSm]) => ({ ceilingFt, visSm });

/** CAP GEN rounding: up to 20 ft over a hundred rounds down, anything more rounds up. */
export function roundCeilingFt(ft) {
  const hundreds = Math.floor(ft / 100) * 100;
  return ft - hundreds <= 20 ? hundreds : hundreds + 100;
}

/**
 * The alternate minima for an airfield: `options` is a list of equivalent
 * { ceilingFt, visSm } pairs (the standard minima and their trade-offs, or one
 * computed pair), in the shape wx's assessAlternate takes. `checked` is false
 * while the approach type is not set. A no-IFR-approach field has no options
 * (null); see visualDescent().
 * @param {{ approach?: string, lowestHatFt?: number | null, lowestVisSm?: number | null }} [field]
 */
export function alternateMinima({ approach, lowestHatFt, lowestVisSm } = {}) {
  const type = Object.hasOwn(TABLE, approach) ? approach : 'not-set';
  const row = TABLE[type];
  if (!row.standard) return { approach: type, checked: true, options: null };
  const [baseFt, baseSm] = row.standard[0];
  let ceilingFt = baseFt;
  let visSm = baseSm;
  if (row.addFt != null) {
    if (Number.isFinite(lowestHatFt)) ceilingFt = Math.max(baseFt, roundCeilingFt(lowestHatFt + row.addFt));
    if (Number.isFinite(lowestVisSm)) visSm = Math.max(baseSm, Math.min(MAX_COMPUTED_VIS_SM, lowestVisSm + row.addSm));
  }
  // Trade-offs apply only to the standard minima.
  const options = ceilingFt === baseFt && visSm === baseSm ? row.standard.map(pair) : [{ ceilingFt, visSm }];
  return { approach: type, checked: type !== 'not-set', options };
}

/**
 * The landing minima PROB groups are checked against: the lowest HAT and its visibility, or null.
 * @param {{ lowestHatFt?: number | null, lowestVisSm?: number | null }} [field]
 */
export function landingMinima({ lowestHatFt, lowestVisSm } = {}) {
  if (!Number.isFinite(lowestHatFt) || !Number.isFinite(lowestVisSm)) return null;
  return { ceilingFt: lowestHatFt, visSm: lowestVisSm };
}

/**
 * The visual descent from the MEA (D80), as wx's assessAlternate takes it:
 * { meaFt, elevationFt, visSm }. A GNSS-only field uses it once an MEA is
 * entered; a no-IFR-approach field always does, so a missing MEA or elevation
 * reads as incomplete in wx rather than falling back to 600-2. Null otherwise.
 * @param {{ approach?: string, meaFt?: number | null, elevationFt?: number | null, visualDescentVisSm?: number | null }} [field]
 */
export function visualDescent({ approach, meaFt, elevationFt, visualDescentVisSm } = {}) {
  const hasMea = Number.isFinite(meaFt);
  if (approach !== 'no-ifr' && !(approach === 'gnss-only' && hasMea)) return null;
  return {
    meaFt: hasMea ? meaFt : null,
    elevationFt: Number.isFinite(elevationFt) ? elevationFt : null,
    visSm: Number.isFinite(visualDescentVisSm) ? visualDescentVisSm : VISUAL_DESCENT_VIS_SM,
  };
}
