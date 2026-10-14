// The Formation smoothness gauge (Formation plan Step 12.1b; Patrick's yes, 12 Oct 2026). A measuring script, not a test:
// it flies a fixed set of 2-ship presses from the default start, headless, through the real session (live/formation.js),
// and prints for each aircraft what a pilot would see as rough: roll reversals, peak roll acceleration, the G range and
// the fastest G change, G reversals, the drawn aircraft's biggest one-step turn (the 3D view's attitude), and the least
// range to the aircraft he flies off. It compares against the stored baseline and writes each run's traces for the
// flight-data plot page (tools/flight-plot/).
//
//   node tools/formation-gauge.mjs            run, compare with tools/formation-gauge/baseline.json
//   node tools/formation-gauge.mjs --save     run and store the results as the new baseline
//   node tools/formation-gauge.mjs --only fluid-loop   one scenario (any part of its name)
//   node tools/formation-gauge.mjs --only echelon-hold --nudge   the echelon hold with #2 put 3 ft above his place in the
//                                                              set-up: the known-bad case that shows the comparison working
//
// Traces: tmp/gauge/<scenario>.json and tmp/gauge/index.json (tmp/ is not in git). The thresholds that count a reversal
// are estimates, chosen to ignore numerical noise; they are not rules for the flight code.
//
// The close-formation wingman (B1, spec 7b.6d item 10): in a scenario marked `close`, each wingman flying off Lead also gets
// his deviation from his place on the three axes he corrects on (spec 7b.3, Patrick's plane, line, hinge): off Lead's wing
// plane (+ above), off the spinner-to-wingtip line in that plane (+ ahead of it) and along the line (+ out, away from Lead),
// the largest and the typical (root mean square); the settle time (from the press until he stays within SETTLE_FT on every
// axis); the most bank and G off Lead's; his torque's range and reversals; and the lag of his roll start behind Lead's.
// Lead's frame is his velocity and body up (fluid-lead.js leadStateOf), his place the slot table's (slots.js pairSlot).
//
// B3 (plan 12.4, T15; spec 7c): the scenarios named b3-… fly route, line astern and the changes between the close
// formations with Live; each press is measured against the place it ends in, and adds how far forward #2 came (+ ahead of
// Lead's 3/9 line) and for how long, and his fastest move against Lead (the pace, spec 7c.4). The least range to Lead is
// the line above it. `--only b3-` runs them alone (and with --save stores only them).
import { performance } from 'node:perf_hooks';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createFormation } from '../src/modules/turn-sim/live/formation.js';
import { STEP_SEC, liftBankDeg } from '../src/modules/turn-sim/live/flight.js';
import { drawnAttitudeOf, drawnTurnDeg } from '../src/modules/turn-sim/live/attitude.js';
import { leadStateOf } from '../src/modules/turn-sim/live/fluid-lead.js';
import { pairSlot } from '../src/modules/turn-sim/live/slots.js';
import { seenOf, placeDeviation, frameOf } from '../src/modules/turn-sim/live/wingman/perception.js';
import { torqueFromThrottle } from '../src/modules/turn-sim/live/wingman/close-formation.js';
import { setCloseBank, DEFAULT_CLOSE_BANK_DEG } from '../src/modules/turn-sim/live/tuning.js';
import { relativeTo } from '../src/modules/turn-sim/live/manoeuvres.js';
import { setFwAnalysis } from '../src/modules/turn-sim/live/wingman/fighting-wing.js';

const ROLL_REVERSAL_DPS = 10; // a roll counts once it is faster than this either way (estimate)
const G_REVERSAL_GPS = 0.3; // a G change counts once it is faster than this either way (estimate)
const SETTLE_FT = 1; // settled: within about 1 ft of his place on every axis (spec 7b.7 item 1, "within about 1 ft", an estimate)
const TORQUE_REVERSAL_PCTPS = 1; // a torque change counts once it is faster than 1 %/s either way (estimate, ignores noise)
const ROLL_START_DPS = 1; // a roll has started once it is faster than 1°/s (estimate)
const NUDGE_FT = 3; // --nudge: #2 put this far above his place at the end of the set-up (the T1 known-bad case)
const BASELINE = 'tools/formation-gauge/baseline.json';
const TRACES = 'tmp/gauge';

const args = process.argv.slice(2);
const save = args.includes('--save');
const nudge = args.includes('--nudge');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
// B5: which law flies #2 in Lead's fighting wing moves in the b5- scenarios: 'law' (today's fw-live.js, the baseline's
// and the known-bad case) or 'live' (the live wingman's fighting wing technique, spec 7e). --fw live flies the new one
// against the baseline.
const fwArg = args.includes('--fw') ? args[args.indexOf('--fw') + 1] : 'law';
// --tag name: the traces are written as <scenario>.<name>.json and added to the plot page's list beside the others, so
// two runs (today's law and the live technique, say) can be opened side by side on tools/flight-plot/.
const tag = args.includes('--tag') ? args[args.indexOf('--tag') + 1] : null;
// Plan T29m part 2 (analysis only; the control model's delay sweeps): --extra-delay s adds a delay #2 does not know he has to
// what he sees in fighting wing (in place of editing FW_SEE.extraDelaySec); --delay-mode picture reads his own position and
// velocity from the picture as late as Lead's (D-Picture; 'lead', the default, is the 0.4 s on Lead only, Patrick 14 Oct
// 2026). Neither is set in flying. Tag such runs (--tag) so they never overwrite the plain traces.
const extraDelay = args.includes('--extra-delay') ? Number(args[args.indexOf('--extra-delay') + 1]) : 0;
const delayMode = args.includes('--delay-mode') ? args[args.indexOf('--delay-mode') + 1] : 'lead';
if (!['lead', 'picture'].includes(delayMode) || !(extraDelay >= 0)) throw new Error('--delay-mode lead|picture, --extra-delay seconds (0 or more)');
if (extraDelay || delayMode !== 'lead') setFwAnalysis({ extraDelaySec: extraDelay, delayMode });
if (save && nudge) throw new Error('--nudge is a known-bad case for checking the comparison: never --save it');

const wings = (a) => a.attitudeDeg ?? liftBankDeg(a.bankDeg ?? 0, a.nz ?? 1);
const steps = (sec) => Math.round(sec / STEP_SEC);

/** Flies until the change or move in hand is finished (or capSec). */
function settle(f, capSec = 300) {
  for (let i = 0; i < steps(capSec) && f.state.current; i++) f.step();
}

/**
 * The known-bad case (--nudge): #2 put NUDGE_FT above his place at the end of a set-up, and what flies him next with him:
 * what is left of his planned poses, or the live wingman's own aircraft (B1, B2).
 */
function nudgeTwo(f) {
  const w = f.state.aircraft[1];
  w.altAboveFt += NUDGE_FT;
  for (const seg of f.state.plans[w.id]?.segments ?? []) for (const pose of seg.poses ?? []) pose.alt += NUDGE_FT;
  const lw = f.state.liveWing;
  if (lw) f.state.liveWing = { ...lw, st: { ...lw.st, pm: { ...lw.st.pm, z: lw.st.pm.z + NUDGE_FT } } };
}

/**
 * B2 (plan 12.4, T9; spec 7b): the close turns in echelon with "#2 in close formation: Live", at a close-turn bank (the
 * default 60°, then 45°): the telegraphed turn into #2 and away (#2 is on Lead's right, so a right turn, dir -1, is into
 * him), then a Reversal and a Wings level pressed part way through a turn. Until B2's T11 the close turns still fly #2's
 * held poses (the live wingman holds only between presses).
 */
function echelonTurns(bankDeg) {
  const setup = (f) => {
    setCloseBank(bankDeg);
    f.change('echelon');
    settle(f);
    if (nudge) nudgeTwo(f);
  };
  return {
    name: `echelon-turns-${bankDeg}`, close: 'echelon', options: { closeWing: 'live' }, setup, after: () => setCloseBank(DEFAULT_CLOSE_BANK_DEG),
    presses: [
      { label: `Close turn ${bankDeg}° into #2${nudge ? ` (#2 nudged ${NUDGE_FT} ft up)` : ''}`, press: (f) => f.press('delayed90', -1), sec: 'done' },
      { label: 'Steady after it, 10 s', press: () => 'held', sec: 10 },
      { label: `Close turn ${bankDeg}° away from #2`, press: (f) => f.press('delayed90', 1), sec: 'done' },
      { label: 'Steady after it, 10 s', press: () => 'held', sec: 10 },
      { label: 'Close turn into #2, 8 s of it', press: (f) => f.press('delayed90', -1), sec: 8 },
      { label: 'Reversal mid-turn', press: (f) => f.pressClose('closeReversal'), sec: 'done' },
      { label: 'Close turn away, 8 s of it', press: (f) => f.press('delayed90', 1), sec: 8 },
      { label: 'Wings level mid-turn', press: (f) => f.pressClose('closeWingsLevel'), sec: 'done' },
      { label: 'Steady after it, 10 s', press: () => 'held', sec: 10 },
    ],
  };
}

/**
 * B3 (plan 12.4, T15; spec 7c): route, line astern, the corner and the changes between the close formations, all with "#2
 * in close formation: Live". #2 starts on Lead's right (the default start). Each press measures #2 against the place it
 * ends in (`close`, `side`: +1 left, -1 right, 0 line astern; a station change is measured against the new place from the
 * press). The set-up flies the first formation from the default start (a rejoin, the tracker's, handed over at its end).
 * --nudge puts #2 NUDGE_FT above his place at the end of the set-up, as for echelon (the known-bad case).
 */
function b3(name, first, presses) {
  const setup = (f) => {
    f.change(first.to, first.options ?? {});
    settle(f);
    if (nudge) nudgeTwo(f);
  };
  return { name: `b3-${name}`, b3: true, close: first.to, options: { closeWing: 'live' }, setup, presses };
}
const steady = (sec, close, side) => ({ label: `Steady after it, ${sec} s`, press: () => 'held', sec, close, side });
const B3 = [
  b3('route-hold', { to: 'route' }, [{ label: `Route hold, 60 s straight and level${nudge ? ` (#2 nudged ${NUDGE_FT} ft up)` : ''}`, press: () => 'held', sec: 60, close: 'route', side: -1 }]),
  b3('route-turns', { to: 'route' }, [
    { label: 'Close turn 60° into #2 in route', press: (f) => f.press('delayed90', -1), sec: 'done', close: 'route', side: -1 },
    steady(10, 'route', -1),
    { label: 'Close turn 60° away from #2 in route', press: (f) => f.press('delayed90', 1), sec: 'done', close: 'route', side: -1 },
    steady(10, 'route', -1),
  ]),
  b3('astern-hold-turn', { to: 'astern' }, [
    { label: 'Line astern hold, 30 s straight and level', press: () => 'held', sec: 30, close: 'astern', side: 0 },
    { label: 'Close turn 60° right in line astern', press: (f) => f.press('delayed90', -1), sec: 'done', close: 'astern', side: 0 },
    steady(10, 'astern', 0),
  ]),
  b3('echelon-route-echelon', { to: 'echelon' }, [
    { label: 'Echelon to route', press: (f) => f.change('route'), sec: 'done', close: 'route', side: -1 },
    steady(10, 'route', -1),
    { label: 'Route to echelon', press: (f) => f.change('echelon'), sec: 'done', close: 'echelon', side: -1 },
    steady(10, 'echelon', -1),
  ]),
  b3('echelon-astern-echelon', { to: 'echelon' }, [
    { label: 'Echelon to line astern', press: (f) => f.change('astern'), sec: 'done', close: 'astern', side: 0 },
    steady(10, 'astern', 0),
    { label: 'Line astern to echelon', press: (f) => f.change('echelon', { side: 'right' }), sec: 'done', close: 'echelon', side: -1 },
    steady(10, 'echelon', -1),
  ]),
  b3('station-change', { to: 'echelon' }, [
    { label: 'Echelon right to echelon left (the station change)', press: (f) => f.change('echelon', { side: 'left' }), sec: 'done', close: 'echelon', side: 1 },
    steady(10, 'echelon', 1),
  ]),
  b3('route-route', { to: 'route' }, [
    { label: 'Route right to route left', press: (f) => f.change('route', { side: 'left' }), sec: 'done', close: 'route', side: 1 },
    steady(10, 'route', 1),
  ]),
];

/**
 * B5 (plan 12.4, T27; spec 7e.11): fighting wing. From the default start the set-up changes to fighting wing (the turning
 * rejoin) and lets #2 settle in the cone; `at` then puts #2 where the case needs him, at his own height and speed, keeping
 * his bearing from Lead: in position (as the rejoin leaves him), stretched (950 ft), tight (520 ft) or outside the cone
 * (1,300 ft) (estimates for the manual's in position, stretched and tight, SMM 12.29 Figs 12.20-12.22). #2 starts on Lead's
 * right, so a turn right (dir -1) is into him. Each turn is held 30 s, then Wings level and 30 s more. The fighting wing
 * measures (fwTally) are kept for every press.
 */
function b5(name, at, presses, first = 'fw') {
  const setup = (f) => {
    f.change(first);
    settle(f);
    if (at && typeof at === 'object' && at.abeamFt) {
      // T29m part 2: #2 abeam Lead, on the side he is on, at abeamFt, his height, heading and speed kept (Patrick 14 Oct
      // 2026: "if h's abeam 1 and lead turns towards him h just matches his bank? ... which is wrong"; a measuring case).
      // 5 s more in the cone first, as the scratch probe that found the 20° flew it (straight after the rejoin the press is refused)
      for (let i = 0; i < steps(5); i++) f.step();
      const [L, two] = f.state.aircraft;
      const nx = Math.cos(L.headingRad);
      const ny = Math.sin(L.headingRad);
      const left = Math.sign(-ny * (two.xFt - L.xFt) + nx * (two.yFt - L.yFt)) || -1; // + left of Lead's path
      // sweepDeg back from Lead's wing line: truly abeam (0-15° at 625 ft) the formation reads "other", not fighting wing,
      // and refuses the turn press, so the case sits at the most forward sweep it accepts (20°, found 14 Oct 2026)
      const a = ((at.sweepDeg ?? 0) * Math.PI) / 180;
      two.xFt = L.xFt - nx * at.abeamFt * Math.sin(a) - ny * left * at.abeamFt * Math.cos(a);
      two.yFt = L.yFt - ny * at.abeamFt * Math.sin(a) + nx * left * at.abeamFt * Math.cos(a);
    } else if (at) {
      const [L, two] = f.state.aircraft;
      const dx = two.xFt - L.xFt;
      const dy = two.yFt - L.yFt;
      const k = at / Math.hypot(dx, dy);
      two.xFt = L.xFt + dx * k;
      two.yFt = L.yFt + dy * k;
    }
  };
  return { name: `b5-${name}`, b5: true, options: { fwWing: fwArg }, setup, presses };
}
const wingsLevel = { label: 'Wings level, 30 s', press: (f) => f.pressFw('wingsLevel'), sec: 30 };
const turnFw = (dir, label, sec = 30) => ({ label, press: (f) => f.pressFw('levelTurn', dir), sec });
const B5 = [
  b5('into-in-position', null, [turnFw(-1, 'Level turn into #2, in position, 30 s'), wingsLevel]),
  b5('away-in-position', null, [turnFw(1, 'Level turn away from #2, in position, 30 s'), wingsLevel]),
  b5('into-90', null, [turnFw(-1, 'Level turn ~90° into #2 (12 s)', 12), wingsLevel]),
  b5('away-90', null, [turnFw(1, 'Level turn ~90° away from #2 (12 s)', 12), wingsLevel]),
  b5('into-180', null, [turnFw(-1, 'Level turn ~180° into #2 (22 s)', 22), wingsLevel]),
  b5('away-180', null, [turnFw(1, 'Level turn ~180° away from #2 (22 s)', 22), wingsLevel]),
  b5('into-stretched', 950, [turnFw(-1, 'Level turn into #2, stretched (950 ft), 30 s'), wingsLevel]),
  b5('away-stretched', 950, [turnFw(1, 'Level turn away from #2, stretched (950 ft), 30 s'), wingsLevel]),
  b5('into-tight', 520, [turnFw(-1, 'Level turn into #2, tight (520 ft), 30 s'), wingsLevel]),
  b5('away-tight', 520, [turnFw(1, 'Level turn away from #2, tight (520 ft), 30 s'), wingsLevel]),
  b5('reversal-mid-entry', null, [
    { label: 'Level turn away from #2, 3 s of it', press: (f) => f.pressFw('levelTurn', 1), sec: 3 },
    { label: 'Reversal mid-entry (now into #2), 30 s', press: (f) => f.pressFw('reversal'), sec: 30 },
    wingsLevel,
  ]),
  b5('climb', null, [{ label: 'Straight climb, 40 s', press: (f) => f.pressFw('climb'), sec: 40 }, { label: 'Descend, 40 s', press: (f) => f.pressFw('descend'), sec: 40 }]),
  b5('turn-button', null, [{ label: 'Turn button: 90° into #2 in fighting wing', press: (f) => f.press('delayed90', -1), sec: 'done' }]),
  // T29m part 2: abeam Lead (625 ft, the swept place's range, Patrick 14 Oct 2026; abeam an estimate of his "abeam 1")
  // with Lead turning into him: today's known-bad baseline (he matches Lead's bank; the thread's reading of the technique:
  // lag pursuit toward Lead's tail, the miss, then reverse and capture). A measuring case, not a flying change.
  b5('into-abeam', { abeamFt: 625, sweepDeg: 20 }, [turnFw(-1, 'Level turn into #2 from nearly abeam (625 ft, 20° swept), 30 s'), wingsLevel]),
  b5('outside-cone', 1300, [turnFw(-1, 'Level turn into #2 from outside the cone (1,300 ft), 30 s'), wingsLevel]),
  b5('echelon-to-fw', null, [{ label: 'Echelon to fighting wing', press: (f) => f.change('fw'), sec: 'done' }], 'echelon'),
];

/**
 * The press set, 2-ship (Formation plan 12.1b). Each scenario: a set-up flown first and not measured, then the measured
 * presses, each { label, press(f) -> 'started' | ..., sec } where sec is how long it is measured (a settle when 'done').
 */
const SCENARIOS = [
  { name: 'lab-to-fw', setup: () => {}, presses: [{ label: 'Change to fighting wing (turning rejoin)', press: (f) => f.change('fw'), sec: 'done' }] },
  {
    name: 'fw-moves', setup: (f) => { f.change('fw'); settle(f); },
    presses: [
      { label: 'Level turn into #2', press: (f) => f.pressFw('levelTurn', -1), sec: 25 },
      { label: 'Reversal', press: (f) => f.pressFw('reversal'), sec: 25 },
      { label: 'Wings level', press: (f) => f.pressFw('wingsLevel'), sec: 30 },
    ],
  },
  { name: 'fw-to-echelon', setup: (f) => { f.change('fw'); settle(f); }, presses: [{ label: 'Fighting wing to echelon', press: (f) => f.change('echelon'), sec: 'done' }] },
  { name: 'echelon-to-lab', setup: (f) => { f.change('echelon'); settle(f); }, presses: [{ label: 'Echelon to line abreast', press: (f) => f.change('lab'), sec: 'done' }] },
  { name: 'sarj-echelon', setup: () => {}, presses: [{ label: 'Straight-ahead rejoin to echelon', press: (f) => f.change('echelon', { rejoin: 'straight' }), sec: 'done' }] },
  { name: 'trj-echelon', setup: () => {}, presses: [{ label: 'Turning rejoin to echelon', press: (f) => f.change('echelon'), sec: 'done' }] },
  { name: 'echelon-close-turn', setup: (f) => { f.change('echelon'); settle(f); }, presses: [{ label: 'Close turn in echelon (telegraphed)', press: (f) => f.press('delayed90', 1), sec: 'done' }] },
  // B1 (plan 12.4, T1; spec 7b.10): from the default start change to echelon, then 60 s straight and level, long enough to
  // show any hunting. No press: Lead flies straight on and #2 holds.
  {
    name: 'echelon-hold', close: 'echelon',
    setup: (f) => {
      f.change('echelon');
      settle(f);
      // The nudge moves #2 and what is left of his planned poses (the change ends in band about 2 s before its held poses
      // run out, and those would put him back), so it holds whatever flies him next.
      if (nudge) nudgeTwo(f);
    },
    presses: [{ label: `Echelon hold, 60 s straight and level${nudge ? ` (#2 nudged ${NUDGE_FT} ft up)` : ''}`, press: () => 'held', sec: 60 }],
  },
  echelonTurns(60),
  echelonTurns(45),
  {
    name: 'fluid-loop', setup: (f) => { f.change('fw'); settle(f); },
    presses: [
      { label: 'Fluid entry', press: (f) => f.change('fluid'), sec: 40 },
      { label: 'Loop', press: (f) => f.pressFluid('loop'), sec: 60 },
    ],
  },
  { name: 'fluid-sequence-L', setup: (f) => { f.change('fw'); settle(f); f.change('fluid'); settle(f, 40); }, presses: [{ label: 'Standard sequence L', press: (f) => f.pressFluid('sequence', 1), sec: 160 }] },
  { name: 'fluid-sequence-R', setup: (f) => { f.change('fw'); settle(f); f.change('fluid'); settle(f, 40); }, presses: [{ label: 'Standard sequence R', press: (f) => f.pressFluid('sequence', -1), sec: 160 }] },
  {
    name: 'fluid-terminate', setup: (f) => { f.change('fw'); settle(f); f.change('fluid'); settle(f, 40); },
    presses: [
      { label: 'Level turn left', press: (f) => f.pressFluid('levelTurn', 1), sec: 15 },
      { label: 'Terminate', press: (f) => f.pressFluid('terminate'), sec: 40 },
    ],
  },
  ...B3,
  ...B5,
];

// ---- B5: the fighting wing measures (spec 7e.11) --------------------------------------------------------------------
// G and roll reversals for fighting wing are counted on smoothed rates (a pilot sees the trend, not a step's twitch): the
// G and the roll rate each smoothed first-order over FW_SMOOTH_SEC, then a reversal is the smoothed G rate changing sign
// while faster than G_REVERSAL_GPS (0.3 G/s), or the smoothed roll rate changing sign while faster than ROLL_REVERSAL_DPS
// (10°/s), as the raw counts above. All estimates, chosen to ignore numerical noise.
const FW_SMOOTH_SEC = 0.5;

/** An aircraft's velocity (ft/s; x east, y north, z up) from its heading, true speed and climb. */
function velOf(a) {
  const v = a.tasFtps ?? 0;
  const vz = a.climbFtps ?? 0;
  const vh = Math.sqrt(Math.max(0, v * v - vz * vz));
  return { x: vh * Math.cos(a.headingRad), y: vh * Math.sin(a.headingRad), z: vz };
}
const dot3v = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const len3v = (a) => Math.sqrt(dot3v(a, a));
const angDeg = (a, b) => (Math.acos(Math.max(-1, Math.min(1, dot3v(a, b) / Math.max(len3v(a) * len3v(b), 1e-9)))) * 180) / Math.PI;

/**
 * The fighting wing picture of #2 against Lead, as a pilot names it (SMM 12.2 paras 5-9; 16.16 para 40b): slant and
 * horizontal range, closure (+ closing), aspect (0° at Lead's tail), HCA (between the two flight paths), the line of sight
 * (the direction from #2 to Lead, 3D unit), sweep (back from Lead's wing line, level), height and speed against Lead.
 */
function fwPicture(lead, two, prevPic) {
  const r = { x: two.xFt - lead.xFt, y: two.yFt - lead.yFt, z: (two.altAboveFt ?? 0) - (lead.altAboveFt ?? 0) };
  const slant = len3v(r);
  const vL = velOf(lead);
  const vW = velOf(two);
  const los = { x: -r.x / slant, y: -r.y / slant, z: -r.z / slant };
  const rel = relativeTo(lead, two);
  return {
    slant,
    horiz: Math.hypot(r.x, r.y),
    closure: prevPic ? (prevPic.slant - slant) / STEP_SEC : 0,
    aspect: angDeg({ x: -vL.x, y: -vL.y, z: -vL.z }, r),
    hca: angDeg(vL, vW),
    losDps: prevPic ? angDeg(prevPic.los, los) / STEP_SEC : 0,
    los,
    sweep: (Math.atan2(-rel.fwd, Math.abs(rel.left)) * 180) / Math.PI,
    height: r.z,
    dKias: (two.kias ?? 0) - (lead.kias ?? 0),
  };
}

function fwTally() {
  return {
    slantMin: Infinity, horizMin: Infinity, in500: 0, in600: 0, gMax: -Infinity, rollMax: 0,
    gS: null, gRateS: 0, lastGRateS: 0, gRev: 0, rollS: null, lastRollS: 0, rollRev: 0,
    pic: null, aimLast: null, aimSwitches: 0, jobLast: null, jobSwitches: 0,
    // T29m part 2: what a pilot would call over-control and lost energy (Patrick 14 Oct 2026, his first flight of Live), and
    // the controllers' counts (the control model's switching map and resource matrix)
    n: 0, onsetMax: 0, onsetFast: 0, aimJumps: 0, aimTurnMax: 0, wrongWay: 0, overLead: 0, low: 0, lowest: Infinity,
    tqLast: null, tqExt: null, tqDir: 0, tqSwings: 0, gExcess: 0, kias0: null, leadKias0: null,
    filterActs: 0, engaged: 0, guardOn: 0, last: {}, changes: {}, holds: {}, limits: {},
  };
}

// T29m part 2 thresholds (estimates, chosen as a pilot would call them; measures, never rules in the flight code):
const ONSET_FAST_GPS = 1; // a smoothed G onset faster than 1 G/s counts as fast (Lead's own academic roll-in builds about 1 G in 1-2 s)
const AIM_JUMP_FT = 25; // the aim moving more than 25 ft against Lead in one 0.05 s step (500 ft/s) counts as a jump
const WRONG_WAY_DEG = 30; // a wrong-way roll: his bank 30° or more the other way from Lead's while Lead is banked 30° or more (T29t review F7)
const OVER_LEAD_G = 0.5; // time over Lead's G + 0.5 (review F7; the shared margin's 0.5 G)
const LOW_FT = -150; // too low: more than 100 ft below his 50 ft stack (stack, Patrick 14 Oct 2026; 100 ft an estimate)
const TQ_SWING_PCT = 30; // a torque reversal: a swing of 30 points or more before the torque turns back (review F7)
const CTL_KEYS = ['steerAngleDeg', 'steerPG', 'steerFfG', 'aimTurnDps', 'aimTurnRawDps', 'aimJumpFt', 'turnAskG', 'turnFlownG', 'turnGrantedG', 'turnWinner', 'capG', 'capBind', 'urp', 'arcDssFt', 'arcFfFt', 'arcKcFt', 'arcWantFt', 'arcLimit', 'vertErrFt', 'vertRateFtps', 'vertPG', 'vertDG', 'vertG', 'vertLimit', 'powerKind', 'powerPFtps', 'powerIFtps', 'powerBandClip', 'guardOn', 'filterOn', 'filterEngaged', 'leadG'];
const CTL_COL = (k) => `fw${k[0].toUpperCase()}${k.slice(1)}`;
const SWITCH_KEYS = ['turnWinner', 'pitchOwner', 'powerKind', 'guardOn', 'filterOn', 'filterEngaged', 'job', 'fwLow', 'brakes'];
const LIMIT_KEYS = ['arcLimit', 'vertLimit', 'capBind', 'powerBandClip', 'urp'];

/** T29m part 2: one step of the fault measures and the controllers' counts. */
function fwFaults(c, lead, two, pic, lt, gRateS) {
  c.n++;
  c.onsetMax = Math.max(c.onsetMax, Math.abs(gRateS));
  if (Math.abs(gRateS) > ONSET_FAST_GPS) c.onsetFast += STEP_SEC;
  if (lt?.ctl) {
    if (lt.ctl.aimJumpFt > AIM_JUMP_FT) c.aimJumps++;
    c.aimTurnMax = Math.max(c.aimTurnMax, lt.ctl.aimTurnRawDps ?? 0);
    if (lt.ctl.filterOn) c.filterActs += STEP_SEC;
    if (lt.ctl.filterEngaged) c.engaged += STEP_SEC;
    if (lt.ctl.guardOn) c.guardOn += STEP_SEC;
  }
  const bL = lead.bankDeg ?? 0;
  const b2 = two.bankDeg ?? 0;
  if (Math.abs(bL) >= WRONG_WAY_DEG && Math.abs(b2) >= WRONG_WAY_DEG && Math.sign(bL) !== Math.sign(b2)) c.wrongWay += STEP_SEC;
  if (two.g > lead.g + OVER_LEAD_G) c.overLead += STEP_SEC;
  c.gExcess += Math.max(0, two.g - lead.g) * STEP_SEC;
  if (pic.height < LOW_FT) c.low += STEP_SEC;
  c.lowest = Math.min(c.lowest, pic.height);
  if (c.kias0 === null) { c.kias0 = two.kias ?? 0; c.leadKias0 = lead.kias ?? 0; }
  c.kiasEnd = two.kias ?? 0;
  c.leadKiasEnd = lead.kias ?? 0;
  const tq = torqueOf(two);
  if (tq !== null) {
    // turning points: a swing is from one turning point to the next; one of TQ_SWING_PCT or more that turns back counts
    if (c.tqTurn === undefined) { c.tqTurn = tq; c.tqExt = tq; c.tqDir = 0; }
    else if (!c.tqDir) { if (Math.abs(tq - c.tqTurn) > 1) { c.tqDir = Math.sign(tq - c.tqTurn); c.tqExt = tq; } }
    else if ((tq - c.tqExt) * c.tqDir > 0) c.tqExt = tq;
    else if (Math.abs(tq - c.tqExt) > 1) {
      if (Math.abs(c.tqExt - c.tqTurn) >= TQ_SWING_PCT) c.tqSwings++;
      c.tqTurn = c.tqExt;
      c.tqExt = tq;
      c.tqDir = -c.tqDir;
    }
  }
  const states = { ...(lt?.ctl ?? {}), pitchOwner: lt?.pitchOwner ?? null, job: lt?.job ?? null, fwLow: lt ? Boolean(lt.low) : null, brakes: lt?.brakes ?? null };
  for (const k of SWITCH_KEYS) {
    const v = states[k] ?? null;
    if (c.last[k] !== undefined && v !== c.last[k]) { c.changes[k] = (c.changes[k] ?? 0) + 1; (c.holds[k] ??= []).push(c.since?.[k] ?? 0); (c.since ??= {})[k] = 0; }
    c.since = c.since ?? {};
    c.since[k] = (c.since[k] ?? 0) + STEP_SEC;
    c.last[k] = v;
  }
  for (const k of LIMIT_KEYS) if (lt?.ctl?.[k]) c.limits[k] = (c.limits[k] ?? 0) + STEP_SEC;
}

/** One step of the fighting wing tally: #2 (two) against Lead; trace: his trace arrays (added to). */
function fwStep(c, lead, two, tr, liveTrace) {
  const pic = fwPicture(lead, two, c.pic);
  c.pic = pic;
  c.slantMin = Math.min(c.slantMin, pic.slant);
  c.horizMin = Math.min(c.horizMin, pic.horiz);
  if (pic.slant < 500) c.in500 += STEP_SEC;
  if (pic.slant < 600) c.in600 += STEP_SEC;
  c.gMax = Math.max(c.gMax, two.g);
  c.rollMax = Math.max(c.rollMax, Math.abs(two.rollRateDps ?? 0));
  const k = Math.min(1, STEP_SEC / FW_SMOOTH_SEC);
  const gPrev = c.gS;
  c.gS = gPrev === null ? two.g : gPrev + (two.g - gPrev) * k;
  const gRateS = gPrev === null ? 0 : (c.gS - gPrev) / STEP_SEC;
  if (Math.abs(gRateS) > G_REVERSAL_GPS) { if (c.lastGRateS && Math.sign(gRateS) !== Math.sign(c.lastGRateS)) c.gRev++; c.lastGRateS = gRateS; }
  const roll = two.rollRateDps ?? 0;
  c.rollS = c.rollS === null ? roll : c.rollS + (roll - c.rollS) * k;
  if (Math.abs(c.rollS) > ROLL_REVERSAL_DPS) { if (c.lastRollS && Math.sign(c.rollS) !== Math.sign(c.lastRollS)) c.rollRev++; c.lastRollS = c.rollS; }
  // The live technique's aim and job when it flies him (spec 7e; null under today's law, which has neither).
  const aim = liveTrace?.aim ?? null;
  const job = liveTrace?.job ?? null;
  if (aim !== c.aimLast && c.aimLast !== null && aim !== null) c.aimSwitches++;
  if (job !== c.jobLast && c.jobLast !== null && job !== null) c.jobSwitches++;
  c.aimLast = aim ?? c.aimLast;
  c.jobLast = job ?? c.jobLast;
  // Per step for the plot page's fighting wing charts (tools/flight-plot/): the picture, and the live technique's own
  // quantities when it flies him (null under today's law): the guard's predicted pass, the aim offset from Lead's circle,
  // the height target, the closure it wants against the closure it has, his torque.
  const lt = liveTrace;
  const r1 = (x) => (x === null || x === undefined ? null : +x.toFixed(1));
  const tq = torqueOf(two);
  for (const [key, v] of [
    ['slantFt', Math.round(pic.slant)], ['closureFtps', +pic.closure.toFixed(1)], ['aspectDeg', +pic.aspect.toFixed(1)], ['hcaDeg', +pic.hca.toFixed(1)],
    ['losDps', +pic.losDps.toFixed(2)], ['aim', aim], ['job', job], ['heightFt', Math.round(pic.height)],
    ['predFt', lt?.predFt ?? null], ['offFt', lt?.offFt ?? null], ['heightTargetFt', lt?.heightTargetFt ?? null],
    ['cWantFtps', r1(lt?.cWantFtps)], ['cActualFtps', r1(lt?.cActualFtps)], ['fwTorquePct', tq === null ? null : +tq.toFixed(1)],
    ['fwLow', lt ? (lt.low ? 1 : 0) : null], ['sFt', lt?.sFt ?? null], ['dFt', lt?.dFt ?? null], ['pitchOwner', lt?.pitchOwner ?? null], ['lineShort', lt ? (lt.lineShort ? 1 : 0) : null], ['passFt', lt?.passFt ?? null], ['yoyoFt', lt?.yoyoFt ?? null], ['omNomDps', r1(lt?.omNomDps)], ['omPickDps', r1(lt?.omPickDps)], ['fwBrakes', lt?.brakes ?? null],
    // T29m part 2: each controller's terms and asks (fighting-wing.js trace.ctl; T29r's trace half), and Lead's G as flown
    ...CTL_KEYS.map((k) => [CTL_COL(k), lt?.ctl ? (typeof lt.ctl[k] === 'boolean' ? (lt.ctl[k] ? 1 : 0) : (lt.ctl[k] ?? null)) : null]),
    ['fwLeadGFlown', +lead.g.toFixed(3)],
  ]) (tr[key] ??= []).push(v);
  fwFaults(c, lead, two, pic, lt, gRateS);
}

function fwResult(c, lead, two) {
  const r1 = (x) => +x.toFixed(1);
  const pic = c.pic ?? fwPicture(lead, two, null);
  return {
    slantMinFt: Math.round(c.slantMin), horizMinFt: Math.round(c.horizMin), in500Sec: r1(c.in500), in600Sec: r1(c.in600),
    gMax: +c.gMax.toFixed(2), rollMaxDps: Math.round(c.rollMax), gReversalsSmoothed: c.gRev, rollReversalsSmoothed: c.rollRev,
    aimSwitches: c.aimSwitches, jobSwitches: c.jobSwitches,
    end: { slantFt: Math.round(pic.slant), sweepDeg: r1(pic.sweep), heightFt: Math.round(pic.height), dKias: r1(pic.dKias) },
    // T29m part 2: Patrick's faults (14 Oct 2026) and the controllers' counts; null where only the live technique has it
    faults: {
      onsetMaxGps: r1(c.onsetMax), onsetFastSec: r1(c.onsetFast), gReversals: c.gRev, rollReversals: c.rollRev,
      aimJumps: c.n && c.aimTurnMax ? c.aimJumps : null, aimTurnMaxDps: c.aimTurnMax ? Math.round(c.aimTurnMax) : null,
      wrongWaySec: r1(c.wrongWay), overLeadSec: r1(c.overLead), torqueSwings: c.tqSwings,
      lowSec: r1(c.low), lowestFt: Number.isFinite(c.lowest) ? Math.round(c.lowest) : null,
      kiasLostVsLead: c.kias0 === null ? null : r1((c.kias0 - c.kiasEnd) - (c.leadKias0 - c.leadKiasEnd)), gExcessGs: r1(c.gExcess),
      filterShare: c.n ? +(c.filterActs / (c.n * STEP_SEC)).toFixed(2) : null, engagedShare: c.n ? +(c.engaged / (c.n * STEP_SEC)).toFixed(2) : null, guardShare: c.n ? +(c.guardOn / (c.n * STEP_SEC)).toFixed(2) : null,
    },
    counts: {
      changes: c.changes, meanHoldSec: Object.fromEntries(Object.entries(c.holds).map(([k, v]) => [k, r1(v.reduce((a, b) => a + b, 0) / v.length)])),
      limitSec: Object.fromEntries(Object.entries(c.limits).map(([k, v]) => [k, r1(v)])),
    },
  };
}

/** One aircraft's running numbers. */
function tally() {
  return { gMin: Infinity, gMax: -Infinity, gRateMax: 0, gReversals: 0, rollMax: 0, rollAccMax: 0, rollReversals: 0, drawnMax: 0, rangeMin: Infinity, lastRoll: 0, lastGRate: 0 };
}

const AXES = ['plane', 'line', 'along'];

/**
 * A close wingman's deviation from his place (feet) on his three axes, in Lead's frame from Lead's velocity and body up
 * (the wingman's own perception's geometry, live/wingman/perception.js, undelayed): plane (+ above Lead's wing plane), line
 * (+ ahead of the spinner-to-wingtip line), along (+ out along it, away from Lead). key: the close formation (slots.js);
 * side: #2's side (+1 left of Lead).
 */
function closeDeviation(lead, wing, key, side, blockFt) {
  // Line astern has no side: its place is on Lead's centreline, read on the axes of #2's last side (any side reads the same place).
  const s = side || -1;
  return placeDeviation(seenOf(leadStateOf(lead, blockFt)), seenOf(leadStateOf(wing, blockFt)), pairSlot(key, s), s);
}

/** Where a wingman is in Lead's frame (velocity and body up, as the wingman sees him): { fwd, left, up }, feet (B3). */
function relInLead(lead, wing, blockFt) {
  const L = seenOf(leadStateOf(lead, blockFt));
  const W = seenOf(leadStateOf(wing, blockFt));
  const f = frameOf(L);
  const r = { x: W.p.x - L.p.x, y: W.p.y - L.p.y, z: W.p.z - L.p.z };
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  return { fwd: dot(r, f.nose), left: dot(r, f.left), up: dot(r, f.up) };
}

/** An aircraft's torque (%) from its power (power.js, through the wingman's own conversion), or null with none set. */
function torqueOf(a) {
  const p = a.power;
  if (!p) return null;
  if (p.stage === 'idle' || p.stage === 'idleBoards') return 0;
  return Math.min(100, torqueFromThrottle(p.throttle, p.kias, p.altFt ?? 8000));
}

/** A close wingman's running numbers (the B1 measures above). */
function closeTally() {
  return {
    n: 0, max: { plane: 0, line: 0, along: 0 }, sq: { plane: 0, line: 0, along: 0 }, lastOut: null, outAtEnd: false,
    bankOffMax: 0, gOffMax: 0, tqMin: Infinity, tqMax: -Infinity, lastTq: null, lastTqRate: 0, tqReversals: 0,
    leadRollT: null, leadRollSign: 0, rollT: null,
    aheadMax: -Infinity, aheadSec: 0, paceMax: 0, lastRel: null, // B3: furthest forward of Lead's 3/9 line, time ahead of it, fastest move against Lead
  };
}

function runScenario(sc) {
  // Held unless the scenario says Live: the baseline's runs were flown Held, and Live is the app's default since TS-232 (14 Oct 2026).
  const f = createFormation({ ships: 2, closeWing: 'held', ...(sc.options ?? {}) });
  sc.setup(f);
  const results = [];
  const trace = { name: sc.name, stepSec: STEP_SEC, presses: [], aircraft: {} };
  const blockFt = f.options().blockFt;
  let t = 0;
  for (const p of sc.presses) {
    const t0 = performance.now();
    const how = p.press(f);
    const pressMs = performance.now() - t0;
    trace.presses.push({ t, label: p.label, how });
    const tPress = t;
    // The place he is measured against: the press's own (B3: the place a change ends in), else the scenario's, on his side now.
    const closeKey = p.close ?? sc.close;
    const closeSide = closeKey ? (p.side ?? f.where().side) : null;
    const closePer = new Map();
    const fwPer = new Map();
    const per = new Map();
    let prev = new Map(f.state.aircraft.map((a) => [a.id, { ...a }]));
    let stepMsMax = 0;
    const n = p.sec === 'done' ? steps(300) : steps(p.sec);
    for (let i = 0; i < n; i++) {
      if (p.sec === 'done' && !f.state.current) break;
      const s0 = performance.now();
      f.step();
      stepMsMax = Math.max(stepMsMax, performance.now() - s0);
      t += STEP_SEC;
      const byId = new Map(f.state.aircraft.map((a) => [a.id, a]));
      for (const a of f.state.aircraft) {
        const b = prev.get(a.id);
        if (!b) continue;
        const name = a.name ?? String(a.id);
        if (!per.has(name)) per.set(name, tally());
        const q = per.get(name);
        const gRate = (a.g - b.g) / STEP_SEC;
        const roll = a.rollRateDps ?? 0;
        const rollAcc = (roll - (b.rollRateDps ?? 0)) / STEP_SEC;
        const drawn = drawnTurnDeg(drawnAttitudeOf(b, wings(b)), drawnAttitudeOf(a, wings(a))) / STEP_SEC;
        q.gMin = Math.min(q.gMin, a.g);
        q.gMax = Math.max(q.gMax, a.g);
        q.gRateMax = Math.max(q.gRateMax, Math.abs(gRate));
        if (Math.abs(gRate) > G_REVERSAL_GPS) { if (q.lastGRate && Math.sign(gRate) !== Math.sign(q.lastGRate)) q.gReversals++; q.lastGRate = gRate; }
        q.rollMax = Math.max(q.rollMax, Math.abs(roll));
        q.rollAccMax = Math.max(q.rollAccMax, Math.abs(rollAcc));
        if (Math.abs(roll) > ROLL_REVERSAL_DPS) { if (q.lastRoll && Math.sign(roll) !== Math.sign(q.lastRoll)) q.rollReversals++; q.lastRoll = roll; }
        q.drawnMax = Math.max(q.drawnMax, drawn);
        const ref = byId.get(a.ref);
        let range = null;
        if (ref && ref !== a) {
          range = Math.hypot(a.xFt - ref.xFt, a.yFt - ref.yFt, (a.altAboveFt ?? 0) - (ref.altAboveFt ?? 0));
          q.rangeMin = Math.min(q.rangeMin, range);
        }
        const tr = (trace.aircraft[name] ??= { t: [], g: [], gRate: [], bank: [], roll: [], drawnDps: [], climbDeg: [], kias: [], rangeFt: [] });
        tr.t.push(+t.toFixed(2));
        tr.g.push(+a.g.toFixed(3));
        tr.gRate.push(+gRate.toFixed(2));
        tr.bank.push(+wings(a).toFixed(1));
        tr.roll.push(+roll.toFixed(1));
        tr.drawnDps.push(+drawn.toFixed(1));
        tr.climbDeg.push(+((Math.asin(Math.max(-1, Math.min(1, (a.climbFtps ?? 0) / Math.max(a.tasFtps ?? 1, 1)))) * 180) / Math.PI).toFixed(1));
        tr.kias.push(+(a.kias ?? 0).toFixed(1));
        tr.rangeFt.push(range === null ? null : Math.round(range));
        // The fighting wing measures (B5), each wingman flying off Lead.
        if (sc.b5 && ref && ref !== a && ref.id === 1) {
          if (!fwPer.has(name)) fwPer.set(name, fwTally());
          fwStep(fwPer.get(name), ref, a, tr, f.state.fwTrace ?? null);
        }
        // The close wingman's measures (B1), each wingman flying off Lead.
        if (closeKey && ref && ref !== a && ref.id === 1) {
          if (!closePer.has(name)) closePer.set(name, closeTally());
          const c = closePer.get(name);
          const dev = closeDeviation(ref, a, closeKey, closeSide, blockFt);
          if (sc.b3) {
            // B3's measures: ahead of Lead's 3/9 line (spec 7c.3, deconfliction), and the pace of a move against Lead (7c.4).
            const rel = relInLead(ref, a, blockFt);
            c.aheadMax = Math.max(c.aheadMax, rel.fwd);
            if (rel.fwd > 0) c.aheadSec += STEP_SEC;
            if (c.lastRel) c.paceMax = Math.max(c.paceMax, Math.hypot(rel.fwd - c.lastRel.fwd, rel.left - c.lastRel.left, rel.up - c.lastRel.up) / STEP_SEC);
            c.lastRel = rel;
          }
          const tRel = t - tPress;
          c.n++;
          let out = false;
          for (const ax of AXES) {
            c.max[ax] = Math.max(c.max[ax], Math.abs(dev[ax]));
            c.sq[ax] += dev[ax] * dev[ax];
            if (Math.abs(dev[ax]) > SETTLE_FT) out = true;
          }
          if (out) c.lastOut = tRel;
          c.outAtEnd = out;
          c.bankOffMax = Math.max(c.bankOffMax, Math.abs((a.bankDeg ?? 0) - (ref.bankDeg ?? 0)));
          c.gOffMax = Math.max(c.gOffMax, Math.abs(a.g - ref.g));
          const tq = torqueOf(a);
          if (tq !== null) {
            c.tqMin = Math.min(c.tqMin, tq);
            c.tqMax = Math.max(c.tqMax, tq);
            if (c.lastTq !== null) {
              const rate = (tq - c.lastTq) / STEP_SEC;
              if (Math.abs(rate) > TORQUE_REVERSAL_PCTPS) { if (c.lastTqRate && Math.sign(rate) !== Math.sign(c.lastTqRate)) c.tqReversals++; c.lastTqRate = rate; }
            }
            c.lastTq = tq;
          }
          // The roll-start lag (SMM 12.19 para 43's commonest error): Lead's roll start, then #2's first roll the same way.
          const leadRoll = ref.rollRateDps ?? 0;
          if (c.leadRollT === null && Math.abs(leadRoll) > ROLL_START_DPS) { c.leadRollT = tRel; c.leadRollSign = Math.sign(leadRoll); }
          if (c.leadRollT !== null && c.rollT === null && (a.rollRateDps ?? 0) * c.leadRollSign > ROLL_START_DPS) c.rollT = tRel;
          tr.planeFt ??= [];
          tr.lineFt ??= [];
          tr.alongFt ??= [];
          tr.torquePct ??= [];
          tr.planeFt.push(+dev.plane.toFixed(2));
          tr.lineFt.push(+dev.line.toFixed(2));
          tr.alongFt.push(+dev.along.toFixed(2));
          tr.torquePct.push(tq === null ? null : +tq.toFixed(1));
          // T29m part 2: the close wingman's loop terms and his asks against what his hand gave (wingman.js trace; null Held)
          const lv = f.state.liveTrace;
          const r3 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? null : +x.toFixed(3));
          for (const [key, v] of [
            ['cfPlaneP', r3(lv?.terms?.planeP)], ['cfPlaneD', r3(lv?.terms?.planeD)], ['cfPlaneI', r3(lv?.terms?.planeI)],
            ['cfLineP', r3(lv?.terms?.lineP)], ['cfLineD', r3(lv?.terms?.lineD)], ['cfHingeP', r3(lv?.terms?.hingeP)], ['cfHingeD', r3(lv?.terms?.hingeD)],
            ['cfLeadPct', r3(lv?.terms?.lead)], ['cfHoldPct', r3(lv?.holdPct)], ['cfAskUpG', r3(lv?.asked?.upCorrG)], ['cfAskLeftG', r3(lv?.asked?.leftCorrG)],
            ['cfAskTorquePct', r3(lv?.asked?.torquePct)], ['cfFfUpG', r3(lv?.ffUpG)], ['cfFfLeftG', r3(lv?.ffLeftG)], ['cfGAheadG', r3(lv?.gAheadG)], ['cfJob', lv?.job ?? null],
          ]) (tr[key] ??= []).push(v);
        }
      }
      prev = new Map(f.state.aircraft.map((a) => [a.id, { ...a }]));
    }
    const aircraft = {};
    for (const [name, q] of per) {
      aircraft[name] = {
        g: [+q.gMin.toFixed(2), +q.gMax.toFixed(2)], gRateMax: +q.gRateMax.toFixed(2), gReversals: q.gReversals,
        rollMax: Math.round(q.rollMax), rollAccMax: Math.round(q.rollAccMax), rollReversals: q.rollReversals,
        drawnMax: Math.round(q.drawnMax), rangeMin: Number.isFinite(q.rangeMin) ? Math.round(q.rangeMin) : null,
      };
      const fc = fwPer.get(name);
      if (fc) {
        const two = f.state.aircraft.find((x) => (x.name ?? String(x.id)) === name);
        aircraft[name].fw = fwResult(fc, f.state.aircraft[0], two);
      }
      const c = closePer.get(name);
      if (c) {
        const r2 = (x) => +x.toFixed(2);
        aircraft[name].close = {
          maxFt: Object.fromEntries(AXES.map((ax) => [ax, r2(c.max[ax])])),
          rmsFt: Object.fromEntries(AXES.map((ax) => [ax, r2(Math.sqrt(c.sq[ax] / Math.max(c.n, 1)))])),
          settleSec: c.outAtEnd ? null : c.lastOut === null ? 0 : r2(c.lastOut + STEP_SEC), // null: still outside SETTLE_FT at the end
          bankOffMaxDeg: r2(c.bankOffMax), gOffMax: r2(c.gOffMax),
          torquePct: Number.isFinite(c.tqMin) ? [+c.tqMin.toFixed(1), +c.tqMax.toFixed(1)] : null, torqueReversals: c.tqReversals,
          rollLagSec: c.leadRollT === null || c.rollT === null ? null : r2(c.rollT - c.leadRollT), // null: Lead never rolled (or #2 didn't follow)
          ...(sc.b3 ? { aheadMaxFt: r2(c.aheadMax), aheadSec: r2(c.aheadSec), paceMaxFtps: r2(c.paceMax) } : {}),
        };
      }
    }
    results.push({ label: p.label, how, pressMs: Math.round(pressMs), stepMsMax: +stepMsMax.toFixed(2), aircraft });
    // T29m part 2: the fighting wing faults and counts in the trace, under their own key (the existing ones untouched)
    for (const [name, a] of Object.entries(aircraft)) if (a.fw) (trace.faults ??= []).push({ press: trace.presses.length - 1, aircraft: name, ...a.fw.faults, counts: a.fw.counts });
  }
  return { results, trace };
}

const fmt = (v, b, lowerBetter = true) => {
  if (b === undefined || b === null || v === null) return String(v);
  const d = Array.isArray(v) ? null : v - b;
  if (!d) return String(v);
  const worse = lowerBetter ? d > 0 : d < 0;
  return `${v} (${d > 0 ? '+' : ''}${+d.toFixed(2)}${worse ? ' worse' : ' better'})`;
};

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
const out = {};
mkdirSync(TRACES, { recursive: true });
const index = [];
for (const sc of SCENARIOS) {
  if (only && !sc.name.includes(only)) continue;
  const { results, trace } = runScenario(sc);
  sc.after?.();
  out[sc.name] = results;
  const file = `${sc.name}${tag ? `.${tag}` : ''}.json`;
  writeFileSync(`${TRACES}/${file}`, JSON.stringify(trace));
  index.push({ name: `${sc.name}${tag ? ` (${tag})` : ''}`, file, presses: trace.presses });
  console.log(`\n## ${sc.name}`);
  results.forEach((r, i) => {
    const b = baseline?.[sc.name]?.[i];
    console.log(`  ${r.label}: ${r.how} | press ${r.pressMs} ms, step max ${r.stepMsMax} ms`);
    for (const [name, a] of Object.entries(r.aircraft)) {
      const ba = b?.aircraft?.[name] ?? {};
      console.log(`    ${name.padEnd(5)} G ${a.g[0]}..${a.g[1]} | G rate max ${fmt(a.gRateMax, ba.gRateMax)} G/s, G reversals ${fmt(a.gReversals, ba.gReversals)} | roll max ${fmt(a.rollMax, ba.rollMax)}°/s, roll acc max ${fmt(a.rollAccMax, ba.rollAccMax)}°/s², roll reversals ${fmt(a.rollReversals, ba.rollReversals)} | drawn max ${fmt(a.drawnMax, ba.drawnMax)}°/s | least range ${fmt(a.rangeMin, ba.rangeMin, false)} ft`);
      if (a.fw) {
        const w = a.fw;
        const bw = ba.fw ?? {};
        const be = bw.end ?? {};
        console.log(`          least slant ${fmt(w.slantMinFt, bw.slantMinFt, false)} ft, least horizontal ${fmt(w.horizMinFt, bw.horizMinFt, false)} ft | inside 500 ft ${fmt(w.in500Sec, bw.in500Sec)} s, inside 600 ft ${fmt(w.in600Sec, bw.in600Sec)} s | most G ${fmt(w.gMax, bw.gMax)}, most roll ${fmt(w.rollMaxDps, bw.rollMaxDps)}°/s | reversals (smoothed) G ${fmt(w.gReversalsSmoothed, bw.gReversalsSmoothed)}, roll ${fmt(w.rollReversalsSmoothed, bw.rollReversalsSmoothed)} | aim switches ${w.aimSwitches}, job switches ${w.jobSwitches}`);
        console.log(`          at the end: ${fmt(w.end.slantFt, be.slantFt)} ft, sweep ${fmt(w.end.sweepDeg, be.sweepDeg)}°, ${fmt(w.end.heightFt, be.heightFt)} ft against Lead's height, ${fmt(w.end.dKias, be.dKias)} KIAS against Lead's`);
        const q = w.faults;
        if (q) {
          // T29m part 2: Patrick's faults, against the ruled ends (TS-233: 100 ft low at a turn's end; the cone 500-1,000 ft;
          // within 15 KIAS of Lead, Patrick 4 Oct 19:12Z)
          console.log(`          faults: G onset max ${q.onsetMaxGps} G/s, ${q.onsetFastSec} s over ${ONSET_FAST_GPS} G/s | aim jumps ${q.aimJumps ?? '-'}, aim turn max ${q.aimTurnMaxDps ?? '-'}°/s | wrong-way roll ${q.wrongWaySec} s | over Lead's G + ${OVER_LEAD_G} ${q.overLeadSec} s | torque swings ${q.torqueSwings} | below ${LOW_FT} ft ${q.lowSec} s (lowest ${q.lowestFt}) | speed lost against Lead ${q.kiasLostVsLead} kt for ${q.gExcessGs} G·s over his G | filter acting ${q.filterShare ?? '-'}, engaged ${q.engagedShare ?? '-'}, guard ${q.guardShare ?? '-'}`);
          console.log(`          the end against the rulings: ${w.end.slantFt >= 500 && w.end.slantFt <= 1000 ? 'in' : 'outside'} 500-1,000 ft; ${w.end.heightFt} ft against 100 ft low; ${Math.abs(w.end.dKias) <= 15 ? 'within' : 'outside'} 15 KIAS`);
          const ct = w.counts;
          if (Object.keys(ct.changes).length || Object.keys(ct.limitSec).length) console.log(`          counts: changes ${Object.entries(ct.changes).map(([k, v]) => `${k} ${v} (hold ${ct.meanHoldSec[k]} s)`).join(', ') || 'none'} | at a limit ${Object.entries(ct.limitSec).map(([k, v]) => `${k} ${v} s`).join(', ') || 'none'}`);
        }
      }
      if (a.close) {
        const c = a.close;
        const bc = ba.close ?? {};
        const axes = AXES.map((ax) => `${ax} ${fmt(c.maxFt[ax], bc.maxFt?.[ax])} (rms ${fmt(c.rmsFt[ax], bc.rmsFt?.[ax])})`).join(', ');
        console.log(`          off his place, largest: ${axes} ft | settled ${c.settleSec === null ? 'never (outside 1 ft at the end)' : `${fmt(c.settleSec, bc.settleSec)} s`}`);
        console.log(`          bank off Lead max ${fmt(c.bankOffMaxDeg, bc.bankOffMaxDeg)}°, G off Lead max ${fmt(c.gOffMax, bc.gOffMax)} | torque ${c.torquePct ? `${c.torquePct[0]}..${c.torquePct[1]}%` : 'not set'}, reversals ${fmt(c.torqueReversals, bc.torqueReversals)} | roll-start lag ${c.rollLagSec === null ? 'none (Lead did not roll)' : `${fmt(c.rollLagSec, bc.rollLagSec)} s`}`);
        if (c.aheadMaxFt !== undefined) console.log(`          furthest forward ${fmt(c.aheadMaxFt, bc.aheadMaxFt)} ft (+ ahead of Lead's 3/9 line), ${fmt(c.aheadSec, bc.aheadSec)} s ahead of it | fastest against Lead ${fmt(c.paceMaxFtps, bc.paceMaxFtps)} ft/s`);
      }
    }
  });
}
// With a tag, this run's traces join the list already there (a run without one starts the list again, as before).
const kept = tag && existsSync(`${TRACES}/index.json`) ? JSON.parse(readFileSync(`${TRACES}/index.json`, 'utf8')).filter((r) => !index.some((x) => x.file === r.file)) : [];
writeFileSync(`${TRACES}/index.json`, JSON.stringify([...kept, ...index]));
if (save) {
  mkdirSync('tools/formation-gauge', { recursive: true });
  const stored = baseline && only ? { ...baseline, ...out } : out;
  // Timings depend on the PC: kept out of the baseline.
  for (const list of Object.values(stored)) for (const r of list) { delete r.pressMs; delete r.stepMsMax; }
  writeFileSync(BASELINE, `${JSON.stringify(stored, null, 1)}\n`);
  console.log(`\nBaseline saved: ${BASELINE}`);
} else if (!baseline) {
  console.log('\nNo baseline yet: run with --save to store one.');
}
console.log(`Traces: ${TRACES}/ (open tools/flight-plot/ on the dev server)`);
