// The numbers the debrief shows for the current time (SPEC-debrief: Readouts
// and standards). Every number comes from flight-data (where each ship is)
// and core (aspect, HCA, closure, standards); this file only picks the
// moments and puts the answers in rows. No page access, so it's tested in Node.
import { sampleAt, headingAt, pitchAt, gAt, estimatedGAt } from '../../flight-data/flight.js';
import { aspectAngleDeg, headingCrossAngleDeg, wrapPi, degToRad } from '../../core/angles.js';
import { closureKt, formatClosureKt as formatClosure, isaDensityRatio } from '../../core/flight-math.js';
import { classifyDebriefPosition, classifyLeadParameters } from '../../core/standards.js';
import { bankFromTrack } from './view3d/scene.js';

/** V6 measured closure over the last second (closureRateKt, line 3119). */
export const CLOSURE_LOOKBACK_S = 1;

/**
 * Airborne: est. IAS 80 kt or more; a judgement call logged for review
 * (verification M1). Below it Lead is on the ground or taxiing, so the
 * standards (built for formation flight) give no wingman labels and no Lead
 * verdict; Lead's line shows its numbers alone. Est. IAS comes from ground
 * speed, so a steep pull-up can dip under it in the air too: the card says
 * "Lead under 80 kt", not "on the ground" (audit of #194, Y4; logged for review).
 */
export const AIRBORNE_IAS_KT = 80;

/**
 * Lead's speed is judged only inside the SMM's two blocks (Gen Book p.12):
 * the Low block from 6,000 ft MSL (it runs to 10,000 ft) and the Mid block up
 * to 15,500 ft MSL (it starts at 10,500 ft). Which of the two targets applies
 * stays core's split (lowBlockTopFt). Outside them Lead's line says "not
 * judged". A judgement call logged for review (verification M1).
 */
export const LOW_BLOCK_FLOOR_FT = 6000;
export const MID_BLOCK_CEILING_FT = 15_500;

/** Why Lead is outside the blocks at `altFt`, or null inside them (or with no altitude: core's default block applies). */
function outsideBlocks(altFt) {
  if (!Number.isFinite(altFt)) return null;
  if (altFt < LOW_BLOCK_FLOOR_FT) return 'below the low block';
  if (altFt > MID_BLOCK_CEILING_FT) return 'above the mid block';
  return null;
}

/** Is Lead (a { spdKt, altFt } place, or null) airborne by est. IAS? No number, no verdict. */
function leadAirborne(leadPlace) {
  const ias = leadPlace ? estIasKt(leadPlace.spdKt, leadPlace.altFt) : null;
  return Number.isFinite(ias) && ias >= AIRBORNE_IAS_KT;
}

/**
 * Estimated indicated airspeed from ground speed and altitude: ground speed ×
 * √(density ratio), the ratio at least 0.15, as core's emPoint does (V6 EM
 * chart, line 4158). Used for Lead's speed standard instead of ground speed
 * (D31). No wind, so it's an estimate, and it's labelled "est. IAS".
 */
export function estIasKt(gsKt, altFt) {
  if (!Number.isFinite(gsKt)) return null;
  return gsKt * Math.sqrt(Math.max(0.15, isaDensityRatio(Number.isFinite(altFt) ? altFt : 6500)));
}

/**
 * Est. IAS with the wind (final verification F1): true airspeed is the length
 * of the ground velocity minus the wind vector, then × √(density ratio) as
 * estIasKt has it. The ground velocity is gsKt along headingRad (0 = east,
 * counter-clockwise, as flight-data's headingAt); the wind { dirDeg, kt } is
 * where it blows FROM, degrees true, so the air moves the opposite way and a
 * 24 kt headwind adds 24 kt to the airspeed. With no wind, a calm one, or no
 * heading (still), it is estIasKt's ground-speed figure.
 */
export function estIasWithWindKt(gsKt, headingRad, altFt, wind) {
  if (!Number.isFinite(gsKt)) return null;
  if (!wind || !Number.isFinite(wind.dirDeg) || !Number.isFinite(wind.kt) || !Number.isFinite(headingRad)) return estIasKt(gsKt, altFt);
  const from = degToRad(wind.dirDeg);
  const east = gsKt * Math.cos(headingRad) + wind.kt * Math.sin(from);
  const north = gsKt * Math.sin(headingRad) + wind.kt * Math.cos(from);
  return estIasKt(Math.hypot(east, north), altFt);
}

/** Est. G's window, seconds either side of t (flight-data's estimatedGAt); the bank's turn rate uses the same one (M2). */
export const TURN_WINDOW_S = 1.5;

/**
 * Turn rate in radians a second, left (counter-clockwise) positive, from the
 * heading change over t−1.5 s to t+1.5 s: the window and the headings
 * flight-data's estimatedGAt uses for est. G, so the bank drawn from it agrees
 * with the G beside it (verification M2). Null whenever est. G over the same
 * window is: the track too short, the aircraft still at either end (no
 * heading, C7), the window touching a GPS gap, or a G above the T-6's 7 G
 * (D32). Null draws the wings level, beside "G --" (audit of #194, Y2).
 */
export function turnRateAt(track, t, windowS = TURN_WINDOW_S) {
  const f = track?.fixes;
  if (!f || f.length < 3) return null;
  const t0 = Math.max(f[0].t, t - windowS);
  const t1 = Math.min(f[f.length - 1].t, t + windowS);
  if (t1 - t0 < 0.5) return null;
  if (estimatedGAt(track, t, windowS) === null) return null;
  const h0 = headingAt(track, t0);
  const h1 = headingAt(track, t1);
  if (h0 === null || h1 === null) return null;
  return wrapPi(h1 - h0) / (t1 - t0);
}

/**
 * A ship's bank at t, as the readouts and the 3D view both show it (D40, D47,
 * item G, M2): { bankDeg (left wing down positive), source, known }. Recorded
 * bank first; otherwise from the turn rate over the same ±1.5 s as est. G.
 * With neither, the bank is unknown (known false, bankDeg 0 so the 3D view
 * draws wings level), not 0° (verification re-check N2). sample: sampleAt(tr, t).
 */
export function shipBank(tr, t, { sample, pitchDeg, recordedG = null }) {
  const turnRate = turnRateAt(tr, t);
  const bank = bankFromTrack({
    turnRateRadPerS: turnRate,
    speedKt: sample.speedKt,
    recordedBankDeg: sample.bankRecordedDeg,
    pitchDeg,
    recordedG,
  });
  return { ...bank, known: bank.source === 'recorded' || turnRate !== null };
}

/** A ship's place for core's formulas: { x, y } in map feet, plus V6's names for speed and altitude. */
const at = (s) => (s ? { x: s.xFt, y: s.yFt, altFt: s.altFt, spdKt: s.speedKt } : null);

/**
 * Does any standard judge ship `slot`? Spread judges #2 to #4; the offset
 * standard only #3. With none, the ship gets no label, not V6's "ON
 * PARAMETERS" (#21).
 */
export function standardApplies(slot, std) {
  if (slot === 1) return false;
  return std.spread.on || (std.offset.on && slot === 3);
}

/**
 * How far outside its band a label is, for the Formation card, as { value, unit }:
 * feet, or degrees for the SMM's sweep (D116), which is measured from the
 * aircraft #n's interval is measured from.
 */
function beyond(label, pos, slot, std) {
  const { spread, offset } = std;
  const feet = (value) => ({ value, unit: 'ft' });
  if (label === 'WIDE') return feet(pos.intervalFt - spread.maxFt);
  if (label === 'TIGHT') return feet(spread.minFt - pos.intervalFt);
  if (slot === 3 && offset.on) {
    if (label === 'FORE') return feet(offset.aftTargetFt - offset.aftTolFt - pos.offsetAftFt);
    if (label === 'AFT') return feet(pos.offsetAftFt - (offset.aftTargetFt + offset.aftTolFt));
  }
  if (Number.isFinite(spread.sweepMaxDeg)) {
    const min = Number.isFinite(spread.sweepMinDeg) ? spread.sweepMinDeg : 0;
    if (label === 'FORE') return { value: min - pos.sweepDeg, unit: 'deg' };
    if (label === 'AFT') return { value: pos.sweepDeg - spread.sweepMaxDeg, unit: 'deg' };
  }
  if (label === 'FORE') return feet(pos.foreAftFt - spread.foreAftTolFt);
  if (label === 'AFT') return feet(-spread.foreAftTolFt - pos.foreAftFt);
  return null;
}

/**
 * Each wingman against the standards (#21, D78). No label with no Lead, no
 * Lead heading (D52), a gap on either ship (D32), or no standard for it.
 * `inGap` is by slot; `live` holds core's { x, y } places.
 */
function judgeFormation(tracks, live, inGap, leadHdg, standards) {
  return tracks
    .filter((tr) => tr.slot !== 1)
    .map((tr) => {
      const slot = tr.slot;
      const row = { slot, state: 'ok', labels: [], offBy: [] };
      if (!live[1]) return { ...row, state: 'no-lead' };
      if (inGap[slot].inGap || inGap[1].inGap) return { ...row, state: 'gap' };
      if (leadHdg === null) return { ...row, state: 'no-heading' };
      if (!leadAirborne(live[1])) return { ...row, state: 'ground' };
      if (!standards || !standardApplies(slot, standards)) return { ...row, state: 'no-standard' };
      const pos = classifyDebriefPosition(slot, live, leadHdg, standards);
      const labels = pos.labels;
      const offBy = labels.map((label) => beyond(label, pos, slot, standards));
      return { ...row, labels, offBy, intervalFt: pos.intervalFt, foreAftFt: pos.foreAftFt, sweepDeg: pos.sweepDeg, offsetAftFt: pos.offsetAftFt };
    });
}

/**
 * Just the Formation-card rows at time t, for the labels on the map: the same
 * as readoutsAt(...).formation, without the rest of the readouts.
 */
export function formationAt(flight, t, standards) {
  if (!flight) return [];
  const tracks = Object.values(flight.tracks).sort((a, b) => a.slot - b.slot);
  const live = {};
  const gap = {};
  for (const tr of tracks) {
    const s = sampleAt(tr, t);
    live[tr.slot] = at(s);
    gap[tr.slot] = { inGap: s.inGap };
  }
  return judgeFormation(tracks, live, gap, live[1] ? headingAt(flight.tracks[1], t) : null, standards);
}

/**
 * Everything the readouts show at time t.
 * options.standards: shaped like core's DEFAULT_STANDARDS or V6_STANDARDS (app.standards.get()).
 * options.recordedG: use the recorded G where there is one (off by default, D61).
 * options.leadWind: { dirDeg, kt }, the model wind at Lead's altitude and this
 * moment (true "from" direction, knots), or null: Lead's est. IAS is then
 * wind-corrected (F1). Wingmen's never is.
 * Returns { ships, formation, lead, vsLead, pairs }; see each below.
 * @param {any} flight
 * @param {number} t
 * @param {{ standards?: any, recordedG?: boolean, leadWind?: { dirDeg: number, kt: number } | null }} [options]
 */
export function readoutsAt(flight, t, { standards, recordedG = false, leadWind = null } = {}) {
  if (!flight) return { ships: [], formation: [], lead: null, vsLead: [], pairs: [] };
  const tracks = Object.values(flight.tracks).sort((a, b) => a.slot - b.slot);
  const prevT = Math.max(flight.startT, t - CLOSURE_LOOKBACK_S);
  const now = {};
  const prev = {};
  const heading = {};
  for (const tr of tracks) {
    now[tr.slot] = sampleAt(tr, t);
    prev[tr.slot] = sampleAt(tr, prevT);
    heading[tr.slot] = headingAt(tr, t);
  }
  const live = Object.fromEntries(tracks.map((tr) => [tr.slot, at(now[tr.slot])]));
  const closure = (a, b) => (t > prevT ? closureKt(at(prev[a]), at(prev[b]), live[a], live[b], t - prevT) : null);

  // Live data, one row per ship (D47, D61).
  const ships = tracks.map((tr) => {
    const s = now[tr.slot];
    const g = gAt(tr, t, { recorded: recordedG });
    const pitch = pitchAt(tr, t);
    const bank = shipBank(tr, t, { sample: s, pitchDeg: pitch.deg, recordedG: g.source === 'recorded' ? g.g : null });
    // Lead's est. IAS takes the wind when there is one and Lead is moving; nobody else's does (F1).
    const windCorrected = tr.slot === 1 && !!leadWind && heading[1] !== null && Number.isFinite(s.speedKt);
    return {
      slot: tr.slot,
      inGap: s.inGap,
      headingKnown: heading[tr.slot] !== null,
      altFt: s.altFt,
      gsKt: s.speedKt,
      iasKt: windCorrected ? estIasWithWindKt(s.speedKt, heading[1], s.altFt, leadWind) : estIasKt(s.speedKt, s.altFt),
      windCorrected,
      g: g.g,
      gSource: g.source,
      pitchDeg: pitch.deg,
      pitchSource: pitch.source,
      bankDeg: bank.known ? bank.bankDeg : null, // left wing down positive; null when unknown
      bankSource: bank.source,
      lat: s.lat,
      lon: s.lon,
    };
  });
  const bySlot = Object.fromEntries(ships.map((s) => [s.slot, s]));

  // Lead against the lead standard, with est. IAS as the speed (D31).
  let lead = null;
  if (live[1]) {
    const leadShip = bySlot[1];
    // No verdict on the ground (M1a) or outside the blocks (M1b), checked before core's classifier is asked.
    const eligible = standards && !leadShip.inGap && leadAirborne(live[1]);
    const outside = eligible && standards.lead?.on ? outsideBlocks(leadShip.altFt) : null;
    // Lead's altitude picks the target speed by block (D115: 220 kt low, 200 kt mid).
    const judged = eligible && !outside
      ? classifyLeadParameters({ spdKt: leadShip.iasKt, altFt: leadShip.altFt, gNative: leadShip.gSource === 'recorded' ? leadShip.g : undefined }, leadShip.g, standards)
      : null;
    lead = {
      iasKt: leadShip.iasKt, windCorrected: leadShip.windCorrected, g: leadShip.g, inGap: leadShip.inGap, labels: judged ? judged.labels : null,
      targetKt: judged?.targetKt ?? null, block: judged?.block ?? null, notJudged: outside,
    };
  }

  const leadHdg = heading[1];
  const formation = judgeFormation(tracks, live, bySlot, leadHdg, standards);

  // Aspect, HCA, closure and range from Lead to each wingman (V6 line 3212).
  const vsLead = live[1]
    ? tracks.filter((tr) => tr.slot !== 1).map((tr) => {
      const slot = tr.slot;
      const p = live[slot];
      return {
        slot,
        inGap: bySlot[slot].inGap || bySlot[1].inGap,
        rangeFt: Math.hypot(p.x - live[1].x, p.y - live[1].y),
        aspectDeg: aspectAngleDeg(live[1], p, leadHdg),
        hcaDeg: headingCrossAngleDeg(leadHdg, heading[slot]),
        closureKt: closure(1, slot),
      };
    })
    : [];

  // Spacing for every pair, horizontal as V6 (#18), with the 3D range beside it.
  const pairs = [];
  for (let i = 0; i < tracks.length; i++) {
    for (let j = i + 1; j < tracks.length; j++) {
      const a = tracks[i].slot;
      const b = tracks[j].slot;
      const dx = live[a].x - live[b].x;
      const dy = live[a].y - live[b].y;
      const dz = (live[a].altFt || 0) - (live[b].altFt || 0);
      pairs.push({
        a,
        b,
        inGap: bySlot[a].inGap || bySlot[b].inGap,
        horizontalFt: Math.hypot(dx, dy),
        slantFt: Math.hypot(dx, dy, dz),
        closureKt: closure(a, b),
      });
    }
  }

  return { ships, formation, lead, vsLead, pairs };
}

// ── Words for the screen ─────────────────────────────────────────────────────

const ft = (n) => `${Math.round(n).toLocaleString('en-US')} ft`;
const kt = (n) => (Number.isFinite(n) ? `${Math.round(n)} kt` : '--');
const deg = (n) => (Number.isFinite(n) ? `${Math.round(n)}°` : '–');
const src = (source) => (source === 'recorded' ? 'recorded' : 'est.');

/**
 * One Formation-card line for a wingman, and its tone ('good', 'caution' or
 * 'none'), so the card can colour it; the words carry the meaning too.
 */
export function formationText(row) {
  if (row.state === 'gap') return { text: 'GPS gap', tone: 'none' };
  if (row.state === 'no-lead') return { text: 'No Lead track', tone: 'none' };
  if (row.state === 'no-heading') return { text: '– (Lead not moving)', tone: 'none' };
  if (row.state === 'ground') return { text: '– (Lead under 80 kt)', tone: 'none' };
  if (row.state === 'no-standard') return { text: '– (no standard on)', tone: 'none' };
  if (row.labels.length === 1 && row.labels[0] === 'ON PARAMETERS') return { text: 'On parameters', tone: 'good' };
  const by = (off) => (off.unit !== 'deg' ? ft(off.value) : off.value < 1 ? 'under 1°' : `${Math.round(off.value)}°`);
  const parts = row.labels.map((label, i) => (Number.isFinite(row.offBy[i]?.value) ? `${label} by ${by(row.offBy[i])}` : label));
  return { text: parts.join(', '), tone: 'caution' };
}

/** The Formation card's Lead line: est. IAS and G, and what's off against the lead standard (D31). */
export function leadText(lead) {
  if (!lead) return null;
  if (lead.inGap) return { text: 'Lead: GPS gap', tone: 'none' };
  const g = Number.isFinite(lead.g) ? `${lead.g.toFixed(1)} G` : 'G --';
  const numbers = `Lead ${kt(lead.iasKt)} est. IAS (${lead.windCorrected ? 'wind-corrected' : 'no wind'}), ${g}`;
  if (lead.notJudged) return { text: `${numbers}, not judged: ${lead.notJudged}`, tone: 'none' };
  if (!lead.labels) return { text: numbers, tone: 'none' };
  // With the SMM's two blocks (D115), the target Lead is judged against, so a change at 10,250 ft isn't a surprise.
  const target = lead.block ? ` (target ${kt(lead.targetKt)}, ${lead.block} block)` : '';
  if (lead.labels[0] === 'LEAD ON PARAMETERS') return { text: `${numbers}, on parameters${target}`, tone: 'good' };
  return { text: `${numbers}, ${lead.labels.join(', ')}${target}`, tone: 'caution' };
}

/** "More detail" lines for one ship's live data (D47, D61: each value says where it came from; an unknown one is just "--"). */
export function shipDetailText(ship) {
  if (ship.inGap) return ['GPS gap: no numbers until the track resumes'];
  let bank = '--';
  if (Number.isFinite(ship.bankDeg)) bank = Math.round(ship.bankDeg) !== 0 ? `${deg(Math.abs(ship.bankDeg))} ${ship.bankDeg > 0 ? 'left' : 'right'}` : '0°';
  return [
    `Alt ${ft(ship.altFt)}, GS ${kt(ship.gsKt)}, est. IAS ${kt(ship.iasKt)} (${ship.windCorrected ? 'wind-corrected' : 'no wind'})`,
    `G ${Number.isFinite(ship.g) ? `${ship.g.toFixed(2)} ${src(ship.gSource)}` : '--'}, pitch ${deg(ship.pitchDeg)} ${src(ship.pitchSource)}, bank ${bank === '--' ? bank : `${bank} ${src(ship.bankSource)}`}`,
    `Lat ${ship.lat.toFixed(5)}, Lon ${ship.lon.toFixed(5)}`,
  ];
}

/** "More detail" line for a wingman seen from Lead (V6 line 3212); ranges say they're horizontal (#18). */
export function vsLeadText(row) {
  if (row.inGap) return 'GPS gap';
  return `Range ${ft(row.rangeFt)} horizontal, aspect ${deg(row.aspectDeg)}, HCA ${deg(row.hcaDeg)}, closure ${formatClosure(row.closureKt)}`;
}

/** "More detail" line for one pair's spacing: horizontal as V6, and the 3D range (#18). */
export function pairText(pair) {
  if (pair.inGap) return `#${pair.a}–#${pair.b}: GPS gap`;
  return `#${pair.a}–#${pair.b}: ${ft(pair.horizontalFt)} horizontal, ${ft(pair.slantFt)} 3D, closure ${formatClosure(pair.closureKt)}`;
}

/**
 * The label the map draws beside a wingman: V6's words ("WIDE / AFT", "ON
 * PARAMETERS") and a tone. Nothing where the card shows no label (#21, D32, D52).
 */
export function mapLabel(row) {
  if (row.state !== 'ok' || !row.labels.length) return null;
  const on = row.labels.length === 1 && row.labels[0] === 'ON PARAMETERS';
  return { text: row.labels.join(' / '), tone: on ? 'good' : 'caution' };
}
