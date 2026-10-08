// Checks: at a US base the relay never pretends: /notam for K fields with no FAA key answers 503 "FAA NOTAM key not set" (not an empty list, and
//   nothing is asked of the FAA), and /alerts for a K field rebuilds an aviationweather.gov SIGMET with only the allowlisted fields, its outline as
//   number pairs exactly where AWC put it and its top as given, so the SOF draws it over the right ground at the right height.
// Serves: plan Step 2c part E (US NOTAMs keyed off, US SIGMETs through the relay), SOF-42 (never "no NOTAMs" when they could not be asked for).
// Expected values: the 503 words are the brief's (8 Oct 2026). The SIGMET is in AWC's documented /api/data/airsigmet JSON shape (airSigmetType,
//   hazard, validTimeFrom/To in epoch seconds, altitudeHi1 in feet, rawAirSigmet, coords as { lat, lon }), written by hand because the build session
//   could not reach aviationweather.gov on 8 Oct 2026: NOT a saved real reply. Its outline and top are the input's own, so the check is that they pass
//   through unchanged, not a number taken from the code.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWxHandler } from '../../../relay/wx.js';

const SITE = 'https://lizardhands-commits.github.io';
const NOW = Date.UTC(2026, 9, 8, 15, 0);
const at = (h, m) => Date.UTC(2026, 9, 8, h, m) / 1000;

// A convective SIGMET round Laughlin, in AWC's documented shape, plus what must not come through: an AIRMET row (AIRMETs come from the G-AIRMETs)
// and a field the relay does not know.
const OUTLINE = [
  { lat: 30.2, lon: -101.4 },
  { lat: 30.0, lon: -100.1 },
  { lat: 28.9, lon: -100.3 },
  { lat: 29.1, lon: -101.6 },
  { lat: 30.2, lon: -101.4 },
];
const AIRSIGMET = [
  {
    airSigmetId: 101,
    icaoId: 'KKCI',
    alphaChar: 'C',
    receiptTime: '2026-10-08 14:55:00',
    validTimeFrom: at(14, 55),
    validTimeTo: at(16, 55),
    airSigmetType: 'SIGMET',
    hazard: 'CONVECTIVE',
    severity: 1,
    altitudeLow1: null,
    altitudeLow2: null,
    altitudeHi1: 45000,
    altitudeHi2: 45000,
    movementDir: 250,
    movementSpd: 15,
    rawAirSigmet: 'WSUS32 KKCI 081455\nSIGC\nCONVECTIVE SIGMET 12C\nVALID UNTIL 1655Z\nTX\nFROM 40N DLF-30NE DLF-40SE DLF-40W DLF-40N DLF\nAREA EMBD TS MOV FROM 25015KT. TOPS TO FL450.\u0007',
    coords: OUTLINE,
    injected: '<script>alert(1)</script>',
  },
  { airSigmetId: 102, icaoId: 'KKCI', airSigmetType: 'AIRMET', hazard: 'IFR', rawAirSigmet: 'AIRMET SIERRA', coords: OUTLINE },
];

function upstream() {
  const calls = [];
  const fn = async (url) => {
    calls.push(String(url));
    if (String(url).includes('/airsigmet')) return new Response(JSON.stringify(AIRSIGMET), { status: 200 });
    if (String(url).includes('/gairmet')) return new Response(null, { status: 204 }); // AWC's "nothing to send"
    if (String(url).includes('/pirep')) return new Response('[]', { status: 200 });
    return new Response('not asked for', { status: 404 });
  };
  fn.calls = calls;
  return fn;
}

const ask = (handle, path, env = {}) => handle(new Request(`https://dads-sof-relay.netlify.app${path}`, { headers: { origin: SITE } }), env);

test('relay at a US base: NOTAMs say the FAA key is not set (never an empty list), and an AWC SIGMET comes through checked, where AWC put it', async () => {
  // NOTAMs: Laughlin and Del Rio, no FAA key in the environment.
  const faa = upstream();
  const notams = await ask(createWxHandler({ fetch: faa, now: () => NOW }), '/notam?sites=KDLF,KDRT');
  assert.equal(notams.status, 503);
  const notamBody = await notams.json();
  assert.deepEqual(notamBody, { error: 'FAA NOTAM key not set' });
  assert.ok(!('notams' in notamBody), 'no list at all, so it can never read as "no NOTAMs"');
  assert.equal(faa.calls.length, 0, 'nothing is asked of the FAA without the key');

  // SIGMETs, G-AIRMETs and PIREPs for Laughlin.
  const awc = upstream();
  const alerts = await ask(createWxHandler({ fetch: awc, now: () => NOW }), '/alerts?sites=KDLF');
  assert.equal(alerts.status, 200);
  const body = await alerts.json();
  assert.deepEqual(body.sites, ['KDLF'], 'the answer names Laughlin, so its card can say what is near it');
  assert.ok(awc.calls.every((u) => u.startsWith('https://aviationweather.gov/api/data/')), 'only aviationweather.gov is asked');
  assert.equal(body.alerts.length, 1, 'the SIGMET only: AWC\'s AIRMET row is left to the G-AIRMETs, and there were no G-AIRMETs or PIREPs');
  const [sigmet] = body.alerts;
  assert.deepEqual(Object.keys(sigmet).sort(), ['area', 'baseFt', 'end', 'hazard', 'kind', 'location', 'severity', 'start', 'text', 'topFt'], 'allowlisted fields only');
  assert.equal(sigmet.kind, 'sigmet');
  assert.deepEqual(sigmet.area, OUTLINE.map((p) => [p.lat, p.lon]), 'the outline is AWC\'s own points, as numbers');
  assert.ok(sigmet.area.flat().every((n) => typeof n === 'number' && Number.isFinite(n)));
  assert.equal(sigmet.topFt, 45000, 'tops FL450 as AWC gives them');
  assert.equal(sigmet.baseFt, null, 'no base given, none made up');
  assert.equal(sigmet.start, '2026-10-08T14:55:00');
  assert.equal(sigmet.end, '2026-10-08T16:55:00');
  assert.ok(sigmet.text.includes('EMBD TS') && !/[\u0000-\u0009\u000b-\u001f]/.test(sigmet.text), 'the text is kept, as plain printable text');
  assert.ok(!JSON.stringify(body).includes('script'), 'a field the relay does not know never comes through');
});
