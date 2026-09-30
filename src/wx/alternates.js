// Alternate calls: the home-weather trigger over a wave window, and the check of
// an alternate airfield's forecast at ETA. Replaces V6's tafHazards() and its two
// alternate badges, which showed green whatever the weather (audit issue #4).

import { forecastAt } from './taf.js';
import { checkConditions, DEFAULT_LIMITS } from './limits.js';

function hitsIn(forecast, limits) {
  const pieces = [
    ...forecast.prevailing.map((p) => ({ kind: 'PREVAILING', probability: null, tempo: false, ...p })),
    ...forecast.overlays,
  ];
  const hits = [];
  let incomplete = false;
  for (const p of pieces) {
    const check = checkConditions(p.conditions, limits);
    if (p.kind === 'PREVAILING' && check.visibilityUnknown) incomplete = true;
    if (check.belowLimits) {
      hits.push({
        kind: p.kind,
        probability: p.probability,
        tempo: p.tempo,
        from: p.from,
        to: p.to,
        group: p.group,
        ceilingFt: check.ceilingFt,
        visibility: check.visibility,
        reasons: check.reasons,
      });
    }
  }
  return { hits, incomplete };
}

/**
 * Is the home forecast below the home limits at any time in the wave window
 * (takeoff to landing plus one hour, as in V6)? Prevailing conditions, BECMG
 * change periods, TEMPO and PROB all count, as in V6.
 *
 * status: 'no-taf' | 'not-covered' | 'below' | 'incomplete' | 'meets'.
 * Hits are listed whatever the status.
 */
export function homeAlternateTrigger(taf, window, limits = DEFAULT_LIMITS.home) {
  if (!taf?.validFrom) return { status: 'no-taf', covered: false, validFrom: null, validTo: null, hits: [] };
  const f = forecastAt(taf, window);
  const { hits, incomplete } = hitsIn(f, limits);
  const status = !f.covered ? 'not-covered' : hits.length ? 'below' : incomplete ? 'incomplete' : 'meets';
  return { status, covered: f.covered, validFrom: f.validFrom, validTo: f.validTo, hits };
}

/**
 * Check an alternate's forecast at the ETA against the alternate limits,
 * prevailing plus any overlay active at that time.
 *
 * For a GNSS-only alternate V6 had no rule and said so; this keeps that
 * (question WX-4): the status is 'needs-mea' without an MEA, else 'gnss-check'.
 *
 * status: 'no-taf' | 'not-covered' | 'needs-mea' | 'gnss-check' | 'below' | 'incomplete' | 'meets'.
 */
export function assessAlternate(taf, eta, { limits = DEFAULT_LIMITS.alternate, gnssOnly = false, meaFt = null } = {}) {
  const base = { gnssOnly, meaFt, eta };
  if (!taf?.validFrom) return { ...base, status: 'no-taf', covered: false, prevailing: null, overlays: [], hits: [] };
  const f = forecastAt(taf, eta);
  const { hits, incomplete } = hitsIn(f, limits);
  const result = {
    ...base,
    covered: f.covered,
    prevailing: f.prevailing.at(-1)?.conditions ?? null,
    overlays: f.overlays,
    hits,
  };
  let status;
  if (!f.covered) status = 'not-covered';
  else if (gnssOnly) status = meaFt ? 'gnss-check' : 'needs-mea';
  else if (hits.length) status = 'below';
  else if (incomplete) status = 'incomplete';
  else status = 'meets';
  return { ...result, status };
}
