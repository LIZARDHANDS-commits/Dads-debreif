// The Turn Sim's Formation card and More detail (SPEC-turn-sim: Readouts and standards, R9, Q46, D128).
// The states are built by hand, so these tests don't depend on the engine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { V6_STANDARDS, DEFAULT_STANDARDS } from '../../../src/core/standards.js';
import { stallLimitG, availableG } from '../../../src/core/t6-performance.js';
import {
  checkTurnNote, wingmanDetail, formationRows, formationLine, mapLabel, readoutsAt, pairDistances, separationFlags, stallWarning, turnLine, pairText, ft, signedFt,
  STALL_G_WARNING, UNDER_SEPARATION_FT, MUTUAL_SUPPORT_FT,
} from '../../../src/modules/turn-sim/readouts.js';
import { MANEUVER_TURN_DEG, DEFAULTS } from '../../../src/modules/turn-sim/settings.js';
import { createRun } from '../../../src/modules/turn-sim/engine/run.js';

// Lead at the origin flying east (heading 0), so its left is north (+y).
const ac = (id, xFt, yFt, extra = {}) => ({ id, xFt, yFt, headingRad: 0, turning: false, bankDeg: 0, g: 1, ...extra });
const state = (aircraft, tSec = 0) => ({ tSec, finished: false, aircraft });

const SETTINGS = { formation: 'weighted', maneuver: 'delayed90away', speedKt: 220, baseG: 3, turnDeg: 90 };

// 4312 as V6 sets it up: #2 6,000 ft left, #3 6,000 ft right, #4 12,000 ft right.
const four = (over = {}) => state([ac(1, 0, 0), ac(2, 0, 6000), ac(3, 0, -6000), ac(4, 0, -12000)].map((a) => ({ ...a, ...(over[a.id] ?? {}) })));

const row = (rows, id) => rows.find((r) => r.id === id);

test('the default 4312 at its slots is on spacing for every wingman, with no numbers', () => {
  const r = readoutsAt(four(), SETTINGS);
  assert.deepEqual(r.rows.map((x) => x.id), [2, 3, 4]);
  for (const x of r.rows) {
    assert.deepEqual(x.labels, ['ON SPACING']);
    assert.deepEqual(x.line, { text: 'ON SPACING', tone: 'good' });
  }
});

test('too wide and too tight name the interval', () => {
  const rows = formationRows(four({ 3: { yFt: -7000 }, 2: { yFt: 3000 } }), SETTINGS);
  assert.deepEqual(row(rows, 3).labels, ['WIDE']);
  assert.equal(formationLine(row(rows, 3)).text, 'WIDE  interval 7,000 ft');
  assert.deepEqual(row(rows, 2).labels, ['TIGHT']);
  assert.equal(formationLine(row(rows, 2)).text, 'TIGHT  interval 3,000 ft');
  assert.equal(formationLine(row(rows, 2)).tone, 'caution');
});

test('fore and aft come from the standards, with a signed number and a real minus', () => {
  // The default standard allows 0 to 10 degrees of sweep behind the 3/9 line.
  const aft = formationRows(four({ 2: { xFt: -1200 } }), SETTINGS);
  assert.deepEqual(row(aft, 2).labels, ['AFT']);
  assert.equal(formationLine(row(aft, 2)).text, 'AFT  fore/aft −1,200 ft');
  const fore = formationRows(four({ 2: { xFt: 300 } }), SETTINGS);
  assert.deepEqual(row(fore, 2).labels, ['FORE']);
  assert.equal(formationLine(row(fore, 2)).text, 'FORE  fore/aft +300 ft');
});

test('an edited standard changes the labels, and V6\'s own numbers are still one preset away', () => {
  // 300 ft ahead is FORE by the sweep standard, and by V6's fixed 250 ft of the 3/9 line.
  const ahead = four({ 2: { xFt: 200 } });
  assert.deepEqual(row(formationRows(ahead, SETTINGS, V6_STANDARDS), 2).labels, ['ON SPACING']);
  const tightened = { ...DEFAULT_STANDARDS, spread: { ...DEFAULT_STANDARDS.spread, minFt: 6500 } };
  assert.deepEqual(row(formationRows(four(), SETTINGS, tightened), 2).labels, ['TIGHT']);
  assert.deepEqual(row(formationRows(four(), SETTINGS, DEFAULT_STANDARDS), 2).labels, ['ON SPACING']);
});

test('no standards given falls back to the default preset', () => {
  const wide = four({ 3: { yFt: -7000 } });
  assert.deepEqual(formationRows(wide, SETTINGS), formationRows(wide, SETTINGS, DEFAULT_STANDARDS));
  assert.deepEqual(row(formationRows(wide, SETTINGS, undefined), 3).labels, ['WIDE']);
});

test('a switched-off standard gives no label (Q46)', () => {
  const off = { ...DEFAULT_STANDARDS, spread: { ...DEFAULT_STANDARDS.spread, on: false } };
  // In 4312 every wingman is judged by spread, so nobody is judged.
  const rows = formationRows(four({ 3: { yFt: -9000 } }), SETTINGS, off);
  assert.ok(rows.every((x) => x.judged === false && x.labels.length === 0));
  assert.equal(formationLine(rows[0]).tone, 'none');
  assert.match(formationLine(rows[0]).text, /switched off/);
  // In the offset box #3 is judged by the offset standard, which is still on.
  const box = state([ac(1, 0, 0), ac(2, 0, 5000), ac(3, -7000, 2500), ac(4, -7000, 8000)]);
  const boxRows = formationRows(box, { ...SETTINGS, formation: 'offsetBox' }, off);
  assert.equal(row(boxRows, 2).judged, false);
  assert.equal(row(boxRows, 4).judged, false);
  assert.equal(row(boxRows, 3).judged, true);
  // And the other way round.
  const noOffset = { ...DEFAULT_STANDARDS, offset: { ...DEFAULT_STANDARDS.offset, on: false } };
  const rows2 = formationRows(box, { ...SETTINGS, formation: 'offsetBox' }, noOffset);
  assert.equal(row(rows2, 3).judged, false);
  assert.equal(row(rows2, 2).judged, true);
});

test('the offset box judges #3 by its aft distance, and #4 from #3', () => {
  const settings = { ...SETTINGS, formation: 'offsetBox' };
  const box = (aft) => state([ac(1, 0, 0), ac(2, 0, 5000), ac(3, -aft, 2500), ac(4, -aft, 8000)]);
  const ok = formationRows(box(7000), settings);
  assert.deepEqual(ok.map((x) => x.labels), [['ON SPACING'], ['ON SPACING'], ['ON SPACING']]);
  const far = formationRows(box(9000), settings);
  assert.deepEqual(row(far, 3).labels, ['AFT']);
  assert.equal(formationLine(row(far, 3)).text, 'AFT  aft distance 9,000 ft');
  assert.equal(row(far, 4).measureNote, '#3 3/9 reference');
});

test('a two-ship has one wingman, one pair and no NaN anywhere (#17)', () => {
  const two = state([ac(1, 0, 0), ac(2, 0, 6000)]);
  const r = readoutsAt(two, { ...SETTINGS, formation: 'twoShip' });
  assert.deepEqual(r.rows.map((x) => x.id), [2]);
  assert.deepEqual(r.pairs.map((p) => p.label), ['1-2']);
  assert.equal(r.minSepFt, 6000);
  assert.equal(r.minSepText, 'Min sep now: 6,000 ft');
  assert.doesNotMatch(JSON.stringify(r), /NaN|null.*1-3/);
  assert.doesNotMatch([...r.pairTexts, ...r.wingmen, r.turnText, ...r.summary.flat()].join('|'), /NaN/);
});

test('a four-ship lists its six pairs in V6 order, with NM only when asked', () => {
  const pairs = pairDistances(four());
  assert.deepEqual(pairs.map((p) => p.label), ['1-2', '1-3', '1-4', '3-4', '2-3', '2-4']);
  assert.equal(pairs[0].distFt, 6000);
  assert.equal(pairText(pairs[1]), '1-3: 6,000 ft');
  assert.equal(pairText(pairs[1], true), '1-3: 6,000 ft (0.99 NM)');
  assert.equal(readoutsAt(four(), SETTINGS, { distNm: true }).pairTexts[2], '1-4: 12,000 ft (1.97 NM)');
  assert.equal(readoutsAt(four(), SETTINGS).minSepText, 'Min sep now: 6,000 ft');
});

test('the turn line and summary use the set speed and G, limited as the flying limits them', () => {
  assert.match(turnLine(SETTINGS), /^R 1,5\d\d ft · 1[34]\.\d°\/s · bank 71°$/);
  // Below 1 G V6 gave NaN; the flying limits G to 1.01 and so do the readouts.
  assert.doesNotMatch(turnLine({ ...SETTINGS, baseG: 0.5 }), /NaN/);
  const summary = readoutsAt(four(), SETTINGS).summary;
  assert.deepEqual(summary.map((s) => s[0]), ['Turn radius', 'Turn rate', 'Time to 90°', 'Bank angle', 'Speed']);
  assert.equal(summary.at(-1)[1], '220 KTAS');
  assert.equal(readoutsAt(four(), { ...SETTINGS, turnDeg: 45 }).summary[2][0], 'Time to 45\u00b0');
  // Turn degrees follow the turn (settings.js MANEUVER_TURN_DEG): the hook is 180 (SMM 16.19 para 60) and the check turn 30.
  assert.deepEqual(MANEUVER_TURN_DEG, { delayed90away: 90, delayed45away: 45, hook90: 180, shackle45: 45, cross180: 180, inplace90: 90, check30: 30 });
});

test('the stall-limit G warning fires above the limit and is a words-only warning (D128)', () => {
  // A stand-in for core's stallLimitG: about 6.5 G at 220 kt.
  const limit = (kt) => (kt >= 220 ? 6.5 : 4);
  assert.equal(stallWarning(3, 220, limit), null);
  assert.equal(stallWarning(6.6, 220, limit), STALL_G_WARNING);
  assert.equal(STALL_G_WARNING, 'More G than a T-6 can pull at this speed');
  // Not merged yet: with no limit function there's never a warning.
  assert.equal(stallWarning(9, 220, undefined), null);
  assert.equal(readoutsAt(four(), { ...SETTINGS, baseG: 9 }).gWarning, null);
  // With it, the G box warns, and so does the one wingman whose own G error takes it over.
  const st = four({ 3: { g: 7 } });
  const r = readoutsAt(st, { ...SETTINGS, baseG: 3 }, { stallLimitG: limit });
  assert.equal(r.gWarning, null);
  assert.equal(row(r.rows, 2).warning, null);
  assert.equal(row(r.rows, 3).warning, STALL_G_WARNING);
  assert.equal(row(r.rows, 3).line.text, `ON SPACING ${STALL_G_WARNING}.`);
  assert.equal(readoutsAt(st, { ...SETTINGS, baseG: 7 }, { stallLimitG: limit }).gWarning, STALL_G_WARNING);
});

test('separation flags: under 300 ft, crossing in the shackle and cross turn, mutual support (SMM item 6)', () => {
  const close = state([ac(1, 0, 0), ac(2, 0, 250), ac(3, 0, -6000), ac(4, 0, -12000)]);
  assert.deepEqual(separationFlags(close, SETTINGS), [`Under ${UNDER_SEPARATION_FT} ft`]);
  assert.deepEqual(separationFlags(close, { ...SETTINGS, maneuver: 'shackle45' }), ['Crossing: 300 ft vertical needed']);
  assert.deepEqual(separationFlags(close, { ...SETTINGS, maneuver: 'cross180' }), ['Crossing: 300 ft vertical needed']);
  assert.deepEqual(separationFlags(four(), SETTINGS), []);

  // #2 more than 9,000 ft from Lead, both wings level on one heading: support is lost.
  const apart = state([ac(1, 0, 0), ac(2, 0, MUTUAL_SUPPORT_FT + 500), ac(3, 0, -6000), ac(4, 0, -12000)]);
  assert.deepEqual(separationFlags(apart, SETTINGS), ['Mutual support lost']);
  // Exactly 9,000 is still supported; a pair mid-turn is not line abreast.
  assert.deepEqual(separationFlags(state([ac(1, 0, 0), ac(2, 0, MUTUAL_SUPPORT_FT)]), { ...SETTINGS, formation: 'twoShip' }), []);
  const turning = state([ac(1, 0, 0, { turning: true }), ac(2, 0, 12000), ac(3, 0, -6000), ac(4, 0, -12000)]);
  assert.deepEqual(separationFlags(turning, SETTINGS), []);
  // Wide but turned to another heading is not line abreast either.
  const crossed = state([ac(1, 0, 0), ac(2, 0, 12000, { headingRad: Math.PI / 2 })]);
  assert.deepEqual(separationFlags(crossed, { ...SETTINGS, formation: 'twoShip' }), []);
});

test('the standards line shows what is judged, and says when it is the default preset (Q46)', () => {
  const def = readoutsAt(four(), SETTINGS);
  assert.equal(def.standardsAreDefault, true);
  assert.ok(def.standardsLines.length >= 2);
  assert.match(def.standardsLines[0], /^Spread: 4000-6000 ft/);
  const edited = readoutsAt(four(), SETTINGS, { standards: { ...DEFAULT_STANDARDS, spread: { ...DEFAULT_STANDARDS.spread, minFt: 4500 } } });
  assert.equal(edited.standardsAreDefault, false);
  assert.match(edited.standardsLines[0], /^Spread: 4500-6000 ft/);
});

test('an empty or missing state gives empty readouts, not a crash', () => {
  const r = readoutsAt(state([]), SETTINGS);
  assert.deepEqual(r.rows, []);
  assert.equal(r.minSepText, null);
  assert.deepEqual(r.flags, []);
  assert.deepEqual(readoutsAt(null, SETTINGS).rows, []);
});

test('numbers are written with commas and a real minus', () => {
  assert.equal(ft(6420.4), '6,420 ft');
  assert.equal(ft(-380), '−380 ft');
  assert.equal(signedFt(380), '+380 ft');
  assert.equal(signedFt(-380), '−380 ft');
});

test('the picture labels are words only, and none for an aircraft that is not judged', () => {
  const rows = formationRows(four({ 3: { yFt: -7000 } }), SETTINGS);
  assert.deepEqual(mapLabel(row(rows, 2)), { text: 'ON SPACING', tone: 'good' });
  assert.deepEqual(mapLabel(row(rows, 3)), { text: 'WIDE', tone: 'caution' });
  const off = { ...DEFAULT_STANDARDS, spread: { ...DEFAULT_STANDARDS.spread, on: false } };
  assert.equal(mapLabel(row(formationRows(four(), SETTINGS, off), 2)), null);
});

test('an aircraft exactly abreast is on spacing even when the engine leaves a hair of rounding', () => {
  // cos(pi/2) is 6e-17, so a 6,000 ft slot starts about 4e-13 ft off the 3/9 line.
  const rows = formationRows(four({ 2: { xFt: 3.7e-13 }, 3: { xFt: -3.7e-13 } }), SETTINGS);
  assert.deepEqual(rows.map((r) => r.labels), [['ON SPACING'], ['ON SPACING'], ['ON SPACING']]);
  // A real 300 ft ahead is still FORE, and prints with a plus (never -0). Under 1 degree is not flagged (N4).
  const ahead = formationRows(four({ 2: { xFt: 300 } }), SETTINGS);
  assert.equal(formationLine(row(ahead, 2)).text, 'FORE  fore/aft +300 ft');
  assert.equal(signedFt(-0.4), '0 ft');
});

test('with core\'s stall limit, the G warning fires above about 6.5 G at 220 kt and not at 3 G (D128)', () => {
  assert.ok(Math.abs(stallLimitG(220) - 6.54) < 0.01);
  // The G box: 3 G (the default) is fine, 7 G is over the limit at this speed.
  assert.equal(readoutsAt(four(), { ...SETTINGS, baseG: 3 }, { stallLimitG }).gWarning, null);
  assert.equal(readoutsAt(four(), { ...SETTINGS, baseG: 6.5 }, { stallLimitG }).gWarning, null);
  assert.equal(readoutsAt(four(), { ...SETTINGS, baseG: 7 }, { stallLimitG }).gWarning, STALL_G_WARNING);
  // Slower, the same G is over the limit: 4 G at 150 kt.
  assert.equal(readoutsAt(four(), { ...SETTINGS, baseG: 4, speedKt: 150 }, { stallLimitG }).gWarning, STALL_G_WARNING);
  // A wingman's line: its own G (the set G plus its G error, as the engine reports it) over the limit.
  const st = four({ 4: { g: 7.2 } });
  const rows = readoutsAt(st, { ...SETTINGS, baseG: 3 }, { stallLimitG }).rows;
  assert.equal(row(rows, 2).line.text, 'ON SPACING');
  assert.equal(row(rows, 4).line.text, `ON SPACING ${STALL_G_WARNING}.`);
  // Only a warning: the readouts carry the set G unchanged.
  assert.match(readoutsAt(st, { ...SETTINGS, baseG: 7 }, { stallLimitG }).turnText, /^R /);
});

test('the warning also covers the +7 G cap: 8 G at 300 kt warns although the wing could give more (D128)', () => {
  const maxG = (kt) => availableG(kt, false);
  assert.ok(stallLimitG(300) > 7 && maxG(300) === 7);
  assert.equal(readoutsAt(four(), { ...SETTINGS, baseG: 8, speedKt: 300 }, { stallLimitG: maxG }).gWarning, STALL_G_WARNING);
  assert.equal(readoutsAt(four(), { ...SETTINGS, baseG: 7, speedKt: 300 }, { stallLimitG: maxG }).gWarning, null);
  assert.equal(readoutsAt(four(), { ...SETTINGS, baseG: 3 }, { stallLimitG: maxG }).gWarning, null);
  assert.equal(readoutsAt(four(), { ...SETTINGS, baseG: 7 }, { stallLimitG: maxG }).gWarning, STALL_G_WARNING); // 220 kt: 6.5 G
});

test('mutual support is only lost for a pair across the front, not one in trail', () => {
  // Same heading, 12,000 ft apart, but #2 is dead astern of Lead: not line abreast.
  const trail = state([ac(1, 0, 0), ac(2, -12000, 0)]);
  assert.deepEqual(separationFlags(trail, { ...SETTINGS, formation: 'twoShip' }), []);
  // Within 30 degrees of the 3/9 line still counts (12,000 ft out, 5,000 ft back = about 23 degrees).
  const near = state([ac(1, 0, 0), ac(2, -5000, 12000)]);
  assert.deepEqual(separationFlags(near, { ...SETTINGS, formation: 'twoShip' }), ['Mutual support lost']);
  // 45 degrees off the wing line is a stagger, not abreast.
  const far = state([ac(1, 0, 0), ac(2, -9000, 9000)]);
  assert.deepEqual(separationFlags(far, { ...SETTINGS, formation: 'twoShip' }), []);
});

// TS-06: a perfect formation must never read FORE or WIDE from floating-point noise, whatever way it faces.
test('every formation reads ON SPACING at t = 0 on any start heading (TS-06)', async () => {
  const { createRun } = await import('../../../src/modules/turn-sim/engine/run.js');
  const { DEFAULTS } = await import('../../../src/modules/turn-sim/settings.js');
  for (const formation of ['weighted', 'weightedReverse', 'twoShip']) {
    for (const startHeadingDeg of [0, 45, 90, 180, 270, 300]) {
      const settings = { ...DEFAULTS, formation, startHeadingDeg };
      const rows = formationRows(createRun(settings).state, settings);
      assert.ok(rows.length >= 1);
      for (const row of rows) assert.deepEqual(row.labels, ['ON SPACING'], `${formation} at ${startHeadingDeg}: #${row.id} reads ${row.labels}`);
    }
  }
});

test('the offset box reads the same on every start heading, and never FORE or AFT at t = 0 (TS-06)', async () => {
  const { createRun } = await import('../../../src/modules/turn-sim/engine/run.js');
  const { DEFAULTS } = await import('../../../src/modules/turn-sim/settings.js');
  const at = (startHeadingDeg) => {
    const settings = { ...DEFAULTS, formation: 'offsetBox', startHeadingDeg };
    return formationRows(createRun(settings).state, settings).map((r) => [r.id, r.labels, r.foreAftFt]);
  };
  const north = at(0);
  for (const deg of [45, 90, 180, 270, 300]) assert.deepEqual(at(deg), north, `heading ${deg}`);
  for (const [id, labels] of north) assert.ok(!labels.includes('FORE'), `#${id} reads ${labels}`);
});

test('N4: a perfect turn ends ON SPACING: under 1 degree fore and within 1 percent of the spacing are not flagged, the numbers still show', () => {
  const settings = { ...SETTINGS, spacingFt: 6000 };
  // The report's cases: +59 ft fore at 6,000 ft (0.56 degrees) and a 6,039 ft interval (0.65 percent).
  const fore = formationRows(four({ 2: { xFt: 59 } }), settings);
  assert.deepEqual(row(fore, 2).labels, ['ON SPACING']);
  assert.equal(row(fore, 2).foreAftFt, 59);
  const wide = formationRows(four({ 2: { yFt: 6039 } }), settings);
  assert.deepEqual(row(wide, 2).labels, ['ON SPACING']);
  assert.equal(row(wide, 2).intervalFt, 6039);
});

test('N4: real errors are still flagged: 300 ft fore, 7,000 ft out, 5,000 ft in and an aft wingman', () => {
  const settings = { ...SETTINGS, spacingFt: 6000 };
  assert.deepEqual(row(formationRows(four({ 2: { xFt: 300 } }), settings), 2).labels, ['FORE']);
  assert.deepEqual(row(formationRows(four({ 3: { yFt: -7000 } }), settings), 3).labels, ['WIDE']);
  assert.deepEqual(row(formationRows(four({ 2: { yFt: 3900 } }), settings), 2).labels, ['TIGHT']);
  assert.deepEqual(row(formationRows(four({ 2: { xFt: -1200 } }), settings), 2).labels, ['AFT']);
  // Only a hair past the band's edge is excused: a standard edited to want 6,500 ft still calls 6,000 ft TIGHT.
  const tightened = { ...DEFAULT_STANDARDS, spread: { ...DEFAULT_STANDARDS.spread, minFt: 6500, maxFt: 9000 } };
  assert.deepEqual(row(formationRows(four(), settings, tightened), 2).labels, ['TIGHT']);
  // Inside the standard's band it stays ON SPACING.
  assert.deepEqual(row(formationRows(four({ 2: { yFt: 4500 } }), settings), 2).labels, ['ON SPACING']);
});

test('N4: the FORE tolerance is 1 degree of the standard\'s own FORE edge, not of the 3/9 line', () => {
  const settings = { ...SETTINGS, spacingFt: 6000 };
  const std = (over) => ({ ...DEFAULT_STANDARDS, spread: { ...DEFAULT_STANDARDS.spread, ...over } });
  // About 1.2 degrees ahead (+130 ft at 6,000 ft) is FORE with the default standard.
  assert.deepEqual(row(formationRows(four({ 2: { xFt: 130 } }), settings), 2).labels, ['FORE']);
  // A standard that wants 5 degrees aft: abreast, and 3 degrees aft (6,000 ft interval, 314 ft back), are FORE.
  assert.deepEqual(row(formationRows(four(), settings, std({ sweepMinDeg: 5 })), 2).labels, ['FORE']);
  assert.deepEqual(row(formationRows(four({ 2: { xFt: -314 } }), settings, std({ sweepMinDeg: 5 })), 2).labels, ['FORE']);
  // ... and 4.5 degrees aft is within a degree of that edge.
  assert.deepEqual(row(formationRows(four({ 2: { xFt: -472 } }), settings, std({ sweepMinDeg: 5 })), 2).labels, ['ON SPACING']);
  // A fixed fore/aft standard (V6's kind) allows 50 ft. At 1,000 ft abreast one degree is 17 ft: 90 ft ahead is FORE, 60 ft is not.
  const v6 = { ...DEFAULT_STANDARDS, spread: { on: true, minFt: 0, maxFt: 99999, foreAftTolFt: 50 } };
  const close = (xFt) => formationRows(four({ 2: { xFt, yFt: 1000 } }), { ...settings, spacingFt: 1000 }, v6);
  assert.deepEqual(row(close(90), 2).labels, ['FORE']);
  assert.deepEqual(row(close(60), 2).labels, ['ON SPACING']);
});

test('the check turn is named in the summary only when it is flown, with the figure for the formation', () => {
  const set = (formation) => ({ ...SETTINGS, formation, checkTurnDeg: 12.5 });
  assert.equal(checkTurnNote({ delayed45CheckFlown: false }, set('weighted')), null);
  assert.equal(checkTurnNote({}, set('weighted')), null);
  assert.equal(checkTurnNote({ delayed45CheckFlown: true }, set('weighted')), 'Delayed 45 with a 12.5° check (SMM Fig 16.34). Tracks cross: stack the altitudes. Wingmen fix spacing and sweep on the roll-out.');
  assert.equal(checkTurnNote({ delayed45CheckFlown: true }, set('twoShip')), 'Delayed 45 with a 12.5° check (SMM Fig 16.17). Wingmen fix spacing and sweep on the roll-out.');
  assert.equal(checkTurnNote({ delayed45CheckFlown: true }, set('offsetBox')), 'Delayed 45 with a 12.5° check (SMM Fig 16.31). Tracks cross: stack the altitudes. Wingmen fix spacing and sweep on the roll-out.');
  assert.equal(checkTurnNote({ delayed45CheckFlown: true }, set('weightedReverse')), 'Delayed 45 with a 12.5° check (SMM Fig 16.34). Tracks cross: stack the altitudes. Wingmen fix spacing and sweep on the roll-out.');
  assert.equal(readoutsAt({ ...four(), delayed45CheckFlown: true }, set('weighted')).checkNote, 'Delayed 45 with a 12.5° check (SMM Fig 16.34). Tracks cross: stack the altitudes. Wingmen fix spacing and sweep on the roll-out.');
});

test('a close pass (300 to 1,000 ft) is flagged with its distance and pair, after any crossing', () => {
  const st = { ...four(), crossings: [{ a: 1, b: 3, minFt: 120 }], closePasses: [{ a: 1, b: 2, minFt: 893.6 }] };
  assert.deepEqual(separationFlags(st, SETTINGS), ['Crossing: 300 ft vertical needed, #1 and #3', 'Close pass in this run: 894 ft, #1 and #2: altitude separation needed']);
  assert.deepEqual(separationFlags({ ...four(), closePasses: [] }, SETTINGS), []);
});

// F3: an In-place 90 ends in trail (SMM ch.16, a reference only), so the end is judged by the distance in trail, not against the line abreast.
const IN_PLACE = { ...SETTINGS, formation: 'twoShip', maneuver: 'inplace90', turnDeg: 90, spacingFt: 6000 };

test('F3: a finished In-place 90 is judged in trail: ON SPACING at 6,000 ft, TIGHT or WIDE by the standard', () => {
  const done = (gapFt) => ({ ...state([ac(1, 0, 0), ac(2, gapFt, 0)], 30), turnComplete: true });
  const good = formationRows(done(6000), IN_PLACE);
  assert.deepEqual(good[0].labels, ['ON SPACING']);
  assert.equal(formationLine(good[0]).text, 'ON SPACING in trail 6,000 ft');
  assert.equal(formationRows(done(-6000), IN_PLACE)[0].onSpacing, true); // trail behind or ahead of Lead: the same distance
  assert.equal(formationLine(formationRows(done(3000), IN_PLACE)[0]).text, 'TIGHT in trail 3,000 ft');
  assert.equal(formationLine(formationRows(done(9000), IN_PLACE)[0]).text, 'WIDE in trail 9,000 ft');
});

test('F3: before the turn is done the line-abreast standard still judges, and other turns are not judged in trail', () => {
  const trail = state([ac(1, 0, 0), ac(2, 6000, 0)]); // turnComplete is not set: mid-turn
  assert.ok(formationRows(trail, IN_PLACE)[0].labels.includes('TIGHT'));
  assert.ok(formationRows({ ...trail, tSec: 30, turnComplete: true }, { ...IN_PLACE, maneuver: 'delayed90away' })[0].labels.includes('TIGHT'));
});

test('F3: a default In-place 90 ends with no TIGHT, WIDE, FORE or AFT in any formation or direction, and starts ON SPACING', () => {
  for (const formation of ['twoShip', 'weighted', 'weightedReverse', 'offsetBox']) {
    for (const direction of ['right', 'left']) {
      const settings = { ...DEFAULTS, formation, direction, maneuver: 'inplace90', turnDeg: 90, startHeadingDeg: 0 };
      const run = createRun(settings);
      assert.ok(readoutsAt(run.state, settings).rows.every((r) => r.onSpacing), `${formation} ${direction}: at the start`);
      while (run.step());
      const rows = readoutsAt(run.state, settings).rows;
      for (const r of rows) assert.deepEqual(r.labels, ['ON SPACING'], `${formation} ${direction} #${r.id}: ${r.line.text}`);
    }
  }
});

test('F3: the finished Check turn is not judged against the line abreast (the wingman corrects after it), and its start is', () => {
  for (const formation of ['twoShip', 'weighted', 'offsetBox']) {
    const settings = { ...DEFAULTS, formation, maneuver: 'check30', turnDeg: 30, startHeadingDeg: 0 };
    const run = createRun(settings);
    assert.ok(readoutsAt(run.state, settings).rows.every((r) => r.onSpacing), `${formation}: at the start`);
    while (run.step());
    for (const r of readoutsAt(run.state, settings).rows) {
      assert.equal(r.judged, false, `${formation} #${r.id}`);
      assert.equal(r.line.text, 'Not judged: the wingman corrects after a check turn');
      assert.equal(mapLabel(r), null);
    }
  }
});

test('N4 edge: the FORE tolerance is exact at 6,000 ft: 104 ft ahead (0.99 degrees) is not flagged and 106 ft (1.01 degrees) is', () => {
  const settings = { ...SETTINGS, spacingFt: 6000 };
  assert.deepEqual(row(formationRows(four({ 2: { xFt: 104 } }), settings), 2).labels, ['ON SPACING']);
  assert.deepEqual(row(formationRows(four({ 2: { xFt: 106 } }), settings), 2).labels, ['FORE']);
});

// R1: each wingman is judged in trail from its own reference aircraft, as core does at the start, not from the nearest mate.
const endOf = (settings) => {
  const run = createRun(settings);
  while (run.step());
  return run.state;
};
const withWide = (ids, wideFt) => Object.fromEntries(ids.flatMap((id) => [[`aircraft${id}.positionErrorOn`, true], [`aircraft${id}.lateralDir`, 'wide'], [`aircraft${id}.lateralFt`, wideFt]]));

test('R1: a 4312 In-place 90 with #3 and #4 each 3,000 ft wide ends with #3 WIDE (about 9,000 ft from Lead), and #4 ON SPACING from #3', () => {
  const settings = { ...DEFAULTS, formation: 'weighted', maneuver: 'inplace90', turnDeg: 90, startHeadingDeg: 0, ...withWide([3, 4], 3000) };
  const rows = readoutsAt(endOf(settings), settings).rows;
  assert.deepEqual(row(rows, 3).labels, ['WIDE']);
  assert.equal(row(rows, 3).line.text, 'WIDE in trail 9,000 ft');
  assert.deepEqual(row(rows, 4).labels, ['ON SPACING']); // 6,000 ft behind #3, its own reference
  assert.deepEqual(row(rows, 2).labels, ['ON SPACING']);
});

// Y3: no 500 ft cliff. Once the turn is done every In-place 90 wingman reads in trail against its reference; the offset across is flagged only past the FORE edge's angle.
test('Y3: #2 turning 3 s late reads in trail terms with its offset across, not TIGHT / FORE (4312, two-ship, box)', () => {
  for (const formation of ['weighted', 'twoShip', 'offsetBox']) {
    const settings = { ...DEFAULTS, formation, maneuver: 'inplace90', turnDeg: 90, startHeadingDeg: 0, 'aircraft2.delayErrSec': 3 };
    const two = readoutsAt(endOf(settings), settings).rows.find((r) => r.id === 2);
    assert.match(two.line.text, /in trail [\d,]+ ft, [\d,]+ ft across/, formation);
    assert.ok(two.labels.includes('OFFSET ACROSS'), formation);
    assert.ok(!two.labels.includes('FORE') && !two.labels.includes('AFT'), formation);
    assert.equal(two.line.tone, 'caution');
  }
});

test('Y3: the offset across is flagged past the FORE edge angle plus 1 degree, from the reference\'s tail, and not before', () => {
  const done = (across) => ({ ...state([ac(1, 0, 0), ac(2, 6000, across)], 30), turnComplete: true });
  // Default standard: the FORE edge is 0 degrees, so 1 degree of tolerance: 6,000 ft x tan(1 degree) = 104.7 ft.
  assert.deepEqual(formationRows(done(104), IN_PLACE)[0].labels, ['ON SPACING']);
  assert.deepEqual(formationRows(done(-104), IN_PLACE)[0].labels, ['ON SPACING']);
  assert.deepEqual(formationRows(done(106), IN_PLACE)[0].labels, ['OFFSET ACROSS']);
  assert.equal(formationLine(formationRows(done(-300), IN_PLACE)[0]).text, 'OFFSET ACROSS in trail 6,000 ft, 300 ft across');
  assert.deepEqual(formationRows(done(1000), { ...IN_PLACE, spacingFt: 6000 }, DEFAULT_STANDARDS)[0].labels, ['OFFSET ACROSS']); // far across: still in trail terms, never the 500 ft cliff
  const tight = formationRows(done(300), IN_PLACE)[0];
  assert.equal(formationLine({ ...tight, labels: ['TIGHT', 'OFFSET ACROSS'] }).text.startsWith('TIGHT / OFFSET ACROSS in trail'), true);
});

test('R1: 6,000 ft wide (#3 12,000 ft from Lead) is WIDE too, in 4312 and 2134, and the box judges #2 from Lead, #4 from #3 and #3 from its rear-element mate #4', () => {
  for (const formation of ['weighted', 'weightedReverse']) {
    const settings = { ...DEFAULTS, formation, maneuver: 'inplace90', turnDeg: 90, startHeadingDeg: 0, ...withWide([3, 4], 6000) };
    const rows = readoutsAt(endOf(settings), settings).rows;
    assert.equal(row(rows, 3).line.text, 'WIDE in trail 12,000 ft', formation);
    assert.deepEqual(row(rows, 4).labels, ['ON SPACING'], formation);
  }
  const box = { ...DEFAULTS, formation: 'offsetBox', maneuver: 'inplace90', turnDeg: 90, startHeadingDeg: 0, ...withWide([4], 3000) };
  const rows = readoutsAt(endOf(box), box).rows;
  assert.deepEqual([2, 3, 4].map((id) => row(rows, id).trailRefId), [1, 4, 3]);
});

// R2: More detail on a trail row shows the in-trail distance and the offset across, not "interval 0 ft, fore/aft 0 ft".
test('R2: More detail for a trail row gives the in-trail distance, its reference and the offset across', () => {
  const done = (across) => ({ ...state([ac(1, 0, 0), ac(2, 6000, across)], 30), turnComplete: true });
  assert.equal(wingmanDetail(formationRows(done(0), IN_PLACE)[0]), '#2: in trail 6,000 ft from #1, across 0 ft');
  assert.equal(wingmanDetail(formationRows(done(-300), IN_PLACE)[0]), '#2: in trail 6,000 ft from #1, across 300 ft');
  const settings = { ...DEFAULTS, formation: 'weighted', maneuver: 'inplace90', turnDeg: 90, startHeadingDeg: 0 };
  const details = readoutsAt(endOf(settings), settings).wingmen;
  assert.deepEqual(details, ['#2: in trail 6,000 ft from #1, across 0 ft', '#3: in trail 6,000 ft from #1, across 0 ft', '#4: in trail 6,000 ft from #3, across 0 ft']);
  for (const text of details) assert.ok(!/interval 0 ft|fore\/aft 0 ft/.test(text), text);
});

// Y1: the guard. Mid-turn (time has passed, the turn is not complete) there is no trail judge and no "Not judged".
test('Y1: a mid-turn state (tSec above 0, turn not complete) gets the line-abreast judge, in an In-place 90 and a Check turn alike', () => {
  const mid = (over = {}) => ({ ...state([ac(1, 0, 0), ac(2, 6000, 0)], 12), turnComplete: false, ...over });
  const inPlace = formationRows(mid(), IN_PLACE)[0];
  assert.equal(inPlace.judged, true);
  assert.equal(inPlace.trailFt, undefined); // no trail judge
  assert.ok(inPlace.labels.includes('TIGHT')); // the line-abreast judge: #2 is 6,000 ft ahead of Lead, not 6,000 across
  const check = formationRows(mid(), { ...IN_PLACE, maneuver: 'check30' })[0];
  assert.equal(check.judged, true); // and no "Not judged"
  assert.equal(check.reason, undefined);
  assert.notEqual(formationLine(check).text.slice(0, 10), 'Not judged');
  // Once complete, the same state is the trail judge and the Check turn's Not judged.
  assert.equal(formationRows(mid({ turnComplete: true }), IN_PLACE)[0].trailFt, 6000);
  assert.equal(formationRows(mid({ turnComplete: true }), { ...IN_PLACE, maneuver: 'check30' })[0].judged, false);
  // At t = 0 a set-up state is never "ended" either, even if turnComplete were set.
  assert.equal(formationRows({ ...mid({ turnComplete: true }), tSec: 0 }, IN_PLACE)[0].trailFt, undefined);
});

// Y2: the trail band's edges at 6,000 ft spacing: the standard's 4,000 to 6,000 ft with the 1 percent (60 ft) slack, so 3,940 and 6,060.
test('Y2: the trail band edges at 6,000 ft spacing: just inside and just outside 3,940 and 6,060 ft', () => {
  const at = (gap) => formationRows({ ...state([ac(1, 0, 0), ac(2, gap, 0)], 30), turnComplete: true }, IN_PLACE)[0].labels;
  assert.deepEqual(at(3940), ['ON SPACING']);
  assert.deepEqual(at(3939), ['TIGHT']);
  assert.deepEqual(at(6060), ['ON SPACING']);
  assert.deepEqual(at(6061), ['WIDE']);
  assert.deepEqual(at(-3941), ['ON SPACING']); // behind Lead is the same distance
  assert.deepEqual(at(-6061), ['WIDE']);
});

// The engine's fallback reasons reach the screen through readoutsAt: state.maneuverFallback (the Shackle in a four-ship, a Check turn over 30 degrees) and
// state.checkFallback (the Delayed 45's check asked for at a Turn degrees it cannot fly, so the plain chain is flown; null when nothing was asked for).
// The layout shows either in the one Turn note beside the menu.
test('the engine\'s fallback reasons are passed through as they are, and are null without one', () => {
  const why = 'The check turn is flown at 45 degrees only, so this is the plain Delayed 45.';
  const r = readoutsAt({ ...four(), checkFallback: why }, { ...SETTINGS, maneuver: 'delayed45away', turnDeg: 60 });
  assert.equal(r.checkFallback, why);
  assert.equal(r.maneuverFallback, null);
  assert.equal(readoutsAt({ ...four(), maneuverFallback: why }, SETTINGS).maneuverFallback, why);
  const none = readoutsAt(four(), SETTINGS);
  assert.deepEqual([none.maneuverFallback, none.checkFallback], [null, null]);
});
