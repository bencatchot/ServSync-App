import { defineConfig, devices } from '@playwright/test';

function requireLocalBaseUrl(): string {
  if (process.env.TEST_APP_URL) {
    throw new Error('Controlled-ops browser pilot rejects TEST_APP_URL; use CONTROLLED_OPS_BROWSER_BASE_URL.');
  }
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    throw new Error('Controlled-ops browser pilot rejects Vercel bypass secrets.');
  }
  const value = process.env.CONTROLLED_OPS_BROWSER_BASE_URL;
  if (!value) throw new Error('CONTROLLED_OPS_BROWSER_BASE_URL is required.');
  const parsed = new URL(value);
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsed.hostname) || !parsed.port || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('CONTROLLED_OPS_BROWSER_BASE_URL must be plain loopback HTTP with an explicit port.');
  }
  return parsed.toString().replace(/\/$/, '');
}

const baseURL = requireLocalBaseUrl();

export default defineConfig({
  testDir: './tests/controlled-ops/browser-pilot',
  forbidOnly: true,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 30_000,
  reporter: [
    ['./scripts/controlled-ops/playwright-reporter.mjs', {
      baseURL,
      journalRoot: process.env.CONTROLLED_OPS_BROWSER_JOURNAL_ROOT,
      runLabel: process.env.CONTROLLED_OPS_BROWSER_RUN_LABEL ?? 'synthetic-form-submit',
    }],
  ],
  outputDir: process.env.CONTROLLED_OPS_BROWSER_OUTPUT_ROOT ?? '/tmp/servsync-controlled-ops-browser-output',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
