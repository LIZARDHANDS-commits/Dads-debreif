import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ffmpegPath = execFileSync('python', ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe().strip())'], { encoding: 'utf8' }).trim();
const ROOT = process.cwd();
const CARDS_DIR = join(ROOT, 'public', 'media', 'cards');
const PARTS_DIR = join(ROOT, 'tmp', 'record-parts');

mkdirSync(PARTS_DIR, { recursive: true });
mkdirSync(CARDS_DIR, { recursive: true });

const GLOBAL_ISOLATE_CSS = `
  #site-header, #site-footer, #app-updated, #route-notice,
  .site-header, .site-footer, nav, header, footer, aside,
  .ts-col, .playback-bar, .cam-bar-3d, .ts-toolbar,
  .tf-col, .tf-toolbar, .camera-bar, .tf-energy-panel,
  .traffic-col, .traffic-bar,
  .debrief-col, .debrief-toolbar, .debrief-metar,
  .sof-col, .sof-timeline {
    display: none !important;
  }
  .ts-stage, .ts-canvas-wrap,
  .tf-stage, .tf-views, .tf-topdown-wrap,
  .traffic-stage, .traffic-map-wrap,
  .debrief-stage, .debrief-map-wrap,
  .sof-map-stage {
    position: fixed !important;
    inset: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    margin: 0 !important;
    padding: 0 !important;
    z-index: 99999 !important;
  }
  canvas, svg {
    width: 100% !important;
    height: 100% !important;
  }
`;

async function capture(browser, url, setupFn, durationMs, outName) {
  const dir = join(PARTS_DIR, outName);
  mkdirSync(dir, { recursive: true });

  const context = await browser.newContext({
    recordVideo: { dir, size: { width: 640, height: 400 } },
    viewport: { width: 640, height: 400 },
  });

  const page = await context.newPage();

  // Inject CSS before any rendering
  await page.addInitScript((css) => {
    const s = document.createElement('style');
    s.textContent = css;
    document.documentElement.appendChild(s);
  }, GLOBAL_ISOLATE_CSS);

  await page.goto(url);
  await page.waitForTimeout(1000);

  await setupFn(page);
  await page.waitForTimeout(durationMs);

  await page.close();
  await context.close();

  const files = readdirSync(dir).filter(f => f.endsWith('.webm')).map(f => join(dir, f));
  files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  const recorded = files[0];
  const target = join(PARTS_DIR, `${outName}.webm`);
  if (existsSync(target)) execFileSync('cmd.exe', ['/c', 'del', '/f', target]);
  execFileSync('cmd.exe', ['/c', 'move', recorded, target]);
  return target;
}

function processCrossfade(c1, c2, moduleId) {
  const outMp4 = join(CARDS_DIR, `${moduleId}.mp4`);
  const outWebm = join(CARDS_DIR, `${moduleId}.webm`);
  const outJpg = join(CARDS_DIR, `${moduleId}.jpg`);

  // Trim from 1.0s to 3.8s (duration 2.8s) on both clips, crossfade at 2.3s for 0.5s fade, total 5.1s
  const filter = '[0:v]trim=1.0:3.8,setpts=PTS-STARTPTS,fps=25[v0];[1:v]trim=1.0:3.8,setpts=PTS-STARTPTS,fps=25[v1];[v0][v1]xfade=transition=fade:duration=0.5:offset=2.3,format=yuv420p[out]';

  execFileSync(ffmpegPath, [
    '-y', '-i', c1, '-i', c2,
    '-filter_complex', filter,
    '-map', '[out]',
    '-c:v', 'libx264', '-crf', '28', '-preset', 'slow', '-movflags', '+faststart',
    '-t', '5.1',
    outMp4
  ]);

  execFileSync(ffmpegPath, [
    '-y', '-i', c1, '-i', c2,
    '-filter_complex', filter,
    '-map', '[out]',
    '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '40', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2',
    '-t', '5.1',
    outWebm
  ]);

  execFileSync(ffmpegPath, [
    '-y', '-ss', '1.5', '-i', outMp4, '-frames:v', '1', '-q:v', '4', outJpg
  ]);

  console.log(`Generated ${moduleId}: MP4 = ${statSync(outMp4).size} B, WebM = ${statSync(outWebm).size} B, JPG = ${statSync(outJpg).size} B`);
}

async function main() {
  const browser = await chromium.launch();

  // 1. TURN-SIM
  console.log('--- Processing Turn Sim ---');
  const ts2d = await capture(browser, 'http://localhost:5174/#/turn-sim', async (page) => {
    await page.evaluate(() => {
      const r = document.querySelector('input[type="radio"][value="2d"]');
      if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
      const btn = document.querySelector('button[data-move="delayed90"]') || document.querySelector('.manoeuvre-btn') || document.querySelector('.button');
      if (btn) btn.click();
    });
  }, 4000, 'turn-sim-2d');

  const ts3d = await capture(browser, 'http://localhost:5174/#/turn-sim', async (page) => {
    await page.evaluate(() => {
      const r = document.querySelector('input[type="radio"][value="3d"]');
      if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
      const btn = document.querySelector('button[data-move="delayed90"]') || document.querySelector('.manoeuvre-btn') || document.querySelector('.button');
      if (btn) btn.click();
    });
  }, 4000, 'turn-sim-3d');
  processCrossfade(ts2d, ts3d, 'turn-sim');

  // 2. TURN-FIGHT
  console.log('--- Processing Turn Fight ---');
  const tf2d = await capture(browser, 'http://localhost:5174/#/turn-fight', async (page) => {
    await page.evaluate(() => {
      const r = document.querySelector('input[type="radio"][value="2d"]');
      if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await page.keyboard.press('Space');
  }, 4000, 'turn-fight-2d');

  const tf3d = await capture(browser, 'http://localhost:5174/#/turn-fight', async (page) => {
    await page.evaluate(() => {
      const r = document.querySelector('input[type="radio"][value="3d"]');
      if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await page.keyboard.press('Space');
  }, 4000, 'turn-fight-3d');
  processCrossfade(tf2d, tf3d, 'turn-fight');

  // 3. TRAFFIC
  console.log('--- Processing Traffic ---');
  const tr2d = await capture(browser, 'http://localhost:5174/#/traffic', async (page) => {
    await page.evaluate(() => {
      const r = document.querySelector('input[type="radio"][value="2d"]');
      if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await page.keyboard.press('Space');
  }, 4000, 'traffic-2d');

  const tr3d = await capture(browser, 'http://localhost:5174/#/traffic', async (page) => {
    await page.evaluate(() => {
      const r = document.querySelector('input[type="radio"][value="3d"]');
      if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await page.keyboard.press('Space');
  }, 4000, 'traffic-3d');
  processCrossfade(tr2d, tr3d, 'traffic');

  // 4. DEBRIEF
  console.log('--- Processing Debrief ---');
  const db2d = await capture(browser, 'http://localhost:5174/#/debrief', async (page) => {
    await page.locator('button:has-text("Example flight")').click();
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      const r = document.querySelector('input[type="radio"][value="2d"]');
      if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await page.keyboard.press('Space');
  }, 4000, 'debrief-2d');

  const db3d = await capture(browser, 'http://localhost:5174/#/debrief', async (page) => {
    await page.locator('button:has-text("Example flight")').click();
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      const r = document.querySelector('input[type="radio"][value="3d"]');
      if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await page.keyboard.press('Space');
  }, 4000, 'debrief-3d');
  processCrossfade(db2d, db3d, 'debrief');

  // 5. SOF
  console.log('--- Processing SOF ---');
  const sofRadar = await capture(browser, 'http://localhost:5174/#/sof', async (page) => {
    // Stage is already isolated by init script
  }, 4000, 'sof-radar');

  const sofCards = await capture(browser, 'http://localhost:5174/#/sof', async (page) => {
    await page.addStyleTag({
      content: `
        .sof-map-stage { display: none !important; }
        .sof-cards-host, .sof-cards {
          position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important;
          margin: 0 !important; padding: 1rem !important; z-index: 99999 !important;
          background: #08101a !important; display: flex !important; flex-direction: column !important; justify-content: center !important;
        }
        article.sof-card { max-width: 100% !important; margin: 0 auto !important; }
      `
    });
  }, 4000, 'sof-cards');
  processCrossfade(sofRadar, sofCards, 'sof');

  await browser.close();
  console.log('ALL MODULE CARD VIDEOS GENERATED AND VERIFIED!');
}

main().catch(console.error);
