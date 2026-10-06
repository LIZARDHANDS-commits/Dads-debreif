import { readFileSync } from 'node:fs';
import { createSim, STEP_SEC } from '/home/user/Dads-debreif/src/modules/traffic/sim.js';
const mj = JSON.parse(readFileSync('/home/user/Dads-debreif/src/modules/traffic/data/moose-jaw.json', 'utf8'));
const wrap = (d) => ((d % 360) + 540) % 360 - 180;
const winds = [[360,0],[290,30],[200,30],[20,30],[110,30],[200,20]];
const starts = (process.argv[2] ?? '2,13,11,5').split(',').map(Number);
for (const [wd, wk] of winds) for (const sp of starts) {
  const sim = createSim({ ...mj, aircraft: [], windKt: wk, windFromDeg: wd }, { seed: 42 });
  const id = sim.spawn({ routeId: 'PAT1', startPoint: sp });
  sim.stepTo(1);
  if (sp !== 2) sim.command(id, 'closed_pattern');
  let prev = null, maxDh = 0, maxDb = 0, ho = null, phases = [], minAlt = 1e9, t0 = sim.t, maxBank = 0, land = null;
  while (sim.t < 260) {
    sim.stepTo(sim.t + STEP_SEC);
    const a = sim.state().aircraft.find((x) => x.id === id);
    if (!a) break;
    if (phases[phases.length - 1] !== a.phase) phases.push(a.phase);
    if (prev && prev.phase === 'closed_pattern' && a.phase !== 'closed_pattern') ho = { t: sim.t.toFixed(0), alt: Math.round(a.alt), kt: Math.round(a.kt), x: Math.round(a.x), y: Math.round(a.y), hdg: Math.round(a.headingDeg) };
    if (prev) { maxDh = Math.max(maxDh, Math.abs(wrap(a.headingDeg - prev.headingDeg))); maxDb = Math.max(maxDb, Math.abs(a.bankDeg - prev.bankDeg)); }
    maxBank = Math.max(maxBank, Math.abs(a.bankDeg));
    if (!land && (a.phase === 'landing' || a.phase === 'rollout' || a.phase==='touch_and_go' || a.onGround)) land = sim.t.toFixed(0);
    prev = a;
  }
  console.log(`wind ${wd}/${wk} start ${sp}: handover ${JSON.stringify(ho)} maxHdgStep ${maxDh.toFixed(2)} maxBankStep ${maxDb.toFixed(2)} maxBank ${maxBank.toFixed(0)} land@${land} | ${phases.slice(0,8).join('>')}`);
}
