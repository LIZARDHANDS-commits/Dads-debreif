// The SOF map's Layers menu, without a page (SPEC-sof, "Map": Layers menu). Which
// layers exist, which start on (R22: only the essentials), each layer's opacity,
// the base map choice, and the order they stack in. The state is one plain object
// that is checked on the way in from storage; anything wrong is the default.
//
//   { base, precip, on: { radar: true, … }, traffic: { label, militaryOnly, trails }, opacity: { radar: 75, … } }
//
// The ADS-B Exchange view is not a layer: it swaps the whole map area, always starts
// off, and is not kept (map.js).

/** The base map choices: Satellite, the VNC chart, or the VNC chart over satellite. */
export const BASES = Object.freeze([
  Object.freeze({ id: 'satellite', label: 'Satellite' }),
  Object.freeze({ id: 'vnc', label: 'VNC chart' }),
  Object.freeze({ id: 'vnc-satellite', label: 'VNC over satellite' }),
]);

/**
 * The overlays, from the bottom of the stack to the top, in the order the menu lists them.
 * `on`: whether it starts on. `opacity`: has a slider, and its starting percent.
 * `needsRelay`: the switch is hidden until the traffic relay's address is set.
 */
export const OVERLAYS = Object.freeze(/** @type {Array<{ id: string, label: string, on: boolean, opacity?: number, needsRelay?: boolean }>} */ ([
  Object.freeze({ id: 'cloud', label: 'Satellite cloud picture (GOES)', on: false, opacity: 60 }),
  Object.freeze({ id: 'radar', label: 'Radar (rain or snow)', on: true, opacity: 75 }),
  Object.freeze({ id: 'coverage', label: 'Radar coverage', on: true, opacity: 60 }),
  Object.freeze({ id: 'lightning', label: 'Lightning density, last 10 min', on: true, opacity: 85 }),
  Object.freeze({ id: 'warnings', label: 'Weather warnings', on: false, opacity: 60 }),
  Object.freeze({ id: 'routes', label: 'Training routes and areas', on: false, opacity: 80 }),
  Object.freeze({ id: 'rings', label: '25 and 50 NM rings', on: true }),
  Object.freeze({ id: 'airfields', label: 'Airfields with wind barbs', on: true }),
  Object.freeze({ id: 'traffic', label: 'Live traffic', on: false, needsRelay: true }),
]));

const BY_ID = new Map(OVERLAYS.map((o) => [o.id, o]));
const BASE_IDS = new Set(BASES.map((b) => b.id));

/** The traffic layer's label choices (SPEC-sof: labels off by default; V6's callsign, altitude and military-only choices come back as options). */
export const TRAFFIC_LABELS = Object.freeze([
  Object.freeze({ id: 'off', label: 'No labels' }),
  Object.freeze({ id: 'callsign', label: 'Callsign' }),
  Object.freeze({ id: 'callsign-altitude', label: 'Callsign and altitude' }),
  Object.freeze({ id: 'full', label: 'Callsign, altitude, speed and type' }),
]);
const LABEL_IDS = new Set(TRAFFIC_LABELS.map((l) => l.id));

/** The opacity slider's range, in percent. */
export const OPACITY_RANGE = Object.freeze({ min: 10, max: 100, step: 5 });

/** How dark the base map is drawn under everything (a little, so radar stands out). */
export const BASE_DIM = 0.22;

/** The VNC chart's opacity when it is over the satellite picture. */
export const VNC_OVER_SATELLITE_PCT = 70;

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

/** Snow by default from November to March, rain otherwise (SPEC-sof, Radar). `now` is a Date. */
export function defaultPrecip(now) {
  const month = now instanceof Date && !Number.isNaN(+now) ? now.getUTCMonth() : 5;
  return month >= 10 || month <= 2 ? 'snow' : 'rain';
}

/** Every layer at its starting state. */
export function defaultLayers({ now } = /** @type {any} */ ({})) {
  return {
    base: 'satellite',
    precip: defaultPrecip(now),
    on: Object.fromEntries(OVERLAYS.map((o) => [o.id, o.on])),
    traffic: { label: 'off', militaryOnly: false, trails: true }, // trails: the fading line behind each aircraft, in 2D and 3D (Dad, 7 Oct), on to begin with
    // The VNC chart's own slider is for when it is over the satellite picture.
    opacity: { ...Object.fromEntries(OVERLAYS.filter((o) => o.opacity !== undefined).map((o) => [o.id, o.opacity])), vnc: VNC_OVER_SATELLITE_PCT },
  };
}

const snapPct = (n) => {
  const { min, max, step } = OPACITY_RANGE;
  return Math.min(max, Math.max(min, Math.round(n / step) * step));
};

/**
 * Stored layer state checked: unknown layers, and values of the wrong type or out of
 * range, are the defaults; an opacity is kept to its slider's range and step.
 * Returns a new object and never throws.
 */
export function cleanLayers(raw, { now } = /** @type {any} */ ({})) {
  const out = defaultLayers({ now });
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return out;
  if (typeof raw.base === 'string' && BASE_IDS.has(raw.base)) out.base = raw.base;
  if (raw.precip === 'rain' || raw.precip === 'snow') out.precip = raw.precip;
  const t = raw.traffic !== null && typeof raw.traffic === 'object' ? raw.traffic : {};
  if (typeof t.label === 'string' && LABEL_IDS.has(t.label)) out.traffic.label = t.label;
  if (typeof t.militaryOnly === 'boolean') out.traffic.militaryOnly = t.militaryOnly;
  if (typeof t.trails === 'boolean') out.traffic.trails = t.trails;
  const on = raw.on !== null && typeof raw.on === 'object' ? raw.on : {};
  const opacity = raw.opacity !== null && typeof raw.opacity === 'object' ? raw.opacity : {};
  if (Object.hasOwn(opacity, 'vnc') && isNumber(opacity.vnc)) out.opacity.vnc = snapPct(opacity.vnc);
  for (const id of BY_ID.keys()) {
    if (Object.hasOwn(on, id) && typeof on[id] === 'boolean') out.on[id] = on[id];
    if (id in out.opacity && Object.hasOwn(opacity, id) && isNumber(opacity[id])) out.opacity[id] = snapPct(opacity[id]);
  }
  return out;
}

/** A layer switched on or off. Unknown layers change nothing. Returns a new state. */
export function setLayerOn(state, id, on) {
  if (!BY_ID.has(id) || typeof on !== 'boolean') return state;
  return { ...state, on: { ...state.on, [id]: on } };
}

/** A layer's opacity set, kept to the slider's range and step. Layers without a slider change nothing. */
export function setLayerOpacity(state, id, percent) {
  if (!(id in state.opacity) || !isNumber(percent)) return state;
  return { ...state, opacity: { ...state.opacity, [id]: snapPct(percent) } };
}

/** The base map chosen. Anything not on the list changes nothing. */
export function setBase(state, base) {
  return BASE_IDS.has(base) ? { ...state, base } : state;
}

/** The traffic layer's label choice, military only, or trails on or off. Anything not on the list changes nothing. */
export function setTrafficOption(state, { label, militaryOnly, trails } = /** @type {any} */ ({})) {
  const next = { ...state.traffic };
  if (typeof label === 'string' && LABEL_IDS.has(/** @type {any} */ (label))) next.label = /** @type {any} */ (label);
  if (typeof militaryOnly === 'boolean') next.militaryOnly = militaryOnly;
  if (typeof trails === 'boolean') next.trails = trails;
  return next.label === state.traffic.label && next.militaryOnly === state.traffic.militaryOnly && next.trails === state.traffic.trails ? state : { ...state, traffic: next };
}

/** Rain or Snow. */
export function setPrecip(state, precip) {
  return precip === 'rain' || precip === 'snow' ? { ...state, precip } : state;
}

/**
 * The overlays that are switched on, bottom to top: the order they are drawn in. Traffic is
 * left out until the relay's address is set (`relay`: true), whatever was kept.
 */
export function stackOrder(state, { relay = false } = {}) {
  return OVERLAYS.filter((o) => state.on[o.id] && (!o.needsRelay || relay)).map((o) => o.id);
}

/** The menu's rows: the overlays in the order listed, without Traffic until the relay is set. */
export function menuRows(state, { relay = false } = {}) {
  return OVERLAYS.filter((o) => !o.needsRelay || relay).map((o) => ({
    id: o.id,
    label: o.label,
    on: state.on[o.id] === true,
    opacity: o.opacity === undefined ? null : state.opacity[o.id],
  }));
}

/**
 * What the base draws: `satellite` is always true (under the VNC chart too, since outside the charts the
 * satellite picture shows, SPEC-sof), and `vnc` is the chart's opacity in percent, or null when it is not
 * drawn: 100 for the VNC chart, the slider's for VNC over satellite.
 */
export function baseLayers(state) {
  return {
    satellite: true,
    vnc: state.base === 'vnc' ? 100 : state.base === 'vnc-satellite' ? state.opacity?.vnc ?? VNC_OVER_SATELLITE_PCT : null,
  };
}
