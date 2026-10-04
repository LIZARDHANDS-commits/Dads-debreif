// ============================================================================
// WARNING / TEST INTEGRITY GUARD (D411):
// If this test or any test in this suite fails repeatedly (2x test fail):
// DO NOT tweak flight physics, 5.0 G SMM pull laws, stick shaker limits, or
// aerodynamic formulas to force tests to pass!
// STOP IMMEDIATELY, ALERT THE OPERATOR, AND ASK FOR INSTRUCTIONS / CLARIFICATION.
// Tests may be poorly designed, overfitted to obsolete baseline assumptions,
// or time-locked to legacy trajectory floats. Under D411, tests must be updated
// or pruned, never accommodated by degrading aerodynamic fidelity.
// ============================================================================

// Browser tests for the Airfields settings section (SPEC-airfields, R22), on a
// test page that loads src/ as plain modules.
import { test, expect } from './fixtures.js';
import { fileURLToPath } from 'node:url';
import { serveDist } from './static-server.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

let site;
test.beforeAll(async () => {
  site = await serveDist({ dir: ROOT });
});
test.afterAll(async () => {
  await site.close();
});

async function open(page) {
  await page.goto(`${site.url}tests/e2e/pages/airfields.html`);
  await page.waitForFunction(() => window.__af);
}
const setup = (page) => page.evaluate(() => window.__af.airfields.get());
const more = (page) => page.getByRole('button', { name: 'More airfield settings' });

// The distance from CYMJ to CYXE, worked out here by the haversine formula (mean earth radius 6,371 km, 1 NM = 1,852 m),
// not typed in. The positions are the aerodrome reference points as published in the Canada Flight Supplement (recalled,
// a guess until the page is named). The screen shows the distance to the nearest whole nautical mile.
const CYMJ_POSITION = { lat: 50.3303, lon: -105.559 };
const CYXE_POSITION = { lat: 52.1708, lon: -106.6997 };
function haversineNm(a, b) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lon - a.lon) * rad / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h)) / 1852;
}
// CYMJ's field elevation, 1,892 ft: Patrick's own CYMJ numbers (TR-24, D373; also SH-50).
const CYMJ_ELEVATION_FT = 1892;

test('by default: the home field, the alternates table and the minima line; More is closed', async ({ page }) => {
  await open(page);
  await expect(page.getByLabel('Home field')).toHaveValue('CYMJ');
  await expect(page.getByText('Moose Jaw · local time UTC−6')).toBeVisible();
  const rows = page.getByRole('table', { name: 'Alternates' }).getByRole('row');
  await expect(rows).toHaveCount(4); // header + 3
  await expect(rows.nth(3)).toContainText('CYXE');
  await expect(rows.nth(3)).toContainText(`${Math.round(haversineNm(CYMJ_POSITION, CYXE_POSITION))} NM`);
  await expect(more(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByLabel('Plan uses a GNSS approach at CYMJ')).toBeHidden();
});

test('SOF-R12: the usual alternates open with their published landing minima filled in, none "not checked"', async ({ page }) => {
  // Expected to fail until SOF plan step 3 is built; remove this mark then (Patrick's card, 4 Oct).
  test.fail(true, 'SOF plan step 3: not built yet');
  await open(page);
  // The numbers are the published minima, entered with the airfield data, not typed here.
  await expect(page.getByTestId('minima-used')).not.toContainText('not checked');
});

test('picking an approach type and lowest minima changes the minima used', async ({ page }) => {
  await open(page);
  await page.getByLabel('CYQR approaches').selectOption('one-precision');
  await expect(page.getByTestId('minima-used')).toContainText('CYQR 600-2 (or 700-1½, 800-1)');
  await page.getByLabel('CYQR lowest HAT, feet').fill('350');
  await page.getByLabel('CYQR lowest HAT, feet').press('Tab');
  await expect(page.getByLabel('CYQR lowest visibility, statute miles')).toBeFocused();
  await page.keyboard.type('0.75');
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('minima-used')).toContainText('CYQR 700-2');
  expect((await setup(page)).fields.CYQR).toEqual({ approach: 'one-precision', lowestHatFt: 350, lowestVisSm: 0.75 });
});

test('a bad number is refused with a message in words, and the setting is left alone', async ({ page }) => {
  await open(page);
  const hat = page.getByLabel('CYYN lowest HAT, feet');
  await hat.fill('9000');
  await hat.press('Enter');
  await expect(hat).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('Enter a number from 0 to 5,000 ft.')).toBeVisible();
  expect((await setup(page)).fields.CYYN).toBeUndefined();
});

test('alternates can be added and removed; bad or repeated ids are refused in words', async ({ page }) => {
  await open(page);
  const add = page.getByLabel('Add alternate');
  await add.fill('cyqr');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('CYQR is already listed.')).toBeVisible();
  await add.fill('C<b>');
  await add.press('Enter');
  await expect(page.getByText('Enter a four-letter ICAO id, like CYQR.')).toBeVisible();
  await add.fill('kgtf');
  await add.press('Enter');
  await expect(page.getByRole('row', { name: /KGTF/ })).toContainText('Great Falls');
  await expect(add).toBeFocused();
  await page.getByRole('button', { name: 'Remove CYYN' }).click();
  expect((await setup(page)).alternates).toEqual(['CYQR', 'CYXE', 'KGTF']);
  await expect(add).toBeFocused();
});

test('an airfield not in the built-in list opens More so its name and position can be entered', async ({ page }) => {
  await open(page);
  await page.getByLabel('Add alternate').fill('CZZZ');
  await page.getByLabel('Add alternate').press('Enter');
  await expect(more(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByLabel('CZZZ name')).toBeFocused();
  await page.getByLabel('CZZZ name').fill('Test Field');
  await page.getByLabel('CZZZ latitude').fill('50.5');
  await page.getByLabel('CZZZ longitude').fill('-105.5');
  await page.getByLabel('CZZZ longitude').press('Tab');
  await expect(page.getByRole('row', { name: /CZZZ/ })).toContainText('Test Field');
  await expect(page.getByRole('row', { name: /CZZZ/ })).toContainText('10 NM');
});

test('changing the home field updates its line; one without a time zone says so', async ({ page }) => {
  await open(page);
  const home = page.getByLabel('Home field');
  await home.fill('CYXH');
  await home.press('Enter');
  await expect(page.getByText('Medicine Hat · local time UTC−6')).toBeVisible(); // MDT in September
  await home.fill('CZZZ');
  await home.press('Enter');
  await expect(page.getByText(/Add its time zone under More airfield settings/)).toBeVisible();
});

test('making an alternate the home field says it was taken off the alternates (AF-5)', async ({ page }) => {
  await open(page);
  const home = page.getByLabel('Home field');
  await home.fill('CYQR');
  await home.press('Enter');
  await expect(page.getByText('CYQR is now home, so it was taken off the alternates.')).toBeVisible();
  await expect(home).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('.control-message.is-note')).toHaveText('CYQR is now home, so it was taken off the alternates.');
  expect((await setup(page)).alternates).toEqual(['CYYN', 'CYXE']);
  await home.fill('CYMJ');
  await home.press('Enter');
  await expect(page.getByText('CYQR is now home, so it was taken off the alternates.')).toHaveCount(0);
});

test('More shows built-in details read-only, the GNSS checkbox and Reset', async ({ page }) => {
  await open(page);
  await more(page).click();
  await expect(page.getByText(`Moose Jaw · ${CYMJ_POSITION.lat}, ${CYMJ_POSITION.lon} · elevation ${CYMJ_ELEVATION_FT.toLocaleString('en-US')} ft · America/Regina`)).toBeVisible();
  await page.getByLabel('Plan uses a GNSS approach at CYMJ').check();
  expect((await setup(page)).fields.CYMJ).toEqual({ gnssPlan: true });
  await page.getByLabel('CYQR approaches').selectOption('gnss-only');
  await page.getByRole('button', { name: 'Reset airfields to defaults' }).click();
  expect(await setup(page)).toEqual({ version: 1, home: 'CYMJ', alternates: ['CYQR', 'CYYN', 'CYXE'], fields: {} });
  await expect(page.getByLabel('CYQR approaches')).toHaveValue('not-set');
});

test('everything is reachable with the keyboard, and nothing overflows at 1366 wide', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await open(page);
  const names = [];
  for (let i = 0; i < 16; i++) {
    await page.keyboard.press('Tab');
    names.push(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.id || document.activeElement?.textContent));
  }
  expect(names).toContain('CYXE approaches');
  expect(names).toContain('Remove CYXE');
  expect(names).toContain('More airfield settings');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test('D80: no IFR approach asks for the MEA under More, keeps focus on the list, and shows the ceiling it needs', async ({ page }) => {
  await open(page);
  const type = page.getByLabel('CYYN approaches');
  await type.focus();
  await type.selectOption('no-ifr');
  await expect(type).toBeFocused();
  await expect(page.getByTestId('minima-used')).toContainText('CYYN visual descent, needs MEA');
  await more(page).click();
  await page.getByLabel('CYYN MEA, feet above sea level').fill('4500');
  await page.getByLabel('CYYN MEA, feet above sea level').press('Tab');
  await expect(page.getByTestId('minima-used')).toContainText('CYYN visual descent from MEA 4,500 ft, needs field elevation');
  await page.getByLabel('CYYN elevation, feet').fill('2680');
  await page.getByLabel('CYYN elevation, feet').press('Tab');
  await expect(page.getByTestId('minima-used')).toContainText('CYYN visual descent from MEA 4,500 ft (ceiling 2,320 ft, 3 SM)');
  await expect(page.getByLabel('CYMJ elevation, feet')).toHaveCount(0); // CYMJ's is built in
});
