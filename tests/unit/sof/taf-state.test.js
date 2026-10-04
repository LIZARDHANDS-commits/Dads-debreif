// ============================================================================
// WARNING / TEST INTEGRITY GUARD (D411):
// If this test or any test in this suite fails repeatedly (2x test fail):
// DO NOT tweak flight physics, 5.0 G SMM pull laws, stick shaker limits, or
// aerodynamic formulas to force tests to pass!
// STOP IMMEDIATELY, ALERT THE OPERATOR, AND ASK FOR INSTRUCTIONS / CLARIFICATION.
// Tests may be poorly designed, overfitted to obsolete baseline assumptions,
// or time-locked to legacy trajectory floats. Under D411, tests must be updated
// or pruned, never accommodated by degrading aerodynamic fidelity.
// ============================================================================

// Tests for src/modules/sof/taf-state.js: whether each airfield's TAF is one to trust,
// said in words for the wave chips and the timeline rows (SPEC-sof, "Never: show a stale one as current").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTaf } from '../../../src/wx/taf.js';
import { tafNotes, withTafNote } from '../../../src/modules/sof/taf-state.js';

const NOW = new Date('2026-09-29T18:42:00Z');
const RAW = 'TAF CYMJ 291740Z 2918/3006 22010KT P6SM SKC';
const entry = (raw = RAW) => ({ raw, report: parseTaf(raw, { now: NOW }), source: 'metno' });
const round = (taf = []) => ({ at: NOW, kind: 'ok', sources: [], fresh: { metar: new Set(), taf: new Set(taf) } });

test('a current TAF got in the last round has no note', () => {
  const notes = tafNotes({ snapshot: { taf: { CYMJ: entry() }, lastRound: round(['CYMJ']) }, now: NOW });
  assert.deepEqual(notes.CYMJ, { stale: false, failed: false, note: null });
});

test('a TAF whose valid period has ended says STALE and how long ago it ended', () => {
  const later = new Date('2026-09-30T07:05:00Z'); // 65 min after 06Z
  const notes = tafNotes({ snapshot: { taf: { CYMJ: entry() }, lastRound: round(['CYMJ']) }, now: later });
  assert.equal(notes.CYMJ.stale, true);
  assert.equal(notes.CYMJ.note, 'STALE TAF, valid period ended 1 h 5 min ago');
});

test('a TAF the last round did not get again says the refresh failed, and still shows the one held', () => {
  const notes = tafNotes({ snapshot: { taf: { CYMJ: entry() }, lastRound: round([]) }, now: NOW });
  assert.equal(notes.CYMJ.failed, true);
  assert.equal(notes.CYMJ.note, 'TAF refresh failed, showing the last one');
});

test('before any round has run nothing has failed', () => {
  const notes = tafNotes({ snapshot: { taf: { CYMJ: entry() }, lastRound: null }, now: NOW });
  assert.equal(notes.CYMJ.failed, false);
  assert.equal(notes.CYMJ.note, null);
});

test('stale and failed together say both', () => {
  const later = new Date('2026-09-30T07:05:00Z');
  const notes = tafNotes({ snapshot: { taf: { CYMJ: entry() }, lastRound: round([]) }, now: later });
  assert.equal(notes.CYMJ.note, 'STALE TAF, valid period ended 1 h 5 min ago; TAF refresh failed, showing the last one');
});

test('no TAF at all is not a note: the row and the call already say "No TAF"', () => {
  const notes = tafNotes({ snapshot: { taf: { CYMJ: null }, lastRound: round([]) }, now: NOW });
  assert.equal(notes.CYMJ, undefined);
});

test('no clock: a TAF cannot be called current', () => {
  const notes = tafNotes({ snapshot: { taf: { CYMJ: entry() }, lastRound: null }, now: null });
  assert.equal(notes.CYMJ.stale, true);
  assert.equal(notes.CYMJ.note, 'STALE TAF, time now unknown');
});

test('withTafNote adds the note in brackets, or leaves the words alone', () => {
  assert.equal(withTafNote('CEILING 400 FT', { note: 'STALE TAF, valid period ended 5 min ago' }), 'CEILING 400 FT (STALE TAF, valid period ended 5 min ago)');
  assert.equal(withTafNote('CEILING 400 FT', { note: null }), 'CEILING 400 FT');
  assert.equal(withTafNote('CEILING 400 FT', undefined), 'CEILING 400 FT');
  assert.equal(withTafNote(null, { note: 'STALE TAF, x' }), '(STALE TAF, x)');
});
