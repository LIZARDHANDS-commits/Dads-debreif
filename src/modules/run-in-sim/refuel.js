// Air refuelling: the point-parallel rendezvous and the join to pre-contact (spec "Air refuelling"; RS-15 to RS-18).
// APPROVED: Patrick's yes (relayed by Dad, 17 Oct 2026: "pat says build"). Plain values only, no page: index.js calls
// flyRefuel() when the refuelling run is flown, and the playback reads the stored timelines it returns.
//
// 1. The tanker (RS-15): a KC-130J with NO performance set (RS-Q1), so it is not flown: it is moved along its anchor over
//    the ground at a set height and true airspeed, its ground speed what the wind makes of that (speedAlong), its bank
//    drawn as the coordinated bank for its turn over the ground (core bankDegFromTurnRate). A picture, not a performance
//    claim. The anchor is the holding pattern's racetrack (ground-path.js holdLap, RS-11): the refuelling leg along the
//    track from the roll-out point (the origin, the chosen Place) to its far end, the turn there, the reciprocal leg back
//    offset two turn radii to the side it turns, and the rendezvous turn back onto the refuelling leg at the roll-out point.
// 2. The point-parallel worked out to hit (RS-16, as RS-9): the receiver's speed is the tanker's ground speed along the
//    track plus the set overtake, turned to the receiver's KIAS at its own height; its start is found by flying it, so it
//    is in the set trail when the tanker rolls out at the rendezvous time; the tanker's turn moment is that time less its
//    turn's time over the ground, and its turn range is the range over the ground between the two then. Either the turn
//    range or the receiver's speed can be set by hand (setup.aar.byHand); the run is then flown as set.
// 3. The join (RS-17): the receiver, the CT-156 on the T-6A set flown by the run-in pilot (pilot.js) on core's point mass,
//    climbs to the drogue's height, holds the line through the pre-contact point along the tanker's track (the L1
//    follower) and closes at the set overtake, easing off so it could brake at JOIN.brakeKtPerSec, to nothing at the point.
// RS-19 (Dad, 17 Oct 2026; approved: Patrick's yes, relayed by Dad): by default the receiver's flight starts with its
//    take-off from CYMJ (the runway into the wind; 29L when calm), the climb-out the Traffic module flies, and the transit
//    to the IP on the refuelling track at the rendezvous height; the tanker holds in its orbit, and its turn inbound is
//    worked out from the receiver's flight flown ahead (its IP time plus its run down the track to the trail point).
//    RS-20: the offset can be set by hand (the anchor that wide, the turn inbound still at the set bank). The airborne
//    start of the first version stays (setup.aar.start 'airborne').
// 4. The result: the trail at the roll-out against the plan, the overtake and closure (core closureKt: the rate the range
//    shrinks, ground against ground), the time to pre-contact, and flags (RS-6: references, never walls).
//
// Axes as pass.js: feet, x east, y north, z MSL, the roll-out point at x = y = 0. Headings compass degrees TRUE. Speeds
// name their kind: KIAS set, true airspeed flown, ground speed over the ground. Every number here is an ESTIMATE: no
// manual page gives any of them yet (ATP-56, the NATO air-to-air refuelling publication, would be the reference; not read).
import { windTriangle } from '../../core/wind.js';
import { densityRatio } from '../../core/atmosphere.js';
import { iasToTasKt, tasToIasKt } from '../../core/t6-performance.js';
import { pointMassState, stepPointMass } from '../../core/point-mass.js';
import { turnRadiusFromBankFt, turnRateFromBankRadPerSec, bankDegFromTurnRate, closureKt } from '../../core/flight-math.js';
import { unitVectorFromCompassDeg, compassDegToHeadingRad, compassDegFromVector, degToRad, wrapPi } from '../../core/angles.js';
import { FT_PER_NM, KT_TO_FTPS } from '../../core/units.js';
import { makeLocalRef, latLonToLocalFt } from '../../core/geo.js';
import { dropWind } from '../debrief/drop.js';
import { CIRCUIT } from '../traffic/circuit.js';
import { THRESHOLD_29L, DEPARTURE_END_29L, cymjLatLon } from '../../airfields/cymj-runways.js';
import { FIELD_ELEV_FT } from '../traffic/airfield.js';
import { WHEELS_BELOW_ORIGIN_FT } from '../debrief/view3d/ground.js';
import { AIRCRAFT } from './aircraft.js';
import { makePath, pointOnPath, samplePath, holdLap } from './ground-path.js';
import { PILOT, pilotAt, pilotStep, wantedLift, airData } from './pilot.js';
import { PASS_STEP_SEC, speedAlong, windWords, climbToward } from './pass.js';

/** The tanker: a picture with no performance set (RS-Q1, RS-15). */
export const TANKER = Object.freeze({ name: 'KC-130J tanker', shortName: 'KC-130J' });

/**
 * The left and right pods, hoses and baskets in the tanker's frame (feet from its centre, which the C-130J model turns
 * about, its "wing line"; ahead +, left +, up +), ESTIMATES for the picture: the pods 50 ft out (between the outer nacelle
 * at 33.4 ft and the tip at 66.3 ft, the model's sources R9 and R10, tools/blender/c130j/sources.md), 15 ft long and
 * 2.7 ft across, hung below the wing with their tails about at the wing line and 7 ft above the centre; each hose 75 ft
 * trailed 8° below level to a basket 2.6 ft across. kc130j.js draws them from these same numbers.
 */
export const DROGUE = Object.freeze({ podOutFt: 50, podTailAheadFt: 0.7, podUpFt: 7, podLengthFt: 15, podDiaFt: 2.7, hoseFt: 75, hoseDownDeg: 8, basketFt: 2.6 });
/** The stand-in receiver's nose ahead of its centre, ft: the CT-156 model's spinner tip, 0.66 of its 1.44 units ahead of its origin on 33 ft 4 in (ct156-model.js). */
export const RECEIVER = Object.freeze({ noseAheadFt: 15.3, words: 'Stand-in receiver (CT-156, no probe)' });
/**
 * The join (RS-17), ESTIMATES of a smooth technique: the closure eased off so it could brake at brakeKtPerSec, and over
 * the last few feet closed in about settleSec; the climb to the drogue's height at no more than climbDeg, and only once
 * at least climbBehindFt behind the tanker's wing line (below it until then, so an overrun drops back before it climbs);
 * stabilised in pre-contact within stableFt each way for stableSec; the join followed for at most maxSec (a guard).
 */
export const JOIN = Object.freeze({ brakeKtPerSec: 0.3, settleSec: 4, climbDeg: 5, climbBehindFt: 300, stableFt: 10, stableSec: 10, maxSec: 600 });
/** The card's references (RS-6: flags, never walls), ESTIMATES until Patrick or ATP-56: the peak closure, and the closure inside nearFt of pre-contact. */
export const AAR_REFERENCES = Object.freeze({ closureKt: 30, nearClosureKt: 10, nearFt: 200 });
/**
 * The take-off and climb-out (RS-19). The run starts rolling at the threshold at startKias, the Traffic module's lift-off
 * number (Traffic spec item 21, an estimate there): the ground roll from a standstill is not modelled (the T-6A set has
 * nothing for the wheels, and its thrust fit isn't meant for low speeds). The set is clean only (no take-off flap), so the
 * wheels stay on the runway, at full power on the set, until the clean stall line gives liftG (an estimate). Then the
 * Traffic module's climb-out (CIRCUIT, Patrick 4 Oct 08:15Z; SMM 3.11, 3.14 para 35): the take-off attitude to the climb
 * speed, then the climb at that speed on climbShare of the full-power excess (an estimate, so the throttle keeps a margin;
 * climb rate = excess × TAS, the set's own), straight ahead on the runway track until turnAfterMsl and past the departure
 * end (Patrick, 6 Oct, Traffic spec item 22).
 */
export const TAKEOFF = Object.freeze({ startKias: 85, liftG: 1.3, climbShare: 0.9, turnAfterMsl: 2500 });
/** The lowest receiver speed the working-out picks, KIAS (an estimate, as the run-in's lowest roll-in speed). */
const MIN_RCV_KIAS = 140;
/** The working-out flights step at this, s; the stored flight is at PASS_STEP_SEC. */
const SOLVE_STEP_SEC = 0.1;
/** The tanker's bank is read off its heading over this window either side, s (it rolls in over about twice this in the picture). */
const BANK_WINDOW_SEC = 1.5;
/** The tanker's time along its path is tabled every this many feet. */
const TABLE_STEP_FT = 50;

/** A run is followed for at most this long, s (a guard: a far place makes a long transit). */
const MAX_RUN_SEC = 3 * 3600;
/** The receiver's legs as stored in the timeline. */
export const AAR_PHASE = Object.freeze({ RV: 0, JOIN: 1, STABLE: 2, GROUND: 3, DEPART: 4, TO_IP: 5 });

const left = (h) => ({ x: -h.y, y: h.x });
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const nm = (ft) => ft / FT_PER_NM;
const TAU = Math.PI * 2;

/**
 * The plan: the anchor, the speeds and the numbers worked out to hit (RS-16).
 * setup: defaults.js setupFrom() for the refuelling run (setup.aar); world: { groundAt(x, y), known(x, y) }.
 */
export function buildRefuelPlan(setup, world) {
  const a = setup.aar;
  const ac = AIRCRAFT[setup.aircraftId];
  const groundAt = world.groundAt;
  const groundFt = groundAt(0, 0);
  const sigmaAt = (z) => densityRatio(z, setup.tempDevC);
  const tasFt = (kias, z) => iasToTasKt(kias, z, sigmaAt(z)) * KT_TO_FTPS;
  const u = unitVectorFromCompassDeg(a.trackDegT);
  const r = { x: u.y, y: -u.x }; // right of the track
  const H = a.heightFt;
  const Hr = H - a.splitFt;
  const typed = { topDeg: setup.wind.topDegT, topKt: setup.wind.topKt, groundDeg: setup.wind.groundDegT, groundKt: setup.wind.groundKt };
  const windAt = dropWind({ mode: 'typed', typed, releaseFt: H, groundFt }).at;
  const notes = [];
  const worked = {};

  // The turn inbound, flown in the air mass (RS-21, standard aerodynamics): constant true airspeed and the set bank, so
  // the heading turns at core turnRateFromBankRadPerSec's rate from the heading that holds the reciprocal leg's track to
  // the one that holds the refuelling track (core windTriangle on each), and the ground track is that circle through the
  // air plus the wind times the time (the drift). airTurn() gives where it is τ seconds into the turn from its start.
  const Vt = tasFt(a.tankerKias, H);
  const R = turnRadiusFromBankFt(Vt, a.bankDeg);
  const wT = windAt(H);
  const wW = windWords(wT);
  const headingFor = (track) => compassDegToHeadingRad(windTriangle(compassDegFromVector(track.x, track.y), Vt / KT_TO_FTPS, wW.fromDeg, wW.kt).headingDeg);
  const turnSign = a.dir < 0 ? 1 : -1; // anticlockwise (left) +1
  const psiA = headingFor({ x: -u.x, y: -u.y });
  const psiB = headingFor(u);
  const turnRad = ((((turnSign * (psiB - psiA)) % TAU) + TAU) % TAU) || TAU;
  const omega = turnRateFromBankRadPerSec(Vt, a.bankDeg);
  const turnSec = turnRad / omega;
  const airTurn = (tau) => {
    const psi = psiA + turnSign * omega * tau;
    return {
      dx: (R / turnSign) * (Math.sin(psi) - Math.sin(psiA)) + wT.x * tau,
      dy: -(R / turnSign) * (Math.cos(psi) - Math.cos(psiA)) + wT.y * tau,
      psi,
    };
  };
  const D = airTurn(turnSec);
  const side = a.dir < 0 ? left(u) : { x: u.y, y: -u.x }; // the side the reciprocal leg lies on
  const offsetHitFt = -(D.dx * side.x + D.dy * side.y); // the offset that rolls the tanker out on the receiver's track
  const alongShiftFt = D.dx * u.x + D.dy * u.y; // how far along the track the turn carries it (the drift's share and the crabs')

  // The anchor (RS-15, RS-20): a racetrack as wide as the offset (worked out to hit for this wind, or set by hand), its
  // refuelling leg from the origin along the track. holdLap's lap starts at its "IP" (here the refuelling leg's far end):
  // the turn there, the reciprocal leg, the turn back, and the refuelling leg. In orbit it keeps that shape over the
  // ground, so in a wind its drawn bank changes round its turns (flagged past the set bank); only the last lap's turn
  // inbound is flown in the air mass: it starts where it rolls the tanker out at the origin (the reciprocal leg longer or
  // shorter by the drift along the track), and a hand-set offset rolls it out to the side by the difference.
  const offsetFt = a.byHand.offsetNm !== null ? a.byHand.offsetNm * FT_PER_NM : offsetHitFt;
  const legFt = a.legNm * FT_PER_NM;
  const farEnd = { x: u.x * legFt, y: u.y * legFt };
  const lapSegs = holdLap({ ip: farEnd, u, dir: a.dir, r: offsetFt / 2, legFt });
  const lap = makePath(lapSegs);
  const turnStart = { x: side.x * offsetFt - u.x * alongShiftFt, y: side.y * offsetFt - u.y * alongShiftFt };
  const rollOutPt = { x: turnStart.x + D.dx, y: turnStart.y + D.dy };
  const preSegs = [lapSegs[0], { kind: 'line', a: { ...lapSegs[1].a }, b: { ...turnStart } }]; // the last lap up to the turn inbound
  const gsAt = (dir) => Math.max(1, speedAlong({ x: dir.x, y: dir.y, z: 0 }, wT, Vt));

  // The receiver's speed (RS-16): the tanker's ground speed along the track plus the overtake, then through the receiver's
  // own wind to true airspeed, then to KIAS at its height (like with like).
  const wR = windAt(Hr);
  const tankerGs = gsAt(u);
  const gsWant = tankerGs + a.overtakeKt * KT_TO_FTPS;
  const tasR = Math.hypot(gsWant * u.x - wR.x, gsWant * u.y - wR.y) / KT_TO_FTPS;
  worked.rcvKias = clamp(tasToIasKt(tasR, Hr, sigmaAt(Hr)), MIN_RCV_KIAS, ac.maxKias(Hr));
  worked.offsetFt = offsetHitFt; // the offset worked out to hit for this wind: the tanker rolls out on the receiver's track
  worked.turnSec = turnSec;
  worked.alongShiftFt = alongShiftFt;
  worked.wind = { fromDegM: (((wW.fromDeg - (a.magVarDegE ?? 0)) % 360) + 360) % 360, kt: wW.kt, atFt: H };
  const rcvKias = a.byHand.rcvKias ?? worked.rcvKias;

  // The take-off (RS-19): CYMJ's runway into the ground wind, 29L when calm (the Traffic module's default), in this run's
  // frame (feet about the place), its height the shared terrain's at the threshold; the IP on the track behind the origin.
  let runway = null;
  if (a.start === 'takeoff') {
    const ref = makeLocalRef(a.placeLat, a.placeLon);
    const here = (p) => {
      const q = cymjLatLon(p);
      return latLonToLocalFt(ref, q.lat, q.lon);
    };
    const th29 = here(THRESHOLD_29L);
    const end29 = here(DEPARTURE_END_29L);
    const d29 = Math.hypot(end29.x - th29.x, end29.y - th29.y);
    const dir29 = { x: (end29.x - th29.x) / d29, y: (end29.y - th29.y) / d29 };
    const gw = windWords(windAt(groundFt - 1e6)); // the ground wind (the typed blend's bottom)
    const head29 = gw.kt * Math.cos(degToRad(gw.fromDeg) - Math.atan2(dir29.x, dir29.y)); // headwind on 29L, kt
    const use29 = gw.kt < 0.5 || head29 >= 0;
    const th = use29 ? th29 : end29;
    const end = use29 ? end29 : th29;
    const dir = use29 ? dir29 : { x: -dir29.x, y: -dir29.y };
    // Its height: CYMJ's 1,892 ft (Patrick's number, Traffic airfield.js) or the shared terrain's at the threshold if higher,
    // so the runway is never under the drawn ground; the aircraft's centre stands WHEELS_BELOW_ORIGIN_FT over it on its
    // wheels (the Debrief's 5.4 ft, an estimate there).
    runway = { name: use29 ? '29L' : '11R', th, end, dir, lenFt: d29, z: Math.max(FIELD_ELEV_FT, groundAt(th.x, th.y)) };
  }
  const ipFt = a.ipNm * FT_PER_NM;

  return {
    kind: 'aar', setup, run: setup.run, ac, u, r, groundFt, groundAt, known: world.known ?? (() => false),
    sigmaAt, tasFt, windAt, windMsl: H, notes, worked,
    aar: a, H, Hr, Vt, R, legFt, farEnd, lap, lapSegs, preSegs, turnStart, rollOutPt, airTurn, turnSec, psiB, turnSign,
    offsetFt, gsAt, tankerGs, rcvKias, trailFt: a.trailNm * FT_PER_NM,
    takeoff: a.start === 'takeoff', runway, ipFt, ip: { x: -u.x * ipFt, y: -u.y * ipFt },
    // Filled by flyRefuel: the receiver's start, the tanker's turn and roll-out times and its schedule.
    startAlong: null, tTurn: null, tRollOut: null, schedule: null, tIpPlan: null,
  };
}

/** Time (s) along a path at ground speed gsAt(dir), tabled every TABLE_STEP_FT: { s: [], t: [] }. */
function timeTable(path, gsAt) {
  const s = [0];
  const t = [0];
  const n = Math.max(1, Math.ceil(path.total / TABLE_STEP_FT));
  for (let i = 1; i <= n; i++) {
    const a = (path.total * (i - 1)) / n;
    const b = (path.total * i) / n;
    const mid = pointOnPath(path, (a + b) / 2);
    s.push(b);
    t.push(t[i - 1] + (b - a) / gsAt(mid.dir));
  }
  return { s, t };
}
/** The time at distance s along a table (straight between its points). */
function timeAt(tb, s) {
  const i = clamp(Math.floor(s / (tb.s[1] - tb.s[0] || 1)), 0, tb.s.length - 2);
  const f = (s - tb.s[i]) / (tb.s[i + 1] - tb.s[i] || 1);
  return tb.t[i] + f * (tb.t[i + 1] - tb.t[i]);
}
/** The distance at time T along a table (a search: the times rise along it). */
function distAt(tb, T) {
  let lo = 0;
  let hi = tb.t.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (tb.t[m] <= T) lo = m;
    else hi = m;
  }
  const f = (T - tb.t[lo]) / (tb.t[hi] - tb.t[lo] || 1);
  return tb.s[lo] + clamp(f, 0, 1) * (tb.s[hi] - tb.s[lo]);
}

/**
 * The tanker's schedule (RS-15): as many laps of the anchor as it needs to roll out at the origin at tRollOut, and where
 * along them it starts. Past the last lap's end (the refuelling leg's far end) it carries on straight in the picture.
 */
function tankerSchedule(plan, tRollOut) {
  const table1 = timeTable(plan.lap, plan.gsAt);
  const lapSec = table1.t[table1.t.length - 1];
  const pre = makePath(plan.preSegs);
  const preTable = timeTable(pre, plan.gsAt);
  const before = preTable.t[preTable.t.length - 1] + plan.turnSec; // from a lap's start to the roll-out on the last lap
  const laps = 1 + Math.max(0, Math.ceil((tRollOut - before) / lapSec - 1e-9));
  const segs = [];
  for (let k = 0; k < laps - 1; k++) segs.push(...plan.lapSegs);
  segs.push(...plan.preSegs);
  const path = makePath(segs);
  const table = timeTable(path, plan.gsAt);
  const end = table.t[table.t.length - 1]; // the turn inbound starts here (path time)
  return { path, table, laps, lapSec, end, t0: Math.max(0, end + plan.turnSec - tRollOut) };
}

/** Where the tanker is at time t: { x, y, z, dir (its ground track, unit), gs (ft/s), ax, ay (its air velocity), headingRad (its nose) }. */
export function tankerAt(plan, t) {
  const sc = plan.schedule;
  const T = sc.t0 + t;
  const w = plan.windAt(plan.H);
  if (T > sc.end) {
    // The turn inbound in the air mass (RS-21), then on along the refuelling track from the roll-out point.
    const tau = Math.min(T - sc.end, plan.turnSec);
    const q = plan.airTurn(tau);
    const ax = plan.Vt * Math.cos(q.psi);
    const ay = plan.Vt * Math.sin(q.psi);
    const after = T - sc.end - plan.turnSec;
    const gx = ax + w.x, gy = ay + w.y;
    const gs = Math.hypot(gx, gy) || 1;
    const dir = { x: gx / gs, y: gy / gs };
    const x = plan.turnStart.x + q.dx + (after > 0 ? gx * after : 0);
    const y = plan.turnStart.y + q.dy + (after > 0 ? gy * after : 0);
    return { x, y, z: plan.H, dir, gs, ax, ay, headingRad: q.psi };
  }
  const s = distAt(sc.table, T);
  const q = pointOnPath(sc.path, s);
  const gs = plan.gsAt(q.dir);
  const ax = gs * q.dir.x - w.x;
  const ay = gs * q.dir.y - w.y;
  return { x: q.x, y: q.y, z: plan.H, dir: q.dir, gs, ax, ay, headingRad: Math.atan2(ay, ax) };
}

/** The tanker's bank in the picture at time t, degrees, right positive: the coordinated bank for its heading's rate. */
function tankerBankAt(plan, t) {
  const a = tankerAt(plan, t - BANK_WINDOW_SEC);
  const b = tankerAt(plan, t + BANK_WINDOW_SEC);
  const rate = wrapPi(b.headingRad - a.headingRad) / (2 * BANK_WINDOW_SEC); // anticlockwise positive
  return bankDegFromTurnRate(plan.Vt, -rate);
}

/** The left basket and the pre-contact point (where the receiver's centre sits) behind it, from the tanker's state. */
export function drogueAt(plan, tk) {
  const f = { x: Math.cos(tk.headingRad), y: Math.sin(tk.headingRad) };
  const l = left(f);
  const D = DROGUE;
  const back = DROGUE.hoseFt * Math.cos(degToRad(D.hoseDownDeg));
  const drogue = {
    x: tk.x + f.x * (D.podTailAheadFt - back) + l.x * D.podOutFt,
    y: tk.y + f.y * (D.podTailAheadFt - back) + l.y * D.podOutFt,
    z: tk.z + D.podUpFt - D.hoseFt * Math.sin(degToRad(D.hoseDownDeg)),
  };
  const behind = plan.aar.preContactFt + RECEIVER.noseAheadFt;
  return { drogue, pre: { x: drogue.x - f.x * behind, y: drogue.y - f.y * behind, z: drogue.z }, f };
}

/** The receiver's start: on the track, `alongFt` from the roll-out point, at its height and speed, crabbed for the wind. */
function receiverStart(plan, alongFt, kias) {
  const vFtps = plan.tasFt(kias, plan.Hr);
  const w = windWords(plan.windAt(plan.Hr));
  const tri = windTriangle(plan.aar.trackDegT, vFtps / KT_TO_FTPS, w.fromDeg, w.kt);
  const s = pointMassState({ x: plan.u.x * alongFt, y: plan.u.y * alongFt, altFt: plan.Hr, ktas: vFtps / KT_TO_FTPS, headingRad: compassDegToHeadingRad(tri.headingDeg) });
  return pilotAt(s, { aircraft: plan.ac, sigmaAt: plan.sigmaAt });
}

/** The receiver at the start of its take-off (RS-19): on the runway's threshold, rolling along it at TAKEOFF.startKias. */
function receiverOnRunway(plan) {
  const rw = plan.runway;
  const ktas = iasToTasKt(TAKEOFF.startKias, rw.z, plan.sigmaAt(rw.z));
  const s = pointMassState({ x: rw.th.x, y: rw.th.y, altFt: rw.z + WHEELS_BELOW_ORIGIN_FT, ktas, headingRad: Math.atan2(rw.dir.y, rw.dir.x) });
  return { ...pilotAt(s, { aircraft: plan.ac, sigmaAt: plan.sigmaAt }), throttle: 1, trim: 1 };
}

/**
 * One step on the runway (RS-19): core's point mass at full power on the set, the runway carrying the weight (1 G, wings
 * level), the wheels held on the runway; it moves with the wind as in the air (a crab on the runway isn't
 * modelled: a few feet across in a crosswind over the few seconds).
 */
function runwayStep(plan, p, dt) {
  const next = stepPointMass(p.s, { g: 1, bankRad: 0 }, dt, plan.ac.excessFn(1));
  const w = plan.windAt(next.z);
  next.x += w.x * dt;
  next.y += w.y * dt;
  next.z = plan.runway.z + WHEELS_BELOW_ORIGIN_FT; // on its wheels on the runway
  next.vz = 0;
  return { ...p, s: next, bankDeg: 0, rollRateDps: 0, g: 1, gRate: 0, throttle: 1, trim: 1, climbRateRadPerSec: 0 };
}

/**
 * The climb-out's flight-path angle (RS-19, the Traffic module's): the take-off attitude while short of the climb speed
 * (6° less the angle of attack at level flight there, as Traffic's circuit.js works it), then the climb the set gives at
 * full power (TAKEOFF.climbShare of its excess: climb rate = excess × TAS), never steeper than the level-off at the
 * rendezvous height asks.
 */
function climbOutRad(plan, s, wind) {
  const a = airData(s, plan.sigmaAt);
  const level = climbToward(s, wind, plan.Hr, 30);
  const excess = plan.ac.excessFn(1)(a.ktas, s.z, 1);
  const climb = Math.asin(clamp(TAKEOFF.climbShare * excess, 0, 0.5));
  if (a.kias < CIRCUIT.climbKias - 3 && s.z < plan.Hr - 300) {
    const pitch = degToRad(CIRCUIT.takeoffPitchDeg - plan.ac.attitudeDeg(0, a.vFtps, a.kias, 1));
    return Math.min(level, Math.max(0, Math.min(pitch, climb)));
  }
  return Math.min(level, climb);
}

/** The receiver's command this step: the climb-out, to the IP, the rendezvous track at its height and speed, or the join on the pre-contact point. */
function control(plan, p, phase, t, kias, mem = {}) {
  const s = p.s;
  const wind = plan.windAt(s.z);
  const env = { wind, sigmaAt: plan.sigmaAt };
  const gh = Math.hypot(s.vx + wind.x, s.vy + wind.y);
  const look = Math.max(500, gh * PILOT.lookaheadSec);
  if (phase === AAR_PHASE.DEPART || phase === AAR_PHASE.TO_IP) {
    // Straight ahead on the runway track, then for the IP; at the climb speed until near the rendezvous height, then its speed.
    const rw = plan.runway;
    const along = (s.x - rw.th.x) * rw.dir.x + (s.y - rw.th.y) * rw.dir.y;
    const aim = phase === AAR_PHASE.DEPART ? { x: rw.th.x + rw.dir.x * (along + look), y: rw.th.y + rw.dir.y * (along + look) } : plan.ip;
    const climbCmdRad = climbOutRad(plan, s, wind);
    return { lift: wantedLift(p, { ...env, climbCmdRad, aim }), kias: s.z < plan.Hr - 300 ? CIRCUIT.climbKias : kias, gMax: PILOT.manoeuvreG };
  }
  if (phase === AAR_PHASE.RV) {
    const along = s.x * plan.u.x + s.y * plan.u.y;
    const aim = { x: plan.u.x * (along + look), y: plan.u.y * (along + look) };
    const climbCmdRad = climbToward(s, wind, plan.Hr, PILOT.maxClimbDeg);
    return { lift: wantedLift(p, { ...env, climbCmdRad, aim }), kias, gMax: PILOT.manoeuvreG };
  }
  const tk = tankerAt(plan, t);
  const { pre, f } = drogueAt(plan, tk);
  const d = tk.dir;
  const behind = (s.x - pre.x) * d.x + (s.y - pre.y) * d.y; // − behind the point, + past it
  const aim = { x: pre.x + d.x * (behind + look), y: pre.y + d.y * (behind + look) };
  // He climbs once far enough behind the wing line, and keeps climbing while behind it (mem.climbing). Still low and not
  // cleared (an overrun), he closes on a point JOIN.climbBehindFt + 200 ft behind the wing line instead, so he drops back
  // first; then climbs; then closes on pre-contact.
  const behindWing = (tk.x - s.x) * f.x + (tk.y - s.y) * f.y;
  mem.climbing = behindWing >= JOIN.climbBehindFt || (Boolean(mem.climbing) && behindWing > 0);
  const climbCmdRad = climbToward(s, wind, mem.climbing ? pre.z : Math.min(s.z, plan.Hr), JOIN.climbDeg);
  const low = !mem.climbing && s.z < pre.z - 100;
  const backFt = JOIN.climbBehindFt + 200;
  const to = low ? { x: tk.x - f.x * backFt, y: tk.y - f.y * backFt } : pre;
  // The closure he wants: the set overtake far out, eased off so he could brake at JOIN.brakeKtPerSec, nothing at the point.
  const e = (to.x - s.x) * d.x + (to.y - s.y) * d.y;
  const most = plan.aar.overtakeKt * KT_TO_FTPS;
  const brake = JOIN.brakeKtPerSec * KT_TO_FTPS;
  const closure = Math.sign(e) * Math.min(most, Math.sqrt(2 * brake * Math.abs(e)), Math.abs(e) / JOIN.settleSec);
  const gsWant = tk.gs + closure;
  const tas = Math.hypot(gsWant * d.x - wind.x, gsWant * d.y - wind.y) / KT_TO_FTPS;
  return { lift: wantedLift(p, { ...env, climbCmdRad, aim }), kias: tasToIasKt(tas, s.z, plan.sigmaAt(s.z)), gMax: PILOT.manoeuvreG };
}

/**
 * Flies the receiver from `pilot` at t = 0, from the runway (plan.takeoff) or on the rendezvous track. tRollOut: when the
 * join starts (Infinity: never); until: stop then (s); stopAt 'trail': stop once on the track at the trail point (the
 * working-out); every: keep a point this often (s); record: keep the whole flight and the tanker's beside it.
 * Returns { p (the last), pts ([{ t, x, y, z }] every `every`), timeline, tanker, events, ground }.
 * @param {any} plan
 * @param {any} pilot
 * @param {{ kias: number, tRollOut?: number, until?: number, dt?: number, every?: number | null, record?: boolean, stopAt?: string | null }} options
 */
function fly(plan, pilot, { kias, tRollOut = Infinity, until = Infinity, dt = PASS_STEP_SEC, every = null, record = false, stopAt = null }) {
  const env = { aircraft: plan.ac, sigmaAt: plan.sigmaAt, windAt: plan.windAt };
  const tl = record ? { t: [], x: [], y: [], z: [], vx: [], vy: [], vz: [], bank: [], g: [], kias: [], phase: [] } : null;
  const tt = record ? { x: [], y: [], z: [], vx: [], vy: [], bank: [] } : null;
  const pts = [];
  const events = {};
  let p = pilot;
  let t = 0;
  /** @type {number} */
  let ph = plan.takeoff ? AAR_PHASE.GROUND : AAR_PHASE.RV;
  const u = plan.u;
  const alongOf = (q) => q.x * u.x + q.y * u.y;
  let stableFrom = null;
  let ground = null;
  let nextKeep = 0;
  const mem = {};
  const end = Math.min(until, tRollOut + JOIN.maxSec, MAX_RUN_SEC);
  const push = (kiasNow) => {
    if (every !== null && t >= nextKeep - 1e-9) {
      pts.push({ t, x: p.s.x, y: p.s.y, z: p.s.z });
      nextKeep += every;
    }
    if (!tl) return;
    const s = p.s;
    tl.t.push(t); tl.x.push(s.x); tl.y.push(s.y); tl.z.push(s.z); tl.vx.push(s.vx); tl.vy.push(s.vy); tl.vz.push(s.vz);
    tl.bank.push(p.bankDeg); tl.g.push(p.g); tl.kias.push(kiasNow); tl.phase.push(ph);
    const tk = tankerAt(plan, t);
    tt.x.push(tk.x); tt.y.push(tk.y); tt.z.push(tk.z); tt.vx.push(tk.ax); tt.vy.push(tk.ay); tt.bank.push(tankerBankAt(plan, t));
  };
  push(airData(p.s, plan.sigmaAt).kias);
  while (t < end - 1e-9) {
    // The take-off's legs (RS-19): off the runway once the stall line gives TAKEOFF.liftG; turning for the IP once at
    // TAKEOFF.turnAfterMsl and past the departure end; onto the track near the IP (the turn led as the run-in's is).
    if (ph === AAR_PHASE.GROUND && plan.ac.stallG(airData(p.s, plan.sigmaAt).kias) >= TAKEOFF.liftG) {
      ph = AAR_PHASE.DEPART;
      events.takeoff = t;
    }
    if (ph === AAR_PHASE.DEPART) {
      const rw = plan.runway;
      const past = (p.s.x - rw.th.x) * rw.dir.x + (p.s.y - rw.th.y) * rw.dir.y >= rw.lenFt;
      if (past && p.s.z >= TAKEOFF.turnAfterMsl) ph = AAR_PHASE.TO_IP;
    }
    if (ph === AAR_PHASE.TO_IP) {
      const w = plan.windAt(p.s.z);
      const switchFt = Math.max(turnRadiusFromBankFt(Math.hypot(p.s.vx + w.x, p.s.vy + w.y), PILOT.manoeuvreBankDeg), 1500);
      if (Math.hypot(plan.ip.x - p.s.x, plan.ip.y - p.s.y) < switchFt || alongOf(p.s) >= -plan.ipFt) ph = AAR_PHASE.RV;
    }
    if (events.ip === undefined && plan.takeoff && (ph === AAR_PHASE.TO_IP || ph === AAR_PHASE.RV) && alongOf(p.s) >= -plan.ipFt) events.ip = t;
    if (stopAt === 'trail' && ph === AAR_PHASE.RV && events.ip !== undefined && alongOf(p.s) >= -plan.trailFt) {
      events.trail = t;
      break;
    }
    if ((ph === AAR_PHASE.RV || ph === AAR_PHASE.TO_IP || ph === AAR_PHASE.DEPART) && t >= tRollOut - 1e-9) {
      ph = AAR_PHASE.JOIN;
      events.rollOut = t;
    }
    if (ph === AAR_PHASE.JOIN) {
      // Stabilised in pre-contact: within JOIN.stableFt each way for JOIN.stableSec.
      const tk = tankerAt(plan, t);
      const { pre } = drogueAt(plan, tk);
      const d = tk.dir;
      const dx = p.s.x - pre.x, dy = p.s.y - pre.y;
      const near = Math.abs(dx * d.x + dy * d.y) <= JOIN.stableFt && Math.abs(-dx * d.y + dy * d.x) <= JOIN.stableFt && Math.abs(p.s.z - pre.z) <= JOIN.stableFt;
      if (!near) stableFrom = null;
      else if (stableFrom === null) {
        stableFrom = t;
        events.preContact ??= t;
      }
      if (near && t - stableFrom >= JOIN.stableSec) {
        ph = AAR_PHASE.STABLE;
        events.stable = t;
        break;
      }
    }
    let kiasNow;
    if (ph === AAR_PHASE.GROUND) {
      kiasNow = airData(p.s, plan.sigmaAt).kias;
      p = runwayStep(plan, p, dt);
    } else {
      const step = pilotStep(p, control(plan, p, ph, t, kias, mem), env, dt);
      p = step.p;
      kiasNow = step.kias;
    }
    t += dt;
    push(kiasNow);
    // The ground: hit once airborne (a foot of slack for the terrain's steps under the climb-out).
    if (ph !== AAR_PHASE.GROUND && p.s.z < plan.groundAt(p.s.x, p.s.y) - (events.takeoff !== undefined && t - events.takeoff < 30 ? 1 : 0)) {
      ground = { t, x: p.s.x, y: p.s.y, z: p.s.z };
      break;
    }
  }
  return { p, pts, timeline: tl, tanker: tt, events, ground };
}

/**
 * The whole run: the plan, the worked-out start and turn, the stored flight (the receiver's timeline with the tanker's
 * beside it at the same times) and the result. Returns { plan, flight, tanker, exit, result, computeMs }.
 */
export function flyRefuel(setup, world) {
  const started = globalThis.performance?.now?.() ?? Date.now();
  const plan = buildRefuelPlan(setup, world);
  const a = plan.aar;
  const { worked, notes } = plan;

  // The timing (RS-16, RS-19). From the take-off: the receiver's flight flown ahead at the worked-out speed, from the runway
  // to the trail point on the track (its IP time plus its run down the track); the tanker rolls out then. Airborne: the
  // rendezvous track flown for the rendezvous time from the roll-out point; the start is that far back, plus the trail
  // (the flight is the same wherever along the track it starts).
  let rvSec = a.rvSec;
  const startPilot = () => (plan.takeoff ? receiverOnRunway(plan) : receiverStart(plan, plan.startAlong, plan.rcvKias));
  if (plan.takeoff) {
    const trial = fly(plan, receiverOnRunway(plan), { kias: worked.rcvKias, dt: SOLVE_STEP_SEC, stopAt: 'trail' });
    if (trial.events.trail === undefined) {
      notes.push(trial.ground ? 'The receiver hit the ground on its climb-out: the take-off can\'t be flown over this ground.' : 'The receiver never reached the trail point on the track: no rendezvous to work out.');
    }
    rvSec = trial.events.trail ?? a.rvSec;
    plan.tIpPlan = trial.events.ip ?? null;
    worked.takeoffSec = trial.events.takeoff ?? null;
    const madeKias = airData(trial.p.s, plan.sigmaAt).kias;
    if (trial.events.trail !== undefined && worked.rcvKias - madeKias > 5) {
      notes.push(`The receiver can't make ${Math.round(worked.rcvKias)} KIAS at ${ftWords(plan.Hr)} on the T-6A set at full power: it flies at about ${Math.round(madeKias)} KIAS, so it rolls out with less overtake than the set ${a.overtakeKt} kt. A lower overtake or a slower tanker would work.`);
    }
  } else {
    const trial = fly(plan, receiverStart(plan, 0, worked.rcvKias), { kias: worked.rcvKias, until: a.rvSec, dt: SOLVE_STEP_SEC });
    const along = trial.p.s.x * plan.u.x + trial.p.s.y * plan.u.y;
    plan.startAlong = -plan.trailFt - along;
    worked.startNm = nm(-plan.startAlong);
    const madeKias = airData(trial.p.s, plan.sigmaAt).kias;
    if (a.rvSec > 20 && worked.rcvKias - madeKias > 5) {
      notes.push(`The receiver can't make ${Math.round(worked.rcvKias)} KIAS at ${ftWords(plan.Hr)} on the T-6A set at full power: it flies at about ${Math.round(madeKias)} KIAS, so it rolls out with less overtake than the set ${a.overtakeKt} kt. A lower overtake or a slower tanker would work.`);
    }
  }
  worked.rvSec = rvSec;

  // The tanker's turn (RS-16): at the rendezvous time less its turn's time, or when the receiver comes within a hand-set range.
  plan.tTurn = rvSec - worked.turnSec;
  if (a.byHand.turnRangeNm !== null) {
    const pre = fly(plan, startPilot(), { kias: plan.rcvKias, until: rvSec + 900, dt: SOLVE_STEP_SEC, every: 0.5 });
    const want = a.byHand.turnRangeNm * FT_PER_NM;
    const rangeOf = (q) => Math.hypot(q.x - plan.turnStart.x, q.y - plan.turnStart.y);
    const hit = pre.pts.find((q, i) => i > 0 && rangeOf(q) <= want && rangeOf(q) < rangeOf(pre.pts[i - 1]));
    if (rangeOf(pre.pts[0]) <= want) {
      plan.tTurn = 0;
      notes.push(`The receiver starts inside the hand-set turn range (${a.byHand.turnRangeNm.toFixed(1)} NM): the tanker turns at once.`);
    } else if (hit) {
      plan.tTurn = hit.t;
    } else {
      notes.push(`The receiver never came within the hand-set turn range (${a.byHand.turnRangeNm.toFixed(1)} NM): the tanker turned at the worked-out moment.`);
    }
  }
  plan.tRollOut = plan.tTurn + worked.turnSec;
  plan.schedule = tankerSchedule(plan, plan.tRollOut);

  const flight = fly(plan, startPilot(), { kias: plan.rcvKias, tRollOut: plan.tRollOut, record: true });
  flight.events.turn = plan.tTurn;
  // The worked-out turn range is the range over the ground when the tanker turns, as the plan flew it.
  const iTurn = Math.round(Math.max(0, plan.tTurn) / PASS_STEP_SEC);
  const tl = flight.timeline;
  if (iTurn < tl.t.length) worked.turnRangeNm = nm(Math.hypot(tl.x[iTurn] - plan.turnStart.x, tl.y[iTurn] - plan.turnStart.y));
  const result = resultOf(plan, flight);
  const exit = { sec: plan.tTurn, byHand: a.byHand.turnRangeNm !== null, startNm: worked.startNm, turnRangeNm: worked.turnRangeNm };
  return { plan, flight, tanker: flight.tanker, exit, result, fall: null, computeMs: (globalThis.performance?.now?.() ?? Date.now()) - started };
}

const ftWords = (n) => `${(Math.round(n / 100) * 100).toLocaleString('en-CA')} ft`;

/** The result card's numbers, flags and words (spec "The result card"; RS-6). */
function resultOf(plan, flight) {
  const tl = flight.timeline;
  const tt = flight.tanker;
  const ac = plan.ac;
  const ev = flight.events;
  const n = tl.t.length;
  const at = (i) => ({ x: tl.x[i], y: tl.y[i], z: tl.z[i] });
  const tkAt = (i) => ({ x: tt.x[i], y: tt.y[i], z: tt.z[i] });
  let peakG = 0;
  let lowestKias = Infinity;
  let overVmo = -Infinity;
  let tankerBank = 0;
  let tankerLowest = Infinity;
  for (let i = 0; i < n; i++) {
    peakG = Math.max(peakG, tl.g[i]);
    if (tl.phase[i] !== AAR_PHASE.GROUND) lowestKias = Math.min(lowestKias, tl.kias[i]); // airborne only (RS-19)
    overVmo = Math.max(overVmo, tl.kias[i] - ac.maxKias(tl.z[i]));
    tankerBank = Math.max(tankerBank, Math.abs(tt.bank[i]));
    tankerLowest = Math.min(tankerLowest, tt.z[i]);
  }
  // At the roll-out: the trail along the tanker's track, the offset across it, the height below, and the overtake (closure
  // on the tanker over the second before).
  const iRo = ev.rollOut !== undefined ? Math.round(ev.rollOut / PASS_STEP_SEC) : null;
  const per = Math.round(1 / PASS_STEP_SEC); // a second's steps
  let rollOut = null;
  if (iRo !== null && iRo < n) {
    const tk = tankerAt(plan, tl.t[iRo]);
    const R = at(iRo);
    const dx = tk.x - R.x, dy = tk.y - R.y;
    const i0 = Math.max(0, iRo - per);
    rollOut = {
      trailFt: dx * tk.dir.x + dy * tk.dir.y,
      acrossFt: -(dx * -tk.dir.y + dy * tk.dir.x), // the receiver right (+) or left (−) of the tanker's track
      belowFt: tk.z - R.z,
      overtakeKt: closureKt(at(i0), tkAt(i0), R, tkAt(iRo), tl.t[iRo] - tl.t[i0]),
      kias: tl.kias[iRo],
    };
  }
  // The join: the closure on the pre-contact point (each second), the nearest the receiver came to the tanker's wing line.
  let peakClosure = -Infinity;
  let nearClosure = -Infinity;
  let wingLine = -Infinity; // + ahead of the wing line
  if (iRo !== null) {
    let prev = null;
    for (let i = iRo; i < n; i++) {
      const tk = tankerAt(plan, tl.t[i]);
      const { pre, f } = drogueAt(plan, tk);
      wingLine = Math.max(wingLine, (tl.x[i] - tk.x) * f.x + (tl.y[i] - tk.y) * f.y);
      if ((i - iRo) % per !== 0) continue;
      if (prev) {
        const c = closureKt(prev.R, prev.pre, at(i), pre, tl.t[i] - prev.t);
        peakClosure = Math.max(peakClosure, c);
        if (Math.hypot(tl.x[i] - pre.x, tl.y[i] - pre.y, tl.z[i] - pre.z) <= AAR_REFERENCES.nearFt) nearClosure = Math.max(nearClosure, c);
      }
      prev = { R: at(i), pre, t: tl.t[i] };
    }
  }
  const last = n - 1;
  const tkEnd = tankerAt(plan, tl.t[last]);
  const { pre: preEnd } = drogueAt(plan, tkEnd);
  const dEnd = { x: tl.x[last] - preEnd.x, y: tl.y[last] - preEnd.y };
  const endFromPre = {
    behindFt: -(dEnd.x * tkEnd.dir.x + dEnd.y * tkEnd.dir.y),
    acrossFt: dEnd.x * tkEnd.dir.y - dEnd.y * tkEnd.dir.x,
    belowFt: preEnd.z - tl.z[last],
  };

  const flags = [];
  const flag = (id, words, over) => flags.push({ id, words, over });
  flag('closure', `Peak closure on the join against ${AAR_REFERENCES.closureKt} kt (an estimate)`, peakClosure > AAR_REFERENCES.closureKt);
  flag('nearClosure', `Closure inside ${AAR_REFERENCES.nearFt} ft of pre-contact against ${AAR_REFERENCES.nearClosureKt} kt (an estimate)`, nearClosure > AAR_REFERENCES.nearClosureKt);
  // The turn inbound is flown at the set bank in the air mass (RS-21); the orbit keeps its ground shape, so this reads its turns.
  flag('tankerBank', `The tanker's steepest bank (its orbit keeps its ground shape) against its set ${plan.aar.bankDeg}°`, Math.round(tankerBank) > plan.aar.bankDeg);
  flag('wingLine', 'The receiver ahead of the tanker\'s wing line after the roll-out', wingLine > 0);
  flag('peakG', `The receiver's peak G against the ${ac.gLimit} G limit`, peakG > ac.gLimit);
  flag('vmo', 'The receiver\'s fastest against VMO', overVmo > 0);
  flag('slow', `The receiver's lowest airspeed against the stick shaker (${Math.round(ac.shakerKias)} KIAS)`, lowestKias < ac.shakerKias);

  const notes = [...plan.notes];
  if (flight.ground) notes.push('The receiver hit the ground: the refuelling height is too low over this ground. A higher refuelling height would work.');
  if (ev.stable === undefined && !flight.ground) {
    notes.push(`The receiver did not stabilise in pre-contact within ${Math.round(JOIN.maxSec / 60)} minutes of the roll-out: it ended ${ftWords(Math.abs(endFromPre.behindFt))} ${endFromPre.behindFt >= 0 ? 'behind' : 'past'} the point.`);
  }
  if (plan.tRollOut !== null && tl.t[last] > plan.tRollOut + timeLegB(plan)) notes.push('The join ran past the end of the anchor\'s refuelling leg: in this picture the tanker flies on straight. A longer leg would keep it on the anchor.');
  const lateSec = ev.rollOut !== undefined ? ev.rollOut - plan.worked.rvSec : null;
  // RS-19: the tanker's laps in its orbit before its turn inbound; RS-20: the offset as flown and its side.
  const orbitLaps = plan.schedule ? Math.max(0, plan.tTurn) / plan.schedule.lapSec : null;
  if (plan.takeoff && ev.takeoff === undefined) notes.push('The receiver never left the runway.');
  if (plan.takeoff && ev.ip === undefined && !flight.ground) notes.push('The receiver never passed the IP.');
  return {
    rollOut, plannedTrailFt: plan.trailFt, lateSec,
    peakClosureKt: Number.isFinite(peakClosure) ? peakClosure : null,
    nearClosureKt: Number.isFinite(nearClosure) ? nearClosure : null,
    wingLineFt: Number.isFinite(wingLine) ? wingLine : null,
    toPreContactSec: ev.preContact !== undefined && ev.rollOut !== undefined ? ev.preContact - ev.rollOut : null,
    stableSec: ev.stable !== undefined && ev.rollOut !== undefined ? ev.stable - ev.rollOut : null,
    endFromPre, tankerBankDeg: tankerBank, tankerLowestFt: tankerLowest,
    takeoff: plan.takeoff ? { runway: plan.runway.name, liftOffSec: ev.takeoff ?? null, ipSec: ev.ip ?? null, ipPlanSec: plan.tIpPlan } : null,
    orbitLaps, offsetFt: plan.offsetFt, offsetSide: plan.aar.dir < 0 ? 'left' : 'right', offsetByHand: plan.aar.byHand.offsetNm !== null,
    peakG, lowestKias, overVmo, flags, notes,
    worked: { ...plan.worked, rcvKiasFlown: plan.rcvKias, rcvByHand: plan.aar.byHand.rcvKias !== null, turnByHand: plan.aar.byHand.turnRangeNm !== null, tTurn: plan.tTurn, tRollOut: plan.tRollOut },
  };
}

/** The tanker's time along the refuelling leg, s. */
const timeLegB = (plan) => plan.legFt / plan.tankerGs;

/**
 * What to draw (plan lines over the ground, { x, y, z }): the anchor's racetrack and the turn inbound at the tanker's
 * height, the receiver's track from the IP (or its airborne start) to the roll-out point at its height, the tanker's turn
 * point and its roll-out point, the offset (RS-20: square to the track from the tanker's inbound track to the receiver's,
 * at the turn point), and with the take-off (RS-19) CYMJ's runway and the IP.
 */
export function refuelOutline(plan) {
  if (!plan || plan.kind !== 'aar') return null;
  const anchor = samplePath(plan.lap, 300).map((q) => ({ ...q, z: plan.H }));
  const inbound = [];
  for (let k = 0; k <= 48; k++) {
    const q = plan.airTurn((plan.turnSec * k) / 48); // the turn inbound over the ground, drift and all (RS-21)
    inbound.push({ x: plan.turnStart.x + q.dx, y: plan.turnStart.y + q.dy, z: plan.H });
  }
  const start = plan.takeoff ? -plan.ipFt : plan.startAlong ?? -(plan.trailFt + plan.tankerGs * plan.aar.rvSec);
  const track = [{ x: plan.u.x * start, y: plan.u.y * start, z: plan.Hr }, { x: 0, y: 0, z: plan.Hr }];
  const ts = plan.turnStart;
  const along = ts.x * plan.u.x + ts.y * plan.u.y;
  const foot = { x: plan.u.x * along, y: plan.u.y * along }; // the turn point's foot on the receiver's track
  return {
    anchor, inbound, track, turnStart: { ...ts, z: plan.H }, rollOut: { ...plan.rollOutPt, z: plan.H }, start: track[0],
    offset: { a: { ...ts, z: plan.H }, b: { ...foot, z: plan.H }, ft: plan.offsetFt, side: plan.aar.dir < 0 ? 'left' : 'right' },
    runway: plan.runway ? { a: { ...plan.runway.th, z: plan.runway.z }, b: { ...plan.runway.end, z: plan.runway.z }, name: plan.runway.name } : null,
    ip: plan.takeoff ? { ...plan.ip, z: plan.Hr } : null,
  };
}

/** The turn range as drawn (RS-20): the tanker's turn point, the receiver where it was then, and the range (ft); null before a flight. */
export function turnRangeLine(pass) {
  const plan = pass?.plan;
  if (plan?.kind !== 'aar' || !pass.flight?.timeline) return null;
  const tl = pass.flight.timeline;
  const i = Math.round(Math.max(0, plan.tTurn) / PASS_STEP_SEC);
  if (i >= tl.t.length) return null;
  const rcv = { x: tl.x[i], y: tl.y[i], z: tl.z[i] };
  return { centre: { ...plan.turnStart, z: plan.H }, rcv, ft: Math.hypot(rcv.x - plan.turnStart.x, rcv.y - plan.turnStart.y), t: plan.tTurn };
}

