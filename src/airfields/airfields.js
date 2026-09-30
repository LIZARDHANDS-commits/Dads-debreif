// The home field and alternates setting (R16), and what each alternate needs
// for wx's assessAlternate. See specs/SPEC-airfields.md.
//
// The setting holds only what someone changed or added; the built-in list
// (catalog.js) fills in the rest. Everything read back from storage or passed
// to update() is checked here, and anything that fails is dropped, not guessed.
import { CATALOG, DEFAULT_HOME, DEFAULT_ALTERNATES } from './catalog.js';
import { APPROACH_TYPES, alternateMinima, landingMinima } from './minima.js';
import { greatCircleNm } from './distance.js';

export const MAX_ALTERNATES = 6;
const VERSION = 1;
const KEY = 'setup';
const MAX_NAME = 40;
const MAX_FIELDS = 50;
const ICAO = /^[A-Z0-9]{4}$/;
const IDENTITY = ['name', 'lat', 'lon', 'elevationFt', 'timeZone']; // fixed for built-in airfields

const defaults = () => ({ version: VERSION, home: DEFAULT_HOME, alternates: [...DEFAULT_ALTERNATES], fields: {} });

function icaoOf(value) {
  if (typeof value !== 'string') return null;
  const id = value.trim().toUpperCase();
  return ICAO.test(id) ? id : null;
}

const inRange = (min, max) => (v) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined);

function knownZone(zone) {
  if (typeof zone !== 'string' || !zone) return undefined;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return undefined;
  }
}

function nameOf(value) {
  if (typeof value !== 'string') return undefined;
  return value.trim().slice(0, MAX_NAME) || undefined;
}

const CHECKS = {
  approach: (v) => (APPROACH_TYPES.includes(v) ? v : undefined),
  lowestHatFt: inRange(0, 5000),
  lowestVisSm: inRange(0, 10),
  gnssPlan: (v) => (v === true ? true : undefined),
  name: nameOf,
  lat: inRange(-90, 90),
  lon: inRange(-180, 180),
  elevationFt: inRange(-1500, 15000),
  timeZone: knownZone,
};

function cleanField(icao, raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const [key, check] of Object.entries(CHECKS)) {
    if (Object.hasOwn(CATALOG, icao) && IDENTITY.includes(key)) continue;
    const value = check(raw[key]);
    if (value !== undefined) out[key] = value;
  }
  return Object.keys(out).length ? out : null;
}

function clean(raw) {
  if (!raw || typeof raw !== 'object' || raw.version !== VERSION) return defaults();
  const home = icaoOf(raw.home) ?? DEFAULT_HOME;
  const alternates = [];
  for (const value of Array.isArray(raw.alternates) ? raw.alternates : []) {
    const id = icaoOf(value);
    if (id && id !== home && !alternates.includes(id) && alternates.length < MAX_ALTERNATES) alternates.push(id);
  }
  const fields = {};
  const rawFields = raw.fields && typeof raw.fields === 'object' ? raw.fields : {};
  for (const [key, value] of Object.entries(rawFields).slice(0, MAX_FIELDS)) {
    const id = icaoOf(key);
    const field = id && cleanField(id, value);
    if (field) fields[id] = field;
  }
  return { version: VERSION, home, alternates, fields };
}

/**
 * createAirfields({ store }): `store` is a storage scope (src/storage), such as
 * app.storage for the airfields module.
 */
export function createAirfields({ store }) {
  let setup = clean(store.get(KEY, null));
  let lastGoodZone = CATALOG[DEFAULT_HOME].timeZone;
  const listeners = new Set();

  function resolve(icao) {
    const builtIn = CATALOG[icao];
    const own = setup.fields[icao] ?? {};
    const field = {
      icao,
      name: builtIn?.name ?? own.name ?? null,
      lat: builtIn?.lat ?? own.lat ?? null,
      lon: builtIn?.lon ?? own.lon ?? null,
      elevationFt: builtIn?.elevationFt ?? own.elevationFt ?? null,
      timeZone: builtIn?.timeZone ?? own.timeZone ?? null,
      builtIn: Boolean(builtIn),
      approach: own.approach ?? 'not-set',
      lowestHatFt: own.lowestHatFt ?? null,
      lowestVisSm: own.lowestVisSm ?? null,
      gnssPlan: own.gnssPlan === true,
    };
    field.gnssApproach = field.approach === 'gnss-only' || field.gnssPlan;
    return field;
  }

  function home() {
    const field = resolve(setup.home);
    if (field.timeZone) lastGoodZone = field.timeZone;
    return { ...field, timeZone: field.timeZone ?? lastGoodZone, timeZoneMissing: !field.timeZone };
  }

  function save(next) {
    setup = clean(next);
    store.set(KEY, setup);
    for (const listener of [...listeners]) listener(api);
  }

  const api = {
    get persistent() {
      return store.persistent;
    },
    /** A copy of the stored setting. */
    get: () => structuredClone(setup),
    home,
    alternates: () => setup.alternates.map(resolve),
    /** Every airfield the weather sources should fetch: home first, then the alternates. */
    stations: () => [setup.home, ...setup.alternates],
    /** The options wx's assessAlternate takes for this airfield. */
    checkOptions(icao) {
      const field = resolve(icaoOf(icao) ?? icao);
      const minima = alternateMinima(field);
      const from = home();
      return {
        minima: minima.options,
        minimaChecked: minima.checked,
        landingMinima: landingMinima(field),
        gnssApproach: field.gnssApproach,
        homeGnssApproach: from.gnssApproach,
        distanceNm: greatCircleNm(from, field),
      };
    },
    /**
     * Change the setting. `fields` merges per airfield: a key set to null clears
     * it, and an airfield set to null removes its entry.
     */
    update(patch = {}) {
      const next = { ...setup, fields: { ...setup.fields } };
      if ('home' in patch) next.home = patch.home;
      if ('alternates' in patch) next.alternates = patch.alternates;
      for (const [icao, change] of Object.entries(patch.fields ?? {})) {
        const id = icaoOf(icao);
        if (!id) continue;
        if (change === null) delete next.fields[id];
        else next.fields[id] = { ...next.fields[id], ...change };
      }
      save(next);
    },
    reset: () => save(defaults()),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return api;
}
