// Checks: the SOF traffic layer's model: hostile relay replies rejected, aircraft fade with age, the layer asks again
//   on a schedule, answers carry their request id.
// Serves: SOF-R17, SOF-R24 (the relay layer is on the future list, SOF-Q9; this file leaves when it is archived).
// Expected values: one real-shaped reply (adsb.lol sample through relay/lib.js, traffic-relay-reply.json); hostile
//   replies hand-written; 20 s, 10 s and 30 s are design choices.

// Tests for src/modules/sof/traffic.js: the SOF traffic layer's model, decided
// in Node (SPEC-sof, "Live traffic layer, through our own relay" and "Security").
// The relay's reply is untrusted, so half of these are hostile replies. The one
// real-shaped reply is tests/fixtures/sof/traffic-relay-reply.json: adsb.lol's
// captured sample (tests/fixtures/relay) run through relay/lib.js's trimming.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TRAFFIC_DEFAULTS, MAX_AIRCRAFT, readReply, trafficUrl, altitudeWords, opacityForAge, layerModel, layerSignature,
  initialTraffic, setTrafficOn, trafficDue, trafficRequested, trafficSucceeded as answerOk, trafficFailed as answerFailed, trafficView,
} from '../../../src/modules/sof/traffic.js';

const REPLY = JSON.parse(readFileSync(new URL('../../fixtures/sof/traffic-relay-reply.json', import.meta.url), 'utf8'));
const NOW = REPLY.now + 2000; // the reply is 2 s old

// Answers must carry the id of the request they answer. These helpers answer the request that is out
// (making one first if none is), so most tests can stay about what they are testing; the id tests use
// answerOk and answerFailed directly.
const answering = (s, now) => (s.pendingId != null ? s : trafficRequested(s, { now }));
const trafficSucceeded = (s, a) => { const r = answering(s, a.now); return answerOk(r, { ...a, id: r.pendingId }); };
const trafficFailed = (s, a) => { const r = answering(s, a.now); return answerFailed(r, { ...a, id: r.pendingId }); };
const BASE = 'https://relay.example.workers.dev';

const one = (over = {}) => ({
  hex: 'c05edf', callsign: 'ACA154', reg: 'C-GJYC', type: 'BCS3', lat: 50.85, lon: -106.72, alt: 35000, gs: 595.3, track: 91.7, squawk: '1304', seen: 0, mil: false, ...over,
});
const reply = (aircraft, over = {}) => ({ source: 'adsb.lol', now: NOW, count: aircraft.length, truncated: false, aircraft, ...over });

// ---- Reading the reply defensively ---------------------------------------------------------

test('a real trimmed reply reads through unchanged', () => {
  const r = readReply(REPLY);
  assert.equal(r.source, 'adsb.lol');
  assert.equal(r.now, REPLY.now);
  assert.equal(r.count, 5);
  assert.equal(r.truncated, false);
  assert.deepEqual(r.aircraft.map((a) => a.hex), REPLY.aircraft.map((a) => a.hex));
  assert.deepEqual(r.aircraft[0], REPLY.aircraft[0]);
});

test('a reply that is JSON text reads the same as the parsed object', () => {
  assert.deepEqual(readReply(JSON.stringify(REPLY)), readReply(REPLY));
});

test('the wrong shape reads as null, never a throw', () => {
  for (const bad of [null, undefined, 5, 'x', '{', '[]', [], {}, { aircraft: 'no' }, { aircraft: { length: 3 } }, { aircraft: null }, () => 1, Symbol('x')]) {
    assert.equal(readReply(bad), null, String(typeof bad));
  }
});

test('a reply with no time is unusable (its age would be a guess)', () => {
  for (const now of [undefined, null, 'soon', NaN, Infinity, -1, 1e20]) assert.equal(readReply({ ...reply([one()]), now }), null, String(now));
});

test('huge text is refused without parsing, even when it is otherwise a good reply', () => {
  const good = JSON.stringify({ ...reply([one()]), pad: 'x'.repeat(1.3 * 1024 * 1024) });
  assert.ok(good.length > 1.25 * 1024 * 1024);
  assert.equal(readReply(good), null);
  // The same reply without the padding reads fine, so it is the size that refuses it.
  assert.notEqual(readReply(JSON.stringify(reply([one()]))), null);
});

test('a huge list is capped, not drawn, and says it was cut', () => {
  const big = Array.from({ length: 5000 }, (_, i) => one({ hex: (0x100000 + i).toString(16) }));
  const r = readReply(reply(big));
  assert.equal(r.aircraft.length, MAX_AIRCRAFT);
  assert.equal(r.count, MAX_AIRCRAFT);
  assert.equal(r.truncated, true);
});

test('a script in a callsign, registration, type or squawk is dropped and can never reach the page', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const r = readReply(reply([one({ callsign: evil, reg: '"><script>x</script>', type: 'javascript:1', squawk: evil })]));
  const a = r.aircraft[0];
  assert.deepEqual([a.callsign, a.reg, a.type, a.squawk], [null, null, null, null]);
  assert.doesNotMatch(JSON.stringify(r), /[<>]|script|onerror|javascript/i);
});

test('text is tidied to the relay\'s own patterns: trimmed, upper case', () => {
  const a = readReply(reply([one({ callsign: ' aca154 ', reg: 'c-gjyc', type: 'bcs3', hex: 'C05EDF' })])).aircraft[0];
  assert.deepEqual([a.callsign, a.reg, a.type, a.hex], ['ACA154', 'C-GJYC', 'BCS3', 'c05edf']);
});

test('non-string text fields become null', () => {
  const a = readReply(reply([one({ callsign: 12, reg: {}, type: ['B'], squawk: 1304 })])).aircraft[0];
  assert.deepEqual([a.callsign, a.reg, a.type, a.squawk], [null, null, null, null]);
});

test('NaN, Infinity and strings as numbers never get in: the aircraft is dropped or the field is null', () => {
  for (const bad of [NaN, Infinity, -Infinity, '50', null, {}, [], true]) {
    assert.equal(readReply(reply([one({ lat: bad })])).aircraft.length, 0, `lat ${String(bad)}`);
    assert.equal(readReply(reply([one({ lon: bad })])).aircraft.length, 0, `lon ${String(bad)}`);
    const a = readReply(reply([one({ gs: bad, track: bad, seen: bad, alt: bad })])).aircraft[0];
    assert.deepEqual([a.gs, a.track, a.seen, a.alt], [null, null, null, null], `fields ${String(bad)}`);
  }
});

test('a latitude or longitude out of range drops the aircraft', () => {
  const r = readReply(reply([one({ hex: 'aaaaaa', lat: 90.5 }), one({ hex: 'bbbbbb', lat: -91 }), one({ hex: 'cccccc', lon: 181 }), one({ hex: 'dddddd', lon: -180.1 }), one({ hex: 'eeeeee', lat: 90, lon: -180 })]));
  assert.deepEqual(r.aircraft.map((a) => a.hex), ['eeeeee']);
});

test('other numbers out of range become null: speed, track, altitude, age', () => {
  const a = readReply(reply([one({ gs: 2001, track: 361, alt: 100001, seen: 3601 })])).aircraft[0];
  assert.deepEqual([a.gs, a.track, a.alt, a.seen], [null, null, null, null]);
  const b = readReply(reply([one({ gs: -1, track: -1, alt: -2001, seen: -1 })])).aircraft[0];
  assert.deepEqual([b.gs, b.track, b.alt, b.seen], [null, null, null, null]);
});

test('a track of 360 is north, 0', () => {
  assert.equal(readReply(reply([one({ track: 360 })])).aircraft[0].track, 0);
});

test('altitude is feet or exactly "ground"; other words are not an altitude', () => {
  const alts = readReply(reply([one({ hex: 'aaaaaa', alt: 'ground' }), one({ hex: 'bbbbbb', alt: 'GROUND' }), one({ hex: 'cccccc', alt: 'alt' }), one({ hex: 'dddddd', alt: 4500.4 })])).aircraft.map((a) => a.alt);
  assert.deepEqual(alts, ['ground', null, null, 4500]);
});

test('a duplicate hex keeps the first and drops the rest', () => {
  const r = readReply(reply([one({ callsign: 'FIRST' }), one({ callsign: 'SECOND' }), one({ hex: 'C05EDF', callsign: 'THIRD' })]));
  assert.equal(r.aircraft.length, 1);
  assert.equal(r.aircraft[0].callsign, 'FIRST');
});

test('a bad hex drops the aircraft', () => {
  for (const hex of [undefined, 5, '', 'c05ed', 'c05edfg', 'zzzzzz', '<b>abc', '~c05edf ']) {
    assert.equal(readReply(reply([one({ hex })])).aircraft.length, 0, String(hex));
  }
  assert.equal(readReply(reply([one({ hex: '~c05edf' })])).aircraft.length, 1); // a TIS-B target
});

test('a non-object among the aircraft is skipped without spoiling the rest', () => {
  const r = readReply(reply([null, 5, 'x', [], one()]));
  assert.equal(r.aircraft.length, 1);
});

test('the military mark is true only for exactly true', () => {
  const mil = readReply(reply([one({ hex: 'aaaaaa', mil: true }), one({ hex: 'bbbbbb', mil: 'true' }), one({ hex: 'cccccc', mil: 1 }), one({ hex: 'dddddd', mil: undefined })])).aircraft.map((a) => a.mil);
  assert.deepEqual(mil, [true, false, false, false]);
});

test('unknown extra fields, and inherited ones, are not carried', () => {
  const a = readReply(reply([{ ...one(), evil: '<script>', __proto__: { callsign: 'INHERITED' } }])).aircraft[0];
  assert.deepEqual(Object.keys(a).sort(), ['alt', 'callsign', 'gs', 'hex', 'lat', 'lon', 'mil', 'reg', 'seen', 'squawk', 'track', 'type']);
  const b = readReply(reply([Object.assign(Object.create({ hex: 'aaaaaa', lat: 1, lon: 1 }), {})]));
  assert.equal(b.aircraft.length, 0);
});

test('the source name is kept only when it is a plain host name', () => {
  assert.equal(readReply(reply([one()], { source: 'adsb.lol' })).source, 'adsb.lol');
  assert.equal(readReply(reply([one()], { source: '<b>x</b>' })).source, 'relay');
  assert.equal(readReply(reply([one()], { source: 7 })).source, 'relay');
});

test('reading never changes what was passed in', () => {
  const input = JSON.parse(JSON.stringify(REPLY));
  readReply(input);
  assert.deepEqual(input, REPLY);
});

// ---- The request address -------------------------------------------------------------------

test('the address is the relay, /traffic, and three rounded numbers', () => {
  assert.equal(trafficUrl({ baseUrl: BASE, lat: 50.3303, lon: -105.559, nm: 100 }), `${BASE}/traffic?lat=50.33&lon=-105.56&nm=100`);
});

test('nm defaults to 100, and home defaults to the default home field', () => {
  assert.equal(TRAFFIC_DEFAULTS.nm, 100);
  assert.equal(trafficUrl({ baseUrl: BASE }), `${BASE}/traffic?lat=50.33&lon=-105.56&nm=100`);
});

test('a trailing slash on the base is fine', () => {
  assert.equal(trafficUrl({ baseUrl: `${BASE}/`, lat: 1, lon: 2, nm: 50 }), `${BASE}/traffic?lat=1&lon=2&nm=50`);
});

test('no relay address set means no address, so the layer stays hidden', () => {
  assert.equal(trafficUrl({ baseUrl: null }), null);
  assert.equal(trafficUrl({ baseUrl: '' }), null);
  assert.equal(trafficUrl({ baseUrl: '   ' }), null);
  assert.equal(trafficUrl({ baseUrl: 42 }), null);
});

test('with no setting passed at all there is no address', () => {
  assert.equal(trafficUrl(), null);
  assert.equal(trafficUrl({}), null);
});

test('only an https origin is accepted (http only for local development)', () => {
  for (const baseUrl of ['http://relay.example.com', 'ftp://x', 'javascript:alert(1)', 'data:text/plain,x', '//relay.example.com', 'relay.example.com', 'https://user:pw@relay.example.com', `${BASE}/other`, `${BASE}?x=1`, `${BASE}#x`, 'https://', 'https://exa mple.com']) {
    assert.equal(trafficUrl({ baseUrl }), null, baseUrl);
  }
  assert.equal(trafficUrl({ baseUrl: 'http://localhost:8787', lat: 1, lon: 2 }), 'http://localhost:8787/traffic?lat=1&lon=2&nm=100');
  assert.equal(trafficUrl({ baseUrl: 'http://127.0.0.1:8787', lat: 1, lon: 2 }), 'http://127.0.0.1:8787/traffic?lat=1&lon=2&nm=100');
});

test('home that is not a real position gives no address, never a made-up one', () => {
  for (const bad of [NaN, Infinity, '50', null, 91, -91]) assert.equal(trafficUrl({ baseUrl: BASE, lat: bad, lon: 0 }), null, `lat ${String(bad)}`);
  for (const bad of [NaN, Infinity, '5', null, 181, -181]) assert.equal(trafficUrl({ baseUrl: BASE, lat: 0, lon: bad }), null, `lon ${String(bad)}`);
});

test('nm is a whole number from the relay\'s 5 to 150, out-of-range clamped and junk back to 100', () => {
  const nm = (v) => new URL(trafficUrl({ baseUrl: BASE, lat: 1, lon: 2, nm: v })).searchParams.get('nm');
  assert.deepEqual([nm(1), nm(5), nm(99.6), nm(150), nm(900), nm(NaN), nm('90'), nm(Infinity), nm(-3)], ['5', '5', '100', '150', '150', '100', '100', '100', '5']);
});

test('the address never reads -0 or an exponent', () => {
  assert.equal(trafficUrl({ baseUrl: BASE, lat: -0.001, lon: -0.004, nm: 5 }), `${BASE}/traffic?lat=0&lon=0&nm=5`);
  assert.equal(trafficUrl({ baseUrl: BASE, lat: 1e-9, lon: 1e-9, nm: 5 }), `${BASE}/traffic?lat=0&lon=0&nm=5`);
});

// ---- Words for altitude --------------------------------------------------------------------

test('altitude in words: GND, feet under 18,000, FL from 18,000 (Canada\'s changeover)', () => {
  assert.equal(altitudeWords('ground'), 'GND');
  assert.equal(altitudeWords(0), '0 ft');
  assert.equal(altitudeWords(2300), '2,300 ft');
  assert.equal(altitudeWords(1892), '1,900 ft');
  assert.equal(altitudeWords(17949), '17,900 ft');
  assert.equal(altitudeWords(17999), 'FL180'); // rounded to 100 ft first, then FL from 18,000
  assert.equal(altitudeWords(18000), 'FL180');
  assert.equal(altitudeWords(35000), 'FL350');
  assert.equal(altitudeWords(4500), '4,500 ft');
  assert.equal(altitudeWords(-200), '-200 ft');
  assert.equal(altitudeWords(5), '0 ft');
});

test('an unknown altitude says so', () => {
  for (const v of [null, undefined, NaN, 'x', Infinity]) assert.equal(altitudeWords(v), 'altitude unknown', String(v));
});

// ---- The stale fade ------------------------------------------------------------------------

test('fresh up to 20 s, then fades, and is gone after the limit', () => {
  assert.equal(TRAFFIC_DEFAULTS.fadeStartS, 20);
  assert.equal(opacityForAge(0), 1);
  assert.equal(opacityForAge(20), 1);
  const mid = opacityForAge(30);
  assert.ok(mid < 1 && mid > TRAFFIC_DEFAULTS.minOpacity, String(mid));
  assert.equal(opacityForAge(40), TRAFFIC_DEFAULTS.minOpacity);
  assert.equal(opacityForAge(TRAFFIC_DEFAULTS.goneAfterS), TRAFFIC_DEFAULTS.minOpacity);
  assert.equal(opacityForAge(TRAFFIC_DEFAULTS.goneAfterS + 0.1), 0);
});

test('the fade only ever goes down as an aircraft ages', () => {
  let last = 2;
  for (let s = 0; s <= 70; s += 0.5) {
    const o = opacityForAge(s);
    assert.ok(o <= last, `${s}s`);
    last = o;
  }
});

test('an age that is not a number is gone (never shown as fresh)', () => {
  for (const v of [NaN, undefined, null, 'x', Infinity]) assert.equal(opacityForAge(v), 0, String(v));
});

test('the age is the aircraft\'s own seen plus the reply\'s age', () => {
  // Reply 2 s old; this aircraft's position was already 19 s old when the relay answered: 21 s, so just past fresh.
  const model = layerModel({ reply: reply([one({ hex: 'aaaaaa', seen: 0 }), one({ hex: 'bbbbbb', seen: 19 })]), receivedAt: NOW - 2000, now: NOW });
  const [a, b] = model.aircraft;
  assert.equal(a.ageS, 2);
  assert.equal(a.opacity, 1);
  assert.equal(b.ageS, 21);
  assert.ok(b.opacity < 1);
});

test('the reply ages on its own while we wait for the next one', () => {
  const r = reply([one({ seen: 0 })]);
  const at = (secs) => layerModel({ reply: r, receivedAt: NOW, now: NOW + secs * 1000 }).aircraft[0];
  assert.equal(at(5).opacity, 1);
  assert.ok(at(30).opacity < 1);
  assert.equal(layerModel({ reply: r, receivedAt: NOW, now: NOW + 61_000 }).aircraft.length, 0);
});

test('an aircraft past the limit is gone from the model', () => {
  const model = layerModel({ reply: reply([one({ hex: 'aaaaaa', seen: 0 }), one({ hex: 'bbbbbb', seen: 61 }), one({ hex: 'cccccc', seen: 60 })]), receivedAt: NOW, now: NOW });
  assert.deepEqual(model.aircraft.map((a) => a.hex), ['aaaaaa', 'cccccc']); // exactly at the limit still shows, faintly
});

test('an unknown seen is drawn faded, never solid, and the hover says the age is unknown', () => {
  const a = layerModel({ reply: reply([one({ seen: null })]), receivedAt: NOW - 3000, now: NOW }).aircraft[0];
  assert.equal(a.ageS, 3); // only the reply's age is known
  assert.equal(a.opacity, TRAFFIC_DEFAULTS.unknownSeenOpacity);
  assert.ok(a.opacity < 1);
  assert.deepEqual(a.facts.at(-1), { label: 'Position age', value: 'unknown' });
  assert.match(a.description, /Position age unknown\./);
});

test('an unknown seen still goes when the reply is too old, and fades no less than a known one', () => {
  const old = layerModel({ reply: reply([one({ seen: null })]), receivedAt: NOW - 61_000, now: NOW });
  assert.equal(old.aircraft.length, 0);
  const stale = layerModel({ reply: reply([one({ seen: null })]), receivedAt: NOW - 50_000, now: NOW }).aircraft[0];
  assert.equal(stale.opacity, TRAFFIC_DEFAULTS.minOpacity);
});

test('a reply that arrives "from the future" is age 0, not negative', () => {
  const a = layerModel({ reply: reply([one({ seen: 0 })]), receivedAt: NOW + 60_000, now: NOW }).aircraft[0];
  assert.equal(a.ageS, 0);
});

test('when receivedAt is left out the relay\'s own clock is used', () => {
  const a = layerModel({ reply: reply([one({ seen: 0 })], { now: NOW - 4000 }), now: NOW }).aircraft[0];
  assert.equal(a.ageS, 4);
});

// ---- The layer model -----------------------------------------------------------------------

test('each aircraft has its position, symbol rotation, altitude words, speed and names', () => {
  const m = layerModel({ reply: REPLY, receivedAt: REPLY.now, now: REPLY.now });
  const a = m.aircraft.find((x) => x.hex === 'c05edf');
  assert.equal(a.lat, 50.855806);
  assert.equal(a.lon, -106.725464);
  assert.equal(a.rotationDeg, 91.73);
  assert.equal(a.hasTrack, true);
  assert.equal(a.altitudeWords, 'FL350');
  assert.equal(a.onGround, false);
  assert.equal(a.gs, 595.3);
  assert.equal(a.gsWords, '595 kt');
  assert.deepEqual([a.callsign, a.reg, a.type, a.squawk], ['ACA154', 'C-GJYC', 'BCS3', '1304']);
  assert.equal(m.count, 5);
});

test('an aircraft on the ground says GND, and one with no track has no rotation to draw', () => {
  const a = layerModel({ reply: REPLY, receivedAt: REPLY.now, now: REPLY.now }).aircraft.find((x) => x.hex === 'c1e985');
  assert.equal(a.altitudeWords, 'GND');
  assert.equal(a.onGround, true);
  assert.equal(a.hasTrack, false);
  assert.equal(a.rotationDeg, 0);
});

test('with no options the layer has labels off (SPEC-sof: labels are off by default)', () => {
  assert.equal(TRAFFIC_DEFAULTS.label, 'off');
  const m = layerModel({ reply: REPLY, receivedAt: REPLY.now, now: REPLY.now });
  assert.ok(m.aircraft.every((a) => a.label === ''));
});

test('label options: callsign, callsign + altitude, full', () => {
  const at = (label) => layerModel({ reply: reply([one()]), receivedAt: NOW, now: NOW, label }).aircraft[0].label;
  assert.equal(at('callsign'), 'ACA154');
  assert.equal(at('callsign-altitude'), 'ACA154 FL350');
  assert.equal(at('full'), 'ACA154 FL350 595 kt BCS3');
  assert.equal(at('off'), '');
});

test('an unknown label option falls back to the default, not to something showing more', () => {
  assert.equal(layerModel({ reply: reply([one()]), receivedAt: NOW, now: NOW, label: '<b>' }).aircraft[0].label, '');
  assert.equal(layerModel({ reply: reply([one()]), receivedAt: NOW, now: NOW, label: 'constructor' }).aircraft[0].label, '');
});

test('a label with no callsign falls back to the registration, then the hex', () => {
  const at = (over) => layerModel({ reply: reply([one(over)]), receivedAt: NOW, now: NOW, label: 'callsign' }).aircraft[0].label;
  assert.equal(at({ callsign: null }), 'C-GJYC');
  assert.equal(at({ callsign: null, reg: null }), 'C05EDF');
});

test('military aircraft are marked, and the mark is in words too (never colour alone)', () => {
  const a = layerModel({ reply: reply([one({ mil: true })]), receivedAt: NOW, now: NOW }).aircraft[0];
  assert.equal(a.mil, true);
  assert.match(a.description, /military/i);
  const c = layerModel({ reply: reply([one({ mil: false })]), receivedAt: NOW, now: NOW }).aircraft[0];
  assert.doesNotMatch(c.description, /military/i);
});

test('"military only" shows only the marked aircraft, off by default', () => {
  const r = reply([one({ hex: 'aaaaaa', mil: true }), one({ hex: 'bbbbbb' })]);
  assert.equal(TRAFFIC_DEFAULTS.militaryOnly, false);
  assert.equal(layerModel({ reply: r, receivedAt: NOW, now: NOW }).aircraft.length, 2);
  assert.deepEqual(layerModel({ reply: r, receivedAt: NOW, now: NOW, militaryOnly: true }).aircraft.map((a) => a.hex), ['aaaaaa']);
});

test('hover facts are in words: callsign, registration and type, altitude, speed, track, squawk, age', () => {
  const a = layerModel({ reply: reply([one({ track: 91.7, seen: 3 })]), receivedAt: NOW, now: NOW }).aircraft[0];
  assert.deepEqual(a.facts, [
    { label: 'Callsign', value: 'ACA154' },
    { label: 'Registration', value: 'C-GJYC' },
    { label: 'Type', value: 'BCS3' },
    { label: 'Altitude', value: 'FL350' },
    { label: 'Ground speed', value: '595 kt' },
    { label: 'Track', value: '092°' },
    { label: 'Squawk', value: '1304' },
    { label: 'Position age', value: '3 s' },
  ]);
  assert.equal(a.description, 'ACA154, C-GJYC, BCS3. Altitude FL350. Ground speed 595 kt. Track 092°. Squawk 1304. Position 3 s old.');
});

test('hover facts leave out what is not known, and never say "null" or "undefined"', () => {
  const a = layerModel({ reply: reply([one({ callsign: null, reg: null, type: null, gs: null, track: null, squawk: null, alt: null })]), receivedAt: NOW, now: NOW }).aircraft[0];
  assert.deepEqual(a.facts.map((f) => f.label), ['Altitude', 'Position age']);
  assert.equal(a.facts[0].value, 'altitude unknown');
  assert.doesNotMatch(a.description, /null|undefined|NaN/);
});

test('below FL180 the hover says the altitude is pressure altitude (not height above the field)', () => {
  const fact = (alt) => layerModel({ reply: reply([one({ alt })]), receivedAt: NOW, now: NOW }).aircraft[0].facts.find((f) => f.label === 'Altitude').value;
  assert.equal(fact(4500), '4,500 ft pressure altitude');
  assert.equal(fact(17000), '17,000 ft pressure altitude');
  assert.equal(fact(35000), 'FL350');
  assert.equal(fact('ground'), 'GND');
  assert.equal(fact(null), 'altitude unknown');
  const a = layerModel({ reply: reply([one({ alt: 4500 })]), receivedAt: NOW, now: NOW, label: 'callsign-altitude' }).aircraft[0];
  assert.equal(a.label, 'ACA154 4,500 ft', 'the short label stays short');
  assert.match(a.description, /Altitude 4,500 ft pressure altitude\./);
});

test('with no reply, or an unusable one, the model is empty and says so', () => {
  for (const bad of [null, undefined, {}, 'nope']) {
    const m = layerModel({ reply: bad, now: NOW });
    assert.deepEqual(m.aircraft, []);
    assert.equal(m.count, 0);
    assert.equal(m.ok, false);
  }
  assert.equal(layerModel({ reply: REPLY, receivedAt: REPLY.now, now: REPLY.now }).ok, true);
});

test('a hostile reply through the whole model gives only plain text, never markup', () => {
  const evil = '<script>alert(1)</script>';
  const m = layerModel({ reply: reply([one({ callsign: evil, reg: evil, type: evil, squawk: evil, hex: evil })]), receivedAt: NOW, now: NOW, label: 'full' });
  assert.equal(m.aircraft.length, 0);
  const m2 = layerModel({ reply: reply([one({ callsign: evil, reg: evil, type: evil, squawk: evil })]), receivedAt: NOW, now: NOW, label: 'full' });
  assert.doesNotMatch(JSON.stringify(m2), /[<>]|alert|\bscript\b/);
});

// ---- Redraw signature ----------------------------------------------------------------------

test('the signature is the same for the same picture and changes when the picture would', () => {
  const at = (over, extra = {}) => layerSignature(layerModel({ reply: reply([one(over)]), receivedAt: NOW, now: NOW, ...extra }));
  const base = at({});
  assert.equal(at({}), base);
  assert.notEqual(at({ lat: 50.86 }), base);
  assert.notEqual(at({ track: 120 }), base);
  assert.notEqual(at({ mil: true }), base);
  assert.notEqual(at({ alt: 12000 }, { label: 'callsign-altitude' }), at({}, { label: 'callsign-altitude' }));
  assert.notEqual(at({}, { label: 'callsign' }), base);
});

test('things the picture does not show do not change the signature (squawk, reg, a hair of movement)', () => {
  const at = (over) => layerSignature(layerModel({ reply: reply([one(over)]), receivedAt: NOW, now: NOW }));
  const base = at({});
  assert.equal(at({ squawk: '7000' }), base);
  assert.equal(at({ reg: 'C-XXXX' }), base);
  assert.equal(at({ lat: 50.850001 }), base);
});

test('the signature changes as an aircraft fades and when it goes, but not every second of the fresh time', () => {
  const r = reply([one({ seen: 0 })]);
  const sig = (secs) => layerSignature(layerModel({ reply: r, receivedAt: NOW, now: NOW + secs * 1000 }));
  assert.equal(sig(1), sig(10));
  assert.notEqual(sig(10), sig(30));
  assert.notEqual(sig(30), sig(70));
});

test('the signature of an empty layer is stable', () => {
  assert.equal(layerSignature(layerModel({ reply: null, now: NOW })), layerSignature(layerModel({ reply: null, now: NOW + 5000 })));
});

// ---- Refresh state -------------------------------------------------------------------------

test('a fresh state is off and asks for nothing', () => {
  const s = initialTraffic();
  assert.equal(s.on, false);
  assert.equal(trafficDue(s, NOW), false);
  assert.equal(trafficView(s, { now: NOW }).status, 'off');
});

test('turning the layer on asks at once, then every 10 s', () => {
  assert.equal(TRAFFIC_DEFAULTS.refreshMs, 10_000);
  let s = setTrafficOn(initialTraffic(), true, { now: NOW });
  assert.equal(trafficDue(s, NOW), true);
  s = trafficRequested(s, { now: NOW });
  assert.equal(trafficDue(s, NOW + 1000), false, 'no second request while one is out');
  s = trafficSucceeded(s, { reply: REPLY, now: NOW });
  assert.equal(trafficDue(s, NOW + 9_999), false);
  assert.equal(trafficDue(s, NOW + 10_000), true);
});

test('while a request is out, no other is started, unless it has been out far too long', () => {
  let s = trafficRequested(setTrafficOn(initialTraffic(), true, { now: NOW }), { now: NOW });
  assert.equal(trafficDue(s, NOW + 20_000), false);
  assert.equal(trafficDue(s, NOW + 31_000), true);
});

test('no requests while the layer is off, however long it has been', () => {
  const s = initialTraffic();
  for (const t of [0, NOW, NOW + 1e9]) assert.equal(trafficDue(s, t), false);
  const on = setTrafficOn(setTrafficOn(initialTraffic(), true, { now: NOW }), false, { now: NOW + 1 });
  assert.equal(trafficDue(on, NOW + 1e9), false);
});

test('turning the layer off drops the aircraft, and an answer that arrives late is ignored', () => {
  const out = trafficRequested(setTrafficOn(initialTraffic(), true, { now: NOW }), { now: NOW });
  const off = setTrafficOn(out, false, { now: NOW + 1000 });
  const late = answerOk(off, { reply: REPLY, now: NOW + 2000, id: out.pendingId });
  assert.deepEqual(late, off, 'the state is exactly as it was');
  assert.equal(late.on, false);
  assert.equal(late.lastGood, null);
  assert.equal(trafficView(late, { now: NOW + 2000 }).aircraft.length, 0);
  assert.equal(trafficView(late, { now: NOW + 2000 }).status, 'off');
  const f = answerFailed(off, { now: NOW + 3000, id: out.pendingId });
  assert.deepEqual(f, off);
  assert.equal(trafficView(f, { now: NOW + 3000 }).status, 'off');
});

test('an answer carries its request\'s id: a wrong, missing or old one is ignored', () => {
  const on = setTrafficOn(initialTraffic(), true, { now: NOW });
  const out = trafficRequested(on, { now: NOW });
  assert.equal(typeof out.pendingId, 'number');
  for (const id of [undefined, null, out.pendingId + 1, out.pendingId - 1, String(out.pendingId), NaN]) {
    assert.deepEqual(answerOk(out, { reply: REPLY, now: NOW, id }), out, 'ok with ' + String(id));
    assert.deepEqual(answerFailed(out, { now: NOW, id }), out, 'failed with ' + String(id));
  }
  assert.equal(answerOk(out, { reply: REPLY, now: NOW, id: out.pendingId }).lastGood.count, 5);
  assert.equal(answerFailed(out, { now: NOW, id: out.pendingId }).failed, true);
});

test('an answer with no request out is ignored', () => {
  const on = setTrafficOn(initialTraffic(), true, { now: NOW });
  assert.deepEqual(answerOk(on, { reply: REPLY, now: NOW, id: null }), on);
  assert.deepEqual(answerOk(on, { reply: REPLY, now: NOW, id: 0 }), on);
});

test('an answer from before an off and on again is ignored, even if it would have the same number', () => {
  let s = trafficRequested(setTrafficOn(initialTraffic(), true, { now: NOW }), { now: NOW });
  const oldId = s.pendingId;
  s = setTrafficOn(setTrafficOn(s, false, { now: NOW + 1000 }), true, { now: NOW + 2000 });
  s = trafficRequested(s, { now: NOW + 2000 });
  assert.notEqual(s.pendingId, oldId, 'ids are never reused');
  const after = answerOk(s, { reply: REPLY, now: NOW + 3000, id: oldId });
  assert.deepEqual(after, s);
  assert.equal(after.lastGood, null);
  assert.equal(answerOk(s, { reply: REPLY, now: NOW + 3000, id: s.pendingId }).lastGood.count, 5);
});

test('a request given up on (out over 30 s) and asked again ignores the first one\'s answer', () => {
  const first = trafficRequested(setTrafficOn(initialTraffic(), true, { now: NOW }), { now: NOW });
  const second = trafficRequested(first, { now: NOW + 31_000 });
  assert.notEqual(second.pendingId, first.pendingId);
  assert.deepEqual(answerOk(second, { reply: REPLY, now: NOW + 32_000, id: first.pendingId }), second);
});

test('setting the layer on when it is already on changes nothing', () => {
  let s = setTrafficOn(initialTraffic(), true, { now: NOW });
  s = trafficSucceeded(trafficRequested(s, { now: NOW }), { reply: REPLY, now: NOW });
  const again = setTrafficOn(s, true, { now: NOW + 5000 });
  assert.deepEqual(again, s);
});

test('a good answer shows its aircraft and says how many and how old', () => {
  let s = trafficSucceeded(trafficRequested(setTrafficOn(initialTraffic(), true, { now: NOW }), { now: NOW }), { reply: REPLY, now: NOW });
  const v = trafficView(s, { now: NOW + 4000 });
  assert.equal(v.status, 'ok');
  assert.equal(v.aircraft.length, 5);
  assert.equal(v.statusText, 'Traffic: 5 aircraft, 4 s ago');
  assert.equal(v.show, true);
});

test('one aircraft reads "1 aircraft", and a cut list says so', () => {
  const one1 = trafficSucceeded(setTrafficOn(initialTraffic(), true, { now: NOW }), { reply: reply([one()]), now: NOW });
  assert.equal(trafficView(one1, { now: NOW }).statusText, 'Traffic: 1 aircraft, 0 s ago');
  const big = Array.from({ length: 1200 }, (_, i) => one({ hex: (0x100000 + i).toString(16) }));
  const cut = trafficSucceeded(setTrafficOn(initialTraffic(), true, { now: NOW }), { reply: reply(big), now: NOW });
  assert.match(trafficView(cut, { now: NOW }).statusText, /first 1000/);
});

test('a failure says "Traffic unavailable" with the last good time, and keeps the last aircraft, fading', () => {
  let s = trafficSucceeded(trafficRequested(setTrafficOn(initialTraffic(), true, { now: NOW }), { now: NOW }), { reply: REPLY, now: NOW });
  s = trafficFailed(trafficRequested(s, { now: NOW + 10_000 }), { now: NOW + 10_500 });
  const v = trafficView(s, { now: NOW + 11_000 });
  assert.equal(v.status, 'unavailable');
  assert.equal(v.statusText, 'Traffic unavailable, last good 1842Z');
  assert.equal(v.aircraft.length, 5);
  assert.equal(v.aircraft[0].opacity, 1); // 11 s: still fresh
  const later = trafficView(s, { now: NOW + 35_000 });
  assert.ok(later.aircraft[0].opacity < 1);
  assert.equal(trafficView(s, { now: NOW + 70_000 }).aircraft.length, 0, 'gone once too old, rather than frozen');
  assert.equal(trafficView(s, { now: NOW + 70_000 }).statusText, 'Traffic unavailable, last good 1842Z');
});

test('a failure before any good answer says "Traffic unavailable" alone', () => {
  const s = trafficFailed(trafficRequested(setTrafficOn(initialTraffic(), true, { now: NOW }), { now: NOW }), { now: NOW + 100 });
  const v = trafficView(s, { now: NOW + 100 });
  assert.equal(v.statusText, 'Traffic unavailable');
  assert.deepEqual(v.aircraft, []);
});

test('after a failure it tries again in 10 s, and a good answer clears the failure', () => {
  let s = trafficFailed(trafficRequested(setTrafficOn(initialTraffic(), true, { now: NOW }), { now: NOW }), { now: NOW + 100 });
  assert.equal(trafficDue(s, NOW + 5000), false);
  assert.equal(trafficDue(s, NOW + 10_100), true);
  s = trafficSucceeded(trafficRequested(s, { now: NOW + 10_100 }), { reply: REPLY, now: NOW + 10_200 });
  assert.equal(trafficView(s, { now: NOW + 10_200 }).status, 'ok');
});

test('an answer that cannot be read counts as a failure and keeps the last good aircraft', () => {
  let s = trafficSucceeded(trafficRequested(setTrafficOn(initialTraffic(), true, { now: NOW }), { now: NOW }), { reply: REPLY, now: NOW });
  s = trafficSucceeded(trafficRequested(s, { now: NOW + 10_000 }), { reply: { hostile: true }, now: NOW + 10_100 });
  const v = trafficView(s, { now: NOW + 10_200 });
  assert.equal(v.status, 'unavailable');
  assert.equal(v.aircraft.length, 5);
});

test('an answer with no aircraft is a good answer, not a failure', () => {
  const s = trafficSucceeded(setTrafficOn(initialTraffic(), true, { now: NOW }), { reply: reply([]), now: NOW });
  const v = trafficView(s, { now: NOW });
  assert.equal(v.status, 'ok');
  assert.equal(v.statusText, 'Traffic: 0 aircraft, 0 s ago');
});

test('the state functions leave the state they were given alone', () => {
  const s0 = setTrafficOn(initialTraffic(), true, { now: NOW });
  const frozen = JSON.stringify(s0);
  Object.freeze(s0);
  trafficRequested(s0, { now: NOW });
  trafficSucceeded(s0, { reply: REPLY, now: NOW });
  trafficFailed(s0, { now: NOW });
  setTrafficOn(s0, false, { now: NOW });
  assert.equal(JSON.stringify(s0), frozen);
});

test('the view keeps the label and military-only options', () => {
  const s = trafficSucceeded(setTrafficOn(initialTraffic(), true, { now: NOW }), { reply: reply([one({ hex: 'aaaaaa', mil: true }), one({ hex: 'bbbbbb' })]), now: NOW });
  const v = trafficView(s, { now: NOW, label: 'callsign', militaryOnly: true });
  assert.deepEqual(v.aircraft.map((a) => a.label), ['ACA154']);
});

test('the view\'s signature is what to compare before drawing', () => {
  const s = trafficSucceeded(setTrafficOn(initialTraffic(), true, { now: NOW }), { reply: REPLY, now: NOW });
  const a = trafficView(s, { now: NOW + 1000 });
  const b = trafficView(s, { now: NOW + 5000 });
  assert.equal(a.signature, b.signature);
  assert.equal(a.signature, layerSignature(a));
  assert.notEqual(a.signature, trafficView(s, { now: NOW + 30_000 }).signature);
  const failed = trafficFailed(s, { now: NOW + 6000 });
  assert.notEqual(trafficView(failed, { now: NOW + 7000 }).signature, a.signature, 'the words changed, so it is drawn again');
});
