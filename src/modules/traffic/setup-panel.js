// The top of the left "Setup" column (Patrick, 4 Oct 11:05Z): the ready-made scenarios in one "Scenario" drop-down
// showing the one loaded (Patrick, 4 Oct: it replaced six buttons and the "Scenarios and notes" section), and the wind
// as a dial (click or drag round for the direction it blows from) with a bar under it for the strength.
//
// A scenario is only a list of aircraft starts on the setup's own routes ({ id, type, routeId, startIndex,
// startsAtSec, and for a PFL from the training area its area }, the same shape a saved profile keeps). So it
// replays, rewinds and resets like any run, and it never changes the routes, the wind or a setting. "Random"
// puts five aircraft on route points picked by seeded dice, spread apart, so the same seed gives the same
// picture. "Busy circuit", the one the tool opens with (Patrick, 18:47Z), adds a PFL and a timed conflict.
//
// The dial and the bar write the windFromDeg and windKt settings, the same ones the engine reads, so the
// aircraft already flying respond at once (TR-R5). Nothing here flies or changes a number of the flight.
import { h } from '../../ui-kit/dom.js';
import { windTriangle } from '../../core/wind.js';
import { FT_PER_NM } from '../../core/units.js';
import { createDice } from './dice.js';
import { LIMITS, RUNWAYS, DEFAULT_RUNWAY } from './defaults.js';

/** How many aircraft Random puts up (Patrick, 11:05Z). */
export const RANDOM_COUNT = 5;
/** How many aircraft Busy circuit puts up, all told (Patrick, 18:36Z). */
export const BUSY_COUNT = 10;
/**
 * Busy circuit's PFL: engine failed in the training area, 6 NM out on the 120° radial at 8,000 ft, which glides
 * to High Key inside its 5,000-6,000 ft window (measured in calm air and 15 to 25 kt from 260, 4 Oct). An estimate.
 */
export const BUSY_PFL_AREA = Object.freeze({ radialDeg: 120, distNm: 6, altFt: 8000 });
/**
 * When Busy circuit's straight-in leaves the Final point of Entry 2, s: in the default wind (260° at 15 kt) it then
 * meets the aircraft starting at Pattern 1's Final Entry in its final turn (measured, 4 Oct). In any other wind the
 * screen works it out again (scenario-timing.js).
 */
export const BUSY_STRAIGHT_IN_SEC = 30;
/** Random keeps its aircraft at least this far apart, so none starts inside another's conflict ring (estimate). */
export const RANDOM_SPACING_FT = FT_PER_NM;
/** While dragging, the dial moves in tens of degrees, the steps a METAR gives a wind in; the arrow keys with Shift give single degrees. */
export const DIAL_STEP_DEG = 10;

const at = (routeId, startPoint, startsAtSec = 0) => ({ routeId, startIndex: startPoint - 1, startsAtSec });

/**
 * The ready-made scenarios, in the order of their buttons. `starts` uses the built-in Moose Jaw routes
 * (Pattern 1 PAT1, Entry 1 ENT1, Entry 2 ENT2) with start points counted from 1, as on screen.
 * 'moose-jaw' is the built-in setup's own aircraft, and 'random' is made by randomStarts.
 */
export const SCENARIOS = Object.freeze([
  { id: 'busy', label: 'Busy circuit', about: 'Ten aircraft: seven at random points of the overhead break, a PFL gliding in from the area to High Key, and a straight-in timed to meet an aircraft in its final turn.' },
  { id: 'moose-jaw', label: 'Moose Jaw day', about: 'The seven aircraft the tool opens with, joining over 15 minutes.' },
  { id: 'one', label: 'One aircraft', about: 'One aircraft on the overhead break from the runway: watch one circuit, or press PFL.', starts: [at('PAT1', 1)] },
  { id: 'circuit', label: 'Full circuit', about: 'Four aircraft round the overhead break at once: departure end, crosswind, initial and short final.', starts: [at('PAT1', 2), at('PAT1', 5), at('PAT1', 9), at('PAT1', 13)] },
  { id: 'joining', label: 'Joining traffic', about: 'Two in the circuit and three joining on the OHB Rejoin and the SI Rejoin close together.', starts: [at('PAT1', 5), at('PAT1', 9), at('ENT1', 1), at('ENT2', 1, 30), at('ENT1', 1, 90)] }, // join times: a teaching picture (estimate)
  { id: 'random', label: 'Random', about: 'Five aircraft at random points on the routes.' },
]);

/** The scenarios that make a new picture each time they load; the drop-down gives them a "New picture" button. */
export const RESHUFFLED = Object.freeze(['busy', 'random']);

/**
 * Five starts at random points of the routes (patterns and entries, not splits), at least RANDOM_SPACING_FT
 * apart over the ground; an entry's last point is left out, as it is a point of the pattern it joins.
 * If the routes are too small for that, the spacing halves until five fit. Same seed, same starts.
 * @param {Array<any>} routes @param {number} seed
 */
export function randomStarts(routes, seed, count = RANDOM_COUNT, { only = null, avoid = [] } = {}) {
  const dice = createDice(seed);
  const spots = [];
  for (const r of routes ?? []) {
    if (!r || r.kind === 'split' || !Array.isArray(r.points)) continue;
    if (only && r.id !== only) continue;
    const last = r.kind === 'entry' ? r.points.length - 1 : r.points.length;
    for (let i = 0; i < last; i++) spots.push({ routeId: r.id, startIndex: i, x: r.points[i].x, y: r.points[i].y });
  }
  for (let i = spots.length - 1; i > 0; i--) { // Fisher-Yates with the seeded dice
    const j = Math.floor(dice() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  let picked = [];
  for (let spacing = RANDOM_SPACING_FT; spacing >= 1; spacing /= 2) {
    picked = [];
    for (const s of spots) {
      if (picked.length >= count) break;
      if ([...avoid, ...picked].every((p) => Math.hypot(p.x - s.x, p.y - s.y) >= spacing)) picked.push(s);
    }
    if (picked.length >= Math.min(count, spots.length)) break;
  }
  return picked.map(({ routeId, startIndex }) => ({ routeId, startIndex, startsAtSec: 0 }));
}

/**
 * The aircraft for a scenario, ready for setup.aircraft: callsigns A1, A2, … and type `type`.
 * Starts on a route the setup doesn't have are left out. `builtIn` is the built-in setup's aircraft list.
 * @param {string} id @param {{ routes: Array<any>, builtIn?: Array<any>, seed?: number, type?: string }} from
 */
export function scenarioAircraft(id, { routes, builtIn = [], seed = 1, type = 'CT-156' }) {
  const have = new Set((routes ?? []).map((r) => r.id));
  if (id === 'moose-jaw') return builtIn.filter((a) => have.has(a.routeId)).map((a) => ({ ...a }));
  const scenario = SCENARIOS.find((s) => s.id === id);
  if (!scenario) throw new RangeError(`unknown scenario ${id}`);
  const starts = id === 'random' ? randomStarts(routes, seed) : id === 'busy' ? busyStarts(routes, seed) : scenario.starts.filter((s) => have.has(s.routeId));
  return starts.map((s, i) => {
    const area = /** @type {{ area?: { radialDeg: number, distNm: number, altFt: number } }} */ (s).area;
    return { id: `A${i + 1}`, type, routeId: s.routeId, startIndex: s.startIndex, startsAtSec: s.startsAtSec, ...(area ? { area: { ...area } } : {}) };
  });
}

/**
 * Busy circuit (Patrick, 4 Oct 18:36Z): the aircraft at Pattern 1's Final Entry, the straight-in on Entry 2 timed
 * to meet it in its final turn, the PFL from the area, and the rest at random points of Pattern 1, at least
 * RANDOM_SPACING_FT from each other and from the first two. Without Pattern 1 and Entry 2 it is only random starts.
 * @param {Array<any>} routes @param {number} seed
 */
export function busyStarts(routes, seed) {
  const pat = (routes ?? []).find((r) => r?.id === 'PAT1');
  const ent = (routes ?? []).find((r) => r?.id === 'ENT2');
  if (!pat || !ent || pat.points.length < 9 || ent.points.length < 4) return randomStarts(routes, seed, BUSY_COUNT);
  const overhead = { routeId: 'PAT1', startIndex: 8, startsAtSec: 0 }; // Final Entry
  const straightIn = { routeId: 'ENT2', startIndex: 3, startsAtSec: BUSY_STRAIGHT_IN_SEC }; // Final
  const pfl = { routeId: 'PAT1', startIndex: 0, startsAtSec: 0, area: BUSY_PFL_AREA };
  const avoid = [pat.points[8], ent.points[3]];
  const rest = randomStarts(routes, seed, BUSY_COUNT - 3, { only: 'PAT1', avoid }).filter((s) => s.startIndex !== 8);
  return [overhead, straightIn, pfl, ...rest];
}

/** 0-359 compass degrees from a point on the dial (dx right, dy down from its centre), as 1-360 in DIAL_STEP_DEG steps. */
export function dialBearing(dx, dy, step = DIAL_STEP_DEG) {
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  const stepped = Math.round((((deg % 360) + 360) % 360) / step) * step;
  return stepped % 360 === 0 ? 360 : stepped;
}

/** The wind along and across the active runway, in a pilot's words ("29L: 14 kt head, 9 kt cross from the left"). */
export function runwayWindText(windFromDeg, windKt, runwayId = DEFAULT_RUNWAY) {
  const runway = RUNWAYS.find((r) => r.id === runwayId) ?? RUNWAYS[0];
  if (!(windKt > 0)) return `${runway.id}: calm`;
  const { headwindKt, crosswindKt } = windTriangle(runway.headingDeg, 1, windFromDeg, windKt);
  const head = Math.round(Math.abs(headwindKt));
  const cross = Math.round(Math.abs(crosswindKt));
  const along = head === 0 ? 'no head or tail' : `${head} kt ${headwindKt >= 0 ? 'head' : 'tail'}`;
  const side = cross === 0 ? 'no cross' : `${cross} kt cross from the ${crosswindKt > 0 ? 'right' : 'left'}`;
  return `${runway.id}: ${along}, ${side}`;
}

const DIAL_PX = 132;

/**
 * controls: the module's createControls (the strength bar is its slider). settings: { get, update, subscribe }.
 * onScenario(id): a scenario was chosen in the drop-down, or New picture was pressed (the same id again).
 * @param {{ controls: any, settings: any, onScenario?: (id: string) => void }} options
 */
export function createSetupPanel({ controls, settings, onScenario }) {
  // Scenario: one drop-down showing the scenario loaded, a line under it saying what it is, and New picture for the
  // two that come out different each time (choosing the same item again in a drop-down does nothing).
  const pickId = `traffic-scenario-${Math.random().toString(36).slice(2, 8)}`;
  const none = h('option', { value: '', disabled: true, hidden: true }, 'Choose a scenario');
  const pick = h('select', { id: pickId, class: 'setup-scenario-pick', onchange: () => { if (pick.value) onScenario?.(pick.value); } },
    none, SCENARIOS.map((s) => h('option', { value: s.id }, s.label)));
  const about = h('p', { class: 'setup-scenario-about' });
  const again = h('button', { type: 'button', class: 'button setup-scenario-again', hidden: true, onclick: () => { if (pick.value) onScenario?.(pick.value); } }, 'New picture');
  const row = h('div', { class: 'setup-scenario' },
    h('div', { class: 'setup-scenario-row' }, h('label', { for: pickId }, 'Scenario:'), pick, again),
    about);
  const showScenario = (id) => {
    const scenario = SCENARIOS.find((s) => s.id === id);
    pick.value = scenario ? scenario.id : '';
    about.textContent = scenario ? scenario.about : '';
    about.hidden = !scenario;
    again.hidden = !RESHUFFLED.includes(scenario?.id);
  };
  showScenario(null);

  // The wind dial: a compass card with the runway on it and an arrow from where the wind blows.
  const canvas = h('canvas', { class: 'setup-wind-dial', width: DIAL_PX, height: DIAL_PX, 'aria-hidden': 'true' });
  const dial = h('div', {
    class: 'setup-wind-dial-wrap',
    role: 'slider',
    tabIndex: 0,
    'aria-label': 'Wind direction',
    'aria-valuemin': LIMITS.windFromDeg[0],
    'aria-valuemax': LIMITS.windFromDeg[1],
  }, canvas);
  const components = h('p', { class: 'setup-wind-components', 'aria-live': 'polite' });
  const strength = controls.slider('windKt', { label: 'Wind strength', min: LIMITS.windKt[0], max: LIMITS.windKt[1], step: 1, format: (v) => (Number(v) > 0 ? `${v} kt` : 'Calm') });

  const setFrom = (deg) => {
    const d = ((Math.round(deg) % 360) + 360) % 360;
    settings.update({ windFromDeg: d === 0 ? 360 : d });
  };
  const fromPointer = (e) => {
    const box = canvas.getBoundingClientRect?.();
    if (!box || !box.width) return;
    setFrom(dialBearing(e.clientX - (box.left + box.width / 2), e.clientY - (box.top + box.height / 2)));
  };
  let dragging = false;
  dial.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    dragging = true;
    dial.setPointerCapture?.(e.pointerId);
    fromPointer(e);
  });
  dial.addEventListener('pointermove', (e) => { if (dragging) fromPointer(e); });
  const stop = () => { dragging = false; };
  dial.addEventListener('pointerup', stop);
  dial.addEventListener('pointercancel', stop);
  dial.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 1 : DIAL_STEP_DEG;
    const now = settings.get().windFromDeg;
    const to = { ArrowRight: now + step, ArrowUp: now + step, ArrowLeft: now - step, ArrowDown: now - step, PageUp: now + 30, PageDown: now - 30, Home: 360 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    setFrom(to);
  });

  const wind = h('div', { class: 'setup-wind', role: 'group', 'aria-label': 'Wind' },
    h('p', { class: 'traffic-subtitle' }, 'Wind'),
    h('div', { class: 'setup-wind-row' }, dial, h('div', { class: 'setup-wind-side' }, strength, components)),
  );
  const element = h('div', { class: 'setup-panel' }, row, wind);

  function token(name, fallback) {
    try {
      const v = getComputedStyle(canvas).getPropertyValue(name).trim();
      return v || fallback;
    } catch { return fallback; }
  }

  function draw(values) {
    const ctx = canvas.getContext?.('2d');
    if (!ctx) return;
    const ratio = Math.max(1, Math.min(3, globalThis.devicePixelRatio || 1));
    if (canvas.width !== DIAL_PX * ratio) { canvas.width = DIAL_PX * ratio; canvas.height = DIAL_PX * ratio; }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, DIAL_PX, DIAL_PX);
    const c = DIAL_PX / 2, r = c - 14;
    const text = token('--text', '#e5edf5'), muted = token('--text-muted', '#8aa0b4'), accent = token('--accent', '#38bdf8'), card = token('--bg-sunken', '#0b1620');
    const polar = (deg, radius) => [c + radius * Math.sin((deg * Math.PI) / 180), c - radius * Math.cos((deg * Math.PI) / 180)];
    ctx.fillStyle = card;
    ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = muted; ctx.lineWidth = 1; ctx.stroke();
    for (let d = 0; d < 360; d += 10) { // ticks every 10°, longer every 30°
      const [x1, y1] = polar(d, r); const [x2, y2] = polar(d, r - (d % 30 ? 4 : 8));
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    ctx.fillStyle = text; ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [d, w] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']]) { const [x, y] = polar(d, r + 8); ctx.fillText(w, x, y); }
    // The active runway through the middle, numbered at each end.
    const runway = RUNWAYS.find((x) => x.id === (values.runway ?? DEFAULT_RUNWAY)) ?? RUNWAYS[0];
    const [ax, ay] = polar(runway.headingDeg, r * 0.55); const [bx, by] = polar(runway.headingDeg + 180, r * 0.55);
    ctx.strokeStyle = muted; ctx.lineWidth = 6; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    // The wind: an arrow from the rim, at the bearing it blows from, toward the middle.
    const calm = !(values.windKt > 0);
    const from = values.windFromDeg;
    const [tx, ty] = polar(from, r - 2); const [hx, hy] = polar(from, r * 0.25);
    ctx.strokeStyle = calm ? muted : accent; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.globalAlpha = calm ? 0.6 : 1;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
    const [l1x, l1y] = polar(from - 14, r * 0.42); const [l2x, l2y] = polar(from + 14, r * 0.42);
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(l1x, l1y); ctx.lineTo(l2x, l2y); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = text; ctx.font = '700 13px ui-monospace, monospace';
    const [rx, ry] = polar(from + 180, r * 0.6); // the readout sits opposite the arrow, clear of it
    ctx.fillText(`${String(from).padStart(3, '0')}°T`, rx, ry);
  }

  function show(values) {
    const from = values.windFromDeg, kt = values.windKt;
    dial.setAttribute('aria-valuenow', String(from));
    dial.setAttribute('aria-valuetext', kt > 0 ? `from ${from}° true` : `calm, set to ${from}° true`);
    const words = runwayWindText(from, kt, values.runway);
    if (components.textContent !== words) components.textContent = words;
    draw(values);
  }
  show(settings.get());
  const stopSettings = settings.subscribe(show);

  return {
    element,
    /** Shows the scenario loaded in the drop-down, or none ("Choose a scenario"). */
    setActive(id) {
      showScenario(id);
    },
    dispose() { stopSettings?.(); },
  };
}
