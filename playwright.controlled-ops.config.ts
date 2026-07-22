import { defineConfig, devices } from '@playwright/test';
import {
  assertBrowserLaunchContractFromEnv,
  assertNoProhibitedBrowserEnvironment,
} from './scripts/controlled-ops/browser-launch-policy.mjs';

function requireLocalBaseUrl(): string {
  assertNoProhibitedBrowserEnvironment(process.env);
  const { descriptor } = assertBrowserLaunchContractFromEnv(process.env);
  return descriptor.base_url;
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
      descriptorPath: process.env.CONTROLLED_OPS_BROWSER_LAUNCH_DESCRIPTOR,
      journalAuthSecret: process.env.CONTROLLED_OPS_BROWSER_JOURNAL_AUTH_SECRET,
      journalRoot: process.env.CONTROLLED_OPS_BROWSER_JOURNAL_ROOT,
      nonce: process.env.CONTROLLED_OPS_BROWSER_LAUNCH_NONCE,
      runLabel: process.env.CONTROLLED_OPS_BROWSER_RUN_LABEL ?? 'synthetic-form-submit',
    }],
  ],
  outputDir: process.env.CONTROLLED_OPS_BROWSER_OUTPUT_ROOT ?? '/tmp/servsync-controlled-ops-browser-output',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    screenshot: 'off',
    serviceWorkers: 'block',
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
