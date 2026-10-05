// The breakout for the Traffic Sim (Traffic spec 1a items 15-18 and 22, TR-R34): ENT1's geometry and the
// breakout flown once by the circuit's simulated pilot. Positions in map feet (x east, y north), headings
// compass degrees true, speeds KIAS. The old live controller (stepBreakout) was removed on Patrick's card
// "Rebuild, then delete" (4 Oct 17:53Z).

import { compassDegFromVector } from '../../core/angles.js';
import { bankDegFromG } from '../../core/flight-math.js';
import { stallLimitG } from '../../core/t6-performance.js';
import { makePilot, bankFor, powerClimb, CIRCUIT, PILOT_DT } from './circuit.js';
import { flyRejoin } from './evade.js';

// ── The breakout, flown once (Traffic spec 1a items 15-18 and 22, TR-R34) ──────
// Patrick's card "Rebuild, then delete" (4 Oct 17:53Z): like the closed pattern, the breakout is flown once
// by the circuit's simulated pilot from where the aircraft is, and the path follower flies the result.
//   1. A climbing turn at the closed-pattern bank setting (45-60°, default 50°) toward the breakout point
//      2 NM south of the pattern, climbing to 4,500 ft at full power (circuit.js powerClimb: the climb from
//      excess thrust at the turn's real G, speeding up toward 220 KIAS as the old breakout did).
//   2. Past the breakout point, the rejoin (evade.js flyRejoin): back to a gate 2 NM before the end of the
//      line it rejoins, turning onto it and settling at the line's height and 220 KIAS. That line is ENT1's
//      leg into the Entry Gate (TR-R34: at pattern height, at least 1 NM out), or a straight-in's own first
//      leg (Patrick's card, Q7).

/** The breakout climbs to this height, ft MSL (TR-R34; Patrick, 4 Oct 01:24Z, TR-Q20). */
export const BREAKOUT_ALT_FT = 4500;
/** A breakout needed so as not to collide (the deconfliction's last-moment one) may bank up to this, degrees (Patrick, 5 Oct 00:08Z and 00:13Z); never past the stall line. */
export const BREAKOUT_TRAFFIC_BANK_DEG = 80;
/** Within this of the breakout point, the climbing turn is over and it holds its track until level, ft (as the old controller, an estimate). */
const BREAKOUT_REACHED_FT = 2500;
const MOST_SEC = 600; // a guard: no breakout climb lasts this long

/**
 * Flies the breakout from `from` = { x, y, alt, kias, headingDeg, bankDeg } in `wind`, turning at up to
 * `bankDeg` (never past the stall line: core stallLimitG, a little inside it), then rejoins leg `leg` of
 * `rejoinRoute` (see above). `turnDir` 'left' or 'right' sets which way the first turn goes (an aircraft on
 * the rejoin line turns away from the pattern: Patrick, 5 Oct 00:08Z); null takes the shorter way.
 * Returns the path [{ x, y, alt, kt, g, phase, headingDeg }]: phase 'breakout', then 'rejoin'.
 */
export function buildBreakout(from, wind, rejoinRoute, leg, bankDeg = 50, turnDir = null) {
  const env = { windFromDeg: wind?.windFromDeg ?? 360, windKt: wind?.windKt ?? 0 };
  const pilot = makePilot({ x: from.x, y: from.y, alt: from.alt, ias: from.kias, hdg: from.headingDeg, src: 0, phase: 'breakout' }, env);
  const { s } = pilot;
  s.bank = from.bankDeg ?? 0;
  pilot.record();
  let heldTrack = null;
  for (let n = 0; n < MOST_SEC / PILOT_DT; n++) {
    if (heldTrack === null && Math.hypot(BREAKOUT_PT.x - s.x, BREAKOUT_PT.y - s.y) <= BREAKOUT_REACHED_FT) heldTrack = pilot.trackDeg();
    if (heldTrack !== null && s.alt >= BREAKOUT_ALT_FT - 50) break;
    const { climb, accel } = powerClimb(pilot, CIRCUIT.patternKias, BREAKOUT_ALT_FT);
    const bankMax = Math.min(bankDeg, bankDegFromG(Math.max(1.01, 0.9 * stallLimitG(s.ias))));
    const bank = heldTrack === null
      ? bankFor(pilot.headingFor(compassDegFromVector(BREAKOUT_PT.x - s.x, BREAKOUT_PT.y - s.y)), s, bankMax, turnDir)
      : bankFor(pilot.headingFor(heldTrack), s, 30);
    pilot.step(bank, climb, accel);
  }
  pilot.mark({ phase: 'rejoin' });
  flyRejoin(pilot, rejoinRoute, leg);
  pilot.record();
  return pilot.points;
}

/** The leg of an entry that ends at its Entry Gate (ENT1's Mid to Gate), or its first leg if it has none. */
export function gateLegOf(route) {
  const i = route?.points?.findIndex((p) => p.tag === 'entry_gate' || /gate/i.test(p.label ?? '')) ?? -1;
  return i >= 1 ? i - 1 : 0;
}

// ── Ground Truth Geometry Constants ──────────────────────────────────────────
// True feet (TR-67): ENT1 runs north up the inner rejoin line, the overhead pattern's base leg 3.22 NM out from the
// 29L threshold (EFIG Fig 3-10 and p.209; Patrick 5 Oct 01:05Z "the rejoin lines define the base leg"). Its points
// match data/moose-jaw.json.
/** The breakout point: 2 NM (12,152 ft) south of Pattern 1's abeam-the-departure-end point (as the old geometry). */
export const BREAKOUT_PT = Object.freeze({ x: -9395, y: -22160 });
export const ENTRY_MID_PT = Object.freeze({ x: 6592, y: -36696 });
export const ENTRY_GATE_PT = Object.freeze({ x: 14145, y: -22820 });

// ENT1 Path vector and track heading (the base leg, 028.6° true)
const DX_ENT1 = ENTRY_GATE_PT.x - ENTRY_MID_PT.x;
const DY_ENT1 = ENTRY_GATE_PT.y - ENTRY_MID_PT.y;
const LEN_ENT1 = Math.hypot(DX_ENT1, DY_ENT1);   // 15,798 ft (2.6 NM)
export const ENT1_TRACK_DEG = (Math.atan2(DX_ENT1, DY_ENT1) * 180 / Math.PI + 360) % 360;

// Unit vectors along and perpendicular to ENT1 track
const UX_ENT1 = DX_ENT1 / LEN_ENT1;
const UY_ENT1 = DY_ENT1 / LEN_ENT1;

/** 2 NM before the Entry Gate along ENT1. */
export const REJOIN_INTERCEPT_PT = Object.freeze({ x: Math.round(ENTRY_GATE_PT.x - 2 * 6076 * UX_ENT1), y: Math.round(ENTRY_GATE_PT.y - 2 * 6076 * UY_ENT1) });

// Canonical ENT1 route definition (the same points as data/moose-jaw.json)
export const ENT1_ROUTE = Object.freeze({
  id: 'ENT1',
  name: 'OHB Rejoin',
  kind: 'entry',
  visible: true,
  color: '#bc8cff',
  attachTo: 'PAT1',
  mergeIndex: 7,
  points: Object.freeze([
    Object.freeze({ label: 'Entry Start', x: -8616.0, y: -64637.5, alt: 3500, kt: 220, g: 2, phase: 'entry', tag: 'entry_start' }),
    Object.freeze({ label: 'Entry Mid', x: 6592.2, y: -36695.9, alt: 3500, kt: 220, g: 2, phase: 'entry', tag: 'entry_mid' }),
    Object.freeze({ label: 'Entry Gate', x: 14144.5, y: -22820.1, alt: 3500, kt: 220, g: 2, phase: 'entry', tag: 'entry_gate' }),
    Object.freeze({ label: 'Merge', x: 18107.7, y: -15538.8, alt: 3500, kt: 220, g: 2, phase: 'initial', tag: 'merge' }),
  ]),
});

/**
 * Calculates distance in feet along ENT1 track from ENTRY_MID_PT.
 * @param {{x: number, y: number}} pt
 * @returns {number} Along-track distance in feet
 */
export function calcAlongTrackENT1(pt) {
  const vx = (pt.x ?? 0) - ENTRY_MID_PT.x;
  const vy = (pt.y ?? 0) - ENTRY_MID_PT.y;
  return vx * UX_ENT1 + vy * UY_ENT1;
}

/**
 * Calculates signed cross-track distance in feet from ENT1 track.
 * Positive = right of track (East/South-East), Negative = left of track (West/North-West).
 * @param {{x: number, y: number}} pt
 * @returns {number} Signed cross-track distance in feet
 */
export function calcCrossTrackENT1(pt) {
  const vx = (pt.x ?? 0) - ENTRY_MID_PT.x;
  const vy = (pt.y ?? 0) - ENTRY_MID_PT.y;
  return vx * UY_ENT1 - vy * UX_ENT1;
}
