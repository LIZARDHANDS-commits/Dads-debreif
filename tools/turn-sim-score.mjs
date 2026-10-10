// Phase A of the optimiser (Patrick 10 Oct 2026 20:20Z): scores the moves today's planners choose over a flight set and
// writes the per-term seconds for Patrick to read before any weight is set. Changes nothing that flies.
// Run from the repo root:   node tools/turn-sim-score.mjs [out.md]
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createFormation } from '../src/modules/turn-sim/live/formation.js';
import { scoreFlight, TERMS, START_WEIGHTS } from '../src/modules/turn-sim/live/optimise/score.js';
import { pairSlot, LANE } from '../src/modules/turn-sim/live/slots.js';
import { lineKiasNow } from '../src/modules/turn-sim/live/tuning.js';

const out = process.argv[2] ?? "Pat's claude work/turn-sim-review/score-card/score-card.md";
const keep = (a) => ({ xFt: a.xFt, yFt: a.yFt, altAboveFt: a.altAboveFt, headingRad: a.headingRad, bankDeg: a.bankDeg, rollRateDps: a.rollRateDps, pitchDeg: a.pitchDeg, kias: a.kias, g: a.g, power: a.power ? { ...a.power } : null, slowStage: a.slowStage });
const settle = (f) => { let n = 0; while (f.state.current && n++ < 8000) f.step(); };

/** The flight set: the TRJ gauge's starts plus SARJ, Away and the break's trail (estimate of what covers the 2-ship). */
const SET = [
  ['LAB 5,000 right to echelon (TRJ)', { spacingFt: 5000 }, null, 'echelon', { rejoin: 'into' }],
  ['LAB 4,000 to echelon (TRJ)', { spacingFt: 4000 }, null, 'echelon', { rejoin: 'into' }],
  ['LAB 6,000 to echelon (TRJ)', { spacingFt: 6000 }, null, 'echelon', { rejoin: 'into' }],
  ['LAB 5,000 to fighting wing (TRJ)', { spacingFt: 5000 }, null, 'fw', { rejoin: 'into' }],
  ['LAB 5,000 to route (TRJ)', { spacingFt: 5000 }, null, 'route', { rejoin: 'into' }],
  ['LAB 5,000 to echelon (TRJ Away)', { spacingFt: 5000 }, null, 'echelon', { rejoin: 'into', turn: 'away' }],
  ['LAB 5,000 to echelon (SARJ)', { spacingFt: 5000 }, null, 'echelon', { rejoin: 'straight' }],
  ['LAB 5,000 to echelon (TRJ + roll)', { spacingFt: 5000 }, null, 'echelon', { rejoin: 'roll' }],
  ['LAB hot, 20 kt fast, to echelon', { spacingFt: 5000, errSpeed: 'fast', errSpeedKias: 20 }, null, 'echelon', { rejoin: 'into' }],
  ['Fighting wing to echelon (TRJ)', { spacingFt: 5000 }, (f) => { f.change('fw', {}); settle(f); }, 'echelon', { rejoin: 'into' }],
  ['Break and rejoin, trail to echelon (TRJ)', { spacingFt: 5000 }, (f) => { f.change('echelon', {}); settle(f); f.press('breakRejoin', 0); settle(f); }, 'echelon', { rejoin: 'into' }],
  ['Break and rejoin, trail to echelon (SARJ)', { spacingFt: 5000 }, (f) => { f.change('echelon', {}); settle(f); f.press('breakRejoin', 0); settle(f); }, 'echelon', { rejoin: 'straight' }],
];

const rows = [];
for (const [name, opts, pre, to, change] of SET) {
  const f = createFormation({ ships: 2, ...opts });
  if (pre) pre(f);
  const how = f.change(to, { side: 'keep', ...change });
  if (how === 'refused') { rows.push({ name, refused: f.state.refusal }); continue; }
  const c = f.state.current.change;
  const samples = [{ t: f.state.tSec, lead: keep(f.state.aircraft[0]), wing: keep(f.state.aircraft[1]) }];
  let n = 0;
  while (f.state.current && n++ < 8000) { f.step(); samples.push({ t: f.state.tSec, lead: keep(f.state.aircraft[0]), wing: keep(f.state.aircraft[1]) }); }
  const side = c.side || 1;
  const laneLimitFt = to === 'fw' ? Math.max(0, pairSlot('fw', side, 6000).fwd) + LANE.marginFt : Math.max(0, pairSlot(to, side, 6000)?.fwd ?? 0);
  const s = scoreFlight({ samples, to, side, lineKias: lineKiasNow(), laneLimitFt });
  rows.push({ name, flown: c.flying ?? '', s });
}

const fmt = (x) => (x < 0.05 ? '0' : x < 10 ? x.toFixed(1) : Math.round(x).toString());
const lines = [
  '# Formation optimiser, Phase A: the score card on today\'s plans',
  '',
  `Made by \`node tools/turn-sim-score.mjs\` (${new Date().toISOString().slice(0, 16)}Z). Nothing that flies changed. Each cell is the term's raw seconds before its weight (weights: Fable's starting ones, optimiser plan section 4, until Patrick rules). Hard limits show under Rejects. Every scale is an estimate (\`src/modules/turn-sim/live/optimise/score.js\`).`,
  '',
  `| Start | ${TERMS.map((t) => t.label).join(' | ')} | Weighted total | Rejects |`,
  `|---|${TERMS.map(() => '---').join('|')}|---|---|`,
];
for (const r of rows) {
  if (r.refused) { lines.push(`| ${r.name} | refused: ${r.refused} |`); continue; }
  lines.push(`| ${r.name} | ${TERMS.map((t) => fmt(r.s.terms[t.key].raw)).join(' | ')} | ${fmt(r.s.total)} | ${r.s.rejects.join('; ') || 'none'} |`);
}
lines.push('', '| Term | Starting weight | Source |', '|---|---|---|', ...TERMS.map((t) => `| ${t.label} | ${START_WEIGHTS[t.key]} | ${t.source} |`), '');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, lines.join('\n'));
console.log(lines.join('\n'));
