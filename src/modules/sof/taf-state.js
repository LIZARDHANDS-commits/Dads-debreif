// Whether each airfield's TAF is one to trust, in words (SPEC-sof, "Never: show a stale one as
// current"). The cards already say STALE for a TAF; the wave chips and the timeline rows are made from
// the same TAF, so they say it too, from here. Nothing here reads the TAF's text: wx's `staleness`
// decides stale (a TAF whose valid period has ended), and weather.js's last round says which reports
// it did not get again.
import { staleness } from '../../wx/sources.js';
import { MINUTE_MS, toDate } from '../../wx/dates.js';
import { formatDuration } from './cards.js';

/**
 * The note for each airfield that has a TAF: `{ ICAO: { stale, failed, note } }`, `note` being words
 * such as "STALE TAF, valid period ended 1 h 5 min ago" or null when the TAF is current.
 * An airfield with no TAF has no entry: "No TAF" is already said where it shows.
 * `snapshot` is createWeather's (`taf`, `lastRound`); `now` a Date, or null when unknown.
 */
export function tafNotes({ snapshot, now }) {
  const out = {};
  const round = snapshot?.lastRound ?? null;
  const time = toDate(now);
  for (const [icao, entry] of Object.entries(snapshot?.taf ?? {})) {
    const report = entry?.report;
    if (!report || report.cancelled || report.nil) continue;
    const stale = !time || staleness('taf', report, time) === 'stale';
    // Before any round has run there is nothing to have failed; after one, a TAF it didn't get again did.
    const failed = Boolean(round?.fresh?.taf && !round.fresh.taf.has(icao));
    const parts = [];
    if (stale) {
      const ended = time && report.validTo ? (+time - +report.validTo) / MINUTE_MS : null;
      parts.push(!time ? 'STALE TAF, time now unknown'
        : ended == null || !Number.isFinite(ended) ? 'STALE TAF, valid period unknown'
          : `STALE TAF, valid period ended ${formatDuration(ended)} ago`);
    }
    if (failed) parts.push('TAF refresh failed, showing the last one');
    out[icao] = { stale, failed, note: parts.length ? parts.join('; ') : null };
  }
  return out;
}

/** `words` with the note after it in brackets; the words alone when there is no note. */
export function withTafNote(words, state) {
  if (!state?.note) return words;
  return words ? `${words} (${state.note})` : `(${state.note})`;
}
