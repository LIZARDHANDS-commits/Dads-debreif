// Large exercises (DB-37; Dad, 15 Oct 2026; Patrick approved the plan, relayed by Dad, 16 Oct 2026): up to four flights
// of up to four ships, as a level above the four-ship Debrief. A ship's slot is one number from 1 to 16: flight 1 has
// 1 to 4, flight 2 has 5 to 8, and so on, so a load of four files or fewer is flight 1 alone and exactly as before.
// Everything the four-ship Debrief works out (the judging, the gap fill's pins, the altitude check's mean) is run on one
// flight's ships at a time through subFlight, which hands the existing code the four ships numbered 1 to 4; nothing here
// judges anything itself. Plain values, no page access, so it's tested in Node.
import { MAX_TRACKS, MAX_SHIPS } from '../../flight-data/load.js';
import { SHIP_COLORS, OUTLINED_SHIPS } from './state.js';
import { readoutsAt, formationAt } from './readouts.js';

/** Ships in a flight (one flight is today's four-ship Debrief). */
export const SHIPS_PER_FLIGHT = MAX_TRACKS;
export const MAX_FLIGHTS = MAX_SHIPS / SHIPS_PER_FLIGHT;
export { MAX_SHIPS };

/** A ship's flight (1 to 4), its number in that flight (1 = Lead to 4), and the slot of a flight's ship. */
export const flightOf = (slot) => Math.ceil(slot / SHIPS_PER_FLIGHT);
export const numberOf = (slot) => ((slot - 1) % SHIPS_PER_FLIGHT) + 1;
export const slotOf = (f, n) => (f - 1) * SHIPS_PER_FLIGHT + n;

/** Every ship slot an exercise can have, 1 to 16. */
export const ALL_SLOTS = Object.freeze(Array.from({ length: MAX_SHIPS }, (_, i) => i + 1));

/** An exercise: a flight with a ship past #4. Four files or fewer never are, so they stay exactly as before. */
export function isExercise(flight) {
  return Boolean(flight) && Object.keys(flight.tracks).some((s) => Number(s) > SHIPS_PER_FLIGHT);
}

/** The flights that have ships, in order: [{ f, slots }] (one entry, flight 1, for a load of four or fewer). */
export function flightGroups(flight) {
  if (!flight) return [];
  const by = new Map();
  for (const slot of Object.keys(flight.tracks).map(Number).sort((a, b) => a - b)) {
    const f = flightOf(slot);
    if (!by.has(f)) by.set(f, []);
    by.get(f).push(slot);
  }
  return [...by].map(([f, slots]) => ({ f, slots }));
}

/**
 * Flight f on its own, as the four-ship Debrief knows a flight: the same map and window, with that flight's ships
 * numbered 1 to 4 (each track's `slot` is its number; `shipSlot` keeps the exercise's). Not an exercise: the flight itself.
 */
export function subFlight(flight, f) {
  if (!isExercise(flight)) return flight;
  const tracks = {};
  for (let n = 1; n <= SHIPS_PER_FLIGHT; n++) {
    const tr = flight.tracks[slotOf(f, n)];
    if (tr) tracks[n] = { ...tr, slot: n, shipSlot: slotOf(f, n) };
  }
  return { ...flight, tracks };
}

/** Choices kept per ship ({ slot: value }) as flight f's, numbered 1 to 4. */
export function choicesOf(choices, f) {
  const out = {};
  for (let n = 1; n <= SHIPS_PER_FLIGHT; n++) if (choices?.[slotOf(f, n)] !== undefined) out[n] = choices[slotOf(f, n)];
  return out;
}

/**
 * Runs `fn(sub, f)` (which takes and returns a four-ship flight) on each flight of an exercise and puts the ships back
 * in their slots; the flight's own fields stay (the window is not changed: fn must not move times). `extra(results)`
 * may add fields from the flights' results. Not an exercise: fn on the flight itself.
 */
export function perFlight(flight, fn, extra = null) {
  if (!isExercise(flight)) return fn(flight, 1);
  const tracks = {};
  const results = [];
  for (const { f } of flightGroups(flight)) {
    const out = fn(subFlight(flight, f), f);
    results.push({ f, out });
    for (const [n, tr] of Object.entries(out.tracks)) {
      const slot = slotOf(f, Number(n));
      const back = { ...tr, slot };
      delete back.shipSlot;
      tracks[slot] = back;
    }
  }
  return { ...flight, tracks, ...(extra ? extra(results) : {}) };
}

/**
 * The gap fill (gap-fill.js fillGapsInSteps) run one flight at a time, so a gap is pinned only from its own flight's
 * ships, as in a four-ship load: a generator with fillGapsInSteps's steps and its result, the slots (and each
 * formation fill's refSlot) put back in the exercise's numbering. Not an exercise: run(flight) itself.
 */
export function* fillPerFlight(flight, run) {
  if (!isExercise(flight)) return yield* run(flight);
  const fills = {};
  const notFilled = [];
  const counts = { gaps: 0, filled: 0, formation: 0, ground: 0, notFilled: 0 };
  for (const { f } of flightGroups(flight)) {
    const result = yield* run(subFlight(flight, f));
    for (const [n, list] of Object.entries(result.fills)) {
      fills[slotOf(f, Number(n))] = list.map((fill) => ({
        ...fill, slot: slotOf(f, fill.slot), ...(Number.isFinite(fill.refSlot) ? { refSlot: slotOf(f, fill.refSlot) } : {}),
      }));
    }
    for (const g of result.notFilled) notFilled.push({ ...g, slot: slotOf(f, g.slot) });
    for (const k of Object.keys(counts)) counts[k] += result.counts[k] ?? 0;
  }
  return { fills, notFilled, counts };
}

/**
 * Each flight's readouts at time t, worked out by readoutsAt on that flight alone (the judging is the four-ship one,
 * used once per flight): [{ f, slots, readouts }], the rows numbered 1 to 4 inside the flight. optionsFor(f, sub):
 * readoutsAt's options for that flight (its Lead's wind).
 */
export function readoutsByFlight(flight, t, optionsFor) {
  return flightGroups(flight).map(({ f, slots }) => {
    const sub = subFlight(flight, f);
    return { f, slots, readouts: readoutsAt(sub, t, optionsFor(f, sub)) };
  });
}

/** The Formation-card rows of every flight at time t (formationAt per flight), each row's `slot` the exercise's. */
export function formationByFlight(flight, t, standards) {
  if (!isExercise(flight)) return formationAt(flight, t, standards);
  return flightGroups(flight).flatMap(({ f }) => formationAt(subFlight(flight, f), t, standards).map((row) => ({ ...row, slot: slotOf(f, row.slot) })));
}

// ── Call signs and aircraft ──────────────────────────────────────────────────

/** A call sign's longest length (characters); shown as text only. */
export const CALL_SIGN_MAX = 16;
/** Each flight's aircraft: '' takes 3D settings' Aircraft choice (the default); the rest are its model choices. */
export const FLIGHT_AIRCRAFT = Object.freeze([
  Object.freeze({ value: '', label: 'As 3D settings' }),
  Object.freeze({ value: 't6', label: 'Harvard (CT-156)' }),
  Object.freeze({ value: 't38a', label: 'T-38A Talon' }),
  Object.freeze({ value: 'c130j', label: 'C-130J Hercules' }),
]);
const TYPES = FLIGHT_AIRCRAFT.map((a) => a.value).filter(Boolean);
const AIRCRAFT_WORDS = Object.fromEntries(FLIGHT_AIRCRAFT.map((a) => [a.value, a.label]));

/** "Flight 1" to "Flight 4" until one is typed. */
export const defaultCallSign = (f) => `Flight ${f}`;

/** A typed call sign tidied: control characters out, spaces joined, at most CALL_SIGN_MAX characters; '' for none. */
export function cleanCallSign(value) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, CALL_SIGN_MAX).trim();
}

/** The flights' call signs and aircraft from anything stored or opened (outside data, so checked): { f: { callSign?, type? } }. */
export function readCrew(value) {
  const out = {};
  if (!value || typeof value !== 'object') return out;
  for (let f = 1; f <= MAX_FLIGHTS; f++) {
    const v = value[f];
    if (!v || typeof v !== 'object') continue;
    const one = {};
    const callSign = cleanCallSign(v.callSign);
    if (callSign) one.callSign = callSign;
    if (TYPES.includes(v.type)) one.type = v.type;
    if (Object.keys(one).length) out[f] = one;
  }
  return out;
}

/** Where a flight's call signs and aircraft are kept in this browser, beside its GPS puck choices. */
export function crewStorageKey(fingerprint) {
  return `debrief:crew:${fingerprint}`;
}

const CREW_PREFIX = 'exercise.';
/** The debrief file's rules for the call signs and aircraft (readDebriefFile drops anything else, or out of range). */
export const CREW_FILE_RULES = Object.freeze(Object.fromEntries(Array.from({ length: MAX_FLIGHTS }, (_, i) => i + 1).flatMap((f) => [
  [`${CREW_PREFIX}callSign.${f}`, { type: 'string', max: CALL_SIGN_MAX }],
  [`${CREW_PREFIX}type.${f}`, { type: 'string', oneOf: TYPES }],
])));

/** The call signs and aircraft as debrief file settings (only those set). */
export function crewForFile(crew) {
  const out = {};
  for (const [f, one] of Object.entries(readCrew(crew))) {
    if (one.callSign) out[`${CREW_PREFIX}callSign.${f}`] = one.callSign;
    if (one.type) out[`${CREW_PREFIX}type.${f}`] = one.type;
  }
  return out;
}

/** The file's call signs and aircraft, or null when it names none (each already range-checked by the reader; checked again). */
export function crewFromFile(settings) {
  const raw = {};
  for (let f = 1; f <= MAX_FLIGHTS; f++) {
    const callSign = settings?.[`${CREW_PREFIX}callSign.${f}`];
    const type = settings?.[`${CREW_PREFIX}type.${f}`];
    if (callSign !== undefined) (raw[f] ??= {}).callSign = callSign;
    if (type !== undefined) (raw[f] ??= {}).type = type;
  }
  const out = readCrew(raw);
  return Object.keys(out).length ? out : null;
}

// ── Colours and labels (ALL-42: numbers and a coloured label) ────────────────

/**
 * Each flight's colour family, Lead strongest to #4 lightest: blue, green, orange, violet. No red or yellow, which mean
 * danger and a forced landing on this tool's screens. Picked to read on the dark map and the 3D sky; the two lightest
 * shades carry the dark outline #4 has in a four-ship load.
 */
export const FLIGHT_COLORS = Object.freeze({
  1: Object.freeze(['#2f7bff', '#5f9dff', '#93bfff', '#cfe2ff']),
  2: Object.freeze(['#00b84a', '#36d474', '#86eaa8', '#cdf7dc']),
  3: Object.freeze(['#ff7a1a', '#ff9b4d', '#ffbe8a', '#ffe0c7']),
  4: Object.freeze(['#c04dff', '#d27aff', '#e3a8ff', '#f2d6ff']),
});
const OUTLINED_SHADES = new Set([3, 4]);

/**
 * How the ships of the shown flight look and are named, for every drawing and list: { exercise, label(slot),
 * color(slot), outlined(slot), number(slot), model(slot, aircraft), flights: [{ f, callSign, type, words, slots }] }.
 * Not an exercise: today's #1 to #4, SHIP_COLORS and outlines, every ship the 3D settings' Aircraft.
 */
export function shipLook(flight, crew = {}) {
  const exercise = isExercise(flight);
  const tidy = readCrew(crew);
  const flights = flightGroups(flight).map(({ f, slots }) => {
    const callSign = tidy[f]?.callSign || defaultCallSign(f);
    const type = tidy[f]?.type ?? '';
    return { f, slots, callSign, type, words: AIRCRAFT_WORDS[type] };
  });
  if (!exercise) {
    return {
      exercise: false, flights,
      label: (slot) => `#${slot}`,
      color: (slot) => SHIP_COLORS[slot],
      outlined: (slot) => OUTLINED_SHIPS.has(slot),
      number: (slot) => slot,
      model: (slot, aircraft) => aircraft,
    };
  }
  const callSigns = Object.fromEntries(flights.map((g) => [g.f, g.callSign]));
  const types = Object.fromEntries(flights.map((g) => [g.f, g.type]));
  return {
    exercise: true, flights,
    label: (slot) => `${callSigns[flightOf(slot)] ?? defaultCallSign(flightOf(slot))} ${numberOf(slot)}`,
    color: (slot) => FLIGHT_COLORS[flightOf(slot)]?.[numberOf(slot) - 1] ?? '#ffffff',
    outlined: (slot) => OUTLINED_SHADES.has(numberOf(slot)),
    number: (slot) => numberOf(slot),
    model: (slot, aircraft) => types[flightOf(slot)] || aircraft,
  };
}

