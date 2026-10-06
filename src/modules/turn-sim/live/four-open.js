// The 4-ship opening out (refactor PR 8, the four rebuilt on the 2-ship's planners; Fable's plan, chooser/plan.md section 20;
// the ratified moves table, project files turn-sim-review/four-ship/moves-from-the-manuals.md, Patrick 5 Oct 23:03Z-23:04Z):
// fighting wing or finger to Spread 4 (M13), fighting wing to Fluid 4 and back (M18), and Fluid 4 to the offset box (M19).
// Speeds (Q6, estimates): 220 KIAS in Spread 4 and the offset box, 200 in fighting wing and Fluid 4.
//
// Each wingman flies tracker legs off the aircraft he flies off on the 2-ship's power profile (four-legs.js), every step
// through the one envelope gate (flight.js gateRoll, TS-93). Until V2.100 these were four-ship-moves.js's, with a kinematic
// line in front of each long leg: its replayed poses were where the 8-12 G and 80-100 G/s of these moves came from.
import { turnSeg, wholeDegree, TURN_BANK_DEG } from './manoeuvres.js';
import { rejoinTo, openOut, sweepOut } from './transitions.js';
import { REJOIN, TURNING_REJOIN, FW_FOLLOW, FOUR_OPEN } from './tuning.js';
import { fwGoal } from './formation-turns.js';
import { slotsFor } from './slots.js';
import { legsInTurn, place, hold, toSlot, inLeadFrame, toSpeed } from './four-legs.js';

/** #3 starts opening out this long after #4 when finger goes to Spread 4 ("#3 waits for #4 to begin moving out first", SMM 16.42 para 114): an estimate. */
const THREE_WAITS_SEC = 10;

/**
 * Opening out to a wide place: the kick-out at 60° of bank (Patrick 6 Oct 01:44Z: "keep it sporty at 60 deg"; until V2.103
 * the G rule alone, 5 Oct 06:16Z item 12, TS-66 (4)).
 */
const outTo = (c, slot, over = {}) => toSlot(c, openOut, slot, { heldBankDeg: FOUR_OPEN.bankDeg, ...over });

/** Fighting wing kept off the aircraft he flies off, anywhere in the cone (formation-turns.js fwGoal, the whole cone, TS-75), his stack held. */
const inCone = (c, slot, side, over = {}) => ({ ...toSlot(c, sweepOut, slot), ...FW_FOLLOW, coneAlt: false, goal: (R, W) => fwGoal(R, W, side, false), ...over });

/**
 * Fighting wing (or finger) to Spread 4: the entry to line abreast (AFM7 brief p.15, AFM8 brief p.15; SMM 16.18 para 51,
 * 16.42 paras 114-115). Lead speeds up to 220 KIAS; the wingmen open out to one spacing each, the stack going on as they get
 * there. From finger, #3 waits for #4 to begin moving out first.
 */
export function entryToSpread(start, t0, opts, s, fromFinger) {
  return legsInTurn(start, t0, opts, [(c) => {
    const slots = slotsFor('spread4', s, { ships: 4, spacingFt: c.spacingFt });
    return {
      lead: toSpeed(c, 'spread4'),
      wings: [
        { id: 2, phases: () => [outTo(c, slots[2])] },
        { id: 3, phases: () => [...(fromFinger ? [hold(c, 3, 1, { holdUntil: c.t0 + THREE_WAITS_SEC })] : []), outTo(c, slots[3])] },
        { id: 4, phases: () => [outTo(c, slots[4])] },
      ],
    };
  }]);
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
