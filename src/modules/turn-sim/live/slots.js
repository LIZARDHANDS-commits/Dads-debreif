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

const DEG = Math.PI / 180;

/** The 2-ship's formations and their words. */
export const FORMATIONS = Object.freeze({
  lab: { label: 'Line abreast', sided: true },
  fw: { label: 'Fighting wing', sided: true },
  echelon: { label: 'Echelon', sided: true },
  route: { label: 'Route', sided: true },
  astern: { label: 'Line astern', sided: false },
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
 * Route spacing in wingspans: the slot 5 wingspans further out than echelon along the spinner-to-wingtip line, judged in
 * route out to max (Patrick 5 Oct 06:11Z: "Lets use a 5 plane spacing route, yours is too tight right now"; 6 Oct 02:11Z:
 * "Route IS on the line. Just moved down from eschalon 5 wingspans"; TS-103). It is wider than SMM 12.6 para 15's 1 to 3
 * wingspans (2 until step 2): the manual is the reference, Patrick's practice the default. Until V2.107 route was 5
 * wingspans out but only echelon's 25 ft back, nearly abreast, off the line.
 */
export const ROUTE_SPANS = Object.freeze({ slot: 5, min: 4, max: 6 });

/**
 * The spinner-to-wingtip line (SMM 12.4 paras 11-12, 12.6 para 15): from Lead's spinner, half a length ahead of his centre,
 * through his wingtip, half a span out, so it runs LENGTH_FT back for every WINGSPAN_FT out (about 45°). Echelon sits on it.
 */
export const LINE_BACK_PER_OUT = LENGTH_FT / WINGSPAN_FT;

/** The place alongFt further out along the spinner-to-wingtip line from `from` (a place on it), on side s. */
export function downTheLine(from, s, alongFt) {
  const out = alongFt / Math.hypot(1, LINE_BACK_PER_OUT);
  return { fwd: from.fwd - out * LINE_BACK_PER_OUT, left: s * (Math.abs(from.left) + out), alt: from.alt };
}

/** Heights above the formation's block, feet, by aircraft id (AFM8 brief p.14-15: low to high 4, 3, 1, 2; 300 ft stacks). */
export const STACK_FT = Object.freeze({ 1: 0, 2: 300, 3: -300, 4: -600 });

// ---- fighting wing: the desired places (settings, TS-58) ------------------------------------------------------------

/**
 * Fighting wing's desired place for the 2-ship: 750 ft at 45° of sweep, measured back from Lead's wing line (SMM 12.29
 * para 69, Fig 12.19). The default is the middle of the SMM's 500-1,000 ft and 30-60° band, an estimate. It is a setting
 * (Patrick 21:25Z, TS-58): setFwShape changes it, and the table's 'fw' reads it.
 */
export const FW2 = Object.freeze({ rangeFt: 750, sweepDeg: 45 });
/**
 * Fighting wing's band, the one table every planner, the judge and the bubble read (Fable review step 1).
 * rangeFt, sweepDeg: SMM 12.29 para 69, Fig 12.19. A desired place outside it is flown and flagged, never refused.
 * flyMarginFt [near, far]/Deg: what the sim will fly at all, the band widened by this (FW_LIMITS; estimates, not manual
 * limits). seeMarginFt [near, far]/Deg: where the pair is still recognised as fighting wing, the band widened by this
 * (FW_REGION, judge.js classifier; estimates). The far edge is wider than the near one, as before V2.155 (450-1,250 and
 * 400-1,300 ft); step 1 had made both 50/100 ft by mistake (TS-142). bubbleFt: never inside this of Lead (SMM 16.17 para 44c, SMM 16.23, Gen Book p.11).
 */
export const FW_BAND = Object.freeze({
  rangeFt: Object.freeze([500, 1000]), sweepDeg: Object.freeze([30, 60]),
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
  closeRangeFt: 300, // inside about 300 ft: the close formations (route reaches about 230 ft out)
  astern: Object.freeze({ maxAcrossFt: 22 }),
  echelon: Object.freeze({ maxAcrossFt: 56, fwdFt: Object.freeze([-90, 40]) }),
  route: Object.freeze({ extraSpans: 2, fwdFt: Object.freeze([-200, 60]) }), // out and back past the route band (Patrick 06:11Z; TS-103)
});

/**
 * The overshoot lane, one rule (SMM 12.27 para 65; Fable review step 1). A plan passes if #2 never gets more than
 * marginFt ahead of his slot's fore and aft place while inside rangeFt of Lead (estimate); his height under Lead is
 * measured inside belowRangeFt.
 */
export const LANE = Object.freeze({ marginFt: 100, rangeFt: 1000, belowRangeFt: 2000 });

/** A fighting wing side swap (TS-86): how far outside the bubble #2 crosses Lead's six (estimate). */
export const SWAP_CROSS_MARGIN_FT = 100;

/** Where a crossing behind Lead passes his six, fwd ft: outside the 500 ft bubble by SWAP_CROSS_MARGIN_FT (SMM 12.29 para 69; estimates). */
export const crossBehindFwd = (rangeFt) => -(Math.max(FW_BAND.bubbleFt, rangeFt * 0.9) + SWAP_CROSS_MARGIN_FT);

let fwShape = { ...FW2 };

/** Sets the 2-ship's desired fighting wing place ({ rangeFt, sweepDeg }; a missing value takes the default). */
export function setFwShape({ rangeFt = FW2.rangeFt, sweepDeg = FW2.sweepDeg } = {}) {
  fwShape = { rangeFt, sweepDeg };
}

/** The 2-ship's desired fighting wing place now: { rangeFt, sweepDeg }. */
export function fwShapeNow() {
  return { ...fwShape };
}

/**
 * Checks a desired fighting wing place: { ok: false, reason } outside what the sim flies (FW_LIMITS), else
 * { ok: true, flag } where flag says it is outside the SMM band (SMM 12.29 para 69) and flown anyway, or is null.
 * `who` names the aircraft in the words ("#2", "#3 and #4").
 */
export function checkFwShape(rangeFt, sweepDeg, who = '#2') {
  const r = Number(rangeFt);
  const d = Number(sweepDeg);
  const [rMin, rMax] = FW_LIMITS.rangeFt;
  const [dMin, dMax] = FW_LIMITS.sweepDeg;
  if (!Number.isFinite(r) || r < rMin || r > rMax) return { ok: false, reason: `${who}'s fighting wing spacing must be ${rMin}-${rMax.toLocaleString('en-CA')} ft.` };
  if (!Number.isFinite(d) || d < dMin || d > dMax) return { ok: false, reason: `${who}'s fighting wing sweep must be ${dMin}-${dMax}°.` };
  const outside = [];
  if (r < FW_BAND.rangeFt[0] || r > FW_BAND.rangeFt[1]) outside.push(`spacing ${r.toLocaleString('en-CA')} ft (500-1,000)`);
  if (d < FW_BAND.sweepDeg[0] || d > FW_BAND.sweepDeg[1]) outside.push(`sweep ${d}° (30-60°)`);
  return { ok: true, flag: outside.length ? `${who}: ${outside.join(' and ')} is outside the SMM's fighting wing band (SMM 12.29 para 69); flown anyway.` : null };
}

/**
 * Four-ship fighting wing: each link 650 ft; #2 at 45°, #3 and #4 at 30° (Patrick, 4 Oct 11:44Z; estimates until Dad says).
 * The angles are sweep back from the wing line of the aircraft flown off, the manual's way (SMM 12.29 para 69, Fig 12.19).
 * #3 and #4 sit on the side opposite #2 (SMM 16.38 para 104; AFM7 brief p.14). Their 30° matches Fig 16.29's picture; the
 * para 104 text says a 60° sweep: both are written down, and Patrick chose to set it himself through the setting (TS-58).
 */
export const FW4 = Object.freeze({ rangeFt: 650, twoDeg: 45, otherDeg: 30 });
/**
 * The desired places now: FW4 by default, changed by the settings (Patrick 21:25Z, TS-58). #2's pair (spacing and sweep off
 * Lead; #4 off #3 in Fluid 4 too) and #3/#4's pair (each off the one ahead in fighting wing).
 */
let fw4 = { twoRangeFt: FW4.rangeFt, twoDeg: FW4.twoDeg, otherRangeFt: FW4.rangeFt, otherDeg: FW4.otherDeg };

/** Sets the four-ship's desired fighting wing places ({ twoRangeFt, twoDeg, otherRangeFt, otherDeg }; a missing value takes FW4's). */
export function setFw4Shape({ twoRangeFt = FW4.rangeFt, twoDeg = FW4.twoDeg, otherRangeFt = FW4.rangeFt, otherDeg = FW4.otherDeg } = {}) {
  fw4 = { twoRangeFt, twoDeg, otherRangeFt, otherDeg };
}

/** The four-ship's desired fighting wing places now. */
export function fw4ShapeNow() {
  return { ...fw4 };
}
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
    // the desired place setting (FW2's 750 ft at 45° by default, SMM 12.29 para 69); 60 ft below is an estimate
    case 'fw': return { fwd: -fwShape.rangeFt * Math.sin(fwShape.sweepDeg * DEG), left: s * fwShape.rangeFt * Math.cos(fwShape.sweepDeg * DEG), alt: -60 };
    // about 45 ft out, 25 ft back, 5 ft down: estimates, the manual gives sight references (SMM 12.4 paras 11-12)
    case 'echelon': return { fwd: -25, left: s * 45, alt: -5 };
    // on the spinner-to-wingtip line, five wingspans further out along it than echelon (Patrick 6 Oct 02:11Z, ROUTE_SPANS,
    // TS-103; SMM 12.6 para 15 gives 1 to 3): about 163 ft out and 143 ft back, level or slightly low
    case 'route': return downTheLine(link('echelon', s, spacingFt), s, ROUTE_SPANS.slot * WINGSPAN_FT);
    // nose to tail about 10 ft (SMM 12.5 para 13): centre to centre is that plus a fuselage length; below the prop wash (estimate)
    case 'astern': return { fwd: -(LENGTH_FT + 10), left: 0, alt: -8 };
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
      // #4 flies fighting wing off #3 as #2 does off Lead: #2's spacing and sweep setting (FW4: 650 ft at 45° by default, an estimate).
      return {
        2: { ref: 1, ...fwAt(fw4.twoRangeFt, fw4.twoDeg, s), alt: STACK_FT[2] },
        3: { ref: 1, fwd: 0, left: -s * spacingFt, alt: STACK_FT[3] }, // abeam of Lead at the Setup's line abreast spacing (AFM8 brief p.20; Patrick ratified the 4-ship moves table, 5 Oct)
        4: { ref: 3, ...fwAt(fw4.twoRangeFt, fw4.twoDeg, -s), alt: STACK_FT[4] },
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
