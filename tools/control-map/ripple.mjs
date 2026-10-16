// The switching map's ripple (plan section 4.6; signals.mjs SWITCHES[].ripple): for each switch whose trigger the gauge
// traces, how often #2's trigger signal crosses the switch's line in the fighting wing set, and how much it wobbles there:
// over 1 s either side of each crossing, the spread of the signal about its own straight-line trend. A hysteresis band
// narrower than about twice that wobble will chatter (an estimate, plan C6). A measure, not a test.
//   node tools/control-map/ripple.mjs [--tag cm] [--dir tmp/gauge]     writes tools/control-map/results/ripple.json
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { SWITCHES, META } from './signals.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const tag = opt('--tag', 'cm');
const dir = opt('--dir', 'tmp/gauge');
const HALF = 20; // samples either side: 1 s at the gauge's 0.05 s step

const files = readdirSync(dir).filter((f) => f.startsWith('b5-') && f.endsWith(`.${tag}.json`)).sort();
const series = files.map((f) => {
  const tr = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
  return { f, w: tr.aircraft[Object.keys(tr.aircraft)[1]] };
});

function wobble(x, i) {
  const pts = [];
  for (let k = Math.max(0, i - HALF); k <= Math.min(x.length - 1, i + HALF); k++) if (Number.isFinite(x[k])) pts.push([k, x[k]]);
  if (pts.length < 5) return null;
  const n = pts.length;
  const mx = pts.reduce((a, p) => a + p[0], 0) / n;
  const my = pts.reduce((a, p) => a + p[1], 0) / n;
  const sxx = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
  const b = sxx > 0 ? pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / sxx : 0;
  const r = pts.map((p) => p[1] - (my + b * (p[0] - mx)));
  return Math.max(...r) - Math.min(...r);
}

const out = [];
for (const sw of SWITCHES.filter((s) => s.ripple)) {
  const { col, line, band } = sw.ripple;
  let crossings = 0;
  const wob = [];
  for (const { w } of series) {
    const x = w[col];
    if (!x) continue;
    for (let i = 1; i < x.length; i++) {
      if (!Number.isFinite(x[i]) || !Number.isFinite(x[i - 1])) continue;
      if ((x[i - 1] - line) * (x[i] - line) < 0) {
        crossings++;
        const v = wobble(x, i);
        if (v !== null) wob.push(v);
      }
    }
  }
  wob.sort((a, b) => a - b);
  const med = wob.length ? wob[Math.floor(wob.length / 2)] : null;
  out.push({ id: sw.id, col, line, band, crossings, files: series.length, wobbleMedian: med === null ? null : +med.toFixed(1), bandOverWobble: med ? +(band / med).toFixed(2) : null });
}
mkdirSync('tools/control-map/results', { recursive: true });
writeFileSync('tools/control-map/results/ripple.json', `${JSON.stringify({ code: META.codeAt, tag, files: files.length, note: 'crossings of the on line over the fighting wing set; wobble: median spread about the 2 s trend at a crossing', rows: out }, null, 1)}\n`);
for (const r of out) console.log(`${r.id.padEnd(14)} ${r.col.padEnd(12)} line ${String(r.line).padStart(4)} band ${String(r.band).padStart(3)} | crossings ${String(r.crossings).padStart(4)} | wobble ${r.wobbleMedian} | band/wobble ${r.bandOverWobble}`);
