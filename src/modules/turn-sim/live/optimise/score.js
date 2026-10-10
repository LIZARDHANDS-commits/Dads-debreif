// The optimiser's score card, Phase A (optimiser plan route 1, sections 3-4; Patrick 10 Oct 2026 20:20Z: "Keep both,
// route 1 first, prototype decides"). It scores a flown move and changes nothing that flies: every term comes out in
// seconds, so the weights can be compared, and the card shows each term's seconds. Hard limits (7 G, the bubble on a
// tactical move, the lane) are rejects, never weights. Every scale below is an ESTIMATE until Patrick rules the weights.
//
// A flight is { samples, to, side, lineKias, laneLimitFt }: samples is [{ t, lead, wing }] at every step (copies of the
// aircraft as flight.js leaves them), from the press to in band; side is #2's rejoining side (+1 left, -1 right).
import { relativeTo } from '../manoeuvres.js';
import { isLeadInCanopy } from '../../../../core/canopy.js';
import { energyHeightFt, excessThrustPerWeight, iasToTasKt, T6A_LIMITS } from '../../../../core/t6-performance.js';
import { KT_TO_FTPS } from '../../../../core/units.js';
import { KIAS_OUTSIDE_LAB, TURNING_REJOIN } from '../tuning.js';
import { LANE } from '../slots.js';
import { termOn } from './modes.js';

const DEG = Math.PI / 180;

/** The score's own numbers (all estimates; Fable's optimiser plan section 4 unless marked). */
export const SCORE = Object.freeze({
  gRuleG: 5, // SMM 16.17 para 44a; TS-60: the G rule's normal aim, a soft hinge above it
  hardG: T6A_LIMITS.maxG, // the airframe's 7 G: a reject
  bubbleFt: 500, // SMM 16.17 para 44c: a reject on a tactical move only (a close rejoin ends inside it by design)
  windowFt: 250, // TS-106/TS-110: the decision window's far edge
  windowKt: [10, 20], // SMM 12.24 para 56: 10-20 KIAS over Lead entering the window
  ktScale: 10, // a hinge in knots is counted as (excess / 10 kt)^2 per second (estimate)
  bankScaleDeg: 5, // Lead's plane at the end: (excess / 5 deg)^2 seconds (estimate; the shared table's 5 deg)
  planeTolDeg: 5, // within 5 deg of Lead's bank is in his plane (shared margin table)
  captureFt: 150, // on the X: within 150 ft of the line (TRJ gauge G2)
  // Control movement: roll acceleration over the tactical set's 720 deg/s^2 (rates.js RATE_SETS.tactical.roll; Patrick 5 Oct
  // 06:07Z) and G rate over the 8 G/s onset ceiling (performance audit 5 Oct), each squared and integrated: one second
  // of both at full slam is 2 s (estimate).
  rollAccelScale: 720,
  gRateScale: 8,
  laneRangeFt: LANE.rangeFt, // the lane counts inside 1,000 ft (slots.js LANE; Patrick 5 Oct 08:04Z)
});

/** Fable's starting weights (optimiser plan section 4; Patrick's card 10 Oct 2026 21:02Z "Fable's weights"). */
export const START_WEIGHTS = Object.freeze({
  time: 1.0,
  energy: 1.0,
  control: 0.3,
  gRule: 2.0,
  window: 1.0,
  speedFloor: 1.0,
  lineSpeed: 0.3,
  xPicture: 0.5,
  blind: 1.0,
  leadPlane: 0.5,
  rates: 0.5,
});

/** The terms, in the order the card shows them, with the words and the source. */
export const TERMS = Object.freeze([
  { key: 'time', label: 'Time to in band', source: 'TS-78, TS-80' },
  { key: 'energy', label: 'Energy thrown away', source: 'TS-61, TS-96; Patrick 6 Oct 01:25Z' },
  { key: 'control', label: 'Control movement', source: 'TS-85, TS-108' },
  { key: 'gRule', label: 'G above 5', source: 'SMM 16.17 para 44a; TS-60' },
  { key: 'window', label: 'Window entry overtake', source: 'SMM 12.24 para 56; TS-106, TS-110' },
  { key: 'speedFloor', label: 'Under 200 KIAS before the window', source: 'TS-75, TS-169' },
  { key: 'lineSpeed', label: 'Under the line speed target', source: 'TS-133' },
  { key: 'xPicture', label: 'Off the X after capture', source: 'SMM 12.24 paras 56-58' },
  { key: 'blind', label: 'Lead outside the canopy', source: 'TS-124' },
  { key: 'leadPlane', label: 'Out of Lead\'s plane at the end', source: 'SMM Fig 12.11; TS-126, TS-127' },
  { key: 'rates', label: 'Rates profile', source: 'review 6.4 A (not built: the profile bounds are not in rates.js yet)' },
]);

const hinge = (x) => (x > 0 ? x * x : 0);

/**
 * Scores one flight. Returns { total, terms: { key: { raw, weight, sec } }, rejects: [words], facts }. raw is the term's
 * seconds before the weight; sec = raw x weight, or 0 when the mode leaves it out.
 */
export function scoreFlight(flight, { weights = START_WEIGHTS, mode = null } = {}) {
  const { samples, to, side = -1, lineKias = KIAS_OUTSIDE_LAB + 10, laneLimitFt = 0 } = flight;
  const raw = Object.fromEntries(TERMS.map((t) => [t.key, 0]));
  const rejects = [];
  const close = to !== 'fw';
  const lineDeg = TURNING_REJOIN.lineDeg ?? 45;
  const uF = -Math.cos(lineDeg * DEG);
  const uL = side * Math.sin(lineDeg * DEG);
  let windowSeen = false;
  let captured = false;
  let maxG = 0;
  let minRange = Infinity;
  let maxFwd = -Infinity;
  for (let i = 1; i < samples.length; i++) {
    const { t, lead: L, wing: W } = samples[i];
    const prev = samples[i - 1];
    const dt = t - prev.t;
    const rel = relativeTo(L, W);
    const range = Math.hypot(rel.fwd, rel.left);
    const g = W.g ?? 1;
    maxG = Math.max(maxG, g);
    minRange = Math.min(minRange, range);
    if (range < SCORE.laneRangeFt) maxFwd = Math.max(maxFwd, rel.fwd);
    // Energy: idle or boards seconds (the energy-height part is added at the end).
    const stage = W.power?.stage ?? W.slowStage ?? null;
    if (stage === 'idle' || stage === 'boards' || stage === 'idleBoards') raw.energy += dt;
    // Control movement: roll acceleration and G rate, each over its scale, squared.
    const rollAcc = ((W.rollRateDps ?? 0) - (prev.wing.rollRateDps ?? 0)) / dt;
    const gRate = (g - (prev.wing.g ?? 1)) / dt;
    raw.control += (hinge(Math.abs(rollAcc) / SCORE.rollAccelScale) + hinge(Math.abs(gRate) / SCORE.gRateScale)) * dt;
    raw.gRule += hinge(g - SCORE.gRuleG) * dt;
    // Lead outside the canopy (TS-124): counted inside 2,000 ft, where Lead is the reference.
    if (range < 2000 && !isLeadInCanopy(L, W)) raw.blind += dt;
    const along = rel.fwd * uF + rel.left * uL;
    const cross = -rel.fwd * uL + rel.left * uF;
    const onLine = Math.abs(cross) <= SCORE.captureFt && along > 0;
    if (!windowSeen && close && range <= SCORE.windowFt) {
      windowSeen = true;
      const over = W.kias - L.kias;
      raw.window += hinge((SCORE.windowKt[0] - over) / SCORE.ktScale) + hinge((over - SCORE.windowKt[1]) / SCORE.ktScale);
    }
    if (!windowSeen) {
      raw.speedFloor += hinge((KIAS_OUTSIDE_LAB - W.kias) / SCORE.ktScale) * dt;
      if (onLine) {
        captured = true;
        raw.lineSpeed += hinge((lineKias - W.kias) / SCORE.ktScale) * dt;
      } else if (captured) raw.xPicture += dt;
    }
  }
  const first = samples[0];
  const last = samples[samples.length - 1];
  raw.time = last.t - first.t;
  // Energy height lost against Lead's, in the seconds MAX power needs to win it back at the end speed (estimate).
  const eh = (a) => energyHeightFt(a.altAboveFt ?? 0, iasToTasKt(a.kias, 8000));
  const lost = (eh(first.wing) - eh(first.lead)) - (eh(last.wing) - eh(last.lead));
  const psFtps = Math.max(1, excessThrustPerWeight(last.wing.kias, 8000, 1) * iasToTasKt(last.wing.kias, 8000) * KT_TO_FTPS);
  if (lost > 0) raw.energy += lost / psFtps;
  raw.leadPlane = hinge((Math.abs((last.wing.bankDeg ?? 0) - (last.lead.bankDeg ?? 0)) - SCORE.planeTolDeg) / SCORE.bankScaleDeg);
  // Hard limits: rejects, never weights.
  if (maxG > SCORE.hardG + 0.05) rejects.push(`over ${SCORE.hardG} G (${maxG.toFixed(1)} G)`);
  if (!close && minRange < SCORE.bubbleFt) rejects.push(`inside the ${SCORE.bubbleFt} ft bubble (${Math.round(minRange)} ft)`);
  if (maxFwd > laneLimitFt + 0.5) rejects.push(`ahead of Lead's 3/9 line by ${Math.round(maxFwd - laneLimitFt)} ft`);
  const terms = {};
  let total = 0;
  for (const { key } of TERMS) {
    const w = weights[key] ?? 0;
    const sec = termOn(mode, key) ? raw[key] * w : 0;
    terms[key] = { raw: raw[key], weight: w, sec };
    total += sec;
  }
  return { total, terms, rejects, facts: { maxG, minRange, maxFwd, endKias: last.wing.kias } };
}
