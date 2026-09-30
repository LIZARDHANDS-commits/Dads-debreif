// Browser check for src/core (SPEC-core, testing strategy 5): loads the core
// modules in Chromium as plain ES modules and compares every result of
// parity-battery.js with Node's. Run before each core PR:
//
//   NODE_PATH=$(npm root -g) node tests/golden/checks/browser-parity.cjs
//
// Uses the globally installed Playwright, like tools/record_v6_baseline.js.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../../..'), S = __dirname;
(async () => {
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    const file = u === '/parity-battery.js' ? path.join(S, 'parity-battery.js') : u === '/' ? null : path.join(ROOT, u);
    if (u === '/favicon.ico') { res.writeHead(204); return res.end(); }
    if (!file) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><title>core</title>'); }
    fs.readFile(file, (e, buf) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(buf); });
  }).listen(0);
  const port = server.address().port, base = `http://127.0.0.1:${port}`;
  const { battery } = await import(path.join(S, 'parity-battery.js'));
  const nodeOut = await battery('file://' + ROOT);
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  await page.goto(base + '/');
  const version = await page.evaluate(() => navigator.userAgent);
  const webOut = await page.evaluate(async b => (await import(b + '/parity-battery.js')).battery(b), base);
  await browser.close(); server.close();
  let diff = 0;
  for (let i = 0; i < Math.max(nodeOut.length, webOut.length); i++) if (nodeOut[i] !== webOut[i]) { { diff++; const a = nodeOut[i].split(' = '), b = webOut[i].split(' = '); const nums = s => (s.match(/-?\d+\.?\d*(e-?\d+)?/g) || []).map(Number); const na = nums(a[1]), nb = nums(b[1]); const rel = Math.max(0, ...na.map((v, j) => Math.abs(v - nb[j]) / Math.max(Math.abs(v), 1e-300))); console.log('DIFF', a[0].replace(/\(.*/, ''), rel.toExponential(1)); } }
  console.log(version.match(/Chrome\/[\d.]+/)?.[0], `node ${process.version}`, `${nodeOut.length} results, ${diff} differ, ${errors.length} browser errors`, errors.slice(0, 3));
})();
