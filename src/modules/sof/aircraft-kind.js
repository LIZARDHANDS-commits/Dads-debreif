// What kind of aircraft each live aircraft is, so the 2D layer and the 3D view draw it with its own simple shape and say its kind in words (Dad, 8 Oct
// 2026: "the callsign and aircraft display should be more customizable", with aircraft drawn by kind). Pure: an aircraft's checked relay fields in, a kind out.
// It only changes a symbol and words, never a caution or a check.
//
// The kinds: 't6' (type TEX2, the CT-156 Harvard II: always and only that), 'helicopter' (helicopters.js `isHelicopter`), 'airliner', 'bizjet' (business
// jet), 'light' (Cessna-type light civil), 'mil-cargo' (military transport, cargo or tanker), 'mil-fast' (fighter or jet trainer) and 'other'.
//
// Three signs, in this order:
// 1. The ICAO aircraft type designator (relay `type`, from readsb's aircraft database), on the lists below. The lists are common designators of ICAO Doc 8643
//    (Aircraft Type Designators), the ones likely round the T-6 bases. Checked against Doc 8643: no, from memory, to verify. A few marked "unsure" may not be
//    designators at all; they are kept because nothing else uses them, so a wrong one costs nothing. A designator on no list falls through to the next signs.
// 2. The relay's military flag (readsb dbFlags bit 0): an airliner-type with it is a military transport or tanker (the CC-330 Husky is an A332, the CC-150
//    Polaris an A310); a military flag alone does not make a kind (it keeps the amber colour whatever its kind).
// 3. The ADS-B emitter category (DO-260B set A, readsb `category`) when the relay passes it (it does not yet, 8 Oct 2026; traffic.js carries it when it comes):
//    A1 light (under 15,500 lb), A2 small (to 75,000 lb), A3 large (to 300,000 lb), A4 high vortex large (the B757), A5 heavy, A6 high performance (over 5 G
//    and 400 kt), A7 rotorcraft; B1 glider, B4 ultralight. A1, B1 and B4 are 'light', A2 'bizjet', A3 to A5 'airliner' (or 'mil-cargo' with the military
//    flag), A6 'mil-fast'.
// Anything else is 'other' (the plain stand-in shape, as before).
import { isHelicopter } from './helicopters.js';

/** The relay's type code for the T-6 (Harvard II): always the T-6, never any other kind. */
export const T6_TYPE = 'TEX2';

/** Every kind, in the order the key lists them. */
export const AIRCRAFT_KINDS = Object.freeze(['t6', 'helicopter', 'airliner', 'bizjet', 'light', 'mil-cargo', 'mil-fast', 'other']);

/** Each kind in words, for the hover facts and the key. */
export const KIND_WORDS = Object.freeze({
  t6: 'T-6 (CT-156 Harvard II)',
  helicopter: 'Helicopter',
  airliner: 'Airliner',
  bizjet: 'Business jet',
  light: 'Light aircraft',
  'mil-cargo': 'Military transport or tanker',
  'mil-fast': 'Fighter or jet trainer',
  other: 'Aircraft of unknown kind',
});

const set = (list) => Object.freeze(new Set(list));

/** Airliners and regional airliners (jets and turboprops), ICAO Doc 8643 designators, from memory, to verify. */
export const AIRLINER_TYPES = set([
  // Airbus
  'A318', 'A319', 'A320', 'A321', 'A19N', 'A20N', 'A21N', 'A306', 'A30B', 'A310', 'A332', 'A333', 'A338', 'A339', 'A342', 'A343', 'A345', 'A346', 'A359', 'A35K', 'A388',
  'BCS1', 'BCS3', // A220-100 and -300 (Bombardier CSeries)
  // Boeing
  'B712', 'B721', 'B722', 'B732', 'B733', 'B734', 'B735', 'B736', 'B737', 'B738', 'B739', 'B37M', 'B38M', 'B39M', 'B3XM',
  'B741', 'B742', 'B743', 'B744', 'B748', 'B74S', 'B752', 'B753', 'B762', 'B763', 'B764', 'B772', 'B773', 'B77L', 'B77W', 'B778', 'B779', 'B788', 'B789', 'B78X',
  'MD11', 'MD80', 'MD81', 'MD82', 'MD83', 'MD87', 'MD88', 'MD90', 'DC10', 'DC93', 'DC95',
  // Bombardier and Embraer regional jets
  'CRJ1', 'CRJ2', 'CRJ7', 'CRJ9', 'CRJX', 'E135', 'E145', 'E45X', 'E170', 'E175', 'E75L', 'E75S', 'E190', 'E195', 'E290', 'E295',
  // Regional turboprops (Dash 8, ATR, Saab, Dornier 328)
  'DH8A', 'DH8B', 'DH8C', 'DH8D', 'AT43', 'AT45', 'AT72', 'AT75', 'AT76', 'SF34', 'SB20', 'D328', 'J328',
  // Others
  'F70', 'F100', 'RJ70', 'RJ85', 'RJ1H', 'B461', 'B462', 'B463', 'C919', 'A124', 'IL76',
]);

/** Business jets, ICAO Doc 8643 designators, from memory, to verify. */
export const BIZJET_TYPES = set([
  // Cessna Citation family
  'C500', 'C501', 'C510', 'C525', 'C25A', 'C25B', 'C25C', 'C25M', 'C550', 'C551', 'C55B', 'C560', 'C56X', 'C650', 'C680', 'C68A', 'C700', 'C750',
  // Bombardier Learjet, Challenger and Global
  'LJ31', 'LJ35', 'LJ40', 'LJ45', 'LJ55', 'LJ60', 'LJ70', 'LJ75', 'CL30', 'CL35', 'CL60', 'GLEX', 'GL5T', 'GL7T',
  // Gulfstream, Dassault Falcon, Embraer, Hawker and Beech, others
  'GLF4', 'GLF5', 'GLF6', 'G150', 'G280', 'GALX', 'ASTR', 'FA10', 'FA20', 'FA50', 'F2TH', 'F900', 'FA7X', 'FA8X',
  'E50P', 'E55P', 'E545', 'E550', 'E35L', 'H25B', 'H25C', 'HA4T', 'BE40', 'PRM1', 'PC24', 'HDJT', 'EA50', 'SF50',
]);

/** Light civil aircraft (Cessna-type singles and light twins, crop sprayers, bush aircraft), ICAO Doc 8643 designators, from memory, to verify. */
export const LIGHT_TYPES = set([
  // Cessna
  'C150', 'C152', 'C162', 'C170', 'C172', 'C175', 'C177', 'C180', 'C182', 'C185', 'C188', 'C195', 'C205', 'C206', 'C207', 'C208', 'C210', 'C310', 'C337', 'C340', 'C402', 'C414', 'C421',
  // Piper
  'J3', 'PA12', 'PA18', 'PA22', 'PA24', 'PA25', 'PA27', 'PA30', 'PA31', 'PA34', 'PA36', 'PA44', 'PA46', 'P28A', 'P28B', 'P28R', 'P28T', 'P32R', 'P32T', 'P46T',
  // Beech, Mooney, Cirrus, Diamond, Grumman American, Vans, Bellanca and Champion
  'BE23', 'BE33', 'BE35', 'BE36', 'BE55', 'BE58', 'BE76', 'BE95', 'M20P', 'M20T', 'SR20', 'SR22', 'S22T', 'DA20', 'DV20', 'DA40', 'DA42', 'DA62', 'AA1', 'AA5',
  'RV4', 'RV6', 'RV7', 'RV8', 'RV9', 'RV10', 'RV12', 'RV14', 'BL8', 'CH7A', 'CH7B',
  // de Havilland Canada bush aircraft, Air Tractor crop sprayers (common on the prairies), Gippsland
  'DHC2', 'DHC3', 'AT3T', 'AT4T', 'AT5T', 'AT6T', 'AT8T', 'GA8',
]);

/** Military transports, cargo aircraft and tankers, ICAO Doc 8643 designators, from memory, to verify. */
export const MIL_CARGO_TYPES = set([
  'C130', 'C30J', 'C17', 'C5', 'C5M', 'A400', 'C160', 'C27J', 'C295', 'CN35', 'K35R', 'K35E', 'KC46' /* unsure */, 'R135', 'E3TF', 'E3CF', 'E6', 'P3', 'P8', 'C2', 'E2',
]);

/** Fighters, attack aircraft and jet trainers, ICAO Doc 8643 designators, from memory, to verify. */
export const MIL_FAST_TYPES = set([
  'F4', 'F5', 'F14', 'F15', 'F16', 'F18', 'F18S' /* unsure */, 'F22', 'F35', 'F117', 'A4', 'A10', 'HAR' /* unsure */, 'EUFI', 'RFAL', 'GRIF' /* unsure */, 'MIR2', 'TOR',
  'T38', 'T45', 'T7' /* unsure */, 'HAWK', 'L39', 'L159', 'M346', 'CL41' /* unsure: the CT-114 Tutor */, 'B1',
]);

const CATEGORY = /^[A-D][0-7]$/;

/**
 * The kind of one aircraft (see the top of this file). `a` is any object with `type`, `mil` and, when the relay passes it, `category`, as traffic.js reads
 * them; anything missing or unreadable is left out of the choice. A TEX2 is always 't6'.
 * @param {{ type?: any, mil?: any, category?: any } | null | undefined} a
 * @returns {string}
 */
export function aircraftKind(a) {
  if (!a || typeof a !== 'object') return 'other';
  const type = typeof a.type === 'string' ? a.type.trim().toUpperCase() : '';
  const mil = a.mil === true;
  if (type === T6_TYPE) return 't6';
  if (isHelicopter(a)) return 'helicopter';
  if (MIL_FAST_TYPES.has(type)) return 'mil-fast';
  if (MIL_CARGO_TYPES.has(type)) return 'mil-cargo';
  if (AIRLINER_TYPES.has(type)) return mil ? 'mil-cargo' : 'airliner';
  if (BIZJET_TYPES.has(type)) return 'bizjet';
  if (LIGHT_TYPES.has(type)) return 'light';
  const category = typeof a.category === 'string' && CATEGORY.test(a.category) ? a.category : null;
  if (category === 'A6') return 'mil-fast';
  if (category === 'A3' || category === 'A4' || category === 'A5') return mil ? 'mil-cargo' : 'airliner';
  if (category === 'A2') return 'bizjet';
  if (category === 'A1' || category === 'B1' || category === 'B4') return 'light';
  return 'other';
}

/** The "Names shown for" choices (SOF settings, Traffic display; Dad, 8 Oct 2026): every aircraft (the default), T-6s and military only, or T-6s only. */
export const NAMES_FOR = Object.freeze(['all', 't6-mil', 't6']);

/**
 * Whether an aircraft's name tag may show under the "Names shown for" choice: 'all' (anything else reads as all), 't6-mil' (a T-6, or one the relay marks
 * military), 't6' (a T-6 only). `a` is { type } or { isT6 }, with `mil`. The hover facts are never hidden by it.
 */
export function showsName(a, namesFor = 'all') {
  const t6 = a?.isT6 === true || (typeof a?.type === 'string' && a.type.trim().toUpperCase() === T6_TYPE);
  if (namesFor === 't6') return t6;
  if (namesFor === 't6-mil') return t6 || a?.mil === true;
  return true;
}
