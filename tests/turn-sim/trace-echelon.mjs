import { createFormation } from '../../src/modules/turn-sim/live/formation.js';
import { relativeTo } from '../../src/modules/turn-sim/live/manoeuvres.js';

function runTrace(side) {
  console.log(`\n--- TRJ Echelon Regression Test (side: ${side}) ---`);
  const sim = createFormation({ ships: 2, wingSide: side, spacingFt: 6000 });
  sim.change('echelon', { side });
  console.log('Planned manoeuvre:', sim.state.current?.key, sim.state.current?.label);

  let maxFwd = -Infinity;
  let maxAheadOfLine = -Infinity;

  for (let t = 0; t <= 56; t += 0.5) {
    while (sim.state.tSec < t - 1e-4) sim.step();
    const [L, W] = sim.state.aircraft;
    const rel = relativeTo(L, W);
    if (t >= 25 && t <= 52) {
      const spinnerLineFwd = -Math.abs(rel.left) * (25 / 45);
      const aheadOfLine = rel.fwd - spinnerLineFwd;
      if (rel.fwd > maxFwd) maxFwd = rel.fwd;
      if (aheadOfLine > maxAheadOfLine) maxAheadOfLine = aheadOfLine;
      if (t % 2 === 0) {
        console.log(
          `t=${t.toFixed(1).padStart(4)}s: fwd=${rel.fwd.toFixed(1).padStart(6)}ft, left=${rel.left.toFixed(1).padStart(6)}ft, r=${Math.hypot(rel.fwd, rel.left).toFixed(1).padStart(6)}ft, kias=${W.kias.toFixed(1)}, spinnerFwd=${spinnerLineFwd.toFixed(1).padStart(6)}, diff=${aheadOfLine.toFixed(1).padStart(5)}`
        );
      }
    }
  }

  console.log(`Summary: maxFwd = ${maxFwd.toFixed(2)} ft (must be <= 0), maxAheadOfLine = ${maxAheadOfLine.toFixed(2)} ft (must be <= 5 ft)`);
  if (maxFwd > 0) throw new Error(`REGRESSION: #2 went ahead of Lead's 3/9 line: ${maxFwd} ft`);
  if (maxAheadOfLine > 5) throw new Error(`REGRESSION: #2 breached prop-wingtip line: ${maxAheadOfLine} ft`);
  console.log(`PASS: side ${side} maintained authentic geometry!`);
}

runTrace('right');
runTrace('left');
