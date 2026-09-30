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
