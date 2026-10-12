const base = 'file:///C:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif-physics/src/modules/turn-sim/live/';
const M = await import(base + 'formation.js'); const A = await import(base + 'attitude.js');
const f = M.createFormation({ ships: 2 });
f.change('fw'); for (let i = 0; i < 8000 && f.state.current; i++) f.step();
f.change('fluid'); for (let i = 0; i < 800; i++) f.step();
f.pressFluid('loop');
const rows = []; let prev = null;
for (let i = 0; i < 1200; i++) { f.step(); const s = f.state.aircraft.map((a) => ({ ...a }));
  if (prev) s.forEach((a, k) => { const p = prev[k]; const d = A.drawnTurnDeg({ headingRad: p.headingRad, pitchDeg: p.pitchDeg, attitudeDeg: p.bankDeg }, { headingRad: a.headingRad, pitchDeg: a.pitchDeg, attitudeDeg: a.bankDeg });
    rows.push({ t: f.state.tSec.toFixed(2), who: a.name, d: d.toFixed(1), pitch: a.pitchDeg.toFixed(1), climbAng: (Math.asin(Math.max(-1, Math.min(1, a.climbFtps / a.tasFtps))) * 180 / Math.PI).toFixed(1), bank: a.bankDeg.toFixed(1), hdg: (a.headingRad * 180 / Math.PI).toFixed(1), g: a.g.toFixed(2), kias: a.kias.toFixed(0) }); });
  prev = s; }
rows.sort((a, b) => b.d - a.d); console.table(rows.slice(0, 10));
