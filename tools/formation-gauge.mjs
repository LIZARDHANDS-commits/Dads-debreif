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
import { performance } from 'node:perf_hooks';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createFormation } from '../src/modules/turn-sim/live/formation.js';
import { STEP_SEC, liftBankDeg } from '../src/modules/turn-sim/live/flight.js';
import { drawnAttitudeOf, drawnTurnDeg, sub3, dot3, cross3 } from '../src/modules/turn-sim/live/attitude.js';
import { leadStateOf } from '../src/modules/turn-sim/live/fluid-lead.js';
import { pairSlot, LINE_BACK_PER_OUT } from '../src/modules/turn-sim/live/slots.js';
import { throttleAtTorque } from '../src/modules/turn-sim/live/power.js';

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
if (save && nudge) throw new Error('--nudge is a known-bad case for checking the comparison: never --save it');

const wings = (a) => a.attitudeDeg ?? liftBankDeg(a.bankDeg ?? 0, a.nz ?? 1);
const steps = (sec) => Math.round(sec / STEP_SEC);

/** Flies until the change or move in hand is finished (or capSec). */
function settle(f, capSec = 300) {
  for (let i = 0; i < steps(capSec) && f.state.current; i++) f.step();
}

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
      if (nudge) {
        const w = f.state.aircraft[1];
        w.altAboveFt += NUDGE_FT;
        for (const seg of f.state.plans[w.id]?.segments ?? []) for (const pose of seg.poses ?? []) pose.alt += NUDGE_FT;
      }
    },
    presses: [{ label: `Echelon hold, 60 s straight and level${nudge ? ` (#2 nudged ${NUDGE_FT} ft up)` : ''}`, press: () => 'held', sec: 60 }],
  },
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
];

/** One aircraft's running numbers. */
function tally() {
  return { gMin: Infinity, gMax: -Infinity, gRateMax: 0, gReversals: 0, rollMax: 0, rollAccMax: 0, rollReversals: 0, drawnMax: 0, rangeMin: Infinity, lastRoll: 0, lastGRate: 0 };
}

const AXES = ['plane', 'line', 'along'];

/**
 * A close wingman's deviation from his place (feet) on his three axes, in Lead's frame from Lead's velocity and body up:
 * plane (+ above Lead's wing plane), line (+ ahead of the spinner-to-wingtip line), along (+ out along it, away from Lead).
 * key: the close formation (slots.js); side: #2's side (+1 left of Lead).
 */
function closeDeviation(lead, wing, key, side, blockFt) {
  const L = leadStateOf(lead, blockFt);
  const W = leadStateOf(wing, blockFt);
  const left = cross3(L.bodyUp, L.nose);
  const r = sub3(W.pm, L.pm);
  const place = pairSlot(key, side);
  const d = { fwd: dot3(r, L.nose) - place.fwd, left: dot3(r, left) - place.left, up: dot3(r, L.bodyUp) - place.alt };
  const n = Math.hypot(1, LINE_BACK_PER_OUT);
  return {
    plane: d.up,
    line: (d.fwd + side * LINE_BACK_PER_OUT * d.left) / n, // toward Lead's nose, square to the line
    along: (-LINE_BACK_PER_OUT * d.fwd + side * d.left) / n, // out along the line, back as it goes out
  };
}

/** An aircraft's torque (%) from its power (power.js; throttleAtTorque is linear in the torque), or null with none set. */
function torqueOf(a) {
  const p = a.power;
  if (!p) return null;
  if (p.stage === 'idle' || p.stage === 'idleBoards') return 0;
  return Math.min(100, p.throttle / throttleAtTorque(1, p.kias, p.altFt ?? 8000));
}

/** A close wingman's running numbers (the B1 measures above). */
function closeTally() {
  return {
    n: 0, max: { plane: 0, line: 0, along: 0 }, sq: { plane: 0, line: 0, along: 0 }, lastOut: null, outAtEnd: false,
    bankOffMax: 0, gOffMax: 0, tqMin: Infinity, tqMax: -Infinity, lastTq: null, lastTqRate: 0, tqReversals: 0,
    leadRollT: null, leadRollSign: 0, rollT: null,
  };
}

function runScenario(sc) {
  const f = createFormation({ ships: 2 });
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
    const closeSide = sc.close ? f.where().side : null;
    const closePer = new Map();
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
        // The close wingman's measures (B1), each wingman flying off Lead.
        if (sc.close && ref && ref !== a && ref.id === 1) {
          if (!closePer.has(name)) closePer.set(name, closeTally());
          const c = closePer.get(name);
          const dev = closeDeviation(ref, a, sc.close, closeSide, blockFt);
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
        };
      }
    }
    results.push({ label: p.label, how, pressMs: Math.round(pressMs), stepMsMax: +stepMsMax.toFixed(2), aircraft });
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
  out[sc.name] = results;
  writeFileSync(`${TRACES}/${sc.name}.json`, JSON.stringify(trace));
  index.push({ name: sc.name, file: `${sc.name}.json`, presses: trace.presses });
  console.log(`\n## ${sc.name}`);
  results.forEach((r, i) => {
    const b = baseline?.[sc.name]?.[i];
    console.log(`  ${r.label}: ${r.how} | press ${r.pressMs} ms, step max ${r.stepMsMax} ms`);
    for (const [name, a] of Object.entries(r.aircraft)) {
      const ba = b?.aircraft?.[name] ?? {};
      console.log(`    ${name.padEnd(5)} G ${a.g[0]}..${a.g[1]} | G rate max ${fmt(a.gRateMax, ba.gRateMax)} G/s, G reversals ${fmt(a.gReversals, ba.gReversals)} | roll max ${fmt(a.rollMax, ba.rollMax)}°/s, roll acc max ${fmt(a.rollAccMax, ba.rollAccMax)}°/s², roll reversals ${fmt(a.rollReversals, ba.rollReversals)} | drawn max ${fmt(a.drawnMax, ba.drawnMax)}°/s | least range ${fmt(a.rangeMin, ba.rangeMin, false)} ft`);
      if (a.close) {
        const c = a.close;
        const bc = ba.close ?? {};
        const axes = AXES.map((ax) => `${ax} ${fmt(c.maxFt[ax], bc.maxFt?.[ax])} (rms ${fmt(c.rmsFt[ax], bc.rmsFt?.[ax])})`).join(', ');
        console.log(`          off his place, largest: ${axes} ft | settled ${c.settleSec === null ? 'never (outside 1 ft at the end)' : `${fmt(c.settleSec, bc.settleSec)} s`}`);
        console.log(`          bank off Lead max ${fmt(c.bankOffMaxDeg, bc.bankOffMaxDeg)}°, G off Lead max ${fmt(c.gOffMax, bc.gOffMax)} | torque ${c.torquePct ? `${c.torquePct[0]}..${c.torquePct[1]}%` : 'not set'}, reversals ${fmt(c.torqueReversals, bc.torqueReversals)} | roll-start lag ${c.rollLagSec === null ? 'none (Lead did not roll)' : `${fmt(c.rollLagSec, bc.rollLagSec)} s`}`);
      }
    }
  });
}
writeFileSync(`${TRACES}/index.json`, JSON.stringify(index));
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
