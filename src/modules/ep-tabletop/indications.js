// What the instructor can set and the student can ask about (spec, "Indications the instructor can set"), with the words and units the
// screens show, and how a panel (scenario.js panelOf) becomes the shared cockpit's numbers. No values here: they are the scenario's
// (scenarios.js) or the instructor's. Never any checklist or boldface text (EP-3).
import { ANNUNCIATOR_NAMES, MASTER_LAMPS } from '../../ui-kit/ct156-cockpit.js';

/** The engine and systems numbers (each 'engine.<key>', the cockpit's ENGINE_LIVE keys). `swing`: may fluctuate (± a number). */
export const NUMBERS = Object.freeze([
  { key: 'engine.torquePct', label: 'Torque', unit: '%', step: 1, swing: true },
  { key: 'engine.n1Pct', label: 'N1', unit: '%', step: 1, swing: true },
  { key: 'engine.npPct', label: 'Np', unit: '%', step: 1, swing: true },
  { key: 'engine.ittC', label: 'ITT', unit: '°C', step: 10, swing: true },
  { key: 'engine.fuelFlowPph', label: 'Fuel flow', unit: 'pph', step: 10, swing: true },
  { key: 'engine.oilPsi', label: 'Oil pressure', unit: 'psi', step: 5, swing: true },
  { key: 'engine.oilTempC', label: 'Oil temperature', unit: '°C', step: 5 },
  { key: 'engine.fuelLeftLb', label: 'Fuel left', unit: 'lb', step: 10 },
  { key: 'engine.fuelRightLb', label: 'Fuel right', unit: 'lb', step: 10 },
  { key: 'engine.volts', label: 'Volts', unit: 'V', step: 0.5 },
  { key: 'engine.amps', label: 'Amps', unit: 'A', step: 5, swing: true },
  { key: 'engine.hydPsi', label: 'Hydraulic pressure', unit: 'psi', step: 100 },
]);

/** The warning and caution lights: the three on the coaming's lip first, then the caution panel's (the shared cockpit's names). */
export const LIGHTS = Object.freeze([...MASTER_LAMPS, ...ANNUNCIATOR_NAMES].map((name) => Object.freeze({ key: `light.${name}`, label: `${name} light`, name })));
/** The lights shown first in the console; the rest sit behind "More lights". */
export const MAIN_LIGHTS = Object.freeze(['light.FIRE', 'light.MASTER WARN', 'light.MASTER CAUTION', 'light.CHIP', 'light.OIL PX', 'light.FUEL PX', 'light.GEN', 'light.HYDR FL LO']);

/** What the student can ask about that the panel doesn't draw, shown as words when revealed (spec: outside cues, gear and flaps). */
export const WORDS = Object.freeze([
  { key: 'cue.smoke', label: 'Smoke' },
  { key: 'cue.flames', label: 'Flames' },
  { key: 'cue.oilWindscreen', label: 'Oil on the windscreen' },
  { key: 'cue.roughness', label: 'Roughness' },
  { key: 'cue.noises', label: 'Noises' },
  { key: 'config.gear', label: 'Gear' },
  { key: 'config.flaps', label: 'Flaps' },
]);

/** The flight instruments, always on the panel (EP-4); the instructor can set them. */
export const FLIGHT = Object.freeze([
  { key: 'flight.altFt', label: 'Altitude', unit: 'ft', step: 100 },
  { key: 'flight.kias', label: 'Airspeed', unit: 'KIAS', step: 5 },
  { key: 'flight.headingDegM', label: 'Heading', unit: '°M', step: 5 },
  { key: 'flight.pitchDeg', label: 'Pitch', unit: '°', step: 1 },
  { key: 'flight.bankDeg', label: 'Bank (right +)', unit: '°', step: 5 },
]);

const ALL = [...NUMBERS, ...LIGHTS, ...WORDS, ...FLIGHT];
const BY_KEY = new Map(ALL.map((d) => [d.key, d]));
export const definitionOf = (key) => BY_KEY.get(key) ?? null;
export const labelOf = (key) => BY_KEY.get(key)?.label ?? key;

const round = (v, step) => {
  const digits = step < 1 ? 1 : 0;
  return Number(v).toLocaleString('en-CA', { maximumFractionDigits: digits, minimumFractionDigits: digits });
};

/** A setting in words: "300 ±40 pph", "ON", "off", or the words themselves. */
export function valueWords(key, value) {
  const d = definitionOf(key);
  if (key.startsWith('light.')) return value ? 'ON' : 'off';
  if (value === undefined || value === null) return '—';
  if (typeof value === 'object') return `${round(value.v, d?.step ?? 1)} ±${round(value.swing, d?.step ?? 1)}${d?.unit ? ` ${d.unit}` : ''}`;
  if (typeof value === 'number') return `${round(value, d?.step ?? 1)}${d?.unit ? ` ${d.unit}` : ''}`;
  return String(value);
}

/** A log line's keys turned into the screen's words (scenario.js logs the keys). */
const KEYS_LONGEST_FIRST = [...BY_KEY.keys()].sort((a, b) => b.length - a.length);
export function logWords(text) {
  let out = text;
  for (const key of KEYS_LONGEST_FIRST) if (out.includes(key)) out = out.split(key).join(labelOf(key));
  return out;
}

/**
 * The shared cockpit's `hud` for a panel (scenario.js panelOf): the flight instruments always, and `engine` with only the revealed
 * numbers and lit lights (an unrevealed number shows dashes and an unrevealed light stays dark, EP-4).
 */
export function hudOf(panel) {
  const now = panel.now;
  const engine = { lights: [] };
  for (const [key, value] of Object.entries(now)) {
    if (key.startsWith('engine.') && Number.isFinite(value)) engine[key.slice(7)] = value;
    else if (key.startsWith('light.') && value) engine.lights.push(key.slice(6));
  }
  return {
    pitchDeg: now['flight.pitchDeg'],
    bankDeg: now['flight.bankDeg'],
    altFt: now['flight.altFt'],
    kias: now['flight.kias'],
    headingDeg: now['flight.headingDegM'],
    g: 1, // the aircraft holds its state: 1 G (no flight maths in this version)
    vsFpm: 0,
    engine,
  };
}
