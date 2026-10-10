// The GPS puck setting (DB-23; Dad's ask, 10 Oct 2026): which cockpit each ship's portable GPS sat in, where that is in
// the aircraft, the flight with each ship moved from its puck, and what the screen says about it. Plain values, no
// page access.
import { movePuck } from '../../flight-data/puck.js';
import { GLARESHIELD_FT, REAR_HUMP_FT } from '../../ui-kit/ct156-cockpit.js';

/** The choices, in the order the menu shows them; '' is Not set (the default: positions as recorded). */
export const PUCK_CHOICES = Object.freeze([
  Object.freeze({ value: '', label: 'Not set' }),
  Object.freeze({ value: 'front', label: 'Front cockpit' }),
  Object.freeze({ value: 'rear', label: 'Rear cockpit' }),
]);

/**
 * Where the puck sits, feet from the aircraft's reference point (the 3D model's origin) in its axes (x forward, y left,
 * z up). DB-Q25's working answer: on the chosen cockpit's glareshield, on the centre line, at the coaming's aft edge
 * and crown. ESTIMATES off the CT-156 cockpit model (TS-157): front 3.35 ft ahead and 1.85 ft up (GLARESHIELD_FT),
 * rear 0.8 ft aft and 1.9 ft up (REAR_HUMP_FT). One copy of each number: they are read from the cockpit's own.
 */
export const PUCK_OFFSETS_FT = Object.freeze({
  front: Object.freeze({ x: GLARESHIELD_FT.aftX, y: 0, z: GLARESHIELD_FT.top }),
  rear: Object.freeze({ x: REAR_HUMP_FT.aftX, y: 0, z: REAR_HUMP_FT.top }),
});

const SEATS = Object.keys(PUCK_OFFSETS_FT);

/** A stored or file value back as a seat ('front' or 'rear'), or '' (Not set) for anything else. */
export function puckSeat(value) {
  return SEATS.includes(value) ? value : '';
}

/** Only the ships with a seat set, as { slot: seat }, from anything stored (outside data, so checked). */
export function readPucks(value) {
  const out = {};
  if (!value || typeof value !== 'object') return out;
  for (let slot = 1; slot <= 4; slot++) {
    const seat = puckSeat(value[slot]);
    if (seat) out[slot] = seat;
  }
  return out;
}

/** Where a flight's puck choices are kept in this browser, beside its DFPs (dfp.js dfpStorageKey). */
export function puckStorageKey(fingerprint) {
  return `debrief:pucks:${fingerprint}`;
}

/**
 * The flight with each ship that has a puck set moved from it to the aircraft (flight-data movePuck); the same flight
 * object when none is set, so Not set is exactly today's flight. Each moved track gains `puck: { seat, offsetFt }`.
 */
export function withPucks(flight, pucks) {
  if (!flight) return flight;
  const set = Object.entries(readPucks(pucks)).filter(([slot]) => flight.tracks[slot]);
  if (!set.length) return flight;
  const tracks = { ...flight.tracks };
  for (const [slot, seat] of set) {
    const moved = movePuck(flight.tracks[slot], flight.ref, PUCK_OFFSETS_FT[seat]);
    tracks[slot] = { ...moved, puck: { ...moved.puck, seat } };
  }
  return { ...flight, tracks };
}

/** How far the puck's offset moves a ship, feet, to the nearest foot (at least 1). */
export function puckMoveFt(seat) {
  const o = PUCK_OFFSETS_FT[seat];
  return o ? Math.max(1, Math.round(Math.hypot(o.x, o.y, o.z))) : 0;
}

/** "rear-cockpit", for the words. */
const seatWords = (seat) => `${seat}-cockpit`;

/** The status line's words for the ships moved, e.g. "#2 moved from its rear-cockpit GPS puck", or ''. */
export function puckSummary(flight) {
  if (!flight) return '';
  const moved = Object.values(flight.tracks).filter((tr) => tr.puck?.seat).sort((a, b) => a.slot - b.slot);
  if (!moved.length) return '';
  if (moved.length === 1) return `#${moved[0].slot} moved from its ${seatWords(moved[0].puck.seat)} GPS puck`;
  return `${moved.map((tr) => `#${tr.slot}`).join(', ')} moved from their GPS pucks`;
}

/** One ship's status-details line when its puck is set, or null. */
export function puckLine(track) {
  const seat = track?.puck?.seat;
  if (!seat) return null;
  return `Positions moved from the ${seatWords(seat)} GPS puck to the aircraft, about ${puckMoveFt(seat)} ft (estimate)`;
}

/** The CSV's note after a moved ship's position headers, e.g. " (moved from rear-cockpit puck)", or ''. */
export function puckHeaderNote(track) {
  const seat = track?.puck?.seat;
  return seat ? ` (moved from ${seatWords(seat)} puck)` : '';
}
