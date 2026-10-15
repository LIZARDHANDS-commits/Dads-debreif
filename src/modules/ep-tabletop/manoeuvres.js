// The student's picks (docs/modules/ep-tabletop/systems-plan.md section 4.1; EP-13, EP-14; plan Step 5): the plain-word list as data,
// each with an id, its words, the fields it needs and the small pilot that flies it. flight.js runs the pilots on the shared point mass
// (section 4.2); this file holds only the pilots' own choices (which way to bank, what path and speed to aim for), never a formula of the
// aircraft: every law below is built from core (dampedClimbG, windTriangle, the excess-power callback flight.js hands in).
//
// Controlled content (EP-3): plain manoeuvre words only. No boldface or checklist words, never their numbers, and nothing in a label says
// which choice is right; the consequences show it.
//
// A pick is { manoeuvre: id, headingDegM?, fieldIcao? }. A pick sets one or both halves of what the aircraft is doing:
//   lateral   where the nose goes (straight, a turn to a heading, toward a field, an orbit): the pilot asks for a bank;
//   vertical  the path and the speed (level, climb, descend, zoom, glide, slow down, speed up): the pilot asks for the G that holds its
//             path wings level (flight.js divides by the cosine of the bank) and a throttle (0 to 1).
// "Fly straight and level" sets both; a turn keeps the vertical half (a turn in a glide stays a glide); gear and flaps change only the
// configuration. Declare and Eject have no pilot: Declare marks D on the step track (scenario.js), Eject ends the flight.
// Not built yet: "Set up a forced-landing pattern (High Key over the chosen field)": it waits for a later step (the PFL pattern is Traffic's
// to share, and Step 6 brings the student's own list).
//
// Every pilot reads `now` (made by flight.js each step):
//   { kias, ktas, vFtps, gammaRad, headingDegT, altFt, bankDeg, x, y, groundFt, stallKias, floorKias, gear, flaps,
//     excessAt(throttle, g): the excess power ÷ weight at this speed and height for a throttle (engine state and configuration in it),
//     windFromDegT, windKt, fields: [{ icao, point: { x, y } }] }
// and returns its new memory with what it asks for. Memory is plain data (the session is copied and sent), started by the pick's start().
//
// Every number names its source; "estimate" where no manual page or Patrick's ruling gives it (EP-Q5 is still open with Patrick: this is
// built on its working answer (a), the shared point mass).
import { dampedClimbG } from '../../core/flight-math.js';
import { windTriangle } from '../../core/wind.js';
import { wrapDeg180, wrapDeg360, compassDegFromVector, DEG } from '../../core/angles.js';
import { KT_TO_FTPS, G_FTPS2 } from '../../core/units.js';
import { PFL } from '../traffic/pfl-geometry.js';

/** The pilots' numbers. Each has its source; "estimate" where none backs it yet (systems-plan section 9). */
export const PILOT = Object.freeze({
  /** Bank for a turn to a heading or toward a field: 30°, "gentle" (systems-plan section 9; the Formation sim's gentle, AFM7 brief p.17). An estimate for the EP. */
  turnBankDeg: 30,
  /** Orbit here: 30° of bank (SMM 13.5 para 11, the orbit to lose height; Traffic's PFL.orbitBankDeg). Left, an estimate. */
  orbitBankDeg: PFL.orbitBankDeg,
  /** Degrees of bank per degree of heading still to go, as the turn rolls out onto a heading: an estimate for a smooth roll-out. */
  bankPerHeadingDeg: 2.5,
  /** Climb and descend: an 8° flight path (systems-plan section 9, "8°, estimate"). */
  climbPathDeg: 8,
  /** A climb or descent goes this far, then levels off (an estimate, as the Formation sim's Lead: LEAD.climbChangeFt). */
  climbChangeFt: 2000,
  /** A descent never levels off lower than this above the ground (an estimate). */
  lowestLevelOffAglFt: 1000,
  /** The climb's slowest: 140 KIAS, the best-rate climb (SMM 3.14 para 35; EFIG p.126, as cited in core T6A_PITCH). */
  climbFloorKias: 140,
  /** Slow down and speed up: the speeds they go to. Estimates for the example; Patrick's ruling wanted. */
  slowKias: 150,
  fastKias: 230,
  /** Height hold: a height error is closed over about 10 s, at most 2,000 ft/min (estimates for a smooth pilot). */
  heightTauS: 10,
  maxHoldFpm: 2000,
  /** Speed on the nose: 0.5° of flight path per knot off the speed wanted, at most 15° (an estimate for a smooth pilot). */
  pathDegPerKt: 0.5,
  maxPathCorrectionDeg: 15,
  /** How briskly the nose moves onto the path wanted, rad/s (core dampedClimbG's omega; the Formation sim's 0.5). */
  pathOmega: 0.5,
  /** Speed on the throttle: a speed error closed over about 5 s, at most 3 kt/s (estimates, as the Formation sim's speed hold). */
  speedTauS: 5,
  maxSpeedChangeKtps: 3,
});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const asinClamped = (v) => Math.asin(clamp(v, -1, 1));

// ---- The laws a pilot flies by (built from core; no aircraft numbers of their own) ---------------------------------------------

/** The G (wings level) that brings the flight path smoothly onto `gammaRad`: core dampedClimbG with the pilot's omega. */
const pathG = (now, gammaRad) => dampedClimbG(now.gammaRad, gammaRad, now.vFtps, PILOT.pathOmega);

/** The flight path that holds the speed steady at this throttle: sin γ = excess ÷ weight (standard aerodynamics). */
const steadyPathRad = (now, throttle) => asinClamped(now.excessAt(throttle, 1));

/** The flight path that brings the speed to `kias` with the nose, at this throttle: nose up when fast, down when slow. */
function speedPathRad(now, kias, throttle) {
  const correction = clamp(PILOT.pathDegPerKt * (now.kias - kias), -PILOT.maxPathCorrectionDeg, PILOT.maxPathCorrectionDeg);
  return steadyPathRad(now, throttle) + correction * DEG;
}

/** The flight path that brings the aircraft to `altFt` over heightTauS, the climb or sink rate capped at `capFpm`. Also the step builder's
 * "Hold level" (steps.js). */
export function heightPathRad(now, altFt, capFpm = Infinity) {
  const fps = clamp((altFt - now.altFt) / PILOT.heightTauS, -capFpm / 60, capFpm / 60);
  return asinClamped(fps / Math.max(now.vFtps, 1));
}

/** The throttle (0 to 1) that brings the speed to `kias` while flying the path it has: standard aerodynamics on the excess power. */
function holdThrottle(now, kias) {
  const wantKtps = clamp((kias - now.kias) / PILOT.speedTauS, -PILOT.maxSpeedChangeKtps, PILOT.maxSpeedChangeKtps);
  // The indicated-speed rate as a true-speed rate (TAS ÷ IAS), then as excess power ÷ weight.
  const want = Math.sin(now.gammaRad) + (wantKtps * KT_TO_FTPS * (now.ktas / Math.max(now.kias, 1))) / G_FTPS2;
  const e0 = now.excessAt(0, 1);
  const e1 = now.excessAt(1, 1);
  return e1 > e0 + 1e-9 ? clamp((want - e0) / (e1 - e0), 0, 1) : 0;
}

/** Never slower than `floorKias` on purpose: the nose comes down to hold it (the stall itself is held in flight.js, a physical limit). */
const withFloor = (now, gammaRad, floorKias, throttle) => Math.min(gammaRad, speedPathRad(now, floorKias, throttle));

/** The best glide speed for the gear: 125 KIAS clean, 120 gear down (Patrick's C1, Traffic's PFL; EP-Q11's working answer (a)). The
 * reference data in core T6A_GLIDE say 125 clean and 105 gear down (EP-Q11 option (b)), written here beside them. */
export const glideKiasFor = (gear) => (gear === 'down' ? PFL.glideGearKias : PFL.glideCleanKias);

// ---- Lateral pilots: each asks for a bank (degrees, right positive) ----------------------------------------------------------

/** Bank toward a true heading by the shorter way, rolled out smoothly as the heading comes up. Also the step builder's "Hold a heading"
 * (steps.js). */
export const bankToward = (now, headingDegT, maxBank = PILOT.turnBankDeg) => clamp(PILOT.bankPerHeadingDeg * wrapDeg180(headingDegT - now.headingDegT), -maxBank, maxBank);

const fieldOf = (now, icao) => now.fields.find((f) => f.icao === icao) ?? null;

/** The heading that makes good the track to `point` through the wind (core windTriangle), compass degrees true. */
function headingTo(now, point) {
  const track = compassDegFromVector(point.x - now.x, point.y - now.y);
  const w = windTriangle(track, now.ktas, now.windFromDegT, now.windKt);
  return w.canHoldTrack ? w.headingDeg : track;
}

const LATERAL = Object.freeze({
  /** Wings level on the heading it had when picked. */
  straight: (now, m) => ({ bankDeg: bankToward(now, m.headingDegT), mem: m }),
  /** A turn the way asked, at the turn bank, to the heading asked (true inside; the student asks in magnetic), then hold it. */
  turnTo: (now, m) => {
    const toGo = m.side < 0 ? wrapDeg360(now.headingDegT - m.headingDegT) : wrapDeg360(m.headingDegT - now.headingDegT);
    const captured = m.captured || toGo <= PILOT.turnBankDeg / PILOT.bankPerHeadingDeg;
    if (!captured) return { bankDeg: m.side * PILOT.turnBankDeg, mem: m };
    return { bankDeg: bankToward(now, m.headingDegT), mem: m.captured ? m : { ...m, captured: true } };
  },
  /** Toward a field: the heading that makes good the track to it through the wind, the shorter way round. Over the field it keeps
   * turning back toward it, so it circles there. */
  toField: (now, m) => {
    const field = fieldOf(now, m.fieldIcao);
    return { bankDeg: field ? bankToward(now, headingTo(now, field.point)) : 0, mem: m };
  },
  /** Orbit here: a steady turn at the orbit's bank. */
  orbit: (now, m) => ({ bankDeg: m.side * PILOT.orbitBankDeg, mem: m }),
});

// ---- Vertical pilots: each asks for the G that holds its path wings level, and a throttle -------------------------------------

function level(now, m) {
  const throttle = holdThrottle(now, m.kias);
  const gamma = withFloor(now, heightPathRad(now, m.altFt, PILOT.maxHoldFpm), now.floorKias, throttle);
  return { gPath: pathG(now, gamma), throttle, mem: m };
}

const VERTICAL = Object.freeze({
  /** Hold the height and the speed it had when picked (or the speed asked: slow down, speed up). */
  level,
  /** Climb on the climb path at full power, never slower than the climb floor, then level off at the new height and the speed it had. */
  climb: (now, m) => {
    if (m.levelled) return level(now, m);
    const gamma = withFloor(now, Math.min(PILOT.climbPathDeg * DEG, heightPathRad(now, m.altFt)), Math.max(now.floorKias, PILOT.climbFloorKias), 1);
    const levelled = Math.abs(now.altFt - m.altFt) < 50 && Math.abs(now.gammaRad) < DEG;
    return { gPath: pathG(now, gamma), throttle: 1, mem: levelled ? { ...m, levelled } : m };
  },
  /** Descend on the descent path holding the speed it had (the power comes back; if idle can't hold it, the nose comes up just enough),
   * then level off at the new height. */
  descend: (now, m) => {
    if (m.levelled) return level(now, m);
    const throttle = holdThrottle(now, m.kias);
    let gamma = Math.max(-PILOT.climbPathDeg * DEG, heightPathRad(now, m.altFt));
    gamma = Math.max(gamma, speedPathRad(now, m.kias, 0)); // the steepest that idle still holds the speed on
    gamma = withFloor(now, gamma, now.floorKias, throttle);
    const levelled = Math.abs(now.altFt - m.altFt) < 50 && Math.abs(now.gammaRad) < DEG;
    return { gPath: pathG(now, gamma), throttle, mem: levelled ? { ...m, levelled } : m };
  },
  /** Glide at best glide: power off, the nose holding the glide speed for the gear, never climbing. */
  glide: (now, m) => {
    const gamma = Math.min(speedPathRad(now, glideKiasFor(now.gear), 0), 0);
    return { gPath: pathG(now, gamma), throttle: 0, mem: m };
  },
  /**
   * Zoom: the reference zoom's numbers (Traffic's PFL, from the reference data; zoom only above 150 KIAS, Patrick's C7): a 2 G pull to
   * 20° nose up, held to 145 KIAS, then over onto the glide at 125 KIAS. At or below 150 KIAS it holds height and slows to the glide speed
   * instead. Power as it was. When it is over: the glide if the throttle gives nothing (the engine out), else level at the height reached.
   */
  zoom: (now, m) => {
    let phase = m.phase;
    if (phase === 'pull' && now.gammaRad >= PFL.zoomMaxClimbDeg * DEG) phase = 'hold';
    if (phase === 'hold' && now.kias <= PFL.pushOverKias) phase = 'over';
    const glidePath = steadyPathRad(now, m.throttle);
    if (phase === 'over' && (now.kias <= PFL.glideCleanKias + 1.5 || now.gammaRad <= glidePath)) {
      const engineGives = now.excessAt(1, 1) > now.excessAt(0, 1) + 1e-9;
      const next = engineGives ? { kind: 'level', altFt: now.altFt, kias: now.kias } : { kind: 'glide' };
      return { ...VERTICAL[next.kind](now, next), mem: next };
    }
    const mem = phase === m.phase ? m : { ...m, phase };
    if (phase === 'pull') return { gPath: PFL.zoomPullG, throttle: m.throttle, mem };
    if (phase === 'hold') return { gPath: pathG(now, PFL.zoomMaxClimbDeg * DEG), throttle: m.throttle, mem };
    // Over the top and onto the glide: the nose comes down to hold the glide speed, never climbing again.
    return { gPath: pathG(now, Math.min(speedPathRad(now, PFL.glideCleanKias, m.throttle), now.gammaRad)), throttle: m.throttle, mem };
  },
});

/** Runs the lateral pilot `mem.kind`. Returns { bankDeg, mem }. */
export const flyLateral = (now, mem) => (LATERAL[mem.kind] ?? LATERAL.straight)(now, mem);
/** Runs the vertical pilot `mem.kind`. Returns { gPath, throttle, mem }. */
export const flyVertical = (now, mem) => (VERTICAL[mem.kind] ?? level)(now, mem);

// ---- The list ---------------------------------------------------------------------------------------------------------------

const MAG = (now) => now.magVarDegE;
const toTrue = (now, degM) => wrapDeg360(degM + MAG(now));
const levelHere = (now) => ({ kind: 'level', altFt: now.altFt, kias: now.kias });
const changeTo = (now, by) => {
  const lowest = now.groundFt + PILOT.lowestLevelOffAglFt;
  return by > 0 ? now.altFt + by : Math.min(now.altFt, Math.max(now.altFt + by, lowest));
};

/**
 * The picks, in systems-plan 4.1's order (Step 6 lays them out for the student). Each: id, words (EP-3: plain words, no numbers), group,
 * needs (the fields a pick must carry: 'headingDegM', 'fieldIcao'), and start(now, pick) giving what it sets:
 * { lateral?, vertical?, gear?, flaps?, fieldIcao? }. Declare and Eject have no start (no pilot).
 */
export const MANOEUVRES = Object.freeze([
  { id: 'straightLevel', words: 'Fly straight and level', group: 'fly', needs: [], start: (now) => ({ lateral: { kind: 'straight', headingDegT: now.headingDegT }, vertical: levelHere(now) }) },
  { id: 'turnLeft', words: 'Turn left to a heading', group: 'turn', needs: ['headingDegM'], start: (now, p) => ({ lateral: { kind: 'turnTo', side: -1, headingDegT: toTrue(now, p.headingDegM), headingDegM: p.headingDegM } }) },
  { id: 'turnRight', words: 'Turn right to a heading', group: 'turn', needs: ['headingDegM'], start: (now, p) => ({ lateral: { kind: 'turnTo', side: 1, headingDegT: toTrue(now, p.headingDegM), headingDegM: p.headingDegM } }) },
  { id: 'turnNearest', words: 'Turn toward the nearest suitable field', group: 'turn', needs: [], start: (now) => {
    const field = nearestSuitable(now);
    return field ? { lateral: { kind: 'toField', fieldIcao: field.icao }, fieldIcao: field.icao } : {};
  } },
  { id: 'turnField', words: 'Turn toward a named field', group: 'turn', needs: ['fieldIcao'], start: (now, p) => (fieldOf(now, p.fieldIcao) ? { lateral: { kind: 'toField', fieldIcao: p.fieldIcao }, fieldIcao: p.fieldIcao } : {}) },
  { id: 'climb', words: 'Climb', group: 'fly', needs: [], start: (now) => ({ vertical: { kind: 'climb', altFt: changeTo(now, PILOT.climbChangeFt), kias: now.kias } }) },
  { id: 'descend', words: 'Descend', group: 'fly', needs: [], start: (now) => ({ vertical: { kind: 'descend', altFt: changeTo(now, -PILOT.climbChangeFt), kias: now.kias } }) },
  { id: 'zoom', words: 'Zoom (trade speed for height)', group: 'fly', needs: [], start: (now) => ({ vertical: now.kias > PFL.zoomAboveKias ? { kind: 'zoom', phase: 'pull', throttle: now.throttle } : { kind: 'glide' } }) },
  { id: 'glide', words: 'Glide at best glide', group: 'fly', needs: [], start: () => ({ vertical: { kind: 'glide' } }) },
  { id: 'slowDown', words: 'Slow down', group: 'fly', needs: [], start: (now) => ({ vertical: { kind: 'level', altFt: now.altFt, kias: PILOT.slowKias } }) },
  { id: 'speedUp', words: 'Speed up', group: 'fly', needs: [], start: (now) => ({ vertical: { kind: 'level', altFt: now.altFt, kias: PILOT.fastKias } }) },
  { id: 'gearDown', words: 'Gear down', group: 'configure', needs: [], start: () => ({ gear: 'down' }) },
  { id: 'gearUp', words: 'Gear up', group: 'configure', needs: [], start: () => ({ gear: 'up' }) },
  { id: 'flapsTakeoff', words: 'Flaps take-off', group: 'configure', needs: [], start: () => ({ flaps: 'takeoff' }) },
  { id: 'flapsLanding', words: 'Flaps landing', group: 'configure', needs: [], start: () => ({ flaps: 'landing' }) },
  { id: 'flapsUp', words: 'Flaps up', group: 'configure', needs: [], start: () => ({ flaps: 'up' }) },
  { id: 'orbit', words: 'Orbit here', group: 'turn', needs: [], start: () => ({ lateral: { kind: 'orbit', side: -1 } }) },
  { id: 'declare', words: 'Declare', group: 'other', needs: [], start: null },
  { id: 'eject', words: 'Eject', group: 'other', needs: [], start: null, ends: true },
].map((m) => Object.freeze({ ...m, needs: Object.freeze(m.needs) })));

const BY_ID = new Map(MANOEUVRES.map((m) => [m.id, m]));
export const manoeuvreById = (id) => BY_ID.get(id) ?? null;

/**
 * "Nearest suitable field": the working answer to EP-Q6 is a list Patrick names. Until he does, this working list: Moose Jaw and the
 * paved fields round it in src/airfields/airports-data.js (OurAirports). Nearest by straight-line distance from where the aircraft is.
 */
export const SUITABLE_FIELDS_WORKING = Object.freeze(['CYMJ', 'CYQR', 'CYYN', 'CYXE']);

function nearestSuitable(now) {
  let best = null;
  for (const f of now.fields) {
    if (!SUITABLE_FIELDS_WORKING.includes(f.icao)) continue;
    const d = Math.hypot(f.point.x - now.x, f.point.y - now.y);
    if (!best || d < best.d) best = { icao: f.icao, d };
  }
  return best;
}

/** A pick in words, for the log, the console and the student: the manoeuvre's words with its heading or field. */
export function pickWords(pick) {
  const m = manoeuvreById(pick?.manoeuvre);
  if (!m) return '';
  if (m.needs.includes('headingDegM')) return `${m.id === 'turnLeft' ? 'Turn left' : 'Turn right'} to ${String(Math.round(pick.headingDegM) % 360).padStart(3, '0')}°M`;
  if (m.id === 'turnField' || (m.id === 'turnNearest' && pick.fieldIcao)) return `${m.words}${pick.fieldIcao ? ` (${pick.fieldIcao})` : ''}`;
  return m.words;
}

/**
 * A pick checked: a known manoeuvre, a heading 0 to 360 (whole degrees) where one is needed, a field from `fieldIcaos` where one is needed;
 * anything else dropped. Null when it isn't a usable pick. (Step 8's picks from the student's screen come through here too.)
 * @param {any} raw
 * @param {readonly string[]} fieldIcaos
 */
export function cleanPick(raw, fieldIcaos) {
  const m = manoeuvreById(raw?.manoeuvre);
  if (!m) return null;
  const pick = { manoeuvre: m.id };
  if (m.needs.includes('headingDegM')) {
    const h = Number(raw.headingDegM);
    if (!Number.isFinite(h)) return null;
    pick.headingDegM = Math.round(wrapDeg360(h)) % 360;
  }
  if (m.needs.includes('fieldIcao')) {
    const icao = typeof raw.fieldIcao === 'string' ? raw.fieldIcao.trim().toUpperCase() : '';
    if (!fieldIcaos.includes(icao)) return null;
    pick.fieldIcao = icao;
  }
  return pick;
}
