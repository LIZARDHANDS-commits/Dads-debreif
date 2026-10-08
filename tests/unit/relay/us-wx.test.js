// Checks: at a US base the relay never pretends: /notam for K fields with no FAA key answers 503 "FAA NOTAM key not set" (not an empty list, and
//   nothing is asked of the FAA), and /alerts for a K field rebuilds an aviationweather.gov SIGMET with only the allowlisted fields, its outline as
//   number pairs exactly where AWC put it and its top as given, so the SOF draws it over the right ground at the right height.
// Serves: plan Step 2c part E (US NOTAMs keyed off, US SIGMETs through the relay), SOF-42 (never "no NOTAMs" when they could not be asked for).
// Expected values: the 503 words are the brief's (8 Oct 2026). The SIGMET is a real reply: convective SIGMET 19E, one record of
//   aviationweather.gov/api/data/airsigmet?format=json saved on 8 Oct 2026 at 0447Z, kept as AWC sent it; only a bell character in its text, an
//   unknown field and an AIRMET row are added to check what must not come through. Its outline, top (38,000 ft) and valid times (03:55Z to 05:55Z,
//   the epoch seconds AWC sent) are the reply's own, so the check is that they pass through unchanged, not a number taken from the code.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWxHandler } from '../../../relay/wx.js';

const SITE = 'https://lizardhands-commits.github.io';
const NOW = Date.UTC(2026, 9, 8, 4, 47);

// The real record (aviationweather.gov, 8 Oct 2026), as sent.
const REAL_SIGMET = {
  icaoId: 'KKCI', alphaChar: 'E', seriesId: '19E', receiptTime: '2026-10-08T03:46:54.492Z', creationTime: '2026-10-08T03:55:00.000Z',
  validTimeFrom: 1791431700, validTimeTo: 1791438900, airSigmetType: 'SIGMET', hazard: 'CONVECTIVE',
  altitudeHi1: 38000, altitudeHi2: null, altitudeLow1: null, altitudeLow2: null, movementDir: 240, movementSpd: 10,
  rawAirSigmet: 'WSUS31 KKCI 080355\nMKCE WST 080355\nCONVECTIVE SIGMET 19E\nVALID UNTIL 0555Z\nFL AND CSTL WTRS\nFROM 30NW MIA-40SSE MIA-40ENE EYW-60NNE EYW-30NW MIA\nDMSHG AREA TS MOV FROM 24010KT. TOPS TO FL380.\n\n',
  postProcessFlag: 0, severity: 5,
  coords: [{ lon: -80.693, lat: 26.152 }, { lon: -80.013, lat: 25.187 }, { lon: -81.125, lat: 24.849 }, { lon: -81.386, lat: 25.515 }, { lon: -80.693, lat: 26.152 }],
};
const OUTLINE = REAL_SIGMET.coords;
const AIRSIGMET = [
  { ...REAL_SIGMET, rawAirSigmet: `${REAL_SIGMET.rawAirSigmet}\u0007`, injected: '<script>alert(1)</script>' },
  { icaoId: 'KKCI', airSigmetType: 'AIRMET', hazard: 'IFR', rawAirSigmet: 'AIRMET SIERRA', coords: OUTLINE },
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
  assert.equal(sigmet.topFt, 38000, 'tops FL380 as AWC gives them');
  assert.equal(sigmet.baseFt, null, 'no base given, none made up');
  assert.equal(sigmet.start, '2026-10-08T03:55:00');
  assert.equal(sigmet.end, '2026-10-08T05:55:00');
  assert.ok(sigmet.text.includes('DMSHG AREA TS') && !/[\u0000-\u0009\u000b-\u001f]/.test(sigmet.text), 'the text is kept, as plain printable text');
  assert.ok(!JSON.stringify(body).includes('script'), 'a field the relay does not know never comes through');
  assert.ok(!('seriesId' in sigmet) && !('movementDir' in sigmet), 'AWC fields outside the allowlist are left behind');
});
