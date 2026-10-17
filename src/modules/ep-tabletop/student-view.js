// What the student's screen is given, and nothing more (EP-2, EP-R3; EP-9). studentView(session) is the one place a session becomes the
// student's side: the one-screen mode draws from it, and the phone sends exactly it over the link. cleanStudentView(raw) is how the
// student's screen takes one in: everything that arrives over the link is untrusted (rule book), so the shape and types are checked,
// numbers are kept to their gauges' ranges and words to short plain text. The screen draws them as text, never as HTML.
//
// In a student view: the situation the student is given at the start, the step and the steps visited, whether time is running and the
// clock, the FEVER and TCCC prompts, and the panel's settings for the flight instruments and for what has been revealed.
// Never: the scenario's name or script, the developments to come, edits not yet applied, marks, notes, the Declare boxes, the log, any
// setting nobody has asked about, or anything about how it ends; and never a cause (fault), its severity or its trend (EP-11): the panel
// carries only the gauges and lights they move, once revealed. The picture cues (EP-12) are `cues`: a haze and a glow (0 to 1), a shake
// (degrees) and the names of revealed lights that flicker, worked out from what has been applied, never from what is waiting.
// The flight (plan Step 5, EP-13) is `flight`: where the aircraft is and how it is flying (position, altitude, KTAS and KIAS, heading,
// bank, pitch, climb rate, G, the ground velocity and turn rate), the pick it is flying in words, and the outcome in words once it is down.
// Never the engine's state behind it (that is a cause): the student sees only what the aircraft does.
// In "Any setup" (plan Step 5b) the flight is the same, but `manoeuvre` is always empty: the rows, a spin the instructor springs and a stall
// are the instructor's to say (the console and the log say them), so the student reads the aircraft only from the cockpit.
import { STEPS, panelOf } from './scenario.js';
import { flightNow, manoeuvreWords } from './flight.js';
import { windVectorFtps } from '../../core/wind.js';
import { definitionOf, CUE_LEVELS, FLICKER_CUES } from './indications.js';
import { shownOf } from './systems.js';
import { ENGINE_LIVE } from '../../ui-kit/ct156-cockpit.js';

/** The student view's format; a screen refuses any other. */
export const VIEW_FORMAT = 1;

const STEP_IDS = STEPS.map((s) => s.id);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * The picture cues the student sees now (EP-12): from the applied causes and typed values only (shownOf), never a pending edit. A flickering
 * light is named only once the student has asked about it, so a name never gives away a light nobody has revealed.
 * @param {any} s
 */
export function cuesOf(s) {
  const shown = shownOf(s);
  const level = (key, max) => Math.min(max, Math.max(0, Number(shown[key]) || 0));
  return {
    haze: level('fx.haze', 1),
    glow: level('fx.glow', 1),
    shakeDeg: level('fx.shakeDeg', CUE_LEVELS.find((d) => d.key === 'fx.shakeDeg').max),
    flicker: FLICKER_CUES.filter((d) => shown[d.key] === true && s.revealed.includes(`light.${d.name}`)).map((d) => d.name),
  };
}

/**
 * The student's side of `s` (a scenario.js session), plain JSON-ready data.
 * @param {any} s
 */
export function studentView(s) {
  const st = s.scenario.start;
  const p = st.position ?? {};
  return {
    format: VIEW_FORMAT,
    situation: {
      phase: st.phase,
      altFt: st.altFt,
      kias: st.kias,
      headingDegM: st.headingDegM,
      position: { fromIcao: p.fromIcao, bearingDegT: p.bearingDegT, distNm: p.distNm },
      fuelLb: st.fuelLb,
      weather: st.weather,
    },
    step: s.step,
    visited: [...s.visited],
    started: s.started,
    running: s.running,
    clockS: s.clockS,
    prompts: { fever: s.prompts.fever, tccc: s.prompts.tccc },
    panel: panelOf(s).set,
    cues: cuesOf(s),
    flight: flightViewOf(s),
  };
}

/** Outcome kinds a student view may carry (flight.js): words only, never right or wrong. */
const OUTCOME_KINDS = Object.freeze(['landed', 'offRunway', 'ejected']);

/**
 * The flight as the student's side draws it, or null with no flight. The ground velocity adds the scenario's wind (core windVectorFtps)
 * to the air's, so a screen between the phone's sends can carry the aircraft on along its track (flightAhead).
 * @param {any} s
 */
export function flightViewOf(s) {
  const f = s.flight;
  if (!f) return null;
  const n = flightNow(f);
  const w = f.outcome ? { x: 0, y: 0 } : windVectorFtps(Number(s.scenario.start.wind?.fromDegT) || 0, Math.max(0, Number(s.scenario.start.wind?.kt) || 0));
  const still = Boolean(f.outcome);
  return {
    x: n.x,
    y: n.y,
    altFt: n.altFt,
    ktas: n.ktas,
    kias: n.kias,
    headingDegM: n.headingDegM,
    bankDeg: n.bankDeg,
    pitchDeg: n.pitchDeg,
    climbFpm: still ? 0 : n.climbFpm,
    g: n.g,
    turnDps: n.turnDps,
    gsxFtps: still ? 0 : f.pm.vx + w.x,
    gsyFtps: still ? 0 : f.pm.vy + w.y,
    manoeuvre: f.setup ? '' : manoeuvreWords(f),
    outcome: f.outcome ? { kind: f.outcome.kind, words: f.outcome.words } : null,
  };
}

/**
 * A student view's flight carried on `ageS` seconds along its ground velocity, climb rate and turn rate (at most 1 s, about the phone's
 * send interval; then it waits for the next), so the student's screen moves smoothly between the phone's sends (phone mode). The phone stays
 * the master: its next state replaces this. Plain dead reckoning, not the flight model: running the model here would need the engine's
 * state, which is a cause and never reaches the student (EP-2, EP-11).
 * @param {any} flight a cleaned student view's flight
 * @param {number} ageS
 */
export function flightAhead(flight, ageS) {
  if (!flight || flight.outcome) return flight;
  const t = Math.min(1, Math.max(0, Number(ageS) || 0));
  if (t === 0) return flight;
  const finite = (v) => (Number.isFinite(v) ? v : null);
  const plus = (v, rate) => (finite(v) === null ? v : v + (finite(rate) ?? 0) * t);
  return {
    ...flight,
    x: plus(flight.x, flight.gsxFtps),
    y: plus(flight.y, flight.gsyFtps),
    altFt: plus(flight.altFt, (finite(flight.climbFpm) ?? 0) / 60),
    headingDegM: finite(flight.headingDegM) === null ? flight.headingDegM : (((flight.headingDegM + (finite(flight.turnDps) ?? 0) * t) % 360) + 360) % 360,
  };
}

// ---- Taking one in from the link (untrusted) ----------------------------------------------------------------------------------

// The ranges a screen can draw, not flying limits: the engine numbers to their gauges' full scale (the shared cockpit's ENGINE_LIVE),
// the flight instruments to a sane span.
const FLIGHT_RANGE = Object.freeze({
  'flight.altFt': [-1000, 60000],
  'flight.kias': [0, 500],
  'flight.headingDegM': [0, 360],
  'flight.pitchDeg': [-90, 90],
  'flight.bankDeg': [-180, 180],
});
const MAX_WORDS = 120;
const MAX_LINE = 160;
/** The flight's ranges a screen can draw (not flying limits): 300 NM round Moose Jaw in feet, speeds, rates and G to a sane span. */
const FLIGHT_VIEW_RANGE = Object.freeze({
  x: [-1.83e6, 1.83e6], y: [-1.83e6, 1.83e6], altFt: FLIGHT_RANGE['flight.altFt'], ktas: [0, 600], kias: FLIGHT_RANGE['flight.kias'],
  headingDegM: [0, 360], bankDeg: FLIGHT_RANGE['flight.bankDeg'], pitchDeg: FLIGHT_RANGE['flight.pitchDeg'], climbFpm: [-30000, 30000],
  g: [-5, 10], turnDps: [-360, 360], gsxFtps: [-1500, 1500], gsyFtps: [-1500, 1500], // turnDps to ±360: the spin set-piece turns about 144°/s
});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : null);
/** Short plain text: control characters dropped, trimmed, cut to `max`. Not a string: null. */
function text(v, max) {
  if (typeof v !== 'string') return null;
  return v.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ').trim().slice(0, max);
}

function rangeOf(key) {
  if (key.startsWith('engine.')) {
    const g = ENGINE_LIVE[key.slice(7)];
    return g ? [0, g.full] : null;
  }
  return FLIGHT_RANGE[key] ?? null;
}

function cleanSetting(key, value) {
  if (key.startsWith('light.')) return typeof value === 'boolean' ? value : null;
  if (key.startsWith('cue.') || key.startsWith('config.')) return text(value, MAX_WORDS);
  const range = rangeOf(key);
  if (!range) return null;
  if (isObject(value) && key.startsWith('engine.')) {
    const v = num(value.v, ...range);
    const swing = num(value.swing, 0, range[1]);
    return v === null ? null : swing ? { v, swing } : v;
  }
  return num(value, ...range);
}

/**
 * A student view as it arrived over the link, checked: the same shape as studentView's with every unknown field dropped, numbers
 * clamped and words cut short; null when it isn't a student view at all (wrong format, no known step).
 * @param {unknown} raw
 */
export function cleanStudentView(raw) {
  if (!isObject(raw) || raw.format !== VIEW_FORMAT || !STEP_IDS.includes(raw.step)) return null;
  const sit = isObject(raw.situation) ? raw.situation : {};
  const pos = isObject(sit.position) ? sit.position : {};
  const icao = text(pos.fromIcao, 4);
  const visited = Array.isArray(raw.visited) ? STEP_IDS.filter((id) => raw.visited.includes(id)) : [];
  const panel = {};
  if (isObject(raw.panel)) {
    for (const [key, value] of Object.entries(raw.panel)) {
      if (!definitionOf(key)) continue; // only the indications this screen knows
      const v = cleanSetting(key, value);
      if (v !== null) panel[key] = v;
    }
  }
  const rawCues = isObject(raw.cues) ? raw.cues : {};
  let flight = null;
  const rf = /** @type {any} */ (raw).flight;
  if (isObject(rf)) {
    flight = Object.fromEntries(Object.entries(FLIGHT_VIEW_RANGE).map(([k, range]) => [k, num(rf[k], ...range)]));
    flight.manoeuvre = text(rf.manoeuvre, MAX_WORDS) ?? '';
    const ro = isObject(rf.outcome) ? rf.outcome : null;
    flight.outcome = ro && OUTCOME_KINDS.includes(ro.kind) ? { kind: ro.kind, words: text(ro.words, MAX_LINE) ?? '' } : null;
  }
  const flicker = Array.isArray(rawCues.flicker) ? FLICKER_CUES.map((d) => d.name).filter((n) => rawCues.flicker.includes(n)) : [];
  return {
    format: VIEW_FORMAT,
    situation: {
      phase: text(sit.phase, MAX_LINE) ?? '',
      altFt: num(sit.altFt, ...FLIGHT_RANGE['flight.altFt']),
      kias: num(sit.kias, ...FLIGHT_RANGE['flight.kias']),
      headingDegM: num(sit.headingDegM, 0, 360),
      position: {
        fromIcao: icao && /^[A-Z0-9]{3,4}$/.test(icao) ? icao : null,
        bearingDegT: num(pos.bearingDegT, 0, 360) ?? 0,
        distNm: num(pos.distNm, 0, 300) ?? 0,
      },
      fuelLb: num(sit.fuelLb, 0, 2000),
      weather: text(sit.weather, MAX_LINE) ?? '',
    },
    step: raw.step,
    visited: visited.includes(raw.step) ? visited : [...visited, raw.step],
    started: raw.started === true,
    running: raw.running === true,
    clockS: num(raw.clockS, 0, 24 * 3600) ?? 0,
    prompts: { fever: isObject(raw.prompts) && raw.prompts.fever === true, tccc: isObject(raw.prompts) && raw.prompts.tccc === true },
    panel,
    cues: {
      haze: num(rawCues.haze, 0, 1) ?? 0,
      glow: num(rawCues.glow, 0, 1) ?? 0,
      shakeDeg: num(rawCues.shakeDeg, 0, CUE_LEVELS.find((d) => d.key === 'fx.shakeDeg').max) ?? 0,
      flicker,
    },
    flight,
  };
}
