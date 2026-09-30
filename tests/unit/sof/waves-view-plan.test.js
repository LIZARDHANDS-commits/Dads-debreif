// Tests for src/modules/sof/plan-store.js: the daily wave plan and where it is kept
// (SPEC-sof, "Waves and the alternate call", SOF-6): checked on read, survives a
// reload, and never carries an old date.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../src/storage/store.js';
import { MAX_WAVES } from '../../../src/modules/sof/waves.js';
import {
  PLAN_KEY, emptyPlan, cleanPlan, resolvePlan, addWave, editWave, removeWave, setDay, createPlanStore,
} from '../../../src/modules/sof/plan-store.js';

const ZONE = 'America/Regina';
const NOW = new Date('2026-09-29T18:42:00Z'); // 12:42 on the 29th at Moose Jaw
const NEXT_DAY = new Date('2026-09-30T18:42:00Z');
const ctx = { now: NOW, timeZone: ZONE };
const wave = (id, over = {}) => ({ id, name: '', takeoff: '08:00', land: '09:30', ...over });
const stored = (over) => ({ version: 1, day: 'today', dayChosen: null, waves: [wave('w1')], ...over });

// ---- Checked on read -----------------------------------------------------------------------

test('what is stored is checked: the wrong version or shape is an empty plan', () => {
  assert.deepEqual(cleanPlan(null), emptyPlan());
  assert.deepEqual(cleanPlan('nonsense'), emptyPlan());
  assert.deepEqual(cleanPlan([]), emptyPlan());
  assert.deepEqual(cleanPlan(stored({ version: 2 })), emptyPlan());
  assert.deepEqual(cleanPlan({ version: 1, waves: 'no' }).waves, []);
});

test('at most 5 waves are read, and every wave has its own id', () => {
  const many = { ...stored(), waves: Array.from({ length: 9 }, () => wave('w1')) };
  const plan = cleanPlan(many);
  assert.equal(plan.waves.length, MAX_WAVES);
  assert.equal(new Set(plan.waves.map((w) => w.id)).size, MAX_WAVES, 'repeated or missing ids are given new ones');
  assert.ok(plan.waves.every((w) => /^w\d+$/.test(w.id)));
});

test('a time that is not HH:MM is not set, and a name is plain text of 12 characters at most', () => {
  const plan = cleanPlan(stored({ waves: [{ id: 'w1', name: `  <b>${'x'.repeat(30)}\u0007`, takeoff: '8:00', land: '24:00' }, { id: 'w2', name: 7, takeoff: '23:59', land: '00:00' }, null, 'x'] }));
  assert.equal(plan.waves.length, 2, 'entries that are not waves are dropped');
  assert.equal(plan.waves[0].takeoff, '');
  assert.equal(plan.waves[0].land, '');
  assert.equal(plan.waves[0].name.length, 12);
  assert.ok(!/[\u0000-\u001f]/.test(plan.waves[0].name));
  assert.equal(plan.waves[1].name, '');
  assert.equal(plan.waves[1].takeoff, '23:59');
  assert.equal(plan.waves[1].land, '00:00', 'an evening wave landing after midnight is kept');
});

test('the day is Today unless it says tomorrow, and a remembered day must look like a date', () => {
  assert.equal(cleanPlan(stored({ day: 'yesterday' })).day, 'today');
  assert.equal(cleanPlan(stored({ day: 'tomorrow', dayChosen: '2026-09-29' })).dayChosen, '2026-09-29');
  assert.equal(cleanPlan(stored({ day: 'tomorrow', dayChosen: 'today-ish' })).dayChosen, null);
});

// ---- No old date is ever used ---------------------------------------------------------------------

test('Tomorrow, chosen today, is Tomorrow today, and is Today from the next day on', () => {
  const plan = setDay(emptyPlan(), 'tomorrow', ctx);
  assert.equal(plan.dayChosen, '2026-09-29', 'the home zone\'s date, not this machine\'s');
  assert.equal(resolvePlan(plan, ctx).day, 'tomorrow');
  assert.equal(resolvePlan(plan, { now: NEXT_DAY, timeZone: ZONE }).day, 'today', 'what was tomorrow is today now');
  assert.equal(resolvePlan(plan, { now: new Date('2026-10-05T18:00:00Z'), timeZone: ZONE }).day, 'today');
});

test('the date of "today" is the home zone\'s, so the switch happens at home midnight, not UTC midnight', () => {
  const plan = setDay(emptyPlan(), 'tomorrow', ctx);
  // 05:59Z on the 30th is 23:59 on the 29th at Moose Jaw: still the same home day.
  assert.equal(resolvePlan(plan, { now: new Date('2026-09-30T05:59:00Z'), timeZone: ZONE }).day, 'tomorrow');
  assert.equal(resolvePlan(plan, { now: new Date('2026-09-30T06:00:00Z'), timeZone: ZONE }).day, 'today');
});

test('Tomorrow with no remembered day, or with an unreadable zone, is Today: nothing is guessed', () => {
  assert.equal(resolvePlan({ ...emptyPlan(), day: 'tomorrow' }, ctx).day, 'today');
  const plan = { ...emptyPlan(), day: 'tomorrow', dayChosen: '2026-09-29' };
  assert.equal(resolvePlan(plan, { now: NOW, timeZone: 'Not/AZone' }).day, 'today');
});

test('the plan holds no date of its own besides the remembered day', () => {
  const plan = addWave(editWave(addWave(emptyPlan()), 'w1', { takeoff: '08:00', land: '09:30' }));
  assert.ok(!JSON.stringify(plan).match(/20\d\d/), JSON.stringify(plan));
});

// ---- Add, edit, remove -------------------------------------------------------------------------------

test('adding waves stops at 5, and each new wave has a new id and no times', () => {
  let plan = emptyPlan();
  for (let i = 0; i < 8; i++) plan = addWave(plan);
  assert.equal(plan.waves.length, 5);
  assert.deepEqual(plan.waves.map((w) => w.id), ['w1', 'w2', 'w3', 'w4', 'w5']);
  assert.deepEqual(plan.waves[0], { id: 'w1', name: '', takeoff: '', land: '' });
  assert.equal(addWave(plan), plan, 'the same plan when full');
});

test('a removed wave\'s id is not reused while the others stand, and removing keeps the rest in order', () => {
  let plan = emptyPlan();
  for (let i = 0; i < 3; i++) plan = addWave(plan);
  plan = removeWave(plan, 'w2');
  assert.deepEqual(plan.waves.map((w) => w.id), ['w1', 'w3']);
  plan = addWave(plan);
  assert.deepEqual(plan.waves.map((w) => w.id), ['w1', 'w3', 'w2'], 'the free id is taken again');
  assert.equal(removeWave(plan, 'nope').waves.length, 3);
});

test('editing changes only the fields given, each checked', () => {
  let plan = addWave(emptyPlan());
  plan = editWave(plan, 'w1', { takeoff: '08:00' });
  plan = editWave(plan, 'w1', { land: '09:30', name: ' Early ' });
  assert.deepEqual(plan.waves[0], { id: 'w1', name: 'Early', takeoff: '08:00', land: '09:30' });
  plan = editWave(plan, 'w1', { takeoff: 'garbage', colour: 'red' });
  assert.equal(plan.waves[0].takeoff, '', 'a bad time is not set');
  assert.ok(!('colour' in plan.waves[0]));
  assert.equal(editWave(plan, 'w9', { name: 'x' }), plan, 'an unknown wave changes nothing');
});

test('reducers do not change the plan they are given', () => {
  const plan = Object.freeze({ ...emptyPlan(), waves: Object.freeze([Object.freeze(wave('w1'))]) });
  assert.doesNotThrow(() => { addWave(plan); editWave(plan, 'w1', { name: 'a' }); removeWave(plan, 'w1'); setDay(plan, 'tomorrow', ctx); });
});

// ---- The store ----------------------------------------------------------------------------------------------

const scope = (backing) => createStore(backing).scope('sof');

test('the plan survives a reload: a new store on the same storage reads it back', () => {
  const backing = new Map();
  const memory = { getItem: (k) => backing.get(k) ?? null, setItem: (k, v) => backing.set(k, v), removeItem: (k) => backing.delete(k) };
  const first = createPlanStore({ store: scope(memory), context: () => ctx });
  first.add();
  first.edit('w1', { name: 'Early', takeoff: '08:00', land: '09:30' });
  first.add();
  first.edit('w2', { takeoff: '22:30', land: '00:30' });
  first.setDay('tomorrow');
  const second = createPlanStore({ store: scope(memory), context: () => ctx });
  assert.deepEqual(second.get().waves, first.get().waves);
  assert.equal(second.get().day, 'tomorrow');
  assert.equal(second.get().waves[1].land, '00:30');
});

test('a plan stored by something else is checked when it is read', () => {
  const store = scope(null);
  store.set(PLAN_KEY, { version: 1, day: 'tomorrow', dayChosen: '2026-09-29', waves: [{ id: 'w1', name: 5, takeoff: 'x', land: '10:00' }, ...Array(10).fill(wave('w1'))] });
  const plan = createPlanStore({ store, context: () => ctx }).get();
  assert.equal(plan.waves.length, 5);
  assert.equal(plan.waves[0].takeoff, '');
  assert.equal(plan.waves[0].name, '');
});

test('a Tomorrow kept overnight reads as Today the next morning', () => {
  const store = scope(null);
  createPlanStore({ store, context: () => ctx }).setDay('tomorrow');
  const morning = createPlanStore({ store, context: () => ({ now: NEXT_DAY, timeZone: ZONE }) });
  assert.equal(morning.get().day, 'today');
});

test('listeners are told of a change and can stop listening; an unchanged plan tells nobody', () => {
  const store = createPlanStore({ store: scope(null), context: () => ctx });
  let told = 0;
  const stop = store.subscribe(() => { told += 1; });
  store.add();
  store.edit('w1', { name: 'A' });
  assert.equal(told, 2);
  store.edit('nope', { name: 'B' });
  assert.equal(told, 2, 'an unknown wave changes nothing');
  stop();
  store.add();
  assert.equal(told, 2);
});

test('bidirectional overrides and isolates are stripped from a name, so it cannot reverse the text around it', () => {
  const tricky = '\u202Eabc\u202A\u202B\u202C\u202D\u2066\u2067\u2068\u2069def';
  const read = cleanPlan(stored({ waves: [{ id: 'w1', name: tricky, takeoff: '08:00', land: '09:30' }] }));
  assert.equal(read.waves[0].name, 'abcdef');
  const edited = editWave(stored({ waves: [wave('w1')] }), 'w1', { name: tricky });
  assert.equal(edited.waves[0].name, 'abcdef');
  assert.equal(cleanPlan(stored({ waves: [{ id: 'w1', name: 'Early', takeoff: '', land: '' }] })).waves[0].name, 'Early', 'ordinary names are unchanged');
});
