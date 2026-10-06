// The 4-ship opening out (refactor PR 8, the four rebuilt on the 2-ship's planners; Fable's plan, chooser/plan.md section 20;
// the ratified moves table, project files turn-sim-review/four-ship/moves-from-the-manuals.md, Patrick 5 Oct 23:03Z-23:04Z):
// fighting wing or finger to Spread 4 (M13), fighting wing to Fluid 4 and back (M18), and Fluid 4 to the offset box (M19).
// Speeds (Q6, estimates): 220 KIAS in Spread 4 and the offset box, 200 in fighting wing and Fluid 4.
//
// Each wingman flies tracker legs off the aircraft he flies off on the 2-ship's power profile (four-legs.js), every step
// through the one envelope gate (flight.js gateRoll, TS-93). Until V2.100 these were four-ship-moves.js's, with a kinematic
// line in front of each long leg: its replayed poses were where the 8-12 G and 80-100 G/s of these moves came from.
import { turnSeg, wholeDegree, TURN_BANK_DEG } from './manoeuvres.js';
import { rejoinTo, openOut } from './recipes.js';
import { flyOut, OPEN_OUT_HELD } from './open-out.js';
import { onClosure, fromStep } from './hand-over.js';
import { trackTwice } from './tracker.js';
import { STEP_SEC } from './flight.js';
import { REJOIN, TURNING_REJOIN, FOUR_OPEN, OPEN_OUT } from './tuning.js';
import { slotsFor } from './slots.js';
import { legsInTurn, place, hold, toSlot, inLeadFrame, toSpeed, inCone, FOUR_CHANGE_LIMIT_SEC } from './four-legs.js';

/** #3 starts opening out this long after #4 when finger goes to Spread 4 ("#3 waits for #4 to begin moving out first", SMM 16.42 para 114): an estimate. */
const THREE_WAITS_SEC = 10;

/**
 * Opening out to a wide place: the kick-out at 60° of bank (Patrick 6 Oct 01:44Z: "keep it sporty at 60 deg"; until V2.103
 * the G rule alone, 5 Oct 06:16Z item 12, TS-66 (4)).
 */
const outTo = (c, slot, over = {}) => toSlot(c, openOut, slot, { heldBankDeg: FOUR_OPEN.bankDeg, ...over });

/**
 * One wingman opening out to his Spread 4 place as the 2-ship's held commands (open-out.js flyOut, TS-88): MAX from the
 * press, a full power dive to OPEN_OUT.diveFt below his place, away from Lead at FOUR_OPEN's 60° to a held heading off his
 * (the one that settles soonest), falling back by geometry only, climbing back as he turns back parallel at his distance
 * out; then the tracker settles him in the band off the aircraft he flies off. Flown against Lead's recorded flight (Lead
 * holds his speed meanwhile), with his place taken in Lead's frame. Returns a four-legs.js part, or null (the tracker
 * legs fly it instead).
 */
function heldOut(c, { wing, recs, t0, blockFt }, slots, id) {
  const H = OPEN_OUT_HELD;
  const dt = STEP_SEC;
  const rec = recs[1];
  const lf = inLeadFrame(slots, id);
  const s = Math.sign(lf.left);
  const outAimFt = Math.abs(lf.left);
  const upFt = c.leadAlt + lf.alt;
  const downFt = Math.min(upFt, wing.altAboveFt) - OPEN_OUT.diveFt;
  const diveSec = Math.max(H.diveSec, Math.abs(wing.altAboveFt - downFt) / OPEN_OUT.verticalFtps);
  const dive = { t0, t1: t0 + diveSec, fromFt: wing.altAboveFt, toFt: downFt };
  const profileFor = (part) => {
    if (!part) return [dive];
    const t1 = t0 + part.turnBackStep * dt;
    const c0 = Math.max(dive.t1, t1 - H.climbSec);
    return [dive, { t0: c0, t1: Math.max(c0 + dt, t1), fromFt: downFt, toFt: upFt }];
  };
  const bankDeg = FOUR_OPEN.bankDeg;
  let best = null;
  for (const offDeg of FOUR_OPEN.offHeadingsDeg) {
    const args = { wing, rec, s, outAimFt, slotFwd: lf.fwd, bankDeg, offDeg, blockFt, t0 };
    const first = flyOut({ ...args, profile: profileFor(null) });
    if (!first) continue;
    const profile = profileFor(first);
    const part = flyOut({ ...args, profile });
    if (!part) continue;
    const n1 = part.steps;
    const refs = Object.fromEntries(Object.entries(recs).map(([k, r]) => [k, fromStep(r, n1)]));
    const settle = onClosure([outTo(c, slots[id])]).map((p) => ({ ...p, bankCapDeg: bankDeg }));
    const W1 = { ...part.end, altAboveFt: upFt, climbFtps: 0 };
    const { run, profile: runProfile } = trackTwice({ refs, wing0: W1, t0: t0 + n1 * dt, phases: settle, blockFt, init: { accelKtps: part.accelKtps }, maxSec: FOUR_CHANGE_LIMIT_SEC });
    const durationSec = (n1 + run.points.length) * dt;
    if (!run.ok || durationSec > FOUR_CHANGE_LIMIT_SEC) continue;
    if (!best || durationSec < best.durationSec - 0.5) best = { part, run, profile: [...profile, ...(runProfile ?? [])], durationSec };
  }
  if (!best) return null;
  const { part, run, profile, durationSec } = best;
  return {
    plan: { segments: [{ kind: 'bankTrack', points: [...part.points, ...run.points] }], profile },
    durationSec,
    inSec: t0 + durationSec,
    times: run.times,
    maxBankDeg: Math.max(part.maxBankDeg, run.maxBankDeg),
  };
}


/**
 * Fighting wing (or finger) to Spread 4: the entry to line abreast (AFM7 brief p.15, AFM8 brief p.15; SMM 16.18 para 51,
 * 16.42 paras 114-115). Lead speeds up to 220 KIAS; the wingmen open out to one spacing each, the stack going on as they get
 * there. From finger, #3 waits for #4 to begin moving out first.
 */
export function entryToSpread(start, t0, opts, s, fromFinger) {
  const wide = (c) => slotsFor('spread4', s, { ships: 4, spacingFt: c.spacingFt });
  return legsInTurn(start, t0, opts, [
    (c) => {
      const slots = wide(c);
      return {
        lead: [],
        wings: [
          { id: 2, fly: (ctx) => heldOut(c, ctx, slots, 2), phases: () => [outTo(c, slots[2])] },
          fromFinger
            ? { id: 3, phases: () => [hold(c, 3, 1, { holdUntil: c.t0 + THREE_WAITS_SEC }), outTo(c, slots[3])] }
            : { id: 3, fly: (ctx) => heldOut(c, ctx, slots, 3), phases: () => [outTo(c, slots[3])] },
          { id: 4, fly: (ctx) => heldOut(c, ctx, slots, 4), phases: () => [outTo(c, slots[4])] },
        ],
      };
    },
    (c) => {
      const slots = wide(c);
      return {
        lead: toSpeed(c, 'spread4'),
        wings: [2, 3, 4].map((id) => ({ id, phases: () => [outTo(c, slots[id])] })),
      };
    },
  ]);
}

/**
 * Fighting wing to Fluid 4, "FLUID 4, GO" (M18; AFM8 brief p.20): Lead flies straight at 200 KIAS; #3 diverges to line
 * abreast on Lead at the spacing (Q1), while #2 and #4 stay in fighting wing on the outside, #4 off #3; the stack goes on
 * once in position. Back to fighting wing is the reverse (not in the manuals: an estimate), #3 rejoining at a medium bank.
 */
export function fwFluid(start, t0, opts, s, toFluid) {
  return legsInTurn(start, t0, opts, [(c) => {
    if (toFluid) {
      const f4 = slotsFor('fluid4', s, { ships: 4, spacingFt: c.spacingFt });
      return {
        lead: toSpeed(c, 'fluid4'),
        wings: [
          { id: 2, phases: () => [inCone(c, f4[2], s)] },
          { id: 3, phases: () => [outTo(c, f4[3])] },
          { id: 4, phases: () => [inCone(c, f4[4], -s)] },
        ],
      };
    }
    const fw = slotsFor('fw', s, { ships: 4, stacked: true });
    return {
      lead: toSpeed(c, 'fw'),
      wings: [
        { id: 2, phases: () => [inCone(c, fw[2], s)] },
        { id: 3, phases: () => [rejoinTo(place(c, ...Object.values(inLeadFrame(fw, 3))), { track: 1, advanceTol: 60, overtakeKias: REJOIN.overtakeKias, bankCapDeg: TURNING_REJOIN.bankCapDeg }), inCone(c, fw[3], -s)] },
        { id: 4, phases: () => [inCone(c, fw[4], -s)] },
      ],
    };
  }]);
}

/**
 * Fluid 4 to the offset box, "FOR OFFSET BOX, IN PLACE 90" (M19; AFM8 brief pp.21-22; SMM 16.41 paras 109-110): both
 * elements turn in place 90 toward #2's side in fighting wing (Lead and #3 at 3 G, #2 and #4 keeping their places), which
 * leaves the pairs in trail; then Lead speeds up to 220 KIAS and the elements spread to line abreast, #3 in the slot
 * between Lead and #2 and #4 outside #2, the second element 7,000 ft back (TS-18). The left box mirrors the right (Q2).
 */
export function fluidToBox(start, t0, opts, s) {
  return legsInTurn(start, t0, opts, [
    (c) => {
      const f4 = slotsFor('fluid4', s, { ships: 4, spacingFt: c.spacingFt });
      const turn = { bankCapDeg: 75, overtakeKias: 25, undertakeKias: 25 };
      return {
        lead: [turnSeg(wholeDegree(c.start[0].headingRad + s * Math.PI / 2), s, TURN_BANK_DEG)],
        wings: [
          { id: 2, phases: () => [inCone(c, f4[2], s, turn)] },
          { id: 3, phases: () => [hold(c, 3, 1, { world: true, ...turn, overtakeKias: 10, undertakeKias: 10, finalTol: 6 })] },
          { id: 4, phases: () => [inCone(c, f4[4], -s, turn)] },
        ],
      };
    },
    (c) => {
      const box = slotsFor('offsetBox', s, { ships: 4, spacingFt: c.spacingFt });
      return {
        lead: toSpeed(c, 'offsetBox'),
        wings: [
          { id: 2, phases: () => [outTo(c, box[2])] },
          { id: 3, phases: () => [outTo(c, box[3], { fwdRate: 40 })] },
          { id: 4, phases: () => [outTo(c, box[4])] },
        ],
      };
    },
  ]);
}
