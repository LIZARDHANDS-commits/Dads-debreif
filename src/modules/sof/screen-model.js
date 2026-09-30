// What the SOF screen says, decided without a page (SPEC-sof, "The screen"):
// the SOF bar's date-time group and feed status in words, the message for every
// feed failing, the airfield cards' models and the Traffic link. Pure: the
// weather snapshot, the airfields, the limits and "now" go in, plain data comes
// out. The page code (layout.js, cards-view.js) only draws it.
//
// Every weather answer is wx's, through cards.js; nothing here reads a report's text.
import { formatDtgZulu } from '../../core/time.js';
import { SOURCES } from '../../wx/sources.js';
import { MINUTE_MS, toDate } from '../../wx/dates.js';
import { cardModel, formatAge, formatDuration } from './cards.js';
import { cleanLimits } from './waves.js';

/** The line under the screen: what it is not, and where the weather comes from. */
export const CREDITS = 'Not for flight planning. Confirm with NAV CANADA. '
  + `Weather: ${SOURCES.metno.name} (CC BY 4.0), ${SOURCES.datamask.name}.`;

/** The weather feed reads STALE once its last good round is older than this (three missed refreshes). */
export const STALE_FEED_MIN = 15;

const two = (n) => String(n).padStart(2, '0');
const hhmmZ = (date) => `${two(date.getUTCHours())}${two(date.getUTCMinutes())}Z`;
const minutesSince = (then, now) => (+now - +then) / MINUTE_MS;
const nameOf = (source) => SOURCES[source]?.name ?? null;

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
  else if (lastRound.kind === 'failed') [words, symbol, tone] = [showing ? `Failed, showing ${showing} old` : 'Failed, no reports yet', '⚠', 'bad'];
  else if (lastRound.kind === 'empty') [words, symbol, tone] = ['No reports found', '⚠', 'bad'];
  else {
    const age = minutesSince(lastRound.at, now);
    const stale = age > STALE_FEED_MIN;
    [words, symbol, tone] = [stale ? `STALE ${formatDuration(age)}` : formatAge(age), stale ? '⚠' : '✓', stale ? 'bad' : 'ok'];
  }
  const answered = [...new Set([...Object.values(snapshot.metar), ...Object.values(snapshot.taf)].map((e) => nameOf(e.source)).filter(Boolean))];
  const title = `${answered.length ? `Answered by ${answered.join(' and ')}. ` : ''}METARs and TAFs are asked for again every 5 minutes.`;
  return { label: 'Weather', words, symbol, tone, text: `Weather ${words} ${symbol}`, title };
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
  return `Weather feeds are not answering (${who} at ${hhmmZ(toDate(lastRound.at))}). ${shown}`;
}

// ---- The Traffic link -------------------------------------------------------------------------

/**
 * ADS-B Exchange's live map centred on the home field (a link out; its terms
 * for showing it inside the page are read before the map layer, task 7). Built from two
 * checked numbers, so nothing else can reach the address. Null without a usable position.
 */
export function trafficUrl(home) {
  const { lat, lon } = home ?? {};
  const ok = (v, limit) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= limit;
  if (!ok(lat, 90) || !ok(lon, 180)) return null;
  return `https://globe.adsbexchange.com/?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&zoom=6`;
}

// ---- The cards ------------------------------------------------------------------------------------

/**
 * The whole screen: { dtg, dtgIso, feed, alert, cards, trafficUrl, credits }.
 * `airfields` is app.airfields; `snapshot` is createWeather's; `limits` the home
 * limits from Settings; `now` a Date. Cards are home first, then each alternate,
 * one per airfield.
 */
export function buildScreen({ airfields, snapshot, limits, now }) {
  const home = airfields.home();
  const homeLimits = cleanLimits(limits);
  const round = snapshot.lastRound;
  const cards = [];
  const seen = new Set();
  for (const field of [home, ...airfields.alternates()]) {
    if (seen.has(field.icao)) continue;
    seen.add(field.icao);
    const isHome = field === home;
    const options = isHome ? undefined : airfields.checkOptions(field.icao);
    const model = cardModel({
      icao: field.icao,
      name: field.name ?? '',
      role: isHome ? 'HOME' : 'ALT',
      metar: snapshot.metar[field.icao] ?? null,
      taf: snapshot.taf[field.icao] ?? null,
      limits: homeLimits,
      options,
      now,
      // Before any round has run there is nothing to have failed; after one, a station it didn't get did.
      feed: { lastTry: round?.at ?? null, failed: Boolean(round && !round.fresh.metar.has(field.icao)) },
    });
    const notSet = !isHome && !options?.visualDescent && options?.minimaChecked !== true;
    cards.push({
      ...model,
      limitsLabel: isHome ? 'Limits' : 'Minima',
      limitsNote: notSet ? `Approaches not set in Settings: checked against ${model.limitsText}` : null,
    });
  }
  return {
    dtg: formatDtgZulu(now),
    dtgIso: now.toISOString(),
    feed: feedStatus(snapshot, now),
    alert: alertText(snapshot, now),
    cards,
    trafficUrl: trafficUrl(home),
    credits: CREDITS,
  };
}
