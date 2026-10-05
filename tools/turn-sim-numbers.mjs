// Makes docs/modules/turn-sim/numbers.md, the Formation Sim's numbers register (refactor PR 4, TS-95): every number in
// src/modules/turn-sim/live/rates.js, bands.js and moves.js with the source written beside it. Run from the repo root:
//   node tools/turn-sim-numbers.mjs
// It reads the files as text (no import), so it lists exactly what is written there, comments included.
import { readFileSync, writeFileSync } from 'node:fs';

const FILES = [
  ['rates.js', 'Rates: the G rule, the rate sets, the Rates setting, roll, banks'],
  ['bands.js', 'Bands: in position and done'],
  ['moves.js', 'Moves: each move\'s numbers'],
];
const dir = 'src/modules/turn-sim/live/';
const cell = (s) => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

function rows(text) {
  const out = [];
  const lines = text.split('\n');
  let block = null; // the exported object being read
  let doc = '';
  let depth = 0;
  for (const line of lines) {
    const docLine = line.match(/^\s*\/\*\*\s?(.*?)(\*\/)?$/) || line.match(/^\s*\*\s(.*)$/);
    if (!block && /^\s*\/\*\*/.test(line)) doc = '';
    if (!block && docLine && !/^\s*\*\/\s*$/.test(line)) doc += ` ${docLine[1].replace(/\*\/$/, '')}`;
    const top = line.match(/^export const (\w+) = (.*)$/);
    if (top && !block) {
      const [, name, rest] = top;
      const comment = rest.includes('//') ? rest.slice(rest.indexOf('//') + 2) : '';
      if (/Object\.freeze\(\{\s*$/.test(rest) || /^\(?Object\.freeze\(\{\s*$/.test(rest)) {
        block = name;
        depth = 1;
        if (doc) out.push([name, '', cell(doc).slice(0, 400)]);
      } else {
        const value = rest.replace(/;?\s*(\/\/.*)?$/, '');
        out.push([name, cell(value), cell(comment || doc).slice(0, 400)]);
      }
      doc = '';
      continue;
    }
    if (block) {
      depth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      const field = line.match(/^\s{2}(\w+): (.*?),?\s*(\/\/\s?(.*))?$/);
      if (field && depth >= 1 && !/^\s{4}/.test(line)) out.push([`${block}.${field[1]}`, cell(field[2].replace(/,$/, '')), cell(field[4] ?? '')]);
      else if (/^\s{4}\w+: /.test(line) && depth >= 2) {
        const f = line.match(/^\s{4}(\w+): (.*?),?\s*(\/\/\s?(.*))?$/);
        if (f) out.push([`${block}.…${f[1]}`, cell(f[2].replace(/,$/, '')), cell(f[4] ?? '')]);
      }
      if (depth <= 0) block = null;
    }
  }
  return out;
}

let md = `# Formation Sim numbers register\n\nEvery number the Formation Sim's planners use, with the source written beside it in the code (refactor PR 4, TS-95). `
  + `Made by \`node tools/turn-sim-numbers.mjs\` from \`src/modules/turn-sim/live/\` rates.js, bands.js and moves.js; do not edit by hand. `
  + `"Estimate" means no manual page or ruling backs it yet. The formations' own places and bands are in \`slots.js\` and \`judge.js\`.\n`;
for (const [file, title] of FILES) {
  md += `\n## ${title} (\`${file}\`)\n\n| Number | Value | Source and note |\n|---|---|---|\n`;
  for (const [name, value, note] of rows(readFileSync(dir + file, 'utf8'))) md += `| ${name} | ${value ? `\`${value}\`` : ''} | ${note} |\n`;
}
writeFileSync('docs/modules/turn-sim/numbers.md', md);
console.log(`docs/modules/turn-sim/numbers.md: ${md.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Number')).length} rows`);
