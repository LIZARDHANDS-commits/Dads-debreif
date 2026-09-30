// Limit checks and classifications. Thresholds and the "strictly below" rule are
// V6's (SPEC-wx, "Limit checks"); only V6's parsing bugs are fixed.

import { ceilingFt, ceilingUnknown, formatVisibility, METRES_PER_SM } from './conditions.js';

/** V6's WX SETUP defaults (sof.html line 180). The SOF passes the user's settings instead. */
export const DEFAULT_LIMITS = Object.freeze({
  home: Object.freeze({ ceilingFt: 2000, visSm: 3 }),
  alternate: Object.freeze({ ceilingFt: 600, visSm: 2 }),
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

const isStation = (w) => w.intensity !== 'VC';
const has = (w, p) => w.phenomena.includes(p);

/**
 * Check conditions against { ceilingFt, visSm }. An unknown ceiling or
 * visibility is reported as unknown, never as within limits.
 * belowLimits: ceiling or visibility strictly below the limit (the alternate trigger).
 * alert: belowLimits, or thunderstorm/severe or significant weather (V6's card alerts).
 * watch: reported but not raised as a caution until question WX-2 is answered.
 */
export function checkConditions(conditions, limits) {
  const ceiling = ceilingFt(conditions);
  const vis = conditions?.visibility ?? null;
  const weather = conditions?.weather ?? [];
  const ceilingBelow = ceiling != null && ceiling < limits.ceilingFt;
  const unknownCeiling = ceilingUnknown(conditions);
  const visBelow = visibilityBelow(vis, limits.visSm) === true;

  const thunderstorm = weather
    .filter((w) => isStation(w) && (w.descriptor === 'TS' || has(w, 'FC') || has(w, 'SQ')))
    .map((w) => w.raw);
  const significant = weather
    .filter((w) =>
      isStation(w) && (
        (w.descriptor === 'FZ' && (has(w, 'RA') || has(w, 'DZ'))) ||
        has(w, 'PL') || has(w, 'GR') || has(w, 'GS') ||
        (w.descriptor === 'BL' && has(w, 'SN')) ||
        (has(w, 'FG') && (w.descriptor === null || w.descriptor === 'FZ'))))
    .map((w) => w.raw);
  const watch = {
    vicinity: weather.filter((w) => w.intensity === 'VC').map((w) => w.raw),
    convectiveCloud: (conditions?.sky ?? []).filter((l) => l.type).map((l) => l.raw),
    snow: weather.filter((w) => isStation(w) && has(w, 'SN') && w.descriptor !== 'BL').map((w) => w.raw),
    shallowFog: weather
      .filter((w) => isStation(w) && has(w, 'FG') && ['MI', 'BC', 'PR'].includes(w.descriptor))
      .map((w) => w.raw),
  };

  const reasons = [];
  if (ceilingBelow) reasons.push(`CEILING ${ceiling} FT < ${limits.ceilingFt} FT`);
  if (visBelow) reasons.push(`VIS ${formatVisibility(vis)} < ${limits.visSm} SM`);
  if (thunderstorm.length) reasons.push(`THUNDERSTORM / SEVERE WX (${thunderstorm.join(' ')})`);
  if (significant.length) reasons.push(`SIGNIFICANT WX (${significant.join(' ')})`);

  const belowLimits = ceilingBelow || visBelow;
  return {
    ceilingFt: ceiling,
    visibility: vis,
    visibilityUnknown: !vis,
    ceilingUnknown: unknownCeiling,
    ceilingBelow,
    visibilityBelow: visBelow,
    belowLimits,
    thunderstorm,
    significant,
    alert: belowLimits || thunderstorm.length > 0 || significant.length > 0,
    watch,
    reasons,
  };
}

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
  const unknownBase = layers.some((l) => l.baseFt == null);
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
  if ((c == null && !vis) || unknownBase) return 'UNK';
  return category;
}
