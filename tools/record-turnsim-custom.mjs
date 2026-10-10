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

async function main() {
  const browser = await chromium.launch();
  console.log('\n========================================');
  console.log('RECORDING CUSTOM TURN SIM CARD:');
  console.log('  2D: 4-ship moving into Offset Box');
  console.log('  3D: HTRJ from line abreast');
  console.log('========================================\n');

  const dir2d = join(PARTS_DIR, 'ts-custom-2d');
  const dir3d = join(PARTS_DIR, 'ts-custom-3d');
  mkdirSync(dir2d, { recursive: true });
  mkdirSync(dir3d, { recursive: true });

  // ----------------------------------------
  // PART 1: 2D 4-SHIP OFFSET BOX
  // ----------------------------------------
  console.log('Recording Part 1: 2D 4-ship moving into Offset Box...');
  const ctx2d = await browser.newContext({
    recordVideo: { dir: dir2d, size: { width: 1280, height: 800 } },
    viewport: { width: 1280, height: 800 },
  });
  const p2d = await ctx2d.newPage();
  const t0_2d = Date.now();
  await p2d.goto('http://localhost:5174/#/turn-sim');
  await p2d.waitForTimeout(1000);

  // Switch to 2D
  await p2d.evaluate(() => {
    const r2 = document.querySelector('input[type="radio"][value="2d"]');
    if (r2) { r2.checked = true; r2.dispatchEvent(new Event('change', { bubbles: true })); }
  });

  // Switch to 4-ship
  await p2d.evaluate(() => {
    const r4 = document.querySelector('input[type="radio"][value="4"]');
    if (r4) {
      r4.checked = true;
      r4.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await p2d.waitForTimeout(1000);

  // Clean DOM isolation: pure stage
  await p2d.evaluate(() => {
    document.querySelector('.app-header')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.app-footer')?.style.setProperty('display', 'none', 'important');
    document.querySelectorAll('.ts-col').forEach(el => el.style.setProperty('display', 'none', 'important'));
    document.querySelector('.playback-bar')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.ts-toolbar')?.style.setProperty('display', 'none', 'important');
    const w = document.querySelector('.ts-canvas-wrap');
    if (w) {
      Object.assign(w.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', zIndex: '999999' });
    }
    window.dispatchEvent(new Event('resize'));
  });
  await p2d.waitForTimeout(500);

  // Trigger Offset Box transition
  const anim1StartSec = (Date.now() - t0_2d) / 1000.0;
  console.log(`Starting 2D Offset Box action at ${anim1StartSec.toFixed(2)}s...`);
  await p2d.evaluate(() => {
    const obBtn = document.querySelector('button[data-change="offsetBox"]') || Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Offset box');
    if (obBtn) obBtn.click();
  });
  // Record for 3.0s as 4-ship moves into Offset Box
  await p2d.waitForTimeout(3000);

  await p2d.close();
  await ctx2d.close();

  const files2d = readdirSync(dir2d).filter(f => f.endsWith('.webm')).map(f => join(dir2d, f));
  files2d.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  const raw2d = files2d[0];

  // ----------------------------------------
  // PART 2: 3D HTRJ FROM LINE ABREAST
  // ----------------------------------------
  console.log('Recording Part 2: 3D HTRJ from line abreast...');
  const ctx3d = await browser.newContext({
    recordVideo: { dir: dir3d, size: { width: 1280, height: 800 } },
    viewport: { width: 1280, height: 800 },
  });
  const p3d = await ctx3d.newPage();
  const t0_3d = Date.now();
  await p3d.goto('http://localhost:5174/#/turn-sim');
  await p3d.waitForTimeout(1000);

  // Switch to 3D
  await p3d.evaluate(() => {
    const r3 = document.querySelector('input[type="radio"][value="3d"]');
    if (r3) { r3.checked = true; r3.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await p3d.waitForTimeout(2000);

  // Pick #2 Chase camera mount
  await p3d.evaluate(() => {
    const btn2 = document.querySelector('button[data-ship="2"]') || Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === '#2');
    if (btn2) btn2.click();
    const chaseBtn = document.querySelector('button[data-mount="chase"]') || Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Chase');
    if (chaseBtn) chaseBtn.click();
  });
  await p3d.waitForTimeout(500);

  // Clean DOM isolation: pure 3D stage
  await p3d.evaluate(() => {
    document.querySelector('.app-header')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.app-footer')?.style.setProperty('display', 'none', 'important');
    document.querySelectorAll('.ts-col').forEach(el => el.style.setProperty('display', 'none', 'important'));
    document.querySelector('.playback-bar')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.ts-toolbar')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.ts-cam-bar')?.style.setProperty('display', 'none', 'important');
    const w = document.querySelector('.ts-canvas-wrap');
    if (w) {
      Object.assign(w.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', zIndex: '999999' });
    }
    window.dispatchEvent(new Event('resize'));
  });
  await p3d.waitForTimeout(500);

  // Trigger Turning Rejoin (HTRJ) to Echelon from Line Abreast
  const anim2StartSec = (Date.now() - t0_3d) / 1000.0;
  console.log(`Starting 3D HTRJ action at ${anim2StartSec.toFixed(2)}s...`);
  await p3d.evaluate(() => {
    const echBtn = document.querySelector('button[data-change="echelon"]') || Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Echelon');
    if (echBtn) echBtn.click();
  });
  // Record for 3.0s
  await p3d.waitForTimeout(3000);

  await p3d.close();
  await ctx3d.close();
  await browser.close();

  const files3d = readdirSync(dir3d).filter(f => f.endsWith('.webm')).map(f => join(dir3d, f));
  files3d.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  const raw3d = files3d[0];

  // ----------------------------------------
  // PART 3: CROSSFADE & ENCODE
  // ----------------------------------------
  console.log('Processing and encoding turn-sim card media...');
  const outMp4 = join(CARDS_DIR, 'turn-sim.mp4');
  const outWebm = join(CARDS_DIR, 'turn-sim.webm');
  const outJpg = join(CARDS_DIR, 'turn-sim.jpg');

  const trim1Start = anim1StartSec.toFixed(2);
  const trim1End = (anim1StartSec + 2.8).toFixed(2);
  const trim2Start = anim2StartSec.toFixed(2);
  const trim2End = (anim2StartSec + 2.8).toFixed(2);

  const filter = `[0:v]trim=${trim1Start}:${trim1End},setpts=PTS-STARTPTS,scale=640:400:flags=lanczos,fps=25[v0];[1:v]trim=${trim2Start}:${trim2End},setpts=PTS-STARTPTS,scale=640:400:flags=lanczos,fps=25[v1];[v0][v1]xfade=transition=fade:duration=0.5:offset=2.3,format=yuv420p[out]`;

  console.log('Encoding turn-sim.mp4...');
  execFileSync(ffmpegPath, [
    '-y', '-i', raw2d, '-i', raw3d,
    '-filter_complex', filter,
    '-map', '[out]',
    '-c:v', 'libx264', '-crf', '28', '-preset', 'slow', '-movflags', '+faststart',
    '-t', '5.1',
    outMp4
  ]);

  console.log('Encoding turn-sim.webm...');
  execFileSync(ffmpegPath, [
    '-y', '-i', raw2d, '-i', raw3d,
    '-filter_complex', filter,
    '-map', '[out]',
    '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '40', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2',
    '-t', '5.1',
    outWebm
  ]);

  console.log('Generating poster turn-sim.jpg...');
  // Extract frame from 2D 4-ship offset box at 1.8s
  execFileSync(ffmpegPath, [
    '-y', '-i', outMp4,
    '-ss', '1.8',
    '-vframes', '1',
    '-q:v', '3',
    outJpg
  ]);

  console.log('Finished turn-sim:');
  console.log(`  MP4:  ${statSync(outMp4).size} bytes`);
  console.log(`  WebM: ${statSync(outWebm).size} bytes`);
  console.log(`  JPG:  ${statSync(outJpg).size} bytes`);
}

main().catch(console.error);
