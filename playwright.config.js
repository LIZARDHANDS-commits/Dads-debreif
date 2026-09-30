import { defineConfig, devices } from '@playwright/test';

// Browser tests run against the built site (`npm run build` first).
// Locally only Chromium is installed; CI also runs Firefox and WebKit (R1).
const CI = Boolean(process.env.CI);
const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: CI,
  retries: 0,
  // Screenshot comparison (tests/e2e/visual.spec.js, D142). The reference
  // pictures are made on Linux and CI is Linux, so the file names carry no
  // platform. A small tolerance absorbs anti-aliasing differences between
  // machines; a moved or covered control is far larger than 1% of the page.
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, threshold: 0.2 } },
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !CI,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ...(CI
      ? [
          { name: 'firefox', use: { ...devices['Desktop Firefox'] }, grep: /@smoke/ },
          { name: 'webkit', use: { ...devices['Desktop Safari'] }, grep: /@smoke/ },
        ]
      : []),
  ],
});
