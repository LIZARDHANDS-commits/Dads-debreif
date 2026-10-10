// The debrief's plain-value pieces: layout defaults, ship colours, what the
// status line says about a flight, the flight's extent, and each track as
// lines broken at GPS gaps. No page access, so they're tested in Node.
import { GAP_S } from '../../flight-data/clean.js';
import { MAX_TRACKS } from '../../flight-data/load.js';
import { MAX_FILE_BYTES } from '../../flight-data/kml.js';
import { sampleAt, headingAt } from '../../flight-data/flight.js';
import { fillAt, fillSampleAt } from '../../flight-data/gap-fill.js';
import { formatZuluSeconds } from '../../core/time.js';
import { puckSummary, puckLine } from './puck.js';

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
  puckOpen: false, // the GPS puck box (DB-23)
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
  // GPS gaps drawn as a best guess in a shaded zone (DB-19, DB-20; on at load, DB-Q21). Off: the broken line as before.
  fillGaps: true,
  // Airspace and airfields round the flight, in 2D and 3D (DB-24): the SOF's airspace off at first (a clean picture; it
  // covers the screen in the overview), the airfields on (flat on the ground, little clutter). airspaceHidden: the kinds
  // hidden, as the shared filter's keys joined with commas ("moa,mtr").
  airspace: false,
  airfields: true,
  airspaceHidden: '',
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
  // Saved radar (rain and snow) and lightning from ECCC, drawn only from the pictures kept with the debrief.
  wxRadar: false,
  wxLightning: false,
  // The model wind at Lead's altitude on the Lead line: Canada's HRDPS, or HRRR
  // for flights before March 2023 or when picked.
  wxWinds: false,
  wxWindModel: 'hrdps',
  // The model wind as arrows on the 2D map at a height you choose (feet above sea level, inside the Low block): off at first, 8,000 ft.
  wxWindArrows: false,
  wxWindArrowFt: 8000,
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
  cam3d: 'followLead', // or 'formation' (Overview), 'chase' or 'cockpit' (DB-21, DB-22)
  // The Chase and Cockpit cameras: which ship (the name is the Cockpit's, DB-21) and seat, how they aim (DB-22: 'boresight',
  // 'freelook' as before, or 'padlock') and which ship Padlock keeps in view (0 = Lead for a wingman, #2 for Lead).
  // headYaw3d and headPitch3d are the head (or the orbit) turned by a drag, in degrees left and up of straight ahead.
  cockpitShip3d: 1,
  cockpitSeat3d: 'front',
  aim3d: 'freelook',
  padlockShip3d: 0,
  headYaw3d: 0,
  headPitch3d: 0,
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

/**
 * What the status says about the gap fill (DB-19): fill is { on, running, result } (result: gap-fill.js fillGaps's),
 * or null. Off, or no flight: nothing.
 */
function fillWords(fill) {
  if (!fill?.on) return '';
  if (fill.running || !fill.result) return ' (filling the gaps…)';
  const { filled, formation, ground, notFilled } = fill.result.counts;
  const est = filled + formation + ground;
  return ` (${est} filled as estimates, ${notFilled} not filled)`;
}

/** The one-line status after loading: "4 tracks loaded, 2 gaps", with the gap fill's counts when it is on. */
export function flightSummary(flight, fill = null) {
  if (!flight) return 'No flight loaded';
  const tracks = Object.values(flight.tracks);
  const gaps = tracks.reduce((n, tr) => n + (tr.gaps?.length ?? 0), 0);
  const parts = [`${plural(tracks.length, 'track')} loaded`];
  if (gaps) parts.push(plural(gaps, 'gap') + fillWords(fill));
  if (flight.cutTracks?.length) parts.push(`${plural(flight.cutTracks.length, 'track')} trimmed to the shared time`);
  const puck = puckSummary(flight); // DB-23
  if (puck) parts.push(puck);
  return parts.join(', ');
}

/**
 * The full status, one entry per ship in order (R11, D49 to D53): its name,
 * how many fixes were kept, its time span, fixes dropped and why, its gaps and
 * the longest, and how much was cut to the shared playback window. With the
 * gap fill on (fill as flightSummary's), how many of its gaps are filled, and
 * each gap left as a gap with its reason, or filled past +7 G (DB-19).
 */
export function trackStatus(flight, fill = null) {
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
      if (fill?.on && fill.result && gaps.length) lines.push(...fillLines(fill.result, tr.slot));
      const puck = puckLine(tr); // DB-23
      if (puck) lines.push(puck);
      const cut = flight.cutTracks?.find((c) => c.slot === tr.slot);
      if (cut) {
        const s = Math.round(cut.beforeS + cut.afterS);
        lines.push(`${formatDuration(s)} outside the shared time isn't played`);
      }
      return { slot: tr.slot, name: tr.name || `Track #${tr.slot}`, lines };
    });
}

// One ship's gap-fill lines for the status details: the count filled (and what pinned them), each gap not filled with
// its reason, and each fill over the T-6's +7 G (a reference, flagged, not refused).
function fillLines(result, slot) {
  const own = result.fills[slot] ?? [];
  const when = (g) => `${formatZuluSeconds(g.fromT)} (${formatDuration(g.toT - g.fromT)})`;
  const lines = [];
  if (own.length) {
    const pinned = [...new Set(own.filter((f) => f.method === 'formation').map((f) => `#${f.refSlot}`))];
    const wind = own.some((f) => f.method !== 'ground' && f.method !== 'formation' && !f.windUsed) ? ' (no wind)' : '';
    lines.push(`${plural(own.length, 'gap')} filled as estimates${pinned.length ? `, ${own.filter((f) => f.method === 'formation').length} from ${pinned.join(' and ')}'s track` : ''}${wind}`);
  }
  for (const f of own) if (f.over7) lines.push(`Filled ${when(f)}: needs ${f.maxG.toFixed(1)} G, over the T-6's +7 limit`);
  for (const g of result.notFilled) if (g.slot === slot) lines.push(`Not filled ${when(g)}: ${g.words}`);
  return lines;
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
 * with its heading (radians, 0 = east) or null when it isn't moving. With
 * `fills` (gap-fill.js fillGaps's, while the fill is on), a ship in a filled
 * gap is placed on its best guess and marked `estimated` (DB-20); it is still
 * `inGap`, so nothing measures from it.
 */
export function shipsAt(flight, t, fills = null) {
  if (!flight) return [];
  return Object.values(flight.tracks)
    .sort((a, b) => a.slot - b.slot)
    .map((tr) => {
      const s = sampleAt(tr, t);
      const fill = s.inGap ? fillAt(fills?.[tr.slot], t) : null;
      if (fill) {
        const e = fillSampleAt(fill, t);
        return { slot: tr.slot, xFt: e.xFt, yFt: e.yFt, inGap: true, estimated: true, hdg: fill.method === 'ground' ? headingAt(tr, t) : e.hdg };
      }
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
