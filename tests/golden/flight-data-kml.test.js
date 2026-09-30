// Golden test (R9, D10): src/flight-data/kml.js reads exactly the fixes V6's own
// parseKmlText read, in Chromium, for the four example tracks, the fixtures, and
// (when it is on this computer) Patrick's own track. The recording is made by
// tests/golden/checks/record-flight-data.cjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readKml } from '../../src/flight-data/kml.js';

const recording = JSON.parse(readFileSync(new URL('./v6-flight-data.json', import.meta.url), 'utf8'));
const root = new URL('../../', import.meta.url);
const read = file => readFileSync(new URL(file, root), 'utf8');

// Patrick's track is never committed; only its fingerprint is (SPEC-flight-data.md).
const LOCAL_ONLY = { 'patrick-2026-09-25': '/mnt/project-files/uploads/hearth/96e8c7f1-ef09-4848-ae5b-6014cbc26335' };

const row = p => [p.lon, p.lat, p.altM, p.t, p.gRecorded, p.pitchRecordedDeg];
const sha = rows => createHash('sha256').update(JSON.stringify(rows)).digest('hex');

for (const [label, want] of Object.entries(recording.tracks)) {
  const file = want.file ?? LOCAL_ONLY[label];
  const available = file && (want.file || existsSync(file));
  test(`readKml matches V6 on ${label}`, { skip: available ? false : 'track not on this computer' }, () => {
    const text = want.file ? read(want.file) : readFileSync(file, 'utf8');
    if (want.error) {
      assert.throws(() => readKml(text, label), { name: 'KmlError' });
      return;
    }
    const rows = readKml(text, label).fixes.map(row);
    if (want.points) assert.deepEqual(rows, want.points);
    for (const [i, expected] of Object.entries(want.samples ?? {})) assert.deepEqual(rows[i], expected, `fix ${i}`);
    assert.equal(rows.length, want.count);
    assert.equal(sha(rows), want.sha256);
  });
}

test('V6 threw "No usable timestamped coordinates found" exactly where readKml says no-fixes', () => {
  for (const [label, want] of Object.entries(recording.tracks)) {
    if (!want.error || !want.file) continue;
    const code = (() => { try { readKml(read(want.file), label); } catch (e) { return e.code; } })();
    assert.equal(code === 'no-fixes', want.error === 'No usable timestamped coordinates found', label);
  }
});
