// Formation standards: is each wingman where he should be?
//
// Two V6 copies judge the same standards: the debrief (classifyKmlError,
// classifyLeadDesired and kmlStandardsSummary, lines 3051 to 3117), where
// they are settings, and Turn Sim (classifyFormationError, line 1881), where
// the same numbers are written into the code. Both are ported here unchanged.
// V6_STANDARDS holds V6's values, which the golden tests pin. DEFAULT_STANDARDS
// is the default preset (R18): the SMM's numbers, per D114, D115 and D116.
//
// Distances are in feet. Positions are { x, y } and headings follow the
// angles.js convention. "Fore/aft" is measured along Lead's heading from
// Lead's 3/9 line (+ ahead); "interval" is measured across it. V6 calls the
// across-vector `right`, but it is Lead's heading turned 90° counter-clockwise,
// which is Lead's LEFT; here it is named `left`, and lateralFromLead is + to
// Lead's left. Intervals are unsigned, so no label depends on this.
//
// One change from V6 (D78, #21): with both the spread and the offset standard
// on, the offset standard alone judges #3's fore/aft and the spread standard
// its interval. V6 judged #3's fore/aft by both, so #3 was never "ON
// PARAMETERS". Kept from V6: an aircraft no standard applies to is still
// labelled "ON PARAMETERS".
//
// The spread standard's fore/aft check comes in two kinds. V6's (foreAftTolFt)
// allows ± that many feet of Lead's 3/9 line. The SMM's line abreast (D116,
// SMM 16.18 para 49) allows sweepMinDeg (0) to sweepMaxDeg (10) degrees of
// sweep behind the 3/9 line, measured from the aircraft the interval is
// measured from: less is FORE, more is AFT. A standards object with a number
// in spread.sweepMaxDeg gets the sweep check; one without keeps V6's.
//
// The lead standard's speed comes in two kinds too. V6's is one targetKt. The
// SMM's (D115: 220 KIAS in the low block, 200 in the mid block, Gen Book p.12)
// picks lowTargetKt at or below lowBlockTopFt and midTargetKt above it; a lead
// standard with a number in lead.lowTargetKt gets it.
import { radToDeg } from './angles.js';

/** V6's standards: the debrief's default settings, and Turn Sim's fixed numbers. */
export const V6_STANDARDS = Object.freeze({
  spread: Object.freeze({ on: true, minFt: 4000, maxFt: 6000, foreAftTolFt: 250 }),
  offset: Object.freeze({ on: true, aftTargetFt: 8000, aftTolFt: 1000 }),
  lead: Object.freeze({ on: true, targetKt: 200, speedTolKt: 10, targetG: 1.0, gTol: 0.2 }),
});

/**
 * The default standards, from the SMM (Patrick, 2026-09-30 05:37Z): what app.standards starts
 * with and resets to.
 * - spread: 4,000-6,000 ft with 0-10° of sweep (D116, SMM 16.18 para 49), not V6's ± 250 ft
 * - offset: #3 7,000 ± 1,000 ft back, so 6,000-8,000 ft passes (D114, SMM 16.41 para 109); V6 8,000
 * - lead: 220 KIAS in the low block, 200 in the mid block (D115); the blocks meet at 10,250 ft,
 *   between the low block's 10,000 ft top and the mid block's 10,500 ft floor (Gen Book p.12)
 */
export const DEFAULT_STANDARDS = Object.freeze({
  spread: Object.freeze({ on: true, minFt: 4000, maxFt: 6000, sweepMinDeg: 0, sweepMaxDeg: 10 }),
  offset: Object.freeze({ on: true, aftTargetFt: 7000, aftTolFt: 1000 }),
  lead: Object.freeze({ on: true, lowTargetKt: 220, midTargetKt: 200, lowBlockTopFt: 10250, speedTolKt: 10, targetG: 1.0, gTol: 0.2 }),
});

/** #4 measures its interval from #3 when #3 is more than this far out on the same side (both copies). */
const SAME_SIDE_FT = 500;
/** In Turn Sim's offset box, #3 is WIDE when more than this outside the slot between Lead and #2. */
const SLOT_MARGIN_FT = 500;

/**
 * The spread standard's fore/aft label, or null when within it.
 *
 * @param {object} spread     the spread standard
 * @param {number} foreAftFt  along Lead's heading from Lead's 3/9 line (+ ahead): V6's check
 * @param {number} sweepDeg   degrees behind the reference's 3/9 line (+ aft): the sweep check
 */
function spreadForeAft(spread, foreAftFt, sweepDeg) {
  if (Number.isFinite(spread.sweepMaxDeg)) {
    if (sweepDeg < (Number.isFinite(spread.sweepMinDeg) ? spread.sweepMinDeg : 0)) return 'FORE';
    if (sweepDeg > spread.sweepMaxDeg) return 'AFT';
    return null;
  }
  if (foreAftFt > spread.foreAftTolFt) return 'FORE';
  if (foreAftFt < -spread.foreAftTolFt) return 'AFT';
  return null;
}

/** Degrees p is swept behind ref's 3/9 line (+ aft), seen from ref across the interval. */
function sweepDegFrom(p, ref, fwd, interval) {
  return radToDeg(Math.atan2(-along(p, ref, fwd), interval));
}

/**
 * Lead's forward and left unit vectors (debrief `kmlAxes` line 3041, Turn Sim
 * `formationAxes` line 1877, where the left vector is called `right`).
 */
export function formationAxes(lead, leadHdg) {
  return {
    lead,
    fwd: { x: Math.cos(leadHdg), y: Math.sin(leadHdg) },
    left: { x: Math.cos(leadHdg + Math.PI / 2), y: Math.sin(leadHdg + Math.PI / 2) },
  };
}

/** Distance of p across Lead's heading from ref (+ to Lead's left). */
function across(p, ref, left) {
  return (p.x - ref.x) * left.x + (p.y - ref.y) * left.y;
}

/** Distance of p along Lead's heading from ref (+ ahead). */
function along(p, ref, fwd) {
  return (p.x - ref.x) * fwd.x + (p.y - ref.y) * fwd.y;
}

/**
 * Debrief position labels for aircraft `id` (debrief `classifyKmlError`, line 3051),
 * with D78: when the offset standard is on, it alone judges #3's fore/aft.
 *
 * @param {number} id        2, 3 or 4 (Lead, 1, gets null)
 * @param {object} live      positions now, by id: { 1: lead, 2: …, 3: …, 4: … }
 * @param {number} leadHdg   Lead's track heading now (V6 uses 0 with no Lead track)
 * @param {object} [std]     standards, shaped like V6_STANDARDS
 * @returns {{labels: string[], intervalFt: number, foreAftFt: number, sweepDeg: number,
 *   offsetAftFt: number|null, offsetStatus: string|null}|null} null for Lead or a missing aircraft;
 *   sweepDeg is behind the 3/9 line of the aircraft the interval is from (+ aft)
 */
export function classifyDebriefPosition(id, live, leadHdg, std = V6_STANDARDS) {
  const lead = live[1], p = live[id];
  if (!lead || !p || id === 1) return null;
  const { fwd, left } = formationAxes(lead, leadHdg);
  const lateralFromLead = across(p, lead, left);
  const foreAft = along(p, lead, fwd);
  let ref = lead;
  if (id === 4 && live[3]) {
    const lat3 = across(live[3], lead, left);
    if (Math.sign(lat3) === Math.sign(lateralFromLead) && Math.abs(lat3) > SAME_SIDE_FT) ref = live[3];
  }
  const interval = Math.abs(across(p, ref, left));
  const sweepDeg = sweepDegFrom(p, ref, fwd, interval);
  const labels = [];
  const { spread, offset } = std;
  const offsetJudges3 = offset.on && id === 3;
  if (spread.on) {
    if (interval < spread.minFt) labels.push('TIGHT');
    else if (interval > spread.maxFt) labels.push('WIDE');
    const fa = offsetJudges3 ? null : spreadForeAft(spread, foreAft, sweepDeg); // D78: #3's fore/aft is the offset standard's when it is on
    if (fa) labels.push(fa);
  }
  let offsetAftFt = null, offsetStatus = null;
  if (offsetJudges3) {
    offsetAftFt = -foreAft; // straight back from Lead's 3/9 line to #3's
    if (offsetAftFt < offset.aftTargetFt - offset.aftTolFt) { labels.push('FORE'); offsetStatus = 'FORE'; }
    else if (offsetAftFt > offset.aftTargetFt + offset.aftTolFt) { labels.push('AFT'); offsetStatus = 'AFT'; }
    else offsetStatus = 'OFFSET OK';
  }
  if (!labels.length && (spread.on || offset.on)) labels.push('ON PARAMETERS');
  return { labels, intervalFt: interval, foreAftFt: foreAft, sweepDeg, offsetAftFt, offsetStatus };
}

/**
 * Lead's target speed (D115). With lowTargetKt set: lowTargetKt at or below
 * lowBlockTopFt, midTargetKt above it or when the altitude is unknown.
 * A V6-shaped lead standard has one targetKt and no block.
 *
 * @param {object} leadStd  the lead standard
 * @param {number} [altFt]  Lead's altitude, feet MSL
 * @returns {{targetKt: number, block: 'low'|'mid'|null}}
 */
export function leadTargetKt(leadStd, altFt) {
  if (!Number.isFinite(leadStd.lowTargetKt)) return { targetKt: leadStd.targetKt, block: null };
  if (Number.isFinite(altFt) && altFt <= leadStd.lowBlockTopFt) return { targetKt: leadStd.lowTargetKt, block: 'low' };
  return { targetKt: leadStd.midTargetKt, block: 'mid' };
}

/**
 * Lead's speed and G against the lead standard (debrief `classifyLeadDesired`, line 3088).
 * G is the recorded G (lead.gNative) when there is one, else estG (from gFromTrack).
 * Speed is lead.spdKt, ground speed as in V6 (D31 changes this at the screen).
 * The target speed is leadTargetKt's, from lead.altFt.
 *
 * @returns {{labels: string[], spd: number, targetKt: number, block: 'low'|'mid'|null, speedTol: number,
 *   gVal: number|null, targetG: number, gTol: number, nativeG: number|undefined, estG: number|null}|null}
 *   null when the lead standard is off or Lead is missing
 */
export function classifyLeadParameters(lead, estG, std = V6_STANDARDS) {
  const { on, speedTolKt: speedTol, targetG, gTol } = std.lead;
  if (!on) return null;
  if (!lead) return null;
  const { targetKt, block } = leadTargetKt(std.lead, lead.altFt);
  const nativeG = lead.gNative;
  const gVal = Number.isFinite(nativeG) ? nativeG : estG;
  const labels = [];
  const spd = lead.spdKt || 0;
  if (spd < targetKt - speedTol) labels.push('SLOW');
  else if (spd > targetKt + speedTol) labels.push('FAST');
  if (Number.isFinite(gVal)) {
    if (gVal < targetG - gTol) labels.push('LOW G');
    else if (gVal > targetG + gTol) labels.push('HIGH G');
  }
  if (!labels.length) labels.push('LEAD ON PARAMETERS');
  return { labels, spd, targetKt, block, speedTol, gVal, targetG, gTol, nativeG, estG };
}

/** One line per standard that is on, for the standards panel (debrief `kmlStandardsSummary`, line 3110). */
export function standardsSummaryLines(std = V6_STANDARDS) {
  const { spread, offset, lead } = std;
  const lines = [];
  if (spread.on) {
    const foreAft = Number.isFinite(spread.sweepMaxDeg)
      ? `sweep ${+(spread.sweepMinDeg || 0).toFixed(1)} to ${+spread.sweepMaxDeg.toFixed(1)}°`
      : `3/9 ±${Math.round(spread.foreAftTolFt)} ft`;
    lines.push(`Spread: ${Math.round(spread.minFt)}-${Math.round(spread.maxFt)} ft, ${foreAft}`);
  }
  if (offset.on) lines.push(`Offset #3 aft: ${Math.round(offset.aftTargetFt)} ±${Math.round(offset.aftTolFt)} ft`);
  if (lead.on) {
    const speed = Number.isFinite(lead.lowTargetKt)
      ? `${Math.round(lead.lowTargetKt)} kt low block, ${Math.round(lead.midTargetKt)} kt mid, ±${Math.round(lead.speedTolKt)} kt`
      : `${Math.round(lead.targetKt)} ±${Math.round(lead.speedTolKt)} kt`;
    lines.push(`Lead: ${speed}, ${lead.targetG.toFixed(1)} ±${lead.gTol.toFixed(2)} G`);
  }
  return lines;
}

/**
 * Turn Sim position labels for aircraft `a` (Turn Sim `classifyFormationError`, line 1881).
 * Turn Sim always applies the spread and offset numbers; the `on` switches don't apply.
 * D78 needs no change here: each Turn Sim formation judges #3 by one standard only.
 * V6's Turn Sim wrote V6_STANDARDS' numbers in; the rebuilt Turn Sim passes app.standards
 * (D89, Q46), so it judges by the same standards as the debrief.
 *
 * @param {object} a          the aircraft: { id, x, y }
 * @param {object[]} fleet    all four aircraft, Lead first ({ id, x, y, hdg })
 * @param {string} [formation] Turn Sim's formation setting; 'offsetBox' judges by the offset box,
 *   anything else by spread (V6 reads 'weighted' when the setting is missing)
 * @param {object} [std]      standards, shaped like V6_STANDARDS
 * @returns {{labels: string[], intervalFt: number, foreAftFt: number, sweepDeg: number|null,
 *   lateralFromLead: number, measureNote: string, aftDistanceFt?: number}} sweepDeg as for the
 *   debrief (#3 in the offset box, judged by the offset standard, has none)
 */
export function classifyTurnSimPosition(a, fleet, formation = 'weighted', std = V6_STANDARDS) {
  const lead = fleet[0];
  const { fwd, left } = formationAxes(lead, lead.hdg);
  const { spread, offset } = std;
  const lateralFromLead = across(a, lead, left);
  const foreAft = along(a, lead, fwd);
  const labels = [];
  let interval = 0;
  let sweepDeg = null;
  let measureNote = '';

  if (formation === 'offsetBox') {
    const two = fleet.find(x => x.id === 2);
    const three = fleet.find(x => x.id === 3);
    if (a.id === 2) {
      // Front element: #2 is judged from Lead's 3/9 line and its interval from Lead.
      interval = Math.abs(lateralFromLead);
      sweepDeg = sweepDegFrom(a, lead, fwd, interval);
      if (interval < spread.minFt) labels.push('TIGHT');
      else if (interval > spread.maxFt) labels.push('WIDE');
      const fa = spreadForeAft(spread, foreAft, sweepDeg);
      if (fa) labels.push(fa);
      measureNote = 'front element';
    } else if (a.id === 3) {
      // Slot: #3 is judged by the straight-back distance from Lead's 3/9 line to its own.
      const aftDistance = -foreAft;
      if (aftDistance < offset.aftTargetFt - offset.aftTolFt) labels.push('FORE');
      else if (aftDistance > offset.aftTargetFt + offset.aftTolFt) labels.push('AFT');
      // #3 stays in the slot between #1 and #2; WIDE only if it leaves it by more than 500 ft.
      if (two) {
        const lat2 = across(two, lead, left);
        const minLat = Math.min(0, lat2), maxLat = Math.max(0, lat2);
        if (lateralFromLead < minLat - SLOT_MARGIN_FT || lateralFromLead > maxLat + SLOT_MARGIN_FT) labels.push('WIDE');
      }
      measureNote = 'Lead 3/9 to #3 3/9';
      return { labels: labels.length ? labels : ['ON SPACING'], intervalFt: aftDistance, foreAftFt: foreAft, sweepDeg, lateralFromLead, measureNote, aftDistanceFt: aftDistance };
    } else if (a.id === 4 && three) {
      // #4 behind #3: interval from #3, fore/aft against #3's 3/9 line.
      interval = Math.abs(across(a, three, left));
      const foreAftFrom3 = along(a, three, fwd);
      sweepDeg = sweepDegFrom(a, three, fwd, interval);
      if (interval < spread.minFt) labels.push('TIGHT');
      else if (interval > spread.maxFt) labels.push('WIDE');
      const fa = spreadForeAft(spread, foreAftFrom3, sweepDeg);
      if (fa) labels.push(fa);
      measureNote = '#3 3/9 reference';
      return { labels: labels.length ? labels : ['ON SPACING'], intervalFt: interval, foreAftFt: foreAftFrom3, sweepDeg, lateralFromLead, measureNote };
    }
  } else {
    // Spread: #2 and #3 from Lead; #4 from #3 when #3 is well out on the same side.
    let ref = lead;
    if (a.id === 4) {
      const three = fleet.find(x => x.id === 3);
      if (three) {
        const lat3 = across(three, lead, left);
        if (Math.sign(lat3) === Math.sign(lateralFromLead) && Math.abs(lat3) > SAME_SIDE_FT) ref = three;
      }
    }
    interval = Math.abs(across(a, ref, left));
    sweepDeg = sweepDegFrom(a, ref, fwd, interval);
    if (interval < spread.minFt) labels.push('TIGHT');
    else if (interval > spread.maxFt) labels.push('WIDE');
    const fa = spreadForeAft(spread, foreAft, sweepDeg);
    if (fa) labels.push(fa);
  }
  if (!labels.length) labels.push('ON SPACING');
  return { labels, intervalFt: interval, foreAftFt: foreAft, sweepDeg, lateralFromLead, measureNote };
}
