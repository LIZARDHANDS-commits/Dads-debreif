// Keep-unchanged check: compares two folders of gauge traces (copies of tmp/gauge taken before and after a change).
// Each file is byte-identical, or every value the "before" trace has is unchanged (the "after" may only add new columns),
// or DIFFERENT with the first differing path. Exit code 1 if anything is DIFFERENT or missing.
//   node "Pat's claude work/formation-review-12oct/gauge-trace-compare.mjs" <before-folder> <after-folder>
import { readdirSync, readFileSync } from 'node:fs';
const [a, b] = process.argv.slice(2);
let bad = 0;
for (const f of readdirSync(a).filter((f) => f.endsWith('.json')).sort()) {
  let tb;
  try { tb = readFileSync(`${b}/${f}`, 'utf8'); } catch { console.log(f, 'MISSING after'); bad++; continue; }
  const ta = readFileSync(`${a}/${f}`, 'utf8');
  if (ta === tb) { console.log(f, 'byte-identical'); continue; }
  let first = null;
  const walk = (x, y, p) => {
    if (first || JSON.stringify(x) === JSON.stringify(y)) return;
    if (x && y && typeof x === 'object' && !Array.isArray(x) && !Array.isArray(y)) {
      for (const k of Object.keys(x)) { if (!(k in y)) { first = `${p}.${k} gone`; return; } walk(x[k], y[k], `${p}.${k}`); }
      return;
    }
    first = `${p} values differ`;
  };
  walk(JSON.parse(ta), JSON.parse(tb), '');
  if (first) { console.log(f, 'DIFFERENT', first); bad++; } else console.log(f, 'unchanged (new columns only)');
}
console.log(bad ? `${bad} changed or missing` : 'all unchanged');
process.exit(bad ? 1 : 0);
