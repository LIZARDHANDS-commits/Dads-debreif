// The EP Tabletop's aircraft (docs/modules/ep-tabletop/systems-plan.md section 4.2; EP-13; plan Step 5): a point mass flown by G and bank on
// the shared core (core point-mass.js stepPointMass, as the Formation sim's Lead and Traffic's PFL fly), at a fixed step of 0.05 s, each
// pick a small pilot (manoeuvres.js) asking for G, bank and throttle every step. Built on EP-Q5's working answer (a) while Patrick's answer
// is still open.
//
// Pure and deterministic: a flight is plain data (it goes in the session, is copied, rewound and sent), and stepping it to a clock time
// gives the same path however the clock got there (whole fixed steps, counted from the start).
//
// - Speeds: the model flies true airspeed (the point mass's velocity); the gauge shows indicated through core tasToIasKt. Every speed in
//   this file names its kind (kias, ktas, vFtps true).
// - Thrust and drag: core excessFnFor, from the engine state the systems model's causes give (engineOf): healthy at the pilot's throttle;
//   failed, prop feathered, power off with the configuration's drag (excessFnFor's engineOut, glideDragPerWeight); rough, the healthy
//   thrust times (1 - a fraction from the severity dial), the fraction an estimate (FLIGHT.roughThrustLossAtFull).
// - Roll and G onset: core easeValue toward the pilot's bank and G, inside rollWithinT6A and T6A_G_ONSET.
// - Physical limits always hold: the G never passes what the wing gives at this speed (core stallLimitG, with the configuration's stall
//   speed). Published limits (VMO, 7 G) are flagged (`flags`), never held.
// - Wind: the scenario's { fromDegT, kt } as a vector (core windVectorFtps) added to the air's velocity for the ground track. Headings on
//   the panel are magnetic, 9° E (EP-7, TR-65).
// - The ground: at the nearest field's elevation (OurAirports, src/airfields/airports-data.js); the 3D terrain is a picture only. On a
//   runway, within its length and width: "landed"; anywhere else "touched down off the runway", with where. Words only, never right or wrong.
//   No round-out or flare is flown: the touchdown is where the path meets the ground (the forced-landing pattern is a later step).
//
// "Any setup" (plan Step 5b; EP-17 to EP-19, EP-R11): a flight may instead carry `setup`, the step builder's pilot memory (steps.js). It is
// frozen at the instructor's state (createSetupFlight: the flight path solved from the set attitude, core attitudeDegFromClimb), then flies
// with the controls held (Carry on) or the rows the instructor entered (Fly), on the same point mass, roll and G onset and wing limit as
// the picks. A spin is a set-piece on steps.js SPIN (every number an estimate), not the point mass, which cannot spin. A point mass slowed
// almost to a stop (nose very high) is kept moving at SETUP_FLOOR_KTAS and its path tipped over (an estimate: no tail slide is flown).
//
// Positions are feet from CYMJ's origin (src/airfields/cymj-runways.js CYMJ_ORIGIN, Traffic's frame and world3d.js's), x east, y north,
// z up (feet above sea level, standard day).
import { stepPointMass, pointMassState, upFrom } from '../../core/point-mass.js';
import { easeValue } from '../../core/flight-math.js';
import {
  excessFnFor, iasToTasKt, tasToIasKt, stallLimitG, rollWithinT6A, T6A_G_ONSET, T6A_LIMITS, T6A_MANOEUVRE, maxKiasT6A, attitudeDegFromClimb,
} from '../../core/t6-performance.js';
import { windVectorFtps } from '../../core/wind.js';
import { makeLocalRef, latLonToLocalFt, legOffsetsFt } from '../../core/geo.js';
import { compassDegFromVector, compassDegToHeadingRad, wrapDeg180, wrapDeg360, DEG } from '../../core/angles.js';
import { FT_PER_NM, KT_TO_FTPS, G_FTPS2 } from '../../core/units.js';
import { AIRPORTS } from '../../airfields/airports-data.js';
import { CYMJ_ORIGIN } from '../../airfields/cymj-runways.js';
// The glide ring is Traffic's formula, imported as it is (the rule book allows a module to import another's file when moving it isn't
// worth it; this keeps out of Traffic's files while Patrick's sessions are active). Moving it to core is the plan's later preference.
import { PFL, PFL_CONFIGS, PFL_CONFIG_LABELS, calculateGlideFootprint } from '../traffic/pfl-geometry.js';
import { flyLateral, flyVertical, manoeuvreById, pickWords } from './manoeuvres.js';
import { flySetup, spinRows, recoveredMemory, setupMemory, carryOnMemory, flyMemory, freezeG, setupWords, SPIN } from './steps.js';

/** The fixed step, seconds (systems-plan section 4.2): the same as the Formation sim's (turn-sim live/flight.js STEP_SEC). */
export const STEP_S = 0.05;

/**
 * Magnetic variation at Moose Jaw, degrees east (Patrick's ruling, TR-65: 9° E). Scenario and panel headings are magnetic; the world and
 * the flight are true. The Traffic sim keeps the same number in its airfield.js (MAG_VARIATION_DEG_E); a shared home for it is a proposal
 * (EP-7). world3d.js reads it from here.
 */
export const MAG_VARIATION_DEG_E = 9;

/** The aircraft's own numbers in this module. Each has its source; "estimate" where none backs it yet. */
export const FLIGHT = Object.freeze({
  /** A pilot's roll, held under the T-6A's (core rollWithinT6A): 45°/s and 90°/s², the Traffic sim's (estimates; flight-math.md easeRoll). */
  pilotRoll: Object.freeze({ maxRateDps: 45, maxAccelDps2: 90 }),
  /** The most G a pick's pilot asks for: 2 G, the zoom's pull and the glide's most (Traffic's PFL.zoomPullG and glideMaxG; reference data, TR-51). */
  pilotMaxG: PFL.glideMaxG,
  /** A pilot keeps the G at or above 0 (the reference zoom's push is 0 to +0.5 G). */
  pilotMinG: 0,
  /** Rough engine: thrust lost at severity 1 (20 % at the default 0.5; systems-plan section 9). An ESTIMATE; Patrick's ruling wanted. */
  roughThrustLossAtFull: 0.4,
  /** Fields within this distance of Moose Jaw are flown to and landed on (a tool choice: the four in the airfield list round Moose Jaw). */
  fieldsWithinNm: 200,
});

// ---- Fields ---------------------------------------------------------------------------------------------------------------

const REF = makeLocalRef(CYMJ_ORIGIN.lat, CYMJ_ORIGIN.lon);

/**
 * The fields round Moose Jaw (src/airfields/airports-data.js: OurAirports, with Patrick's CYMJ runway ends laid over), in the flight's feet:
 * { icao, name, elevationFt, point (CYMJ's origin for Moose Jaw, else the middle of its runways), runways: [{ ends, a, b, lengthFt, widthFt }] }.
 */
export const FIELDS = Object.freeze(AIRPORTS.map((ap) => {
  const runways = ap.runways.map((r) => {
    const a = latLonToLocalFt(REF, r.a.lat, r.a.lon);
    const b = latLonToLocalFt(REF, r.b.lat, r.b.lon);
    return Object.freeze({ ends: r.ends, a, b, lengthFt: Math.hypot(b.x - a.x, b.y - a.y), widthFt: r.widthFt });
  });
  const mids = runways.map((r) => ({ x: (r.a.x + r.b.x) / 2, y: (r.a.y + r.b.y) / 2 }));
  const point = ap.icao === 'CYMJ' ? { x: 0, y: 0 } : { x: mids.reduce((t, m) => t + m.x, 0) / mids.length, y: mids.reduce((t, m) => t + m.y, 0) / mids.length };
  return Object.freeze({ icao: ap.icao, name: ap.name, elevationFt: ap.elevationFt, point: Object.freeze(point), runways: Object.freeze(runways) });
}).filter((f) => Math.hypot(f.point.x, f.point.y) <= FLIGHT.fieldsWithinNm * FT_PER_NM));
export const FIELD_IDS = Object.freeze(FIELDS.map((f) => f.icao));
export const fieldById = (icao) => FIELDS.find((f) => f.icao === icao) ?? null;

/** The field nearest a point, and how far (feet). */
export function nearestField(p) {
  let best = null;
  for (const f of FIELDS) {
    const d = Math.hypot(f.point.x - p.x, f.point.y - p.y);
    if (!best || d < best.distFt) best = { field: f, distFt: d };
  }
  return best;
}

const COMPASS_8 = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
/** "3.2 NM south-west of CYMJ", or "over CYMJ" within a quarter of a mile. */
export function whereWords(p) {
  const n = nearestField(p);
  if (!n) return '';
  const nm = n.distFt / FT_PER_NM;
  if (nm < 0.25) return `over ${n.field.icao}`;
  const dir = COMPASS_8[Math.round(compassDegFromVector(p.x - n.field.point.x, p.y - n.field.point.y) / 45) % 8];
  return `${nm.toFixed(1)} NM ${dir} of ${n.field.icao}`;
}

/** The runway under a point, if any: within its length and its width. Its name is the end the aircraft is heading away from. */
function runwayUnder(p, trackDegT) {
  for (const f of FIELDS) {
    for (const r of f.runways) {
      const { alongFt, crossFt } = legOffsetsFt(r.a, r.b, p);
      if (alongFt < 0 || alongFt > r.lengthFt || Math.abs(crossFt) > r.widthFt / 2) continue;
      const aToB = compassDegFromVector(r.b.x - r.a.x, r.b.y - r.a.y);
      const name = Math.abs(wrapDeg180(trackDegT - aToB)) <= 90 ? r.ends[0] : r.ends[1];
      return { field: f, name };
    }
  }
  return null;
}

// ---- Configuration and engine ------------------------------------------------------------------------------------------------

/** The T6A_GLIDE configuration for the gear and flaps: flaps take the flap row (which has the gear down in the data, so flaps with the
 * gear up are flown with a little more drag than they have: an estimate until a source gives that case). */
export function configOf(gear, flaps) {
  if (flaps === 'landing') return 'landing';
  if (flaps === 'takeoff') return 'flapsTakeoff';
  return gear === 'down' ? 'gearDown' : 'clean';
}

/** The 1 G stall for a configuration, KIAS: 86 clean, gear and take-off flap (Patrick, 30 Sep); 76 landing flap (Traffic's PFL.stallKias, its source to confirm). */
export const stallKiasOf = (config) => PFL.stallKias[Math.max(0, PFL_CONFIGS.indexOf(config))] ?? T6A_LIMITS.stallKias;

/**
 * The engine as the systems model's causes leave it (systems.js faults, those applied): 'out' with an engine failure; else rough with a
 * thrust loss from the roughness's severity dial; else healthy. The failure takes the thrust at once (the gauges' 10 s run-down is the
 * gauges' picture). Returns { out, roughLoss } (roughLoss 0 to 1).
 */
export function engineOf(faults = []) {
  let out = false;
  let roughLoss = 0;
  for (const f of faults) {
    if (f?.kind === 'engineFail') out = true;
    if (f?.kind === 'roughness') roughLoss = Math.max(roughLoss, FLIGHT.roughThrustLossAtFull * Math.min(1, Math.max(0, Number(f.severity) || 0)));
  }
  return { out, roughLoss };
}

/** The excess-power callback for the point-mass step at this throttle, engine state and configuration (core excessFnFor). */
const excessFn = (throttle, engine, config) => (engine.out ? excessFnFor(0, { config, engineOut: true }) : excessFnFor(throttle * (1 - engine.roughLoss), { config }));

// ---- The flight ---------------------------------------------------------------------------------------------------------------

/** Where a scenario's start puts the aircraft: `bearingDegT` and `distNm` from `fromIcao`'s point (CYMJ's origin unless another is named). */
export function startPositionFt({ fromIcao = 'CYMJ', bearingDegT = 0, distNm = 0 } = {}) {
  const from = fieldById(fromIcao)?.point ?? { x: 0, y: 0 };
  const b = bearingDegT * DEG;
  return { x: from.x + Math.sin(b) * distNm * FT_PER_NM, y: from.y + Math.cos(b) * distNm * FT_PER_NM };
}

/**
 * The aircraft at a scenario's start (scenarios.js start: altFt, kias, headingDegM, position, wind, and `manoeuvre`, the pick it is flying,
 * 'straightLevel' unless the scenario says, for example 'climb' on a departure), wings level, clean, at that speed. Plain data.
 */
export function createFlight(start = {}) {
  const altFt = Number.isFinite(start.altFt) ? start.altFt : 8000;
  const kias = Number.isFinite(start.kias) ? start.kias : 200;
  const p = startPositionFt(start.position);
  const headingDegT = wrapDeg360((Number.isFinite(start.headingDegM) ? start.headingDegM : 0) + MAG_VARIATION_DEG_E);
  const pm = pointMassState({ x: p.x, y: p.y, altFt, ktas: iasToTasKt(kias, altFt), headingRad: compassDegToHeadingRad(headingDegT) });
  let f = {
    n: 0, pm, bank: 0, rollRate: 0, g: 1, gRate: 0, throttle: 0, turnDps: 0,
    gear: 'up', flaps: 'up', configPicked: false,
    lateral: { kind: 'straight', headingDegT }, vertical: { kind: 'level', altFt, kias },
    lateralPick: { manoeuvre: 'straightLevel' }, verticalPick: { manoeuvre: 'straightLevel' },
    outcome: null,
  };
  const first = manoeuvreById(start.manoeuvre) ? { manoeuvre: start.manoeuvre } : null;
  if (first) f = applyPick(f, first, {}).flight;
  // The throttle it starts with: what holds the start (a step's pilot works it out), so the gauges and the flight agree from the first step.
  f = { ...f, throttle: flyVertical(nowOf(f, {}), f.vertical).throttle };
  return f;
}

/** The scenario's wind as the flight reads it: { fromDegT, kt }, calm when missing. */
const windOf = (env) => ({ fromDegT: Number(env?.wind?.fromDegT) || 0, kt: Math.max(0, Number(env?.wind?.kt) || 0) });

/** What a pilot reads this step (manoeuvres.js `now`). env: { faults, wind }. */
function nowOf(f, env) {
  const { pm } = f;
  const vFtps = Math.hypot(pm.vx, pm.vy, pm.vz);
  const ktas = vFtps / KT_TO_FTPS;
  const kias = tasToIasKt(ktas, pm.z);
  const config = configOf(f.gear, f.flaps);
  const stallKias = stallKiasOf(config);
  const engine = engineOf(env.faults);
  const wind = windOf(env);
  const ground = nearestField(pm);
  return {
    kias, ktas, vFtps, altFt: pm.z, x: pm.x, y: pm.y,
    gammaRad: Math.asin(Math.max(-1, Math.min(1, pm.vz / Math.max(vFtps, 1e-6)))),
    headingDegT: compassDegFromVector(pm.vx, pm.vy),
    bankDeg: f.bank, throttle: f.throttle, gear: f.gear, flaps: f.flaps, config, stallKias,
    // A pilot never flies slower than the stick shaker on purpose: the stall plus the shaker's margin (core T6A_MANOEUVRE, reference).
    floorKias: stallKias + T6A_MANOEUVRE.shakerMarginKt,
    groundFt: ground ? ground.field.elevationFt : 0,
    excessAt: (throttle, g) => excessFn(throttle, engine, config)(ktas, pm.z, g),
    windFromDegT: wind.fromDegT, windKt: wind.kt, magVarDegE: MAG_VARIATION_DEG_E,
    fields: FIELDS,
    // The step builder's pilot (steps.js) also reads the attitude the pilot sees, the roll rate, the G and the clock.
    pitchDeg: attitudeOf(pm, vFtps, kias, f.g, tiltOf(f), config), rollRateDps: f.rollRate, g: f.g, clockS: f.n * STEP_S,
  };
}

/**
 * The pitch attitude the pilot sees (core attitudeDegFromClimb): the flight path plus the angle of attack, which in a bank is tilted with
 * the wings, so only its cos(bank) share lifts the nose: the G passed in is G × cos(bank), as the Turn Sim's pitchAboveHorizonDeg does
 * (TR-91). Wings level it is exactly the formula; inverted the angle of attack puts the nose below the path.
 */
function attitudeOf(pm, vFtps, kias, g, bankDeg, config) {
  return attitudeDegFromClimb(pm.vz, vFtps, kias, g * Math.cos(bankDeg * DEG), config);
}
/** The bank the attitude is tilted by: an Any setup's (it may be steep or inverted); 0 for the emergencies, whose shown pitch stays exactly as
 * it was before Step 5b (spec: "nothing about the emergencies changes"; the tilt there is a question for Patrick, up to about 1° in a turn). */
const tiltOf = (f) => (f.setup ? f.bank : 0);

/** One fixed step. Returns the next flight; once there is an outcome nothing moves. */
function stepOnce(f, env) {
  if (f.outcome) return f;
  if (f.setup) return f.setup.spin ? spinStepOnce(f, env) : setupStepOnce(f, env);
  const now = nowOf(f, env);
  const lat = flyLateral(now, f.lateral);
  const ver = flyVertical(now, f.vertical);
  // The pilot's G: the path's G over the cosine of the bank flown, inside the pilot's own range; then the wing's limit, which always holds.
  const wingG = stallLimitG(now.kias, /** @type {any} */ (now.stallKias));
  const askG = Math.min(Math.max(FLIGHT.pilotMinG, Math.min(FLIGHT.pilotMaxG, ver.gPath / Math.max(0.3, Math.cos(f.bank * DEG)))), wingG);
  const gE = easeValue(f.g, f.gRate, askG, STEP_S, T6A_G_ONSET);
  const g = Math.min(gE.bankDeg, wingG);
  const target = f.bank + wrapDeg180(lat.bankDeg - f.bank); // the near way round
  const rE = easeValue(f.bank, f.rollRate, target, STEP_S, rollWithinT6A(FLIGHT.pilotRoll, now.ktas));
  const throttle = Math.min(1, Math.max(0, ver.throttle));
  const engine = engineOf(env.faults);
  const air = stepPointMass(f.pm, { g, bankRad: rE.bankDeg * DEG }, STEP_S, excessFn(throttle, engine, now.config));
  const w = windVectorFtps(now.windFromDegT, now.windKt);
  const pm = { ...air, x: air.x + w.x * STEP_S, y: air.y + w.y * STEP_S };
  const headingNow = compassDegFromVector(pm.vx, pm.vy);
  const next = {
    ...f, n: f.n + 1, pm, bank: wrapDeg180(rE.bankDeg), rollRate: rE.rollRateDps, g, gRate: g < gE.bankDeg ? 0 : gE.rollRateDps, throttle,
    turnDps: wrapDeg180(headingNow - now.headingDegT) / STEP_S, lateral: lat.mem, vertical: ver.mem,
  };
  return groundCheck(f, next, w, now.groundFt);
}

/** The step's end checked against the ground (the field's elevation): above it, the step as it is; else the flight ends where the path met it. */
function groundCheck(f, next, w, groundFt) {
  const { pm } = next;
  if (pm.z > groundFt) return next;
  // Ground contact between the two steps: where the path met the field's elevation.
  const k = (f.pm.z - groundFt) / Math.max(f.pm.z - pm.z, 1e-9);
  const at = { x: f.pm.x + (pm.x - f.pm.x) * k, y: f.pm.y + (pm.y - f.pm.y) * k };
  const trackDegT = compassDegFromVector(pm.vx + w.x, pm.vy + w.y);
  const rwy = runwayUnder(at, trackDegT);
  const outcome = rwy
    ? { kind: 'landed', words: `Landed on runway ${rwy.name} at ${rwy.field.icao}`, x: at.x, y: at.y, fieldIcao: rwy.field.icao }
    : { kind: 'offRunway', words: `Touched down off the runway, ${whereWords(at)}`, x: at.x, y: at.y, fieldIcao: nearestField(at)?.field.icao ?? null };
  return { ...next, pm: { ...pm, x: at.x, y: at.y, z: groundFt }, outcome };
}

// ---- Any setup (steps.js) -----------------------------------------------------------------------------------------------------

/** The point mass needs a speed (core point-mass.js); in a setup it is never let below this, true knots (an estimate, see the header). */
export const SETUP_FLOOR_KTAS = 20;

/**
 * Below SETUP_FLOOR_KTAS (a near-vertical zoom run out of speed) the speed is held at the floor and the path tipped over toward the ground
 * at the rate gravity turns a path at that speed (g ÷ V, standard mechanics): over the way the aircraft was going, or, straight up, toward
 * the canopy's opposite side (away from the lift). An estimate: the point mass flies no tail slide.
 */
function floorSpeed(air) {
  const v = Math.hypot(air.vx, air.vy, air.vz);
  const floor = SETUP_FLOOR_KTAS * KT_TO_FTPS;
  if (v >= floor) return air;
  let hx = air.vx;
  let hy = air.vy;
  if (Math.hypot(hx, hy) < 1e-6) {
    hx = -air.up.x;
    hy = -air.up.y;
  }
  const hl = Math.hypot(hx, hy) || 1;
  const gamma = Math.asin(Math.max(-1, Math.min(1, air.vz / Math.max(v, 1e-9))));
  const tipped = Math.max(-Math.PI / 2 + 1e-3, gamma - (G_FTPS2 / floor) * STEP_S);
  const vel = { x: (Math.cos(tipped) * hx * floor) / hl, y: (Math.cos(tipped) * hy * floor) / hl, z: Math.sin(tipped) * floor };
  return { ...air, vx: vel.x, vy: vel.y, vz: vel.z, up: upFrom({ x: vel.x / floor, y: vel.y / floor, z: vel.z / floor }, air.up) };
}

/** A setup's step on the point mass: the step builder's pilot (steps.js flySetup) asks for bank, G and throttle; the rest as stepOnce. */
function setupStepOnce(f, env) {
  const now = nowOf(f, env);
  const wingG = stallLimitG(now.kias, /** @type {any} */ (now.stallKias));
  const p = flySetup(now, f.setup);
  if (p.spinStart) return spinStepOnce(startSpin({ ...f, setup: p.mem }, p.spinStart.dir), env);
  // The G asked for, then what the wing gives, which always holds: asking more than the wing gives is the stall, said in words.
  const askG = Math.max(FLIGHT.pilotMinG, p.g);
  const gE = easeValue(f.g, f.gRate, Math.min(askG, wingG), STEP_S, T6A_G_ONSET);
  const g = Math.min(gE.bankDeg, wingG);
  let setup = p.mem;
  const stalled = setup.stalled ? askG > wingG : askG > wingG + 0.02; // a little room, so a stall said is a stall
  if (stalled !== setup.stalled) {
    setup = { ...setup, stalled, said: [...setup.said, stalled ? `Stall at ${Math.round(now.kias)} KIAS: the wing gives ${wingG.toFixed(2)} G, less than the ${askG.toFixed(2)} G held` : `Out of the stall at ${Math.round(now.kias)} KIAS`] };
  }
  const target = f.bank + wrapDeg180(p.bankDeg - f.bank); // the near way round
  const rE = easeValue(f.bank, f.rollRate, target, STEP_S, rollWithinT6A(FLIGHT.pilotRoll, now.ktas));
  const throttle = Math.min(1, Math.max(0, p.throttle));
  const engine = engineOf(env.faults);
  const air = floorSpeed(stepPointMass(f.pm, { g, bankRad: rE.bankDeg * DEG }, STEP_S, excessFn(throttle, engine, now.config)));
  const w = windVectorFtps(now.windFromDegT, now.windKt);
  const pm = { ...air, x: air.x + w.x * STEP_S, y: air.y + w.y * STEP_S };
  const headingNow = compassDegFromVector(pm.vx, pm.vy);
  const next = {
    ...f, n: f.n + 1, pm, bank: wrapDeg180(rE.bankDeg), rollRate: rE.rollRateDps, g, gRate: g < gE.bankDeg ? 0 : gE.rollRateDps, throttle,
    turnDps: wrapDeg180(headingNow - now.headingDegT) / STEP_S, setup,
  };
  return groundCheck(f, next, w, now.groundFt);
}

/** The spin set-piece begins (steps.js SPIN): said in words; the point mass waits until the recovery puts the aircraft back on it. */
function startSpin(f, dir) {
  return { ...f, bank: dir * SPIN.bankDeg, rollRate: 0, g: SPIN.g, gRate: 0, setup: { ...f.setup, stalled: false, spin: { dir, phase: 'spin', deg: 0 }, said: [...f.setup.said, `Spin ${dir < 0 ? 'left' : 'right'} (set-piece; its numbers are estimates)`] } };
}

/**
 * One step of the spin set-piece (EP-19): the heading turns a turn every SPIN.secondsPerTurn the way it spins, the aircraft sinks
 * SPIN.ftPerTurn a turn and drifts with the wind; the rows go on (steps.js spinRows). When the recovery is over the aircraft is put back on
 * the point mass, wings level in the dive (nose SPIN.exitNoseDeg at SPIN.exitKias, its path solved from that attitude), and the recovery
 * row flies the pull-out. The ground ends it as any flight.
 */
function spinStepOnce(f, env) {
  const sp = f.setup.spin;
  const turned = (360 / SPIN.secondsPerTurn) * STEP_S;
  const headingDegT = wrapDeg360(compassDegFromVector(f.pm.vx, f.pm.vy) + sp.dir * turned);
  const sinkFtps = SPIN.ftPerTurn / SPIN.secondsPerTurn;
  const wind = windOf(env);
  const w = windVectorFtps(wind.fromDegT, wind.kt);
  const h = compassDegToHeadingRad(headingDegT);
  // The velocity carries the heading and the sink (a token 1 ft/s along the heading: the spin's own small circle is not drawn).
  const pm = { ...f.pm, x: f.pm.x + w.x * STEP_S, y: f.pm.y + w.y * STEP_S, z: f.pm.z - sinkFtps * STEP_S, vx: Math.cos(h), vy: Math.sin(h), vz: -sinkFtps };
  const kias = SPIN.kias;
  const now = {
    clockS: (f.n + 1) * STEP_S, kias, ktas: iasToTasKt(kias, pm.z), altFt: pm.z, headingDegT, bankDeg: sp.dir * SPIN.bankDeg, g: SPIN.g,
    throttle: f.throttle, pitchDeg: SPIN.noseDeg, magVarDegE: MAG_VARIATION_DEG_E,
  };
  const { mem, exit } = spinRows(now, f.setup, turned);
  let next = { ...f, n: f.n + 1, pm, bank: sp.dir * SPIN.bankDeg, rollRate: 0, g: SPIN.g, gRate: 0, turnDps: sp.dir * (360 / SPIN.secondsPerTurn), setup: mem };
  if (exit) {
    const ktas = iasToTasKt(SPIN.exitKias, pm.z);
    const climbRad = gammaForAttitude({ pitchDeg: SPIN.exitNoseDeg, kias: SPIN.exitKias, bankDeg: 0, config: configOf(f.gear, f.flaps), g: () => SPIN.g });
    next = {
      ...next, pm: pointMassState({ x: pm.x, y: pm.y, altFt: pm.z, ktas, headingRad: h, climbRad }), bank: 0, turnDps: 0,
      setup: { ...recoveredMemory(mem), said: [...mem.said, `Out of the spin at ${Math.round(pm.z).toLocaleString('en-CA')} ft; the dive pull-out follows`] },
    };
  }
  const ground = nearestField(pm);
  return groundCheck(f, next, w, ground ? ground.field.elevationFt : 0);
}

/**
 * The flight path (radians) that shows `pitchDeg` of attitude at `kias` and `bankDeg` (core attitudeDegFromClimb through attitudeOf), with
 * the G a function of the path, `g(gammaRad)`. The attitude grows with the path, so it is found by halving the span (40 halvings: far below
 * a hundredth of a degree). An attitude beyond what any path between ±88° gives takes the nearer end.
 */
export function gammaForAttitude({ pitchDeg, kias, bankDeg, config, g }) {
  const vFtps = Math.max(kias, 1) * KT_TO_FTPS; // the attitude formula reads only the climb's share of the speed, so any speed's scale does
  const attitudeAt = (gamma) => attitudeOf({ vz: Math.sin(gamma) * vFtps }, vFtps, kias, g(gamma), bankDeg, config);
  let lo = -88 * DEG;
  let hi = 88 * DEG;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (attitudeAt(mid) < pitchDeg) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * A flight frozen at the instructor's setup (steps.js cleanSetup; EP-17): at the map drop, the altitude (never below 100 ft above the
 * nearest field), the heading (out of the area, away from Moose Jaw, when none is set), the speed, the power, the bank, and the flight path
 * that gives the set attitude with the G it holds (steps.js freezeG; gammaForAttitude). Clean, gear and flaps up. `n` is the step the
 * clock is at, so the flight starts where the session's clock is. Plain data; nothing moves until the clock runs.
 */
export function createSetupFlight(setup, n = 0) {
  const ground = nearestField(setup);
  const altFt = Math.max(setup.altFt, (ground ? ground.field.elevationFt : 0) + 100);
  const headingDegT = setup.headingDegM === null ? compassDegFromVector(setup.x, setup.y) : wrapDeg360(setup.headingDegM + MAG_VARIATION_DEG_E);
  const config = configOf('up', 'up');
  const stallKias = stallKiasOf(config);
  const gOf = (gamma) => freezeG(gamma, setup.bankDeg, setup.kias, stallKias);
  const climbRad = gammaForAttitude({ pitchDeg: setup.pitchDeg, kias: setup.kias, bankDeg: setup.bankDeg, config, g: gOf });
  const g = gOf(climbRad);
  const throttle = setup.powerPct / 100;
  const pm = pointMassState({ x: setup.x, y: setup.y, altFt, ktas: iasToTasKt(setup.kias, altFt), headingRad: compassDegToHeadingRad(headingDegT), climbRad });
  return {
    n, pm, bank: setup.bankDeg, rollRate: 0, g, gRate: 0, throttle, turnDps: 0,
    gear: 'up', flaps: 'up', configPicked: false,
    lateral: { kind: 'straight', headingDegT }, vertical: { kind: 'level', altFt, kias: setup.kias },
    lateralPick: { manoeuvre: 'straightLevel' }, verticalPick: { manoeuvre: 'straightLevel' },
    outcome: null,
    setup: setupMemory({ g, bankDeg: setup.bankDeg, throttle }),
  };
}

/** What the step builder's pilot reads to start rows or hold the controls now (outside a step). */
const heldNow = (f) => {
  const n = flightNow(f);
  return { g: f.g, bankDeg: f.bank, throttle: f.throttle, clockS: f.n * STEP_S, kias: n.kias, altFt: n.altFt, headingDegT: n.headingDegT, magVarDegE: MAG_VARIATION_DEG_E };
};

/** Carry on (EP-18): the rows dropped, the controls held as they are now (the G, bank and power); a spin keeps spinning. */
export function setupCarryOn(f) {
  if (!f?.setup || f.outcome) return f;
  return { ...f, setup: carryOnMemory(f.setup, heldNow(f)) };
}

/** Fly the rows (steps.js cleanRows) from now, in order, exactly as entered. */
export function setupFly(f, rows) {
  if (!f?.setup || f.outcome || !rows.length) return f;
  return { ...f, setup: flyMemory(f.setup, rows, heldNow(f)) };
}

/** The words the step builder has said since they were last taken, and the flight without them (scenario.js logs them). */
export function takeSaid(f) {
  if (!f?.setup || (!f.setup.said.length && !f.setup.ended)) return { flight: f, said: [], ended: false };
  return { flight: { ...f, setup: { ...f.setup, said: [], ended: false } }, said: f.setup.said, ended: f.setup.ended };
}

/** The flight stepped to scenario clock `clockS` in whole fixed steps (none backwards). env: { faults, wind }. */
export function flyTo(f, clockS, env) {
  const target = Math.floor(clockS / STEP_S + 1e-6);
  let out = f;
  while (out.n < target && !out.outcome) {
    out = stepOnce(out, env);
    if (out.setup?.ended) return out; // the step builder's last row is over: the session pauses here (scenario.js)
  }
  return out.outcome && out.n < target ? { ...out, n: target } : out;
}

/**
 * A pick applied to the flight (manoeuvres.js; cleaned first, cleanPick). Returns { flight, words, resolved } (resolved: the pick with a
 * field it chose, for "nearest"). Declare changes nothing here; Eject ends the flight.
 */
export function applyPick(f, pick, env) {
  const m = manoeuvreById(pick?.manoeuvre);
  if (!m || f.outcome) return { flight: f, words: '', resolved: pick };
  if (m.ends) {
    const at = { x: f.pm.x, y: f.pm.y };
    return { flight: { ...f, outcome: { kind: 'ejected', words: `Ejected, ${whereWords(at)}, at ${Math.round(f.pm.z).toLocaleString('en-CA')} ft`, x: at.x, y: at.y, fieldIcao: nearestField(at)?.field.icao ?? null } }, words: m.words, resolved: pick };
  }
  if (!m.start) return { flight: f, words: m.words, resolved: pick };
  const set = m.start(nowOf(f, env), pick);
  const resolved = set.fieldIcao ? { ...pick, fieldIcao: set.fieldIcao } : pick;
  const next = { ...f };
  if (set.lateral) {
    next.lateral = set.lateral;
    next.lateralPick = resolved;
  }
  if (set.vertical) {
    next.vertical = set.vertical;
    next.verticalPick = resolved;
  }
  if (set.gear) next.gear = set.gear;
  if (set.flaps) next.flaps = set.flaps;
  if (set.gear || set.flaps) next.configPicked = true;
  return { flight: next, words: pickWords(resolved), resolved };
}

/**
 * The aircraft put where the instructor typed (the console's flight instruments: altitude, airspeed, heading magnetic), the rest kept;
 * the picks it is flying start again from there, so a height or speed it holds is the new one.
 * @param {any} f
 * @param {{ altFt?: number, kias?: number, headingDegM?: number }} [place]
 * @param {any} [env]
 */
export function placeFlight(f, place = {}, env = {}) {
  const { altFt, kias, headingDegM } = place;
  if (f.outcome) return f;
  // In the spin set-piece only a typed altitude applies (the spin's speed and heading are its own numbers, steps.js SPIN).
  if (f.setup?.spin) return Number.isFinite(altFt) ? { ...f, pm: { ...f.pm, z: altFt } } : f;
  const now = flightNow(f);
  const alt = Number.isFinite(altFt) ? altFt : now.altFt;
  const ias = Number.isFinite(kias) ? Math.max(0, kias) : now.kias;
  const hdgT = Number.isFinite(headingDegM) ? wrapDeg360(headingDegM + MAG_VARIATION_DEG_E) : now.headingDegT;
  const pm = { ...pointMassState({ x: f.pm.x, y: f.pm.y, altFt: alt, ktas: iasToTasKt(ias, alt), headingRad: compassDegToHeadingRad(hdgT), climbRad: now.climbRad }) };
  let next = { ...f, pm };
  next = applyPick(next, next.lateralPick, env).flight;
  next = applyPick(next, next.verticalPick, env).flight;
  if (Number.isFinite(headingDegM) && next.lateral.kind === 'straight') next = { ...next, lateral: { kind: 'straight', headingDegT: hdgT } };
  return next;
}

/**
 * The flight as the panel and the screens read it: position, altitude, speeds (KTAS and KIAS), heading (true and magnetic), track, bank,
 * pitch attitude (core attitudeDegFromClimb, the attitude the pilot sees, its angle of attack tilted with the bank: attitudeOf), climb
 * rate, G, the ground velocity and the turn rate. In the spin set-piece the attitude, bank, airspeed, G, sink and turn rate are the
 * set-piece's numbers (steps.js SPIN, estimates).
 */
export function flightNow(f) {
  const { pm } = f;
  const config = configOf(f.gear, f.flaps);
  const headingDegT = compassDegFromVector(pm.vx, pm.vy);
  const spin = f.setup?.spin;
  if (spin && !f.outcome) {
    const kias = SPIN.kias;
    return {
      x: pm.x, y: pm.y, altFt: pm.z, ktas: iasToTasKt(kias, pm.z), kias, headingDegT, headingDegM: wrapDeg360(headingDegT - MAG_VARIATION_DEG_E),
      climbRad: -Math.PI / 2, climbFpm: pm.vz * 60, bankDeg: f.bank, pitchDeg: SPIN.noseDeg, g: SPIN.g, turnDps: f.turnDps, config,
    };
  }
  const vFtps = Math.hypot(pm.vx, pm.vy, pm.vz);
  const ktas = vFtps / KT_TO_FTPS;
  const kias = tasToIasKt(ktas, pm.z);
  return {
    x: pm.x, y: pm.y, altFt: pm.z, ktas, kias, headingDegT,
    headingDegM: wrapDeg360(headingDegT - MAG_VARIATION_DEG_E),
    climbRad: Math.asin(Math.max(-1, Math.min(1, pm.vz / Math.max(vFtps, 1e-6)))),
    climbFpm: pm.vz * 60,
    bankDeg: f.bank,
    pitchDeg: attitudeOf(pm, vFtps, kias, f.g, tiltOf(f), config),
    g: f.g,
    turnDps: f.outcome ? 0 : f.turnDps,
    config,
  };
}

/** The flight's published-limit flags (references, never walls): over VMO or Mmo (core maxKiasT6A) and over 7 G (T6A_LIMITS.maxG). */
export function flagsOf(f) {
  const n = flightNow(f);
  const flags = [];
  if (n.kias > maxKiasT6A(n.altFt)) flags.push('Over the maximum speed (VMO or Mmo)');
  if (n.g > T6A_LIMITS.maxG) flags.push('Over 7 G');
  return flags;
}

const sideWords = (deg, right, left) => (Math.round(deg) > 0 ? right : Math.round(deg) < 0 ? left : '');

/**
 * The new position and state in words (Any setup, EP-R11; the console and the log): "6,240 ft · 132 KIAS · heading 047°M · pitch 3° nose
 * up · bank 2° right · 1.0 G · climbing 300 ft/min · power 100 % · 10.4 NM south-west of CYMJ". Words only, never right or wrong.
 */
export function stateWords(f) {
  const n = flightNow(f);
  const pitch = Math.round(n.pitchDeg);
  const climb = Math.round(n.climbFpm / 50) * 50;
  return [
    `${Math.round(n.altFt).toLocaleString('en-CA')} ft`,
    `${Math.round(n.kias)} KIAS`,
    `heading ${String(Math.round(n.headingDegM) % 360).padStart(3, '0')}°M`,
    `pitch ${pitch === 0 ? 'on the horizon' : `${Math.abs(pitch)}° nose ${pitch > 0 ? 'up' : 'down'}`}`,
    `bank ${Math.abs(Math.round(n.bankDeg))}°${sideWords(n.bankDeg, ' right', ' left')}`,
    `${n.g.toFixed(1)} G`,
    climb === 0 ? 'level' : `${climb > 0 ? 'climbing' : 'descending'} ${Math.abs(climb).toLocaleString('en-CA')} ft/min`,
    `power ${Math.round(f.throttle * 100)} %`,
    whereWords(n),
  ].filter(Boolean).join(' · ');
}

/**
 * What the aircraft is flying now, in words: the lateral pick and the vertical pick ("Turn toward the nearest suitable field (CYMJ) · Glide
 * at best glide"). Where only one half is still "Fly straight and level", that half reads "Fly straight" or "Fly level".
 */
export function manoeuvreWords(f) {
  if (f.setup) return setupWords(f.setup);
  const lat = f.lateralPick;
  const ver = f.verticalPick;
  if (lat?.manoeuvre === ver?.manoeuvre) return pickWords(lat);
  const latWords = lat?.manoeuvre === 'straightLevel' ? 'Fly straight' : pickWords(lat);
  const verWords = ver?.manoeuvre === 'straightLevel' ? 'Fly level' : pickWords(ver);
  return [latWords, verWords].filter(Boolean).join(' · ');
}

/** The panel's settings from the flight (systems.js shownOf lays them over the scenario's start): the flight instruments, and the gear and
 * flaps words once a pick has changed them. */
export function flightShown(f) {
  const n = flightNow(f);
  const out = {
    'flight.altFt': n.altFt,
    'flight.kias': n.kias,
    'flight.headingDegM': n.headingDegM,
    'flight.pitchDeg': n.pitchDeg,
    'flight.bankDeg': n.bankDeg,
  };
  if (f.configPicked) {
    out['config.gear'] = f.gear === 'down' ? 'down' : 'up';
    out['config.flaps'] = f.flaps === 'takeoff' ? 'take-off' : f.flaps === 'landing' ? 'landing' : 'up';
  }
  return out;
}

/**
 * The glide ring now (Traffic's calculateGlideFootprint, imported): how far the aircraft could glide power off from here at best glide in
 * the configuration it has, its centre moved downwind by the glide's time. Traffic's formula measures the height above Moose Jaw's field
 * elevation (its FIELD_ELEV_FT). Returns { cx, cy, rGlide, ... } in the flight's feet, and `fields`: the fields whose point is inside it.
 * Step 6 draws it; Step 5 shows the fields inside it on the console.
 */
export function glideRingOf(f, wind) {
  const config = configOf(f.gear, f.flaps);
  const w = windOf({ wind });
  const ring = calculateGlideFootprint({ x: f.pm.x, y: f.pm.y, alt: f.pm.z, config: PFL_CONFIG_LABELS[Math.max(0, PFL_CONFIGS.indexOf(config))] }, w.fromDegT, w.kt);
  const fields = FIELDS.filter((fl) => Math.hypot(fl.point.x - ring.cx, fl.point.y - ring.cy) <= ring.rGlide).map((fl) => fl.icao);
  return { ...ring, fields };
}

