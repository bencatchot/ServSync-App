import { defineConfig, devices } from '@playwright/test';
import { ensureMarketingAppUrl } from './helpers/marketingEnv';

const appUrl = ensureMarketingAppUrl();
const vercelBypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
const extraHTTPHeaders = vercelBypassSecret
  ? {
      'x-vercel-protection-bypass': vercelBypassSecret,
      'x-vercel-set-bypass-cookie': 'true',
    }
  : undefined;

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: appUrl,
    extraHTTPHeaders,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    screenshot: 'off',
    video: 'off',
    trace: 'off',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'tablet',
      use: { ...devices['iPad Pro 11'], viewport: { width: 834, height: 1112 } },
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone 12'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'social',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1200, height: 630 } },
    },
  ],
});
