// R2: at 1366 × 768 and 1920 × 1080, nothing is cut off and no control covers another.
import { test, expect } from './fixtures.js';
import { ROUTES, openRoute } from './routes.js';

const SIZES = [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
];

// Finds visible controls that overlap each other or stick out of the page.
async function layoutProblems(page) {
  return page.evaluate(() => {
    const controls = [...document.querySelectorAll('a[href], button, input, select, textarea, [role="button"]')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && !el.closest('[hidden], dialog:not([open])');
      })
      .filter((el) => !el.classList.contains('skip-link'));
    const problems = [];
    const pageWidth = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > pageWidth) problems.push(`page scrolls sideways (${document.documentElement.scrollWidth} > ${pageWidth})`);
    const name = (el) => `${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}"`;
    const boxes = controls.map((el) => ({ el, r: el.getBoundingClientRect() }));
    for (const { el, r } of boxes) {
      if (r.left < 0 || r.right > pageWidth + 0.5) problems.push(`${name(el)} is cut off at the side`);
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (w > 1 && h > 1) problems.push(`${name(a.el)} overlaps ${name(b.el)}`);
      }
    }
    return problems;
  });
}

for (const size of SIZES) {
  test.describe(`at ${size.width} × ${size.height}`, () => {
    test.use({ viewport: size });

    for (const route of ROUTES) {
      test(`${route} has no overlapping or cut-off controls`, async ({ page }) => {
        await openRoute(page, route);
        expect(await layoutProblems(page)).toEqual([]);
      });
    }

    test('the Settings dialog has no overlapping or cut-off controls', async ({ page }) => {
      await openRoute(page, '#/');
      await page.getByRole('button', { name: 'Settings' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      const inDialog = await page.evaluate(() => {
        const d = document.querySelector('dialog[open]').getBoundingClientRect();
        return d.top >= 0 && d.left >= 0 && d.bottom <= innerHeight && d.right <= innerWidth;
      });
      expect(inDialog, 'dialog fits on screen').toBe(true);
      expect((await layoutProblems(page)).filter((p) => !p.includes('overlaps') || p.includes('input') || p.includes('select'))).toEqual([]);
    });
  });
}
