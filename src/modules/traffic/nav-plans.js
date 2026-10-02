// Nav plan definitions for the Traffic Pattern Sim (Vector Guidance Migration D406, D412, R34).
//
// Each nav plan is a structured data object consumed by flight-engine.js's
// stepAircraft(). All coordinates are the single source of truth from
// docs/traffic-pattern-matrix.md. This file is pure data — no sim logic.
//
// A nav plan has:
//   waypoints[]  — ordered waypoint sequence with (x, y, alt, kias, bankDeg, g, phase, label, mode)
//   model        — default flight model: 'KIN' (kinematic) or 'NRG' (energy)
//   loop         — true if the pattern repeats (closed circuit)
//   id           — unique pattern identifier
//   color        — display color (hex)
//   display      — 'solid' (patterns) or 'dotted' (entries)
//
// A waypoint has:
//   x, y         — feet East/North of CYMJ origin
//   alt          — feet MSL
//   kias         — indicated airspeed in knots
//   bankDeg      — target bank angle at this waypoint (°)
//   g            — G-load at this waypoint
//   phase        — flight phase name (matches flight-engine phase enum)
//   label        — human-readable name
//   mode         — D412 hybrid mode: 'rails' (stable leg) or 'physics' (dynamic maneuver)
//   config       — (PFL only) aircraft configuration: 'clean', 'gearDown', 'landing'

import { FT_PER_NM } from '../../core/units.js';
import { computeWindPerch } from './route.js';

/**
 * @typedef {{ x: number, y: number, alt: number, kias: number, bankDeg: number, g: number, phase: string, label: string, mode: string, config?: string }} Waypoint
 * @typedef {{ id: string, model: string, loop: boolean, color: string, display: string, waypoints: ReadonlyArray<Readonly<Waypoint>> }} NavPlan
 * @typedef {{ pattern: string, startPoint: string, navPlanId: string|null, waypointIndex: number, x: number|null, y: number|null, alt: number|null, kias: number, headingDeg: number|null, phase: string, factory?: string }} SpawnPreset
 */

// ── CYMJ constants (shared with flight-engine.js) ─────────────────────────────
const THRESH_X  = 3104;
const THRESH_Y  = -3194;
const FIELD_ELEV = 1892;
const RWY_HDG   = 298;

// ── Waypoint helper ───────────────────────────────────────────────────────────
/** @param {Partial<Waypoint>} fields */
function wp(fields) {
  return {
    x:       fields.x       ?? 0,
    y:       fields.y       ?? 0,
    alt:     fields.alt     ?? 3500,
    kias:    fields.kias    ?? 220,
    bankDeg: fields.bankDeg ?? 0,
    g:       fields.g       ?? 1,
    phase:   fields.phase   ?? 'initial',
    label:   fields.label   ?? '',
    mode:    fields.mode    ?? 'rails',
    config:  fields.config  ?? undefined,
  };
}

// ── PAT_INNER — Overhead Break Circuit (Primary) ──────────────────────────────
// 13 waypoints (0–12). Pattern matrix §1. Color: #58a6ff (blue).
// The Perch (wp 11) is the calm-air position; at runtime, computeWindPerch()
// shifts it upwind. The caller passes the shifted perch into getNavPlan().

const PAT_INNER_WPS = [
  wp({ x:  3104,  y:  -3194,  alt: 1880,  kias: 100,  phase: 'landing',        label: 'Threshold',      mode: 'rails'   }),
  wp({ x: -4066,  y:    681,  alt: 2500,  kias: 140,  phase: 'takeoff_climb',   label: 'Departure End',  mode: 'rails'   }),
  wp({ x:-14866,  y:   7020,  alt: 3500,  kias: 180,  phase: 'climb',           label: 'Climb Out',      mode: 'rails'   }),
  wp({ x:-21000,  y:  10327,  alt: 3500,  kias: 220,  bankDeg: 60, g: 2, phase: 'crosswind', label: 'Upwind Turn', mode: 'rails' }),
  wp({ x:-28411,  y:  -1450,  alt: 3500,  kias: 220,  phase: 'crosswind',       label: 'Crosswind',      mode: 'rails'   }),
  wp({ x:-10974,  y: -12100,  alt: 3500,  kias: 220,  phase: 'downwind',        label: 'Abeam Dep End',  mode: 'rails'   }),
  wp({ x: 17150,  y: -28181,  alt: 3500,  kias: 220,  phase: 'downwind',        label: 'Downwind',       mode: 'rails'   }),
  wp({ x: 21906,  y: -19364,  alt: 3500,  kias: 220,  phase: 'initial',         label: '45° Leg',        mode: 'rails'   }),
  wp({ x: 19741,  y: -12172,  alt: 3500,  kias: 220,  phase: 'initial',         label: 'Initial',        mode: 'rails'   }),
  wp({ x:  -288,  y:  -1441,  alt: 3500,  kias: 220,  bankDeg: 60, g: 2, phase: 'break',    label: 'Break',     mode: 'physics' }),
  wp({ x: -3385,  y:  -4323,  alt: 3500,  kias: 140,  phase: 'inner_downwind',  label: 'Break Exit',     mode: 'rails'   }),
  wp({ x:  7146,  y: -10275,  alt: 3500,  kias: 120,  bankDeg: 35, g: 1.4, phase: 'final_turn', label: 'Perch', mode: 'physics' }),
  wp({ x:  9076,  y:  -6411,  alt: 2119,  kias: 110,  phase: 'final',           label: 'Window',         mode: 'rails'   }),
];

export const PAT_INNER = Object.freeze({
  id: 'PAT_INNER',
  model: 'KIN',
  loop: true,
  color: '#58a6ff',
  display: 'solid',
  waypoints: Object.freeze(PAT_INNER_WPS.map(w => Object.freeze(w))),
});

// ── PAT_SI — Straight-In Pattern ─────────────────────────────────────────────
// Shares waypoints 0–5 with PAT_INNER, then diverges. Pattern matrix §2.

const PAT_SI_WPS = [
  // Shared with PAT_INNER (wps 0–5)
  wp({ x:  3104,  y:  -3194,  alt: 1880,  kias: 100,  phase: 'landing',        label: 'Threshold',      mode: 'rails'   }),
  wp({ x: -4066,  y:    681,  alt: 2500,  kias: 140,  phase: 'takeoff_climb',   label: 'Departure End',  mode: 'rails'   }),
  wp({ x:-14866,  y:   7020,  alt: 3500,  kias: 180,  phase: 'climb',           label: 'Climb Out',      mode: 'rails'   }),
  wp({ x:-21000,  y:  10327,  alt: 3500,  kias: 220,  bankDeg: 60, g: 2, phase: 'crosswind', label: 'Upwind Turn', mode: 'rails' }),
  wp({ x:-28411,  y:  -1450,  alt: 3500,  kias: 220,  phase: 'crosswind',       label: 'Crosswind',      mode: 'rails'   }),
  wp({ x:-10974,  y: -12100,  alt: 3500,  kias: 220,  phase: 'downwind',        label: 'Abeam Dep End',  mode: 'rails'   }),
  // Straight-in divergence
  wp({ x: -3233,  y: -16592,  alt: 2700,  kias: 140,  phase: 'si_downwind',     label: 'SI Downwind',    mode: 'rails'   }),
  wp({ x: 21427,  y: -30872,  alt: 2700,  kias: 140,  bankDeg: 45, g: 1.4, phase: 'si_base', label: 'SI Base Turn', mode: 'rails' }),
  wp({ x: 26407,  y: -22172,  alt: 2700,  kias: 120,  phase: 'si_base',         label: 'SI Base',        mode: 'rails'   }),
  wp({ x: 16828,  y: -10708,  alt: 2700,  kias: 120,  phase: 'si_final',        label: 'SI Final (2 NM)', mode: 'rails'  }),
  wp({ x:  6663,  y:  -4560,  alt: 2250,  kias: 120,  phase: 'si_final',        label: 'Window (¾ NM)',  mode: 'rails'   }),
  wp({ x:  3104,  y:  -3194,  alt: 1880,  kias: 100,  phase: 'landing',         label: 'Threshold',      mode: 'rails'   }),
];

export const PAT_SI = Object.freeze({
  id: 'PAT_SI',
  model: 'KIN',
  loop: true,
  color: '#7ee787',
  display: 'solid',
  waypoints: Object.freeze(PAT_SI_WPS.map(w => Object.freeze(w))),
});

// ── ENT_OHB — Overhead Break Entry ──────────────────────────────────────────
// Pattern matrix §3. Dotted line, merges into PAT_INNER at wp 7.

const ENT_OHB_WPS = [
  wp({ x: -8694,  y: -66644,  alt: 3500,  kias: 220,  phase: 'entry',    label: 'Entry Start',  mode: 'rails' }),
  wp({ x:  4806,  y: -46304,  alt: 3500,  kias: 220,  phase: 'entry',    label: 'Entry Mid',    mode: 'rails' }),
  wp({ x: 17000,  y: -28031,  alt: 3500,  kias: 220,  phase: 'entry',    label: 'Entry Gate',   mode: 'rails' }),
  wp({ x: 21689,  y: -19427,  alt: 3500,  kias: 220,  phase: 'initial',  label: 'Merge → PAT_INNER #7', mode: 'rails' }),
];

export const ENT_OHB = Object.freeze({
  id: 'ENT_OHB',
  model: 'KIN',
  loop: false,
  color: '#bc8cff',
  display: 'dotted',
  waypoints: Object.freeze(ENT_OHB_WPS.map(w => Object.freeze(w))),
});

// ── ENT_SI — Straight-In Entry ──────────────────────────────────────────────
// Pattern matrix §4. Dotted line, merges into PAT_SI at wp 8.

const ENT_SI_WPS = [
  wp({ x: -3850,  y: -69669,  alt: 3500,  kias: 160,  phase: 'entry',    label: 'Entry Start',  mode: 'rails' }),
  wp({ x: 20000,  y: -33669,  alt: 2700,  kias: 140,  phase: 'entry',    label: 'Entry Mid',    mode: 'rails' }),
  wp({ x: 26449,  y: -21979,  alt: 2700,  kias: 120,  phase: 'entry',    label: 'Entry Gate',   mode: 'rails' }),
  wp({ x: 26407,  y: -22172,  alt: 2700,  kias: 120,  phase: 'si_base',  label: 'Merge → PAT_SI #8', mode: 'rails' }),
];

export const ENT_SI = Object.freeze({
  id: 'ENT_SI',
  model: 'KIN',
  loop: false,
  color: '#7ee787',
  display: 'dotted',
  waypoints: Object.freeze(ENT_SI_WPS.map(w => Object.freeze(w))),
});

// ── PFL_HIGH_KEY — Practice Forced Landing from High Key ────────────────────
// Pattern matrix §5. NRG model. Engine-out glide with config transitions.

const PFL_HIGH_KEY_WPS = [
  wp({ x: 3104,  y: -3194,  alt: 5000,  kias: 125,  phase: 'high_key',   label: 'High Key',   mode: 'physics', config: 'clean'    }),
  wp({ x: 7146,  y:-10275,  alt: 3700,  kias: 120,  phase: 'low_key',    label: 'Low Key',    mode: 'physics', config: 'gearDown' }),
  wp({ x: 9076,  y: -6411,  alt: 2900,  kias: 120,  phase: 'base_key',   label: 'Base Key',   mode: 'physics', config: 'landing'  }),
  wp({ x: 3104,  y: -3194,  alt: FIELD_ELEV, kias: 100, phase: 'pfl_final', label: 'Threshold', mode: 'physics', config: 'landing' }),
];

export const PFL_HIGH_KEY = Object.freeze({
  id: 'PFL_HIGH_KEY',
  model: 'NRG',
  loop: false,
  color: '#ff9bce',
  display: 'solid',
  waypoints: Object.freeze(PFL_HIGH_KEY_WPS.map(w => Object.freeze(w))),
});

// ── TAKEOFF — Runway Departure ──────────────────────────────────────────────
// Pattern matrix §6. KIN model.

const TAKEOFF_WPS = [
  wp({ x:  3104,  y: -3194,  alt: FIELD_ELEV, kias:   0, phase: 'lineup',        label: 'Lineup',        mode: 'physics' }),
  wp({ x:  1500,  y: -2250,  alt: FIELD_ELEV, kias:  85, phase: 'takeoff_roll',   label: 'Rotation',      mode: 'physics' }),
  wp({ x:   500,  y: -1660,  alt: 1900,       kias: 100, phase: 'initial_climb',  label: 'Liftoff',       mode: 'physics' }),
  wp({ x: -2000,  y:  -190,  alt: 2200,       kias: 140, phase: 'climb',          label: 'Gear Up',       mode: 'physics' }),
  wp({ x: -4066,  y:   681,  alt: 2500,       kias: 140, phase: 'climb',          label: 'Departure End', mode: 'physics' }),
];

export const TAKEOFF = Object.freeze({
  id: 'TAKEOFF',
  model: 'KIN',
  loop: false,
  color: '#58a6ff',
  display: 'solid',
  waypoints: Object.freeze(TAKEOFF_WPS.map(w => Object.freeze(w))),
});

// ── Factory: BREAKOUT ───────────────────────────────────────────────────────
// Dynamic: starts from aircraft's current position, climbs to breakout point
// 2.0 NM south of outer pattern center, then re-enters via ENT_OHB or ENT_SI.
// This is a factory because start position varies.

/**
 * Create a breakout nav plan starting from a given position.
 * @param {{ x: number, y: number, alt: number, headingDeg: number, iasKt?: number }} from
 * @returns {Readonly<NavPlan>}
 */
export function makeBreakout(from) {
  const breakoutX = -10974;   // Abeam dep end x
  const breakoutY = -12100 - (2.0 * FT_PER_NM); // 2 NM south of outer pattern
  const wps = [
    wp({ x: from.x,    y: from.y,    alt: from.alt, kias: from.iasKt ?? 140, phase: 'breakout',    label: 'Breakout Start', mode: 'physics' }),
    wp({ x: breakoutX, y: breakoutY, alt: 4500,     kias: 220,               phase: 'breakout',    label: 'Breakout Point', mode: 'physics' }),
    // Re-entry: fly to ENT_OHB entry gate
    wp({ x: -8694,     y: -66644,    alt: 3500,     kias: 220,               phase: 'entry',       label: 'Rejoin Entry',   mode: 'rails'   }),
  ];
  return Object.freeze({
    id: 'BREAKOUT',
    model: 'KIN',
    loop: false,
    color: '#ffcc66',
    display: 'dotted',
    waypoints: Object.freeze(wps.map(w => Object.freeze(w))),
  });
}

// ── Factory: GO_AROUND ──────────────────────────────────────────────────────
// Dynamic: starts from current position on final, climbs out on runway heading.

/**
 * Create a go-around nav plan starting from a given position.
 * @param {{ x: number, y: number, alt: number, iasKt?: number }} from
 * @returns {Readonly<NavPlan>}
 */
export function makeGoAround(from) {
  const wps = [
    wp({ x: from.x, y: from.y, alt: from.alt, kias: from.iasKt ?? 100, phase: 'go_around', label: 'Go-Around Start', mode: 'physics' }),
    wp({ x: -4066,  y:   681,  alt: 2500,     kias: 140,               phase: 'go_around', label: 'Departure End',   mode: 'physics' }),
    wp({ x:-14866,  y:  7020,  alt: 3500,      kias: 180,              phase: 'climb',     label: 'Climb Out',       mode: 'physics' }),
    wp({ x:-21000,  y: 10327,  alt: 3500,      kias: 220,              phase: 'crosswind', label: 'Rejoin Upwind',   mode: 'rails'   }),
  ];
  return Object.freeze({
    id: 'GO_AROUND',
    model: 'KIN',
    loop: false,
    color: '#56d4dd',
    display: 'dotted',
    waypoints: Object.freeze(wps.map(w => Object.freeze(w))),
  });
}

// ── Factory: PFL_FROM_AREA ──────────────────────────────────────────────────
// Dynamic: spawns engine-out at a user-defined position relative to CYMJ.
// Pattern matrix §7: x = dist_ft × sin(radial_rad), y = dist_ft × cos(radial_rad),
// heading = (radial + 180) % 360 (reciprocal, toward field).

/**
 * Create a PFL nav plan from a training area spawn point.
 * @param {number} radialDeg  — direction FROM airfield center (0–360°), default 90
 * @param {number} distNm     — range from airfield in NM (1–30), default 10
 * @param {number} altFt      — starting altitude MSL (3000–15000), default 8000
 * @returns {{ plan: Readonly<NavPlan>, spawn: { x: number, y: number, alt: number, headingDeg: number, iasKt: number } }}
 */
export function makePflFromArea(radialDeg = 90, distNm = 10, altFt = 8000) {
  // Clamp inputs to valid ranges
  radialDeg = ((radialDeg % 360) + 360) % 360;
  distNm    = Math.max(1, Math.min(30, distNm));
  altFt     = Math.max(3000, Math.min(15000, altFt));

  const distFt    = distNm * FT_PER_NM;
  const radialRad = (radialDeg * Math.PI) / 180;
  const spawnX    = distFt * Math.sin(radialRad);
  const spawnY    = distFt * Math.cos(radialRad);
  const headingDeg = (radialDeg + 180) % 360;  // Reciprocal: toward field

  const wps = [
    wp({ x: spawnX, y: spawnY, alt: altFt,    kias: 125, phase: 'pfl_inbound', label: 'Spawn (From Area)', mode: 'physics', config: 'clean' }),
    wp({ x: THRESH_X, y: THRESH_Y, alt: 5000, kias: 125, phase: 'high_key',   label: 'High Key',         mode: 'physics', config: 'clean' }),
    wp({ x:  7146, y: -10275,  alt: 3700,     kias: 120, phase: 'low_key',     label: 'Low Key',          mode: 'physics', config: 'gearDown' }),
    wp({ x:  9076, y:  -6411,  alt: 2900,     kias: 120, phase: 'base_key',    label: 'Base Key',         mode: 'physics', config: 'landing'  }),
    wp({ x: THRESH_X, y: THRESH_Y, alt: FIELD_ELEV, kias: 100, phase: 'pfl_final', label: 'Threshold',    mode: 'physics', config: 'landing'  }),
  ];

  const plan = Object.freeze({
    id: 'PFL_FROM_AREA',
    model: 'NRG',
    loop: false,
    color: '#ff9bce',
    display: 'solid',
    waypoints: Object.freeze(wps.map(w => Object.freeze(w))),
  });

  return {
    plan,
    spawn: { x: spawnX, y: spawnY, alt: altFt, headingDeg, iasKt: 125 },
  };
}

// ── Nav plan registry ───────────────────────────────────────────────────────

/** All static nav plans, keyed by id. */
export const NAV_PLANS = Object.freeze({
  PAT_INNER,
  PAT_SI,
  ENT_OHB,
  ENT_SI,
  PFL_HIGH_KEY,
  TAKEOFF,
});

/**
 * Look up a nav plan by id. Returns the frozen plan object or null.
 * For dynamic plans (BREAKOUT, GO_AROUND, PFL_FROM_AREA), use the factory functions directly.
 * @param {string} id
 * @returns {Readonly<NavPlan> | null}
 */
export function getNavPlan(id) {
  return NAV_PLANS[id] ?? null;
}

// ── Spawn presets (for the two-dropdown UI, Phase 4) ────────────────────────
// Each preset maps a (pattern, startPoint) pair to the spawn state.
// Pattern matrix §7.

export const SPAWN_PRESETS = Object.freeze([
  // OHB
  { pattern: 'OHB',         startPoint: 'Initial (2 NM)',  navPlanId: 'PAT_INNER', waypointIndex: 8,  x: 19741,  y: -12172, alt: 3500, kias: 220, headingDeg: RWY_HDG, phase: 'initial'        },
  { pattern: 'OHB',         startPoint: 'Break',           navPlanId: 'PAT_INNER', waypointIndex: 9,  x:  -288,  y:  -1441, alt: 3500, kias: 220, headingDeg: RWY_HDG, phase: 'break'          },
  { pattern: 'OHB',         startPoint: 'Base (ENT merge)',navPlanId: 'PAT_INNER', waypointIndex: 7,  x: 21906,  y: -19364, alt: 3500, kias: 220, headingDeg: RWY_HDG, phase: 'initial'        },
  { pattern: 'OHB',         startPoint: 'Abeam Threshold', navPlanId: 'PAT_INNER', waypointIndex: 5,  x:-10974,  y: -12100, alt: 3500, kias: 220, headingDeg: 118,     phase: 'downwind'       },
  { pattern: 'OHB',         startPoint: 'Inner Downwind',  navPlanId: 'PAT_INNER', waypointIndex: 10, x: -3385,  y:  -4323, alt: 3500, kias: 140, headingDeg: 118,     phase: 'inner_downwind' },
  { pattern: 'OHB',         startPoint: 'Perch',           navPlanId: 'PAT_INNER', waypointIndex: 11, x:  7146,  y: -10275, alt: 3500, kias: 120, headingDeg: 118,     phase: 'final_turn'     },
  { pattern: 'OHB',         startPoint: '2-Mile Final',    navPlanId: 'PAT_INNER', waypointIndex: 12, x: 15500,  y: -10200, alt: 2700, kias: 120, headingDeg: RWY_HDG, phase: 'final'          },
  { pattern: 'OHB',         startPoint: '1-Mile Final',    navPlanId: 'PAT_INNER', waypointIndex: 12, x:  9076,  y:  -6411, alt: 2119, kias: 110, headingDeg: RWY_HDG, phase: 'final'          },

  // Straight In
  { pattern: 'Straight In', startPoint: '2-Mile Final',    navPlanId: 'PAT_SI',    waypointIndex: 9,  x: 16828,  y: -10708, alt: 2700, kias: 120, headingDeg: RWY_HDG, phase: 'si_final'       },
  { pattern: 'Straight In', startPoint: '1-Mile Final',    navPlanId: 'PAT_SI',    waypointIndex: 10, x:  6663,  y:  -4560, alt: 2250, kias: 120, headingDeg: RWY_HDG, phase: 'si_final'       },
  { pattern: 'Straight In', startPoint: 'Base',            navPlanId: 'PAT_SI',    waypointIndex: 8,  x: 26407,  y: -22172, alt: 2700, kias: 140, headingDeg: RWY_HDG, phase: 'si_base'        },

  // Entry OHB
  { pattern: 'Entry OHB',   startPoint: 'Entry Gate',      navPlanId: 'ENT_OHB',   waypointIndex: 0,  x: -8694,  y: -66644, alt: 3500, kias: 220, headingDeg: RWY_HDG, phase: 'entry'          },

  // Entry SI
  { pattern: 'Entry SI',    startPoint: 'Entry Gate',      navPlanId: 'ENT_SI',    waypointIndex: 0,  x: -3850,  y: -69669, alt: 3500, kias: 160, headingDeg: RWY_HDG, phase: 'entry'          },

  // PFL
  { pattern: 'PFL',         startPoint: 'High Key',        navPlanId: 'PFL_HIGH_KEY', waypointIndex: 0, x: 3104, y:  -3194, alt: 5000, kias: 125, headingDeg: RWY_HDG, phase: 'high_key'       },
  { pattern: 'PFL',         startPoint: 'Low Key',         navPlanId: 'PFL_HIGH_KEY', waypointIndex: 1, x: 7146, y: -10275, alt: 3700, kias: 120, headingDeg: 118,     phase: 'low_key'        },
  { pattern: 'PFL',         startPoint: 'From Area',       navPlanId: null, waypointIndex: 0, x: null, y: null,  alt: null,  kias: 125, headingDeg: null, phase: 'pfl_inbound', factory: 'makePflFromArea' },

  // Takeoff
  { pattern: 'Takeoff',     startPoint: 'Runway 29L',      navPlanId: 'TAKEOFF',   waypointIndex: 0,  x: 3104,   y:  -3194, alt: FIELD_ELEV, kias: 0, headingDeg: RWY_HDG, phase: 'lineup'     },
]);

/** All distinct pattern names for dropdown 1. */
export const PATTERN_NAMES = Object.freeze([...new Set(SPAWN_PRESETS.map(p => p.pattern))]);

/**
 * Get the available start points for a given pattern name (dropdown 2).
 * @param {string} pattern
 * @returns {ReadonlyArray<string>}
 */
export function startPointsForPattern(pattern) {
  return Object.freeze(SPAWN_PRESETS.filter(p => p.pattern === pattern).map(p => p.startPoint));
}

/**
 * Find a spawn preset by pattern and start point names.
 * @param {string} pattern
 * @param {string} startPoint
 * @returns {Readonly<SpawnPreset> | undefined}
 */
export function findSpawnPreset(pattern, startPoint) {
  return SPAWN_PRESETS.find(p => p.pattern === pattern && p.startPoint === startPoint);
}
