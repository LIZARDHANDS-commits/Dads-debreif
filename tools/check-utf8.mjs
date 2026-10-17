// Fails if any tracked text file is:
//   1. Not valid UTF-8 (e.g. raw Windows-1252 0x97 byte or UTF-16LE from PowerShell >)
//   2. Prefixed with a UTF-8 BOM (EF BB BF) from Windows PowerShell 5.1 Set-Content -Encoding UTF8
//   3. Corrupted by Windows-1252 -> UTF-8 double-encoded Mojibake (e.g. â€”, â€“, Â°, Ã—)
//   4. Citing the controlled manual acronym in shipped public/ or src/ files (ALL-R24 / ALL-41)
// Usage: node tools/check-utf8.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const TEXT = /\.(md|txt|html?|css|js|mjs|cjs|ts|json|ya?ml|svg|csv|xml)$/i;
const MOJIBAKE = /\u00e2\u20ac[\u201c\u201d\u2018\u2019\u2026\u2022\u0153\u2122]|\u00e2\u2020\u2019|\u00c2[\u00b0\u00b1\u00b7]|\u00c3[\u2014\u00b7]|\ufffd/;
const SHIPPED_OR_SRC = /^(public|src)\//;
const CONTROLLED_DOC = /\bCFAFM\b/i;

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter((f) => TEXT.test(f));

const decoder = new TextDecoder('utf-8', { fatal: true });
const bad = [];

for (const f of files) {
  let bytes;
  try {
    bytes = readFileSync(f);
  } catch {
    continue;
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    bad.push(`${f} (starts with UTF-8 BOM EF BB BF; save as UTF-8 without BOM)`);
    continue;
  }
  let text;
  try {
    text = decoder.decode(bytes);
  } catch {
    const at = bytes.findIndex((b) => b >= 0x80);
    bad.push(`${f} (invalid UTF-8 byte at offset ${at}: 0x${bytes[at].toString(16)})`);
    continue;
  }
  const m = text.match(MOJIBAKE);
  if (m && f !== 'tools/check-utf8.mjs') {
    const line = text.slice(0, m.index).split('\n').length;
    bad.push(`${f}:${line} (Windows-1252 Mojibake sequence ${JSON.stringify(m[0])})`);
  }
  if (SHIPPED_OR_SRC.test(f) && CONTROLLED_DOC.test(text)) {
    const cm = text.match(CONTROLLED_DOC);
    const line = text.slice(0, cm.index).split('\n').length;
    bad.push(`${f}:${line} (controlled document reference in shipped/src file; violates ALL-R24)`);
  }
}

if (files.length === 0) {
  console.error('check-utf8: git ls-files returned no text files; the check itself is broken');
  process.exit(2);
}
if (bad.length) {
  console.error(`check-utf8 failed (${bad.length} issue(s)):\n  ${bad.join('\n  ')}`);
  process.exit(1);
}
console.log(`check-utf8: ${files.length} text files verified (valid UTF-8, no BOM, no Mojibake, ALL-R24 clean)`);
