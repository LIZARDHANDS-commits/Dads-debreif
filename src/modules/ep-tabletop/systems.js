// The EP Tabletop's systems model (EP-11; docs/modules/ep-tabletop/systems-plan.md section 2): the instructor sets causes (faults), the
// gauges follow from the causes and the clock, the lights follow from the gauges by thresholds, and the instructor's typed values (overrides)
// win over both. Pure: numbers in, numbers out, no page and no clock of its own, so any moment can be worked out again (rewind needs that).
//
//   shownOf(session) = overrides  over  lightsOf(gauges + overrides)  over  gauges,   gauges = gaugesOf(baseline, faults, clockS)
//
// The baseline is the scenario's healthy start (scenario.start.shown). Lights are references, never walls: a lit light never stops a gauge
// moving on (rule book, "Flying numbers and manuals").
//
// A fault is { id, kind, severity, startedAtS, trend, params, effectS, effectAtS }:
//   kind:       one of FAULT_KINDS
//   severity:   0 to 1, the instructor's dial (DEFAULT_SEVERITY to start); sets how fast a running fault moves its gauge
//   startedAtS: the scenario clock when it began
//   trend:      'worsening' | 'steady' | 'improving'
//   params:     per kind, for example { side: 'L' } for a fuel imbalance or a fuel leak
//   effectS, effectAtS: how far a running fault had got (in seconds of running at REFERENCE_SEVERITY) at clock time effectAtS. A change of
//               severity or trend starts a new leg from there, so the gauge carries on from where it was instead of jumping.
//
// Every number names its source: 'baseline' (docs/references/open-source-performance-baseline.md, ALL-30), a manual page or Patrick's
// ruling, or 'estimate' until one backs it. No manual page is cited here yet: none of the thresholds or rates has one (EP-Q10's working
// answer: build with the estimates, each shown "(estimate)" on the console).

/** The causes the instructor can set (systems-plan section 2.1). engineFail moves the gauges only; flying the aircraft is plan Step 5. */
export const FAULT_KINDS = Object.freeze(['oilLeak', 'chip', 'fuelImbalance', 'fire', 'genFail', 'roughness', 'engineFail', 'hydLeak', 'fuelLeak']);
export const TRENDS = Object.freeze(['worsening', 'steady', 'improving']);
/** The severity a new fault starts at, and the one the rates below are written for (systems-plan section 2.1: "0.5 by default"). A tool choice. */
export const DEFAULT_SEVERITY = 0.5;
export const REFERENCE_SEVERITY = 0.5;

const fuelKey = (f) => (f.params?.side === 'R' ? 'engine.fuelRightLb' : 'engine.fuelLeftLb');

/**
 * What each fault does, one row per kind. `severity` / `trend`: whether the dial and the trend buttons change anything for this kind.
 * Each effect is one of:
 *   { key, run: { change, overS }, floor | ceil }  a running change: `change` in `overS` seconds at REFERENCE_SEVERITY, faster or slower with
 *                                                   the dial, backwards when improving, held when steady; kept inside floor / ceil
 *   { key, to, overS }                              moves straight to `to` over `overS` seconds from the start, whatever the dial
 *   { key, swingAtFull }                            the gauge fluctuates by ± swingAtFull × severity about its value
 *   { light }                                       the light is on while the fault is set (an event: the fault itself is the source)
 * `key` may be a function of the fault (the fuel side). Every effect carries its `source`.
 */
export const FAULT_EFFECTS = Object.freeze({
  oilLeak: Object.freeze({
    label: 'Oil leak', severity: true, trend: true,
    effects: Object.freeze([
      Object.freeze({ key: 'engine.oilPsi', run: { change: -65, overS: 180 }, floor: 0, source: 'estimate', note: 'oil pressure falls about 65 psi in 3 minutes at severity 0.5 (105 to 40 psi from the healthy cruise), on toward zero; Patrick\'s ruling wanted' }),
      Object.freeze({ key: 'engine.oilTempC', run: { change: 20, overS: 180 }, ceil: 140, source: 'estimate', note: 'oil temperature rises about 20 °C in 3 minutes at severity 0.5, up to 140 °C' }),
    ]),
  }),
  chip: Object.freeze({
    label: 'Chip detected', severity: false, trend: false,
    effects: Object.freeze([Object.freeze({ light: 'CHIP', source: 'event', note: 'CHIP on while the fault is set' })]),
  }),
  fuelImbalance: Object.freeze({
    label: 'Fuel imbalance', severity: true, trend: true, sided: true,
    effects: Object.freeze([
      Object.freeze({ key: fuelKey, run: { change: -50, overS: 60 }, floor: 0, source: 'estimate', note: 'the chosen tank\'s reading falls about 50 lb a minute at severity 0.5 against the other' }),
    ]),
  }),
  fire: Object.freeze({
    label: 'Fire', severity: false, trend: false,
    effects: Object.freeze([Object.freeze({ light: 'FIRE', source: 'event', note: 'FIRE on while the fault is set' })]),
  }),
  genFail: Object.freeze({
    label: 'Generator failure', severity: false, trend: false,
    effects: Object.freeze([
      Object.freeze({ light: 'GEN', source: 'event', note: 'GEN on while the fault is set' }),
      Object.freeze({ key: 'engine.volts', to: 24, overS: 0, source: 'estimate', note: 'volts drop to about 24 V, the battery\'s; needs a page or Patrick' }),
      Object.freeze({ key: 'engine.amps', to: 0, overS: 0, source: 'estimate', note: 'amps to zero' }),
    ]),
  }),
  roughness: Object.freeze({
    label: 'Engine roughness', severity: true, trend: false,
    effects: Object.freeze([
      Object.freeze({ key: 'engine.fuelFlowPph', swingAtFull: 80, source: 'estimate', note: 'fuel flow swings ±40 pph at severity 0.5 (the spec\'s mock-up)' }),
      Object.freeze({ key: 'engine.torquePct', swingAtFull: 6, source: 'estimate', note: 'torque swings ±3 % at severity 0.5' }),
      Object.freeze({ key: 'engine.npPct', swingAtFull: 2, source: 'estimate', note: 'Np swings ±1 % at severity 0.5' }),
    ]),
  }),
  engineFail: Object.freeze({
    label: 'Engine failure (gauges only)', severity: false, trend: false,
    effects: Object.freeze([
      Object.freeze({ key: 'engine.torquePct', to: 0, overS: 10, source: 'estimate', note: 'torque, N1, fuel flow and oil pressure run down to zero and ITT to 100 °C over about 10 s' }),
      Object.freeze({ key: 'engine.n1Pct', to: 0, overS: 10, source: 'estimate' }),
      Object.freeze({ key: 'engine.fuelFlowPph', to: 0, overS: 10, source: 'estimate' }),
      Object.freeze({ key: 'engine.ittC', to: 100, overS: 10, source: 'estimate' }),
      Object.freeze({ key: 'engine.oilPsi', to: 0, overS: 10, source: 'estimate' }),
    ]),
  }),
  hydLeak: Object.freeze({
    label: 'Hydraulic leak', severity: true, trend: true,
    effects: Object.freeze([
      Object.freeze({ light: 'HYDR FL LO', source: 'event', note: 'HYDR FL LO on while the fault is set' }),
      Object.freeze({ key: 'engine.hydPsi', run: { change: -3000, overS: 240 }, floor: 0, source: 'estimate', note: 'hydraulic pressure falls about 3,000 psi in 4 minutes at severity 0.5' }),
    ]),
  }),
  fuelLeak: Object.freeze({
    label: 'Fuel leak', severity: true, trend: true, sided: true,
    effects: Object.freeze([
      Object.freeze({ light: 'FUEL PX', source: 'event', note: 'FUEL PX on while the fault is set (systems-plan section 2.3); needs a page' }),
      Object.freeze({ key: fuelKey, run: { change: -25, overS: 60 }, floor: 0, source: 'estimate', note: 'the chosen tank\'s reading falls about 25 lb a minute at severity 0.5' }),
    ]),
  }),
});

/**
 * The lights that follow a gauge (systems-plan section 2.3), by the shared cockpit's light names. `below` / `above`: lit past that value of
 * `gauge`; `diffOver`: lit when the two gauges differ by more. Every one is an estimate until Patrick gives the page or the number.
 * Event lights (CHIP, FIRE, GEN, HYDR FL LO, FUEL PX) come from FAULT_EFFECTS. MASTER CAUTION and MASTER WARN: see lightsOf.
 */
export const LIGHT_THRESHOLDS = Object.freeze({
  'OIL PX': Object.freeze({ gauge: 'engine.oilPsi', below: 90, unit: 'psi', source: 'estimate', note: 'below 90 psi, the bottom of the 90 to 120 psi normal range (baseline, ALL-30); the real caution threshold is likely lower; needs a page' }),
  'FUEL BAL': Object.freeze({ gauges: Object.freeze(['engine.fuelLeftLb', 'engine.fuelRightLb']), diffOver: 50, unit: 'lb', source: 'estimate', note: 'tanks more than 50 lb apart (AI recollection; the "for more than 2 minutes" part is not modelled); needs a page' }),
  'L FUEL LO': Object.freeze({ gauge: 'engine.fuelLeftLb', below: 110, unit: 'lb', source: 'estimate', note: 'left tank below 110 lb (AI recollection); needs a page' }),
  'R FUEL LO': Object.freeze({ gauge: 'engine.fuelRightLb', below: 110, unit: 'lb', source: 'estimate', note: 'right tank below 110 lb (AI recollection); needs a page' }),
});

/** The lamps on the coaming's lip; every other light is on the caution panel, and lights MASTER CAUTION (systems-plan 2.3; needs a page). */
const MASTER_WARN = 'MASTER WARN';
const MASTER_CAUTION = 'MASTER CAUTION';
/** The warnings that light MASTER WARN: FIRE only, until a page says what else is a warning (systems-plan 2.3). */
const WARNINGS = Object.freeze(['FIRE']);
const LIP = new Set([MASTER_WARN, MASTER_CAUTION, ...WARNINGS]);

const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));
const centre = (v) => (v && typeof v === 'object' ? Number(v.v) : Number(v));
/** A gauge's setting with its centre value changed, keeping a fluctuation it already had. */
const withCentre = (old, v) => (old && typeof old === 'object' ? { ...old, v } : v);
const keyOf = (effect, f) => (typeof effect.key === 'function' ? effect.key(f) : effect.key);

/** A fault as the model keeps it: known kind, severity 0 to 1, a known trend, its leg started. Null for an unknown kind. */
export function makeFault({ id, kind, severity = DEFAULT_SEVERITY, trend = 'worsening', params = {}, startedAtS = 0 }) {
  if (!FAULT_EFFECTS[kind]) return null;
  return {
    id: String(id ?? kind),
    kind,
    severity: clamp01(severity),
    startedAtS,
    trend: TRENDS.includes(trend) ? trend : 'worsening',
    params: { ...params },
    effectS: 0,
    effectAtS: startedAtS,
  };
}

/** How far a running fault has got at `clockS`, in seconds of running at REFERENCE_SEVERITY (never below zero: healthy is as good as it gets). */
export function effectSecondsOf(f, clockS) {
  const sign = f.trend === 'worsening' ? 1 : f.trend === 'improving' ? -1 : 0;
  const leg = Math.max(0, clockS - (f.effectAtS ?? f.startedAtS ?? 0));
  return Math.max(0, (f.effectS ?? 0) + sign * leg * (clamp01(f.severity) / REFERENCE_SEVERITY));
}

/** The fault with a new severity and / or trend from `clockS` on: the new leg starts where the old one had got to. */
export function changeFault(f, { severity, trend }, clockS) {
  return {
    ...f,
    severity: severity === undefined ? f.severity : clamp01(severity),
    trend: TRENDS.includes(trend) ? trend : f.trend,
    effectS: effectSecondsOf(f, clockS),
    effectAtS: clockS,
  };
}

/**
 * The gauges at `clockS`: the healthy `baseline` (a scenario's start.shown) with each fault's effects worked on it, in the order the faults
 * were set, and each event light the faults light. Everything not touched is the baseline's.
 */
export function gaugesOf(baseline, faults, clockS) {
  const g = { ...baseline };
  for (const f of faults ?? []) {
    const row = FAULT_EFFECTS[f.kind];
    if (!row) continue;
    for (const e of row.effects) {
      if (e.light) {
        g[`light.${e.light}`] = true;
        continue;
      }
      const key = keyOf(e, f);
      if (!(key in g)) continue;
      const now = centre(g[key]);
      if (!Number.isFinite(now)) continue;
      if (e.run) {
        let v = now + (e.run.change / e.run.overS) * effectSecondsOf(f, clockS);
        if (Number.isFinite(e.floor)) v = Math.max(e.floor, v);
        if (Number.isFinite(e.ceil)) v = Math.min(e.ceil, v);
        g[key] = withCentre(g[key], v);
      } else if (Number.isFinite(e.to)) {
        const t = e.overS > 0 ? Math.min(1, Math.max(0, clockS - f.startedAtS) / e.overS) : 1;
        g[key] = withCentre(g[key], now + (e.to - now) * t);
      } else if (Number.isFinite(e.swingAtFull)) {
        const swing = Math.max(Number(g[key]?.swing) || 0, e.swingAtFull * clamp01(f.severity));
        g[key] = swing > 0 ? { v: now, swing } : now;
      }
    }
  }
  return g;
}

function thresholdLit(t, g) {
  if (Number.isFinite(t.diffOver)) {
    const [a, b] = t.gauges.map((k) => centre(g[k]));
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) > t.diffOver;
  }
  const v = centre(g[t.gauge]);
  if (!Number.isFinite(v)) return false;
  if (Number.isFinite(t.below)) return v < t.below;
  if (Number.isFinite(t.above)) return v > t.above;
  return false;
}

/**
 * The lights from the gauges: each light lit when its gauge is past its threshold (LIGHT_THRESHOLDS) or already on in `gauges` (an event
 * light from a fault, or the scenario's start); then the instructor's light ticks in `overrides` win; then MASTER CAUTION is on with any
 * caution-panel light and MASTER WARN with FIRE, unless the instructor has ticked the master itself. Returns { 'light.<name>': boolean }.
 * The gauges given should already carry the instructor's typed numbers, so a typed pressure moves its light (shownOf does this).
 */
export function lightsOf(gauges, overrides = {}) {
  const lights = {};
  for (const [key, v] of Object.entries(gauges)) if (key.startsWith('light.')) lights[key] = v === true;
  for (const [name, t] of Object.entries(LIGHT_THRESHOLDS)) lights[`light.${name}`] = Boolean(lights[`light.${name}`]) || thresholdLit(t, gauges);
  for (const [key, v] of Object.entries(overrides)) if (key.startsWith('light.')) lights[key] = v === true;
  const lit = (name) => lights[`light.${name}`] === true;
  const names = Object.keys(lights).map((k) => k.slice(6));
  if (!(`light.${MASTER_CAUTION}` in overrides)) lights[`light.${MASTER_CAUTION}`] = lit(MASTER_CAUTION) || names.some((n) => !LIP.has(n) && lit(n));
  if (!(`light.${MASTER_WARN}` in overrides)) lights[`light.${MASTER_WARN}`] = lit(MASTER_WARN) || WARNINGS.some(lit);
  return lights;
}

/**
 * Every indication as the aircraft shows it now, revealed or not (the instructor's view): the instructor's overrides win, then the lights,
 * then the gauges. `s` is a scenario.js session: { scenario: { start: { shown } }, faults, overrides, clockS }.
 */
export function shownOf(s) {
  const overrides = s.overrides ?? {};
  const gauges = gaugesOf(s.scenario.start.shown, s.faults, s.clockS);
  return { ...gauges, ...lightsOf({ ...gauges, ...overrides }, overrides), ...overrides };
}

/** The faults' words for the instructor, by kind. */
export const faultLabel = (kind) => FAULT_EFFECTS[kind]?.label ?? kind;

/** The threshold a light or gauge follows, in words, for the console: { text, estimate } or null. */
export function thresholdNoteOf(key) {
  const name = key.startsWith('light.') ? key.slice(6) : null;
  const found = [];
  for (const [light, t] of Object.entries(LIGHT_THRESHOLDS)) {
    const reads = t.gauges ? t.gauges.includes(key) : t.gauge === key;
    if (name !== light && !reads) continue;
    const rule = Number.isFinite(t.diffOver) ? `tanks over ${t.diffOver} ${t.unit} apart` : Number.isFinite(t.below) ? `below ${t.below} ${t.unit}` : `above ${t.above} ${t.unit}`;
    found.push({ text: name === light ? `on ${rule}` : `${light} ${rule}`, estimate: t.source === 'estimate', note: t.note });
  }
  if (!found.length) return null;
  return { text: found.map((f) => f.text).join('; '), estimate: found.some((f) => f.estimate), note: found.map((f) => f.note).join(' ') };
}
