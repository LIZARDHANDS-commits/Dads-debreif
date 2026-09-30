// Shared test setup: every browser test fails if the page logs an error or
// throws (R7). Import `test` and `expect` from here instead of @playwright/test.
import { test as base, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { serveMap } from './sof-map-feeds.js';

// The SOF asks MET Norway and Datamask for weather as it opens, and every spec
// that walks the routes opens it, so all of them get recorded weather instead
// of the live sites. A spec can add its own routes on top (the later one wins).
const sofFixture = (name) => readFileSync(new URL(`../fixtures/sof/${name}`, import.meta.url), 'utf8');
const CORS = { 'access-control-allow-origin': '*' };
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
// A 1×1 transparent PNG, for map tiles.
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

export const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(`page error: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console error: ${msg.text()}`);
    });
    // Anything that leaves this computer and has no stub below is answered with
    // 204 and fails the test by name, so a live site never decides a result.
    // Registered first, so every route below (and any a spec adds) wins over it.
    await page.route(
      (url) => /^https?:$/.test(url.protocol) && !LOCAL_HOSTS.has(url.hostname), // page.route never sees WebSockets
      (route) => {
        errors.push(`unmocked request: ${route.request().url()}`);
        return route.fulfill({ status: 204, headers: CORS });
      },
    );
    // Traffic's photo layer (Esri World Imagery tiles).
    await page.route(/^https:\/\/services\.arcgisonline\.com\//, (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', headers: CORS, body: ONE_PIXEL_PNG }));
    await page.route(/^https:\/\/api\.met\.no\//, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/plain',
        headers: CORS,
        body: sofFixture(route.request().url().includes('/taf?') ? 'screen-metno-taf.txt' : 'screen-metno-metar.txt'),
      }));
    await page.route(/^https:\/\/datamask\.org\//, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: sofFixture('screen-datamask-not-found.json') }));
    // The SOF's map asks ECCC, Esri and RainViewer as it opens: answered from fixtures too (sof-map-feeds.js).
    await serveMap(page);
    await use(page);
    expect(errors, 'the page logged errors').toEqual([]);
  },
});

export { expect };

// Runs axe (WCAG 2.0 A and AA rules) on the page as it is now and fails with a
// readable list: rule id, impact, what it means, and the elements affected.
// `exclude` is a list of CSS selectors to skip; use it only for a named,
// known problem with a TODO naming the rule, never to silence a whole rule.
export async function expectNoA11yViolations(page, { exclude = [] } = {}) {
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']);
  for (const selector of exclude) builder = builder.exclude(selector);
  const { violations } = await builder.analyze();
  const report = violations.map((v) => {
    const targets = v.nodes.map((n) => `    ${n.target.join(' ')}`).join('\n');
    return `${v.id} (${v.impact}): ${v.help}\n${targets}`;
  });
  expect(report, `accessibility violations:\n${report.join('\n')}`).toEqual([]);
}
