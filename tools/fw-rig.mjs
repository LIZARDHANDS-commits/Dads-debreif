// The scripted-Lead rig (plan T29m part 2, the control-systems analysis plan's CA3 and method M2): #2's live fighting wing
// technique (live/wingman/fighting-wing.js) flown on the real point mass (fluid-lead.js stepLead) against a Lead who flies
// a script (straight and level, or a steady level turn away from #2), with no formation session. After #2 settles, a step
// is added at one summing point (fighting-wing.js setFwAnalysis's probe) and his response recorded, so each loop's real
// response can be set beside its linear model (tools/flight-design/fw_loops.py, plan criterion C11). A measuring tool: it
// changes nothing in flight, and nothing here is a test.
//   node tools/fw-rig.mjs                    every case; writes tools/flight-design/results/fw-rig.json
//   node tools/fw-rig.mjs --case vertical-T1 one case, printed
// Numbers: 200 KIAS at the 8,000 ft block (moves.js KIAS_OUTSIDE_LAB, formation.js LIVE_DEFAULTS.blockFt); the swept place
// 625 ft at 45°, 50 ft below (FW_WING, Patrick 14 Oct 2026); Lead's turn 60° (TS-65's academic 60°/2 G). Step sizes are
// small on purpose (estimates), to stay near linear: 40 ft of height, 60 ft of aim, 5 ft/s of wanted closure, 3 KIAS.
import { mkdirSync, writeFileSync } from 'node:fs';
import { leadStateOf, stepLead } from '../src/modules/turn-sim/live/fluid-lead.js';
import { startFwWing, stepFwWingman, setFwAnalysis } from '../src/modules/turn-sim/live/wingman/fighting-wing.js';
import { STEP_SEC } from '../src/modules/turn-sim/live/flight.js';
import { iasToTasKt } from '../src/core/t6-performance.js';
import { KT_TO_FTPS } from '../src/core/units.js';
import { FW_WING } from '../src/modules/turn-sim/live/wing-moves.js';
import { KIAS_OUTSIDE_LAB } from '../src/modules/turn-sim/live/moves.js';
import { LIVE_DEFAULTS } from '../src/modules/turn-sim/live/formation.js';
import { cross3, unit3, add3, scale3, sub3, dot3 } from '../src/modules/turn-sim/live/attitude.js';

const Z = { x: 0, y: 0, z: 1 };
const KIAS = KIAS_OUTSIDE_LAB;
const BLOCK = LIVE_DEFAULTS.blockFt;
const TAS = iasToTasKt(KIAS, BLOCK) * KT_TO_FTPS;
const SETTLE = 40; // s before the step (estimate: the slowest loop's time, the arc loop's 10 s, four times)
const AFTER = 40; // s recorded after it

const aircraftAt = (x, y, alt, headingRad, extra = {}) => ({ xFt: x, yFt: y, altAboveFt: alt, headingRad, tasFtps: TAS, climbFtps: 0, bankDeg: 0, rollRateDps: 0, g: 1, ...extra });

/** Lead's ask for the script: straight and level, or a steady level turn left (away from #2 on his right) at bankDeg. */
function leadAsk(st, bankDeg) {
  if (!bankDeg) return { lift: { x: 0, y: 0, z: 1 }, holdKias: KIAS };
  const left = unit3(cross3(Z, st.nose));
  return { lift: add3(Z, scale3(left, Math.tan((bankDeg * Math.PI) / 180))), holdKias: KIAS };
}

/** #2 against Lead: height (ft, + above), lateral (ft, + right of Lead's path, his side), behind (ft), and his KIAS. */
function rel(L, two) {
  const n = unit3(L.vel);
  const left = unit3(cross3(Z, n));
  const r = sub3(two.pm, L.pm);
  return { height: r.z, right: -dot3(r, left), behind: -dot3(r, n), kias: two.kias };
}

const CASES = {
  'vertical-T1': { bank: 0, probe: 'heightTarget', amp: 40, read: (x) => x.rel.height, what: 'height against Lead (ft) for a 40 ft step in the height target', model: 'vertical PD' },
  'steering-T1': { bank: 0, probe: 'aimLateral', amp: 60, read: (x) => x.rel.right, what: 'his lateral place (ft, out) for a 60 ft step in the swept aim', model: 'steering T1' },
  'power-T1': { bank: 0, probe: 'wantKias', amp: 3, read: (x) => x.rel.kias, what: 'his KIAS for a 3 KIAS step in the wanted speed', model: 'speed hold' },
  'offset-T2': { bank: 60, probe: 'aimLateral', amp: 60, read: (x) => x.trace.dFt, what: 'his offset d inside Lead\'s circle (ft) for a 60 ft step in the aim\'s offset', model: 'steering T2 (through the 1.5 s aim blend)' },
  'arc-T2': { bank: 60, probe: 'cWant', amp: 5, read: (x) => x.trace.cActualFtps, what: 'his arc closure (ft/s) for a 5 ft/s step in the wanted closure', model: 'arc loop' },
};

function run(name) {
  const c = CASES[name];
  const back = FW_WING.sweptFt * Math.sin((FW_WING.sweptDeg * Math.PI) / 180);
  const out = FW_WING.sweptFt * Math.cos((FW_WING.sweptDeg * Math.PI) / 180);
  let L = leadStateOf(aircraftAt(0, 0, 0, 0), BLOCK);
  // #2 on the swept place, on Lead's right (heading 0 is +x; right is -y), his stack below
  const two0 = aircraftAt(-back, -out, FW_WING.stackFt, 0);
  setFwAnalysis({ probe: { at: c.probe, fn: (t) => (t >= SETTLE ? c.amp : 0) } });
  let w = startFwWing(two0, L, { blockFt: BLOCK });
  setFwAnalysis(); // flying restored for anything started after
  const series = [];
  const n = Math.round((SETTLE + AFTER) / STEP_SEC);
  for (let i = 0; i < n; i++) {
    const r = stepFwWingman(w, L);
    L = stepLead(L, leadAsk(L, c.bank));
    w = r.w;
    if (i % 2 === 0) series.push({ t: +w.t.toFixed(2), rel: rel(L, w.st), trace: r.trace });
  }
  // the response: the read value less its mean over the 2 s before the step, over the step's size
  const pre = series.filter((x) => x.t > SETTLE - 2 && x.t <= SETTLE).map(c.read).filter(Number.isFinite);
  const base = pre.reduce((a, b) => a + b, 0) / Math.max(pre.length, 1);
  const resp = series.filter((x) => x.t > SETTLE).map((x) => ({ t: +(x.t - SETTLE).toFixed(2), y: (c.read(x) - base) / c.amp }));
  const fin = resp.filter((x) => x.t > AFTER - 5).map((x) => x.y);
  const final = fin.reduce((a, b) => a + b, 0) / Math.max(fin.length, 1);
  const peak = resp.reduce((m, x) => (Math.abs(x.y) > Math.abs(m) ? x.y : m), 0);
  const t63 = resp.find((x) => Math.abs(x.y) >= 0.63 * Math.abs(final))?.t ?? null;
  const filterSteps = series.filter((x) => x.t > SETTLE && x.trace.ctl?.filterOn).length;
  const trim = series.filter((x) => x.t > SETTLE - 2 && x.t <= SETTLE);
  const at = trim[trim.length - 1];
  return {
    name, what: c.what, model: c.model, probe: c.probe, amp: c.amp, leadBankDeg: c.bank,
    trim: { sFt: at?.trace.sFt ?? null, dFt: at?.trace.dFt ?? null, slantFt: Math.round(at?.trace.slant ?? NaN), heightFt: Math.round(at?.rel.height ?? NaN), job: at?.trace.job ?? null },
    final: +final.toFixed(3), peak: +peak.toFixed(3), overshootPct: final ? Math.round((100 * (Math.abs(peak) - Math.abs(final))) / Math.abs(final)) : null, t63Sec: t63,
    filterStepsAfter: filterSteps, guardOnAfter: series.filter((x) => x.t > SETTLE && x.trace.ctl?.guardOn).length,
    response: resp.filter((_, i) => i % 2 === 0),
  };
}

const args = process.argv.slice(2);
const one = args.includes('--case') ? args[args.indexOf('--case') + 1] : null;
const names = one ? [one] : Object.keys(CASES);
const results = names.map(run);
for (const r of results) console.log(`${r.name.padEnd(12)} ${r.what}: final ${r.final}, peak ${r.peak} (overshoot ${r.overshootPct}%), 63% at ${r.t63Sec} s | trim s ${r.trim.sFt} d ${r.trim.dFt} slant ${r.trim.slantFt} height ${r.trim.heightFt} (${r.trim.job}) | filter acting ${r.filterStepsAfter} recorded steps, guard ${r.guardOnAfter}`);
if (!one) {
  mkdirSync('tools/flight-design/results', { recursive: true });
  writeFileSync('tools/flight-design/results/fw-rig.json', `${JSON.stringify({ made: 'tools/fw-rig.mjs', kias: KIAS, blockFt: BLOCK, tasFtps: TAS, settleSec: SETTLE, afterSec: AFTER, cases: results }, null, 1)}\n`);
  console.log('wrote tools/flight-design/results/fw-rig.json');
}
