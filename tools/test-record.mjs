import { chromium } from '@playwright/test';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

async function testRecord() {
  const dir = 'tmp/test-record';
  mkdirSync(dir, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    recordVideo: { dir, size: { width: 640, height: 400 } },
    viewport: { width: 640, height: 400 },
  });

  const page = await context.newPage();
  await page.goto('http://localhost:5174/#/turn-sim');
  await page.waitForTimeout(1000);

  // Isolate the canvas wrap to fill the 640x400 viewport
  await page.addStyleTag({
    content: `
      header, footer, nav, .ts-col, .playback-bar, .cam-bar-3d, .ts-tag-body { display: none !important; }
      .ts-stage, .ts-canvas-wrap {
        position: fixed !important;
        inset: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        margin: 0 !important;
        padding: 0 !important;
        z-index: 99999 !important;
      }
      .ts-canvas-wrap canvas {
        width: 100% !important;
        height: 100% !important;
      }
    `
  });

  // Switch to 2D view first
  await page.evaluate(() => {
    const radio2d = document.querySelector('input[type="radio"][value="2d"]');
    if (radio2d) {
      radio2d.checked = true;
      radio2d.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  // Trigger a tactical turn maneuver
  await page.evaluate(() => {
    const btn = document.querySelector('button[data-move="delayed90"]') || document.querySelector('.manoeuvre-btn') || document.querySelector('.button');
    if (btn) btn.click();
  });

  // Record 2D for 2.5s
  await page.waitForTimeout(2500);

  // Switch to 3D chase view
  await page.evaluate(() => {
    const radio3d = document.querySelector('input[type="radio"][value="3d"]');
    if (radio3d) {
      radio3d.checked = true;
      radio3d.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  // Record 3D for 2.5s
  await page.waitForTimeout(2500);

  await page.close();
  await context.close();
  await browser.close();

  console.log('Finished test recording');
}

testRecord().catch(console.error);
