import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:8787',
    toHaveScreenshot: { maxDiffPixelRatio: 0.03, threshold: 0.2 },
  },
  snapshotDir: './e2e/__snapshots__',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
