import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// imageio_ffmpeg's copy where Python has it (Patrick's PC), else ffmpeg on the PATH.
let ffmpegPath = 'ffmpeg';
try {
  ffmpegPath = execFileSync('python', ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe().strip())'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
} catch {
  // keep ffmpeg on the PATH
}
const ROOT = process.cwd();
const CARDS_DIR = join(ROOT, 'public', 'media', 'cards');
const PARTS_DIR = join(ROOT, 'tmp', 'record-parts');

mkdirSync(PARTS_DIR, { recursive: true });
mkdirSync(CARDS_DIR, { recursive: true });

const CLEAN_STAGE_CSS = `
  #site-header, #site-footer, .app-header, .app-footer,
  .ts-col, .ts-bar, .ts-cam-bar, .narrow-note, #route-notice, #module-status {
    display: none !important;
  }
  .ts-stage, .ts-canvas-wrap {
    position: fixed !important;
    inset: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    margin: 0 !important;
    padding: 0 !important;
    z-index: 999999 !important;
  }
`;

/**
 * The 3D paint the clip shows: the Harvard scheme, not the ship colours (Patrick 10 Oct 2026 20:11Z). The paint choice
 * lives in the Layers menu, which is only built when opened, so it is set in the saved layout and the page reloaded.
 */
async function setHarvardPaint(page) {
  await page.evaluate(() => {
    const key = 'ooda:v1:turn-sim:layout';
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    saved.values = { ...(saved.values || {}), paint: 'harvard' };
    localStorage.setItem(key, JSON.stringify(saved));
  });
  await page.reload();
  await page.waitForTimeout(1000);
}

function getDuration(filePath) {
  try {
    const out = execFileSync(ffmpegPath, ['-i', filePath], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    const m = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(out);
    if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  } catch (err) {
    const out = (err.stdout || '') + (err.stderr || '');
    const m = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(out);
    if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  }
  return 0;
}

async function main() {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  console.log('\n========================================');
  console.log('RECORDING TURN SIM (Pat\'s Latest Spec):');
  console.log('  2D: 4-ship moving into Offset Box at 8x until fully settled (~37.5s)');
  console.log('  3D: HTRJ at 2x: Chase padlocked on Lead -> switch to Canopy mode once Lead is in canopy FOV -> finish in Echelon wings level (~29.0s)');
  console.log('  60 fps high frame rate, smooth crossfade');
  console.log('========================================\n');

  const dir2d = join(PARTS_DIR, 'ts-v4-2d');
  const dir3d = join(PARTS_DIR, 'ts-v4-3d');
  mkdirSync(dir2d, { recursive: true });
  mkdirSync(dir3d, { recursive: true });

  // ----------------------------------------------------
  // PART 1: 2D 4-SHIP OFFSET BOX AT 8x UNTIL FULL COMPLETION
  // ----------------------------------------------------
  console.log('Recording Part 1: 2D 4-ship moving into Offset Box at 8x until completion...');
  const ctx2d = await browser.newContext({
    recordVideo: { dir: dir2d, size: { width: 1280, height: 800 } },
    viewport: { width: 1280, height: 800 },
  });
  const p2d = await ctx2d.newPage();
  await p2d.goto('http://localhost:5174/#/turn-sim');
  await p2d.waitForTimeout(1000);

  // Switch to 2D
  await p2d.evaluate(() => {
    const r2 = Array.from(document.querySelectorAll('input[type="radio"]')).find(r => r.value === '2d');
    if (r2) r2.click();
  });
  await p2d.waitForTimeout(500);

  // Open Scenario panel and select 4-ship
  await p2d.evaluate(() => {
    const sc = Array.from(document.querySelectorAll('.panel-toggle')).find(b => b.textContent?.includes('Scenario'));
    if (sc && sc.getAttribute('aria-expanded') !== 'true') sc.click();
  });
  await p2d.waitForTimeout(500);

  await p2d.evaluate(() => {
    const r4 = Array.from(document.querySelectorAll('input[type="radio"]')).find(r => r.value === '4');
    if (r4) r4.click();
  });
  await p2d.waitForTimeout(800);

  // Set speed to exactly 8x
  await p2d.evaluate(() => {
    const speedSel = document.querySelector('select[aria-label="Playback speed"]');
    if (speedSel) {
      const opt = Array.from(speedSel.options).find(o => o.value === '8');
      if (opt) {
        speedSel.value = opt.value;
        speedSel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  });
  await p2d.waitForTimeout(300);

  // Clean DOM isolation: inject CSS to hide all sidebars and chrome
  await p2d.addStyleTag({ content: CLEAN_STAGE_CSS });
  await p2d.evaluate(() => window.dispatchEvent(new Event('resize')));
  await p2d.waitForTimeout(1000);

  // Trigger Offset Box transition
  console.log('Triggering 2D Offset Box action (speed 8x)...');
  await p2d.evaluate(() => {
    const obBtn = document.querySelector('button[data-change="offsetBox"]');
    if (obBtn) obBtn.click();
  });

  // Record for 39.0s so 4-ship fully settles into Offset Box (takes 37.4s at 8x)
  const waitSec1 = 39.0;
  await p2d.waitForTimeout(waitSec1 * 1000);
  await p2d.waitForTimeout(1000);

  await p2d.close();
  await ctx2d.close();

  const files2d = readdirSync(dir2d).filter(f => f.endsWith('.webm')).map(f => join(dir2d, f));
  files2d.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  const raw2d = files2d[0];

  // ----------------------------------------------------
  // PART 2: 3D HTRJ AT 2x SPEED (CHASE PADLOCK -> CANOPY MODE -> ECHELON)
  // ----------------------------------------------------
  console.log('\nRecording Part 2: 3D HTRJ at 2x speed (Chase padlock -> Canopy mode -> Echelon completion)...');
  const ctx3d = await browser.newContext({
    recordVideo: { dir: dir3d, size: { width: 1280, height: 800 } },
    viewport: { width: 1280, height: 800 },
  });
  const p3d = await ctx3d.newPage();
  await p3d.goto('http://localhost:5174/#/turn-sim');
  await p3d.waitForTimeout(1000);
  await setHarvardPaint(p3d);

  // Switch to 3D
  await p3d.evaluate(() => {
    const r3 = Array.from(document.querySelectorAll('input[type="radio"]')).find(r => r.value === '3d');
    if (r3) r3.click();
  });
  console.log('Waiting for 3D WebGL / three.js assets...');
  await p3d.waitForTimeout(2000);

  // Ensure 2-ship is selected
  await p3d.evaluate(() => {
    const sc = Array.from(document.querySelectorAll('.panel-toggle')).find(b => b.textContent?.includes('Scenario'));
    if (sc && sc.getAttribute('aria-expanded') !== 'true') sc.click();
  });
  await p3d.waitForTimeout(400);
  await p3d.evaluate(() => {
    const r2 = Array.from(document.querySelectorAll('input[type="radio"]')).find(r => r.value === '2');
    if (r2) r2.click();
  });
  await p3d.waitForTimeout(500);

  // Set speed to exactly 2x
  await p3d.evaluate(() => {
    const speedSel = document.querySelector('select[aria-label="Playback speed"]');
    if (speedSel) {
      const opt = Array.from(speedSel.options).find(o => o.value === '2');
      if (opt) {
        speedSel.value = opt.value;
        speedSel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  });
  await p3d.waitForTimeout(300);

  // Toggle Real aircraft size ON
  await p3d.evaluate(() => {
    const label = Array.from(document.querySelectorAll('label')).find(l => l.textContent?.includes('Real aircraft size'));
    const cb = label ? document.getElementById(label.getAttribute('for')) : null;
    if (cb && !cb.checked) cb.click();
  });

  // Start camera in Chase on #2
  await p3d.evaluate(() => {
    const btn2 = document.querySelector('button[data-ship="2"]');
    if (btn2) btn2.click();
    const chaseBtn = document.querySelector('button[data-mount="chase"]');
    if (chaseBtn) chaseBtn.click();
    const boreBtn = document.querySelector('button[data-aim="boresight"]');
    if (boreBtn) boreBtn.click();
  });
  await p3d.waitForTimeout(500);

  // Clean DOM isolation: inject CSS to hide all sidebars and chrome
  await p3d.addStyleTag({ content: CLEAN_STAGE_CSS });
  await p3d.evaluate(() => window.dispatchEvent(new Event('resize')));
  await p3d.waitForTimeout(1000);

  // Initiate HTRJ (Turning Rejoin to Echelon)
  console.log('Initiating 3D HTRJ in Chase on #2 (speed 2x)...');
  await p3d.evaluate(() => {
    const echBtn = document.querySelector('button[data-change="echelon"]');
    if (echBtn) echBtn.click();
  });

  // Stay in Chase behind #2 for 8.0s real time (sim time t=0 to t=16s at 2x)
  // During this time, #2 banks into a 78 deg / 5G lead-pursuit turn, closing from 5,000 ft to ~700 ft
  console.log('Tracking in Chase mode behind #2 as it pulls lead pursuit (8.0s)...');
  await p3d.waitForTimeout(8000);

  // Now Lead is high above the nose and clearly visible out the canopy!
  // Switch to Canopy mode padlocked on Lead (press 'p')
  console.log('Lead now clearly in view: switching to Canopy mode padlocked on Lead...');
  await p3d.keyboard.press('p');

  // Hold in Canopy mode for 21.0s real time (sim time t=16 to t=58s)
  // Form reaches Echelon at t=53.4s and holds steady wings level in Echelon
  console.log('Flying in Canopy mode through Echelon completion (21.0s)...');
  await p3d.waitForTimeout(21000);
  await p3d.waitForTimeout(1000);

  await p3d.close();
  await ctx3d.close();
  await browser.close();

  const files3d = readdirSync(dir3d).filter(f => f.endsWith('.webm')).map(f => join(dir3d, f));
  files3d.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  const raw3d = files3d[0];

  // ----------------------------------------------------
  // PART 3: CROSSFADE & ENCODE (60 FPS)
  // ----------------------------------------------------
  console.log('\nProcessing and encoding turn-sim media at 60 fps with FFmpeg...');
  const outMp4 = join(CARDS_DIR, 'turn-sim.mp4');
  const outWebm = join(CARDS_DIR, 'turn-sim.webm');
  const outJpg = join(CARDS_DIR, 'turn-sim.jpg');

  const durTotal1 = getDuration(raw2d);
  const durTotal2 = getDuration(raw3d);
  console.log(`Raw 2D recording duration: ${durTotal1.toFixed(2)}s`);
  console.log(`Raw 3D recording duration: ${durTotal2.toFixed(2)}s`);

  const dur1 = 37.5; // 2D 4-ship full completion in Offset Box
  const dur2 = 29.0; // 3D HTRJ full completion in Echelon (8.0s chase + 21.0s canopy)
  const fadeDur = 0.6;
  const offset = dur1 - fadeDur; // 36.9s
  const totalDur = dur1 + dur2 - fadeDur; // 65.9s

  const trim1Start = Math.max(0, durTotal1 - waitSec1 - 1.0);
  const trim1End = trim1Start + dur1;
  const trim2Start = Math.max(0, durTotal2 - (8.0 + 21.0) - 1.0);
  const trim2End = trim2Start + dur2;

  console.log(`Trim 1: ${trim1Start.toFixed(2)}s -> ${trim1End.toFixed(2)}s (dur ${dur1}s)`);
  console.log(`Trim 2: ${trim2Start.toFixed(2)}s -> ${trim2End.toFixed(2)}s (dur ${dur2}s)`);

  const filter = `[0:v]trim=${trim1Start.toFixed(2)}:${trim1End.toFixed(2)},setpts=PTS-STARTPTS,scale=640:400:flags=lanczos,fps=60[v0];[1:v]trim=${trim2Start.toFixed(2)}:${trim2End.toFixed(2)},setpts=PTS-STARTPTS,scale=640:400:flags=lanczos,fps=60[v1];[v0][v1]xfade=transition=fade:duration=${fadeDur}:offset=${offset.toFixed(2)},format=yuv420p[out]`;

  console.log(`Encoding turn-sim.mp4 at 60 fps (duration ${totalDur.toFixed(2)}s)...`);
  execFileSync(ffmpegPath, [
    '-y', '-i', raw2d, '-i', raw3d,
    '-filter_complex', filter,
    '-map', '[out]',
    '-c:v', 'libx264', '-crf', '30', '-preset', 'slow', '-movflags', '+faststart',
    '-t', totalDur.toFixed(2),
    outMp4
  ]);

  console.log('Encoding turn-sim.webm at 60 fps...');
  execFileSync(ffmpegPath, [
    '-y', '-i', raw2d, '-i', raw3d,
    '-filter_complex', filter,
    '-map', '[out]',
    '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '42', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2',
    '-t', totalDur.toFixed(2),
    outWebm
  ]);

  console.log('Generating poster turn-sim.jpg...');
  execFileSync(ffmpegPath, [
    '-y', '-i', outMp4,
    '-ss', '3.0',
    '-vframes', '1',
    '-q:v', '3',
    outJpg
  ]);

  console.log('\nFinished turn-sim:');
  console.log(`  MP4:  ${statSync(outMp4).size} bytes`);
  console.log(`  WebM: ${statSync(outWebm).size} bytes`);
  console.log(`  JPG:  ${statSync(outJpg).size} bytes`);
}

main().catch(console.error);
