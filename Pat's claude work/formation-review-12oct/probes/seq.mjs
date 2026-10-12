const base = 'file:///C:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif-physics/src/modules/turn-sim/live/';
const M = await import(base + 'formation.js'); const A = await import(base + 'attitude.js'); const F = await import(base + 'flight.js');
const wings = (x) => x.attitudeDeg ?? F.liftBankDeg(x.bankDeg, x.nz ?? 1);
const dir = Number(process.argv[2] ?? -1);
const f = M.createFormation({ ships: 2 });
f.change('fw'); for (let i = 0; i < 8000 && f.state.current; i++) f.step();
f.change('fluid'); for (let i = 0; i < 800; i++) f.step();
f.pressFluid('sequence', dir);
const rows = []; let prev = null; const t0 = f.state.tSec;
for (let i = 0; i < 3000; i++) { f.step(); const s = f.state.aircraft.map((a) => ({ ...a }));
  if (prev) s.forEach((a, k) => { const p = prev[k];
    const d = A.drawnTurnDeg(A.drawnAttitudeOf(p, wings(p)), A.drawnAttitudeOf(a, wings(a)));
    rows.push({ t: +(f.state.tSec - t0).toFixed(2), who: a.name, climb: +(Math.asin(Math.max(-1, Math.min(1, a.climbFtps / a.tasFtps))) * 57.3).toFixed(1), wings: +wings(a).toFixed(1), roll: +a.rollRateDps.toFixed(0), racc: +((a.rollRateDps - p.rollRateDps) / 0.05).toFixed(0), g: +a.g.toFixed(2), dG: +((a.g - p.g) / 0.05).toFixed(1), drawn: +(d / 0.05).toFixed(0), kias: Math.round(a.kias), key: f.state.fluid?.session?.now?.()?.key ?? '' }); });
  prev = s; }
// Lead's manoeuvre key timeline
const keys = []; for (const r of rows) if (r.who === 'Lead' && (!keys.length || keys.at(-1).key !== r.key)) keys.push({ t: r.t, key: r.key });
console.log('Lead key timeline:', keys.map((k) => `${k.t}s ${k.key}`).join(' | '));
// biggest roll-acceleration and G-rate spikes per aircraft in the sequence
for (const who of ['Lead', '#2']) {
  const r = rows.filter((x) => x.who === who);
  const top = [...r].sort((a, b) => Math.abs(b.racc) - Math.abs(a.racc)).slice(0, 6);
  console.log(`\n${who} biggest roll-acceleration steps:`); console.table(top);
  const topG = [...r].sort((a, b) => Math.abs(b.dG) - Math.abs(a.dG)).slice(0, 4);
  console.log(`${who} biggest G-rate steps:`); console.table(topG);
}
const fs = await import('node:fs'); fs.writeFileSync(process.argv[3], JSON.stringify(rows));
