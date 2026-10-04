// Checks: each aircraft type's name, colour, fallback speed and circuit speeds (CT-156 break 220, downwind
//   120, threshold 100), frozen tables, unknown types fall back to CT-156, phase names matched loosely, map and
//   3D colour and model.
// Serves: TR-R16.
// Expected values: the code's own constants written out again; CT-156 speeds agree with traffic spec 3.1 (SMM
//   4.14 para 32, 4.17 para 39, 4.19 para 43, 4.1 para 1) but no page is in the file; the other types' speeds
//   have no source yet.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AIRCRAFT_TYPES,
  TYPE_COLORS,
  TYPE_FALLBACK_KT,
  SPAWN_TYPES,
  ALL_AIRCRAFT_TYPES,
  isKnownType,
  typeProfile,
  phaseSpeedFor,
} from '../../../src/modules/traffic/types.js';
import { TYPE_COLORS as MAP2D_TYPE_COLORS, aircraftColor } from '../../../src/modules/traffic/map2d.js';
import { modelKindFor, standInKindFor } from '../../../src/modules/traffic/view3d.js';

test('AIRCRAFT_TYPES contains all authentic 15 Wing fleet and requested trainers', () => {
  const expectedTypes = ['CT-156', 'CT-102B', 'CT-102', 'CT-157', 'CT-155', 'CT-114', 'CF-188'];
  for (const type of expectedTypes) {
    assert.ok(isKnownType(type), `type ${type} should be registered`);
    const profile = AIRCRAFT_TYPES[type];
    assert.ok(profile, `profile for ${type} should exist`);
    assert.equal(typeof profile.name, 'string');
    assert.equal(typeof profile.designation, 'string');
    assert.equal(typeof profile.role, 'string');
    assert.equal(typeof profile.color, 'string');
    assert.match(profile.color, /^#[0-9a-fA-F]{6}$/);
    assert.ok(profile.fallbackKt > 0);
    assert.ok(profile.speeds);
  }
});

test('CT-156 Harvard II is defined with standard SMM circuit speeds', () => {
  const ct156 = AIRCRAFT_TYPES['CT-156'];
  assert.equal(ct156.id, 'CT-156');
  assert.equal(ct156.name, 'Harvard II');
  assert.equal(ct156.designation, 'Beechcraft T-6A');
  assert.equal(ct156.color, '#7ee787');
  assert.equal(ct156.fallbackKt, 180);
  assert.deepEqual(ct156.speeds, {
    entry: 220,
    break: 220,
    pattern: 220,
    closed: 140,
    downwind: 120,
    base: 140,
    finalTurn: 120,
    approach: 120,
    threshold: 100,
    landing: 100,
  });
});

test('CT-102B Astra II is defined as elementary trainer and CT-102 is an alias pointing to the same profile', () => {
  const ct102b = AIRCRAFT_TYPES['CT-102B'];
  assert.equal(ct102b.id, 'CT-102B');
  assert.equal(ct102b.name, 'Astra II');
  assert.equal(ct102b.designation, 'Grob G 120TP');
  assert.equal(ct102b.role, 'Elementary Flight Trainer');
  assert.equal(ct102b.color, '#ffcc66');
  assert.equal(ct102b.fallbackKt, 150);
  assert.deepEqual(ct102b.speeds, {
    entry: 180,
    break: 180,
    pattern: 180,
    closed: 120,
    downwind: 120,
    base: 120,
    finalTurn: 100,
    approach: 100,
    threshold: 80,
    landing: 80,
  });

  // Alias verification: CT-102 must point to the exact same profile object
  assert.equal(AIRCRAFT_TYPES['CT-102'], ct102b, 'CT-102 must reference the same profile object');
  assert.equal(typeProfile('CT-102'), ct102b);
  assert.equal(typeProfile('CT-102B'), ct102b);
});

test('CT-157 Siskin II (Pilatus PC-21) is registered', () => {
  const ct157 = AIRCRAFT_TYPES['CT-157'];
  assert.equal(ct157.id, 'CT-157');
  assert.equal(ct157.name, 'Siskin II');
  assert.equal(ct157.designation, 'Pilatus PC-21');
  assert.equal(ct157.color, '#a5d6ff');
  assert.equal(ct157.fallbackKt, 125);
  assert.equal(ct157.speeds.break, 220);
});

test('CT-155 Hawk (BAE Hawk 115) is registered', () => {
  const ct155 = AIRCRAFT_TYPES['CT-155'];
  assert.equal(ct155.id, 'CT-155');
  assert.equal(ct155.name, 'Hawk');
  assert.equal(ct155.designation, 'BAE Hawk 115');
  assert.equal(ct155.color, '#d29922');
  assert.equal(ct155.fallbackKt, 250);
  assert.equal(ct155.speeds.break, 300);
  assert.equal(ct155.speeds.finalTurn, 150);
  assert.equal(ct155.speeds.threshold, 130);
});

test('CT-114 Tutor (Canadair CT-114) is registered', () => {
  const ct114 = AIRCRAFT_TYPES['CT-114'];
  assert.equal(ct114.id, 'CT-114');
  assert.equal(ct114.name, 'Tutor');
  assert.equal(ct114.designation, 'Canadair CT-114 Tutor');
  assert.equal(ct114.color, '#ff6b6b');
  assert.equal(ct114.fallbackKt, 230);
  assert.equal(ct114.speeds.break, 200);
  assert.equal(ct114.speeds.finalTurn, 115);
  assert.equal(ct114.speeds.threshold, 95);
});

test('CF-188 Hornet is registered', () => {
  const cf188 = AIRCRAFT_TYPES['CF-188'];
  assert.equal(cf188.id, 'CF-188');
  assert.equal(cf188.name, 'Hornet');
  assert.equal(cf188.designation, 'McDonnell Douglas CF-188');
  assert.equal(cf188.color, '#56d4dd');
  assert.equal(cf188.fallbackKt, 300);
  assert.equal(cf188.speeds.break, 350);
  assert.equal(cf188.speeds.finalTurn, 150);
  assert.equal(cf188.speeds.threshold, 135);
});

test('the spawner offers the CT-156 Harvard II only in the first version, and the other types stay defined (TR-R16)', () => {
  assert.deepEqual([...SPAWN_TYPES], ['CT-156']);
  assert.ok(['CT-102B', 'CT-157', 'CT-155', 'CT-114', 'CF-188'].every((t) => isKnownType(t)), 'the type system stays for later');
  assert.ok(Object.isFrozen(SPAWN_TYPES));
});

test('TYPE_COLORS includes all types including CT-102B and CT-102', () => {
  assert.equal(TYPE_COLORS['CT-156'], '#7ee787');
  assert.equal(TYPE_COLORS['CT-102B'], '#ffcc66');
  assert.equal(TYPE_COLORS['CT-102'], '#ffcc66');
  assert.equal(TYPE_COLORS['CT-157'], '#a5d6ff');
  assert.equal(TYPE_COLORS['CT-155'], '#d29922');
  assert.equal(TYPE_COLORS['CT-114'], '#ff6b6b');
  assert.equal(TYPE_COLORS['CF-188'], '#56d4dd');
  assert.ok(Object.isFrozen(TYPE_COLORS));
});

test('TYPE_FALLBACK_KT has speeds for all registered types', () => {
  assert.equal(TYPE_FALLBACK_KT['CT-156'], 180);
  assert.equal(TYPE_FALLBACK_KT['CT-102B'], 150);
  assert.equal(TYPE_FALLBACK_KT['CT-102'], 150);
  assert.equal(TYPE_FALLBACK_KT['CT-157'], 125);
  assert.equal(TYPE_FALLBACK_KT['CT-155'], 250);
  assert.equal(TYPE_FALLBACK_KT['CT-114'], 230);
  assert.equal(TYPE_FALLBACK_KT['CF-188'], 300);
  assert.ok(Object.isFrozen(TYPE_FALLBACK_KT));
});

test('ALL_AIRCRAFT_TYPES contains all types including CT-102B and CT-102', () => {
  for (const t of ['CT-156', 'CT-102B', 'CT-102', 'CT-157', 'CT-155', 'CT-114', 'CF-188']) {
    assert.ok(ALL_AIRCRAFT_TYPES.includes(t), `ALL_AIRCRAFT_TYPES should include ${t}`);
  }
  assert.ok(Object.isFrozen(ALL_AIRCRAFT_TYPES));
});

test('isKnownType checks correctly', () => {
  assert.equal(isKnownType('CT-156'), true);
  assert.equal(isKnownType('CT-102B'), true);
  assert.equal(isKnownType('CT-102'), true);
  assert.equal(isKnownType('CT-157'), true);
  assert.equal(isKnownType('CT-155'), true);
  assert.equal(isKnownType('CT-114'), true);
  assert.equal(isKnownType('CF-188'), true);
  assert.equal(isKnownType('UNKNOWN'), false);
  assert.equal(isKnownType(''), false);
  assert.equal(isKnownType(null), false);
  assert.equal(isKnownType(undefined), false);
});

test('typeProfile retrieves profile and falls back to CT-156', () => {
  assert.equal(typeProfile('CT-156').name, 'Harvard II');
  assert.equal(typeProfile('CT-102B').name, 'Astra II');
  assert.equal(typeProfile('CT-102').name, 'Astra II');
  assert.equal(typeProfile('UNKNOWN').name, 'Harvard II', 'unknown type should fall back to CT-156');
  assert.equal(typeProfile('').name, 'Harvard II');
});

test('phaseSpeedFor retrieves phase speed with case/format tolerance and fallback', () => {
  // CT-156
  assert.equal(phaseSpeedFor('CT-156', 'break'), 220);
  assert.equal(phaseSpeedFor('CT-156', 'finalTurn'), 120);
  assert.equal(phaseSpeedFor('CT-156', 'final-turn'), 120);
  assert.equal(phaseSpeedFor('CT-156', 'final_turn'), 120);
  assert.equal(phaseSpeedFor('CT-156', 'FINAL TURN'), 120);
  assert.equal(phaseSpeedFor('CT-156', 'unknown_phase'), 180, 'falls back to fallbackKt');

  // CT-102B and CT-102 alias
  assert.equal(phaseSpeedFor('CT-102B', 'break'), 180);
  assert.equal(phaseSpeedFor('CT-102', 'break'), 180);
  assert.equal(phaseSpeedFor('CT-102B', 'threshold'), 80);
  assert.equal(phaseSpeedFor('CT-102', 'threshold'), 80);

  // High performance types
  assert.equal(phaseSpeedFor('CT-155', 'break'), 300);
  assert.equal(phaseSpeedFor('CF-188', 'break'), 350);
});

test('types and profiles are frozen objects', () => {
  assert.ok(Object.isFrozen(AIRCRAFT_TYPES));
  for (const profile of Object.values(AIRCRAFT_TYPES)) {
    assert.ok(Object.isFrozen(profile));
    assert.ok(Object.isFrozen(profile.speeds));
  }
});

test('map2d and view3d compatibility with CT-102B and full fleet', () => {
  // map2d color resolution
  assert.equal(MAP2D_TYPE_COLORS['CT-102B'], '#ffcc66');
  assert.equal(MAP2D_TYPE_COLORS['CT-155'], '#d29922');
  assert.equal(MAP2D_TYPE_COLORS['CF-188'], '#56d4dd');
  assert.equal(aircraftColor({ type: 'CT-102B' }), '#ffcc66');
  assert.equal(aircraftColor({ type: 'CT-155' }), '#d29922');
  assert.equal(aircraftColor({ type: 'CF-188' }), '#56d4dd');

  // view3d 3D model selection
  assert.equal(modelKindFor('CT-156'), 'ct156');
  assert.equal(modelKindFor('CT-157'), 'ct156');
  assert.equal(modelKindFor('CT-102B'), 'standin');
  assert.equal(modelKindFor('CT-102'), 'standin');
  assert.equal(modelKindFor('CT-114'), 'standin');
  assert.equal(modelKindFor('CT-155'), 'standin');
  assert.equal(modelKindFor('CF-188'), 'standin');

  // view3d stand-in mesh kind
  assert.equal(standInKindFor('CT-102B'), 'generic');
  assert.equal(standInKindFor('CT-102'), 'generic');
  assert.equal(standInKindFor('CT-157'), 'generic');
});
