// Renders the CT-156 from the views in a views file, with the app's own model code.
// Usage (with `npm run dev -- --port 5181` running): node tools/blender/render/shots.mjs 5181 out/name views/final.json [view,view]
// Writes out/name_<view>.png. "cpit" views are from a seat (cockpit.html), "surf" views from outside (outside.html).
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const [port, prefix, file, only] = process.argv.slice(2);
const all = JSON.parse(fs.readFileSync(file, 'utf8'));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const PAGE = { cpit: 'cockpit', surf: 'outside' };
for (const kind of ['cpit', 'surf']) {
  const shots = Object.entries(all[kind] ?? {}).filter(([n]) => !only || only.split(',').includes(n));
  if (!shots.length) continue;
  const page = await browser.newPage({ viewport: { width: 2000, height: 1400 } });
  page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') console.log('console', m.text().slice(0, 200)); });
  await page.goto(`http://localhost:${port}/tools/blender/render/${PAGE[kind]}.html?t=${Date.now()}`);
  await page.waitForFunction(() => window.ready, null, { timeout: 60000 });
  const fn = kind === 'cpit' ? 'shot' : 'view';
  await page.evaluate(([f, o]) => window[f](o), [fn, shots[0][1]]);
  await page.waitForTimeout(5000); // the Blender model files load
  for (const [name, v] of shots) {
    await page.evaluate(([f, o]) => window[f](o), [fn, v]);
    await page.waitForTimeout(1500); // the model file's parts attach after the first draw
    await page.evaluate(() => (window.rerender ? window.rerender() : true));
    await page.locator('#c').screenshot({ path: `${prefix}_${name}.png` });
    console.log('shot', name);
  }
  await page.close();
}
await browser.close();
