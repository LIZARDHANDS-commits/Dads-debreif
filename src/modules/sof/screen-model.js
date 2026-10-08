// What the SOF screen says, decided without a page (SPEC-sof, "The screen"):
// the SOF bar's date-time group and feed status in words, the message for every
// feed failing, the airfield cards' models. Pure: the
// weather snapshot, the airfields, the limits and "now" go in, plain data comes
// out. The page code (layout.js, cards-view.js) only draws it.
//
// Every weather answer is wx's, through cards.js; nothing here reads a report's text.
import { formatDtgZulu, formatInZone, zoneAbbreviation } from '../../core/time.js';
import { SOURCES, staleness } from '../../wx/sources.js';
import { MINUTE_MS, toDate } from '../../wx/dates.js';
import { cardModel, formatAge, formatDuration } from './cards.js';
import { REFRESH_MS } from './weather.js';
import { snapLimits } from './settings-model.js';
import { cautionList } from './cautions.js';
import { CYMJ, siteFor } from './sites/index.js';
import { limitsSet, NOT_SET_KEY, incompleteWhy } from './limits-not-set.js';
import { usafStandards, usafAlternateMinima, noReportStations, noReportsState, homeNote, ALSO_CHECK } from './usaf-limits.js';

/**
 * The line under the screen: what it is not, and where the weather comes from. The weather feeds (MET Norway, Datamask) are the same at every base;
 * the rest is the home base's site profile (sites/): "Confirm with NAV CANADA" and the ECCC and WPC credits are Canada's, so a base without them says nothing of them.
 */
export function creditsFor(site) {
  const c = site?.credits ?? {};
  return ['Not for flight planning.', c.confirm, `Weather: ${SOURCES.metno.name} (CC BY 4.0), ${SOURCES.datamask.name}.`, c.model, c.pictures].filter(Boolean).join(' ');
}

/** Moose Jaw's credits line, as it has always read. */
export const CREDITS = creditsFor(CYMJ);

/** The weather feed reads STALE once its last good round is older than this (three missed refreshes). */
export const STALE_FEED_MIN = 15;

/**
 * The world clocks in the SOF bar (SOF-38): Pacific, Mountain and Eastern, as V6's top bar had them. Zulu and home local are
 * already in the app header. A zone's name follows the season (PDT in summer, PST in winter), from core/time.js.
 */
export const WORLD_ZONES = Object.freeze([
  { label: 'Pacific', timeZone: 'America/Vancouver' },
  { label: 'Mountain', timeZone: 'America/Edmonton' },
  { label: 'Eastern', timeZone: 'America/Toronto' },
]);

/** The world clocks at `now`: `[{ label, zone, time }]`, time as HH:MM. */
export const worldClocks = (now) => WORLD_ZONES.map(({ label, timeZone }) => ({ label, zone: zoneAbbreviation(now, timeZone), time: formatInZone(now, timeZone).slice(0, 5) }));

const two = (n) => String(n).padStart(2, '0');
const hhmmZ = (date) => `${two(date.getUTCHours())}${two(date.getUTCMinutes())}Z`;
const minutesSince = (then, now) => (+now - +then) / MINUTE_MS;
const nameOf = (source) => SOURCES[source]?.name ?? null;

/**
 * How long ago the newest METAR was observed, as words, when it is stale; else null. Observation times, not fetch
 * times. A closed field's last observation with the next one still ahead is accepted, as on the cards, so it is
 * left out before the newest is taken: it must not hide an older open field that is stale (N3).
 */
function staleObservation(snapshot, now) {
  const closed = (r) => r.lastObservation && r.nextObservation && +r.nextObservation > +now;
  const seen = Object.values(snapshot.metar ?? {}).map((e) => e?.report).filter((r) => r && !r.nil && r.time && !Number.isNaN(+r.time) && !closed(r));
  const newest = seen.sort((x, y) => +y.time - +x.time)[0];
  if (!newest || staleness('metar', newest, now) !== 'stale') return null;
  return formatDuration(minutesSince(newest.time, now));
}

// ---- The weather feed, in words -----------------------------------------------------------

/**
 * The bar's weather status: { label, words, symbol, tone, text, title }. The
 * words and the symbol both say the state, so it is never colour alone.
 * tone: 'ok', 'busy', 'bad' or 'off'. `snapshot` is createWeather's.
 */
export function feedStatus(snapshot, now) {
  const { busy, stopped, lastRound, newestAt } = snapshot;
  const showing = newestAt ? formatDuration(minutesSince(newestAt, now)) : null;
  let words;
  let symbol;
  let tone;
  if (stopped) [words, symbol, tone] = ['Off', '–', 'off'];
  else if (busy) [words, symbol, tone] = [`Refreshing…${showing ? ` (showing ${showing} old)` : ''}`, '⟳', 'busy'];
  else if (!lastRound) [words, symbol, tone] = ['Starting…', '⟳', 'busy'];
  else if (lastRound.kind === 'failed') {
    // The fetch age is not the weather's age: name the newest observation's too when it is old (N4).
    const old = staleObservation(snapshot, now);
    [words, symbol, tone] = [showing ? `Failed, showing ${showing} old${old ? `, newest METAR observed ${old} ago` : ''}` : 'Failed, no reports yet', '⚠', 'bad'];
  }
  else if (lastRound.kind === 'empty') [words, symbol, tone] = ['No reports found', '⚠', 'bad'];
  else {
    const age = minutesSince(lastRound.at, now);
    const stale = age > STALE_FEED_MIN;
    [words, symbol, tone] = [stale ? `STALE ${formatDuration(age)}` : formatAge(age), stale ? '⚠' : '✓', stale ? 'bad' : 'ok'];
    // The tick is about the fetch. When the newest METAR observed is itself stale it says that too.
    const old = staleObservation(snapshot, now);
    if (old) {
      words = `${words}, newest METAR observed ${old} ago`;
      [symbol, tone] = ['⚠', 'bad'];
    }
  }
  const answered = [...new Set([...Object.values(snapshot.metar), ...Object.values(snapshot.taf)].map((e) => nameOf(e.source)).filter(Boolean))];
  // When it will try again: the last round plus the refresh interval. Off, it won't.
  const next = stopped ? '' : lastRound ? `Asks again about ${hhmmZ(new Date(+lastRound.at + REFRESH_MS))}.` : 'METARs and TAFs are asked for every 5 minutes.';
  const title = [answered.length ? `Answered by ${answered.join(' and ')}.` : '', next].filter(Boolean).join(' ');
  // `detail` is the same words for the page to keep beside the status, so a keyboard user can reach them.
  return { label: 'Weather', words, symbol, tone, text: `Weather ${words} ${symbol}`, title, detail: title };
}

/**
 * The words for every feed failing, or null when the last round worked: who
 * failed, when, and what is still on screen. The cards keep the last reports.
 */
export function alertText(snapshot, now) {
  const { lastRound, newestAt, busy, stopped } = snapshot;
  if (stopped || busy || lastRound?.kind !== 'failed') return null;
  const names = lastRound.sources.map(nameOf).filter(Boolean);
  const who = names.length === 2 ? `${names[0]} and ${names[1]} both failed` : names.length ? `${names.join(', ')} failed` : 'failed';
  const shown = newestAt ? `Showing the last reports, ${formatDuration(minutesSince(newestAt, now))} old.` : 'No reports are being shown yet.';
  const old = staleObservation(snapshot, now);
  return `Weather feeds are not answering (${who} at ${hhmmZ(toDate(lastRound.at))}). ${shown}${old ? ` The newest METAR was observed ${old} ago.` : ''}`;
}

// ---- The cards ------------------------------------------------------------------------------------

/**
 * A card's note at a USAF base (plan Step 2c part F): home, the source and what is not checked (crosswind 4.16.2.3, home's approach 4.16.1); an
 * alternate, how its minima were worked out (or why they can't be), then what every alternate also needs (4.16.5).
 */
function usafNote(isHome, homeIcao, state, std) {
  if (isHome) return homeNote(homeIcao, std);
  // A "Not suitable" or "Incomplete" result already says why in its words (its hover says more); "Check 4.16.4.3 yourself" needs its why here.
  const how = state?.state === 'ok' ? `${state.basis} (from the approach entered in Settings → Airfields; enter the lowest non-GPS approach).`
    : state?.state === 'check' ? state.why ?? '' : '';
  return [how, `${ALSO_CHECK}.`].filter(Boolean).join(' ');
}

/**
 * The whole screen: { dtg, dtgIso, clocks, feed, alert, cards, credits, lightning, cautions }.
 * `airfields` is app.airfields; `snapshot` is createWeather's; `limits` the home
 * limits from Settings; `now` a Date; `timeZone` home's (the day the marked TAF words are checked over). Cards are home first, then each alternate,
 * one per airfield.
 *
 * `lightning` is lightning.js's answer for the home field (the map's near-home reading), or
 * left out; `cautions` is every current caution, worst first (cautions.js `cautionList`), with
 * lightning's among them when it is near. The banner shows this list; it is not drawn here.
 *
 * When the home base's site profile has no weather limits (`standards: null`, plan Step 2c part B), no card is checked against a limit: home reads
 * "Limits not set for KDLF" and each alternate "Incomplete" (cards.js `notSetFor`), with the key line as the card's note. `limitsNotSet` says so
 * (the home ICAO, or null when the limits are set).
 *
 * At a USAF base (the profile's standards are AFMAN 11-202V3's, plan Step 2c part F; usaf-limits.js) home is checked against the 4.16.2.1 trigger and
 * each alternate against its 4.16.4.1 minima from the approach entered in Settings → Airfields, or reads "Not suitable" (a GNSS-only approach, 4.17.3;
 * no weather reports, 4.16.5.2), "Check 4.16.4.3 yourself" or "Incomplete"; the SOF settings' home trigger is not used there. Each card's note gives
 * the source and what the SOF does not check. `usaf` says so (true, or false elsewhere).
 */
export function buildScreen({ airfields, snapshot, limits, now, lightning = null, timeZone }) {
  const home = airfields.home();
  const homeLimits = snapLimits(limits); // a typed limit is checked snapped up, the safe side (R1)
  const round = snapshot.lastRound;
  const site = siteFor(home.icao);
  const notSetFor = limitsSet(site) ? null : home.icao;
  const usaf = usafStandards(site);
  const noReports = usaf ? noReportStations(snapshot, airfields.alternates().map((f) => f.icao)) : new Set();
  const cards = [];
  const seen = new Set();
  for (const field of [home, ...airfields.alternates()]) {
    if (seen.has(field.icao)) continue;
    seen.add(field.icao);
    const isHome = field === home;
    const options = isHome ? undefined : airfields.checkOptions(field.icao);
    const usafAlternate = usaf && !isHome ? (noReports.has(field.icao) ? noReportsState(field.icao, usaf) : usafAlternateMinima(field, usaf)) : null;
    const model = cardModel({
      icao: field.icao,
      name: field.name ?? '',
      role: isHome ? 'HOME' : 'ALT',
      metar: snapshot.metar[field.icao] ?? null,
      taf: snapshot.taf[field.icao] ?? null,
      limits: homeLimits,
      options,
      now,
      timeZone,
      // Before any round has run there is nothing to have failed; after one, a station it didn't get did.
      feed: { lastTry: round?.at ?? null, failed: Boolean(round && !round.fresh.metar.has(field.icao)) },
      notSetFor,
      usaf: usaf ? { standards: usaf, alternate: usafAlternate } : null,
    });
    const notSet = !isHome && !options?.visualDescent && options?.minimaChecked !== true;
    const baseNote = isHome ? NOT_SET_KEY : incompleteWhy(home.icao);
    cards.push({
      ...model,
      limitsLabel: isHome ? 'Limits' : 'Minima',
      limitsNote: usaf ? usafNote(isHome, home.icao, usafAlternate, usaf)
        : notSetFor ? baseNote : notSet ? `Approaches not set in Settings: checked against ${model.limitsText}` : null,
    });
  }
  const extraCautions = lightning?.caution ? [lightning.caution] : [];
  return {
    dtg: formatDtgZulu(now),
    dtgIso: now.toISOString(),
    clocks: worldClocks(now),
    feed: feedStatus(snapshot, now),
    alert: alertText(snapshot, now),
    cards,
    credits: creditsFor(site),
    limitsNotSet: notSetFor,
    usaf: Boolean(usaf),
    lightning,
    // Cautions from outside the weather reports, in cautions.js's shape: the banner adds these to what it builds from the cards and TAFs.
    extraCautions,
    cautions: cautionList({ cards, extra: extraCautions }),
  };
}
