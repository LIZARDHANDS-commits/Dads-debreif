// Fails if any tracked text file is not valid UTF-8.
// Why: one Windows-1252 byte (0x97, a dash written by Windows PowerShell 5.1)
// in archive/docs/records/future-ideas.md broke the Pages build on 16 Oct 2026.
// Usage: node tools/check-utf8.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const TEXT = /\.(md|txt|html?|css|js|mjs|cjs|ts|json|ya?ml|svg|csv|xml)$/i;
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter((f) => TEXT.test(f));
const decoder = new TextDecoder('utf-8', { fatal: true });
const bad = [];
for (const f of files) {
  const bytes = readFileSync(f);
  try {
    decoder.decode(bytes);
  } catch {
    const at = bytes.findIndex((b) => b >= 0x80);
    bad.push(`${f} (first non-ASCII byte at offset ${at}: 0x${bytes[at].toString(16)})`);
  }
}
if (files.length === 0) {
  console.error('check-utf8: git ls-files returned no text files; the check itself is broken');
  process.exit(2);
}
if (bad.length) {
  console.error(`Not UTF-8 (re-save these as UTF-8):\n  ${bad.join('\n  ')}`);
  process.exit(1);
}
console.log(`check-utf8: ${files.length} text files, all UTF-8`);
