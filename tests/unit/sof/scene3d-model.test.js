// Checks: a METAR's cloud layers become the right flat decks in the SOF's 3D view: the base is the reported height above the
//   aerodrome plus the field's elevation, and a layer with no base is not drawn.
// Serves: SOF-39 (3D view, phase 1).
// Expected values: standard METAR meaning (a sky group's three digits are the cloud base in hundreds of feet above the
//   aerodrome: BKN025 is 2,500 ft; ICAO Annex 3 / MANOBS), and a field elevation written by hand. Not read from V6 or the code.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMetar } from '../../../src/wx/metar.js';
import { cloudDecks } from '../../../src/modules/sof/scene3d-model.js';

const NOW = new Date('2026-10-07T12:30:00Z');
const skyOf = (metar) => parseMetar(metar, { now: NOW }).conditions.sky;

test('a reported BKN025 is a deck 2,500 ft above the field (2,500 ft plus the elevation above sea level), and a layer with no base is not drawn', () => {
  const elevationFt = 1900; // a prairie field, by hand
  const { decks } = cloudDecks({ sky: skyOf('CYXX 071200Z 27010KT 15SM BKN025 12/05 A3000'), elevationFt });
  assert.equal(decks.length, 1);
  assert.equal(decks[0].cover, 'BKN');
  assert.equal(decks[0].baseAglFt, 2500);
  assert.equal(decks[0].baseMslFt, 2500 + elevationFt);
  assert.equal(decks[0].label, 'BKN 2,500');

  const noBase = cloudDecks({ sky: skyOf('CYXX 071200Z 27010KT 15SM BKN/// 12/05 A3000'), elevationFt });
  assert.deepEqual(noBase.decks, []);
  assert.equal(noBase.baseUnknown, true); // the pin says "base unknown"
});
