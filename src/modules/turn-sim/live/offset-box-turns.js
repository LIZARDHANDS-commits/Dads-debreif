// The offset box's manoeuvres (TS-135; Patrick's queue item, 6 Oct: the box's five turns and the shackle, the rear element's
// delay worked out so the box reforms and shown against the manual's 10-15 s, the box entered through Fluid 4 as before).
//
// Sources (page references only): SMM 16.41 para 112a, Figs 16.30-16.32: the delayed 90, the delayed 45 and the hook, the
// rear element (#3 and #4) waiting 10-15 s so it flows back to trail in the right place; para 112b: the in-place turn, the
// check turn and the shackle with no delay; para 111: the rear element owns separation from the front; para 109: each element
// manoeuvres by the line abreast rules (SMM 16.19 paras 52-64: the 2-ship's turns and the shackle). AFM8 brief pp.23-24
// (the calls; hold the stack exactly in the hook). Research: /mnt/project-files/turn-sim-review/four-ship/offset-box-review.md.
//
// How it is planned: each element flies the 2-ship's line abreast manoeuvre as a pair (manoeuvres.js planManoeuvre), Lead and
// #2 at the press, #3 and #4 after the delay, on the stack (the stack's 300 ft steps are the shackle's miss). The SMM's 10-15 s does not say what it counts from, so the delay is worked out at the press from dry runs: the one
// (to the tenth of a second) that puts #3 nearest his box slot behind Lead once all four have rolled out, and the card shows
// it against the manual's 10-15 s band (a reference, never a wall). In-place, check and shackle fly with no delay (para 112b);
// the in-place turn leaves the elements in a column, as the SMM's in-place turn does.
import { planManoeuvre, dryRun, relativeTo, MANOEUVRES } from './manoeuvres.js';
import { STEP_SEC } from './flight.js';
import { slotsFor, BOX_DEPTH_FT } from './slots.js';
import { FOUR_SHIP_KEYS } from './four-ship.js';
import { speedSegFor } from './slow-down.js';

/** The offset box's buttons: Spread 4's five and the shackle (SMM 16.41 para 112). */
export const OFFSET_BOX_KEYS = Object.freeze([...FOUR_SHIP_KEYS, 'shackle']);
/** The rear element's delay in the manual (SMM 16.41 para 112a): a reference for the card, never a wall. */
export const BOX_DELAY_BAND_SEC = Object.freeze([10, 15]);
/** The turns the rear element waits for (para 112a); the rest fly together (para 112b). */
const DELAYED_KEYS = Object.freeze(['delayed90', 'delayed45', 'hook']);
/** The delay searched: 0 to 40 s, in half seconds then tenths (estimate: the far end is well past the manual's 15 s). */
const DELAY_SEARCH = Object.freeze({ maxSec: 40, coarseSec: 0.5, fineSec: 0.1 });

const onStep = (sec) => Math.round(sec / STEP_SEC) * STEP_SEC;

/** An aircraft flown straight on for sec seconds (the rear element while it waits). */
function straightOn(a, sec) {
  return { ...a, xFt: a.xFt + a.tasFtps * Math.cos(a.headingRad) * sec, yFt: a.yFt + a.tasFtps * Math.sin(a.headingRad) * sec };
}

/** Where a plan leaves an aircraft at time T: its dry run's end, flown straight on from there to T. */
function poseAt(a, plan, t0, T) {
  const run = dryRun(a, plan, t0);
  const extra = Math.max(0, T - (t0 + run.durationSec));
  return { ...straightOn(run.end, extra), endSec: t0 + run.durationSec };
}

/**
 * A pair's plans flown on the stack: the 2-ship's crossing height (the shackle's 300 ft miss, from Lead's height) is left
 * out, since in the box each wingman already sits 300 ft from his leader (#2 above Lead, #4 below #3; AFM8 brief p.14), which
 * is the miss (SMM 16.19 para 62). The heights stay where they are.
 */
function onStack(plans) {
  const out = {};
  for (const [id, p] of Object.entries(plans)) {
    const { profile, ...rest } = p;
    out[id] = rest;
  }
  return out;
}

/** The rear element's plans for a delay: straight on until t0 + delay, then the pair's manoeuvre from where they are then. */
function rearPlans(three, four, key, dir, t0, delaySec) {
  const d = onStep(delaySec);
  const [t3, t4] = [straightOn(three, d), straightOn(four, d)];
  const { plans } = planManoeuvre([t3, t4], key, dir, t0 + d);
  const lifted = onStack(plans);
  const hold = d > 0 ? [{ kind: 'hold', untilSec: t0 + d }] : [];
  return { [three.id]: { ...lifted[three.id], segments: [...hold, ...lifted[three.id].segments] }, [four.id]: { ...lifted[four.id], segments: [...hold, ...lifted[four.id].segments] } };
}

/**
 * A manoeuvre in the offset box. aircraft: [Lead, #2, #3, #4] as they are now; key: one of OFFSET_BOX_KEYS; dir: +1 left,
 * -1 right (the shackle has none); spacingFt: the line abreast spacing the box is flown at. Returns { plans, note, delaySec }
 * or { ok: false, reason }.
 */
export function planOffsetBoxTurn(aircraft, key, dir, t0, { spacingFt = 5000 } = {}) {
  if (!OFFSET_BOX_KEYS.includes(key)) return { ok: false, reason: `${MANOEUVRES[key]?.label ?? key} is not flown in the offset box.` };
  const by = new Map(aircraft.map((a) => [a.id, a]));
  const [lead, two, three, four] = [1, 2, 3, 4].map((id) => by.get(id));
  const front = planManoeuvre([lead, two], key, dir, t0);
  const frontPlans = onStack(front.plans);
  const delayed = DELAYED_KEYS.includes(key);

  // The delay that puts the slot aircraft nearest its box slot once all four are done (dry runs; para 112a's 10-15 s is shown against it).
  const leadEnd = dryRun(lead, frontPlans[lead.id], t0);
  const twoEnd = dryRun(two, frontPlans[two.id], t0);
  const sNow = Math.sign(relativeTo(lead, two).left) || 1;
  const slotAcross = sNow * spacingFt / 2;
  const slotAircraft = Math.abs(relativeTo(lead, four).left - slotAcross) < Math.abs(relativeTo(lead, three).left - slotAcross) ? four : three;
  const missFor = (delaySec) => {
    const rear = rearPlans(three, four, key, dir, t0, delaySec);
    const rSlot = dryRun(slotAircraft, rear[slotAircraft.id], t0);
    const T = Math.max(t0 + leadEnd.durationSec, t0 + twoEnd.durationSec, t0 + rSlot.durationSec);
    const L = poseAt(lead, frontPlans[lead.id], t0, T);
    const W2 = poseAt(two, frontPlans[two.id], t0, T);
    const WSlot = poseAt(slotAircraft, rear[slotAircraft.id], t0, T);
    const s = Math.sign(relativeTo(L, W2).left) || 1;
    const slot = slotsFor('offsetBox', s, { ships: 4, spacingFt })[3];
    const q = relativeTo(L, WSlot);
    return Math.hypot(q.fwd - slot.fwd, q.left - slot.left);
  };
  let delaySec = 0;
  if (delayed) {
    let best = { d: 0, miss: missFor(0) };
    for (let d = DELAY_SEARCH.coarseSec; d <= DELAY_SEARCH.maxSec + 1e-9; d += DELAY_SEARCH.coarseSec) {
      const miss = missFor(d);
      if (miss < best.miss) best = { d, miss };
    }
    for (let d = Math.max(0, best.d - DELAY_SEARCH.coarseSec); d <= best.d + DELAY_SEARCH.coarseSec + 1e-9; d += DELAY_SEARCH.fineSec) {
      const miss = missFor(d);
      if (miss < best.miss) best = { d, miss };
    }
    delaySec = onStep(best.d);
  }
  const rear = rearPlans(three, four, key, dir, t0, delaySec);
  const plans = { ...frontPlans, ...rear };
  // A wingman still a few knots off Lead's speed as the box settled takes it off as he goes (the turns are planned at Lead's).
  for (const a of [two, three, four]) {
    if (Math.abs(a.kias - lead.kias) > 0.5) plans[a.id] = { ...plans[a.id], segments: [{ ...speedSegFor(a.kias, lead.kias), withNext: true }, ...plans[a.id].segments] };
  }

  const m = MANOEUVRES[key];
  const [lo, hi] = BOX_DELAY_BAND_SEC;
  const band = delaySec < lo ? `, under the manual's ${lo}-${hi} s` : delaySec > hi ? `, over the manual's ${lo}-${hi} s` : `, inside the manual's ${lo}-${hi} s`;
  const slotName = slotAircraft.name ?? (slotAircraft.id === 4 ? '#4' : '#3');
  const how = delayed
    ? `Lead and #2 fly the ${m.label.toLowerCase()} as a line abreast pair; #3 and #4 wait ${delaySec.toFixed(1)} s${band}, then fly it too, so the box reforms with ${slotName} about ${BOX_DEPTH_FT.toLocaleString('en-CA')} ft behind Lead (SMM 16.41 para 112a, Figs 16.30-16.32; the delay worked out at the press).`
    : key === 'shackle'
      ? 'Both elements shackle together, no delay, on the stack: #2 passes 300 ft above Lead and #4 300 ft below #3 (SMM 16.41 para 112b; SMM 16.19 paras 61-63; AFM8 brief p.14). Each element swaps sides, so the rear element ends offset to #2\'s old side.'
      : key === 'inPlace90'
        ? 'Both elements turn in place together, no delay, and end as two pairs in a column (SMM 16.41 para 112b).'
        : 'Both elements check together, no delay (SMM 16.41 para 112b).';
  return { plans, note: `${how} ${front.note ?? ''}`.trim(), delaySec, firstId: front.firstId ?? null };
}
