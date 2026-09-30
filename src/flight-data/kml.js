// Reads a ForeFlight KML track log into a list of fixes (V6 parseKmlText,
// original/shell.html line 2318).
//
// This is V6's reader: tests/golden/flight-data-kml.test.js checks that it
// returns exactly V6's points for the example tracks and the fixtures, apart
// from the changes decided in specs/SPEC-flight-data.md, each of which the test
// names and checks:
// - C1: a blank recorded value is missing, not 0.
// - C2: the recorded bank column is read too (V6 never read it).
//
// A track file is untrusted input. Before reading, the file's size is checked,
// a KMZ (zip) is recognised, and the XML reader refuses any DOCTYPE.
import { parseXml, XmlError } from './xml.js';
import { parseIsoSeconds } from '../core/time.js';

export const MAX_FILE_BYTES = 30 * 1024 * 1024;
export const MAX_FIXES = 200_000;

/** A track file that can't be read. `code` says why; `message` is for the user. */
export class KmlError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'KmlError';
    this.code = code;
  }
}

/**
 * Reads the fixes of one track file.
 * Returns { name, fixes: [{ lon, lat, altM, t, gRecorded, pitchRecordedDeg, bankRecordedDeg }] },
 * sorted by time, or throws a KmlError.
 */
export function readKml(text, name = '') {
  if (typeof text !== 'string') throw new KmlError('not-text', `${label(name)} is not a text file.`);
  if (text.length > MAX_FILE_BYTES) {
    throw new KmlError('too-big', `${label(name)} is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB, too big for one track log.`);
  }
  if (text.startsWith('PK\u0003\u0004')) {
    throw new KmlError('kmz', `${label(name)} is a KMZ (zipped) file. Export the track from ForeFlight as KML instead.`);
  }

  let xml;
  try {
    xml = parseXml(text);
  } catch (e) {
    if (!(e instanceof XmlError)) throw e;
    throw new KmlError('xml', `${label(name)} isn't a readable KML file (${e.message}).`);
  }
  // V6 threw on any element called parsererror, which is how DOMParser reports errors.
  if (xml.getElementsByTagName('parsererror').length) {
    throw new KmlError('xml', `${label(name)} isn't a readable KML file.`);
  }

  const when = xml.getElementsByTagName('when').map(n => parseIsoSeconds(n.textContent.trim())).filter(Number.isFinite);
  const gx = xml.getElementsByTagName('gx:coord').map(n => n.textContent.trim()).filter(Boolean);
  if (gx.length > MAX_FIXES) throw tooMany(name);

  const nativeG = readRecordedColumn(xml, GFORCE);
  const nativePitch = readRecordedColumn(xml, PITCH);
  const bank = readRecordedColumn(xml, BANK);

  let fixes = [];
  if (gx.length) {
    gx.forEach((c, i) => {
      const a = c.split(/\s+/).map(Number);
      if (a.length >= 2 && Number.isFinite(a[0]) && Number.isFinite(a[1])) {
        fixes.push(fix(a, when[i] ?? i, nativeG[i] ?? null, nativePitch[i] ?? null, bank[i] ?? null));
      }
    });
  } else {
    // Plain <coordinates> lists. V6 matches <when> by the position within each
    // list (i) but the recorded columns by the running count (idx).
    for (const node of xml.getElementsByTagName('coordinates')) {
      node.textContent.trim().split(/\s+/).forEach((token, i) => {
        const a = token.split(',').map(Number);
        const idx = fixes.length;
        if (a.length >= 2 && Number.isFinite(a[0]) && Number.isFinite(a[1])) {
          fixes.push(fix(a, when[i] ?? idx, nativeG[idx] ?? nativeG[i] ?? null, nativePitch[idx] ?? nativePitch[i] ?? null,
            bank[idx] ?? bank[i] ?? null));
          if (fixes.length > MAX_FIXES) throw tooMany(name);
        }
      });
    }
  }
  fixes = fixes.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon)).sort((a, b) => a.t - b.t);
  if (fixes.length < 2) {
    throw new KmlError('no-fixes', `${label(name)} has no usable timestamped positions (at least 2 are needed).`);
  }
  return { name, fixes };
}

function fix(a, t, gRecorded, pitchRecordedDeg, bankRecordedDeg) {
  return { lon: a[0], lat: a[1], altM: Number.isFinite(a[2]) ? a[2] : 0, t, gRecorded, pitchRecordedDeg, bankRecordedDeg };
}

// Recorded sensor columns (V6 readNativeGArray line 2327, readNativePitchArray line 2345).
const GFORCE = {
  name: /(^|[^a-z])(g|gforce|g_force|load|loadfactor|load_factor|normalaccel|normal_accel)([^a-z]|$)/i,
  valid: v => Number.isFinite(v) && v > 0 && v < 12,
  tags: ['G', 'g', 'GForce', 'gForce', 'LoadFactor', 'loadFactor', 'NormalAccel', 'normalAccel'],
};
const PITCH = {
  name: /(^|[^a-z])(pitch|pitchangle|pitch_angle|attitudepitch)([^a-z]|$)/i,
  valid: v => Number.isFinite(v) && Math.abs(v) <= 90,
  tags: ['Pitch', 'pitch', 'PitchAngle', 'pitchAngle', 'AttitudePitch', 'attitudePitch'],
};

// Recorded bank, which V6 never read (C2, D47). Positive is right wing down, as
// ForeFlight records it (on #3 and #4 it follows the turn direction). Rolls past
// 90° are real, so anything within ±180° is kept.
const BANK = {
  name: /(^|[^a-z])(bank|bankangle|bank_angle|roll|rollangle|roll_angle)([^a-z]|$)/i,
  valid: v => Number.isFinite(v) && Math.abs(v) <= 180,
  tags: ['Bank', 'bank', 'BankAngle', 'bankAngle', 'Roll', 'roll'],
};

/**
 * One recorded column, aligned by fix number. The first gx:SimpleArrayData whose
 * name matches and has at least 2 valid values wins; out-of-range values become
 * null. Otherwise plain tags such as <GForce>2.1</GForce>, with invalid values
 * removed (so they no longer line up by index, as in V6).
 */
function readRecordedColumn(xml, kind) {
  for (const node of xml.getElementsByTagName('gx:SimpleArrayData')) {
    const nm = (node.getAttribute('name') || node.getAttribute('displayName') || '').toLowerCase();
    if (!kind.name.test(nm)) continue;
    if (/speed|alt|lat|lon|course|track|time/.test(nm)) continue;
    const clean = node.getElementsByTagName('gx:value').map(v => toNumber(v.textContent)).map(v => (kind.valid(v) ? v : null));
    if (clean.filter(v => v !== null).length >= 2) return clean;
  }
  for (const tag of kind.tags) {
    const vals = xml.getElementsByTagName(tag).map(v => toNumber(v.textContent)).filter(kind.valid);
    if (vals.length >= 2) return vals;
  }
  return [];
}

/**
 * A recorded value as a number. A blank value is missing (NaN), not 0 as in V6,
 * where Number('') read ForeFlight's blank pitch column as 0° (C1, D47).
 */
function toNumber(text) {
  const t = text.trim();
  return t === '' ? NaN : Number(t);
}

function tooMany(name) {
  return new KmlError('too-many-fixes', `${label(name)} has more than ${MAX_FIXES.toLocaleString('en-US')} positions, too many for one track log.`);
}

function label(name) {
  return name ? `"${String(name).slice(0, 80)}"` : 'This file';
}
