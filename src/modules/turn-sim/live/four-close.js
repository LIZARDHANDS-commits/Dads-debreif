// The 4-ship's close moves (refactor PR 6; the ratified moves table, project files turn-sim-review/four-ship/
// moves-from-the-manuals.md, Patrick 5 Oct 23:03Z-23:04Z): finger, echelon, box, line astern and route to each other, and
// out of them to fighting wing. Each wingman flies the 2-ship's close technique off the aircraft he flies off: the station
// change's corners and stops (SMM 12.20 paras 44-47, Figs 12.12-12.13; transitions.js stopAt, slide, cornerBehind), on the
// 2-ship's close-in rate (the Rates choice, hand-over.js onClosure, four-legs.js), with the manuals' gates: each waits for
// the one ahead (SMM 16.32 paras 85-86). Lead holds heading and speed in every one (the manuals are silent; inferred).
//
// The shapes are the ones flown since V2.10 (four-ship-moves.js until V2.97); what changed is the rate set (the 2-ship's
// close-in closure instead of the 4-ship's own tracker settings) and no kinematic line in front of the tracker.
//
// The move numbers (M1 to M12) are the ratified table's. Numbers with no manual page or ruling beside them are estimates.
import { STEP_SEC } from './flight.js';
import { stopAt, slide, cornerBehind, sweepOut } from './transitions.js';
import { relativeTo } from './manoeuvres.js';
import { slotsFor } from './slots.js';
import { FW_FOLLOW } from './tuning.js';
import { closureNow } from './rates.js';
import { fwGoal } from './formation-turns.js';
import { planEchelonToFw } from './echelon-to-fw.js';
import { legsInTurn, place, hold, toSlot, ech, ast, toSpeed } from './four-legs.js';

/** Close-formation crossings go behind and below (SMM 16.32 paras 87-88): 15 ft below Lead, #4 a further 10 ft below #3 (estimates). */
const CROSS_LOW_FT = 15;
const FOUR_LOWER_FT = 10;
/** A wingman in line with Lead and the one ahead aims at the line as it will be this far ahead per place out, so he swings with it, not after it (estimate). */
const LINE_LEAD_SEC = 1;
/** ...and is down to his crossing height within this long, about as long as the one ahead takes to reach his corner (estimate). */
const LINE_DOWN_SEC = 4;
/** In the triple change #2 crosses at this share of the close-in rate, so #4, about three times as far out, keeps up with the line (estimate). */
const TRIPLE_ACROSS_SHARE = 0.5;
/**
 * Finger to echelon on #3's side: how far #3 (with #4 on its wing) moves out, back and slightly down beyond its echelon
 * place to make room for #2 (SMM 16.32 para 87; AFM7 brief p.19 item 1, frame 2). The manuals give no distance: these are
 * estimates, about half a wingspan out, most of a length back and 5 ft down.
 */
const MAKE_ROOM = Object.freeze({ outFt: 15, backFt: 25, downFt: 5 });
/** From echelon to fighting wing, how far behind Lead #3 drops back before #2 sweeps out, #4 twice as far (an estimate). */
const ECHELON_CLEAR_FT = 300;

/**
 * The close station change's technique, the 2-ship's (SMM 12.20 paras 44-45; transitions.js legsFor's crossClose), for one
 * wingman: back and down into the corner behind where it is and stop; across at a steady rate to directly behind its new
 * place and stop; then forward and up into it (`last`). The corner is in the frame of `track`: back, the fore-aft place;
 * fromLeft, toLeft, the lateral places now and at the end; low, the height against Lead. first: extra settings for the
 * first phase (a gate). A later wingman can gate on times[0] (in the corner), [1] (across) or [2] (in place).
 */
function crossTo(c, track, fromLeft, toLeft, back, low, last, first = {}) {
  return [stopAt(place(c, back, fromLeft, low), { track, ...first }), stopAt(place(c, back, toLeft, low), { track }), last];
}
/**
 * In line with Lead (Patrick 6 Oct 04:58Z: "inline with lead as they cross under his flight path togehter, so 4 has to move
 * faster"; card 05:16Z "Column"; 05:29Z, echelon to echelon "time it so all 4 fusilages are aligned at once"): a wingman held
 * on the line from Lead through `ahead`, k echelon places (about 51 ft each) further out, `alt` against Lead's height, flown
 * off `ahead`; he leaves it at `until`. As the one ahead moves back and crosses under Lead's track, everyone on the line
 * stays in one column with Lead, and the further out moves the faster.
 */
function onTheLine(c, recs, ahead, k, alt, until, over = {}) {
  const outFt = k * Math.hypot(ech().fwd, ech().left);
  const goal = (L, W, t) => {
    const n = Math.max(0, Math.round((t - recs[ahead].t0 + LINE_LEAD_SEC * k) / STEP_SEC));
    const p = relativeTo(recs[1].at(n), recs[ahead].at(n)); // the one ahead from Lead, a moment ahead
    const r = Math.hypot(p.fwd, p.left) || 1;
    return { fwd: (p.fwd / r) * outFt, left: (p.left / r) * outFt, alt: c.leadAlt + alt }; // off the one ahead, in his frame
  };
  return slide(place(c, 0, 0, alt), { track: ahead, holdUntil: until, goal, ...over });
}
/** The corner behind a close place (the 2-ship's, transitions.js cornerBehind): { fwd, alt } in the frame flown off. */
const corner = (c) => cornerBehind(ech(), c.spacingFt);
/** Up into a close place from directly behind it (SMM 12.20 para 45: "move forward and up"). */
const upInto = (c, slot) => toSlot(c, slide, slot);

/**
 * M1 and M2: finger to echelon (SMM 16.32 paras 87-88; AFM7 brief p.19). Echelon on #3's side (M1, para 87; AFM7 p.19 item
 * 1): #3, with #4 on its wing, moves out, back and slightly down to make room while #2 moves back and down into the corner
 * behind Lead; #2 crosses behind and below Lead and moves up into echelon; then #3 and #4 regain normal spacing. Echelon on
 * #2's side (M2, para 88 reversed; AFM7 p.19 item 2): crossThreeFour. s: #2's side now; e: the echelon's side.
 */
export function fingerToEchelon(start, t0, opts, s, e) {
  if (e === s) return crossThreeFour(start, t0, opts, -s, s, 'echelon');
  const ech4 = slotsFor('echelon', -s, { ships: 4 });
  return legsInTurn(start, t0, opts, [
    (c) => ({
      wings: [
        { id: 3, phases: () => [stopAt(place(c, 2 * ech().fwd - MAKE_ROOM.backFt, -s * (2 * ech().left + MAKE_ROOM.outFt), 2 * ech().alt - MAKE_ROOM.downFt), { track: 1 })] },
        // #4 moves out with #3 to the same make-room offset from his own echelon place, flown off Lead: until V2.97 he held
        // off #3 and lagged #3's sweep out, closing to 31 ft of #3 when he had not settled from the last change
        { id: 4, phases: () => [stopAt(place(c, 3 * ech().fwd - MAKE_ROOM.backFt, -s * (3 * ech().left + MAKE_ROOM.outFt), 3 * ech().alt - MAKE_ROOM.downFt), { track: 1 })] },
        // #2 crosses as soon as he sees room (para 87): once #3 has moved out, not once everyone has settled (until V2.128)
        {
          id: 2,
          phases: (done) => [
            stopAt(place(c, corner(c).fwd, s * ech().left, corner(c).alt), { track: 1 }),
            stopAt(place(c, corner(c).fwd, -s * ech().left, corner(c).alt), { track: 1, holdUntil: done[3].times[0].arrive }),
            upInto(c, ech4[2]),
          ],
        },
      ],
    }),
    (c) => ({
      wings: [
        { id: 2, phases: () => [hold(c, 2, 1)] },
        { id: 3, phases: () => [upInto(c, ech4[3])] },
        { id: 4, phases: () => [toSlot(c, slide, ech4[4])] },
      ],
    }),
  ]);
}

/**
 * #3 and #4 change sides together, #2 holding (SMM 16.32 para 88; AFM7 brief p.19 item 2): #3 moves back and down into the
 * corner behind #2 and Lead and stops, crosses at a steady rate to directly behind its new place and stops, then moves up
 * into it; #4 holds on the line from Lead through #3, one place further out and lower, and crosses with it (one column
 * under Lead's track, Patrick 6 Oct 05:16Z), then, once #3 is across, out and up into echelon on #3. from, to: #3's side
 * now and at the end (+1 left, -1 right); key: the formation at the end, 'echelon' (all on #2's side, #2 on side `to`) or
 * 'finger' (#2 on side -to).
 */
function crossThreeFour(start, t0, opts, from, to, key) {
  const slots = slotsFor(key, key === 'echelon' ? to : -to, { ships: 4 });
  return legsInTurn(start, t0, opts, [(c) => {
    const back3 = corner(c).fwd + ech().fwd; // behind #2 as well as Lead
    const low3 = -CROSS_LOW_FT - 5;
    const low4 = low3 - FOUR_LOWER_FT - 5;
    const fromLeft3 = from * (key === 'echelon' ? 1 : 2) * ech().left; // #3 is one echelon out in finger, two in echelon
    const toLeft3 = to * (key === 'echelon' ? 2 : 1) * ech().left;
    return {
      wings: [
        { id: 2, phases: () => [hold(c, 2, 1)] },
        { id: 3, phases: () => crossTo(c, 1, fromLeft3, toLeft3, back3, low3, upInto(c, slots[3])) },
        {
          id: 4,
          // In one column with #3 under Lead's track (Patrick 6 Oct 05:16Z, "Column"; SMM 16.32 para 88), moving faster
          // sideways. Until V2.126 #4 moved into a column behind #3 and lagged its crossing by about a second, 50 ft outboard.
          phases: (done, recs) => [
            onTheLine(c, recs, 3, 1, low4, done[3].times[0].t1, { altSec: LINE_DOWN_SEC }),
            onTheLine(c, recs, 3, 1, low4, done[3].times[1].t1),
            upInto(c, slots[4]),
          ],
        },
      ],
    };
  }]);
}

/**
 * Echelon to echelon on the other side as one triple station change (Patrick 6 Oct 05:29Z: "Make esch to esch a triple
 * station change and time it so all 4 fusilages are aligned at once so 4 goes the fastest and further"; the manuals give no
 * such change: it was two, through finger, about 90 s, until V2.128): #2 flies the 2-ship's crossover behind Lead (SMM
 * 12.20 paras 44-45), while #3 and #4 hold on the line from Lead through #2, one and two places further out, each 15 ft
 * lower (onTheLine). The echelon is that line already, so the four stay in one line as #2 moves back, cross under Lead's
 * track together and come out on the other side; once #2 is across, each moves forward and up into his place.
 * e, eTo: the echelon's side now and at the end.
 */
export function echelonToEchelon(start, t0, opts, e, eTo) {
  const slots = slotsFor('echelon', eTo, { ships: 4 });
  return legsInTurn(start, t0, opts, [(c) => {
    const low2 = corner(c).alt;
    const low3 = low2 - FOUR_LOWER_FT - 5;
    const low4 = low3 - FOUR_LOWER_FT - 5;
    const behind = (id, k, low) => ({
      id,
      phases: (done, recs) => [
        onTheLine(c, recs, 2, k, low, done[2].times[0].t1, { altSec: LINE_DOWN_SEC }),
        onTheLine(c, recs, 2, k, low, done[2].times[1].t1),
        upInto(c, slots[id]),
      ],
    });
    return {
      wings: [
        {
          id: 2,
          phases: () => [
            stopAt(place(c, corner(c).fwd, e * ech().left, low2), { track: 1 }),
            stopAt(place(c, corner(c).fwd, eTo * ech().left, low2), { track: 1, closureCapFtps: closureNow().ftps * TRIPLE_ACROSS_SHARE }),
            upInto(c, slots[2]),
          ],
        },
        behind(3, 1, low3),
        behind(4, 2, low4),
      ],
    };
  }]);
}

/**
 * M3: echelon to finger. With #2 staying (finger on #2's side, the echelon's #3 and #4 to the other side) it is SMM 16.32
 * para 88 itself: crossThreeFour. With #2 changing sides (finger on the far side from the echelon) the manuals give no
 * picture (para 87's mirror, IMPLIED): #2 moves back and down into the corner, crosses behind and below Lead and moves up
 * into echelon on the other side; then #3 and #4 move in place to finger. e: the echelon's side; s: #2's side at the end.
 */
export function echelonToFinger(start, t0, opts, e, s) {
  if (e === s) return crossThreeFour(start, t0, opts, s, -s, 'finger');
  const fin = slotsFor('finger', s, { ships: 4 });
  return legsInTurn(start, t0, opts, [
    (c) => ({
      wings: [
        { id: 2, phases: () => crossTo(c, 1, -s * ech().left, s * ech().left, corner(c).fwd, corner(c).alt, upInto(c, fin[2])) },
        { id: 3, phases: () => [hold(c, 3, 1)] },
        { id: 4, phases: () => [hold(c, 4, 3)] },
      ],
    }),
    (c) => ({
      wings: [
        { id: 2, phases: () => [hold(c, 2, 1)] },
        { id: 3, phases: () => [upInto(c, fin[3])] },
        { id: 4, phases: () => [toSlot(c, slide, fin[4])] },
      ],
    }),
  ]);
}

/**
 * M4 and M5: finger to box and back (SMM 16.32 para 91; AFM7 brief p.20): #2 and #3 hold; #4 moves back and down to pass
 * behind #3 and stops, across to behind Lead and stops ("stabilize in a loose line astern"), then power moves it up into
 * line astern on Lead. Back (M5, IMPLIED): the same way reversed, to its echelon on #3, the same finger it left (para 91).
 */
export function fingerBox(start, t0, opts, s, toBox) {
  return legsInTurn(start, t0, opts, [(c) => {
    const back = corner(c).fwd + ech().fwd; // behind #3 as well as Lead
    const low = -CROSS_LOW_FT - 5;
    const fin4Left = -s * 2 * ech().left; // #4's lateral place in finger, in Lead's frame
    const four = toBox
      ? crossTo(c, 1, fin4Left, 0, back, low, upInto(c, slotsFor('box', s, { ships: 4 })[4]))
      : crossTo(c, 1, 0, fin4Left, back, low, upInto(c, slotsFor('finger', s, { ships: 4 })[4]));
    return { wings: [{ id: 2, phases: () => [hold(c, 2, 1)] }, { id: 3, phases: () => [hold(c, 3, 1)] }, { id: 4, phases: () => four }] };
  }]);
}

/**
 * M6 and M7: finger to line astern and back (SMM 16.32 paras 86, 89-90). To line astern (M6): #2 and #3 (with #4 on its
 * wing) move back and slightly down together, #3 far enough back for #2 to take position first; #2 crosses behind Lead and
 * moves up into line astern; only then does #3 move across behind #2, and as it does, #4 moves into line astern on #3
 * (para 86: #3 does not move laterally until #2 is in). Back (M7, para 90): #2 moves to its side and up into echelon; once
 * it is out of line astern, #3 moves to the other side and up into echelon on Lead; then #4 regains echelon on #3.
 */
export function fingerTrail(start, t0, opts, s, toTrail) {
  const trail = slotsFor('trail', 0, { ships: 4 });
  if (toTrail) {
    // #3's corner: back far enough that #2's crossing passes well ahead of it (two line astern places, plus 15 ft: estimates)
    const back3 = 2 * ast().fwd - 15;
    return legsInTurn(start, t0, opts, [
      (c) => ({
        wings: [
          { id: 2, phases: () => [stopAt(place(c, corner(c).fwd, s * ech().left, corner(c).alt), { track: 1 })] },
          { id: 3, phases: () => [stopAt(place(c, back3, -s * ech().left, 2 * ast().alt), { track: 1 })] },
          { id: 4, phases: () => [hold(c, 4, 3)] },
        ],
      }),
      (c) => ({
        wings: [
          { id: 2, phases: () => [stopAt(place(c, corner(c).fwd, 0, corner(c).alt), { track: 1 }), upInto(c, trail[2])] },
          { id: 3, phases: () => [hold(c, 3, 1)] },
          { id: 4, phases: () => [hold(c, 4, 3)] },
        ],
      }),
      (c) => ({
        wings: [
          { id: 2, phases: () => [hold(c, 2, 1)] },
          { id: 3, phases: () => [stopAt(place(c, back3, 0, 2 * ast().alt), { track: 1 }), upInto(c, trail[3])] },
          // back behind where he is on #3's wing first, then across behind #3 (SMM 12.20 para 45; until V2.97 he slid across and back at once)
          { id: 4, phases: () => [stopAt(place(c, corner(c).fwd, -s * ech().left, 3 * ast().alt), { track: 3 }), stopAt(place(c, corner(c).fwd, 0, 3 * ast().alt), { track: 3 }), upInto(c, trail[4])] },
        ],
      }),
    ]);
  }
  const fin = slotsFor('finger', s, { ships: 4 });
  return legsInTurn(start, t0, opts, [
    (c) => ({
      wings: [
        { id: 2, phases: () => [stopAt(place(c, corner(c).fwd, s * ech().left, ast().alt), { track: 1 }), upInto(c, fin[2])] },
        { id: 3, phases: () => [hold(c, 3, 1)] },
        { id: 4, phases: () => [hold(c, 4, 3)] },
      ],
    }),
    (c) => ({
      wings: [
        { id: 2, phases: () => [hold(c, 2, 1)] },
        { id: 3, phases: () => [stopAt(place(c, 2 * ast().fwd, -s * ech().left, 2 * ast().alt), { track: 1 }), upInto(c, fin[3])] },
        { id: 4, phases: () => [hold(c, 4, 3)] },
      ],
    }),
    (c) => ({
      wings: [
        { id: 2, phases: () => [hold(c, 2, 1)] },
        { id: 3, phases: () => [hold(c, 3, 1)] },
        { id: 4, phases: () => [stopAt(place(c, ast().fwd, -s * ech().left, fin[4].alt), { track: 3 }), upInto(c, fin[4])] },
      ],
    }),
  ]);
}

/** M12 (one way) and its reverse: finger and route, a slide out or in at the same time (AFM8 brief p.9: anticipate the collapse to route; AFM7 brief p.18 item 2c). */
export function slideTo(start, t0, opts, s, to) {
  return legsInTurn(start, t0, opts, [(c) => {
    const slots = slotsFor(to, s, { ships: 4 });
    return { lead: toSpeed(c, to), wings: [2, 3, 4].map((id) => ({ id, phases: () => [toSlot(c, slide, slots[id])] })) };
  }]);
}

/**
 * M9: finger or echelon to fighting wing (SMM 16.32 para 92, 16.38 para 105; AFM7 brief p.14 item 4): the wingmen drop back
 * and open out from each other until each is behind the aircraft ahead, then move sideways into the swept place; no stack
 * from a close formation; #2 to the side he was on, #3 and #4 to the other. Expeditious (Patrick 4 Oct 19:03Z, "about 7-15
 * seconds", TS-55; the SMM's "slowly" gives way to his ruling), all three at once, each in his own lane:
 *  - #2, in echelon on Lead, flies the 2-ship's held drop back (echelon-to-fw.js: roll away, idle and boards, turn back,
 *    MAX to stop in the cone, about 10 s; Patrick 5 Oct 08:40Z) and settles anywhere in the cone (the whole cone, TS-75);
 *  - #3 and #4 drop back off Lead (who flies straight) to where their places will be once the one ahead has settled, then
 *    across into them, and settle in the cone off the aircraft they fly off (formation-turns.js fwGoal, the whole cone).
 * Flown off Lead until the last few feet, nobody chases a wingman who is still moving, so nothing compounds down the chain
 * (until V2.97 each chased the one ahead from the press: #4 reversed bank by up to 125° and the change took 86 s).
 */
export function openToFw(start, t0, opts, s, from) {
  return legsInTurn(start, t0, opts, [
    // From echelon #3 and #4 sit outboard of #2, where his drop back sweeps out: they first drop back and down in their own
    // lanes, clear behind him, while he holds (SMM 16.32 para 92: "drop back ... until each is steady behind the aircraft
    // ahead; then a sideways move"). Until V2.97's first build #2 swept out through #3's place and passed 12 ft from him.
    (c) => {
      if (from !== 'echelon') return null;
      const slots = slotsFor('fw', s, { ships: 4, stacked: false });
      const lane = (id) => relativeTo(c.start[0], c.by.get(id)).left;
      return {
        lead: toSpeed(c, 'fw'),
        wings: [
          { id: 2, phases: () => [hold(c, 2, 1)] },
          ...[3, 4].map((id) => ({ id, phases: () => [sweepOut(place(c, -ECHELON_CLEAR_FT * (id - 2), lane(id), slots[id].alt), { track: 1 })] })),
        ],
      };
    },
    (c) => {
    const slots = slotsFor('fw', s, { ships: 4, stacked: false });
    const lead = c.start[0];
    const two = {
      id: 2,
      fly: ({ wing, t0: t }) => {
        const p = planEchelonToFw([lead, wing], 'fw', { spacingFt: c.spacingFt, blockFt: c.blockFt }, t);
        return p?.ok ? { plan: p.plans[wing.id], durationSec: p.endSec - t, inSec: p.coneSec ?? p.endSec } : null;
      },
      phases: () => [sweepOut(place(c, slots[2].fwd, relativeTo(lead, c.by.get(2)).left, slots[2].alt), { track: 1, advanceTol: 60 }), { ...toSlot(c, sweepOut, slots[2]), goal: (L, W) => fwGoal(L, W, s, false) }],
    };
    // Where a wingman's place will be in Lead's frame once the one he flies off has settled (all on Lead's heading then).
    const placeOff = (id, done, recs) => {
      const ref = slots[id].ref;
      const step = Math.round((done[ref].endSec - c.t0) / STEP_SEC);
      const at = relativeTo(recs[1].at(step), recs[ref].at(step));
      return { fwd: at.fwd + slots[id].fwd, left: at.left + slots[id].left };
    };
    const behind = (id) => ({
      id,
      phases: (done, recs) => {
        const p = placeOff(id, done, recs);
        const now = relativeTo(lead, c.by.get(id));
        return [
          sweepOut(place(c, p.fwd, now.left, slots[id].alt), { track: 1, advanceTol: 60 }),
          sweepOut(place(c, p.fwd, p.left, slots[id].alt), { track: 1, advanceTol: 60 }),
          { ...toSlot(c, sweepOut, slots[id]), ...FW_FOLLOW, coneAlt: false, closeIn: true, goal: (R, W) => fwGoal(R, W, -s, false) },
        ];
      },
    });
    return { lead: toSpeed(c, 'fw'), wings: [two, behind(3), behind(4)] };
  },
  ]);
}
