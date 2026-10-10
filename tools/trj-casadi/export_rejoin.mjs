// tools/trj-casadi/export_rejoin.mjs
// Exports the canonical 4 comparison scenarios from the JavaScript simulator:
// 1. Nominal 4,000 ft Line Abreast (220 KIAS) - Plain Turning Rejoin
// 2. Nominal 4,000 ft Line Abreast (220 KIAS) - Rolling Rejoin
// 3. Hot / Acute Start (+20 kt, +1,200 ft ahead) - Plain Turning Rejoin
// 4. Hot / Acute Start (+20 kt, +1,200 ft ahead) - Rolling Rejoin

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createFormation } from '../../src/modules/turn-sim/live/formation.js';
import { setRates } from '../../src/modules/turn-sim/live/rates.js';
import { relativeTo } from '../../src/modules/turn-sim/live/manoeuvres.js';
import { planRollingRejoin } from '../../src/modules/turn-sim/live/rolling-rejoin.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function runSim({ label, formationOpts, forceRoll = false }) {
  setRates('instructor');
  const f = createFormation(formationOpts);

  const l0 = f.state.aircraft[0];
  const w0 = f.state.aircraft[1];
  const initRel = relativeTo(l0, w0);
  const initUp = (w0.altAboveFt ?? 0) - (l0.altAboveFt ?? 0);

  let planNote = '';
  if (forceRoll) {
    const rollPlan = planRollingRejoin(f.state.aircraft, 'echelon', {
      rejoin: 'roll',
      spacingFt: formationOpts.spacingFt ?? 4000,
      blockFt: formationOpts.blockFt ?? 8000,
    });
    if (!rollPlan || !rollPlan.ok) {
      throw new Error(`Failed to generate roll plan for ${label}`);
    }
    planNote = rollPlan.note ?? '';
    f.state.plans = rollPlan.plans;
    f.state.current = {
      key: 'change:echelon',
      change: { to: 'echelon', holdsPlan: false },
      label: 'Echelon right (roll)',
      note: planNote,
      startSec: 0,
      endSec: 200,
    };
  } else {
    const started = f.change('echelon', { rejoin: 'into' });
    if (!started) {
      throw new Error(`Failed to start ${label}: ${f.state.refusal}`);
    }
    planNote = f.state.current?.note ?? '';
  }

  const history = [];
  let minRange = Infinity;
  let maxG = 1;
  let maxBank = 0;
  let ahead39Count = 0;

  function recordStep() {
    const lead = f.state.aircraft[0];
    const wing = f.state.aircraft[1];
    const dx = wing.xFt - lead.xFt;
    const dy = wing.yFt - lead.yFt;
    const dz = (wing.altAboveFt ?? 0) - (lead.altAboveFt ?? 0);
    const range = Math.hypot(dx, dy, dz);
    if (range < minRange) minRange = range;

    const rel = relativeTo(lead, wing);
    if (range < 1000 && rel.fwd > 0) ahead39Count++;

    const g = wing.g ?? 1;
    if (g > maxG) maxG = g;
    const b = Math.abs(wing.bankDeg ?? 0);
    if (b > maxBank) maxBank = b;

    history.push({
      t: Number(f.state.tSec.toFixed(3)),
      lead: {
        x: Number(lead.xFt.toFixed(3)),
        y: Number(lead.yFt.toFixed(3)),
        alt: Number((lead.altAboveFt ?? 0).toFixed(3)),
        headingRad: Number(lead.headingRad.toFixed(5)),
        bankDeg: Number((lead.bankDeg ?? 0).toFixed(3)),
        kias: Number(lead.kias.toFixed(3)),
        g: Number((lead.g ?? 1).toFixed(3)),
      },
      wing: {
        x: Number(wing.xFt.toFixed(3)),
        y: Number(wing.yFt.toFixed(3)),
        alt: Number((wing.altAboveFt ?? 0).toFixed(3)),
        headingRad: Number(wing.headingRad.toFixed(5)),
        bankDeg: Number((wing.bankDeg ?? 0).toFixed(3)),
        kias: Number(wing.kias.toFixed(3)),
        g: Number(g.toFixed(3)),
        fwdFt: Number(rel.fwd.toFixed(3)),
        leftFt: Number(rel.left.toFixed(3)),
        upFt: Number(dz.toFixed(3)),
        rangeFt: Number(range.toFixed(3)),
        powerStage: wing.power?.stage ?? wing.slowStage ?? 'norm',
        throttle: Number((wing.power?.throttle ?? 0.5).toFixed(4)),
      },
    });
  }

  recordStep();

  let steps = 0;
  while ((f.state.current || f.state.queued) && steps++ < 20000) {
    f.step();
    recordStep();
  }

  const finalLead = f.state.aircraft[0];
  const finalWing = f.state.aircraft[1];
  const finalRel = relativeTo(finalLead, finalWing);
  const finalUp = (finalWing.altAboveFt ?? 0) - (finalLead.altAboveFt ?? 0);

  return {
    label,
    isRoll: forceRoll,
    planNote,
    totalTimeSec: Number(f.state.tSec.toFixed(3)),
    stepCount: history.length,
    initialRelative: {
      fwdFt: Number(initRel.fwd.toFixed(2)),
      leftFt: Number(initRel.left.toFixed(2)),
      upFt: Number(initUp.toFixed(2)),
      leadKias: l0.kias,
      wingKias: w0.kias,
    },
    finalRelative: {
      fwdFt: Number(finalRel.fwd.toFixed(2)),
      leftFt: Number(finalRel.left.toFixed(2)),
      upFt: Number(finalUp.toFixed(2)),
      leadKias: Number(finalLead.kias.toFixed(2)),
      wingKias: Number(finalWing.kias.toFixed(2)),
      rangeFt: Number(Math.hypot(finalRel.fwd, finalRel.left, finalUp).toFixed(2)),
    },
    metrics: {
      minRangeFt: Number(minRange.toFixed(2)),
      maxG: Number(maxG.toFixed(2)),
      maxBankDeg: Number(maxBank.toFixed(2)),
      ahead39Steps: ahead39Count,
    },
    whereResult: f.where(),
    history,
  };
}

console.log('--- Exporting Canonical Rejoin Scenarios ---');

console.log('\n[1/4] Nominal 4,000 ft Abeam -> Plain TRJ');
const nominalPlain = runSim({
  label: 'Nominal 4,000 ft Abeam -> Plain TRJ',
  formationOpts: { spacingFt: 4000, wingSide: 'right', kias: 220, blockFt: 8000 },
  forceRoll: false,
});
console.log(`      Time: ${nominalPlain.totalTimeSec}s | Min Range: ${nominalPlain.metrics.minRangeFt} ft | Final Rel: [fwd ${nominalPlain.finalRelative.fwdFt}, left ${nominalPlain.finalRelative.leftFt}]`);

console.log('\n[2/4] Nominal 4,000 ft Abeam -> Rolling Rejoin');
const nominalRoll = runSim({
  label: 'Nominal 4,000 ft Abeam -> Rolling Rejoin',
  formationOpts: { spacingFt: 4000, wingSide: 'right', kias: 220, blockFt: 8000 },
  forceRoll: true,
});
console.log(`      Time: ${nominalRoll.totalTimeSec}s | Min Range: ${nominalRoll.metrics.minRangeFt} ft | Final Rel: [fwd ${nominalRoll.finalRelative.fwdFt}, left ${nominalRoll.finalRelative.leftFt}]`);

console.log('\n[3/4] Hot/Acute Start (+20 kt, +1200 ft ahead) -> Plain TRJ');
const hotPlain = runSim({
  label: 'Hot/Acute Start (+20 kt, +1200 ft ahead) -> Plain TRJ',
  formationOpts: {
    spacingFt: 4000,
    wingSide: 'right',
    kias: 220,
    blockFt: 8000,
    errFore: 'ahead',
    errForeFt: 1200,
    errSpeed: 'fast',
    errSpeedKias: 20,
  },
  forceRoll: false,
});
console.log(`      Time: ${hotPlain.totalTimeSec}s | Min Range: ${hotPlain.metrics.minRangeFt} ft | Final Rel: [fwd ${hotPlain.finalRelative.fwdFt}, left ${hotPlain.finalRelative.leftFt}]`);

console.log('\n[4/4] Hot/Acute Start (+20 kt, +1200 ft ahead) -> Rolling Rejoin');
const hotRoll = runSim({
  label: 'Hot/Acute Start (+20 kt, +1200 ft ahead) -> Rolling Rejoin',
  formationOpts: {
    spacingFt: 4000,
    wingSide: 'right',
    kias: 220,
    blockFt: 8000,
    errFore: 'ahead',
    errForeFt: 1200,
    errSpeed: 'fast',
    errSpeedKias: 20,
  },
  forceRoll: true,
});
console.log(`      Time: ${hotRoll.totalTimeSec}s | Min Range: ${hotRoll.metrics.minRangeFt} ft | Final Rel: [fwd ${hotRoll.finalRelative.fwdFt}, left ${hotRoll.finalRelative.leftFt}]`);

const payload = {
  timestamp: new Date().toISOString(),
  blockFt: 8000,
  cases: {
    nominalPlain,
    nominalRoll,
    hotPlain,
    hotRoll,
  },
};

const outPath = resolve(__dirname, 'baseline_rejoins.json');
writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf-8');
console.log(`\n=> Successfully written all 4 baseline scenarios to ${outPath} (${(Buffer.byteLength(JSON.stringify(payload)) / 1024).toFixed(1)} KB)`);
