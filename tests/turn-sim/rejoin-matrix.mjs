import { createFormation } from '../../src/modules/turn-sim/live/formation.js';
import { searchTurningRejoin } from '../../src/modules/turn-sim/live/turning-rejoin.js';
import { leadTurnInto } from '../../src/modules/turn-sim/live/lead-turn-in.js';
import { recordFlight, speedSeg } from '../../src/modules/turn-sim/live/replay.js';
import { REJOIN, KIAS_OUTSIDE_LAB } from '../../src/modules/turn-sim/live/tuning.js';
import { trackTwice } from '../../src/modules/turn-sim/live/tracker.js';

import { slotsFor } from '../../src/modules/turn-sim/live/slots.js';

export function runRejoin(name, { ships = 2, from = 'lineAbreast', spacingFt = 6000, to = 'fw', s = 1 }) {
  const wingSide = s === 1 ? 'left' : 'right';
  const sim = createFormation({ ships, wingSide, spacingFt });
  const [lead, wing] = sim.state.aircraft;
  if (from === 'fw') {
    const slot = slotsFor('fw', s, { ships: 2 })[2];
    const h = lead.headingRad;
    const cosH = Math.cos(h);
    const sinH = Math.sin(h);
    wing.xFt = lead.xFt + slot.fwd * cosH - slot.left * sinH;
    wing.yFt = lead.yFt + slot.fwd * sinH + slot.left * cosH;
    wing.altAboveFt = slot.alt;
    wing.kias = KIAS_OUTSIDE_LAB;
  }
  const pre = Math.abs(lead.kias - KIAS_OUTSIDE_LAB) > 0.5 ? [{ ...speedSeg(lead.kias, KIAS_OUTSIDE_LAB, 8000), withNext: true }] : [];
  const into = leadTurnInto({ lead, pre, s, bankDeg: REJOIN.leadBankDeg, t0: 0, record: recordFlight });
  
  const t0 = Date.now();
  const res = searchTurningRejoin({
    lead, wing, into, s, to, sTo: s, spacingFt, blockFt: 8000, t0: 0,
    hot: from === 'lineAbreast',
  });
  const elapsedMs = Date.now() - t0;

  if (!res) {
    return { name, ok: false, durationSec: null, hardSec: null, initialThrottle: null, minKias: null, maxG: null, error: 'no candidate found' };
  }

  const pts = res.part?.points || res.run?.points;
  const p0 = pts?.[0];
  const p1 = pts?.[Math.min(20, (pts?.length || 1) - 1)];
  const p2 = pts?.[Math.min(40, (pts?.length || 1) - 1)];
  const initialThrottle = p0 ? [p0[2]?.throttle, p1?.[2]?.throttle, p2?.[2]?.throttle].map(v => v != null ? Number(v.toFixed(2)) : null) : null;

  return {
    name,
    ok: res.run?.ok ?? false,
    durationSec: res.durationSec ? Number(res.durationSec.toFixed(2)) : null,
    hardSec: res.hardSec,
    overtakeKt: res.overtakeKt,
    initialThrottle,
    minKias: res.run?.minKias ? Number(res.run.minKias.toFixed(1)) : null,
    maxG: res.run?.maxG ? Number(res.run.maxG.toFixed(2)) : null,
    elapsedMs,
  };
}

console.log('--- REJOIN MATRIX RUN ---');
const scenarios = [
  { name: '1. TRJ Line Abreast -> FW (Right Turn, s=1)', from: 'lineAbreast', spacingFt: 6000, to: 'fw', s: 1 },
  { name: '2. TRJ Line Abreast -> FW (Left Turn, s=-1)', from: 'lineAbreast', spacingFt: 6000, to: 'fw', s: -1 },
  { name: '3. TRJ Line Abreast -> Echelon (Right Turn, s=1)', from: 'lineAbreast', spacingFt: 6000, to: 'echelon', s: 1 },
  { name: '4. TRJ Line Abreast -> Echelon (Left Turn, s=-1)', from: 'lineAbreast', spacingFt: 6000, to: 'echelon', s: -1 },
  { name: '5. TRJ FW -> Echelon (Cold, s=-1)', from: 'fw', spacingFt: 1000, to: 'echelon', s: -1 },
];

const results = scenarios.map(sc => runRejoin(sc.name, sc));
console.table(results);
