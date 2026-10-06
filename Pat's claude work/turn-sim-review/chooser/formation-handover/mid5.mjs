const W = '/home/user/Dads-debreif/src/modules/turn-sim/live';
const F = await import(W + '/formation.js');
const T = await import(W + '/tuning.js');
T.setRates('instructor');
const flyOut = (f) => { const t0 = f.state.tSec; while (f.state.current && f.state.tSec - t0 < 300) f.step(); };
const f = F.createFormation({}); f.change('echelon'); flyOut(f);
const tPress = Number(process.argv[2] ?? 2);
f.press('delayed90', 1);
const rows = []; let prev = f.state.aircraft[1].bankDeg; let i = 0;
while (f.state.current && i < 2000) {
  if (Math.abs(i * 0.05 - tPress) < 1e-6 && process.argv[3] !== 'none') f.change('route');
  f.step(); i++;
  const b = f.state.aircraft[1].bankDeg; const rate = (b - prev) / 0.05; prev = b;
  if (Math.abs(rate) > 60) rows.push(`${(i * 0.05).toFixed(2)} s bank ${b.toFixed(1)} rate ${rate.toFixed(0)} Lead ${f.state.aircraft[0].bankDeg.toFixed(1)} ${f.state.current?.label}`);
}
console.log(rows.slice(0, 20).join('\n'), rows.length);
