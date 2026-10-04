// Checks: what the track reader accepts and refuses: the example track, DOCTYPE, KMZ, oversize, too many fixes, deep nesting, truncated; errors name file and line.
// Serves: DB-R25, ALL-R13.
// Expected values: the example KML; the accept-and-refuse table recorded in Chromium (tests/fixtures/flight-data/xml-cases.js); hand-made abuse files; limits are design choices.

// What the track reader accepts and refuses. A track file is untrusted input
// (specs/SPEC-flight-data.md, Security), so most of these are abuse cases.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readKml, KmlError, MAX_FILE_BYTES, MAX_FIXES } from '../../../src/flight-data/kml.js';
import { parseXml, MAX_DEPTH } from '../../../src/flight-data/xml.js';
import { XML_CASES } from '../../fixtures/flight-data/xml-cases.js';

const HEAD = '<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"><Document><gx:Track>';
const TAIL = '</gx:Track></Document></kml>';
const track = n => HEAD + Array.from({ length: n }, (_, i) =>
  `<when>2026-06-02T18:00:${String(i % 60).padStart(2, '0')}Z</when><gx:coord>-105.5 50.3 ${500 + i}</gx:coord>`).join('') + TAIL;
const code = fn => { try { fn(); } catch (e) { assert.ok(e instanceof KmlError, e.message); return e.code; } return null; };

test('reads a ForeFlight example track', () => {
  const { name, fixes } = readKml(readFileSync(new URL('../../../original/assets/585aab2601b787ed.kml', import.meta.url), 'utf8'), '#1 Lead');
  assert.equal(name, '#1 Lead');
  assert.equal(fixes.length, 6166);
  // Times keep milliseconds only (Date.parse). The pitch column is blank, so there is no recorded pitch (C1, D47).
  assert.deepEqual(fixes[0], { lon: -105.555285, lat: 50.335542, altM: 571.5, t: Date.UTC(2026, 5, 2, 18, 18, 11, 433) / 1000, gRecorded: null, pitchRecordedDeg: null, bankRecordedDeg: null });
});

test('refuses a DOCTYPE, so no entity is ever expanded (billion laughs, external files)', () => {
  const laughs = '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;">]><kml>&lol2;</kml>';
  assert.equal(code(() => readKml(laughs)), 'xml');
  const external = '<?xml version="1.0"?><!DOCTYPE kml [<!ENTITY x SYSTEM "file:///etc/passwd">]><kml>&x;</kml>';
  assert.equal(code(() => readKml(external)), 'xml');
});

test('refuses a KMZ with a message saying to export KML', () => {
  const err = (() => { try { readKml('PK\u0003\u0004\u0014\u0000binary', 'flight.kmz'); } catch (e) { return e; } })();
  assert.equal(err.code, 'kmz');
  assert.match(err.message, /"flight\.kmz" is a KMZ.*export.*KML/i);
});

test('refuses a file over the size limit before reading it', () => {
  assert.equal(code(() => readKml(' '.repeat(MAX_FILE_BYTES + 1))), 'too-big');
});

test('refuses more fixes than one track log can hold', () => {
  assert.equal(code(() => readKml(track(MAX_FIXES + 1))), 'too-many-fixes');
  assert.equal(readKml(track(3)).fixes.length, 3);
  const coords = `<kml><Document><coordinates>${'-105.5,50.3,1 '.repeat(MAX_FIXES + 1)}</coordinates></Document></kml>`;
  assert.equal(code(() => readKml(coords)), 'too-many-fixes');
});

test('refuses deep nesting instead of exhausting the stack', () => {
  const deep = '<a>'.repeat(MAX_DEPTH + 1) + '</a>'.repeat(MAX_DEPTH + 1);
  assert.equal(code(() => readKml(deep)), 'xml');
  assert.doesNotThrow(() => parseXml('<a>'.repeat(MAX_DEPTH) + '</a>'.repeat(MAX_DEPTH)));
});

test('refuses files that are not text, not XML, truncated, or empty', () => {
  assert.equal(code(() => readKml(null)), 'not-text');
  assert.equal(code(() => readKml('')), 'xml');
  assert.equal(code(() => readKml('just some words')), 'xml');
  assert.equal(code(() => readKml(track(10).slice(0, -40))), 'xml');
});

test('error messages name the file and the line, and never echo file content as markup', () => {
  const err = (() => { try { readKml(`${HEAD}\n<gx:coord>1 2</when>${TAIL}`, 'my <b>flight</b>.kml'); } catch (e) { return e; } })();
  assert.match(err.message, /^"my <b>flight<\/b>\.kml" isn't a readable KML file \(line 2: closing tag <\/when> does not match <gx:coord>\)\.$/);
  // The message is plain text; the screen shows it with textContent (never innerHTML).
  const long = 'x'.repeat(500);
  const msg = (() => { try { readKml('nope', long); } catch (e) { return e.message; } })();
  assert.ok(msg.length < 200);
});

test('a track with fewer than 2 timestamped fixes says so', () => {
  assert.equal(code(() => readKml(track(1))), 'no-fixes');
  assert.equal(code(() => readKml('<kml/>')), 'no-fixes');
});

test('text, CDATA and character references read as DOM textContent does', () => {
  const doc = parseXml('<a>x<!-- no -->&lt;<![CDATA[<y>]]>&#65;&#x42;<b>c</b>\r\n</a>');
  assert.equal(doc.getElementsByTagName('a')[0].textContent, 'x<<y>ABc\n');
  const attr = parseXml('<a n="1&amp;2\t3"/>').getElementsByTagName('a')[0];
  assert.equal(attr.getAttribute('n'), '1&2 3');
  assert.equal(attr.getAttribute('missing'), null);
});

test('accepts and refuses the same small documents as the browser\'s parser (DOCTYPE aside)', () => {
  for (const [text, browserAccepts] of XML_CASES) {
    const expected = text.includes('<!DOCTYPE') ? false : browserAccepts;
    let accepted = true;
    try { parseXml(text); } catch { accepted = false; }
    assert.equal(accepted, expected, JSON.stringify(text));
  }
});

test('a blank recorded value is missing, not 0 (C1, D47)', () => {
  const cols = (g, p) => `<ExtendedData><gx:SimpleArrayData name="g_load">${g.map(v => `<gx:value>${v}</gx:value>`).join('')}</gx:SimpleArrayData>`
    + `<gx:SimpleArrayData name="pitch">${p.map(v => `<gx:value>${v}</gx:value>`).join('')}</gx:SimpleArrayData></ExtendedData>`;
  const text = track(3).replace('</Document>', cols(['1.2', ' ', '1.4'], ['', '0', '  ']) + '</Document>');
  const fixes = readKml(text).fixes;
  assert.deepEqual(fixes.map(f => f.gRecorded), [1.2, null, 1.4]);
  // Only one real pitch value is left, fewer than the 2 a column needs, so the track has no recorded pitch.
  assert.deepEqual(fixes.map(f => f.pitchRecordedDeg), [null, null, null]);
  const tags = '<kml><Document><coordinates>-105.5,50.3,1 -105.6,50.3,1</coordinates><when>2026-06-02T18:00:00Z</when><when>2026-06-02T18:00:01Z</when><Pitch> </Pitch><Pitch>4</Pitch><Pitch>5</Pitch></Document></kml>';
  assert.deepEqual(readKml(tags).fixes.map(f => f.pitchRecordedDeg), [4, 5]);
});

test('every position needs its own readable time (C5)', () => {
  const err = fn => { try { fn(); } catch (e) { return e; } return null; };
  // An unreadable time is refused, saying which one.
  const bad = track(3).replace('2026-06-02T18:00:01Z', 'yesterday');
  assert.equal(err(() => readKml(bad, 'lead.kml')).code, 'times');
  assert.match(err(() => readKml(bad, 'lead.kml')).message, /"lead\.kml".*"yesterday", time 2/);
  // More or fewer times than positions is refused, with both counts.
  const fewer = track(3).replace(/<when>[^<]*<\/when>/, '');
  assert.match(err(() => readKml(fewer, 'x')).message, /3 positions but 2 times/);
  const more = track(3).replace(TAIL, '<when>2026-06-02T18:00:09Z</when>' + TAIL);
  assert.equal(code(() => readKml(more)), 'times');
  // A plain line with no times at all, which V6 put in 1970.
  assert.equal(code(() => readKml('<kml><Document><coordinates>-105.5,50.3,1 -105.6,50.4,1</coordinates></Document></kml>')), 'times');
  // An empty <gx:coord> is not a position, so it needs no time (as in V6).
  assert.equal(readKml(track(3).replace(TAIL, '<gx:coord> </gx:coord>' + TAIL)).fixes.length, 3);
});

test('plain coordinate lists take their times in order across all the lists (C5)', () => {
  const when = [0, 1, 2, 3].map(s => `<when>2026-06-02T18:00:0${s}Z</when>`).join('');
  const lists = '<coordinates>-105.0,50,1 -105.1,50,1</coordinates><coordinates>-105.2,50,1 -105.3,50,1</coordinates>';
  const { fixes } = readKml(`<kml><Document>${when}${lists}</Document></kml>`);
  assert.deepEqual(fixes.map(f => [f.lon, f.t - fixes[0].t]), [[-105, 0], [-105.1, 1], [-105.2, 2], [-105.3, 3]]);
});

// Hostile files far under the size limit must still be read or refused, with the message. How long that takes
// is not checked here (T2): speed on a slow machine is a sign-off look, not a test that can fail on a busy computer.
const refuse = (what, fn) => fn();

test('many namespace declarations are read without error', () => {
  const decl = Array.from({ length: 5000 }, (_, i) => ` xmlns:p${i}="u"`).join('');
  refuse('5,000 prefixes and 100,000 elements', () => parseXml(`<r${decl}>${'<a/>'.repeat(100_000)}</r>`));
});

test('a flood of "&" is refused at the first bad one', () => {
  refuse('29 MB of bare &', () => assert.equal(code(() => readKml(`<a>${'&'.repeat(29 * 1024 * 1024)}</a>`)), 'xml'));
  // The refusal is in plain words and names the file.
  assert.throws(() => readKml(`<a>${'&'.repeat(1000)}</a>`, 'flood.kml'), { name: 'KmlError', message: /"flood\.kml"/ });
});

test('only the five XML entities are understood, not names every JavaScript object has', () => {
  for (const name of ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty']) {
    assert.equal(code(() => readKml(`<a>x&${name};y</a>`)), 'xml', name);
  }
  assert.equal(parseXml('<a>&lt;&gt;&amp;&quot;&apos;</a>').getElementsByTagName('a')[0].textContent, '<>&"\'');
});

test('track elements nested inside each other are refused', () => {
  const nested = (open, close, inner, n) => open.repeat(n) + inner + close.repeat(n);
  refuse('250 nested <when>', () => assert.equal(code(() => readKml(`<kml>${nested('<when>', '</when>', 'x'.repeat(29 * 1024 * 1024), 250)}</kml>`)), 'xml'));
  const values = '<gx:value>99</gx:value>'.repeat(400_000);
  refuse('250 nested columns', () => assert.equal(code(() => readKml(
    `<kml xmlns:gx="g">${nested('<gx:SimpleArrayData name="g">', '</gx:SimpleArrayData>', values, 250)}</kml>`)), 'xml'));
  for (const inner of ['<when><b/>2026-06-02T18:00:00Z</when>', '<gx:coord><b/>1 2 3</gx:coord>', '<coordinates><b/>1,2</coordinates>']) {
    assert.equal(code(() => readKml(`<kml xmlns:gx="g">${inner}</kml>`)), 'xml', inner);
  }
});

test('a time must be a full ISO 8601 date and time, not anything Date.parse accepts (C5)', () => {
  for (const bad of ['1', 'x 1', '2026', '0', '2026-06-02', 'June 2 2026 18:00']) {
    assert.equal(code(() => readKml(track(3).replace('2026-06-02T18:00:01Z', bad))), 'times', bad);
  }
  for (const good of ['2026-06-02T18:00:01Z', '2026-06-02T18:00:01.25Z', '2026-06-02T12:00:01-06:00', '2026-06-02T18:00:01+00:00']) {
    assert.equal(readKml(track(3).replace('2026-06-02T18:00:01Z', good)).fixes.length, 3, good);
  }
});

test('a recorded column given as plain tags needs at least 2 good values, as in V6', () => {
  assert.equal(readKml(track(3).replace(TAIL, '<GForce>1.5</GForce>' + TAIL)).fixes[0].gRecorded, null);
  assert.equal(readKml(track(3).replace(TAIL, '<GForce>1.5</GForce><GForce>2</GForce>' + TAIL)).fixes[0].gRecorded, 1.5);
});

test('an empty coordinate list holds no positions, so it needs no time (C5)', () => {
  const when = [0, 1].map(s => `<when>2026-06-02T18:00:0${s}Z</when>`).join('');
  const kml = `<kml><Document>${when}<coordinates>-105.0,50,1 -105.1,50,1</coordinates><coordinates>  </coordinates></Document></kml>`;
  assert.equal(readKml(kml).fixes.length, 2);
});

test('a bare "&" is reported as one, even with a reference after it', () => {
  const e = (() => { try { parseXml('<a>x &b &amp; y</a>'); } catch (err) { return err; } return null; })();
  assert.match(e.reason, /"&" must be written as &amp;/);
  assert.throws(() => parseXml('<a>&#65x</a>'), { name: 'XmlError' });
});
