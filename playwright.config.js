import { defineConfig, devices } from '@playwright/test';

// Browser tests run against the built site (`npm run build` first).
// Locally only Chromium is installed; CI also runs Firefox and WebKit (R1).
const CI = Boolean(process.env.CI);
const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: CI,
  retries: 0,
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
