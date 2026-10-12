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
import { STEPS, panelOf } from './scenario.js';
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
  };
}
