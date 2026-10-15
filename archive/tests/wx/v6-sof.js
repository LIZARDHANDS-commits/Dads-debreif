// Load V6's own SOF weather functions, straight from original/shell.html, so the
// new parser can be compared with them. Decodes the SOF page the same way as
// tools/extract_subapps.py and pulls functions out by brace matching.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SHELL = fileURLToPath(new URL('../../../original/shell.html', import.meta.url));

function sofPage() {
  const text = readFileSync(SHELL, 'utf8');
  const m = text.match(/window\.__SOF_DOC__=new TextDecoder\("utf-8"\)\.decode\(Uint8Array\.from\(atob\("([A-Za-z0-9+/=]+)"/);
  if (!m) throw new Error('embedded SOF page not found in original/shell.html');
  return Buffer.from(m[1], 'base64').toString('utf8');
}

function functionSource(src, name, from) {
  const i = src.indexOf(`function ${name}(`, from);
  if (i < 0) throw new Error(`V6 function not found: ${name}`);
  let depth = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}' && --depth === 0) return src.slice(i, k + 1);
  }
  throw new Error(`unbalanced braces in V6 function ${name}`);
}

/** V6's functions, each from the script the live SOF actually runs. */
export function loadV6() {
  const sof = sofPage();
  // ifpWaveTimeAssessmentV2: the live home-weather alternate trigger (sof.html 1412-1520).
  const v2 = sof.indexOf('<script id="ifpWaveTimeAssessmentV2">');
  // The 24-hour timeline (V8), the last script on the page (sof.html 1990-2053).
  const v8 = sof.lastIndexOf('function visibility(');
  const names = [
    ['vals', v2], ['utcFor', v2], ['tafValidity', v2], ['overlap', v2], ['tafHazards', v2],
    ['visibility', v8], ['nato', v8],
    ['pk', 0], ['ceiling', 0], ['cat', 0], ['parseRawMetar', 0],
  ];
  const body = names.map(([n, at]) => functionSource(sof, n, at)).join('\n');
  // eslint-disable-next-line no-new-func
  return new Function(`${body}\nreturn { vals, tafHazards, visibility, nato, cat, ceiling, parseRawMetar };`)();
}
