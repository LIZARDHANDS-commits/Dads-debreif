// Makes docs/modules/turn-sim/numbers.md, the Formation Sim's numbers register (refactor PR 4, TS-95) and its tuning sheet
// (TS-214): every number in the sheet's files with the source written beside it, the aircraft's own limits (core
// t6-performance.js) first. Run from the repo root:
//   node tools/turn-sim-numbers.mjs
// It reads the files as text (no import), so it lists exactly what is written there, comments included.
import { readFileSync, writeFileSync } from 'node:fs';

const dir = 'src/modules/turn-sim/live/';
const FILES = [
  ['../../../core/t6-performance.js', 'The aircraft: the T-6A\'s own limits (core, shared with every module)'],
  ['handling.js', 'Handling: how the steppers fly the aircraft on top of its limits'],
  ['rates.js', 'Rates: the G rule, the rate sets, the Rates setting, roll, banks'],
  ['lead-moves.js', 'Lead: the moves Lead flies, in the programme and in fluid'],
  ['wing-moves.js', 'Wingmen: the live laws, the close turns\' held poses, the fluid exercise, the rolling rejoin'],
  ['moves.js', 'Moves: the tracker\'s numbers and each tracker move\'s'],
  ['bands.js', 'Bands: in position and done'],
];
const cell = (s) => s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim(); // backslashes first, then the table's pipes

function rows(text) {
  const out = [];
  const lines = text.split('\n');
  let block = null; // the exported object being read
  let doc = '';
  let depth = 0;
  let lead = ''; // the comment lines above a field, its source when it has none beside it (fields after one comment share it)
  let afterField = false;
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
      const above = line.match(/^\s{2,4}\/\/\s?(.*)$/);
      if (above) {
        lead = afterField ? above[1] : `${lead} ${above[1]}`;
        afterField = false;
        continue;
      }
      depth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      const field = line.match(/^\s{2}(\w+): (.*?),?\s*(\/\/\s?(.*))?$/);
      if (field && depth >= 1 && !/^\s{4}/.test(line)) {
        out.push([`${block}.${field[1]}`, cell(field[2].replace(/,$/, '')), (field[4] !== undefined ? cell(field[4]) : cell(lead).slice(0, 400))]);
        afterField = true;
      }
      else if (/^\s{4}\w+: /.test(line) && depth >= 2) {
        const f = line.match(/^\s{4}(\w+): (.*?),?\s*(\/\/\s?(.*))?$/);
        if (f) out.push([`${block}.…${f[1]}`, cell(f[2].replace(/,$/, '')), (f[4] !== undefined ? cell(f[4]) : cell(lead).slice(0, 400))]);
        afterField = true;
      }
      if (depth <= 0) {
        block = null;
        lead = '';
        afterField = false;
      }
    }
  }
  return out;
}

let md = `# Formation Sim numbers register\n\nEvery number the Formation Sim's planners use, with the source written beside it in the code (refactor PR 4, TS-95). `
  + `It is the tuning sheet's one page (TS-214): the aircraft's limits from core, then the Formation's handling, Lead's and the wingmen's technique and hands. `
  + `Made by \`node tools/turn-sim-numbers.mjs\` from core \`t6-performance.js\` and \`src/modules/turn-sim/live/\` handling.js, rates.js, lead-moves.js, wing-moves.js, moves.js and bands.js (\`tuning.js\` re-exports them); do not edit by hand. `
  + `"Estimate" means no manual page or ruling backs it yet. The formations' own places and bands are in \`slots.js\` and \`judge.js\`. `
  + `Not in the sheet yet: the 4-ship's numbers (four-*.js, joining at plan Step 12.8), the training errors (errors.js), the optimiser's scoring (optimise/) and the planners' search effort.\n`;
for (const [file, title] of FILES) {
  md += `\n## ${title} (\`${file.replace('../../../', 'src/')}\`)\n\n| Number | Value | Source and note |\n|---|---|---|\n`;
  for (const [name, value, note] of rows(readFileSync(dir + file, 'utf8'))) md += `| ${name} | ${value ? `\`${value}\`` : ''} | ${note} |\n`;
}
writeFileSync('docs/modules/turn-sim/numbers.md', md);
console.log(`docs/modules/turn-sim/numbers.md: ${md.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Number')).length} rows`);
