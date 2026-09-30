// What the Waves part of the screen says, decided without a page (SPEC-sof, "Waves and
// the alternate call", task 4). The plan (plan-store.js) goes through waves.js, which
// makes every call with wx; this joins the two and puts them in words: a row and a chip
// for each wave, the list of hits for the selected wave, and a line for each alternate
// card. Nothing here reads a report or judges the weather.
import { planToUtc, waveCalls, MAX_WAVES } from './waves.js';

const two = (n) => String(n).padStart(2, '0');
const HOUR_MS = 3_600_000;

/** "1400Z" without the Z: four digits. */
const hhmm = (d) => `${two(d.getUTCHours())}${two(d.getUTCMinutes())}`;
const range = (from, to) => `${hhmm(from)}–${hhmm(to)}`;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A calendar date as "Tue 29 Sep" (the same everywhere, whatever the browser's language). */
export function dayLabel(date) {
  if (!date) return '';
  const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  return `${WEEKDAYS[weekday]} ${date.day} ${MONTHS[date.month - 1]}`;
}

// A symbol beside the words of every call, never instead of them.
const SYMBOL = { ok: '✓', required: '⚠', below: '▼', 'at-limit': '●', unknown: '?' };
const symbolOf = (tone) => SYMBOL[tone] ?? '?';

const LEVEL_WORDS = { below: 'Below limits', 'at-limit': 'At the limit', caution: 'Caution', unchecked: 'PROB not checked against landing minima' };
const lineOf = (d) => ({ level: d.level, levelWords: LEVEL_WORDS[d.level] ?? d.level, text: d.text });

/** The reason a call is what it is: wx's first hit, else why it can't be told, else nothing. */
const reasonOf = (call) => call.firstReason?.text ?? call.why ?? null;

/** Which wave is selected: `undefined` is the first with a call, `null` is none, an id is that wave (if it can be). */
export function resolveSelected(rows, selectedId) {
  if (selectedId === null) return null;
  const callable = rows.filter((r) => r.chip);
  if (selectedId !== undefined && callable.some((r) => r.id === selectedId)) return selectedId;
  return callable[0]?.id ?? null;
}

function chipOf(row, call) {
  const { home } = call;
  return {
    words: home.words,
    tone: home.tone,
    symbol: symbolOf(home.tone),
    reason: reasonOf(home),
    limits: home.label,
    alternates: call.of ? `${call.meeting} of ${call.of} alternate${call.of === 1 ? '' : 's'} meet` : null,
  };
}

function detailOf(row, call) {
  const { home } = call;
  return {
    id: row.id,
    title: `${row.title} (${row.zulu})`,
    home: {
      words: home.words,
      tone: home.tone,
      symbol: symbolOf(home.tone),
      limits: home.label,
      why: home.why,
      lines: home.details.map(lineOf),
    },
    alternates: call.alternates.map((a) => ({
      icao: a.icao,
      words: a.words,
      tone: a.tone,
      symbol: symbolOf(a.tone),
      minima: a.minimaText,
      note: a.note,
      why: a.why,
      warnings: a.warnings ?? [],
      lines: a.details.map(lineOf),
    })),
    summary: call.of ? `${call.meeting} of ${call.of} alternate${call.of === 1 ? '' : 's'} meet` : 'No alternates set',
  };
}

function altLinesOf(row, call) {
  const lines = new Map();
  const around = (t, sign) => new Date(+t + sign * HOUR_MS);
  const label = `${row.name} arrival ${range(around(call.wave.land, -1), around(call.wave.land, 1))}Z`;
  for (const a of call.alternates) {
    lines.set(a.icao, { label, words: a.words, tone: a.tone, symbol: symbolOf(a.tone), reason: reasonOf(a), note: a.note });
  }
  return lines;
}

/**
 * The Waves part of the screen for one moment.
 *
 * - `plan`: plan-store.js's `get()`: `{ day, waves: [{ id, name, takeoff, land }] }`.
 * - `airfields`: app.airfields. `tafs`: ICAO to wx's parsed TAF (or null). `limits`: the home limits.
 * - `now`, `timeZone`: the clock and the home zone; nothing is guessed without them.
 * - `selectedId`: `undefined` (the first wave with a call), `null` (none) or a wave's id.
 *
 * Returns `{ problem, day, dayLabel, zone, rows, canAdd, limitNote, selectedId, detail, altLines,
 * waves, calls }`. A row is `{ id, entryName (as typed), name (as said), title, zulu, takeoff, land, nextDay, note, chip }` and
 * `chip` is `{ words, tone, symbol, reason, limits, alternates }`, or null when the wave has no
 * call (times not set, or no zone). `altLines` is a Map from an alternate's ICAO to its result
 * for the selected wave. `waves` and `calls` are the UTC waves and `waveCalls`' answer, for the
 * timeline and the banner.
 * @param {any} [args]
 */
export function buildWaves({ plan, airfields, tafs = {}, limits, now, timeZone, selectedId } = {}) {
  const entries = plan.waves;
  const planned = /** @type {any} */ (planToUtc)(entries, { now, timeZone, day: plan.day });
  const skipped = new Map(planned.skipped.map((s) => [s.index, s]));
  const calls = planned.problem ? [] : /** @type {any} */ (waveCalls)({ waves: planned.waves, airfields, tafs, limits });

  let placed = 0;
  const rows = entries.slice(0, MAX_WAVES).map((entry, index) => {
    const skip = skipped.get(index);
    const wave = skip ? null : planned.waves[placed++];
    const call = wave ? calls.find((c) => c.wave === wave) : null;
    const name = skip?.name ?? wave.name;
    const clock = entry.takeoff && entry.land ? `${entry.takeoff.replace(':', '')}–${entry.land.replace(':', '')} ${planned.zone}` : '';
    const row = {
      id: entry.id,
      entryName: entry.name,
      name,
      title: clock ? `${name} ${clock}` : name,
      zulu: wave ? `${range(wave.takeoff, wave.land)}Z` : '',
      takeoff: entry.takeoff,
      land: entry.land,
      nextDay: Boolean(wave?.nextDay),
      note: skip ? skip.problem : wave?.nextDay ? 'Lands the next day' : '',
      chip: null,
    };
    if (call) row.chip = chipOf(row, call);
    row.call = call ?? null;
    return row;
  });

  const chosen = resolveSelected(rows, selectedId);
  const selected = rows.find((r) => r.id === chosen) ?? null;
  return {
    problem: planned.problem,
    day: plan.day,
    dayLabel: dayLabel(planned.date),
    zone: planned.zone,
    rows,
    canAdd: entries.length < MAX_WAVES,
    limitNote: entries.length >= MAX_WAVES ? `Up to ${MAX_WAVES} waves` : '',
    selectedId: chosen,
    detail: selected ? detailOf(selected, selected.call) : null,
    altLines: selected ? altLinesOf(selected, selected.call) : new Map(),
    waves: planned.waves,
    calls,
  };
}
