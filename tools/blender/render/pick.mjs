// Names the part and material under points of a seat view, to find which piece is which.
// Usage: node tools/blender/render/pick.mjs 5181 '{"pitch":-10,"fov":55}' 0.5,0.6 0.3,0.7
// Points are fractions of the picture across and down.
import { chromium } from '@playwright/test';

const [port, view, ...pts] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 2000, height: 1400 } });
await p.goto(`http://localhost:${port}/tools/blender/render/cockpit.html?t=${Date.now()}`);
await p.waitForFunction(() => window.ready, null, { timeout: 60000 });
await p.evaluate((v) => window.shot(v), JSON.parse(view));
await p.waitForTimeout(4000);
await p.evaluate(() => window.rerender());
for (const pt of pts) {
  const [x, y] = pt.split(',').map(Number);
  console.log(x, y, JSON.stringify(await p.evaluate(([x, y]) => window.pick(x, y), [x, y])));
}
await b.close();
