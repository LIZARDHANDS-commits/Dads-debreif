// Headless probe of Formation on main (read-only): wall time of presses and steps, and per-aircraft smoothness.
import { performance } from 'node:perf_hooks';
const base = 'file:///C:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif-formation/src/modules/turn-sim/live/';
const M = await import(base + 'formation.js');
const A = await import(base + 'attitude.js');
const DT = 0.05;
function run(label, f, act, maxSec = 400, untilDone = true) {
  const t0 = performance.now(); const r = act(); const pressMs = performance.now() - t0;
  const ac = () => f.state.aircraft;
  const m = {}; for (const a of ac()) m[a.name ?? a.id] = { gMin: 9, gMax: -9, rollMax: 0, rollJumps: 0, rollAccMax: 0, drawnMax: 0, minRef: 1e9, prev: null };
  let steps = 0, stepMsMax = 0, slow16 = 0, slow50 = 0, tot = 0;
  while (steps * DT < maxSec) {
    const s0 = performance.now(); f.step(); const ms = performance.now() - s0; tot += ms;
    stepMsMax = Math.max(stepMsMax, ms); if (ms > 16) slow16++; if (ms > 50) slow50++;
    steps++;
    const byId = Object.fromEntries(ac().map((a) => [a.id, a]));
    for (const a of ac()) {
      const q = m[a.name ?? a.id]; if (!q) continue;
      q.gMin = Math.min(q.gMin, a.g); q.gMax = Math.max(q.gMax, a.g);
      q.rollMax = Math.max(q.rollMax, Math.abs(a.rollRateDps ?? 0));
      if (q.prev) {
        const acc = Math.abs((a.rollRateDps ?? 0) - (q.prev.rollRateDps ?? 0)) / DT;
        q.rollAccMax = Math.max(q.rollAccMax, acc); if (acc > 400) q.rollJumps++;
        const d = A.drawnTurnDeg({ headingRad: q.prev.headingRad, pitchDeg: q.prev.pitchDeg, attitudeDeg: q.prev.bankDeg }, { headingRad: a.headingRad, pitchDeg: a.pitchDeg, attitudeDeg: a.bankDeg });
        q.drawnMax = Math.max(q.drawnMax, d / DT);
      }
      const ref = byId[a.ref];
      if (ref && ref !== a) q.minRef = Math.min(q.minRef, Math.hypot(a.xFt - ref.xFt, a.yFt - ref.yFt, (a.altAboveFt ?? 0) - (ref.altAboveFt ?? 0)));
      q.prev = { ...a };
    }
    if (untilDone && !f.state.current && !f.state.fluid?.session?.busy) break;
  }
  console.log(`\n## ${label}  -> ${typeof r === 'string' ? r : JSON.stringify(r)}${f.state.refusal ? ' (' + f.state.refusal + ')' : ''}`);
  console.log(`press ${pressMs.toFixed(0)} ms | ${steps} steps (${(steps * DT).toFixed(1)} s) | step max ${stepMsMax.toFixed(1)} ms, mean ${(tot / steps).toFixed(2)} ms, >16ms ${slow16}, >50ms ${slow50} | where ${JSON.stringify(f.where())}`);
  for (const [k, q] of Object.entries(m)) if (k !== 'Lead' && k !== '1' || true) console.log(`  ${String(k).padEnd(5)} G ${q.gMin.toFixed(2)}..${q.gMax.toFixed(2)} | roll max ${q.rollMax.toFixed(0)}°/s, roll-acc max ${q.rollAccMax.toFixed(0)}°/s², steps >400°/s² ${q.rollJumps} | drawn rotation max ${q.drawnMax.toFixed(0)}°/s | min to ref ${q.minRef > 1e8 ? '-' : q.minRef.toFixed(0) + ' ft'}`);
}
// A. 2-ship fighting wing, live law
let f = M.createFormation({ ships: 2, fwWing: 'live' });
run('2-ship: change to fighting wing (tracker)', f, () => f.change('fw'));
run('2-ship FW live: level turn into #2 (right)', f, () => f.pressFw('levelTurn', -1), 120);
run('2-ship FW live: reversal', f, () => f.pressFw('reversal'), 120);
run('2-ship FW live: wings level', f, () => f.pressFw('wingsLevel'), 120);
// B. 4-ship
f = M.createFormation({ ships: 4, fwWing: 'live' });
run('4-ship: change to fighting wing (tracker)', f, () => f.change('fw'), 400);
run('4-ship FW live: level turn left', f, () => f.pressFw('levelTurn', 1), 120);
run('4-ship FW live: reversal', f, () => f.pressFw('reversal'), 120);
run('4-ship FW live: wings level', f, () => f.pressFw('wingsLevel'), 120);
run('4-ship FW live: level turn right', f, () => f.pressFw('levelTurn', -1), 120);
// C. Fluid, 2-ship
f = M.createFormation({ ships: 2, fwWing: 'live' });
run('fluid: change to fighting wing', f, () => f.change('fw'));
run('fluid: start (entry)', f, () => f.change('fluid'), 40, false);
run('fluid: loop', f, () => f.pressFluid('loop'), 60, false);
run('fluid: standard sequence right', f, () => f.pressFluid('sequence', -1), 150, false);
