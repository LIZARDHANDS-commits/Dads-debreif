// Records the Traffic card's clip on the home page (public/media/cards/traffic.mp4, .webm and the .jpg poster).
//
// Patrick, 11 Oct 03:33Z: the 2D wind part zoomed in so just the circuit fills the screen; the 3D part zooms right
// in so the two aircraft are the main thing in the middle of the screen, with some room either side; a higher frame
// rate. Every frame is drawn on its own (the sim stepped, the camera set, then a screenshot), so the clip is a true
// 60 frames a second whatever the computer's speed; the old recorder filmed the screen while the sim jumped 8 times a
// second.
//
// Run: `npx vite --port 5174` in one shell, then `node tools/record-traffic-full.mjs`.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const ffmpegPath = (() => {
  try { return execFileSync('python', ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe().strip())'], { encoding: 'utf8' }).trim(); } catch { return 'ffmpeg'; }
})();
const ROOT = process.cwd();
const CARDS_DIR = join(ROOT, 'public', 'media', 'cards');
const FRAMES_DIR = join(ROOT, 'tmp', 'record-parts', 'traffic-frames');
const URL = process.env.TRAFFIC_URL ?? 'http://localhost:5174/#/traffic';
const CHROMIUM = process.env.CHROMIUM_PATH; // e.g. /opt/pw-browsers/chromium in the cloud container

const FPS = 60;
const SIZE = { width: 1280, height: 800 };

/** The 2D part: wind from 180° rising 0 to 30 kt over this long, then held. */
const WIND = { fromDeg: 180, maxKt: 30, riseSec: 6, holdSec: 1 };
/** Just the circuit, map feet: the break and initial out to Final Entry, the downwind, the perch and final (with
 *  room for a 30 kt southerly to blow the downwind north). */
const CIRCUIT_BOX = { minX: -4200, maxX: 17200, minY: -11300, maxY: 1600 };

/** The 3D part: the move-over and touch-and-go, sim seconds, played in this many real seconds. */
const SHOW = { fromT: 114, toT: 184, realSec: 18, zoomInSec: 3 };
/** Feet across the screen round the two aircraft: their spacing times this, never less than the minimum. */
const FRAME_SPAN = { times: 1.5, minFt: 1000 };
const WIDE = { center: { x: 4250, y: -5167, z: 1890 }, zoom: 130, pitchDeg: 72 };

const CLEAN_STAGE_CSS = `
  #site-header, #site-footer, .app-header, .app-footer, .narrow-note, #route-notice, #module-status,
  .traffic-col, .traffic-bar, .traffic-camera-bar, .traffic-cam-bar, .camera-bar, .playback-bar,
  .traffic-3d-bar, .traffic-nav, .traffic-hint, .traffic-credit, [class*="hint"], [class*="toast"] {
    display: none !important;
  }
  .traffic-stage, .traffic-map-wrap {
    position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important;
    margin: 0 !important; padding: 0 !important; z-index: 999999 !important;
  }
`;

const ease = (p) => (p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p);
const twoFrames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

async function openTraffic(browser) {
  const page = await browser.newPage({ viewport: SIZE });
  await page.goto(URL);
  await page.waitForFunction(() => Boolean(window.__traffic), null, { timeout: 30000 });
  await page.addStyleTag({ content: CLEAN_STAGE_CSS });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  return page;
}

async function shoot(page, dir, n) {
  await page.evaluate(twoFrames);
  await page.screenshot({ path: join(dir, `f${String(n).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92 });
}

async function record2d(browser, dir) {
  const page = await openTraffic(browser);
  await page.evaluate(({ box, wind }) => {
    window.__traffic.settings.update({ view: '2d', windFromDeg: wind.fromDeg, windKt: 0 });
    window.__traffic.map.fitBounds(box, 0);
  }, { box: CIRCUIT_BOX, wind: WIND });
  await page.waitForTimeout(6000); // the photo tiles
  const frames = Math.round((WIND.riseSec + WIND.holdSec) * FPS);
  for (let n = 0; n < frames; n++) {
    const kt = Math.min(1, n / (WIND.riseSec * FPS)) * WIND.maxKt;
    await page.evaluate(({ kt, fromDeg }) => window.__traffic.settings.update({ windFromDeg: fromDeg, windKt: kt }), { kt, fromDeg: WIND.fromDeg });
    await shoot(page, dir, n);
  }
  await page.close();
  return frames;
}

async function record3d(browser, dir) {
  const page = await openTraffic(browser);
  await page.evaluate(() => {
    window.__traffic.setAircraft([
      { id: 'OVR', type: 'CT-156', callsign: 'FANG 1', routeId: 'PAT1', startIndex: 8, startsAtSec: 0, intent: 'touch_and_go' },
      { id: 'STR', type: 'CT-156', callsign: 'FANG 2', routeId: 'ENT2', startIndex: 3, startsAtSec: 63.5, intent: 'touch_and_go' },
    ], 3);
    window.__traffic.settings.update({ view: '3d' });
  });
  await page.waitForTimeout(8000); // three.js, the ground and the photo tiles
  await page.evaluate(({ t, wide }) => {
    const tr = window.__traffic;
    tr.sim.stepTo(t);
    tr.seek(t);
    tr.view3d.setView({ center: wide.center, cam: { ...tr.view3d.getView().cam, zoom: wide.zoom, pitchDeg: wide.pitchDeg } });
  }, { t: SHOW.fromT, wide: WIDE });
  await page.waitForTimeout(6000); // the photo tiles for the wide opening view
  const frames = Math.round(SHOW.realSec * FPS);
  for (let n = 0; n < frames; n++) {
    const realSec = n / FPS;
    const simT = SHOW.fromT + (SHOW.toT - SHOW.fromT) * (realSec / SHOW.realSec);
    await page.evaluate(({ simT, w, wide, span, width }) => {
      const tr = window.__traffic;
      tr.sim.stepTo(simT);
      tr.seek(simT);
      const ships = tr.sim.state().aircraft.filter((a) => a.status === 'flying' && ['OVR', 'STR'].includes(a.id));
      if (!ships.length) return;
      const mid = { x: 0, y: 0, z: 0 };
      for (const a of ships) { mid.x += a.x / ships.length; mid.y += a.y / ships.length; mid.z += a.alt / ships.length; }
      const apart = ships.length > 1 ? Math.hypot(ships[0].x - ships[1].x, ships[0].y - ships[1].y) : 0;
      const zoomClose = (width / Math.max(apart * span.times, span.minFt)) * 1000;
      // Smoothed, so the camera glides rather than jumps as the spacing changes.
      const s = (window.__clipCam ??= { ...mid, zoom: zoomClose });
      const k = 0.08;
      s.x += (mid.x - s.x) * k; s.y += (mid.y - s.y) * k; s.z += (mid.z - s.z) * k; s.zoom += (zoomClose - s.zoom) * k;
      const lerp = (a, b) => a + (b - a) * w;
      const cur = tr.view3d.getView();
      tr.view3d.setView({
        center: { x: lerp(wide.center.x, s.x), y: lerp(wide.center.y, s.y), z: lerp(wide.center.z, s.z) },
        cam: { ...cur.cam, zoom: Math.exp(lerp(Math.log(wide.zoom), Math.log(s.zoom))), pitchDeg: wide.pitchDeg },
      });
    }, { simT, w: ease(Math.min(1, realSec / SHOW.zoomInSec)), wide: WIDE, span: FRAME_SPAN, width: SIZE.width });
    await shoot(page, dir, n);
  }
  await page.close();
  return frames;
}

async function main() {
  rmSync(FRAMES_DIR, { recursive: true, force: true });
  const dir2d = join(FRAMES_DIR, '2d'), dir3d = join(FRAMES_DIR, '3d');
  mkdirSync(dir2d, { recursive: true });
  mkdirSync(dir3d, { recursive: true });
  mkdirSync(CARDS_DIR, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROMIUM, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  console.log('2D wind part...');
  const n2 = await record2d(browser, dir2d);
  console.log('3D two-ship part...');
  const n3 = await record3d(browser, dir3d);
  await browser.close();

  const dur1 = n2 / FPS, dur2 = n3 / FPS, fade = 0.6, total = dur1 + dur2 - fade;
  const filter = `[0:v]scale=640:400:flags=lanczos,setsar=1[v0];[1:v]scale=640:400:flags=lanczos,setsar=1[v1];[v0][v1]xfade=transition=fade:duration=${fade}:offset=${(dur1 - fade).toFixed(3)},format=yuv420p[out]`;
  const inputs = ['-framerate', String(FPS), '-i', join(dir2d, 'f%05d.jpg'), '-framerate', String(FPS), '-i', join(dir3d, 'f%05d.jpg')];
  const outMp4 = join(CARDS_DIR, 'traffic.mp4'), outWebm = join(CARDS_DIR, 'traffic.webm'), outJpg = join(CARDS_DIR, 'traffic.jpg');
  execFileSync(ffmpegPath, ['-y', '-v', 'error', ...inputs, '-filter_complex', filter, '-map', '[out]', '-r', String(FPS), '-c:v', 'libx264', '-crf', '28', '-preset', 'slow', '-movflags', '+faststart', '-t', total.toFixed(3), outMp4]);
  execFileSync(ffmpegPath, ['-y', '-v', 'error', ...inputs, '-filter_complex', filter, '-map', '[out]', '-r', String(FPS), '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '40', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-t', total.toFixed(3), outWebm]);
  execFileSync(ffmpegPath, ['-y', '-v', 'error', '-ss', '3.0', '-i', outMp4, '-vframes', '1', '-q:v', '3', outJpg]);
  console.log(`Done: ${total.toFixed(1)} s at ${FPS} fps`);
}

main().catch((err) => { console.error(err); process.exit(1); });
