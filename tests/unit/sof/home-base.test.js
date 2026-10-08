// Checks: the SOF never reads "Within limits" at a home base that has been given no weather limits (plan Step 2c, part B). With home set to Laughlin
//   (KDLF, whose site profile has no standards yet) a clear METAR reads "Limits not set for KDLF" on the home card and "Incomplete" on an alternate,
//   while the weather facts (the flight category) still show; with home at Moose Jaw the same kind of clear report still reads "Within limits".
// Serves: SOF-32 and SOF-R12 (an airfield not filled in reads amber "Incomplete", never a green tick), ALL-R13's "never a silent green", SOF-48
//   (a base with no standards), plan Step 2c part B ("Limits not set ... never Within limits").
// Expected values: the words are the plan's and the brief's ("Limits not set for KDLF", "Incomplete", "Within limits"); "clear is within" at Moose Jaw
//   is the Gen Book p.7 local trigger (an alternate is needed below 2,000 ft or 3 SM; 15 SM and FEW100 is far above both); VFR for 10 SM and clear
//   is the FAA flight-category definition (ceiling above 3,000 ft and visibility above 5 SM). None is taken from the code's output.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAirfields } from '../../../src/airfields/airfields.js';
import { buildScreen } from '../../../src/modules/sof/screen-model.js';
import { parseMetar } from '../../../src/wx/metar.js';

const NOW = new Date('2026-10-08T17:00:00Z');

/** A storage scope kept in memory. */
function memoryStore() {
  const kept = new Map();
  return { persistent: false, get: (key, fallback) => (kept.has(key) ? structuredClone(kept.get(key)) : fallback), set: (key, value) => kept.set(key, structuredClone(value)) };
}

const entry = (raw) => ({ raw, report: parseMetar(raw, { now: NOW }), source: 'metno' });

/** The screen for one home field and its METARs, with the SOF's default limits (Local (MTCA) 2000/3). */
function screenAt(home, alternates, metars) {
  const airfields = createAirfields({ store: memoryStore() });
  airfields.update({ home, alternates });
  const snapshot = { metar: Object.fromEntries(metars.map((raw) => [raw.slice(0, 4), entry(raw)])), taf: {}, lastRound: null };
  return buildScreen({ airfields, snapshot, limits: { ceilingFt: 2000, visSm: 3 }, now: NOW, timeZone: airfields.home().timeZone });
}

test('a clear METAR at a base with no weather limits reads "Limits not set", never "Within limits"; Moose Jaw still reads "Within limits"', () => {
  const laughlin = screenAt('KDLF', ['KDRT'], ['KDLF 081655Z 16010KT 10SM CLR 28/12 A2992', 'KDRT 081651Z 15008KT 10SM CLR 29/13 A2991']);
  const [home, alternate] = laughlin.cards;
  assert.equal(home.icao, 'KDLF');
  assert.match(home.result.words, /Limits not set for KDLF/);
  assert.doesNotMatch(home.result.words, /within/i, 'no "Within limits" when no limits were given');
  assert.notEqual(home.result.level, 'within', 'not drawn with the within-limits tick');
  assert.equal(home.category, 'VFR', 'the flight category is a weather fact and still shows');

  assert.equal(alternate.icao, 'KDRT');
  assert.match(alternate.result.words, /^Incomplete/, 'an alternate at a base with no limits is "Incomplete" (SOF-32)');
  assert.notEqual(alternate.result.level, 'within');

  const mooseJaw = screenAt('CYMJ', ['CYQR'], ['CYMJ 081700Z 27010KT 15SM FEW100 15/02 A2992']);
  assert.equal(mooseJaw.cards[0].icao, 'CYMJ');
  assert.equal(mooseJaw.cards[0].result.words, 'Within limits', 'Moose Jaw is unchanged: a clear report is within its 2000/3 trigger');
});
