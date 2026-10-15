// The wingmen in Lead's fighting wing moves on the live law (TS-202, TS-206, TS-208), 2-ship and 4-ship. The only law for
// these moves since Patrick flew it (12 Oct 2026: "Live fighting wing is fine. make it the default and get rid of it"); the
// "#2 in fighting wing" Tracker / Live setting is gone.
//
// TS-208 (Patrick 12 Oct 2026 16:49Z: "everyone just needs to maintain 500 foot minimum from the plane ahead of them and
// more or less capture and fly leads turn circle using lead lag and pure"; 17:16Z: on a turn into him "swap sides or use the
// vertical to maintain 500", "start with a vertical stack of 50-100 ft"; his yes to TS-208's words 17:22Z). Every wingman,
// 2-ship and 4-ship, flies Lead's turn circle: the path Lead has flown, worked out from Lead's bank and speed where Lead was
// (his turn's centre and radius, core flight math, carried along his track), so a wingman further back reverses and rolls
// out where Lead did. He aims about 650 ft of arc behind the one ahead and never closer than 500 ft. He holds it with lead,
// lag and pure first (where he sits across Lead's circle: inside it is a shorter way round, lead; outside a longer one,
// lag; on it, pure: SMM 12.29 para 69, 12.30 paras 71-74, Figs 12.20-12.23; EFIG p.391), then height in the cone, then
// power within 15 KIAS of Lead. In a turn into him the lag carries him across the tail of the one ahead and he takes the
// other side: nothing commands a side, it comes from the flying. With Lead level he goes back to the cone (SMM 12.29 para
// 69: 500-1,000 ft, 30-60° of sweep), where he is if inside it, else its nearest point, on whichever side he is.
// Range to the other aircraft is shown on screen (the card and tags), not steered on: each misses the one ahead (SMM 16.39
// para 107).
//
// Each wingman is a real aircraft: the shared point mass flown by Lead's own step (fluid-lead.js stepLead: the G built at
// the T-6A's onset, the roll at its rate and onset, the stick shaker the one physical limit). At the press Lead's planned
// flight is flown ahead step by step, the wingmen one step behind it; their steps are kept as pose tracks and replayed
// (replay.js flyStep), so the drawn path is the path flown (F1). The changes into and out of fighting wing stay on the
// tracker.
//
// Units: feet, seconds, x east, y north, z up; speeds named (KIAS indicated, V true, ft/s). Numbers with no source beside
// them are estimates and say so.
import { DEG } from '../../../core/angles.js';
import { gAndBankForLift } from '../../../core/point-mass.js';
import { shakerG, availableG } from '../../../core/t6-performance.js';
import { FTPS_TO_KT, G_FTPS2 } from '../../../core/units.js';
import { STEP_SEC, copyAircraft, planDone } from './flight.js';
import { flyStep } from './replay.js';
import { relativeTo } from './manoeuvres.js';
import { predict } from './fw-pursuit.js';
import { G_RULE, HOLD, FW_LIVE } from './tuning.js';
import { FW_BAND, FW4 } from './slots.js';
import { IN_POSITION } from './bands.js';
import { fwLeadPlan, fwMoveWords } from './formation-turns.js';
import { leadStateOf, stepLead, leadThrottle } from './fluid-lead.js';
import { powerFrom, withEngine } from './power.js';
import { add3, sub3, scale3, len3, cross3, unit3, perp3, dot3, poseOf3d } from './attitude.js';

const dt = STEP_SEC;
const Z = Object.freeze({ x: 0, y: 0, z: 1 });
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const toward = (x, to, rate) => x + clamp(to - x, -rate * dt, rate * dt);

export { FW_LIVE }; // its home is wing-moves.js (the tuning sheet, TS-214)


// ---- Lead's track: the circle he flew, where he flew it ----------------------------------------------------------------

/** Lead's horizontal speed, heading and turn (curvature, + left, 1/ft) from his state: his turn from his bank and speed. */
function leadPoint(st) {
  const vh = Math.hypot(st.vel.x, st.vel.y);
  const n = { x: st.vel.x / vh, y: st.vel.y / vh };
  // His turning acceleration square to the path, across it level (+ left); over V² it is his turn: 1 / the radius core
  // turnRadiusFromBankFt gives for his bank and true airspeed in a level turn.
  const aLat = -st.accPerp.x * n.y + st.accPerp.y * n.x;
  return { x: st.pm.x, y: st.pm.y, hx: n.x, hy: n.y, k: aLat / (vh * vh), v: vh };
}

/** A new track seeded behind Lead along his present path (his present turn carried back), seedFt long. */
function seedTrack(st) {
  const p = leadPoint(st);
  const N = Math.round(FW_LIVE.seedFt / FW_LIVE.seedStepFt);
  const tr = { x: [], y: [], hx: [], hy: [], k: [], s: [] };
  const h0 = Math.atan2(p.hy, p.hx);
  for (let i = N; i >= 0; i--) {
    const sb = i * FW_LIVE.seedStepFt; // arc behind Lead
    const h = h0 - p.k * sb;
    let x;
    let y;
    if (Math.abs(p.k) > 1e-7) {
      // on his circle: the centre off his left (k > 0) or right
      const cx = p.x - p.hy / p.k;
      const cy = p.y + p.hx / p.k;
      x = cx + Math.sin(h) / p.k;
      y = cy - Math.cos(h) / p.k;
    } else {
      x = p.x - p.hx * sb;
      y = p.y - p.hy * sb;
    }
    tr.x.push(x); tr.y.push(y); tr.hx.push(Math.cos(h)); tr.hy.push(Math.sin(h)); tr.k.push(p.k); tr.s.push(-sb);
  }
  return tr;
}

/** Lead's new point on his track. */
function extendTrack(tr, st) {
  const p = leadPoint(st);
  const n = tr.x.length;
  const ds = Math.hypot(p.x - tr.x[n - 1], p.y - tr.y[n - 1]);
  if (ds < 1e-6) return;
  tr.x.push(p.x); tr.y.push(p.y); tr.hx.push(p.hx); tr.hy.push(p.hy); tr.k.push(p.k); tr.s.push(tr.s[n - 1] + ds);
}

/** A copy of the track's first n points (a press mid-move carries on the track flown so far). */
function trackUpTo(tr, n) {
  const c = (a) => a.slice(0, n);
  return { x: c(tr.x), y: c(tr.y), hx: c(tr.hx), hy: c(tr.hy), k: c(tr.k), s: c(tr.s) };
}

/**
 * Where an aircraft is against Lead's track: how far along it (s, ft; Lead's own is the track's end), how far left of it
 * (y), its heading and turn there, and how fast he moves along it (sDot, ft/s). guess: last step's segment.
 */
function onTrack(tr, pos, vel, guess = null) {
  const n = tr.x.length;
  const d2 = (k) => {
    const sx = tr.x[k + 1] - tr.x[k];
    const sy = tr.y[k + 1] - tr.y[k];
    const L2 = sx * sx + sy * sy || 1;
    const t = clamp(((pos.x - tr.x[k]) * sx + (pos.y - tr.y[k]) * sy) / L2, 0, 1);
    return (pos.x - tr.x[k] - t * sx) ** 2 + (pos.y - tr.y[k] - t * sy) ** 2;
  };
  let k;
  if (guess == null || guess > n - 2) {
    k = 0;
    let best = Infinity;
    for (let i = 0; i < n - 1; i++) { const q = d2(i); if (q < best) { best = q; k = i; } }
  } else {
    k = guess;
    while (k < n - 2 && d2(k + 1) <= d2(k)) k++;
    while (k > 0 && d2(k - 1) < d2(k)) k--;
  }
  const sx = tr.x[k + 1] - tr.x[k];
  const sy = tr.y[k + 1] - tr.y[k];
  const L = Math.hypot(sx, sy) || 1;
  const ux = sx / L;
  const uy = sy / L;
  // Off the ends the track runs straight on, so a wingman abeam Lead or far back still has a place on it.
  let t = ((pos.x - tr.x[k]) * ux + (pos.y - tr.y[k]) * uy) / L;
  if (k > 0 && k < n - 2) t = clamp(t, 0, 1);
  else if (k === 0) t = Math.min(t, 1);
  else t = Math.max(t, 0);
  const f = clamp(t, 0, 1);
  const kap = tr.k[k] + (tr.k[k + 1] - tr.k[k]) * f;
  const y = ux * (pos.y - tr.y[k]) - uy * (pos.x - tr.x[k]);
  const along = vel.x * ux + vel.y * uy;
  return { k, s: tr.s[k] + t * L, y, ux, uy, kap, sDot: along / Math.max(0.2, 1 - kap * y) };
}

/** Lead's turn on his track sFt along it (from segment k on), or at its end. */
function kapAt(tr, sFt, k) {
  const n = tr.s.length;
  let i = Math.max(0, Math.min(k, n - 2));
  while (i < n - 2 && tr.s[i + 1] < sFt) i++;
  if (sFt >= tr.s[n - 1]) return tr.k[n - 1];
  const f = clamp((sFt - tr.s[i]) / Math.max(1e-6, tr.s[i + 1] - tr.s[i]), 0, 1);
  return tr.k[i] + (tr.k[i + 1] - tr.k[i]) * f;
}

// ---- one wingman ----------------------------------------------------------------------------------------------------

/**
 * Fighting wing's energy (TS-96, TS-202): the knots his place wants (the arc against his place's and the closure on it)
 * as height first, up to energyFt above or below his stack (a knot is about V / g feet of height at the same energy), and
 * the knots the height can't take for power. errFt: how far behind his place he is; closingFtps: how fast he is closing
 * on it. Returns { altFt, powerKt, ftPerKt }.
 */
function fwEnergy(errFt, closingFtps, st) {
  const extraKt = FW_LIVE.placeKtPerFt * errFt - FW_LIVE.closeKtPerKt * closingFtps * FTPS_TO_KT;
  const ftPerKt = st.V / FTPS_TO_KT / G_FTPS2;
  const altFt = clamp(-extraKt * ftPerKt, -FW_LIVE.energyFt, FW_LIVE.energyFt);
  return { altFt, powerKt: extraKt + altFt / ftPerKt, ftPerKt };
}

/** The cone's nearest point to where he is off the one ahead (along: arc behind, ft; across: left, ft). */
function conePlace(along, across, side) {
  const r = clamp(Math.hypot(along, across), FW_BAND.rangeFt[0] + FW_BAND.flyMarginFt[0], FW_BAND.rangeFt[1] - FW_BAND.flyMarginFt[0]);
  const offDeg = clamp(Math.atan2(Math.abs(across), Math.max(along, 1)) / DEG, FW_BAND.sweepDeg[0] + FW_BAND.flyMarginDeg, FW_BAND.sweepDeg[1] - FW_BAND.flyMarginDeg);
  return { along: r * Math.cos(offDeg * DEG), across: side * r * Math.sin(offDeg * DEG) };
}

/**
 * A wingman's state at the first press, from his 2D aircraft and the one he flies off (2D too). The cone place is where
 * he is (inside the band's fly margins), his stack 50 to 100 ft below the one ahead (TS-208).
 */
function wingAtPress(ahead, wing, blockFt) {
  const rel = relativeTo(ahead, wing);
  const side = Math.sign(rel.left) || -1;
  const alt = (wing.altAboveFt ?? 0) - (ahead.altAboveFt ?? 0);
  const st = leadStateOf(wing, blockFt);
  return {
    st,
    side,
    stackFt: clamp(alt, -FW_LIVE.stackKeepFt, FW_LIVE.stackFt[1]),
    place: conePlace(-rel.fwd, rel.left, side),
    level: false, // the place is taken again on the first step with Lead level (where he is), and after every turn
    turn: null, // his picture of the turn, 0 to 1, eased; set on the first step
    dCone: null, // where across Lead's track the cone puts him (ft, left), eased
    askBank: st.bank, // the bank he is asking for (point-mass sense), moved at his roll rate
    floorUpFt: 0, // height taken away from the one ahead to keep the floor
    k: null, // his segment on Lead's track
  };
}

/**
 * One step of one wingman. ws: his state; ctx: { L (Lead's 3D state at the start of the step), A (the one ahead's: Lead
 * for #2), aOn (where the one ahead is on Lead's track), tr (Lead's track), stackSumFt (the stacks above him, summed:
 * his height on Lead), holdKias (Lead's speed), blockFt, leadLevel }. Returns { ws, pose, power }.
 */
function stepFwWing(ws, ctx) {
  const P = FW_LIVE;
  const { L, A, aOn, tr, blockFt } = ctx;
  const st = ws.st;
  const me = onTrack(tr, st.pm, st.vel, ws.k);
  const vh = Math.hypot(st.vel.x, st.vel.y);

  // ---- the picture: how far round Lead's circle he is behind the one ahead, and how fast that is changing ----
  // His place is 650 ft of arc behind the one ahead's place, so a wobble of the one ahead's is not passed down the line;
  // the one ahead himself enters through the floor (below), which reads where he really is.
  const gapNow = aOn.s - me.s; // arc behind the one ahead, along Lead's track
  const gapFt = aOn.sWant - me.s; // ... and behind the one ahead's place
  const gapRate = aOn.sWantDot - me.sDot;
  const d3 = sub3(st.pm, A.pm);
  const rangeFt = len3(d3);
  const closing = -dot3(d3, sub3(st.vel, A.vel)) / Math.max(rangeFt, 1);
  // The floor: heading inside 500 ft plus its margin in lookSec, he counts himself that much tighter (lag first).
  const shortFt = Math.max(0, P.floorFt + P.floorMarginFt - (rangeFt - closing * P.lookSec));

  // His picture of the turn where he is on Lead's circle: full in a turn of 1 G of turning, none straight, built and
  // faded over turnSec, so a reversal or a roll-out moves his picture smoothly.
  const turnNow = Math.min(1, (Math.abs(me.kap) * vh * vh) / (P.turnFullG * G_FTPS2));
  const turn = ws.turn == null ? turnNow : toward(ws.turn, turnNow, 1 / P.turnSec);

  // ---- the cone, with Lead level: his place across and along, taken where he is once Lead and he are level ----
  const acrossNow = me.y - aOn.y;
  let { place, level, side } = ws;
  const levelNow = ctx.leadLevel && turn < P.takeTurn;
  if (levelNow && !level) {
    if (Math.abs(acrossNow) > gapNow * Math.tan(5 * DEG)) side = Math.sign(acrossNow); // more than 5° off the tail: that side (estimate)
    place = conePlace(gapNow, acrossNow, side);
  }
  level = levelNow;
  // His stack: 50 to 100 ft below the one ahead; a deeper one kept from the press comes up to it only with Lead level
  // and him clear of the floor.
  const stackFt = levelNow && rangeFt >= P.floorFt + P.floorMarginFt ? toward(ws.stackFt, clamp(ws.stackFt, P.stackFt[0], P.stackFt[1]), P.altFtps) : ws.stackFt;
  const dConeWant = aOn.yWant + place.across;
  const dCone = ws.dCone == null ? dConeWant : toward(ws.dCone, dConeWant, P.coneFtps);

  // ---- lead, lag and pure: where across Lead's circle he flies to close or open the arc ----
  const wantGap = turn * P.arcFt + (1 - turn) * place.along;
  const errFt = gapFt - wantGap - P.floorGain * shortFt; // + stretched, - tight
  const rateWant = clamp(-errFt / P.arcSec, -P.arcRateFtps, P.arcRateFtps); // the gap's rate he wants
  // Along Lead's circle he moves at V / (1 - k y): inside it (y toward the centre) faster round, outside slower. The
  // offset that gives the one ahead's speed round plus the rate he wants: lead inside, lag outside, pure on it.
  const sDotWant = Math.max(1, aOn.sWantDot - rateWant);
  const capFt = P.acrossMaxFt * turnNow;
  const yLag = Math.abs(me.kap) > 1e-7 ? clamp((1 - vh / sDotWant) / me.kap, -capFt, capFt) : 0;
  const dWant = (1 - turn) * dCone + turn * yLag;

  // ---- the turn he asks for: onto that line across Lead's circle, Lead's own turn there as the feed forward ----
  const psiPath = Math.atan2(me.uy, me.ux);
  const psiWant = psiPath + clamp(Math.atan((dWant - me.y) / (P.pathLookSec * vh)), -P.maxCutDeg * DEG, P.maxCutDeg * DEG);
  const psi = Math.atan2(st.vel.y, st.vel.x);
  // The floor, lag first (TS-208): if the line he wants brings him inside 500 ft plus its margin of the one ahead in the
  // next few seconds, he lags: the nearest heading off it, turning less than the one ahead (or either way with him
  // straight), that keeps him out. Lead's turn into him is what this is for.
  const lo = P.floorFt + P.floorMarginFt;
  const me2 = { xFt: st.pm.x, yFt: st.pm.y, headingRad: psi, tasFtps: vh };
  const a2 = { xFt: A.pm.x, yFt: A.pm.y, headingRad: Math.atan2(A.vel.y, A.vel.x), tasFtps: Math.hypot(A.vel.x, A.vel.y), bankDeg: -A.bank };
  let psiFly = psiWant;
  let floorMissFt = 0;
  const p0 = predict(a2, me2, psiWant, P.floorLookSec, lo);
  if (p0.least < lo) {
    const aheadTurn = Math.abs(a2.bankDeg) > 5 ? Math.sign(a2.bankDeg) : 0; // + left
    const signs = aheadTurn ? [-aheadTurn] : [1, -1];
    // The heading that keeps him inside the floor least (how far and how long), the nearest of equals.
    let best = { psi: psiWant, p: p0 };
    for (let k = 1; k * P.floorStepDeg <= P.floorMaxDeg && best.p.shortFtSec > 0; k++) {
      for (const sg of signs) {
        const q = psiWant + sg * k * P.floorStepDeg * DEG;
        if (Math.abs(wrapPi(q - psiPath)) > P.floorMaxDeg * DEG + 1e-9) continue; // never more than floorMaxDeg off Lead's circle
        const p = predict(a2, me2, q, P.floorLookSec, lo);
        if (p.shortFtSec < best.p.shortFtSec - 1) best = { psi: q, p };
      }
    }
    psiFly = best.psi;
    floorMissFt = Math.max(0, lo - best.p.least);
  }
  // He rolls into Lead's turn, out of it or through a reversal a little before the point where Lead did, as a pilot
  // anticipates (anticipateSec of flight ahead along Lead's track).
  // Lagging off the floor he follows only lagShare of Lead's turn (lag: turning less than Lead), eased over about a
  // second (ffSec), so the lag he picked is not turned straight back into Lead's turn.
  const kAhead = kapAt(tr, me.s + P.anticipateSec * vh, me.k);
  const kPath = kAhead / Math.max(0.2, 1 - kAhead * dWant);
  const ff = toward(ws.ff ?? 1, floorMissFt > 0 || psiFly !== psiWant ? P.lagTurnShare : 1, 1 / P.ffSec);
  const aLat = ff * vh * vh * kPath + G_FTPS2 * (wrapPi(psiFly - psi) / (10 * DEG)) * P.gPer10Deg; // ft/s², + left

  // ---- height: his stack on Lead, the energy height and the floor's height, flown gently ----
  // Lag first, then height (TS-208; Patrick 12 Oct 2026 17:16Z "use the vertical to maintain 500"): when no lag keeps him
  // out, he takes height away from the one ahead, within the cone, at up to floorFtps.
  const floorWant = Math.min(P.coneFt, floorMissFt);
  const floorUpFt = floorWant >= ws.floorUpFt ? floorWant : toward(ws.floorUpFt, floorWant, P.altFtps); // taken at once, given back gently
  const awaySign = st.pm.z - A.pm.z >= 0 ? 1 : -1;
  const en = fwEnergy(errFt, -gapRate, st);
  // Tight, his energy height never takes him toward the one ahead: the knots go to the throttle instead.
  const enAlt = (shortFt > 0 || floorUpFt > 0) && en.altFt * awaySign < 0 ? 0 : en.altFt;
  const powerKt = en.powerKt - en.altFt / en.ftPerKt + enAlt / en.ftPerKt;
  const stackZ = L.pm.z + ctx.stackSumFt + stackFt + awaySign * floorUpFt;
  const hWant = stackZ + enAlt;
  const vMax = floorUpFt > 0 || floorWant > 0 ? P.floorFtps : P.altFtps;
  const vzWant = L.vel.z + clamp((hWant - st.pm.z) / (floorWant > 0 ? P.floorSec : P.altSec), -vMax, vMax);
  const aMax = (floorWant > 0 ? P.floorClimbG : P.maxClimbG) * G_FTPS2;
  const aV = clamp((vzWant - st.vel.z) / P.climbSec, -aMax, aMax);

  // ---- the lift: weight, the turn and the height, never a push; then the G he will pull for his bank now ----
  const nose = st.nose;
  const upPath = unit3(perp3(Z, nose)); // up, square to his path
  const leftH = unit3(cross3(Z, nose)); // left, level
  // Over his G cap the turn gives way, never the height: the part holding his height is kept and the turn is cut.
  const tight = rangeFt < P.floorFt;
  const cap = Math.min(shakerG(st.kias), tight ? availableG(st.kias) : Math.min(P.normalG, (L.g ?? 1) + P.overLeadG));
  const vertG = clamp(dot3(perp3(scale3(Z, 1 + aV / G_FTPS2), nose), upPath), P.minG, cap);
  const latG = clamp(aLat / G_FTPS2, -Math.sqrt(Math.max(0, cap * cap - vertG * vertG)), Math.sqrt(Math.max(0, cap * cap - vertG * vertG)));
  const lift = add3(scale3(upPath, vertG), scale3(leftH, latG));
  const want = gAndBankForLift(lift, nose, st.pm.up, st.bank * DEG);
  const wantBank = want.bankRad / DEG;
  // His hands: the bank asked moves at his roll rate, and while he rolls he pulls only the G that keeps the height he
  // wants at the bank he has (no more than the lift he wants, never under minG), so a roll is never a climb or a sink.
  const askBank = ws.askBank + clamp(wrapPi((wantBank - ws.askBank) * DEG) / DEG, -P.rollDps * dt, P.rollDps * dt);
  const gHeight = dot3(lift, upPath) / Math.max(0.2, Math.cos(st.bank * DEG));
  const gAsk = clamp(gHeight, P.minG, Math.max(P.minG, want.g));

  // ---- power: Lead's speed, plus what the height could not take, within 15 KIAS ----
  // At Lead's energy a climb in the cone falls him back and a descent moves him forward (Patrick 12 Oct 2026 08:19Z), so
  // the throttle holds the speed his height above his stack leaves him, plus only what the height could not take.
  const aboveFt = st.pm.z - stackZ;
  const holdKias = ctx.holdKias + clamp(powerKt - aboveFt / en.ftPerKt, -P.overtakeKias, P.overtakeKias);

  // The aircraft's roll (stepLead) closes on what he asks as fast as the T-6A can; he leads it by no more than rollLeadDeg,
  // so his wings move at about his own rate, never a snap to catch up.
  const bankAsk = st.bank + clamp(wrapPi((askBank - st.bank) * DEG) / DEG, -P.rollLeadDeg, P.rollLeadDeg);
  const next = stepLead(st, { g: gAsk, bank: bankAsk, holdKias });
  const pose = poseOf3d({
    x: next.pm.x, y: next.pm.y, altAbove: next.pm.z - blockFt, vel: next.vel, up: next.bodyUp,
    kias: next.kias, g: next.g, rollDps: -next.rollRate,
  });
  // The throttle his engine gives (TS-218, stepLead): it follows what holds his speed at the engine's rate, after its lag
  // from a settled idle; carried on with his power so the next pilot of the aircraft has it.
  const throttle = leadThrottle(next, holdKias);
  const power = withEngine(throttle < 0.005 ? powerFrom('idle', 0, next.kias, next.pm.z) : powerFrom(null, throttle, next.kias, next.pm.z), next.eng);
  return {
    ws: { ...ws, st: next, stackFt, side: Math.abs(acrossNow) > 1 ? Math.sign(acrossNow) : side, place, level, turn, dCone, askBank, floorUpFt, ff, k: me.k, yWant: dWant, sWant: aOn.sWant - wantGap },
    pose,
    power,
  };
}

/**
 * One of Lead's fighting wing moves with the wingmen on the live law (TS-208): the 2-ship's #2, and in the 4-ship #2, #3
 * and #4, each flying Lead's circle behind the one ahead, one step behind Lead. ws0: the wingmen's live states carried on
 * from the move being flown at the press, if any. Returns { ok, plans, wsTrack, note, endSec } or { ok: false, reason };
 * wsTrack holds, step by step, the wingmen's states in order.
 */
export function planFwMoveLive(aircraft, key, dir, t0 = 0, { blockFt = 8000, bankDeg, ws0 = null } = {}) {
  const [lead, ...wings] = aircraft;
  const lp = fwLeadPlan(lead, key, dir, t0, bankDeg, blockFt);
  if (!lp.ok) return lp;
  const L = copyAircraft(lead);
  const plan = { segments: lp.segments.map((s) => ({ ...s })), profile: lp.profile, roll: lp.roll };
  const carried = ws0 && ws0.length === wings.length && ws0[0]?.tr;
  let ws = carried ? ws0 : wings.map((w, i) => wingAtPress(aircraft[i], w, blockFt));
  // Lead's track: the one flown so far when a move is being flown, else seeded behind him at the press.
  const tr = carried ? trackUpTo(ws0[0].tr, ws0[0].trN) : seedTrack(leadStateOf(lead, blockFt));
  const poses = wings.map(() => []);
  const wsTrack = [];
  let t = t0;
  let doneAt = null;
  const profileEnd = Math.max(t0, ...(lp.profile ?? []).map((leg) => leg.t1)); // a climb or descent is over at its last leg's end
  while (t - t0 < FW_LIVE.maxSec) {
    // Everyone reads the others as they are at the start of the step (as fluid.js), then all fly the step.
    const Lst = leadStateOf(L, blockFt);
    extendTrack(tr, Lst);
    const leadLevel = Math.abs(Lst.bank) < 5 && Math.abs(Lst.rollRate) < 5; // Lead wings level, not rolling (estimates)
    const lOn0 = onTrack(tr, Lst.pm, Lst.vel, tr.x.length - 2);
    const lOn = { ...lOn0, y: 0, yWant: 0, sWant: lOn0.s, sWantDot: lOn0.sDot };
    flyStep(L, plan, t);
    t += dt;
    let aOn = lOn;
    let A = Lst;
    let stackSumFt = 0;
    const next = [];
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i];
      const r = stepFwWing(w, { L: Lst, A, aOn, tr, stackSumFt, holdKias: Lst.kias, blockFt, leadLevel });
      poses[i].push({ ...r.pose, power: r.power });
      // The one behind reads this one where he was at the start of the step, and his wanted place across, so a wobble of
      // his is not passed down the line.
      const on = onTrack(tr, w.st.pm, w.st.vel, w.k);
      aOn = { ...on, yWant: r.ws.yWant, sWant: r.ws.sWant, sWantDot: lOn.sDot };
      A = w.st;
      stackSumFt += w.stackFt;
      next.push({ ...r.ws, tr, trN: tr.x.length });
    }
    ws = next;
    wsTrack.push(ws);
    if (doneAt === null && planDone(L, plan) && t >= profileEnd) doneAt = t;
    if (doneAt !== null && t - doneAt >= FW_LIVE.settleSec) break;
  }
  const plans = { [lead.id]: { segments: lp.segments.map((x) => ({ ...x })), profile: lp.profile, roll: lp.roll } };
  wings.forEach((w, i) => { plans[w.id] = { segments: [{ kind: 'poseTrack', poses: poses[i] }] }; });
  const who = wings.length > 1 ? 'Each wingman flies Lead\'s circle 650 ft behind the one ahead (#2 behind Lead, #3 behind #2, #4 behind #3), never inside 500 ft of him' : '#2 flies Lead\'s circle 650 ft behind him, never inside 500 ft';
  return {
    ok: true,
    plans,
    wsTrack,
    note: `Fighting wing: Lead flies ${fwMoveWords(key, dir, bankDeg)}. ${who}: lead, pure or lag first, then height in the cone, then power within 15 KIAS; back in position in the cone as Lead rolls out (TS-208).`,
    endSec: t,
  };
}
