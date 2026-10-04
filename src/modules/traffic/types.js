// Aircraft types and performance profiles for the Traffic Pattern Sim (SPEC-traffic,
// "Wind and aircraft types"; tasks 11 and 13; Milestone 1 Core 4).
//
// Defines circuit and pattern speeds (KIAS) for the 15 Wing Moose Jaw aircraft:
//   - CT-156 Harvard II (default trainer)
//   - CT-102B Astra II (Grob G 120TP) — elementary trainer (CT-102 alias)
//   - CT-157 Siskin II (Pilatus PC-21) — advanced turboprop trainer
//   - CT-155 Hawk (lead-in fighter trainer)
//   - CT-114 Tutor (Snowbirds demo jet)
//   - CF-188 Hornet (tactical fighter)

const ct102bProfile = Object.freeze({
  id: 'CT-102B',
  name: 'Astra II',
  designation: 'Grob G 120TP',
  role: 'Elementary Flight Trainer',
  speeds: Object.freeze({
    entry: 180,
    break: 180,
    pattern: 180,
    closed: 120,
    downwind: 120,
    base: 120,
    finalTurn: 100,
    approach: 100,
    threshold: 80,
    landing: 80,
  }),
  color: '#ffcc66',
  fallbackKt: 150,
});

/** Standard aircraft type profiles and circuit speeds (KIAS). */
/** Real length of a T-6 nose to tail, feet (33 ft 4 in; the value the 3D view has used, not yet cited to a manual page). The 2D and 3D views draw aircraft no smaller than this. */
export const T6_LENGTH_FT = 33.4;

export const AIRCRAFT_TYPES = Object.freeze({
  'CT-156': Object.freeze({
    id: 'CT-156',
    name: 'Harvard II',
    designation: 'Beechcraft T-6A',
    role: 'Primary/Basic Flight Trainer',
    speeds: Object.freeze({
      entry: 220,
      break: 220,
      pattern: 220,
      closed: 140,
      downwind: 120,
      base: 140,
      finalTurn: 120,
      approach: 120,
      threshold: 100,
      landing: 100,
    }),
    color: '#7ee787',
    fallbackKt: 180,
  }),
  'CT-102B': ct102bProfile,
  'CT-102': ct102bProfile,
  'CT-157': Object.freeze({
    id: 'CT-157',
    name: 'Siskin II',
    designation: 'Pilatus PC-21',
    role: 'Advanced Turboprop Trainer',
    speeds: Object.freeze({
      entry: 220,
      break: 220,
      pattern: 220,
      closed: 140,
      downwind: 120,
      base: 140,
      finalTurn: 120,
      approach: 120,
      threshold: 100,
      landing: 100,
    }),
    color: '#a5d6ff',
    fallbackKt: 125,
  }),
  'CT-155': Object.freeze({
    id: 'CT-155',
    name: 'Hawk',
    designation: 'BAE Hawk 115',
    role: 'Fighter Lead-In Trainer',
    speeds: Object.freeze({
      entry: 300,
      break: 300,
      pattern: 300,
      closed: 175,
      downwind: 160,
      base: 175,
      finalTurn: 150,
      approach: 150,
      threshold: 130,
      landing: 130,
    }),
    color: '#d29922',
    fallbackKt: 250,
  }),
  'CT-114': Object.freeze({
    id: 'CT-114',
    name: 'Tutor',
    designation: 'Canadair CT-114 Tutor',
    role: 'Jet Trainer / Snowbirds Aerobatic',
    speeds: Object.freeze({
      entry: 230,
      break: 200,
      pattern: 200,
      closed: 140,
      downwind: 120,
      base: 130,
      finalTurn: 115,
      approach: 115,
      threshold: 95,
      landing: 95,
    }),
    color: '#ff6b6b',
    fallbackKt: 230,
  }),
  'CF-188': Object.freeze({
    id: 'CF-188',
    name: 'Hornet',
    designation: 'McDonnell Douglas CF-188',
    role: 'Multirole Tactical Fighter',
    speeds: Object.freeze({
      entry: 350,
      break: 350,
      pattern: 350,
      closed: 180,
      downwind: 160,
      base: 180,
      finalTurn: 150,
      approach: 150,
      threshold: 135,
      landing: 135,
    }),
    color: '#56d4dd',
    fallbackKt: 300,
  }),
});

/** Standard colors for each aircraft type. */
export const TYPE_COLORS = Object.freeze(
  Object.fromEntries(Object.entries(AIRCRAFT_TYPES).map(([id, t]) => [id, t.color]))
);

/** Fallback knot speeds when route points have no speed specified. */
export const TYPE_FALLBACK_KT = Object.freeze(
  Object.fromEntries(Object.entries(AIRCRAFT_TYPES).map(([id, t]) => [id, t.fallbackKt]))
);

/** Default types offered in the spawner with primary trainer CT-156 first. */
export const SPAWN_TYPES = Object.freeze(['CT-156', 'CT-102B', 'CT-157', 'CT-155', 'CT-114', 'CF-188']);

/** All supported types including Hawk and Hornet. */
export const ALL_AIRCRAFT_TYPES = Object.freeze(Object.keys(AIRCRAFT_TYPES));

/** Checks if a type identifier is known. */
export const isKnownType = (type) => Object.hasOwn(AIRCRAFT_TYPES, type);

/** Retrieves the profile for an aircraft type, falling back to CT-156. */
export const typeProfile = (type) => AIRCRAFT_TYPES[type] ?? AIRCRAFT_TYPES['CT-156'];

/**
 * Returns the speed (KIAS) for an aircraft type in a given flight phase.
 * @param {string} type aircraft type id (e.g. 'CT-156')
 * @param {string} phase phase name (entry, break, pattern, closed, downwind, base, finalTurn, approach, threshold, landing)
 * @returns {number} indicated airspeed in knots
 */
export function phaseSpeedFor(type, phase) {
  const profile = typeProfile(type);
  const key = String(phase).toLowerCase().replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''));
  return profile.speeds[key] ?? profile.speeds[phase] ?? profile.fallbackKt;
}
