import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

mkdirSync('tmp/scenes', { recursive: true });

const ISOLATE_STAGE_CSS = `
  .app-header, .app-footer, .narrow-note, #route-notice, #module-status,
  .site-header, .site-footer, nav, header, footer, aside,
  .ts-col, .playback-bar, .cam-bar-3d, .ts-toolbar, .fit-box,
  .tf-col, .tf-toolbar, .camera-bar, .tf-energy-panel,
  .traffic-col, .traffic-bar,
  .debrief-col, .debrief-toolbar, .debrief-metar,
  .sof-col, .sof-timeline, .sof-bar {
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
    z-index: 999999 !important;
  }
`;

async function captureScenes() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  // 1. TURN SIM
  console.log('Capturing Turn Sim...');
  await page.goto('http://localhost:5174/#/turn-sim');
  await page.waitForTimeout(1000);
  // 2D view: trigger delayed 90 turn
  await page.evaluate(() => {
    const btn = document.querySelector('button[data-move="delayed90"]') || document.querySelector('.ts-change-button');
    if (btn) btn.click();
  });
  await page.addStyleTag({ content: ISOLATE_STAGE_CSS });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'tmp/scenes/1-turn-sim-2d.png' });

  // 3D Chase view
  await page.evaluate(() => {
    const chaseBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Chase');
    if (chaseBtn) chaseBtn.click();
    window.dispatchEvent(new Event('resize'));
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'tmp/scenes/1-turn-sim-3d.png' });

  // 2. TURN FIGHT
  console.log('Capturing Turn Fight...');
  await page.goto('http://localhost:5174/#/turn-fight');
  await page.waitForTimeout(1000);
  await page.keyboard.press('Space'); // unpause
  await page.waitForTimeout(1500);
  await page.addStyleTag({ content: ISOLATE_STAGE_CSS });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.screenshot({ path: 'tmp/scenes/2-turn-fight-2d.png' });

  // 3D view: switch setting
  await page.evaluate(() => {
    const r3 = document.querySelector('input[type="radio"][value="3d"]');
    if (r3) {
      r3.checked = true;
      r3.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'tmp/scenes/2-turn-fight-3d.png' });

  // 3. TRAFFIC
  console.log('Capturing Traffic...');
  await page.goto('http://localhost:5174/#/traffic');
  await page.waitForTimeout(1000);
  await page.keyboard.press('Space'); // unpause
  await page.waitForTimeout(2000);
  await page.addStyleTag({ content: ISOLATE_STAGE_CSS });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.screenshot({ path: 'tmp/scenes/3-traffic-2d.png' });

  // 3D approach view
  await page.evaluate(() => {
    const r3 = document.querySelector('input[type="radio"][value="3d"]');
    if (r3) {
      r3.checked = true;
      r3.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const chaseBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Field' || b.textContent?.trim() === 'Chase');
    if (chaseBtn) chaseBtn.click();
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'tmp/scenes/3-traffic-3d.png' });

  // 4. DEBRIEF
  console.log('Capturing Debrief...');
  await page.goto('http://localhost:5174/#/debrief');
  await page.waitForTimeout(1000);
  await page.locator('button:has-text("Example flight")').click();
  await page.waitForTimeout(1500);
  await page.keyboard.press('Space'); // play
  await page.waitForTimeout(2000);
  await page.addStyleTag({ content: ISOLATE_STAGE_CSS });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.screenshot({ path: 'tmp/scenes/4-debrief-2d.png' });

  await page.evaluate(() => {
    const r3 = document.querySelector('input[type="radio"][value="3d"]');
    if (r3) {
      r3.checked = true;
      r3.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'tmp/scenes/4-debrief-3d.png' });

  // 5. SOF
  console.log('Capturing SOF...');
  await page.goto('http://localhost:5174/#/sof');
  await page.waitForTimeout(1500);
  await page.addStyleTag({ content: ISOLATE_STAGE_CSS });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.screenshot({ path: 'tmp/scenes/5-sof-radar.png' });

  await page.evaluate(() => {
    // Show 3D globe / weather view if available, or cards desk
    const btn3d = document.querySelector('button:has-text("3D")');
    if (btn3d) btn3d.click();
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'tmp/scenes/5-sof-cards.png' });

  await browser.close();
  console.log('All module scenes captured successfully in tmp/scenes/');
}

captureScenes().catch(console.error);
