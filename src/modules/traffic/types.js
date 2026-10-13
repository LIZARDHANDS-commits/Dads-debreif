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
//
// Each profile also says how that type flies (plan Step 5c Phase 1; spec 4.19):
//   - perf: its performance set (core aircraft-performance.js): the T-6A's for the CT-156, the Astra II's for the
//     CT-102B (and its old name CT-102); null for a type with no set yet, which flies on the T-6A's, as every type
//     always has (perfFor). The simulated pilot flies with it (astra-circuit.js) and the path follower reads it by the
//     aircraft's type (path-follower.js, plan Step 5c Phase 3).
//   - patternRouteId: the route of kind 'pattern' it flies lap after lap: PAT1 (the overhead break) for the CT-156 and
//     every type without its own. The CT-102B's is PAT_ASTRA, the Astra pattern route (data/moose-jaw.json); sim.js
//     patternFor reads it, and never puts a CT-102B on PAT1 when PAT_ASTRA is missing (spec 4.19 item 8).
//   - lengthFt: nose to tail, feet, for drawing at the right size; null where no source is held.
//   - modelKind: the 3D model it is drawn with: 'ct156' (the Harvard) or 'standin' (the plain stand-in), as
//     view3d.js modelKindFor draws today.
//   - tagWord: what the behaviour tag calls its pattern lap: 'OHB' for the overhead break, 'ASTRA' for the Astra's
//     (TR-160, a working answer not yet confirmed with Patrick).
// The CT-156 is the default type (typeProfile).
import { T6A_PERFORMANCE } from '../../core/t6-performance.js';
import { CT102B_PERFORMANCE, CT102B_AIRFRAME } from '../../core/ct102b-performance.js';
import { estimatesIn } from '../../core/aircraft-performance.js';

/** Real length of a T-6 nose to tail, feet (33 ft 4 in; the value the 3D view has used, not yet cited to a manual page). */
export const T6_LENGTH_FT = 33.4;

/** What a type with no flying numbers of its own carries: no set (the T-6A's is flown), PAT1, no length, the stand-in. */
const NO_PERF = Object.freeze({ perf: null, patternRouteId: 'PAT1', lengthFt: null, modelKind: 'standin', tagWord: 'OHB' });

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
  perf: CT102B_PERFORMANCE,
  patternRouteId: 'PAT_ASTRA',
  lengthFt: CT102B_AIRFRAME.lengthFt, // 27.62 ft (8.42 m), the EASA type certificate sheet (sources.md P2); unchecked
  modelKind: 'standin',
  tagWord: 'ASTRA',
});

/** Standard aircraft type profiles and circuit speeds (KIAS). */

/**
 * The smallest an aircraft is drawn on the ground, feet, so zoomed in close it stops shrinking against the ground at
 * about half 29L's 150 ft width, about 2.2 times a real T-6 (Patrick, 5 Oct: "stop getting smaller when their wings
 * are about ... 1/2 of the runway width"). A drawing size only: the flying uses real sizes.
 */
export const CLOSE_UP_DRAW_FT = 75;

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
    perf: T6A_PERFORMANCE,
    patternRouteId: 'PAT1',
    lengthFt: T6_LENGTH_FT,
    modelKind: 'ct156',
    tagWord: 'OHB',
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
    ...NO_PERF,
    modelKind: 'ct156',
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
    ...NO_PERF,
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
    ...NO_PERF,
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
    ...NO_PERF,
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
// The first version offered the CT-156 Harvard II only (TR-R16; Patrick, 4 Oct 01:31Z). The CT-102B Astra II joins it with
// its own pattern (plan Step 5c Phase 3; spec 4.19 item 6; Patrick's go-ahead relayed by Dad, 13 Oct 2026); the spawner offers
// it only when the setup has its pattern route. The other types stay in AIRCRAFT_TYPES for later.
export const SPAWN_TYPES = Object.freeze(['CT-156', 'CT-102B']);

/** All supported types including Hawk and Hornet. */
export const ALL_AIRCRAFT_TYPES = Object.freeze(Object.keys(AIRCRAFT_TYPES));

/** Checks if a type identifier is known. */
export const isKnownType = (type) => Object.hasOwn(AIRCRAFT_TYPES, type);

/** Retrieves the profile for an aircraft type, falling back to CT-156. */
export const typeProfile = (type) => AIRCRAFT_TYPES[type] ?? AIRCRAFT_TYPES['CT-156'];

/** The performance set a type flies with: its own, or the T-6A's where it has none (as every type has flown so far). */
export const perfFor = (type) => typeProfile(type).perf ?? T6A_PERFORMANCE;

/**
 * True while any number in the type's own performance set is an estimate (core estimatesIn), so the screen flags it
 * " · est." (spec 4.19 item 5; review 3.2): the CT-102B today. The CT-156's set carries no source list, so never.
 */
export const numbersAreEstimates = (type) => estimatesIn(typeProfile(type).perf).length > 0;

/** How long a type is drawn against the T-6 (its lengthFt ÷ T6_LENGTH_FT; 1 where no length is held): the Astra 27.62 ÷ 33.4. */
export const lengthRatioFor = (type) => (Number.isFinite(typeProfile(type).lengthFt) ? typeProfile(type).lengthFt / T6_LENGTH_FT : 1);

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
