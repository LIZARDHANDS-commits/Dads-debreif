// Flight set for the refactor: end state after each press. Usage: node fset.mjs <repo root>
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : null;
const L = (file) => repoRoot
  ? pathToFileURL(resolve(repoRoot, 'src/modules/turn-sim/live', file)).href
  : new URL('../../src/modules/turn-sim/live/' + file, import.meta.url).href;

const F = await import(L('formation.js'));
const R = await import(L('rates.js'));

function wrapDeg180(deg) {
  return ((deg + 180) % 360 + 360) % 360 - 180;
}

function getPowerStage(a) {
  if (!a) return 'norm';
  const p = a.power;
  if (!p) return a.slowStage ?? 'norm';
  if (p.stage === 'idle') return 'idle';
  if (p.stage === 'idleBoards') return 'idleBoards';
  const isMax = p.throttle >= 0.985;
  if (p.stage === 'boards') return isMax ? 'maxBoards' : 'boards';
  if (isMax) return 'max';
  return 'norm';
}

const out = [];

const run = (f, label, fn) => {
  let r; const t0 = Date.now();
  try { r = fn(); } catch (e) { out.push(label + ' ERR ' + e.message); return; }

  const l0 = f.state.aircraft[0];
  const w0 = f.state.aircraft[1];
  let minRange = Infinity;
  let ahead39 = false;
  let maxG = w0 ? (w0.g ?? 1) : 1;
  let maxBank = w0 ? Math.abs(w0.bankDeg ?? 0) : 0;
  let maxRollAccel = 0;
  let maxBumpBank = 0;
  let maxBumpSpeed = 0;

  const bankHistory = [];
  const stateHistory = [];
  const stageHistory = [];

  function samplePoint(lead, wing) {
    if (!lead || !wing) return;
    const dx = wing.xFt - lead.xFt;
    const dy = wing.yFt - lead.yFt;
    const dz = (wing.altAboveFt ?? 0) - (lead.altAboveFt ?? 0);
    const range = Math.hypot(dx, dy, dz);
    if (range < minRange) minRange = range;
    const fwd = dx * Math.cos(lead.headingRad) + dy * Math.sin(lead.headingRad);
    if (range < 1000 && fwd > 0) ahead39 = true;
    const g = wing.g ?? 1;
    if (g > maxG) maxG = g;
    const b = Math.abs(wing.bankDeg ?? 0);
    if (b > maxBank) maxBank = b;
  }

  if (l0 && w0) {
    samplePoint(l0, w0);
    const b0 = w0.bankDeg ?? 0;
    bankHistory.push(b0);
    stateHistory.push({ t: f.state.tSec, bankDeg: b0, kias: w0.kias });
    stageHistory.push({ stage: getPowerStage(w0), t: f.state.tSec });
  }

  let n = 0;
  let prevT = f.state.tSec;
  while ((f.state.current || f.state.queued) && n++ < 40000) {
    f.step();
    const lead = f.state.aircraft[0];
    const wing = f.state.aircraft[1];
    if (!wing) continue;

    const t = f.state.tSec;
    const dt = f.state.dtSec || (t - prevT) || 0.05;
    prevT = t;

    samplePoint(lead, wing);

    const curBank = wing.bankDeg ?? 0;
    bankHistory.push(curBank);
    const blen = bankHistory.length;
    if (blen >= 3) {
      const b0 = bankHistory[blen - 3];
      const b1 = bankHistory[blen - 2];
      const b2 = bankHistory[blen - 1];
      const d1 = wrapDeg180(b2 - b1);
      const d0 = wrapDeg180(b1 - b0);
      const accel = Math.abs(wrapDeg180(d1 - d0)) / (dt * dt);
      if (accel > maxRollAccel) maxRollAccel = accel;
    }

    const curState = { t, bankDeg: curBank, kias: wing.kias };
    for (const past of stateHistory) {
      const db = Math.abs(wrapDeg180(curBank - past.bankDeg));
      const ds = Math.abs(wing.kias - past.kias);
      if (db > maxBumpBank) maxBumpBank = db;
      if (ds > maxBumpSpeed) maxBumpSpeed = ds;
    }
    stateHistory.push(curState);
    while (stateHistory.length > 0 && t - stateHistory[0].t > 1.0 + 1e-6) {
      stateHistory.shift();
    }

    const st = getPowerStage(wing);
    const lastStage = stageHistory[stageHistory.length - 1];
    if (st !== lastStage?.stage) {
      stageHistory.push({ stage: st, t });
    }
  }

  const powerChanges = Math.max(0, stageHistory.length - 1);
  let hasFlip = false;
  for (let i = 2; i < stageHistory.length; i++) {
    for (let j = 0; j <= i - 2; j++) {
      if (stageHistory[i].stage === stageHistory[j].stage && (stageHistory[i].t - stageHistory[j + 1].t) <= 2.0 + 1e-6) {
        hasFlip = true;
        break;
      }
    }
    if (hasFlip) break;
  }
  const pwrStr = `${powerChanges}${hasFlip ? '(flip)' : ''}`;

  const baseLine = label + ' ' + r + ' t=' + f.state.tSec.toFixed(3) + ' ' + f.state.aircraft.map(a => [a.xFt, a.yFt, a.altAboveFt, a.kias].map(v => v.toFixed(3)).join(',')).join('|') + ' ' + JSON.stringify(f.where());
  const metrics = `minR=${(Number.isFinite(minRange) ? minRange : 0).toFixed(1)} a39=${ahead39 ? 'yes' : 'no'} maxG=${maxG.toFixed(2)} maxB=${maxBank.toFixed(1)} rollA=${maxRollAccel.toFixed(1)} pwr=${pwrStr} bump=b=${maxBumpBank.toFixed(1)}/s=${maxBumpSpeed.toFixed(1)}`;
  out.push(baseLine + ' ' + metrics);
  process.stderr.write(label + ' ' + (Date.now() - t0) + 'ms\n');
};

const two = [
  ['fw', { side: 'keep', rejoin: 'into' }], ['echelon', {}], ['route', {}], ['echelon', {}], ['fw', {}], ['lab', {}],
  ['fw', { rejoin: 'straight' }], ['LAG'], ['FW', 'levelTurn', 1], ['FW', 'wingsLevel', 1], ['lab', { side: 'left' }],
  ['fw', { rejoin: 'roll' }], ['lab', {}], ['echelon', { rejoin: 'into' }], ['astern', {}], ['lab', {}],
];

for (const rates of ['student', 'instructor', 'ai']) {
  R.setRates(rates);
  const f = F.createFormation({ ships: 2 });
  two.forEach((p, i) => run(f, `${rates} ${i} ${p.join(':').replace(/\[object Object\]/, JSON.stringify(p[1]))}`,
    () => p[0] === 'LAG' ? f.lagRoll() : p[0] === 'FW' ? f.pressFw(p[1], p[2]) : f.change(p[0], p[1])));
}
R.setRates('instructor');
const f4 = F.createFormation({ ships: 4 });
for (const to of ['fw', 'finger', 'echelon', 'box', 'trail', 'spread4', 'fluid4', 'offsetBox', 'finger']) run(f4, '4 ' + to, () => f4.change(to, {}));

console.log(out.join('\n'));
