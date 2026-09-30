// The Turn Sim's settings: V6's defaults, what is allowed, and that nothing is blank.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  V6_DEFAULTS, DEFAULTS, SETTINGS_RULES, SETTINGS_ALLOWED, SETTINGS_VERSION, CLOCK_POSITIONS,
  aircraftKey, aircraftSettings, checkSettings, settingIsValid, migrateSettings,
} from '../../../src/modules/turn-sim/settings.js';
import { createSettings } from '../../../src/storage/settings.js';
import { v6Page } from '../../golden/v6-source.js';

test('V6_DEFAULTS are what V6 shows in its boxes (lines 527 to 600)', () => {
  const box = (id) => {
    const src = v6Page('shell');
    const at = src.indexOf(`id="${id}"`);
    assert.ok(at > 0, `no box ${id}`);
    const tag = src.slice(src.lastIndexOf('<', at), src.indexOf('>', at));
    if (tag.startsWith('<input')) return tag.match(/ value="([^"]*)"/)[1];
    // A select: the option marked selected, or the first one.
    const end = src.indexOf('</select>', at);
    const opts = src.slice(at, end).match(/<option value="([^"]*)"( selected)?/g);
    return (opts.find((o) => o.endsWith('selected')) ?? opts[0]).match(/value="([^"]*)"/)[1];
  };
  const v6 = {
    formation: box('formation'), spacingFt: +box('spacing'), boxAftFt: +box('boxAft'), boxStaggerFt: +box('boxStagger'),
    startHeadingDeg: 90 - +box('heading'), // V6's math heading 0 is compass 090, showNm: box('showNm') === 'yes',
    offsetBox4Timing: box('offsetBox4TimingMode'), rearCheckOn: box('rearCheckEnabled') === 'on',
    rearCheckStartSec: +box('rearCheckStart'), rearCheckDir: box('rearCheckDir'),
    rearCheckAngleDeg: +box('rearCheckAngle'), rearCheckHoldSec: +box('rearCheckHold'),
    maneuver: box('maneuver'), direction: box('dir'), speedKt: +box('speed'), baseG: +box('gload'), turnDeg: +box('turnDeg'),
    timing: box('triggerMode'), baseDelaySec: +box('baseDelay'), clockCueAircraft: +box('clockCueAircraft'),
    clockCuePos: box('clockCuePos'), clockCueTolDeg: +box('clockCueTol'), clockCueSequence: box('clockCueSequence'),
    durationSec: +box('duration'), moaBoundaryNm: +box('moaBoundaryNM'),
    correction: box('correction'), correctionStrength: +box('corrStrength'),
    solveFor: box('solveFor'), targetSpacingFt: +box('targetSpacing'),
  };
  for (const [key, value] of Object.entries(v6)) assert.equal(V6_DEFAULTS[key], value, key);
});

test('the rebuild\'s defaults are V6\'s except G 3.0 (D113), the offset box aft 7,000 ft (D114), the clock position Auto (SMM item 2), the start heading 000 (D45) and the timing of #4 by ground track (Q44b)', () => {
  const changed = Object.keys(V6_DEFAULTS).filter((k) => DEFAULTS[k] !== V6_DEFAULTS[k]).sort();
  assert.deepEqual(changed, ['baseG', 'boxAftFt', 'clockCuePos', 'offsetBox4Timing', 'startHeadingDeg']);
  assert.equal(V6_DEFAULTS.offsetBox4Timing, 'late');
  assert.equal(DEFAULTS.offsetBox4Timing, 'groundTrack');
  assert.deepEqual(checkSettings({ offsetBox4Timing: 'early' }).offsetBox4Timing, 'early');
  assert.equal(V6_DEFAULTS.baseG, 2.0);
  assert.equal(V6_DEFAULTS.boxAftFt, 8000);
  assert.equal(DEFAULTS.baseG, 3.0);
  assert.equal(DEFAULTS.boxAftFt, 7000);
  assert.equal(V6_DEFAULTS.clockCuePos, '5.5');
  assert.equal(DEFAULTS.clockCuePos, 'auto');
  assert.equal(V6_DEFAULTS.startHeadingDeg, 90); // east, as V6 flew
  assert.equal(DEFAULTS.startHeadingDeg, 0); // north (D45, Q42)
});

test('V6 gives every aircraft no error, the global clock cue and auto turn logic', () => {
  for (const id of [1, 2, 3, 4]) {
    assert.deepEqual(aircraftSettings(V6_DEFAULTS, id), {
      delayErrSec: 0, gError: 0, positionErrorOn: false, lateralDir: 'none', lateralFt: 0,
      foreAftDir: 'none', foreAftFt: 0, clockTarget: 'global', clockPos: 'global', turnLogic: 'auto',
    });
  }
  assert.equal(V6_DEFAULTS[aircraftKey(3, 'turnLogic')], 'auto');
});

test('every setting has a default, none is blank, and each default passes its own rule', () => {
  assert.deepEqual(Object.keys(SETTINGS_RULES).sort(), Object.keys(DEFAULTS).sort());
  // The rear-delay band is not in V6, so only DEFAULTS has it.
  assert.deepEqual(Object.keys(DEFAULTS).filter((k) => !(k in V6_DEFAULTS)).sort(), ['rearCheckAfterTurns', 'rearDelayMaxSec', 'rearDelayMinSec', 'rearDelaySec', 'twoSide']);
  for (const [key, value] of Object.entries(DEFAULTS)) {
    assert.ok(value !== undefined && value !== null && value !== '', `${key} is blank`);
    assert.ok(settingIsValid(key, value), `${key} = ${value} fails its own rule`);
    if (key in V6_DEFAULTS) assert.ok(settingIsValid(key, V6_DEFAULTS[key]), `V6's ${key} fails its own rule`);
  }
});

test('the rules say what the todo says: Speed at least 1 kt, Turn degrees 10 to 180, finite numbers only', () => {
  assert.equal(SETTINGS_RULES.speedKt.min, 1);
  assert.equal(SETTINGS_RULES.turnDeg.min, 10);
  assert.equal(SETTINGS_RULES.turnDeg.max, 180);
  for (const [key, rule] of Object.entries(SETTINGS_RULES)) {
    if (rule.type !== 'number') continue;
    for (const bad of [NaN, Infinity, -Infinity]) assert.equal(settingIsValid(key, bad), false, `${key} ${bad}`);
    assert.equal(settingIsValid(key, '5'), false, `${key} text`);
  }
});

test('bad values are refused and the default is used instead', () => {
  const clean = checkSettings({
    speedKt: 0, turnDeg: 5, spacingFt: NaN, baseG: '3', formation: 'trail', direction: 'up', showNm: 'yes',
    clockCuePos: '5.7', clockCueAircraft: 9, 'aircraft2.turnLogic': 'sideways', 'aircraft3.gError': Infinity, extra: 1,
  });
  assert.equal(clean.speedKt, DEFAULTS.speedKt);
  assert.equal(clean.turnDeg, DEFAULTS.turnDeg);
  assert.equal(clean.spacingFt, DEFAULTS.spacingFt);
  assert.equal(clean.baseG, DEFAULTS.baseG);
  assert.equal(clean.formation, DEFAULTS.formation);
  assert.equal(clean.direction, DEFAULTS.direction);
  assert.equal(clean.showNm, DEFAULTS.showNm);
  assert.equal(clean.clockCuePos, DEFAULTS.clockCuePos);
  assert.equal(clean.clockCueAircraft, DEFAULTS.clockCueAircraft);
  assert.equal(clean['aircraft2.turnLogic'], DEFAULTS['aircraft2.turnLogic']);
  assert.equal(clean['aircraft3.gError'], DEFAULTS['aircraft3.gError']);
  assert.equal('extra' in clean, false);
});

test('good values are kept, and anything at all gives a full settings object', () => {
  const clean = checkSettings({ speedKt: 1, turnDeg: 180, formation: 'twoShip', clockCuePos: '12', 'aircraft4.foreAftDir': 'aft', 'aircraft4.foreAftFt': 500 });
  assert.equal(clean.speedKt, 1);
  assert.equal(clean.turnDeg, 180);
  assert.equal(clean.formation, 'twoShip');
  assert.equal(clean.clockCuePos, '12');
  assert.equal(clean['aircraft4.foreAftFt'], 500);
  for (const junk of [null, undefined, 5, 'text', [], () => 1]) assert.deepEqual({ ...checkSettings(junk) }, { ...DEFAULTS });
  assert.ok(Object.isFrozen(checkSettings({})));
});

test('a delay band with its minimum above its maximum goes back to the default band', () => {
  const clean = checkSettings({ rearDelayMinSec: 20, rearDelayMaxSec: 12 });
  assert.deepEqual([clean.rearDelayMinSec, clean.rearDelayMaxSec], [10, 15]);
  const ok = checkSettings({ rearDelayMinSec: 8, rearDelayMaxSec: 12 });
  assert.deepEqual([ok.rearDelayMinSec, ok.rearDelayMaxSec], [8, 12]);
});

test("the clock positions are V6's 24 half-hour steps", () => {
  assert.equal(CLOCK_POSITIONS.length, 24);
  assert.equal(CLOCK_POSITIONS[0], 12);
  assert.equal(CLOCK_POSITIONS[11], 5.5);
  assert.equal(CLOCK_POSITIONS[23], 11.5);
});

test('storage/settings.js accepts the defaults, the allowed lists and the version', () => {
  const store = { get: (_doc, fallback) => fallback, set() {} };
  const settings = createSettings(store, DEFAULTS, { version: SETTINGS_VERSION, allowed: SETTINGS_ALLOWED });
  assert.deepEqual({ ...settings.get() }, { ...DEFAULTS });
  settings.update({ maneuver: 'hook90', speedKt: 250, direction: 'diagonal' });
  assert.equal(settings.get().maneuver, 'hook90');
  assert.equal(settings.get().speedKt, 250);
  assert.equal(settings.get().direction, 'right'); // not in the allowed list
});

test('the clock position is text, "auto" is allowed, and version 1 numbers are migrated and kept', () => {
  assert.equal(SETTINGS_VERSION, 2);
  assert.equal(settingIsValid('clockCuePos', 'auto'), true);
  assert.equal(settingIsValid('clockCuePos', '7'), true);
  assert.equal(settingIsValid('clockCuePos', 7), false);
  assert.equal(settingIsValid('clockCuePos', '5.7'), false);
  assert.equal(settingIsValid('aircraft2.clockPos', 'auto'), true);
  assert.equal(migrateSettings({ clockCuePos: 5.5, speedKt: 250 }, 1).clockCuePos, '5.5');
  assert.equal(migrateSettings({ clockCuePos: 5.5, speedKt: 250 }, 1).speedKt, 250);
  assert.equal(checkSettings({ clockCuePos: 7 }).clockCuePos, '7'); // an old profile keeps its choice
  const store = { get: () => ({ version: 1, values: { clockCuePos: 4.5, baseG: 4 } }), set() {} };
  const settings = createSettings(store, DEFAULTS, { version: SETTINGS_VERSION, allowed: SETTINGS_ALLOWED, migrate: migrateSettings });
  assert.equal(settings.get().clockCuePos, '4.5');
  assert.equal(settings.get().baseG, 4);
});

test('migrating version 1 turns the start heading from V6\'s math heading to a compass heading', () => {
  const heading = (v) => migrateSettings({ startHeadingDeg: v }, 1).startHeadingDeg;
  assert.equal(heading(0), 90); // east
  assert.equal(heading(90), 0); // north
  assert.equal(heading(180), 270); // west
  assert.equal(heading(270), 180); // south
  assert.equal(heading(-90), 180);
  assert.equal(heading(360), 90);
  assert.equal(heading(100), 350);
  assert.equal(migrateSettings({ startHeadingDeg: 0 }, 2).startHeadingDeg, 0); // version 2 is already compass
  assert.equal(migrateSettings({ speedKt: 250 }, 1).startHeadingDeg, undefined);
});
