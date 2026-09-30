// Browser check for src/core (SPEC-core, testing strategy 5): loads the core
// modules in Chromium as plain ES modules and compares every result of
// parity-battery.js with Node's. Run before each core PR:
//
//   NODE_PATH=$(npm root -g) node tests/golden/checks/browser-parity.cjs
//
// Uses the globally installed Playwright, like tools/record_v6_baseline.js.
// Exits 1 if any result differs by more than the last digits, or the page logs an error.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
// Engines may round sin, cos and atan2 differently in the last digit (about 1e-16).
const TOLERANCE = 1e-12;
const NUMBER = /-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi;

function withinTolerance(a, b) {
  if (a === undefined || b === undefined) return false;
  const na = a.match(NUMBER) || [], nb = b.match(NUMBER) || [];
  if (na.length !== nb.length || a.replace(NUMBER, '#') !== b.replace(NUMBER, '#')) return false;
  return na.every((x, j) => {
    const p = Number(x), q = Number(nb[j]);
    return Math.abs(p - q) <= TOLERANCE * Math.max(Math.abs(p), Math.abs(q));
  });
}

function serve(req, res) {
  let url;
  try { url = decodeURIComponent(req.url.split('?')[0]); } catch { res.writeHead(400); return res.end(); }
  if (url === '/favicon.ico') { res.writeHead(204); return res.end(); }
  if (url === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><title>core</title>'); }
  const file = path.join(ROOT, url);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': 'text/javascript' });
    res.end(buf);
  });
}

async function main() {
  const server = http.createServer(serve).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const battery = '/tests/golden/checks/parity-battery.js';
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  try {
    const nodeOut = await (await import(path.join(ROOT, battery))).battery('file://' + ROOT);
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => m.type() === 'error' && errors.push(m.text()));
    await page.goto(base + '/');
    const agent = (await page.evaluate(() => navigator.userAgent)).match(/Chrome\/[\d.]+/)?.[0];
    const webOut = await page.evaluate(async ([b, f]) => (await import(b + f)).battery(b), [base, battery]);

    let lastDigits = 0;
    const real = [];
    for (let i = 0; i < Math.max(nodeOut.length, webOut.length); i++) {
      if (nodeOut[i] === webOut[i]) continue;
      if (withinTolerance(nodeOut[i], webOut[i])) lastDigits++;
      else real.push(i);
    }
    console.log(`${agent} vs Node ${process.version}: ${nodeOut.length} results in Node, ${webOut.length} in the browser; ` +
      `${lastDigits} differ only in the last digits, ${real.length} really differ, ${errors.length} browser errors`);
    for (const i of real.slice(0, 10)) console.log('DIFF', nodeOut[i], '|', webOut[i]);
    for (const e of errors.slice(0, 10)) console.log('ERROR', e);
    if (real.length || errors.length) process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(err => { console.error(err); process.exitCode = 1; });
