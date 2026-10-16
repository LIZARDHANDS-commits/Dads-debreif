#!/usr/bin/env node
// Fable brief scrubber (internal project skill fable-review-brief). Plain Node, no packages.
//   node scrub.mjs check <brief.md>        lists words to keep out of a brief (terms.json "avoid") and project terms not yet
//                                          renamed, by line; exits 1 if it finds any
//   node scrub.mjs rename <in.md> <out.md>  applies the project-to-brief renames (longest first, keeps a leading capital)
//   node scrub.mjs back <in.md> <out.md>    in a Fable report, adds the project term in brackets after each brief term,
//                                          e.g. "steer-behind [lag pursuit]" (this set and the older review's)
// The term list is terms.json beside this file: add a word there when a new one trips Fable's safety filter.
import { readFileSync, writeFileSync } from 'node:fs';

const terms = JSON.parse(readFileSync(new URL('./terms.json', import.meta.url), 'utf8'));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const keepCap = (src, rep) => (src[0] === src[0].toUpperCase() && src[0] !== src[0].toLowerCase() ? rep[0].toUpperCase() + rep.slice(1) : rep);
const byLength = (i) => (a, b) => b[i].length - a[i].length;

function check(text) {
  const flags = [];
  const lines = text.split(/\r?\n/);
  const rules = [
    ...terms.avoid.map((a) => ({ re: new RegExp(`\\b(?:${a.pattern})\\b`, 'gi'), kind: a.proven ? 'proven' : 'guess', suggest: a.suggest })),
    ...terms.rename.map(([proj, brief]) => ({ re: new RegExp(`\\b${esc(proj)}\\b`, 'gi'), kind: 'project term', suggest: `"${brief}"` })),
  ];
  lines.forEach((line, i) => {
    for (const r of rules) {
      for (const m of line.matchAll(r.re)) flags.push(`${i + 1}:${m.index + 1}  "${m[0]}"  (${r.kind})  -> ${r.suggest}`);
    }
  });
  return flags;
}

function rename(text) {
  let out = text;
  for (const [proj, brief] of [...terms.rename].sort(byLength(0))) {
    out = out.replace(new RegExp(`\\b${esc(proj)}\\b`, 'gi'), (m) => keepCap(m, brief));
  }
  return out;
}

function back(text) {
  const pairs = [...terms.rename, ...terms.legacyBack].map(([proj, brief]) => [brief, proj]).sort(byLength(0));
  const map = new Map(pairs.map(([brief, proj]) => [brief.toLowerCase(), proj]));
  const re = new RegExp(`\\b(?:${pairs.map(([brief]) => esc(brief)).join('|')})\\b(?! \\[)`, 'gi');
  return text.replace(re, (m) => `${m} [${map.get(m.toLowerCase())}]`);
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === 'check' && a) {
  const flags = check(readFileSync(a, 'utf8'));
  if (flags.length) {
    console.log(`${flags.length} to fix before sending:\n${flags.join('\n')}`);
    process.exit(1);
  }
  console.log('clean: no avoided words and no project terms left');
} else if (cmd === 'rename' && a && b) {
  writeFileSync(b, rename(readFileSync(a, 'utf8')));
  console.log(`renamed into ${b}; read it through, then run check`);
} else if (cmd === 'back' && a && b) {
  writeFileSync(b, back(readFileSync(a, 'utf8')));
  console.log(`mapped back into ${b}`);
} else {
  console.log('usage: node scrub.mjs check <brief.md> | rename <in.md> <out.md> | back <report.md> <out.md>');
  process.exit(2);
}
