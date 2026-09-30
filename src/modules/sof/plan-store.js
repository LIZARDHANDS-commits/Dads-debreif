// The SOF's daily wave plan and where it is kept (SPEC-sof, "Waves and the alternate
// call", SOF-6). The plan is up to 5 waves as home local clock times, plus Today or
// Tomorrow. It holds no date, so it never goes stale: waves.js works out the date from
// the home zone's calendar every time it is used. The one thing that could go stale is
// "Tomorrow" (it means one date when chosen and another the next day), so it remembers
// the day it was chosen and reads as Today from the next day on.
//
// Pure reducers (plain data in, plain data out) and a small store around them. What is
// read back from storage is checked: anything wrong is dropped, never guessed.
import { MAX_WAVES, parseClock } from './waves.js';
import { ackDay } from './cautions.js';

/** Where the plan is kept, in the module's storage scope. */
export const PLAN_KEY = 'plan';
const VERSION = 1;
const MAX_NAME = 12;
const ID = /^w\d{1,4}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A plan with no waves, for Today. */
export const emptyPlan = () => ({ version: VERSION, day: 'today', dayChosen: null, waves: [] });

// Control characters and the bidirectional overrides and isolates go: a name is drawn as plain text and must not
// be able to reverse or reorder the text around it.
const cleanName = (v) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f\u202A-\u202E\u2066-\u2069]/g, '').trim().slice(0, MAX_NAME) : '');
const cleanClock = (v) => (parseClock(v) == null ? '' : v);

function nextId(waves) {
  const used = new Set(waves.map((w) => w.id));
  for (let n = 1; ; n++) if (!used.has(`w${n}`)) return `w${n}`;
}

/**
 * A stored plan checked: wrong version or shape is an empty plan; at most 5 waves; a name
 * is plain text of 12 characters at most; a time that isn't "HH:MM" is not set; every wave
 * has its own id.
 */
export function cleanPlan(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== VERSION) return emptyPlan();
  const waves = [];
  for (const w of (Array.isArray(raw.waves) ? raw.waves : []).slice(0, MAX_WAVES)) {
    if (!w || typeof w !== 'object') continue;
    const id = typeof w.id === 'string' && ID.test(w.id) && !waves.some((o) => o.id === w.id) ? w.id : nextId(waves);
    waves.push({ id, name: cleanName(w.name), takeoff: cleanClock(w.takeoff), land: cleanClock(w.land) });
  }
  return {
    version: VERSION,
    day: raw.day === 'tomorrow' ? 'tomorrow' : 'today',
    dayChosen: typeof raw.dayChosen === 'string' && DAY.test(raw.dayChosen) ? raw.dayChosen : null,
    waves,
  };
}

/** The plan as it is to be used now: a Tomorrow chosen on an earlier day reads as Today.
 * @param {any} plan
 * @param {{ now?: Date, timeZone?: string }} [context]
 */
export function resolvePlan(plan, { now, timeZone } = {}) {
  if (plan.day !== 'tomorrow') return plan;
  const today = ackDay(now, timeZone);
  return today !== null && plan.dayChosen === today ? plan : { ...plan, day: 'today' };
}

/** A plan with one more empty wave; the same plan when there are already 5. */
export function addWave(plan) {
  if (plan.waves.length >= MAX_WAVES) return plan;
  return { ...plan, waves: [...plan.waves, { id: nextId(plan.waves), name: '', takeoff: '', land: '' }] };
}

/** A plan with wave `id` changed: `patch` may hold `name`, `takeoff` and `land`, each checked. */
export function editWave(plan, id, patch = {}) {
  if (!plan.waves.some((w) => w.id === id)) return plan;
  return {
    ...plan,
    waves: plan.waves.map((w) => {
      if (w.id !== id) return w;
      return {
        ...w,
        ...('name' in patch ? { name: cleanName(patch.name) } : {}),
        ...('takeoff' in patch ? { takeoff: cleanClock(patch.takeoff) } : {}),
        ...('land' in patch ? { land: cleanClock(patch.land) } : {}),
      };
    }),
  };
}

/** A plan without wave `id`. */
export function removeWave(plan, id) {
  return { ...plan, waves: plan.waves.filter((w) => w.id !== id) };
}

/** A plan for Today or Tomorrow (anything else is Today). Tomorrow remembers the day it was chosen.
 * @param {any} plan
 * @param {string} day
 * @param {{ now?: Date, timeZone?: string }} [context]
 */
export function setDay(plan, day, { now, timeZone } = {}) {
  return day === 'tomorrow'
    ? { ...plan, day: 'tomorrow', dayChosen: ackDay(now, timeZone) }
    : { ...plan, day: 'today', dayChosen: null };
}

/**
 * The plan on a storage scope. `context()` gives `{ now, timeZone }` (home's), read when needed.
 * Returns { get, add, edit, remove, setDay, subscribe }; get() is the plan as it is to be used now.
 */
export function createPlanStore({ store, context }) {
  let plan = cleanPlan(store.get(PLAN_KEY, null)); // checked on read
  const listeners = new Set();
  const change = (next) => {
    if (next === plan) return;
    plan = next;
    store.set(PLAN_KEY, plan);
    for (const fn of [...listeners]) fn();
  };
  return {
    get: () => resolvePlan(plan, context()),
    add: () => change(addWave(plan)),
    edit: (id, patch) => change(editWave(plan, id, patch)),
    remove: (id) => change(removeWave(plan, id)),
    setDay: (day) => change(setDay(plan, day, context())),
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
