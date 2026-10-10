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

async function recordTrafficCard() {
  const browser = await chromium.launch();

  // ==========================================
  // PART 1: 2D WIND MORPH (0 to 25 kt from North)
  // ==========================================
  console.log('=== Recording Part 1: 2D Wind Morph ===');
  const dir2d = join(PARTS_DIR, 'raw-2d');
  mkdirSync(dir2d, { recursive: true });

  const ctx2d = await browser.newContext({
    recordVideo: { dir: dir2d, size: { width: 1280, height: 800 } },
    viewport: { width: 1280, height: 800 },
  });
  const p2d = await ctx2d.newPage();
  const t0_2d = Date.now();

  await p2d.goto('http://localhost:5174/#/traffic');
  await p2d.waitForTimeout(1000);

  // Switch to 2D
  await p2d.evaluate(() => {
    const r2 = document.querySelector('input[type="radio"][value="2d"]');
    if (r2) { r2.checked = true; r2.dispatchEvent(new Event('change', { bubbles: true })); }
  });

  // Wait for 2D satellite photo tiles to download and render
  console.log('Waiting for 2D satellite imagery tiles...');
  await p2d.waitForTimeout(5000);

  // Clean DOM isolation: remove all chrome so only the pure stage shows
  await p2d.evaluate(() => {
    document.querySelector('.app-header')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.app-footer')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.narrow-note')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.traffic-bar')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.traffic-note')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.traffic-hint')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.traffic-credit')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.traffic-note3d')?.style.setProperty('display', 'none', 'important');
    document.querySelectorAll('.traffic-col').forEach(el => el.style.setProperty('display', 'none', 'important'));
    const s = document.querySelector('.traffic-stage');
    s.style.position = 'fixed';
    s.style.inset = '0';
    s.style.width = '100vw';
    s.style.height = '100vh';
    s.style.zIndex = '999999';
    window.__traffic.setAircraft([
      { id: 'FANG 1', type: 'CT-156', routeId: 'PAT1', startIndex: 8, startsAtSec: 0 }
    ]);
    window.__traffic.settings.update({ windFromDeg: 360, windKt: 0 });
    window.__traffic.map.fit();
    window.dispatchEvent(new Event('resize'));
  });
  await p2d.waitForTimeout(500);

  // Measure start timestamp of the 2D action
  const animStartSec = (Date.now() - t0_2d) / 1000.0;
  console.log(`Starting 2D wind sweep at ${animStartSec.toFixed(2)}s in video...`);

  // Sweep wind from 0 to 25 kt from North over 2.5 seconds (50 steps x 50 ms)
  for (let kt = 0; kt <= 25; kt += 0.5) {
    await p2d.evaluate((val) => {
      window.__traffic.settings.update({ windFromDeg: 360, windKt: val });
    }, kt);
    await p2d.waitForTimeout(50);
  }
  // Hold at 25 kt for 300 ms
  await p2d.waitForTimeout(300);

  await p2d.close();
  await ctx2d.close();

  const files2d = readdirSync(dir2d).filter(f => f.endsWith('.webm')).map(f => join(dir2d, f));
  files2d.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  const raw2d = files2d[0];

  // ==========================================
  // PART 2: 3D FIELD VIEW (Straight-in move-over)
  // ==========================================
  console.log('=== Recording Part 2: 3D Field Move-Over ===');
  const dir3d = join(PARTS_DIR, 'raw-3d');
  mkdirSync(dir3d, { recursive: true });

  const ctx3d = await browser.newContext({
    recordVideo: { dir: dir3d, size: { width: 1280, height: 800 } },
    viewport: { width: 1280, height: 800 },
  });
  const p3d = await ctx3d.newPage();
  const t0_3d = Date.now();

  await p3d.goto('http://localhost:5174/#/traffic');
  await p3d.waitForTimeout(1000);

  // Setup two aircraft: straight-in meets final turn
  await p3d.evaluate(() => {
    window.__traffic.setAircraft([
      { id: 'OVR', type: 'CT-156', callsign: 'FANG 1', routeId: 'PAT1', startIndex: 8, startsAtSec: 0 },
      { id: 'STR', type: 'CT-156', callsign: 'FANG 2', routeId: 'ENT2', startIndex: 3, startsAtSec: 66.5 },
    ], 3);
  });

  // Switch to 3D Field view
  await p3d.evaluate(() => {
    const r3 = document.querySelector('input[type="radio"][value="3d"]');
    if (r3) { r3.checked = true; r3.dispatchEvent(new Event('change', { bubbles: true })); }
  });

  // Wait for 3D satellite orthophoto tiles to render
  console.log('Waiting for 3D satellite imagery tiles...');
  await p3d.waitForTimeout(6000);

  // Clean DOM isolation for 3D view
  await p3d.evaluate(() => {
    document.querySelector('.app-header')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.app-footer')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.narrow-note')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.traffic-bar')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.traffic-3d-bar')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.traffic-note')?.style.setProperty('display', 'none', 'important');
    document.querySelectorAll('.traffic-col').forEach(el => el.style.setProperty('display', 'none', 'important'));
    const s = document.querySelector('.traffic-stage');
    s.style.position = 'fixed';
    s.style.inset = '0';
    s.style.width = '100vw';
    s.style.height = '100vh';
    s.style.zIndex = '999999';
    window.dispatchEvent(new Event('resize'));
  });

  // Step sim up to t=113.5s (conflict initiation)
  console.log('Stepping sim to t=113.5s...');
  await p3d.evaluate(() => {
    for (let t = 0; t <= 113.5; t += 0.5) {
      window.__traffic.sim.stepTo(t);
    }
    window.__traffic.seek(113.5);
  });
  await p3d.waitForTimeout(500);

  // Start 3D motion recording
  const action3dStartSec = (Date.now() - t0_3d) / 1000.0;
  console.log(`Starting 3D playback at ${action3dStartSec.toFixed(2)}s in video...`);
  await p3d.evaluate(() => {
    window.__traffic.play();
  });
  // Play for 3.0 seconds
  await p3d.waitForTimeout(3000);

  await p3d.close();
  await ctx3d.close();
  await browser.close();

  const files3d = readdirSync(dir3d).filter(f => f.endsWith('.webm')).map(f => join(dir3d, f));
  files3d.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  const raw3d = files3d[0];

  // ==========================================
  // PART 3: CROSSFADE & ENCODE
  // ==========================================
  console.log('=== Processing Video with FFmpeg ===');
  const outMp4 = join(CARDS_DIR, 'traffic.mp4');
  const outWebm = join(CARDS_DIR, 'traffic.webm');
  const outJpg = join(CARDS_DIR, 'traffic.jpg');

  // Exact trim ranges:
  // Part 1: from animStartSec for 2.8s
  // Part 2: from action3dStartSec for 2.8s
  // Crossfade at 2.3s for 0.5s duration, resulting in 5.1s total loop
  const trim1Start = animStartSec.toFixed(2);
  const trim1End = (animStartSec + 2.8).toFixed(2);
  const trim2Start = action3dStartSec.toFixed(2);
  const trim2End = (action3dStartSec + 2.8).toFixed(2);

  const filter = `[0:v]trim=${trim1Start}:${trim1End},setpts=PTS-STARTPTS,scale=640:400:flags=lanczos,fps=25[v0];[1:v]trim=${trim2Start}:${trim2End},setpts=PTS-STARTPTS,scale=640:400:flags=lanczos,fps=25[v1];[v0][v1]xfade=transition=fade:duration=0.5:offset=2.3,format=yuv420p[out]`;

  console.log('Encoding traffic.mp4...');
  execFileSync(ffmpegPath, [
    '-y', '-i', raw2d, '-i', raw3d,
    '-filter_complex', filter,
    '-map', '[out]',
    '-c:v', 'libx264', '-crf', '28', '-preset', 'slow', '-movflags', '+faststart',
    '-t', '5.1',
    outMp4
  ]);

  console.log('Encoding traffic.webm...');
  execFileSync(ffmpegPath, [
    '-y', '-i', raw2d, '-i', raw3d,
    '-filter_complex', filter,
    '-map', '[out]',
    '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '40', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2',
    '-t', '5.1',
    outWebm
  ]);

  console.log('Generating poster traffic.jpg...');
  // Capture frame from 2D wind-morph at 1.8s
  execFileSync(ffmpegPath, [
    '-y', '-i', outMp4,
    '-ss', '1.8',
    '-vframes', '1',
    '-q:v', '3',
    outJpg
  ]);

  console.log('Finished traffic card:');
  console.log(`  MP4:  ${statSync(outMp4).size} bytes`);
  console.log(`  WebM: ${statSync(outWebm).size} bytes`);
  console.log(`  JPG:  ${statSync(outJpg).size} bytes`);
}

recordTrafficCard().catch(console.error);
