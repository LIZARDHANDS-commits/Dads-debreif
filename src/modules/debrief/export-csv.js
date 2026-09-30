// The CSV export (SPEC-debrief: CSV export, #28): one row per second across
// the shared playback window, each ship's columns side by side. Every number
// is the one the readouts show at that second (readoutsAt), so the file and
// the screen never disagree. No page access, so it's tested in Node.
import { headingAt } from '../../flight-data/flight.js';
import { headingRadToCompassDeg } from '../../core/angles.js';
import { readoutsAt } from './readouts.js';

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
 */
export function csvRows(flight, { recordedG = false } = {}) {
  if (!flight) return [];
  const tracks = Object.values(flight.tracks).sort((a, b) => a.slot - b.slot);
  const header = ['time (Zulu)', ...tracks.flatMap((tr) => SHIP_COLUMNS.map(([name]) => `#${tr.slot} ${name}`))];
  const rows = [header];
  for (let t = Math.ceil(flight.startT); t <= flight.endT; t++) {
    const { ships } = readoutsAt(flight, t, { recordedG });
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
