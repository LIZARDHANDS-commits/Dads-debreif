// Alternate calls: the home-weather trigger over a wave window, and the check of
// an alternate airfield's forecast at ETA. Replaces V6's tafHazards() and its two
// alternate badges, which showed green whatever the weather (audit issue #4).

import { forecastAt, toWindow } from './taf.js';
import { checkConditions, DEFAULT_LIMITS } from './limits.js';

const usable = (taf) => Boolean(taf?.validFrom && taf?.validTo && !taf.cancelled && !taf.nil);

function describe(p, check) {
  return {
    kind: p.kind,
    probability: p.probability,
    tempo: p.tempo,
    from: p.from,
    to: p.to,
    group: p.group,
    ceilingFt: check.ceilingFt,
    visibility: check.visibility,
    reasons: check.reasons,
  };
}

/**
 * Every piece of the forecast in the window, sorted into those below the limits
 * (hits), exactly at them (atLimit, Q27) and with dangerous weather (cautions, Q28).
 */
function hitsIn(forecast, limits) {
  const pieces = [
    ...forecast.prevailing.map((p) => ({ kind: 'PREVAILING', probability: null, tempo: false, ...p })),
    ...forecast.overlays,
  ];
  const hits = [];
  const atLimit = [];
  const cautions = [];
  let incomplete = false;
  for (const p of pieces) {
    const check = checkConditions(p.conditions, limits);
    if (p.kind === 'PREVAILING' && (check.visibilityUnknown || check.ceilingUnknown)) incomplete = true;
    if (check.belowLimits) hits.push(describe(p, check));
    else if (check.atLimit) atLimit.push(describe(p, check));
    if (check.cautions.length) cautions.push({ ...describe(p, check), cautions: check.cautions });
  }
  return { hits, atLimit, cautions, incomplete };
}

/** The status once a TAF covers the time: below, then unreadable, then at a limit. */
function coveredStatus(taf, { hits, atLimit, incomplete }) {
  if (hits.length) return 'below';
  if (incomplete || taf.problems?.length) return 'incomplete';
  return atLimit.length ? 'at-limit' : 'meets';
}

/**
 * Is the home forecast below the home limits at any time in the wave window
 * (takeoff to landing plus one hour, as in V6)? Prevailing conditions, BECMG
 * change periods, TEMPO and PROB all count, as in V6.
 *
 * status: 'no-time' | 'no-taf' | 'not-covered' | 'below' | 'incomplete' | 'at-limit' | 'meets'.
 * 'incomplete' means part of the forecast (a ceiling, a visibility, a group) could
 * not be read. 'at-limit' means nothing is below but something is exactly on a
 * limit (Q27, yellow). Hits, at-limit pieces and cautions are listed whatever the status;
 * cautions (Q28) never change the status.
 */
export function homeAlternateTrigger(taf, window, limits) {
  const w = toWindow(window);
  const empty = { covered: false, validFrom: null, validTo: null, hits: [], atLimit: [], cautions: [], problems: taf?.problems ?? [] };
  if (!w) return { ...empty, status: 'no-time' };
  if (!usable(taf)) return { ...empty, status: 'no-taf' };
  const f = forecastAt(taf, w);
  const found = hitsIn(f, limits ?? DEFAULT_LIMITS.home);
  const status = f.covered ? coveredStatus(taf, found) : 'not-covered';
  const { hits, atLimit, cautions } = found;
  return { status, covered: f.covered, validFrom: f.validFrom, validTo: f.validTo, hits, atLimit, cautions, problems: taf.problems ?? [] };
}

/**
 * Check an alternate's forecast at the ETA against the alternate limits,
 * prevailing plus any overlay active at that time.
 *
 * For a GNSS-only alternate V6 had no rule and said so; this keeps that
 * (question WX-4): the status is 'needs-mea' without an MEA, else 'gnss-check'.
 *
 * status: 'no-time' | 'no-taf' | 'not-covered' | 'needs-mea' | 'gnss-check' | 'below' | 'incomplete' | 'at-limit' | 'meets'.
 */
export function assessAlternate(taf, eta, { limits, gnssOnly = false, meaFt = null } = {}) {
  const w = toWindow(eta);
  const base = { gnssOnly, meaFt, eta: w?.from ?? null, problems: taf?.problems ?? [] };
  const empty = { ...base, covered: false, prevailing: null, overlays: [], hits: [], atLimit: [], cautions: [] };
  if (!w) return { ...empty, status: 'no-time' };
  if (!usable(taf)) return { ...empty, status: 'no-taf' };
  const f = forecastAt(taf, w);
  const found = hitsIn(f, limits ?? DEFAULT_LIMITS.alternate);
  let status;
  if (!f.covered) status = 'not-covered';
  else if (gnssOnly) status = meaFt ? 'gnss-check' : 'needs-mea';
  else status = coveredStatus(taf, found);
  return {
    ...base,
    status,
    covered: f.covered,
    prevailing: f.prevailing.at(-1)?.conditions ?? null,
    overlays: f.overlays,
    hits: found.hits,
    atLimit: found.atLimit,
    cautions: found.cautions,
  };
}
