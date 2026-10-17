// The EP Tabletop's scenario engine (docs/modules/ep-tabletop/spec.md, "Scenarios", "Pause and live changes"): pure, no page and no flight
// maths of its own. Since plan Step 5 the aircraft flies (flight.js, EP-13): the session holds the flight, `advance` steps it with the clock
// (to each timed development's own time first, so a cause starts where it should), and a pick ('pick', manoeuvres.js) changes what it flies.
//
// A scenario is { id, title, start, developments }:
//   start: { phase, altFt, kias, headingDegM, position: { fromIcao, bearingDegT, distNm }, fuelLb, weather (words), wind: { fromDegT, kt },
//            manoeuvre (the pick it starts flying, 'straightLevel' unless said), shown: { key: value } }
//     (start.shown is the healthy baseline the systems model works from, systems.js; the flight instruments come from the flight)
//   developments: [{ id, label, at: { timeS } | { step } | { tap: true }, set: { key: value },
//                    fault?: { id, kind, severity, trend, params } (or a list), faultChange?: { id, severity, trend, clear } (or a list) }]
// An indication key names what it is: 'engine.<ENGINE_LIVE key>' (a number, or { v, swing } for a fluctuating one), 'light.<name>' (true when
// lit), 'cue.<name>' (words: smoke, flames, oil on the windscreen, roughness, noises), 'config.gear' and 'config.flaps' (words) and
// 'flight.<pitchDeg | bankDeg | altFt | kias | headingDegM>' (numbers, always on the panel: the student flies by them in Aircraft control).
// The flight instruments are the flight's (flight.js flightShown). A typed altitude, airspeed or heading (the console, or a development's
// `set`) puts the aircraft there on Apply and it flies on from there; it is not kept as a typed value. Pitch and bank are flown, not typed.
//
// A session holds the clock (it moves only while running), the step on the A-A-B-C-D-E-F track, the causes set (`faults`, systems.js) and
// the instructor's typed values (`overrides`, which win), which indications the student has asked about (`revealed`: only those reach the
// panel, EP-R6), the instructor's edits and fault changes not yet applied (`pending`, `pendingFaults`, EP-R4), the developments still to
// come, the FEVER and TCCC prompts, marks and notes, the Declare boxes and the log (EP-R9). What the panel shows is worked out, not stored:
// systems.js shownOf (EP-11). Every function returns a new session; none changes the one it is given.
//
// "Any setup" (plan Step 5b; EP-17 to EP-19): a scenario with `kind: 'setup'` (scenarios.js ANY_SETUP) starts frozen at its start.setup
// (steps.js cleanSetup; flight.js createSetupFlight), and has three more actions: freeze (a new setup: the aircraft put there, paused),
// carryOn (the controls held, time running) and flySteps (the step builder's rows, flown in order, exactly as entered; at the last row's end
// the session pauses and logs the new position and state in words). Its situation for the student is the freeze. The student's picks
// don't apply to it (the step builder flies it). Everything arriving in these actions is checked as untrusted (steps.js cleanSetup and
// cleanRows, as cleanPick).
import { shownOf, makeFault, changeFault, faultLabel, FAULT_EFFECTS } from './systems.js';
import { createFlight, flyTo, applyPick, placeFlight, FIELD_IDS, createSetupFlight, setupCarryOn, setupFly, takeSaid, stateWords, flightNow, STEP_S } from './flight.js';
import { cleanPick, manoeuvreById } from './manoeuvres.js';
import { cleanSetup, cleanRows, rowWords } from './steps.js';
import { compassDegFromVector } from '../../core/angles.js';
import { FT_PER_NM } from '../../core/units.js';

/** The step track, in Fig 1.4's order (AETCMAN 11-248 para 1.20.3, cited by paragraph only). */
export const STEPS = Object.freeze([
  Object.freeze({ id: 'A', letter: 'A', name: 'Aircraft control' }),
  Object.freeze({ id: 'AN', letter: 'A', name: 'Analyse the situation' }),
  Object.freeze({ id: 'B', letter: 'B', name: 'Boldface' }),
  Object.freeze({ id: 'C', letter: 'C', name: 'Checklists' }),
  Object.freeze({ id: 'D', letter: 'D', name: 'Declare, with a plan' }),
  Object.freeze({ id: 'E', letter: 'E', name: 'Egress / ejection' }),
  Object.freeze({ id: 'F', letter: 'F', name: 'Follow the plan' }),
]);
const STEP_IDS = STEPS.map((s) => s.id);
export const stepName = (id) => STEPS.find((s) => s.id === id)?.name ?? id;

/** "Later" moves the next development this many seconds on (a timed one) or one step on (a step one). A tool choice (EP-6), not a flying number. */
export const LATER_S = 60;
/** A fluctuating number swings once in this many seconds of scenario time (a picture choice, an estimate; it stops when time stands still). */
export const SWING_PERIOD_S = 1.6;

/** The Declare boxes (para 1.20.3.5): nature, fuel in hours and minutes, souls on board, the plan, the time to landing. */
export const DECLARE_FIELDS = Object.freeze(['nature', 'fuel', 'souls', 'plan', 'timeToLand']);

const isFlight = (key) => key.startsWith('flight.');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const words = (v) => (v === true ? 'ON' : v === false ? 'off' : v && typeof v === 'object' ? `${v.v} ±${v.swing}` : typeof v === 'number' ? String(Math.round(v * 10) / 10) : String(v)); // a flown number to a tenth

function log(s, text) {
  return { ...s, log: [...s.log, { tS: s.clockS, step: s.step, text }] };
}

/** Whether a session (or a scenario) is an "Any setup" one. */
export const isSetup = (x) => (x?.scenario ?? x)?.kind === 'setup';

/** An "Any setup" scenario's start with the situation the student is given set from the frozen flight (where, how high, how fast, which way). */
function setupStart(start, flight, setup) {
  const n = flightNow(flight);
  return {
    ...start,
    setup,
    altFt: Math.round(n.altFt),
    kias: Math.round(n.kias),
    headingDegM: Math.round(n.headingDegM) % 360,
    position: { fromIcao: 'CYMJ', bearingDegT: compassDegFromVector(n.x, n.y), distNm: Math.hypot(n.x, n.y) / FT_PER_NM },
  };
}

/** A new session for `scenario`: paused at Aircraft control, not started, nothing revealed. An "Any setup" one starts frozen at its setup. */
export function startSession(scenario0) {
  let scenario = scenario0;
  let flight;
  if (isSetup(scenario0)) {
    const setup = cleanSetup(scenario0.start.setup);
    flight = createSetupFlight(setup, 0);
    scenario = { ...scenario0, start: setupStart(scenario0.start, flight, setup) };
  } else {
    flight = createFlight(scenario0.start);
  }
  return {
    scenario,
    clockS: 0,
    started: false,
    running: false,
    step: 'A',
    visited: ['A'],
    faults: [],
    overrides: {},
    revealed: [],
    pending: {},
    pendingFaults: {},
    developments: scenario.developments.map((d) => ({ ...d, at: { ...d.at }, done: false })),
    prompts: { fever: false, tccc: false },
    marks: {},
    declare: Object.fromEntries(DECLARE_FIELDS.map((f) => [f, ''])),
    flight,
    picks: [],
    log: [{ tS: 0, step: 'A', text: `Scenario: ${scenario.title}` }],
  };
}

/** What the flight reads from the session: the causes applied (the engine's state, systems.js) and the scenario's wind. */
const flightEnv = (s) => ({ faults: s.faults, wind: s.scenario.start.wind });

/**
 * Typed settings (an Apply, or a development's `set`) into the session: the flight instruments' altitude, airspeed and heading put the
 * aircraft there (flight.js placeFlight); pitch and bank are flown, so a typed one is dropped; everything else becomes a typed value.
 */
function putSettings(s, set) {
  const typed = {};
  const place = {};
  for (const [key, value] of Object.entries(set ?? {})) {
    if (!isFlight(key)) typed[key] = value;
    else if (key === 'flight.altFt') place.altFt = Number(value);
    else if (key === 'flight.kias') place.kias = Number(value);
    else if (key === 'flight.headingDegM') place.headingDegM = Number(value);
  }
  const out = { ...s, overrides: { ...s.overrides, ...typed } };
  return Object.keys(place).length && out.flight ? { ...out, flight: placeFlight(out.flight, place, flightEnv(out)) } : out;
}

/**
 * The flight stepped to clock `clockS`, with the outcome logged once when it comes (words only, never right or wrong). In "Any setup" what
 * the step builder said on the way (a stall, a row stopped at its cap, the spin) is logged, and when its last row is over the clock stops
 * there and the session pauses, with the new position and state in words.
 */
function flyOn(s, clockS) {
  if (!s.flight) return { ...s, clockS };
  const flown = flyTo(s.flight, clockS, flightEnv(s));
  const { flight, said, ended } = takeSaid(flown);
  let out = { ...s, clockS: ended ? flight.n * STEP_S : clockS, flight };
  for (const words of said) out = log(out, words);
  if (ended && !flight.outcome) out = log({ ...out, running: false }, `Steps flown; paused: ${stateWords(flight)}`);
  return flight.outcome && !s.flight.outcome ? log(out, flight.outcome.words) : out;
}

/** The value the aircraft shows for `key` now, revealed or not (the instructor's view): the systems model's, with typed values winning. */
export const settingOf = (s, key) => shownOf(s)[key];

const list = (x) => (x === undefined || x === null ? [] : Array.isArray(x) ? x : [x]);
const faultWords = (f) => `${faultLabel(f.kind)}${f.params?.side ? ` (${f.params.side === 'R' ? 'right' : 'left'})` : ''}${FAULT_EFFECTS[f.kind]?.severity ? `, severity ${Math.round(f.severity * 100)} %` : ''}${FAULT_EFFECTS[f.kind]?.trend ? `, ${f.trend}` : ''}`;

/** Sets the fault `f` (a new one, or one replacing the fault with its id) at clock `atS`. */
function putFault(s, spec, atS) {
  const f = makeFault({ ...spec, startedAtS: atS });
  if (!f) return s;
  return log({ ...s, faults: [...s.faults.filter((x) => x.id !== f.id), f] }, `Cause set: ${faultWords(f)}`);
}
/** Changes (or clears) the fault with `change.id` from clock `atS`. */
function changeOne(s, change, atS) {
  const f = s.faults.find((x) => x.id === change.id);
  if (!f) return s;
  if (change.clear) return log({ ...s, faults: s.faults.filter((x) => x.id !== f.id) }, `Cause cleared: ${faultLabel(f.kind)}`);
  const g = changeFault(f, change, atS);
  return log({ ...s, faults: s.faults.map((x) => (x.id === f.id ? g : x)) }, `Cause changed: ${faultWords(g)}`);
}
/** A new fault id, not used by a fault set or waiting, or by one a development will set. */
function newFaultId(s, kind) {
  const used = new Set([...s.faults.map((f) => f.id), ...Object.keys(s.pendingFaults), ...s.developments.flatMap((d) => list(d.fault).map((f) => String(f.id ?? f.kind)))]);
  let n = 1;
  while (used.has(`${kind}-${n}`)) n += 1;
  return `${kind}-${n}`;
}
/** A fault as the console shows it: the one set, with a change waiting on top (null: waiting to be cleared). */
export function faultsOf(s) {
  const out = s.faults.map((f) => ({ fault: f.id in s.pendingFaults ? s.pendingFaults[f.id] ?? f : f, set: true, pending: f.id in s.pendingFaults, clearing: s.pendingFaults[f.id] === null }));
  for (const [id, w] of Object.entries(s.pendingFaults)) if (w && !s.faults.some((f) => f.id === id)) out.push({ fault: w, set: false, pending: true, clearing: false });
  return out;
}

/** The next development still to come (the first in the list not yet happened), or null. */
export const nextDevelopment = (s) => s.developments.find((d) => !d.done) ?? null;

function fire(s, dev) {
  const developments = s.developments.map((d) => (d.id === dev.id ? { ...d, done: true } : d));
  let out = log(putSettings({ ...s, developments }, dev.set), `Development: ${dev.label}`);
  // A timed development's cause starts at its own time, so the gauges are the same however the clock was stepped.
  const atS = Number.isFinite(dev.at?.timeS) ? Math.min(dev.at.timeS, s.clockS) : s.clockS;
  for (const f of list(dev.fault)) out = putFault(out, f, atS);
  for (const c of list(dev.faultChange)) out = changeOne(out, c, atS);
  return out;
}

function fireStep(s) {
  let out = s;
  for (const d of s.developments) if (!d.done && d.at.step === s.step) out = fire(out, d);
  return out;
}

/**
 * Moves the clock on `dtS` seconds if it is running, firing each timed development whose time has come, in time order, and flying the
 * aircraft on with it: up to each development's own time first, then to the end (so the path is the same however the clock was stepped).
 */
export function advance(s, dtS) {
  if (!s.running || !(dtS > 0)) return s;
  const end = s.clockS + dtS;
  const due = s.developments.filter((d) => !d.done && Number.isFinite(d.at.timeS) && d.at.timeS <= end).sort((a, b) => a.at.timeS - b.at.timeS);
  let out = s;
  for (const d of due) out = fire(flyOn(out, Math.max(out.clockS, d.at.timeS)), d);
  return flyOn(out, end);
}

function goStep(s, to) {
  if (!STEP_IDS.includes(to)) return s;
  let out = log({ ...s, step: to, visited: s.visited.includes(to) ? s.visited : [...s.visited, to] }, `Step: ${stepName(to)}`);
  // Time stands still while the student analyses (para 1.20.3.2.1) and resumes for Boldface (para 1.20.3.3); the instructor can still
  // pause or resume at any time (EP-5).
  if (to === 'AN' && out.running) out = log({ ...out, running: false }, 'Time stands still');
  if (to === 'B' && !out.running) out = log({ ...out, running: true, started: true }, 'Time resumes');
  return fireStep(out);
}

/**
 * The instructor's (and the step track's) actions. Any setup adds freeze { setup }, carryOn and flySteps { rows } (see the header). `a.type`:
 * resume, pause; step { to }; next; backToA; reanalyse; reveal { key }; stage { key, value }; discard; apply; fireNext; delayNext;
 * addDevelopment { when: 'tap' | 'later' | a step id, label }; prompt { which: 'fever' | 'tccc', on }; mark { step, mark }; note { step, text };
 * declare { field, value }; addFault { kind, severity, trend, params }; setFault { id, severity, trend }; clearFault { id };
 * pick { manoeuvre, headingDegM?, fieldIcao? } (the student's pick, or the instructor's for them: it flies at once, never waits for Apply).
 * stage, addFault, setFault and clearFault wait in pending until apply (or + Add makes them into a development); discard drops them all.
 * Anything else returns the session unchanged.
 */
export function act(s, a) {
  switch (a?.type) {
    case 'resume':
      return s.running ? s : log({ ...s, running: true, started: true }, s.started ? 'Time resumes' : 'Started');
    case 'pause':
      return s.running ? log({ ...s, running: false }, 'Paused: time stands still') : s;
    case 'step':
      return goStep(s, a.to);
    case 'next': {
      const i = STEP_IDS.indexOf(s.step);
      return i < STEP_IDS.length - 1 ? goStep(s, STEP_IDS[i + 1]) : s;
    }
    case 'backToA':
      return s.step === 'A' ? s : goStep(s, 'A');
    case 'reanalyse':
      return s.step === 'AN' ? s : goStep(s, 'AN');
    case 'reveal':
      return s.revealed.includes(a.key) || isFlight(a.key) ? s : log({ ...s, revealed: [...s.revealed, a.key] }, `Revealed: ${a.key}`);
    case 'stage': {
      const pending = { ...s.pending };
      if (same(a.value, settingOf(s, a.key))) delete pending[a.key];
      else pending[a.key] = a.value;
      return { ...s, pending };
    }
    case 'addFault': {
      const f = makeFault({ ...a, id: newFaultId(s, a.kind), startedAtS: s.clockS });
      return f ? { ...s, pendingFaults: { ...s.pendingFaults, [f.id]: f } } : s;
    }
    case 'setFault': {
      const base = s.pendingFaults[a.id] ?? s.faults.find((f) => f.id === a.id);
      if (!base) return s;
      const next = { ...base, severity: a.severity === undefined ? base.severity : Math.min(1, Math.max(0, Number(a.severity) || 0)), trend: a.trend ?? base.trend };
      const set = s.faults.find((f) => f.id === a.id);
      const pendingFaults = { ...s.pendingFaults };
      if (set && set.severity === next.severity && set.trend === next.trend) delete pendingFaults[a.id];
      else pendingFaults[a.id] = next;
      return { ...s, pendingFaults };
    }
    case 'clearFault': {
      const pendingFaults = { ...s.pendingFaults };
      if (s.faults.some((f) => f.id === a.id)) pendingFaults[a.id] = null;
      else delete pendingFaults[a.id];
      return { ...s, pendingFaults };
    }
    case 'discard':
      return { ...s, pending: {}, pendingFaults: {} };
    case 'apply': {
      const keys = Object.keys(s.pending);
      const faultIds = Object.keys(s.pendingFaults);
      if (!keys.length && !faultIds.length) return s;
      const shown = shownOf(s);
      let out = { ...s, pending: {}, pendingFaults: {} };
      if (keys.length) out = log(putSettings(out, s.pending), `Changed: ${keys.map((k) => `${k} ${words(shown[k])} to ${words(s.pending[k])}`).join('; ')}`);
      for (const id of faultIds) {
        const w = s.pendingFaults[id];
        const set = s.faults.find((f) => f.id === id);
        if (w === null) out = changeOne(out, { id, clear: true }, s.clockS);
        else if (set) out = changeOne(out, { id, severity: w.severity, trend: w.trend }, s.clockS);
        else out = putFault(out, w, s.clockS);
      }
      return out;
    }
    case 'fireNext': {
      const d = nextDevelopment(s);
      return d ? fire(s, d) : s;
    }
    case 'delayNext': {
      const d = nextDevelopment(s);
      if (!d) return s;
      let at;
      if (Number.isFinite(d.at.timeS)) at = { timeS: Math.max(d.at.timeS, s.clockS) + LATER_S };
      else if (d.at.step) at = STEP_IDS.indexOf(d.at.step) < STEP_IDS.length - 1 ? { step: STEP_IDS[STEP_IDS.indexOf(d.at.step) + 1] } : { tap: true };
      else at = { timeS: s.clockS + LATER_S };
      return log({ ...s, developments: s.developments.map((x) => (x.id === d.id ? { ...x, at } : x)) }, `Later: ${d.label}`);
    }
    case 'addDevelopment': {
      const faultIds = Object.keys(s.pendingFaults);
      if (!Object.keys(s.pending).length && !faultIds.length) return s;
      const at = a.when === 'later' ? { timeS: s.clockS + LATER_S } : STEP_IDS.includes(a.when) ? { step: a.when } : { tap: true };
      const id = `added-${s.developments.length + 1}`;
      const fault = [];
      const faultChange = [];
      for (const fid of faultIds) {
        const w = s.pendingFaults[fid];
        if (w === null) faultChange.push({ id: fid, clear: true });
        else if (s.faults.some((f) => f.id === fid)) faultChange.push({ id: fid, severity: w.severity, trend: w.trend });
        else fault.push({ id: w.id, kind: w.kind, severity: w.severity, trend: w.trend, params: { ...w.params } });
      }
      const label = a.label || [...Object.keys(s.pending), ...faultIds.map((fid) => faultLabel((s.pendingFaults[fid] ?? s.faults.find((f) => f.id === fid)).kind))].join(', ');
      const dev = { id, label, at, set: { ...s.pending }, fault, faultChange, done: false };
      // Added straight after the last one that has happened, so it is the next to come.
      const i = s.developments.findIndex((d) => !d.done);
      const developments = i < 0 ? [...s.developments, dev] : [...s.developments.slice(0, i), dev, ...s.developments.slice(i)];
      return log({ ...s, developments, pending: {}, pendingFaults: {} }, `Added development: ${label}`);
    }
    case 'prompt':
      return log({ ...s, prompts: { ...s.prompts, [a.which]: Boolean(a.on) } }, `${a.which === 'tccc' ? 'TCCC' : 'FEVER'} prompt ${a.on ? 'on' : 'off'}`);
    case 'mark':
      return log({ ...s, marks: { ...s.marks, [a.step]: { ...s.marks[a.step], mark: a.mark } } }, `Mark, ${stepName(a.step)}: ${a.mark}`);
    case 'note':
      return log({ ...s, marks: { ...s.marks, [a.step]: { ...s.marks[a.step], note: a.text } } }, `Note, ${stepName(a.step)}: ${a.text}`);
    case 'declare':
      return DECLARE_FIELDS.includes(a.field) ? { ...s, declare: { ...s.declare, [a.field]: String(a.value ?? '') } } : s;
    case 'freeze': {
      // Any setup (EP-17): the aircraft put at the setup (checked, cleanSetup), paused, the clock where it is. A new freeze starts afresh.
      if (!isSetup(s)) return s;
      const setup = cleanSetup(a.setup);
      const n = Math.round(s.clockS / STEP_S);
      const flight = createSetupFlight(setup, n);
      const out = { ...s, clockS: n * STEP_S, running: false, started: true, flight, scenario: { ...s.scenario, start: setupStart(s.scenario.start, flight, setup) } };
      return log(out, `Frozen: ${stateWords(flight)}`);
    }
    case 'carryOn': {
      // Any setup (EP-18): the controls held as they are (the G, bank and power), time running; a spin keeps spinning.
      if (!isSetup(s) || !s.flight || s.flight.outcome) return s;
      return log({ ...s, flight: setupCarryOn(s.flight), running: true, started: true }, 'Carry on: the controls held');
    }
    case 'flySteps': {
      // Any setup (EP-18): the rows the instructor entered (checked, cleanRows), flown in order exactly as entered, time running.
      const rows = cleanRows(a.rows);
      if (!isSetup(s) || !s.flight || s.flight.outcome || !rows.length) return s;
      return log({ ...s, flight: setupFly(s.flight, rows), running: true, started: true }, `Fly: ${rows.map((r, i) => `${i + 1}. ${rowWords(r)}`).join('; ')}`);
    }
    case 'pick': {
      // The student's pick (EP-14), or the instructor's for them in one-screen mode: checked (cleanPick), flown at once. Declare marks D on the
      // step track (systems-plan 4.1); Eject ends the flight. Once the flight has an outcome, a pick changes nothing. An "Any setup" session
      // is flown by its step builder, so a pick changes nothing there.
      const pick = cleanPick(a, FIELD_IDS);
      if (!pick || !s.flight || s.flight.outcome || isSetup(s)) return s;
      const { flight, words: said, resolved } = applyPick(s.flight, pick, flightEnv(s));
      let out = log({ ...s, flight, picks: [...(s.picks ?? []), { clockS: s.clockS, ...resolved }] }, `Pick: ${said}`);
      if (flight.outcome) out = log(out, flight.outcome.words);
      if (manoeuvreById(pick.manoeuvre).id === 'declare' && out.step !== 'D') out = goStep(out, 'D');
      return out;
    }
    default:
      return s;
  }
}

/** A setting as a number now: a fluctuating one ({ v, swing }) swings with the scenario clock, so it stops when time stands still. */
export function valueNow(value, clockS) {
  if (value && typeof value === 'object' && Number.isFinite(value.v)) {
    return value.v + (Number(value.swing) || 0) * Math.sin((2 * Math.PI * clockS) / SWING_PERIOD_S);
  }
  return value;
}

/**
 * What the student's panel shows: `set` holds each revealed indication's setting (and the flight instruments, always), `now` the same with a
 * fluctuating number at this moment's value. An indication nobody has asked about is in neither (EP-R6); pending edits never are (EP-R4).
 */
export function panelOf(s) {
  const set = {};
  for (const [key, value] of Object.entries(shownOf(s))) if (isFlight(key) || s.revealed.includes(key)) set[key] = value;
  const now = Object.fromEntries(Object.entries(set).map(([k, v]) => [k, valueNow(v, s.clockS)]));
  return { set, now };
}
