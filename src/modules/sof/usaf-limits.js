// The weather limits at the USAF T-6 bases (plan Step 2c, part F; Dad, 8 Oct 2026; SOF-47): AFMAN 11-202 Vol 3, 4.16 and 4.17.3, as the site profile's
// `standards` give them (sites/usaf-standards.js; the rule in our own words is docs/references/afman11-202v3-alternates.md). Pure: reports, airfields and
// the wave go in, plain data in the shapes the SOF already draws comes out (waves.js's calls, cards.js's results), so the cards, the wave chips and panel,
// the timeline and the banner say these results in Moose Jaw's visual language with "AFMAN 11-202V3 4.16" as the source.
//
// Every weather answer is wx's (read only): the home trigger is wx's homeAlternateTrigger and the alternate test wx's assessAlternate, over wx's own
// TAF windows and groups. What this file adds is the AFMAN's window (ETA ± 1 h), its numbers, which TEMPO groups the alternate test leaves out, and
// the words.
//
// ETA: the wave's planned landing time, at home and at each alternate (4.16.2.1 and 4.16.4.1 say "ETA ± 1 hour"; the SOF has a landing time per wave
// and no route, so the flight time to the alternate is not added: the same window Moose Jaw's alternates use, SOF-34). Moose Jaw's home window (takeoff to
// landing + 1 h, Gen Book p.7 practice) is not used here.
//
// PROB groups: our write-up of 4.16 names TEMPO only. Working answer (to confirm with Dad): a PROB group is counted as a TEMPO would be, at home and at
// the alternate, the safe side (Moose Jaw's home trigger counts them too), and a PROB caused by thunderstorms or showers is left out at the alternate
// like such a TEMPO.
import { homeAlternateTrigger, assessAlternate } from '../../wx/alternates.js';
import { toWindow, forecastAt } from '../../wx/taf.js';
import { MINUTE_MS } from '../../wx/dates.js';
import { formatSm } from '../../airfields/format.js';
import { homeCall, alternateCall } from './waves.js';
import { crosswindCheck, runwayEnds } from './crosswind.js';
import { AIRPORTS } from './airports-data.js';
import { USAF_STANDARDS, USAF_SOURCE } from './sites/usaf-standards.js';

export { USAF_SOURCE };

/** The site profile's standards when they are the USAF rule, else null (Moose Jaw's, a Navy base's null, the generic profile's null). */
export const usafStandards = (site) => (site?.standards?.rule === 'usaf' ? site.standards : null);

const two = (n) => String(n).padStart(2, '0');
const hhmm = (d) => `${two(d.getUTCHours())}${two(d.getUTCMinutes())}`;
const ft = (n) => n.toLocaleString('en-CA');

// ---- Words ----------------------------------------------------------------------------------------

/** The source line, in place of Moose Jaw's Gen Book. */
export const SOURCE_LINE = `Limits: ${USAF_SOURCE}`;

/** The crosswind rule in words (4.16.2.3, with the T-6A limits of Dad's ruling, 8 Oct 2026). */
export const crosswindRuleWords = (std = USAF_STANDARDS) =>
  `Crosswind: alternate required when the forecast crosswind is over ${std.crosswind.fullStopKt} kt (T-6A full stop, Dad's ruling, 8 Oct 2026) on every runway (${std.crosswind.alternateSource})`;

/** What every alternate also needs and the SOF has no data for (4.16.5). */
export const ALSO_CHECK = 'Also check: Alternate NA, NOTAMs and IFR alternate minimums notes (AFMAN 4.16.5)';

/** A GNSS-only approach at the alternate does not count (4.17.3; Dad's ruling, 8 Oct 2026: the T-6A can't rely on GPS). */
export const NEEDS_NON_GPS = 'Not suitable: needs a non-GPS approach (AFMAN 4.17.3)';

/** A field with no weather reports from our sources (4.16.5.2). */
export const NO_REPORTS = 'Not suitable: no weather reports (AFMAN 4.16.5.2)';

/** No compatible instrument approach at the alternate: the VFR-from-MEA test (4.16.4.3) needs MEA data the SOF does not have. */
export const CHECK_MEA = 'Check 4.16.4.3 yourself';

const INCOMPLETE = 'Incomplete';

/** The home trigger as the card and the wave panel label it: "AFMAN 4.16.2.1 2000/3". */
export const homeLabel = (std = USAF_STANDARDS) => `AFMAN 4.16.2.1 ${std.homeTrigger.ceilingFt}/${formatSm(std.homeTrigger.visSm)}`;

/** The home card's limits line. */
export const homeLimitsText = (std = USAF_STANDARDS) =>
  `${ft(std.homeTrigger.ceilingFt)} ft ceiling and ${formatSm(std.homeTrigger.visSm)} SM, worst weather at ETA ± 1 h, TEMPO included (${std.homeTrigger.source})`;

/** The note under home: what the SOF does not check at home (4.16.1, 4.16.2.3). */
export const homeNote = (icao, std = USAF_STANDARDS) =>
  `${SOURCE_LINE}. ETA is the wave's landing time. ${crosswindRuleWords(std)}. Takes ${icao || 'home'} as having a compatible instrument approach (${std.homeApproach.source}; not checked).`;

// ---- The window ---------------------------------------------------------------------------------------

/** ETA − 1 h to ETA + 1 h (4.16.2.1, 4.16.4.1), from the profile's numbers. Null when the ETA can't be read. */
export function etaWindow(eta, std = USAF_STANDARDS) {
  const t = eta instanceof Date ? +eta : NaN;
  if (!Number.isFinite(t)) return null;
  return { from: new Date(t - std.etaWindow.beforeMin * MINUTE_MS), to: new Date(t + std.etaWindow.afterMin * MINUTE_MS) };
}

// ---- The alternate's minima -------------------------------------------------------------------------------

/**
 * An alternate's AFMAN minima from what was entered for it in Settings → Airfields (`field` is airfields' resolved field: `approach`, `lowestHatFt`,
 * `lowestVisSm`, `gnssPlan`). Returns one of:
 * - `{ state: 'ok', minima: [{ ceilingFt, visSm }], text, basis }`: ceiling max(1,000 ft, lowest HAT + 500 ft), visibility max(2 SM, lowest visibility
 *   + 1 SM) (4.16.4.1);
 * - `{ state: 'not-suitable', words, why }`: the approach entered is GNSS only, or the plan's GNSS box is ticked (4.17.3);
 * - `{ state: 'check', words, why }`: no IFR approach entered: the VFR-from-MEA rule (4.16.4.3) is left to the SOF (amber);
 * - `{ state: 'incomplete', words, short, why }`: no approach entered, or its lowest HAT or visibility missing (SOF-32: amber "Incomplete", never a tick).
 * Every answer also has `text`, the minima line's words.
 */
export function usafAlternateMinima(field, std = USAF_STANDARDS) {
  const icao = field?.icao ?? 'this alternate';
  const approach = field?.approach ?? 'not-set';
  if (approach === 'not-set') {
    return { state: 'incomplete', words: INCOMPLETE, short: 'no approach entered in Settings → Airfields', text: 'minima not set', why: `No approach entered for ${icao} in Settings → Airfields, so its ${std.alternate.source} minima can't be worked out.` };
  }
  if (approach === 'gnss-only' || field?.gnssPlan === true) {
    const what = approach === 'gnss-only' ? 'Only a GNSS (RNAV) approach is entered' : `The plan uses a GNSS approach at ${icao}`;
    return { state: 'not-suitable', words: NEEDS_NON_GPS, text: 'needs a non-GPS approach', why: `${what}; the T-6A can't rely on GPS (Dad, 8 Oct 2026), so the alternate needs a compatible approach that doesn't use GNSS (${std.gnss.source.split(';')[0]}).` };
  }
  if (approach === 'no-ifr') {
    return { state: 'check', words: CHECK_MEA, text: 'VFR descent from the MEA', why: `No compatible instrument approach entered for ${icao}: ${std.noApproachAlternate.source} needs a forecast that allows a descent from the MEA, approach and landing in basic VFR. The SOF has no MEA data to check it.` };
  }
  const hat = field?.lowestHatFt;
  const vis = field?.lowestVisSm;
  if (!Number.isFinite(hat) || !Number.isFinite(vis)) {
    const missing = [!Number.isFinite(hat) ? 'lowest HAT' : null, !Number.isFinite(vis) ? 'visibility' : null].filter(Boolean).join(' and ');
    return { state: 'incomplete', words: INCOMPLETE, short: `${missing} not entered in Settings → Airfields`, text: 'minima not set', why: `${icao}'s ${missing} not entered in Settings → Airfields, so its ${std.alternate.source} minima can't be worked out.` };
  }
  const a = std.alternate;
  const ceilingFt = Math.max(a.ceilingFloorFt, hat + a.ceilingAddFt);
  const visSm = Math.max(a.visFloorSm, vis + a.visAddSm);
  const basis = `${ft(ceilingFt)} ft is the higher of ${ft(a.ceilingFloorFt)} ft and HAT ${ft(hat)} + ${a.ceilingAddFt} ft; ${formatSm(visSm)} SM the higher of ${a.visFloorSm} SM and ${formatSm(vis)} + ${a.visAddSm} SM`;
  return { state: 'ok', minima: [{ ceilingFt, visSm }], text: `${ceilingFt}-${formatSm(visSm)} (AFMAN 4.16.4.1)`, basis };
}

// ---- The alternate's forecast ---------------------------------------------------------------------------------

const has = (w, p) => (w.phenomena ?? []).includes(p);
// A thunderstorm (TS) or a rain or snow shower (SHRA, SHSN) at the field. Vicinity weather (VCTS, VCSH) is not "at the field" and does not count.
const thunderstormOrShower = (w) => w.intensity !== 'VC' && (w.descriptor === 'TS' || (w.descriptor === 'SH' && (has(w, 'RA') || has(w, 'SN'))));

/**
 * The TAF groups the alternate test leaves out (4.16.4.1): TEMPO groups for thunderstorms, rain showers or snow showers, read from the group's own
 * weather (wx's parsed `groups`); PROB groups the same way (the working answer above). A Set of group indices.
 */
export function excludedGroups(taf) {
  const out = new Set();
  (Array.isArray(taf?.groups) ? taf.groups : []).forEach((g, i) => {
    if (i > 0 && (g?.kind === 'TEMPO' || g?.kind === 'PROB') && (g.conditions?.weather ?? []).some(thunderstormOrShower)) out.add(i);
  });
  return out;
}

const groupWords = (g) => (g.kind === 'PROB' ? `PROB${g.probability}${g.tempo ? ' TEMPO' : ''}` : g.kind);

/**
 * An alternate's forecast over the window against its AFMAN minima, in wx's assessAlternate shape (so the calls, the timeline and the banner read it as
 * they read Moose Jaw's), plus `excluded`: the thunderstorm and shower TEMPO groups touching the window that were left out of the limit test,
 * `[{ group, kind, from, to, words }]`. The excluded groups' dangerous weather (a TSRA is still a caution) stays in `cautions`.
 * Every piece, PROB included, is tested against the same minima.
 */
export function assessUsafAlternate(taf, window, minima) {
  const options = { minima, landingMinima: minima };
  const skip = excludedGroups(taf);
  if (!skip.size) return { ...assessAlternate(taf, window, options), excluded: [] };
  // wx's own TAF with the left-out groups given no time, so wx's timeline passes over them; every other group keeps its place and index.
  const trimmed = { ...taf, groups: taf.groups.map((g, i) => (skip.has(i) ? { ...g, from: null, to: null } : g)) };
  const limits = assessAlternate(trimmed, window, options);
  const whole = assessAlternate(taf, window, options);
  const w = toWindow(window);
  const excluded = [...skip]
    .map((i) => ({ i, g: taf.groups[i] }))
    .filter(({ g }) => w && g.from && g.to && +g.from < +w.to && +g.to > +w.from)
    .map(({ i, g }) => ({ group: i, kind: groupWords(g), from: g.from, to: g.to, words: `${groupWords(g)} ${hhmm(g.from)}–${hhmm(g.to)}Z ${(g.conditions?.weather ?? []).map((x) => x.raw).join(' ')}`.trim() }));
  return { ...limits, cautions: whole.cautions, excluded };
}

/** The words for the left-out TEMPO groups, or null. */
export function excludedNote(excluded) {
  if (!Array.isArray(excluded) || !excluded.length) return null;
  return `${excluded.map((e) => e.words).join('; ')}: not counted (thunderstorm or shower TEMPO, AFMAN 4.16.4.1)`;
}

/** The home trigger over a window: wx's homeAlternateTrigger against 2,000 ft and 3 SM, every group included (4.16.2.1). */
export function usafHomeTrigger(taf, window, std = USAF_STANDARDS) {
  return homeAlternateTrigger(taf, window, { ceilingFt: std.homeTrigger.ceilingFt, visSm: std.homeTrigger.visSm });
}

// ---- The forecast crosswind at home (4.16.2.3) -----------------------------------------------------------------

/**
 * The forecast pieces in the window whose crosswind is over the T-6A full-stop limit on every runway end at the field (4.16.2.3; 25 kt, Dad's ruling,
 * 8 Oct 2026), in wx's hit shape, so they join the home call's hits (and the banner's and the timeline's). Each piece's wind is wx's (a TEMPO or PROB
 * with no wind of its own keeps the wind under it); the crosswind is crosswind.js's (the gust when one is forecast, the full speed for VRB). The reason
 * names the runway with the least crosswind and its crosswind. `checked` is false when the field has no runways in the SOF's airport data.
 * Returns `{ checked, hits }`.
 */
export function forecastCrosswindHits(taf, window, icao, std = USAF_STANDARDS, airports = AIRPORTS) {
  const ends = runwayEnds((airports ?? []).find((a) => a.icao === icao));
  if (!ends.length) return { checked: false, hits: [] };
  if (!taf?.validFrom || !taf?.validTo || taf.cancelled || taf.nil || !toWindow(window)) return { checked: true, hits: [] };
  const limit = std.crosswind.fullStopKt;
  const f = forecastAt(taf, window);
  const pieces = [...f.prevailing.map((p) => ({ kind: 'PREVAILING', probability: null, tempo: false, ...p })), ...f.overlays];
  // crosswind.js's check, with its red level at the full-stop limit: every end red is every runway over it.
  const settings = { runwayState: 'dry', xwAmberDryKt: limit, xwRedDryKt: limit };
  const hits = [];
  for (const p of pieces) {
    const check = crosswindCheck({ wind: p.conditions?.wind ?? null, ends, settings });
    if (!check.allRed) continue;
    const best = check.ends.reduce((a, b) => (b.checkCrossKt < a.checkCrossKt ? b : a));
    hits.push({
      kind: p.kind,
      probability: p.probability ?? null,
      tempo: p.tempo ?? false,
      from: p.from,
      to: p.to,
      group: p.group,
      ceilingFt: null,
      visibility: null,
      reasons: [`CROSSWIND OVER ${limit} KT ON EVERY RUNWAY (LEAST ${Math.round(best.checkCrossKt)} KT ON ${best.name})`],
      reasonSpans: [[]],
      span: taf.groups?.[p.group]?.span ?? null,
    });
  }
  return { checked: true, hits };
}

/** Home's forecast over a window as the timeline reads it: the 4.16.2.1 trigger's hits and the crosswind's (4.16.2.3), in wx's shape. */
export function usafHomeAssess(icao, std = USAF_STANDARDS, airports = AIRPORTS) {
  return (taf, window) => {
    const found = usafHomeTrigger(taf, window, std);
    const crosswind = forecastCrosswindHits(taf, window, icao, std, airports);
    return crosswind.hits.length ? { ...found, hits: [...found.hits, ...crosswind.hits] } : found;
  };
}

// ---- No weather reports ---------------------------------------------------------------------------------------

/**
 * The stations our weather sources have answered for with neither a METAR nor a TAF (4.16.5.2), from the SOF's weather snapshot. Only once a round has
 * come back without failing: before the first answer, or while the feeds fail, nothing is said (a feed that is down is "can't tell", never "no reports").
 */
export function noReportStations(snapshot, icaos) {
  const round = snapshot?.lastRound;
  if (!round || round.kind === 'failed') return new Set();
  const held = (kind, icao) => Boolean(snapshot?.[kind]?.[icao]?.report);
  return new Set((icaos ?? []).filter((icao) => !held('metar', icao) && !held('taf', icao)));
}

/** The minima answer for an alternate our sources have no reports for (4.16.5.2), in `usafAlternateMinima`'s shape. */
export const noReportsState = (icao, std = USAF_STANDARDS) => ({
  state: 'not-suitable', words: NO_REPORTS, text: 'no weather reports', why: `Our weather sources have no METAR and no TAF for ${icao || 'this field'} (${std.noWeatherReports.source}).`,
});

// ---- The wave calls -----------------------------------------------------------------------------------------------

const cautionsOnly = (result) => (result ? { ...result, hits: [], atLimit: [], probUnchecked: [] } : result);
const cautionLines = (details) => (Array.isArray(details) ? details.filter((d) => d.level === 'caution') : []);

/** The home call for a wave: the trigger over ETA ± 1 h (ETA the wave's landing), in waves.js's homeCall shape, with `note` saying what isn't checked. */
export function usafHomeCall(wave, taf, icao, std = USAF_STANDARDS, { airports = AIRPORTS } = {}) {
  const window = etaWindow(wave?.land, std) ?? { from: wave?.land, to: wave?.land };
  const crosswind = forecastCrosswindHits(taf, window, icao, std, airports);
  const call = homeCall(wave, taf, { ceilingFt: std.homeTrigger.ceilingFt, visSm: std.homeTrigger.visSm }, icao, {
    window,
    label: homeLabel(std),
    span: 'ETA ± 1 h',
    windowWords: { start: 'ETA − 1 h is', end: 'ETA + 1 h is', suffix: '' },
    extraHits: crosswind.hits,
  });
  const unchecked = crosswind.checked ? '' : ` No runway data for ${icao}: the forecast crosswind is not checked.`;
  return { ...call, note: `${homeNote(icao, std)}${unchecked}` };
}

/**
 * One alternate's call for a wave over ETA ± 1 h, in waves.js's alternateCall shape. `field` is airfields' resolved field; `noReports` true when our
 * sources answered with no METAR and no TAF for it. A call that can't be made (not suitable, "check yourself", incomplete) keeps only its
 * dangerous-weather lines, and is never counted as meeting.
 */
export function usafAlternateCall(wave, field, taf, std = USAF_STANDARDS, { noReports = false } = {}) {
  const m = usafAlternateMinima(field, std);
  const icao = field?.icao;
  if (!noReports && m.state === 'ok') {
    const call = alternateCall(wave, icao, taf, {}, { assess: (t, w) => assessUsafAlternate(t, w, m.minima), minimaText: m.text });
    return { ...call, note: excludedNote(call.result?.excluded), basis: m.basis };
  }
  const call = alternateCall(wave, icao, taf, {}, { minimaText: m.text });
  const state = noReports ? noReportsState(icao, std) : m;
  return {
    ...call,
    status: state.state,
    words: state.words,
    tone: state.state === 'not-suitable' ? 'not-suitable' : 'incomplete',
    minimaText: state.text,
    note: null,
    firstReason: null,
    hasHit: false,
    why: state.why,
    details: cautionLines(call.details),
    warnings: [],
    result: cautionsOnly(call.result),
  };
}

/**
 * Every wave's calls at a USAF base, in waves.js's waveCalls shape: `{ wave, home, alternates, meeting, of, rule: 'usaf', alsoCheck }`.
 * `airfields` is app.airfields; `tafs` maps ICAO to a parsed TAF (or null); `noReports` is `noReportStations`' Set (or nothing).
 */
export function usafWaveCalls({ waves, airfields, tafs = {}, standards = USAF_STANDARDS, noReports = new Set() } = {}) {
  const home = airfields.home();
  const alternates = airfields.alternates();
  return (waves ?? []).map((wave) => {
    const calls = alternates.map((a) => usafAlternateCall(wave, a, tafs[a.icao] ?? null, standards, { noReports: noReports.has(a.icao) }));
    return {
      wave,
      home: usafHomeCall(wave, tafs[home.icao] ?? null, home.icao, standards),
      alternates: calls,
      meeting: calls.filter((c) => c.status === 'meets' || c.status === 'at-limit').length,
      of: calls.length,
      rule: 'usaf',
      alsoCheck: ALSO_CHECK,
    };
  });
}
