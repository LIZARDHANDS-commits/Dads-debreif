// Turns every *.svg in this folder into a PNG beside it, using the Playwright and Chromium already on this machine (nothing installed).
// Run: node render-png.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const here = new URL('.', import.meta.url).pathname;
const browser = await chromium.launch();
for (const f of readdirSync(here).filter((n) => n.endsWith('.svg'))) {
  const svg = readFileSync(here + f, 'utf8');
  const m = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  const w = +m[1], h = +m[2];
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  await page.screenshot({ path: here + f.replace(/\.svg$/, '.png'), clip: { x: 0, y: 0, width: w, height: h } });
  await page.close();
  console.log('wrote', f.replace(/\.svg$/, '.png'));
}
await browser.close();
