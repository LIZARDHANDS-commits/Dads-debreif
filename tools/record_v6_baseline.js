// Records what the original V6 tool displays for fixed inputs, so the new
// version can be checked against it (Decision 29: V6's numbers are trusted).
//
// Usage: python3 tools/rebuild_original.py /tmp/v6.html
//        NODE_PATH=$(npm root -g) node tools/record_v6_baseline.js /tmp/v6.html tests/golden/v6-baseline.json
const { chromium } = require('playwright');
const fs = require('fs');

const [src, out] = process.argv.slice(2);
const KML_STEPS = 40;          // slider positions across the example flight (0..1000)
const SIM_STEPS = [0, 1, 5, 10, 20, 40, 80, 120, 160, 200];
const BFM_TIMES = [0, 5, 10, 20, 30, 45, 60];

const text = (page, sel) => page.$eval(sel, e => e.innerText.trim()).catch(() => null);

async function open(browser, mod, fakeClock = false) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  if (fakeClock) await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + require('path').resolve(src), { waitUntil: 'load', timeout: 180000 });
  const wait = ms => fakeClock ? page.clock.runFor(ms) : page.waitForTimeout(ms);
  await page.locator('text=ENTER').first().click();
  await wait(1000);
  await page.click(`#moduleLauncher .moduleCard[data-module="${mod}"]`);
  await wait(1500);
  return { page, errors };
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const result = { source: 'original V6 (original/original.sha256)', viewport: '1600x950' };

  // KML debrief viewer: the built-in example flight at evenly spaced times.
  {
    const { page, errors } = await open(browser, 'kml');
    await page.locator('button:visible', { hasText: 'Load Example Flight' }).first().click();
    await page.waitForTimeout(2500);
    const samples = [];
    for (let i = 0; i <= KML_STEPS; i++) {
      const v = Math.round(i * 1000 / KML_STEPS);
      await page.$eval('#kmlTimeSlider', (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, v);
      await page.waitForTimeout(150);
      samples.push({
        slider: v,
        time: await text(page, '#kmlTimePill'),
        live: await text(page, '#kmlLive'),
        spacing: await text(page, '#kmlSpacing'),
        aspectHca: await text(page, '#kmlAspectHca'),
        tennis: await text(page, '#kmlTennisReadout'),
        summary: await text(page, '#kmlSummary'),
      });
    }
    result.kml = { status: await text(page, '#kmlStatus'), samples, errors };
    await page.close();
  }

  // Turn Sim: default setup, advanced with the Step button.
  {
    const { page, errors } = await open(browser, 'sim');
    const samples = [];
    let done = 0;
    for (const n of SIM_STEPS) {
      while (done < n) { await page.click('#step'); done++; }
      await page.waitForTimeout(100);
      samples.push({
        steps: n,
        spacing: await text(page, '#spacingReadout'),
        error: await text(page, '#errorReadout'),
        summary: await text(page, '#summaryTable'),
      });
    }
    result.turnSim = { samples, errors };
    await page.close();
  }

  // Turn Fight (BFM): default setup, played on a fake clock so frame timing is repeatable.
  {
    const { page, errors } = await open(browser, 'bfm', true);
    const samples = [];
    await page.click('#bfmPlay');
    let now = 0;
    for (const t of BFM_TIMES) {
      await page.clock.runFor((t - now) * 1000); now = t;
      samples.push({ t, live: await text(page, '#bfmLive'), phase: await text(page, '#bfmPhase') });
    }
    result.bfm = { note: 'seconds of real (faked) time after pressing Play', samples, errors };
    await page.close();
  }

  fs.writeFileSync(out, JSON.stringify(result, null, 1));
  console.log('wrote', out);
  await browser.close();
})();
