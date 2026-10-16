// Patrick's faults per case (plan T29m part 2; his first flight of Live, 14 Oct 2026: "overcontrolling his aimpoint and roll
// and G way too much ... holding too much low stack ... the excess G and fast onset is bleeding his energy"), from the
// gauge's fighting wing traces (their `faults` key, written by tools/formation-gauge.mjs). A measure, not a test.
//   node tools/control-map/faults.mjs [--tag cm] [--dir tmp/gauge]    writes tools/control-map/results/faults.json
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const tag = opt('--tag', 'cm');
const dir = opt('--dir', 'tmp/gauge');
const rows = [];
for (const f of readdirSync(dir).filter((x) => x.startsWith('b5-') && x.endsWith(`.${tag}.json`)).sort()) {
  const tr = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
  for (const q of tr.faults ?? []) {
    if (q.aircraft !== '#2') continue;
    const { counts, ...rest } = q;
    rows.push({ case: tr.name.replace(/^b5-/, ''), ...rest, press: tr.presses[q.press]?.label ?? String(q.press), changes: counts?.changes ?? {}, limitSec: counts?.limitSec ?? {} });
  }
}
mkdirSync('tools/control-map/results', { recursive: true });
writeFileSync('tools/control-map/results/faults.json', `${JSON.stringify({ tag, note: 'from the gauge\'s fighting wing traces; thresholds in tools/formation-gauge.mjs (estimates)', rows }, null, 1)}\n`);
for (const r of rows) console.log(`${r.case.padEnd(20)} ${r.press.slice(0, 34).padEnd(34)} onset ${r.onsetMaxGps} G/s (${r.onsetFastSec} s fast) | aim jumps ${r.aimJumps} | wrong-way ${r.wrongWaySec} s | over Lead+0.5 ${r.overLeadSec} s | torque swings ${r.torqueSwings} | low ${r.lowSec} s (${r.lowestFt}) | lost ${r.kiasLostVsLead} kt for ${r.gExcessGs} G·s | filter ${r.filterShare}`);
