import { createFormation } from '/home/user/Dads-debreif/src/modules/turn-sim/live/formation.js';
import { relativeTo } from '/home/user/Dads-debreif/src/modules/turn-sim/live/manoeuvres.js';
const fly = (f) => { let n = 0; while (f.state.current && n++ < 20000) f.step(); };
const flyFor = (f, sec) => { for (let i = 0; i < Math.round(sec / 0.05); i++) f.step(); };
for (const hold of [0, 20]) {
  const f = createFormation({});
  f.change('fw'); fly(f); flyFor(f, hold);
  const [L, W] = f.state.aircraft; const r0 = relativeTo(L, W);
  console.log(`hold ${hold} s: at press fwd ${r0.fwd.toFixed(0)} left ${r0.left.toFixed(0)} up ${(W.altAboveFt - L.altAboveFt).toFixed(0)} kias ${W.kias.toFixed(0)} bank ${W.bankDeg.toFixed(1)} Lbank ${L.bankDeg.toFixed(1)} Lkias ${L.kias.toFixed(0)}`);
  f.change('lab'); console.log('  ', f.state.current?.note?.slice(0, 160));
  const t0 = f.state.tSec; let i = 0;
  while (f.state.current && i < 4000) { f.step(); i++; if (i % 100 === 0) { const [L, W] = f.state.aircraft; const r = relativeTo(L, W); const seg = f.state.plans[W.id]?.segments?.[0]; console.log(`   ${(f.state.tSec - t0).toFixed(0).padStart(3)} s fwd ${r.fwd.toFixed(0).padStart(5)} left ${r.left.toFixed(0).padStart(5)} kias ${W.kias.toFixed(0)} bank ${W.bankDeg.toFixed(0).padStart(3)} seg ${seg?.kind ?? '-'} ${seg?.i ?? ''}/${seg?.points?.length ?? seg?.poses?.length ?? ''}`); } }
  console.log('   end', (f.state.tSec - t0).toFixed(1), f.state.judged?.text);
}
