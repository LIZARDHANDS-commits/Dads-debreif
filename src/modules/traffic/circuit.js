// The Moose Jaw circuit (Pattern 1), built by flying it: a simulated pilot flies
// the T-6 round the pattern in today's wind, once, and the path it leaves is the
// path every circuit aircraft follows (Traffic spec items 2, 7 and 10-13a;
// refactor PR 2). Because the path is flown rather than drawn, every join is
// smooth: each piece starts with the place, heading, bank and speed the last
// one ended with, and the bank rolls in and out at the roll rate.
//
// What is fixed and what moves (Patrick, 4 Oct 08:11Z, 08:15Z and 08:27Z):
//   - the downwind, base, 45° leg and initial are fixed lines on the ground
//     (route points 4-9 and the runway centreline);
//   - the climb-out: full power, 5-7° nose up accelerating to 180 KIAS, climb
//     at 180 to pattern height, level, accelerate to 220, set power; the left
//     turn onto crosswind starts once 220 KIAS is reached, so it comes earlier
//     over the ground into a headwind;
//   - the break: 60° bank, rolled out when the track points at the perch;
//   - the perch: placed so the final turn rolls out at the window, so it moves
//     with the wind (earlier in a strong headwind, tighter with wind from the
//     north, wider with wind from the south);
//   - the break point: see breakPointAlongFt.
//
// Headings and tracks are compass degrees true; positions are map feet, x east
// and y north; route speeds are KIAS. Nothing here reads the page or a setting.
import { ktToFtps, KT_TO_FTPS, G_FTPS2 } from '../../core/units.js';
import { wrapDeg180, compassDegFromVector, wrapDeg360 } from '../../core/angles.js';
import { turnRateFromBankRadPerSec, turnRadiusFromBankFt, gFromBankDeg, easeRoll } from '../../core/flight-math.js';
import { iasToTasKt, tasToIasKt, excessThrustPerWeight, dragPerWeight, pitchDegFromClimb } from '../../core/t6-performance.js';
import { windTriangle, windVectorFtps } from '../../core/wind.js';
import { legOffsetsFt } from '../../core/geo.js';
import { PATTERN_ALT_FT, THRESHOLD_DATA_ELEV_FT } from './airfield.js';

/**
 * How fast the wings roll: at most 45°/s, building up and dying away at 90°/s²
 * (a roll from level to 60° takes about 2 s). Both are estimates: no manual
 * page gives a normal roll rate (Traffic spec item 5).
 */
export const ROLL = Object.freeze({ maxRateDps: 45, maxAccelDps2: 90 });

/** The circuit's flying numbers, each with its source. */
export const CIRCUIT = Object.freeze({
  /** Pattern turns: 60° bank (SMM 4.14 para 33); the break: 60° and 2 G (SMM 4.17 para 39). */
  patternBankDeg: 60,
  /** Final turn: up to 45° (SMM 4.19 paras 43-48); 35° nominal (D391). */
  finalTurnBankDeg: 35,
  /** Climb-out: 5-7° nose up while accelerating (SMM 3.11; Patrick 08:15Z); 6° is the middle. */
  takeoffPitchDeg: 6,
  /** Normal climb speed (SMM 3.14 para 35; Patrick 08:15Z). */
  climbKias: 180,
  /** Pattern speed (SMM 4.14 para 32). */
  patternKias: 220,
  /** Ideal downwind and final turn speed (SMM 4.17 para 41, 4.19 para 43). */
  finalTurnKias: 120,
  /** Over the threshold (SMM 4.1 para 1; D110). */
  thresholdKias: 100,
  /** The break starts about 2,000 ft past the threshold with a 10 kt headwind (SMM 4.17 para 39). */
  breakPastThresholdFt: 2000,
  breakReferenceHeadwindKt: 10,
});

/**
 * How hard the simulated pilot banks for a heading error: 3° of bank per degree,
 * so a full 60° bank holds until 20° to go and then eases out. An estimate,
 * set for a smooth rollout with no overshoot.
 */
const BANK_PER_DEG = 3;
/** Track correction per foot off a line, near the line (0.05°/ft: 5° at 100 ft). An estimate. */
const TRACK_PER_FT = 0.05;
/** Height capture: the climb rate is the height to go over this time, so the level-off is smooth. An estimate. */
const LEVEL_OFF_SEC = 6;
/** Radius for the line-holding law once on a line: small corrections only. An estimate. */
const HOLD_RADIUS_FT = 3000;
/** The simulated pilot's time step, seconds. */
export const PILOT_DT = 0.1;
const DT = PILOT_DT;
const RECORD_EVERY = 4; // a path point every 0.4 s (about 90 ft at 220 kt)
const MAX_STEPS = 20000;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * 0 to 1 with a rate that builds up over the first fifth, holds, and dies away
 * over the last fifth (a trapezoid), so a descent starts and ends gently with a
 * peak rate only 1.25 times the average.
 */
function easedFraction(u, a = 0.2) {
  const peak = 1 / (1 - a);
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  if (u < a) return peak * u * u / (2 * a);
  if (u > 1 - a) return 1 - peak * (1 - u) * (1 - u) / (2 * a);
  return peak * (u - a / 2);
}
const acosDeg = (c) => Math.acos(clamp(c, -1, 1)) * 180 / Math.PI;
const sinDeg = (d) => Math.sin(d * Math.PI / 180);

/**
 * Lead on the rollout, seconds: the pilot judges the heading error as it will be
 * this long ahead at today's turn rate, so the roll-out starts in time and the
 * heading doesn't overshoot. An estimate.
 */
const ROLLOUT_LEAD_SEC = 1.0;

/**
 * The bank for a heading error: positive right. `dir` 'left' makes a big error a
 * left turn. `s` is the pilot's state (heading, bank, KIAS, height).
 */
export function bankFor(wantedHdg, s, bankMax, dir = null) {
  let err = wrapDeg180(wantedHdg - s.hdg);
  if (dir === 'left' && err > 30) err -= 360;
  if (dir === 'right' && err < -30) err += 360;
  const v = ktToFtps(iasToTasKt(s.ias, s.alt));
  const rateDeg = turnRateFromBankRadPerSec(Math.max(v, 1), s.bank) * 180 / Math.PI;
  return clamp(BANK_PER_DEG * (err - rateDeg * ROLLOUT_LEAD_SEC), -bankMax, bankMax);
}

/**
 * The track to fly to join and hold a line: off the line, an intercept that
 * follows a circle of radius `radiusFt` onto it (so a turn onto the line is a
 * steady bank that rolls out on it); close in, a small proportional correction.
 */
function trackForLine(line, p, radiusFt, maxInterceptDeg = 90) {
  const { crossFt } = legOffsetsFt(line.a, line.b, p);
  const x = Math.abs(crossFt);
  const theta = Math.min(maxInterceptDeg, acosDeg(1 - x / radiusFt), TRACK_PER_FT * x);
  return wrapDeg360(line.trackDeg + (crossFt > 0 ? -theta : theta));
}

const lineOf = (a, b) => ({ a, b, trackDeg: compassDegFromVector(b.x - a.x, b.y - a.y) });

/** Seconds the wings take to roll into the turn, allowed for in the lead (about 1.8 s to 60°, ROLL). */
const ROLL_IN_SEC = 1.8;

/**
 * Whether to start the turn onto a new line now: when the line is R(1 − cos Δψ)
 * away (a steady turn of radius R rolls out on it) plus the ground covered
 * toward it while the wings roll in, and the aircraft is closing on it.
 */
function readyToTurnOnto(line, s, trackDeg, radiusFt, groundSpeedFtps, lineGroundSpeedFtps = groundSpeedFtps) {
  const { crossFt } = legOffsetsFt(line.a, line.b, s);
  const dpsi = Math.abs(wrapDeg180(line.trackDeg - trackDeg));
  // Over the ground the turn is wider downwind and tighter into wind: scale the
  // radius by the mean ground speed over true airspeed, squared.
  const tas = ktToFtps(iasToTasKt(s.ias, s.alt));
  radiusFt *= ((groundSpeedFtps + lineGroundSpeedFtps) / 2 / tas) ** 2;
  const lead = radiusFt * (1 - Math.cos(dpsi * Math.PI / 180)) + groundSpeedFtps * Math.sin(dpsi * Math.PI / 180) * ROLL_IN_SEC;
  // Closing: the track has a component toward the line.
  const toward = crossFt > 0 ? -1 : 1;
  const closing = toward * sinDeg(wrapDeg180(trackDeg - line.trackDeg)) > 0;
  return closing && Math.abs(crossFt) <= lead + 1;
}

/**
 * A simulated pilot: flies the T-6 in the air mass with the wind adding to its
 * ground velocity, and records the path. `step` takes the wanted bank and the
 * climb rate and acceleration (true airspeed, ft/s per s) for this moment.
 * Fields in `s.rec` go into every recorded point (the PFL's decision and
 * configuration, pfl.js).
 */
export function makePilot(start, wind) {
  const w = windVectorFtps(wind.windFromDeg, wind.windKt);
  const s = { ...start, bank: 0, rollRate: 0, k: 0, src: start.src ?? 0, phase: start.phase ?? 'initial', tag: undefined };
  const points = [];
  const tasKt = () => iasToTasKt(s.ias, s.alt);
  const record = (extra = {}) => {
    points.push({
      x: s.x, y: s.y, alt: Math.round(s.alt * 10) / 10, kt: Math.round(s.ias * 10) / 10,
      g: Math.round(gFromBankDeg(s.bank) * 100) / 100, src: s.src, phase: s.phase, headingDeg: s.hdg, tag: s.tag, ...s.rec, ...extra,
    });
  };
  const ground = () => {
    const v = ktToFtps(tasKt());
    const h = s.hdg * Math.PI / 180;
    return { x: v * Math.sin(h) + w.x, y: v * Math.cos(h) + w.y };
  };
  const trackDeg = () => { const g = ground(); return compassDegFromVector(g.x, g.y); };
  const groundSpeedFtps = () => { const g = ground(); return Math.hypot(g.x, g.y); };
  const headingFor = (track) => {
    const wt = windTriangle(track, tasKt(), wind.windFromDeg, wind.windKt);
    return wt.canHoldTrack ? wt.headingDeg : track;
  };
  function step(targetBank, climbFtps, accelFtps2) {
    const roll = easeRoll(s.bank, s.rollRate, targetBank, DT, ROLL);
    s.bank = roll.bankDeg;
    s.rollRate = roll.rollRateDps;
    const v = ktToFtps(tasKt());
    s.hdg = wrapDeg360(s.hdg + turnRateFromBankRadPerSec(Math.max(v, 1), s.bank) * 180 / Math.PI * DT);
    const g = ground();
    s.x += g.x * DT;
    s.y += g.y * DT;
    s.alt += climbFtps * DT;
    const newTas = Math.max(ktToFtps(40), v + accelFtps2 * DT);
    s.ias = tasToIasKt(newTas / KT_TO_FTPS, s.alt);
    s.k++;
    if (s.k % RECORD_EVERY === 0) record();
  }
  /** Marks a new piece of the path (a new route point or phase), with a point exactly where it starts. */
  function mark(fields) {
    Object.assign(s, fields);
    record();
  }
  return { s, points, step, mark, record, tasKt, trackDeg, groundSpeedFtps, headingFor, wind: w };
}

/** Turn radius at a bank and true airspeed: the radius a steady turn flies through the air. */
function leadRadiusFt(tasKt, bankDeg) {
  return turnRadiusFromBankFt(ktToFtps(tasKt), bankDeg);
}

/** Full-power level acceleration and climb, as true airspeed rate (ft/s²) for a climb rate, at this G. */
function accelFor(ias, alt, g, climbFtps) {
  const tas = ktToFtps(iasToTasKt(ias, alt));
  return G_FTPS2 * (excessThrustPerWeight(ias, alt, g) - climbFtps / tas);
}

/** Idle deceleration (drag only, ft/s²): includes induced drag at G, but no prop drag at idle , so it underestimates the drag (an estimate). */
function idleDecel(ias, alt, g) {
  return -G_FTPS2 * dragPerWeight(ias, alt, g);
}

/**
 * Speed in the break, KIAS, at a fraction of the 180° turn: today's curve,
 * 220 × e^(−0.452 u), about 140 at the end (Traffic spec 3.7, "Break deceleration
 * (preserved)"). Patrick: the rollout downwind is about 140 (08:43Z, 4 Oct).
 * Idle drag alone rolls out near 160 KIAS because the drag model has no prop
 * drag at idle, so it does not replace this curve yet.
 */
function breakKias(turnedDeg) {
  return CIRCUIT.patternKias * Math.exp(-0.452 * clamp(turnedDeg / 180, 0, 1));
}

/** Seconds the break's 180° turn takes in calm air, flown the same way as in the circuit. */
let breakSecCache = null;
export function breakTurnSec() {
  if (breakSecCache !== null) return breakSecCache;
  let hdg = 0, turned = 0, t = 0;
  while (turned < 180 && t < 120) {
    const ias = breakKias(turned);
    const v = ktToFtps(iasToTasKt(ias, PATTERN_ALT_FT));
    const d = turnRateFromBankRadPerSec(v, CIRCUIT.patternBankDeg) * 180 / Math.PI * DT;
    turned += d; hdg += d; t += DT;
  }
  breakSecCache = t;
  return t;
}

/**
 * Where the break starts, in feet past the threshold along the runway: 2,000 ft
 * with a 10 kt headwind (SMM 4.17 para 39), later with more headwind and earlier
 * with less (SMM 4.18 para 42). Patrick chose "Same rollout spot" (4 Oct 08:48Z): it
 * moves by (headwind − 10 kt) × the time the break takes, so the rollout lands
 * on the same ground point in any headwind.
 */
export function breakPointAlongFt(headwindKt) {
  return CIRCUIT.breakPastThresholdFt + (headwindKt - CIRCUIT.breakReferenceHeadwindKt) * KT_TO_FTPS * breakTurnSec();
}

/**
 * Builds Pattern 1's path for a wind. `points` are the route's points (0 the
 * threshold, 1 the departure end, 4-9 the fixed legs, 12 the window). Returns
 * { track, perch } where track is [{ x, y, alt, kt, g, src, phase, headingDeg, tag }].
 */
export function buildCircuit(points, windFromDeg = 360, windKt = 0) {
  const wind = { windFromDeg, windKt };
  const th = points[0], dep = points[1], win = points[12];
  const centre = lineOf(th, dep);
  const rwyTrack = centre.trackDeg;
  const headwindKt = windKt * Math.cos((windFromDeg - rwyTrack) * Math.PI / 180);
  const breakAlong = breakPointAlongFt(headwindKt);

  // The perch: start from the route's perch, fly the break, downwind and final
  // turn, and move the perch by the miss at the window until the rollout is there.
  let perch = { x: points[11].x, y: points[11].y };
  let inner = null;
  for (let i = 0; i < 6; i++) {
    inner = flyInner(points, centre, breakAlong, perch, wind);
    const miss = { x: win.x - inner.rollout.x, y: win.y - inner.rollout.y };
    if (Math.hypot(miss.x, miss.y) < 5) break;
    perch = { x: perch.x + miss.x, y: perch.y + miss.y };
  }
  const outer = flyOuter(points, centre, breakAlong, wind);
  // The inner part starts where the outer one reached the break, so join them there.
  return { track: [...outer.track, ...inner.track], perch, breakAlongFt: breakAlong };
}

/** From the threshold round the outer pattern to the break point. */
function flyOuter(points, centre, breakAlong, wind) {
  const th = points[0];
  const rwyTrack = centre.trackDeg;
  const pilot = makePilot({ x: th.x, y: th.y, alt: THRESHOLD_DATA_ELEV_FT, ias: CIRCUIT.thresholdKias, hdg: 0, src: 0, phase: 'initial' }, wind);
  const { s } = pilot;
  s.hdg = pilot.headingFor(rwyTrack);
  pilot.record();
  const runwayLen = Math.hypot(points[1].x - th.x, points[1].y - th.y);
  const crosswindTrack = wrapDeg360(rwyTrack - 90);
  const downwind = lineOf(points[5], points[6]);
  const base = lineOf(points[6], points[7]);
  const leg45 = lineOf(points[7], points[8]);
  let stage = 'climbOut', capturing = false;
  for (let n = 0; n < MAX_STEPS; n++) {
    const g = gFromBankDeg(s.bank);
    const tasKt = pilot.tasKt();
    const R = leadRadiusFt(tasKt, CIRCUIT.patternBankDeg);
    const gs = pilot.groundSpeedFtps();
    const gsOn = (line) => ktToFtps(Math.max(10, windTriangle(line.trackDeg, tasKt, wind.windFromDeg, wind.windKt).groundSpeedKt));
    // Turning onto a new line: a steady pattern-bank turn to its track, then hold the line.
    const onto = (line) => {
      if (capturing && Math.abs(wrapDeg180(line.trackDeg - pilot.trackDeg())) < 15) capturing = false;
      return capturing
        ? bankFor(pilot.headingFor(line.trackDeg), s, CIRCUIT.patternBankDeg, 'left')
        : bankFor(pilot.headingFor(trackForLine(line, s, HOLD_RADIUS_FT)), s, 30);
    };
    let climb = 0, accel = 0, bank = 0;

    // Speed and height: the climb-out schedule, then 220 KIAS level.
    if (s.ias < CIRCUIT.climbKias - 0.01 && stage === 'climbOut' && s.src < 2) {
      const aoa = pitchDegFromClimb(0, ktToFtps(tasKt), s.ias, g);
      const gamma = Math.max(0, CIRCUIT.takeoffPitchDeg - aoa);
      climb = ktToFtps(tasKt) * sinDeg(gamma);
      accel = accelFor(s.ias, s.alt, g, climb);
    } else if (s.ias < CIRCUIT.patternKias - 0.01) {
      if (s.src < 2) pilot.mark({ src: 2 });
      const maxClimb = Math.max(0, excessThrustPerWeight(s.ias, s.alt, g)) * ktToFtps(tasKt);
      climb = Math.min(maxClimb, Math.max(0, (PATTERN_ALT_FT - s.alt) / LEVEL_OFF_SEC));
      accel = accelFor(s.ias, s.alt, g, climb);
      if (s.ias >= CIRCUIT.climbKias && climb >= maxClimb - 1e-6) accel = 0; // hold 180 while it climbs
    } else {
      climb = Math.max(0, (PATTERN_ALT_FT - s.alt) / LEVEL_OFF_SEC);
      accel = 0; // power set for 220
    }
    if (s.src < 1 && legOffsetsFt(th, points[1], s).alongFt >= runwayLen) pilot.mark({ src: 1 });

    // Where to point.
    if (stage === 'climbOut') {
      bank = bankFor(pilot.headingFor(trackForLine(centre, s, HOLD_RADIUS_FT)), s, 30);
      if (s.ias >= CIRCUIT.patternKias - 0.5 && s.alt >= PATTERN_ALT_FT - 50) { stage = 'crosswindTurn'; pilot.mark({ src: 3 }); }
    } else if (stage === 'crosswindTurn' || stage === 'crosswind') {
      bank = bankFor(pilot.headingFor(crosswindTrack), s, CIRCUIT.patternBankDeg, 'left');
      if (stage === 'crosswindTurn' && Math.abs(bank) < 3 && Math.abs(s.bank) < 3) { stage = 'crosswind'; }
      if (readyToTurnOnto(downwind, s, pilot.trackDeg(), R, gs, gsOn(downwind))) { stage = 'downwind'; capturing = true; pilot.mark({ src: 4 }); }
    } else if (stage === 'downwind') {
      bank = onto(downwind);
      if (s.src < 5 && legOffsetsFt(downwind.a, downwind.b, s).alongFt >= 0) pilot.mark({ src: 5 });
      if (readyToTurnOnto(base, s, pilot.trackDeg(), R, gs, gsOn(base))) { stage = 'base'; capturing = true; pilot.mark({ src: 6 }); }
    } else if (stage === 'base') {
      bank = onto(base);
      if (readyToTurnOnto(leg45, s, pilot.trackDeg(), R, gs, gsOn(leg45))) { stage = 'leg45'; capturing = true; pilot.mark({ src: 7 }); }
    } else if (stage === 'leg45') {
      bank = onto(leg45);
      if (readyToTurnOnto(centre, s, pilot.trackDeg(), R, gs, gsOn(centre))) { stage = 'initial'; capturing = true; pilot.mark({ src: 8 }); }
    } else if (stage === 'initial') {
      // The last turn onto initial: up to 60°, then hold the centreline (SMM 4.14 para 33: 45-60° as needed).
      bank = onto(centre);
      if (legOffsetsFt(th, points[1], s).alongFt >= breakAlong) break;
    }
    pilot.step(bank, climb, accel);
  }
  return { track: pilot.points, end: { ...s } };
}

/**
 * The break, downwind and final turn from the break point, aiming at `perch`;
 * then the final approach to the threshold. Returns the path and where the
 * final turn rolled out.
 */
function flyInner(points, centre, breakAlong, perch, wind) {
  const th = points[0];
  const rwyTrack = centre.trackDeg;
  const along = breakAlong;
  const ux = (points[1].x - th.x), uy = (points[1].y - th.y), len = Math.hypot(ux, uy);
  const start = { x: th.x + ux / len * along, y: th.y + uy / len * along };
  const pilot = makePilot({ x: start.x, y: start.y, alt: PATTERN_ALT_FT, ias: CIRCUIT.patternKias, hdg: 0, src: 9, phase: 'break' }, wind);
  const { s } = pilot;
  s.hdg = pilot.headingFor(rwyTrack);
  s.tag = 'break';
  pilot.record();
  let stage = 'break', turned = 0, ftTotal = null, ftStartHdg = null, rollout = null, lastClimb = 0;
  const glideStart = { alt: null, dist: null };
  for (let n = 0; n < MAX_STEPS; n++) {
    const g = gFromBankDeg(s.bank);
    const hdgBefore = s.hdg;
    let bank = 0, climb = 0, accel = 0;
    if (stage === 'break') {
      const toPerch = compassDegFromVector(perch.x - s.x, perch.y - s.y);
      bank = bankFor(pilot.headingFor(toPerch), s, CIRCUIT.patternBankDeg, 'left');
      const tas = ktToFtps(pilot.tasKt());
      const wanted = ktToFtps(iasToTasKt(breakKias(turned), s.alt));
      accel = (wanted - tas) / DT;
      if (turned > 90 && Math.abs(bank) < 3 && Math.abs(s.bank) < 3) {
        stage = 'downwind';
        pilot.mark({ src: 10, phase: 'downwind', tag: 'break_rollout' });
        s.tag = 'downwind';
      }
    } else if (stage === 'downwind') {
      const toPerch = compassDegFromVector(perch.x - s.x, perch.y - s.y);
      bank = bankFor(pilot.headingFor(toPerch), s, 30);
      accel = s.ias > CIRCUIT.finalTurnKias ? Math.max(idleDecel(s.ias, s.alt, g), (ktToFtps(iasToTasKt(CIRCUIT.finalTurnKias, s.alt)) - ktToFtps(pilot.tasKt())) / DT) : 0;
      const ahead = (perch.x - s.x) * Math.sin(s.hdg * Math.PI / 180) + (perch.y - s.y) * Math.cos(s.hdg * Math.PI / 180);
      if (ahead <= 0) {
        stage = 'finalTurn';
        pilot.mark({ src: 11, phase: 'final_turn', tag: 'perch' });
        s.tag = 'final_turn';
        ftStartHdg = s.hdg;
        const finalHdg = pilot.headingFor(rwyTrack);
        ftTotal = ((s.hdg - finalHdg) % 360 + 360) % 360 || 360;
      }
    } else if (stage === 'finalTurn') {
      const finalHdg = pilot.headingFor(rwyTrack);
      bank = bankFor(finalHdg, s, CIRCUIT.finalTurnBankDeg, 'left');
      accel = s.ias > CIRCUIT.finalTurnKias ? Math.max(idleDecel(s.ias, s.alt, g), (ktToFtps(iasToTasKt(CIRCUIT.finalTurnKias, s.alt)) - ktToFtps(pilot.tasKt())) / DT) : 0;
      // Height: a smooth descent from pattern height to the window over the turn.
      const doneDeg = ((ftStartHdg - s.hdg) % 360 + 360) % 360;
      const u = clamp(doneDeg / ftTotal, 0, 1);
      const hNow = PATTERN_ALT_FT - (PATTERN_ALT_FT - points[12].alt) * easedFraction(u);
      climb = (hNow - s.alt) / DT;
      if (Math.abs(wrapDeg180(finalHdg - s.hdg)) < 0.5 && Math.abs(s.bank) < 2) {
        rollout = { x: s.x, y: s.y };
        stage = 'final';
        pilot.mark({ src: 12, phase: 'final', tag: 'window' });
        s.tag = 'final';
        s.src = 0;
        glideStart.alt = s.alt;
        glideStart.dist = Math.hypot(th.x - s.x, th.y - s.y);
      }
    } else if (stage === 'final') {
      const toGo = -legOffsetsFt(th, points[1], s).alongFt;
      bank = bankFor(pilot.headingFor(trackForLine(centre, s, 3000)), s, 15);
      const v = pilot.groundSpeedFtps();
      // Straight down to the threshold height, and from 120 to 100 KIAS, evenly by distance (as before).
      const f = clamp(1 - toGo / glideStart.dist, 0, 1);
      const glideRate = -((s.alt - THRESHOLD_DATA_ELEV_FT) / Math.max(toGo, 1)) * v;
      climb = lastClimb + (glideRate - lastClimb) * Math.min(1, DT / 1.5); // eases onto the glide path
      const wantKias = CIRCUIT.finalTurnKias - (CIRCUIT.finalTurnKias - CIRCUIT.thresholdKias) * f;
      accel = (ktToFtps(iasToTasKt(wantKias, s.alt)) - ktToFtps(pilot.tasKt())) / DT * 0.2;
      if (toGo <= v * DT) {
        pilot.points.push({ x: th.x, y: th.y, alt: THRESHOLD_DATA_ELEV_FT, kt: CIRCUIT.thresholdKias, g: 1, src: 0, phase: 'final', headingDeg: s.hdg, tag: 'threshold' });
        break;
      }
    }
    pilot.step(bank, climb, accel);
    lastClimb = climb;
    if (stage === 'break') turned += Math.abs(wrapDeg180(s.hdg - hdgBefore));
  }
  return { track: pilot.points, rollout: rollout ?? { x: s.x, y: s.y } };
}
