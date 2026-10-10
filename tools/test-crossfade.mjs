import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Get ffmpeg path from python imageio_ffmpeg
const ffmpegPath = execFileSync('python', ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe().strip())'], { encoding: 'utf8' }).trim();
console.log('Using ffmpeg:', ffmpegPath);

async function captureClip(url, setupFn, durationMs, outName) {
  const dir = 'tmp/record-parts';
  mkdirSync(dir, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    recordVideo: { dir, size: { width: 640, height: 400 } },
    viewport: { width: 640, height: 400 },
  });

  const page = await context.newPage();
  await page.goto(url);
  await page.waitForTimeout(800);

  // Setup view / state
  await setupFn(page);
  await page.waitForTimeout(durationMs);

  await page.close();
  await context.close();
  await browser.close();

  // Find the video recorded in dir
  const files = readdirSync(dir).filter(f => f.endsWith('.webm')).map(f => join(dir, f));
  // Sort by modification time to find the newest
  files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  const recorded = files[0];
  const target = join(dir, `${outName}.webm`);
  if (existsSync(target)) execFileSync('cmd.exe', ['/c', 'del', '/f', target]);
  execFileSync('cmd.exe', ['/c', 'move', recorded, target]);
  return target;
}

async function testTurnSim() {
  console.log('Recording turn-sim 2D...');
  const c1 = await captureClip('http://localhost:5174/#/turn-sim', async (page) => {
    await page.addStyleTag({
      content: `
        header, footer, nav, .ts-col, .playback-bar, .cam-bar-3d, .ts-tag-body { display: none !important; }
        .ts-stage, .ts-canvas-wrap {
          position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important;
          margin: 0 !important; padding: 0 !important; z-index: 99999 !important;
        }
        .ts-canvas-wrap canvas { width: 100% !important; height: 100% !important; }
      `
    });
    // Set 2D
    await page.evaluate(() => {
      const r = document.querySelector('input[type="radio"][value="2d"]');
      if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    // Trigger Delayed 90 turn
    await page.evaluate(() => {
      const btn = document.querySelector('button[data-move="delayed90"]') || document.querySelector('.manoeuvre-btn') || document.querySelector('.button');
      if (btn) btn.click();
    });
  }, 2800, 'turn-sim-2d');

  console.log('Recording turn-sim 3D...');
  const c2 = await captureClip('http://localhost:5174/#/turn-sim', async (page) => {
    await page.addStyleTag({
      content: `
        header, footer, nav, .ts-col, .playback-bar, .cam-bar-3d, .ts-tag-body { display: none !important; }
        .ts-stage, .ts-canvas-wrap {
          position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important;
          margin: 0 !important; padding: 0 !important; z-index: 99999 !important;
        }
        .ts-canvas-wrap canvas { width: 100% !important; height: 100% !important; }
      `
    });
    // Set 3D
    await page.evaluate(() => {
      const r = document.querySelector('input[type="radio"][value="3d"]');
      if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    // Trigger Delayed 90 turn
    await page.evaluate(() => {
      const btn = document.querySelector('button[data-move="delayed90"]') || document.querySelector('.manoeuvre-btn') || document.querySelector('.button');
      if (btn) btn.click();
    });
  }, 2800, 'turn-sim-3d');

  console.log('Crossfading clips with ffmpeg...');
  const outDir = 'tmp/output';
  mkdirSync(outDir, { recursive: true });
  const outMp4 = join(outDir, 'turn-sim.mp4');
  const outWebm = join(outDir, 'turn-sim.webm');
  const outJpg = join(outDir, 'turn-sim.jpg');

  // Crossfade: 2.3s of c1, 0.5s fade, then c2
  const filter = '[0:v]trim=0:2.8,setpts=PTS-STARTPTS[v0];[1:v]trim=0:2.8,setpts=PTS-STARTPTS[v1];[v0][v1]xfade=transition=fade:duration=0.5:offset=2.3,format=yuv420p[out]';
  
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

  console.log('Turn sim MP4 size:', statSync(outMp4).size, 'bytes');
  console.log('Turn sim WebM size:', statSync(outWebm).size, 'bytes');
  console.log('Turn sim JPG size:', statSync(outJpg).size, 'bytes');
}

testTurnSim().catch(console.error);
