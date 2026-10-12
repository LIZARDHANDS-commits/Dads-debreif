// Renders the same views from past versions, for before-and-after sheets.
// Usage: git worktree add --detach ../ct156-old main   (once; node_modules is linked in for you)
//        node tools/blender/render/versions.mjs ../ct156-old list.txt out cpit|out|close
// list.txt has one "<commit> <label>" per line. Each commit is checked out in the worktree in turn and served on
// port 5190; out/<label>_<view>.png is written. Views: cpit = seat ahead and 45° left; out = front, side, top, iso;
// close = views/closeups.json. A version older than V2.209 has no cockpit.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [wt, list, outdir, mode] = process.argv.slice(2);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
fs.mkdirSync(outdir, { recursive: true });
if (!fs.existsSync(path.join(wt, 'node_modules'))) fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(wt, 'node_modules'), 'junction');
const rows = fs.readFileSync(list, 'utf8').trim().split(/\r?\n/).map((l) => l.trim().split(/\s+/));
const VIEWS = mode === 'close' ? JSON.parse(fs.readFileSync(path.join(HERE, 'views/closeups.json'), 'utf8'))
  : mode === 'cpit' ? { ahead: { pitch: -9, fov: 70 }, left: { yaw: 45, pitch: -20, fov: 60 } }
  : { front: { view: 'front' }, side: { view: 'side' }, top: { view: 'top' }, iso: { view: 'iso' } };
const fn = mode === 'cpit' ? 'cpit' : mode === 'close' ? 'close' : 'out';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [sha, label] of rows) {
  execSync(`git -C "${wt}" checkout -q -f ${sha}`);
  fs.copyFileSync(path.join(HERE, 'versions.html'), path.join(wt, 'tl-harness.html'));
  const server = await createServer({ configFile: false, root: wt, cacheDir: path.join(wt, '.vite-cache'), logLevel: 'error', server: { port: 5190, strictPort: true }, optimizeDeps: { entries: ['tl-harness.html'] } });
  await server.listen();
  const page = await browser.newPage({ viewport: { width: 2000, height: 1400 } });
  const warns = [];
  page.on('console', (m) => { if (m.type() === 'error' || /out of date/.test(m.text())) warns.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => warns.push('pageerror ' + String(e).slice(0, 160)));
  try {
    await page.goto(`http://localhost:5190/tl-harness.html?t=${Date.now()}`);
    await page.waitForFunction(() => window.ready, null, { timeout: 120000 });
    await page.evaluate(([f, o]) => window[f](o), [fn, Object.values(VIEWS)[0]]);
    await page.waitForTimeout(6000); // the model files load
    for (const [name, v] of Object.entries(VIEWS)) {
      await page.evaluate(([f, o]) => window[f](o), [fn, v]);
      await page.waitForTimeout(1500);
      await page.evaluate(() => window.rerender());
      await page.locator('#c').screenshot({ path: path.join(outdir, `${label}_${name}.png`) });
    }
    console.log('ok', label, sha, warns.join(' | '));
  } catch (e) { console.log('FAIL', label, sha, String(e).slice(0, 200), warns.join(' | ')); }
  await page.close(); await server.close();
}
await browser.close();
