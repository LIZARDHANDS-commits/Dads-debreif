// The control map's check (tools/control-map/README.md): the master list (signals.mjs) against itself, against a gauge
// run's trace columns and against the code's tuning tables. A measuring script, not a test: run it when a wingman file
// changes, and fix signals.mjs in the same piece of work when it fails.
//   node tools/control-map/check.mjs [--tag cm] [--dir tmp/gauge]
//   node tools/control-map/check.mjs --drop-row closureSlant      known-bad: a row missing from the master list
//   node tools/control-map/check.mjs --fake-column madeUpFtps    known-bad: a trace column the master list doesn't know
//   node tools/control-map/check.mjs --drop-ledger FW_WING.aimSec known-bad: a tuning number with no ledger entry
// Exit code 1 on any failure.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import * as M from './signals.mjs';
import { allLeaves, ledgerEntry, sourceOf } from './tables.mjs';

const args = process.argv.slice(2);
const opt = (k, d = null) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const tag = opt('--tag', 'cm');
const dir = opt('--dir', 'tmp/gauge');
const dropRow = opt('--drop-row');
const fakeColumn = opt('--fake-column');
const dropLedger = opt('--drop-ledger');

const fails = [];
const warns = [];
const fail = (s) => fails.push(s);

const signals = M.SIGNALS.filter((s) => s.id !== dropRow);
if (dropRow && signals.length === M.SIGNALS.length) fail(`--drop-row ${dropRow}: no such signal`);
const ledger = { ...M.LEDGER };
if (dropLedger) delete ledger[dropLedger];

// 1. The master list against itself
const blocks = new Set(M.BLOCKS.map((b) => b.id));
const known = (id, where) => { if (!blocks.has(id)) fail(`${where}: unknown block ${id}`); };
for (const s of signals) {
  for (const b of [...s.writers, ...s.readers]) known(b, `signal ${s.id}`);
  if (!M.DELAYS[s.delay]) fail(`signal ${s.id}: unknown delay kind ${s.delay}`);
}
const resIds = new Set(M.RESOURCES.map((r) => r.id));
for (const r of M.RESOURCES) {
  for (const [b] of r.writers) known(b, `resource ${r.id}`);
  for (const b of r.readers ?? []) known(b, `resource ${r.id}`);
  if (!M.RULE_TYPES.includes(r.rule.type)) fail(`resource ${r.id}: rule type ${r.rule.type} not one of ${M.RULE_TYPES.join(', ')}`);
  const distinct = new Set(r.writers.map(([b]) => b));
  if (distinct.size > 1 && r.rule.type === 'single') fail(`resource ${r.id}: ${distinct.size} writers but rule "single"`);
}
for (const h of M.HISTORY) { known(h.from, `history "${h.item}"`); known(h.to, `history "${h.item}"`); if (!resIds.has(h.res)) fail(`history "${h.item}": unknown resource ${h.res}`); }
for (const x of M.CROSSLINKS) { known(x.from, 'crosslink'); known(x.to, 'crosslink'); }
for (const w of M.SWITCHES) known(w.block, `switch ${w.id}`);

// 2. Against a gauge run's trace columns
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(`.${tag}.json`)) : [];
if (!files.some((f) => f.startsWith('b5-'))) fail(`no fighting wing traces ${dir}/b5-*.${tag}.json (run the gauge, README)`);
if (!files.some((f) => !f.startsWith('b5-'))) fail(`no close formation traces ${dir}/*.${tag}.json (run the gauge, README)`);
const seen = new Map(); // column -> files
for (const f of files) {
  const tr = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
  for (const a of Object.values(tr.aircraft ?? {})) for (const col of Object.keys(a)) (seen.get(col) ?? seen.set(col, new Set()).get(col)).add(f);
}
if (fakeColumn) seen.set(fakeColumn, new Set(['(--fake-column)']));
const claimed = new Map();
for (const s of signals) if (s.trace) claimed.set(s.trace, s.id);
for (const c of M.GENERIC_COLUMNS) claimed.set(c, '(every aircraft)');
for (const c of M.CONTROLLER_COLUMNS) { claimed.set(c.col, `controller column (${c.block})`); known(c.block, `controller column ${c.col}`); }
for (const [col, fs] of seen) if (!claimed.has(col)) fail(`trace column "${col}" (${[...fs][0]}) is in no master-list row`);
for (const [col, id] of claimed) if (files.length && !seen.has(col)) fail(`master-list row ${id} names trace column "${col}", which no ${tag} trace has`);

// 3. Against the code's tuning tables
const leaves = allLeaves();
const used = new Set();
for (const [path] of leaves) {
  const e = ledgerEntry(ledger, path);
  if (!e) fail(`tuning number ${path} has no ledger entry`);
  else { used.add(e.key); known(e.block, `ledger ${e.key}`); }
}
for (const k of Object.keys(ledger)) if (!used.has(k)) fail(`ledger entry ${k} matches no number in the code`);
const numbersMd = existsSync('docs/modules/turn-sim/numbers.md') ? readFileSync('docs/modules/turn-sim/numbers.md', 'utf8') : '';
const noSource = leaves.filter(([p]) => !sourceOf(numbersMd, p)).map(([p]) => p);
if (noSource.length) warns.push(`${noSource.length} numbers have no source row in numbers.md: ${noSource.join(', ')}`);

console.log(`control map check (${M.META.codeAt})`);
console.log(`  master list: ${M.BLOCKS.length} blocks, ${signals.length} signals, ${M.RESOURCES.length} resources, ${M.HISTORY.length} history items, ${M.SWITCHES.length} switches`);
console.log(`  traces: ${files.length} files tagged ${tag}, ${seen.size} columns seen, ${claimed.size} claimed`);
console.log(`  tuning: ${leaves.length} numbers, ${Object.keys(ledger).length} ledger entries`);
for (const w of warns) console.log(`  note: ${w}`);
if (fails.length) {
  console.log(`FAILED (${fails.length}):`);
  for (const f of fails) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('PASSED');
