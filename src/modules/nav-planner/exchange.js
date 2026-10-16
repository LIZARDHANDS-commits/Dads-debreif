// KML and GPX in and out (docs/modules/nav-planner/spec.md, "Files"; NP-9), so a route goes to and from ForeFlight or a GPS (Dad's pick 3).
// Import reads untrusted text with flight-data's strict XML reader (no DOCTYPE, well-formed only, depth-limited) and range-checks every point
// (route.js checkPoints); a bad file is refused whole with the reason. Export writes plain XML with every name escaped. No page access.
import { parseXml, XmlError } from '../../flight-data/xml.js';
import { checkPoints, cleanName, RouteFileError, MAX_FILE_BYTES, MAX_POINTS } from './route.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const M_PER_FT = 0.3048;

/**
 * The route as KML: one line of the route and a named point per turn point. msl(i) gives turn point i's planned MSL altitude in feet, or NaN
 * when unknown (an AGL point over unknown terrain); with every altitude known the line is absolute, otherwise clamped to the ground.
 */
export function toKml(route, msl = () => NaN) {
  const alts = route.points.map((_, i) => msl(i));
  const absolute = alts.every(Number.isFinite);
  const coord = (p, i) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}${absolute ? `,${(alts[i] * M_PER_FT).toFixed(1)}` : ''}`;
  const mode = absolute ? 'absolute' : 'clampToGround';
  const points = route.points.map((p, i) => `    <Placemark><name>${esc(p.name)}</name><Point><altitudeMode>${mode}</altitudeMode><coordinates>${coord(p, i)}</coordinates></Point></Placemark>`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2">',
    '  <Document>',
    `    <name>${esc(route.name)}</name>`,
    '    <description>Low-level Navigation Planner route. Not for flight planning.</description>',
    `    <Placemark><name>${esc(route.name)}</name><LineString><altitudeMode>${mode}</altitudeMode><coordinates>${route.points.map(coord).join(' ')}</coordinates></LineString></Placemark>`,
    ...points,
    '  </Document>',
    '</kml>',
    '',
  ].join('\n');
}

/** The route as GPX 1.1: a <rte> with a <rtept> per turn point (name, and elevation in metres when the MSL altitude is known). */
export function toGpx(route, msl = () => NaN) {
  const pts = route.points.map((p, i) => {
    const alt = msl(i);
    const ele = Number.isFinite(alt) ? `<ele>${(alt * M_PER_FT).toFixed(1)}</ele>` : '';
    return `    <rtept lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}">${ele}<name>${esc(p.name)}</name></rtept>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="OODA LOOP Low-level Navigation Planner" xmlns="http://www.topografix.com/GPX/1/1">',
    '  <rte>',
    `    <name>${esc(route.name)}</name>`,
    ...pts,
    '  </rte>',
    '</gpx>',
    '',
  ].join('\n');
}

const num = (text) => (/^\s*[-+]?\d+(\.\d+)?([eE][-+]?\d+)?\s*$/.test(text ?? '') ? Number(text) : NaN);
const childText = (el, name) => el.children.find((c) => typeof c !== 'string' && c.name === name)?.textContent ?? '';

/** "lon,lat[,alt] lon,lat ..." to [{ lat, lon }]; a part that isn't numbers stays NaN, so the range check refuses it. */
function kmlCoords(text, limit) {
  const parts = String(text).trim().split(/\s+/).filter(Boolean);
  if (parts.length > limit) return { tooMany: parts.length };
  return {
    list: parts.map((p) => {
      const [lon, lat] = p.split(',');
      return { lat: num(lat), lon: num(lon) };
    }),
  };
}

/**
 * Reads a KML or GPX file's text (untrusted) into a route: { name, points } with the leg defaults, or throws RouteFileError with the reason.
 * KML: the named points in order (Placemark with a Point), else the first LineString. GPX: the first <rte>'s points, else the waypoints.
 * fileName: the picked file's name, for the messages and the route's name.
 */
export function readRouteExchange(text, fileName = 'The file') {
  const label = `"${cleanName(fileName, 'The file')}"`;
  if (typeof text !== 'string') throw new RouteFileError(`${label} is not a text file.`);
  if (text.length > MAX_FILE_BYTES) throw new RouteFileError(`${label} is larger than ${MAX_FILE_BYTES / 1024} kB, too big for a route. A flown track goes under Flown track.`);
  if (text.startsWith('PK\u0003\u0004')) throw new RouteFileError(`${label} is a KMZ (zipped) file. Export it as KML instead.`);
  let xml;
  try {
    xml = parseXml(text);
  } catch (e) {
    if (!(e instanceof XmlError)) throw e;
    throw new RouteFileError(`${label} isn't a readable KML or GPX file (${e.message}).`);
  }
  const tooMany = (n) => new RouteFileError(`${label} has ${n} points, more than a route's ${MAX_POINTS}: this looks like a flown track. Load it under Flown track instead.`);
  const trackLike = xml.getElementsByTagName('gx:Track').length || xml.getElementsByTagName('trkpt').length > MAX_POINTS;
  let name = '';
  let raw = null;

  const rte = xml.getElementsByTagName('rte')[0];
  const wpts = xml.getElementsByTagName('wpt');
  if (rte || wpts.length) {
    const list = rte ? rte.children.filter((c) => typeof c !== 'string' && c.name === 'rtept') : wpts;
    if (list.length > MAX_POINTS) throw tooMany(list.length);
    name = rte ? childText(rte, 'name') : '';
    raw = list.map((el) => ({ lat: num(el.getAttribute('lat')), lon: num(el.getAttribute('lon')), name: childText(el, 'name') }));
  } else {
    const marks = xml.getElementsByTagName('Placemark');
    const pointMarks = marks.filter((m) => m.getElementsByTagName('Point').length);
    if (pointMarks.length >= 2) {
      if (pointMarks.length > MAX_POINTS) throw tooMany(pointMarks.length);
      raw = pointMarks.map((m) => {
        const c = kmlCoords(m.getElementsByTagName('coordinates')[0]?.textContent ?? '', 1);
        return { ...(c.list?.[0] ?? { lat: NaN, lon: NaN }), name: childText(m, 'name') };
      });
    } else {
      const line = xml.getElementsByTagName('LineString')[0];
      if (line) {
        const c = kmlCoords(line.getElementsByTagName('coordinates')[0]?.textContent ?? '', MAX_POINTS);
        if (c.tooMany) throw tooMany(c.tooMany);
        raw = c.list.map((p) => ({ ...p, name: '' }));
      }
    }
    const doc = xml.getElementsByTagName('Document')[0];
    name = doc ? childText(doc, 'name') : '';
  }
  if (!raw) {
    if (trackLike) throw new RouteFileError(`${label} holds a recorded track, not a route. Load it under Flown track instead.`);
    throw new RouteFileError(`${label} has no route in it (no GPX route or waypoints, no KML points or line).`);
  }
  const points = checkPoints(raw.map((p, i) => ({ lat: p.lat, lon: p.lon, name: cleanName(p.name, `TP${i + 1}`) })), label);
  return { name: cleanName(name, cleanName(String(fileName).replace(/\.(kml|gpx)$/i, ''), 'Imported route')), points };
}
