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

function encodeCard(raw1, raw2, anim1StartSec, anim2StartSec, moduleId) {
  const outMp4 = join(CARDS_DIR, `${moduleId}.mp4`);
  const outWebm = join(CARDS_DIR, `${moduleId}.webm`);
  const outJpg = join(CARDS_DIR, `${moduleId}.jpg`);

  const trim1Start = anim1StartSec.toFixed(2);
  const trim1End = (anim1StartSec + 2.8).toFixed(2);
  const trim2Start = anim2StartSec.toFixed(2);
  const trim2End = (anim2StartSec + 2.8).toFixed(2);

  const filter = `[0:v]trim=${trim1Start}:${trim1End},setpts=PTS-STARTPTS,scale=640:400:flags=lanczos,fps=25[v0];[1:v]trim=${trim2Start}:${trim2End},setpts=PTS-STARTPTS,scale=640:400:flags=lanczos,fps=25[v1];[v0][v1]xfade=transition=fade:duration=0.5:offset=2.3,format=yuv420p[out]`;

  console.log(`Encoding ${moduleId}.mp4...`);
  execFileSync(ffmpegPath, [
    '-y', '-i', raw1, '-i', raw2,
    '-filter_complex', filter,
    '-map', '[out]',
    '-c:v', 'libx264', '-crf', '28', '-preset', 'slow', '-movflags', '+faststart',
    '-t', '5.1',
    outMp4
  ]);

  console.log(`Encoding ${moduleId}.webm...`);
  execFileSync(ffmpegPath, [
    '-y', '-i', raw1, '-i', raw2,
    '-filter_complex', filter,
    '-map', '[out]',
    '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '40', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2',
    '-t', '5.1',
    outWebm
  ]);

  console.log(`Generating poster ${moduleId}.jpg...`);
  execFileSync(ffmpegPath, [
    '-y', '-i', outMp4,
    '-ss', '1.8',
    '-vframes', '1',
    '-q:v', '3',
    outJpg
  ]);

  console.log(`Finished ${moduleId}:`);
  console.log(`  MP4:  ${statSync(outMp4).size} bytes`);
  console.log(`  WebM: ${statSync(outWebm).size} bytes`);
  console.log(`  JPG:  ${statSync(outJpg).size} bytes`);
}

async function recordTurnSim(browser) {
  console.log('\n========================================');
  console.log('RECORDING CARD: Turn Sim');
  console.log('========================================');
  const dir2d = join(PARTS_DIR, 'ts-raw-2d');
  const dir3d = join(PARTS_DIR, 'ts-raw-3d');
  mkdirSync(dir2d, { recursive: true });
  mkdirSync(dir3d, { recursive: true });

  // 1. Turn Sim 2D
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
  await p2d.waitForTimeout(500);

  // Clean DOM isolation
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
  await p2d.waitForTimeout(300);

  // Trigger Delayed 90 turn
  const anim1StartSec = (Date.now() - t0_2d) / 1000.0;
  await p2d.keyboard.press('Space'); // Play
  await p2d.waitForTimeout(3000);

  await p2d.close();
  await ctx2d.close();

  const files2d = readdirSync(dir2d).filter(f => f.endsWith('.webm')).map(f => join(dir2d, f));
  files2d.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  const raw2d = files2d[0];

  // 2. Turn Sim 3D
  const ctx3d = await browser.newContext({
    recordVideo: { dir: dir3d, size: { width: 1280, height: 800 } },
    viewport: { width: 1280, height: 800 },
  });
  const p3d = await ctx3d.newPage();
  const t0_3d = Date.now();
  await p3d.goto('http://localhost:5174/#/turn-sim');
  await p3d.waitForTimeout(1000);

  // Switch to 3D Chase
  await p3d.evaluate(() => {
    const r3 = document.querySelector('input[type="radio"][value="3d"]');
    if (r3) { r3.checked = true; r3.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await p3d.waitForTimeout(2000);

  await p3d.evaluate(() => {
    const chaseBtn = document.querySelector('button[data-mount="chase"]') || Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Chase');
    if (chaseBtn) chaseBtn.click();
  });
  await p3d.waitForTimeout(500);

  // Clean DOM isolation
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
  await p3d.waitForTimeout(300);

  const anim2StartSec = (Date.now() - t0_3d) / 1000.0;
  await p3d.keyboard.press('Space'); // Play
  await p3d.waitForTimeout(3000);

  await p3d.close();
  await ctx3d.close();

  const files3d = readdirSync(dir3d).filter(f => f.endsWith('.webm')).map(f => join(dir3d, f));
  files3d.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  const raw3d = files3d[0];

  encodeCard(raw2d, raw3d, anim1StartSec, anim2StartSec, 'turn-sim');
}

async function recordTurnFight(browser) {
  console.log('\n========================================');
  console.log('RECORDING CARD: Turn Fight');
  console.log('========================================');
  const dir2d = join(PARTS_DIR, 'tf-raw-2d');
  const dir3d = join(PARTS_DIR, 'tf-raw-3d');
  mkdirSync(dir2d, { recursive: true });
  mkdirSync(dir3d, { recursive: true });

  // 1. Turn Fight 2D
  const ctx2d = await browser.newContext({
    recordVideo: { dir: dir2d, size: { width: 1280, height: 800 } },
    viewport: { width: 1280, height: 800 },
  });
  const p2d = await ctx2d.newPage();
  const t0_2d = Date.now();
  await p2d.goto('http://localhost:5174/#/turn-fight');
  await p2d.waitForTimeout(1000);

  await p2d.evaluate(() => {
    const r2 = document.querySelector('input[type="radio"][value="2d"]');
    if (r2) { r2.checked = true; r2.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await p2d.waitForTimeout(500);

  // Clean DOM isolation
  await p2d.evaluate(() => {
    document.querySelector('.app-header')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.app-footer')?.style.setProperty('display', 'none', 'important');
    document.querySelectorAll('.tf-col').forEach(el => el.style.setProperty('display', 'none', 'important'));
    document.querySelector('.tf-toolbar')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.tf-energy-panel')?.style.setProperty('display', 'none', 'important');
    const s = document.querySelector('.tf-stage');
    if (s) {
      Object.assign(s.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', zIndex: '999999' });
    }
    window.dispatchEvent(new Event('resize'));
  });
  await p2d.waitForTimeout(300);

  const anim1StartSec = (Date.now() - t0_2d) / 1000.0;
  await p2d.keyboard.press('Space'); // Play fight
  await p2d.waitForTimeout(3000);

  await p2d.close();
  await ctx2d.close();

  const files2d = readdirSync(dir2d).filter(f => f.endsWith('.webm')).map(f => join(dir2d, f));
  files2d.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  const raw2d = files2d[0];

  // 2. Turn Fight 3D
  const ctx3d = await browser.newContext({
    recordVideo: { dir: dir3d, size: { width: 1280, height: 800 } },
    viewport: { width: 1280, height: 800 },
  });
  const p3d = await ctx3d.newPage();
  const t0_3d = Date.now();
  await p3d.goto('http://localhost:5174/#/turn-fight');
  await p3d.waitForTimeout(1000);

  await p3d.evaluate(() => {
    const r3 = document.querySelector('input[type="radio"][value="3d"]');
    if (r3) { r3.checked = true; r3.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await p3d.waitForTimeout(2000);

  await p3d.evaluate(() => {
    const chaseBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Chase');
    if (chaseBtn) chaseBtn.click();
  });
  await p3d.waitForTimeout(500);

  // Clean DOM isolation
  await p3d.evaluate(() => {
    document.querySelector('.app-header')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.app-footer')?.style.setProperty('display', 'none', 'important');
    document.querySelectorAll('.tf-col').forEach(el => el.style.setProperty('display', 'none', 'important'));
    document.querySelector('.tf-toolbar')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.tf-energy-panel')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.camera-bar')?.style.setProperty('display', 'none', 'important');
    const s = document.querySelector('.tf-stage');
    if (s) {
      Object.assign(s.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', zIndex: '999999' });
    }
    window.dispatchEvent(new Event('resize'));
  });
  await p3d.waitForTimeout(300);

  const anim2StartSec = (Date.now() - t0_3d) / 1000.0;
  await p3d.keyboard.press('Space'); // Play fight
  await p3d.waitForTimeout(3000);

  await p3d.close();
  await ctx3d.close();

  const files3d = readdirSync(dir3d).filter(f => f.endsWith('.webm')).map(f => join(dir3d, f));
  files3d.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  const raw3d = files3d[0];

  encodeCard(raw2d, raw3d, anim1StartSec, anim2StartSec, 'turn-fight');
}

async function recordDebrief(browser) {
  console.log('\n========================================');
  console.log('RECORDING CARD: Debrief');
  console.log('========================================');
  const dir2d = join(PARTS_DIR, 'debrief-raw-2d');
  const dir3d = join(PARTS_DIR, 'debrief-raw-3d');
  mkdirSync(dir2d, { recursive: true });
  mkdirSync(dir3d, { recursive: true });

  // 1. Debrief 2D
  const ctx2d = await browser.newContext({
    recordVideo: { dir: dir2d, size: { width: 1280, height: 800 } },
    viewport: { width: 1280, height: 800 },
  });
  const p2d = await ctx2d.newPage();
  const t0_2d = Date.now();
  await p2d.goto('http://localhost:5174/#/debrief');
  await p2d.waitForTimeout(1000);

  await p2d.click('button:has-text("Example flight")');
  await p2d.waitForTimeout(3000);

  // Seek scrubber to airborne formation (t=2400) and fit
  await p2d.evaluate(() => {
    const scrubber = document.querySelector('.playback-scrubber');
    if (scrubber) {
      scrubber.value = '2400';
      scrubber.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const fitBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Fit');
    if (fitBtn) fitBtn.click();
  });
  await p2d.waitForTimeout(1000);

  // Clean DOM isolation
  await p2d.evaluate(() => {
    document.querySelector('.app-header')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.app-footer')?.style.setProperty('display', 'none', 'important');
    document.querySelectorAll('.debrief-col').forEach(el => el.style.setProperty('display', 'none', 'important'));
    document.querySelector('.debrief-toolbar')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.playback')?.style.setProperty('display', 'none', 'important');
    const s = document.querySelector('.debrief-stage');
    if (s) {
      Object.assign(s.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', zIndex: '999999' });
    }
    window.dispatchEvent(new Event('resize'));
  });
  await p2d.waitForTimeout(500);

  const anim1StartSec = (Date.now() - t0_2d) / 1000.0;
  await p2d.keyboard.press('Space'); // Play
  await p2d.waitForTimeout(3000);

  await p2d.close();
  await ctx2d.close();

  const files2d = readdirSync(dir2d).filter(f => f.endsWith('.webm')).map(f => join(dir2d, f));
  files2d.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  const raw2d = files2d[0];

  // 2. Debrief 3D
  const ctx3d = await browser.newContext({
    recordVideo: { dir: dir3d, size: { width: 1280, height: 800 } },
    viewport: { width: 1280, height: 800 },
  });
  const p3d = await ctx3d.newPage();
  const t0_3d = Date.now();
  await p3d.goto('http://localhost:5174/#/debrief');
  await p3d.waitForTimeout(1000);

  await p3d.click('button:has-text("Example flight")');
  await p3d.waitForTimeout(3000);

  // Switch to 3D
  await p3d.evaluate(() => {
    const r3 = document.querySelector('input[type="radio"][value="3d"]');
    if (r3) { r3.checked = true; r3.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await p3d.waitForTimeout(2000);

  // Seek scrubber to t=2400 and pick Chase view
  await p3d.evaluate(() => {
    const scrubber = document.querySelector('.playback-scrubber');
    if (scrubber) {
      scrubber.value = '2400';
      scrubber.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const chaseBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Chase');
    if (chaseBtn) chaseBtn.click();
  });
  await p3d.waitForTimeout(1000);

  // Clean DOM isolation
  await p3d.evaluate(() => {
    document.querySelector('.app-header')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.app-footer')?.style.setProperty('display', 'none', 'important');
    document.querySelectorAll('.debrief-col').forEach(el => el.style.setProperty('display', 'none', 'important'));
    document.querySelector('.debrief-toolbar')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.playback')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.camera-bar')?.style.setProperty('display', 'none', 'important');
    const s = document.querySelector('.debrief-stage');
    if (s) {
      Object.assign(s.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', zIndex: '999999' });
    }
    window.dispatchEvent(new Event('resize'));
  });
  await p3d.waitForTimeout(500);

  const anim2StartSec = (Date.now() - t0_3d) / 1000.0;
  await p3d.keyboard.press('Space'); // Play
  await p3d.waitForTimeout(3000);

  await p3d.close();
  await ctx3d.close();

  const files3d = readdirSync(dir3d).filter(f => f.endsWith('.webm')).map(f => join(dir3d, f));
  files3d.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  const raw3d = files3d[0];

  encodeCard(raw2d, raw3d, anim1StartSec, anim2StartSec, 'debrief');
}

async function recordSOF(browser) {
  console.log('\n========================================');
  console.log('RECORDING CARD: SOF Dashboard');
  console.log('========================================');
  const dir2d = join(PARTS_DIR, 'sof-raw-2d');
  const dir3d = join(PARTS_DIR, 'sof-raw-3d');
  mkdirSync(dir2d, { recursive: true });
  mkdirSync(dir3d, { recursive: true });

  // 1. SOF 2D Radar & Range Rings
  const ctx2d = await browser.newContext({
    recordVideo: { dir: dir2d, size: { width: 1280, height: 800 } },
    viewport: { width: 1280, height: 800 },
  });
  const p2d = await ctx2d.newPage();
  const t0_2d = Date.now();
  await p2d.goto('http://localhost:5174/#/sof');
  console.log('Waiting for SOF radar & satellite tiles...');
  await p2d.waitForTimeout(4000);

  // Clean DOM isolation: focus on radar stage
  await p2d.evaluate(() => {
    document.querySelector('.app-header')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.app-footer')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.sof-bar')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.timeline-strip')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.sof-feed-message')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.sof-alert-strip')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.sof-credits')?.style.setProperty('display', 'none', 'important');
    const s = document.querySelector('.sof-map-stage');
    if (s) {
      Object.assign(s.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', zIndex: '999999' });
    }
    window.dispatchEvent(new Event('resize'));
  });
  await p2d.waitForTimeout(500);

  const anim1StartSec = (Date.now() - t0_2d) / 1000.0;
  // Radar sweep / live reflectivity playback
  await p2d.waitForTimeout(3000);

  await p2d.close();
  await ctx2d.close();

  const files2d = readdirSync(dir2d).filter(f => f.endsWith('.webm')).map(f => join(dir2d, f));
  files2d.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  const raw2d = files2d[0];

  // 2. SOF 3D Terrain & Weather Globe
  const ctx3d = await browser.newContext({
    recordVideo: { dir: dir3d, size: { width: 1280, height: 800 } },
    viewport: { width: 1280, height: 800 },
  });
  const p3d = await ctx3d.newPage();
  const t0_3d = Date.now();
  await p3d.goto('http://localhost:5174/#/sof');
  await p3d.waitForTimeout(1000);

  // Click 3D button
  await p3d.evaluate(() => {
    const btn3d = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === '3D');
    if (btn3d) btn3d.click();
  });
  console.log('Waiting for 3D terrain mesh and cloud decks...');
  await p3d.waitForTimeout(5000);

  // Clean DOM isolation
  await p3d.evaluate(() => {
    document.querySelector('.app-header')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.app-footer')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.sof-bar')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.timeline-strip')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.sof-feed-message')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.sof-alert-strip')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.sof-credits')?.style.setProperty('display', 'none', 'important');
    const s = document.querySelector('.sof-map-stage');
    if (s) {
      Object.assign(s.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', zIndex: '999999' });
    }
    // Start Tour or gentle Orbit so 3D perspective moves smoothly
    const tourBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Tour');
    if (tourBtn) tourBtn.click();
    window.dispatchEvent(new Event('resize'));
  });
  await p3d.waitForTimeout(500);

  const anim2StartSec = (Date.now() - t0_3d) / 1000.0;
  await p3d.waitForTimeout(3000);

  await p3d.close();
  await ctx3d.close();

  const files3d = readdirSync(dir3d).filter(f => f.endsWith('.webm')).map(f => join(dir3d, f));
  files3d.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  const raw3d = files3d[0];

  encodeCard(raw2d, raw3d, anim1StartSec, anim2StartSec, 'sof');
}

async function main() {
  const browser = await chromium.launch();
  try {
    await recordTurnSim(browser);
    await recordTurnFight(browser);
    await recordDebrief(browser);
    await recordSOF(browser);
    console.log('\n========================================');
    console.log('ALL CARDS SUCCESSFULLY RECORDED & ENCODED!');
    console.log('========================================');
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
