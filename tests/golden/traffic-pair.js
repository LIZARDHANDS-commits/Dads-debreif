// Helpers for the Traffic sim's golden tests: a rebuilt sim (src/modules/traffic/sim.js)
// and V6's own Traffic page (traffic-v6.js) loaded with the same setup and the same
// dice, flown side by side and compared after every step.
//
// V6 at 1x and 20 frames a second moves 0.05 s of sim time a frame, which is one
// fixed step of the rebuild, so the two runs should be the same, step for step.
// V6's y points south, the rebuild's north: V6 gets the routes with y flipped and
// the answers are flipped back before they are compared.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSim, STEP_SEC } from '../../src/modules/traffic/sim.js';
import { createDice } from '../../src/modules/traffic/dice.js';
import { loadV6Traffic, toV6Route, toV6Aircraft, V6_SETTINGS } from './traffic-v6.js';

export const MOOSE_JAW = JSON.parse(readFileSync(new URL('../../src/modules/traffic/data/moose-jaw.json', import.meta.url), 'utf8'));
export const STEPS_PER_SEC = Math.round(1 / STEP_SEC);
export const HOUR_STEPS = 3600 * STEPS_PER_SEC;

/** Sim time is compared to this many feet. */
const TOLERANCE_FT = 1e-9;

export const clone = (value) => JSON.parse(JSON.stringify(value));

/** The built-in setup, with the aircraft's start times as moose-jaw.json has them. */
export const builtIn = () => clone(MOOSE_JAW);

/** V6's page settings for a setup's route options and conflict limits. */
export function v6SettingsFor(setup) {
  const { routeOptions: o, conflictLimits: l } = setup;
  return {
    ...V6_SETTINGS, flyRoundedTurns: o.flyRoundedTurns, turnRadiusFromG: o.radiusFromG, manualTurnRadius: String(o.manualRadiusFt),
    latSep: String(l.latFt), vertSep: String(l.vertFt), cautionLatSep: String(l.cautionLatFt), cautionVertSep: String(l.cautionVertFt),
  };
}

/**
 * A rebuilt sim and V6's page loaded with the same setup and the same dice.
 * V6 runs with cacheRoutes (see traffic-v6.js) so an hour takes seconds.
 */
export function startPair(setup, { seed, cacheRoutes = true } = {}) {
  const dice = createDice(seed);
  const v6 = loadV6Traffic({
    settings: v6SettingsFor(setup), random: () => dice(), cacheRoutes,
    routes: setup.routes.map(toV6Route), aircraft: setup.aircraft.map(toV6Aircraft),
  });
  v6.reset();
  v6.state.playing = true;
  v6.frame(); // V6's first frame only notes the time, and moves nothing
  return { mine: createSim(setup, { seed }), v6, dice, step: 0 };
}

/** Spawns the same aircraft in both: the rebuild counts the start point from 1, V6 from 0. */
export function spawnBoth({ mine, v6 }, { type, routeId, start = 0, delay = 0 }) {
  const id = mine.spawn({ type, routeId, startPoint: start + 1, delaySec: delay });
  const a = v6.spawnLive({ type, routeId, start, delayFromNow: delay });
  assert.equal(id, a.id, 'the same callsign');
  return id;
}

/** V6's status words for an aircraft, as the rebuild names them. */
const v6Status = (a, t) => (a.active ? (t < a.delay ? 'waiting' : 'flying') : (a.landed ? 'landed' : 'done'));

const near = (a, b) => a === b || Math.abs(a - b) <= TOLERANCE_FT;

/** Fails with the step and the aircraft if the rebuild and V6 differ anywhere. */
export function checkSame({ mine, v6, dice }, step) {
  const state = mine.state();
  const t = v6.state.t;
  const at = `step ${step} (t=${t})`;
  if (state.t !== t) assert.fail(`${at}: clock ${state.t} vs V6 ${t}`);
  const v6Aircraft = v6.state.aircraft;
  if (state.aircraft.length !== v6Aircraft.length) assert.fail(`${at}: ${state.aircraft.length} aircraft vs V6 ${v6Aircraft.length}`);
  for (let i = 0; i < v6Aircraft.length; i++) {
    const a = v6Aircraft[i], s = state.aircraft[i];
    const p = v6.acPos(a), pr = v6.acProfile(a);
    const who = `${at}, ${a.id}`;
    if (s.id !== a.id || s.type !== a.type) assert.fail(`${who}: id or type ${s.id} ${s.type}`);
    if (s.routeId !== a.phaseRouteId) assert.fail(`${who}: route ${s.routeId} vs V6 ${a.phaseRouteId}`);
    if (s.status !== v6Status(a, t)) assert.fail(`${who}: status ${s.status} vs V6 ${v6Status(a, t)}`);
    if (!near(s.distFt, a.prog)) assert.fail(`${who}: distance ${s.distFt} vs V6 ${a.prog}`);
    if (!near(s.x, p.x) || !near(s.y, -p.y)) assert.fail(`${who}: at ${s.x}, ${s.y} vs V6 ${p.x}, ${-p.y}`);
    if (!near(s.alt, pr.alt) || !near(s.kt, pr.speed)) assert.fail(`${who}: ${s.alt} ft ${s.kt} kt vs V6 ${pr.alt} ft ${pr.speed} kt`);
    if (s.leg !== p.seg + 1) assert.fail(`${who}: leg ${s.leg} vs V6 ${p.seg + 1}`);
    if (s.startsAt !== a.delay) assert.fail(`${who}: starts at ${s.startsAt} vs V6 ${a.delay}`);
  }
  const v6Conflicts = v6.conflicts();
  if (state.conflicts.length !== v6Conflicts.length) assert.fail(`${at}: ${state.conflicts.length} conflicts vs V6 ${v6Conflicts.length}`);
  v6Conflicts.forEach((c, i) => {
    const m = state.conflicts[i];
    if (m.a !== c.a || m.b !== c.b || m.level !== c.level || !near(m.latFt, c.ld) || !near(m.vertFt, c.vd)) {
      assert.fail(`${at}: conflict ${JSON.stringify(m)} vs V6 ${JSON.stringify(c)}`);
    }
  });
  if (mine.diceState() !== dice.getState()) assert.fail(`${at}: the dice are in different places (a choice was made or missed)`);
}

/**
 * Flies both `steps` more steps of 0.05 s, comparing after each. `events` is
 * `{ step: (pair) => {…} }`, run before that step is flown (steps count from the
 * start of the run). `compareEvery` compares only every that many steps (default every
 * step; a test of something else than the flying can ask for once a second).
 * Returns what happened, to show the run really went somewhere.
 */
export function flyBoth(pair, steps, events = {}, { compareEvery = 1 } = {}) {
  const seen = { conflict: 0, caution: 0, landed: 0, done: 0, routes: new Set(), maxFlying: 0 };
  for (let i = 0; i < steps; i++) {
    const k = ++pair.step;
    events[k]?.(pair);
    pair.v6.frame();
    pair.mine.stepTo(k * STEP_SEC);
    if (k % compareEvery === 0) checkSame(pair, k);
    if (k % STEPS_PER_SEC === 0) { // once a second is plenty for the tally
      const st = pair.mine.state();
      seen.conflict += st.conflicts.filter((c) => c.level === 'conflict').length;
      seen.caution += st.conflicts.filter((c) => c.level === 'caution').length;
      st.aircraft.forEach((a) => seen.routes.add(a.routeId));
      seen.landed = st.aircraft.filter((a) => a.status === 'landed').length;
      seen.done = st.aircraft.filter((a) => a.status === 'done').length;
      seen.maxFlying = Math.max(seen.maxFlying, st.aircraft.filter((a) => a.status === 'flying').length);
    }
  }
  return seen;
}

/**
 * A spawned-traffic grid, spawned at `firstStep`: on every route, from several start
 * points (the first, the middle, and one past the last), every type, several delays.
 */
export function gridEvents(setup, { firstStep = 1, starts = (count) => [0, Math.floor(count / 2), count + 5] } = {}) {
  const delays = [0, 15, 30, 0.5, 7.25, 60];
  const types = ['CT-157', 'CT-156', 'CT-102', 'CT-114'];
  const spawns = [];
  let n = 0;
  for (const route of setup.routes) {
    for (const start of starts(route.points.length)) {
      spawns.push({ type: types[n % 4], routeId: route.id, start, delay: delays[n % delays.length] });
      n++;
    }
  }
  return { [firstStep]: (pair) => spawns.forEach((spawn) => spawnBoth(pair, spawn)) };
}
