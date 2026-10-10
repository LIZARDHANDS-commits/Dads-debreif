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
  .app-header, .app-footer, .narrow-note, #route-notice, #module-status,
  .site-header, .site-footer, nav, header, footer, aside,
  .traffic-col, .traffic-bar, .traffic-camera-bar, .camera-bar, .playback-bar,
  .traffic-3d-bar, .traffic-nav {
    display: none !important;
  }
  .traffic-stage, .traffic-map-wrap {
    position: fixed !important;
    inset: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    margin: 0 !important;
    padding: 0 !important;
    z-index: 999999 !important;
  }
  canvas, svg {
    width: 100% !important;
    height: 100% !important;
  }
`;

async function capture(browser, url, setupFn, recordMs, outName) {
  const dir = join(PARTS_DIR, outName);
  mkdirSync(dir, { recursive: true });

  const context = await browser.newContext({
    recordVideo: { dir, size: { width: 1280, height: 800 } },
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();

  await page.goto(url);
  await page.waitForTimeout(1000);

  // Inject stage isolation stylesheet and trigger resize
  await page.addStyleTag({ content: GLOBAL_ISOLATE_CSS });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(500);

  await setupFn(page);
  await page.waitForTimeout(recordMs);

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

  // Scale down from 1280x800 to 640x400 with high quality lanczos, crossfade at 2.3s
  const filter = '[0:v]trim=1.0:3.8,setpts=PTS-STARTPTS,scale=640:400:flags=lanczos,fps=25[v0];[1:v]trim=1.0:3.8,setpts=PTS-STARTPTS,scale=640:400:flags=lanczos,fps=25[v1];[v0][v1]xfade=transition=fade:duration=0.5:offset=2.3,format=yuv420p[out]';

  console.log(`Encoding ${moduleId}.mp4...`);
  execFileSync(ffmpegPath, [
    '-y', '-i', c1, '-i', c2,
    '-filter_complex', filter,
    '-map', '[out]',
    '-c:v', 'libx264', '-crf', '28', '-preset', 'slow', '-movflags', '+faststart',
    '-t', '5.1',
    outMp4
  ]);

  console.log(`Encoding ${moduleId}.webm...`);
  execFileSync(ffmpegPath, [
    '-y', '-i', c1, '-i', c2,
    '-filter_complex', filter,
    '-map', '[out]',
    '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '40', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2',
    '-t', '5.1',
    outWebm
  ]);

  console.log(`Generating poster ${moduleId}.jpg...`);
  execFileSync(ffmpegPath, [
    '-y', '-i', outMp4,
    '-ss', '3.5',
    '-vframes', '1',
    '-q:v', '3',
    outJpg
  ]);

  console.log(`Finished ${moduleId}:`);
  console.log(`  MP4:  ${statSync(outMp4).size} bytes`);
  console.log(`  WebM: ${statSync(outWebm).size} bytes`);
  console.log(`  JPG:  ${statSync(outJpg).size} bytes`);
}

async function run() {
  const browser = await chromium.launch();

  console.log('--- Recording Traffic 2D ---');
  const tr2d = await capture(browser, 'http://localhost:5174/#/traffic', async (page) => {
    // 2D view with satellite photo
    await page.evaluate(() => {
      const r2 = document.querySelector('input[type="radio"][value="2d"]');
      if (r2) { r2.checked = true; r2.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await page.waitForTimeout(2000); // wait for photo tiles
    await page.keyboard.press('Space'); // play
  }, 4500, 'traffic-2d');

  console.log('--- Recording Traffic 3D Field Move-Over ---');
  const tr3d = await capture(browser, 'http://localhost:5174/#/traffic', async (page) => {
    // 1. Setup two aircraft: straight-in meets final turn
    await page.evaluate(() => {
      window.__traffic.setAircraft([
        { id: 'OVR', type: 'CT-156', callsign: 'FANG 1', routeId: 'PAT1', startIndex: 8, startsAtSec: 0 },
        { id: 'STR', type: 'CT-156', callsign: 'FANG 2', routeId: 'ENT2', startIndex: 3, startsAtSec: 66.5 },
      ], 3);
    });

    // 2. Switch to 3D Field view
    await page.evaluate(() => {
      const r3 = document.querySelector('input[type="radio"][value="3d"]');
      if (r3) { r3.checked = true; r3.dispatchEvent(new Event('change', { bubbles: true })); }
    });

    // 3. Wait for Esri satellite tiles to download and render fully
    console.log('Waiting for satellite imagery to render in 3D...');
    await page.waitForTimeout(6500);

    // 4. Advance sim to t=113.5s where move_over triggers, then start playback
    console.log('Stepping to conflict initiation...');
    await page.evaluate(() => {
      for (let t = 0; t <= 113.5; t += 0.5) {
        window.__traffic.sim.stepTo(t);
      }
      window.__traffic.seek(113.5);
      window.__traffic.play();
    });
  }, 4500, 'traffic-3d');

  processCrossfade(tr2d, tr3d, 'traffic');

  await browser.close();
  console.log('Done!');
}

run().catch(console.error);
