// Formation standards: is each wingman where he should be?
//
// Two V6 copies judge the same standards: the debrief (classifyKmlError,
// classifyLeadDesired and kmlStandardsSummary, lines 3051 to 3115), where
// they are settings, and Turn Sim (classifyFormationError, line 1881), where
// the same numbers are written into the code. Both are ported here unchanged.
// V6_STANDARDS holds V6's values, the default preset (R18).
//
// Distances are in feet. Positions are { x, y } and headings follow the
// angles.js convention. "Fore/aft" is measured along Lead's heading from
// Lead's 3/9 line (+ ahead); "interval" is measured across it. V6 calls the
// across-vector `right`, but it is Lead's heading turned 90° counter-clockwise,
// which is Lead's LEFT; here it is named `left`, and lateralFromLead is + to
// Lead's left. Intervals are unsigned, so no label depends on this.
//
// Known V6 behaviour kept for now (#21, Q39): with both the spread and the
// offset standard on, #3's fore/aft is judged by both, so #3 is never
// "ON PARAMETERS". An aircraft no standard applies to is still labelled
// "ON PARAMETERS".

/** V6's standards: the debrief's default settings, and Turn Sim's fixed numbers. */
export const V6_STANDARDS = Object.freeze({
  spread: Object.freeze({ on: true, minFt: 4000, maxFt: 6000, foreAftTolFt: 250 }),
  offset: Object.freeze({ on: true, aftTargetFt: 8000, aftTolFt: 1000 }),
  lead: Object.freeze({ on: true, targetKt: 200, speedTolKt: 10, targetG: 1.0, gTol: 0.2 }),
});

/** #4 measures its interval from #3 when #3 is more than this far out on the same side (both copies). */
const SAME_SIDE_FT = 500;
/** In Turn Sim's offset box, #3 is WIDE when more than this outside the slot between Lead and #2. */
const SLOT_MARGIN_FT = 500;

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
 * Debrief position labels for aircraft `id` (debrief `classifyKmlError`, line 3051).
 *
 * @param {number} id        2, 3 or 4 (Lead, 1, gets null)
 * @param {object} live      positions now, by id: { 1: lead, 2: …, 3: …, 4: … }
 * @param {number} leadHdg   Lead's track heading now (V6 uses 0 with no Lead track)
 * @param {object} [std]     standards, shaped like V6_STANDARDS
 * @returns {{labels: string[], intervalFt: number, foreAftFt: number, offsetAftFt: number|null,
 *   offsetStatus: string|null}|null} null for Lead or a missing aircraft
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
  const labels = [];
  const { spread, offset } = std;
  if (spread.on) {
    if (interval < spread.minFt) labels.push('TIGHT');
    else if (interval > spread.maxFt) labels.push('WIDE');
    if (foreAft > spread.foreAftTolFt) labels.push('FORE');
    else if (foreAft < -spread.foreAftTolFt) labels.push('AFT');
  }
  let offsetAftFt = null, offsetStatus = null;
  if (offset.on && id === 3) {
    offsetAftFt = -foreAft; // straight back from Lead's 3/9 line to #3's
    if (offsetAftFt < offset.aftTargetFt - offset.aftTolFt) { labels.push('FORE'); offsetStatus = 'FORE'; }
    else if (offsetAftFt > offset.aftTargetFt + offset.aftTolFt) { labels.push('AFT'); offsetStatus = 'AFT'; }
    else offsetStatus = 'OFFSET OK';
  }
  if (!labels.length && (spread.on || offset.on)) labels.push('ON PARAMETERS');
  return { labels, intervalFt: interval, foreAftFt: foreAft, offsetAftFt, offsetStatus };
}

/**
 * Lead's speed and G against the lead standard (debrief `classifyLeadDesired`, line 3088).
 * G is the recorded G (lead.gNative) when there is one, else estG (from gFromTrack).
 * Speed is lead.spdKt, ground speed as in V6 (D31 changes this at the screen).
 *
 * @returns {{labels: string[], spd: number, targetKt: number, speedTol: number, gVal: number|null,
 *   targetG: number, gTol: number, nativeG: number|undefined, estG: number|null}|null}
 *   null when the lead standard is off or Lead is missing
 */
export function classifyLeadParameters(lead, estG, std = V6_STANDARDS) {
  const { on, targetKt, speedTolKt: speedTol, targetG, gTol } = std.lead;
  if (!on) return null;
  if (!lead) return null;
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
  return { labels, spd, targetKt, speedTol, gVal, targetG, gTol, nativeG, estG };
}

/** One line per standard that is on, for the standards panel (debrief `kmlStandardsSummary`, line 3110). */
export function standardsSummaryLines(std = V6_STANDARDS) {
  const { spread, offset, lead } = std;
  const lines = [];
  if (spread.on) lines.push(`Spread: ${Math.round(spread.minFt)}-${Math.round(spread.maxFt)} ft, 3/9 ±${Math.round(spread.foreAftTolFt)} ft`);
  if (offset.on) lines.push(`Offset #3 aft: ${Math.round(offset.aftTargetFt)} ±${Math.round(offset.aftTolFt)} ft`);
  if (lead.on) lines.push(`Lead: ${Math.round(lead.targetKt)} ±${Math.round(lead.speedTolKt)} kt, ${lead.targetG.toFixed(1)} ±${lead.gTol.toFixed(2)} G`);
  return lines;
}

/**
 * Turn Sim position labels for aircraft `a` (Turn Sim `classifyFormationError`, line 1881).
 * Turn Sim always applies the spread and offset numbers; the `on` switches don't apply.
 *
 * @param {object} a          the aircraft: { id, x, y }
 * @param {object[]} fleet    all four aircraft, Lead first ({ id, x, y, hdg })
 * @param {string} [formation] Turn Sim's formation setting; 'offsetBox' judges by the offset box,
 *   anything else by spread (V6 reads 'weighted' when the setting is missing)
 * @param {object} [std]      standards, shaped like V6_STANDARDS
 * @returns {{labels: string[], intervalFt: number, foreAftFt: number, lateralFromLead: number,
 *   measureNote: string, aftDistanceFt?: number}}
 */
export function classifyTurnSimPosition(a, fleet, formation = 'weighted', std = V6_STANDARDS) {
  const lead = fleet[0];
  const { fwd, left } = formationAxes(lead, lead.hdg);
  const { spread, offset } = std;
  const lateralFromLead = across(a, lead, left);
  const foreAft = along(a, lead, fwd);
  const labels = [];
  let interval = 0;
  let measureNote = '';

  if (formation === 'offsetBox') {
    const two = fleet.find(x => x.id === 2);
    const three = fleet.find(x => x.id === 3);
    if (a.id === 2) {
      // Front element: #2 is judged from Lead's 3/9 line and its interval from Lead.
      interval = Math.abs(lateralFromLead);
      if (interval < spread.minFt) labels.push('TIGHT');
      else if (interval > spread.maxFt) labels.push('WIDE');
      if (foreAft > spread.foreAftTolFt) labels.push('FORE');
      else if (foreAft < -spread.foreAftTolFt) labels.push('AFT');
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
      return { labels: labels.length ? labels : ['ON SPACING'], intervalFt: aftDistance, foreAftFt: foreAft, lateralFromLead, measureNote, aftDistanceFt: aftDistance };
    } else if (a.id === 4 && three) {
      // #4 behind #3: interval from #3, fore/aft against #3's 3/9 line.
      interval = Math.abs(across(a, three, left));
      const foreAftFrom3 = along(a, three, fwd);
      if (interval < spread.minFt) labels.push('TIGHT');
      else if (interval > spread.maxFt) labels.push('WIDE');
      if (foreAftFrom3 > spread.foreAftTolFt) labels.push('FORE');
      else if (foreAftFrom3 < -spread.foreAftTolFt) labels.push('AFT');
      measureNote = '#3 3/9 reference';
      return { labels: labels.length ? labels : ['ON SPACING'], intervalFt: interval, foreAftFt: foreAftFrom3, lateralFromLead, measureNote };
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
    if (interval < spread.minFt) labels.push('TIGHT');
    else if (interval > spread.maxFt) labels.push('WIDE');
    if (foreAft > spread.foreAftTolFt) labels.push('FORE');
    else if (foreAft < -spread.foreAftTolFt) labels.push('AFT');
  }
  if (!labels.length) labels.push('ON SPACING');
  return { labels, intervalFt: interval, foreAftFt: foreAft, lateralFromLead, measureNote };
}
