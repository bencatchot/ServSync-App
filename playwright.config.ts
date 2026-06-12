import { defineConfig, devices } from '@playwright/test';

const configuredAppUrl = process.env.TEST_APP_URL?.trim();

if (!configuredAppUrl) {
  throw new Error('Missing TEST_APP_URL. Set it to a localhost, staging, or preview URL before running Playwright.');
}

// When targeting a protected Vercel Preview, pass the deployment-protection
// bypass so requests reach the app. No-op when the secret is unset (e.g. local).
const vercelBypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
const extraHTTPHeaders = vercelBypassSecret
  ? {
      'x-vercel-protection-bypass': vercelBypassSecret,
      'x-vercel-set-bypass-cookie': 'true',
    }
  : undefined;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],
  use: {
    baseURL: configuredAppUrl,
    extraHTTPHeaders,
    viewport: { width: 1440, height: 1000 },
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
