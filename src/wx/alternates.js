// Alternate calls: the home-weather trigger over a wave window, and the check of
// an alternate airfield's forecast over an arrival window. Replaces V6's
// tafHazards() and its two alternate badges, which showed green whatever the
// weather (audit issue #4). The alternate rules are Canada's (CAP GEN, TC AIM
// RAC 3.13) with Patrick's window (Q30, D60); see SPEC-wx, "Alternates".

import { forecastAt, toWindow } from './taf.js';
import { checkConditions, DEFAULT_LIMITS } from './limits.js';
import { toDate, MINUTE_MS } from './dates.js';

const usable = (taf) => Boolean(taf?.validFrom && taf?.validTo && !taf.cancelled && !taf.nil);

/** Satellite approaches at home and at the alternate must be this far apart (CAP GEN). */
export const GNSS_SEPARATION_NM = 100;

/** A GNSS-only visual descent needs the ceiling this far above the MEA (D80). */
export const VISUAL_DESCENT_MARGIN_FT = 500;
const VISUAL_DESCENT_VIS_SM = 3;

/**
 * Minima for a GNSS-only visual descent (D80): ceiling at least MEA + 500 ft,
 * converted from above sea level to above the field, and visSm (default 3 SM).
 * Null when the MEA or the field elevation can't be read.
 */
export function visualDescentMinima({ meaFt, elevationFt, visSm = VISUAL_DESCENT_VIS_SM } = {}) {
  if (!Number.isFinite(meaFt) || !Number.isFinite(elevationFt)) return null;
  const vis = Number.isFinite(visSm) && visSm > 0 ? visSm : VISUAL_DESCENT_VIS_SM;
  return [{ ceilingFt: meaFt + VISUAL_DESCENT_MARGIN_FT - elevationFt, visSm: vis }];
}

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

const isLimit = (m) => m != null && Number.isFinite(m.ceilingFt) && Number.isFinite(m.visSm);

/** One `{ ceilingFt, visSm }` or a list of equivalent options; null when none is usable. */
function toOptions(minima) {
  const list = (Array.isArray(minima) ? minima : [minima]).filter(isLimit);
  return list.length ? list : null;
}

/**
 * Check conditions against equivalent minima options (one `{ ceilingFt, visSm }`
 * or a list): below only when below every option, at-limit when the best option
 * is exactly met. Reasons come from the option that decides: the first one met,
 * else the first one. Null when no option is usable.
 */
export function checkOptions(conditions, minima) {
  const options = toOptions(minima);
  if (!options) return null;
  const checks = options.map((m) => checkConditions(conditions, m));
  return checks.find((c) => !c.belowLimits && !c.atLimit) ?? checks.find((c) => !c.belowLimits) ?? checks[0];
}

/**
 * Every piece of the forecast in the window, sorted into those below the limits
 * (hits), exactly at them (atLimit, Q27) and with dangerous weather (cautions, Q28).
 * `optionsFor(piece)` gives the minima to use for a piece, or null to skip the
 * limit test for it (the piece is then returned in `unchecked` if it is below `fallback`).
 */
function hitsIn(forecast, optionsFor, fallback) {
  const pieces = [
    ...forecast.prevailing.map((p) => ({ kind: 'PREVAILING', probability: null, tempo: false, ...p })),
    ...forecast.overlays,
  ];
  const hits = [];
  const atLimit = [];
  const cautions = [];
  const unchecked = [];
  let incomplete = false;
  for (const p of pieces) {
    const options = optionsFor(p);
    const check = checkOptions(p.conditions, options ?? fallback);
    if (p.kind === 'PREVAILING' && (check.visibilityUnknown || check.ceilingUnknown)) incomplete = true;
    if (!options) {
      if (check.belowLimits) unchecked.push(describe(p, check));
    } else if (check.belowLimits) hits.push(describe(p, check));
    else if (check.atLimit) atLimit.push(describe(p, check));
    if (check.cautions.length) cautions.push({ ...describe(p, check), cautions: check.cautions });
  }
  return { hits, atLimit, cautions, unchecked, incomplete };
}

/** The status once a TAF covers the time: below, then unreadable, then at a limit. */
function coveredStatus(taf, { hits, atLimit, incomplete }) {
  if (hits.length) return 'below';
  if (incomplete || taf.problems?.length) return 'incomplete';
  return atLimit.length ? 'at-limit' : 'meets';
}

const byTime = (a, b) => +a.from - +b.from;

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
  const options = toOptions(limits) ?? [DEFAULT_LIMITS.home];
  const found = hitsIn(f, () => options, options);
  const status = f.covered ? coveredStatus(taf, found) : 'not-covered';
  const { hits, atLimit, cautions } = found;
  return { status, covered: f.covered, validFrom: f.validFrom, validTo: f.validTo, hits, atLimit, cautions, problems: taf.problems ?? [] };
}

/**
 * The window to check alternates over (D60): the earliest ETA minus `marginMin`
 * to the latest ETA plus `marginMin`. Takes one ETA or a list; unreadable ETAs
 * are skipped. Null when none can be read.
 */
export function arrivalWindow(etas, { marginMin = 60 } = {}) {
  const times = (Array.isArray(etas) ? etas : [etas]).map(toDate).filter(Boolean).map(Number);
  if (!times.length) return null;
  const margin = (Number.isFinite(marginMin) && marginMin > 0 ? marginMin : 0) * MINUTE_MS;
  return { from: new Date(Math.min(...times) - margin), to: new Date(Math.max(...times) + margin) };
}

/**
 * Check an alternate's forecast over an arrival window (or at one ETA) against
 * that airfield's alternate minima (CAP GEN, D60).
 *
 * - `minima`: `{ ceilingFt, visSm }` or a list of equivalent options (600-2,
 *   700-1.5, 800-1); a piece passes when it meets any option. V6's 600/2 when missing.
 * - Prevailing, FM, BECMG and TEMPO pieces are checked against the alternate
 *   minima; PROB pieces against `landingMinima`. Without landing minima a PROB
 *   below the alternate minima is listed in `probUnchecked` and leaves the status alone.
 * - `visualDescent: { meaFt, elevationFt, visSm = 3 }` for an alternate reached by a
 *   GNSS-only visual descent (D80): the ceiling must be at least MEA + 500 ft above
 *   sea level and the visibility at least visSm, in place of `minima`. Without a
 *   readable MEA and field elevation the status is 'incomplete'.
 * - `gnssApproach`, `homeGnssApproach`, `distanceNm`: when both rely on a satellite
 *   approach and are under 100 NM apart (or the distance is unknown), `warnings` says so.
 *
 * status: 'no-time' | 'no-taf' | 'not-covered' | 'below' | 'incomplete' | 'at-limit' | 'meets'.
 * `worst` is the earliest hit, else the earliest at-limit piece, else null.
 */
export function assessAlternate(taf, when, { minima, landingMinima, visualDescent, gnssApproach = false, homeGnssApproach = false, distanceNm = null } = {}) {
  const w = toWindow(when);
  const warnings = [];
  if (gnssApproach && homeGnssApproach) {
    if (!Number.isFinite(distanceNm)) warnings.push(`GNSS APPROACH AT HOME AND ALTERNATE: distance unknown, must be ${GNSS_SEPARATION_NM} NM or more`);
    else if (distanceNm < GNSS_SEPARATION_NM) warnings.push(`GNSS APPROACH AT HOME AND ALTERNATE ${Math.round(distanceNm)} NM APART, LESS THAN ${GNSS_SEPARATION_NM} NM`);
  }
  const descent = visualDescent ? visualDescentMinima(visualDescent) : null;
  const problems = [...(taf?.problems ?? [])];
  if (visualDescent && !descent) problems.push('Visual descent needs the MEA and the field elevation');
  const base = { from: w?.from ?? null, to: w?.to ?? null, warnings, problems };
  const empty = { ...base, covered: false, prevailing: null, overlays: [], hits: [], atLimit: [], cautions: [], probUnchecked: [], worst: null };
  if (!w) return { ...empty, status: 'no-time' };
  if (!usable(taf)) return { ...empty, status: 'no-taf' };
  const f = forecastAt(taf, w);
  const alternate = descent ?? toOptions(minima) ?? [DEFAULT_LIMITS.alternate];
  const landing = toOptions(landingMinima);
  const found = hitsIn(f, (p) => (p.kind === 'PROB' ? landing : alternate), alternate);
  const status = f.covered ? coveredStatus({ problems }, found) : 'not-covered';
  const worst = [...found.hits].sort(byTime)[0] ?? [...found.atLimit].sort(byTime)[0] ?? null;
  return {
    ...base,
    status,
    covered: f.covered,
    prevailing: f.prevailing.at(-1)?.conditions ?? null,
    overlays: f.overlays,
    hits: found.hits,
    atLimit: found.atLimit,
    cautions: found.cautions,
    probUnchecked: found.unchecked,
    worst,
  };
}
