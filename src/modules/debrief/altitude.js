// The altitude check setting (DB-28; Dad, 11 Oct 2026: "Each aircraft should be taxiing on the same plane for sure on the taxiways and same
// with touch down, so that should help with the altitude error"): per ship, whether its GPS heights are corrected from its ground fixes
// (flight-data altitude.js), the flight corrected that way, and what the screen says about it. Plain values, no page access.
import { altitudeCheck, correctAltitudes, ALTITUDE_CHECK } from '../../flight-data/altitude.js';
import { MAX_SHIPS } from '../../flight-data/load.js';

/** The Altitude choices; 'auto' (the default) corrects every ship that has ground fixes. */
export const ALTITUDE_CHOICES = Object.freeze([
  Object.freeze({ value: 'auto', label: 'Corrected from the ground (auto)' }),
  Object.freeze({ value: 'recorded', label: 'As recorded' }),
]);

/** Only the ships set to As recorded, as { slot: { recorded: true } }, from anything stored (outside data, so checked). */
export function readAltitudes(value) {
  const out = {};
  if (!value || typeof value !== 'object') return out;
  for (let slot = 1; slot <= MAX_SHIPS; slot++) if (value[slot]?.recorded === true) out[slot] = { recorded: true };
  return out;
}

/** Where a flight's altitude choices are kept in this browser, beside its GPS puck and timestamp choices. */
export function altitudeStorageKey(fingerprint) {
  return `debrief:altitude:${fingerprint}`;
}

/**
 * The flight with each ship's heights as chosen: the check worked out on the flight given (timestamps snapped, pucks moved) against the
 * terrain `refAt(lat, lon)` (feet, NaN where unknown; null while there is none), then every ship on auto corrected. `terrain` is the
 * tiles' state ('loading', 'ready', 'failed' or 'none'), kept on the flight for the words. Each track gains `altitude` (correctAltitudes).
 */
export function withAltitudes(flight, choices, { refAt = null, terrain = 'none' } = {}) {
  if (!flight) return flight;
  const check = altitudeCheck(flight, { refAt });
  const out = correctAltitudes(flight, check, readAltitudes(choices));
  return { ...out, altitudeCheck: { source: check.source, leadSlot: check.leadSlot, terrain } };
}

/** "+7 ft", "−1 ft", "0 ft": rounded feet with a real minus sign. */
const signedFt = (v) => {
  const r = Math.round(v);
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r)} ft`;
};

/** What the reference was, in words, for the box's hint and the status details. */
export function altitudeSourceWords(flight) {
  const c = flight?.altitudeCheck;
  if (!c) return '';
  const why = c.terrain === 'loading' ? 'terrain heights still loading' : c.terrain === 'failed' ? "terrain heights didn't load" : 'no terrain heights';
  if (c.source === 'terrain') return 'Each ship against the terrain under its ground fixes (Mapzen/AWS terrain tiles) and the other ships';
  if (c.source === 'spots') return `Each ship against ${c.perFlight ? "its flight's Lead" : `#${c.leadSlot}`} at the same spots on the ground (${why})`;
  if (c.source === 'level') return `Each ship against the others on one flat ground level (${why}; slopes not allowed for)`;
  return '';
}

/**
 * The box's check line for a ship, e.g. "#3 altitude: +7 ft at taxi out, −1 ft at taxi in, corrected (drift −8 ft)"; + is a ship that
 * read higher than the others on the same ground. Says low confidence and why, or why nothing was corrected.
 */
export function altitudeLine(track, label = (slot) => `#${slot}`) {
  const a = track?.altitude;
  if (!a) return '';
  const head = `${label(track.slot)} altitude:`;
  if (a.confidence === 'none') return `${head} as recorded (${a.why})`;
  const parts = [];
  if (a.used === 'all') parts.push(`${signedFt(a.startFt)} on the ground`);
  else {
    if (a.startFt !== null) parts.push(`${signedFt(a.startFt)} at taxi out`);
    if (a.endFt !== null) parts.push(`${signedFt(a.endFt)} at taxi in`);
  }
  const done = a.corrected ? 'corrected' : 'kept as recorded';
  const drift = a.driftFt !== null ? ` (drift ${signedFt(a.driftFt)})` : '';
  const low = a.confidence === 'low' ? `; low confidence: ${a.why}` : '';
  return `${head} ${parts.join(', ')}, ${done}${drift}${low}`;
}

/** One ship's status-details line about its heights, or null when the check has nothing to say. */
export function altitudeStatusLine(track) {
  const a = track?.altitude;
  if (!a || a.confidence === 'none') return null;
  return `Altitude check: ${altitudeLine(track, () => '').replace(/^ altitude: /, '')}`;
}

/** The status line's words for the ships corrected, e.g. "#2, #3, #4 altitudes corrected from the ground", or ''. */
export function altitudeSummary(flight, label = (slot) => `#${slot}`) {
  if (!flight) return '';
  const done = Object.values(flight.tracks).filter((tr) => tr.altitude?.corrected).sort((a, b) => a.slot - b.slot);
  if (!done.length) return '';
  const low = done.some((tr) => tr.altitude.confidence === 'low') ? ' (low confidence for some)' : '';
  if (done.length > 4) return `${done.length} ships' altitudes corrected from the ground${low}`; // an exercise (DB-37): a count, not 16 names
  return `${done.map((tr) => label(tr.slot)).join(', ')} ${done.length === 1 ? 'altitude' : 'altitudes'} corrected from the ground${low}`;
}

/** The CSV's note after a corrected ship's altitude header, e.g. " (corrected from the ground +7 to −1 ft)", or ''. */
export function altitudeHeaderNote(track) {
  const a = track?.altitude;
  if (!a?.corrected) return '';
  const span = a.startFt !== null && a.endFt !== null ? `${signedFt(a.startFt)} to ${signedFt(a.endFt)}` : signedFt(a.startFt ?? a.endFt);
  return ` (corrected from the ground, ${span.replace(/ ft to /, ' to ')} taken off)`;
}

export { ALTITUDE_CHECK };
