// Limit checks and classifications. Thresholds and the "strictly below" rule are
// V6's (SPEC-wx, "Limit checks"); at-limit (Q27) and cautions (Q28) are Patrick's answers.

import { ceilingFt, ceilingUnknown, formatVisibility, isCeilingLayer, METRES_PER_SM } from './conditions.js';

/** V6's WX SETUP defaults (sof.html line 180). The SOF passes the user's settings instead. */
export const DEFAULT_LIMITS = Object.freeze({
  home: Object.freeze({ ceilingFt: 2000, visSm: 3 }),
  alternate: Object.freeze({ ceilingFt: 600, visSm: 2 }),
});

/**
 * The home "alternate needed" trigger choices (Q4, D111, Gen Book p.7): an alternate is
 * required below 3000 ft / 3 SM, or below 2000 ft / 3 SM when staying within the MTCA.
 * Local is the default and equals DEFAULT_LIMITS.home. The SOF labels the setting from these.
 */
export const HOME_TRIGGERS = Object.freeze({
  local: Object.freeze({ label: 'Local (MTCA) 2000/3', ceilingFt: 2000, visSm: 3 }),
  crossCountry: Object.freeze({ label: 'Cross-country 3000/3', ceilingFt: 3000, visSm: 3 }),
});

// "Less than" visibility counts at or below its number; "more than" only below it.
function belowWithQualifier(value, qualifier, limit) {
  return qualifier === 'less' ? value <= limit : value < limit;
}

function atOrBelowWithQualifier(value, qualifier, limit) {
  return qualifier === 'more' ? value < limit : value <= limit;
}

/**
 * True when the visibility is strictly below `limitSm`, null when it is unknown.
 * For limits up to 6 SM this matches V6, which used 0.24 for M1/4SM and 6.01 for P6SM.
 */
export function visibilityBelow(vis, limitSm) {
  if (!vis) return null;
  return belowWithQualifier(vis.sm, vis.qualifier, limitSm);
}

/**
 * True when a plain visibility is exactly on `limitSm` (Q27: yellow), null when
 * it is unknown. "Less than" at the limit is below it; "more than" is above it.
 */
export function visibilityAtLimit(vis, limitSm) {
  if (!vis) return null;
  return vis.qualifier == null && vis.sm === limitSm;
}

/**
 * Weather codes that raise a caution the SOF must acknowledge (Q28), at the
 * station or in the vicinity (VC). Listed in SPEC-wx, "Cautions".
 * Descriptors: TS thunderstorm. Freezing precipitation and fog are FZ with RA, DZ or FG.
 * Phenomena: FC funnel cloud or tornado (+FC), SQ squall, GR hail, GS small hail,
 * PL ice pellets, VA volcanic ash, SS sandstorm, DS duststorm, PO dust devils.
 * Also raised: plain FG (not MI, BC or PR), BLSN, and CB or TCU on any cloud layer.
 */
export const DANGEROUS_WEATHER = Object.freeze(['TS', 'FC', 'SQ', 'GR', 'GS', 'PL', 'VA', 'SS', 'DS', 'PO', 'FZRA', 'FZDZ', 'FZFG']);

const has = (w, p) => w.phenomena.includes(p);
const isThunderstorm = (w) => w.descriptor === 'TS' || has(w, 'FC') || has(w, 'SQ');
const isSignificant = (w) =>
  (w.descriptor === 'FZ' && (has(w, 'RA') || has(w, 'DZ'))) ||
  ['PL', 'GR', 'GS', 'VA', 'SS', 'DS', 'PO'].some((p) => has(w, p)) ||
  (w.descriptor === 'BL' && has(w, 'SN')) ||
  (w.intensity !== 'VC' && has(w, 'FG') && (w.descriptor === null || w.descriptor === 'FZ'));

/**
 * Check conditions against { ceilingFt, visSm }. An unknown ceiling or
 * visibility is reported as unknown, never as within limits.
 *
 * belowLimits: ceiling or visibility strictly below its limit (red; the alternate trigger).
 * atLimit: not below, and ceiling or plain visibility exactly on its limit (Q27: yellow).
 * cautions: dangerous weather and CB/TCU layers the SOF must acknowledge (Q28).
 * alert: belowLimits or any caution.
 * watch: information only (Q28): other vicinity weather, snow, shallow or patchy fog.
 * level: 'below' | 'caution' | 'unknown' | 'at-limit' | 'within', worst first.
 */
export function checkConditions(conditions, limits) {
  const ceiling = ceilingFt(conditions);
  const vis = conditions?.visibility ?? null;
  const weather = conditions?.weather ?? [];
  const ceilingBelow = ceiling != null && ceiling < limits.ceilingFt;
  const unknownCeiling = ceilingUnknown(conditions);
  const visBelow = visibilityBelow(vis, limits.visSm) === true;
  const ceilingAtLimit = ceiling != null && ceiling === limits.ceilingFt;
  const visAtLimit = visibilityAtLimit(vis, limits.visSm) === true;

  const thunderstormItems = weather.filter(isThunderstorm);
  const significantItems = weather.filter(isSignificant);
  const convectiveItems = (conditions?.sky ?? []).filter((l) => l.type);
  const thunderstorm = thunderstormItems.map((w) => w.raw);
  const significant = significantItems.map((w) => w.raw);
  const convectiveCloud = convectiveItems.map((l) => l.raw);
  const cautions = [...new Set([...thunderstorm, ...significant, ...convectiveCloud])];
  const watch = {
    vicinity: weather
      .filter((w) => w.intensity === 'VC' && !isThunderstorm(w) && !isSignificant(w))
      .map((w) => w.raw),
    snow: weather.filter((w) => w.intensity !== 'VC' && has(w, 'SN') && w.descriptor !== 'BL').map((w) => w.raw),
    shallowFog: weather
      .filter((w) => w.intensity !== 'VC' && has(w, 'FG') && ['MI', 'BC', 'PR'].includes(w.descriptor))
      .map((w) => w.raw),
  };

  const belowLimits = ceilingBelow || visBelow;
  const atLimit = !belowLimits && (ceilingAtLimit || visAtLimit);

  // reasonSpans[k]: where in the raw text the words behind reasons[k] are (SOF banner).
  const reasons = [];
  const reasonSpans = [];
  const reason = (text, items) => {
    reasons.push(text);
    reasonSpans.push(items.map((x) => x?.span).filter(Boolean));
  };
  const ceilingLayer = (conditions?.sky ?? []).find((l) => isCeilingLayer(l) && l.baseFt === ceiling);
  if (ceilingBelow) reason(`CEILING ${ceiling} FT < ${limits.ceilingFt} FT`, [ceilingLayer]);
  else if (ceilingAtLimit) reason(`CEILING ${ceiling} FT AT LIMIT ${limits.ceilingFt} FT`, [ceilingLayer]);
  if (visBelow) reason(`VIS ${formatVisibility(vis)} < ${limits.visSm} SM`, [vis]);
  else if (visAtLimit) reason(`VIS ${formatVisibility(vis)} AT LIMIT ${limits.visSm} SM`, [vis]);
  if (thunderstorm.length) reason(`THUNDERSTORM / SEVERE WX (${thunderstorm.join(' ')})`, thunderstormItems);
  if (significant.length) reason(`SIGNIFICANT WX (${significant.join(' ')})`, significantItems);
  if (convectiveCloud.length) reason(`CB/TCU (${convectiveCloud.join(' ')})`, convectiveItems);

  let level = 'within';
  if (belowLimits) level = 'below';
  else if (cautions.length) level = 'caution';
  else if (!vis || unknownCeiling) level = 'unknown';
  else if (atLimit) level = 'at-limit';

  return {
    ceilingFt: ceiling,
    visibility: vis,
    visibilityUnknown: !vis,
    ceilingUnknown: unknownCeiling,
    ceilingBelow,
    visibilityBelow: visBelow,
    belowLimits,
    ceilingAtLimit,
    visibilityAtLimit: visAtLimit,
    atLimit,
    thunderstorm,
    significant,
    convectiveCloud,
    cautions,
    alert: belowLimits || cautions.length > 0,
    watch,
    level,
    reasons,
    reasonSpans,
  };
}

/** No cloud group and no SKC/CLR/NSC/NCD/CAVOK: the cloud is not stated, so it isn't known (WX-5). */
const noSkyGroup = (conditions) => !conditions?.sky?.length && !conditions?.skyClear;

/** @type {Array<[string, number, number]>} */
const NATO = [
  // [colour, cloud base below (ft), visibility below (m)]; V6 nato(), sof.html line 2009.
  ['RED', 200, 800],
  ['AMB', 300, 1600],
  ['YLO2', 500, 2500],
  ['YLO1', 700, 3700],
  ['GRN', 1500, 5000],
  ['WHT', 2500, 8000],
];

/**
 * NATO colour state from the lowest SCT-or-thicker layer and the visibility in
 * metres. 'UNK' when a layer's base is unknown and the colour isn't already RED.
 */
export function natoColour(conditions) {
  const layers = (conditions?.sky ?? []).filter((l) => l.cover !== 'FEW');
  const bases = layers.filter((l) => l.baseFt != null).map((l) => l.baseFt);
  const base = bases.length ? Math.min(...bases) : Infinity;
  const vis = conditions?.visibility;
  const metres = vis ? (vis.metres ?? vis.sm * METRES_PER_SM) : Infinity;
  const found = NATO.find(([, ft, m]) => base < ft || (vis && belowWithQualifier(metres, vis.qualifier, m)));
  const colour = found ? found[0] : 'BLU';
  const unknownBase = layers.some((l) => l.baseFt == null) || noSkyGroup(conditions) || !vis;
  return unknownBase && colour !== 'RED' ? 'UNK' : colour;
}

/**
 * VFR / MVFR / IFR / LIFR, for when the feed gives none (V6 cat(), sof.html line 576).
 * 'UNK' when neither ceiling nor visibility is known, or when a cloud base is
 * unknown and the category isn't already LIFR.
 */
export function flightCategory(conditions) {
  const c = ceilingFt(conditions);
  const vis = conditions?.visibility;
  const visLt = (n) => vis != null && belowWithQualifier(vis.sm, vis.qualifier, n);
  const visLe = (n) => vis != null && atOrBelowWithQualifier(vis.sm, vis.qualifier, n);
  let category = 'VFR';
  if ((c != null && c < 500) || visLt(1)) category = 'LIFR';
  else if ((c != null && c < 1000) || visLt(3)) category = 'IFR';
  else if ((c != null && c <= 3000) || visLe(5)) category = 'MVFR';
  const unknownBase = (conditions?.sky ?? []).some((l) => l.cover !== 'FEW' && l.cover !== 'SCT' && l.baseFt == null);
  if (category === 'LIFR') return category;
  if (!vis || unknownBase || noSkyGroup(conditions)) return 'UNK';
  return category;
}
