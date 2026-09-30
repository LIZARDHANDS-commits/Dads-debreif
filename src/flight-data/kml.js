// Reads a ForeFlight KML track log into a list of fixes (V6 parseKmlText,
// original/shell.html line 2318).
//
// This is V6's reader, ported unchanged: tests/golden/flight-data-kml.test.js
// checks that it returns exactly V6's points for the example tracks and the
// fixtures. The changes decided in specs/SPEC-flight-data.md (C1 to C9) are made
// later, one at a time, each with its own test.
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
 * Returns { name, fixes: [{ lon, lat, altM, t, gRecorded, pitchRecordedDeg }] },
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

  let fixes = [];
  if (gx.length) {
    gx.forEach((c, i) => {
      const a = c.split(/\s+/).map(Number);
      if (a.length >= 2 && Number.isFinite(a[0]) && Number.isFinite(a[1])) {
        fixes.push(fix(a, when[i] ?? i, nativeG[i] ?? null, nativePitch[i] ?? null));
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
          fixes.push(fix(a, when[i] ?? idx, nativeG[idx] ?? nativeG[i] ?? null, nativePitch[idx] ?? nativePitch[i] ?? null));
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

function fix(a, t, gRecorded, pitchRecordedDeg) {
  return { lon: a[0], lat: a[1], altM: Number.isFinite(a[2]) ? a[2] : 0, t, gRecorded, pitchRecordedDeg };
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
    const clean = node.getElementsByTagName('gx:value').map(v => Number(v.textContent.trim())).map(v => (kind.valid(v) ? v : null));
    if (clean.filter(v => v !== null).length >= 2) return clean;
  }
  for (const tag of kind.tags) {
    const vals = xml.getElementsByTagName(tag).map(v => Number(v.textContent.trim())).filter(kind.valid);
    if (vals.length >= 2) return vals;
  }
  return [];
}

function tooMany(name) {
  return new KmlError('too-many-fixes', `${label(name)} has more than ${MAX_FIXES.toLocaleString('en-US')} positions, too many for one track log.`);
}

function label(name) {
  return name ? `"${String(name).slice(0, 80)}"` : 'This file';
}
