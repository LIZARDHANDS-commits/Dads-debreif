// Runs V6's own Traffic Pattern Sim code in Node, unchanged, so golden tests can
// put it side by side with src/modules/traffic (R9, SPEC-traffic "Testing strategy").
//
// V6's Traffic page is one big script that reads its settings from the page's
// boxes and rolls its dice with Math.random. Here the functions are cut out of
// the decoded page text (by tests/golden/v6-source.js) and run in a scope that
// holds a stand-in page: `$(id)` hands back plain objects built from a settings
// object, drawing is a no-op, and Math.random is a seeded generator passed in.
//
// V6 draws with screen y pointing down (south). The rebuild's routes have y
// pointing north, so everything crossing this file goes through `toV6Route`
// and `fromV6Point`, which flip y and nothing else.
import assert from 'node:assert/strict';
import { v6Page } from './v6-source.js';

/** Line numbers in comments refer to the decoded traffic.html (SPEC-traffic). */
const V6_FUNCTIONS = [
  'pt', 'add', 'sub', 'mul', 'dist', 'norm', 'lerp', 'speedFps', 'bankFromG', 'turnRadiusFromG',
  'pointTurnRadius', 'vFromHdg', 'perp', 'newId', 'esc', 'routeById', 'defaultPattern',
  'defaultEntry', 'defaultSplit', 'rawSegs', 'bez', 'roundedPoints', 'navSegs', 'routeLen',
  'pointProg', 'posOnRoute', 'closestProg', 'nextCallsign', 'makeAircraft', 'spawnLive', 'reset',
  'currentAcRoute', 'acPos', 'acProfile', 'handleRouteEnd', 'crossedProg', 'checkDecisions',
  'resetAircraftToStarts', 'rebuildPositionsAtTime', 'step', 'conflicts', 'updatePanels',
];

/**
 * Text of `function name(...) {...}` in V6's Traffic page. v6-source's
 * v6FunctionText looks for the first `{` after the name, which is inside
 * `o={}` for makeAircraft and spawnLive, so the parameter list is skipped first.
 */
function functionText(name) {
  const src = v6Page('traffic');
  const at = src.indexOf('function ' + name + '(');
  if (at < 0) throw new Error(`function not found in traffic page: ${name}`);
  let parens = 0;
  let k = src.indexOf('(', at);
  for (; k < src.length; k++) {
    if (src[k] === '(') parens++;
    else if (src[k] === ')' && --parens === 0) break;
  }
  let braces = 0;
  for (k = src.indexOf('{', k); k < src.length; k++) {
    if (src[k] === '{') braces++;
    else if (src[k] === '}' && --braces === 0) return src.slice(at, k + 1);
  }
  throw new Error(`unbalanced braces in ${name}`);
}

/** V6's `const types=...;` and `const palette=...;` lines (139 and 140), as source text. */
function constText(name) {
  const m = v6Page('traffic').match(new RegExp(`const ${name}=[^;]*;`));
  if (!m) throw new Error(`const not found in traffic page: ${name}`);
  return m[0];
}

/** V6's built-in profile (`EMBEDDED_DEFAULT_PROFILE`, line 613), read as V6 has it: y pointing south. */
export function v6DefaultProfile() {
  const m = v6Page('traffic').match(/const EMBEDDED_DEFAULT_PROFILE = (\{.*\});\n/);
  if (!m) throw new Error('EMBEDDED_DEFAULT_PROFILE not found in traffic page');
  return JSON.parse(m[1]);
}

/** V6's four aircraft types with their colours, as V6 has them (line 139). */
export const V6_TYPES = new Function(`${constText('types')}\nreturn types;`)();

/** The route colours V6 hands out (line 140). */
export const V6_PALETTE = new Function(`${constText('palette')}\nreturn palette;`)();

/** V6's settings the Traffic functions read from the page, as plain values (SPEC-traffic "Route options", "Conflict limits"). */
export const V6_SETTINGS = Object.freeze({
  flyRoundedTurns: true,
  turnRadiusFromG: true,
  manualTurnRadius: '1800',
  latSep: '200',
  vertSep: '200',
  cautionLatSep: '500',
  cautionVertSep: '500',
  simSpeed: '1',
});

/** A route point as V6 has it (y south, speed as `spd`) from the rebuild's (y north, `kt`). */
function toV6Point(p) {
  return { x: p.x, y: -p.y, alt: p.alt, spd: p.kt, label: p.label, g: p.g };
}

/** A route point of the rebuild (y north, `kt`) from V6's (y south, `spd`), plus what V6 added (`src`, `seg`, `u`). */
export function fromV6Point(p) {
  const out = { x: p.x, y: -p.y, alt: p.alt, kt: p.spd, g: p.g };
  if (p.label !== undefined) out.label = p.label;
  if (p.src !== undefined) out.src = p.src;
  if (p.seg !== undefined) out.seg = p.seg;
  if (p.u !== undefined) out.u = p.u;
  return out;
}

/**
 * A route of the rebuild as a V6 route object: y flipped, `spd` for `kt`, and the
 * fields V6 keeps on every route (`closed`, the odds, the links), whatever its kind.
 */
export function toV6Route(route) {
  return {
    id: route.id, name: route.name, kind: route.kind, closed: route.kind === 'pattern',
    visible: route.visible !== false, color: route.color,
    attachTo: route.attachTo ?? '', mergeIndex: route.mergeIndex ?? 0,
    sourceRoute: route.sourceRoute ?? '', sourceIndex: route.sourceIndex ?? 0,
    splitOdds: route.splitOdds ?? 0.5, landOdds: route.landOdds ?? 0,
    points: route.points.map(toV6Point),
  };
}

/** The other way: V6's route as the rebuild keeps it (kind decides closed; only the fields its kind uses). */
export function fromV6Route(r) {
  const out = { id: r.id, name: r.name, kind: r.kind, visible: r.visible, color: r.color, points: r.points.map(fromV6Point) };
  if (r.kind === 'pattern') out.landOdds = r.landOdds;
  if (r.kind !== 'pattern') Object.assign(out, { attachTo: r.attachTo, mergeIndex: r.mergeIndex });
  if (r.kind === 'split') Object.assign(out, { sourceRoute: r.sourceRoute, sourceIndex: r.sourceIndex, splitOdds: r.splitOdds });
  return out;
}

/** A setup aircraft of the rebuild as V6 has it in a profile (line 613): the fields V6 keeps on every aircraft. */
export function toV6Aircraft(a) {
  return {
    id: a.id, type: a.type, routeId: a.routeId, baseRouteId: a.routeId, phaseRouteId: a.routeId,
    start: a.startIndex, delay: a.startsAtSec, active: true, prog: 0, trail: [],
    color: V6_TYPES[a.type]?.color || '#fff', speed: V6_TYPES[a.type]?.spd || 120, alt: 2500,
    useProfile: true, lastPatternSeg: -1, landCheckedLap: -1, splitTaken: {}, landed: false,
  };
}

/**
 * V6's Traffic page in a scope of its own.
 *
 * `settings` is a plain object of what V6 reads from the page's boxes (V6_SETTINGS
 * has the names); change a value at any time and V6 sees it, as it would a box.
 * `random` replaces Math.random. `routes` and `aircraft` are V6 route and aircraft
 * objects. The returned `v6` has V6's functions by name, `state` (its globals),
 * `elements` (what updatePanels wrote) and `frame()`, one screen frame of 50 ms.
 *
 * Two things are left out of V6's frame so an hour of sim time takes seconds:
 * - V6 redraws its tables every frame, even paused (#49). `updatePanels` is V6's own
 *   function and is there to call, but a frame doesn't call it unless `panelsEachFrame`.
 * - V6 rebuilds every rounded route several times per aircraft per frame (#49). With
 *   `cacheRoutes`, the four functions that only rebuild it (roundedPoints, navSegs,
 *   routeLen and pointProg, which answer the same for the same route) remember their
 *   answers; V6's own code still runs inside them, once. Routes must not change while
 *   the cache is on, or `v6.clearCache()` has to be called after the change.
 */
export function loadV6Traffic({ settings = { ...V6_SETTINGS }, random = () => 0.5, routes = [], aircraft = [], cacheRoutes = false, panelsEachFrame = false } = {}) {
  const elements = new Map();
  const $ = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        id, textContent: '', innerHTML: '',
        get checked() { return !!settings[id]; },
        get value() { return settings[id] === undefined ? '' : String(settings[id]); },
      });
    }
    return elements.get(id);
  };
  const prelude = `
    ${constText('types')}
    ${constText('palette')}
    let routes = __in.routes, aircraft = __in.aircraft, t = 0, playing = false, reversePlay = false, last = 0;
    const $ = __in.$;
    const Math = Object.create(globalThis.Math); Math.random = __in.random;
    function draw() {}
    function refreshAll() {}
    function requestAnimationFrame() {}
    const state = {
      get routes() { return routes; }, set routes(v) { routes = v; },
      get aircraft() { return aircraft; }, set aircraft(v) { aircraft = v; },
      get t() { return t; }, set t(v) { t = v; },
      get playing() { return playing; }, set playing(v) { playing = v; },
    };`;
  // These keep V6's text under a new name, and a wrapper takes the old one.
  const cached = cacheRoutes ? ['roundedPoints', 'navSegs', 'routeLen', 'pointProg'] : [];
  const wrapped = new Set([...cached, 'updatePanels']);
  const body = V6_FUNCTIONS.map((name) => {
    const text = functionText(name);
    return wrapped.has(name) ? text.replace('function ' + name + '(', 'function ' + name + 'V6(') : text;
  }).join('\n');
  const wrappers = cached.map((name) => `
    const __${name} = new Map();
    function ${name}(route, index) {
      const key = ${name === 'pointProg' ? 'index' : '0'}; // pointProg also takes a point number
      let known = __${name}.get(route);
      if (!known) __${name}.set(route, known = new Map());
      if (!known.has(key)) known.set(key, ${name}V6(route, index));
      return known.get(key);
    }`).join('\n');
  const exposed = [...V6_FUNCTIONS.filter((name) => name !== 'updatePanels'), 'updatePanels: updatePanelsV6'].join(', ');
  const v6 = new Function('__in', `${prelude}
    ${body}
    ${wrappers}
    function updatePanels() { if (__in.panelsEachFrame) updatePanelsV6(); }
    state.clearCache = () => { ${cached.map((name) => `__${name}.clear();`).join(' ')} };
    return { ${exposed}, state };`)({ routes, aircraft, $, random, panelsEachFrame });
  v6.clearCache = v6.state.clearCache;
  v6.elements = elements;
  v6.settings = settings;
  let ts = 1000; // V6's step reads its first timestamp as "last", so this frame moves nothing
  v6.frame = () => { v6.step(ts); ts += 50; };
  return v6;
}

/** V6's airfield (`CYMJ`, line 155): where x = 0, y = 0 is. */
export function v6Anchor() {
  const m = v6Page('traffic').match(/const CYMJ=\{lat:(-?[0-9.]+),lon:(-?[0-9.]+)\}/);
  if (!m) throw new Error('CYMJ not found in traffic page');
  return { lat: Number(m[1]), lon: Number(m[2]) };
}

/**
 * V6's built-in profile as the rebuild's setup (src/modules/traffic/data/moose-jaw.json):
 * y flipped to north, `spd` called `kt`, start times rounded to whole seconds (V6 has
 * 12.000000000000005), colours left to the aircraft type, the 3D camera numbers and the
 * satellite tile zoom dropped (the rebuild has drag, wheel and a zoom that follows the map),
 * and the note about the Split Probability Manager dropped (the rebuild has no such panel).
 */
export function v6ProfileToSetup(p) {
  const s = p.settings;
  const zero = (n) => 0 - Number(n); // north-up from south-down, and never -0
  return {
    version: 1,
    name: 'Moose Jaw Dynamic',
    anchor: v6Anchor(),
    routes: p.routes.map(fromV6Route),
    aircraft: p.aircraft.map((a) => ({ id: a.id, type: a.type, routeId: a.baseRouteId, startIndex: a.start, startsAtSec: Math.round(a.delay) })),
    routeOptions: { flyRoundedTurns: s.flyRoundedTurns, radiusFromG: s.turnRadiusFromG, manualRadiusFt: Number(s.manualTurnRadius) },
    conflictLimits: { latFt: Number(s.latSep), vertFt: Number(s.vertSep), cautionLatFt: Number(s.cautionLatSep), cautionVertFt: Number(s.cautionVertSep) },
    view: {
      playbackSpeed: Number(s.simSpeed), zoom: Number(s.zoom), center: { x: p.viewCenter.x, y: zero(p.viewCenter.y) },
      showTrails: s.showTrails, showLabels: s.showAlt, showRoutePoints: s.showPoints, showLegDistances: s.showDistances,
      showTurnData: s.showTurnData, showBubbles: s.showSafetyBubbles, showCautionRings: s.showCautionBubbles,
      photo: { show: s.showSatellite, aboveGrid: s.satAboveGrid, opacity: Number(s.satOpacity), trim: Number(s.satScale), offsetEastFt: Number(s.satOffsetX), offsetNorthFt: zero(s.satOffsetY) },
    },
    notes: '',
  };
}

/**
 * Asserts two values are the same, numbers within `tol` (1e-9 ft, the golden
 * tests' limit), NaN with NaN, and objects and arrays with the same keys.
 */
export function assertClose(actual, expected, where = 'value', tol = 1e-9) {
  if (typeof expected === 'number' && typeof actual === 'number') {
    if (Number.isNaN(expected)) return assert.ok(Number.isNaN(actual), `${where}: ${actual}, V6 has NaN`);
    if (actual === expected) return undefined; // also equal infinities
    return assert.ok(Math.abs(actual - expected) <= tol, `${where}: ${actual} vs V6 ${expected} (off by ${Math.abs(actual - expected)})`);
  }
  if (expected === null || typeof expected !== 'object') return assert.equal(actual, expected, where);
  assert.ok(actual !== null && typeof actual === 'object', `${where}: ${actual} is not an object`);
  assert.equal(Array.isArray(actual), Array.isArray(expected), `${where}: array or not`);
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), `${where}: keys`);
  for (const key of Object.keys(expected)) assertClose(actual[key], expected[key], `${where}.${key}`, tol);
  return undefined;
}
