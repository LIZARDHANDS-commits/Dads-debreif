// Move #2 anywhere in the band (Patrick 5 Oct 23:54Z; refactor PR 3 piece; decision TS-98): when #2 is in position, the
// Position control (transitions-panel.js) moves him to a spot in the band, and the sim flies it as a move: the tracker
// takes him to that spot, Lead flying straight. Since V2.108 the spot is clicked in the band's box on the picture and its
// height set on a slider (TS-104, Patrick 6 Oct 02:14Z, wording confirmed 02:54Z); the box and the click's nearest edge are here. Every move
// after it plans from where he is (chooser.js "from here", TS-94) and the judge says IN POSITION anywhere in the band,
// so "in position" is the band, not where he started (Patrick: "the 'in position' doesn't have to be 'exactly where it
// started'"). The band is the judge's (judge.js, TS-80): this file asks the judge, it keeps no second copy of the numbers.
// It changes no flight physics and no planner: the move is one tracker phase (tracker.js) at the close-in closure.
// Written by Fable (turn-sim-review/move-in-band/), folded into V2.95 (TS-98).
import { relativeTo } from './manoeuvres.js';
import { recordFlight, speedSeg, CHANGE_LIMIT_SEC } from './transitions.js';
import { judge, classify } from './judge.js';
import { FORMATIONS, FW_BAND } from './slots.js';
import { IN_POSITION } from './bands.js';
import { SWEEP_MAX_DEG } from './judge.js';
import { KIAS_LAB, KIAS_OUTSIDE_LAB } from './tuning.js';
import { onClosure } from './hand-over.js';
import { trackTwice, phase } from './tracker.js';
import { copyAircraft } from './flight.js';

/** The chooser key for the move (formation.change(MOVE_IN_BAND_KEY, { target })), like the lag roll's. */
export const MOVE_IN_BAND_KEY = 'moveInBand';

/** The formations the control works in (2-ship). Fluid has its own flying. */
export const MOVE_IN_BAND_FORMATIONS = Object.freeze(['fw', 'lab', 'echelon', 'route', 'astern']);

/** The formations with a click-to-place box (TS-104): the tactical bands. Echelon, route and line astern have none (their band is ±5 ft). */
export const PLACE_BOX_FORMATIONS = Object.freeze(['fw', 'lab']);

/**
 * The height slider for each box (TS-104, Patrick 6 Oct 02:54Z): the band's height either side of Lead (fighting wing
 * ±200 ft, line abreast ±2,000 ft, IN_POSITION, TS-80) and where it starts (fighting wing 60 ft low, line abreast level).
 * stepFt is the slider's step, an estimate for the hand.
 */
export const PLACE_HEIGHT = Object.freeze({
  fw: Object.freeze({ maxFt: IN_POSITION.fwStackFt, startFt: -60, stepFt: 10 }),
  lab: Object.freeze({ maxFt: IN_POSITION.labStackFt, startFt: 0, stepFt: 100 }),
});

const DEG = Math.PI / 180;

/**
 * The box's outline in Lead's frame, on #2's side (side +1 left, -1 right): [{ fwd, left }]. Fighting wing: the cone,
 * 500-1,000 ft from Lead, 30-60° back from his 3/9 line (SMM 12.29 para 69; FW_BAND). Line abreast: 4,000-6,000 ft out,
 * 0-10° back (SMM 16.18 para 49; IN_POSITION.labBandFt, SWEEP_MAX_DEG).
 */
export function placeBoxOutline(key, side, steps = 12) {
  const s = side >= 0 ? 1 : -1;
  if (key === 'fw') {
    const [rMin, rMax] = FW_BAND.rangeFt;
    const [dMin, dMax] = FW_BAND.sweepDeg;
    const at = (r, d) => ({ fwd: -r * Math.sin(d * DEG), left: s * r * Math.cos(d * DEG) });
    const out = [];
    for (let i = 0; i <= steps; i++) out.push(at(rMax, dMin + ((dMax - dMin) * i) / steps));
    for (let i = steps; i >= 0; i--) out.push(at(rMin, dMin + ((dMax - dMin) * i) / steps));
    return out;
  }
  if (key === 'lab') {
    const [aMin, aMax] = IN_POSITION.labBandFt;
    const t = Math.tan(SWEEP_MAX_DEG * DEG);
    return [{ fwd: 0, left: s * aMin }, { fwd: 0, left: s * aMax }, { fwd: -aMax * t, left: s * aMax }, { fwd: -aMin * t, left: s * aMin }];
  }
  return [];
}

/**
 * The nearest spot in the box to a clicked spot `p` ({ fwd, left } in Lead's frame), on #2's side: { fwd, left, atEdge }.
 * atEdge says the click was outside the box and was moved to its nearest edge (TS-104: "the card says so").
 */
export function nearestInBox(key, side, p) {
  const s = side >= 0 ? 1 : -1;
  const across = s * p.left;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  let place = { fwd: p.fwd, left: p.left };
  if (key === 'fw') {
    const [rMin, rMax] = FW_BAND.rangeFt;
    const [dMin, dMax] = FW_BAND.sweepDeg;
    const r = clamp(Math.hypot(p.fwd, p.left), rMin, rMax);
    const d = clamp(Math.atan2(-p.fwd, across) / DEG, dMin, dMax);
    place = { fwd: -r * Math.sin(d * DEG), left: s * r * Math.cos(d * DEG) };
  } else if (key === 'lab') {
    const [aMin, aMax] = IN_POSITION.labBandFt;
    const a = clamp(across, aMin, aMax);
    place = { fwd: clamp(p.fwd, -a * Math.tan(SWEEP_MAX_DEG * DEG), 0), left: s * a };
  }
  const atEdge = Math.hypot(place.fwd - p.fwd, place.left - p.left) > 0.5;
  return { ...place, atEdge };
}

/** A height-only nudge climbs or descends at about this rate (feet per second; 1,000 ft/min, an estimate for the hand: brisk, not a zoom). */
export const MOVE_ALT_RATE_FTPS = 1000 / 60;

/** #2's place now in Lead's frame: { fwd, left, alt } (alt above Lead, negative below), the control's starting point. */
export function placeNow(lead, wing) {
  const rel = relativeTo(lead, wing);
  return { fwd: rel.fwd, left: rel.left, alt: wing.altAboveFt - lead.altAboveFt };
}

/** A wingman standing at `place` in Lead's frame, Lead straight and level, for asking the judge about a spot. */
function wingAt(lead, wing, place) {
  const a = copyAircraft(wing);
  const c = Math.cos(lead.headingRad);
  const s = Math.sin(lead.headingRad);
  // Lead's frame: fwd along his heading, left to his left (manoeuvres.js relativeTo's convention, inverted here).
  a.xFt = lead.xFt + place.fwd * c - place.left * s;
  a.yFt = lead.yFt + place.fwd * s + place.left * c;
  a.altAboveFt = lead.altAboveFt + place.alt;
  a.headingRad = lead.headingRad;
  a.bankDeg = 0;
  return a;
}

/** Whether a spot in Lead's frame is inside the formation's band, by the judge (the one definition of IN POSITION). */
export function inBandAt(lead, wing, key, side, place, spacingFt) {
  return judge([{ ...lead, bankDeg: 0 }, wingAt(lead, wing, place)], { key, side }, { spacingFt }).inBand;
}

/**
 * The furthest spot toward `want` from `from` that is still in the band: `from` itself when `want` is in the band or
 * `from` is not (then the control just moves where asked, and the judge will say what it is). Bisection on the straight
 * line between them, to a foot. Returns { place, atEdge }.
 */
export function clampToBand(lead, wing, key, side, from, want, spacingFt) {
  if (inBandAt(lead, wing, key, side, want, spacingFt)) return { place: want, atEdge: false };
  if (!inBandAt(lead, wing, key, side, from, spacingFt)) return { place: want, atEdge: false };
  let lo = 0;
  let hi = 1;
  const at = (u) => ({ fwd: from.fwd + (want.fwd - from.fwd) * u, left: from.left + (want.left - from.left) * u, alt: from.alt + (want.alt - from.alt) * u });
  const span = Math.hypot(want.fwd - from.fwd, want.left - from.left, want.alt - from.alt);
  for (let i = 0; i < 30 && (hi - lo) * span > 1; i++) {
    const mid = (lo + hi) / 2;
    if (inBandAt(lead, wing, key, side, at(mid), spacingFt)) lo = mid;
    else hi = mid;
  }
  // A foot or so inside the edge, so the spot flown to (within a foot) is still judged in the band.
  return { place: at(Math.max(0, lo - Math.min(0.02, 2 / Math.max(span, 1)))), atEdge: true };
}

/**
 * The move: #2 from where he is to `target` ({ fwd, left, alt } in Lead's frame), Lead flying straight at the formation's
 * speed. planGoTo's shape (transitions.js) so chooser.js scores it like any candidate (TS-94) and formation.js flies it
 * like any change; `to` and `side` are the formation #2 is in, so the judge and the card read the formation, not the move.
 * options: { spacingFt, blockFt, formation? (else classified), side? }.
 */
export function planMoveInBand(pair, target, options = {}, t0 = 0) {
  const [lead, wing] = pair;
  const spacingFt = options.spacingFt ?? 6000;
  const blockFt = options.blockFt ?? 8000;
  const where = classify([lead, wing]);
  const key = options.formation ?? where.key;
  if (!MOVE_IN_BAND_FORMATIONS.includes(key)) return { ok: false, reason: `Move in the band works in ${MOVE_IN_BAND_FORMATIONS.map((k) => FORMATIONS[k].label.toLowerCase()).join(', ')}; #2 is ${where.key === 'other' ? 'between formations' : `in ${FORMATIONS[where.key]?.label.toLowerCase() ?? where.key}`}.` };
  const side = options.side ?? (key === 'astern' ? 0 : where.side || Math.sign(relativeTo(lead, wing).left) || -1);
  if (!target || ![target.fwd, target.left, target.alt].every(Number.isFinite)) return { ok: false, reason: 'No spot to move to.' };
  const now = placeNow(lead, wing);
  if (Math.hypot(target.fwd - now.fwd, target.left - now.left, target.alt - now.alt) < 1) return { ok: false, reason: 'Already there.' };

  const targetKias = key === 'lab' ? KIAS_LAB : KIAS_OUTSIDE_LAB;
  const leadPlan = { segments: Math.abs(lead.kias - targetKias) > 0.5 ? [speedSeg(lead.kias, targetKias, blockFt)] : [] };
  // One tracker leg at the close-in closure (the Rates setting; hand-over.js onClosure), ending settled on the spot.
  // A height change takes its own time (the tracker settles on the spot horizontally at once when only the height
  // differs): the leg is held open for it, so the profile has the seconds it needs.
  const altSec = Math.abs(target.alt - now.alt) / MOVE_ALT_RATE_FTPS;
  const phases = onClosure([phase({ fwd: target.fwd, left: target.left, alt: target.alt }, altSec > 0 ? { altSec, holdUntil: t0 + altSec } : {})], { closeIn: true });
  // The run goes on past settled to match Lead's speed and heading (the tracker's align), so #2 holds the spot afterwards;
  // until V2.108 it stopped at settled and drifted on at up to a couple of feet a second (seen in the V2.108 dry run).
  const { run, profile } = trackTwice({ refs: { [lead.id]: recordFlight(lead, leadPlan, t0) }, wing0: wing, t0, phases, blockFt, stopWhenSettled: false });
  const judged = judge([run.end.lead, run.end.wing], { key, side }, { spacingFt });
  if (!run.ok || !run.points?.length || run.durationSec > CHANGE_LIMIT_SEC) return { ok: false, reason: 'No safe move to that spot: it does not settle.' };

  const label = `${FORMATIONS[key].label}${key === 'astern' ? '' : side > 0 ? ' left' : ' right'}`;
  const dirWords = [];
  if (Math.abs(target.fwd - now.fwd) >= 1) dirWords.push(`${Math.round(Math.abs(target.fwd - now.fwd))} ft ${target.fwd > now.fwd ? 'forward' : 'back'}`);
  if (Math.abs(target.left - now.left) >= 1) dirWords.push(`${Math.round(Math.abs(target.left - now.left))} ft ${Math.abs(target.left) > Math.abs(now.left) ? 'out' : 'in'}`);
  if (Math.abs(target.alt - now.alt) >= 1) dirWords.push(`${Math.round(Math.abs(target.alt - now.alt))} ft ${target.alt > now.alt ? 'up' : 'down'}`);
  return {
    ok: true,
    label,
    flying: `${label}: #2 moving in the band`,
    from: key,
    fromSide: side,
    to: key,
    side,
    plans: {
      [lead.id]: { segments: leadPlan.segments.map((x) => ({ ...x })) },
      [wing.id]: { segments: [{ kind: 'bankTrack', points: run.points }], profile },
    },
    note: `${label}: #2 moves ${dirWords.join(', ')} in the band, Lead straight${leadPlan.segments.length ? ` at ${targetKias} KIAS` : ''}; the next move plans from there (TS-94) and anywhere in the band is IN POSITION (TS-80).`,
    rejoinKind: 'none',
    laneFwdFt: run.laneFwdFt,
    maxBankDeg: run.maxBankDeg,
    judged,
    endSec: t0 + run.durationSec,
    rejoining: false,
    moveInBand: { target, from: now },
  };
}
