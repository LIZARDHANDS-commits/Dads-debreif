import { createFormation } from '/home/user/Dads-debreif/src/modules/turn-sim/live/formation.js';
import { relativeTo } from '/home/user/Dads-debreif/src/modules/turn-sim/live/manoeuvres.js';
import { pairSlot } from '/home/user/Dads-debreif/src/modules/turn-sim/live/slots.js';
import { judge } from '/home/user/Dads-debreif/src/modules/turn-sim/live/judge.js';
const fly = (f) => { let n = 0; while (f.state.current && n++ < 20000) f.step(); return f; };
function timeline(f, to) {
  const marks = [3000, 2000, 1000, 500, 250, 100];
  const seen = {};
  const t0 = f.state.tSec;
  let inBandAt = null, lastOut = null, maxKias = 0, minKias = 999;
  let n = 0;
  const c = f.state.current;
  const side = c.change.side;
  while (f.state.current && n++ < 20000) {
    f.step();
    const [L, W] = f.state.aircraft;
    const slot = pairSlot(to, side, f.state.spacingFt);
    const rel = relativeTo(L, W);
    const d = Math.hypot(rel.fwd - slot.fwd, rel.left - slot.left);
    for (const m of marks) if (d <= m && seen[m] === undefined) seen[m] = f.state.tSec - t0;
    const j = judge([L, W], { key: to, side }, { spacingFt: f.state.spacingFt });
    if (j.inBand) { inBandAt ??= f.state.tSec - t0; } else { lastOut = f.state.tSec - t0; inBandAt = null; }
    maxKias = Math.max(maxKias, W.kias); minKias = Math.min(minKias, W.kias);
  }
  const total = f.state.tSec - t0;
  const s = (x) => x === undefined || x === null ? '-' : x.toFixed(0);
  return `${c.change.chooser?.picked ?? c.label}: total ${s(total)} s | 3000 ft @${s(seen[3000])} 2000 @${s(seen[2000])} 1000 @${s(seen[1000])} 500 @${s(seen[500])} 250 @${s(seen[250])} 100 @${s(seen[100])} | in band from ${s(inBandAt)} s | #2 KIAS ${minKias.toFixed(0)}-${maxKias.toFixed(0)} | ${f.state.judged?.labels?.join(',')}`;
}
function run(label, setup, to, options = {}) {
  const f = createFormation({});
  setup(f);
  const r = f.change(to, options);
  if (r !== 'started') { console.log(`${label} -> ${to}: ${r} ${f.state.refusal}`); return; }
  console.log(`${label} -> ${to}: ${timeline(f, to)}`);
}
const fromFw = (f) => { f.change('fw', {}); fly(f); };
const fromEch = (f) => { f.change('echelon', {}); fly(f); };
run('lab 6000', () => {}, 'echelon');
run('lab 6000', () => {}, 'fw');
run('lab 6000', () => {}, 'route');
run('fw', fromFw, 'echelon');
run('fw', fromFw, 'route');
run('fw', fromFw, 'lab');
run('echelon', fromEch, 'fw');
run('echelon', fromEch, 'route');
run('echelon', fromEch, 'lab');
run('echelon', fromEch, 'echelon', { side: 'left' });
run('echelon', fromEch, 'astern');
