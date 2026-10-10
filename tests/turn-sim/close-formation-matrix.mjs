import { createFormation } from '../../src/modules/turn-sim/live/formation.js';
import { slotsFor } from '../../src/modules/turn-sim/live/slots.js';
import { planFormationTurn } from '../../src/modules/turn-sim/live/formation-turns.js';
let _bankSetting = 60;
function closeBankNow() { return _bankSetting; }
function setCloseBank(b) { _bankSetting = b; }

function setupCloseFormation(from = 'echelon', side = -1) {
  const sim = createFormation({ ships: 2, wingSide: side === 1 ? 'left' : 'right', spacingFt: 1000 });
  const [lead, wing] = sim.state.aircraft;
  const slot = slotsFor(from, side, { ships: 2 })[2];
  const h = lead.headingRad;
  const cosH = Math.cos(h);
  const sinH = Math.sin(h);
  wing.xFt = lead.xFt + slot.fwd * cosH - slot.left * sinH;
  wing.yFt = lead.yFt + slot.fwd * sinH + slot.left * cosH;
  wing.altAboveFt = lead.altAboveFt + slot.alt;
  wing.headingRad = lead.headingRad;
  wing.bankDeg = 0;
  wing.kias = lead.kias;
  return sim;
}

export function testCloseMove(name, from, side, to, sTo) {
  const sim = setupCloseFormation(from, side);
  const toSide = sTo === 1 ? 'left' : sTo === -1 ? 'right' : 'keep';
  const res = sim.change(to, { side: toSide });
  if (res !== 'started') {
    return { name, ok: false, reason: sim.state.refusal || res };
  }
  const wingPlan = sim.state.plans[2];
  const pts = wingPlan?.segments?.[0]?.points || [];
  let maxBank = 0;
  let maxOvertake = 0;
  let maxUndertake = 0;
  let minAltDiff = Infinity;
  let durationSec = sim.state.current.endSec - sim.state.current.startSec;

  const lead = sim.state.aircraft[0];
  for (const pt of pts) {
    // pt is [t, x, y, alt, heading, bank, rollRate, pitch, g, kias, throttle, brake] or [bank, kias, { ... }]
    const bank = Math.abs(pt[0] ?? 0);
    const kias = pt[1] ?? lead.kias;
    if (bank > maxBank) maxBank = bank;
    if (kias - lead.kias > maxOvertake) maxOvertake = kias - lead.kias;
    if (lead.kias - kias > maxUndertake) maxUndertake = lead.kias - kias;
  }

  return {
    name,
    ok: true,
    durationSec: Number(durationSec.toFixed(1)),
    maxBankDeg: Number(maxBank.toFixed(1)),
    maxOvertakeKt: Number(maxOvertake.toFixed(1)),
    maxUndertakeKt: Number(maxUndertake.toFixed(1)),
  };
}

export function testCloseTurn(name, formation, turnKey, dir, bankSetting = 60) {
  setCloseBank(bankSetting);
  const sim = setupCloseFormation(formation, -1);
  const turnPlan = planFormationTurn(sim.state.aircraft, { key: formation, side: -1 }, turnKey, dir, 0);
  if (!turnPlan || !turnPlan.ok) {
    return { name, ok: false, reason: turnPlan?.reason };
  }
  const wingPoses = turnPlan.plans[2]?.segments?.[0]?.poses || [];
  const leadSegs = turnPlan.plans[1]?.segments || [];
  let maxRelBankErr = 0;
  let maxWingBank = 0;
  for (const p of wingPoses) {
    if (Math.abs(p.bank) > maxWingBank) maxWingBank = Math.abs(p.bank);
    // Relative bank error against commanded turn bank
    const err = Math.abs(Math.abs(p.bank) - turnPlan.leadBankDeg);
    if (err > maxRelBankErr) maxRelBankErr = err;
  }
  return {
    name,
    ok: true,
    leadBankDeg: turnPlan.leadBankDeg,
    maxWingBankDeg: Number(maxWingBank.toFixed(1)),
    durationSec: Number((turnPlan.endSec).toFixed(1)),
    note: turnPlan.note.slice(0, 60) + '...',
  };
}

console.log('--- CLOSE FORMATION MATRIX RUN ---');
const moves = [
  testCloseMove('1. Station Change (Ech R -> Ech L)', 'echelon', -1, 'echelon', 1),
  testCloseMove('2. Route -> Echelon (Closing In)', 'route', -1, 'echelon', -1),
  testCloseMove('3. Echelon -> Route (Opening Out)', 'echelon', -1, 'route', -1),
  testCloseMove('4. Echelon -> Line Astern', 'echelon', -1, 'astern', 0),
  testCloseTurn('5. Echelon Turn (Setting 30°)', 'echelon', 'delayed90', 1, 30),
  testCloseTurn('6. Echelon Turn (Setting 45°)', 'echelon', 'delayed90', 1, 45),
  testCloseTurn('7. Echelon Turn (Setting 60°)', 'echelon', 'delayed90', 1, 60),
];
console.table(moves);
