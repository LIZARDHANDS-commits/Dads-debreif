// Which airspace the SOF's 3D view draws, from the choices in its Airspace tab (Dad, 8 Oct 2026: "I should also be able to hide certain airspace if needed in
// a tab somewhere"; SOF plan "3D mouse controls and an airspace filter"; SOF-47; shared with the Debrief's Layers since 10 Oct 2026, DB-24). Pure: entries and choices go in, plain data comes out; the SOF's view3d.js draws the tab.
//
// The choices are kept per base in the SOF's "view3d" settings document (settings-model.js `airspaceHidden3d`): { KDLF: { kinds: ['moa'], ids: ['R-6312'] } }, a
// kind by its key below and an airspace by its id. Hiding only changes the picture: the airspace log and the watched areas read the base's airspace themselves
// (map.js), never this filter's output, and `drawnAirspace` never changes the list it is given.
import { limitWords, heightsNotGiven } from './model.js';

/**
 * The kinds the tab offers a switch for, in its order, each in plain words. They are finer than model.js's kinds, which keep the drawing colours: a
 * terminal entry is sorted by its class letter and name (Class B, Class C, or a transition area or control area extension), and every control zone (Canadian
 * zones of any class and US Class D) goes together. Only the kinds the square holds get a switch.
 */
export const FILTER_KINDS = Object.freeze([
  Object.freeze({ key: 'class-b', words: 'Class B and terminal control areas' }),
  Object.freeze({ key: 'class-c', words: 'Class C' }),
  Object.freeze({ key: 'class-d', words: 'Class D and control zones' }),
  Object.freeze({ key: 'transition', words: 'Transition areas and control area extensions' }),
  Object.freeze({ key: 'mtca', words: 'MTCAs' }),
  Object.freeze({ key: 'restricted', words: 'Restricted and danger areas' }),
  Object.freeze({ key: 'moa', words: 'MOAs' }),
  Object.freeze({ key: 'warning', words: 'Warning areas' }),
  Object.freeze({ key: 'alert', words: 'Alert areas' }),
  Object.freeze({ key: 'advisory', words: 'Advisory areas' }),
  Object.freeze({ key: 'mtr', words: 'Military training routes' }),
  Object.freeze({ key: 'other', words: 'Other airspace' }),
]);
const KIND_KEYS = Object.freeze(FILTER_KINDS.map((k) => k.key));
const WORDS = new Map(FILTER_KINDS.map((k) => [k.key, k.words]));

/** A kind key in words: 'moa' reads "MOAs". */
export const kindWords = (key) => WORDS.get(key) ?? 'Other airspace';

/** The tab's kind for an entry (model.js entry shape). */
export function filterKindOf(entry) {
  const kind = entry?.kind;
  if (kind === 'terminal') {
    if (/transition|extension/i.test(entry.name ?? '') || entry.classLetter === 'E') return 'transition';
    return entry.classLetter === 'C' ? 'class-c' : 'class-b';
  }
  if (kind === 'control-zone') return 'class-d';
  return KIND_KEYS.includes(kind) ? kind : 'other';
}

/** An entry's own id: a training route cut at the square's edge keeps its id with " (part 2)" and so on (the SOF's airspace-square.js `airspaceInSquare`), and is hidden with it. */
export const baseId = (id) => String(id ?? '').replace(/ \(part \d+\)$/, '');

/** No airspace hidden. */
export const NOTHING_HIDDEN = Object.freeze({ kinds: Object.freeze([]), ids: Object.freeze([]) });

/** Whether an entry is hidden by `hidden` ({ kinds, ids }): its kind is hidden, or its own id is. */
export function isHidden(entry, hidden = NOTHING_HIDDEN) {
  return (hidden.kinds ?? []).includes(filterKindOf(entry)) || (hidden.ids ?? []).includes(baseId(entry?.id));
}

/** The entries to draw: `list` less the hidden ones, as a new list (the one given is never changed: the airspace log reads it whole). */
export const drawnAirspace = (list, hidden = NOTHING_HIDDEN) => (Array.isArray(list) ? list : []).filter((entry) => !isHidden(entry, hidden));

/** How many airspaces of each kind `list` holds (a route's parts count once), for the kinds it has: [{ key, words, count }] in the tab's order. */
export function kindCounts(list) {
  const seen = new Map(); // kind -> Set of ids
  for (const entry of Array.isArray(list) ? list : []) {
    const key = filterKindOf(entry);
    if (!seen.has(key)) seen.set(key, new Set());
    seen.get(key).add(baseId(entry?.id));
  }
  return FILTER_KINDS.filter((k) => seen.has(k.key)).map((k) => ({ key: k.key, words: k.words, count: seen.get(k.key).size }));
}

/** An entry's limits in words: "SFC–FL180", "at 1,500 ft AGL", or "altitudes not given". */
function limitsWords(entry) {
  try {
    if (heightsNotGiven(entry)) return 'altitudes not given';
    const [floor, ceiling] = [limitWords(entry.floor), limitWords(entry.ceiling)];
    return floor === ceiling ? `at ${floor}` : `${floor}–${ceiling}`;
  } catch {
    return 'limits not readable';
  }
}

/**
 * The tab's list: one row per airspace in `list` (a route's parts are one row), sorted by kind in the tab's order and then by id: [{ id, name (null when it is the
 * id), kind, kindWords, limits, search (lower-case words the search box matches) }].
 */
export function airspaceRows(list) {
  const rows = new Map();
  for (const entry of Array.isArray(list) ? list : []) {
    const id = baseId(entry?.id);
    if (!id || rows.has(id)) continue;
    const kind = filterKindOf(entry);
    const name = typeof entry.name === 'string' && entry.name.trim() && entry.name !== id ? entry.name : null;
    rows.set(id, { id, name, kind, kindWords: kindWords(kind), limits: limitsWords(entry), search: `${id} ${name ?? ''} ${kindWords(kind)}`.toLowerCase() });
  }
  const order = (k) => KIND_KEYS.indexOf(k);
  return [...rows.values()].sort((a, b) => order(a.kind) - order(b.kind) || a.id.localeCompare(b.id));
}

/** The rows a search shows: every row whose id, name or kind holds each word typed (any case). */
export function searchRows(rows, text) {
  const words = String(text ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  return words.length ? rows.filter((r) => words.every((w) => r.search.includes(w))) : rows;
}

// ---- The stored choices -----------------------------------------------------------------------------------------------

const ICAO_RE = /^[A-Z][A-Z0-9]{3}$/;
/** At most this many bases keep choices, and this many ids each (estimates: there are nine bases, and Laughlin's 900 NM file has under 800 entries). */
const MAX_BASES = 40;
const MAX_IDS = 3000;
const MAX_ID_CHARS = 80;

/** One base's choices checked: kinds the tab offers and ids that are short text, each once, in a frozen { kinds, ids }. */
function cleanOne(value) {
  const kinds = Array.isArray(value?.kinds) ? [...new Set(value.kinds.filter((k) => KIND_KEYS.includes(k)))] : [];
  const ids = Array.isArray(value?.ids) ? [...new Set(value.ids.filter((id) => typeof id === 'string' && id.trim() !== '' && id.length <= MAX_ID_CHARS))].slice(0, MAX_IDS) : [];
  return Object.freeze({ kinds: Object.freeze(kinds), ids: Object.freeze(ids) });
}

/** The stored choices checked, as read from the settings document: { ICAO: { kinds, ids } } for real-looking ICAOs with something hidden; anything else is dropped. */
export function cleanAirspaceHidden(value) {
  const out = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return Object.freeze(out);
  for (const [icao, choice] of Object.entries(value)) {
    if (Object.keys(out).length >= MAX_BASES) break;
    if (!ICAO_RE.test(icao)) continue;
    const one = cleanOne(choice);
    if (one.kinds.length || one.ids.length) out[icao] = one;
  }
  return Object.freeze(out);
}

/** A base's choices from the stored ones: { kinds, ids }, nothing hidden for a base with none (or no ICAO). */
export function hiddenFor(choices, icao) {
  const own = typeof icao === 'string' && choices && typeof choices === 'object' ? choices[icao] : null;
  return own ? cleanOne(own) : NOTHING_HIDDEN;
}

/** The stored choices with one base's replaced by `next` ({ kinds, ids }); the other bases are left as they are, and a base with nothing hidden is left out. */
export function withHidden(choices, icao, next) {
  const out = { ...cleanAirspaceHidden(choices) };
  if (typeof icao !== 'string' || !ICAO_RE.test(icao)) return Object.freeze(out);
  const one = cleanOne(next);
  if (one.kinds.length || one.ids.length) out[icao] = one;
  else delete out[icao];
  return cleanAirspaceHidden(out);
}
