// Dropping fixes no aircraft could have flown (C3, D32, SPEC-flight-data.md Data quality).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { readKml } from '../../../src/flight-data/kml.js';
import { cleanTrack } from '../../../src/flight-data/clean.js';
import { makeLocalRef, latLonToLocalFt } from '../../../src/core/geo.js';
import { FTPS_TO_KT } from '../../../src/core/units.js';

const PATRICK = '/mnt/project-files/uploads/hearth/96e8c7f1-ef09-4848-ae5b-6014cbc26335';
const TRACKS = {
  '#1': { file: new URL('../../../original/assets/585aab2601b787ed.kml', import.meta.url), dropped: { altitude: 0, position: 0, jump: 1 }, fastestKt: 426.5 },
  '#2': { file: new URL('../../../original/assets/3ee2a7e81a74880c.kml', import.meta.url), dropped: { altitude: 1, position: 0, jump: 23 }, fastestKt: 445.0 },
  '#3': { file: new URL('../../../original/assets/3085ab3861e2bae6.kml', import.meta.url), dropped: { altitude: 0, position: 0, jump: 0 }, fastestKt: 381.7 },
  '#4': { file: new URL('../../../original/assets/46e14716b39044c4.kml', import.meta.url), dropped: { altitude: 0, position: 0, jump: 0 }, fastestKt: 403.7 },
  "Patrick's": { file: PATRICK, dropped: { altitude: 21, position: 0, jump: 0 }, fastestKt: 438.9 },
};

/** The fastest ground speed between consecutive fixes, measured over at least 1 s. */
function fastestKt(fixes) {
  const ref = makeLocalRef(fixes[0].lat, fixes[0].lon);
  let most = 0;
  for (let i = 1; i < fixes.length; i++) {
    const a = latLonToLocalFt(ref, fixes[i - 1].lat, fixes[i - 1].lon);
    const b = latLonToLocalFt(ref, fixes[i].lat, fixes[i].lon);
    most = Math.max(most, Math.hypot(b.x - a.x, b.y - a.y) / Math.max(fixes[i].t - fixes[i - 1].t, 1) * FTPS_TO_KT);
  }
  return most;
}

for (const [label, want] of Object.entries(TRACKS)) {
  const available = typeof want.file !== 'string' || existsSync(want.file);
  test(`the real ${label} track loses only impossible fixes`, { skip: available ? false : 'track not on this computer' }, () => {
    const raw = readKml(readFileSync(want.file, 'utf8'), label);
    const clean = cleanTrack(raw);
    assert.deepEqual(clean.dropped, want.dropped);
    assert.equal(clean.fixes.length, raw.fixes.length - want.dropped.altitude - want.dropped.jump);
    assert.ok(clean.fixes.every(f => f.altM > -1000), 'no −100,000 m fix is left');
    assert.equal(Math.round(fastestKt(clean.fixes) * 10) / 10, want.fastestKt);
    // Kept fixes are the reader's own, unchanged and in order.
    let k = 0;
    for (const f of clean.fixes) {
      while (raw.fixes[k] !== f) k++;
      assert.ok(k < raw.fixes.length);
    }
  });
}

// A synthetic track at 200 kt along a line of latitude: one fix a second.
const KT200_DEG_LON = 200 / FTPS_TO_KT / 3.28084 / (6371000 * Math.PI / 180 * Math.cos(50 * Math.PI / 180));
const straight = (n, step = 1) => Array.from({ length: n }, (_, i) => ({ t: i * step, lat: 50, lon: -105 + i * step * KT200_DEG_LON, altM: 1000 }));
const withJumps = (n, at) => straight(n).map((f, i) => (at.includes(i) ? { ...f, lat: 50.1 } : f));
const kept = track => cleanTrack({ name: 'test', fixes: track }).fixes.map(f => f.t);
const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);

test('a jump of up to 5 fixes is dropped when the track comes back', () => {
  assert.deepEqual(kept(withJumps(20, [7])), range(0, 20).filter(i => i !== 7));
  assert.deepEqual(kept(withJumps(20, [5, 6, 7, 8, 9])), range(0, 20).filter(i => i < 5 || i > 9));
  assert.deepEqual(cleanTrack({ name: 'test', fixes: withJumps(20, [5, 6, 7, 8, 9]) }).dropped, { altitude: 0, position: 0, jump: 5 });
});

test('six bad fixes in a row are kept: the aircraft may really be there', () => {
  assert.deepEqual(kept(withJumps(20, [5, 6, 7, 8, 9, 10])), range(0, 20));
});

test('a jump at the very end has no fix to come back to, so it is kept', () => {
  assert.deepEqual(kept(withJumps(10, [9])), range(0, 10));
  assert.deepEqual(kept(withJumps(10, [8, 9])), range(0, 10));
});

test('speed is measured over at least 1 s, so fixes 0.5 s apart are not a jump', () => {
  // 400 kt, logged every half second: naively 400 kt, but a 0.5 s pair nudged 30 % further reads 520 kt.
  const fixes = straight(20, 0.5).map(f => ({ ...f, lon: -105 + f.t * KT200_DEG_LON * 2 }));
  fixes[6] = { ...fixes[6], lon: fixes[5].lon + (fixes[6].lon - fixes[5].lon) * 1.3 };
  assert.equal(kept(fixes).length, 20);
});

test('just under and just over 450 kt', () => {
  const at = kt => {
    const fixes = straight(10);
    fixes[5] = { ...fixes[5], lon: fixes[4].lon + KT200_DEG_LON * kt / 200 };
    return kept(fixes).includes(5);
  };
  assert.equal(at(449), true);
  assert.equal(at(452), false);
});

test('altitudes from −500 m to 20,000 m are kept, others dropped', () => {
  const fixes = straight(8);
  fixes[1] = { ...fixes[1], altM: -500 };
  fixes[2] = { ...fixes[2], altM: 20000 };
  fixes[3] = { ...fixes[3], altM: -500.1 };
  fixes[4] = { ...fixes[4], altM: 20000.1 };
  fixes[5] = { ...fixes[5], altM: -100000 };
  const clean = cleanTrack({ name: 'test', fixes });
  assert.deepEqual(clean.fixes.map(f => f.t), [0, 1, 2, 6, 7]);
  assert.deepEqual(clean.dropped, { altitude: 3, position: 0, jump: 0 });
});

test('positions off the globe are dropped', () => {
  const fixes = straight(6);
  fixes[1] = { ...fixes[1], lat: 90.5 };
  fixes[2] = { ...fixes[2], lat: -91 };
  fixes[3] = { ...fixes[3], lon: 180.5, altM: -100000 };
  fixes[4] = { ...fixes[4], lon: -181 };
  const clean = cleanTrack({ name: 'test', fixes });
  assert.deepEqual(clean.fixes.map(f => f.t), [0, 5]);
  assert.deepEqual(clean.dropped, { altitude: 0, position: 4, jump: 0 });
  // Exactly on the edges is fine.
  assert.deepEqual(kept([{ t: 0, lat: 90, lon: 180, altM: 0 }, { t: 1, lat: 90, lon: 180, altM: 0 }]), [0, 1]);
  assert.deepEqual(kept([{ t: 0, lat: -90, lon: -180, altM: 0 }, { t: 1, lat: -90, lon: -180, altM: 0 }]), [0, 1]);
});

test('a track with fewer than 2 believable fixes is refused, naming it', () => {
  const fixes = straight(3).map((f, i) => (i ? { ...f, altM: -100000 } : f));
  assert.throws(() => cleanTrack({ name: 'lead.kml', fixes }), { name: 'KmlError', code: 'no-fixes', message: /"lead\.kml"/ });
  assert.throws(() => cleanTrack({ name: '', fixes: [] }), { code: 'no-fixes' });
});
