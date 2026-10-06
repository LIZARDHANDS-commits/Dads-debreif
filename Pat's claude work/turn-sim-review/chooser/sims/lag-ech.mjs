import { createFormation } from '/home/user/Dads-debreif/src/modules/turn-sim/live/formation.js';
import { relativeTo } from '/home/user/Dads-debreif/src/modules/turn-sim/live/manoeuvres.js';
const fly = (f) => { let n = 0; while (f.state.current && n++ < 20000) f.step(); };
for (const [from, side] of [['echelon', 'right'], ['echelon', 'left'], ['fw', 'right']]) {
  const f = createFormation({}); f.change(from, { side }); fly(f);
  const t0 = f.state.tSec;
  const r = f.lagRoll(); console.log(from, side, r, f.state.refusal ?? '', '\n  ', f.state.current?.note);
  let minR = Infinity, maxG = 0, i = 0, maxRoll = 0;
  while (f.state.current && i++ < 20000) { f.step(); const [L, W] = f.state.aircraft; const q = relativeTo(L, W); const rr = Math.hypot(q.fwd, q.left, W.altAboveFt - L.altAboveFt); if (f.state.tSec - t0 > 3) minR = Math.min(minR, rr); maxG = Math.max(maxG, W.g ?? 1); maxRoll = Math.max(maxRoll, Math.abs(W.rollRateDps ?? 0)); }
  console.log('   end', (f.state.tSec - t0).toFixed(1), 's', f.state.judged?.text, '| min range after 3 s', minR.toFixed(0), 'maxG', maxG.toFixed(1), 'max roll', maxRoll.toFixed(0));
}
