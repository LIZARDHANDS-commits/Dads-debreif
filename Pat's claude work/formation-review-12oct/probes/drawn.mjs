const base = 'file:///C:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif-physics/src/modules/turn-sim/live/';
const M = await import(base + 'formation.js'); const A = await import(base + 'attitude.js'); const F = await import(base + 'flight.js');
const wings = (x) => x.attitudeDeg ?? F.liftBankDeg(x.bankDeg, x.nz ?? 1);
const old = (a) => ({ headingRad: a.headingRad, pitchDeg: a.pitchDeg, attitudeDeg: wings(a) });
const neu = (a) => A.drawnAttitudeOf(a, wings(a));
function run(f, label, steps) {
  let prev = null; const w = {}; let lvl = 0;
  for (let i = 0; i < steps; i++) { f.step(); const s = f.state.aircraft.map((a) => ({ ...a }));
    for (const a of s) { if (Math.abs(wings(a)) < 0.01 && Math.abs(a.climbFtps) < 0.01) lvl = Math.max(lvl, Math.abs(neu(a).pitchDeg - a.pitchDeg)); }
    if (prev) s.forEach((a, k) => { const p = prev[k]; const k1 = a.name;
      w[k1] ??= { old: 0, neu: 0 };
      w[k1].old = Math.max(w[k1].old, A.drawnTurnDeg(old(p), old(a)));
      w[k1].neu = Math.max(w[k1].neu, A.drawnTurnDeg(neu(p), neu(a))); });
    prev = s; }
  console.log(label.padEnd(34), Object.entries(w).map(([k, v]) => `${k}: ${v.old.toFixed(1)}→${v.neu.toFixed(1)}°`).join('  '), `| wings-level pitch diff ${lvl.toFixed(3)}°`);
}
let f = M.createFormation({ ships: 2, fwWing: 'live' });
f.change('fw'); run(f, '2-ship change to FW (tracker)', 400);
f.pressFw('levelTurn', -1); run(f, '2-ship FW live level turn', 600);
f = M.createFormation({ ships: 2 }); f.change('fw'); for (let i = 0; i < 8000 && f.state.current; i++) f.step();
f.change('fluid'); run(f, 'fluid entry', 800);
f.pressFluid('loop'); run(f, 'fluid loop', 1200);
f.pressFluid('sequence', -1); run(f, 'fluid sequence R', 3000);
f = M.createFormation({ ships: 2 }); f.change('echelon'); run(f, 'change to echelon', 600);
f.press && f.press('levelTurn', 1); run(f, 'echelon turn (close)', 600);
