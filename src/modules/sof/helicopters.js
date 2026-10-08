// Which live aircraft are helicopters (Dad, 8 Oct 2026: "make sure for traffic Helo traffic is a helo"), so the 2D layer and the 3D view draw them as
// helicopters and say so in words. Pure: an aircraft's checked relay fields in, true or false out.
//
// Two signs, either is enough:
// - the ADS-B emitter category A7, "rotorcraft" (DO-260B; readsb's `category`). The relay (relay/lib.js `trimOne`) does not pass `category` today, and
//   traffic.js does not read it, so for now the type designator alone decides; once the relay passes it, traffic.js only has to carry it here.
// - the ICAO aircraft type designator (relay `type`, from readsb's aircraft database) being a helicopter's, from the list below.
//
// The list: common helicopter type designators of ICAO Doc 8643 (Aircraft Type Designators), the ones likely round the T-6 bases (civil, police, air
// ambulance, and the Canadian and US military helicopters). Checked against Doc 8643: no, from memory, to verify. A designator missing from the list is
// drawn as a fixed-wing aircraft, as before; a wrong entry only changes the symbol and the words, never a caution.
// Left out on purpose: tilt-rotors (V22 Osprey, AW609), which fly their cruise like aeroplanes and are drawn as fixed-wing; autogyros and gliders.

/** ADS-B emitter category for rotorcraft (DO-260B, set A). */
export const ROTORCRAFT_CATEGORY = 'A7';

/**
 * Helicopter ICAO type designators (Doc 8643), from memory, to verify. The few marked "unsure" may not be designators at all; they are kept because no
 * fixed-wing type uses them, so a wrong one costs nothing.
 */
export const HELICOPTER_TYPES = Object.freeze(new Set([
  // Robinson
  'R22', 'R44', 'R66',
  // Bell (B06 JetRanger and LongRanger, B407, B212 and B412 twins (the CH-146 Griffon is a B412), B429, B505, B47G)
  'B06', 'B06T', 'B205', 'B212', 'B222', 'B230', 'B407', 'B412', 'B427', 'B429', 'B505', 'B47G', 'UH1',
  // Airbus / Eurocopter (AS350 AS50, AS355 AS55, AS365 AS65, AS332 AS32, EC120 EC20, EC130 EC30, EC135 EC35, EC145 EC45, EC155 EC55, EC175 EC75, EC225 EC25;
  // H145 unsure: the H145 is filed as EC45 as far as known), MBB BO105 and BK117, Aerospatiale Alouette, Gazelle, Puma
  'AS50', 'AS55', 'AS65', 'AS32', 'EC20', 'EC30', 'EC35', 'EC45', 'EC55', 'EC75', 'EC25', 'H145', 'B105', 'BK17', 'ALO2', 'ALO3', 'GAZL', 'PUMA', 'NH90',
  // Leonardo / AgustaWestland (AW109 A109, AW119 A119, AW139 A139, AW169 A169, AW189 A189; AW101, the CH-149 Cormorant, is EH10)
  'A109', 'A119', 'A139', 'A169', 'A189', 'EH10',
  // Sikorsky (S-76, S-92 (the CH-148 Cyclone is an S-92 derivative), S-61, S-64; H60 the UH-60 / S-70 Black Hawk family; S70 unsure)
  'S76', 'S92', 'S61', 'S64', 'H60', 'S70', 'H53',
  // Boeing (H47 the CH-47 Chinook, the CH-147; CH47 unsure), MD Helicopters and Hughes (H500 the 369 / MD 500, MD52 MD 520N, MD60 MD 600N, EXPL MD Explorer,
  // H269 the Hughes / Schweizer 269 and 300), Apache H64
  'H47', 'CH47', 'H64', 'H500', 'MD52', 'MD60', 'EXPL', 'H269',
  // Enstrom, Kaman K-MAX, Guimbal Cabri, Mil, Kamov
  'EN28', 'EN48', 'KMAX', 'G2CA', 'MI8', 'MI24', 'KA32',
]));

/**
 * Whether an aircraft is a helicopter: emitter category A7, or a helicopter's type designator. `a` is any object with `type` (and, later, `category`) as
 * traffic.js reads them; anything missing or unreadable is not a helicopter. A T-6 (TEX2) is never one.
 */
export function isHelicopter(a) {
  if (!a || typeof a !== 'object') return false;
  if (a.category === ROTORCRAFT_CATEGORY) return true;
  return typeof a.type === 'string' && HELICOPTER_TYPES.has(a.type.trim().toUpperCase());
}
