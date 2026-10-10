import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ffmpegPath = execFileSync('python', ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe().strip())'], { encoding: 'utf8' }).trim();
const ROOT = process.cwd();
const CARDS_DIR = join(ROOT, 'public', 'media', 'cards');
const PARTS_DIR = join(ROOT, 'tmp', 'record-parts');

mkdirSync(PARTS_DIR, { recursive: true });
mkdirSync(CARDS_DIR, { recursive: true });

const CLEAN_STAGE_CSS = `
  #site-header, #site-footer, .app-header, .app-footer, .narrow-note, #route-notice, #module-status,
  .traffic-col, .traffic-bar, .traffic-camera-bar, .camera-bar, .playback-bar,
  .traffic-3d-bar, .traffic-nav, .traffic-hint, .traffic-credit, [class*="hint"], [class*="toast"] {
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
`;

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

async function recordTraffic() {
  const browser = await chromium.launch();
  console.log('\n========================================');
  console.log('RECORDING TRAFFIC SIM (Pat\'s Latest Spec):');
  console.log('  2D: Wind from 180 (South), 0 -> 30 kt, bright bold line, exact crop');
  console.log('  3D: Close zoom through THE WINDOW -> STR moves over -> OVR does Touch & Go on 29L');
  console.log('  60 fps high frame rate, longer cinematic sequence (~23.4s)');
  console.log('========================================\n');

  const dir2d = join(PARTS_DIR, 'traffic-v3-2d');
  const dir3d = join(PARTS_DIR, 'traffic-v3-3d');
  mkdirSync(dir2d, { recursive: true });
  mkdirSync(dir3d, { recursive: true });

  // ----------------------------------------------------
  // PART 1: 2D OVERHEAD BREAK ZOOM + WIND 180 (0 TO 30 KT)
  // ----------------------------------------------------
  console.log('Recording Part 1: 2D zoomed overhead pattern, wind 180° (0 -> 30 kt)...');
  const ctx2d = await browser.newContext({
    recordVideo: { dir: dir2d, size: { width: 1280, height: 800 } },
    viewport: { width: 1280, height: 800 },
  });
  const p2d = await ctx2d.newPage();
  await p2d.goto('http://localhost:5174/#/traffic');
  await p2d.waitForTimeout(1000);

  // Switch to 2D
  await p2d.evaluate(() => {
    const r2 = document.querySelector('input[type="radio"][value="2d"]');
    if (r2) { r2.checked = true; r2.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await p2d.waitForTimeout(500);

  // Clean DOM isolation
  await p2d.addStyleTag({ content: CLEAN_STAGE_CSS });
  await p2d.evaluate(() => window.dispatchEvent(new Event('resize')));
  await p2d.waitForTimeout(500);

  // Set exact bounding box matching Pat's reference image
  await p2d.evaluate(() => {
    window.__traffic.map.fitBounds({ minX: -4500, maxX: 9500, minY: -10500, maxY: 1800 }, 40);
  });
  await p2d.waitForTimeout(1500); // Wait for imagery tiles

  // Reset wind to 180° at 0 kt
  await p2d.evaluate(() => {
    window.__traffic.settings.update({ windFromDeg: 180, windKt: 0 });
  });
  await p2d.waitForTimeout(500);

  console.log('Starting 2D wind animation (0 -> 30 kt from 180°)...');
  const anim1Dur = 6.0;
  const anim1Steps = 90;
  const anim1Interval = (anim1Dur * 1000) / anim1Steps;

  for (let s = 1; s <= anim1Steps; s++) {
    const frac = s / anim1Steps;
    const kt = frac * 30.0;
    await p2d.waitForTimeout(anim1Interval);
    await p2d.evaluate((windKt) => {
      window.__traffic.settings.update({ windFromDeg: 180, windKt });
    }, kt);
  }

  // Hold at max wind for 1.0s
  await p2d.waitForTimeout(1000);
  await p2d.waitForTimeout(1000);

  await p2d.close();
  await ctx2d.close();

  const files2d = readdirSync(dir2d).filter(f => f.endsWith('.webm')).map(f => join(dir2d, f));
  files2d.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  const raw2d = files2d[0];

  // ----------------------------------------------------
  // PART 2: 3D FIELD VIEW + CLOSE ZOOM TO WINDOW + TOUCH & GO
  // ----------------------------------------------------
  console.log('\nRecording Part 2: 3D close zoom through WINDOW -> STR moves over -> OVR Touch & Go...');
  const ctx3d = await browser.newContext({
    recordVideo: { dir: dir3d, size: { width: 1280, height: 800 } },
    viewport: { width: 1280, height: 800 },
  });
  const p3d = await ctx3d.newPage();
  await p3d.goto('http://localhost:5174/#/traffic');
  await p3d.waitForTimeout(1000);

  // Setup conflict aircraft with STR at 63.5s so OVR performs a clean touch & go
  await p3d.evaluate(() => {
    window.__traffic.setAircraft([
      { id: 'OVR', type: 'CT-156', callsign: 'FANG 1', routeId: 'PAT1', startIndex: 8, startsAtSec: 0, intent: 'touch_and_go' },
      { id: 'STR', type: 'CT-156', callsign: 'FANG 2', routeId: 'ENT2', startIndex: 3, startsAtSec: 63.5, intent: 'touch_and_go' },
    ], 3);
  });

  // Switch to 3D Field view
  await p3d.evaluate(() => {
    const r3 = document.querySelector('input[type="radio"][value="3d"]');
    if (r3) r3.click();
  });
  console.log('Waiting for 3D terrain orthophoto and models...');
  await p3d.waitForTimeout(4500);

  // Clean DOM isolation
  await p3d.addStyleTag({ content: CLEAN_STAGE_CSS });
  await p3d.evaluate(() => window.dispatchEvent(new Event('resize')));
  await p3d.waitForTimeout(500);

  // Fast-forward sim to t=114
  await p3d.evaluate(() => {
    for (let t = 0; t <= 114; t += 0.5) window.__traffic.sim.stepTo(t);
    window.__traffic.seek(114);
    // Initial wide camera position
    const cur = window.__traffic.view3d.getView();
    window.__traffic.view3d.setView({
      center: { x: 4250, y: -5167, z: 1890 },
      cam: { ...cur.cam, zoom: 130, pitchDeg: 74 }
    });
  });
  await p3d.waitForTimeout(500);

  console.log('Starting 3D sequence from t=114 to t=184 (70s sim time, 18.0s real time)...');

  // Animate sim from t=114 to t=184 (70s sim time)
  // Real time: 18.0s (150 steps of 120ms each)
  const DURATION_REAL_SEC = 18.0;
  const FPS_STEPS = 150;
  const STEP_MS = (DURATION_REAL_SEC * 1000) / FPS_STEPS;

  for (let step = 1; step <= FPS_STEPS; step++) {
    const frac = step / FPS_STEPS;
    const simT = 114 + frac * (184 - 114);

    // Zoom in CLOSE on THE WINDOW around frac = 0.45 (simT = 145)
    // Then track both aircraft down the runway as OVR touches down and climbs out
    let cx, cy, zoom, pitch;

    if (frac <= 0.45) {
      // Phase 1: Wide -> Close focus on THE WINDOW
      const p1 = frac / 0.45;
      const ease1 = p1 < 0.5 ? 2 * p1 * p1 : -1 + (4 - 2 * p1) * p1;
      cx = 4250 + ease1 * (6200 - 4250);
      cy = -5167 + ease1 * (-4600 - (-5167));
      zoom = 130 + ease1 * (340 - 130);
      pitch = 74 + ease1 * (72 - 74);
    } else {
      // Phase 2: Follow OVR and STR down 29L to touchdown and climbout
      const p2 = (frac - 0.45) / 0.55;
      const ease2 = p2 < 0.5 ? 2 * p2 * p2 : -1 + (4 - 2 * p2) * p2;
      cx = 6200 + ease2 * (1800 - 6200);
      cy = -4600 + ease2 * (-2000 - (-4600));
      zoom = 340 + ease2 * (280 - 340);
      pitch = 72 + ease2 * (70 - 72);
    }

    await p3d.waitForTimeout(STEP_MS);
    await p3d.evaluate(({ simT, cx, cy, zoom, pitch }) => {
      window.__traffic.sim.stepTo(simT);
      window.__traffic.seek(simT);
      const cur = window.__traffic.view3d.getView();
      window.__traffic.view3d.setView({
        center: { x: cx, y: cy, z: 1890 },
        cam: { ...cur.cam, zoom, pitchDeg: pitch }
      });
    }, { simT, cx, cy, zoom, pitch });
  }

  // Hold at climbout for 1.0s
  await p3d.waitForTimeout(1000);
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
  console.log('\nProcessing and encoding traffic media at 60 fps with FFmpeg...');
  const outMp4 = join(CARDS_DIR, 'traffic.mp4');
  const outWebm = join(CARDS_DIR, 'traffic.webm');
  const outJpg = join(CARDS_DIR, 'traffic.jpg');

  const durTotal1 = getDuration(raw2d);
  const durTotal2 = getDuration(raw3d);
  console.log(`Raw 2D duration: ${durTotal1.toFixed(2)}s`);
  console.log(`Raw 3D duration: ${durTotal2.toFixed(2)}s`);

  const dur1 = anim1Dur;  // 6.0s
  const dur2 = DURATION_REAL_SEC; // 18.0s
  const fadeDur = 0.6;
  const offset = dur1 - fadeDur; // 5.4s
  const totalDur = dur1 + dur2 - fadeDur; // 23.4s

  const trim1Start = Math.max(0, durTotal1 - anim1Dur - 2.0);
  const trim1End = trim1Start + dur1;
  const trim2Start = Math.max(0, durTotal2 - DURATION_REAL_SEC - 2.0);
  const trim2End = trim2Start + dur2;

  console.log(`Trim 1: ${trim1Start.toFixed(2)}s -> ${trim1End.toFixed(2)}s`);
  console.log(`Trim 2: ${trim2Start.toFixed(2)}s -> ${trim2End.toFixed(2)}s`);

  // 60 fps Lanczos scaling with smooth crossfade
  const filter = `[0:v]trim=${trim1Start.toFixed(2)}:${trim1End.toFixed(2)},setpts=PTS-STARTPTS,scale=640:400:flags=lanczos,fps=60[v0];[1:v]trim=${trim2Start.toFixed(2)}:${trim2End.toFixed(2)},setpts=PTS-STARTPTS,scale=640:400:flags=lanczos,fps=60[v1];[v0][v1]xfade=transition=fade:duration=${fadeDur}:offset=${offset.toFixed(2)},format=yuv420p[out]`;

  console.log(`Encoding traffic.mp4 at 60 fps (duration ${totalDur.toFixed(2)}s)...`);
  execFileSync(ffmpegPath, [
    '-y', '-i', raw2d, '-i', raw3d,
    '-filter_complex', filter,
    '-map', '[out]',
    '-c:v', 'libx264', '-crf', '28', '-preset', 'slow', '-movflags', '+faststart',
    '-t', totalDur.toFixed(2),
    outMp4
  ]);

  console.log('Encoding traffic.webm at 60 fps...');
  execFileSync(ffmpegPath, [
    '-y', '-i', raw2d, '-i', raw3d,
    '-filter_complex', filter,
    '-map', '[out]',
    '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '40', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2',
    '-t', totalDur.toFixed(2),
    outWebm
  ]);

  console.log('Generating poster traffic.jpg...');
  // Capture from Part 1 at 3.0s (midway through wind morph)
  execFileSync(ffmpegPath, [
    '-y', '-i', outMp4,
    '-ss', '3.0',
    '-vframes', '1',
    '-q:v', '3',
    outJpg
  ]);

  console.log('\nFinished traffic card:');
  console.log(`  MP4:  ${statSync(outMp4).size} bytes`);
  console.log(`  WebM: ${statSync(outWebm).size} bytes`);
  console.log(`  JPG:  ${statSync(outJpg).size} bytes`);
}

recordTraffic().catch(console.error);
