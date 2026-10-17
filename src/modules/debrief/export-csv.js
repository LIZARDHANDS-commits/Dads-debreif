// The CSV export (SPEC-debrief: CSV export, #28): one row per second across
// the shared playback window, each ship's columns side by side. Every number
// is the one the readouts show at that second (readoutsAt), so the file and
// the screen never disagree. No page access, so it's tested in Node.
import { headingAt, sampleAt } from '../../flight-data/flight.js';
import { headingRadToCompassDeg } from '../../core/angles.js';
import { readoutsAt } from './readouts.js';
import { puckHeaderNote } from './puck.js';
import { timingHeaderNote } from './gps-timing.js';
import { altitudeHeaderNote } from './altitude.js';
import { isExercise, flightGroups, subFlight, slotOf } from './exercise.js';

/**
 * Each ship's columns, in order: the header after "#n " and how the value is written.
 * @type {Array<[string, (ship: any) => string]>}
 */
const SHIP_COLUMNS = [
  ['lat', (s) => fixed(s.lat, 6)],
  ['lon', (s) => fixed(s.lon, 6)],
  ['alt ft', (s) => fixed(s.altFt, 0)],
  ['GS kt', (s) => fixed(s.gsKt, 1)],
  ['est. IAS kt', (s) => fixed(s.iasKt, 1)],
  ['heading deg', (s) => fixed(s.headingDeg, 1)],
  ['G', (s) => fixed(s.g, 2)],
  ['G source', (s) => s.gSource ?? ''],
  ['pitch deg', (s) => fixed(s.pitchDeg, 1)],
  ['pitch source', (s) => s.pitchSource ?? ''],
  // The readouts keep bank left wing down positive; the file uses the usual right-positive.
  ['bank deg (right +)', (s) => fixed(Number.isFinite(s.bankDeg) ? -s.bankDeg : null, 1)],
  ['bank source', (s) => s.bankSource ?? ''],
  // In a GPS gap the position is a guess between two fixes (C4), so it's flagged.
  ['GPS gap', (s) => (s.inGap ? 'yes' : 'no')],
];

/** The columns a GPS puck moves (DB-23). */
const POSITION_COLUMNS = new Set(['lat', 'lon', 'alt ft']);

function fixed(n, places) {
  if (!Number.isFinite(n)) return '';
  const text = n.toFixed(places);
  return /^-0(\.0*)?$/.test(text) ? text.slice(1) : text; // no "-0.0"
}

/**
 * One CSV cell: quoted when it holds a comma, quote or line break, and with a
 * leading ' when it starts with = + - @ and isn't a number, so a spreadsheet
 * never runs it as a formula (track names come from the files).
 */
export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text) && !/^[-+]?\d/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Seconds since 1970 as "2026-09-30T14:32:07Z". */
const isoZ = (t) => new Date(t * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');

/**
 * The rows, header first, as arrays of cells: one row per whole second from
 * the start of the shared window to its end. options.recordedG as the readouts.
 * options.leadWindAt(t, leadAltFt): the model wind { dirDeg, kt } at that
 * second, or null, so #1's est. IAS is the one the Lead line shows (F1).
 * options.label(slot): a ship's name for its headers ("#2"; an exercise's "Viper 2", DB-37). In an exercise each
 * flight's readouts are worked out on that flight alone, as the screen does, so each flight's Lead takes the wind.
 */
export function csvRows(flight, { recordedG = false, leadWindAt = null, label = (slot) => `#${slot}` } = {}) {
  if (!flight) return [];
  const tracks = Object.values(flight.tracks).sort((a, b) => a.slot - b.slot);
  // A ship moved from its GPS puck (DB-23) says so on its position headers; the positions are the moved ones, as on screen.
  // A ship whose heights were corrected from the ground (DB-28) says so on its altitude header, after any puck note.
  const named = (tr, name) => `${label(tr.slot)} ${name}${POSITION_COLUMNS.has(name) ? puckHeaderNote(tr) : ''}${name === 'alt ft' ? altitudeHeaderNote(tr) : ''}`;
  // Ships whose timestamps were snapped or shifted (DB-25) are named on the time column.
  const header = [`time (Zulu)${timingHeaderNote(flight, label)}`, ...tracks.flatMap((tr) => SHIP_COLUMNS.map(([name]) => named(tr, name)))];
  const rows = [header];
  // One flight (a four-ship load) or each flight of an exercise, with its ships numbered 1 to 4 for readoutsAt.
  const parts = isExercise(flight) ? flightGroups(flight).map(({ f }) => ({ f, sub: subFlight(flight, f) })) : [{ f: 1, sub: flight }];
  const back = isExercise(flight) ? (f, n) => slotOf(f, n) : (f, n) => n;
  for (let t = Math.ceil(flight.startT); t <= flight.endT; t++) {
    const ships = [];
    for (const { f, sub } of parts) {
      const leadSample = leadWindAt && sub.tracks[1] ? sampleAt(sub.tracks[1], t) : null;
      const one = readoutsAt(sub, t, { recordedG, leadWind: leadSample ? leadWindAt(t, leadSample.altFt) : null });
      for (const s of one.ships) ships.push({ ...s, slot: back(f, s.slot) });
    }
    const cells = [isoZ(t)];
    for (const tr of tracks) {
      const ship = ships.find((s) => s.slot === tr.slot);
      const hdg = headingAt(tr, t);
      const withHeading = { ...ship, headingDeg: hdg === null ? null : headingRadToCompassDeg(hdg) };
      for (const [, write] of SHIP_COLUMNS) cells.push(write(withHeading));
    }
    rows.push(cells);
  }
  return rows;
}

/** The whole file as text, lines ending CRLF as RFC 4180 has it. */
export function toCsv(flight, options) {
  return csvRows(flight, options).map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** "debrief-2026-09-30-1432Z.csv" from the flight's start. */
export function csvFileName(startT) {
  const iso = isoZ(startT);
  return `debrief-${iso.slice(0, 10)}-${iso.slice(11, 13)}${iso.slice(14, 16)}Z.csv`;
}
