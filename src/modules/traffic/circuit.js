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
import { excessThrustPerWeight, dragPerWeight, attitudeDegFromClimb } from '../../core/t6-performance.js';
import { gateRoll } from './envelope.js';
import { iasToTasKt, tasToIasKt, heightFactor, temperatureKey } from './weather.js';
import { windTriangle, windVectorFtps } from '../../core/wind.js';
import { legOffsetsFt } from '../../core/geo.js';
import { PATTERN_ALT_FT, THRESHOLD_DATA_ELEV_FT, NUMBER_BASE_PAST_THRESHOLD_FT, FLARE_FROM_FT, TOUCHDOWN_PAST_NUMBERS_FT } from './airfield.js';

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
  /** Go-around: level at 2,500 ft until past the upwind end of the runway (Patrick, 4 Oct 09:14Z). */
  goAroundAltFt: 2500,
});

/**
 * After a go-around passes the upwind end it trades its extra speed for height,
 * slowing toward the 180 KIAS climb speed over about this time (Patrick, 4 Oct
 * 09:14Z: "trade that speed for altitude after it crosses the end"). An estimate.
 */
export const ZOOM_SEC = 10;

/**
 * How hard the simulated pilot banks for a heading error: 3° of bank per degree,
 * so a full 60° bank holds until 20° to go and then eases out. An estimate,
 * set for a smooth rollout with no overshoot.
 */
const BANK_PER_DEG = 3;
/** Track correction per foot off a line, near the line (0.05°/ft: 5° at 100 ft). An estimate. */
const TRACK_PER_FT = 0.05;
/** Height capture: the climb rate is the height to go over this time, so the level-off is smooth. An estimate. */
export const LEVEL_OFF_SEC = 6;

/** Steepest a move-over comes down to its level-off height, degrees: the straight-in's own glide path (an estimate). */
const MOVE_OVER_DESCENT_DEG = 3;
/** Radius for the line-holding law once on a line: small corrections only. An estimate. */
export const HOLD_RADIUS_FT = 3000;
/** The simulated pilot's time step, seconds. */
export const PILOT_DT = 0.1;
const DT = PILOT_DT;
const RECORD_EVERY = 4; // a path point every 0.4 s (about 90 ft at 220 kt)
const MAX_STEPS = 20000;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/** Sink rate at touchdown after the flare, ft/s (an estimate: about 120 ft/min, a firm but normal touchdown). */
const FLARE_TOUCH_SINK_FTPS = 2;

/**
 * The aim point: the base of the runway numbers, NUMBER_BASE_PAST_THRESHOLD_FT up the runway from the threshold
 * point `th` toward `dep`, at the threshold's height (Patrick, 6 Oct 06:33Z: "three degree goes to the base of the
 * numbers"; TR-93). The glide path ends here and the climb-out starts here.
 */
export function aimPointOf(th, dep, pastFt = NUMBER_BASE_PAST_THRESHOLD_FT) {
  const len = Math.max(1, Math.hypot(dep.x - th.x, dep.y - th.y));
  const k = pastFt / len;
  return { x: th.x + (dep.x - th.x) * k, y: th.y + (dep.y - th.y) * k };
}

/** Where the wheels touch: TOUCHDOWN_PAST_NUMBERS_FT past the aim point, after the flare (TR-96). The climb-out starts here. */
export const touchdownPointOf = (th, dep) => aimPointOf(th, dep, NUMBER_BASE_PAST_THRESHOLD_FT + TOUCHDOWN_PAST_NUMBERS_FT);

/**
 * 0 to 1 with a rate that builds up over the first share `a`, holds, and changes
 * over the last share `a` to `endRate` (the rate at 1, in the same units: 1 is the
 * average), so a descent starts gently and ends already at the rate it carries on
 * at. With `endRate` 0 it dies away, and the peak rate is only 1/(1 − a) of the average.
 */
function easedFraction(u, a = 0.2, endRate = 0) {
  const peak = (1 - a * endRate / 2) / (1 - a);
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  if (u < a) return peak * u * u / (2 * a);
  if (u <= 1 - a) return peak * (u - a / 2);
  const w = u - (1 - a);
  return peak * (1 - 1.5 * a) + peak * w - (peak - endRate) * w * w / (2 * a);
}
/** The perch search (buildCircuit): how many tries, the share of each miss it moves by, and its biggest move, ft. */
const PERCH_TRIES = 20;
const PERCH_STEP_SHARE = 0.6;
const PERCH_MOST_STEP_FT = 1500;
/** Share of the final turn spent easing into and out of the descent at each end (about 3-4 s each). */
const FINAL_TURN_EASE = 0.12;
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
export function trackForLine(line, p, radiusFt, maxInterceptDeg = 90) {
  const { crossFt } = legOffsetsFt(line.a, line.b, p);
  const x = Math.abs(crossFt);
  const theta = Math.min(maxInterceptDeg, acosDeg(1 - x / radiusFt), TRACK_PER_FT * x);
  return wrapDeg360(line.trackDeg + (crossFt > 0 ? -theta : theta));
}

export const lineOf = (a, b) => ({ a, b, trackDeg: compassDegFromVector(b.x - a.x, b.y - a.y) });

/** Seconds the wings take to roll into the turn, allowed for in the lead (about 1.8 s to 60°, ROLL). */
const ROLL_IN_SEC = 1.8;

/**
 * Whether to start the turn onto a new line now: when the line is R(1 − cos Δψ)
 * away (a steady turn of radius R rolls out on it) plus the ground covered
 * toward it while the wings roll in, and the aircraft is closing on it.
 */
export function readyToTurnOnto(line, s, trackDeg, radiusFt, groundSpeedFtps, lineGroundSpeedFtps = groundSpeedFtps) {
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

/** A planned turn onto a line ends once the track is within this of the line's and the wings are this level (estimates). */
const CAPTURE_DONE_DEG = 0.3;
const CAPTURE_LEVEL_DEG = 2;
/** Longest a planned turn is looked ahead, seconds. */
const CAPTURE_MOST_SEC = 60;

/** Heading change, degrees (signed as the bank), while the wings roll level from bank `bankDeg` and roll rate `rollRateDps`. */
const rollOutMemo = new Map();
function rollOutTurnDeg(bankDeg, rollRateDps, tasFtps) {
  // The same few states come back every step of a steady turn: kept, to the nearest 0.1° of bank, 1°/s and 1 ft/s.
  const key = `${Math.round(bankDeg * 10)}|${Math.round(rollRateDps)}|${Math.round(tasFtps)}`;
  const known = rollOutMemo.get(key);
  if (known !== undefined) return known;
  const turned = rollOutTurnDegFresh(bankDeg, rollRateDps, tasFtps);
  if (rollOutMemo.size > 20000) rollOutMemo.clear();
  rollOutMemo.set(key, turned);
  return turned;
}
function rollOutTurnDegFresh(bankDeg, rollRateDps, tasFtps) {
  let bank = bankDeg, rate = rollRateDps, turned = 0;
  for (let n = 0; n < 100 && (Math.abs(bank) > 0.05 || Math.abs(rate) > 0.5); n++) {
    const r = easeRoll(bank, rate, 0, DT, ROLL);
    turned += turnRateFromBankRadPerSec(Math.max(tasFtps, 1), (bank + r.bankDeg) / 2) * 180 / Math.PI * DT;
    bank = r.bankDeg;
    rate = r.rollRateDps;
  }
  return turned;
}

/**
 * The bank for a planned turn to `wantedHdg` (TR-95): the whole turn at `bankMax`, then the roll-out started just when
 * the heading still to go is what rolling level will turn, so the wings come level on the heading; once level, small
 * corrections as bankFor makes. `s.rollingOut` remembers that the roll-out has begun, so it is never rolled back in.
 */
export function plannedBank(wantedHdg, s, bankMax, dir = 'left') {
  let err = wrapDeg180(wantedHdg - s.hdg);
  if (dir === 'left' && err > 30) err -= 360;
  if (dir === 'right' && err < -30) err += 360;
  const tas = ktToFtps(iasToTasKt(s.ias, s.alt));
  if (!s.rollingOut && Math.abs(err) > 2) {
    // Rolling level from 60° turns some 10-15°: far from the heading there is nothing to work out yet.
    if (Math.abs(err) > 30) return Math.sign(err) * bankMax;
    // Plus half a step of today's turn, so the roll-out starts on whichever step is nearer the exact moment.
    const lead = rollOutTurnDeg(s.bank, s.rollRate, tas) + turnRateFromBankRadPerSec(Math.max(tas, 1), s.bank) * 180 / Math.PI * DT / 2;
    if (Math.sign(lead) === Math.sign(err) && Math.abs(err) <= Math.abs(lead)) s.rollingOut = true;
    else return Math.sign(err) * bankMax;
  }
  if (s.rollingOut && Math.abs(s.bank) > CAPTURE_LEVEL_DEG) return 0;
  s.rollingOut = true;
  return bankFor(wantedHdg, s, Math.min(bankMax, 15), dir);
}

/**
 * Plans a turn onto `line` (Patrick, 6 Oct 06:45Z, card "Plan the turns"; TR-95): flies the turn ahead of time from
 * the pilot's state `s` (place, heading, bank, roll rate, speed, height) in `wind`, rolling in at the roll rate to
 * `bankMax` toward the line's track and out again as bankFor does, and returns how far off the line it would roll out,
 * ft, signed as legOffsetsFt's crossFt (Infinity if it never settles). The circuit starts each turn when this crosses
 * zero, so the roll-out ends on the line on its track with no S-turn back.
 */
export function plannedTurnEndCrossFt(line, s, wind, bankMax, dir = 'left', straightFirst = 0) {
  // A light copy of the pilot: level, at today's true airspeed, no points recorded.
  const g = { x: s.x, y: s.y, hdg: s.hdg, bank: s.bank, rollRate: s.rollRate, ias: s.ias, alt: s.alt, rollingOut: false };
  const tasKt = iasToTasKt(s.ias, s.alt);
  const v = ktToFtps(tasKt);
  const w = windVectorFtps(wind.windFromDeg, wind.windKt);
  const wt = windTriangle(line.trackDeg, tasKt, wind.windFromDeg, wind.windKt);
  const wantHdg = wt.canHoldTrack ? wt.headingDeg : line.trackDeg;
  const steps = Math.round(CAPTURE_MOST_SEC / DT);
  for (let n = 0; n < steps; n++) {
    const bank = n < straightFirst ? s.bank : plannedBank(wantHdg, g, bankMax, dir);
    const roll = easeRoll(g.bank, g.rollRate, bank, DT, ROLL);
    g.bank = roll.bankDeg;
    g.rollRate = roll.rollRateDps;
    g.hdg = wrapDeg360(g.hdg + turnRateFromBankRadPerSec(Math.max(v, 1), g.bank) * 180 / Math.PI * DT);
    const h = g.hdg * Math.PI / 180;
    const gx = v * Math.sin(h) + w.x, gy = v * Math.cos(h) + w.y;
    g.x += gx * DT;
    g.y += gy * DT;
    if (n >= straightFirst && Math.abs(wrapDeg180(line.trackDeg - compassDegFromVector(gx, gy))) < CAPTURE_DONE_DEG && Math.abs(g.bank) < CAPTURE_LEVEL_DEG) {
      return legOffsetsFt(line.a, line.b, g).crossFt;
    }
  }
  return Infinity;
}

/** When each line's turn is next worth planning (timeToTurnOnto), by the pilot's step count. */
const planWaits = new WeakMap();
/** The longest wait between looks, steps (2 s): the closing speed changes while a turn onto the leg before it is still going. */
const PLAN_MOST_WAIT_STEPS = 20;

/**
 * Whether to start the planned turn onto `line` now: the aircraft is closing on it inside a generous look-ahead
 * (readyToTurnOnto's lead with some to spare, so the planning runs only near the turn), and the planned turn would roll out on the
 * line or past it.
 */
export function timeToTurnOnto(line, s, wind, bankMax, trackDeg, radiusFt, groundSpeedFtps, lineGroundSpeedFtps) {
  if (!readyToTurnOnto(line, s, trackDeg, radiusFt * 1.3, groundSpeedFtps * 1.5, lineGroundSpeedFtps * 1.5)) return false;
  const side = Math.sign(legOffsetsFt(line.a, line.b, s).crossFt || 1);
  // Far from the moment, the next look waits for about the steps it takes to close the gap (only the planning, not the flying).
  const wait = planWaits.get(line);
  if (wait && wait.k > s.k) return false;
  // The circuit's loop has set this step's bank already, so a turn chosen now starts on the next step.
  const endNow = plannedTurnEndCrossFt(line, s, wind, bankMax, 'left', 1);
  if (!Number.isFinite(endNow)) return false;
  if (endNow * side <= 0) return true;
  const closingPerStep = groundSpeedFtps * Math.abs(Math.sin(wrapDeg180(trackDeg - line.trackDeg) * Math.PI / 180)) * DT;
  const steps = closingPerStep > 1e-3 ? Math.min(PLAN_MOST_WAIT_STEPS, Math.floor(Math.abs(endNow) / closingPerStep) - 3) : 0;
  if (steps > 0) {
    planWaits.set(line, { k: s.k + steps });
    return false;
  }
  // Turning one step later would roll out past the line: start now if now is the nearer of the two.
  const endLater = plannedTurnEndCrossFt(line, s, wind, bankMax, 'left', 2);
  return Number.isFinite(endLater) && endLater * side <= 0 && Math.abs(endNow) <= Math.abs(endLater);
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
  const s = { ...start, bank: start.bank ?? 0, rollRate: start.rollRate ?? 0, k: 0, src: start.src ?? 0, phase: start.phase ?? 'initial', tag: undefined };
  const points = [];
  const tasKt = () => iasToTasKt(s.ias, s.alt);
  const record = (extra = {}) => {
    points.push({
      x: s.x, y: s.y, alt: Math.round(s.alt * 10) / 10, kt: Math.round(s.ias * 10) / 10,
      g: Math.round(gFromBankDeg(s.bank) * 100) / 100, bankDeg: Math.round(s.bank * 10) / 10,
      rollRateDps: Math.round(s.rollRate * 10) / 10, src: s.src, phase: s.phase, headingDeg: s.hdg, tag: s.tag, ...s.rec, ...extra,
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
  function step(targetBank, climbFtps, accelFtps2, roll = s.rollLimits ?? ROLL) {
    const tasFtps = ktToFtps(tasKt());
    const rolled = gateRoll(s.bank, s.rollRate, targetBank, DT, roll, tasFtps, s.ias);
    s.bank = Math.abs(rolled.bankDeg) < 1e-9 ? 0 : rolled.bankDeg;
    s.rollRate = Math.abs(rolled.rollRateDps) < 1e-9 ? 0 : rolled.rollRateDps;
    const v = tasFtps;
    s.hdg = wrapDeg360(s.hdg + turnRateFromBankRadPerSec(Math.max(v, 1), s.bank) * 180 / Math.PI * DT);
    const g = ground();
    s.x += g.x * DT;
    s.y += g.y * DT;
    s.alt += climbFtps * DT / heightFactor(s.alt); // climbFtps is true; the altimeter moves less on a hot day, more on a cold one (TR-77)
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
export function accelFor(ias, alt, g, climbFtps) {
  const tas = ktToFtps(iasToTasKt(ias, alt));
  return G_FTPS2 * (excessThrustPerWeight(ias, alt, g) - climbFtps / tas);
}

/** Idle deceleration (drag only, ft/s²): includes induced drag at G, but no prop drag at idle , so it underestimates the drag (an estimate). */
export function idleDecel(ias, alt, g) {
  return -G_FTPS2 * dragPerWeight(ias, alt, g);
}

/**
 * Full power toward `kias`, climbing to `toAltFt` with a smooth level-off (LEVEL_OFF_SEC): above `kias`
 * the extra speed is traded for height over about ZOOM_SEC, and once held level by the level-off the
 * power comes back, down to idle, to slow toward it; below `kias` it climbs at half the full-power rate
 * while it speeds up. The climb comes from excess thrust at the turn's real G (spec item 16). Used by
 * the climb to High Key and the closed pattern. Returns { climb, accel, climbMax } (ft/s, ft/s², ft/s).
 */
export function powerClimb(pilot, kias, toAltFt) {
  const { s } = pilot;
  const g = gFromBankDeg(s.bank);
  const v = ktToFtps(pilot.tasKt());
  const levelCap = Math.max(0, (toAltFt - s.alt) / LEVEL_OFF_SEC);
  const climbMax = Math.max(0, excessThrustPerWeight(s.ias, s.alt, g)) * v;
  let climb, accel;
  if (s.ias > kias + 0.5) {
    const decel = -(s.ias - kias) * KT_TO_FTPS / ZOOM_SEC;
    climb = Math.min(v * (excessThrustPerWeight(s.ias, s.alt, g) - decel / G_FTPS2), levelCap);
    const toTarget = (ktToFtps(iasToTasKt(kias, s.alt)) - v) / DT;
    accel = Math.min(accelFor(s.ias, s.alt, g, climb), Math.max(idleDecel(s.ias, s.alt, g), toTarget));
  } else if (s.ias < kias - 0.5) {
    climb = Math.min(levelCap, climbMax * 0.5);
    accel = accelFor(s.ias, s.alt, g, climb);
  } else {
    climb = Math.min(levelCap, climbMax);
    // Holding the speed takes power; in a turn too hard for full power to hold it (no excess thrust at this G, as a
    // breakout at up to 80° bank), it bleeds (standard aerodynamics: drag at G above full-power thrust).
    accel = Math.min(0, accelFor(s.ias, s.alt, g, climb));
  }
  return { climb, accel, climbMax };
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
let breakSecCache = null; // { temp, sec }: true airspeeds, so redone when the temperature changes
export function breakTurnSec() {
  if (breakSecCache?.temp === temperatureKey()) return breakSecCache.sec;
  let hdg = 0, turned = 0, t = 0;
  while (turned < 180 && t < 120) {
    const ias = breakKias(turned);
    const v = ktToFtps(iasToTasKt(ias, PATTERN_ALT_FT));
    const d = turnRateFromBankRadPerSec(v, CIRCUIT.patternBankDeg) * 180 / Math.PI * DT;
    turned += d; hdg += d; t += DT;
  }
  breakSecCache = { temp: temperatureKey(), sec: t };
  return t;
}

/** Seconds the final turn's 180° takes in calm air at its speed and bank (120 KIAS, 35°), at pattern height. */
let finalSecCache = null; // { temp, sec }
export function finalTurnSec() {
  if (finalSecCache?.temp === temperatureKey()) return finalSecCache.sec;
  const v = ktToFtps(iasToTasKt(CIRCUIT.finalTurnKias, PATTERN_ALT_FT));
  const sec = Math.PI / turnRateFromBankRadPerSec(v, CIRCUIT.finalTurnBankDeg);
  finalSecCache = { temp: temperatureKey(), sec };
  return sec;
}

/**
 * Where the break starts, in feet past the threshold along the runway: 2,000 ft
 * with a 10 kt headwind (SMM 4.17 para 39), later with more headwind and earlier
 * with less (SMM 4.18 para 42).
 *  - Less than 10 kt: Patrick's "Same rollout spot" (4 Oct 08:48Z), earlier by
 *    (10 kt − headwind) × the time the break takes.
 *  - More than 10 kt: later in a steady increase, all the way up to the departure
 *    end `runwayFt` (Patrick, 5 Oct 08:31Z: "Break later all the way up until the
 *    departure end. Steady increase from the ten knot break point"; TR-84). It moves
 *    by (headwind − 10 kt) × the time the break and the final turn take together, so
 *    the downwind keeps the length it has at 10 kt instead of being squeezed out as
 *    the final turn drifts back in the headwind.
 */
export function breakPointAlongFt(headwindKt, runwayFt = Infinity) {
  const extraKt = headwindKt - CIRCUIT.breakReferenceHeadwindKt;
  const perKt = KT_TO_FTPS * (extraKt > 0 ? breakTurnSec() + finalTurnSec() : breakTurnSec());
  return Math.min(runwayFt, CIRCUIT.breakPastThresholdFt + extraKt * perKt);
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
  const breakAlong = breakPointAlongFt(headwindKt, Math.hypot(dep.x - th.x, dep.y - th.y));

  // The perch: start from the route's perch, fly the break, downwind and final
  // turn, and move the perch by the miss at the window until the rollout is there.
  // The outer part first: the break starts from exactly where, and how, it reached the break point,
  // so the path has no step or backtrack there (Patrick, 10:05Z: smooth transitions).
  const outer = flyOuter(points, centre, breakAlong, wind);
  // Each try moves the perch by part of the miss, never more than PERCH_MOST_STEP_FT: in a strong wind a whole
  // miss overshoots (the break rolls out aiming at the perch, so moving the perch moves the rollout back the
  // other way), and the tries swung a few hundred feet either side and jumped between winds a knot apart
  // (Patrick, 5 Oct 08:17Z). The best try is kept.
  let perch = { x: points[11].x, y: points[11].y };
  let inner = null, best = null;
  for (let i = 0; i < PERCH_TRIES; i++) {
    inner = flyInner(points, centre, breakAlong, perch, wind, inner?.finalTurnFt, outer.end);
    const miss = { x: win.x - inner.rollout.x, y: win.y - inner.rollout.y };
    const missFt = inner.finalTurnFt != null ? Math.hypot(miss.x, miss.y) : Infinity;
    if (!best || missFt < best.missFt) best = { missFt, perch, inner };
    if (missFt < 5) break;
    const k = PERCH_STEP_SHARE * Math.min(1, PERCH_MOST_STEP_FT / Math.max(1, PERCH_STEP_SHARE * Math.hypot(miss.x, miss.y)));
    perch = { x: perch.x + miss.x * k, y: perch.y + miss.y * k };
  }
  ({ perch, inner } = best);
  // The inner part starts at the outer part's last point. The route reads a point from the leg that
  // ends at it, so that last point takes the break's phase: an aircraft started "at the break" is in the break.
  const outerTrack = outer.track.slice();
  const last = outerTrack.length - 1;
  if (last >= 0) outerTrack[last] = { ...outerTrack[last], phase: inner.track[0]?.phase ?? outerTrack[last].phase };
  return { track: [...outerTrack, ...inner.track], perch, breakAlongFt: breakAlong };
}

/**
 * A go-around flown from an aircraft's state `from` = { x, y, alt, kias,
 * headingDeg, bankDeg } in a wind, onto Pattern 1's outer downwind (see
 * flyOuter). `sideFt` moves the line it flies up the runway that far to the
 * right of the runway track (the deconfliction's move-over toward the inner
 * runway, SMM 4.21 paras 50-51). `levelAltFt`, when given, is the height the
 * move-over adds power and levels at, coming down to it on a 3° path (an
 * estimate) if it is higher, until the upwind end (Patrick, 4 Oct 19:01Z).
 * `holdKias`, when given, is the speed it slows or speeds up to and holds until
 * the upwind end, the overshoot (the move-over's 120 KIAS: Patrick, 4 Oct
 * 19:52Z); without it a go-around speeds up toward pattern speed. Past the
 * upwind end a move-over eases back onto the runway centreline and flies the
 * circuit's own climb-out line (Patrick, 6 Oct 06:43Z; TR-94).
 * Returns the path [{ x, y, alt, kt, g, src, phase, headingDeg }].
 */
export function buildGoAround(points, from, windFromDeg = 360, windKt = 0, sideFt = 0, levelAltFt = null, holdKias = null) {
  const rwy = lineOf(points[0], points[1]);
  const r = (rwy.trackDeg + 90) * Math.PI / 180;
  const shift = (p) => ({ ...p, x: p.x + sideFt * Math.sin(r), y: p.y + sideFt * Math.cos(r) });
  const centre = sideFt ? lineOf(shift(points[0]), shift(points[1])) : rwy;
  const start = { x: from.x, y: from.y, alt: from.alt, ias: from.kias, hdg: from.headingDeg, bank: from.bankDeg ?? 0, levelAltFt, holdKias, backTo: rwy };
  return flyOuter(points, centre, 0, { windFromDeg, windKt }, start).track;
}

/**
 * Spacing on final (TR-R18, Patrick's R25; Patrick, 4 Oct 21:52Z): an aircraft on the inner downwind
 * flies on past its perch by `extendFt` before it turns final, so it rolls out further out on the
 * centreline, behind the traffic on final. Flown from its state `from` = { x, y, alt, kias,
 * headingDeg, bankDeg } with the same downwind, final turn and final as the circuit; the final turn
 * comes down to the glide path's height at its rollout (the window's own slope, about 3°, carried
 * further out) instead of the window's height. `perch` is today's built perch. The path stops once it
 * is on Pattern 1's own final, `joinBeforeWindowFt` inside the window, where Pattern 1 carries on.
 * Returns { track, rollout, rolloutSec, endSec }: where it rolled out on final, and the seconds from `from` to
 * the rollout and to the end of the path.
 */
export function buildExtendedDownwind(points, from, windFromDeg, windKt, perch, extendFt, joinBeforeWindowFt = 1000) {
  const centre = lineOf(points[0], points[1]);
  const back = (centre.trackDeg + 180) * Math.PI / 180;
  const extended = { x: perch.x + extendFt * Math.sin(back), y: perch.y + extendFt * Math.cos(back) };
  const windowFt = Math.hypot(points[12].x - points[0].x, points[12].y - points[0].y);
  const slope = (points[12].alt - THRESHOLD_DATA_ELEV_FT) / windowFt;
  const start = { x: from.x, y: from.y, alt: from.alt, ias: from.kias, hdg: from.headingDeg, bank: from.bankDeg ?? 0 };
  const inner = flyInner(points, centre, 0, extended, { windFromDeg, windKt }, null, start, {
    startStage: 'downwind',
    finalTurnFromAlt: from.alt,
    finalTurnEndAlt: THRESHOLD_DATA_ELEV_FT + slope * (windowFt + extendFt),
    stopToGoFt: windowFt - joinBeforeWindowFt,
  });
  return { track: inner.track, rollout: inner.rollout, rolloutSec: inner.rolloutSec, endSec: inner.endSec };
}

/**
 * From the threshold round the outer pattern to the break point. With
 * `goAround` set to an aircraft's state ({ x, y, alt, ias, hdg, bank }) it flies
 * a go-around from there instead (Traffic spec 4.10; Patrick, 4 Oct 09:14Z and
 * 09:18Z): full power straight ahead on the runway track, level at 2,500 ft to
 * the upwind end and speeding up, then trading that speed for height, then the
 * take-off climb-out and crosswind turn; it stops once settled on the outer
 * downwind, where it joins Pattern 1.
 */
function flyOuter(points, centre, breakAlong, wind, goAround = null) {
  const th = points[0];
  const rwyTrack = centre.trackDeg;
  const start = goAround
    ? { x: goAround.x, y: goAround.y, alt: goAround.alt, ias: goAround.ias, hdg: goAround.hdg, src: 0, phase: 'go_around' }
    : { ...touchdownPointOf(th, points[1]), alt: THRESHOLD_DATA_ELEV_FT, ias: CIRCUIT.thresholdKias, hdg: 0, src: 0, phase: 'climb' };
  const pilot = makePilot(start, wind);
  const { s } = pilot;
  if (goAround) s.bank = goAround.bank ?? 0;
  else s.hdg = pilot.headingFor(rwyTrack);
  pilot.record();
  // Each leg is named as it is flown: climb-out, crosswind, the outer downwind, then initial from the 45° leg. The go-around's
  // downwind is the one Pattern 1 joins it onto, so it keeps the name 'downwind'.
  const phase = (ph) => { s.phase = goAround || ph !== 'downwind' ? ph : 'outer_downwind'; };
  const runwayLen = Math.hypot(points[1].x - th.x, points[1].y - th.y);
  const crosswindTrack = wrapDeg360(rwyTrack - 90);
  const downwind = lineOf(points[5], points[6]);
  const base = lineOf(points[6], points[7]);
  const leg45 = lineOf(points[7], points[8]);
  let stage = goAround ? 'goAround' : 'climbOut', capturing = false;
  for (let n = 0; n < MAX_STEPS; n++) {
    const g = gFromBankDeg(s.bank);
    const tasKt = pilot.tasKt();
    const R = leadRadiusFt(tasKt, CIRCUIT.patternBankDeg);
    const gs = pilot.groundSpeedFtps();
    const gsOn = (line) => ktToFtps(Math.max(10, windTriangle(line.trackDeg, tasKt, wind.windFromDeg, wind.windKt).groundSpeedKt));
    // Turning onto a new line: a steady pattern-bank turn to its track, then hold the line.
    const onto = (line) => {
      // The planned turn flies on to its roll-out, wings level on the line's track (TR-95), then holds the line.
      if (capturing && Math.abs(wrapDeg180(line.trackDeg - pilot.trackDeg())) < CAPTURE_DONE_DEG && Math.abs(s.bank) < CAPTURE_LEVEL_DEG) capturing = false;
      return capturing
        ? plannedBank(pilot.headingFor(line.trackDeg), s, CIRCUIT.patternBankDeg, 'left')
        : bankFor(pilot.headingFor(trackForLine(line, s, HOLD_RADIUS_FT)), s, 30);
    };
    let climb = 0, accel = 0, bank = 0;

    // Go-around: level at 2,500 ft to the upwind end (or where it is, if higher), speeding up at full
    // power (a take-off pitch if it has to climb to get there), then trade the extra speed for height
    // down to 180 KIAS.
    // A move-over held slow to the overshoot has no extra speed to trade: it climbs out at take-off pitch, speeding up to 180.
    if (stage === 'goAround' && legOffsetsFt(th, points[1], s).alongFt >= runwayLen) {
      stage = s.ias > CIRCUIT.climbKias ? 'zoom' : 'climbOut';
      phase('climb');
      pilot.mark({ src: 1 });
    }
    if (stage === 'zoom' && (s.ias <= CIRCUIT.climbKias + 0.5 || s.alt >= PATTERN_ALT_FT - 50)) {
      stage = 'climbOut';
      pilot.mark({ src: 2 });
    }
    // Speed and height: the climb-out schedule, then 220 KIAS level.
    if (stage === 'goAround') {
      const aoa = attitudeDegFromClimb(0, ktToFtps(tasKt), s.ias, g); // the level attitude: the takeoff attitude less it is the climb angle
      const takeoffClimb = ktToFtps(tasKt) * sinDeg(Math.max(0, CIRCUIT.takeoffPitchDeg - aoa));
      // A go-around never comes down to its height from above; a move-over comes down to its own on a 3° path.
      const levelAlt = goAround.levelAltFt ?? CIRCUIT.goAroundAltFt;
      const mostDown = goAround.levelAltFt == null ? 0 : -ktToFtps(tasKt) * sinDeg(MOVE_OVER_DESCENT_DEG);
      climb = clamp((levelAlt - s.alt) / LEVEL_OFF_SEC, mostDown, takeoffClimb);
      if (goAround.holdKias == null) accel = s.ias >= CIRCUIT.patternKias - 0.01 ? 0 : accelFor(s.ias, s.alt, g, climb);
      else {
        // The move-over holds its speed to the overshoot: power back (down to idle) to slow to it, or up to reach it.
        const toTarget = (ktToFtps(iasToTasKt(goAround.holdKias, s.alt)) - ktToFtps(tasKt)) / DT;
        accel = clamp(toTarget, Math.min(0, idleDecel(s.ias, s.alt, g)), Math.max(0, accelFor(s.ias, s.alt, g, climb)));
      }
    } else if (stage === 'zoom') {
      const v = ktToFtps(tasKt);
      const decel = -(s.ias - CIRCUIT.climbKias) * KT_TO_FTPS / ZOOM_SEC;
      // Energy: full-power climb plus the climb the lost speed buys, levelling at pattern height.
      climb = Math.min(v * (excessThrustPerWeight(s.ias, s.alt, g) - decel / G_FTPS2), Math.max(0, (PATTERN_ALT_FT - s.alt) / LEVEL_OFF_SEC));
      accel = accelFor(s.ias, s.alt, g, climb);
    } else if (s.ias < CIRCUIT.climbKias - 0.01 && stage === 'climbOut' && s.src < 2) {
      const aoa = attitudeDegFromClimb(0, ktToFtps(tasKt), s.ias, g); // the level attitude: the takeoff attitude less it is the climb angle
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
    if (stage === 'climbOut' || stage === 'goAround' || stage === 'zoom') {
      // Past the upwind end a move-over comes back across to the runway centreline (TR-94).
      const line = stage !== 'goAround' && goAround?.backTo ? goAround.backTo : centre;
      bank = bankFor(pilot.headingFor(trackForLine(line, s, HOLD_RADIUS_FT)), s, 30);
      if (stage === 'climbOut' && s.ias >= CIRCUIT.patternKias - 0.5 && s.alt >= PATTERN_ALT_FT - 50) { stage = 'crosswindTurn'; phase('crosswind'); pilot.mark({ src: 3 }); }
    } else if (stage === 'crosswindTurn' || stage === 'crosswind') {
      bank = bankFor(pilot.headingFor(crosswindTrack), s, CIRCUIT.patternBankDeg, 'left');
      if (stage === 'crosswindTurn' && Math.abs(bank) < 3 && Math.abs(s.bank) < 3) { stage = 'crosswind'; }
      if (timeToTurnOnto(downwind, s, wind, CIRCUIT.patternBankDeg, pilot.trackDeg(), R, gs, gsOn(downwind))) { stage = 'downwind'; capturing = true; s.rollingOut = false; phase('downwind'); pilot.mark({ src: 4 }); }
    } else if (stage === 'downwind') {
      bank = onto(downwind);
      // A go-around ends once settled on the downwind line: Pattern 1 carries on from there.
      if (goAround && !capturing && Math.abs(legOffsetsFt(downwind.a, downwind.b, s).crossFt) < 20 && Math.abs(s.bank) < 2) break;
      if (s.src < 5 && legOffsetsFt(downwind.a, downwind.b, s).alongFt >= 0) pilot.mark({ src: 5 });
      if (timeToTurnOnto(base, s, wind, CIRCUIT.patternBankDeg, pilot.trackDeg(), R, gs, gsOn(base))) { stage = 'base'; capturing = true; s.rollingOut = false; pilot.mark({ src: 6 }); }
    } else if (stage === 'base') {
      bank = onto(base);
      if (timeToTurnOnto(leg45, s, wind, CIRCUIT.patternBankDeg, pilot.trackDeg(), R, gs, gsOn(leg45))) { stage = 'leg45'; capturing = true; s.rollingOut = false; phase('initial'); pilot.mark({ src: 7 }); }
    } else if (stage === 'leg45') {
      bank = onto(leg45);
      if (timeToTurnOnto(centre, s, wind, CIRCUIT.patternBankDeg, pilot.trackDeg(), R, gs, gsOn(centre))) { stage = 'initial'; capturing = true; s.rollingOut = false; pilot.mark({ src: 8 }); }
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
 * final turn rolled out. `opts` (spacing on final, buildExtendedDownwind):
 * `startStage` 'downwind' starts on the downwind instead of in the break;
 * `finalTurnFromAlt` and `finalTurnEndAlt` replace pattern height and the
 * window's height for the final turn's descent; `stopToGoFt` ends the path on
 * final that far from the threshold.
 */
function flyInner(points, centre, breakAlong, perch, wind, finalTurnFtGuess = null, from = null, opts = {}) {
  const th = points[0];
  const rwyTrack = centre.trackDeg;
  const along = breakAlong;
  const ux = (points[1].x - th.x), uy = (points[1].y - th.y), len = Math.hypot(ux, uy);
  const start = from ?? { x: th.x + ux / len * along, y: th.y + uy / len * along };
  const pilot = makePilot({ x: start.x, y: start.y, alt: from?.alt ?? PATTERN_ALT_FT, ias: from?.ias ?? CIRCUIT.patternKias, hdg: 0, src: 9, phase: 'break' }, wind);
  const { s } = pilot;
  s.hdg = from ? from.hdg : pilot.headingFor(rwyTrack);
  if (from) { s.bank = from.bank ?? 0; s.rollRate = from.rollRate ?? 0; }
  const startStage = opts.startStage ?? 'break';
  if (startStage === 'downwind') { s.phase = 'downwind'; s.src = 10; }
  s.tag = startStage;
  pilot.record();
  const ftFromAlt = opts.finalTurnFromAlt ?? PATTERN_ALT_FT, ftEndAlt = opts.finalTurnEndAlt ?? points[12].alt;
  // The glide path's slope, feet down per foot over the ground: the window's own (about 3°, SMM 4.7 para 12).
  const aim = aimPointOf(th, points[1]);
  const glideSlope = Math.max(0, (points[12].alt - THRESHOLD_DATA_ELEV_FT) / Math.max(1, Math.hypot(points[12].x - aim.x, points[12].y - aim.y)));
  const touchdown = touchdownPointOf(th, points[1]);
  let crossedThreshold = false, flare = null;
  let rolloutSec = null, ftTurned = 0;
  let stage = startStage, turned = 0, ftTotal = null, rollout = null, lastClimb = 0, ftDist = 0, finalTurnFt = null;
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
        const finalHdg = pilot.headingFor(rwyTrack);
        ftTotal = ((s.hdg - finalHdg) % 360 + 360) % 360 || 360;
      }
    } else if (stage === 'finalTurn') {
      const finalHdg = pilot.headingFor(rwyTrack);
      bank = bankFor(finalHdg, s, CIRCUIT.finalTurnBankDeg, 'left');
      accel = s.ias > CIRCUIT.finalTurnKias ? Math.max(idleDecel(s.ias, s.alt, g), (ktToFtps(iasToTasKt(CIRCUIT.finalTurnKias, s.alt)) - ktToFtps(pilot.tasKt())) / DT) : 0;
      // Height: a steady descent from pattern height to the window over the turn,
      // eased in and out at the ends. Spread over the distance the turn took on the
      // last try (the perch is found by trying again), or over the angle on the first.
      // Degrees turned so far, added up step by step: a heading that wanders right of where the turn began
      // (a wind correction) counts as none turned, never as nearly a full circle.
      // It ends on the glide path both in height and in slope (Patrick, 5 Oct 08:17Z; TR-82): at the rollout it
      // is already coming down at the window's own slope (about 3°), which the final carries on, so it does not
      // level off at the window and sit above the glide path while it catches up. Past the turn's distance on the
      // last try it carries on down that slope until it rolls out.
      const dropFt = ftFromAlt - ftEndAlt;
      const endRate = finalTurnFtGuess && dropFt > 1 ? clamp(glideSlope * finalTurnFtGuess / dropFt, 0, 2) : 0;
      const u = finalTurnFtGuess ? clamp(ftDist / finalTurnFtGuess, 0, 1) : clamp(ftTurned / ftTotal, 0, 1);
      const hNow = finalTurnFtGuess && ftDist > finalTurnFtGuess && endRate > 0
        ? ftEndAlt - glideSlope * (ftDist - finalTurnFtGuess)
        : ftFromAlt - dropFt * easedFraction(u, FINAL_TURN_EASE, endRate);
      // An extended final turn (no turn distance from a last try) never goes under the 3° line to the numbers: where
      // its steady descent would, it rides that line for the rest of the turn and rolls out on it, coming down, instead
      // of levelling off under it until the rollout (Patrick, 6 Oct 07:42Z; TR-104).
      const onGlideFt = THRESHOLD_DATA_ELEV_FT + glideSlope * Math.hypot(s.x - aim.x, s.y - aim.y);
      const hTurn = opts.finalTurnEndAlt != null && !finalTurnFtGuess ? Math.max(hNow, Math.min(onGlideFt, ftFromAlt)) : hNow;
      climb = (hTurn - s.alt) / DT;
      if (Math.abs(wrapDeg180(finalHdg - s.hdg)) < 0.5 && Math.abs(s.bank) < 2) {
        rollout = { x: s.x, y: s.y };
        rolloutSec = s.k * DT;
        finalTurnFt = ftDist;
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
      // Down to the runway's height at the base of the numbers, the aim point (TR-93).
      const toAim = toGo + NUMBER_BASE_PAST_THRESHOLD_FT;
      const glideRate = -((s.alt - THRESHOLD_DATA_ELEV_FT) / Math.max(toAim, 1)) * v;
      climb = lastClimb + (glideRate - lastClimb) * Math.min(1, DT / 1.5); // eases onto the glide path
      // The flare (TR-96): from FLARE_FROM_FT the sink dies away to FLARE_TOUCH_SINK_FTPS at touchdown,
      // TOUCHDOWN_PAST_NUMBERS_FT past the numbers: height over the runway along a cubic that starts at the glide's own slope.
      const toTouch = toAim + TOUCHDOWN_PAST_NUMBERS_FT;
      const h = s.alt - THRESHOLD_DATA_ELEV_FT;
      if (!flare && h <= FLARE_FROM_FT && toTouch > 0) {
        const h0 = Math.max(h, 0.1);
        const m0 = -Math.min(3 * h0, Math.max(0, -climb / Math.max(v, 1)) * toTouch); // never so steep it dips under the runway
        const m1 = -Math.min(3 * h0, FLARE_TOUCH_SINK_FTPS / Math.max(v, 1) * toTouch);
        flare = { h0, m0, m1, dist: toTouch };
      }
      if (flare) {
        const u = clamp(1 - (toTouch - v * DT) / flare.dist, 0, 1);
        const hWant = (2 * u ** 3 - 3 * u ** 2 + 1) * flare.h0 + (u ** 3 - 2 * u ** 2 + u) * flare.m0 + (u ** 3 - u ** 2) * flare.m1;
        climb = (hWant - h) / DT;
      }
      const wantKias = CIRCUIT.finalTurnKias - (CIRCUIT.finalTurnKias - CIRCUIT.thresholdKias) * f;
      accel = (ktToFtps(iasToTasKt(wantKias, s.alt)) - ktToFtps(pilot.tasKt())) / DT * 0.2;
      if (opts.stopToGoFt != null && toGo <= opts.stopToGoFt && Math.abs(s.bank) < 2) break;
      if (!crossedThreshold && toGo <= v * DT) {
        // Over the threshold a few feet up (about 11 ft on a 3° path), still going down to the numbers.
        crossedThreshold = true;
        pilot.points.push({ x: th.x, y: th.y, alt: Math.round((s.alt + climb * (toGo / Math.max(v, 1))) * 10) / 10, kt: CIRCUIT.thresholdKias, g: 1, src: 0, phase: 'final', headingDeg: s.hdg, tag: 'threshold' });
      }
      if (toTouch <= v * DT) {
        pilot.points.push({ x: touchdown.x, y: touchdown.y, alt: THRESHOLD_DATA_ELEV_FT, kt: CIRCUIT.thresholdKias, g: 1, src: 0, phase: 'final', headingDeg: s.hdg, tag: 'touchdown' });
        break;
      }
    }
    const xBefore = s.x, yBefore = s.y;
    pilot.step(bank, climb, accel);
    lastClimb = climb;
    if (stage === 'break') turned += Math.abs(wrapDeg180(s.hdg - hdgBefore));
    if (stage === 'finalTurn') {
      ftDist += Math.hypot(s.x - xBefore, s.y - yBefore);
      ftTurned = Math.max(0, ftTurned + wrapDeg180(hdgBefore - s.hdg));
    }
  }
  return { track: pilot.points, rollout: rollout ?? { x: s.x, y: s.y }, finalTurnFt, rolloutSec, endSec: s.k * DT };
}
