// The formations' slots, 2-ship and 4-ship, in one table (Turn Sim spec sections 8 and 10; decisions TS-53, TS-54, TS-58;
// clean-up step 1, TS-64). Each formation says, for every wingman, which aircraft he flies off (`ref`) and where he sits in
// that aircraft's frame. The planners, the classifier and the judge (judge.js) and the slots the aircraft fly to all read
// this one table, so there is never a second copy of a position (rule book: one source of truth). Until step 1 the 2-ship's
// table was transitions.js slotFor and the 4-ship's four-ship-slots.js fourSlots.
//
// Frames and units: feet; fwd and left in the reference aircraft's frame (left of its heading is +); alt is the height
// against LEAD (so a stack reads the same whoever an aircraft flies off). The side s is #2's side of Lead (+1 left, -1
// right) in every formation, as the Setup box "#2 on Lead's" is.
//
// This file imports nothing from the live code, so any file can read it without an import loop.
//
// Sources (page references only):
//  - The 2-ship: SMM 12.4 paras 11-12 (echelon), 12.5 para 13 (line astern), 12.6 para 15 (route), 12.29 para 69 and
//    Fig 12.19 (fighting wing), 16.18 para 49 (line abreast). The close positions in feet are estimates: the manuals give
//    sight references.
//  - Spread 4: #2 and #3 LAB off Lead on opposite sides, #4 LAB off #3 outside it; the brief's stack #2 +300,
//    Lead 0, #3 -300, #4 -600 (SMM 16.42 paras 113, 116, Fig 16.33; AFM8 brief pp.14-15; TS-50).
//  - Offset box: each element a LAB, the second 6,000-8,000 ft behind (7,000 default, TS-18), #3 in the slot between
//    Lead and #2, #4 outside #2, same stack (SMM 16.41 paras 109-112, Figs 16.30-16.32; AFM8 brief pp.14, 20-24).
//  - Fluid 4: #3 6,000 ft abeam of Lead (wide LAB), #2 in fighting wing off Lead and #4 off #3, each on the outside;
//    stack once in position (AFM8 brief p.20).
//  - Fighting wing: each wingman off the preceding aircraft, #3 and #4 on the side opposite #2 (SMM 16.38 paras
//    104-107, Fig 16.29; AFM7 brief p.14); 500-1,000 ft and 30-60° (SMM 12.29 para 69). Defaults #2 45°, #3 and #4
//    30°, all 650 ft (Patrick, 4 Oct 11:44Z; estimates until Dad says). The stack is kept when it comes from Spread 4,
//    the offset box or Fluid 4 ("while maintaining stack", AFM7 brief p.17, AFM8 brief p.19).
//  - Finger: #2 and #3 echelon on Lead on opposite sides, #4 echelon on #3 (SMM 16.23 para 73, Fig 16.27; AFM7 brief
//    p.18). Echelon: each on the one ahead, all on one side (SMM Fig 16.27; AFM7 brief p.19). Box: #2 and #3 echelon on
//    Lead, #4 line astern on Lead (SMM 16.23 para 73, 16.32 para 91; AFM7 brief p.20). Line astern: each behind the one
//    ahead (SMM Fig 16.27, 12.5 para 13). Route: finger at route spacing (AFM7 brief p.18 item 2; SMM 12.6 para 15).
//    The close positions in feet are the 2-ship's estimates (the links below).

import { DEG } from '../../../core/angles.js';

/** The 2-ship's formations and their words. */
export const FORMATIONS = Object.freeze({
  lab: { label: 'Line abreast', sided: true },
  fw: { label: 'Fighting wing', sided: true },
  echelon: { label: 'Echelon', sided: true },
  route: { label: 'Route', sided: true },
  astern: { label: 'Line astern', sided: false },
  // The corner as a close position of its own (TS-231; Patrick 14 Oct 2026: "I want to add 'CORNER' as a position in close
  // formation (just like echelon and route) so if we want to stop in the corner we hit corner"): link('corner') below.
  corner: { label: 'Corner', sided: true },
});

/** The 4-ship's formations, their words and the speed they are flown at (KIAS: 200 outside line abreast, 220 in it, Patrick 4 Oct 11:08Z). */
export const FOUR_FORMATIONS = Object.freeze({
  spread4: { label: 'Spread 4', kias: 220, sided: true },
  offsetBox: { label: 'Offset box', kias: 220, sided: true }, // 220: two line abreasts (estimate, design question 9)
  fluid4: { label: 'Fluid 4', kias: 200, sided: true }, // 200: two fighting-wing pairs (estimate, design question 9)
  fluidMan: { label: 'Fluid manoeuvring', kias: 200, sided: true, later: true }, // the live build, later
  fw: { label: 'Fighting wing', kias: 200, sided: true },
  finger: { label: 'Finger', kias: 200, sided: true },
  echelon: { label: 'Echelon', kias: 200, sided: true },
  box: { label: 'Box', kias: 200, sided: true },
  trail: { label: 'Line astern', kias: 200, sided: false },
  route: { label: 'Route', kias: 200, sided: true },
});

/** The T-6A's wingspan and length, about 33.4 ft (the repo's energy-sim note); an estimate for the close positions. */
export const WINGSPAN_FT = 33.4;
export const LENGTH_FT = 33.4;

/**
 * Route spacing in wingspans: the slot 3 wingspans further out than echelon along the spinner-to-wingtip line, judged in
 * route from 1 to 3 (SMM 12.6 para 15, Fig 12.7: one to three wingspans; Patrick 11 Oct 2026 00:03Z "i want route to be the
 * same reference I just gave you", 00:15Z "let's make it 3 wingspans"; TS-181). It was Patrick's 5 (TS-103); at the 35°
 * rejoin line that put the decision point (where the line reaches route's spacing) outside the 250 ft window.
 */
export const ROUTE_SPANS = Object.freeze({ slot: 3, min: 1, max: 3 });

/**
 * The spinner-to-wingtip line (SMM 12.4 paras 11-12, 12.6 para 15): from Lead's spinner tip, 15.3 ft ahead of his centre,
 * through his wingtip's leading edge, 3.0 ft ahead and 16.7 ft out (the CT-156 model's geometry, ct156-model.js; Fable's
 * V2.234 flight report), so it runs 12.3 ft back for every 16.7 ft out (about 36° off his wing line). Echelon sits on it.
 * Until V2.248 it ran a length back per span out (45°).
 */
export const LINE_BACK_PER_OUT = 12.3 / 16.7;

/** TS-230: echelon sits this far along the line from TS-182's place (negative: up the line, toward Lead). */
const ECHELON_UP_LINE_FT = -3.5; // 2.5 ft (TS-230), then the control's -1 made the default (Patrick 14 Oct 2026: "lets make -1 the default")
/**
 * "Echelon on the line" (Patrick 14 Oct 2026: "a little toggle that moves us up and down the line 1 foot at a time? so i can
 * play with it"): feet down the line (+, away from Lead) or up it (-) from TS-230's place, 1 ft a step, from 5 ft up (his
 * wingtip about 3.5 ft outside Lead's) to 10 ft down (estimates). 0 by default; the session's own, not remembered.
 */
export const ECHELON_SHIFT = Object.freeze({ stepFt: 1, upMostFt: -5, downMostFt: 10 });
let echelonShift = 0;
/** Sets the echelon setting (feet along the line, + down it), clamped to ECHELON_SHIFT's range and whole feet. */
export function setEchelonShift(ft) {
  const n = Math.round(Number(ft) || 0);
  echelonShift = Math.max(ECHELON_SHIFT.upMostFt, Math.min(ECHELON_SHIFT.downMostFt, n));
  return echelonShift;
}
/** The echelon setting now, feet along the line (+ down it, away from Lead). */
export function echelonShiftNow() {
  return echelonShift;
}

/**
 * "Corner" Forward / Back and Up / Down (Patrick 14 Oct 2026: "Add a 'forward/back' and 'up/down' button in the corner and
 * I'll adjust"): feet forward (+) or back (-) of line astern's fore and aft, and up (+) or down (-) from its height, 1 ft a
 * step, 10 ft each way (estimates); the station change's corner moves with it (recipes.js cornerBehind). 0 by default; the
 * session's own, not remembered.
 */
export const CORNER_SHIFT = Object.freeze({ stepFt: 1, mostFt: 10 });
let cornerShift = { fwd: 0, up: 0 };
/** Sets the corner setting { fwd, up } (feet), each clamped to CORNER_SHIFT's range and whole feet. */
export function setCornerShift({ fwd = cornerShift.fwd, up = cornerShift.up } = {}) {
  const c = (n) => Math.max(-CORNER_SHIFT.mostFt, Math.min(CORNER_SHIFT.mostFt, Math.round(Number(n) || 0)));
  cornerShift = { fwd: c(fwd), up: c(up) };
  return { ...cornerShift };
}
/** The corner setting now, { fwd, up } feet (+ forward, + up). */
export function cornerShiftNow() {
  return { ...cornerShift };
}

/** The place alongFt further out along the spinner-to-wingtip line from `from` (a place on it), on side s. */
function downTheLine(from, s, alongFt) {
  const out = alongFt / Math.hypot(1, LINE_BACK_PER_OUT);
  return { fwd: from.fwd - out * LINE_BACK_PER_OUT, left: s * (Math.abs(from.left) + out), alt: from.alt };
}

/** Heights above the formation's block, feet, by aircraft id (AFM8 brief p.14-15: low to high 4, 3, 1, 2; 300 ft stacks). */
export const STACK_FT = Object.freeze({ 1: 0, 2: 300, 3: -300, 4: -600 });

// ---- fighting wing: the desired places (TS-195; settings until V2.359, TS-58) ------------------------------------------

/**
 * Fighting wing's desired place for the 2-ship: 750 ft at 45° of sweep, measured back from Lead's wing line (SMM 12.29
 * para 69, Fig 12.19): the middle of the SMM's 500-1,000 ft and 30-60° band, an estimate. The table's 'fw' reads it. It was
 * a setting until V2.359 (TS-58), retired as ignored since V2.304 (Patrick's card 12 Oct 2026 01:52Z, "Remove the setting"; TS-195).
 */
export const FW2 = Object.freeze({ rangeFt: 750, sweepDeg: 45 });
/**
 * Fighting wing's band, the one table every planner, the judge and the bubble read (Fable review step 1).
 * rangeFt, sweepDeg: SMM 12.29 para 69, Fig 12.19. A desired place outside it is flown and flagged, never refused.
 * flyMarginFt [near, far]/Deg: what the sim will fly at all, the band widened by this (FW_LIMITS; estimates, not manual
 * limits). seeMarginFt [near, far]/Deg: where the pair is still recognised as fighting wing, the band widened by this
 * (FW_REGION, judge.js classifier; estimates). The far edge is wider than the near one, as before V2.155 (450-1,250 and
 * 400-1,300 ft); step 1 had made both 50/100 ft by mistake (TS-142). bubbleFt: never inside this of Lead (SMM 16.17 para 44c, SMM 16.23, Gen Book p.11).
 * easeFarFt: the cone's reach for the ride (tracker.js): inside it, on the line, #2 counts as at the cone, and from it the
 * bank cap eases to the decision point (estimate; was a literal 1200 in tracker.js until refactor step 2).
 */
export const FW_BAND = Object.freeze({
  rangeFt: Object.freeze([500, 1000]), sweepDeg: Object.freeze([30, 60]), easeFarFt: 1200,
  flyMarginFt: Object.freeze([50, 250]), flyMarginDeg: 5, seeMarginFt: Object.freeze([100, 300]), seeMarginDeg: 10, bubbleFt: 500,
});
const widen = (marginFt, marginDeg) => Object.freeze({
  rangeFt: Object.freeze([FW_BAND.rangeFt[0] - marginFt[0], FW_BAND.rangeFt[1] + marginFt[1]]),
  sweepDeg: Object.freeze([FW_BAND.sweepDeg[0] - marginDeg, FW_BAND.sweepDeg[1] + marginDeg]),
});
/** What the sim will fly at all (450-1,250 ft, 25-65°): 50 ft and 5° inside FW_REGION, so the fighting wing buttons keep working. */
export const FW_LIMITS = widen(FW_BAND.flyMarginFt, FW_BAND.flyMarginDeg);
/** Where the pair is still recognised as fighting wing (400-1,300 ft, 20-70°; judge.js classifier). */
export const FW_REGION = widen(FW_BAND.seeMarginFt, FW_BAND.seeMarginDeg);
/**
 * The judge's other regions, where a pair is recognised as nearest to line abreast or a close formation (judge.js
 * classifier; generous on purpose, estimates; TS-142). In position is judged separately, on the bands and IN_POSITION.
 */
export const NEAREST = Object.freeze({
  lab: Object.freeze({ minAcrossFt: 1500, sweepDeg: Object.freeze([-15, 25]) }),
  closeRangeFt: 300, // inside about 300 ft: the close formations (route reaches about 150 ft out)
  astern: Object.freeze({ maxAcrossFt: 22 }),
  echelon: Object.freeze({ maxAcrossFt: 56, fwdFt: Object.freeze([-90, 40]) }),
  route: Object.freeze({ extraSpans: 2, fwdFt: Object.freeze([-200, 60]) }), // out and back past the route band (Patrick 06:11Z; TS-103, TS-181)
});

/** The overshoot lane, the step-down and canopy ranges: one copy, in core/canopy.js beside the gate that reads it. */
export { LANE } from '../../../core/canopy.js';

/** A fighting wing side swap (TS-86): how far outside the bubble #2 crosses Lead's six (estimate). */
const SWAP_CROSS_MARGIN_FT = 100;

/** Where a crossing behind Lead passes his six, fwd ft: outside the 500 ft bubble by SWAP_CROSS_MARGIN_FT (SMM 12.29 para 69; estimates). */
export const crossBehindFwd = (rangeFt) => -(Math.max(FW_BAND.bubbleFt, rangeFt * 0.9) + SWAP_CROSS_MARGIN_FT);

/** The turning rejoin's line: lineDeg off Lead's tail on side s, fixed in his turning frame (SMM 12.24 paras 56-57). Positive cross: ahead of the line, hot. */
export function fixedLine(lineDeg, s) {
  const sinL = Math.sin(lineDeg * DEG);
  const cosL = Math.cos(lineDeg * DEG);
  const u = { fwd: -sinL, left: s * cosL }; // down the line outward from Lead, in his frame
  const nrm = { fwd: cosL, left: s * sinL }; // across it, toward Lead's nose (positive: ahead of the line, hot)
  return { u, nrm, closureShare: cosL, at: (rel) => ({ along: rel.fwd * u.fwd + rel.left * u.left, cross: rel.fwd * nrm.fwd + rel.left * nrm.left }) };
}

const fwShape = FW2;

/** The 2-ship's desired fighting wing place: { rangeFt, sweepDeg }. */
export function fwShapeNow() {
  return { ...fwShape };
}

/**
 * Four-ship fighting wing: each link 650 ft; #2 at 60°, #3 and #4 at 45° (Patrick, 4 Oct 11:44Z and 12 Oct 2026; estimates until
 * Dad says).
 * The angles are sweep back from the wing line of the aircraft flown off, the manual's way (SMM 12.29 para 69, Fig 12.19).
 * #2's 60° is the aft edge of the cone, about 30° off Lead's tail, so a turn into him has room to lag (Patrick 12 Oct 2026
 * 18:17Z: "hold 2 closer to the edge of the cone near to lead"; 45° until then, an estimate). In Fluid 4, #2 off Lead and #4
 * off #3 keep the 45° (fluidDeg; not part of that ruling). #3 and #4 sit on the side opposite #2 (SMM 16.38 para 104; AFM7
 * brief p.14). Their 45° sits between Fig 16.29's picture (30°) and the para 104 text (60°): at 30°, with the 60 ft start stack, #3 came
 * to 276 ft of #2 in a turn away from #2; at 45° 435 ft (Patrick's card 12 Oct 2026 18:39Z, "45°"). Both manual figures are written down (Patrick set
 * it through a setting, TS-58, until V2.359; TS-195).
 */
export const FW4 = Object.freeze({ rangeFt: 650, twoDeg: 60, otherDeg: 45, fluidDeg: 45 });
/** The four-ship's desired places: #2's pair (spacing and sweep off Lead; #4 off #3 in Fluid 4 at fluidDeg) and #3/#4's pair (each off the one ahead in fighting wing). */
const fw4 = Object.freeze({ twoRangeFt: FW4.rangeFt, twoDeg: FW4.twoDeg, fluidDeg: FW4.fluidDeg, otherRangeFt: FW4.rangeFt, otherDeg: FW4.otherDeg });

/** Fighting wing with no stack (entered from a close formation): each aircraft 60 ft below the one it flies off, the 2-ship's estimate. */
export const FW_STEP_DOWN_FT = 60;
/** The offset box's second element sits this far behind the first (TS-18; SMM 16.41 para 109 gives 6,000-8,000 ft). */
export const BOX_DEPTH_FT = 7000;
export const BOX_DEPTH_BAND_FT = Object.freeze([6000, 8000]);

// ---- the table ---------------------------------------------------------------------------------------------------------

const fwAt = (rangeFt, deg, side) => ({ fwd: -rangeFt * Math.sin(deg * DEG), left: side * rangeFt * Math.cos(deg * DEG) });

/** One link: where a wingman sits off the aircraft he flies off in the 2-ship formation `key` on side s: { fwd, left, alt }. */
function link(key, s, spacingFt) {
  switch (key) {
    case 'lab': return { fwd: 0, left: s * spacingFt, alt: 0 };
    // the desired place (FW2's 750 ft at 45°, SMM 12.29 para 69); 60 ft below is an estimate
    case 'fw': return { fwd: -fwShape.rangeFt * Math.sin(fwShape.sweepDeg * DEG), left: s * fwShape.rangeFt * Math.cos(fwShape.sweepDeg * DEG), alt: -60 };
    // where the SMM's references put #2 (SMM 12.4 para 11, Figs 12.3-12.4): Lead's wingtip leading edge on his spinner, abeam
    // the rudder hinge line, the wingtip on the spinner for height, worked through the CT-156 model's geometry: about 18 ft
    // back, 43 ft out, 3 ft down, origin to origin (TS-182; Patrick 11 Oct 03:38Z "make the numbers work for that"; 05:31Z
    // "echelon is sitting slightly too low": 4 ft down until V2.255). It was 25 back, 45 out, 5 down, an estimate that put
    // Lead's wingtip ahead of the spinner.
    // TS-230 (Patrick 14 Oct 2026, "a hair further up the line ... maybe 2-3 feet", then "lets make -1 the default"): 3.5 ft
    // further up the line than TS-182's place, about 15.9 back and 40.2 out, plus the setting that moves it along the line a foot at a time (echelonShiftFt).
    case 'echelon': return downTheLine({ fwd: -18, left: s * 43, alt: -3 }, s, ECHELON_UP_LINE_FT + echelonShift);
    // on the spinner-to-wingtip line, three wingspans further out along it than echelon (SMM 12.6 para 15, Fig 12.7;
    // ROUTE_SPANS, TS-181; it was 5, TS-103): about 124 ft out and 77 ft back, level or slightly low (TS-182)
    case 'route': return downTheLine(link('echelon', s, spacingFt), s, ROUTE_SPANS.slot * WINGSPAN_FT);
    // nose to tail about 10 ft (SMM 12.5 para 13): centre to centre is that plus a fuselage length; below the prop wash, 11 ft
    // (an estimate of 8 ft until Patrick 14 Oct 2026, flying the corner: "this corner position is definitely too high ... our
    // LAS is too high too. the straight back is good, but both have to go deep enough to get the references ... start by
    // moving it (and LAS) down three feet")
    case 'astern': return { fwd: -(LENGTH_FT + 10), left: 0, alt: -11 };
    // the corner (SMM 12.20 para 45, Figs 12.12-12.13; TS-231, Patrick 14 Oct 2026: "The corner should be if you move straight
    // right from Line Astern, and down and back from echelon"): line astern's fore and aft and height (his nose about 10 ft
    // behind Lead's tail, below the prop wash) at echelon's own lateral, about 43 back, 40 out, 11 down (8 until Patrick's
    // "down three feet", 14 Oct 2026), plus the Corner setting (CORNER_SHIFT); it moves with the echelon setting (TS-230).
    // The station change flows through it (recipes.js cornerBehind, the same place).
    case 'corner': {
      const e = link('echelon', s, spacingFt);
      const a = link('astern', 0, spacingFt);
      return { fwd: a.fwd + cornerShift.fwd, left: e.left, alt: a.alt + cornerShift.up };
    }
    default: throw new Error(`No formation called ${key}`);
  }
}

/**
 * The slot table. Where each wingman sits for formation `key` with #2 on side s: { 2: { ref, fwd, left, alt }, 3: …, 4: … }
 * (the 2-ship has only #2). options.ships: 2 (FORMATIONS' keys) or 4 (FOUR_FORMATIONS' keys); spacingFt: the LAB gap
 * (line abreast, Spread 4, the offset box's elements); stacked: the 4-ship's fighting wing keeps the stack.
 */
export function slotsFor(key, s, { ships = 2, spacingFt = 6000, stacked = true } = {}) {
  if (ships === 2) return { 2: { ref: 1, ...link(key, s, spacingFt) } };
  const ech = (side) => link('echelon', side, 6000);
  const rte = (side) => link('route', side, 6000);
  const ast = link('astern', 0, 6000);
  switch (key) {
    case 'spread4':
      return {
        2: { ref: 1, fwd: 0, left: s * spacingFt, alt: STACK_FT[2] },
        3: { ref: 1, fwd: 0, left: -s * spacingFt, alt: STACK_FT[3] },
        4: { ref: 3, fwd: 0, left: -s * spacingFt, alt: STACK_FT[4] },
      };
    case 'offsetBox':
      return {
        2: { ref: 1, fwd: 0, left: s * spacingFt, alt: STACK_FT[2] },
        3: { ref: 1, fwd: -BOX_DEPTH_FT, left: s * spacingFt / 2, alt: STACK_FT[3] },
        4: { ref: 3, fwd: 0, left: s * spacingFt, alt: STACK_FT[4] },
      };
    case 'fluid4':
      // #4 flies fighting wing off #3 as #2 does off Lead: 650 ft at 45° (FW4 fluidDeg, an estimate).
      return {
        2: { ref: 1, ...fwAt(fw4.twoRangeFt, fw4.fluidDeg, s), alt: STACK_FT[2] },
        3: { ref: 1, fwd: 0, left: -s * spacingFt, alt: STACK_FT[3] }, // abeam of Lead at the Setup's line abreast spacing (AFM8 brief p.20; Patrick ratified the 4-ship moves table, 5 Oct)
        4: { ref: 3, ...fwAt(fw4.twoRangeFt, fw4.fluidDeg, -s), alt: STACK_FT[4] },
      };
    case 'fw':
    case 'fluidMan':
      return {
        2: { ref: 1, ...fwAt(fw4.twoRangeFt, fw4.twoDeg, s), alt: stacked ? STACK_FT[2] : -FW_STEP_DOWN_FT },
        3: { ref: 2, ...fwAt(fw4.otherRangeFt, fw4.otherDeg, -s), alt: stacked ? STACK_FT[3] : -2 * FW_STEP_DOWN_FT },
        4: { ref: 3, ...fwAt(fw4.otherRangeFt, fw4.otherDeg, -s), alt: stacked ? STACK_FT[4] : -3 * FW_STEP_DOWN_FT },
      };
    case 'finger':
      return {
        2: { ref: 1, ...ech(s) },
        3: { ref: 1, ...ech(-s) },
        4: { ref: 3, ...ech(-s), alt: 2 * ech(-s).alt },
      };
    case 'route':
      return {
        2: { ref: 1, ...rte(s) },
        3: { ref: 1, ...rte(-s) },
        4: { ref: 3, ...rte(-s), alt: 2 * rte(-s).alt },
      };
    case 'echelon':
      return {
        2: { ref: 1, ...ech(s) },
        3: { ref: 2, ...ech(s), alt: 2 * ech(s).alt },
        4: { ref: 3, ...ech(s), alt: 3 * ech(s).alt },
      };
    case 'box':
      return {
        2: { ref: 1, ...ech(s) },
        3: { ref: 1, ...ech(-s) },
        4: { ref: 1, ...ast },
      };
    case 'trail':
      return {
        2: { ref: 1, ...ast },
        3: { ref: 2, ...ast, alt: 2 * ast.alt },
        4: { ref: 3, ...ast, alt: 3 * ast.alt },
      };
    default:
      throw new Error(`No four-ship formation called ${key}`);
  }
}

/** The 2-ship's #2 place for formation `key` on side s, read from the table: { fwd, left, alt } in Lead's frame. */
export function pairSlot(key, s, spacingFt = 6000) {
  const { ref: _ref, ...at } = slotsFor(key, s, { spacingFt })[2];
  return at;
}

/**
 * The side #2 ends on for a 2-ship change to formation `to` (+1 left of Lead, -1 right, 0 for line astern): the side asked
 * for (`want`: 'left', 'right' or 'keep'), or, kept, the side he is on now (`sNow`). The one copy of the planners' side choice.
 */
export function sideFor(to, want, sNow) {
  return to === 'astern' ? 0 : want === 'left' ? 1 : want === 'right' ? -1 : sNow;
}

/** Who flies off whom in a 4-ship formation: { 2: id, 3: id, 4: id }. */
export function refsFor(key) {
  const slots = slotsFor(key, -1, { ships: 4 });
  return { 2: slots[2].ref, 3: slots[3].ref, 4: slots[4].ref };
}

/** The words for where the four are: "Finger left (#3 and #4 left)", "Spread 4, #2 right". */
export function fourWords(where) {
  const f = FOUR_FORMATIONS[where.key];
  if (!f) return 'between formations';
  const w = (s) => (s > 0 ? 'left' : 'right');
  switch (where.key) {
    case 'finger':
    case 'route':
      // named by #2's side, as echelon is (Patrick 6 Oct 05:39Z: "left and right are just backwards"; by #3 and #4's side until V2.129)
      return `${f.label} ${w(where.side)} (#2 ${w(where.side)})`;
    case 'echelon':
      return `${f.label} ${w(where.side)}`;
    case 'offsetBox':
      return `${f.label} ${w(where.side)}`;
    case 'trail':
      return f.label;
    case 'fluid4':
      return `${f.label}, #3 ${w(-where.side)}`;
    default:
      return `${f.label}, #2 ${w(where.side)}`;
  }
}
