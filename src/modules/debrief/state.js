// The debrief's plain-value pieces: layout defaults, ship colours, what the
// status line says about a flight, the flight's extent, and each track as
// lines broken at GPS gaps. No page access, so they're tested in Node.
import { GAP_S } from '../../flight-data/clean.js';
import { MAX_TRACKS } from '../../flight-data/load.js';
import { MAX_FILE_BYTES } from '../../flight-data/kml.js';
import { sampleAt, headingAt } from '../../flight-data/flight.js';

/**
 * Ship colours as in V6 (line 2104), except #4, which V6 drew near-black on a
 * dark map: white with a dark outline now (#29). Every ship also carries its
 * number, so colour is never the only signal.
 */
export const SHIP_COLORS = Object.freeze({ 1: '#0066ff', 2: '#00cc44', 3: '#ff2222', 4: '#ffffff' });
/** Ships drawn with a dark outline under their colour, so they read on any background. */
export const OUTLINED_SHIPS = Object.freeze(new Set([4]));
export const OUTLINE_COLOR = '#02060a';

/**
 * What the screen remembers in this browser (R22): which extra panels are
 * open and which map layers are on. "Reset layout" goes back to these.
 * Tools join this list as they're built; the flight itself is never kept here.
 */
export const LAYOUT_DEFAULTS = Object.freeze({
  statusDetails: false,
  flightColumn: true,
  formationColumn: true,
  moreDetail: false,
  standardsOpen: false,
  filesOpen: false,
  // Map layers, with V6's defaults: full tracks, spacing lines, grid and
  // Lead's 3/9 line on, everything else off.
  satellite: false,
  grid: true,
  trail: 'full',
  spacingLines: true,
  lead39: true,
  three39: false,
  cone: false,
  clockMarks: false,
  bubble: false,
  bubbleFt: 500, // V6's safety bubble radius
  followLead: false,
  route: '', // none, or one of V6's built-in routes by name
  routeOpacity: 80,
  // V6's embedded VNC charts: off, south, north or both, at 78 % opacity,
  // with its fine alignment (nudge in NM, scale in per cent) at rest.
  vnc: 'off',
  vncOpacity: 78,
  vncEastNm: 0,
  vncNorthNm: 0,
  vncScalePct: 100,
  // Weather at the time of the flight, all off (R22): the METAR line, from
  // the airfield nearest Lead or one picked by hand, the satellite picture and winds aloft.
  wxMetar: false,
  wxMetarField: 'nearest',
  // The GOES-West picture under the tracks: GeoColor, 70 % opaque.
  wxSatellite: false,
  wxSatelliteLayer: 'geocolor',
  wxSatelliteOpacity: 70,
  // The model wind at Lead's altitude on the Lead line: Canada's HRDPS, or HRRR
  // for flights before March 2023 or when picked.
  wxWinds: false,
  wxWindModel: 'hrdps',
  // Tools, closed at first (R22): the EM chart, with V6's automatic chart and 60 s trail.
  emOpen: false,
  emChart: 'auto',
  emTrail: true,
  // The tennis ball, with V6's settings: #2 throws at Lead, 350 kt, a 6° cone
  // (±3°), 3 s, a 250 ft hit radius, with gravity.
  tennisOpen: false,
  tennisShooter: 2,
  tennisTarget: 1,
  tennisBallKt: 350,
  tennisPitchBias: 0,
  tennisConeDeg: 6,
  tennisTofSec: 3,
  tennisRadiusFt: 250,
  tennisGravity: true,
  // The 3D view, with V6's settings (markup lines 729 to 751). "Free orbit"
  // is gone: it was the same as Centre formation (#26).
  view: '2d',
  cam3d: 'followLead',
  yaw3d: -35,
  pitch3d: 52,
  zoom3d: 70,
  altScale3d: 2,
  model3d: 't6',
  paint3d: 'harvard', // ui-kit PAINT_DEFAULT: the Moose Jaw CT-156 scheme (D138)
  planeSize3d: 260,
  attLabels3d: true,
  trailSec3d: 90,
  landscape3d: true,
  groundRef3d: true,
  datum3d: 'min',
  grid3d: true,
  sticks3d: true,
  altMarks3d: true,
});

/** The whole sortie down to about 500 ft across (SPEC-debrief, #23). */
export const MAP_MIN_SPAN_FT = 500;
export const MAP_MAX_SPAN_FT = 400_000;

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function formatDuration(s) {
  const whole = Math.round(s);
  if (whole < 60) return `${whole} s`;
  const m = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest ? `${m} min ${rest} s` : `${m} min`;
}

/** The one-line status after loading: "4 tracks loaded, 2 gaps". */
export function flightSummary(flight) {
  if (!flight) return 'No flight loaded';
  const tracks = Object.values(flight.tracks);
  const gaps = tracks.reduce((n, tr) => n + (tr.gaps?.length ?? 0), 0);
  const parts = [`${plural(tracks.length, 'track')} loaded`];
  if (gaps) parts.push(plural(gaps, 'gap'));
  if (flight.cutTracks?.length) parts.push(`${plural(flight.cutTracks.length, 'track')} trimmed to the shared time`);
  return parts.join(', ');
}

/**
 * The full status, one entry per ship in order (R11, D49 to D53): its name,
 * how many fixes were kept, its time span, fixes dropped and why, its gaps and
 * the longest, and how much was cut to the shared playback window.
 */
export function trackStatus(flight) {
  if (!flight) return [];
  return Object.values(flight.tracks)
    .sort((a, b) => a.slot - b.slot)
    .map((tr) => {
      const f = tr.fixes;
      const lines = [`${plural(f.length, 'position')} over ${formatDuration(f[f.length - 1].t - f[0].t)}`];
      const d = tr.dropped ?? {};
      const dropped = [
        d.altitude && `${d.altitude} with an impossible altitude`,
        d.position && `${d.position} off the globe`,
        d.jump && `${d.jump} GPS ${d.jump === 1 ? 'jump' : 'jumps'}`,
      ].filter(Boolean);
      if (dropped.length) lines.push(`Left out: ${dropped.join(', ')}`);
      const gaps = tr.gaps ?? [];
      if (gaps.length) {
        const longest = Math.max(...gaps.map((g) => g.toT - g.fromT));
        lines.push(`${plural(gaps.length, 'GPS gap')}, longest ${formatDuration(longest)}`);
      }
      const cut = flight.cutTracks?.find((c) => c.slot === tr.slot);
      if (cut) {
        const s = Math.round(cut.beforeS + cut.afterS);
        lines.push(`${formatDuration(s)} outside the shared time isn't played`);
      }
      return { slot: tr.slot, name: tr.name || `Track #${tr.slot}`, lines };
    });
}

/** The box around every position of every track, in map feet, or null. */
export function flightBounds(flight) {
  if (!flight) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const tr of Object.values(flight.tracks)) {
    for (const p of tr.fixes) {
      if (p.xFt < minX) minX = p.xFt;
      if (p.xFt > maxX) maxX = p.xFt;
      if (p.yFt < minY) minY = p.yFt;
      if (p.yFt > maxY) maxY = p.yFt;
    }
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

/**
 * A track as runs of fixes to draw as lines, broken wherever two fixes are
 * more than GAP_S seconds apart, so a GPS gap isn't drawn as a straight line
 * the aircraft never flew (C4, D32).
 */
export function trackRuns(fixes) {
  const runs = [];
  let run = [];
  for (let i = 0; i < fixes.length; i++) {
    if (run.length && fixes[i].t - fixes[i - 1].t > GAP_S) {
      runs.push(run);
      run = [];
    }
    run.push(fixes[i]);
  }
  if (run.length) runs.push(run);
  return runs;
}

/**
 * Chosen files in the order picked, given ships #1 upward. Refused (null) past
 * MAX_TRACKS, so nothing is quietly left out.
 */
export function assignShips(names) {
  if (names.length > MAX_TRACKS) return null;
  return names.map((name, i) => ({ name, slot: i + 1 }));
}

/**
 * Gives file `index` ship `slot`; whichever file had that ship takes the
 * chosen file's old one, so every ship stays used once.
 */
export function setShip(assignments, index, slot) {
  const current = assignments[index].slot;
  return assignments.map((a, i) => {
    if (i === index) return { ...a, slot };
    if (a.slot === slot) return { ...a, slot: current };
    return a;
  });
}

/**
 * Checks the files picked for "Load tracks" before any is read: 1 to
 * MAX_TRACKS files, none bigger than a track log can be. Returns the message
 * to show, or null. Reading a huge file just to refuse it would freeze the page.
 */
export function checkPicked(files) {
  if (!files.length) return 'No files were chosen.';
  if (files.length > MAX_TRACKS) return `Choose up to ${MAX_TRACKS} track files at once (${files.length} were chosen). Nothing was loaded.`;
  const big = files.find((f) => f.size > MAX_FILE_BYTES);
  if (big) return `"${String(big.name).slice(0, 80)}" is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB, too big for one track log. Nothing was loaded.`;
  return null;
}

/**
 * Where each ship is at time t, in ship order, for the markers on the map,
 * with its heading (radians, 0 = east) or null when it isn't moving.
 */
export function shipsAt(flight, t) {
  if (!flight) return [];
  return Object.values(flight.tracks)
    .sort((a, b) => a.slot - b.slot)
    .map((tr) => {
      const s = sampleAt(tr, t);
      return { slot: tr.slot, xFt: s.xFt, yFt: s.yFt, inGap: s.inGap, hdg: headingAt(tr, t) };
    });
}

/**
 * A track's name to show beside its ship number, without the number again:
 * the example flight's "#2 - 60DF66" shows as "#2 60DF66", not "#2 #2 - 60DF66".
 */
export function shipName(slot, name) {
  return String(name ?? '').replace(new RegExp(`^#${slot}(?!\\d)\\s*(-\\s*)?`), '');
}
