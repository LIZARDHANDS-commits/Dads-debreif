import { createFormation } from '/home/user/Dads-debreif/src/modules/turn-sim/live/formation.js';
import { planMoveInBand, placeNow, clampToBand, MOVE_STEP_FT } from '/home/user/Dads-debreif/src/modules/turn-sim/live/move-in-band.js';
import { dryRunT, recordFlight } from '/home/user/Dads-debreif/src/modules/turn-sim/live/transitions.js';
import { judge } from '/home/user/Dads-debreif/src/modules/turn-sim/live/judge.js';
const fly = (f) => { let n = 0; while (f.state.current && n++ < 20000) f.step(); };
const r0 = (x) => Math.round(x);
const P = (p) => JSON.stringify({ fwd: r0(p.fwd), left: r0(p.left), alt: r0(p.alt) });
for (const [key, taps] of [['fw', [['up', 6], ['out', 4], ['fwd', -4], ['fwd', 6], ['up', -8]]], ['lab', [['out', 4], ['up', 10], ['fwd', -3], ['out', -8]]], ['echelon', [['out', 2], ['up', -1], ['fwd', -2]]], ['route', [['out', 3]]]]) {
  const f = createFormation({}); if (key !== 'lab') { f.change(key, { side: 'right' }); fly(f); }
  let [L, W] = f.state.aircraft; const spacingFt = f.state.spacingFt; let t = f.state.tSec; const side = f.state.lastSide;
  let target = placeNow(L, W);
  console.log('==', key, 'start', P(target), '|', judge([L, W], { key, side }, { spacingFt }).text.slice(0, 50));
  for (const [axis, n] of taps) {
    const step = MOVE_STEP_FT[key][axis] * n;
    const want = { ...target };
    if (axis === 'fwd') want.fwd += step; else if (axis === 'out') want.left += Math.sign(target.left || -1) * step; else want.alt += step;
    const c = clampToBand(L, W, key, side, target, want, spacingFt);
    target = c.place;
    const p = planMoveInBand([L, W], target, { spacingFt, blockFt: 8000 }, t);
    if (!p.ok) { console.log('  ', axis, n, 'want', P(want), 'REFUSED:', p.reason); continue; }
    const seg = p.plans[W.id].segments[0];
    const runW = dryRunT(W, p.plans[W.id], t); const rec = recordFlight(L, p.plans[L.id], t); const runL = { end: { ...L, ...rec.at(Math.round(runW.durationSec / 0.05)) } };
    const now = placeNow(runL.end, runW.end);
    const jj = judge([runL.end, runW.end], { key, side }, { spacingFt });
    console.log('  ', axis, n, 'target', P(target), c.atEdge ? 'EDGE' : '    ', '|', (p.endSec - t).toFixed(0), 's, maxBank', r0(p.maxBankDeg), 'pts', seg.points.length, '| flown to', P(now), 'miss', r0(Math.hypot(now.fwd - target.fwd, now.left - target.left, now.alt - target.alt)), 'ft |', jj.inBand ? 'IN BAND' : 'OUT ' + jj.labels.join(' '));
    L = runL.end; W = runW.end; t = p.endSec; target = now;
  }
}
