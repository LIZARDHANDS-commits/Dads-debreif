// The turning rejoin, flown the way a pilot flies it (V2.63, TS-69; Patrick 5 Oct 08:12Z: "fast and effective like the SMM",
// "a more medium bank/power setting for a LONGER period"; card "Review, then build" 08:18Z; 08:20Z: "Keep with my overtake
// numbers"; 08:29Z: "realistic aircraft behaviour"; review turn-sim-review/rejoin-review-fable.md). One rule for every
// turning rejoin of the 2-ship, from line abreast (hot: #2 gets colder to reach the line) and from fighting wing (cold: he
// turns hotter to reach it). The straight-ahead rejoin (SARJ, straight-rejoin.js, TS-72) drops onto Lead's six and rides
// that line with Lead not turning (refactor step 5); this one rides the 30° line in Lead's turning frame (ride.js rideAim).
//
//  1. Lead turns into #2 at the press, at 30° of bank, slowing to 200 KIAS, and holds it until #2 is in (SMM 16.20 para
//     65b; Patrick 05:29Z, 06:16Z item 3; lead-turn-in.js leadTurnInto).
//  2. #2 aims for the Rates choice's line speed down the line, 210, 220 or 235 KIAS (tuning.js lineKiasNow; TS-133; 220 for all until V2.149, TS-75):
//     MAX until he has it. Hot (ahead of the line) he gets colder with geometry, not speed: never below Lead's 200 KIAS
//     (to fighting wing, its place's own speed inside Lead's turn), reaching the line at 200-210 (Patrick 17:29Z). Only when
//     no rejoin at that keeps him behind Lead's 3/9 line (close in and hot) does he dip below, then MAX again as he meets
//     the line (Patrick 17:53Z).
//  3. He gets onto the rejoin line, 30° off Lead's tail (moves.js TURNING_REJOIN.lineDeg; Patrick 11 Oct 06:30Z; 35° from
//     V2.232, the fin two-thirds out along Lead's upper wing, SMM 12.24 paras 56-57, Fig 12.14, TS-181) and
//     comes down it: in Lead's turning frame he heads across toward the line, more directly the further off it he is, and
//     down it once on it. Most of the closure is Lead's turn's, so on the line his bank stays close to Lead's own.
//  4. He holds the line's speed to the point where a stop with the torque floor and the boards just fits (idle only when the room left needs it),
//     then takes it out, arriving at the decision point (where the line reaches route's spacing) closing at no more than
//     Instructor's close-in rate (SMM 12.24 para 58; Patrick 06:24Z: the rate change at about 500 ft; 17:55Z: "then slow
//     down at the decision point").
//  5. From there the tracker (tracker.js) flows him through route on into the slot in one motion, the close moves Patrick
//     says work well (08:28Z). He goes behind Lead only with too much closure (SMM 12.27 para 65): the tracker's own law. To
//     fighting wing, the whole cone is his place: he settles where he arrives in it (Patrick 08:58Z; TS-75).
// To a close formation (TS-106, V2.113; Patrick 6 Oct 02:30Z-03:58Z) steps 3-5 are now the X: Lead held fixed on #2's canopy
// 30° off Lead's tail (35° from V2.232, 45° before) (flyOnTheX; a hot start first flies onto the line as above, the X from 750 ft in), at 10-20 KIAS over
// Lead; anywhere 250-100 ft from Lead, stable, he moves over and the decision point re-plans him up into the slot. The
// overshoot (overshootLegs) only when no rejoin plans that way.
// Chosen, the most efficient first (Patrick 08:20Z: "find a way to make the most efficient"): how sharply he captures the line
// (TURNING_REJOIN.aimsFt, the quickest that keeps him behind Lead's 3/9 line); a medium bank (60°) before the G rule; the
// line's 220 KIAS before a smaller overtake; and his least speed before the dip. #2 is flown through the same flight.js step as Lead, so the bank, roll rate and speed
// changes are the aircraft's own. Numbers are tuning.js TURNING_REJOIN's.
import { relativeTo } from './manoeuvres.js';
import { recordFlight, speedSeg, dryRunT } from './replay.js';
import { closeThrough, rejoinTo, slide, stopAt, legsFor, cornerBehind } from './recipes.js';
import { classify, judge } from './judge.js';
import { FORMATIONS, FW_BAND, fwShapeNow, pairSlot, LENGTH_FT, sideFor, LANE, LINE_BACK_PER_OUT } from './slots.js';
import { KIAS_OUTSIDE_LAB, REJOIN, REJOIN_CLOSURE_KT, TURNING_REJOIN, FW_FOLLOW, WING_BANKS, KINEMATIC, closureNow, closeInFtps, lineKiasNow } from './tuning.js';
import { onClosure, fromStep } from './closures.js';
import { leadTurnInto } from './lead-turn-in.js';
import { STEP_SEC, copyAircraft, SMOOTHER_CURVE_PEAK, smoother, smoothLegSec } from './flight.js';
import { RATE_SETS, CLOSE_SHAPING, G_RULE_BANK_DEG } from './rates.js';
import { laggedBank, centredBank, handOverAt } from './kinematic.js';
import { trackPhases, runTracker, phase } from './tracker.js';
import { holdInPlane, heldPoses } from './formation-turns.js';
import { acrossSixLegs } from './replan.js';
import { stallBankDeg } from './slow-down.js';
import { turnRadiusFromBankFt, bankDegFromG } from '../../../core/flight-math.js';
import { wrapPi, DEG } from '../../../core/angles.js';
import { G_FTPS2, KT_TO_FTPS } from '../../../core/units.js';
import { iasToTasKt, excessThrustPerWeight } from '../../../core/t6-performance.js';

const dt = STEP_SEC;
/** A search try replaces the best so far only when quicker by more than this (the chooser's half-second tie, chooser.js TIE_SEC). */
const BETTER_BY_SEC = 0.5;

/**
 * The tracker's legs from the decision point (#2 on side s) to `to` on side sTo. To fighting wing, into its slot. To a close
 * formation from where he moves over on the X (TS-106; Patrick 02:50Z: "Through the decision point, out slightly to route,
 * then up the line to eschelon. One smooth movement"; card 03:32Z): out to the nearest point of the spinner-to-wingtip line
 * (route itself when he moves over near 250 ft, about 50 ft down from echelon at 100 ft), flowing through it, then up the
 * line into echelon (or on into line astern, legsFor's crossover); to route, into route. at: #2's place in Lead's frame then.
 */
function tailLegs(s, to, sTo, spacingFt) {
  const rejoinOver = {
    rejoin: true,
    bankCapDeg: TURNING_REJOIN.windowBankDeg, // his bank matched to Lead's: headingBank caps the bank he adds to Lead's (TS-182; ±15° until V2.248)
    fwdRate: TURNING_REJOIN.windowFtps, // forward into route at the station-change rate (TS-181, TS-182; it was 40 ft/s, Patrick's fix 8dafc84)
    latRate: TURNING_REJOIN.windowFtps,
    targetBankDeg: CLOSE_SHAPING.targetBankDeg,
    targetOvertakeKt: CLOSE_SHAPING.targetOvertakeKt,
    wingPlane: true, // he goes down into route in Lead's banked wing plane, stepped down, from the decision point (TS-182)
  };
  if (to === 'fw') return [rejoinTo(pairSlot('fw', s, spacingFt)), ...(sTo !== s ? legsFor('fw', s, 'fw', sTo, spacingFt) : [])];
  const rSlot = pairSlot('route', sTo || s, spacingFt);
  const rest = legsFor('route', s, to, sTo, spacingFt);
  return [
    closeThrough(rSlot, { advanceTol: TURNING_REJOIN.routeFlowFt, ...rejoinOver }),
    // Up the spinner-wingtip line from route: its forward and lateral rates in the line's own proportion, so he moves along it,
    // not forward first and then in (TS-182 (5); until V2.248 both at 32 ft/s, and he went past echelon's fore and aft place).
    ...(rest.length ? rest.map((l) => ({ ...l, ...rejoinOver, fwdRate: CLOSE_SHAPING.targetLateralFtps * LINE_BACK_PER_OUT, latRate: CLOSE_SHAPING.targetLateralFtps })) : [slide(rSlot, rejoinOver)]),
  ];
}

/**
 * The overshoot, the last resort (Patrick 6 Oct 03:35Z: "only overshoot if there is no other option (instead of giving an
 * error that a rejoin isnt possible)"; SMM 12.27 para 65, Fig 12.18; card 03:33Z rule 5): power back, wings near level, he
 * passes behind and below Lead to the outside of Lead's turn and stabilizes there, his nose a length clear of Lead's tail;
 * then he crosses back with no overtake, a length clear, to the corner behind the place he wants and moves up into it. On a
 * rejoin to the outside (sTo the other side) he stays on the outside. The wings-level bank cap goes on after onClosure.
 */
function overshootLegs(s, to, sTo, spacingFt) {
  const slot = (key, side) => pairSlot(key, side, spacingFt);
  const key = to === 'astern' ? 'echelon' : to;
  const out = sTo !== 0 && sTo !== s ? sTo : -s;
  const clear = (side) => ({ fwd: -2 * LENGTH_FT, left: slot(key, side).left, alt: slot('astern', 0).alt });
  const rejoinOver = { rejoin: true, targetBankDeg: null, targetOvertakeKt: null, bankCapDeg: REJOIN.bankCapDeg };
  const legs = [stopAt(clear(out), rejoinOver)];
  if (to === 'astern') return [...legs, slide(slot('astern', 0), { fwdRate: 5, ...rejoinOver })];
  if (out === sTo) return [...legs, slide(slot(to, sTo), { fwdRate: 5, ...rejoinOver })];
  return [...legs, stopAt(clear(s), rejoinOver), slide(slot(to, s), { fwdRate: 5, ...rejoinOver })];
}

/**
 * The start of a turning rejoin from line abreast (TS-182; SMM 16.20 para 65b(2): "aggressively turn to point at the lead. At
 * this point, roll out of the turn and monitor the lead. Once a definite increase in the line of sight is detected, reverse
 * the turn to capture"; Fig 16.25: "Reverse when lead passes through approximate nose position"; Patrick 11 Oct 2026 03:37Z:
 * "shouldn't we basically be wings level until lead passes thru the nose?", 04:05Z: "Turn more at the start with 4-5 g quick
 * roll and wings level earlier", "quick but smooth").
 * Three tracker phases, all at Lead's 200 KIAS: he turns hard toward Lead, within pointMaxG, rolled quick but smooth
 * (pointRoll), and is rolled out wings level with Lead still pointAheadDeg short of the nose; wings level until Lead has come
 * lookThroughDeg through the nose and he has waited lookMinSec (or lookMaxSec); then the smooth reversal at full power
 * (reverseRoll, within pointMaxG), turning with Lead's line of sight until Lead sits frozenBearingDeg off the nose inside the
 * turn, where the ride freezes him (Fable's V2.249 flight, 04:40Z). At V2.250-V2.251's 66° (2.5 G) it swung him across
 * the 35° line to 13° off Lead's tail before he opened out again; at pointMaxG he stays outside it (Patrick 04:59Z: "I don't
 * want to overshoot the line").
 * Until V2.248 the ride's capture turned him at the 5 G flag's 78° bank and 180°/s and never held wings level.
 */
function pointingPhases(altFt, depthFt) {
  const TR = TURNING_REJOIN;
  const capDeg = bankDegFromG(TR.pointMaxG);
  const toLead = (L, W) => wrapPi(Math.atan2(L.yFt - W.yFt, L.xFt - W.xFt) - W.headingRad);
  // Lead's line of sight rate across #2's nose, rad/s: (r x v) / r^2 with r and v Lead's place and velocity from #2.
  const losRate = (L, W) => {
    const rx = L.xFt - W.xFt;
    const ry = L.yFt - W.yFt;
    const vx = L.tasFtps * Math.cos(L.headingRad) - W.tasFtps * Math.cos(W.headingRad);
    const vy = L.tasFtps * Math.sin(L.headingRad) - W.tasFtps * Math.sin(W.headingRad);
    return (rx * vy - ry * vx) / Math.max(1, rx * rx + ry * ry);
  };
  const clamp = (v, cap) => Math.max(-cap, Math.min(cap, v));
  // Within pointMaxG all told: when his height leg is pulling (coming out of a descent off a stack or a high start), the bank
  // that leaves room for it (G = vertical load / cos bank). Until V2.299 the cap was the level turn's, and from #2's +300 ft
  // stack the pointing turn and the reversal pulled 4.64 G.
  const capNow = (W) => Math.min(capDeg, Math.acos(Math.min(1, Math.max(1, (W.g ?? 1) * Math.cos((W.bankDeg ?? 0) * DEG)) / TR.pointMaxG)) / DEG);
  const common = { rejoin: true, pursuitEnds: true, roll: TR.pointRoll, kiasCmd: TR.pointKias };
  let side0 = 0; // the side Lead starts on, off #2's nose
  let lookFrom = null;
  let levelFrom = null; // when he came wings level
  let reverseFrom = null;
  return [
    phase({ fwd: 0, left: 0, alt: altFt }, {
      ...common,
      bankCapDeg: capDeg,
      pursuit: (L, W) => {
        const err = toLead(L, W) / DEG;
        side0 ||= Math.sign(err);
        // Rolled out by the time Lead is pointAheadDeg off the nose: the bearing still to come off while he rolls out at
        // pointRoll, his own turn (fading as he rolls out) less Lead's drift across the nose.
        const rollSec = Math.abs(W.bankDeg) / TR.pointRoll.maxRateDps + TR.pointRoll.maxRateDps / TR.pointRoll.maxAccelDps2;
        const turnDps = (G_FTPS2 * Math.tan(Math.abs(W.bankDeg) * DEG)) / Math.max(1, W.tasFtps) / DEG;
        const comeOff = (turnDps / 2 - side0 * (losRate(L, W) / DEG)) * rollSec;
        return { bankDeg: clamp(TR.pointGain * err, capNow(W)), psiCmd: W.headingRad, kiasCmd: TR.pointKias, done: side0 * err <= TR.pointAheadDeg + Math.max(0, comeOff) };
      },
    }),
    phase({ fwd: 0, left: 0, alt: altFt }, {
      ...common,
      bankCapDeg: capDeg,
      pursuit: (L, W, t) => {
        lookFrom ??= t;
        if (Math.abs(W.bankDeg) > TR.levelDeg) levelFrom = null;
        else levelFrom ??= t;
        const through = (-toLead(L, W) * side0) / DEG >= TR.lookThroughDeg;
        const waited = levelFrom !== null && t - levelFrom >= TR.lookMinSec - 1e-9;
        return { bankDeg: 0, psiCmd: W.headingRad, kiasCmd: TR.pointKias, done: (through && waited) || t - lookFrom >= TR.lookMaxSec - 1e-9 };
      },
    }),
    phase({ fwd: 0, left: 0, alt: altFt }, {
      ...common,
      // From the reversal Lead comes up to lineElevDeg above the horizon as the range closes, no deeper than he is, so the
      // ride starts on its own height law with no step (V2.251: a 0.8 s pull of 2.1 G at the hand-over).
      slopedAlt: true,
      slopedMaxFt: depthFt,
      roll: TR.reverseRoll,
      bankCapDeg: capDeg,
      pursuit: (L, W, t) => {
        reverseFrom ??= t;
        // He turns with Lead's line of sight and brings Lead back across the nose onto the frozen bearing, inside the turn,
        // taking out the bearing error over frozenTauSec; done there, where the ride freezes him (Fable 04:40Z).
        const err = wrapPi(toLead(L, W) - side0 * TR.frozenBearingDeg * DEG);
        const omega = losRate(L, W) + err / TR.frozenTauSec;
        const bankDeg = Math.atan((W.tasFtps * omega) / G_FTPS2) / DEG;
        // Full power through the reversal and the roll-out, to reach the line at 200-210 KIAS (Patrick 04:59Z: "Keep full power
        // on the reversal to hit the line at 200-210"); then the ride's overtake.
        const kiasCmd = lineKiasNow();
        return { bankDeg: clamp(bankDeg, capNow(W)), psiCmd: W.headingRad, kiasCmd, done: Math.abs(err) / DEG <= TR.reverseDoneDeg || t - reverseFrom >= TR.reverseMaxSec - 1e-9 };
      },
    }),
  ];
}

/**
 * On the way in after the SMM's start (TS-182 (3); SMM 12.24 para 57: "if the lead is being held at a constant position on
 * the windshield, an intercept course has been established"; Patrick 11 Oct 2026 04:11Z-04:16Z: "we do what we have to with
 * pitch and power and bank to keep that aspect frozen in the screen"; Fable 04:19Z): a control law, not a line. Bank holds
 * Lead's bearing off #2's nose, from where the reversal left it onto frozenBearingDeg over frozenSettleFt, then frozen there;
 * pitch holds him lineElevDeg above #2's horizon (the line's depth law, slopedAlt); power holds frozenKias to the decision point. It ends where #2 is out at route's lateral spacing (decisionFt down the 30° line).
 */
function frozenPhase(altFt, s, decisionFt, bankCapDeg, trail = false, toFw = false) {
  const TR = TURNING_REJOIN;
  const routeOutFt = decisionFt * Math.cos(TR.lineDeg * DEG);
  // Lead's bearing off #2's nose, positive to the left, and how fast it moves (rad, rad/s).
  const bearing = (L, W) => wrapPi(Math.atan2(L.yFt - W.yFt, L.xFt - W.xFt) - W.headingRad);
  const losRate = (L, W) => {
    const rx = L.xFt - W.xFt;
    const ry = L.yFt - W.yFt;
    const vx = L.tasFtps * Math.cos(L.headingRad) - W.tasFtps * Math.cos(W.headingRad);
    const vy = L.tasFtps * Math.sin(L.headingRad) - W.tasFtps * Math.sin(W.headingRad);
    return (rx * vy - ry * vx) / Math.max(1, rx * rx + ry * ry);
  };
  let from = null; // { bearing, range } where he starts
  return phase({ fwd: 0, left: 0, alt: altFt }, {
    slopedAlt: true,
    heightG: trail ? TR.trailHeightG : TR.heightG,
    rejoin: true,
    pursuitEnds: true,
    handOverHere: true,
    roll: TR.formRoll,
    bankCapDeg,
    pursuit: (L, W) => {
      const rel = relativeTo(L, W);
      const range = Math.hypot(rel.fwd, rel.left);
      const b = bearing(L, W);
      from ??= { bearing: b, range };
      // The bearing he holds: from where he started onto frozenBearingDeg (Lead on the side away from s) over the first
      // frozenSettleFt of the way in, then frozen there.
      const share = Math.max(0, Math.min(1, (from.range - range) / Math.max(1, Math.min(trail ? TR.trailSettleFt : TR.frozenSettleFt, from.range - decisionFt))));
      const want = from.bearing + share * (-s * TR.frozenBearingDeg * DEG - from.bearing);
      // Turn with Lead's line of sight, and take out the bearing error over frozenTauSec (Lead too far left: turn left).
      let omega = losRate(L, W) + wrapPi(b - want) / TR.frozenTauSec;
      // To fighting wing from trail, over the last trailFwSlowFt he blends onto the heading that keeps him still in Lead's
      // turning frame, so he enters the cone with no cut left to take out: with Lead's bearing frozen to the end he came in
      // 12° cut, 45 ft/s inward, and the cone's tracker stopped it with a 3 G turn away as Lead rolled out (Fable's v2272).
      if (toFw) {
        const k = 1 - Math.max(0, Math.min(1, (range - decisionFt) / TR.trailFwSlowFt));
        const wL = (G_FTPS2 * Math.tan((L.bankDeg ?? 0) * DEG)) / Math.max(1, L.tasFtps);
        const rx = W.xFt - L.xFt;
        const ry = W.yFt - L.yFt;
        const still = Math.atan2(L.tasFtps * Math.sin(L.headingRad) + wL * rx, L.tasFtps * Math.cos(L.headingRad) - wL * ry);
        omega = (1 - k) * omega + k * (wL + wrapPi(still - W.headingRad) / TR.frozenTauSec);
      }
      const bankDeg = Math.atan((W.tasFtps * omega) / G_FTPS2) / DEG;
      // Power holds frozenKias, 210 KIAS, all the way to the decision point (Patrick 11 Oct 06:11Z: "I can hit 210 knots at
      // the decision point"; "we can start slowing below 210 after the decision point"). V2.255-V2.259 took his closure off
      // evenly to about 5 kt there instead, which Patrick found too slow up the line.
      // To fighting wing from trail he comes off his overtake over the last trailFwSlowFt, arriving in the cone at Lead's
      // speed: at 210 KIAS the cone's tracker turned him away at 3 G to stop (Fable's v2272 flight).
      const kiasCmd = toFw ? L.kias + (TR.frozenKias - KIAS_OUTSIDE_LAB) * Math.max(0, Math.min(1, (range - decisionFt) / TR.trailFwSlowFt)) : TR.frozenKias;
      // From trail he starts inside route's lateral spacing, far back, so there only the range ends it.
      const done = (!trail && Math.abs(rel.left) <= routeOutFt) || range <= decisionFt;
      return { bankDeg: Math.max(-bankCapDeg, Math.min(bankCapDeg, bankDeg)), psiCmd: W.headingRad, kiasCmd, done, abort: s * rel.left < -50 };
    },
  });
}

/**
 * The fighting wing cone's middle on side s, in Lead's frame (FW_BAND: 750 ft, 45°): where a turning rejoin to fighting wing
 * aims. The fastest arrival wins and a slight miss is accepted; the band is only the settle test, never the aim (Patrick
 * 10 Oct 2026 19:52Z; it had been moved to the 30° edge to suit the gauge, review 10 Oct 2.1b).
 */
function coneMiddle(s) {
  const r = (FW_BAND.rangeFt[0] + FW_BAND.rangeFt[1]) / 2;
  const sw = ((FW_BAND.sweepDeg[0] + FW_BAND.sweepDeg[1]) / 2) * DEG;
  return { fwd: -r * Math.sin(sw), left: s * r * Math.cos(sw) };
}

/** The first step from `from` at which a recorded flight has flown its whole plan (free), at most `cap`. */
function leadEndStep(rec, from, cap) {
  for (let n = from; n < cap; n++) if (rec.at(n).free) return n;
  return Math.max(from, cap);
}

/** #2's place in Lead's banked wing plane { fwd, left, up } (slotInWorld's inverse, kinematic.js). */
function bodyIn(L, W) {
  const dx = W.xFt - L.xFt;
  const dy = W.yFt - L.yFt;
  const u = W.altAboveFt - L.altAboveFt;
  const cx = Math.cos(L.headingRad);
  const cy = Math.sin(L.headingRad);
  const l = -cy * dx + cx * dy;
  const phi = (L.bankDeg ?? 0) * DEG;
  return { fwd: cx * dx + cy * dy, left: l * Math.cos(phi) - u * Math.sin(phi), up: l * Math.sin(phi) + u * Math.cos(phi) };
}

/**
 * The turning rejoin from the decision point (TS-182 (4)-(5); SMM 12.24 para 58): a place in Lead's banked wing plane that
 * moves from where #2 is, down into the plane and forward towards route, then up the spinner-wingtip line into echelon,
 * carrying the closure he brings and taking it off evenly to none in the slot. holdInPlane flies him after it with his own
 * limits, so his overtake comes off, his bank stays with Lead's and Lead moves up behind the canopy bow. Until V2.248 tracker
 * legs flew it: he came off the line still converging, slid 30-50 ft inside route and went past echelon's fore and aft place.
 * from, vel: #2's place in Lead's plane at the decision point and how it is moving. Returns { bodyAt(i), steps }.
 */
function tailPath(from, vel, s, to, spacingFt, sTo = s, crossAt = null, notBeforeStep = null) {
  const legs = [];
  if (sTo !== s) {
    // To the other side: under Lead's tail, as low as the crossover's corner (below his wake), then up into the new place.
    // crossAt: the 4-ship element's crossing behind Lead, in the frame of the place he joins on (four-rejoin.js).
    const end = pairSlot(to, sTo, spacingFt);
    const corner = cornerBehind(end, spacingFt);
    // The element crosses behind Lead first, then goes on under the one he joins on (so he does not pass close behind him
    // on the way up into his place) and up into it.
    const under = { fwd: corner.fwd, left: 0, up: corner.alt - TURNING_REJOIN.underExtraFt };
    legs.push(...(crossAt ? [crossAt, under] : [under]), { fwd: end.fwd, left: end.left, up: end.alt });
  } else {
    const route = pairSlot('route', s, spacingFt);
    legs.push({ fwd: route.fwd, left: route.left, up: route.alt });
    if (to === 'echelon') {
      const ech = pairSlot('echelon', s, spacingFt);
      legs.push({ fwd: ech.fwd, left: ech.left, up: ech.alt });
    }
  }
  // He carries his way in from the decision point: down into Lead's plane and forward towards route, then up the
  // spinner-wingtip line, his closure coming off evenly from what he brought to nothing in the slot, never stopping on the
  // way (Patrick 11 Oct 06:11Z: "use smooth bank and power to transition that momentum down into route then up in to
  // echelon. we do not have to stop at any spot"). Until V2.260 each part went at the station-change rate (windowFtps) and
  // eased to a stop, after a decision point he reached closing at about 5 kt.
  const pts = [{ fwd: from.fwd, left: from.left, up: from.up }, ...legs];
  // Across, his height in Lead's plane goes with the way (the plane tilts across Lead, so that is about level in the world),
  // so he is below the wake as he passes under the tail; on his own side the drop is its own change (below).
  const upAlong = sTo !== s;
  const lens = legs.map((leg, k) => Math.hypot(leg.fwd - pts[k].fwd, leg.left - pts[k].left));
  const total = lens.reduce((a, x) => a + x, 0);
  const v0 = Math.max(TURNING_REJOIN.windowFtps, Math.hypot(vel.fwd, vel.left));
  // The drop into Lead's plane comes off the same way, from the rate he brings down at the decision point (at least
  // tailUpFtps) to none in the plane (Patrick 05:31Z: "smaller, smoother movements").
  const dUp = legs[0].up - from.up;
  const upSec = Math.max(TURNING_REJOIN.tailMinSec, (2 * Math.abs(dUp)) / Math.max(TURNING_REJOIN.tailUpFtps, Math.sign(dUp) * vel.up));
  const t1 = Math.max(TURNING_REJOIN.tailMinSec, (2 * total) / v0, upAlong ? 0 : upSec);
  // The 4-ship element crosses behind Lead only once the one ahead is in (SMM 16.34 para 96: "#3 should not cross behind
  // lead until #2 is stabilized"). When the one way would have him behind Lead before that (notBeforeStep, steps after the
  // decision point), he closes to that point with his closure coming off to none, holds it in Lead's frame until then, and
  // goes on with the closure building up and coming off again (half what he brought at most; estimate).
  const crossSec = crossAt ? t1 * (1 - Math.sqrt(Math.max(0, 1 - lens[0] / total))) : Infinity;
  const split = notBeforeStep != null && crossSec < notBeforeStep * dt;
  const tA = Math.max(TURNING_REJOIN.tailMinSec, (2 * lens[0]) / v0);
  const holdSec = split ? Math.max(0, notBeforeStep * dt - tA) : 0;
  const tB = Math.max(TURNING_REJOIN.tailMinSec, (3 * (total - lens[0])) / v0);
  const t = split ? tA + holdSec + tB : t1;
  const distAt = (ts) => {
    if (!split) return total * (1 - (1 - Math.min(1, ts / t)) ** 2);
    if (ts < tA) return lens[0] * (1 - (1 - ts / tA) ** 2);
    const x = Math.min(1, Math.max(0, (ts - tA - holdSec) / tB));
    return lens[0] + (total - lens[0]) * x * x * (3 - 2 * x);
  };
  const steps = Math.ceil(t / dt);
  const rawAt = (i) => {
    // Before the decision point, where he was coming from (so the first corner is rounded too).
    if (i < 0) return { fwd: from.fwd + vel.fwd * i * dt, left: from.left + vel.left * i * dt, up: from.up + vel.up * i * dt };
    let d = distAt(i * dt); // how far along: closure v0 at the start, off evenly to none at the end
    let k = 0;
    while (k < lens.length - 1 && d > lens[k]) d -= lens[k++];
    const f = lens[k] > 0 ? Math.min(1, d / lens[k]) : 1;
    const a = pts[k];
    const z = legs[k];
    const x = Math.min(1, (i * dt) / upSec);
    const drop = (1 - x) * (1 - x);
    // Up: Lead's plane at route, then the line's own up into the slot, with what is left of the drop on top.
    const upLine = k === 0 ? legs[0].up : legs[0].up + f * (z.up - legs[0].up);
    const up = upAlong ? a.up + f * (z.up - a.up) : upLine + drop * (from.up - legs[0].up);
    return { fwd: a.fwd + f * (z.fwd - a.fwd), left: a.left + f * (z.left - a.left), up };
  };
  // The corners (off the line at the decision point, at route onto the spinner-wingtip line) rounded: the place averaged over
  // blendSec either side, twice, so his acceleration, and with it his bank and G, changes smoothly too, not in steps (Patrick
  // 03:40Z "very smooth", 05:31Z "still too jerky"; once until V2.255).
  const w = Math.round(TURNING_REJOIN.tailBlendSec / dt);
  const n = 2 * w + 1;
  const lo = -2 * w; // raw places from lo, so each step has both averages' full span
  const keys = ['fwd', 'left', 'up'];
  // Raw places on 2w steps past the end too, so the averaged way ends exactly in the slot (smooth[steps + 2w]).
  const raw = Array.from({ length: steps + 1 + 6 * w }, (_, k) => rawAt(lo + k));
  const average = (rows) => {
    const out = [];
    const sum = { fwd: 0, left: 0, up: 0 };
    for (let k = 0; k < rows.length; k++) {
      for (const c of keys) sum[c] += rows[k][c];
      if (k >= n) for (const c of keys) sum[c] -= rows[k - n][c];
      if (k >= n - 1) out.push({ fwd: sum.fwd / n, left: sum.left / n, up: sum.up / n });
    }
    return out; // out[j] is centred on rows[j + w]
  };
  const smooth = average(average(raw)); // smooth[j] is centred on raw[j + 2w], step lo + j + 2w = j
  // The averaging moves the start off where he is; that difference fades out smoothly over the first 2w steps, so the way
  // starts on him with no step in his place or G (V2.253: a 0.45 G kick at the decision point).
  const off0 = { fwd: from.fwd - smooth[0].fwd, left: from.left - smooth[0].left, up: from.up - smooth[0].up };
  const fade = (i) => {
    const x = Math.min(1, i / (2 * w));
    return 1 - x * x * x * (10 - 15 * x + 6 * x * x);
  };
  const bodyAt = (i) => {
    const p = smooth[Math.max(0, Math.min(smooth.length - 1, i))];
    const f = fade(Math.max(0, i));
    return { fwd: p.fwd + f * off0.fwd, left: p.left + f * off0.left, up: p.up + f * off0.up };
  };
  // He is in his place, as a pilot sees it, once the way is within tailInFt of its end: Lead rolls out from there (Patrick
  // 11 Oct 06:10Z: "as soon as the plane is in echelon, the formation can roll out"), not when its last inch has settled.
  const end = smooth[smooth.length - 1];
  let inSteps = smooth.length - 1;
  while (inSteps > 0 && Math.hypot(smooth[inSteps - 1].fwd - end.fwd, smooth[inSteps - 1].left - end.left, smooth[inSteps - 1].up - end.up) <= TURNING_REJOIN.tailInFt) inSteps--;
  return { bodyAt, steps: steps + 2 * w, inSteps };
}

/**
 * When #2 is really in his place after tailPath's way, not just the way's end: flown once with Lead turning on, the first
 * step he is within tailInFt of where he settles in Lead's plane and moving on it at under tailStillFtps. Lead rolls out from
 * there (Patrick 11 Oct 06:10Z: "as soon as the plane is in echelon, the formation can roll out"; 06:15Z: #2 was still out
 * of position as Lead rolled out). From the decision point's step n0; returns how many steps after it.
 */
function arrivedStep(longRec, n0, wing, tail, slot) {
  const leadRec = fromStep(longRec, n0);
  const { rel } = holdInPlane(leadRec, leadRec.at(0), wing, { fwd: slot.fwd, left: slot.left, up: slot.alt }, tail.steps, tail.bodyAt, TURNING_REJOIN.tailHold);
  const bodyAt = (i) => {
    const L = leadRec.at(i);
    return bodyIn(L, { xFt: L.xFt + rel[i].x, yFt: L.yFt + rel[i].y, altAboveFt: L.altAboveFt + rel[i].z });
  };
  // Where he settles with Lead turning on: his place as he holds it (a foot or two off the slot's figures inside a turn).
  const held = bodyAt(rel.length - 1);
  for (let i = Math.min(tail.inSteps, rel.length - 1); i < rel.length; i++) {
    const b = bodyAt(i);
    const prev = bodyAt(Math.max(0, i - 1));
    const off = Math.hypot(b.fwd - held.fwd, b.left - held.left, b.up - held.up);
    const moving = Math.hypot(b.fwd - prev.fwd, b.left - prev.left, b.up - prev.up) / dt;
    if (off <= TURNING_REJOIN.tailInFt && moving <= TURNING_REJOIN.tailStillFtps) return i;
  }
  return rel.length - 1;
}

/**
 * A hard pull to start (hardSec, the search's last resort from line abreast): #2 banks away from Lead at the bank cap, idle and
 * boards, for hardSec or until he is inside 1,000 ft of Lead's 45° line.
 */
function hardPullPhase({ s, t0, lineFt, bankCapDeg, floorKias, hardSec }) {
  return phase({ fwd: 0, left: 0, alt: lineFt }, {
    pursuit: (L, W, t) => {
      const cap = Math.min(bankCapDeg, stallBankDeg(W.kias));
      return {
        bankDeg: -s * cap,
        slowStage: 'idleBoards',
        kiasCmd: floorKias,
        psiCmd: W.headingRad,
        done: t >= t0 + hardSec - 1e-9 || (relativeTo(L, W).fwd * Math.cos(45 * Math.PI/180) + relativeTo(L, W).left * s * Math.sin(45 * Math.PI/180)) < 1000,
      };
    },
    pursuitEnds: true,
    rejoin: true,
  });
}

/** The tail legs (tracker legs from the decision point into the place) in Lead's height, and the first leg's flow closure. */
const onLeadAlt = (leadAlt, list) => list.map((p) => ({ ...p, slot: { ...p.slot, alt: p.slot.alt + leadAlt } }));

/**
 * The ways a turning rejoin goes, by destination (refactor step 4: one builder, the destination as data). Each says whether
 * it starts with the hard pull, when the SMM's start (pointing turn, then Lead frozen in the windscreen) is flown, the frozen
 * phase and the approach (the ride) that take him to the decision point, and the tail from there.
 *  - fw: to fighting wing, the ride into the cone, then cone tracking (from trail, the frozen bearing to the cone instead);
 *  - x: to a close formation on the ride (the 2-ship and the 4-ship's element), then the tail legs (or none on the tail path);
 * (Until refactor step 5 a third way, line, flew the 4-ship's #2 to route on the older line law; no caller has asked it since
 * V2.299.)
 */
const REJOIN_WAYS = Object.freeze({
  fw: Object.freeze({
    hardPull: true,
    // From trail after a break (point 'frozen'): Lead eased out onto the frozen bearing with a small, early, gentle bank to
    // trailFwHandFt, where the ride takes him into the cone (Patrick 11 Oct 2026 07:57Z).
    pointed: ({ point, hardSec, initialRange }) => point === 'frozen' && hardSec === 0 && initialRange > TURNING_REJOIN.pointFromFt,
    frozen: ({ lineFt, s, bankCapDeg }) => frozenPhase(lineFt, s, TURNING_REJOIN.trailFwHandFt, bankCapDeg, true, true),
    // Ride tracking into the fighting wing cone (from trail the frozen bearing carries him to the cone instead)
    approach: ({ lineFt, s, initialRange, bankCapDeg, hardSec }) => phase({ fwd: 0, left: 0, alt: lineFt }, {
      kind: 'ride', slopedAlt: true,
      lineDeg: TURNING_REJOIN.lineDeg,
      side: s,
      captureAlongFt: initialRange < 2000 ? initialRange : undefined,
      ...TURNING_REJOIN.fwApproach, // window, close aim point, decision point, cone ease start and capture distance
      coneEase: true,
      bankCapDeg,
      floorKias: KIAS_OUTSIDE_LAB,
      initialPclMax: hardSec === 0,
      isFw: true,
      slowStage: 'power',
      rejoin: true,
    }),
    // Followed by fighting wing cone tracking
    tail: ({ lineFt, s, sTo, leastKias }, pointed) => [phase({ fwd: 0, left: 0, alt: lineFt }, {
      ...FW_FOLLOW,
      // From trail he settles at a formation roll rate, not snapping at 100°/s (Fable's v2272). From line abreast, after the
      // hard turn into the cone, the place he flies to speeds up with no corner and he eases onto Lead's heading with a small,
      // early bank, so the roll-out has no kink and no rock through level (V2.335; Fable's V2.330 flight).
      ...(pointed ? { roll: TURNING_REJOIN.formRoll } : { refJerkFtps3: TURNING_REJOIN.coneRefJerkFtps3, alignSec: TURNING_REJOIN.coneAlignSec, alignDoneDeg: TURNING_REJOIN.coneAlignDoneDeg }),
      isFw: true,
      side: sTo || s,
      goal: () => coneMiddle(sTo || s),
      coneAlt: true,
      coneEnergy: true,
      slowStage: 'power',
      bankCapDeg: WING_BANKS.fwFollowBankCapDeg,
      rejoin: true,
      floorKias: leastKias,
    })],
  }),
  x: Object.freeze({
    hardPull: true,
    // From line abreast, first the SMM's start (TS-182; SMM 16.20 para 65b(2)): a firm turn to point at Lead, then wings level
    // watching him until his line of sight moves, then the reversal onto the line (the ride's capture). From trail after a
    // break (point 'frozen') Lead is already near the nose: no pointing turn, he eases Lead out onto the frozen bearing over
    // trailSettleFt with a small, early, gentle bank (Patrick 11 Oct 2026 07:57Z).
    pointed: ({ point, hardSec, initialRange }) => Boolean(point && hardSec === 0 && initialRange > TURNING_REJOIN.pointFromFt),
    // After the SMM's start, Lead held frozen in the windscreen to the decision point (TS-182 (3)); else the ride (Step 7):
    // onto the 30° line along it and up it at 210 KIAS to the decision point, all in Lead's frame (the X, Lead fixed on the
    // canopy, so there is no separate X phase).
    frozen: ({ lineFt, s, xDecisionFt, bankCapDeg, point }) => frozenPhase(lineFt, s, xDecisionFt, bankCapDeg, point === 'frozen'),
    approach: ({ lineFt, s, bankCapDeg, element, crossIn, xDecisionFt, floorKias, hardSec }) => phase({ fwd: 0, left: 0, alt: lineFt }, {
      kind: 'ride', slopedAlt: true,
      lineDeg: TURNING_REJOIN.lineDeg,
      side: s,
      captureFt: TURNING_REJOIN.captureFt,
      bankCapDeg, // the search's: a medium bank first, 5 G a flag he stays inside (TS-182), the aircraft's own limits last (Patrick 6 Oct 04:07Z "there is NO LIMIT on bank angle in formation")
      // The 4-ship element (four-rejoin.js elementTurning): far down the line at full power, his height gentler.
      ...(element ? { far: element.far, heightG: element.heightG } : {}),
      roll: crossIn ? TURNING_REJOIN.pointRoll : undefined, // Away, crossing Lead's six onto the line, quick but smooth (at the aircraft's own rate he never captured it); otherwise the aircraft's own roll, as before TS-182 (a formation rate here pulled 6 G from fighting wing)
      windowFt: xDecisionFt,
      carrotWindowFt: xDecisionFt,
      legThrough: true, // his height leg to the line flies to its end, then the line's law (tracker.js heightOf)
      floorKias,
      initialPclMax: hardSec === 0,
      rejoin: true,
    }),
    tail: ({ s, to, sTo, spacingFt, leadAlt, overshoot, pathTail }) => {
      const flowFtps = closeInFtps(TURNING_REJOIN.decisionArriveRates);
      if (overshoot) {
        return onLeadAlt(leadAlt, onClosure(overshootLegs(s, to, sTo, spacingFt), { closeIn: true })).map((p, i) =>
          i === 0 ? { ...p, bankCapDeg: TURNING_REJOIN.overshootBankDeg } : p
        );
      }
      if (sTo !== s && sTo !== 0 && !pathTail) return onLeadAlt(leadAlt, onClosure(acrossSixLegs(null, s, to, sTo, spacingFt), { closeIn: true }));
      if (!pathTail) {
        return onLeadAlt(leadAlt, onClosure(tailLegs(s, to, sTo, spacingFt), { closeIn: true })).map((p, i) =>
          (i === 0 ? { ...p, closureFtps: Math.min(p.closureFtps, flowFtps) } : p)
        );
      }
      return [];
    },
  }),
});

/**
 * The phase list for one turning rejoin (refactor step 4): the hard pull if asked, the SMM's start or the approach to the
 * decision point, then the way's tail. Returns { phases, numApproachPhases (the phases before the tail), pointed }.
 */
function rejoinPhases(way, c) {
  const phases = [];
  if (way.hardPull && c.hardSec > 0) phases.push(hardPullPhase(c));
  const pointed = way.pointed(c);
  if (pointed && c.point !== 'frozen') phases.push(...pointingPhases(c.lineFt, c.leadAlt - c.lineFt));
  phases.push(pointed ? way.frozen(c) : way.approach(c));
  const numApproachPhases = phases.length;
  phases.push(...way.tail(c, pointed));
  return { phases, numApproachPhases, pointed };
}

/**
 * The whole rejoin as a single continuous tracker phase sequence: line intercept, canopy-X (or fighting wing
 * cone arrival with coneEase bank-matching), into close-in/cone phases with zero stitched handovers.
 */
export function flyTurningRejoinWith({ lead, wing, into, s, to, sTo, spacingFt, blockFt, t0, aimFt, bankCapDeg, overtakeKt, lowFloor, upFt = 0, minG = null, overshoot = false, xLaw = true, hardSec = 0, allowAcross = false, crossIn = false, limitSec = Infinity, holdSec = null, point = false, element = null, joinAtFt = null }) {
  const TR = TURNING_REJOIN;
  const onX = to !== 'fw' && xLaw;
  // From the decision point into route and echelon on his own side, the way is a place moving in Lead's banked wing plane
  // (tailPath, flown by holdInPlane), not tracker legs (TS-182 (4)-(5)).
  // To the other side too, the same way: from the decision point under Lead's tail, below his wake, then up into the place
  // (Patrick 11 Oct 06:24Z: "it should be exactly the same except at decision point it goes underneath lead then up in to
  // echelon"); until V2.262 that was tracker legs across his six, which planned too long and lost to the tracker alone.
  const pathTail = onX && !overshoot && (sTo === s || sTo === -s) && (to === 'echelon' || to === 'route');
  const decisionFt = onX || to === 'fw' ? fwShapeNow().rangeFt : Math.abs(pairSlot('route', s, spacingFt).left) / Math.cos(TR.lineDeg * DEG);

  const leadR = turnRadiusFromBankFt(iasToTasKt(KIAS_OUTSIDE_LAB, blockFt) * KT_TO_FTPS, REJOIN.leadBankDeg);
  const placeR = Math.hypot(decisionFt * Math.sin(TR.lineDeg * DEG), leadR - decisionFt * Math.cos(TR.lineDeg * DEG));
  const leastKias = to === 'fw' ? Math.floor((KIAS_OUTSIDE_LAB * placeR) / leadR) : KIAS_OUTSIDE_LAB;
  const floorKias = lowFloor ? KIAS_OUTSIDE_LAB - TR.undertakeKias : Math.max(leastKias, KIAS_OUTSIDE_LAB);

  const leadAlt = into.longRec.at(0).altAboveFt;
  // The capture's own height leg goes to the line's 4° depth where he joins it (TS-181), not the 50 ft floor: from there
  // the line's law (tracker.js heightOf) carries the 4° in (Fable's V2.232 audit: far out he sat 50 ft low).
  const joinFt = joinAtFt ?? Math.min(Math.hypot(into.longRec.at(0).xFt - wing.xFt, into.longRec.at(0).yFt - wing.yFt), TR.rideCaptureAlongFt);
  // From trail (point 'frozen') there is no capture leg: the line's law flies his height from the start, gently (trailHeightG),
  // since a leg to a fixed depth ended off the 4° and gave a 2 G pull and a 0.6 G push at the hand-over.
  const lineFt = point === 'frozen' ? wing.altAboveFt : leadAlt - Math.max(-TR.lineUpFt, joinFt * Math.tan(TR.lineElevDeg * DEG));
  // The decision point, to a close formation: where the line reaches route's lateral spacing (TS-182, about 210 ft; the
  // 250-100 ft window until V2.248). Lead stays frozen in the windscreen, growing, until there.
  const xDecisionFt = Math.abs(pairSlot('route', s, spacingFt).left) / Math.cos(TR.lineDeg * DEG);

  const heightG = element?.heightG ?? TR.heightG;
  const upSec = upFt > 0 ? Math.max(TR.heightSec / 2, smoothLegSec(upFt, heightG)) : 0;
  const downSec = upFt > 0 ? Math.max(TR.heightSec / 2, smoothLegSec(wing.altAboveFt + upFt - lineFt, heightG)) : 0;
  const dropFt = wing.altAboveFt - lineFt;
  // Up to the line from below, he climbs no faster on average than full power climbs at the line's speed in a gentle turn
  // (excessThrustPerWeight, the shared T-6A model), so he climbs up the line with power and keeps his speed (Fable's v2295
  // flight: from 2,000 ft low he zoomed up in 20 s, 212 to 124 KIAS, 0.3 G over the top, and fell 3,500 ft behind).
  const climbSec = (riseFt) => {
    if (riseFt <= 0) return 0;
    const ps = excessThrustPerWeight(TR.frozenKias, wing.altAboveFt, TR.climbTurnG) * iasToTasKt(TR.frozenKias, wing.altAboveFt) * KT_TO_FTPS;
    return ps > 0 ? (1.5 * riseFt) / ps : Infinity;
  };
  const climbing = upFt <= 0 && climbSec(-dropFt) > Math.max(TR.heightSec, smoothLegSec(dropFt, element?.heightG ?? TR.captureHeightG));
  const steadySec = upFt > 0 ? upSec + downSec : Math.max(TR.heightSec, smoothLegSec(dropFt, element?.heightG ?? TR.captureHeightG), climbSec(-dropFt));
  const heightLeg = (sec) => {
    if (upFt > 0) {
      const tUp = t0 + (sec * upSec) / steadySec;
      return [{ t0, t1: tUp, fromFt: wing.altAboveFt, toFt: wing.altAboveFt + upFt }, { t0: tUp, t1: t0 + sec, fromFt: wing.altAboveFt + upFt, toFt: lineFt }];
    }
    return Math.abs(wing.altAboveFt - lineFt) > 0.5 ? [{ t0, t1: t0 + sec, fromFt: wing.altAboveFt, toFt: lineFt }] : [];
  };

  const initialRange = Math.hypot(into.longRec.at(0).xFt - wing.xFt, into.longRec.at(0).yFt - wing.yFt);

  // One list of phases for every destination (refactor step 4): the destination is data (REJOIN_WAYS below).
  const way = to === 'fw' ? REJOIN_WAYS.fw : REJOIN_WAYS.x; // a close place off the X only: no caller asks one with xLaw false (the 4-ship's #2 flies the X since V2.299)
  const { phases, numApproachPhases, pointed } = rejoinPhases(way, {
    s, to, sTo, spacingFt, t0, lineFt, leadAlt, bankCapDeg, floorKias, leastKias, initialRange, hardSec, point, crossIn, element,
    xDecisionFt, decisionFt, aimFt, overtakeKt, overshoot, pathTail,
  });

  // Away (TS-174): #2 starts on the outside of Lead's turn and crosses behind him to side s, so the wrong-side check only
  // starts once he has reached side s.
  if (crossIn) phases.forEach((p, i) => { if (p.side != null) phases[i] = { ...p, crossIn: true }; });
  const profile0 = heightLeg(steadySec);

  const first = trackPhases({
    refs: { [lead.id]: into.longRec },
    wing0: wing,
    t0,
    phases,
    blockFt,
    profile: profile0,
    stopWhenSettled: true,
    maxSec: limitSec,
  });

  const totalSteps = first.run.points.length;
  const approachEndTime = first.run.times[numApproachPhases - 1]?.t1;
  const nPart = approachEndTime != null ? Math.max(1, Math.min(totalSteps, Math.round((approachEndTime - t0) / dt))) : totalSteps;

  const close = to !== 'fw';
  const firstPlan = { segments: [{ kind: 'bankTrack', points: first.run.points }], profile: first.profile };
  const firstRec = recordFlight(wing, firstPlan, t0);
  // A long climb ends further from Lead than where it was aimed; flown again to the line's depth where it ends, so the line's
  // law takes over from it with no step: a step of 2 ft gave a 0.4 G blip at the hand-over in the probes.
  if (climbing && joinAtFt == null && point !== 'frozen') {
    const k = Math.min(totalSteps, Math.round(steadySec / dt));
    const endFt = Math.hypot(into.longRec.at(k).xFt - firstRec.at(k).xFt, into.longRec.at(k).yFt - firstRec.at(k).yFt);
    if (Math.abs(endFt - joinFt) > 1) return flyTurningRejoinWith({ ...arguments[0], joinAtFt: endFt });
  }
  const wPart = firstRec.at(nPart);
  const relPart = relativeTo(into.longRec.at(nPart), wPart);
  const easeSec = close ? planeEaseSec(relPart, into.longRec.at(nPart)) : 0;

  let run = first.run;
  let profile = first.profile;
  let lp = into.planTo(totalSteps, null);
  let wingSegments = null;
  let tailSteps = 0; // the way from the decision point into the place (tailPath), flown in the held part

  if (close) {
    const bodyNow = (k) => bodyIn(into.longRec.at(k), firstRec.at(k));
    const [b0, b1] = [bodyNow(totalSteps - 1), bodyNow(totalSteps)];
    const tail = pathTail ? tailPath(b1, { fwd: (b1.fwd - b0.fwd) / dt, left: (b1.left - b0.left) / dt, up: (b1.up - b0.up) / dt }, s, to, spacingFt, sTo, element?.crossAt ?? null, element?.notBefore != null ? Math.round((element.notBefore - t0) / dt) - totalSteps : null) : null;
    tailSteps = tail?.steps ?? 0;
    // Lead holds his turn until #2 is in his place (tail.inSteps), then rolls out (Patrick 06:10Z); until V2.260 he held on
    // until the way had settled to the inch and planeEaseSec more, about 10 s in echelon.
    lp = into.planTo(totalSteps + (tail ? arrivedStep(into.longRec, totalSteps, firstRec.at(totalSteps), tail, pairSlot(to, sTo || s, spacingFt)) : tailSteps + Math.ceil(easeSec / dt)), to === 'route' ? RATE_SETS.close.routeRoll : RATE_SETS.close.echelonRoll);
    // The 4-ship (holdSec, four-rejoin.js twoTurning) flies off Lead's recorded turn with no segments: #2 holds in his
    // plane until Lead's flight ends (his rollout once the last wingman is in), at most holdSec. Until V2.219 he held for
    // none, flew straight on while Lead kept turning, and #3 could not settle (PR #703).
    const leadTotalSteps = holdSec != null ? leadEndStep(lp.rec, totalSteps, Math.round(holdSec / dt)) : Math.round(dryRunT(lead, { segments: lp.segments }, t0).durationSec / dt);
    const leadRemainingSteps = Math.max(0, leadTotalSteps - totalSteps);
    const W_settled = handOverAt(firstRec, totalSteps); // his speed rate, climb and roll rate carry into the held part
    const L_settled = lp.rec.at(totalSteps);
    const slot = pairSlot(to, sTo || s, spacingFt);
    const slotBody = { fwd: slot.fwd, left: slot.left, up: slot.alt };
    const leadRecFromSettle = fromStep(lp.rec, totalSteps);
    // After the turning rejoin's way in he holds the plane of Lead's bank averaged either side of now (centredBank), so he
    // starts climbing out of the step-down as Lead starts to roll out and eases off as he stops (Fable's V2.262 flight: he
    // climbed 22 ft at 14 ft/s after Lead's roll and stopped with a push to 0.5 G).
    const planeRec = tail ? centredBank(leadRecFromSettle, to === 'route' ? TURNING_REJOIN.tailPlaneRouteSec : TURNING_REJOIN.tailPlaneSec) : leadRecFromSettle;
    const { rel } = holdInPlane(planeRec, L_settled, W_settled, slotBody, Math.max(leadRemainingSteps, tail?.steps ?? 0), tail?.bodyAt, tail ? TURNING_REJOIN.tailHold : {});
    const holdSteps = Math.max(leadRemainingSteps, rel.length - 1);
    const poses = heldPoses(leadRecFromSettle, W_settled, rel, holdSteps);

    if ((totalSteps + poses.length) * dt > limitSec) return null;

    wingSegments = [
      { kind: 'bankTrack', points: first.run.points },
      { kind: 'poseTrack', poses },
    ];
    const fullWingRec = recordFlight(wing, { segments: wingSegments, profile: first.profile }, t0);
    const endStep = totalSteps + poses.length;
    const endWing = fullWingRec.at(endStep);
    const endLead = lp.rec.at(endStep);

    let laneFwdFt = first.run.laneFwdFt ?? -Infinity;
    poses.forEach((p, i) => {
      laneFwdFt = Math.max(laneFwdFt, relativeTo(lp.rec.at(totalSteps + i + 1), { xFt: p.x, yFt: p.y }).fwd);
    });
    let maxBank = first.run.maxBankDeg ?? 0;
    poses.forEach((p) => {
      maxBank = Math.max(maxBank, Math.abs(p.bank));
    });

    run = {
      ...first.run,
      points: first.run.points,
      end: { lead: endLead, wing: endWing },
      laneFwdFt,
      maxBankDeg: maxBank,
      laneOk: laneFwdFt <= (to === 'fw' || !xLaw ? Math.max(0, slot.fwd) + (LANE.marginFt ?? 100) : 0), // the 4-ship's #2 (xLaw false): TS-176's 100 ft margin
    };
    profile = first.profile;
  } else {
    // To fighting wing Lead rolls out at the echelon turn's rate, not at once: a 1 s roll-out had #2 snap after him at
    // 104°/s, 71° and 3.1 G (Fable's v2272 flight).
    lp = into.planTo(totalSteps, RATE_SETS.close.echelonRoll);
    const second = runTracker({
      refs: { [lead.id]: lp.rec },
      wing0: wing,
      t0,
      phases,
      profile: profile0,
      blockFt,
      stopWhenSettled: false,
      maxSec: limitSec,
    });
    if (!second.ok) return null;
    run = second;
  }

  const nSplit = Math.min(nPart, run.points.length);
  const partPoints = run.points.slice(0, nSplit);
  const runPoints = run.points.slice(nSplit);

  let partMinKias = wing.kias;
  let partMaxBank = 0;
  let partMaxG = wing.g ?? 1;
  let partMinG = wing.g ?? 1;
  const lineDef = { nrm: { fwd: Math.cos(TR.lineDeg * DEG), left: s * Math.sin(TR.lineDeg * DEG) } };
  let minCross = Infinity;
  let onSide = !crossIn;
  for (let i = 0; i < partPoints.length; i++) {
    const pt = partPoints[i];
    if (pt[1] < partMinKias) partMinKias = pt[1];
    if (Math.abs(pt[0]) > partMaxBank) partMaxBank = Math.abs(pt[0]);
    
    const wPart = firstRec.at(i);
    const lPart = into.longRec.at(i);
    const rel = relativeTo(lPart, wPart);
    const cross = rel.fwd * lineDef.nrm.fwd + rel.left * lineDef.nrm.left;
    if (cross < minCross) minCross = cross;
    
    // Reject if it crosses Lead's six at all (Patrick's absolute rule)
    if (s * rel.left >= 0) onSide = true;
    if (!allowAcross && onSide && s * rel.left < -50) return null;
  }
  
  const lineKias = partPoints.length ? partPoints[partPoints.length - 1][1] : wing.kias;

  const part = {
    points: partPoints,
    steps: partPoints.length,
    end: copyAircraft(firstRec.at(nSplit)),
    maxBankDeg: partMaxBank,
    minKias: partMinKias,
    lineKias,
    maxG: partMaxG,
    minG: partMinG,
    ahead: !run.laneOk,
    stepDownOk: run.stepDownOk !== false,
    accelKtps: partPoints.length && partPoints[partPoints.length - 1][3] != null ? partPoints[partPoints.length - 1][3] : 0,
    rangeFt: Math.hypot(into.longRec.at(nSplit).xFt - firstRec.at(nSplit).xFt, into.longRec.at(nSplit).yFt - firstRec.at(nSplit).yFt),
    overKt: lineKias - KIAS_OUTSIDE_LAB,
    stable: true,
    establishedRange: first.run.establishedRange,
    rideEstablished: (to === 'fw' || first.run.rideEstablished || pointed) && lineKias <= TURNING_REJOIN.rideKias + TURNING_REJOIN.windowEntryOverKt && (to !== 'fw' || partMinKias >= TURNING_REJOIN.fwLeastKias),
  };

  const remainderRun = {
    ...run,
    points: runPoints,
  };

  const slotFwdFt = Math.max(0, pairSlot(to, sTo || s, spacingFt).fwd);
  const flownProfile = profile ?? profile0;
  const durationSec = close && wingSegments ? (totalSteps + wingSegments[1].poses.length) * dt : run.points.length * dt;
  return {
    part,
    run: remainderRun,
    slotFwdFt,
    profile: flownProfile,
    lp,
    durationSec,
    settleSec: (totalSteps + tailSteps) * dt, // when he is in his place (after tailPath's way in, TS-182), before the hold in Lead's plane through the rollout
    overshoot: onX && overshoot,
    point: pointed && point, // the SMM's start flown (TS-182): a re-fly of this plan passes it back (four-rejoin.js twoTurning)
    wingSegments,
  };
}

/**
 * How long #2 takes to ease into Lead's wing plane from the move over (TS-126): at least TURNING_REJOIN.planeEaseSec, and
 * longer for a big step so the pull stays within TURNING_REJOIN.planeEaseG (smootherstep's peak pull is SMOOTHER_CURVE_PEAK
 * times the step over the time squared). rel: #2 in Lead's frame there; L: Lead there.
 */
export function planeEaseSec(rel, L) {
  const step = Math.abs(rel.left * Math.sin(L.bankDeg * DEG));
  return Math.max(TURNING_REJOIN.planeEaseSec, Math.sqrt((SMOOTHER_CURVE_PEAK * step) / (TURNING_REJOIN.planeEaseG * G_FTPS2)));
}

/**
 * #2's heights from where he moves over on, in Lead's wing plane (TS-126; Patrick 6 Oct 07:10Z: "2 is above the line,
 * almost co-altitude with lead"; SMM 12.19 and Fig 12.11: in a close formation turn the wingman holds Lead's wing plane,
 * stepped down on the inside of the turn and up on the outside). Lead's bank tilts #2's place by his distance out times
 * the sine of his bank, lagged as in the close turns; it eases in over easeSec from the move over (planeEaseSec), and
 * comes off as Lead rolls out.
 * Until V2.142 the heights were held against Lead's height, so on the inside of Lead's 30° turn #2 sat about half his
 * distance out above the wing plane. The 4-ship's close turning rejoins use it too (four-legs.js). wing: #2 at t0; plan: his bank track and heights; leadRec: Lead's real flight; from:
 * the move-over step; easeSec: planeEaseSec. Returns the heights as one table leg (flight.js tableAt).
 */
export function inLeadsPlane(wing, plan, leadRec, t0, from, steps, easeSec, targetAltFt = null) {
  const rec = recordFlight(wing, plan, t0);
  // His place follows Lead's bank with the close turns' lag (he lags the roll, SMM 12.19 para 43).
  const ref = laggedBank(leadRec, KINEMATIC.planeLagSec);
  const tilt = (n) => -relativeTo(ref.at(n), rec.at(n)).left * Math.sin(ref.at(n).bankDeg * DEG);
  const baseFromAlt = rec.at(from).altAboveFt;
  const alt = [];
  for (let n = 0; n <= steps; n++) {
    const ease = n < from ? 0 : smoother(Math.min(1, ((n - from) * dt) / easeSec));
    const baseAlt = targetAltFt != null && n >= from
      ? baseFromAlt + (targetAltFt - baseFromAlt) * ease
      : rec.at(n).altAboveFt;
    alt.push(baseAlt + tilt(n) * ease);
  }
  const at = (n) => alt[Math.max(0, Math.min(steps, n))];
  const climb = alt.map((_, n) => (at(n + 1) - at(n - 1)) / (2 * dt));
  const nz = alt.map((_, n) => 1 + (at(n + 1) - 2 * at(n) + at(n - 1)) / (dt * dt * G_FTPS2));
  return [{ t0, t1: t0 + steps * dt, table: { dt, alt, climb, nz } }];
}

/**
 * The search for the most efficient turning rejoin (planTurningRejoin's, also the 4-ship's #2 against Lead's held turn,
 * four-rejoin.js): every overtake, bank and aim in the order below, then the vertical. into: leadTurnInto's { longRec,
 * planTo }. hot: from line abreast. vertical: false leaves out the vertical; verticalMinG: the least G a vertical may push to
 * (the 4-ship's #2, who starts on his stack; none for the 2-ship). Returns flyTurningRejoinWith's result with { overtakeKt, lowFloor, aimFt, bankCapDeg, upFt }, or null.
 */
export function searchTurningRejoin({ lead, wing, into, s, to, sTo, spacingFt, blockFt, t0, hot, vertical = true, verticalMinG = null, xLaw = true, crossIn = false, trail = false, element = null }) {
  // How far ahead down the line he aims: the one that brings him in soonest (Patrick 08:20Z: "find a way to make the most
  // efficient": smaller inputs for longer, or larger for shorter).
  // A medium bank first; more, up to the G rule, only when no medium-bank rejoin keeps him behind Lead's 3/9 line.
  // When even that can't keep him behind Lead's 3/9 line, the most overtake that can (the review's: fit the overtake to the
  // room; Student's 15 kt is the least): the note says which he flew.
  const slotFwdFt = Math.max(0, pairSlot(to, sTo || s, spacingFt)?.fwd ?? 0);
  // The X to a close place (xLaw) keeps no margin ahead of the slot; fighting wing, and any rejoin flown without the X,
  // the old 100 ft margin (TS-176; built V2.223, Fable's V2.221 audit 2.4).
  const laneLimitFt = to === 'fw' || !xLaw ? slotFwdFt + (LANE.marginFt ?? 100) : 0;
  let best = null;
  let bestAny = null;
  // Down the line he aims for the Rates choice's line speed (lineKiasNow, TS-133: a target, geometry first; until V2.149 220 for all, Patrick 17:54Z, 17:55Z: "the minimum closure up the line
  // to be 220 knots"), or a smaller Rates overtake only when that one would put him ahead of Lead's 3/9 line (TS-75).
  const asked = lineKiasNow() - KIAS_OUTSIDE_LAB;
  // The ride (xLaw, the 2-ship) reads neither the overtake nor the aim, so it flies each only once (review 10 Oct 2.4;
  // Patrick 20:00Z (d)); without the X (the 4-ship's #2 to fighting wing) the search still tries them.
  const overtakes = xLaw ? [asked] : [asked, ...Object.values(REJOIN_CLOSURE_KT).filter((kt) => kt < asked).sort((a, b) => b - a)];
  // Every overtake and bank at his least speed first; slower only when none of them keeps him behind Lead's 3/9 line
  // (Patrick 17:29Z: "unless massively high on energy and tight"; TS-75).
  // To a close formation, the overshoot is the last resort (Patrick 03:35Z: "only overshoot if there is no other option
  // (instead of giving an error that a rejoin isnt possible)"): the same search with it, only when nothing else plans.
  // A candidate replaces the best so far when it is established and the best is not, or when it is quicker by more than
  // BETTER_BY_SEC; one that puts him ahead of the lane is kept apart (bestAny), used only when no candidate keeps behind it.
  const better = (flown, than) => {
    const est = flown.part?.rideEstablished !== false;
    const thanEst = than?.part?.rideEstablished !== false;
    return !than || (est && !thanEst) || (est === thanEst && flown.durationSec < than.durationSec - BETTER_BY_SEC);
  };
  const consider = (flown, labels) => {
    if (!flown) return;
    const laneOk = (flown.run?.laneFwdFt ?? -Infinity) <= laneLimitFt;
    if (laneOk) {
      if (better(flown, best)) best = { ...flown, ...labels };
    } else if (!best && better(flown, bestAny)) {
      bestAny = { ...flown, ...labels };
    }
  };
  const done = () => best && best.part?.rideEstablished !== false;
  // A later pass only when the earlier finds nothing: Lead's turn may carry #2 across his six well behind him (allowAcross),
  // so a rejoin is planned from anywhere it can be. (Until refactor step 4 two more passes re-flew these same candidates
  // with a maxWhenLow switch the rejoin no longer reads, so they could never change the pick.)
  search: for (const allowAcross of [false, true]) {
    for (const overshoot of to !== 'fw' && xLaw ? [false, true] : [false]) {
      for (const lowFloor of [false, true]) {
        for (const overtakeKt of overtakes) {
          // Inside the G rule's 5 G first, bank free within it (the bank of a level 5 G turn; Patrick 10 Oct 2026 23:59Z card
          // "Inside 5 G, any bank"; TS-181), and the aircraft's own limit only when nothing plans within it.
          // A medium bank first (TURNING_REJOIN.bankCapDeg, 60°), then up to the G rule's 5 G, a flag he stays inside, never the
          // target (TS-182; the 5 G first until V2.248, TS-181), and the aircraft's own limit only when nothing plans within it.
          for (const bankCapDeg of [TURNING_REJOIN.bankCapDeg, G_RULE_BANK_DEG, REJOIN.bankCapDeg]) {
            const aims = xLaw ? [TURNING_REJOIN.aimsFt[0]] : hot ? [...TURNING_REJOIN.aimsFt, TURNING_REJOIN.lagAimFt] : TURNING_REJOIN.aimsFt;
            const common = { lead, wing, into, s, to, sTo, spacingFt, blockFt, t0, bankCapDeg, overtakeKt, lowFloor, overshoot, xLaw, allowAcross, crossIn, element };
            for (const aimFt of aims) {
              const limitSec = done() ? best.durationSec - BETTER_BY_SEC : Infinity;
              // From line abreast the SMM's start first (pointing turn, wings level, reversal; TS-182), else the capture alone
              // (V2.245's, Patrick 04:10Z: "If that doesn't work we can stick to what we had").
              const fly = (point) => flyTurningRejoinWith({ ...common, aimFt, hardSec: 0, limitSec, point });
              const pointing = hot && xLaw && (!crossIn || trail);
              consider((pointing && fly(trail ? 'frozen' : true)) || fly(false), { overtakeKt, lowFloor, aimFt, bankCapDeg, hardSec: 0, upFt: 0, allowAcross });
            }
            if (!best && hot && xLaw) {
              for (const hardSec of TURNING_REJOIN.hardPullsSec) {
                const aimFt = aims[0];
                consider(flyTurningRejoinWith({ ...common, aimFt, hardSec, limitSec: Infinity }), { overtakeKt, lowFloor, aimFt, bankCapDeg, hardSec, upFt: 0, allowAcross });
              }
            }
            if (done()) break search;
          }
        }
      }
    }
  }
  // The vertical as a candidate (TS-82): the same rejoin with #2 going high early and coming down onto the line, flown only
  // when it brings him in sooner, by more than the chooser's half-second tie, within the G rule with its pull charged.
  if (best && vertical) {
    for (const upFt of TURNING_REJOIN.verticalUpFt) {
      const limitSec = best.durationSec - (best.part?.rideEstablished === false ? 0 : BETTER_BY_SEC);
      const flown = flyTurningRejoinWith({ lead, wing, into, s, to, sTo, spacingFt, blockFt, t0, aimFt: best.aimFt, bankCapDeg: best.bankCapDeg, overtakeKt: best.overtakeKt, lowFloor: best.lowFloor, upFt, minG: verticalMinG, overshoot: best.overshoot, xLaw, hardSec: best.hardSec, allowAcross: best.allowAcross, crossIn, limitSec, point: best.point, element });
      const laneOk = flown ? (flown.run?.laneFwdFt ?? -Infinity) <= laneLimitFt : false;
      if (flown && laneOk && flown.part?.stepDownOk !== false && flown.run?.stepDownOk !== false) {
        const est = flown.part?.rideEstablished !== false;
        const bestEst = best.part?.rideEstablished !== false;
        if ((est && !bestEst) || (est === bestEst && flown.durationSec < best.durationSec - BETTER_BY_SEC)) {
          best = { ...flown, overtakeKt: best.overtakeKt, lowFloor: best.lowFloor, aimFt: best.aimFt, bankCapDeg: best.bankCapDeg, hardSec: best.hardSec, upFt, allowAcross: best.allowAcross };
        }
      }
    }
  }
  return best || bestAny;
}

/**
 * The turning rejoin as a "Change formation" plan (planGoTo's shape, transitions.js), or null when it does not apply or does
 * not settle (formation.js then tries the line and tracker planners). It applies to the 2-ship with the turning rejoin chosen,
 * from line abreast to fighting wing or a close formation, and from fighting wing to a close formation.
 * options: { side, spacingFt, blockFt, rejoin, lastSide }, as planGoTo's.
 */
export function planTurningRejoin(pair, to, options = {}, t0 = 0) {
  const [lead, wing] = pair;
  if (!FORMATIONS[to] || to === 'lab' || (options.rejoin ?? 'into') !== 'into') return null;
  const from = classify([lead, wing]);
  // From trail after a break and rejoin (TS-175) too: #2 sits behind Lead, his side the echelon side he broke from (TS-174).
  const trail = from.key === 'other' && options.trailSide ? options.trailSide : 0;
  if (!(from.key === 'lab' || trail || (from.key === 'fw' && to !== 'fw'))) return null;
  const spacingFt = options.spacingFt ?? 6000;
  const blockFt = options.blockFt ?? 8000;
  const s0 = trail || from.side || Math.sign(relativeTo(lead, wing).left) || (options.lastSide ?? -1);
  // Into or Away (TS-174, Patrick 10 Oct 2026 20:37Z): Into, Lead turns toward #2's side; Away, he turns away from it and #2
  // crosses behind him to join on the inside of the turn (SMM 16.20 para 65b(1), Fig 16.24). s is the side #2 joins on.
  const away = options.turn === 'away';
  const s = away ? -s0 : s0;
  const want = options.side ?? 'keep';
  const sTo = sideFor(to, want, s);
  const pre = Math.abs(lead.kias - KIAS_OUTSIDE_LAB) > 0.5 ? [{ ...speedSeg(lead.kias, KIAS_OUTSIDE_LAB, blockFt), withNext: true }] : [];
  const into = leadTurnInto({ lead, pre, s, bankDeg: REJOIN.leadBankDeg, t0, record: recordFlight });

  const hot = from.key === 'lab' || Boolean(trail);
  // No vertical candidate on the 2-ship ride: the ride flies its own height (the line 50 ft low), so it never flew (TS-82
  // retired for the ride, Patrick 10 Oct 20:00Z (d)).
  const best = searchTurningRejoin({ lead, wing, into, s, to, sTo, spacingFt, blockFt, t0, hot, vertical: false, crossIn: away || Boolean(trail), trail: Boolean(trail) });
  const asked = lineKiasNow() - KIAS_OUTSIDE_LAB;
  const { part, run, profile, lp } = best;
  const judged = judge([run.end.lead, run.end.wing], { key: to }, { spacingFt });

  const label = FORMATIONS[to].label;
  const sideWord = to === 'astern' ? '' : sTo > 0 ? ' left' : ' right';
  const fromWord = trail ? 'Trail' : FORMATIONS[from.key].label;
  const fromSide = s0 > 0 ? ' left' : ' right';
  const how = hot ? 'hot turning rejoin' : 'turning rejoin';
  const turnDeg = Math.round(lp.turned / DEG);
  const slowing = pre.length ? `, slowing to ${KIAS_OUTSIDE_LAB} KIAS,` : ` at ${KIAS_OUTSIDE_LAB} KIAS`;
  const clock = s > 0 ? '1 o\'clock' : '11 o\'clock';
  const speeds = best.lowFloor
    ? `Too close in and hot to keep ${KIAS_OUTSIDE_LAB} KIAS, he dips to ${Math.round(part.minKias)} KIAS, then MAX again, and is at ${Math.round(part.lineKias)} KIAS on the line (Patrick 17:53Z; TS-75).`
    : `${hot ? 'He gets colder with geometry, not power: his' : 'His'} slowest is ${Math.round(part.minKias)} KIAS, and he is at ${Math.round(part.lineKias)} KIAS on the line (TS-75).`;
  const across = sTo !== s && to !== 'astern' ? ', crossing behind Lead to the other side' : '';
  const end =
    to === 'fw'
      ? sTo === s ? 'into the fighting wing cone, settling where he arrives in it (Patrick 08:58Z: the whole cone)' : `into the fighting wing slot${across}`
      : `through route ${to === 'route' ? 'and settles' : to === 'astern' ? 'and crosses behind into line astern' : `into ${label.toLowerCase()}`}${across} at ${closureNow().kt} kt (SMM 12.24 para 58)`;
  // To a close formation, the X to the window (TS-106).
  const xNote = () => {
    const over = Math.round(part.overKt ?? 0);
    const tail = best.overshoot
      ? `Not stable by ${TURNING_REJOIN.windowNearFt} ft, he overshoots, the last resort (Patrick 03:35Z): wings near level, power back, behind and below Lead to the outside of the turn, stabilizes, crosses back a length clear with no overtake and moves up into ${label.toLowerCase()}${sideWord} (SMM 12.27 para 65, Fig 12.18).`
      : `At ${Math.round(part.rangeFt)} ft, ${over > 0 ? `${over} KIAS over Lead` : 'at Lead\'s speed'} with Lead on the X, he moves over and slides ${to === 'astern' ? 'in behind Lead into line astern' : `up the line into ${label.toLowerCase()}${across}`} (Patrick 03:32Z-03:44Z: anywhere 250-100 ft from Lead, 10-20 KIAS over him).`;
    if (best.point && !best.overshoot) {
      return `${fromWord}${fromSide} to ${label}${sideWord}: ${how}. Lead turns ${away ? 'away from' : 'into'} #2 at ${REJOIN.leadBankDeg}° of bank${slowing.replace(/,$/, '')} (SMM 16.20 para 65b). ${best.point === 'frozen' ? `From trail, Lead near his nose, #2 eases Lead out to ${TURNING_REJOIN.frozenBearingDeg}° off his nose with a small, early, gentle bank (Patrick 11 Oct 07:57Z).` : `#2 turns firmly to point at Lead with a quick, smooth roll, inside ${TURNING_REJOIN.pointMaxG} G, rolls out wings level until the line of sight starts to move, then reverses smoothly onto the rejoin line (SMM 16.20 para 65b(2); Patrick 04:05Z).`} He holds Lead frozen in his windscreen, growing, ${TURNING_REJOIN.lineElevDeg}° above the horizon, with bank, pitch and power (SMM 12.24 para 57; Patrick 04:16Z). ${speeds} At about ${Math.round(Math.abs(pairSlot('route', s, spacingFt).left) / Math.cos(TURNING_REJOIN.lineDeg * DEG))} ft, route's lateral spacing, ${sTo !== s && sTo !== 0 ? `he carries his closure under Lead's tail, below his wake, and up into ${label.toLowerCase()}${sideWord} (Patrick 11 Oct 06:24Z)` : `he goes down into route in Lead's wing plane, bank matched, his closure coming off, Lead moving behind the canopy bow, then ${to === 'route' ? 'settles in route' : `moves up the spinner-wingtip line into ${label.toLowerCase()}`}`} (SMM 12.24 para 58; TS-182).`;
    }
    return `${fromWord}${fromSide} to ${label}${sideWord}: ${how}. Lead turns ${away ? 'away from' : 'into'} #2 at ${REJOIN.leadBankDeg}° of bank${slowing.replace(/,$/, '')} (SMM 16.20 para 65b). #2 ${hot ? `cuts across onto the rejoin line, and from ${TURNING_REJOIN.xFromFt} ft in he ` : ''}puts Lead on the X at about his ${clock}, the fin two-thirds out along Lead's upper wing, Lead slightly high, and holds him fixed on the canopy (SMM 12.24 paras 56-57, Fig 12.15). ${speeds} ${tail}`;
  };
  return {
    ok: true,
    plans: {
      [lead.id]: { segments: lp.segments.map((x) => ({ ...x })) },
      [wing.id]: {
        segments: best.wingSegments
          ? best.wingSegments.map((s) => ({ ...s, points: s.points ? [...s.points] : undefined, poses: s.poses ? [...s.poses] : undefined }))
          : [{ kind: 'bankTrack', points: [...part.points, ...run.points] }],
        profile,
      },
    },
    note: to !== 'fw' ? xNote() : `${fromWord}${fromSide} to ${label}${sideWord}: ${how}. Lead turns ${away ? 'away from' : 'into'} #2 at ${REJOIN.leadBankDeg}° of bank${slowing} and holds it until #2 is in (${turnDeg}°; SMM 16.20 para 65b). #2 aims for ${KIAS_OUTSIDE_LAB + best.overtakeKt} KIAS down the line, ${best.overtakeKt} kt of overtake${best.overtakeKt < asked ? ` (${KIAS_OUTSIDE_LAB + asked} would put him ahead of Lead's 3/9 line from here)` : ''}, gets onto the rejoin line and holds it with Lead at about his ${clock}, slightly low (SMM 12.24 paras 56-57; TS-181); ${hot ? 'he starts hot and gets colder to reach it' : 'he starts cold and turns hotter to reach it'}. ${speeds}${best.upFt ? ` He goes ${best.upFt.toLocaleString('en-CA')} ft higher early and comes down onto the line (the vertical, TS-82).` : ''} From the decision point, where a stop with the torque floor and the boards just fits, he takes it out and flows ${end}.`,
    label: `${label}${sideWord}`,
    flying: `${fromWord}${fromSide} to ${label}${sideWord} (${how})`,
    from: from.key,
    fromSide: s,
    to,
    side: sTo,
    rejoinKind: 'into',
    turn: away ? 'away' : 'into',
    verticalUpFt: best.upFt,
    // No re-plan at the decision point: the rejoin is flown through as planned, Lead holding his turn until #2 is in
    // position (Patrick 6 Oct 04:43Z: "Lead needs to maintain the turn for a TRJ until 2 is in position (Eschelon or
    // fighting wing) right now they roll out early"; TS-112). The re-plan there (spec F1, TS-81) planned Lead on straight
    // and level, so he rolled out early and #2 slid in from where he was.
    leadTurnDeg: turnDeg,
    laneFwdFt: run.laneFwdFt,
    laneWarnFt: run.laneFwdFt > best.slotFwdFt + TURNING_REJOIN.laneTolFt ? run.laneFwdFt - best.slotFwdFt : null,
    maxBankDeg: Math.max(part.maxBankDeg, run.maxBankDeg),
    judged,
    endSec: t0 + best.durationSec,
    rejoining: true,
    handOverSec: null,
  };
}
