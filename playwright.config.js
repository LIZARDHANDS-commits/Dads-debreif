import { defineConfig, devices } from '@playwright/test';

// Browser tests run against the built site (`npm run build` first).
// Locally only Chromium is installed. CI's sign-off run adds the @smoke tests
// in Firefox and WebKit (docs/TESTING.md, section 2).
const CI = Boolean(process.env.CI);
// PW_PORT lets two worktrees run their tests at once without one testing the
// other's build (with reuseExistingServer, a server already on the port is used).
const PORT = Number(process.env.PW_PORT) || 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: CI,
  retries: 0,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: 'retain-on-failure',
    // Service workers are off unless a spec opts in: requests a worker makes
    // bypass page.route, so fixtures.js could neither stub them nor fail on them
    // (SOF saw WebKit fetch live MET Norway that way). Specs that test the offline
    // copy use test.use({ serviceWorkers: 'allow' }).
    serviceWorkers: 'block',
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
