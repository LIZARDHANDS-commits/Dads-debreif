// The Traffic Sim's starting values, pinned row by row to the Defaults table in
// specs/SPEC-traffic.md ("Every setting starts filled in"), and its number-box limits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, LIMITS, SPEEDS } from '../../../src/modules/traffic/defaults.js';
import { createSettings } from '../../../src/storage/settings.js';

// Checks a group of settings against the values the table gives for them.
const row = (expected) => {
  for (const [key, value] of Object.entries(expected)) assert.equal(DEFAULTS[key], value, key);
};

test('the defaults are one frozen object of plain values', () => {
  assert.ok(Object.isFrozen(DEFAULTS));
  for (const [key, value] of Object.entries(DEFAULTS)) {
    assert.ok(['string', 'number', 'boolean'].includes(typeof value), `${key} is a plain value`);
    if (typeof value === 'number') assert.ok(Number.isFinite(value), `${key} is finite`);
  }
});

test('the shared settings store accepts the defaults and every key can be changed to a value of its own type', () => {
  const kept = new Map();
  const store = { get: (k, fallback) => (kept.has(k) ? kept.get(k) : fallback), set: (k, v) => kept.set(k, v) };
  const settings = createSettings(store, DEFAULTS);
  assert.deepEqual({ ...settings.get() }, { ...DEFAULTS });
  for (const [key, value] of Object.entries(DEFAULTS)) {
    const other = typeof value === 'number' ? value + 1 : typeof value === 'boolean' ? !value : `${value}x`;
    settings.update({ [key]: other });
    assert.equal(settings.get()[key], other, key);
  }
});

test('row: playback speed starts at 8×, one of the speeds on offer (0.25× to 8×)', () => {
  row({ speed: 8 });
  assert.deepEqual([...SPEEDS], [0.25, 0.5, 1, 2, 4, 8]);
  assert.ok(SPEEDS.includes(DEFAULTS.speed));
});

test('row: 2D or 3D starts in 2D, with the 3D camera at Fit', () => {
  row({ view: '2d', camera3d: 'fit' });
});

test('row: wind starts calm, 360°T at 0 kt', () => {
  row({ windFromDeg: 360, windKt: 0 });
});

test('row: layers, trails, labels, route points, bubbles, caution rings and the photo on; leg distances, turn data and Engine-out reach off', () => {
  row({
    layerTrails: true,
    layerLabels: true,
    layerPoints: true,
    layerBubbles: true,
    layerCautionRings: true,
    layerPhoto: true,
    layerLegDistances: false,
    layerTurnData: false,
    layerEngineReach: false,
  });
});

test('row: photo starts at 100 % opacity, above the grid, at the setup\'s own alignment (1.2 trim, no offset)', () => {
  row({ photoOpacityPct: 100, photoAboveGrid: true, photoTrim: 1.2, photoEastFt: 0, photoNorthFt: 0 });
});

test('row: route options start with rounded turns on, radius from speed and G on, manual radius 1,800 ft', () => {
  row({ flyRoundedTurns: true, radiusFromG: true, manualRadiusFt: 1800 });
});

test('row: a new pattern is left-hand with Land 20 % and Stay 80 %, and the runway box starts at 29', () => {
  row({ newPatternHand: 'left', newPatternLandPct: 20, newPatternStayPct: 80, newPatternRunway: 29 });
  assert.equal(DEFAULTS.newPatternLandPct + DEFAULTS.newPatternStayPct, 100);
});

test('row: a new entry or split joins the selected pattern', () => {
  row({ newEntrySplitJoins: 'selected-pattern' });
});

test('row: a new PFL is at the landing threshold on the pattern\'s side; High Key 5,000 ft MSL at Moose Jaw, 3,000 ft above the field elsewhere', () => {
  row({ pflAt: 'landing-threshold', pflOrbitSide: 'pattern-side', pflHighKeyMooseJawFtMsl: 5000, pflHighKeyElsewhereAboveFieldFt: 3000 });
});

test('row: a new point goes halfway, with the average height and G, the selected point\'s phase, labelled "New point"', () => {
  row({ newPointPlace: 'halfway', newPointAltAndG: 'average', newPointPhase: 'selected-point', newPointLabel: 'New point' });
});

test('row: a new split\'s share is half of Stay\'s', () => {
  row({ newSplitShare: 'half-of-stay' });
});

test('row: there is no break until a point is marked Break, and its slow-down ends abeam the threshold', () => {
  row({ breakPoint: 'none', breakSlowDownEnds: 'abeam-threshold' });
});

test('row: the spawner starts at CT-156, the first entry, point 1, delay 0 s, plan Random', () => {
  row({ spawnType: 'CT-156', spawnRoute: 'first-entry', spawnStartPoint: 1, spawnDelayS: 0, spawnPlan: 'random' });
});

test('row: + Pair is 15 s apart on the same route', () => {
  row({ pairGapS: 15, pairRoute: 'same' });
});

test('row: a new plan is named "Plan 1" and lands when it runs out', () => {
  row({ newPlanName: 'Plan 1', planWhenOut: 'land' });
});

test('row: an engine out has the prop feathered and stays clean', () => {
  row({ engineOutProp: 'feathered', engineOutConfig: 'clean' });
});

test('row: the dice start from the setup\'s own seed', () => {
  row({ dice: 'setup-seed' });
});

test('row: conflict limits are 200 ft and 200 ft, caution 500 ft and 500 ft (T4)', () => {
  row({ conflictLatFt: 200, conflictVertFt: 200, cautionLatFt: 500, cautionVertFt: 500 });
});

test('row: final spacing is 3,000 ft and the chance of missing traffic 10 % (T11)', () => {
  row({ finalSpacingFt: 3000, missChancePct: 10 });
});

test('row: every rule is on', () => {
  const rules = Object.keys(DEFAULTS).filter((key) => key.startsWith('rule'));
  assert.deepEqual(rules, ['ruleExtendDownwind', 'ruleMoveOver', 'ruleFlyThrough', 'ruleBreakAtDepartureEnd', 'ruleClosedPattern']);
  for (const key of rules) assert.equal(DEFAULTS[key], true, key);
});

test('row: set up a conflict starts with the first two aircraft, the first crossing, 1 minute from now, arriving together, rules left as they are', () => {
  row({
    conflictSetupAircraft: 'first-two',
    conflictSetupPlace: 'first-crossing',
    conflictSetupInS: 60,
    conflictSetupGapS: 0,
    conflictSetupRules: 'leave-as-they-are',
  });
});

test('row: the engine-out check starts from the selected aircraft, or the downwind example (3,500 ft, 220 KIAS, abeam the threshold, clean, feathered), airstart off', () => {
  row({
    engineOutCheckFrom: 'selected-aircraft',
    engineOutCheckAltFt: 3500,
    engineOutCheckKias: 220,
    engineOutCheckPlace: 'abeam-threshold',
    engineOutCheckConfig: 'clean',
    engineOutCheckProp: 'feathered',
    airstartAttempt: false,
  });
});

test('row: engine-out reach is off, for the CT-156, with a 200 ft margin for green', () => {
  row({ layerEngineReach: false, reachType: 'CT-156', reachMarginFt: 200 });
});

test('row: a new profile is named "Setup 1" with an empty notes box', () => {
  row({ newProfileName: 'Setup 1', newProfileNotes: '' });
});

test('number boxes take the spec\'s limits', () => {
  const expected = {
    windFromDeg: [1, 360],
    windKt: [0, 60],
    conflictLatFt: [0, 20000],
    conflictVertFt: [0, 20000],
    cautionLatFt: [0, 20000],
    cautionVertFt: [0, 20000],
    manualRadiusFt: [100, 20000],
    spawnDelayS: [0, 86400],
    pointAltFt: [-1000, 20000],
    pointKias: [40, 400],
    pointG: [1, 9],
    sharePct: [0, 100],
  };
  for (const [key, range] of Object.entries(expected)) assert.deepEqual([...LIMITS[key]], range, key);
  assert.ok(Object.isFrozen(LIMITS));
  assert.ok(Object.isFrozen(LIMITS.windKt));
});

test('every default that has a limit sits inside it, so a fresh box is never refused', () => {
  for (const [key, [min, max]] of Object.entries(LIMITS)) {
    if (!Object.hasOwn(DEFAULTS, key)) continue;
    assert.ok(DEFAULTS[key] >= min && DEFAULTS[key] <= max, `${key} = ${DEFAULTS[key]} is outside ${min} to ${max}`);
  }
  // The shares have no setting of their own to look up, so check the ones that start as shares.
  for (const key of ['newPatternLandPct', 'newPatternStayPct', 'missChancePct']) {
    assert.ok(DEFAULTS[key] >= LIMITS.sharePct[0] && DEFAULTS[key] <= LIMITS.sharePct[1], key);
  }
});
