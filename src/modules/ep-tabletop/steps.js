// "Any setup" (docs/modules/ep-tabletop/spec.md, "Any setup: freeze at any point of a manoeuvre"; EP-17 to EP-19, EP-R11; plan Step 5b):
// the setup the instructor freezes the aircraft at, the step builder's rows as data, and the small pilot that flies them. flight.js runs
// this pilot on the shared point mass exactly as it runs the emergency picks' pilots (manoeuvres.js): every 0.05 s step the pilot asks for
// a bank, a G and a throttle, and flight.js eases them in under the T-6A's roll and G onset and caps the G at what the wing gives (core
// stallLimitG). This file holds only the pilot's choices (which way to roll, what attitude to aim for, when a row is over); every law it
// flies by is core's (dampedClimbG, shakerG) or manoeuvres.js's (bankToward, heightPathRad), never a second copy.
//
// The aircraft flies what was entered, right or wrong (Dad, 15 Oct 2026: "if the student describes it wrong, we should see the outcome").
// Nothing here judges: a wrong row is flown and its consequences show.
//
// A setup (cleanSetup): { x, y (feet from CYMJ's origin, x east, y north: the map drop), altFt (MSL), headingDegM (null: out of the area,
// away from Moose Jaw), kias, powerPct, pitchDeg (+ nose up, the attitude the pilot sees), bankDeg (+ right) }. Gear and flaps stay up.
//
// A row (cleanRows), one of:
//   { type: 'fly', power?, roll?, pitch?, hold?, until }   any of the four may be missing: what a row leaves out carries on as it was.
//       power  { kind: 'idle' | 'max' | 'pct', pct }
//       roll   { kind: 'nearest' (the nearer horizon) | 'level' | 'bank', bankDeg (+ right) }
//       pitch  { kind: 'horizon' | 'attitude', deg (+ nose up) }
//       hold   { kind: 'level' | 'heading', headingDegM }
//       until  { kind: 'done' (every target being flown reached) | 'kias' | 'altFt' | 'headingDegM' | 'seconds', value }
//   { type: 'spin', dir: 'left' | 'right', turns }           a spin, flown as a set-piece on numbers (EP-19; SPIN below)
//   { type: 'recover' }                                     the spin recovery, then the dive pull-out on the point mass
// Never a word of a checklist or boldface: a row is a target the student described, not a procedure (EP-3). The spin recovery is a
// row with no inputs named; the set-piece only knows how many turns and how much height it takes.
//
// The pilot's memory is the flight's `setup` (plain data: the session is copied, rewound and sent):
//   { targets: { power (0 to 1), roll, pitch, hold }, rows, i (the row flying, -1 when none: the controls held), rowT0 (clock at its start),
//     row0 { kias, altFt, headingDegT } (where its "until" started from), latched { roll, pitch } (a target once reached, for what follows
//     it in the row), holdAltFt, spin (null, or the set-piece: { dir ±1, phase: 'spin' | 'recovery', deg }), recovered, stalled,
//     said (words for the log, taken by scenario.js), ended (true when the last row is over: the session pauses) }
//
// Every number names its source; "estimate" where no manual page or Patrick's ruling gives it. The project files' manuals could not be read
// when this was built (15 Oct 2026), so every spin number is an estimate (EP-19).
import { dampedClimbG } from '../../core/flight-math.js';
import { shakerG, stallLimitG, T6A_MANOEUVRE } from '../../core/t6-performance.js';
import { wrapDeg180, wrapDeg360, unitVectorFromCompassDeg, DEG } from '../../core/angles.js';
import { FT_PER_NM } from '../../core/units.js';
import { PILOT, bankToward, heightPathRad } from './manoeuvres.js';

/** The step builder's pilot. Each has its source; "estimate" where none backs it yet. */
export const STEP_PILOT = Object.freeze({
  /** A row whose end never comes stops after this much flight time, said in words (EP-18, an estimate). A row "for N seconds" runs its N. */
  rowCapS: 60,
  /** "The nearest horizon": roll toward the nearer horizon along the present bank, up to 90° while the nose is above it (EP-18, an estimate). */
  nearestHorizonBankDeg: 90,
  /** With no bank to go either way (wings level), "the nearest horizon" rolls right (an estimate; any side is as near). */
  nearestHorizonSideWhenLevel: 1,
  /** How briskly the nose moves onto an attitude, rad/s: the module's pilot (core dampedClimbG's omega; manoeuvres.js PILOT.pathOmega, the Formation sim's 0.5). */
  pitchOmega: PILOT.pathOmega,
  /** The most a row's pull asks for: in the stick shaker (core shakerG, reference: pulls fly in the shaker, not on the stall line), never
   * past 5 G, Patrick's split S pull (core T6A_MANOEUVRE.splitSMaxG, "Split S goes up to 5 G"). A pilot's choice for a firm recovery pull;
   * the 7 G published limit is flagged, never held. An estimate for the step builder. */
  pullMaxG: T6A_MANOEUVRE.splitSMaxG,
  /** A row's pilot unloads to 0 G at the least, never pushes negative (the module's FLIGHT.pilotMinG; an estimate). */
  pullMinG: 0,
  /** Pitch at a steep bank: the G that moves the nose up or down is divided by the cosine of the bank, kept at least this far from zero
   * (flight.js stepOnce's same 0.3), so at 90° of bank a pull turns the nose sideways and gravity brings it down. */
  cosBankFloor: 0.3,
  /** "Hold a heading" banks up to this toward it: the module's gentle turn, 30° (manoeuvres.js PILOT.turnBankDeg, an estimate). */
  holdHeadingBankDeg: PILOT.turnBankDeg,
  /** When a target counts as reached (tool choices, estimates): bank within 3° and rolling under 10°/s, attitude within 2°, heading within
   * 3°, height within 50 ft and the path within 2° of level. */
  bankTolDeg: 3,
  rollRateTolDps: 10,
  pitchTolDeg: 2,
  headingTolDeg: 3,
  altTolFt: 50,
  levelPathTolDeg: 2,
  /** The G held at a freeze: the G that keeps the flight path straight at that bank, cos(path) ÷ cos(bank) (standard aerodynamics: a
   * level turn's G when the path is level), with the cosine kept at least 0.5 so it never asks more than 2 G (the module's FLIGHT.pilotMaxG;
   * past 60° of bank, or inverted, the aircraft is held at that and the path curves). Capped by what the wing gives. An estimate of what a
   * pilot frozen there is holding. */
  freezeCosFloor: 0.5,
  /** A spin row first flies the wing to the stall: power to idle, wings level, the nose held this far up, pulling to what the wing gives,
   * until the speed is down to the 1 G stall; then the set-piece (an estimate of a spin entry; the incipient spin itself is not flown). The
   * spin row is the instructor's move to put the aircraft in a spin, so it brings its own power (the rows after it carry the idle on). */
  spinEntryNoseDeg: 20,
  spinEntryPower: 0,
});

/**
 * The spin set-piece's numbers (EP-19). The shared point mass cannot spin, so a spin is flown on these. EVERY ONE IS AN ESTIMATE: the
 * project files' manuals were not reachable from the session on 15 Oct 2026. Estimate; replace with the manual page (or Patrick's ruling).
 * Shown "(estimate)" on the console.
 */
export const SPIN = Object.freeze({
  /** One turn of the spin takes this long, seconds (estimate; replace with the manual page). */
  secondsPerTurn: 2.5,
  /** Height lost each turn, feet (estimate; replace with the manual page). */
  ftPerTurn: 450,
  /** The nose in the spin, degrees (below the horizon negative) (estimate; replace with the manual page). */
  noseDeg: -50,
  /** The bank the attitude indicator shows in the spin, degrees into the spin (estimate; replace with the manual page). */
  bankDeg: 15,
  /** The airspeed indicator in the spin, KIAS (estimate; replace with the manual page). */
  kias: 110,
  /** The G in the spin (estimate; replace with the manual page). */
  g: 1,
  /** Turns the spin keeps on for once the recovery row starts, at the same rate and height a turn (estimate; replace with the manual page). */
  recoveryTurns: 1.5,
  /** Where the recovery leaves the aircraft, wings level, for the dive pull-out flown on the point mass: the nose, degrees, and the speed,
   * KIAS (estimates; replace with the manual page). */
  exitNoseDeg: -40,
  exitKias: 120,
});

// ---- The setup --------------------------------------------------------------------------------------------------------------

/** The default drop: 12 NM south-west of Moose Jaw (225° true), the example scenario's area position (an estimate, scenarios.js). */
const DEFAULT_DROP = Object.freeze({ bearingDegT: 225, distNm: 12 });
const dropAt = ({ bearingDegT, distNm }) => {
  const u = unitVectorFromCompassDeg(bearingDegT);
  return { x: u.x * distNm * FT_PER_NM, y: u.y * distNm * FT_PER_NM };
};

/**
 * The setup's defaults (EP-17; all estimates for a sensible start): 12 NM south-west of Moose Jaw, 8,000 ft, the heading out of the area
 * (null: away from Moose Jaw along the bearing the drop lies on, flight.js), 180 KIAS, 70 % power, pitch 0°, bank 0°.
 */
export const SETUP_DEFAULTS = Object.freeze({ ...dropAt(DEFAULT_DROP), altFt: 8000, headingDegM: null, kias: 180, powerPct: 70, pitchDeg: 0, bankDeg: 0 });

/** The spans a setup is kept to: what the map and the model can take, not flying limits (VMO and 7 G are flagged, never held). */
export const SETUP_RANGES = Object.freeze({
  /** The map: 100 NM round Moose Jaw. */
  x: Object.freeze([-100 * FT_PER_NM, 100 * FT_PER_NM]),
  y: Object.freeze([-100 * FT_PER_NM, 100 * FT_PER_NM]),
  /** Feet MSL; flight.js lifts a drop below the ground to 100 ft above the nearest field. */
  altFt: Object.freeze([0, 31000]),
  headingDegM: Object.freeze([0, 360]),
  /** 40 KIAS: the point mass needs a speed; 350: past VMO (316), which is flagged. */
  kias: Object.freeze([40, 350]),
  powerPct: Object.freeze([0, 100]),
  pitchDeg: Object.freeze([-85, 85]),
  bankDeg: Object.freeze([-180, 180]),
});

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** A finite number kept to [lo, hi], or null (a string of digits from a form box counts; anything else does not). */
function num(v, lo, hi) {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? clamp(n, lo, hi) : null;
}

/**
 * A setup checked (it may come from the phone's form or, later, over a link: untrusted, as manoeuvres.js cleanPick): only the known
 * fields, each a finite number kept to SETUP_RANGES, a missing or bad one taking its default (SETUP_DEFAULTS). Never null.
 * @param {any} raw
 */
export function cleanSetup(raw) {
  const r = isObject(raw) ? raw : {};
  const out = {};
  for (const [key, range] of Object.entries(SETUP_RANGES)) {
    const v = num(r[key], range[0], range[1]);
    out[key] = v === null ? SETUP_DEFAULTS[key] : v;
  }
  if (out.headingDegM !== null) out.headingDegM = wrapDeg360(out.headingDegM);
  return out;
}

// ---- The rows ---------------------------------------------------------------------------------------------------------------

/** At most this many rows a Fly (a tool choice). */
export const MAX_ROWS = 12;
/** The spans a row's numbers are kept to (not flying limits). */
export const ROW_RANGES = Object.freeze({
  pct: Object.freeze([0, 100]),
  bankDeg: SETUP_RANGES.bankDeg,
  deg: SETUP_RANGES.pitchDeg,
  headingDegM: SETUP_RANGES.headingDegM,
  kias: SETUP_RANGES.kias,
  altFt: SETUP_RANGES.altFt,
  seconds: Object.freeze([1, 600]),
  turns: Object.freeze([0.5, 10]),
});
const UNTIL_RANGE = Object.freeze({ kias: ROW_RANGES.kias, altFt: ROW_RANGES.altFt, headingDegM: ROW_RANGES.headingDegM, seconds: ROW_RANGES.seconds });

/** One row checked, or null when it isn't a usable row. */
function cleanRow(raw) {
  if (!isObject(raw)) return null;
  if (raw.type === 'spin') {
    const dir = raw.dir === 'left' || raw.dir === 'right' ? raw.dir : null;
    const turns = num(raw.turns, ...ROW_RANGES.turns);
    return dir && turns !== null ? { type: 'spin', dir, turns: Math.round(turns * 2) / 2 } : null;
  }
  if (raw.type === 'recover') return { type: 'recover' };
  if (raw.type !== 'fly') return null;
  const row = { type: 'fly' };
  const p = isObject(raw.power) ? raw.power : null;
  if (p?.kind === 'idle' || p?.kind === 'max') row.power = { kind: p.kind };
  else if (p?.kind === 'pct' && num(p.pct, ...ROW_RANGES.pct) !== null) row.power = { kind: 'pct', pct: num(p.pct, ...ROW_RANGES.pct) };
  const ro = isObject(raw.roll) ? raw.roll : null;
  if (ro?.kind === 'nearest' || ro?.kind === 'level') row.roll = { kind: ro.kind };
  else if (ro?.kind === 'bank' && num(ro.bankDeg, ...ROW_RANGES.bankDeg) !== null) row.roll = { kind: 'bank', bankDeg: num(ro.bankDeg, ...ROW_RANGES.bankDeg) };
  const pi = isObject(raw.pitch) ? raw.pitch : null;
  if (pi?.kind === 'horizon') row.pitch = { kind: 'horizon' };
  else if (pi?.kind === 'attitude' && num(pi.deg, ...ROW_RANGES.deg) !== null) row.pitch = { kind: 'attitude', deg: num(pi.deg, ...ROW_RANGES.deg) };
  const ho = isObject(raw.hold) ? raw.hold : null;
  if (ho?.kind === 'level') row.hold = { kind: 'level' };
  else if (ho?.kind === 'heading' && num(ho.headingDegM, ...ROW_RANGES.headingDegM) !== null) row.hold = { kind: 'heading', headingDegM: wrapDeg360(num(ho.headingDegM, ...ROW_RANGES.headingDegM)) };
  const un = isObject(raw.until) ? raw.until : null;
  const range = un ? UNTIL_RANGE[un.kind] : null;
  const value = range ? num(un.value, ...range) : null;
  row.until = range && value !== null ? { kind: un.kind, value: un.kind === 'headingDegM' ? wrapDeg360(value) : value } : { kind: 'done' };
  // A row that sets nothing and ends when "done" would end at once: dropped.
  if (!row.power && !row.roll && !row.pitch && !row.hold && row.until.kind === 'done') return null;
  return row;
}

/**
 * The rows checked, in order (untrusted, as cleanSetup): the usable ones, at most MAX_ROWS; the rest dropped.
 * @param {any} raw
 */
export function cleanRows(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_ROWS).map(cleanRow).filter(Boolean);
}

const hdgWords = (d) => `${String(Math.round(wrapDeg360(d)) % 360).padStart(3, '0')}°M`;
const sideWords = (deg) => (deg > 0 ? ' right' : deg < 0 ? ' left' : '');
const attitudeWords = (deg) => (deg === 0 ? 'the horizon' : `${Math.abs(deg)}° nose ${deg > 0 ? 'up' : 'down'}`);

/** A row in words, for the console and the log: "Power max · Roll to the nearest horizon · until done". */
export function rowWords(row) {
  if (!row) return '';
  if (row.type === 'spin') return `Spin ${row.dir}, ${row.turns} turn${row.turns === 1 ? '' : 's'}`;
  if (row.type === 'recover') return 'Spin recovery';
  const parts = [];
  if (row.power) parts.push(row.power.kind === 'pct' ? `Power ${Math.round(row.power.pct)} %` : `Power ${row.power.kind}`);
  if (row.roll) parts.push(row.roll.kind === 'nearest' ? 'Roll to the nearest horizon' : row.roll.kind === 'level' ? 'Roll wings level' : `Roll to ${Math.abs(Math.round(row.roll.bankDeg))}°${sideWords(row.roll.bankDeg)}`);
  if (row.pitch) parts.push(row.pitch.kind === 'horizon' ? 'Pitch to the horizon' : `Pitch to ${attitudeWords(Math.round(row.pitch.deg))}`);
  if (row.hold) parts.push(row.hold.kind === 'level' ? 'Hold level' : `Hold ${hdgWords(row.hold.headingDegM)}`);
  parts.push(untilWords(row.until));
  return parts.join(' · ');
}

function untilWords(u) {
  if (!u || u.kind === 'done') return 'until done';
  if (u.kind === 'kias') return `until ${Math.round(u.value)} KIAS`;
  if (u.kind === 'altFt') return `until ${Math.round(u.value).toLocaleString('en-CA')} ft`;
  if (u.kind === 'headingDegM') return `until ${hdgWords(u.value)}`;
  return `for ${Math.round(u.value)} s`;
}

// ---- The pilot ---------------------------------------------------------------------------------------------------------------

/**
 * The G held at a freeze at flight path `gammaRad` and `bankDeg` (STEP_PILOT.freezeCosFloor), capped by what the wing gives at `kias`
 * (core stallLimitG with the configuration's stall). flight.js solves the path that gives the set attitude with it.
 */
export function freezeG(gammaRad, bankDeg, kias, stallKias) {
  const g = Math.cos(gammaRad) / Math.max(Math.abs(Math.cos(bankDeg * DEG)), STEP_PILOT.freezeCosFloor);
  return Math.min(g, stallLimitG(kias, stallKias));
}

/** The targets of the controls held (Carry on; the freeze; the end of the rows): the G, the bank and the power as they are now. */
export const heldTargets = ({ g, bankDeg, throttle }) => ({ power: throttle, roll: { kind: 'hold', bankDeg }, pitch: { kind: 'g', g }, hold: {} });

/** A fresh pilot memory with the controls held. */
export function setupMemory(held) {
  return { targets: heldTargets(held), rows: [], i: -1, rowT0: 0, row0: null, latched: {}, holdAltFt: null, spin: null, recovered: false, stalled: false, said: [], ended: false };
}

/** The pilot memory after Carry on: any rows dropped, the controls held as they are now; a spin keeps spinning. */
export function carryOnMemory(mem, held) {
  return { ...setupMemory(held), spin: mem?.spin ? { ...mem.spin, phase: 'spin', deg: 0 } : null, stalled: mem?.stalled ?? false, said: [...(mem?.said ?? [])] };
}

/** The pilot memory to fly `rows` (cleaned first, cleanRows) from now: what the rows leave out carries on from the controls as they are now
 * (the G, bank and power); a spin keeps spinning until a recovery row. */
export function flyMemory(mem, rows, now) {
  return startRow(now, { ...carryOnMemory(mem, now), rows, said: [...(mem?.said ?? [])] }, 0);
}

const say = (mem, words) => ({ ...mem, said: [...mem.said, words] });

/** The row `i` started from `now` (the rows over when there is none: the controls held, `ended`). */
function startRow(now, mem, i) {
  if (i >= mem.rows.length) return { ...mem, i: -1, rows: [], targets: heldTargets(now), latched: {}, ended: true };
  const row = mem.rows[i];
  let out = { ...mem, i, rowT0: now.clockS, row0: { kias: now.kias, altFt: now.altFt, headingDegT: now.headingDegT }, latched: {}, holdAltFt: null };
  if (row.type === 'fly') {
    out.targets = mergeTargets(mem.targets, row, now);
    if (out.spin) out = say(out, `Step ${i + 1}: still spinning; only a Spin recovery step stops it`);
  } else if (row.type === 'recover') {
    if (!out.spin) return startRow(now, say(out, `Step ${i + 1}: not spinning, so there is nothing to recover from`), i + 1);
    out.spin = { ...out.spin, phase: 'recovery', deg: 0 };
  } else if (row.type === 'spin' && out.spin) {
    out.spin = { ...out.spin, deg: 0 }; // already spinning: this many more turns
  } else if (row.type === 'spin') {
    out.targets = { ...out.targets, power: STEP_PILOT.spinEntryPower };
  }
  return out;
}

/** The row's settings laid over the targets carried from before (what a row leaves out carries on as it was). */
function mergeTargets(prev, row, now) {
  const t = { ...prev, hold: { ...prev.hold } };
  if (row.power) t.power = row.power.kind === 'idle' ? 0 : row.power.kind === 'max' ? 1 : row.power.pct / 100;
  if (row.roll) {
    t.roll = row.roll.kind === 'nearest' ? { kind: 'nearest', side: now.bankDeg > 0 ? 1 : now.bankDeg < 0 ? -1 : STEP_PILOT.nearestHorizonSideWhenLevel }
      : { kind: 'bank', bankDeg: row.roll.kind === 'level' ? 0 : row.roll.bankDeg };
    delete t.hold.headingDegT; // a new roll replaces a heading held before
  }
  if (row.pitch) {
    t.pitch = { kind: 'attitude', deg: row.pitch.kind === 'horizon' ? 0 : row.pitch.deg };
    delete t.hold.level; // a new pitch replaces a height held before
  }
  if (row.hold?.kind === 'level') t.hold.level = true;
  if (row.hold?.kind === 'heading') t.hold.headingDegT = wrapDeg360(row.hold.headingDegM + now.magVarDegE);
  return t;
}

const bankOff = (now, deg) => Math.abs(wrapDeg180(now.bankDeg - deg));

/** Whether the roll target is reached now. "The nearest horizon" is reached once the nose is at or below the horizon, or the bank is there. */
function rollReached(now, roll) {
  if (roll.kind === 'hold') return true;
  const want = roll.kind === 'nearest' ? roll.side * STEP_PILOT.nearestHorizonBankDeg : roll.bankDeg;
  if (roll.kind === 'nearest' && now.pitchDeg <= 0) return true;
  return bankOff(now, want) <= STEP_PILOT.bankTolDeg && Math.abs(now.rollRateDps) < STEP_PILOT.rollRateTolDps;
}
const pitchReached = (now, pitch) => pitch.kind === 'g' || Math.abs(now.pitchDeg - pitch.deg) <= STEP_PILOT.pitchTolDeg;
const levelReached = (now, mem) => Math.abs(now.altFt - (mem.holdAltFt ?? now.altFt)) <= STEP_PILOT.altTolFt && Math.abs(now.gammaRad) <= STEP_PILOT.levelPathTolDeg * DEG;
const headingReached = (now, hdgT) => Math.abs(wrapDeg180(now.headingDegT - hdgT)) <= STEP_PILOT.headingTolDeg;

/** "Done": every target being flown is reached at once (the row's own and those carried into it). */
function allReached(now, mem) {
  const t = mem.targets;
  return rollReached(now, t.roll) && pitchReached(now, t.pitch)
    && (!t.hold.level || levelReached(now, mem)) && (t.hold.headingDegT === undefined || headingReached(now, t.hold.headingDegT));
}

/** Crossed a value since the row began: the sign of the difference has changed (or it is on it). */
const crossed = (d, d0, tol) => Math.abs(d) <= tol || d0 === 0 || Math.sign(d) !== Math.sign(d0);

/** Whether the row's "until" has come (`done` is the targets' test, given). */
function untilCame(now, mem, row, done) {
  const u = row.until ?? { kind: 'done' };
  const r0 = mem.row0;
  if (u.kind === 'seconds') return now.clockS - mem.rowT0 >= u.value - 1e-9;
  if (u.kind === 'kias') return crossed(now.kias - u.value, r0.kias - u.value, 0.5);
  if (u.kind === 'altFt') return crossed(now.altFt - u.value, r0.altFt - u.value, 10);
  if (u.kind === 'headingDegM') {
    const hdgT = wrapDeg360(u.value + now.magVarDegE);
    const d = wrapDeg180(hdgT - now.headingDegT);
    const d0 = wrapDeg180(hdgT - r0.headingDegT);
    return Math.abs(d) <= 1 || (Math.abs(d) < 90 && Math.sign(d) !== Math.sign(d0));
  }
  return done;
}

/** The row over: its cap (60 s with no end), or its "until". Returns the memory with the next row started, or the same memory. */
function nextIfOver(now, mem, done) {
  const row = mem.rows[mem.i];
  if (!row) return mem;
  const el = now.clockS - mem.rowT0;
  if (untilCame(now, mem, row, done)) return startRow(now, mem, mem.i + 1);
  const seconds = row.until?.kind === 'seconds';
  if (!seconds && el >= STEP_PILOT.rowCapS - 1e-9) {
    const why = row.type === 'spin' ? 'the wing never stalled, so it did not spin' : `${untilWords(row.until).replace(/^until /, '')} never came`;
    return startRow(now, say(mem, `Step ${mem.i + 1} stopped after ${STEP_PILOT.rowCapS} s: ${why} (${STEP_PILOT.rowCapS} s, an estimate)`), mem.i + 1);
  }
  return mem;
}

/** The G a row's pilot asks for to bring the flight path onto `gammaTarget` at this bank, kept to the pull's span (`maxG`). */
function pitchLawG(now, gammaTarget, maxG) {
  const gPath = dampedClimbG(now.gammaRad, gammaTarget, now.vFtps, STEP_PILOT.pitchOmega);
  const c = Math.cos(now.bankDeg * DEG);
  const cc = Math.abs(c) < STEP_PILOT.cosBankFloor ? (c < 0 ? -STEP_PILOT.cosBankFloor : STEP_PILOT.cosBankFloor) : c;
  return clamp(gPath / cc, STEP_PILOT.pullMinG, Math.max(STEP_PILOT.pullMinG, maxG));
}
/** A row's pull: in the stick shaker, never past 5 G (STEP_PILOT.pullMaxG). */
const shakerPull = (now) => shakerG(now.kias, { stallKias: now.stallKias, maxG: /** @type {any} */ (STEP_PILOT.pullMaxG) });

/** The flight path that brings the nose onto attitude `deg`: the path now plus the attitude still to go. */
const pathForAttitude = (now, deg) => now.gammaRad + (deg - now.pitchDeg) * DEG;

/**
 * One step of the step builder's pilot (flight.js calls it every 0.05 s while the aircraft is not spinning). `now` is flight.js's
 * (manoeuvres.js's `now`, with pitchDeg, rollRateDps, g, throttle and clockS). Returns { bankDeg, g, throttle, mem, spinStart } where g is
 * what the pilot asks for (flight.js caps it at the wing's) and spinStart is set when a spin row's entry reaches the stall.
 */
export function flySetup(now, mem0) {
  let mem = mem0;
  // A row that is over hands on to the next (at most one hand-on per row per step, so a row ending at once can't loop).
  for (let k = 0; k <= mem0.rows.length && mem.i >= 0; k++) {
    const row = mem.rows[mem.i];
    if (row.type === 'spin') break; // a spin row's entry is checked below
    const was = mem.i;
    mem = nextIfOver(now, mem, allReached(now, mem));
    if (mem.i === was) break;
  }
  const row = mem.i >= 0 ? mem.rows[mem.i] : null;

  // A spin row: first the wing to the stall (power idle, wings level, nose up, pulling to what the wing gives), then the set-piece.
  if (row?.type === 'spin') {
    if (now.kias <= now.stallKias) return { bankDeg: 0, g: now.g, throttle: mem.targets.power, mem, spinStart: { dir: row.dir === 'left' ? -1 : 1 } };
    const capped = nextIfOver(now, mem, false);
    if (capped !== mem) return flySetup(now, capped);
    const g = pitchLawG(now, pathForAttitude(now, STEP_PILOT.spinEntryNoseDeg), stallLimitG(now.kias, now.stallKias));
    return { bankDeg: 0, g, throttle: mem.targets.power, mem, spinStart: null };
  }

  const t = mem.targets;
  // Lateral: the roll target; a heading held takes over once the roll is reached (or when there is no roll to fly).
  let latched = mem.latched;
  if (!latched.roll && rollReached(now, t.roll)) latched = { ...latched, roll: true };
  let targets = t;
  // "The nearest horizon", once reached, holds the bank it has (carried on to the rows after it as that bank).
  if (t.roll.kind === 'nearest' && latched.roll) targets = { ...targets, roll: { kind: 'hold', bankDeg: now.bankDeg } };
  let bankDeg;
  if (targets.hold.headingDegT !== undefined && latched.roll) {
    const most = targets.roll.kind === 'bank' && Math.abs(targets.roll.bankDeg) > 0 ? Math.abs(targets.roll.bankDeg) : STEP_PILOT.holdHeadingBankDeg;
    bankDeg = bankToward(now, targets.hold.headingDegT, /** @type {any} */ (most));
  } else if (targets.roll.kind === 'nearest') {
    bankDeg = targets.roll.side * STEP_PILOT.nearestHorizonBankDeg;
  } else {
    bankDeg = targets.roll.bankDeg;
  }

  // Vertical: the attitude target; a height held takes over once the attitude is reached (or when the G is simply held).
  if (!latched.pitch && pitchReached(now, targets.pitch)) latched = { ...latched, pitch: true };
  let holdAltFt = mem.holdAltFt;
  let g;
  if (targets.hold.level && latched.pitch) {
    holdAltFt ??= now.altFt;
    g = pitchLawG(now, heightPathRad(now, holdAltFt, PILOT.maxHoldFpm), shakerPull(now));
  } else if (targets.pitch.kind === 'attitude') {
    g = pitchLawG(now, pathForAttitude(now, targets.pitch.deg), shakerPull(now));
  } else {
    g = targets.pitch.g; // the G held: the wing may not give it (flight.js caps it and says the stall)
  }
  return { bankDeg, g, throttle: targets.power, mem: { ...mem, targets, latched, holdAltFt }, spinStart: null };
}

/**
 * The rows while the aircraft spins (flight.js's set-piece calls it every step with how far the spin turned, degrees). A spin row ends
 * after its turns; a recovery row turns SPIN.recoveryTurns more, then `exit` (flight.js puts the aircraft in the dive and the recovery row
 * flies the pull-out on the point mass: wings level, the nose to the horizon); any other row can't be flown while spinning, so the spin
 * goes on until its "until" or its cap. With no row (Carry on, or the rows over) the spin goes on. Returns { mem, exit }.
 */
export function spinRows(now, mem0, turnedDeg) {
  let mem = { ...mem0, spin: { ...mem0.spin, deg: mem0.spin.deg + turnedDeg } };
  const row = mem.i >= 0 ? mem.rows[mem.i] : null;
  if (!row) return { mem, exit: false };
  if (row.type === 'spin') {
    if (mem.spin.deg >= row.turns * 360 - 1e-6) mem = startRow(now, mem, mem.i + 1);
    return { mem, exit: false };
  }
  if (row.type === 'recover') return { mem, exit: mem.spin.deg >= SPIN.recoveryTurns * 360 - 1e-6 };
  return { mem: nextIfOver(now, mem, false), exit: false };
}

/** The pilot memory once the recovery has left the spin: the pull-out's targets (wings level, the nose to the horizon, the power as it was). */
export function recoveredMemory(mem) {
  return { ...mem, spin: null, recovered: true, latched: {}, targets: { ...mem.targets, roll: { kind: 'bank', bankDeg: 0 }, pitch: { kind: 'attitude', deg: 0 }, hold: {} } };
}

/** What the step builder is flying now, in words (the console): the row, the spin, or the controls held. */
export function setupWords(mem) {
  if (!mem) return '';
  if (mem.spin) return mem.spin.phase === 'recovery' ? 'Recovering from the spin (set-piece, estimate numbers)' : `Spinning ${mem.spin.dir < 0 ? 'left' : 'right'} (set-piece, estimate numbers)`;
  const row = mem.i >= 0 ? mem.rows[mem.i] : null;
  if (!row) return 'Controls held: the G, bank and power as they were';
  const lead = `Step ${mem.i + 1} of ${mem.rows.length}: ${rowWords(row)}`;
  if (row.type === 'spin') return `${lead} (flying the wing to the stall first)`;
  if (row.type === 'recover') return `${lead} (the dive pull-out)`;
  return lead;
}
